// Faces sheet: node engine/scene3d/tools/faces.mjs FILE.jpg man girl
// Four rows of seven per character:
//   1. neutral, then the expressions happy, worried, surprised, sad, sleepy, angry, from the front
//   2. the same, three-quarter view
//   3. the mouth at rest, then its shapes open, wide, round, smile, frown, closed, from the front
//   4. the same, three-quarter view
import { studio, loadCast } from './studio.mjs';
import { buildCharacter, EXPRESSIONS, MOUTHS } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
const [out, ...names] = process.argv.slice(2);
const stage = await studio(320, 320);
const V = stage.THREE.Vector3;
const faces = [
  [{}, ...Object.keys(EXPRESSIONS).map((e) => ({ expr: { [e]: 1 } }))],
  [{}, ...Object.keys(MOUTHS).filter((m) => m !== 'rest').map((m) => ({ mouth: { [m]: 1 } }))],
];
const cells = [];
for (const name of names) {
  const desc = await loadCast(name);
  const ch = buildCharacter(desc); stage.scene.add(ch.group);
  // framed on the skull (the first solid marked skull), a little below its middle to take in the chin
  const sk = desc.parts.find((p) => p.name === 'skin').ops.find((o) => o.skull), R = Math.max(...sk.r);
  const mid = new V(sk.c[0], sk.c[1] - 0.3 * R, sk.c[2]).sub(ch.rest.head);
  const rig = createBiped(ch);
  for (const row of faces) for (const yaw of [0, 0.75]) for (const face of row) {
    const act = createPerformer(rig, { yaw });
    act.layer((p) => { p.face = { ...p.face, blink: 0, ...face }; });
    act.apply(0.4);
    const c = mid.clone().applyMatrix4(ch.bones.head.matrixWorld);
    stage.aim([0, c.y, 0], 1);
    stage.setCamera({ pos: [c.x, c.y + R * 2, c.z + R * 14], target: c.toArray(), fov: 16 });
    cells.push(await stage.render(0));
  }
  stage.scene.remove(ch.group);
}
stage.sheet(out, cells, 7, 2240);
