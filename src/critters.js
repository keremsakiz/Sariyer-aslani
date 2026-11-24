// Kodla modellenmiş, prosedürel animasyonlu av hayvanları: tavşan ve yaban domuzu.
// Aslanla aynı teknik: kesitlerden örülmüş gövde (loft) + kürk dokusu. Arayüz Prey ile aynı: root, animate(dt, hız, ölü, durum).
import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';
import { loft, limb, furSphere, furTexture } from './feline.js';
import { mergeStatic } from './merge.js';

const col = (h) => new THREE.Color(h);
const plain = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
function furMat() {
  const ft = furTexture();
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: ft, bumpMap: ft, bumpScale: 0.8 });
}
let RABBIT_MAT = null, BOAR_MAT = null;

// ---------------- Tavşan ----------------
export class Rabbit {
  constructor() {
    const mat = RABBIT_MAT || (RABBIT_MAT = furMat());
    const TOP = col('#8d7a62'), BEL = col('#e6dac6'), DARK = col('#6e5c47');
    const mesh = (g, m = mat) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
    this.root = new THREE.Group();
    const inner = this.inner = new THREE.Group(); this.root.add(inner);
    const body = this.body = new THREE.Group(); body.position.y = 0.17; inner.add(body);
    body.add(mesh(loft([
      [-0.18, 0.0, 0.01, 0.01, 0.01], [-0.15, 0.01, 0.095, 0.1, 0.1], [-0.07, 0.02, 0.115, 0.12, 0.11],
      [0.03, 0.02, 0.095, 0.1, 0.085], [0.11, 0.04, 0.07, 0.075, 0.07], [0.15, 0.06, 0.01, 0.01, 0.01],
    ], { top: TOP, bottom: BEL, spine: true, spineCol: DARK, radial: 16, rv: 10 })));
    const tail = mesh(furSphere(0.035, 0.035, 0.03, { top: BEL, bottom: BEL })); tail.position.set(0, 0.06, -0.18); body.add(tail);
    // kafa
    const head = this.head = new THREE.Group(); head.position.set(0, 0.08, 0.13); body.add(head);
    head.add(mesh(loft([
      [-0.06, 0, 0.01, 0.01, 0.01], [-0.045, 0.005, 0.048, 0.052, 0.048], [0.015, 0.005, 0.052, 0.05, 0.05],
      [0.06, -0.01, 0.038, 0.035, 0.038], [0.09, -0.02, 0.024, 0.022, 0.024], [0.1, -0.02, 0.005, 0.005, 0.005],
    ], { top: TOP, bottom: BEL, radial: 14, rv: 12 })));
    const eyeM = plain('#120d0a', { roughness: 0.2 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeM); e.position.set(sx * 0.04, 0.015, 0.03); head.add(e); }
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), plain('#c98a8a')); this.nose.position.set(0, -0.012, 0.098); head.add(this.nose);
    // kulaklar
    this.ears = [];
    const pink = plain('#d9a3a0');
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.022, 0.045, -0.02); ear.rotation.set(-0.35, 0, -sx * 0.18); head.add(ear);
      const o = mesh(furSphere(0.022, 0.075, 0.011, { top: TOP, bottom: TOP })); o.position.y = 0.07; ear.add(o);
      const i = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.014, 0.06, 0.004), pink); i.position.set(0, 0.07, 0.008); ear.add(i);
      this.ears.push(ear);
    }
    // bacaklar: arka (güçlü uyluk + uzun ayak), ön (ince)
    this.hind = []; this.front = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.07, -0.02, -0.08); body.add(hip);
      const th = mesh(furSphere(0.047, 0.085, 0.09, { top: TOP, bottom: BEL, bias: 0.3 })); th.position.set(0, -0.04, 0.01); hip.add(th);
      const foot = new THREE.Group(); foot.position.set(0, -0.095, -0.01); hip.add(foot);
      const f = mesh(furSphere(0.025, 0.018, 0.075, { top: TOP, bottom: BEL })); f.position.set(0, -0.03, 0.045); foot.add(f);
      this.hind.push({ hip, foot });
      const sh = new THREE.Group(); sh.position.set(sx * 0.045, -0.03, 0.09); body.add(sh);
      const fl = mesh(limb([[-0.02, 0, 0.005, 0.005, 0.005], [0.0, 0, 0.022, 0.024, 0.024], [0.06, 0, 0.017, 0.018, 0.018], [0.11, 0.005, 0.016, 0.02, 0.016], [0.125, 0.005, 0.005, 0.005, 0.005]], { top: TOP, bottom: BEL })); sh.add(fl);
      this.front.push(sh);
    }
    for (const o of [inner]) o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    mergeStatic(this.root, new Set([this.nose]));
    this.phase = Math.random(); this.t = Math.random() * 10; this.sit = 0; this.graze = 0; this.dead = 0; this.spd = 0;
  }
  animate(dt, speed, dead, state) {
    this.t += dt;
    const t = this.t;
    this.dead = damp(this.dead, dead ? 1 : 0, 5, dt);
    this.spd = damp(this.spd, speed, 10, dt);
    const sp = this.spd, mv = clamp(sp / 1.2, 0, 1);
    // otlarken ara ara dikilip etrafı kollar; tetikteyken dik oturur
    const wantSit = state === 'alert' ? 1 : (state === 'graze' && sp < 0.3 && Math.sin(t * 0.37) > 0.75 ? 1 : 0);
    this.sit = damp(this.sit, wantSit * (1 - mv), 6, dt);
    this.graze = damp(this.graze, sp < 0.3 && !wantSit && state !== 'alert' ? 1 : 0, 3, dt);
    // zıplama döngüsü
    this.phase = (this.phase + dt * sp / lerp(0.55, 1.3, clamp(sp / 7, 0, 1))) % 1;
    const P = Math.PI * 2, s = Math.sin(this.phase * P), push = Math.max(0, s);
    const hopH = (0.05 + 0.08 * clamp(sp / 7, 0, 1)) * mv;
    this.inner.position.y = push * hopH;
    this.body.rotation.x = (-s * 0.22 * mv) - this.sit * 0.75 + this.graze * 0.12;
    this.body.position.y = 0.17 + this.sit * 0.05;
    this.hind.forEach((L) => { L.hip.rotation.x = (-s * 0.9 * mv) + this.sit * 0.6; L.foot.rotation.x = (s * 0.6 * mv) + this.sit * 0.2; });
    this.front.forEach((F) => { F.rotation.x = (s * 0.8 * mv) - this.sit * 0.2 - this.graze * 0.2; });
    this.head.rotation.x = this.sit * 0.55 + this.graze * (0.35 + Math.sin(t * 5) * 0.06);
    this.nose.scale.setScalar(1 + Math.max(0, Math.sin(t * 18)) * 0.35 * (1 - mv));
    this.ears.forEach((e, i) => { e.rotation.x = -0.35 - mv * 0.7 + (state === 'alert' ? 0.3 : 0) + Math.sin(t * 2.1 + i * 2) * 0.05; });
    this.inner.rotation.z = this.dead * 1.5;
  }
}

