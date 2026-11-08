// Composite painters shared by the set kits: meadow floors, dirt paths, tree lines, big trees with
// hollows and branches, stumps, logs, bushes, standing and stepping stones. Each one paints in world
// coordinates and inks/cel-shades itself in the storybook style.
import { canvas, clamp, lerp, pick, path, ell, rpoly, quad, ink, blob, clump, noise1 } from '../core/lib.mjs';
import { crown, paintBranch, grassField, flowers, tuft, rock, mushroom } from './nature.mjs';
import { celShade, celShadeSprite } from './brush.mjs';

export const LEFT = [-0.6, -0.75], RIGHT = [0.6, -0.7];
export const GRASS = ['#8dbd5c', '#a6cd6c', '#74a64e', '#c2da82', '#689a47'];
export const LEAVES = ['#23452c', '#2f5a36', '#3d6d3d', '#527f45', '#7c9f55', '#a9bd6a'];
const SHADE = '#9a8cc4';
export const BARK = { col: '#6e5646', dark: '#4c3c32', lit: 'rgba(236,206,146,.6)', strokes: ['rgba(46,34,28,.45)', 'rgba(120,96,76,.35)', 'rgba(70,54,44,.4)'] };

// ───────────── ground ─────────────
// A meadow floor below the edge line y = edge(x), filled down to E.y1, with gouache patches, grass dabs
// and flowers whose size follows depth (sAt(y)).
export function meadowFloor(x, r, E, { edge, grad = [[0, '#a2ca70'], [0.3, '#8cbc5e'], [1, '#5f9446']], pal = GRASS, density = 1, flowerN = 1, sAt = () => 1, patches = ['rgba(70,120,50,.18)', 'rgba(190,220,120,.18)'], hazeTo = 160, hazeCol = '226,236,214' } = {}) {
  const pts = [[E.x0, E.y1 + 10]]; for (let px = E.x0; px <= E.x1 + 40; px += 30) pts.push([px, edge(px) + (r() - 0.5) * 3]); pts.push([E.x1 + 40, E.y1 + 10]);
  const top = Math.min(...pts.map(p => p[1]));
  const g = x.createLinearGradient(0, top, 0, E.y1); grad.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; path(x, pts); x.fill();
  x.save(); path(x, pts); x.clip();
  const W = E.x1 - E.x0, Hh = E.y1 - top;
  for (let i = 0; i < (W * Hh) / 9000; i++) { const py = top + Math.pow(r(), 0.9) * Hh, k = sAt(py); x.fillStyle = pick(r, patches); blob(x, E.x0 + r() * W, py, (60 + r() * 160) * k, (8 + r() * 18) * k, (r() - 0.5) * 0.2, r, 9); }
  grassField(x, r, E.x0, E.x1, top, E.y1, pal, Math.round((W * Hh) / 260 * density), sAt);
  if (flowerN) flowers(x, r, E.x0, E.x1, top + 20, E.y1, Math.round((W * Hh) / 2600 * flowerN), sAt);
  if (hazeTo) { const g2 = x.createLinearGradient(0, top, 0, top + hazeTo); g2.addColorStop(0, `rgba(${hazeCol},.45)`); g2.addColorStop(1, `rgba(${hazeCol},0)`); x.fillStyle = g2; x.fillRect(E.x0, top - 10, W, hazeTo + 10); }
  x.restore();
  return pts;
}

