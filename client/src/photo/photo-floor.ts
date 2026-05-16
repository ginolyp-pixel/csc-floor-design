/** Homography + CPU composite: project repeating flake texture onto a quadrilateral in a photo. */

export type Point2 = [number, number];

const TILE = 6;

/** 3×3 matrix as row-major arrays. */
function multiplyMatVec3(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
    m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
    m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
  ];
}

function invertMat3(m: number[][]): number[][] | null {
  const a = m[0]![0]!,
    b = m[0]![1]!,
    c = m[0]![2]!;
  const d = m[1]![0]!,
    e = m[1]![1]!,
    f = m[1]![2]!;
  const g = m[2]![0]!,
    h = m[2]![1]!,
    i = m[2]![2]!;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    [A * s, D * s, G * s],
    [B * s, E * s, H * s],
    [C * s, F * s, I * s],
  ];
}

/** Solve 8×8 system for homography from unit square corners to dst quad (row-major unknowns h0..h7, h8=1). */
function homographyUnitSquareToQuad(dst: Point2[]): number[][] {
  const src: Point2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k]!;
    const [X, Y] = dst[k]!;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = gaussianSolve8(A, b);
  return [
    [h[0]!, h[1]!, h[2]!],
    [h[3]!, h[4]!, h[5]!],
    [h[6]!, h[7]!, 1],
  ];
}

function gaussianSolve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    const div = M[col]![col]!;
    if (Math.abs(div) < 1e-14) {
      return new Array(8).fill(0);
    }
    for (let c = col; c <= n; c++) M[col]![c]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Point inside convex quad; corners in order around the perimeter. */
export function pointInQuad(px: number, py: number, q: Point2[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = q[i]!;
    const [x1, y1] = q[(i + 1) % 4]!;
    const c = cross2(x1 - x0, y1 - y0, px - x0, py - y0);
    if (c === 0) continue;
    if (sign === 0) sign = c > 0 ? 1 : -1;
    else if ((c > 0 ? 1 : -1) !== sign) return false;
  }
  return true;
}

/**
 * Point-in-polygon for arbitrary (possibly concave, possibly self-intersecting)
 * polygons using the standard ray-casting / even-odd fill rule.
 */
export function pointInPolygon(
  px: number,
  py: number,
  poly: Point2[],
): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
): [number, number, number] {
  const x = fract(u) * (w - 1);
  const y = fract(v) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = x - x0;
  const ty = y - y0;
  const idx = (xx: number, yy: number) => (yy * w + xx) * 4;
  const i00 = idx(x0, y0);
  const i10 = idx(x1, y0);
  const i01 = idx(x0, y1);
  const i11 = idx(x1, y1);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const r =
    mix(
      mix(data[i00]!, data[i10]!, tx),
      mix(data[i01]!, data[i11]!, tx),
      ty,
    ) / 255;
  const g =
    mix(
      mix(data[i00 + 1]!, data[i10 + 1]!, tx),
      mix(data[i01 + 1]!, data[i11 + 1]!, tx),
      ty,
    ) / 255;
  const bch =
    mix(
      mix(data[i00 + 2]!, data[i10 + 2]!, tx),
      mix(data[i01 + 2]!, data[i11 + 2]!, tx),
      ty,
    ) / 255;
  return [r, g, bch];
}

function bboxQuad(q: Point2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of q) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export type PhotoFloorRenderInput = {
  /** Working-size photo pixels (already scaled). */
  photoData: ImageData;
  /** Four floor corners in same pixel space as photoData, ordered around the quad. */
  quad: Point2[];
  /** Flake image RGBA */
  flakeData: ImageData;
  /** 0..1 blend of flake over concrete */
  blend?: number;
};

/**
 * Writes into `out` the photo with flake composited inside the quad (same dimensions as photoData).
 */
