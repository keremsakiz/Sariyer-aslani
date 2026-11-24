// Sesler: gerçek kayıtlar (Freesound CC0, bkz. assets/sfx/KAYNAKLAR.md) + kayıt yüklenene kadar prosedürel yedek.
// iPad: AudioContext ilk dokunuşta açılır (init). Dosyalar init'ten sonra sırayla, arka planda çözülür.
// Kayıt yoksa ya da çözülemezse eski WebAudio sentezi çalar, böylece oyun hiç sessiz kalmaz.

// Ses adı -> dosya (assets/sfx/). Tek dosya derlemede window.__AUDIO__ içinde data: URL olarak gelir.
const FILES = {
  roar: 'roar.m4a', growl: 'growl.m4a', growl2: 'growl2.m4a', hurt: 'hurt.m4a',
  step1: 'step1.m4a', step2: 'step2.m4a', step3: 'step3.m4a', step4: 'step4.m4a',
  drink: 'drink.m4a', eat: 'eat.m4a', cub: 'cub.m4a',
  forest: 'forest.m4a', night: 'night.m4a', water: 'water.m4a', wind: 'wind.m4a',
  rotor: 'rotor.m4a', drone: 'drone.m4a', siren: 'siren.m4a',
  shutter: 'shutter.m4a', gunshot: 'gunshot.m4a', heartbeat: 'heartbeat.m4a', shout: 'shout.m4a',
  deer: 'deer.m4a', boar: 'boar.m4a',
  mIntro: 'music_intro.m4a', mSad: 'music_sad.m4a', mHope: 'music_hope.m4a',
};
// önce oyun içi efektler, müzik en son (giriş müziği hariç: sinematik hemen başlıyor)
const PRELOAD = ['mIntro', 'roar', 'growl', 'step1', 'step2', 'step3', 'step4', 'forest', 'night', 'water', 'rotor', 'drink', 'eat', 'hurt',
  'growl2', 'drone', 'siren', 'shutter', 'gunshot', 'heartbeat', 'cub', 'shout', 'wind', 'deer', 'boar', 'mSad', 'mHope'];
// döngüler: ad -> { kayıt, hangi bus }
const LOOPS = { wind: ['wind', 'amb'], water: ['water', 'amb'], forest: ['forest', 'amb'], night: ['night', 'amb'], rotor: ['rotor', 'sfx'], drone: ['drone', 'sfx'] };

const urlFor = (n) => {
  const A = typeof window !== 'undefined' && window.__AUDIO__;
  return (A && A[n]) || 'assets/sfx/' + FILES[n];
};

