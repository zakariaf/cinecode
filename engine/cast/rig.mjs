// Rig contract helpers: registry, pose blending, idle life (breath + seeded blinks), the shared expression
// table, gait/IK helpers, and makeRig(), which wraps a rig's paint() into the contract's draw()/bbox().
import { clamp, lerp, rng } from '../core/lib.mjs';
import { limb, ell, rpoly } from '../core/lib.mjs';
import { groundShadow, setLineScale, lineScaleFor, cel, line } from '../core/style.mjs';

// Built-in rig kinds (the registry key used in film.json "rig").
export const RIG_KINDS = Object.freeze(['hare', 'tortoise', 'fox', 'owl', 'squirrel', 'songbird', 'mouse', 'hedgehog', 'badger', 'deer', 'frog', 'beetle', 'butterfly', 'human']);

const REG = new Map();
export function register(rig) {
  if (!rig || typeof rig.kind !== 'string' || typeof rig.draw !== 'function') throw new Error('register(rig): a rig needs a string kind and a draw() function');
  REG.set(rig.kind, rig);
  return rig;
}
// Returns the rig or undefined (use requireRig to throw).
export const getRig = kind => REG.get(kind);
export function requireRig(kind) { const r = REG.get(kind); if (!r) throw new Error(`unknown rig "${kind}" (known: ${listRigs().join(', ')})`); return r; }
export const listRigs = () => [...REG.keys()].sort();

// Blend two pose objects key by key (numbers lerp; keys missing on one side take the other's value).
export function mixPose(a, b, u) {
  if (!a) return b; if (!b) return a;
  const p = {};
  for (const k in a) { const va = a[k], vb = b[k]; p[k] = typeof va === 'number' ? lerp(va, typeof vb === 'number' ? vb : va, u) : (u < 0.5 || vb === undefined ? va : vb); }
  for (const k in b) if (!(k in a)) p[k] = b[k];
  return p;
}

// Stable 32-bit hash of a string or number (seeds per actor id).
export function seedOf(v) {
  if (typeof v === 'number') return (v * 2654435761) >>> 0;
  let h = 2166136261; const s = String(v);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Idle life: breathing phase 0..1 and seeded blinks every 2.5–5 s, each 0.15 s long (quick close, softer open).
export function idle(rig, t, seed = 0) {
  const period = rig?.breathPeriod ?? 3.2, sd = seedOf(seed);
  const ph = (sd % 1000) / 1000;
  const breath = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t / period + ph));
  const P = 3.75, k0 = Math.round(t / P);
  let blink = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const r = rng((sd ^ Math.imul(k + 7919, 0x9e3779b1)) >>> 0); r();
    const tb = k * P + (r() - 0.5) * 1.2, u = (t - tb) / 0.15;
    if (u >= 0 && u <= 1) blink = Math.max(blink, u < 0.4 ? Math.sin((u / 0.4) * Math.PI / 2) : Math.cos(((u - 0.4) / 0.6) * Math.PI / 2));
  }
  return { breath, blink };
}

