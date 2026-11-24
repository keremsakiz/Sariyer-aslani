// Sarıyer Aslanı — ana oyun
import * as THREE from 'three';
import { World, height, waterDepth, waterLevel, PLACES, VILLA, CAGE, DEN, LAKES, HALF, roadDist, WATER_Y } from './world.js';
import { Feline } from './feline.js';
import { Human, Prey, PREY_TYPES } from './characters.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { clamp, lerp, damp, angleLerp, mulberry32, smooth } from './util.js';
import { Director, buildShots } from './cinema.js';
import { loadPeople, makePerson } from './people.js';
import { Post } from './post.js';
import { loadNature, natureMats } from './nature.js';
import { loadAnimals, AnimalPrey, ANIMALS } from './animals.js';
import { Rabbit, Boar } from './critters.js';
import { Minimap, coordText } from './minimap.js';
import { SettingsUI } from './settings.js';
import { Mirage } from './mirage.js';

export const TRUE_SCORE = 600;
const $ = (id) => document.getElementById(id);
const rnd = Math.random;

// ---------- Render temel ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const DPR = window.devicePixelRatio || 1;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
renderer.setPixelRatio(Math.min(DPR, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#0c1424', 0.007);
scene.background = new THREE.Color('#0c1424');
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2600);
const hemi = new THREE.HemisphereLight('#5a6f9a', '#1a1a14', 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight('#9fb3e8', 0.8);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 200 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const post = new Post(renderer);

// ---------- Uyarlanabilir kalite (iPhone/iPad öncelikli) ----------
// pr: çözünürlük çarpanı, post: bloom+renk, view: ağaç/ev çizim mesafesi, npc: insan/hayvan görünme mesafesi
const Q = [
  { pr: 2, post: true, shadows: true, view: 430, npc: 150, near: 50 },
  { pr: 1.6, post: true, shadows: true, view: 360, npc: 130, near: 40 },
  { pr: 1.3, post: false, shadows: true, view: 300, npc: 115, near: 32 },
  { pr: 1.0, post: false, shadows: false, view: 240, npc: 95, near: 26 },
];
const qParam = new URLSearchParams(location.search).get('q');
let qLevel = qParam !== null ? clamp(+qParam, 0, Q.length - 1) : IOS ? 1 : 0;
let autoQ = qLevel;   // otomatik modda başlangıç seviyesi
let fpsT = 0, fpsN = 0, fpsWarm = 0;
const fpsM = { n: 0, t: 0, last: 0 };   // ekrandaki FPS göstergesi
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
}
function applyQuality() {
  const q = G.Q = Q[qLevel];
  renderer.setPixelRatio(Math.min(DPR, q.pr));
  sun.castShadow = q.shadows;
  post.enabled = post.supported && q.post;
  resize();
}
function adaptQuality(dt) {
  if (qParam !== null || window.__noAdapt || SET.quality >= 0) return;
  if ((fpsWarm += dt) < 4) return; // yüklemeden sonraki ilk saniyeleri sayma
  fpsT += dt; fpsN++;
  if (fpsT > 3) {
    const fps = fpsN / fpsT;
    if (fps < 45 && qLevel < Q.length - 1) { qLevel++; applyQuality(); fpsWarm = 2; }
    fpsT = 0; fpsN = 0;
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

// ---------- Ayarlar (erişilebilirlik) ----------
const SET = {
  shake: 1, haptics: 1, calm: 0,                       // his / erişilebilirlik
  quality: -1, fps: 0, mapSize: 1,                     // görüntü (-1 = otomatik)
  vol: 0.8, sfx: 1, amb: 1,                            // ses
  sens: 1, invY: 0, lefty: 0, runToggle: 0,            // kontroller
  diff: 'normal', needs: 1, speed: 1, sight: 1, aim: 1, heli: 1, search: 1,   // zorluk
};
// zorluk hazır ayarları: her değer Normal'e göre çarpan (heli 0 = helikopter yok)
const DIFFS = {
  kolay: { needs: 0.7, speed: 0.85, sight: 0.7, aim: 0.6, heli: 0.5, search: 0.7 },
  normal: { needs: 1, speed: 1, sight: 1, aim: 1, heli: 1, search: 1 },
  zor: { needs: 1.3, speed: 1.12, sight: 1.3, aim: 1.3, heli: 1.5, search: 1.4 },
};
try { Object.assign(SET, JSON.parse(localStorage.getItem('sa_settings') || '{}')); } catch (e) { /* gizli mod */ }
function saveSet() { try { localStorage.setItem('sa_settings', JSON.stringify(SET)); } catch (e) { /* yok say */ } }

const input = new Input(SET);
const audio = new Audio(SET);
export const G = {
  state: 'menu', time: 0, clock: 19.75, score: 0, world: null, scene, camera, audio, input,
  S: null, L: null, humans: [], prey: [], A: null, cubs: [], mirage: null,
  visited: new Set(), flags: {}, ending: null, Q: null,
};
if (qParam === null && SET.quality >= 0) qLevel = clamp(SET.quality, 0, Q.length - 1);
applyQuality(); G.SET = SET; G.renderer = renderer; G.post = post; G.setQuality = (l) => { qLevel = l; applyQuality(); };
window.__G = G;

// ---------- UI yardımcıları ----------
function toast(text, cls = '', src = '') {
  const box = $('toasts');
  const el = document.createElement('div'); el.className = 'toast ' + cls;
  el.innerHTML = (src ? `<span class="src">${src}</span>` : '') + text;
  box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; setTimeout(() => el.remove(), 700); }, 6500);
}
let subT = 0;
export function say(text, dur = 4) { const s = $('subtitle'); s.textContent = text; s.style.opacity = text ? 1 : 0; subT = dur; }
let hintT = 0;
function hint(text, dur = 4) { const h = $('hint'); h.textContent = text; h.style.opacity = 1; hintT = dur; }
function tip(key, text) { if (G.flags['tip_' + key]) return; G.flags['tip_' + key] = 1; toast(text, 'green', 'İPUCU'); }
G.toast = toast; G.say = say; G.hint = hint;

// ---------- Dünya ve karakterler ----------
let world, L, S, A, heli, drone, director;

function makeLion() {
  const f = new Feline();
  f.root.rotation.order = 'YXZ';
  f.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(f.root);
  return { f, x: 0, z: 0, y: 0, yaw: 0, speed: 0, mode: 'free', modeT: 0, jumpY: 0, roarCD: 0, hurtT: 0, swim: false, anim: {}, leftVilla: false, target: null };
}

function placeLion(x, z, yaw) { L.x = x; L.z = z; L.yaw = yaw; L.y = height(x, z); }

const _focus = new THREE.Vector3();
function syncLion(dt, st) {
  const swimD = waterDepth(L.x, L.z);
  L.swim = swimD > 0.55;
  let y = Math.max(height(L.x, L.z), L.swim ? waterLevel(L.x, L.z) - 0.72 : -99);
  L.y = damp(L.y, y, 18, dt);
  const f = L.f;
  f.root.position.set(L.x, L.y + L.jumpY, L.z);
  // eğim
  const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
  const pitch = L.swim ? 0 : Math.atan2(height(L.x - fx * 0.8, L.z - fz * 0.8) - height(L.x + fx * 0.8, L.z + fz * 0.8), 1.6);
  f.root.rotation.set(clamp(pitch, -0.4, 0.4), L.yaw, 0);
  f.animate(dt, st);
}

function spawnHuman(type, x, z, extra = {}) {
  const h = makePerson(type, Math.floor(rnd() * 1e6));
  h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(h.root);
  // gece el feneri
  if (type !== 'civil') {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.x = -Math.PI / 2 - 0.12; beam.position.set(0.2, 1.3, 7.2); h.root.add(beam); h.beam = beam;
  }
  const n = { h, type, x, z, y: height(x, z), yaw: rnd() * 6.28, home: { x, z }, state: 'wander', t: 0, target: null, wait: rnd() * 3, done: false, shootCD: 1 + rnd(), stun: 0, ...extra };
  G.humans.push(n);
  return n;
}

function spawnPrey(kind, x, z) {
  const p = kind === 'karaca' && ANIMALS.deer ? new AnimalPrey(kind, 1.45) : kind === 'tavsan' ? new Rabbit() : kind === 'domuz' ? new Boar() : new Prey(kind);
  scene.add(p.root);
  const n = { p, kind, P: PREY_TYPES[kind], x, z, y: height(x, z), yaw: rnd() * 6.28, state: 'graze', t: rnd() * 4, hp: PREY_TYPES[kind].hp, target: null, cd: 0 };
  G.prey.push(n);
  return n;
}

function randomLand(minFromLion = 0, tries = 60, filter = null) {
  for (let i = 0; i < tries; i++) {
    const x = (rnd() - 0.5) * (HALF * 2 - 80), z = (rnd() - 0.5) * (HALF * 2 - 80);
    if (waterDepth(x, z) > -2) continue;
    if (L && Math.hypot(x - L.x, z - L.z) < minFromLion) continue;
    if (filter && !filter(x, z)) continue;
    return { x, z };
  }
  return { x: 0, z: 0 };
}

function populate() {
  // siviller: köyler + patikalar + plaj
  for (const p of PLACES) for (let i = 0; i < 3; i++) { const a = rnd() * 6.28, d = rnd() * p.r * 0.8; spawnHuman('civil', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d); }
  for (const [x, z] of [[-420, 200], [-540, -160], [-300, -460], [-200, 150], [120, 140], [430, 70], [-450, 110], [60, -560]]) spawnHuman('civil', x + rnd() * 10, z + rnd() * 10, { roam: 40 });
  // av hayvanları
  const notVillage = (x, z) => PLACES.every((p) => Math.hypot(x - p.x, z - p.z) > p.r + 50) && Math.hypot(x - VILLA.x, z - VILLA.z) > 90 && roadDist(x, z) > 15;
  for (let i = 0; i < 22; i++) { const q = randomLand(0, 80, notVillage); spawnPrey('tavsan', q.x, q.z); }
  for (let i = 0; i < 14; i++) { const q = randomLand(0, 80, notVillage); spawnPrey('karaca', q.x, q.z); }
  for (let i = 0; i < 9; i++) { const q = randomLand(0, 80, (x, z) => notVillage(x, z) && x < 0); spawnPrey('domuz', q.x, q.z); }
  // villanın yakınında birkaç tavşan (ilk av)
  for (let i = 0; i < 3; i++) spawnPrey('tavsan', VILLA.x - 70 - rnd() * 30, VILLA.z + (rnd() - 0.5) * 60);
}

// ---------- Helikopter ve drone ----------
function makeHeli() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#c9c9c4', roughness: 0.5, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: '#b52a22', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(1.4, 1.2, 2.4), m); g.add(body);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(1.42, 0.3, 2.42), red); stripe.position.y = -0.2; g.add(stripe);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10).scale(1.1, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: '#223', roughness: 0.1, metalness: 0.6 })); glass.position.set(0, 0.2, 1.4); g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 5, 8).rotateX(Math.PI / 2), m); boom.position.set(0, 0.3, -3.8); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.8), red); fin.position.set(0, 0.9, -6.1); g.add(fin);
  const rotor = new THREE.Group(); rotor.position.y = 1.5; g.add(rotor);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 11), new THREE.MeshStandardMaterial({ color: '#222' })); b.rotation.y = i * Math.PI / 4 * 2; rotor.add(b); }
  const skids = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 3.5), new THREE.MeshStandardMaterial({ color: '#333' })); skids.position.y = -1.4; g.add(skids);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff2020' })); blink.position.set(0, -1.1, 0); g.add(blink);
  // projektör
  const spot = new THREE.SpotLight('#fff5d8', 60, 160, 0.2, 0.5, 0);
  g.add(spot); scene.add(spot.target);
  const coneM = new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true), coneM); scene.add(cone);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  disc.rotation.x = -Math.PI / 2; scene.add(disc);
  scene.add(g);
  const H = { g, rotor, spot, cone, disc, blink, active: false, x: 700, z: 700, y: 80, yaw: 0, ang: 0, sx: 0, sz: 0, R: 13, leaving: false };
  g.visible = false; cone.visible = false; disc.visible = false; spot.visible = false;
  return H;
}
function makeDrone() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), m));
  const props = [];
  for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.7), m); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 12), new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.4 })); p.position.set(x, 0.08, z); g.add(p); props.push(p);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3030' })); led.position.y = -0.12; g.add(led);
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 15, 40), new THREE.MeshBasicMaterial({ color: '#ff5050', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  scene.add(g); g.visible = false; ring.visible = false;
  return { g, led, ring, active: false, x: 0, z: 0, y: 30, ang: 0, R: 15 };
}

// ---------- Alarm sistemi ----------
function newAlert() { return { level: 0, x: 0, z: 0, lastSpot: -999, lastReport: -999, armed: false, pending: [], everAlert: false, droneOn: false }; }

function report(x, z, level, msg, delay = 0, opts = {}) {
  A.pending.push({ t: G.time + delay, x, z, level, msg, ...opts });
}

function processReports() {
  for (let i = A.pending.length - 1; i >= 0; i--) {
    const r = A.pending[i];
    if (G.time < r.t) continue;
    A.pending.splice(i, 1);
    A.level = Math.max(A.level, r.level);
    A.x = r.x + (rnd() - 0.5) * 20; A.z = r.z + (rnd() - 0.5) * 20; A.lastReport = G.time;
    if (r.level >= 2) A.armed = true;
    if (r.drone) A.droneOn = true;
    if (r.msg) toast(r.msg, r.level >= 2 ? 'red' : 'blue', r.src || 'HABER');
    if (!A.everAlert) { A.everAlert = true; audio.alarm(); }
    dispatch();
  }
}

function spawnPointNear(x, z, d) {
  let best = null, bs = 1e9;
  for (let i = 0; i < 24; i++) {
    const a = rnd() * 6.28, px = clamp(x + Math.cos(a) * d, -HALF + 30, HALF - 30), pz = clamp(z + Math.sin(a) * d, -HALF + 30, HALF - 30);
    if (height(px, pz) < 1.5) continue;
    if (Math.hypot(px - L.x, pz - L.z) < 70) continue;
    const s = roadDist(px, pz); if (s < bs) { bs = s; best = { x: px, z: pz }; }
  }
  return best || { x: x + d, z };
}

function dispatch() {
  const resp = G.humans.filter((h) => h.type !== 'civil' && h.state !== 'gone');
  const vets = resp.filter((h) => h.type === 'vet').length, jand = resp.filter((h) => h.type === 'jandarma').length, pol = resp.filter((h) => h.type === 'polis').length;
  const team = [];
  if (A.level >= 1) { for (let i = vets; i < 2; i++) team.push('vet'); for (let i = jand; i < 2; i++) team.push('jandarma'); }
  if (A.level >= 2) for (let i = pol; i < 3; i++) team.push('polis');
  if (team.length) {
    const sp = spawnPointNear(A.x, A.z, 130);
    team.forEach((t, i) => spawnHuman(t, sp.x + i * 2, sp.z + (i % 2) * 2, { state: 'travel', responder: true }));
    toast(A.level >= 2 ? '🚓 Polis ve jandarma bölgeye ulaşıyor.' : '🚙 Hayvan kontrol ve jandarma ekipleri yola çıktı.', 'red', 'TELSİZ');
  }
  for (const h of G.humans) if (h.responder && (h.state === 'search' || h.state === 'travel') && !(h.state === 'search' && h.searchT < 15)) { h.state = 'travel'; h.target = { x: A.x + (rnd() - 0.5) * 30, z: A.z + (rnd() - 0.5) * 30 }; }
  // helikopter: kapalıysa hiç, düşük ayarda yalnızca polis aranınca (seviye 2) gelir
  const heliOK = SET.heli > 0 && (SET.heli >= 0.75 || A.level >= 2);
  if (heliOK && !heli.active && G.time > (heli.backAt || 0)) {
    heli.active = true; heli.leaving = false; heli.g.visible = true; heli.airT = 0; heli.kx = A.x; heli.kz = A.z; heli.lostT = 2; heli.sx = A.x; heli.sz = A.z;
    const a = rnd() * 6.28; heli.x = A.x + Math.cos(a) * 500; heli.z = A.z + Math.sin(a) * 500;
    tip('heli', '🚁 Arama helikopteri geliyor! Işığından kaç, sık ağaçların altına saklan.');
  }
  if (A.droneOn && !drone.active) {
    drone.active = true; drone.g.visible = true; drone.x = A.x + 80; drone.z = A.z; drone.y = height(A.x, A.z) + 30;
    toast('🛸 Termal kameralı drone havada! Ağaçlar seni gizlemez. Suya gir ya da uzaklaş.', 'red', 'TELSİZ');
  }
}

function spotted(by) {
  const first = G.time - A.lastSpot > 6;
  A.lastSpot = G.time; A.x = L.x; A.z = L.z;
  if (A.level < 1) { A.level = 1; dispatch(); }
  if (first) { audio.heartbeat(); if (by) toast(by, 'red', 'GÖRÜLDÜN'); }
}

// ---------- Görüş ----------
function lionVisibility() {
  let m = 1;
  if (G.input.crouch) m *= 0.55;
  if (L.speed > 6) m *= 1.25;
  if (world.inBush(L.x, L.z)) m *= 0.45;
  m *= 1 - world.canopy(L.x, L.z) * 0.2;
  if (Math.hypot(L.x - DEN.x, L.z - DEN.z) < 9) m *= 0.2;
  return m;
}
function nightF() { return G.night; }
function sees(n, base) {
  const d = Math.hypot(n.x - L.x, n.z - L.z);
  const vd = base * lerp(1, 0.6, nightF()) * G.vis;
  // çok yakın ya da koşarken yakında: ses/koku ile fark edilir (görüş açısından bağımsız)
  if (d < 5 || (d < 16 && L.speed > 6 && !input.crouch)) return { ok: true, d, vd, heard: true };
  if (d > vd) return { ok: false, d, vd };
  const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
  const dot = ((L.x - n.x) * fx + (L.z - n.z) * fz) / (d || 1);
  if (dot < 0.45) return { ok: false, d, vd };            // ~125° görüş konisi
  // görüş hattı: ağaç gövdeleri ve çalılar keser (kişi başına saniyede ~5 kez hesaplanır)
  if (!n.losT || G.time - n.losT > 0.2) { n.losT = G.time; n.los = losClear(n.x, n.z, L.x, L.z); }
  return { ok: n.los, d, vd };
}
const _lt = [];
function losClear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d;
  let block = 0;
  for (let s = 2.5; s < d - 1.5; s += 2.5) {
    const x = ax + ux * s, z = az + uz * s;
    _lt.length = 0; world.nearTrees(x, z, 2, _lt);
    for (const t of _lt) { const td = Math.hypot(t.x - x, t.z - z); if (td < 1.3) block += td < 0.6 ? 0.5 : 0.22; }
    if (world.inBush(x, z)) block += 0.4;
    if (block >= 1) return false;
  }
  return true;
}

