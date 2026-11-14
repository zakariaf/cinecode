// A character (a person, an animal, a creature) built from a description. The format is
// written down field by field in docs/scene3d-characters.md; in short:
//   joints:  the skeleton in its rest pose (standard names; left side written, right mirrored)
//   parts:   per material, a list of simple solids that melt together, each tied to a bone
//   hands:   a hand with finger bones on each wrist, from three sizes
//   hair, beard: a shell grown on the skull and cut along a line, plus named locks
//   face:    eyes (white, iris, pupil, lids, gaze), brows, a mouth with mixable shapes
//   loose:   weights that follow late on springs (belly, bun, skirt, tail, ear)
//   attach:  small rigid pieces fixed to a bone (a nose)
// buildCharacter() meshes every part, weights it to the bones, and returns a group
// that can be added to a scene. Posing is separate (biped.mjs, quadruped.mjs).
import * as THREE from 'three/webgpu';
import { uniform, vec2, vec3, vec4, float, color, mix, smoothstep, length, max, min, abs, clamp, pow, normalize, mx_noise_float, modelWorldMatrixInverse, cameraPosition, normalLocal, transformNormalToView } from 'three/tsl';
import { meshShape, skinShape, cached, compileShape, hitSurface } from './sdf.mjs';
import { paint, flat } from './materials.mjs';

const SIDES = [['L', 1], ['R', -1]];
const lerp = (a, b, u) => a + (b - a) * u;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// The joints every body of a kind must have (and their right-hand twins), so that motion
// written for one character works on all.
export const STANDARD = {
  biped: ['pelvis', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'thighL', 'shinL', 'footL', 'toeL'],
  quadruped: ['hips', 'spine', 'chest', 'neck', 'head', 'fUpperL', 'fLowerL', 'fPawL', 'hThighL', 'hShinL', 'hFootL', 'tail1'],
};

// Helpers for writing descriptions: author the left side (+x), mirror to the right.
const flipName = (n) => n && n.endsWith('L') ? n.slice(0, -1) + 'R' : n;
export function mirrorJoints(joints) {
  const out = {};
  for (const [name, j] of Object.entries(joints)) {
    out[name] = j;
    if (name.endsWith('L')) out[flipName(name)] = { ...j, at: [-j.at[0], j.at[1], j.at[2]], parent: flipName(j.parent), ...(j.near && { near: j.near.map(flipName) }) };
  }
  return out;
}
export function mirrorOps(ops) {
  const out = [];
  for (const o of ops) {
    const { both, ...s } = o;
    out.push(s);
    if (!both) continue;
    const m = { ...s, bone: flipName(s.bone) };
    if (s.c) m.c = [-s.c[0], s.c[1], s.c[2]];
    if (s.a) { m.a = [-s.a[0], s.a[1], s.a[2]]; m.b = [-s.b[0], s.b[1], s.b[2]]; }
    if (s.rot) m.rot = [s.rot[0], -(s.rot[1] ?? 0), -(s.rot[2] ?? 0)];
    if (s.n) m.n = [-s.n[0], s.n[1], s.n[2]];
    out.push(m);
  }
  return out;
}

// Clothes: the skin's solids `ops`, each grown by d metres (sub and clip entries dropped: cut the garment's own
// openings after). Give the garment's part `fit: <the skin's solids>` so it is weighted as the skin under it.
const fat = (o, d) => {
  if (o.type === 'ell') return { ...o, r: o.r.map((r) => r + d) };
  if (o.type === 'cone') return { ...o, ra: o.ra + d, rb: (o.rb ?? o.ra) + d };
  if (o.type === 'box') return { ...o, r: o.r.map((r) => r + d), round: (o.round ?? 0) + d };
  if (o.type === 'torus') return { ...o, r: o.r + d };
  throw new Error(`grow: no solid type "${o.type}"`);
};
export const grow = (ops, d) => ops.filter((o) => (o.op ?? 'add') === 'add').map((o) => fat(o, d));

// Scale a list of blobs (or attachments) about a point: used to restyle proportions
// (a bigger head, say) without rewriting every number.
export function scaleOps(ops, pivot, s) {
  const sp = (p) => p.map((v, i) => pivot[i] + (v - pivot[i]) * s);
  return ops.map((o) => {
    const m = { ...o };
    if (o.c) m.c = sp(o.c);
    if (o.at) m.at = sp(o.at);
    if (o.a) { m.a = sp(o.a); m.b = sp(o.b); }
    if (o.r) m.r = o.r.map((v) => v * s);
    if (o.scale) m.scale = o.scale.map((v) => v * s);
    if (o.ra !== undefined) m.ra = o.ra * s;
    if (o.rb !== undefined) m.rb = o.rb * s;
    if (o.round !== undefined) m.round = o.round * s;
    if (o.k !== undefined) m.k = o.k * s;
    if (o.op === 'clip') { const np = o.n[0] * pivot[0] + o.n[1] * pivot[1] + o.n[2] * pivot[2]; m.d = np + (o.d - np) * s; }
    return m;
  });
}

