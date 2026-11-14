// The big gentle man. Original design: barrel body, sloping shoulders, heavy forearms
// and hands, short sturdy legs, bare feet, a round nose over a full ridged beard, small
// eyes under thick brows, a mop of hair with a quiff. Mustard T-shirt, blue dotted shorts.
//
// The format is written down in docs/scene3d-characters.md. Everything is in metres,
// in the rest pose: standing at the origin, facing +z, arms held out and down at 40
// degrees (so the arms and body mesh cleanly apart). Only the left side (+x) is
// written; `both: true` mirrors a solid to the right.
import { mirrorJoints, mirrorOps, scaleOps, toes } from '../character.mjs';
import { float, vec3, mix, smoothstep, fract, length, mx_noise_float, abs, max, step } from 'three/tsl';

const A = 40 * Math.PI / 180;                 // arm angle below horizontal
const dir = [Math.cos(A), -Math.sin(A), 0];   // direction of the left arm
const along = (p, s, extra = [0, 0, 0]) => [p[0] + dir[0] * s + extra[0], p[1] + dir[1] * s + extra[1], p[2] + dir[2] * s + extra[2]];

const shoulder = [0.3, 1.405, -0.01];
const elbow = along(shoulder, 0.31);
const wrist = along(elbow, 0.29);
const hip = [0.125, 0.80, 0], knee = [0.14, 0.445, 0.005], ankle = [0.15, 0.085, -0.015];

const joints = mirrorJoints({
  pelvis: { at: [0, 0.84, 0] },
  spine: { at: [0, 0.98, 0], parent: 'pelvis' },
  chest: { at: [0, 1.20, 0], parent: 'spine' },
  belly: { at: [0, 1.02, 0.08], parent: 'spine', near: ['chest', 'pelvis'] },   // a loose weight that bounces on a spring
  neck: { at: [0, 1.46, -0.01], parent: 'chest' },
  head: { at: [0, 1.535, 0], parent: 'neck' },
  upperArmL: { at: shoulder, parent: 'chest', bend: true },
  foreArmL: { at: elbow, parent: 'upperArmL', bend: true },
  handL: { at: wrist, parent: 'foreArmL' },
  thighL: { at: hip, parent: 'pelvis', bend: true },
  shinL: { at: knee, parent: 'thighL', bend: true },
  footL: { at: ankle, parent: 'shinL' },
  toeL: { at: [0.155, 0.03, 0.105], parent: 'footL' },
});

const rosy = [1.06, 0.84, 0.82];
const armRot = [0, 0, -A];

const HEAD = 1.12, neckTop = [0, 1.535, 0];   // the head is drawn at this scale about the top of the neck
const headOps = (ops) => scaleOps(mirrorOps(ops), neckTop, HEAD);

const skin = [...mirrorOps([
  // torso (mostly under the shirt)
  { type: 'ell', c: [0, 0.86, 0], r: [0.235, 0.16, 0.185], bone: 'pelvis', k: 0.05 },
  { type: 'ell', c: [0, 1.02, 0.04], r: [0.27, 0.215, 0.235], bone: 'belly', k: 0.06 },
  { type: 'ell', c: [0, 1.235, 0.005], r: [0.3, 0.205, 0.205], bone: 'chest', k: 0.06 },
  { type: 'cone', a: [-0.195, 1.375, -0.02], b: [0.195, 1.375, -0.02], ra: 0.108, bone: 'chest', k: 0.06 },
  { type: 'cone', a: [0, 1.40, -0.02], b: [0, 1.53, 0], ra: 0.098, rb: 0.084, bone: 'neck', k: 0.04 },   // the neck widens into the shoulders
  // arm
  { type: 'ell', c: along(shoulder, 0.01, [0, 0.01, 0]), r: [0.117, 0.112, 0.117], bone: 'upperArmL', k: 0.05, both: true },
  { type: 'cone', a: shoulder, b: elbow, ra: 0.113, rb: 0.099, bone: 'upperArmL', k: 0.04, both: true },
  { type: 'ell', c: along(shoulder, 0.17), r: [0.13, 0.112, 0.112], rot: armRot, bone: 'upperArmL', k: 0.04, both: true },   // the muscle of the upper arm: its outline is a curve, not two straight lines
  { type: 'cone', a: elbow, b: wrist, ra: 0.102, rb: 0.07, bone: 'foreArmL', k: 0.03, both: true },
  { type: 'ell', c: along(elbow, 0.1), r: [0.126, 0.101, 0.099], rot: armRot, bone: 'foreArmL', k: 0.03, both: true },
  // leg
  { type: 'ell', c: [0.10, 0.80, -0.07], r: [0.13, 0.12, 0.12], bone: 'pelvis', k: 0.05, both: true },
  { type: 'cone', a: hip, b: knee, ra: 0.137, rb: 0.102, bone: 'thighL', k: 0.04, both: true },
  { type: 'ell', c: [knee[0], knee[1], knee[2] + 0.02], r: [0.084, 0.078, 0.084], bone: 'shinL', k: 0.03, tint: rosy, both: true },
  { type: 'cone', a: knee, b: ankle, ra: 0.095, rb: 0.064, bone: 'shinL', k: 0.03, both: true },
  { type: 'ell', c: [knee[0] + 0.004, knee[1] - 0.14, knee[2] - 0.03], r: [0.081, 0.125, 0.088], bone: 'shinL', k: 0.03, both: true },
  { type: 'ell', c: [0.15, 0.05, -0.035], r: [0.052, 0.05, 0.062], bone: 'footL', k: 0.03, tint: rosy, both: true },
  { type: 'ell', c: [0.155, 0.045, 0.07], r: [0.062, 0.045, 0.095], bone: 'footL', k: 0.03, both: true },
  { type: 'ell', c: [0.157, 0.033, 0.15], r: [0.06, 0.031, 0.045], bone: 'toeL', k: 0.03, both: true },
  ...toes({ at: [0.119, 0.026, 0.196], width: 0.076, r: 0.023, tint: rosy }),
  { op: 'clip', n: [0, -1, 0], d: 0 },
]), ...headOps([
  // the skull: cranium and jaw (hair and beard grow on these two)
  { type: 'ell', c: [0, 1.705, 0], r: [0.148, 0.158, 0.16], bone: 'head', k: 0.04, skull: true },
  { type: 'ell', c: [0, 1.625, 0.035], r: [0.126, 0.10, 0.12], bone: 'head', k: 0.05, skull: true },
  { type: 'ell', c: [0.072, 1.648, 0.092], r: [0.052, 0.045, 0.05], bone: 'head', k: 0.04, tint: rosy, both: true },
  { type: 'ell', c: [0, 1.668, 0.17], r: [0.041, 0.037, 0.044], bone: 'head', k: 0.022, tint: rosy },
  { type: 'ell', c: [0.152, 1.675, -0.005], r: [0.022, 0.044, 0.03], rot: [0, -0.35, 0], bone: 'head', k: 0.012, tint: rosy, both: true },
])];

