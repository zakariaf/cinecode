// The cat. Original design: a round white cat with ginger patches, ginger ears, cap and
// tail, white paws and muzzle, a big head, green eyes with slit pupils, a pink nose.
//
// The format is written down in docs/scene3d-characters.md. Metres, rest pose standing
// and facing +z, left side written and mirrored. It is a four-legged skeleton:
// hips -> spine -> chest -> neck -> head, a five-bone tail, two ears, front legs
// (upper, lower, paw) and hind legs (thigh, shin, foot).
import { mirrorJoints, mirrorOps } from '../character.mjs';
import { float, vec3, mix, smoothstep, sin, cos, abs, mx_noise_float } from 'three/tsl';

const sh = [0.06, 0.188, 0.108], el = [0.06, 0.106, 0.097], wr = [0.06, 0.028, 0.106];
const hp = [0.064, 0.186, -0.108], kn = [0.073, 0.106, -0.06], hk = [0.07, 0.066, -0.138], toe = [0.07, 0.02, -0.104];
const tail = [[0, 0.228, -0.172], [0, 0.262, -0.228], [0, 0.308, -0.272], [0, 0.362, -0.3], [0, 0.42, -0.312], [0, 0.478, -0.305]];

const joints = mirrorJoints({
  hips: { at: [0, 0.2, -0.108] },
  spine: { at: [0, 0.212, 0], parent: 'hips' },
  chest: { at: [0, 0.205, 0.104], parent: 'spine' },
  neck: { at: [0, 0.236, 0.15], parent: 'chest' },
  head: { at: [0, 0.266, 0.178], parent: 'neck' },
  earL: { at: [0.062, 0.385, 0.2], parent: 'head' },
  tail1: { at: tail[0], parent: 'hips' },
  tail2: { at: tail[1], parent: 'tail1' },
  tail3: { at: tail[2], parent: 'tail2' },
  tail4: { at: tail[3], parent: 'tail3' },
  tail5: { at: tail[4], parent: 'tail4' },
  fUpperL: { at: sh, parent: 'chest' },
  fLowerL: { at: el, parent: 'fUpperL', bend: true },
  fPawL: { at: wr, parent: 'fLowerL' },
  hThighL: { at: hp, parent: 'hips' },
  hShinL: { at: kn, parent: 'hThighL', bend: true },
  hFootL: { at: hk, parent: 'hShinL', bend: true },
});

// (the coat, `cream`, is a mid ginger: a light ginger [1.06, 0.88, 0.7] read ginger in a room's shade but went a pale
// peach in full sun, where the picture's highlight shoulder bends any light colour toward the paper's white; round 3)
const ginger = [1.0, 0.6, 0.3], patch = [0.98, 0.4, 0.12], white = [1.06, 1.05, 1.02], pink = [1.08, 0.8, 0.78], cream = [1.0, 0.62, 0.36];
// the face a deeper ginger than the body (a tabby's head is darker than its flanks; it is also the part that most
// often faces the sun and the sky, and in a light ginger it went pale in a close-up outdoors)
const face = [1.0, 0.55, 0.28];
const tailOps = [];
for (let i = 0; i < 5; i++) tailOps.push({ type: 'cone', a: tail[i], b: tail[i + 1], ra: 0.036 - i * 0.001, rb: 0.035 - i * 0.001, bone: 'tail' + (i + 1), k: 0.012, tint: i === 4 ? white : patch, soft: 0.02 });

