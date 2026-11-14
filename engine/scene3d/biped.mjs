// Posing a two-legged character. A pose is a small object of controls in plain
// numbers (where the pelvis is, which way things turn, where the feet stand, how the
// arms hang or what the hands reach for). solve(pose) turns it into bone rotations:
//   spine and head by forward kinematics (angles add up down the chain),
//   legs by inverse kinematics (the feet are put where the pose says, the knee follows),
//   arms by either (angles, or a point for the hand to reach).
//
// Angles are radians. yaw turns about the vertical (0 faces +z, positive turns toward
// +x), pitch is nodding forward (positive leans forward), roll tips sideways.
import * as THREE from 'three/webgpu';
import { applyWorld, FINGER_NAMES } from './character.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const euler = new THREE.Euler();
// yaw, then pitch, then roll
const ypr = (yaw = 0, pitch = 0, roll = 0) => Q().setFromEuler(euler.set(pitch, yaw, roll, 'YXZ'));

// Orientation that carries a bone's rest frame (its direction d0 and "front" f0)
// onto a posed direction d with front f.
function basis(d, f) {
  const y = d.clone().normalize();
  const z = f.clone().addScaledVector(y, -f.dot(y));
  if (z.lengthSq() < 1e-10) z.copy(Math.abs(y.y) < 0.9 ? Y : Z).addScaledVector(y, -(Math.abs(y.y) < 0.9 ? y.y : y.z));
  z.normalize();
  const x = y.clone().cross(z);
  return new THREE.Matrix4().makeBasis(x, y, z);
}
function aim(restInv, d, f) { return Q().setFromRotationMatrix(basis(d, f).multiply(restInv)); }

const softmin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export const defaultPose = () => ({
  pelvis: { pos: [0, 1, 0], yaw: 0, pitch: 0, roll: 0 },   // pos.y is the wished height; the legs may pull it lower
  spine: { yaw: 0, pitch: 0, roll: 0 },                     // chest relative to pelvis
  head: { yaw: 0, pitch: 0, roll: 0 },                      // head relative to chest
  footL: { pos: [0.15, 0], yaw: 0, pitch: 0, lift: 0, toe: 0, splay: 0 },
  footR: { pos: [-0.15, 0], yaw: 0, pitch: 0, lift: 0, toe: 0, splay: 0 },
  // curl: how far the fingers fold, 0 straight to 1 a fist: one number, or [index, middle, ring, pinky];
  // thumb: 0 out to the side, 1 folded across the palm; fan: 0 fingers together, 1 spread wide
  armL: { swing: 0, spread: 0.12, twist: 0, elbow: 0.2, wrist: [0, 0, 0], curl: 0.25, thumb: 0.2, fan: 0.3, shrug: 0 },
  armR: { swing: 0, spread: 0.12, twist: 0, elbow: 0.2, wrist: [0, 0, 0], curl: 0.25, thumb: 0.2, fan: 0.3, shrug: 0 },
  // the face controls are listed at buildFace's set() in character.mjs
  face: { gaze: [0, 0], blink: 0, squint: 0, wide: 0, browUp: 0, browTilt: 0, mouth: {}, expr: {} },
});

// Hand shapes: numbers for an arm's curl, thumb and fan. Object.assign(pose.armR, HANDS.point)
export const HANDS = {
  open: { curl: 0, thumb: 0, fan: 1 },
  relaxed: { curl: 0.25, thumb: 0.2, fan: 0.3 },
  point: { curl: [0, 1, 1, 1], thumb: 1, fan: 0 },
  grip: { curl: 0.72, thumb: 0.75, fan: 0.25 },      // round something the size of a ball or a cup
  fist: { curl: 1, thumb: 1, fan: 0 },
};
// how far each bone of a finger folds at curl 1, and how far each finger fans at fan 1 (radians)
const FOLD = { 2: [1.5, 1.6], 3: [1.4, 1.5, 1.1] }, FAN = [-0.3, -0.09, 0.1, 0.32];

