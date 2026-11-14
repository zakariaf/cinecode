// Things that hang from a hand (a briefcase, a shopping bag, a lantern): a description's `hang` block.
//   hang: [{ bone, hand: 'L' | 'R', length, drop, z, stiff, clear, reach }]
//   bone   a joint of the description on `hand${hand}`, at the point of the hand that holds it; its solids are
//          written hanging straight down from it in the rest pose
//   length metres from that point to the thing's centre of weight (it sets how slowly it swings)
//   drop   metres from that point to its bottom (it stands on the floor when the hand comes down that low)
//   z      damping, 0 to 1 (0.4: a heavy case swings once or twice and settles)
//   stiff  how fast it rocks along its own length, held by the handle in the fist (swings a second); across it swings free
//   clear  metres from the axis of the leg on that side to the thing's centre of weight, sideways, that it is kept at:
//          the leg's radius plus half the thing's thickness (the leg pushes it out instead of going into it)
//   reach  metres it reaches forward and back of its centre (half a case's length): a leg nearer than this, forward or
//          back, pushes it
// The thing is a pendulum on the hand: a weight that keeps its distance from the hand and falls, stepped at a fixed
// rate from t = 0 (so any frame can be asked for on its own and gives the same answer); it keeps hanging whatever
// the hand does, swings as the hand speeds up and slows, and turns about the vertical with the body.
// The hand holds it: hangOn(act) also lays the carry over the performer (that arm grips, hangs nearer straight under
// the weight and swings less; the body leans a little away), and while the performer crouches or sits that hand
// is held out at its side, where the thing can stand on the floor. createPerformer calls hangOn for every character
// with a `hang` block (unless it is given `hang: false`: a driver at the wheel, his case left out of the picture).
import * as THREE from 'three/webgpu';
import { HANDS } from './biped.mjs';

const G = 9.81, DT = 1 / 120;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0), UP = V(0, 1, 0), X = V(1, 0, 0), Z = V(0, 0, 1);
const euler = new THREE.Euler();

/** The performer `act` (createPerformer) of a character with a `hang` block, with its carry laid on and apply(t)
 *  hanging the things after the body is posed. Returns `act` itself (its apply replaced); without `hang`, `act`. */
