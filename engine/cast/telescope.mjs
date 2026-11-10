// A refractor telescope on a wooden tripod: a prop rig, so it is cast, staged, framed (`on`) and drawn in depth order
// with the people. Seen side-on, the tube points up and forward (the way it faces); the eyepiece is at the back, low
// end, `eye` units above the ground: 116 is a standing child's eye (the human rig, age child), so a child standing just
// behind it, facing it, has her eye at the eyepiece.
//
// Staging a child at the eyepiece: she faces the same way as the telescope and stands EYE_BACK × s behind its contact
// point (s = the set's scale there × cast scale), a few px nearer the camera so her face is drawn over the eyecup:
// facing left, child x = telescope x + 66 × s.
//
// Params: angle (the tube's elevation, radians, default 0.5 ≈ 29°), eye (the eyepiece height, units), tube, trim, legs,
// dark (colours). Its `head` is the eyepiece, so a `close` on it frames the eyecup (and a face at it).
import { makeRig } from './rig.mjs';
import { cel, line, darken, lighten } from '../core/style.mjs';
import { rpoly, ell } from '../core/lib.mjs';

const BACK = 57;              // eyecup tip, behind the pivot along the tube
const FRONT = 86;             // front of the dew shield, ahead of the pivot
export const EYE_BACK = 66;   // a child's contact point behind the telescope's, for her eye to meet the eyecup

const geo = (P = {}) => {
  const a = P.angle ?? 0.5, eye = P.eye ?? 116;
  const pivotY = -(eye + BACK * Math.sin(a));                       // the eyecup tip sits at y = -eye
  const top = pivotY - FRONT * Math.sin(a) - 8.8 * Math.cos(a);
  return { a, eye, pivotY, top, tip: [-BACK * Math.cos(a), -eye] };
};
const sizes = (P = {}) => { const g = geo(P), k = P.size || 1; return { height: Math.round(-g.top * k * 10) / 10, headHeight: 34 * k, width: 74 * k }; };
const S0 = sizes({});

function paint(T, p, F, o) {
  const P = o.P, g = geo(P), apex = [0, g.pivotY + 8];
  // tripod: the far leg (darker) behind, then a little accessory tray, then the two near legs
  const leg = (foot, col, seed) => {
    const dx = foot[0] - apex[0], dy = foot[1] - apex[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, w0 = 2.4, w1 = 1.7;
    cel(T, rpoly([[apex[0] + nx * w0, apex[1] + ny * w0], [foot[0] + nx * w1, foot[1] - 4 + ny * w1], [foot[0] - nx * w1, foot[1] - 4 - ny * w1], [apex[0] - nx * w0, apex[1] - ny * w0]], 1.2, { seed, jit: 0.25, step: 3 }), col, 0.8, 0.9, seed);
    cel(T, rpoly([[foot[0] - 1.6, foot[1] - 5], [foot[0] + 1.6, foot[1] - 5], [foot[0] + 1.1, foot[1]], [foot[0] - 1.1, foot[1]]], 0.6, { seed: seed + 1, jit: 0.1, step: 2 }), P.dark, 0.3, 0.7, seed + 1);
  };
  leg([4, 0], darken(P.legs, 0.72), 3);
  const trayY = apex[1] + (0 - apex[1]) * 0.62;
  cel(T, rpoly([[-18, trayY - 1.6], [18, trayY - 1.6], [16, trayY + 1.6], [-16, trayY + 1.6]], 1, { seed: 5, jit: 0.2, step: 3 }), darken(P.legs, 0.85), 0.6, 0.8, 5);
  leg([-34, 0], P.legs, 7);
  leg([32, 0], P.legs, 9);
  // the mount head on the apex
  cel(T, rpoly([[-6, g.pivotY + 10], [6, g.pivotY + 10], [5, g.pivotY - 2], [-5, g.pivotY - 2]], 1.5, { seed: 11, jit: 0.2, step: 3 }), P.dark, 0.9, 0.9, 11);
  // the tube, in its own frame (+x along the tube, toward the sky)
  T.save(); T.translate(0, g.pivotY); T.rotate(-g.a);
  const box = (x0, x1, r, col, sh, seed) => cel(T, rpoly([[x0, -r], [x1, -r], [x1, r], [x0, r]], Math.min(1.6, r * 0.3), { seed, jit: 0.15, step: 3 }), col, sh, 1, seed);
  // finder scope on its bracket, above the tube
  line(T, [[2, -7], [2, -11.5]], 1.4, { seed: 13, color: P.dark, taper: false });
  line(T, [[16, -7], [16, -11.5]], 1.4, { seed: 14, color: P.dark, taper: false });
  box(-4, 26, 2.3, P.tube, 0.6, 15);
  box(24, 28, 2.8, P.dark, 0.4, 16);
  box(-40, 60, 7.4, P.tube, 1.4, 17);                      // main tube
  box(58, FRONT, 8.8, P.tube, 1.6, 18);                    // dew shield
  box(57, 61, 9.2, P.trim, 0.6, 19);                       // its brass collar
  T.save(); T.globalAlpha = 0.5; T.fillStyle = '#9fb6e8';   // a glint of the objective lens at the front
  T.beginPath(); T.ellipse(FRONT - 0.6, 0, 1.2, 6.6, 0, 0, Math.PI * 2); T.fill(); T.restore();
  box(-12, -8, 8.3, P.trim, 0.6, 20);                      // tube rings
  box(10, 14, 8.3, P.trim, 0.6, 21);
  box(-49, -39, 4.3, P.dark, 0.6, 22);                     // focuser
  cel(T, ell(-44, 6.5, 2.2, 2.2, 23, 0.1), P.trim, 0.4, 0.8, 23);   // focus knob
  box(-BACK + 1, -48, 3.3, darken(P.dark, 0.7), 0.4, 24);  // eyepiece and its rubber eyecup
  box(-BACK, -BACK + 2.4, 3.8, darken(P.dark, 0.6), 0.3, 25);
  T.save(); T.globalAlpha = 0.35; T.fillStyle = lighten(P.tube, 0.6);   // a sheen along the top of the tube
  T.beginPath(); T.ellipse(10, -4.6, 38, 1.1, 0, 0, Math.PI * 2); T.fill(); T.restore();
  T.restore();
  o.out.head = T.map(g.tip[0], g.tip[1]); o.out.mouth = T.map(g.tip[0], g.tip[1]);
}

export default makeRig({
  kind: 'telescope', label: 'Telescope',
  height: S0.height, headHeight: S0.headHeight, width: S0.width, sizes,
  expressions: ['neutral'], upright: true,
  shadowW: 30,
  params: { angle: 0.5, eye: 116, tube: '#ebe3cd', trim: '#bf8f3c', legs: '#8b5e3c', dark: '#34303f' },
  speeds: { walk: 30 }, stride: { walk: 30 },
  poses: { stand: { lift: 0 } },
  gaits: { walk: () => ({ lift: 0 }) },
  gestures: {},
  paint,
});
