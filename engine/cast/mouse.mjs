// The Mouse. Legacy field mouse (grey-brown, big pink ears) as a full rig: scurries on all fours with planted
// feet, sits up, gasps and cheers, waves and points, brows and a tiny mouth with incisors for talking.
// Round 2 (DESIGN §9.2): st.tilt pitches the head; the pupils follow (+1 up, -1 down).
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, spine, mixPose, plus, jumpAt, ease, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 0.9;

// Pose: body (bx, by, br: 0 on all fours, -1.25 upright), head (hx, hy, hr), ears ea, tail angle ta / bend tc,
// paws f1/f2 (near/far fore), h1/h2 (near/far hind) in ground units, paw angles fa/ha, face hints.
const D = { bx: 0, by: -5, br: -0.08, hx: 8.2, hy: -7.2, hr: 0, ea: 0, ta: -0.2, tc: 1.3, fa: 0.2, ha: 1.2, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], H1 = add(B, rot([-4.2, 1.6], p.br)), S1 = add(B, rot([3.6, 1.8], p.br));
  return { B, H1, H2: add(H1, [1.2, -0.4]), S1, S2: add(S1, [1.1, -0.3]), Tb: add(B, rot([-6.8, 0.6], p.br)) };
};
const ALL4 = { f1x: 4.4, f1y: 0, f2x: 5.4, f2y: 0, h1x: -2.4, h1y: 0, h2x: -1.4, h2y: 0 };
const UP = { bx: -0.5, by: -7.6, br: -1.25, hx: 1.6, hy: -16.2, hr: -0.05, ta: -0.5, tc: 1.6, h1x: 3.2, h1y: 0, h2x: 4.4, h2y: 0, ha: 1.4 };
export const POSES = {
  stand: P0({ ...ALL4 }),
  sit: P0({ ...UP, f1x: 4.2, f1y: -9.4, f2x: 4.8, f2y: -9.8, fa: -0.5 }),
  alert: P0({ ...UP, by: -8.8, br: -1.38, hx: 1, hy: -18, ea: -0.2, f1x: 3.4, f1y: -10.5, f2x: 4, f2y: -11, fa: 0.3, lid: 0 }),
  gasp: P0({ ...UP, hr: -0.1, f1x: 4.6, f1y: -13.4, f2x: 5.1, f2y: -13.8, fa: -1.4, mo: 0.6, lid: 0 }),
  cheer: P0({ ...UP, hr: -0.2, hy: -16.6, f1x: 4.6, f1y: -16.4, f2x: 1.6, f2y: -16.4, fa: -2.8, mo: 0.6, eh: 1, sm: 1 }),
  sleep: P0({ by: -5.5, br: 0.05, hx: 6, hy: -4.8, hr: 0.25, ea: 0.35, ta: -1.2, tc: -2.4, ...ALL4, f1x: 3.4, f2x: 4.2, h1x: -1.6, h2x: -0.8, fa: 1.4, ha: 1.5, lid: 1 }),
};
POSES.rest = POSES.sit; POSES.idle = POSES.stand;

const G = { walk: { stride: 8, speed: 24 }, run: { stride: 22, speed: 80 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
function walkBody(ph) {
  const p = { ...POSES.stand };
  p.by = -5.1 + 0.25 * Math.cos(Math.PI * 4 * ph); p.hy = -7.2 + 0.3 * Math.cos(Math.PI * 4 * ph + 0.7); p.ta = -0.2 + 0.15 * Math.sin(Math.PI * 2 * ph); return p;
}
function walk(ph) {          // scurry: a quick trot, diagonal pairs together
  return quadFeet(walkBody(ph), ph, { f1: { off: 0, duty: 0.55, x0: 4.6, lift: 1.6 }, h2: { off: 0, duty: 0.55, x0: -1.4, lift: 1.6 }, f2: { off: 0.5, duty: 0.55, x0: 5.6, lift: 1.6 }, h1: { off: 0.5, duty: 0.55, x0: -2.4, lift: 1.6 } }, G.walk.stride, rootsAt(walkBody));
}
function runBody(ph) {
  const p = { ...POSES.stand }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.25));
  const air = Math.sin(Math.PI * Math.max(0, Math.min(1, (ph - 0.2) / 0.25))) + Math.sin(Math.PI * Math.max(0, Math.min(1, (ph - 0.68) / 0.3))) * 0.6;
  p.br = lerp(-0.18, 0.02, u); p.by = -5.2 - 1.8 * air; p.hy = -7 - 1.6 * air; p.hx = lerp(7.6, 9, u); p.ea = 0.3; p.ta = 0.1; p.tc = 0.6; return p;
}
function run(ph) {           // bound: hinds together, then fores
  const HK = [[0.35, [-5, 4]], [0.75, [1.5, 4.5]]], FK = [[0.35, [-3.5, 4.5]], [0.75, [2.5, 4.2]]];
  return quadFeet(runBody(ph), ph, { h1: { off: 0, duty: 0.22, x0: -1.4, keys: HK }, h2: { off: 0.03, duty: 0.22, x0: -0.4, keys: HK }, f1: { off: 0.46, duty: 0.2, x0: 6, keys: FK }, f2: { off: 0.5, duty: 0.2, x0: 7, keys: FK } }, G.run.stride, rootsAt(runBody));
}

