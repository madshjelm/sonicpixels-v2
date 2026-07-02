# Sonic Pixels

A one-page, audio-reactive WebGL portfolio. A modest field of solid-colour
square "pixels" — a single `THREE.InstancedMesh` — rearranges between four
states (Audio · Video · Web · Contact) and reacts in real time to whatever
music is playing. Warm, soft, light mode. No glow, no nebula — chunky, friendly
tiles in a calm daylight space.

Built with **Vite + vanilla Three.js** and the **Web Audio API**. No backend,
no CMS. All content lives in a single JSON file.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Press **Press play** on the landing screen to start the first track — audio can
only begin from a user gesture (mobile autoplay rules). After that the music
keeps playing across every state and the tiles react to it.

Build a production bundle:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

---

## Editing content — no code required

Everything the site shows is read from **`public/content.json`** and the files
in **`public/media/`**. To add a track, video, or web project, drop a file in
`public/media/` and add a JSON entry. That's it — no code changes.

### `content.json` schema (commented example)

```jsonc
{
  "site": {
    "title": "Sonic Pixels",
    "tagline": "Sound you can see."
  },

  // AUDIO — each track is a card with a title, description and audio file.
  // Selecting a track crossfades the audio and the visuals.
  "tracks": [
    {
      "title": "Pulse Garden",
      "description": "Any short description you like.",
      "file": "media/track-1-pulse-garden.wav", // path relative to /public
      "artwork": "media/art-1.svg"              // optional square image
    }
  ],

  // VIDEO — video (and image) pieces, shown as a grid of thumbnails.
  // Click opens a card-style lightbox. Thumbnails are lazy-loaded.
  // (The legacy key "visuals" is still accepted for older content.json files.)
  "videos": [
    {
      "type": "video",            // videos play in the lightbox
      "file": "media/clip.mp4",
      "artwork": "media/clip.jpg", // optional thumbnail. Doubles as the
                                   // lightbox loading poster, so the frame
                                   // shows at the right shape while the clip
                                   // streams in (no flash/crop). If omitted, a
                                   // frame grabbed from the clip is used.
      "title": "A moving piece",
      "description": "…"
    },
    {
      "type": "image",            // "image" or "video"
      "file": "media/visual-1.svg",
      "title": "Tile Study 01",
      "description": "…"
    }
  ],

  // WEB — project cards with tags and a link out.
  "web": [
    {
      "title": "Sonic Pixels",
      "description": "…",
      "tags": ["Three.js", "Web Audio", "Vite"],
      "url": "https://sonicpixels.dk"
    }
  ],

  // CONTACT — the calmest state.
  "contact": {
    "intro": "Available for multimedia projects and web development",
    "email": "mbsh@momentum-ai.dk",
    "links": [
      { "label": "LinkedIn", "url": "https://www.linkedin.com/in/mads-bjoern-hjelmar/" },
      { "label": "Momentum AI", "url": "https://momentum-ai.dk/" }
    ]
  }
}
```

> Paths in `content.json` are relative to the `public/` folder (e.g.
> `media/track.wav`). They are resolved against the site's base URL at runtime,
> so they work on the custom domain and on a GitHub Pages project URL alike.

### Swapping in your own audio

Add your own `.mp3` / `.wav` / `.ogg` files to `public/media/` and point the
`tracks` entries at them. Audio is streamed and buffered ahead as it plays, so
large files are fine.

Need quick test tracks? A small script synthesizes three short placeholder
tracks (plus SVG placeholder artwork and six visual placeholders) with clear
bass / mid / high content, so the reactive visuals work without real music:

```bash
npm run generate:media
```

---

## Deploy to GitHub Pages

The repo includes a workflow at `.github/workflows/deploy.yml` that builds with
Vite and publishes `dist/` to GitHub Pages on every push to `main`.

1. Push this repository to GitHub (`madshjelm/sonicpixels-v2`), on `main`.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or click **Run workflow** under the Actions tab). The site
   builds and deploys automatically. Subsequent pushes redeploy.

That's all the configuration needed — `vite.config.js` uses a **relative base
(`base: './'`)**, so the build works whether it's served from
`madshjelm.github.io/sonicpixels-v2/` or from the custom domain root.

---

## Point `sonicpixels.dk` at it (Nordicway DNS)

The file `public/CNAME` already contains `sonicpixels.dk`, so GitHub keeps the
custom domain set after each deploy. You just need the DNS records.

**1. In your Nordicway DNS panel**, create these records for the apex domain
`sonicpixels.dk`:

| Type  | Host / Name | Value                |
| ----- | ----------- | -------------------- |
| A     | `@`         | `185.199.108.153`    |
| A     | `@`         | `185.199.109.153`    |
| A     | `@`         | `185.199.110.153`    |
| A     | `@`         | `185.199.111.153`    |

(Optional, for IPv6, add four `AAAA` records on `@`:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
`2606:50c0:8003::153`.)

**2. For the `www` subdomain**, add a `CNAME` record:

| Type  | Host / Name | Value                    |
| ----- | ----------- | ------------------------ |
| CNAME | `www`       | `madshjelm.github.io.`   |

