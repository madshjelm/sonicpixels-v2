import './style.css';
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  MathUtils,
} from 'three';
import { loadContent } from './content.js';
import { deviceTier, reducedMotion } from './config.js';
import { PixelField } from './scene/PixelField.js';
import { makeReactors } from './scene/reactors.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Overlay } from './ui/Overlay.js';
import { Tuner } from './ui/Tuner.js';
import { Landing } from './ui/Landing.js';
import { hasWebGL, renderFallback } from './fallback.js';

const FOV = 42;
const CAM_D = 10;
const DOCK_BREAKPOINT = 820;

main();

async function main() {
  const app = document.getElementById('app');
  const content = await loadContent();

  if (!hasWebGL()) {
    renderFallback(content, app);
    return;
  }

  // --- Background + canvas ---------------------------------------------
  const bg = document.createElement('div');
  bg.id = 'bg-gradient';
  app.appendChild(bg);

  const canvas = document.createElement('canvas');
  canvas.id = 'scene-canvas';
  app.appendChild(canvas);

  const tier = deviceTier();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  let dprCap = tier.maxDpr;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, CAM_D);

  const field = new PixelField(scene, tier);
  const reactors = makeReactors();
  field.setReactor(reactors.audio);

  // --- Audio + UI -------------------------------------------------------
  const audio = new AudioEngine(content.tracks);

  // How long the music sweep + lightbox blur take. Kept short for users who
  // prefer reduced motion (this also drives --lb-fade via the CSS media query).
  const DUCK_SECS = reducedMotion ? 0.25 : 1.4;

  // While the lightbox covers the screen we freeze the field render (it's
  // hidden) to free the GPU for video decode and keep the backdrop static.
  let lightboxOpen = false;
  let resumeTimer;

  const overlay = new Overlay(content, {
    onSelectTrack: (i) => audio.select(i),
    onTransport: (action) => {
      if (action === 'toggle') audio.togglePlay();
      else if (action === 'next') audio.next();
      else if (action === 'prev') audio.prev();
    },
    onPulse: (nx, ny, strength) => field.pulseAt(nx, ny, strength),
    // Opening a video ducks the music (sweep closed, then pause); closing the
    // player restores it. Images have no audio, so only videos duck.
    onMediaOpen: (v) => {
      lightboxOpen = true; // freeze the field; the player covers it
      clearTimeout(resumeTimer);
      if (v.type === 'video') audio.duckForVideo(DUCK_SECS);
    },
    onMediaClose: () => {
      audio.restoreFromVideo(DUCK_SECS);
      // Stay frozen until the blur/darken has fully receded, then resume.
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        lightboxOpen = false;
      }, DUCK_SECS * 1000 + 80);
    },
  });

  const overlayRoot = document.createElement('div');
  overlayRoot.id = 'overlay';
  overlayRoot.appendChild(overlay.root);

  const tuner = new Tuner((state) => {
    overlay.setState(state);
    field.applyLayout(state);
    field.setReactor(reactors[state]);
  });
  overlayRoot.appendChild(tuner.el);
  app.appendChild(overlayRoot);

  audio.onState = () => overlay.setNowPlaying(audio.index, audio.playing);
  if (content.tracks.length) overlay.setNowPlaying(0, false); // pre-fill the panel

  // --- Landing ----------------------------------------------------------
  let started = false;
  const landing = new Landing(() => {
    if (started) return;
    started = true;
    audio.play(0);
    overlay.setState('audio');
    tuner.show();
    landing.hide();
    // Re-fit the matrix now the player panel + tuner are actually on screen.
    requestAnimationFrame(() => field.applyLayout('audio'));
  });
  app.appendChild(landing.el);

  // --- Tile regions (measured from the live UI) ------------------------
  // Each state's tiles fill a normalized rectangle ({cx,cy,hw,hh} in [-1,1])
  // computed from the real header / tuner / player boxes, so the field stays
  // clear of the UI and fills deliberately at any screen size.
  const PAD = 16;
  const rectToRegion = (x0, y0, x1, y1, vw, vh) => {
    const nxL = (x0 / vw) * 2 - 1;
    const nxR = (x1 / vw) * 2 - 1;
    const nyT = 1 - (y0 / vh) * 2;
    const nyB = 1 - (y1 / vh) * 2;
    return { cx: (nxL + nxR) / 2, cy: (nyT + nyB) / 2, hw: (nxR - nxL) / 2, hh: (nyT - nyB) / 2 };
  };

  function regionFor(state) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const docked = vw <= DOCK_BREAKPOINT ? 'bottom' : 'right';
    const stateEl = overlay.states[state];
    const headRect = stateEl?.querySelector('.state-head')?.getBoundingClientRect();
    const tunerH = tuner.el.getBoundingClientRect().height || 96;
    const headBottom = headRect ? headRect.bottom : 120;
    const sideMargin = Math.max(PAD, vw * 0.02);

    let left = sideMargin;
    let right = vw - sideMargin;
    let top, bottom;

    if (state === 'audio') {
      // Generous air on every edge: below the header, off the panel/tuner/sides.
      const air = PAD * 2;
      left = Math.max(PAD * 2, vw * 0.03);
      right = vw - left;
      top = headBottom + air;
      const panel = stateEl?.querySelector('.audio-panel')?.getBoundingClientRect();
      if (docked === 'right') {
        if (panel && panel.width) right = panel.left - air * 1.4;
        bottom = vh - tunerH - air;
      } else {
        bottom = (panel && panel.height ? panel.top : vh * 0.5) - air;
      }
      bottom = Math.max(bottom, top + 60);
      right = Math.max(right, left + 80);
      return { region: rectToRegion(left, top, right, bottom, vw, vh), docked };
    }

    if (state === 'contact') {
      // A roomy area for the calm halo (sits behind the centred card).
      top = PAD;
      bottom = Math.max(vh - tunerH - PAD * 1.5, top + 60);
      return { region: rectToRegion(left, top, right, bottom, vw, vh), docked };
    }

    // Visual / Web: a clean ceiling just below the header text so tiles
    // never sit over it, filling the full width down to above the tuner.
    top = headBottom + PAD;
    bottom = Math.max(vh - tunerH - PAD * 1.5, top + 60);
    return { region: rectToRegion(left, top, right, bottom, vw, vh), docked };
  }
  field.regionFor = regionFor;

  // --- Sizing -----------------------------------------------------------
  // (adaptive-quality frame counters; declared here so resize() can reset them)
  let frames = 0;
  let acc = 0;
  function resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);

    const worldHalfH = Math.tan(MathUtils.degToRad(FOV) / 2) * CAM_D;
    const worldHalfW = worldHalfH * camera.aspect;
    const docked = w <= DOCK_BREAKPOINT ? 'bottom' : 'right';
    field.setBounds(worldHalfW, worldHalfH, docked);
    // Ignore the frame-time spike a resize causes (avoid false degradation).
    frames = 0;
    acc = 0;
  }
  window.addEventListener('resize', resize);
  // Mobile browsers resize the visual viewport when the URL bar shows/hides,
  // which changes the player panel's height. Track it so the matrix re-fits.
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // Keep the Audio matrix fitted above the player panel whenever that panel
  // changes size (URL bar, fonts, content) or finishes animating in. This is
  // what keeps the tiles from ending up hidden behind the player on mobile.
  let refitQueued = false;
  const refitAudio = () => {
    if (field.state !== 'audio' || refitQueued) return;
    refitQueued = true;
    requestAnimationFrame(() => {
      refitQueued = false;
      if (field.state === 'audio') field.applyLayout('audio');
    });
  };
  const audioPanelEl = overlay.states.audio.querySelector('.audio-panel');
  if (audioPanelEl && 'ResizeObserver' in window) {
    new ResizeObserver(refitAudio).observe(audioPanelEl);
  }
  overlay.states.audio.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform') refitAudio();
  });

  // The DOM states stay hidden behind the landing; the audio panel only
  // appears once the user presses play (see the landing handler above).

  // --- Adaptive quality -------------------------------------------------
  // Only the device-pixel-ratio is adjusted, never the instance count — the
  // pixel field must always stay a complete grid. It recovers when the frame
  // rate is healthy again, and the window is reset on resize so a resize
  // spike can't permanently degrade quality.
  function adapt(dt) {
    frames++;
    acc += dt;
    if (acc < 1.2) return;
    const fps = frames / acc;
    frames = 0;
    acc = 0;
    const maxDpr = tier.maxDpr;
    if (fps < 45 && dprCap > 1) {
      dprCap = Math.max(1, dprCap - 0.25);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    } else if (fps > 57 && dprCap < maxDpr) {
      dprCap = Math.min(maxDpr, dprCap + 0.25);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    }
  }

  // --- Render loop ------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    audio.update(dt);
    // Skip the GPU-heavy field render while the lightbox covers the screen.
    if (!lightboxOpen) {
      field.update(dt, audio.features, audio.playing && started);
      renderer.render(scene, camera);
      adapt(dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- Loader → press play ---------------------------------------------
  await runLoader(landing);
  landing.showPlay();
}

// A short, honest loading bar: advance as fonts settle and the first frames
// paint, then invite the press.
function runLoader(landing) {
  return new Promise((resolve) => {
    let p = 0;
    landing.setProgress(0.15);
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => (p = Math.max(p, 0.7)));
    const id = setInterval(() => {
      p = Math.min(1, p + 0.08 + Math.random() * 0.06);
      landing.setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setTimeout(resolve, 250);
      }
    }, 90);
  });
}
