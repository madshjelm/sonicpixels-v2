/**
 * Generates the placeholder media that ships with Sonic Pixels:
 *   - 3 short, loopable synthesized audio tracks (WAV) with clear
 *     bass / mid / high content so the reactive visuals work out of the box.
 *   - SVG artwork for each track and 6 SVG "visual" placeholders.
 *
 * Run with:  npm run generate:media
 *
 * The audio is intentionally simple DSP (sines + filtered noise) — no
 * dependencies — so the repo stays lean and the files are reproducible.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(__dirname, '..', 'public', 'media');
mkdirSync(mediaDir, { recursive: true });

const SR = 22050; // sample rate — plenty for visualisation, keeps files small

// ---------------------------------------------------------------------------
// Tiny synthesis helpers
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const noteHz = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

function adsr(t, dur, a = 0.005, d = 0.08, s = 0.6, r = 0.1) {
  if (t < 0 || t > dur) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < dur - r) return s;
  return s * (1 - (t - (dur - r)) / r);
}

// Simple one-pole low-pass for the noise-based hats / texture.
function makeLP(cut) {
  const alpha = Math.min(1, (TAU * cut) / SR);
  let y = 0;
  return (x) => (y += alpha * (x - y));
}

function softclip(x) {
  return Math.tanh(x * 1.4);
}

// ---------------------------------------------------------------------------
// Track definitions — three distinct moods, each a clean loop.
// ---------------------------------------------------------------------------
const tracks = [
  {
    file: 'track-1-pulse-garden.wav',
    bpm: 96,
    bars: 8,
    root: -9, // C
    scale: [0, 3, 5, 7, 10], // minor pentatonic
    swing: 0.0,
    bright: 0.7,
  },
  {
    file: 'track-2-soft-circuit.wav',
    bpm: 112,
    bars: 8,
    root: -2, // G
    scale: [0, 2, 4, 7, 9], // major pentatonic
    swing: 0.08,
    bright: 1.0,
  },
  {
    file: 'track-3-low-tide.wav',
    bpm: 76,
    bars: 8,
    root: -14, // low G / mellow
    scale: [0, 2, 3, 7, 9],
    swing: 0.0,
    bright: 0.45,
  },
];

function renderTrack(t) {
  const beat = 60 / t.bpm;
  const step = beat / 2; // 8th notes
  const stepsPerBar = 8;
  const totalSteps = t.bars * stepsPerBar;
  const dur = totalSteps * step;
  const n = Math.floor(dur * SR);
  const buf = new Float32Array(n);

  const hatLP = makeLP(7000 * t.bright);
  const noiseLP = makeLP(1200);

  // Deterministic pseudo-random so the melody is stable between runs.
  let seed = 1234 + Math.round(t.bpm);
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Pre-compute a melodic line over the scale.
  const melodySteps = [];
  for (let s = 0; s < totalSteps; s++) {
    const play = rng() > 0.42;
    const deg = t.scale[Math.floor(rng() * t.scale.length)];
    const oct = rng() > 0.7 ? 12 : 0;
    melodySteps.push({ play, semi: t.root + 12 + deg + oct });
  }

  for (let i = 0; i < n; i++) {
    const time = i / SR;
    const loopT = time; // already exactly N steps long
    const stepIndex = Math.floor(loopT / step);
    const swingOffset =
      stepIndex % 2 === 1 ? t.swing * step : 0;
    const stepT = loopT - stepIndex * step - swingOffset;
    const barStep = stepIndex % stepsPerBar;

    let sample = 0;

    // --- Kick (bass energy) on beats 1 & 3 of the bar ---
    if (barStep === 0 || barStep === 4) {
      const kt = stepT;
      const env = adsr(kt, step * 0.9, 0.001, 0.06, 0.0, 0.05);
      const pitch = 110 * Math.exp(-kt * 28) + 45;
      sample += Math.sin(TAU * pitch * kt) * env * 0.9;
    }

    // --- Sub bass line following the root, off-beat motion ---
    {
      const bassDeg = t.scale[(stepIndex >> 1) % t.scale.length];
      const f = noteHz(t.root + bassDeg);
      const env = adsr(stepT, step, 0.01, 0.05, 0.7, 0.06);
      sample += Math.sin(TAU * f * loopT) * env * 0.28;
    }

    // --- Mid pad: a soft chord that breathes across the loop ---
    {
      const padEnv = 0.16 + 0.06 * Math.sin(TAU * (loopT / dur));
      const c1 = noteHz(t.root + 12 + t.scale[0]);
      const c2 = noteHz(t.root + 12 + t.scale[2]);
      const c3 = noteHz(t.root + 12 + t.scale[3]);
      const pad =
        Math.sin(TAU * c1 * loopT) +
        0.7 * Math.sin(TAU * c2 * loopT) +
        0.6 * Math.sin(TAU * c3 * loopT);
      sample += pad * padEnv * 0.12 * t.bright;
    }

    // --- Melody (mid/high energy) ---
    {
      const m = melodySteps[stepIndex];
      if (m && m.play) {
        const f = noteHz(m.semi);
        const env = adsr(stepT, step * 0.95, 0.004, 0.06, 0.45, 0.08);
        const tone =
          Math.sin(TAU * f * loopT) + 0.3 * Math.sin(TAU * 2 * f * loopT);
        sample += tone * env * 0.18 * t.bright;
      }
    }

    // --- Hi-hat (high energy) on every 8th, accented off-beats ---
    {
      const accent = barStep % 2 === 1 ? 1 : 0.5;
      const env = adsr(stepT, step * 0.5, 0.001, 0.02, 0.0, 0.03);
      const noise = rng() * 2 - 1;
      sample += hatLP(noise) * env * 0.12 * accent * t.bright;
    }

    // --- Gentle low noise texture for warmth ---
    sample += noiseLP(rng() * 2 - 1) * 0.015;

    buf[i] = softclip(sample) * 0.85;
  }

  // Short fade in/out so the loop seam is click-free.
  const fade = Math.floor(0.02 * SR);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    buf[i] *= g;
    buf[n - 1 - i] *= g;
  }

  return buf;
}

function writeWav(path, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buffer);
}

// ---------------------------------------------------------------------------
// SVG placeholder art — warm, on-palette, crisp at any size.
// ---------------------------------------------------------------------------
const PALETTE = {
  bg: '#D9D8E6',
  surface: '#F4F3F9',
  ink: '#2E2C50',
  primary: '#6778D6',
  coral: '#FF8C6B',
  amber: '#FFC15E',
  teal: '#4FC9B0',
};

function artworkSvg(label, a, b) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" rx="36" fill="url(#g)"/>
  ${tileGrid(8, 8, 600, 0.18)}
  <text x="300" y="320" font-family="Poppins, Arial, sans-serif" font-size="40"
        font-weight="700" fill="${PALETTE.surface}" text-anchor="middle">${label}</text>
</svg>`;
}

function visualSvg(label, a, b, n) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="g${n}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="${PALETTE.bg}"/>
  <rect x="24" y="24" width="752" height="552" rx="28" fill="url(#g${n})"/>
  ${tileGrid(10, 7, 800, 0.16, 600)}
  <text x="400" y="540" font-family="Poppins, Arial, sans-serif" font-size="30"
        font-weight="700" fill="${PALETTE.surface}" text-anchor="middle">${label}</text>
</svg>`;
}

function tileGrid(cols, rows, w, alpha, h = w) {
  const cellW = w / cols;
  const cellH = h / rows;
  let out = '';
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rnd() > 0.55) continue;
      const pad = cellW * 0.18;
      out += `<rect x="${(x * cellW + pad).toFixed(1)}" y="${(y * cellH + pad).toFixed(1)}" width="${(cellW - pad * 2).toFixed(1)}" height="${(cellH - pad * 2).toFixed(1)}" rx="4" fill="#ffffff" opacity="${(alpha * rnd()).toFixed(2)}"/>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Render everything
// ---------------------------------------------------------------------------
console.log('Generating audio tracks…');
for (const t of tracks) {
  const samples = renderTrack(t);
  writeWav(join(mediaDir, t.file), samples);
  console.log('  ✓', t.file, `(${(samples.length / SR).toFixed(1)}s)`);
}

console.log('Generating track artwork…');
const artworks = [
  ['art-1.svg', 'Pulse Garden', PALETTE.coral, PALETTE.primary],
  ['art-2.svg', 'Soft Circuit', PALETTE.amber, PALETTE.teal],
  ['art-3.svg', 'Low Tide', PALETTE.teal, PALETTE.primary],
];
for (const [file, label, a, b] of artworks) {
  writeFileSync(join(mediaDir, file), artworkSvg(label, a, b));
  console.log('  ✓', file);
}

console.log('Generating visual placeholders…');
const visuals = [
  ['visual-1.svg', 'Tile Study 01', PALETTE.coral, PALETTE.amber],
  ['visual-2.svg', 'Tile Study 02', PALETTE.primary, PALETTE.teal],
  ['visual-3.svg', 'Field Sketch', PALETTE.amber, PALETTE.coral],
  ['visual-4.svg', 'Grid Bloom', PALETTE.teal, PALETTE.primary],
  ['visual-5.svg', 'Warm Static', PALETTE.coral, PALETTE.teal],
  ['visual-6.svg', 'Resting Pattern', PALETTE.primary, PALETTE.amber],
];
visuals.forEach(([file, label, a, b], i) => {
  writeFileSync(join(mediaDir, file), visualSvg(label, a, b, i));
  console.log('  ✓', file);
});

console.log('Done.');
