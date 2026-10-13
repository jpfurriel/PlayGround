import * as THREE from 'three';
import { hash2, hash01, biomeAt, roomName, BIOMES } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CELL = 6;
export const CHUNK = 4; // cells per chunk side
const SPAN = CHUNK * CELL; // 24m
const WALL_H = 3.2;
const WALL_T = 0.32;
const RENDER_R = 2;
const KILL_R = 3;

export class World {
  constructor(scene, TEX) {
    this.scene = scene;
    this.TEX = TEX;
    this.chunks = new Map(); // "cx,cz" -> chunk
    this.flickers = []; // {mesh, phase, base}
    this.waters = [];
    this.exits = []; // {pos:Vector3, mesh, chunkKey, used}
    this.pickups = []; // {pos, mesh, taken, chunkKey}
    this.visitedRooms = new Set();
    this.lightPool = [];
    this.lightPanels = []; // {pos:Vector3}
    this.mats = this.makeMaterials(TEX);
    this.propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    this.lightMatBase = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
    this.exitMat = new THREE.MeshBasicMaterial({ color: 0xd8ff6a });
    this.doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.7 });
    this.pickupMat = new THREE.MeshStandardMaterial({ color: 0xf5edd0, emissive: 0xffe9a8, emissiveIntensity: 0.7, roughness: 0.4 });
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x2e9db4, transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.25 });
    this.paperMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d2, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const pl = new THREE.PointLight(0xffe2a8, 14, 20, 1.8);
      scene.add(pl);
      this.lightPool.push(pl);
    }
    // dim ambient, updated per-biome
    this.ambient = new THREE.AmbientLight(0x665e3a, 0.85);
    scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xfff2cc, 0x201a08, 0.5);
    scene.add(this.hemi);
  }

  makeMaterials(T) {
    const std = (map, color = 0xffffff, rough = 0.92) =>
      new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0.02 });
    return {
      wall: [
        std(T.wallpaper), std(T.concrete),
        std(T.poolTile), std(T.metalWall),
        std(T.labWall),
      ],
      floor: [
        std(T.carpet), std(T.concreteFloor, 0x9a9a94),
        std(T.poolFloor), std(T.concreteFloor, 0x3f403d),
        std(T.concreteFloor, 0xd8d8d4),
      ],
      ceil: [
        std(T.ceilingTile), std(T.ceilingTile, 0x9a9a98),
        std(T.poolTile), std(T.ceilingTile, 0x555550),
        std(T.ceilingTile, 0xffffff),
      ],
    };
  }

  key(cx, cz) { return cx + ',' + cz; }

  ensureAround(px, pz) {
    const ccx = Math.floor(px / SPAN), ccz = Math.floor(pz / SPAN);
    for (let dx = -RENDER_R; dx <= RENDER_R; dx++)
      for (let dz = -RENDER_R; dz <= RENDER_R; dz++) {
        const k = this.key(ccx + dx, ccz + dz);
        if (!this.chunks.has(k)) this.buildChunk(ccx + dx, ccz + dz);
      }
    // dispose far
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - ccx) > KILL_R || Math.abs(ch.cz - ccz) > KILL_R) {
        this.disposeChunk(k);
      }
    }
    this.updateLightPanels();
  }

  disposeChunk(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    this.scene.remove(ch.group);
    ch.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.flickers = this.flickers.filter(f => f.chunkKey !== k);
    this.waters = this.waters.filter(w => w.chunkKey !== k);
    for (let i = this.exits.length - 1; i >= 0; i--) if (this.exits[i].chunkKey === k) this.exits.splice(i, 1);
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].chunkKey === k) this.pickups.splice(i, 1);
    this.chunks.delete(k);
    this.updateLightPanels();
  }

  dominantBiome(ccx, ccz) {
    return biomeAt((ccx * CHUNK + 2) * CELL, (ccz * CHUNK + 2) * CELL);
  }

  buildChunk(ccx, ccz) {
    const k = this.key(ccx, ccz);
    const group = new THREE.Group();
    const x0 = ccx * SPAN, z0 = ccz * SPAN;
    const dom = this.dominantBiome(ccx, ccz);
    const colliders = [];

    // ---- floor & ceiling (dominant biome) ----
    const floorGeo = new THREE.PlaneGeometry(SPAN, SPAN);
    const floor = new THREE.Mesh(floorGeo, this.mats.floor[dom.id]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x0 + SPAN / 2, 0, z0 + SPAN / 2);
    group.add(floor);
    const ceil = new THREE.Mesh(floorGeo.clone(), this.mats.ceil[dom.id]);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(x0 + SPAN / 2, WALL_H, z0 + SPAN / 2);
    group.add(ceil);

    // ---- special-room clearing set ----
    const cleared = new Set();
    for (let ix = 0; ix < CHUNK; ix++) for (let iz = 0; iz < CHUNK; iz++) {
      const wx = ccx * CHUNK + ix, wz = ccz * CHUNK + iz;
      if (hash2(wx, wz, 555) % 29 === 0) {
        cleared.add(wx + ',' + wz);
        cleared.add((wx + 1) + ',' + wz);
        cleared.add(wx + ',' + (wz + 1));
        cleared.add((wx + 1) + ',' + (wz + 1));
      }
    }

    const nearSpawn = (wx, wz) => Math.hypot(wx * CELL, wz * CELL) < 14;
    const wallGeos = [[], [], [], [], []];
    const pillarGeos = [[], [], [], [], []];
    const lightGeos = [];
    const propBoxes = []; // {geo, color}
    const pushProp = (w, h, d, x, y, z, color, ry = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      propBoxes.push(g);
      return g;
    };

    const edgeWall = (ex, ez, horizontal, biome) => {
      // ex,ez = edge lattice coords; horizontal=true -> wall runs along X at z boundary
      const h = horizontal ? hash01(ex, ez, 101) : hash01(ex, ez, 202);
      if (h >= biome.wallP) return;
      // don't seal cleared rooms
      if (horizontal) {
        const a = ex + ',' + (ez - 1), b = ex + ',' + ez;
        if (cleared.has(a) && cleared.has(b)) return;
      } else {
        const a = (ex - 1) + ',' + ez, b = ex + ',' + ez;
        if (cleared.has(a) && cleared.has(b)) return;
      }
      const wx = ex * CELL, wz = ez * CELL;
      if (Math.hypot(wx, wz) < 13) return; // spawn clearing
      const g = horizontal
        ? new THREE.BoxGeometry(CELL + WALL_T, WALL_H, WALL_T)
        : new THREE.BoxGeometry(WALL_T, WALL_H, CELL + WALL_T);
      const cx = horizontal ? wx + CELL / 2 : wx;
      const cz = horizontal ? wz : wz + CELL / 2;
      g.translate(cx, WALL_H / 2, cz);
      wallGeos[biome.id].push(g);
      colliders.push({ minX: cx - (horizontal ? CELL / 2 : WALL_T / 2), maxX: cx + (horizontal ? CELL / 2 : WALL_T / 2), minZ: cz - (horizontal ? WALL_T / 2 : CELL / 2), maxZ: cz + (horizontal ? WALL_T / 2 : CELL / 2) });
    };

    // Each chunk owns the EAST + SOUTH edges of its own cells only:
    // east edge of cell (wx,wz) = vertical wall at lattice x=wx+1 spanning row wz;
    // south edge of cell (wx,wz) = horizontal wall at lattice z=wz+1 spanning col wx.
    // North row (lz=z0) / west col (lx=x0) edges are built by neighboring chunks. No dupes.
    const gx0 = ccx * CHUNK, gz0 = ccz * CHUNK;
    for (let ix = 0; ix < CHUNK; ix++) {
      for (let iz = 0; iz < CHUNK; iz++) {
        const wx = gx0 + ix, wz = gz0 + iz;
        // east edge (vertical, spans row wz)
        {
          const b = biomeAt((wx + 1) * CELL, (wz + 0.5) * CELL);
          edgeWall(wx + 1, wz, false, b);
        }
        // south edge (horizontal, spans col wx)
        {
          const b = biomeAt((wx + 0.5) * CELL, (wz + 1) * CELL);
          edgeWall(wx, wz + 1, true, b);
        }
      }
    }

    // ---- pillars (owned lattice points only: [gx0,gx0+4) x [gz0,gz0+4)) ----
    for (let lx = gx0; lx < gx0 + CHUNK; lx++) {
      for (let lz = gz0; lz < gz0 + CHUNK; lz++) {
        const b = biomeAt(lx * CELL, lz * CELL);
        if (hash01(lx, lz, 303) >= b.pillarP) continue;
        if (Math.hypot(lx * CELL, lz * CELL) < 12) continue;
        const cx = lx * CELL, cz = lz * CELL;
        // skip inside cleared rooms (keep at most border)
        const g = new THREE.BoxGeometry(0.72, WALL_H, 0.72);
        g.translate(cx, WALL_H / 2, cz);
        pillarGeos[b.id].push(g);
        colliders.push({ minX: cx - 0.36, maxX: cx + 0.36, minZ: cz - 0.36, maxZ: cz + 0.36 });
      }
    }

    // ---- ceiling lights + still-life props per cell ----
    const chunkLightPanels = [];
    for (let ix = 0; ix < CHUNK; ix++) for (let iz = 0; iz < CHUNK; iz++) {
      const wx = ccx * CHUNK + ix, wz = ccz * CHUNK + iz;
      const cx = (wx + 0.5) * CELL, cz = (wz + 0.5) * CELL;
      const b = biomeAt(cx, cz);
      const rngC = hash01(wx, wz, 404);
      // light panel
      if (rngC < b.lightP && !cleared.has(wx + ',' + wz)) {
        const flick = hash01(wx, wz, 505) < 0.12;
        const px = cx + (hash01(wx, wz, 606) - 0.5) * 1.2;
        const pz = cz + (hash01(wx, wz, 707) - 0.5) * 1.2;
        if (flick) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.8), this.lightMatBase.clone());
          m.position.set(px, WALL_H - 0.08, pz);
          group.add(m);
          this.flickers.push({ mesh: m, phase: Math.random() * 10, base: 1, chunkKey: k, pos: new THREE.Vector3(px, WALL_H - 0.4, pz) });
          chunkLightPanels.push(new THREE.Vector3(px, WALL_H - 0.4, pz));
        } else {
          const g = new THREE.BoxGeometry(1.5, 0.09, 0.8);
          g.translate(px, WALL_H - 0.08, pz);
          lightGeos.push(g);
          chunkLightPanels.push(new THREE.Vector3(px, WALL_H - 0.4, pz));
        }
        // dark fixture rim
        pushProp(1.7, 0.06, 1.0, px, WALL_H - 0.03, pz, 0x2b2b28);
      }
      // ---- still lifes ----
      if (cleared.has(wx + ',' + wz) && hash2(wx, wz, 555) % 29 === 0) {
        // only spawn once per 2x2 origin
        this.buildStillLife(pushProp, group, k, cx + CELL / 2, cz + CELL / 2, b, hash2(wx, wz, 808) % 8, colliders);
      } else {
        const r = hash01(wx, wz, 909);
        if (b.id === 2 && r < 0.30) {
          // poolrooms: sunken water pit
          const wgeo = new THREE.PlaneGeometry(4.4, 4.4);
          wgeo.rotateX(-Math.PI / 2);
          wgeo.translate(cx, 0.06, cz);
          const w = new THREE.Mesh(wgeo, this.waterMat);
          group.add(w);
          this.waters.push({ mesh: w, phase: Math.random() * 9, chunkKey: k });
          // tile rim
          pushProp(4.8, 0.18, 0.3, cx, 0.09, cz - 2.35, 0xe8f1f0);
          pushProp(4.8, 0.18, 0.3, cx, 0.09, cz + 2.35, 0xe8f1f0);
          pushProp(0.3, 0.18, 4.8, cx - 2.35, 0.09, cz, 0xe8f1f0);
          pushProp(0.3, 0.18, 4.8, cx + 2.35, 0.09, cz, 0xe8f1f0);
        } else if (r < 0.06) {
          // lone chair
          const a = hash01(wx, wz, 911) * Math.PI * 2;
          pushProp(0.5, 0.08, 0.5, cx, 0.45, cz, 0x5a4632, a);
          pushProp(0.5, 0.55, 0.08, cx - Math.sin(a) * 0.22, 0.75, cz - Math.cos(a) * 0.22, 0x5a4632, a);
          pushProp(0.07, 0.45, 0.07, cx - 0.18, 0.22, cz - 0.18, 0x3a3025);
          pushProp(0.07, 0.45, 0.07, cx + 0.18, 0.22, cz + 0.18, 0x3a3025);
        } else if (r < 0.09) {
          // paper storm
          for (let i = 0; i < 5; i++) {
            const px = cx + (hash01(wx * 7 + i, wz, 912) - 0.5) * 4;
            const pz = cz + (hash01(wx, wz * 7 + i, 913) - 0.5) * 4;
            const pg = new THREE.PlaneGeometry(0.3, 0.4);
            pg.rotateX(-Math.PI / 2); pg.rotateY(hash01(i, wz, 914) * 3);
            pg.translate(px, 0.02, pz);
            const pm = new THREE.Mesh(pg, this.paperMat);
            group.add(pm);
          }
        } else if (r < 0.11 && b.id !== 2) {
          // almond water bottle pickup
          const bx = cx + 1.2, bz = cz - 1.0;
          const bottle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.16), this.pickupMat);
          bottle.position.set(bx, 0.5, bz);
          group.add(bottle);
          this.pickups.push({ pos: new THREE.Vector3(bx, 0.5, bz), mesh: bottle, taken: false, chunkKey: k, phase: Math.random() * 6 });
        }
      }
      // maintenance pipes
      if (b.id === 3 && hash01(wx, wz, 915) < 0.4) {
        pushProp(CELL * 0.9, 0.14, 0.14, cx, WALL_H - 0.5, cz, 0x6a3a2a);
        pushProp(CELL * 0.9, 0.11, 0.11, cx, WALL_H - 0.72, cz + 0.3, 0x4a4a52);
      }
      // async wall posters / signs
      if ((b.id === 4 || b.id === 0) && hash01(wx, wz, 916) < 0.10) {
        pushProp(1.1, 0.7, 0.06, cx, 1.7, cz + 2.8, 0xb52b2b);
        pushProp(0.9, 0.5, 0.08, cx, 1.7, cz + 2.79, 0xe8e4d2);
      }
    }

    // ---- merged wall / pillar meshes ----
    for (let bi = 0; bi < 5; bi++) {
      if (wallGeos[bi].length) {
        const merged = mergeGeometries(wallGeos[bi]);
        wallGeos[bi].forEach(g => g.dispose());
        group.add(new THREE.Mesh(merged, this.mats.wall[bi]));
      }
      if (pillarGeos[bi].length) {
        const merged = mergeGeometries(pillarGeos[bi]);
        pillarGeos[bi].forEach(g => g.dispose());
        group.add(new THREE.Mesh(merged, this.mats.wall[bi]));
      }
    }
    if (lightGeos.length) {
      const merged = mergeGeometries(lightGeos);
      lightGeos.forEach(g => g.dispose());
      group.add(new THREE.Mesh(merged, this.lightMatBase));
    }
    if (propBoxes.length) {
      const merged = mergeGeometries(propBoxes);
      propBoxes.forEach(g => g.dispose());
      const m = new THREE.Mesh(merged, this.propMat);
      group.add(m);
    }

    // ---- exit door (rare, glowing) ----
    if (hash2(ccx, ccz, 777) % 9 === 0) {
      const cx = x0 + SPAN / 2 + (hash01(ccx, ccz, 778) - 0.5) * SPAN * 0.5;
      const cz = z0 + SPAN / 2 + (hash01(ccx, ccz, 779) - 0.5) * SPAN * 0.5;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 0.4), this.doorFrameMat);
      frame.position.set(cx, 1.25, cz);
      group.add(frame);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), this.exitMat.clone());
      door.position.set(cx, 1.2, cz + 0.22);
      group.add(door);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x39ff6a }));
      sign.position.set(cx, 2.75, cz + 0.1);
      group.add(sign);
      colliders.push({ minX: cx - 0.8, maxX: cx + 0.8, minZ: cz - 0.25, maxZ: cz + 0.25 });
      this.exits.push({ pos: new THREE.Vector3(cx, 0, cz + 1.2), mesh: door, sign, chunkKey: k, used: false, phase: Math.random() * 6 });
    }

    this.scene.add(group);
    const chunk = { cx: ccx, cz: ccz, group, colliders, panels: chunkLightPanels };
    this.chunks.set(k, chunk);
  }

  buildStillLife(pushProp, group, chunkKey, cx, cz, biome, type, colliders) {
    const wood = 0x6b5136, darkwood = 0x4a3826, red = 0x8a2b2b, blue = 0x2b4a8a, metal = 0x777776;
    if (type === 0) {
      // circle of chairs (classic Kane still)
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const x = cx + Math.cos(a) * 1.6, z = cz + Math.sin(a) * 1.6;
        pushProp(0.5, 0.08, 0.5, x, 0.45, z, wood, -a);
        pushProp(0.5, 0.55, 0.08, x + Math.cos(a) * 0.22, 0.75, z + Math.sin(a) * 0.22, wood, -a);
      }
      pushProp(1.0, 0.5, 1.0, cx, 0.25, cz, darkwood); // central table
    } else if (type === 1) {
      // conference table + papers
      pushProp(3.0, 0.1, 1.4, cx, 0.75, cz, wood);
      for (const [lx, lz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]])
        pushProp(0.1, 0.75, 0.1, cx + lx, 0.37, cz + lz, darkwood);
      for (let i = 0; i < 6; i++) pushProp(0.3, 0.02, 0.4, cx - 1 + i * 0.4, 0.82, cz, 0xe8e4d2, i);
      colliders.push({ minX: cx - 1.5, maxX: cx + 1.5, minZ: cz - 0.7, maxZ: cz + 0.7 });
    } else if (type === 2) {
      // vending machines row
      const cols = [red, blue, 0x2b8a4a];
      for (let i = 0; i < 3; i++) {
        pushProp(1.0, 2.1, 0.8, cx - 1.4 + i * 1.3, 1.05, cz - 2.0, cols[i]);
        pushProp(0.8, 0.5, 0.06, cx - 1.4 + i * 1.3, 1.4, cz - 1.58, 0xd8f4ff);
      }
      colliders.push({ minX: cx - 2, maxX: cx + 2, minZ: cz - 2.5, maxZ: cz - 1.5 });
    } else if (type === 3) {
      // exit sign pillar + arrow
      pushProp(0.5, WALL_H, 0.5, cx, WALL_H / 2, cz, 0x8d8d88);
      pushProp(1.2, 0.35, 0.12, cx, 2.6, cz + 0.3, 0x1a7a2a);
      colliders.push({ minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 0.3, maxZ: cz + 0.3 });
    } else if (type === 4) {
      // stacked crates /_async supplies
      pushProp(1.2, 1.2, 1.2, cx, 0.6, cz, 0x7a6a4a);
      pushProp(0.9, 0.9, 0.9, cx + 0.2, 1.65, cz - 0.1, 0x5a5a58, 0.4);
      pushProp(0.6, 0.6, 0.6, cx - 0.1, 2.4, cz + 0.2, 0x8a2b2b, 0.7);
      colliders.push({ minX: cx - 0.7, maxX: cx + 0.7, minZ: cz - 0.7, maxZ: cz + 0.7 });
    } else if (type === 5) {
      // mannequin row (creepy)
      for (let i = 0; i < 3; i++) {
        const x = cx - 1 + i;
        pushProp(0.4, 1.5, 0.3, x, 0.9, cz, 0xd8d0b8);
        pushProp(0.3, 0.3, 0.3, x, 1.85, cz, 0xd8d0b8);
      }
    } else if (type === 6) {
      // A-SYNC research tripod + cables (Kane Parsons signature)
      pushProp(0.08, 1.4, 0.08, cx - 0.4, 0.7, cz, metal, 0.3);
      pushProp(0.08, 1.4, 0.08, cx + 0.4, 0.7, cz, metal, -0.3);
      pushProp(0.08, 1.4, 0.08, cx, 0.7, cz + 0.4, metal);
      pushProp(0.5, 0.35, 0.3, cx, 1.55, cz, 0x1a1a1a);
      pushProp(4.0, 0.05, 0.12, cx + 1.5, 0.03, cz + 1.0, 0x111111, 0.2);
      pushProp(1.4, 0.9, 0.7, cx + 2.5, 0.45, cz + 1.5, 0x3a3a38);
    } else {
      // flooded office: desks half-sunk
      pushProp(2.2, 0.1, 1.0, cx, 0.6, cz, metal);
      pushProp(0.3, 0.3, 0.3, cx, 0.8, cz, 0xe8e4d2);
    }
  }

  updateLightPanels() {
    this._allPanels = [];
    for (const ch of this.chunks.values()) for (const p of ch.panels) this._allPanels.push(p);
  }

  update(playerPos, time, entityPos) {
    // assign pooled point lights to nearest panels
    if (!this._allPanels) this.updateLightPanels();
    const P = this._allPanels || [];
    P.sort((a, b) => a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos));
    const humNear = P.length && P[0].distanceTo(playerPos) < 9 ? 1 : 0.4;
    for (let i = 0; i < this.lightPool.length; i++) {
      const L = this.lightPool[i];
      if (i < P.length && P[i].distanceTo(playerPos) < 34) {
        L.position.copy(P[i]);
        L.visible = true;
        // entity proximity causes brownout flicker
        let f = 1;
        if (entityPos && P[i].distanceTo(entityPos) < 14) f = Math.random() < 0.3 ? 0.15 : 1;
        L.intensity = 13 * f;
      } else L.visible = false;
    }
    // flicker panels
    for (const fl of this.flickers) {
      const n = Math.sin(time * 37 + fl.phase) * Math.sin(time * 13.7 + fl.phase * 2);
      const on = n > -0.86 || (entityPos && fl.pos.distanceTo(entityPos) < 10 && Math.random() < 0.4);
      fl.mesh.visible = on;
    }
    // water shimmer
    for (const w of this.waters) {
      w.mesh.position.y = 0.06 + Math.sin(time * 1.4 + w.phase) * 0.012;
    }
    // exits pulse
    for (const e of this.exits) {
      e.mesh.material.color.setHSL(0.26 + Math.sin(time * 3 + e.phase) * 0.03, 1, 0.55 + Math.sin(time * 5 + e.phase) * 0.08);
    }
    // pickups bob
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.position.y = 0.5 + Math.sin(time * 2.4 + p.phase) * 0.12;
      p.mesh.rotation.y += 0.02;
    }
    return humNear;
  }

  collide(pos, radius) {
    // returns {surface, biome}
    let surface = 'carpet';
    for (const ch of this.chunks.values()) {
      // quick reject
      for (const c of ch.colliders) {
        if (pos.x + radius < c.minX || pos.x - radius > c.maxX || pos.z + radius < c.minZ || pos.z - radius > c.maxZ) continue;
        // resolve minimal axis
        const dx1 = pos.x + radius - c.minX, dx2 = c.maxX - (pos.x - radius);
        const dz1 = pos.z + radius - c.minZ, dz2 = c.maxZ - (pos.z - radius);
        const m = Math.min(dx1, dx2, dz1, dz2);
        if (m === dx1) pos.x = c.minX - radius;
        else if (m === dx2) pos.x = c.maxX + radius;
        else if (m === dz1) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    const b = biomeAt(pos.x, pos.z);
    surface = b.id === 2 ? 'pool' : b.id === 1 || b.id === 3 ? 'concrete' : 'carpet';
    return { surface, biome: b };
  }

  nearestExit(pos, maxD = 3.2) {
    let best = null, bd = maxD;
    for (const e of this.exits) {
      if (e.used) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestPickup(pos, maxD = 2.6) {
    let best = null, bd = maxD;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  checkSpecialRoom(pos) {
    const wx = Math.floor(pos.x / CELL), wz = Math.floor(pos.z / CELL);
    const k = wx + ',' + wz;
    if (this.visitedRooms.has(k)) return null;
    if (hash2(wx, wz, 555) % 29 === 0 || hash2(wx - 1, wz, 555) % 29 === 0 || hash2(wx, wz - 1, 555) % 29 === 0) {
      this.visitedRooms.add(k);
      return roomName(wx, wz);
    }
    // also toast biome changes occasionally
    return null;
  }

  reset() {
    for (const k of [...this.chunks.keys()]) this.disposeChunk(k);
    this.visitedRooms.clear();
  }
}
