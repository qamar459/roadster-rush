// Single additive point cloud for sparks, thruster flames, pickups and explosions.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export class Particles {
  constructor(scene, max = 2000) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3).fill(-999);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.anchor = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.45, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // anchor = 1 means the particle is left behind on the road and scrolls with the world
  emit(x, y, z, vx, vy, vz, color, life, gravity = 0, anchor = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.base[j] = color.r; this.base[j + 1] = color.g; this.base[j + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.anchor[i] = anchor;
  }

  burst(x, y, z, count, color, speed, life, gravity = 0, anchor = 1) {
    for (let n = 0; n < count; n++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s * v, Math.abs(u) * v, Math.sin(a) * s * v, color, life * (0.5 + Math.random() * 0.5), gravity, anchor);
    }
  }

  update(dt, worldSpeed) {
    for (let i = 0; i < this.max; i++) {
      const j = i * 3;
      if (this.life[i] <= 0) {
        if (this.pos[j + 1] !== -999) {
          this.pos[j + 1] = -999;
          this.col[j] = this.col[j + 1] = this.col[j + 2] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += (this.vel[j + 2] + this.anchor[i] * worldSpeed) * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[j] = this.base[j] * f;
      this.col[j + 1] = this.base[j + 1] * f;
      this.col[j + 2] = this.base[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