export function compositeFlakeOnPhoto(
  input: PhotoFloorRenderInput,
  out: ImageData,
): void {
  const { photoData, quad, flakeData } = input;
  const blend = input.blend ?? 0.58;
  const w = photoData.width;
  const h = photoData.height;
  const fw = flakeData.width;
  const fh = flakeData.height;
  const H = homographyUnitSquareToQuad(quad);
  const inv = invertMat3(H);
  if (!inv) {
    out.data.set(photoData.data);
    return;
  }

  out.data.set(photoData.data);
  const pd = photoData.data;
  const od = out.data;
  const { minX, minY, maxX, maxY } = bboxQuad(quad);
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(w - 1, Math.ceil(maxX));
  const y1 = Math.min(h - 1, Math.ceil(maxY));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!pointInQuad(x + 0.5, y + 0.5, quad)) continue;
      const [sx, sy, sw] = multiplyMatVec3(inv, [x, y, 1]);
      if (Math.abs(sw) < 1e-10) continue;
      const u = sx / sw;
      const v = sy / sw;
      const tu = u * TILE;
      const tv = v * TILE;
      const [fr, fg, fb] = sampleBilinear(flakeData.data, fw, fh, tu, tv);
      const i = (y * w + x) * 4;
      const br = pd[i]! / 255;
      const bg = pd[i + 1]! / 255;
      const bb = pd[i + 2]! / 255;
      od[i] = Math.round(255 * (br * (1 - blend) + fr * blend));
      od[i + 1] = Math.round(255 * (bg * (1 - blend) + fg * blend));
      od[i + 2] = Math.round(255 * (bb * (1 - blend) + fb * blend));
    }
  }
}

