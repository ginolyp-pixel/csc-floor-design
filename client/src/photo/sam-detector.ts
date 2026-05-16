/**
 * Browser-side SAM (Segment Anything) floor detector. Loads transformers.js
 * from CDN on demand — none of this lives in the main bundle. Intended for
 * desktop only (the model + encoder use too much memory for typical phones).
 */
import type { Point2 } from "./photo-floor";

type LazyTransformers = {
  SamModel: any;
  AutoProcessor: any;
  RawImage: any;
  Tensor: any;
  env: any;
};

const MODEL_ID = "Xenova/slimsam-77-uniform";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0";

let txPromise: Promise<LazyTransformers> | null = null;

async function loadTransformers(): Promise<LazyTransformers> {
  if (!txPromise) {
    txPromise = (async () => {
      // @vite-ignore — runtime CDN load, intentionally not bundled.
      const m = await import(/* @vite-ignore */ TRANSFORMERS_URL);
      const tx = m as LazyTransformers;
      // Persist HuggingFace model files in browser IndexedDB so repeat visits
      // hit the cache instantly instead of redownloading ~40 MB.
      tx.env.allowLocalModels = false;
      tx.env.useBrowserCache = true;
      return tx;
    })();
  }
  return txPromise;
}

export type SamStatus =
  | { kind: "loading-model" }
  | { kind: "encoding-photo" }
  | { kind: "ready" }
  | { kind: "segmenting" }
  | { kind: "error"; message: string };

export type SamDetector = {
  /**
   * Set the photo for subsequent segments. Runs the image encoder once.
   * Subsequent segment() calls reuse the cached embeddings.
   */
  setPhoto(canvas: HTMLCanvasElement): Promise<void>;
  /**
   * Run the decoder against the current photo's cached embeddings.
   * Returns the polygon of the best mask in canvas-pixel coords.
   */
  segment(points: Point2[], labels: number[]): Promise<Point2[]>;
  /** Drop in-memory state — call when photo mode is left or photo removed. */
  reset(): void;
};

export async function createSamDetector(
  onStatus: (s: SamStatus) => void,
): Promise<SamDetector> {
  onStatus({ kind: "loading-model" });
  let tx: LazyTransformers;
  let model: any;
  let processor: any;
  try {
    tx = await loadTransformers();
    model = await tx.SamModel.from_pretrained(MODEL_ID);
    processor = await tx.AutoProcessor.from_pretrained(MODEL_ID);
  } catch (err) {
    onStatus({ kind: "error", message: `Couldn't load auto-detect: ${(err as Error).message}` });
    throw err;
  }

  let imageEmbeddings: any = null;
  let originalSizes: any = null;
  let reshapedInputSizes: any = null;
  let lastCanvasW = 0;
  let lastCanvasH = 0;

  return {
    setPhoto: async (canvas) => {
      onStatus({ kind: "encoding-photo" });
      try {
        const raw = await tx.RawImage.fromCanvas(canvas);
        const inputs = await processor(raw);
        imageEmbeddings = await model.get_image_embeddings(inputs);
        originalSizes = inputs.original_sizes;
        reshapedInputSizes = inputs.reshaped_input_sizes;
        lastCanvasW = canvas.width;
        lastCanvasH = canvas.height;
        onStatus({ kind: "ready" });
      } catch (err) {
        onStatus({ kind: "error", message: `Photo analysis failed: ${(err as Error).message}` });
        throw err;
      }
    },
    segment: async (points, labels) => {
      if (!imageEmbeddings) throw new Error("No photo set — call setPhoto first");
      onStatus({ kind: "segmenting" });
      try {
        const inputPoints = new tx.Tensor(
          "float32",
          new Float32Array(points.flatMap((p) => [p[0], p[1]])),
          [1, 1, points.length, 2],
        );
        const inputLabels = new tx.Tensor(
          "int64",
          new BigInt64Array(labels.map((l) => BigInt(l))),
          [1, 1, labels.length],
        );
        const outputs = await model({
          ...imageEmbeddings,
          input_points: inputPoints,
          input_labels: inputLabels,
        });
        const masks = await processor.post_process_masks(
          outputs.pred_masks,
          originalSizes,
          reshapedInputSizes,
        );
        const iouScores = outputs.iou_scores.data as Float32Array;
        let bestIdx = 0;
        for (let i = 1; i < iouScores.length; i++) if (iouScores[i] > iouScores[bestIdx]) bestIdx = i;

        const maskTensor = masks[0];
        const dims = maskTensor.dims;
        const mh = dims[dims.length - 2];
        const mw = dims[dims.length - 1];
        const planeSize = mh * mw;
        const offset = bestIdx * planeSize;
        const maskBytes = new Uint8Array(planeSize);
        const src = maskTensor.data as Uint8Array;
        for (let i = 0; i < planeSize; i++) maskBytes[i] = src[offset + i] ? 1 : 0;
        const poly = extractPolygonFromMask(maskBytes, mw, mh);

        // Scale polygon from mask coords to canvas coords. post_process_masks
        // returns masks at the original-image size; canvas dims should match.
        const scaleX = lastCanvasW / mw;
        const scaleY = lastCanvasH / mh;
        const canvasPoly: Point2[] = poly.map(([x, y]) => [x * scaleX, y * scaleY]);

        onStatus({ kind: "ready" });
        return canvasPoly;
      } catch (err) {
        onStatus({ kind: "error", message: `Segmentation failed: ${(err as Error).message}` });
        throw err;
      }
    },
    reset: () => {
      imageEmbeddings = null;
      originalSizes = null;
      reshapedInputSizes = null;
    },
  };
}

function extractPolygonFromMask(mask: Uint8Array, w: number, h: number): Point2[] {
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return [];

  const inMask = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] > 0;
  const dirs: [number, number][] = [ [1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1] ];
  const path: Point2[] = [];
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

function douglasPeucker(pts: Point2[], epsilon: number): Point2[] {
  if (pts.length < 3) return pts;
  const sqEps = epsilon * epsilon;
  function recurse(start: number, end: number): Point2[] {
    let maxSqDist = 0, idx = -1;
    const [ax, ay] = pts[start]!;
    const [bx, by] = pts[end]!;
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy || 1e-9;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = pts[i]!;
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
    return [pts[start]!, pts[end]!];
  }
  return recurse(0, pts.length - 1);
}