export class Audio {
  constructor(set = { vol: 0.8, sfx: 1, amb: 1 }) { this.ctx = null; this.master = null; this.loops = {}; this.set = set; this.buf = {}; this.loading = {}; this.night = 0; this.music = null; this.stepT = 0; this.stepI = 0; }
  // ses seviyeleri: genel, efektler (dövüş, helikopter, arayüz), ortam (rüzgâr, su)
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.set;
    this.master.gain.setTargetAtTime(s.vol, t, 0.05); this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05); this.amb.gain.setTargetAtTime(s.amb, t, 0.05);
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // iOS: sessize alma anahtarı açıkken de çalsın (Safari 16.4+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* yok */ }
      this.master = this.ctx.createGain(); this.master.gain.value = this.set.vol; this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.set.sfx; this.sfx.connect(this.master);
      this.amb = this.ctx.createGain(); this.amb.gain.value = this.set.amb; this.amb.connect(this.master);
      // müzik ayrı bus'ta ama genel sesle birlikte kısılır
      this.mus = this.ctx.createGain(); this.mus.gain.value = 1; this.mus.connect(this.master);
      // iOS kilidi: sessiz bir tampon çalmak bağlamı kesin olarak açar
      const sil = this.ctx.createBufferSource(); sil.buffer = this.ctx.createBuffer(1, 1, 22050); sil.connect(this.ctx.destination); sil.start(0);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      for (const name in LOOPS) this.makeLoop(name);
      this.preload();
    } catch (e) { this.ctx = null; }
  }

  // ---------- kayıt yükleme ----------
  load(name) {
    if (this.buf[name]) return Promise.resolve(this.buf[name]);
    if (this.loading[name]) return this.loading[name];
    if (!this.ctx || !FILES[name]) return Promise.resolve(null);
    this.loading[name] = fetch(urlFor(name)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      // eski Safari: decodeAudioData yalnızca geri çağırma biçimini destekler
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((b) => { this.buf[name] = b; this.onLoaded(name); return b; })
      .catch(() => null);
    return this.loading[name];
  }
  preload() {
    let i = 0;
    const next = () => { if (i >= PRELOAD.length) return; this.load(PRELOAD[i++]).then(() => setTimeout(next, 30)); };
    next(); next(); // iki paralel kuyruk
  }
  onLoaded(name) {
    // döngü kaydı geldiyse prosedürel gürültüyü kayıtla değiştir
    for (const ln in LOOPS) if (LOOPS[ln][0] === name) this.swapLoop(ln, this.buf[name]);
  }
  // tek seferlik kayıt çal; yoksa false döner (çağıran prosedürel yedeğe geçer)
  play(name, { vol = 1, rate = 1, delay = 0, offset = 0, dur, bus } = {}) {
    if (!this.ctx) return false;
    const b = this.buf[name];
    if (!b) { this.load(name); return false; }
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(bus || this.sfx);
    if (dur) { g.gain.setValueAtTime(vol, t + Math.max(0, dur - 0.15)); g.gain.linearRampToValueAtTime(0.0001, t + dur); s.start(t, offset, dur + 0.05); }
    else s.start(t, offset);
    return true;
  }
  vary(a = 0.08) { return 1 + (Math.random() * 2 - 1) * a; }

  // ---------- döngüler ----------
  makeLoop(name) {
    // kayıt gelene kadar: filtreli gürültü (rüzgâr, su, rotor); orman/gece/drone sessiz bekler
    const g = this.ctx.createGain(); g.gain.value = 0;
    g.connect(LOOPS[name][1] === 'sfx' ? this.sfx : this.amb);
    const L = { g, src: null, lfo: null, want: 0 };
    const synth = { wind: ['lowpass', 400], rotor: ['lowpass', 160], water: ['bandpass', 900] }[name];
    if (synth) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = synth[0]; f.frequency.value = synth[1];
      const sg = this.ctx.createGain(); sg.gain.value = 1;
      if (name === 'rotor') { const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11; const lg = this.ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(sg.gain); lfo.start(); L.lfo = lfo; }
      src.connect(f); f.connect(sg); sg.connect(g); src.start(); L.src = src; L.synth = sg;
    }
    this.loops[name] = L;
  }
  swapLoop(name, b) {
    const L = this.loops[name]; if (!L || !b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const sg = this.ctx.createGain(); sg.gain.value = 0; s.connect(sg); sg.connect(L.g);
    // rastgele noktadan başla ki iki aynı döngü üst üste binmesin
    s.start(0, Math.random() * b.duration * 0.9);
    const t = this.ctx.currentTime;
    sg.gain.setTargetAtTime(1, t, 0.4);
    if (L.synth) { L.synth.gain.setTargetAtTime(0, t, 0.4); const old = L.src, lfo = L.lfo; setTimeout(() => { try { old.stop(); if (lfo) lfo.stop(); } catch (e) { /* */ } }, 2500); }
    L.src = s; L.synth = null; L.lfo = null; L.rec = true;
  }
  setLoop(name, vol) {
    if (!this.ctx) return;
    // eski çağrı: 'wind' = genel ortam sesi. Kayıtlar gelince gündüz ormanı / gece cırcır böceklerine dağıtılır.
    if (name === 'wind') {
      const n = this.night;
      this.setLoopRaw('forest', vol * 3.2 * (1 - n));
      this.setLoopRaw('night', vol * 3.2 * n);
      this.setLoopRaw('wind', (this.loops.forest.rec ? vol * 1.2 : vol));
      return;
    }
    if (name === 'water') vol *= this.loops.water.rec ? 4 : 1;
    if (name === 'rotor') vol *= this.loops.rotor.rec ? 1.6 : 1;
    this.setLoopRaw(name, vol);
  }
  setLoopRaw(name, vol) { const L = this.loops[name]; if (L && Math.abs(L.want - vol) > 0.002) { L.want = vol; L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3); } }

  // ---------- sentez (yedek ve küçük arayüz sesleri) ----------
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, { freq = 1000, q = 1, vol = 0.3, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------- oyun sesleri ----------
  roar() {
    // Kerem'in seçtiği kükreme (Freesound 684527); her seferinde perdesi biraz oynar ki tekrar gibi durmasın
    if (this.play('roar', { vol: 1, rate: this.vary(0.05) })) return;
    this.tone(95, 1.3, { type: 'sawtooth', vol: 0.25, slide: -40, attack: 0.15 }); this.tone(140, 1.1, { type: 'square', vol: 0.06, slide: -60, attack: 0.1 }); this.burst(1.2, { freq: 300, q: 0.7, vol: 0.25 });
  }
  growl() {
    const n = this.buf.growl2 && Math.random() < 0.5 ? 'growl2' : 'growl';
    if (this.play(n, { vol: 0.8, rate: this.vary(0.06) })) return;
    this.tone(70, 0.6, { type: 'sawtooth', vol: 0.15, slide: -15, attack: 0.08 });
  }
  hurt() { if (this.play('hurt', { vol: 0.8, rate: this.vary(0.06) })) return; this.tone(180, 0.35, { type: 'sawtooth', vol: 0.15, slide: -90 }); }
  shutter() { if (this.play('shutter', { vol: 0.6, rate: this.vary(0.05) })) return; this.burst(0.04, { freq: 3000, vol: 0.4 }); this.burst(0.05, { freq: 2000, vol: 0.3, delay: 0.07 }); }
  gunshot() { if (this.play('gunshot', { vol: 0.9, rate: this.vary(0.05) })) return; this.burst(0.35, { freq: 600, q: 0.4, vol: 0.9, type: 'lowpass' }); this.tone(60, 0.25, { type: 'square', vol: 0.3, slide: -30 }); }
  // uyuşturucu iğne: havalı tüfeğin "püf" sesi, tüfek kaydının kısa ve yüksek perdeden çalınması
  dart() { if (this.play('gunshot', { vol: 0.35, rate: 2.2, dur: 0.18 })) { this.burst(0.12, { freq: 2500, q: 1.5, vol: 0.15, delay: 0.02 }); return; } this.burst(0.12, { freq: 1800, q: 2, vol: 0.4 }); this.tone(900, 0.1, { type: 'triangle', vol: 0.08, slide: -500 }); }
  drink() {
    // içerken saniyede birkaç kez çağrılır: üst üste binmesin
    const t = this.ctx ? this.ctx.currentTime : 0; if (t < (this.drinkT || 0)) return;
    if (this.buf.drink) { this.drinkT = t + this.buf.drink.duration * 0.9; this.play('drink', { vol: 0.9, rate: this.vary(0.05) }); return; }
    this.load('drink'); this.tone(500 + Math.random() * 200, 0.08, { type: 'sine', vol: 0.12, slide: -250 });
  }
  eat() {
    const t = this.ctx ? this.ctx.currentTime : 0; if (t < (this.eatT || 0)) return;
    if (this.buf.eat) { const b = this.buf.eat, d = Math.min(1.2, b.duration); this.eatT = t + d * 0.85; this.play('eat', { vol: 0.8, rate: this.vary(0.08), offset: Math.random() * Math.max(0, b.duration - d), dur: d }); return; }
    this.load('eat'); this.burst(0.12, { freq: 500, q: 1.5, vol: 0.25 });
  }
  alarm() {
    // insanlar seni ilk fark ettiğinde: bağırış + uzaktan siren
    const a = this.play('shout', { vol: 0.7 }), b = this.play('siren', { vol: 0.35, delay: 0.6, dur: 5 });
    if (a || b) return;
    for (let i = 0; i < 3; i++) { this.tone(880, 0.18, { type: 'square', vol: 0.06, delay: i * 0.4 }); this.tone(660, 0.18, { type: 'square', vol: 0.06, delay: i * 0.4 + 0.2 }); }
  }
  notify() { this.tone(1320, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(1760, 0.12, { type: 'triangle', vol: 0.1, delay: 0.08 }); }
  heartbeat() { if (this.play('heartbeat', { vol: 0.9 })) return; this.tone(55, 0.15, { vol: 0.35 }); this.tone(50, 0.15, { vol: 0.25, delay: 0.22 }); }
  cubMew() { if (this.play('cub', { vol: 0.6, rate: this.vary(0.08) })) return; this.tone(900, 0.25, { type: 'triangle', vol: 0.05, slide: 300, attack: 0.05 }); this.tone(1100, 0.3, { type: 'triangle', vol: 0.04, slide: -200, delay: 0.35, attack: 0.05 }); }
  // eski çağrılar: gece/gündüz bilgisini de buradan alırız (kayıtlı ortam sesleri zaten kuşları ve böcekleri içeriyor)
  cricket() { this.night = Math.min(1, this.night + 0.25); if (this.loops.night && this.loops.night.rec) return; if (Math.random() < 0.5) for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, { vol: 0.015, delay: i * 0.06 }); }
  bird() { this.night = Math.max(0, this.night - 0.25); if (this.loops.forest && this.loops.forest.rec) return; const f = 2000 + Math.random() * 1500; this.tone(f, 0.12, { vol: 0.03, slide: 600 }); this.tone(f * 1.1, 0.1, { vol: 0.025, slide: -400, delay: 0.15 }); }
  // av hayvanları (yakındaysa ara sıra)
  deer() { this.play('deer', { vol: 0.5, rate: this.vary(0.08) }); }
  boar() { this.play('boar', { vol: 0.6, rate: this.vary(0.08) }); }

  // ayak sesleri: her karede hız ile çağrılır, adım temposunu kendisi tutar
  steps(speed, dt, swim = false) {
    if (!this.ctx || swim || speed < 0.8) { this.stepT = 0; return; }
    this.stepT -= dt;
    if (this.stepT > 0) return;
    const run = speed > 7;
    this.stepT = run ? 0.25 : clampN(1.9 / speed, 0.32, 0.7);
    const n = 'step' + (1 + (this.stepI++ % 4));
    this.play(n, { vol: (run ? 0.55 : 0.32) * this.vary(0.15), rate: this.vary(0.1) });
  }

  // ---------- müzik ----------
  playMusic(name, { vol = 0.55, fade = 1.5, loop = false } = {}) {
    if (!this.ctx) return false;
    this.stopMusic(fade);
    const b = this.buf[name];
    if (!b) {
      // henüz çözülmediyse: gelince çal (başka müzik istenmediyse). Dosya hiç yoksa yedeğe düş.
      if (!this.ctx || !FILES[name]) return false;
      this.pendingMusic = name;
      this.load(name).then((x) => { if (x && this.pendingMusic === name) this.playMusic(name, { vol, fade, loop }); });
      return true;
    }
    this.pendingMusic = null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = loop;
    const g = this.ctx.createGain(), t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + fade);
    s.connect(g); g.connect(this.mus); s.start(t);
    this.music = { s, g };
    return true;
  }
  stopMusic(fade = 1.5) {
    this.pendingMusic = null;
    if (!this.music || !this.ctx) return;
    const { s, g } = this.music, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade);
    try { s.stop(t + fade + 0.05); } catch (e) { /* */ }
    this.music = null;
  }
  // Sinematik müzik: kayıt yoksa yumuşak akorlar
  chord(notes, dur = 4, vol = 0.05) { for (const n of notes) { this.tone(n, dur, { type: 'sine', vol, attack: 1.2 }); this.tone(n * 2, dur, { type: 'triangle', vol: vol * 0.25, attack: 1.5 }); } }
  sadTheme() { if (this.playMusic('mSad')) return; const seq = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]]; seq.forEach((c, i) => setTimeout(() => this.chord(c, 4.5), i * 3800)); }
  hopeTheme() { if (this.playMusic('mHope')) return; const seq = [[261.6, 329.6, 392], [293.7, 349.2, 440], [329.6, 392, 493.9], [349.2, 440, 523.3]]; seq.forEach((c, i) => setTimeout(() => this.chord(c, 4.5, 0.055), i * 3500)); }
  // giriş ve gerilim: eski "zırr" testere dişi yerine gerçek müzik; kayıt yoksa yumuşak, alçak bir akor
  tenseTheme() { if (this.playMusic('mIntro', { vol: 0.6 })) return; this.chord([110, 130.8, 164.8], 6, 0.04); }
}

function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