// A worn dirt path along y = yAt(x) with half-width hw(x). Returns its polygon (for surfaceAt).
// The polygon of a dirt path (pure geometry: the same call always gives the same outline).
export function pathBand(x0, x1, yAt, hw) {
  const nz = noise1(Math.round(x0) + 77), T = [], B = [];
  for (let px = x0; px <= x1 + 1e-6; px += 14) { const w = hw(px); T.push([px, yAt(px) - w * (0.85 + 0.25 * nz(px / 90))]); B.push([px, yAt(px) + w * (0.95 + 0.25 * nz(px / 70 + 9))]); }
  return { T, B, P: [...T, ...B.slice().reverse()] };
}
export function dirtPath(x, r, x0, x1, yAt, hw, { col = '#d6c597', pal = ['#c7b688', '#e8dbb4', '#bba977', '#d9c99c'], grassEdge = GRASS, pebbleN = 1 } = {}) {
  const { T, B, P } = pathBand(x0, x1, yAt, hw);
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < (x1 - x0) * 1.2; i++) { const px = x0 + r() * (x1 - x0), w = hw(px), py = yAt(px) + (r() - 0.5) * 2.2 * w, k = w / 28; x.fillStyle = pick(r, pal); blob(x, px, py, (2 + r() * 6) * k, (1 + r() * 1.6) * k, 0, r, 6); }
  // two faint ruts worn by feet
  for (const off of [-0.35, 0.3]) { x.strokeStyle = 'rgba(150,126,84,.28)'; x.lineWidth = 5; x.beginPath(); for (let px = x0; px <= x1; px += 20) { const y = yAt(px) + off * hw(px); px === x0 ? x.moveTo(px, y) : x.lineTo(px, y); } x.stroke(); }
  for (let i = 0; i < (x1 - x0) / 30 * pebbleN; i++) { const px = x0 + r() * (x1 - x0), w = hw(px), py = yAt(px) + (r() - 0.5) * 1.8 * w, s = w / 28; x.fillStyle = 'rgba(60,50,40,.3)'; blob(x, px + 1, py + 1, 3 * s, 1.6 * s, 0, r, 6); x.fillStyle = pick(r, ['#b5ad98', '#9d9584', '#cfc6ae']); blob(x, px, py, 3 * s, 1.8 * s, 0, r, 6); }
  x.restore();
  // grass creeping over both edges
  for (const E of [T, B]) for (let i = 0; i < E.length; i++) { if (r() < 0.35) continue; const [px, py] = E[i], s = hw(px) / 28; x.fillStyle = pick(r, grassEdge); blob(x, px + (r() - 0.5) * 12, py + (r() - 0.5) * 5, (4 + r() * 8) * s, (1.5 + r() * 2) * s, 0, r, 6); }
  return P;
}

// ───────────── trees ─────────────
// A forest edge standing on y = base(x) with crown tops near top(x): a shaded interior with dim trunks,
// overlapping crowns (back row darker) whose union makes one lumpy canopy line, then an understory.
export function treeline(x, r, x0, x1, base, top, { pal = ['#3f6447', '#4a704e', '#5a8058', '#76986a', '#9fb684'], interior = '#34503f', trunkCol = '#4f4a3e', light = LEFT, step = [90, 170], crownW = [260, 420], under = ['#4f7a4c', '#5f8a56', '#76a062', '#a8c088'], haze = null, trunkW = [18, 34], density = 0.6, depth = 0.62 } = {}) {
  const C = [];
  for (let px = x0 - 100; px < x1 + 100; px += step[0] + r() * (step[1] - step[0])) C.push({ x: px, t: top(px) + (r() - 0.5) * 50, w: crownW[0] + r() * (crownW[1] - crownW[0]), tw: trunkW[0] + r() * (trunkW[1] - trunkW[0]), back: r() < 0.5 });
  // interior shade between the crowns and the ground
  const I = []; for (let px = x0; px <= x1; px += 20) I.push([px, lerp(top(px), base(px), 0.4)]);
  for (let px = x1; px >= x0; px -= 20) I.push([px, base(px) + 60]);
  x.fillStyle = interior; path(x, I); x.fill();
  x.save(); path(x, I); x.clip();
  for (let px = x0; px < x1; px += 14 + r() * 30) { const b = base(px), h = (b - top(px)) * (0.4 + r() * 0.3); x.fillStyle = pick(r, ['rgba(20,34,28,.35)', 'rgba(90,110,90,.22)', 'rgba(60,80,64,.3)']); x.fillRect(px, b - h, 3 + r() * 9, h + 60); }
  x.restore();
  const dark = [pal[0], pal[0], pal[1], pal[2], pal[3]];
  for (const c of C.filter(c => c.back)) { const b = base(c.x), h = (b - c.t) * depth; crown(x, r, c.x, c.t + h * 0.5, c.w, h, dark, { light, lobes: 5, density }); }
  for (const c of C) if (r() < 0.6) { const b = base(c.x), h = (b - c.t) * depth; paintTrunk(x, r, c.x, c.tw, c.t + h * 0.8, b + 4, { col: trunkCol, light, inkW: 0, roots: false, shade: 0.35 }); }
  for (const c of C.filter(c => !c.back)) { const b = base(c.x), h = (b - c.t) * depth * 0.92; crown(x, r, c.x, c.t + h * 0.52, c.w * 0.9, h, pal, { light, lobes: 6, density }); }
  if (haze) { const yb = Math.max(...C.map(c => base(c.x))), g = x.createLinearGradient(0, yb - 260, 0, yb); g.addColorStop(0, `rgba(${haze},0)`); g.addColorStop(1, `rgba(${haze},.5)`); x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(x0 - 300, yb - 260, x1 - x0 + 600, 400); x.restore(); }
  for (let px = x0 - 100; px < x1 + 100; px += 30 + r() * 70) { const w = 90 + r() * 160, h = 30 + r() * 50 * (w / 200); clump(x, px, base(px) - h * 0.3, w, h, under, Math.round(w / 6), r, { size: 0.12, light }); }
  return C;
}

