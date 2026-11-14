// The small girl. Original design: a big round head on a small body, two buns tied
// with red bands, a straight fringe, round cheeks, big brown eyes; an orange bell dress
// with a white collar and a cream hem band, white socks, red shoes.
//
// She is the worked example of docs/scene3d-characters.md: read that for what every
// field means. Metres, rest pose: standing at the origin, facing +z, arms straight,
// held out and down at 40 degrees. Only the left side (+x) is written.
import { mirrorJoints, mirrorOps } from '../character.mjs';
import { float, vec3, mix, smoothstep, sin, atan } from 'three/tsl';

const A = 40 * Math.PI / 180;                 // the arms' angle below level
const dir = [Math.cos(A), -Math.sin(A), 0];   // the way the left arm points
const along = (p, s, extra = [0, 0, 0]) => [p[0] + dir[0] * s + extra[0], p[1] + dir[1] * s + extra[1], p[2] + dir[2] * s + extra[2]];

// every measure is named once, here
const shoulder = [0.1, 0.64, -0.004];
const elbow = along(shoulder, 0.125);
const wrist = along(elbow, 0.12);
const hip = [0.052, 0.395, 0], knee = [0.056, 0.215, 0.004], ankle = [0.058, 0.045, -0.008];

const joints = mirrorJoints({
  pelvis: { at: [0, 0.415, 0] },
  spine: { at: [0, 0.48, 0], parent: 'pelvis' },
  chest: { at: [0, 0.565, 0], parent: 'spine' },
  neck: { at: [0, 0.665, -0.004], parent: 'chest' },
  head: { at: [0, 0.705, 0], parent: 'neck' },
  upperArmL: { at: shoulder, parent: 'chest', bend: true },
  foreArmL: { at: elbow, parent: 'upperArmL', bend: true },
  handL: { at: wrist, parent: 'foreArmL' },
  thighL: { at: hip, parent: 'pelvis', bend: true },
  shinL: { at: knee, parent: 'thighL', bend: true },
  footL: { at: ankle, parent: 'shinL' },
  toeL: { at: [0.06, 0.018, 0.05], parent: 'footL' },
  skirt: { at: [0, 0.5, 0], parent: 'pelvis', near: ['spine', 'chest', 'thighL', 'thighR'] },   // loose: swings a beat late
});

const rosy = [1.07, 0.82, 0.8];

const skin = mirrorOps([
  // torso (under the dress), neck
  { type: 'ell', c: [0, 0.42, 0], r: [0.082, 0.07, 0.072], bone: 'pelvis', k: 0.03 },
  { type: 'ell', c: [0, 0.54, 0.004], r: [0.085, 0.09, 0.076], bone: 'chest', k: 0.03 },
  { type: 'cone', a: [0, 0.625, -0.004], b: [0, 0.71, 0], ra: 0.052, rb: 0.034, bone: 'neck', k: 0.02 },   // a child's neck: thick, and widening into the shoulders (a straight tube shows two hard upright lines from behind)
  // arms (the hands come from the hands block)
  { type: 'cone', a: shoulder, b: elbow, ra: 0.034, rb: 0.03, bone: 'upperArmL', k: 0.02, both: true },
  { type: 'cone', a: elbow, b: wrist, ra: 0.031, rb: 0.025, bone: 'foreArmL', k: 0.015, both: true },
  // legs
  { type: 'cone', a: hip, b: knee, ra: 0.05, rb: 0.04, bone: 'thighL', k: 0.02, both: true },
  { type: 'ell', c: [knee[0], knee[1], knee[2] + 0.01], r: [0.036, 0.034, 0.036], bone: 'shinL', k: 0.015, tint: rosy, both: true },
  { type: 'cone', a: knee, b: [ankle[0], 0.1, ankle[2]], ra: 0.04, rb: 0.031, bone: 'shinL', k: 0.015, both: true },
  // head: the skull (hair grows on these two), full cheeks, small nose, ears
  { type: 'ell', c: [0, 0.845, 0.002], r: [0.128, 0.122, 0.128], bone: 'head', k: 0.02, skull: true },
  { type: 'ell', c: [0, 0.797, 0.022], r: [0.124, 0.088, 0.112], bone: 'head', k: 0.035, skull: true },
  { type: 'ell', c: [0.07, 0.792, 0.082], r: [0.04, 0.034, 0.036], bone: 'head', k: 0.03, tint: [1.1, 0.74, 0.72], both: true },
  { type: 'ell', c: [0, 0.812, 0.135], r: [0.016, 0.013, 0.015], bone: 'head', k: 0.012, tint: rosy },
  { type: 'ell', c: [0.128, 0.815, -0.005], r: [0.014, 0.03, 0.021], rot: [0, -0.3, 0], bone: 'head', k: 0.008, tint: rosy, both: true },
]);