// ---------- Oyun kurulumu ----------
let natureModels = null;
function setupWorld() {
  world = new World(scene, natureModels); G.world = world;
  L = makeLion(); G.L = L;
  heli = makeHeli(); drone = makeDrone(); G.heli = heli; G.drone = drone;
  director = new Director(G); G.director = director;
  buildMinimap();
}

function resetGame() {
  // eski NPC'leri temizle
  for (const h of G.humans) scene.remove(h.h.root);
  for (const p of G.prey) scene.remove(p.p.root);
  for (const c of G.cubs) scene.remove(c.root);
  G.humans = []; G.prey = []; G.cubs = [];
  if (mirageFx) mirageFx.hide(); G.mirage = null; if (post.enabled) post.mComp.uniforms.uMirage.value = 0;
  G.time = 0; G.clock = 19.75; G.score = 0; G.visited = new Set(); G.flags = {}; G.ending = null;
  S = G.S = { health: 100, hunger: 85, thirst: 70, stamina: 100, sedation: 0, sedT: 0, starve: 0 };
  A = G.A = newAlert();
  heli.active = false; heli.g.visible = false; heli.cone.visible = heli.disc.visible = heli.spot.visible = false; heli.backAt = 0; heli.kx = undefined; heli.airT = 0;
  drone.active = false; drone.g.visible = false; drone.ring.visible = false;
  L.f.dead = 0; L.f.sleep = 0; L.f.lie = 0; L.mode = 'free'; L.jumpY = 0; L.leftVilla = false;
  input.setCrouch(false);
  world.setCageDoor(0);
  populate();
}

