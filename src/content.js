import { asset } from './config.js';

// Loads /public/content.json. Everything the site shows comes from here —
// adding a track, visual, or web project is a JSON edit, no code change.
export async function loadContent() {
  const url = asset('content.json');
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`content.json ${res.status}`);
    return normalise(await res.json());
  } catch (err) {
    console.error('Could not load content.json', err);
    return normalise({});
  }
}

function normalise(data) {
  return {
    site: data.site || { title: 'Sonic Pixels', tagline: '' },
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
    visuals: Array.isArray(data.visuals) ? data.visuals : [],
    web: Array.isArray(data.web)
      ? data.web
      : Array.isArray(data.builds)
        ? data.builds
        : [],
    contact: data.contact || { email: '', links: [] },
  };
}