// Five toes for a bare left foot (give the list to mirrorOps): `at` is the middle of the big toe, the
// row runs outward over `width` and curves back, r is the big toe's radius.
export const toes = ({ at, width, r, bone = 'toeL', tint }) => [0, 1, 2, 3, 4].map((i) => {
  const s = 1 - 0.09 * i;
  return { type: 'ell', c: [at[0] + width * i / 4, at[1] - r * 0.1 * i, at[2] - width * 0.3 * (i / 4) ** 2], r: [r * s, r * s * 0.9, r * s * 1.3], bone, k: r * 0.45, tint, both: true };
});

// ---------------------------------------------------------------------------------
// The blocks of a description that stand for many joints and solids are written out here.

// Fingers across the hand from the thumb side: name, place across (in hand widths), length (in middle fingers).
const FINGERS = [['index', 0.36, 0.9], ['middle', 0.12, 1], ['ring', -0.12, 0.93], ['pinky', -0.36, 0.74]];
export const FINGER_NAMES = FINGERS.map((f) => f[0]);

// hands: { length (wrist to the tip of the middle finger), width (across the knuckles), thick, segments (bones
// per finger, 2 or 3), tint, h }. The hand lies along the forearm with the thumb toward +z. Adds the finger
// joints, and a part "hands" in the material of the part "skin", joined to the arm where the skin is at the wrist.
function addHands(d, joints, parts) {
  const H = d.hands, L = H.length, W = H.width, T = H.thick ?? W * 0.48, segs = H.segments ?? 2, r = W * 0.118;
  const fArm = compileShape(parts.find((p) => p.name === 'skin').ops).f;
  const cuts = segs === 3 ? [0, 0.42, 0.72, 1] : [0, 0.52, 1];
  const ops = [];
  for (const [s] of SIDES) {
    const wr = joints['hand' + s].at, a = unit(sub(wr, joints['foreArm' + s].at));
    const P = (along, across = 0) => [wr[0] + a[0] * along, wr[1] + a[1] * along, wr[2] + a[2] * along + across];   // metres along the hand, metres across it
    const rot = [0, 0, Math.atan2(a[1], a[0])];
    const wristR = -fArm(...wr);                                                                                      // how deep the wrist joint lies in the skin
    if (!(wristR > 0)) throw new Error(`character "${d.name}": hands: the part "skin" does not reach the wrist joint "hand${s}" (the forearm must end there)`);
    ops.push({ type: 'cone', a: P(-0.5 * L), b: P(0), ra: wristR * 0.97, bone: 'foreArm' + s, k: 0.2 * W });            // a stub of forearm under the arm's own skin, so the two meshes join without a gap
    ops.push({ type: 'box', c: P(0.29 * L), r: [0.31 * L, T / 2, W / 2], round: Math.min(T / 2, 0.22 * W) * 0.95, rot, bone: 'hand' + s, k: 0.22 * W });
    ops.push({ type: 'ell', c: P(0.25 * L, 0.36 * W), r: [0.2 * L, T * 0.52, 0.3 * W], rot, bone: 'hand' + s, k: 0.18 * W });   // the heel of the thumb
    for (const [f, across, len] of FINGERS) {
      const k0 = (0.53 - 0.05 * Math.abs(across / 0.36) ** 2) * L, l = 0.47 * L * len;      // the knuckles lie on a shallow arc
      for (let i = 1; i <= segs; i++) {
        const u0 = cuts[i - 1], u1 = cuts[i];
        joints[f + i + s] = { at: P(k0 + l * u0, across * W), parent: i === 1 ? 'hand' + s : f + (i - 1) + s };
        ops.push({ type: 'cone', a: P(k0 + l * u0, across * W), b: P(k0 + l * u1, across * W), ra: r * (1 - 0.14 * u0), rb: r * (1 - 0.14 * u1), bone: f + i + s, k: 0.07 * W, tint: H.tint });
      }
    }
    const T0 = [0.2 * L, 0.44 * W], lt = 0.4 * L, PT = (u) => P(T0[0] + 0.68 * lt * u, T0[1] + 0.73 * lt * u);       // the thumb stands out forward of the palm
    joints['thumb1' + s] = { at: PT(0), parent: 'hand' + s };
    joints['thumb2' + s] = { at: PT(0.55), parent: 'thumb1' + s };
    ops.push({ type: 'cone', a: PT(0), b: PT(0.55), ra: r * 1.35, rb: r * 1.2, bone: 'thumb1' + s, k: 0.12 * W, tint: H.tint });
    ops.push({ type: 'cone', a: PT(0.55), b: PT(1), ra: r * 1.2, rb: r * 1.05, bone: 'thumb2' + s, k: 0.07 * W, tint: H.tint });
  }
  parts.push({ name: 'hands', h: H.h ?? L / 46, ops, material: H.material ?? parts.find((p) => p.name === 'skin').material });
}

