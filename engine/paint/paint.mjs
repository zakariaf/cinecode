// Background painting helpers: gouache foliage, trunks, branches (with perch geometry), grass, mist, rays.
import { rng, clamp, lerp, pick, canvas, poly, path, ell, arcPts, rpoly, quad, ink, blob, clump } from '../core/lib.mjs';

export const paperTex = (() => { let c; return (w, h) => {
  if (c && c.width >= w && c.height >= h) return c;
  const [cv, x] = canvas(w, h), img = x.createImageData(w, h), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 208 + r() * 47; img.data[i] = v; img.data[i + 1] = v - 3; img.data[i + 2] = v - 9; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0); return (c = cv);
}; })();
export function paper(x, a = 0.08) {
  const c = x.canvas; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'multiply'; x.globalAlpha = a;
  x.drawImage(paperTex(c.width, c.height), 0, 0); x.restore();
}

// Rich foliage: a dark mass, mid-tone dabs, small lit dabs toward the light, a few sky holes.
export function foliage(x, cx, cy, w, h, pal, r, { light = [-0.6, -0.75], density = 1, holes = null } = {}) {
  const n = Math.round((w * h) / 900 * density);
  clump(x, cx, cy + h * 0.05, w * 0.95, h * 0.9, [pal[0], pal[0], pal[1]], Math.max(12, n * 0.35), r, { size: 0.16, light });
  clump(x, cx, cy, w, h, pal.slice(0, -1), Math.max(16, n * 0.7), r, { size: 0.085, light });
  clump(x, cx + light[0] * w * 0.12, cy + light[1] * h * 0.12, w * 0.8, h * 0.75, pal.slice(2), Math.max(10, n * 0.45), r, { size: 0.05, light });
  if (holes) for (let i = 0; i < n * 0.04; i++) { x.fillStyle = holes; blob(x, cx + (r() - 0.5) * w * 0.7, cy + (r() - 0.5) * h * 0.6, 3 + r() * 6, 2 + r() * 4, r(), r, 6); }
}

// Tapered trunk lit from one side, with bark strokes and root flare.
export function trunk(x, r, tx, w, top, base, { lit = -1, col = '#4d5d54', dark = '#3a4744', litCol = 'rgba(214,190,130,.75)', haze = 0, lean = 0, roots = true } = {}) {
  const P = rpoly([[tx - w * 0.45 + lean, top], [tx + w * 0.45 + lean, top], [tx + w * 0.55, base - w * 0.5], ...(roots ? [[tx + w * 1.1, base + 4], [tx - w * 1.1, base + 4]] : [[tx + w * 0.6, base], [tx - w * 0.6, base]]), [tx - w * 0.55, base - w * 0.5]], w * 0.35, { seed: Math.round(tx), jit: w * 0.04 });
  x.save(); path(x, P); x.clip();
  x.fillStyle = col; x.fillRect(tx - w * 2, top - 10, w * 4, base - top + 20);
  x.fillStyle = dark; x.fillRect(lit < 0 ? tx : tx - w * 2, top - 10, w * 2, base - top + 20);
  for (let i = 0; i < w * 1.6; i++) { x.fillStyle = pick(r, ['rgba(36,46,44,.5)', 'rgba(98,110,96,.4)', 'rgba(70,82,74,.45)']); blob(x, tx - w / 2 + r() * w * 1.1 + lean * 0.5, top + r() * (base - top), 1 + r() * 2.5, 12 + r() * 60, 0, r, 6); }
  x.fillStyle = litCol; x.fillRect(lit < 0 ? tx - w * 0.5 + lean * 0.3 : tx + w * 0.32 + lean * 0.3, top - 10, w * 0.16, base - top + 20);
  if (haze) { x.fillStyle = `rgba(232,232,214,${haze})`; x.fillRect(tx - w * 2, top - 10, w * 4, base - top + 20); }
  x.restore();
  return P;
}

