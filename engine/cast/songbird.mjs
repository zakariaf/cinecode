// The Songbird. The legacy perched bird as a full rig: hops on the ground, perches (feet gripping the contact
// point), flies with a finch-like bounding flight (a flap, then a folded-wing glide), sings with an open beak.
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, mixPose, plus, jumpAt, ease, frac, footAt } from './rig.mjs';

const SH = 1.1;
// Pose: by body drop, br pitch (+ nose down), hx/hy head offset, hr head tilt (- = beak up), tf tail flick (+ up),
// fl fluff 0..1, ws wing spread 0..1, wa flap (-1 down .. 1 up), lg legs (1 standing .. 0 tucked), f1x/f2x feet x,
// fy feet lift, face hints.
const D = { by: 0, br: 0, hx: 0, hy: 0, hr: 0, tf: 0, fl: 0, ws: 0, wa: 0, lg: 1, f1x: -1, f2x: 1.5, fy: 0, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0 };
const P0 = o => ({ ...D, ...o });
export const POSES = {
  stand: P0({}),
  alert: P0({ by: -1.2, br: -0.15, hy: -1.5, hr: -0.1, tf: -0.2, lid: 0 }),
  sit: P0({ by: 2.2, fl: 0.7, lg: 0.3, hy: 1, lid: 0.2 }),
  sleep: P0({ by: 2.6, fl: 1, lg: 0.25, hx: -2.5, hy: 3.6, hr: 0.3, tf: 0.1, lid: 1 }),
  sing: P0({ br: -0.2, hr: -0.5, hy: -1, mo: 0.7, tf: 0.15 }),
  spread: P0({ ws: 1, wa: 0.6, tf: 0.2 }),
};
POSES.rest = POSES.sit; POSES.perch = POSES.stand;

// wing outlines (near wing, shoulder at origin, facing +x), 7 points each
const WF = { fold: [[3, -1], [-2, -3.2], [-10, -3.4], [-17, -0.5], [-12, 2], [-4, 3], [2, 2]],
  up: [[3, -1], [1, -10], [-3, -20], [-8, -27], [-10, -20], [-7, -8], [-2, 1]],
  mid: [[3, -1], [-3, -6], [-12, -10], [-24, -11], [-18, -5], [-8, -1], [-1, 2]],
  down: [[3, -1], [0, 4], [-3, 12], [-7, 20], [-9, 12], [-7, 4], [-2, 2]] };
