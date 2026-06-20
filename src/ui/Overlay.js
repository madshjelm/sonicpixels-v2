import { asset, STATES } from '../config.js';

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
};

/**
 * Builds and owns the DOM content layer: the four state panels, the audio
 * track panel, the visual lightbox, and the contact card. Reads everything
 * from content.json — no hard-coded copy.
 */
export class Overlay {
  constructor(content, handlers) {
    this.content = content;
    this.handlers = handlers; // { onSelectTrack, onTransport, onPulse }
    this.root = document.createElement('div');
    this.root.id = 'state-root';
    this.states = {};
    STATES.forEach((s) => {
      const el = document.createElement('section');
      el.className = `state ${s}-state`;
      el.dataset.state = s;
      this.states[s] = el;
      this.root.appendChild(el);
    });
    this.renderAudio();
    this.renderVisual();
    this.renderBuilds();
    this.renderContact();
    this.buildLightbox();
  }

  setState(name) {
    STATES.forEach((s) =>
      this.states[s].classList.toggle('active', s === name)
    );
  }

  head(title, sub) {
    return `<div class="state-head">
      <h2 class="state-title">${title}</h2>
      ${sub ? `<p class="state-sub">${sub}</p>` : ''}
    </div>`;
  }

  // --- Audio -------------------------------------------------------------
  renderAudio() {
    const el = this.states.audio;
    el.innerHTML =
      this.head('Audio', 'Watch the field listen. Pick a track; the grid lights up by frequency.') +
      `<div class="audio-stage">
        <aside class="audio-panel card panel">
          <div class="now-playing">
            <div class="np-head">
              <img class="np-art" alt="" />
              <div class="np-meta">
                <p class="np-band">Now Playing</p>
                <h3 class="np-title"></h3>
              </div>
            </div>
            <p class="np-desc"></p>
            <div class="transport">
              <button class="t-btn prev" aria-label="Previous track">${ICON.prev}</button>
              <button class="t-btn play" aria-label="Play or pause">${ICON.play}</button>
              <button class="t-btn next" aria-label="Next track">${ICON.next}</button>
            </div>
          </div>
          <div class="tracklist"></div>
        </aside>
      </div>`;

    this.npArt = el.querySelector('.np-art');
    this.npTitle = el.querySelector('.np-title');
    this.npDesc = el.querySelector('.np-desc');
    this.playBtn = el.querySelector('.t-btn.play');

    el.querySelector('.prev').addEventListener('click', () => this.handlers.onTransport('prev'));
    el.querySelector('.next').addEventListener('click', () => this.handlers.onTransport('next'));
    this.playBtn.addEventListener('click', () => this.handlers.onTransport('toggle'));

    const list = el.querySelector('.tracklist');
    this.trackRows = this.content.tracks.map((tr, i) => {
      const row = document.createElement('button');
      row.className = 'track-row';
      row.innerHTML = `
        ${tr.artwork ? `<img loading="lazy" src="${asset(tr.artwork)}" alt="" />` : ''}
        <div class="tr-meta">
          <div class="tr-title">${tr.title || 'Untitled'}</div>
          <div class="tr-desc">${tr.description || ''}</div>
        </div>
        <div class="tr-eq"><span></span><span></span><span></span></div>`;
      row.addEventListener('click', () => this.handlers.onSelectTrack(i));
      list.appendChild(row);
      return row;
    });
  }

  setNowPlaying(index, playing) {
    const tr = this.content.tracks[index];
    if (!tr) return;
    this.npTitle.textContent = tr.title || 'Untitled';
    this.npDesc.textContent = tr.description || '';
    if (tr.artwork) {
      this.npArt.src = asset(tr.artwork);
      this.npArt.style.display = '';
    } else {
      this.npArt.style.display = 'none';
    }
    this.trackRows.forEach((r, i) => r.classList.toggle('current', i === index));
    this.setPlaying(playing);
  }

  setPlaying(playing) {
    if (this.playBtn) this.playBtn.innerHTML = playing ? ICON.pause : ICON.play;
  }