export function createBiped(ch) {
  const { bones, rest } = ch;
  const cfg = ch.desc.rig ?? {};
  const R = {};  // per-limb rest data
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const hip = rest['thigh' + s], knee = rest['shin' + s], ank = rest['foot' + s];
    const sh = rest['upperArm' + s], el = rest['foreArm' + s], wr = rest['hand' + s];
    const armDir = el.clone().sub(sh).normalize();
    R[s] = {
      sx,
      hipOff: hip.clone().sub(rest.pelvis),
      l1: knee.distanceTo(hip), l2: ank.distanceTo(knee),
      thighInv: basis(knee.clone().sub(hip), Z).invert(),
      shinInv: basis(ank.clone().sub(knee), Z).invert(),
      ankleH: ank.y,
      shOff: sh.clone().sub(rest.chest),
      a1: el.distanceTo(sh), a2: wr.distanceTo(el),
      // arm bones: direction along the arm; "front" is the side the elbow points to (back, when the arm hangs)
      armInv: basis(armDir, V(0, 0, -1)).invert(),
      armDir,
      segs: FINGER_NAMES.map((f) => [1, 2, 3].filter((i) => bones[f + i + s]).length),    // bones in each finger
    };
  }
  const ballZ = cfg.ball ?? 0.1, heelZ = cfg.heel ?? -0.08;
  const standHeight = rest.pelvis.y;
  const info = { standHeight, legLength: R.L.l1 + R.L.l2, hipWidth: R.L.hipOff.x, ankleH: R.L.ankleH, ballZ, heelZ, armLength: R.L.a1 + R.L.a2, shoulder: R.L.shOff.toArray() };   // shoulder: the left shoulder from the chest joint

  // Where the ankle is, for a foot whose ground point is (x, z), turned by yaw and
  // tipped by pitch (positive: heel up, rolling over the ball; negative: toes up, on the heel).
  function ankleOf(f) {
    const qy = Q().setFromAxisAngle(Y, f.yaw ?? 0);
    const p = f.pitch ?? 0;
    const pivotZ = p >= 0 ? ballZ : heelZ;
    const pivot = V(0, 0, pivotZ).applyQuaternion(qy).add(V(f.pos[0], 0, f.pos[1]));
    const arm = V(0, info.ankleH, -pivotZ).applyQuaternion(Q().setFromAxisAngle(X, p)).applyQuaternion(qy);
    return pivot.add(arm).add(V(0, f.lift ?? 0, 0));
  }

  const out = { joints: {}, miss: {} };   // the last solve: joints in the room, and how far each limb fell short of where it was asked to reach

  // Where the trunk is for a pose: the rotation of pelvis, spine, chest, neck and head, and where their joints
  // are in the room. Touches no bone, so it is cheap enough to ask for many times a second (loose parts do).
  function frames(pose) {
    const P = pose.pelvis;
    const qPelvis = ypr(P.yaw, P.pitch, P.roll);
    const qChest = qPelvis.clone().multiply(ypr(pose.spine.yaw, pose.spine.pitch, pose.spine.roll));
    const qSpine = qPelvis.clone().slerp(qChest, 0.45);
    const hq = ypr(pose.head.yaw, pose.head.pitch, pose.head.roll);
    const qHead = qChest.clone().multiply(hq);
    const qNeck = qChest.clone().slerp(qHead, 0.4);

    // feet first: they decide how high the pelvis can be
    const feet = {};
    for (const s of ['L', 'R']) {
      const f = pose['foot' + s];
      feet[s] = { ankle: f.ankle ? V(...f.ankle) : ankleOf(f), q: Q().setFromAxisAngle(Y, f.yaw ?? 0).multiply(Q().setFromAxisAngle(X, f.pitch ?? 0)) };
    }
    const pelvisPos = V(P.pos[0], P.pos[1], P.pos[2]);
    if (P.autoHeight !== false) {
      let y = pelvisPos.y;
      for (const s of ['L', 'R']) {
        const hipW = R[s].hipOff.clone().applyQuaternion(qPelvis).add(pelvisPos);
        const a = feet[s].ankle;
        const horiz = Math.hypot(hipW.x - a.x, hipW.z - a.z);
        const reach = (R[s].l1 + R[s].l2) * (P.reach ?? 0.992);
        const hipY = a.y + Math.sqrt(Math.max(reach * reach - horiz * horiz, 0.0001));
        y = softmin(y, hipY - (hipW.y - pelvisPos.y), 0.03);
      }
      pelvisPos.y = y;
    }
    const pSpine = pelvisPos.clone().add(rest.spine.clone().sub(rest.pelvis).applyQuaternion(qPelvis));
    const pChest = pSpine.clone().add(rest.chest.clone().sub(rest.spine).applyQuaternion(qSpine));
    const pNeck = pChest.clone().add(rest.neck.clone().sub(rest.chest).applyQuaternion(qChest));
    const pHead = pNeck.clone().add(rest.head.clone().sub(rest.neck).applyQuaternion(qNeck));
    return { q: { pelvis: qPelvis, spine: qSpine, chest: qChest, neck: qNeck, head: qHead }, pos: { pelvis: pelvisPos, spine: pSpine, chest: pChest, neck: pNeck, head: pHead }, feet };
  }

  function solve(pose) {
    const P = pose.pelvis, fr = frames(pose), feet = fr.feet;
    const world = { ...fr.q }, qPelvis = fr.q.pelvis, qChest = fr.q.chest, qHead = fr.q.head, pelvisPos = fr.pos.pelvis, pChest = fr.pos.chest;
    bones.pelvis.position.copy(pelvisPos);

    for (const s of ['L', 'R']) {
      const r = R[s], sx = r.sx;
      // ---- leg
      const f = pose['foot' + s];
      const hipW = r.hipOff.clone().applyQuaternion(qPelvis).add(pelvisPos);
      const a = feet[s].ankle;
      const to = a.clone().sub(hipW);
      const dist = Math.min(Math.max(to.length(), Math.abs(r.l1 - r.l2) + 1e-3), (r.l1 + r.l2) * 0.9995);
      out.miss['leg' + s] = Math.max(0, to.length() - r.l1 - r.l2);     // how far past its full length the leg was asked to reach
      const n = to.clone().normalize();
      // the knee points where the foot points, a bit toward where the pelvis points, splayed outward on request
      const kyaw = (f.yaw ?? 0) * 0.6 + P.yaw * 0.4 + sx * (f.splay ?? 0);
      const pole = V(Math.sin(kyaw), 0.15, Math.cos(kyaw));
      const pp = pole.addScaledVector(n, -pole.dot(n)).normalize();
      const cosA = (r.l1 * r.l1 + dist * dist - r.l2 * r.l2) / (2 * r.l1 * dist);
      const sinA = Math.sqrt(Math.max(1 - cosA * cosA, 0));
      const kneeW = hipW.clone().addScaledVector(n, r.l1 * cosA).addScaledVector(pp, r.l1 * sinA);
      const ankW = hipW.clone().addScaledVector(n, dist);
      world['thigh' + s] = aim(r.thighInv, kneeW.clone().sub(hipW), pp);
      world['shin' + s] = aim(r.shinInv, ankW.clone().sub(kneeW), pp);
      world['foot' + s] = feet[s].q;
      world['toe' + s] = feet[s].q.clone().multiply(Q().setFromAxisAngle(X, f.toe ?? -Math.max(f.pitch ?? 0, 0)));
      out.joints['knee' + s] = kneeW; out.joints['ankle' + s] = ankW; out.joints['hip' + s] = hipW;

      // ---- arm
      const arm = pose['arm' + s];
      const shW = r.shOff.clone().add(V(0, arm.shrug ?? 0, 0)).applyQuaternion(qChest).add(pChest);
      bones['upperArm' + s].position.copy(r.shOff).add(V(0, arm.shrug ?? 0, 0));
      bones['upperArm' + s + '.bend']?.position.copy(bones['upperArm' + s].position);
      let d1, d2, f1;
      out.miss['arm' + s] = 0;
      if (arm.reach) {
        // hand reaches a point; the elbow goes toward `elbow` (a direction, default down and back and out)
        const T = V(...arm.reach);
        const to2 = T.sub(shW);
        const dd = Math.min(Math.max(to2.length(), Math.abs(r.a1 - r.a2) + 1e-3), (r.a1 + r.a2) * 0.999);
        out.miss['arm' + s] = Math.max(0, to2.length() - r.a1 - r.a2);
        const n2 = to2.normalize();
        const hint = arm.elbowDir ? V(...arm.elbowDir) : V(sx * 0.5, -1, -0.6).applyQuaternion(qChest);
        const pp2 = hint.addScaledVector(n2, -hint.dot(n2)).normalize();
        const c = (r.a1 * r.a1 + dd * dd - r.a2 * r.a2) / (2 * r.a1 * dd), sn = Math.sqrt(Math.max(1 - c * c, 0));
        const elW = shW.clone().addScaledVector(n2, r.a1 * c).addScaledVector(pp2, r.a1 * sn);
        const wrW = shW.clone().addScaledVector(n2, dd);
        d1 = elW.clone().sub(shW).normalize(); d2 = wrW.clone().sub(elW).normalize(); f1 = pp2;
      } else {
        // angles: hang down, spread out sideways, swing forward, then twist; elbow bends the forearm forward
        const q = qChest.clone()
          .multiply(Q().setFromAxisAngle(X, -(arm.swing ?? 0)))
          .multiply(Q().setFromAxisAngle(Z, sx * (arm.spread ?? 0)))
          .multiply(Q().setFromAxisAngle(Y, -sx * (arm.twist ?? 0)));
        d1 = V(0, -1, 0).applyQuaternion(q);
        f1 = V(0, 0, -1).applyQuaternion(q);
        const e = arm.elbow ?? 0;
        d2 = d1.clone().multiplyScalar(Math.cos(e)).addScaledVector(f1, -Math.sin(e));
      }
      const qU = aim(r.armInv, d1, f1);
      const f2 = f1.clone().addScaledVector(d2, -f1.dot(d2));
      if (f2.lengthSq() < 1e-8) f2.copy(d1);
      const qF = aim(r.armInv, d2, f2);
      world['upperArm' + s] = qU; world['foreArm' + s] = qF;
      // wrist: [bend (toward the palm), side, roll], in the forearm's frame
      const w = arm.wrist ?? [0, 0, 0];
      const qRest = Q().setFromRotationMatrix(basis(r.armDir, V(0, 0, -1)));          // rest frame of the arm
      const local = Q().setFromEuler(euler.set(sx * w[1], w[2] * sx, sx * w[0], 'YXZ'));
      const qH = qF.clone().multiply(qRest).multiply(local).multiply(qRest.clone().invert());
      world['hand' + s] = qH;
      // fingers: turns in the hand's own axes (y along the fingers, x through the hand, z toward the little finger).
      // Each bone of a finger folds toward the palm; the fingers fan apart; the thumb swings under the palm and folds.
      const qRi = qRest.clone().invert(), inHand = (q) => qH.clone().multiply(qRest).multiply(q).multiply(qRi);
      FINGER_NAMES.forEach((f, i) => {
        const c = Array.isArray(arm.curl) ? arm.curl[i] : arm.curl ?? 0, n = r.segs[i];
        const q = Q().setFromAxisAngle(X, FAN[i] * (arm.fan ?? 0) * (1 - 0.8 * c));
        for (let k = 1; k <= n; k++) world[f + k + s] = inHand(q.multiply(Q().setFromAxisAngle(Z, sx * c * FOLD[n][k - 1])).clone());
      });
      const th = arm.thumb ?? 0, qT = Q().setFromAxisAngle(Y, sx * th * 1.1).multiply(Q().setFromAxisAngle(X, 0.25 * th - 0.35 * (arm.fan ?? 0) * (1 - th)));
      if (bones['thumb1' + s]) { world['thumb1' + s] = inHand(qT.clone()); world['thumb2' + s] = inHand(qT.multiply(Q().setFromAxisAngle(X, 0.7 * th))); }
      out.joints['shoulder' + s] = shW;
    }

    // loose parts off their rest place: pose.loose = { bone: { shift: [x, y, z], swing: [fore-aft, sideways], stretch } }
    // (every loose part is set, named or not, so nothing is left from the frame before)
    for (const { bone: name } of ch.loose) {
      const b = bones[name], l = pose.loose?.[name] ?? {}, q = l.stretch ?? 1, iq = 1 / Math.sqrt(q);
      b.position.copy(rest[name]).sub(rest[ch.desc.joints[name].parent]).add(V(...(l.shift ?? [0, 0, 0])));
      b.rotation.set(l.swing?.[0] ?? 0, 0, l.swing?.[1] ?? 0);
      b.scale.set(iq, q, iq);
    }
    applyWorld(ch, world);
    ch.face.set(pose.face);
    ch.group.updateMatrixWorld(true);
    out.pelvis = pelvisPos; out.chestQ = qChest; out.headQ = qHead;
    return out;
  }

  return { solve, frames, info, ankleOf, character: ch, out };
}
