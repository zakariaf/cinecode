// Human rig: a parametric storybook person (child / teen / adult / elder) in a 3/4 side view.
// (x, y) passed to draw() is the contact point: the ground under the feet, or the seat surface for
// 'sit-seat' (the feet are then planted `seatHeight` units below it, or dangle if the legs are too short).
// Poses are plain numeric objects; legs can be posed by angles or by IK foot targets (ik = 0..1),
// which is how the gaits keep the stance foot planted. Everything is deterministic.
// Every pose field blends continuously (seat, ground snaps, plants, the seated dangle), so mixPose never pops; mixPose
// routes a direct sit ↔ stand blend through a crouch so the body leans over its feet as it rises or lowers.
// Feet that carry weight don't skate: `anchor` holds each planted foot where the standing pose puts it (the hip moves
// instead, `hxL`), so stand → crouch is a squat over fixed feet and a seated person's hips sit behind the contact point
// (the contact is where her feet will stand when she gets up). Hands rest on the floor, never through it.
// Round 2 (DESIGN §9.2): hairStyle 'braids'; glasses: true | frame colour (one glint on the near lens); tear 0..1
// (one wet highlight on each lower lid); build 'slight'; shoes null = barefoot; skirts use the `dress` colour when
// given; hem (skirt/dress length, 1 = knee, 2 = ankle; elders default long); dressStyle 'smock' (children) | 'fitted';
// scarfLength (the ends are absolute units, so a child in an adult's scarf trails it in the grass; fringed ends);
// st.tilt -1..1 head pitch (+1 up, the eyes follow); draw(null, …) returns anchors and bounds without drawing;
// jump-for-joy sets pose.lift (units).
// Round 3 (the painted look at every zoom): top 'shirt' | 'cardigan' (elders' default: an open knit cardigan in the
// `shirt` colour, button bands, buttons, patch pocket, ribbed hem, worn over `under`, which defaults to the dress colour);
// arms are shaped sleeves (deltoid, elbow, fuller knit / smock sleeves) with folds in the crook of the elbow, a ribbed
// cuff, a bare wrist and a mitten with its own thumb, and they throw a shadow on the cloth behind them; clothes turn with
// a broad lavender shadow side (CLOTH) instead of a thin rim; hair pulled into a bun is combed back into a coiled bun;
// fringed scarf ends; skeleton() also returns each arm's shoulder / elbow / wrist; clothes() returns the garment outlines.
// Round 4: `point` aims (pose.aim; GESTURES.point.at(u, base, { to })): with no `to` it follows the eyeline (st.tilt on the
// film's scale, a lowered gaze resting on the ground), else 'up' | 'sky' | 'ahead' | 'down', an elevation (radians) or a
// target point [x, y] (units from the contact point, facing right); the body leans into it and a child points up
// elbow-first so the arm never crosses her face; 'point-up' / 'point-down' name the aims for storyboards. st.look is in
// screen direction (multiplied by face, as the other rigs do). The bun is combed hair with a soft, bundled hairline,
// an off-centre coil at the back of the crown with a hairpin, and loose wisps at the temple and nape.
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
const SHADE = '#c3b8dc', CLOTH = '#ab9fcb';          // CLOTH: the deeper lavender of the broad shadow on clothes
const NAMED = { red: '#c8443a', blue: '#3f6fb0', green: '#4f8a46', yellow: '#f2c94c', orange: '#e0703a', pink: '#e89ab0', purple: '#7a5a9a', brown: '#7a5236', black: '#2a2428', white: '#f4f1ea', grey: '#8a8a8e', gray: '#8a8a8e', blonde: '#e0b866', ginger: '#c0602e', navy: '#2f3f6a', teal: '#3a8a8a', cream: '#efe4c8',
  // materials (glasses frames, buckles) and storybook cloth colours
  brass: '#b08a3a', gold: '#c9a227', silver: '#a9adb3', copper: '#b8693a', bronze: '#8c6a3a', tortoiseshell: '#6a4026', steel: '#6e747c',
  moss: '#5e7b3f', olive: '#6b6b32', ochre: '#d9a441', mustard: '#d0a535', rust: '#a8502a', tan: '#c8a47a', beige: '#d8c8a8', khaki: '#b5a77a', maroon: '#6e2a30', plum: '#6a3a5a', lavender: '#a898c8', sky: '#8ab8dc', charcoal: '#3a3a40', ivory: '#f2ecdc' };
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
function cel(ctx, P, col, w = 1.1, seed = 1, sh = SH, shade = SHADE) {
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-900, -900, 1800, 1800);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = shade;
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
// Tapered limb outline between joints with half-widths w1, w2 (rounded caps), as one smooth closed curve. Sampled
// directly with even spacing: a spline over dense caps and long sides overshoots into tiny loops where they meet,
// which the ink turns into spikes on bent knees and elbows.
function capsule(a, b, w1, w2, seed = 0, jit = 0.25) {
  const d = sub(b, a), L = len(d) || 1e-3, t = mul(d, 1 / L), n = [-t[1], t[0]], P = [];
  const cap = (c, w, q0) => { for (let i = 0; i <= 12; i++) { const q = q0 + (i / 12) * Math.PI; P.push(add(c, add(mul(t, -Math.cos(q) * w * 0.9), mul(n, Math.sin(q) * -w)))); } };
  const side = (p, q) => { const m = Math.max(1, Math.round(len(sub(q, p)) / 2.5)); for (let i = 1; i < m; i++) P.push(mid(p, q, i / m)); };
  cap(b, w2, Math.PI / 2); side(P[P.length - 1], add(a, mul(n, w1)));
  cap(a, w1, -Math.PI / 2); side(P[P.length - 1], P[0]);
  return wobble(P, seed, jit);
}
// A capsule whose half-width follows a profile wf(u), u 0..1 from a to b: a deltoid, a forearm swell, a sleeve that
// blouses before its cuff. prof([[u, w], …]) builds a smooth piecewise profile.
function limb(a, b, wf, seed = 0, jit = 0.25) {
  const d = sub(b, a), L = len(d) || 1e-3, t = mul(d, 1 / L), n = [-t[1], t[0]], m = Math.max(3, Math.round(L / 2.2)), P = [];
  const cap = (c, w, q0) => { for (let i = 0; i <= 12; i++) { const q = q0 + (i / 12) * Math.PI; P.push(add(c, add(mul(t, -Math.cos(q) * w * 0.9), mul(n, Math.sin(q) * -w)))); } };
  cap(b, wf(1), Math.PI / 2);
  for (let i = m - 1; i >= 1; i--) P.push(add(mid(a, b, i / m), mul(n, wf(i / m))));
  cap(a, wf(0), -Math.PI / 2);
  for (let i = 1; i < m; i++) P.push(add(mid(a, b, i / m), mul(n, -wf(i / m))));
  return wobble(P, seed, jit);
}
const prof = K => u => { let i = 1; while (i < K.length - 1 && K[i][0] < u) i++; return lerp(K[i - 1][1], K[i][1], smooth(K[i - 1][0], K[i][0], u)); };
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
  tear: 0, hem: null, scarfLength: 1, dressStyle: null, top: 'shirt', under: null,
};
const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun', 'braids', 'curly', 'bald', 'cap'];
const ACCESSORY = { scarf: '#c8443a', glasses: '#3a2e2a', hat: '#d8b04a', apron: '#f2ede2', backpack: '#b06a3a' };   // default colours
const OFF = new Set([undefined, null, false, 0, '', 'none', 'no', 'false', 'off']);
// Default hem (1 = knee, 2 = ankle) per age for skirt / dress: elders wear them long.
const HEM = { child: [0.82, 1.06], teen: [0.85, 1.08], adult: [1.12, 1.2], elder: [1.62, 1.62] };
const AGE_LOOK = {
  child: { hairStyle: 'short', bottom: 'shorts', shirt: '#e0703a', pants: '#3d5a8a' },
  teen: { hairStyle: 'ponytail', bottom: 'trousers', shirt: '#5a8fc8', pants: '#3a3a4e', hair: '#5a3a22' },
  adult: { hairStyle: 'short', bottom: 'trousers', shirt: '#6f9a6a', pants: '#5a4a3e', hair: '#3a2a20', shoes: '#4a3428' },
  elder: { hairStyle: 'short', bottom: 'trousers', shirt: '#b8a07a', pants: '#5e5a66', hair: '#dedad2', shoes: '#4a3a32', skin: '#ecc5a6', top: 'cardigan' },
};
// Proportions as fractions of standing height H. head = chin-to-crown; leg = hip joint to sole.
const AGES = {
  child: { H: 140, head: 0.27, neck: 0.008, torso: 0.33, leg: 0.42, chest: 0.235, waist: 0.225, hipW: 0.23, upArm: 0.152, foreArm: 0.128, hand: 0.05, foot: 0.155, limbK: 1.2, belly: 0.3, eye: 1.18, stoop: 0, walk: 1.32, run: 2.4, cad: [1.18, 1.7], jaw: 0 },
  teen: { H: 184, head: 0.205, neck: 0.025, torso: 0.32, leg: 0.47, chest: 0.205, waist: 0.16, hipW: 0.17, upArm: 0.178, foreArm: 0.148, hand: 0.05, foot: 0.15, limbK: 0.95, belly: 0, eye: 1.06, stoop: 0, walk: 1.35, run: 2.6, cad: [0.98, 1.45], jaw: 0.6 },
  adult: { H: 215, head: 0.18, neck: 0.032, torso: 0.31, leg: 0.49, chest: 0.215, waist: 0.165, hipW: 0.175, upArm: 0.185, foreArm: 0.152, hand: 0.05, foot: 0.15, limbK: 1, belly: 0.15, eye: 1, stoop: 0, walk: 1.35, run: 2.6, cad: [0.95, 1.4], jaw: 1 },
  elder: { H: 205, head: 0.185, neck: 0.026, torso: 0.31, leg: 0.49, chest: 0.21, waist: 0.18, hipW: 0.18, upArm: 0.18, foreArm: 0.15, hand: 0.05, foot: 0.15, limbK: 0.95, belly: 0.35, eye: 0.98, stoop: 0.22, walk: 1.08, run: 1.7, cad: [0.82, 1.2], jaw: 0.9 },
};
// h: height factor (a slight person is a little smaller as well as narrower)
const BUILD = { slight: { w: 0.8, limb: 0.8, belly: -0.25, h: 0.97 }, slim: { w: 0.86, limb: 0.86, belly: -0.15 }, average: { w: 1, limb: 1, belly: 0 }, sturdy: { w: 1.17, limb: 1.15, belly: 0.45 } };

export function look(params = {}) {
  const age = AGES[params.age] ? params.age : DEFAULTS.age;
  const p = { ...DEFAULTS, ...AGE_LOOK[age], ...params, age };
  if (!BUILD[p.build]) p.build = 'average';
  const bare = p.shoes === null || p.shoes === false || p.shoes === 'none';
  for (const k of ['skin', 'eyes', 'hair', 'shirt', 'pants', 'socks']) p[k] = normHex(p[k], normHex(DEFAULTS[k]));
  p.shoes = bare ? null : normHex(p.shoes, normHex(DEFAULTS.shoes));
  const dress = p.dress ? normHex(p.dress) : null;
  p.dress = dress ?? p.shirt;
  p.skirt = dress ?? p.pants;                          // a skirt takes the `dress` colour when one is given
  // accessories: true = the default colour, a colour = that colour (an unknown name falls back to the default, not
  // grey), and false / null / 'none' = not worn (as shoes 'none' = barefoot)
  for (const [k, c] of Object.entries(ACCESSORY)) p[k] = OFF.has(p[k]) ? false : p[k] === true ? c : normHex(p[k], c);
  if (age === 'child' || age === 'teen') p.beard = 'none';
  if (!['none', 'short', 'full'].includes(p.beard)) p.beard = 'none';
  if (!HAIR_STYLES.includes(p.hairStyle)) p.hairStyle = 'short';
  if (!['trousers', 'shorts', 'skirt', 'dress'].includes(p.bottom)) p.bottom = 'trousers';
  p.height = clamp(+p.height || 1, 0.6, 1.5);
  p.tear = clamp(+p.tear || 0, 0, 1);
  p.scarfLength = clamp(+p.scarfLength || 1, 0.4, 2.5);
  p.hem = p.hem != null && Number.isFinite(+p.hem) ? clamp(+p.hem, 0.4, 1.95) : HEM[age][p.bottom === 'dress' ? 1 : 0];
  if (!['smock', 'fitted'].includes(p.dressStyle)) p.dressStyle = age === 'child' ? 'smock' : 'fitted';   // a smock hangs loose from a yoke
  // top 'cardigan' (elders' default): an open knit cardigan in the `shirt` colour over `under` (default: the dress
  // colour when one is given, else a pale blouse)
  if (!['shirt', 'cardigan'].includes(p.top)) p.top = 'shirt';
  p.under = p.under ? normHex(p.under, dress ?? '#efe6d2') : dress ?? mixC(p.shirt, '#f4efe2', 0.6);
  p.__look = true;
  return p;
}

