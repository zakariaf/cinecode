// The man's work clothes (a storyboard's cast "params": { "wardrobe": "work" } on the rig "man"; Dad in "Dad's Home"):
// the engine's man (cast/man.mjs) in his work clothes. The same body, head, hair, beard, face, hands, belly and
// rig; a different wardrobe: a light blue shirt with its sleeves rolled to the elbow, long grey trousers, brown
// shoes, and a briefcase in his right hand that hangs from it and swings with its own weight (the `hang` block,
// worked by hang.mjs, which every performer of it runs).
//
// A wardrobe change in this format is a new description that takes the man's and swaps its clothes: the joints, the
// hands, the hair, the beard, the face, the loose belly and the rig are the man's own objects; the part `skin` is
// the man's with the bare feet taken out (shoes go on them); his shirt and shorts are left out and these clothes put
// on. The measures come from the man's joints, so a change to his build carries over.
import { mirrorOps, grow } from '../character.mjs';
import { man } from './man.mjs';
import { float, vec3, mix, smoothstep, abs, max, fract, length, mx_noise_float } from 'three/tsl';

const A = 40 * Math.PI / 180;                 // the man's arms' angle below level
const dir = [Math.cos(A), -Math.sin(A), 0];
const along = (p, s, extra = [0, 0, 0]) => [p[0] + dir[0] * s + extra[0], p[1] + dir[1] * s + extra[1], p[2] + dir[2] * s + extra[2]];
const armRot = [0, 0, -A];

// the man's measures, read from his joints
const J = man.joints;
const shoulder = J.upperArmL.at, elbow = J.foreArmL.at, hip = J.thighL.at, knee = J.shinL.at, ankle = J.footL.at;
const ROLL = 0.07;          // the rolled cuff sits this far below the elbow
const HEM = 0.074;          // the trousers' hem, resting on the shoes

// The man's skin, solid by solid (cast/man.mjs): the clothes are grown from the solids they cover and weighted as the
// skin under them (character.mjs grow, and `fit` on the part), so they move as his body under them does. His hips, bare
// legs and feet are left out of `skin` (always inside the trousers and shoes, and so many triangles fewer), but the
// clothes are still grown from them and weighted by them.
const skin = man.parts.find((p) => p.name === 'skin');
const S = skin.ops, isLeg = (o) => /^(thigh|shin|foot|toe)[LR]$/.test(o.bone ?? '') || (o.bone === 'pelvis' && o.c?.[0] !== 0);
const torso = S.filter((o) => ['pelvis', 'belly', 'chest', 'neck'].includes(o.bone) && !isLeg(o));
const arms = S.filter((o) => /^(upperArm|foreArm)[LR]$/.test(o.bone ?? ''));
const neck = S.filter((o) => o.bone === 'neck');
const pelvisS = S.filter((o) => o.bone === 'pelvis' && o.c?.[0] === 0);
const seat = S.filter((o) => o.bone === 'pelvis' && o.c?.[0] !== 0);
const thighs = S.filter((o) => /^thigh[LR]$/.test(o.bone ?? ''));
const shins = S.filter((o) => /^shin[LR]$/.test(o.bone ?? ''));

// Shirt: 20 mm over the torso and the arms, rolled to just below the elbow; a round collar band
const shirt = [
  ...grow([...torso, ...arms], 0.02),
  ...mirrorOps([
    { type: 'torus', c: along(elbow, ROLL), R: 0.108, r: 0.026, rot: [0, 0, Math.PI / 2 - A], bone: 'foreArmL', k: 0.012, both: true },   // the rolled cuff
    // openings: hollow round the neck, so the grown neck is left as a collar band and not a disc across the inside
    // of the neck; the top of the collar; the sleeve ends; the hem
    ...grow(neck, 0.004).map((o) => ({ ...o, op: 'sub', bone: undefined, k: 0.01 })),
    { op: 'sub', type: 'cone', a: [0, 1.48, -0.01], b: [0, 1.75, 0.01], ra: 0.125, k: 0.015 },
    { op: 'sub', type: 'box', c: along(elbow, ROLL + 0.026 + 0.3), r: [0.3, 0.17, 0.17], rot: armRot, k: 0.01, both: true },
    { op: 'clip', n: [0, -1, 0], d: -0.795, k: 0.03 },
  ]),
];

