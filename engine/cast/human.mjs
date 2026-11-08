// Human rig: a parametric storybook person (child / teen / adult / elder) in a 3/4 side view.
// (x, y) passed to draw() is the contact point: the ground under the feet, or the seat surface for
// 'sit-seat' (the feet are then planted `seatHeight` units below it, or dangle if the legs are too short).
// Poses are plain numeric objects; legs can be posed by angles or by IK foot targets (ik = 0..1),
// which is how the gaits keep the stance foot planted. Everything is deterministic.
import { clamp, lerp, smooth, easeInOut, poly, path, shift, arcPts, quad, noise1, canvas, INK } from '../core/lib.mjs';

// Same algorithms as lib.mjs wobble/ink/ell, with noise tables cached per seed (a rig draws hundreds of strokes a frame).
const NZ = new Map();
const nz = seed => { let f = NZ.get(seed); if (!f) { f = noise1(seed); NZ.set(seed, f); } return f; };
function wobble(P, seed, amp, closed = true) {
  if (!amp) return P;
  const nx = nz(seed * 2 + 1), ny = nz(seed * 2 + 2), f = 1 / 60, s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = s[s.length - 1] || 1;
  const n = (fn, x) => { const u = closed ? x / T : 0; return (1 - u) * fn(x * f) + u * fn((x - T) * f); };
  return P.map((p, i) => [p[0] + (n(nx, s[i]) - 0.5) * 2 * amp, p[1] + (n(ny, s[i]) - 0.5) * 2 * amp]);
}
function ell(cx, cy, rx, ry, seed = 0, amp = 1.5, r = 0) {
  const n = Math.max(16, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / 6)), P = [], c = Math.cos(r), sn = Math.sin(r);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; P.push([cx + x * c - y * sn, cy + x * sn + y * c]); }
  return wobble(P, seed, amp);
}
function ink(ctx, P, w, { closed = true, color = INK, seed = 1, taper = !closed } = {}) {
  const n = P.length, f = nz(seed + 101), L = [], R = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    let ww = w * (0.55 + 0.9 * f(s / 80));
    if (taper) ww *= Math.pow(Math.sin(Math.PI * clamp(i / (n - 1), 0.02, 0.98)), 0.6);
    L.push([P[i][0] + (nx * ww) / 2, P[i][1] + (ny * ww) / 2]); R.push([P[i][0] - (nx * ww) / 2, P[i][1] - (ny * ww) / 2]);
  }
  ctx.fillStyle = color; ctx.beginPath();
  if (closed) { poly(ctx, L); poly(ctx, R.reverse()); } else poly(ctx, [...L, ...R.reverse()]);
  ctx.fill();
}

// ───────────────────────── private style helpers (no import of style.mjs, by contract) ─────────────────────────
const SHADE = '#c3b8dc';
const NAMED = { red: '#c8443a', blue: '#3f6fb0', green: '#4f8a46', yellow: '#f2c94c', orange: '#e0703a', pink: '#e89ab0', purple: '#7a5a9a', brown: '#7a5236', black: '#2a2428', white: '#f4f1ea', grey: '#8a8a8e', gray: '#8a8a8e', blonde: '#e0b866', ginger: '#c0602e', navy: '#2f3f6a', teal: '#3a8a8a', cream: '#efe4c8' };
function normHex(c, fb = '#888888') {
  if (typeof c !== 'string') return fb;
  if (NAMED[c]) return NAMED[c];
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [1, 2, 3].map(i => c[i] + c[i]).join('').toLowerCase();
  return fb;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const CC = new Map(), memo = (k, fn) => { let v = CC.get(k); if (v === undefined) { v = fn(); if (CC.size > 4000) CC.clear(); CC.set(k, v); } return v; };
const darken = (h, f) => memo(`d${h}${f}`, () => toHex(rgb(h).map(v => v * f)));
const lighten = (h, f) => memo(`l${h}${f}`, () => toHex(rgb(h).map(v => v + (255 - v) * f)));
const mixC = (a, b, u) => memo(`m${a}${b}${u}`, () => { const B = rgb(b); return toHex(rgb(a).map((v, i) => lerp(v, B[i], u))); });
const rgba = (h, a) => memo(`r${h}${a}`, () => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; });

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const mid = (a, b, u = 0.5) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
const len = v => Math.hypot(v[0], v[1]);
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const down = a => [Math.sin(a), Math.cos(a)];          // unit vector at angle a from straight down (+ = forward)
const upv = a => [Math.sin(a), -Math.cos(a)];          // unit vector at angle a from straight up (+ = forward)
const angDown = v => Math.atan2(v[0], v[1]);

