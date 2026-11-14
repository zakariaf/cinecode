// A storyboard that asks for the 3D engine ("format": { "engine": "3d" }): films/_test3d loads, validates, compiles
// and lints with no GPU; what the 3D engine does not do yet fails by name; a spoken line moves the mouth; a 2D film
// never loads three or webgpu; with a GPU, frames of the film (picture, captions and titles) repeat in fresh
// processes. With CINECODE_MAIN_REF set to a checkout of main, films/_test's plan and frames are compared with it.
//   node --test test/scene3d-film.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), FILM = ROOT + 'films/_test3d';
// without the optional packages three and webgpu (package.json optionalDependencies) every test here is skipped
const no3d = (() => { try { import.meta.resolve('three'); import.meta.resolve('webgpu'); return false; } catch { return 'the optional packages three and webgpu are not installed'; } })();
const json = () => JSON.parse(readFileSync(FILM + '/film.json', 'utf8'));
const noGpu = () => typeof GPUBufferUsage === 'undefined' && globalThis.navigator?.gpu === undefined
  && !process.report.getReport().sharedObjects.some(f => /webgpu|dawn/i.test(f));
const node = (code, cwd = ROOT) => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });

test('films/_test3d loads, compiles and poses with no GPU', { skip: no3d }, async () => {
  const { loadPlan } = await import('../engine/render/film-source.mjs');
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const { film, plan } = await loadPlan(FILM);
  assert.equal(film.format.engine, '3d');
  assert.deepEqual(plan.shots.map(s => s.id), ['s01-01', 's01-02', 's02-01', 's02-02']);
  assert.ok(plan.captions.some(c => c.text === '[the ball bounces]') && plan.captions.some(c => c.text === 'Catch!'));
  const src = await openScene(compileScene(plan), { width: 64, height: 36 });
  const { scenes, cast } = src.built;
  assert.deepEqual(Object.keys(cast).sort(), ['ball', 'cat', 'girl', 'man']);
  const sc = scenes[0], at = (id, t) => { src.built.update(t); return sc.drivers.get(id).at(t - sc.t0); };
  const start = at('man', 3.2), end = at('man', 9);
  assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) > 2, `the man walks in (${start} → ${end})`);
  src.built.update(8);
  const cam = sc.camera(8 - sc.t0);
  assert.ok([...cam.pos, ...cam.target, cam.fov].every(Number.isFinite), 'the camera is solved');
  assert.deepEqual(at('man', 3.2), start, 'a pose depends only on its time');
  src.close();
  assert.ok(noGpu(), 'no GPU after loading, compiling and posing');
});

test('films/_test3d passes the motion gates while its scene is on (as Scene Zero does: test/scene3d-bodies-motion.test.mjs)', { skip: no3d }, async () => {
  const { loadPlan } = await import('../engine/render/film-source.mjs');
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const { motion, feetSlide, pawSlide, overlap, sceneSource, TURN_GATE, OVERLAP_GATE } = await import('../engine/scene3d/checks.mjs');
  const src = await openScene(compileScene((await loadPlan(FILM)).plan), { width: 64, height: 36 }), feet = {};
  assert.deepEqual(src.built.scenes.map(sc => [...sc.drivers.keys()].sort()), [['ball', 'cat', 'girl', 'man'], ['cat', 'man']]);
  for (const sc of src.built.scenes) {
    const one = sceneSource(src, sc), r = motion(one);
    for (const [who, m] of Object.entries(r)) {
      const at = o => `${sc.id} ${who}: ${o.joint ?? o.limb} at ${(o.at + sc.t0).toFixed(3)} s`;
      assert.ok(m.pops.worst < 5, `largest velocity jump ${m.pops.worst.toFixed(2)} m/s (${at(m.pops)})`);
      assert.ok(m.holds.worst < 1 / 3, `perfectly still for ${m.holds.worst.toFixed(3)} s (${at(m.holds)})`);
      assert.ok(m.reach.worst < 0.005, `asked ${(m.reach.worst * 1000).toFixed(1)} mm past full length (${at(m.reach)})`);
      if (m.through) assert.ok(m.through.worst < 0.005, `${(m.through.worst * 1000).toFixed(1)} mm inside the torso (${at(m.through)})`);
      assert.ok(m.turns.worst < TURN_GATE, `turns at ${m.turns.worst.toFixed(2)} rad/s (${at(m.turns)})`);
      if (who === 'cat') { assert.ok(pawSlide(one, who).worst < 0.002, `${sc.id}: the cat's planted paws slide`); continue; }
      const f = feetSlide(one, who);
      assert.ok(f.worst < 1e-5, `${sc.id}: ${who}'s planted feet slide ${(f.worst * 1000).toFixed(3)} mm`);
      feet[who] = (feet[who] ?? 0) + f.n;
    }
    const o = overlap(one);
    assert.ok(o.worst < OVERLAP_GATE, `${sc.id}: ${o.a}'s ${o.partA} ${(o.worst * 1000).toFixed(1)} mm into ${o.b}'s ${o.partB} at ${(o.at + sc.t0).toFixed(2)} s`);
  }
  // (flat, rolled onto the ball or heel, crouched, sitting: every frame a foot is down)
  assert.ok(feet.man > 900 && feet.girl > 500, `foot-frames checked: ${JSON.stringify(feet)}`);
});

