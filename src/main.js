// Sarıyer Aslanı — ana oyun
import * as THREE from '../lib/three.module.min.js';
import { World, height, waterDepth, PLACES, VILLA, CAGE, DEN, LAKES, HALF, roadDist, WATER_Y } from './world.js';
import { Feline } from './feline.js';
import { Human, Prey, PREY_TYPES } from './characters.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { clamp, lerp, damp, angleLerp, mulberry32, smooth } from './util.js';
import { Director, buildShots } from './cinema.js';

export const TRUE_SCORE = 600;
const $ = (id) => document.getElementById(id);
const rnd = Math.random;

// ---------- Render temel ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
});

const input = new Input();
const audio = new Audio();
export const G = {
  state: 'menu', time: 0, clock: 19.75, score: 0, world: null, scene, camera, audio, input,
  S: null, L: null, humans: [], prey: [], A: null, cubs: [], mirage: null,
  visited: new Set(), flags: {}, ending: null,
};
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

function syncLion(dt, st) {
  const swimD = waterDepth(L.x, L.z);
  L.swim = swimD > 0.55;
  let y = Math.max(height(L.x, L.z), L.swim ? WATER_Y - 0.72 : -99);
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
  const h = new Human(type, Math.floor(rnd() * 1e6));
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
  const p = new Prey(kind);
  scene.add(p.root);
  const n = { p, kind, P: PREY_TYPES[kind], x, z, y: height(x, z), yaw: rnd() * 6.28, state: 'graze', t: rnd() * 4, hp: PREY_TYPES[kind].hp, target: null, cd: 0 };
  G.prey.push(n);
  return n;
}