// A branch is a polyline [[x,y],…] with thickness w0→w1. Painted and queried from the same data,
// so anything perched on it sits exactly on its top surface.
export function branchTop(b, px) {
  const P = b.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const [a, c] = [P[i], P[i + 1]], lo = Math.min(a[0], c[0]), hi = Math.max(a[0], c[0]);
    if (px >= lo && px <= hi) { const u = (px - a[0]) / (c[0] - a[0] || 1), y = lerp(a[1], c[1], u), k = (i + u) / (P.length - 1); return y - lerp(b.w0, b.w1, k) / 2; }
  }
  return null;
}
export function paintBranch(x, b, { col = '#5a4636', dark = '#3e3028', lit = 'rgba(214,180,120,.6)' } = {}) {
  const P = b.pts, L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)], d = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = -(c[1] - a[1]) / d, ny = (c[0] - a[0]) / d;
    const w = lerp(b.w0, b.w1, i / (P.length - 1)) / 2; L.push([P[i][0] + nx * w, P[i][1] + ny * w]); R.push([P[i][0] - nx * w, P[i][1] - ny * w]);
  }
  const S = [...L, ...R.reverse()];
  x.fillStyle = col; path(x, S); x.fill();
  x.save(); path(x, S); x.clip(); x.fillStyle = dark; x.beginPath(); poly(x, P.map(p => [p[0], p[1] + 2]).concat(R.slice().reverse().map(p => [p[0], p[1] + 40]).reverse())); x.fill();
  x.strokeStyle = lit; x.lineWidth = Math.max(2, b.w1 * 0.3); x.beginPath(); P.forEach((p, i) => { const y = p[1] - lerp(b.w0, b.w1, i / (P.length - 1)) / 2 + 2; i ? x.lineTo(p[0], y) : x.moveTo(p[0], y); }); x.stroke();
  x.restore();
}

// A broadleaf tree. Returns its geometry (trunk polygon, branches) for anchors and occlusion.
export function oak(x, r, tx, base, cw, ch, { pal = ['#23452c', '#2f5a36', '#3d6d3d', '#527f45', '#7c9f55', '#a9bd6a'], light = [-0.6, -0.75], tw = 0.09, branches = [], holes = null, lit = -1 } = {}) {
  const w = cw * tw, top = base - ch * 0.62;
  const T = trunk(x, r, tx, w, top, base, { lit, col: '#6a5240', dark: '#4a382c', litCol: 'rgba(225,190,130,.6)' });
  for (const b of branches) paintBranch(x, b);
  foliage(x, tx, base - ch * 0.72, cw, ch * 0.62, pal, r, { light, holes });
  return { trunk: T, branches };
}

