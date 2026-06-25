import { asset, STATES } from '../config.js';

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
};

// Must match --lb-fade in style.css: how long the lightbox blur/darken takes
// to recede on close, after which the media element is cleared.
const FADE_MS = 1400;

/**
 * Builds and owns the DOM content layer: the four state panels, the audio
 * track panel, the video lightbox, and the contact card. Reads everything
 * from content.json — no hard-coded copy.
 */
export class Overlay {
  constructor(content, handlers) {
    this.content = content;
    // { onSelectTrack, onTransport, onPulse, onMediaOpen, onMediaClose }
    this.handlers = handlers;
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
    this.renderVideo();
    this.renderWeb();
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
        <div class="tile-area" aria-hidden="true"></div>
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

  // --- Video -------------------------------------------------------------
  renderVideo() {
    const el = this.states.video;
    el.innerHTML =
      this.head('Video', 'Pieces and experiments. Tap to open.') +
      `<div class="state-body"><div class="card-grid video-grid"></div></div>`;
    const grid = el.querySelector('.video-grid');
    const scrollRoot = el.querySelector('.state-body');

    // Lazy-load the thumbnail clips: each <video> spins up its own decoder, so
    // loading the whole grid at once is what makes phones stutter when a clip
    // is opened. Fetch a thumbnail's poster frame only once its card is near
    // the visible area; cards out of view stay `preload="none"` with no src.
    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries, obs) => {
              for (const e of entries) {
                if (!e.isIntersecting) continue;
                const vid = e.target.querySelector('video[data-src]');
                if (vid) {
                  vid.preload = 'metadata';
                  vid.src = vid.dataset.src;
                  vid.removeAttribute('data-src');
                }
                obs.unobserve(e.target);
              }
            },
            { root: scrollRoot, rootMargin: '200px' }
          )
        : null;

    this.content.videos.forEach((v) => {
      const card = document.createElement('div');
      card.className = 'card video-card panel';
      const isVideo = v.type === 'video';
      const src = `${asset(v.file)}#t=0.1`;
      // With IntersectionObserver we defer the source to `data-src` and load it
      // on demand; without it (old browsers) fall back to eager metadata load.
      const videoTag = io
        ? `<video muted playsinline preload="none" data-src="${src}"></video>`
        : `<video muted playsinline preload="metadata" src="${src}"></video>`;
      card.innerHTML = `
        <div class="thumb">
          ${
            isVideo
              ? videoTag
              : `<img loading="lazy" src="${asset(v.file)}" alt="${v.title || ''}" />`
          }
        </div>
        <div class="vc-body">
          <h3 class="vc-title">${v.title || 'Untitled'}</h3>
          <p class="vc-desc">${v.description || ''}</p>
        </div>`;
      card.addEventListener('click', () => this.openLightbox(v));
      grid.appendChild(card);
      if (io && isVideo) io.observe(card);
    });
  }

  // --- Web ---------------------------------------------------------------
  renderWeb() {
    const el = this.states.web;
    el.innerHTML =
      this.head('Web', 'Web projects and experiments. Hover sends a ripple through the field.') +
      `<div class="state-body"><div class="card-grid web-grid"></div></div>`;
    const grid = el.querySelector('.web-grid');
    this.content.web.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'card web-card panel';
      const tags = (b.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
      card.innerHTML = `
        <h3>${b.title || 'Untitled'}</h3>
        <p>${b.description || ''}</p>
        ${tags ? `<div class="tag-row">${tags}</div>` : ''}
        ${b.url ? `<a class="web-link" href="${b.url}" target="_blank" rel="noopener">Open ↗</a>` : ''}`;
      const ripple = (e) => {
        const r = card.getBoundingClientRect();
        // Normalize against the canvas box (same basis the field is rendered
        // in), not window.inner*, so the ripple origin lines up on mobile too.
        const cv = document.getElementById('scene-canvas');
        const vw = (cv && cv.clientWidth) || window.innerWidth;
        const vh = (cv && cv.clientHeight) || window.innerHeight;
        const nx = ((r.left + r.width / 2) / vw) * 2 - 1;
        const ny = -(((r.top + r.height / 2) / vh) * 2 - 1);
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
    clearTimeout(this._mediaClearTimer); // cancel a pending clear from a quick close→open
    if (v.type === 'video') {
      media.innerHTML = `<video src="${asset(v.file)}" controls autoplay playsinline></video>`;
    } else {
      media.innerHTML = `<img src="${asset(v.file)}" alt="${v.title || ''}" />`;
    }
    lb.querySelector('h3').textContent = v.title || '';
    lb.querySelector('p').textContent = v.description || '';
    lb.classList.add('open');
    this.handlers.onMediaOpen?.(v); // ducks the music for videos
  }

  closeLightbox() {
    const lb = this.lightbox;
    if (!lb.classList.contains('open')) return;
    lb.classList.remove('open');
    this.handlers.onMediaClose?.(); // sweeps the music back in
    // Stop the video's own audio at once so it doesn't overlap the returning
    // music; keep the paused frame so the backdrop can fade out, then clear it
    // once the fade (--lb-fade) has finished.
    const vid = lb.querySelector('.lb-media video');
    if (vid) vid.pause();
    clearTimeout(this._mediaClearTimer);
    this._mediaClearTimer = setTimeout(() => {
      lb.querySelector('.lb-media').innerHTML = '';
    }, FADE_MS);
  }
}
