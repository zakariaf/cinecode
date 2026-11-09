// The Squirrel. Legacy look (red coat, cream front, huge brush) as a full rig: sits up with an acorn, shushes,
// drops the acorn, nibbles; on the ground it hop-walks and bounds with planted feet; perches on branches.
// Round 2 (DESIGN §9.2): params.tail (0.4..1.8) scales the brush; above ~1.1 it gets fluffier, below 0.7 it goes flat,
// thin and pointed like a wet paintbrush and hangs instead of curling. Pose "flop": exhausted, lying flat over something
// rounded (a tortoise's shell, a branch) with legs dangling and the tail draped down; it is a hanging pose (pose.hang = 1:
// limbs and tail may go below the contact point), listed in rig.hangPoses. st.tilt pitches the head.
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, quadFeet, leg, spine, mixPose, plus, jumpAt, ease, frac, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 1.3;

// Pose: body centre (bx, by), rotation br (0 = on all fours, -1.35 upright), head (hx, hy, hr), ear ea,
// tail start angle ta / bend tc, near & far fore paws f1/f2 and hind toes h1/h2 (ground units), paw angles fa/ha,
// acorn (1 = shown), ad (0 = in the paws .. 1 = dropped on the ground in front), sq body squash 0..1 (flattened),
// hang (1 = limbs and tail hang free below the contact line), tw tail width factor (a limp tail lies flatter), face hints.
const D = { bx: 0, by: -11, br: -1.35, hx: 4, hy: -26, hr: 0, ea: 0, ta: 0.75, tc: 2.1, fa: 0.2, ha: 1.45, acorn: 0, ad: 0, nib: 0, sq: 0, hang: 0, tw: 1, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], H1 = add(B, rot([-6.5, 1.5], p.br)), S1 = add(B, rot([6, 1.5], p.br));
  return { B, H1, H2: add(H1, [1.8, -0.6]), S1, S2: add(S1, [1.6, -0.4]), Tb: add(B, rot([-8.5, -2.5], p.br)) };
};
const UPRIGHT = { f1x: 7.5, f1y: -15, f2x: 8.5, f2y: -15.5, h1x: 8, h1y: 0, h2x: 9.5, h2y: 0 };
export const POSES = {
  sit: P0({ ...UPRIGHT, fa: -0.4 }),
  hold: P0({ ...UPRIGHT, f1x: 7.2, f1y: -14, fa: -0.6, acorn: 1 }),
  stand: P0({ bx: -1, by: -9.5, br: -0.32, hx: 10, hy: -17, hr: -0.15, ta: 0.9, tc: 1.7, f1x: 7, f1y: 0, f2x: 8.5, f2y: 0, h1x: 1, h1y: 0, h2x: 2.5, h2y: 0, fa: 0.1, ha: 1.3 }),
  alert: P0({ by: -13.5, br: -1.45, hx: 3, hy: -31, hr: -0.1, ea: -0.2, ta: 0.55, tc: 1.6, ...UPRIGHT, f1x: 6.5, f1y: -17.5, f2x: 7.5, f2y: -18, h1x: 6, h2x: 7.5, ha: 1.2, fa: 0.6, lid: 0 }),
  shush: P0({ ...UPRIGHT, f1x: 10.5, f1y: -24.5, fa: -1.2 }),
  sleep: P0({ bx: 0, by: -8.6, br: -0.05, hx: 9, hy: -8, hr: 0.4, ea: 0.3, ta: 1.3, tc: 3.6, f1x: 7, f1y: 0, f2x: 8, f2y: 0, h1x: 0, h1y: 0, h2x: 1, h2y: 0, fa: 1.4, ha: 1.5, lid: 1 }),
  // exhausted, draped belly-down over a shell or a branch: legs dangle, chin rests, the tail hangs down behind
  flop: P0({ bx: 0, by: -5.4, br: 0.04, sq: 0.32, hang: 1, hx: 12.4, hy: -5.6, hr: 0.22, ea: 0.5, ta: -0.45, tc: -0.75, tw: 0.5, f1x: 10.5, f1y: 7.5, f2x: 13.5, f2y: 4, h1x: -7.5, h1y: 8, h2x: -10, h2y: 4.5, fa: 0.25, ha: 0.35, lid: 0.55 }),
};
POSES.rest = POSES.sit; POSES.perch = POSES.hold;

