// The Frog. The legacy pond frog as a full rig: sits crouched on folded hind legs, hops (small hops to walk, big
// hops to run) with feet planted until push-off, croaks with a throat sac, flicks its tongue, talks with a wide jaw.
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, mixPose, plus, jumpAt, ease, frac } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 0.9;

// Pose: body (bx, by, br), head tilt hr, sac (throat 0..1), tg (tongue 0..1), feet f1/f2 (near/far front),
// h1/h2 (near/far hind toes) in ground units, ha hind-foot angle, face hints.
const D = { bx: 0, by: -7.4, br: -0.3, hr: 0, sac: 0, tg: 0, ha: 1.5, fa: 0.3, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], S1 = add(B, rot([5, 3], p.br)), H1 = add(B, rot([-7, 1.5], p.br));
  return { B, S1, S2: add(S1, [1.2, -0.5]), H1, H2: add(H1, [1.4, -0.6]) };
};
const FEET = (f1, f2, h1, h2) => ({ f1x: f1, f1y: 0, f2x: f2, f2y: 0, h1x: h1, h1y: 0, h2x: h2, h2y: 0 });
export const POSES = {
  stand: P0({ ...FEET(7, 8.4, 2, 3.4) }),
  alert: P0({ by: -9.2, br: -0.45, hr: -0.1, ...FEET(6.5, 8, 2, 3.4), lid: 0 }),
  sit: P0({ by: -6.4, br: -0.18, ...FEET(7.4, 8.8, 2.4, 3.8), lid: 0.15 }),
  sleep: P0({ by: -5.6, br: -0.08, hr: 0.08, ...FEET(7.6, 9, 2.6, 4), lid: 1 }),
  croak: P0({ sac: 1, ...FEET(7, 8.4, 2, 3.4) }),
};
POSES.rest = POSES.sit;

