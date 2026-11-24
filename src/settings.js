// Ayarlar ekranı: sekmeler (Oyun, Görüntü, Ses, Kontroller), kaydırıcılar ve seçim düğmeleri.
// Değerler SET nesnesinde tutulur; her değişiklikte onChange(anahtar) çağrılır.

const pct = (v) => `%${Math.round(v * 100)}`;
const heliFmt = (v) => (v <= 0 ? 'Kapalı' : v < 0.75 ? `${pct(v)} · yalnız polis aranınca` : pct(v));

export const DIFF_NOTE = {
  kolay: 'Takipçiler yavaş ve geç fark eder, daha az isabet eder. Helikopter yalnızca polis aranınca gelir.',
  normal: 'Dengeli deneyim.',
  zor: 'Hızlı takipçiler, isabetli atışlar, uzun ve ısrarcı arama. Helikopter sık gelir.',
  ozel: 'Kendi ayarların. Aşağıdaki değerler Normal zorluğa göre.',
};

const TABS = [
  ['game', '🎯 Oyun', [
    { seg: 'diff', label: 'Zorluk', opts: [['kolay', 'Kolay'], ['normal', 'Normal'], ['zor', 'Zor'], ['ozel', 'Özel']] },
    { note: 'diffNote' },
    { range: 'needs', label: '🍖 Açlık ve susuzluk hızı', min: 0.5, max: 1.5, step: 0.05, fmt: pct },
    { range: 'speed', label: '🏃 Takipçi koşu hızı', min: 0.7, max: 1.3, step: 0.05, fmt: pct },
    { range: 'sight', label: '👁️ Fark edilme hızı', min: 0.5, max: 1.6, step: 0.05, fmt: pct },
    { range: 'aim', label: '🎯 Atış isabeti', min: 0.4, max: 1.5, step: 0.05, fmt: pct },
    { range: 'heli', label: '🚁 Helikopter sıklığı', min: 0, max: 2, step: 0.25, fmt: heliFmt },
    { range: 'search', label: '🔦 Arama süresi (ne kadar ısrar ederler)', min: 0.5, max: 2, step: 0.1, fmt: pct },
  ]],
  ['video', '🖥️ Görüntü', [
    { seg: 'quality', label: 'Grafik kalitesi', opts: [[-1, 'Otomatik'], [0, 'Ultra'], [1, 'Yüksek'], [2, 'Orta'], [3, 'Düşük']] },
    { note: 'qualNote' },
    { seg: 'mapSize', label: 'Mini harita boyutu', opts: [[0, 'Küçük'], [1, 'Orta'], [2, 'Büyük']] },
    { tog: 'fps', label: '⏱️ FPS göstergesi' },
    { tog: 'shake', label: '📳 Ekran sarsıntısı' },
    { tog: 'calm', label: '🌙 Sakin efektler (az parlama)' },
  ]],
  ['sound', '🔊 Ses', [
    { range: 'vol', label: '🔊 Genel ses', min: 0, max: 1, step: 0.05, fmt: pct },
    { range: 'sfx', label: '💥 Efektler (kükreme, atış, helikopter)', min: 0, max: 1, step: 0.05, fmt: pct },
    { range: 'amb', label: '🌬️ Ortam (rüzgâr, su)', min: 0, max: 1, step: 0.05, fmt: pct },
  ]],
  ['ctrl', '🎮 Kontroller', [
    { range: 'sens', label: '📷 Kamera hassasiyeti', min: 0.4, max: 2, step: 0.1, fmt: pct },
    { tog: 'invY', label: '↕️ Dikey ekseni ters çevir' },
    { tog: 'lefty', label: '🫲 Solak düzeni (joystick sağda, tuşlar solda)' },
    { tog: 'runToggle', label: '💨 Koş tuşu: dokun aç, dokun kapat' },
    { tog: 'haptics', label: '✋ Titreşim' },
  ]],
];

