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
 * The pixel field: one InstancedMesh of solid-colour tiles plus a matching
 * InstancedMesh of soft drop shadows. Layouts set per-tile targets
 * (position / size / colour); every frame the tiles ease toward those targets
 * and add audio reactivity on top.
 */
export class PixelField {
  constructor(scene, tier) {
    this.tier = tier;
    this.n = tier.count;
    this.cols = tier.cols;
    this.rows = tier.rows;
    this.state = 'audio';
    this.docked = 'right';
    this.pulses = [];
    this._beatCooldown = 0;

    const n = this.n;
    this.curPos = new Float32Array(n * 3);
    this.tgtPos = new Float32Array(n * 3);
    this.curSize = new Float32Array(n);
    this.tgtSize = new Float32Array(n);
    this.curColor = new Float32Array(n * 3);
    this.tgtColor = new Float32Array(n * 3);

    // Stable per-tile data.
    this.homeCol = new Int16Array(n);
    this.homeRow = new Int16Array(n);
    this.band = new Float32Array(n * 3); // bass / mid / high weights
    this.rand = new Float32Array(n);
    this.rand2 = new Float32Array(n);

    let seed = 9173;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      this.homeCol[i] = col;
      this.homeRow[i] = row;
      const f = this.rows > 1 ? row / (this.rows - 1) : 0.5;
      // Frequency band weights: low rows → bass, high rows → highs.
      this.band[i * 3] = bump(f, 0.0, 0.5); // bass
      this.band[i * 3 + 1] = bump(f, 0.5, 0.5); // mid
      this.band[i * 3 + 2] = bump(f, 1.0, 0.5); // high
      this.rand[i] = rng();
      this.rand2[i] = rng();
    }

    // Meshes.
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

  // Recompute the visible world extents when the camera / viewport changes.
  setBounds(worldHalfW, worldHalfH, docked) {
    this.worldHalfW = worldHalfW;
    this.worldHalfH = worldHalfH;
    this.docked = docked;
    this.applyLayout(this.state, true);
  }

  applyLayout(state, immediate = false) {
    this.state = state;
    const ctx = {
      n: this.n,
      cols: this.cols,
      rows: this.rows,
      worldHalfW: this.worldHalfW,
      worldHalfH: this.worldHalfH,
      docked: this.docked,
      homeCol: this.homeCol,
      homeRow: this.homeRow,
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

  // Send a ripple through the field from a normalized screen point (-1..1).
  pulseAt(nx, ny, strength = 1) {
    this.pulses.push({
      x: nx * this.worldHalfW,
      y: ny * this.worldHalfH,
      r: 0,
      speed: this.worldHalfW * 1.6,
      width: this.worldHalfW * 0.22,
      strength,
      life: 1,
      age: 0,
    });
    if (this.pulses.length > 24) this.pulses.shift();
  }

  update(dt, levels, playing) {
    this.time += dt;
    const t = this.time;
    const audio = this.state === 'audio';

    // Easing rates — gentle ~2s rearrange, snappier under reduced motion.
    const posRate = reducedMotion ? 30 : 2.4;
    const sizeRate = reducedMotion ? 30 : 3.2;
    const colRate = reducedMotion ? 30 : 3.0;
    const scaleGain = reducedMotion ? 0.3 : audio ? 0.95 : 0.5;
    const reactAmt = audio ? 1.0 : this.state === 'contact' ? 0.32 : 0.5;
    const bobAmt = reducedMotion ? 0 : audio ? 0.5 : 0.22;

    // Advance pulses.
    this._beatCooldown -= dt;
    if (audio && levels.beat > 0.35 && this._beatCooldown <= 0) {
      // Beats bloom outward from the centre of the grid.
      this.pulses.push({
        x: this.docked === 'right' ? -this.worldHalfW * 0.3 : 0,
        y: this.docked === 'right' ? this.worldHalfH * 0.1 : this.worldHalfH * 0.38,
        r: 0,
        speed: this.worldHalfW * 1.4,
        width: this.worldHalfW * 0.28,
        strength: levels.beat,
        life: 1,
        age: 0,
      });
      this._beatCooldown = 0.18;
    }
    for (const p of this.pulses) {
      p.age += dt;
      p.r += p.speed * dt;
    }
    this.pulses = this.pulses.filter((p) => p.age < p.life);

    const cur = this.curPos,
      tgt = this.tgtPos,
      cs = this.curSize,
      ts = this.tgtSize,
      cc = this.curColor,
      tc = this.tgtColor;

    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      // Slight per-tile variation so the field arrives like a soft wave.
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

      // --- Reactivity ---
      const activation =
        this.band[i3] * levels.bass +
        this.band[i3 + 1] * levels.mid +
        this.band[i3 + 2] * levels.high;

      // Pulse contribution (beats + interactions).
      let pulseAdd = 0;
      const px = cur[i3],
        py = cur[i3 + 1];
      for (const p of this.pulses) {
        const dx = px - p.x,
          dy = py - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const d = (dist - p.r) / p.width;
        pulseAdd += p.strength * Math.exp(-d * d) * (1 - p.age / p.life);
      }

      // Resting pattern so the field is never blank between/under quiet music.
      const rest = playing
        ? 0
        : 0.12 *
          (0.5 +
            0.5 * Math.sin(t * 0.7 + this.homeCol[i] * 0.45 + this.homeRow[i] * 0.32));
      const idle = reducedMotion
        ? 0
        : 0.04 * Math.sin(t * 0.9 + this.rand[i] * 6.28);

      const act = Math.min(1.4, activation * reactAmt + pulseAdd + rest);

      const scale = cs[i] * (1 + act * scaleGain + idle);
      const bob = act * bobAmt * cs[i];

      this.dummy.position.set(px, py + bob, cur[i3 + 2]);
      this.dummy.scale.set(scale, scale, 1);
      this.dummy.rotation.z = 0;
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      // Drop shadow: same tile, offset down/right and a touch larger.
      const sOff = cs[i] * 0.16;
      this.dummy.position.set(px + sOff, py + bob - sOff, cur[i3 + 2] - 0.1);
      const ss = scale * 1.1;
      this.dummy.scale.set(ss, ss, 1);
      this.dummy.updateMatrix();
      this.shadow.setMatrixAt(i, this.dummy.matrix);

      // Colour: ease the base, then push toward a brighter/warmer version
      // with activation.
      const mix = Math.min(1, act * 0.8);
      this._c.setRGB(
        cc[i3] + (WHITE.r - cc[i3]) * mix * 0.55,
        cc[i3 + 1] + (WHITE.g - cc[i3 + 1]) * mix * 0.45,
        cc[i3 + 2] + (WHITE.b - cc[i3 + 2]) * mix * 0.4
      );
      this.mesh.setColorAt(i, this._c);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// A smooth bump centred at `c` with falloff `w`, evaluated at x in [0,1].
function bump(x, c, w) {
  const d = (x - c) / w;
  return Math.max(0, Math.exp(-d * d));
}
