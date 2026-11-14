// The motion system (docs/scene3d-motion.md): Scene Zero passes the motion gates for every actor, a pose
// depends only on its time, the verbs chain, and a thrown ball lands and stops when it is told to. Posing
// only: no GPU.
//   node --test test/scene3d-bodies-motion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const [{ openScene }, { motion, overlap, GATES, TURN_GATE, OVERLAP_GATE }, { buildCharacter }, { createBiped }, { createPerformer }, { createQuadruped, createCritter }, { createWorld }, { throwTo }, { man }, { cat }, { default: zero }] = no3d ? [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] : await Promise.all([
  import('../engine/scene3d/index.mjs'),
  import('../engine/scene3d/checks.mjs'),
  import('../engine/scene3d/character.mjs'),
  import('../engine/scene3d/biped.mjs'),
  import('../engine/scene3d/performer.mjs'),
  import('../engine/scene3d/quadruped.mjs'),
  import('../engine/scene3d/motion.mjs'),
  import('../engine/scene3d/ball.mjs'),
  import('../engine/scene3d/cast/man.mjs'),
  import('../engine/scene3d/cast/cat.mjs'),
  import('../engine/scene3d/scenes/zero.mjs'),
]);

// The gates (see checks.mjs motion()). Contacts (a foot striking the floor, a jump landing) change speed by up to
// about 4.7 m/s in one 1/240 s step in Scene Zero; a knee that flips or a hand that snaps jumps by 8 to 70.
const GATE = GATES;
const src = no3d ? null : await openScene(zero, { width: 64, height: 36 });
const r = no3d ? null : motion(src);

for (const who of ['man', 'girl', 'cat']) {
  test(`Scene Zero, ${who}: no pops, no frozen holds, no limb asked past its length${who === 'cat' ? '' : ', no arm through the body'}`, { skip: no3d }, () => {
    const m = r[who], at = (o) => `${o.joint ?? o.limb} at ${o.at.toFixed(3)} s`;
    assert.ok(m.onScreen > 7, `on screen ${m.onScreen} s`);
    assert.ok(m.pops.worst < GATE.pops, `largest velocity jump ${m.pops.worst.toFixed(2)} m/s (${at(m.pops)})`);
    assert.ok(m.holds.worst < GATE.holds, `perfectly still for ${m.holds.worst.toFixed(3)} s (${at(m.holds)})`);
    assert.ok(m.reach.worst < GATE.reach, `asked ${(m.reach.worst * 1000).toFixed(1)} mm past full length (${at(m.reach)})`);
    if (m.through) assert.ok(m.through.worst < GATE.through, `${(m.through.worst * 1000).toFixed(1)} mm inside the torso (${at(m.through)})`);
    assert.ok(m.turns.worst < TURN_GATE, `${who === 'cat' ? 'skull, chest or hips' : 'head, chest or pelvis'} turned ${m.turns.worst.toFixed(2)} rad/s (${at(m.turns)})`);
  });
}

test('Scene Zero: no body goes into another', { skip: no3d }, () => {
  const o = overlap(src);
  assert.ok(o.worst < OVERLAP_GATE, `${o.a}'s ${o.partA} ${(o.worst * 1000).toFixed(1)} mm into ${o.b}'s ${o.partB} at ${o.at.toFixed(2)} s`);
});

// A clip of a few actors made by `make(world)` → { name: act } (no room, no camera work: posing only).
const clip = (duration, make) => openScene({ fps: 24, duration, build(stage) {
  const world = createWorld(), acts = make(world), cast = {};
  for (const [name, act] of Object.entries(acts)) { stage.scene.add(act.rig.character.group); cast[name] = { ch: act.rig.character, rig: act.rig, act }; }
  stage.setCamera({ pos: [0, 1.5, 7], target: [0, 0.5, 0], fov: 50 });
  return { cast, update: (t) => { for (const a of Object.values(acts)) a.apply(t); } };
} }, { width: 64, height: 36 });
const person = (world, name, o) => createPerformer(createBiped(buildCharacter(man)), { world, name, ...o });
const kitty = (world, name, o) => createCritter(createQuadruped(buildCharacter(cat)), { world, name, ...o });
const clean = (m, what) => {
  assert.ok(m.pops.worst < GATE.pops, `${what}: velocity jump ${m.pops.worst.toFixed(2)} m/s (${m.pops.joint} at ${m.pops.at.toFixed(3)} s)`);
  assert.ok(m.reach.worst < GATE.reach, `${what}: ${(m.reach.worst * 1000).toFixed(1)} mm past full length (${m.reach.limb} at ${m.reach.at.toFixed(3)} s)`);
  assert.ok(m.turns.worst < TURN_GATE, `${what}: ${m.turns.joint} turned ${m.turns.worst.toFixed(2)} rad/s at ${m.turns.at.toFixed(3)} s`);
};

