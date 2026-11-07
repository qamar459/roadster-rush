// All textures are painted procedurally onto canvases — no image assets.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const cache = new Map();
const once = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

const DISPLAY = 'Orbitron, "Arial Black", Arial, sans-serif';

// Road: 12 units wide, one tile = 16 units long
export function roadTextures() {
  return once('road', () => {
    const W = 512, H = 512;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#1d1a26';
    g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.random() * 26 - 13;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    const px = (x) => ((x + 6) / 12) * W;
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (const lane of [-3, 0, 3]) for (const o of [-0.85, 0.85]) g.fillRect(px(lane + o) - 10, 0, 20, H);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, 0, px(-4.6), H);
    g.fillRect(px(4.6), 0, W - px(4.6), H);

    const [e, ge] = canvas(W, H);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, W, H);
    const lines = (ctx, bright) => {
      ctx.fillStyle = bright ? '#dcdae8' : '#77758a';
      for (const x of [-1.5, 1.5]) ctx.fillRect(px(x) - 4, 40, 8, 200);
      ctx.fillStyle = '#35f0ff';
      ctx.fillRect(px(-4.6) - 5, 0, 8, H);
      ctx.fillStyle = '#ff3ad6';
      ctx.fillRect(px(4.6) - 3, 0, 8, H);
    };
    lines(g, true);
    lines(ge, false);
    return { map: tex(c, true), emissive: tex(e, true) };
  });
}

export function gridTexture() {
  return once('grid', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#07020e';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ff2fd0';
    g.lineWidth = 5;
    g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,47,208,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(128, 0); g.lineTo(128, 256);
    g.moveTo(0, 128); g.lineTo(256, 128);
    g.stroke();
    return tex(c, true);
  });
}

export function windowTexture(variant) {
  return once('win' + variant, () => {
    const [c, g] = canvas(256, 256);
    const palettes = [
      ['#ffd889', '#ffe9c2', '#ffb75e'],
      ['#7cf3ff', '#c9fbff', '#5aa8ff'],
      ['#ff7ae0', '#ffc1f1', '#b77aff'],
      ['#ffd889', '#7cf3ff', '#ff7ae0'],
    ];
    const pal = palettes[variant % 4];
    g.fillStyle = '#07060c';
    g.fillRect(0, 0, 256, 256);
    const lit = 0.28 + (variant % 3) * 0.08;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const on = Math.random() < lit;
        g.fillStyle = on ? pal[(Math.random() * pal.length) | 0] : '#141126';
        g.fillRect(x * 32 + 5, y * 32 + 7, 22, 18);
        if (on && Math.random() < 0.4) {
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(x * 32 + 5, y * 32 + 7, 22, 6 + Math.random() * 8);
        }
      }
    }
    return tex(c, true);
  });
}

export function hazardTexture() {
  return once('hazard', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#ffc21a';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#141018';
    for (let i = -128; i < 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 160, 128); g.lineTo(i + 128, 128);
      g.closePath();
      g.fill();
    }
    return tex(c, true);
  });
}

export function chevronTexture() {
  return once('chevron', () => {
    const [c, g] = canvas(512, 96);
    g.fillStyle = '#f4f4f8';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#e8132f';
    for (let x = -40; x < 560; x += 80) {
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 36, 0); g.lineTo(x + 76, 48); g.lineTo(x + 36, 96); g.lineTo(x, 96); g.lineTo(x + 40, 48);
      g.closePath();
      g.fill();
    }
    return tex(c);
  });
}

export function signTexture(lines, { bg = '#0c6b45', fg = '#ffffff', w = 512, h = 220 } = {}) {
  return once('sign' + lines.join('|') + bg, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => {
      const size = i === 0 ? 62 : 44;
      g.font = `900 ${size}px ${DISPLAY}`;
      const y = h / 2 + (i - (n - 1) / 2) * 72;
      g.fillText(t, w / 2, y, w - 60);
    });
    return tex(c);
  });
}

export function trailerTextures(variant = 0) {
  return once('trailer' + variant, () => {
    const brands = [
      ['VOLT', 'FREIGHT', '#35f0ff'],
      ['STARBASE', 'CARGO', '#ff3ad6'],
      ['HYPER', 'LOGISTICS', '#ffd23b'],
    ];
    const [name, sub, col] = brands[variant % brands.length];
    const W = 1024, H = 256;
    const [c, g] = canvas(W, H);
    const [e, ge] = canvas(W, H);
    g.fillStyle = '#c9ccd6';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 4, H);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, W, H);
    g.fillStyle = '#16131f';
    g.fillRect(0, 150, W, 70);
    for (const ctx of [g, ge]) {
      ctx.fillStyle = col;
      ctx.fillRect(0, 150, W, 6);
      ctx.fillRect(0, 214, W, 6);
      ctx.font = `italic 900 92px ${DISPLAY}`;
      ctx.fillStyle = ctx === g ? '#1b1826' : '#000';
      ctx.fillText(name, 40, 125);
      ctx.font = `700 46px ${DISPLAY}`;
      ctx.fillStyle = col;
      ctx.fillText(sub, 46, 203);
    }
    return { map: tex(c), emissive: tex(e) };
  });
}

export function glowTexture() {
  return once('glow', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return t;
  });
}

export function shadowTexture() {
  return once('shadow', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  });
}

// Vertical fade used as alphaMap for light cones (bright at top)
export function fadeTexture() {
  return once('fade', () => {
    const [c, g] = canvas(4, 128);
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(1, '#000');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  });
}

export const POWER_COLORS = { magnet: '#ff3b6b', shield: '#3be8ff', nitro: '#9f7bff', double: '#ffd23b' };

export function iconTexture(kind) {
  return once('icon' + kind, () => {
    const [c, g] = canvas(256, 256);
    const col = POWER_COLORS[kind];
    g.fillStyle = 'rgba(12,4,24,0.85)';
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    if (kind === 'magnet') {
      g.strokeStyle = col;
      g.lineWidth = 40;
      g.beginPath();
      g.arc(128, 118, 52, Math.PI, 0);
      g.lineTo(180, 190);
      g.moveTo(76, 118);
      g.lineTo(76, 190);
      g.stroke();
      g.fillStyle = '#f2f2f8';
      g.fillRect(56, 168, 40, 26);
      g.fillRect(160, 168, 40, 26);
    } else if (kind === 'shield') {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(128, 40);
      g.lineTo(200, 70);
      g.quadraticCurveTo(200, 170, 128, 216);
      g.quadraticCurveTo(56, 170, 56, 70);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(12,4,24,0.6)';
      g.beginPath();
      g.moveTo(128, 70);
      g.lineTo(176, 88);
      g.quadraticCurveTo(174, 156, 128, 186);
      g.closePath();
      g.fill();
    } else if (kind === 'nitro') {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(128, 30);
      g.quadraticCurveTo(200, 110, 176, 170);
      g.quadraticCurveTo(160, 220, 128, 224);
      g.quadraticCurveTo(96, 220, 80, 170);
      g.quadraticCurveTo(56, 110, 128, 30);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(128, 100);
      g.quadraticCurveTo(162, 150, 150, 182);
      g.quadraticCurveTo(140, 206, 128, 206);
      g.quadraticCurveTo(116, 206, 106, 182);
      g.quadraticCurveTo(94, 150, 128, 100);
      g.fill();
    } else {
      g.fillStyle = col;
      g.font = `italic 900 110px ${DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('2X', 128, 134);
    }
    g.strokeStyle = col;
    g.lineWidth = 8;
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.stroke();
    return tex(c);
  });
}