const shirt = mirrorOps([
  { type: 'ell', c: [0, 0.90, 0.03], r: [0.272, 0.15, 0.228], bone: 'pelvis', k: 0.05 },
  { type: 'ell', c: [0, 1.01, 0.04], r: [0.288, 0.232, 0.252], bone: 'belly', k: 0.06 },
  { type: 'ell', c: [0, 1.235, 0.005], r: [0.317, 0.217, 0.221], bone: 'chest', k: 0.06 },
  { type: 'cone', a: [-0.195, 1.375, -0.02], b: [0.195, 1.375, -0.02], ra: 0.123, bone: 'chest', k: 0.06 },
  { type: 'ell', c: along(shoulder, 0.01, [0, 0.01, 0]), r: [0.129, 0.124, 0.129], bone: 'upperArmL', k: 0.05, both: true },
  { type: 'cone', a: shoulder, b: along(shoulder, 0.2), ra: 0.126, rb: 0.135, bone: 'upperArmL', k: 0.04, both: true },   // the sleeve opens out toward its end
  // openings: neck, sleeve ends, hem
  { op: 'sub', type: 'cone', a: [0, 1.425, -0.005], b: [0, 1.7, 0.01], ra: 0.118, k: 0.045 },
  { op: 'sub', type: 'box', c: along(shoulder, 0.19 + 0.3), r: [0.3, 0.17, 0.17], rot: armRot, k: 0.03, both: true },
  { op: 'clip', n: [0, -1, 0], d: -0.795, k: 0.03 },
]);

const shorts = mirrorOps([
  { type: 'ell', c: [0, 0.86, 0], r: [0.25, 0.165, 0.2], bone: 'pelvis', k: 0.05 },
  { type: 'ell', c: [0.10, 0.80, -0.07], r: [0.14, 0.13, 0.13], bone: 'pelvis', k: 0.05, both: true },
  { type: 'cone', a: hip, b: [0.142, 0.5, 0.005], ra: 0.154, rb: 0.144, bone: 'thighL', k: 0.03, both: true },
  { op: 'clip', n: [0, 1, 0], d: 0.95 },
  { op: 'clip', n: [0, -1, 0], d: -0.515, k: 0.028 },
]);

// Shorts pattern: pale dots, placed in rest space so they stay on the cloth.
const dots = (p, base) => {
  const g = fract(p.mul(15.0).add(vec3(0.5, 0.2, 0.5))).sub(0.5);
  const d = length(g);
  return mix(base, base.mul(vec3(1.9, 1.75, 1.45)), smoothstep(0.3, 0.26, d).mul(0.8));
};

