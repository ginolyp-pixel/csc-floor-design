import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.ts";

const MODEL_ID = "Xenova/slimsam-77-uniform";

// transformers.js exports — these come with their own typing but we import
// dynamically so the module isn't pulled in until the first segment request,
// avoiding ~150 MB of native bindings on cold start.
type LazyTransformers = {
  SamModel: typeof import("@huggingface/transformers").SamModel;
  AutoProcessor: typeof import("@huggingface/transformers").AutoProcessor;
  RawImage: typeof import("@huggingface/transformers").RawImage;
  Tensor: typeof import("@huggingface/transformers").Tensor;
};

const EMBEDDINGS_DIR = join(env.DATA_DIR, "embeddings");
mkdirSync(EMBEDDINGS_DIR, { recursive: true });

let modelPromise: Promise<{ model: any; processor: any; tx: LazyTransformers }> | null = null;
async function loadModel() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const tx = (await import("@huggingface/transformers")) as unknown as LazyTransformers & { env: any };
    // Cache HF model downloads inside our DATA_DIR so a deploy that nukes
    // /tmp or ~/.cache doesn't re-download 40 MB on next boot.
    (tx as any).env.cacheDir = join(env.DATA_DIR, "hf-cache");
    const model = await tx.SamModel.from_pretrained(MODEL_ID);
    const processor = await tx.AutoProcessor.from_pretrained(MODEL_ID);
    return { model, processor, tx };
  })();
  return modelPromise;
}

// Serialize all SAM work through one queue: only one encoder or decoder run
// at a time. This is the safety valve against two simultaneous customers
// both kicking off an encoder run and double-spiking RAM.
let queueTail: Promise<unknown> = Promise.resolve();
function runQueued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueTail.then(() => fn(), () => fn());
  queueTail = next.catch(() => { /* swallow so a failed job doesn't poison the queue */ });
  return next;
}

type CachedEmbedding = {
  embeddings_bin: Buffer;
  embeddings_shape: number[];
  original_w: number;
  original_h: number;
  reshaped_w: number;
  reshaped_h: number;
};

function embedPath(designId: string): string {
  return join(EMBEDDINGS_DIR, `${designId}.bin`);
}

function writeEmbedding(designId: string, cached: CachedEmbedding): void {
  // Binary layout: [4 byte magic 'SAM1'][2 byte shape_len][shape ints u32]
  //   [2 byte sizes: original_w, original_h, reshaped_w, reshaped_h u32]
  //   [embeddings_bin raw float32 LE]
  const shape = cached.embeddings_shape;
  const headerSize = 4 + 2 + shape.length * 4 + 4 * 4;
  const header = Buffer.alloc(headerSize);
  let off = 0;
  header.write("SAM1", off); off += 4;
  header.writeUInt16LE(shape.length, off); off += 2;
  for (const s of shape) { header.writeUInt32LE(s, off); off += 4; }
  header.writeUInt32LE(cached.original_w, off); off += 4;
  header.writeUInt32LE(cached.original_h, off); off += 4;
  header.writeUInt32LE(cached.reshaped_w, off); off += 4;
  header.writeUInt32LE(cached.reshaped_h, off); off += 4;
  writeFileSync(embedPath(designId), Buffer.concat([header, cached.embeddings_bin]));
}

function readEmbedding(designId: string): CachedEmbedding | null {
  const path = embedPath(designId);
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  let off = 0;
  if (buf.toString("utf8", 0, 4) !== "SAM1") return null;
  off += 4;
  const shapeLen = buf.readUInt16LE(off); off += 2;
  const shape: number[] = [];
  for (let i = 0; i < shapeLen; i++) { shape.push(buf.readUInt32LE(off)); off += 4; }
  const original_w = buf.readUInt32LE(off); off += 4;
  const original_h = buf.readUInt32LE(off); off += 4;
  const reshaped_w = buf.readUInt32LE(off); off += 4;
  const reshaped_h = buf.readUInt32LE(off); off += 4;
  const embeddings_bin = buf.subarray(off);
  return { embeddings_bin, embeddings_shape: shape, original_w, original_h, reshaped_w, reshaped_h };
}

export async function ensureEmbedding(designId: string, photoBuffer: Buffer): Promise<CachedEmbedding> {
  const existing = readEmbedding(designId);
  if (existing) return existing;
  return runQueued(async () => {
    // Double-check inside the lock — another request may have just produced it.
    const stillExisting = readEmbedding(designId);
    if (stillExisting) return stillExisting;
    const { model, processor, tx } = await loadModel();
    const raw = await tx.RawImage.fromBlob(new Blob([new Uint8Array(photoBuffer)]));
    const inputs = await processor(raw);
    const embeddings = await model.get_image_embeddings(inputs);

    const embTensor = embeddings.image_embeddings;
    const cached: CachedEmbedding = {
      embeddings_bin: Buffer.from(new Float32Array(embTensor.data).buffer),
      embeddings_shape: Array.from(embTensor.dims),
      original_w: Number(inputs.original_sizes[0][1]),
      original_h: Number(inputs.original_sizes[0][0]),
      reshaped_w: Number(inputs.reshaped_input_sizes[0][1]),
      reshaped_h: Number(inputs.reshaped_input_sizes[0][0]),
    };
    writeEmbedding(designId, cached);
    return cached;
  });
}

export type SegmentRequest = {
  points: [number, number][]; // photo-pixel coords
  labels: number[];           // 1 = include, 0 = exclude
};

