import { Color } from 'three';
import { ACCENTS, PALETTE, paletteRamp } from '../config.js';

const SURFACE = new Color(PALETTE.surface);
const accent = (i) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];

/**
 * Audio — a fixed LED matrix used as a spectrum analyzer. Columns map to
 * frequency (low→high, left→right) and so does the colour (coral→teal); the
 * AudioReactor fills each column to the band's amplitude. Docked to the left
 * of the track panel on wide screens, or above it on narrow ones.
 */
function audioLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH, docked } = ctx;
  const region =
    docked === 'right'
      ? { cx: -0.3, cy: 0.08, hw: 0.58, hh: 0.6 }
      : { cx: 0, cy: 0.36, hw: 0.84, hh: 0.42 };

  const stepX = (2 * region.hw * worldHalfW) / Math.max(1, cols - 1);
  const stepY = (2 * region.hh * worldHalfH) / Math.max(1, rows - 1);
  const size = Math.min(stepX, stepY) * 0.72;

  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    const x = (region.cx + (u - 0.5) * 2 * region.hw) * worldHalfW;
    const y = (region.cy + (v - 0.5) * 2 * region.hh) * worldHalfH;
    const z = (ctx.rand[i] - 0.5) * 0.2;
    set(i, x, y, z, size, paletteRamp(u));
  }
}

/**
 * Visual — a loose, full-field grid that frames the thumbnail cards and
 * gently pushes away from the centre so the content reads clearly.
 */
function visualLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH } = ctx;
  const stepX = (2 * 0.92 * worldHalfW) / Math.max(1, cols - 1);
  const stepY = (2 * 0.86 * worldHalfH) / Math.max(1, rows - 1);
  const size = Math.min(stepX, stepY) * 0.5;

  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    let nx = (u - 0.5) * 2 * 0.92 + (ctx.rand[i] - 0.5) * 0.05;
    let ny = (v - 0.5) * 2 * 0.86 + (ctx.rand2[i] - 0.5) * 0.05;
    // Nudge inner tiles outward to clear the central content.
    const r = Math.hypot(nx, ny);
    const push = 1 + 0.18 * (1 - smoothstep(0, 0.9, r));
    set(
      i,
      nx * push * worldHalfW,
      ny * push * worldHalfH,
      (ctx.rand[i] - 0.5) * 0.6,
      size,
      accent(ctx.homeCol[i] + ctx.homeRow[i])
    );
  }
}

/**
 * Builds — a calmer, ordered grid with a cooler, more muted palette.
 */
function buildsLayout(ctx, set) {
  const { cols, rows, worldHalfW, worldHalfH } = ctx;
  const stepX = (2 * 0.82 * worldHalfW) / Math.max(1, cols - 1);
  const stepY = (2 * 0.78 * worldHalfH) / Math.max(1, rows - 1);
  const size = Math.min(stepX, stepY) * 0.44;

  for (let i = 0; i < ctx.n; i++) {
    const u = cols > 1 ? ctx.homeCol[i] / (cols - 1) : 0.5;
    const v = rows > 1 ? ctx.homeRow[i] / (rows - 1) : 0.5;
    const x = (u - 0.5) * 2 * 0.82 * worldHalfW;
    const y = (v - 0.5) * 2 * 0.78 * worldHalfH;
    // Cooler, muted tiles for a quieter backdrop.
    const base = (ctx.homeCol[i] + ctx.homeRow[i]) % 2 === 0 ? ACCENTS[2] : ACCENTS[3];
    set(i, x, y, 0, size, base.clone().lerp(SURFACE, 0.28));
  }
}

/**
 * Contact — the calmest state. A sparse halo of small tiles around the card,
 * spread evenly with a golden-angle scatter.
 */
function contactLayout(ctx, set) {
  const { worldHalfW, worldHalfH, n } = ctx;
  const unit = Math.min(worldHalfW, worldHalfH) * 0.05;
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963; // golden angle
    const rad = 0.22 + 0.8 * Math.sqrt(i / n);
    const x = Math.cos(a) * rad * 0.95 * worldHalfW;
    const y = Math.sin(a) * rad * 0.78 * worldHalfH + 0.04 * worldHalfH;
    const size = unit * (0.6 + ctx.rand[i] * 0.7);
    const col = (i % 3 === 0 ? ACCENTS[2] : ACCENTS[3]).clone().lerp(SURFACE, 0.18);
    set(i, x, y, (ctx.rand2[i] - 0.5) * 0.4, size, col);
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const layouts = {
  audio: audioLayout,
  visual: visualLayout,
  builds: buildsLayout,
  contact: contactLayout,
};
