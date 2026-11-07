// Every vehicle and obstacle is modelled here from primitive / extruded geometry.
// Convention: vehicles face -Z (direction of travel), +Y is up, ground at y = 0.
import * as THREE from 'three';
import {
  glowTexture, hazardTexture, chevronTexture, signTexture,
  trailerTextures, iconTexture, POWER_COLORS,
} from './textures.js';

export function glow(hex, k = 2) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
}

const std = (color, roughness = 0.6, metalness = 0.1, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const pick = (a) => a[(Math.random() * a.length) | 0];

export const MAT = {
  rubber: std(0x0b0b0d, 0.92, 0),
  rim: std(0xd6dae2, 0.2, 1),
  rimDark: std(0x22252c, 0.35, 0.9),
  chassis: std(0x15161b, 0.7, 0.4),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x04060a, roughness: 0.05, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03 }),
  concrete: std(0x9a96a2, 0.85, 0),
  metal: std(0x5a5e6a, 0.45, 0.8),
  white: std(0xe8e8ee, 0.4, 0.1),
  head: glow(0xe8f4ff, 3),
  tail: glow(0xff1030, 3),
  edge: glow(0x35f0ff, 1.6),
};

export const BLINK = { amber: glow(0xffa020, 3), red: glow(0xff2030, 3) };
const AMBER = new THREE.Color(0xffa020);
const RED = new THREE.Color(0xff2030);

export function tickModels(t) {
  BLINK.amber.color.copy(AMBER).multiplyScalar(Math.sin(t * 7) > 0 ? 3 : 0.12);
  BLINK.red.color.copy(RED).multiplyScalar(Math.sin(t * 2.5) > 0.6 ? 4 : 0.15);
}

function m(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  return o;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Extrude a side-profile shape (x = forward, y = up) across the car's width.
function sideExtrude(shape, width, bevel = 0.08, segs = 4) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segs,
    curveSegments: 18,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // profile +x  ->  world -z (forward)
  return g;
}

// ---------------------------------------------------------------- wheels
const TIRE = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 28).rotateZ(Math.PI / 2);
const HUB = new THREE.CylinderGeometry(0.25, 0.25, 0.31, 20).rotateZ(Math.PI / 2);
const SPOKE = box(0.33, 0.46, 0.06);

export function makeWheel(scale = 1, rimMat = MAT.rim) {
  const w = new THREE.Group();
  w.add(new THREE.Mesh(TIRE, MAT.rubber));
  w.add(new THREE.Mesh(HUB, MAT.rimDark));
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(SPOKE, rimMat);
    s.rotation.x = (i * Math.PI) / 5;
    w.add(s);
  }
  w.scale.setScalar(scale);
  return w;
}

function addWheels(group, positions, scale = 1) {
  const list = [];
  for (const [x, z] of positions) {
    for (const sx of [-1, 1]) {
      const w = makeWheel(scale);
      w.position.set(sx * x, 0.36 * scale, z);
      group.add(w);
      list.push(w);
    }
  }
  return list;
}

// ---------------------------------------------------------------- the star: Roadster
const ROADSTER_BODY = (() => {
  const s = new THREE.Shape();
  s.moveTo(-2.08, 0.3);
  s.lineTo(-2.16, 0.62);
  s.quadraticCurveTo(-2.2, 0.9, -1.92, 0.92); // rear lip spoiler
  s.lineTo(-1.15, 0.96);
  s.quadraticCurveTo(-0.55, 1.0, -0.2, 1.0);
  s.lineTo(0.45, 1.0);
  s.quadraticCurveTo(1.3, 0.92, 1.95, 0.7); // long low hood
  s.quadraticCurveTo(2.22, 0.58, 2.2, 0.42);
  s.lineTo(2.14, 0.3);
  s.absarc(1.38, 0.3, 0.5, 0, Math.PI, false); // front wheel arch
  s.absarc(-1.3, 0.3, 0.5, 0, Math.PI, false); // rear wheel arch
  s.lineTo(-2.08, 0.3);
  return sideExtrude(s, 1.66, 0.12, 5);
})();

