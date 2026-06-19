import { asset, AUDIO } from '../config.js';
import {
  bandEnergy,
  timeRMS,
  spectralCentroid,
  spectralFlux,
  fillLogBands,
  clamp01,
} from './analysis.js';

/**
 * Streams audio through the Web Audio graph and publishes a single feature
 * bus the visual reactors read from. Beyond the smoothed bass/mid/high/energy
 * and a beat pulse, it exposes the normalised spectrum, log-spaced bands, a
 * spectral centroid (brightness), spectral flux + per-band onsets, an RMS
 * loudness, an auto-gain factor and a beat phase. Two <audio> elements let us
 * crossfade between tracks.
 *
 *   elA ─▶ srcA ─▶ gainA ┐
 *                         ├─▶ analyser ─▶ master ─▶ destination
 *   elB ─▶ srcB ─▶ gainB ┘
 */
export class AudioEngine {
  constructor(tracks) {
    this.tracks = tracks;
    this.index = 0;
    this.ready = false;
    this.playing = false;
    this.onState = () => {};

    this._energyAvg = 0;
    this._loudMax = 0.15;
    this._lastBeat = 0;
    this._beatInterval = 0.5;
    this._clock = 0;

    // The shared feature bus. Reactors read this every frame.
    this.features = {
      bass: 0, mid: 0, high: 0, energy: 0, beat: 0,
      level: 0,        // RMS loudness (0..1)
      centroid: 0.5,   // brightness (0..1)
      flux: 0,         // overall onset strength (0..1)
      gain: 1,         // auto-gain multiplier
      beatPhase: 0,    // 0..1 position between beats
      onset: { bass: 0, mid: 0, high: 0 },
      spectrum: new Float32Array(0), // normalised FFT (0..1)
      bins: 0,
      ready: false,
      // Fill `out` with log-spaced band magnitudes for the analyzer.
      getLogBands: (out) => out.fill(0),
    };

    // Two streaming audio elements for crossfading.
    this.elements = [this._makeEl(), this._makeEl()];
    this.activeEl = 0;
  }

  _makeEl() {
    const el = new Audio();
    el.preload = 'none';
    el.crossOrigin = 'anonymous';
    el.loop = false;
    el.addEventListener('ended', () => this.next());
    return el;
  }