// The plan times each action on the 3D motion system: what is drawn begins within a frame of the beat's planned start
// (a step, or the body rising or sinking) and is done by its planned end (its steps all landed; a crouch, a sit, a stand
// or a jump 90 % of its way down or up; the ball at rest on its mark), so captions, sound cues and the picture agree.
test('each action of films/_test3d begins within a frame of its planned start and ends by its planned end', { skip: no3d }, async () => {
  const { loadPlan } = await import('../engine/render/film-source.mjs');
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const { plan } = await loadPlan(FILM);
  assert.deepEqual(plan.warnings, [], 'no action had to wait for the one before it');
  const src = await openScene(compileScene(plan), { width: 64, height: 36 }), f = 1 / plan.fps;
  const height = (D, t) => (D.kind === 'biped' ? D.act.poseAt(t, false).pose.pelvis.pos[1] : D.act.poseAt(t).hips[1]);
  // (how far the body has risen or sunk 0.3 s into the action)
  const moved = (D, a) => Math.max(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => Math.abs(height(D, a + 0.03 * k) - height(D, a - f))));
  let n = 0;
  for (const [i, sc] of src.built.scenes.entries()) for (const { beat: b, t0, t1 } of plan._scenes[i].shots.flatMap(s => s.beats)) {
    const D = sc.drivers.get(b.who), a0 = t0 - sc.t0, a1 = t1 - sc.t0, what = `${b.who} ${b.do} ${b.name ?? b.pose ?? ''} (${t0.toFixed(2)} to ${t1.toFixed(2)} s)`;
    if (!D || ['look', 'emote', 'blink'].includes(b.do) || (b.do === 'gesture' && b.name !== 'jump')) continue;
    n++;
    if (D.kind === 'prop') {
      const p = D.head(a1), q = D.head(a1 + 2), mark = plan._scenes[i].three.get(b.who).ops.at(-1)[3];   // (a throw: ['throw', by, release, mark])
      assert.ok(Math.hypot(p[0] - q[0], p[2] - q[2]) < 1e-6 && Math.hypot(p[0] - mark[0], p[2] - mark[1]) < 0.01, `${what}: the ball is at rest on its mark by the end`);
      continue;
    }
    const steps = Object.values(D.act.tracks).flatMap(tr => tr.steps).filter(s => s.t0 > a0 - f - 1e-9 && s.t0 < a1);
    const first = Math.min(...steps.map(s => s.t0)), last = Math.max(...steps.map(s => s.t1));
    if (['crouch', 'stand', 'jump', 'sit'].includes(b.pose ?? b.name ?? b.do)) {
      const h0 = height(D, a0), h1 = height(D, a1 + 0.4), down = b.do !== 'gesture';
      if (down) assert.ok(Math.abs(height(D, a1) - h1) < 0.1 * Math.abs(h1 - h0), `${what}: ${(100 * (1 - Math.abs(height(D, a1) - h1) / Math.abs(h1 - h0))).toFixed(0)} % of the way by its end`);
      else assert.ok(Math.abs(height(D, a1) - height(D, a0 - f)) < 0.01, `${what}: landed by its end`);
      // (a sit may first turn its back to the seat: a step)
      assert.ok(moved(D, a0) > 0.005 || Math.abs(first - a0) <= f, `${what}: under way from its start`);
      continue;
    }
    assert.ok(steps.length, `${what}: steps`);
    // (a leap gathers itself for 0.45 s first, unless it turns to its mark first)
    assert.ok(Math.abs(first - a0) <= f || (b.do === 'hop' && Math.abs(first - a0 - 0.45) <= f), `${what}: the first step at ${(first + sc.t0).toFixed(3)} s`);
    if (b.do === 'hop' && Math.abs(first - a0) > f) assert.ok(moved(D, a0) > 0.005, `${what}: gathers itself from its start`);
    assert.ok(last <= a1 + 1e-9, `${what}: the last step lands at ${(last + sc.t0).toFixed(3)} s`);
  }
  assert.ok(n >= 10, `${n} actions checked`);
  src.close();
});