// A tapering trunk following a width profile, with root buttresses flaring into the ground. Bark strokes,
// a lit band along the lit edge and a lavender cel shadow band along the other edge both follow the taper.
export function paintTrunk(x, r, tx, w, top, base, { col = BARK.col, lit = BARK.lit, light = LEFT, inkW = 2.4, roots = true, lean = 0, shade = 0.55, strokes = BARK.strokes, seed = 0 } = {}) {
  const ls = light[0] < 0 ? -1 : 1, nRoots = roots === true ? 4 : roots || 0, fy = base - w * (nRoots ? 0.95 : 0.4);
  const hw = y => { let h = lerp(w * 0.4, w * 0.5, clamp((y - top) / Math.max(1, fy - top))); if (y > fy) h += ((y - fy) / (base - fy)) ** 2.2 * w * (nRoots ? 0.5 : 0.1); return h; };
  const cxAt = y => tx + lean * (1 - clamp((y - top) / (base - top)));
  const nz = noise1(Math.round(tx * 7 + top) + seed), step = Math.max(4, (base - top) / 80), Lp = [], Rp = [];
  for (let y = top; y <= base + 1e-6; y += step) { const j = (nz(y / 40) - 0.5) * w * 0.05; Lp.push([cxAt(y) - hw(y) + j, y]); Rp.push([cxAt(y) + hw(y) + j * 0.7, y]); }
  const P = [...Lp, ...Rp.slice().reverse()];
  x.fillStyle = col; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  for (let i = 0; i < w * 1.4 * Math.max(1, (base - top) / 600); i++) { const y = top + r() * (base - top), c = cxAt(y), h = hw(y); x.fillStyle = pick(r, strokes); blob(x, c - h * 0.8 + r() * h * 1.6, y, 1 + r() * 2.2, 8 + r() * 40, (r() - 0.5) * 0.05, r, 6); }
  const band = (k0, k1, fill, op = 'source-over', a = 1) => { const A = [], B = []; for (let y = top - 10; y <= base + 6; y += step) { const c = cxAt(y), h = hw(y), t = (nz(y / 30 + 5) - 0.5) * w * 0.05; A.push([c + ls * h * k0 + t, y]); B.push([c + ls * h * k1 + t, y]); } x.globalCompositeOperation = op; x.globalAlpha = a; x.fillStyle = fill; path(x, [...A, ...B.reverse()]); x.fill(); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; };
  band(0.95, 0.62, lit);
  if (shade) band(-0.08, -1.3, SHADE, 'multiply', shade);
  x.restore();
  paintRoots(x, r, cxAt, hw, base, w, { n: nRoots, col, lit, shade, ls, inkW });
  if (inkW) { ink(x, Lp, inkW, { closed: false, seed: Math.round(tx) + 7, taper: false }); ink(x, Rp, inkW * 1.25, { closed: false, seed: Math.round(tx) + 8, taper: false }); }
  return P;
}

// Root buttresses flaring from a trunk (centre cxAt(y), half-width hw(y)) into the ground at `base`.
export function paintRoots(x, r, cxAt, hw, base, w, { n = 4, col = BARK.col, lit = BARK.lit, shade = 0.55, ls = -1, inkW = 0 } = {}) {
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (a % 2) - (b % 2));
  for (const i of order) {
    const side = i % 2 ? ls : -ls, k = Math.floor(i / 2), y0 = base - w * (0.42 + 0.22 * r()) + k * w * 0.12, sx = cxAt(y0) + side * hw(y0) * (0.8 - k * 0.25);
    const ex = cxAt(base) + side * (hw(base) * (0.75 - k * 0.3) + w * (0.18 + 0.22 * r())), ey = base + 2 + k * 6 + r() * 6;
    const topC = quad([sx, y0], [sx + side * Math.abs(ex - sx) * 0.85, y0 + (ey - y0) * 0.2], [ex, ey - 1], 12);
    const botC = quad([ex, ey + 1], [lerp(ex, sx, 0.5), ey + 3], [sx - side * w * 0.25, ey + 2], 8);
    const R = [...topC, ...botC];
    x.fillStyle = col; path(x, R); x.fill();
    x.save(); path(x, R); x.clip();
    for (let j = 0; j < 6; j++) { x.fillStyle = 'rgba(46,34,28,.35)'; blob(x, lerp(sx, ex, r()), lerp(y0, ey, r()), 6 + r() * 12, 1 + r() * 1.5, Math.atan2(ey - y0, ex - sx), r, 6); }
    if (shade && side === -ls) { x.globalCompositeOperation = 'multiply'; x.globalAlpha = shade; x.fillStyle = SHADE; x.fillRect(Math.min(sx, ex) - 20, y0 - w, Math.abs(ex - sx) + 40, w * 2); }
    else { x.strokeStyle = lit; x.lineWidth = Math.max(2, w * 0.05); x.beginPath(); topC.slice(1, -3).forEach(([a, b], q) => (q ? x.lineTo(a, b + 3) : x.moveTo(a, b + 3))); x.stroke(); }
    x.restore();
    if (inkW) ink(x, topC, inkW * 0.8, { closed: false, seed: Math.round(sx) + i, taper: true });
  }
}

