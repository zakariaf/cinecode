// The Tortoise. Legacy shell and head, now with planted-foot walking, a neck that stretches and withdraws (the
// head hides inside the shell), a beak that opens to talk, heavy wise brows, blinks and expressions.
import { clamp, lerp, ell, rpoly, arcPts } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, tube, mixPose, plus, jumpAt, ease } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 2.2;

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

// ── drawing ──
function legDraw(T, root0, foot, col, seed, tuck, P) {
  const root = [root0[0], Math.min(root0[1], -7.9)];          // a low (sitting) shell: legs leave from under its rim
  const f = [lerp(foot[0], root[0], tuck * 0.6), lerp(foot[1], root[1] + 2, tuck * 0.85)];
  const sl = Math.abs(f[0] - root[0]) / (Math.hypot(f[0] - root[0], f[1] - root[1]) || 1), pc = [f[0] + 1, f[1] - Math.max(4.4, 6.2 * sl + 0.9)];
  const L = tube([root, [lerp(root[0], pc[0], 0.55) - 0.5, lerp(root[1], pc[1], 0.55)], pc], [7.2, 6.4, 6.2], seed, 0.3);
  cel(T, L, col, SH, 1.1, seed);
  for (let k = 0; k < 3; k++) line(T, [[root[0] - 4 + k * 3, lerp(root[1], pc[1], 0.35 + k * 0.08)], [root[0] - 1 + k * 3, lerp(root[1], pc[1], 0.42 + k * 0.08)]], 0.5, { seed: seed + 9 + k, color: 'rgba(80,80,40,.45)' });
  cel(T, ell(pc[0] + 0.5, pc[1] + 0.9, 7.2, 3.4, seed + 1, 0.2), col, SH, 1, seed + 1);
  for (let k = -1; k <= 1; k++) dot(T, pc[0] + 5 + k * 2.4, pc[1] + 2.4, 0.95, P.claw);
}
function head(T, p, F, P, o, R) {
  const L = 22 * p.nl, a = p.na, base = R.neck, hpos = add(base, [Math.cos(a) * L, -Math.sin(a) * L]);
  const hx = hpos[0] + 5, hy = hpos[1] - 4;
  if (p.nl > 0.12) {
    const mid = add(base, [Math.cos(a) * L * 0.55, -Math.sin(a) * L * 0.55 + 1.5]);
    const N = tube([base, mid, [hx - 6, hy + 2]], [7.4, 6.4, 6], 106, 0.3);
    cel(T, N, P.skin, SH, 1.1, 106);
    for (let k = 0; k < 4; k++) { const q = add(base, [Math.cos(a) * L * (0.2 + k * 0.17), -Math.sin(a) * L * (0.2 + k * 0.17)]); line(T, [[q[0] - 1, q[1] - 4], [q[0] + 0.5, q[1] + 3]], 0.55, { seed: 300 + k, color: 'rgba(80,80,40,.5)' }); }
  }
  T.save(); T.translate(hx, hy - F.breath * 0.4); T.rotate(p.hr + (p.nl < 0.5 ? 0 : -F.look * 0.1));
  const op = clamp(F.open), sm = F.smile;
  const hinge = [-3, 3.6], ja = op * 0.42, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  if (op > 0.03) {
    const M = [hinge, [4, 3.4], [10.4, 2.6], jr([10, 3.6]), jr([3, 5])];
    fillP(T, M, '#5a2626');
    T.save(); T.beginPath(); M.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip(); fillP(T, ell(...jr([4, 5.4]), 4.5, 1.8, 117, 0.1), '#c9786e'); T.restore();
    cel(T, rpoly([[-4, 3.2], [10.2, 3.2], [8.6, 6], [2, 8.2], [-5, 7]], [2, 1.2, 2, 3, 2], { seed: 118, jit: 0.2 }).map(jr), lighten(P.skin, 0.12), SH * 0.5, 1, 118);
    cel(T, rpoly([[-10, -3], [-4, -8.4], [6, -7.6], [11.2, -2.4], [10.6, 3.2], [-6, 4.2]], [4, 4, 4, 3, 1.5, 3], { seed: 113, jit: 0.3 }), P.skin, SH, 1.15, 113);
  } else {
    cel(T, ell(0, 0, 11, 8.6, 113, 0.3), P.skin, SH, 1.15, 113);
    line(T, [[10.6, 2.4], [6.5, 3.9 + Math.max(0, -sm) * 0.4], [2.5, 4.0 - 0.3 * sm], [0.5, 3.6 - 1.6 * sm]], 0.8, { seed: 116 });
    if (F.round > 0.5) dot(T, 8.2, 4.4, 1.2, '#5a2626');
  }
  for (const [px, py] of [[-4, -4], [-1, 3.5], [-6, 2], [-7.5, -1.5]]) dot(T, px, py, 1.05, 'rgba(90,85,50,.5)');
  dot(T, 9.6, -1.6, 0.6, 'rgba(40,40,20,.7)');
  if (sm > 0.5) fillP(T, ell(1.5, 2, 2.6, 1.6, 119, 0.1), rgba('#e08a70', 0.3 * (sm - 0.4)));
  eye(T, 4.6, -2.6, 1.9, 2.5, F.eye, P.eye, F.look * 0.6, Math.max(F.lid, 0.12), F.tilt);
  line(T, [[2.2, 0.6], [4.8, 1.3], [7, 0.4]], 0.55, { seed: 114, color: 'rgba(60,60,30,.6)' });           // lower lid wrinkle
  brow(T, 4.4, -6.3, 6.8, F.browY * 0.75, F.browT * 0.8, darken(P.skin, 0.45), 1.55, 115);
  o.out.head = T.map(0, 0); o.out.mouth = T.map(6, 3.6 + op * 2);
  T.restore();
}
function shell(T, p, P) {
  const M = shellM(p);
  T.save(); T.translate(0, p.by); T.translate(0, -14); T.rotate(p.br); T.translate(0, 14);
  const S = rpoly([...arcPts(0, -20, 38, 30, Math.PI, Math.PI * 2, 6), [38, -14], [-38, -12]], 6, { seed: 107, jit: 0.8 });
  cel(T, S, P.shell, SH, 0, 107);
  T.save(); T.beginPath(); S.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const sc = [[-22, -27, 11, 0.06], [0, -38, 11, 0.12], [22, -27, 11, 0.06], [-11, -22, 9, 0.14], [11, -22, 9, 0.14], [-30, -16, 8, 0], [30, -16, 8, 0]];
  for (const [cx, cy, rr, l] of sc) {
    const hex = rpoly(Array.from({ length: 6 }, (_, k) => [cx + Math.cos((k * Math.PI) / 3) * rr, cy + Math.sin((k * Math.PI) / 3) * rr * 0.8]), 3, { seed: cx * 3 + cy, jit: 0.5 });
    cel(T, hex, lighten(P.shell, l), SH * 0.5, 0.9, cx + cy + 200);
    line(T, [[cx - rr * 0.4, cy - rr * 0.35], [cx + rr * 0.2, cy - rr * 0.5]], 0.6, { seed: cx + 300, color: 'rgba(230,235,190,.55)' });
    for (let k = 0; k < 2; k++) line(T, [[cx - rr * 0.55 + k * 1.5, cy + rr * 0.15 + k * 2], [cx + rr * 0.5 - k * 1.5, cy + rr * 0.15 + k * 2]], 0.45, { seed: cx + 320 + k, color: 'rgba(40,60,30,.35)' });
  }
  for (let i = 0; i < 8; i++) { const a = Math.PI + ((i + 0.5) * Math.PI) / 8; line(T, [[Math.cos(a) * 32, -20 + Math.sin(a) * 24], [Math.cos(a) * 38, -20 + Math.sin(a) * 30]], 0.8, { seed: 310 + i }); }
  T.restore();
  line(T, [...S, S[0]], 1.4, { seed: 107, taper: false });
  cel(T, rpoly([[-40, -16], [40, -18], [37, -9], [-37, -8]], 4, { seed: 108, jit: 0.4 }), P.rim, SH, 1.1, 108);
  for (let i = 0; i < 7; i++) line(T, [[-30 + i * 10, -16.5 + i * -0.2], [-29.5 + i * 10, -9]], 0.55, { seed: 330 + i, color: 'rgba(90,70,30,.45)' });
  T.restore();
}
function paint(T, p, F, o) {
  const { P } = o, R = roots(p);
  const tuck = p.lt;
  legDraw(T, R.h2, [p.h2x, p.h2y], darken(P.skin, 0.82), 101, tuck, P);
  legDraw(T, R.f2, [p.f2x, p.f2y], darken(P.skin, 0.82), 103, tuck, P);
  const tl = R.tail; cel(T, [[tl[0] + 2, tl[1] - 2], [tl[0] - 9, tl[1] + 2 + p.ta * 4], [tl[0] + 2, tl[1] + 5]], P.skin, SH, 1, 105);
  if (p.nl < 0.45) head(T, p, F, P, o, R);
  shell(T, p, P);
  legDraw(T, R.h1, [p.h1x, p.h1y], P.skin, 109, tuck, P);
  legDraw(T, R.f1, [p.f1x, p.f1y], P.skin, 111, tuck, P);
  if (p.nl >= 0.45) head(T, p, F, P, o, R);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'tortoise', label: 'Tortoise',
  height: 50, headHeight: 22, width: 96, shadowW: 50,
  breathPeriod: 4.5,
  params: { skin: '#a7a36a', shell: '#6f8a46', rim: '#d8c58c', claw: '#e8e0c0', eye: '#2a1e16' },
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
  paint,
});