// hair or beard: { thick, line, edge, ridges: { n, amp }, locks: [...], material, h }. A shell grown `thick`
// out of the skull (the solids of the part "skin" marked skull: true), kept above the line (hair) or below it
// (a beard), with the locks added. Directions on the head are [compass, height] in degrees from the centre of
// the first skull solid: compass 0 is the front, 90 the character's left, 180 the back; height 0 is level,
// 90 the crown. A lock with a spring gets a bone of its own name on the head and joins the loose parts.
function addHair(kind, d, joints, parts, loose) {
  const S = d[kind], skull = parts.find((p) => p.name === 'skin').ops.filter((o) => o.skull);
  if (!skull.length) throw new Error(`character "${d.name}": ${kind} needs the skull: mark the head's solids in the part "skin" with skull: true`);
  const bone = skull[0].bone, c = skull[0].c, f = compileShape(skull).f;
  const dirOf = (deg, elev) => { const a = deg * Math.PI / 180, e = elev * Math.PI / 180; return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; };
  const onHead = (deg, elev, out = 0) => {
    const u = dirOf(deg, elev), hit = hitSurface(f, [c[0] + u[0], c[1] + u[1], c[2] + u[2]], u.map((v) => -v), 2);
    if (!hit) throw new Error(`character "${d.name}": ${kind}: nothing of the skull lies toward [${deg}, ${elev}]`);
    return hit.p.map((v, i) => v + u[i] * out);
  };
  const ops = skull.map(({ tint, skull: _, ...o }) => ({ ...o, grow: S.thick }));
  ops.push({ op: 'line', c, pts: S.line, side: kind === 'beard' ? 'below' : 'above', k: S.edge ?? 0.012 });
  const ties = [], twists = [];
  for (const l of S.locks ?? []) for (const sx of l.both ? [1, -1] : [1]) {
    const name = l.name + (l.both ? (sx > 0 ? 'L' : 'R') : ''), at = [l.at[0] * sx, l.at[1]];
    const b = l.spring ? name : bone;
    if (l.spring) { joints[name] = { at: onHead(...at), parent: bone }; loose.push({ bone: name, ...l.spring }); }
    if (l.bun) {
      // a ball of hair standing on the head, with a tie round its foot
      const u = dirOf(...at), mid = onHead(...at, l.out ?? l.r * 0.55);
      ops.push({ type: 'ell', c: mid, r: [l.r, l.r * 0.94, l.r], bone: b, k: 0.006, tint: l.tint });
      twists.push({ op: 'ridge', c: mid, axis: u, r: l.r, n: 13, amp: 1.6 * (S.ridges?.amp ?? 0.0012) });   // the hair wound round it, not the strands of the head
      if (l.tie) ties.push({ type: 'torus', c: onHead(...at, S.thick + l.r * 0.05), R: l.r * 0.56, r: l.r * 0.18, rot: [Math.asin(u[2]), 0, Math.atan2(-u[0], u[1])], bone: b, k: 0.004, tie: l.tie });
    } else {
      // a tapered lock lying on the head from its root to its tip; `out` lifts the tip off the head
      const to = [l.to[0] * sx, l.to[1]], out = l.out ?? 0, lift = S.thick - l.r * 0.35;
      const p0 = onHead(...at, lift), p1 = onHead((at[0] + to[0]) / 2, (at[1] + to[1]) / 2, lift + out * 0.45), p2 = onHead(...to, lift + out);
      ops.push({ type: 'cone', a: p0, b: p1, ra: l.r, rb: l.r * 0.92, bone: b, k: l.r * 0.3, tint: l.tint });
      ops.push({ type: 'cone', a: p1, b: p2, ra: l.r * 0.92, rb: l.r * (l.tip ?? 0.6), bone: b, k: l.r * 0.3, tint: l.tint });
    }
  }
  if (S.ridges) ops.push({ op: 'ridge', c, n: S.ridges.n, amp: S.ridges.amp });
  ops.push(...twists);
  // dark, with fine lighter streaks, so the mass reads as hair. keepHue: the fills light it by their strength alone and
  // darken it by its own darkness far less (materials.mjs), and the streaks and the sun's rim are milder: a dark paint
  // lit the usual way went near black in a room (fill light) and mid brown with bright streaks in the sun (direct
  // light and rim), so the same hair read as two colours (round 3)
  const streaks = (p, base) => base.mul(mix(float(0.86), float(1.22), mx_noise_float(p.mul(vec3(55, 9, 55))).mul(0.5).add(0.5)));
  // (sun 0.6: hair takes 0.6 of the direct light, so the sun lifts it less above the room's value; a dark brown read
  // near black indoors and chestnut in the garden, round 3)
  parts.push({ name: kind, h: S.h ?? 0.005, ops, material: { scatter: 0, rim: 1.3, mottle: 0.06, keepHue: true, sun: 0.6, pattern: streaks, ...S.material } });
  if (ties.length) parts.push({ name: kind + 'Ties', h: 0.003, ops: ties.map(({ tie, ...o }) => o), material: { color: ties[0].tie, mottle: 0.04 } });
}

