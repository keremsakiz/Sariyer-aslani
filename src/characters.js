// İnsanlar ve av hayvanları (kodla modellenmiş, prosedürel animasyonlu)
import * as THREE from '../lib/three.module.min.js';
import { clamp, lerp, damp, mulberry32 } from './util.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const cap = (r, l, m) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
const ball = (sx, sy, sz, m, seg = 14) => { const o = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.7 | 0)).scale(sx, sy, sz), m); o.castShadow = true; return o; };

const SKINS = ['#e9c4a0', '#d8a982', '#c08a62', '#f0d2b4', '#a87552'];
const HAIRS = ['#2a1d14', '#4a3222', '#1a1714', '#7a5a38', '#b9b1a6'];
const SHIRTS = ['#c8453a', '#3c6fb4', '#e8e2d2', '#3f8a5a', '#d89a2a', '#6d4a8a', '#2d2d33', '#d46a8f', '#5aa0b8'];
const PANTS = ['#2b3346', '#3a3a3a', '#5a4a3a', '#6b7a8a', '#1e1e24'];

export const HUMAN_TYPES = {
  civil: { label: 'Yürüyüşçü' },
  jandarma: { label: 'Jandarma', shirt: '#4c5a33', pants: '#3f4b2b', hat: '#3a4526' },
  polis: { label: 'Polis', shirt: '#22314f', pants: '#1b2436', hat: '#141c2c' },
  vet: { label: 'Hayvan Kontrol', shirt: '#3d5a40', pants: '#2e3b2f', vest: '#ff7a1a', hat: '#ff7a1a' },
};

