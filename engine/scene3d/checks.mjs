// Motion checks. They pose an opened scene (openScene) frame by frame and measure; none
// of them draws, so they run with no GPU.
import * as THREE from 'three/webgpu';
import { compileSolid } from './sdf.mjs';

const V = THREE.Vector3;

// One scene of a compiled film (compile.mjs: src.built.scenes[i]) as a source the checks read: its own actors, posed
// and framed in the scene's time (0 at its start), so a cut is not a jump and an actor of another scene is not in it.
export const sceneSource = (src, sc) => ({ ...src, duration: sc.t1 - sc.t0, built: {
  cast: Object.fromEntries([...sc.drivers].filter(([, D]) => D.ch).map(([id, D]) => [id, { ch: D.ch, rig: src.built.cast[id].rig, act: D.act }])),
  update(t) { sc.pose(t); src.stage.setCamera(sc.camera(t)); },
} });

// Planted feet must not slide: for every frame in which a foot of the two-legged `who` is
// down (not swinging, not in a jump), how far did the point it stands on move since the frame
// before? Flat, that is the sole under the ankle; rolled up onto the ball (a crouch, a push-off)
// the ball of the foot; rolled back onto the heel, the heel (desc.rig.ball / heel). A frame
// that changes from one to another is not counted. Returns the number of foot-frames checked
// and the largest movement in metres.
export function feetSlide(src, who) {
  const { ch, act } = src.built.cast[who], rig = ch.desc.rig;
  let worst = 0, n = 0, at = 0; const prev = {};
  for (let f = 0; f < src.duration * src.fps; f++) {
    const t = f / src.fps; src.built.update(t);
    for (const s of ['L', 'R']) {
      const st = act.footAt(s, t);
      const pz = act.poseAt(t), pitch = pz.pose['foot' + s].pitch;
      const down = st.arc === 0 && pz.ctx.jump.y === 0 && pz.ctx.jump.toes === 0;
      const on = !down ? null : pitch > 1e-6 ? 'ball' : pitch < -1e-6 ? 'heel' : 'flat';
      // the point on the floor it stands on, in the foot's own frame
      const p = on && ch.bones['foot' + s].localToWorld(new V(0, -ch.rest['foot' + s].y, on === 'flat' ? 0 : rig[on]));
      if (on && prev[s]?.on === on) { const d = p.distanceTo(prev[s].p); n++; if (d > worst) { worst = d; at = t; } }
      prev[s] = { p, on };
    }
  }
  return { n, worst, at };
}

// The same for the four-legged `who`: for every frame in which a paw is down (not
// stepping), how far did its contact point move since the frame before?
export function pawSlide(src, who) {
  const { ch, act } = src.built.cast[who];
  const toe = ch.desc.rig.hindToe;
  const point = (name) => {
    const s = name[1];
    if (name[0] === 'F') return ch.bones['fPaw' + s].getWorldPosition(new V());                       // the wrist
    const hock = ch.rest['hFoot' + s];
    return ch.bones['hFoot' + s].localToWorld(new V((s === 'L' ? 1 : -1) * toe[0] - hock.x, toe[1] - hock.y, toe[2] - hock.z));   // the toes
  };
  let worst = 0, n = 0, at = 0, paw = ''; const prev = {};
  for (let f = 0; f < src.duration * src.fps; f++) {
    const t = f / src.fps; src.built.update(t);
    for (const name of ['FL', 'FR', 'HL', 'HR']) {
      const down = act.pawAt(name, t).air === 0, p = point(name);
      if (down && prev[name]?.down) { const d = p.distanceTo(prev[name].p); n++; if (d > worst) { worst = d; at = t; paw = name; } }
      prev[name] = { p, down };
    }
  }
  return { n, worst, at, paw };
}