// Titles and captions keep clear of the faces and hands in the picture, and keep their place while they are up.
test('the words over films/_test3d keep clear of faces and hands, and do not move while they are up', { skip: no3d }, async () => {
  const { loadPlan } = await import('../engine/render/film-source.mjs');
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const { createOverlay, marksAt } = await import('../engine/scene3d/overlay.mjs');
  const { TITLE_PLACES } = await import('../engine/film/text.mjs');
  const { plan } = await loadPlan(FILM);
  const src = await openScene(compileScene(plan), { width: 64, height: 36 }), O = createOverlay(plan, src.built);
  for (const c of plan.captions.filter(c => c.burn)) {
    const boxes = new Set();
    for (let t = c.t0 + 0.2; t < c.t1 - 0.2; t += 0.1) {
      const w = O.words(t).find(w => w.text === c.text);
      assert.ok(w, `${c.text} is up at ${t.toFixed(1)} s`);
      boxes.add(w.box.map(Math.round).join());
      assert.deepEqual(O.over(t), [], `nothing covers a face or a hand at ${t.toFixed(1)} s`);
    }
    assert.equal(boxes.size, 1, `${c.text} keeps its place`);
  }
  // Catch! asks for upper, where the man's raised hand is: it goes higher
  const catchAt = plan.captions.find(c => c.text === 'Catch!'), y = O.words(catchAt.t0 + 0.9).find(w => w.text === 'Catch!').box;
  const covered = (cy, t) => marksAt(plan, src.built, t).some(m => m.box[1] < cy + 60 && m.box[3] > cy - 60 && m.box[0] < 1150 && m.box[2] > 770);
  assert.ok([...Array(10).keys()].some(k => covered(TITLE_PLACES.upper * plan.H, catchAt.t0 + 0.18 * k)), 'a hand or a face is where upper would put it');
  assert.ok(y[3] < TITLE_PLACES.upper * plan.H, 'so it sits above that');
  src.close();
});

// A storyboard mistake names its shot and beat; anything else thrown while a 3D film is staged reads as a fault of the
// engine, with its stack (cinecode prints only an error's message).
test('a storyboard mistake names its shot and beat; an engine fault reads as one, with its stack', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const { RIGS } = await import('../engine/scene3d/library.mjs');
  const j = json(); j.scenes[0].shots[1].beats.unshift({ do: 'walk', who: 'cat', to: 'rug_left', at: 0 });
  await assert.rejects(async () => compile(await loadFilm(j, { dir: FILM })), { message: /^shot s01-02, beats\[0\] \(walk cat\): cat is sitting/ });
  const film = await loadFilm(json(), { dir: FILM }), run = RIGS.girl.run;
  RIGS.girl.run = undefined;   // (a fault in the engine's own tables)
  try { assert.throws(() => compile(film), { message: /^a fault in the 3D engine \(not in the storyboard\): TypeError: .*\n +at / }); }
  finally { RIGS.girl.run = run; }
  const plan = compile(await loadFilm(json(), { dir: FILM }));
  plan._scenes[0].three.get('man').calls.push(['fly', [{}]]);   // (a call the performer does not have: a fault at build)
  await assert.rejects(lintFilm(plan), { message: /^a fault in the 3D engine \(not in the storyboard\): TypeError: act\[verb\] is not a function\n +at / });
});