// ───────────── expressions ─────────────
// Every rig maps these numbers onto its own eyes / brows / mouth:
//  eye: 'open'|'wide'|'happy'   lid: upper-lid closure   tilt: +1 angry slant, -1 sad slant
//  browY: -1..1 brow raise      browT: +1 angry (front end down), -1 worried (front end up)
//  smile: -1 frown .. 1 smile   open: mouth open 0..1    round: 'o' mouth 0..1   pupil: pupil size
export const FACES = {
  neutral:    { eye: 'open',  lid: 0.08, tilt: 0,    browY: 0,     browT: 0,    smile: 0.2,  open: 0,    round: 0,   pupil: 1 },
  happy:      { eye: 'open',  lid: 0.15, tilt: -0.2, browY: 0.35,  browT: -0.2, smile: 1,    open: 0.12, round: 0,   pupil: 1.05 },
  laugh:      { eye: 'happy', lid: 0,    tilt: 0,    browY: 0.55,  browT: -0.3, smile: 1,    open: 0.8,  round: 0,   pupil: 1 },
  sad:        { eye: 'open',  lid: 0.38, tilt: -0.8, browY: 0.35,  browT: -1,   smile: -0.8, open: 0,    round: 0,   pupil: 1.1 },
  surprised:  { eye: 'wide',  lid: 0,    tilt: 0,    browY: 1,     browT: -0.1, smile: 0,    open: 0.5,  round: 1,   pupil: 0.62 },
  angry:      { eye: 'open',  lid: 0.36, tilt: 1,    browY: -0.55, browT: 1,    smile: -0.7, open: 0.08, round: 0,   pupil: 0.95 },
  sleepy:     { eye: 'open',  lid: 0.66, tilt: -0.2, browY: -0.25, browT: -0.1, smile: 0.05, open: 0,    round: 0,   pupil: 1 },
  smug:       { eye: 'open',  lid: 0.45, tilt: 0.15, browY: 0.3,   browT: 0.35, smile: 0.85, open: 0,    round: 0,   pupil: 1 },
  worried:    { eye: 'open',  lid: 0.1,  tilt: -0.5, browY: 0.45,  browT: -0.9, smile: -0.45, open: 0.05, round: 0.3, pupil: 0.9 },
  scared:     { eye: 'wide',  lid: 0,    tilt: -0.3, browY: 0.85,  browT: -1,   smile: -0.6, open: 0.35, round: 0.6, pupil: 0.5 },
  determined: { eye: 'open',  lid: 0.3,  tilt: 0.55, browY: -0.35, browT: 0.6,  smile: -0.1, open: 0,    round: 0,   pupil: 1 },
};
export const EXPRESSIONS = Object.keys(FACES);

// Resolve the face for a frame from the draw state and pose. Poses may carry numeric face hints:
//  mo (mouth open), sm (smile add), eh (>0.5 → happy closed eyes), lid (lid add), brw (brow raise add).
export function faceOf(st = {}, pose = {}, face = 1) {
  const F = { ...(FACES[st.expr] || FACES.neutral) };
  if (pose.sm) F.smile = clamp(F.smile + pose.sm, -1, 1);
  if (pose.brw) F.browY = clamp(F.browY + pose.brw, -1, 1);
  if (pose.eh > 0.5) F.eye = 'happy';
  if (pose.lid) F.lid = Math.max(F.lid, pose.lid);
  const blink = clamp(st.blink || 0);
  if (blink > F.lid) { F.tilt *= 1 - blink; F.lid = blink; }
  const talk = st.talk > 0.05 ? clamp(st.talk) : 0;
  F.talk = talk;
  F.open = Math.max(talk ? F.open * 0.35 : F.open, talk, pose.mo || 0);
  if (talk) F.round *= 0.4;
  if (pose.mo > F.round) F.round *= 0.5;
  F.look = clamp((st.look || 0) * face, -1, 1);          // st.look is in screen direction; F.look is local (+ = forward)
  F.breath = st.breath || 0;
  return F;
}