// ---------------------------------------------------------------------------------
// The motion gates. motion(src) steps the whole scene at `hz` (240 a second: finer than any frame, so a
// one-frame flip cannot hide between frames), records where the joints of every actor are, and measures:
//   pops:    the largest jump in a joint's velocity from one step to the next (m/s). Smooth motion changes
//            speed by acc / hz per step; a knee that flips, a hand that snaps to a target, a heading that wraps
//            all show up as a jump of metres a second.
//   holds:   the longest time a joint stays perfectly still (moves less than `still` metres in all that time)
//            while the actor is on screen. Planted feet and paws are meant to be still and are not counted.
//   reach:   the farthest any leg or arm was asked to reach past its full length (m).
//   through: (two legs) how deep the forearms and hands go inside the torso (m; 0 = never inside).
//   turns:   the fastest the skull, the chest or the hips turns (rad/s), measured over one frame (1/24 s, what
//            the motion blur of a frame shows): the most any of the bone's axes turned between a step and the
//            step a frame before, times 24. Gate TURN_GATE. The eyes are not bones here: they may dart.
// Each is given with the joint and the time of the worst case. No GPU.
const BIPED_JOINTS = ['pelvis', 'chest', 'head', 'foreArmL', 'foreArmR', 'handL', 'handR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR'];
const QUAD_JOINTS = ['hips', 'spine', 'chest', 'head', 'fLowerL', 'fLowerR', 'fPawL', 'fPawR', 'hShinL', 'hShinR', 'hFootL', 'hFootR', 'earL', 'earR'];
const PLANTED = /^(foot|toe|fPaw|hFoot)[LR]$/;
// The turn gate (rad/s). The quickest ordinary turn in the reference film (shot 9, the turn to the fridge,
// scratchpad/plan/understand/reference-video.md) carries the whole figure 180 degrees in 0.4 s: 7.9 rad/s on
// average, with the head leading into three-quarter over 0.2 s (about 4 rad/s); only a pirouette drawn as smears
// is faster. At 8 rad/s a face 10 cm from the neck moves 1.7 cm while the shutter is open and still reads; the head
// that whipped in films/_test3d at 7.79 s turned 31 rad/s and smeared.
export const TURN_GATE = 8;
// The other gates of motion() (pops m/s in 1/240 s, holds s, reach and through m), as the tests, lint and check-motion use them.
export const GATES = { pops: 5, holds: 1 / 3, reach: 0.005, through: 0.005 };
const TURNERS = ['head', 'chest', 'pelvis', 'hips'];
const TORSO = ['pelvis', 'spine', 'chest', 'belly'];

// The torso as solids, each in the rest space of the bone it is tied to; depth(p) is how far the world point p
// is inside it (positive inside).
function torsoOf(ch) {
  const solids = [];
  for (const part of ch.desc.parts) for (const o of part.ops) {
    if ((o.op ?? 'add') !== 'add' || !TORSO.includes(o.bone) || !['ell', 'box', 'cone'].includes(o.type)) continue;
    solids.push({ bone: o.bone, d: compileSolid(o).d });
  }
  const inv = new THREE.Matrix4(), q = new V();
  return (p) => {
    let worst = -Infinity;
    for (const name of TORSO) {
      if (!ch.bones[name]) continue;
      inv.copy(ch.bones[name].matrixWorld).invert();
      q.copy(p).applyMatrix4(inv).add(ch.rest[name]);
      for (const s of solids) if (s.bone === name) worst = Math.max(worst, -s.d(q.x, q.y, q.z));
    }
    return worst;
  };
}

