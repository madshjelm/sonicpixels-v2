import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
} from 'three';
import { makeTileTexture, makeShadowTexture } from './textures.js';
import { layouts } from './layouts.js';
import { reducedMotion } from '../config.js';

const WHITE = new Color(1, 1, 1);

/**
 * The pixel field is the shared substrate: one InstancedMesh of solid-colour
 * tiles plus a matching InstancedMesh of soft drop shadows. It owns the tile
 * buffers, eases them toward the current layout's targets, and composes the
 * final transforms — but it does NOT decide how sound maps to tiles. That is
 * the job of the active Reactor, which writes per-frame "drive" values
 * (dScale / dLift / dBright / dColor) that this class reads when composing.
 */
export class PixelField {
  constructor(scene, tier) {
    this.tier = tier;
    this.n = tier.count;
    this.cols = tier.cols;
    this.rows = tier.rows;
    this.state = 'audio';
    this.docked = 'right';
    this.reactor = null;
    this.pulses = [];
    // Live pointer position in world space (Web cursor halo); active only while
    // the mouse is over the Web state (see main.js).
    this.cursor = { x: 0, y: 0, active: false };

    const n = this.n;
    this.curPos = new Float32Array(n * 3);
    this.tgtPos = new Float32Array(n * 3);
    this.curSize = new Float32Array(n);
    this.tgtSize = new Float32Array(n);
    this.curColor = new Float32Array(n * 3);
    this.tgtColor = new Float32Array(n * 3);

    // Per-frame drive written by the active reactor.
    this.dScale = new Float32Array(n); // extra scale fraction (0..~1.2)
    this.dLift = new Float32Array(n); // vertical offset, in tile-sizes
    this.dBright = new Float32Array(n); // 0..1 whiten amount
    this.dColor = new Float32Array(n * 3); // optional per-tile tint
    this.dColorMix = new Float32Array(n); // 0..1 blend toward dColor

    // Stable per-tile identity.
    this.homeCol = new Int16Array(n);
    this.homeRow = new Int16Array(n);
    this.binFrac = new Float32Array(n); // 0..1 frequency position (by column)
    this.rand = new Float32Array(n);
    this.rand2 = new Float32Array(n);

    let seed = 9173;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      this.homeCol[i] = col;
      this.homeRow[i] = row;
      this.binFrac[i] = this.cols > 1 ? col / (this.cols - 1) : 0.5;
      this.rand[i] = rng();
      this.rand2[i] = rng();
    }

