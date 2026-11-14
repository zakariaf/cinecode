// Motion seams: where one move, pose or facing hands over to the next. A move that sets off (or turns back) the other
// way turns through the squash; back-to-back moves carry the stride on and blend from the pose that was drawn, never
// through standing; heads (looks and tilts) ease across pose blends, turns, move ends, falling asleep and waking. A
// move laid over another that starts later is cut there (the shot doesn't wait for the rest, and its end facing doesn't
// flip the actor later); a turn or pose given during a move takes effect at its end (with a warning); a gesture that
// leaves the ground doesn't lift a walker off its gait; a "set" with "dur" eases its params.
//   node --test test/motion-seams.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { loadPlan } from '../engine/render/film-source.mjs';
import { probe } from '../engine/film/util.mjs';
import { SLEEP_TILT } from '../engine/film/actor.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const FPS = 24;
function tiny({ actors, shots, cast = {} }) {
  return {
    title: 'Seams', format: { width: 320, height: 180, fps: FPS, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' } },
    cast: { hare: { rig: 'hare' }, pip: { rig: 'human', params: { age: 'child' } }, gran: { rig: 'human', params: { age: 'elder' } }, fidget: { rig: 'squirrel' }, ...cast },
    sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors, shots }],
  };
}
const actorOf = (plan, id, scene = 0) => plan._scenes[scene].actors.get(id);
// face changes with no turn squash on either side, at 48 Hz inside the shots, for an actor in view
function bareFlips(plan, A, rec) {
  const out = []; let pf = null, pq = null, ps = null;
  for (let t = rec.t0; t < rec.t1; t += 1 / 48) {
    const sh = plan.shotAt(t);
    if (!sh || sh.scene !== rec.id || !A.visibleAt(t) || A.posAt(t).mode === 'off') { pf = null; continue; }
    const f = A.faceAt(t), q = A.squashAt(t);
    if (pf !== null && ps === sh.id && f !== pf && q === 1 && pq === 1) out.push(+t.toFixed(3));
    pf = f; pq = q; ps = sh.id;
  }
  return out;
}