const socks = mirrorOps([
  { type: 'cone', a: [ankle[0], 0.115, ankle[2]], b: [ankle[0], 0.05, ankle[2]], ra: 0.036, rb: 0.034, bone: 'shinL', k: 0.008, both: true },
  { type: 'ell', c: [0.058, 0.04, -0.008], r: [0.034, 0.03, 0.036], bone: 'footL', k: 0.012, both: true },
  { op: 'clip', n: [0, 1, 0], d: 0.118, k: 0.006 },
]);

const shoes = mirrorOps([
  { type: 'ell', c: [0.059, 0.026, 0.012], r: [0.039, 0.03, 0.056], bone: 'footL', k: 0.012, both: true },
  { type: 'ell', c: [0.061, 0.024, 0.066], r: [0.038, 0.027, 0.036], bone: 'toeL', k: 0.012, both: true },
  { op: 'sub', type: 'ell', c: [0.058, 0.07, 0.0], r: [0.034, 0.034, 0.05], k: 0.008, both: true },                // the opening
  { type: 'torus', c: [0.059, 0.03, 0.03], R: 0.037, r: 0.006, rot: [Math.PI / 2, 0, 0], bone: 'footL', k: 0.004, both: true },   // the strap: an arch over the instep whose ends go into the shoe
  { op: 'clip', n: [0, -1, 0], d: 0 },
]);

const dress = mirrorOps([
  { type: 'ell', c: [0, 0.555, 0.004], r: [0.098, 0.088, 0.088], bone: 'chest', k: 0.03 },
  { type: 'ell', c: [0, 0.47, 0.003], r: [0.105, 0.07, 0.095], bone: 'spine', k: 0.04 },
  { type: 'ell', c: [0, 0.622, -0.03], r: [0.112, 0.042, 0.045], bone: 'chest', k: 0.02 },        // the back of the neckline stands higher than the front, so the collar is not seen from behind
  { type: 'ell', c: along(shoulder, 0.012, [0, 0.004, 0]), r: [0.052, 0.05, 0.052], bone: 'upperArmL', k: 0.025, both: true },   // puffed sleeves
  { type: 'cone', a: along(shoulder, 0.03), b: along(shoulder, 0.08), ra: 0.04, bone: 'upperArmL', k: 0.01, both: true },        // with a band below the puff, so the arm comes out of a sleeve from every side
  { type: 'cone', a: [0, 0.5, 0], b: [0, 0.285, 0], ra: 0.105, rb: 0.2, bone: 'skirt', k: 0.04 },                                // the bell
  { type: 'ell', c: [0.06, 0.33, 0.13], r: [0.045, 0.05, 0.03], bone: 'thighL', k: 0.005, soft: 0.05, both: true },   // inside the front of the bell: the knees carry the cloth over them when she sits or crouches
  // hollow underneath, open at the neck and the sleeve ends, cut at the hem
  { op: 'sub', type: 'cone', a: [0, 0.4, 0], b: [0, 0.2, 0], ra: 0.085, rb: 0.215, k: 0.02 },
  { op: 'sub', type: 'cone', a: [0, 0.645, -0.002], b: [0, 0.8, 0], ra: 0.047, k: 0.02 },
  { op: 'sub', type: 'box', c: along(shoulder, 0.08 + 0.2), r: [0.2, 0.09, 0.09], rot: [0, 0, -A], k: 0.008, both: true },
  { op: 'clip', n: [0, -1, 0], d: -0.292, k: 0.01 },
]);