const body = mirrorOps([
  // trunk
  { type: 'ell', c: [0, 0.196, -0.088], r: [0.096, 0.094, 0.1], bone: 'hips', k: 0.04, tint: cream },
  { type: 'ell', c: [0, 0.2, 0.005], r: [0.096, 0.09, 0.1], bone: 'spine', k: 0.04, tint: cream },
  { type: 'ell', c: [0, 0.198, 0.092], r: [0.09, 0.09, 0.085], bone: 'chest', k: 0.04, tint: cream },
  { type: 'ell', c: [0, 0.182, 0.15], r: [0.062, 0.06, 0.04], bone: 'chest', k: 0.03, tint: white },                   // bib
  { type: 'ell', c: [0, 0.262, -0.015], r: [0.072, 0.04, 0.11], bone: 'spine', k: 0.02, tint: patch },                // saddle
  { type: 'ell', c: [0, 0.256, -0.105], r: [0.062, 0.04, 0.065], bone: 'hips', k: 0.02, tint: patch },
  // patches: flat ginger solids lying in the coat (they colour it, and hardly change its shape)
  { type: 'ell', c: [0.076, 0.2, 0.03], r: [0.034, 0.06, 0.065], bone: 'spine', k: 0.012, tint: patch },
  { type: 'ell', c: [-0.068, 0.215, 0.1], r: [0.038, 0.055, 0.05], bone: 'chest', k: 0.012, tint: patch },
  { type: 'ell', c: [-0.08, 0.165, -0.1], r: [0.036, 0.055, 0.055], bone: 'hips', k: 0.012, tint: patch },
  { type: 'cone', a: [0, 0.225, 0.135], b: [0, 0.275, 0.185], ra: 0.066, rb: 0.064, bone: 'neck', k: 0.03, tint: cream },
  // head: a big round skull, cheeks, muzzle
  { type: 'ell', c: [0, 0.322, 0.218], r: [0.118, 0.098, 0.1], bone: 'head', k: 0.03, tint: face },
  { type: 'ell', c: [0, 0.38, 0.195], r: [0.092, 0.047, 0.078], bone: 'head', k: 0.02, tint: patch },                 // ginger cap
  { type: 'ell', c: [0.066, 0.345, 0.268], r: [0.046, 0.042, 0.04], bone: 'head', k: 0.012, tint: patch },              // a patch over the left eye
  { type: 'ell', c: [0.058, 0.292, 0.272], r: [0.052, 0.04, 0.04], bone: 'head', k: 0.025, tint: white, both: true },
  { type: 'ell', c: [0, 0.287, 0.31], r: [0.036, 0.027, 0.024], bone: 'head', k: 0.02, tint: white },
  // ears: broad cones with a shallow pale pink hollow (a deep one read as a dark hole in the head from behind). The
  // hollow starts above where the ear meets the skull: one that started at the root also scooped the skull in front of
  // the ear, a dark crater beside it in a close-up (round 3)
  { type: 'cone', a: [0.066, 0.385, 0.198], b: [0.096, 0.478, 0.19], ra: 0.046, rb: 0.008, bone: 'earL', k: 0.012, tint: ginger, both: true },
  { op: 'sub', type: 'cone', a: [0.075, 0.428, 0.236], b: [0.093, 0.466, 0.217], ra: 0.02, rb: 0.004, k: 0.006, both: true },
  { type: 'cone', a: [0.075, 0.425, 0.219], b: [0.092, 0.458, 0.209], ra: 0.02, rb: 0.005, bone: 'earL', k: 0.004, tint: pink, both: true },
  // front legs: short and sturdy
  { type: 'cone', a: sh, b: el, ra: 0.044, rb: 0.036, bone: 'fUpperL', k: 0.025, tint: cream, both: true },
  { type: 'cone', a: el, b: wr, ra: 0.036, rb: 0.032, bone: 'fLowerL', k: 0.015, tint: cream, both: true },
  { type: 'ell', c: [wr[0], 0.023, wr[2] + 0.014], r: [0.037, 0.023, 0.045], bone: 'fPawL', k: 0.015, tint: white, both: true },
  // hind legs: a round haunch, shin, long foot
  { type: 'ell', c: [0.074, 0.158, -0.092], r: [0.054, 0.076, 0.07], bone: 'hThighL', k: 0.03, tint: cream, both: true },
  { type: 'cone', a: kn, b: hk, ra: 0.036, rb: 0.027, bone: 'hShinL', k: 0.015, tint: cream, both: true },
  { type: 'cone', a: hk, b: toe, ra: 0.027, rb: 0.028, bone: 'hFootL', k: 0.012, tint: cream, both: true },
  { type: 'ell', c: [toe[0], 0.021, toe[2] + 0.012], r: [0.034, 0.021, 0.043], bone: 'hFootL', k: 0.012, tint: white, both: true },
  ...tailOps,
  { op: 'clip', n: [0, -1, 0], d: 0 },
]);

