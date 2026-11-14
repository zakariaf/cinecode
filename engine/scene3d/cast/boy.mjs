// Milo, a boy of about six. Original design: a big round head on a small sturdy body, short dark messy hair
// (a floppy tuft over the forehead and a cowlick at the crown that bounce), ears that show, a wide button nose,
// freckles, round brown eyes under straight brows; a striped yellow and white T-shirt, blue shorts, white socks,
// no shoes. About 1.1 m to the top of the hair.
//
// The format is docs/scene3d-characters.md. Metres, rest pose: standing at the origin, facing +z, arms straight,
// held out and down at 40 degrees. Only the left side (+x) is written.
import { mirrorJoints, mirrorOps, grow } from '../character.mjs';
import { float, vec3, mix, smoothstep, abs, fract, max, length, mx_noise_float } from 'three/tsl';

const A = 40 * Math.PI / 180;                 // the arms' angle below level
const dir = [Math.cos(A), -Math.sin(A), 0];   // the way the left arm points
const along = (p, s, extra = [0, 0, 0]) => [p[0] + dir[0] * s + extra[0], p[1] + dir[1] * s + extra[1], p[2] + dir[2] * s + extra[2]];

// every measure is named once, here
const shoulder = [0.108, 0.725, -0.004];
const elbow = along(shoulder, 0.135);
const wrist = along(elbow, 0.125);
const hip = [0.054, 0.45, 0], knee = [0.058, 0.255, 0.006], ankle = [0.06, 0.052, -0.008];
const SLEEVE = 0.075;                          // the sleeve ends this far down the arm
const SOCK = 0.13;                             // the top of the socks
const HEM = 0.445, LEG = 0.322, WAIST = 0.5;   // the T-shirt's hem (above the seat, which stretches back when he sits), the shorts' legs and waist

const joints = mirrorJoints({
  pelvis: { at: [0, 0.47, 0] },
  spine: { at: [0, 0.55, 0], parent: 'pelvis' },
  chest: { at: [0, 0.64, 0], parent: 'spine' },
  neck: { at: [0, 0.755, -0.004], parent: 'chest' },
  head: { at: [0, 0.8, 0], parent: 'neck' },
  upperArmL: { at: shoulder, parent: 'chest', bend: true },
  foreArmL: { at: elbow, parent: 'upperArmL', bend: true },
  handL: { at: wrist, parent: 'foreArmL' },
  thighL: { at: hip, parent: 'pelvis', bend: true },
  shinL: { at: knee, parent: 'thighL', bend: true },
  footL: { at: ankle, parent: 'shinL' },
  toeL: { at: [0.062, 0.02, 0.052], parent: 'footL' },
});

const rosy = [1.07, 0.83, 0.8];

// The solids the clothes cover are named, so the T-shirt and the shorts are grown from them (character.mjs grow) and move
// with the body under them.
const pelvisB = { type: 'ell', c: [0, 0.475, 0.004], r: [0.08, 0.075, 0.075], bone: 'pelvis', k: 0.03 };   // a round little belly
const spineB = { type: 'ell', c: [0, 0.535, 0.006], r: [0.076, 0.07, 0.074], bone: 'spine', k: 0.04 };
const chestB = { type: 'ell', c: [0, 0.625, 0.0], r: [0.09, 0.105, 0.07], bone: 'chest', k: 0.03 };
const neckB = { type: 'cone', a: [0, 0.7, -0.004], b: [0, 0.81, 0], ra: 0.056, rb: 0.038, bone: 'neck', k: 0.022 };   // short and thick, widening into the shoulders
// the line of the shoulders, on the chest: the tops of the shoulders go with the chest and not with the arm (on the
// arm, the cloth over them stood up as a puff when the arm hung down)
const shouldersB = { type: 'cone', a: [-0.1, 0.71, -0.004], b: [0.1, 0.71, -0.004], ra: 0.042, bone: 'chest', k: 0.03 };
const upperArmB = { type: 'cone', a: shoulder, b: elbow, ra: 0.037, rb: 0.031, bone: 'upperArmL', k: 0.02, both: true };
const foreArmB = { type: 'cone', a: elbow, b: wrist, ra: 0.032, rb: 0.026, bone: 'foreArmL', k: 0.015, both: true };
const thighB = { type: 'cone', a: hip, b: knee, ra: 0.05, rb: 0.04, bone: 'thighL', k: 0.02, both: true };
const kneeB = { type: 'ell', c: [knee[0], knee[1], knee[2] + 0.011], r: [0.037, 0.035, 0.036], bone: 'shinL', k: 0.015, tint: rosy, both: true };
const shinB = { type: 'cone', a: knee, b: [ankle[0], 0.11, ankle[2]], ra: 0.04, rb: 0.03, bone: 'shinL', k: 0.015, both: true };
const calfB = { type: 'ell', c: [knee[0], knee[1] - 0.075, knee[2] - 0.012], r: [0.039, 0.06, 0.041], bone: 'shinL', k: 0.02, both: true };

