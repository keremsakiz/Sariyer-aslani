// Ortak yardımcılar: rastgelelik, gürültü, matematik
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// 2D değer gürültüsü + fBm
const perm = new Uint8Array(512);
{
  const r = mulberry32(1122);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const grad = (h, x, y) => {
  const g = h & 7;
  const u = g < 4 ? x : y, v = g < 4 ? y : x;
  return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
};
export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10);
  const a = perm[X] + Y, b = perm[X + 1] + Y;
  return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
    lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v) * 0.25;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
