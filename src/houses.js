// Kodla üretilen ev şablonları: sıvalı/taş/ahşap duvar, alaturka kiremit kırma çatı, mahya, saçak altı,
// çerçeveli pencere, panjur, çiçeklik, kapı, balkon, sundurma, baca, duvar lambası.
// Her şablon tek birleştirilmiş geometri; tüm evler tek malzeme + örnekleme (instancing).
// Köşe öznitelikleri: color (temel renk), aTint (1: örnek rengiyle boyanır), aGlow (gece yanan pencere), aMat (doku katmanı).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, houseMaterial as texturedHouseMaterial } from './textures.js';

const C = (h) => new THREE.Color(h);
// her pencereye kimlik (0..1): gece hangi pencerelerin yanacağı ev başına bundan seçilir
let wid = 0; const WID = () => 0.02 + ((wid++ * 0.6180339) % 1) * 0.97;
const { PLASTER, ROOF, STONE, WOOD, TRIM, GLASS, METAL } = MAT;

class Builder {
  constructor() { this.parts = []; }
  add(geo, color, mat = TRIM, tint = 0, glow = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, c = C(color);
    const col = new Float32Array(n * 3), t = new Float32Array(n), gl = new Float32Array(n), mt = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; t[i] = tint; gl[i] = glow; mt[i] = mat; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    g.setAttribute('aMat', new THREE.BufferAttribute(mt, 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    this.parts.push(g);
    return g;
  }
  // kutu: o = { ry, tint, glow }
  box(w, h, d, x, y, z, color, mat = TRIM, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.add(g, color, mat, o.tint || 0, o.glow || 0);
  }
  // a'dan b'ye uzanan yuvarlak çubuk (mahya kiremidi, boru)
  rod(a, b, r, color, mat, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return this.add(g, color, mat);
  }
  blob(r, x, y, z, color, mat = TRIM) { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.8, 1); g.translate(x, y, z); return this.add(g, color, mat); }
  build() { const g = mergeGeometries(this.parts); g.computeBoundingSphere(); return g; }
}

// Kırma çatı: taban (W+2e)x(D+2e), mahya uzunluğu W-D (W>=D varsayılır). Üst yüzler ve saçak altı ayrı.
function hipRoof(W, D, H, eave) {
  const w = W / 2 + eave, d = D / 2 + eave, r = Math.max(0, (W - D) / 2);
  const A = [-w, 0, -d], B = [w, 0, -d], Cc = [w, 0, d], Dd = [-w, 0, d], R1 = [-r, H, 0], R2 = [r, H, 0];
  const mk = (tris) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
    g.computeVertexNormals(); return g;
  };
  return {
    top: mk([Dd, Cc, R2, Dd, R2, R1, B, A, R1, B, R1, R2, Cc, B, R2, A, Dd, R1]),
    under: mk([A, B, Cc, A, Cc, Dd]),
    ridges: [[A, R1], [Dd, R1], [B, R2], [Cc, R2], [R1, R2]],
    w, d,
  };
}