const skin = mirrorOps([
  pelvisB, spineB, chestB, shouldersB, neckB,
  // arms (the hands come from the hands block)
  upperArmB, foreArmB,
  // legs: sturdy, a round knee, the calf
  thighB, kneeB, shinB, calfB,
  // head: a big round skull a little wider than tall, a full round jaw and cheeks, a wide button nose, ears that show
  { type: 'ell', c: [0, 0.94, 0], r: [0.143, 0.138, 0.137], bone: 'head', k: 0.02, skull: true },
  { type: 'ell', c: [0, 0.872, 0.022], r: [0.133, 0.08, 0.118], bone: 'head', k: 0.04, skull: true },
  { type: 'ell', c: [0.074, 0.862, 0.088], r: [0.046, 0.038, 0.04], bone: 'head', k: 0.032, tint: [1.08, 0.8, 0.77], both: true },
  // the mouth stands a little forward of the round face and the nose a little further, so both show in profile (on a
  // flat round face the painted mouth lay on the outline seen side on, and the expressions did not read)
  { type: 'ell', c: [0, 0.842, 0.108], r: [0.052, 0.03, 0.036], bone: 'head', k: 0.03 },
  { type: 'ell', c: [0, 0.876, 0.152], r: [0.022, 0.016, 0.02], bone: 'head', k: 0.014, tint: rosy },
  { type: 'ell', c: [0.141, 0.898, -0.008], r: [0.017, 0.035, 0.026], rot: [0, -0.45, 0], bone: 'head', k: 0.008, tint: rosy, both: true },
]);

// White socks are his feet: an ankle and a foot, a ribbed band at the top, flat on the floor
const socks = mirrorOps([
  { type: 'cone', a: [ankle[0], SOCK, ankle[2]], b: [ankle[0], 0.055, ankle[2]], ra: 0.037, rb: 0.036, bone: 'shinL', k: 0.01, both: true },
  { type: 'ell', c: [0.06, 0.036, -0.014], r: [0.037, 0.036, 0.043], bone: 'footL', k: 0.014, both: true },
  { type: 'ell', c: [0.062, 0.03, 0.03], r: [0.039, 0.03, 0.05], bone: 'footL', k: 0.016, both: true },
  { type: 'ell', c: [0.064, 0.026, 0.074], r: [0.041, 0.026, 0.042], bone: 'toeL', k: 0.016, both: true },
  { type: 'ell', c: [0.05, 0.026, 0.1], r: [0.022, 0.02, 0.018], bone: 'toeL', k: 0.012, both: true },   // the big toe under the sock
  { op: 'clip', n: [0, 1, 0], d: SOCK, k: 0.006 },
  { op: 'clip', n: [0, -1, 0], d: 0 },
]);

// The clothes are the skin's own solids grown all round by one thickness (character.mjs grow), with the openings cut after.
// Solids that end up cut away (the forearm under the sleeve's end, the knee and the shin under the shorts' hem)
// still weight the cloth near them as they weight the skin, so the cloth bends with the elbow and the knee as the skin
// does instead of the body coming out through it.
// T-shirt: 12 mm over the body, 20 over the hips so it hangs over the shorts (8 mm); short sleeves that open out a
// little
const shirt = mirrorOps([
  ...grow([spineB, chestB, shouldersB, neckB, upperArmB, foreArmB], 0.012),
  ...grow([pelvisB], 0.022),   // looser over the hips, where it hangs over the shorts
  { type: 'cone', a: along(shoulder, 0.02), b: along(shoulder, SLEEVE), ra: 0.046, rb: 0.05, bone: 'upperArmL', k: 0.015, both: true },
  // hollow over the belly and the hips, so the hem is an edge of cloth and not the cut face of a solid (sitting, the
  // shorts fold in under it and the cut face showed); the neck opening: hollow round the neck, so what is left of the
  // grown neck is a short round collar and not a disc across the inside of the neck (its edge came out through the
  // neck as white shards when the head moved); the sleeve ends; the hem
  ...[...grow([pelvisB], 0.01), ...grow([spineB], 0.004)].map((o) => ({ ...o, op: 'sub', bone: undefined, k: 0.008 })),   // (over the hips outside the shorts, or they show on the hem's edge)
  ...grow([neckB], 0.003).map((o) => ({ ...o, op: 'sub', bone: undefined, k: 0.008 })),
  { op: 'sub', type: 'cone', a: [0, 0.737, 0.004], b: [0, 0.95, 0.01], ra: 0.066, k: 0.012 },
  { op: 'sub', type: 'box', c: along(shoulder, SLEEVE + 0.2), r: [0.2, 0.09, 0.09], rot: [0, 0, -A], k: 0.006, both: true },
  { op: 'clip', n: [0, -1, 0], d: -HEM, k: 0.012 },
]);

