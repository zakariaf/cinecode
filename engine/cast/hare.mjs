// The Hare. Ported from the legacy film (same shapes and poses), upgraded with IK gaits whose planted feet
// never slide, a jaw that talks, brows, blinks, expressions, breathing, look and ear sway.
import { clamp, lerp, ell, limb, rpoly } from '../core/lib.mjs';
import { cel, darken, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, footAt, mixPose, plus, jumpAt, keyed, ease, frac, bone } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const at = (o, a, l) => [o[0] + Math.sin(a) * l, o[1] + Math.cos(a) * l];
const SH = 2.2;

// Legacy pose parameters (body B, body rotation br and length bs, head position/rotation, ear angles, leg angles)
// plus: hindL/foreL leg lengths, gnd (0 = auto-ground on the lowest foot, 1 = fixed ground for IK gaits),
// and face hints mo / eh / lid / sm.
const D = { hindL: 16, hindL2: 16, foreL: 20, foreL2: 20, fw1: 0, fw2: 0, gnd: 0, lift: 0, mo: 0, eh: 0, lid: 0, sm: 0, tail: 0 };
const L = (o) => ({ ...D, ...o });
export const POSES = {
  stand: L({ bx: 0, by: -33, br: -0.28, bs: 1.02, hx: 32, hy: -58, hr: -0.12, eF: 0.15, eB: 0.35, hindA: 0.55, foot: 0, hindA2: 0.55, foot2: 0, foreA: 0.0, foreA2: 0.08, foreL: 22, foreL2: 22 }),
  sit: L({ bx: 0, by: -30, br: -0.35, bs: 1, hx: 30, hy: -54, hr: -0.1, eF: 0.25, eB: 0.45, hindA: 0.6, foot: 0, hindA2: 0.6, foot2: 0, foreA: 0.1, foreA2: 0.15 }),
  stretch: L({ bx: 0, by: -34, br: 0.05, bs: 1.25, hx: 44, hy: -42, hr: 0.1, eF: 1.15, eB: 1.3, hindA: -1.3, foot: Math.PI - 0.4, hindA2: -1.2, foot2: Math.PI - 0.5, foreA: 1.3, foreA2: 1.1 }),
  bunch: L({ bx: 0, by: -36, br: -0.1, bs: 0.85, hx: 32, hy: -50, hr: -0.05, eF: 1.0, eB: 1.2, hindA: 0.95, foot: 0.2, hindA2: 0.9, foot2: 0.2, foreA: -0.6, foreA2: -0.8 }),
  up: L({ bx: 0, by: -44, br: -1.25, bs: 1, hx: 9, hy: -86, hr: -0.15, eF: 0.05, eB: 0.3, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 0.4, foreA2: 0.2 }),
  mock: L({ bx: 0, by: -42, br: -0.95, bs: 1, hx: 24, hy: -78, hr: 0.2, eF: 0.15, eB: 0.45, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 0.85, foreA2: 0.3, sm: 0.7, mo: 0.25, lid: 0.35 }),
  laugh: L({ bx: 0, by: -44, br: -1.35, bs: 1, hx: 4, hy: -88, hr: -0.45, eF: 0.0, eB: 0.25, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 2.3, foreA2: -0.4, mo: 0.85, eh: 1, sm: 1 }),
  wiggle: L({ bx: 0, by: -30, br: -0.4, bs: 1, hx: 28, hy: -56, hr: 0.15, eF: 0.2, eB: 0.4, hindA: 1.55, foot: -0.55, hindA2: 0.6, foot2: 0, foreA: 0.1, foreA2: 0.2, sm: 0.6 }),
  offer: L({ bx: 0, by: -44, br: -1.2, bs: 1, hx: 11, hy: -86, hr: 0.05, eF: 0.1, eB: 0.35, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 1.6, foreA2: 0.2 }),
  look: L({ bx: 0, by: -44, br: -1.25, bs: 1, hx: 10, hy: -86, hr: 0.0, eF: -0.05, eB: 0.2, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 2.75, foreA2: 0.2 }),
  yawn: L({ bx: 0, by: -46, br: -1.3, bs: 1.05, hx: 6, hy: -90, hr: -0.45, eF: 0.1, eB: 0.35, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 3.0, foreA2: 2.8, mo: 1, lid: 1 }),
  sleep: L({ bx: 0, by: -16, br: 0.1, bs: 1.15, hx: 36, hy: -16, hr: 0.35, eF: 1.55, eB: 1.65, hindA: 1.35, foot: 0.1, hindA2: 1.3, foot2: 0.1, foreA: 1.55, foreA2: 1.45, lid: 1 }),
  alert: L({ bx: 0, by: -46, br: -1.3, bs: 1, hx: 9, hy: -90, hr: -0.05, eF: -0.15, eB: 0.05, hindA: 0.8, foot: 0, hindA2: 0.8, foot2: 0, foreA: 1.0, foreA2: 0.8 }),
  ready: L({ bx: 0, by: -24, br: 0.2, bs: 0.9, hx: 34, hy: -34, hr: 0.15, eF: 1.35, eB: 1.45, hindA: 0.95, foot: 0, hindA2: 0.95, foot2: 0, foreA: 0.2, foreA2: 0.3 }),
  skid: L({ bx: 0, by: -36, br: -0.75, bs: 1, hx: 20, hy: -74, hr: -0.3, eF: -0.4, eB: -0.25, hindA: 0.95, hindL: 20, foot: -0.3, hindA2: 0.9, hindL2: 20, foot2: -0.3, foreA: -0.4, foreA2: -0.6 }),
  slump: L({ bx: 0, by: -30, br: -0.55, bs: 1, hx: 30, hy: -50, hr: 0.45, eF: 1.7, eB: 1.8, hindA: 0.6, foot: 0, hindA2: 0.6, foot2: 0, foreA: 0.05, foreA2: 0.1, lid: 0.35 }),
};
POSES.rest = L({ ...POSES.sleep, hx: 38, hy: -20, hr: 0.2, eF: 1.35, eB: 1.5, lid: 0 });
POSES.crouch = POSES.ready;