function expand(d) {
  const joints = { ...d.joints }, parts = d.parts.map((p) => ({ ...p })), loose = [...(d.loose ?? [])];
  const fail = (msg) => { throw new Error(`character "${d.name}": ${msg}`); };
  for (const n of STANDARD[d.kind] ?? fail(`kind must be "biped" or "quadruped", not ${JSON.stringify(d.kind)}`)) {
    for (const m of [n, flipName(n)]) if (!joints[m]) fail(`a ${d.kind} needs the joint "${m}"`);
  }
  if ((d.hands || d.hair || d.beard || d.face) && !parts.some((p) => p.name === 'skin')) fail('hands, hair, beard and face need a part named "skin" (the bare body)');
  if (d.hands) addHands(d, joints, parts);
  for (const kind of ['hair', 'beard']) if (d[kind]) addHair(kind, d, joints, parts, loose);
  // a joint marked bend gets a helper that turns half-way between it and its parent (see applyWorld)
  for (const [n, j] of Object.entries(joints)) if (j.bend) joints[n + '.bend'] = { at: j.at, parent: j.parent, half: n, swell: j.bend === true ? 0.35 : j.bend };
  for (const [n, j] of Object.entries(joints)) {
    if (j.parent && !joints[j.parent]) fail(`joint "${n}" has the parent "${j.parent}", which is not a joint`);
    for (const o of j.near ?? []) if (!joints[o]) fail(`joint "${n}" is near "${o}", which is not a joint`);
  }
  for (const p of parts) p.ops.forEach((o, i) => {
    const add = (o.op ?? 'add') === 'add';
    if (add && !o.bone) fail(`solid ${i} of part "${p.name}" has no bone`);
    if (o.bone && !joints[o.bone]) fail(`solid ${i} of part "${p.name}" is tied to "${o.bone}", which is not a joint (joints: ${Object.keys(joints).filter((n) => !n.includes('.')).join(' ')})`);
  });
  for (const l of loose) if (!joints[l.bone]) fail(`loose part "${l.bone}" is not a joint`);
  return { ...d, joints, parts, loose };
}

// ---------------------------------------------------------------------------------
// The face. Eyes are balls set into the head whose colour is a function of the place on the ball: white, iris,
// pupil, two catch lights, and the lids painted over them in the skin's colour, so a lid can close to any
// height. Brows are small solids that slide and tilt. The mouth is painted on the skin (and on a beard): its
// outline is two curves between the corners, with teeth along the top and a tongue at the bottom.

// Mouth shapes, in half mouth-widths: a half the width, lift how far the corners rise above the middle,
// up / down how far the lips part above and below the middle, round 0 pointed corners .. 1 an oval,
// line the thickness of the lip line.
export const MOUTHS = {
  rest:   { a: 1.0, lift: 0.06, up: 0, down: 0, round: 0, line: 0.055 },
  open:   { a: 0.85, lift: 0, up: 0.2, down: 0.75, round: 0.5, line: 0.055 },      // "ah"
  wide:   { a: 1.3, lift: 0.1, up: 0.16, down: 0.3, round: 0.2, line: 0.055 },     // "ee"
  round:  { a: 0.42, lift: 0, up: 0.34, down: 0.4, round: 1, line: 0.07 },         // "oo"
  smile:  { a: 1.3, lift: 0.4, up: 0, down: 0, round: 0, line: 0.055 },
  frown:  { a: 0.95, lift: -0.36, up: 0, down: 0, round: 0, line: 0.055 },
  closed: { a: 0.8, lift: 0, up: 0, down: 0, round: 0, line: 0.1 },                // lips pressed: m, b, p
};
// Expressions: numbers over the face controls. face.expr = { happy: 0.8 } moves every control it names
// that far toward its number.
export const EXPRESSIONS = {
  happy:     { squint: 0.4, browUp: 0.35, mouth: { smile: 1, open: 0.4 } },
  worried:   { wide: 0.25, browUp: 0.55, browTilt: -0.6, mouth: { frown: 0.6 } },
  surprised: { wide: 1, browUp: 1, mouth: { round: 0.8, open: 0.35 } },
  sad:       { blink: 0.3, browUp: 0.15, browTilt: -0.8, gaze: [0, -0.6], mouth: { frown: 1 } },
  sleepy:    { blink: 0.65, browUp: -0.3, mouth: { open: 0.08 } },
  angry:     { squint: 0.3, browUp: -0.55, browTilt: 0.8, mouth: { frown: 0.7, closed: 0.6 } },
  laugh:     { squint: 0.7, browUp: 0.45, mouth: { smile: 0.9, open: 0.8 } },   // (the gesture "laugh": performer.mjs)
};

const below = (edge, x, aa) => float(1).sub(smoothstep(float(edge).sub(aa), float(edge).add(aa), x));   // 1 where x is under the edge

