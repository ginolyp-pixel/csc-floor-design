import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.ts";

const MODEL_ID = "Xenova/slimsam-77-uniform";

type LazyTransformers = {
  SamModel: typeof import("@huggingface/transformers").SamModel;
  AutoProcessor: typeof import("@huggingface/transformers").AutoProcessor;
  RawImage: typeof import("@huggingface/transformers").RawImage;
  Tensor: typeof import("@huggingface/transformers").Tensor;
};

const CACHE_DIR = join(env.DATA_DIR, "sam-cache");
mkdirSync(CACHE_DIR, { recursive: true });

let modelPromise: Promise<{ model: any; processor: any; tx: LazyTransformers }> | null = null;
async function loadModel() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const tx = (await import("@huggingface/transformers")) as unknown as LazyTransformers & { env: any };
    (tx as any).env.cacheDir = `${env.DATA_DIR}/hf-cache`;
    const model = await tx.SamModel.from_pretrained(MODEL_ID);
    const processor = await tx.AutoProcessor.from_pretrained(MODEL_ID);
    return { model, processor, tx };
  })();
  return modelPromise;
}

let queueTail: Promise<unknown> = Promise.resolve();
function runQueued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueTail.then(() => fn(), () => fn());
  queueTail = next.catch(() => {});
  return next;
}

// ----- Multi-tensor disk cache ------------------------------------------

type DType = "float32" | "int64" | "float64" | "int32" | "uint8";
const DTYPE_TO_TA: Record<DType, any> = {
  float32: Float32Array,
  int64: BigInt64Array,
  float64: Float64Array,
  int32: Int32Array,
  uint8: Uint8Array,
};

type TensorInfo = { dtype: DType; dims: number[]; offset: number; byteLength: number };
type Manifest = {
  tensors: Record<string, TensorInfo>;
  original_sizes: number[][];
  reshaped_input_sizes: number[][];
};

function tensorByteLen(t: any): number {
  const data = t.data;
  return data.byteLength ?? (data.length * (DTYPE_TO_TA[t.type as DType]?.BYTES_PER_ELEMENT ?? 4));
}

function tensorBuffer(t: any): Buffer {
  const data = t.data;
  if (data instanceof Buffer) return data;
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

function serializeCache(
  tensors: Record<string, any>,
  original_sizes: number[][],
  reshaped_input_sizes: number[][],
): Buffer {
  const manifest: Manifest = { tensors: {}, original_sizes, reshaped_input_sizes };
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const [name, t] of Object.entries(tensors)) {
    const buf = tensorBuffer(t);
    const pad = (8 - (offset % 8)) % 8;
    if (pad > 0) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    manifest.tensors[name] = { dtype: t.type as DType, dims: Array.from(t.dims), offset, byteLength: buf.length };
    chunks.push(buf);
    offset += buf.length;
  }
  const json = Buffer.from(JSON.stringify(manifest), "utf-8");
  const head = Buffer.alloc(8);
  head.write("SAM4", 0);
  head.writeUInt32LE(json.length, 4);
  const headerSize = head.length + json.length;
  const headerPad = (8 - (headerSize % 8)) % 8;
  return Buffer.concat([head, json, Buffer.alloc(headerPad), ...chunks]);
}

function deserializeCache(buf: Buffer, tx: LazyTransformers): {
  tensors: Record<string, any>;
  original_sizes: number[][];
  reshaped_input_sizes: number[][];
} {
  if (buf.toString("utf-8", 0, 4) !== "SAM4") throw new Error("bad cache magic");
  const jsonLen = buf.readUInt32LE(4);
  const manifest: Manifest = JSON.parse(buf.toString("utf-8", 8, 8 + jsonLen));
  const headerSize = 8 + jsonLen;
  const headerPad = (8 - (headerSize % 8)) % 8;
  const dataStart = headerSize + headerPad;

  const tensors: Record<string, any> = {};
  for (const [name, info] of Object.entries(manifest.tensors)) {
    const TA = DTYPE_TO_TA[info.dtype];
    if (!TA) throw new Error(`unknown dtype ${info.dtype}`);
    // Copy into a fresh typed array — guarantees alignment regardless of
    // the source Buffer's byteOffset.
    const arr = new TA(info.byteLength / TA.BYTES_PER_ELEMENT);
    const view = new Uint8Array(arr.buffer);
    view.set(buf.subarray(dataStart + info.offset, dataStart + info.offset + info.byteLength));
    tensors[name] = new tx.Tensor(info.dtype, arr, info.dims);
  }
  return { tensors, original_sizes: manifest.original_sizes, reshaped_input_sizes: manifest.reshaped_input_sizes };
}

