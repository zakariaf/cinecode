// The Beetle. The legacy blue ground beetle as a full rig: six jointed legs on a tripod gait with planted feet,
// a glossy domed shell, swaying antennae, a storybook eye with lids and brow, mandibles that open to talk.
import { clamp, lerp, ell, rpoly } from '../core/lib.mjs';
import { cel, darken, lighten, line, fillP, dot, eye, brow, rgba } from '../core/style.mjs';
import { makeRig, footAt, ik2, mixPose, plus, jumpAt, ease } from './rig.mjs';

const SH = 0.6;
// Pose: by body drop, br pitch (- = front up), an antennae raise, legs: x of the six feet (n1..n3 near front→back,
// r1..r3 far) and their lift ny*/ry*, face hints.
const LEGX = { n1: 3.6, n2: 0.6, n3: -2.8, r1: 4.6, r2: 1.6, r3: -1.8 };
const D = { by: 0, br: 0, an: 0, lift: 0, mo: 0, sm: 0, eh: 0, lid: 0, wv: 0 };
for (const k in LEGX) { D[k + 'x'] = LEGX[k]; D[k + 'y'] = 0; }
const P0 = o => ({ ...D, ...o });
export const POSES = {
  stand: P0({}),
  alert: P0({ by: -0.6, br: -0.18, an: 0.6, lid: 0 }),
  sit: P0({ by: 1.1, an: -0.2, n1x: 4.4, n3x: -3.6, r1x: 5.4, r3x: -2.6 }),
  sleep: P0({ by: 1.3, an: -0.8, n1x: 4.4, n3x: -3.6, r1x: 5.4, r3x: -2.6, lid: 1 }),
};
POSES.rest = POSES.sit;

const hip = (p, k) => { const i = +k[1] - 1, x = 2.4 - i * 2.4 + (k[0] === 'r' ? 0.8 : 0), y = -2.4 + p.by + x * Math.sin(p.br) * 0.5; return [x, y]; };
const G = { walk: { stride: 4.4, speed: 11 }, run: { stride: 7.5, speed: 26 } };
function tripod(stride, duty, lift) {
  return ph => {
    const p = { ...POSES.stand }, A = ['n1', 'r2', 'n3'], B = ['r1', 'n2', 'r3'];
    for (const k of A) { const f = footAt(ph, 0, duty, stride, LEGX[k], lift); p[k + 'x'] = f.x; p[k + 'y'] = f.y; p['c' + k] = +f.down; }
    for (const k of B) { const f = footAt(ph, 0.5, duty, stride, LEGX[k], lift); p[k + 'x'] = f.x; p[k + 'y'] = f.y; p['c' + k] = +f.down; }
    p.by = -0.15 * Math.abs(Math.sin(Math.PI * 2 * ph)); p.br = 0.03 * Math.sin(Math.PI * 4 * ph); p.an = 0.15 * Math.sin(Math.PI * 4 * ph);
    return p;
  };
}
const walk = tripod(G.walk.stride, 0.56, 1), run = tripod(G.run.stride, 0.52, 1.4);

