// Oyun içi sinematikler: giriş, ölüm, yakalanma, villa sonu ve gerçek son
import * as THREE from '../lib/three.module.min.js';
import { height, VILLA, CAGE, DEN } from './world.js';
import { Feline } from './feline.js';
import { Human } from './characters.js';
import { clamp, lerp, smooth, damp } from './util.js';

const $ = (id) => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function pathPos(pts, k) {
  const seg = []; let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); tot += l; }
  let d = clamp(k, 0, 1) * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? clamp(d / seg[i], 0, 1) : 0;
      const a = pts[i], b = pts[i + 1];
      return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    d -= seg[i];
  }
  const p = pts[pts.length - 1]; return { x: p[0], z: p[1], yaw: 0 };
}

function titleCard(text, cls = 'big') { const t = $('titleCard'); t.className = cls; t.textContent = text; t.style.opacity = text ? 1 : 0; }

export class Director {
  constructor(G) { this.G = G; this.shots = null; this.idleT = 0; }
  play(shots, done) {
    const G = this.G;
    G.state = 'cine'; G.hideHud();
    $('cine').classList.remove('hidden');
    this.shots = shots; this.done = done; this.i = -1;
    this.next();
  }
  next() {
    const s0 = this.shots[this.i]; if (s0 && s0.end) s0.end();
    this.i++;
    if (this.i >= this.shots.length) return this.finish();
    const s = this.shots[this.i]; this.t = 0;
    if (s.start) s.start();
    this.G.say(s.text || '', s.dur - 0.3);
    titleCard(s.title || '', s.titleCls || 'big');
    $('fxBlack').style.opacity = s.black ? 1 : 0;
    $('fxCctv').style.opacity = s.cctv ? 1 : 0;
    $('app').style.filter = s.cctv ? 'grayscale(1) contrast(1.25) brightness(1.15)' : '';
  }
  update(dt) {
    if (!this.shots) return;
    const s = this.shots[this.i]; if (!s) return;
    this.t += dt;
    const k = clamp(this.t / s.dur, 0, 1);
    if (s.update) s.update(k, dt, this.t);
    if (s.cam) { const c = s.cam(k); this.G.camera.position.copy(c.p); this.G.camera.lookAt(c.l); }
    if (this.t >= s.dur) this.next();
  }
  skip() {
    if (!this.shots) return;
    for (let i = Math.max(0, this.i); i < this.shots.length; i++) { const s = this.shots[i]; if (i > this.i && s.start) s.start(); if (s.end) s.end(); }
    this.i = this.shots.length; this.finish();
  }
  finish() {
    $('cine').classList.add('hidden'); titleCard('');
    $('fxBlack').style.opacity = 0; $('fxCctv').style.opacity = 0; $('app').style.filter = '';
    this.G.say('', 0);
    const d = this.done; this.shots = null; this.done = null;
    if (d) d();
  }
  menuCam() { this.idleT = 0; }
  // Menü / son ekranı arka planı: villa ve kafes, gece
  idle(dt) {
    const G = this.G; this.idleT += dt;
    if (G.state === 'menu') {
      const L = G.L, t = this.idleT;
      const x = CAGE.x + Math.sin(t * 0.6) * 2.4;
      L.x = x; L.z = CAGE.z; L.yaw = Math.cos(t * 0.6) > 0 ? Math.PI / 2 : -Math.PI / 2;
      G.syncLion(dt, { speed: Math.abs(Math.cos(t * 0.6)) * 1.5 + 0.3, night: true });
      const a = t * 0.05;
      G.camera.position.set(CAGE.x + Math.cos(a) * 14, G.world.villaY + 5, CAGE.z + Math.sin(a) * 14 + 4);
      G.camera.lookAt(CAGE.x, G.world.villaY + 1, CAGE.z);
    }
  }
}

// ---------- Yardımcılar ----------
function makeCubs(G, ghost) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const c = new Feline({ scale: i ? 0.4 : 0.43, cub: true });
    c.root.rotation.order = 'YXZ';
    c.root.traverse((o) => {
      if (!o.material) return;
      o.castShadow = !ghost;
      if (ghost) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0; o.material.depthWrite = false; if (o.material.emissive) { o.material.emissive.set('#ffd9a0'); o.material.emissiveIntensity = 0.5; } }
    });
    G.scene.add(c.root); G.cubs.push(c);
    out.push(c);
  }
  return out;
}
function cubOpacity(c, v) { c.root.traverse((o) => { if (o.material && o.material.transparent) o.material.opacity = v; }); }
function placeF(f, x, z, yaw, yOff = 0) { f.root.position.set(x, height(x, z) + yOff, z); f.root.rotation.y = yaw; }