const collar = mirrorOps([
  { type: 'ell', c: [0.036, 0.642, 0.05], r: [0.04, 0.012, 0.03], rot: [0.5, 0.2, -0.25], bone: 'chest', k: 0.006, both: true },
  { type: 'torus', c: [0, 0.642, -0.002], R: 0.05, r: 0.0085, bone: 'chest', k: 0.006 },
  { op: 'clip', n: [0, 0, -1], d: -0.015, k: 0.008 },     // the collar is only at the front: nothing of it beside the neck, where it would peek past the neck from behind
]);

// Dress: a cream band above the hem and soft pleats that fan out down the skirt.
// A pattern is given the rest position p, so it stays on the cloth as she moves.
const hemBand = (p, base) => {
  const pleat = sin(atan(p.z, p.x).mul(11)).mul(0.5).add(0.5);
  const c = base.mul(mix(float(1), float(0.86), pleat.mul(smoothstep(0.5, 0.36, p.y))));
  return mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.312, 0.317, p.y).mul(smoothstep(0.335, 0.33, p.y)).mul(0.9));
};

export const girl = {
  name: 'girl',
  kind: 'biped',
  joints,
  parts: [
    { name: 'skin', h: 0.0045, ops: skin, material: { color: 0xf3c7aa, scatter: 0.32, scatterColor: 0xff7a4c, mottle: 0.04 } },
    { name: 'socks', h: 0.004, ops: socks, material: { color: 0xf6f0e6, mottle: 0.04 } },
    { name: 'shoes', h: 0.0035, ops: shoes, material: { color: 0xc93a36, mottle: 0.06, rim: 1.6 } },
    { name: 'dress', h: 0.005, ops: dress, material: { color: 0xf0842c, scatter: 0.3, mottle: 0.1, mottleScale: 12, pattern: hemBand } },
    { name: 'collar', h: 0.003, ops: collar, material: { color: 0xfbf4ea, mottle: 0.03 } },
  ],
  hands: { length: 0.085, width: 0.056, thick: 0.03, segments: 2, tint: rosy },
  hair: {
    material: { color: 0x4a3338 },
    thick: 0.011,
    // the hairline: a straight fringe across the forehead, round above the ear, down to the nape
    line: [[0, 36], [45, 34], [68, 8], [88, -4], [108, -30], [180, -62]],
    ridges: { n: 44, amp: 0.0012 },
    locks: [
      { name: 'fringe', at: [0, 56], to: [0, 30], r: 0.03 },
      { name: 'fringeNear', at: [21, 56], to: [22, 30], r: 0.03, both: true },
      { name: 'fringeFar', at: [42, 54], to: [45, 29], r: 0.029, both: true },
      { name: 'sideLock', at: [70, 24], to: [76, -14], r: 0.019, tip: 0.25, both: true },   // ends in a point at the ear lobe
      { name: 'bun', bun: true, at: [106, 51], r: 0.06, out: 0.05, tie: 0xd23a34, both: true,
        spring: { f: 4.2, z: 0.28, drag: 1, shift: 0.7, swing: 4, stretch: 3.5 } },
    ],
  },
  face: {
    eyes: { at: [0.052, 0.836], size: [0.052, 0.066], iris: 0x5a3422, irisLight: 0xa86a3c, lashWidth: 0.15 },
    brows: { at: [0.055, 0.88], size: [0.04, 0.0085], color: 0x2a1c1e, tilt: 0.1 },
    mouth: { at: [0, 0.778], width: 0.048, color: 0x7a2028 },
  },
  loose: [
    { bone: 'skirt', f: 2.6, z: 0.4, drag: 1, swing: 3.2, stretch: -2.2 },
  ],
  // the ball of the foot and the heel: metres forward of the ankle; armSpread: how far the arms hang out from her sides (clear of the skirt)
  rig: { ball: 0.05, heel: -0.038, armSpread: 0.62 },
};
