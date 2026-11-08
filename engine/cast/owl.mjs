// The Owl. Front-facing, as in the legacy hollow: tufted head, pale facial disc, big amber eyes with feathered
// lids and V-brows, a hooked beak that opens to talk and hoot, wings that fold at the sides or spread to fly,
// feathered legs with talons gripping the perch (the contact point).
import { clamp, lerp, ell, rpoly, arcPts } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, mixPose, plus, jumpAt, ease, frac, footAt, tube } from './rig.mjs';

const SH = 2.2;
// Pose: by body drop, bt body tilt (+ leans forward/right), sq puff 0..1, ht head tilt, hx head turn -1..1 (face
// features slide), hy head drop, tu tufts (+ raised), ws wing spread 0..1, wa flap angle (-1 down .. 1 up),
// lg leg extension (0 tucked .. 1), f1/f2 foot x and y (ground units), face hints.
const D = { by: 0, bt: 0, sq: 0, ht: 0, hx: 0, hy: 0, tu: 0, ws: 0, wa: 0, lg: 1, f1x: -5, f1y: 0, f2x: 5, f2y: 0, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, round: 0 };
const P0 = o => ({ ...D, ...o });
export const POSES = {
  stand: P0({}),
  alert: P0({ by: -2, sq: -0.4, tu: 0.6, ht: 0, lid: 0 }),
  sit: P0({ by: 3, sq: 0.7, tu: -0.2, lid: 0.25 }),
  sleep: P0({ by: 4, sq: 1, ht: 0.12, hy: 3, tu: -0.5, lid: 1 }),
  spread: P0({ by: -1, ws: 1, wa: 0.35, tu: 0.4 }),
  hoot: P0({ sq: 0.8, hy: -1, round: 1, mo: 0.6 }),
};
POSES.rest = POSES.sit;