const G = { walk: { stride: 16, speed: 26 }, run: { stride: 46, speed: 92 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
// hop gaits: crouched stance (feet planted while the body tips forward and pushes off), then a flight with the
// hind legs trailing; `h` is the hop height
function hopper(stride, h, duty) {
  const body = ph => {
    const p = { ...POSES.stand }, q = frac(ph);
    if (q < duty) { const u = q / duty; p.by = -7.4 + 1.4 * Math.sin(Math.PI * u) - 2 * ease(clamp((u - 0.6) / 0.4)); p.br = -0.3 - 0.25 * ease(clamp((u - 0.55) / 0.45)); }
    else { const v = (q - duty) / (1 - duty); p.by = -9.4 + 2 * ease(v); p.br = lerp(-0.55, -0.3, ease(v)) + 0.25 * Math.sin(Math.PI * v); p.lift = h * Math.sin(Math.PI * v); }
    return p;
  };
  return ph => {
    const HK = [[0.3, [-9, 7]], [0.7, [-4, 6]]], FK = [[0.4, [2, 6]], [0.8, [3, 6]]];
    const p = quadFeet(body(ph), ph, { h1: { off: 0, duty, x0: 2, keys: HK }, h2: { off: 0, duty, x0: 3.4, keys: HK }, f1: { off: 0, duty, x0: 7, keys: FK }, f2: { off: 0, duty, x0: 8.4, keys: FK } }, stride, rootsAt(body));
    const q = frac(ph); if (q >= duty) { const v = (q - duty) / (1 - duty); p.ha = lerp(1.5, 0.2, Math.sin(Math.PI * v)); }
    return p;
  };
}
const walk = hopper(G.walk.stride, 5, 0.55), run = hopper(G.run.stride, 14, 0.4);

function paint(T, p, F, o) {
  const { P, t } = o, R = roots(p), op = clamp(F.open), sm = F.smile;
  leg(T, R.H2, [p.h2x, p.h2y], { l1: 6.4, l2: 6.6, meta: 7, ma: p.ha, bend: 1, w: [3, 1.8, 1.3, 1.1], col: darken(P.skin, 0.8), paw: [1.6, 0.6], pawCol: darken(P.skin, 0.75), sh: SH, seed: 290, curl: 0, ink: 0.75 });
  leg(T, R.S2, [p.f2x, p.f2y], { l1: 3, l2: 3, meta: 0.8, ma: p.fa, bend: -1, w: [1.5, 1.1, 0.9, 0.9], col: darken(P.skin, 0.8), paw: [1.3, 0.55], pawCol: darken(P.skin, 0.75), sh: SH, seed: 292, curl: p.f2u, ink: 0.7 });
  T.save(); T.translate(R.B[0], R.B[1]); T.rotate(p.br);
  // throat sac (behind the jaw), inflates with croak and breath
  const sac = clamp(p.sac + F.breath * 0.08);
  if (sac > 0.05) cel(T, ell(5.4, 3.6 + sac * 1.6, 2.8 + sac * 2.6, 1.6 + sac * 2.6, 296, 0.1), P.sac, SH * 0.5, 0.75, 296);
  // body with head at the front, wide mouth along the snout
  const hinge = [-1.6, -0.6], ja = op * 0.42, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  if (op > 0.03) { const M = [hinge, [5, -0.9], [11.6, -1.2], jr([11, 0]), jr([4, 1.4])]; fillP(T, M, '#7a2a36'); fillP(T, ell(...jr([5, 1.2]), 4, 1.2, 297, 0.1), '#d77a8a'); }
  if (p.tg > 0.02) { const L = 1 + p.tg * 22; line(T, [[9, 0], [9 + L * 0.5, -0.6 - p.tg * 2], [9 + L, -0.2 - p.tg * 3]], 1.1, { seed: 298, color: '#d06a7a', taper: false }); dot(T, 9 + L, -0.2 - p.tg * 3, 1.2, '#d06a7a'); }
  const jaw = rpoly([[-4, -0.2], [11.4, -0.8], [10, 1.6], [4, 3.2], [-4, 3]], [2, 1.5, 2, 3, 2], { seed: 299, jit: 0.15 }).map(jr);
  cel(T, jaw, P.belly, SH * 0.5, 0.8, 299);
  const body = rpoly([[-10, 2], [-11, -3], [-5, -6.6], [3, -6.4], [9, -3.6], [12.4, -1.6], [11.6, -0.4], [3, 0], [-2, 2.6]], [3, 4, 4, 3, 3, 1.5, 1, 2, 3], { seed: 292, jit: 0.25 });
  cel(T, body, P.skin, SH, 0, 292);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  for (const [px, py, r] of [[-6, -3.4, 1.4], [-2, -5, 1.1], [-8.4, -0.6, 1], [0.8, -2.6, 0.8]]) fillP(T, ell(px, py, r, r * 0.8, 293 + px, 0.1), P.spot);
  fillP(T, rpoly([[-9, 1.6], [2, 0.6], [-1, 3], [-9, 3]], 1, { seed: 294, jit: 0.1 }), P.belly);
  T.restore(); line(T, [...body, body[0]], 0.95, { seed: 292, taper: false });
  if (op <= 0.03) line(T, [[11.8, -1], [6, -0.4], [1, -0.3], [-1.8, -0.6 - 1.4 * sm]], 0.65, { seed: 295 });
  dot(T, 11, -2.6, 0.35, '#1a2410');
  if (sm > 0.5) fillP(T, ell(1.4, -1.8, 1.8, 0.9, 289, 0.05), rgba('#e08a70', 0.3 * (sm - 0.4)));
  // eye bump on top
  T.save(); T.translate(4.2, -6.2); T.rotate(p.hr - F.look * 0.06);
  cel(T, ell(0, 0, 3.6, 3.2, 294, 0.1), P.skin, SH, 0.9, 294);
  eye(T, 0.5, -0.3, 1.7, 1.7, F.eye, '#14140c', F.look * 0.5, Math.max(F.lid, 0.06), F.tilt, { sclera: P.eye, pupil: F.eye === 'wide' ? 0.42 : 0.55, w: 0.7 });
  brow(T, 0.4, -3.2, 4, F.browY * 0.5, F.browT * 0.8, darken(P.skin, 0.55), 0.75, 291);
  T.restore();
  o.out.head = T.map(5, -3); o.out.mouth = T.map(7, -0.4 + op * 1.6);
  T.restore();
  leg(T, R.H1, [p.h1x, p.h1y], { l1: 6.4, l2: 6.6, meta: 7, ma: p.ha, bend: 1, w: [3.4, 2, 1.4, 1.2], col: P.skin, paw: [1.7, 0.65], pawCol: darken(P.skin, 0.88), sh: SH, seed: 280, curl: 0, ink: 0.8 });
  leg(T, R.S1, [p.f1x, p.f1y], { l1: 3, l2: 3, meta: 0.8, ma: p.fa, bend: -1, w: [1.6, 1.2, 1, 0.95], col: P.skin, paw: [1.4, 0.6], pawCol: darken(P.skin, 0.88), sh: SH, seed: 284, curl: p.f1u, ink: 0.75 });
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'frog', label: 'Frog',
  height: 19, headHeight: 10, width: 24, shadowW: 11,
  breathPeriod: 1.1,
  params: { skin: '#6f9a3c', belly: '#e0dca8', spot: '#4f7a2a', sac: '#efe8c0', eye: '#d8b84a' },
  speeds: { walk: G.walk.speed, hop: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, hop: G.walk.stride, run: G.run.stride },
  steps: { walk: [0], hop: [0], run: [0] },
  poses: POSES,
  gaits: { walk, hop: walk, run },
  gestures: {
    nod: g(0.6, (u, b = base) => plus(b, { br: 0.12 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.08 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.2, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 7)) * e; return plus(b, { br: -0.15 * e, by: -0.8 * k, mo: 0.7 * e, eh: e, sm: e, sac: 0.3 * k }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 20, crouch: { by: 1.5, br: 0.05 }, air: { br: -0.2, h1x: -10, h1y: -1, h2x: -8, h2y: -1, ha: 0.3, f1y: -2, f2y: -2 } }), [0.2, 0.4, 0.55, 0.85]),
    croak: g(1.2, (u, b = base) => plus(b, { sac: Math.sin(Math.PI * clamp(u / 0.45)) + 0.8 * Math.sin(Math.PI * clamp((u - 0.5) / 0.45)), br: -0.05 * Math.sin(Math.PI * u) }), [0.2, 0.4, 0.7]),
    catch: g(0.7, (u, b = base) => plus(b, { mo: Math.sin(Math.PI * clamp(u / 0.6)), tg: Math.sin(Math.PI * clamp((u - 0.05) / 0.5)), br: -0.1 * Math.sin(Math.PI * u) }), [0.15, 0.3, 0.45, 0.6]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