function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.25); T.rotate(p.hr - F.look * 0.1);
  const op = clamp(F.open), sm = F.smile, ea = p.ea + 0.06 * Math.sin(o.t * 2.6);
  const earAt = (x, y, a, near) => { T.save(); T.translate(x, y); T.rotate(a); const E = ell(0, -3.4, 3.3, 3.6, near ? 242 : 243, 0.1); cel(T, E, near ? P.fur : darken(P.fur, 0.85), SH, 0.9, near ? 242 : 243); fillP(T, ell(0.2, -3.2, 2, 2.3, 244, 0.1), near ? P.earIn : darken(P.earIn, 0.85)); T.restore(); };
  earAt(-2.4, -2.6, -0.35 + ea, false);
  const Hd = rpoly([[-3.6, -2.6], [0.5, -3.6], [4.2, -1.4], [6.4, 0.6], [4, 2.4], [-1.5, 3], [-4, 1]], [2.4, 2.4, 2, 0.8, 2, 2.4, 2.2], { seed: 245, jit: 0.1 });
  cel(T, Hd, P.fur, SH, 0.95, 245);
  fillP(T, ell(2, 1.6, 2.6, 1.2, 248, 0.05), P.belly);
  if (op > 0.03) {
    const M = ell(3.9, 1.75 + op * 0.45, 0.85 + op * 0.25, 0.3 + op * 0.65, 246, 0.03); fillP(T, M, '#5e2026');
    T.save(); T.beginPath(); M.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
    fillP(T, [[3.4, 1.2], [4.4, 1.2], [4.3, 2.1], [3.5, 2.1]], '#fbf4e4'); fillP(T, ell(3.9, 2.4 + op * 0.9, 0.9, 0.5, 247, 0.02), '#d0707a'); T.restore();
    line(T, [...M, M[0]], 0.45, { seed: 247, taper: false });
  } else line(T, [[5, 1.4], [4.4, 2.3], [3.3, 2.5], [2.4, 2.3 - 0.7 * sm]], 0.5, { seed: 249 });
  if (sm > 0.5) fillP(T, ell(0.4, 0.8, 1.3, 0.8, 250, 0.05), rgba('#e88a90', 0.4 * (sm - 0.4)));
  dot(T, 6.3, 0.5, 0.8, P.nose);
  eye(T, 1.4, -0.9, 1.05, 1.25, F.eye, P.eye, gaze(F, 0.3, 1.25), F.lid, F.tilt, { w: 0.7 });
  brow(T, 1.3, -2.9, 2.6, F.browY * 0.7, F.browT * 0.75, darken(P.fur, 0.5), 0.75, 251);
  for (const [ty, s] of [[-0.6, 252], [0.8, 253], [2, 254]]) line(T, [[5.4, 0.8], [9.6, ty]], 0.25, { seed: s, color: 'rgba(42,33,48,.5)' });
  earAt(-0.6, -2.8, -0.1 + ea, true);
  o.out.head = T.map(0.5, -0.3); o.out.mouth = T.map(3.9, 1.8 + op * 0.5);
  T.restore();
}
function paint(T, p0, F, o) {
  const p = pitchPose(p0, F.pitch, { hr: -0.55, hy: -1, hx: -0.4 }, { hr: 0.4, hy: 0.6 });   // st.tilt
  const { P, t } = o, R = roots(p);
  const sp = spine(R.Tb, p.ta, p.tc, 17, u => 0.75 - u * 0.45, { n: 14, wave: 0.25, t });
  cel(T, sp.poly, P.tail, SH * 0.5, 0.7, 255);
  const LG = (near, fore, k) => fore
    ? { l1: 2.6, l2: 2.4, meta: 1.1, ma: p.fa, bend: -1, w: near ? [1.4, 1, 0.8, 0.75] : [1.3, 0.9, 0.75, 0.7], col: near ? P.fur : darken(P.fur, 0.82), low: near ? P.paw : darken(P.paw, 0.85), lowFrom: 1.2, paw: [1, 0.65], pawCol: near ? P.paw : darken(P.paw, 0.85), sh: SH * 0.6, seed: near ? 260 : 270, curl: p[k + 'u'], curlA: -1.2, ink: 0.6 }
    : { l1: 3.4, l2: 3.2, meta: 3, ma: p.ha, bend: 1, w: near ? [2.6, 1.2, 0.9, 0.8] : [2.4, 1.1, 0.85, 0.75], col: near ? P.fur : darken(P.fur, 0.82), low: near ? P.paw : darken(P.paw, 0.85), lowFrom: 1.3, paw: [1.3, 0.65], pawCol: near ? P.paw : darken(P.paw, 0.85), sh: SH * 0.6, seed: near ? 280 : 290, curl: p[k + 'u'], curlA: 0.8, ink: 0.65 };
  leg(T, R.H2, [p.h2x, p.h2y], LG(false, false, 'h2'));
  leg(T, R.S2, [p.f2x, p.f2y], LG(false, true, 'f2'));
  const body = ell(R.B[0], R.B[1], 7.2 * (1 + F.breath * 0.03), 4.9, 241, 0.2, p.br);
  cel(T, body, P.fur, SH, 0, 241);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([1.2, 3.4], p.br)); fillP(T, ell(bp[0], bp[1], 6.4, 2.6, 256, 0.1, p.br), P.belly); T.restore();
  line(T, [...body, body[0]], 0.95, { seed: 241, taper: false });
  cel(T, ell((R.S1[0] + p.hx) / 2 - 0.4, (R.S1[1] + p.hy) / 2 + 0.4, 3.4, 3.4, 257, 0.1), P.fur, SH, 0, 257);
  const hl = leg(T, R.H1, [p.h1x, p.h1y], LG(true, false, 'h1'));
  const ha = Math.atan2(hl.knee[1] - R.H1[1], hl.knee[0] - R.H1[0]), hy = Math.min((R.H1[1] + hl.knee[1]) / 2, -Math.hypot(3.2 * Math.sin(ha), 2.6 * Math.cos(ha)) - 0.6);
  cel(T, ell((R.H1[0] + hl.knee[0]) / 2, hy, 3.2, 2.6, 258, 0.1, ha), P.fur, SH, 0.75, 258);
  head(T, p, F, P, o);
  leg(T, R.S1, [p.f1x, p.f1y], LG(true, true, 'f1'));
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
const upr = (b, o) => mixPose(b, { ...b, ...UP, ...o }, 1);
export default makeRig({
  kind: 'mouse', label: 'Mouse',
  height: 17.5, headHeight: 9, width: 17, shadowW: 8,
  breathPeriod: 0.8,
  params: { fur: '#9a8a7c', belly: '#e6dccb', earIn: '#e8b0b0', nose: '#d88a8a', paw: '#e3b6a8', tail: '#c49a92', eye: '#1a1210' },
  speeds: { walk: G.walk.speed, scurry: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, scurry: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.5], scurry: [0, 0.5], run: [0, 0.46] },
  poses: POSES,
  gaits: { walk, scurry: walk, run },
  gestures: {
    nod: g(0.6, (u, b = base) => plus(b, { hr: 0.3 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.2 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.2, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { hr: -0.3 * e, hy: -0.8 * k, by: -0.5 * k, mo: 0.7 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.6, (u, b = base) => jumpAt(u, b, { h: 10, crouch: { by: 0.2, hy: 1 }, air: { ta: 0.3, f1y: -1.5, f2y: -1.5, h1y: -1.5, h2y: -1.5, ha: 0.6 } }), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.4, (u, b = base) => { const e = env(u, 0.2, 0.2); return mixPose(b, upr(b, { f1x: 4.8 + 0.9 * Math.sin(u * Math.PI * 8), f1y: -16, fa: -2.6, f2x: 4.4, f2y: -9.6, fa2: 0, sm: 0.6 }), e); }, [0.25, 0.4, 0.55, 0.7]),
    point: g(1.3, (u, b = base) => { const e = env(u, 0.25, 0.2); return mixPose(b, upr(b, { f1x: 8, f1y: -11.4, fa: -1.6, f2x: 4.4, f2y: -9.6, hr: -0.1 }), e); }, [0.2, 0.4, 0.6, 0.8]),
    cheer: g(1.4, (u, b = base) => { const e = env(u, 0.15, 0.15), k = Math.abs(Math.sin(u * Math.PI * 6)); const p = mixPose(b, POSES.cheer, e); p.lift = (b.lift || 0) + 4 * k * e; p.f1y += 1.5 * Math.sin(u * 30) * e; return p; }, [0.2, 0.4, 0.6, 0.8]),
    gasp: g(1.2, (u, b = base) => mixPose(b, POSES.gasp, env(u, 0.12, 0.3)), [0.15, 0.5, 0.8]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
