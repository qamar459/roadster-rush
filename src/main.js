import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, neonEnvironment } from './world.js';
import { createRoadster, createPolice, tickModels, glow } from './models.js';
import { Spawner, laneX, LANE_W } from './spawner.js';
import { Particles } from './particles.js';
import { AudioEngine } from './audio.js';
import { shadowTexture, POWER_COLORS } from './textures.js';

// ------------------------------------------------------------------ tuning
const G = 36;
const JUMP_V = 12.5;
const LANE_SPEED = 17;
const PH_NORMAL = 1.38;
const PH_LOW = 0.9;
const START_SPEED = 24;
const MAX_SPEED = 54;
const POWER_TIME = { magnet: 12, shield: 15, nitro: 5, double: 15 };
const POWER_LABEL = { magnet: 'CELL MAGNET', shield: 'SHIELD', nitro: 'NITRO THRUSTERS', double: 'DOUBLE SCORE' };

const PAINTS = [
  { id: 'red', name: 'Multi-Coat Red', color: 0xc8101e, price: 0 },
  { id: 'silver', name: 'Midnight Silver', color: 0x5c616c, price: 150 },
  { id: 'white', name: 'Pearl White', color: 0xe9e9ee, price: 300, rough: 0.22 },
  { id: 'blue', name: 'Deep Blue', color: 0x1438a6, price: 500 },
  { id: 'black', name: 'Stealth Matte', color: 0x151518, price: 800, rough: 0.7, clear: 0, metal: 0.3 },
  { id: 'violet', name: 'Synth Violet', color: 0x7a1fd6, price: 1200 },
  { id: 'lime', name: 'Volt Lime', color: 0x7ad61f, price: 1600 },
  { id: 'gold', name: 'Starman Gold', color: 0xd4a017, price: 2500, metal: 0.95, rough: 0.2 },
];
const GLOWS = [
  { id: 'cyan', name: 'Cyan Underglow', color: 0x35f0ff, price: 0 },
  { id: 'magenta', name: 'Magenta Underglow', color: 0xff3ad6, price: 200 },
  { id: 'lime', name: 'Lime Underglow', color: 0x7dff3a, price: 400 },
  { id: 'orange', name: 'Sunset Underglow', color: 0xff8a2a, price: 400 },
];

// ------------------------------------------------------------------ save data
const SAVE_KEY = 'roadster-rush-save-v1';
const save = (() => {
  const defaults = { best: 0, bank: 0, paint: 'red', glow: 'cyan', paints: ['red'], glows: ['cyan'], muted: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return defaults;
  }
})();
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lives for this session only */
  }
};

// ------------------------------------------------------------------ DOM
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu'), garage: $('garage'), pause: $('pause'), over: $('over'),
  score: $('score'), mult: $('mult'), cells: $('cells'), dist: $('dist'), kmh: $('kmh'),
  powers: $('powers'), toast: $('toast'), flash: $('flash'), policeEdge: $('police-edge'),
};

