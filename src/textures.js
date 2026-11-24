// Kodla üretilen, kendini tekrar eden (seamless) dokular. Dosya indirmez; açılışta bir kez üretilir.
// iOS için: tek DataArrayTexture (katman başına 512x512, mipmap'li), birkaç örnekleme, ucuz "bump" (türev tabanlı).
//
// Ev dokusu katmanları (RGB = renk çarpanı, 0.5 ≈ 1.0; A = yükseklik):
//   0 SIVA  1 KİREMİT  2 TAŞ  3 AHŞAP  4 SÖVE/BETON  5 CAM  6 METAL
// Zemin dokusu (2 katman, kanal başına parlaklık):
//   L0: R çimen, G toprak, B kaya, A asfalt     L1: R kum, G yaprak örtüsü, B iri leke (renk oynaması), A -
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const MAT = { PLASTER: 0, ROOF: 1, STONE: 2, WOOD: 3, TRIM: 4, GLASS: 5, METAL: 6 };
const N = 512;

// ---------- Döşenebilir gürültü ----------
const TAB = (() => { const r = mulberry32(9071), t = new Float32Array(256 * 256); for (let i = 0; i < t.length; i++) t[i] = r(); return t; })();
const fade = (t) => t * t * (3 - 2 * t);
// periyodu P (2'nin kuvveti) olan değer gürültüsü; u,v ∈ [0,1)
function vnoise(u, v, P, off = 0) {
  const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const m = P - 1, x0 = ix & m, x1 = (ix + 1) & m, y0 = ((iy & m) + off) & 255, y1 = (((iy + 1) & m) + off) & 255;
  const a = TAB[y0 * 256 + x0], b = TAB[y0 * 256 + x1], c = TAB[y1 * 256 + x0], d = TAB[y1 * 256 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u, v, P, oct = 4, off = 0) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += vnoise(u, v, P << o, off + o * 37) * a; n += a; a *= 0.5; }
  return s / n;
}
// Döşenebilir Voronoi: gx x gy hücre, en yakın iki nokta uzaklığı ve hücre kimliği. sx: yatay uzaklık ağırlığı
function voronoi(u, v, gx, gy, seed, sx = 1, jit = 0.85) {
  const x = u * gx, y = v * gy, ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = ((cx % gx) + gx) % gx, wy = ((cy % gy) + gy) % gy;
    const h = (wy * 61 + wx * 17 + seed * 131) & 65535;
    const px = cx + 0.5 + (TAB[h] - 0.5) * jit, py = cy + 0.5 + (TAB[(h + 7919) & 65535] - 0.5) * jit;
    const dx = (px - x) * sx, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) d2 = d;
  }
  return [d1, d2, TAB[(id * 3 + 11) & 65535], TAB[(id * 7 + 101) & 65535]];
}
const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Katman üreticileri: (u, v) -> [r, g, b, h] (r,g,b: 1.0 = değişmez renk)
const LAYERS = {
  plaster(u, v) {
    const g = fbm(u, v, 16, 4), fine = vnoise(u, v, 256), st = fbm(u, v, 4, 3, 90);
    const stain = sstep(0.55, 0.8, st) * 0.1;
    const l = 0.97 + (g - 0.5) * 0.1 + (fine - 0.5) * 0.05 - stain;
    return [l, l * 0.995, l * 0.98, g * 0.6 + fine * 0.4];
  },
  roof(u, v) {
    // alaturka kiremit: 10 sütun, 6 sıra (2 m x 2 m). v eğim aşağı yönünde artar.
    const C = 10, R = 6, cu = u * C, rv = v * R, ci = Math.floor(cu), ri = Math.floor(rv);
    const jitter = (TAB[(ri * 31 + 5) & 65535] - 0.5) * 0.08;
    const fu = cu - ci, fv = rv - ri + jitter;
    const id = (ri * 17 + ci * 7) & 65535, t1 = TAB[id], t2 = TAB[(id + 333) & 65535];
    // oluk ve kapak kiremitleri dönüşümlü: kapak kiremidi (tek sütunlar) yüksek ve dolgun
    const cover = (ci & 1) === 1;
    const prof = Math.sqrt(Math.max(0, 1 - (2 * fu - 1) ** 2));
    let h = cover ? 0.45 + 0.55 * prof : 0.35 - 0.3 * prof;
    // sıra içi: üst kısım bir önceki sıranın altında kalır (gölgeli), alt uçta kalınlık ve gölge çizgisi
    const fr = ((fv % 1) + 1) % 1;
    const lip = sstep(0.9, 0.99, fr), shade = 0.82 + 0.18 * sstep(0.0, 0.35, fr);
    h *= 0.75 + 0.25 * fr; h -= lip * 0.35;
    let l = (0.86 + t1 * 0.3) * shade * (1 - lip * 0.45) * (cover ? 1.02 : 0.88);
    const n = fbm(u, v, 32, 3, 200), moss = sstep(0.62, 0.78, fbm(u, v, 8, 3, 50)) * (cover ? 0.6 : 1);
    l *= 0.92 + n * 0.16;
    // renk oynaması: bazı kiremitler daha kahverengi/koyu, bazıları turuncu; az yosun/is
    const warm = (t2 - 0.5) * 0.14;
    let r = l * (1 + warm), g = l * (1 - warm * 0.3), b = l * (1 - warm);
    r = r * (1 - moss * 0.35); g = g * (1 - moss * 0.08); b = b * (1 - moss * 0.25);
    return [r, g, b, cl(h + (n - 0.5) * 0.1)];
  },
  stone(u, v) {
    // moloz taş duvar: yatayda uzun taşlar, açık renk derz
    const [d1, d2, s1, s2] = voronoi(u, v, 6, 9, 3, 0.62, 0.8);
    const edge = d2 - d1, mortar = 1 - sstep(0.04, 0.12, edge);
    const n = fbm(u, v, 32, 4, 11), cr = fbm(u, v, 64, 2, 400);
    const base = 0.78 + s1 * 0.35 + (n - 0.5) * 0.22;
    const tone = (s2 - 0.5) * 0.18;
    let r = base * (1 + tone), g = base * (1 + tone * 0.4), b = base * (1 - tone * 0.5);
    const mo = 0.98 + (cr - 0.5) * 0.15;
    r = r + (mo - r) * mortar; g = g + (mo * 0.98 - g) * mortar; b = b + (mo * 0.93 - b) * mortar;
    const sh = sstep(0.04, 0.2, edge);
    const h = sh * (0.7 + n * 0.3) * (1 - mortar);
    const ao = 0.8 + 0.2 * sh;
    return [r * ao, g * ao, b * ao, h];
  },
  wood(u, v) {
    // dikey tahtalar, damar
    const P = 6, pu = u * P, pi = Math.floor(pu), fu = pu - pi;
    const t = TAB[(pi * 97 + 13) & 65535];
    const grain = vnoise(u * 1, v + t, 8, 600) * 0.4 + vnoise(u, v + t, 64, 610) * 0.35 + Math.sin((fu * 14 + vnoise(u, v, 16, 620) * 6) * 3.1) * 0.08;
    const gap = sstep(0.0, 0.05, fu) * sstep(1.0, 0.95, fu);
    const l = (0.85 + t * 0.22 + (grain - 0.4) * 0.35) * (0.55 + 0.45 * gap);
    return [l * 1.02, l, l * 0.97, gap * (0.6 + grain * 0.4)];
  },
  trim(u, v) {
    const g = fbm(u, v, 32, 3, 700), f = vnoise(u, v, 256, 710);
    const l = 0.98 + (g - 0.5) * 0.08 + (f - 0.5) * 0.04;
    return [l, l, l * 0.99, f];
  },
  glass(u, v) {
    const s = fbm(u, v, 8, 3, 800);
    return [0.95 + s * 0.1, 0.97 + s * 0.08, 1.0, s];
  },
  metal(u, v) {
    const g = fbm(u, v, 64, 2, 900);
    return [0.95 + g * 0.1, 0.95 + g * 0.1, 0.95 + g * 0.1, g];
  },
  // ---- zemin ----
  grass(u, v) {
    // tutamlar (Voronoi), aralarda koyu boşluk, ince benekler
    const c = fbm(u, v, 16, 3, 1000), f = vnoise(u, v, 256, 1020), [d1, d2, s1] = voronoi(u, v, 48, 48, 51, 1, 1);
    const clump = (1 - sstep(0.05, 0.6, d1)) * (0.6 + s1 * 0.6), gap = 1 - sstep(0.0, 0.08, d2 - d1);
    return cl(0.42 + (c - 0.5) * 0.55 + clump * 0.28 - gap * 0.12 + (f - 0.5) * 0.3);
  },
  dirt(u, v) {
    const [d1, d2, s1] = voronoi(u, v, 32, 32, 21, 1, 0.9);
    const peb = sstep(0.32, 0.18, d1) * (s1 > 0.55 ? 1 : 0);
    const n = fbm(u, v, 16, 4, 1100);
    return cl(0.42 + (n - 0.5) * 0.45 + peb * (0.2 + s1 * 0.2) - sstep(0.06, 0.0, d2 - d1) * 0.05);
  },
  rock(u, v) {
    const [d1, d2] = voronoi(u, v, 5, 5, 31, 1, 0.9);
    const crack = 1 - sstep(0.0, 0.07, d2 - d1), n = fbm(u, v, 16, 5, 1200);
    return cl(0.5 + (n - 0.5) * 0.6 - crack * 0.3);
  },
  asphalt(u, v) {
    const f = vnoise(u, v, 256, 1300), g = vnoise(u, v, 128, 1310), p = fbm(u, v, 8, 3, 1320);
    const patch = sstep(0.58, 0.64, p) * 0.08;
    return cl(0.5 + (f - 0.5) * 0.4 + (g - 0.5) * 0.2 - patch);
  },
  sand(u, v) {
    const r = Math.sin((v * 24 + fbm(u, v, 8, 3, 1400) * 3) * Math.PI * 2) * 0.06, f = vnoise(u, v, 256, 1410);
    return 0.5 + r + (f - 0.5) * 0.25;
  },
  litter(u, v) {
    const [d1, , s1] = voronoi(u, v, 24, 24, 41, 1, 1);
    const leaf = sstep(0.42, 0.25, d1);
    const n = fbm(u, v, 16, 3, 1500);
    return cl(0.4 + (n - 0.5) * 0.3 + leaf * (s1 - 0.35) * 0.5);
  },
  macro(u, v) { return fbm(u, v, 4, 4, 1600); },
};

