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

const JACKET = /^(spine_0[123]|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr])$/;
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
  return { scene, bind, J, fwdSign: fwd.z >= 0 ? 1 : -1, yawFix: Math.atan2(fwd.x, fwd.z), height, armDown };
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
      cc = mix(cc, uJacket * sh, clamp(vCloth.x * 1.2, 0.0, 1.0));
      cc = mix(cc, uPants * sh, clamp(vCloth.y * 1.2, 0.0, 1.0));
      cc = mix(cc, mix(cc, uPants * sh, uLong), clamp(vCloth.z * 1.3, 0.0, 1.0));
      cc = mix(cc, uShoe, clamp(vCloth.w * 1.3, 0.0, 1.0));
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
    // kafa aksesuarı: karakter eksenlerine hizalı tutucu
    const head = this.bone.Head;
    const holder = new THREE.Object3D(); holder.quaternion.copy(base.bind.Head.bwInv); head.add(holder);
    const hs = 1;
    if (T.hat) {
      const hm = new THREE.MeshStandardMaterial({ color: T.hat, roughness: 0.8 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm); cap.position.set(0, 0.15 * hs, -0.01 * base.fwdSign); cap.scale.set(1, 0.75, 1.08);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), hm); brim.position.set(0, 0.15, 0.085 * base.fwdSign); brim.scale.z = 0.9;
      holder.add(cap, brim);
    } else if (r() < 0.85) {
      const hm = new THREE.MeshStandardMaterial({ color: HAIRS[Math.floor(r() * HAIRS.length)], roughness: 0.9 });
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hm);
      hair.position.set(0, 0.135, -0.02 * base.fwdSign); hair.scale.set(1.04, 1.0, 1.1); holder.add(hair);
      if (female && r() < 0.7) { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), hm); tail.scale.set(0.9, 1.6, 0.8); tail.position.set(0, 0.07, -0.13 * base.fwdSign); holder.add(tail); }
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
