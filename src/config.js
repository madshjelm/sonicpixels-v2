// Central palette + tuning constants. Colours mirror style.css so the WebGL
// tiles and the DOM chrome stay in sync.
import { Color } from 'three';

export const PALETTE = {
  bg: 0xd9d8e6,
  surface: 0xf4f3f9,
  ink: 0x2e2c50,
  primary: 0x6778d6,
  coral: 0xff8c6b,
  amber: 0xffc15e,
  teal: 0x4fc9b0,
};

// Accent colours used by the tiles, low frequency → high frequency.
export const ACCENTS = [
  new Color(PALETTE.coral),
  new Color(PALETTE.amber),
  new Color(PALETTE.primary),
  new Color(PALETTE.teal),
];

// Frequency range the spectrum analyzer + ambient sampling span.
export const AUDIO = { fMin: 40, fMax: 12000 };

// Blend the warm palette across a 0..1 axis: coral → amber → purple → teal.
// Shared by the layouts (base colour) and the reactors (live tint) so the
// frequency→colour mapping is identical everywhere.
const _rampTmp = new Color();
export function paletteRamp(f, out = _rampTmp) {
  const t = Math.max(0, Math.min(1, f)) * (ACCENTS.length - 1);
  const i = Math.min(ACCENTS.length - 2, Math.floor(t));
  return out.copy(ACCENTS[i]).lerp(ACCENTS[i + 1], t - i);
}

export const STATES = ['audio', 'visual', 'builds', 'contact'];

export const STATE_LABELS = {
  audio: 'Audio',
  visual: 'Visual',
  builds: 'Builds',
  contact: 'Contact',
};

// Resolve a media path from content.json against Vite's base URL so it works
// on a project page, a custom domain, and the dev server alike.
export function asset(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

export const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Adaptive quality from screen size + DPR only (no GPU heuristics).
// Returns the LED-matrix dimensions and the resulting tile count.
export function deviceTier() {
  const w = window.innerWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cols, rows, maxDpr;
  if (w < 600) {
    cols = 16;
    rows = 9;
    maxDpr = Math.min(dpr, 2);
  } else if (w < 1100) {
    cols = 22;
    rows = 12;
    maxDpr = Math.min(dpr, 2);
  } else {
    cols = 28;
    rows = 14;
    maxDpr = Math.min(dpr, 2);
  }
  return { cols, rows, count: cols * rows, maxDpr };
}
