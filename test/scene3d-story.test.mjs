// The storyboard's beats for the place "home", the car, the front door, the ball and the cat (docs/scene3d.md): each
// compiles with no GPU, its picture is a pure function of time, lint's motion checks pass on a small storyboard that
// uses it, the plan and the picture agree, and what cannot be played fails by name.
//   node --test test/scene3d-story.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const noGpu = () => typeof GPUBufferUsage === 'undefined' && globalThis.navigator?.gpu === undefined
  && !process.report.getReport().sharedObjects.some(f => /webgpu|dawn/i.test(f));

const film = (cast, scenes) => ({
  title: 'story', format: { width: 640, height: 360, fps: 24, captions: 'none', engine: '3d' }, cast,
  sets: { home: { kit: 'home' } },
  scenes: scenes.map((s, i) => ({ id: `s0${i + 1}`, set: 'home', time: 'golden', ambience: 'none', music: 'none', transition: 'cut', ...s })),
});
const shot = (id, camera, beats, extra = {}) => ({ id, camera, beats, ...extra });

// the car: drive along the road into the drive arriving at a time, its lamps and engine, the rider out and the door
// shut; a second scene: a drive braked short with a stop
const CAR = film({ car: { rig: 'car', name: 'Car', params: { color: '#c0503a' } }, dad: { rig: 'man', name: 'Dad' } }, [
  { actors: { car: { at: 'street_left' }, dad: { on: 'car' } }, shots: [
    shot('1.1', { size: 'wide', on: ['car'] }, [
      { do: 'set', who: 'car', params: { lights: 'on', engine: 'on' } },
      { do: 'drive', who: 'car', to: 'drive', arrive: 7 },
      { do: 'set', who: 'car', params: { engine: 'off', lights: 'off' }, after: 0.5 }]),
    shot('1.2', { size: 'medium', on: ['dad'] }, [
      { do: 'place', who: 'dad', to: 'drive_door', face: 'left' },
      { do: 'open', to: 'car', dur: 0, with: 'prev' },
      { do: 'close', to: 'car', after: 0.4 }], { hold: 1.5 })] },
  { actors: { car: { at: 'street_left' } }, shots: [
    shot('2.1', { size: 'wide', on: ['car'], area: 'outside' }, [
      { do: 'drive', who: 'car', to: 'x:1000,y:-380', dur: 8 },
      { do: 'stop', who: 'car', with: 'prev', after: 3 }], { hold: 1 })] },
]);
// the front door: flung open, the boy and the cat out through it, the door closed softly; a shot inside, one outside
const DOOR = film({ milo: { rig: 'girl', name: 'Milo' }, cat: { rig: 'cat', name: 'Cat' } }, [
  { actors: { milo: { at: 'x:2410,y:900', face: 'left' }, cat: { at: 'x:2350,y:900', face: 'left' } }, shots: [
    shot('1.1', { size: 'full', on: ['milo'], area: 'inside' }, [{ wait: 1 }]),
    shot('1.2', { size: 'full', on: ['door'] }, [
      { do: 'open', to: 'door' },
      { do: 'run', who: 'cat', to: 'x:2330,y:510', after: 0.3 },
      { do: 'walk', who: 'milo', to: 'x:2400,y:500', speed: 1.4, with: 'prev', after: 0.5 },
      { do: 'close', to: 'door', speed: 0.8 }], { hold: 1.5 })] },
]);
// the ball: rolled from the hands of the sitting boy, pounced on and knocked on, a skid, chased and batted back; the
// cat leaps onto the window seat and looks out; the boy stands and picks the ball up
const BALL = film({ milo: { rig: 'girl', name: 'Milo' }, cat: { rig: 'cat', name: 'Cat' }, ball: { rig: 'ball', name: 'Ball' } }, [
  { actors: { milo: { at: 'x:1960,y:1000', face: 'right', pose: 'sit' }, cat: { at: 'x:2080,y:905', face: 'right' }, ball: { on: 'milo' } }, shots: [
    shot('1.1', { size: 'full', on: ['milo', 'cat'] }, [
      { do: 'roll', who: 'ball', to: 'x:2200,y:985' },
      { do: 'hop', who: 'cat', to: 'near:ball', with: 'prev', after: 0.9 },
      { do: 'roll', who: 'ball', to: 'x:2160,y:1090', from: 'cat', with: 'prev' },
      { do: 'gesture', who: 'cat', name: 'skid', with: 'prev' }]),
    shot('1.2', { size: 'wide', on: ['cat'], move: 'track' }, [
      { do: 'run', who: 'cat', to: 'near:ball' },
      { do: 'roll', who: 'ball', to: 'x:2020,y:1010', from: 'cat' },
      { do: 'walk', who: 'cat', to: 'x:1830,y:880' },
      { do: 'hop', who: 'cat', to: 'window_seat' },
      { do: 'look', who: 'cat', to: 'drive' }], { hold: 1 }),
    shot('1.3', { size: 'full', on: ['milo'] }, [
      { do: 'stand', who: 'milo' },
      { do: 'hop', who: 'ball', to: 'on:milo' }], { hold: 1 })] },
]);

