// The Squirrel. Legacy look (red coat, cream front, huge brush) as a full rig: sits up with an acorn, shushes,
// drops the acorn, nibbles; on the ground it hop-walks and bounds with planted feet; perches on branches.
// Round 2 (DESIGN §9.2): params.tail (0.4..1.8) scales the brush; above ~1.1 it gets fluffier, below 0.7 it goes flat,
// thin and pointed like a wet paintbrush and hangs instead of curling. Pose "flop": exhausted, lying flat over something
// rounded (a tortoise's shell, a branch) with legs dangling and the tail draped down; it is a hanging pose (pose.hang = 1:
// limbs and tail may go below the contact point), listed in rig.hangPoses; the tail lies along the curve of what it lies
// on, and soft contact shadows under the belly and the tail press it onto it. st.tilt pitches the head.
// The brush is never a stiff paddle: it rises from the rump in an S with the tip flicked back (tf), and in motion a
// wave travels down it from base to tip (tws/twc: amplitude × sin/cos of its phase), so it trails behind the body.
// The hop (the jump gesture, which the film's hop moves repeat) keys it through a follow-through (see hopAt).
import { clamp, lerp, ell, rpoly, poly, shift } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba, SHADE, smoothPts } from '../core/style.mjs';
import { makeRig, quadFeet, leg, spine, tube, mixPose, plus, jumpAt, ease, frac, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 1.3;

// Pose: body centre (bx, by), rotation br (0 = on all fours, -1.35 upright), head (hx, hy, hr), ear ea,
// tail start angle ta / bend tc, near & far fore paws f1/f2 and hind toes h1/h2 (ground units), paw angles fa/ha,
// acorn (1 = shown), ad (0 = in the paws .. 1 = dropped on the ground in front), sq body squash 0..1 (flattened),
// hang (1 = limbs and tail hang free below the contact line), tw tail width factor (a limp tail lies flatter),
// tf tail-tip flick (0..1), tws/twc travelling tail wave (amplitude·sin, amplitude·cos of its phase), face hints.
const D = { bx: 0, by: -11, br: -1.35, hx: 4, hy: -26, hr: 0, ea: 0, ta: 0.75, tc: 2.1, tf: 0.6, tws: 0, twc: 0, fa: 0.2, ha: 1.45, acorn: 0, ad: 0, nib: 0, sq: 0, hang: 0, tw: 1, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by], H1 = add(B, rot([-6.5, 1.5], p.br)), S1 = add(B, rot([6, 1.5], p.br));
  return { B, H1, H2: add(H1, [1.8, -0.6]), S1, S2: add(S1, [1.6, -0.4]), Tb: add(B, rot([-8.5, -2.5], p.br)) };
};
const UPRIGHT = { f1x: 7.5, f1y: -15, f2x: 8.5, f2y: -15.5, h1x: 8, h1y: 0, h2x: 9.5, h2y: 0 };
export const POSES = {
  sit: P0({ ...UPRIGHT, fa: -0.4 }),
  hold: P0({ ...UPRIGHT, f1x: 7.2, f1y: -14, fa: -0.6, acorn: 1 }),
  stand: P0({ bx: -1, by: -9.5, br: -0.32, hx: 10, hy: -17, hr: -0.15, ta: 0.45, tc: 2.25, tf: 1.6, f1x: 7, f1y: 0, f2x: 8.5, f2y: 0, h1x: 1, h1y: 0, h2x: 2.5, h2y: 0, fa: 0.1, ha: 1.3 }),
  alert: P0({ by: -13.5, br: -1.45, hx: 3, hy: -31, hr: -0.1, ea: -0.2, ta: 0.55, tc: 1.6, ...UPRIGHT, f1x: 6.5, f1y: -17.5, f2x: 7.5, f2y: -18, h1x: 6, h2x: 7.5, ha: 1.2, fa: 0.6, lid: 0 }),
  shush: P0({ ...UPRIGHT, f1x: 10.5, f1y: -24.5, fa: -1.2 }),
  sleep: P0({ bx: 0, by: -8.6, br: -0.05, hx: 9, hy: -8, hr: 0.4, ea: 0.3, ta: 1.3, tc: 3.6, f1x: 7, f1y: 0, f2x: 8, f2y: 0, h1x: 0, h1y: 0, h2x: 1, h2y: 0, fa: 1.4, ha: 1.5, lid: 1 }),
  // exhausted, draped belly-down over a shell or a branch: legs dangle, chin rests, the tail hangs down behind
  flop: P0({ bx: 0, by: -4.7, br: 0.04, sq: 0.36, hang: 1, hx: 12.6, hy: -4.6, hr: 0.34, ea: 0.85, ta: -0.68, tc: -0.88, tf: 0, tw: 0.55, f1x: 8.6, f1y: 4.6, f2x: 10.5, f2y: 2.4, h1x: -13.5, h1y: 4.6, h2x: -10, h2y: 1.8, fa: 0.9, ha: 0.55, lid: 0.55 }),
};
// the same exhaustion on flat ground (a "sploot"): belly on the grass, chin down between the forepaws, hind legs
// stretched out flat behind, the limp tail lying along the ground behind him. Not a hanging pose: nothing goes below
// the contact line (use "flop" over a shell or a branch, "sprawl" on the ground).
POSES.sprawl = P0({ bx: 0, by: -7.3, br: 0.03, sq: 0.36, hx: 12.8, hy: -7.1, hr: 0.3, ea: 0.85, ta: -0.5, tc: 0.45, tf: -0.9, tw: 0.6, f1x: 9.5, f1y: 0, f2x: 8, f2y: 0, h1x: -14.5, h1y: 0, h2x: -12, h2y: 0, fa: 1.2, ha: -1.35, lid: 0.55 });
POSES.rest = POSES.sit; POSES.perch = POSES.hold;

