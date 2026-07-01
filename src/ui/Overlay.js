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
      this.head('Audio', 'Instrumental music composed, performed, and produced by me.') +
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
    // Freeze the now-playing track's equalizer when paused so the moving bars
    // never imply that audio is still running.
    this.states.audio.classList.toggle('is-paused', !playing);
  }

  // --- Video -------------------------------------------------------------
  renderVideo() {
    const el = this.states.video;
    el.innerHTML =
      this.head('Video', 'Selected video projects exploring AI, editing, motion, and visual storytelling') +
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
      // Thumbnail priority: a provided artwork image, else a poster frame
      // grabbed from the clip itself (videos), else the image file.
      const thumb = v.artwork
        ? `<img loading="lazy" src="${asset(v.artwork)}" alt="${v.title || ''}" />`
        : isVideo
          ? videoTag
          : `<img loading="lazy" src="${asset(v.file)}" alt="${v.title || ''}" />`;
      card.innerHTML = `
        <div class="thumb">${thumb}</div>
        <div class="vc-body">
          <h3 class="vc-title">${v.title || 'Untitled'}</h3>
          <p class="vc-desc">${v.description || ''}</p>
        </div>`;
      card.addEventListener('click', () => this.openLightbox(v));
      grid.appendChild(card);
      // Only the lazy poster-frame videos need the observer; artwork loads itself.
      if (io && isVideo && !v.artwork) io.observe(card);
    });
  }

  // --- Web ---------------------------------------------------------------
  renderWeb() {
    const el = this.states.web;
    el.innerHTML =
      this.head('Web', 'Selected websites and interactive web projects I’ve built') +
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
        this.handlers.onPulse(nx, ny, 0.7);
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
    const card = lb.querySelector('.lb-card');
    clearTimeout(this._mediaClearTimer); // cancel a pending clear from a quick close→open
    const token = (this._lbToken = (this._lbToken || 0) + 1); // ignore stale async fits
    card.style.maxWidth = ''; // reset any width fitted to a previous clip
    media.classList.remove('loading');

    const hasArt = !!v.artwork;
    if (v.type === 'video') {
      // The artwork doubles as the video's poster: a <video> with a poster but
      // no loaded data takes the poster's dimensions, so the frame is the right
      // shape from the first paint — no default 300x150 box, no snap on load.
      const poster = hasArt ? ` poster="${asset(v.artwork)}"` : '';
      media.innerHTML = `<video${poster} src="${asset(v.file)}" controls autoplay playsinline></video>`;
    } else {
      media.innerHTML = `<img src="${asset(v.file)}" alt="${v.title || ''}" />`;
    }
    const el = media.firstElementChild;
    // Shrink the card to the media's displayed width so a portrait clip's
    // caption wraps under it instead of leaving blank rails on either side.
    const fit = () => { if (token === this._lbToken) this.fitCardToMedia(el); };

    if (v.type === 'video' && hasArt) {
      // Size the card to the poster straight away; the video's matching
      // dimensions then arrive without resizing anything.
      this.fitCardToArtwork(asset(v.artwork), token);
      el.addEventListener('loadedmetadata', fit, { once: true });
    } else {
      // No poster (a clip without artwork, or an image): hold a reserved frame
      // with a spinner and keep the element hidden so nothing flashes at the
      // wrong size, then reveal and fit once its real dimensions are known.
      media.classList.add('loading');
      el.classList.add('lb-await');
      const reveal = () => {
        if (token !== this._lbToken) return;
        media.classList.remove('loading');
        el.classList.remove('lb-await');
        this.fitCardToMedia(el);
      };
      el.addEventListener(v.type === 'video' ? 'loadedmetadata' : 'load', reveal, { once: true });
      if (v.type !== 'video' && el.complete && el.naturalWidth) reveal();
    }

    lb.querySelector('h3').textContent = v.title || '';
    lb.querySelector('p').textContent = v.description || '';
    lb.classList.add('open');
    this.handlers.onMediaOpen?.(v); // ducks the music for videos
  }

  // Cap the lightbox card at the media's on-screen width. The media is capped
  // at 70vh tall (see .lb-media in style.css), so a tall/portrait clip is shown
  // far narrower than the card's default max — matching the card to it removes
  // the empty space beside the video and lets the caption reflow to wrap.
  fitCardToMedia(el) {
    const w = el.videoWidth || el.naturalWidth;
    const h = el.videoHeight || el.naturalHeight;
    if (!w || !h) return;
    const dispH = Math.min(h, window.innerHeight * 0.7);
    const dispW = Math.round((dispH * w) / h);
    this.lightbox.querySelector('.lb-card').style.maxWidth =
      `min(${dispW}px, 880px, 100%)`;
  }

  // Preload the artwork (a clip's poster) and size the card to it immediately,
  // so a portrait video's card is already correct before its metadata loads.
  fitCardToArtwork(src, token) {
    const img = new Image();
    img.addEventListener(
      'load',
      () => { if (token === this._lbToken) this.fitCardToMedia(img); },
      { once: true }
    );
    img.src = src;
  }

  closeLightbox() {
    const lb = this.lightbox;
    if (!lb.classList.contains('open')) return;
    lb.classList.remove('open');
    this._lbToken = (this._lbToken || 0) + 1; // cancel any in-flight fit callbacks
    lb.querySelector('.lb-media').classList.remove('loading');
    this.handlers.onMediaClose?.(); // sweeps the music back in
    // Stop the video's own audio at once so it doesn't overlap the returning
    // music; keep the paused frame so the backdrop can fade out, then clear it
    // once the fade (--lb-fade) has finished.
    const vid = lb.querySelector('.lb-media video');
    if (vid) vid.pause();
    clearTimeout(this._mediaClearTimer);
    this._mediaClearTimer = setTimeout(() => {
      lb.querySelector('.lb-media').innerHTML = '';
      lb.querySelector('.lb-card').style.maxWidth = ''; // drop the fitted width
    }, FADE_MS);
  }
}