test('lint on films/_test3d runs with no GPU and finds nothing', { skip: no3d }, async () => {
  const { loadPlan } = await import('../engine/render/film-source.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const r = await lintFilm((await loadPlan(FILM)).plan);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(noGpu());
});

test('lint finds two actors who walk through each other', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const j = json();
  j.scenes[0].shots[0].beats.find(b => b.do === 'run' && b.who === 'girl').at = 1;   // across the man's way in
  const r = await lintFilm(compile(await loadFilm(j, { dir: FILM })));
  assert.deepEqual(r.errors.map(e => [e.rule, e.shot]), [['collide', 's01-01']]);
  assert.match(r.errors[0].message, /^man and girl pass through each other/);
});

test('lint finds a turn too fast to read under the motion blur', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const plan = compile(await loadFilm(json(), { dir: FILM }));
  plan._scenes[1].three.get('cat').calls.push(['turn', [{ t0: 7, by: 3, beat: 0.02 }]]);   // (half round in a quarter of a second)
  const r = await lintFilm(plan);
  const e = r.errors.find(e => e.rule === 'turn-speed');
  assert.equal(e?.shot, 's02-02', JSON.stringify(r.errors));
  assert.match(e.message, /^cat: the (head|chest|hips) turns at \d+\.\d rad\/s \(more than 8\)/);
});

// A door's swing is checked against the bodies near it ("Dad's Home": the car door swung past Dad's hand, the front
// door flew open through the cat's head, and check-motion passed both): a man standing just inside the front door as
// it flies open fails lint with the shot and its time; standing well clear of it, he does not.
test('lint finds a door that swings through a body, with the shot and time', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const film = at => ({
    title: 'Door', format: { width: 1920, height: 1080, fps: 24, engine: '3d' },
    cast: { man: { rig: 'man', name: 'Dad' } }, sets: { hall: { kit: 'home', area: 'inside' } },
    scenes: [{ id: 's01', set: 'hall', time: 'golden', actors: { man: { at, face: 'left' } },
      shots: [{ id: 's01-01', camera: { size: 'full', on: ['man'] }, dur: 2.5, beats: [{ do: 'open', to: 'door', at: 0.5 }] }] }],
  });
  const hit = await lintFilm(compile(await loadFilm(film('x:2375,y:820'), { dir: process.cwd() })));
  const e = hit.errors.find(e => e.rule === 'door-sweep');
  assert.ok(e, JSON.stringify(hit.errors));
  assert.equal(e.shot, 's01-01');
  assert.ok(e.t > 0.5 && e.t < 1.5, `when it swings (${e.t})`);
  assert.match(e.message, /^the front door swings through man's \w+ \(\d+ cm deep\) \d\.\d\d s into the shot/);
  const clear = await lintFilm(compile(await loadFilm(film('hall'), { dir: process.cwd() })));
  assert.deepEqual(clear.errors.filter(e => /^door/.test(e.rule)).concat(clear.warnings.filter(e => /^door/.test(e.rule))), []);
});

// lint holds every action to the motion gates the film test holds films/_test3d to (a walk to the window from rug_left
// once whipped the man's pelvis at 72 rad/s with a 222 m/s pop and a leg 51 mm past its length, and linted clean)
test('lint finds a pop and a limb asked past its length', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { lintFilm } = await import('../engine/scene3d/lint.mjs');
  const plan = compile(await loadFilm(json(), { dir: FILM }));
  plan._scenes[0].three.get('girl').calls.push(['walk', [{ t0: 13.5, to: [1.5, 0.6], stepLen: 1.4, stepTime: 0.25 }]]);   // (1.4 m strides)
  const r = await lintFilm(plan), rules = r.errors.map(e => e.rule);
  for (const rule of ['pop', 'over-reach']) assert.ok(rules.includes(rule), `${rule}: ${JSON.stringify(r.errors)}`);
  assert.match(r.errors.find(e => e.rule === 'over-reach').message, /^girl: the leg[LR] is asked \d+ mm past its length/);
});

