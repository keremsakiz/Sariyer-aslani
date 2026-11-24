// Serap: açlık/susuzlukta beliren hayalet yavrular.
// Altın kenar ışıltısı, titreşen sıcak hava, çözülerek kaybolma, uçuşan ışık zerreleri
// ve yavruların koşarak bıraktığı, ine doğru giden parlayan pati izleri.
import * as THREE from 'three';
import { Feline } from './feline.js';
import { clamp, lerp, damp, smooth } from './util.js';

const GOLD = new THREE.Color('#ffc870');

// ---- hayalet malzeme: fresnel kenar ışığı + gürültüyle çözülme + hafif titreşim ----
function ghostify(root, U) {
  root.traverse((o) => {
    if (o.isLine) { o.visible = false; return; }   // bıyıklar hayalette görünmez
    if (!o.material || !o.isMesh) return;
    const lit = !o.material.isMeshBasicMaterial;
    o.castShadow = false;
    const m = o.material.clone();
    m.transparent = true; m.depthWrite = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFade = U.uFade; sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'uniform float uTime;\nvarying vec3 vGW;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.x += sin(position.y * 14.0 + uTime * 3.1) * 0.008;
          transformed.z += cos(position.y * 11.0 + uTime * 2.4) * 0.008;`)
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uFade, uTime;\nvarying vec3 vGW;
        float mh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float mn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        ` + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          float n = mn(vGW * 7.0 + vec3(0.0, -uTime * 1.2, 0.0)) * 0.7 + mn(vGW * 19.0) * 0.3;
          float edge = uFade * 1.2 - n;
          if (edge < 0.0) discard;
          float fres = ${lit ? 'pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2)' : '0.3'};
          vec3 gold = vec3(1.0, 0.78, 0.44);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gold * 0.9, 0.22) + gold * (fres * 1.4 + smoothstep(0.1, 0.0, edge) * 2.2);
          gl_FragColor.a = (0.5 + fres * 0.4) * smoothstep(0.0, 0.3, uFade);
        }`);
    };
    m.customProgramCacheKey = () => (lit ? 'ghost' : 'ghostB');
    o.material = m;
  });
}

// yumuşak ışık zerresi ve pati izi dokuları
function spriteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,230,170,.6)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function pawTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.filter = 'blur(1.5px)'; x.fillStyle = '#fff';
  x.beginPath(); x.ellipse(32, 40, 13, 11, 0, 0, 6.283); x.fill();
  for (const [tx, ty] of [[17, 22], [27, 15], [38, 15], [48, 22]]) { x.beginPath(); x.ellipse(tx, ty, 5.5, 7, (tx - 32) * 0.02, 0, 6.283); x.fill(); }
  const t = new THREE.CanvasTexture(c); return t;
}

export class Mirage {
  constructor(scene, height) {
    this.scene = scene; this.height = height;
    this.U = { uFade: { value: 0 }, uTime: { value: 0 } };
    this.cubs = [new Feline({ scale: 0.43, cub: true }), new Feline({ scale: 0.4, cub: true })];
    for (const c of this.cubs) { ghostify(c.root, this.U); c.root.visible = false; scene.add(c.root); }
    // ışık zerreleri
    const N = this.NM = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: spriteTex(), color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.motes.frustumCulled = false; this.motes.visible = false; scene.add(this.motes);
    this.mp = Array.from({ length: N }, () => ({ a: Math.random() * 6.28, r: Math.random() * 2.2, y: Math.random() * 1.6, s: 0.2 + Math.random() * 0.5 }));
    // pati izleri (iki yavru × 14)
    this.PN = 28;
    this.prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: pawTex(), color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), this.PN);
    this.prints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.PN * 3), 3);
    this.prints.frustumCulled = false; this.prints.visible = false; scene.add(this.prints);
    this.pp = [];
    this.active = false; this.trailT = 999;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._y = new THREE.Vector3(0, 1, 0);
  }

  // (x, z): yavruların belireceği yer; (dx, dz): ine doğru birim yön
  start(x, z, dx, dz, onMew) {
    this.active = true; this.t = 0; this.phase = 'play'; this.fade = 0; this.onMew = onMew;
    this.dir = { x: dx, z: dz }; this.ax = x; this.az = z;
    const side = { x: -dz, z: dx };
    this.c = this.cubs.map((f, i) => ({ f, x: x + side.x * (i ? 0.7 : -0.7), z: z + side.z * (i ? 0.7 : -0.7), yaw: Math.atan2(side.x * (i ? -1 : 1), side.z * (i ? -1 : 1)), play: i ? 1.4 : 0, st: {}, y: 0 }));
    for (const c of this.cubs) c.root.visible = true;
    this.motes.visible = true;
    this.pp = []; this.trailT = 0; this.prints.visible = true;
  }

  // L: aslan; dönen değer: true iken serap sürüyor
  update(dt, L) {
    this.U.uTime.value += dt;
    this.updateTrail(dt);
    if (!this.active) return false;
    this.t += dt;
    const d = Math.hypot(this.ax - L.x, this.az - L.z);
    if (this.phase === 'play' && (this.t > 3.6 || d < 13)) { this.phase = 'notice'; this.pt = 0; this.onMew && this.onMew(); }
    if (this.phase === 'notice') { this.pt += dt; if (this.pt > 1.8 || d < 8) { this.phase = 'run'; this.pt = 0; } }
    if (this.phase === 'run') this.pt += dt;
    const out = this.phase === 'run' && this.pt > 1.6;
    this.fade = damp(this.fade, out ? 0 : 1, out ? 1.6 : 1.6, dt);
    this.U.uFade.value = this.fade;

    for (const [i, c] of this.c.entries()) {
      const st = { tailUp: 0.6, look: 0 };
      if (this.phase === 'play') {
        // sırayla: sinip kuyruk sallama → atlama → diğeri yana yuvarlanır
        const other = this.c[1 - i];
        c.play += dt; const k = c.play % 2.8;
        const toO = Math.atan2(other.x - c.x, other.z - c.z);
        if (k < 1.0) { st.crouch = 0.8; st.tailUp = 0.2; c.yaw = toO; }
        else if (k < 1.35) { st.pounce = 1; const sp = 2.2 * dt; c.x += Math.sin(c.yaw) * sp; c.z += Math.cos(c.yaw) * sp; c.y = Math.sin((k - 1) / 0.35 * Math.PI) * 0.22; }
        else { c.y = 0; st.tilt = 1; st.look = Math.sin(this.t * 2 + i) * 0.5; }
        if (other.play % 2.8 > 1.3 && other.play % 2.8 < 2.4) st.roll = 1;
        // ana noktadan uzaklaşmasınlar
        const ox = c.x - this.ax, oz = c.z - this.az, ol = Math.hypot(ox, oz);
        if (ol > 1.6) { c.x = this.ax + ox / ol * 1.6; c.z = this.az + oz / ol * 1.6; }
      } else if (this.phase === 'notice') {
        // anneyi fark eder: döner, kulaklar dik, kafa yana eğik
        c.yaw = lerpAngle(c.yaw, Math.atan2(L.x - c.x, L.z - c.z), 1 - Math.exp(-5 * dt)); c.y = 0;
        st.tailUp = 1; st.tilt = 0.8; st.look = Math.sin(this.t * 1.5 + i) * 0.3;
      } else {
        // ine doğru zıplaya zıplaya koşar, arkasında ışıklı pati izleri bırakır
        const ty = Math.atan2(this.dir.x, this.dir.z) + (i ? 0.12 : -0.12);
        c.yaw = lerpAngle(c.yaw, ty, 1 - Math.exp(-6 * dt));
        const sp = smooth(clamp(this.pt / 0.5, 0, 1)) * 3.4;
        c.x += Math.sin(c.yaw) * sp * dt; c.z += Math.cos(c.yaw) * sp * dt; c.y = 0;
        st.speed = sp; st.hop = 1; st.tailUp = 1;
        c.dist = (c.dist || 0) + sp * dt;
        if (c.dist > 0.55 && this.pp.length < this.PN) { c.dist = 0; c.foot = !c.foot; this.addPrint(c.x + Math.cos(c.yaw) * (c.foot ? 0.07 : -0.07), c.z - Math.sin(c.yaw) * (c.foot ? 0.07 : -0.07), c.yaw); }
      }
      c.f.root.position.set(c.x, this.height(c.x, c.z) + c.y, c.z); c.f.root.rotation.y = c.yaw;
      c.f.animate(dt, st);
    }
    // iki yavru üst üste binmesin (atlama anı hariç)
    { const [a, b] = this.c, dx = b.x - a.x, dz = b.z - a.z, dd = Math.hypot(dx, dz) || 0.01, min = this.phase === 'play' ? 0.45 : 0.85;
      if (dd < min) { const push = (min - dd) / 2; a.x -= dx / dd * push; a.z -= dz / dd * push; b.x += dx / dd * push; b.z += dz / dd * push; } }
    // ışık zerreleri yavruların çevresinde yukarı süzülür
    const pos = this.motes.geometry.attributes.position.array, cx = (this.c[0].x + this.c[1].x) / 2, cz = (this.c[0].z + this.c[1].z) / 2, gy = this.height(cx, cz);
    this.mp.forEach((m, i) => {
      m.y += m.s * dt; m.a += dt * 0.3; if (m.y > 1.8) { m.y = 0; m.r = Math.random() * 2.2; }
      pos[i * 3] = cx + Math.cos(m.a) * m.r; pos[i * 3 + 1] = gy + m.y + Math.sin(this.t * 2 + i) * 0.05; pos[i * 3 + 2] = cz + Math.sin(m.a) * m.r;
    });
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.material.opacity = this.fade * 0.9;
    if (out && this.fade < 0.02) { this.active = false; for (const c of this.cubs) c.root.visible = false; this.motes.visible = false; return false; }
    return true;
  }

  addPrint(x, z, yaw) { this.pp.push({ x, z, yaw, t: 0 }); }

  // izler belirir, ~25 sn'de söner
  updateTrail(dt) {
    if (!this.prints.visible) return;
    let alive = 0;
    for (let i = 0; i < this.PN; i++) {
      const p = this.pp[i];
      let a = 0;
      if (p) { p.t += dt; a = Math.min(1, p.t * 3) * clamp(1 - (p.t - 12) / 14, 0, 1); if (a > 0) alive++; }
      if (p) {
        this._q.setFromAxisAngle(this._y, p.yaw); this._v.set(p.x, this.height(p.x, p.z) + 0.04, p.z);
        this._m.compose(this._v, this._q, this._s);
      } else this._m.makeScale(0, 0, 0);
      this.prints.setMatrixAt(i, this._m);
      this.prints.instanceColor.setXYZ(i, a, a, a);
    }
    this.prints.instanceMatrix.needsUpdate = true; this.prints.instanceColor.needsUpdate = true;
    if (!alive && !this.active && this.pp.length) { this.prints.visible = false; this.pp = []; }
  }

  // ekran efekti gücü (0..1): post-işleme ve CSS katmanı için
  get strength() { return this.active ? this.fade : 0; }

  hide() {
    this.active = false; this.fade = 0; this.U.uFade.value = 0;
    for (const c of this.cubs) c.root.visible = false; this.motes.visible = false; this.prints.visible = false; this.pp = [];
  }
}

function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
export { ghostify, lerp };