export function motion(src, { hz = 240, still = 2e-5, from = 0, to = src.duration } = {}) {
  const cam = src.stage.camera, n = Math.round((to - from) * hz) + 1;
  const actors = Object.entries(src.built.cast).filter(([, c]) => c.ch).map(([who, { ch, rig }]) => {   // (a prop has no joints)
    const four = ch.desc.kind === 'quadruped';
    const names = [...(four ? QUAD_JOINTS : BIPED_JOINTS), ...ch.loose.map((l) => l.bone)].filter((j) => ch.bones[j]);
    const fingers = !four && ch.bones.middle1L ? ['L', 'R'] : [];
    const turners = TURNERS.filter((j) => ch.bones[j]);
    return { who, ch, rig, four, names, pos: names.map(() => new Float64Array(n * 3)), seen: new Uint8Array(n), turners, axes: turners.map(() => new Float64Array(n * 6)),
      torso: four ? null : torsoOf(ch), reach: { worst: 0, at: 0, limb: '' }, through: { worst: 0, at: 0, joint: '' }, fingers };
  });
  const p = new V(), a = new V(), b = new V();
  for (let i = 0; i < n; i++) {
    const t = from + i / hz;
    src.built.update(t);
    cam.updateMatrixWorld();
    for (const A of actors) {
      const B = A.ch.bones;
      A.names.forEach((j, k) => { B[j].getWorldPosition(p); A.pos[k][i * 3] = p.x; A.pos[k][i * 3 + 1] = p.y; A.pos[k][i * 3 + 2] = p.z; });
      // (the bone's forward and up axes, from its matrix: a squash of the body scales them but does not turn them)
      A.turners.forEach((j, k) => { const e = B[j].matrixWorld.elements, f = Math.hypot(e[8], e[9], e[10]), u = Math.hypot(e[4], e[5], e[6]); A.axes[k].set([e[8] / f, e[9] / f, e[10] / f, e[4] / u, e[5] / u, e[6] / u], i * 6); });
      B[A.four ? 'hips' : 'pelvis'].getWorldPosition(p).project(cam);
      A.seen[i] = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 ? 1 : 0;
      // (a bone that is not a number: NaN never compares greater than a gate, so it is the worst pop there is)
      if (!A.nan) for (const bone of A.ch.skeleton.bones) if (!bone.matrixWorld.elements.every(Number.isFinite)) { A.nan = { worst: Infinity, at: t, joint: bone.name }; break; }
      for (const [limb, m] of Object.entries(A.rig.out.miss)) if (m > A.reach.worst) A.reach = { worst: m, at: t, limb };
      if (A.torso) for (const s of ['L', 'R']) {
        // the elbow, the middle of the forearm, the wrist and the middle of the hand
        B['foreArm' + s].getWorldPosition(a); B['hand' + s].getWorldPosition(b);
        const pts = [['elbow', a], ['forearm', a.clone().lerp(b, 0.5)], ['wrist', b]];
        if (B['middle1' + s]) pts.push(['hand', b.clone().lerp(B['middle1' + s].getWorldPosition(p), 0.6)]);
        for (const [what, q] of pts) { const d = A.torso(q); if (d > A.through.worst) A.through = { worst: d, at: t, joint: what + s }; }
      }
    }
  }
  const out = {};
  for (const A of actors) {
    let pops = { worst: 0, at: 0, joint: '' }, holds = { worst: 0, at: 0, joint: '' };
    const joints = {};
    A.names.forEach((j, k) => {
      const P = A.pos[k], J = joints[j] = { pop: 0, at: 0 };
      for (let i = 2; i < n; i++) {
        const dv = Math.hypot(P[i * 3] - 2 * P[i * 3 - 3] + P[i * 3 - 6], P[i * 3 + 1] - 2 * P[i * 3 - 2] + P[i * 3 - 5], P[i * 3 + 2] - 2 * P[i * 3 - 1] + P[i * 3 - 4]) * hz;
        if (dv > J.pop) { J.pop = dv; J.at = from + i / hz; }
        if (dv > pops.worst) pops = { worst: dv, at: from + i / hz, joint: j };
      }
      if (PLANTED.test(j)) return;
      // the longest run of on-screen steps that stays within `still` of where the run began
      let start = -1;
      for (let i = 0; i < n; i++) {
        const moved = start >= 0 && Math.hypot(P[i * 3] - P[start * 3], P[i * 3 + 1] - P[start * 3 + 1], P[i * 3 + 2] - P[start * 3 + 2]) > still;
        if (!A.seen[i] || start < 0 || moved) { start = A.seen[i] ? i : -1; continue; }
        const len = (i - start) / hz;
        if (len > holds.worst) holds = { worst: len, at: from + start / hz, joint: j };
      }
    });
    let turns = { worst: 0, at: 0, joint: '' };
    const k = Math.max(1, Math.round(hz / 24)), ang = (X, i, j, o) => Math.acos(Math.min(1, X[i + o] * X[j + o] + X[i + o + 1] * X[j + o + 1] + X[i + o + 2] * X[j + o + 2]));
    A.turners.forEach((j, q) => {
      const X = A.axes[q];
      for (let i = k; i < n; i++) { const w = Math.max(ang(X, i * 6, (i - k) * 6, 0), ang(X, i * 6, (i - k) * 6, 3)) * hz / k; if (w > turns.worst) turns = { worst: w, at: from + (i - k / 2) / hz, joint: j }; }
    });
    if (A.nan) pops = A.nan;
    out[A.who] = { pops, holds, reach: A.reach, through: A.torso ? A.through : null, turns, onScreen: A.seen.reduce((s, v) => s + v, 0) / hz, joints };
  }
  return out;
}