function cachePath(designId: string): string {
  return join(CACHE_DIR, `${designId}.sam4`);
}

// ----- Public API -------------------------------------------------------

export type SegmentRequest = {
  points: [number, number][];
  labels: number[];
};

export type SegmentResult = {
  polygon: [number, number][];
  iou: number;
  mask_width: number;
  mask_height: number;
  encoder_ms: number | null;
  decoder_ms: number;
  model_load_ms: number | null;
};

let modelLoadedOnce = false;

export async function segmentDesign(
  designId: string,
  photoBuffer: Buffer,
  req: SegmentRequest,
): Promise<SegmentResult> {
  if (req.points.length === 0) throw new Error("at least one tap point required");
  if (req.points.length !== req.labels.length) throw new Error("points and labels length mismatch");

  return runQueued(async () => {
    const tLoad0 = Date.now();
    const { model, processor, tx } = await loadModel();
    const model_load_ms = modelLoadedOnce ? null : Date.now() - tLoad0;
    modelLoadedOnce = true;

    // Try cache. If present, skip the encoder entirely — pass all cached
    // tensors to model() and let forward() use image_embeddings as a hint
    // to bypass the encoder.
    const path = cachePath(designId);
    let cached: ReturnType<typeof deserializeCache> | null = null;
    let encoder_ms: number | null = null;

    if (existsSync(path)) {
      try {
        cached = deserializeCache(readFileSync(path), tx);
      } catch (err) {
        // Corrupted cache — fall through to recompute.
        cached = null;
      }
    }

    let modelInputs: Record<string, any>;
    let original_sizes: number[][];
    let reshaped_input_sizes: number[][];

    if (cached) {
      modelInputs = { ...cached.tensors };
      original_sizes = cached.original_sizes;
      reshaped_input_sizes = cached.reshaped_input_sizes;
    } else {
      const tEnc0 = Date.now();
      const raw = await tx.RawImage.fromBlob(new Blob([new Uint8Array(photoBuffer)]));
      const inputs = await processor(raw);
      const embeddings = await model.get_image_embeddings(inputs);
      encoder_ms = Date.now() - tEnc0;

      // Cache pixel_values + every key returned by get_image_embeddings.
      // We don't hard-code the encoder output keys — SlimSAM returns
      // image_embeddings + image_positional_embeddings; other variants
      // may differ.
      const toCache: Record<string, any> = { pixel_values: inputs.pixel_values };
      for (const key of Object.keys(embeddings)) toCache[key] = embeddings[key];

      original_sizes = inputs.original_sizes;
      reshaped_input_sizes = inputs.reshaped_input_sizes;
      try {
        writeFileSync(path, serializeCache(toCache, original_sizes, reshaped_input_sizes));
      } catch (err) {
        // Cache write failures are non-fatal — the segment call still works.
      }

      modelInputs = { ...toCache };
    }

    modelInputs.input_points = new tx.Tensor(
      "float32",
      new Float32Array(req.points.flat()),
      [1, 1, req.points.length, 2],
    );
    modelInputs.input_labels = new tx.Tensor(
      "int64",
      new BigInt64Array(req.labels.map((l) => BigInt(l))),
      [1, 1, req.labels.length],
    );

    const tDec0 = Date.now();
    const outputs = await model(modelInputs);
    const masks = await processor.post_process_masks(
      outputs.pred_masks,
      original_sizes,
      reshaped_input_sizes,
    );
    const decoder_ms = Date.now() - tDec0;

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

    const polygon = extractPolygonFromMask(maskBytes, maskW, maskH);
    return {
      polygon,
      iou: iouScores[bestIdx],
      mask_width: maskW,
      mask_height: maskH,
      encoder_ms,
      decoder_ms,
      model_load_ms,
    };
  });
}

function extractPolygonFromMask(mask: Uint8Array, w: number, h: number): [number, number][] {
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