// A spray of leaves along the outer part of a branch (u from `from` to the tip), with a few twigs.
export function leafSpray(x, r, b, { from = 0.55, pal = ['#2f5a36', '#3d6d3d', '#4f8344', '#6c9c4c', '#9cbb5e'], light = LEFT, size = 1 } = {}) {
  const P = b.pts, n = P.length - 1, at = u => { const f = u * n, i = Math.min(n - 1, Math.floor(f)), k = f - i; return [lerp(P[i][0], P[i + 1][0], k), lerp(P[i][1], P[i + 1][1], k)]; };
  for (let i = 0; i < 6; i++) { const u = from + r() * (1 - from), [px, py] = at(u), a = -Math.PI / 2 + (r() - 0.5) * 2.2, L = (26 + r() * 30) * size; ink(x, quad([px, py], [px + Math.cos(a) * L * 0.5, py + Math.sin(a) * L * 0.6], [px + Math.cos(a) * L, py + Math.sin(a) * L], 6), 3, { closed: false, color: '#4e3c2e', seed: Math.round(px + i) }); }
  const nc = 3 + Math.floor(r() * 2);
  for (let i = 0; i < nc; i++) { const u = from + ((i + 0.25 + r() * 0.5) / nc) * (1 - from), [px, py] = at(u), s = (40 + 50 * u) * size * (0.7 + r() * 0.7), up = i % 2 ? 0.55 : 0.05 - r() * 0.25; crown(x, r, px + (r() - 0.4) * s * 0.3, py - s * up, s * (1 + r() * 0.5), s * (0.8 + r() * 0.4), pal, { light, lobes: 4, density: 0.9 }); }
  { const [px, py] = at(1); crown(x, r, px + 10 * size, py - 16 * size, 70 * size, 60 * size, pal, { light, lobes: 3, density: 0.9 }); }
}

// The crown of a big tree: lobes painted into a temporary canvas, cel-shaded as a whole, then laid down.
export function canopy(x, r, lobes, { pal = LEAVES, light = LEFT, holes = null, density = 0.9, shade = 0.5 } = {}) {
  const c = x.canvas, [t, tx] = canvas(c.width, c.height);
  tx.setTransform(x.getTransform());
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [cx, cy, w, h] of lobes) { crown(tx, r, cx, cy, w, h, pal, { light, lobes: 6, density, holes }); x0 = Math.min(x0, cx - w / 2); x1 = Math.max(x1, cx + w / 2); y0 = Math.min(y0, cy - h / 2); y1 = Math.max(y1, cy + h / 2); }
  if (shade) celShadeSprite(tx, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.56, (y1 - y0) * 0.56, { light, amount: shade, shift: 0.32 });
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(t, 0, 0); x.restore();
}

// A big tree prop: roots, trunk, hollow, branches, canopy. T = { x, base, w, top, lean, canopy: [[cx,cy,w,h]…],
// hollow: { cx, cy, rx, ry }, branches: [{ pts, w0, w1 }], pal, bark, light, back: [[cx,cy,w,h]…] (lobes behind the trunk) }
export function bigTree(x, r, T) {
  const light = T.light || LEFT, B = { ...BARK, ...(T.bark || {}) };
  if (T.back) canopy(x, r, T.back, { pal: [T.pal?.[0] || LEAVES[0], ...(T.pal || LEAVES).slice(0, -2)], light, shade: 0.35 });
  const P = paintTrunk(x, r, T.x, T.w, T.top, T.base, { col: B.col, lit: B.lit, light, lean: T.lean || 0, inkW: 0, roots: T.roots ?? 4 });
  if (T.hollow) hollow(x, r, T.hollow);
  for (const b of T.branches || []) { paintBranch(x, b, { col: B.col, dark: B.dark, lit: B.lit, inkW: 2 }); leafSpray(x, r, b, { light, from: b.leaves ?? 0.6 }); }
  if (T.canopy) canopy(x, r, T.canopy, { pal: T.pal || LEAVES, light, holes: T.holes || null });
  for (let i = 0; i < 7; i++) tuft(x, r, T.x + (i / 6 - 0.5) * T.w * 2.2, T.base + 6 + r() * 8, T.w * 0.4, 22 + r() * 18, { n: 9 });
  return P;
}

