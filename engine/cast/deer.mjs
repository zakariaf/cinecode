// The Deer. The legacy far-off silhouette rebuilt as a full rig: a slender roe deer with hooves that plant, a long
// neck that grazes, big mobile ears, a white rump flag, optional antlers (params.antlers = 1), a jaw for talking.
// Round 2 (DESIGN §9.2): st.tilt pitches the head on the long neck; the pupils follow (+1 up, -1 down).
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, tube, mixPose, plus, jumpAt, ease, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 2.4;

const D = { bx: 0, by: -74, br: 0, bl: 1, hx: 46, hy: -120, hr: 0.25, ea: 0, ta: 0, fa: 0.05, ha: 0.18, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], S1 = add(B, rot([22 * p.bl, 7], p.br)), H1 = add(B, rot([-23 * p.bl, 5], p.br));
  return { B, S1, S2: add(S1, [4, -1.5]), H1, H2: add(H1, [5, -1.5]), N: add(B, rot([24 * p.bl, -6], p.br)), Tb: add(B, rot([-33 * p.bl, -7], p.br)) };
};
const FEET = (f1, f2, h1, h2) => ({ f1x: f1, f1y: 0, f2x: f2, f2y: 0, h1x: h1, h1y: 0, h2x: h2, h2y: 0 });
export const POSES = {
  stand: P0({ ...FEET(23, 28, -20, -14) }),
  alert: P0({ by: -75, br: -0.05, hx: 44, hy: -130, hr: 0.05, ea: -0.25, ta: 0.4, ...FEET(23, 28, -20, -14), lid: 0 }),
  graze: P0({ by: -73, br: 0.06, hx: 52, hy: -21.2, hr: 1.25, ea: 0.3, ...FEET(25, 30, -20, -14) }),
  sit: P0({ by: -21, br: 0.02, bl: 1, hx: 38, hy: -66, hr: 0.2, ...FEET(30, 36, -4, 2), fa: 1.45, ha: 1.5 }),
  sleep: P0({ by: -19, br: 0.04, hx: 34, hy: -24, hr: 0.9, ea: 0.6, ...FEET(28, 34, -4, 2), fa: 1.48, ha: 1.5, lid: 1 }),
};
POSES.rest = POSES.sit; POSES.lie = POSES.sit;

const G = { walk: { stride: 62, speed: 72 }, run: { stride: 230, speed: 580 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
function walkBody(ph) {
  const p = { ...POSES.stand };
  p.by = -74 + 1.2 * Math.cos(Math.PI * 4 * ph); p.hx = 46 + 2 * Math.sin(Math.PI * 4 * ph + 0.5); p.hy = -120 + 1.5 * Math.cos(Math.PI * 4 * ph + 0.8); p.ta = 0.1 * Math.sin(Math.PI * 2 * ph); return p;
}
function walk(ph) { return quadFeet(walkBody(ph), ph, { h1: { off: 0, duty: 0.66, x0: -19, lift: 7 }, f1: { off: 0.25, duty: 0.66, x0: 24, lift: 9 }, h2: { off: 0.5, duty: 0.66, x0: -13, lift: 7 }, f2: { off: 0.75, duty: 0.66, x0: 29, lift: 9 } }, G.walk.stride, rootsAt(walkBody)); }
function runBody(ph) {
  const p = { ...POSES.alert }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.15));
  const ext = Math.sin(Math.PI * clamp((ph - 0.18) / 0.3)), gat = Math.sin(Math.PI * clamp((ph - 0.68) / 0.32));
  p.bl = lerp(0.92, 1.08, u); p.br = lerp(0.1, -0.12, u); p.by = -76 - 18 * ext - 8 * gat;
  p.hx = lerp(44, 52, u); p.hy = lerp(-118, -124, u) - 16 * ext - 8 * gat; p.hr = lerp(0.35, 0.15, u); p.ea = 0.5; p.ta = 0.8; return p;
}
function run(ph) {
  const HK = [[0.25, [-34, 46]], [0.55, [-8, 34]], [0.85, [12, 50]]], FK = [[0.25, [-14, 38]], [0.55, [4, 30]], [0.85, [28, 48]]];
  return quadFeet(runBody(ph), ph, { h2: { off: 0, duty: 0.14, x0: -16, keys: HK }, h1: { off: 0.04, duty: 0.14, x0: -19, keys: HK }, f2: { off: 0.46, duty: 0.13, x0: 36, keys: FK }, f1: { off: 0.5, duty: 0.13, x0: 33, keys: FK } }, G.run.stride, rootsAt(runBody));
}