// ───────────── 1.4 overlapping moves ─────────────
const GLIM = new URL('../films/glim/', import.meta.url).pathname;
async function glim(extra) {
  const json = JSON.parse(readFileSync(GLIM + 'film.json', 'utf8'));
  if (extra) json.scenes.flatMap(s => s.shots).find(s => s.id === '1.4').beats.push(extra);
  return compile(await loadFilm(json, { dir: GLIM }));
}
test('a walk laid with an earlier start under a run already laid is cut where the run starts: the shot keeps its length, no stray flip, a warning', async () => {
  const plain = await glim(), cut = await glim({ do: 'walk', who: 'tilly', to: 'x:600,y:1040', with: 'prev', after: 0.5 });
  const s0 = plain.shots.find(s => s.id === '1.4'), s1 = cut.shots.find(s => s.id === '1.4');
  near(s1.t1 - s1.t0, s0.t1 - s0.t0, 1e-9, 'shot 1.4 keeps its length');
  near(cut.duration, plain.duration, 1e-9, 'the film keeps its length');
  const A = actorOf(cut, 'tilly'), P = actorOf(plain, 'tilly'), walk = A.moves.find(m => m.kind === 'walk');
  assert.ok(walk && walk.cut !== undefined, 'the walk is cut');
  const run = A.moves.find(m => m.kind === 'run');
  near(walk.cut, run.t0, 1e-9, 'where the run starts');
  const end = s1.t1 - 0.05, p = A.posAt(end), q = P.posAt(end);
  near(p.x, q.x, 1e-6, 'Tilly ends at her den'); near(p.y, q.y, 1e-6);
  assert.ok(!A.faceEv.some(e => e.src === walk && e.t > walk.cut), 'the walk leaves no end facing');
  assert.ok(!A.poseEv.some(e => e.src === walk), 'nor an end pose');
  assert.deepEqual(bareFlips(cut, A, cut._scenes[0]), bareFlips(plain, P, plain._scenes[0]), 'no flip that the plain film does not have');
  assert.ok(cut.warnings.some(w => /shot 1\.4: tilly's walk \(beats\[2\]\) is cut 0\.30 s into/.test(w)), cut.warnings.join('\n'));
  assert.ok(!plain.warnings.some(w => /is cut/.test(w)));
});

test('an interrupted move ends at its cut for the shot\'s length', async () => {
  const film = tiny({ actors: { hare: { at: 'x:900', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'walk', who: 'hare', to: 'x:2400' },
    { do: 'walk', who: 'hare', to: 'x:1100', with: 'prev', after: 1 },
  ], hold: 0.5 }] });
  const plan = compile(await loadFilm(film)), A = actorOf(plan, 'hare'), [w1, w2] = A.moves.filter(m => m.kind === 'walk');
  near(w1.cut, w2.t0, 1e-9);
  near(plan.shots[0].t1, Math.round((Math.max(w2.t1) + 0.5) * FPS) / FPS, 1e-9, 'the shot ends 0.5 s after the walk that finishes');
  assert.ok(w1.t1 > plan.shots[0].t1, 'the first walk would have run past it');
  assert.ok(plan.warnings.some(w => /hare's walk \(beats\[0\]\) is cut 1\.00 s into/.test(w)), plan.warnings.join('\n'));
});

// ───────────── 1.5 a turn or pose during a move ─────────────
test('a turn or a pose given during a move takes effect when the move ends, with a warning', async () => {
  const film = tiny({ actors: { pip: { at: 'x:800', face: 'right' }, hare: { at: 'x:1900', face: 'left' } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['pip', 'hare'] }, beats: [
    { do: 'walk', who: 'pip', to: 'x:1400' },
    { do: 'sit', who: 'pip', with: 'prev', after: 1 },
    { do: 'walk', who: 'hare', to: 'x:2400' },
    { do: 'turn', who: 'hare', face: 'left', with: 'prev', after: 0.5 },
  ] }] });
  const plan = compile(await loadFilm(film)), pip = actorOf(plan, 'pip'), hare = actorOf(plan, 'hare'), end = plan.shots[0].t1 - 0.01;
  const pw = pip.moves.find(m => m.kind === 'walk'), hw = hare.moves.find(m => m.kind === 'walk');
  assert.equal(pip.basePoseName(end), 'sit', 'pip sits once the walk is over');
  assert.equal(pip.basePoseName(pw.t1 - 0.01), 'stand', 'not before');
  assert.equal(hare.faceAt(end), -1, 'the hare ends facing left');
  assert.equal(hare.faceAt(hw.t1 - 0.2), 1, 'walking right until then');
  assert.ok(hare.squashAt(hw.t1) < 0.5, 'and turns with the squash');
  assert.ok(plan.warnings.some(w => /pip's sit \(beats\[1\]\) comes during pip's walk, which ends [\d.]+ s into the shot: it is taken when the walk ends/.test(w)), plan.warnings.join('\n'));
  assert.ok(plan.warnings.some(w => /hare's turn \(beats\[3\]\) comes during hare's walk/.test(w)));
});

test('a pose during a move that has its own "pose": the later beat wins, with a warning', async () => {
  const film = tiny({ actors: { pip: { at: 'x:800', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'walk', who: 'pip', to: 'x:1400', pose: 'arms-crossed' },
    { do: 'pose', who: 'pip', pose: 'hands-on-hips', with: 'prev', after: 1 },
  ] }] });
  const plan = compile(await loadFilm(film)), pip = actorOf(plan, 'pip');
  assert.equal(pip.basePoseName(plan.shots[0].t1 - 0.01), 'hands-on-hips');
  assert.ok(plan.warnings.some(w => /over its own "pose": "arms-crossed"/.test(w)), plan.warnings.join('\n'));
});