test('the cat leaps 0.2 to 2 m, down off a seat, up onto it and along the floor, without a pop', { skip: no3d }, async () => {
  for (const [kind, D] of [['down', 0.2], ['down', 1], ['up', 0.35], ['up', 1.5], ['floor', 0.5], ['floor', 2]]) {
    const s = await clip(4, (world) => { const c = kitty(world, 'cat', { at: [0, kind === 'down' ? 0.42 : 0, 0], sit: kind === 'down' ? 1 : 0 }); c.hopTo([0, kind === 'up' ? 0.42 : 0, D], { t0: 1 }); return { cat: c }; });
    clean(motion(s).cat, `${kind} ${D} m`);
  }
});

test('turning round: the head never whips, the cat turns on the spot, the man sits on a seat and stands', { skip: no3d }, async () => {
  const s = await clip(9, (world) => {
    const m = person(world, 'man', { at: [0, 0], yaw: 0 }), c = kitty(world, 'cat', { at: [2, 0, 0], yaw: 0 });
    m.turnTo(Math.PI, { t0: 0.5 }); m.walkTo([0, 1.5]); m.turnTo(-2); m.sit({ on: [0, 0.45, 2.3] }); m.wait(1); m.stand();
    m.lookAt([0, 1.2, -3], { t0: 0.3 });
    c.wait(0.5); c.turnTo(Math.PI); c.wait(0.3); c.turnTo([2, 0, 2]); c.trotTo([2, 0, -1]);
    return { man: m, cat: c };
  });
  const r = motion(s);
  clean(r.man, 'man'); clean(r.cat, 'cat');
});

// films/_test3d s02 opened with a sitting cat looking from its first frame: its keenness had two keys at time 0 (0 / 0),
// and its tail and ears were NaN for 0.15 s (drawn: no head, no tail)
test('a cat that looks from its first frame stays a number', { skip: no3d }, async () => {
  const s = await clip(1, (world) => { const c = kitty(world, 'cat', { at: [0, 0, 0], sit: 1 }); c.look([1, 0.3, 1], { t0: 0, t1: 1 }); c.alert([0, 0], [0.15, 1]); return { cat: c }; });
  clean(motion(s).cat, 'cat');
});

test('the checks catch what they are for: a head yanked round in a frame, two people walking through each other', { skip: no3d }, async () => {
  const yank = await clip(2, (world) => { const m = person(world, 'man', { at: [0, 0] }); m.wait(2); return { man: m }; });
  const pose = yank.built.update;
  yank.built.update = (t) => { pose(t); if (t > 1) { const h = yank.built.cast.man.ch.bones.head; h.rotation.y += 1; h.updateMatrixWorld(true); } };
  assert.ok(motion(yank).man.turns.worst > TURN_GATE, 'a head turned 1 rad in one step');
  // a joint that is not a number (NaN never compares greater than a gate)
  yank.built.update = (t) => { pose(t); if (t > 1 && t < 1.2) { const h = yank.built.cast.man.ch.bones.index3L; h.rotation.x = NaN; h.updateMatrixWorld(true); } };
  const nan = motion(yank).man.pops;
  assert.ok(nan.worst === Infinity && nan.joint === 'index3L', `a fingertip that is NaN: ${JSON.stringify(nan)}`);
  // walking straight at each other: without a world they meet; with one, each bows round the other
  const cross = (steer) => clip(5, (world) => {
    const w = steer ? world : undefined, a = person(w, 'a', { at: [-2, 0], yaw: Math.PI / 2 }), b = person(w, 'b', { at: [2, 0.1], yaw: -Math.PI / 2 });
    a.walkTo([2, 0]); b.walkTo([-2, 0.1]);
    return { a, b };
  });
  assert.ok(overlap(await cross(false)).worst > 0.1, 'walking through each other');
  const o = overlap(await cross(true));
  assert.ok(o.worst < OVERLAP_GATE, `steered: ${o.partA} ${(o.worst * 1000).toFixed(1)} mm into ${o.partB} at ${o.at.toFixed(2)} s`);
});