// Pencere. face: +1 ön (z+), -1 arka, 'L'/'R' yanlar (x-, x+). Konum duvar yüzeyinde.
function addWindow(b, x, y, z, face, o) {
  const ww = o.ww || 1.1, wh = o.wh || 1.35;
  const side = typeof face === 'string';
  const ry = side ? Math.PI / 2 : 0, s = side ? (face === 'R' ? 1 : -1) : face;
  const P = (along, out, yy) => side ? [x + out * s, yy, z + along] : [x + along, yy, z + out * s];
  const fx = (w, h, dd, along, out, yy, col, mat, glow = 0) => { const [px, py, pz] = P(along, out, yy); b.box(w, h, dd, px, py, pz, col, mat, { ry, glow }); };
  // söve: dört kenar (camı örtmesin)
  fx(ww + 0.24, 0.14, 0.14, 0, 0.04, y + wh / 2 + 0.05, o.frame, TRIM); fx(ww + 0.24, 0.14, 0.14, 0, 0.04, y - wh / 2 - 0.05, o.frame, TRIM);
  for (const k of [-1, 1]) fx(0.14, wh + 0.24, 0.14, k * (ww / 2 + 0.05), 0.04, y, o.frame, TRIM);
  fx(ww, wh, 0.12, 0, 0.0, y, '#26313a', GLASS, WID());                             // cam (gece yanar), duvara gömük
  fx(0.07, wh, 0.12, 0, 0.04, y, o.frame, TRIM);                                     // orta kayıt
  fx(ww, 0.07, 0.12, 0, 0.04, y + wh * 0.22, o.frame, TRIM);                         // vasistas kaydı
  fx(ww + 0.44, 0.1, 0.3, 0, 0.12, y - wh / 2 - 0.13, '#d9d2c4', STONE);             // denizlik
  fx(ww + 0.36, 0.14, 0.16, 0, 0.06, y + wh / 2 + 0.17, o.frame, TRIM);              // üst alın
  if (o.shutter) for (const k of [-1, 1]) {
    fx(ww * 0.52, wh + 0.1, 0.06, k * (ww / 2 + ww * 0.3), 0.1, y, o.shutter, WOOD);
    fx(ww * 0.52, 0.06, 0.08, k * (ww / 2 + ww * 0.3), 0.11, y + wh * 0.18, o.shutter, WOOD); // panjur kuşağı
  }
  if (o.flowers) {
    fx(ww + 0.1, 0.26, 0.3, 0, 0.3, y - wh / 2 - 0.3, '#7a5236', WOOD);              // çiçeklik
    const cols = ['#d23b3b', '#e86a8a', '#c0344e', '#f2f0ea', '#b03a8a'];
    for (let i = 0; i < 4; i++) {
      const [px, py, pz] = P(-ww / 2 + 0.15 + i * (ww - 0.3) / 3, 0.32, y - wh / 2 - 0.1);
      b.blob(0.15, px, py, pz, '#4f7a3a');
      const [qx, qy, qz] = P(-ww / 2 + 0.15 + i * (ww - 0.3) / 3 + 0.05, 0.36, y - wh / 2 - 0.02);
      b.blob(0.09, qx, qy, qz, cols[(((i + Math.round(x * 3 + z)) % 5) + 5) % 5]);
    }
  }
}