// ---------------------------------------------------------------------------------
// Bodies passing through each other. Each actor is a set of capsules, one per bone of its limbs, trunk, head and
// tail (CAPSULE_BONES), fitted once to the skin the bone carries most of in the rest pose (a finger's skin counts
// for the hand, a belly's for the spine, a bun's for the head): along its longest axis, as thick as 60 % of that
// skin lies within, and as long as 94 % of it reaches. overlap(src) poses the scene `hz` times a second and measures how deep any capsule of one actor
// goes into any capsule of another (the sum of the radii less the distance between the two segments).
// → { worst, at, a, b, partA, partB } (metres, 0 if they never touch) and `pairs`: the same for every pair of actors.
// Gate OVERLAP_GATE. No GPU.
const CAPSULE_BONES = new Set(['pelvis', 'spine', 'chest', 'neck', 'head', 'hips', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5',
  ...['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'toe', 'fUpper', 'fLower', 'fPaw', 'hThigh', 'hShin', 'hFoot'].flatMap((b) => [b + 'L', b + 'R'])]);
export const OVERLAP_GATE = 0.01;   // (capsules are rounder than the bodies: up to 1 cm is two bodies brushing)
function capsulesOf(ch) {
  const own = (name) => { let b = ch.bones[name]; while (b && !CAPSULE_BONES.has(b.name)) b = b.parent; return b?.isBone ? b.name : null; };
  const pts = {};
  for (const mesh of Object.values(ch.meshes)) {
    const g = mesh.geometry.attributes, sw = g.skinWeight, P = g.position;
    for (let i = 0; i < P.count; i++) {
      let k = 0; for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, k)) k = j;
      const name = own(ch.skeleton.bones[g.skinIndex.getComponent(i, k)].name), r = name && ch.rest[name];
      if (r) (pts[name] ??= []).push([P.getX(i) - r.x, P.getY(i) - r.y, P.getZ(i) - r.z]);   // (in the bone's own rest frame)
    }
  }
  const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  return Object.entries(pts).filter(([, p]) => p.length >= 20).map(([bone, p]) => {
    const c = [0, 1, 2].map((k) => p.reduce((s, q) => s + q[k], 0) / p.length);
    // the longest axis (power iteration on the spread)
    const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => p.reduce((s, q) => s + (q[i] - c[i]) * (q[j] - c[j]), 0)));
    let d = [0.3, 1, 0.2];
    for (let it = 0; it < 30; it++) { const n = [0, 1, 2].map((i) => C[i][0] * d[0] + C[i][1] * d[1] + C[i][2] * d[2]), l = Math.hypot(...n) || 1; d = n.map((v) => v / l); }
    const t = p.map((q) => (q[0] - c[0]) * d[0] + (q[1] - c[1]) * d[1] + (q[2] - c[2]) * d[2]);
    const r = pct(p.map((q, i) => Math.hypot(q[0] - c[0] - t[i] * d[0], q[1] - c[1] - t[i] * d[1], q[2] - c[2] - t[i] * d[2])), 0.6);
    let lo = pct(t, 0.03) + r, hi = pct(t, 0.97) - r;
    if (lo > hi) lo = hi = (lo + hi) / 2;
    return { bone, r, a: new V(...c.map((v, k) => v + d[k] * lo)), b: new V(...c.map((v, k) => v + d[k] * hi)) };
  });
}
// the shortest distance between segments p1-q1 and p2-q2
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return r.length();
  if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return p1.clone().addScaledVector(d1, s).sub(p2.clone().addScaledVector(d2, t)).length();
}
export function overlap(src, { hz = 48, from = 0, to = src.duration } = {}) {
  const actors = Object.entries(src.built.cast).filter(([, c]) => c.ch).map(([who, { ch }]) => ({ who, ch, caps: capsulesOf(ch) }));
  const pairs = {};
  let worst = { worst: 0, at: 0, a: '', b: '', partA: '', partB: '' };
  for (let i = 0, n = Math.round((to - from) * hz); i <= n; i++) {
    const t = from + i / hz;
    src.built.update(t);
    const world = actors.map((A) => A.caps.map((c) => { const m = A.ch.bones[c.bone].matrixWorld; return { ...c, A: c.a.clone().applyMatrix4(m), B: c.b.clone().applyMatrix4(m) }; }));
    actors.forEach((A, ia) => actors.forEach((B, ib) => {
      if (ib <= ia) return;
      const key = A.who + '/' + B.who, w = pairs[key] ??= { worst: 0, at: 0, a: A.who, b: B.who, partA: '', partB: '' };
      for (const ca of world[ia]) for (const cb of world[ib]) {
        const depth = ca.r + cb.r - segDist(ca.A, ca.B, cb.A, cb.B);
        if (depth > w.worst) Object.assign(w, { worst: depth, at: t, partA: ca.bone, partB: cb.bone });
      }
      if (w.worst > worst.worst) worst = { ...w };
    }));
  }
  return { ...worst, pairs };
}