function randomLand(minFromLion = 0, tries = 60, filter = null) {
  for (let i = 0; i < tries; i++) {
    const x = (rnd() - 0.5) * (HALF * 2 - 80), z = (rnd() - 0.5) * (HALF * 2 - 80);
    if (height(x, z) < 2) continue;
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
  for (const h of G.humans) if (h.responder && h.state !== 'gone' && h.state !== 'engage') { h.state = 'travel'; h.target = { x: A.x + (rnd() - 0.5) * 30, z: A.z + (rnd() - 0.5) * 30 }; }
  if (!heli.active) {
    heli.active = true; heli.leaving = false; heli.g.visible = true;
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
  if (d > vd) return { ok: false, d, near: d < vd * 1.5 };
  const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
  const dot = ((L.x - n.x) * fx + (L.z - n.z) * fz) / (d || 1);
  return { ok: dot > -0.1 || d < 7, d, near: true };
}

// ---------- Oyun kurulumu ----------
function setupWorld() {
  world = new World(scene); G.world = world;
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
  if (G.mirage) { scene.remove(G.mirage.group); G.mirage = null; }
  G.time = 0; G.clock = 19.75; G.score = 0; G.visited = new Set(); G.flags = {}; G.ending = null;
  S = G.S = { health: 100, hunger: 85, thirst: 70, stamina: 100, sedation: 0, sedT: 0, starve: 0 };
  A = G.A = newAlert();
  heli.active = false; heli.g.visible = false; heli.cone.visible = heli.disc.visible = heli.spot.visible = false;
  drone.active = false; drone.g.visible = false; drone.ring.visible = false;
  L.f.dead = 0; L.f.sleep = 0; L.f.lie = 0; L.mode = 'free'; L.jumpY = 0; L.leftVilla = false;
  input.setCrouch(false);
  world.setCageDoor(0);
  populate();
}

function startPlay() {
  G.state = 'play';
  input.enabled = true; input.resetJoy();
  for (const id of ['hud', 'status', 'minimap', 'controls']) $(id).classList.remove('hidden');
  $('cine').classList.add('hidden');
  placeLion(VILLA.x - 40, VILLA.z + 2, -Math.PI / 2);
  G.camYaw = -Math.PI / 2; G.camPitch = 0.32; G.clock = 19.8;
  world.setCageDoor(1);
  hint('Ormana kaç! Sol tarafı sürükleyerek hareket et.', 5);
  setTimeout(() => G.state === 'play' && tip('run', '💨 Koş tuşuyla hızlanırsın ama enerjin azalır. 🌿 Sin tuşu seni daha zor görünür yapar.'), 7000);
}
G.startPlay = startPlay;

function hideHud() { $('hint').style.opacity = 0; hintT = 0; for (const id of ['hud', 'status', 'minimap', 'controls', 'choice']) $(id).classList.add('hidden'); input.enabled = false; input.resetJoy(); }
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
        if (p.hp <= 0) { p.state = 'dead'; p.t = 0; L.mode = 'eat'; L.modeT = 3; L.eating = p; }
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
  if (free) { L.x += Math.sin(L.yaw) * L.speed * dt; L.z += Math.cos(L.yaw) * L.speed * dt; }
  // derin deniz sınırı
  if (waterDepth(L.x, L.z) > 3.2) { const bx = L.x - Math.sin(L.yaw) * L.speed * dt * 2, bz = L.z - Math.cos(L.yaw) * L.speed * dt * 2; L.x = bx; L.z = bz; hint('Burası çok derin!', 1.5); }
  const p = { x: L.x, z: L.z }; world.collide(p, 0.7); L.x = p.x; L.z = p.z;
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
  L.mode = 'roar'; L.modeT = 1.3; L.roarCD = 8; audio.roar();
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
  S.hunger = Math.max(0, S.hunger - 0.3 * run * dt);
  S.thirst = Math.max(0, S.thirst - (L.swim ? 0 : 0.42 * run) * dt);
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
function updateMirage(dt) {
  G.mirT = (G.mirT ?? 18) - dt;
  const low = S.hunger < 32 || S.thirst < 32;
  if (!G.mirage && low && G.mirT <= 0 && G.time - A.lastSpot > 10) {
    G.mirT = 30 + rnd() * 15;
    const dx = DEN.x - L.x, dz = DEN.z - L.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const group = new THREE.Group();
    const cubs = [new Feline({ scale: 0.42, cub: true }), new Feline({ scale: 0.4, cub: true })];
    cubs.forEach((c, i) => {
      c.root.traverse((o) => { if (o.material && !o.material.userData.cl) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0; o.material.depthWrite = false; o.material.userData.cl = 1; } });
      c.root.position.set(i ? 1.2 : -0.8, 0, i ? 0.5 : 0);
      group.add(c.root);
    });
    const mx = L.x + ux * 20, mz = L.z + uz * 20;
    group.position.set(mx, height(mx, mz), mz);
    group.rotation.y = Math.atan2(-ux, -uz);
    scene.add(group);
    G.mirage = { group, cubs, t: 0 };
    $('fxMirage').style.opacity = 1;
    audio.cubMew();
    if (!G.flags.mir1) { G.flags.mir1 = 1; say('…Bu sesler? Bu kokular… Yavrularım?', 5); }
    else say(['Onlar bekliyor…', 'Çok uzakta değiller…', 'Ormanın derinliklerinde…'][Math.floor(rnd() * 3)], 4);
  }
  if (G.mirage) {
    const M = G.mirage; M.t += dt;
    const d = Math.hypot(M.group.position.x - L.x, M.group.position.z - L.z);
    const out = M.t > 7 || d < 7;
    M.fade = damp(M.fade || 0, out ? 0 : 0.6, out ? 3 : 1.2, dt);
    M.cubs.forEach((c, i) => {
      c.animate(dt, { speed: Math.sin(M.t * 2 + i) > 0.4 ? 1.5 : 0, look: Math.sin(M.t + i) * 0.5 });
      c.root.position.y = Math.abs(Math.sin(M.t * 3 + i * 2)) * 0.12;
      c.root.traverse((o) => { if (o.material) o.material.opacity = M.fade; });
    });
    if (out && M.fade < 0.02) { scene.remove(M.group); G.mirage = null; $('fxMirage').style.opacity = 0; }
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
    const near = d < 160;
    n.h.root.visible = near;
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
    if (near) {
      n.h.root.position.set(n.x, n.y, n.z); n.h.root.rotation.y = n.yaw;
      n.h.animate(dt, { speed: n.moving ? n.moving : speed, ...st });
      if (n.h.beam) n.h.beam.visible = G.night > 0.5;
    }
    n.moving = 0;
  }
}

function updateResponder(n, d, dt, st, setSpeed) {
  if (n.stun > 0) { st.cower = 0.6; return; }
  const armed = n.type === 'vet' || (A.armed && (n.type === 'polis' || n.type === 'jandarma'));
  const s = sees(n, n.type === 'vet' ? 42 : 40);
  if (s.ok && G.state === 'play') { n.state = 'engage'; n.lastSee = G.time; spotted(n.type === 'vet' ? '🧑‍⚕️ Hayvan kontrol ekibi seni gördü!' : (n.type === 'polis' ? '🚓 Polis seni gördü!' : '🪖 Jandarma seni gördü!')); }
  if (n.state === 'travel') {
    if (!n.target) n.target = { x: A.x, z: A.z };
    setSpeed(3.6); n.moving = 3.6;
    if (moveNpc(n, n.target.x, n.target.z, 3.6, dt) || Math.hypot(n.x - n.target.x, n.z - n.target.z) < 4) { n.state = 'search'; n.target = null; }
  } else if (n.state === 'search') {
    if (!n.target) n.target = { x: A.x + (rnd() - 0.5) * 70, z: A.z + (rnd() - 0.5) * 70 };
    setSpeed(2); n.moving = 2;
    if (moveNpc(n, n.target.x, n.target.z, 2, dt)) n.target = null;
    if (A.level === 0) { n.state = 'leave'; n.target = spawnPointNear(n.x, n.z, 200); }
  } else if (n.state === 'engage') {
    n.yaw = angleLerp(n.yaw, Math.atan2(L.x - n.x, L.z - n.z), 1 - Math.exp(-6 * dt));
    const range = n.type === 'vet' ? 26 : 38;
    if (!s.ok && G.time - (n.lastSee || 0) > 3) { n.state = 'search'; n.target = { x: A.x, z: A.z }; return; }
    if (d > range || !armed) { setSpeed(4.2); n.moving = 4.2; moveNpc(n, L.x, L.z, 4.2, dt); if (!armed && d < 9) { n.state = 'search'; } }
    else {
      st.aim = 1; n.shootCD -= dt;
      if (n.shootCD <= 0 && G.state === 'play') {
        n.shootCD = n.type === 'vet' ? 2.3 : 1.5;
        n.h.shoot();
        const running = L.speed > 6 ? 0.22 : 0;
        if (n.type === 'vet') {
          audio.dart();
          const pHit = 0.72 - d / 70 - running;
          if (rnd() < pHit) { S.sedation = Math.min(100, S.sedation + 34); S.sedT = 6; toast('💉 Uyuşturucu iğne isabet etti!', 'red', 'DİKKAT'); fx('fxSedate', 1); audio.hurt(); }
        } else {
          audio.gunshot();
          const pHit = 0.6 - d / 90 - running;
          if (rnd() < pHit) { S.health -= 30; S.lastHit = 'shot'; fx('fxDamage', 0.9); audio.hurt(); G.camShake = 0.6; }
        }
      }
    }
  } else if (n.state === 'leave') {
    setSpeed(3); n.moving = 3;
    if (!n.target || moveNpc(n, n.target.x, n.target.z, 3, dt) || d > 220) { n.state = 'gone'; scene.remove(n.h.root); }
  }
  if (n.state === 'search' && A.level === 0 && G.time - A.lastReport > 5) { n.state = 'leave'; n.target = spawnPointNear(n.x, n.z, 220); }
}

let fxT = {};
function fx(id, v) { $(id).style.opacity = v; fxT[id] = 0.5; }

function updatePrey(dt) {
  let alive = 0;
  for (const n of G.prey) {
    if (n.state === 'gone') continue;
    const d = Math.hypot(n.x - L.x, n.z - L.z);
    const near = d < 130; n.p.root.visible = near;
    if (n.state === 'dead') { n.p.animate(dt, 0, true); n.p.root.position.set(n.x, height(n.x, n.z), n.z); continue; }
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
      if (d < 1.8 && n.cd <= 0) { n.cd = 1.6; S.health -= n.P.danger; S.lastHit = 'boar'; fx('fxDamage', 0.7); audio.hurt(); G.camShake = 0.4; n.state = 'flee'; n.t = 0; }
      if (n.t > 6) { n.state = 'flee'; n.t = 0; }
    }
    n.y = height(n.x, n.z);
    if (near) { n.p.root.position.set(n.x, n.y, n.z); n.p.root.rotation.y = n.yaw; n.p.animate(dt, speed, false); }
  }
  if (alive < 38 && rnd() < dt * 0.3) {
    const q = randomLand(140, 40); const k = rnd(); spawnPrey(k < 0.5 ? 'tavsan' : k < 0.82 ? 'karaca' : 'domuz', q.x, q.z);
  }
}