// ───────────── 1.6 a lifting gesture over a walk ─────────────
test('a gesture that leaves the ground over a walk keeps the gait\'s lift and body height (and warns); after the walk it lifts', async () => {
  const mk = gest => tiny({ actors: { gran: { at: 'x:1150', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'full' }, beats: [
    { do: 'walk', who: 'gran', to: 'x:1500' }, ...(gest ? [{ do: 'gesture', who: 'gran', name: 'jump-for-joy', with: 'prev', after: 0.3 }] : []),
  ] }] });
  const plain = compile(await loadFilm(mk(false))), joy = compile(await loadFilm(mk(true)));
  const A = actorOf(joy, 'gran'), B = actorOf(plain, 'gran'), g = A.gest[0], w = A.moves[0];
  assert.ok(w.t1 > g.t1, 'the walk outlasts the gesture');
  let seen = false;
  for (let t = g.t0; t < g.t1; t += 1 / 48) {
    const p = A.poseAt(t), q = B.poseAt(t);
    for (const k of ['lift', 'gy', 'gyW']) near(p[k] ?? 0, q[k] ?? 0, 1e-9, `${k} at ${t}`);
    if (Math.abs((p.shF ?? 0) - (q.shF ?? 0)) > 0.5) seen = true;
  }
  assert.ok(seen, 'the arms still go up');
  assert.ok(joy.warnings.some(w => /gran's gesture "jump-for-joy" \(beats\[1\]\) leaves the ground, but it comes during gran's walk/.test(w)), joy.warnings.join('\n'));
  // on its own the jump still lifts
  const still = compile(await loadFilm(tiny({ actors: { gran: { at: 'x:1150' } }, shots: [{ id: 'a', camera: { size: 'full' }, beats: [{ do: 'gesture', who: 'gran', name: 'jump-for-joy' }] }] })));
  assert.ok(Math.max(...[0.4, 0.5, 0.6, 0.7].map(t => actorOf(still, 'gran').poseAt(t).lift || 0)) > 20);
  assert.ok(!still.warnings.length);
});

test('an arm gesture over a walk is drawn as before (it changes no lift or body key)', async () => {
  const film = tiny({ actors: { pip: { at: 'x:1150', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'full' }, beats: [
    { do: 'walk', who: 'pip', to: 'x:1500' }, { do: 'gesture', who: 'pip', name: 'wave', with: 'prev', after: 0.3 },
  ] }] });
  const plan = compile(await loadFilm(film));
  assert.ok(!plan.warnings.some(w => /leaves the ground/.test(w)));
});

// ───────────── 1.7 set with dur ─────────────
test('"set" with "dur" eases numbers and hex colours over it; without, it changes at once', async () => {
  const mk = dur => tiny({ actors: { fidget: { at: 'x:1200' } }, shots: [{ id: 'a', camera: { size: 'full' }, beats: [
    { wait: 1 }, { do: 'set', who: 'fidget', params: { tail: 0.45, coat: '#000000', name: 'x' }, ...(dur ? { dur } : {}) },
  ], hold: 1 }] });
  const eased = compile(await loadFilm(mk(2))), at = compile(await loadFilm(mk(0)));
  const E = actorOf(eased, 'fidget'), I = actorOf(at, 'fidget');
  assert.equal(E.paramsAt(0.5).tail, undefined, 'the rig\'s own (tail 1, coat #b4542a) until the set');
  const mid = E.paramsAt(2);
  near(mid.tail, (1 + 0.45) / 2, 1e-9, 'half way at the middle (eased)');
  assert.equal(mid.coat, '#5a2a15', 'the colour half way');
  assert.equal(mid.name, 'x', 'other values at once');
  const q = E.paramsAt(1.5); assert.ok(q.tail < 1 && q.tail > mid.tail, 'eased in');
  assert.equal(E.paramsAt(3).tail, 0.45); assert.equal(E.paramsAt(3).coat, '#000000');
  assert.ok(eased.shots[0].t1 >= 3 + 1 - 1e-9, 'the beat takes its dur');
  assert.equal(I.paramsAt(1).tail, 0.45, 'without dur: at once'); assert.equal(I.paramsAt(1 - 1e-3).tail, undefined);
});