function eyePaint(U, e) {
  const white = color(e.white ?? 0xf8f2e8), lid = color(e.lid), lash = color(e.lash ?? 0x2a1c1c), iris = color(e.iris ?? 0x4e3020), light = color(e.irisLight ?? 0x96603a), pupil = color(0x1a110f);
  const irisR = e.irisSize ?? 0.6, pupilR = irisR * 0.56, slit = e.pupil === 'slit' ? 3.2 : 1, lashW = e.lashWidth ?? 0.12, aa = 0.03;
  return (p) => {
    const x = p.x, y = p.y;
    // seen from the side, the iris (a disc on the front of the ball) would turn edge-on and the eye read as a blank
    // white: like a drawn profile, it slides toward the camera as the view leaves the front (by 0.03 at three-quarter, 0.25 in profile)
    const side = clamp(normalize(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz).x.sub(U.ahead), -1, 1);
    const gz = U.gaze.add(vec2(side.mul(side).mul(side).mul(0.26), 0));
    const lidEdge = U.lidY.add(U.curve.mul(x).mul(x));
    // the lower lid: it rises with a squint, and comes up to the lashes when the eye shuts
    const lowEdge = min(max(U.lowY.add(U.lowCurve.mul(x).mul(x)), mix(float(-3), lidEdge.sub(0.1), U.blink)), lidEdge.sub(lashW * 0.6));
    const d = vec2(x, y).sub(gz), r = length(d), rp = length(vec2(d.x.mul(slit), d.y));
    let c = mix(white, lid, clamp(y.sub(lidEdge).add(0.34).div(0.22), 0, 1).mul(0.35));              // the lid shades the top of the white
    c = mix(c, mix(iris, pupil, 0.6), below(irisR + 0.05, r, aa));                                    // a dark ring round the iris
    const pool = clamp(d.y.negate().div(irisR).mul(0.9).add(0.25), 0, 1).mul(clamp(r.div(irisR).sub(0.35).mul(2.2), 0, 1));
    c = mix(c, mix(iris, light, pool), below(irisR, r, aa));                                          // the iris is lighter low down, where the light pools
    c = mix(c, pupil, below(pupilR, rp, aa));
    c = mix(c, vec3(1.6), max(below(0.1, length(d.sub(vec2(0.16, 0.17))), aa), below(0.05, length(d.add(vec2(0.14, 0.15))), aa)));   // catch lights
    c = mix(c, lash, smoothstep(lidEdge.sub(lashW + aa), lidEdge.sub(lashW - aa), y));                // the lash line under the lid
    c = mix(c, lid, smoothstep(lidEdge.sub(aa), lidEdge.add(aa), y));
    c = mix(c, lid, float(1).sub(smoothstep(lowEdge.sub(aa), lowEdge.add(aa), y)));
    return mix(lid, c, smoothstep(0.0, 0.12, p.z));                                                   // the back of the ball is lid
  };
}

function mouthPaint(U, m, at) {
  const W = m.width / 2, inside = color(m.color ?? 0x5a1c22), lip = color(m.lip ?? 0x9a4a44), teeth = color(m.teeth || 0xfff4e4), tongue = color(m.tongue ?? 0xd9706c), aa = 0.035;
  return (p, base) => {
    // Seen side on, a mouth painted across the front of a round face lies on the outline and vanishes. Like a drawn
    // profile, the half toward the camera is measured back along the side of the head instead of across it as the view
    // leaves the front (none from the front, all of it in true profile), so its corner reaches back round the cheek by
    // its half width over U.depth (2 half widths, about a fifth of a round head), and its line thickens: the lip line,
    // the corner and an opening read side on. (side: where the camera is, from the mouth, in the head's own frame; + on
    // the character's left. U.headInv follows the head bone every frame.)
    const cam = U.headInv.mul(vec4(cameraPosition, 1)).xyz.add(U.head), side = normalize(cam.sub(vec3(...at))).x;
    const pr = smoothstep(0.75, 0.97, abs(side)), ux = p.x.sub(at[0]).div(W), near = smoothstep(-0.2, 0.2, ux.mul(side));
    const back = float(at[2]).sub(p.z).div(W).mul(U.depth).mul(side.sign());
    const u = mix(ux, back, near.mul(pr)), v = p.y.sub(at[1]).div(W);
    const s = clamp(u.div(U.a), -1, 1), bow = pow(float(1).sub(s.mul(s)), U.e), mid = U.lift.mul(s).mul(s);
    const top = mid.add(U.up.mul(bow)), bot = mid.sub(U.down.mul(bow)), gap = top.sub(bot);
    const across = float(1).sub(smoothstep(U.a.sub(aa), U.a.add(aa), abs(u)));
    const front = smoothstep(float(at[2] - 2.2 * W).sub(pr.mul(2.4 * W)), float(at[2] - 1.2 * W).sub(pr.mul(2.4 * W)), p.z);   // only the front of the head
    const open = float(1).sub(smoothstep(top.sub(aa), top.add(aa), v)).mul(smoothstep(bot.sub(aa), bot.add(aa), v)).mul(smoothstep(0.02, 0.1, gap));
    let c = mix(inside, tongue, float(1).sub(smoothstep(0.3, 0.42, v.sub(bot).div(max(gap, 0.01)).add(s.mul(s).mul(0.5)))));
    c = mix(c, teeth, smoothstep(top.sub(0.24).sub(aa), top.sub(0.24).add(aa), v).mul(m.teeth === false ? 0 : 1));
    const lw = U.lw.mul(float(1).add(pr.mul(0.9)));
    // (line: false paints only the opening: a cat's shut mouth is no line at all)
    const line = m.line === false ? float(0) : float(1).sub(smoothstep(lw.sub(aa), lw.add(aa), min(abs(v.sub(top)), abs(v.sub(bot)))));
    return mix(base, mix(mix(base, lip, line), c, open), across.mul(front).mul(max(line, open)));
  };
}

