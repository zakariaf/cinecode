// The Fox. Legacy look (russet coat, cream bib, black socks, white-tipped brush) on an IK skeleton:
// walk, trot and gallop whose planted paws never slide, a hinged jaw for talking, brows and expressions.
// Round 2 (DESIGN §9.2): st.tilt pitches the head on the neck; the pupils follow (+1 up, -1 down).
import { clamp, lerp, ell, rpoly, limb, poly, shift } from '../core/lib.mjs';
import { cel, darken, line, fillP, dot, eye, brow, rgba, SHADE } from '../core/style.mjs';
import { makeRig, quadFeet, leg, mixPose, plus, jumpAt, ease, frac, pitchPose, gaze } from './rig.mjs';

const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const SH = 2.2;

// Pose: body centre (bx, by), pitch br, length bl; head position (hx, hy) and tilt hr; ears ea; tail angle ta,
// curl tc, wrap tw (0..1 curls it round the front, for sleeping); paw contacts f1/f2 (near/far fore) and h1/h2
// (near/far hind) in ground units, with paw angles fa/ha; fl/hl leg-length factors; face hints mo/sm/eh/lid.
const D = { bx: 0, by: -38, br: 0, bl: 1, hx: 40, hy: -56, hr: 0.05, ea: 0, ta: -0.05, tc: 0.4, tw: 0, fa: 0.08, ha: 0.3, fl: 1, hl: 1, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, f1u: 0, f2u: 0, h1u: 0, h2u: 0 };
const P0 = o => ({ ...D, ...o });
const roots = p => {
  const B = [p.bx, p.by];
  const S1 = add(B, rot([18 * p.bl, 4], p.br)), H1 = add(B, rot([-19 * p.bl, 3], p.br));
  return { B, S1, S2: add(S1, [3.5, -1]), H1, H2: add(H1, [4.5, -1]), N: add(B, rot([22 * p.bl, -5], p.br)), Tb: add(B, rot([-28 * p.bl, -4], p.br)) };
};
const FEET = (f1, f2, h1, h2) => ({ f1x: f1, f1y: 0, f2x: f2, f2y: 0, h1x: h1, h1y: 0, h2x: h2, h2y: 0 });
export const POSES = {
  stand: P0({ ...FEET(19, 23, -14, -9) }),
  alert: P0({ by: -40, br: -0.12, hx: 36, hy: -66, hr: -0.1, ea: -0.15, ta: 0.25, tc: 0.2, ...FEET(21, 25, -14, -9), lid: 0 }),
  sit: P0({ bx: -8, by: -27, br: -1.2, bl: 0.78, hx: 10, hy: -66, hr: -0.05, ta: -1.2, tc: -2.0, fl: 1.18, ha: 1.45, ...FEET(9, 13, 7, 11), fa: 0.05 }),
  lie: P0({ bx: -4, by: -15, br: 0.02, bl: 1, hx: 32, hy: -34, hr: 0.05, ta: -0.55, tc: 0.5, fa: 1.45, ha: 1.5, ...FEET(30, 34, 2, 6), fl: 1, hl: 1 }),
  sleep: P0({ bx: 0, by: -14.6, br: 0.05, bl: 0.92, hx: 30, hy: -14, hr: 0.36, ea: 0.5, ta: -1.45, tc: -0.6, tw: 1, fa: 1.5, ha: 1.5, ...FEET(14, 18, -2, 2), lid: 1 }),
  crouch: P0({ by: -27, br: 0.08, hx: 42, hy: -36, hr: 0.2, ea: 0.25, ta: -0.25, tc: 0.1, ...FEET(24, 28, -16, -11), fa: 0.3, ha: 0.55, lid: 0.25 }),
  leap: P0({ by: -44, br: -0.15, bl: 1.12, hx: 46, hy: -62, hr: -0.05, ea: 0.35, ta: 0.2, tc: 0.6, f1x: 44, f1y: -26, f2x: 46, f2y: -22, h1x: -42, h1y: -14, h2x: -38, h2y: -12, fa: 1.0, ha: 1.2, lift: 10 }),
};
POSES.rest = POSES.lie;
POSES.walk = POSES.stand;