let zoo = null;
function buildZoo(G) {
  if (zoo) return zoo;
  const Z = { x: 0, z: 2600 }; const y = height(Z.x, Z.z);
  const g = new THREE.Group(); g.position.set(Z.x, y, Z.z); G.scene.add(g);
  const conc = new THREE.MeshStandardMaterial({ color: '#9a978f', roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), conc); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), new THREE.MeshStandardMaterial({ color: '#7d7a4a', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.03, -4); g.add(grass);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 1), new THREE.MeshStandardMaterial({ color: '#b5a68a', roughness: 1 })); wall.position.set(0, 3, -10.5); g.add(wall);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 12), wall.material); w.position.set(sx * 10, 3, -4.5); g.add(w); }
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), new THREE.MeshStandardMaterial({ color: '#8a8378', flatShading: true })); rock.position.set(-5, 1, -7); g.add(rock);
  const barM = new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.7, roughness: 0.4 });
  for (let x = -10; x <= 10; x += 0.5) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 5), barM); b.position.set(x, 2, 1.5); g.add(b); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.1), barM); rail.position.set(0, 4, 1.5); g.add(rail);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: '#2f5a33' })); sign.position.set(6, 2.2, 2.2); g.add(sign);
  const visitors = [];
  for (let i = 0; i < 7; i++) {
    const h = new Human('civil', 500 + i * 31);
    h.root.position.set(-7 + i * 2.2 + (i % 2) * 0.4, 0, 4 + (i % 3) * 0.8); h.root.rotation.y = Math.PI;
    g.add(h.root); visitors.push(h);
  }
  zoo = { g, Z, y, visitors };
  return zoo;
}

