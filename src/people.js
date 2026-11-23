// İskeletli insan modelleri: Quaternius "Universal Base Characters" (CC0).
// Kıyafet renkleri kemik ağırlıklarına göre boyanır (fikir AKINTI rafting projesinden),
// yürüme/koşma/fotoğraf/nişan/düşme animasyonları kemikler üzerinde kodla yapılır.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, lerp, damp, mulberry32 } from './util.js';
import { Human } from './characters.js';

const URLS = (typeof window !== 'undefined' && window.__ASSETS__) || { male: 'assets/male.glb', female: 'assets/female.glb' };
export const BASES = { male: null, female: null };

const JACKET = /^(spine_0[123]|clavicle_[lr]|upperarm_[lr])$/;
const PANTS = /^(pelvis|thigh_[lr])$/;
const CALF = /^calf_[lr]$/;
const SHOE = /^(foot_[lr]|ball_[lr]|ball_leaf_[lr])$/;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _v = new THREE.Vector3();

export async function loadPeople() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await MeshoptDecoder.ready;
  const [m, f] = await Promise.all([loader.loadAsync(URLS.male), loader.loadAsync(URLS.female)]);
  BASES.male = prepareBase(m); BASES.female = prepareBase(f);
  return BASES;
}

function prepareBase(gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && /body/.test(o.name)) body = o; });
  const bones = body.skeleton.bones;
  const g = body.geometry, n = g.attributes.position.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const cat = bones.map((b) => (JACKET.test(b.name) ? 0 : PANTS.test(b.name) ? 1 : CALF.test(b.name) ? 2 : SHOE.test(b.name) ? 3 : -1));
  const cloth = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const j = si.getComponent(i, k), w = sw.getComponent(i, k); if (cat[j] >= 0) cloth[i * 4 + cat[j]] += w; }
  g.setAttribute('aCloth', new THREE.BufferAttribute(cloth, 4));
  // bağlanma pozu (karakter uzayı)
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const sceneQ = scene.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bind = {}, J = {};
  for (const b of bones) {
    const bw = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(sceneQ);
    bind[b.name] = { local: b.quaternion.clone(), bw, bwInv: bw.clone().invert() };
    J[b.name] = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  }
  // yön ve boy
  const fwd = new THREE.Vector3().subVectors(J.ball_l, J.foot_l).setY(0).normalize();
  const height = J.Head.y + 0.16;
  // kolları aşağı indiren dönüşler (T/A pozundan bağımsız)
  const armDown = {};
  for (const s of ['l', 'r']) {
    const dir = new THREE.Vector3().subVectors(J['lowerarm_' + s], J['upperarm_' + s]).normalize();
    const target = new THREE.Vector3(Math.sign(dir.x) * 0.12, -1, 0).normalize();
    armDown[s] = new THREE.Quaternion().setFromUnitVectors(dir, target);
  }
  return { scene, body, bind, J, fwdSign: fwd.z >= 0 ? 1 : -1, yawFix: Math.atan2(fwd.x, fwd.z), height, armDown, shells: new Map(), boneCat: bones.map((b) => b.name) };
}