// ── gaits ──
const G = { walk: { stride: 40, speed: 52 }, trot: { stride: 76, speed: 148 }, run: { stride: 180, speed: 500 } };
const rootsAt = body => ({ f1: ph => roots(body(ph)).S1, f2: ph => roots(body(ph)).S2, h1: ph => roots(body(ph)).H1, h2: ph => roots(body(ph)).H2 });
const finish = p => { p.fa = 0.08 - 0.3 * Math.max(p.f1u, 0) * 0; return p; };
function walkBody(ph) {
  const p = { ...POSES.stand }, c = Math.cos(Math.PI * 4 * ph);
  p.by = -38 + 0.7 * c; p.br = 0.02 * Math.sin(Math.PI * 2 * ph);
  p.hx = 40 + 0.8 * Math.sin(Math.PI * 2 * ph); p.hy = -55.5 + 0.9 * Math.cos(Math.PI * 4 * ph + 0.6); p.hr = 0.05 + 0.03 * Math.cos(Math.PI * 4 * ph + 0.6);
  p.ta = -0.02 + 0.08 * Math.sin(Math.PI * 2 * ph); return p;
}
function walk(ph) {
  const st = G.walk.stride, p = walkBody(ph);
  return quadFeet(p, ph, { h1: { off: 0, duty: 0.68, x0: -13, lift: 5 }, f1: { off: 0.25, duty: 0.68, x0: 20, lift: 6 }, h2: { off: 0.5, duty: 0.68, x0: -9, lift: 5 }, f2: { off: 0.75, duty: 0.68, x0: 24, lift: 6 } }, st, rootsAt(walkBody));
}
function trotBody(ph) {
  const p = { ...POSES.stand };
  p.by = -38.5 + 1.3 * Math.cos(Math.PI * 4 * (ph - 0.21)); p.br = -0.03; p.hx = 42; p.hy = -55 + 1.2 * Math.cos(Math.PI * 4 * (ph - 0.3)); p.hr = 0.12;
  p.ta = 0.05 + 0.1 * Math.sin(Math.PI * 4 * ph); p.tc = 0.5; p.ea = 0.1; return p;
}
function trot(ph) {
  const st = G.trot.stride, p = trotBody(ph);
  return quadFeet(p, ph, { f1: { off: 0, duty: 0.42, x0: 20, lift: 10 }, h2: { off: 0.0, duty: 0.42, x0: -9, lift: 9 }, f2: { off: 0.5, duty: 0.42, x0: 24, lift: 10 }, h1: { off: 0.5, duty: 0.42, x0: -13, lift: 9 } }, st, rootsAt(trotBody));
}
function runBody(ph) {
  const p = { ...POSES.stand }, u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (ph - 0.12));      // 0 gathered → 1 extended
  const air = Math.sin(Math.PI * clamp((ph - 0.68) / 0.32)), ext = Math.sin(Math.PI * clamp((ph - 0.22) / 0.22));
  p.bl = lerp(0.9, 1.1, u); p.br = lerp(0.06, -0.08, u); p.by = -39 - 7 * air - 4 * ext;
  p.hx = lerp(38, 48, u); p.hy = lerp(-50, -56, u) - 5 * air - 3 * ext; p.hr = lerp(0.25, 0.05, u);
  p.ea = 0.55; p.ta = lerp(0.15, -0.15, u); p.tc = 0.7; return p;
}
function run(ph) {
  const st = G.run.stride, p = runBody(ph);
  const HK = [[0.3, [-24, 26]], [0.6, [-4, 22]], [0.85, [14, 30]]], FK = [[0.25, [-14, 24]], [0.55, [-2, 18]], [0.85, [22, 28]]];
  quadFeet(p, ph, {
    h2: { off: 0.0, duty: 0.2, x0: -16, keys: HK }, h1: { off: 0.08, duty: 0.2, x0: -18, keys: HK },
    f2: { off: 0.4, duty: 0.19, x0: 28, keys: FK }, f1: { off: 0.48, duty: 0.19, x0: 26, keys: FK },
  }, st, rootsAt(runBody));
  return p;
}

