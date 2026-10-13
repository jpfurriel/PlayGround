import * as THREE from 'three';

/* ============================================================
   DEMON SOULS REMAKE — Boletarian Palace
   Third-person souls-like. Desktop: WASD + mouse.
   No external assets: all geometry / textures / audio procedural.
   ============================================================ */

const canvas = document.getElementById('scene');
const hud = document.getElementById('hud');
const titleEl = document.getElementById('title');
const startBtn = document.getElementById('start-btn');
const diedEl = document.getElementById('died');
const diedSub = document.getElementById('died-sub');
const respawnBtn = document.getElementById('respawn-btn');
const victoryEl = document.getElementById('victory');
const victorySub = document.getElementById('victory-sub');
const ngBtn = document.getElementById('ng-btn');
const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const stFill = document.getElementById('st-fill');
const soulsEl = document.getElementById('souls');
const grassEl = document.getElementById('grass');
const bossBar = document.getElementById('boss-bar');
const bossFill = document.getElementById('boss-fill');
const bossName = document.getElementById('boss-name');
const interactEl = document.getElementById('interact');
const interactText = document.getElementById('interact-text');
const messageEl = document.getElementById('message');
const lockHint = document.getElementById('lock-hint');
const toast = document.getElementById('toast');
const dmgVignette = document.getElementById('dmg-vignette');

// ---------------- Audio (all procedural WebAudio) ----------------
const AudioSys = {
  ctx: null,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (this.ctx?.state === 'suspended') this.ctx.resume(); },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  env(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); },
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!this.ctx) return; const t0 = this.now();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this.env(g, t0, 0.01, vol, dur); o.connect(g).connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.1);
  },
  noise(dur, vol = 0.25, lowpass = 1200) {
    if (!this.ctx) return; const t0 = this.now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain(); this.env(g, t0, 0.005, vol, dur);
    src.connect(f).connect(g).connect(this.ctx.destination); src.start(t0);
  },
  swing() { this.noise(0.22, 0.2, 2600); },
  heavySwing() { this.noise(0.35, 0.3, 1500); },
  hit() { this.noise(0.18, 0.4, 700); this.tone(110, 0.2, 'triangle', 0.3, 55); },
  clang() { this.tone(620, 0.3, 'square', 0.12, 300); this.tone(930, 0.25, 'sine', 0.1, 450); this.noise(0.12, 0.2, 4000); },
  roll() { this.noise(0.3, 0.14, 900); },
  souls() { this.tone(880, 0.4, 'sine', 0.1, 1760); this.tone(1320, 0.5, 'sine', 0.06, 1980); },
  heal() { this.tone(392, 0.3, 'sine', 0.15); setTimeout(() => this.tone(523, 0.4, 'sine', 0.15), 120); },
  bonfire() { this.noise(0.8, 0.12, 500); this.tone(196, 0.8, 'sine', 0.08, 130); },
  death() { this.tone(220, 1.6, 'sawtooth', 0.2, 40); this.tone(110, 2.0, 'triangle', 0.2, 30); },
  bossRoar() { this.tone(70, 1.2, 'sawtooth', 0.35, 45); this.noise(1.0, 0.3, 400); },
  victory() { [330, 415, 494, 660].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 'triangle', 0.15), i * 160)); },
  fog() { this.noise(1.2, 0.2, 300); this.tone(65, 1.2, 'sine', 0.2, 50); },
};

// ---------------- Renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x0d1322, 0.0105);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Lights
const moon = new THREE.DirectionalLight(0x8fa8d8, 1.5);
moon.position.set(-30, 50, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
moon.shadow.camera.top = 60; moon.shadow.camera.bottom = -60;
moon.shadow.camera.far = 160;
moon.shadow.bias = -0.0004;
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x44547a, 0x14100a, 0.95));
const archLight = new THREE.PointLight(0x7fd8ff, 3.2, 24, 1.4);
archLight.position.set(0, 2.4, 26);
scene.add(archLight);
// warm fill that follows the player so the knight never goes pitch black
const playerFill = new THREE.PointLight(0xffd9a0, 30, 16, 1.4);
scene.add(playerFill);
scene.add(new THREE.AmbientLight(0x303a52, 0.6));

// ---------------- Procedural textures ----------------
function canvasTex(size, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const stoneTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#3a3a40'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v + 6})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
  const n = 4;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(0, (s / n) * i); g.lineTo(s, (s / n) * i); g.stroke(); g.beginPath(); g.moveTo((s / n) * i, 0); g.lineTo((s / n) * i, s); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(0, (s / n) * i + 2); g.lineTo(s, (s / n) * i + 2); g.stroke(); }
}, [14, 14]);
const wallTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#43434c'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    const x = c * 128 + (r % 2) * 64, y = r * 64;
    const v = 58 + Math.random() * 22;
    g.fillStyle = `rgb(${v},${v},${v + 8})`; g.fillRect(x + 3, y + 3, 122, 58);
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
}, [6, 2]);
const bannerTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#1a2030'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#c9a86a'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
  g.strokeStyle = '#c9a86a'; g.lineWidth = 5;
  g.beginPath(); g.arc(s / 2, s / 2 - 10, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c9a86a'; g.font = 'bold 64px Georgia'; g.textAlign = 'center';
  g.fillText('◈', s / 2, s / 2 + 12);
});

// ---------------- Level ----------------
const world = new THREE.Group(); scene.add(world);
const colliders = []; // {x,z,r} circles + {minX,maxX,minZ,maxZ} boxes
function addColliderBox(minX, maxX, minZ, maxZ) { colliders.push({ minX, maxX, minZ, maxZ }); }

const groundMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, metalness: 0.02 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);

// Courtyard path carpet of darker stone
const pathMat = new THREE.MeshStandardMaterial({ color: 0x23232b, roughness: 1 });
const path = new THREE.Mesh(new THREE.PlaneGeometry(14, 110), pathMat);
path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, -8); path.receiveShadow = true; world.add(path);

// Perimeter walls
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
function makeWall(w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
  world.add(m); return m;
}
makeWall(150, 14, 3, 0, 7, -62); addColliderBox(-75, 75, -63.5, -60.5);
makeWall(150, 14, 3, 0, 7, 44); addColliderBox(-75, 75, 42.5, 45.5);
makeWall(3, 14, 110, -38, 7, -9); addColliderBox(-39.5, -36.5, -64, 46);
makeWall(3, 14, 110, 38, 7, -9); addColliderBox(36.5, 39.5, -64, 46);
// Boss wall with fog gate opening (two segments + lintel)
makeWall(30, 14, 3, -21, 7, -34); addColliderBox(-36, -6, -35.5, -32.5);
makeWall(30, 14, 3, 21, 7, -34); addColliderBox(6, 36, -35.5, -32.5);
const lintel = makeWall(15, 5, 3.4, 0, 11.5, -34);

