// The Hedgehog. Legacy spiny dome and pointed face as a full rig: tiny legs that trot under the skirt with planted
// feet, spines that bristle, a curl into a ball (face and legs tucked away), sniffing, talking and expressions.
// Round 2 (DESIGN §9.2): st.tilt pitches the face (not when curled); the pupils follow (+1 up, -1 down).
import { clamp, lerp, ell, rpoly, arcPts } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, mixPose, plus, jumpAt, ease, pitchPose, gaze } from './rig.mjs';

const SH = 1.4;
// Pose: by body drop, br pitch, ball 0..1 (curl), sp spines raised 0..1, head (hx, hy, hr), paws f1/f2/h1/h2.
const D = { by: 0, br: 0, ball: 0, sp: 0.2, hx: 14, hy: -8.5, hr: 0, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const FEET = (f1, f2, h1, h2) => ({ f1x: f1, f1y: 0, f2x: f2, f2y: 0, h1x: h1, h1y: 0, h2x: h2, h2y: 0 });
const bodyC = p => [0, -11.5 + p.by];
const roots = p => { const c = bodyC(p), r = [[8.5, 6.2], [10.5, 5.6], [-8, 6.4], [-6, 5.8]].map(([x, y]) => [c[0] + x * Math.cos(p.br) - y * Math.sin(p.br), c[1] + x * Math.sin(p.br) + y * Math.cos(p.br)]); return { f1: r[0], f2: r[1], h1: r[2], h2: r[3] }; };
export const POSES = {
  stand: P0({ ...FEET(9, 11, -8, -6) }),
  alert: P0({ by: -1.2, br: -0.06, sp: 0.8, hx: 15, hy: -11.5, hr: -0.25, ...FEET(9, 11, -8, -6), lid: 0 }),
  sit: P0({ by: 3.5, sp: 0.1, hx: 14, hy: -6, hr: 0.1, ...FEET(10, 12, -9, -7) }),
  ball: P0({ by: 0.2, ball: 1, sp: 1, hx: 7, hy: -9, hr: 0.9, ...FEET(3, 4, -3, -2) }),
  sleep: P0({ by: 0.2, ball: 1, sp: 0.4, hx: 7, hy: -9, hr: 0.9, ...FEET(3, 4, -3, -2), lid: 1 }),
};
POSES.rest = POSES.sit;

const G = { walk: { stride: 7, speed: 18 }, run: { stride: 12, speed: 42 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).f1, f2: ph => roots(body(ph)).f2, h1: ph => roots(body(ph)).h1, h2: ph => roots(body(ph)).h2 });
const mk = (amp, sp) => ph => { const p = { ...POSES.stand }; p.by = -amp * Math.abs(Math.cos(Math.PI * 2 * ph)); p.br = 0.02 * Math.sin(Math.PI * 2 * ph); p.hy = -8.5 + 0.3 * Math.sin(Math.PI * 4 * ph); p.sp = sp; return p; };
const walkBody = mk(0.4, 0.25), runBody = mk(0.8, 0.45);
function walk(ph) { return quadFeet(walkBody(ph), ph, { f1: { off: 0, duty: 0.55, x0: 9, lift: 1.5 }, h2: { off: 0, duty: 0.55, x0: -6, lift: 1.5 }, f2: { off: 0.5, duty: 0.55, x0: 11, lift: 1.5 }, h1: { off: 0.5, duty: 0.55, x0: -8, lift: 1.5 } }, G.walk.stride, rootsAt(walkBody)); }
function run(ph) { return quadFeet(runBody(ph), ph, { f1: { off: 0, duty: 0.45, x0: 9.5, lift: 2.2 }, h2: { off: 0, duty: 0.45, x0: -5.5, lift: 2.2 }, f2: { off: 0.5, duty: 0.45, x0: 11.5, lift: 2.2 }, h1: { off: 0.5, duty: 0.45, x0: -7.5, lift: 2.2 } }, G.run.stride, rootsAt(runBody)); }

