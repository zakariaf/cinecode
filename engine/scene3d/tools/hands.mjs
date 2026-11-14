// Hands sheet: node engine/scene3d/tools/hands.mjs FILE.jpg man girl
// One row per character: the right hand open, pointing, gripping and waving, each seen
// from the front and from the character's right.
import { studio, loadCast } from './studio.mjs';
import { buildCharacter } from '../character.mjs';
import { createBiped, HANDS } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
const [out, ...names] = process.argv.slice(2);
const stage = await studio(360, 360);
const { THREE, scene } = stage;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const shapes = [
  ['open', { ...HANDS.open }],
  ['point', { ...HANDS.point }],
  ['grip', { ...HANDS.grip }],
  ['wave', { ...HANDS.open, wrist: [-0.15, 0.45, 0] }],
];
const cells = [];
for (const name of names) {
  const desc = await loadCast(name);
  const ch = buildCharacter(desc); scene.add(ch.group);
  const rig = createBiped(ch), L = desc.hands.length;
  for (const [, arm] of shapes) {
    const act = createPerformer(rig, { yaw: 0 });
    // the hand is held up and out to the side, clear of the body
    const sh = ch.rest.upperArmR, len = ch.rest.foreArmR.distanceTo(sh) + ch.rest.handR.distanceTo(ch.rest.foreArmR);
    act.layer((p) => Object.assign(p.armR, { reach: [sh.x - 0.62 * len, sh.y + 0.3 * len, sh.z + 0.4 * len], elbowDir: [-0.3, -1, 0.1], wrist: [0, 0, 0] }, arm));
    act.apply(0.4);
    const hand = ch.bones.handR, q = hand.getWorldQuaternion(new THREE.Quaternion());
    const mid = hand.getWorldPosition(V(0, 0, 0)).addScaledVector(V(-Math.cos(0.7), -Math.sin(0.7), 0).applyQuaternion(q), L * 0.45);   // the middle of the hand
    stage.aim(mid.toArray(), 1);
    for (const from of [V(0.15, 0.1, 1), V(-1, 0.1, 0.3)]) {
      stage.setCamera({ pos: mid.clone().addScaledVector(from.normalize(), L * 7.5).toArray(), target: mid.toArray(), fov: 16 });
      cells.push(await stage.render(0));
    }
  }
  scene.remove(ch.group);
}
stage.sheet(out, cells, 8, 2880);