// A dark hollow in a trunk with a lit lower lip.
export function hollow(x, r, H) {
  x.fillStyle = '#3a2a20'; path(x, ell(H.cx, H.cy, H.rx + 7, H.ry + 7, 51, 1.6)); x.fill();
  x.fillStyle = '#140d0b'; path(x, ell(H.cx, H.cy, H.rx, H.ry, 52, 1)); x.fill();
  x.strokeStyle = 'rgba(214,180,128,.55)'; x.lineWidth = 4; x.beginPath(); x.ellipse(H.cx - 2, H.cy + 1, H.rx + 3.5, H.ry + 3.5, 0, Math.PI * 0.25, Math.PI * 0.85); x.stroke();
  ink(x, ell(H.cx, H.cy, H.rx + 7, H.ry + 7, 51, 1.6), 2, { seed: 53 });
  ink(x, ell(H.cx, H.cy, H.rx, H.ry, 52, 1), 1.4, { seed: 54 });
}
export const hollowClip = H => ell(H.cx, H.cy, H.rx, H.ry, 52, 1);

// A broadleaf tree for mid-ground rows (no ink, lit from one side).
export function smallTree(x, r, tx, base, w, h, { pal = ['#3e6448', '#4a7050', '#5c845a', '#7a9e68', '#a3bc84', '#c4d29c'], light = LEFT, trunkCol = '#5e4a3c', inkW = 0 } = {}) {
  paintTrunk(x, r, tx, w * 0.08, base - h * 0.55, base, { col: trunkCol, light, inkW, roots: false, shade: 0.35 });
  crown(x, r, tx, base - h * 0.68, w, h * 0.6, pal, { light, lobes: 5 });
}

// A bush sitting on the ground.
export function bush(x, r, cx, base, w, h, { pal = ['#2f5a36', '#3d6d3d', '#4f8344', '#6c9c4c', '#9cbb5e'], light = LEFT, berries = null } = {}) {
  crown(x, r, cx, base - h * 0.48, w, h * 0.95, pal, { light, lobes: 4 });
  if (berries) for (let i = 0; i < w / 6; i++) { x.fillStyle = berries; x.beginPath(); x.arc(cx + (r() - 0.5) * w * 0.8, base - h * (0.2 + r() * 0.6), 2.4, 0, 7); x.fill(); }
}

// ───────────── stumps, logs, stones ─────────────
// A cut stump: P = { cx, top, rx, ry, base }. The top ellipse is the standing surface.
export function stump(x, r, P, { light = LEFT, bark = BARK } = {}) {
  const { cx, top, rx, ry, base } = P;
  paintRoots(x, r, () => cx, () => rx * 0.95, base + 2, rx * 0.7, { n: 3, col: bark.col, lit: bark.lit, ls: light[0] < 0 ? -1 : 1 });
  const side = rpoly([[cx - rx, top], [cx + rx, top], [cx + rx + 12, base - 4], [cx + rx + 22, base + 4], [cx - rx - 24, base + 4], [cx - rx - 12, base - 4]], 9, { seed: 53, jit: 1.2 });
  x.fillStyle = bark.col; path(x, side); x.fill();
  x.save(); path(x, side); x.clip();
  for (let i = 0; i < 40; i++) { x.fillStyle = pick(r, bark.strokes); blob(x, cx - rx + r() * rx * 2, top + r() * (base - top), 1.4 + r() * 1.6, 8 + r() * 22, 0, r, 6); }
  x.fillStyle = bark.lit; x.fillRect(cx - rx * 0.86, top, rx * 0.16, base - top);
  x.restore();
  celShade(x, side, { light: [light[0], -0.1], amount: 0.55, bias: -0.15, seed: 55, wob: 0.02 });
  ink(x, side, 2.4, { seed: 56 });
  const E = ell(cx, top, rx, ry, 54, 0.8);
  x.fillStyle = '#d2b07e'; path(x, E); x.fill();
  x.save(); path(x, E); x.clip();
  for (const k of [0.82, 0.62, 0.42, 0.22]) { x.strokeStyle = 'rgba(132,96,62,.55)'; x.lineWidth = 1.6; x.beginPath(); x.ellipse(cx + 3, top + 0.5, rx * k, ry * k, 0, 0, 7); x.stroke(); }
  x.strokeStyle = 'rgba(96,70,46,.6)'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(cx + 4, top); x.lineTo(cx + rx * 0.7, top - ry * 0.3); x.stroke();
  x.fillStyle = 'rgba(255,240,200,.25)'; x.beginPath(); x.ellipse(cx - rx * 0.3, top - ry * 0.3, rx * 0.45, ry * 0.4, 0, 0, 7); x.fill();
  x.restore();
  x.strokeStyle = '#8a6440'; x.lineWidth = 3; path(x, E); x.stroke();
  ink(x, E, 2, { seed: 57 });
  for (let i = 0; i < 5; i++) tuft(x, r, cx + (i / 4 - 0.5) * rx * 2.4, base + 4 + r() * 6, rx * 0.4, 16 + r() * 12, { n: 8 });
  return side;
}

