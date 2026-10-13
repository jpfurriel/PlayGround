import * as THREE from 'three';

// Kane Parsons "Lifeform" / Bacteria: tall dark wire humanoid, stop-motion jitter
export class Entity {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.32), mat);
    torso.position.y = 1.75; this.group.add(torso);
    // head (featureless, tilted)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), mat);
    head.position.set(0.06, 2.65, 0); head.rotation.z = 0.18; this.group.add(head);
    // long arms
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.6, 0.13), mat);
    this.armL.position.set(-0.42, 1.7, 0); this.group.add(this.armL);
    this.armR = this.armL.clone(); this.armR.position.x = 0.42; this.group.add(this.armR);
    // legs
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 1.15, 0.17), mat);
    this.legL.position.set(-0.16, 0.58, 0); this.group.add(this.legL);
    this.legR = this.legL.clone(); this.legR.position.x = 0.16; this.group.add(this.legR);
    // wire filaments (Kane's cable look): lines sticking out
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const y = 1.0 + Math.random() * 1.8;
      pts.push(new THREE.Vector3((Math.random() - 0.5) * 0.5, y, (Math.random() - 0.5) * 0.3));
      pts.push(new THREE.Vector3((Math.random() - 0.5) * 2.2, y + (Math.random() - 0.5), (Math.random() - 0.5) * 2.2));
    }
    const wg = new THREE.BufferGeometry().setFromPoints(pts);
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x111111 }));
    this.group.add(this.wires);
    // faint eye glint
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    eye.position.set(0.1, 2.68, 0.18); this.group.add(eye);
    this.eye = eye;
    this.group.visible = false;
    scene.add(this.group);

    this.pos = new THREE.Vector3(40, 0, 40);
    this.state = 'dormant'; // dormant -> stalk -> hunt
    this.target = new THREE.Vector3();
    this.speed = 0;
    this.loseTimer = 0;
    this.jitterT = 0;
    this.screeched = false;
    this.group.position.copy(this.pos);
  }

  respawnFar(playerPos) {
    const a = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 30;
    this.pos.set(playerPos.x + Math.cos(a) * d, 0, playerPos.z + Math.sin(a) * d);
    this.state = 'stalk';
    this.screeched = false;
    this.loseTimer = 0;
  }

  update(dt, time, playerPos, playerSprinting, playerCrouch, hasLOS, dist) {
    // stop-motion jitter (Kane style: 8fps stepped motion)
    this.jitterT += dt;
    const step = Math.floor(time * 9) % 2 === 0 ? 1 : -1;
    this.group.position.set(
      this.pos.x + (this.state === 'hunt' ? step * 0.03 : 0),
      Math.abs(Math.sin(time * (this.state === 'hunt' ? 9 : 3))) * 0.06,
      this.pos.z
    );
    this.group.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const swing = Math.sin(time * (this.state === 'hunt' ? 10 : 2.5)) * (this.state === 'hunt' ? 0.5 : 0.15);
    this.armL.rotation.x = swing; this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing; this.legR.rotation.x = swing;
    this.wires.rotation.y = Math.sin(time * 1.7) * 0.4;
    this.eye.visible = this.state === 'hunt' ? (Math.floor(time * 6) % 2 === 0) : true;

    let wantVisible = dist < 70 && hasLOS;
    // state machine
    if (this.state === 'dormant') {
      this.group.visible = false;
      if (dist < 45) { this.state = 'stalk'; }
      return 'dormant';
    }
    this.group.visible = wantVisible || this.state === 'hunt';

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
    toPlayer.y = 0;
    const d = toPlayer.length();

    if (this.state === 'stalk') {
      this.speed = 1.6;
      if (d > 0.5) { toPlayer.normalize(); this.pos.addScaledVector(toPlayer, this.speed * dt); }
      // escalate: close, LOS + sprint noise, or staring
      const hears = playerSprinting && d < 34;
      if ((hasLOS && d < 16) || hears || d < 5) { this.state = 'hunt'; this.screeched = false; this.loseTimer = 0; }
      if (d > 80) this.respawnFar(playerPos);
    } else if (this.state === 'hunt') {
      this.speed = playerSprinting ? 4.6 : 4.0;
      if (playerCrouch) this.speed = 3.4;
      if (d > 0.3) { toPlayer.normalize(); this.pos.addScaledVector(toPlayer, this.speed * dt); }
      if (!hasLOS) this.loseTimer += dt; else this.loseTimer = 0;
      if (this.loseTimer > 26 || d > 90) { this.state = 'stalk'; this.respawnFar(playerPos); }
    }
    return this.state;
  }
}
