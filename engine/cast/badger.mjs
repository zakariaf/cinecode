// The Badger. Legacy grey body and striped wedge head as a full rig: waddling walk and lumbering bound with
// planted paws, sits, stands up to cheer, digs, sniffs; pale brows on the black stripe and a hinged dark chin.
// Round 2 (DESIGN §9.2): st.tilt pitches the head; the pupils follow (+1 up, -1 down).
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, spine, mixPose, plus, jumpAt, ease, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 2.2;

const D = { bx: 0, by: -19, br: 0, bl: 1, hx: 36, hy: -21, hr: 0.12, ea: 0, ta: 0.2, fa: 0.1, ha: 0.4, fl: 1, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], S1 = add(B, rot([20 * p.bl, 6], p.br)), H1 = add(B, rot([-21 * p.bl, 5], p.br));
  return { B, S1, S2: add(S1, [4, -1]), H1, H2: add(H1, [5, -1]), Tb: add(B, rot([-31 * p.bl, -3], p.br)) };
};
const FEET = (f1, f2, h1, h2) => ({ f1x: f1, f1y: 0, f2x: f2, f2y: 0, h1x: h1, h1y: 0, h2x: h2, h2y: 0 });
const UPR = { bx: -4, by: -27, br: -1.3, bl: 0.82, hx: 3, hy: -55, hr: -0.15, ta: -1.2, ha: 1.3, ...FEET(0, 0, 2, 6) };
export const POSES = {
  stand: P0({ ...FEET(21, 25, -17, -12) }),
  alert: P0({ by: -20, br: -0.08, hx: 36, hy: -27, hr: -0.15, ea: -0.2, ...FEET(21, 25, -17, -12), lid: 0 }),
  sit: P0({ bx: -6, by: -23.5, br: -0.75, bl: 0.9, hx: 18, hy: -40, hr: 0.05, ta: -1, ha: 1.4, ...FEET(14, 18, 4, 8), fl: 1.15 }),
  upright: P0({ ...UPR, f1x: 12, f1y: -26, f2x: 14, f2y: -27, fa: -0.6 }),
  cheer: P0({ ...UPR, hr: -0.35, fl: 1.3, f1x: 17, f1y: -63, f2x: 9, f2y: -65, fa: -2.9, mo: 0.6, eh: 1, sm: 1 }),
  sleep: P0({ bx: 0, by: -15.8, br: 0.04, bl: 0.95, hx: 30, hy: -12.5, hr: 0.35, ea: 0.3, ta: -1.4, ...FEET(18, 22, -12, -8), fa: 1.45, ha: 1.5, lid: 1 }),
};
POSES.rest = POSES.sit;

const G = { walk: { stride: 30, speed: 36 }, run: { stride: 56, speed: 120 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
function walkBody(ph) {
  const p = { ...POSES.stand };
  p.by = -19 + 0.9 * Math.cos(Math.PI * 4 * ph); p.br = 0.03 * Math.sin(Math.PI * 2 * ph); p.hy = -21 + 1 * Math.cos(Math.PI * 4 * ph + 0.5); p.hr = 0.12 + 0.04 * Math.sin(Math.PI * 2 * ph); p.ta = 0.2 + 0.2 * Math.sin(Math.PI * 2 * ph); return p;
}
function walk(ph) { return quadFeet(walkBody(ph), ph, { h1: { off: 0, duty: 0.7, x0: -16, lift: 4 }, f1: { off: 0.25, duty: 0.7, x0: 22, lift: 4.5 }, h2: { off: 0.5, duty: 0.7, x0: -11, lift: 4 }, f2: { off: 0.75, duty: 0.7, x0: 26, lift: 4.5 } }, G.walk.stride, rootsAt(walkBody)); }
function runBody(ph) {
  const p = { ...POSES.stand }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.25));
  const air = Math.sin(Math.PI * clamp((ph - 0.3) / 0.15)) * 0.6 + Math.sin(Math.PI * clamp((ph - 0.78) / 0.22));
  p.bl = lerp(0.94, 1.05, u); p.br = lerp(0.06, -0.05, u); p.by = -19.5 - 3.5 * air; p.hx = lerp(34, 38, u); p.hy = -21 - 3 * air; p.hr = 0.2; p.ta = 0.5; return p;
}
function run(ph) {
  const HK = [[0.35, [-12, 14]], [0.75, [4, 14]]], FK = [[0.35, [-9, 13]], [0.75, [8, 14]]];
  return quadFeet(runBody(ph), ph, { h1: { off: 0, duty: 0.32, x0: -14, keys: HK }, h2: { off: 0.06, duty: 0.32, x0: -10, keys: HK }, f1: { off: 0.45, duty: 0.3, x0: 24, keys: FK }, f2: { off: 0.5, duty: 0.3, x0: 27, keys: FK } }, G.run.stride, rootsAt(runBody));
}