// A fallen log lying along x: L = { x0, x1, y (ground contact), rad }. The top line is a walkable surface.
export function log(x, r, L, { light = LEFT, bark = BARK } = {}) {
  const { x0, x1, y, rad } = L, top = y - rad * 2;
  const body = rpoly([[x0, top + 2], [x1 - rad * 0.3, top], [x1 - rad * 0.3, y], [x0 + 4, y + 2]], rad * 0.5, { seed: Math.round(x0), jit: 1.4 });
  x.fillStyle = bark.col; path(x, body); x.fill();
  x.save(); path(x, body); x.clip();
  for (let i = 0; i < (x1 - x0) / 3; i++) { x.fillStyle = pick(r, bark.strokes); blob(x, x0 + r() * (x1 - x0), top + r() * rad * 2, 10 + r() * 30, 1.2 + r() * 1.6, 0, r, 6); }
  x.fillStyle = bark.lit; x.fillRect(x0, top + rad * 0.15, x1 - x0, rad * 0.22);
  x.fillStyle = 'rgba(110,140,70,.8)'; for (let i = 0; i < (x1 - x0) / 14; i++) blob(x, x0 + r() * (x1 - x0), top + r() * rad * 0.5, 4 + r() * 9, 2 + r() * 3, 0, r, 6);
  x.restore();
  celShade(x, body, { light: [0, -1], amount: 0.5, bias: -0.1, seed: 61, wob: 0.02 });
  ink(x, body, 2.3, { seed: 62 });
  const E = ell(x1 - rad * 0.3, y - rad, rad * 0.55, rad, 63, 0.6);
  x.fillStyle = '#cfa978'; path(x, E); x.fill();
  for (const k of [0.7, 0.4]) { x.strokeStyle = 'rgba(132,96,62,.55)'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(x1 - rad * 0.3, y - rad, rad * 0.55 * k, rad * k, 0, 0, 7); x.stroke(); }
  ink(x, E, 1.8, { seed: 64 });
  for (let i = 0; i < 4; i++) mushroom(x, r, x0 + 30 + r() * (x1 - x0 - 60), y + 2, 1.2 + r() * 0.6, pick(r, ['#c94a3a', '#e6d6b0', '#d9a441']));
  tuft(x, r, x0 + 10, y + 4, 40, 14, { n: 6 }); tuft(x, r, (x0 + x1) / 2, y + 5, 60, 12, { n: 6 });
  return body;
}

// An old standing stone: S = { x, base, w, h }.
export function standingStone(x, r, S, { light = RIGHT } = {}) {
  const sy = S.base;
  const P = rpoly([[S.x - S.w / 2, sy + 6], [S.x - S.w * 0.46, sy - S.h * 0.8], [S.x - S.w * 0.2, sy - S.h], [S.x + S.w * 0.28, sy - S.h * 0.94], [S.x + S.w * 0.5, sy - S.h * 0.6], [S.x + S.w * 0.5, sy + 6]], 18, { seed: 61, jit: 2 });
  x.fillStyle = '#a49e90'; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  x.fillStyle = '#cfc7b0'; x.fillRect(light[0] > 0 ? S.x + S.w * 0.26 : S.x - S.w * 0.5, sy - S.h, S.w * 0.24, S.h + 10);
  for (let i = 0; i < 40; i++) { x.fillStyle = pick(r, ['rgba(180,190,110,.7)', 'rgba(220,200,120,.6)', 'rgba(120,130,80,.6)']); blob(x, S.x - S.w / 2 + r() * S.w, sy - r() * S.h, 3 + r() * 8, 2 + r() * 5, r(), r, 6); }
  ink(x, quad([S.x - 10, sy - S.h * 0.9], [S.x + 4, sy - S.h * 0.6], [S.x - 6, sy - S.h * 0.3], 12), 1.6, { closed: false, color: 'rgba(60,55,50,.6)', seed: 62 });
  x.restore();
  celShade(x, P, { light, amount: 0.6, bias: -0.18, seed: 63, wob: 0.02 });
  ink(x, P, 2.6, { seed: 64 });
  tuft(x, r, S.x - S.w * 0.4, sy + 8, S.w * 0.6, 18, { n: 10 }); tuft(x, r, S.x + S.w * 0.35, sy + 9, S.w * 0.5, 16, { n: 8 });
  return P;
}
// The top surface of a standing stone at x (for perched birds).
export function stoneTop(S, x) { const a = S.x - S.w * 0.2, b = S.x + S.w * 0.28; return S.base - S.h + (clamp((x - a) / (b - a), 0, 1)) * S.h * 0.06; }

