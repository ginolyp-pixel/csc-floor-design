import { env } from "../env.ts";

const MODEL_ID = "Xenova/slimsam-77-uniform";

type LazyTransformers = {
  SamModel: typeof import("@huggingface/transformers").SamModel;
  AutoProcessor: typeof import("@huggingface/transformers").AutoProcessor;
  RawImage: typeof import("@huggingface/transformers").RawImage;
  Tensor: typeof import("@huggingface/transformers").Tensor;
};

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

// Serialize all SAM work through one queue so two concurrent requests
// don't both kick off encoder runs and double-spike RAM.
let queueTail: Promise<unknown> = Promise.resolve();
function runQueued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueTail.then(() => fn(), () => fn());
  queueTail = next.catch(() => {});
  return next;
}

export type SegmentRequest = {
  points: [number, number][];
  labels: number[];
};

export type SegmentResult = {
  polygon: [number, number][];
  iou: number;
  mask_width: number;
  mask_height: number;
  encoder_ms: number;
  decoder_ms: number;
};

export async function segmentDesign(
  _designId: string,
  photoBuffer: Buffer,
  req: SegmentRequest,
): Promise<SegmentResult> {
  if (req.points.length === 0) throw new Error("at least one tap point required");
  if (req.points.length !== req.labels.length) throw new Error("points and labels length mismatch");

  return runQueued(async () => {
    const { model, processor, tx } = await loadModel();

    const t0 = Date.now();
    const raw = await tx.RawImage.fromBlob(new Blob([new Uint8Array(photoBuffer)]));
    const inputs = await processor(raw);
    const embeddings = await model.get_image_embeddings(inputs);
    const encoder_ms = Date.now() - t0;

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

    const t1 = Date.now();
    const outputs = await model({
      ...embeddings,
      input_points: inputPoints,
      input_labels: inputLabels,
    });
    const masks = await processor.post_process_masks(
      outputs.pred_masks,
      inputs.original_sizes,
      inputs.reshaped_input_sizes,
    );
    const decoder_ms = Date.now() - t1;

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
    return { polygon, iou: iouScores[bestIdx], mask_width: maskW, mask_height: maskH, encoder_ms, decoder_ms };
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
