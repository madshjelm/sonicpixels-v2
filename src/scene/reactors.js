import { Color } from 'three';
import { paletteRamp, PALETTE, reducedMotion } from '../config.js';

/**
 * Reactors map the audio feature bus onto per-tile drive (dScale / dLift /
 * dBright / dColor) for one state each. The field eases layout and composes;
 * reactors decide meaning. Leaning analytic and calm throughout.
 */

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/* ----------------------------------------------------------------------- */
/* Audio — spectrum analyzer with peak-hold                                */
/* ----------------------------------------------------------------------- */
export class AudioReactor {
  enter(field) {
    this.cols = field.cols;
    this.rows = field.rows;
    this.rowStep = this.rows > 1 ? 1 / (this.rows - 1) : 1;
    this.raw = new Float32Array(this.cols);
    this.bars = new Float32Array(this.cols);
    this.peaks = new Float32Array(this.cols);
    this.bgColor = new Color(PALETTE.bg);
    this.t = 0;
  }

  update(field, f, dt, playing) {
    if (this.cols !== field.cols) this.enter(field);
    this.t += dt;
    const cols = this.cols;
    const quiet = !playing || f.energy < 0.012;

    f.getLogBands(this.raw);
    const kAtt = 1 - Math.exp(-dt * 22);
    const kRel = 1 - Math.exp(-dt * 8);

    for (let c = 0; c < cols; c++) {
      // Target bar height — live spectrum, or a calm resting wave when quiet.
      let target;
      if (quiet) {
        target = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(this.t * 0.8 + c * 0.5));
      } else {
        target = clamp(this.raw[c] * f.gain);
      }
      const k = target > this.bars[c] ? kAtt : kRel;
      this.bars[c] += (target - this.bars[c]) * k;
      // Peak-hold marker that falls slowly back toward the bar.
      this.peaks[c] = Math.max(this.bars[c], this.peaks[c] - dt * 0.5);
    }