// Absolute metrics for a look: every length in units at scale 1.
export function metrics(params = {}) {
  const lk = params.__look ? params : look(params), A = AGES[lk.age], B = BUILD[lk.build], H = A.H * lk.height * (B.h || 1);
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
//  seat 0..1: weight of sitting on a surface at the contact point (blends continuously); seatH: ground distance below the seat (0 = knee height)
//  plF / plB 0..1: plant weight — that foot's sole is pulled onto the floor by IK after the ground is found (feet never float)
//  anchor 0..1: weight of holding each planted foot (× plF / plB) at its rest stance — where `stand` puts it, the hip over
//    the contact point — pivoting on the toe when the heel is up; the legs reach it by IK
//  bkFront: 1 = far arm drawn in front of the torso; lift: units off the ground; idle: weight-shift sway; gait: 0..1 walking weight
//  laugh / gasp / sleep / joy: face hints for gestures and poses; hx: hip shift (units); hxL: hip shift (leg lengths)
//  aim 0..1: weight of the near arm pointing, nearly straight, along an aim solved at draw time: the elevation aimE
//    (radians above the horizontal), plus with aimG the eyeline's pitch (st.tilt × EYE_PITCH), or with aimT the target point
//    (aimX, aimY) in units from the contact point, facing right, y down (see GESTURES.point)
export const POSE0 = {
  lean: 0.02, stoop: 0, tilt: 0, turn: 0, shrug: 0, hx: 0, hxL: 0, anchor: 0,
  hipF: -0.04, kneeF: 0.05, fF: 0, hipB: 0.07, kneeB: 0.04, fB: 0,
  shF: -0.07, elF: 0.34, hF: 0, shB: 0.1, elB: 0.34, hB: 0, bkFront: 0,
  ik: 0, ikF: 0, ikB: 0, tFx: 0.06, tFy: 1, tBx: -0.05, tBy: 1, pvF: 0, pvB: 0, gF: 0, gB: 0, gy: 0, gyW: 0, liftL: 0, run: 0, plF: 1, plB: 1,
  seat: 0, seatH: 0, lift: 0, idle: 0, gait: 0, laugh: 0, gasp: 0, sleep: 0, joy: 0,
  aim: 0, aimE: 0, aimG: 0, aimT: 0, aimX: 0, aimY: 0,
};
// Pointing elevations (radians above the horizontal) for named aims, and EYE_PITCH: the eyeline pitch of a full head
// tilt (st.tilt ±1), the film's scale (a look at an actor sets st.tilt = the head-to-head line's pitch / 0.8 rad), so a
// point that follows the gaze aims along the eyeline: at the sky, or down at the animal at her feet.
const AIM = { up: 0.75, sky: 0.75, ahead: 0, down: -0.42 }, EYE_PITCH = 0.8;
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
  // a point's elevation (see the aimed arm below; a target's from a rough shoulder height), and the body leaning into
  // it: forward over a point down at the ground (the arm clears the knees), a little back under one at the sky
  const wA = clamp(p.aim);
  let eA = p.aimE + clamp(p.aimG) * EYE_PITCH * clamp(st.tilt || 0, -1, 1);
  if (wA > 0) {
    const shY = -(M.torso * 0.9 + lerp(M.L * 0.95, M.buttR, clamp(p.seat)));
    const e = p.aimT > 0 ? lerp(eA, Math.atan2(shY - p.aimY, Math.max(1, p.aimX)), clamp(p.aimT)) : eA;
    p.lean += wA * (e < 0 ? 0.22 * clamp(-e / 0.6) : -0.06 * clamp(e / 0.8));
  }
  const br = 0.5 - 0.5 * Math.cos(2 * Math.PI * (st.breath || 0));
  const lean = p.lean, a2 = lean + p.stoop + M.stoop * (1 - p.seat * 0.3), T = M.torso * (1 + 0.012 * br);
  const fwd = a => [Math.cos(a), Math.sin(a)];
  const hip = [p.hx + p.hxL * M.L, 0], chest = add(hip, mul(upv(lean), T * 0.5)), neck = add(chest, mul(upv(a2), T * 0.5));
  const shC = add(neck, mul(upv(a2), -T * 0.12 + p.shrug * T * 0.1 + br * 0.4));
  const shN = add(shC, mul(fwd(a2), -0.15 * M.chest)), shFar = add(shC, mul(fwd(a2), 0.24 * M.chest));
  const ar = -(lean + p.stoop);                     // arms turn with the torso (an elder's stoop leaves them hanging)
  const arm = (S, sa, ea) => { const el = add(S, mul(down(ar + sa), M.upArm)), wr = add(el, mul(down(ar + sa + ea), M.foreArm)); return { sh: S, el, wr, dir: ar + sa + ea }; };
  const aF = arm(shN, p.shF, p.elF), aB = arm(shFar, p.shB, p.elB);
  aF.hand = add(aF.wr, mul(down(aF.dir), M.hand * 0.75)); aB.hand = add(aB.wr, mul(down(aB.dir), M.hand * 0.75));
  const hipN = add(hip, mul(fwd(lean), -0.14 * M.hipW)), hipFar = add(hip, mul(fwd(lean), 0.16 * M.hipW));
  const footOff = [[-0.24 * M.foot, M.ankle], [0.76 * M.foot, M.ankle]];         // heel, toe relative to the ankle (flat)
  const w = clamp(p.seat), seat = w >= 0.5;
  const seatH = st.seatHeight ?? (p.seatH < 0 ? 0 : p.seatH || (M.shin + M.ankle + 2));
  const mkLeg = (Hj, hipA, shinA, fa, ha) => {
    const knee = add(Hj, mul(down(hipA), M.thigh)), ank = add(knee, mul(down(shinA), M.shin));
    return { hip: Hj, knee, ank, heel: add(ank, rot(footOff[0], fa)), toe: add(ank, rot(footOff[1], fa)), fa, hipA, shinA, ha };
  };
  const leg = (Hj, ha, ka, fa, tx, ty, pv, side, ikw) => {
    if (M.age === 'elder') { ha += 0.05 * (1 - w); ka += 0.12 * (1 - w); }
    let hipA = ha, shinA = ha - ka;
    if (ikw > 0) {
      const A0 = add(Hj, [tx * M.L, ty * M.L - M.ankle]);
      const o = pv >= 0 ? footOff[1] : footOff[0], tgt = add(A0, mul(sub(o, rot(o, fa)), Math.abs(pv)));
      const kn = ik2(Hj, tgt, M.thigh, M.shin, 1);
      hipA = lerp(ha, angDown(sub(kn, Hj)), ikw); shinA = lerp(ha - ka, angDown(sub(tgt, kn)), ikw);
    }
    return mkLeg(Hj, hipA, shinA, fa, ha);
  };
  const gk = p.run ? AGES[M.age].run / 2.6 : AGES[M.age].walk / 1.35, sx = p.gyW > 0 ? lerp(1, gk, clamp(p.gyW)) : 1;   // per-age stride
  const mkF = ty => leg(hipN, p.hipF, p.kneeF, p.fF, p.tFx * sx, ty, p.pvF, 1, Math.max(p.ik, p.ikF));
  const mkB = ty => leg(hipFar, p.hipB, p.kneeB, p.fB, p.tBx * sx, ty, p.pvB, -1, Math.max(p.ik, p.ikB));
  let lF = mkF(p.tFy), lB = mkB(p.tBy);

  // head; st.tilt pitches it (+1 = chin up as far as a person comfortably can, -1 = down) and the eyes follow (see drawHead)
  const tu = clamp(st.tilt || 0, -1, 1), pitch = tu > 0 ? -0.62 * tu : -0.42 * tu;
  const yaw = clamp(BASE_YAW + p.turn + 0.3 * (st.look || 0), 0.12, 1.3), G = headGeo(M, yaw), k = M.k;
  const th = a2 + p.tilt + pitch - M.stoop * 0.85 + (st.look ? 0.04 * st.look : 0);
  const nTop = add(neck, mul(upv(a2 + (p.tilt + pitch) * 0.35 - M.stoop * 0.4), M.neck + k * 0.1));
  const hc = sub(nTop, rot(mul(G.neck, k), th));
  const HT = q => add(hc, rot(mul(q, k), th));
  const headPts = spline(G.CP, 5).map(HT);

  // ground: the lowest of every part that could touch it (soles, knees, seat, back, head, hands)
  const legC = l => [l.heel, l.toe, add(l.knee, [0, M.kneeW])];
  const body = [add(hip, [0, M.buttR]), add(hip, mul(fwd(lean), -0.45 * M.hipW)), add(aF.hand, [0, M.hand * 0.6]), add(aB.hand, [0, M.hand * 0.6]),
    add(shN, mul(fwd(a2), -0.36 * M.chest)), add(chest, mul(fwd(lean), -0.5 * M.chest)), ...headPts];
  const maxY = P => Math.max(...P.map(c => c[1]));
  const sF = clamp(p.gF) * (1 - w), sB = clamp(p.gB) * (1 - w);
  if (sF > 0 || sB > 0) {                            // a snapping foot targets the ground the rest of the body defines
    const g0 = maxY([...body, ...(sF > 0 ? [] : legC(lF)), ...(sB > 0 ? [] : legC(lB))]);
    if (sF > 0) lF = mkF(lerp(p.tFy, (g0 - hipN[1]) / M.L, sF));
    if (sB > 0) lB = mkB(lerp(p.tBy, (g0 - hipFar[1]) / M.L, sB));
  }
  // ground: the lowest point, pulled toward an explicit hip height (gy) and toward the seat (the butt on the contact)
  let g = maxY([...body, ...legC(lF), ...legC(lB)]);
  if (p.gyW > 0) g = lerp(g, hip[1] + (p.gy / p.gyW) * M.L, clamp(p.gyW));
  if (w > 0) g = lerp(g, hip[1] + M.buttR, w);
  // plant: pull each planted sole onto the floor (seated feet always reach for it; out of reach on a seat, they dangle),
  // and hold an anchored foot at its rest stance: the ankle x `stand` gives it (same arithmetic, so stand is unchanged).
  const floor = g + w * seatH, R = M.thigh + M.shin;
  const restX = (side, ha, ka) => {
    if (M.age === 'elder') { ha += 0.05; ka += 0.12; }
    const Hj = mul(fwd(POSE0.lean), side > 0 ? -0.14 * M.hipW : 0.16 * M.hipW);
    return add(add(Hj, mul(down(ha), M.thigh)), mul(down(ha - ka), M.shin))[0];
  };
  const plant = (l, pl0, side) => {
    const lock = clamp(p.anchor) * clamp(pl0), pl = Math.max(clamp(pl0), w);
    if (pl <= 0 && lock <= 0) return l;
    const d = (floor - Math.max(l.heel[1], l.toe[1])) * pl;
    let tx = l.ank[0];
    if (lock > 0) {                                   // the end of the foot on the floor stays put: the toe once the heel lifts
      const o = footOff[l.fa >= 0 ? 1 : 0], ax = (side > 0 ? restX(1, POSE0.hipF, POSE0.kneeF) : restX(-1, POSE0.hipB, POSE0.kneeB)) + o[0] - rot(o, l.fa)[0];
      tx = lerp(tx, ax, lock);
    }
    if (Math.abs(d) < 0.01 && Math.abs(tx - l.ank[0]) < 0.01) return l;
    const tgt = [tx, l.ank[1] + d], kn = ik2(l.hip, tgt, M.thigh, M.shin, 1);
    let hipA = angDown(sub(kn, l.hip)), shinA = angDown(sub(tgt, kn)), fa = l.fa;
    // a floor out of reach from a seat: the legs dangle, weighted by the seat and by how far out of reach (no switch)
    const dg = w * clamp((len(sub(tgt, l.hip)) - R * 0.995) / (R * 0.1));
    if (dg > 0) {
      hipA = lerp(hipA, l.ha, dg); fa = lerp(fa, 0.5, dg);
      shinA = lerp(shinA, 0.18 + 0.12 * Math.sin((st.t || 0) * 2.1 + side * 1.7) - (l.ha - 1.5) * 0.3, dg);
    }
    return mkLeg(l.hip, hipA, shinA, fa, l.ha);
  };
  lF = plant(lF, p.plF, 1); lB = plant(lB, p.plB, -1);
  const lift = (p.lift || 0) + (p.liftL || 0) * M.L + (st.lift || 0);
  // an aimed point (pose.aim): the near arm swings from where the pose holds it to point nearly straight along the aim,
  // an absolute direction (pointing at the sky stays pointing at the sky whatever the body does), so the shoulder→hand
  // line runs along the aim and the finger carries on along it
  if (wA > 0) {
    let D = Math.PI / 2 + eA;                                                      // from straight down, + forward
    // a lowered gaze rests on something on the ground along the eyeline: the arm aims at that spot from the shoulder,
    // which sits below the eyes, so its line is shallower (a gaze at the sky or level keeps the eyeline's direction)
    if (eA < 0 && p.aimG > 0) {
      const eye = HT(G.eyeN), d = Math.max(0, floor - M.ankle - eye[1]) / Math.sin(-eA);
      D = lerp(D, angDown(sub([eye[0] + d * Math.cos(eA), floor - M.ankle], shN)), clamp(p.aimG));
    }
    if (p.aimT > 0) D = lerp(D, angDown(sub([p.aimX, p.aimY + g + lift], shN)), clamp(p.aimT));   // target: local → solve space
    D = clamp(D, 0.25, 3.0);                                                       // never back across the body
    // the upper arm passes under the face (clear of the jaw by the sleeve) and the elbow bends so the forearm and finger
    // still carry the aim: a child's big head sits low over her shoulder, so she points up at the sky elbow-first
    let cap = Infinity;
    for (const i of [3, 4, 5]) {                                                  // cheek, jaw, chin front (not under the chin)
      const v = sub(HT(G.CP[i]), shN), d = len(v);
      if (v[0] > 0) cap = Math.min(cap, Math.PI / 2 + Math.atan2(-v[1], v[0]) - Math.asin(clamp((M.armW * 1.15) / d)));
    }
    const el = 0.14, Ua = Math.min(D - (el * M.foreArm) / (M.upArm + M.foreArm), cap), a = arm(shN, lerp(p.shF, Ua - ar, wA), lerp(p.elF, Math.max(el, D - Ua), wA));
    a.hand = add(a.wr, mul(down(a.dir), M.hand * 0.75)); Object.assign(aF, a);
  }
  // hands rest on the floor, never through it (a gy / seat ground can lie above a reaching hand): lift the wrist by IK
  for (const a of [aF, aB]) {
    const over = a.hand[1] + M.hand * 0.6 - floor;
    if (over <= 0) continue;
    const wr = [a.wr[0], a.wr[1] - over], cr = (a.wr[0] - a.sh[0]) * (a.el[1] - a.sh[1]) - (a.wr[1] - a.sh[1]) * (a.el[0] - a.sh[0]);
    a.el = ik2(a.sh, wr, M.upArm, M.foreArm, cr > 0 ? -1 : 1); a.wr = wr; a.hand = [a.hand[0], a.hand[1] - over];
  }
  const dy = -g - lift, mv = q => [q[0], q[1] + dy];
  const J = {
    p, M, G, yaw, th, k, lift, seat, w, seatH, br, lean, a2, T, tu,
    hip: mv(hip), chest: mv(chest), neck: mv(neck), shC: mv(shC), nTop: mv(nTop), hc: mv(hc),
    HT: q => mv(HT(q)), headPts: headPts.map(mv),
    aF: Object.fromEntries(Object.entries(aF).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    aB: Object.fromEntries(Object.entries(aB).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    lF: Object.fromEntries(Object.entries(lF).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
    lB: Object.fromEntries(Object.entries(lB).map(([kk, v]) => [kk, Array.isArray(v) ? mv(v) : v])),
  };
  J.t = st.t || 0;
  return J;
}

// Extent of the figure in local units (contact at the origin, facing right).
function extent(J, lk) {
  const { M } = J, xs = [], ys = [];
  const put = (q, r = 0) => { xs.push(q[0] - r, q[0] + r); ys.push(q[1] - r, q[1] + r); };
  const hv = { short: 0.12, long: 0.14, ponytail: 0.1, bun: 0.1, braids: 0.08, curly: 0.26, bald: 0.03, cap: 0.14 }[lk.hairStyle] ?? 0.12;
  J.headPts.forEach(q => put(q, hv * J.k));
  for (const l of [J.lF, J.lB]) { put(l.knee, M.kneeW); put(l.heel, 2); put(l.toe, 3); put(l.hip, M.thighW); }
  for (const a of [J.aF, J.aB]) { put(a.el, M.elbowW * 1.5); put(mid(a.el, a.wr, 0.45), M.elbowW * 1.5); put(a.hand, M.hand * 0.75); put(a.sh, M.armW * 1.4); }   // full sleeves
  put(J.chest, M.chest * 0.55); put(J.hip, M.hipW * 0.55);
  if (lk.hairStyle === 'bun') put(J.HT(BUN.c), (BUN.rx + 0.04) * J.k);
  if (lk.hairStyle === 'ponytail') put(J.HT([-1.3, 0.2]), 0.35 * J.k);
  if (lk.hairStyle === 'long') { put(J.HT([-0.9, 1.6]), 0.2 * J.k); }
  if (lk.hairStyle === 'braids') for (const near of [true, false]) { const B = braidPath(J, lk, near).P; put(B[B.length - 1], 0.2 * J.k); put(B[Math.floor(B.length / 2)], 0.2 * J.k); }
  if (lk.hat || lk.hairStyle === 'cap') put(J.HT([0.2, -1.05]), 0.7 * J.k);
  if (lk.scarf) { J.tor = J.tor || torsoShape(J); const { front, back } = scarfTails(J, lk); for (const P of [front, back]) put(P[P.length - 1], SCARF_W * 1.4); }
  if (lk.bottom === 'skirt' || lk.bottom === 'dress') { J.tor = J.tor || torsoShape(J); for (const q of skirtGeo(J, lk).P) put(q, 1.2); }   // the cloth flares past the legs
  if (lk.apron) { J.tor = J.tor || torsoShape(J); for (const q of skirtGeo(J, apronHem(lk)).P) put(q, 1.2); }
  if (lk.backpack) put(add(J.chest, [-M.chest * 0.85, 0]), 6);
  if (lk.top === 'cardigan') for (const q of cardiganShape(J).P) put(q, 1.2);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ───────────────────────── body parts ─────────────────────────
// Union-inked group: every outline first (double width), then every fill, so internal joints carry no line.
function group(ctx, parts, w = 1.1) {
  for (const q of parts) ln(ctx, q.P, w * 2, { seed: q.seed });
  for (const q of parts) cel(ctx, q.P, q.col, 0, q.seed, q.sh, q.shade);
}
// The broad light offset for big cloth shapes (torso, skirt): a mostly sideways shift, so the far side of the body
// turns into a band of shadow (it reads round) without a heavy band under every hem.
const broad = (kx = 2.4, ky = 0.7) => [SH[0] * kx, SH[1] * ky];
// The union of closed shapes as one path (each wound the same way, so nonzero filling and clipping unite them).
const area2 = P => { let a = 0; for (let i = 0, n = P.length; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
const union = (ctx, Ps) => { ctx.beginPath(); for (const P of Ps) poly(ctx, area2(P) < 0 ? P.slice().reverse() : P); };
const clipTo = (ctx, Ps) => { union(ctx, Ps); ctx.clip(); };
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
  if (kind === 2) return [S([[0, -0.3], [0.25, -0.44], [0.62, -0.44], [0.8, -0.22], [0.8, 0.2], [0.62, 0.42], [0.3, 0.44], [0.05, 0.32]]), finger([0.24, 0.36], [0.6, 0.2], 0.13)];
  if (kind === 3) return [S([[0, -0.3], [0.25, -0.44], [0.62, -0.44], [0.8, -0.22], [0.78, 0.08], [0.55, 0.36], [0.3, 0.42], [0.05, 0.32]]), finger([0.55, 0.12], [1.24, 0.2], 0.15)];
  // relaxed: a mitten whose fingers curl a little toward the palm, and a thumb of its own (the ink notches between them)
  return [S([[0, -0.3], [0.3, -0.38], [0.66, -0.35], [0.92, -0.2], [1.02, 0.0], [0.96, 0.16], [0.8, 0.24], [0.56, 0.26], [0.3, 0.3], [0.08, 0.3], [0, 0.26]]),
    finger([0.2, 0.22], [0.56, 0.46], 0.135)];
}
function handDetail(ctx, a, M, kind, seed, col) {
  const T = handFrame(a, M); kind = Math.round(clamp(kind, 0, 3));
  if (LW * M.hand < 4) return;                        // too small to read: skip finger lines
  const c = rgba(darken(col, 0.55), 0.7);
  if (kind === 0) { stroke(ctx, [T([0.72, -0.1]), T([0.95, -0.05])], 0.45, seed, c); stroke(ctx, [T([0.7, 0.1]), T([0.92, 0.12])], 0.45, seed + 1, c); }
  if (kind === 2 || kind === 3) { stroke(ctx, [T([0.62, -0.3]), T([0.7, 0.05]), T([0.5, 0.28])], 0.5, seed, c); }
}
// A cloth band round a limb from a to b (a cuff): straight sides of half-width w, both ends bowed by e toward b (the
// near half of each rim, seen a little from above), so it reads as a band, never as a ball.
function band(a, b, w, e, seed) {
  const d = sub(b, a), t = mul(d, 1 / (len(d) || 1)), n = [-t[1], t[0]];
  const rim = (c, s) => [1, 0.55, 0, -0.55, -1].map(q => add(c, add(mul(n, q * s * w), mul(t, e * (1 - q * q)))));
  return wobble(spline([...rim(a, 1), ...rim(b, -1)], 3), seed, 0.1);
}
// Cuff layout along a forearm of length Lf (absolute units, so a child's short forearm gets a short cuff): the cuff is
// never wider than the hand, and ends a bare-wrist gap before the wrist; the sleeve ends inside it.
function cuffLayout(M, Lf, fl) {
  const h = M.hand, cw = Math.min(M.wristW * 1.3 * fl, h * 0.34), e = cw * 0.22, gap = h * 0.26, cl = cw * 1.25;
  const cB = clamp((Lf - gap - e) / Lf, 0.5, 0.95), cA = clamp(cB - cl / Lf, 0.4, cB - 0.04);
  return { cw, e, gap, cA, cB, wEnd: cw * 0.95, fEnd: cB * Lf - 0.9 * cw * 0.95 - 0.3 };   // fEnd: where the sleeve's own end sits (from the elbow)
}
// An arm: a shaped sleeve (or bare arm) from the shoulder to the elbow and on to the wrist, folds in the crook of the
// elbow, a ribbed cuff the sleeve blouses over, a short bare wrist, and the hand. Long sleeves are the cardigan's when
// one is worn (lk.top), else the shirt's / dress's; knit and smock sleeves hang fuller. Returns the shapes (and their
// ink-wide outsets) that the shoulder overlay in draw() uses.
function drawArm(ctx, J, a, far, lk, kind, seed) {
  const M = J.M, f = far ? 0.86 : 1, skin = darken(lk.skin, f), cloth = lk.top === 'cardigan' ? lk.shirt : lk.bottom === 'dress' ? lk.dress : lk.shirt, top = darken(cloth, f);
  const long = lk.sleeves !== 'short', fl = lk.top === 'cardigan' || (lk.bottom === 'dress' && lk.dressStyle === 'smock') ? 1.1 : 1, det = !J.simple;
  const W = M.armW, E = M.elbowW, R = M.wristW, u = sub(a.el, a.sh), v = sub(a.wr, a.el), cr = u[0] * v[1] - u[1] * v[0];
  const bend = Math.atan2(cr, u[0] * v[0] + u[1] * v[1]), tu = mul(u, 1 / (len(u) || 1)), Lf = len(v) || 1, tv = mul(v, 1 / Lf);
  const ni = mul([-tu[1], tu[0]], cr > 0 ? 1 : -1);    // toward the crook of the elbow (the side the forearm folds to)
  const at = q => mid(a.el, a.wr, q), C = cuffLayout(M, Lf, fl), cuffA = C.cA, cuffB = C.cB, fe = C.fEnd / Lf;
  const wU = long ? prof([[0, W * 1.02 * fl], [0.2, W * 1.24 * fl], [0.45, W * 1.2 * fl], [1, E * 1.3 * fl]]) : prof([[0, W * 1.14], [0.3, W * 1.06], [1, E]]);
  // a long sleeve blouses out just above the cuff and gathers into it (its end is hidden inside the cuff)
  const wF = long ? prof([[0, E * 1.3 * fl], [0.45, E * 1.34 * fl], [clamp((cuffA - 0.02) / fe, 0.6, 0.97), Math.max(R * 1.5 * fl, C.cw * 1.12)], [1, C.wEnd]]) : prof([[0, E * 1.02], [0.25, E * 1.14], [1, R * 0.92]]);
  const foEnd = long ? at(fe) : a.wr, up = limb(a.sh, a.el, wU, seed), fo = limb(a.el, foEnd, wF, seed + 1);
  const hand = [...(long ? [{ P: limb(at((cuffA + cuffB) / 2), add(a.wr, mul(tv, M.hand * 0.2)), () => Math.min(R * 0.84, C.cw * 0.82), seed + 13, 0.1), col: skin, seed: seed + 13 }] : []),
    ...handParts(a, M, kind, seed + 2).map((P, i) => ({ P, col: skin, seed: seed + 3 + i }))];
  const col = long ? top : skin, front = !far || J.p.bkFront >= 0.5; let disc = null;
  // the arm throws a shadow on the cloth behind it: only on its lit part (shade doesn't darken shade) and only where
  // no later cloth covers it, so it never doubles up. The arm hangs from the shoulder, so the shadow is sheared: none
  // at the shoulder (no lobe above it), the full offset from about the elbow on.
  if (front && J.castOn?.length) {
    const d = mul(SH, -1.1), L0 = (len(u) || 1) * 0.85, sk = P => P.map(p => add(p, mul(d, smooth(0, L0, len(sub(p, a.sh))))));
    const shadow = [sk(up), sk(fo)];
    for (let i = 0; i < J.castOn.length; i++) {
      const { P, sh } = J.castOn[i];
      ctx.save(); path(ctx, P); ctx.clip(); path(ctx, shift(P, sh[0], sh[1])); ctx.clip();
      if (i < J.castOn.length - 1) { ctx.beginPath(); ctx.rect(-900, -900, 1800, 1800); for (const q of J.castOn.slice(i + 1)) poly(ctx, q.P); ctx.clip('evenodd'); }
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.85; ctx.fillStyle = CLOTH;
      union(ctx, shadow); ctx.fill(); ctx.restore();
    }
  }
  const sl = long ? { sh: mul(SH, 1.3), shade: CLOTH } : {};   // a sleeve turns with a fuller shadow than skin
  const parts = [{ P: up, col, seed, ...sl }, { P: fo, col, seed: seed + 1, ...sl }, ...(long ? [] : hand)];
  // as group() (every outline, then every fill), except that the arm grows out of the shoulder: inside the body near
  // the shoulder (a disc on the shoulder side of the joint) the upper arm's outline is not inked at all, so nothing
  // flat is painted over it and the sleeve keeps its own light and shade, its shadow side running on round the deltoid
  if (front) {
    const n = [-tu[1], tu[0]], r = W * (long ? 1.1 * fl : 1.14) + 1.4 * LW, B = J.torOut || J.tor.P;
    disc = [...Array.from({ length: 13 }, (_, i) => { const q = Math.PI * (i / 12); return add(a.sh, add(mul(n, Math.cos(q) * r), mul(tu, -Math.sin(q) * r))); }), add(a.sh, mul(tu, W * 0.6))];
    const ccw = P => (area2(P) > 0 ? P.slice().reverse() : P);   // against the rects: winding 0 only inside both
    ctx.save(); ctx.beginPath(); ctx.rect(-900, -900, 1800, 1800); poly(ctx, ccw(disc)); ctx.rect(-900, -900, 1800, 1800); poly(ctx, ccw(B)); ctx.clip();
    ln(ctx, up, 2.2, { seed }); ctx.restore();
  } else ln(ctx, up, 2.2, { seed });
  for (const q of parts.slice(1)) ln(ctx, q.P, 2.2, { seed: q.seed });
  for (const q of parts) cel(ctx, q.P, q.col, 0, q.seed, q.sh, q.shade);
  if (det && long) {                                   // the cloth gathers in the crook of the elbow (more, the more it bends)
    const k = clamp(Math.abs(bend) / 0.9, 0.3, 1), e = a.el, ie = add(e, mul(ni, E * 1.15 * fl)), bu = mul(tu, -1), fc = rgba(darken(cloth, 0.42), 0.6);
    ctx.save(); clipTo(ctx, [up, fo]);
    stroke(ctx, quad(add(ie, mul(bu, E * 0.35)), add(e, add(mul(bu, E * 1.1 * k), mul(ni, E * 0.45))), add(e, add(mul(bu, E * (1.1 + 1.3 * k)), mul(ni, -E * 0.45))), 8), 0.5, seed + 20, fc);
    stroke(ctx, quad(add(ie, mul(tv, E * 0.35)), add(e, add(mul(tv, E * 1.1 * k), mul(ni, E * 0.45))), add(e, add(mul(tv, E * (1.2 + 1.4 * k)), mul(ni, -E * 0.35))), 8), 0.5, seed + 21, fc);
    if (k > 0.55) stroke(ctx, quad(ie, add(e, mul(ni, E * 0.6)), add(e, add(mul(ni, -E * 0.05), mul(bu, E * 0.25))), 6), 0.42, seed + 22, fc);
    // the sleeve's fullness hanging over the cuff, and the set-in shoulder seam on the near arm
    const b0 = at(cuffA - 0.12), wb = Math.max(R * 1.45 * fl, C.cw * 1.1);
    stroke(ctx, quad(add(b0, mul(ni, wb * 0.9)), add(at(cuffA - 0.05), mul(ni, wb * 0.1)), add(at(cuffA - 0.01), mul(ni, -wb * 0.5)), 6), 0.4, seed + 23, rgba(darken(cloth, 0.42), 0.45));
    if (!far) { const s = mid(a.sh, a.el, 0.16), n = [-tu[1], tu[0]], w = W * 1.2 * fl; stroke(ctx, quad(add(s, mul(n, w)), add(s, mul(tu, -w * 0.55)), sub(s, mul(n, w)), 8), 0.45, seed + 24, rgba(darken(cloth, 0.45), 0.5)); }
    // each sleeve segment: a dry-brush sheen down its lit side and one long drape fold down its shaded side, so a
    // straight sleeve still reads as soft, round cloth in a close-up
    for (const [A, B, wf, sd] of [[a.sh, a.el, wU, 25], [a.el, foEnd, wF, 27]]) {
      const t = sub(B, A), Lg = len(t) || 1, n0 = [-t[1] / Lg, t[0] / Lg], lit = n0[0] * SH[0] + n0[1] * SH[1] > 0 ? n0 : mul(n0, -1);
      const sheen = [0.14, 0.32, 0.5, 0.68, 0.86].map(q => add(mid(A, B, q), mul(lit, wf(q) * 0.52)));
      ink(ctx, sheen, wf(0.5) * 0.36, { closed: false, seed: seed + sd, color: rgba(lighten(cloth, 0.42), 0.4) });
      stroke(ctx, quad(add(mid(A, B, 0.2), mul(lit, -wf(0.2) * 0.62)), add(mid(A, B, 0.45), mul(lit, -wf(0.45) * 0.3)), add(mid(A, B, 0.7), mul(lit, -wf(0.7) * 0.05)), 8), 0.42, seed + sd + 1, rgba(darken(cloth, 0.42), 0.42));
    }
    ctx.restore();
  }
  let sleeve = null;
  if (long) {                                          // wrist and hand, then the ribbed cuff over the wrist
    group(ctx, hand);
    const cuff = band(at(cuffA), at(cuffB), C.cw, C.e, seed + 11);
    cel(ctx, cuff, darken(top, 0.94), 0.9, seed + 11);
    if (det && J.px * C.cw > 4) {                      // rib lines along the cuff
      const n = [-tv[1], tv[0]], nr = Math.max(3, Math.round(C.cw * 2 / 1.1));
      ctx.save(); path(ctx, cuff); ctx.clip();
      for (let i = 1; i < nr; i++) { const q = (i / nr - 0.5) * 2, o = mul(n, q * C.cw), b = mul(tv, C.e * (1 - q * q)); stroke(ctx, [add(add(at(cuffA - 0.02), o), b), add(add(at(cuffB + 0.02), o), b)], 0.32, seed + 30 + i, rgba(darken(cloth, 0.45), 0.4)); }
      ctx.restore();
    }
  } else {                                             // short sleeve over the shoulder
    const m = mid(a.sh, a.el, 0.5);
    sleeve = { a: a.sh, b: m, w: prof([[0, W * 1.32], [1, W * 1.26]]) };
    cel(ctx, limb(sleeve.a, sleeve.b, sleeve.w, seed + 12), top, 1.1, seed + 12);
  }
  handDetail(ctx, a, M, kind, seed + 9, skin);
  // outsets by the ink's half-width (the union ink is stroked at twice the line weight, half of it outside the shape)
  const d = 1.7 * LW + 0.4, h = M.hand, rh = h * 0.72 + d;
  return {
    up, disc,
    upX: [limb(a.sh, a.el, q => wU(q) + d, seed), ...(sleeve ? [limb(sleeve.a, sleeve.b, q => sleeve.w(q) + d, seed + 12)] : [])],
    keepX: [limb(a.el, foEnd, q => wF(q) + d, seed + 1), capsule(long ? at(cuffA) : at(0.6), add(a.wr, mul(tv, h * 0.75)), rh, rh, 0, 0)],
  };
}
function shoeShape(l, M) {
  const f = M.foot, s = M.ankle;
  const Q = [[-0.16 * f, -0.55 * s], [0.16 * f, -0.62 * s], [0.46 * f, -0.08 * s], [0.72 * f, 0.15 * s], [0.82 * f, 0.6 * s], [0.74 * f, s], [-0.2 * f, s], [-0.28 * f, 0.62 * s], [-0.26 * f, -0.05 * s]];
  return spline(Q.map(q => add(l.ank, rot(q, l.fa))), 3);
}
// A bare foot (shoes: null): heel, arch, a rounded ball and toes, in skin.
function bareFoot(l, M) {
  const f = M.foot, s = M.ankle;
  const Q = [[-0.12 * f, -0.75 * s], [0.12 * f, -0.75 * s], [0.38 * f, 0.02 * s], [0.62 * f, 0.3 * s], [0.78 * f, 0.6 * s], [0.74 * f, 0.94 * s], [0.4 * f, s], [-0.1 * f, s], [-0.21 * f, 0.72 * s], [-0.19 * f, 0.05 * s]];
  return spline(Q.map(q => add(l.ank, rot(q, l.fa))), 3);
}
function drawLeg(ctx, J, l, far, lk, seed) {
  const M = J.M, f = far ? 0.86 : 1, skin = darken(lk.skin, f), pants = darken(lk.pants, f);
  const tr = lk.bottom === 'trousers', bare = !lk.shoes;
  const thigh = capsule(l.hip, l.knee, M.thighW * (tr ? 1.1 : 1), M.kneeW * (tr ? 1.15 : 1), seed);
  const shin = capsule(l.knee, l.ank, M.kneeW * (tr ? 1.15 : 1), M.ankleW * (tr ? 1.45 : 1), seed + 1);
  if (bare) {                                          // skin all the way down; the foot joins the shin without a line
    const foot = bareFoot(l, M);
    group(ctx, [...(tr ? [] : [{ P: thigh, col: skin, seed }, { P: shin, col: skin, seed: seed + 1 }]), { P: foot, col: skin, seed: seed + 4 }]);
    if (!J.simple && LW * M.foot > 9) {               // toe creases
      const T = q => add(l.ank, rot([q[0] * M.foot, q[1] * M.ankle], l.fa)), c = rgba(darken(lk.skin, 0.5), 0.6);
      stroke(ctx, [T([0.6, 0.62]), T([0.63, 0.9])], 0.45, seed + 7, c); stroke(ctx, [T([0.5, 0.66]), T([0.52, 0.92])], 0.4, seed + 8, c);
    }
  } else {
    if (!tr) {                                         // socks before the shoe
      group(ctx, [{ P: thigh, col: skin, seed }, { P: shin, col: skin, seed: seed + 1 }]);
      cel(ctx, capsule(mid(l.ank, l.knee, 0.32), l.ank, M.ankleW * 1.12, M.ankleW * 1.1, seed + 3), darken(lk.socks, f), 0.8, seed + 3);
    }
    const shoe = shoeShape(l, M);
    cel(ctx, shoe, darken(lk.shoes, f), 1.1, seed + 4);
    ctx.save(); path(ctx, shoe); ctx.clip();
    const so = [[-0.3, 0.8], [0.9, 0.8], [0.9, 1.3], [-0.3, 1.3]].map(q => add(l.ank, rot([q[0] * M.foot, q[1] * M.ankle], l.fa)));
    fillP(ctx, so, darken(lk.shoes, 0.55 * f)); ctx.restore();
    ln(ctx, shoe, 1.1, { seed: seed + 4 });
  }
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
// flare > 0: a garment's straight hem (a cardigan) that widens by `flare` × hip width per torso length below the hips.
function torsoShape(J, s0 = -0.12, grow = 1, flare = 0) {
  const { M, lean, a2, T } = J, b = M.belly;
  // a garment's skirt below the waist (flare) hangs toward plumb when the body leans, instead of jutting out stiffly
  // (lying down it simply lies along the body). The axis turns from the lean to the hang over a long stretch (SA → SB)
  // and is integrated along s, so it is one smooth curve whose bend stays wider than the cloth: the offset edges
  // (outline, the open front's panel edges) never fold over themselves on the inside of the bend.
  const hang = flare ? lerp(lean, lean * 0.25, 1 - smooth(0.75, 1.25, Math.abs(lean))) : lean, SA = 0.24, SB = -0.16, ds = 0.01;
  const bent = flare && Math.abs(hang - lean) > 1e-4, th = s => (bent && s < SA ? lerp(lean, hang, smooth(SA, SB, s)) : lean);
  const tab = [add(J.hip, mul(upv(lean), T * SA))];   // the axis at s = SA, SA - ds, … (when bent)
  if (bent) for (let i = 1, lo = s0 - 0.24; SA - (i - 1) * ds > lo; i++) tab.push(sub(tab[i - 1], mul(upv(th(SA - (i - 0.5) * ds)), T * ds)));
  const axis = s => { const q = (SA - s) / ds, i = Math.min(Math.floor(q), tab.length - 2); return i < 0 ? tab[0] : add(tab[i], mul(sub(tab[i + 1], tab[i]), q - i)); };
  const at = s => (bent && s < SA ? axis(s) : s <= 0.5 ? add(J.hip, mul(upv(lean), T * s)) : add(J.chest, mul(upv(a2), T * (s - 0.5))));
  const fr = s => { const a = bent && s < SA ? th(s) : lerp(lean, a2, clamp((s - 0.35) / 0.4)); return [Math.cos(a), Math.sin(a)]; };
  const Wd = (s, front) => {
    const hw = M.hipW / 2, ww = (M.waist / 2) * (front ? 1 + 0.3 * b : 0.9), cw = (M.chest / 2) * (front ? 1.0 : 0.96);
    let w;
    if (s < 0.08 && flare) w = hw * (1 + flare * (0.08 - s));
    else if (s < 0.08) w = lerp(hw * 0.35, hw, smooth(-0.14, 0.06, s));
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
    if (st.tear > 0.01) {                          // a tear welling on the lash line of a shut / laughing eye
      const c = E(side * rx * 0.15, up ? ry * 0.42 : ry * 0.12), r = rx * k * (simple ? 0.3 : 0.36);
      ctx.fillStyle = `rgba(214,236,252,${0.75 * st.tear})`; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 1.35, r * 0.62, 0, 0, 7); ctx.fill();
      dot(ctx, c[0] - side * r * 0.4, c[1] - r * 0.12, r * 0.38, `rgba(255,255,255,${0.95 * st.tear})`);
    }
    return;
  }
  const wide = st.shape === 'wide' ? 1.14 : 1, RX = rx * wide, RY = ry * wide;
  const gx = clamp(st.gaze[0], -1, 1) * RX * 0.35 + RX * 0.18, gy = clamp(st.gaze[1], -1, 1) * RY * 0.3;
  if (simple) {                                    // small on screen: a dark oval with a glint reads best
    const O = ell(0, 0, RX * 0.62, RY * 0.8, seed, 0).map(q => E(q[0] + gx * 0.6, q[1] + gy * 0.5));
    fillP(ctx, O, darken(iris, 0.45));
    const g = E(gx * 0.6 - RX * 0.2, -RY * 0.3); dot(ctx, g[0], g[1], RX * k * 0.22, '#fff');
    if (st.tear > 0.01) { const q = E(gx * 0.6 + RX * 0.18, RY * 0.62); dot(ctx, q[0], q[1], RX * k * 0.17, `rgba(255,255,255,${0.9 * st.tear})`); }
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
  if (st.tear > 0.01) {                             // a tear brimming on the lower lid: a glassy meniscus and one bright bead
    const by = RY - st.low * RY * 1.2, bot = x => Math.min(RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2)), st.low > 0.02 ? by + RY * 0.3 * st.low * (x / RX) ** 2 : 1e9);
    const xs = Array.from({ length: 13 }, (_, i) => -RX * 0.85 + (i / 12) * RX * 1.7), th = x => RY * 0.24 * (1 - (x / (RX * 0.85)) ** 2);
    fillP(ctx, [...xs.map(x => E(x, bot(x) + 0.01)), ...xs.slice().reverse().map(x => E(x, bot(x) - th(x)))], `rgba(205,230,250,${0.55 * st.tear})`);
    stroke(ctx, xs.slice(2, -2).map(x => E(x, bot(x) - th(x))), 0.55, seed + 6, `rgba(255,255,255,${0.75 * st.tear})`);
    const bx = -side * RX * 0.3, b = E(bx, bot(bx) - th(bx) * 0.75);
    dot(ctx, b[0], b[1], RY * k * 0.13, `rgba(255,255,255,${0.95 * st.tear})`);
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
  // combed back: the hairline breaks into bundles (small dips between them), recedes at the temple, then comes forward
  else if (fringe === 'back') line = [[xc + 0.26, -0.76], [xc + 0.165, -0.765], [xc + 0.09, -0.7], [xc + 0.0, -0.69], [xc - 0.07, -0.62], [xc - 0.14, -0.59], [xc - 0.17, -0.5], [xc - 0.14, -0.4], [xc - 0.24, -0.33]];
  else if (fringe === 'part') line = [[xc + 0.36, -0.62], [xc + 0.16, -0.6], [xc - 0.06, -0.52], [xc - 0.26, -0.36]];
  else line = [[xc + 0.36, -0.55], [xc + 0.05, -0.5], [xc - 0.3, -0.32]];
  line = [...line, [ear[0] + 0.14, ey - 0.28], [ear[0] + 0.16, ey + 0.02], [ear[0] + 0.06, ey - 0.18], [ear[0] - 0.14, ey - 0.12], [-0.6, 0.34]];
  return spline([...outer, front, ...line], 4);
}
function hairBack(G, vol) { const { CP } = G; return spline([[-0.2, 0.4], ...[CP[8], CP[9], CP[10], CP[0], CP[1]].map(q => radial(q, vol)), [G.xc - 0.1, -0.3]], 4); }

const HAIR_VOL = { short: 0.12, long: 0.1, ponytail: 0.07, bun: 0.07, braids: 0.06, curly: 0.22, bald: 0.03, cap: 0.06 };
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
// A hanging chain (hair, cloth): leaves `root` along d0, bends toward gravity g by `bend` of its length, ripples with a
// wave travelling down it (wave = amplitude in radians), and lies along the ground (local y = -lift) trailing back.
function hangChain(J, root, d0, g, L, n = 10, bend = 0.55, wave = 0) {
  const P = [root], seg = L / n, floor = -J.lift - 0.8;
  for (let i = 0; i < n; i++) {
    const u = smooth(0, bend, i / n), d0i = [lerp(d0[0], g[0], u), lerp(d0[1], g[1], u)];
    const d = wave ? rot(d0i, wave * (i / n) * Math.sin(J.t * 6.2 - i * 0.75)) : d0i, q = add(P[i], mul(d, seg / (len(d) || 1)));
    if (q[1] > floor) q[0] = P[i][0] - Math.sqrt(Math.max(0, seg * seg - (floor - P[i][1]) ** 2)) * 0.95, q[1] = floor;
    P.push(q);
  }
  return spline(P, 3, false);
}
// Arc-length frame along a polyline: point, tangent and normal at s; S = cumulative lengths.
function chainFrame(P) {
  const n = P.length, S = [0]; for (let i = 1; i < n; i++) S.push(S[i - 1] + len(sub(P[i], P[i - 1])));
  const at = s => {
    let i = 1; while (i < n - 1 && S[i] < s) i++;
    const a = P[i - 1], b = P[i], u = clamp((s - S[i - 1]) / ((S[i] - S[i - 1]) || 1)), d = sub(b, a), dl = len(d) || 1, tn = mul(d, 1 / dl);
    return { c: mid(a, b, u), tn, nn: [-tn[1], tn[0]] };
  };
  return { at, T: S[n - 1] || 1 };
}
// Two plaited braids hanging from behind the ears. The near one is drawn over the shoulder after the head; the far
// one peeks out from under the jaw (drawn before the head). They leave the head along its axis and then hang with
// gravity and a little sway; on the ground they lie flat. Ties use the scarf colour (as the ponytail band does).
function braidPath(J, lk, near) {
  const { G, HT, k, th } = J, t = J.t, er = G.ear, ph = near ? 0 : 1.3;
  const root = HT(near ? [er[0] - 0.1, er[1] + 0.26] : [G.xc - 0.22, 0.5]);
  const sw = 0.07 * Math.sin(t * 1.9 + ph) + 0.18 * J.p.gait * Math.sin(t * 7.3 + ph);
  const Lb = (near ? 1.75 : 1.5) * k * (J.M.child ? 1 : 1.25);
  return { P: hangChain(J, root, rot([0, 1], th), [(near ? -0.16 : 0.05) + sw, 1], Lb), w0: 0.21 * k, w1: 0.13 * k };
}
function drawBraid(ctx, J, lk, near) {
  const { P, w0, w1 } = braidPath(J, lk, near), hair = near ? lk.hair : darken(lk.hair, 0.88), k = J.k;
  const { at, T } = chainFrame(P), tieS = T * 0.84, wAt = s => lerp(w0, w1, clamp(s / tieS));
  // the plait: overlapping lobes leaning alternately left and right, inked as one silhouette, then creased
  const step = w0 * 1.2, lobes = [];
  for (let s = 0, side = 1; s < tieS - step * 0.2; s += step * 0.78, side = -side) {
    const F = at(Math.min(s + step * 0.45, tieS - step * 0.35)), w = wAt(s), a = Math.atan2(F.tn[1], F.tn[0]) + side * 0.5;
    lobes.push({ c: add(F.c, mul(F.nn, side * w * 0.2)), rx: step * 0.66, ry: w * 0.86, a, side, P: ell(0, 0, step * 0.66, w * 0.86, 0, 0).map(q => add(add(F.c, mul(F.nn, side * w * 0.2)), rot(q, a))) });
  }
  if (J.simple) { group(ctx, lobes.map((L, i) => ({ P: L.P, col: hair, seed: 491 + i })), 0.9); }
  else {
    group(ctx, lobes.map((L, i) => ({ P: L.P, col: hair, seed: 491 + i })), 0.9);
    const dk = rgba(darken(lk.hair, 0.45), 0.9), hl = rgba(lighten(lk.hair, near ? 0.38 : 0.28), 0.7);
    lobes.forEach((L, i) => {
      const E = (th0, th1, sc = 1) => arcPts(0, 0, L.rx * sc, L.ry * sc, th0, th1, 0.5).map(q => add(L.c, rot(q, L.a)));
      if (i) stroke(ctx, E(Math.PI * 0.62, Math.PI * 1.38), 0.6, 495 + i, dk);          // where it comes out from under the lobe above
      stroke(ctx, E(Math.PI * (L.side > 0 ? 1.15 : 0.55), Math.PI * (L.side > 0 ? 1.45 : 0.85), 0.55), 1.1, 505 + i, hl);
    });
  }
  // tuft below the tie, then the tie band
  const tie = at(tieS), end = at(T), tw = w1 * 0.75;
  const tuft = spline([add(tie.c, mul(tie.nn, tw)), add(mid(tie.c, end.c, 0.6), mul(tie.nn, tw * 1.3)), add(end.c, mul(end.nn, tw * 0.9)), add(end.c, mul(end.tn, w1 * 0.5)), add(end.c, mul(end.nn, -tw * 0.9)), add(mid(tie.c, end.c, 0.6), mul(tie.nn, -tw * 1.3)), sub(tie.c, mul(tie.nn, tw))], 3);
  cel(ctx, tuft, hair, 0.9, near ? 497 : 498, mul(SH, 0.6));
  if (!J.simple) stroke(ctx, [tie.c, add(end.c, mul(end.tn, w1 * 0.2))], 0.4, 499, rgba(darken(lk.hair, 0.5), 0.7));
  const band = lk.scarf || '#c8443a', bw = w1 * 1.2, bh = Math.max(0.9, k * 0.055);
  const B = [add(add(tie.c, mul(tie.nn, bw)), mul(tie.tn, -bh)), add(add(tie.c, mul(tie.nn, bw)), mul(tie.tn, bh)), add(add(tie.c, mul(tie.nn, -bw)), mul(tie.tn, bh)), add(add(tie.c, mul(tie.nn, -bw)), mul(tie.tn, -bh))];
  cel(ctx, spline(B, 3), near ? band : darken(band, 0.88), 0.8, 500, mul(SH, 0.3));   // a small offset: the tie is too small for the full one
}
// Hair pulled back into a bun (an old woman's knot): the combed hair hugs the skull (a small shadow offset, so no band
// runs along the hairline like a knitted brim), its silhouette inked but its hairline soft (a fine line in the hair's
// own dark, roots flicking across it), combed in a few uneven strand groups that sweep up and back into an off-centre
// coil at the back of the crown, with loose wisps at the temple and the nape.
const BUN = { c: [-0.98, -0.7], rx: 0.33, ry: 0.22, a: -1.03 };   // the coil: centre (head space), radii, tilt along the skull
// strand groups: a root on the hairline (or the nape), a bend, and where it reaches the coil; o: each strand's offset
// across the group (head units), so the groups are uneven bundles with gaps between them, not evenly spaced ribs
const BUN_GROUPS = (xc, er) => [
  { P: [[xc + 0.24, -0.75], [xc - 0.06, -0.97], [-0.62, -0.92]], o: [0, 0.03, 0.075] },
  { P: [[xc + 0.03, -0.66], [-0.14, -0.86], [-0.66, -0.8]], o: [0, 0.045] },
  { P: [[-0.12, -0.7], [-0.34, -0.8], [-0.7, -0.74]], o: [0.01] },              // a short one starting mid-crown
  { P: [[xc - 0.15, -0.46], [-0.32, -0.62], [-0.74, -0.64]], o: [-0.02, 0.015, 0.06] },
  { P: [[er[0] + 0.08, er[1] - 0.3], [-0.62, -0.42], [-0.8, -0.56]], o: [0, 0.05] },
  { P: [[-0.64, 0.27], [-0.98, -0.12], [-0.9, -0.5]], o: [0, 0.035, 0.08] },
];
const BUN_CAP_SIL = 20, BUN_FRONT = 32;              // hairCap spline points: its silhouette (5 outer controls + front, × 4), its front hairline
function drawBunHair(ctx, J, lk, P, sh) {
  const { G, HT, k } = J, xc = G.xc, er = G.ear, hair = lk.hair, simple = J.simple, t = J.t;
  const lx = Math.sign(SH[0]) || -1, dk = darken(hair, 0.6);
  cel(ctx, P, hair, 0, 410, mul(SH, 0.35));          // a thin shade at the hairline (the hair's own thickness), no brim
  // ink: the silhouette at full weight (its tapered ends run a little way onto the hairline), the hairline fine and soft
  ln(ctx, [...P.slice(-3), ...P.slice(0, BUN_CAP_SIL + 4)], 1.1, { closed: false, seed: 410 });
  stroke(ctx, P.slice(BUN_CAP_SIL + 1).concat([P[0]]), simple ? 0.8 : 0.6, 409, rgba(dk, simple ? 0.9 : 0.75));
  if (!simple) {
    ctx.save(); path(ctx, P); ctx.clip();
    for (const [i, g] of BUN_GROUPS(xc, er).entries()) {         // combed strand groups
      const [a, b, c] = g.P, d = sub(c, a), n = mul([-d[1], d[0]], 1 / (len(d) || 1));
      g.o.forEach((o, j) => {
        const q = [a, b, c].map(v => add(v, mul(n, o))), end = j === g.o.length - 1 ? 0.8 : 1;
        stroke(ctx, quad(q[0], q[1], mid(q[1], q[2], end), 10).map(HT), j ? 0.42 : 0.6, 411 + i * 5 + j, rgba(dk, j ? 0.55 : 0.75));
      });
    }
    const hc = rgba(lighten(hair, 0.55), 0.55), cx = -0.32 - 0.12 * lx;   // a broken sheen on the crown, on the lit side
    stroke(ctx, quad([cx - 0.24, -0.84], [cx - 0.08, -0.97], [cx + 0.1, -0.98], 8).map(HT), 1.6, 440, hc);
    stroke(ctx, quad([cx + 0.18, -0.97], [cx + 0.26, -0.95], [cx + 0.34, -0.9], 5).map(HT), 1.1, 441, hc);
    ctx.restore();
    // roots: short flicks across the front hairline, combed back toward the coil
    const front = P.slice(BUN_CAP_SIL + 2, BUN_CAP_SIL + BUN_FRONT);
    for (let i = 1; i < front.length - 1; i += 3) {
      const q = front[i], to = HT(BUN.c), d = sub(to, q), u = mul(d, 1 / (len(d) || 1)), L = k * (0.1 + 0.05 * ((i * 7) % 3));
      stroke(ctx, [add(q, mul(u, -0.025 * k)), add(q, mul(u, L * 0.5)), add(q, mul(u, L))], 0.4, 450 + i, rgba(dk, 0.6));
    }
  }
  ctx.save(); path(ctx, P); ctx.clip();               // the coil's soft shadow on the combed hair
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.3; fillP(ctx, shift(bunBody(J), -SH[0] * 0.8, -SH[1] * 0.8), CLOTH); ctx.restore();
  drawBun(ctx, J, lk, sh);
  // loose wisps that escaped the pins: at the temple in front of the ear, and at the nape
  const sw = 0.02 * Math.sin(t * 1.7), W = [
    [[er[0] + 0.16, er[1] - 0.26], [er[0] + 0.27 + sw, er[1] - 0.06], [er[0] + 0.19 + sw, er[1] + 0.16]],
    [[xc - 0.2, -0.36], [xc - 0.13 + sw, -0.24], [xc - 0.19 + sw, -0.14]],
    [[-0.62, 0.28], [-0.8 + sw, 0.42], [-0.68 + sw, 0.58]],
    [[-0.56, 0.3], [-0.6 + sw, 0.44], [-0.52 + sw, 0.52]],
  ];
  for (const [i, w] of (simple ? W.slice(0, 1) : W).entries()) {
    const Q = quad(...w, 8).map(HT);
    stroke(ctx, Q, simple ? 0.8 : 0.75, 460 + i, rgba(dk, 0.85));
    if (!simple) stroke(ctx, Q, 0.38, 470 + i, rgba(lighten(hair, 0.15), 0.9));
  }
}
// The coil: a slightly lumpy body and the last turn of the hank lying on it (inked as one silhouette, each turning with
// its own shadow), wrapped by overlapping turns of uneven strand groups that wind in to a tucked tail, a sheen on the
// lit side, a flyaway or two and one hairpin. Coil space: u along the skull, v into it (the coil stands out toward -v).
const bunBody = J => { const P = []; for (let i = 0; i < 40; i++) { const q = (i / 40) * Math.PI * 2, r = 1 + 0.05 * Math.sin(3 * q + 0.7) + 0.03 * Math.sin(5 * q + 1.3); P.push(J.HT(add(BUN.c, rot([BUN.rx * r * Math.cos(q), BUN.ry * r * Math.sin(q)], BUN.a)))); } return P; };
function drawBun(ctx, J, lk, sh) {
  const { HT, k } = J, hair = lk.hair, { c, rx, ry, a } = BUN, B = q => HT(add(c, rot(q, a))), dk = darken(hair, 0.55);
  const body = bunBody(J), lap = ell(-rx * 0.18, -ry * 0.5, rx * 0.62, ry * 0.6, 0, 0, -0.25).map(B);
  group(ctx, [{ P: body, col: hair, seed: 405, sh }, { P: lap, col: lighten(hair, 0.05), seed: 406, sh: mul(sh, 0.7) }], 1.1);
  const turn = (cu, cv, r, q0, q1) => arcPts(0, 0, 1, 1, q0, q1, 0.08).map(([x, y]) => B([rx * (cu + r * x), ry * (cv + r * y)]));
  if (J.simple) { stroke(ctx, turn(-0.08, -0.12, 0.56, 3.1, 6.6), 0.8, 407, rgba(dk, 0.8)); return; }
  ctx.save(); union(ctx, [body, lap]); ctx.clip();
  // the turns: each a strand group (a main strand, a fainter one inside it, a short one outside), winding inward
  const T = [[0.02, 0.04, 0.84, 2.3, 5.3], [-0.08, -0.12, 0.56, 3.0, 6.8], [-0.17, -0.27, 0.3, 3.7, 7.5]];
  T.forEach(([cu, cv, r, q0, q1], i) => {
    stroke(ctx, turn(cu, cv, r, q0, q1), 0.6, 407 + i * 3, rgba(dk, 0.75));
    stroke(ctx, turn(cu, cv, r - 0.08, q0 + 0.3, q1 - 0.2), 0.4, 408 + i * 3, rgba(dk, 0.45));
    stroke(ctx, turn(cu, cv, r + 0.07, q0 + 0.6, lerp(q0, q1, 0.55)), 0.38, 409 + i * 3, rgba(dk, 0.4));
  });
  const lx = Math.sign(SH[0]) || -1;                  // sheen along the lit side of the outer turns
  stroke(ctx, turn(0.02, 0.04, 0.7, lx < 0 ? 3.4 : 5.0, lx < 0 ? 4.3 : 5.9), 1.3, 420, rgba(lighten(hair, 0.6), 0.6));
  stroke(ctx, turn(-0.08, -0.12, 0.42, lx < 0 ? 3.6 : 5.3, lx < 0 ? 4.3 : 6.0), 0.9, 421, rgba(lighten(hair, 0.6), 0.5));
  ctx.restore();
  // flyaways off the outer turn
  for (const [i, q] of [3.9, 4.9].entries()) {
    const e = [rx * 1.0 * Math.cos(q), ry * 1.0 * Math.sin(q)], o = [rx * 1.22 * Math.cos(q + 0.25), ry * 1.3 * Math.sin(q + 0.25)];
    stroke(ctx, quad(e, mid(e, o, 0.7), o, 6).map(B), 0.4, 425 + i, rgba(dk, 0.7));
  }
  // a hairpin through the coil: a dark wire with a small bead, its far end hidden in the hair
  const pin = [[-rx * 0.95, ry * 0.45], [rx * 0.55, -ry * 0.75]].map(B), pc = '#4a3f44';
  stroke(ctx, pin, 0.55, 428, pc); dot(ctx, pin[0][0], pin[0][1], 0.035 * k, pc);
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
  const vol = HAIR_VOL[style] ?? 0.1, sh = mul(SH, 0.8), hsh = [SH[0] * 2, SH[1] * 1.5];   // hsh: hair masses turn more
  // hair mass behind the skull (gives curly / long / bun their volume)
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
  const es = { shape: ex.eye, lid: clamp(ex.lid + (lk.age === 'elder' ? 0.12 : 0) + (1 - ex.lid) * clamp(st.blink || 0) - 0.1 * Math.max(0, J.tu), 0, 1), low: ex.low, gaze: [(ex.gaze?.[0] || 0) + 0.6 * (st.look || 0), (ex.gaze?.[1] || 0) - 0.7 * J.tu], tear: lk.tear };
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
    const fr = { short: 'locks', long: 'sweep', ponytail: 'sweep', bun: 'back', braids: 'part', curly: 'locks' }[style] || 'locks';
    let C = hairCap(G, vol, fr, lk);
    if (style === 'curly') C = scallop(C, 0.06);
    const P = C.map(HT);
    if (style === 'bun') drawBunHair(ctx, J, lk, P, sh);
    else { cel(ctx, P, hair, 1.1, 410, hsh); hairStrands(ctx, J, P, lk, 411); }
    if (style === 'braids' && !simple) stroke(ctx, quad([xc + 0.2, -0.64], [xc - 0.02, -0.86], [-0.2, -1.02], 8).map(HT), 0.7, 418, rgba(lighten(lk.skin, 0.1), 0.85));
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
  // one small glint on the near lens, on the side the light comes from
  const lx = Math.sign(SH[0]) || -1, a0 = Math.atan2(-1, lx), c0 = [G.eyeN[0], G.eyeN[1] + 0.01];
  if (J.simple) { const q = HT([c0[0] + lx * r1 * 0.45, c0[1] - r1 * 0.5]); dot(ctx, q[0], q[1], 0.055 * k, 'rgba(255,255,255,.9)'); }
  else stroke(ctx, arcPts(c0[0], c0[1], r1 * 0.95 * 0.68, r1 * 0.68, a0 - 0.38, a0 + 0.3, 0.01).map(HT), 1.15, 445, 'rgba(255,255,255,.92)');
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
function drawPelvis(ctx, J, lk) {
  if (lk.bottom === 'dress') cel(ctx, J.tor.P, lk.dress, 1.15, 31);
  else cel(ctx, J.tor.P, lk.bottom === 'skirt' ? lk.skirt : lk.pants, 1.15, 32);
}
// Convex hull (monotone chain), counter-clockwise.
function hull(P) {
  const Q = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of Q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = Q.length - 1; i >= 0; i--) { const q = Q[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
// Skirt / dress: the cloth hangs from the waist over both legs down to the hem (lk.hem: 1 = knee, 2 = ankle), so it is
// the hull of the waist, hips, knees and hem points: an A-line standing, a tent over the knees sitting or crouching.
function skirtGeo(J, lk) {
  const { at, fr, Wd } = J.tor, M = J.M, hem = lk.hem, wy = 0.3;
  const side = (s, k, F = J.tor) => [add(F.at(s), mul(F.fr(s), -F.Wd(s, 0) * k)), add(F.at(s), mul(F.fr(s), F.Wd(s, 1) * k))];
  // under a cardigan the waist and hips are placed in its (hanging) frame, just inside it, so the skirt never bulges
  // out past its back when she bends
  const C = lk.top === 'cardigan' ? cardiganShape(J) : null, waist = C ? [...side(wy, 0.92, C), ...side(0.08, 0.95, C), ...side(-0.06, 0.88, C)] : [...side(wy, 0.99), ...side(0.08, 1.12), ...side(-0.06, 1.0)];
  const smock = lk.bottom === 'dress' && lk.dressStyle === 'smock', pts = [...waist, ...(smock ? side(0.58, 1.02) : [])];
  const along = (l, u) => (u <= 1 ? mid(l.hip, l.knee, u) : mid(l.knee, l.ank, u - 1));
  const dirAt = (l, u) => { const d = u <= 1 ? sub(l.knee, l.hip) : sub(l.ank, l.knee), L = len(d) || 1; return mul(d, 1 / L); };
  const hems = [];
  for (const l of [J.lF, J.lB]) {
    for (let i = 1; i <= 6; i++) {
      const u = hem * (i / 6), d = dirAt(l, u), n = [-d[1], d[0]], c = along(l, u);
      const r = (u < 1 ? lerp(M.thighW * 1.3, M.kneeW * 1.55, u) : M.kneeW * 1.5) + M.hipW * (lk.bottom === 'dress' ? 0.26 : 0.2) * u;   // A-line: flares toward the hem
      pts.push(add(c, mul(n, r)), sub(c, mul(n, r)));
      if (i === 6) hems.push({ c, d, n, r });
    }
    if (hem > 1) { const d = dirAt(l, 0.98), n = [-d[1], d[0]]; pts.push(add(l.knee, mul(n, M.kneeW * 1.5)), sub(l.knee, mul(n, M.kneeW * 1.5))); }
  }
  const dd = add(hems[0].d, hems[1].d), dl = len(dd) || 1, hc = mid(hems[0].c, hems[1].c), hn = [-dd[1] / dl, dd[0] / dl], hw = M.hipW * (0.32 + 0.2 * lk.hem);
  for (const [o, b] of [[0, 0.1], [0.55, 0.075], [-0.55, 0.075]]) pts.push(add(add(hc, mul(hn, o * hw)), mul(dd, (M.hipW * b) / dl)));   // a bowed hem
  const floorY = -J.lift - 0.4;                       // the cloth rests on the ground, never under it
  // the hull's corners eased by bounded fillets (a curve inside each corner), not splined through: a spline through
  // unevenly spaced corners overshoots far outside the hull (a lump of skirt bulging out behind a cardigan)
  const Hl = hull(pts.map(q => [q[0], Math.min(q[1], floorY + J.w * J.seatH)])), n = Hl.length, rc = M.hipW * 0.22, E = [];
  Hl.forEach((c, i) => {
    const a = Hl[(i + n - 1) % n], b = Hl[(i + 1) % n], la = len(sub(a, c)) || 1, lb = len(sub(b, c)) || 1;
    E.push(...quad(add(c, mul(sub(a, c), Math.min(rc, la * 0.45) / la)), c, add(c, mul(sub(b, c), Math.min(rc, lb * 0.45) / lb)), 6));
  });
  return { P: wobble(E, 161, 0.35), hems, at };
}
function drawSkirt(ctx, J, lk) {
  const dress = lk.bottom === 'dress', col = dress ? lk.dress : lk.skirt, { P, hems, at } = skirtGeo(J, lk);
  if (dress) group(ctx, [{ P: J.tor.P, col, seed: 31, sh: broad(), shade: CLOTH }, { P, col, seed: 160, sh: broad(), shade: CLOTH }], 1.15);   // one garment: no seam line
  else cel(ctx, P, col, 1.15, 160, broad(), CLOTH);
  J.castOn.push({ P, sh: broad() }); if (dress) J.castOn.push({ P: J.tor.P, sh: broad() });
  if (J.simple) return;
  if (dress && lk.dressStyle === 'smock') {           // the yoke seam across the chest, gathers falling from it
    const { fr, Wd } = J.tor, ys = 0.64, sc = rgba(darken(col, 0.5), 0.6), Y = (v, o = 0) => add(J.tor.at(ys + o), mul(fr(ys), v));
    ctx.save(); path(ctx, J.tor.P); ctx.clip();
    stroke(ctx, quad(Y(-Wd(ys, 0) * 1.1), Y(Wd(ys, 1) * 0.1, -0.05), Y(Wd(ys, 1) * 1.1), 8), 0.6, 164, sc);
    for (const v of [-0.45, 0.05, 0.5]) stroke(ctx, [Y(Wd(ys, v > 0 ? 1 : 0) * v, -0.04), Y(Wd(ys, v > 0 ? 1 : 0) * v * 1.08, -0.16)], 0.45, 165 + v * 10, rgba(darken(col, 0.5), 0.4));
    ctx.restore();
  }
  ctx.save(); path(ctx, P); ctx.clip();               // two soft folds from the hips toward the hem
  const top = at(0.06), fc = rgba(darken(col, 0.5), 0.45);
  for (const [u, sd] of [[0.3, 162], [0.68, 163]]) { const h = mid(hems[1].c, hems[0].c, u); stroke(ctx, [mid(top, h, 0.3), mid(top, h, 0.75), mid(top, h, 1.02)], 0.5, sd, fc); }
  ctx.restore();
}
// An open knit cardigan (lk.top = 'cardigan') over the dress / blouse (lk.under): two front panels with button bands,
// the under layer showing between them (shadowed where the panel on the light side overhangs it), a patch pocket, a
// ribbed hem, faint knit ribs at close range, and a broad shadow down the side away from the light, so it reads as
// soft round cloth at every size, never as a flat slab.
const CARDIGAN_S0 = -0.17, cardiganShape = J => (J.cdg ??= torsoShape(J, CARDIGAN_S0, 1.07, 0.5));   // hip length, loose, a flared hem
// The cardigan's layout in its own frame: front edges (vn near panel, vf far panel, as fractions of the half-width),
// button band width, buttons (s along the body, radius) and the patch pocket, whose front edge keeps clear of the
// button band and the buttons in absolute units, so in no pose does a button sit on the pocket.
const CARDIGAN_BUTTONS = [0.6, 0.42, 0.24, 0.06];
function cardiganLayout(J) {
  const M = J.M, s0 = CARDIGAN_S0, { at, fr, Wd } = cardiganShape(J);
  const V = (s, v) => add(at(s), mul(fr(s), v * Wd(s, v >= 0 ? 1 : 0)));
  const vn = s => (s > 0.6 ? lerp(0.3, -0.15, smooth(0.6, 1.02, s)) : 0.3 + 0.08 * (0.6 - s));    // near panel's front edge
  const vf = s => (s > 0.6 ? lerp(0.72, 0.95, smooth(0.6, 1.02, s)) : 0.72 + 0.12 * (0.6 - s));   // far panel's edge
  const bw = Math.max(1.5, M.chest * 0.075), br = Math.max(0.75, M.chest * 0.036);
  const buttons = CARDIGAN_BUTTONS.map(s => ({ s, c: sub(V(s, vn(s)), mul(fr(s), bw * 0.5)), r: br }));
  const ps0 = s0 + 0.1, ps1 = s0 + 0.34, pv0 = -0.6, clear = Math.max(bw, bw * 0.5 + br) + 0.45 * LW + Math.max(1, M.chest * 0.035);
  const pv1 = Math.min(...[ps0, ps0 + 0.03, (ps0 + ps1) / 2, ps1].map(s => { const x = vn(s) * Wd(s, 1) - clear; return x / Wd(s, x >= 0 ? 1 : 0); }));
  const pm = (ps0 + ps1) / 2, pocket = spline([V(ps1, pv0), V(ps1, pv1), V(pm, pv1), V(ps0 + 0.03, pv1), V(ps0, pv1 - 0.07), V(ps0, pv0 + 0.07), V(ps0 + 0.03, pv0), V(pm, pv0)], 3);   // mid points: its sides follow the body when she bends
  return { V, vn, vf, bw, buttons, pocket, ps1, pv0, pv1 };
}
function drawCardigan(ctx, J, lk) {
  const M = J.M, col = lk.shirt, s0 = CARDIGAN_S0, { at, fr, Wd, P } = cardiganShape(J), det = !J.simple;
  const { V, vn, vf, bw, buttons, pocket: PK, ps1, pv0, pv1 } = cardiganLayout(J);
  const S = []; for (let s = s0 - 0.08; s < 1.12; s += 0.04) S.push(s);
  const cast = Math.max(1.2, M.chest * 0.065), fromBack = SH[0] < 0;
  const edgeN = S.map(s => V(s, vn(s))), edgeF = S.map(s => V(s, vf(s))), off = (E, d) => E.map((q, i) => add(q, mul(fr(S[i]), d)));
  const line = rgba(darken(col, 0.42), 0.75), faint = rgba(darken(col, 0.45), 0.4);
  ctx.save(); path(ctx, P); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-900, -900, 1800, 1800);
  fillP(ctx, [...edgeN, ...edgeF.slice().reverse()], lk.under);
  ctx.globalCompositeOperation = 'multiply';          // the panel on the light side throws a shadow across the dress
  fillP(ctx, fromBack ? [...edgeN, ...off(edgeN, cast).reverse()] : [...edgeF, ...off(edgeF, -cast).reverse()], SHADE);
  ctx.globalCompositeOperation = 'source-over';
  fillP(ctx, [...off(edgeN, -bw), ...edgeN.slice().reverse()], darken(col, 0.95));          // button bands
  fillP(ctx, [...edgeF, ...off(edgeF, bw * 0.6).reverse()], darken(col, 0.95));
  if (det) {                                           // patch pocket on the near panel
    cel(ctx, PK, darken(col, 0.97), 0.6, 36, mul(SH, 0.5));
    stroke(ctx, [V(ps1 - 0.045, pv0 + 0.02), V(ps1 - 0.045, pv1 - 0.02)], 0.4, 37, faint);
    if (J.px * 2.6 > 9) for (let v = -0.92; v < 0.92; v += 2.6 / Wd(0.4, v >= 0 ? 1 : 0)) {   // knit ribs, very faint
      if (v > vn(0.4) - 0.25 && v < vf(0.4) + 0.12) continue;
      stroke(ctx, [s0 + 0.09, 0.3, 0.6, 0.86].map(s => V(s, v)), 0.32, 38 + Math.round(v * 20), rgba(darken(col, 0.5), 0.14));
    }
    if (J.px * 1.1 > 3.5) for (let v = -1; v < 1; v += 1.1 / Wd(s0, v >= 0 ? 1 : 0)) {          // the ribbed hem
      if (v > vn(s0) - 0.02 && v < vf(s0) + 0.02) continue;
      stroke(ctx, [V(s0 - 0.03, v), V(s0 + 0.075, v)], 0.3, 60 + Math.round(v * 40), faint);
    }
  }
  stroke(ctx, [V(s0 + 0.075, -1.1), V(s0 + 0.075, vn(s0 + 0.075))], 0.5, 39, line);
  stroke(ctx, [V(s0 + 0.075, vf(s0 + 0.075)), V(s0 + 0.075, 1.1)], 0.5, 40, line);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = CLOTH;     // the broad side shadow, over everything
  ctx.beginPath(); ctx.rect(-900, -900, 1800, 1800); poly(ctx, shift(P, ...broad(2.6, 0.8))); ctx.fill('evenodd');
  ctx.globalCompositeOperation = 'source-over';
  stroke(ctx, edgeN, 0.85, 41); stroke(ctx, edgeF, 0.7, 42);
  if (det) { stroke(ctx, off(edgeN, -bw), 0.4, 43, faint); stroke(ctx, off(edgeF, bw * 0.6), 0.35, 44, faint); }
  ctx.restore();
  ln(ctx, P, 1.15, { seed: 33 }); J.castOn.push({ P, sh: broad(2.6, 0.8) }); J.torOut = P;
  const btn = mixC(col, '#4a3226', 0.72);
  for (const { c, r: br } of buttons) {
    dot(ctx, c[0], c[1], br + 0.45 * LW, INK); dot(ctx, c[0], c[1], br, btn);
    if (det) dot(ctx, c[0] - br * 0.3, c[1] - br * 0.32, br * 0.32, rgba(lighten(btn, 0.6), 0.85));
  }
}
function drawTorso(ctx, J, lk) {
  const M = J.M, top = lk.bottom === 'dress' ? lk.dress : lk.shirt, tor = J.tor;
  if (lk.top === 'cardigan') { drawCardigan(ctx, J, lk); return; }
  if (lk.bottom !== 'dress') {
    const sh = torsoShape(J, lk.bottom === 'skirt' ? 0.03 : 0.0, 1.05);      // a top hangs over a skirt's waistband
    cel(ctx, sh.P, top, 1.15, 33, broad(), CLOTH); J.castOn.push({ P: sh.P, sh: broad() }); J.torOut = sh.P;
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
  const M = J.M, k = J.k, w = k * (M.child ? 0.3 : 0.34), top = lk.top === 'cardigan' ? lk.under : lk.bottom === 'dress' ? lk.dress : lk.shirt;
  const { at, fr } = J.tor, f = fr(1), u = upv(J.a2), c = add(at(1.0), mul(f, w * 0.15));
  const Q = (fx, uy) => add(c, add(mul(f, w * fx), mul(u, w * uy)));
  const P = spline([Q(-1.45, 0.25), Q(-0.2, -0.55), Q(1.45, 0.05), Q(1.25, 0.5), Q(-0.1, 0.0), Q(-1.25, 0.6)], 4);
  cel(ctx, P, darken(top, 0.9), 0.85, 37);
  if (lk.age === 'adult' || lk.age === 'elder') stroke(ctx, [Q(0.1, -0.3), Q(0.55, -1.3), Q(1.0, -0.25)], 0.6, 38, rgba(darken(top, 0.45), 0.8));
}
// Scarf: a wrap round the neck, a short end hanging in front and a long end behind. The ends are measured in absolute
// units (lk.scarfLength scales them), so on a child the same scarf trails in the grass; both ends are fringed.
const SCARF_W = 3.8, SCARF_FRONT = 34, SCARF_BACK = 58;
function scarfTails(J, lk) {
  const M = J.M, { at, fr, Wd } = J.tor, f = fr(1), u = upv(J.a2), c = at(0.98), cw = Wd(0.9, 1), t = J.t, gait = clamp(J.p.gait);
  const fl = Math.sin(t * 2.6) * 0.06 + gait * Math.sin(t * 6.5) * 0.12, Lk = lk.scarfLength;
  const front = hangChain(J, add(c, add(mul(f, cw * 0.2), mul(u, -M.torso * 0.08))), mul(u, -1), [fl - 0.35 * gait, 1], SCARF_FRONT * Lk, 8, 0.5);
  const stream = 0.32 * gait + 0.9 * clamp(J.p.run);  // lies down the back at rest, swings out behind when walking / running
  const back = hangChain(J, add(c, add(mul(f, -cw * 0.5), mul(u, -M.torso * 0.04))), add(mul(u, -1), mul(f, -0.12 - stream)), [-0.05 - stream + fl, 1 - 0.25 * stream], SCARF_BACK * Lk, 12, 0.85, 0.45 * gait);
  return { front, back, c, f, u, cw };
}
function scarfEnd(ctx, J, lk, P, col, seed) {
  const { at, T } = chainFrame(P), w = SCARF_W, L = [], R = [];
  for (let s = 0; s <= T + 1e-6; s += Math.max(0.8, T / 24)) { const F = at(Math.min(s, T)), ww = w * (1 + 0.06 * Math.sin(s * 0.4 + seed)); L.push(add(F.c, mul(F.nn, ww))); R.push(sub(F.c, mul(F.nn, ww))); }
  const band = wobble([...L, ...R.reverse()], seed, 0.15);
  if (!J.simple) {                                     // fringe beyond the end: inked tassels of yarn that swing a little
    const E = at(T), n = 5, tz = [];
    for (let i = 0; i < n; i++) { const o = lerp(-w * 0.78, w * 0.78, i / (n - 1)), b0 = add(E.c, add(mul(E.nn, o), mul(E.tn, -w * 0.2))), sw = 0.3 * Math.sin(J.t * 3 + i * 1.7), Lt = w * (1.05 + 0.12 * Math.sin(i * 2.3 + seed));
      tz.push([b0, add(b0, add(mul(E.tn, Lt * 0.55), mul(E.nn, sw * 0.4))), add(b0, add(mul(E.tn, Lt), mul(E.nn, sw)))]); }
    for (const [i, P] of tz.entries()) ln(ctx, P, 1.45, { closed: false, taper: false, seed: seed + 10 + i });
    for (const [i, P] of tz.entries()) ln(ctx, P.slice(0, 2).concat([mid(P[1], P[2], 0.85)]), 0.7, { closed: false, taper: false, seed: seed + 10 + i, color: lighten(col, 0.1) });
  }
  cel(ctx, band, col, 1.0, seed);
  if (!J.simple) for (const v of [T - w * 2.4, T - w * 1.6]) { const F = at(Math.max(0, v)); stroke(ctx, [add(F.c, mul(F.nn, w * 0.9)), sub(F.c, mul(F.nn, w * 0.9))], 0.9, seed + 20 + v, lighten(col, 0.45)); }
}
function drawScarf(ctx, J, lk, part) {
  const M = J.M, col = lk.scarf, { front, back, c, f, u, cw } = scarfTails(J, lk);
  if (part === 'back') { scarfEnd(ctx, J, lk, back, darken(col, 0.85), 470); return; }
  const ring = spline([add(c, add(mul(f, -cw * 0.75), mul(u, M.torso * 0.02))), add(c, add(mul(f, -cw * 0.1), mul(u, -M.torso * 0.12))), add(c, add(mul(f, cw * 0.82), mul(u, -M.torso * 0.02))),
    add(c, add(mul(f, cw * 0.7), mul(u, M.torso * 0.16))), add(c, add(mul(f, -cw * 0.1), mul(u, M.torso * 0.12))), add(c, add(mul(f, -cw * 0.72), mul(u, M.torso * 0.15)))], 4);
  cel(ctx, ring, col, 1.05, 471);
  if (!J.simple) stroke(ctx, quad(add(c, add(mul(f, -cw * 0.55), mul(u, M.torso * 0.06))), add(c, add(mul(f, cw * 0.1), mul(u, -M.torso * 0.02))), add(c, add(mul(f, cw * 0.62), mul(u, M.torso * 0.08))), 8), 0.5, 474, rgba(darken(col, 0.5), 0.55));
  if (part !== 'ring') scarfEnd(ctx, J, lk, front, col, 472);
}
const apronHem = lk => ({ hem: lk.bottom === 'skirt' || lk.bottom === 'dress' ? lk.hem * 0.92 : 0.95 });
function drawApron(ctx, J, lk) {
  const M = J.M, col = lk.apron, { at, fr, Wd } = J.tor, low = J.lF.knee, f0 = fr(0);
  const sk = skirtGeo(J, apronHem(lk)).P;
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
// ctx = null: solve only and return the anchors and bounds (the film core and sheets probe this way).
function draw(ctx, x, y, s, face, st = {}) {
  const f = face < 0 ? -1 : 1;
  if (st.look) st = { ...st, look: clamp(st.look * f, -1, 1) };   // st.look is in screen direction; the rig works facing right
  const lk = look(st.params || {}), M = metrics(lk), p = resolvePose(st);
  const m = ctx ? ctx.getTransform() : null, eff = Math.max(1e-3, s * (m ? Math.hypot(m.a, m.b) : 1));
  LW = eff > 2 ? Math.sqrt(2 / eff) : Math.pow(2 / eff, 0.35);
  SH = [-M.sh * f, -M.sh];
  const J = solve(p, M, st, lk);
  J.simple = M.headH * eff < 46; J.px = eff;        // px: screen pixels per unit (detail thresholds)
  const box = extent(J, lk), W = q => [x + q[0] * s * f, y + q[1] * s];
  const b = [x + (f > 0 ? box[0] : -box[2]) * s, y + box[1] * s, x + (f > 0 ? box[2] : -box[0]) * s, y + box[3] * s];
  const out = { head: W(J.hc), mouth: W(J.HT(J.G.mouth)), eye: W(J.HT(J.G.eyeN)), hands: { front: W(J.aF.hand), back: W(J.aB.hand) }, hand: W(J.aF.hand), bounds: b };
  if (!ctx) return out;
  J.tor = J.tor || torsoShape(J); J.castOn = [];      // cloth the arms throw their shadow on: { P, sh } in drawing order
  const ex = exprOf(st, p), shA = 0.26 * (J.seatH > 1 ? 1 - J.w : 1);   // no ground shadow while sitting up on a seat
  if (st.shadow !== false && shA > 0.01) {
    const cx = x + ((box[0] + box[2]) / 2) * s * f * 0.6, w = Math.max(M.width * 0.75, (box[2] - box[0]) * 0.5) * s;
    ctx.save(); ctx.fillStyle = `rgba(35,50,30,${shA})`; ctx.beginPath();
    ctx.ellipse(cx, y + 1, w * (1 - clamp(J.lift / 160, 0, 0.5)), Math.max(1.5, w * 0.16), 0, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(s * f, s);
  ctx.beginPath(); ctx.rect(-2000, -4000, 4000, 4000 + J.w * J.seatH + 1.5 * LW); ctx.clip();   // nothing passes through the ground
  const bk = p.bkFront >= 0.5, hB = p.hB, hF = p.hF;
  drawHairBehind(ctx, J, lk);
  if (lk.scarf) drawScarf(ctx, J, lk, 'back');
  if (lk.backpack) drawBackpack(ctx, J, lk, 'pack');
  if (!bk) drawArm(ctx, J, J.aB, true, lk, hB, 100);
  drawLeg(ctx, J, J.lB, true, lk, 120);
  drawNeck(ctx, J, lk);
  drawPelvis(ctx, J, lk);
  drawLeg(ctx, J, J.lF, false, lk, 140);
  if (lk.bottom === 'skirt' || lk.bottom === 'dress') drawSkirt(ctx, J, lk);
  drawTorso(ctx, J, lk);
  drawCollar(ctx, J, lk);
  if (lk.apron) drawApron(ctx, J, lk);
  if (lk.backpack) drawBackpack(ctx, J, lk, 'strap');
  if (lk.scarf) drawScarf(ctx, J, lk, 'front');
  const braids = lk.hairStyle === 'braids';
  if (braids) drawBraid(ctx, J, lk, false);
  drawHead(ctx, J, lk, ex, st);
  if (braids) drawBraid(ctx, J, lk, true);
  // What lies over the top of a sleeve drawn in front of the body (the scarf round the shoulders, the hair, the chin)
  // is drawn again over it, masked to that upper sleeve and its shoulder disc, outset by the sleeve's ink so none of
  // its outline survives, and never over the arm's own forearm and hand. The mask follows the sleeve and the redrawn
  // shapes keep their own ink, so there is no hard cut. They are drawn into a small offscreen layer that is masked and
  // composited once: redrawing cel-shaded shapes under a clip would blend twice along its soft edge and leave a seam.
  const over = (A, a, layers) => {
    const R = [...A.upX, ...(A.disc ? [A.disc.map(q => add(a.sh, mul(sub(q, a.sh), 1.08)))] : [])], m = ctx.getTransform();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const P of R) for (const [px, py] of P) { const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2;
    const w = Math.ceil(x1) + 2 - x0, h = Math.ceil(y1) + 2 - y0;
    if (!(w > 0 && h > 0 && w * h < 16e6)) return;
    const [cv, g] = canvas(w, h); g.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    layers(g);
    g.globalAlpha = 1; g.fillStyle = '#000';            // an opaque mask (the layers leave a translucent fill behind)
    g.globalCompositeOperation = 'destination-in'; union(g, R); g.fill();
    g.globalCompositeOperation = 'destination-out'; for (const P of A.keepX) { path(g, P); g.fill(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, x0, y0); ctx.restore();
  };
  if (bk) {                                           // the far arm in front: the scarf, the far braid and the head lie over its shoulder
    const A = drawArm(ctx, J, J.aB, true, lk, hB, 100);
    over(A, J.aB, g => { if (lk.scarf) drawScarf(g, J, lk, 'ring'); if (braids) drawBraid(g, J, lk, false); drawHead(g, J, lk, ex, st); });
  }
  const A = drawArm(ctx, J, J.aF, false, lk, hF, 180);
  if (lk.scarf || braids) over(A, J.aF, g => { if (lk.scarf) drawScarf(g, J, lk, 'ring'); if (braids) drawBraid(g, J, lk, true); });
  ctx.restore();
  return out;
}
// Solved joints in local units (contact at the origin, facing right), for tests, props and lint.
export function skeleton(pose = POSES.stand, params = {}, st = {}) {
  const lk = look(params), M = metrics(lk), J = solve(resolvePose({ ...st, pose }), M, st, lk);
  const leg = l => ({ hip: l.hip, knee: l.knee, ankle: l.ank, heel: l.heel, toe: l.toe }), arm = a => ({ shoulder: a.sh, elbow: a.el, wrist: a.wr });
  return { hip: J.hip, neck: J.neck, head: J.hc, mouth: J.HT(J.G.mouth), front: { leg: leg(J.lF), hand: J.aF.hand, arm: arm(J.aF) }, back: { leg: leg(J.lB), hand: J.aB.hand, arm: arm(J.aB) }, lift: J.lift, seat: J.seat, seatHeight: J.seatH, metrics: M };
}
// Garment outlines in local units (contact at the origin, facing right), for tests and lint: the cardigan when one is
// worn (outline, its open front's two edges from the hem to the chest, buttons, pocket, hem corners [back, front]) and
// the skirt / dress outline when one is worn.
export function clothes(pose = POSES.stand, params = {}, st = {}) {
  const lk = look(params), M = metrics(lk), J = solve(resolvePose({ ...st, pose }), M, st, lk), out = {};
  J.tor = torsoShape(J); LW = 1;
  if (lk.top === 'cardigan') {
    const L = cardiganLayout(J), S = []; for (let s = CARDIGAN_S0; s <= 0.9; s += 0.04) S.push(s);
    out.cardigan = { outline: cardiganShape(J).P, edgeNear: S.map(s => L.V(s, L.vn(s))), edgeFar: S.map(s => L.V(s, L.vf(s))), buttons: L.buttons, pocket: L.pocket, hem: [L.V(CARDIGAN_S0, -1), L.V(CARDIGAN_S0, 1)] };
  }
  if (lk.bottom === 'skirt' || lk.bottom === 'dress') out.skirt = skirtGeo(J, lk).P;
  return out;
}
function bbox(pose = {}, face = 1, params = {}) {
  const lk = look(params), M = metrics(lk), J = solve(resolvePose({ pose, t: 0 }), M, {}, lk), b = extent(J, lk);
  return face < 0 ? [-b[2], b[1], -b[0], b[3]] : b;
}

// ───────────────────────── poses ─────────────────────────
const lerpPose = (a, b, u) => { const p = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k] ?? POSE0[k], y = b[k] ?? POSE0[k]; p[k] = typeof x === 'number' && typeof y === 'number' ? lerp(x, y, u) : (u < 0.5 ? x : y); } return p; };
// A direct blend between a seated and an upright pose passes through RISE (hips just off the ground, torso over the
// feet), the way a person sits down or gets up. The path is a quadratic Bézier through RISE at u = 0.5: exact at both
// ends, smooth in between. Every other blend is a plain lerp. Weight-bearing feet stay put: in any blend between a
// seated pose and one on its feet, the feet keep their anchor until the seat takes the weight (the upright half of a
// sit ↔ stand, the first 40% of crouch → sit), then slide to where the seated pose puts them. RISE's hips sit a quarter
// of the way from the seated hips to the standing ones, so the hips never scoot back before they lift.
const RISE = { seat: 0.32, lean: 0.74, stoop: 0.12, tilt: -0.55, ik: 1, ikF: 0, ikB: 0, gy: 0.36, gyW: 0.6, tFx: 0.2, tFy: 0.36, tBx: 0.34, tBy: 0.36, pvF: 0, pvB: 1,
  hipF: 1.45, kneeF: 2.2, hipB: 1.3, kneeB: 2.05, fF: 0, fB: 0.3, hx: 0, plF: 1, plB: 1, shF: 0.82, elF: 0.5, shB: 0.75, elB: 0.55, shrug: 0.15 };
const upright = q => (q.seat ?? 0) < 0.5 && (q.gyW ?? 0) < 0.5 && (q.gait ?? 0) < 0.5 && Math.abs(q.lean ?? 0) < 0.6 && !(q.lift > 1) && !(q.liftL > 0.05);
export const mixPose = (a, b, u) => {
  const sa = a.seat ?? 0, sb = b.seat ?? 0;
  if (!(u > 0 && u < 1) || Math.abs(sa - sb) < 0.5) return lerpPose(a, b, u);
  const S = sa > sb ? a : b, F = S === a ? b : a, s = S === b ? u : 1 - u;   // s: progress toward the seated end
  const anchor = r0 => lerp(F.anchor ?? 0, S.anchor ?? 0, smooth(r0, 1, s));
  if (!upright(F)) { const q = lerpPose(a, b, u); q.anchor = anchor(0.4); return q; }
  const m = lerpPose(a, b, 0.5), q = {};
  for (const k in RISE) m[k] = RISE[k];
  m.hxL = 0.75 * (S.hxL ?? 0) + 0.25 * (F.hxL ?? 0);
  for (const k in m) {
    const x = a[k] ?? POSE0[k], y = b[k] ?? POSE0[k];
    if (typeof x !== 'number' || typeof y !== 'number') { q[k] = u < 0.5 ? x : y; continue; }
    const c = 2 * m[k] - (x + y) / 2;
    q[k] = (1 - u) * (1 - u) * x + 2 * u * (1 - u) * c + u * u * y;
  }
  q.anchor = anchor(0.5);
  return q;
};
const P = o => ({ ...POSE0, ...o });
export const POSES = {
  stand: P({ anchor: 1 }),
  'idle-weight-shift': P({ idle: 1, anchor: 1 }),
  // hips behind the contact point: it is where her feet stand when she gets up (and where they stood as she sat down)
  'sit-ground': P({ seat: 1, seatH: -1, hxL: -0.3, lean: -0.1, stoop: 0.14, tilt: 0.0, hipF: 1.72, kneeF: 1.6, hipB: 1.52, kneeB: 1.4, shF: 0.62, elF: 0.8, shB: 0.55, elB: 0.85 }),
  'sit-seat': P({ seat: 1, seatH: 0, lean: 0.0, stoop: 0.06, hipF: 1.52, kneeF: 1.4, hipB: 1.45, kneeB: 1.33, shF: 0.2, elF: 0.95, shB: 0.28, elB: 0.85 }),
  // a squat over the standing feet: the hips go back and down, the knees forward, the far heel lifts
  crouch: P({ lean: 0.62, stoop: 0.1, tilt: -0.5, ik: 1, anchor: 1, hxL: -0.2, gyW: 1, gy: 0.46, tFx: 0.13, tFy: 0.46, tBx: 0.25, tBy: 0.46, fB: 0.5, pvB: 1, shF: 1.02, elF: 0.55, shB: 0.95, elB: 0.6 }),
  kneel: P({ lean: 0.04, tilt: 0.04, hipB: -0.06, kneeB: 1.64, fB: 1.38, ikF: 1, gF: 1, tFx: 0.62, shF: 0.45, elF: 0.4, shB: 0.08, elB: 0.32, plB: 0 }),
  lie: P({ plF: 0, plB: 0, lean: -1.57, tilt: -0.05, hipF: 1.52, kneeF: 0.12, fF: -1.35, hipB: 1.46, kneeB: 0.3, fB: -1.2, shF: 0.36, elF: -0.48, shB: 0.05, elB: 0.1 }),
  sleep: P({ plF: 0, plB: 0, lean: -1.57, tilt: 0.05, hipF: 2.35, kneeF: 2.1, fF: -0.15, hipB: 1.5, kneeB: 0.25, fB: -1.2, shF: 0.5, elF: -0.42, shB: 0.32, elB: -0.3, sleep: 1 }),
  'look-up': P({ lean: -0.12, stoop: -0.04, tilt: -0.42, shF: -0.12, elF: 0.3, shB: 0.15, elB: 0.3 }),
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
  return P({ ik: 1, gait: 1, gyW: 1, gy: h, plF: 0, plB: 0, tFx: a.x, tFy: a.y, fF: a.f, pvF: a.pv, tBx: b.x, tBy: b.y, fB: b.f, pvB: b.pv,
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
  return P({ ik: 1, gait: 1, run: 1, gyW: 1, gy, plF: 0, plB: 0, tFx: a.x, tFy: a.y, fF: a.f, pvF: a.pv, tBx: b.x, tBy: b.y, fB: b.f, pvB: b.pv,
    lean: 0.24, tilt: -0.16, shF: -0.75 * c + 0.5, elF: 1.5 + 0.2 * c, hF: 2, shB: 0.75 * c + 0.5, elB: 1.5 - 0.2 * c, hB: 2 });
}
export const GAITS = { walk, run };

// ───────────────────────── gestures ─────────────────────────
const env = (u, a = 0.18, b = 0.2) => smooth(0, a, u) * (1 - smooth(1 - b, 1, u));
const over = (base, key, e) => { const p = { ...POSE0, ...base }; for (const k in key) p[k] = lerp(p[k] ?? 0, key[k], e); return p; };
// Point: the near arm rises to point along an aim (pose.aim, solved at draw time). The optional third argument picks
// it: { to: 'up' | 'sky' | 'ahead' | 'down' | an elevation (radians above the horizontal) | [x, y] (a target point
// in units from the contact point, facing right, y down) }. Without one the point follows the eyeline (st.tilt): up at
// the sky when she looks up, down at the tortoise when she looks at him, level when her gaze is. A named aim
// also lifts or drops the chin a little; the aim itself is set outright (only the arm's weight ramps), so the arm
// travels straight to it rather than sweeping through other angles.
function point(u, b = POSES.stand, o) {
  const to = o?.to, e = typeof to === 'number' ? to : AIM[to], tgt = Array.isArray(to) && to.length === 2 && to.every(Number.isFinite);
  const E = Number.isFinite(e) ? clamp(e, -1.3, 1.45) : null;
  const w = env(u, 0.2, 0.22), p = over(b, { aim: 1, lean: 0.05, tilt: -0.05 - (E === null ? 0 : 0.3 * clamp(E, -0.8, 1)) }, w);
  p.hF = w > 0.3 ? 3 : b.hF ?? POSE0.hF;              // the hand goes straight to pointing (no open palm or fist on the way)
  return Object.assign(p, tgt ? { aimT: 1, aimX: to[0], aimY: to[1], aimG: 0, aimE: 0 } : E !== null ? { aimE: E, aimG: 0, aimT: 0 } : { aimE: 0, aimG: 1, aimT: 0 });
}
const JUMP = {
  crouch: { hipF: 0.85, kneeF: 1.5, hipB: 0.8, kneeB: 1.45, lean: 0.38, tilt: -0.15, shF: -0.35, elF: 0.4, shB: -0.25, elB: 0.4 },
  air: { plF: 0, plB: 0, hipF: 0.75, kneeF: 1.35, hipB: 0.35, kneeB: 1.15, fF: 0.6, fB: 0.6, lean: -0.05, tilt: -0.22, shF: 2.7, elF: 0.15, hF: 1, shB: 2.55, elB: 0.2, hB: 1, joy: 1 },
  land: { hipF: 0.7, kneeF: 1.3, hipB: 0.65, kneeB: 1.25, lean: 0.28, shF: 1.9, elF: 0.3, shB: 1.7, elB: 0.3, joy: 1 },
};
export const GESTURES = {
  wave: { dur: 1.8, at: (u, b = POSES.stand) => { const e = env(u, 0.14, 0.16), p = over(b, { shF: 3.7, elF: -0.5, hF: 1, tilt: -0.06, joy: 1, shrug: 0.12 }, e); p.elF += 0.42 * Math.sin(TAU * 2.6 * u) * e; p.shF += 0.05 * Math.sin(TAU * 2.6 * u + 1) * e; return p; } },
  nod: { dur: 0.9, at: (u, b = POSES.stand) => { const p = over(b, {}, 0); p.tilt += 0.24 * (0.5 - 0.5 * Math.cos(TAU * 2 * u)); return p; } },
  'shake-head': { dur: 1.1, at: (u, b = POSES.stand) => { const p = over(b, { tilt: 0.06 }, env(u, 0.1, 0.1)); p.turn += -0.42 * Math.sin(TAU * 2.5 * u) * env(u, 0.1, 0.25); return p; } },
  shrug: { dur: 1.2, at: (u, b = POSES.stand) => over(b, { shrug: 1, shF: 0.45, elF: 1.55, hF: 1, shB: 0.32, elB: 1.5, hB: 1, tilt: 0.2, lean: -0.03 }, env(u, 0.3, 0.32)) },
  laugh: { dur: 1.8, at: (u, b = POSES.stand) => { const e = env(u, 0.12, 0.2), p = over(b, { lean: -0.12, tilt: -0.28, shF: 0.35, elF: 1.85, hF: 0, shB: 0.25, elB: 1.6, laugh: 1 }, e); p.lean += 0.04 * Math.sin(TAU * 6 * u) * e; p.tilt += 0.06 * Math.sin(TAU * 6 * u) * e; p.shrug += 0.35 * Math.abs(Math.sin(TAU * 3 * u)) * e; return p; } },
  'jump-for-joy': { dur: 1.3, at: (u, b = POSES.stand) => {      // crouch, spring up (pose.lift, units) with arms high, land, settle
    let p = over(b, JUMP.crouch, smooth(0, 0.2, u) * (1 - smooth(0.2, 0.36, u)));
    p = over(p, JUMP.air, smooth(0.18, 0.36, u) * (1 - smooth(0.62, 0.8, u)));
    p = over(p, JUMP.land, smooth(0.66, 0.8, u) * (1 - smooth(0.84, 1, u)));
    p.lift = (p.lift || 0) + 34 * Math.sin(Math.PI * clamp((u - 0.22) / 0.52));
    return p;
  } },
  point: { dur: 1.3, at: point },
  // shorthands for storyboards (a gesture beat passes only its name): at the sky, and down at something on the ground
  'point-up': { dur: 1.3, at: (u, b = POSES.stand) => point(u, b, { to: 'up' }) },
  'point-down': { dur: 1.3, at: (u, b = POSES.stand) => point(u, b, { to: 'down' }) },
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
  { label: 'child braids', age: 'child', skin: '#c99a72', hairStyle: 'braids', hair: '#3b2a20', scarf: '#5e7b3f', bottom: 'dress', dress: '#d9a441', shoes: null },
  { label: 'elder slight', age: 'elder', build: 'slight', skin: '#c99a72', hairStyle: 'bun', hair: '#d9d6d0', glasses: '#b08a3a', scarf: '#5e7b3f', shirt: '#cdbfa3', bottom: 'skirt', dress: '#5f6f8c' },
];
export async function humanSheet(outPath, { sections = ['cast', 'poses', 'gaits', 'gestures', 'faces', 'blends'], width = 2600 } = {}) {
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
  if (name === 'blends') for (const [age, idx] of [['elder', 12], ['child', 11]]) for (const [a, b] of [['stand', 'crouch'], ['crouch', 'sit-ground'], ['sit-ground', 'stand']]) {
    const n = 10;
    rows.push({ title: `blend — ${SAMPLE_CAST[idx].label}: ${a} → ${b} (mixPose, eased, ${n} frames)`, s: age === 'child' ? 1.25 : 1.0, h: 300, items: Array.from({ length: n }, (_, i) => fig(`${i}`, { params: SAMPLE_CAST[idx], st: { pose: mixPose(POSES[a], POSES[b], easeInOut(i / (n - 1))), t: 0.5 } })), cw: 230 });
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