const mixP = (A, B, u) => A.map((q, i) => [lerp(q[0], B[i][0], u), lerp(q[1], B[i][1], u)]);
function wingPts(p) {
  const fl = p.wa >= 0 ? mixP(WF.mid, WF.up, clamp(p.wa)) : mixP(WF.mid, WF.down, clamp(-p.wa));
  return mixP(WF.fold, fl, clamp(p.ws));
}
function paint(T, p, F, o) {
  const { P, t } = o;
  const by = p.by, puff = 1 + p.fl * 0.12;
  const sh = [1, -12.5 + by], legTop = -6 + by;
  // legs and gripping toes
  const legs = () => {
    if (p.lg < 0.12) return;
    for (const [fx, sd, col] of [[p.f1x, 20, darken(P.leg, 0.85)], [p.f2x, 23, P.leg]]) {
      const c = Math.cos(p.br), s2 = Math.sin(p.br), q = [fx * 0.4, legTop + 9], top = [q[0] * c - q[1] * s2, q[0] * s2 + q[1] * c - 9], ft = [fx, -p.fy - 0.9];
      const kn = [lerp(top[0], ft[0], 0.5) - 1.5 * (1 - p.lg), lerp(top[1], ft[1], 0.5)];
      line(T, [top, kn, ft], 1.1, { seed: sd, color: col, taper: false });
      line(T, [[ft[0] - 1.6, ft[1] + 0.9], [ft[0] + 2.6, ft[1] + 0.9]], 0.9, { seed: sd + 1, color: col, taper: false });
      line(T, [[ft[0] - 0.4, ft[1]], [ft[0] - 1.9, ft[1] + 0.9]], 0.8, { seed: sd + 2, color: col, taper: false });
    }
  };
  legs();
  T.save(); T.translate(0, -9); T.rotate(p.br); T.translate(0, 9);
  // far wing (only shows when spread)
  if (p.ws > 0.05) { T.save(); T.translate(sh[0] + 2.5, sh[1] - 1); const Wf = rpoly(wingPts(p).map(([x, y]) => [x * 0.92, y * 0.95]), 2, { seed: 9, jit: 0.25 }); cel(T, Wf, darken(P.wing, 0.72), SH, 1, 9); T.restore(); }
  // tail
  T.save(); T.translate(-9, -11.5 + by); T.rotate(p.tf + 0.05 * Math.sin(t * 3.1));
  const Tl = rpoly([[1, -2], [-14, -4.5], [-15.5, 0.4], [1, 2.6]], 1.6, { seed: 4, jit: 0.2 });
  cel(T, Tl, darken(P.body, 0.85), SH, 1.1, 4); line(T, [[-2, -0.6], [-13, -1.6]], 0.5, { seed: 5, color: 'rgba(30,20,15,.5)' }); T.restore();
  const body = ell(0, -12.5 + by - F.breath * 0.3, 12.5 * puff, 7.6 * puff * (1 + F.breath * 0.03), 5, 0.3, -0.12);
  cel(T, body, P.body, SH, 0, 5);
  T.save(); T.beginPath(); body.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell(4, -6.5 + by, 11, 5.4, 6, 0.3), P.breast); T.restore();
  line(T, [...body, body[0]], 1.2, { seed: 5, taper: false });
  // near wing
  T.save(); T.translate(...sh); const Wn = rpoly(wingPts(p), 2, { seed: 8, jit: 0.25 });
  cel(T, Wn, P.wing, SH, 1.15, 8);
  T.save(); T.beginPath(); Wn.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  const W = wingPts(p); for (let i = 0; i < 3; i++) { const a = W[3], b = W[0]; line(T, [[lerp(b[0], a[0], 0.45 + i * 0.15), lerp(b[1], a[1], 0.45 + i * 0.15)], [lerp(W[4][0], W[2][0], 0.3) + i * 0.6, lerp(W[4][1], W[2][1], 0.3)]], 0.45, { seed: 30 + i, color: 'rgba(250,240,220,.45)' }); }
  T.restore(); T.restore();
  // head
  T.save(); T.translate(10 + p.hx, -18 + by + p.hy - F.breath * 0.3); T.rotate(p.hr - F.look * 0.12);
  const op = clamp(F.open);
  cel(T, ell(0, 0, 6.2 * (1 + p.fl * 0.05), 5.6, 6, 0.25), P.body, SH, 1.2, 61);
  fillP(T, ell(2.2, 3.4, 4, 2.2, 62, 0.15), P.breast);
  // beak: lower mandible drops for talk / song
  const ba = op * 0.55;
  T.save(); T.translate(5.2, 0.6); T.rotate(ba);
  cel(T, [[0, 0], [6.4, 0.5], [0.2, 2]], darken(P.beak, 0.85), SH * 0.4, 0.7, 63); T.restore();
  if (op > 0.05) fillP(T, [[5.2, 0.6], [11, 0.4], [5.6 + Math.cos(ba) * 6, 0.6 + Math.sin(ba) * 6]], '#7a2c2c');
  cel(T, [[5, -1.6], [11.6, 0.3], [5.2, 1]], P.beak, SH * 0.4, 0.8, 7);
  eye(T, 2.6, -1.4, 1.35, 1.55, F.eye, '#1a1410', F.look * 0.4, F.lid, F.tilt, { w: 0.75 });
  brow(T, 2.4, -4, 3.4, F.browY * 0.6, F.browT * 0.7, lighten(P.body, 0.45), 0.7, 64);
  o.out.head = T.map(0, 0); o.out.mouth = T.map(7.5, 1 + op);
  T.restore();
  T.restore();
}