// A stepping stone half sunk in water: st = { x, top, rx, ry }. The top ellipse is the standing surface.
export function steppingStone(x, r, st, { light = LEFT } = {}) {
  const { x: cx, top, rx, ry } = st, h = ry * 3.2, base = top + ry * 1.6;
  const P = rpoly([[cx - rx * 1.06, base], [cx - rx * 1.02, top + ry * 0.2], [cx - rx * 0.6, top - ry * 0.85], [cx + rx * 0.45, top - ry * 0.95], [cx + rx * 0.98, top + ry * 0.1], [cx + rx * 1.06, base]], ry * 0.9, { seed: Math.round(cx), jit: 1 });
  x.fillStyle = 'rgba(30,60,70,.35)'; x.beginPath(); x.ellipse(cx + 4, base, rx * 1.2, ry * 0.7, 0, 0, 7); x.fill();
  x.fillStyle = '#9b9888'; path(x, P); x.fill();
  x.save(); path(x, P); x.clip();
  x.fillStyle = '#c4bfaa'; path(x, ell(cx - rx * 0.08, top - ry * 0.1, rx * 0.92, ry * 0.9, Math.round(cx) + 3, 1)); x.fill();
  x.fillStyle = '#d8d2bc'; blob(x, cx - rx * 0.35, top - ry * 0.35, rx * 0.4, ry * 0.4, 0, r, 8);
  x.fillStyle = 'rgba(110,140,70,.85)'; for (let i = 0; i < 5; i++) blob(x, cx - rx * 0.7 + r() * rx * 1.4, top - ry * 0.3 + r() * ry * 0.9, 3 + r() * 5, 1.5 + r() * 2, 0, r, 6);
  x.fillStyle = 'rgba(40,62,64,.5)'; x.fillRect(cx - rx * 1.3, base - ry * 0.7, rx * 2.6, ry * 2);
  x.restore();
  celShade(x, P, { light, amount: 0.5, bias: -0.12, seed: Math.round(cx) + 1, wob: 0.02 });
  ink(x, P, 2.1, { seed: Math.round(cx) + 2 });
  x.strokeStyle = 'rgba(240,250,252,.85)'; x.lineWidth = 2.2; x.beginPath(); x.ellipse(cx, base - 1, rx * 1.14, ry * 0.5, 0, 0.15, Math.PI - 0.15); x.stroke();
  x.strokeStyle = 'rgba(240,250,252,.45)'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(cx + 2, base + 3, rx * 1.35, ry * 0.75, 0, 0.3, Math.PI - 0.3); x.stroke();
  return P;
}

// A boulder: rock with ink and cel shadow (and its top surface y at cx is cy − h).
export function boulder(x, r, cx, cy, w, h, { light = LEFT } = {}) {
  return rock(x, r, cx, cy, w, h, { inkW: 2.2, shade: 0.55, light, col: '#a6a294', lit: '#cdc8b4' });
}