  // Must be called from a user gesture (mobile autoplay policy).
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    const bins = this.analyser.frequencyBinCount;
    this.freq = new Uint8Array(bins);
    this.prevFreq = new Uint8Array(bins);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.spectrum = new Float32Array(bins);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.gains = this.elements.map((el) => {
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.analyser);
      return gain;
    });
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Precompute FFT bin ranges from the real context sample rate.
    const nyquist = this.ctx.sampleRate / 2;
    this.nyquist = nyquist;
    const bc = this.freq.length;
    const binFor = (hz) =>
      Math.max(0, Math.min(bc - 1, Math.round((hz / nyquist) * bc)));
    this.bands = {
      bass: [binFor(20), binFor(250)],
      mid: [binFor(250), binFor(2000)],
      high: [binFor(2000), binFor(8000)],
    };
    this._centroidRange = [binFor(80), binFor(12000)];

    // Wire the live spectrum + analyzer band sampler into the feature bus.
    this.features.spectrum = this.spectrum;
    this.features.bins = bc;
    this.features.ready = true;
    this.features.getLogBands = (out) =>
      fillLogBands(out, this.freq, bc, nyquist, AUDIO.fMin, AUDIO.fMax);

    this.ready = true;
  }

  async _loadInto(elIndex, trackIndex) {
    const el = this.elements[elIndex];
    el.src = asset(this.tracks[trackIndex].file);
    el.load();
    try {
      await el.play();
    } catch (e) {
      /* play may reject if interrupted; ignored */
    }
  }

  // Crossfade master gains between the two elements over `time` seconds.
  _crossfade(toIndex, time = 0.8) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.gains.forEach((g, i) => {
      const target = i === toIndex ? 1 : 0;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(target, now + time);
    });
    // Pause the faded-out element shortly after the fade completes.
    const other = this.elements[1 - toIndex];
    clearTimeout(this._pauseTimer);
    this._pauseTimer = setTimeout(() => {
      if (this.activeEl !== (1 - toIndex)) other.pause();
    }, time * 1000 + 60);
  }

  async play(trackIndex = this.index) {
    this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.select(trackIndex, true);
  }

  // Switch to a track, crossfading audio. `force` always reloads.
  async select(trackIndex, force = false) {
    if (!this.tracks.length) return;
    if (!this.ready) this.init();
    trackIndex = (trackIndex + this.tracks.length) % this.tracks.length;
    if (trackIndex === this.index && this.playing && !force) return;

    const nextEl = 1 - this.activeEl;
    this.index = trackIndex;
    await this._loadInto(nextEl, trackIndex);
    this._crossfade(nextEl, this.playing ? 0.8 : 0.5);
    this.activeEl = nextEl;
    this.playing = true;
    this.onState();
  }

  togglePlay() {
    if (!this.ready || !this.playing) {
      this.play();
      return;
    }
    const el = this.elements[this.activeEl];
    if (el.paused) {
      this.ctx.resume();
      el.play();
      this.playing = true;
    } else {
      el.pause();
      this.playing = false;
    }
    this.onState();
  }

  next() {
    this.select(this.index + 1);
  }
  prev() {
    this.select(this.index - 1);
  }

  get current() {
    return this.tracks[this.index];
  }

  // Called every frame; refreshes the feature bus. dt in seconds.
  update(dt) {
    this._clock += dt;
    const f = this.features;

    if (!this.ready) {
      // Idle: let everything fall gently to rest.
      const k = 1 - Math.exp(-dt * 2);
      f.bass += -f.bass * k;
      f.mid += -f.mid * k;
      f.high += -f.high * k;
      f.energy += -f.energy * k;
      f.beat += -f.beat * k;
      f.level += -f.level * k;
      f.flux += -f.flux * k;
      f.onset.bass += -f.onset.bass * k;
      f.onset.mid += -f.onset.mid * k;
      f.onset.high += -f.onset.high * k;
      f.centroid += (0.5 - f.centroid) * k;
      return;
    }

    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Normalised spectrum for any reactor that wants raw bins.
    for (let i = 0; i < this.freq.length; i++) this.spectrum[i] = this.freq[i] / 255;

    const rawBass = bandEnergy(this.freq, this.bands.bass[0], this.bands.bass[1]);
    const rawMid = bandEnergy(this.freq, this.bands.mid[0], this.bands.mid[1]);
    const rawHigh = bandEnergy(this.freq, this.bands.high[0], this.bands.high[1]);
    const rawEnergy = rawBass * 0.5 + rawMid * 0.35 + rawHigh * 0.15;
    const rms = timeRMS(this.timeData);

    // Auto-gain: track a slowly-decaying loudness ceiling so quiet and loud
    // tracks both fill the visuals. Clamped to avoid amplifying near-silence.
    this._loudMax = Math.max(rawEnergy, this._loudMax - dt * 0.12);
    f.gain = Math.max(0.7, Math.min(3.4, 0.42 / Math.max(0.05, this._loudMax)));

    // Asymmetric smoothing: quick to rise, slow to fall — feels musical.
    const ease = (cur, target) => {
      const rate = target > cur ? 18 : 6;
      return cur + (target - cur) * (1 - Math.exp(-dt * rate));
    };
    f.bass = ease(f.bass, rawBass);
    f.mid = ease(f.mid, rawMid);
    f.high = ease(f.high, rawHigh);
    f.energy = ease(f.energy, rawEnergy);
    f.level = ease(f.level, clamp01(rms * f.gain));

    // Brightness (centroid) — smoothed for stability.
    const centroid = spectralCentroid(this.freq, this._centroidRange[0], this._centroidRange[1]);
    f.centroid += (centroid - f.centroid) * (1 - Math.exp(-dt * 4));

    // Spectral flux (overall + per band) → onsets. Decays quickly.
    const fluxAll = spectralFlux(this.freq, this.prevFreq, 1, this.freq.length);
    f.flux = Math.max(f.flux * Math.exp(-dt * 7), clamp01(fluxAll * 6));
    const decay = Math.exp(-dt * 7);
    const bandOnset = (range) =>
      clamp01(spectralFlux(this.freq, this.prevFreq, range[0], range[1]) * 8);
    f.onset.bass = Math.max(f.onset.bass * decay, bandOnset(this.bands.bass));
    f.onset.mid = Math.max(f.onset.mid * decay, bandOnset(this.bands.mid));
    f.onset.high = Math.max(f.onset.high * decay, bandOnset(this.bands.high));
    this.prevFreq.set(this.freq);

    // Beat detection: energy spikes above a slow running average.
    this._energyAvg += (rawEnergy - this._energyAvg) * (1 - Math.exp(-dt * 1.5));
    const spike = rawEnergy - this._energyAvg;
    if (spike > 0.06 && this._clock - this._lastBeat > 0.16) {
      f.beat = Math.min(1, f.beat + spike * 3);
      const interval = this._clock - this._lastBeat;
      if (interval > 0.2 && interval < 1.2)
        this._beatInterval += (interval - this._beatInterval) * 0.2;
      this._lastBeat = this._clock;
    }
    f.beat += -f.beat * (1 - Math.exp(-dt * 5));
    f.beatPhase = clamp01((this._clock - this._lastBeat) / this._beatInterval);
  }
}