// check acts a 3D film out as plan and lint do: an action that cannot be played stops it, a wait is said
test('check stops on an action that cannot be played, and says when an action waits', { skip: no3d }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-check3d-')), run = j => { writeFileSync(join(dir, 'film.json'), JSON.stringify(j)); return spawnSync(process.execPath, ['bin/cinecode.mjs', 'check', dir], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } }); };
  try {
    let j = json(); j.scenes[1].shots[1].beats.push({ do: 'walk', who: 'man', to: 'rug_left', at: 1 });
    let r = run(j);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /shot s02-02, beats\[3\] \(walk man\): man is sitting: give it a "stand" first/);
    j = json(); j.scenes[1].shots[0].beats.find(b => b.do === 'hop').at = 1.6;
    r = run(j);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout + r.stderr, /warning +shot s02-01: cat's hop \(beats\[\d\]\) waits \d\.\d\d s, until cat has finished the action before it/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('what the 3D engine does not do yet fails by name', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const fails = async (edit, re) => {
    const j = json(); edit(j);
    await assert.rejects(loadFilm(j, { dir: FILM }), e => e.problems.some(p => re.test(p.message)) || assert.fail(e.problems.map(p => p.message).join('\n')));
  };
  await fails(j => { j.sets.room.kit = 'meadow'; }, /^sets\.room\.kit: kit "meadow" has no 3D version yet \(3D kits: home, room\)$/);
  await fails(j => { j.cast.cat.rig = 'hare'; }, /^cast\.cat\.rig: rig "hare" has no 3D version yet/);
  await fails(j => { j.sets.room.kit = 'kitchen'; }, /^sets\.room\.kit: unknown set kit "kitchen" \(have: home, room\)$/);   // (in neither engine)
  // (and only that: the set's anchors are not then reported missing one by one)
  await assert.rejects(loadFilm({ ...json(), sets: { room: { kit: 'castle' } } }, { dir: FILM }), e => assert.equal(e.problems.length, 1, e.problems.map(p => p.message).join('\n')) ?? true);
  await fails(j => { j.format.width = 4400; j.format.height = 2476; }, /^format\.width: a picture more than 4096 px wide is not built for the 3D engine yet$/);
  await fails(j => { j.cast.cat.rig = 'dog'; }, /^cast\.cat\.rig: unknown rig "dog" \(known: ball, boy, car, cat, girl, man\)$/);
  const j = json(); j.scenes[0].shots[0].beats.push({ do: 'pounce', who: 'cat', at: 1 });
  await assert.rejects(loadFilm(j, { dir: FILM }), e => assert.deepEqual(e.problems.map(p => p.message), [`scenes[0].shots[0].beats[${j.scenes[0].shots[0].beats.length - 1}].do: unknown action "pounce" (one of walk, run, enter, exit, turn, look, pose, sit, stand, gesture, emote, blink, place, hop, roll, drive, stop, set, open, close)`]) ?? true);
  await fails(j => { j.format.engine = '4d'; }, /^format\.engine: must be one of 2d \| 3d/);
  await fails(j => { j.format.style = 'lineart'; }, /^format\.style: line art is not built for the 3D engine yet$/);
  await fails(j => { j.scenes[0].shots[0].beats.push({ fx: 'rain', at: 1 }); }, /the effect "rain" is not built for the 3D engine yet/);
  await fails(j => { j.scenes[0].shots[0].beats.push({ do: 'lie', who: 'man', at: 1 }); }, /"lie" for the rig "man" \(it can: .*\) is not built for the 3D engine yet/);
  await fails(j => { j.scenes[0].shots[0].camera.dof = true; }, /camera "dof" is not built for the 3D engine yet/);
  await fails(j => { j.voices = { cat: { voice: 'Puck' } }; j.cast.cat.voice = 'cat'; j.scenes[0].shots[1].beats.push({ say: 'cat', text: 'Mine!', at: 1 }); }, /a line spoken on screen by the rig "cat"/);
});