// ───────────── gaits and limbs ─────────────
export const frac = x => x - Math.floor(x);
export const ease = v => v * v * (3 - 2 * v);
// Foot target for one leg at gait phase `ph`. During stance (the first `duty` of the leg's own cycle, starting at
// `off`) the foot is planted on y0 and sweeps backward exactly `stride` units per cycle — so when the actor moves
// `stride * s` per cycle the foot does not slide. During swing it arcs forward, `lift` units high.
export function footAt(ph, off, duty, stride, x0, lift, y0 = 0) {
  const q = frac(ph - off);
  if (q < duty) return { x: x0 + stride * (duty / 2 - q), y: y0, down: true, u: q / duty };
  const v = (q - duty) / (1 - duty);
  return { x: x0 + stride * duty * (ease(v) - 0.5), y: y0 - lift * Math.pow(Math.sin(Math.PI * v), 0.85), down: false, u: v };
}
// Two-bone IK: knee/elbow position for a limb from (ax, ay) to (bx, by). bend = +1 puts the joint toward local +x.
export function ik2(ax, ay, bx, by, l1, l2, bend = 1) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-6;
  const dm = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const s = (uy >= 0 ? 1 : -1) * bend;                 // joint side relative to the limb direction
  return [ax + ux * a + uy * h * s, ay + uy * a - ux * h * s];
}
// One leg of a gait schedule. leg = { off, duty, x0, lift, keys? }. Stance: planted at (x0 ± stride*duty/2, y0)
// sweeping back exactly `stride` per cycle. Swing: a ground arc (no keys), or keyed positions relative to the leg
// root (keys = [[v, [dx, dy]], ...], rootAt(ph) → [x, y]) blended from lift-off to touch-down. Never below y0.
export function legCycle(ph, leg, stride, rootAt, y0 = 0) {
  const q = frac(ph - leg.off);
  if (!leg.keys || q < leg.duty) return footAt(ph, leg.off, leg.duty, stride, leg.x0, leg.lift ?? 6, y0);
  const v = (q - leg.duty) / (1 - leg.duty), base = ph - q;
  const r0 = rootAt(base + leg.off + leg.duty), r1 = rootAt(base + leg.off + 1), r = rootAt(ph);
  const p0 = [leg.x0 - (stride * leg.duty) / 2 - r0[0], y0 - r0[1]], p1 = [leg.x0 + (stride * leg.duty) / 2 - r1[0], y0 - r1[1]];
  const K = [[0, p0], ...leg.keys, [1, p1]];
  let i = 0; while (i < K.length - 2 && v > K[i + 1][0]) i++;
  const A = K[i], B = K[i + 1], w = ease(clamp((v - A[0]) / (B[0] - A[0])));
  return { x: r[0] + lerp(A[1][0], B[1][0], w), y: Math.min(y0 - 0.01, r[1] + lerp(A[1][1], B[1][1], w)), down: false, u: v };
}
// Feet of a 4-leg schedule → pose keys f1x f1y c1 (near fore), f2* (far fore), h1* (near hind), h2* (far hind).
export function quadFeet(p, ph, legs, stride, roots) {
  for (const k of ['f1', 'f2', 'h1', 'h2']) {
    if (!legs[k]) continue;
    const f = legCycle(ph, legs[k], stride, roots[k]);
    p[k + 'x'] = f.x; p[k + 'y'] = f.y; p['c' + k] = f.down ? 1 : 0; p[k + 'u'] = f.down ? 0 : Math.sin(Math.PI * f.u);
  }
  return p;
}
// A limb segment like lib's limb() but with a gentle wobble, for parts that touch the ground (feet).
export function bone(x1, y1, x2, y2, w1, w2, r, seed = 0, jit = 0.4) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / d, ny = (x2 - x1) / d;
  return rpoly([[x1 + nx * w1, y1 + ny * w1], [x2 + nx * w2, y2 + ny * w2], [x2 - nx * w2, y2 - ny * w2], [x1 - nx * w1, y1 - ny * w1]], r, { seed, jit });
}
// A tapered tube through a polyline with a half-width per vertex (rounded joints), as one closed outline.
export function tube(pts, ws, seed = 1, jit = 0.25) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    // at interior joints, widen a little on the outside of the bend so the joint stays round
    L.push([pts[i][0] - dy * ws[i], pts[i][1] + dx * ws[i]]); R.push([pts[i][0] + dy * ws[i], pts[i][1] - dx * ws[i]]);
  }
  const e = pts[n - 1], f = pts[0], de = [e[0] - pts[n - 2][0], e[1] - pts[n - 2][1]], dl = Math.hypot(...de) || 1;
  const cap = [e[0] + (de[0] / dl) * ws[n - 1] * 0.8, e[1] + (de[1] / dl) * ws[n - 1] * 0.8];
  const df = [f[0] - pts[1][0], f[1] - pts[1][1]], dfl = Math.hypot(...df) || 1, cap0 = [f[0] + (df[0] / dfl) * ws[0] * 0.8, f[1] + (df[1] / dfl) * ws[0] * 0.8];
  return rpoly([...L, cap, ...R.reverse(), cap0], ws.map(w => w * 0.9).concat([ws[n - 1]], ws.slice().reverse().map(w => w * 0.9), [ws[0]]), { seed, jit, step: 3 });
}
// Draw a jointed leg from its root to a ground contact point `foot` (the bottom of the paw/hoof), as one tapered
// outline with an optional darker "sock" on the lower part.
// o: { l1, l2, meta (metatarsal length, 0 = none), ma (its angle from vertical, + = paw ahead of the ankle),
//      bend (+1 joint forward, -1 back), w: [root, knee, ankle, paw] half-widths, col, low (lower-leg colour),
//      lowFrom (0..1 along knee→ankle where `low` starts), paw: [rx, ry] | null, hoof, sh, seed,
//      curl (0..1 swing flex) with curlA (radians of paw flex per unit curl) }
export function leg(T, root, foot, o) {
  const [pr, py] = o.paw || [0, 0], meta = o.meta || 0, ma = (o.ma || 0) + (o.curl || 0) * (o.curlA ?? -1.1);
  // keep the ankle and the tube's end cap above the ground (y = 0) whatever the foot angle
  const pc = [foot[0], foot[1] - (meta ? Math.max(py, o.w[3] * 0.8 * Math.max(0, Math.cos(ma)) + 0.5, o.w[3] * Math.abs(Math.sin(ma)) + 0.3) : py)];
  const ank = meta ? [pc[0] - Math.sin(ma) * meta, Math.min(pc[1] - Math.cos(ma) * meta, -o.w[2] - 0.5)] : pc;
  const knee = ik2(root[0], root[1], ank[0], ank[1], o.l1, o.l2, o.bend);
  const w = o.w, sh = o.sh ?? 2, sd = o.seed || 1, low = o.low || o.col;
  if (knee[1] > -w[1] - 0.6) knee[1] = -w[1] - 0.6;                 // a knee never goes through the ground
  const pts = meta ? [root, knee, ank, pc] : [root, knee, ank], ws = meta ? [w[0], w[1], w[2], w[3]] : [w[0], w[1], w[2]];
  const Tb = tube(pts, ws, sd);
  cel(T, Tb, o.col, sh, 0, sd);
  const lf = o.lowFrom ?? 1;
  if (low !== o.col && lf < 1.5) {
    T.save(); T.beginPath(); Tb.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
    const m = lf <= 1 ? [knee[0] + (ank[0] - knee[0]) * lf, knee[1] + (ank[1] - knee[1]) * lf] : [ank[0] + (pc[0] - ank[0]) * (lf - 1), ank[1] + (pc[1] - ank[1]) * (lf - 1)];
    const tail = lf <= 1 ? [m, ank, ...(meta ? [pc] : [])] : [m, pc];
    const dx = tail[1][0] - m[0], dy = tail[1][1] - m[1], d = Math.hypot(dx, dy) || 1, W = Math.max(...ws) * 3;
    const cut = [[m[0] - (dy / d) * W, m[1] + (dx / d) * W], [m[0] + (dy / d) * W, m[1] - (dx / d) * W]];
    const e = tail[tail.length - 1];
    cel(T, [cut[0], cut[1], [e[0] + (dy / d) * W + dx / d * W, e[1] - (dx / d) * W + dy / d * W], [e[0] - (dy / d) * W + dx / d * W, e[1] + (dx / d) * W + dy / d * W]], low, sh, 0, sd + 2);
    T.restore();
  }
  line(T, [...Tb, Tb[0]], o.ink ?? 1.05, { seed: sd, taper: false });
  if (o.hoof) { const H = [[pc[0] - pr, pc[1] - py * 0.2], [pc[0] + pr * 0.9, pc[1] - py * 0.3], [pc[0] + pr * 1.2, foot[1]], [pc[0] - pr * 1.05, foot[1]]]; cel(T, H, o.hoof, sh * 0.5, o.ink ?? 1, sd + 4); }
  else if (pr) { const pa = (o.curl || 0) * (o.curlA ?? -1.1) * 0.4, ext = Math.hypot(pr * Math.sin(pa), py * Math.cos(pa)); cel(T, ell(pc[0] + pr * 0.3, Math.min(pc[1], foot[1] - ext), pr, py, sd + 4, 0.15, pa), o.pawCol || low, sh * 0.6, (o.ink ?? 1) * 0.9, sd + 4); }
  return { knee, ank, pc };
}
// A tail (or any soft appendage) along a bending spine. It leaves `base` at angle a0 (0 = straight back, + up;
// local +x is forward) and turns by `bend` radians along its length L. Points that would go below the ground lie on
// it. wf(u) gives the half-width along it. Returns { poly, pts, ws }.
export function spine(base, a0, bend, L, wf, { n = 16, ground = true, wave = 0, t = 0 } = {}) {
  const pts = [], ws = [];
  let x = base[0], y = base[1];
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = wf(u);
    pts.push([x, ground ? Math.min(y, -w - 0.45) : y]); ws.push(w);
    const th = a0 + bend * u + wave * Math.sin(t * 2.3 - u * 3) * u;
    x += -Math.cos(th) * (L / n); y += -Math.sin(th) * (L / n);
  }
  const Lf = [], Rt = [];
  for (let i = 0; i <= n; i++) {
    const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n, i + 1)], dx = q1[0] - q0[0], dy = q1[1] - q0[1], d = Math.hypot(dx, dy) || 1;
    Lf.push([pts[i][0] - (dy / d) * ws[i], pts[i][1] + (dx / d) * ws[i]]); Rt.push([pts[i][0] + (dy / d) * ws[i], pts[i][1] - (dx / d) * ws[i]]);
  }
  const e = pts[n], d = [pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]], dl = Math.hypot(...d) || 1;
  const poly = rpoly([...Lf, [e[0] + (d[0] / dl) * ws[n] * 0.9, e[1] + (d[1] / dl) * ws[n] * 0.9], ...Rt.reverse()], 2.5, { seed: 7, jit: 0.4, step: 3 });
  return { poly, pts, ws };
}
// Smooth keyed sequence for gestures: keys = [[u, pose], ...] (u ascending, first 0, last 1). Poses may be
// functions of the base pose. Returns the eased blend at u.
export function keyed(u, keys, base) {
  u = clamp(u);
  const val = k => (typeof k[1] === 'function' ? k[1](base) : k[1]);
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], w = clamp((u - a[0]) / ((b[0] - a[0]) || 1));
  return mixPose(val(a), val(b), ease(w));
}
// Gesture from keys, each a delta function of the base pose. Base defaults to the rig's stand pose.
export const gest = (dur, keys) => ({ dur, keys: keys.map(k => k[0]).filter(u => u > 0 && u < 1), at: null, _keys: keys });
// Add deltas to a base pose: d = { key: delta } (or { key: [value] } for an absolute value).
export function plus(base, d) {
  const p = { ...base };
  for (const k in d) p[k] = Array.isArray(d[k]) ? d[k][0] : (p[k] ?? 0) + d[k];
  return p;
}
// A common jump: crouch, launch, airborne (lift), land, settle. `crouch`/`air` are delta objects.
export function jumpAt(u, base, { h = 30, crouch = {}, air = {} } = {}) {
  const lift = u > 0.25 && u < 0.78 ? h * Math.sin(Math.PI * (u - 0.25) / 0.53) : 0;
  const c = u < 0.25 ? ease(u / 0.25) : u < 0.33 ? 1 - ease((u - 0.25) / 0.08) : u > 0.78 ? (u < 0.86 ? ease((u - 0.78) / 0.08) : 1 - ease((u - 0.86) / 0.14)) : 0;
  const a = u > 0.27 && u < 0.8 ? Math.sin(Math.PI * (u - 0.27) / 0.53) : 0;
  const p = mixPose(base, plus(base, crouch), c * 0.999 + 1e-3);
  const q = mixPose(p, plus(p, air), a);
  q.lift = (base.lift || 0) + lift;
  return q;
}

