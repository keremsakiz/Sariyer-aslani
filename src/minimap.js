// Mini harita + büyük harita. Arka plan bir kez çizilir (gölgelendirilmiş arazi, orman örtüsü, su, yollar,
// patikalar, evler, yer adları); her karede yalnız canlı katman (aslan, ekipler, helikopter, arama alanı) çizilir.
// Mini harita kameranın baktığı yön yukarıda olacak şekilde döner; dokununca kuzey yukarıda büyük harita açılır.
import { height, waterLevel, PLACES, VILLA, LAKES, HALF, ROADS, TRAILS } from './world.js';
import { clamp } from './util.js';

const S = 1024;                       // arka plan çözünürlüğü (piksel)
const W2M = S / (HALF * 2);           // metre → piksel
const mx = (x) => (x / (HALF * 2) + 0.5) * S;

export function buildMapBackground(world) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  // 1) arazi + gölgelendirme (düşük çözünürlükte hesaplanır, yumuşatılarak büyütülür)
  const R = 256, img = new ImageData(R, R), cell = (HALF * 2) / R;
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const x = (i + 0.5) * cell - HALF, z = (j + 0.5) * cell - HALF;
    const h = height(x, z), wl = waterLevel(x, z), k = (j * R + i) * 4;
    let r, g, b;
    if (h < wl) {
      const dpt = clamp((wl - h) / 6, 0, 1);
      r = 74 - dpt * 30; g = 140 - dpt * 40; b = 178 - dpt * 30;
    } else {
      const hx = height(x + cell, z) - h, hz = height(x, z + cell) - h;
      const shade = clamp(0.82 + (-hx * 0.55 - hz * 0.4) / cell * 1.6, 0.55, 1.18);
      const t = clamp((h - wl) / 60, 0, 1);
      const beach = h - wl < 1.2 ? 1 : 0;
      r = (beach ? 196 : 122 + t * 40) * shade; g = (beach ? 184 : 150 + t * 18) * shade; b = (beach ? 140 : 86 + t * 26) * shade;
    }
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = R; tmp.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(tmp, 0, 0, S, S);
  // 2) orman örtüsü: her ağaç yumuşak koyu yeşil bir leke
  c.fillStyle = 'rgba(38,78,36,0.32)';
  for (const t of world.trees) { c.beginPath(); c.arc(mx(t.x), mx(t.z), Math.max(1.6, t.r * W2M * 0.9), 0, 6.283); c.fill(); }
  c.fillStyle = 'rgba(30,64,30,0.22)';
  for (const t of world.trees) { if ((t.x * 7 + t.z) % 3 < 1) { c.beginPath(); c.arc(mx(t.x) - 0.6, mx(t.z) - 0.6, 1.1, 0, 6.283); c.fill(); } }
  // 3) su kenarı vurgusu: kıyıya açık çizgi (göller)
  c.strokeStyle = 'rgba(210,235,245,0.55)'; c.lineWidth = 1.2;
  // 4) yollar ve patikalar
  const line = (pts, w, col, dash) => { c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.lineJoin = c.lineCap = 'round'; c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(mx(x), mx(z)) : c.moveTo(mx(x), mx(z)))); c.stroke(); c.setLineDash([]); };
  for (const r of ROADS) line(r, 6.5, 'rgba(60,50,40,0.55)');
  for (const r of ROADS) line(r, 4.2, '#e9dcc0');
  for (const r of TRAILS) line(r, 2, 'rgba(240,225,190,0.85)', [5, 4]);
  // 5) evler
  for (const hs of world.houses || []) {
    const w = (hs.tpl ? hs.tpl.W : hs.w || 8) * W2M, d = (hs.tpl ? hs.tpl.D : hs.d || 8) * W2M;
    c.save(); c.translate(mx(hs.x), mx(hs.z)); c.rotate(-hs.yaw);
    c.fillStyle = '#b4553a'; c.fillRect(-w / 2, -d / 2, w, d); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.6; c.strokeRect(-w / 2, -d / 2, w, d);
    c.restore();
  }
  // villa: duvarlı bahçe
  c.strokeStyle = '#efe9dd'; c.lineWidth = 1.4; c.strokeRect(mx(VILLA.x - 28), mx(VILLA.z - 20), 56 * W2M, 44 * W2M);
  c.fillStyle = '#f2f0ea'; c.fillRect(mx(VILLA.x - 17), mx(VILLA.z - 11.5), 18 * W2M, 11 * W2M);
  c.fillStyle = '#4fc1e0'; c.fillRect(mx(VILLA.x - 13), mx(VILLA.z + 5.5), 10 * W2M, 5 * W2M);
  return cv;
}