export function grassField(x, r, x0, x1, y0, y1, pal, n, scaleAt = () => 1) {
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * (x1 - x0), py = y0 + Math.pow(r(), 0.85) * (y1 - y0), k = scaleAt(py);
    x.fillStyle = pick(r, pal); blob(x, px, py, (4 + r() * 9) * k, (1.5 + r() * 2.5) * k, (r() - 0.5) * 0.4, r, 6);
  }
}
export function flowers(x, r, x0, x1, y0, y1, n, scaleAt = () => 1, pal = ['#fbf7ee', '#f6e27a', '#f3b8c8', '#c9b8ec', '#f29a6a']) {
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * (x1 - x0), py = y0 + r() * (y1 - y0), k = scaleAt(py), c = pick(r, pal);
    if (k > 1.1 && r() < 0.5) { ink(x, [[px, py], [px + (r() - 0.5) * 4, py - 10 * k]], 1.2 * k, { closed: false, color: '#4f7a3a', seed: i, taper: false }); for (let j = 0; j < 5; j++) { const a = j / 5 * 6.28; x.fillStyle = c; x.beginPath(); x.arc(px + Math.cos(a) * 2.6 * k, py - 10 * k + Math.sin(a) * 2.6 * k, 1.9 * k, 0, 7); x.fill(); } x.fillStyle = '#e8b83a'; x.beginPath(); x.arc(px, py - 10 * k, 1.4 * k, 0, 7); x.fill(); }
    else { x.fillStyle = c; x.beginPath(); x.arc(px, py, (1.6 + r() * 1.6) * k, 0, 7); x.fill(); }
  }
}
export function blades(x, r, x0, x1, yAt, n, { len = [30, 90], w = 6, pal = ['#2f5a2c', '#3f6e35', '#4a7d3c', '#5b8c45'], seed = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * (x1 - x0), y0 = yAt(px), L = len[0] + r() * (len[1] - len[0]);
    const pts = quad([px, y0 + 10], [px + (r() - 0.5) * 24, y0 - L * 0.5], [px + (r() - 0.5) * 46, y0 - L], 12);
    ink(x, pts, w * (0.7 + r() * 0.6), { closed: false, color: pick(r, pal), seed: seed * 1000 + i });
  }
}
export function fern(x, r, cx, cy, len, ang, pal = ['#1f3a26', '#2a4a30', '#35583a']) {
  const tip = [cx + Math.cos(ang) * len, cy + Math.sin(ang) * len];
  const pts = quad([cx, cy], [cx + Math.cos(ang - 0.4) * len * 0.6, cy + Math.sin(ang - 0.4) * len * 0.6], tip, 30);
  ink(x, pts, 4, { closed: false, color: pal[0], seed: Math.round(cx) });
  for (let k = 2; k < pts.length - 1; k++) {
    const u = k / pts.length, s = (1 - u) * len * 0.2 + 6, [px, py] = pts[k];
    for (const side of [-1, 1]) { const a = ang + side * 1.1; x.fillStyle = pick(r, pal); blob(x, px + Math.cos(a) * s * 0.5, py + Math.sin(a) * s * 0.5, s * 0.55, s * 0.18, a, r, 7); }
  }
}
export function rock(x, r, cx, cy, w, h, { col = '#9a978a', dark = '#6e6c62', lit = '#c4c0ae', moss = true } = {}) {
  const P = rpoly([[cx - w / 2, cy], [cx - w * 0.42, cy - h * 0.7], [cx - w * 0.1, cy - h], [cx + w * 0.3, cy - h * 0.85], [cx + w / 2, cy - h * 0.3], [cx + w * 0.45, cy]], Math.min(w, h) * 0.3, { seed: Math.round(cx + cy), jit: 1.5 });
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip(); x.fillStyle = dark; x.fillRect(cx, cy - h - 5, w, h + 10); x.fillStyle = lit; blob(x, cx - w * 0.2, cy - h * 0.75, w * 0.25, h * 0.15, -0.3, r, 7);
  if (moss) { x.fillStyle = 'rgba(110,140,70,.75)'; for (let i = 0; i < 6; i++) blob(x, cx - w * 0.3 + r() * w * 0.5, cy - h * (0.8 + r() * 0.2), 4 + r() * 6, 2 + r() * 2, 0, r, 6); }
  x.restore();
  return P;
}
export function skyGradient(x, w, h, stops) { const g = x.createLinearGradient(0, 0, 0, h); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h); }
export function clouds(x, r, w, n, yMin, yMax, pal, light = [-0.6, -0.75]) {
  for (let i = 0; i < n; i++) { const cw = 300 + r() * 500, ch = 90 + r() * 140; clump(x, r() * w, yMin + r() * (yMax - yMin), cw, ch, pal, Math.round(cw / 3.4), r, { size: 0.09, light }); }
}
export function hillsRow(x, r, x0, x1, yAt, pal, treePal, density = 1, light) {
  const pts = [[x0, 3000]]; for (let px = x0; px <= x1; px += 16) pts.push([px, yAt(px)]); pts.push([x1, 3000]);
  x.fillStyle = pal[0]; path(x, pts); x.fill();
  for (let i = 0; i < (x1 - x0) / 3 * density; i++) { const px = x0 + r() * (x1 - x0), py = yAt(px) + r() * 140; x.fillStyle = pick(r, pal); blob(x, px, py, 10 + r() * 30, 3 + r() * 6, 0, r, 6); }
  if (treePal) for (let px = x0; px < x1; px += (60 + r() * 200) / density) { const h = 30 + r() * 60; clump(x, px, yAt(px) - h * 0.3, h * 0.9, h, treePal, 20, r, { size: 0.17, light }); }
}
export function mistSprite(w, h, n, col = '252,244,226', a = 0.15, seed = 41) {
  const [c, x] = canvas(w, h), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = h / 2 + (r() - 0.5) * h * 0.25, rad = 80 + r() * 220;
    x.save(); x.translate(px, py); x.scale(1, 0.3 + r() * 0.2);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(-rad, -rad, rad * 2, rad * 2); x.restore();
  }
  return c;
}
export function raysSprite(w, h, O, rays, col = '255,240,200') {
  const [tmp, t] = canvas(w, h), [c, x] = canvas(w, h);
  for (const [a, wa, al] of rays) {
    const L = Math.hypot(w, h) * 1.2, g = t.createLinearGradient(O[0], O[1], O[0] + Math.cos(a) * L, O[1] + Math.sin(a) * L);
    g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(0.65, `rgba(${col},${al * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
    t.fillStyle = g; t.beginPath(); t.moveTo(...O); t.lineTo(O[0] + Math.cos(a - wa) * L, O[1] + Math.sin(a - wa) * L); t.lineTo(O[0] + Math.cos(a + wa) * L, O[1] + Math.sin(a + wa) * L); t.fill();
  }
  x.filter = 'blur(16px)'; x.drawImage(tmp, 0, 0); return c;
}
