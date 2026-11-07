// Procedural track generator: obstacle patterns, energy cells, power-ups, and collision probing.
// Positions are tracked in scene z: the player sits at z = 0 and everything moves toward +z.
import * as THREE from 'three';
import * as M from './models.js';

export const LANE_W = 3;
export const laneX = (l) => l * LANE_W;
export const PLAYER_HALF_L = 2.1;
export const PLAYER_HALF_W = 0.95;
const AHEAD = 270;
const GRAVITY = 36;

const DEFS = {
  barrier: { len: 1.0, halfW: 1.3, minY: 0, maxY: 1.0, label: 'a concrete barrier', make: M.createBarrier },
  gantry: { len: 0.4, halfW: 1.3, minY: 1.05, maxY: 3.6, label: 'a low-clearance gantry', make: M.createGantry },
  sedan: { len: 4.6, halfW: 0.97, minY: 0, maxY: 1.58, surface: true, label: 'traffic', make: () => M.createSedan() },
  trailer: { len: 12, halfW: 1.25, minY: 0, maxY: 3.2, surface: true, label: 'a semi trailer', make: () => M.createTrailer(12) },
  cargo: { len: 6.2, halfW: 1.25, minY: 0, maxY: 3.2, surface: true, label: 'a box truck', make: M.createCargoBox },
  cabL: { len: 3.0, halfW: 1.2, minY: 0, maxY: 2.9, surface: true, label: 'a truck cab', make: () => M.createCab(2.9, 3.0) },
  cabS: { len: 2.6, halfW: 1.2, minY: 0, maxY: 2.5, surface: true, label: 'a truck cab', make: () => M.createCab(2.5, 2.6) },
  ramp: { len: 7, halfW: 1.25, ramp: 3.2, make: () => M.createRamp(7, 3.2) },
  kicker: { len: 4.5, halfW: 1.25, ramp: 1.5, make: () => M.createRamp(4.5, 1.5) },
};