// Etiketler (dönen haritada dik kalsın diye canlı katmanda çizilir)
function labels() {
  const out = PLACES.map((p) => ({ x: p.x, z: p.z - p.r * 0.2, t: p.name, big: 1 }));
  for (const l of LAKES) if (l.name) out.push({ x: l.x, z: l.z, t: l.name, water: 1 });
  out.push({ x: -480, z: 120, t: 'Belgrad Ormanı', forest: 1 }, { x: 0, z: -770, t: 'KARADENİZ', water: 1, big: 1 }, { x: VILLA.x, z: VILLA.z + 30, t: 'Villa' });
  return out;
}

export class Minimap {
  constructor(canvas, bigCanvas, world) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.big = bigCanvas; this.bctx = bigCanvas ? bigCanvas.getContext('2d') : null;
    this.bg = buildMapBackground(world);
    this.labels = labels();
    this.acc = 0; this.t = 0;
    this.radius = 130;                  // mini harita görünen yarıçap (m): pinch / tekerlek ile 50–400
    this.bz = 1; this.bcx = S / 2; this.bcy = S / 2;   // büyük harita yakınlaştırma ve merkez (arka plan pikseli)
    this.resize();
    this.gestures();
  }

  // ---- yakınlaştırma: pinch (iPad), tekerlek / izleme dörtgeni (laptop), büyük haritada sürükleme ----
  gestures() {
    const mini = this.cv, big = this.big;
    const zoomMini = (f) => { this.radius = Math.min(400, Math.max(50, this.radius * f)); this.acc = 1; };
    mini.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); zoomMini(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
    const pinch = (el, onPinch, onDrag) => {
      const pts = new Map(); let lastD = 0, lastX = 0, lastY = 0;
      const mid = () => { const a = [...pts.values()]; return [(a[0].x + (a[1] ? a[1].x : a[0].x)) / 2, (a[0].y + (a[1] ? a[1].y : a[0].y)) / 2]; };
      const dist = () => { const a = [...pts.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; };
      el.addEventListener('pointerdown', (e) => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch (_) { /* yok say */ }
        lastD = dist(); [lastX, lastY] = mid(); if (pts.size === 1) el._moved = 0;
      });
      el.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [x, y] = mid();
        if (pts.size > 1) { const d = dist(); if (lastD > 0) onPinch(d / lastD, x, y); lastD = d; el._moved = 99; }
        else if (onDrag) onDrag(x - lastX, y - lastY);
        el._moved += Math.hypot(x - lastX, y - lastY);
        lastX = x; lastY = y;
      });
      const up = (e) => { pts.delete(e.pointerId); lastD = dist(); if (pts.size) [lastX, lastY] = mid(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    // mini harita: iki parmak açınca yakınlaşır (daha küçük yarıçap)
    pinch(mini, (f) => zoomMini(1 / f));
    if (!big) return;
    big.addEventListener('wheel', (e) => { e.preventDefault(); const r = big.getBoundingClientRect(); this.zoomBig(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    pinch(big, (f, x, y) => { const r = big.getBoundingClientRect(); this.zoomBig(f, x - r.left, y - r.top); },
      (dx, dy) => { const r = big.getBoundingClientRect(), px = S / this.bz / r.width; this.bcx -= dx * px; this.bcy -= dy * px; this.clampBig(); this.redrawBig(); });
    big.addEventListener('dblclick', (e) => { const r = big.getBoundingClientRect(); this.zoomBig(2, e.clientX - r.left, e.clientY - r.top); });
  }
  // mini harita dokunuşu yakınlaştırma hareketiyse büyük harita açılmasın
  wasGesture() { return (this.cv._moved || 0) > 8; }
  clampBig() { const h = S / 2 / this.bz; this.bcx = Math.min(S - h, Math.max(h, this.bcx)); this.bcy = Math.min(S - h, Math.max(h, this.bcy)); }
  // (sx, sy): ekran pikselindeki odak (CSS); odak noktası sabit kalacak şekilde yakınlaştırır
  zoomBig(f, sx, sy) {
    const r = this.big.getBoundingClientRect(), w = r.width || 1;
    const nz = Math.min(8, Math.max(1, this.bz * f));
    const wx = this.bcx + (sx / w - 0.5) * S / this.bz, wy = this.bcy + (sy / w - 0.5) * S / this.bz;
    this.bz = nz; this.bcx = wx - (sx / w - 0.5) * S / nz; this.bcy = wy - (sy / w - 0.5) * S / nz;
    this.clampBig(); this.redrawBig();
  }
  zoomBigCenter(f) { const r = this.big.getBoundingClientRect(); this.zoomBig(f, r.width / 2, r.height / 2); }
  centerBig(x, z) { this.bcx = mx(x); this.bcy = mx(z); this.clampBig(); this.redrawBig(); }
  redrawBig() {
    if (this._raf || !this.lastSt) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.drawBig(this.lastSt); });
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = this.cv.clientWidth || 150;
    this.cv.width = this.cv.height = Math.round(css * dpr);
    if (this.big) { const r = this.big.getBoundingClientRect(); const s = Math.round(Math.min(r.width, r.height) * dpr) || 600; this.big.width = this.big.height = s; }
  }
  // st: { L, camYaw, A, heli, drone, humans, prey, hungry, time, night }
  draw(dt, st) {
    this.t += dt; this.acc += dt;
    if (this.acc < 1 / 20) return;      // 20 Hz yeterli
    this.acc = 0;
    const c = this.ctx, N = this.cv.width, R = N / 2;
    const metersRadius = this.radius;   // mini haritada görünen yarıçap (m)
    const k = R / (metersRadius * W2M); // arka plan pikseli → ekran pikseli
    c.save(); c.clearRect(0, 0, N, N);
    c.beginPath(); c.arc(R, R, R - 1, 0, 6.283); c.clip();
    c.fillStyle = '#20384a'; c.fillRect(0, 0, N, N);
    // harita dönüşü: kameranın baktığı yön (sin, cos) ekranda yukarı gelsin → açı = camYaw + π
    const rot = st.camYaw + Math.PI;
    c.translate(R, R); c.rotate(rot); c.scale(k, k);
    c.translate(-mx(st.L.x), -mx(st.L.z));
    c.imageSmoothingEnabled = true;
    c.drawImage(this.bg, 0, 0);
    if (st.night > 0.3) { c.fillStyle = `rgba(10,18,40,${0.35 * st.night})`; c.fillRect(0, 0, S, S); }
    this.overlay(c, st, 1 / k);
    c.restore();
    // etiketler: dik
    this.drawLabels(c, st, (x, z) => {
      const dx = (mx(x) - mx(st.L.x)) * k, dz = (mx(z) - mx(st.L.z)) * k, a = rot;
      return [R + dx * Math.cos(a) - dz * Math.sin(a), R + dx * Math.sin(a) + dz * Math.cos(a)];
    }, N / 150, R);
    // aslan oku (ortada; kameraya göre yön)
    c.save(); c.translate(R, R); c.rotate(rot); c.rotate(Math.PI - st.L.yaw);
    const u = N / 150;
    c.fillStyle = '#ffd34a'; c.strokeStyle = '#1a1206'; c.lineWidth = 1.2 * u;
    c.beginPath(); c.moveTo(0, -7 * u); c.lineTo(5 * u, 5.5 * u); c.lineTo(0, 3 * u); c.lineTo(-5 * u, 5.5 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // pusula: kuzey işareti çerçevede
    const na = -rot;  // kuzey (−z) ekranda yukarıdan saat yönünde rot kadar döner
    // sade pusula: 30°'de bir çentik, dört ana yön (K kırmızı)
    c.save(); c.translate(R, R);
    for (let i = 0; i < 12; i++) {
      const a = -na + i * Math.PI / 6, sx = Math.sin(a), sy = -Math.cos(a), main = i % 3 === 0;
      if (main) continue;
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1 * u;
      c.beginPath(); c.moveTo(sx * (R - 2.5 * u), sy * (R - 2.5 * u)); c.lineTo(sx * (R - 6 * u), sy * (R - 6 * u)); c.stroke();
    }
    c.font = `bold ${8.5 * u}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ['K', 'D', 'G', 'B'].forEach((t, i) => {
      const a = -na + i * Math.PI / 2, x = Math.sin(a) * (R - 9 * u), y = -Math.cos(a) * (R - 9 * u);
      c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(x, y, 6.2 * u, 0, 6.283); c.fill();
      c.fillStyle = i === 0 ? '#ff6b5a' : 'rgba(255,255,255,.9)'; c.fillText(t, x, y + 0.5 * u);
    });
    c.restore();
    // çerçeve
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(R, R, R - 1.5 * u, 0, 6.283); c.stroke();
    if (st.A.level > 0) { c.strokeStyle = st.A.level > 1 ? 'rgba(255,59,48,.9)' : 'rgba(255,179,64,.9)'; c.lineWidth = 2 * u * (0.6 + 0.4 * Math.abs(Math.sin(this.t * 4))); c.beginPath(); c.arc(R, R, R - 4 * u, 0, 6.283); c.stroke(); }
  }
  // canlı katman (arka plan pikseli biriminde); px = bir ekran pikselinin arka plandaki karşılığı
  overlay(c, st, px) {
    const P = (x) => mx(x);
    // arama alanı
    if (st.A.level > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      c.fillStyle = st.A.level > 1 ? `rgba(255,59,48,${0.16 + pulse * 0.1})` : `rgba(255,179,64,${0.14 + pulse * 0.08})`;
      c.beginPath(); c.arc(P(st.A.x), P(st.A.z), 45 * W2M, 0, 6.283); c.fill();
    }
    // helikopter ışığı ve kendisi
    const h = st.heli;
    if (h.active) {
      c.fillStyle = 'rgba(255,240,170,0.45)'; c.beginPath(); c.arc(P(h.sx), P(h.sz), h.R * W2M, 0, 6.283); c.fill();
      c.save(); c.translate(P(h.x), P(h.z)); c.rotate(Math.PI - h.yaw);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#111'; c.lineWidth = px;
      c.beginPath(); c.ellipse(0, 0, 3 * px, 5 * px, 0, 0, 6.283); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.moveTo(-8 * px, 0); c.lineTo(8 * px, 0); c.moveTo(0, -8 * px); c.lineTo(0, 8 * px); c.stroke();
      c.restore();
    }
    if (st.drone.active) { c.strokeStyle = 'rgba(160,120,255,.9)'; c.lineWidth = 1.5 * px; c.beginPath(); c.arc(P(st.drone.x), P(st.drone.z), st.drone.R * W2M, 0, 6.283); c.stroke(); }
    // av hayvanları (acıkınca, yakındakiler)
    if (st.hungry) {
      c.fillStyle = '#e0b070';
      for (const n of st.prey) if (n.state !== 'dead' && n.state !== 'gone' && Math.hypot(n.x - st.L.x, n.z - st.L.z) < 90) { c.beginPath(); c.arc(P(n.x), P(n.z), 2.2 * px, 0, 6.283); c.fill(); }
    }
    // ekipler: görüş konisi + nokta
    for (const n of st.humans) {
      if (!n.responder || n.state === 'gone' || Math.hypot(n.x - st.L.x, n.z - st.L.z) > 160) continue;
      const eng = n.state === 'engage';
      c.fillStyle = eng ? 'rgba(255,60,50,.28)' : 'rgba(255,255,255,.16)';
      c.beginPath(); c.moveTo(P(n.x), P(n.z)); c.arc(P(n.x), P(n.z), 36 * W2M, Math.PI / 2 - n.yaw - 1.0, Math.PI / 2 - n.yaw + 1.0); c.closePath(); c.fill();
      c.fillStyle = n.type === 'vet' ? '#ff9f1a' : n.type === 'polis' ? '#4a7dff' : '#7fa34a';
      c.strokeStyle = '#000'; c.lineWidth = px;
      c.beginPath(); c.arc(P(n.x), P(n.z), 3.2 * px, 0, 6.283); c.fill(); c.stroke();
    }
  }
  drawLabels(c, st, toScreen, u, R) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const l of this.labels) {
      const [x, y] = toScreen(l.x, l.z);
      if (R && Math.hypot(x - R, y - R) > R - 14 * u) continue;
      c.font = `${l.big ? 'bold ' : ''}${(l.big ? 10 : 8.5) * u}px system-ui, sans-serif`;
      c.lineWidth = 3 * u; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(l.t, x, y);
      c.fillStyle = l.water ? '#cfeaff' : l.forest ? '#d8f0c0' : '#fff'; c.fillText(l.t, x, y);
    }
  }
  // büyük harita: kuzey yukarıda, tüm bölge
  drawBig(st) {
    if (!this.bctx) return;
    this.lastSt = st;
    const c = this.bctx, N = this.big.width, k = N / S * this.bz;
    const ox = N / 2 - this.bcx * k, oy = N / 2 - this.bcy * k;   // arka plan pikseli → ekran: p * k + o
    c.save(); c.clearRect(0, 0, N, N);
    c.fillStyle = '#20384a'; c.fillRect(0, 0, N, N);
    c.translate(ox, oy); c.scale(k, k); c.imageSmoothingEnabled = true; c.drawImage(this.bg, 0, 0);
    if (st.night > 0.3) { c.fillStyle = `rgba(10,18,40,${0.3 * st.night})`; c.fillRect(0, 0, S, S); }
    this.overlay(c, st, 1 / k);
    c.restore();
    const u = N / 420;
    this.drawLabels(c, st, (x, z) => [mx(x) * k + ox, mx(z) * k + oy], u, 0);
    c.save(); c.translate(mx(st.L.x) * k + ox, mx(st.L.z) * k + oy); c.rotate(Math.PI - st.L.yaw);
    c.fillStyle = '#ffd34a'; c.strokeStyle = '#1a1206'; c.lineWidth = 1.5 * u;
    c.beginPath(); c.moveTo(0, -9 * u); c.lineTo(6.5 * u, 7 * u); c.lineTo(0, 4 * u); c.lineTo(-6.5 * u, 7 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // ölçek çubuğu: yakınlaştırmaya göre 25 / 50 / 100 / 200 m
    const meters = [25, 50, 100, 200].find((m) => m * W2M * k > 60 * u) || 200, bar = meters * W2M * k;
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(12 * u, N - 30 * u, bar + 16 * u, 20 * u);
    c.fillStyle = '#fff'; c.fillRect(20 * u, N - 18 * u, bar, 3 * u); c.font = `${9 * u}px system-ui, sans-serif`; c.textAlign = 'left'; c.fillText(`${meters} m`, 20 * u, N - 24 * u);
    if (this.bz > 1.01) { c.textAlign = 'right'; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(N - 54 * u, N - 30 * u, 42 * u, 20 * u); c.fillStyle = '#fff'; c.fillText(`${this.bz.toFixed(1)}×`, N - 18 * u, N - 16 * u); }
  }
}

// Gerçek dünyaya yakın koordinat ve yön (Sarıyer çevresi): kuzey −z, doğu +x
const LAT0 = 41.168, LON0 = 29.05;
const DIRS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
export function coordText(x, z, yaw) {
  const lat = LAT0 - z / 111320, lon = LON0 + x / (111320 * Math.cos(LAT0 * Math.PI / 180));
  const brg = (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180 / Math.PI + 360) % 360;
  return `${Math.round(brg).toString().padStart(3, '0')}° ${DIRS[Math.round(brg / 45) % 8]}\n${lat.toFixed(4)}°K  ${lon.toFixed(4)}°D`;
}