// ───────────── 1.1 a move that sets off the other way turns; 1.2 back-to-back moves don't snap to standing ─────────────
const FILMS = ['_test', 'glim', 'kite', 'seventy-six-summers', 'solar-system', 'storm-shelter', 'strawberry-race'];
const plans = new Map();
const filmPlan = async f => { if (!plans.has(f)) plans.set(f, (await loadPlan(new URL(`../films/${f}/`, import.meta.url).pathname)).plan); return plans.get(f); };
// the drawing's head (units from the contact point) and outline height at t, with the head held level (looks apart)
const shape = (A, t) => { const st = A.state(t, FPS).st, r = probe(A.rig, 0, 0, 1, 1, { ...st, look: 0, tilt: 0, shadow: false }); return { h: r.head, ht: r.bounds[3] - r.bounds[1] }; };
const step = (p, q) => [Math.hypot(q.h[0] - p.h[0], q.h[1] - p.h[1]), Math.abs(q.ht - p.ht)];
// a gait's own largest frame-to-frame step: its cycle stepped at the fastest cadence a leg reaches
function gaitOwn(A, L, params) {
  let rate = 0; for (let i = 1; i < 40; i++) { const τ = (L.T * i) / 40; rate = Math.max(rate, (L.phaseAt(τ + 1e-3) - L.phaseAt(τ - 1e-3)) / 2e-3); }
  const sh = ph => { const r = probe(A.rig, 0, 0, 1, 1, { pose: A.rig.gaits[L.gait](ph - Math.floor(ph)), params, look: 0, tilt: 0, shadow: false, t: 0 }); return { h: r.head, ht: r.bounds[3] - r.bounds[1] }; };
  let o = [0, 0]; for (let i = 0; i < 100; i++) { const d = step(sh(i / 100), sh(i / 100 + rate / FPS)); o = [Math.max(o[0], d[0]), Math.max(o[1], d[1])]; }
  return o;
}

test('no actor in any film flips its facing between two frames without the turn squash (48 Hz, inside shots)', async () => {
  for (const f of FILMS) {
    const plan = await filmPlan(f), bare = [];
    for (const rec of plan._scenes) for (const A of rec.actors.values()) if (A.place0) bare.push(...bareFlips(plan, A, rec).map(t => `${A.id} ${t}`));
    assert.deepEqual(bare, [], `${f}: bare flips`);
  }
});

test('glim 1.4: Tilly keeps facing left on the nearly vertical hop up to her den', async () => {
  const plan = await filmPlan('glim'), A = actorOf(plan, 'tilly'), run = A.moves.find(m => m.kind === 'run'), J = run.legs.find(L => L.type === 'jump');
  assert.ok(J && Math.abs(J.B.x - J.A.x) < 5, 'the hop is nearly vertical');
  assert.equal(J.face1, -1);
  const end = plan.shots.find(s => s.id === '1.4').t1;
  for (let t = run.t0 + 0.3; t < end; t += 1 / 48) assert.equal(A.faceAt(t), -1, `at ${t} (to the end of 1.4)`);
});

test('back to back on one gait, in every film: the stride carries on, and no frame steps further than the gait itself does', async () => {
  let n = 0;
  for (const f of FILMS) {
    const plan = await filmPlan(f);
    for (const rec of plan._scenes) for (const A of rec.actors.values()) {
      const mv = A.moves.filter(m => !m.place && m.legs.length);
      for (let i = 1; i < mv.length; i++) {
        const a = mv[i - 1], b = mv[i], ea = A.end(a);
        if (b.t0 - ea >= 1 / FPS || b.t0 < a.t0) continue;
        const La = A.legAt(a, Math.min(b.t0, ea)).L, Lb = b.legs[0];
        if (La.type !== 'route' || Lb.type !== 'route' || La.hops || Lb.hops || La.gait !== Lb.gait) continue;
        n++;
        near(Lb.phaseAt(0), La.phaseAt(Math.min(b.t0, ea) - a.t0 - a.legs.slice(0, a.legs.indexOf(La)).reduce((s, L) => s + L.T, 0)), 1e-9, `${f} ${A.id} ${b.t0}: phase carried`);
        const own = [gaitOwn(A, La, A.paramsAt(b.t0)), gaitOwn(A, Lb, A.paramsAt(b.t0))].reduce((o, x) => [Math.max(o[0], x[0]), Math.max(o[1], x[1])]);
        let p = null;
        for (let k = Math.ceil((b.t0 - 3 / FPS) * FPS); k <= Math.floor((b.t0 + 0.3) * FPS); k++) {
          const s = shape(A, k / FPS);
          if (p) { const d = step(p, s); assert.ok(d[0] <= own[0] + 1e-6 && d[1] <= own[1] + 1e-6, `${f} ${A.id} seam ${b.t0.toFixed(3)} f${k}: head ${d[0].toFixed(2)} / outline ${d[1].toFixed(2)} vs the gait's ${own[0].toFixed(2)} / ${own[1].toFixed(2)}`); }
          p = s;
        }
      }
    }
  }
  assert.ok(n >= 15, `seams checked: ${n}`);
});