export class Human {
  constructor(type = 'civil', seed = 1) {
    const r = mulberry32(seed * 977 + 13);
    const T = HUMAN_TYPES[type];
    this.type = type;
    this.root = new THREE.Group();
    const skin = std(SKINS[Math.floor(r() * SKINS.length)]);
    const shirt = std(T.shirt || SHIRTS[Math.floor(r() * SHIRTS.length)]);
    const pants = std(T.pants || PANTS[Math.floor(r() * PANTS.length)]);
    const shoe = std('#2a2522');
    const hairM = std(HAIRS[Math.floor(r() * HAIRS.length)]);
    const h = this.scaleH = 0.92 + r() * 0.14;
    this.inner = new THREE.Group(); this.inner.scale.setScalar(h); this.root.add(this.inner);

    const hips = this.hips = new THREE.Group(); hips.position.y = 0.95; this.inner.add(hips);
    const pelvis = ball(0.17, 0.12, 0.11, pants); hips.add(pelvis);
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.05; hips.add(spine);
    const torso = cap(0.17, 0.32, shirt); torso.position.y = 0.27; torso.scale.set(1, 1, 0.68); spine.add(torso);
    if (T.vest) { const v = cap(0.18, 0.26, std(T.vest, { emissive: T.vest, emissiveIntensity: 0.15 })); v.position.y = 0.3; v.scale.set(1.02, 1, 0.72); spine.add(v);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.04, 0.26), std('#e8e8e0', { emissive: '#888', emissiveIntensity: 0.5 })); stripe.position.y = 0.24; spine.add(stripe); }
    const neck = cap(0.05, 0.06, skin); neck.position.y = 0.55; spine.add(neck);
    const head = this.head = new THREE.Group(); head.position.y = 0.68; spine.add(head);
    head.add(ball(0.105, 0.125, 0.11, skin));
    const nose = ball(0.018, 0.025, 0.02, skin, 8); nose.position.set(0, -0.01, 0.11); head.add(nose);
    for (const sx of [-1, 1]) { const e = ball(0.014, 0.014, 0.008, std('#1a1410'), 8); e.position.set(sx * 0.038, 0.02, 0.098); head.add(e); }
    if (T.hat) {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 14), std(T.hat)); hat.position.y = 0.1; head.add(hat);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.1), std(T.hat)); brim.position.set(0, 0.07, 0.11); head.add(brim);
    } else {
      const hair = ball(0.112, 0.08, 0.118, hairM); hair.position.set(0, 0.06, -0.01); head.add(hair);
      if (r() < 0.4) { const tail = ball(0.06, 0.12, 0.06, hairM); tail.position.set(0, -0.04, -0.1); head.add(tail); }
    }
    // kollar
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.21, 0.47, 0); spine.add(sh);
      const up = cap(0.05, 0.22, shirt); up.position.y = -0.14; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const lo = cap(0.042, 0.2, skin); lo.position.y = -0.13; el.add(lo);
      const hand = ball(0.045, 0.05, 0.03, skin, 8); hand.position.y = -0.27; el.add(hand);
      this.arms.push({ sh, el, sx });
    }
    // bacaklar
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(sx * 0.09, -0.03, 0); hips.add(hp);
      const th = cap(0.07, 0.3, pants); th.position.y = -0.22; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
      const sh = cap(0.055, 0.3, pants); sh.position.y = -0.2; kn.add(sh);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.22), shoe); foot.position.set(0, -0.44, 0.05); foot.castShadow = true; kn.add(foot);
      this.legs.push({ hp, kn, sx });
    }
    // ekipman
    const rightEl = this.arms[1].el;
    if (type === 'civil') {
      this.phone = new THREE.Group();
      const ph = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), std('#111', { roughness: 0.3 })); this.phone.add(ph);
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
      this.flash.position.set(0, 0.05, -0.01); this.phone.add(this.flash);
      this.phone.position.set(0, -0.3, 0.03); this.phone.visible = false; rightEl.add(this.phone);
      if (r() < 0.5) { const bag = cap(0.12, 0.2, std(SHIRTS[Math.floor(r() * SHIRTS.length)])); bag.position.set(0, 0.3, -0.17); bag.scale.z = 0.6; spine.add(bag); }
    } else {
      this.gun = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), std(type === 'vet' ? '#3a3a3a' : '#1b1b1b', { metalness: 0.5, roughness: 0.4 }));
      body.position.z = 0.25; this.gun.add(body);
      if (type === 'vet') { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8).rotateX(Math.PI / 2), std('#222')); sc.position.set(0, 0.07, 0.15); this.gun.add(sc); }
      this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0 }));
      this.muzzle.position.z = 0.65; this.gun.add(this.muzzle);
      this.gun.position.set(0, -0.27, 0); rightEl.add(this.gun);
    }
    // el feneri (gece)
    this.torch = null;
    this.t = r() * 10; this.phase = 0; this.speed = 0;
    this.photo = 0; this.aim = 0; this.fall = 0; this.cower = 0; this.flashT = 0;
  }

  shoot() { this.flashT = 0.08; }

  animate(dt, st) {
    this.t += dt;
    this.speed = damp(this.speed, st.speed || 0, 8, dt);
    for (const k of ['photo', 'aim', 'fall', 'cower']) this[k] = damp(this[k], st[k] || 0, 6, dt);
    const sp = this.speed, run = clamp((sp - 2) / 3, 0, 1), mv = clamp(sp / 0.8, 0, 1);
    this.phase = (this.phase + dt * sp / lerp(1.4, 2.4, run)) % 1;
    const s = Math.sin(this.phase * Math.PI * 2), c = Math.cos(this.phase * Math.PI * 2);
    const a = lerp(0.45, 0.85, run) * mv;
    this.legs.forEach((L, i) => {
      const k = i ? -1 : 1;
      L.hp.rotation.x = -s * a * k - this.cower * 0.9;
      L.kn.rotation.x = Math.max(0, c * k) * lerp(0.6, 1.4, run) * mv + this.cower * 1.6;
    });
    this.arms.forEach((A, i) => {
      const k = i ? 1 : -1;
      let shx = -s * a * 0.8 * k, elx = -0.2 - run * 0.9 * mv, shz = A.sx * 0.08;
      if (i === 1) { shx = lerp(shx, -1.6, this.photo); elx = lerp(elx, -0.6, this.photo); shx = lerp(shx, -1.45, this.aim); elx = lerp(elx, -0.1, this.aim); }
      else { shx = lerp(shx, -1.3, this.aim); elx = lerp(elx, -0.5, this.aim); shz = lerp(shz, 0.5, this.aim); }
      shx = lerp(shx, -2.6, this.cower * 0.6);
      A.sh.rotation.x = shx; A.el.rotation.x = elx; A.sh.rotation.z = shz;
    });
    this.hips.position.y = 0.95 + Math.abs(s) * 0.04 * mv - this.cower * 0.35;
    this.spine.rotation.x = run * 0.25 * mv + this.cower * 0.5;
    this.head.rotation.x = -this.photo * 0.1;
    this.inner.rotation.x = -this.fall * 1.45;
    this.inner.position.y = this.fall * 0.15;
    if (this.phone) { this.phone.visible = this.photo > 0.3; this.phone.rotation.x = 1.4 * this.photo; this.flash.material.opacity = st.flash ? 1 : 0; }
    if (this.gun) { this.gun.rotation.x = lerp(0.9, 1.5, this.aim); this.flashT -= dt; this.muzzle.material.opacity = this.flashT > 0 ? 1 : 0; }
  }
}

// ---------- Av hayvanları ----------
export const PREY_TYPES = {
  tavsan: { name: 'tavşan', food: 22, hp: 1, speed: 7, flee: 14, size: 0.35, danger: 0, score: 20 },
  karaca: { name: 'karaca', food: 55, hp: 1, speed: 10.5, flee: 22, size: 1, danger: 0, score: 50 },
  domuz: { name: 'yaban domuzu', food: 80, hp: 2, speed: 7.5, flee: 10, size: 0.9, danger: 22, score: 80 },
};

