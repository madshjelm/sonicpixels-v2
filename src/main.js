import './style.css';
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  MathUtils,
} from 'three';
import { loadContent } from './content.js';
import { deviceTier } from './config.js';
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

  const overlay = new Overlay(content, {
    onSelectTrack: (i) => audio.select(i),
    onTransport: (action) => {
      if (action === 'toggle') audio.togglePlay();
      else if (action === 'next') audio.next();
      else if (action === 'prev') audio.prev();
    },
    onPulse: (nx, ny, strength) => field.pulseAt(nx, ny, strength),
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
  });
  app.appendChild(landing.el);

  // --- Sizing -----------------------------------------------------------
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
  }
  window.addEventListener('resize', resize);
  resize();
  // The DOM states stay hidden behind the landing; the audio panel only
  // appears once the user presses play (see the landing handler above).

  // --- Adaptive quality (screen size + DPR + frame time) ---------------
  let qaLevel = 0;
  let frames = 0;
  let acc = 0;
  function adapt(dt) {
    frames++;
    acc += dt;
    if (acc < 1.2) return;
    const fps = frames / acc;
    frames = 0;
    acc = 0;
    if (fps < 45 && qaLevel < 3) {
      qaLevel++;
      if (qaLevel === 1) {
        dprCap = Math.max(1, dprCap * 0.8);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      } else {
        const frac = qaLevel === 2 ? 0.82 : 0.66;
        const c = Math.floor(field.n * frac);
        field.mesh.count = c;
        field.shadow.count = c;
      }
    }
  }

  // --- Render loop ------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    audio.update(dt);
    field.update(dt, audio.features, audio.playing && started);
    renderer.render(scene, camera);
    adapt(dt);
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