// ───────────── bounds-tracking context ─────────────
// Wraps a 2D context (or null): forwards every call and records the screen-space bounds of everything filled,
// stroked or used as a clip (fills inside a clip are bounded by that clip). Also gives rigs the local→screen
// mapping (head/mouth anchors) and the light direction for cel shading.
export class Tee {
  constructor(ctx, s0 = 1) { this.c = ctx; this.m = [1, 0, 0, 1, 0, 0]; this.st = []; this.clip0 = 0; this.p = []; this.s0 = s0; this.b = [Infinity, Infinity, -Infinity, -Infinity]; }
  map(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  _mul(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
  _pt(x, y) { const [X, Y] = this.map(x, y); this.p.push(X, Y); }
  _add(pad = 0) { const p = this.p, b = this.b; for (let i = 0; i < p.length; i += 2) { const x = p[i], y = p[i + 1]; if (x - pad < b[0]) b[0] = x - pad; if (y - pad < b[1]) b[1] = y - pad; if (x + pad > b[2]) b[2] = x + pad; if (y + pad > b[3]) b[3] = y + pad; } }
  box() { const b = this.b; return b[0] === Infinity ? null : b.slice(); }
  // light from the upper left of the screen, `k` units of the root frame → local offset
  lightShift(k) {
    const m = this.m, det = m[0] * m[3] - m[1] * m[2] || 1, K = k * this.s0;
    return [(-K * m[3] + K * m[2]) / det, (K * m[1] - K * m[0]) / det];
  }
  save() { this.st.push([this.m, this.clip0]); this.c?.save(); }
  restore() { const s = this.st.pop(); if (s) { this.m = s[0]; this.clip0 = s[1]; } this.c?.restore(); }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); this.c?.translate(x, y); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this._mul(c, s, -s, c, 0, 0); this.c?.rotate(a); }
  scale(x, y) { this._mul(x, 0, 0, y, 0, 0); this.c?.scale(x, y); }
  transform(a, b, c, d, e, f) { this._mul(a, b, c, d, e, f); this.c?.transform(a, b, c, d, e, f); }
  getTransform() { const m = this.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; }
  beginPath() { this.p = []; this.c?.beginPath(); }
  moveTo(x, y) { this._pt(x, y); this.c?.moveTo(x, y); }
  lineTo(x, y) { this._pt(x, y); this.c?.lineTo(x, y); }
  closePath() { this.c?.closePath(); }
  quadraticCurveTo(a, b, x, y) { this._pt(a, b); this._pt(x, y); this.c?.quadraticCurveTo(a, b, x, y); }
  bezierCurveTo(a, b, c, d, x, y) { this._pt(a, b); this._pt(c, d); this._pt(x, y); this.c?.bezierCurveTo(a, b, c, d, x, y); }
  arc(x, y, r, a0, a1, ccw) { this._ell(x, y, r, r, 0); this.c?.arc(x, y, r, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw) { this._ell(x, y, rx, ry, rot); this.c?.ellipse(x, y, rx, ry, rot, a0, a1, ccw); }
  _ell(x, y, rx, ry, rot) { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, px = Math.cos(a) * rx, py = Math.sin(a) * ry; this._pt(x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)); } }
  rect(x, y, w, h) { this._pt(x, y); this._pt(x + w, y + h); this._pt(x + w, y); this._pt(x, y + h); this.c?.rect(x, y, w, h); }
  fill(rule) { if (!this.clip0) this._add(); rule ? this.c?.fill(rule) : this.c?.fill(); }
  stroke() { if (!this.clip0) this._add((this.lineWidth || 1) * this.s0 / 2); this.c?.stroke(); }
  clip(rule) { if (!this.clip0) this._add(); this.clip0++; rule ? this.c?.clip(rule) : this.c?.clip(); }
  fillRect(x, y, w, h) { if (!this.clip0) { const p = this.p; this.p = []; this.rect(x, y, w, h); this._add(); this.p = p; } this.c?.fillRect(x, y, w, h); }
  createLinearGradient(...a) { return this.c ? this.c.createLinearGradient(...a) : { addColorStop() {} }; }
  createRadialGradient(...a) { return this.c ? this.c.createRadialGradient(...a) : { addColorStop() {} }; }
}
for (const k of ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap', 'lineJoin', 'filter']) {
  Object.defineProperty(Tee.prototype, k, { get() { return this['_' + k]; }, set(v) { this['_' + k] = v; if (this.c) this.c[k] = v; } });
}

