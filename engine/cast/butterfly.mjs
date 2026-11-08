// The Butterfly. The legacy flutterer as a full rig seen from slightly above: fore- and hind-wing pairs that fold
// upright when perched and beat in a projected flap when flying, clubbed antennae, a storybook face with a tiny
// mouth, thin legs gripping the perch (the contact point).
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, mixPose, plus, jumpAt, ease, frac, footAt } from './rig.mjs';

const SH = 0.5, ELEV = 0.55;                       // camera looks down on the wings by ELEV radians
// Pose: wa wing angle (π/2 = closed upright, 0 = flat open, negative = beaten down), wf far-wing lag,
// by body drop, br pitch, an antennae raise, lg legs (1 out, 0 tucked), f1x f2x foot x, face hints.
const D = { wa: 1.45, wf: 0, by: 0, br: -0.1, an: 0, lg: 1, f1x: -1.4, f2x: 1.6, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0 };
const P0 = o => ({ ...D, ...o });
export const POSES = {
  stand: P0({}),
  sit: P0({ wa: 0.62, br: -0.05 }),
  open: P0({ wa: 0.42, br: -0.05, an: 0.2 }),
  alert: P0({ wa: 0.85, an: 0.6, br: -0.2, lid: 0 }),
  sleep: P0({ wa: 1.5, an: -0.7, by: 0.4, lid: 1 }),
};
POSES.rest = POSES.sit; POSES.perch = POSES.stand;

// wing outlines in (x along the body, s along the span, up = -s)
const FORE = rpoly([[0.4, 0], [-1.4, -4], [-1.2, -9.4], [1.6, -13.6], [5.4, -13.6], [5, -9.2], [2.6, -3.2], [1.4, 0]], [0.4, 1.5, 2.2, 2.4, 2, 1.8, 1.2, 0.4], { seed: 310, jit: 0.15, step: 1.5 });
const HIND = rpoly([[0.2, 0], [-3, -1.6], [-6, -5.6], [-5.8, -9.2], [-2.2, -9.4], [0.6, -5], [1, 0]], [0.3, 1.2, 1.6, 1.8, 1.6, 1, 0.3], { seed: 311, jit: 0.15, step: 1.5 });
function wingPair(T, k, P, far) {
  if (Math.abs(k) < 0.04) { line(T, [[-6, 0], [5, 0]], 0.6, { seed: 312, color: darken(P.col, 0.6) }); return; }
  T.save(); T.scale(1, k);
  const c1 = far ? darken(P.col, 0.78) : P.col, c2 = far ? darken(P.col2, 0.78) : P.col2;
  cel(T, HIND, c2, SH, 0.7, 311);
  T.save(); T.beginPath(); HIND.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, ell(-3.4, -7, 1.3, 1.2, 313, 0.05), P.spot); T.restore();
  cel(T, FORE, c1, SH, 0.75, 310);
  T.save(); T.beginPath(); FORE.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  fillP(T, rpoly([[0.6, -14.4], [6.4, -14.4], [6, -8.6], [3.6, -10.8]], 1.2, { seed: 314, jit: 0.1 }), P.tip);
  for (const [x, y] of [[3.6, -12.6], [4.8, -11], [2.2, -13.2]]) dot(T, x, y, 0.5, P.spot);
  for (let i = 0; i < 3; i++) line(T, [[0.8, -0.6], [0 + i * 1.6, -7.5 - i * 1.4]], 0.3, { seed: 315 + i, color: rgba(darken(P.col, 0.5), 0.55) });
  T.restore();
  T.restore();
}
function paint(T, p, F, o) {
  const { P, t } = o, op = clamp(F.open);
  const proj = (a, near) => (near ? -Math.sin(a) * Math.cos(ELEV) + Math.cos(a) * Math.sin(ELEV) : -Math.sin(a) * Math.cos(ELEV) - Math.cos(a) * Math.sin(ELEV));
  // the wing frame: s along the span maps to screen y by k = -proj (k > 0 → wing above the body)
  const kNear = -proj(p.wa, true), kFar = -proj(p.wa + p.wf, false);
  // legs (ground frame) gripping the contact point
  if (p.lg > 0.15) for (const [fx, sd, col] of [[p.f1x, 330, darken(P.body, 0.7)], [p.f2x, 331, P.body], [(p.f1x + p.f2x) / 2 + 2.2, 332, P.body]]) {
    const top = [fx * 0.3 + 0.6, -2.6 + p.by], kn = [lerp(top[0], fx, 0.5) + 0.6, lerp(top[1], 0, 0.5) - 0.8 * (1 - p.lg)];
    line(T, [top, kn, [fx, -0.15 - (1 - p.lg) * 1.6]], 0.32, { seed: sd, color: col, taper: false });
  }
  T.save(); T.translate(0, -3 + p.by); T.rotate(p.br);
  T.save(); T.translate(0.6, -0.6); wingPair(T, kFar, P, true); T.restore();
  // body: abdomen, thorax, head
  cel(T, ell(-2.9, 0.25, 3.1, 0.72, 333, 0.04, 0.1), P.body, SH, 0.5, 333);
  for (let i = 0; i < 4; i++) line(T, [[-1.6 - i * 1.2, -0.45], [-1.7 - i * 1.2, 0.8]], 0.25, { seed: 334 + i, color: rgba(lighten(P.body, 0.5), 0.6) });
  cel(T, ell(0.5, -0.1, 1.25, 1.05, 335, 0.04), darken(P.body, 0.9), SH, 0.5, 335);
  const hx = 2.3, hy = -0.4;
  // antennae with clubs
  const an = p.an + 0.12 * Math.sin(t * 2.9);
  for (const [dx, sd] of [[0, 336], [0.5, 337]]) {
    const a2 = [hx + 2.8 + dx + Math.sin(t * 3.4 + dx * 5) * 0.2, hy - 4.6 - an * 1.4];
    line(T, [[hx + 0.5 + dx * 0.3, hy - 0.9], [hx + 1.6 + dx, hy - 2.8 - an * 0.6], a2], 0.28, { seed: sd, color: P.body, taper: false });
    dot(T, a2[0], a2[1], 0.45, P.body);
  }
  cel(T, ell(hx, hy, 1.2, 1.1, 338, 0.03), P.body, SH, 0.5, 338);
  eye(T, hx + 0.35, hy - 0.2, 0.55, 0.62, F.eye, '#0c0c10', F.look * 0.15, F.lid, F.tilt, { sclera: '#f6f2e8', pupil: 0.66, w: 0.4 });
  brow(T, hx + 0.3, hy - 1.15, 1.1, F.browY * 0.5, F.browT * 0.8, lighten(P.body, 0.55), 0.35, 339);
  if (op > 0.05) fillP(T, ell(hx + 1, hy + 0.75, 0.32, 0.12 + op * 0.3, 340, 0.01), '#7a2a36');
  else line(T, [[hx + 1.25, hy + 0.55], [hx + 0.95, hy + 0.75 + 0.15 * F.smile], [hx + 0.6, hy + 0.6]], 0.22, { seed: 341 });
  // proboscis coil
  { const c = [hx + 1.05, hy + 1.75], sp = Array.from({ length: 14 }, (_, i) => { const a = -Math.PI / 2 + i * 0.75 - op * 0.4, r = 0.75 * (1 - i / 16) + op * 0.4; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; }); line(T, sp, 0.2, { seed: 342, color: darken(P.body, 0.8), taper: false }); }
  o.out.head = T.map(hx, hy); o.out.mouth = T.map(hx + 1, hy + 0.7);
  T.save(); T.translate(0.2, -0.4); wingPair(T, kNear, P, false); T.restore();
  T.restore();
}