function buildFace(desc, bones, rest, shapeOf) {
  const F = desc.face;
  if (!F) return { extras: {}, set() {}, paintOn: [] };
  const fSkin = shapeOf('skin');
  const fail = (what, x, y) => { throw new Error(`character "${desc.name}": face.${what}.at [${x}, ${y}] is not in front of the skin of the head`); };
  // where a point of the face at (x, y) lies on the skin, coming from the front
  const onFace = (f, x, y) => hitSurface(f, [x, y, 5], [0, 0, -1], 10);
  const extras = {}, eyes = [], brows = [];
  const holder = (bone, p, n, soften) => {
    const g = new THREE.Group();
    g.position.set(...p).sub(rest[bone]);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0] * soften, n[1] * soften, n[2] * soften + 1 - soften).normalize());
    bones[bone].add(g);
    return g;
  };
  const bone = F.bone ?? 'head';
  for (const [s, sx] of SIDES) {
    if (F.eyes) {
      const e = F.eyes, w = e.size[0] / 2, h = e.size[1] / 2, depth = w * 0.85;     // size is the eye's full width and height
      const hit = onFace(fSkin, sx * e.at[0], e.at[1]) ?? fail('eyes', sx * e.at[0], e.at[1]);
      const g = holder(bone, hit.p.map((v, i) => v - hit.n[i] * depth * 0.5), hit.n, 0.75);       // a round ball, half of it out of the head
      const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion.clone().invert()).divide(new THREE.Vector3(w, h, depth)).normalize();   // straight ahead of the head, on the unit ball
      const U = { gaze: uniform(new THREE.Vector2()), lidY: uniform(0.6), curve: uniform(-0.25), lowY: uniform(-1), lowCurve: uniform(0.3), blink: uniform(0), ahead: float(ahead.x) };
      const mat = paint({ color: 0xffffff, pattern: eyePaint(U, { lid: desc.parts.find((p) => p.name === 'skin').material.color, ...e }), mottle: 0, brush: 0, scatter: 0.1, rim: 0 });
      // lit as if it lay on the face more than as a ball standing out of it: the lids are painted on the ball, and lit as
      // a ball they came out paler than the skin round them under a high light and darker under a low one, discs over
      // the eyes (round 3)
      mat.normalNode = transformNormalToView(normalize(mix(normalLocal, vec3(0, 0, 1), 0.7)));
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat);
      m.scale.set(w, h, depth); m.receiveShadow = true; g.add(m);
      extras['eye' + s] = m;
      // the ball is turned outward with the head's curve; bring the iris back in so the eye looks ahead
      eyes.push({ U, toe: -Math.sin(Math.atan2(hit.n[0], hit.n[2]) * 0.75) * 0.5, open: e.open ?? 0.62 });
    }
    if (F.brows) {
      const b = F.brows, [len, thick] = b.size;
      const hit = onFace(fSkin, sx * b.at[0], b.at[1]) ?? fail('brows', sx * b.at[0], b.at[1]);
      // a flat bar bent onto the brow: each point is pushed back as far as the head falls away under it, so the
      // brow lies on the forehead from every side instead of standing off it as a straight oval
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...hit.n));
      const tx = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ty = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const under = (u, v) => {     // how far the skin lies in front of (+) or behind (-) the brow's plane at (u, v)
        const o = hit.p.map((p, i) => p + tx.getComponent(i) * u + ty.getComponent(i) * v + hit.n[i] * 0.1);
        const h2 = hitSurface(fSkin, o, hit.n.map((n) => -n), 0.3);
        return h2 ? 0.1 - Math.hypot(h2.p[0] - o[0], h2.p[1] - o[1], h2.p[2] - o[2]) : 0;
      };
      const geo = new THREE.SphereGeometry(1, 24, 16), P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) { const u = P.getX(i) * len / 2, v = P.getY(i) * thick / 2; P.setXYZ(i, u, v, P.getZ(i) * thick * 0.3 + under(u, v)); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, paint({ color: b.color ?? 0x2a1c1e, scatter: 0, mottle: 0 }));
      m.receiveShadow = true;
      const g = holder(bone, hit.p.map((v, i) => v + hit.n[i] * thick * 0.3), hit.n, 1); g.add(m);       // standing a little proud, as a brow ridge does
      extras['brow' + s] = m;
      const rise = thick * 1.6;
      brows.push({ m, sx, rise, tilt: (b.tilt ?? 0), back: [under(0, rise), under(0, -0.6 * rise)] });   // a frown pulls the brow down less far than surprise lifts it
    }
  }
  let mouth = null;
  const paintOn = [];
  if (F.mouth) {
    const M = F.mouth, on = M.on ?? ['skin'];
    const z = Math.max(...on.map((n) => (onFace(shapeOf(n), M.at[0], M.at[1]) ?? fail('mouth', ...M.at)).p[2]));
    const headInv = uniform(new THREE.Matrix4()).onObjectUpdate(() => { headInv.value.copy(bones[bone].matrixWorld).invert(); });
    const U = { a: uniform(1), lift: uniform(0), up: uniform(0), down: uniform(0), e: uniform(1), lw: uniform(0.05), headInv, head: vec3(...rest[bone].toArray()), depth: float(M.depth ?? 0.5) };
    mouth = { U };
    const fn = mouthPaint(U, M, [M.at[0], M.at[1], z]);
    for (const n of on) paintOn.push([n, fn]);
  }
  // controls: { gaze: [x, y] (-1..1; x toward the character's left, y up), blink, squint, wide, browUp, browTilt (+ angry, - worried),
  //             mouth: { open, wide, round, smile, frown, closed } (each 0..1, mixed), expr: { happy, worried, ... } }
  function set(c = {}) {
    let blink = c.blink ?? 0, squint = c.squint ?? 0, wide = c.wide ?? 0, browUp = c.browUp ?? 0, browTilt = c.browTilt ?? 0, gaze = c.gaze ?? [0, 0];
    const said = typeof c.mouth === 'number' ? Math.max(0, c.mouth - 0.15) / 0.85 : 0, shapes = typeof c.mouth === 'number' ? {} : { ...c.mouth };   // (a number is the old single control: 0.15 shut .. 1 wide open, laid over the expression: speech)
    for (const [name, w] of Object.entries(c.expr ?? {})) {
      const E = EXPRESSIONS[name];
      if (!E) throw new Error(`no expression "${name}" (there are: ${Object.keys(EXPRESSIONS).join(', ')})`);
      if (E.blink !== undefined) blink = lerp(blink, E.blink, w);
      if (E.squint !== undefined) squint = lerp(squint, E.squint, w);
      if (E.wide !== undefined) wide = lerp(wide, E.wide, w);
      if (E.browUp !== undefined) browUp = lerp(browUp, E.browUp, w);
      if (E.browTilt !== undefined) browTilt = lerp(browTilt, E.browTilt, w);
      if (E.gaze) gaze = [lerp(gaze[0], E.gaze[0], w), lerp(gaze[1], E.gaze[1], w)];
      for (const k of Object.keys(MOUTHS)) if (k !== 'rest' && (E.mouth?.[k] !== undefined || shapes[k] !== undefined)) shapes[k] = lerp(shapes[k] ?? 0, E.mouth?.[k] ?? 0, w);
    }
    if (said > 0) shapes.open = Math.max(shapes.open ?? 0, said);
    eyes.forEach(({ U, toe, open }) => {
      U.gaze.value.set(gaze[0] * 0.34 + toe, gaze[1] * 0.26 - 0.03);
      // the lids follow the eye up and down, so a look up or down keeps the iris in the opening
      U.lidY.value = lerp(open + 0.25 * wide + 0.22 * gaze[1], -0.32, blink); U.curve.value = lerp(-0.25, 0.28, blink);
      U.lowY.value = lerp(-1 - 0.2 * wide + 0.15 * gaze[1], open + 0.1, squint); U.lowCurve.value = lerp(0.3, -0.25, squint);
      U.blink.value = blink;
    });
    for (const b of brows) { b.m.position.set(0, browUp * b.rise * (browUp > 0 ? 1 : 0.6), Math.abs(browUp) * b.back[browUp > 0 ? 0 : 1]); b.m.rotation.z = b.sx * (browTilt * 0.5 - b.tilt); }   // up or down the brow, it slides along the head
    if (mouth) {
      const v = { ...MOUTHS.rest };
      for (const [k, w] of Object.entries(shapes)) {
        if (!MOUTHS[k]) throw new Error(`no mouth shape "${k}" (there are: ${Object.keys(MOUTHS).join(', ')})`);
        for (const q in v) v[q] += w * (MOUTHS[k][q] - MOUTHS.rest[q]);
      }
      const U = mouth.U;
      U.a.value = Math.max(v.a, 0.1); U.lift.value = v.lift; U.up.value = Math.max(v.up, 0); U.down.value = Math.max(v.down, 0);
      U.e.value = lerp(1, 0.5, Math.min(Math.max(v.round, 0), 1)); U.lw.value = v.line;
    }
  }
  set();
  return { extras, set, paintOn };
}