// ── gaits ──
const G = { walk: { stride: 15, speed: 24 }, run: { stride: 60, speed: 165 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
function walkBody(ph) {
  const p = { ...POSES.stand }, hop = Math.max(0, Math.sin(Math.PI * clamp((ph - 0.5) / 0.5)));
  p.by = -9.5 - 1.6 * hop; p.br = -0.32 - 0.08 * hop; p.hy = -17 - 1.2 * hop; p.ta = 0.9 + 0.15 * Math.sin(Math.PI * 2 * ph); return p;
}
function walk(ph) {
  return quadFeet(walkBody(ph), ph, { h1: { off: 0, duty: 0.5, x0: 1, lift: 3 }, h2: { off: 0.02, duty: 0.5, x0: 2.5, lift: 3 }, f1: { off: 0.25, duty: 0.78, x0: 8, lift: 2.5 }, f2: { off: 0.04, duty: 0.78, x0: 9.5, lift: 2.5 } }, G.walk.stride, rootsAt(walkBody));
}
function runBody(ph) {
  const p = { ...POSES.stand }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.25));
  const ext = Math.sin(Math.PI * clamp((ph - 0.18) / 0.26)), gat = Math.sin(Math.PI * clamp((ph - 0.62) / 0.38));
  p.br = lerp(-0.4, -0.05, u); p.by = -10 - 5 * ext - 3 * gat; p.hx = lerp(9, 12, u); p.hy = lerp(-17, -15, u) - 5 * ext - 3 * gat; p.hr = -0.05;
  p.ta = lerp(1.05, 0.7, u); p.tc = lerp(1.5, 0.9, u); p.ha = 1.1; p.fa = 0.4; return p;
}
function run(ph) {
  const HK = [[0.3, [-9, 6]], [0.65, [-1, 6.5]], [0.88, [8, 7]]], FK = [[0.3, [-6, 7]], [0.7, [2, 6]], [0.88, [7, 8]]];
  return quadFeet(runBody(ph), ph, { h1: { off: 0, duty: 0.2, x0: 3, keys: HK }, h2: { off: 0.03, duty: 0.2, x0: 4.5, keys: HK }, f1: { off: 0.44, duty: 0.17, x0: 10, keys: FK }, f2: { off: 0.48, duty: 0.17, x0: 11.5, keys: FK } }, G.run.stride, rootsAt(runBody));
}