// wing outline (right wing; shoulder at origin, +x outward), folded vs spread, same point count
const W_SPREAD = [[0, -4], [10, -9], [22, -11], [34, -10], [44, -6], [39, -2], [42, 2], [34, 3], [35, 7], [27, 6], [26, 10], [16, 8], [5, 6]];
const W_FOLD = [[0, -4], [3, -1], [5, 4], [6, 10], [5.5, 17], [4.5, 20], [3, 22], [1.5, 21], [0, 19], [-1, 16], [-2, 11], [-2.5, 6], [-2, 1]];
function wing(T, p, side, P, near) {
  const s = clamp(p.ws), pts = W_FOLD.map((q, i) => [lerp(q[0], W_SPREAD[i][0], s), lerp(q[1], W_SPREAD[i][1], s)]);
  const a = -p.wa * 0.75 * s;
  T.save(); T.translate(side * 12.5, -30 + p.by + p.sq * 1.5); T.scale(side, 1); T.rotate(a);
  const Wg = rpoly(pts, 3, { seed: side > 0 ? 160 : 161, jit: 0.4 });
  cel(T, Wg, near ? P.wing : darken(P.wing, 0.88), SH, 1.15, side > 0 ? 160 : 161);
  T.save(); T.beginPath(); Wg.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  for (let i = 0; i < 4; i++) { const u = 0.35 + i * 0.16; line(T, [[lerp(1, 30, u * s) + (1 - s) * 0.5, lerp(4 + i * 3.5, 0, s)], [lerp(2, 40, u * s) + (1 - s) * 1.5, lerp(9 + i * 3.5, 4, s)]], 0.6, { seed: 162 + i, color: 'rgba(60,40,25,.55)' }); }
  for (let i = 0; i < 3; i++) dot(T, lerp(1.5, 12 + i * 8, s), lerp(2 + i * 4, -3, s), 1.1, 'rgba(240,225,190,.5)');
  T.restore();
  T.restore();
}
function talons(T, x, y, lg, P, seed) {
  const top = [x * 0.8, -6 - (1 - lg) * 0], ft = [x, y];
  if (lg > 0.15) { const L = tube([[top[0], top[1] - 3], [lerp(top[0], ft[0], 0.5), lerp(top[1], ft[1] - 2, 0.5)], [ft[0], ft[1] - 2.2]], [3.6, 3.2, 2.6], seed, 0.2); cel(T, L, P.leg, SH * 0.6, 0.9, seed); }
  for (const [dx, k] of [[-3, 0], [0.2, 1], [3.2, 2]]) {
    const b = [ft[0] + dx * 0.5, ft[1] - 2.2], e = [ft[0] + dx, ft[1] - 1];
    line(T, [b, e], 1.7, { seed: seed + k, color: P.toe, taper: false });
    line(T, [e, [e[0] + dx * 0.15, e[1] + 0.75]], 1.0, { seed: seed + 5 + k, color: '#2a2018', taper: true });
  }
}
function head(T, p, F, P, o) {
  const hy = -44 + p.by + p.hy - F.breath * 0.5 - p.sq * 0.5;
  T.save(); T.translate(0, hy); T.rotate(p.ht);
  const tx = clamp(p.hx + F.look * 0.6, -1, 1) * 3.6, tu = p.tu;
  // tufts
  cel(T, [[-15, -6], [-12 - tx * 0.3, -18 - tu * 4], [-6, -9]], darken(P.body, 0.88), SH, 1, 160);
  cel(T, [[15, -6], [12 - tx * 0.3, -18 - tu * 4], [6, -9]], darken(P.body, 0.88), SH, 1, 161);
  const Hd = ell(0, 0, 17, 13.5, 162, 0.3);
  cel(T, Hd, P.body, SH, 1.2, 162);
  T.save(); T.beginPath(); Hd.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  // facial disc: two pale rounds meeting at the beak, with a darker rim
  for (const sx of [-1, 1]) { const D2 = ell(tx + sx * 6.8, 0.6, 8.6, 8.4, 163 + sx, 0.25); fillP(T, D2, P.disc); line(T, arcPts(tx + sx * 6.8, 0.6, 8.6, 8.4, sx < 0 ? Math.PI * 0.55 : -Math.PI * 0.45, sx < 0 ? Math.PI * 1.45 : Math.PI * 0.45, 2), 0.7, { seed: 165 + sx, color: rgba(darken(P.body, 0.6), 0.6) }); }
  for (let i = 0; i < 6; i++) line(T, [[tx + (i < 3 ? -1 : 1) * (10 + (i % 3) * 2), 6 + (i % 3)], [tx + (i < 3 ? -1 : 1) * (12 + (i % 3) * 2), 8 + (i % 3)]], 0.5, { seed: 170 + i, color: 'rgba(120,95,70,.5)' });
  T.restore();
  const op = clamp(F.open), r = Math.max(F.round, p.round || 0);
  for (const sx of [-1, 1]) {
    const ex = tx + sx * 6.6;
    eye(T, ex, 0, 3.6, 3.6, F.eye === 'happy' ? 'happy' : F.eye, '#1a1410', F.look * 0.8 + p.hx * 0.6, Math.max(F.lid, 0.04), F.tilt * -sx, { sclera: P.eye, pupil: F.eye === 'wide' ? 0.42 : 0.55 * (F.pupil || 1), w: 0.9 });
    T.save(); T.translate(ex, -6.6); if (sx > 0) T.scale(-1, 1);
    brow(T, 0, 0, 10, F.browY * 0.7, F.browT * 0.9, darken(P.body, 0.55), 1.6, 175 + sx);
    T.restore();
  }
  // beak: upper hook over a lower mandible that drops
  const bx = tx, lo = op * 3.4 + r * op;
  if (op > 0.03) { fillP(T, ell(bx, 6 + lo * 0.5, 2.4 + r * 0.6, 1.2 + lo * 0.55, 177, 0.1), '#5a2a20'); }
  const lower = [[bx - 2.1, 5.6 + lo * 0.3], [bx + 2.1, 5.6 + lo * 0.3], [bx, 8.6 + lo]];
  cel(T, lower, darken(P.beak, 0.85), SH * 0.4, 0.75, 178);
  const upper = [[bx - 2.6, 1.6], [bx + 2.6, 1.6], [bx + 1.2, 6.6], [bx, 8.2 - lo * 0.15], [bx - 1.2, 6.6]];
  cel(T, upper, P.beak, SH * 0.4, 0.8, 179);
  o.out.head = T.map(tx * 0.4, 0); o.out.mouth = T.map(bx, 6.5 + lo * 0.5);
  T.restore();
}
function paint(T, p, F, o) {
  const { P } = o;
  const puff = 1 + p.sq * 0.08;
  T.save(); T.rotate(p.bt);
  const by = p.by;
  // tail fan behind the feet
  cel(T, [[-5.5, -10 + by], [5.5, -10 + by], [7.5, -1], [-7.5, -1]], darken(P.body, 0.8), SH, 1, 155);
  const bry = (18 + p.sq * 0.8) * (1 + F.breath * 0.02), body = ell(0, Math.min(-21 + by, -bry - 1.1) - F.breath * 0.4, 16.5 * puff, bry, 150, 0.4);
  cel(T, body, P.body, SH, 0, 150);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell(0, -14 + by, 10.5 * puff, 14, 151, 0.3), P.belly);
  for (let i = 0; i < 12; i++) { const cx = -6 + (i % 4) * 4 - (Math.floor(i / 4) % 2) * 2, cy = -22 + by + Math.floor(i / 4) * 5.5; line(T, [[cx - 1.4, cy], [cx, cy + 1.2], [cx + 1.4, cy]], 0.7, { seed: 152 + i, color: rgba(darken(P.body, 0.75), 0.75) }); }
  T.restore(); line(T, [...body, body[0]], 1.2, { seed: 150, taper: false });
  // feet are ground points: undo the body tilt so they land where the gait put them
  const cb = Math.cos(p.bt), sb = Math.sin(p.bt), ib = (x, y) => [x * cb + y * sb, -x * sb + y * cb];
  talons(T, ...ib(p.f1x, p.f1y), p.lg, P, 180); talons(T, ...ib(p.f2x, p.f2y), p.lg, P, 190);
  wing(T, p, -1, P, false);
  wing(T, p, 1, P, true);
  head(T, p, F, P, o);
  T.restore();
}

