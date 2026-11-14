// Bending, before and after: node engine/scene3d/tools/bend.mjs FILE.jpg man girl
// Two rows per character. The top row is plain skinning (the description with its `bend`
// marks taken off); the bottom row is the character as written, with a helper at every
// marked joint. Across: a deep crouch from the front quarter, the side and the back
// quarter, then one arm raised high and the other held out, from the front and the back.
import { studio, loadCast } from './studio.mjs';
import { buildCharacter } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
const [out, ...names] = process.argv.slice(2);
const stage = await studio(440, 520);
const cells = [];
for (const name of names) {
  const desc = await loadCast(name);
  const plain = { ...desc, joints: Object.fromEntries(Object.entries(desc.joints).map(([n, j]) => [n, { ...j, bend: undefined }])) };
  for (const d of [plain, desc]) {
    const ch = buildCharacter(d); stage.scene.add(ch.group);
    const rig = createBiped(ch), top = ch.rest.head.y * 1.3;
    stage.aim([0, top / 2, 0], top);
    for (const [pose, yaw] of [['crouch', 0.7], ['crouch', Math.PI / 2], ['crouch', 2.5], ['arms', 0], ['arms', Math.PI]]) {
      const act = createPerformer(rig, { yaw });
      if (pose === 'crouch') act.crouch({ t0: 0, dur: 0.7, amount: 1 });
      else act.layer((p) => {
        Object.assign(p.armR, { swing: 2.72, spread: 0.32, twist: 0.25, elbow: 0.38, curl: 0.05 });
        Object.assign(p.armL, { swing: 0, spread: 1.5, twist: 0, elbow: 1.7, curl: 0.3 });
      });
      act.apply(3);
      const mid = pose === 'crouch' ? top * 0.3 : top * 0.56;
      stage.setCamera({ pos: [0, mid + top * 0.1, top * 2.9], target: [0, mid, 0], fov: 20 });
      cells.push(await stage.render(0));
    }
    stage.scene.remove(ch.group);
  }
}
stage.sheet(out, cells, 5, 2200);
