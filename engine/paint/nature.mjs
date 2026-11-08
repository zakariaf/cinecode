// Gouache nature: foliage masses, trunks, branches (painted and queried from the same data), grass,
// flowers, ferns, rocks, rolling hills, reeds, mushrooms.
import { lerp, pick, poly, path, ell, rpoly, quad, ink, blob, clump, noise1 } from '../core/lib.mjs';
import { celShade, contactShadow } from './brush.mjs';

// Rich foliage: a dark mass, mid-tone dabs, small lit dabs toward the light, a few sky holes.
export function foliage(x, cx, cy, w, h, pal, r, { light = [-0.6, -0.75], density = 1, holes = null } = {}) {
  const n = Math.round((w * h) / 900 * density);
  clump(x, cx, cy + h * 0.05, w * 0.95, h * 0.9, [pal[0], pal[0], pal[1]], Math.max(12, n * 0.35), r, { size: 0.16, light });
  clump(x, cx, cy, w, h, pal.slice(0, -1), Math.max(16, n * 0.7), r, { size: 0.085, light });
  clump(x, cx + light[0] * w * 0.12, cy + light[1] * h * 0.12, w * 0.8, h * 0.75, pal.slice(2), Math.max(10, n * 0.45), r, { size: 0.05, light });
  if (holes) for (let i = 0; i < n * 0.04; i++) { x.fillStyle = holes; blob(x, cx + (r() - 0.5) * w * 0.7, cy + (r() - 0.5) * h * 0.6, 3 + r() * 6, 2 + r() * 4, r(), r, 6); }
}

// A lobed crown: several overlapping foliage masses whose union reads as one tree.
// Back lobes are darker; the lit lobes sit toward the light. Returns the lobe list.
export function crown(x, r, cx, cy, w, h, pal, { light = [-0.6, -0.75], lobes = 6, density = 0.9, holes = null } = {}) {
  const L = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r() * 0.6, d = 0.22 + r() * 0.2;
    L.push({ x: cx + Math.cos(a) * w * d, y: cy + Math.sin(a) * h * d * 0.8 - h * 0.05, w: w * (0.42 + r() * 0.2), h: h * (0.42 + r() * 0.18) });
  }
  L.push({ x: cx, y: cy, w: w * 0.7, h: h * 0.7 });
  // far lobes (away from the light) first, so the lit ones overlap them
  L.sort((a, b) => ((a.x - cx) * light[0] + (a.y - cy) * light[1]) - ((b.x - cx) * light[0] + (b.y - cy) * light[1]));
  for (const [i, l] of L.entries()) {
    const shade = i / (L.length - 1), p = shade < 0.4 ? [pal[0], pal[0], ...pal.slice(1, -1)] : pal;
    foliage(x, l.x, l.y, l.w, l.h, p, r, { light, density, holes });
  }
  return L;
}