// ── drawing ──
// The brush: a spine that leaves the rump at angle ta (0 = straight back, + up) and bends by tc along its length;
// tw wraps it round the front. Where the spine would go below the ground it lies along it.
function tail(T, p, P, t) {
  const R = roots(p), n = 18, L = 58 + 26 * p.tw, pts = [], ws = [];
  let x = R.Tb[0], y = R.Tb[1];
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = (4.6 + 6 * Math.sin(Math.PI * Math.min(1, u * 0.82 + 0.1))) * (u > 0.9 ? 1 - (u - 0.9) * 3 : 1);
    pts.push([x, Math.min(y, -w - 0.6)]); ws.push(w);
    const th = p.ta + 0.07 * Math.sin(t * 1.7) * (1 - p.tw) + (p.tc + p.tw * -1.6) * u + 0.05 * Math.sin(t * 2.3 + u * 3) * (1 - p.tw);
    x += -Math.cos(th) * (L / n); y += -Math.sin(th) * (L / n);
  }
  const Lf = [], Rt = [];
  for (let i = 0; i <= n; i++) {
    const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n, i + 1)], dx = q1[0] - q0[0], dy = q1[1] - q0[1], d = Math.hypot(dx, dy) || 1;
    Lf.push([pts[i][0] - (dy / d) * ws[i], pts[i][1] + (dx / d) * ws[i]]); Rt.push([pts[i][0] + (dy / d) * ws[i], pts[i][1] - (dx / d) * ws[i]]);
  }
  const e = pts[n], d = [pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]], dl = Math.hypot(...d) || 1;
  const Tl = rpoly([...Lf, [e[0] + (d[0] / dl) * 5, Math.min(e[1] + (d[1] / dl) * 5, -1.2)], ...Rt.reverse()], 3, { seed: 130, jit: 0.5 });
  cel(T, Tl, P.coat, SH, 0, 130);
  T.save(); T.beginPath(); Tl.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell(e[0] + (d[0] / dl) * 3, e[1] + (d[1] / dl) * 3, 13, 13, 131, 0.6), P.cream);
  for (let i = 3; i < 12; i += 2) { const q = pts[i]; line(T, [[q[0] - 2, q[1] - 2], [q[0] + 1, q[1] + 2]], 0.6, { seed: 132 + i, color: 'rgba(90,40,20,.4)' }); }
  T.restore(); line(T, [...Tl, Tl[0]], 1.2, { seed: 130, taper: false });
}
const clipTo = (T, P) => { T.beginPath(); poly(T, P); T.clip(); };
// clip away a disc (no ink there: where one part of the body flows into another)
function hideNear(T, [x, y], r) { T.beginPath(); T.rect(x - 200, y - 200, 400, 400); T.moveTo(x + r, y); T.arc(x, y, r, 0, Math.PI * 2, true); T.mask('evenodd'); }
// fill a shape, paint `inner` inside it, then its cel shadow (no ink)
function form(T, P, col, sh, inner) {
  T.save(); clipTo(T, P); fillP(T, P, col); if (inner) inner();
  const [dx, dy] = T.lightShift(sh); T.globalCompositeOperation = 'multiply'; T.fillStyle = SHADE; T.beginPath(); T.rect(-120, -120, 240, 240); poly(T, shift(P, dx, dy)); T.fill('evenodd');
  T.restore();
}
function head(T, p, F, P, o) {
  T.save(); T.translate(p.hx, p.hy - F.breath * 0.6); T.rotate(p.hr - F.look * 0.08);
  const op = clamp(F.open), sm = F.smile, ea = p.ea + 0.04 * Math.sin(o.t * 2.1);
  const earAt = (Bx, By, A) => { T.save(); T.translate(Bx, By); T.rotate(A); };
  earAt(-5, -7, -0.12 + ea * 0.8); cel(T, [[-4, 0], [-3, -19], [4, -1]], darken(P.coat, 0.75), SH, 1, 121); T.restore();
  // The head is one form: skull and snout share a single ink silhouette (none where the neck joins), and one cream
  // area runs from the chin along the lower cheek to the jaw's angle, where it meets the throat. The lower jaw hinges
  // open beneath it, its back tucked under the cheek.
  const hinge = [3.5, 4.2], ja = op * 0.5 + F.round * op * 0.1, jr = q => { const d = rot([q[0] - hinge[0], q[1] - hinge[1]], ja); return [hinge[0] + d[0], hinge[1] + d[1]]; };
  const open = op > 0.03, skull = ell(0, 0, 12, 10, 122, 0.3);
  const sn = open ? rpoly([[4.5, -4.5], [23, -0.4], [22.6, 4.0], [4, 4.6]], [3, 2.6, 2, 3], { seed: 123, jit: 0.25 })
    : rpoly([[4.5, -4.5], [23, -0.4], [22.2, 4.4], [13, 6.1], [4, 6.9]], [3, 2.6, 2.2, 3, 3], { seed: 123, jit: 0.25 });
  if (open) {                                         // open: interior, then the cream lower jaw (its back under the cheek)
    const M = [hinge, [12, 4.4], [21, 3.8], jr([20.5, 4.6]), jr([10, 6.2])];
    fillP(T, M, '#5a1c24');
    T.save(); clipTo(T, M); fillP(T, ell(...jr([11, 6.4]), 6.5, 2, 127, 0.1), '#c96a72'); T.restore();
    const Jw = rpoly([[-1, 3.6], [20.6, 4.1], [19.4, 6.4], [9, 8], [-1, 8.6]], [2, 1.5, 2, 3, 2], { seed: 124, jit: 0.2 }).map(jr);
    T.save(); hideNear(T, jr([-1, 6]), 4.5); line(T, [...Jw, Jw[0]], 1.9, { seed: 124, taper: false }); T.restore();
    form(T, Jw, P.cream, SH * 0.4, null);
  }
  T.save(); hideNear(T, [-5.5, 8.5], 6.5); line(T, [...skull, skull[0]], 2.3, { seed: 122, taper: false }); line(T, [...sn, sn[0]], 2.2, { seed: 123, taper: false }); T.restore();
  // the cheek's edge: russet tufts swept back and down into the cream (fur flows toward the neck)
  const tufts = [[3.6, 4.6], [0.2, 6.7], [-0.9, 4.3], [-4.1, 6.4], [-5.0, 3.8], [-8.3, 5.7], [-9.3, 2.8], [-12.4, 4.6], [-13.4, 1.6]];
  const cheek = rpoly([...(open ? [[4.8, 4.4]] : [[24, 3.0], [12, 3.75], [6.4, 4.15]]), ...tufts, [-14, 14], [open ? 1.5 : 24, 14]], 0.7, { seed: 125, jit: 0.12, step: 0.6 });
  const cream = () => { fillP(T, cheek, P.cream); for (let i = 1; i < 8; i += 2) { const q = tufts[i]; line(T, [[q[0] + 1.6, q[1] - 2], [q[0] + 0.5, q[1] - 0.6]], 0.4, { seed: 125 + i, color: rgba(darken(P.coat, 0.7), 0.45) }); } };
  form(T, skull, P.coat, SH, cream);
  form(T, sn, P.coat, SH, cream);
  if (open) { if (op > 0.35) for (const tx of [14, 18]) fillP(T, [[tx, 4.3], [tx + 1.5, 4.2], [tx + 0.8, 5.9]], '#fbf6ec'); }
  else {
    line(T, [[20.5, 3.0], [12, 3.7 + Math.max(0, -sm) * 0.5], [6.4, 4.1 - 0.3 * sm], [4.4, 4.2 - 1.8 * sm]], 0.8, { seed: 126 });
    if (F.round > 0.5) dot(T, 17, 5.6, 1.3, '#5a1c24');
  }
  dot(T, 22.4, 1.2, 2.2, '#1d1515'); dot(T, 22.9, 0.5, 0.6, 'rgba(255,255,255,.5)');
  if (sm > 0.5) fillP(T, ell(-1, 3.2, 3.2, 2, 128, 0.1), rgba('#e2735a', 0.3 * (sm - 0.4)));
  eye(T, 2.8, -4.2, 2, 2.4, F.eye, P.eye, gaze(F, 0.7, 2.4), F.lid, F.tilt, { pupilCol: '#1a1010', cheek: F.cheek });
  brow(T, 2.6, -8.4, 6.2, F.browY * 0.8, F.browT * 0.75, darken(P.coat, 0.5), 1.25, 129);
  earAt(1, -8, ea); cel(T, [[-2, 0], [1, -19], [8, 1]], darken(P.coat, 0.88), SH, 1, 120); fillP(T, [[0, -2], [1.6, -14], [5.4, -1]], '#3a2a26'); T.restore();
  o.out.head = T.map(4, -1); o.out.mouth = T.map(14, 5 + op * 2.5);
  T.restore();
}
const legOpt = (P, near, fore, p, k) => fore
  ? { l1: 14 * p.fl, l2: 13 * p.fl, meta: 5, ma: p.fa, bend: -1, w: [5.2, 3.2, 2.4, 2.2], col: near ? P.coat : darken(P.coat, 0.8), low: near ? P.sock : darken(P.sock, 0.85), lowFrom: 0.62, paw: [3.4, 2.1], sh: SH, seed: near ? 140 : 150, curl: p[k + 'u'], curlA: -1.3 }
  : { l1: 15 * p.hl, l2: 14 * p.hl, meta: 9, ma: p.ha, bend: 1, w: [8.5, 4, 2.5, 2.2], col: near ? P.coat : darken(P.coat, 0.8), low: near ? P.sock : darken(P.sock, 0.85), lowFrom: 0.85, paw: [3.4, 2.1], sh: SH, seed: near ? 160 : 170, curl: p[k + 'u'], curlA: 0.9 };
