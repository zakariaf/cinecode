// Skies for every time of day. A sky is two screen-space canvases: a backdrop (gradient, sun or moon,
// stars) and a horizontally tileable cloud layer that drifts. Painters are shared by every set kit;
// the sun and moon sit on the side the set is lit from.
import { rng, lerp, pick, canvas, poly, path, ell, blob, clump } from '../core/lib.mjs';
import { paper } from './atmos.mjs';

export const SKY_TIMES = ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'sunset', 'twilight', 'night'];
export const SKY_W = 2400, SKY_H = 1500;

export function skyGradient(x, w, h, stops) { const g = x.createLinearGradient(0, 0, 0, h); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h); }
// Legacy dab clouds (kept for compatibility).
export function clouds(x, r, w, n, yMin, yMax, pal, light = [-0.6, -0.75]) {
  for (let i = 0; i < n; i++) { const cw = 300 + r() * 500, ch = 90 + r() * 140; clump(x, r() * w, yMin + r() * (yMax - yMin), cw, ch, pal, Math.round(cw / 3.4), r, { size: 0.09, light }); }
}

// A cel-painted cumulus: one merged silhouette of overlapping puffs arched over a flat base, in hard tones
// (pal: shade → lit), like the characters' cel shading. Each tone after the first is the silhouette shifted up (and a
// little sideways with the light) and clipped to it, so every terminator follows the cloud's underside (its flat base
// and the bottoms of its puffs), never its top: lit from above, the shade is a broad band along the underside; lit from
// below (a low sun), the underside glows in bands and the top stays in one shade. Each band is a good part of the
// cloud's height deep, so no tone reads as an outline round the cloud.
export const CLOUD_BANDS = [0.2, 0.4, 0.6];      // how far (× the cloud's height h) each lighter tone's shape is shifted
export const CLOUD_SIDE = 0.5;                   // how much of the light's sideways lean the bands take (they hug the underside)
export function cumulus(x, r, cx, cy, w, h, pal, light = [-0.6, -0.75]) {
  const seed = Math.floor(r() * 1e6), K = 5 + Math.floor(r() * 4), base = cy + h * 0.3, P = [];
  P.push([cx, base - h * 0.16, w * 0.46, h * 0.2]);
  for (let i = 0; i < K; i++) {
    const u = (i + 0.2 + r() * 0.6) / K, arch = Math.sin(Math.PI * u), rr = h * (0.2 + 0.24 * arch) * (0.85 + r() * 0.3);
    P.push([cx + (u - 0.5) * w * 0.86, base - rr * 0.6 - arch * h * (0.22 + r() * 0.16), rr, rr * 0.9]);
  }
  // lit from below, the tones go the other way: the whole cloud in its lightest tone, then darker ones shifted up
  const below = light[1] > 0, L = Math.hypot(light[0], light[1]) || 1, lx = (light[0] / L) * (below ? -h : h) * CLOUD_SIDE, ly = (light[1] / L) * (below ? -h : h);
  const tones = below ? pal.slice().reverse() : pal;
  const shape = (dx, dy) => { x.beginPath(); for (const [i, [px, py, rx, ry]] of P.entries()) { const m = Math.min(rx, ry); poly(x, ell(px + dx, py + dy, rx, ry, seed + i * 7, m * 0.04)); } };
  x.save(); x.beginPath(); x.rect(cx - w, cy - h * 3, w * 2, base - cy + h * 3); x.clip();
  x.fillStyle = tones[0]; shape(0, 0); x.fill();
  shape(0, 0); x.clip();
  // (each tone also covers everything higher than its band, so the bands stay on the underside and no sliver of another
  // tone shows in a notch between the puffs on top)
  for (let k = 1; k < tones.length; k++) {
    const d = CLOUD_BANDS[k - 1]; x.fillStyle = tones[k]; shape(lx * d, ly * d);
    x.rect(cx - w, cy - h * 3, w * 2, base + ly * d - h * 0.15 - (cy - h * 3)); x.fill();
  }
  x.restore();
}
// A long thin streak of cloud (sunset, high cirrus).
export function streak(x, r, cx, cy, w, h, pal) {
  for (let i = 0; i < 9; i++) { x.fillStyle = pick(r, pal); blob(x, cx + (r() - 0.5) * w * 0.7, cy + (r() - 0.5) * h, w * (0.18 + r() * 0.2), h * (0.2 + r() * 0.3), (r() - 0.5) * 0.06, r, 10); }
}

