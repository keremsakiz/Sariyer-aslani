// Dokunmatik (iPad) + klavye/fare girdisi
export class Input {
  constructor(set = {}) {
    this.set = set;                     // oyuncu ayarları (solak düzeni, koş tuşu modu)
    this.jx = 0; this.jy = 0;           // joystick (-1..1)
    this.run = false; this.crouch = false;
    this.actDown = false; this.actPressed = false; this.roarPressed = false;
    this.lookDX = 0; this.lookDY = 0;   // kamera sürükleme
    this.dragging = false;
    this.keys = {};
    this.enabled = false;
    const joyBase = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
    let joyId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
    const R = 60;
    const app = document.getElementById('app');
    app.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const joySide = this.set.lefty ? e.clientX > window.innerWidth * 0.55 : e.clientX < window.innerWidth * 0.45;
      if (joySide && joyId === null) {
        joyId = e.pointerId; ox = e.clientX; oy = e.clientY;
        joyBase.style.left = ox + 'px'; joyBase.style.top = oy + 'px'; joyBase.style.display = 'block';
        knob.style.transform = 'translate(0,0)';
      } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; this.dragging = true; }
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) {
        let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        this.jx = dx / R; this.jy = dy / R;
        knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (e.pointerId === lookId) {
        this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === joyId) { joyId = null; this.jx = this.jy = 0; joyBase.style.display = 'none'; }
      if (e.pointerId === lookId) { lookId = null; this.dragging = false; }
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    this.resetJoy = () => { joyId = null; lookId = null; this.jx = this.jy = 0; this.dragging = false; joyBase.style.display = 'none'; };

    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); on(el); });
      const o = () => off && off(el);
      el.addEventListener('pointerup', o); el.addEventListener('pointercancel', o); el.addEventListener('pointerleave', o);
    };
    // koş: basılı tut ya da (ayara göre) dokun aç / dokun kapat
    hold('bRun', (el) => { this.run = this.set.runToggle ? !this.run : true; el.classList.toggle('on', this.run); },
      (el) => { if (!this.set.runToggle) { this.run = false; el.classList.remove('on'); } });
    hold('bAct', () => { this.actDown = true; this.actPressed = true; }, () => { this.actDown = false; });
    hold('bRoar', () => { this.roarPressed = true; });
    hold('bCrouch', (el) => { this.crouch = !this.crouch; el.classList.toggle('on', this.crouch); });
    this.setCrouch = (v) => { this.crouch = v; document.getElementById('bCrouch').classList.toggle('on', v); };

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!this.enabled) return;
      if (e.code === 'KeyE' || e.code === 'Space') { if (!e.repeat) this.actPressed = true; this.actDown = true; }
      if (e.code === 'KeyC') this.setCrouch(!this.crouch);
      if (e.code === 'KeyR') this.roarPressed = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'KeyE' || e.code === 'Space') this.actDown = false; });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
  move() {
    let x = this.jx, y = this.jy;
    const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1; if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1; if (k.KeyS || k.ArrowDown) y += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y, mag: Math.min(1, l) };
  }
  running() { return this.run || this.keys.ShiftLeft || this.keys.ShiftRight; }
  consume() { const a = this.actPressed, r = this.roarPressed; this.actPressed = false; this.roarPressed = false; return { act: a, roar: r }; }
  takeLook() { const d = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return d; }
}
