const PLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

// The first moment: title, a quiet loading bar, then a single "press play" cue.
export class Landing {
  constructor(onPlay) {
    this.onPlay = onPlay;
    this.el = document.createElement('div');
    this.el.id = 'landing';
    this.el.innerHTML = `
      <h1 class="landing-title">Sonic Pixels<span class="title-tile" aria-hidden="true"></span></h1>
      <p class="landing-tag">Mads-Bjørn Hjelmar - Multimedia freelancing</p>
      <div class="loader">
        <div class="loader-bar"><div class="loader-fill"></div></div>
        <div class="loader-text">Warming up…</div>
      </div>`;
    this.fill = this.el.querySelector('.loader-fill');
    this.loader = this.el.querySelector('.loader');
  }

  setProgress(p) {
    this.fill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  }

  showPlay() {
    this.loader.innerHTML = `
      <button class="play-cue">${PLAY_ICON}<span>Press play</span></button>
      <p class="play-cue-hint">turn the sound on</p>`;
    this.loader.querySelector('.play-cue').addEventListener('click', () => this.onPlay());
  }

  hide() {
    this.el.classList.add('hidden');
    setTimeout(() => this.el.remove(), 900);
  }
}