// ── gaits ──
const G = { walk: { stride: 15, speed: 24 }, run: { stride: 60, speed: 165 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
function walkBody(ph) {
  const p = { ...POSES.stand }, hop = Math.max(0, Math.sin(Math.PI * clamp((ph - 0.5) / 0.5)));
  p.by = -9.5 - 1.6 * hop; p.br = -0.32 - 0.08 * hop; p.hy = -17 - 1.2 * hop; p.ta = POSES.stand.ta + 0.1 * Math.sin(Math.PI * 2 * ph);
  const a = Math.PI * 2 * (ph - 0.62); p.tws = 0.16 * Math.sin(a); p.twc = 0.16 * Math.cos(a); return p;   // the brush bobs a beat behind the hop
}
function walk(ph) {
  return quadFeet(walkBody(ph), ph, { h1: { off: 0, duty: 0.5, x0: 1, lift: 3 }, h2: { off: 0.02, duty: 0.5, x0: 2.5, lift: 3 }, f1: { off: 0.25, duty: 0.78, x0: 8, lift: 2.5 }, f2: { off: 0.04, duty: 0.78, x0: 9.5, lift: 2.5 } }, G.walk.stride, rootsAt(walkBody));
}
function runBody(ph) {
  const p = { ...POSES.stand }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.25));
  const ext = Math.sin(Math.PI * clamp((ph - 0.18) / 0.26)), gat = Math.sin(Math.PI * clamp((ph - 0.62) / 0.38));
  p.br = lerp(-0.4, -0.05, u); p.by = -10 - 5 * ext - 3 * gat; p.hx = lerp(9, 12, u); p.hy = lerp(-17, -15, u) - 5 * ext - 3 * gat; p.hr = -0.05;
  // the brush streams out behind, low, and a wave runs down it a beat behind each bound (the tip lags the base)
  const a = Math.PI * 2 * (ph - 0.42);
  p.ta = lerp(0.55, 0.25, u); p.tc = lerp(-0.15, -0.35, u); p.tf = -0.65; p.tws = 0.5 * Math.sin(a); p.twc = 0.5 * Math.cos(a); p.ha = 1.1; p.fa = 0.4; return p;
}
function run(ph) {
  const HK = [[0.3, [-9, 6]], [0.65, [-1, 6.5]], [0.88, [8, 7]]], FK = [[0.3, [-6, 7]], [0.7, [2, 6]], [0.88, [7, 8]]];
  return quadFeet(runBody(ph), ph, { h1: { off: 0, duty: 0.2, x0: 3, keys: HK }, h2: { off: 0.03, duty: 0.2, x0: 4.5, keys: HK }, f1: { off: 0.44, duty: 0.17, x0: 10, keys: FK }, f2: { off: 0.48, duty: 0.17, x0: 11.5, keys: FK } }, G.run.stride, rootsAt(runBody));
}
// Hermite through keys [[u, [values]], ...] with Catmull-Rom tangents (zero at both ends, so a looped hop has no
// kink): the tail moves through its keys without stopping at each one.
function spline(K, u) {
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [a, b] = [K[i], K[i + 1]], h = b[0] - a[0], t = clamp((u - a[0]) / h), t2 = t * t, t3 = t2 * t;
  const tan = j => (j <= 0 || j >= K.length - 1 ? K[j][1].map(() => 0) : K[j][1].map((v, c) => ((K[j + 1][1][c] - K[j - 1][1][c]) / (K[j + 1][0] - K[j - 1][0])) * h));
  const ma = tan(i), mb = tan(i + 1);
  return a[1].map((v, c) => (2 * t3 - 3 * t2 + 1) * v + (t3 - 2 * t2 + t) * ma[c] + (-2 * t3 + 3 * t2) * b[1][c] + (t3 - t2) * mb[c]);
}
// The hop (the jump gesture; the film's hop moves are a run of these from "stand"): jumpAt's crouch, flight and
// landing, with the body nosing up off the ground, levelling at the top and nosing down to land, hind legs that
// push off and forepaws that reach for the ground. The brush follows through: it cocks up in the crouch, trails low
// behind the rising body, streams back in an S over the top, is thrown up as the body drops, overshoots on landing
// with the tip flicking over, and settles. Keys: [u, [ta, tc, tf, wave amplitude]].
const HOP_TAIL = [[0.16, [0.6, 2.45, 1.35, 0.05]], [0.27, [0.45, 1.5, 0.6, 0.2]], [0.36, [0.18, 0.45, -0.5, 0.6]], [0.5, [0.22, 0.2, -1.1, 0.95]],
  [0.64, [0.4, 0.4, -0.7, 0.7]], [0.76, [0.72, 1.6, 0.6, 0.3]], [0.85, [0.95, 2.6, 1.7, 0.15]], [0.93, [0.38, 2.1, 1.5, 0.05]]];