// Shirt: darker ribbing at the neck, the sleeve ends and the hem, and a few soft folds
// (placed in rest space, so they stay on the cloth).
const shirtTrim = (p, base) => {
  const neck = smoothstep(0.03, 0.018, abs(length(vec3(p.x, p.y.sub(1.435).mul(1.6), p.z.add(0.005))).sub(0.128)));
  const ax = abs(p.x);
  const s = ax.sub(shoulder[0]).mul(dir[0]).add(p.y.sub(shoulder[1]).mul(dir[1]));      // distance along the arm from the shoulder
  const cuff = smoothstep(0.158, 0.166, s).mul(step(0.25, ax));
  const hem = smoothstep(0.83, 0.815, p.y);
  const fold = smoothstep(0.35, 0.9, mx_noise_float(vec3(p.x.mul(5), p.y.mul(14).add(p.x.mul(p.x).mul(20)), p.z.mul(5))).mul(0.5).add(0.5)).mul(smoothstep(1.25, 0.95, p.y));
  return base.mul(mix(float(1), float(0.8), max(max(neck, cuff), hem))).mul(mix(float(1), float(0.9), fold.mul(0.6)));
};

export const man = {
  name: 'man',
  kind: 'biped',
  joints,
  parts: [
    { name: 'skin', h: 0.008, ops: skin, material: { color: 0xe6b497, scatter: 0.3, scatterColor: 0xff7a4c, mottle: 0.05 } },
    { name: 'shirt', h: 0.009, ops: shirt, material: { color: 0xd6a44c, scatter: 0.3, mottle: 0.1, mottleScale: 6, pattern: shirtTrim } },
    { name: 'shorts', h: 0.009, ops: shorts, material: { color: 0x3c68a6, scatter: 0.15, mottle: 0.08, pattern: dots } },
  ],
  hands: { length: 0.22, width: 0.13, thick: 0.062, segments: 3, tint: rosy },
  hair: {
    material: { color: 0x4a332b },
    thick: 0.014, h: 0.006,
    // the hairline: high over the forehead, level past the ear, down to the nape
    line: [[0, 50], [40, 45], [65, 22], [85, 4], [100, -14], [140, -40], [180, -48]],
    ridges: { n: 40, amp: 0.002 },
    locks: [
      // a mop: a quiff at the front that rocks, a swept fringe, tufts that break the outline at the crown and the back
      { name: 'quiff', at: [6, 72], to: [16, 46], r: 0.052, out: 0.05, spring: { f: 3.5, z: 0.3, shift: 0.3, swing: 5 } },
      { name: 'fringe', at: [-24, 68], to: [-34, 44], r: 0.046, out: 0.018 },
      { name: 'sweep', at: [38, 64], to: [52, 42], r: 0.046, out: 0.015 },
      { name: 'crown', at: [168, 80], to: [178, 48], r: 0.055, out: 0.022 },
      { name: 'side', at: [80, 44], to: [90, 14], r: 0.046, out: 0.012, both: true },
      { name: 'back', at: [132, 34], to: [138, -6], r: 0.05, out: 0.012, both: true },
      { name: 'nape', at: [180, 20], to: [176, -34], r: 0.052, out: 0.03 },
      { name: 'temple', at: [78, 10], to: [73, -20], r: 0.028, tip: 0.8, both: true },   // down in front of the ear to meet the beard
    ],
  },
  beard: {
    material: { color: 0x4f372e },
    thick: 0.024, h: 0.006,
    // the cheek line: under the nose, along the jaw up to the ear, nothing behind the ear
    line: [[0, -16], [30, -15], [60, -9], [80, -2], [92, -10], [102, -90], [180, -90]],
    ridges: { n: 40, amp: 0.0025 },
    locks: [
      { name: 'chin', at: [0, -36], to: [0, -62], r: 0.062, out: 0.02 },
      { name: 'jaw', at: [36, -34], to: [42, -56], r: 0.05, out: 0.012, both: true },
      { name: 'moustache', at: [4, -13], to: [36, -22], r: 0.026, tip: 0.45, out: 0.006, both: true },
    ],
  },
  face: {
    eyes: { at: [0.064, 1.737], size: [0.058, 0.068], iris: 0x4a2c1c, irisLight: 0x8a5a36, open: 0.55 },
    brows: { at: [0.07, 1.771], size: [0.086, 0.028], color: 0x3a2823, tilt: 0.14 },
    // the mouth sits on the beard under the moustache; side on it reaches back less far than a bare face's (depth), or
    // it runs on past the moustache onto the jaw's locks and reads as two mouths
    mouth: { at: [0, 1.62], width: 0.1, on: ['skin', 'beard'], color: 0x4a1a1e, lip: 0xb86a5e, depth: 0.8 },
  },
  loose: [
    { bone: 'belly', f: 3.0, z: 0.3, shift: 0.9, reach: 0.035, breath: 0.006 },
  ],
  rig: { ball: 0.105, heel: -0.085, armSpread: 0.34 },   // the ball of the foot and the heel: metres forward of the ankle; the arms hang out round the belly
};