test('a run turned back on itself: one squashed turn at the seam, the stride carried, never a standing frame', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1000', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'run', who: 'hare', to: 'x:1500' }, { do: 'run', who: 'hare', to: 'x:1100' },
  ] }] });
  const plan = compile(await loadFilm(film)), A = actorOf(plan, 'hare'), [r1, r2] = A.moves;
  near(r2.t0, r1.t1, 1e-9);
  assert.ok(A.faceEv.some(e => e.flip && e.src === r2 && Math.abs(e.t - r2.t0) < 1e-9), 'a flip where the second run sets off');
  assert.ok(A.squashAt(r2.t0) < 0.35);
  assert.deepEqual(bareFlips(plan, A, plan._scenes[0]), []);
  const stand = shape({ ...A, state: () => ({ st: { pose: A.rig.poses.stand, t: 0 } }), rig: A.rig }, 0);
  for (let t = r2.t0 - 0.1; t < r2.t0 + 0.25; t += 1 / 96) assert.ok(step(shape(A, t), stand)[1] > 1e-6 || step(shape(A, t), stand)[0] > 1e-6, `not the standing drawing at ${t}`);
});

test('a move on another gait blends in from the pose drawn just before it, not from standing', async () => {
  const film = tiny({ actors: { fidget: { at: 'x:900', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'walk', who: 'fidget', to: 'x:1300' }, { do: 'run', who: 'fidget', to: 'x:1700', with: 'prev', after: 1.5 },
  ] }] });
  const plan = compile(await loadFilm(film)), A = actorOf(plan, 'fidget'), [w, r] = A.moves;
  assert.ok(w.cut !== undefined && r.t0 < w.t1, 'the run cuts into the walk');
  const d = step(shape(A, r.t0 - 1e-4), shape(A, r.t0 + 1e-4));
  assert.ok(d[0] < 0.05 && d[1] < 0.05, `the drawing goes on from the walk: ${d}`);
});

// ───────────── 1.3 heads that ease ─────────────
// A head snap: a step in look or tilt of more than 0.08 within 1/96 s that stands alone (the steps either side of it
// under half its size). An eased look over a big swing (up to down: 1.9) may step past 0.08 at its fastest; it has
// steps of about the same size around it.
function headSnaps(plan, A, rec) {
  const out = [], v = [];
  let ps = null;
  const flush = () => { for (const key of ['look', 'tilt']) for (let i = 1; i < v.length; i++) {
    const d = Math.abs(v[i][key] - v[i - 1][key]); if (d <= 0.08) continue;
    const a = i > 1 ? Math.abs(v[i - 1][key] - v[i - 2][key]) : 0, b = i + 1 < v.length ? Math.abs(v[i + 1][key] - v[i][key]) : 0;
    if (Math.max(a, b) < d / 2) out.push(`${A.id} ${key} ${v[i].t.toFixed(3)} ${d.toFixed(3)}`);
  } v.length = 0; };
  for (let t = rec.t0; t < rec.t1; t += 1 / 96) {
    const sh = plan.shotAt(t);
    if (!sh || sh.scene !== rec.id || !A.visibleAt(t) || sh.id !== ps) flush();
    ps = sh?.id ?? null;
    if (!sh || sh.scene !== rec.id || !A.visibleAt(t)) continue;
    v.push({ t, look: A.lookAt(t, A.posAt(t)), tilt: A.tiltAt(t) });
  }
  flush();
  return out;
}
test('no head snaps in any film: looks and tilts ease across pose blends, turns, move ends, sleep and waking', async () => {
  for (const f of FILMS) {
    const plan = await filmPlan(f), snaps = [];
    for (const rec of plan._scenes) for (const A of rec.actors.values()) if (A.place0) snaps.push(...headSnaps(plan, A, rec));
    assert.deepEqual(snaps, [], `${f}: head snaps`);
  }
});

