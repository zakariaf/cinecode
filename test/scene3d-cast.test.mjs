// The boy (Milo) and the man in his work clothes (Dad, "params": { "wardrobe": "work" }): both build with no GPU, their
// garments are weighted as the skin under them, and every verb a film asks of them passes the motion gates: the boy
// sits on the floor, rolls a ball, claps, laughs, stands up, runs, jumps on the spot and looks up at the man; the man
// stands tired, lifts into a grin, sighs, crouches to the boy's height and walks with his case swinging; and he
// drives the car at the wheel. Posing only: no GPU.
//   node --test test/scene3d-cast.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const [{ openScene }, { motion, feetSlide, overlap, GATES, TURN_GATE, OVERLAP_GATE }, { buildCharacter }, { createBiped }, { createPerformer }, { createWorld }, { rollBall }, { RIGS, descOf }, { createCar }, { seatDriver }] = no3d ? Array(10).fill({}) : await Promise.all([
  import('../engine/scene3d/index.mjs'),
  import('../engine/scene3d/checks.mjs'),
  import('../engine/scene3d/character.mjs'),
  import('../engine/scene3d/biped.mjs'),
  import('../engine/scene3d/performer.mjs'),
  import('../engine/scene3d/motion.mjs'),
  import('../engine/scene3d/ball.mjs'),
  import('../engine/scene3d/library.mjs'),
  import('../engine/scene3d/car/drive.mjs'),
  import('../engine/scene3d/car/driver.mjs'),
]);

const BOY = { rig: 'boy' }, DAD = { rig: 'man', params: { wardrobe: 'work' } };
// a performer of a cast entry, as a film makes it (compile.mjs performerOf)
const actor = (c, world, name, o) => { const R = RIGS[c.rig]; return createPerformer(createBiped(buildCharacter(descOf(c))), { ...R.performer, stepLen: R.walk.stepLen, stepTime: R.walk.stepTime, world, name, ...o }); };
// a clip of the actors make(world) gives ({ name: act }; extra: { name: { ch, rig, act } } posed by their own apply)
const clip = (duration, make) => openScene({ fps: 24, duration, build(stage) {
  const world = createWorld(), acts = make(world), cast = {};
  for (const [name, act] of Object.entries(acts)) { stage.scene.add(act.rig.character.group); cast[name] = { ch: act.rig.character, rig: act.rig, act }; }
  stage.setCamera({ pos: [0, 1.4, 9], target: [0, 0.6, 0], fov: 50 });
  return { cast, update: (t) => { for (const a of Object.values(acts)) a.apply(t); } };
} }, { width: 64, height: 36 });
const clean = (m, what) => {
  const at = (o) => `${o.joint ?? o.limb} at ${o.at.toFixed(3)} s`;
  assert.ok(m.pops.worst < GATES.pops, `${what}: velocity jump ${m.pops.worst.toFixed(2)} m/s (${at(m.pops)})`);
  assert.ok(m.holds.worst < GATES.holds, `${what}: perfectly still ${m.holds.worst.toFixed(3)} s (${at(m.holds)})`);
  assert.ok(m.reach.worst < GATES.reach, `${what}: ${(m.reach.worst * 1000).toFixed(1)} mm past full length (${at(m.reach)})`);
  assert.ok(m.through.worst < GATES.through, `${what}: ${(m.through.worst * 1000).toFixed(1)} mm inside the torso (${at(m.through)})`);
  assert.ok(m.turns.worst < TURN_GATE, `${what}: ${m.turns.joint} turned ${m.turns.worst.toFixed(2)} rad/s (${at(m.turns)})`);
};

test('the boy and the man in work clothes build with no GPU, under 300,000 triangles, the clothes weighted as the skin', { skip: no3d }, () => {
  for (const c of [BOY, DAD, { rig: 'boy', params: { shirt: '#c83a3a', hair: '#b07040' } }]) {
    const ch = buildCharacter(descOf(c)), tri = Object.values(ch.triangles).reduce((a, b) => a + b, 0);
    assert.ok(tri > 100000 && tri < 300000, `${JSON.stringify(c)}: ${tri} triangles`);
    assert.ok(ch.desc.parts.some((p) => p.fit), `${JSON.stringify(c)}: a garment with fit`);
  }
  const red = buildCharacter(descOf({ rig: 'boy', params: { shirt: '#c83a3a' } }));
  assert.equal(red.meshes.shirt.material.color?.getHex?.() ?? red.desc.parts.find((p) => p.name === 'shirt').material.color, 0xc83a3a);
  // his case: a bone on the right hand, a hang block; the plain man has neither
  assert.ok(descOf(DAD).hang?.length && buildCharacter(descOf(DAD)).bones.bag);
  assert.equal(descOf({ rig: 'man' }).hang, undefined);
});