// ───────────── makeRig ─────────────
// spec: the contract fields plus
//   paint(T, pose, F, o)   draws in local units (origin = contact point, +x forward, ground y = 0).
//                          o = { st, P (params), face, t, out }; set o.out.head / o.out.mouth = T.map(x, y).
//   shadowW               ground-shadow half width in units (default width / 2)
//   feet(pose)            optional: [[x, y], ...] foot contact points in units (y = 0 on the ground)
export function makeRig(spec) {
  const base = spec.poses.stand || Object.values(spec.poses)[0];
  const cache = new WeakMap();
  const rig = {
    perch: false, flies: false, expressions: EXPRESSIONS, breathPeriod: 3.2, ...spec,
    draw(ctx, x, y, s, face = 1, st = {}) {
      face = face < 0 ? -1 : 1;
      const pose = !st.pose || st.pose === base ? base : { ...base, ...st.pose };
      const P = st.params ? { ...spec.params, ...st.params } : spec.params;
      const lift = (st.lift || 0) + (pose.lift || 0);
      if (ctx && st.shadow !== false && !spec.noShadow) groundShadow(ctx, x, y, (spec.shadowW ?? spec.width * 0.5) * s * (P.size || 1), lift * (P.size || 1), spec.shadowA ?? 0.26);
      const T = new Tee(ctx, s * (P.size || 1)), prev = setLineScale(lineScaleFor(s * (P.size || 1)));
      const out = {};
      try {
        T.save(); T.translate(x, y - lift * s * (P.size || 1)); T.scale(s * face * (P.size || 1), s * (P.size || 1));
        const F = faceOf(st, pose, face);
        spec.paint(T, pose, F, { st, P, face, t: st.t || 0, out, s });
        T.restore();
      } finally { setLineScale(prev); }
      const b = T.box() || [x, y, x, y];
      return { head: out.head || [x, b[1]], mouth: out.mouth || out.head || [x, b[1]], bounds: b };
    },
    bbox(pose, face = 1) {
      const key = pose && typeof pose === 'object' ? pose : base;
      let b = cache.get(key);
      if (!b) { b = rig.draw(null, 0, 0, 1, 1, { pose: key, shadow: false }).bounds; cache.set(key, b); }
      return face < 0 ? [-b[2], b[1], -b[0], b[3]] : b.slice();
    },
  };
  if (spec.gestures) for (const g of Object.values(spec.gestures)) if (!g.at && g._keys) { const ks = g._keys; g.at = (u, b = base) => keyed(u, ks.map(([k, f]) => [k, typeof f === 'function' ? f : (f ? bb => plus(bb, f) : bb => bb)]), b); }
  return rig;
}
