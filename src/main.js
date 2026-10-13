import * as THREE from 'three';
import { makeTextures, biomeAt } from './textures.js';
import { World } from './world.js';
import { Entity } from './entity.js';
import { AudioEngine } from './audio.js';

// ============================== setup ==============================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050503);
scene.fog = new THREE.Fog(0x0a0902, 18, 70);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';

const TEX = makeTextures();
const world = new World(scene, TEX);
const entity = new Entity(scene);
const audio = new AudioEngine();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// flashlight (Kane: harsh camcorder light)
const flash = new THREE.SpotLight(0xfff1cf, 0, 34, 0.74, 0.5, 1.1);
scene.add(flash); scene.add(flash.target);
let flashOn = true;

// ============================== player state ==============================
const player = {
  pos: new THREE.Vector3(3, 0, 3),
  vel: new THREE.Vector3(),
  yaw: Math.PI * 0.25, pitch: 0,
  crouch: false, sprint: false, moving: false,
  stamina: 1, battery: 1, sanity: 1,
  almond: 0, depth: 0, traveled: 0,
  bobT: 0, stepT: 0, dead: false, started: false,
  lastBiome: null, heartT: 0,
};
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyF') { flashOn = !flashOn; }
  if (e.code === 'KeyM') {
    const m = audio.toggleMute();
    toast(m ? 'AUDIO MUTED' : 'AUDIO ON');
  }
  if (e.code === 'KeyE') tryInteract();
  if (['ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);

// pointer lock
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
const pauseEl = document.getElementById('pause');
const deathEl = document.getElementById('death');
document.getElementById('play-btn').onclick = () => startGame();
document.getElementById('resume-btn').onclick = () => canvas.requestPointerLock();
document.getElementById('restart-btn').onclick = () => location.reload();
document.getElementById('retry-btn').onclick = () => respawn();

function startGame() {
  audio.start();
  document.getElementById('loading').classList.remove('hidden');
  setTimeout(() => {
    titleEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    player.started = true;
    world.ensureAround(player.pos.x, player.pos.z);
    entity.respawnFar(player.pos);
    canvas.requestPointerLock();
    toast('A-SYNC CAM 03 — SIGNAL ACQUIRED');
    setTimeout(() => toast('FIND THE GLOWING EXIT DOOR'), 3500);
  }, 600);
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (player.started && !player.dead && !locked) pauseEl.classList.remove('hidden');
  else pauseEl.classList.add('hidden');
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas || !player.started || player.dead) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
canvas.addEventListener('click', () => {
  if (player.started && !player.dead && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

// ============================== helpers ==============================
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 2600) {
  toastEl.textContent = '◈ ' + msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function hasLOS(a, b) {
  // grid-march against wall colliders
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / 0.6);
  for (let i = 1; i < steps; i++) {
    const x = a.x + dx * i / steps, z = a.z + dz * i / steps;
    for (const ch of world.chunks.values()) {
      for (const c of ch.colliders) {
        if (c.maxY !== undefined) continue;
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) {
          // ignore low props? walls are full height; approximate all as blocking
          // allow see-through if collider tiny (pillar)? pillars block too at eye height
          return false;
        }
      }
    }
  }
  return true;
}

function tryInteract() {
  if (!player.started || player.dead) return;
  const exit = world.nearestExit(player.pos);
  if (exit) { descend(exit); return; }
  const pk = world.nearestPickup(player.pos);
  if (pk) {
    pk.taken = true; pk.mesh.visible = false;
    player.almond++;
    player.sanity = Math.min(1, player.sanity + 0.35);
    player.battery = Math.min(1, player.battery + 0.25);
    audio.pickup();
    toast(`ALMOND WATER SECURED (${player.almond}) — SANITY RESTORED`);
    document.getElementById('almond-count').textContent = player.almond;
  }
}

function descend(exit) {
  exit.used = true;
  audio.descend();
  const d = document.getElementById('descend');
  d.classList.remove('hidden');
  setTimeout(() => {
    player.depth++;
    player.sanity = Math.min(1, player.sanity + 0.2);
    // push player through door
    player.pos.x = exit.pos.x; player.pos.z = exit.pos.z + 0.5;
    player.vel.set(0, 0, 0);
    entity.respawnFar(player.pos);
    world.ensureAround(player.pos.x, player.pos.z);
    d.classList.add('hidden');
    const b = biomeAt(player.pos.x, player.pos.z);
    toast(`DESCENDED — DEPTH ${player.depth} · ${b.name}`, 3400);
  }, 1300);
}

function respawn() {
  deathEl.classList.add('hidden');
  player.dead = false;
  player.pos.set(3, 0, 3); player.vel.set(0, 0, 0);
  player.stamina = 1; player.battery = 1; player.sanity = 1;
  player.depth = 0; player.traveled = 0;
  world.reset();
  world.ensureAround(3, 3);
  entity.respawnFar(player.pos);
  canvas.requestPointerLock();
}

// ============================== VHS noise overlay ==============================
const noiseWrap = document.getElementById('vhs-noise');
const noiseC = document.createElement('canvas');
noiseC.width = 220; noiseC.height = 140;
noiseWrap.appendChild(noiseC);
const nctx = noiseC.getContext('2d');
setInterval(() => {
  if (titleEl && !titleEl.classList.contains('hidden')) return; // cheap idle
  const img = nctx.createImageData(220, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255 | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
}, 90);
const trackingEl = document.getElementById('tracking');
setInterval(() => {
  if (Math.random() < 0.16 && player.started && !player.dead) {
    trackingEl.classList.remove('hidden');
    trackingEl.style.top = (Math.random() * 90) + '%';
    setTimeout(() => trackingEl.classList.add('hidden'), 220 + Math.random() * 400);
  }
}, 2800);
// timestamp tick
const tsEl = document.getElementById('timestamp');
let tsMin = 47;
setInterval(() => {
  tsMin = (tsMin + 1) % 60;
  tsEl.innerHTML = `PM 11:${String(tsMin).padStart(2, '0')} &nbsp; JUN. 03 1991`;
}, 8000);

// ============================== HUD refs ==============================
const zoneEl = document.getElementById('zone-label');
const depthEl = document.getElementById('depth-label');
const stamEl = document.getElementById('stamina-fill');
const batEl = document.getElementById('battery-fill');
const sanEl = document.getElementById('sanity-fill');
const dangerEl = document.getElementById('danger');
const interactEl = document.getElementById('interact');
const dmgEl = document.getElementById('damage-flash');

// ============================== main loop ==============================
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), rgt = new THREE.Vector3();
let fogTarget = new THREE.Color(0x0a0902);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (player.started && !player.dead) {
    // ----- input direction -----
    player.crouch = !!(keys['KeyC'] || keys['ControlLeft']);
    const wantSprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
    fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    rgt.set(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) wish.add(fwd);
    if (keys['KeyS'] || keys['ArrowDown']) wish.sub(fwd);
    if (keys['KeyD'] || keys['ArrowRight']) wish.add(rgt);
    if (keys['KeyA'] || keys['ArrowLeft']) wish.sub(rgt);
    player.moving = wish.lengthSq() > 0.01;
    if (player.moving) wish.normalize();
    player.sprint = wantSprint && player.moving && player.stamina > 0.02 && !player.crouch;

    const maxSp = player.crouch ? 1.7 : player.sprint ? 5.6 : 3.3;
    const accel = player.moving ? 22 : 14;
    player.vel.x += (wish.x * maxSp - player.vel.x) * Math.min(1, accel * dt / maxSp * 3);
    player.vel.z += (wish.z * maxSp - player.vel.z) * Math.min(1, accel * dt / maxSp * 3);
    const prevX = player.pos.x, prevZ = player.pos.z;
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    player.traveled += Math.hypot(player.pos.x - prevX, player.pos.z - prevZ);

    // ----- collide -----
    const { surface, biome } = world.collide(player.pos, 0.42);
    world.ensureAround(player.pos.x, player.pos.z);

    // ----- stamina / battery / sanity -----
    if (player.sprint) player.stamina = Math.max(0, player.stamina - dt * 0.22);
    else player.stamina = Math.min(1, player.stamina + dt * (player.moving ? 0.06 : 0.14));
    if (flashOn && player.battery > 0) player.battery = Math.max(0, player.battery - dt * 0.008);
    if (player.battery <= 0) flashOn = false;
    const inDark = biome.id === 3;
    if (inDark && !flashOn) player.sanity = Math.max(0, player.sanity - dt * 0.012);

    // ----- head bob + footsteps -----
    if (speed > 0.4) {
      player.bobT += dt * (player.sprint ? 11 : 7.5);
      player.stepT -= dt * speed;
      if (player.stepT <= 0) {
        player.stepT = player.sprint ? 2.1 : 2.9;
        if (surface === 'pool' && Math.random() < 0.4) audio.splash();
        else audio.footstep(surface, player.sprint);
      }
    }
    const bobY = Math.sin(player.bobT) * (player.sprint ? 0.055 : 0.032) * Math.min(1, speed / 3);
    const bobX = Math.cos(player.bobT * 0.5) * 0.02 * Math.min(1, speed / 3);
    const eyeH = (player.crouch ? 1.02 : 1.62) + bobY;

    camera.position.set(player.pos.x + bobX * Math.cos(player.yaw), eyeH, player.pos.z - bobX * Math.sin(player.yaw));
    camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bobT * 0.5) * 0.004 + (player.sprint ? Math.sin(time * 30) * 0.0015 : 0));

    // ----- flashlight follows camera -----
    flash.position.copy(camera.position);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    flash.target.position.copy(camera.position).addScaledVector(dir, 6);
    flash.intensity = flashOn ? (player.crouch ? 26 : 36) : 0;
    if (flashOn && Math.random() < 0.004) flash.intensity *= 0.3; // occasional dip

    // ----- fog / ambience per biome -----
    const b = biomeAt(player.pos.x, player.pos.z);
    fogTarget.set(b.fog[0]);
    scene.fog.color.lerp(fogTarget, dt * 1.5);
    scene.background.copy(scene.fog.color);
    scene.fog.near += (b.fog[1] - scene.fog.near) * dt;
    scene.fog.far += (b.fog[2] - scene.fog.far) * dt;
    world.ambient.color.set(b.amb);
    world.ambient.intensity = b.id === 3 ? 0.65 : 1.15;

    // ----- entity -----
    const eDist = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
    const los = eDist < 75 ? hasLOS(player.pos, entity.pos) : false;
    const state = entity.update(dt, time, player.pos, player.sprint, player.crouch, los, eDist);
    const hum = world.update(camera.position, time, entity.pos);
    audio.setHum(hum);

    if (state === 'hunt') {
      player.sanity = Math.max(0, player.sanity - dt * 0.03);
      dangerEl.classList.remove('hidden');
      player.heartT -= dt;
      if (player.heartT <= 0) { player.heartT = 1.1; audio.heartbeat(); }
      if (!entity.screeched && eDist < 22) { entity.screeched = true; audio.screech(); }
      // camera shake
      camera.position.x += (Math.random() - 0.5) * 0.02 * (1 - eDist / 25);
    } else if (state === 'stalk' && eDist < 20 && los) {
      dangerEl.classList.remove('hidden');
    } else dangerEl.classList.add('hidden');

    // sanity visual: low sanity -> stronger noise + chromatic feel via vignette pulse
    noiseWrap.style.opacity = 0.08 + (1 - player.sanity) * 0.25 + (state === 'hunt' ? 0.12 : 0);

    // ----- death -----
    if (eDist < 1.35 && state !== 'dormant') {
      player.dead = true;
      audio.screech();
      dmgEl.style.opacity = 1;
      setTimeout(() => dmgEl.style.opacity = 0, 350);
      document.exitPointerLock?.();
      document.getElementById('death-stats').innerHTML =
        `SURVIVED ${Math.floor(player.traveled)}m · DEPTH ${player.depth} · ALMOND ◈ ${player.almond}<br>CAUSE: DIRECT CONTACT WITH LIFEFORM — TAPE ENDS`;
      setTimeout(() => deathEl.classList.remove('hidden'), 700);
    }

    // ----- HUD -----
    if (b !== player.lastBiome) {
      player.lastBiome = b;
      zoneEl.textContent = b.name;
    }
    depthEl.textContent = `DEPTH ${player.depth} · ${Math.floor(player.traveled)}m OF TAPE · ${surface.toUpperCase()}`;
    stamEl.style.width = (player.stamina * 100) + '%';
    batEl.style.width = (player.battery * 100) + '%';
    sanEl.style.width = (player.sanity * 100) + '%';
    const exit = world.nearestExit(player.pos);
    const pk = world.nearestPickup(player.pos);
    if (exit) { interactEl.textContent = '[E] ENTER THE EXIT DOOR'; interactEl.classList.remove('hidden'); }
    else if (pk) { interactEl.textContent = '[E] TAKE ALMOND WATER'; interactEl.classList.remove('hidden'); }
    else interactEl.classList.add('hidden');

    // special room discovery toast
    const room = world.checkSpecialRoom(player.pos);
    if (room) toast(`DISCOVERED — ${room.toUpperCase()}`, 3000);
  } else {
    // title-screen idle camera drift (behind title overlay, renders once started hidden—still render for capture)
    if (!player.started) {
      const t = time * 0.08;
      world.ensureAround(Math.cos(t) * 8, Math.sin(t) * 8);
      world.update(new THREE.Vector3(Math.cos(t) * 8, 1.6, Math.sin(t) * 8), time, null);
      camera.position.set(Math.cos(t) * 8, 1.62 + Math.sin(time * 0.6) * 0.05, Math.sin(t) * 8);
      camera.rotation.set(0, t + Math.PI, 0);
      flash.position.copy(camera.position);
      flash.target.position.set(Math.cos(t) * 8, 1.4, Math.sin(t) * 8);
      flash.intensity = 26;
    }
  }

  renderer.render(scene, camera);
}
tick();

// Debug/verification handle (used by automated smoke tests; harmless in production)
window.__backrooms = { player, world, entity, camera, scene, biomeAt, keys };