function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.6); T.rotate(p.hr - F.look * 0.08);
  const op = clamp(F.open), sm = F.smile, ea = p.ea + 0.06 * Math.sin(o.t * 1.9), t = o.t;
  const ear = (x, y, a, near) => { T.save(); T.translate(x, y); T.rotate(a); const E = rpoly([[-2.6, 0], [-4.2, -9], [-1.4, -17], [2.6, -9.5], [3, 0]], [1, 3, 2, 3, 1], { seed: near ? 290 : 291, jit: 0.2 }); cel(T, E, near ? P.coat : darken(P.coat, 0.85), SH, 1, near ? 290 : 291); fillP(T, rpoly([[-1.4, -1.5], [-2.6, -8.6], [-1, -14], [1.4, -9], [1.6, -1.5]], 1.5, { seed: 292, jit: 0.1 }), near ? P.earIn : darken(P.earIn, 0.85)); T.restore(); };
  ear(-6, -6, -0.75 + ea + 0.05 * Math.sin(t * 3.1 + 1), false);
  if (P.antlers > 0.5) for (const [dx, sd, col] of [[-1.5, 296, darken(P.antler, 0.85)], [1, 297, P.antler]]) {
    line(T, [[dx, -6], [dx - 2, -14], [dx - 1, -22], [dx + 1, -27]], 1.9, { seed: sd, color: col, taper: false });
    line(T, [[dx - 1.8, -15], [dx + 3, -19]], 1.6, { seed: sd + 2, color: col, taper: false }); line(T, [[dx - 1.2, -21], [dx - 4, -25]], 1.4, { seed: sd + 4, color: col, taper: false });
  }
  const hinge = [3, 4.6], ja = op * 0.4, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  if (op > 0.03) { const M = [hinge, [12, 4.4], [19.4, 3.2], jr([19, 4]), jr([10, 5.6])]; fillP(T, M, '#5a1c24'); }
  cel(T, rpoly([[2, 4.2], [19.6, 3.6], [18, 6.2], [9, 7.6], [1, 7.2]], [2, 1.5, 2, 3, 2], { seed: 293, jit: 0.2 }).map(jr), P.muzzle, SH * 0.4, 0.95, 293);
  const sk = rpoly([[-8, -5], [-2, -7.6], [7, -5.6], [17, -1.6], [21, 1.4], [19.6, 4.4], [6, 5.4], [-7, 5.4]], [4, 4, 4, 3, 2, 2, 3, 4], { seed: 294, jit: 0.3 });
  cel(T, sk, P.coat, SH, 0, 294);
  T.save(); T.beginPath(); sk.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell(18, 3.8, 5, 2.4, 295, 0.1), P.muzzle); fillP(T, ell(-6, 4, 6, 3, 298, 0.2), lighten(P.coat, 0.25)); T.restore();
  line(T, [...sk, sk[0]], 1.1, { seed: 294, taper: false });
  fillP(T, ell(20.4, 1, 1.9, 2.2, 299, 0.1), '#1d1515');
  if (op <= 0.03) line(T, [[18.4, 4.5], [11, 5.3], [6.4, 5.2 - 0.3 * sm], [4.6, 4.9 - 1.6 * sm]], 0.75, { seed: 300 });
  if (sm > 0.5) fillP(T, ell(1, 2.2, 3, 1.8, 301, 0.1), rgba('#e08070', 0.3 * (sm - 0.4)));
  eye(T, 2.6, -1.6, 2.1, 2.5, F.eye, P.eye, gaze(F, 0.6, 2.5), F.lid, F.tilt, { w: 0.9 });
  if (F.eye !== 'happy' && F.lid < 0.96) for (let k = 0; k < 3; k++) line(T, [[3.6 + k * 1.1, -3.6 - k * 0.1 + F.lid * 4], [4.2 + k * 1.4, -4.8 - k * 0.1 + F.lid * 4]], 0.45, { seed: 302 + k });
  brow(T, 2.4, -5.6, 5, F.browY * 0.6, F.browT * 0.7, darken(P.coat, 0.5), 0.9, 305);
  ear(-3.5, -6.5, -0.55 + ea, true);
  o.out.head = T.map(4, -1); o.out.mouth = T.map(14, 5 + op * 2);
  T.restore();
}
function paint(T, p0, F, o) {
  const p = pitchPose(p0, F.pitch, { hr: -0.6, hy: -7, hx: -5 }, { hr: 0.45, hy: 5, hx: 2 });   // st.tilt: the long neck lifts or lowers the head
  const { P, t } = o, R = roots(p);
  const LG = (near, fore, k) => fore
    ? { l1: 21, l2: 20, meta: 12, ma: p.fa, bend: -1, w: [6.2, 3.2, 2.2, 2], col: near ? P.coat : darken(P.coat, 0.8), paw: [2.6, 3.2], hoof: near ? P.hoof : darken(P.hoof, 0.8), sh: SH, seed: near ? 360 : 370, curl: p[k + 'u'], curlA: -1.3 }
    : { l1: 23, l2: 22, meta: 17, ma: p.ha, bend: 1, w: [10, 3.6, 2.3, 2], col: near ? P.coat : darken(P.coat, 0.8), paw: [2.6, 3.2], hoof: near ? P.hoof : darken(P.hoof, 0.8), sh: SH, seed: near ? 380 : 390, curl: p[k + 'u'], curlA: 0.9 };
  leg(T, R.H2, [p.h2x, p.h2y], LG(false, false, 'h2'));
  leg(T, R.S2, [p.f2x, p.f2y], LG(false, true, 'f2'));
  // tail flag tucked behind the rump
  const tl = R.Tb, ta = p.ta + 0.1 * Math.sin(t * 2.6); cel(T, ell(tl[0] - 1, tl[1] - ta * 3, 3.4, 5, 283, 0.2, -0.3 - ta), P.belly, SH * 0.5, 0.9, 283);
  // neck: a tube from the shoulders to the back of the head (drawn under the body front and the head)
  const n0 = add(R.B, rot([21 * p.bl, -1], p.br)), n2 = add([p.hx, p.hy], rot([-5, 2], p.hr));
  const nm = [lerp(n0[0], n2[0], 0.5) - 2, lerp(n0[1], n2[1], 0.5) - 1];
  const Nk = tube([n0, nm, n2], [11, 7, 5.8], 306, 0.3);
  cel(T, Nk, P.coat, SH, 1.1, 306);
  T.save(); T.beginPath(); Nk.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const d = [n2[0] - n0[0], n2[1] - n0[1]], dl = Math.hypot(...d) || 1, nx = -d[1] / dl, ny = d[0] / dl, side = nx > 0 ? 1 : -1;
  fillP(T, tube([[n0[0] + nx * 8 * side, n0[1] + ny * 8 * side], [nm[0] + nx * 5 * side, nm[1] + ny * 5 * side], [n2[0] + nx * 4 * side, n2[1] + ny * 4 * side]], [3.5, 3, 2.5], 307, 0.2), lighten(P.coat, 0.3)); T.restore();
  const body = ell(R.B[0], R.B[1] - F.breath * 0.5, 34 * p.bl, 15.5 * (1 + F.breath * 0.02), 280, 0.5, p.br);
  cel(T, body, P.coat, SH, 0, 280);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([2, 12], p.br)); fillP(T, ell(bp[0], bp[1], 28 * p.bl, 5, 281, 0.4, p.br), P.belly);
  const rp = add(R.B, rot([-32 * p.bl, -2], p.br)); fillP(T, ell(rp[0], rp[1], 9, 11, 282, 0.3, p.br), P.belly);
  T.restore(); line(T, [...body, body[0]], 1.2, { seed: 280, taper: false });
  leg(T, R.H1, [p.h1x, p.h1y], LG(true, false, 'h1'));
  leg(T, R.S1, [p.f1x, p.f1y], LG(true, true, 'f1'));
  head(T, p, F, P, o);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'deer', label: 'Deer',
  height: 143, headHeight: 34, width: 100, shadowW: 40,
  breathPeriod: 3.8,
  params: { coat: '#a8805a', belly: '#efe4d0', muzzle: '#f2ece0', earIn: '#d9b8a0', hoof: '#2e2420', eye: '#2a1810', antler: '#d8c8a8', antlers: 0 },
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.25, 0.5, 0.75], run: [0, 0.46] },
  poses: POSES,
  gaits: { walk, run },
  gestures: {
    nod: g(0.9, (u, b = base) => plus(b, { hr: 0.25 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.15 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), hy: 3 * Math.sin(Math.PI * u) }), [0.22, 0.5, 0.7]),
    laugh: g(1.4, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 6)) * e; return plus(b, { hr: -0.35 * e, hy: -4 * e - 2 * k, mo: 0.7 * e, eh: e, sm: e, ea: -0.2 * e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(1.1, (u, b = base) => jumpAt(u, b, { h: 46, crouch: { by: 8, hy: 6 }, air: { br: -0.1, f1x: 14, f1y: -30, f2x: 14, f2y: -28, h1x: -18, h1y: -18, h2x: -18, h2y: -18, fa: 1.3, ha: 1.3, ta: 0.8 } }), [0.2, 0.4, 0.55, 0.85]),
    graze: g(2.4, (u, b = base) => { const e = env(u, 0.25, 0.25), p = mixPose(b, { ...POSES.graze, ...{ f1x: b.f1x, f2x: b.f2x, h1x: b.h1x, h2x: b.h2x } }, e); p.mo = 0.25 * e * Math.abs(Math.sin(u * Math.PI * 8)); return p; }, [0.25, 0.5, 0.75]),
    flick: g(0.6, (u, b = base) => plus(b, { ea: 0.6 * Math.sin(Math.PI * u), ta: 0.9 * Math.sin(Math.PI * u) }), [0.3, 0.5, 0.7]),
    stamp: g(0.8, (u, b = base) => plus(b, { f1y: -10 * Math.max(0, Math.sin(Math.PI * clamp(u / 0.45))), fa: -0.6 * Math.sin(Math.PI * clamp(u / 0.45)), ea: -0.3 * Math.sin(Math.PI * u), hr: -0.1 * Math.sin(Math.PI * u) }), [0.2, 0.4, 0.6]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