function startPlay() {
  G.state = 'play';
  input.enabled = true; input.resetJoy();
  for (const id of ['hud', 'status', 'minimap', 'mapInfo', 'controls', 'bPause']) $(id).classList.remove('hidden');
  $('cine').classList.add('hidden');
  placeLion(VILLA.x - 40, VILLA.z + 2, -Math.PI / 2);
  G.camYaw = -Math.PI / 2; G.camPitch = 0.32; G.clock = 19.8;
  world.setCageDoor(1);
  hint('Ormana kaç! Sol tarafı sürükleyerek hareket et.', 5);
  setTimeout(() => G.state === 'play' && tip('run', '💨 Koş tuşuyla hızlanırsın ama enerjin azalır. 🌿 Sin tuşu seni daha zor görünür yapar.'), 7000);
}
G.startPlay = startPlay;

function hideHud() { $('hint').style.opacity = 0; hintT = 0; for (const id of ['hud', 'status', 'minimap', 'mapInfo', 'controls', 'choice', 'bPause']) $(id).classList.add('hidden'); input.enabled = false; input.resetJoy(); }
G.hideHud = hideHud;

// ---------- Oyuncu güncellemesi ----------
function nearestPrey(maxD) {
  let best = null, bd = maxD;
  for (const p of G.prey) { if (p.state === 'dead') continue; const d = Math.hypot(p.x - L.x, p.z - L.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function waterAhead() {
  const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
  return waterDepth(L.x + fx * 1.4, L.z + fz * 1.4) > 0.02 || waterDepth(L.x, L.z) > 0.1;
}

function unstick() {
  for (let r = 3; r <= 60; r += 3) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + r, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    if (waterDepth(x, z) > -0.4) continue;
    const h = height(x, z);
    if (Math.abs(height(x + 1.5, z) - h) + Math.abs(height(x, z + 1.5) - h) > 1.6) continue;
    const q = { x, z }; world.collide(q, 0.7); if (Math.hypot(q.x - x, q.z - z) > 0.01) continue;
    L.x = x; L.z = z; L.y = h; hint('Takıldığın yerden çıktın.', 2); return true;
  }
  return false;
}
G.unstick = unstick;

function updateLion(dt) {
  const mv = input.move();
  const { act, roar } = input.consume();
  const sed = S.sedation / 100;
  let want = 0;
  L.modeT -= dt;
  // kontekst eylemi
  const prey = nearestPrey(7);
  const water = !prey && waterAhead();
  const actLbl = $('actLbl'), bAct = $('bAct');
  if (prey) { actLbl.textContent = 'Avlan'; bAct.classList.remove('dim'); bAct.classList.add('pulse'); }
  else if (water) { actLbl.textContent = 'Su İç'; bAct.classList.remove('dim'); bAct.classList.toggle('pulse', S.thirst < 50); }
  else { actLbl.textContent = 'Eylem'; bAct.classList.add('dim'); bAct.classList.remove('pulse'); }

  if (L.mode === 'free') {
    if (act && prey) {
      L.mode = 'pounce'; L.modeT = 0.55; L.pounceTarget = prey; audio.growl();
      L.yaw = Math.atan2(prey.x - L.x, prey.z - L.z);
      L.pounceSp = clamp((Math.hypot(prey.x - L.x, prey.z - L.z) - 0.6) / 0.55, 4, 16);
    } else if (act && water) { L.mode = 'drink'; L.modeT = 1.2; }
    else if (roar && L.roarCD <= 0) doRoar();
  }
  if (L.mode === 'drink') {
    S.thirst = Math.min(100, S.thirst + 22 * dt);
    if (Math.random() < dt * 3) audio.drink();
    if ((L.modeT <= 0 && !input.actDown) || S.thirst >= 100 || mv.mag > 0.5) { L.mode = 'free'; if (!G.flags.drank) { G.flags.drank = 1; G.score += 5; } }
  }
  if (L.mode === 'pounce') {
    const k = 1 - L.modeT / 0.55;
    L.jumpY = Math.sin(clamp(k, 0, 1) * Math.PI) * 0.9;
    const sp = L.pounceSp || 12;
    L.x += Math.sin(L.yaw) * sp * dt; L.z += Math.cos(L.yaw) * sp * dt;
    if (L.modeT <= 0) {
      L.jumpY = 0; L.mode = 'free';
      const p = L.pounceTarget;
      if (p && p.state !== 'dead' && Math.hypot(p.x - L.x, p.z - L.z) < 2.6) {
        p.hp--;
        audio.growl();
        if (p.hp <= 0) { p.state = 'dead'; p.t = 0; L.mode = 'eat'; L.modeT = 3; L.eating = p; feedback('medium'); }
        else { p.state = 'charge'; p.t = 0; toast('🐗 Yaban domuzu karşı saldırıyor! Bir kez daha avlan.', '', 'DİKKAT'); }
      } else if (p) { p.state = 'flee'; p.t = 0; }
    }
  }
  if (L.mode === 'eat') {
    if (Math.random() < dt * 2.5) audio.eat();
    if (L.modeT <= 0) {
      const p = L.eating; L.mode = 'free';
      S.hunger = Math.min(100, S.hunger + p.P.food); G.score += p.P.score; S.health = Math.min(100, S.health + 10);
      toast(`🍖 Bir ${p.P.name} avladın. +${p.P.score}`, 'green');
      p.state = 'gone'; scene.remove(p.p.root);
    }
  }
  if (L.mode === 'roar' && L.modeT <= 0) L.mode = 'free';

  // hareket
  const free = L.mode === 'free' || L.mode === 'roar';
  if (free && mv.mag > 0.05) {
    const a = G.camYaw;
    const fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    const dx = fx * -mv.y + rx * mv.x, dz = fz * -mv.y + rz * mv.x;
    const targetYaw = Math.atan2(dx, dz);
    L.yaw = angleLerp(L.yaw, targetYaw, 1 - Math.exp(-10 * dt));
    let base = input.running() && S.stamina > 2 ? 11 : 4.2;
    if (input.crouch) base = input.running() && S.stamina > 2 ? 6 : 2.1;
    if (L.swim) base = 2.4;
    want = base * mv.mag * (1 - sed * 0.55);
  }
  L.speed = damp(L.speed, want, 6, dt);
  const ox = L.x, oz = L.z;
  if (free) {
    let step = L.speed * dt;
    // dik yokuş: yavaşla (engelleme yok, böylece hiçbir yerde kilitlenmez)
    const nx = L.x + Math.sin(L.yaw) * step, nz = L.z + Math.cos(L.yaw) * step;
    const grade = step > 0.001 ? (height(nx, nz) - height(L.x, L.z)) / step : 0;
    if (grade > 0.9 && !L.swim) step *= clamp(1.6 - grade * 0.7, 0.35, 1);
    L.x += Math.sin(L.yaw) * step; L.z += Math.cos(L.yaw) * step;
  }
  // derin su sınırı: sadece daha derine gitmeyi engelle; derindeyse sığa doğru yüzebilsin
  { const d1 = waterDepth(L.x, L.z); if (d1 > 3.2 && d1 > waterDepth(ox, oz) + 0.05) { L.x = ox; L.z = oz; hint('Burası çok derin!', 1.5); } }
  const p = { x: L.x, z: L.z }; world.collide(p, 0.7); L.x = p.x; L.z = p.z;
  // takılma güvencesi: oyuncu 2,5 sn itiyor ama aslan neredeyse hiç ilerlemiyorsa en yakın güvenli kara noktasına çıkar
  if (free && mv.mag > 0.5 && L.speed > 1.5) {
    const moved = Math.hypot(L.x - ox, L.z - oz);
    L.stuckT = (L.stuckT || 0) + (moved < L.speed * dt * 0.15 ? dt : -dt * 2);
    if (L.stuckT < 0) L.stuckT = 0;
    if (L.stuckT > 2.5) { L.stuckT = 0; unstick(); }
  } else L.stuckT = 0;
  for (const n of G.humans) { if (n.state === 'gone') continue; const d = Math.hypot(n.x - L.x, n.z - L.z); if (d < 1.1 && d > 0.01) { L.x = n.x + (L.x - n.x) / d * 1.1; L.z = n.z + (L.z - n.z) / d * 1.1; } }

  // enerji
  if (L.speed > 6) S.stamina = Math.max(0, S.stamina - 16 * dt); else S.stamina = Math.min(100, S.stamina + (L.speed < 0.5 ? 16 : 9) * dt);
  L.roarCD -= dt;
  $('bRoar').classList.toggle('dim', L.roarCD > 0);

  syncLion(dt, {
    speed: free ? L.speed : 0,
    crouch: input.crouch && free ? 1 : 0, drink: L.mode === 'drink' ? 1 : 0, pounce: L.mode === 'pounce' ? 1 : 0,
    lie: L.mode === 'pose' ? 0.6 : 0, roar: L.mode === 'roar' ? 1 : 0,
    night: G.night > 0.5, alert: G.time - A.lastSpot < 5 ? 1 : 0,
  });
  if (L.mode === 'eat') { L.f.drink = Math.max(L.f.drink, 0.8); L.f.crouch = Math.max(L.f.crouch, 0.6); }
}

function doRoar() {
  L.mode = 'roar'; L.modeT = 1.3; L.roarCD = 8; audio.roar(); addTrauma(0.3); buzz(30);
  for (const p of G.prey) if (p.state !== 'dead' && Math.hypot(p.x - L.x, p.z - L.z) < 45) { p.state = 'flee'; p.t = 0; }
  let heard = false;
  for (const n of G.humans) {
    const d = Math.hypot(n.x - L.x, n.z - L.z);
    if (d > 55 || n.state === 'gone') continue;
    if (n.type === 'civil') { if (n.state !== 'down') { n.state = 'flee'; n.t = 0; } heard = true; }
    else if (d < 25) { n.stun = 3; n.state = 'search'; }
  }
  if (heard) report(L.x, L.z, 1, '📞 "Ormandan aslan kükremesi geldi!" diye ihbar edildi.', 6);
}

// ---------- Survival ----------
function updateSurvival(dt) {
  const run = L.speed > 6 ? 1.7 : 1;
  S.hunger = Math.max(0, S.hunger - 0.3 * run * SET.needs * dt);
  S.thirst = Math.max(0, S.thirst - (L.swim ? 0 : 0.42 * run * SET.needs) * dt);
  if (S.hunger <= 0 || S.thirst <= 0) { S.health -= 1.6 * dt; if (Math.random() < dt * 0.5) hint(S.thirst <= 0 ? 'Susuzluktan bitkin düşüyorsun…' : 'Açlıktan bitkin düşüyorsun…', 2); }
  else if (S.hunger > 45 && S.thirst > 45) S.health = Math.min(100, S.health + 0.6 * dt);
  S.sedT -= dt; if (S.sedT < 0) S.sedation = Math.max(0, S.sedation - 4 * dt);
  if (S.thirst < 55) tip('thirst', '💧 Susadın. Göl ya da gölete git, 🐾 Su İç tuşunu basılı tut.');
  if (S.hunger < 55) tip('hunger', '🍖 Acıktın. Tavşan, karaca ya da yaban domuzu bul, yaklaşınca 🐾 Avlan. Sinerek yaklaşırsan kaçmazlar.');
  // puan: hayatta kalma
  G.survT = (G.survT || 0) + dt; if (G.survT > 4) { G.survT = 0; G.score += 1; }
  // keşif
  for (const p of PLACES) if (!G.visited.has(p.id) && Math.hypot(L.x - p.x, L.z - p.z) < p.r) { G.visited.add(p.id); G.score += 30; toast(`📍 ${p.name} keşfedildi. +30`, 'green'); }
  for (const lk of LAKES) if (lk.name && !G.visited.has(lk.name) && Math.hypot(L.x - lk.x, L.z - lk.z) < lk.r + 15) { G.visited.add(lk.name); G.score += 30; toast(`📍 ${lk.name} keşfedildi. +30`, 'green'); }
  if (S.health <= 0) endGame('death', S.lastHit === 'shot' ? 'shot' : (S.thirst <= 0 ? 'thirst' : 'hunger'));
  if (S.sedation >= 100) endGame('capture');
}

// ---------- Serap (yavrular) ----------
let mirageFx = null;   // yavrular ilk serapta bir kez kurulur, sonra yeniden kullanılır
function updateMirage(dt) {
  G.mirT = (G.mirT ?? 18) - dt;
  const low = S.hunger < 32 || S.thirst < 32;
  if (!G.mirage && low && G.mirT <= 0 && G.time - A.lastSpot > 10) {
    G.mirT = 30 + rnd() * 15;
    const dx = DEN.x - L.x, dz = DEN.z - L.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    if (!mirageFx) mirageFx = new Mirage(scene, height);
    // aslanın biraz önünde, ine giden yolun üstünde belirirler
    const mx = L.x + ux * 13, mz = L.z + uz * 13;
    mirageFx.start(mx, mz, ux, uz, () => audio.cubMew());
    G.mirage = mirageFx;
    $('fxMirage').style.opacity = post.enabled ? 0.45 : 1;
    audio.cubMew();
    if (!G.flags.mir1) { G.flags.mir1 = 1; say('…Bu sesler? Bu kokular… Yavrularım?', 5); }
    else say(['Onlar bekliyor…', 'Çok uzakta değiller…', 'Ormanın derinliklerinde…', 'İzleri… ine doğru gidiyor.'][Math.floor(rnd() * 4)], 4);
  }
  if (mirageFx) {
    const on = mirageFx.update(dt, L);
    if (G.mirage && !on) { G.mirage = null; $('fxMirage').style.opacity = 0; }
    if (post.enabled) { const U = post.mComp.uniforms; U.uMirage.value = mirageFx.strength; U.uTime.value = G.time; }
  }
}

// ---------- NPC'ler ----------
const tmpP = { x: 0, z: 0 };
function moveNpc(n, tx, tz, speed, dt) {
  const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.5) return true;
  const ty = Math.atan2(dx, dz);
  n.yaw = angleLerp(n.yaw, ty, 1 - Math.exp(-6 * dt));
  n.x += Math.sin(n.yaw) * speed * dt; n.z += Math.cos(n.yaw) * speed * dt;
  tmpP.x = n.x; tmpP.z = n.z; world.collide(tmpP, 0.4); n.x = tmpP.x; n.z = tmpP.z;
  if (waterDepth(n.x, n.z) > 0.2) { n.x -= Math.sin(n.yaw) * speed * dt * 1.5; n.z -= Math.cos(n.yaw) * speed * dt * 1.5; n.target = null; }
  return false;
}

function updateHumans(dt) {
  const vis = G.vis;
  for (const n of G.humans) {
    if (n.state === 'gone') continue;
    const d = Math.hypot(n.x - L.x, n.z - L.z);
    const near = d < 160, show = d < G.Q.npc;
    n.h.root.visible = show;
    let speed = 0, st = {};
    n.t += dt; n.stun -= dt;
    if (n.type === 'civil') {
      if (n.state === 'wander') {
        if (!n.target || n.wait > 0) { n.wait -= dt; if (n.wait <= 0 && !n.target) { const R = n.roam || 22; n.target = { x: n.home.x + (rnd() - 0.5) * R * 2, z: n.home.z + (rnd() - 0.5) * R * 2 }; } }
        if (n.target && n.wait <= 0) { speed = 1.25; if (moveNpc(n, n.target.x, n.target.z, speed, dt)) { n.target = null; n.wait = 2 + rnd() * 4; } }
        if (!n.done && G.state === 'play' && near) {
          const s = sees(n, 30);
          if (s.ok) {
            if (s.d < 13 && L.mode === 'free') { startChoice(n); }
            else { n.done = true; n.state = 'flee'; n.t = 0; report(L.x, L.z, 1, '📞 Bir yürüyüşçü 112\'yi aradı: "Ormanda aslan gördüm!"', 7); hint('Biri seni gördü ve kaçtı!', 2.5); }
          }
        }
      } else if (n.state === 'flee') {
        speed = 4.6; const ax = n.x - L.x, az = n.z - L.z, l = Math.hypot(ax, az) || 1;
        moveNpc(n, n.x + ax / l * 10, n.z + az / l * 10, speed, dt);
        if (n.t > 12) { n.state = 'wander'; n.target = null; n.home = { x: n.x, z: n.z }; }
      } else if (n.state === 'photo') {
        n.yaw = angleLerp(n.yaw, Math.atan2(L.x - n.x, L.z - n.z), 1 - Math.exp(-8 * dt));
        st.photo = 1; const ft = n.t % 0.8; st.flash = n.t < 2.6 && ft < 0.08;
        if (st.flash && !n.flashed) { n.flashed = true; audio.shutter(); } if (ft > 0.1) n.flashed = false;
        if (n.t > 3) { n.state = 'wander'; n.target = { x: n.x + (n.x - L.x) * 3, z: n.z + (n.z - L.z) * 3 }; n.wait = 0; n.home = { ...n.target }; }
      } else if (n.state === 'freeze') {
        n.yaw = angleLerp(n.yaw, Math.atan2(L.x - n.x, L.z - n.z), 1 - Math.exp(-6 * dt)); st.cower = 0.5;
        if (n.t > 1.5) { n.state = 'flee'; n.t = 4; }
      } else if (n.state === 'down') { st.fall = 1; }
    } else updateResponder(n, d, dt, st, (s) => { speed = s; });
    if (n.state === 'flee' || (n.state === 'wander' && n.target && n.wait <= 0)) speed = speed || 1.25;
    n.y = height(n.x, n.z);
    if (show) {
      n.h.root.position.set(n.x, n.y, n.z); n.h.root.rotation.y = n.yaw;
      n.h.animate(dt, { speed: n.moving ? n.moving : speed, ...st });
      if (n.h.beam) n.h.beam.visible = G.night > 0.5;
    }
    n.moving = 0;
  }
}

// Takipçi durumları: travel (bölgeye git) → search (bölgeyi tara) → investigate (şüpheli noktaya bak)
// → engage (görüyor, kovalıyor/ateş ediyor) → hunt (izi kaybetti, son görülen yere git) → search ... → leave
// Görüş hattı, şüphe birikimi, koşu dayanıklılığı ve arama süresi sayesinde iz kaybettirilebilir.
const RESP_LABEL = { vet: '🧑‍⚕️ Hayvan kontrol ekibi seni gördü!', polis: '🚓 Polis seni gördü!', jandarma: '🪖 Jandarma seni gördü!' };
function updateResponder(n, d, dt, st, setSpeed) {
  if (n.stun > 0) { st.cower = 0.6; return; }
  if (n.aware === undefined) { n.aware = 0; n.stam = 1; n.searchT = 0; }
  const armed = n.type === 'vet' || (A.armed && (n.type === 'polis' || n.type === 'jandarma'));
  const s = G.state === 'play' ? sees(n, n.type === 'vet' ? 40 : 36) : { ok: false, d };
  // şüphe: görünce yavaş yavaş dolar (uzakta ve saklıyken daha yavaş), görmeyince söner
  if (s.ok) n.aware = Math.min(1.3, n.aware + dt * SET.sight * (s.heard ? 2.5 : lerp(2.4, 0.5, clamp(s.d / (s.vd || 1), 0, 1))));
  else n.aware = Math.max(0, n.aware - dt * 0.3);
  // aslana asla çarpmazlar: hedef aslana 5 m'den yakınsa güvenli mesafedeki bir noktaya kaydırılır
  const go = (tx, tz, sp) => {
    if (Math.hypot(tx - L.x, tz - L.z) < 5) { const ax = n.x - L.x, az = n.z - L.z, al = Math.hypot(ax, az) || 1; tx = L.x + ax / al * 5; tz = L.z + az / al * 5; }
    setSpeed(sp); n.moving = sp; return moveNpc(n, tx, tz, sp, dt);
  };
  const faceLion = (k = 6) => { n.yaw = angleLerp(n.yaw, Math.atan2(L.x - n.x, L.z - n.z), 1 - Math.exp(-k * dt)); };
  // yüzü aslana dönük geri geri çekilme (yan adımla biraz da çevreleme)
  const backOff = (sp, side = 0) => {
    const ax = n.x - L.x, az = n.z - L.z, al = Math.hypot(ax, az) || 1;
    const vx = ax / al + (-az / al) * side, vz = az / al + (ax / al) * side, vl = Math.hypot(vx, vz) || 1;
    n.x += vx / vl * sp * dt; n.z += vz / vl * sp * dt;
    tmpP.x = n.x; tmpP.z = n.z; world.collide(tmpP, 0.4); n.x = tmpP.x; n.z = tmpP.z;
    faceLion(); setSpeed(sp); n.moving = sp;
  };
  if (s.ok && n.aware >= 1) {
    if (n.state !== 'engage') { n.state = 'engage'; n.t = 0; }
    n.lastSee = G.time; n.lx = L.x; n.lz = L.z;
    spotted(RESP_LABEL[n.type]);
  } else if (s.ok && n.aware > 0.25 && (n.state === 'search' || n.state === 'travel')) {
    n.state = 'investigate'; n.t = 0; n.target = { x: L.x + (rnd() - 0.5) * 8, z: L.z + (rnd() - 0.5) * 8 };
    st.look = 1;
  }
  // koşu dayanıklılığı: uzun kovalamada yorulur
  const sprinting = n.state === 'engage' && d > 6;
  n.stam = clamp(n.stam + dt * (sprinting ? -1 / 22 : 1 / 12), 0, 1);
  if (n.stam <= 0) n.tired = true; else if (n.stam > 0.5) n.tired = false;
  const runSp = (n.tired ? 2.6 : 4.4) * SET.speed;

  if (n.state === 'travel') {
    if (!n.target) n.target = { x: A.x, z: A.z };
    if (go(n.target.x, n.target.z, 3.6 * SET.speed) || Math.hypot(n.x - n.target.x, n.z - n.target.z) < 4) { n.state = 'search'; n.target = null; n.searchT = 0; n.cx = A.x; n.cz = A.z; }
  } else if (n.state === 'investigate') {
    n.yaw = angleLerp(n.yaw, Math.atan2(n.target.x - n.x, n.target.z - n.z), 1 - Math.exp(-4 * dt));
    if (n.t > 0.8 && (go(n.target.x, n.target.z, 2.4) || n.t > 12)) { n.state = 'search'; n.searchT = 0; n.cx = n.target.x; n.cz = n.target.z; n.target = null; }
  } else if (n.state === 'search') {
    n.searchT += dt;
    const R = Math.min(60, 12 + n.searchT * 1.2);
    if (!n.target) { n.target = { x: (n.cx ?? A.x) + (rnd() - 0.5) * R * 2, z: (n.cz ?? A.z) + (rnd() - 0.5) * R * 2 }; n.wait = 1 + rnd() * 2; }
    if (n.wait > 0) { n.wait -= dt; n.yaw += dt * 0.9 * (n.searchT % 6 < 3 ? 1 : -1); }   // durup etrafa bakınır
    else if (go(n.target.x, n.target.z, 2)) n.target = null;
    if (n.searchT > 40 * SET.search) { n.state = A.level > 0 ? 'travel' : 'leave'; n.target = A.level > 0 ? { x: A.x + (rnd() - 0.5) * 60, z: A.z + (rnd() - 0.5) * 60 } : spawnPointNear(n.x, n.z, 220); }
  } else if (n.state === 'engage') {
    const range = n.type === 'vet' ? 26 : 34;
    // mesafe koruma: silahlılar menzil içinde durup nişan alır; silahsızlar uzaktan izler, telsizle konum verir.
    // Aslan üstlerine yürürse yüzü dönük geri çekilirler, çok yaklaşırsa dönüp kaçarlar. Kimse aslanı itmez.
    const keep = armed ? (n.type === 'vet' ? 12 : 16) : 18;
    if (n.side === undefined) n.side = rnd() < 0.5 ? -1 : 1;
    if (!s.ok && G.time - (n.lastSee || 0) > 1.5) { n.state = 'hunt'; n.t = 0; return; }
    if (d < 6) { go(n.x + (n.x - L.x) * 4, n.z + (n.z - L.z) * 4, runSp); st.cower = 0.4; n.shootCD = Math.max(n.shootCD, 0.8); return; }
    if (d < keep - 4) { backOff(2.2, n.side * 0.35); st.aim = armed ? 0.7 : 0; if (!armed) st.cower = 0.25; }
    else if (d > (armed ? range : keep + 8)) { faceLion(); go(n.lx, n.lz, runSp); }
    else if (!armed) {
      // silahsız: yavaşça yan yan çevreler, aslana bakar ve konumu bildirmeye devam eder
      faceLion(); st.cower = 0.15;
      if (d > keep + 2) go(L.x, L.z, 1.4); else backOff(0.9, n.side * 1.6);
    } else {
      faceLion();
      st.aim = 1; n.shootCD -= dt;
      if (n.shootCD <= 0 && G.state === 'play' && s.ok) {
        n.shootCD = n.type === 'vet' ? 2.4 : 1.7;
        n.h.shoot();
        const running = L.speed > 6 ? 0.25 : 0, cover = world.canopy(L.x, L.z) * 0.15 + (world.inBush(L.x, L.z) ? 0.2 : 0);
        if (n.type === 'vet') {
          audio.dart();
          const pHit = (0.7 - d / 70 - running - cover) * SET.aim;
          if (rnd() < pHit) { S.sedation = Math.min(100, S.sedation + 34); S.sedT = 6; toast('💉 Uyuşturucu iğne isabet etti!', 'red', 'DİKKAT'); fx('fxSedate', 1); audio.hurt(); feedback('medium'); }
        } else {
          audio.gunshot();
          const pHit = (0.55 - d / 90 - running - cover) * SET.aim;
          if (rnd() < pHit) { S.health -= 30; S.lastHit = 'shot'; fx('fxDamage', 0.9); audio.hurt(); feedback('large'); } else addTrauma(0.15);
        }
      }
    }
  } else if (n.state === 'hunt') {
    // izi kaybetti: son gördüğü yere koşar, orada aramaya başlar
    if (go(n.lx, n.lz, (n.tired ? 2.4 : 3.6) * SET.speed) || n.t > 20) { n.state = 'search'; n.searchT = 0; n.cx = n.lx; n.cz = n.lz; n.target = null; }
  } else if (n.state === 'leave') {
    if (!n.target || go(n.target.x, n.target.z, 3) || d > 220) { n.state = 'gone'; scene.remove(n.h.root); }
  }
  if ((n.state === 'search' || n.state === 'travel') && A.level === 0 && G.time - A.lastReport > 5) { n.state = 'leave'; n.target = spawnPointNear(n.x, n.z, 220); }
}

let fxT = {};
// dokunsal geri bildirim: Capacitor (App Store sürümü) varsa Haptics, yoksa tarayıcı titreşimi
function buzz(ms = 40) {
  if (!SET.haptics) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) H.impact({ style: ms > 60 ? 'HEAVY' : 'MEDIUM' }); else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* desteklenmiyor */ }
}
G.buzz = buzz;
function fx(id, v) { if (SET.calm && id === 'fxDamage') v *= 0.45; $(id).style.opacity = v; fxT[id] = 0.5; }

