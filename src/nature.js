// CC0 doğa modelleri: Quaternius "Ultimate Stylized Nature" (tools/convert-nature ile tek GLB'ye dönüştürüldü)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const URL = (typeof window !== 'undefined' && window.__ASSETS__ && window.__ASSETS__.nature) || 'assets/nature.glb';

// GLB'de çok malzemeli bir mesh, her malzeme için ayrı alt mesh'e bölünür; burada tek mesh + malzeme dizisine geri birleştirilir.
const clampY = (v) => Math.min(1, Math.max(0, v));
export const natureMats = [];

// Saydam pikseller siyah olduğundan mipmap'lerde yaprak/çimen kenarları kararıyor.
// Saydam piksellerin rengini dokunun ortalama rengiyle doldurup dokuyu yeniden oluştur.
const fixed = new Map();
function bleedAlpha(tex) {
  if (!tex || !tex.image || typeof document === 'undefined') return tex;
  if (fixed.has(tex)) return fixed.get(tex);
  const img = tex.image, w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), a = d.data;
  let r = 0, gg = 0, b = 0, c = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 128) { r += a[i]; gg += a[i + 1]; b += a[i + 2]; c++; }
  if (!c) return tex;
  r /= c; gg /= c; b /= c;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] <= 128) { a[i] = r; a[i + 1] = gg; a[i + 2] = b; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 4;
  fixed.set(tex, t);
  return t;
}

export async function loadNature() {
  const gltf = await new GLTFLoader().loadAsync(URL);
  const out = {};
  for (const node of gltf.scene.children) {
    const parts = node.isMesh ? [node] : node.children.filter((c) => c.isMesh);
    if (!parts.length) continue;
    const geos = parts.map((m) => { const g = m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; });
    const geo = parts.length > 1 ? mergeGeometries(geos, true) : geos[0];
    geo.computeBoundingBox();
    // çimen/çiçek: normaller yukarı -> zemin gibi aydınlanır, arka yüzler kararmaz
    if (/^(grass|flower)/.test(node.name)) { const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0); }
    // çimende UV yok (tek koyu piksel okunuyordu): degrade dokuyu yüksekliğe göre eşle, uçlar açık
    if (!geo.attributes.uv) {
      const P = geo.attributes.position, h = geo.boundingBox.max.y || 1, uv = new Float32Array(P.count * 2);
      for (let i = 0; i < P.count; i++) { uv[i * 2] = 0.5; uv[i * 2 + 1] = 0.03 + 0.94 * clampY(P.getY(i) / h); }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const mats = parts.map((m) => {
      const x = m.material;
      if (x.alphaTest > 0) { x.alphaTest = 0.5; x.side = THREE.DoubleSide; x.map = bleedAlpha(x.map); }
      x.roughness = 1; x.metalness = 0;
      const mn = (x.name || '').toLowerCase();
      // Gölgede kalan gövde/dallar simsiyah görünmesin: dokunun bir kısmını kendinden aydınlat.
      if (x.map) { x.emissiveMap = x.map; x.emissive = new THREE.Color(mn.includes('bark') || mn.includes('wood') ? 0x5a4a3a : 0x1e1e1e); }
      if (x.map) natureMats.push(x);
      if (mn.includes('pine') && x.alphaTest > 0) x.color.multiply(new THREE.Color(0x8fc070)); // sarımsı çam yapraklarını yeşile çek
      if (node.name.startsWith('grass')) { x.color.setRGB(1.1, 1.15, 0.95); x.emissive.set(0x2a3418); }
      // ince yapraklar mipmap'te saydamlaşıp kayboluyor: küçük bitkilerde eşik daha düşük
      if (/^(grass|flower|plant)/.test(node.name) && x.alphaTest > 0) x.alphaTest = 0.3;
      return x;
    });
    const mesh = new THREE.Mesh(geo, parts.length > 1 ? mats : mats[0]);
    mesh.name = node.name; out[node.name] = mesh;
  }
  return out;
}