function glow(x, cx, cy, r0, R, rgb, a) {
  const g = x.createRadialGradient(cx, cy, r0, cx, cy, R);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.25, `rgba(${rgb},${a * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
}
function sunDisc(x, cx, cy, rad, col, rgb) {
  glow(x, cx, cy, rad * 0.5, rad * 4, rgb, 0.6);
  x.fillStyle = col; path(x, ell(cx, cy, rad, rad, 91, rad * 0.02)); x.fill();
}
function stars(x, r, w, h, n, ymax, a = 1) {
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = Math.pow(r(), 1.3) * h * ymax, big = r() < 0.05, al = (0.3 + r() * 0.7) * a * (1 - py / (h * ymax)) ** 0.5;
    x.fillStyle = `rgba(255,252,236,${al})`; x.beginPath(); x.arc(px, py, big ? 1.9 : 0.6 + r() * 0.6, 0, 7); x.fill();
    if (big && r() < 0.5) { x.strokeStyle = `rgba(255,250,230,${al * 0.6})`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px - 6, py); x.lineTo(px + 6, py); x.moveTo(px, py - 6); x.lineTo(px, py + 6); x.stroke(); }
  }
}
function milkyWay(x, r, w, h) {
  const yAt = u => h * (0.1 + 0.22 * u + 0.12 * Math.sin(u * 3.1));
  x.save(); x.globalCompositeOperation = 'screen';
  for (let i = 0; i < 420; i++) { const u = r(), px = u * w, py = yAt(u) + (r() - 0.5) * 150 * r(); x.fillStyle = `rgba(140,150,205,${0.012 + r() * 0.025})`; blob(x, px, py, 50 + r() * 120, 20 + r() * 40, 0.25, r, 8); }
  for (let i = 0; i < 1400; i++) { const u = r(), px = u * w, py = yAt(u) + (r() - 0.5) * 170 * r() * r(); x.fillStyle = `rgba(255,252,240,${0.15 + r() * 0.45})`; x.beginPath(); x.arc(px, py, 0.45 + r() * 0.5, 0, 7); x.fill(); }
  x.restore();
}
// The moon: a cream face with soft grey seas and a thin cool cel shade along the limb away from its light, the seas
// and the shade clipped to the disc so nothing spills past the limb. phase > 0 cuts it to a crescent lit on the left,
// phase < 0 to one lit on the right (a full moon is lit from the upper left); the dark part keeps a faint ghost of the disc.
function moon(x, cx, cy, rad, phase) {
  const lit = phase < 0 ? 1 : -1, c = Math.ceil(rad * 1.3) + 4, [m, mx] = canvas(2 * c, 2 * c), disc = ell(c, c, rad, rad, 93, 0.6), r = rng(93);
  glow(x, cx, cy, rad * 0.6, rad * 7, '220,228,255', 0.35);
  mx.fillStyle = '#f6f2e0'; path(mx, disc); mx.fill();
  mx.save(); path(mx, disc); mx.clip();
  mx.fillStyle = 'rgba(190,186,172,.42)';
  for (const [a, b, s] of [[-0.28, -0.22, 0.26], [0.22, 0.12, 0.2], [-0.08, 0.36, 0.16], [0.34, -0.36, 0.11], [-0.44, 0.16, 0.1], [0.05, -0.05, 0.12]]) blob(mx, c + a * rad, c + b * rad, s * rad, s * rad * 0.8, r() * 3, r, 9);
  // the shade: the disc outside a circle shifted toward the light (even-odd), a crescent on the far limb
  mx.globalCompositeOperation = 'multiply'; mx.fillStyle = 'rgba(196,194,232,.62)';
  mx.beginPath(); mx.rect(0, 0, 2 * c, 2 * c); mx.arc(c + lit * rad * 0.24, c - rad * 0.16, rad * 0.98, 0, 7); mx.fill('evenodd');
  mx.restore();
  if (phase) {
    mx.globalCompositeOperation = 'destination-out'; mx.beginPath(); mx.arc(c + rad * phase, c - rad * 0.18, rad * 0.98, 0, 7); mx.fill();
    mx.globalCompositeOperation = 'destination-over'; mx.fillStyle = 'rgba(206,212,240,.1)'; path(mx, disc); mx.fill();
  }
  x.drawImage(m, cx - c, cy - c);
}

// Each time of day: gradient stops, the sun/moon, cloud style, and the haze colour that far layers take. Dawn's
// cumulus stay high (their bases clear the far hills of an establishing view; only streaks lie low).
export const SKY_STYLE = {
  dawn: { grad: [[0, '#3a527f'], [0.3, '#8a88b4'], [0.5, '#e6b8a8'], [0.66, '#ffd9ae'], [1, '#fff0d0']], sun: { x: 0.66, y: 0.72, r: 34, col: '#fff6dc', rgb: '255,226,180', glow: 900, a: 0.95 },
    clouds: { n: 7, y: [0.08, 0.32], pal: ['#a48cb4', '#e0aab4', '#ffd6b4'], light: [0.5, 0.7], kind: 'cumulus', size: 0.85 }, streaks: { n: 5, y: [0.5, 0.62], pal: ['#e8b4a8', '#f2c4ac', '#d8a8b0'] }, haze: '236,214,206', stars: 60 },
  morning: { grad: [[0, '#4f8bc6'], [0.42, '#86bce2'], [0.62, '#cfe5ee'], [1, '#eef3e4']], sun: { x: 0.16, y: 0.18, r: 0, rgb: '255,250,226', glow: 700, a: 0.55 },
    clouds: { n: 6, y: [0.06, 0.46], pal: ['#a9b2d2', '#d0d6e8', '#eef1f6', '#ffffff'], light: [-0.6, -0.75], kind: 'cumulus', size: 1.1 }, haze: '226,236,232' },
  noon: { grad: [[0, '#3a7cc4'], [0.45, '#74b2e4'], [0.7, '#bcdcef'], [1, '#e8f2ea']], sun: { x: 0.4, y: -0.02, r: 0, rgb: '255,255,240', glow: 800, a: 0.6 },
    clouds: { n: 6, y: [0.06, 0.42], pal: ['#b4c0de', '#dfe5f2', '#ffffff', '#ffffff'], light: [-0.2, -1], kind: 'cumulus', size: 0.8 }, haze: '222,236,240' },
  afternoon: { grad: [[0, '#4a7fb8'], [0.4, '#8db8d8'], [0.66, '#e0e2d2'], [1, '#f6ecd0']], sun: { x: 0.2, y: 0.26, r: 0, rgb: '255,240,200', glow: 800, a: 0.55 },
    clouds: { n: 6, y: [0.06, 0.46], pal: ['#a8a8c4', '#d6d2de', '#f6eedf', '#fff9ee'], light: [-0.7, -0.6], kind: 'cumulus', size: 1.1 }, haze: '238,232,214' },
  golden: { grad: [[0, '#6f86b4'], [0.38, '#c4a2a6'], [0.58, '#f2b47c'], [0.74, '#ffd396'], [1, '#ffe8bc']], sun: { x: 0.74, y: 0.68, r: 44, col: '#fff3d2', rgb: '255,214,150', glow: 900, a: 0.95 },
    clouds: { n: 7, y: [0.1, 0.48], pal: ['#9e7f9c', '#f2b89a', '#ffdcb0'], light: [0.6, 0.55], kind: 'cumulus', size: 0.9 }, haze: '246,214,176' },
  sunset: { grad: [[0, '#3c3a72'], [0.32, '#8a5a88'], [0.52, '#e2786a'], [0.68, '#ff9a5c'], [0.82, '#ffc27a'], [1, '#ffd89a']], sun: { x: 0.7, y: 0.8, r: 58, col: '#ffe6b0', rgb: '255,150,90', glow: 1000, a: 1 },
    clouds: { n: 4, y: [0.12, 0.4], pal: ['#5a3c66', '#d0606a', '#ffa070'], light: [0.5, 0.8], kind: 'cumulus', size: 0.7 }, streaks: { n: 9, y: [0.45, 0.74], pal: ['#7a4a72', '#a85a72', '#d8706e', '#f09070'] }, haze: '232,160,140', stars: 40 },
  twilight: { grad: [[0, '#141c40'], [0.4, '#3c3c6c'], [0.62, '#86607e'], [0.78, '#e08a6c'], [1, '#f2b484']], moon: { x: 0.24, y: 0.3, r: 44, phase: 0 },
    clouds: { n: 4, y: [0.3, 0.55], pal: ['#3a3058', '#8a5670', '#c47070'], light: [0.6, 0.6], kind: 'cumulus', size: 0.7 }, streaks: { n: 5, y: [0.62, 0.76], pal: ['#9a5c70', '#c46c6c', '#d88470'] }, haze: '128,112,150', stars: 320 },
  night: { grad: [[0, '#081028'], [0.45, '#18264e'], [0.78, '#2e3a68'], [1, '#424a76']], moon: { x: 0.3, y: 0.24, r: 44, phase: 0 },
    clouds: { n: 4, y: [0.34, 0.62], pal: ['#283363', '#36427a', '#4c5890'], light: [-0.6, -0.75], kind: 'cumulus', size: 0.8 }, haze: '60,72,118', stars: 900, milky: true },
};

export function skyHaze(name) { return (SKY_STYLE[name] || SKY_STYLE.morning).haze; }

// Paint the backdrop of a sky. side = -1 puts the sun/moon on the left (set lit from the left); moonSide places the
// moon alone (a set lit from the left by day whose night key is still the moon at upper right).
export function paintSkyBack(name, x, r, w, h, { side = -1, moonSide = side } = {}) {
  const S = SKY_STYLE[name] || SKY_STYLE.morning, sx = (f, s = side) => (s < 0 ? f : 1 - f) * w;
  skyGradient(x, w, h, S.grad);
  if (S.milky) milkyWay(x, r, w, h);
  if (S.stars) stars(x, r, w, h, S.stars, name === 'night' ? 0.85 : 0.55, name === 'dawn' || name === 'sunset' ? 0.4 : 1);
  if (S.sun) { const s = S.sun, cx = sx(s.x), cy = s.y * h; glow(x, cx, cy, 10, s.glow, s.rgb, s.a); if (s.r) sunDisc(x, cx, cy, s.r, s.col, s.rgb); }
  if (S.moon) moon(x, sx(S.moon.x, moonSide), S.moon.y * h, S.moon.r, S.moon.phase * (moonSide < 0 ? 1 : -1));
  if (S.streaks) { const k = S.streaks; for (let i = 0; i < k.n; i++) streak(x, r, r() * w, lerp(k.y[0], k.y[1], r()) * h, 400 + r() * 500, 14 + r() * 16, k.pal); }
  paper(x, 0.022);
}
// Paint the cloud layer (transparent, wraps horizontally at w).
export function paintSkyClouds(name, x, r, w, h, { side = -1 } = {}) {
  const S = SKY_STYLE[name] || SKY_STYLE.morning, C = S.clouds; if (!C) return;
  const light = [C.light[0] * (side < 0 ? 1 : -1), C.light[1]];
  for (let i = 0; i < C.n; i++) {
    const cw = (300 + r() * r() * 650) * C.size, ch = cw * (0.36 + r() * 0.14), cx = ((i + r() * 0.8) / C.n) * w, cy = lerp(C.y[0], C.y[1], r()) * h;
    const s = Math.floor(r() * 1e6);
    for (const ox of [-w, 0, w]) if (cx + ox + cw > 0 && cx + ox - cw < w) cumulus(x, rng(s), cx + ox, cy, cw, ch, C.pal, light);
  }
  paper(x, 0.03);
}

// Global cache: a sky depends only on its name, its side, its moon's side and an optional tint.
const CACHE = new Map();
export function skyCanvases(name, { side = -1, moonSide = side, tint = null } = {}) {
  const key = `${name}|${side}|${moonSide}|${tint ? tint.join(',') : ''}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const seed = 500 + SKY_TIMES.indexOf(name) * 31 + (side < 0 ? 0 : 7);
  const [b, bx] = canvas(SKY_W, SKY_H), [c, cx] = canvas(SKY_W, SKY_H);
  paintSkyBack(name, bx, rng(seed), SKY_W, SKY_H, { side, moonSide });
  paintSkyClouds(name, cx, rng(seed + 1), SKY_W, SKY_H, { side });
  if (tint) for (const x of [bx, cx]) { x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(${tint[0]},${tint[1]})`; x.fillRect(0, 0, SKY_W, SKY_H); x.restore(); }
  const v = { back: b, clouds: c };
  CACHE.set(key, v); return v;
}
export const clearSkyCache = () => CACHE.clear();

// How dark the land is for a sky name, or a crossfade list [[name, weight]…] (0 = day .. 1 = full night): sets that
// re-light themselves for the night (a moonlit crest, a moonlit stone) fade those passes in with it.
export const NIGHT_LEVEL = { dawn: 0.1, morning: 0, noon: 0, afternoon: 0, golden: 0, sunset: 0.1, twilight: 0.55, night: 1 };
export function nightLevel(sky) {
  if (sky == null) return 0;
  if (typeof sky === 'number') return Math.max(0, Math.min(1, sky));
  if (typeof sky === 'string') return NIGHT_LEVEL[sky] ?? 0;
  let a = 0, n = 0; for (const [name, w] of sky) { if (!(w > 0)) continue; a += (NIGHT_LEVEL[name] ?? 0) * w; n += w; }
  return n ? a / n : 0;
}