export function hangOn(act) {
  const ch = act.rig.character, specs = ch.desc.hang ?? [];
  if (!specs.length) return act;
  const rig = act.rig, size = act.opts.size, info = rig.info;
  const H = specs.map((s) => {
    const sx = s.hand === 'L' ? 1 : -1, hand = 'hand' + s.hand, R = ch.rest;
    return { ...s, sx, hand, arm: 'arm' + s.hand, off: R[s.bone].clone().sub(R[hand]), a1: R['foreArm' + s.hand].distanceTo(R['upperArm' + s.hand]), a2: R[hand].distanceTo(R['foreArm' + s.hand]),
      hip: R['thigh' + s.hand].clone().sub(R.pelvis), l1: R['shin' + s.hand].distanceTo(R['thigh' + s.hand]), l2: R['foot' + s.hand].distanceTo(R['shin' + s.hand]) };
  });

  // the carry: a firm grip; the arm hangs closer to straight and swings less under the weight; the body leans
  // away from it a little. Crouching or sitting, the hand is held out at the side, low.
  act.layer((pose, t, ctx) => {
    for (const h of H) {
      const a = pose[h.arm];
      Object.assign(a, HANDS.grip, { curl: 0.85, thumb: 0.8 });
      a.swing *= 0.25; a.spread += 0.06; a.wrist = [0, 0, 0];
      pose.spine.roll += h.sx * 0.025;
      const low = Math.max(ctx.cs ?? 0, ctx.ss ?? 0);
      if (low > 0.001) {
        // out at the side and low, where the thing can come down to the floor; never farther than the arm reaches
        const y = pose.pelvis.yaw, l = [Math.cos(y), -Math.sin(y)], f = [Math.sin(y), Math.cos(y)], fr = rig.frames(pose);
        const sh = V(h.sx * info.shoulder[0], info.shoulder[1], info.shoulder[2]).applyQuaternion(fr.q.chest).add(fr.pos.chest);
        const side = info.shoulder[0] + 0.25 * size, want = V(pose.pelvis.pos[0] + l[0] * h.sx * side + f[0] * 0.05, h.drop + 0.02, pose.pelvis.pos[2] + l[1] * h.sx * side + f[1] * 0.05);
        const d = want.sub(sh), len = Math.min(d.length(), 0.95 * info.armLength), to = sh.addScaledVector(d.normalize(), len);
        (pose.hand ??= {})[h.hand.slice(-1)] = { to: to.toArray(), w: low, elbowDir: [l[0] * h.sx, -0.3, l[1] * h.sx], wrist: [0, 0, 0], curl: 0.85, thumb: 0.8 };
      }
    }
  });

  // where the holding point is at time t, read off the plan without posing a bone, as performer.mjs apply() and
  // biped.mjs solve() would put it: the leg on that side (its knee placed as solve() places it), the wrist by the
  // arm's angles, drawn toward the knee while crouching or sitting and toward the point the pose asks the hand to
  // reach, as apply() does; the holding point a hand's length on along the arm
  const tmpQ = new THREE.Quaternion();
  function holdAt(t, h) {
    const { pose, ctx } = act.poseAt(t), fr = rig.frames(pose), arm = pose[h.arm], qC = fr.q.chest, s = h.hand.slice(-1);
    const hip = h.hip.clone().applyQuaternion(fr.q.pelvis).add(fr.pos.pelvis), f = pose['foot' + s], ankle = fr.feet[s].ankle;
    const n = ankle.clone().sub(hip), L = Math.min(Math.max(n.length(), Math.abs(h.l1 - h.l2) + 1e-3), (h.l1 + h.l2) * 0.9995); n.normalize();
    const kyaw = (f.yaw ?? 0) * 0.6 + pose.pelvis.yaw * 0.4 + h.sx * (f.splay ?? 0), pp = V(Math.sin(kyaw), 0.15, Math.cos(kyaw));
    pp.addScaledVector(n, -pp.dot(n)).normalize();
    const cosA = (h.l1 * h.l1 + L * L - h.l2 * h.l2) / (2 * h.l1 * L), knee = hip.clone().addScaledVector(n, h.l1 * cosA).addScaledVector(pp, h.l1 * Math.sqrt(Math.max(1 - cosA * cosA, 0)));

    const sh = V(...info.shoulder).setX(h.sx * info.shoulder[0]).add(V(0, arm.shrug ?? 0, 0)).applyQuaternion(qC).add(fr.pos.chest);
    const q = qC.clone().multiply(tmpQ.setFromAxisAngle(X, -(arm.swing ?? 0))).multiply(tmpQ.setFromAxisAngle(Z, h.sx * (arm.spread ?? 0))).multiply(tmpQ.setFromAxisAngle(UP, -h.sx * (arm.twist ?? 0)));
    const d1 = DOWN.clone().applyQuaternion(q), f1 = V(0, 0, -1).applyQuaternion(q), e = arm.elbow ?? 0;
    const d2 = d1.clone().multiplyScalar(Math.cos(e)).addScaledVector(f1, -Math.sin(e));
    const wrist = sh.clone().addScaledVector(d1, h.a1).addScaledVector(d2, h.a2);
    const kneeW = Math.max(ctx.cs, ctx.ss), want = pose.hand?.[s];
    if (kneeW > 0.001) {
      const y = pose.pelvis.yaw, fw = [Math.sin(y), Math.cos(y)], lf = [Math.cos(y), -Math.sin(y)], on = ctx.ss / Math.max(ctx.ss + ctx.cs, 1e-6);
      const target = knee.clone().lerp(hip, 0.4 * on).add(V(fw[0] * 0.02 - lf[0] * h.sx * (0.03 - 0.1 * on), 0.12 - 0.05 * on, fw[1] * 0.02 - lf[1] * h.sx * (0.03 - 0.1 * on)).multiplyScalar(size));
      wrist.lerp(target, kneeW);
      const d = wrist.clone().sub(sh), len = 0.97 * info.armLength;
      if (d.length() > len) wrist.copy(sh).add(d.setLength(len));
    }
    if (want?.w > 0) wrist.lerp(V(...want.to), Math.min(want.w, 1));
    const p = wrist.clone().addScaledVector(wrist.clone().sub(sh).normalize(), h.off.length());
    p.yaw = pose.pelvis.yaw + pose.spine.yaw;
    p.leg = [hip, knee, ankle];
    return p;
  }

  // the leg pushes the weight out sideways: wherever the leg (thigh or shin) is within `reach` of it forward or back,
  // at its height, the weight is kept `clear` out from the leg's axis (then held at its length from the hand again)
  const seg = new THREE.Line3(), q = V();
  function clearOfLeg(h, p, b, f) {
    const side = V(f.z, 0, -f.x).multiplyScalar(h.sx);   // outward, level
    let push = 0;
    for (let k = 0; k < 2; k++) {
      seg.set(p.leg[k], p.leg[k + 1]).closestPointToPoint(b, true, q);
      const d = b.clone().sub(q);
      if (Math.abs(d.dot(f)) < h.reach && Math.abs(d.y) < h.length + h.clear) push = Math.max(push, h.clear - d.dot(side));
    }
    return push > 0 ? p.clone().add(b.clone().addScaledVector(side, push).sub(p).setLength(h.length)) : b;
  }

  // the pendulum: a weight `length` from the holding point, stepped from t = 0; remembered
  const sim = H.map((h) => ({ p: [], b: [] }));
  function upTo(k) {
    H.forEach((h, j) => {
      const S = sim[j];
      for (let i = S.p.length; i <= k; i++) {
        const p = holdAt(i * DT, h);
        if (i === 0) { S.p.push(p); S.b.push(h.clear ? clearOfLeg(h, p, p.clone().addScaledVector(DOWN, h.length), V(Math.sin(p.yaw), 0, Math.cos(p.yaw))) : p.clone().addScaledVector(DOWN, h.length)); continue; }
        const b0 = S.b[i - 1], bm = S.b[i - 2] ?? b0, p0 = S.p[i - 1], pm = S.p[i - 2] ?? p0;
        // the weight keeps its own way (its swing against the hand damped), falls, and is held at its length
        const carry = p0.clone().sub(pm), swing = b0.clone().sub(bm).sub(carry).multiplyScalar(1 - 2 * h.z * Math.sqrt(G / h.length) * DT);
        let b = b0.clone().add(carry).add(swing).add(V(0, -G * DT * DT, 0));
        // rocking along its own length is held back by the handle in the fist (a stiff spring); across, it swings free
        const f = V(Math.sin(p.yaw), 0, Math.cos(p.yaw)), w = 2 * Math.PI * h.stiff;
        b.addScaledVector(f, -w * w * DT * DT * b0.clone().sub(p0).dot(f) - 2 * w * DT * b0.clone().sub(bm).sub(carry).dot(f));   // (critically damped: it follows a jolt of the hand without kicking past and back)
        b = p.clone().add(b.sub(p).setLength(h.length));
        if (p.y - h.drop <= 0) b = p.clone().addScaledVector(DOWN, h.length);   // standing on the floor: upright, still
        if (h.clear) b = clearOfLeg(h, p, b, f);
        S.p.push(p); S.b.push(b);
      }
    });
  }
  const at = (j, t) => {
    const s = Math.max(t, 0) / DT, i = Math.floor(s), u = s - i;
    upTo(i + 1);
    const S = sim[j];
    return { p: S.p[i].clone().lerp(S.p[i + 1], u), b: S.b[i].clone().lerp(S.b[i + 1], u) };
  };

  const apply = act.apply, qG = new THREE.Quaternion(), qH = new THREE.Quaternion(), qW = new THREE.Quaternion();
  act.apply = (t) => {
    const r = apply(t), b = ch.bones;
    ch.group.getWorldQuaternion(qG).invert();
    H.forEach((h, j) => {
      const { p, b: w } = at(j, t), yaw = r.pose.pelvis.yaw + r.pose.spine.yaw;
      let d = w.sub(p).normalize();
      // the plan's holding point is only near the hand's real one: kept clear of the real leg here, frame by frame
      if (h.clear) {
        const s = h.hand.slice(-1), loc = (v) => ch.group.worldToLocal(v), held = loc(b[h.hand].localToWorld(h.off.clone()));
        held.leg = ['thigh', 'shin', 'foot'].map((n) => loc(b[n + s].getWorldPosition(V())));
        d = clearOfLeg(h, held, held.clone().addScaledVector(d, h.length), V(Math.sin(yaw), 0, Math.cos(yaw))).sub(held).normalize();
      }
      b[h.hand].getWorldQuaternion(qH).premultiply(qG);                      // the hand's turn within the character
      qW.setFromUnitVectors(DOWN, d).multiply(tmpQ.setFromEuler(euler.set(0, yaw, 0)));
      const bone = b[h.bone];
      bone.quaternion.copy(qH).invert().multiply(qW);
      // the hand's real holding point; if the bottom would go through the floor, the thing stands on it
      bone.position.copy(h.off);
      const held = b[h.hand].localToWorld(h.off.clone()), groundY = ch.group.position.y;
      const lift = groundY - (held.y - h.drop * Math.max(-d.y, 0));
      if (lift > 0) bone.position.add(UP.clone().multiplyScalar(lift).applyQuaternion(qH.clone().invert()));
    });
    ch.group.updateMatrixWorld(true);
    return r;
  };
  act.hangAt = (t) => H.map((h, j) => at(j, t));
  return act;
}