// dome outline: skirt (b = 0) morphs to a ball (b = 1); spiky = jagged silhouette
function dome(p, spiky) {
  const c = bodyC(p), b = clamp(p.ball), n = 44, P = [];
  const rx = lerp(17.5, 13, b), ry = lerp(12.5, 12.6, b), cy = lerp(c[1] + 3, -12.8, b), sp = 1 + p.sp * 0.6;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / n) * Math.PI * 2;
    let x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    const top = Math.sin(a) < 0.05 || b > 0.5;
    if (y > 0) y *= lerp(0.35, 1, b);                            // flat-ish skirt underneath, round when curled
    if (spiky && top && y < 2) { const k = (i % 2 ? 1 : 0) * 2.6 * sp; const d = Math.hypot(x, y) || 1; x += (x / d) * k; y += (y / d) * k; }
    P.push([x + c[0], y + cy]);
  }
  return P.map(([x, y]) => [x * Math.cos(p.br) - (y - c[1]) * Math.sin(p.br), c[1] + x * Math.sin(p.br) + (y - c[1]) * Math.cos(p.br)]);
}
function face(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.3); T.rotate(p.hr - F.look * 0.1);
  const op = clamp(F.open), sm = F.smile;
  const Fc = rpoly([[-6, -5.5], [3, -3.8], [11.5, 0.2], [10.5, 2.6], [2, 4.4], [-6, 4]], [3, 3, 1, 1.2, 3, 3], { seed: 230, jit: 0.2 });
  cel(T, Fc, P.face, SH, 1, 230);
  if (op > 0.03) {
    const M = ell(7.4, 2.7 + op * 0.6, 1.4 + op * 0.4, 0.45 + op * 0.8, 233, 0.03); fillP(T, M, '#5e2026');
    T.save(); T.beginPath(); M.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip(); fillP(T, ell(7.2, 3.4 + op * 1.2, 1.4, 0.6, 234, 0.02), '#d0707a'); T.restore();
    line(T, [...M, M[0]], 0.5, { seed: 233, taper: false });
  } else line(T, [[9.6, 2.3], [7.4, 2.9], [5.2, 2.8 - 0.9 * sm]], 0.55, { seed: 235 });
  dot(T, 11.2, 1.1, 1.5, '#1a1210'); dot(T, 11.5, 0.6, 0.45, 'rgba(255,255,255,.5)');
  if (sm > 0.5) fillP(T, ell(2.6, 1.6, 2, 1.1, 236, 0.05), rgba('#e08a80', 0.35 * (sm - 0.4)));
  eye(T, 3, -1.4, 1.25, 1.55, F.eye, '#1a1210', gaze(F, 0.3, 1.55), F.lid, F.tilt, { w: 0.75 });
  brow(T, 2.9, -3.9, 3, F.browY * 0.7, F.browT * 0.75, darken(P.face, 0.5), 0.75, 237);
  cel(T, ell(-2.6, -4.8, 2, 1.8, 238, 0.1), darken(P.face, 0.85), SH, 0.75, 238);          // ear
  o.out.head = T.map(2, -0.5); o.out.mouth = T.map(7.4, 2.6 + op * 0.6);
  T.restore();
}
function paint(T, p0, F, o) {
  const p = clamp(p0.ball) > 0.55 ? p0 : pitchPose(p0, F.pitch, { hr: -0.45, hy: -1.5 }, { hr: 0.3 * clamp((-p0.hy - 5) / 3.5), hy: 0.6 * clamp((-p0.hy - 5) / 3.5) });   // st.tilt (not when curled; a low snout can't dip)
  const { P } = o, R = roots(p), b = clamp(p.ball);
  const LG = (near, k, root) => ({ l1: 2.6 * (1 - b * 0.5), l2: 2.4 * (1 - b * 0.5), meta: 0, bend: k[0] === 'f' ? -1 : 1, w: [2.2, 1.7, 1.4], col: near ? P.skin : darken(P.skin, 0.8), paw: [1.7, 0.95], pawCol: near ? darken(P.skin, 0.6) : darken(P.skin, 0.5), sh: SH * 0.5, seed: 240 + k.length, curl: p[k + 'u'], curlA: k[0] === 'f' ? -1 : 0.8, ink: 0.7 });
  if (b < 0.98) { leg(T, R.h2, [p.h2x, p.h2y], LG(false, 'h2')); leg(T, R.f2, [p.f2x, p.f2y], LG(false, 'f2')); leg(T, R.h1, [p.h1x, p.h1y], LG(true, 'h1')); leg(T, R.f1, [p.f1x, p.f1y], LG(true, 'f1')); }
  const tucked = b > 0.55;
  if (tucked) { T.save(); T.translate(p.hx, p.hy); o.out.head = T.map(0, 0); o.out.mouth = T.map(4, 2); T.restore(); }
  // belly fringe under the skirt
  const c = bodyC(p);
  if (b < 0.6) cel(T, ell(c[0] + 1, Math.min(c[1] + 6, -4.2), 14, 3.4, 239, 0.4, p.br), P.belly, SH * 0.5, 0, 239);
  const Dm = rpoly(dome(p, true), 0.8, { seed: 200, jit: 0.3, step: 4 });
  cel(T, Dm, P.spine, SH, 0, 200);
  T.save(); T.beginPath(); Dm.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const cy = lerp(c[1] + 3, -12.8, b);
  for (let i = 0; i < 64; i++) {
    const a = Math.PI + 0.12 + ((i * 0.618) % 1) * (Math.PI - 0.24) + (b > 0.5 ? (i % 3) * 0.9 : 0), r0 = 4 + ((i * 7) % 9);
    const len = 6 + p.sp * 2.5, ca = Math.cos(a - 0.35 * (1 - p.sp)), sa = Math.sin(a - 0.35 * (1 - p.sp));
    line(T, [[c[0] + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.85], [c[0] + Math.cos(a) * r0 + ca * len, cy + Math.sin(a) * r0 * 0.85 + sa * len * 0.85]], 0.9, { seed: 201 + i, color: i % 3 === 0 ? P.tip : i % 3 === 1 ? darken(P.spine, 0.6) : lighten(P.spine, 0.2), taper: true });
  }
  T.restore();
  line(T, [...Dm, Dm[0]], 1.05, { seed: 200, taper: false });
  if (!tucked) face(T, p, F, P, o);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'hedgehog', label: 'Hedgehog',
  height: 24, headHeight: 13, width: 40, shadowW: 20,
  breathPeriod: 1.4,
  params: { spine: '#6a5240', tip: '#e8dcc4', face: '#d8c09a', belly: '#c9b08a', skin: '#b89878' },
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.5], run: [0, 0.5] },
  poses: POSES,
  gaits: { walk, run },
  gestures: {
    nod: g(0.7, (u, b = base) => plus(b, { hr: 0.3 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.2 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.2, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { hr: -0.3 * e, by: -0.8 * k, sp: 0.4 * k, mo: 0.7 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.7, (u, b = base) => jumpAt(u, b, { h: 9, crouch: { by: 1.5, sp: 0.3 }, air: { sp: 0.6, f1y: -1, f2y: -1, h1y: -1, h2y: -1 } }), [0.2, 0.4, 0.55, 0.85]),
    sniff: g(1.4, (u, b = base) => { const e = env(u, 0.25, 0.25); return plus(b, { hr: 0.3 * e + 0.08 * Math.sin(u * 45) * e, hx: 1.5 * e, hy: 2 * e }); }, [0.3, 0.45, 0.6, 0.75]),
    curl: g(2.2, (u, b = base) => mixPose(b, POSES.ball, env(u, 0.18, 0.3)), [0.15, 0.4, 0.7, 0.9]),
    bristle: g(1.0, (u, b = base) => plus(b, { sp: 0.8 * env(u, 0.15, 0.3), by: -0.8 * env(u, 0.15, 0.3), lid: 0 }), [0.2, 0.5, 0.8]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
