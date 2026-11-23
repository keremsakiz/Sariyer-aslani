// Dünya: Sarıyer'in kuzeyi (stilize). Arazi, göller, Karadeniz, orman, köyler, villa ve gizli in.
import * as THREE from '../lib/three.module.min.js';
import { mulberry32, clamp, lerp, smooth, fbm } from './util.js';

export const HALF = 800;              // harita yarı boyu (metre)
export const WATER_Y = 0;

export const PLACES = [
  { id: 'uskumru', name: 'Uskumruköy', x: 250, z: -250, r: 45, houses: 14 },
  { id: 'kilyos', name: 'Kilyos', x: 380, z: -585, r: 50, houses: 16 },
  { id: 'demirci', name: 'Demirciköy', x: -150, z: -540, r: 40, houses: 11 },
  { id: 'zekeriya', name: 'Zekeriyaköy', x: -40, z: -40, r: 60, houses: 22 },
  { id: 'bahce', name: 'Bahçeköy', x: -360, z: 380, r: 55, houses: 18 },
];
export const VILLA = { x: 340, z: -330, yaw: Math.PI / 2 };
export const CAGE = { x: VILLA.x + 6, z: VILLA.z + 14 };
export const DEN = { x: -640, z: -250 };
export const LAKES = [
  { name: 'Büyük Bent', x: -450, z: 40, r: 58 },
  { name: 'Valide Sultan Bendi', x: -230, z: 470, r: 40 },
  { x: 120, z: 150, r: 15 }, { x: 430, z: 80, r: 13 }, { x: -600, z: -450, r: 17 },
  { x: -60, z: -330, r: 13 }, { x: 600, z: -150, r: 15 }, { x: 210, z: 500, r: 16 },
  { x: -700, z: 120, r: 14 }, { x: 40, z: -620, r: 12 }, { x: -520, z: -120, r: 11 },
];
const ROADS = [
  [[250, -250], [320, -420], [380, -585]],
  [[250, -250], [120, -150], [-40, -40]],
  [[-40, -40], [-90, -300], [-150, -540]],
  [[-40, -40], [-200, 180], [-360, 380]],
  [[250, -250], [330, -300]],
  [[-40, -40], [300, 60], [800, 120]],
  [[-360, 380], [-260, 600], [-200, 800]],
  [[380, -585], [600, -560], [800, -520]],
];
const TRAILS = [
  [[-360, 380], [-430, 200], [-420, 110]],
  [[-470, -20], [-560, -150], [-610, -240]],
  [[-150, -540], [-380, -420], [-560, -330]],
];

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
function polyDist(px, pz, lines) {
  let d = 1e9;
  for (const L of lines) for (let i = 0; i < L.length - 1; i++) d = Math.min(d, segDist(px, pz, L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]));
  return d;
}
export const roadDist = (x, z) => polyDist(x, z, ROADS);
export const trailDist = (x, z) => polyDist(x, z, TRAILS);

function baseHeight(x, z) {
  let h = 20 + fbm(x / 280, z / 280, 4) * 46 + fbm(x / 55, z / 55, 3) * 5;
  // Belgrad Ormanı biraz daha alçak ve yumuşak vadiler
  h -= smooth(clamp((-x - 100) / 300, 0, 1)) * 6;
  return Math.max(h, 3);
}
const placeH = new Map();
for (const p of [...PLACES, { id: 'villa', x: VILLA.x, z: VILLA.z }]) placeH.set(p.id, baseHeight(p.x, p.z));