// ---------- Oyun hissi (game-feel) ----------
// Sarsıntı = trauma² (hafif darbe az, ağır darbe çok), gerçek zamanla söner; yalnızca kamerayı oynatır.
// Vuruş duraklaması (hit-stop) oyun zamanını kısa süre yavaşlatır; üst üste gelirse sadece en yenisi geri alır.
G.trauma = 0; G.timeScale = 1;
function addTrauma(a) { G.trauma = Math.min(1, G.trauma + a); }
let hitStopId = 0;
function hitStop(dur, slow = 0.06) {
  if (G.timeScale < 1) return; // aktif duraklama varken yenisini başlatma
  const id = ++hitStopId; G.timeScale = slow;
  setTimeout(() => { if (id === hitStopId) G.timeScale = 1; }, dur * 1000);
}
const TIERS = {
  small: { trauma: 0.15, stop: 0, buzz: 0 },
  medium: { trauma: 0.4, stop: 0.05, buzz: 45 },
  large: { trauma: 0.85, stop: 0.12, buzz: 90 },
};
function feedback(tier) { const T = TIERS[tier]; addTrauma(T.trauma); if (T.stop) hitStop(T.stop); if (T.buzz) buzz(T.buzz); }
G.feedback = feedback; G.hitStop = hitStop;
const shakeOff = new THREE.Vector3(); let shakeT = 0, shakeRoll = 0;
function applyShake(realDt) {
  if (G.trauma <= 0) return;
  G.trauma = Math.max(0, G.trauma - 1.3 * realDt);
  const k = G.trauma * G.trauma * SET.shake;
  shakeT += realDt * 30;
  shakeOff.set(0.32 * k * Math.sin(shakeT * 1.7), 0.24 * k * Math.sin(shakeT * 2.3), 0.32 * k * Math.sin(shakeT * 1.3 + 1));
  shakeRoll = 0.035 * k * Math.sin(shakeT * 1.1);
  camera.position.add(shakeOff); camera.rotateZ(shakeRoll);
}