test('a spoken line moves the mouth while it is spoken, from the line\'s timing', { skip: no3d }, async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const { compile } = await import('../engine/film/compile.mjs');
  const { compileScene } = await import('../engine/scene3d/compile.mjs');
  const { openScene } = await import('../engine/scene3d/index.mjs');
  const j = json();
  j.voices = { man: { voice: 'Puck' } }; j.cast.man.voice = 'man';
  j.scenes[0].shots[1].beats = j.scenes[0].shots[1].beats.filter(b => b.do !== 'emote');
  j.scenes[0].shots[1].beats.push({ say: 'man', text: 'Good catch, little one!', at: 1 });
  const plan = compile(await loadFilm(j, { dir: FILM })), L = plan.lines[0];
  const src = await openScene(compileScene(plan), { width: 64, height: 36 }), sc = src.built.scenes[0], man = sc.drivers.get('man');
  const mouth = (a, b) => { const v = []; for (let t = a; t < b; t += 1 / 24) v.push(man.act.poseAt(t - sc.t0).pose.face.mouth); return [Math.min(...v), Math.max(...v)]; };
  const [lo, hi] = mouth(L.t0, L.t1), after = mouth(L.t1 + 0.1, L.t1 + 0.6);
  assert.ok(hi - lo > 0.3, `the mouth opens and closes during the line (${lo.toFixed(2)} to ${hi.toFixed(2)})`);
  assert.equal(after[0], after[1], 'and rests after it');
  src.close();
});

test('a 2D film loads neither three nor webgpu', () => {
  const out = node(`import { registerHooks } from 'node:module';
    const seen = []; registerHooks({ resolve(s, c, next) { const r = next(s, c); if (/node_modules\\/(three|webgpu)\\//.test(r.url)) seen.push(r.url); return r; } });
    const { loadPlan } = await import('./engine/render/film-source.mjs');
    const { drawFrame } = await import('./engine/film/frame.mjs');
    const { frameGrabber } = await import('./engine/render/encode.mjs');
    const { plan } = await loadPlan('films/_test'); frameGrabber(plan, drawFrame, 64, 36).pixels(5);
    console.log(JSON.stringify(seen));`);
  assert.deepEqual(JSON.parse(out), []);
});

// A module hook in a child process, from source text: NODE_OPTIONS=--import <data: URL> registers resolve(spec, ctx, next)
const js = src => 'data:text/javascript,' + encodeURIComponent(src);
const hooked = resolve => `--import ${js(`import { register } from 'node:module'; register(${JSON.stringify(js(`export ${resolve}`))});`)}`;