export function height(x, z) {
  let h = baseHeight(x, z);
  // köyler ve villa düzlüğü
  for (const p of PLACES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 60) h = lerp(placeH.get(p.id), h, smooth(clamp((d - p.r) / 60, 0, 1)));
  }
  {
    const d = Math.hypot(x - VILLA.x, z - VILLA.z);
    if (d < 90) h = lerp(placeH.get('villa'), h, smooth(clamp((d - 35) / 55, 0, 1)));
  }
  // yollar: hafif düzleştir
  const rd = roadDist(x, z);
  if (rd < 14) h = lerp(h - 0.6, h, smooth(rd / 14));
  // Karadeniz (kuzey)
  const coast = -660 + fbm(x / 120, 3.3, 3) * 50;
  if (z < coast + 30) h = lerp(h, -14, smooth(clamp((coast + 30 - z) / 90, 0, 1)));
  // göller
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z) + fbm(x / 20, z / 20, 2) * L.r * 0.35;
    if (d < L.r * 1.6) h = lerp(-3.5, h, smooth(clamp((d - L.r * 0.75) / (L.r * 0.85), 0, 1)));
  }
  return h;
}

export function waterDepth(x, z) { return WATER_Y - height(x, z); }

// ---------- Ağaç dağılımı ----------
function forestDensity(x, z, h) {
  if (h < 1.4) return 0;
  let d = 0.22 + fbm(x / 90 + 7, z / 90, 3) * 0.9;
  d += smooth(clamp((-x - 80) / 250, 0, 1)) * 0.7;      // Belgrad Ormanı
  for (const p of PLACES) { const dd = Math.hypot(x - p.x, z - p.z); if (dd < p.r + 25) d *= smooth(clamp((dd - p.r * 0.6) / 40, 0, 1)) * 0.8 + 0.05; }
  if (Math.hypot(x - VILLA.x, z - VILLA.z) < 45) d = 0;
  if (Math.hypot(x - DEN.x, z - DEN.z) < 14) d = 0;
  const rd = roadDist(x, z); if (rd < 8) d = 0;
  if (trailDist(x, z) < 3.5) d = 0;
  return clamp(d, 0, 1);
}

