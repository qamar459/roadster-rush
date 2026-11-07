// Fully synthesized audio: electric-motor whine, sound effects, siren and a synthwave soundtrack.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 112;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.intensity = 0; // 0 = menu (no drums), 1 = racing
    this.step = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.3;
    this.music.connect(this.master);

    this.delay = c.createDelay(1);
    this.delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    const wet = c.createGain();
    wet.gain.value = 0.45;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.music);

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.buildEngine();
    this.buildSiren();
    this.nextTime = c.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------ continuous voices
  buildEngine() {
    const c = this.ctx;
    this.eGain = c.createGain();
    this.eGain.gain.value = 0;
    this.eFilter = c.createBiquadFilter();
    this.eFilter.type = 'lowpass';
    this.eFilter.Q.value = 5;
    this.eOsc1 = c.createOscillator();
    this.eOsc1.type = 'sawtooth';
    this.eOsc2 = c.createOscillator();
    this.eOsc2.type = 'sine';
    const g2 = c.createGain();
    g2.gain.value = 0.7;
    this.eOsc1.connect(this.eFilter);
    this.eOsc2.connect(g2);
    g2.connect(this.eFilter);
    this.eFilter.connect(this.eGain);
    this.eGain.connect(this.sfx);
    this.eOsc1.start();
    this.eOsc2.start();

    const rn = c.createBufferSource();
    rn.buffer = this.noise;
    rn.loop = true;
    const rf = c.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 500;
    rf.Q.value = 0.7;
    this.rnGain = c.createGain();
    this.rnGain.gain.value = 0;
    rn.connect(rf);
    rf.connect(this.rnGain);
    this.rnGain.connect(this.sfx);
    rn.start();
  }

  buildSiren() {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 760;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    const depth = c.createGain();
    depth.gain.value = 150;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    osc.connect(f);
    f.connect(this.sirenGain);
    this.sirenGain.connect(this.sfx);
    osc.start();
    lfo.start();
  }

  setEngine(norm, on, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 70 + norm * 190 + (boost ? 70 : 0);
    this.eOsc1.frequency.setTargetAtTime(f, t, 0.12);
    this.eOsc2.frequency.setTargetAtTime(f * 2.003, t, 0.12);
    this.eFilter.frequency.setTargetAtTime(500 + norm * 1600 + (boost ? 1400 : 0), t, 0.12);
    this.eGain.gain.setTargetAtTime(on ? 0.04 + norm * 0.04 : 0, t, 0.15);
    this.rnGain.gain.setTargetAtTime(on ? 0.03 + norm * 0.07 : 0, t, 0.2);
  }

  setSiren(level) {
    if (this.ctx) this.sirenGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.1);
  }

  // ------------------------------------------------------------ one-shots
  tone(type, f0, f1, dur, gain, dest = this.sfx, t = this.ctx.currentTime) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    return g;
  }

  hiss(type, f0, f1, dur, gain, dest = this.sfx, t = this.ctx.currentTime, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  play(name, arg = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'coin': {
        const p = Math.min(arg, 12);
        this.tone('square', mtof(84 + (p % 5) * 2), mtof(84 + (p % 5) * 2), 0.06, 0.06);
        this.tone('square', mtof(91 + (p % 5) * 2), mtof(91 + (p % 5) * 2), 0.12, 0.05, this.sfx, t + 0.05);
        break;
      }
      case 'jump':
        this.hiss('bandpass', 400, 2400, 0.28, 0.25, this.sfx, t, 2);
        this.tone('sine', 280, 620, 0.2, 0.12);
        break;
      case 'land':
        this.tone('sine', 140, 45, 0.18, 0.35);
        this.hiss('lowpass', 900, 200, 0.12, 0.15);
        break;
      case 'lane':
        this.hiss('bandpass', 1800, 700, 0.14, 0.12, this.sfx, t, 3);
        break;
      case 'duck':
        this.hiss('highpass', 3000, 6000, 0.3, 0.12);
        this.tone('sawtooth', 160, 80, 0.2, 0.06);
        break;
      case 'stumble':
        this.tone('square', 240, 90, 0.3, 0.16);
        this.hiss('lowpass', 2500, 300, 0.3, 0.4);
        break;
      case 'crash':
        this.hiss('lowpass', 4000, 120, 1.1, 0.9);
        this.tone('sine', 90, 28, 0.8, 0.7);
        this.tone('sawtooth', 300, 40, 0.5, 0.15);
        break;
      case 'smash':
        this.hiss('bandpass', 3000, 300, 0.4, 0.5, this.sfx, t, 0.8);
        this.tone('square', 600, 1500, 0.15, 0.06);
        break;
      case 'power':
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone('triangle', mtof(n), mtof(n), 0.16, 0.12, this.sfx, t + i * 0.06));
        break;
      case 'nitro':
        this.hiss('bandpass', 300, 4000, 0.9, 0.5, this.sfx, t, 1.5);
        break;
      case 'shieldDown':
        this.tone('triangle', 1200, 200, 0.4, 0.15);
        break;
      case 'click':
        this.tone('square', 1200, 1200, 0.04, 0.05);
        break;
      case 'buy':
        [76, 83, 88].forEach((n, i) => this.tone('square', mtof(n), mtof(n), 0.1, 0.06, this.sfx, t + i * 0.07));
        break;
      case 'deny':
        this.tone('square', 180, 140, 0.18, 0.08);
        break;
    }
  }

  // ------------------------------------------------------------ music sequencer
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const spb = 60 / BPM / 4;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += spb;
      this.step++;
    }
  }

  playStep(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const roots = [57, 53, 48, 55]; // Am  F  C  G
    const thirds = [3, 4, 4, 4];
    const root = roots[bar];
    const spb = 60 / BPM / 4;
    const drums = this.intensity > 0.5;

    if (drums) {
      if (i % 4 === 0) this.tone('sine', 150, 40, 0.28, 0.9, this.music, t);
      if (i === 4 || i === 12) {
        this.hiss('bandpass', 1900, 1200, 0.16, 0.5, this.music, t, 0.8);
        this.tone('triangle', 200, 140, 0.1, 0.25, this.music, t);
      }
      this.hiss('highpass', 8000, 9000, 0.04, i % 4 === 2 ? 0.16 : 0.06, this.music, t);
    }
    if (i % 2 === 0) {
      const n = root - 24 + (i % 4 === 2 ? 12 : 0);
      this.tone('sawtooth', mtof(n), mtof(n), spb * 1.8, 0.16, this.music, t);
    }
    const chord = [0, thirds[bar], 7, 12];
    const n = root + 12 + chord[i % 4] + (i >= 8 ? 12 : 0);
    const lead = this.tone('square', mtof(n), mtof(n), spb * 0.9, drums ? 0.035 : 0.025, this.music, t);
    lead.connect(this.delay);
    if (i === 0) {
      for (const iv of [0, thirds[bar], 7]) this.tone('triangle', mtof(root + iv), mtof(root + iv), spb * 15, 0.03, this.music, t);
    }
  }
}