// Trousers: 16 mm over the hips and legs. The legs are joined hard to each other (k 4 mm), so they do not melt into
// one web between the thighs that stretches flat across the crotch when he crouches; straight from the knee to the
// hem; the hips melt softly onto both
const trousers = [
  ...grow(thighs, 0.016).map((o) => ({ ...o, k: 0.004 })),
  ...mirrorOps([{ type: 'cone', a: knee, b: [ankle[0], HEM, ankle[2] + 0.01], ra: 0.128, rb: 0.108, bone: 'shinL', k: 0.004, both: true }]),
  ...grow([...shins, ...seat], 0.016),
  // the hips grown, but shallower: his own hang 10 cm below the hip joints, and that much cloth between the thighs
  // stretched into a flat pale panel across the crotch when he crouched; and only 8 mm out, well inside the shirt
  // that hangs over them (at 16 mm the two met and broke through each other at the back when he crouched)
  ...grow(pelvisS, 0.008).map((o) => ({ ...o, c: [0, 0.89, 0], r: [o.r[0], 0.14, o.r[2]] })),
  // the legs apart from the crotch down (grown, they touched down to mid-thigh, and the cloth joining them stretched
  // into a bar across the lap when he crouched)
  { op: 'sub', type: 'box', c: [0, 0.35, 0], r: [0.004, 0.36, 0.3], k: 0.012 },
  { op: 'clip', n: [0, 1, 0], d: 0.95 },
  { op: 'clip', n: [0, -1, 0], d: -HEM, k: 0.02 },
];

const shoes = mirrorOps([
  { type: 'ell', c: [0.15, 0.062, -0.032], r: [0.074, 0.062, 0.08], bone: 'footL', k: 0.03, both: true },
  { type: 'ell', c: [0.155, 0.05, 0.07], r: [0.077, 0.05, 0.1], bone: 'footL', k: 0.03, both: true },
  { type: 'ell', c: [0.157, 0.042, 0.16], r: [0.072, 0.042, 0.078], bone: 'toeL', k: 0.03, both: true },
  { op: 'clip', n: [0, -1, 0], d: 0 },
]);

// The briefcase hangs from a handle held in the right hand. `bag` is a joint of its own on the hand; in the rest pose
// the case hangs straight down from the handle (the `hang` block keeps it hanging in every pose).
const wristR = [-J.handL.at[0], J.handL.at[1], J.handL.at[2]];
const grip = [wristR[0] - dir[0] * 0.105 + 0.022, wristR[1] + dir[1] * 0.105 - 0.026, wristR[2]];   // in the curl of the fingers
const CASE = { w: 0.2, h: 0.14, t: 0.05, top: 0.07 };   // half its length (along z), half its height, half its thickness; the handle's height above it
const bagMid = [grip[0], grip[1] - CASE.top - CASE.h, grip[2]];
const bag = [
  { type: 'box', c: bagMid, r: [CASE.t, CASE.h, CASE.w], round: 0.028, bone: 'bag', k: 0.01 },
  { type: 'torus', c: [grip[0], grip[1] - 0.034, grip[2]], R: 0.045, r: 0.009, rot: [0, 0, Math.PI / 2], bone: 'bag', k: 0.008 },   // the handle
];
const clasps = [-1, 1].flatMap((sz) => [-1, 1].map((sx) => ({ type: 'box', c: [grip[0] + sx * (CASE.t + 0.002), grip[1] - CASE.top - 0.035, grip[2] + sz * 0.11], r: [0.004, 0.012, 0.016], round: 0.003, bone: 'bag', k: 0 })));