const ROADSTER_CANOPY = (() => {
  const c = new THREE.Shape();
  c.moveTo(-1.05, 0.92);
  c.quadraticCurveTo(-0.7, 1.36, -0.15, 1.38);
  c.quadraticCurveTo(0.35, 1.37, 0.95, 0.94);
  c.lineTo(-1.05, 0.92);
  return sideExtrude(c, 1.2, 0.08, 4);
})();

export function createRoadster(paint = { color: 0xc8101e }, glowHex = 0x35f0ff) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paintMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
  body.add(new THREE.Mesh(ROADSTER_BODY, paintMat));
  body.add(new THREE.Mesh(ROADSTER_CANOPY, MAT.glass));

  // aero + trim
  body.add(m(box(1.7, 0.08, 0.5), MAT.chassis, 0, 0.22, -2.05)); // splitter
  body.add(m(box(1.98, 0.12, 1.4), MAT.chassis, 0, 0.26, 0.04)); // side skirts
  body.add(m(box(1.5, 0.2, 0.35), MAT.chassis, 0, 0.3, 2.12)); // diffuser
  for (let i = -2; i <= 2; i++) body.add(m(box(0.03, 0.16, 0.3), MAT.rimDark, i * 0.28, 0.28, 2.2));
  body.add(m(box(0.9, 0.1, 0.06), MAT.chassis, 0, 0.42, -2.3)); // lower intake

  // slim swept headlights
  for (const sx of [-1, 1]) {
    const h = m(box(0.52, 0.05, 0.22), MAT.head, sx * 0.6, 0.76, -2.08);
    h.rotation.set(0.45, sx * 0.35, 0);
    body.add(h);
    const mirror = m(box(0.24, 0.1, 0.14), paintMat, sx * 0.98, 1.02, -0.32);
    body.add(mirror);
  }
  // full-width light bar tail lamp
  body.add(m(box(1.56, 0.05, 0.08), MAT.tail, 0, 0.84, 2.25));
  for (const sx of [-1, 1]) body.add(m(box(0.08, 0.16, 0.08), MAT.tail, sx * 0.78, 0.78, 2.22));

  // cold-gas thrusters (shown during NITRO)
  const thrusters = new THREE.Group();
  const nozzle = new THREE.CylinderGeometry(0.13, 0.2, 0.36, 18).rotateX(Math.PI / 2);
  const flameMat = glow(0x6fb8ff, 4);
  for (const sx of [-1, 1]) {
    thrusters.add(m(nozzle, MAT.metal, sx * 0.42, 0.58, 2.36));
    const core = m(new THREE.CircleGeometry(0.12, 18), flameMat, sx * 0.42, 0.58, 2.55);
    thrusters.add(core);
  }
  thrusters.visible = false;
  body.add(thrusters);

  // underglow
  const underMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const under = m(new THREE.PlaneGeometry(3.4, 6), underMat, 0, 0.04, 0);
  under.rotation.x = -Math.PI / 2;
  root.add(under);

  const wheels = addWheels(root, [[0.84, -1.38], [0.84, 1.3]]);
  const front = wheels.slice(0, 2);

  const api = {
    root, body, wheels, front, thrusters, underMat,
    setPaint(p) {
      paintMat.color.set(p.color);
      paintMat.metalness = p.metal ?? 0.6;
      paintMat.roughness = p.rough ?? 0.28;
      paintMat.clearcoat = p.clear ?? 1;
    },
    setGlow(hex) {
      underMat.color.set(hex).multiplyScalar(1.6);
    },
  };
  api.setPaint(paint);
  api.setGlow(glowHex);
  return api;
}