// Per-draw line weight and light offset. LW keeps ink fine in close-ups and legible in wide shots.
let LW = 1, SH = [-2.4, -2.4];
const ln = (ctx, P, w, o = {}) => ink(ctx, P, w * LW, o);
const stroke = (ctx, P, w, seed, color) => ink(ctx, P, w * LW, { closed: false, seed, color });
const fillP = (ctx, P, col) => { ctx.fillStyle = col; path(ctx, P); ctx.fill(); };
const dot = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, 7); ctx.fill(); };
// Cel shading: flat colour + one hard lavender multiply shadow (the shape shifted toward the light, inverted), inked.
function cel(ctx, P, col, w = 1.1, seed = 1, sh = SH) {
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-900, -900, 1800, 1800);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = SHADE;
  ctx.beginPath(); ctx.rect(-900, -900, 1800, 1800); poly(ctx, shift(P, sh[0], sh[1])); ctx.fill('evenodd');
  ctx.restore();
  if (w > 0) ln(ctx, P, w, { seed });
}
// Closed / open Catmull-Rom spline through control points.
function spline(P, n = 8, closed = true) {
  const out = [], N = P.length, m = closed ? N : N - 1;
  for (let i = 0; i < m; i++) {
    const p0 = P[closed ? (i - 1 + N) % N : Math.max(0, i - 1)], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[closed ? (i + 2) % N : Math.min(N - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3)));
    }
  }
  if (!closed) out.push(P[N - 1]);
  return out;
}
// Tapered limb outline between joints with half-widths w1, w2 (rounded caps), as one smooth closed curve.
function capsule(a, b, w1, w2, seed = 0, jit = 0.25) {
  const d = sub(b, a), L = len(d) || 1e-3, t = mul(d, 1 / L), n = [-t[1], t[0]], P = [];
  for (let i = 0; i <= 8; i++) { const q = Math.PI / 2 + (i / 8) * Math.PI; P.push(add(b, add(mul(t, -Math.cos(q) * w2 * 0.9), mul(n, Math.sin(q) * -w2)))); }
  for (let i = 0; i <= 8; i++) { const q = -Math.PI / 2 + (i / 8) * Math.PI; P.push(add(a, add(mul(t, -Math.cos(q) * w1 * 0.9), mul(n, Math.sin(q) * -w1)))); }
  return wobble(spline(P, 2), seed, jit);
}
// Two-bone IK: joint position for a chain root→target with bone lengths a, b. bend = +1 bends forward (knees), -1 back (elbows).
function ik2(root, tgt, a, b, bend = 1) {
  const d0 = sub(tgt, root), d = clamp(len(d0), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const base = Math.atan2(d0[1], d0[0]), A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const g = base - bend * A;
  return [root[0] + Math.cos(g) * a, root[1] + Math.sin(g) * a];
}

// ───────────────────────── look and proportions ─────────────────────────
export const DEFAULTS = {
  age: 'child', build: 'average', height: 1, seed: 7,
  skin: '#f2c9a8', blush: 0.5, eyes: '#5a3a24',
  hairStyle: 'short', hair: '#4a3222', beard: 'none',
  shirt: '#e0703a', sleeves: 'long', bottom: 'trousers', pants: '#3d5a8a', dress: null, shoes: '#5a3a2a', socks: '#f2ede2',
  scarf: false, glasses: false, hat: false, apron: false, backpack: false,
};
const AGE_LOOK = {
  child: { hairStyle: 'short', bottom: 'shorts', shirt: '#e0703a', pants: '#3d5a8a' },
  teen: { hairStyle: 'ponytail', bottom: 'trousers', shirt: '#5a8fc8', pants: '#3a3a4e', hair: '#5a3a22' },
  adult: { hairStyle: 'short', bottom: 'trousers', shirt: '#6f9a6a', pants: '#5a4a3e', hair: '#3a2a20', shoes: '#4a3428' },
  elder: { hairStyle: 'short', bottom: 'trousers', shirt: '#b8a07a', pants: '#5e5a66', hair: '#dedad2', shoes: '#4a3a32', skin: '#ecc5a6' },
};
// Proportions as fractions of standing height H. head = chin-to-crown; leg = hip joint to sole.
const AGES = {
  child: { H: 140, head: 0.27, neck: 0.008, torso: 0.33, leg: 0.42, chest: 0.235, waist: 0.225, hipW: 0.23, upArm: 0.152, foreArm: 0.128, hand: 0.05, foot: 0.155, limbK: 1.2, belly: 0.3, eye: 1.18, stoop: 0, walk: 1.32, run: 2.4, cad: [1.18, 1.7], jaw: 0 },
  teen: { H: 184, head: 0.205, neck: 0.025, torso: 0.32, leg: 0.47, chest: 0.205, waist: 0.16, hipW: 0.17, upArm: 0.178, foreArm: 0.148, hand: 0.05, foot: 0.15, limbK: 0.95, belly: 0, eye: 1.06, stoop: 0, walk: 1.35, run: 2.6, cad: [0.98, 1.45], jaw: 0.6 },
  adult: { H: 215, head: 0.18, neck: 0.032, torso: 0.31, leg: 0.49, chest: 0.215, waist: 0.165, hipW: 0.175, upArm: 0.185, foreArm: 0.152, hand: 0.05, foot: 0.15, limbK: 1, belly: 0.15, eye: 1, stoop: 0, walk: 1.35, run: 2.6, cad: [0.95, 1.4], jaw: 1 },
  elder: { H: 205, head: 0.185, neck: 0.026, torso: 0.31, leg: 0.49, chest: 0.21, waist: 0.18, hipW: 0.18, upArm: 0.18, foreArm: 0.15, hand: 0.05, foot: 0.15, limbK: 0.95, belly: 0.35, eye: 0.98, stoop: 0.22, walk: 1.08, run: 1.7, cad: [0.82, 1.2], jaw: 0.9 },
};
const BUILD = { slim: { w: 0.86, limb: 0.86, belly: -0.15 }, average: { w: 1, limb: 1, belly: 0 }, sturdy: { w: 1.17, limb: 1.15, belly: 0.45 } };

export function look(params = {}) {
  const age = AGES[params.age] ? params.age : DEFAULTS.age;
  const p = { ...DEFAULTS, ...AGE_LOOK[age], ...params, age };
  if (!BUILD[p.build]) p.build = 'average';
  for (const k of ['skin', 'eyes', 'hair', 'shirt', 'pants', 'shoes', 'socks']) p[k] = normHex(p[k], normHex(DEFAULTS[k]));
  p.dress = p.dress ? normHex(p.dress) : p.shirt;
  for (const k of ['scarf', 'hat', 'apron', 'backpack']) p[k] = p[k] === true ? { scarf: '#c8443a', hat: '#d8b04a', apron: '#f2ede2', backpack: '#b06a3a' }[k] : p[k] ? normHex(p[k]) : false;
  p.glasses = p.glasses === true ? '#3a2e2a' : p.glasses ? normHex(p.glasses) : false;
  if (age === 'child' || age === 'teen') p.beard = 'none';
  if (!['none', 'short', 'full'].includes(p.beard)) p.beard = 'none';
  if (!['short', 'long', 'ponytail', 'bun', 'curly', 'bald', 'cap'].includes(p.hairStyle)) p.hairStyle = 'short';
  if (!['trousers', 'shorts', 'skirt', 'dress'].includes(p.bottom)) p.bottom = 'trousers';
  p.height = clamp(+p.height || 1, 0.6, 1.5);
  p.__look = true;
  return p;
}

// Absolute metrics for a look: every length in units at scale 1.
export function metrics(params = {}) {
  const lk = params.__look ? params : look(params), A = AGES[lk.age], B = BUILD[lk.build], H = A.H * lk.height;
  const L = A.leg * H, ankle = 0.036 * H, thigh = (L - ankle) * 0.52, shin = (L - ankle) * 0.48;
  const M = {
    age: lk.age, H, headH: A.head * H, k: (A.head * H) / 2, neck: A.neck * H, torso: A.torso * H, L, thigh, shin, ankle,
    upArm: A.upArm * H, foreArm: A.foreArm * H, hand: A.hand * H * (lk.build === 'sturdy' ? 1.08 : 1), foot: A.foot * H,
    chest: A.chest * H * B.w, waist: A.waist * H * B.w, hipW: A.hipW * H * B.w, belly: clamp(A.belly + B.belly, 0, 1),
    limb: (H / 215) * A.limbK * B.limb, eye: A.eye, stoop: A.stoop, jaw: A.jaw, child: lk.age === 'child' ? 1 : 0,
    sh: 1.5 + 0.0045 * H,
  };
  M.thighW = 7.6 * M.limb; M.kneeW = 5.4 * M.limb; M.ankleW = 3.7 * M.limb;
  M.armW = 4.8 * M.limb; M.elbowW = 3.9 * M.limb; M.wristW = 3.1 * M.limb;
  M.buttR = Math.max(0.14 * M.torso, M.thighW);
  const strideK = 1; // normalised strides are per leg length
  M.stride = { walk: A.walk * L * strideK, run: A.run * L * strideK };
  M.speeds = { walk: M.stride.walk * A.cad[0], run: M.stride.run * A.cad[1] };
  M.width = M.chest * 1.1;
  return M;
}

// ───────────────────────── skeleton ─────────────────────────
// Pose fields (all numbers). Angles in radians. Arms are relative to the upper spine; legs are absolute (0 = straight down, + = forward).
//  lean / stoop: lower / upper spine tilt (+ forward)   tilt: head pitch (+ = chin down)   turn: head yaw   shrug: 0..1
//  hipF/kneeF/fF, hipB/kneeB/fB: near (F) and far (B) leg: thigh angle, knee bend, foot pitch (+ = toes down)
//  shF/elF/hF, shB/elB/hB: arms, relative to the torso (lean + stoop): shoulder angle, elbow bend (+ forward), hand (0 relaxed, 1 open, 2 fist, 3 point)
//  ik (both legs) / ikF / ikB 0..1 with tFx,tFy,tBx,tBy: foot targets (sole under the ankle) relative to the hip, in leg lengths;
//    pvF/pvB: -1 heel / +1 toe pivot; gF/gB = 1 snaps that foot's target height to the ground found from the rest of the body
//  gy (with weight gyW): hip height above the ground in leg lengths (gaits); liftL: extra lift in leg lengths; run: 1 for run cycles
//  seat: 1 = sitting on a surface at the contact point; seatH: ground distance below the seat (0 = knee height)
//  bkFront: 1 = far arm drawn in front of the torso; lift: units off the ground; idle: weight-shift sway; gait: 0..1 walking weight
//  laugh / gasp / sleep / joy: face hints for gestures and poses; hx: hip shift (units)
export const POSE0 = {
  lean: 0.02, stoop: 0, tilt: 0, turn: 0, shrug: 0, hx: 0,
  hipF: -0.04, kneeF: 0.05, fF: 0, hipB: 0.07, kneeB: 0.04, fB: 0,
  shF: -0.07, elF: 0.24, hF: 0, shB: 0.1, elB: 0.25, hB: 0, bkFront: 0,
  ik: 0, ikF: 0, ikB: 0, tFx: 0.06, tFy: 1, tBx: -0.05, tBy: 1, pvF: 0, pvB: 0, gF: 0, gB: 0, gy: 0, gyW: 0, liftL: 0, run: 0,
  seat: 0, seatH: 0, lift: 0, idle: 0, gait: 0, laugh: 0, gasp: 0, sleep: 0, joy: 0,
};
const BASE_YAW = 0.72;

function headGeo(M, yaw) {
  const j = M.jaw, xc = 0.48 * Math.sin(yaw), cf = Math.cos(yaw) / Math.cos(BASE_YAW), eyeY = 0.17 - 0.12 * j;
  const CP = [
    [-0.08, -1.0], [xc + 0.16, -0.9], [xc + 0.46, -0.46], [xc + 0.6, eyeY + 0.16],
    [xc + 0.55 - 0.06 * j, eyeY + 0.5], [xc + 0.34, 0.86 + 0.09 * j], [xc - 0.04, 0.95 + 0.07 * j],
    [-0.38, 0.68 + 0.04 * j], [-0.78, 0.3], [-0.98, -0.28], [-0.72, -0.8],
  ];
  const sp = 0.25 * cf;
  return {
    CP, xc, cf, eyeY, j,
    eyeN: [xc - sp * 1.06, eyeY], eyeF: [xc + sp * 0.97, eyeY - 0.01],
    nose: [xc + 0.6 + 0.03 * j, eyeY + 0.24 + 0.04 * j], mouth: [xc + 0.2, eyeY + 0.47 + 0.07 * j],
    ear: [xc - 0.74, eyeY + 0.06], neck: [-0.2, 0.62],
  };
}

function solve(p0, M, st = {}, lk = {}) {
  const p = { ...POSE0, ...p0 };
  const br = 0.5 - 0.5 * Math.cos(2 * Math.PI * (st.breath || 0));
  const lean = p.lean, a2 = lean + p.stoop + M.stoop * (1 - p.seat * 0.3), T = M.torso * (1 + 0.012 * br);
  const fwd = a => [Math.cos(a), Math.sin(a)];
  const hip = [p.hx, 0], chest = add(hip, mul(upv(lean), T * 0.5)), neck = add(chest, mul(upv(a2), T * 0.5));
  const shC = add(neck, mul(upv(a2), -T * 0.12 + p.shrug * T * 0.1 + br * 0.4));
  const shN = add(shC, mul(fwd(a2), -0.15 * M.chest)), shFar = add(shC, mul(fwd(a2), 0.24 * M.chest));
  const ar = -(lean + p.stoop);                     // arms turn with the torso (an elder's stoop leaves them hanging)
  const arm = (S, sa, ea) => { const el = add(S, mul(down(ar + sa), M.upArm)), wr = add(el, mul(down(ar + sa + ea), M.foreArm)); return { sh: S, el, wr, dir: ar + sa + ea }; };
  const aF = arm(shN, p.shF, p.elF), aB = arm(shFar, p.shB, p.elB);
  aF.hand = add(aF.wr, mul(down(aF.dir), M.hand * 0.75)); aB.hand = add(aB.wr, mul(down(aB.dir), M.hand * 0.75));
  const hipN = add(hip, mul(fwd(lean), -0.14 * M.hipW)), hipFar = add(hip, mul(fwd(lean), 0.16 * M.hipW));
  const footOff = [[-0.24 * M.foot, M.ankle], [0.76 * M.foot, M.ankle]];         // heel, toe relative to the ankle (flat)
  const seat = p.seat >= 0.5;
  const seatH = st.seatHeight ?? (p.seatH < 0 ? 0 : p.seatH || (M.shin + M.ankle + 2));
  const leg = (Hj, ha, ka, fa, tx, ty, pv, side, ikw) => {
    if (M.age === 'elder' && !seat) { ha += 0.05; ka += 0.12; }
    let hipA = ha, shinA = ha - ka;
    if (seat) {
      const kneeA = add(Hj, mul(down(ha), M.thigh)), gy = Hj[1] + M.buttR + seatH;
      const tgt = [kneeA[0] + M.shin * 0.12 + side * 2, gy - M.ankle];
      if (len(sub(tgt, Hj)) > (M.thigh + M.shin) * 0.995) {             // the floor is out of reach: dangle with a lazy swing
        shinA = 0.18 + 0.12 * Math.sin((st.t || 0) * 2.1 + side * 1.7) - (ha - 1.5) * 0.3; fa = 0.5;
      } else { const kn = ik2(Hj, tgt, M.thigh, M.shin, 1); hipA = angDown(sub(kn, Hj)); shinA = angDown(sub(tgt, kn)); fa = 0; }
    } else if (ikw > 0) {
      const A0 = add(Hj, [tx * M.L, ty * M.L - M.ankle]);
      const o = pv >= 0 ? footOff[1] : footOff[0], tgt = add(A0, mul(sub(o, rot(o, fa)), Math.abs(pv)));
      const kn = ik2(Hj, tgt, M.thigh, M.shin, 1);
      hipA = lerp(ha, angDown(sub(kn, Hj)), ikw); shinA = lerp(ha - ka, angDown(sub(tgt, kn)), ikw);
    }
    const knee = add(Hj, mul(down(hipA), M.thigh)), ank = add(knee, mul(down(shinA), M.shin));
    return { hip: Hj, knee, ank, heel: add(ank, rot(footOff[0], fa)), toe: add(ank, rot(footOff[1], fa)), fa, hipA, shinA };
  };
  const gk = p.run ? AGES[M.age].run / 2.6 : AGES[M.age].walk / 1.35, sx = p.gyW > 0 ? lerp(1, gk, clamp(p.gyW)) : 1;   // per-age stride
  const mkF = ty => leg(hipN, p.hipF, p.kneeF, p.fF, p.tFx * sx, ty, p.pvF, 1, Math.max(p.ik, p.ikF));
  const mkB = ty => leg(hipFar, p.hipB, p.kneeB, p.fB, p.tBx * sx, ty, p.pvB, -1, Math.max(p.ik, p.ikB));
  let lF = mkF(p.tFy), lB = mkB(p.tBy);

  // head
  const yaw = clamp(BASE_YAW + p.turn + 0.3 * (st.look || 0), 0.12, 1.3), G = headGeo(M, yaw), k = M.k;
  const th = a2 + p.tilt - M.stoop * 0.85 + (st.look ? 0.04 * st.look : 0);
  const nTop = add(neck, mul(upv(a2 + p.tilt * 0.35 - M.stoop * 0.4), M.neck + k * 0.1));
  const hc = sub(nTop, rot(mul(G.neck, k), th));
  const HT = q => add(hc, rot(mul(q, k), th));
  const headPts = spline(G.CP, 5).map(HT);

  // ground: the lowest of every part that could touch it (soles, knees, seat, back, head, hands)
  const legC = l => [l.heel, l.toe, add(l.knee, [0, M.kneeW])];
  const body = [add(hip, [0, M.buttR]), add(hip, mul(fwd(lean), -0.45 * M.hipW)), add(aF.hand, [0, M.hand * 0.6]), add(aB.hand, [0, M.hand * 0.6]),
    add(shN, mul(fwd(a2), -0.36 * M.chest)), add(chest, mul(fwd(lean), -0.5 * M.chest)), ...headPts];
  const maxY = P => Math.max(...P.map(c => c[1]));
  if (!seat && (p.gF >= 0.5 || p.gB >= 0.5)) {        // plant the snapping foot on the ground the rest of the body defines
    const g0 = maxY([...body, ...(p.gF >= 0.5 ? [] : legC(lF)), ...(p.gB >= 0.5 ? [] : legC(lB))]);
    if (p.gF >= 0.5) lF = mkF((g0 - hipN[1]) / M.L);
    if (p.gB >= 0.5) lB = mkB((g0 - hipFar[1]) / M.L);
  }
  let g = seat ? hip[1] + M.buttR : maxY([...body, ...legC(lF), ...legC(lB)]);
  if (!seat && p.gyW > 0) g = lerp(g, hip[1] + (p.gy / p.gyW) * M.L, clamp(p.gyW));
  const lift = (p.lift || 0) + (p.liftL || 0) * M.L + (st.lift || 0);
  const dy = -g - lift, mv = q => [q[0], q[1] + dy];
  const J = {
    p, M, G, yaw, th, k, lift, seat, seatH, br, lean, a2, T,
    hip: mv(hip), chest: mv(chest), neck: mv(neck), shC: mv(shC), nTop: mv(nTop), hc: mv(hc),
    HT: q => mv(HT(q)), headPts: headPts.map(mv),
    aF: Object.fromEntries(Object.entries(aF).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    aB: Object.fromEntries(Object.entries(aB).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    lF: Object.fromEntries(Object.entries(lF).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    lB: Object.fromEntries(Object.entries(lB).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
  };
  return J;
}

// Extent of the figure in local units (contact at the origin, facing right).
function extent(J, lk) {
  const { M } = J, xs = [], ys = [];
  const put = (q, r = 0) => { xs.push(q[0] - r, q[0] + r); ys.push(q[1] - r, q[1] + r); };
  const hv = { short: 0.12, long: 0.14, ponytail: 0.1, bun: 0.1, curly: 0.26, bald: 0.03, cap: 0.14 }[lk.hairStyle] ?? 0.12;
  J.headPts.forEach(q => put(q, hv * J.k));
  for (const l of [J.lF, J.lB]) { put(l.knee, M.kneeW); put(l.heel, 2); put(l.toe, 3); put(l.hip, M.thighW); }
  for (const a of [J.aF, J.aB]) { put(a.el, M.elbowW); put(a.hand, M.hand * 0.75); put(a.sh, M.armW); }
  put(J.chest, M.chest * 0.55); put(J.hip, M.hipW * 0.55);
  if (lk.hairStyle === 'bun') put(J.HT([-0.45, -1.05]), 0.3 * J.k);
  if (lk.hairStyle === 'ponytail') put(J.HT([-1.3, 0.2]), 0.35 * J.k);
  if (lk.hairStyle === 'long') { put(J.HT([-0.9, 1.6]), 0.2 * J.k); }
  if (lk.hat || lk.hairStyle === 'cap') put(J.HT([0.2, -1.05]), 0.7 * J.k);
  if (lk.scarf) put(add(J.neck, [-M.chest * 0.6, M.torso * 0.4]), 6);
  if (lk.backpack) put(add(J.chest, [-M.chest * 0.85, 0]), 6);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ───────────────────────── body parts ─────────────────────────
// Union-inked group: every outline first (double width), then every fill, so internal joints carry no line.
function group(ctx, parts, w = 1.1) {
  for (const q of parts) ln(ctx, q.P, w * 2, { seed: q.seed });
  for (const q of parts) cel(ctx, q.P, q.col, 0, q.seed);
}
const handFrame = (a, M) => { const v = down(a.dir), w = [v[1], -v[0]]; return q => add(a.wr, add(mul(v, q[0] * M.hand), mul(w, q[1] * M.hand))); };
function handParts(a, M, kind, seed) {
  const T = handFrame(a, M), S = Q => wobble(spline(Q.map(T), 3), seed, 0.12), h = M.hand;
  const finger = (b, t, r) => capsule(T(b), T(t), r * h, r * h * 0.9, seed + 7, 0.05);
  kind = Math.round(clamp(kind, 0, 3));
  if (kind === 1) {                                   // open palm, fingers spread
    return [S([[0, -0.32], [0.3, -0.4], [0.62, -0.36], [0.66, 0.08], [0.55, 0.36], [0.2, 0.4], [0, 0.3]]),
      finger([0.55, -0.27], [1.0, -0.42], 0.1), finger([0.6, -0.1], [1.12, -0.16], 0.105), finger([0.6, 0.06], [1.1, 0.1], 0.1), finger([0.55, 0.2], [0.94, 0.32], 0.09),
      finger([0.25, 0.3], [0.5, 0.68], 0.1)];
  }
  if (kind === 2) return [S([[0, -0.3], [0.25, -0.44], [0.62, -0.44], [0.8, -0.22], [0.8, 0.2], [0.62, 0.42], [0.3, 0.44], [0.05, 0.32]])];
  if (kind === 3) return [S([[0, -0.3], [0.25, -0.44], [0.62, -0.44], [0.8, -0.22], [0.78, 0.08], [0.55, 0.36], [0.3, 0.42], [0.05, 0.32]]), finger([0.55, 0.12], [1.28, 0.2], 0.105)];
  return [S([[0, -0.32], [0.35, -0.4], [0.78, -0.34], [1.0, -0.1], [0.97, 0.15], [0.8, 0.3], [0.62, 0.3], [0.52, 0.46], [0.36, 0.5], [0.2, 0.4], [0, 0.32]])];
}
function handDetail(ctx, a, M, kind, seed, col) {
  const T = handFrame(a, M); kind = Math.round(clamp(kind, 0, 3));
  if (LW * M.hand < 4) return;                        // too small to read: skip finger lines
  const c = rgba(darken(col, 0.55), 0.7);
  if (kind === 0) { stroke(ctx, [T([0.72, -0.1]), T([0.95, -0.05])], 0.45, seed, c); stroke(ctx, [T([0.7, 0.1]), T([0.92, 0.12])], 0.45, seed + 1, c); }
  if (kind === 2 || kind === 3) { stroke(ctx, [T([0.62, -0.3]), T([0.7, 0.05]), T([0.5, 0.28])], 0.5, seed, c); }
}
function drawArm(ctx, J, a, far, lk, kind, seed) {
  const M = J.M, f = far ? 0.86 : 1, skin = darken(lk.skin, f), top = darken(lk.bottom === 'dress' ? lk.dress : lk.shirt, f);
  const long = lk.sleeves !== 'short';
  const up = capsule(a.sh, a.el, M.armW * (long ? 1.12 : 1.04), M.elbowW * (long ? 1.1 : 1), seed);
  const fo = capsule(a.el, a.wr, M.elbowW * (long ? 1.1 : 1), M.wristW * (long ? 1.15 : 1), seed + 1);
  group(ctx, [{ P: up, col: long ? top : skin, seed }, { P: fo, col: long ? top : skin, seed: seed + 1 },
    ...handParts(a, M, kind, seed + 2).map((P, i) => ({ P, col: skin, seed: seed + 3 + i }))]);
  handDetail(ctx, a, M, kind, seed + 9, skin);
  if (!far || J.p.bkFront >= 0.5) {                  // let the arm grow out of the shoulder: hide the inked cap inside the torso
    const d = sub(a.el, a.sh), u = mul(d, 1 / (len(d) || 1)), n = [-u[1], u[0]], r = M.armW * (long ? 1.12 : 1.04) + 1.4 * LW;
    const disc = [...Array.from({ length: 13 }, (_, i) => { const q = Math.PI * (i / 12); return add(a.sh, add(mul(n, Math.cos(q) * r), mul(u, -Math.sin(q) * r))); }), add(a.sh, mul(u, M.armW * 0.6))];
    ctx.save(); path(ctx, J.tor.P); ctx.clip(); path(ctx, disc); ctx.clip();
    const col = long ? top : skin;
    ctx.fillStyle = col; ctx.fillRect(-900, -900, 1800, 1800);
    ctx.restore();
  }
  if (long) {                                          // cuff
    const v = sub(a.wr, a.el), n = mul([-v[1], v[0]], M.wristW * 1.15 / (len(v) || 1)), c = sub(a.wr, mul(v, 0.1 / 1));
    stroke(ctx, [add(c, n), sub(c, n)], 0.7, seed + 11);
  } else {                                             // short sleeve over the shoulder
    const m = mid(a.sh, a.el, 0.5);
    cel(ctx, capsule(a.sh, m, M.armW * 1.3, M.armW * 1.25, seed + 12), top, 1.1, seed + 12);
  }
}
function shoeShape(l, M) {
  const f = M.foot, s = M.ankle;
  const Q = [[-0.16 * f, -0.55 * s], [0.16 * f, -0.62 * s], [0.46 * f, -0.08 * s], [0.72 * f, 0.15 * s], [0.82 * f, 0.6 * s], [0.74 * f, s], [-0.2 * f, s], [-0.28 * f, 0.62 * s], [-0.26 * f, -0.05 * s]];
  return spline(Q.map(q => add(l.ank, rot(q, l.fa))), 3);
}
function drawLeg(ctx, J, l, far, lk, seed) {
  const M = J.M, f = far ? 0.86 : 1, skin = darken(lk.skin, f), pants = darken(lk.pants, f);
  const tr = lk.bottom === 'trousers';
  const thigh = capsule(l.hip, l.knee, M.thighW * (tr ? 1.1 : 1), M.kneeW * (tr ? 1.15 : 1), seed);
  const shin = capsule(l.knee, l.ank, M.kneeW * (tr ? 1.15 : 1), M.ankleW * (tr ? 1.45 : 1), seed + 1);
  if (!tr) {                                           // socks before the shoe
    group(ctx, [{ P: thigh, col: skin, seed }, { P: shin, col: skin, seed: seed + 1 }]);
    cel(ctx, capsule(mid(l.ank, l.knee, 0.32), l.ank, M.ankleW * 1.12, M.ankleW * 1.1, seed + 3), darken(lk.socks, f), 0.8, seed + 3);
  }
  const shoe = shoeShape(l, M);
  cel(ctx, shoe, darken(lk.shoes, f), 1.1, seed + 4);
  ctx.save(); path(ctx, shoe); ctx.clip();
  const so = [[-0.3, 0.8], [0.9, 0.8], [0.9, 1.3], [-0.3, 1.3]].map(q => add(l.ank, rot([q[0] * M.foot, q[1] * M.ankle], l.fa)));
  fillP(ctx, so, darken(lk.shoes, 0.55 * f)); ctx.restore();
  ln(ctx, shoe, 1.1, { seed: seed + 4 });
  if (tr) {
    group(ctx, [{ P: thigh, col: pants, seed }, { P: shin, col: pants, seed: seed + 1 }]);
    const v = sub(l.ank, l.knee), n = mul([-v[1], v[0]], M.ankleW * 1.45 / (len(v) || 1));
    stroke(ctx, [add(l.ank, n), sub(l.ank, n)], 0.6, seed + 5, rgba(darken(lk.pants, 0.4), 0.7));
    if (LW * M.H > 120) stroke(ctx, [mid(l.hip, l.knee, 0.55), mid(l.knee, l.ank, 0.2)].map((q, i) => add(q, [i ? 1.5 : -1, 0])), 0.45, seed + 6, rgba(darken(lk.pants, 0.45), 0.5));
  } else if (lk.bottom === 'shorts') {
    const m = mid(l.hip, l.knee, 0.62);
    cel(ctx, capsule(l.hip, m, M.thighW * 1.14, M.thighW * 1.1, seed + 2), pants, 1.1, seed + 2);
  }
}
// Torso outline along the curved spine, from s0 (fraction of the torso length; negative = below the hip joint) to the shoulders.
function torsoShape(J, s0 = -0.12, grow = 1) {
  const { M, lean, a2, T } = J, b = M.belly;
  const at = s => (s <= 0.5 ? add(J.hip, mul(upv(lean), T * s)) : add(J.chest, mul(upv(a2), T * (s - 0.5))));
  const fr = s => { const a = lerp(lean, a2, clamp((s - 0.35) / 0.4)); return [Math.cos(a), Math.sin(a)]; };
  const Wd = (s, front) => {
    const hw = M.hipW / 2, ww = (M.waist / 2) * (front ? 1 + 0.3 * b : 0.9), cw = (M.chest / 2) * (front ? 1.0 : 0.96);
    let w;
    if (s < 0.08) w = lerp(hw * 0.35, hw, smooth(-0.14, 0.06, s));
    else if (s < 0.34) w = lerp(hw, ww, smooth(0.08, 0.34, s));
    else if (s < 0.72) w = lerp(ww, cw, smooth(0.34, 0.72, s));
    else if (s < 0.86) w = cw;
    else w = lerp(cw, cw * 0.3, Math.pow(smooth(0.86, 1.06, s), 1.6));
    return w * grow;
  };
  const S = []; for (let s = s0; s < 1.06; s += 0.06) S.push(s); S.push(1.06);
  const back = S.map(s => add(at(s), mul(fr(s), -Wd(s, 0)))), front = S.map(s => add(at(s), mul(fr(s), Wd(s, 1)))).reverse();
  return { P: wobble(spline([...back, ...front], 2), 31, 0.25), at, fr, Wd };
}

// ───────────────────────── face ─────────────────────────
// brow: [raise, inner-end raise]; lid: upper-lid closure; low: lower-lid squint; eye: open | wide | arc;
// mouth: curve (-1 frown .. 1 smile), w (width), open (0..1), o (round), wavy, teeth.
export const EXPR = {
  neutral: { brow: [0, 0], lid: 0.14, low: 0, eye: 'open', mouth: { curve: 0.45, w: 0.8, open: 0 } },
  happy: { brow: [0.05, -0.03], lid: 0.08, low: 0.22, eye: 'open', blush: 0.25, mouth: { curve: 1, w: 1.05, open: 0.3 } },
  sad: { brow: [-0.02, 0.13], lid: 0.38, low: 0, eye: 'open', gaze: [-0.1, 0.35], mouth: { curve: -0.85, w: 0.75, open: 0 } },
  surprised: { brow: [0.13, 0.04], lid: 0, low: 0, eye: 'wide', mouth: { curve: 0, w: 0.5, open: 0.55, o: 1 } },
  angry: { brow: [-0.05, -0.14], lid: 0.3, low: 0.18, eye: 'open', mouth: { curve: -0.55, w: 0.9, open: 0.18, teeth: 1 } },
  sleepy: { brow: [-0.03, 0.04], lid: 0.58, low: 0.12, eye: 'open', gaze: [0, 0.3], mouth: { curve: 0.15, w: 0.6, open: 0 } },
  worried: { brow: [0.04, 0.14], lid: 0.1, low: 0, eye: 'open', gaze: [-0.15, 0], mouth: { curve: -0.35, w: 0.72, open: 0, wavy: 1 } },
  laughing: { brow: [0.09, 0.03], lid: 0, low: 0, eye: 'arc', blush: 0.4, mouth: { curve: 1, w: 1.25, open: 0.85 } },
  curious: { brow: [0.08, -0.04], lid: 0.1, low: 0, eye: 'open', gaze: [0.25, -0.1], browSplit: 0.08, mouth: { curve: 0.2, w: 0.6, open: 0.08, o: 1 } },
};
const LIP = '#7c2c37', TONGUE = '#e07a80', TEETH = '#fbf7ee';

function drawEye(ctx, HT, k, e, rx, ry, st, side, lk, simple, seed) {
  // side: -1 near eye (outer corner on the left), +1 far eye
  const E = (x, y) => HT([e[0] + x, e[1] + y]), skin = lk.skin;
  const iris = lk.eyes, lash = '#2a1e22';
  if (st.shape === 'arc' || st.lid > 0.94) {
    const up = st.shape === 'arc';
    const P = arcPts(0, 0, rx * 1.05, ry * (up ? 0.75 : 0.45), up ? Math.PI * 1.08 : Math.PI * 0.08, up ? Math.PI * 1.92 : Math.PI * 0.92, 0.02).map(q => E(q[0], q[1] + (up ? ry * 0.25 : -ry * 0.05)));
    stroke(ctx, P, simple ? 1.6 : 1.5, seed);
    if (!up && !simple) stroke(ctx, [P[side < 0 ? 0 : P.length - 1], E(side * rx * 1.35, -ry * 0.05)], 0.7, seed + 1);
    return;
  }
  const wide = st.shape === 'wide' ? 1.14 : 1, RX = rx * wide, RY = ry * wide;
  const gx = clamp(st.gaze[0], -1, 1) * RX * 0.35 + RX * 0.18, gy = clamp(st.gaze[1], -1, 1) * RY * 0.3;
  if (simple) {                                    // small on screen: a dark oval with a glint reads best
    const O = ell(0, 0, RX * 0.62, RY * 0.8, seed, 0).map(q => E(q[0] + gx * 0.6, q[1] + gy * 0.5));
    fillP(ctx, O, darken(iris, 0.45));
    const g = E(gx * 0.6 - RX * 0.2, -RY * 0.3); dot(ctx, g[0], g[1], RX * k * 0.22, '#fff');
    if (st.lid > 0.25) {                           // heavy lid as a straight-ish line
      const y = -RY * 0.8 + st.lid * RY * 1.6;
      ctx.save(); path(ctx, O); ctx.clip(); fillP(ctx, [E(-RX, -RY * 1.2), E(RX, -RY * 1.2), E(RX, y), E(-RX, y)], skin); ctx.restore();
      stroke(ctx, [E(-RX * 0.8, y), E(RX * 0.8, y)], 1.1, seed + 2);
    }
    return;
  }
  const W = ell(0, 0, RX, RY, seed, 0).map(q => E(q[0], q[1]));
  const lid = clamp(st.lid, 0, 1), ly = -RY + lid * RY * 2;                 // lid edge height (eye-local)
  const lidY = x => ly + RY * 0.16 * (1 - lid) * (1 - (x / RX) ** 2) - side * x * 0.08;   // slight droop, tilted to the outer corner
  const topY = x => { const e = -RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2)); return Math.max(e, lidY(x)); };
  fillP(ctx, W, '#fbf8f2');
  ctx.save(); path(ctx, W); ctx.clip();
  const ir = Math.min(RY * 0.8, RX * 0.96) * (st.shape === 'wide' ? 0.72 : 1);
  const I = E(gx, gy + RY * 0.06);
  ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(I[0], I[1], ir * k * (side > 0 ? 0.84 : 0.94), ir * k, 0, 0, 7); ctx.fill();
  ctx.fillStyle = darken(iris, 0.62); ctx.beginPath(); ctx.ellipse(I[0], I[1] - ir * k * 0.15, ir * k * 0.8 * (side > 0 ? 0.84 : 0.94), ir * k * 0.7, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = lighten(iris, 0.25); ctx.beginPath(); ctx.ellipse(I[0], I[1] + ir * k * 0.45, ir * k * 0.5, ir * k * 0.3, 0, 0, Math.PI); ctx.fill();
  dot(ctx, I[0], I[1], ir * k * (st.shape === 'wide' ? 0.36 : 0.48), '#1c1418');
  const h1 = E(gx - ir * 0.36, gy - ir * 0.28), h2 = E(gx + ir * 0.34, gy + ir * 0.42);
  dot(ctx, h1[0], h1[1], ir * k * 0.3, '#ffffff'); dot(ctx, h2[0], h2[1], ir * k * 0.12, 'rgba(255,255,255,.85)');
  // upper lid: skin down to the lid edge, with a soft lid shadow just under it
  if (lid > 0.01) {
    const xs = Array.from({ length: 13 }, (_, i) => -RX * 1.2 + (i / 12) * RX * 2.4);
    fillP(ctx, [E(-RX * 1.3, -RY * 1.5), E(RX * 1.3, -RY * 1.5), ...xs.slice().reverse().map(x => E(x, lidY(x)))], darken(skin, 0.95));
  }
  ctx.fillStyle = 'rgba(70,50,70,.16)'; ctx.beginPath(); poly(ctx, [...Array.from({ length: 13 }, (_, i) => -RX + (i / 12) * RX * 2).map(x => E(x, topY(x))), ...Array.from({ length: 13 }, (_, i) => RX - (i / 12) * RX * 2).map(x => E(x, topY(x) + RY * 0.22))]); ctx.fill();
  if (st.low > 0.02) {                              // cheek pushes the lower lid up (smile)
    const by = RY - st.low * RY * 1.2, xs = Array.from({ length: 13 }, (_, i) => -RX * 1.2 + (i / 12) * RX * 2.4);
    fillP(ctx, [E(-RX * 1.3, RY * 1.5), E(RX * 1.3, RY * 1.5), ...xs.slice().reverse().map(x => E(x, by + RY * 0.3 * st.low * (x / RX) ** 2))], skin);
  }
  ctx.restore();
  // lash line follows the visible top edge, heavier at the outer corner, with a small flick
  const xs = Array.from({ length: 17 }, (_, i) => -RX * 1.02 + (i / 16) * RX * 2.04);
  const top = (side < 0 ? xs : xs.slice().reverse()).map(x => E(x, topY(clamp(x, -RX, RX))));
  stroke(ctx, top, 1.3, seed + 3, lash);
  const oc = top[0], ocx = side * RX;
  stroke(ctx, [oc, E(ocx * 1.2, topY(ocx * 0.98) - RY * 0.12)], 0.65, seed + 4, lash);
  const lowY = st.low > 0.02 ? RY - st.low * RY * 1.2 : RY * 0.98;
  stroke(ctx, arcPts(0, 0, RX * 0.92, 1, Math.PI * 0.2, Math.PI * 0.8, 0.05).map(q => E(q[0], lowY * Math.sin(Math.acos(clamp(q[0] / RX, -1, 1))) * (st.low > 0.02 ? 1 : 1))), 0.45, seed + 5, 'rgba(60,40,50,.5)');
}

function mouthShape(G, ex, talk, o) {
  const m = G.mouth, mo = ex.mouth, W = 0.27 * mo.w * (1 - 0.15 * o), c = mo.curve;
  const L = [m[0] - W * 0.6, m[1] - c * 0.05], R = [m[0] + W * 0.4, m[1] - c * 0.045], M0 = [m[0] - W * 0.05, m[1] + c * 0.022];
  return { L, R, M0, W, c };
}
function drawMouth(ctx, HT, k, G, ex, talk, simple, lk, seed) {
  const mo = ex.mouth, o = clamp(Math.max(mo.open || 0, talk > 0.05 ? 0.06 + talk * 0.78 : 0), 0, 1);
  const { L, R, M0, W, c } = mouthShape(G, ex, talk, o);
  const T = q => HT(q);
  if (mo.o && o > 0.05) {                         // round "oh"
    const rx = W * 0.32 + 0.025 * o, ry = 0.04 + 0.11 * o, cx = G.mouth[0] - W * 0.08, cy = G.mouth[1] + ry * 0.4;
    const P = ell(cx, cy, rx, ry, seed, 0).map(T);
    fillP(ctx, P, LIP); ctx.save(); path(ctx, P); ctx.clip(); const tq = T([cx, cy + ry * 0.75]); dot(ctx, tq[0], tq[1], rx * k * 0.8, TONGUE); ctx.restore();
    ln(ctx, P, 0.9, { seed });
    return;
  }
  if (o < 0.05) {
    const wav = mo.wavy ? [[lerp(L[0], M0[0], 0.5), lerp(L[1], M0[1], 0.5) - 0.02], [lerp(M0[0], R[0], 0.5), lerp(M0[1], R[1], 0.5) + 0.015]] : [];
    const P = spline([L, ...(wav.length ? [wav[0], M0, wav[1]] : [M0]), R], 6, false).map(T);
    stroke(ctx, P, simple ? 1.3 : 1.05, seed);
    if (!simple && c > 0.6) stroke(ctx, [T([L[0] - 0.005, L[1] - 0.035]), T([L[0] - 0.03, L[1] + 0.01])], 0.55, seed + 1);
    if (!simple && c > -0.2) { const lp = T([M0[0] + 0.01, M0[1] + 0.06]); stroke(ctx, [T([M0[0] - 0.04, M0[1] + 0.065]), lp, T([M0[0] + 0.05, M0[1] + 0.06])], 0.4, seed + 2, 'rgba(120,60,60,.35)'); }
    return;
  }
  const drop = 0.03 + o * 0.22 + Math.max(0, c) * 0.05;
  const B = [M0[0] + W * 0.02, M0[1] + drop];
  const top = spline([L, M0, R], 6, false), bot = spline([R, [lerp(R[0], B[0], 0.55), B[1] - drop * 0.15], B, [lerp(L[0], B[0], 0.5), B[1] - drop * 0.2], L], 5, false);
  const P = [...top, ...bot.slice(1, -1)].map(T);
  fillP(ctx, P, LIP);
  ctx.save(); path(ctx, P); ctx.clip();
  if (o > 0.22 && (mo.teeth || c >= 0)) fillP(ctx, [...top.map(q => T([q[0], q[1] - 0.05])), ...top.slice().reverse().map(q => T([q[0], q[1] + 0.03 + 0.03 * o]))], TEETH);
  if (o > 0.3) { const tq = T([B[0] - W * 0.08, B[1] + 0.015]); ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(tq[0], tq[1], W * k * 0.42, drop * k * 0.5, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ln(ctx, P, simple ? 1.1 : 0.95, { seed });
}

// Normalised hair shapes (head space); all go through HT() before drawing.
function radial(q, v) { const c = [0, -0.12], d = sub(q, c), L = len(d) || 1; return add(q, mul(d, v / L)); }
function hairCap(G, vol, fringe, lk) {
  const { CP, xc, ear } = G, ey = ear[1];
  const outer = [CP[8], CP[9], CP[10], CP[0], CP[1]].map(q => radial(q, vol));
  outer[0] = radial([-0.66, 0.4], vol * 0.5);
  const front = radial([xc + 0.34, -0.72], vol * 0.6);
  let line;
  if (fringe === 'locks') line = [[xc + 0.44, -0.46], [xc + 0.34, -0.52], [xc + 0.24, -0.4], [xc + 0.14, -0.5], [xc + 0.02, -0.37], [xc - 0.08, -0.46], [xc - 0.18, -0.34], [xc - 0.32, -0.3]];
  else if (fringe === 'sweep') line = [[xc + 0.38, -0.5], [xc + 0.12, -0.42], [xc - 0.14, -0.4], [xc - 0.32, -0.28]];
  else if (fringe === 'back') line = [[xc + 0.22, -0.74], [xc - 0.05, -0.62], [xc - 0.3, -0.42]];
  else line = [[xc + 0.36, -0.55], [xc + 0.05, -0.5], [xc - 0.3, -0.32]];
  line = [...line, [ear[0] + 0.14, ey - 0.28], [ear[0] + 0.16, ey + 0.02], [ear[0] + 0.06, ey - 0.18], [ear[0] - 0.14, ey - 0.12], [-0.6, 0.34]];
  return spline([...outer, front, ...line], 4);
}
function hairBack(G, vol) { const { CP } = G; return spline([[-0.2, 0.4], ...[CP[8], CP[9], CP[10], CP[0], CP[1]].map(q => radial(q, vol)), [G.xc - 0.1, -0.3]], 4); }

const HAIR_VOL = { short: 0.12, long: 0.1, ponytail: 0.07, bun: 0.07, curly: 0.22, bald: 0.03, cap: 0.06 };
// Hair that hangs behind the body (drawn before the torso): long sheet, ponytail.
function drawHairBehind(ctx, J, lk) {
  const { G, HT } = J, t = J.t, sw = 0.05 * Math.sin(t * 1.9) + 0.1 * J.p.gait * Math.sin(t * 7.3), hair = lk.hair;
  if (lk.hairStyle === 'long') {
    const P = spline([[-0.2, -0.9], [-0.98, -0.5], [-1.12, 0.2], [-1.08 + sw, 1.0], [-0.95 + sw * 1.6, 1.62], [-0.5 + sw * 1.4, 1.75], [-0.1 + sw, 1.45], [0.05, 0.7], [0.2, 0.1]], 4).map(HT);
    cel(ctx, P, darken(hair, 0.9), 1.1, 401);
    if (!J.simple) for (let i = 0; i < 3; i++) stroke(ctx, quad([-0.9 + i * 0.22, 0.2], [-0.95 + i * 0.25 + sw, 1.0], [-0.8 + i * 0.25 + sw * 1.5, 1.55], 10).map(HT), 0.5, 402 + i, rgba(darken(hair, 0.55), 0.6));
  }
  if (lk.hairStyle === 'ponytail') {
    const g = -J.th, extra = clamp((Math.abs(g) - 0.6) / 0.92, 0, 1) * 1.62 * Math.sign(g);   // hangs with gravity, lies along the floor when the head is down
    const a = g + extra + 0.2 * Math.sin(t * 2.3) * (1 - Math.abs(extra) / 1.62) + 0.25 * J.p.gait * Math.sin(t * 8.1);
    const R = q => add([-0.86, -0.5], rot(q, a));
    const P = spline([[0.05, -0.12], [-0.3, -0.05], [-0.48, 0.35], [-0.42, 0.85], [-0.25, 1.05], [-0.14, 0.75], [-0.05, 0.35], [0.12, 0.1]].map(R), 4).map(HT);
    cel(ctx, P, hair, 1.1, 403);
    if (!J.simple) stroke(ctx, [[-0.12, 0.05], [-0.3, 0.45], [-0.25, 0.85]].map(R).map(HT), 0.5, 404, rgba(darken(hair, 0.55), 0.6));
  }
}
function hairStrands(ctx, J, P, lk, seed) {
  if (J.simple) return;
  const { G, HT } = J, xc = G.xc, hair = lk.hair;
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.globalAlpha = 0.55;
  for (const [a, b, c] of [[[-0.2, -0.95], [-0.7, -0.6], [-0.85, 0.0]], [[0.0, -0.98], [-0.45, -0.75], [-0.65, -0.2]], [[0.2, -0.95], [xc, -0.8], [xc + 0.1, -0.55]]])
    stroke(ctx, quad(a, b, c, 10).map(HT), 0.55, seed++, darken(hair, 0.6));
  ctx.globalAlpha = 1;
  const hc = rgba(lighten(hair, 0.5), 0.6);
  stroke(ctx, quad([-0.62, -0.72], [-0.42, -0.9], [-0.18, -0.95], 8).map(HT), 2.2, seed + 5, hc);
  stroke(ctx, quad([-0.05, -0.97], [0.08, -0.97], [0.2, -0.93], 6).map(HT), 1.6, seed + 6, hc);
  ctx.restore();
}
function drawHead(ctx, J, lk, ex, st) {
  const { G, HT, k } = J, xc = G.xc, simple = J.simple, hair = lk.hair, style = lk.hairStyle;
  const skin = lk.skin, talk = clamp(st.talk || 0), o = Math.max(ex.mouth.open || 0, talk);
  const CP = G.CP.map((q, i) => (i >= 4 && i <= 6 ? [q[0], q[1] + o * (i === 4 ? 0.03 : 0.07)] : q));
  const head = wobble(spline(CP, 5).map(HT), 41, 0.2);
  const vol = HAIR_VOL[style] ?? 0.1, sh = mul(SH, 0.8);
  // hair mass behind the skull (gives curly / long / bun their volume)
  if (style === 'bun') { const B = ell(-0.42, -1.0, 0.34, 0.3, 405, 0).map(HT); cel(ctx, B, hair, 1.1, 405, sh); if (!simple) stroke(ctx, arcPts(-0.42, -1.0, 0.2, 0.16, 3.6, 5.9, 0.04).map(HT), 0.5, 406, rgba(darken(hair, 0.5), 0.7)); }
  if (style === 'curly' || style === 'long') { const Bk = hairBack(G, vol + 0.06); const P = (style === 'curly' ? scallop(Bk, 0.07) : Bk).map(HT); cel(ctx, P, darken(hair, 0.92), 1.1, 407, sh); }
  // skin
  cel(ctx, head, skin, 1.15, 41, sh);
  if (style === 'bald' && lk.age !== 'child' && lk.age !== 'teen') {   // fringe of hair around the back, below the crown
    const er0 = G.ear, ey = er0[1];
    const P = spline([[er0[0] - 0.04, ey - 0.24], radial([-0.8, -0.48], 0.03), radial([-0.97, -0.15], 0.04), radial([-0.9, 0.16], 0.035), radial([-0.7, 0.4], 0.02), [-0.66, 0.3], [-0.82, 0.08], [-0.85, -0.16], [-0.66, -0.32]], 4).map(HT);
    cel(ctx, P, hair, 1, 409, sh);
    if (!simple) stroke(ctx, quad([-0.9, -0.15], [-0.86, 0.05], [-0.72, 0.25], 6).map(HT), 0.45, 408, rgba(darken(hair, 0.6), 0.6));
  }
  // ear
  const er = G.ear, E = ell(er[0], er[1], 0.13, 0.19, 42, 0, -0.15).map(HT);
  cel(ctx, E, skin, 1, 42, sh);
  if (!simple) stroke(ctx, arcPts(er[0] + 0.01, er[1] + 0.01, 0.065, 0.11, -1.2, 1.9, 0.03).map(HT), 0.55, 43, rgba(darken(skin, 0.5), 0.8));
  // blush
  const bl = clamp(lk.blush + (ex.blush || 0), 0, 1.2);
  if (bl > 0.02) for (const [bx, by, r] of [[G.eyeN[0] - 0.08, G.eyeY + 0.3, 0.16], [G.eyeF[0] + 0.13, G.eyeY + 0.28, 0.1]]) {
    const c = HT([bx, by]), g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * k);
    g.addColorStop(0, `rgba(238,120,120,${0.42 * bl})`); g.addColorStop(1, 'rgba(238,120,120,0)');
    ctx.save(); path(ctx, head); ctx.clip(); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * k, r * k * 0.7, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // beard under the mouth
  if (lk.beard !== 'none') drawBeard(ctx, J, lk, CP, o);
  drawMouth(ctx, HT, k, G, ex, talk, simple, lk, 44);
  if (lk.beard === 'full') { const m = G.mouth; cel(ctx, spline([[m[0] - 0.2, m[1] - 0.02], [m[0] - 0.05, m[1] - 0.1], [m[0] + 0.12, m[1] - 0.1], [m[0] + 0.24, m[1] - 0.01], [m[0] + 0.08, m[1] - 0.04], [m[0] - 0.05, m[1] - 0.05]], 3).map(HT), darken(hair, 0.95), 0.8, 45, sh); }
  // nose: a soft hook that breaks the silhouette
  const n = G.nose, ns = lerp(0.8, 1.15, G.j) * (lk.age === 'elder' ? 1.12 : 1);
  const N = spline([[-0.1, -0.24], [0.0, -0.1], [0.07, 0.0], [0.05, 0.07], [-0.03, 0.08], [-0.08, 0.05], [-0.12, 0.0]].map(q => [n[0] + q[0] * ns, n[1] + q[1] * ns]), 4, false).map(HT);
  fillP(ctx, [...N, HT([n[0] - 0.16 * ns, n[1] - 0.05])], skin);
  ctx.save(); path(ctx, [...N, HT([n[0] - 0.16 * ns, n[1] - 0.05])]); ctx.clip(); ctx.globalCompositeOperation = 'multiply'; fillP(ctx, shift([...N, HT([n[0] - 0.16 * ns, n[1] - 0.05])], -sh[0] * 0.5, -sh[1] * 0.5), SHADE); ctx.restore();
  stroke(ctx, N.slice(Math.floor(N.length * 0.3)), simple ? 1.1 : 0.95, 46);
  if (lk.age === 'elder' && !simple) { const c = HT([n[0] + 0.01, n[1]]); dot(ctx, c[0], c[1], 0.05 * k, 'rgba(230,120,110,.25)'); }
  // eyes
  const es = { shape: ex.eye, lid: clamp(ex.lid + (lk.age === 'elder' ? 0.12 : 0) + (1 - ex.lid) * clamp(st.blink || 0), 0, 1), low: ex.low, gaze: [(ex.gaze?.[0] || 0) + 0.6 * (st.look || 0), ex.gaze?.[1] || 0] };
  if (J.p.sleep > 0.5) es.lid = 1;
  if ((st.blink || 0) > 0.85 && es.shape === 'wide') es.shape = 'open';
  const eK = J.M.eye, rx = 0.122 * eK, ry = 0.158 * eK;
  drawEye(ctx, HT, k, G.eyeN, rx, ry, es, -1, lk, simple, 50);
  drawEye(ctx, HT, k, G.eyeF, rx * 0.8 * clamp(G.cf, 0.6, 1.2), ry * 0.97, es, 1, lk, simple, 60);
  // wrinkles and laugh lines
  if (!simple && (lk.age === 'elder' || (lk.age === 'adult' && ex.low > 0.2))) {
    const wc = rgba(darken(skin, 0.55), 0.55), e = G.eyeN;
    stroke(ctx, [[e[0] - rx * 1.5, e[1] - 0.02], [e[0] - rx * 1.85, e[1] + 0.03]].map(HT), 0.4, 70, wc);
    stroke(ctx, [[e[0] - rx * 1.45, e[1] + 0.06], [e[0] - rx * 1.75, e[1] + 0.12]].map(HT), 0.4, 71, wc);
    if (lk.age === 'elder') {
      stroke(ctx, quad([n[0] - 0.12, n[1] + 0.06], [n[0] - 0.24, n[1] + 0.18], [G.mouth[0] - 0.16, G.mouth[1] + 0.06], 8).map(HT), 0.45, 72, wc);
      stroke(ctx, quad([xc - 0.25, -0.5], [xc - 0.05, -0.55], [xc + 0.2, -0.5], 8).map(HT), 0.4, 73, wc);
    }
  }
  // brows
  const bc = style === 'bald' && lk.age === 'child' ? darken(hair, 0.8) : darken(hair, lk.age === 'elder' ? 0.85 : 0.7), [braise, inner] = ex.brow;
  for (const [e, side, w, sd] of [[G.eyeN, -1, rx * 1.15, 80], [G.eyeF, 1, rx * 0.85 * clamp(G.cf, 0.6, 1.2), 81]]) {
    const by = e[1] - ry - 0.085 - braise - (side > 0 ? ex.browSplit || 0 : 0);
    const outer = [e[0] + side * w * 1.1, by + 0.02], innerP = [e[0] - side * w * 0.75, by - inner], midP = [e[0] + side * w * 0.2, by - 0.035 - inner * 0.35];
    stroke(ctx, spline(side < 0 ? [outer, midP, innerP] : [innerP, midP, outer], 4, false).map(HT), (simple ? 1.5 : 1.6) * (lk.age === 'elder' ? 1.25 : 1), sd, bc);
  }
  // hair on top
  if (style === 'bald') {
    if (lk.age === 'child' || lk.age === 'teen') { const P = hairCap(G, 0.02, 'none', lk).map(HT); ctx.save(); ctx.globalAlpha = 0.55; fillP(ctx, P, hair); ctx.restore(); }
    else if (!simple) stroke(ctx, quad([-0.55, -0.72], [-0.3, -0.9], [-0.02, -0.93], 8).map(HT), 2.4, 409, 'rgba(255,255,255,.4)');
  } else if (style !== 'cap') {
    const fr = { short: 'locks', long: 'sweep', ponytail: 'sweep', bun: 'back', curly: 'locks' }[style] || 'locks';
    let C = hairCap(G, vol, fr, lk);
    if (style === 'curly') C = scallop(C, 0.06);
    const P = C.map(HT);
    cel(ctx, P, hair, 1.1, 410, sh);
    hairStrands(ctx, J, P, lk, 411);
    if (style === 'long') {                          // side curtain over the ear
      const t = J.t, sw = 0.04 * Math.sin(t * 1.9 + 0.5) + 0.08 * J.p.gait * Math.sin(t * 7.3);
      const Cu = spline([[er[0] + 0.17, er[1] - 0.42], [er[0] + 0.2, er[1] + 0.12], [er[0] + 0.1 + sw, 0.92], [er[0] - 0.02 + sw * 1.5, 1.24], [er[0] - 0.28 + sw, 1.12], [-0.88, 0.5], [-0.84, er[1] - 0.3]], 4).map(HT);
      cel(ctx, Cu, hair, 1.05, 415, sh);
      if (!simple) stroke(ctx, quad([er[0] + 0.08, er[1] - 0.2], [er[0] + 0.1 + sw, er[1] + 0.5], [er[0] - 0.02 + sw * 1.4, 1.15], 8).map(HT), 0.45, 416, rgba(darken(hair, 0.55), 0.6));
    }
    if (style === 'ponytail') { const c = HT([-0.86, -0.52]); cel(ctx, ell(c[0], c[1], 0.09 * k, 0.12 * k, 417, 0, 0.6), lk.scarf || '#d0506a', 0.8, 417, sh); }
  }
  if (style === 'cap') drawCap(ctx, J, lk, sh);
  if (lk.glasses) drawGlasses(ctx, J, lk, rx, ry);
  if (lk.hat && style !== 'cap') drawHat(ctx, J, lk, sh);
  return head;
}
function scallop(P, a) {                             // bumpy outline for curly hair
  const out = [], step = 5;
  for (let i = 0; i < P.length; i += step) {
    const p0 = P[i], p1 = P[(i + step) % P.length], m = mid(p0, p1), d = sub(p1, p0), L = len(d) || 1;
    out.push(p0, add(m, mul([d[1] / L, -d[0] / L], -a)));
  }
  return spline(out, 3);
}
function drawBeard(ctx, J, lk, CP, o) {
  const { G, HT } = J, er = G.ear, e = G.eyeY, xc = G.xc, full = lk.beard === 'full', ext = full ? 0.17 : 0.03, m = G.mouth;
  const Q = [[er[0] + 0.17, e + 0.1], [er[0] + 0.12, e + 0.4], radial(CP[7], 0.04), [CP[6][0] - 0.02, CP[6][1] + ext], [CP[5][0] + 0.06, CP[5][1] + ext * 0.75], radial(CP[4], 0.03),
    [m[0] + 0.26, m[1] - 0.1], [m[0] + 0.05, m[1] - 0.075], [m[0] - 0.18, m[1] - 0.04], [xc - 0.3, e + 0.38], [er[0] + 0.28, e + 0.22]];
  const P = spline(Q, 4).map(HT), col = full ? lk.hair : mixC(lk.hair, lk.skin, 0.45);
  cel(ctx, P, col, full ? 1 : 0.6, 430, mul(SH, 0.8));
  if (!J.simple && full) for (let i = 0; i < 4; i++) stroke(ctx, quad([m[0] - 0.3 + i * 0.12, m[1] + 0.12], [m[0] - 0.28 + i * 0.14, m[1] + 0.3], [m[0] - 0.22 + i * 0.13, CP[5][1] + ext * 0.7], 6).map(HT), 0.45, 431 + i, rgba(darken(lk.hair, 0.6), 0.6));
  if (!full) { ctx.save(); path(ctx, P); ctx.clip(); ctx.fillStyle = rgba(darken(lk.hair, 0.6), 0.25); for (let i = 0; i < 40; i++) { const u = (i * 0.618) % 1, v = (i * 0.381) % 1, q = HT([lerp(er[0] + 0.05, m[0] + 0.3, u), lerp(e + 0.1, CP[5][1] + 0.05, v)]); ctx.beginPath(); ctx.arc(q[0], q[1], 0.012 * J.k, 0, 7); ctx.fill(); } ctx.restore(); }
}
function drawGlasses(ctx, J, lk, rx, ry) {
  const { G, HT, k } = J, c = lk.glasses, r1 = ry * 1.45, cf = clamp(G.cf, 0.6, 1.2);
  const A = ell(G.eyeN[0], G.eyeN[1] + 0.01, r1 * 0.95, r1, 440, 0).map(HT), B = ell(G.eyeF[0] + 0.01, G.eyeF[1] + 0.01, r1 * 0.68 * cf, r1 * 0.97, 441, 0).map(HT);
  for (const P of [A, B]) { ctx.fillStyle = 'rgba(220,235,245,.18)'; path(ctx, P); ctx.fill(); ln(ctx, P, 0.9, { seed: 442, color: c }); }
  stroke(ctx, [[G.eyeN[0] + r1 * 0.93, G.eyeN[1] - 0.02], [(G.eyeN[0] + G.eyeF[0]) / 2, G.eyeN[1] - 0.05], [G.eyeF[0] - r1 * 0.66 * cf, G.eyeF[1] - 0.02]].map(HT), 0.8, 443, c);
  stroke(ctx, [[G.eyeN[0] - r1 * 0.93, G.eyeN[1] - 0.03], [G.ear[0] + 0.05, G.ear[1] - 0.08]].map(HT), 0.75, 444, c);
  if (!J.simple) { ctx.save(); path(ctx, A); ctx.clip(); stroke(ctx, [[G.eyeN[0] - r1 * 0.5, G.eyeN[1] + r1 * 0.2], [G.eyeN[0] - r1 * 0.1, G.eyeN[1] - r1 * 0.5]].map(HT), 0.6, 445, 'rgba(255,255,255,.5)'); ctx.restore(); }
}
function drawCap(ctx, J, lk, sh) {
  const { G, HT, CP = G.CP } = J, xc = G.xc, col = lk.hat || '#c8443a';
  const back = hairCap(G, 0.06, 'none', lk).map(HT); cel(ctx, back, lk.hair, 1, 450, sh);
  const dome = spline([radial(CP[9], 0.08), radial(CP[10], 0.1), radial(CP[0], 0.1), radial(CP[1], 0.08), [xc + 0.46, -0.42], [xc + 0.1, -0.36], [-0.5, -0.26], [-0.92, -0.1]], 4).map(HT);
  cel(ctx, dome, col, 1.1, 451, sh);
  const brim = spline([[xc + 0.05, -0.42], [xc + 0.6, -0.5], [xc + 0.98, -0.42], [xc + 0.96, -0.34], [xc + 0.55, -0.34], [xc + 0.1, -0.3]], 3).map(HT);
  cel(ctx, brim, darken(col, 0.85), 1.05, 452, sh);
  const b = HT([CP[0][0] + 0.02, CP[0][1] - 0.1]); dot(ctx, b[0], b[1], 0.06 * J.k, darken(col, 0.7));
  if (!J.simple) stroke(ctx, quad([CP[0][0] + 0.02, CP[0][1] - 0.08], [xc + 0.1, -0.8], [xc + 0.3, -0.42], 8).map(HT), 0.45, 453, rgba(darken(col, 0.5), 0.6));
}
function drawHat(ctx, J, lk, sh) {
  const { G, HT } = J, xc = G.xc, col = lk.hat;
  const crown = spline([[-0.82, -0.42], [-0.78, -1.12], [-0.2, -1.32], [xc + 0.2, -1.2], [xc + 0.42, -0.5]], 5, false).map(HT);
  cel(ctx, crown, col, 1.1, 460, sh);
  const band = spline([[-0.84, -0.56], [-0.2, -0.6], [xc + 0.44, -0.62], [xc + 0.44, -0.48], [-0.2, -0.44], [-0.84, -0.42]], 3).map(HT);
  cel(ctx, band, darken(col, 0.6), 0.8, 461, sh);
  const brim = spline([[-1.3, -0.3], [-0.6, -0.5], [xc + 0.3, -0.55], [xc + 1.0, -0.42], [xc + 0.95, -0.34], [xc + 0.2, -0.42], [-0.6, -0.36], [-1.28, -0.22]], 4).map(HT);
  cel(ctx, brim, lighten(col, 0.08), 1.1, 462, sh);
}

// ───────────────────────── torso, clothes, accessories ─────────────────────────
function skirtShape(J, lk) {
  const { at, fr, Wd } = J.tor, M = J.M, f0 = fr(0), long = lk.bottom === 'dress' ? 1.02 : 0.78;
  const legs = [J.lF, J.lB].map(l => ({ h: mid(l.hip, l.knee, long), d: sub(l.knee, l.hip) }));
  const d = add(mul(legs[0].d, 1 / (len(legs[0].d) || 1)), mul(legs[1].d, 1 / (len(legs[1].d) || 1)));
  const dl = len(d) || 1, dn = mul(d, 1 / dl), n = [dn[1], -dn[0]];
  const pr = q => q[0] * n[0] + q[1] * n[1];
  const [h0, h1] = pr(legs[0].h) < pr(legs[1].h) ? [legs[0].h, legs[1].h] : [legs[1].h, legs[0].h];
  const w = M.hipW * (lk.bottom === 'dress' ? 0.7 : 0.66);
  const hB = add(h0, mul(n, -w)), hF = add(h1, mul(n, w)), hm = add(mid(hB, hF), mul(dn, M.hipW * 0.06));
  const wy = 0.3;
  const up = mul(dn, -M.hipW * 0.12);
  return spline([add(at(wy), mul(fr(wy), -Wd(wy, 0) * 0.99)), add(at(0.08), mul(fr(0.08), -Wd(0.08, 0) * 1.1)), add(hB, up), hB, add(mid(hB, hm), mul(dn, M.hipW * 0.01)), hm, add(mid(hm, hF), mul(dn, M.hipW * 0.01)), hF, add(hF, up),
    add(at(0.08), mul(fr(0.08), Wd(0.08, 1) * 1.1)), add(at(wy), mul(fr(wy), Wd(wy, 1) * 0.99))], 5);
}
function drawPelvis(ctx, J, lk) {
  if (lk.bottom === 'dress') cel(ctx, J.tor.P, lk.dress, 1.15, 31);
  else cel(ctx, J.tor.P, lk.pants, 1.15, 32);
}
function drawTorso(ctx, J, lk) {
  const M = J.M, top = lk.bottom === 'dress' ? lk.dress : lk.shirt, tor = J.tor;
  if (lk.bottom !== 'dress') {
    const sh = torsoShape(J, lk.bottom === 'skirt' ? 0.24 : 0.0, 1.05);
    cel(ctx, sh.P, top, 1.15, 33);
    if (!J.simple) {
      const { at, fr, Wd } = sh, s = 0.2;
      stroke(ctx, [add(at(s + 0.05), mul(fr(s), -Wd(s, 0) * 0.3)), add(at(s - 0.02), mul(fr(s), Wd(s, 1) * 0.5))], 0.45, 34, rgba(darken(top, 0.5), 0.45));
    }
  }
  if (!J.simple) {                                  // a crease under the chest
    const { at, fr, Wd } = tor, s = 0.62;
    stroke(ctx, quad(add(at(s), mul(fr(s), Wd(s, 1) * 0.55)), add(at(s - 0.05), mul(fr(s), Wd(s, 1) * 0.85)), add(at(s - 0.12), mul(fr(s), Wd(s, 1) * 0.95)), 6), 0.45, 35, rgba(darken(top, 0.5), 0.4));
  }
}
function drawNeck(ctx, J, lk) {
  const M = J.M, k = J.k, w = k * (M.child ? 0.3 : 0.34), a = add(J.neck, mul(upv(J.a2), -M.torso * 0.06));
  cel(ctx, capsule(a, J.nTop, w, w * 0.92, 36), darken(lk.skin, 0.92), 1, 36);
}
function drawCollar(ctx, J, lk) {
  const M = J.M, k = J.k, w = k * (M.child ? 0.3 : 0.34), top = lk.bottom === 'dress' ? lk.dress : lk.shirt;
  const { at, fr } = J.tor, f = fr(1), u = upv(J.a2), c = add(at(1.0), mul(f, w * 0.15));
  const Q = (fx, uy) => add(c, add(mul(f, w * fx), mul(u, w * uy)));
  const P = spline([Q(-1.45, 0.25), Q(-0.2, -0.55), Q(1.45, 0.05), Q(1.25, 0.5), Q(-0.1, 0.0), Q(-1.25, 0.6)], 4);
  cel(ctx, P, darken(top, 0.9), 0.85, 37);
  if (lk.age === 'adult' || lk.age === 'elder') stroke(ctx, [Q(0.1, -0.3), Q(0.55, -1.3), Q(1.0, -0.25)], 0.6, 38, rgba(darken(top, 0.45), 0.8));
}
function drawScarf(ctx, J, lk, part) {
  const M = J.M, col = lk.scarf, { at, fr, Wd } = J.tor, f = fr(1), u = upv(J.a2), c = at(0.98), cw = Wd(0.9, 1), t = J.t;
  const fl = Math.sin(t * 2.6) * 0.5 + J.p.gait * Math.sin(t * 6.5) * 0.8;
  if (part === 'back') {                            // a tail streaming behind
    const mv = clamp(J.p.gait), dv = [lerp(-0.42, -1, mv), lerp(1, 0.4, mv) + 0.08 * fl], dl = len(dv), dirB = mul(dv, 1 / dl);
    const b0 = add(c, mul(f, -cw * 0.6));
    const L = M.torso * 0.5, P = [b0, add(b0, add(mul(dirB, L * 0.5), [0, fl * 2])), add(b0, add(mul(dirB, L), [0, fl * 4 + 4])), add(b0, add(mul(dirB, L), [2, fl * 4 + 4 + M.torso * 0.12])), add(b0, add(mul(dirB, L * 0.5), [2, fl * 2 + M.torso * 0.13])), add(b0, [1, M.torso * 0.15])];
    cel(ctx, spline(P, 3), darken(col, 0.85), 1, 470);
    return;
  }
  const ring = spline([add(c, add(mul(f, -cw * 0.75), mul(u, M.torso * 0.02))), add(c, add(mul(f, -cw * 0.1), mul(u, -M.torso * 0.12))), add(c, add(mul(f, cw * 0.82), mul(u, -M.torso * 0.02))),
    add(c, add(mul(f, cw * 0.7), mul(u, M.torso * 0.16))), add(c, add(mul(f, -cw * 0.1), mul(u, M.torso * 0.12))), add(c, add(mul(f, -cw * 0.72), mul(u, M.torso * 0.15)))], 4);
  cel(ctx, ring, col, 1.05, 471);
  const t0 = add(c, add(mul(f, cw * 0.15), mul(u, -M.torso * 0.08))), dn = mul(u, -1), L = M.torso * 0.42;
  const sway = mul(f, fl * 1.5 - J.p.gait * 3);
  const tail = spline([add(t0, mul(f, -cw * 0.16)), add(add(t0, mul(dn, L * 0.55)), add(mul(f, -cw * 0.2), sway)), add(add(t0, mul(dn, L)), add(mul(f, -cw * 0.12), mul(sway, 1.6))),
    add(add(t0, mul(dn, L)), add(mul(f, cw * 0.2), mul(sway, 1.6))), add(add(t0, mul(dn, L * 0.55)), add(mul(f, cw * 0.18), sway)), add(t0, mul(f, cw * 0.18))], 3);
  cel(ctx, tail, col, 1.05, 472);
  if (!J.simple) for (const v of [0.62, 0.78]) stroke(ctx, [add(add(t0, mul(dn, L * v)), add(mul(f, -cw * 0.17), mul(sway, 1.2 + v * 0.4))), add(add(t0, mul(dn, L * v)), add(mul(f, cw * 0.19), mul(sway, 1.2 + v * 0.4)))], 0.9, 473 + v * 10, lighten(col, 0.5));
}
function drawApron(ctx, J, lk) {
  const M = J.M, col = lk.apron, { at, fr, Wd } = J.tor, low = J.lF.knee, f0 = fr(0);
  const sk = skirtShape(J, { bottom: 'skirt' });
  const bib = spline([add(at(0.8), mul(fr(0.8), -Wd(0.8, 0) * 0.05)), add(at(0.8), mul(fr(0.8), Wd(0.8, 1) * 0.85)), add(at(0.36), mul(fr(0.36), Wd(0.36, 1) * 1.04)), add(at(0.36), mul(fr(0.36), -Wd(0.36, 0) * 0.2))], 2);
  ctx.save(); path(ctx, J.tor.P); ctx.clip(); cel(ctx, bib, col, 1, 480); ctx.restore();
  // lower panel: front half of a skirt shape
  ctx.save(); const cutA = add(at(0.3), mul(f0, -Wd(0.3, 0) * 0.15)); const big = [add(cutA, mul(upv(J.lean), 40)), add(cutA, add(mul(upv(J.lean), 40), mul(f0, 200))), add(cutA, add(mul(upv(J.lean), -200), mul(f0, 200))), add(cutA, mul(upv(J.lean), -200))];
  path(ctx, big); ctx.clip(); cel(ctx, sk, col, 1, 481); ctx.restore();
  stroke(ctx, [add(at(0.36), mul(fr(0.36), -Wd(0.36, 0) * 1.0)), add(at(0.36), mul(fr(0.36), Wd(0.36, 1) * 1.05))], 1.6, 482, darken(col, 0.8));
  stroke(ctx, [add(at(0.8), mul(fr(0.8), Wd(0.8, 1) * 0.1)), add(at(1.0), mul(fr(1), -Wd(1, 0) * 0.3))], 0.9, 483, darken(col, 0.75));
}
function drawBackpack(ctx, J, lk, part) {
  const M = J.M, col = lk.backpack, { at, fr, Wd } = J.tor;
  if (part === 'strap') {
    const a = add(at(0.95), mul(fr(0.95), -Wd(0.95, 0) * 0.35)), b = add(at(0.4), mul(fr(0.4), -Wd(0.4, 0) * 0.15));
    cel(ctx, capsule(a, b, M.chest * 0.07, M.chest * 0.06, 490), darken(col, 0.8), 0.9, 490);
    return;
  }
  const s = q => add(at(q[0]), mul(fr(q[0]), -(Wd(q[0], 0) + q[1] * M.chest)));
  const P = spline([s([0.92, -0.25]), s([0.95, 0.25]), s([0.85, 0.5]), s([0.3, 0.52]), s([0.22, 0.3]), s([0.26, -0.2])], 4);
  cel(ctx, P, col, 1.15, 491);
  const Q = spline([s([0.55, 0.2]), s([0.56, 0.5]), s([0.3, 0.52]), s([0.28, 0.22])], 3);
  cel(ctx, Q, darken(col, 0.88), 0.9, 492);
  stroke(ctx, [s([0.9, 0.02]), s([0.88, 0.45])], 0.6, 493, darken(col, 0.6));
}

// ───────────────────────── draw ─────────────────────────
function resolvePose(st) {
  const src = typeof st.pose === 'string' ? POSES[st.pose] || POSES.stand : st.pose || {};
  const p = { ...POSE0, ...src }, t = st.t || 0;
  if (p.idle > 0) {                                 // slow weight shift from foot to foot
    const w = Math.sin(t * 2 * Math.PI / 5.2) * p.idle, w2 = Math.sin(t * 2 * Math.PI / 3.1) * p.idle;
    p.hx += 2.4 * w; p.lean += 0.015 * w2; p.tilt += 0.04 * w; p.hipF += 0.05 * w; p.hipB += 0.05 * w; p.kneeF += Math.max(0, -w) * 0.18; p.kneeB += Math.max(0, w) * 0.18;
    p.shF += 0.03 * w2; p.shB -= 0.03 * w2;
  }
  return p;
}
const EXPR_ALIAS = { scared: 'worried', afraid: 'worried', nervous: 'worried', excited: 'happy', joyful: 'happy', glad: 'happy', smile: 'happy', shocked: 'surprised', amazed: 'surprised', mad: 'angry', cross: 'angry', tired: 'sleepy', upset: 'sad', thinking: 'curious', calm: 'neutral', laugh: 'laughing' };
function exprOf(st, p) {
  const e0 = EXPR_ALIAS[st.expr] || st.expr;
  let n = EXPR[e0] ? e0 : 'neutral';
  if (p.laugh > 0.5 && (n === 'neutral' || n === 'happy')) n = 'laughing';
  else if (p.gasp > 0.5 && (n === 'neutral' || n === 'happy')) n = 'surprised';
  else if (p.joy > 0.5 && n === 'neutral') n = 'happy';
  if (p.sleep > 0.5) n = 'sleepy';
  return EXPR[n];
}
function draw(ctx, x, y, s, face, st = {}) {
  const lk = look(st.params || {}), M = metrics(lk), p = resolvePose(st), f = face < 0 ? -1 : 1;
  const m = ctx.getTransform(), eff = Math.max(1e-3, s * Math.hypot(m.a, m.b));
  LW = eff > 2 ? Math.sqrt(2 / eff) : Math.pow(2 / eff, 0.35);
  SH = [-M.sh * f, -M.sh];
  const J = solve(p, M, st, lk);
  J.t = st.t || 0; J.simple = M.headH * eff < 46; J.tor = torsoShape(J);
  const ex = exprOf(st, p), box = extent(J, lk);
  if (st.shadow !== false && !(J.seat && J.seatH > 1)) {
    const cx = x + ((box[0] + box[2]) / 2) * s * f * 0.6, w = Math.max(M.width * 0.75, (box[2] - box[0]) * 0.5) * s;
    ctx.save(); ctx.fillStyle = 'rgba(35,50,30,0.26)'; ctx.beginPath();
    ctx.ellipse(cx, y + 1, w * (1 - clamp(J.lift / 160, 0, 0.5)), Math.max(1.5, w * 0.16), 0, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(s * f, s);
  ctx.beginPath(); ctx.rect(-2000, -4000, 4000, 4000 + (J.seat ? J.seatH : 0) + 1.5 * LW); ctx.clip();   // nothing passes through the ground
  const bk = p.bkFront >= 0.5, hB = p.hB, hF = p.hF;
  drawHairBehind(ctx, J, lk);
  if (lk.scarf) drawScarf(ctx, J, lk, 'back');
  if (lk.backpack) drawBackpack(ctx, J, lk, 'pack');
  if (!bk) drawArm(ctx, J, J.aB, true, lk, hB, 100);
  drawLeg(ctx, J, J.lB, true, lk, 120);
  drawNeck(ctx, J, lk);
  drawPelvis(ctx, J, lk);
  drawLeg(ctx, J, J.lF, false, lk, 140);
  drawTorso(ctx, J, lk);
  drawCollar(ctx, J, lk);
  if (lk.bottom === 'skirt' || lk.bottom === 'dress') { const P = skirtShape(J, lk); cel(ctx, P, lk.bottom === 'dress' ? lk.dress : lk.pants, 1.15, 160); if (!J.simple) { const c = lk.bottom === 'dress' ? lk.dress : lk.pants; const { at } = J.tor; for (const [u, sd] of [[0.35, 161], [0.62, 162]]) { const h = mid(J.lB.knee, J.lF.knee, u); stroke(ctx, [mid(at(0.05), h, 0.35), mid(at(0.05), h, 0.95)], 0.5, sd, rgba(darken(c, 0.5), 0.5)); } } }
  if (lk.apron) drawApron(ctx, J, lk);
  if (lk.backpack) drawBackpack(ctx, J, lk, 'strap');
  if (lk.scarf) drawScarf(ctx, J, lk, 'front');
  drawHead(ctx, J, lk, ex, st);
  if (bk) drawArm(ctx, J, J.aB, true, lk, hB, 100);
  drawArm(ctx, J, J.aF, false, lk, hF, 180);
  ctx.restore();
  const W = q => [x + q[0] * s * f, y + q[1] * s];
  const b = [x + (f > 0 ? box[0] : -box[2]) * s, y + box[1] * s, x + (f > 0 ? box[2] : -box[0]) * s, y + box[3] * s];
  return { head: W(J.hc), mouth: W(J.HT(J.G.mouth)), eye: W(J.HT(J.G.eyeN)), hands: { front: W(J.aF.hand), back: W(J.aB.hand) }, hand: W(J.aF.hand), bounds: b };
}
// Solved joints in local units (contact at the origin, facing right), for tests, props and lint.
export function skeleton(pose = POSES.stand, params = {}, st = {}) {
  const lk = look(params), M = metrics(lk), J = solve(resolvePose({ ...st, pose }), M, st, lk);
  const leg = l => ({ hip: l.hip, knee: l.knee, ankle: l.ank, heel: l.heel, toe: l.toe });
  return { hip: J.hip, neck: J.neck, head: J.hc, mouth: J.HT(J.G.mouth), front: { leg: leg(J.lF), hand: J.aF.hand }, back: { leg: leg(J.lB), hand: J.aB.hand }, lift: J.lift, seat: J.seat, seatHeight: J.seatH, metrics: M };
}
function bbox(pose = {}, face = 1, params = {}) {
  const lk = look(params), M = metrics(lk), J = solve(resolvePose({ pose, t: 0 }), M, {}, lk), b = extent(J, lk);
  return face < 0 ? [-b[2], b[1], -b[0], b[3]] : b;
}

// ───────────────────────── poses ─────────────────────────
export const mixPose = (a, b, u) => { const p = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k] ?? POSE0[k], y = b[k] ?? POSE0[k]; p[k] = typeof x === 'number' && typeof y === 'number' ? lerp(x, y, u) : (u < 0.5 ? x : y); } return p; };
const P = o => ({ ...POSE0, ...o });
export const POSES = {
  stand: P({}),
  'idle-weight-shift': P({ idle: 1 }),
  'sit-ground': P({ seat: 1, seatH: -1, lean: -0.1, stoop: 0.14, tilt: 0.0, hipF: 1.72, hipB: 1.52, shF: 0.62, elF: 0.8, shB: 0.55, elB: 0.85 }),
  'sit-seat': P({ seat: 1, seatH: 0, lean: 0.0, stoop: 0.06, hipF: 1.52, hipB: 1.45, shF: 0.2, elF: 0.95, shB: 0.28, elB: 0.85 }),
  crouch: P({ lean: 0.62, stoop: 0.1, tilt: -0.5, hipB: 1.95, kneeB: 2.85, ikF: 1, gF: 1, tFx: 0.26, shF: 1.02, elF: 0.55, shB: 0.95, elB: 0.6 }),
  kneel: P({ lean: 0.04, tilt: 0.04, hipB: -0.06, kneeB: 1.64, fB: 1.38, ikF: 1, gF: 1, tFx: 0.62, shF: 0.45, elF: 0.4, shB: 0.08, elB: 0.32 }),
  lie: P({ lean: -1.57, tilt: -0.05, hipF: 1.52, kneeF: 0.12, fF: -1.35, hipB: 1.46, kneeB: 0.3, fB: -1.2, shF: 0.36, elF: -0.48, shB: 0.05, elB: 0.1 }),
  sleep: P({ lean: -1.57, tilt: 0.05, hipF: 2.35, kneeF: 2.1, fF: -0.15, hipB: 1.5, kneeB: 0.25, fB: -1.2, shF: 0.5, elF: -0.42, shB: 0.32, elB: -0.3, sleep: 1 }),
  'look-up': P({ lean: -0.12, stoop: -0.04, tilt: -0.42, shF: -0.12, elF: 0.15, shB: 0.15, elB: 0.18 }),
  'hands-on-hips': P({ lean: -0.04, hipF: -0.12, hipB: 0.16, kneeB: 0.04, shF: -0.72, elF: 1.4, hF: 2, shB: 0.72, elB: -1.42, hB: 2 }),
  'arms-crossed': P({ lean: -0.03, tilt: -0.04, shF: -0.25, elF: 1.86, hF: 2, shB: 0.38, elB: -1.75, hB: 2 }),
  'reach-up': P({ lean: -0.04, tilt: -0.42, ik: 1, tFx: 0.04, tFy: 1, tBx: -0.06, tBy: 1, fF: 0.45, fB: 0.42, pvF: 1, pvB: 1, shF: 2.85, elF: 0.12, hF: 1, shB: 2.6, elB: 0.2, hB: 1 }),
  carry: P({ lean: -0.07, tilt: 0.05, shF: 0.32, elF: 1.05, hF: 1, shB: 0.22, elB: 1.15, hB: 1, bkFront: 1 }),
  'hold-hand-out': P({ lean: 0.04, tilt: 0.02, shF: 1.15, elF: 0.3, hF: 1 }),
};
POSES.sit = POSES['sit-ground'];
POSES.idle = POSES['idle-weight-shift'];

// ───────────────────────── gaits ─────────────────────────
const TAU = Math.PI * 2;
function stepLeg(q, beta, x0, x1, h, swingH, f0, f1) {
  if (q < beta) {                                    // stance: planted, sweeping back at exactly the body speed
    const u = q / beta, x = x0 + (x1 - x0) * u;
    if (u < 0.16) { const k = 1 - u / 0.16; return { x, y: h, f: f1 * k, pv: -k }; }
    if (u > 0.6) { const k = (u - 0.6) / 0.4; return { x, y: h, f: f0 * k * k, pv: 1 }; }
    return { x, y: h, f: 0, pv: 0 };
  }
  const u = (q - beta) / (1 - beta), e = easeInOut(u);
  return { x: x1 + (x0 - x1) * e, y: h - swingH(u), f: lerp(f0, f1, smooth(0.1, 0.95, u)), pv: lerp(1, -1, u) };
}
function walk(ph) {
  ph = ((ph % 1) + 1) % 1;
  const beta = 0.58, h = 0.948 + 0.027 * Math.cos(2 * TAU * (ph - beta / 2)), D = beta * 1.35;
  const sw = u => 0.11 * Math.pow(Math.sin(Math.PI * u), 0.9);
  const a = stepLeg(ph, beta, D / 2, -D / 2, h, sw, 0.6, -0.3), b = stepLeg((ph + 0.5) % 1, beta, D / 2, -D / 2, h, sw, 0.6, -0.3);
  const c = Math.cos(TAU * ph);
  return P({ ik: 1, gait: 1, gyW: 1, gy: h, tFx: a.x, tFy: a.y, fF: a.f, pvF: a.pv, tBx: b.x, tBy: b.y, fB: b.f, pvB: b.pv,
    lean: 0.06, tilt: -0.03 + 0.02 * Math.cos(2 * TAU * ph), shF: -0.42 * c + 0.06, elF: 0.28 + 0.32 * Math.max(0, -c), shB: 0.42 * c + 0.14, elB: 0.28 + 0.32 * Math.max(0, c) });
}
function run(ph) {
  ph = ((ph % 1) + 1) % 1;
  const beta = 0.36, x0 = 0.3, x1 = -0.64;
  const stanceH = q => (q < beta ? 0.87 - 0.05 * Math.sin(Math.PI * q / beta) : null);
  const qa = ph, qb = (ph + 0.5) % 1;
  const air = (qa >= beta && qa < 0.5) || qa >= 0.86;
  const fp = qa >= beta && qa < 0.5 ? (qa - beta) / (0.5 - beta) : qa >= 0.86 ? (qa - 0.86) / 0.14 : 0;
  const h = stanceH(qa) ?? stanceH(qb) ?? 0.87, gy = air ? 0.87 + 0.08 * Math.sin(Math.PI * fp) : h;
  const sw = u => 0.48 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.2);
  const a = stepLeg(qa, beta, x0, x1, gy, sw, 0.95, -0.12), b = stepLeg(qb, beta, x0, x1, gy, sw, 0.95, -0.12);
  const c = Math.cos(TAU * ph);
  return P({ ik: 1, gait: 1, run: 1, gyW: 1, gy, tFx: a.x, tFy: a.y, fF: a.f, pvF: a.pv, tBx: b.x, tBy: b.y, fB: b.f, pvB: b.pv,
    lean: 0.24, tilt: -0.16, shF: -0.75 * c + 0.5, elF: 1.5 + 0.2 * c, hF: 2, shB: 0.75 * c + 0.5, elB: 1.5 - 0.2 * c, hB: 2 });
}
export const GAITS = { walk, run };

// ───────────────────────── gestures ─────────────────────────
const env = (u, a = 0.18, b = 0.2) => smooth(0, a, u) * (1 - smooth(1 - b, 1, u));
const over = (base, key, e) => { const p = { ...POSE0, ...base }; for (const k in key) p[k] = lerp(p[k] ?? 0, key[k], e); return p; };
export const GESTURES = {
  wave: { dur: 1.8, at: (u, b = POSES.stand) => { const e = env(u, 0.14, 0.16), p = over(b, { shF: 3.7, elF: -0.5, hF: 1, tilt: -0.06, joy: 1, shrug: 0.12 }, e); p.elF += 0.42 * Math.sin(TAU * 2.6 * u) * e; p.shF += 0.05 * Math.sin(TAU * 2.6 * u + 1) * e; return p; } },
  nod: { dur: 0.9, at: (u, b = POSES.stand) => { const p = over(b, {}, 0); p.tilt += 0.24 * (0.5 - 0.5 * Math.cos(TAU * 2 * u)); return p; } },
  'shake-head': { dur: 1.1, at: (u, b = POSES.stand) => { const p = over(b, { tilt: 0.06 }, env(u, 0.1, 0.1)); p.turn += -0.42 * Math.sin(TAU * 2.5 * u) * env(u, 0.1, 0.25); return p; } },
  shrug: { dur: 1.2, at: (u, b = POSES.stand) => over(b, { shrug: 1, shF: 0.45, elF: 1.55, hF: 1, shB: 0.32, elB: 1.5, hB: 1, tilt: 0.2, lean: -0.03 }, env(u, 0.3, 0.32)) },
  laugh: { dur: 1.8, at: (u, b = POSES.stand) => { const e = env(u, 0.12, 0.2), p = over(b, { lean: -0.12, tilt: -0.28, shF: 0.35, elF: 1.85, hF: 0, shB: 0.25, elB: 1.6, laugh: 1 }, e); p.lean += 0.04 * Math.sin(TAU * 6 * u) * e; p.tilt += 0.06 * Math.sin(TAU * 6 * u) * e; p.shrug += 0.35 * Math.abs(Math.sin(TAU * 3 * u)) * e; return p; } },
  'jump-for-joy': { dur: 1.3, at: (u, b = POSES.stand) => {
    const p = over(b, {}, 0);
    if (u < 0.22) { const k = Math.sin((Math.PI / 2) * (u / 0.22)); Object.assign(p, over(p, { hipF: 0.85, kneeF: 1.5, hipB: 0.8, kneeB: 1.45, lean: 0.38, tilt: -0.15, shF: -0.35, elF: 0.4, shB: -0.25, elB: 0.4 }, k)); return p; }
    if (u < 0.78) { const v = (u - 0.22) / 0.56, k = Math.sin(Math.PI * v); return over(p, { liftL: 0.62 * k, hipF: 0.75, kneeF: 1.35, hipB: 0.35, kneeB: 1.15, fF: 0.6, fB: 0.6, lean: -0.05, tilt: -0.22, shF: 2.7, elF: 0.15, hF: 1, shB: 2.55, elB: 0.2, hB: 1, joy: 1 }, Math.min(1, v * 4)); }
    const k = 1 - (u - 0.78) / 0.22, sq = Math.sin(Math.PI * k);
    return over(p, { hipF: 0.7, kneeF: 1.3, hipB: 0.65, kneeB: 1.25, lean: 0.28, shF: 1.9, elF: 0.3, shB: 1.7, elB: 0.3, joy: 1 }, sq * 0.8 + k * 0.2);
  } },
  point: { dur: 1.3, at: (u, b = POSES.stand) => over(b, { shF: 1.52, elF: 0.04, hF: 3, lean: 0.05, tilt: -0.05 }, env(u, 0.2, 0.22)) },
  bow: { dur: 1.7, at: (u, b = POSES.stand) => over(b, { lean: 0.85, stoop: 0.12, tilt: 0.28, hipF: 0.2, hipB: 0.12, shF: 1.0, elF: 0.15, shB: 1.08, elB: 0.15 }, env(u, 0.32, 0.35)) },
  gasp: { dur: 1.1, at: (u, b = POSES.stand) => over(b, { lean: -0.1, tilt: -0.14, shrug: 0.6, shF: 0.62, elF: 2.28, hF: 1, shB: 0.52, elB: 2.2, hB: 1, bkFront: 1, gasp: 1 }, env(u, 0.12, 0.3)) },
  beckon: { dur: 1.7, at: (u, b = POSES.stand) => { const e = env(u, 0.15, 0.15), p = over(b, { shF: 0.95, elF: 0.3, hF: 1, tilt: 0.12, joy: 1, lean: 0.03 }, e); p.elF += 0.95 * (0.5 - 0.5 * Math.cos(TAU * 3 * u)) * e; return p; } },
  clap: { dur: 1.4, at: (u, b = POSES.stand) => { const e = env(u, 0.15, 0.15), c = 0.5 - 0.5 * Math.cos(TAU * 4 * u), p = over(b, { shF: 0.95, elF: 1.25, hF: 1, shB: 0.95, elB: 1.2, hB: 1, bkFront: 1, joy: 1 }, e); p.elF -= 0.35 * c * e; p.shF -= 0.12 * c * e; p.elB -= 0.2 * c * e; return p; } },
};

// ───────────────────────── the rig ─────────────────────────
function sizes(params = {}) {
  const lk = look(params), M = metrics(lk), b = bbox(POSES.stand, 1, params);
  return { height: Math.round(-b[1]), headHeight: Math.round(M.headH * 1.2), width: Math.round(M.width), speeds: { walk: Math.round(M.speeds.walk), run: Math.round(M.speeds.run) }, stride: { walk: Math.round(M.stride.walk), run: Math.round(M.stride.run) }, legLength: M.L };
}
const S0 = sizes({});
const rig = {
  kind: 'human', label: 'Human',
  height: S0.height, headHeight: S0.headHeight, width: S0.width,
  params: Object.fromEntries(Object.entries(DEFAULTS)),
  speeds: S0.speeds, stride: S0.stride,
  poses: POSES, gaits: GAITS, gestures: GESTURES,
  expressions: Object.keys(EXPR),
  perch: false, flies: false,
  draw, bbox,
  sizes,                                             // per-actor framing/locomotion numbers: sizes(params) → { height, headHeight, width, speeds, stride }
  mixPose,
};
export default rig;

// ───────────────────────── review sheet ─────────────────────────
export const SAMPLE_CAST = [
  { label: 'child', age: 'child' },
  { label: 'child dress', age: 'child', hairStyle: 'ponytail', hair: '#7a4a2a', bottom: 'dress', dress: '#6fb38a', shoes: '#c0504a', skin: '#f6d6bf' },
  { label: 'child curly', age: 'child', hairStyle: 'curly', hair: '#1f1a1a', skin: '#a8714e', shirt: '#f2c94c', pants: '#4a4a5e', bottom: 'shorts', backpack: '#b06a3a' },
  { label: 'teen', age: 'teen', scarf: '#c8443a' },
  { label: 'teen long', age: 'teen', hairStyle: 'long', hair: '#2a1e1a', skin: '#d9a17e', shirt: '#9a6ab0', bottom: 'skirt', pants: '#3a3a5a', build: 'slim' },
  { label: 'adult', age: 'adult', beard: 'short' },
  { label: 'adult sturdy', age: 'adult', build: 'sturdy', hairStyle: 'cap', hat: '#3f6fb0', beard: 'full', hair: '#7a3a1e', shirt: '#c8643a', pants: '#3e4a5e' },
  { label: 'adult bun', age: 'adult', hairStyle: 'bun', hair: '#3a2420', skin: '#8a5a3e', bottom: 'dress', dress: '#d9894a', apron: '#f2ede2' },
  { label: 'elder', age: 'elder', glasses: true },
  { label: 'elder bald', age: 'elder', hairStyle: 'bald', beard: 'full', build: 'sturdy', hat: false, shirt: '#7a8a6a' },
  { label: 'elder hat', age: 'elder', hairStyle: 'long', hair: '#e8e4dc', hat: '#c8a85a', bottom: 'skirt', pants: '#6a4a6a', shirt: '#d8c8a8', glasses: '#8a5a3a' },
];
export async function humanSheet(outPath, { sections = ['cast', 'poses', 'gaits', 'gestures', 'faces'], width = 2600 } = {}) {
  const pages = sections.map(s => sheetSection(s, width));
  const H = pages.reduce((a, c) => a + c.height, 0), [cv, x] = canvas(width, H);
  let y = 0; for (const c of pages) { x.drawImage(c, 0, y); y += c.height; }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, await cv.encode('jpeg', 90));
  return outPath;
}
export function sheetSection(name, width = 2600) {
  const P0 = { age: 'child' };
  const rows = [];
  const fig = (label, opts) => ({ label, ...opts });
  if (name === 'cast') rows.push({ title: 'cast — ages, builds, hair, clothes, accessories', s: 1.55, h: 430, items: SAMPLE_CAST.map(c => fig(c.label, { params: c, st: { expr: 'happy', t: 0.4 } })) });
  if (name === 'poses') for (const age of ['child', 'adult', 'elder']) {
    rows.push({ title: `poses — ${age}`, s: age === 'child' ? 1.25 : 1.0, h: 330, items: Object.keys(POSES).filter(k => k !== 'sit' && k !== 'idle').map(k => fig(k, { params: { ...SAMPLE_CAST[age === 'child' ? 1 : age === 'adult' ? 5 : 8] }, st: { pose: POSES[k], t: 1.3, expr: k === 'sleep' ? 'sleepy' : 'neutral' }, seat: k === 'sit-seat' })) });
  }
  if (name === 'gaits') for (const [g, age, idx] of [['walk', 'child', 0], ['walk', 'adult', 5], ['walk', 'elder', 8], ['run', 'child', 2], ['run', 'adult', 6]]) {
    const n = 8;
    rows.push({ title: `${g} — ${age} (phases 0..7/8)`, s: age === 'child' ? 1.3 : 1.0, h: 320, items: Array.from({ length: n }, (_, i) => fig(`${i}/${n}`, { params: SAMPLE_CAST[idx], st: { pose: GAITS[g](i / n), t: i * 0.1, expr: 'happy' }, stride: true })) });
  }
  if (name === 'gestures') for (const age of ['child', 'adult']) {
    const items = [];
    for (const k of Object.keys(GESTURES)) for (const u of [0.3, 0.55]) items.push(fig(`${k} ${u}`, { params: SAMPLE_CAST[age === 'child' ? 0 : 7], st: { pose: GESTURES[k].at(u, POSES.stand), t: u } }));
    rows.push({ title: `gestures — ${age}`, s: age === 'child' ? 1.15 : 0.92, h: 320, items, cw: 112 });
  }
  if (name === 'faces') for (const idx of [0, 4, 6, 9]) {
    const items = Object.keys(EXPR).map(e => fig(e, { params: SAMPLE_CAST[idx], st: { expr: e, t: 0 }, face: true }));
    for (const tk of [0.5, 1]) items.push(fig(`talk ${tk}`, { params: SAMPLE_CAST[idx], st: { expr: 'neutral', talk: tk }, face: true }));
    items.push(fig('blink', { params: SAMPLE_CAST[idx], st: { blink: 1 }, face: true }));
    items.push(fig('look -1', { params: SAMPLE_CAST[idx], st: { look: -1 }, face: true }));
    rows.push({ title: `faces — ${SAMPLE_CAST[idx].label} (close-up)`, h: 250, items, cw: 205, face: true });
  }
  const H = rows.reduce((a, r) => a + r.h + 34, 10), [c, x] = canvas(width, H);
  x.fillStyle = '#f3ead8'; x.fillRect(0, 0, width, H);
  let y = 6;
  for (const r of rows) {
    x.fillStyle = '#2a2130'; x.font = 'bold 20px sans-serif'; x.fillText(r.title, 14, y + 22);
    const cw = r.cw || Math.min(240, Math.floor((width - 20) / r.items.length));
    r.items.forEach((it, i) => {
      const cx = 10 + i * cw + cw / 2, top = y + 30;
      x.save(); x.beginPath(); x.rect(cx - cw / 2 + 2, top, cw - 4, r.h); x.clip();
      x.fillStyle = i % 2 ? '#efe4cc' : '#f6eedc'; x.fillRect(cx - cw / 2, top, cw, r.h);
      if (r.face) {
        const M = metrics(look(it.params)), s = (r.h * 0.5) / M.headH, J = solve(POSES.stand, M, {}, look(it.params));
        const fx = cx - J.hc[0] * s - 6, fy = top + r.h * 0.5 - J.hc[1] * s;
        draw(x, fx, fy, s, 1, { ...it.st, params: it.params, shadow: false });
      } else {
        const gy = top + r.h - 26;
        x.fillStyle = '#d8ccb0'; x.fillRect(cx - cw / 2, gy, cw, 2);
        if (it.seat) { x.fillStyle = '#9a7a5a'; const sh = (POSES['sit-seat'] ? metrics(look(it.params)).shin + metrics(look(it.params)).ankle + 2 : 0) * r.s; x.fillRect(cx - 34 * r.s, gy - sh, 50 * r.s, sh); x.fillStyle = '#7a5a40'; x.fillRect(cx - 38 * r.s, gy - sh, 58 * r.s, 5 * r.s); draw(x, cx, gy - sh, r.s, 1, { ...it.st, params: it.params }); }
        else draw(x, cx, gy, r.s, 1, { ...it.st, params: it.params });
      }
      x.restore();
      x.fillStyle = '#5a4a5a'; x.font = '13px sans-serif'; x.fillText(it.label, cx - cw / 2 + 6, top + r.h - 6);
    });
    y += r.h + 34;
  }
  return c;
}
