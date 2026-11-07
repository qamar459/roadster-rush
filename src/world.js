// The endless neon highway: sky, road, city, street furniture. Everything scrolls toward +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadTextures, gridTexture, windowTexture, signTexture, glowTexture, fadeTexture } from './textures.js';
import { glow, BLINK, MAT } from './models.js';

const NEAR = 40; // props past this z (behind the camera) wrap to the far end
const SPAN = 520; // length of the recycled band of props

// Repeats instanced props along the road at a fixed spacing.
class Strip {
  constructor(scene, parts, slots, spacing, phase = 0) {
    this.count = Math.ceil(SPAN / spacing) + 1;
    this.spacing = spacing;
    this.slots = slots;
    this.phase = phase;
    this.offset = 0;
    this.dummy = new THREE.Object3D();
    this.meshes = parts.map(([geo, mat]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, this.count * slots.length);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
    this.advance(0);
  }

  advance(dz) {
    this.offset = (this.offset + dz) % this.spacing;
    const d = this.dummy;
    let i = 0;
    for (let k = 0; k < this.count; k++) {
      const z = NEAR - k * this.spacing - this.phase + this.offset;
      for (const s of this.slots) {
        d.position.set(s.x, s.y ?? 0, z);
        d.rotation.set(0, s.flip ? Math.PI : 0, 0);
        d.updateMatrix();
        for (const mesh of this.meshes) mesh.setMatrixAt(i, d.matrix);
        i++;
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 top = vec3(0.004, 0.002, 0.018);
    vec3 mid = vec3(0.05, 0.008, 0.11);
    vec3 col = mix(uHorizon * 1.4, mid, smoothstep(0.0, 0.2, h));
    col = mix(col, top, smoothstep(0.18, 0.65, h));
    if (h < 0.0) col = uHorizon;

    // striped retro sun
    vec3 sunDir = normalize(vec3(0.0, 0.1, -1.0));
    float sd = distance(d, sunDir);
    float r = 0.24;
    float sy = clamp((d.y - (sunDir.y - r)) / (2.0 * r), 0.0, 1.0);
    vec3 sunCol = mix(vec3(1.1, 0.08, 0.45), vec3(1.25, 0.8, 0.15), sy);
    float band = fract(sy * 11.0 + uTime * 0.25);
    float cut = sy < 0.55 ? step((0.55 - sy) * 1.3, band) : 1.0;
    col = mix(col, sunCol, cut * smoothstep(r, r - 0.004, sd));
    col += vec3(1.0, 0.25, 0.55) * 0.08 * exp(-sd * 5.0);

    // stars
    if (h > 0.04) {
      vec3 p = floor(d * 320.0);
      float s = hash(p);
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 90.0);
      col += vec3(step(0.9965, s)) * smoothstep(0.04, 0.35, h) * tw * 1.4;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class World {
  constructor(scene, fogColor) {
    this.scene = scene;
    this.fogColor = fogColor;
    this.buildSky();
    this.buildMountains();
    this.buildRoad();
    this.buildRails();
    this.buildLamps();
    this.buildPalms();
    this.buildBuildings();
    this.buildSigns();
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTime: { value: 0 }, uHorizon: { value: this.fogColor.clone() } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  buildMountains() {
    const geo = new THREE.PlaneGeometry(2000, 1, 140, 9);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const v = pos.getY(i) + 0.5;
      const ridge = 70 + 38 * Math.sin(x * 0.011) + 26 * Math.sin(x * 0.027 + 1.3) + 12 * Math.sin(x * 0.07 + 0.5);
      const valley = 0.18 + 0.82 * THREE.MathUtils.smoothstep(Math.abs(x), 40, 320);
      const jitter = v > 0 && v < 1 ? (Math.random() - 0.5) * 6 : 0;
      pos.setXYZ(i, x + jitter, v * ridge * valley, (Math.random() - 0.5) * 20 * v);
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0d0318, fog: false })));
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2fd0).multiplyScalar(0.7), wireframe: true, fog: false, transparent: true, opacity: 0.45 })));
    g.position.set(0, -1, -640);
    this.scene.add(g);
  }

  buildRoad() {
    const { map, emissive } = roadTextures();
    const len = 640;
    for (const t of [map, emissive]) t.repeat.set(1, len / 16);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12.4, len),
      new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.35 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = NEAR + 20 - len / 2;
    this.scene.add(road);
    this.roadTex = [map, emissive];

    const grid = gridTexture();
    grid.repeat.set(1800 / 10, 900 / 10);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 900),
      new THREE.MeshBasicMaterial({ map: grid, color: new THREE.Color(0.9, 0.9, 0.9) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, NEAR + 20 - 450);
    this.scene.add(ground);
    this.gridTex = grid;
  }

  buildRails() {
    for (const [x, col] of [[-6.3, 0x35f0ff], [6.3, 0xff3ad6]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 700), MAT.metal);
      rail.position.set(x, 0.62, -300);
      this.scene.add(rail);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 700), glow(col, 1.1));
      strip.position.set(x, 0.81, -300);
      this.scene.add(strip);
    }
    // rail posts with reflectors scroll by to sell the speed
    this.strips = [];
    const post = new THREE.BoxGeometry(0.14, 0.62, 0.14);
    post.translate(0, 0.31, 0);
    const refl = new THREE.BoxGeometry(0.16, 0.12, 0.08);
    refl.translate(0, 0.45, 0.08);
    this.strips.push(new Strip(this.scene, [[post, MAT.metal], [refl, glow(0x35f0ff, 1.8)]], [{ x: -6.3 }], 6));
    this.strips.push(new Strip(this.scene, [[post, MAT.metal], [refl, glow(0xff3ad6, 1.8)]], [{ x: 6.3 }], 6, 3));
  }

  buildLamps() {
    const pole = new THREE.CylinderGeometry(0.11, 0.16, 7.6, 10);
    pole.translate(0, 3.8, 0);
    const arm = new THREE.BoxGeometry(3.4, 0.12, 0.14);
    arm.translate(1.7, 7.5, 0);
    const frame = mergeGeometries([pole, arm]);
    const head = new THREE.BoxGeometry(1.0, 0.12, 0.36);
    head.translate(3.2, 7.38, 0);
    const cone = new THREE.ConeGeometry(2.3, 7.3, 24, 1, true);
    cone.translate(3.2, 3.65, 0);
    const pool = new THREE.PlaneGeometry(6, 6);
    pool.rotateX(-Math.PI / 2);
    pool.translate(3.2, 0.03, 0);
    const warm = new THREE.Color(0xffb870);
    const coneMat = new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(0.1), alphaMap: fadeTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: warm.clone().multiplyScalar(0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.strips.push(new Strip(this.scene, [[frame, MAT.metal], [head, glow(0xffd29a, 2.2)], [cone, coneMat], [pool, poolMat]],
      [{ x: -7.4 }, { x: 7.4, flip: true }], 34));
  }

  buildPalms() {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 2.5, 0),
      new THREE.Vector3(0.9, 5, 0), new THREE.Vector3(1.8, 7.4, 0),
    ]);
    const trunk = new THREE.TubeGeometry(curve, 16, 0.22, 7, false);
    const top = curve.getPoint(1);
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(1.6, 0.5, 3.8, 0);
      s.quadraticCurveTo(1.6, -0.5, 0, 0);
      const lg = new THREE.ShapeGeometry(s, 10);
      lg.rotateX(-Math.PI / 2);
      const p = lg.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const x = p.getX(j);
        p.setY(j, p.getY(j) + 0.4 * x - 0.16 * x * x);
      }
      lg.rotateY((i / 9) * Math.PI * 2 + Math.random() * 0.3);
      lg.translate(top.x, top.y, top.z);
      leaves.push(lg);
    }
    const fronds = mergeGeometries(leaves);
    fronds.computeVertexNormals();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a26, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x0f3b2c, emissive: 0x06281c, roughness: 0.8, side: THREE.DoubleSide });
    this.strips.push(new Strip(this.scene, [[trunk, trunkMat], [fronds, leafMat]],
      [{ x: -10.5 }, { x: 10.5, flip: true }], 34, 17));
  }

  buildBuildings() {
    const mats = [0, 1, 2, 3].map((v) => {
      const t = windowTexture(v);
      return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, color: 0x9a96b0, roughness: 0.75, metalness: 0.2 });
    });
    const neon = [0x35f0ff, 0xff3ad6, 0xffd23b, 0x7a5cff].map((c) => glow(c, 1.5));
    this.buildings = [];
    this.citySpan = {};
    for (const side of [-1, 1]) {
      let z = NEAR;
      while (z > NEAR - SPAN) {
        const w = 8 + Math.random() * 10;
        const d = 8 + Math.random() * 10;
        const h = 16 + Math.random() * Math.random() * 70;
        const b = new THREE.Mesh(buildingGeo(w, h, d), mats[(Math.random() * 4) | 0]);
        const x = side * (17 + w / 2 + Math.random() * (Math.random() < 0.5 ? 4 : 40));
        b.position.set(x, h / 2, z - d / 2);
        b.userData = { side, depth: d };
        // neon trims on the road-facing edge and the occasional antenna beacon
        if (Math.random() < 0.55) {
          const n = neon[(Math.random() * neon.length) | 0];
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.25), n);
          strip.position.set(-side * w / 2, 0, d / 2);
          b.add(strip);
          const crown = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, d), n);
          crown.position.set(-side * w / 2, h / 2, 0);
          b.add(crown);
        }
        if (Math.random() < 0.35) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), MAT.metal);
          ant.position.y = h / 2 + 3;
          b.add(ant);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), BLINK.red);
          beacon.position.y = h / 2 + 6.1;
          b.add(beacon);
        }
        this.scene.add(b);
        this.buildings.push(b);
        z -= d + 1 + Math.random() * 5;
      }
      this.citySpan[side] = NEAR - z;
    }
  }

  buildSigns() {
    const texts = [
      ['GIGA CITY', 'EXIT 12  ↗'], ['MARS', '225M KM  ↑'],
      ['NEON BLVD', 'NEXT RIGHT  →'], ['STARBASE', '3 MI  ↑'],
    ];
    const metal = MAT.metal;
    this.signs = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 9.4, 0.32), metal);
        post.position.set(sx * 7.3, 4.7, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(14.9, 0.36, 0.36), metal);
      beam.position.y = 9.1;
      g.add(beam);
      for (const sx of [-1, 1]) {
        const t = signTexture(texts[(i * 2 + (sx > 0 ? 1 : 0)) % texts.length]);
        const face = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 });
        const panel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.4, 0.15), [metal, metal, metal, metal, face, metal]);
        panel.position.set(sx * 3.1, 8.4, 0.2);
        g.add(panel);
      }
      g.position.z = -120 - i * 175;
      this.scene.add(g);
      this.signs.push(g);
    }
  }

  advance(dz) {
    for (const t of this.roadTex) t.offset.y += dz / 16;
    this.gridTex.offset.y += dz / 10;
    for (const s of this.strips) s.advance(dz);
    for (const b of this.buildings) {
      b.position.z += dz;
      if (b.position.z - b.userData.depth / 2 > NEAR) b.position.z -= this.citySpan[b.userData.side];
    }
    for (const s of this.signs) {
      s.position.z += dz;
      if (s.position.z > NEAR) s.position.z -= 525;
    }
  }

  update(time, camera) {
    this.skyMat.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
  }
}

function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const T = 8; // world units per window tile
  for (let f = 0; f < 6; f++) {
    let su = w / T, sv = h / T;
    if (f < 2) su = d / T;
    else if (f < 4) su = sv = 0; // roofs sample the dark facade corner
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  return g;
}

// A tiny neon studio rendered into a PMREM cube — gives the paint its synthwave reflections.
export function neonEnvironment(renderer) {
  const s = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = normalize(vP).y;
      vec3 c = mix(vec3(0.35,0.05,0.3), vec3(0.02,0.01,0.06), smoothstep(-0.1,0.6,h));
      c = mix(c, vec3(0.03,0.0,0.05), 1.0 - smoothstep(-0.4,0.0,h));
      gl_FragColor = vec4(c,1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), skyMat));
  const panel = (hex, k, pos, w, h) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    s.add(p);
  };
  panel(0xff2fd0, 3, [-12, 3, -6], 10, 4);
  panel(0x35f0ff, 3, [12, 4, 4], 10, 4);
  panel(0xffffff, 2.2, [0, 14, 0], 16, 6);
  panel(0xff8a3a, 3, [0, 2, -15], 8, 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  return tex;
}