function fill(layers) {
  const data = new Uint8Array(N * N * 4 * layers.length);
  layers.forEach((fn, L) => {
    let o = L * N * N * 4;
    for (let j = 0; j < N; j++) {
      const v = (j + 0.5) / N;
      for (let i = 0; i < N; i++) {
        const c = fn((i + 0.5) / N, v);
        data[o++] = Math.round(cl(c[0] * 0.5) * 255); data[o++] = Math.round(cl(c[1] * 0.5) * 255);
        data[o++] = Math.round(cl(c[2] * 0.5) * 255); data[o++] = Math.round(cl(c[3]) * 255);
      }
    }
  });
  return data;
}
function arrayTex(data, depth) {
  const t = new THREE.DataArrayTexture(data, N, N, depth);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

let houseTex = null, groundTex = null;
export function houseTexture() {
  if (!houseTex) {
    const L = LAYERS;
    houseTex = arrayTex(fill([L.plaster, L.roof, L.stone, L.wood, L.trim, L.glass, L.metal]), 7);
  }
  return houseTex;
}
export function groundTexture() {
  if (!groundTex) {
    const L = LAYERS;
    // zemin katmanları: değerler zaten 0..1 parlaklık; fill() rgb'yi 0.5 ile çarptığından 2 ile verilir
    const l0 = (u, v) => [L.grass(u, v) * 2, L.dirt(u, v) * 2, L.rock(u, v) * 2, L.asphalt(u, v)];
    const l1 = (u, v) => [L.sand(u, v) * 2, L.litter(u, v) * 2, L.macro(u, v) * 2, 0.5];
    groundTex = arrayTex(fill([l0, l1]), 2);
  }
  return groundTex;
}

// Türev tabanlı bump (three.js perturbNormalArb ile aynı mantık; bumpMap tanımı gerektirmez)
const BUMP_GLSL = /* glsl */`
vec3 saBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos));
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - grad);
}`;

// ---------- Zemin malzemesi ----------
// Köşe rengi (mevcut renk karışımı) korunur; üstüne dünya koordinatlı ayrıntı dokusu ve hafif kabartma.
// aSplat: (toprak, kaya, asfalt, kum), aLitter: orman tabanı. Çimen = 1 - toplam.
export function terrainMaterial() {
  const tex = groundTexture();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGround = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nattribute float aLitter;\nvarying vec4 vSplat;\nvarying float vLitter;\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vLitter = aLitter; vWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uGround;\nvarying vec4 vSplat;\nvarying float vLitter;\nvarying vec2 vWXZ;\nfloat gH;\n' + BUMP_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 w = clamp(vSplat, 0.0, 1.0);
        float lit = clamp(vLitter, 0.0, 1.0) * (1.0 - w.z);
        float gw = clamp(1.0 - w.x - w.y - w.z - w.w, 0.0, 1.0);
        vec4 a = texture(uGround, vec3(vWXZ * 0.31, 0.0));          // ~3.2 m
        vec4 a2 = texture(uGround, vec3(vWXZ * 0.071 + 0.37, 0.0)); // ~14 m (tekrar kırıcı)
        vec4 b = texture(uGround, vec3(vWXZ * 0.23, 1.0));
        vec4 A = mix(a, a2, 0.4);
        float d = A.r * gw + A.g * w.x + A.b * w.y + a.a * w.z + b.r * w.w;
        d = mix(d, b.g, lit * 0.8);
        float macro = texture(uGround, vec3(vWXZ * 0.006, 1.0)).b;  // ~170 m iri lekeler
        diffuseColor.rgb *= 0.4 + 1.2 * d;
        diffuseColor.rgb *= 0.86 + 0.28 * macro;
        // çimende açık/koyu tutam tonu: açık yerler sarımsı, koyu yerler mavimsi yeşil
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.92, 1.0, 1.04), vec3(1.07, 1.04, 0.9), d), gw);
        gH = d * (0.6 + 0.8 * w.y + 0.4 * w.x);
      }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = saBump(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)) * 1.6, faceDirection);');
  };
  m.customProgramCacheKey = () => 'sa-terrain1';
  return m;
}