export class SettingsUI {
  constructor(root, SET, DIFFS, onChange) {
    this.SET = SET; this.DIFFS = DIFFS; this.onChange = onChange; this.root = root;
    const tabs = root.querySelector('.tabs'), body = root.querySelector('.setBody');
    this.ctl = {};
    for (const [id, name, items] of TABS) {
      const tb = document.createElement('button'); tb.className = 'tab'; tb.dataset.tab = id; tb.textContent = name;
      tb.setAttribute('role', 'tab'); tb.addEventListener('click', () => this.show(id)); tabs.appendChild(tb);
      const sec = document.createElement('section'); sec.dataset.tab = id; sec.setAttribute('role', 'tabpanel');
      for (const it of items) sec.appendChild(this.make(it));
      body.appendChild(sec);
    }
    this.show('game');
  }

  make(it) {
    const SET = this.SET;
    if (it.note) { const p = document.createElement('p'); p.className = 'setNote'; p.id = it.note; return p; }
    if (it.tog) {
      const b = document.createElement('button'); b.className = 'tog'; b.dataset.s = it.tog;
      b.innerHTML = `<span>${it.label}</span><b></b>`;
      b.addEventListener('click', () => { SET[it.tog] = SET[it.tog] ? 0 : 1; this.changed(it.tog); });
      this.ctl[it.tog] = { refresh: () => { const on = !!SET[it.tog]; b.classList.toggle('on', on); b.querySelector('b').textContent = on ? 'Açık' : 'Kapalı'; b.setAttribute('aria-pressed', on); } };
      return b;
    }
    if (it.seg) {
      const w = document.createElement('div'); w.className = 'setRow';
      w.innerHTML = `<div class="setLbl"><span>${it.label}</span></div><div class="seg" role="radiogroup"></div>`;
      const seg = w.querySelector('.seg');
      const btns = it.opts.map(([v, t]) => {
        const b = document.createElement('button'); b.textContent = t; b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          if (it.seg === 'diff' && v !== 'ozel') Object.assign(SET, this.DIFFS[v]);
          SET[it.seg] = v; this.changed(it.seg);
        });
        seg.appendChild(b); return [v, b];
      });
      this.ctl[it.seg] = { refresh: () => btns.forEach(([v, b]) => { const on = SET[it.seg] === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }) };
      return w;
    }
    // kaydırıcı
    const w = document.createElement('label'); w.className = 'setRow';
    w.innerHTML = `<div class="setLbl"><span>${it.label}</span><b></b></div><input type="range" min="${it.min}" max="${it.max}" step="${it.step}">`;
    const r = w.querySelector('input'), val = w.querySelector('b');
    r.addEventListener('input', () => {
      SET[it.range] = +r.value;
      if (this.DIFFS.normal[it.range] !== undefined) SET.diff = this.matchDiff();
      val.textContent = it.fmt(+r.value); this.changed(it.range, true);
    });
    this.ctl[it.range] = { refresh: () => { r.value = SET[it.range]; val.textContent = it.fmt(SET[it.range]); } };
    return w;
  }

  // kaydırıcılar bir hazır ayarla birebir aynıysa onu seç, değilse "Özel"
  matchDiff() {
    for (const [k, d] of Object.entries(this.DIFFS)) if (Object.keys(d).every((p) => Math.abs(this.SET[p] - d[p]) < 1e-6)) return k;
    return 'ozel';
  }

  changed(key, fromSlider = false) {
    this.onChange(key);
    if (fromSlider) { this.ctl.diff.refresh(); this.notes(); } else this.refresh();
  }

  notes() {
    const n = this.root.querySelector('#diffNote'); if (n) n.textContent = DIFF_NOTE[this.SET.diff] || '';
    const q = this.root.querySelector('#qualNote');
    if (q) q.textContent = this.SET.quality < 0 ? 'Otomatik: oyun takılırsa kalite kendiliğinden düşer.' : 'Elle seçildi: otomatik düşürme kapalı.';
  }

  refresh() { for (const c of Object.values(this.ctl)) c.refresh(); this.notes(); }

  show(id) {
    this.root.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.tab === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    this.root.querySelectorAll('.setBody section').forEach((s) => { s.hidden = s.dataset.tab !== id; });
    this.root.querySelector('.setBody').scrollTop = 0;
  }
}