// ── drawing ──
function acorn(T, x, y, s, r = 0) {
  T.save(); T.translate(x, y); T.rotate(r); T.scale(s, s);
  const nut = ell(0, 1.2, 3, 3.6, 191, 0.1); cel(T, nut, '#b08040', 0.8, 0.6, 191);
  const cap = ell(0, -1.6, 3.6, 2, 192, 0.1); cel(T, cap, '#6b4a2a', 0.8, 0.6, 192);
  line(T, [[0, -3.4], [0.6, -4.8]], 0.7, { seed: 193, color: '#4a3020' });
  T.restore();
}
function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.4 + p.nib * Math.sin(o.t * 18) * 1.1); T.rotate(p.hr - F.look * 0.08);
  const op = clamp(F.open), sm = F.smile, ea = p.ea + 0.05 * Math.sin(o.t * 2.4);
  T.save(); T.translate(-2.2, -4.5); T.rotate(ea - 0.15);                                       // far ear
  cel(T, [[-2, 0], [-0.5, -8.5], [2.5, 0]], darken(P.coat, 0.85), SH, 0.9, 185); T.restore();
  cel(T, ell(0, 0, 7, 6.2, 187, 0.2), P.coat, SH, 1.1, 187);
  // mouth below the muzzle: open = dark oval with two incisors
  const mx = 5.6, my = 3.2;
  if (op > 0.03) {
    const M = ell(mx - 0.4, my + op * 1.2, 1.6 + op * 0.5, 0.6 + op * 1.5, 194, 0.05); fillP(T, M, '#5e2026');
    fillP(T, [[mx - 0.9, my - 0.3], [mx + 0.9, my - 0.3], [mx + 0.8, my + 1.3], [mx - 0.8, my + 1.3]], '#fbf4e4');
    line(T, [...M, M[0]], 0.6, { seed: 195, taper: false });
  }
  fillP(T, ell(3.6, 2.4, 3.8, 2.8, 188, 0.1), P.cream);
  if (op <= 0.03) {
    line(T, [[6.6, 1.6], [6.2, 3.0], [4.8, 3.4 + Math.max(0, -sm) * 0.3], [3.4, 3.1 - 0.9 * sm]], 0.6, { seed: 196 });
    if (F.round > 0.5) dot(T, 5.4, 3.8, 0.9, '#5e2026');
  }
  dot(T, 6.8, 0.8, 1.05, P.nose);
  if (sm > 0.5) fillP(T, ell(1.4, 1.8, 2, 1.2, 197, 0.1), rgba('#e88070', 0.35 * (sm - 0.4)));
  eye(T, 2.2, -1.6, 1.6, 2, F.eye, P.eye, gaze(F, 0.5, 2), F.lid, F.tilt, { w: 0.9 });
  brow(T, 2.1, -4.7, 3.6, F.browY * 0.7, F.browT * 0.75, darken(P.coat, 0.5), 0.95, 198);
  for (const [ty, s] of [[0.6, 200], [2.2, 201]]) line(T, [[6.4, 1.4], [11, ty]], 0.35, { seed: s, color: 'rgba(42,33,48,.5)' });
  T.save(); T.translate(-0.6, -4.8); T.rotate(ea);                                                // near ear with tuft
  cel(T, [[-2.2, 0], [0, -8.6], [2.8, 0]], P.coat, SH, 0.95, 186); fillP(T, [[-0.8, -0.6], [0.1, -6], [1.6, -0.6]], P.earIn);
  line(T, [[0, -8.2], [-0.6, -10.6]], 0.7, { seed: 199, color: darken(P.coat, 0.6) }); T.restore();
  o.out.head = T.map(1, -0.5); o.out.mouth = T.map(mx - 0.4, my + op);
  T.restore();
}
// The brush for params.tail = k: length and width grow with k at every size; above 1.1 fluff tufts ring it; below 0.7
// (fully by 0.6) it is wet: thin, clumped to a point and limp. A wet tail never rests on the ground, so it reads the
// same on a shell or a branch as on the grass: upright it lifts off the rump in a tired arch and the tip hangs; asleep
// (a curled pose) it drops off the rump and tucks under the haunch instead of wrapping; in a hanging pose it falls.
function tailOf(p, R, k, t) {
  const w = clamp((0.7 - k) / 0.1), len = 46 * (0.6 + 0.4 * k) * (1 - 0.3 * w), wk = k * (1 - 0.12 * w) * (p.tw ?? 1);
  const cu = clamp((p.tc - 2.4) / 1.2), hg = clamp(p.hang);
  const wa = lerp(lerp(1.05, -0.5, cu), Math.min(p.ta, 0.4), hg), wc = lerp(lerp(-2.7, -2.1, cu), Math.min(p.tc, -0.7), hg);
  const ta = lerp(p.ta, wa, w), tc = lerp(p.tc, wc, w);
  const dry = u => (2.6 + 5.2 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.9))) * (u > 0.92 ? 1 - (u - 0.92) * 4 : 1);
  const wet = u => 0.35 + 3.3 * Math.pow(1 - u, 0.9) * Math.min(1, 0.55 + u * 3);
  return { w, ...spine(R.Tb, ta, tc, len, u => lerp(dry(u), wet(u), w) * wk, { n: 18, wave: 0.12 * (1 - 0.7 * w), t, ground: !(p.hang > 0.5) }) };
}
function paint(T, p0, F, o) {
  const { P, t } = o, k = clamp(P.tail ?? 1, 0.4, 1.8);
  const p = pitchPose(p0, F.pitch, { hr: -0.55, hy: -1.2, hx: -0.8 }, { hr: 0.45, hy: 1 }), R = roots(p);
  const sp = tailOf(p, R, k, t);
  const sleeping = p.tc > 3 && sp.w < 0.5;                        // a dry tail wraps round the sleeper; a wet one tucks behind
  const drawTail = () => {
    cel(T, sp.poly, darken(P.coat, 0.95 - 0.12 * sp.w), SH, 1.1, 180);
    T.save(); T.beginPath(); sp.poly.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
    if (sp.w > 0.05) {                                              // wet: dark clumped strands and one wet sheen
      for (let i = 0; i < 5; i++) line(T, sp.pts.slice(1 + i, 18 - i).map((q, j) => [q[0], q[1] + (i - 2) * sp.ws[j + 1 + i] * 0.32]), 0.45, { seed: 181 + i, color: rgba(darken(P.coat, 0.55), 0.6 * sp.w) });
      line(T, sp.pts.slice(2, 12).map((q, j) => [q[0], q[1] - sp.ws[j + 2] * 0.45]), 0.5, { seed: 187, color: rgba('#ffffff', 0.45 * sp.w) });
    } else for (let i = 2; i < 17; i++) { const q = sp.pts[i], w = sp.ws[i]; line(T, [[q[0] - w * 0.5, q[1] - 0.6], [q[0] - w * 0.15, q[1] + 1]], 0.55, { seed: 181 + i, color: 'rgba(240,200,160,.55)' }); }
    T.restore();
    if (k > 1.1) {                                                  // fluff: little tufts breaking the outline
      const f = Math.min(1, (k - 1.1) / 0.5);
      for (let i = 3; i < 18; i += 2) { const q0 = sp.pts[i - 1], q = sp.pts[i], dx = q[0] - q0[0], dy = q[1] - q0[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, w = sp.ws[i];
        for (const sd of [-1, 1]) { const b = [q[0] + nx * w * sd * 0.92, q[1] + ny * w * sd * 0.92]; line(T, [b, [b[0] + nx * sd * (0.8 + f) - dx / d * 1.2, b[1] + ny * sd * (0.8 + f) - dy / d * 1.2]], 0.55, { seed: 260 + i + sd, color: darken(P.coat, 0.6) }); } }
    }
  };
  if (!sleeping) drawTail();
  const free = p.hang > 0.5;
  leg(T, R.H2, [p.h2x, p.h2y], { free, l1: 6.5, l2: 6, meta: 7, ma: p.ha, bend: 1, w: [4.6, 2.3, 1.8, 1.5], col: darken(P.coat, 0.82), paw: [2.2, 1.3], sh: SH, seed: 210, curl: p.h2u, curlA: 0.8, ink: 0.85 });
  leg(T, R.S2, [p.f2x, p.f2y], { free, l1: 4.6, l2: 4.4, meta: 1.6, ma: p.fa, bend: -1, w: [2, 1.6, 1.3, 1.2], col: darken(P.coat, 0.82), paw: [1.5, 1.1], sh: SH, seed: 220, curl: p.f2u, curlA: -1.2, ink: 0.8 });
  const body = ell(R.B[0], R.B[1], 11 * (1 + F.breath * 0.02) * (1 + p.sq * 0.12), 7.6 * (1 - p.sq * 0.3), 184, 0.3, p.br);
  cel(T, body, P.coat, SH, 0, 184);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([1.5, 4.8 * (1 - p.sq * 0.3)], p.br)); fillP(T, ell(bp[0], bp[1], 9.5, 4.2, 185, 0.2, p.br), P.cream); T.restore();
  line(T, [...body, body[0]], 1.1, { seed: 184, taper: false });
  // neck join
  cel(T, ell((R.S1[0] + p.hx) / 2 - 0.5, (R.S1[1] + p.hy) / 2 + 1, 4.6, 5.2, 189, 0.2, Math.atan2(p.hx - R.S1[0], R.S1[1] - p.hy)), P.coat, SH, 0, 189);
  // near hind with haunch
  const hl = leg(T, R.H1, [p.h1x, p.h1y], { free, l1: 6.5, l2: 6, meta: 7, ma: p.ha, bend: 1, w: [5, 2.6, 2, 1.7], col: P.coat, paw: [2.4, 1.4], sh: SH, seed: 230, curl: p.h1u, curlA: 0.8, ink: 0.9 });
  const ha = Math.atan2(hl.knee[1] - R.H1[1], hl.knee[0] - R.H1[0]), hy = free ? (R.H1[1] + hl.knee[1]) / 2 : Math.min((R.H1[1] + hl.knee[1]) / 2, -Math.hypot(5.6 * Math.sin(ha), 4.6 * Math.cos(ha)) - 0.9);
  cel(T, ell((R.H1[0] + hl.knee[0]) / 2, hy, 5.6, 4.6, 231, 0.2, ha), P.coat, SH, 0.95, 231);
  head(T, p, F, P, o);
  if (sleeping) drawTail();
  // acorn: held between the forepaws, or dropping to the ground in front
  if (p.acorn > 0.5) {
    const mouth = add([p.hx, p.hy], rot([6.6, 4.4], p.hr)), hold = p.f1y > -5 ? mouth : [p.f1x + 1.6, p.f1y + 0.2], land = [hold[0] + 7, -3.6], u = clamp(p.ad);
    let ax = lerp(hold[0], land[0], u), ay;
    if (u < 0.7) { const v = u / 0.7; ay = lerp(hold[1], land[1], v * v); } else { const v = (u - 0.7) / 0.3; ay = land[1] - 3 * Math.sin(Math.PI * v) * (1 - v * 0.3); }
    acorn(T, ax, Math.min(ay, -3.6), 1, u * 7.85);
  }
  leg(T, R.S1, [p.f1x, p.f1y], { free, l1: 4.6, l2: 4.4, meta: 1.6, ma: p.fa, bend: -1, w: [2.2, 1.7, 1.4, 1.3], col: P.coat, paw: [1.6, 1.2], sh: SH, seed: 240, curl: p.f1u, curlA: -1.2, ink: 0.85 });
}

