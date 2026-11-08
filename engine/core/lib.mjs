// Shared drawing helpers: seeded randomness, hand-wobbled shapes, variable-width ink, gouache dabs.
import { createCanvas } from '@napi-rs/canvas';

export const W = 1920, H = 1080, FPS = 24;
export const INK = '#2a2130';

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const NOISE_TABLES = new Map();   // seed → 256-entry table; building it was the hottest path in rig drawing
export function noise1(seed) {
  let T = NOISE_TABLES.get(seed);
  if (!T) {
    const r = rng(seed * 9973 + 17); T = Float64Array.from({ length: 256 }, r);
    if (NOISE_TABLES.size > 8192) NOISE_TABLES.clear();
    NOISE_TABLES.set(seed, T);
  }
  return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return T[i & 255] * (1 - u) + T[(i + 1) & 255] * u; };
}
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const canvas = (w, h) => { const c = createCanvas(w, h); return [c, c.getContext('2d')]; };

export function poly(ctx, P) { ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); }
export function path(ctx, P) { ctx.beginPath(); poly(ctx, P); }
export const shift = (P, dx, dy) => P.map(p => [p[0] + dx, p[1] + dy]);

// Low-frequency hand wobble along an outline (seamless for closed shapes).
export function wobble(P, seed, amp, closed = true) {
  if (!amp) return P;
  const nx = noise1(seed * 2 + 1), ny = noise1(seed * 2 + 2), f = 1 / 60;
  const s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = s[s.length - 1] || 1;
  const n = (fn, x) => { const u = closed ? x / T : 0; return (1 - u) * fn(x * f) + u * fn((x - T) * f); };
  return P.map((p, i) => [p[0] + (n(nx, s[i]) - 0.5) * 2 * amp, p[1] + (n(ny, s[i]) - 0.5) * 2 * amp]);
}

export function ell(cx, cy, rx, ry, seed = 0, amp = 1.5, rot = 0) {
  const n = Math.max(16, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / 6)), P = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    P.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return wobble(P, seed, amp);
}
export function arcPts(cx, cy, rx, ry, a0, a1, step = 6) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / step)), P = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; P.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return P;
}

// Polygon with rounded corners, densely sampled, then wobbled.
export function rpoly(P, r = 20, { seed = 0, jit = 2.2, step = 7 } = {}) {
  const out = [], n = P.length, R = i => (Array.isArray(r) ? r[(i + n) % n] : r);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r1 = Math.min(R(i), d1 / 2), r2 = Math.min(R(i), d2 / 2);
    const a = [p1[0] + ((p0[0] - p1[0]) * r1) / d1, p1[1] + ((p0[1] - p1[1]) * r1) / d1];
    const b = [p1[0] + ((p2[0] - p1[0]) * r2) / d2, p1[1] + ((p2[1] - p1[1]) * r2) / d2];
    const m = Math.max(2, Math.ceil((r1 + r2) / step));
    for (let k = 0; k <= m; k++) { const t = k / m, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]); }
    const r3 = Math.min(R(i + 1), d2 / 2);
    const c = [p2[0] + ((p1[0] - p2[0]) * r3) / d2, p2[1] + ((p1[1] - p2[1]) * r3) / d2];
    const q = Math.floor(Math.hypot(c[0] - b[0], c[1] - b[1]) / step);
    for (let k = 1; k < q; k++) { const t = k / q; out.push([b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t]); }
  }
  return wobble(out, seed, jit);
}

// Boxy limb segment between two joints (half-widths w1, w2).
export function limb(x1, y1, x2, y2, w1, w2, r, seed = 0) {
  const d = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / d, ny = (x2 - x1) / d;
  return rpoly([[x1 + nx * w1, y1 + ny * w1], [x2 + nx * w2, y2 + ny * w2], [x2 - nx * w2, y2 - ny * w2], [x1 - nx * w1, y1 - ny * w1]], r, { seed });
}

export function quad(p0, c, p1, n = 24) {
  const P = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; P.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
  return P;
}

// Hand-inked line: a filled ribbon whose width varies like brush pressure.
export function ink(ctx, P, w, { closed = true, color = INK, seed = 1, taper = !closed } = {}) {
  const n = P.length, nz = noise1(seed + 101), Lft = [], Rgt = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    let ww = w * (0.55 + 0.9 * nz(s / 80));
    if (taper) ww *= Math.pow(Math.sin(Math.PI * clamp(i / (n - 1), 0.02, 0.98)), 0.6);
    Lft.push([P[i][0] + (nx * ww) / 2, P[i][1] + (ny * ww) / 2]);
    Rgt.push([P[i][0] - (nx * ww) / 2, P[i][1] - (ny * ww) / 2]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  if (closed) { poly(ctx, Lft); poly(ctx, Rgt.reverse()); } else poly(ctx, [...Lft, ...Rgt.reverse()]);
  ctx.fill();
}

// Irregular soft-edged paint dab.
export function blob(ctx, x, y, rx, ry, rot, r, k = 8) {
  const P = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2, j = 0.7 + r() * 0.6, px = Math.cos(a) * rx * j, py = Math.sin(a) * ry * j;
    P.push([x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)]);
  }
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const s = m(P[k - 1], P[0]);
  ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < k; i++) { const e = m(P[i], P[(i + 1) % k]); ctx.quadraticCurveTo(P[i][0], P[i][1], e[0], e[1]); }
  ctx.closePath();
  ctx.fill();
}

// Painterly foliage mass. Dabs are shaded by position relative to a light at the upper right.
// If `lit` is given, the mass is erased from it (occlusion) and its sunlit dabs are painted into it.
export function clump(ctx, cx, cy, w, h, pal, n, r, { lit = null, litColor = '#8c7a3a', size = 0.13, thr = 0.3, light = [0.55, -0.8] } = {}) {
  const dabs = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), dx = Math.cos(a) * d, dy = Math.sin(a) * d;
    const v = clamp(dx * light[0] + dy * light[1] + (r() - 0.5) * 0.7, -1, 0.999);
    const rx = w * size * (0.6 + r() * 0.8);
    dabs.push({ x: cx + (dx * w) / 2, y: cy + (dy * h) / 2, rx, ry: rx * (0.55 + r() * 0.35), rot: (r() - 0.5) * 1.2, v, s: Math.floor(r() * 1e9) });
  }
  dabs.sort((a, b) => a.v - b.v);
  for (const d of dabs) {
    const idx = Math.min(pal.length - 1, Math.floor(((d.v + 1) / 2) * pal.length));
    ctx.fillStyle = pal[idx];
    blob(ctx, d.x, d.y, d.rx, d.ry, d.rot, rng(d.s));
    if (lit) {
      lit.save(); lit.globalCompositeOperation = 'destination-out'; blob(lit, d.x, d.y, d.rx, d.ry, d.rot, rng(d.s)); lit.restore();
      if (d.v > thr) { lit.fillStyle = litColor; blob(lit, d.x, d.y, d.rx * 0.8, d.ry * 0.8, d.rot, rng(d.s)); }
    }
  }
}