// Contact radii (foot half-thickness + ink) of near/far hind toe and near/far forepaw.
const FR = [4.5, 3.9, 3.9, 3.7];
const HEADLOW = [[0, 12.5], [-17, 10], [11.5, 12.1], [16.6, 10.9]];   // head-frame points near its underside
// Skeleton points shared by draw, IK and the tests (body frame, before grounding).
function joints(p) {
  const B = [p.bx, p.by], H = add(B, rot([-18 * p.bs, 4], p.br)), S = add(B, rot([19 * p.bs, 5], p.br));
  const heel = at(H, p.hindA, p.hindL), toe = [heel[0] + Math.cos(p.foot) * 22, heel[1] + Math.sin(p.foot) * 22];
  const H2 = add(H, [-4, -1]), heel2 = at(H2, p.hindA2, p.hindL2), toe2 = [heel2[0] + Math.cos(p.foot2) * 22, heel2[1] + Math.sin(p.foot2) * 22];
  const S2 = add(S, [-5, 0]), paw1 = at(S, p.foreA, p.foreL), paw2 = at(S2, p.foreA2, p.foreL2);
  // lowest point of everything that can touch the ground: feet (rotated limb ends), body, haunch, head
  const hh = (a, b, r) => Math.hypot(a * Math.sin(r), b * Math.cos(r)), sa = Math.abs;
  const gAuto = Math.max(heel[1] + Math.max(4.6 * sa(Math.sin(p.hindA)), 4.2 * sa(Math.cos(p.foot))) + 0.5, toe[1] + Math.max(FR[0], 4 * sa(Math.cos(p.foot)) + 0.5),
    heel2[1] + Math.max(4.2 * sa(Math.sin(p.hindA2)), 3.6 * sa(Math.cos(p.foot2))) + 0.5, toe2[1] + Math.max(FR[1], 3.4 * sa(Math.cos(p.foot2)) + 0.5), paw1[1] + FR[2], paw2[1] + FR[3],
    B[1] + hh(26 * p.bs, 17 / Math.sqrt(p.bs), p.br) + 1.2, H[1] + hh(15, 12.5, p.br) + 1.2,
    ...HEADLOW.map(([x, y]) => p.hy + x * Math.sin(p.hr) + y * Math.cos(p.hr) + 1));
  return { B, H, S, H2, S2, heel, toe, heel2, toe2, paw1, paw2, g: lerp(gAuto, 0, clamp(p.gnd)) };
}
// Foot contacts in ground units (y = 0 on the ground): near/far hind toe, near/far fore paw.
function feet(p) {
  const J = joints(p), g = J.g + (p.lift || 0);
  return [J.toe, J.toe2, J.paw1, J.paw2].map(([x, y], i) => { const c = p['c' + (i + 1)], Y = y + FR[i] - g; return [x, Y, c === undefined ? +(Math.abs(Y) < 0.05) : c]; });
}