function updatePrey(dt) {
  let alive = 0;
  for (const n of G.prey) {
    if (n.state === 'gone') continue;
    const d = Math.hypot(n.x - L.x, n.z - L.z);
    const near = d < Math.min(130, G.Q.npc); n.p.root.visible = near;
    if (n.state === 'dead') { n.p.animate(dt, 0, true, 'dead'); n.p.root.position.set(n.x, height(n.x, n.z), n.z); continue; }
    alive++;
    n.t += dt; n.cd -= dt;
    let speed = 0;
    const det = n.P.flee * (input.crouch ? (L.speed < 3 ? 0.17 : 0.45) : 1) * (L.speed > 6 ? 1.35 : 1);
    if (n.state === 'graze') {
      if (d < det && G.state === 'play') { if (n.kind === 'domuz' && d < 9) { n.state = 'charge'; n.t = 0; } else { n.state = 'alert'; n.t = 0; } }
      if (!n.target || n.t > 6) { n.t = 0; n.target = { x: n.x + (rnd() - 0.5) * 16, z: n.z + (rnd() - 0.5) * 16 }; }
      if (n.target && n.t < 3) { speed = 0.9; if (moveNpc(n, n.target.x, n.target.z, speed, dt)) n.target = null; }
    } else if (n.state === 'alert') {
      n.yaw = angleLerp(n.yaw, Math.atan2(L.x - n.x, L.z - n.z), 1 - Math.exp(-8 * dt));
      if (n.t > 0.45) { n.state = 'flee'; n.t = 0; }
    } else if (n.state === 'flee') {
      speed = n.P.speed; const ax = n.x - L.x, az = n.z - L.z, l = Math.hypot(ax, az) || 1;
      moveNpc(n, n.x + ax / l * 10 + (rnd() - 0.5) * 3, n.z + az / l * 10, speed, dt);
      if (n.t > 7 && d > 50) { n.state = 'graze'; n.t = 0; n.target = null; }
    } else if (n.state === 'charge') {
      speed = 7.5; moveNpc(n, L.x, L.z, speed, dt);
      if (d < 1.8 && n.cd <= 0) { n.cd = 1.6; S.health -= n.P.danger; S.lastHit = 'boar'; fx('fxDamage', 0.7); audio.hurt(); feedback('medium'); n.state = 'flee'; n.t = 0; }
      if (n.t > 6) { n.state = 'flee'; n.t = 0; }
    }
    n.y = height(n.x, n.z);
    if (near) { n.p.root.position.set(n.x, n.y, n.z); n.p.root.rotation.y = n.yaw; n.p.animate(dt, speed, false, n.state); }
  }
  if (alive < 38 && rnd() < dt * 0.3) {
    const q = randomLand(140, 40); const k = rnd(); spawnPrey(k < 0.5 ? 'tavsan' : k < 0.82 ? 'karaca' : 'domuz', q.x, q.z);
  }
}