    const rs = this.rowStep;
    // Contrast is carried by saturation, not whitening: the lit bar keeps its
    // full palette colour and stands forward, while unlit tiles blend part-way
    // toward the background so they recede (but stay visible). On a light
    // canvas, whitening the lit tiles is what washed the bars out before.
    const bg = this.bgColor;
    const bgR = bg.r, bgG = bg.g, bgB = bg.b;
    const FADE = 0.38; // how far unlit tiles blend toward the background
    const GLOW = 0.3; // gentle highlight along the bar's leading edge
    for (let i = 0; i < field.n; i++) {
      const c = field.homeCol[i];
      const rowFrac = this.rows > 1 ? field.homeRow[i] / (this.rows - 1) : 0.5;
      const h = this.bars[c];

      // Lit up to the bar height, with a soft edge one row-step wide. Modest
      // scale growth (tiles must not overlap neighbours) — the lit tiles read
      // mostly through their vivid colour, not size.
      const lit = clamp((h - rowFrac) / rs);
      field.dScale[i] = 0.04 + 0.4 * lit * (0.6 + 0.4 * h);

      // Fade unlit tiles toward the background; lit tiles keep full saturation.
      const i3 = i * 3;
      field.dColor[i3] = bgR;
      field.dColor[i3 + 1] = bgG;
      field.dColor[i3 + 2] = bgB;
      field.dColorMix[i] = FADE * (1 - lit);

      // A soft crest along the bar's leading edge (peaks across the one-row-step
      // soft edge; zero in the vivid body and the muted field) — a glow, not a
      // wash.
      const crest = lit * (1 - lit) * 4;
      field.dBright[i] = GLOW * crest;

      // Peak-hold marker: a crisp, vivid dot hovering above the bar. Pull it
      // back to full saturation (undo the fade) so it reads against the muted
      // upper field, rather than whitening into the background.
      const pd = Math.abs(rowFrac - this.peaks[c]);
      if (this.peaks[c] > 0.06 && pd < rs * 0.75) {
        const cap = 1 - pd / (rs * 0.75);
        field.dScale[i] += 0.1 * cap;
        field.dColorMix[i] *= 1 - cap;
        const capBright = 0.22 * cap;
        if (field.dBright[i] < capBright) field.dBright[i] = capBright;
      }
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Video — ambient: brightness tints the field, spectrum gives gentle life  */
/* ----------------------------------------------------------------------- */
export class VideoReactor {
  enter(field) {
    this.cols = field.cols;
    this.rows = field.rows;
    this.raw = new Float32Array(this.cols);
    this.tint = new Color();
    this.t = 0;
  }

  update(field, f, dt, playing) {
    if (this.cols !== field.cols) this.enter(field);
    this.t += dt;
    f.getLogBands(this.raw);

    // Drifting aurora: instead of one frame-wide hue, a soft spatial colour
    // gradient (coral→teal) that slowly scrolls and rotates over time, so the
    // field flows with colour even when paused. The music nudges the gradient's
    // centre (dark→warm, bright→cool) and how strongly it leads the base tiles.
    const TAU = Math.PI * 2;
    const dm = reducedMotion ? 0.4 : 1; // calm the drift under reduced motion
    const drift = this.t * 0.06 * dm; // the gradient scrolls
    const ang = this.t * 0.03 * dm; // and its direction slowly rotates
    const ax = Math.cos(ang), ay = Math.sin(ang);
    const center = clamp(0.5 + (f.centroid - 0.5) * 0.6);
    const spread = 0.45; // how much of the palette the field spans at once
    const rowsM1 = this.rows > 1 ? this.rows - 1 : 1;
    const mix = 0.82 + 0.12 * f.level; // aurora dominates for a smooth, calm wash
    const flux = f.flux;

    for (let i = 0; i < field.n; i++) {
      const c = field.homeCol[i];
      const mag = clamp(this.raw[c] * f.gain);
      if (playing) {
        field.dScale[i] = 0.04 + 0.3 * mag;
        field.dBright[i] = 0.12 * mag + 0.18 * flux;
      } else {
        field.dScale[i] = 0.03 * (0.5 + 0.5 * Math.sin(this.t + field.rand[i] * 6.283));
      }

      // Per-tile hue from its position along the drifting/rotating axis.
      const gx = field.binFrac[i] - 0.5;
      const gy = field.homeRow[i] / rowsM1 - 0.5;
      const proj = gx * ax + gy * ay;
      const g = 0.5 + 0.5 * Math.sin((proj + drift) * TAU);
      paletteRamp(clamp(center + (g - 0.5) * spread), this.tint);
      const i3 = i * 3;
      field.dColor[i3] = this.tint.r;
      field.dColor[i3 + 1] = this.tint.g;
      field.dColor[i3 + 2] = this.tint.b;
      field.dColorMix[i] = mix;
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Web — ordered grid: calm spectrum shimmer + a contained hover nudge      */
/* ----------------------------------------------------------------------- */
export class WebReactor {
  enter(field) {
    this.cols = field.cols;
    this.raw = new Float32Array(this.cols);
    this.t = 0;
  }

  update(field, f, dt, playing) {
    if (this.cols !== field.cols) this.enter(field);
    this.t += dt;
    f.getLogBands(this.raw);
    const hasPulses = field.pulses.length > 0;

    // Cursor halo: tiles swell gently around the pointer wherever it moves
    // (desktop Web browsing only — set/cleared from main.js). A soft Gaussian
    // on distance from the cursor, sized relative to the view so it holds at
    // every screen size.
    const cur = field.cursor;
    const haloOn = !!(cur && cur.active);
    const cx = haloOn ? cur.x : 0;
    const cy = haloOn ? cur.y : 0;
    const sigma = (field.worldHalfW || 1) * 0.14;
    const inv2s2 = 1 / (2 * sigma * sigma);

    for (let i = 0; i < field.n; i++) {
      const c = field.homeCol[i];
      const mag = clamp(this.raw[c] * f.gain);
      let s = playing ? 0.03 + 0.16 * mag : 0.02;
      let bright = 0.1 * mag;
      let lift = 0;
      const i3 = i * 3;

      if (haloOn) {
        const dx = field.curPos[i3] - cx;
        const dy = field.curPos[i3 + 1] - cy;
        const halo = Math.exp(-(dx * dx + dy * dy) * inv2s2);
        if (halo > 0.01) {
          s += 0.42 * halo;
          lift = 0.14 * halo;
          if (bright < 0.26 * halo) bright = 0.26 * halo;
        }
      }

      if (hasPulses) {
        const p = field.samplePulse(field.curPos[i3], field.curPos[i3 + 1]);
        if (p > 0) {
          s += 0.65 * p;
          if (lift < 0.4 * p) lift = 0.4 * p;
          if (bright < 0.5 * p) bright = 0.5 * p;
        }
      }
      field.dScale[i] = s;
      field.dLift[i] = lift;
      field.dBright[i] = bright;
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Contact — the calmest: a slow loudness breath, a whisper of hue           */
/* ----------------------------------------------------------------------- */
export class ContactReactor {
  enter(field) {
    this.tint = new Color();
    this.t = 0;
  }

  update(field, f, dt, playing) {
    this.t += dt;
    const breath = f.level;
    this.tint.copy(paletteRamp(0.45 + f.centroid * 0.2));
    const tr = this.tint.r, tg = this.tint.g, tb = this.tint.b;

    for (let i = 0; i < field.n; i++) {
      field.dScale[i] =
        0.02 + 0.1 * breath + 0.02 * (0.5 + 0.5 * Math.sin(this.t * 0.5 + field.rand[i] * 6.283));
      field.dBright[i] = 0.08 * breath;
      const i3 = i * 3;
      field.dColor[i3] = tr;
      field.dColor[i3 + 1] = tg;
      field.dColor[i3 + 2] = tb;
      field.dColorMix[i] = 0.1;
    }
  }
}

export function makeReactors() {
  return {
    audio: new AudioReactor(),
    video: new VideoReactor(),
    web: new WebReactor(),
    contact: new ContactReactor(),
  };
}