function pitchedHouse(o) {
  const { W, D, floors, roof, frame, shutter, door, balcony, chimney } = o;
  const b = new Builder();
  const FH = 3.0, H = floors * FH + 0.3;
  const wallTop = H + 0.6;
  // duvarlar: taş zemin kat / ahşap üst kat / sıva
  if (o.stone === 'all') b.box(W, wallTop, D, 0, wallTop / 2 - 0.6, 0, '#d6cfc3', STONE);
  else if (o.stone === 'ground') {
    b.box(W + 0.08, FH + 0.6, D + 0.08, 0, (FH + 0.6) / 2 - 0.6, 0, '#d6cfc3', STONE);
    b.box(W, H - FH, D, 0, FH + (H - FH) / 2, 0, o.wood ? o.wood : '#ffffff', o.wood ? WOOD : PLASTER, { tint: o.wood ? 0 : 1 });
  } else b.box(W, wallTop, D, 0, wallTop / 2 - 0.6, 0, '#ffffff', PLASTER, { tint: 1 });
  b.box(W + 0.14, 2.8, D + 0.14, 0, -1.0, 0, '#bcb4a6', STONE);                     // taş subasman (yokuşta havada kalmasın)
  if (floors > 1 && o.stone !== 'ground') b.box(W + 0.1, 0.18, D + 0.1, 0, FH + 0.15, 0, '#ece6da', TRIM); // kat silmesi
  if (o.stone === 'ground') b.box(W + 0.22, 0.2, D + 0.22, 0, FH + 0.02, 0, '#7a5a3e', WOOD);              // ahşap hatıl
  b.box(W + 0.16, 0.24, D + 0.16, 0, H - 0.02, 0, '#ece6da', TRIM);                  // saçak altı kornişi
  // köşe taşları
  if (o.quoins) for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0, y = 0.1; y < H - 0.4; i++, y += 0.52) {
    const big = i % 2 === 0, lw = big ? 0.75 : 0.45;
    b.box(lw, 0.46, 0.08, sx * (W / 2 - lw / 2 + 0.04), y + 0.23, sz * (D / 2 + 0.03), '#e4dccd', TRIM);
    b.box(0.08, 0.46, big ? 0.45 : 0.75, sx * (W / 2 + 0.03), y + 0.23, sz * (D / 2 - (big ? 0.45 : 0.75) / 2 + 0.04), '#e4dccd', TRIM);
  }
  // çatı: kiremit, saçak altı, alın tahtası, mahya
  const rH = Math.min(W, D) * 0.32, eave = 0.7;
  const R = hipRoof(W, D, rH, eave), ry = H + 0.1;
  R.top.translate(0, ry, 0); b.add(R.top, roof, ROOF);
  R.under.translate(0, ry - 0.01, 0); b.add(R.under, '#e2d8c6', WOOD);
  b.box(R.w * 2, 0.2, 0.06, 0, ry - 0.06, R.d, '#6a4a32', WOOD); b.box(R.w * 2, 0.2, 0.06, 0, ry - 0.06, -R.d, '#6a4a32', WOOD);
  b.box(0.06, 0.2, R.d * 2, R.w, ry - 0.06, 0, '#6a4a32', WOOD); b.box(0.06, 0.2, R.d * 2, -R.w, ry - 0.06, 0, '#6a4a32', WOOD);
  const ridgeCol = new THREE.Color(roof).multiplyScalar(0.82).getStyle();
  for (const [a, c] of R.ridges) b.rod([a[0], a[1] + ry + 0.06, a[2]], [c[0], c[1] + ry + 0.06, c[2]], 0.11, ridgeCol, ROOF);
  // oluk + yağmur borusu (iki köşe)
  for (const sx of [-1, 1]) {
    b.box(R.w * 2, 0.12, 0.14, 0, ry - 0.12, sx * (R.d + 0.05), '#8f8c86', METAL);
    b.rod([sx * (W / 2 + 0.1), ry - 0.12, D / 2 + 0.1], [sx * (W / 2 + 0.1), -0.2, D / 2 + 0.1], 0.05, '#8f8c86', METAL, 5);
  }
  if (chimney) {
    const cx = W * 0.22, cz = -D * 0.12, ch = rH * 0.7 + 1.4;
    b.box(0.7, ch, 0.7, cx, H + ch / 2, cz, '#cfc6b8', STONE);
    b.box(0.9, 0.12, 0.9, cx, H + ch + 0.05, cz, '#9a958c', TRIM);
    b.box(0.5, 0.25, 0.5, cx, H + ch + 0.24, cz, '#4a4642', TRIM);
  }
  // pencereler
  const nW = Math.max(1, Math.floor(W / 2.7)), nD = Math.max(1, Math.floor(D / 2.9));
  for (let f = 0; f < floors; f++) {
    const y = 1.55 + f * FH, out = (o.stone === 'all' || (o.stone === 'ground' && f === 0)) ? 0.04 : 0;
    const wo = { frame, shutter, flowers: false };
    for (let i = 0; i < nW; i++) {
      const ax = (i + 0.5) / nW * W - W / 2;
      const isDoor = f === 0 && i === Math.floor(nW / 2);
      const balc = balcony && f === 1 && i === Math.floor(nW / 2);
      if (!isDoor && !balc) addWindow(b, ax, y, D / 2 + out, 1, { ...wo, flowers: o.flowers && (f === 0 || !balcony) && i % 2 === 0 });
      addWindow(b, ax, y, -D / 2 - out, -1, wo);
    }
    for (let i = 0; i < nD; i++) { const az = (i + 0.5) / nD * D - D / 2; addWindow(b, -W / 2 - out, y, az, 'L', wo); addWindow(b, W / 2 + out, y, az, 'R', { ...wo, flowers: o.flowers && f === 0 }); }
  }
  // kapı: söve, ahşap kanat ve tablalar, tokmak, saçaklık, basamak, lamba
  const dx = (Math.floor(nW / 2) + 0.5) / nW * W - W / 2, fz = D / 2 + (o.stone ? 0.04 : 0);
  b.box(1.45, 2.45, 0.14, dx, 1.15, fz + 0.03, '#e8e2d6', STONE);
  b.box(1.05, 2.15, 0.14, dx, 1.05, fz + 0.06, door, WOOD);
  for (const py of [0.55, 1.55]) b.box(0.7, 0.7, 0.05, dx, py, fz + 0.14, door, WOOD);
  b.box(0.1, 0.1, 0.08, dx + 0.36, 1.05, fz + 0.18, '#c9a54a', METAL);
  if (!o.porch) {
    b.box(2.0, 0.1, 1.1, dx, 2.62, fz + 0.5, roof, ROOF, { rx: 0.18 });
    for (const k of [-1, 1]) b.rod([dx + k * 0.9, 2.15, fz + 0.05], [dx + k * 0.9, 2.55, fz + 0.85], 0.03, '#3a3633', METAL, 4);
  }
  b.box(1.9, 0.22, 0.9, dx, -0.03, fz + 0.45, '#cbc3b5', STONE);
  b.box(2.3, 0.22, 1.4, dx, -0.25, fz + 0.65, '#cbc3b5', STONE);
  b.box(0.16, 0.26, 0.16, dx + 0.95, 2.15, fz + 0.1, '#2e2b28', METAL);              // duvar lambası
  b.box(0.12, 0.18, 0.12, dx + 0.95, 2.1, fz + 0.12, '#f6e2b0', GLASS, { glow: 0.5 });
  // sundurma (tek katlı ev): ahşap direkler, kiriş, kiremit örtü, taş döşeme
  if (o.porch) {
    const pw = Math.min(W - 1, 5.5), pd = 2.4, ph = 2.7;
    b.box(pw + 0.4, 0.25, pd, dx, -0.02, fz + pd / 2, '#cbc3b5', STONE);
    for (const k of [-1, 1]) b.box(0.18, ph, 0.18, dx + k * pw / 2, ph / 2, fz + pd - 0.15, '#7a5236', WOOD);
    b.box(pw + 0.3, 0.22, 0.22, dx, ph, fz + pd - 0.15, '#6a4a32', WOOD);
    b.box(pw + 0.8, 0.12, pd + 0.6, dx, ph + 0.35, fz + pd / 2 + 0.1, roof, ROOF, { rx: 0.26 });
    b.box(pw + 0.7, 0.04, pd + 0.4, dx, ph + 0.26, fz + pd / 2 + 0.1, '#e2d8c6', WOOD, { rx: 0.26 });
  }
  // balkon (üst kat, ön yüz)
  if (balcony && floors > 1) {
    const bw = Math.min(W * 0.6, 4.6), by = FH + 0.12, bd = 1.2;
    b.box(bw, 0.18, bd, dx, by, D / 2 + bd / 2, '#ddd6ca', STONE);
    for (const k of [-1, 1]) b.box(0.18, 0.3, bd, dx + k * (bw / 2 - 0.3), by - 0.22, D / 2 + bd / 2, '#ddd6ca', TRIM); // konsol
    const rail = o.woodRail ? '#6a4a32' : '#33302d', rm = o.woodRail ? WOOD : METAL;
    b.box(bw, 0.08, 0.1, dx, by + 1.0, D / 2 + bd - 0.04, rail, rm);
    for (const k of [-1, 1]) b.box(0.08, 0.08, bd, dx + k * (bw / 2 - 0.04), by + 1.0, D / 2 + bd / 2, rail, rm);
    const nb = Math.round(bw / (o.woodRail ? 0.16 : 0.22));
    for (let i = 0; i <= nb; i++) b.box(o.woodRail ? 0.07 : 0.035, 0.95, 0.035, dx - bw / 2 + 0.04 + i * (bw - 0.08) / nb, by + 0.55, D / 2 + bd - 0.04, rail, rm);
    for (const k of [-1, 1]) for (let i = 1; i < 5; i++) b.box(0.035, 0.95, 0.035, dx + k * (bw / 2 - 0.04), by + 0.55, D / 2 + i * bd / 5, rail, rm);
    // balkon kapısı + saksılar
    b.box(1.4, 2.3, 0.14, dx, by + 1.2, D / 2 + 0.04, frame, TRIM);
    b.box(1.1, 2.0, 0.14, dx, by + 1.15, D / 2 + 0.06, '#26313a', GLASS, { glow: WID() });
    b.box(0.07, 2.0, 0.14, dx, by + 1.15, D / 2 + 0.1, frame, TRIM);
    for (const k of [-1, 1]) { b.box(0.35, 0.35, 0.35, dx + k * (bw / 2 - 0.45), by + 0.27, D / 2 + bd - 0.35, '#b0603c', STONE); b.blob(0.3, dx + k * (bw / 2 - 0.45), by + 0.6, D / 2 + bd - 0.35, '#4f7a3a'); b.blob(0.12, dx + k * (bw / 2 - 0.4), by + 0.78, D / 2 + bd - 0.25, '#d23b3b'); }
  }
  return { geo: b.build(), W, D, H: H + rH };
}