// ---------- Helikopter / drone ----------
// Helikopter: ışık hüzmesi aslanın bilinen son konumuna sınırlı hızla döner. Koşan aslan hüzmeden kaçabilir;
// ağaç altında/çalıda görülmez. İzi kaybedince genişleyen daireyle arar; yakıtı bitince ya da uzun süre bulamazsa döner.
// helikopter süreleri zorluk ayarına bağlı (SET.heli: sıklık, SET.search: ısrar)
const heliFuel = () => 150 * clamp(SET.heli, 0.5, 1.5), heliLost = () => 40 * SET.search;
function updateHeli(dt) {
  if (!heli.active) { audio.setLoop('rotor', 0); return; }
  heli.rotor.rotation.y += dt * 25;
  heli.blink.visible = (G.time % 1) < 0.15;
  heli.airT = (heli.airT || 0) + dt;
  if (heli.kx === undefined) { heli.kx = A.x; heli.kz = A.z; heli.lostT = 99; }
  if (!heli.leaving && (heli.airT > heliFuel() || heli.lostT > heliLost() || A.level === 0 || SET.heli <= 0)) {
    heli.leaving = true; heli.backAt = G.time + 100 / Math.max(0.25, SET.heli);
    if (A.level > 0) toast(heli.airT > heliFuel() ? '🚁 Helikopter yakıt almak için üsse döndü.' : '🚁 Helikopter izini kaybetti, bölgeden ayrılıyor.', 'green', 'TELSİZ');
  }
  let tx, tz;
  if (heli.leaving) {
    tx = heli.x + Math.sin(heli.yaw) * 100; tz = heli.z + Math.cos(heli.yaw) * 100;
    if (Math.abs(heli.x) > HALF + 300 || Math.abs(heli.z) > HALF + 300) { heli.active = false; heli.g.visible = false; heli.cone.visible = heli.disc.visible = heli.spot.visible = false; heli.kx = undefined; heli.airT = 0; return; }
  }
  // ışığın hedefi: kilitliyse bilinen konum, değilse son bilinen konum çevresinde genişleyen arama
  let gx, gz;
  if (heli.lostT < 1.2) { gx = heli.kx; gz = heli.kz; }
  else { const R = Math.min(70, 10 + heli.lostT * 2.2), a = G.time * 0.45; gx = heli.kx + Math.cos(a) * R + Math.sin(G.time * 1.3) * 6; gz = heli.kz + Math.sin(a) * R; }
  const maxSp = heli.lostT < 1.2 ? 7.5 * (0.85 + 0.15 * Math.min(2, SET.heli)) : 14;   // kilitliyken bile koşan aslandan (11 m/sn) yavaş
  { const dx = gx - heli.sx, dz = gz - heli.sz, dd = Math.hypot(dx, dz); if (dd > 0.01) { const st = Math.min(dd, maxSp * dt); heli.sx += dx / dd * st; heli.sz += dz / dd * st; } }
  if (!heli.leaving) { heli.ang += dt * 0.3; tx = heli.sx + Math.cos(heli.ang) * 22; tz = heli.sz + Math.sin(heli.ang) * 22; }
  const dx = tx - heli.x, dz = tz - heli.z, d = Math.hypot(dx, dz);
  const sp = Math.min(24, d * 0.7 + 3);
  if (d > 0.1) { heli.x += dx / d * sp * dt; heli.z += dz / d * sp * dt; heli.yaw = angleLerp(heli.yaw, Math.atan2(dx, dz), 1 - Math.exp(-2 * dt)); }
  const gh = Math.max(0, height(heli.x, heli.z));
  heli.y = damp(heli.y, gh + 55, 1, dt);
  heli.g.position.set(heli.x, heli.y, heli.z); heli.g.rotation.set(0.12, heli.yaw, 0);
  const sy = Math.max(0, height(heli.sx, heli.sz));
  const night = G.night > 0.3;
  heli.spot.visible = night; heli.cone.visible = night; heli.disc.visible = !heli.leaving;
  heli.spot.position.set(0, -1.3, 0.5); heli.spot.target.position.set(heli.sx, sy, heli.sz);
  const top = new THREE.Vector3(heli.x, heli.y - 1.3, heli.z), bot = new THREE.Vector3(heli.sx, sy, heli.sz);
  const len = top.distanceTo(bot);
  heli.cone.position.copy(top).add(bot).multiplyScalar(0.5);
  heli.cone.scale.set(heli.R, len, heli.R);
  heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), bot.clone().sub(top).normalize());
  heli.disc.position.set(heli.sx, sy + 0.4, heli.sz); heli.disc.scale.setScalar(heli.R);
  heli.disc.material.opacity = night ? 0.22 : 0.08;
  // tespit: hüzmenin içinde, açıkta (ağaç altı, çalı, in değil)
  const ld = Math.hypot(heli.sx - L.x, heli.sz - L.z);
  const hidden = world.canopy(L.x, L.z) >= 0.45 || world.inBush(L.x, L.z) || Math.hypot(L.x - DEN.x, L.z - DEN.z) < 9;
  if (G.state === 'play' && !heli.leaving && ld < heli.R * 0.95 && !hidden) {
    heli.kx = L.x; heli.kz = L.z; heli.lostT = 0;
    spotted('🚁 Helikopterin ışığına yakalandın! Koş ya da ağaçların altına gir!');
  } else heli.lostT += dt;
  const hd = Math.hypot(heli.x - L.x, heli.z - L.z);
  audio.setLoop('rotor', clamp(1 - hd / 350, 0, 1) * 0.5);
}

function updateDrone(dt) {
  if (!drone.active) return;
  drone.ang += dt * 0.45;
  const recent = G.time - A.lastSpot < 6;
  const cx = recent ? L.x : A.x, cz = recent ? L.z : A.z, R = recent ? 4 : 28;
  const tx = cx + Math.cos(drone.ang) * R, tz = cz + Math.sin(drone.ang) * R;
  const dx = tx - drone.x, dz = tz - drone.z, d = Math.hypot(dx, dz);
  const sp = Math.min(14, d + 2);
  if (d > 0.1) { drone.x += dx / d * sp * dt; drone.z += dz / d * sp * dt; }
  drone.y = damp(drone.y, Math.max(0, height(drone.x, drone.z)) + 24, 1, dt);
  drone.g.position.set(drone.x, drone.y, drone.z);
  drone.led.visible = (G.time % 0.6) < 0.2;
  drone.ring.visible = true; drone.ring.position.set(drone.x, Math.max(0, height(drone.x, drone.z)) + 0.5, drone.z);
  const ld = Math.hypot(drone.x - L.x, drone.z - L.z);
  const cool = waterDepth(L.x, L.z) > 0.35 || Math.hypot(L.x - DEN.x, L.z - DEN.z) < 9;
  if (G.state === 'play' && ld < drone.R && !cool) spotted('🛸 Termal kamera seni buldu! Suya gir!');
  if (A.level === 0 && G.time - A.lastReport > 20) { drone.active = false; drone.g.visible = false; drone.ring.visible = false; A.droneOn = false; }
}

function updateAlert(dt) {
  processReports();
  if (A.level > 0 && G.time - Math.max(A.lastSpot, A.lastReport) > 75 * SET.search) {
    A.level = 0; toast('📻 Arama bu bölgede durduruldu. Şimdilik güvendesin.', 'green', 'TELSİZ');
  }
  if (A.armed && G.time - Math.max(A.lastSpot, A.lastReport) > 150 * SET.search) A.armed = false;
}

// ---------- Karşılaşma seçimi ----------
let choiceNpc = null;
function startChoice(n) {
  G.state = 'choice'; choiceNpc = n; n.done = true;
  input.resetJoy(); L.speed = 0;
  $('choiceWho').textContent = n.roam ? 'Bir doğa yürüyüşçüsü seni fark etti! Ne yapacaksın?' : 'Bir köylü seni fark etti! Ne yapacaksın?';
  $('choice').classList.remove('hidden');
  $('controls').classList.add('hidden');
  audio.heartbeat();
  tip('choice', 'İnsanlarla karşılaşınca 3 seçeneğin var. Saldırmak polisi silahlandırır, fotoğraf puan getirir ama konumunu ele verir.');
}
function resolveChoice(c) {
  const n = choiceNpc; choiceNpc = null;
  $('choice').classList.add('hidden'); $('controls').classList.remove('hidden');
  G.state = 'play';
  n.t = 0;
  if (c === 'attack') {
    L.mode = 'pounce'; L.modeT = 0.55; L.pounceTarget = null; L.pounceSp = clamp((Math.hypot(n.x - L.x, n.z - L.z) - 1.2) / 0.55, 4, 16); L.yaw = Math.atan2(n.x - L.x, n.z - L.z); audio.roar();
    setTimeout(() => { n.state = 'down'; audio.tone(700, 0.5, { type: 'sawtooth', vol: 0.08, slide: 400 }); }, 420);
    for (const o of G.humans) if (o !== n && o.type === 'civil' && Math.hypot(o.x - n.x, o.z - n.z) < 70) { o.state = 'flee'; o.t = 0; o.done = true; }
    report(L.x, L.z, 2, '🚨 Bir sivil yaralandı! Etraftakiler polisi aradı. Polis silah kullanma yetkisi aldı.', 2, { src: 'SON DAKİKA' });
    G.flags.attacked = (G.flags.attacked || 0) + 1;
  } else if (c === 'photo') {
    n.state = 'photo'; L.mode = 'pose'; L.modeT = 3.2; G.score += 100;
    setTimeout(() => { if (L.mode === 'pose') L.mode = 'free'; }, 3200);
    toast('📸 Fotoğraf çekildi! +100. Ama fotoğraf yakında sosyal medyaya düşecek, buradan uzaklaş.', 'green');
    report(n.x, n.z, 1, '📱 #SarıyerAslanı fotoğrafı viral oldu! Konum paylaşıldı, hayvan kontrol ekipleri ve termal drone yolda.', 32, { drone: true, src: 'SOSYAL MEDYA' });
  } else {
    n.state = 'freeze'; G.score += 15;
    report(L.x, L.z, 1, '📞 Seni gören kişi hemen ihbar etti. Ekipler bölgeye geliyor.', 9);
  }
}
document.querySelectorAll('#choice .opt').forEach((b) => b.addEventListener('click', () => { if (G.state === 'choice') resolveChoice(b.dataset.c); }));

