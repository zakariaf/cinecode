// The Tortoise. A domed shell tessellated into marginal, costal and vertebral scutes (each with growth rings, inked
// seams and its own cel shading), planted-foot walking, a neck that stretches and withdraws (the head hides inside
// the shell), a hooked beak that opens to talk, hooded eyes, heavy wise brows, blinks and expressions.
//
// Round 2 (DESIGN §9.2):
//  st.tilt        head pitch: + lifts the head slowly and with effort (a strained tremble at full lift), - lowers it.
//                 lookTime = 1.0 s (a tortoise is a slow looker).
//  mount(pose, params) → [ux, uy]   the riding point on the shell top (units, face = 1, scale 1, size applied).
//  params  star     opacity 0..1 of a pale five-point natural marking, off-centre on a rear costal scute
//          starCol  its colour
//          moss     colour or null: gouache moss patches on the shell top (and in the upper seams)
//          seam     scute seam colour (default: a darkened shell)
//          lids     0..1 resting upper-lid closure (an old animal's heavy lids)
//          wet      0..1 darker, glossier shell and skin, with drips falling off the rim (animated by st.t)
//          iris     iris colour (the pupil is then `eye`); null = one dark eye colour
//  pose "droop": head lowered, sad, not retracted.
import { clamp, lerp, rpoly, arcPts, wobble, rng, poly, shift } from '../core/lib.mjs';
import { cel, darken, lighten, mixHex, line, fillP, dot, eye, brow, rgba, SHADE } from '../core/style.mjs';
import { makeRig, quadFeet, tube, mixPose, plus, jumpAt, ease, frac } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 2.2;
const hash = (i, k = 0) => { let h = Math.imul(i * 374761393 + k * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1103515245) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// A smooth wobbly ellipse with enough points for close-ups.
const oval = (cx, cy, rx, ry, seed, amp = 0.15, r = 0, n = 40) => wobble(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; return [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]; }), seed, amp);
const clipTo = (T, P) => { T.beginPath(); poly(T, P); T.clip(); };
// Multiply the part of P not covered by a copy shifted `sh` units toward the light (the cel shadow), inside a clip.
function shade(T, P, sh, col = SHADE, a = 1) {
  const [dx, dy] = T.lightShift(sh);
  T.save(); T.globalCompositeOperation = 'multiply'; T.globalAlpha = a; T.fillStyle = col;
  T.beginPath(); T.rect(-80, -90, 160, 120); poly(T, shift(P, dx, dy)); T.fill('evenodd'); T.restore();
}
// Fill a shape, run `inner` inside its clip (extra paint that should be shaded with it), then shade and ink it.
function form(T, P, col, { sh = SH, w = 1.1, seed = 1, inner = null } = {}) {
  T.save(); clipTo(T, P);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  T.fillStyle = col; T.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  if (inner) inner();
  if (sh) shade(T, P, sh);
  T.restore();
  if (w > 0) line(T, [...P, P[0]], w, { seed, taper: false });
}

// Pose: shell offset by (down +), tilt br; neck angle na (0 forward, + up), neck length nl (0 withdrawn .. 1.4),
// head tilt hr; feet f1/f2 (near/far fore), h1/h2 (near/far hind) in ground units; lt leg tuck 0..1; tail ta.
const D = { by: 0, br: 0, na: 0.1, nl: 1, hr: 0, lt: 0, ta: 0, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const FEET = (f1, f2, h1, h2, y = 0) => ({ f1x: f1, f1y: y, f2x: f2, f2y: y, h1x: h1, h1y: y, h2x: h2, h2y: y });
// shell frame → ground frame
const shellM = p => q => { const r = rot([q[0], q[1] + 14], p.br); return [r[0], r[1] - 14 + p.by]; };
const roots = p => { const M = shellM(p); return { f1: M([22, -13]), f2: M([28, -14]), h1: M([-20, -12]), h2: M([-14, -13]), neck: M([29, -17]), tail: M([-37, -13]) }; };
export const POSES = {
  stand: P0({ ...FEET(25, 31, -21, -15) }),
  alert: P0({ by: -1, br: -0.06, na: 0.75, nl: 1.3, hr: -0.35, ...FEET(25, 31, -21, -15), lid: 0 }),
  stretch: P0({ na: 0.05, nl: 1.45, hr: 0.05, ...FEET(25, 31, -21, -15) }),
  sit: P0({ by: 6.5, na: 0.05, nl: 0.8, hr: 0.15, ...FEET(34, 38, -30, -24), lt: 0.2 }),
  sleep: P0({ by: 8, na: -0.1, nl: 0.15, hr: 0.25, lt: 1, ...FEET(24, 28, -19, -13), lid: 1 }),
  hide: P0({ by: 8, na: 0, nl: 0.05, hr: 0, lt: 1, ...FEET(24, 28, -19, -13) }),
  // sad, not retracted: the shell sags, the neck hangs forward and down, the head bows, the lids drop
  droop: P0({ by: 2.2, br: 0.035, na: -0.42, nl: 0.92, hr: 0.5, ...FEET(26, 31, -21, -15), lid: 0.3 }),
};
POSES.rest = POSES.sit;

const G = { walk: { stride: 22, speed: 15 }, run: { stride: 30, speed: 34 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).f1, f2: ph => roots(body(ph)).f2, h1: ph => roots(body(ph)).h1, h2: ph => roots(body(ph)).h2 });
function walkBody(ph) {
  const p = { ...POSES.stand };
  p.by = -0.6 * Math.abs(Math.sin(Math.PI * 2 * ph)); p.br = 0.025 * Math.sin(Math.PI * 2 * ph);
  p.na = 0.12 + 0.05 * Math.sin(Math.PI * 4 * ph + 0.8); p.nl = 1.05 + 0.06 * Math.sin(Math.PI * 2 * ph); p.hr = -0.03 * Math.sin(Math.PI * 4 * ph + 0.8);
  return p;
}
function walk(ph) {
  return quadFeet(walkBody(ph), ph, { h1: { off: 0, duty: 0.76, x0: -21, lift: 4 }, f1: { off: 0.22, duty: 0.76, x0: 26, lift: 4.5 }, h2: { off: 0.5, duty: 0.76, x0: -15, lift: 4 }, f2: { off: 0.72, duty: 0.76, x0: 32, lift: 4.5 } }, G.walk.stride, rootsAt(walkBody));
}
function runBody(ph) {
  const p = { ...POSES.stretch };
  p.by = -1 - 1 * Math.abs(Math.sin(Math.PI * 2 * ph)); p.br = -0.04 + 0.04 * Math.sin(Math.PI * 2 * ph);
  p.na = 0.0 + 0.06 * Math.sin(Math.PI * 4 * ph); p.nl = 1.35; p.hr = 0.08;
  return p;
}
function run(ph) {
  return quadFeet(runBody(ph), ph, { h1: { off: 0, duty: 0.6, x0: -21, lift: 6 }, f1: { off: 0.5, duty: 0.6, x0: 26, lift: 6.5 }, h2: { off: 0.5, duty: 0.6, x0: -15, lift: 6 }, f2: { off: 0.0, duty: 0.6, x0: 32, lift: 6.5 } }, G.run.stride, rootsAt(runBody));
}

