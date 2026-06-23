import { Color } from 'three';
import { ACCENTS, PALETTE, paletteRamp } from '../config.js';

const SURFACE = new Color(PALETTE.surface);
const accent = (i) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];

// Is a normalized point inside the (optional) carved-out header rectangle?
function inExclude(nx, ny, ex) {
  return ex && Math.abs(nx - ex.cx) <= ex.hw && Math.abs(ny - ex.cy) <= ex.hh;
}

/**
 * Every layout fills `ctx.region` — a normalized rectangle ({cx,cy,hw,hh} in
 * [-1,1]) computed by main from the measured header / tuner / player, so the
 * tiles stay clear of the UI and fill deliberately at any screen size.
 * `ctx.exclude` optionally carves out the header box.
 */

// Audio — spectrum analyzer grid that fills the region exactly.
function audioLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH, region } = ctx;
  const stepX = (2 * region.hw * worldHalfW) / Math.max(1, cols - 1);
  const stepY = (2 * region.hh * worldHalfH) / Math.max(1, rows - 1);
  const size = Math.min(stepX, stepY) * 0.6;
  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    const x = (region.cx + (u - 0.5) * 2 * region.hw) * worldHalfW;
    const y = (region.cy + (v - 0.5) * 2 * region.hh) * worldHalfH;
    const z = (ctx.rand[i] - 0.5) * 0.2;
    set(i, x, y, z, size, paletteRamp(u));
  }
}

// Visual — a loose grid filling the region, with the header box carved out.
function visualLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH, region, exclude } = ctx;
  const stepX = (2 * region.hw) / Math.max(1, cols - 1);
  const stepY = (2 * region.hh) / Math.max(1, rows - 1);
  const size = Math.min(stepX * worldHalfW, stepY * worldHalfH) * 0.52;
  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    const nx = region.cx + (u - 0.5) * 2 * region.hw + (ctx.rand[i] - 0.5) * 0.035;
    const ny = region.cy + (v - 0.5) * 2 * region.hh + (ctx.rand2[i] - 0.5) * 0.035;
    const hidden = inExclude(nx, ny, exclude);
    set(
      i,
      nx * worldHalfW,
      ny * worldHalfH,
      (ctx.rand[i] - 0.5) * 0.6,
      hidden ? 0 : size,
      accent(ctx.homeCol[i] + ctx.homeRow[i])
    );
  }
}

// Builds — a calm, ordered grid filling the region, header carved out.
function buildsLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH, region, exclude } = ctx;
  const stepX = (2 * region.hw) / Math.max(1, cols - 1);
  const stepY = (2 * region.hh) / Math.max(1, rows - 1);
  const size = Math.min(stepX * worldHalfW, stepY * worldHalfH) * 0.46;
  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    const nx = region.cx + (u - 0.5) * 2 * region.hw;
    const ny = region.cy + (v - 0.5) * 2 * region.hh;
    const hidden = inExclude(nx, ny, exclude);
    const base = (ctx.homeCol[i] + ctx.homeRow[i]) % 2 === 0 ? ACCENTS[2] : ACCENTS[3];
    set(i, nx * worldHalfW, ny * worldHalfH, 0, hidden ? 0 : size, base.clone().lerp(SURFACE, 0.28));
  }
}

// Contact — a sparse halo, centred in the region with a golden-angle scatter.
function contactLayout(ctx, set) {
  const { worldHalfW, worldHalfH, n, region } = ctx;
  const unit = Math.min(region.hw * worldHalfW, region.hh * worldHalfH) * 0.09;
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963; // golden angle
    const rad = 0.25 + 0.75 * Math.sqrt(i / n);
    const nx = region.cx + Math.cos(a) * rad * region.hw;
    const ny = region.cy + Math.sin(a) * rad * region.hh;
    const size = unit * (0.6 + ctx.rand[i] * 0.7);
    const col = (i % 3 === 0 ? ACCENTS[2] : ACCENTS[3]).clone().lerp(SURFACE, 0.18);
    set(i, nx * worldHalfW, ny * worldHalfH, (ctx.rand2[i] - 0.5) * 0.4, size, col);
  }
}

export const layouts = {
  audio: audioLayout,
  visual: visualLayout,
  builds: buildsLayout,
  contact: contactLayout,
};