// ── IK gaits: place the feet, solve the leg angles/lengths ──
function solveLegs(p, F) {
  const J = joints({ ...p, hindA: 0, hindA2: 0, foreA: 0, foreA2: 0 });
  const hind = (Hp, f, phi) => { const heel = [f[0] - Math.cos(phi) * 22, f[1] - Math.sin(phi) * 22], dx = heel[0] - Hp[0], dy = heel[1] - Hp[1]; return [Math.atan2(dx, dy), Math.hypot(dx, dy)]; };
  const fore = (Sp, f) => { const dx = f[0] - Sp[0], dy = f[1] - Sp[1]; return [Math.atan2(dx, dy), Math.hypot(dx, dy)]; };
  [p.hindA, p.hindL] = hind(J.H, F.h1, F.phi1); [p.hindA2, p.hindL2] = hind(J.H2, F.h2, F.phi2);
  [p.foreA, p.foreL] = fore(J.S, F.f1); [p.foreA2, p.foreL2] = fore(J.S2, F.f2);
  p.foot = F.phi1; p.foot2 = F.phi2; p.gnd = 1; p.lift = 0;
  [p.c1, p.c2, p.c3, p.c4] = F.down.map(Number);
  return p;
}
// hind foot angle through a cycle: flat in early stance, heel rolls up at push-off, trails in swing, flattens to land
const hindPhi = (f, roll, trail) => (f.down ? roll * ease(clamp((f.u - 0.45) / 0.55)) : f.u < 0.35 ? lerp(roll, trail, ease(f.u / 0.35)) : lerp(trail, 0, ease((f.u - 0.35) / 0.65)));