// ---------------------------------------------------------------- traffic sedan
const SEDAN_BODY = (() => {
  const s = new THREE.Shape();
  s.moveTo(-2.2, 0.32);
  s.lineTo(-2.25, 0.98);
  s.lineTo(-1.55, 1.05);
  s.lineTo(1.25, 1.02);
  s.quadraticCurveTo(2.2, 0.95, 2.25, 0.7);
  s.lineTo(2.22, 0.32);
  s.absarc(1.4, 0.32, 0.5, 0, Math.PI, false);
  s.absarc(-1.4, 0.32, 0.5, 0, Math.PI, false);
  s.lineTo(-2.2, 0.32);
  return sideExtrude(s, 1.76, 0.07, 3);
})();

const SEDAN_CABIN = (() => {
  const s = new THREE.Shape();
  s.moveTo(-1.6, 1.0);
  s.lineTo(-1.05, 1.55);
  s.lineTo(0.5, 1.56);
  s.lineTo(1.2, 1.0);
  s.lineTo(-1.6, 1.0);
  return sideExtrude(s, 1.56, 0.05, 2);
})();

const SEDAN_COLORS = [0x2b6cff, 0xf2f2f2, 0x2a2b31, 0xffb21e, 0x1fbf8f, 0x8a2be2, 0xb8bcc6, 0xe0443a];

export function createSedan(hex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: hex ?? pick(SEDAN_COLORS), metalness: 0.5, roughness: 0.35, clearcoat: 0.8 });
  g.add(new THREE.Mesh(SEDAN_BODY, paint));
  g.add(new THREE.Mesh(SEDAN_CABIN, MAT.glass));
  g.add(m(box(1.5, 0.06, 1.5), paint, 0, 1.58, 0.27)); // roof skin
  for (const sx of [-1, 1]) {
    g.add(m(box(0.45, 0.14, 0.05), MAT.tail, sx * 0.62, 0.86, 2.3));
    g.add(m(box(0.14, 0.1, 0.05), BLINK.amber, sx * 0.92, 0.86, 2.31));
  }
  g.add(m(box(0.5, 0.16, 0.03), MAT.white, 0, 0.55, 2.3));
  addWheels(g, [[0.84, -1.4], [0.84, 1.4]]);
  g.userData.paint = paint;
  return g;
}

export function createPolice() {
  const root = createSedan(0x0b0c10);
  for (const sx of [-1, 1]) root.add(m(box(0.03, 0.42, 1.7), MAT.white, sx * 0.955, 0.72, 0.1));
  root.add(m(box(1.6, 0.03, 1.2), MAT.white, 0, 1.62, 0.27));
  root.add(m(box(1.3, 0.1, 0.32), MAT.chassis, 0, 1.66, 0.27));
  const red = glow(0xff1030, 4);
  const blue = glow(0x2050ff, 4);
  root.add(m(box(0.55, 0.14, 0.28), red, -0.32, 1.75, 0.27));
  root.add(m(box(0.55, 0.14, 0.28), blue, 0.32, 1.75, 0.27));
  return { root, red, blue };
}

// ---------------------------------------------------------------- big rigs
function surfaceEdges(g, len, top, w = 2.5) {
  g.add(m(box(0.06, 0.06, len), MAT.edge, -w / 2 + 0.03, top, 0));
  g.add(m(box(0.06, 0.06, len), MAT.edge, w / 2 - 0.03, top, 0));
  g.add(m(box(w, 0.06, 0.06), MAT.edge, 0, top, len / 2));
}

function rearLights(g, z, y = 1.15, half = 1.0) {
  for (const sx of [-1, 1]) {
    g.add(m(box(0.3, 0.16, 0.05), MAT.tail, sx * half, y, z));
    g.add(m(box(0.14, 0.14, 0.05), BLINK.amber, sx * (half + 0.2), y, z));
  }
}

const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 });