const bump = (u, a, b) => Math.pow(Math.sin(Math.PI * clamp((u - a) / (b - a))), 2);
function hopAt(u, b) {
  const p = jumpAt(u, b, { h: 20, crouch: { by: 1.3, hy: 2 }, air: { h1y: -4, h2y: -4, ha: 0.6 } });
  const pitch = -0.24 * bump(u, 0.2, 0.5) + 0.22 * bump(u, 0.48, 0.86);           // nose up off the ground, nose down to land
  p.br += pitch; p.hx += 7.5 * pitch; p.hy += 11 * pitch; p.hr += 0.6 * pitch;
  const push = bump(u, 0.22, 0.44), reach = bump(u, 0.52, 0.8);
  p.h1x -= 3.2 * push; p.h2x -= 3.2 * push; p.h1y += 1.2 * push; p.h2y += 1.2 * push;   // the hind legs stretch out behind
  p.f1x += 3 * reach - 2 * push; p.f2x += 3 * reach - 2 * push; p.f1y += 1.2 * reach - 2.5 * push; p.f2y += 1.2 * reach - 2.5 * push; p.fa += 0.5 * push;
  const [ta, tc, tf, A] = spline([[0, [b.ta, b.tc, b.tf ?? 0.6, 0]], ...HOP_TAIL, [1, [b.ta, b.tc, b.tf ?? 0.6, 0]]], u), a = Math.PI * 2 * (1.5 * u - 0.15);
  p.ta = ta; p.tc = tc; p.tf = tf; p.tws = (b.tws || 0) + A * Math.sin(a); p.twc = (b.twc || 0) + A * Math.cos(a);
  return p;
}