    const geo = new PlaneGeometry(1, 1);
    this.tileMat = new MeshBasicMaterial({
      map: makeTileTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new InstancedMesh(geo, this.tileMat, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;

    this.shadowMat = new MeshBasicMaterial({
      map: makeShadowTexture(),
      color: new Color(0x1c1b33),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      depthTest: false,
    });
    this.shadow = new InstancedMesh(geo, this.shadowMat, n);
    this.shadow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;

    this.dummy = new Object3D();
    this._c = new Color();
    scene.add(this.shadow);
    scene.add(this.mesh);
    this.time = 0;
  }

  setReactor(reactor) {
    this.reactor = reactor;
    if (reactor && reactor.enter) reactor.enter(this);
  }

  // Recompute visible world extents when the camera / viewport changes.
  setBounds(worldHalfW, worldHalfH, docked) {
    this.worldHalfW = worldHalfW;
    this.worldHalfH = worldHalfH;
    this.docked = docked;
    this.applyLayout(this.state, true);
  }

  applyLayout(state, immediate = false) {
    this.state = state;
    // main supplies the tile region (measured from the live UI). Fall back to
    // a sensible full-field rectangle if no provider is wired yet.
    const meta = this.regionFor ? this.regionFor(state) : null;
    const region = (meta && meta.region) || { cx: 0, cy: 0, hw: 0.86, hh: 0.72 };
    // Scale the per-tile positional randomness down on smaller grids so phones
    // get much calmer (straighter) rows than desktop.
    const jitter = this.cols <= 16 ? 0.35 : this.cols <= 22 ? 0.7 : 1;
    const ctx = {
      n: this.n,
      cols: this.cols,
      rows: this.rows,
      worldHalfW: this.worldHalfW,
      worldHalfH: this.worldHalfH,
      docked: this.docked,
      region,
      jitter,
      homeCol: this.homeCol,
      homeRow: this.homeRow,
      binFrac: this.binFrac,
      rand: this.rand,
      rand2: this.rand2,
    };
    const set = (i, x, y, z, size, color) => {
      this.tgtPos[i * 3] = x;
      this.tgtPos[i * 3 + 1] = y;
      this.tgtPos[i * 3 + 2] = z;
      this.tgtSize[i] = size;
      this.tgtColor[i * 3] = color.r;
      this.tgtColor[i * 3 + 1] = color.g;
      this.tgtColor[i * 3 + 2] = color.b;
    };
    (layouts[state] || layouts.audio)(ctx, set);

    if (immediate) {
      this.curPos.set(this.tgtPos);
      this.curSize.set(this.tgtSize);
      this.curColor.set(this.tgtColor);
    }
  }

  resetDrive() {
    this.dScale.fill(0);
    this.dLift.fill(0);
    this.dBright.fill(0);
    this.dColorMix.fill(0);
  }

  // Emit a ripple from a normalized screen point (-1..1) that expands outward
  // and weakens as it travels (strong at the origin, fading toward `reach`), so
  // a card hover reads as a wave rolling away across the field.
  pulseAt(nx, ny, strength = 0.5) {
    const W = this.worldHalfW;
    const speed = W * 0.7;
    const reach = W * 1.0; // distance over which the ripple fades to nothing
    this.pulses.push({
      x: nx * W,
      y: ny * this.worldHalfH,
      r: W * 0.04,
      speed,
      width: W * 0.18,
      reach,
      strength,
      life: reach / speed + 0.2, // removed just after it has faded out
      age: 0,
    });
    if (this.pulses.length > 16) this.pulses.shift();
  }

  // Summed pulse contribution at a world point (0..~strength).
  samplePulse(x, y) {
    let a = 0;
    for (const p of this.pulses) {
      const dx = x - p.x,
        dy = y - p.y;
      const d = (Math.sqrt(dx * dx + dy * dy) - p.r) / p.width;
      // Gaussian ring profile × distance falloff (weaker the further it travels).
      const radial = p.reach ? Math.max(0, 1 - p.r / p.reach) : 1 - p.age / p.life;
      a += p.strength * Math.exp(-d * d) * radial;
    }
    return a;
  }

  // Point the cursor halo at a normalized screen point (-1..1), mapped into the
  // same world space as the tiles (matches pulseAt's basis).
  setCursor(nx, ny) {
    this.cursor.x = nx * this.worldHalfW;
    this.cursor.y = ny * this.worldHalfH;
    this.cursor.active = true;
  }

  clearCursor() {
    this.cursor.active = false;
  }

  update(dt, features, playing) {
    this.time += dt;
    const t = this.time;

    // Advance pulses.
    if (this.pulses.length) {
      for (const p of this.pulses) {
        p.age += dt;
        p.r += p.speed * dt;
      }
      this.pulses = this.pulses.filter((p) => p.age < p.life);
    }

    // Ease layout (position / size / colour) toward the current targets.
    // Higher rates → the state transition settles in about a second (and the
    // re-fit on a window drag tracks the new region with little lag).
    const posRate = reducedMotion ? 30 : 4.8;
    const sizeRate = reducedMotion ? 30 : 6;
    const colRate = reducedMotion ? 30 : 6;
    const cur = this.curPos,
      tgt = this.tgtPos,
      cs = this.curSize,
      ts = this.tgtSize,
      cc = this.curColor,
      tc = this.tgtColor;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const vr = 0.85 + this.rand[i] * 0.4;
      const kp = 1 - Math.exp(-dt * posRate * vr);
      const ks = 1 - Math.exp(-dt * sizeRate * vr);
      const kc = 1 - Math.exp(-dt * colRate);
      cur[i3] += (tgt[i3] - cur[i3]) * kp;
      cur[i3 + 1] += (tgt[i3 + 1] - cur[i3 + 1]) * kp;
      cur[i3 + 2] += (tgt[i3 + 2] - cur[i3 + 2]) * kp;
      cs[i] += (ts[i] - cs[i]) * ks;
      cc[i3] += (tc[i3] - cc[i3]) * kc;
      cc[i3 + 1] += (tc[i3 + 1] - cc[i3 + 1]) * kc;
      cc[i3 + 2] += (tc[i3 + 2] - cc[i3 + 2]) * kc;
    }

    // Let the active reactor write this frame's drive.
    this.resetDrive();
    if (this.reactor) this.reactor.update(this, features, dt, playing);

    // Compose the final transforms + colours.
    const idleAmt = reducedMotion ? 0 : 1;
    const liftClamp = reducedMotion ? 0 : 1;
    const scaleMul = reducedMotion ? 0.5 : 1;
    const ds = this.dScale,
      dl = this.dLift,
      db = this.dBright,
      dcol = this.dColor,
      dmix = this.dColorMix;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const size = cs[i];
      const idle = idleAmt * 0.015 * Math.sin(t * 0.9 + this.rand[i] * 6.283);
      const scale = size * (1 + ds[i] * scaleMul + idle);
      const lift = dl[i] * size * liftClamp;
      const px = cur[i3];
      const py = cur[i3 + 1] + lift;
      const pz = cur[i3 + 2];

      this.dummy.position.set(px, py, pz);
      this.dummy.scale.set(scale, scale, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const sOff = size * 0.16;
      this.dummy.position.set(px + sOff, py - sOff, pz - 0.1);
      const ss = scale * 1.1;
      this.dummy.scale.set(ss, ss, 1);
      this.dummy.updateMatrix();
      this.shadow.setMatrixAt(i, this.dummy.matrix);

      // Colour: eased base → optional reactor tint → whiten by brightness.
      let r = cc[i3],
        g = cc[i3 + 1],
        b = cc[i3 + 2];
      const mix = dmix[i];
      if (mix > 0) {
        r += (dcol[i3] - r) * mix;
        g += (dcol[i3 + 1] - g) * mix;
        b += (dcol[i3 + 2] - b) * mix;
      }
      const w = db[i] * 0.6;
      this._c.setRGB(
        r + (WHITE.r - r) * w,
        g + (WHITE.g - g) * w,
        b + (WHITE.b - b) * w
      );
      this.mesh.setColorAt(i, this._c);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
