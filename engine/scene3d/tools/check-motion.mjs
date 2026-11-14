// The motion gates of a scene, for every actor (see checks.mjs motion()), how far any two actors' bodies go
// into each other (checks.mjs overlap()), and how far a moving door goes into a body (checks.mjs doorSweep()). A film is checked scene by scene, in each scene's own time. No GPU.
//   node engine/scene3d/tools/check-motion.mjs engine/scene3d/scenes/zero.mjs|films/<slug> [--hz 240] [--joints]   (--joints: every joint's largest pop)
import { open } from './scene.mjs';
import { motion, feetSlide, pawSlide, overlap, doorSweep, sceneSource, GATES, TURN_GATE, OVERLAP_GATE, DOOR_GATE, DOOR_NEAR } from '../checks.mjs';
const args = process.argv.slice(2), hz = args.includes('--hz') ? Number(args[args.indexOf('--hz') + 1]) : 240;
// (a storyboard that cannot be played says so and stops, as check does)
const whole = await open(args[0], '64x36').catch(e => { if (e.cause?.name !== 'StoryError') throw e; console.error(e.message); process.exit(1); }), t0 = performance.now();
const failed = [], gate = (ok, what) => { if (!ok) failed.push(what); };
for (const [src, sc] of whole.built.scenes ? whole.built.scenes.map(sc => [sceneSource(whole, sc), sc]) : [[whole, { t0: 0 }]]) {
  if (sc.id) console.log(`scene ${sc.id} (${sc.t0.toFixed(2)} to ${sc.t1.toFixed(2)} s; the times below are the film's)`);
  const r = motion(src, { hz }), T = s => (s + sc.t0).toFixed(3);
  const mm = (v) => (v * 1000).toFixed(2) + ' mm', at = (o) => `${o.joint ?? o.limb} at ${T(o.at)} s`;
  for (const [who, m] of Object.entries(r)) {
    const four = src.built.cast[who].ch.desc.kind === 'quadruped', slide = four ? pawSlide(src, who) : feetSlide(src, who);
    console.log(`${who} (on screen ${m.onScreen.toFixed(2)} s)`);
    console.log(`  planted: ${slide.n} ${four ? 'paw' : 'foot'}-frames, worst slide ${mm(slide.worst)} at ${T(slide.at)} s`);
    console.log(`  pops:    largest velocity jump in 1/${hz} s ${m.pops.worst.toFixed(3)} m/s (${at(m.pops)})`);
    console.log(`  holds:   longest perfectly still joint ${m.holds.worst.toFixed(3)} s (${at(m.holds)})`);
    console.log(`  reach:   farthest past full length ${mm(m.reach.worst)} (${at(m.reach)})`);
    console.log(`  turns:   fastest skull, chest or hips over a frame ${m.turns.worst.toFixed(2)} rad/s (${at(m.turns)}; gate ${TURN_GATE})`);
    if (m.through) console.log(`  through: deepest inside the torso ${mm(m.through.worst)} (${at(m.through)})`);
    const where = (o) => `${who} ${at(o)}${sc.id ? ` (${sc.id})` : ''}`;
    gate(slide.worst < (four ? 2e-3 : 1e-5), `${who} planted ${mm(slide.worst)} at ${T(slide.at)} s (gate ${four ? '2 mm' : '0.01 mm'})`);
    gate(m.pops.worst < GATES.pops, `pops ${m.pops.worst.toFixed(2)} m/s, ${where(m.pops)} (gate ${GATES.pops})`);
    gate(m.holds.worst < GATES.holds, `holds ${m.holds.worst.toFixed(3)} s, ${where(m.holds)} (gate 1/3 s)`);
    gate(m.reach.worst < GATES.reach, `reach ${mm(m.reach.worst)}, ${where(m.reach)} (gate ${mm(GATES.reach)})`);
    gate(!m.through || m.through.worst < GATES.through, `through ${mm(m.through?.worst ?? 0)}, ${where(m.through ?? {})} (gate ${mm(GATES.through)})`);
    gate(m.turns.worst < TURN_GATE, `turns ${m.turns.worst.toFixed(2)} rad/s, ${where(m.turns)} (gate ${TURN_GATE})`);
    if (args.includes('--joints')) console.log('  ' + Object.entries(m.joints).sort((a, b) => b[1].pop - a[1].pop).map(([j, v]) => `${j} ${v.pop.toFixed(2)}@${T(v.at)}`).join('  '));
  }
  for (const p of Object.values(overlap(src).pairs)) {
    console.log(`overlap ${p.a} and ${p.b}: deepest ${mm(p.worst)}${p.worst > 0 ? ` (${p.partA} in ${p.partB} at ${T(p.at)} s)` : ''}; gate ${mm(OVERLAP_GATE)}`);
    gate(p.worst < OVERLAP_GATE, `overlap ${p.a} and ${p.b} ${mm(p.worst)} at ${T(p.at)} s`);
  }
}
// the doors, over the whole film (or scene) in its own time
const swept = doorSweep(whole);
if (!swept.length) console.log(`doors: no moving door comes within ${DOOR_NEAR * 100} cm of a body`);
for (const d of swept) {
  const sc = whole.built.scenes?.find(s => d.at < s.t1), shot = sc?.shots.find(s => d.at < s.t1);
  console.log(`door ${d.door} and ${d.who}'s ${d.part}: ${d.worst > 0 ? `deepest ${(d.worst * 1000).toFixed(2)} mm in` : `nearest ${(-d.worst * 1000).toFixed(2)} mm clear`} at ${d.at.toFixed(3)} s${shot ? ` (shot ${shot.id})` : ''}; gate ${(DOOR_GATE * 1000).toFixed(2)} mm in`);
  gate(d.worst < DOOR_GATE, `door ${d.door} through ${d.who}'s ${d.part} ${(d.worst * 1000).toFixed(2)} mm at ${d.at.toFixed(3)} s${shot ? ` (shot ${shot.id})` : ''}`);
}
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
console.log(failed.length ? `RESULT: ${failed.length} gate${failed.length > 1 ? 's' : ''} failed:\n  ${failed.join('\n  ')}` : 'RESULT: every gate passes');
process.exit(failed.length ? 1 : 0);
