// Turnaround sheet: each named character standing relaxed, seen at 8 yaws (one row each).
//   node engine/scene3d/tools/turnaround.mjs FILE.jpg man girl cat [--cols 8]
//   node engine/scene3d/tools/turnaround.mjs FILE.jpg path/to/character.mjs      (a file that exports one description)
// Two-legged characters are posed with the performer, four-legged ones with the critter
// performer. Every row is framed to the character's own height, so a cat fills its cell
// as a man does.
import { studio, loadCast } from './studio.mjs';
import { buildCharacter } from '../character.mjs';
import { createBiped } from '../biped.mjs';
import { createPerformer } from '../performer.mjs';
import { createQuadruped, createCritter } from '../quadruped.mjs';
const argv = process.argv.slice(2);
const ci = argv.indexOf('--cols'); const cols = ci >= 0 ? Number(argv.splice(ci, 2)[1]) : 8;
const [out, ...names] = argv;
const stage = await studio(440, 600);
const cells = [];
for (const name of names) {
  const desc = await loadCast(name);
  const t0 = performance.now(), ch = buildCharacter(desc); stage.scene.add(ch.group);
  console.log(`${desc.name}: built in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${Object.values(ch.triangles).reduce((a, b) => a + b, 0)} triangles, ${Object.keys(ch.bones).length} bones`);
  const four = desc.kind === 'quadruped';
  const top = Math.max(...Object.values(ch.rest).map((v) => v.y)) * (four ? 1.75 : 1.17);   // an animal is longer than it is tall: stand further back
  stage.aim([0, top / 2, 0], top);
  const rig = four ? createQuadruped(ch) : createBiped(ch);
  for (let i = 0; i < 8; i++) {
    const yaw = i * Math.PI / 4;
    if (four) createCritter(rig, { at: [0, 0, 0], yaw }).apply(0.4);
    else createPerformer(rig, { yaw }).apply(0.4);
    stage.setCamera({ pos: [0, top * 0.62, top * 3.6], target: [0, top * (four ? 0.3 : 0.5), 0], fov: 20 });
    cells.push(await stage.render(0));
  }
  stage.scene.remove(ch.group);
}
stage.sheet(out, cells, cols);