// Milo's afternoon and Dad's homecoming in one clip: every verb once.
const film = no3d ? null : await clip(22, (world) => {
  const b = actor(BOY, world, 'boy', { at: [0, 0], yaw: 0 }), d = actor(DAD, world, 'dad', { at: [1.3, 3.6], yaw: Math.PI });
  b.sit({ t0: 0.3 });                                         // on the floor
  rollBall(b, { from: 0, t0: 3.2, to: [0.2, 2], stop: 5 });   // rolls the ball
  b.clap({ t0: 5.2, dur: 1.6 }); b.laugh({ t0: 5.5 });        // claps and laughs
  b.stand({ t0: 7.2 });                                       // stands up
  b.runTo([1.1, 2.4], { face: [1.3, 3.6] });                 // runs to Dad
  b.jump({ t0: b.time + 0.2 }); b.jump({ t0: b.time + 0.15 }); b.clap({ t0: b.time - 1.2, dur: 1.2 });   // jumps on the spot
  b.lookAt('dad', { t0: 9, t1: 20 });                         // looks up at him
  d.tired({ t0: 0, t1: 10.6 }); d.sigh({ t0: 2.5 });          // stands tired, breathes out
  d.express('happy', { t0: 10, t1: 22 });                     // lifts into a grin
  d.crouch({ t0: 11, dur: 0.85, amount: 0.8 }); d.crouch({ t0: 14, dur: 0.7, amount: 0 });   // down to the boy's height and up
  d.walkTo([3.2, 1.5], { t0: 15.5 }); d.walkTo([3.2, -0.5]);  // walks with the case
  return { boy: b, dad: d };
});

for (const who of ['boy', 'dad']) {
  test(`every verb on the ${who}: no pops, no frozen holds, no limb asked past its length, no arm through the body, no foot sliding`, { skip: no3d }, () => {
    clean(motion(film)[who], who);
    const f = feetSlide(film, who);
    assert.ok(f.worst < 1e-5, `${who}: a planted foot slid ${(f.worst * 1000).toFixed(3)} mm`);
  });
}
test('the boy and Dad do not go into each other', { skip: no3d }, () => {
  const o = overlap(film);
  assert.ok(o.worst < OVERLAP_GATE, `${o.a}'s ${o.partA} ${(o.worst * 1000).toFixed(1)} mm into ${o.b}'s ${o.partB} at ${o.at.toFixed(2)} s`);
});

test('the case hangs: it swings as he walks, comes to rest when he stands, is held low at his side when he crouches', { skip: no3d }, () => {
  const d = film.built.cast.dad.act, at = (t) => d.hangAt(t)[0];
  const lean = (t) => { const { p, b } = at(t); return Math.atan2(Math.hypot(b.x - p.x, b.z - p.z), p.y - b.y); };
  const walkSwing = Math.max(...Array.from({ length: 60 }, (_, i) => lean(16 + i * 0.05)));
  assert.ok(walkSwing > 0.05, `the case swings ${walkSwing.toFixed(3)} rad walking`);
  assert.ok(lean(9.5) < 0.03, `still ${lean(9.5).toFixed(3)} rad standing`);
  // (crouched, the hand is low at his side, as far down as the arm reaches: the case just off the floor, never through it)
  const bottom = (t) => { film.built.update(t); const b = film.built.cast.dad.ch.bones.bag, q = b.getWorldQuaternion(b.quaternion.clone()); return b.getWorldPosition(b.position.clone()).add(b.up.clone().set(0, -descOf(DAD).hang[0].drop, 0).applyQuaternion(q)).y; };
  for (const t of [12.5, 13.5]) { const y = bottom(t); assert.ok(y > -0.005 && y < 0.2, `the case's bottom ${y.toFixed(3)} m over the floor at ${t} s, crouched`); }
  for (let t = 0; t < 22; t += 0.25) assert.ok(bottom(t) > -0.005, `the case's bottom through the floor at ${t} s`);
  // a frame asked for alone, in another order, is the same
  const a = at(17.3).b.clone(); at(3); assert.ok(a.distanceTo(at(17.3).b) < 1e-12);
});

