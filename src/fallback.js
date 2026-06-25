import { asset } from './config.js';

// Clean, static, fully-accessible version shown when WebGL is unavailable.
// Native <audio>/<img>/<video> so every piece of content still works.
export function renderFallback(content, mount) {
  const tracks = content.tracks
    .map(
      (t) => `
      <article class="card web-card">
        <h3>${t.title || 'Untitled'}</h3>
        <p>${t.description || ''}</p>
        <audio controls preload="none" src="${asset(t.file)}"></audio>
      </article>`
    )
    .join('');

  const videos = content.videos
    .map(
      (v) => `
      <article class="card video-card">
        <div class="thumb">${
          v.type === 'video'
            ? `<video controls preload="metadata" src="${asset(v.file)}"></video>`
            : `<img loading="lazy" src="${asset(v.file)}" alt="${v.title || ''}" />`
        }</div>
        <div class="vc-body"><h3 class="vc-title">${v.title || ''}</h3><p class="vc-desc">${v.description || ''}</p></div>
      </article>`
    )
    .join('');

  const web = content.web
    .map(
      (b) => `
      <article class="card web-card">
        <h3>${b.title || ''}</h3>
        <p>${b.description || ''}</p>
        <div class="tag-row">${(b.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
        ${b.url ? `<a class="web-link" href="${b.url}" target="_blank" rel="noopener">Open ↗</a>` : ''}
      </article>`
    )
    .join('');

  const c = content.contact || {};
  const links = (c.links || [])
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
    .join('');

  mount.innerHTML = `
    <div class="fallback">
      <div class="fallback-inner">
        <h1>Sonic Pixels<span style="display:inline-block;width:0.22em;height:0.22em;margin-left:0.08em;background:var(--coral);vertical-align:0.02em"></span></h1>
        <p class="state-sub">A simplified view — your browser does not support WebGL, so the reactive scene is turned off. All the content is here.</p>
        <section><h2>Audio</h2><div class="card-grid web-grid">${tracks}</div></section>
        <section><h2>Video</h2><div class="card-grid video-grid">${videos}</div></section>
        <section><h2>Web</h2><div class="card-grid web-grid">${web}</div></section>
        <section><h2>Contact</h2>
          <div class="card contact-card">
            ${c.intro ? `<p class="ct-intro">${c.intro}</p>` : ''}
            ${c.email ? `<a class="contact-email" href="mailto:${c.email}">${c.email}</a>` : ''}
            <div class="contact-links">${links}</div>
          </div>
        </section>
      </div>
    </div>`;
}

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (e) {
    return false;
  }
}