function bboxPolygon(poly: Point2[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export type PhotoFloorPolygonInput = {
  /** Working-size photo pixels (already scaled). */
  photoData: ImageData;
  /** Polygon vertices in working-photo pixel space (≥3, in order around the shape). */
  polygon: Point2[];
  /** Flake image RGBA */
  flakeData: ImageData;
  /** 0..1 blend of flake over concrete */
  blend?: number;
  /** Pixels per flake tile in screen-space (smaller = denser). Default 200. */
  tilePx?: number;
  /**
   * 0..1 strength of the "inherit the photo's lighting" effect — multiplies
   * each flake pixel by the underlying photo's luminance so shadows stay
   * dark and highlights stay bright. Default 0.8.
   */
  lightingStrength?: number;
  /**
   * 0..1 strength of the soft top-down clearcoat sheen. Default 0.12.
   */
  glossStrength?: number;
  /**
   * 0..1 strength of the ambient-occlusion darkening near polygon edges
   * (fakes shadow where the floor meets the wall). Default 0.35.
   */
  aoStrength?: number;
  /**
   * Pixel-width feather band along the polygon edge — the flake fades
   * back into the original photo over this distance instead of cutting
   * off as a hard outline. Default 8 px.
   */
  featherPx?: number;
  /**
   * 0..1 strength of fake vertical perspective: flake tiles shrink near the
   * top of the polygon (perceived "back" of the floor) and grow near the
   * bottom (perceived "front"). 0 = pure screen-space tiling (old behavior),
   * 1 = far-back tiles are ~⅓ the size of front tiles. Default 0.55.
   * Strict 2D approximation — doesn't account for horizontal vanishing
   * points, but handles the typical garage straight-on shot well.
   */
  perspectiveStrength?: number;
};

/**
 * Writes into `out` the photo with flake composited inside an arbitrary
 * polygon. Tiles the flake in screen-space (no perspective transform), so
 * the flake reads as the right colour but does not shrink with depth.
 *
 * Uses a scanline fill so the inner pixel loop runs once per pixel inside
 * the polygon, not once per pixel-times-edge as a naive point-in-polygon
 * approach would.
 */
export function compositeFlakeOnPhotoPolygon(
  input: PhotoFloorPolygonInput,
  out: ImageData,
): void {
  const { photoData, polygon, flakeData } = input;
  const blend = input.blend ?? 0.58;
  const tilePx = input.tilePx ?? 200;
  const lightingStrength = input.lightingStrength ?? 0.8;
  const glossStrength = input.glossStrength ?? 0.12;
  const aoStrength = input.aoStrength ?? 0.35;
  const featherPx = Math.max(0, input.featherPx ?? 8);
  const perspectiveStrength = Math.max(0, Math.min(1, input.perspectiveStrength ?? 0.55));
  const w = photoData.width;
  const h = photoData.height;
  const fw = flakeData.width;
  const fh = flakeData.height;

  out.data.set(photoData.data);
  if (polygon.length < 3) return;

  const pd = photoData.data;
  const od = out.data;
  const { minX, minY, maxX, maxY } = bboxPolygon(polygon);
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(h - 1, Math.ceil(maxY));
  const polyH = Math.max(1, maxY - minY);
  // AO band width — pixels from the polygon edge that get darkened.
  const aoBandPx = Math.max(2, Math.min(maxX - minX, polyH) * 0.04);

  const xs: number[] = [];
  for (let y = yStart; y <= yEnd; y++) {
    const ys = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]!;
      const [xj, yj] = polygon[j]!;
      if (yi > ys !== yj > ys) {
        xs.push(((xj - xi) * (ys - yi)) / (yj - yi) + xi);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);

    // Soft top-down clearcoat sheen — brighter near the back of the
    // outline (where overhead light would catch the gloss), fading down.
    const yNorm = (y - minY) / polyH;
    const gloss = glossStrength * Math.max(0, 1 - yNorm * 1.4);

    // Fake vertical perspective: flake tiles shrink toward the top of the
    // polygon (back of the floor). minScale at the far back, 1.0 at the
    // front. perspectiveStrength=0 leaves tiles uniform (old behavior).
    const minScale = 1 - perspectiveStrength * 0.65;
    const tileScale = minScale + (1 - minScale) * yNorm;
    const effTilePx = tilePx * tileScale;
    // Vertical AO factor: 1 in the middle, 0 right at the top/bottom edge.
    const dyTop = y - minY;
    const dyBot = maxY - y;
    const yEdgeDist = Math.min(dyTop, dyBot);
    const yAo = Math.min(1, yEdgeDist / aoBandPx);

    for (let k = 0; k + 1 < xs.length; k += 2) {
      const segLeft = xs[k]!;
      const segRight = xs[k + 1]!;
      const xStart = Math.max(0, Math.ceil(segLeft));
      const xEnd = Math.min(w - 1, Math.floor(segRight));
      for (let x = xStart; x <= xEnd; x++) {
        const u = x / effTilePx;
        const v = y / effTilePx;
        const [fr, fg, fb] = sampleBilinear(flakeData.data, fw, fh, u, v);
        const i = (y * w + x) * 4;
        const pr = pd[i]! / 255;
        const pg = pd[i + 1]! / 255;
        const pb = pd[i + 2]! / 255;

        // (1) Inherit the photo's per-pixel lighting via Rec.709 luminance.
        // photoLum is 0..1; map to a multiplier centered around 1.0 so
        // mid-gray concrete leaves the flake unchanged, brighter spots
        // brighten the flake, shadows darken it.
        const photoLum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
        const lightMult = 1 + lightingStrength * (photoLum * 2 - 1);

        // (2) Edge AO — darken pixels within `aoBandPx` of any polygon edge.
        const xEdgeDist = Math.min(x - segLeft, segRight - x);
        const xAo = Math.min(1, xEdgeDist / aoBandPx);
        const ao = 1 - aoStrength * (1 - Math.min(xAo, yAo));

        // Combined: flake * photo lighting * AO + soft top sheen.
        let litR = fr * lightMult * ao + gloss;
        let litG = fg * lightMult * ao + gloss;
        let litB = fb * lightMult * ao + gloss;
        if (litR < 0) litR = 0;
        else if (litR > 1) litR = 1;
        if (litG < 0) litG = 0;
        else if (litG > 1) litG = 1;
        if (litB < 0) litB = 0;
        else if (litB > 1) litB = 1;

        // (3) Edge feather — fade the flake back into the original photo
        // along the polygon boundary so the outline doesn't look razor-cut.
        // Smoothstep gives a softer, more natural falloff than a linear ramp.
        const edgeDistPx = Math.min(xEdgeDist, dyTop, dyBot);
        let feather =
          featherPx > 0 ? Math.min(1, edgeDistPx / featherPx) : 1;
        feather = feather * feather * (3 - 2 * feather);
        const a = blend * feather;

        od[i] = Math.round(255 * (pr * (1 - a) + litR * a));
        od[i + 1] = Math.round(255 * (pg * (1 - a) + litG * a));
        od[i + 2] = Math.round(255 * (pb * (1 - a) + litB * a));
      }
    }
  }
}

/** Scale image to max dimension; returns canvas ImageData. */
export function imageToWorkingData(
  img: HTMLImageElement,
  maxDim: number,
): { data: ImageData; scale: number; drawW: number; drawH: number } {
  let dw = img.naturalWidth;
  let dh = img.naturalHeight;
  if (dw <= 0 || dh <= 0) {
    dw = 800;
    dh = 600;
  }
  const scale = Math.min(1, maxDim / Math.max(dw, dh));
  const drawW = Math.round(dw * scale);
  const drawH = Math.round(dh * scale);
  const c = document.createElement('canvas');
  c.width = drawW;
  c.height = drawH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(img, 0, 0, drawW, drawH);
  return { data: ctx.getImageData(0, 0, drawW, drawH), scale, drawW, drawH };
}

export function imageElementToFlakeData(img: HTMLImageElement): ImageData {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

/** Rasterize any `CanvasImageSource` (image, bitmap, canvas, etc.) for sampling. */
export function sourceToImageData(source: CanvasImageSource): ImageData {
  const w =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth || source.width
        : (source as HTMLCanvasElement).width;
  const h =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight || source.height
        : (source as HTMLCanvasElement).height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}