test('the man in work clothes drives at the wheel: his motion passes the gates, his case is out of the picture', { skip: no3d }, async () => {
  let seated;
  const src = await openScene({ fps: 24, duration: 9, build(stage) {
    const car = createCar({ at: [0, -8], yaw: 0 });
    car.driveTo([[0, 6]], { t0: 0.5, speed: 3 });
    stage.scene.add(car.mesh.group);
    seated = seatDriver(car, descOf(DAD));
    stage.setCamera({ pos: [8, 2, 0], target: [0, 0.8, 0], fov: 60 });
    return { cast: { dad: { ch: seated.ch, rig: seated.act.rig, act: seated.act } }, update: (t) => { car.apply(t); seated.apply(t); } };
  } }, { width: 64, height: 36 });
  assert.equal(seated.ch.meshes.bag.visible, false);
  const m = motion(src).dad;
  // (in the seat: the hands on the wheel; his feet are on the pedals, not planted on a floor, and he rides with the car)
  assert.ok(m.pops.worst < GATES.pops, `velocity jump ${m.pops.worst.toFixed(2)} m/s (${m.pops.joint} at ${m.pops.at.toFixed(3)} s)`);
  assert.ok(m.reach.worst < GATES.reach, `${(m.reach.worst * 1000).toFixed(1)} mm past full length (${m.reach.limb})`);
  assert.ok(m.turns.worst < TURN_GATE, `${m.turns.joint} turned ${m.turns.worst.toFixed(2)} rad/s`);
});

test('a cast entry\'s params are checked against its rig: the man\'s wardrobe, the boy\'s colours', { skip: no3d }, async () => {
  const { unbuilt } = await import('../engine/scene3d/compile.mjs');
  const msgs = unbuilt({ cast: { dad: { rig: 'man', params: { wardrobe: 'suit' } }, milo: { rig: 'boy', params: { shirt: 'red', hat: '#fff000', hair: '#3a2a20' } }, girl: { rig: 'girl', params: { dress: '#ffffff' } } } }).map((p) => p.message);
  assert.deepEqual(msgs, [
    'cast.dad.params.wardrobe: must be "work" (got "suit")',
    'cast.milo.params.shirt: must be a colour "#rrggbb" (got "red")',
    'cast.milo.params.hat: the param "hat" for the rig "boy" (it has: skin, hair, shirt, shorts) is not built for the 3D engine yet',
    'cast.girl.params.dress: the param "dress" for the rig "girl" is not built for the 3D engine yet',
  ]);
  assert.deepEqual(unbuilt({ cast: { dad: { rig: 'man', params: { wardrobe: 'work' } }, milo: { rig: 'boy', params: { shirt: '#c83a3a' } } } }), []);
});

// ---- round 3: the cat's mouth, eased looks, idle life under a look, the boy's shorts at deep hip flex
test('the cat\'s mouth opens on a meow and a yawn and is shut (no line) otherwise; it watches what it bats', { skip: no3d }, async () => {
  const { createQuadruped, createCritter } = await import('../engine/scene3d/quadruped.mjs');
  const { cat } = await import('../engine/scene3d/cast/cat.mjs');
  assert.equal(cat.face.mouth.line, false, 'a shut cat\'s mouth draws nothing');
  const ch = buildCharacter(cat), cr = createCritter(createQuadruped(ch), { at: [0, 0, 0], yaw: 0 });
  cr.meow({ t0: 1, dur: 0.7 }); cr.yawn({ t0: 3, dur: 1.6 });
  const open = (t) => cr.poseAt(t).face.mouth?.open ?? 0;
  assert.equal(open(0.5), 0); assert.equal(open(2.2), 0); assert.equal(open(5), 0);
  assert.ok(open(1.25) > 0.9, `mid-meow the mouth is open (${open(1.25).toFixed(2)})`);
  assert.ok(open(3.8) > 0.9, `mid-yawn the mouth is open (${open(3.8).toFixed(2)})`);
  // the mouth is wired into the face: set() takes it without complaint
  ch.face.set(cr.poseAt(1.25).face);
  // batting a ball on the floor ahead, the head goes down to it, and comes back up after
  const c2 = createCritter(createQuadruped(buildCharacter(cat)), { at: [0, 0, 0], yaw: 0 });
  c2.bat({ t0: 1, at: [0.04, 0, 0.25] });
  assert.ok(c2.poseAt(1).head.pitch > 0.4, `the head looks down at the strike (${c2.poseAt(1).head.pitch.toFixed(2)})`);
  assert.ok(c2.poseAt(2).head.pitch < 0.2, 'and comes back up');
});

