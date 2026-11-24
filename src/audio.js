// Dosyasız, prosedürel sesler (WebAudio). iPad'de ilk dokunuştan sonra açılır.
export class Audio {
  constructor(set = { vol: 0.8, sfx: 1, amb: 1 }) { this.ctx = null; this.master = null; this.loops = {}; this.set = set; }
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
      this.master = this.ctx.createGain(); this.master.gain.value = this.set.vol; this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.set.sfx; this.sfx.connect(this.master);
      this.amb = this.ctx.createGain(); this.amb.gain.value = this.set.amb; this.amb.connect(this.master);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.makeLoop('wind', 'lowpass', 400, 0.0);
      this.makeLoop('rotor', 'lowpass', 160, 0.0);
      this.makeLoop('water', 'bandpass', 900, 0.0);
    } catch (e) { this.ctx = null; }
  }
  makeLoop(name, type, freq, vol) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    let lfo = null;
    if (name === 'rotor') { lfo = this.ctx.createOscillator(); lfo.frequency.value = 11; const lg = this.ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain); lfo.start(); }
    src.connect(f); f.connect(g); g.connect(name === 'rotor' ? this.sfx : this.amb); src.start();
    this.loops[name] = { g, f, lfo };
  }
  setLoop(name, vol) { if (!this.ctx) return; const L = this.loops[name]; if (L) L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3); }

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
  roar() { this.tone(95, 1.3, { type: 'sawtooth', vol: 0.25, slide: -40, attack: 0.15 }); this.tone(140, 1.1, { type: 'square', vol: 0.06, slide: -60, attack: 0.1 }); this.burst(1.2, { freq: 300, q: 0.7, vol: 0.25 }); }
  growl() { this.tone(70, 0.6, { type: 'sawtooth', vol: 0.15, slide: -15, attack: 0.08 }); }
  shutter() { this.burst(0.04, { freq: 3000, vol: 0.4 }); this.burst(0.05, { freq: 2000, vol: 0.3, delay: 0.07 }); }
  gunshot() { this.burst(0.35, { freq: 600, q: 0.4, vol: 0.9, type: 'lowpass' }); this.tone(60, 0.25, { type: 'square', vol: 0.3, slide: -30 }); }
  dart() { this.burst(0.12, { freq: 1800, q: 2, vol: 0.4 }); this.tone(900, 0.1, { type: 'triangle', vol: 0.08, slide: -500 }); }
  drink() { this.tone(500 + Math.random() * 200, 0.08, { type: 'sine', vol: 0.12, slide: -250 }); }
  eat() { this.burst(0.12, { freq: 500, q: 1.5, vol: 0.25 }); }
  hurt() { this.tone(180, 0.35, { type: 'sawtooth', vol: 0.15, slide: -90 }); }
  alarm() { for (let i = 0; i < 3; i++) { this.tone(880, 0.18, { type: 'square', vol: 0.06, delay: i * 0.4 }); this.tone(660, 0.18, { type: 'square', vol: 0.06, delay: i * 0.4 + 0.2 }); } }
  notify() { this.tone(1320, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(1760, 0.12, { type: 'triangle', vol: 0.1, delay: 0.08 }); }
  heartbeat() { this.tone(55, 0.15, { vol: 0.35 }); this.tone(50, 0.15, { vol: 0.25, delay: 0.22 }); }
  cubMew() { this.tone(900, 0.25, { type: 'triangle', vol: 0.05, slide: 300, attack: 0.05 }); this.tone(1100, 0.3, { type: 'triangle', vol: 0.04, slide: -200, delay: 0.35, attack: 0.05 }); }
  cricket() { if (Math.random() < 0.5) for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, { vol: 0.015, delay: i * 0.06 }); }
  bird() { const f = 2000 + Math.random() * 1500; this.tone(f, 0.12, { vol: 0.03, slide: 600 }); this.tone(f * 1.1, 0.1, { vol: 0.025, slide: -400, delay: 0.15 }); }
  // Sinematik müzik: yumuşak akorlar
  chord(notes, dur = 4, vol = 0.05) { for (const n of notes) { this.tone(n, dur, { type: 'sine', vol, attack: 1.2 }); this.tone(n * 2, dur, { type: 'triangle', vol: vol * 0.25, attack: 1.5 }); } }
  sadTheme() { const seq = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]]; seq.forEach((c, i) => setTimeout(() => this.chord(c, 4.5), i * 3800)); }
  hopeTheme() { const seq = [[261.6, 329.6, 392], [293.7, 349.2, 440], [329.6, 392, 493.9], [349.2, 440, 523.3]]; seq.forEach((c, i) => setTimeout(() => this.chord(c, 4.5, 0.055), i * 3500)); }
  tenseTheme() { this.tone(73.4, 6, { type: 'sawtooth', vol: 0.04, attack: 2 }); this.tone(77.8, 6, { type: 'sawtooth', vol: 0.03, attack: 2 }); }
}
