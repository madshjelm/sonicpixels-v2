import { asset } from './config.js';

// Clean, static, fully-accessible version shown when WebGL is unavailable.
// Native <audio>/<img>/<video> so every piece of content still works.
export function renderFallback(content, mount) {
  const tracks = content.tracks
    .map(
      (t) => `
      <article class="card build-card">
        <h3>${t.title || 'Untitled'}</h3>
        <p>${t.description || ''}</p>
        <audio controls preload="none" src="${asset(t.file)}"></audio>
      </article>`
    )
    .join('');

  const visuals = content.visuals
    .map(
      (v) => `
      <article class="card visual-card">
        <div class="thumb">${
          v.type === 'video'
            ? `<video controls preload="metadata" src="${asset(v.file)}"></video>`
            : `<img loading="lazy" src="${asset(v.file)}" alt="${v.title || ''}" />`
        }</div>
        <div class="vc-body"><h3 class="vc-title">${v.title || ''}</h3><p class="vc-desc">${v.description || ''}</p></div>
      </article>`
    )
    .join('');

  const builds = content.builds
    .map(
      (b) => `
      <article class="card build-card">
        <h3>${b.title || ''}</h3>
        <p>${b.description || ''}</p>
        <div class="tag-row">${(b.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
        ${b.url ? `<a class="build-link" href="${b.url}" target="_blank" rel="noopener">Open ↗</a>` : ''}
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
        <h1>Sonic Pixels<span style="color:var(--coral)">.</span></h1>
        <p class="state-sub">A simplified view — your browser does not support WebGL, so the reactive scene is turned off. All the content is here.</p>
        <section><h2>Audio</h2><div class="card-grid builds-grid">${tracks}</div></section>
        <section><h2>Visual</h2><div class="card-grid visual-grid">${visuals}</div></section>
        <section><h2>Builds</h2><div class="card-grid builds-grid">${builds}</div></section>
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