function paint(T, p0, F, o) {
  const p = pitchPose(p0, F.pitch, { hr: -0.5, hy: -6, hx: -2 }, { hr: 0.42, hy: 4, hx: 1 });   // st.tilt: the neck lifts or lowers the head
  const { P, t } = o, R = roots(p);
  const sleeping = p.tw > 0.5;
  if (!sleeping) tail(T, p, P, t);
  leg(T, R.H2, [p.h2x, p.h2y], legOpt(P, false, false, p, 'h2'));
  leg(T, R.S2, [p.f2x, p.f2y], legOpt(P, false, true, p, 'f2'));
  // neck: from the withers/chest to the back of the head; only its top and bottom edges are inked
  const hr = p.hr, hb = add([p.hx, p.hy], rot([-7, -5], hr)), hf = add([p.hx, p.hy], rot([2, 9], hr));
  const nt = add(R.B, rot([12 * p.bl, -12], p.br)), nf = add(R.B, rot([27 * p.bl, 4], p.br));
  const top = [nt, [(nt[0] + hb[0]) / 2 + 1, (nt[1] + hb[1]) / 2 - 1.5], hb], bot = [hf, [(hf[0] + nf[0]) / 2 + 2.5, (hf[1] + nf[1]) / 2 + 1], nf];
  const Nk = [...top, ...bot];
  cel(T, Nk, P.coat, SH, 0, 135);
  T.save(); T.beginPath(); Nk.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell((hf[0] + nf[0]) / 2 + 1, (hf[1] + nf[1]) / 2 - 1, 7.5, 11, 136, 0.4, Math.atan2(hf[0] - nf[0], nf[1] - hf[1])), P.cream);
  T.restore();
  line(T, top, 1.15, { seed: 137 }); line(T, bot, 1.1, { seed: 138 });
  const body = ell(R.B[0], R.B[1] - F.breath * 0.4, 30 * p.bl, 13.5 * (1 + F.breath * 0.03), 144, 0.4, p.br);
  cel(T, body, P.coat, SH, 0, 144);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const bp = add(R.B, rot([14 * p.bl, 9], p.br)); fillP(T, ell(bp[0], bp[1], 19 * p.bl, 7, 145, 0.3, p.br), P.cream);
  for (let i = 0; i < 5; i++) { const q = add(R.B, rot([-18 + i * 7, -8], p.br)); line(T, [q, add(q, rot([2.5, 3.5], p.br))], 0.6, { seed: 400 + i, color: 'rgba(90,40,20,.4)' }); }
  T.restore(); line(T, [...body, body[0]], 1.2, { seed: 144, taper: false });
  leg(T, R.H1, [p.h1x, p.h1y], legOpt(P, true, false, p, 'h1'));
  leg(T, R.S1, [p.f1x, p.f1y], legOpt(P, true, true, p, 'f1'));
  if (sleeping) tail(T, p, P, t);
  head(T, p, F, P, o);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