// Modern villa: düz çatı, parapet, geniş cam bantlar, ahşap kaplama, teras
function modernVilla(W, D, floors) {
  const b = new Builder();
  const FH = 3.2, H = floors * FH;
  const slab = '#eeebe4', dark = '#2b2b2e', glass = '#2a3640';
  b.box(W, H + 0.5, D, 0, (H + 0.5) / 2 - 0.5, 0, '#ffffff', PLASTER, { tint: 1 });
  b.box(W + 0.1, 2.4, D + 0.1, 0, -1.4, 0, '#a8a296', STONE);
  b.box(W + 0.6, 0.35, D + 0.6, 0, H + 0.1, 0, slab, TRIM);                 // çatı plağı / saçak
  b.box(W + 0.6, 0.5, 0.15, 0, H + 0.5, (D + 0.6) / 2, slab, TRIM);          // parapet
  b.box(W + 0.6, 0.5, 0.15, 0, H + 0.5, -(D + 0.6) / 2, slab, TRIM);
  b.box(0.15, 0.5, D + 0.6, (W + 0.6) / 2, H + 0.5, 0, slab, TRIM);
  b.box(0.15, 0.5, D + 0.6, -(W + 0.6) / 2, H + 0.5, 0, slab, TRIM);
  b.box(W * 0.3, H, 0.2, -W * 0.33, H / 2, D / 2 + 0.05, '#9a6a45', WOOD);  // ahşap kaplama paneli
  b.box(W * 0.3, 0.9, 0.24, -W * 0.33, 0.25, D / 2 + 0.07, '#c4bcae', STONE); // panel altı taş
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * FH;
    // ön: geniş cam bant
    b.box(W * 0.58, 2.3, 0.14, W * 0.15, y, D / 2 + 0.04, dark, METAL);
    b.box(W * 0.56, 2.15, 0.14, W * 0.15, y, D / 2 + 0.08, glass, GLASS, { glow: 1 });
    for (let i = 1; i < 5; i++) b.box(0.07, 2.15, 0.16, W * 0.15 - W * 0.28 + i * W * 0.112, y, D / 2 + 0.1, dark, METAL);
    // arka ve yanlar: yatay pencereler
    for (const k of [-0.3, 0, 0.3]) { b.box(2.2, 1.2, 0.14, k * W, y + 0.2, -D / 2 - 0.04, dark, METAL); b.box(2.0, 1.05, 0.14, k * W, y + 0.2, -D / 2 - 0.08, glass, GLASS, { glow: 1 }); }
    for (const s of [-1, 1]) { b.box(0.14, 1.2, 2.4, s * (W / 2 + 0.04), y + 0.2, 0, dark, METAL); b.box(0.14, 1.05, 2.2, s * (W / 2 + 0.08), y + 0.2, 0, glass, GLASS, { glow: 1 }); }
  }
  if (floors > 1) { // üst kat terası: cam korkuluk
    b.box(W * 0.6, 0.2, 1.6, W * 0.15, FH, D / 2 + 0.8, slab, TRIM);
    b.box(W * 0.6, 0.9, 0.06, W * 0.15, FH + 0.55, D / 2 + 1.55, '#9fc3cf', GLASS);
    b.box(W * 0.6, 0.06, 0.08, W * 0.15, FH + 1.02, D / 2 + 1.55, dark, METAL);
  }
  return { geo: b.build(), W, D, H };
}