// ---------------- Yaban domuzu ----------------
export class Boar {
  constructor() {
    const mat = BOAR_MAT || (BOAR_MAT = furMat());
    const TOP = col('#4a3d33'), BEL = col('#5b4c40'), DARK = col('#211b16'), LEG = col('#2e2620');
    const mesh = (g, m = mat) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
    this.root = new THREE.Group();
    const inner = this.inner = new THREE.Group(); this.root.add(inner);
    const body = this.body = new THREE.Group(); body.position.y = 0.6; inner.add(body);
    // kama biçimli gövde: önde yüksek omuz, arkada düşen sağrı
    body.add(mesh(loft([
      [-0.62, 0.02, 0.01, 0.01, 0.01], [-0.57, 0.02, 0.16, 0.17, 0.18], [-0.4, 0.02, 0.23, 0.24, 0.24],
      [-0.08, 0.03, 0.26, 0.28, 0.27], [0.22, 0.07, 0.26, 0.34, 0.26], [0.44, 0.07, 0.22, 0.31, 0.23],
      [0.56, 0.04, 0.16, 0.22, 0.17], [0.61, 0.03, 0.01, 0.01, 0.01],
    ], { top: TOP, bottom: BEL, spine: true, spineCol: DARK, radial: 20, rv: 5 })));
    // sırt yelesi (kıllar)
    const brM = plain('#1b1612', { roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const z = -0.35 + i * 0.065, h = 0.07 + Math.sin(i / 13 * Math.PI) * 0.07;
      const T = [[-0.45, 0.25], [-0.08, 0.31], [0.22, 0.41], [0.5, 0.37]]; let yTop = 0.25;
      for (let k = 0; k < T.length - 1; k++) if (z >= T[k][0] && z <= T[k + 1][0]) yTop = lerp(T[k][1], T[k + 1][1], (z - T[k][0]) / (T[k + 1][0] - T[k][0])) - 0.02;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 5), brM); c.position.set(0, yTop + h * 0.3, z); c.rotation.x = -0.35; body.add(c);
    }
    // kafa
    const head = this.head = new THREE.Group(); head.position.set(0, 0.06, 0.52); body.add(head);
    const hg = loft([
      [-0.1, 0.02, 0.01, 0.01, 0.01], [-0.06, 0.02, 0.15, 0.18, 0.17], [0.08, 0.0, 0.13, 0.14, 0.14],
      [0.22, -0.05, 0.085, 0.085, 0.095], [0.33, -0.09, 0.06, 0.055, 0.06], [0.35, -0.09, 0.01, 0.01, 0.01],
    ], { top: TOP, bottom: BEL, spine: true, spineCol: DARK, radial: 16, rv: 6 });
    head.add(mesh(hg));
    head.rotation.x = 0.35;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.04, 14).rotateX(Math.PI / 2), plain('#6b5048', { roughness: 0.6 })); snout.position.set(0, -0.09, 0.345); head.add(snout);
    const nosM = plain('#241a17');
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), nosM); n.position.set(sx * 0.022, -0.09, 0.366); head.add(n);
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.11, 6), plain('#efe7d6', { roughness: 0.4 })); tusk.position.set(sx * 0.07, -0.1, 0.27); tusk.rotation.set(-0.5, 0, sx * 0.55); head.add(tusk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), plain('#0d0a08', { roughness: 0.2 })); eye.position.set(sx * 0.1, 0.05, 0.1); head.add(eye);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), new THREE.MeshStandardMaterial({ color: '#3a2f27', roughness: 1 })); ear.position.set(sx * 0.1, 0.17, -0.03); ear.rotation.set(-0.3, 0, -sx * 0.5); ear.scale.z = 0.4; head.add(ear);
    }
    // bacaklar: kısa ve güçlü, toynaklı
    this.legs = [];
    const hoofM = plain('#16120f', { roughness: 0.5 });
    const mkLeg = (x, z, front) => {
      const hip = new THREE.Group(); hip.position.set(x, -0.08, z); body.add(hip);
      hip.add(mesh(limb([[-0.08, 0, 0.01, 0.01, 0.01], [-0.04, 0, 0.08, 0.1, 0.11], [0.08, 0, 0.07, 0.08, 0.09], [0.2, 0, 0.045, 0.05, 0.05], [0.25, 0, 0.01, 0.01, 0.01]], { top: TOP, bottom: TOP })));
      const knee = new THREE.Group(); knee.position.y = -0.22; hip.add(knee);
      knee.add(mesh(limb([[-0.03, 0, 0.01, 0.01, 0.01], [0.0, 0, 0.04, 0.045, 0.045], [0.18, 0, 0.03, 0.035, 0.035], [0.22, 0, 0.01, 0.01, 0.01]], { top: LEG, bottom: LEG })));
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 8), hoofM); hoof.position.set(0, -0.23, 0.01); knee.add(hoof);
      const L = { hip, knee, front }; this.legs.push(L); return L;
    };
    mkLeg(0.13, 0.36, true); mkLeg(-0.13, 0.36, true); mkLeg(0.14, -0.4, false); mkLeg(-0.14, -0.4, false);
    // kuyruk
    const tail = this.tail = new THREE.Group(); tail.position.set(0, 0.08, -0.6); body.add(tail);
    const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5).translate(0, -0.11, 0), brM); tail.add(tm);
    const tt = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.025, 0.05, 0.025), brM); tt.position.y = -0.22; tail.add(tt);
    mergeStatic(this.root, new Set());
    this.phase = Math.random(); this.t = Math.random() * 10; this.dead = 0; this.spd = 0; this.root_ = 0; this.charge = 0;
  }
  animate(dt, speed, dead, state) {
    this.t += dt;
    const t = this.t;
    this.dead = damp(this.dead, dead ? 1 : 0, 5, dt);
    this.spd = damp(this.spd, speed, 8, dt);
    this.charge = damp(this.charge, state === 'charge' ? 1 : 0, 6, dt);
    const sp = this.spd, mv = clamp(sp / 1, 0, 1), run = clamp((sp - 3) / 4, 0, 1);
    this.root_ = damp(this.root_, sp < 0.3 && state === 'graze' ? 1 : 0, 3, dt); // toprağı eşeleme
    this.phase = (this.phase + dt * sp / lerp(0.9, 1.7, run)) % 1;
    const P = Math.PI * 2, offs = [0, 0.5, 0.5, 0], offsRun = [0, 0.1, 0.5, 0.6];
    const amp = lerp(0.45, 0.85, run) * mv;
    this.legs.forEach((L, i) => {
      const ph = (this.phase + lerp(offs[i], offsRun[i], run)) * P, s = Math.sin(ph), c = Math.cos(ph);
      L.hip.rotation.x = -s * amp + (L.front ? this.root_ * 0.15 : 0);
      L.knee.rotation.x = L.front ? Math.max(0, c) * 0.9 * mv : -Math.max(0, c) * 0.7 * mv;
    });
    const bob = Math.abs(Math.sin(this.phase * P * 2)) * lerp(0.02, 0.05, run) * mv;
    this.body.position.y = 0.6 + bob - this.root_ * 0.03;
    this.body.rotation.x = this.root_ * 0.08 + Math.sin(this.phase * P) * 0.04 * run;
    this.head.rotation.x = 0.35 + this.root_ * (0.45 + Math.sin(t * 6) * 0.12) + this.charge * 0.35 - run * 0.1;
    this.head.rotation.y = Math.sin(t * 0.8) * 0.15 * (1 - mv);
    this.tail.rotation.z = Math.sin(t * 7) * 0.5 * (0.3 + mv);
    this.tail.rotation.x = 0.3 + run * 0.8;
    this.inner.rotation.z = this.dead * 1.45;
    this.inner.position.y = -this.dead * 0.08;
  }
}