// ---------- Sonlar ----------
function checkEndings() {
  const dv = Math.hypot(L.x - VILLA.x, L.z - VILLA.z);
  if (dv > 70) L.leftVilla = true;
  const gx = L.x - VILLA.x, gz = L.z - VILLA.z;
  if (L.leftVilla && G.time > 40 && Math.abs(gx) < 27 && gz > -19 && gz < 23) return endGame('villa');
  const dd = Math.hypot(L.x - (DEN.x + 5), L.z - DEN.z);
  if (dd < 9) {
    if (G.score >= TRUE_SCORE) return endGame('true');
    if (!G.flags.denHint || G.time - G.flags.denHint > 25) { G.flags.denHint = G.time; say(`Burası… tanıdık kokuyor. Ama henüz hazır değilsin. (⭐ ${G.score} / ${TRUE_SCORE})`, 5); }
  }
}

function endGame(kind, cause) {
  if (G.state === 'end' || G.state === 'cine') return;
  G.ending = { kind, cause };
  hideHud();
  $('fxMirage').style.opacity = 0;
  if (mirageFx) mirageFx.hide(); G.mirage = null; if (post.enabled) post.mComp.uniforms.uMirage.value = 0;
  audio.setLoop('rotor', 0);
  director.play(buildShots(G, kind, cause), () => showEnd(kind, cause));
}
G.endGame = endGame;

function showEnd(kind, cause) {
  G.state = 'end';
  const T = {
    death: ['Acı Son', cause === 'shot' ? 'Bir silah sesi… ve orman sustu. Son nefesinde yavrularını gördü.' : 'Bedeni daha fazla dayanamadı. Gözlerini kapatırken yavrularını gördü.'],
    capture: ['Yakalandı', 'Uyandığında yine demir parmaklıklar vardı. Ormanın sesi artık çok uzaktaydı.'],
    villa: ['Eve Dönüş', 'Tanıdık olana döndü. Ama ormanın derinliklerinden gelen o iki küçük ses hiç susmadı.'],
    true: ['Gerçek Son', 'Hayali sandığı aile hep oradaydı. Sarıyer Aslanı, yavrularına kavuştu.'],
  }[kind];
  $('endTitle').textContent = T[0];
  $('endText').textContent = T[1];
  let best = 0; try { best = +localStorage.getItem('sa_best') || 0; if (G.score > best) { localStorage.setItem('sa_best', G.score); best = G.score; } } catch (e) {}
  $('endScore').textContent = `⭐ ${G.score} puan · En iyi: ${best}`;
  $('endHint').textContent = kind === 'true' ? 'Tebrikler! Gerçek sonu buldun.'
    : kind === 'villa' ? `İpucu: Gerçek son için ${TRUE_SCORE} puan topla. Aç ya da susuz kaldığında gördüğün seraplar sana yolu gösteriyor.`
      : 'İpucu: Ağaçların altında ve suda saklan. Fotoğraf puan getirir ama hızla uzaklaşman gerekir.';
  $('endScreen').classList.remove('hidden');
}
$('bAgain').addEventListener('click', () => { $('endScreen').classList.add('hidden'); resetGame(); startPlay(); });