const raisePaw = (b, x, y) => { const R = roots(b); return { f1x: R.S1[0] + x, f1y: Math.min(-2, R.S1[1] + y) }; };
export default makeRig({
  kind: 'fox', label: 'Fox',
  height: 83, headHeight: 34, width: 92, shadowW: 40,
  params: { coat: '#c8642e', cream: '#f4ede0', sock: '#2b2222', eye: '#a8721c' },
  speeds: { walk: G.walk.speed, trot: G.trot.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, trot: G.trot.stride, run: G.run.stride },
  steps: { walk: [0, 0.25, 0.5, 0.75], trot: [0, 0.5], run: [0, 0.08, 0.4, 0.48] },
  poses: POSES,
  gaits: { walk, trot, run },
  gestures: {
    nod: g(0.8, (u, b = base) => plus(b, { hr: 0.25 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.15 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), hy: 2.5 * Math.sin(Math.PI * clamp(u / 0.9)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.4, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 7)) * e; return plus(b, { hr: -0.3 * e + 0.08 * k, hy: -3 * e - 2 * k, mo: 0.8 * e, eh: e, sm: e, ea: 0.3 * e, ta: 0.3 * e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 34, crouch: { by: 8, hy: 10, ea: 0.3, ta: -0.2 }, air: { br: -0.1, hr: -0.1, ta: 0.3, f1y: -14, f2y: -12, f1x: 8, f2x: 8, h1y: -6, h2y: -6, h1x: -8, h2x: -8, fa: 1.0, ha: 1.4 } }), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.6, (u, b = base) => { const e = env(u, 0.2, 0.2); const r = raisePaw(b, 10 + 3 * Math.sin(u * Math.PI * 8), -26 + 5 * Math.sin(u * Math.PI * 8 + 1)); return mixPose(b, { ...b, ...r, fa: -0.5, hr: b.hr - 0.1, sm: 0.6, by: b.by - 1 }, e); }, [0.25, 0.4, 0.55, 0.7]),
    point: g(1.4, (u, b = base) => { const e = env(u, 0.25, 0.2); const r = raisePaw(b, 26, -14); return mixPose(b, { ...b, ...r, fa: -1.2, hr: b.hr - 0.15, ea: -0.1 }, e); }, [0.2, 0.4, 0.6, 0.8]),
    sniff: g(1.4, (u, b = base) => { const e = env(u, 0.3, 0.3); return plus(b, { hy: 14 * e, hx: 6 * e, hr: 0.5 * e + 0.05 * Math.sin(u * 40) * e, ea: -0.1 * e }); }, [0.3, 0.45, 0.6, 0.75]),
    bow: g(1.6, (u, b = base) => { const e = env(u, 0.25, 0.25); return mixPose(b, { ...b, br: 0.3, by: b.by + 4, hx: b.hx + 4, hy: b.hy + 14, f1x: b.f1x + 10, f2x: b.f2x + 10, fa: 1.2, ta: 0.6, tc: 0.8, sm: 0.6 }, e); }, [0.25, 0.5, 0.75]),
  },
  feet: p => [[p.f1x, p.f1y + 0, p.cf1 ?? +(Math.abs(p.f1y) < 0.05)], [p.f2x, p.f2y, p.cf2 ?? +(Math.abs(p.f2y) < 0.05)], [p.h1x, p.h1y, p.ch1 ?? +(Math.abs(p.h1y) < 0.05)], [p.h2x, p.h2y, p.ch2 ?? +(Math.abs(p.h2y) < 0.05)]].map(([x, y, c]) => [x, y - (p.lift || 0), c]),
  paint,
});