// ── gaits ──
const G = { walk: { stride: 10, speed: 26 }, run: { stride: 18, speed: 54 }, fly: { stride: 80, speed: 190 }, glide: { stride: 120, speed: 170 } };
function hopper(stride, h) {
  return ph => {
    const p = { ...POSES.stand }, a = footAt(ph, 0, 0.5, stride, -1, 0), b = footAt(ph, 0, 0.5, stride, 1.5, 0);
    const air = a.down ? 0 : Math.sin(Math.PI * a.u);
    p.f1x = a.x; p.f2x = b.x; p.cf1 = +a.down; p.cf2 = +b.down; p.lift = h * air;
    p.by = a.down ? 1.2 * Math.sin(Math.PI * a.u) : 0; p.br = a.down ? 0.05 : -0.1 * air; p.tf = a.down ? -0.25 * Math.sin(Math.PI * a.u) : 0.2 * air;
    p.ws = 0.12 * air; p.wa = 0.5 * air;
    return p;
  };
}
const walk = hopper(G.walk.stride, 4), run = hopper(G.run.stride, 8);
function fly(ph) {                                    // one flap, then a short folded glide (bounding flight)
  const p = { ...POSES.spread }, q = frac(ph), flap = q < 0.6;
  const v = q / 0.6;
  p.ws = flap ? 1 : lerp(1, 0.1, ease(clamp((q - 0.6) / 0.12))) * (q > 0.9 ? lerp(0.1, 1, ease((q - 0.9) / 0.1)) / 0.1 * 0.1 : 1);
  p.wa = flap ? Math.cos(Math.PI * 2 * v) : 0.6;
  p.lg = 0; p.br = -0.08; p.tf = 0.1; p.f1x = -2; p.f2x = -1; p.fy = 2;
  p.lift = 6 + (flap ? 2 * Math.sin(Math.PI * v) : -2 * Math.sin(Math.PI * (q - 0.6) / 0.4));
  return p;
}
function glide(ph) { const p = { ...POSES.spread, lg: 0, fy: 2, f1x: -2, f2x: -1, br: -0.05 }; p.ws = 1; p.wa = 0.05 + 0.08 * Math.sin(Math.PI * 2 * ph); p.lift = 4 + Math.sin(Math.PI * 2 * ph); return p; }

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'songbird', label: 'Songbird',
  height: 24, headHeight: 12, width: 30, shadowW: 9,
  perch: true, flies: true, breathPeriod: 0.9,
  params: { body: '#6a4a3a', breast: '#d9b386', wing: '#553a2c', beak: '#e0ad5a', leg: '#8a6a50' },
  speeds: { walk: G.walk.speed, hop: G.walk.speed, run: G.run.speed, fly: G.fly.speed, glide: G.glide.speed },
  stride: { walk: G.walk.stride, hop: G.walk.stride, run: G.run.stride, fly: G.fly.stride, glide: G.glide.stride },
  steps: { walk: [0], hop: [0], run: [0] },
  poses: POSES,
  gaits: { walk, hop: walk, run, fly, glide },
  gestures: {
    nod: g(0.6, (u, b = base) => plus(b, { hr: 0.35 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.25 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.2, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { hr: -0.35 * e, by: -0.8 * k, tf: 0.3 * k, mo: 0.6 * e, eh: e, sm: e, fl: 0.3 * e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.6, (u, b = base) => jumpAt(u, b, { h: 12, crouch: { by: 1.5, tf: -0.3 }, air: { ws: 0.6, wa: 0.8, lg: 0.6, tf: 0.3 } }), [0.2, 0.4, 0.55, 0.85]),
    sing: g(2.0, (u, b = base) => { const e = env(u, 0.12, 0.15); return plus(b, { hr: -0.55 * e + 0.08 * Math.sin(u * 30) * e, br: -0.15 * e, hy: -1 * e, mo: e * (0.45 + 0.35 * Math.abs(Math.sin(u * Math.PI * 9))), fl: 0.25 * e, tf: 0.2 * e }); }, [0.2, 0.4, 0.6, 0.8]),
    flap: g(1.0, (u, b = base) => { const e = env(u, 0.15, 0.2); return plus(b, { ws: e, wa: e * Math.cos(u * Math.PI * 8), lift: 2 * e * Math.abs(Math.sin(u * Math.PI * 4)) }); }, [0.2, 0.35, 0.5, 0.7]),
    peck: g(0.8, (u, b = base) => { const k = Math.max(0, Math.sin(Math.PI * clamp(u / 0.4))) + Math.max(0, Math.sin(Math.PI * clamp((u - 0.45) / 0.4))); return plus(b, { br: 0.55 * k, hr: 0.4 * k, tf: 0.4 * k }); }, [0.2, 0.4, 0.65]),
    wave: g(1.2, (u, b = base) => { const e = env(u, 0.2, 0.2); return plus(b, { ws: 0.7 * e, wa: e * (0.4 + 0.5 * Math.sin(u * Math.PI * 8)), sm: 0.5 * e }); }, [0.25, 0.4, 0.55, 0.7]),
  },
  feet: p => [[p.f1x, -p.fy - (p.lift || 0), p.cf1 ?? +(p.fy < 0.05 && p.lg > 0.5)], [p.f2x, -p.fy - (p.lift || 0), p.cf2 ?? +(p.fy < 0.05 && p.lg > 0.5)]],
  paint,
});
