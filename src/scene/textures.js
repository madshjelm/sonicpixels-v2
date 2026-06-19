import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

// A white rounded-square sprite: crisp edges, gently rounded corners.
// instanceColor tints it, so the tile reads as a flat solid-colour chip.
export function makeTileTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const pad = size * 0.06;
  const r = size * 0.16;
  roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

// A soft, blurred dark square used as the drop shadow behind each tile.
export function makeShadowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const pad = size * 0.14;
  const r = size * 0.2;
  ctx.filter = `blur(${size * 0.08}px)`;
  roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, r);
  ctx.fillStyle = '#1c1b33';
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
