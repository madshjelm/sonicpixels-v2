import { STATES, STATE_LABELS } from '../config.js';

/**
 * The tuner: a radio-band strip docked at the bottom. Click a label, drag the
 * needle, swipe the band, or use the arrow keys. The needle follows the
 * pointer while dragging and the active state changes live as it passes each
 * label; on release it snaps to the nearest one.
 */
export class Tuner {
  constructor(onChange) {
    this.onChange = onChange;
    this.index = 0;
    this.dragging = false;
    this.build();
    this.bindKeys();
  }

  frac(i) {
    return (i + 0.5) / STATES.length;
  }

  build() {
    const el = document.createElement('div');
    el.id = 'tuner';
    el.innerHTML = `
      <div class="tuner-inner">
        <div class="tuner-labels"></div>
        <div class="tuner-band" role="slider" aria-label="Section tuner"
             aria-valuemin="0" aria-valuemax="${STATES.length - 1}" tabindex="0">
          <div class="tuner-ticks"></div>
          <div class="tuner-needle"></div>
        </div>
      </div>`;
    this.el = el;

    const labels = el.querySelector('.tuner-labels');
    STATES.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'tuner-label';
      b.textContent = STATE_LABELS[s];
      b.addEventListener('click', () => this.setIndex(i));
      labels.appendChild(b);
    });
    this.labelEls = [...labels.children];

    // Ticks — a denser band with majors under each label.
    const ticks = el.querySelector('.tuner-ticks');
    const TICKS = 41;
    for (let i = 0; i < TICKS; i++) {
      const t = document.createElement('div');
      const f = i / (TICKS - 1);
      const nearMajor = STATES.some((_, s) => Math.abs(f - this.frac(s)) < 0.012);
      t.className = 'tick' + (nearMajor ? ' major' : '');
      t.style.height = (nearMajor ? 22 : 8 + (i % 3) * 4) + 'px';
      ticks.appendChild(t);
    }

    this.band = el.querySelector('.tuner-band');
    this.needle = el.querySelector('.tuner-needle');

    this.bindDrag();
    this.render(true);
  }

  bindDrag() {
    const pointerToIndex = (clientX) => {
      const rect = this.band.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // Nearest label.
      let best = 0,
        bd = Infinity;
      STATES.forEach((_, i) => {
        const d = Math.abs(f - this.frac(i));
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return { f, nearest: best };
    };

    const move = (clientX) => {
      const { f, nearest } = pointerToIndex(clientX);
      // Needle follows the pointer freely while dragging.
      this.needle.style.transition = 'none';
      this.needle.style.left = f * 100 + '%';
      if (nearest !== this.index) this.setIndex(nearest, true);
    };

    this.band.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.band.setPointerCapture(e.pointerId);
      move(e.clientX);
    });
    this.band.addEventListener('pointermove', (e) => {
      if (this.dragging) move(e.clientX);
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.render(); // snap needle to the active label
    };
    this.band.addEventListener('pointerup', end);
    this.band.addEventListener('pointercancel', end);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        this.setIndex(this.index - 1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        this.setIndex(this.index + 1);
        e.preventDefault();
      }
    });
  }

  setIndex(i, fromDrag = false) {
    i = Math.max(0, Math.min(STATES.length - 1, i));
    const changed = i !== this.index;
    this.index = i;
    if (!fromDrag) this.render();
    else this.renderLabels();
    if (changed) this.onChange(STATES[i], i);
  }

  renderLabels() {
    this.labelEls.forEach((el, i) => el.classList.toggle('active', i === this.index));
    this.band.setAttribute('aria-valuenow', this.index);
    this.band.setAttribute(
      'aria-valuetext',
      STATE_LABELS[STATES[this.index]]
    );
  }

  render(immediate = false) {
    this.needle.style.transition = immediate ? 'none' : '';
    this.needle.style.left = this.frac(this.index) * 100 + '%';
    this.renderLabels();
  }

  show() {
    requestAnimationFrame(() => this.el.classList.add('visible'));
  }
}