// Tapered trunk lit from one side, with bark strokes and root flare.
export function trunk(x, r, tx, w, top, base, { lit = -1, col = '#4d5d54', dark = '#3a4744', litCol = 'rgba(214,190,130,.75)', haze = 0, lean = 0, roots = true, inkW = 0, shade = 0, light } = {}) {
  const P = rpoly([[tx - w * 0.45 + lean, top], [tx + w * 0.45 + lean, top], [tx + w * 0.55, base - w * 0.5], ...(roots ? [[tx + w * 1.1, base + 4], [tx - w * 1.1, base + 4]] : [[tx + w * 0.6, base], [tx - w * 0.6, base]]), [tx - w * 0.55, base - w * 0.5]], w * 0.35, { seed: Math.round(tx), jit: w * 0.04 });
  x.save(); path(x, P); x.clip();
  x.fillStyle = col; x.fillRect(tx - w * 2, top - 10, w * 4, base - top + 20);
  if (!shade) { x.fillStyle = dark; x.fillRect(lit < 0 ? tx : tx - w * 2, top - 10, w * 2, base - top + 20); }
  for (let i = 0; i < w * 1.6; i++) { x.fillStyle = pick(r, ['rgba(36,46,44,.5)', 'rgba(98,110,96,.4)', 'rgba(70,82,74,.45)']); blob(x, tx - w / 2 + r() * w * 1.1 + lean * 0.5, top + r() * (base - top), 1 + r() * 2.5, 12 + r() * 60, 0, r, 6); }
  x.fillStyle = litCol; x.fillRect(lit < 0 ? tx - w * 0.5 + lean * 0.3 : tx + w * 0.32 + lean * 0.3, top - 10, w * 0.16, base - top + 20);
  if (haze) { x.fillStyle = `rgba(232,232,214,${haze})`; x.fillRect(tx - w * 2, top - 10, w * 4, base - top + 20); }
  x.restore();
  if (shade) celShade(x, P, { light: light || [lit, -0.4], amount: shade, bias: -0.08, seed: Math.round(tx) + 5 });
  if (inkW) ink(x, P, inkW, { seed: Math.round(tx) + 7 });
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
export function branchOutline(b) {
  const P = b.pts, L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)], d = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = -(c[1] - a[1]) / d, ny = (c[0] - a[0]) / d;
    const w = lerp(b.w0, b.w1, i / (P.length - 1)) / 2; L.push([P[i][0] + nx * w, P[i][1] + ny * w]); R.push([P[i][0] - nx * w, P[i][1] - ny * w]);
  }
  return [L, R];
}
export function paintBranch(x, b, { col = '#5a4636', dark = '#3e3028', lit = 'rgba(214,180,120,.6)', inkW = 0, tip = true } = {}) {
  const P = b.pts, [L, R] = branchOutline(b);
  const n = P.length - 1, dir = [P[n][0] - P[n - 1][0], P[n][1] - P[n - 1][1]], dl = Math.hypot(...dir) || 1;
  const cap = tip ? [[P[n][0] + (dir[0] / dl) * b.w1 * 0.7, P[n][1] + (dir[1] / dl) * b.w1 * 0.7]] : [];
  const S = [...L, ...cap, ...R.slice().reverse()];
  x.fillStyle = col; path(x, S); x.fill();
  x.save(); path(x, S); x.clip(); x.fillStyle = dark; x.beginPath(); poly(x, P.map(p => [p[0], p[1] + 2]).concat(R.slice().reverse().map(p => [p[0], p[1] + 40]).reverse())); x.fill();
  x.strokeStyle = lit; x.lineWidth = Math.max(2, b.w1 * 0.3); x.beginPath(); P.forEach((p, i) => { const y = p[1] - lerp(b.w0, b.w1, i / (P.length - 1)) / 2 + 2; i ? x.lineTo(p[0], y) : x.moveTo(p[0], y); }); x.stroke();
  x.restore();
  if (inkW) { ink(x, [...L, ...cap], inkW, { closed: false, seed: Math.round(P[0][0]) + 3, taper: false }); ink(x, [...cap, ...R.slice().reverse()], inkW * 1.3, { closed: false, seed: Math.round(P[0][0]) + 4, taper: false }); }
  return S;
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
export function blades(x, r, x0, x1, yAt, n, { len = [30, 90], w = 6, pal = ['#2f5a2c', '#3f6e35', '#4a7d3c', '#5b8c45'], seed = 1, clumps = 0 } = {}) {
  const nz = clumps ? noise1(seed + 31) : null;
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * (x1 - x0), dens = nz ? nz(px / 120) : 1;
    if (nz && r() > dens * dens * 1.6) continue;                 // tufts and gaps instead of a comb
    const y0 = yAt(px), L = (len[0] + r() * (len[1] - len[0])) * (nz ? 0.55 + dens * 0.7 : 1);
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
export function rock(x, r, cx, cy, w, h, { col = '#9a978a', dark = '#6e6c62', lit = '#c4c0ae', moss = true, inkW = 0, shade = 0, light = [-0.6, -0.75], ground = 0 } = {}) {
  const P = rpoly([[cx - w / 2, cy], [cx - w * 0.42, cy - h * 0.7], [cx - w * 0.1, cy - h], [cx + w * 0.3, cy - h * 0.85], [cx + w / 2, cy - h * 0.3], [cx + w * 0.45, cy]], Math.min(w, h) * 0.3, { seed: Math.round(cx + cy), jit: 1.5 });
  if (ground) contactShadow(x, cx, cy - 1, w * 0.62, Math.max(4, h * 0.22), ground);
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  if (!shade) { x.fillStyle = dark; x.fillRect(cx, cy - h - 5, w, h + 10); }
  x.fillStyle = lit; blob(x, cx - w * 0.2, cy - h * 0.75, w * 0.25, h * 0.15, -0.3, r, 7);
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(70,66,60,.25)'; blob(x, cx - w * 0.4 + r() * w * 0.8, cy - h * r(), 2 + r() * 5, 1 + r() * 2, r(), r, 6); }
  if (moss) { x.fillStyle = 'rgba(110,140,70,.75)'; for (let i = 0; i < 6; i++) blob(x, cx - w * 0.3 + r() * w * 0.5, cy - h * (0.8 + r() * 0.2), 4 + r() * 6, 2 + r() * 2, 0, r, 6); }
  x.restore();
  if (shade) celShade(x, P, { light, amount: shade, bias: -0.02, seed: Math.round(cx) });
  if (inkW) ink(x, P, inkW, { seed: Math.round(cx + cy) + 1 });
  return P;
}
export function hillsRow(x, r, x0, x1, yAt, pal, treePal, density = 1, light) {
  const pts = [[x0, 3000]]; for (let px = x0; px <= x1; px += 16) pts.push([px, yAt(px)]); pts.push([x1, 3000]);
  x.fillStyle = pal[0]; path(x, pts); x.fill();
  for (let i = 0; i < (x1 - x0) / 3 * density; i++) { const px = x0 + r() * (x1 - x0), py = yAt(px) + r() * 140; x.fillStyle = pick(r, pal); blob(x, px, py, 10 + r() * 30, 3 + r() * 6, 0, r, 6); }
  if (treePal) for (let px = x0; px < x1; px += (60 + r() * 200) / density) { const h = 30 + r() * 60; clump(x, px, yAt(px) - h * 0.3, h * 0.9, h, treePal, 20, r, { size: 0.17, light }); }
}

// A rolling ridge of land with soft gouache strokes following its curve, lit along its top edge.
export function ridge(x, r, x0, x1, yAt, { pal, rim = null, bottom = 3000, strokes = 1, step = 12 } = {}) {
  const pts = [[x0, bottom]]; for (let px = x0; px <= x1; px += step) pts.push([px, yAt(px)]); pts.push([x1, bottom]);
  x.fillStyle = pal[0]; path(x, pts); x.fill();
  x.save(); path(x, pts); x.clip();
  for (let i = 0; i < ((x1 - x0) / 4) * strokes; i++) {
    const px = x0 + r() * (x1 - x0), d = Math.pow(r(), 1.6) * 260, py = yAt(px) + 6 + d;
    x.fillStyle = pick(r, pal); blob(x, px, py, 14 + r() * 34, 2.5 + r() * 5, (yAt(px + 20) - yAt(px - 20)) / 60, r, 6);
  }
  if (rim) { x.strokeStyle = rim; x.lineWidth = 5; x.beginPath(); for (let px = x0; px <= x1; px += step) { const y = yAt(px) + 3; px === x0 ? x.moveTo(px, y) : x.lineTo(px, y); } x.stroke(); }
  x.restore();
  return pts;
}

// Reeds / rushes at the water's edge.
export function reeds(x, r, cx, cy, n, h, { pal = ['#3f6b3a', '#4f7d42', '#5f8c48', '#6f9a50'], spread = 60, heads = 0.3 } = {}) {
  for (let i = 0; i < n; i++) {
    const bx = cx + (r() - 0.5) * spread, H = h * (0.5 + r() * 0.6), lean = (r() - 0.5) * 0.5;
    const pts = quad([bx, cy + 4], [bx + lean * H * 0.3, cy - H * 0.6], [bx + lean * H, cy - H], 12);
    ink(x, pts, 3 + r() * 2.5, { closed: false, color: pick(r, pal), seed: Math.round(bx * 7 + i) });
    if (r() < heads) { const [hx, hy] = pts[9]; x.fillStyle = '#6a4a32'; path(x, ell(hx, hy, 3.2, 10, Math.round(bx), 0.3, lean * 0.8)); x.fill(); }
  }
}

// A toadstool: cap colour, a pale stem, spots.
export function mushroom(x, r, cx, cy, s, cap = '#c94a3a') {
  x.fillStyle = '#efe6d0'; path(x, rpoly([[cx - 2.4 * s, cy], [cx - 1.8 * s, cy - 7 * s], [cx + 1.8 * s, cy - 7 * s], [cx + 2.4 * s, cy]], 1.2 * s, { jit: 0.2 })); x.fill();
  const C = rpoly([[cx - 7 * s, cy - 6 * s], [cx - 4 * s, cy - 11 * s], [cx + 4 * s, cy - 11 * s], [cx + 7 * s, cy - 6 * s]], 3 * s, { jit: 0.3 });
  x.fillStyle = cap; path(x, C); x.fill();
  x.fillStyle = 'rgba(255,248,230,.9)'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(cx + (r() - 0.5) * 8 * s, cy - (7.5 + r() * 2.5) * s, 0.9 * s, 0, 7); x.fill(); }
  ink(x, C, 0.9 * s, { seed: Math.round(cx) });
}

// Small pebbles scattered along a line or over an area.
export function pebbles(x, r, x0, x1, yAt, n, { pal = ['#a39d8c', '#8f8a7c', '#bdb6a2', '#7c786c'], size = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * (x1 - x0), py = yAt(px) + (r() - 0.5) * 40, s = (2 + r() * 4) * size;
    x.fillStyle = 'rgba(40,40,40,.25)'; blob(x, px + 1, py + 1.2, s, s * 0.55, 0, r, 6);
    x.fillStyle = pick(r, pal); blob(x, px, py, s, s * 0.6, 0, r, 6);
  }
}

// A tuft of grass blades on the ground (for prop bases, path edges).
export function tuft(x, r, cx, cy, w, h, { pal = ['#4a7a3a', '#5b8c45', '#6f9e50', '#86b05e'], n = 9 } = {}) {
  for (let i = 0; i < n; i++) {
    const bx = cx + (r() - 0.5) * w, H = h * (0.5 + r() * 0.6), lean = (r() - 0.5) * 0.9;
    ink(x, quad([bx, cy + 2], [bx + lean * H * 0.3, cy - H * 0.5], [bx + lean * H, cy - H], 8), 2.2 + r() * 2, { closed: false, color: pick(r, pal), seed: Math.round(bx * 13 + i) });
  }
}