const G = {
  walk: { stride: 30, speed: 46 }, hop: { stride: 92, speed: 190 }, run: { stride: 210, speed: 640 },
};
// Slow hop-walk: with both hind feet planted the body stretches and the forepaws step one after the other;
// then, forepaws planted, both hind feet hop forward together under the body.
function walk(ph) {
  const st = G.walk.stride, str = Math.sin(Math.PI * 2 * (ph - 0.0)) * 0.5 + 0.5;
  const p = mixPose(POSES.stand, { ...POSES.stand, bs: 1.1, br: -0.2, hx: 35, hy: -53 }, 1 - str);
  const hop = Math.max(0, Math.sin(Math.PI * clamp((ph - 0.5) / 0.5)));
  p.by = -29.5 - 2.2 * hop; p.br += -0.06 * hop; p.hy += -1.2 * hop + 0.6 * Math.sin(Math.PI * 4 * ph);
  p.eF = 0.22 + 0.12 * hop; p.eB = 0.42 + 0.12 * hop;
  const h1 = footAt(ph, 0.0, 0.5, st, 13, 7, -FR[0]), h2 = footAt(ph, 0.02, 0.5, st, 9, 7, -FR[1]);
  const f1 = footAt(ph, 0.25, 0.78, st, 26, 6, -FR[2]), f2 = footAt(ph, 0.04, 0.78, st, 22, 6, -FR[3]);
  p.fw1 = f1.down ? 0 : Math.sin(Math.PI * f1.u) * 0.8; p.fw2 = f2.down ? 0 : Math.sin(Math.PI * f2.u) * 0.8;
  return solveLegs(p, { h1: [h1.x, h1.y], h2: [h2.x, h2.y], f1: [f1.x, f1.y], f2: [f2.x, f2.y], phi1: hindPhi(h1, 0.55, 0.95), phi2: hindPhi(h2, 0.55, 0.95), down: [h1.down, h2.down, f1.down, f2.down] });
}
// Bounding gaits: IK while a foot is planted; in swing the leg follows keyed angles (extended back, then tucked
// forward), blended from the lift-off IK solution to the touch-down one, so nothing pops or slides.
function bounding(ph, body, legs, stride) {
  const p = body(ph);
  const legIK = (L, phx) => {                                    // IK for leg L at body phase phx, foot on its planted target
    const b = body(phx), f = footAt(phx, L.off, L.duty, stride, L.x0, 0, -FR[{ h1: 0, h2: 1, f1: 2, f2: 3 }[L.k]]);
    const J = joints({ ...b, hindA: 0, hindA2: 0, foreA: 0, foreA2: 0 });
    const root = L.k === 'h1' ? J.H : L.k === 'h2' ? J.H2 : L.k === 'f1' ? J.S : J.S2;
    const phi = L.hind ? L.roll * ease(clamp((f.u - 0.4) / 0.6)) : 0;
    const end = L.hind ? [f.x - Math.cos(phi) * 22, f.y - Math.sin(phi) * 22] : [f.x, f.y];
    const dx = end[0] - root[0], dy = end[1] - root[1];
    return { A: Math.atan2(dx, dy), L: Math.hypot(dx, dy), phi, fw: 0 };
  };
  const out = {};
  for (const L of legs) {
    const q = frac(ph - L.off);
    let r;
    if (q < L.duty) r = legIK(L, ph);
    else {
      const v = (q - L.duty) / (1 - L.duty);
      const k0 = legIK(L, L.off + L.duty - 1e-6), k1 = legIK(L, L.off + 1 + 1e-6);
      const K = [[0, k0], ...L.keys, [1, k1]];
      let i = 0; while (i < K.length - 2 && v > K[i + 1][0]) i++;
      const A = K[i], B = K[i + 1], w = ease(clamp((v - A[0]) / (B[0] - A[0])));
      r = { A: lerp(A[1].A, B[1].A, w), L: lerp(A[1].L, B[1].L, w), phi: lerp(A[1].phi ?? 0, B[1].phi ?? 0, w), fw: lerp(A[1].fw ?? 0, B[1].fw ?? 0, w) };
      if (L.k[0] === 'f') {                                       // a swinging forepaw never dips below the ground
        const J = joints({ ...p, hindA: 0, hindA2: 0, foreA: 0, foreA2: 0 }), root = L.k === 'f1' ? J.S : J.S2, c = Math.cos(r.A), lim = -FR[L.k === 'f1' ? 2 : 3];
        if (c > 0.05 && root[1] + r.L * c > lim) r.L = (lim - root[1]) / c;
      }
    }
    r.c = q < L.duty ? 1 : 0;
    out[L.k] = r;
  }
  p.c1 = out.h1.c; p.c2 = out.h2.c; p.c3 = out.f1.c; p.c4 = out.f2.c;
  p.hindA = out.h1.A; p.hindL = out.h1.L; p.foot = out.h1.phi; p.hindA2 = out.h2.A; p.hindL2 = out.h2.L; p.foot2 = out.h2.phi;
  p.foreA = out.f1.A; p.foreL = out.f1.L; p.fw1 = out.f1.fw; p.foreA2 = out.f2.A; p.foreL2 = out.f2.L; p.fw2 = out.f2.fw;
  p.gnd = 1; p.lift = 0;
  return p;
}
const HIND_EXT = { A: -1.25, L: 16, phi: Math.PI - 0.45 }, HIND_TUCK = { A: 1.0, L: 11, phi: 0.4 };
const FORE_FOLD = { A: -0.55, L: 17, fw: 1.1 }, FORE_REACH = { A: 1.05, L: 21, fw: 0.15 };
function runBody(ph) {
  const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.27));
  const p = mixPose(POSES.bunch, POSES.stretch, u);
  const ext = Math.sin(Math.PI * clamp((ph - 0.12) / 0.34)), gat = Math.sin(Math.PI * clamp((ph - 0.6) / 0.4));
  p.by = -31 - 13 * ext - 10 * gat; p.hy += -12 * ext - 8 * gat + 2; p.hx += 3 * ext;
  return p;
}
// Gallop: hinds strike ahead (bunched), push off into the extended flight, forepaws strike, gathered flight.
function run(ph) {
  return bounding(ph, runBody, [
    { k: 'h1', off: 0.0, duty: 0.13, x0: 2, hind: true, roll: 1.1, keys: [[0.1, { A: -0.9, L: 14, phi: 1.3 }], [0.24, HIND_EXT], [0.5, { A: -0.5, L: 9, phi: 2.8 }], [0.68, { A: 0.3, L: 6, phi: 1.55 }], [0.86, HIND_TUCK]] },
    { k: 'h2', off: 0.035, duty: 0.13, x0: -2, hind: true, roll: 1.1, keys: [[0.1, { A: -0.9, L: 14, phi: 1.3 }], [0.24, HIND_EXT], [0.5, { A: -0.5, L: 9, phi: 2.8 }], [0.68, { A: 0.3, L: 6, phi: 1.55 }], [0.86, HIND_TUCK]] },
    { k: 'f1', off: 0.44, duty: 0.12, x0: 34, keys: [[0.25, FORE_FOLD], [0.82, FORE_REACH]] },
    { k: 'f2', off: 0.49, duty: 0.12, x0: 30, keys: [[0.25, FORE_FOLD], [0.82, FORE_REACH]] },
  ], G.run.stride);
}
function hopBody(ph) {
  const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.3));
  const p = mixPose(POSES.bunch, POSES.stretch, u * 0.6);
  const air = Math.sin(Math.PI * clamp((ph - 0.2) / 0.42));
  p.by = -30 - 9 * air; p.hy += -8 * air + 4; p.br -= 0.05;
  return p;
}
// Bunny hop (half-bound): a springy hop, both hind feet together, forepaws one just after the other.
function hop(ph) {
  return bounding(ph, hopBody, [
    { k: 'h1', off: 0.0, duty: 0.24, x0: 12, hind: true, roll: 0.9, keys: [[0.3, { A: -0.2, L: 8, phi: 0.75 }], [0.7, { A: 0.4, L: 6, phi: 0.4 }]] },
    { k: 'h2', off: 0.02, duty: 0.24, x0: 8, hind: true, roll: 0.9, keys: [[0.3, { A: -0.2, L: 8, phi: 0.75 }], [0.7, { A: 0.4, L: 6, phi: 0.4 }]] },
    { k: 'f1', off: 0.6, duty: 0.24, x0: 30, keys: [[0.3, { A: -0.35, L: 18, fw: 0.9 }], [0.8, { A: 0.8, L: 21, fw: 0.15 }]] },
    { k: 'f2', off: 0.64, duty: 0.24, x0: 26, keys: [[0.3, { A: -0.35, L: 18, fw: 0.9 }], [0.8, { A: 0.8, L: 21, fw: 0.15 }]] },
  ], G.hop.stride);
}
// Legacy gallop (angle-blended, auto-grounded) kept for continuity with the old shots.
export function gallop(ph, amp = 1) {
  const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * ph), p = mixPose(POSES.bunch, POSES.stretch, u);
  p.lift = 18 * amp * Math.max(0, Math.sin(Math.PI * 2 * ph - 0.6)); return p;
}