// ---------- Çekim listeleri ----------
export function buildShots(G, kind, cause) {
  const L = G.L, w = G.world, V = VILLA, vy = w.villaY, au = G.audio;
  const lionAt = (x, z, yaw, st, dt) => { L.x = x; L.z = z; L.yaw = yaw; G.syncLion(dt, { night: G.night > 0.5, ...st }); };

  if (kind === 'intro') {
    const C = CAGE;
    const escape = [[C.x - 1.5, C.z], [C.x - 6.5, C.z], [V.x - 20, V.z + 14], [V.x - 28, V.z + 2], [V.x - 42, V.z + 2]];
    let door = 0;
    return [
      { dur: 4.2, black: true, title: '22 Kasım, akşam\nSarıyer · Uskumruköy', titleCls: 'small',
        start() { G.clock = 19.6; w.setCageDoor(0); lionAt(C.x, C.z, Math.PI / 2, {}, 0.016); au.tenseTheme(); },
        cam: () => ({ p: V3(V.x + 60, vy + 40, V.z + 60), l: V3(V.x, vy, V.z) }) },
      { dur: 5.5, text: 'Uskumruköy\'deki bu villa, bildiği tek dünyaydı.',
        update(k, dt, t) { const x = C.x + Math.sin(t * 0.7) * 2.4; lionAt(x, C.z, Math.cos(t * 0.7) > 0 ? Math.PI / 2 : -Math.PI / 2, { speed: 2 }, dt); },
        cam: (k) => ({ p: V3(V.x + lerp(70, 38, smooth(k)), vy + lerp(42, 20, smooth(k)), V.z + lerp(55, 40, smooth(k))), l: V3(V.x, vy + 2, V.z + 4) }) },
      { dur: 5.5, text: 'Ona yemek veren eller… Ailesi olduklarını sanıyordu.',
        update(k, dt, t) { const x = C.x + Math.sin(t * 0.7 + 2) * 2.4; lionAt(x, C.z, Math.cos(t * 0.7 + 2) > 0 ? Math.PI / 2 : -Math.PI / 2, { speed: 2.2 }, dt); },
        cam: (k) => ({ p: V3(C.x - 2 + k * 3, vy + 1.6, C.z + 6.5), l: V3(L.x, vy + 0.9, L.z) }) },
      { dur: 5.5, text: 'Ama her gece ormandan gelen sesler ona başka bir şey fısıldıyordu.',
        start() { au.cubMew(); },
        update(k, dt) { lionAt(C.x - 2.2, C.z + 0.5, -Math.PI / 2, { lie: 1, look: Math.sin(k * 3) * 0.3 }, dt); },
        cam: (k) => ({ p: V3(C.x - 3.6 + k * 0.4, vy + 0.85, C.z + 2.4), l: V3(C.x - 2.6, vy + 0.6, C.z + 0.4) }) },
      { dur: 4.5, text: 'O gece kafesin kapısı açık kaldı.',
        start() { au.burst(2.5, { freq: 300, q: 0.5, vol: 0.25, type: 'lowpass' }); setTimeout(() => au.tone(180, 0.6, { type: 'triangle', vol: 0.1, slide: -40 }), 1300); },
        update(k, dt) { door = smooth(clamp((k - 0.25) / 0.6, 0, 1)); w.setCageDoor(door); lionAt(C.x - 2.2, C.z + 0.5, -Math.PI / 2, { lie: k < 0.7 ? 1 : 0, look: 0.2 }, dt); },
        cam: () => ({ p: V3(C.x - 7, vy + 1.7, C.z + 3.5), l: V3(C.x - 4, vy + 1.3, C.z) }) },
      { dur: 7, cctv: true,
        start() { $('cctvStamp').textContent = 'CAM-02 · 22.11.2026 · 19:47:12'; },
        update(k, dt, t) { const p = pathPos(escape, smooth(k)); lionAt(p.x, p.z, p.yaw, { speed: 4 }, dt); $('cctvStamp').textContent = `CAM-02 · 22.11.2026 · 19:47:${String(12 + Math.floor(t)).padStart(2, '0')}`; },
        cam: () => ({ p: V3(V.x - 27, vy + 4, V.z - 4), l: V3(V.x - 16, vy, V.z + 8) }) },
      { dur: 5.5, text: '"Büyük bir karaltı ormana doğru kaçtı." — Görgü tanığı',
        update(k, dt) { lionAt(V.x - 42 - k * 3, V.z + 2, -Math.PI / 2, { speed: k < 0.6 ? 1.2 : 0, look: k > 0.6 ? 0.6 : 0 }, dt); },
        cam: (k) => ({ p: V3(V.x - 36 + k * 2, vy + 1.3, V.z + 6), l: V3(V.x - 60, vy + 2, V.z) }) },
      { dur: 5, text: 'Ormanda bir yerde… onu bekleyen biri vardı.',
        start() { au.cubMew(); },
        update(k, dt) { lionAt(V.x - 45, V.z + 2, -Math.PI / 2, { look: -0.3 + k * 0.3 }, dt); },
        cam: (k) => ({ p: V3(V.x - 40 + k * 6, vy + 2 + k * 14, V.z + 4 + k * 8), l: V3(V.x - 120, vy + 4, V.z - 10) }) },
      { dur: 3.5, title: 'SARIYER ASLANI', titleCls: 'big',
        cam: () => ({ p: V3(V.x - 34, vy + 16, V.z + 12), l: V3(V.x - 120, vy + 4, V.z - 10) }),
        start() { au.roar(); } },
    ];
  }

  // Sonlar için ortak başlangıç durumu
  const sx = L.x, sz = L.z, syaw = L.yaw;
  const ly = () => height(L.x, L.z);

  if (kind === 'death') {
    let cubs = [];
    const fx = Math.sin(syaw), fz = Math.cos(syaw);
    return [
      { dur: 4.5, text: cause === 'shot' ? 'Bir silah sesi… ve orman sustu.' : 'Bedeni daha fazla dayanamadı.',
        start() { au.sadTheme(); if (cause === 'shot') au.gunshot(); },
        update(k, dt) { lionAt(sx, sz, syaw, { dead: smooth(clamp(k * 1.6, 0, 1)) }, dt); },
        cam: (k) => { const a = syaw + 1.2 + k * 0.6; return { p: V3(sx + Math.sin(a) * (5 - k * 1.5), ly() + 1.2 + (1 - k) * 1.5, sz + Math.cos(a) * (5 - k * 1.5)), l: V3(sx, ly() + 0.4, sz) }; } },
      { dur: 7, text: 'Son nefesinde onları gördü… Yavrularını.',
        start() { cubs = makeCubs(G, true); au.cubMew(); $('fxMirage').style.opacity = 1; },
        update(k, dt, t) {
          lionAt(sx, sz, syaw, { dead: 1 }, dt);
          cubs.forEach((c, i) => {
            const d = lerp(9, 1.8, smooth(clamp(k * 1.3, 0, 1)));
            const side = i ? 0.9 : -0.9;
            const x = sx + fx * d + fz * side, z = sz + fz * d - fx * side;
            placeF(c, x, z, syaw + Math.PI);
            c.animate(dt, { speed: k < 0.75 ? 1.6 : 0, drink: k > 0.8 ? 0.6 : 0 });
            cubOpacity(c, Math.min(0.8, k * 2) * (k > 0.9 ? (1 - k) * 10 : 1));
          });
        },
        cam: (k) => ({ p: V3(sx - fx * 1.2 + fz * 1.6, ly() + 0.7, sz - fz * 1.2 - fx * 1.6), l: V3(sx + fx * 4, ly() + 0.5, sz + fz * 4) }),
        end() { $('fxMirage').style.opacity = 0; } },
      { dur: 4, black: true, title: 'Sarıyer Aslanı hayatını kaybetti.', titleCls: 'small', cam: () => ({ p: G.camera.position.clone(), l: V3(sx, ly(), sz) }) },
    ];
  }

  if (kind === 'capture') {
    return [
      { dur: 4.5, text: 'Gözleri ağırlaştı… Dünya bulanıklaştı.',
        start() { au.tenseTheme(); $('fxSedate').style.opacity = 1; },
        update(k, dt) { lionAt(sx, sz, syaw, { sleep: smooth(clamp(k * 1.4, 0, 1)) }, dt); },
        cam: (k) => ({ p: V3(sx + Math.sin(syaw + 0.9) * (3.5 - k), ly() + 0.8, sz + Math.cos(syaw + 0.9) * (3.5 - k)), l: V3(sx, ly() + 0.5, sz) }),
        end() { $('fxSedate').style.opacity = 0; } },
      { dur: 3, black: true, title: 'Birkaç gün sonra…', titleCls: 'small', start() { G.clock = 13; }, cam: () => ({ p: G.camera.position.clone(), l: V3(sx, ly(), sz) }) },
      { dur: 8, text: 'Bir hayvanat bahçesine gönderildi. Ormanın sesi artık çok uzaktaydı.',
        start() { const z = buildZoo(G); z.g.visible = true; au.sadTheme(); L.x = z.Z.x; L.z = z.Z.z - 4; },
        update(k, dt, t) {
          const z = zoo; L.x = z.Z.x - 2; L.z = z.Z.z - 5;
          L.f.root.position.set(L.x, z.y, L.z); L.f.root.rotation.set(0, 0.4, 0);
          L.f.animate(dt, { lie: 1, look: Math.sin(t * 0.3) * 0.4 });
          z.visitors.forEach((v, i) => { const fl = ((t + i * 0.37) % 1.4) < 0.08; v.animate(dt, { photo: i % 3 !== 1 ? 1 : 0, flash: fl && i % 3 !== 1 }); });
          if (Math.random() < dt * 1.5) au.shutter();
        },
        cam: (k) => ({ p: V3(zoo.Z.x - 3.2 + k * 0.6, zoo.y + 1.25, zoo.Z.z - 8.2 + k * 0.5), l: V3(zoo.Z.x + 0.5, zoo.y + 1.5, zoo.Z.z + 4) }),
        end() { if (zoo) zoo.g.visible = false; } },
    ];
  }

  if (kind === 'villa') {
    const C = CAGE;
    const path = [[sx, sz], [C.x - 6.5, C.z], [C.x - 1, C.z]];
    return [
      { dur: 5.5, text: 'Tanıdık kokular… tanıdık parmaklıklar.',
        start() { au.sadTheme(); w.setCageDoor(1); },
        update(k, dt) { const p = pathPos(path, smooth(k)); lionAt(p.x, p.z, p.yaw, { speed: k < 0.95 ? 3 : 0 }, dt); },
        cam: (k) => ({ p: V3(C.x - 12, vy + 4, C.z + 10), l: V3(L.x, vy + 1, L.z) }) },
      { dur: 5.5, text: 'Tanıdık olana döndü…',
        update(k, dt) { lionAt(C.x - 0.5, C.z, -Math.PI / 2, { lie: 1 }, dt); w.setCageDoor(1 - smooth(clamp((k - 0.3) / 0.5, 0, 1))); if (k > 0.8 && !this.clank) { this.clank = 1; au.tone(160, 0.5, { type: 'square', vol: 0.12, slide: -60 }); } },
        cam: () => ({ p: V3(C.x - 6.5, vy + 1.5, C.z + 2.5), l: V3(C.x - 1, vy + 0.7, C.z) }) },
      { dur: 7, text: 'Ama ormanın derinliklerinde iki küçük ses onu çağırmaya devam etti.',
        start() { au.cubMew(); setTimeout(() => au.cubMew(), 2200); },
        update(k, dt) { lionAt(C.x - 0.5, C.z, -Math.PI / 2, { lie: 1, look: -0.5 }, dt); },
        cam: (k) => ({ p: V3(C.x - 4 - k * 20, vy + 2 + k * 40, C.z + 3 + k * 10), l: V3(C.x - 60 - k * 200, vy, C.z - k * 60) }) },
      { dur: 3.5, black: true, title: 'NORMAL SON', titleCls: 'big', cam: () => ({ p: G.camera.position.clone(), l: V3(DEN.x, 0, DEN.z) }) },
    ];
  }

  if (kind === 'true') {
    let cubs = [];
    const mouth = [DEN.x + 2.5, DEN.z];
    const path = [[sx, sz], [DEN.x + 6, DEN.z], [mouth[0] + 1.5, mouth[1]]];
    return [
      { dur: 5, text: 'Bu koku… Burası.',
        start() { au.hopeTheme(); },
        update(k, dt) { const p = pathPos(path, smooth(k)); lionAt(p.x, p.z, p.yaw, { speed: k < 0.95 ? 2.5 : 0 }, dt); },
        cam: (k) => ({ p: V3(DEN.x + 16, w.denY + 4, DEN.z + 9), l: V3(L.x, w.denY + 1, L.z) }) },
      { dur: 7, text: 'Hayali sandığı aile… aslında hep buradaydı.',
        start() { cubs = makeCubs(G, false); au.cubMew(); setTimeout(() => au.cubMew(), 900); },
        update(k, dt, t) {
          lionAt(mouth[0] + 1.5, mouth[1], -Math.PI / 2, { drink: k > 0.45 ? 0.7 : 0, look: Math.sin(t) * 0.2 }, dt);
          cubs.forEach((c, i) => {
            const kk = smooth(clamp(k * 1.5 - i * 0.15, 0, 1));
            const x = lerp(DEN.x - 1, mouth[0] - 0.4, kk), z = DEN.z + (i ? 0.6 : -0.6) * kk;
            placeF(c, x, z, Math.PI / 2, Math.abs(Math.sin(t * 6 + i)) * 0.1 * (kk > 0.95 ? 1 : 0));
            c.animate(dt, { speed: kk < 0.98 ? 2 : 0.3, look: Math.sin(t * 2 + i) * 0.4 });
          });
        },
        cam: (k) => ({ p: V3(mouth[0] + 1, w.denY + 1.1, mouth[1] + 4.5 - k), l: V3(mouth[0], w.denY + 0.6, mouth[1]) }) },
      { dur: 7.5, text: 'Sarıyer Aslanı, gerçek ailesine kavuştu.',
        start() { G.clock = 6.4; },
        update(k, dt, t) {
          lionAt(mouth[0] + 1.5, mouth[1], -Math.PI / 2, { lie: 1, look: 0.3 }, dt);
          cubs.forEach((c, i) => { placeF(c, mouth[0] + 1.2 + (i ? 0.9 : -0.2), mouth[1] + (i ? 0.9 : -0.9), i ? -2.4 : -0.6); c.animate(dt, { lie: 1, look: Math.sin(t + i) * 0.3 }); });
        },
        cam: (k) => ({ p: V3(mouth[0] + 4 + k * 12, w.denY + 1.5 + k * 16, mouth[1] + 4 + k * 12), l: V3(mouth[0] + 1.5, w.denY + 0.4, mouth[1]) }) },
      { dur: 4, black: true, title: 'GERÇEK SON', titleCls: 'big', cam: () => ({ p: G.camera.position.clone(), l: V3(DEN.x, 0, DEN.z) }) },
    ];
  }
  return [];
}