async function boot() {
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

  // ---------------------------------------------------------------- renderer
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0x4a1458);
  scene.fog = new THREE.Fog(fogColor, 40, 300);
  scene.background = fogColor;
  scene.environment = neonEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
  camera.position.set(6, 2.5, 6);

  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.35, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight(0x8a6cff, 0x200820, 0.9));
  const key = new THREE.DirectionalLight(0xff9ac0, 1.4);
  key.position.set(-4, 8, -12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c8ff, 1.1);
  fill.position.set(3, 6, 10);
  scene.add(fill);

  const world = new World(scene, fogColor);
  const spawner = new Spawner(scene);
  const particles = new Particles(scene);
  const audio = new AudioEngine();
  audio.muted = save.muted;

  // ---------------------------------------------------------------- player car
  const car = createRoadster(PAINTS.find((p) => p.id === save.paint) ?? PAINTS[0], (GLOWS.find((g) => g.id === save.glow) ?? GLOWS[0]).color);
  scene.add(car.root);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(POWER_COLORS.shield).multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const shieldBubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shieldMat);
  shieldBubble.scale.set(1.6, 1.2, 3.0);
  shieldBubble.visible = false;
  car.root.add(shieldBubble);
  shieldBubble.position.y = 0.7;
  const magnetRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 8, 48), glow(POWER_COLORS.magnet, 2));
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.position.y = 0.1;
  magnetRing.visible = false;
  car.root.add(magnetRing);

  const police = createPolice();
  police.root.position.set(0, 0, 30);
  scene.add(police.root);
  const policeWheels = police.root.children.filter((c) => c.isGroup);

  // ---------------------------------------------------------------- state
  let mode = 'menu'; // menu | garage | playing | paused | crashing | over
  const state = { time: 0, distance: 0, speed: 14, score: 0, cells: 0, combo: 0, comboTimer: 0, shake: 0, ground: 0, crashT: 0, reason: '', reasonText: '' };
  const player = { lane: 0, prevLane: 0, x: 0, y: 0, vy: 0, grounded: true, low: 0, jumpBuffer: 0, slope: 0, pitch: 0 };
  const power = { magnet: 0, shield: 0, nitro: 0, double: 0, grace: 0 };
  const chase = { timer: 0, z: 30 };
  const camLook = new THREE.Vector3(0, 1, -10);
  const tmpV = new THREE.Vector3();

  const difficulty = () => Math.min(1, state.distance / 6000);
  const multiplier = () => Math.min(10, 1 + Math.floor(state.distance / 800)) * (power.double > 0 ? 2 : 1);

  // ---------------------------------------------------------------- HUD helpers
  const powerEls = {};
  for (const k of Object.keys(POWER_TIME)) {
    const el = document.createElement('div');
    el.className = 'power hidden';
    el.style.setProperty('--c', POWER_COLORS[k]);
    el.innerHTML = `${POWER_LABEL[k]}<div class="bar"><i></i></div>`;
    ui.powers.appendChild(el);
    powerEls[k] = { el, bar: el.querySelector('i') };
  }

  let toastTimer = 0;
  function toast(text, color = '#ff3ad6') {
    ui.toast.textContent = text;
    ui.toast.style.setProperty('--tc', color);
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1700);
  }

  function flash(opacity = 0.5) {
    ui.flash.style.transition = 'none';
    ui.flash.style.opacity = opacity;
    requestAnimationFrame(() => {
      ui.flash.style.transition = 'opacity 0.45s';
      ui.flash.style.opacity = 0;
    });
  }

  function show(screen) {
    for (const s of ['menu', 'garage', 'pause', 'over']) ui[s].classList.toggle('hidden', s !== screen);
    ui.hud.classList.toggle('hidden', !['playing', 'paused', 'crashing'].includes(mode));
  }

  function refreshMenuStats() {
    $('bestScore').textContent = Math.floor(save.best).toLocaleString();
    $('bank').textContent = save.bank.toLocaleString();
    $('garageBank').textContent = save.bank.toLocaleString();
  }

  let lastHud = '';
  function updateHud() {
    const s = Math.floor(state.score);
    const sig = `${s}|${state.cells}|${Math.floor(state.distance)}|${multiplier()}`;
    if (sig !== lastHud) {
      lastHud = sig;
      ui.score.textContent = s.toLocaleString();
      ui.cells.textContent = state.cells;
      ui.dist.textContent = `${Math.floor(state.distance).toLocaleString()} m`;
      ui.mult.textContent = `×${multiplier()}`;
      ui.mult.classList.toggle('double', power.double > 0);
    }
    ui.kmh.textContent = Math.round(state.speed * 4.4);
    for (const k of Object.keys(POWER_TIME)) {
      const on = power[k] > 0;
      powerEls[k].el.classList.toggle('hidden', !on);
      if (on) powerEls[k].bar.style.width = `${(power[k] / POWER_TIME[k]) * 100}%`;
    }
    ui.policeEdge.classList.toggle('on', chase.timer > 0 && mode === 'playing');
  }

  // ---------------------------------------------------------------- game flow
  function resetRun() {
    spawner.reset();
    Object.assign(state, { distance: 0, speed: START_SPEED, score: 0, cells: 0, combo: 0, comboTimer: 0, shake: 0, ground: 0, crashT: 0 });
    Object.assign(player, { lane: 0, prevLane: 0, x: 0, y: 0, vy: 0, grounded: true, low: 0, jumpBuffer: 0, slope: 0, pitch: 0 });
    Object.assign(power, { magnet: 0, shield: 0, nitro: 0, double: 0, grace: 0 });
    chase.timer = 0;
    chase.z = 30;
    car.root.rotation.set(0, 0, 0);
    car.root.position.set(0, 0, 0);
    car.body.rotation.set(0, 0, 0);
  }

  function startRun() {
    audio.init();
    audio.play('click');
    resetRun();
    mode = 'playing';
    audio.intensity = 1;
    show(null);
    lastHud = '';
    spawner.fill(state.speed, 0);
    toast('GO!', '#35f0ff');
  }

  function toMenu() {
    resetRun();
    mode = 'menu';
    audio.intensity = 0;
    state.speed = 14;
    refreshMenuStats();
    show('menu');
  }

  function setPause(p) {
    if (p && mode === 'playing') {
      mode = 'paused';
      show('pause');
      audio.setEngine(0, false, false);
      audio.setSiren(0);
    } else if (!p && mode === 'paused') {
      mode = 'playing';
      show(null);
    }
  }

  function endRun() {
    mode = 'over';
    save.bank += state.cells;
    const isBest = state.score > save.best;
    if (isBest) save.best = Math.floor(state.score);
    persist();
    $('overTitle').textContent = state.reason;
    $('overTitle').classList.toggle('busted', state.reason === 'BUSTED');
    $('overReason').textContent = state.reasonText;
    $('overScore').textContent = Math.floor(state.score).toLocaleString();
    $('overBest').textContent = Math.floor(save.best).toLocaleString();
    $('overDist').textContent = `${Math.floor(state.distance).toLocaleString()} m`;
    $('overCells').textContent = `+${state.cells}`;
    $('newBest').classList.toggle('hidden', !isBest);
    audio.intensity = 0;
    audio.setSiren(0);
    show('over');
  }

  // ---------------------------------------------------------------- actions
  function steer(dir) {
    if (mode !== 'playing') return;
    const next = player.lane + dir;
    if (next < -1 || next > 1) {
      state.shake = Math.max(state.shake, 0.15);
      return;
    }
    player.prevLane = player.lane;
    player.lane = next;
    audio.play('lane');
  }

  function jump() {
    if (mode !== 'playing') return;
    if (player.grounded) {
      player.vy = JUMP_V;
      player.grounded = false;
      player.low = 0;
      audio.play('jump');
    } else {
      player.jumpBuffer = 0.18;
    }
  }

  function duck() {
    if (mode !== 'playing') return;
    if (!player.grounded) player.vy = Math.min(player.vy, -26);
    player.low = 0.75;
    audio.play('duck');
  }

  function smash(o) {
    spawner.smash(o);
    const c = new THREE.Color();
    for (let i = 0; i < 50; i++) {
      c.setHSL(Math.random() < 0.5 ? 0.08 : 0.88, 1, 0.6).multiplyScalar(3);
      particles.emit(o.x + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 2, o.z + o.def.len / 2,
        (Math.random() - 0.5) * 14, 4 + Math.random() * 10, -Math.random() * 10, c, 0.9, 25);
    }
    state.score += 50 * multiplier();
    state.shake = Math.max(state.shake, 0.35);
    audio.play('smash');
  }

  function stumble() {
    audio.play('stumble');
    state.shake = Math.max(state.shake, 0.6);
    flash(0.35);
    if (chase.timer > 0) {
      state.reason = 'BUSTED';
      state.reasonText = 'Second slip-up — highway patrol caught you.';
      beginCrash(false);
      return;
    }
    chase.timer = 8;
    toast('POLICE ON YOUR TAIL!', '#4a6cff');
  }

  function crash(o) {
    state.reason = 'WRECKED';
    state.reasonText = `You slammed into ${o.def.label}.`;
    beginCrash(true);
  }

  function beginCrash(hard) {
    mode = 'crashing';
    state.crashT = 0;
    state.hardCrash = hard;
    chase.timer = 10;
    audio.play(hard ? 'crash' : 'stumble');
    audio.setEngine(0, false, false);
    flash(hard ? 0.7 : 0.4);
    state.shake = hard ? 1.4 : 0.6;
    if (hard) {
      state.speed = 0;
      const c = new THREE.Color();
      for (let i = 0; i < 140; i++) {
        c.setHSL(0.02 + Math.random() * 0.12, 1, 0.55).multiplyScalar(3.5);
        particles.emit(player.x + (Math.random() - 0.5) * 1.6, player.y + 0.6 + Math.random(), -2.2,
          (Math.random() - 0.5) * 16, 2 + Math.random() * 12, (Math.random() - 0.2) * 12, c, 1.2, 22, 0);
      }
    }
  }

  function hitObstacle(o) {
    if (power.nitro > 0 || power.grace > 0) {
      smash(o);
      return;
    }
    if (power.shield > 0) {
      smash(o);
      power.shield = 0;
      power.grace = 1;
      audio.play('shieldDown');
      toast('SHIELD DOWN', POWER_COLORS.shield);
      return;
    }
    const changing = Math.abs(player.x - laneX(player.lane)) > 0.3;
    if (changing) {
      o.hit = true;
      if (Math.round(o.x / LANE_W) === player.lane) {
        const t = player.lane;
        player.lane = player.prevLane;
        player.prevLane = t;
      }
      stumble();
    } else {
      crash(o);
    }
  }

  const COIN_COLOR = new THREE.Color(3, 2.2, 0.4);
  function onPickup(c, kind) {
    if (kind) {
      power[kind] = POWER_TIME[kind];
      audio.play('power');
      if (kind === 'nitro') audio.play('nitro');
      toast(POWER_LABEL[kind], POWER_COLORS[kind]);
      particles.burst(player.x, player.y + 1, 0, 40, new THREE.Color(POWER_COLORS[kind]).multiplyScalar(3), 8, 0.6, 0, 0);
      return;
    }
    state.cells++;
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 0;
    state.comboTimer = 0.5;
    state.score += 10 * multiplier();
    audio.play('coin', state.combo);
    particles.burst(c.x, c.y, c.z, 6, COIN_COLOR, 4, 0.35, 0, 0);
  }

  // ---------------------------------------------------------------- simulation
  function step(h) {
    const dz = state.speed * h;
    state.distance += dz;
    spawner.advance(dz);
    world.advance(dz);

    const tx = laneX(player.lane);
    const dx = tx - player.x;
    player.x += Math.sign(dx) * Math.min(Math.abs(dx), LANE_SPEED * h);
    player.low = Math.max(0, player.low - h);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - h);
    const ph = player.low > 0 ? PH_LOW : PH_NORMAL;

    if (!player.grounded) {
      player.vy -= G * h;
      player.y += player.vy * h;
    }
    const probe = spawner.probe(player.x, player.y, ph, player.grounded ? player.slope : 0);
    state.ground = probe.ground;
    if (player.grounded) {
      if (probe.ground < player.y - 0.05) {
        player.grounded = false; // drove off an edge or launched off a ramp lip
      } else {
        player.y = probe.ground;
        player.vy = probe.slope * state.speed;
        player.slope = probe.slope;
      }
    } else if (player.y <= probe.ground && player.vy <= 0) {
      const impact = -player.vy;
      player.y = probe.ground;
      player.vy = 0;
      player.slope = 0;
      player.grounded = true;
      if (impact > 6) {
        audio.play('land');
        const dust = new THREE.Color(1.2, 0.8, 1.6);
        for (let i = 0; i < 16; i++) particles.emit(player.x + (Math.random() - 0.5) * 2, player.y + 0.1, 1 + Math.random() * 2, (Math.random() - 0.5) * 6, Math.random() * 2, 2, dust, 0.4);
      }
      if (player.jumpBuffer > 0) {
        player.jumpBuffer = 0;
        jump();
      }
    }

    for (const o of probe.hits) {
      hitObstacle(o);
      if (mode !== 'playing') return;
    }

    spawner.collect(player.x, player.y, ph, power.magnet > 0, h, onPickup);
    state.score += dz * 0.5 * multiplier();
  }

  function updatePlaying(dt) {
    const base = START_SPEED + (MAX_SPEED - START_SPEED) * (1 - Math.exp(-state.distance / 3500));
    const target = power.nitro > 0 ? base * 1.45 : base;
    state.speed += (target - state.speed) * (1 - Math.exp(-dt * 3));

    for (const k of ['magnet', 'shield', 'double', 'grace']) power[k] = Math.max(0, power[k] - dt);
    if (power.nitro > 0) {
      power.nitro -= dt;
      if (power.nitro <= 0) {
        power.nitro = 0;
        power.grace = 1.2;
      }
    }
    chase.timer = Math.max(0, chase.timer - dt);
    state.comboTimer -= dt;

    const steps = Math.max(1, Math.ceil((state.speed * dt) / 0.5));
    const h = dt / steps;
    for (let i = 0; i < steps && mode === 'playing'; i++) step(h);

    spawner.cull();
    spawner.fill(state.speed, difficulty());
    audio.setEngine((state.speed - START_SPEED) / (MAX_SPEED * 1.45 - START_SPEED), true, power.nitro > 0);
  }

  function updateCrash(dt) {
    state.crashT += dt;
    if (!state.hardCrash) state.speed = Math.max(0, state.speed - 45 * dt);
    const dz = state.speed * dt;
    spawner.advance(dz);
    world.advance(dz);
    if (state.hardCrash) {
      const t = Math.min(1, state.crashT * 3);
      car.root.position.z = 1.6 * (1 - (1 - t) * (1 - t));
      car.root.rotation.y = 0.5 * t;
      car.body.rotation.x = -0.12 * t;
      if (Math.random() < 0.5) {
        const c = new THREE.Color(2.5, 0.8 + Math.random(), 0.2);
        particles.emit(player.x + (Math.random() - 0.5), player.y + 1, car.root.position.z - 1.5, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, 0, c, 0.8, -2, 0);
      }
    }
    if (!player.grounded) {
      player.vy -= G * dt;
      player.y = Math.max(state.ground, player.y + player.vy * dt);
      if (player.y <= state.ground) player.grounded = true;
    }
    if (state.crashT > 1.7) endRun();
  }

  // ---------------------------------------------------------------- visuals
  function updateCar(dt) {
    const tx = laneX(player.lane);
    car.root.position.x = player.x;
    car.root.position.y = player.y;
    if (mode !== 'crashing') car.root.position.z = 0;

    const k = 1 - Math.exp(-dt * 12);
    const lat = tx - player.x;
    if (mode !== 'crashing') {
      car.body.rotation.z += (THREE.MathUtils.clamp(lat * 0.06, -0.12, 0.12) - car.body.rotation.z) * k;
      car.root.rotation.y += (THREE.MathUtils.clamp(-lat * 0.07, -0.18, 0.18) - car.root.rotation.y) * k;
      const pitch = player.grounded ? Math.atan(player.slope) : THREE.MathUtils.clamp(player.vy * 0.022, -0.3, 0.3);
      car.body.rotation.x += (pitch - car.body.rotation.x) * k;
    }
    const low = player.low > 0 ? 1 : 0;
    car.body.scale.y += ((low ? 0.68 : 1) - car.body.scale.y) * (1 - Math.exp(-dt * 20));
    for (const w of car.wheels) w.rotation.x -= (state.speed * dt) / 0.36;
    for (const w of car.front) w.rotation.y = THREE.MathUtils.clamp(-lat * 0.12, -0.35, 0.35);

    const pulse = 1.3 + Math.sin(state.time * 6) * 0.3;
    car.underMat.opacity = pulse * (1 - Math.min(1, (player.y - state.ground) * 0.25));
    car.thrusters.visible = power.nitro > 0;
    shieldBubble.visible = power.shield > 0 || power.grace > 0;
    shieldBubble.rotation.y += dt * 1.5;
    shieldMat.opacity = power.shield > 0 ? 0.45 + Math.sin(state.time * 8) * 0.1 : (Math.sin(state.time * 40) > 0 ? 0.4 : 0);
    magnetRing.visible = power.magnet > 0;
    magnetRing.scale.setScalar(1 + (state.time * 1.5) % 1);

    // blob shadow sits on whatever surface is under the car
    const air = Math.max(0, player.y - state.ground);
    shadow.position.set(player.x, state.ground + 0.02, car.root.position.z);
    shadow.scale.setScalar(Math.max(0.4, 1 - air * 0.12));
    shadow.material.opacity = Math.max(0.15, 1 - air * 0.18);

    if (mode !== 'playing') return;
    // low-ride sparks
    if (low && player.grounded) {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Color(3, 1.4 + Math.random(), 0.3);
        particles.emit(player.x + (Math.random() < 0.5 ? -0.8 : 0.8), player.y + 0.08, 1.8, (Math.random() - 0.5) * 3, 1 + Math.random() * 3, 4 + Math.random() * 6, c, 0.35, 20);
      }
    }
    // thruster flames
    if (power.nitro > 0) {
      for (const sx of [-0.42, 0.42]) {
        const c = new THREE.Color(0.8 + Math.random(), 1.6 + Math.random(), 4);
        particles.emit(player.x + sx, player.y + 0.58 * car.body.scale.y, 2.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 14 + Math.random() * 8, c, 0.18, 0, 0);
      }
      // speed streaks rushing past
      const sc = new THREE.Color(1.5, 1.5, 2.5);
      particles.emit((Math.random() - 0.5) * 18, 0.5 + Math.random() * 6, -60, 0, 0, 60, sc, 1.2, 0, 1);
    }
  }

  function updatePolice(dt) {
    const visible = (mode === 'playing' && chase.timer > 0) || (mode === 'crashing' && chase.timer > 0) || mode === 'over' && state.reason === 'BUSTED';
    const targetZ = !visible ? 34 : mode === 'playing' ? 4.9 : 4.5;
    chase.z += (targetZ - chase.z) * (1 - Math.exp(-dt * (visible ? 2 : 0.8)));
    police.root.position.z = car.root.position.z + chase.z;
    police.root.position.x += (player.x - police.root.position.x) * (1 - Math.exp(-dt * 3));
    police.root.position.y = mode === 'playing' ? Math.min(player.y, state.ground) : 0;
    police.root.visible = chase.z < 30;
    for (const w of policeWheels) w.rotation.x -= (state.speed * dt) / 0.36;
    const on = Math.sin(state.time * 18) > 0;
    police.red.color.setRGB(on ? 4 : 0.3, 0.05, 0.1);
    police.blue.color.setRGB(0.05, 0.15, on ? 0.3 : 4);
    audio.setSiren(police.root.visible ? Math.max(0, 1 - (chase.z - 5) / 20) : 0);
  }

  function updateCamera(dt) {
    let pos, look, fov;
    const narrow = camera.aspect < 1;
    if (mode === 'menu' || mode === 'garage') {
      const a = mode === 'garage' ? 0.9 + Math.sin(state.time * 0.3) * 0.35 : state.time * 0.22;
      const r = mode === 'garage' ? 6.4 : 8.5;
      pos = tmpV.set(Math.sin(a) * r, mode === 'garage' ? 1.7 : 2.6, Math.cos(a) * r - (mode === 'garage' ? 0 : 1));
      look = new THREE.Vector3(mode === 'garage' && !narrow ? -1.4 * Math.cos(a) : 0, 0.75, mode === 'garage' && !narrow ? 1.4 * Math.sin(a) : 0);
      fov = narrow ? 70 : 45;
    } else {
      const air = player.y;
      pos = tmpV.set(player.x * 0.6, 3.9 + air * 0.75, 8.6);
      look = new THREE.Vector3(player.x * 0.8, 1.2 + air * 0.7, -10);
      fov = 60 + (state.speed - START_SPEED) * 0.28 + (power.nitro > 0 ? 6 : 0);
      if (narrow) fov *= 1.3;
    }
    const k = 1 - Math.exp(-dt * (mode === 'menu' || mode === 'garage' ? 2.5 : 7));
    camera.position.lerp(pos, k);
    camLook.lerp(look, k);
    camera.fov += (fov - camera.fov) * k;
    camera.updateProjectionMatrix();
    camera.lookAt(camLook);
    if (state.shake > 0) {
      const s = state.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      state.shake = Math.max(0, state.shake - dt * 2.2);
    }
  }

  // ---------------------------------------------------------------- main loop
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    state.time += dt;

    if (mode === 'playing') updatePlaying(dt);
    else if (mode === 'crashing') updateCrash(dt);
    else if (mode === 'menu' || mode === 'garage') {
      state.speed = 14;
      world.advance(state.speed * dt);
      audio.setEngine(0, false, false);
    }

    tickModels(state.time);
    updateCar(dt);
    updatePolice(dt);
    updateCamera(dt);
    particles.update(mode === 'paused' ? 0 : dt, mode === 'paused' ? 0 : state.speed);
    spawner.render(state.time);
    world.update(state.time, camera);
    if (mode === 'playing' || mode === 'crashing') updateHud();
    composer.render();
  }

  // ---------------------------------------------------------------- input
  const KEYS = {
    ArrowLeft: () => steer(-1), KeyA: () => steer(-1),
    ArrowRight: () => steer(1), KeyD: () => steer(1),
    ArrowUp: jump, KeyW: jump, Space: jump,
    ArrowDown: duck, KeyS: duck,
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (KEYS[e.code] && mode === 'playing') {
      e.preventDefault();
      KEYS[e.code]();
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (mode === 'playing') setPause(true);
      else if (mode === 'paused') setPause(false);
      else if (mode === 'garage') closeGarage();
    } else if (e.code === 'KeyM') {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      persist();
      toast(save.muted ? 'SOUND OFF' : 'SOUND ON', '#35f0ff');
    } else if ((e.code === 'Enter' || e.code === 'Space') && (mode === 'menu' || mode === 'over')) {
      e.preventDefault();
      startRun();
    }
  });

  let touch = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touch = { x: t.clientX, y: t.clientY, done: false };
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!touch || touch.done) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    if (Math.hypot(dx, dy) < 28) return;
    touch.done = true;
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1);
    else if (dy < 0) jump();
    else duck();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPause(true);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  });

  // ---------------------------------------------------------------- menus & garage
  $('playBtn').onclick = startRun;
  $('retryBtn').onclick = startRun;
  $('menuBtn').onclick = () => { audio.play('click'); toMenu(); };
  $('resumeBtn').onclick = () => setPause(false);
  $('quitBtn').onclick = () => { audio.play('click'); toMenu(); };
  $('pauseBtn').onclick = () => setPause(true);
  $('garageBtn').onclick = () => {
    audio.init();
    audio.play('click');
    mode = 'garage';
    buildGarage();
    show('garage');
  };
  $('garageBack').onclick = closeGarage;
  function closeGarage() {
    audio.play('click');
    car.setPaint(PAINTS.find((p) => p.id === save.paint));
    car.setGlow(GLOWS.find((g) => g.id === save.glow).color);
    mode = 'menu';
    refreshMenuStats();
    show('menu');
  }

  function buildGarage() {
    refreshMenuStats();
    const render = (list, el, ownedKey, selKey, apply) => {
      el.innerHTML = '';
      for (const item of list) {
        const owned = save[ownedKey].includes(item.id);
        const b = document.createElement('button');
        b.className = `swatch${owned ? '' : ' locked'}${save[selKey] === item.id ? ' sel' : ''}`;
        b.style.setProperty('--c', `#${item.color.toString(16).padStart(6, '0')}`);
        b.title = item.name;
        if (!owned) b.innerHTML = `<span class="price">⚡${item.price}</span>`;
        b.onmouseenter = () => {
          $('garageName').textContent = owned ? item.name : `${item.name} — ${item.price} cells`;
          apply(item);
        };
        b.onmouseleave = () => apply(list.find((i) => i.id === save[selKey]));
        b.onclick = () => {
          if (!owned) {
            if (save.bank < item.price) {
              audio.play('deny');
              b.classList.remove('shake');
              void b.offsetWidth;
              b.classList.add('shake');
              $('garageName').textContent = `Need ${item.price - save.bank} more cells`;
              return;
            }
            save.bank -= item.price;
            save[ownedKey].push(item.id);
            audio.play('buy');
          } else {
            audio.play('click');
          }
          save[selKey] = item.id;
          persist();
          apply(item);
          $('garageName').textContent = item.name;
          buildGarage();
        };
        el.appendChild(b);
      }
    };
    render(PAINTS, $('paints'), 'paints', 'paint', (p) => car.setPaint(p));
    render(GLOWS, $('glows'), 'glows', 'glow', (g) => car.setGlow(g.color));
  }

  // debug/testing hook
  window.__rr = { state, player, power, chase, get mode() { return mode; }, spawner };

  refreshMenuStats();
  show('menu');
  frame();
}

boot();