// Shorts: 11 mm over the hips and thighs, the legs opening out a little toward the hem
const shorts = mirrorOps([
  // the legs first, joined hard (k 4 mm) so the two do not melt into one web between the thighs that stretches
  // across the lap when he sits; the hips after, melting softly onto both
  ...grow([thighB], 0.011).map((o) => ({ ...o, k: 0.004 })),
  { type: 'cone', a: [0.06, 0.385, 0.003], b: [0.066, LEG, 0.004], ra: 0.058, rb: 0.06, bone: 'thighL', k: 0.004, both: true },
  ...grow([kneeB, shinB, calfB], 0.011),
  ...grow([pelvisB, spineB], 0.006),   // (under the T-shirt's hem: well inside it, or the two break through each other at the seat when he sits)
  { op: 'clip', n: [0, 1, 0], d: WAIST },
  { op: 'clip', n: [0, -1, 0], d: -LEG, k: 0.012 },
]);

// T-shirt: yellow and white stripes about 3.6 cm apart, level in the rest pose over the body and the sleeves alike (as
// if cut from one striped cloth), a darker yellow rib at the neck, the sleeve ends and the hem. Placed in rest space,
// so they stay on the cloth. (Stripes run round the sleeve read as a target on the round end of a raised arm.)
const stripes = (p, base) => {
  const s = abs(p.x).sub(shoulder[0]).mul(dir[0]).add(p.y.sub(shoulder[1]).mul(dir[1]));      // distance down the arm from the shoulder
  const band = smoothstep(0.44, 0.56, abs(fract(p.y.mul(1 / 0.036)).sub(0.5)).mul(2)).mul(smoothstep(0.752, 0.745, p.y));   // 0 yellow, 1 white (soft edges); plain over the tops of the shoulders
  const neck = smoothstep(0.08, 0.074, length(vec3(p.x, 0, p.z))).mul(smoothstep(0.69, 0.7, p.y));
  const rib = max(max(smoothstep(SLEEVE - 0.012, SLEEVE - 0.006, s).mul(smoothstep(0.13, 0.14, abs(p.x))), smoothstep(HEM + 0.016, HEM + 0.01, p.y)), neck);
  return mix(mix(base, vec3(0.98, 0.95, 0.88), band), base.mul(0.82), rib);
};
// Shorts: a waistband and a seam down the outside of each leg.
const shortsTrim = (p, base) => {
  const band = smoothstep(WAIST - 0.03, WAIST - 0.024, p.y);
  const seam = smoothstep(0.004, 0.0015, abs(p.z.sub(0.004))).mul(smoothstep(0.08, 0.1, abs(p.x)));
  return base.mul(mix(float(1), float(0.82), max(band, seam)));
};
// Socks: a ribbed band at the top.
const sockRib = (p, base) => base.mul(mix(float(1), float(0.88), smoothstep(SOCK - 0.02, SOCK - 0.015, p.y)));
// Skin: a few faint freckles over the bridge of the nose and the tops of the cheeks: small, sparse and light, so they
// show in a close-up and are gone at mid distance (bigger, darker ones in a band under the eyes read as dirt or tear
// tracks: round 3)
const freckles = (p, base) => {
  const on = smoothstep(0.12, 0.14, p.z).mul(smoothstep(0.858, 0.866, p.y)).mul(smoothstep(0.888, 0.88, p.y)).mul(smoothstep(0.075, 0.06, abs(p.x)));
  const dot = smoothstep(0.5, 0.58, mx_noise_float(p.mul(260)));
  return mix(base, base.mul(vec3(0.9, 0.78, 0.7)), dot.mul(on).mul(0.45));
};

// The skin always inside the shorts is cut away: from just above the hem to just under the waist, between the hips.
// Bent deep at the hip (getting up off the floor) the back of the thigh, weighted to the thigh, rose through the seat
// of the shorts, weighted to the pelvis there, as a ragged skin-coloured hole (round 3). The clothes are still fitted
// to the whole skin (`fit: skin`).
const underShorts = { op: 'sub', type: 'box', c: [0, (LEG + 0.022 + WAIST - 0.03) / 2, 0], r: [0.13, (WAIST - 0.03 - LEG - 0.022) / 2, 0.13], k: 0.008 };