// ---------------------------------------------------------------------------------
export function buildCharacter(desc0) {
  const desc = expand(desc0);
  const group = new THREE.Group();
  group.name = desc.name;
  const joints = desc.joints;
  const names = Object.keys(joints);
  const bones = {}, rest = {};
  for (const n of names) { bones[n] = new THREE.Bone(); bones[n].name = n; rest[n] = new THREE.Vector3(...joints[n].at); }
  const near = new Map(names.map((n) => [n, new Set()]));
  for (const n of names) {
    const p = joints[n].parent;
    if (p) {
      bones[p].add(bones[n]); bones[n].position.copy(rest[n]).sub(rest[p]);
      near.get(n).add(p); near.get(p).add(n);
    } else { group.add(bones[n]); bones[n].position.copy(rest[n]); }
    // extra neighbours: bones that are not parent and child but share skin (a belly and the chest above it)
    for (const o of joints[n].near ?? []) { near.get(n).add(o); near.get(o).add(n); }
  }
  const boneList = names.map((n) => bones[n]);
  const boneIndex = new Map(names.map((n, i) => [n, i]));
  const inverses = names.map((n) => new THREE.Matrix4().makeTranslation(-rest[n].x, -rest[n].y, -rest[n].z));
  const skeleton = new THREE.Skeleton(boneList, inverses);
  const helpers = names.filter((n) => joints[n].half).map((n) => ({ name: n, a: joints[n].parent, b: joints[n].half }));

  const shapeOf = (name) => {
    const p = desc.parts.find((q) => q.name === name);
    if (!p) throw new Error(`character "${desc.name}": the face needs a part "${name}"`);
    return compileShape(p.ops).f;
  };
  const face = buildFace(desc, bones, rest, shapeOf);

  const meshes = {}, triangles = {}, skinSoft = desc.parts.find((q) => q.name === 'skin')?.soft;
  for (const part of desc.parts) {
    const h = part.h ?? 0.01;
    const data = cached({ v: 7, ops: part.ops, h, soft: part.soft, joints, ...(part.fit && { fit: part.fit, skinSoft }) }, () => {
      const m = meshShape(part.ops, h);
      const s = skinShape(m, boneIndex, near, { soft: part.soft, helpers });
      // a garment (`fit`: the skin's solids) is weighted as the skin is at the nearest point under it, so it keeps its
      // distance from the skin however the body bends (weighted from its own solids, the cloth among the other leg's or
      // the sleeve's came apart from the skin under it: the thighs came out through the shorts sitting)
      if (part.fit) {
        const shape = compileShape(part.fit), f = shape.f, P = m.position, at = new Float32Array(P.length), e = 1e-4;
        for (let i = 0; i < P.length; i += 3) {
          let x = P[i], y = P[i + 1], z = P[i + 2];
          for (let k = 0; k < 3; k++) {   // (onto the skin's surface, three Newton steps)
            const d = f(x, y, z), gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), g = Math.hypot(gx, gy, gz) || 1;
            x -= d * gx / g; y -= d * gy / g; z -= d * gz / g;
          }
          at[i] = x; at[i + 1] = y; at[i + 2] = z;
        }
        const w = skinShape({ position: at, shape }, boneIndex, near, { soft: skinSoft, helpers });
        s.skinIndex = w.skinIndex; s.skinWeight = w.skinWeight;
      }
      return { position: m.position, normal: m.normal, index: m.index, ...s };
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('rest', new THREE.BufferAttribute(data.position.slice(), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    // the mouth is painted over whatever pattern the part has
    const own = part.material.pattern, onFace = face.paintOn.filter(([n]) => n === part.name).map(([, fn]) => fn);
    const pattern = onFace.length ? (p, base) => onFace.reduce((c, fn) => fn(p, c), own ? own(p, base) : base) : own;
    const mesh = new THREE.SkinnedMesh(geo, paint({ vertexColors: true, rest: true, ...part.material, pattern }));
    mesh.name = desc.name + ':' + part.name;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skeleton, new THREE.Matrix4());
    group.add(mesh);
    meshes[part.name] = mesh; triangles[part.name] = data.index.length / 3;
  }

  // small rigid extras
  const extras = { ...face.extras };
  for (const a of desc.attach ?? []) {
    // 'sphere': a ball to be scaled
    const geo = a.geo === 'sphere' ? new THREE.SphereGeometry(1, 32, 24) : a.geo;
    const mat = a.flat ? flat(a.flat) : paint({ mottle: 0, ...a.material });
    const m = new THREE.Mesh(geo, mat);
    const holder = new THREE.Group(); // holder sits at the rest spot; animate the mesh inside it
    holder.position.set(...a.at).sub(rest[a.bone]);
    if (a.rot) holder.rotation.set(...a.rot);
    m.scale.set(...(a.scale ?? [1, 1, 1]));
    m.castShadow = a.shadow ?? false; m.receiveShadow = a.receive ?? !a.flat;
    holder.add(m); bones[a.bone].add(holder);
    extras[a.name] = m;
  }
  return { name: desc.name, desc, group, bones, rest, skeleton, meshes, extras, face, loose: desc.loose, triangles };
}

// The last step of posing, shared by every rig: `world` holds each bone's rotation from its rest pose
// (THREE.Quaternion by joint name). A helper joint turns half-way between the two bones it sits between and
// swells a little as they fold, which is what keeps a knee, an elbow, a shoulder or a hip from pinching.
// Then every bone gets its rotation relative to its parent.
export function applyWorld(ch, world) {
  const { bones } = ch, joints = ch.desc.joints;
  for (const name in joints) {
    const j = joints[name];
    if (!j.half) continue;
    const a = world[j.parent], b = world[j.half];
    if (!a || !b) continue;
    world[name] = a.clone().slerp(b, 0.5);
    bones[name].scale.setScalar(1 + j.swell * (1 - Math.abs(a.dot(b))));     // 1 - |a.b| is 1 - cos(half the angle between them)
  }
  for (const name in bones) {
    const b = bones[name], wq = world[name];
    if (!wq) continue;
    const p = b.parent && b.parent.isBone ? world[b.parent.name] : null;
    if (p) b.quaternion.copy(p).invert().multiply(wq); else b.quaternion.copy(wq);
  }
}
