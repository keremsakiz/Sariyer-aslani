// CC0 doğa modelleri: Quaternius "Ultimate Stylized Nature" (tools/convert-nature ile tek GLB'ye dönüştürüldü)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const URL = (typeof window !== 'undefined' && window.__ASSETS__ && window.__ASSETS__.nature) || 'assets/nature.glb';

// GLB'de çok malzemeli bir mesh, her malzeme için ayrı alt mesh'e bölünür; burada tek mesh + malzeme dizisine geri birleştirilir.
export const natureMats = [];

export async function loadNature() {
  const gltf = await new GLTFLoader().loadAsync(URL);
  const out = {};
  for (const node of gltf.scene.children) {
    const parts = node.isMesh ? [node] : node.children.filter((c) => c.isMesh);
    if (!parts.length) continue;
    const geos = parts.map((m) => { const g = m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; });
    const geo = parts.length > 1 ? mergeGeometries(geos, true) : geos[0];
    geo.computeBoundingBox();
    const mats = parts.map((m) => {
      const x = m.material;
      if (x.alphaTest > 0) { x.alphaTest = 0.5; x.side = THREE.DoubleSide; }
      x.roughness = 1; x.metalness = 0;
      const mn = (x.name || '').toLowerCase();
      // Gölgede kalan gövde/dallar simsiyah görünmesin: dokunun bir kısmını kendinden aydınlat.
      if (x.map) { x.emissiveMap = x.map; x.emissive = new THREE.Color(mn.includes('bark') || mn.includes('wood') ? 0x5a4a3a : 0x1e1e1e); }
      if (x.map) natureMats.push(x);
      if (mn.includes('pine') && x.alphaTest > 0) x.color.multiply(new THREE.Color(0x8fc070)); // sarımsı çam yapraklarını yeşile çek
      if (node.name.startsWith('grass')) { x.color.multiply(new THREE.Color(0xd8f0a0)); x.emissive.set(0x4a5a30); }
      // ince yapraklar mipmap'te saydamlaşıp kayboluyor: küçük bitkilerde eşik daha düşük
      if (/^(grass|flower|plant)/.test(node.name) && x.alphaTest > 0) x.alphaTest = 0.3;
      return x;
    });
    const mesh = new THREE.Mesh(geo, parts.length > 1 ? mats : mats[0]);
    mesh.name = node.name; out[node.name] = mesh;
  }
  return out;
}
