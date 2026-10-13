import * as THREE from 'three';

// ---------- deterministic RNG ----------
export function hash2(x, y, seed = 1337) {
  let h = (x * 374761393 + y * 668265263 + seed * 1440662683) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
export function hash01(x, y, seed = 1337) {
  return hash2(x, y, seed) / 4294967296;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- procedural canvas textures ----------
function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const grain = (g, s, n, alpha) => {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
};

export function makeTextures() {
  // Level 0 yellow wallpaper with vertical stripe motif (Kane Parsons)
  const wallpaper = canvasTex(256, (g, s) => {
    g.fillStyle = '#b8a44f'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#ac9a47';
    for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 16, s);
    g.fillStyle = 'rgba(120,100,40,.5)';
    for (let x = 8; x < s; x += 32) g.fillRect(x, 0, 2, s);
    // diamond motif
    g.strokeStyle = 'rgba(90,75,30,.55)'; g.lineWidth = 2;
    for (let y = 16; y < s; y += 48) for (let x = 16; x < s; x += 32) {
      g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 6, y); g.lineTo(x, y + 8); g.lineTo(x - 6, y); g.closePath(); g.stroke();
    }
    grain(g, s, 900, 0.06);
  }, 3, 1);

  const carpet = canvasTex(256, (g, s) => {
    g.fillStyle = '#8a7a52'; g.fillRect(0, 0, s, s);
    grain(g, s, 5200, 0.16);
    g.fillStyle = 'rgba(60,50,25,.25)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * s, Math.random() * s, 3, 1);
  }, 8, 8);

  const ceilingTile = canvasTex(256, (g, s) => {
    g.fillStyle = '#cfc9b4'; g.fillRect(0, 0, s, s);
    grain(g, s, 2600, 0.10);
    g.strokeStyle = 'rgba(80,75,60,.6)'; g.lineWidth = 3;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.fillStyle = 'rgba(90,85,65,.35)';
    for (let i = 0; i < 120; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }, 12, 12);

  const concrete = canvasTex(256, (g, s) => {
    g.fillStyle = '#8d8d88'; g.fillRect(0, 0, s, s);
    grain(g, s, 4200, 0.13);
    g.fillStyle = 'rgba(50,50,50,.18)';
    for (let i = 0; i < 12; i++) { const y = Math.random() * s; g.fillRect(0, y, s, 1 + Math.random() * 3); }
  }, 4, 2);

  const concreteFloor = canvasTex(256, (g, s) => {
    g.fillStyle = '#6f6f6a'; g.fillRect(0, 0, s, s);
    grain(g, s, 5000, 0.15);
    g.strokeStyle = 'rgba(30,30,30,.4)';
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 2); g.lineTo(s, i * s / 2); g.stroke(); }
  }, 8, 8);

  const poolTile = canvasTex(256, (g, s) => {
    g.fillStyle = '#e8f1f0'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,170,175,.7)'; g.lineWidth = 2;
    const n = 8;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s / n, 0); g.lineTo(i * s / n, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * s / n); g.lineTo(s, i * s / n); g.stroke();
    }
    grain(g, s, 800, 0.05);
  }, 4, 2);

  const poolFloor = canvasTex(256, (g, s) => {
    g.fillStyle = '#dcecea'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(100,160,165,.6)';
    const n = 8;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s / n, 0); g.lineTo(i * s / n, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * s / n); g.lineTo(s, i * s / n); g.stroke();
    }
  }, 10, 10);

  const metalWall = canvasTex(256, (g, s) => {
    g.fillStyle = '#4c4f4e'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x < s; x += 42) g.fillRect(x, 0, 20, s);
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let i = 0; i < 8; i++) g.fillRect(Math.random() * s, 0, 2, s);
    grain(g, s, 2000, 0.12);
  }, 4, 1);

  const labWall = canvasTex(256, (g, s) => {
    g.fillStyle = '#d9d9d4'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#b52b2b'; g.fillRect(0, s * 0.62, s, 10);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, s * 0.65, s, 30);
    grain(g, s, 900, 0.05);
  }, 3, 1);

  const waterNorm = canvasTex(128, (g, s) => {
    g.fillStyle = '#8080ff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(${100 + Math.random() * 60},${100 + Math.random() * 60},255,.5)`;
      g.beginPath();
      const y = Math.random() * s;
      g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 8, s * .6, y - 8, s, y); g.stroke();
    }
  }, 3, 3);

  return { wallpaper, carpet, ceilingTile, concrete, concreteFloor, poolTile, poolFloor, metalWall, labWall, waterNorm };
}

// Room-name generator for "infinite types of rooms"
const A = ['Yellow', 'Humming', 'Damp', 'Flooded', 'Concrete', 'Static', 'Forgotten', 'Endless', 'Buzzing', 'Stained', 'Tiled', 'Rustling', 'Low', 'Empty', 'Drowned', 'Paper-strewn', 'Flickering', 'Moldy', ' humming'.trim(), 'Asynchronous'];
const B = ['Lobby', 'Atrium', 'Cistern', 'Archive', 'Vestibule', 'Gallery', 'Switchroom', 'Cafeteria', 'Wading Hall', 'Office', 'Boiler Nook', 'Waiting Room', 'Storage', 'Threshold', 'Classroom', 'Laundromat', 'Chapel of Chairs', 'Vending Court'];
export function roomName(wx, wy) {
  const a = A[hash2(wx, wy, 77) % A.length];
  const b = B[hash2(wx, wy, 913) % B.length];
  return `${a} ${b}`;
}

export const BIOMES = [
  { id: 0, name: 'LEVEL 0 — The Lobby', wallP: 0.30, pillarP: 0.80, lightP: 0.75, fog: [0x0a0902, 18, 70], amb: 0x665e3a },
  { id: 1, name: 'LEVEL 1 — Concrete Halls', wallP: 0.42, pillarP: 0.55, lightP: 0.5, fog: [0x060606, 14, 60], amb: 0x555555 },
  { id: 2, name: 'LEVEL 37 — The Poolrooms', wallP: 0.14, pillarP: 0.35, lightP: 0.8, fog: [0x0a1a1c, 22, 90], amb: 0x9fc4c4 },
  { id: 3, name: 'LEVEL ! — Maintenance Dark', wallP: 0.60, pillarP: 0.30, lightP: 0.28, fog: [0x000000, 8, 42], amb: 0x222222 },
  { id: 4, name: 'ASYNC TEST CHAMBER', wallP: 0.46, pillarP: 0.5, lightP: 0.85, fog: [0x111214, 20, 75], amb: 0x888888 },
];

export function biomeAt(wx, wy) {
  // Zone-quantized biome map: 48m zones with smooth-ish borders
  const zx = Math.floor(wx / 48), zy = Math.floor(wy / 48);
  const r = hash01(zx, zy, 4242);
  if (r < 0.38) return BIOMES[0];
  if (r < 0.58) return BIOMES[1];
  if (r < 0.73) return BIOMES[2];
  if (r < 0.88) return BIOMES[3];
  return BIOMES[4];
}
