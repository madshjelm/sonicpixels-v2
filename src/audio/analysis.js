/**
 * Pure spectral-analysis helpers — no Web Audio, no DOM — so they can be unit
 * tested in Node. Everything operates on a `Uint8Array` FFT magnitude frame
 * (0..255 per bin) as produced by `AnalyserNode.getByteFrequencyData`.
 */

// Average magnitude (0..1) of the bins in [a, b).
export function bandEnergy(freq, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += freq[i];
  return s / Math.max(1, (b - a) * 255);
}

// RMS (0..1) of a time-domain frame (0..255, centred on 128).
export function timeRMS(time) {
  let s = 0;
  for (let i = 0; i < time.length; i++) {
    const v = (time[i] - 128) / 128;
    s += v * v;
  }
  return Math.sqrt(s / Math.max(1, time.length));
}

/**
 * Spectral centroid over [loBin, hiBin), returned as 0..1 within that range —
 * a single "brightness" number (low = dark/bassy, high = bright/airy).
 */
export function spectralCentroid(freq, loBin, hiBin) {
  let num = 0,
    den = 0;
  for (let i = loBin; i < hiBin; i++) {
    const m = freq[i];
    num += i * m;
    den += m;
  }
  if (den <= 0) return 0;
  const span = Math.max(1, hiBin - loBin);
  return Math.max(0, Math.min(1, (num / den - loBin) / span));
}

/**
 * Spectral flux over [loBin, hiBin): the summed positive change since the
 * previous frame, normalised. High when new energy appears (onsets/attacks).
 */
export function spectralFlux(freq, prev, loBin, hiBin) {
  let s = 0;
  for (let i = loBin; i < hiBin; i++) {
    const d = (freq[i] - prev[i]) / 255;
    if (d > 0) s += d;
  }
  return s / Math.max(1, hiBin - loBin);
}

/**
 * Fill `out` with `out.length` log-spaced band magnitudes (0..1) between
 * fMin and fMax — the data behind the spectrum analyzer. Each output band
 * averages the FFT bins that fall inside its frequency slice, so high bands
 * (which span more bins) are not unfairly boosted.
 */
export function fillLogBands(out, freq, binCount, nyquist, fMin, fMax) {
  const n = out.length;
  const ratio = fMax / fMin;
  for (let k = 0; k < n; k++) {
    const f0 = fMin * Math.pow(ratio, k / n);
    const f1 = fMin * Math.pow(ratio, (k + 1) / n);
    let a = Math.floor((f0 / nyquist) * binCount);
    let b = Math.ceil((f1 / nyquist) * binCount);
    a = Math.max(0, Math.min(binCount - 1, a));
    b = Math.max(a + 1, Math.min(binCount, b));
    let s = 0;
    for (let i = a; i < b; i++) s += freq[i];
    out[k] = s / ((b - a) * 255);
  }
  return out;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
