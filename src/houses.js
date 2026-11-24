// Kodla üretilen ev şablonları: sıvalı duvar, kiremit kırma çatı, saçak, çerçeveli pencere, panjur,
// kapı, balkon, baca. Her şablon tek birleştirilmiş geometri; tüm evler tek malzeme + örnekleme (instancing).
// Duvar rengi örnek başına değişir (yalnız aTint=1 olan yüzler boyanır), pencereler gece aGlow ile yanar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);
// her pencereye kimlik (0..1): gece hangi pencerelerin yanacağı ev başına bundan seçilir
let wid = 0; const WID = () => 0.02 + ((wid++ * 0.6180339) % 1) * 0.97;

class Builder {
  constructor() { this.parts = []; }
  add(geo, color, tint = 0, glow = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, c = C(color);
    const col = new Float32Array(n * 3), t = new Float32Array(n), gl = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; t[i] = tint; gl[i] = glow; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    this.parts.push(g);
    return g;
  }
  box(w, h, d, x, y, z, color, tint = 0, glow = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(g, color, tint, glow);
  }
  build() { const g = mergeGeometries(this.parts); g.computeBoundingSphere(); return g; }
}

// Kırma çatı: taban (W+2e)x(D+2e), mahya uzunluğu W-D (W>=D varsayılır)
function hipRoof(W, D, H, eave) {
  const w = W / 2 + eave, d = D / 2 + eave, r = Math.max(0, (W - D) / 2);
  const A = [-w, 0, -d], B = [w, 0, -d], Cc = [w, 0, d], Dd = [-w, 0, d], R1 = [-r, H, 0], R2 = [r, H, 0];
  const tris = [Dd, Cc, R2, Dd, R2, R1, B, A, R1, B, R1, R2, Cc, B, R2, A, Dd, R1, A, B, Cc, A, Cc, Dd];
  const pos = new Float32Array(tris.flat());
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function addWindow(b, x, y, z, face, opts) {
  // face: +1 ön (z+), -1 arka, 'L'/'R' yanlar (x-, x+). Konum duvar yüzeyinde.
  const ww = opts.ww || 1.1, wh = opts.wh || 1.35;
  const side = typeof face === 'string';
  const ry = side ? Math.PI / 2 : 0, s = side ? (face === 'R' ? 1 : -1) : face;
  const P = (along, out, yy) => side ? [x + out * s, yy, z + along] : [x + along, yy, z + out * s];
  const fx = (w, h, dd, along, out, yy, col, glow = 0) => { const [px, py, pz] = P(along, out, yy); b.box(w, h, dd, px, py, pz, col, 0, glow, ry); };
  fx(ww + 0.22, wh + 0.22, 0.12, 0, 0.03, y, opts.frame);            // çerçeve
  fx(ww, wh, 0.12, 0, 0.06, y, '#33414c', WID());                         // cam (gece yanar)
  fx(0.06, wh, 0.14, 0, 0.07, y, opts.frame);                          // orta kayıt
  fx(ww + 0.4, 0.1, 0.28, 0, 0.12, y - wh / 2 - 0.12, '#d8d2c6');      // denizlik
  if (opts.shutter) for (const k of [-1, 1]) fx(ww * 0.52, wh + 0.1, 0.06, k * (ww / 2 + ww * 0.3), 0.1, y, opts.shutter);
}

function pitchedHouse({ W, D, floors, roof, frame, shutter, door, balcony, chimney, seed }) {
  const b = new Builder();
  const FH = 3.0, H = floors * FH + 0.3;
  b.box(W, H + 0.6, D, 0, (H + 0.6) / 2 - 0.6, 0, '#ffffff', 1);                // sıvalı duvar (renklenir)
  b.box(W + 0.12, 2.8, D + 0.12, 0, -1.05, 0, '#9a948a');                        // taş subasman (yokuşta havada kalmasın)
  if (floors > 1) b.box(W + 0.1, 0.16, D + 0.1, 0, FH + 0.15, 0, '#e8e2d6');   // kat silmesi
  b.box(W + 0.14, 0.22, D + 0.14, 0, H, 0, '#e8e2d6');                          // saçak altı kornişi
  // çatı
  const rH = Math.min(W, D) * 0.32;
  const rg = hipRoof(W, D, rH, 0.65); rg.translate(0, H + 0.1, 0); b.add(rg, roof);
  if (chimney) b.box(0.6, 1.6, 0.6, W * 0.22, H + rH * 0.6, -D * 0.12, '#b8afa2');
  // pencereler
  const wo = { frame, shutter };
  const nW = Math.max(1, Math.floor(W / 2.7)), nD = Math.max(1, Math.floor(D / 2.9));
  for (let f = 0; f < floors; f++) {
    const y = 1.55 + f * FH;
    for (let i = 0; i < nW; i++) {
      const ax = (i + 0.5) / nW * W - W / 2;
      const isDoor = f === 0 && i === Math.floor(nW / 2);
      if (!isDoor) addWindow(b, ax, y, D / 2, 1, wo);
      addWindow(b, ax, y, -D / 2, -1, wo);
    }
    for (let i = 0; i < nD; i++) { const az = (i + 0.5) / nD * D - D / 2; addWindow(b, -W / 2, y, az, 'L', wo); addWindow(b, W / 2, y, az, 'R', wo); }
  }
  // kapı + saçaklık + basamak
  const dx = (Math.floor(nW / 2) + 0.5) / nW * W - W / 2;
  b.box(1.35, 2.35, 0.14, dx, 1.12, D / 2 + 0.04, '#e8e2d6');
  b.box(1.05, 2.15, 0.14, dx, 1.05, D / 2 + 0.08, door);
  b.box(0.08, 0.08, 0.06, dx + 0.35, 1.05, D / 2 + 0.17, '#c9a54a');
  b.box(1.9, 0.12, 1.0, dx, 2.55, D / 2 + 0.5, roof);
  b.box(1.8, 0.22, 0.8, dx, -0.05, D / 2 + 0.4, '#a9a295');
  // balkon (üst kat, ön yüz)
  if (balcony && floors > 1) {
    const bw = Math.min(W * 0.6, 4.6), by = FH + 0.12, bd = 1.2;
    b.box(bw, 0.18, bd, dx, by, D / 2 + bd / 2, '#d8d2c6');
    const rail = '#3a3633';
    b.box(bw, 0.07, 0.07, dx, by + 1.0, D / 2 + bd - 0.04, rail);
    for (const k of [-1, 1]) b.box(0.07, 0.07, bd, dx + k * (bw / 2 - 0.04), by + 1.0, D / 2 + bd / 2, rail);
    const nb = Math.round(bw / 0.22);
    for (let i = 0; i <= nb; i++) b.box(0.035, 0.95, 0.035, dx - bw / 2 + 0.04 + i * (bw - 0.08) / nb, by + 0.55, D / 2 + bd - 0.04, rail);
    for (const k of [-1, 1]) for (let i = 1; i < 5; i++) b.box(0.035, 0.95, 0.035, dx + k * (bw / 2 - 0.04), by + 0.55, D / 2 + i * bd / 5, rail);
    // balkon kapısı (üst kattaki ön pencerenin yerine geniş cam)
    b.box(1.3, 2.2, 0.14, dx, by + 1.2, D / 2 + 0.05, frame);
    b.box(1.1, 2.0, 0.14, dx, by + 1.2, D / 2 + 0.09, '#33414c', 0, WID());
  }
  return { geo: b.build(), W, D, H: H + rH };
}

// Modern villa: düz çatı, parapet, geniş cam bantlar, ahşap kaplama, teras
function modernVilla(W, D, floors) {
  const b = new Builder();
  const FH = 3.2, H = floors * FH;
  b.box(W, H + 0.5, D, 0, (H + 0.5) / 2 - 0.5, 0, '#ffffff', 1);
  b.box(W + 0.1, 2.4, D + 0.1, 0, -1.4, 0, '#8f8a80');
  b.box(W + 0.6, 0.35, D + 0.6, 0, H + 0.1, 0, '#e9e6df');                 // çatı plağı / saçak
  b.box(W + 0.6, 0.5, 0.15, 0, H + 0.5, (D + 0.6) / 2, '#e9e6df');          // parapet
  b.box(W + 0.6, 0.5, 0.15, 0, H + 0.5, -(D + 0.6) / 2, '#e9e6df');
  b.box(0.15, 0.5, D + 0.6, (W + 0.6) / 2, H + 0.5, 0, '#e9e6df');
  b.box(0.15, 0.5, D + 0.6, -(W + 0.6) / 2, H + 0.5, 0, '#e9e6df');
  b.box(W * 0.3, H, 0.2, -W * 0.33, H / 2, D / 2 + 0.05, '#8a5a3a');        // ahşap kaplama paneli
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * FH;
    // ön: geniş cam bant
    b.box(W * 0.58, 2.3, 0.14, W * 0.15, y, D / 2 + 0.04, '#2b2b2e');
    b.box(W * 0.56, 2.15, 0.14, W * 0.15, y, D / 2 + 0.08, '#3a4a56', 0, 1);
    for (let i = 1; i < 5; i++) b.box(0.07, 2.15, 0.16, W * 0.15 - W * 0.28 + i * W * 0.112, y, D / 2 + 0.1, '#2b2b2e');
    // arka ve yanlar: yatay pencereler
    for (const k of [-0.3, 0, 0.3]) { b.box(2.2, 1.2, 0.14, k * W, y + 0.2, -D / 2 - 0.04, '#2b2b2e'); b.box(2.0, 1.05, 0.14, k * W, y + 0.2, -D / 2 - 0.08, '#3a4a56', 0, 1); }
    for (const s of [-1, 1]) { b.box(0.14, 1.2, 2.4, s * (W / 2 + 0.04), y + 0.2, 0, '#2b2b2e'); b.box(0.14, 1.05, 2.2, s * (W / 2 + 0.08), y + 0.2, 0, '#3a4a56', 0, 1); }
  }
  if (floors > 1) { // üst kat terası: cam korkuluk
    b.box(W * 0.6, 0.2, 1.6, W * 0.15, FH, D / 2 + 0.8, '#e9e6df');
    b.box(W * 0.6, 0.9, 0.06, W * 0.15, FH + 0.55, D / 2 + 1.55, '#9fc3cf');
  }
  return { geo: b.build(), W, D, H };
}