// tabby stripes across the ginger body, fur noise everywhere; on the head its own markings (the body's bands, which
// run across the length of the body, drew rings round the face): lines running back over the crown from the
// forehead (the tabby's "M"), and two thin lines from the outer corner of each eye back across the cheek. White fur
// (muzzle, bib, paws) has none. (All in the rest position: the head's skull is z > 0.12, y > 0.22.)
const fur = (p, base) => {
  const isGinger = smoothstep(0.48, 0.3, base.b.div(base.r));
  const head = smoothstep(0.15, 0.19, p.z).mul(smoothstep(0.24, 0.28, p.y));
  const stripe = smoothstep(0.7, 0.95, sin(p.z.mul(110).add(p.y.mul(30))).mul(0.5).add(0.5)).mul(head.oneMinus());
  // the crown: lines along the head at x = 0, ±0.024, ±0.048, from just above the eyes back; the outer ones stop
  // higher, so from the front the lines over the brow make the M
  const ax = abs(p.x);
  const crown = smoothstep(0.55, 0.9, cos(p.x.mul(Math.PI * 2 / 0.024))).mul(smoothstep(0.06, 0.05, ax))
    .mul(smoothstep(0.352, 0.366, p.y.sub(ax.mul(0.35))));
  // the cheeks: two lines of constant height on the sides of the head, behind the eye, fading toward the back
  const cheek = smoothstep(0.55, 0.9, cos(p.y.sub(0.3).mul(Math.PI * 2 / 0.02))).mul(smoothstep(0.29, 0.296, p.y)).mul(smoothstep(0.326, 0.318, p.y))
    .mul(smoothstep(0.07, 0.085, ax)).mul(smoothstep(0.17, 0.22, p.z)).mul(smoothstep(0.31, 0.27, p.z));
  const marks = crown.add(cheek).min(1).mul(head);
  const n = mx_noise_float(p.mul(vec3(90, 90, 30))).mul(0.5).add(0.5);
  return base.mul(mix(float(1), float(0.76), stripe.mul(isGinger))).mul(mix(float(1), float(0.66), marks.mul(isGinger))).mul(mix(float(0.94), float(1.05), n));
};

export const cat = {
  name: 'cat',
  kind: 'quadruped',
  joints,
  parts: [
    { name: 'skin', h: 0.005, ops: body, soft: 0.022, material: { color: 0xe4d0b6, scatter: 0.25, mottle: 0.06, mottleScale: 30, pattern: fur, rim: 1.2, sun: 0.45 } },
  ],
  face: {
    eyes: { at: [0.05, 0.33], size: [0.054, 0.06], iris: 0x6f8a2e, irisLight: 0xb9c95a, irisSize: 0.86, pupil: 'slit', lid: 0xd6a272, lash: 0x3a2a22, lashWidth: 0.08, white: 0xdfe2c8, open: 0.7 },
    // a small mouth under the nose that only shows when it opens (line: false: shut, the face is as it was without
    // one): a meow (quadruped.mjs meow), a pant or a yawn (face.mouth.open)
    mouth: { at: [0, 0.281], width: 0.048, line: false, teeth: false, color: 0x4a1a20, tongue: 0xe07c84 },
  },
  attach: [
    { name: 'nose', bone: 'head', geo: 'sphere', at: [0, 0.302, 0.334], scale: [0.011, 0.0075, 0.006], material: { color: 0xe58a8a, scatter: 0 } },
  ],
  // a four-legged animal's tail and ears are swung by the critter (quadruped.mjs), which reads these springs
  loose: [
    { bone: 'tail1', f: 2.2, z: 0.35 },
    { bone: 'earL', f: 5, z: 0.4, swing: 6 },
  ],
  rig: { hindToe: toe },   // where the hind toes meet the floor (the hind foot runs from the hock to here)
};