test('a look eases: an 80 degree look takes the head about half a second, the eyes first and the chest after; a listener\'s head is never still', { skip: no3d }, async () => {
  const { HEAD_TURN } = await import('../engine/scene3d/performer.mjs');
  const THREE = await import('three/webgpu');
  const ch = buildCharacter(descOf(DAD)), act = createPerformer(createBiped(ch), { ...RIGS.man.performer, yaw: 0 });
  // something 80 degrees to his left, looked at from 1 s
  const a = 80 * Math.PI / 180;
  act.lookAt([Math.sin(a) * 3, 1.6, Math.cos(a) * 3], { t0: 1 });
  const e = new THREE.Euler(), q = new THREE.Quaternion(), yawOf = (bone) => { ch.bones[bone].getWorldQuaternion(q); return e.setFromQuaternion(q, 'YXZ').y; };
  let fast = 0, prev = null, gazeHalf = null;
  const T = [], H = [], C = [];
  for (let t = 0.9; t < 3.5; t += 1 / 120) {
    act.apply(t); ch.group.updateMatrixWorld(true);
    const h = yawOf('head'), c = yawOf('chest');
    if (prev !== null) fast = Math.max(fast, Math.abs(h - prev) * 120);
    prev = h; T.push(t); H.push(h); C.push(c);
    if (gazeHalf === null && act.poseAt(t).pose.face.gaze[0] > 0.5) gazeHalf = t;
  }
  // when each is half way to where it ends up
  const halfOf = (A) => { const a0 = A[0], a1 = A[A.length - 1]; return T[A.findIndex((v) => (v - a0) / (a1 - a0) > 0.5)]; };
  const half = { head: halfOf(H), chest: halfOf(C) };
  assert.ok(fast < HEAD_TURN * 1.35, `the head turned at most ${fast.toFixed(2)} rad/s (HEAD_TURN ${HEAD_TURN})`);
  assert.ok(half.head - 1 > 0.25, `half way round after ${(half.head - 1).toFixed(2)} s, not in a few frames`);
  assert.ok(gazeHalf !== null && gazeHalf < half.head, 'the eyes lead the head');
  assert.ok(half.chest !== null && half.chest > half.head, `the chest comes after the head (${half.chest?.toFixed(2)} s against ${half.head.toFixed(2)} s)`);
  // held on the look, standing: the head drifts a few degrees about it
  let lo = 1e9, hi = -1e9;
  for (let t = 4; t < 8; t += 1 / 24) { act.apply(t); ch.group.updateMatrixWorld(true); const h = yawOf('head'); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  assert.ok((hi - lo) * 180 / Math.PI > 2, `a listener's head moves ${((hi - lo) * 180 / Math.PI).toFixed(1)} degrees in 4 s`);
});

test('the boy\'s skin is cut away where the shorts always cover it, so a deep bend at the hip cannot bring it through', { skip: no3d }, async () => {
  const ch = buildCharacter(descOf(BOY)), P = ch.meshes.skin.geometry.attributes.rest;
  let inside = 0;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); if (Math.abs(x) < 0.1 && y > 0.36 && y < 0.46) inside++; }
  assert.equal(inside, 0, `${inside} skin points lie under the shorts`);
  assert.ok(ch.meshes.shorts && ch.meshes.shirt, 'the clothes are still there');
});
