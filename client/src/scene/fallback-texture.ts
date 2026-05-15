import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  LinearFilter,
} from 'three';

/** Procedural flake board when catalog JPG is missing (e.g. local dev). */
export function createFallbackFlakeTexture(baseHex: string): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D context unavailable');
  }

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const flakes = 2800;
  for (let i = 0; i < flakes; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 2 + Math.random() * 5;
    const h = 1 + Math.random() * 3;
    const rot = Math.random() * Math.PI;
    const light = 0.55 + Math.random() * 0.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = `rgba(${Math.floor(40 + light * 180)}, ${Math.floor(40 + light * 170)}, ${Math.floor(35 + light * 160)}, ${0.35 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