// ── gaits ──
const G = { walk: { stride: 16, speed: 22 }, run: { stride: 34, speed: 70 }, fly: { stride: 90, speed: 220 }, glide: { stride: 120, speed: 200 } };
function walk(ph) {
  const p = { ...POSES.stand }, a = footAt(ph, 0, 0.62, G.walk.stride, -4, 5), b = footAt(ph, 0.5, 0.62, G.walk.stride, 4, 5);
  p.f1x = a.x; p.f1y = a.y; p.f2x = b.x; p.f2y = b.y; p.cf1 = +a.down; p.cf2 = +b.down;
  p.bt = 0.08 * Math.sin(Math.PI * 2 * ph); p.by = -0.8 * Math.abs(Math.sin(Math.PI * 2 * ph)); p.ht = -0.06 * Math.sin(Math.PI * 2 * ph); p.ws = 0.08;
  return p;
}
function run(ph) {                                      // both feet together: little hops, wings half open
  const p = { ...POSES.stand }, a = footAt(ph, 0, 0.42, G.run.stride, -3, 0), b = footAt(ph, 0, 0.42, G.run.stride, 5, 0);
  const air = a.down ? 0 : Math.sin(Math.PI * a.u);
  p.f1x = a.x; p.f1y = a.y; p.f2x = b.x; p.f2y = b.y; p.cf1 = +a.down; p.cf2 = +b.down;
  p.lift = 9 * air; p.f1y = 0; p.f2y = 0; p.cf1 = +a.down; p.cf2 = +b.down;
  p.ws = 0.35 + 0.2 * air; p.wa = 0.6 * air - 0.2; p.bt = 0.12; p.by = a.down ? 2 * Math.sin(Math.PI * a.u) : 0;
  return p;
}
function fly(ph) {
  const p = { ...POSES.spread }, c = Math.cos(Math.PI * 2 * ph);
  p.ws = 1; p.wa = c; p.lg = 0.2; p.bt = 0.22; p.f1x = -3; p.f2x = 3; p.f1y = -3; p.f2y = -3; p.tu = -0.2;
  p.lift = 8 - 2 * Math.cos(Math.PI * 2 * (ph - 0.08)); p.by = 0; return p;   // the downstroke lifts the body
}
function glide(ph) { const p = fly(0.25); p.wa = 0.1 + 0.05 * Math.sin(Math.PI * 2 * ph); p.lift = 6 + Math.sin(Math.PI * 2 * ph); return p; }

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'owl', label: 'Owl',
  height: 62, headHeight: 34, width: 36, shadowW: 18,
  perch: true, flies: true, breathPeriod: 3.6,
  params: { body: '#8a6a4a', belly: '#d9c4a0', disc: '#ecdcbc', wing: '#7a5a3e', beak: '#e0a840', eye: '#f2c94c', leg: '#cdb48c', toe: '#b8955a' },
  speeds: { walk: G.walk.speed, run: G.run.speed, fly: G.fly.speed, glide: G.glide.speed },
  stride: { walk: G.walk.stride, run: G.run.stride, fly: G.fly.stride, glide: G.glide.stride },
  steps: { walk: [0, 0.5], run: [0] },
  poses: POSES,
  gaits: { walk, run, fly, glide },
  gestures: {
    nod: g(0.8, (u, b = base) => plus(b, { hy: 3 * Math.sin(Math.PI * clamp(u / 0.45)) + 2 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)), ht: 0 }), [0.22, 0.5, 0.7]),
    laugh: g(1.4, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 7)) * e; return plus(b, { by: -1.5 * k, sq: 0.4 * e, ht: 0.12 * Math.sin(u * Math.PI * 7) * e, mo: 0.6 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.9, (u, b = base) => jumpAt(u, b, { h: 22, crouch: { by: 4, sq: 0.4 }, air: { ws: 0.8, wa: 0.6, lg: 0.6, sq: -0.3 } }), [0.2, 0.4, 0.55, 0.85]),
    hoot: g(1.2, (u, b = base) => { const e = Math.sin(Math.PI * clamp(u / 0.8)); return plus(b, { sq: 0.9 * e, hy: -1.5 * e, ht: -0.08 * e, round: e, mo: 0.55 * e, lid: 0.3 * e }); }, [0.2, 0.4, 0.6]),
    flap: g(1.2, (u, b = base) => { const e = env(u, 0.15, 0.2); return plus(b, { ws: e, wa: e * Math.cos(u * Math.PI * 6), tu: 0.4 * e }); }, [0.2, 0.35, 0.5, 0.7]),
    turn: g(1.8, (u, b = base) => plus(b, { hx: Math.sin(u * Math.PI * 2) * env(u, 0.1, 0.1), ht: 0.1 * Math.sin(u * Math.PI * 2) }), [0.25, 0.5, 0.75]),
    wave: g(1.4, (u, b = base) => { const e = env(u, 0.2, 0.2); return { ...b, ws: e * 0.85, wa: e * (0.6 + 0.4 * Math.sin(u * Math.PI * 8)), sm: 0.5 * e }; }, [0.25, 0.4, 0.55, 0.7]),
  },
  feet: p => [[p.f1x, p.f1y - (p.lift || 0), p.cf1 ?? +(Math.abs(p.f1y) < 0.05)], [p.f2x, p.f2y - (p.lift || 0), p.cf2 ?? +(Math.abs(p.f2y) < 0.05)]],
  paint,
});