export function createTrailer(len = 12) {
  const g = new THREE.Group();
  const t = trailerTextures((Math.random() * 3) | 0);
  const side = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.5, metalness: 0.3 });
  const plain = std(0xd2d4dc, 0.5, 0.4);
  const rear = std(0xb8bac4, 0.5, 0.5);
  g.add(m(box(2.5, 2.3, len), [side, side, plain, plain, rear, plain], 0, 2.05, 0));
  g.add(m(box(2.2, 0.3, len - 0.4), MAT.chassis, 0, 0.75, 0));
  g.add(m(box(0.03, 2.2, 0.02), MAT.chassis, 0, 2.05, len / 2 + 0.01)); // door seam
  for (const sx of [-1, 1]) g.add(m(box(0.06, 2.1, 0.04), MAT.metal, sx * 0.6, 2.05, len / 2 + 0.02));
  g.add(m(box(2.4, 0.16, 0.16), hazardMat, 0, 0.52, len / 2 + 0.05)); // underride bar
  rearLights(g, len / 2 + 0.03);
  surfaceEdges(g, len, 3.2);
  addWheels(g, [[0.95, len / 2 - 1.3], [0.95, len / 2 - 2.4]], 1.3);
  return g;
}

export function createCargoBox() {
  const g = new THREE.Group();
  const len = 6.2;
  const col = pick([0xf2f2f4, 0xffcc33, 0x2d7bff, 0xe23b3b, 0x24c08a]);
  g.add(m(box(2.5, 2.6, len), std(col, 0.5, 0.2), 0, 1.9, 0));
  const stripe = glow(pick([0x35f0ff, 0xff3ad6, 0xffd23b]), 2);
  for (const sx of [-1, 1]) g.add(m(box(0.02, 0.14, len - 0.4), stripe, sx * 1.26, 1.5, 0));
  for (let i = 0; i < 5; i++) g.add(m(box(2.3, 0.03, 0.02), MAT.chassis, 0, 0.9 + i * 0.48, len / 2 + 0.01));
  g.add(m(box(2.2, 0.3, len - 0.2), MAT.chassis, 0, 0.5, 0));
  g.add(m(box(2.4, 0.16, 0.16), hazardMat, 0, 0.45, len / 2 + 0.05));
  rearLights(g, len / 2 + 0.03, 0.85);
  surfaceEdges(g, len, 3.2);
  addWheels(g, [[0.98, len / 2 - 1.1]], 1.15);
  return g;
}

export function createCab(h = 2.9, len = 3.0) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: pick([0xd8262f, 0x1f5fd6, 0xf2f2f4, 0x2a2a30, 0xf29d1f]), metalness: 0.4, roughness: 0.35, clearcoat: 0.6 });
  const cabH = h - 0.75;
  const cabLen = len - 0.4;
  g.add(m(box(2.4, cabH, cabLen), paint, 0, 0.75 + cabH / 2, 0.2));
  g.add(m(box(2.3, 0.9, 0.4), paint, 0, 1.0, -len / 2 + 0.2));
  g.add(m(box(2.2, 0.8, 0.04), MAT.glass, 0, 0.75 + cabH - 0.55, -len / 2 + 0.38));
  for (let i = 0; i < 4; i++) g.add(m(box(0.16, 0.08, 0.1), BLINK.amber, -0.75 + i * 0.5, h + 0.02, -len / 2 + 0.5));
  g.add(m(box(2.2, 0.3, len), MAT.chassis, 0, 0.6, 0));
  surfaceEdges(g, cabLen, h, 2.4);
  addWheels(g, [[0.98, -len / 2 + 0.75], [0.98, len / 2 - 0.6]], 1.2);
  return g;
}