// ---------- Sahne inşası ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];             // {x,z,r,type}
    this.treeGrid = new Map();
    this.boxes = [];             // ev çarpışma kutuları {x,z,hw,hd,cos,sin}
    this.windowsMat = null;
    this.rng = mulberry32(2211);
    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildRocks();
    this.buildVillages();
    this.buildVilla();
    this.buildDen();
    this.buildSky();
  }

  buildTerrain() {
    const S = 1600, N = 220;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color('#5f7f3a'), grass2 = new THREE.Color('#7a8f45'), forest = new THREE.Color('#3f4f26');
    const dirt = new THREE.Color('#7b6646'), sand = new THREE.Color('#c9b48a'), rock = new THREE.Color('#7d776c');
    const road = new THREE.Color('#4a4845'), mud = new THREE.Color('#4b4433');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = height(x, z);
      pos.setY(i, h);
      const n = fbm(x / 30, z / 30, 2);
      c.copy(grass).lerp(grass2, clamp(n + 0.5, 0, 1));
      const fd = forestDensity(x, z, h);
      c.lerp(forest, clamp(fd * 1.2, 0, 0.85));
      const slope = Math.abs(height(x + 2, z) - h) + Math.abs(height(x, z + 2) - h);
      if (slope > 2.4) c.lerp(rock, clamp((slope - 2.4) / 2, 0, 0.8));
      if (h < 2.2) c.lerp(h < 0.6 ? mud : sand, clamp((2.2 - h) / 1.6, 0, 1));
      if (z < -600 && h < 3.5) c.lerp(sand, clamp((3.5 - h) / 2, 0, 1));
      const rd = roadDist(x, z); if (rd < 5.5) c.lerp(road, smooth(clamp((5.5 - rd) / 2.5, 0, 1)));
      const td = trailDist(x, z); if (td < 3) c.lerp(dirt, smooth(clamp((3 - td) / 1.5, 0, 0.9)));
      for (const p of PLACES) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) c.lerp(dirt, 0.15 * (1 - d / p.r)); }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(g, m);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(2400, 2400, 1, 1); g.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2a5a72', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.86 });
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.position.y = WATER_Y;
    this.scene.add(this.water);
  }

  addTree(x, z, r, type) {
    const t = { x, z, r, type };
    this.trees.push(t);
    const k = `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
    if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
    this.treeGrid.get(k).push(t);
  }
  nearTrees(x, z, rad, out = []) {
    out.length = 0;
    const c0 = Math.floor((x - rad) / 10), c1 = Math.floor((x + rad) / 10), r0 = Math.floor((z - rad) / 10), r1 = Math.floor((z + rad) / 10);
    for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) { const a = this.treeGrid.get(`${i},${j}`); if (a) for (const t of a) out.push(t); }
    return out;
  }
  // Ağaç örtüsü 0..1 (helikopterden saklanma)
  canopy(x, z) {
    let best = 0;
    for (const t of this.nearTrees(x, z, 7)) { const d = Math.hypot(t.x - x, t.z - z); best = Math.max(best, clamp(1 - (d - t.r * 0.6) / (t.r * 1.4), 0, 1)); }
    return best;
  }

  buildTrees() {
    const rnd = this.rng;
    const pts = [];
    const step = 8.5;
    for (let x = -HALF + 4; x < HALF; x += step) for (let z = -HALF + 4; z < HALF; z += step) {
      const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
      const h = height(px, pz);
      if (rnd() < forestDensity(px, pz, h)) pts.push([px, pz, h]);
    }
    const MAX = 7500;
    while (pts.length > MAX) pts.splice(Math.floor(rnd() * pts.length), 1);
    const broad = [], pine = [];
    for (const [x, z, h] of pts) (rnd() < 0.72 || x < -150 && rnd() < 0.85 ? broad : pine).push([x, z, h]);

    const trunkG = new THREE.CylinderGeometry(0.22, 0.38, 1, 6); trunkG.translate(0, 0.5, 0);
    const trunkM = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 1 });
    const crownG = new THREE.IcosahedronGeometry(1, 1);
    const crownM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const pineG = new THREE.ConeGeometry(1, 1, 7); pineG.translate(0, 0.5, 0);
    const pineM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });

    const total = broad.length + pine.length;
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, total);
    const crowns = new THREE.InstancedMesh(crownG, crownM, broad.length * 2);
    const pines = new THREE.InstancedMesh(pineG, pineM, pine.length * 2);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color();
    let ti = 0, ci = 0, pi = 0;
    const greens = ['#3d6b2c', '#4b7a31', '#56823a', '#3a5f2a', '#6a8a3a', '#7a7a32'];
    for (const [x, z, h] of broad) {
      const sc = 0.8 + rnd() * 0.7, th = 3.2 * sc;
      p.set(x, h - 0.2, z); s.set(sc, th, sc); q.identity(); mtx.compose(p, q, s); trunks.setMatrixAt(ti++, mtx);
      const cr = 2.6 * sc;
      for (let k = 0; k < 2; k++) {
        p.set(x + (rnd() - 0.5) * cr * 0.6, h + th + cr * (0.35 + k * 0.45), z + (rnd() - 0.5) * cr * 0.6);
        e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
        const kk = k ? 0.72 : 1; s.set(cr * kk * (0.9 + rnd() * 0.3), cr * kk * 0.85, cr * kk * (0.9 + rnd() * 0.3));
        mtx.compose(p, q, s); crowns.setMatrixAt(ci, mtx);
        col.set(greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3); crowns.setColorAt(ci++, col);
      }
      this.addTree(x, z, cr, 'broad');
    }
    for (const [x, z, h] of pine) {
      const sc = 0.9 + rnd() * 0.8, th = 2 * sc;
      p.set(x, h - 0.2, z); s.set(sc * 0.8, th, sc * 0.8); q.identity(); mtx.compose(p, q, s); trunks.setMatrixAt(ti++, mtx);
      for (let k = 0; k < 2; k++) {
        const w = (k ? 1.6 : 2.4) * sc, hh = (k ? 4 : 5) * sc;
        p.set(x, h + th * 0.7 + k * 3 * sc, z); q.identity(); s.set(w, hh, w); mtx.compose(p, q, s); pines.setMatrixAt(pi, mtx);
        col.set(k ? '#2f5a36' : '#2a4f30').multiplyScalar(0.85 + rnd() * 0.3); pines.setColorAt(pi++, col);
      }
      this.addTree(x, z, 2.2 * sc, 'pine');
    }
    for (const m of [trunks, crowns, pines]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; this.scene.add(m); }
    trunks.castShadow = false; crowns.castShadow = false;
    // çalılar (saklanmak için)
    const bushG = new THREE.IcosahedronGeometry(1, 0);
    const bushM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
    const nb = 2600; const bushes = new THREE.InstancedMesh(bushG, bushM, nb);
    this.bushes = [];
    let bi = 0;
    for (let k = 0; k < nb * 3 && bi < nb; k++) {
      const x = (rnd() - 0.5) * HALF * 2, z = (rnd() - 0.5) * HALF * 2, h = height(x, z);
      const fd = forestDensity(x, z, h);
      if (h < 1.2 || rnd() > fd * 0.9 + 0.1 || roadDist(x, z) < 7) continue;
      const sc = 0.9 + rnd() * 1.2;
      p.set(x, h + sc * 0.35, z); e.set(0, rnd() * 6, 0); q.setFromEuler(e); s.set(sc * 1.4, sc * 0.8, sc * 1.3);
      mtx.compose(p, q, s); bushes.setMatrixAt(bi, mtx);
      col.set(rnd() < 0.5 ? '#4f6e2c' : '#5d7a33').multiplyScalar(0.8 + rnd() * 0.3); bushes.setColorAt(bi++, col);
      this.bushes.push({ x, z, r: sc * 1.4 });
      const kk = `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
      if (!this.bushGrid) this.bushGrid = new Map();
      if (!this.bushGrid.has(kk)) this.bushGrid.set(kk, []);
      this.bushGrid.get(kk).push(this.bushes[this.bushes.length - 1]);
    }
    bushes.count = bi; bushes.instanceMatrix.needsUpdate = true; bushes.instanceColor.needsUpdate = true; bushes.frustumCulled = false;
    this.scene.add(bushes);
  }
  inBush(x, z) {
    const a = this.bushGrid && this.bushGrid.get(`${Math.floor(x / 10)},${Math.floor(z / 10)}`);
    if (!a) return false;
    for (const b of a) if (Math.hypot(b.x - x, b.z - z) < b.r) return true;
    return false;
  }

  buildRocks() {
    const rnd = this.rng;
    const g = new THREE.DodecahedronGeometry(1, 0);
    const m = new THREE.MeshStandardMaterial({ color: '#8a857a', roughness: 1, flatShading: true });
    const n = 500; const rocks = new THREE.InstancedMesh(g, m, n);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let i = 0; this.rocks = [];
    while (i < n) {
      const x = (rnd() - 0.5) * HALF * 2, z = (rnd() - 0.5) * HALF * 2, h = height(x, z);
      if (h < 0.5 || roadDist(x, z) < 8) continue;
      const sc = 0.5 + rnd() * rnd() * 3;
      p.set(x, h + sc * 0.2, z); e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e); s.set(sc * 1.3, sc * 0.8, sc);
      mtx.compose(p, q, s); rocks.setMatrixAt(i++, mtx);
      if (sc > 1.2) this.rocks.push({ x, z, r: sc * 1.1 });
    }
    rocks.instanceMatrix.needsUpdate = true; rocks.frustumCulled = false;
    this.scene.add(rocks);
  }

  buildVillages() {
    const rnd = this.rng;
    const houses = [];
    for (const pl of PLACES) {
      let tries = 0, placed = 0;
      while (placed < pl.houses && tries++ < 400) {
        const a = rnd() * Math.PI * 2, d = 6 + rnd() * pl.r;
        const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
        if (roadDist(x, z) < 9) continue;
        const w = 6 + rnd() * 5, dd = 6 + rnd() * 4, hh = 3.2 + (rnd() < 0.35 ? 3 : 0);
        const yaw = Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3;
        if (houses.some(o => Math.hypot(o.x - x, o.z - z) < (Math.max(w, dd) + Math.max(o.w, o.d)) * 0.62)) continue;
        houses.push({ x, z, w, d: dd, h: hh, yaw, y: height(x, z) });
        placed++;
      }
    }
    this.houses = houses;
    this.makeHouses(houses);
  }

  makeHouses(houses, extra = {}) {
    const n = houses.length;
    const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
    const wallM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const roofG = new THREE.ConeGeometry(0.75, 1, 4, 1); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.5, 0);
    const roofM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true });
    const winG = new THREE.PlaneGeometry(1, 1);
    if (!this.windowsMat) this.windowsMat = new THREE.MeshStandardMaterial({ color: '#2a2418', emissive: '#ffcf7a', emissiveIntensity: 1, roughness: 0.5 });
    const walls = new THREE.InstancedMesh(wallG, wallM, n), roofs = new THREE.InstancedMesh(roofG, roofM, n);
    const wins = new THREE.InstancedMesh(winG, this.windowsMat, n * 6);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color(); const rnd = this.rng;
    const wallCols = ['#efe6d6', '#e9dcc3', '#f3efe6', '#e2cfb0', '#d8d2c4', '#efd9b8'];
    const roofCols = ['#a4492e', '#b5573a', '#8f3f2a', '#9b5236', '#6d6a66'];
    let wi = 0;
    houses.forEach((hs, i) => {
      e.set(0, hs.yaw, 0); q.setFromEuler(e);
      p.set(hs.x, hs.y - 0.5, hs.z); s.set(hs.w, hs.h + 0.5, hs.d); mtx.compose(p, q, s); walls.setMatrixAt(i, mtx);
      col.set(hs.wall || wallCols[Math.floor(rnd() * wallCols.length)]); walls.setColorAt(i, col);
      p.set(hs.x, hs.y + hs.h, hs.z); s.set(hs.w * 1.45, hs.roofH || 2.4, hs.d * 1.45); mtx.compose(p, q, s); roofs.setMatrixAt(i, mtx);
      col.set(hs.roof || roofCols[Math.floor(rnd() * roofCols.length)]); roofs.setColorAt(i, col);
      const cos = Math.cos(hs.yaw), sin = Math.sin(hs.yaw);
      const floors = hs.h > 5 ? 2 : 1;
      for (let f = 0; f < floors; f++) for (const side of [1, -1]) for (const off of [-0.25, 0.25]) {
        if (wi >= n * 6) break;
        // pencere yerel konumu (ön/arka yüz)
        const lx = off * hs.w, lz = side * (hs.d / 2 + 0.03);
        p.set(hs.x + lx * cos + lz * sin, hs.y + 1.6 + f * 3, hs.z - lx * sin + lz * cos);
        e.set(0, hs.yaw + (side > 0 ? 0 : Math.PI), 0); q.setFromEuler(e); s.set(1.1, 1.2, 1);
        mtx.compose(p, q, s); wins.setMatrixAt(wi++, mtx);
      }
      this.boxes.push({ x: hs.x, z: hs.z, hw: hs.w / 2 + 0.3, hd: hs.d / 2 + 0.3, cos, sin });
    });
    wins.count = wi;
    for (const m of [walls, roofs, wins]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; m.castShadow = m !== wins; m.receiveShadow = true; this.scene.add(m); }
  }

  buildVilla() {
    const V = VILLA, y = height(V.x, V.z);
    this.villaY = y;
    const grp = new THREE.Group(); grp.position.set(V.x, y, V.z); this.scene.add(grp);
    this.villaGroup = grp;
    // Ana bina (büyük, modern villa)
    this.makeHouses([
      { x: V.x - 8, z: V.z - 6, w: 18, d: 11, h: 6.5, yaw: 0, y, wall: '#f5f2ea', roof: '#3d3b39', roofH: 1.4 },
      { x: V.x + 6, z: V.z - 10, w: 8, d: 7, h: 3.4, yaw: 0, y, wall: '#e9e4d8', roof: '#3d3b39', roofH: 1 },
    ]);
    // Bahçe çimi
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(56, 44), new THREE.MeshStandardMaterial({ color: '#6c9a3e', roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.06, 2); lawn.receiveShadow = true; grp.add(lawn);
    // Havuz
    const pool = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 5), new THREE.MeshStandardMaterial({ color: '#3fb6d8', emissive: '#0d4c66', emissiveIntensity: 0.6, roughness: 0.1 }));
    pool.position.set(-8, 0.05, 8); grp.add(pool);
    // Bahçe duvarı (batıda kapı boşluğu)
    const wallM = new THREE.MeshStandardMaterial({ color: '#d9d2c2', roughness: 1 });
    const segs = [[0, -20, 56, 1], [0, 24, 56, 1], [28, 2, 1, 44], [-28, -12, 1, 16], [-28, 16, 1, 16]];
    for (const [x, z, w, d] of segs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), wallM); m.position.set(x, 1.1, z); m.castShadow = true; m.receiveShadow = true; grp.add(m);
      this.boxes.push({ x: V.x + x, z: V.z + z, hw: w / 2 + 0.2, hd: d / 2 + 0.2, cos: 1, sin: 0 });
    }
    // Kafes
    const cage = new THREE.Group(); cage.position.set(CAGE.x - V.x, 0, CAGE.z - V.z); grp.add(cage);
    const barM = new THREE.MeshStandardMaterial({ color: '#2b2b2e', metalness: 0.7, roughness: 0.4 });
    const barG = new THREE.CylinderGeometry(0.05, 0.05, 3, 5); barG.translate(0, 1.5, 0);
    const W = 8, D = 6;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, D), new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 1 }));
    floor.position.y = 0.08; floor.receiveShadow = true; cage.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), barM); roof.position.y = 3; cage.add(roof);
    const addBar = (x, z, parent = cage) => { const b = new THREE.Mesh(barG, barM); b.position.set(x, 0, z); parent.add(b); };
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.4) { addBar(x, -D / 2); addBar(x, D / 2); }
    for (let z = -D / 2; z <= D / 2; z += 0.4) addBar(W / 2, z);
    // kapı (batı yüzü), menteşe kuzeyde
    const door = new THREE.Group(); door.position.set(-W / 2, 0, -D / 2); cage.add(door);
    for (let z = 0; z <= D + 0.01; z += 0.4) addBar(0, z, door);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, D), barM); frame.position.set(0, 2.9, D / 2); door.add(frame);
    this.cageDoor = door; this.cageGroup = cage;
    // kafes çarpışması: kuzey, güney, doğu kenarları
    const cx = CAGE.x, cz = CAGE.z;
    this.cageBoxes = [
      { x: cx, z: cz - D / 2, hw: W / 2, hd: 0.2, cos: 1, sin: 0 },
      { x: cx, z: cz + D / 2, hw: W / 2, hd: 0.2, cos: 1, sin: 0 },
      { x: cx + W / 2, z: cz, hw: 0.2, hd: D / 2, cos: 1, sin: 0 },
    ];
    this.cageDoorBox = { x: cx - W / 2, z: cz, hw: 0.2, hd: D / 2, cos: 1, sin: 0 };
    this.boxes.push(...this.cageBoxes, this.cageDoorBox);
    // Lambalar (sıcak ışık)
    const lampM = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffd48a', emissiveIntensity: 2 });
    for (const [x, z] of [[-26, -18], [26, -18], [-26, 22], [26, 22], [-28, -2.5], [-28, 6.5]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), lampM); l.position.set(x, 2.6, z); grp.add(l);
    }
    this.villaLight = new THREE.PointLight('#ffcc88', 30, 40, 1.6); this.villaLight.position.set(0, 6, 6); grp.add(this.villaLight);
    // Güvenlik kamerası (direk)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4), barM); pole.position.set(-27, 2, -4); grp.add(pole);
    const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: '#ddd' })); camBox.position.set(-27, 4, -4); grp.add(camBox);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff2020' })); red.position.set(-26.68, 4.05, -4); grp.add(red);
  }

  setCageDoor(open01) { this.cageDoor.rotation.y = -open01 * 1.9; this.cageDoorBox.hw = open01 > 0.3 ? 0 : 0.2; }

  buildDen() {
    const D = DEN, y = height(D.x, D.z);
    this.denY = y;
    const grp = new THREE.Group(); grp.position.set(D.x, y, D.z); this.scene.add(grp);
    const m = new THREE.MeshStandardMaterial({ color: '#7a7365', roughness: 1, flatShading: true });
    const rnd = mulberry32(77);
    // kaya yığını, doğuya açılan mağara ağzı
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 0.25 + (i / 18) * Math.PI * 1.5;
      const r = 6 + rnd() * 2;
      const s = 2 + rnd() * 2.5;
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m);
      rk.position.set(Math.cos(a) * r - 4, s * 0.4 + rnd(), Math.sin(a) * r); rk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rk.castShadow = true; grp.add(rk);
      this.rocks.push({ x: D.x + rk.position.x, z: D.z + rk.position.z, r: s * 0.9 });
    }
    const top = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), m); top.position.set(-5, 6, 0); top.scale.set(1.2, 0.6, 1.1); grp.add(top);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(3.2, 12), new THREE.MeshBasicMaterial({ color: '#0d0b08' }));
    dark.position.set(-1, 2.2, 0); dark.rotation.y = Math.PI / 2; grp.add(dark);
    // in yatağı (kuru otlar)
    const straw = new THREE.Mesh(new THREE.CircleGeometry(4, 14), new THREE.MeshStandardMaterial({ color: '#b39a5e', roughness: 1 }));
    straw.rotation.x = -Math.PI / 2; straw.position.set(1, 0.08, 0); grp.add(straw);
    this.denGroup = grp;
  }

  buildSky() {
    // Yıldızlar
    const n = 900, pos = new Float32Array(n * 3), rnd = mulberry32(5);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.9 + 0.1);
      pos[i * 3] = Math.cos(th) * Math.sin(ph) * 1500; pos[i * 3 + 1] = Math.cos(ph) * 1500; pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * 1500;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false });
    this.stars = new THREE.Points(g, this.starsMat); this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: '#f4f1e0', fog: false }));
    this.scene.add(this.moon);
  }

  // Ağaçlar, kayalar ve evlerle çarpışma (daire)
  collide(p, r) {
    for (const t of this.nearTrees(p.x, p.z, 3)) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), m = r + 0.45;
      if (d < m && d > 0.001) { p.x = t.x + dx / d * m; p.z = t.z + dz / d * m; }
    }
    for (const k of this.rocks) {
      if (Math.abs(p.x - k.x) > 8 || Math.abs(p.z - k.z) > 8) continue;
      const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz), m = r + k.r;
      if (d < m && d > 0.001) { p.x = k.x + dx / d * m; p.z = k.z + dz / d * m; }
    }
    for (const b of this.boxes) {
      if (b.hw === 0) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      // yerel uzaya çevir
      const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
      const cx = clamp(lx, -b.hw, b.hw), cz = clamp(lz, -b.hd, b.hd);
      let ox = lx - cx, oz = lz - cz, d = Math.hypot(ox, oz);
      let nx, nz;
      if (d < r) {
        if (d < 1e-4) { // içeride: en yakın kenara it
          const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx) * (px + r); nz = 0; } else { nx = 0; nz = Math.sign(lz) * (pz + r); }
          const nlx = lx + nx, nlz = lz + nz;
          p.x = b.x + nlx * b.cos + nlz * b.sin; p.z = b.z - nlx * b.sin + nlz * b.cos;
        } else {
          const push = r - d; const nlx = lx + ox / d * push, nlz = lz + oz / d * push;
          p.x = b.x + nlx * b.cos + nlz * b.sin; p.z = b.z - nlx * b.sin + nlz * b.cos;
        }
      }
    }
    p.x = clamp(p.x, -HALF + 15, HALF - 15); p.z = clamp(p.z, -HALF + 15, HALF - 15);
  }

  nearestWaterEdge(x, z) { return waterDepth(x, z) > -0.6; }

  update(t) { this.waterMat.color.setHSL(0.55, 0.45, 0.24 + Math.sin(t * 0.5) * 0.01); }
}