test('76 Summers 2.6: the owl nods off without its head popping up: it stays down (a droop, or lower) and looks ahead', async () => {
  const plan = await filmPlan('seventy-six-summers'), A = actorOf(plan, 'hollis', plan._scenes.findIndex(s => s.id === 's02'));
  const ts = A.sleepEv.filter(e => e.asleep && e.t > 0).map(e => e.t).sort((a, b) => a - b).at(-1), T = A.rig.lookTime ?? 0.3;
  const before = A.tiltAt(ts - 1e-3), look = t => A.lookAt(t, A.posAt(t));
  assert.ok(before < SLEEP_TILT, `it was looking down: ${before}`);
  near(A.tiltAt(ts + 1e-4), before, 0.01, 'no pop as it falls asleep');
  near(A.tiltAt(ts + T + 0.01), Math.min(A.tiltAt(ts), SLEEP_TILT), 1e-6, 'the head stays down');
  near(look(ts + 1e-4), look(ts - 1e-3), 0.01); near(look(ts + T + 0.01), 0, 1e-9, 'then looks ahead');
  near(A.tiltAt(ts + 3), A.tiltAt(ts + T + 0.01), 1e-9);
  // asleep from the start of the scene (2.1): the droop
  near(A.tiltAt(plan._scenes.find(s => s.id === 's02').t0 + 0.5), SLEEP_TILT, 1e-9);
});

test('a sleeper woken by a move lifts its head over its look time, from the droop', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1000', face: 'right', pose: 'sleep' }, fidget: { at: 'x:1400', face: 'left' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'look', who: 'hare', to: 'fidget' }, { wait: 1 }, { do: 'walk', who: 'hare', to: 'x:1200' },
  ] }] });
  const plan = compile(await loadFilm(film)), A = actorOf(plan, 'hare'), w = A.moves.find(m => m.kind === 'walk'), T = A.rig.lookTime ?? 0.3;
  near(A.tiltAt(w.t0 - 1e-3), SLEEP_TILT, 1e-9, 'asleep: drooped');
  near(A.tiltAt(w.t0 + 1e-4), SLEEP_TILT, 0.01, 'no snap as it wakes');
  const awake = A.tiltAt(w.t0 + T + 0.05); assert.ok(Math.abs(awake - SLEEP_TILT) > 0.2, `then up: ${awake}`);
  assert.deepEqual(headSnaps(plan, A, plan._scenes[0]), []);
});

test('a look at an actor that changes pose follows its head through the blend', async () => {
  const film = tiny({ actors: { pip: { at: 'x:1000', face: 'right' }, hare: { at: 'x:1300', face: 'left' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
    { do: 'look', who: 'hare', to: 'pip' }, { do: 'pose', who: 'pip', pose: 'crouch', dur: 1.2, after: 0.5 },
  ], hold: 1 }] });
  const plan = compile(await loadFilm(film)), P = actorOf(plan, 'pip'), H = actorOf(plan, 'hare'), e = P.poseEv.find(x => x.name === 'crouch');
  const h0 = P.headAt(e.t - 1e-4), h1 = P.headAt(e.t + 1e-4), hm = P.headAt(e.t + 0.6), he = P.headAt(e.t + 1.3);
  assert.ok(Math.hypot(h1[0] - h0[0], h1[1] - h0[1]) < 0.5, 'no jump as the blend starts');
  assert.ok(hm[1] > h0[1] + 2 && hm[1] < he[1] - 2, 'half way down at the middle');
  assert.deepEqual(headSnaps(plan, H, plan._scenes[0]), []);
});