// ---------- Ev malzemesi ----------
// Kutu izdüşümlü (box-mapped) UV: nesne uzayı konum + normal. aMat katmanı seçer.
// aTint=1 yüzler örnek rengini (duvar boyası) alır; aGlow gece yanan pencere kimliği.
export function houseMaterial() {
  const tex = houseTexture();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.emissiveIntensity = 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { get value() { return m.emissiveIntensity; } };
    sh.uniforms.uHouse = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute float aGlow;\nattribute float aMat;\nvarying float vGlow;\nvarying float vMat;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <color_vertex>', `vColor = color.rgb;
      #ifdef USE_INSTANCING_COLOR
        vColor = mix(vColor, vColor * instanceColor.rgb, aTint);
      #endif
      vMat = aMat; vOP = position; vON = normal;
      vGlow = 0.0;
      if (aGlow > 0.0) {
        float seed = aGlow * 91.7;
        #ifdef USE_INSTANCING
          seed += instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.291;
        #endif
        vGlow = step(0.42, fract(seed)) * (0.75 + 0.25 * fract(seed * 7.3));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying float vGlow; varying float vMat; varying vec3 vOP; varying vec3 vON;
      uniform float uGlow; uniform highp sampler2DArray uHouse;
      float hH; float hL;
      ${BUMP_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        hL = floor(vMat + 0.5);
        vec3 an = abs(vON);
        bool isRoof = hL == 1.0;
        // izdüşüm: çatıda v eğim aşağı yönü; duvarda u yatay, v dikey
        vec2 pRoofX = vec2(vOP.z, vOP.x * sign(vON.x)), pRoofZ = vec2(vOP.x, vOP.z * sign(vON.z));
        vec2 pTop = vOP.xz, pX = vec2(vOP.z, -vOP.y), pZ = vec2(vOP.x, -vOP.y);
        vec2 p = isRoof ? (an.x > an.z ? pRoofX : pRoofZ) : (an.y > max(an.x, an.z) ? pTop : (an.x > an.z ? pX : pZ));
        float sc = hL == 0.0 ? 0.33 : hL == 1.0 ? 0.5 : hL == 2.0 ? 0.42 : hL == 3.0 ? 0.6 : 0.45;
        vec4 t = texture(uHouse, vec3(p * sc, hL));
        diffuseColor.rgb *= t.rgb * 2.0;
        if (hL == 5.0) diffuseColor.rgb *= 0.55;
        hH = t.a;
        // duvar dibinde toprak/nem lekesi (sıva ve taş)
        if (hL == 0.0 || hL == 2.0) {
          float st = texture(uHouse, vec3(p * 0.11 + 0.5, 0.0)).a;
          diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(1.1, -0.4, vOP.y + st * 0.6);
        }
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = hL == 5.0 ? 0.12 : hL == 6.0 ? 0.45 : hL == 1.0 ? 0.72 - hH * 0.15 : hL == 3.0 ? 0.8 : roughnessFactor;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float bs = hL == 1.0 ? 2.2 : hL == 2.0 ? 2.4 : hL == 3.0 ? 0.9 : hL == 0.0 ? 0.5 : 0.25;
        normal = saBump(-vViewPosition, normal, vec2(dFdx(hH), dFdy(hH)) * bs, faceDirection);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * vGlow * uGlow;
      if (hL == 5.0) {
        // cam: gökyüzü (sis rengi) yansıması, bakış açısına göre (fresnel)
        float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        vec3 sky = vec3(0.55, 0.65, 0.75);
        #ifdef USE_FOG
          sky = fogColor;
        #endif
        totalEmissiveRadiance += sky * (0.02 + 0.32 * fr) * (0.7 + 0.6 * hH) * (1.0 - vGlow * uGlow * 0.7);
      }`);
  };
  m.customProgramCacheKey = () => 'sa-house2';
  return m;
}

// Dünya koordinatlı kutu izdüşümüyle tek katman dokulu malzeme (bahçe duvarı, kafes zemini, in kayaları vb.)
export function boxMappedMaterial(layer, params = {}) {
  const tex = houseTexture();
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...params });
  const sc = { 0: 0.33, 1: 0.5, 2: 0.42, 3: 0.6, 4: 0.45, 5: 0.5, 6: 0.5 }[layer];
  const bump = { 0: 0.5, 1: 2.2, 2: 2.4, 3: 0.9, 4: 0.25, 5: 0.1, 6: 0.2 }[layer];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHouse = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWP = (modelMatrix * wp4).xyz;
        vWN = normalize(mat3(modelMatrix) * objectNormal);
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform highp sampler2DArray uHouse; float bH;\n' + BUMP_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 an = abs(vWN);
        vec2 p = an.y > max(an.x, an.z) ? vWP.xz : (an.x > an.z ? vec2(vWP.z, -vWP.y) : vec2(vWP.x, -vWP.y));
        vec4 t = texture(uHouse, vec3(p * ${sc.toFixed(3)}, ${layer}.0));
        diffuseColor.rgb *= t.rgb * 2.0; bH = t.a;
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = saBump(-vViewPosition, normal, vec2(dFdx(bH), dFdy(bH)) * ${bump.toFixed(2)}, faceDirection);`);
  };
  m.customProgramCacheKey = () => 'sa-box' + layer;
  return m;
}