const POWER_KINDS = ['magnet', 'shield', 'nitro', 'double'];
const SMALL = ['barrier', 'barrier', 'gantry', 'gantry', 'sedan'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const randLane = () => ((Math.random() * 3) | 0) - 1;
const lerp = (a, b, t) => a + (b - a) * t;

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.pools = {};
    this.active = [];
    this.coins = [];
    this.powers = [];
    this.powerPools = {};
    this.coinMesh = new THREE.InstancedMesh(M.cellGeometry(), M.cellMaterial, 700);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);
    this.dummy = new THREE.Object3D();
    this.reset();
  }

  reset() {
    for (const o of this.active) this.release(o);
    for (const p of this.powers) this.releasePower(p);
    this.active = [];
    this.powers = [];
    this.coins = [];
    this.distance = 0;
    this.head = 70;
    this.nextPower = 260 + Math.random() * 200;
  }

  // ------------------------------------------------------------ pooling
  get(type) {
    const pool = (this.pools[type] ||= []);
    let o = pool.pop();
    if (!o) {
      const mesh = DEFS[type].make();
      this.scene.add(mesh);
      o = { type, def: DEFS[type], mesh };
    }
    o.mesh.visible = true;
    o.hit = false;
    o.smashed = false;
    return o;
  }

  release(o) {
    o.mesh.visible = false;
    this.pools[o.type].push(o);
  }

  releasePower(p) {
    p.mesh.visible = false;
    (this.powerPools[p.kind] ||= []).push(p);
  }

  place(type, lane, at) {
    const o = this.get(type);
    o.lane = lane;
    o.x = laneX(lane);
    o.z = this.distance - at - o.def.len / 2;
    o.mesh.position.set(o.x, 0, o.z);
    this.active.push(o);
    return o.def.len;
  }

  coin(lane, at, y) {
    this.coins.push({ x: laneX(lane), y, z: this.distance - at, magnet: false, phase: at * 0.35 });
  }

  coinLine(lane, at, n, y = 1.0, step = 3.2) {
    for (let i = 0; i < n; i++) this.coin(lane, at + i * step, y);
  }

  coinArc(lane, start, length, y0, height, n = 7) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.coin(lane, start + t * length, y0 + height * Math.sin(Math.PI * t));
    }
  }

  power(kind, lane, at) {
    const pool = (this.powerPools[kind] ||= []);
    let p = pool.pop();
    if (!p) {
      p = { kind, mesh: M.createPowerup(kind) };
      this.scene.add(p.mesh);
    }
    p.mesh.visible = true;
    p.x = laneX(lane);
    p.y = 1.3;
    p.z = this.distance - at;
    this.powers.push(p);
  }

  // ------------------------------------------------------------ track generation
  fill(speed, difficulty) {
    while (this.head < this.distance + AHEAD) {
      const len = this.row(this.head, speed);
      const gap = speed * lerp(1.3, 0.72, difficulty);
      if (this.head > this.nextPower) {
        this.power(pick(POWER_KINDS), randLane(), this.head + len + gap * 0.45);
        this.nextPower = this.head + 480 + Math.random() * 520;
      }
      this.head += len + gap;
    }
  }

  row(at, speed) {
    if (at < 90) return this.pSingle(at);
    const r = Math.random();
    if (r < 0.18) return this.pSingle(at);
    if (r < 0.38) return this.pDouble(at);
    if (r < 0.5) return this.pWall(at);
    if (r < 0.74) return this.pTrucks(at);
    if (r < 0.86) return this.pKicker(at, speed);
    return this.pWeave(at, speed);
  }

  pSingle(at) {
    const lane = randLane();
    const type = pick(SMALL);
    const len = this.place(type, lane, at);
    if (type === 'barrier') this.coinArc(lane, at - 6, 13, 1.0, 2.0);
    else this.coinLine(lane === 0 ? pick([-1, 1]) : 0, at - 4, 6);
    return len;
  }

  pDouble(at) {
    const free = randLane();
    let len = 0;
    for (const l of [-1, 0, 1]) {
      if (l === free) continue;
      const off = Math.random() < 0.5 ? 0 : 3;
      len = Math.max(len, off + this.place(pick(SMALL), l, at + off));
    }
    this.coinLine(free, at - 4, 7);
    return len;
  }

  pWall(at) {
    const types = [-1, 0, 1].map(() => (Math.random() < 0.5 ? 'barrier' : 'gantry'));
    if (types.every((t) => t === types[0])) types[(Math.random() * 3) | 0] = types[0] === 'barrier' ? 'gantry' : 'barrier';
    types.forEach((t, i) => this.place(t, i - 1, at));
    const b = types.indexOf('barrier');
    if (b >= 0) this.coinArc(b - 1, at - 6, 13, 1.0, 2.0);
    return 1;
  }

  pTrucks(at) {
    const rampLane = randLane();
    let total = 0;
    for (const l of [-1, 0, 1]) {
      const semi = Math.random() < 0.6;
      const bodyType = semi ? 'trailer' : 'cargo';
      const cabType = semi ? 'cabL' : 'cabS';
      if (l === rampLane) {
        let d = at + this.place('ramp', l, at);
        const bodyStart = d;
        d += this.place(bodyType, l, d);
        d += this.place(cabType, l, d);
        for (let c = at + 1.5; c < bodyStart + DEFS[bodyType].len - 0.5; c += 3.2) {
          const h = c < bodyStart ? ((c - at) / 7) * 3.2 : 3.2;
          this.coin(l, c, h + 1.0);
        }
        total = Math.max(total, d - at);
      } else if (Math.random() < 0.6) {
        let d = at + 2 + Math.random() * 8;
        d += this.place(bodyType, l, d);
        d += this.place(cabType, l, d);
        total = Math.max(total, d - at);
      } else if (Math.random() < 0.5) {
        const d = at + 4 + Math.random() * 10;
        total = Math.max(total, d - at + this.place('sedan', l, d));
      }
    }
    return total;
  }

  pKicker(at, speed) {
    const lane = randLane();
    this.place('kicker', lane, at);
    const vy = (speed * 1.5) / 4.5;
    const air = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * 1.5)) / GRAVITY;
    for (let i = 1; i <= 9; i++) {
      const t = (air * i) / 10;
      this.coin(lane, at + 4.5 + speed * t, 1.5 + vy * t - 0.5 * GRAVITY * t * t + 0.8);
    }
    const other = pick([-1, 0, 1].filter((l) => l !== lane));
    this.place(pick(SMALL), other, at + 6);
    return 4.5 + speed * air;
  }

  pWeave(at, speed) {
    const spacing = Math.max(15, speed * 0.6);
    let free = randLane();
    for (let k = 0; k < 3; k++) {
      const d = at + k * spacing;
      for (const l of [-1, 0, 1]) if (l !== free && Math.random() < 0.85) this.place('sedan', l, d);
      this.coinLine(free, d, 3);
      const next = free + (Math.random() < 0.5 ? -1 : 1);
      free = next < -1 || next > 1 ? free - (next - free) : next;
    }
    return spacing * 2 + 4.6;
  }

  // ------------------------------------------------------------ per-step simulation
  advance(dz) {
    this.distance += dz;
    for (const o of this.active) {
      o.z += dz;
      o.mesh.position.z = o.z;
    }
    for (const c of this.coins) if (!c.magnet) c.z += dz;
    for (const p of this.powers) p.z += dz;
  }

  cull() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.z - o.def.len / 2 > 14) {
        this.release(o);
        this.active.splice(i, 1);
      }
    }
    for (let i = this.powers.length - 1; i >= 0; i--) {
      if (this.powers[i].z > 12) {
        this.releasePower(this.powers[i]);
        this.powers.splice(i, 1);
      }
    }
    this.coins = this.coins.filter((c) => c.z < 12);
  }

  // Ground height under the player plus any solid obstacles overlapping its body.
  // `climb` is the current ramp slope: the nose rides higher than the center while climbing.
  probe(px, py, ph, climb = 0) {
    let ground = 0;
    let slope = 0;
    const hits = [];
    for (const o of this.active) {
      if (o.smashed) continue;
      const d = o.def;
      const dx = Math.abs(o.x - px);
      if (dx >= d.halfW + PLAYER_HALF_W) continue;
      const near = o.z + d.len / 2;
      const far = o.z - d.len / 2;
      if (d.ramp) {
        if (near >= 0 && far <= 0 && dx < 1.2) {
          const h = (near / d.len) * d.ramp;
          if (h > ground) {
            ground = h;
            slope = d.ramp / d.len;
          }
        }
        continue;
      }
      if (near < -PLAYER_HALF_L || far > PLAYER_HALF_L) continue;
      const tolerance = d.surface ? 0.6 : 0.08;
      const lift = d.surface ? climb * PLAYER_HALF_L : 0;
      if (py + lift >= d.maxY - tolerance) {
        if (d.surface && near >= -1.0 && far <= 1.0 && d.maxY >= ground) {
          ground = d.maxY;
          slope = 0;
        }
        continue;
      }
      if (py + ph <= d.minY) continue;
      if (!o.hit) hits.push(o);
    }
    return { ground, slope, hits };
  }

  collect(px, py, ph, magnet, dt, onCoin) {
    let n = 0;
    const k = 1 - Math.exp(-dt * 16);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (magnet && !c.magnet && c.z > -45 && c.z < 2 && Math.abs(c.x - px) < 10) c.magnet = true;
      if (c.magnet) {
        c.x += (px - c.x) * k;
        c.y += (py + 0.7 - c.y) * k;
        c.z += (0 - c.z) * k;
      }
      if (Math.abs(c.z) < 2.3 && Math.abs(c.x - px) < 1.3 && c.y > py - 0.4 && c.y < py + ph + 0.9) {
        onCoin(c);
        this.coins.splice(i, 1);
        n++;
      }
    }
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i];
      if (Math.abs(p.z) < 2.4 && Math.abs(p.x - px) < 1.5 && p.y > py - 0.6 && p.y < py + ph + 1.2) {
        this.powers.splice(i, 1);
        this.releasePower(p);
        onCoin(null, p.kind);
      }
    }
    return n;
  }

  smash(o) {
    o.smashed = true;
    o.hit = true;
    o.mesh.visible = false;
  }

  render(time) {
    const d = this.dummy;
    let i = 0;
    for (const c of this.coins) {
      if (i >= 700) break;
      d.position.set(c.x, c.y, c.z);
      d.rotation.set(0, time * 3 + c.phase, 0);
      d.updateMatrix();
      this.coinMesh.setMatrixAt(i++, d.matrix);
    }
    this.coinMesh.count = i;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    for (const p of this.powers) {
      p.mesh.position.set(p.x, p.y + Math.sin(time * 3 + p.z * 0.1) * 0.15, p.z);
      p.mesh.rotation.y = Math.sin(time * 2) * 0.6;
    }
  }
}