// ── drawing ──
function acorn(T, x, y, s, r = 0) {
  T.save(); T.translate(x, y); T.rotate(r); T.scale(s, s);
  const nut = smoothPts(T, ell(0, 1.2, 3, 3.6, 191, 0.1)); cel(T, nut, '#b08040', 0.8, 0.6, 191);
  const cap = smoothPts(T, ell(0, -1.6, 3.6, 2, 192, 0.1)); cel(T, cap, '#6b4a2a', 0.8, 0.6, 192);
  line(T, [[0, -3.4], [0.6, -4.8]], 0.7, { seed: 193, color: '#4a3020' });
  T.restore();
}
// The head is one form: skull and snout share a single ink silhouette (both inked first, twice as wide, then both
// filled, so only the union's outer edge shows), with one cel shadow for the union and a cream muzzle and chin.
// The mouth opens inside the muzzle: the head's outlines tear along the upper lip and everything under it, in front
// of the mouth corner, swings down with the lower jaw (more toward the front: ~20% of the head's height at open = 1,
// nothing at the corner), so the chin stays one smooth outline and the torn front edge is the mouth's opening; the
// cut-out between the lips shows a dark mouth, a tongue and the upper incisors. A smile lifts the corner; a round
// mouth is shorter and drops further.
const SKULL = [0, 0, 7, 6.2], SNOUT = [4.1, 2.25, 3.5, 2.7], CREAM = [3.4, 3.4, 4.2, 3.1], NOSE = [7.05, 0.95], HEAD_H = 12.4;
const dense = (Q, d) => Q.flatMap((q, i) => { const r = Q[(i + 1) % Q.length], n = Math.max(1, Math.ceil(Math.hypot(r[0] - q[0], r[1] - q[1]) / d)); return Array.from({ length: n }, (_, j) => [lerp(q[0], r[0], j / n), lerp(q[1], r[1], j / n)]); });
function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.4 + p.nib * Math.sin(o.t * 18) * 1.1); T.rotate(p.hr - F.look * 0.08);
  const op = clamp(F.open), sm = F.smile, rd = clamp(F.round || 0), ea = p.ea + 0.05 * Math.sin(o.t * 2.4), S = Q => smoothPts(T, Q);
  T.save(); T.translate(-2.2, -4.5); T.rotate(ea - 0.15);                                       // far ear
  cel(T, [[-2, 0], [-0.5, -8.5], [2.5, 0]], darken(P.coat, 0.85), SH, 0.9, 185); T.restore();
  let H = [S(ell(...SKULL, 187, 0.2)), S(ell(...SNOUT, 188, 0.1)), S(ell(...CREAM, 202, 0.12))];   // skull, snout, cream
  const union = () => { T.beginPath(); poly(T, H[0]); poly(T, H[1]); };                        // same winding: the union
  const Hc = [3.5 + rd * 1.1, 3.3 - 0.6 * Math.max(0, sm)];                                     // the mouth corner
  const UL = smoothPts(T, [[7.42, 2.9], [6.6, 3.28], [5.1, 3.45 - 0.25 * Math.max(0, sm)], Hc], { closed: false });   // upper lip, front to back
  let LL = null;
  if (op > 0.03) {
    const drop = op * HEAD_H * (0.19 + 0.05 * rd), d = x => drop * ease(clamp((x - Hc[0]) / (7.6 - Hc[0])));
    const W = q => [q[0] - 0.22 * d(q[0]), q[1] + d(q[0])];
    const ulY = x => { if (x >= UL[0][0]) return UL[0][1]; for (let i = 0; i < UL.length - 1; i++) if (x >= UL[i + 1][0]) return lerp(UL[i][1], UL[i + 1][1], (UL[i][0] - x) / ((UL[i][0] - UL[i + 1][0]) || 1)); return Infinity; };
    H = H.map(Q => dense(Q, 0.4).map(q => (q[1] > ulY(q[0]) ? W(q) : q)));                      // tear at the lip, drop the jaw
    LL = UL.map(W);
  }
  // ink both outlines (twice as wide: the fills cover the inner half), fill the union, shade it, then the cream
  line(T, [...H[0], H[0][0]], 2.2, { seed: 187, taper: false }); line(T, [...H[1], H[1][0]], 2.2, { seed: 188, taper: false });
  T.save(); union(); T.clip();
  T.fillStyle = P.coat; T.fillRect(-40, -40, 80, 80);
  const [dx, dy] = T.lightShift(SH), shade = a => {                                           // lit where either shape, shifted toward the light, covers it
    T.save(); T.globalCompositeOperation = 'multiply'; T.globalAlpha = a; T.fillStyle = SHADE;
    T.beginPath(); T.rect(-40, -40, 80, 80); poly(T, shift(H[0], dx, dy)); T.mask('evenodd');
    T.beginPath(); T.rect(-40, -40, 80, 80); poly(T, shift(H[1], dx, dy)); T.fill('evenodd'); T.restore();
  };
  shade(1);
  T.save(); T.beginPath(); poly(T, H[2]); T.clip(); T.fillStyle = P.cream; T.fillRect(-40, -40, 80, 80); shade(0.4); T.restore();   // the pale fur takes a lighter shadow
  if (LL) {                                                                                    // the open mouth, inside the head
    const M = [...UL, ...LL.slice().reverse()], j = (LL[0][1] - UL[0][1]) / HEAD_H;
    fillP(T, M, '#5e2026');
    T.save(); T.beginPath(); poly(T, M); T.clip();
    const tq = lerp(UL[1][1], LL[1][1], 0.75), tq2 = lerp(UL[2][1], LL[2][1], 0.8);
    fillP(T, S(ell(5.8, (tq + tq2) / 2 + 0.5, 2.3, 0.8 + j, 195, 0.05, Math.atan2(tq - tq2, 1.5))), '#c4626c');   // tongue
    const tl = 1.3 * clamp((op - 0.12) / 0.3), th = [[5.95, 3.36], [7.0, 3.0], [6.95, 3.0 + tl], [6.05, 3.36 + tl * 0.9]];
    if (tl > 0.05) fillP(T, th, '#fbf4e4'), line(T, [[6.5, 3.2], [6.5, 3.18 + tl * 0.95]], 0.35, { seed: 196, color: 'rgba(42,33,48,.45)' });   // the upper incisors
    T.restore();
  }
  T.restore();
  if (LL) { line(T, UL, 0.75, { seed: 197 }); line(T, LL, 0.6, { seed: 203 }); }
  else {
    line(T, [[NOSE[0] - 0.1, 1.9], [6.85, 2.95], [5.2, 3.4 + Math.max(0, -sm) * 0.3], [3.6, 3.15 - 0.9 * sm]], 0.6, { seed: 196 });
    if (F.round > 0.5) dot(T, 5.9, 3.7, 0.9, '#5e2026');
  }
  dot(T, ...NOSE, 1.05, P.nose); dot(T, NOSE[0] + 0.25, NOSE[1] - 0.4, 0.3, 'rgba(255,255,255,.35)');
  if (sm > 0.5) fillP(T, S(ell(1.5, 2.1, 2, 1.2, 197, 0.1)), rgba('#e88070', 0.35 * (sm - 0.4)));
  eye(T, 2.2, -1.6, 1.6, 2, F.eye, P.eye, gaze(F, 0.5, 2), F.lid, F.tilt, { w: 0.9, cheek: F.cheek });
  for (const [ty, sd] of [[0.6, 200], [2.2, 201]]) line(T, [[6.6, 1.6], [11, ty]], 0.35, { seed: sd, color: 'rgba(42,33,48,.5)' });
  T.save(); T.translate(-0.6, -4.8); T.rotate(ea);                                                // near ear with tuft
  cel(T, [[-2.2, 0], [0, -8.6], [2.8, 0]], P.coat, SH, 0.95, 186); fillP(T, [[-0.8, -0.6], [0.1, -6], [1.6, -0.6]], P.earIn);
  line(T, [[0, -8.2], [-0.6, -10.6]], 0.7, { seed: 199, color: darken(P.coat, 0.6) }); T.restore();
  brow(T, 2.7, -4.25, 3.4, F.browY * 0.75, F.browT * 0.75, darken(P.coat, 0.42), 1.05, 198);   // in front of the ear
  o.out.head = T.map(1, -0.5); o.out.mouth = T.map(6.2, 3.3 + op * 1.2);
  T.restore();
}
// The brush for params.tail = k: length and width grow with k (gently above 1, so a big brush stays a brush, not a
// paddle); above 1.1 fluff tufts ring it; below 0.7 (fully by 0.6) it is wet: thin, clumped to a point and limp. A wet
// tail never rests on the ground, so it reads the same on a shell or a branch as on the grass: upright it lifts off the
// rump in a tired arch and the tip hangs; asleep (a curled pose) it drops off the rump and tucks under the haunch
// instead of wrapping; in a hanging pose it falls. Dry, it rises in an S: the tip flicks back out (tf), a travelling
// wave (tws/twc) bends it a little more the further along it is, and in a hanging pose it settles onto the surface
// just behind the rump, then follows its curve down.
function tailOf(p, R, k, t) {
  const w = clamp((0.7 - k) / 0.1), big = k <= 1 ? k : 1 + (k - 1) * 0.55;
  const len = 44 * (0.6 + 0.4 * big) * (1 - 0.3 * w), wk = big * (1 - 0.12 * w) * (p.tw ?? 1);
  const cu = clamp((p.tc - 2.4) / 1.2), hg = clamp(p.hang);
  const wa = lerp(lerp(1.05, -0.5, cu), Math.min(p.ta, 0.4), hg), wc = lerp(lerp(-2.7, -2.1, cu), Math.min(p.tc, -0.7), hg);
  const ta = lerp(p.ta, wa, w), tc = lerp(p.tc, wc, w);
  const flick = (p.tf ?? 0.6) * (1 - w) * (1 - cu) * (1 - hg), ws = p.tws || 0, wcs = p.twc || 0, dry = 1 - w;   // tf < 0 curls the tip up
  const bend = u => tc * (hg * dry * Math.pow(clamp((u - 0.2) / 0.8), 1.6) + (1 - hg * dry) * u) + 0.36 * hg * dry * ease(clamp(u / 0.22))
    - 0.95 * flick * ease(clamp((u - 0.6) / 0.4)) + dry * (ws * Math.cos(2.4 * u) - wcs * Math.sin(2.4 * u)) * Math.pow(u, 1.1);
  const dryW = u => (2.1 + 5.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.07 + 0.83 * u)), 0.85)) * (u > 0.78 ? 1 - 0.62 * Math.pow((u - 0.78) / 0.22, 1.6) : 1);
  const wet = u => 0.35 + 3.3 * Math.pow(1 - u, 0.9) * Math.min(1, 0.55 + u * 3);
  return { w, ...spine(R.Tb, ta, bend, len, u => lerp(dryW(u), wet(u), w) * wk, { n: 18, wave: 0.12 * (1 - 0.7 * w), t, ground: !(p.hang > 0.5) }) };
}
// Soft contact shadows for a pose lying on something (hang): under the belly and along the tail's underside, painted
// on whatever is beneath (a rider casts no ground shadow, but it still presses on the shell). They only darken paint
// that is already there (source-atop): on an empty canvas they leave nothing, so they are never part of the
// squirrel's own silhouette (the rim light, which paints the actor alone onto a clear canvas, does not light them).
function contactShade(T, p, R, sp) {
  const by = R.B[1] + 7.6 * (1 - p.sq * 0.3) - 0.6;
  const g = T.createRadialGradient(R.B[0], by, 0, R.B[0], by, 13);
  g.addColorStop(0, 'rgba(26,18,30,.42)'); g.addColorStop(0.6, 'rgba(26,18,30,.22)'); g.addColorStop(1, 'rgba(26,18,30,0)');
  T.save(); T.globalCompositeOperation = 'source-atop';
  T.save(); T.translate(R.B[0], by); T.scale(1, 0.22); T.translate(-R.B[0], -by); fillP(T, ell(R.B[0], by, 13, 13, 0, 0), g); T.restore();
  T.globalAlpha = 0.22; fillP(T, sp.poly.map(([x, y]) => [x + 0.4, y + 1.3]), '#1a121e');
  T.restore();
}
// The brush's outline: the spine's two edges broken into fur tufts swept toward the tip (bigger on a big brush, a few
// clumped points on a wet one), and a tufted tip. The spine is followed as a smooth curve (Hermite through its points)
// and each tuft is sampled finer the bigger it is on screen (px = screen pixels per unit), so a close-up shows soft
// curves, not straight runs.
function fur(pts, ws, amp, seed, px = 1) {
  const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = S[S.length - 1] || 1, per = clamp(L / 7, 2.6, 7), n = pts.length - 1, step = per / (8 * Math.max(1, Math.ceil((per / 8) * px / 4)));
  const dirAt = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const at = s => { let i = 0; while (i < n - 1 && S[i + 1] < s) i++; const h = (S[i + 1] - S[i]) || 1, u = clamp((s - S[i]) / h), a = pts[i], b = pts[i + 1], ta = dirAt(i), tb = dirAt(i + 1);
    const u2 = u * u, u3 = u2 * u, c = [2 * u3 - 3 * u2 + 1, (u3 - 2 * u2 + u) * h, 3 * u2 - 2 * u3, (u3 - u2) * h], e = [6 * u2 - 6 * u, (3 * u2 - 4 * u + 1) * h, 6 * u - 6 * u2, (3 * u2 - 2 * u) * h];
    const q = [0, 1].map(k => c[0] * a[k] + c[1] * ta[k] + c[2] * b[k] + c[3] * tb[k]), g = [0, 1].map(k => e[0] * a[k] + e[1] * ta[k] + e[2] * b[k] + e[3] * tb[k]), gl = Math.hypot(...g) || 1;
    return { q, w: lerp(ws[i], ws[i + 1], u), t: [g[0] / gl, g[1] / gl] }; };
  const side = sd => { const P = [];
    for (let s = 0; s <= L * 0.985; s += step) {
      const { q, w, t } = at(s), v = s / per + (sd > 0 ? 0.5 : 0), j = Math.floor(v), f = v - j, h = hsh(j * 2 + (sd > 0 ? 1 : 0), seed);
      const b = Math.pow(Math.sin(Math.PI * Math.pow(f, 1.5)), 0.75) * amp * (0.45 + 0.8 * h) * clamp((s / L - 0.08) / 0.16) * Math.min(1, w / 2.5);   // soft clumps, notched between
      P.push([q[0] - t[1] * (w + b) * sd + t[0] * b * 0.9, q[1] + t[0] * (w + b) * sd + t[1] * b * 0.9]);   // a clump of fur, swept toward the tip
    }
    return P; };
  const e = pts[n], d = [e[0] - pts[n - 1][0], e[1] - pts[n - 1][1]], dl = Math.hypot(...d) || 1, tx = d[0] / dl, ty = d[1] / dl, we = Math.max(ws[n], 0.6);
  const tip = [-0.95, -0.7, -0.3, 0.1, 0.5, 0.85].map((k, i) => { const a = k * 1.45, r = we * (1 + 0.35 * amp * (i % 2 ? 0.4 : 1) + 0.25 * (i === 3)); return [e[0] + (tx * Math.cos(a) - ty * Math.sin(a)) * r, e[1] + (ty * Math.cos(a) + tx * Math.sin(a)) * r]; });   // a rounded, tufted brush end
  return [...side(1), ...tip.reverse(), ...side(-1).reverse()];
}
const hsh = (i, k) => { let h = Math.imul(i * 374761393 + k * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1103515245) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clipTo = (T, P) => { T.beginPath(); poly(T, P); T.clip(); };
// the cel shadow of P (lavender multiply where P's copy shifted toward the light doesn't cover), inside a clip
function shadeIn(T, P, sh) {
  const [dx, dy] = T.lightShift(sh);
  T.save(); T.globalCompositeOperation = 'multiply'; T.fillStyle = SHADE; T.beginPath(); T.rect(-120, -120, 240, 240); poly(T, shift(P, dx, dy)); T.fill('evenodd'); T.restore();
}
function paint(T, p0, F, o) {
  const { P, t } = o, k = clamp(P.tail ?? 1, 0.4, 1.8);
  const p = pitchPose(p0, F.pitch, { hr: -0.55, hy: -1.2, hx: -0.8 }, { hr: 0.45, hy: 1 }), R = roots(p);
  const sp = tailOf(p, R, k, t);
  const sleeping = p.tc > 3 && sp.w < 0.5;                        // a dry tail wraps round the sleeper; a wet one tucks behind
  const drawTail = () => {
    const dry = sp.w <= 0.05, col = darken(P.coat, 0.95 - 0.12 * sp.w), out = smoothPts(T, fur(sp.pts, sp.ws, (0.7 + 0.6 * clamp((k - 1) / 0.6)) * (1 - sp.w) + 0.25 * sp.w, 180, T.pxPerUnit()));
    T.save(); clipTo(T, out);
    fillP(T, out, dry ? lighten(col, 0.1) : col);
    if (dry) {                                                      // a lighter fringe round a deeper core, fur strands along it
      fillP(T, smoothPts(T, tube(sp.pts, sp.ws.map(w => w * 0.74), 182, 0.2)), col);
      fillP(T, smoothPts(T, tube(sp.pts.slice(0, 17), sp.ws.slice(0, 17).map(w => w * 0.4), 183, 0.2)), rgba(darken(P.coat, 0.8), 0.16));
      for (let i = 2; i < 17; i++) { const q = sp.pts[i], q1 = sp.pts[i + 1], dx = q1[0] - q[0], dy = q1[1] - q[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, w = sp.ws[i];
        for (const [o, c] of [[0.55, 'rgba(250,214,170,.5)'], [-0.35, rgba(darken(P.coat, 0.6), 0.35)]]) { const b = [q[0] + nx * w * o * (i % 2 ? 1 : -1), q[1] + ny * w * o * (i % 2 ? 1 : -1)]; line(T, [b, [b[0] + dx * 0.9, b[1] + dy * 0.9]], 0.5, { seed: 181 + i, color: c }); } }
    } else {                                                        // wet: dark clumped strands and one wet sheen
      for (let i = 0; i < 5; i++) line(T, smoothPts(T, sp.pts.slice(1 + i, 18 - i).map((q, j) => [q[0], q[1] + (i - 2) * sp.ws[j + 1 + i] * 0.32]), { closed: false }), 0.45, { seed: 181 + i, color: rgba(darken(P.coat, 0.55), 0.6 * sp.w) });
      line(T, smoothPts(T, sp.pts.slice(2, 12).map((q, j) => [q[0], q[1] - sp.ws[j + 2] * 0.45]), { closed: false }), 0.5, { seed: 187, color: rgba('#ffffff', 0.45 * sp.w) });
    }
    shadeIn(T, out, SH);
    T.restore();
    line(T, [...out, out[0]], 1.1, { seed: 180, taper: false });
  };
  const free = p.hang > 0.5;
  if (free) contactShade(T, p, R, sp);
  if (!sleeping) drawTail();
  leg(T, R.H2, [p.h2x, p.h2y], { free, l1: 6.5, l2: 6, meta: 7, ma: p.ha, bend: 1, w: [4.6, 2.3, 1.8, 1.5], col: darken(P.coat, 0.82), paw: [2.2, 1.3], sh: SH, seed: 210, curl: p.h2u, curlA: 0.8, ink: 0.85 });
  leg(T, R.S2, [p.f2x, p.f2y], { free, l1: 4.6, l2: 4.4, meta: 1.6, ma: p.fa, bend: -1, w: [2, 1.6, 1.3, 1.2], col: darken(P.coat, 0.82), paw: [1.5, 1.1], sh: SH, seed: 220, curl: p.f2u, curlA: -1.2, ink: 0.8 });
  const body = smoothPts(T, ell(R.B[0], R.B[1], 11 * (1 + F.breath * 0.02) * (1 + p.sq * 0.12), 7.6 * (1 - p.sq * 0.3), 184, 0.3, p.br));
  cel(T, body, P.coat, SH, 0, 184);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([1.5, 4.8 * (1 - p.sq * 0.3)], p.br)); fillP(T, smoothPts(T, ell(bp[0], bp[1], 9.5, 4.2, 185, 0.2, p.br)), P.cream); T.restore();
  line(T, [...body, body[0]], 1.1, { seed: 184, taper: false });
  // neck join
  cel(T, smoothPts(T, ell((R.S1[0] + p.hx) / 2 - 0.5, (R.S1[1] + p.hy) / 2 + 1, 4.6, 5.2, 189, 0.2, Math.atan2(p.hx - R.S1[0], R.S1[1] - p.hy))), P.coat, SH, 0, 189);
  // near hind with haunch
  const hl = leg(T, R.H1, [p.h1x, p.h1y], { free, l1: 6.5, l2: 6, meta: 7, ma: p.ha, bend: 1, w: [5, 2.6, 2, 1.7], col: P.coat, paw: [2.4, 1.4], sh: SH, seed: 230, curl: p.h1u, curlA: 0.8, ink: 0.9 });
  const ha = Math.atan2(hl.knee[1] - R.H1[1], hl.knee[0] - R.H1[0]), hy = free ? (R.H1[1] + hl.knee[1]) / 2 : Math.min((R.H1[1] + hl.knee[1]) / 2, -Math.hypot(5.6 * Math.sin(ha), 4.6 * Math.cos(ha)) - 0.9);
  cel(T, smoothPts(T, ell((R.H1[0] + hl.knee[0]) / 2, hy, 5.6, 4.6, 231, 0.2, ha)), P.coat, SH, 0.95, 231);
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
    jump: g(0.8, (u, b = base) => hopAt(u, b), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.4, (u, b = base) => { const e = env(u, 0.2, 0.2), R = roots(b); return mixPose(b, { ...b, f1x: R.S1[0] + 4 + 1.5 * Math.sin(u * Math.PI * 8), f1y: R.S1[1] - 7, fa: -2.4, sm: 0.6, acorn: 0 }, e); }, [0.25, 0.4, 0.55, 0.7]),
    // backseat driving: he sits up (rearing from all fours if need be), leans out from the hips and shoots the near
    // arm straight out ahead and down at where to step (the paw pointing along it), clear of the chin; the head goes
    // with the lean and looks along the arm; the hind feet stay put and the tail rises to balance
    point: g(1.3, (u, b = base) => {
      const e = env(u, 0.22, 0.2), up = POSES.sit, lean = 0.6, hip = roots(up).H1, piv = (q, k) => add(hip, rot([q[0] - hip[0], q[1] - hip[1]], lean * k));
      const B = piv([up.bx, up.by], 1), Hd = piv([up.hx, up.hy], 0.5), q = { ...b, bx: B[0], by: B[1], br: up.br + lean, hx: Hd[0], hy: Hd[1], hr: up.hr + 0.2, ta: b.ta + 0.2, acorn: 0 };
      const R = roots(q), a = 0.22;
      Object.assign(q, { f1x: R.S1[0] + 10.3 * Math.cos(a), f1y: R.S1[1] + 10.3 * Math.sin(a), fa: Math.PI / 2 - a, f2x: R.S2[0] + 3.6, f2y: R.S2[1] + 2.2 });
      return mixPose(b, q, e);
    }, [0.2, 0.4, 0.6, 0.8]),
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