export type SegmentResult = {
  polygon: [number, number][];
  iou: number;
  mask_width: number;
  mask_height: number;
  encoder_ms: number | null; // null if served from cache
  decoder_ms: number;
};

export async function segmentWithEmbedding(
  cached: CachedEmbedding,
  req: SegmentRequest,
): Promise<{ maskBytes: Uint8Array; maskW: number; maskH: number; iou: number; decoderMs: number }> {
  if (req.points.length === 0) throw new Error("at least one tap point required");
  if (req.points.length !== req.labels.length) throw new Error("points and labels length mismatch");
  return runQueued(async () => {
    const { model, processor, tx } = await loadModel();

    // Copy into a fresh Float32Array. Our packed header puts the bin section
    // at byteOffset 38, which is not a multiple of 4 — direct typed-array
    // construction errors with "start offset should be a multiple of 4".
    const float32Buf = new Float32Array(cached.embeddings_bin.byteLength / 4);
    new Uint8Array(float32Buf.buffer).set(cached.embeddings_bin);
    const embTensor = new tx.Tensor("float32", float32Buf, cached.embeddings_shape);

    const inputPoints = new tx.Tensor(
      "float32",
      new Float32Array(req.points.flat()),
      [1, 1, req.points.length, 2],
    );
    const inputLabels = new tx.Tensor(
      "int64",
      new BigInt64Array(req.labels.map((l) => BigInt(l))),
      [1, 1, req.labels.length],
    );

    // transformers.js's SlimSAM forward() always wants pixel_values as input.
    // When image_embeddings is provided the model SHOULD use the cache and
    // not actually look at pixel_values — pass a zero tensor at the expected
    // 1024×1024×3 shape so the input-presence check passes.
    const pixelValues = new tx.Tensor(
      "float32",
      new Float32Array(3 * 1024 * 1024),
      [1, 3, 1024, 1024],
    );

    const t0 = Date.now();
    const outputs = await model({
      pixel_values: pixelValues,
      image_embeddings: embTensor,
      input_points: inputPoints,
      input_labels: inputLabels,
    });
    const masks = await processor.post_process_masks(
      outputs.pred_masks,
      [[cached.original_h, cached.original_w]],
      [[cached.reshaped_h, cached.reshaped_w]],
    );
    const decoderMs = Date.now() - t0;

    const iouScores = outputs.iou_scores.data as Float32Array;
    let bestIdx = 0;
    for (let i = 1; i < iouScores.length; i++) if (iouScores[i] > iouScores[bestIdx]) bestIdx = i;

    const maskTensor = masks[0];
    const dims = maskTensor.dims;
    const maskH = dims[dims.length - 2];
    const maskW = dims[dims.length - 1];
    const planeSize = maskH * maskW;
    const offset = bestIdx * planeSize;
    const maskBytes = new Uint8Array(planeSize);
    const src = maskTensor.data as Uint8Array;
    for (let i = 0; i < planeSize; i++) maskBytes[i] = src[offset + i] ? 1 : 0;

    return { maskBytes, maskW, maskH, iou: iouScores[bestIdx], decoderMs };
  });
}

// ----- Polygon extraction -----------------------------------------------

function extractPolygonFromMask(mask: Uint8Array, w: number, h: number): [number, number][] {
  // Find leftmost-topmost pixel as start.
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return [];

  const inMask = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] > 0;
  const dirs: [number, number][] = [ [1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1] ];
  const path: [number, number][] = [];
  let cx = sx, cy = sy, dir = 6;
  const maxSteps = 4 * (w + h);
  for (let step = 0; step < maxSteps; step++) {
    path.push([cx, cy]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const ndir = (dir + 6 + k) % 8;
      const nx = cx + dirs[ndir][0];
      const ny = cy + dirs[ndir][1];
      if (inMask(nx, ny)) {
        cx = nx; cy = ny;
        dir = ndir;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (path.length > 4 && cx === sx && cy === sy) break;
  }
  return douglasPeucker(path, 3);
}

function douglasPeucker(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length < 3) return pts;
  const sqEps = epsilon * epsilon;
  function recurse(start: number, end: number): [number, number][] {
    let maxSqDist = 0, idx = -1;
    const [ax, ay] = pts[start];
    const [bx, by] = pts[end];
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy || 1e-9;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = pts[i];
      const t = ((px - ax) * dx + (py - ay) * dy) / denom;
      const cx = ax + t * dx, cy = ay + t * dy;
      const sqD = (px - cx) ** 2 + (py - cy) ** 2;
      if (sqD > maxSqDist) { maxSqDist = sqD; idx = i; }
    }
    if (maxSqDist > sqEps && idx > 0) {
      const left = recurse(start, idx);
      const right = recurse(idx, end);
      return left.slice(0, -1).concat(right);
    }
    return [pts[start], pts[end]];
  }
  return recurse(0, pts.length - 1);
}

export async function segmentDesign(
  designId: string,
  photoBuffer: Buffer,
  req: SegmentRequest,
): Promise<SegmentResult> {
  const hadEmbedding = !!readEmbedding(designId);
  const t0 = Date.now();
  const cached = await ensureEmbedding(designId, photoBuffer);
  const encoderMs = hadEmbedding ? null : Date.now() - t0;

  const { maskBytes, maskW, maskH, iou, decoderMs } = await segmentWithEmbedding(cached, req);
  const polygon = extractPolygonFromMask(maskBytes, maskW, maskH);

  return { polygon, iou, mask_width: maskW, mask_height: maskH, encoder_ms: encoderMs, decoder_ms: decoderMs };
}