function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.5); T.rotate(p.hr - F.look * 0.08);
  const op = clamp(F.open), sm = F.smile;
  const hinge = [-1, 5.4], ja = op * 0.45, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  if (op > 0.03) {
    const M = [hinge, [8, 5.2], [18, 3], jr([17, 3.8]), jr([7, 6.4])]; fillP(T, M, '#5a1c24');
    T.save(); T.beginPath(); M.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip(); fillP(T, ell(...jr([8, 7]), 6, 2, 278, 0.1), '#c96a72'); T.restore();
  }
  cel(T, rpoly([[-3, 4.4], [17.5, 2.6], [16, 6], [5, 9.2], [-4, 9.4]], [2, 1.5, 2, 3, 2], { seed: 272, jit: 0.2 }).map(jr), P.dark, SH * 0.5, 1, 272);
  if (op > 0.35) for (const tx of [12, 15.5]) fillP(T, [[tx, 3.5], [tx + 1.4, 3.3], [tx + 0.7, 5]], '#fbf6ec');
  const hd = rpoly([[-11, -10], [6, -8.6], [18.6, -1.2], [19.6, 1.8], [8, 5.6], [-11, 7.2]], [5, 4, 2, 1.5, 3, 4], { seed: 270, jit: 0.3 });
  cel(T, hd, P.face, SH, 0, 270);
  T.save(); T.beginPath(); hd.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, rpoly([[-12, -5.2], [2, -4.9], [8, -3.9], [18.5, -1.3], [18.5, 1], [7, 2.3], [-12, 3]], 2, { seed: 271, jit: 0.25 }), P.dark);
  T.restore(); line(T, [...hd, hd[0]], 1.1, { seed: 270, taper: false });
  if (op <= 0.03) line(T, [[16.5, 3.6], [8, 5.6 + Math.max(0, -sm) * 0.4], [3, 6 - 0.3 * sm], [1.2, 5.6 - 1.6 * sm]], 0.8, { seed: 273, color: '#1a1414' });
  dot(T, 19.4, 0.6, 2.3, '#141010'); dot(T, 19.9, -0.1, 0.6, 'rgba(255,255,255,.45)');
  eye(T, 5, -0.6, 1.5, 1.8, F.eye, '#9a7048', gaze(F, 0.4, 1.8), F.lid, F.tilt, { pupilCol: '#140e0c', ink: '#d8d2ca', w: 0.8 });
  brow(T, 4.8, -3.35, 4.6, F.browY * 0.45, F.browT * 0.8, '#d8d2ca', 1.05, 274);
  T.save(); T.translate(-7.5, -8.4); T.rotate(p.ea - 0.2); cel(T, ell(0, -1.6, 3.4, 3, 275, 0.1), P.dark, SH, 0.9, 275); line(T, [[-2.6, -3], [0, -4.6], [2.6, -3]], 0.8, { seed: 276, color: P.face }); T.restore();
  o.out.head = T.map(3, -1); o.out.mouth = T.map(10, 5 + op * 2.5);
  T.restore();
}
function paint(T, p0, F, o) {
  const p = pitchPose(p0, F.pitch, { hr: -0.45, hy: -4, hx: -1 }, { hr: 0.35, hy: 2 });   // st.tilt: a short neck, a modest pitch
  const { P, t } = o, R = roots(p);
  const sp = spine(R.Tb, p.ta + 0.1 * Math.sin(t * 2), 0.4, 11, u => 3.6 - u * 1.6, { n: 8 });
  cel(T, sp.poly, P.coat, SH, 1, 257);
  const LG = (near, fore, k) => fore
    ? { l1: 8 * p.fl, l2: 7 * p.fl, meta: 3, ma: p.fa, bend: -1, w: [6.2, 4.4, 3.7, 3.4], col: near ? P.leg : darken(P.leg, 0.8), paw: [4.4, 2.4], sh: SH, seed: near ? 300 : 310, curl: p[k + 'u'], curlA: -1.2 }
    : { l1: 9, l2: 7.5, meta: 4, ma: p.ha, bend: 1, w: [7.4, 4.6, 3.7, 3.4], col: near ? P.leg : darken(P.leg, 0.8), paw: [4.4, 2.4], sh: SH, seed: near ? 320 : 330, curl: p[k + 'u'], curlA: 0.9 };
  const claws = (f, n) => { for (let k = 0; k < 3; k++) line(T, [[f[0] + 2.5 + k * 1.2, f[1] - 1.2 - k * 0.3], [f[0] + 5 + k * 1.3, f[1] - 0.2 - k * 0.2]], 0.8, { seed: n + k, color: P.claw }); };
  leg(T, R.H2, [p.h2x, p.h2y], LG(false, false, 'h2'));
  leg(T, R.S2, [p.f2x, p.f2y], LG(false, true, 'f2')); claws([p.f2x, p.f2y], 340);
  const body = ell(R.B[0], R.B[1] - F.breath * 0.5, 32 * p.bl, 15 * (1 + F.breath * 0.03), 258, 0.5, p.br);
  cel(T, body, P.coat, SH, 0, 258);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([0, 12.5], p.br)); fillP(T, ell(bp[0], bp[1], 28 * p.bl, 4.2, 259, 0.4, p.br), darken(P.coat, 0.55));
  for (let i = 0; i < 14; i++) { const q = add(R.B, rot([-24 + i * 3.6, -12 + (i % 2) * 2], p.br)); line(T, [q, add(q, rot([1, 6], p.br))], 0.6, { seed: 260 + i, color: 'rgba(245,242,236,.5)' }); }
  T.restore(); line(T, [...body, body[0]], 1.2, { seed: 258, taper: false });
  // neck/shoulder hump joining the head
  const nk = add([p.hx, p.hy], rot([-8, 1], p.hr)); cel(T, ell((nk[0] + R.S1[0]) / 2 + 1, (nk[1] + R.S1[1]) / 2 - 2, 10, 9, 279, 0.3, p.br), P.coat, SH, 0, 279);
  leg(T, R.H1, [p.h1x, p.h1y], LG(true, false, 'h1'));
  const up = p.br < -0.9;                       // standing up: arms go behind the head
  if (up) { leg(T, R.S1, [p.f1x, p.f1y], LG(true, true, 'f1')); claws([p.f1x, p.f1y], 350); }
  head(T, p, F, P, o);
  if (!up) { leg(T, R.S1, [p.f1x, p.f1y], LG(true, true, 'f1')); claws([p.f1x, p.f1y], 350); }
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'badger', label: 'Badger',
  height: 35, headHeight: 20, width: 92, shadowW: 36,
  breathPeriod: 3.4,
  params: { coat: '#8d8a86', face: '#f2efe8', dark: '#2e2a28', leg: '#433e3a', claw: '#d8cdb8' },
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.25, 0.5, 0.75], run: [0, 0.45] },
  poses: POSES,
  gaits: { walk, run },
  gestures: {
    nod: g(0.8, (u, b = base) => plus(b, { hr: 0.25 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.15 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), hy: 1.5 * Math.sin(Math.PI * u) }), [0.22, 0.5, 0.7]),
    laugh: g(1.4, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 7)) * e; return plus(b, { hr: -0.3 * e, hy: -3 * e - 1.5 * k, by: -1.2 * k, mo: 0.75 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 16, crouch: { by: 4, hy: 4 }, air: { f1y: -6, f2y: -6, h1y: -4, h2y: -4, fa: 0.8, ha: 1 } }), [0.2, 0.4, 0.55, 0.85]),
    cheer: g(1.6, (u, b = base) => { const e = env(u, 0.2, 0.2), k = Math.abs(Math.sin(u * Math.PI * 6)) * e; const p = mixPose(b, POSES.cheer, e); p.lift = (b.lift || 0) + 5 * k; p.f1x += 3 * Math.sin(u * 30) * e; return p; }, [0.25, 0.45, 0.65, 0.85]),
    wave: g(1.6, (u, b = base) => { const e = env(u, 0.2, 0.2); return mixPose(b, { ...POSES.upright, f1x: 14 + 3 * Math.sin(u * Math.PI * 8), f1y: -48, fa: -2.6, sm: 0.6 }, e); }, [0.25, 0.4, 0.55, 0.7]),
    dig: g(1.6, (u, b = base) => { const e = env(u, 0.15, 0.15), k = Math.sin(u * Math.PI * 10); return plus(b, { br: 0.12 * e, by: 2 * e, hy: 6 * e, hr: 0.3 * e, f1x: 4 * k * e, f1y: -4 * Math.max(0, k) * e, f2x: -4 * k * e, f2y: -4 * Math.max(0, -k) * e }); }, [0.2, 0.35, 0.5, 0.7]),
    sniff: g(1.4, (u, b = base) => { const e = env(u, 0.25, 0.25); return plus(b, { hy: 6 * e, hx: 2 * e, hr: 0.35 * e + 0.06 * Math.sin(u * 40) * e }); }, [0.3, 0.45, 0.6, 0.75]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