// ── drawing ──
function ear(T, p, ang, far, P, t) {
  const base = add([p.hx, p.hy], rot(far ? [-8, -8] : [-3, -9], p.hr)), a = -ang + p.hr * 0.5;
  const c = add(base, rot([0, -21], a)), E = ell(c[0], c[1], 5.5, 22, far ? 81 : 82, 0.3, a);
  cel(T, E, far ? darken(P.fur, 0.85) : P.fur, SH, 1.1, far ? 81 : 82);
  fillP(T, ell(c[0] + Math.cos(a) * 0.6, c[1] + 2 * Math.cos(a), 2.6, 15, 83, 0.2, a), far ? '#c9918a' : P.earIn);
  const tip = add(c, rot([0, -17], a)); fillP(T, ell(tip[0], tip[1], 3.6, 5, 84, 0.1, a), P.earTip);
}
function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.7); T.rotate(p.hr - F.look * 0.07);
  const op = clamp(F.open), sm = F.smile, ja = op * 0.55 + F.round * op * 0.1;
  cel(T, ell(0, 0, 15, 12.5, 84, 0.3), P.fur, SH, 1.15, 84);
  cel(T, [[-12, 4], [-17, 10], [-9, 9]], P.fur, SH, 0.9, 99);                       // cheek tuft
  // mouth interior + hinged lower jaw, behind the upper muzzle
  const hinge = [6.2, 7.4], jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  if (op > 0.03) {
    const M = [hinge, [11, 8.9], [16.2, 8.2], [17.8, 6.2], jr([17.4, 8.6]), jr([12, 9.4])];
    fillP(T, M, '#5e1f2b');
    T.save(); T.beginPath(); M.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
    fillP(T, ell(...jr([12.2, 9.8]), 5.2, 2.4, 90, 0.1), '#d77a82');
    T.restore();
  }
  const J = rpoly([[5.4, 7.2], [17.6, 8.2], [16.6, 10.9], [11.5, 12.1], [6.6, 10.6]], [2, 2.2, 2.5, 3, 2], { seed: 87, jit: 0.25 }).map(jr);
  cel(T, J, P.belly, SH * 0.35, 0.9, 87);
  if (op > 0.25) fillP(T, rpoly([[15.3, 7.6], [17.7, 7.2], [17.4, 9.3 + op * 0.5], [15.5, 9.4 + op * 0.5]], 0.6, { seed: 88, jit: 0.05 }), '#fbf6ec');   // incisors
  cel(T, ell(10.2, 3, 8.4, 5.9, 85, 0.2), P.fur, SH, 1.1, 85);                     // upper muzzle
  fillP(T, [[16.5, -0.5], [19.5, 0.5], [17, 2.8]], P.nose);
  line(T, [[17.6, 2.6], [17.4, 5.6], [16.4, 7.4]], 0.6, { seed: 93, color: 'rgba(42,33,48,.6)' });
  // closed-mouth corner: curls up for a smile, down for a frown
  if (op <= 0.03) {
    line(T, [[7.4, 8.7], [5.6, 8.2], [4.5, 8.2 - 1.8 * sm]], 0.8, { seed: 92 });
    if (F.round > 0.5) dot(T, 15.2, 10.2, 1.4, '#5e1f2b');
  }
  if (sm > 0.5) fillP(T, ell(3.5, 5, 3.6, 2.2, 97, 0.1), rgba('#e88a80', 0.35 * (sm - 0.4)));
  eye(T, 3.4, -4.6, 2.5, 3.5, F.eye, P.eye, F.look * 0.9, F.lid, F.tilt);
  brow(T, 3.4, -9.9, 6.2, F.browY * 0.7, F.browT * 0.7, darken(P.fur, 0.42), 1.2, 96);
  for (const [ty, s] of [[2, 93], [5.5, 94], [8.5, 95]]) line(T, [[16, 4.2], [29, ty]], 0.5, { seed: s, color: 'rgba(42,33,48,.55)' });
  o.out.head = T.map(2, -1); o.out.mouth = T.map(14.5, 7.5 + op * 2);
  T.restore();
}
// Foreleg from shoulder to paw; fw curls the wrist back (swing / tuck).
function foreleg(T, S, paw, fw, w, col, seed) {
  if (fw > 0.02) {
    const k = 0.62, W = [S[0] + (paw[0] - S[0]) * k, S[1] + (paw[1] - S[1]) * k], l = Math.hypot(paw[0] - W[0], paw[1] - W[1]);
    const a = Math.atan2(paw[1] - W[1], paw[0] - W[0]) + fw * 1.5, P2 = [W[0] + Math.cos(a) * l, W[1] + Math.sin(a) * l];
    cel(T, limb(...S, ...W, w, w * 0.8, 2, seed), col, SH, 1.1, seed);
    cel(T, bone(...W, ...P2, w * 0.78, w * 0.72, 2, seed + 1), col, SH, 1.05, seed + 1);
    cel(T, ell(P2[0], P2[1], w * 0.88, w * 0.72, seed + 2, 0.2, a - Math.PI / 2), col, SH, 1, seed + 2);
  } else {
    cel(T, bone(...S, ...paw, w, w * 0.76, 2, seed), col, SH, 1.1, seed);
    cel(T, ell(paw[0] + 0.8, paw[1], w * 0.95, w * 0.75, seed + 2, 0.2), col, SH, 1, seed + 2);
  }
}
function paint(T, p0, F, o) {
  const { P, t } = o;
  const p = { ...p0 };
  p.eF += 0.05 * Math.sin(t * 1.9) + F.look * -0.1; p.eB += 0.06 * Math.sin(t * 1.5 + 1.3);
  const J = joints(p), sh = SH;
  T.translate(0, -J.g);
  const fur2 = darken(P.fur, 0.85);
  ear(T, p, p.eB, true, P, t);
  foreleg(T, J.S2, J.paw2, p.fw2, 4.2, fur2, 70);
  cel(T, bone(...J.H2, ...J.heel2, 6, 4.2, 3, 69), fur2, sh, 1.05, 69);
  cel(T, bone(...J.heel2, ...J.toe2, 3.6, 3.4, 2, 71), fur2, sh, 1.05, 71);
  const B = J.B, body = ell(B[0], B[1] - F.breath * 0.4, 26 * p.bs, (17 / Math.sqrt(p.bs)) * (1 + F.breath * 0.025), 72, 0.5, p.br);
  cel(T, body, P.fur, sh, 0, 72);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(B, rot([8, 12], p.br)); fillP(T, ell(bp[0], bp[1], 20, 9, 73, 0.3, p.br), P.belly);
  for (let i = 0; i < 6; i++) { const q = add(B, rot([-16 + i * 6, -10], p.br)); line(T, [q, add(q, rot([3, 4], p.br))], 0.6, { seed: 400 + i, color: 'rgba(90,60,40,.5)' }); }
  T.restore(); line(T, [...body, body[0]], 1.2, { seed: 72, taper: false });
  const tl = add(B, rot([-27 * p.bs, -5 - 1.5 * Math.sin(t * 2.3) * 0.5], p.br)); cel(T, ell(tl[0], tl[1], 6.5, 6, 74, 0.6), P.tail, sh, 1, 74);
  cel(T, bone(...J.H, ...J.heel, 7, 4.6, 3, 75), P.fur, sh, 1.1, 75);
  cel(T, bone(...J.heel, ...J.toe, 4.2, 4, 2, 76), P.fur, sh, 1.1, 76);
  cel(T, ell(J.H[0], J.H[1], 15, 12.5, 77, 0.4, p.br), P.fur, sh, 1.15, 77);
  head(T, p, F, P, o);
  ear(T, p, p.eF, false, P, t);
  foreleg(T, J.S, J.paw1, p.fw1, 4.5, P.fur, 78);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
export default makeRig({
  kind: 'hare', label: 'Hare',
  height: 103, headHeight: 44, width: 72, shadowW: 40,
  params: { fur: '#b08559', belly: '#efe2c8', earIn: '#e8a9a0', earTip: '#4a3428', nose: '#d97a7a', eye: '#3a2412', tail: '#f6efe2' },
  speeds: { walk: G.walk.speed, hop: G.hop.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, hop: G.hop.stride, run: G.run.stride },
  steps: { walk: [0, 0.04, 0.25], hop: [0, 0.62], run: [0, 0.44] },
  poses: POSES,
  gaits: { walk, hop, run },
  gestures: {
    nod: g(0.8, (u, b = base) => plus(b, { hr: 0.22 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.15 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), hy: 2 * Math.sin(Math.PI * clamp(u / 0.9)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.5, (u, b = base) => { const e = ease(clamp(u / 0.15)) * (1 - ease(clamp((u - 0.85) / 0.15))); const p = mixPose(b, POSES.laugh, e); p.by -= Math.abs(Math.sin(u * Math.PI * 7)) * 3 * e; p.hy -= Math.abs(Math.sin(u * Math.PI * 7)) * 4 * e; return p; }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 40, crouch: { by: 7, hy: 8, eF: 0.6, eB: 0.6, hindA: 0.15 }, air: { foreA: 0.9, foreA2: 0.8, hindA: -1.2, hindA2: -1.1, foot: 1.6, foot2: 1.5, br: 0.1, eF: 0.8, eB: 0.9 } }), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.6, (u, b = base) => { const e = ease(clamp(u / 0.2)) * (1 - ease(clamp((u - 0.82) / 0.18))); const p = mixPose(b, POSES.alert, e); p.foreA = lerp(p.foreA, 2.55 + 0.45 * Math.sin(u * Math.PI * 8), e); p.sm = 0.6 * e; return p; }, [0.25, 0.4, 0.55, 0.7]),
    point: g(1.4, (u, b = base) => { const e = ease(clamp(u / 0.25)) * (1 - ease(clamp((u - 0.8) / 0.2))); const p = mixPose(b, POSES.offer, e); p.foreA = lerp(p.foreA, 1.75, e); p.hr = lerp(p.hr, -0.2, e); return p; }, [0.2, 0.4, 0.6, 0.8]),
    yawn: g(2.0, (u, b = base) => mixPose(b, POSES.yawn, ease(clamp(u / 0.3)) * (1 - ease(clamp((u - 0.7) / 0.3)))), [0.2, 0.4, 0.6, 0.8]),
    thump: g(0.9, (u, b = base) => plus(b, { hindA: 0.7 * Math.max(0, Math.sin(Math.PI * clamp(u / 0.3))) + 0.7 * Math.max(0, Math.sin(Math.PI * clamp((u - 0.4) / 0.3))), foot: -0.5 * Math.sin(Math.PI * clamp(u / 0.7)) }), [0.15, 0.3, 0.55, 0.7]),
    shrug: g(1.0, (u, b = base) => plus(b, { hy: -3 * Math.sin(Math.PI * u), eF: 0.5 * Math.sin(Math.PI * u), eB: 0.5 * Math.sin(Math.PI * u), foreA: 0.6 * Math.sin(Math.PI * u), sm: -0.3 * Math.sin(Math.PI * u) }), [0.25, 0.5, 0.75]),
  },
  feet,
  paint,
});
export { POSES as HP };