  // --- Visual ------------------------------------------------------------
  renderVisual() {
    const el = this.states.visual;
    el.innerHTML =
      this.head('Visual', 'Pieces and experiments. Tap to open.') +
      `<div class="state-body"><div class="card-grid visual-grid"></div></div>`;
    const grid = el.querySelector('.visual-grid');
    this.content.visuals.forEach((v, i) => {
      const card = document.createElement('div');
      card.className = 'card visual-card panel';
      const isVideo = v.type === 'video';
      card.innerHTML = `
        <div class="thumb">
          ${
            isVideo
              ? `<video muted loop playsinline preload="metadata" src="${asset(v.file)}#t=0.1"></video>`
              : `<img loading="lazy" src="${asset(v.file)}" alt="${v.title || ''}" />`
          }
        </div>
        <div class="vc-body">
          <h3 class="vc-title">${v.title || 'Untitled'}</h3>
          <p class="vc-desc">${v.description || ''}</p>
        </div>`;
      card.addEventListener('click', () => this.openLightbox(v));
      grid.appendChild(card);
    });
  }

  // --- Builds ------------------------------------------------------------
  renderBuilds() {
    const el = this.states.builds;
    el.innerHTML =
      this.head('Builds', 'Things I have made. Hover sends a ripple through the field.') +
      `<div class="state-body"><div class="card-grid builds-grid"></div></div>`;
    const grid = el.querySelector('.builds-grid');
    this.content.builds.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'card build-card panel';
      const tags = (b.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
      card.innerHTML = `
        <h3>${b.title || 'Untitled'}</h3>
        <p>${b.description || ''}</p>
        ${tags ? `<div class="tag-row">${tags}</div>` : ''}
        ${b.url ? `<a class="build-link" href="${b.url}" target="_blank" rel="noopener">Open ↗</a>` : ''}`;
      const ripple = (e) => {
        const r = card.getBoundingClientRect();
        const nx = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1;
        const ny = -(((r.top + r.height / 2) / window.innerHeight) * 2 - 1);
        this.handlers.onPulse(nx, ny, 0.5);
      };
      card.addEventListener('mouseenter', ripple);
      card.addEventListener('touchstart', ripple, { passive: true });
      grid.appendChild(card);
    });
  }

  // --- Contact -----------------------------------------------------------
  renderContact() {
    const el = this.states.contact;
    const c = this.content.contact;
    const links = (c.links || [])
      .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
      .join('');
    el.innerHTML =
      this.head('Contact', '') +
      `<div class="state-body">
        <div class="card contact-card panel">
          ${c.intro ? `<p class="ct-intro">${c.intro}</p>` : ''}
          ${c.email ? `<a class="contact-email" href="mailto:${c.email}">${c.email}</a>` : ''}
          <div class="contact-links">${links}</div>
        </div>
      </div>`;
  }

  // --- Lightbox ----------------------------------------------------------
  buildLightbox() {
    const lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = `
      <button class="lb-close" aria-label="Close">×</button>
      <div class="lb-card">
        <div class="lb-media"></div>
        <div class="lb-body"><h3></h3><p></p></div>
      </div>`;
    document.body.appendChild(lb);
    this.lightbox = lb;
    const close = () => this.closeLightbox();
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.addEventListener('click', (e) => {
      if (e.target === lb) close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  openLightbox(v) {
    const lb = this.lightbox;
    const media = lb.querySelector('.lb-media');
    if (v.type === 'video') {
      media.innerHTML = `<video src="${asset(v.file)}" controls autoplay playsinline></video>`;
    } else {
      media.innerHTML = `<img src="${asset(v.file)}" alt="${v.title || ''}" />`;
    }
    lb.querySelector('h3').textContent = v.title || '';
    lb.querySelector('p').textContent = v.description || '';
    lb.classList.add('open');
  }

  closeLightbox() {
    this.lightbox.classList.remove('open');
    this.lightbox.querySelector('.lb-media').innerHTML = '';
  }
}
