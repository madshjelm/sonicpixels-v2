import { asset } from '../config.js';

/**
 * Streams audio through the Web Audio graph and exposes four smoothed
 * numbers the visuals run on: bass, mid, high, energy (0..1), plus a decaying
 * `beat` pulse. Two <audio> elements let us crossfade between tracks.
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

    this.levels = { bass: 0, mid: 0, high: 0, energy: 0, beat: 0 };
    this._energyAvg = 0;

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
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

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
    const binFor = (hz) =>
      Math.max(
        0,
        Math.min(
          this.freq.length - 1,
          Math.round((hz / nyquist) * this.freq.length)
        )
      );
    this.bands = {
      bass: [binFor(20), binFor(250)],
      mid: [binFor(250), binFor(2000)],
      high: [binFor(2000), binFor(8000)],
    };

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

  // Called every frame; updates the smoothed levels. dt in seconds.
  update(dt) {
    if (!this.ready) {
      // Idle: let levels gently fall to zero.
      const k = 1 - Math.exp(-dt * 2);
      for (const key of ['bass', 'mid', 'high', 'energy', 'beat'])
        this.levels[key] += (0 - this.levels[key]) * k;
      return;
    }
    this.analyser.getByteFrequencyData(this.freq);

    const bandAvg = ([a, b]) => {
      let sum = 0;
      for (let i = a; i < b; i++) sum += this.freq[i];
      return sum / Math.max(1, (b - a) * 255);
    };

    const rawBass = bandAvg(this.bands.bass);
    const rawMid = bandAvg(this.bands.mid);
    const rawHigh = bandAvg(this.bands.high);
    const rawEnergy = rawBass * 0.5 + rawMid * 0.35 + rawHigh * 0.15;

    // Asymmetric smoothing: quick to rise, slow to fall — feels musical.
    const ease = (cur, target) => {
      const rate = target > cur ? 18 : 6;
      return cur + (target - cur) * (1 - Math.exp(-dt * rate));
    };
    this.levels.bass = ease(this.levels.bass, rawBass);
    this.levels.mid = ease(this.levels.mid, rawMid);
    this.levels.high = ease(this.levels.high, rawHigh);
    this.levels.energy = ease(this.levels.energy, rawEnergy);

    // Simple beat detection: spikes above a slow running average.
    this._energyAvg += (rawEnergy - this._energyAvg) * (1 - Math.exp(-dt * 1.5));
    const spike = rawEnergy - this._energyAvg;
    if (spike > 0.06) this.levels.beat = Math.min(1, this.levels.beat + spike * 3);
    this.levels.beat += (0 - this.levels.beat) * (1 - Math.exp(-dt * 5));
  }
}
