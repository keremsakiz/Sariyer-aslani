// Draw call azaltma: aynı ebeveyn + aynı malzemeli statik alt parçaları tek mesh'te birleştirir.
// Animasyonda adıyla kullanılan nesnelere (keep) dokunmaz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root, keep = new Set()) {
  const parents = [];
  root.traverse((o) => parents.push(o));
  for (const p of parents) {
    const groups = new Map();
    for (const c of p.children) {
      if (!c.isMesh || c.isSkinnedMesh || c.children.length || keep.has(c) || Array.isArray(c.material)) continue;
      const k = c.material.uuid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const mat = list[0].material;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = (m.geometry.index ? m.geometry : m.geometry).clone().applyMatrix4(m.matrix);
        for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'color' && n !== 'uv') g.deleteAttribute(n);
        if (mat.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
        if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
        return g.index ? g : g.toNonIndexed();
      });
      if (!geos.every((g) => g.attributes.uv)) for (const g of geos) g.deleteAttribute('uv');
      const allIdx = geos.every((g) => g.index);
      const merged = mergeGeometries(allIdx ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)));
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = list.some((x) => x.castShadow); m.receiveShadow = list.some((x) => x.receiveShadow);
      for (const x of list) p.remove(x);
      p.add(m);
    }
  }
}

// Bir nesnenin alanlarında tutulan Object3D'leri topla (animasyonun dokunduğu parçalar)
export function refsOf(obj) {
  const s = new Set();
  for (const v of Object.values(obj)) {
    if (v && v.isObject3D) s.add(v);
    else if (Array.isArray(v)) for (const x of v) { if (x && x.isObject3D) s.add(x); else if (x && typeof x === 'object') for (const y of Object.values(x)) if (y && y.isObject3D) s.add(y); }
  }
  return s;
}