function legDraw(T, p, k, col) {
  const h = hip(p, k), f = [p[k + 'x'], p[k + 'y']], i = +k[1] - 1;
  const kn = ik2(h[0], h[1], f[0], f[1] - 0.3, 2, 2.4, i === 2 ? -1 : 1), knee = [kn[0], Math.min(kn[1], -0.6)];
  line(T, [h, knee], 0.75, { seed: 300 + i, color: col, taper: false });
  line(T, [knee, [f[0], f[1] - 0.2], [f[0] + (i === 2 ? -0.7 : 0.7), f[1]]], 0.55, { seed: 310 + i, color: col, taper: false });
}
function paint(T, p, F, o) {
  const { P, t } = o, op = clamp(F.open);
  for (const k of ['r1', 'r2', 'r3']) legDraw(T, p, k, darken(P.leg, 0.75));
  T.save(); T.translate(0, -2.8 + p.by); T.rotate(p.br);
  // antennae
  const an = p.an + 0.12 * Math.sin(t * 3.3);
  for (const [dx, sd, col] of [[0.4, 320, darken(P.leg, 0.8)], [0, 321, P.leg]]) {
    const a0 = [4.6 + dx, -1.2], a1 = [7 + dx, -3.4 - an * 1.4], a2 = [9.4 + dx + Math.sin(t * 2.7 + dx * 4) * 0.4, -3.4 - an * 3];
    line(T, [a0, a1, a2], 0.45, { seed: sd, color: col, taper: false }); dot(T, a2[0], a2[1], 0.5, col);
  }
  // mandibles
  for (const s of [-1, 1]) { const a = (s * 0.25 + 0.15) + op * 0.55 * s; line(T, [[5.6, 0.3], [5.6 + Math.cos(a) * 1.6, 0.3 + Math.sin(a) * 1.6]], 0.6, { seed: 322 + s, color: '#1a1a24', taper: true }); }
  // head and pronotum
  const hd = ell(4.4, -0.4, 1.9, 1.7, 330, 0.08); cel(T, hd, darken(P.shell, 0.7), SH, 0.6, 330);
  const pr = ell(2.4, -1, 1.9, 2, 331, 0.08); cel(T, pr, darken(P.shell, 0.85), SH, 0.6, 331);
  // shell (elytra)
  const sh = rpoly([[-4.6, 0.2], [-4.4, -2.4], [-2.2, -4.2], [1.2, -4], [2.6, -2], [2.4, 0.4]], [1.2, 1.6, 1.8, 1.6, 1, 0.6], { seed: 303, jit: 0.1 });
  cel(T, sh, P.shell, SH, 0.65, 303);
  T.save(); T.beginPath(); sh.forEach((q, i) => (i ? T.lineTo(q[0], q[1]) : T.moveTo(q[0], q[1]))); T.closePath(); T.clip();
  line(T, [[-3.2, -3.2], [-1, -3.9], [0.8, -3.6]], 0.6, { seed: 304, color: rgba(lighten(P.shell, 0.7), 0.75), taper: true });
  dot(T, -2.6, -3.1, 0.45, 'rgba(230,240,255,.75)');
  line(T, [[2.2, -0.4], [-1, -1.4], [-4.2, -0.4]], 0.35, { seed: 305, color: 'rgba(10,10,30,.5)' });
  T.restore();
  eye(T, 4.9, -0.8, 0.62, 0.72, F.eye, '#0e0e14', F.look * 0.2, F.lid, F.tilt, { sclera: '#f4f2ea', pupil: 0.62, w: 0.45 });
  brow(T, 4.8, -1.9, 1.4, F.browY * 0.6, F.browT * 0.8, lighten(P.shell, 0.5), 0.45, 306);
  if (op <= 0.03 && Math.abs(F.smile) > 0.4) line(T, [[5.6, 0.6], [4.9, 0.9 - 0.25 * F.smile], [4.3, 0.7 - 0.35 * F.smile]], 0.35, { seed: 307 });
  o.out.head = T.map(4.4, -0.4); o.out.mouth = T.map(6, 0.4);
  T.restore();
  for (const k of ['n1', 'n2', 'n3']) legDraw(T, p, k, P.leg);
}

const base = POSES.stand;
const g = (dur, at, keys) => ({ dur, at, keys });
const env = (u, a = 0.2, b = 0.2) => ease(clamp(u / a)) * (1 - ease(clamp((u - 1 + b) / b)));
export default makeRig({
  kind: 'beetle', label: 'Beetle',
  height: 7.5, headHeight: 4, width: 11, shadowW: 5.5,
  breathPeriod: 1.2,
  params: { shell: '#2e3a5a', leg: '#1e1e28' },
  speeds: { walk: G.walk.speed, run: G.run.speed },
  stride: { walk: G.walk.stride, run: G.run.stride },
  steps: { walk: [0, 0.5], run: [0, 0.5] },
  poses: POSES,
  gaits: { walk, run },
  gestures: {
    nod: g(0.6, (u, b = base) => plus(b, { br: 0.15 * Math.sin(Math.PI * clamp(u / 0.45)) + 0.1 * Math.sin(Math.PI * clamp((u - 0.45) / 0.45)) }), [0.22, 0.5, 0.7]),
    laugh: g(1.0, (u, b = base) => { const e = env(u, 0.15, 0.2), k = Math.abs(Math.sin(u * Math.PI * 8)) * e; return plus(b, { by: -0.5 * k, br: -0.1 * e, an: 0.5 * k, mo: 0.7 * e, eh: e, sm: e }); }, [0.2, 0.35, 0.5, 0.7]),
    jump: g(0.6, (u, b = base) => jumpAt(u, b, { h: 6, crouch: { by: 0.8 }, air: { an: 0.6, n1y: -0.8, n2y: -0.8, n3y: -0.8, r1y: -0.8, r2y: -0.8, r3y: -0.8 } }), [0.2, 0.4, 0.55, 0.85]),
    wave: g(1.2, (u, b = base) => { const e = env(u, 0.2, 0.2); return plus(b, { br: -0.25 * e, n1x: 2.4 * e, n1y: (-3.5 - 0.8 * Math.sin(u * Math.PI * 8)) * e, an: 0.4 * e, sm: 0.5 * e }); }, [0.25, 0.4, 0.55, 0.7]),
  },
  feet: p => Object.keys(LEGX).map(k => [p[k + 'x'], p[k + 'y'] - (p.lift || 0), p['c' + k] ?? +(Math.abs(p[k + 'y']) < 0.05)]),
  paint,
});