const base = POSES.sit;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'squirrel', label: 'Squirrel',
  hangPoses: ['flop'],
  height: 52, headHeight: 17, width: 24, shadowW: 12,
  perch: true, breathPeriod: 1.6,
  params: { coat: '#b4542a', cream: '#f0dcc0', earIn: '#d98a78', nose: '#3a2020', eye: '#1a1210', tail: 1 },
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.04, 0.25], run: [0, 0.44] },
  poses: { stand: POSES.stand, ...POSES },
  gaits: { walk, run },
  gestures: {
    nod: g(0.7, (u, b = base) => plus(b, { hr: 0.25 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.18 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), hy: 1.2 * Math.sin(Math.PI * u) }), [0.22, 0.5, 0.7]),
    laugh: g(1.3, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { hr: -0.3 * e, hy: -1.5 * k, by: -1 * k, mo: 0.7 * e, eh: e, sm: e, ta: 0.15 * k }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.8, (u, b = base) => jumpAt(u, b, { h: 20, crouch: { by: 1.3, hy: 2 }, air: { ta: 0.3, tc: -0.6, h1y: -4, h2y: -4, ha: 0.6 } }), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.4, (u, b = base) => { const e = env(u, 0.2, 0.2), R = roots(b); return mixPose(b, { ...b, f1x: R.S1[0] + 4 + 1.5 * Math.sin(u * Math.PI * 8), f1y: R.S1[1] - 7, fa: -2.4, sm: 0.6, acorn: 0 }, e); }, [0.25, 0.4, 0.55, 0.7]),
    point: g(1.3, (u, b = base) => { const e = env(u, 0.25, 0.2), R = roots(b); return mixPose(b, { ...b, f1x: R.S1[0] + 9, f1y: R.S1[1] - 1, fa: -1.6, hr: -0.15, acorn: 0 }, e); }, [0.2, 0.4, 0.6, 0.8]),
    shush: g(1.5, (u, b = base) => mixPose(b, { ...b, ...POSES.shush, acorn: 0, lid: 0.3 }, env(u, 0.2, 0.2)), [0.2, 0.5, 0.8]),
    drop: g(1.2, (u, b = base) => { const p = mixPose({ ...b, acorn: 1 }, { ...b, f1y: Math.min(b.f1y + 2, 0), fa: 0.6, ea: -0.2 }, ease(clamp(u / 0.15))); p.acorn = 1; p.ad = clamp((u - 0.12) / 0.8); return p; }, [0.1, 0.4, 0.7, 1]),
    nibble: g(1.6, (u, b = base) => {                    // paws bring the acorn up to the mouth, quick chewing bobs
      const e = env(u, 0.15, 0.15), p = mixPose(b, { ...POSES.hold, f1x: 8.8, f1y: -18.5, hx: POSES.hold.hx + 1, hy: POSES.hold.hy + 1.5, hr: 0.3, acorn: 1, ad: 0 }, e);
      p.hy += 0.8 * e * Math.abs(Math.sin(u * Math.PI * 10)); p.nib = e;
      p.acorn = Math.max(b.acorn || 0, e > 0.5 ? 1 : 0); p.ad = b.ad || 0; return p;
    }, [0.25, 0.5, 0.75]),
  },
  feet: p => [['f1', 'cf1'], ['f2', 'cf2'], ['h1', 'ch1'], ['h2', 'ch2']].map(([k, c]) => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p[c] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