**3. In GitHub → Settings → Pages → Custom domain**, confirm it shows
`sonicpixels.dk`, wait for the DNS check to pass, then tick **Enforce HTTPS**.

> Replacing the old WordPress/Elementor site: once the DNS records above point
> at GitHub and HTTPS is enforced, remove the old hosting's A/CNAME records so
> only GitHub serves the domain. DNS changes can take up to a few hours.
>
> After the domain is live, refresh cached link previews so old unfurls (the
> generic icon) get replaced: re-scrape with the
> [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and the
> [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/), and
> re-paste the link in Teams/Slack.

---

## SEO & social cards

`index.html` carries the SEO and link-preview metadata, and a few static files
in `public/` round it out:

- **Favicon / app icon** — `media/sonix-pixels-logo.png` (also the
  `apple-touch-icon` and the manifest icon).
- **Social card** — Open Graph + Twitter tags point at
  `media/sonic-pixels-social.png` (1178×616). These use absolute
  `https://sonicpixels.dk/…` URLs, so the preview image resolves once DNS is
  live (scrapers don't follow relative paths).
- **`public/robots.txt`** and **`public/sitemap.xml`** — allow indexing and list
  the single page; `<link rel="canonical">` points search engines at the apex
  domain.
- **`public/site.webmanifest`** — name, theme colour and install icon for the
  Android "add to home screen".

To change the logo or social image, drop a replacement in `public/media/` (keep
the filenames, or update the references in `index.html`). After a change,
re-scrape with the debuggers linked above.

---

## How it works

- **One scene, four states.** A single `THREE.InstancedMesh` of plane geometry
  holds a few hundred tiles (full density on desktop, fewer on phones). Each
  state is just a different set of per-tile targets (position / size / colour);
  the tiles ease toward them over ~2s, so transitions are smooth and
  interruptible. `src/scene/layouts.js` defines the arrangements.
- **The audio feature bus.** `src/audio/AudioEngine.js` runs the music through
  an `AnalyserNode` and publishes a rich, shared feature set (`src/audio/
  analysis.js` holds the pure, unit-tested DSP): the normalised spectrum,
  log-spaced bands, **bass / mid / high / energy**, a **beat** pulse + phase,
  an RMS **loudness**, a **spectral centroid** (brightness), **spectral flux** +
  per-band **onsets**, and an **auto-gain** so quiet and loud tracks both look
  alive. Easing is asymmetric (quick to rise, slow to fall) so it reads musical.
- **Per-state reactors.** Each state owns a *reactor* (`src/scene/reactors.js`)
  that maps the feature bus onto per-tile drive (scale / lift / brightness /
  tint); `PixelField` is just the substrate that eases and composes. So every
  state has its own relationship to the sound:
  - **Audio** is a true **spectrum analyzer** — columns are frequency (low→high,
    coral→teal), each column fills to its band's amplitude, with a slow
    **peak-hold** cap. Settles to a calm resting wave when quiet.
  - **Video** tints the framing tiles by spectral brightness and gives them a
    gentle spectrum shimmer while you browse.
  - **Web** shimmers quietly; hovering a card sends a small, contained nudge
    through the nearby tiles (deliberately subtle, not a sweeping wave).
  - **Contact** only breathes slowly with the loudness — the calmest state.
- **Soft depth, no glow.** Tiles are flat solid colours with crisp rounded
  edges; a second instanced mesh renders a soft, blurred drop shadow behind
  them. The background is a gentle lavender radial gradient.
- **Content layer.** The reactive field is the backdrop; the cards, track panel,
  gallery, web cards and lightbox are plain DOM (`src/ui/Overlay.js`) so all copy stays in
  `content.json`.

## Performance & accessibility

- **Adaptive quality** from screen size + DPR only: `devicePixelRatio` is
  capped, and phones use a smaller tile grid. If sustained frame time climbs,
  the renderer steps down DPR and then the tile count to hold ~60fps.
- **Lazy loading:** images and video load on demand; audio is streamed.
- **`prefers-reduced-motion`:** a calm, low-motion variant — snappier
  transitions, no bob/breathing.
- **WebGL fallback:** if WebGL is unavailable, a clean static page renders with
  full access to all content (native audio/video players included).

## Project structure

```
public/
  content.json        ← all site content
  media/              ← audio, artwork, video
  CNAME               ← custom domain
src/
  main.js             ← orchestrator (scene, loop, wiring, adaptive quality)
  config.js           ← palette, states, device tier, asset() helper
  content.js          ← loads content.json
  audio/AudioEngine.js ← streaming + the audio feature bus
  audio/analysis.js   ← pure spectral DSP (centroid, flux, log bands…)
  scene/PixelField.js ← the InstancedMesh substrate (easing + compositing)
  scene/reactors.js   ← per-state audio→tile mappings (analyzer, ambient…)
  scene/layouts.js    ← the four state arrangements
  scene/textures.js   ← tile + shadow sprites
  ui/Tuner.js         ← radio-band navigation
  ui/Overlay.js       ← DOM content panels + lightbox
  ui/Landing.js       ← loader + "press play"
  fallback.js         ← no-WebGL static version
scripts/
  generate-media.mjs  ← regenerates placeholder audio + images
.github/workflows/deploy.yml
```