// Pillars + banners + braziers
const pillarGeo = new THREE.BoxGeometry(2.2, 12, 2.2);
const pillarMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, side: THREE.DoubleSide });
for (let i = 0; i < 6; i++) {
  const z = 28 - i * 12;
  for (const x of [-9, 9]) {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, 6, z); p.castShadow = p.receiveShadow = true; world.add(p);
    addColliderBox(x - 1.2, x + 1.2, z - 1.2, z + 1.2);
    if (i % 2 === 0) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), bannerMat);
      b.position.set(x + (x < 0 ? 1.15 : -1.15), 7.5, z);
      b.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      world.add(b);
    }
  }
}
// Rubble
const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 1 });
for (let i = 0; i < 26; i++) {
  const s = 0.3 + Math.random() * 1.1;
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
  r.position.set((Math.random() - 0.5) * 60, s * 0.4, -55 + Math.random() * 90);
  if (Math.abs(r.position.x) < 7) r.position.x += Math.sign(r.position.x || 1) * 8;
  r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  r.castShadow = r.receiveShadow = true; world.add(r);
}
// Broken cart / barrels
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
for (const [x, z] of [[-14, 12], [13, 4], [-12, -18], [14, -24]]) {
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 1.8, 10), woodMat);
  barrel.position.set(x, 0.9, z); barrel.castShadow = barrel.receiveShadow = true; world.add(barrel);
  addColliderBox(x - 1, x + 1, z - 1, z + 1);
}
// Dead trees
const treeMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 });
for (const [x, z] of [[-24, 20], [24, 28], [-26, -8], [26, -14]]) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 7, 6), treeMat);
  trunk.position.set(x, 3.5, z); trunk.castShadow = true; world.add(trunk);
  for (let b = 0; b < 3; b++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 3, 5), treeMat);
    br.position.set(x + (Math.random() - 0.5) * 2, 5 + b, z + (Math.random() - 0.5) * 2);
    br.rotation.z = 0.7 + Math.random() * 0.6; world.add(br);
  }
  addColliderBox(x - 0.8, x + 0.8, z - 0.8, z + 0.8);
}

// Archstone (bonfire checkpoint)
const archGroup = new THREE.Group(); archGroup.position.set(0, 0, 28); world.add(archGroup);
const archStone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.5, 12),
  new THREE.MeshStandardMaterial({ color: 0x5a5f6e, roughness: 0.7 }));
archStone.position.y = 0.25; archStone.receiveShadow = true; archGroup.add(archStone);
const archPillar = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 4),
  new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.4, metalness: 0.3, emissive: 0x1a3a55, emissiveIntensity: 0.9 }));
archPillar.position.y = 1.8; archPillar.rotation.y = Math.PI / 4; archPillar.castShadow = true; archGroup.add(archPillar);
const swordInStone = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.4),
  new THREE.MeshStandardMaterial({ color: 0xb9c2d4, metalness: 0.9, roughness: 0.25 }));
swordInStone.position.set(0.4, 1.1, 0.5); swordInStone.rotation.z = -0.5; archGroup.add(swordInStone);