test('a GPU that fails to start is reported with its own error, not as missing packages', { skip: no3d }, () => {
  const stub = js("export const globals = {}; export function create() { return { requestAdapter: async () => { throw new Error('Dawn: device lost (simulated)'); } }; }");
  const env = { ...process.env, GEMINI_API_KEY: '', NODE_OPTIONS: hooked(`async function resolve(s, c, next) { return s === 'webgpu' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(s, c); }`) };
  const setup = spawnSync(process.execPath, ['bin/cinecode.mjs', 'setup', '--check'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.match(setup.stdout, /3d +the GPU could not be started, so 3D films cannot be rendered: Error: Dawn: device lost \(simulated\)/);
  const sheet = spawnSync(process.execPath, ['bin/cinecode.mjs', 'sheet', FILM, '-o', '/dev/null'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.match(sheet.stderr, /the GPU could not be started: Error: Dawn: device lost \(simulated\)/);
  assert.doesNotMatch(setup.stdout + sheet.stderr, /not installed/);
});

test('without three and webgpu the scene3d tests skip, and check says what a 3D film needs', { skip: no3d, timeout: 300000 }, () => {
  const env = { ...process.env, GEMINI_API_KEY: '', CINECODE_MAIN_REF: '', NODE_OPTIONS: hooked("async function resolve(s, c, next) { const m = /^(three|webgpu)(\\/|$)/.exec(s); if (m) { const e = new Error(`Cannot find package '${m[1]}' imported from ${c.parentURL}`); e.code = 'ERR_MODULE_NOT_FOUND'; throw e; } return next(s, c); }") };
  const files = readdirSync(ROOT + 'test').filter(f => /^scene3d-.*\.test\.mjs$/.test(f)).map(f => 'test/' + f);
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, env: Object.fromEntries(Object.entries(env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), encoding: 'utf8' });   // (a run of its own, not a part of this one)
  assert.match(r.stdout, /# fail 0\n/, r.stderr + r.stdout.split('\n').filter(l => /^not ok|# (pass|fail|skipped)/.test(l.trim())).join('\n'));
  assert.match(r.stdout, /# pass [1-9]/, 'the tests that need no 3D still run');
  const check = spawnSync(process.execPath, ['bin/cinecode.mjs', 'check', FILM], { cwd: ROOT, env, encoding: 'utf8' });
  assert.match(check.stderr + check.stdout, /needs the optional packages three and webgpu, which are not installed/);
});

// films/_test through the render path (film-source createSource, as a render worker builds it): the plan, and 24
// frames at full size and at the animatic's size, hashed
const HASH_2D = `import { createHash } from 'node:crypto';
  const { createSource } = await import('./engine/render/film-source.mjs'), { frameGrabber } = await import('./engine/render/encode.mjs');
  const { plan, drawFrame } = await createSource({ filmDir: process.cwd() + '/films/_test' });
  const seen = new WeakSet(), h = b => createHash('sha256').update(b).digest('hex');
  const text = JSON.stringify(plan, (k, v) => (typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? (seen.has(v) ? '~' : (seen.add(v), v)) : v));
  const n = Math.round(plan.duration * plan.fps), full = frameGrabber(plan, drawFrame), small = frameGrabber(plan, drawFrame, 960, 540), out = { plan: h(text) };
  for (let k = 0; k < 24; k++) { const i = Math.floor((n - 1) * k / 23); out[i] = h(full.pixels(i / plan.fps)) + h(small.pixels(i / plan.fps)); }
  console.log(JSON.stringify(out));`;
const MAIN = process.env.CINECODE_MAIN_REF;
test('films/_test has the same plan and frames as on main', { skip: MAIN ? false : 'set CINECODE_MAIN_REF to a checkout of main (git worktree add <dir> main)', timeout: 600000 }, () => {
  assert.deepEqual(JSON.parse(node(HASH_2D)), JSON.parse(node(HASH_2D, MAIN)));
});

const gpu = spawnSync(process.execPath, ['--input-type=module', '-e', "process.exit((await (await import('./engine/scene3d/host-node.mjs')).hasAdapter()) ? 0 : 1)"], { cwd: ROOT, stdio: 'ignore' }).status === 0;
test('two frames of films/_test3d (picture, caption, title) hash the same in two fresh processes, in either order', { skip: gpu ? false : 'no WebGPU adapter on this machine', timeout: 300000 }, async () => {
  // one frame while "[the ball bounces]" is up, one while the title "Catch!" is
  const { plan } = await (await import('../engine/render/film-source.mjs')).loadPlan(FILM), at = text => Math.round((plan.captions.find(c => c.text === text).t0 + 0.6) * 24) / 24;
  const [c, t] = [at('[the ball bounces]'), at('Catch!')];
  const run = ts => new Promise((res, rej) => execFile(process.execPath, ['--input-type=module', '-e', `import { createHash } from 'node:crypto';
    const { createSource } = await import('./engine/render/film-source.mjs');
    const src = await createSource({ filmDir: ${JSON.stringify(FILM)} }, { width: 640, height: 360 }), out = {};
    for (const t of ${JSON.stringify(ts)}) { const px = await src.pixels(t); out[t] = px.length + ':' + createHash('sha256').update(px).digest('hex'); }
    src.close(); console.log(JSON.stringify(out));`], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } }, (e, out) => (e ? rej(e) : res(JSON.parse(out.trim().split('\n').pop())))));
  const [a, b] = await Promise.all([run([c, t]), run([t, c])]);
  assert.match(a[c], /^921600:[0-9a-f]{64}$/);
  assert.notEqual(a[c], a[t]);
  assert.deepEqual(a, b);
});