// ---------- Helikopter / drone ----------
function updateHeli(dt) {
  if (!heli.active) { audio.setLoop('rotor', 0); return; }
  heli.rotor.rotation.y += dt * 25;
  heli.blink.visible = (G.time % 1) < 0.15;
  let tx, tz;
  const recent = G.time - A.lastSpot < 8;
  if (heli.leaving) { tx = heli.x + Math.sin(heli.yaw) * 100; tz = heli.z + Math.cos(heli.yaw) * 100; if (Math.abs(heli.x) > HALF + 300 || Math.abs(heli.z) > HALF + 300) { heli.active = false; heli.g.visible = false; heli.cone.visible = heli.disc.visible = heli.spot.visible = false; return; } }
  else {
    heli.ang += dt * 0.22;
    const R = recent ? 10 : 45;
    const cx = recent ? L.x : A.x, cz = recent ? L.z : A.z;
    tx = cx + Math.cos(heli.ang) * R; tz = cz + Math.sin(heli.ang) * R;
    if (A.level === 0) heli.leaving = true;
  }
  const dx = tx - heli.x, dz = tz - heli.z, d = Math.hypot(dx, dz);
  const sp = Math.min(26, d * 0.8 + 4);
  if (d > 0.1) { heli.x += dx / d * sp * dt; heli.z += dz / d * sp * dt; heli.yaw = angleLerp(heli.yaw, Math.atan2(dx, dz), 1 - Math.exp(-2 * dt)); }
  const gh = Math.max(0, height(heli.x, heli.z));
  heli.y = damp(heli.y, gh + 55, 1, dt);
  heli.g.position.set(heli.x, heli.y, heli.z); heli.g.rotation.set(0.12, heli.yaw, 0);
  // projektör noktası
  const spx = recent ? L.x : (heli.x + A.x) * 0.5 + Math.sin(G.time * 0.7) * 20, spz = recent ? L.z : (heli.z + A.z) * 0.5 + Math.cos(G.time * 0.6) * 20;
  heli.sx = damp(heli.sx || spx, spx, recent ? 1.2 : 0.8, dt); heli.sz = damp(heli.sz || spz, spz, recent ? 1.2 : 0.8, dt);
  const sy = Math.max(0, height(heli.sx, heli.sz));
  const night = G.night > 0.3;
  heli.spot.visible = night; heli.cone.visible = night; heli.disc.visible = true;
  heli.spot.position.set(0, -1.3, 0.5); heli.spot.target.position.set(heli.sx, sy, heli.sz);
  const top = new THREE.Vector3(heli.x, heli.y - 1.3, heli.z), bot = new THREE.Vector3(heli.sx, sy, heli.sz);
  const len = top.distanceTo(bot);
  heli.cone.position.copy(top).add(bot).multiplyScalar(0.5);
  heli.cone.scale.set(heli.R, len, heli.R);
  heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), bot.clone().sub(top).normalize());
  heli.disc.position.set(heli.sx, sy + 0.4, heli.sz); heli.disc.scale.setScalar(heli.R);
  heli.disc.material.opacity = night ? 0.22 : 0.08;
  // tespit
  const ld = Math.hypot(heli.sx - L.x, heli.sz - L.z);
  if (G.state === 'play' && !heli.leaving && ld < heli.R * 0.95 && world.canopy(L.x, L.z) < 0.5 && Math.hypot(L.x - DEN.x, L.z - DEN.z) > 9) spotted('🚁 Helikopterin ışığına yakalandın! Ağaçların altına kaç!');
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
  if (A.level > 0 && G.time - Math.max(A.lastSpot, A.lastReport) > 75) {
    A.level = 0; toast('📻 Arama bu bölgede durduruldu. Şimdilik güvendesin.', 'green', 'TELSİZ');
  }
  if (A.armed && G.time - Math.max(A.lastSpot, A.lastReport) > 150) A.armed = false;
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
  if (G.mirage) { scene.remove(G.mirage.group); G.mirage = null; }
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
const C = { nf: new THREE.Color('#18233a'), df: new THREE.Color('#a8c0cc'), dawn: new THREE.Color('#d9a07a'), tmp: new THREE.Color() };
function updateSky() {
  const h = ((G.clock % 24) + 24) % 24;
  const day = clamp(Math.sin(((h - 6) / 12) * Math.PI) * 1.6 + 0.1, 0, 1);
  const twilight = clamp(1 - Math.abs(day - 0.25) * 4, 0, 1);
  G.night = 1 - day;
  C.tmp.copy(C.nf).lerp(C.df, day).lerp(C.dawn, twilight * 0.35);
  scene.fog.color.copy(C.tmp); scene.background.copy(C.tmp);
  scene.fog.density = lerp(0.0062, 0.003, day);
  hemi.color.set('#7f95c8').lerp(new THREE.Color('#cfe3ff'), day);
  hemi.groundColor.set('#2c2c24').lerp(new THREE.Color('#5a4a30'), day);
  hemi.intensity = lerp(1.5, 1.15, day);
  sun.color.set('#b4c6f0').lerp(new THREE.Color('#fff1d6'), day).lerp(C.dawn, twilight * 0.4);
  sun.intensity = lerp(1.6, 2.5, day);
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
  }
  G.vis = (L ? lionVisibility() : 1);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  $('clock').textContent = `${G.night > 0.5 ? '🌙' : '☀️'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------- Kamera ----------
G.camYaw = 0; G.camPitch = 0.3; G.camShake = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const [lx, ly] = input.takeLook();
  G.camYaw -= lx * 0.006; G.camPitch = clamp(G.camPitch + ly * 0.004, 0.05, 1.1);
  if (!input.dragging && L.speed > 1 && G.state === 'play') G.camYaw = angleLerp(G.camYaw, L.yaw, 1 - Math.exp(-1.2 * dt));
  let dist = 6.2 + (L.speed > 6 ? 1.2 : 0);
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
  if (camPos.y < WATER_Y + 0.4) camPos.y = WATER_Y + 0.4;
  camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
  if (G.camShake > 0) { G.camShake -= dt; camera.position.x += (rnd() - 0.5) * G.camShake; camera.position.y += (rnd() - 0.5) * G.camShake; }
  camera.lookAt(camLook);
}

// ---------- HUD ----------
const barEls = {};
document.querySelectorAll('.bar').forEach((b) => (barEls[b.dataset.k] = b));
function updateHud() {
  for (const k of ['health', 'hunger', 'thirst', 'stamina', 'sedation']) {
    const v = clamp(S[k], 0, 100);
    barEls[k].querySelector('b').style.width = v + '%';
    barEls[k].classList.toggle('low', k === 'sedation' ? v > 60 : v < 25);
  }
  barEls.sedation.style.display = S.sedation > 1 ? 'flex' : 'none';
  $('score').textContent = `⭐ ${G.score}`;
  const eye = $('eye');
  const seen = G.time - A.lastSpot < 3;
  let sus = false;
  if (!seen) for (const n of G.humans) { if (n.state === 'gone' || n.state === 'down') continue; if (Math.hypot(n.x - L.x, n.z - L.z) < 45 * G.vis) { sus = true; break; } }
  if (!seen && heli.active && Math.hypot(heli.sx - L.x, heli.sz - L.z) < 30) sus = true;
  eye.className = seen ? 'seen' : sus ? 'sus' : '';
  eye.textContent = seen ? '👁️ GÖRÜLDÜN!' : sus ? '⚠️ Dikkat, yakında biri var' : (G.vis < 0.5 ? '🌿 Saklanıyorsun' : '🌲 Gizli');
  $('alertTxt').textContent = A.level >= 2 ? '🚨 Polis silahlı arıyor' : A.level === 1 ? '🔎 Ekipler arıyor' : '';
  $('fxSedate').style.opacity = Math.max(+$('fxSedate').style.opacity * 0.98, S.sedation / 130);
}

// ---------- Mini harita ----------
let miniBg = null;
function buildMinimap() {
  const N = 200; miniBg = document.createElement('canvas'); miniBg.width = miniBg.height = N;
  const c = miniBg.getContext('2d'); const img = c.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N - 0.5) * HALF * 2, z = (j / N - 0.5) * HALF * 2, h = height(x, z), k = (j * N + i) * 4;
    let r, g, b;
    if (h < 0) { r = 40; g = 90; b = 130; } else { const t = clamp(h / 50, 0, 1); r = 70 + t * 40; g = 100 + t * 30; b = 50 + t * 20; if (roadDist(x, z) < 6) { r = g = b = 150; } }
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  c.fillStyle = 'rgba(30,60,25,.5)';
  for (const t of world.trees) { if (Math.random() < 0.35) c.fillRect((t.x / (HALF * 2) + 0.5) * N, (t.z / (HALF * 2) + 0.5) * N, 1.2, 1.2); }
  c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
  for (const p of PLACES) { const x = (p.x / (HALF * 2) + 0.5) * N, y = (p.z / (HALF * 2) + 0.5) * N; c.fillStyle = '#e8d8b8'; c.fillRect(x - 2, y - 2, 4, 4); c.fillStyle = '#fff'; c.fillText(p.name, x, y - 4); }
  c.fillText('Belgrad Ormanı', 50, 115); c.fillText('KARADENİZ', 100, 10);
  const vx = (VILLA.x / (HALF * 2) + 0.5) * N, vy = (VILLA.z / (HALF * 2) + 0.5) * N; c.font = '10px sans-serif'; c.fillText('🏠', vx, vy + 4);
}
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const N = 200, sc = N / (HALF * 2), zoom = 2.2;
  mm.save(); mm.clearRect(0, 0, N, N);
  mm.beginPath(); mm.arc(N / 2, N / 2, N / 2, 0, 7); mm.clip();
  mm.translate(N / 2, N / 2); mm.scale(zoom, zoom);
  const lx = (L.x / (HALF * 2) + 0.5) * N, lz = (L.z / (HALF * 2) + 0.5) * N;
  mm.translate(-lx, -lz);
  mm.drawImage(miniBg, 0, 0);
  if (A.level > 0) { mm.strokeStyle = A.level > 1 ? '#ff3b30' : '#ffb340'; mm.lineWidth = 1.2; mm.beginPath(); mm.arc((A.x / (HALF * 2) + 0.5) * N, (A.z / (HALF * 2) + 0.5) * N, 6, 0, 7); mm.stroke(); }
  if (heli.active) { mm.fillStyle = '#fff'; mm.beginPath(); mm.arc((heli.x / (HALF * 2) + 0.5) * N, (heli.z / (HALF * 2) + 0.5) * N, 1.6, 0, 7); mm.fill(); }
  mm.fillStyle = '#ff5a4a';
  for (const n of G.humans) if (n.responder && n.state !== 'gone' && Math.hypot(n.x - L.x, n.z - L.z) < 90) { mm.beginPath(); mm.arc((n.x / (HALF * 2) + 0.5) * N, (n.z / (HALF * 2) + 0.5) * N, 1, 0, 7); mm.fill(); }
  mm.translate(lx, lz); mm.rotate(-L.yaw + Math.PI);
  mm.fillStyle = '#ffd34a'; mm.strokeStyle = '#000'; mm.lineWidth = 0.4;
  mm.beginPath(); mm.moveTo(0, -3.2); mm.lineTo(2.2, 2.4); mm.lineTo(0, 1.3); mm.lineTo(-2.2, 2.4); mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}

// ---------- Ana döngü ----------
function tick(dt) {
  G.time += dt; G.clock += dt / 45;
  updateLion(dt); updateSurvival(dt); updateAlert(dt); updateHumans(dt); updatePrey(dt); updateHeli(dt); updateDrone(dt); updateMirage(dt);
  checkEndings(); updateCamera(dt);
}
G.tick = (n, dt = 0.05) => { for (let i = 0; i < n && G.state === 'play'; i++) tick(dt); updateSky(); };
let last = performance.now(), ambT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!world) return;
  if (G.state === 'play') {
    tick(dt); updateHud(); drawMinimap();
    ambT -= dt; if (ambT < 0) { ambT = 0.6 + rnd(); if (G.night > 0.5) audio.cricket(); else audio.bird(); }
    audio.setLoop('wind', 0.05 + (L.speed > 6 ? 0.05 : 0));
    audio.setLoop('water', waterDepth(L.x, L.z) > -0.5 ? 0.06 : 0);
  } else if (G.state === 'choice') {
    updateHumans(0); syncLion(dt, { speed: 0, crouch: 0.4, alert: 1, night: G.night > 0.5 }); updateCamera(dt); updateHeli(0);
  } else if (G.state === 'cine') {
    director.update(dt);
    G.clock += dt / 120;
  } else if (G.state === 'end' || G.state === 'menu') {
    director.idle(dt);
  }
  for (const k in fxT) { fxT[k] -= dt; if (fxT[k] <= 0) { $(k).style.opacity = 0; delete fxT[k]; } }
  if (subT > 0) { subT -= dt; if (subT <= 0) $('subtitle').style.opacity = 0; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').style.opacity = 0; }
  updateSky();
  world.update(G.time);
  renderer.render(scene, camera);
}

// ---------- Başlat ----------
setTimeout(() => {
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