// ---------- Kıyafet ve saç kabukları ----------
// Gövde ağından ilgili bölge kesilir, kas/göğüs detayı yumuşatılır (Laplace) ve normal yönünde dışarı itilir.
// Sonuç aynı iskelete bağlı tek bir giysi ağıdır: parça kimliği (aPart) ile renklendirilir -> kişi başına tek ek çizim.
// parça: 0 üst (gömlek/ceket), 1 alt (pantolon/şort), 2 ayakkabı, 3 saç
function buildShell(base, opt) {
  const key = JSON.stringify(opt);
  if (base.shells.has(key)) return base.shells.get(key);
  const g = base.body.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = base.boneCat;
  const J = base.J, hy = J.Head.y, hz = J.Head.z;
  // ağ uzayı (nicemlenmiş olabilir) ile karakter uzayı farklı: seçim için bağlanma pozundaki karakter-uzayı konumu
  if (!base.cpos) {
    const cp = base.cpos = new Float32Array(n * 3), v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(base.scene.matrixWorld).invert();
    base.body.skeleton.update();
    let mn = 1e9, mx = -1e9, cmn = 1e9, cmx = -1e9;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i); mn = Math.min(mn, v.y); mx = Math.max(mx, v.y);
      base.body.applyBoneTransform(i, v); v.applyMatrix4(base.body.matrixWorld).applyMatrix4(inv);
      cp[i * 3] = v.x; cp[i * 3 + 1] = v.y; cp[i * 3 + 2] = v.z; cmn = Math.min(cmn, v.y); cmx = Math.max(cmx, v.y);
    }
    base.meshScale = (mx - mn) / (cmx - cmn); // karakter metresi başına ağ birimi
  }
  const CP = base.cpos, MS = base.meshScale;
  // köşe başına kemik grubu ağırlıkları
  const part = new Int8Array(n).fill(-1), off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = {};
    for (let k = 0; k < 4; k++) { const nm = names[si.getComponent(i, k)], v = sw.getComponent(i, k); w[nm] = (w[nm] || 0) + v; }
    const W = (re) => { let t = 0; for (const k in w) if (re.test(k)) t += w[k]; return t; };
    const y = CP[i * 3 + 1], z = CP[i * 3 + 2];
    const head = W(/^(Head|neck_01)$/), torso = W(/^(spine_0[123]|clavicle_[lr])$/), uarm = W(/^upperarm_[lr]$/), larm = W(/^lowerarm_[lr]$/);
    const pel = W(/^pelvis$/), thigh = W(/^thigh_[lr]$/), calf = W(/^calf_[lr]$/), foot = W(/^(foot|ball|ball_leaf)_[lr]$/);
    if (foot > 0.5 || (calf > 0.3 && foot > 0.2)) { part[i] = 2; off[i] = 0.016; continue; }
    if (opt.hair && head > 0.6) {
      const dy = y - hy, fr = z - hz;
      const ax = Math.abs(CP[i * 3]);
      const ear = ax > 0.058 && dy < 0.115 && fr > -0.045;
      if (!ear && (dy > 0.125 || (dy > 0.075 && fr < 0.045) || (fr < -0.025 && dy > (opt.long ? -0.09 : -0.03)))) { part[i] = 3; off[i] = opt.hair * (0.7 + 0.9 * clamp((dy - 0.04) / 0.12, 0, 1)); }
      continue;
    }
    const top = torso + uarm + (opt.sleeve ? larm : 0) + (y > hy - 0.13 ? 0 : 0);
    if (torso + uarm + larm > 0.5 && top > 0.5 && y < hy - 0.06 && !(opt.sleeve ? false : larm > 0.35)) { part[i] = 0; off[i] = 0.016; continue; }
    if (pel + thigh + (opt.legs ? calf : 0) > 0.5 && !(opt.legs ? false : calf > 0.35)) { part[i] = 1; off[i] = 0.016; continue; }
  }
  // aynı konumdaki (UV dikişi) köşeleri birleştir
  const weld = new Int32Array(n), map = new Map(); let gN = 0;
  for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * 2000) + ',' + Math.round(P.getY(i) * 2000) + ',' + Math.round(P.getZ(i) * 2000); let id = map.get(k); if (id === undefined) { id = gN++; map.set(k, id); } weld[i] = id; }
  const idx = g.index.array, tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (part[a] >= 0 && part[a] === part[b] && part[a] === part[c]) tris.push(a, b, c);
  }
  // Laplace yumuşatma (yalnız seçili köşeler, kaynaşmış komşuluk)
  const gp = new Float32Array(gN * 3), gnrm = new Float32Array(gN * 3), cnt = new Float32Array(gN);
  for (let i = 0; i < n; i++) { const id = weld[i]; gp[id * 3] = P.getX(i); gp[id * 3 + 1] = P.getY(i); gp[id * 3 + 2] = P.getZ(i); gnrm[id * 3] += N.getX(i); gnrm[id * 3 + 1] += N.getY(i); gnrm[id * 3 + 2] += N.getZ(i); }
  const orig = gp.slice();
  const nb = Array.from({ length: gN }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) { const a = weld[tris[t + e]], b = weld[tris[t + (e + 1) % 3]]; nb[a].add(b); nb[b].add(a); }
  // açık kenardaki (sınır) köşeler sabit kalır, yoksa yama içe büzülür
  const edgeUse = new Map(), pin = new Uint8Array(gN);
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) { const a = weld[tris[t + e]], b = weld[tris[t + (e + 1) % 3]]; const k = a < b ? a * 65536 + b : b * 65536 + a; edgeUse.set(k, (edgeUse.get(k) || 0) + 1); }
  for (const [k, c] of edgeUse) if (c === 1) { pin[Math.floor(k / 65536)] = 1; pin[k % 65536] = 1; }
  const goff = new Float32Array(gN); for (let i = 0; i < n; i++) goff[weld[i]] = Math.max(goff[weld[i]], off[i] * MS);
  const tmp = new Float32Array(gN * 3);
  // her köşe gövdenin en az "off" kadar dışında kalsın (her yumuşatma adımında uygulanır -> gövdeyi saran düzgün zarf)
  const gn = new Float32Array(gN * 3);
  for (let id = 0; id < gN; id++) { const l = Math.hypot(gnrm[id * 3], gnrm[id * 3 + 1], gnrm[id * 3 + 2]) || 1; gn[id * 3] = gnrm[id * 3] / l; gn[id * 3 + 1] = gnrm[id * 3 + 1] / l; gn[id * 3 + 2] = gnrm[id * 3 + 2] / l; }
  const keepOut = () => {
    for (let id = 0; id < gN; id++) {
      const nx = gn[id * 3], ny = gn[id * 3 + 1], nz = gn[id * 3 + 2];
      const d = (gp[id * 3] - orig[id * 3]) * nx + (gp[id * 3 + 1] - orig[id * 3 + 1]) * ny + (gp[id * 3 + 2] - orig[id * 3 + 2]) * nz;
      const push = Math.max(0, goff[id] - d);
      gp[id * 3] += nx * push; gp[id * 3 + 1] += ny * push; gp[id * 3 + 2] += nz * push;
    }
  };
  keepOut();
  for (let it = 0; it < (opt.smooth || 30); it++) {
    for (let id = 0; id < gN; id++) {
      const s = nb[id]; if (!s.size || pin[id]) { tmp.set(gp.subarray(id * 3, id * 3 + 3), id * 3); continue; }
      let x = 0, y = 0, z = 0; for (const j of s) { x += gp[j * 3]; y += gp[j * 3 + 1]; z += gp[j * 3 + 2]; }
      const k = 0.6 / s.size; tmp[id * 3] = gp[id * 3] * 0.4 + x * k; tmp[id * 3 + 1] = gp[id * 3 + 1] * 0.4 + y * k; tmp[id * 3 + 2] = gp[id * 3 + 2] * 0.4 + z * k;
    }
    gp.set(tmp); keepOut();
  }
  // yeni geometri: kullanılan köşeleri sıkıştır
  const remap = new Int32Array(n).fill(-1), pos = [], si2 = [], sw2 = [], pa = [], ix = [];
  for (const v of tris) {
    if (remap[v] < 0) {
      remap[v] = pa.length; const id = weld[v];
      pos.push(gp[id * 3], gp[id * 3 + 1], gp[id * 3 + 2]);
      for (let k = 0; k < 4; k++) { si2.push(si.getComponent(v, k)); sw2.push(sw.getComponent(v, k)); }
      pa.push(part[v]);
    }
    ix.push(remap[v]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si2, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw2, 4));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(pa, 1));
  out.setIndex(ix); out.computeVertexNormals();
  base.shells.set(key, out);
  return out;
}

function shellMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;\nuniform vec3 uJacket, uPants, uShoe, uHair;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 pc = vPart < 0.5 ? uJacket : vPart < 1.5 ? uPants : vPart < 2.5 ? uShoe : uHair;
      diffuseColor.rgb *= pc;`);
  };
  m.customProgramCacheKey = () => 'shell1';
  return m;
}

// Kıyafet boyama: aCloth (ceket, pantolon, baldır, ayakkabı ağırlıkları)
function clothMaterial(src, U) {
  const m = src.clone();
  m.roughness = 0.7; m.metalness = 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCloth;\nvarying vec4 vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCloth;\nuniform vec3 uJacket, uPants, uShoe, uSkin;\nuniform float uLong;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 cc = diffuseColor.rgb * uSkin;
      float lum = dot(diffuseColor.rgb, vec3(0.333));
      float sh = 0.75 + lum * 0.5;
      cc = mix(cc, uJacket * sh, smoothstep(0.3, 0.45, vCloth.x));
      cc = mix(cc, uPants * sh, smoothstep(0.3, 0.45, vCloth.y));
      cc = mix(cc, mix(cc, uPants * sh, uLong), smoothstep(0.3, 0.45, vCloth.z));
      cc = mix(cc, uShoe, smoothstep(0.3, 0.45, vCloth.w));
      diffuseColor.rgb = cc;`);
  };
  m.customProgramCacheKey = () => 'cloth1';
  return m;
}