// ---------- Gün/gece ----------
const C = { nf: new THREE.Color('#18233a'), df: new THREE.Color('#a8c0cc'), dawn: new THREE.Color('#d9a07a'), tmp: new THREE.Color(), wd: new THREE.Vector3(), wc: new THREE.Color() };
function updateSky() {
  const h = ((G.clock % 24) + 24) % 24;
  const day = clamp(Math.sin(((h - 6) / 12) * Math.PI) * 1.6 + 0.1, 0, 1);
  const twilight = clamp(1 - Math.abs(day - 0.25) * 4, 0, 1);
  G.night = 1 - day;
  C.tmp.copy(C.nf).lerp(C.df, day).lerp(C.dawn, twilight * 0.35);
  scene.fog.color.copy(C.tmp); scene.background.copy(C.tmp);
  scene.fog.density = Math.max(lerp(0.0062, 0.003, day), 1.35 / G.Q.view);
  hemi.color.set('#7f95c8').lerp(new THREE.Color('#cfe3ff'), day);
  hemi.groundColor.set('#2c2c24').lerp(new THREE.Color('#5a4a30'), day);
  hemi.intensity = lerp(1.5, 1.15, day);
  sun.color.set('#b4c6f0').lerp(new THREE.Color('#fff1d6'), day).lerp(C.dawn, twilight * 0.4);
  sun.intensity = lerp(1.6, 2.5, day);
  for (const m of natureMats) m.emissiveIntensity = day * day;
  const ang = ((h - 6) / 12) * Math.PI;
  const ox = Math.cos(ang) * 60, oy = Math.max(25, Math.sin(Math.abs(ang)) * 70), oz = 30;
  const cx = L ? L.x : 0, cz = L ? L.z : 0, cy = L ? L.y : 0;
  sun.position.set(cx + (day > 0.1 ? ox : -40), cy + oy, cz + oz); sun.target.position.set(cx, cy, cz);
  if (world) {
    world.starsMat.opacity = 0.9 * G.night;
    world.moon.visible = G.night > 0.3; world.moon.position.set(camera.position.x - 600, 700, camera.position.z - 900);
    world.stars.position.copy(camera.position);
    world.windowsMat.emissiveIntensity = lerp(1.6, 0.05, day);
    world.villaLight.intensity = lerp(40, 0, day);
    if (day > 0.1) C.wd.set(ox, oy, oz); else C.wd.set(-600, 700, -900);
    C.wc.copy(sun.color).multiplyScalar(day > 0.1 ? lerp(0.5, 1.2, day) : 0.7);
    world.setWaterLight(C.wd, C.wc, C.tmp);
  }
  if (post.enabled) {
    const U = post.mComp.uniforms;
    U.uBloom.value = lerp(0.75, 0.3, day); U.uSat.value = lerp(0.88, 1.08, day);
    U.uContrast.value = lerp(1.06, 1.03, day); U.uVignette.value = lerp(0.62, 0.42, day);
    U.uTint.value.setRGB(lerp(0.9, 1.02, day), lerp(0.96, 1.0, day), lerp(1.1, 0.96, day));
  }
  G.vis = (L ? lionVisibility() : 1);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  $('clock').textContent = `${G.night > 0.5 ? '🌙' : '☀️'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------- Kamera ----------
G.camYaw = 0; G.camPitch = 0.3;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const [lx, ly] = input.takeLook();
  G.camYaw -= lx * 0.006 * SET.sens; G.camPitch = clamp(G.camPitch + ly * 0.004 * SET.sens * (SET.invY ? -1 : 1), 0.05, 1.1);
  if (!input.dragging && L.speed > 1 && G.state === 'play') G.camYaw = angleLerp(G.camYaw, L.yaw, 1 - Math.exp(-1.2 * dt));
  let dist = (G.camDist || 6.2) + (L.speed > 6 ? 1.2 : 0);
  if (G.state === 'choice' && choiceNpc) {
    const mx = (L.x + choiceNpc.x) / 2, mz = (L.z + choiceNpc.z) / 2;
    const ax = choiceNpc.x - L.x, az = choiceNpc.z - L.z, l = Math.hypot(ax, az) || 1;
    camLook.set(mx, L.y + 1, mz);
    camPos.set(mx - az / l * 9, L.y + 3, mz + ax / l * 9);
  } else {
    camLook.set(L.x, L.y + 1.1 + L.jumpY, L.z);
    const cp = Math.cos(G.camPitch), spp = Math.sin(G.camPitch);
    camPos.set(L.x - Math.sin(G.camYaw) * dist * cp, L.y + 1.1 + dist * spp, L.z - Math.cos(G.camYaw) * dist * cp);
  }
  const gh = height(camPos.x, camPos.z) + 0.6;
  if (camPos.y < gh) camPos.y = gh;
  { const wl = waterLevel(camPos.x, camPos.z) + 0.4; if (camPos.y < wl) camPos.y = wl; }
  camera.position.sub(shakeOff); shakeOff.set(0, 0, 0); // önceki karenin sarsıntısını taban konumdan çıkar
  camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
  camera.lookAt(camLook);
}

// ---------- HUD ----------
const barEls = {};
document.querySelectorAll('.bar').forEach((b) => (barEls[b.dataset.k] = b));
// HUD yalnızca değer değişince DOM'a yazar (iOS'ta her kare stil yazmak yerleşim maliyeti doğurur)
const hudLast = {};
function setIf(key, v, fn) { if (hudLast[key] !== v) { hudLast[key] = v; fn(v); } }
function updateHud() {
  for (const k of ['health', 'hunger', 'thirst', 'stamina', 'sedation']) {
    const v = Math.round(clamp(S[k], 0, 100));
    setIf('w' + k, v, (x) => { barEls[k].firstElementChild.nextElementSibling.firstElementChild.style.width = x + '%'; });
    setIf('l' + k, k === 'sedation' ? v > 60 : v < 25, (x) => barEls[k].classList.toggle('low', x));
  }
  setIf('sedShow', S.sedation > 1, (x) => { barEls.sedation.style.display = x ? 'flex' : 'none'; });
  setIf('score', G.score, (x) => {
    const el = $('score'); el.textContent = `⭐ ${x}`;
    if (x > (hudLast.scorePrev || 0)) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    hudLast.scorePrev = x;
  });
  const seen = G.time - A.lastSpot < 3;
  let sus = false;
  if (!seen) for (const n of G.humans) { if (n.state === 'gone' || n.state === 'down') continue; if (Math.hypot(n.x - L.x, n.z - L.z) < 45 * G.vis) { sus = true; break; } }
  if (!seen && heli.active && Math.hypot(heli.sx - L.x, heli.sz - L.z) < 30) sus = true;
  const eyeK = seen ? 'seen' : sus ? 'sus' : G.vis < 0.5 ? 'hide' : 'ok';
  setIf('eye', eyeK, (x) => {
    const eye = $('eye'); eye.className = x === 'seen' ? 'seen' : x === 'sus' ? 'sus' : '';
    eye.textContent = { seen: '👁️ GÖRÜLDÜN!', sus: '⚠️ Dikkat, yakında biri var', hide: '🌿 Saklanıyorsun', ok: '🌲 Gizli' }[x];
  });
  setIf('alert', A.level, (x) => { $('alertTxt').textContent = x >= 2 ? '🚨 Polis silahlı arıyor' : x === 1 ? '🔎 Ekipler arıyor' : ''; });
  const so = Math.round(Math.max((hudLast.sed || 0) * 0.98, S.sedation / 130) * 100) / 100;
  setIf('sed', so, (x) => { $('fxSedate').style.opacity = x; });
}

// ---------- Mini harita ----------
let minimap = null;
function buildMinimap() {
  minimap = new Minimap($('minimap'), $('bigmapCv'), world);
}
function mapState() {
  return { L, camYaw: G.camYaw, A, heli, drone, humans: G.humans, prey: G.prey, hungry: S.hunger < 55, night: G.night };
}
let coordLast = '', coordT = 0;
function drawMinimap(dt = 0.05) {
  if (!minimap) return;
  minimap.draw(dt, mapState());
  if ((coordT += dt) > 0.2) { coordT = 0; const t = coordText(L.x, L.z, L.yaw); if (t !== coordLast) { coordLast = t; $('mapInfo').textContent = t; } }
}
// büyük harita: dokununca açılır, oyun durur
let mapFrom = null;
function openMap() {
  if (G.state !== 'play' || !minimap) return;
  mapFrom = G.state; G.state = 'map'; input.enabled = false; input.resetJoy();
  $('bigmap').classList.remove('hidden'); minimap.resize(); if (minimap.bz > 1) minimap.centerBig(L.x, L.z); minimap.drawBig(mapState());
}
function closeMap() {
  if (G.state !== 'map') return;
  $('bigmap').classList.add('hidden'); G.state = mapFrom || 'play'; input.enabled = G.state === 'play'; last = performance.now();
}
$('minimap').addEventListener('pointerdown', (e) => { e.stopPropagation(); });
$('minimap').addEventListener('click', () => { if (!minimap || !minimap.wasGesture()) openMap(); });
$('bmIn').addEventListener('click', () => minimap.zoomBigCenter(1.6));
$('bmOut').addEventListener('click', () => minimap.zoomBigCenter(1 / 1.6));
$('bmMe').addEventListener('click', () => { if (minimap.bz < 2) minimap.bz = 3; minimap.centerBig(L.x, L.z); });
$('bMapClose').addEventListener('click', closeMap);
$('bigmap').addEventListener('pointerdown', (e) => e.stopPropagation());
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') { if (G.state === 'map') closeMap(); else openMap(); } });
window.addEventListener('resize', () => minimap && minimap.resize());

// ---------- Ana döngü ----------
function tick(dt) {
  G.time += dt; G.clock += dt / 45;
  updateLion(dt); updateSurvival(dt); updateAlert(dt); updateHumans(dt); updatePrey(dt); updateHeli(dt); updateDrone(dt); updateMirage(dt);
  checkEndings(); updateCamera(dt);
}
G.tick = (n, dt = 0.05) => { for (let i = 0; i < n && G.state === 'play'; i++) tick(dt); updateSky(); };
let last = performance.now(), ambT = 0;
// ölçüm: window.__prof = {} verilirse bölüm başına CPU süresi (ms) birikir
let _pt = 0;
function pm(k) { const P = window.__prof; if (!P) return; const t = performance.now(); if (k) P[k] = (P[k] || 0) + t - _pt; _pt = t; }
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!world) return;
  pm();
  if (G.state === 'play') {
    tick(dt * G.timeScale); applyShake(dt); pm('tick'); updateHud(); pm('hud'); drawMinimap(dt); pm('map');
    ambT -= dt; if (ambT < 0) { ambT = 0.6 + rnd(); if (G.night > 0.5) audio.cricket(); else audio.bird(); }
    audio.setLoop('wind', 0.05 + (L.speed > 6 ? 0.05 : 0));
    audio.setLoop('water', waterDepth(L.x, L.z) > -0.5 ? 0.06 : 0);
  } else if (G.state === 'choice') {
    updateHumans(0); syncLion(dt, { speed: 0, crouch: 0.4, alert: 1, night: G.night > 0.5 }); updateCamera(dt); applyShake(dt); updateHeli(0);
  } else if (G.state === 'cine') {
    shakeOff.set(0, 0, 0); G.trauma = 0;
    director.update(dt);
    G.clock += dt / 120;
  } else if (G.state === 'end' || G.state === 'menu') {
    director.idle(dt);
  }
  for (const k in fxT) { fxT[k] -= dt; if (fxT[k] <= 0) { $(k).style.opacity = 0; delete fxT[k]; } }
  if (subT > 0) { subT -= dt; if (subT <= 0) $('subtitle').style.opacity = 0; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').style.opacity = 0; }
  pm('misc'); updateSky(); pm('sky');
  world.update(now / 1000);
  world.cull(camera, G.Q.view, G.Q.near, _focus.set(L.x, L.y + 0.9, L.z)); pm('cull');
  if (post.enabled) post.render(scene, camera); else renderer.render(scene, camera);
  pm('render');
  if (window.__prof) window.__prof.frames = (window.__prof.frames || 0) + 1;
  if (G.state === 'play') adaptQuality(dt);
  if (SET.fps) { fpsM.n++; fpsM.t += (now - fpsM.last) / 1000; fpsM.last = now; if (fpsM.t > 0.5) { $('fpsMeter').textContent = `${Math.round(fpsM.n / fpsM.t)} FPS · q${qLevel}`; fpsM.n = 0; fpsM.t = 0; } } else fpsM.last = now;
}
// arka plana geçince döngüyü durdur (pil ve ısınma); oyundaysa duraklatma menüsünü aç
let paused = false;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (audio.ctx) { if (paused) audio.ctx.suspend(); else audio.ctx.resume(); }
  last = performance.now(); fpsT = fpsN = 0; fpsWarm = 0;
  if (paused) { input.resetJoy(); if (G.state === 'play') openPause(); }
});

// ---------- Duraklatma / ayarlar ekranı ----------
let pauseFrom = null;
// ayar değişince hemen uygula
function applySetting(key) {
  saveSet();
  if (key === 'quality') { if (qParam === null) { qLevel = SET.quality >= 0 ? SET.quality : autoQ; applyQuality(); fpsWarm = 0; } }
  if (key === 'mapSize' || key === 'init') { document.body.style.setProperty('--mms', [0.75, 1, 1.35][SET.mapSize] ?? 1); if (minimap) requestAnimationFrame(() => minimap.resize()); }
  if (key === 'fps' || key === 'init') $('fpsMeter').classList.toggle('hidden', !SET.fps);
  if (key === 'lefty' || key === 'init') document.body.classList.toggle('lefty', !!SET.lefty);
  if (key === 'runToggle' && !SET.runToggle) { input.run = false; $('bRun').classList.remove('on'); }
  if (['vol', 'sfx', 'amb'].includes(key)) audio.applyVolumes();
  if (key === 'haptics' && SET.haptics) buzz(30);
}
const settingsUI = new SettingsUI($('pause'), SET, DIFFS, applySetting);
applySetting('init');
function renderToggles() { settingsUI.refresh(); }
function openPause(settingsOnly = false) {
  pauseFrom = G.state;
  if (!settingsOnly) { G.state = 'pause'; input.enabled = false; input.resetJoy(); if (audio.ctx) audio.ctx.suspend(); }
  $('pauseTitle').textContent = settingsOnly ? 'Ayarlar' : 'Duraklatıldı'; $('hint').style.opacity = 0; hintT = 0;
  $('bResume').textContent = settingsOnly ? 'TAMAM' : 'DEVAM';
  $('bMenu').parentElement.style.display = settingsOnly ? 'none' : '';
  renderToggles();
  $('pause').classList.remove('hidden');
  $('bResume').focus();
}
function closePause() {
  $('pause').classList.add('hidden');
  if (G.state === 'pause') { G.state = pauseFrom; input.enabled = G.state === 'play'; if (audio.ctx) audio.ctx.resume(); last = performance.now(); }
  ($('menu').classList.contains('hidden') ? $('app') : $('bStart')).focus?.();
}
G.openPause = openPause;
$('bPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); });
$('bPause').addEventListener('click', () => { if (G.state === 'play') openPause(); });
$('bSettings').addEventListener('click', () => openPause(true));
$('bResume').addEventListener('click', closePause);
$('bMenu').addEventListener('click', () => {
  $('pause').classList.add('hidden'); hideHud(); audio.setLoop('rotor', 0); if (audio.ctx) audio.ctx.resume();
  resetGame(); placeLion(CAGE.x, CAGE.z, -Math.PI / 2); G.state = 'menu'; director.menuCam(); $('menu').classList.remove('hidden'); $('bStart').focus();
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (G.state === 'play') openPause(); else if (!$('pause').classList.contains('hidden')) closePause();
});

// iOS arka planda WebGL bağlamını düşürebilir: varsayılan davranışı engelle, geri gelince sayfayı yenile
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); paused = true; $('loading').textContent = 'Grafik bağlamı kayboldu, yeniden yükleniyor…'; });
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

// ---------- Başlat ----------
setTimeout(async () => {
  try { await loadPeople(); } catch (e) { console.warn('İnsan modelleri yüklenemedi, basit modeller kullanılıyor', e); }
  try { await loadAnimals(); } catch (e) { console.warn('Hayvan modelleri yüklenemedi', e); }
  try { natureModels = await loadNature(); } catch (e) { console.warn('Doğa modelleri yüklenemedi, basit ağaçlar kullanılıyor', e); }
  try {
    setupWorld();
    resetGame();
    placeLion(CAGE.x, CAGE.z, -Math.PI / 2);
    director.menuCam();
    $('loading').textContent = '';
    $('bStart').disabled = false;
  } catch (e) { $('loading').textContent = 'Hata: ' + e.message; console.error(e); }
  requestAnimationFrame(frame);
}, 60);
$('bStart').disabled = true;
$('bStart').addEventListener('click', () => {
  audio.init();
  $('menu').classList.add('hidden');
  director.play(buildShots(G, 'intro'), () => startPlay());
});
$('skip').addEventListener('click', () => director.skip());
window.__wd = waterDepth; G.syncLion = syncLion; G.placeLion = placeLion; G.spawnHuman = spawnHuman;