// Fog gate (boss entrance)
const fogGateZ = -34;
const fogMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uTime;
    void main(){
      float n = sin(vUv.y*22.0+uTime*2.2)*0.5+0.5;
      float n2 = sin(vUv.x*16.0-uTime*1.6)*0.5+0.5;
      float a = 0.55+0.35*n*n2;
      vec3 col = mix(vec3(0.75,0.78,0.85), vec3(0.35,0.4,0.5), n2);
      gl_FragColor = vec4(col, a* smoothstep(0.0,0.15,vUv.x)*smoothstep(1.0,0.85,vUv.x));
    }`,
});
const fogGate = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), fogMat);
fogGate.position.set(0, 4.5, fogGateZ); world.add(fogGate);
for (const x of [-6.5, 6.5]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 10, 1.4), pillarMat);
  post.position.set(x, 5, fogGateZ); post.castShadow = true; world.add(post);
}

// Torches / braziers with flickering lights
const torchLights = [];
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa63d });
function addTorch(x, z, h = 3) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 6),
    new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1 }));
  pole.position.set(x, h / 2, z); pole.castShadow = true; world.add(pole);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.7, metalness: 0.5 }));
  cup.position.set(x, h + 0.2, z); world.add(cup);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), flameMat.clone());
  flame.position.set(x, h + 0.9, z); world.add(flame);
  const light = new THREE.PointLight(0xff8c30, 22, 24, 1.6);
  light.position.set(x, h + 1, z); world.add(light);
  torchLights.push({ light, flame, seed: Math.random() * 100 });
  addColliderBox(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
}
for (let i = 0; i < 5; i++) { const z = 22 - i * 12; addTorch(-7, z); addTorch(7, z); }
addTorch(-4, -30); addTorch(4, -30);
addTorch(-3, 28, 1.2); addTorch(3, 28, 1.2);
// boss arena braziers + cold overhead light
addTorch(-10, -40); addTorch(10, -40); addTorch(-10, -56); addTorch(10, -56);
const arenaLight = new THREE.PointLight(0x6f87c9, 40, 50, 1.5);
arenaLight.position.set(0, 10, -48); world.add(arenaLight);

// Moon disc + stars
const moonMesh = new THREE.Mesh(new THREE.CircleGeometry(9, 32),
  new THREE.MeshBasicMaterial({ color: 0xd8e4ff, fog: false }));
moonMesh.position.set(-70, 80, -140); moonMesh.lookAt(0, 10, 0); scene.add(moonMesh);
{
  const g = new THREE.BufferGeometry(); const N = 500; const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 500; pos[i * 3 + 1] = 40 + Math.random() * 180; pos[i * 3 + 2] = -180 + Math.random() * 200; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.7, fog: false, transparent: true, opacity: 0.8 })));
}

// ---------------- Particles ----------------
// Embers / ash drifting
function makePoints(n, color, size, area) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const v = [];
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * area[0]; p[i * 3 + 1] = Math.random() * area[1]; p[i * 3 + 2] = (Math.random() - 0.5) * area[2]; v.push(0.3 + Math.random() * 1.2); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.userData.vel = v; return pts;
}
const embers = makePoints(320, 0xff9040, 0.14, [80, 14, 110]); world.add(embers);
const ash = makePoints(400, 0x8890a5, 0.09, [90, 16, 120]); world.add(ash);
// Hit sparks pool
const sparks = [];
function spawnSparks(pos, color = 0xffcc66, n = 14, speed = 6) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const vel = [];
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    vel.push(new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.abs(Math.sin(b)) + 0.4, Math.sin(a) * Math.cos(b)).multiplyScalar(speed * (0.5 + Math.random())));
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.16, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.add(pts); sparks.push({ pts, vel, life: 0.5 });
}
// Soul wisps flying to player
const wisps = [];
function spawnSouls(pos, amount) {
  for (let i = 0; i < Math.min(10, 2 + amount / 40); i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x7df0ff, transparent: true, opacity: 0.95 }));
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
    world.add(m); wisps.push({ m, life: 1.4 });
  }
}

// ---------------- Character builders ----------------
function knightMesh({ scale = 1, armor = 0x39415a, cloth = 0x5a1f1f, glow = null }) {
  const g = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color: armor, metalness: 0.75, roughness: 0.35 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * scale, 0.6 * scale, 6, 12), armorMat);
  torso.position.y = 1.25 * scale; torso.castShadow = true; g.add(torso);
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * scale, 1.3 * scale), clothMat);
  cape.position.set(0, 1.15 * scale, 0.46 * scale); cape.rotation.x = 0.15; cape.rotation.y = Math.PI; g.add(cape);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 12, 10), armorMat);
  helm.position.y = 2.05 * scale; helm.castShadow = true; g.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.1 * scale, 0.1 * scale), darkMat);
  visor.position.set(0, 2.05 * scale, -0.26 * scale); g.add(visor);
  if (glow) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.03 * scale, 0.02), new THREE.MeshBasicMaterial({ color: glow })); e.position.set(0, 2.06 * scale, -0.31 * scale); g.add(e); }
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.3 * scale, 0.5 * scale), clothMat);
  plume.position.set(0, 2.35 * scale, 0.05 * scale); g.add(plume);
  const mkLimb = (r, len, x, y) => {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(r * scale, len * scale, 4, 8), armorMat);
    l.position.set(x * scale, y * scale, 0); l.castShadow = true; g.add(l); return l;
  };
  const armL = mkLimb(0.13, 0.5, -0.55, 1.35), armR = mkLimb(0.13, 0.5, 0.55, 1.35);
  const legL = mkLimb(0.16, 0.55, -0.22, 0.5), legR = mkLimb(0.16, 0.55, 0.22, 0.5);
  // Sword in right hand
  const swordPivot = new THREE.Group(); swordPivot.position.set(0.55 * scale, 1.3 * scale, 0); g.add(swordPivot);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09 * scale, 1.35 * scale, 0.2 * scale),
    new THREE.MeshStandardMaterial({ color: 0xc9d4e8, metalness: 0.95, roughness: 0.2 }));
  blade.position.y = -0.85 * scale; blade.castShadow = true; swordPivot.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.07 * scale, 0.3 * scale),
    new THREE.MeshStandardMaterial({ color: 0x8a6f3a, metalness: 0.8, roughness: 0.4 }));
  guard.position.y = -0.15 * scale; swordPivot.add(guard);
  swordPivot.rotation.x = Math.PI; // blade down-forward rest
  // Shield on left arm
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * scale, 0.42 * scale, 0.08 * scale, 14),
    new THREE.MeshStandardMaterial({ color: 0x2c3550, metalness: 0.7, roughness: 0.4 }));
  shield.rotation.z = Math.PI / 2; shield.position.set(-0.85 * scale, 1.3 * scale, -0.2 * scale);
  shield.castShadow = true; g.add(shield);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.9, roughness: 0.3 }));
  boss.position.copy(shield.position); g.add(boss);
  g.userData = { torso, armL, armR, legL, legR, swordPivot, shield, cape, helm };
  return g;
}

// ---------------- Game state ----------------
const G = {
  started: false, dead: false, won: false, bossActive: false, bossDefeated: false,
  souls: 0, droppedSouls: 0, dropPos: null, grass: 3, maxGrass: 3,
  hp: 100, maxHp: 100, st: 100, maxSt: 100,
  journey: 1, kills: 0,
  time: 0,
};
const player = {
  mesh: knightMesh({}),
  pos: new THREE.Vector3(0, 0, 33),
  yaw: 0, // facing north (-z): forwardOf(0) = (0,-1)
  vel: new THREE.Vector3(),
  speed: 6.2,
  st: 100, maxSt: 100,
  attackT: 0, attackKind: 'light', attackDidHit: false,
  rollT: 0, rollDir: new THREE.Vector3(),
  blockHeld: false,
  iframes: 0, hurtT: 0, healT: 0,
  staminaDelay: 0,
};
player.mesh.position.copy(player.pos); scene.add(player.mesh);

// Bloodstain
let stain = null;
function setBloodstain(pos, amount) {
  if (stain) { scene.remove(stain); }
  const grp = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.55 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; grp.add(pool);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x7df0ff }));
  orb.position.y = 0.7; grp.add(orb);
  grp.position.copy(pos); grp.position.y = 0;
  grp.userData = { amount, orb };
  scene.add(grp); stain = grp;
  G.dropPos = pos.clone(); G.droppedSouls = amount;
}

// ---------------- Enemies ----------------
const enemies = [];
function makeSoldier(x, z, patrolR = 5) {
  const mesh = knightMesh({ scale: 0.95, armor: 0x4a4a55, cloth: 0x22222a, glow: 0xff3b3b });
  mesh.position.set(x, 0, z); scene.add(mesh);
  const e = {
    kind: 'soldier', mesh, home: new THREE.Vector3(x, 0, z),
    hp: 70, maxHp: 70, souls: 120, dmg: 14,
    state: 'idle', t: Math.random() * 3, atkT: 0, hurtT: 0, deadT: 0,
    yaw: Math.random() * 6.28, speed: 2.6, aggroR: 15, atkR: 2.3, patrolR,
    alive: true, flash: 0,
  };
  enemies.push(e); return e;
}
function makeBoss() {
  const mesh = knightMesh({ scale: 2.6, armor: 0x2c3247, cloth: 0x6a1428, glow: 0xffb300 });
  mesh.position.set(0, 0, -48); mesh.visible = false; scene.add(mesh);
  // extra shoulder plates
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1c2233, metalness: 0.8, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), plateMat);
    p.position.set(s * 1.5, 2.1 * 2.6 - 2.6, 0); p.castShadow = true; mesh.add(p);
  }
  const e = {
    kind: 'boss', mesh, home: new THREE.Vector3(0, 0, -48),
    hp: 900, maxHp: 900, souls: 1500, dmg: 26,
    state: 'dormant', t: 0, atkT: 0, hurtT: 0, deadT: 0,
    yaw: 0, speed: 3.4, aggroR: 60, atkR: 4.4,
    alive: true, flash: 0, combo: 0, slamCD: 0,
  };
  enemies.push(e); return e;
}
let soldierDefs = [[-11, 8], [11, -2], [-10, -16], [12, -26]];
for (const [x, z] of soldierDefs) makeSoldier(x, z);
const boss = makeBoss();

function resetEnemies() {
  for (const e of enemies) {
    if (e.kind === 'boss') {
      if (G.bossDefeated) { e.alive = false; e.mesh.visible = false; continue; }
      e.alive = true; e.hp = e.maxHp; e.mesh.visible = false; e.state = 'dormant';
      e.mesh.position.copy(e.home); G.bossActive = false; bossBar.classList.add('hidden');
      fogGate.visible = true;
    } else {
      e.alive = true; e.hp = e.maxHp; e.state = 'idle';
      e.mesh.visible = true; e.mesh.position.copy(e.home);
      e.mesh.rotation.set(0, 0, 0); e.deadT = 0;
    }
  }
}

// ---------------- Input ----------------
const keys = {};
addEventListener('keydown', e => {
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!G.started || G.dead || G.won) return;
  if (e.code === 'KeyQ') drinkGrass();
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'Tab' || e.code === 'KeyF') toggleLock();
});
addEventListener('keyup', e => { keys[e.code] = false; });
let lockTarget = null;
function toggleLock() {
  if (lockTarget) { lockTarget = null; lockHint.classList.add('hidden'); return; }
  let best = null, bd = 28;
  for (const e of enemies) {
    if (!e.alive || (e.kind === 'boss' && !G.bossActive)) continue;
    const d = e.mesh.position.distanceTo(player.pos);
    if (d < bd) { bd = d; best = e; }
  }
  lockTarget = best;
  lockHint.classList.toggle('hidden', !best);
  if (best) AudioSys.clang();
}

const mouse = { downL: false, downR: false, dx: 0, dy: 0 };
let camYaw = 0, camPitch = 0.32, camDist = 6.5;
canvas.addEventListener('mousedown', e => {
  AudioSys.init();
  if (!G.started || G.dead || G.won) return;
  if (e.button === 0) {
    if (keys['ShiftLeft'] || keys['ShiftRight']) startAttack('heavy');
    else startAttack('light');
  }
  if (e.button === 1) { toggleLock(); e.preventDefault(); }
  if (e.button === 2) player.blockHeld = true;
  // pointer lock for camera
  if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch {} }
});
addEventListener('mouseup', e => {
  if (e.button === 2) player.blockHeld = false;
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) {
    camYaw -= e.movementX * 0.0026;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0022, -0.15, 1.1);
  } else if (G.started && (e.buttons & 1) && player.attackT <= 0) {
    // fallback drag when pointer lock unavailable (e.g. automated capture)
    camYaw -= e.movementX * 0.004;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.003, -0.15, 1.1);
  }
});
addEventListener('wheel', e => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 3.5, 11); }, { passive: true });
addEventListener('keydown', e => {
  if (e.code === 'Space' && G.started && !G.dead && !G.won) doRoll();
});

// ---------------- Combat ----------------
function staminaCostOk(c) { return player.st >= c; }
function startAttack(kind) {
  if (player.attackT > 0 || player.rollT > 0 || player.healT > 0 || player.hurtT > 0) return;
  if (player.blockHeld) return;
  const cost = kind === 'heavy' ? 32 : 18;
  if (!staminaCostOk(cost)) { flashMessage('EXHAUSTED'); return; }
  player.st -= cost; player.staminaDelay = 0.7;
  player.attackT = kind === 'heavy' ? 0.62 : 0.46;
  player.attackKind = kind; player.attackDidHit = false;
  player.mesh.userData.swordPivot.rotation.x = Math.PI;
  if (kind === 'heavy') AudioSys.heavySwing(); else AudioSys.swing();
}
function doRoll() {
  if (player.rollT > 0 || player.attackT > 0 || player.healT > 0) return;
  if (!staminaCostOk(22)) return;
  player.st -= 22; player.staminaDelay = 0.6;
  player.rollT = 0.52; player.iframes = Math.max(player.iframes, 0.42);
  const f = forwardOf(camYaw);
  const m = moveInput();
  player.rollDir.set(m.x !== 0 || m.z !== 0 ? m.x : f.x, 0, m.x !== 0 || m.z !== 0 ? m.z : f.z).normalize();
  player.attackT = 0; player.blockHeld = false;
  AudioSys.roll();
}
function drinkGrass() {
  if (player.healT > 0 || player.attackT > 0 || player.rollT > 0) return;
  if (G.grass <= 0) { showToast('No Crescent Grass left — rest at the Archstone'); return; }
  if (G.hp >= G.maxHp) return;
  G.grass--; player.healT = 1.1;
  AudioSys.heal();
  showToast('Ate Crescent Moon Grass  (+45 HP)');
}
function damagePlayer(amount, fromPos) {
  if (G.dead || G.won || player.iframes > 0 || player.rollT > 0.12) {
    if (player.rollT > 0) spawnSparks(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0x9adcff, 8, 4);
    return;
  }
  // blocking: face attacker
  let blocked = false;
  if (player.blockHeld && player.st > 5) {
    const toAtk = new THREE.Vector3().subVectors(fromPos, player.pos).normalize();
    const facing = forwardOf(player.yaw);
    if (toAtk.dot(facing) > 0.25) {
      blocked = true;
      const chip = amount * 0.25;
      player.st -= amount * 1.1;
      G.hp -= chip;
      AudioSys.clang();
      spawnSparks(player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xffd27d, 10, 5);
      if (player.st <= 0) { player.st = 0; player.blockHeld = false; player.hurtT = 0.7; flashMessage('GUARD BREAK'); }
      if (G.hp <= 0) { G.hp = 0; die(); return; }
    }
  }
  if (!blocked) {
    G.hp -= amount;
    player.hurtT = 0.45;
    AudioSys.hit();
    spawnSparks(player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xff4444, 12, 5);
    dmgVignette.style.boxShadow = 'inset 0 0 140px 70px rgba(180,0,0,.55)';
    setTimeout(() => dmgVignette.style.boxShadow = 'inset 0 0 120px 60px rgba(180,0,0,0)', 220);
  }
  if (G.hp <= 0) { G.hp = 0; die(); }
}
function damageEnemy(e, amount, heavy = false) {
  if (!e.alive) return;
  e.hp -= amount;
  e.hurtT = heavy ? 0.5 : 0.3; e.flash = 0.15;
  AudioSys.hit();
  spawnSparks(e.mesh.position.clone().add(new THREE.Vector3(0, 1.4 * (e.kind === 'boss' ? 2.4 : 1), 0)), 0xffcc66, heavy ? 20 : 12, heavy ? 8 : 6);
  if (e.hp <= 0) killEnemy(e);
  else if (e.kind === 'boss' && e.hp < e.maxHp * 0.5 && e.combo === 0) { e.combo = 1; flashMessage('THE DEMON STAGGERS'); }
}
function killEnemy(e) {
  e.alive = false; e.deadT = 0.9; e.state = 'dying';
  G.souls += e.souls; G.kills++;
  AudioSys.souls();
  spawnSouls(e.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), e.souls);
  spawnSparks(e.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), e.kind === 'boss' ? 0xffb300 : 0x7df0ff, 26, 7);
  showToast(`+${e.souls} souls`);
  if (e.kind === 'boss') onBossSlain();
  else if (lockTarget === e) { lockTarget = null; lockHint.classList.add('hidden'); }
}
function die() {
  if (G.dead) return;
  G.dead = true; AudioSys.death();
  setBloodstain(player.pos.clone(), G.souls);
  diedSub.textContent = G.bossActive ? 'Slain by the Tower Knight — your souls stain the arena floor.' : `Slain in Boletaria — ${G.souls} souls dropped where you fell.`;
  G.souls = 0;
  setTimeout(() => { diedEl.classList.remove('hidden'); diedEl.classList.add('show'); document.exitPointerLock?.(); }, 1400);
  flashMessage('YOU DIED', 2.2);
}
function respawn() {
  diedEl.classList.add('hidden'); diedEl.classList.remove('show');
  G.dead = false; G.hp = G.maxHp; player.st = player.maxSt; G.grass = G.maxGrass;
  player.pos.set(0, 0, 33); player.yaw = 0; camYaw = 0;
  player.attackT = 0; player.rollT = 0; player.hurtT = 0; player.healT = 0; player.iframes = 0;
  lockTarget = null; lockHint.classList.add('hidden');
  resetEnemies();
  showToast('Rested at the Archstone — the demon persists');
  AudioSys.bonfire();
}
function onBossSlain() {
  G.bossDefeated = true; G.bossActive = false;
  bossBar.classList.add('hidden');
  setTimeout(() => {
    G.won = true;
    victorySub.textContent = `Journey ${G.journey} complete — ${G.kills} demon${G.kills === 1 ? '' : 's'} felled, ${G.souls} souls claimed.`;
    victoryEl.classList.remove('hidden');
    document.exitPointerLock?.();
    AudioSys.victory();
  }, 1600);
  flashMessage('GREAT DEMON FELLED', 2.5);
}

// ---------------- Interact ----------------
function nearArch() { return player.pos.distanceTo(new THREE.Vector3(0, 0, 28)) < 4.2; }
function nearFog() { return !G.bossActive && Math.abs(player.pos.z - fogGateZ) < 4 && Math.abs(player.pos.x) < 7 && !G.bossDefeated; }
function nearStain() { return stain && player.pos.distanceTo(stain.position) < 2.4; }
function tryInteract() {
  if (nearStain()) {
    G.souls += stain.userData.amount;
    showToast(`Recovered ${stain.userData.amount} lost souls`);
    AudioSys.souls(); scene.remove(stain); stain = null; G.droppedSouls = 0;
    return;
  }
  if (nearArch()) {
    G.hp = G.maxHp; player.st = player.maxSt; G.grass = G.maxGrass;
    resetEnemiesKeepBoss();
    showToast('Touched the Archstone — HP restored, grass replenished');
    AudioSys.bonfire(); flashMessage('ARCHSTONE LIT', 1.4);
    return;
  }
  if (nearFog()) {
    enterBoss();
    return;
  }
}
function resetEnemiesKeepBoss() {
  for (const e of enemies) {
    if (e.kind === 'boss') continue;
    e.alive = true; e.hp = e.maxHp; e.state = 'idle';
    e.mesh.visible = true; e.mesh.position.copy(e.home);
  }
}
function enterBoss() {
  if (G.bossActive || G.bossDefeated) return;
  G.bossActive = true;
  boss.mesh.visible = true; boss.alive = true; boss.hp = boss.maxHp;
  boss.state = 'intro'; boss.t = 2.2;
  fogGate.visible = false;
  bossBar.classList.remove('hidden');
  bossName.textContent = G.journey > 1 ? `TOWER KNIGHT — JOURNEY ${G.journey}` : 'TOWER KNIGHT — DEMON OF BOLETARIA';
  AudioSys.fog(); setTimeout(() => AudioSys.bossRoar(), 500);
  flashMessage('DEMON OF BOLETARIA', 2.2);
}

// ---------------- Helpers ----------------
function forwardOf(yaw) { return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); }
function moveInput() {
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z += 1;
  if (keys['KeyS'] || keys['ArrowDown']) z -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x += 1;
  if (keys['KeyD'] || keys['ArrowRight']) x -= 1;
  // camera-relative
  const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const out = new THREE.Vector3().addScaledVector(f, z).addScaledVector(r, -x);
  if (out.lengthSq() > 1) out.normalize();
  return out;
}
let msgTimer = null;
function flashMessage(t, dur = 1.6) {
  messageEl.textContent = t; messageEl.style.opacity = 1;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => messageEl.style.opacity = 0, dur * 1000);
}
let toastTimer = null;
function showToast(t) {
  toast.textContent = t; toast.classList.remove('hidden'); toast.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.style.opacity = 0; setTimeout(() => toast.classList.add('hidden'), 400); }, 2200);
}
function collide(pos, radius = 0.7) {
  for (const c of colliders) {
    if (c.r !== undefined) {
      const dx = pos.x - c.x, dz = pos.z - c.z; const d = Math.hypot(dx, dz);
      if (d < c.r + radius && d > 0.001) { pos.x = c.x + (dx / d) * (c.r + radius); pos.z = c.z + (dz / d) * (c.r + radius); }
    } else {
      const nx = THREE.MathUtils.clamp(pos.x, c.minX, c.maxX);
      const nz = THREE.MathUtils.clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - nx, dz = pos.z - nz; const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = nx + (dx / d) * radius; pos.z = nz + (dz / d) * radius; }
        else {
          // inside: push out along smallest penetration
          const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = c.minX - radius; else if (m === pr) pos.x = c.maxX + radius;
          else if (m === pt) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
        }
      }
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -36, 36);
  pos.z = THREE.MathUtils.clamp(pos.z, G.bossActive ? -60 : -60, 42);
  // fog wall before boss until entered
  if (!G.bossActive && !G.bossDefeated && pos.z < fogGateZ + 1.2 && pos.z > fogGateZ - 6) {
    if (Math.abs(pos.x) < 7.5) pos.z = fogGateZ + 1.2;
  }
  return pos;
}

// ---------------- Enemy AI update ----------------
function updateEnemy(e, dt) {
  const m = e.mesh;
  if (!e.alive) {
    if (e.state === 'dying') {
      e.deadT -= dt;
      m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, -Math.PI / 2.2, dt * 5);
      m.position.y = THREE.MathUtils.lerp(m.position.y, -0.4, dt * 3);
      if (e.deadT <= 0) { m.visible = false; e.state = 'dead'; }
    }
    return;
  }
  if (e.flash > 0) { e.flash -= dt; }
  const toPlayer = new THREE.Vector3().subVectors(player.pos, m.position); toPlayer.y = 0;
  const dist = toPlayer.length();
  const dir = dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);

  if (e.kind === 'boss' && e.state === 'dormant') return;
  if (e.kind === 'boss' && e.state === 'intro') {
    e.t -= dt;
    m.position.y = Math.sin((2.2 - e.t) * 6) * 0.15;
    m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, Math.atan2(dir.x, dir.z) + Math.PI, dt * 2);
    e.yaw = m.rotation.y;
    if (e.t <= 0) { e.state = 'chase'; m.position.y = 0; }
    return;
  }

  // aggro check
  const aggro = e.kind === 'boss' ? G.bossActive : (dist < e.aggroR && !G.dead && !G.won);
  if (!aggro && e.kind === 'soldier') {
    // patrol drift around home
    e.t -= dt;
    if (e.t <= 0) { e.t = 2 + Math.random() * 3; e.yaw = Math.random() * Math.PI * 2; }
    const step = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)).multiplyScalar(e.speed * 0.35 * dt);
    const np = m.position.clone().add(step);
    if (np.distanceTo(e.home) < e.patrolR) { collide(np, 0.6); m.position.copy(np); }
    else e.yaw += Math.PI;
    m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, e.yaw, dt * 4);
    animateFigure(e, dt, false);
    e.state = 'idle';
    return;
  }
  if (G.dead || G.won) { animateFigure(e, dt, false); return; }

  e.yaw = Math.atan2(dir.x, dir.z) + Math.PI;
  m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, e.yaw, dt * (e.kind === 'boss' ? 3 : 6));

  if (e.hurtT > 0) { e.hurtT -= dt; animateFigure(e, dt, false, true); return; }

  // attack
  if (e.atkT > 0) {
    e.atkT -= dt;
    const dur = e.kind === 'boss' ? 0.9 : 0.55;
    const hitAt = dur * 0.55;
    const prev = e.atkT + dt;
    // hit window crossing
    if (prev > dur - hitAt && e.atkT <= dur - hitAt && !e.didHit) {
      e.didHit = true;
      const reach = e.atkR + (e.kind === 'boss' && e.combo >= 2 ? 2.5 : 0);
      if (dist < reach + 0.6) damagePlayer(e.dmg + (e.kind === 'boss' && e.combo >= 2 ? 10 : 0), m.position);
    }
    if (e.kind === 'boss') m.userData.swordPivot.rotation.x = Math.PI + Math.sin((1 - e.atkT / dur) * Math.PI) * 2.4;
    else m.userData.swordPivot.rotation.x = Math.PI + Math.sin((1 - e.atkT / dur) * Math.PI) * 2.0;
    animateFigure(e, dt, false);
    if (e.atkT <= 0) {
      m.userData.swordPivot.rotation.x = Math.PI;
      if (e.kind === 'boss') { e.slamCD = 1.6 + Math.random(); if (e.combo >= 2) e.combo = 1; }
    }
    return;
  }

  const inRange = dist < e.atkR;
  if (inRange) {
    e.t -= dt;
    const cd = e.kind === 'boss' ? Math.max(0.4, 1.3 - (1 - e.hp / e.maxHp) * 0.7) : 1.1;
    if (e.t <= 0) {
      e.t = cd; e.atkT = e.kind === 'boss' ? 0.9 : 0.55; e.didHit = false;
      if (e.kind === 'boss') {
        // enraged slam combo at low hp
        if (e.hp < e.maxHp * 0.35 && Math.random() < 0.4) { e.combo = 2; e.atkR = 5.2; }
        AudioSys.heavySwing();
      } else AudioSys.swing();
    }
    animateFigure(e, dt, false);
  } else {
    if (e.kind === 'boss') e.slamCD -= dt;
    // chase, boss does occasional charging slam from mid range
    let sp = e.speed * (e.kind === 'boss' ? (e.hp < e.maxHp * 0.4 ? 1.35 : 1) : 1);
    if (e.kind === 'boss' && dist > 8 && dist < 20 && e.slamCD <= 0) {
      sp = 7; // charge
      if (dist < 6) { e.atkT = 0.9; e.didHit = false; e.combo = 2; AudioSys.heavySwing(); return; }
    }
    const step = dir.multiplyScalar(sp * dt);
    const np = m.position.clone().add(step);
    collide(np, e.kind === 'boss' ? 1.6 : 0.6);
    // boss cannot leave arena; soldiers cannot cross fog
    if (e.kind === 'soldier' && np.z < fogGateZ + 1.5) np.z = fogGateZ + 1.5;
    if (e.kind === 'boss' && np.z > fogGateZ - 1) np.z = fogGateZ - 1;
    m.position.copy(np);
    animateFigure(e, dt, true);
    e.state = 'chase';
  }
}
function animateFigure(e, dt, moving, hurt = false) {
  const u = e.mesh.userData;
  const t = G.time * (e.kind === 'boss' ? 4 : 9);
  const amp = moving ? 0.5 : 0.06;
  u.legL.rotation.x = Math.sin(t) * amp; u.legR.rotation.x = -Math.sin(t) * amp;
  u.armL.rotation.x = -Math.sin(t) * amp * 0.6;
  if (e.atkT <= 0) u.armR.rotation.x = Math.sin(t) * amp * 0.6;
  if (hurt) e.mesh.position.x += (Math.random() - 0.5) * 0.06;
  const s = e.kind === 'boss' ? 2.6 : 0.95;
  e.mesh.position.y = moving ? Math.abs(Math.sin(t)) * 0.08 * s : 0;
}

// ---------------- Player update ----------------
function updatePlayer(dt) {
  if (G.dead || G.won) return;
  // timers
  player.iframes = Math.max(0, player.iframes - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.staminaDelay > 0) player.staminaDelay -= dt;
  else player.st = Math.min(player.maxSt, player.st + (player.blockHeld ? 14 : 26) * dt);

  const u = player.mesh.userData;

  // healing
  if (player.healT > 0) {
    player.healT -= dt;
    u.armL.rotation.x = -2.2; u.armR.rotation.x = -2.2;
    if (player.healT <= 0.35 && !player.healApplied) { G.hp = Math.min(G.maxHp, G.hp + 45); player.healApplied = true; spawnSparks(player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x51ff7d, 16, 3); }
    if (player.healT <= 0) player.healApplied = false;
    return;
  }

  // roll
  if (player.rollT > 0) {
    player.rollT -= dt;
    const np = player.pos.clone().addScaledVector(player.rollDir, 9.5 * dt);
    collide(np, 0.7); player.pos.copy(np);
    player.mesh.rotation.x = (0.52 - player.rollT) / 0.52 * Math.PI * 2 * 0.5;
    player.yaw = Math.atan2(-player.rollDir.x, -player.rollDir.z);
    player.mesh.rotation.y = player.yaw;
    if (player.rollT <= 0) player.mesh.rotation.x = 0;
    player.mesh.position.copy(player.pos);
    return;
  }

  // attack
  if (player.attackT > 0) {
    player.attackT -= dt;
    const dur = player.attackKind === 'heavy' ? 0.62 : 0.46;
    const k = 1 - player.attackT / dur;
    u.swordPivot.rotation.x = Math.PI + Math.sin(k * Math.PI) * (player.attackKind === 'heavy' ? 3.0 : 2.4);
    // forward lunge
    const f = forwardOf(player.yaw);
    const np = player.pos.clone().addScaledVector(f, (player.attackKind === 'heavy' ? 3.2 : 2.0) * dt);
    collide(np, 0.7); player.pos.copy(np);
    // hit once at mid-swing
    if (!player.attackDidHit && k > 0.35 && k < 0.75) {
      player.attackDidHit = true;
      const range = player.attackKind === 'heavy' ? 3.4 : 2.8;
      const dmg = (player.attackKind === 'heavy' ? 46 : 26) * (1 + (G.journey - 1) * 0.15);
      for (const e of enemies) {
        if (!e.alive) continue;
        if (e.kind === 'boss' && !G.bossActive) continue;
        const d = e.mesh.position.distanceTo(player.pos);
        const reach = range + (e.kind === 'boss' ? 1.6 : 0);
        if (d < reach) {
          const toE = new THREE.Vector3().subVectors(e.mesh.position, player.pos).normalize();
          if (toE.dot(forwardOf(player.yaw)) > 0.15) damageEnemy(e, dmg, player.attackKind === 'heavy');
        }
      }
    }
    if (player.attackT <= 0) u.swordPivot.rotation.x = Math.PI;
    player.mesh.position.copy(player.pos);
    return;
  }

  // movement
  const mv = moveInput();
  const moving = mv.lengthSq() > 0.001;
  const spd = player.speed * (player.blockHeld ? 0.45 : 1) * (player.hurtT > 0 ? 0.4 : 1);
  if (moving) {
    const np = player.pos.clone().addScaledVector(mv, spd * dt);
    collide(np, 0.7); player.pos.copy(np);
    const targetYaw = lockTarget && lockTarget.alive ? Math.atan2(-(lockTarget.mesh.position.x - player.pos.x), -(lockTarget.mesh.position.z - player.pos.z)) : Math.atan2(-mv.x, -mv.z);
    player.yaw = lerpAngle(player.yaw, targetYaw, dt * 10);
  } else if (lockTarget && lockTarget.alive) {
    player.yaw = lerpAngle(player.yaw, Math.atan2(-(lockTarget.mesh.position.x - player.pos.x), -(lockTarget.mesh.position.z - player.pos.z)), dt * 8);
  }
  player.mesh.rotation.y = player.yaw;
  player.mesh.position.copy(player.pos);

  // procedural walk / block / idle pose
  const t = G.time * 10;
  if (player.hurtT > 0) {
    player.mesh.rotation.x = 0.25;
    u.armL.rotation.x = 0.6; u.armR.rotation.x = 0.6;
  } else {
    player.mesh.rotation.x = 0;
    if (moving) {
      u.legL.rotation.x = Math.sin(t) * 0.6; u.legR.rotation.x = -Math.sin(t) * 0.6;
      u.armR.rotation.x = -Math.sin(t) * 0.4;
      player.mesh.position.y = Math.abs(Math.sin(t)) * 0.06;
    } else {
      u.legL.rotation.x *= 0.9; u.legR.rotation.x *= 0.9;
      u.armR.rotation.x *= 0.9;
      player.mesh.position.y = Math.sin(G.time * 2) * 0.02;
    }
    if (player.blockHeld) {
      u.shield.position.set(-0.55, 1.35, -0.55);
      u.armL.rotation.x = -1.2;
    } else {
      u.shield.position.set(-0.85, 1.3, -0.2);
      u.armL.rotation.x = moving ? Math.sin(t) * 0.4 : 0;
    }
  }

  // lock validity
  if (lockTarget && (!lockTarget.alive || player.pos.distanceTo(lockTarget.mesh.position) > 30)) {
    lockTarget = null; lockHint.classList.add('hidden');
  }

  // interact prompt
  let prompt = '';
  if (nearStain()) prompt = `Recover ${stain.userData.amount} souls`;
  else if (nearArch()) prompt = 'Touch Archstone (rest)';
  else if (nearFog()) prompt = 'Traverse the fog';
  if (prompt) { interactText.textContent = prompt; interactEl.classList.remove('hidden'); }
  else interactEl.classList.add('hidden');
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// ---------------- Camera ----------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  let desiredYaw = camYaw, desiredPitch = camPitch;
  if (!G.started) {
    // cinematic orbit behind title
    const t = G.time * 0.08;
    desiredYaw = Math.sin(t) * 0.5;
    camTarget.set(0, 3, -6);
    const r = 26;
    camera.position.set(camTarget.x + Math.sin(desiredYaw) * Math.cos(0.3) * r, 8, camTarget.z + Math.cos(desiredYaw) * Math.cos(0.3) * r);
    camera.lookAt(camTarget);
    return;
  }
  if (lockTarget && lockTarget.alive) {
    const mid = new THREE.Vector3().addVectors(player.pos, lockTarget.mesh.position).multiplyScalar(0.5);
    const toLock = new THREE.Vector3().subVectors(lockTarget.mesh.position, player.pos);
    camYaw = lerpAngle(camYaw, Math.atan2(-toLock.x, -toLock.z), dt * 3);
  }
  const head = player.pos.clone().add(new THREE.Vector3(0, 2.0, 0));
  const off = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch)
  ).multiplyScalar(camDist);
  const want = head.clone().add(off);
  want.y = Math.max(0.8, want.y);
  collide(want, 0.6); // keep camera out of walls/pillars
  want.y = Math.max(0.8, want.y);
  camera.position.lerp(want, 1 - Math.pow(0.0001, dt));
  camTarget.lerp(head, 1 - Math.pow(0.0001, dt));
  camera.lookAt(camTarget);
  // subtle shoulder shake on hit
  if (player.hurtT > 0.3) camera.position.x += (Math.random() - 0.5) * 0.08;
}

// ---------------- HUD ----------------
function updateHUD() {
  hpFill.style.width = `${(G.hp / G.maxHp) * 100}%`;
  hpText.textContent = `${Math.ceil(G.hp)} / ${G.maxHp}`;
  stFill.style.width = `${(player.st / player.maxSt) * 100}%`;
  soulsEl.textContent = G.souls;
  grassEl.textContent = G.grass;
  if (G.bossActive && boss.alive) {
    bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  }
}

// ---------------- Menu wiring ----------------
startBtn.addEventListener('click', () => {
  AudioSys.init();
  G.started = true;
  titleEl.classList.add('hidden');
  hud.classList.remove('hidden');
  flashMessage('BOLETARIAN PALACE', 2.4);
  setTimeout(() => { if (!G.bossActive) showToast('Find the Archstone ahead — then breach the white fog to the north'); }, 2600);
  try { canvas.requestPointerLock(); } catch {}
});
respawnBtn.addEventListener('click', () => { respawn(); });
ngBtn.addEventListener('click', () => {
  victoryEl.classList.add('hidden');
  G.won = false; G.journey++; G.bossDefeated = false;
  G.hp = G.maxHp = 100 + (G.journey - 1) * 15;
  G.grass = G.maxGrass = 3 + Math.min(2, G.journey - 1);
  player.pos.set(0, 0, 33); player.yaw = 0; camYaw = 0;
  boss.maxHp = 900 + (G.journey - 1) * 350; boss.dmg = 26 + (G.journey - 1) * 6;
  soldierDefs.forEach(([x, z], i) => { if (enemies[i]) { enemies[i].dmg += 3; enemies[i].maxHp += 20; } });
  resetEnemies();
  flashMessage(`JOURNEY ${G.journey}`, 2.2);
  AudioSys.bonfire();
});

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;
  const t = G.time;

  // torch flicker
  for (const tl of torchLights) {
    const n = Math.sin(t * 11 + tl.seed) * 0.5 + Math.sin(t * 23 + tl.seed * 2) * 0.3;
    tl.light.intensity = 20 + n * 6;
    tl.flame.scale.set(1 + n * 0.15, 1 + n * 0.3, 1 + n * 0.15);
    tl.flame.rotation.y += dt * 3;
  }
  archLight.intensity = 2 + Math.sin(t * 2.4) * 0.5;
  archPillar.rotation.y += dt * 0.6;
  fogMat.uniforms.uTime.value = t;
  if (stain) { stain.userData.orb.position.y = 0.7 + Math.sin(t * 3) * 0.15; stain.rotation.y += dt; }

  // particles drift
  for (const [pts, rise, sway] of [[embers, 1.2, 0.6], [ash, 0.5, 1.2]]) {
    const p = pts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + rise * dt * pts.userData.vel[i] * 0.5;
      let x = p.getX(i) + Math.sin(t + i) * sway * dt;
      if (y > 16) { y = 0; x = (Math.random() - 0.5) * 80; }
      p.setY(i, y); p.setX(i, x);
    }
    p.needsUpdate = true;
  }
  // sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life -= dt;
    const p = s.pts.geometry.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const v = s.vel[j];
      v.y -= 12 * dt;
      p.setXYZ(j, p.getX(j) + v.x * dt, Math.max(0.05, p.getY(j) + v.y * dt), p.getZ(j) + v.z * dt);
    }
    p.needsUpdate = true;
    s.pts.material.opacity = Math.max(0, s.life * 2);
    if (s.life <= 0) { world.remove(s.pts); s.pts.geometry.dispose(); sparks.splice(i, 1); }
  }
  // wisps fly to player
  for (let i = wisps.length - 1; i >= 0; i--) {
    const w = wisps[i]; w.life -= dt;
    w.m.position.lerp(player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), dt * 3);
    w.m.material.opacity = Math.max(0, w.life);
    if (w.life <= 0 || w.m.position.distanceTo(player.pos) < 0.6) { world.remove(w.m); wisps.splice(i, 1); }
  }

  if (G.started && !G.dead && !G.won) {
    updatePlayer(dt);
    for (const e of enemies) updateEnemy(e, dt);
  } else if (!G.started) {
    // idle demo: soldiers pace, boss hidden
    for (const e of enemies) if (e.kind === 'soldier') updateEnemy(e, dt);
  }
  updateCamera(dt);
  playerFill.position.copy(player.pos).add(new THREE.Vector3(0, 3.2, 2.5));
  updateHUD();
  renderer.render(scene, camera);
}
resetEnemies();
tick();

// expose for automated checks
window.__game = { G, player, enemies, start: () => startBtn.click() };