export const boy = {
  name: 'boy',
  kind: 'biped',
  joints,
  parts: [
    { name: 'skin', h: 0.0048, ops: [...skin, underShorts], material: { color: 0xeebc98, scatter: 0.32, scatterColor: 0xff7a4c, mottle: 0.04, pattern: freckles } },
    { name: 'socks', h: 0.004, ops: socks, material: { color: 0xf4f0e8, mottle: 0.05, mottleScale: 10, pattern: sockRib } },
    { name: 'shirt', h: 0.005, ops: shirt, fit: skin, material: { color: 0xf2bd2c, scatter: 0.25, mottle: 0.08, mottleScale: 10, pattern: stripes } },
    { name: 'shorts', h: 0.005, ops: shorts, fit: skin, material: { color: 0x3d68b4, scatter: 0.15, mottle: 0.1, mottleScale: 10, pattern: shortsTrim } },
  ],
  hands: { length: 0.092, width: 0.06, thick: 0.032, segments: 2, tint: rosy },
  hair: {
    material: { color: 0x3f2c24 },   // (a little lighter than near-black, so the locks and ridges show from behind)
    thick: 0.011,
    // the hairline: high over the forehead (the fringe locks hang over it, ragged), round above the ear, short at the nape
    line: [[0, 36], [38, 32], [62, 14], [82, 4], [100, -2], [118, -24], [150, -40], [180, -46]],
    ridges: { n: 30, amp: 0.002 },
    locks: [
      // messy: a ragged fringe of pointed locks of different lengths, one of them a floppy tuft on a spring; a
      // cowlick at the crown that sticks up and back on a spring; tufts over the ears and at the back
      { name: 'tuft', at: [4, 68], to: [12, 18], r: 0.03, tip: 0.3, out: 0.016, spring: { f: 3.8, z: 0.3, drag: 1, shift: 0.35, swing: 5 } },
      { name: 'fringeR', at: [-18, 64], to: [-26, 26], r: 0.028, tip: 0.3, out: 0.012 },
      { name: 'fringeRR', at: [-40, 58], to: [-52, 30], r: 0.026, tip: 0.3, out: 0.01 },
      { name: 'fringeL', at: [24, 62], to: [34, 28], r: 0.028, tip: 0.3, out: 0.012 },
      { name: 'fringeLL', at: [46, 54], to: [58, 32], r: 0.024, tip: 0.3, out: 0.01 },
      { name: 'cowlick', at: [168, 70], to: [178, 50], r: 0.026, tip: 0.3, out: 0.03, spring: { f: 4.6, z: 0.25, drag: 1, shift: 0.3, swing: 6 } },
      { name: 'side', at: [76, 40], to: [86, 12], r: 0.024, tip: 0.35, out: 0.006, both: true },
      { name: 'back', at: [130, 36], to: [140, 4], r: 0.026, tip: 0.4, out: 0.008, both: true },
      { name: 'nape', at: [180, 10], to: [182, -34], r: 0.028, tip: 0.4, out: 0.006 },
    ],
  },
  face: {
    eyes: { at: [0.062, 0.9], size: [0.05, 0.058], iris: 0x3e2617, irisLight: 0x8c5a30, open: 0.64, lashWidth: 0.12 },
    brows: { at: [0.068, 0.934], size: [0.048, 0.011], color: 0x2a1c18, tilt: 0.1 },
    mouth: { at: [0, 0.836], width: 0.062, color: 0x7a2028 },
  },
  // the ball of the foot and the heel: metres forward of the ankle; the arms hang out a little from his sides
  rig: { ball: 0.06, heel: -0.048, armSpread: 0.5 },
};

// Milo's look with other colours (a storyboard's cast "params": { "skin", "hair", "shirt", "shorts" }, each 0xrrggbb):
// the same boy, the same meshes (a colour is not meshed); the hair's colour is the brows' too.
export function boyWith({ skin, hair, shirt, shorts } = {}) {
  const color = { skin, shirt, shorts };
  return {
    ...boy,
    parts: boy.parts.map((p) => (color[p.name] === undefined ? p : { ...p, material: { ...p.material, color: color[p.name] } })),
    hair: hair === undefined ? boy.hair : { ...boy.hair, material: { ...boy.hair.material, color: hair } },
    face: hair === undefined ? boy.face : { ...boy.face, brows: { ...boy.face.brows, color: hair } },
  };
}