// ---------------------------------------------------------------- road furniture
export function createRamp(len, h) {
  const g = new THREE.Group();
  const hyp = Math.hypot(len, h);
  const ang = Math.atan2(h, len);
  const map = hazardTexture().clone();
  map.needsUpdate = true;
  map.repeat.set(2, hyp / 1.25);
  const top = m(new THREE.PlaneGeometry(2.5, hyp), new THREE.MeshStandardMaterial({ map, roughness: 0.5 }), 0, h / 2, 0);
  top.rotation.x = -Math.PI / 2 + ang;
  g.add(top);
  const tri = new THREE.Shape();
  tri.moveTo(0, 0);
  tri.lineTo(len, 0);
  tri.lineTo(len, h);
  tri.lineTo(0, 0);
  const sideGeo = new THREE.ShapeGeometry(tri);
  sideGeo.translate(-len / 2, 0, 0);
  sideGeo.rotateY(Math.PI / 2);
  const sideMat = std(0x2a2733, 0.6, 0.6, { side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    g.add(m(sideGeo, sideMat, sx * 1.25, 0, 0));
    const rail = m(box(0.08, 0.08, hyp), MAT.edge, sx * 1.25, h / 2 + 0.03, 0);
    rail.rotation.x = ang;
    g.add(rail);
  }
  g.add(m(box(2.5, h, 0.1), sideMat, 0, h / 2, -len / 2)); // back wall
  return g;
}

const BARRIER_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.45, 0);
  s.lineTo(0.45, 0);
  s.lineTo(0.28, 0.28);
  s.lineTo(0.16, 1.0);
  s.lineTo(-0.16, 1.0);
  s.lineTo(-0.28, 0.28);
  s.lineTo(-0.45, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: false });
  g.translate(0, 0, -1.3);
  g.rotateY(Math.PI / 2);
  return g;
})();

const chevronMat = new THREE.MeshStandardMaterial({ map: chevronTexture(), emissiveMap: chevronTexture(), emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 });

export function createBarrier() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(BARRIER_GEO, MAT.concrete));
  const panel = m(new THREE.PlaneGeometry(2.4, 0.48), chevronMat, 0, 0.64, 0.235);
  panel.rotation.x = -0.165;
  g.add(panel);
  for (const sx of [-0.9, 0.9]) g.add(m(box(0.2, 0.14, 0.2), BLINK.amber, sx, 1.07, 0));
  return g;
}

const lowSignMat = [
  MAT.metal, MAT.metal, MAT.metal, MAT.metal,
  new THREE.MeshStandardMaterial({
    map: signTexture(['LOW', 'CLEARANCE ↓'], { bg: '#ffc21a', fg: '#141018', w: 512, h: 300 }),
    emissiveMap: signTexture(['LOW', 'CLEARANCE ↓'], { bg: '#ffc21a', fg: '#141018', w: 512, h: 300 }),
    emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.5,
  }),
  MAT.metal,
];

export function createGantry() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(m(box(0.16, 3.7, 0.16), MAT.metal, sx * 1.42, 1.85, 0));
  g.add(m(box(2.84, 0.45, 0.3), hazardMat, 0, 1.28, 0));
  g.add(m(box(2.84, 0.05, 0.34), BLINK.red, 0, 1.04, 0));
  g.add(m(box(2.5, 1.5, 0.12), lowSignMat, 0, 2.45, 0));
  return g;
}

// ---------------------------------------------------------------- collectibles
export function cellGeometry() {
  const b = new THREE.Shape();
  b.moveTo(0.1, 0.5);
  b.lineTo(-0.25, -0.02);
  b.lineTo(0.0, -0.02);
  b.lineTo(-0.12, -0.5);
  b.lineTo(0.28, 0.08);
  b.lineTo(0.02, 0.08);
  b.lineTo(0.1, 0.5);
  const g = new THREE.ExtrudeGeometry(b, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.center();
  g.scale(1.5, 1.5, 1.5);
  return g;
}

export const cellMaterial = new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffa800, emissiveIntensity: 0.75, metalness: 0.4, roughness: 0.3 });

export function createPowerup(kind) {
  const g = new THREE.Group();
  const col = new THREE.Color(POWER_COLORS[kind]);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 10, 48), glow(col, 2.4)));
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.74, 40), new THREE.MeshBasicMaterial({ map: iconTexture(kind), transparent: true, side: THREE.DoubleSide })));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
  halo.scale.setScalar(3.2);
  g.add(halo);
  return g;
}