export function houseTemplates() {
  const P = (o) => pitchedHouse({ frame: '#f4f1ea', shutter: '#4f6b4a', door: '#6b4a32', roof: '#a8502f', ...o });
  return [
    P({ W: 7, D: 6, floors: 1, chimney: true, roof: '#a4492e' }),
    P({ W: 9, D: 7, floors: 1, shutter: '#7a4b2e', roof: '#b5573a' }),
    P({ W: 8, D: 7, floors: 2, balcony: true, chimney: true, shutter: '#3f5f7a', roof: '#9b5236' }),
    P({ W: 11, D: 7.5, floors: 2, balcony: true, roof: '#8f3f2a', shutter: null }),
    P({ W: 6.5, D: 6.5, floors: 2, chimney: true, shutter: '#5a7046', roof: '#a8502f', door: '#4a3a2c' }),
    P({ W: 10, D: 8, floors: 1, chimney: true, shutter: '#6d4a3a', roof: '#6d6a66' }),
  ];
}

export function villaTemplates() { return { main: modernVilla(18, 11, 2), annex: modernVilla(8, 7, 1) }; }

// Tek malzeme: köşe rengi, örnek başına duvar boyası (aTint), gece yanan pencereler (aGlow).
// emissiveIntensity mevcut gece/gündüz kodundan ayarlanır (windowsMat ile aynı arayüz).
export function houseMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: false });
  m.emissiveIntensity = 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { get value() { return m.emissiveIntensity; } };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', `vColor = color.rgb;
      #ifdef USE_INSTANCING_COLOR
        vColor = mix(vColor, vColor * instanceColor.rgb, aTint);
      #endif
      vGlow = 0.0;
      if (aGlow > 0.0) {
        float seed = aGlow * 91.7;
        #ifdef USE_INSTANCING
          seed += instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.291;
        #endif
        vGlow = step(0.42, fract(seed)) * (0.75 + 0.25 * fract(seed * 7.3));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * vGlow * uGlow;');
  };
  m.customProgramCacheKey = () => 'house1';
  return m;
}
