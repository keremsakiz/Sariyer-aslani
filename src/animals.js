// Hareketli hayvan modelleri: Quaternius "Ultimate Animated Animals" (CC0). Şimdilik karaca için geyik (Deer).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const URLS = (typeof window !== 'undefined' && window.__ASSETS__ && window.__ASSETS__.deer) ? { deer: window.__ASSETS__.deer } : { deer: 'assets/deer.gltf' };
export const ANIMALS = {};

export async function loadAnimals() {
  const g = await new GLTFLoader().loadAsync(URLS.deer);
  const box = new THREE.Box3().setFromObject(g.scene);
  ANIMALS.deer = { scene: g.scene, clips: g.animations, h: box.max.y - box.min.y };
  return ANIMALS;
}

// Prey ile aynı arayüz: root, animate(dt, speed, dead)
export class AnimalPrey {
  constructor(kind, height = 1.4) {
    const A = ANIMALS.deer;
    this.kind = kind;
    this.root = new THREE.Group();
    const model = skClone(A.scene);
    model.scale.setScalar(height / A.h);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.act = {};
    for (const c of A.clips) this.act[c.name] = this.mixer.clipAction(c);
    const d = this.act.Death; if (d) { d.setLoop(THREE.LoopOnce); d.clampWhenFinished = true; }
    this.cur = null; this.t = Math.random() * 10; this.idleKind = 'Idle';
    this.play('Idle', 0);
    this.mixer.update(Math.random() * 3);
  }
  play(name, fade = 0.25) {
    const a = this.act[name]; if (!a || this.cur === a) return;
    a.reset().play();
    if (this.cur) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a;
  }
  animate(dt, speed, dead) {
    this.t += dt;
    if (dead) this.play('Death', 0.15);
    else if (speed > 5) { this.play('Gallop'); this.cur.timeScale = speed / 9; }
    else if (speed > 0.3) { this.play('Walk'); this.cur.timeScale = speed / 1.3; }
    else {
      // otlarken ara ara baş eğip yer
      if (this.t > 5) { this.t = 0; this.idleKind = Math.random() < 0.55 ? 'Eating' : Math.random() < 0.5 ? 'Idle' : 'Idle_Headlow'; }
      this.play(this.idleKind, 0.4); this.cur.timeScale = 1;
    }
    this.mixer.update(dt);
  }
}