test('Scene Zero: a pose depends only on its time, whatever was asked before (looks, the world, the held ball)', { skip: no3d }, async () => {
  const read = (s) => Object.values(s.built.cast).map(({ ch }) => ['pelvis', 'hips', 'head', 'handL', 'handR', 'fPawL'].filter((n) => ch.bones[n]).map((n) => [...ch.bones[n].matrixWorld.elements].map((v) => v.toFixed(7)).join()).join('|')).join('/');
  const fresh = await openScene(zero, { width: 64, height: 36 });
  fresh.built.update(5.6); const want = read(fresh);
  for (const t of [9.1, 0.2, 7.7, 5.3]) src.built.update(t);
  src.built.update(5.6);
  assert.equal(read(src), want);
});

test('the verbs chain: each starts where the last ended and returns its end', { skip: no3d }, () => {
  const world = createWorld();
  const m = createPerformer(createBiped(buildCharacter(man)), { world, name: 'man', at: [0, 0] });
  const c = createCritter(createQuadruped(buildCharacter(cat)), { world, name: 'cat', at: [1, 0, 1] });
  const ends = [m.walkTo([0, 2]), m.turnTo([3, 2]), m.crouchTo(1), m.crouchTo(0), m.sit({ on: [3.3, 0.45, 2.1] }), m.stand(), m.wait(0.5), m.runTo([0, 0], { face: 'cat' }), m.jump({}), m.sit(), m.stand()];
  for (let i = 1; i < ends.length; i++) assert.ok(ends[i] >= ends[i - 1] && ends[i] === Math.max(...ends.slice(0, i + 1)), `verb ${i} ends at ${ends[i]}`);
  assert.equal(m.time, ends[ends.length - 1]);
  m.lookAt('cat', { t0: 1 }); m.wave({ t0: 2 }); m.point({ t0: 4, at: 'cat' }); m.clap({ t0: 6 }); m.reach({ t0: 8, to: 'cat' }); m.express('happy', { t0: 1 });
  assert.equal(m.time, ends[ends.length - 1], 'gestures do not move the clock');
  const cends = [c.walkTo([1, 0, 2]), c.trotTo([2, 0, 2]), c.runTo([3, 0, 1]), c.sit(), c.lie(), c.stand(), c.hopTo([3, 0, 0])];
  for (let i = 1; i < cends.length; i++) assert.ok(cends[i] > cends[i - 1], `critter verb ${i}`);
  c.look('man', { t0: 0.5, t1: 3 });
  for (const t of [0, 1.7, 4.2, m.time]) { m.apply(t); c.apply(t); }
  assert.throws(() => world.head('dog', 1), /nothing called "dog" \(there is: man, cat\)/);
});

test('a thrown ball lands where and when it is told, and stops on time', { skip: no3d }, () => {
  const p = throwTo({ t0: 1, p0: [0, 1, 0], to: [2, 1], land: 1.6, stop: 3.2, r: 0.1 });
  const a = p.at(1.6).pos;
  assert.ok(Math.abs(p.segs[0].t1 - 1.6) < 1e-9 && Math.hypot(a[0] - 2, a[2] - 1) < 1e-9, `lands at ${a} at ${p.segs[0].t1} s`);   // (squashed a little at the knock)
  assert.ok(Math.abs(p.tStop - 3.2) < 1e-9, `stops at ${p.tStop}`);
  assert.deepEqual(p.at(3.2).pos, p.at(4).pos);
  assert.ok(Math.hypot(...p.at(3.19).vel) > 0, 'still rolling just before');
  assert.throws(() => throwTo({ t0: 1, p0: [0, 1, 0], to: [2, 1], land: 1.6, stop: 1.7 }), /still bouncing/);
});