// Head pitch (st.tilt). Up: the neck stretches and climbs, the head tips back, and near full lift it trembles with
// the effort. Down: the neck lowers and the head bows. A withdrawn head can't pitch.
function tilted(p, u, t) {
  const k = clamp((p.nl - 0.15) / 0.5);
  if (!u || k <= 0) return p;
  if (u > 0) {
    const q = { ...p }, a = u * k, e = a * a * a;
    q.na = lerp(p.na, Math.max(p.na, 0.66), a); q.nl = lerp(p.nl, Math.max(p.nl, 1.24), a);
    q.hr = lerp(p.hr, -0.62, a) + 0.03 * e * (0.6 * Math.sin(t * 19.1) + 0.4 * Math.sin(t * 29.3 + 1));
    q.na += 0.015 * e * Math.sin(t * 13.7 + 0.4);
    q.mo = Math.max(p.mo || 0, 0.12 * e);                                        // the effort parts the beak a little
    return q;
  }
  // down: as far as the ground allows (a sitting tortoise's chin is already low)
  const down = a => ({ ...p, na: lerp(p.na, Math.min(p.na, -0.3), a), hr: lerp(p.hr, 0.45, a), nl: lerp(p.nl, Math.max(p.nl, 0.95), a) });
  let a = -u * k;
  while (a > 0.02 && headLow(down(a)) > -0.9) a -= 0.05;
  return a > 0.02 ? down(a) : p;
}
// lowest point of the head (ground units), for keeping a lowered chin off the ground
function headLow(p) {
  const n = roots(p).neck, L = 22 * p.nl, hx = n[0] + Math.cos(p.na) * L + 5, hy = n[1] - Math.sin(p.na) * L - 4;
  return Math.max(...[[3, 7.7], [-5, 8.2], [10.3, 5.3], [12.7, 3.9]].map(([x, y]) => hy + x * Math.sin(p.hr) + y * Math.cos(p.hr))) + 0.6;
}
// ── shell geometry (shell frame, before by/br; built once) ──
const SHELL = rpoly([...arcPts(0, -20, 38, 30, Math.PI, Math.PI * 2, 3), [38, -14], [-38, -12]], 6, { seed: 107, jit: 0.8, step: 4 });
// y of the drawn outline's top at x (shell frame)
function shellTop(x) {
  let y = Infinity;
  for (let i = 0; i < SHELL.length; i++) {
    const a = SHELL[i], b = SHELL[(i + 1) % SHELL.length];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const u = (x - a[0]) / (b[0] - a[0]); y = Math.min(y, a[1] + (b[1] - a[1]) * u); }
  }
  return y;
}
const MOUNT = [-2, shellTop(-2) + 0.5];               // just inside the ink line, a little behind the dome's crest
const YB = -16.5;                                     // dome base (the top of the rim band)
const domeTop = x => -20 - 30 * Math.sqrt(Math.max(0, 1 - (x / 38) ** 2));
const SP = (x0, v) => { const x = x0 * (1 - 0.14 * v); return [x, YB + (domeTop(x) - YB) * v]; };
const dg = d => 38 * Math.sin((d * Math.PI) / 180);
// scute rows: marginal (along the rim), costal (the big side plates), vertebral (along the top), seams staggered
const ROWS = [
  { v: [0, 0.17], xs: [-46, ...[-70, -52, -35, -18, 0, 18, 35, 52, 70].map(dg), 46], rings: [0.9] },
  { v: [0.17, 0.64], xs: [-46, dg(-47), dg(-6), dg(36), 46], rings: [1.5, 3.1] },
  { v: [0.64, 1.1], xs: [-46, dg(-66), dg(-27), dg(14), dg(52), 46], rings: [1.4, 2.9] },
];
function scutePoly(xa, xb, va, vb) {
  const P = [], n = 10, m = 6;
  for (let i = 0; i <= n; i++) P.push(SP(lerp(xa, xb, i / n), va));
  for (let i = 1; i <= m; i++) P.push(SP(xb, lerp(va, vb, i / m)));
  for (let i = n - 1; i >= 0; i--) P.push(SP(lerp(xa, xb, i / n), vb));
  for (let i = m - 1; i >= 1; i--) P.push(SP(xa, lerp(va, vb, i / m)));
  return P;
}
// inset a closed polygon by d (toward its inside), then round it (Chaikin): growth rings run parallel to the seams
function inset(P, d) {
  let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1;
  return P.map((q, i) => { const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [q[0] - (dy / l) * d * sg, q[1] + (dx / l) * d * sg]; });
}
function chaikin(P, n = 2) {
  for (let k = 0; k < n; k++) { const Q = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } P = Q; }
  return P;
}
const SCUTES = [], SEAMS = [];
ROWS.forEach((row, r) => {
  const [va, vb] = row.v;
  for (let i = 0; i + 1 < row.xs.length; i++) {
    const xa = row.xs[i], xb = row.xs[i + 1], sd = 500 + r * 20 + i;
    const xm = (Math.max(xa, -37) + Math.min(xb, 37)) / 2, c = SP(xm, va + (Math.min(vb, 1) - va) * (r === 0 ? 0.5 : 0.58));
    const P0 = scutePoly(xa, xb, va, vb), P = wobble(chaikin(P0, 1), sd, 0.3);
    const rings = row.rings.map((d, k) => wobble(chaikin(inset(P0, d), 2), sd * 7 + k, 0.25));
    SCUTES.push({ P, c, rings, row: r, i, seed: sd, tone: (hash(sd) - 0.5) * 0.1 });
    if (i > 0) SEAMS.push({ pts: Array.from({ length: 7 }, (_, k) => SP(xa, lerp(va, Math.min(vb, 1.04), k / 6))), seed: sd + 900, row: r });
  }
  if (r > 0) SEAMS.push({ pts: Array.from({ length: 33 }, (_, k) => SP(lerp(-44, 44, k / 32), va)), seed: 990 + r, row: r - 0.5 });
});
const STAR_SCUTE = SCUTES.find(s => s.row === 1 && s.i === 1);   // the rear costal
const STAR_C = [-16.2, -30.2], STAR_R = 6.6;
// The star: a pale five-point marking with uneven, slightly curved rays and ragged edges (grown, not painted).
const STAR = (() => {
  const r = rng(4242), pts = [], radii = [], rot0 = -Math.PI / 2 + 0.17, [cx, cy] = STAR_C, R = STAR_R;
  for (let k = 0; k < 5; k++) {
    const a = rot0 + (k * Math.PI * 2) / 5 + (r() - 0.5) * 0.16, L = R * (0.86 + r() * 0.18), rv = R * (0.3 + r() * 0.06), bend = (r() - 0.5) * 0.2;
    const av = a - Math.PI / 5, am = (rv + L) / 2;
    pts.push([cx + Math.cos(av) * rv, cy + Math.sin(av) * rv * 0.92]);
    pts.push([cx + Math.cos(a - 0.17 + bend) * am, cy + Math.sin(a - 0.17 + bend) * am * 0.92]);
    pts.push([cx + Math.cos(a + bend * 0.5) * L, cy + Math.sin(a + bend * 0.5) * L * 0.92]);
    pts.push([cx + Math.cos(a + 0.17 + bend) * am, cy + Math.sin(a + 0.17 + bend) * am * 0.92]);
    radii.push(R * 0.1, R * 0.04, R * 0.07, R * 0.04);
  }
  const P = rpoly(pts, radii, { seed: 4243, jit: R * 0.035, step: 0.6 });
  const halo = wobble(P.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12]), 4244, R * 0.05);
  const core = wobble(P.map(([x, y]) => [cx + (x - cx) * 0.62 - 0.2, cy + (y - cy) * 0.62 - 0.2]), 4245, R * 0.04);
  const rays = [];                                    // dry-brush streaks along each ray (pigment variation)
  for (let k = 0; k < 16; k++) { const a = rot0 + (Math.floor(k / 3) * Math.PI * 2) / 5 + (r() - 0.5) * 0.5, l0 = R * (0.1 + r() * 0.3), l1 = l0 + R * (0.25 + r() * 0.45); rays.push({ a, l0, l1, w: 0.2 + r() * 0.3, al: 0.1 + r() * 0.16 }); }
  const pits = Array.from({ length: 14 }, () => { const a = r() * Math.PI * 2, d = R * (0.1 + r() * 0.45); return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.92, 0.08 + r() * 0.12, r()]; });
  return { P, halo, core, rays, pits };
})();
// moss mats [cx, cy, rx, ry, dabs, seed] on the top of the dome; one lobe creeps down over the star's upper half
const MOSS = [[-9.5, -46.6, 13, 3.4, 44, 611], [-20.5, -42.4, 5, 3, 16, 612], [-14.2, -34.4, 4.8, 3.3, 18, 613], [-6.5, -42.6, 3, 2, 8, 614],
  [11, -47, 5, 2.4, 14, 615], [25.5, -40.8, 2.2, 1.6, 6, 616], [-27.5, -37.4, 2, 1.5, 6, 617]];