export function houseTemplates() {
  const P = (o) => pitchedHouse({ frame: '#f4f1ea', shutter: '#4f6b4a', door: '#6b4a32', roof: '#b0583a', ...o });
  return [
    // küçük köy evi: çiçeklikler, baca
    P({ W: 7, D: 6, floors: 1, chimney: true, roof: '#ad5233', flowers: true }),
    // tek katlı, ahşap sundurmalı
    P({ W: 9, D: 7, floors: 1, shutter: '#7a4b2e', roof: '#bb5e3e', porch: true, flowers: true }),
    // iki katlı, taş zemin kat (Karadeniz/Rumeli köy evi), ahşap balkon
    P({ W: 8, D: 7, floors: 2, balcony: true, chimney: true, shutter: '#3f5f7a', roof: '#a35a3a', stone: 'ground', woodRail: true }),
    // büyük iki katlı konak: köşe taşları, balkon
    P({ W: 11, D: 7.5, floors: 2, balcony: true, roof: '#9a4630', shutter: null, quoins: true, frame: '#efe9dd' }),
    // dar iki katlı: taş zemin, ahşap üst kat
    P({ W: 6.5, D: 6.5, floors: 2, chimney: true, shutter: '#5a7046', roof: '#ad5233', door: '#4a3a2c', stone: 'ground', wood: '#9a6e48', flowers: true }),
    // eski taş ev: arduvaz (gri) çatı
    P({ W: 10, D: 8, floors: 1, chimney: true, shutter: '#6d4a3a', roof: '#77736d', stone: 'all', door: '#5a3e2a' }),
  ];
}

export function villaTemplates() { return { main: modernVilla(18, 11, 2), annex: modernVilla(8, 7, 1) }; }

// Tek malzeme (bkz. textures.js): emissiveIntensity gece/gündüz kodundan ayarlanır (windowsMat arayüzü).
export const houseMaterial = texturedHouseMaterial;