async function lay(j) {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-story3d-'));
  try { return compile(await loadFilm(j, { dir })); } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function open(plan) {
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  return openScene(compileScene(plan), { width: 64, height: 36 });
}
// every joint and part of a scene that is drawn at t: the characters' bones, the car's parts, the ball, the front door
function snapshot(src, t) {
  src.built.update(t);
  const out = [];
  src.stage.scene.updateMatrixWorld(true);
  src.stage.scene.traverseVisible(o => { if (o.isBone || /^(body|door|wheel_|steer_)/.test(o.name) || o.parent?.type === 'Scene') out.push(o.name, ...o.matrixWorld.elements.map(v => Math.round(v * 1e6))); });
  return out;
}
async function lintClean(plan) {
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const r = await lintFilm(plan);
  assert.deepEqual(r.errors.map(e => `${e.rule} ${e.shot} ${e.message}`), [], 'lint finds nothing');
  return r;
}
// the same pictures posed forward and backward: a pure function of time
async function pure(plan, times) {
  const a = await open(plan), b = await open(plan);
  const f = times.map(t => snapshot(a, t)), r = [...times].reverse().map(t => snapshot(b, t)).reverse();
  times.forEach((t, i) => assert.deepEqual(f[i], r[i], `the same pose at ${t} s in either order`));
  a.close(); b.close();
}

test('the car: drives along the road into the drive, arriving when asked; lamps, engine, the rider out, its door; a stop', { skip: no3d }, async () => {
  const plan = await lay(CAR), src = await open(plan), [s1, s2] = src.built.scenes;
  const sh = plan.shots.find(s => s.id === '1.1'), drive = s1.drivers.get('car'), A = drive.act;
  // (arrive: 7 s into the shot it stands on its mark, the drive anchor)
  const stopAt = sh.t0 + 7 - s1.t0;
  assert.ok(A.speed(stopAt - 0.5) > 0.2 && A.speed(stopAt + 0.01) === 0, `it is still moving 0.5 s before ${stopAt.toFixed(2)} s and stands then`);
  const p = A.where(stopAt + 0.1);
  assert.ok(Math.hypot(p[0] - 6.5, p[1] + 5.4) < 0.02, `it stops on the drive anchor (${p})`);
  assert.ok(A.poseAt(1).head === 1 && A.poseAt(stopAt + 1).head === 0, 'the lamps are on while it drives, off after');
  // (the rider: drawn at the wheel until the cut, then standing by the car; the door open at the cut, shut after)
  const sh2 = plan.shots.find(s => s.id === '1.2'), tc = sh2.t0 - s1.t0;
  assert.ok(!s1.drivers.get('dad').visibleAt(tc - 0.1) && s1.drivers.get('dad').visibleAt(tc + 0.05), 'the rider stands by the car from the cut');
  src.built.update(sh2.t0 - 0.2); assert.ok(src.built.cast.dad.seated.group.visible, 'and sits at the wheel before it');
  src.built.update(sh2.t0 + 0.1); assert.ok(!src.built.cast.dad.seated.group.visible, 'not after');
  assert.ok(A.poseAt(tc + 0.01).door > 0.99 && A.poseAt(tc + 1.2).door === 0, 'its door is open at the cut and swings shut');
  assert.equal(s1.shots.find(s => s.id === '1.2').area, 'outside', 'a shot on someone outside is framed from outside');
  // (the stop brakes the drive short of its mark)
  const c2 = s2.drivers.get('car').act, sh3 = plan.shots.find(s => s.id === '2.1'), t3 = sh3.t0 + 3 - s2.t0;
  assert.ok(c2.speed(t3 - 0.01) > 1, 'moving when the stop comes');
  const end = c2.where(sh3.t1 - s2.t0);
  assert.ok(end[0] > -10 + 3, `it stands short of its mark (${end})`);
  src.close();
  assert.ok(noGpu(), 'no GPU');
  await pure(plan, [3, 6.5, 9.2, plan.shots.at(-1).t0 + 4]);
  await lintClean(plan);
});

test('the front door: flung open, walked and run through, closed softly; a shot inside and one outside', { skip: no3d }, async () => {
  const plan = await lay(DOOR), rec = plan._scenes[0], src = await open(plan), sc = src.built.scenes[0];
  assert.deepEqual(rec.doors.map(c => c.to), [1, 0], 'the door is opened, then closed');
  assert.deepEqual(sc.shots.map(s => s.area), ['inside', 'outside']);
  const { HOME_KIT } = await import('../engine/scene3d/home/kit.mjs');
  const swing = HOME_KIT.doors.door(rec.doors);
  assert.ok(swing(rec.doors[0].t + 0.3) > 0.9 && swing(rec.doors[1].t + 3) === 0, 'open, then shut again');
  for (const id of ['milo', 'cat']) { const p = sc.drivers.get(id).at(sc.t1 - sc.t0); assert.ok(p[1] < -4.5, `${id} is out on the path (${p})`); }
  src.close();
  await pure(plan, [1.5, 2.2, 3, 4.5]);
  await lintClean(plan);
});

test('the ball and the cat: rolled from the hands, pounced on, batted, a skid, a leap onto the window seat, picked up', { skip: no3d }, async () => {
  const plan = await lay(BALL), rec = plan._scenes[0], ball = rec.three.get('ball');
  assert.deepEqual(ball.ops.map(o => o[0]), ['hand', 'roll', 'roll', 'pick']);
  assert.deepEqual(rec.three.get('cat').calls.map(c => c[0]), ['hop', 'bat', 'skid', 'trot', 'bat', 'trot', 'hop']);
  const src = await open(plan), sc = src.built.scenes[0], B = sc.drivers.get('ball'), cat = sc.drivers.get('cat');
  // (the pounce lands with the front paws by the moving ball, and the bat meets it where it is then)
  const [, t0, p0] = ball.ops[1], hop = rec.three.get('cat').calls[0][1][0];
  assert.ok(Math.hypot(hop.to[0] - p0[0], hop.to[2] - p0[1]) < 0.35, 'the pounce lands at the ball');
  const q = B.head(t0 - 0.01), r = B.head(t0);
  assert.ok(Math.hypot(q[0] - r[0], q[2] - r[2]) < 0.02, 'the ball goes on from where it was');
  // (it is in the boy's hands at the end, and the cat stands on the window seat)
  const end = sc.t1 - sc.t0 - 0.01;
  assert.ok(B.head(end)[1] > 0.3, `the ball is held up (${B.head(end)})`);
  sc.pose(end); const c = cat.ch.bones.hips.getWorldPosition(new (await import('three/webgpu')).Vector3());
  assert.ok(c.y > 0.39, `the cat is up on the window seat (hips at ${c.y.toFixed(2)} m)`);
  src.close();
  await pure(plan, [2, 3.5, 5, 9, plan.duration - 1]);
  await lintClean(plan);
});

test('what cannot be played fails by name, with its shot and beat', { skip: no3d }, async () => {
  const fails = async (j, re) => { await assert.rejects(lay(j), e => re.test(e.message) || assert.fail(e.message)); };
  const edit = (base, fn) => { const j = structuredClone(base); fn(j); return j; };
  await fails(edit(DOOR, j => { j.scenes[0].shots[1].beats = j.scenes[0].shots[1].beats.filter(b => b.do !== 'open'); }),
    /shot 1\.2, beats\[0\] \(run cat\): cat goes through the front door at [\d.]+ s while it is shut: open it before/);
  await fails(edit(DOOR, j => { j.scenes[0].actors.cat.at = 'x:2330,y:900'; }), /cat's way from \[3\.30, -1\.00\] to \[3\.30, -4\.90\] goes through the front of the house: go by "door_inside"/);
  await fails(edit(CAR, j => { j.scenes[0].shots[0].beats[1].arrive = 3; }), /beats\[1\] \(drive car\): car cannot drive to drive in 3\.00 s: it takes at least [\d.]+ s/);
  await fails(edit(CAR, j => { j.scenes[0].shots[1].beats[0] = { do: 'walk', who: 'dad', to: 'drive_door' }; }), /"dad" is riding "car": it can only hop off|dad is at the wheel of car/);
  await fails(edit(BALL, j => { j.scenes[0].shots[0].beats[2].with = undefined; j.scenes[0].shots[0].beats[2].after = 3; }), /cat's front paws are [\d.]+ m from ball at [\d.]+ s: a cat bats a ball 0\.3 m from them at most/);
  await fails(edit(BALL, j => { j.scenes[0].actors.milo.pose = 'stand'; }), /milo is standing: it rolls ball along the floor sitting or crouched/);
  const { loadFilm } = await import('../engine/film/load.mjs');
  const bad = async (j, re) => { await assert.rejects(loadFilm(j, { dir: tmpdir() }), e => e.problems?.some(p => re.test(p.message)) || assert.fail(e.problems?.map(p => p.message).join('\n') ?? e.message)); };
  await bad(edit(DOOR, j => { j.scenes[0].shots[1].beats[0].to = 'gate'; }), /beats\[0\]\.to: what to open: "door" or a car of the cast \(got "gate"\)/);
  await bad(edit(DOOR, j => { j.scenes[0].shots[1].beats[0].who = 'cat'; }), /whose hand opens or closes the door: a two-legged actor of the cast \(got "cat"\)/);
  await bad(edit(CAR, j => { j.cast.car.params.color = 'teal'; }), /cast\.car\.params\.color: must be a colour "#rrggbb"/);
  await bad(edit(CAR, j => { j.scenes[0].shots[0].beats[0].params.horn = 'on'; }), /params\.horn: a car's "set" changes lights, engine/);
  await bad(edit(CAR, j => { j.scenes[0].shots[0].camera.area = 'attic'; }), /camera\.area: the kit "home" has the areas inside, outside \(got "attic"\)/);
  await bad(edit(BALL, j => { j.scenes[0].shots[0].beats[3].name = 'pounce'; }), /rig "cat" has no gesture "pounce" \(gestures: skid, meow\)/);
});

test('a scene actor may start facing an anchor, a point or another actor; anything else is named', { skip: no3d }, async () => {
  const { unbuilt } = await import('../engine/scene3d/compile.mjs');
  const f = (face) => unbuilt(film({ milo: { rig: 'boy', name: 'Milo' }, dad: { rig: 'man', name: 'Dad' } }, [
    { actors: { milo: { at: 'step', face }, dad: { at: 'path', face: 'milo' } }, shots: [shot('1.1', { size: 'wide' }, [], { hold: 1 })] }]));
  for (const ok of ['left', 'right', 'lawn', 'x:2400,y:500', 'dad']) assert.deepEqual(f(ok), [], ok);
  assert.match(f('moon').map((p) => p.message).join('\n'), /scenes\[0\]\.actors\.milo\.face: "left", "right", or what it faces/);
});

test('the footsteps of "home" sound the ground they land on, and a cat\'s pads are near silent', { skip: no3d }, async () => {
  const { HOME_KIT: K } = await import('../engine/scene3d/home/kit.mjs');
  // the room, the hall, the step and the path, the drive, the lawn, the pavement
  assert.deepEqual([[0.4, -0.1], [3.76, -1.0], [3.76, -2.8], [3.76, -6.2], [6.5, -5.4], [-0.2, -6.0], [3.76, -10.45]].map(([x, z]) => K.surface(x, z)),
    ['wood', 'stone', 'stone', 'stone', 'dirt', 'grass', 'stone']);
  const plan = await lay(DOOR), steps = plan.sfx.filter(s => /^footstep-/.test(s.name));
  const milo = steps.filter(s => s.who === 'milo'), cat = steps.filter(s => s.who === 'cat');
  assert.ok(milo.length > 4 && milo.every(s => s.name === 'footstep-stone'), milo.map(s => s.name).join(' '));
  assert.ok(cat.length > 4 && cat.every(s => s.gain <= 0.1), `the cat's steps: ${cat.map(s => s.gain).join(' ')}`);
});

test('a clap: the palms stop where they meet and each clap opens its own width', { skip: no3d }, async () => {
  const plan = await lay(film({ milo: { rig: 'boy', name: 'Milo' } }, [
    { actors: { milo: { at: 'rug', face: 'right', pose: 'sit' } }, shots: [shot('1.1', { size: 'medium', on: ['milo'] }, [{ do: 'gesture', who: 'milo', name: 'clap' }], { hold: 0.5 })] }]));
  const src = await open(plan), { Vector3 } = await import('three/webgpu'), bones = src.built.cast.milo.ch.bones;
  const gap = [], P = (n) => bones[n].getWorldPosition(new Vector3());
  let cross = -Infinity;   // how far a finger of one hand goes past the middle between the wrists, toward the other hand
  for (let t = 0.3; t < 1.5; t += 1 / 240) {
    src.built.update(t);
    const l = P('handL'), r = P('handR'), ax = l.clone().sub(r).normalize(), mid = l.clone().add(r).multiplyScalar(0.5);
    gap.push(l.distanceTo(r));
    for (const f of ['index2', 'middle2']) cross = Math.max(cross, -P(f + 'L').sub(mid).dot(ax), P(f + 'R').sub(mid).dot(ax));
  }
  src.close();
  const shut = Math.min(...gap), opens = gap.filter((g, i) => i > 0 && i < gap.length - 1 && g > gap[i - 1] && g >= gap[i + 1]);
  assert.ok(shut > 0.06, `the wrists come no nearer than ${shut.toFixed(3)} m`);
  assert.ok(cross < -0.003, `the fingers stop where they meet (a finger goes ${(cross * 1000).toFixed(1)} mm past the middle)`);
  assert.ok(opens.length >= 3 && Math.max(...opens) - Math.min(...opens) > 0.02, `the claps open ${opens.map(g => g.toFixed(3)).join(', ')} m`);
});

test('a cat\'s meow lifts its chin and lays its ears back, laid over what it does; a boy in socks treads soft', { skip: no3d }, async () => {
  const story = (meow) => film({ milo: { rig: 'boy', name: 'Milo' }, cat: { rig: 'cat', name: 'Cat' } }, [
    { actors: { milo: { at: 'x:2300,y:1000', face: 'left' }, cat: { at: 'x:2000,y:950', face: 'left', pose: 'sit' } }, shots: [
      shot('1.1', { size: 'full', on: ['cat'] }, [
        ...(meow ? [{ do: 'gesture', who: 'cat', name: 'meow', at: 0.5 }] : []),
        { do: 'turn', who: 'cat', face: 'right', at: 0.6 },
        { do: 'walk', who: 'milo', to: 'x:2100,y:1000', at: 0 }], { hold: 0.5 })] }]);
  const [with_, without] = [await lay(story(true)), await lay(story(false))];
  assert.equal(with_.duration, without.duration, 'a meow does not hold up what the cat does next');
  const { Quaternion } = await import('three/webgpu');
  const pose = async (plan) => { const src = await open(plan), b = src.built.cast.cat.ch.bones; src.built.update(0.85); const r = [b.head.getWorldQuaternion(new Quaternion()), b.earL.quaternion.clone()]; src.close(); return r; };
  const [h1, e1] = await pose(with_), [h0, e0] = await pose(without);
  assert.ok(h0.angleTo(h1) > 0.15 && e0.angleTo(e1) > 0.2, `the head turns ${h0.angleTo(h1).toFixed(2)} rad, the ear ${e0.angleTo(e1).toFixed(2)} rad`);
  const steps = with_.sfx.filter(s => s.who === 'milo' && /^footstep-/.test(s.name));
  assert.ok(steps.length > 2 && steps.every(s => s.gain < 0.4 && s.params.weight < 0.4), steps.map(s => s.gain.toFixed(2)).join(' '));
});