const MOSS_SEAMS = [[1, 0.08, 0.3], [1, 0.62, 0.74], [2, 0.36, 0.48]];        // [seam index among row seams, from, to]
const SCUFFS = [[-27, -26, 4, 0.3], [-6, -24, 5, -0.2], [9, -31, 3.5, 0.5], [21, -24, 4.5, -0.1], [-32, -18.4, 3, 0.1], [17, -18.6, 2.5, 0], [2, -40, 3, -0.3], [28, -30, 3, 0.6]];
const DRIPS = [[-31, 0], [-17.5, 1], [-3, 2], [13.5, 3], [29, 4]];

function look(P) {
  const w = clamp(P.wet || 0), wetten = (c, k) => (w ? mixHex(c, darken(c, k), w * 0.85) : c);
  return { w, fine: 1, skin: wetten(P.skin, 0.58), rim: wetten(P.rim, 0.6), shell: P.shell, seam: P.seam || darken(P.shell, 0.42), moss: P.moss || null, star: clamp(P.star || 0), starCol: P.starCol || '#ede6d0', claw: wetten(P.claw, 0.75) };
}

// ── drawing ──
function legDraw(T, root0, foot, col, seed, tuck, C, near) {
  const root = [root0[0], Math.min(root0[1], -7.9)];          // a low (sitting) shell: legs leave from under its rim
  const f = [lerp(foot[0], root[0], tuck * 0.6), lerp(foot[1], root[1] + 2, tuck * 0.85)];
  const sl = Math.abs(f[0] - root[0]) / (Math.hypot(f[0] - root[0], f[1] - root[1]) || 1), pc = [f[0] + 1, f[1] - Math.max(4.4, 6.2 * sl + 0.9)];
  const L = tube([root, [lerp(root[0], pc[0], 0.55) - 0.5, lerp(root[1], pc[1], 0.55)], pc], [7.2, 6.4, 6.2], seed, 0.3);
  const sc = rgba(darken(col, 0.5), near ? 0.42 : 0.28);
  form(T, L, col, { seed, inner: () => {                       // big overlapping leg scales, like an elephant's knee
    for (let k = 0; k < 8; k++) { const u = 0.22 + Math.floor(k / 3) * 0.26, sx = ((k % 3) - 1) * 3.1 + (Math.floor(k / 3) % 2) * 1.5, q = [lerp(root[0], pc[0], u) + sx, lerp(root[1], pc[1], u)];
      line(T, arcPts(q[0], q[1] - 0.5, 1.5, 1.1, 0.15, Math.PI - 0.15, 0.6), 0.4, { seed: seed + 20 + k, color: sc }); }
  } });
  const ft = oval(pc[0] + 0.5, pc[1] + 0.9, 7.2, 3.4, seed + 1, 0.2, 0, 28);
  form(T, ft, col, { seed: seed + 1, w: 1 });
  const cc = mixHex(C.claw, darken(col, 0.45), 0.55);
  for (let k = -1; k <= 1; k++) { const cx = pc[0] + 5.6 + k * 1.75, cy = pc[1] + 2.75 + Math.abs(k) * 0.15; fillP(T, [[cx - 0.9, cy - 0.7], [cx + 0.5, cy - 0.75], [cx + 1.3, cy + 0.55], [cx + 0.9, cy + 0.85], [cx - 0.7, cy + 0.45]], cc); }
}
// a water drop hanging from (x, y): r bulb radius, e elongation
function drop(T, x, y, r, e, a) {
  const by = y + r * (0.6 + e), B = oval(x, by, r, r * (0.9 + e * 0.25), 0, 0, 0, 16);
  T.save(); T.globalAlpha = a;
  fillP(T, [[x - r * 0.28, y], [x + r * 0.28, y], [x + r * 0.95, by], [x - r * 0.95, by]], 'rgba(176,200,206,.55)');
  fillP(T, B, 'rgba(176,200,206,.6)');
  line(T, B.slice(2, 10), 0.35, { seed: 7, color: 'rgba(30,46,56,.6)' });
  dot(T, x - r * 0.3, by - r * 0.35, r * 0.32, 'rgba(255,255,255,.95)');
  T.restore();
}
function drips(T, p, C, t) {
  const M = shellM(p), n = Math.ceil(C.w * DRIPS.length - 0.01);
  for (let j = 0; j < n; j++) {
    const [x, i] = DRIPS[j], Tp = 1.35 + 0.95 * hash(i, 3), u = frac(t / Tp + hash(i, 5)), at = M([x, -8.6 - 0.012 * x]), a = clamp(C.w * 1.4 - j * 0.15, 0.25, 1);
    if (u < 0.8) { const g = ease(u / 0.8); drop(T, at[0], at[1], 0.45 + 0.75 * g, 0.2 + 0.9 * g * g, a); continue; }
    const tau = (u - 0.8) * Tp, y = at[1] + 0.5 * 1900 * tau * tau, v = 1900 * tau;
    if (y < -1.1) { const len = Math.min(3.2, 0.9 + v * 0.012); T.save(); T.globalAlpha = a; fillP(T, oval(at[0], y, 0.8, len, 0, 0, 0, 12), 'rgba(176,200,206,.7)'); dot(T, at[0] - 0.25, y - len * 0.3, 0.3, 'rgba(255,255,255,.9)'); T.restore(); }
    else {                                                    // splash: a flat ring and two flecks, fading out
      const ts = tau - Math.sqrt((2 * (-1.1 - at[1])) / 1900), k = ts / 0.16;
      if (k > 0 && k < 1) { T.save(); T.globalAlpha = a * (1 - k); line(T, [[at[0] - 1.6 - 2 * k, -0.7], [at[0], -0.2], [at[0] + 1.6 + 2 * k, -0.7]], 0.4, { seed: 9 + i, color: 'rgba(220,235,240,.9)' });
        dot(T, at[0] - 1.2 - 3 * k, -0.9 - 2.2 * Math.sin(Math.PI * k), 0.35, 'rgba(220,235,240,.9)'); dot(T, at[0] + 1.4 + 3 * k, -0.9 - 1.8 * Math.sin(Math.PI * k), 0.3, 'rgba(220,235,240,.9)'); T.restore(); }
    }
  }
}
function starMark(T, C) {
  const a = C.star, col = C.starCol, [cx, cy] = STAR_C, warm = mixHex(col, '#d9b56a', 0.3);
  T.save(); clipTo(T, STAR_SCUTE.P);
  fillP(T, STAR.halo, rgba(warm, a * 0.2));                   // pigment bleeding into the keratin
  fillP(T, STAR.P, rgba(warm, a * 0.55));
  fillP(T, STAR.core, rgba(col, a * 0.4));                    // denser toward the middle, like a grown marking
  clipTo(T, STAR.P);
  if (C.fine > 0) for (const s of STAR.rays) line(T, [[cx + Math.cos(s.a) * s.l0, cy + Math.sin(s.a) * s.l0], [cx + Math.cos(s.a) * s.l1, cy + Math.sin(s.a) * s.l1]], s.w, { seed: 4300 + Math.round(s.l1 * 10), color: rgba(C.shell, s.al * C.fine) });
  if (C.fine > 0) for (const [x, y, r, k] of STAR.pits) dot(T, x, y, r, k < 0.5 ? rgba(C.shell, 0.18 * C.fine) : rgba(lighten(col, 0.6), 0.4 * a * C.fine));
  T.restore();
}
function moss(T, C) {
  const m = C.moss, dk = darken(m, 0.52), md = darken(m, 0.76), lt = lighten(m, 0.2), hi = mixHex(lighten(m, 0.42), '#e6e27a', 0.4);
  const seams = SEAMS.filter(s => s.row === 0.5 || s.row === 1.5);
  for (const [si, a, b] of MOSS_SEAMS) { const s = seams[si] || seams[0], n = s.pts.length - 1; line(T, s.pts.slice(Math.floor(a * n), Math.ceil(b * n) + 1), 1.1, { seed: 640 + si, color: rgba(md, 0.75) }); }
  // a mat of small dabs per patch: a dark bumpy base, mid-tone over it, lit dabs on the upper left, then stipple
  for (const [cx, cy, rx, ry, n, sd] of MOSS) {
    const q = rng(sd), pt = (k, ox, oy, up) => { const a = q() * Math.PI * 2, d = Math.sqrt(q()) * k, y = Math.sin(a) * d * ry; return [cx + Math.cos(a) * d * rx + ox, cy + (up ? -Math.abs(y) : y) + oy]; };
    for (let i = 0; i < n * 1.3; i++) { const [x, y] = pt(1, 0, 0), r = 0.9 + q() * 1; fillP(T, oval(x, y, r, r * 0.55, sd + i, r * 0.12, (q() - 0.5) * 0.5, 12), dk); }
    for (let i = 0; i < n * 1.2; i++) { const [x, y] = pt(0.84, -0.3, -0.3), r = 0.7 + q() * 0.85; fillP(T, oval(x, y, r, r * 0.5, sd + 50 + i, r * 0.12, (q() - 0.5) * 0.5, 12), md); }
    for (let i = 0; i < n * 0.6; i++) { const [x, y] = pt(0.72, -0.6, -0.45, true), r = 0.45 + q() * 0.6; fillP(T, oval(x, y, r, r * 0.45, sd + 100 + i, r * 0.1, -0.25, 10), m); }
    for (let i = 0; i < n * 0.25; i++) { const [x, y] = pt(0.6, -0.9, -0.6, true), r = 0.25 + q() * 0.35; fillP(T, oval(x, y, r, r * 0.45, sd + 150 + i, r * 0.08, -0.3, 8), lt); }
    for (let i = 0; i < n * 0.7; i++) { const [x, y] = pt(0.92, 0, 0), r = 0.08 + q() * 0.08, c = q() < 0.6 ? rgba(dk, 0.6 * C.fine) : rgba(hi, 0.6 * C.fine); if (C.fine > 0) dot(T, x, y, r, c); }
  }
}
function shellDraw(T, p, C, t) {
  T.save(); T.translate(0, p.by); T.translate(0, -14); T.rotate(p.br); T.translate(0, 14);
  const S = SHELL, sh = C.shell;
  T.save(); clipTo(T, S);
  T.fillStyle = C.seam; T.fillRect(-40, -52, 80, 40);
  for (const s of SCUTES) cel(T, s.P, s.tone > 0 ? lighten(sh, s.tone) : darken(sh, 1 + s.tone), SH * (s.row ? 0.55 : 0.4), 0, s.seed);
  for (const s of SCUTES) if (s.row) fillP(T, oval(s.c[0] - 0.5, s.c[1] - 0.6, 3, 2, s.seed + 3, 0.3), rgba(lighten(sh, 0.1), 0.2));   // worn areolas
  if (C.star > 0.004) starMark(T, C);
  const ringCol = rgba(darken(sh, 0.5), 0.36 * C.fine), ringLit = rgba(lighten(sh, 0.3), 0.22 * C.fine);
  if (C.fine > 0) for (const s of SCUTES) s.rings.forEach((R, k) => { line(T, [...R, R[0]], 0.42, { seed: s.seed * 3 + k, color: ringCol, taper: false }); if (!k) line(T, shift(R.slice(0, Math.floor(R.length * 0.45)), -0.35, -0.35), 0.3, { seed: s.seed * 5 + k, color: ringLit }); });
  for (const s of SEAMS) line(T, s.pts, s.row % 1 ? 1.35 : 1.15, { seed: s.seed, color: C.seam, taper: false });
  for (const [x, y, l, a] of SCUFFS) line(T, [[x, y], [x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + 0.2], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 0.5, { seed: 700 + x, color: rgba(lighten(sh, 0.45), 0.4) });
  if (C.moss) moss(T, C);
  shade(T, S, 4.6, SHADE, 0.85);                                // the dome's form shadow (lower right)
  if (C.w) { T.fillStyle = rgba('#141a18', 0.38 * C.w); T.fillRect(-40, -52, 80, 42); }
  { const [dx, dy] = T.lightShift(-1.6); T.beginPath(); T.rect(-80, -90, 160, 120); poly(T, shift(S, dx, dy)); T.fillStyle = rgba(lighten(sh, 0.45), 0.2 * (1 - 0.5 * C.w)); T.fill('evenodd'); }
  if (C.w) {                                                    // gloss: sharp highlights on the upper left of the dome and the scutes
    const g = rgba('#ffffff', 0.75 * C.w);
    line(T, arcPts(0, -20, 34.5, 26.5, Math.PI + 0.42, Math.PI + 1.12, 2), 1.5, { seed: 811, color: g });
    line(T, arcPts(0, -20, 31.5, 24, Math.PI + 0.5, Math.PI + 0.78, 2), 0.8, { seed: 812, color: rgba('#ffffff', 0.55 * C.w) });
    for (const s of SCUTES) if (s.row && s.c[0] < 30) { const [x, y] = s.c; line(T, [[x - 2.6, y - 0.6], [x - 1.2, y - 1.9], [x + 0.8, y - 2.3]], 0.55, { seed: s.seed + 5, color: rgba('#ffffff', 0.55 * C.w) }); }
  }
  T.restore();
  line(T, [...S, S[0]], 1.4, { seed: 107, taper: false });
  // the rim band under the dome: the plastron's edge
  const B = rpoly([[-40, -16], [40, -18], [37, -9], [-37, -8]], 4, { seed: 108, jit: 0.4 });
  form(T, B, C.rim, { seed: 108, inner: () => {
    for (let i = 0; i < 7; i++) line(T, [[-30 + i * 10, -16.5 + i * -0.2], [-29.5 + i * 10, -9]], 0.55, { seed: 330 + i, color: rgba(C.seam, 0.45) });
    if (C.w) line(T, [[-36, -15.6], [-10, -16.3], [20, -17]], 0.7, { seed: 820, color: rgba('#ffffff', 0.55 * C.w) });
  } });
  T.restore();
}
// Hooded tortoise eye: a soft hollow, iris and pupil, a heavy upper lid with a fold above it, a soft lower lid.
function tortoiseEye(T, x, y, F, P, C, lid) {
  const rx = 2.25, ry = 2.05, skin = C.skin, lidCol = darken(skin, 0.96), fold = rgba(darken(skin, 0.4), 0.6);
  const hollow = T.createRadialGradient(x - 0.2, y + 0.2, ry * 0.9, x - 0.2, y + 0.2, ry + 2);
  hollow.addColorStop(0, rgba(darken(skin, 0.5), 0.34)); hollow.addColorStop(1, rgba(darken(skin, 0.5), 0));
  fillP(T, oval(x - 0.2, y + 0.2, rx + 2.1, ry + 2, 141, 0, 0, 24), hollow);
  if (F.eye === 'happy') { eye(T, x, y + 0.4, rx * 0.9, ry, 'happy', P.eye, 0, 0, 0, { w: 1.2 }); return; }
  if (lid >= 0.96) {                                          // shut: the lid's edge curves down, the fold above it
    const t = F.tilt * 0.35;
    line(T, arcPts(x, y - 0.6 - t * 0, rx + 0.3, 1.5, Math.PI * 0.08 + t, Math.PI * 0.92 + t, 0.4), 1.05, { seed: 144, taper: true });
    line(T, arcPts(x - 0.1, y - 0.4, rx * 0.95, 1.6, Math.PI * 1.15, Math.PI * 1.85, 0.4), 0.5, { seed: 145, color: fold });
    return;
  }
  const E = oval(x, y, rx, ry, 142, 0.05, 0, 28), iris = P.iris || P.eye, look = [F.look * 0.55, -F.pitch * 0.75];
  T.save(); clipTo(T, E);
  fillP(T, E, P.iris ? darken(iris, 0.62) : iris);
  if (P.iris) {
    fillP(T, oval(x + look[0] * 0.6, y + look[1] * 0.6, rx * 0.86, ry * 0.86, 146, 0.04), iris);
    fillP(T, oval(x + look[0] * 0.6 + 0.1, y + look[1] * 0.6 + ry * 0.45, rx * 0.62, ry * 0.42, 147, 0.04), rgba(lighten(iris, 0.35), 0.55));
    dot(T, x + look[0], y + look[1], 1.0 * (F.pupil || 1), P.eye);
  }
  dot(T, x + look[0] + 0.75, y + look[1] - 0.75, 0.55, '#ffffff'); dot(T, x + look[0] - 0.6, y + look[1] + 0.8, 0.22, 'rgba(255,255,255,.7)');
  // upper lid down to `lid`, slanted by the expression (tilt +1 angry: front corner lower); its edge sags in the middle
  const top = y - ry - 0.2, span = 2 * ry + 0.4, yl = top + span * lid, sl = F.tilt * span * 0.22 * Math.min(1, lid * 3), yA = yl - sl, yB = yl + sl, ym = yl + 0.35 * (1 - lid);
  fillP(T, [[x - rx - 1, top - 1], [x + rx + 1, top - 1], [x + rx + 1, yB], [x, ym], [x - rx - 1, yA]], lidCol);
  fillP(T, [[x - rx - 1, yA], [x, ym], [x + rx + 1, yB], [x + rx + 1, yB + 0.6], [x, ym + 0.6], [x - rx - 1, yA + 0.6]], 'rgba(20,10,10,.28)');
  T.restore();
  const cl = q => Math.min(q, y + ry);
  line(T, [...E.slice(15), ...E.slice(0, 2)], 0.4, { seed: 148, color: rgba(darken(skin, 0.35), 0.6) });
  line(T, [[x - rx - 0.4, cl(yA)], [x - rx * 0.4, cl((yA + ym) / 2 + 0.05)], [x + rx * 0.3, cl((ym + yB) / 2 + 0.05)], [x + rx + 0.35, cl(yB)]], 1.05, { seed: 149, taper: true });
  line(T, [[x - rx * 0.95, cl(yA) - 0.85 - lid * 0.25], [x - 0.2, cl(yl) - 1.25 - lid * 0.2], [x + rx * 0.95, cl(yB) - 0.85]], 0.5, { seed: 150, color: fold });
  line(T, arcPts(x + 0.1, y + ry - 0.6, rx * 0.9, 1.2, Math.PI * 0.12, Math.PI * 0.88, 0.4), 0.42, { seed: 151, color: rgba(darken(skin, 0.45), 0.55) });
}
// head outlines (head frame: +x forward, the eye at (4.6, -2.4)); the beak's tip hooks over the lower jaw
const HEAD = rpoly([[-10, -1], [-8.2, -6.2], [-1.5, -8.7], [5.5, -7.7], [10.4, -5], [12.9, -2], [13.6, 0.6], [12.7, 3.9], [10.3, 5.3], [3, 7.7], [-5, 8.2], [-10, 5]], [3, 4, 5, 4, 3, 2, 1.4, 0.7, 2, 4, 4, 3], { seed: 113, jit: 0.18, step: 1.2 });
const UPPER = rpoly([[-10, -1], [-8.2, -6.2], [-1.5, -8.7], [5.5, -7.7], [10.4, -5], [12.9, -2], [13.6, 0.6], [12.7, 3.9], [11.2, 3.9], [8, 3.9], [1.5, 4.0], [-6, 4.6], [-10, 4]], [3, 4, 5, 4, 3, 2, 1.4, 0.7, 0.6, 1, 1, 2, 3], { seed: 113, jit: 0.18, step: 1.2 });
const JAW = rpoly([[-9, 3.6], [1.5, 3.9], [8, 3.8], [11.2, 3.7], [10.3, 5.3], [3, 7.7], [-5, 8.2], [-9.5, 5.6]], [1, 1, 1, 0.8, 2, 4, 4, 2], { seed: 118, jit: 0.18, step: 1.2 });
const THROAT = rpoly([[1.2, 4.1], [12, 3.7], [12, 10], [-11, 10], [-11, 7.2], [-5, 5.6]], [1, 1, 1, 1, 3, 4], { seed: 119, jit: 0.2, step: 1.2 });
const PLATES = [[[-6.4, -7], [-4.6, -4.6], [-0.8, -5.2], [0.2, -8.5]], [[-0.8, -5.2], [2.4, -5.9], [5.2, -7.6]], [[6.4, -7.2], [7.4, -5.4], [10.2, -4.8]], [[-9.3, -3], [-6.8, -2.6], [-4.6, -4.6]]];
function head(T, p, F, P, C, o, R) {
  const L = 22 * p.nl, a = p.na, base = R.neck, hpos = add(base, [Math.cos(a) * L, -Math.sin(a) * L]);
  const hx = hpos[0] + 5, hy = hpos[1] - 4, hr = p.hr + (p.nl < 0.5 ? 0 : -F.look * 0.1), skin = C.skin;
  if (p.nl > 0.12) {
    const end = add([hx, hy], rot([-6.5, 2], hr)), mid = add(base, [Math.cos(a) * L * 0.55, -Math.sin(a) * L * 0.55 + 1.5]);
    const N = tube([base, mid, end], [7.4, 6.4, 5.9], 106, 0.3);
    form(T, N, skin, { seed: 106, inner: () => {
      const d = [end[0] - base[0], end[1] - base[1]], dl = Math.hypot(...d) || 1, ux = d[0] / dl, uy = d[1] / dl, fc = rgba(darken(skin, 0.5), 0.5);
      for (let k = 0; k < 6; k++) {                          // skin folds across the neck, bunched when it is short
        const u = 0.1 + k * 0.145 * Math.min(1.1, 0.75 + p.nl * 0.25), q = [base[0] + d[0] * u, base[1] + d[1] * u], w = 6.9 - u * 1.4, bow = 1 + 0.4 * (k % 2);
        line(T, [[q[0] - uy * w, q[1] + ux * w], [q[0] - uy * w * 0.3 + ux * bow, q[1] + ux * w * 0.3 + uy * bow], [q[0] + uy * w * 0.5 + ux * 0.6, q[1] - ux * w * 0.5 + uy * 0.6]], 0.5, { seed: 300 + k, color: fc });
      }
      line(T, [[base[0] - uy * 3.6, base[1] + ux * 3.6], [end[0] - uy * 3, end[1] + ux * 3]], 0.45, { seed: 308, color: rgba(darken(skin, 0.5), 0.35) });
      fillP(T, [[base[0] - uy * 8, base[1] + ux * 8], [end[0] - uy * 7, end[1] + ux * 7], [end[0] - uy * 3.5, end[1] + ux * 3.5], [base[0] - uy * 4.2, base[1] + ux * 4.2]], rgba(lighten(skin, 0.3), 0.35));
      if (C.w) line(T, [[base[0] + uy * 5, base[1] - ux * 5], [end[0] + uy * 4, end[1] - ux * 4]], 0.7, { seed: 309, color: rgba('#ffffff', 0.5 * C.w) });
    } });
  }
  T.save(); T.translate(hx, hy - F.breath * 0.4); T.rotate(hr);
  const op = clamp(F.open), sm = F.smile, beak = mixHex(skin, '#c9b47c', 0.42), bk = darken(beak, 0.62);
  const hinge = [-2, 3.9], ja = op * 0.42, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  const skinWork = () => {
    for (const [px, py, r, k] of [[-4.5, -4.6, 2.2, 1], [-7.2, 1.2, 1.8, 2], [0.6, -6.2, 1.6, 3], [-2, 1.6, 1.4, 4], [-8, -3.6, 1.2, 5], [2.2, 1.8, 1, 6]]) fillP(T, oval(px, py, r, r * 0.7, 120 + k, r * 0.18, k, 14), rgba(darken(skin, 0.72), 0.12));
    fillP(T, oval(-5.6, 0.8, 1.9, 2.2, 131, 0.15, 0.2, 18), rgba(darken(skin, 0.86), 0.3));             // tympanum
    for (const [k, al] of [[0, 0.4], [0.8, 0.45]]) fillP(T, [[11.4 + k, -3.6], [14.5, -3.6], [14.5, 3.9], [8 + k, 3.9], [9 + k, 1.6], [10.3 + k, -1.2]], rgba(beak, al));   // horny beak, soft edged
  };
  if (op > 0.2) {
    const M = [hinge, [4, 3.9], [11.2, 3.6], jr([10.8, 4.3]), jr([3, 5])];
    fillP(T, M, '#4e2222');
    T.save(); clipTo(T, M); fillP(T, oval(...jr([4.5, 5.6]), 4.5, 1.8, 117, 0.1), '#b86a62'); T.restore();
    form(T, JAW.map(jr), lighten(skin, 0.16), { sh: SH * 0.5, w: 1, seed: 118, inner: () => fillP(T, [[7.5, 3.4], [12, 3.2], [12, 6.5], [7.5, 6.5]].map(jr), rgba(beak, 0.7)) });
    form(T, UPPER, skin, { w: 0, seed: 113, inner: skinWork });
    const cut = UPPER.findIndex(q => q[0] < 1.2 && q[1] > 3), back = UPPER.findIndex((q, i) => i > cut && q[0] < -9.2);
    line(T, [...UPPER.slice(back), ...UPPER.slice(0, cut)], 1.15, { seed: 113, taper: false });
    line(T, [[12.6, 3.7], [10.5, 3.9], [7.6, 3.9]], 0.55, { seed: 132, color: bk });
  } else {
    form(T, HEAD, skin, { w: 1.15, seed: 113, inner: () => { fillP(T, THROAT, lighten(skin, 0.16)); skinWork(); } });
    if (op > 0.03) fillP(T, [[11.6, 3.85], [8.4, 4.1], [4.2, 4.2], [3.8, 4.25 + op * 2.4], [8.2, 4.3 + op * 3.2]], '#4e2222');
    line(T, [[12.6, 3.8], [8.4, 4.05 + Math.max(0, -sm) * 0.3], [4.2, 4.15 - 0.3 * sm], [1.3, 3.7 - 1.5 * sm]], 0.85, { seed: 116 });
    if (F.round > 0.5) dot(T, 9.4, 4.7, 1.15, '#4e2222');
  }
  // head plates, the beak's edge, wrinkles at the gape and under the eye
  const pl = rgba(darken(skin, 0.42), 0.32);
  PLATES.forEach((Q, k) => line(T, Q, 0.42, { seed: 121 + k, color: pl, taper: false }));
  line(T, arcPts(-5.6, 0.8, 1.9, 2.2, -2.4, -0.7, 0.5), 0.35, { seed: 133, color: rgba(darken(skin, 0.42), 0.25) });
  line(T, [[0.6, 4.7], [-0.6, 5.9], [-1.1, 7.1]], 0.42, { seed: 124, color: pl });
  line(T, [[-8, 5.8], [-4, 6.8], [0, 6.5]], 0.42, { seed: 125, color: pl });
  fillP(T, oval(11.9, -2.3, 0.5, 0.36, 126, 0.02, -0.4, 10), rgba(darken(skin, 0.28), 0.85));          // nostril
  if (sm > 0.5) fillP(T, oval(1.6, 1.6, 2.2, 1.3, 127, 0.1, 0, 16), rgba('#e08a70', 0.16 * (sm - 0.4)));
  const lids = clamp(P.lids || 0), lb = F.eye === 'wide' ? lids * 0.4 : lids;
  const lid = clamp(lb + (1 - lb) * Math.max(F.lid, 0.06) - lb * 0.4 * Math.max(0, F.pitch) + 0.12 * Math.max(0, -F.pitch));
  tortoiseEye(T, 4.6, -2.4, F, P, C, lid);
  line(T, [[1.4, 1.1], [4.6, 1.7], [7.4, 0.7]], 0.45, { seed: 128, color: rgba(darken(skin, 0.4), 0.5) });
  line(T, [[0.2, -0.4], [-1.7, 0.6]], 0.42, { seed: 129, color: rgba(darken(skin, 0.4), 0.45) });
  brow(T, 4.4, -5.7 + lids * 0.35, 6.6, Math.min(F.browY * 0.6 + 0.15 * Math.max(0, F.pitch), 0.4), F.browT * 0.8, darken(skin, 0.45), 1.45, 115);
  if (C.w) { line(T, [[-6.5, -6.3], [-1, -8.1], [5.5, -7.2]], 0.75, { seed: 130, color: rgba('#ffffff', 0.6 * C.w) }); dot(T, 11.6, -3.3, 0.35, rgba('#ffffff', 0.7 * C.w)); }
  if (C.w > 0.2 && p.nl > 0.4) {                              // a drop gathering under the chin
    const Tp = 1.9, u = frac(o.t / Tp + 0.37), g = ease(clamp(u / 0.85));
    if (u < 0.85) drop(T, 4, 7.6, 0.35 + 0.55 * g, 0.2 + 0.7 * g * g, C.w);
    else { const tau = (u - 0.85) * Tp, y = 7.6 + 0.5 * 1900 * tau * tau; if (y < 16) { T.save(); T.globalAlpha = C.w * (1 - (y - 7.6) / 9); fillP(T, oval(4, y + 1.5, 0.7, 1.6, 0, 0, 0, 10), 'rgba(176,200,206,.7)'); T.restore(); } }
  }
  o.out.head = T.map(0, 0); o.out.mouth = T.map(6.5, 3.8 + op * 2);
  T.restore();
}
function paint(T, p0, F, o) {
  const { P, t } = o, C = look(P), p = tilted(p0, F.pitch, t), R = roots(p), kp = clamp((p0.nl - 0.15) / 0.5);
  if (kp < 1 && F.pitch) F = { ...F, pitch: F.pitch * kp };                 // a withdrawn head can't look up or down
  C.fine = clamp(((o.s || 1) * (P.size || 1) - 1.5) / 1.2);    // fine detail fades in with screen size (no pops in a push-in)
  const tuck = p.lt, far = darken(C.skin, 0.82);
  legDraw(T, R.h2, [p.h2x, p.h2y], far, 101, tuck, C, false);
  legDraw(T, R.f2, [p.f2x, p.f2y], far, 103, tuck, C, false);
  const tl = R.tail; cel(T, [[tl[0] + 2, tl[1] - 2], [tl[0] - 9, tl[1] + 2 + p.ta * 4], [tl[0] + 2, tl[1] + 5]], C.skin, SH, 1, 105);
  if (p.nl < 0.45) head(T, p, F, P, C, o, R);
  shellDraw(T, p, C, t);
  legDraw(T, R.h1, [p.h1x, p.h1y], C.skin, 109, tuck, C, true);
  legDraw(T, R.f1, [p.f1x, p.f1y], C.skin, 111, tuck, C, true);
  if (p.nl >= 0.45) head(T, p, F, P, C, o, R);
  if (C.w > 0.01) drips(T, p, C, t);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
const PARAMS = { skin: '#a7a36a', shell: '#6f8a46', rim: '#d8c58c', claw: '#e8e0c0', eye: '#2a1e16', iris: null, seam: null, moss: null, star: 0, starCol: '#ede6d0', lids: 0, wet: 0 };
export default makeRig({
  kind: 'tortoise', label: 'Tortoise',
  height: 50, headHeight: 22, width: 96, shadowW: 50,
  breathPeriod: 4.5, lookTime: 1.0,
  params: PARAMS,
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.22, 0.5, 0.72], run: [0, 0.5] },
  poses: POSES,
  gaits: { walk, run },
  gestures: {
    nod: g(1.0, (u, b = base) => plus(b, { hr: 0.25 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.18 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), na: -0.08 * Math.sin(Math.PI * u) }), [0.22, 0.5, 0.7]),
    laugh: g(1.5, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 6)); return plus(b, { na: 0.35 * e + 0.08 * k * e, hr: -0.35 * e, mo: 0.75 * e, eh: e, sm: e, by: -0.8 * k * e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 9, crouch: { by: 3, na: -0.1 }, air: { lt: 0.25, na: 0.3, hr: -0.2 } }), [0.2, 0.45, 0.6, 0.85]),
    wave: g(1.8, (u, b = base) => { const e = env(u, 0.2, 0.2), R = roots(b); return mixPose(b, { ...b, f1x: R.f1[0] + 12, f1y: R.f1[1] - 3 - 4 * Math.sin(u * Math.PI * 7), br: 0.05, na: 0.95, nl: 1.25, hr: -0.45, sm: 0.6 }, e); }, [0.25, 0.4, 0.55, 0.7]),
    hide: g(2.4, (u, b = base) => mixPose(b, POSES.hide, env(u, 0.12, 0.4)), [0.15, 0.4, 0.75, 0.9]),
    stretch: g(1.6, (u, b = base) => mixPose(b, { ...POSES.stretch, ...FEET(b.f1x, b.f2x, b.h1x, b.h2x), mo: 0.9, lid: 0.8 }, env(u, 0.3, 0.3)), [0.3, 0.5, 0.7]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  // The riding point on the shell top, in units at face 1 and scale 1 (params.size applied): it follows the shell
  // through every pose, gait phase (the walk bob) and jump.
  mount(pose, params = {}) {
    const p = { ...base, ...(pose || {}) }, k = params.size ?? PARAMS.size ?? 1, q = shellM(p)(MOUNT);
    return [q[0] * k, (q[1] - (p.lift || 0)) * k];
  },
  paint,
});