// ---------------------------------------------------------------------------------
// A door swinging through a body. A place or a car names its doors on its group (userData.doors: [{ name, leaf, root }]:
// the leaf's mesh and the object it belongs to, home.mjs buildHome, car.mjs buildCar). doorSweep(src) poses the film 24
// times a second to find when a door moves (the leaf turns against its own object: a car driving with its door shut
// is not a moving door), and over every such frame poses it `hz` times a second and measures how deep any capsule of
// an actor in the picture (see overlap) goes into the leaf, a box round the leaf's mesh in its own frame.
// → [{ door, who, part, worst, at }] (metres, the film's time; less than 0: that far clear), the deepest for each door
// and actor that come within DOOR_NEAR of each other. Gate DOOR_GATE (as overlap's: the capsules are rounder than the
// bodies); within DOOR_NEAR it brushes them and reads as hitting (lint warns). No GPU.
export const DOOR_GATE = 0.01, DOOR_NEAR = 0.03;
export function doorSweep(src, { hz = 240, from = 0, to = src.duration } = {}) {
  const built = src.built, doors = [];
  src.stage.scene.traverse((o) => { for (const d of o.userData?.doors ?? []) doors.push(d); });
  if (!doors.length) return [];
  for (const d of doors) {
    d.leaf.geometry.computeBoundingBox();
    const b = d.leaf.geometry.boundingBox;
    d.box = { c: b.getCenter(new V()), e: b.getSize(new V()).multiplyScalar(0.5) };
    // (a car's door is named for the actor the car is)
    d.label = Object.entries(built.cast).find(([, C]) => C.group === d.root || C.mesh?.group === d.root)?.[0];
    d.label = d.label ? `${d.label}'s door` : d.name;
  }
  const actors = Object.entries(built.cast).filter(([, C]) => C.ch).map(([who, C]) => ({ who, C, caps: capsulesOf(C.ch) }));
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  // (the scene's world matrices brought up to date as a render would: a hinge's pivot is moved by hand)
  const pose = (t) => { built.update(t); src.stage.scene.updateMatrixWorld(); };
  const rel = (d) => new THREE.Matrix4().copy(d.root.matrixWorld).invert().multiply(d.leaf.matrixWorld).elements;
  const moved = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-5);
  const found = new Map(), inv = new THREE.Matrix4(), A = new V(), B = new V(), q = new V();
  // how deep the capsule (A, B, r), in the leaf's frame, goes into the box: r less its distance from the box (inside
  // the box, the distance is negative: how far in from its nearest face)
  const depth = (box, a, b, r) => {
    let best = -Infinity;
    for (let k = 0; k <= 8; k++) {
      q.lerpVectors(a, b, k / 8).sub(box.c);
      const dx = Math.abs(q.x) - box.e.x, dy = Math.abs(q.y) - box.e.y, dz = Math.abs(q.z) - box.e.z;
      const out = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0);
      best = Math.max(best, r - out);
    }
    return best;
  };
  const measure = (t) => {
    pose(t);
    for (const d of doors) {
      if (!shown(d.root)) continue;
      inv.copy(d.leaf.matrixWorld).invert();
      for (const { who, C, caps } of actors) {
        if (!shown(C.group)) continue;
        for (const c of caps) {
          const m = C.ch.bones[c.bone].matrixWorld;
          A.copy(c.a).applyMatrix4(m).applyMatrix4(inv); B.copy(c.b).applyMatrix4(m).applyMatrix4(inv);
          const k = `${d.label}/${who}`, w = depth(d.box, A, B, c.r), f = found.get(k);
          if (w > -DOOR_NEAR && (!f || w > f.worst)) found.set(k, { door: d.label, who, part: c.bone, worst: w, at: t });
        }
      }
    }
  };
  let prev = null;
  for (let i = 0, n = Math.round((to - from) * 24); i <= n; i++) {
    const t = from + i / 24;
    pose(t);
    const now = doors.map(rel);
    if (prev) for (let j = 0; j < doors.length; j++) if (moved(prev[j], now[j])) { for (let s = 0; s <= hz / 24; s++) measure(t - 1 / 24 + s / hz); break; }
    prev = now;
  }
  return [...found.values()];
}