// Shirt: a fine oxford weave, a darker placket with buttons down the front, a breast pocket on the left.
const shirtCloth = (p, base) => {
  const weave = mx_noise_float(p.mul(vec3(260, 260, 260))).mul(0.035);
  const front = smoothstep(0.1, 0.16, p.z).mul(smoothstep(1.43, 1.41, p.y));
  const placket = smoothstep(0.022, 0.018, abs(p.x)).mul(front);
  const btn = smoothstep(0.009, 0.006, length(vec3(p.x, fract(p.y.mul(1 / 0.11)).sub(0.5).mul(0.11), 0))).mul(front);
  const pocket = smoothstep(0.004, 0.0015, abs(max(abs(p.x.sub(0.13)).sub(0.055), abs(p.y.sub(1.3)).sub(0.06)))).mul(front);
  const c = base.mul(float(1).add(weave)).mul(mix(float(1), float(0.88), max(placket, pocket)));
  return mix(c, vec3(0.95, 0.95, 0.92), btn);
};
// Trousers: a crease down the front of each leg, a soft even grain of noise (a noise stretched along the leg read as
// pale ribs where the cloth folds across the crotch).
const trouserCloth = (p, base) => {
  const ax = abs(p.x), crease = smoothstep(0.006, 0.0015, abs(ax.sub(0.15))).mul(smoothstep(0.05, 0.1, p.z)).mul(smoothstep(0.78, 0.7, p.y));
  return base.mul(mix(float(1), float(1.12), crease)).mul(float(1).add(mx_noise_float(p.mul(120)).mul(0.03)));
};
// Shoes: a darker sole, a welt line, laces over the instep.
const shoeCloth = (p, base) => {
  const sole = smoothstep(0.02, 0.016, p.y), welt = smoothstep(0.0035, 0.001, abs(p.y.sub(0.024)));
  const lace = smoothstep(0.004, 0.002, abs(fract(p.z.mul(1 / 0.022)).sub(0.5).mul(0.022))).mul(smoothstep(0.03, 0.02, abs(abs(p.x).sub(0.155)))).mul(smoothstep(0.075, 0.085, p.y)).mul(smoothstep(0.0, 0.03, p.z)).mul(smoothstep(0.13, 0.1, p.z));
  return mix(base.mul(mix(float(1), float(0.45), max(sole, welt))), vec3(0.3, 0.2, 0.13), lace);
};
// Case: a stitched border inset from each edge of the broad faces.
const caseCloth = (p, base) => {
  const u = abs(p.z.sub(bagMid[2])), v = abs(p.y.sub(bagMid[1]));
  const st = smoothstep(0.003, 0.0012, abs(max(u.sub(CASE.w - 0.03), v.sub(CASE.h - 0.03)))).mul(smoothstep(CASE.t - 0.01, CASE.t - 0.004, abs(p.x.sub(bagMid[0]))));
  return base.mul(mix(float(1), float(1.35), st));
};

export const manWork = {
  ...man,
  name: 'man-work',
  joints: { ...man.joints, bag: { at: grip, parent: 'handR' } },
  parts: [
    { ...skin, h: 0.009, ops: S.filter((o) => !isLeg(o) && o.bone !== 'pelvis') },   // (a little coarser than the man's 0.008, to keep Dad under 300,000 triangles)
    { name: 'shirt', h: 0.012, ops: shirt, fit: S, material: { color: 0x9cc4e6, scatter: 0.3, mottle: 0.08, mottleScale: 6, pattern: shirtCloth } },
    { name: 'trousers', h: 0.011, ops: trousers, fit: S, material: { color: 0x6c6f78, scatter: 0.15, mottle: 0.08, mottleScale: 8, pattern: trouserCloth } },
    { name: 'shoes', h: 0.0075, ops: shoes, material: { color: 0x6a3f24, mottle: 0.05, rim: 1.6, pattern: shoeCloth } },
    { name: 'bag', h: 0.009, ops: bag, material: { color: 0x4e2c1e, mottle: 0.08, mottleScale: 12, rim: 1.4, pattern: caseCloth } },
    { name: 'clasps', h: 0.003, ops: clasps, material: { color: 0xc9a050, scatter: 0, mottle: 0, rim: 2 } },
  ],
  // a weight hanging from a hand: it stays hanging whatever the hand does, swings as the hand moves, and stands on
  // the floor when the hand comes down low enough (hang.mjs)
  hang: [{ bone: 'bag', hand: 'R', length: CASE.top + CASE.h, drop: CASE.top + 2 * CASE.h, z: 0.55, stiff: 1.6, clear: 0.155 + CASE.t + 0.03, reach: CASE.w + 0.1 }],
};
