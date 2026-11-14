// A driver in the car: a character (the engine's man by default) sitting in the driver's seat, leaning back a little,
// feet forward on the pedals, hands on the steering wheel at ten to two (they ride round with it), looking where
// the car is going. He rides in the car's body, so he pitches and rolls with it.
//
//   const driver = seatDriver(car, man, { seed: 3 });   // car from createCar; man: a description, or a character
//                                                       // already built (buildCharacter), which is moved into the car
//   driver.leave(t);     // from t he is no longer in the car (the film cuts to him standing by it)
//   driver.apply(t);     // after car.apply(t)
//
// The performer cannot yet start a scene sitting, so he sits down in a time of his own that runs SHIFT seconds
// ahead of the film's: he is seated long before the film's t = 0.
import * as THREE from 'three/webgpu';
import { buildCharacter } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
import { CAR } from './car.mjs';

const C = CAR, SHIFT = 10;
// the elbows hang down and only a little out: further out, the left one went through the door (+x is his left)
const ELBOW = [0.3, -1, -0.15];

export function seatDriver(car, desc, { seed = 3 } = {}) {
  const ch = desc.bones ? desc : buildCharacter(desc), rig = createBiped(ch);
  // his own room: the cabin floor under the seat, facing the way the car faces
  const room = new THREE.Group(); room.name = 'driver seat';
  room.position.set(C.seat[0], C.floor, C.seat[2]);
  car.mesh.body.add(room); room.add(ch.group);
  const act = createPerformer(rig, { at: [0, 0.6], yaw: 0, seed, hang: false });
  // (what hangs from his hand, a case, is not in the car with him: his hands are on the wheel)
  for (const h of ch.desc.hang ?? []) for (const p of ch.desc.parts) if (p.ops.every((o) => o.bone === h.bone)) ch.meshes[p.name].visible = false;
  act.sit({ on: [0, C.seat[1] - C.floor, 0], t0: 0 });
  // the steering wheel in his room, and the rim at ten to two
  const a = C.wheelTilt * Math.PI / 180, axis = new THREE.Vector3(0, -Math.sin(a), Math.cos(a));
  const centre = new THREE.Vector3(C.wheel[0] - C.seat[0], C.wheel[1] - C.floor, C.wheel[2] - C.seat[2]);
  const up = new THREE.Vector3(0, Math.cos(a), Math.sin(a)), q = new THREE.Quaternion();
  const grip = (side, turn) => {
    const th = side * 58 * Math.PI / 180;
    const rim = new THREE.Vector3(1, 0, 0).multiplyScalar(Math.sin(th) * C.wheelRad).addScaledVector(up, Math.cos(th) * C.wheelRad);
    // (the hand's bone sits behind the fingers that wrap the rim: a little toward him and outward)
    rim.addScaledVector(axis, -0.045).multiplyScalar(1.12);
    return rim.applyQuaternion(q.setFromAxisAngle(axis, turn)).add(centre).toArray();
  };
  act.layer((pose, tau) => {
    const t = tau - SHIFT, p = car.poseAt(t);
    pose.pelvis.pitch -= 0.2; pose.spine.pitch += 0.04; pose.head.pitch += 0.12;   // back in the seat, eyes up on the road
    pose.footL.pos = [0.06, 0.6]; pose.footR.pos = [-0.12, 0.64];
    pose.hand = {
      L: { to: grip(1, p.wheel), w: 1, elbowDir: [ELBOW[0], ELBOW[1], ELBOW[2]], curl: 0.85, thumb: 0.6, wrist: [0.2, 0, 0] },
      R: { to: grip(-1, p.wheel), w: 1, elbowDir: [-ELBOW[0], ELBOW[1], ELBOW[2]], curl: 0.85, thumb: 0.6, wrist: [0.2, 0, 0] },
    };
  });
  // he looks down the road, a little into the turn
  act.lookAt((tau) => { const p = car.poseAt(tau - SHIFT), s = (p.steer.fl + p.steer.fr) / 2; return [Math.sin(s * 1.6) * 8, 1.2, Math.cos(s * 1.6) * 8]; }, { t0: 0 });
  let out = Infinity;
  return {
    ch, act, group: ch.group,
    leave(t) { out = t; },
    apply(t) { ch.group.visible = t < out; if (t < out) act.apply(t + SHIFT); },
  };
}