// A wooden signpost with one or two arrow boards.
export function signpost(x, r, px, base, { h = 150, light = LEFT, boards = [[1, -0.78], [-1, -0.6]], col = '#8a6a48' } = {}) {
  const w = 12, P = rpoly([[px - w / 2, base - h], [px + w / 2, base - h], [px + w / 2 + 1, base + 2], [px - w / 2 - 1, base + 2]], 3, { seed: Math.round(px), jit: 0.8 });
  x.fillStyle = col; path(x, P); x.fill(); celShade(x, P, { light: [light[0], 0], amount: 0.5, bias: -0.1, seed: 3 }); ink(x, P, 2, { seed: 4 });
  for (const [dir, k] of boards) {
    const by = base + h * k, bw = 78, bh = 22, x0 = px - (dir > 0 ? 6 : bw - 6), x1 = x0 + bw;
    const B = rpoly(dir > 0 ? [[x0, by - bh / 2], [x1 - 10, by - bh / 2], [x1 + 4, by], [x1 - 10, by + bh / 2], [x0, by + bh / 2]] : [[x1, by - bh / 2], [x0 + 10, by - bh / 2], [x0 - 4, by], [x0 + 10, by + bh / 2], [x1, by + bh / 2]], 3, { seed: Math.round(by), jit: 0.6 });
    x.fillStyle = '#b48e62'; path(x, B); x.fill(); celShade(x, B, { light: [0, -1], amount: 0.4, bias: -0.25, seed: 5 }); ink(x, B, 1.8, { seed: Math.round(by) + 1 });
    x.strokeStyle = 'rgba(70,50,34,.55)'; x.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const yy = by - 4 + i * 4; x.beginPath(); x.moveTo(x0 + 12, yy); x.lineTo(x0 + 12 + 20 + r() * 30, yy); x.stroke(); }
  }
  tuft(x, r, px, base + 5, 40, 22, { n: 10 });
}

// A row of rounded far hills on y = yAt(x) with small tree clumps, all in hazy colours.
export function farHills(x, r, x0, x1, yAt, { pal, trees = null, every = [60, 220], light = LEFT, size = [18, 46] } = {}) {
  const pts = [[x0, 4000]]; for (let px = x0; px <= x1; px += 12) pts.push([px, yAt(px)]); pts.push([x1, 4000]);
  x.fillStyle = pal[0]; path(x, pts); x.fill();
  x.save(); path(x, pts); x.clip();
  for (let i = 0; i < (x1 - x0) / 3; i++) { const px = x0 + r() * (x1 - x0), py = yAt(px) + 4 + Math.pow(r(), 1.5) * 220; x.fillStyle = pick(r, pal); blob(x, px, py, 12 + r() * 36, 2.5 + r() * 5, 0, r, 6); }
  x.restore();
  if (trees) for (let px = x0; px < x1; px += every[0] + r() * (every[1] - every[0])) { const h = size[0] + r() * (size[1] - size[0]); clump(x, px, yAt(px) - h * 0.35, h * 0.9, h, trees, 18, r, { size: 0.18, light }); }
}

// A canopy ceiling across [x0, x1] from far above down to y = bottom(x): overlapping crowns, then leaf gaps
// cut through (destination-out) so whatever is behind — the sky — shows through them.
export function canopyBand(x, r, x0, x1, top, bottom, { pal, light = LEFT, gaps = 0.5, step = [140, 220], size = [380, 620], density = 0.5 } = {}) {
  for (let px = x0 - 200; px < x1 + 200; px += step[0] + r() * (step[1] - step[0])) {
    const b = bottom(px), w = size[0] + r() * (size[1] - size[0]), h = Math.max(200, (b - top) * 0.6);
    crown(x, r, px, b - h * 0.45, w, h, pal, { light, lobes: 6, density });
  }
  x.fillStyle = pal[1]; x.fillRect(x0 - 300, top - 400, x1 - x0 + 600, 400 + Math.max(0, Math.min(bottom(x0), bottom(x1)) - top - 340));
  if (gaps) { x.save(); x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < ((x1 - x0) / 60) * gaps; i++) { const px = x0 + r() * (x1 - x0), b = bottom(px), py = lerp(top, b - 120, Math.pow(r(), 0.7)); blob(x, px, py, 8 + r() * 26, 5 + r() * 16, r() * 3, r, 7); } x.restore(); }
}

// Soft diagonal shafts of light from (ox, oy) — paint into a layer with 'screen' or 'soft-light'.
export function lightShafts(x, r, ox, oy, n, { len = 1800, col = '255,244,206', a = 0.18, spread = 0.5, dir = 1.9 } = {}) {
  x.save(); x.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const ang = dir + (r() - 0.5) * spread, w = 20 + r() * 70, sx = ox + (r() - 0.5) * 900, ex = sx + Math.cos(ang) * len, ey = oy + Math.sin(ang) * len;
    const g = x.createLinearGradient(sx, oy, ex, ey); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.7, `rgba(${col},${a * 0.5})`); g.addColorStop(1, `rgba(${col},0)`);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    x.fillStyle = g; x.beginPath(); x.moveTo(sx - nx * w * 0.3, oy - ny * w * 0.3); x.lineTo(sx + nx * w * 0.3, oy + ny * w * 0.3); x.lineTo(ex + nx * w, ey + ny * w); x.lineTo(ex - nx * w, ey - ny * w); x.closePath(); x.fill();
  }
  x.restore();
}
