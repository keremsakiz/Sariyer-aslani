// Kodla modellenmiş dişi aslan (ve yavrular). Hiyerarşik iskelet + prosedürel animasyon.
import * as THREE from 'three';
import { clamp, lerp, damp, noise2 } from './util.js';
import { mergeStatic, refsOf } from './merge.js';

const FUR = new THREE.Color('#c99c5c');
const FUR_DARK = new THREE.Color('#a87c44');
const BELLY = new THREE.Color('#ead7ae');
const FUR_LIGHT = new THREE.Color('#d8b47a');

// Prosedürel kürk dokusu: kısa, gövde boyunca akan tüy çizgileri (gri tonlu, köşe renkleriyle çarpılır)
let FUR_TEX = null;
export function furTexture() {
  if (FUR_TEX || typeof document === 'undefined') return FUR_TEX;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, N, N);
  let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = r() * N, y = r() * N, len = 6 + r() * 12, w = 0.8 + r() * 1.4, a = (r() - 0.5) * 0.35;
    const v = r() < 0.5 ? 255 : 196 + r() * 30;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.25 + r() * 0.35})`; g.lineWidth = w; g.lineCap = 'round';
    for (const ox of [0, -N, N]) for (const oy of [0, -N, N]) { // kenarlarda kesintisiz döşenir
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.sin(a) * len, y + oy + Math.cos(a) * len); g.stroke();
    }
  }
  FUR_TEX = new THREE.CanvasTexture(cv);
  FUR_TEX.wrapS = FUR_TEX.wrapT = THREE.RepeatWrapping; FUR_TEX.colorSpace = THREE.SRGBColorSpace; FUR_TEX.anisotropy = 4;
  return FUR_TEX;
}

// Kesitlerden gövde örme (loft): z ekseni boyunca elips kesitler, üst/alt yarıçapları ayrı.
// sec: [z, yMerkez, yarıGenişlik, üstYarıçap, altYarıçap]
export function loft(sec, opts = {}) {
  const R = opts.radial || 20, n = sec.length;
  const pos = [], col = [], uv = [], idx = [];
  const top = opts.top || FUR, bottom = opts.bottom || BELLY, c = new THREE.Color();
  // kesitler arası yumuşak geçiş için Catmull-Rom ile ara kesitler üret
  const sub = opts.sub || 3, S = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, p0 = sec[Math.max(0, i - 1)], p1 = sec[i], p2 = sec[i + 1], p3 = sec[Math.min(n - 1, i + 2)];
    S.push(p1.map((_, j) => { const a = p0[j], b = p1[j], cc = p2[j], d = p3[j]; return 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t); }));
  }
  S.push(sec[n - 1]);
  let vAcc = 0;
  S.forEach(([z, yc, rx, rt, rb], i) => {
    if (i) { const p = S[i - 1]; vAcc += Math.hypot(z - p[0], yc - p[1]); }
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2, sx = Math.sin(a), cy = Math.cos(a);
      const y = yc + cy * (cy > 0 ? rt : rb), x = sx * Math.max(rx, 1e-4);
      pos.push(x, y, z);
      const tt = clamp((0.25 - cy) * 0.85, 0, 1);
      c.copy(top).lerp(bottom, tt * tt);
      if (opts.spine) c.lerp(opts.spineCol || FUR_DARK, clamp(cy - 0.8, 0, 1) * 4);
      if (opts.spots) { const v = noise2(x * 18 + opts.spots, z * 14 + y * 9); if (v > 0.15 && cy > -0.3) c.multiplyScalar(0.8); }
      col.push(c.r, c.g, c.b);
      uv.push((j / R) * (opts.ru || 3), vAcc * (opts.rv || 4));
    }
  });
  const W = R + 1;
  for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < R; j++) {
    const a = i * W + j, b = a + W;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // dikiş yerindeki (j=0 ve j=R) normalleri eşitle
  const nr = g.attributes.normal;
  for (let i = 0; i < S.length; i++) {
    const a = i * W, b = a + R, v = new THREE.Vector3(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize();
    nr.setXYZ(a, v.x, v.y, v.z); nr.setXYZ(b, v.x, v.y, v.z);
  }
  // uç kapakları: ilk/son kesit merkezine doğru kapanır (yarıçaplar küçük verilir)
  return g;
}
// Bacak gibi aşağı uzanan parçalar: kesitler y ekseninde aşağı doğru; üst=ön, alt=arka
export const limb = (sec, opts) => loft(sec, { radial: 14, sub: 3, ...opts }).rotateX(Math.PI / 2);

// Renk geçişli (sırt koyu, karın açık) elipsoid
export function furSphere(sx, sy, sz, opts = {}) {
  const g = new THREE.SphereGeometry(1, 22, 16);
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const top = opts.top || FUR, bottom = opts.bottom || BELLY, c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = clamp((-y + (opts.bias || 0.15)) * 1.6, 0, 1);
    c.copy(top).lerp(bottom, t * t);
    if (opts.spine) { const s = clamp(y - 0.75, 0, 1) * 2.5; c.lerp(FUR_DARK, s); }
    if (opts.spots) {
      const v = noise2(x * 5 + opts.spots, z * 5 + y * 3);
      if (v > 0.12) c.multiplyScalar(0.78);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(sx, sy, sz);
  return g;
}

export class Feline {
  constructor({ scale = 1, cub = false } = {}) {
    this.cub = cub;
    this.root = new THREE.Group();
    this.inner = new THREE.Group(); this.root.add(this.inner);
    this.inner.scale.setScalar(scale);
    const ft = furTexture();
    const mat = this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, map: ft, bumpMap: ft, bumpScale: 0.8 });
    const plain = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra });
    const darkM = plain('#3b2a1c'), noseM = plain('#8d5b4d', { roughness: 0.5 }), muzzleM = plain('#f0e3c6');
    this.eyeM = new THREE.MeshStandardMaterial({ color: '#c99428', emissive: '#7a5410', emissiveIntensity: 0.4, roughness: 0.2 });
    const pupilM = new THREE.MeshBasicMaterial({ color: '#100c08' });
    const spots = cub ? 3.7 : 0;
    const mesh = (g, m = mat) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };

    const legLen = cub ? 0.8 : 1;
    this.baseH = 0.98 * legLen;
    const body = this.body = new THREE.Group(); body.position.y = this.baseH; this.inner.add(body);
    // gövde: tek parça örülmüş gövde (derin göğüs, içe çekik karın, yuvarlak kalça)
    this.torso = mesh(loft([
      [-0.8, 0.1, 0.01, 0.01, 0.01],
      [-0.76, 0.07, 0.12, 0.12, 0.14],
      [-0.64, 0.04, 0.19, 0.2, 0.22],
      [-0.46, 0.03, 0.21, 0.215, 0.23],
      [-0.24, 0.03, 0.185, 0.2, 0.15],
      [0.02, 0.02, 0.2, 0.21, 0.2],
      [0.28, 0.0, 0.215, 0.22, 0.28],
      [0.46, 0.03, 0.2, 0.22, 0.3],
      [0.6, 0.1, 0.15, 0.17, 0.22],
      [0.68, 0.14, 0.01, 0.01, 0.01],
    ], { spine: true, spots, radial: 22 }));
    body.add(this.torso);
    // omuz kürek kemikleri (dişi aslanın karakteristik siluetine)

    // boyun + kafa
    const neck = this.neck = new THREE.Group(); neck.position.set(0, 0.1, 0.56); body.add(neck);
    const neckM = mesh(loft([
      [-0.14, 0, 0.01, 0.01, 0.01], [-0.1, 0, 0.14, 0.15, 0.2], [0.1, 0, 0.13, 0.13, 0.17], [0.26, 0, 0.11, 0.11, 0.13], [0.36, 0, 0.085, 0.08, 0.09], [0.4, 0, 0.01, 0.01, 0.01],
    ], { spots, radial: 18 }).rotateX(-0.55)); neck.add(neckM);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.2, 0.33); neck.add(head);
    const hs = cub ? 1.7 : 1.28;
    head.scale.setScalar(hs);
    const skull = mesh(loft([
      [-0.15, 0.02, 0.02, 0.02, 0.02],
      [-0.12, 0.02, 0.09, 0.09, 0.09],
      [-0.05, 0.025, 0.13, 0.125, 0.12],
      [0.03, 0.01, 0.135, 0.11, 0.125],
      [0.1, -0.015, 0.095, 0.08, 0.1],
      [0.17, -0.035, 0.075, 0.06, 0.08],
      [0.23, -0.04, 0.06, 0.045, 0.06],
      [0.255, -0.04, 0.02, 0.02, 0.02],
    ], { spots, radial: 22, rv: 6 })); head.add(skull);
    const muzzle = mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.085, 0.07, 0.11), muzzleM); muzzle.position.set(0, -0.05, 0.16); head.add(muzzle);
    const bridge = mesh(furSphere(0.06, 0.05, 0.12, { bias: 0.6 })); bridge.position.set(0, 0.015, 0.15); head.add(bridge);
    const nose = mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.04, 0.025, 0.03), noseM); nose.position.set(0, -0.005, 0.255); head.add(nose);
    const jaw = this.jaw = new THREE.Group(); jaw.position.set(0, -0.09, 0.05); head.add(jaw);
    const chin = mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.065, 0.04, 0.1), muzzleM); chin.position.set(0, -0.01, 0.1); jaw.add(chin);
    const mouthIn = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.05, 0.02, 0.07), plain('#5a2424')); mouthIn.position.set(0, 0.015, 0.11); jaw.add(mouthIn);
    // gözler
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), this.eyeM); e.position.set(sx * 0.066, 0.03, 0.1); head.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.008, 0.017, 0.01), pupilM); p.position.set(sx * 0.068, 0.03, 0.124); head.add(p);
      const lid = mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.03, 0.018, 0.03)); lid.position.set(sx * 0.066, 0.04, 0.098); head.add(lid);
      const tear = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006), darkM); tear.position.set(sx * 0.055, -0.01, 0.125); tear.rotation.z = sx * 0.25; head.add(tear);
    }
    // kulaklar
    this.ears = [];
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(sx * 0.1, 0.12, -0.04); ear.rotation.z = -sx * 0.35; head.add(ear);
      const outer = mesh(furSphere(0.055, 0.065, 0.022, { bias: -1 })); outer.position.y = 0.04; ear.add(outer);
      const back = mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.05, 0.058, 0.012), darkM); back.position.set(0, 0.043, -0.012); ear.add(back);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.035, 0.045, 0.01), muzzleM); inner.position.set(0, 0.035, 0.013); ear.add(inner);
      this.ears.push(ear);
    }
    // bıyıklar
    const whiskM = new THREE.LineBasicMaterial({ color: '#f5efe0', transparent: true, opacity: 0.7 });
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i < 4; i++) { pts.push(new THREE.Vector3(sx * 0.05, -0.04 - i * 0.008, 0.2), new THREE.Vector3(sx * 0.2, -0.03 - i * 0.03, 0.16 - i * 0.01)); }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      head.add(new THREE.LineSegments(g, whiskM));
    }

    // bacaklar
    this.legs = [];
    const mkLeg = (x, z, front) => {
      const hip = new THREE.Group(); hip.position.set(x, front ? -0.06 : 0.0, z); body.add(hip);
      const ur = front ? 0.09 : 0.105, ul = 0.46 * legLen;
      const upper = mesh(limb(front
        ? [[-0.1, 0, 0.01, 0.01, 0.01], [-0.06, 0, 0.07, 0.08, 0.09], [0.04, 0.01, 0.088, 0.1, 0.11], [0.2, 0, 0.075, 0.085, 0.085], [ul * 0.78, 0, 0.058, 0.062, 0.062], [ul * 0.98, 0, 0.05, 0.052, 0.052], [ul * 1.02, 0, 0.01, 0.01, 0.01]]
        : [[-0.1, 0, 0.01, 0.01, 0.01], [-0.06, 0, 0.08, 0.11, 0.12], [0.06, -0.01, 0.1, 0.14, 0.15], [0.22, -0.01, 0.085, 0.11, 0.1], [ul * 0.78, -0.01, 0.06, 0.065, 0.06], [ul * 0.98, 0, 0.05, 0.05, 0.05], [ul * 1.02, 0, 0.01, 0.01, 0.01]],
      { spots, top: FUR, bottom: FUR_LIGHT })); hip.add(upper);
      const knee = new THREE.Group(); knee.position.y = -ul * 0.9; hip.add(knee);
      const ll = 0.42 * legLen;
      const lower = mesh(limb([[-0.06, 0, 0.01, 0.01, 0.01], [-0.03, 0, 0.056, 0.06, 0.066], [0.08, 0, 0.055, 0.058, 0.064], [ll * 0.6, 0, 0.045, 0.048, 0.05], [ll * 0.95, 0.005, 0.038, 0.042, 0.04], [ll * 1.02, 0, 0.01, 0.01, 0.01]], { top: FUR, bottom: FUR_LIGHT })); knee.add(lower);
      const ankle = new THREE.Group(); ankle.position.y = -ll * 0.9; knee.add(ankle);
      const paw = mesh(furSphere(0.068, 0.045, 0.095, { top: FUR_LIGHT, bottom: BELLY, bias: -0.2 })); paw.position.set(0, -0.005, 0.035);
      for (const tx of [-0.035, -0.012, 0.012, 0.035]) { const toe = mesh(furSphere(0.02, 0.022, 0.025, { top: FUR_LIGHT, bottom: BELLY })); toe.position.set(tx, -0.02, 0.115 - Math.abs(tx) * 0.5); ankle.add(toe); } ankle.add(paw);
      const leg = { hip, knee, ankle, front, side: Math.sign(x), ul, ll };
      this.legs.push(leg);
      return leg;
    };
    mkLeg(0.14, 0.44, true); mkLeg(-0.14, 0.44, true); mkLeg(0.13, -0.47, false); mkLeg(-0.13, -0.47, false);

    // kuyruk
    this.tail = [];
    let parent = body; const tailBase = new THREE.Group(); tailBase.position.set(0, 0.1, -0.74); body.add(tailBase); parent = tailBase;
    const segN = 9;
    for (let i = 0; i < segN; i++) {
      const seg = new THREE.Group(); if (i) seg.position.z = -0.1; parent.add(seg);
      const r = lerp(0.05, 0.028, i / segN);
      const m = mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.11, 7).rotateX(Math.PI / 2).translate(0, 0, -0.05), plain('#c3935a'));
      seg.add(m);
      this.tail.push(seg); parent = seg;
    }
    const tuft = mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.05, 0.05, 0.09), darkM); tuft.position.z = -0.1; parent.add(tuft);

    // durum
    this.phase = 0; this.t = Math.random() * 10;
    this.speed = 0; this.crouch = 0; this.drink = 0; this.lie = 0; this.dead = 0; this.pounce = 0; this.sleep = 0; this.roar = 0;
    this.headYaw = 0; this.tailSwish = 0; this.earFlick = 0; this.sedation = 0;
    mergeStatic(this.root, refsOf(this));
  }

  // st: {speed, crouch, drink, pounce, lie, dead, sleep, roar, look}
  animate(dt, st) {
    this.t += dt;
    const t = this.t;
    this.speed = damp(this.speed, st.speed || 0, 8, dt);
    for (const k of ['crouch', 'drink', 'lie', 'dead', 'sleep', 'pounce', 'roar']) this[k] = damp(this[k], st[k] || 0, k === 'pounce' ? 14 : 5, dt);
    const sp = this.speed;
    const run = clamp((sp - 5) / 4, 0, 1);
    const stride = lerp(1.35, 3.4, run) * (this.cub ? 0.55 : 1);
    this.phase = (this.phase + dt * sp / stride) % 1;
    const moving = clamp(sp / 1.5, 0, 1);
    const P = Math.PI * 2;
    const offsWalk = [0.25, 0.75, 0, 0.5], offsRun = [0.5, 0.6, 0, 0.1];
    const amp = lerp(0.42, 0.95, run) * moving;
    const cr = this.crouch, dr = this.drink, lie = Math.max(this.lie, this.sleep), dead = this.dead, po = this.pounce;

    this.legs.forEach((L, i) => {
      const off = lerp(offsWalk[i], offsRun[i], run);
      const ph = (this.phase + off) * P;
      const s = Math.sin(ph), c = Math.cos(ph);
      let hipR, kneeR, ankR;
      if (L.front) {
        hipR = -s * amp + 0.05;
        kneeR = Math.max(0, c) * lerp(0.9, 1.5, run) * moving - 0.05;
        ankR = -Math.max(0, c) * 0.6 * moving;
        hipR += cr * 0.55 + dr * 0.75; kneeR += -dr * 1.3; ankR += -cr * 0.5 + dr * 0.5;
        hipR = lerp(hipR, -1.45, lie); kneeR = lerp(kneeR, 0.2, lie); ankR = lerp(ankR, -0.1, lie);
        hipR = lerp(hipR, -1.1, po);
      } else {
        hipR = -s * amp * 0.95 - 0.2;
        kneeR = 0.45 + Math.max(0, c) * 0.5 * moving;
        ankR = -0.25 - Math.max(0, c) * 0.4 * moving;
        hipR += -cr * 0.75; kneeR += cr * 1.0; ankR += -cr * 0.25;
        hipR = lerp(hipR, -1.3, lie); kneeR = lerp(kneeR, 2.4, lie); ankR = lerp(ankR, -1.0, lie);
        hipR = lerp(hipR, 0.9, po); kneeR = lerp(kneeR, 0.1, po);
      }
      // ölü: bacaklar gevşek
      hipR = lerp(hipR, L.front ? -0.5 : 0.4, dead); kneeR = lerp(kneeR, 0.3, dead);
      L.hip.rotation.x = hipR; L.knee.rotation.x = kneeR; L.ankle.rotation.x = ankR;
    });

    // gövde
    const bob = Math.abs(Math.sin(this.phase * P * 2)) * lerp(0.025, 0.07, run) * moving;
    const breathe = Math.sin(t * (1.6 + run * 2)) * 0.012;
    this.body.position.y = this.baseH + bob - cr * 0.26 - dr * 0.1 - lie * 0.55 - dead * 0.5 + po * 0.05;
    this.body.rotation.x = Math.sin(this.phase * P) * 0.05 * run + dr * 0.12 - lie * 0.02;
    this.torso.scale.y = 1 + breathe * (1 + dead * -1);
    // ölüm: yana yatış
    this.inner.rotation.z = dead * 1.35;
    this.inner.position.y = -dead * 0.05;

    // boyun & kafa
    const look = st.look || 0;
    this.headYaw = damp(this.headYaw, clamp(look, -0.8, 0.8), 4, dt);
    this.neck.rotation.x = Math.sin(this.phase * P * 2) * 0.05 * moving + cr * 0.35 + dr * 1.05 + lie * 0.25 - run * 0.15 - this.roar * 0.4 + dead * 0.3;
    this.neck.rotation.y = this.headYaw * (1 - dr);
    this.head.rotation.x = -cr * 0.25 - dr * 0.2 - lie * 0.25 + this.roar * -0.3;
    this.head.rotation.z = Math.sin(t * 0.7) * 0.03 * (1 - moving) + this.sleep * 0.3;
    this.jaw.rotation.x = this.roar * 0.55 + (dr > 0.6 ? (Math.sin(t * 12) * 0.5 + 0.5) * 0.25 : 0);
    // kulak seğirmesi
    this.earFlick -= dt;
    if (this.earFlick < -3 - Math.random() * 4) this.earFlick = 0.25;
    this.ears.forEach((e, i) => { e.rotation.x = (this.earFlick > 0 && i === 0 ? -0.5 : 0) - cr * 0.6 - this.roar * 0.5; });
    // göz kapakları: uyku/ölüm
    this.eyeM.emissiveIntensity = st.night ? 1.4 : 0.25;

    // kuyruk
    const swish = Math.sin(t * (1.3 + run)) * (0.25 + (st.alert || 0) * 0.3);
    this.tail.forEach((seg, i) => {
      const k = i / this.tail.length;
      seg.rotation.x = i === 0 ? lerp(-1.25, -0.5, run) + cr * 0.4 + lie * 0.8 : 0.07 + k * 0.1 + run * 0.02;
      seg.rotation.y = Math.sin(t * 1.6 - i * 0.45) * 0.08 + swish * 0.12 * (1 - dead);
    });
  }
}