// ── gaits ──
const G = { fly: { stride: 30, speed: 80 }, glide: { stride: 40, speed: 70 }, walk: { stride: 2.4, speed: 4 } };
function fly(ph) {
  const p = { ...POSES.open }, c = Math.cos(Math.PI * 2 * ph);
  p.wa = 0.55 + 0.95 * c; p.wf = 0.12 * Math.sin(Math.PI * 2 * ph); p.lg = 0.1; p.br = -0.25 + 0.1 * c; p.an = 0.3;
  p.lift = 6 + 2.5 * Math.sin(Math.PI * 2 * ph - 1.2); p.f1x = -0.6; p.f2x = 0.6; return p;
}
function glide(ph) { const p = fly(0.25); p.wa = 0.1 + 0.1 * Math.sin(Math.PI * 2 * ph); p.lift = 5 + 0.8 * Math.sin(Math.PI * 2 * ph); return p; }
function walk(ph) {
  const p = { ...POSES.stand }, a = footAt(ph, 0, 0.6, G.walk.stride, -1.4, 0.8), b = footAt(ph, 0.5, 0.6, G.walk.stride, 1.6, 0.8);
  p.f1x = a.x; p.f2x = b.x; p.cf1 = +a.down; p.cf2 = +b.down; p.wa = 1.35 + 0.08 * Math.sin(Math.PI * 4 * ph); return p;
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'butterfly', label: 'Butterfly',
  height: 17, headHeight: 6, width: 10, shadowW: 4, shadowA: 0.16,
  perch: true, flies: true, breathPeriod: 1.0,
  params: { col: '#f2b24a', col2: '#e0884a', tip: '#3a2a30', spot: '#fbf3e0', body: '#3a2a30' },
  speeds: { walk: G.walk.speed, fly: G.fly.speed, glide: G.glide.speed },
  stride: { walk: G.walk.stride, fly: G.fly.stride, glide: G.glide.stride },
  steps: { walk: [0, 0.5] },
  poses: POSES,
  gaits: { fly, glide, walk },
  gestures: {
    nod: g(0.6, (u, b = base) => plus(b, { br: 0.2 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.12 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.0, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { wa: -0.5 * k, by: -0.4 * k, an: 0.4 * k, mo: 0.6 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.7, (u, b = base) => { const p = jumpAt(u, b, { h: 8, crouch: { by: 0.4 }, air: { lg: 0.3, an: 0.4 } }); p.wa = b.wa - 0.9 * Math.abs(Math.sin(u * Math.PI * 4)) * Math.sin(Math.PI * u); return p; }, [0.2, 0.4, 0.55, 0.85]),
    flutter: g(1.0, (u, b = base) => { const e = env(u, 0.1, 0.15); return plus(b, { wa: -e * (0.55 + 0.55 * Math.sin(u * Math.PI * 10)), lift: 1.5 * e * Math.abs(Math.sin(u * Math.PI * 5)) }); }, [0.2, 0.35, 0.5, 0.7]),
    wave: g(1.0, (u, b = base) => plus(b, { an: 0.9 * env(u) * Math.sin(u * Math.PI * 6), wa: -0.3 * env(u), sm: 0.5 * env(u) }), [0.25, 0.4, 0.6, 0.75]),
  },
  feet: p => [[p.f1x, -(p.lift || 0) - (p.lg < 0.5 ? 1 : 0), p.cf1 ?? +(p.lg > 0.5)], [p.f2x, -(p.lift || 0) - (p.lg < 0.5 ? 1 : 0), p.cf2 ?? +(p.lg > 0.5)]],
  paint,
});