const SKINS = ['#ffe2cf', '#f3cdb0', '#d8a37f', '#b97d58', '#fff0e2'];
const SHIRTS = ['#c8453a', '#3c6fb4', '#e8e2d2', '#3f8a5a', '#d89a2a', '#6d4a8a', '#2d2d33', '#d46a8f', '#5aa0b8', '#8a5a3a'];
const PANTS_C = ['#2b3346', '#3a3a3a', '#5a4a3a', '#6b7a8a', '#1e1e24', '#4a5a3a'];
const HAIRS = ['#2a1d14', '#4a3222', '#1a1714', '#7a5a38', '#b9b1a6', '#8a4a20'];
const TYPES = {
  jandarma: { jacket: '#4c5a33', pants: '#3f4b2b', shoe: '#1a1a14', hat: '#3a4526', label: 'Jandarma' },
  polis: { jacket: '#22314f', pants: '#1b2436', shoe: '#111', hat: '#141c2c', label: 'Polis' },
  vet: { jacket: '#ff7a1a', pants: '#2e3b2f', shoe: '#2a2018', hat: '#ff7a1a', label: 'Hayvan Kontrol' },
};

export class Person {
  constructor(type = 'civil', seed = 1) {
    const r = mulberry32(seed * 7919 + 3);
    const female = type === 'civil' ? r() < 0.5 : r() < 0.3;
    const base = this.base = female ? BASES.female : BASES.male;
    this.type = type;
    const T = TYPES[type] || {};
    this.root = new THREE.Group();
    const inner = this.inner = new THREE.Group(); this.root.add(inner);
    const model = this.model = skClone(base.scene);
    model.rotation.y = -base.yawFix;
    const sc = (0.92 + r() * 0.12) * (1.75 / base.height);
    model.scale.setScalar(sc);
    inner.add(model);
    this.U = {
      uJacket: { value: new THREE.Color(T.jacket || SHIRTS[Math.floor(r() * SHIRTS.length)]) },
      uPants: { value: new THREE.Color(T.pants || PANTS_C[Math.floor(r() * PANTS_C.length)]) },
      uShoe: { value: new THREE.Color(T.shoe || (r() < 0.5 ? '#f0f0f0' : '#2a2522')) },
      uSkin: { value: new THREE.Color(SKINS[Math.floor(r() * SKINS.length)]) },
      uLong: { value: type !== 'civil' || r() < 0.75 ? 1 : 0 },
    };
    this.bone = {};
    model.traverse((o) => {
      if (o.isBone) this.bone[o.name] = o;
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        if (/body/.test(o.name)) { o.material = clothMaterial(o.material, this.U); o.castShadow = true; this.body = o; }
      }
    });
    // giysi + saç kabuğu (tek ek çizim)
    const hasHat = !!T.hat, bald = !hasHat && r() > 0.88;
    const longHair = !hasHat && female && r() < 0.8;
    const opt = { sleeve: type !== 'civil' || r() < 0.45, legs: this.U.uLong.value > 0.5, hair: hasHat || bald ? 0 : (longHair ? 0.026 : 0.017), long: longHair };
    this.U.uHair = { value: new THREE.Color(HAIRS[Math.floor(r() * HAIRS.length)]) };
    const shell = new THREE.SkinnedMesh(buildShell(base, opt), shellMaterial(this.U));
    shell.frustumCulled = false; shell.castShadow = true;
    this.body.parent.add(shell); shell.position.copy(this.body.position); shell.quaternion.copy(this.body.quaternion); shell.scale.copy(this.body.scale);
    shell.bind(this.body.skeleton, this.body.bindMatrix);
    // kafa aksesuarı: karakter eksenlerine hizalı tutucu
    const head = this.bone.Head;
    const holder = new THREE.Object3D(); holder.quaternion.copy(base.bind.Head.bwInv); head.add(holder);
    const hs = 1;
    if (T.hat) {
      const hm = new THREE.MeshStandardMaterial({ color: T.hat, roughness: 0.8 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm); cap.position.set(0, 0.15 * hs, -0.01 * base.fwdSign); cap.scale.set(1, 0.75, 1.08);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), hm); brim.position.set(0, 0.15, 0.085 * base.fwdSign); brim.scale.z = 0.9;
      holder.add(cap, brim);
    } else if (longHair) {
      const hm = new THREE.MeshStandardMaterial({ color: this.U.uHair.value, roughness: 0.9 });
      if (r() < 0.5) { // at kuyruğu
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hm); tail.scale.set(0.9, 1.7, 0.8); tail.position.set(0, 0.04, -0.13 * base.fwdSign); holder.add(tail);
      } else { // omuza dökülen saç
        const fall = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hm); fall.scale.set(0.1, 0.15, 0.055); fall.position.set(0, 0.0, -0.075 * base.fwdSign); holder.add(fall);
      }
    }
    this.holder = holder;
    // el aksesuarları (karakter eksenli tutucu)
    const hand = this.bone.hand_r;
    const hh = new THREE.Object3D(); hh.quaternion.copy(base.bind.hand_r.bwInv); hand.add(hh); this.hh = hh;
    const S = 1 / sc;
    hh.scale.setScalar(S);
    if (type === 'civil') {
      this.phone = new THREE.Group();
      this.phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3 })));
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
      this.flash.position.set(0, 0.05, 0.01 * base.fwdSign); this.phone.add(this.flash);
      this.phone.position.set(0, -0.06, 0.05 * base.fwdSign); this.phone.visible = false; hh.add(this.phone);
    } else {
      this.gun = new THREE.Group();
      const gm = new THREE.MeshStandardMaterial({ color: type === 'vet' ? '#3a3a3a' : '#1b1b1b', metalness: 0.5, roughness: 0.4 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.75), gm); b.position.z = 0.25 * base.fwdSign; this.gun.add(b);
      if (type === 'vet') { const scp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8).rotateX(Math.PI / 2), gm); scp.position.set(0, 0.06, 0.12 * base.fwdSign); this.gun.add(scp); }
      this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0 }));
      this.muzzle.position.z = 0.65 * base.fwdSign; this.gun.add(this.muzzle);
      this.gun.position.set(0, -0.03, 0.02); hh.add(this.gun);
    }
    this.hips0 = this.bone.pelvis.position.clone();
    this.t = r() * 10; this.phase = 0; this.speed = 0;
    this.photo = 0; this.aim = 0; this.fall = 0; this.cower = 0; this.flashT = 0;
  }

  shoot() { this.flashT = 0.08; }

  // karakter uzayında dönüş uygula
  rot(name, R) {
    const b = this.bone[name], B = this.base.bind[name];
    _q2.copy(B.bwInv).multiply(R).multiply(B.bw);
    b.quaternion.copy(B.local).multiply(_q2);
  }

  animate(dt, st) {
    this.t += dt;
    this.speed = damp(this.speed, st.speed || 0, 8, dt);
    for (const k of ['photo', 'aim', 'fall', 'cower']) this[k] = damp(this[k], st[k] || 0, 6, dt);
    const sp = this.speed, run = clamp((sp - 2) / 3, 0, 1), mv = clamp(sp / 0.8, 0, 1);
    this.phase = (this.phase + dt * sp / lerp(1.4, 2.3, run)) % 1;
    const P = Math.PI * 2, s = Math.sin(this.phase * P), c = Math.cos(this.phase * P);
    const fs = this.base.fwdSign;
    const a = lerp(0.42, 0.8, run) * mv;
    const q = new THREE.Quaternion();
    // bacaklar
    for (const [side, k] of [['l', 1], ['r', -1]]) {
      const swing = -s * a * k - this.cower * 1.1;
      this.rot('thigh_' + side, q.setFromAxisAngle(X, swing * fs));
      const knee = Math.max(0, c * k) * lerp(0.7, 1.5, run) * mv + this.cower * 2.0 + 0.05;
      this.rot('calf_' + side, q.setFromAxisAngle(X, knee * fs));
      this.rot('foot_' + side, q.setFromAxisAngle(X, -this.cower * 0.8 * fs));
    }
    // gövde
    this.rot('spine_01', q.setFromAxisAngle(X, (run * 0.18 * mv + this.cower * 0.45) * fs));
    this.rot('spine_02', q.setFromAxisAngle(Y, s * 0.12 * mv));
    this.rot('neck_01', q.setFromAxisAngle(X, (-this.photo * 0.15 - run * 0.1) * fs));
    // kollar
    for (const [side, k] of [['l', -1], ['r', 1]]) {
      let sw = -s * a * 0.9 * k, el = 0.25 + run * 1.1 * mv;
      if (side === 'r') { sw = lerp(sw, -0.95, this.photo); el = lerp(el, 1.25, this.photo); sw = lerp(sw, -1.35, this.aim); el = lerp(el, 0.15, this.aim); }
      else { sw = lerp(sw, -1.2, this.aim); el = lerp(el, 0.6, this.aim); }
      sw = lerp(sw, -2.2, this.cower * 0.5); el = lerp(el, 2.0, this.cower * 0.5);
      const down = this.base.armDown[side];
      _q.setFromAxisAngle(X, sw * fs).multiply(down);
      this.rot('upperarm_' + side, _q);
      // dirsek: kol aşağı indirildikten sonraki eksende bük
      _q3.copy(down).invert(); q.setFromAxisAngle(X, -el * fs).premultiply(_q3).multiply(down);
      this.rot('lowerarm_' + side, q);
    }
    // kalça yüksekliği (zıplama, çömelme)
    const bob = Math.abs(s) * 0.035 * mv - this.cower * 0.3;
    this.inner.position.y = bob + this.fall * 0.15;
    this.inner.rotation.x = -this.fall * 1.45;
    // el aksesuarını karakter eksenine hizala (silah ileri, telefon dik)
    if ((this.gun || (this.phone && this.photo > 0.3)) && this.root.parent && this.fall < 0.2) {
      this.model.getWorldQuaternion(_q4);
      this.hh.parent.getWorldQuaternion(_q3).invert();
      this.hh.quaternion.copy(_q3).multiply(_q4).multiply(_q.setFromAxisAngle(X, this.gun ? -0.08 * fs * this.aim : 0));
    }
    if (this.phone) { this.phone.visible = this.photo > 0.3; this.flash.material.opacity = st.flash ? 1 : 0; }
    if (this.gun) { this.flashT -= dt; this.muzzle.material.opacity = this.flashT > 0 ? 1 : 0; }
  }
}

// Model yüklendiyse iskeletli insan, yoksa eski prosedürel insan
export function makePerson(type, seed) { return BASES.male ? new Person(type, seed) : new Human(type, seed); }
