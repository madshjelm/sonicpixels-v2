import { Color } from 'three';
import { paletteRamp } from '../config.js';

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
    for (let i = 0; i < field.n; i++) {
      const c = field.homeCol[i];
      const rowFrac = this.rows > 1 ? field.homeRow[i] / (this.rows - 1) : 0.5;
      const h = this.bars[c];

      // Lit up to the bar height, with a soft edge one row-step wide.
      // Modest scale growth (tiles must not overlap neighbours); the lit
      // tiles read mostly through brightness, not size.
      const lit = clamp((h - rowFrac) / rs);
      field.dScale[i] = 0.04 + 0.4 * lit * (0.6 + 0.4 * h);
      field.dBright[i] = 0.18 + 0.62 * lit;

      // Peak-hold cap: the tile nearest the held peak gets a bright lift.
      const pd = Math.abs(rowFrac - this.peaks[c]);
      if (this.peaks[c] > 0.06 && pd < rs * 0.75) {
        const cap = 1 - pd / (rs * 0.75);
        field.dScale[i] += 0.1 * cap;
        if (field.dBright[i] < 0.55 + 0.4 * cap) field.dBright[i] = 0.55 + 0.4 * cap;
      }
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Visual — ambient: brightness tints the field, spectrum gives gentle life */
/* ----------------------------------------------------------------------- */
export class VisualReactor {
  enter(field) {
    this.cols = field.cols;
    this.raw = new Float32Array(this.cols);
    this.tint = new Color();
    this.t = 0;
  }

  update(field, f, dt, playing) {
    if (this.cols !== field.cols) this.enter(field);
    this.t += dt;
    f.getLogBands(this.raw);

    // Frame-wide hue from spectral centroid (dark→warm, bright→cool).
    this.tint.copy(paletteRamp(0.15 + f.centroid * 0.75));
    const tr = this.tint.r, tg = this.tint.g, tb = this.tint.b;
    const mix = 0.12 + 0.18 * f.level;
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
      const i3 = i * 3;
      field.dColor[i3] = tr;
      field.dColor[i3 + 1] = tg;
      field.dColor[i3 + 2] = tb;
      field.dColorMix[i] = mix;
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Builds — ordered grid: calm spectrum shimmer + a contained hover nudge   */
/* ----------------------------------------------------------------------- */
export class BuildsReactor {
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

    for (let i = 0; i < field.n; i++) {
      const c = field.homeCol[i];
      const mag = clamp(this.raw[c] * f.gain);
      let s = playing ? 0.03 + 0.16 * mag : 0.02;
      let bright = 0.1 * mag;

      if (hasPulses) {
        const i3 = i * 3;
        const p = field.samplePulse(field.curPos[i3], field.curPos[i3 + 1]);
        if (p > 0) {
          s += 0.45 * p;
          field.dLift[i] = 0.3 * p;
          if (bright < 0.4 * p) bright = 0.4 * p;
        }
      }
      field.dScale[i] = s;
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
    visual: new VisualReactor(),
    builds: new BuildsReactor(),
    contact: new ContactReactor(),
  };
}