export class Prey {
  constructor(kind) {
    this.kind = kind; const P = PREY_TYPES[kind];
    this.root = new THREE.Group();
    this.legs = [];
    let fur, belly;
    if (kind === 'tavsan') {
      fur = std('#8a7660'); belly = std('#d8cbb6');
      const body = ball(0.13, 0.12, 0.18, fur); body.position.y = 0.16; this.root.add(body); this.body = body;
      const head = ball(0.08, 0.075, 0.09, fur); head.position.set(0, 0.25, 0.15); this.root.add(head);
      for (const sx of [-1, 1]) { const ear = ball(0.025, 0.1, 0.015, fur); ear.position.set(sx * 0.035, 0.36, 0.12); ear.rotation.x = -0.3; this.root.add(ear); }
      const tail = ball(0.04, 0.04, 0.04, belly); tail.position.set(0, 0.18, -0.18); this.root.add(tail);
      this.hop = true;
    } else if (kind === 'karaca') {
      fur = std('#9a6236'); belly = std('#e6d6c0');
      const body = ball(0.2, 0.22, 0.5, fur); body.position.y = 0.85; this.root.add(body); this.body = body;
      const rump = ball(0.16, 0.16, 0.08, belly); rump.position.set(0, 0.88, -0.48); this.root.add(rump);
      const neck = cap(0.07, 0.35, fur); neck.position.set(0, 1.15, 0.42); neck.rotation.x = 0.5; this.root.add(neck);
      const head = ball(0.08, 0.08, 0.15, fur); head.position.set(0, 1.38, 0.55); this.root.add(head); this.headM = head;
      const nose = ball(0.03, 0.03, 0.03, std('#1d1714')); nose.position.set(0, 1.36, 0.69); this.root.add(nose);
      for (const sx of [-1, 1]) { const ear = ball(0.03, 0.07, 0.015, fur); ear.position.set(sx * 0.07, 1.47, 0.5); ear.rotation.z = -sx * 0.5; this.root.add(ear); }
      for (const [x, z] of [[0.11, 0.35], [-0.11, 0.35], [0.11, -0.38], [-0.11, -0.38]]) {
        const hip = new THREE.Group(); hip.position.set(x, 0.8, z); this.root.add(hip);
        const leg = cap(0.035, 0.68, fur); leg.position.y = -0.38; hip.add(leg); this.legs.push(hip);
      }
    } else {
      fur = std('#3d332b'); belly = std('#4b4036');
      const body = ball(0.3, 0.33, 0.6, fur); body.position.y = 0.6; this.root.add(body); this.body = body;
      const hump = ball(0.24, 0.2, 0.3, fur); hump.position.set(0, 0.82, 0.2); this.root.add(hump);
      const head = ball(0.17, 0.18, 0.3, fur); head.position.set(0, 0.55, 0.7); head.rotation.x = 0.35; this.root.add(head);
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 10).rotateX(Math.PI / 2), std('#5a463b')); snout.position.set(0, 0.45, 0.97); this.root.add(snout);
      for (const sx of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 6), std('#ece4d0')); tusk.position.set(sx * 0.07, 0.48, 0.9); tusk.rotation.set(-0.6, 0, sx * 0.4); this.root.add(tusk);
        const ear = ball(0.04, 0.07, 0.02, fur); ear.position.set(sx * 0.11, 0.72, 0.6); this.root.add(ear);
      }
      for (const [x, z] of [[0.15, 0.35], [-0.15, 0.35], [0.15, -0.38], [-0.15, -0.38]]) {
        const hip = new THREE.Group(); hip.position.set(x, 0.45, z); this.root.add(hip);
        const leg = cap(0.06, 0.3, fur); leg.position.y = -0.22; hip.add(leg); this.legs.push(hip);
      }
    }
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.phase = Math.random(); this.t = Math.random() * 10;
  }
  animate(dt, speed, dead) {
    this.t += dt;
    if (dead) { this.root.rotation.z = damp(this.root.rotation.z, 1.5, 6, dt); return; }
    this.phase = (this.phase + dt * speed / (this.kind === 'karaca' ? 2.2 : 1.2)) % 1;
    const s = Math.sin(this.phase * Math.PI * 2), mv = clamp(speed / 1, 0, 1);
    if (this.hop) { this.root.children.forEach(c => { if (c.userData.y0 === undefined) c.userData.y0 = c.position.y; c.position.y = c.userData.y0 + Math.max(0, s) * 0.25 * mv; }); return; }
    this.legs.forEach((L, i) => { L.rotation.x = s * 0.6 * mv * ((i % 2) ? 1 : -1) * (i < 2 ? 1 : -1); });
  }
}
