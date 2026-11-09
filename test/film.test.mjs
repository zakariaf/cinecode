// Film core: loading and validation, beat timing, state carried across shots, routes, feet that don't slide,
// camera framing math and clamping, drawFrame determinism, plan contents and frameInfo; round 2 (DESIGN §9.1):
// tts / trimEnd / non-verbal lines, marks, riding, wading, head tilt, camera to / zoomTo / moveAt, shot time and
// grade, overlays and their api, rim light, sound / music validation, the owed fixes.
//   node --test test/film.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';
import { compile, estimateLine, DEFAULT_HOLD } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { frameSubjects, regionOf, clampFrame, SIZE_SPEC, ZMAX, viewRect } from '../engine/film/camera.mjs';
import { getKit } from '../engine/set/kits/index.mjs';
import { getRig } from '../engine/cast/index.mjs';
import { mountPoint, shortHash, probe } from '../engine/film/util.mjs';
import { STORY } from '../engine/film/grade.mjs';
import { rimStrength } from '../engine/film/frame.mjs';
import { stingNames, sfxNames } from '../engine/film/validate.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

// A small two-scene film at 320×180 (fast to draw).
function smallFilm({ W = 320, H = 180 } = {}) {
  return {
    title: 'Small', format: { width: W, height: H, fps: 24, captions: 'all' },
    voices: { narrator: { voice: 'Sulafat' }, hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' } },
    cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' } },
    sets: { m: { kit: 'meadow' }, st: { kit: 'stream' } },
    scenes: [
      {
        id: 's1', set: 'm', time: 'morning', music: { mood: 'pastoral', intensity: 0.4 },
        actors: { tortoise: { at: 'x:1500' }, hare: { at: 'x:1000' } },
        shots: [
          { id: 'a', camera: { size: 'wide', on: ['hare', 'tortoise'] }, beats: [
            { id: 'w', do: 'walk', who: 'hare', to: 'x:1250' },
            { say: 'narrator', text: 'One morning the hare went for a little walk.', with: 'prev' },
            { do: 'look', who: 'tortoise', at: 'hare', with: 'w', after: 0.5 },
            { wait: 1, after: 0.3 },
            { sfx: 'chime', at: 0.25, caption: '[a bell]' },
          ] },
          { id: 'b', dur: 2.5, camera: { size: 'close', on: ['hare'] }, beats: [{ say: 'hare', text: 'Hello, slow friend.' }] },
          { id: 'c', camera: { size: 'full', on: ['tortoise'], move: 'push-in' }, beats: [{ do: 'sit', who: 'tortoise' }, { do: 'gesture', who: 'hare', name: 'wave', with: 'prev' }] },
          { id: 'd', camera: { size: 'medium', on: ['tortoise', 'hare'] }, hold: 1, beats: [{ say: 'tortoise', text: 'Good morning.' }] },
        ],
      },
      {
        id: 's2', set: 'st', time: 'golden',
        actors: { hare: { at: 'bank_left' } },
        shots: [{ id: 'e', camera: { size: 'full', on: ['hare'], move: 'track' }, beats: [{ do: 'hop', who: 'hare', to: 'bank_right' }] }],
      },
    ],
  };
}

let cached;
async function smallPlan() {
  if (!cached) { const film = await loadFilm(smallFilm()); cached = { film, plan: compile(film) }; }
  return cached;
}
const scene = (plan, id) => plan._scenes.find(s => s.id === id);
const shotRec = (plan, id) => plan._scenes.flatMap(s => s.shots).find(s => s.id === id);

// ───────────── loading and validation ─────────────
test('validation lists every problem with its path', async () => {
  const film = smallFilm();
  film.format.width = 321;
  film.cast.zed = { rig: 'zebra' };
  film.sets.q = { kit: 'nope' };
  film.scenes[0].actors.hare.at = 'nowhere';
  film.scenes[0].shots[0].camera = { size: 'huge', move: 'zoomy' };
  film.scenes[0].shots[0].beats.push(
    { do: 'gesture', who: 'hare', name: 'moonwalk' },
    { say: 'nobody', text: 'Hi' },
    { do: 'walk', who: 'hare', to: 'x:1100', with: 'zz' },
    { do: 'dance', who: 'hare' },
  );
  film.scenes[0].shots[1].id = 'a';
  await assert.rejects(loadFilm(film), e => {
    assert.ok(e instanceof ValidationError);
    assert.equal(e.name, 'ValidationError');
    const paths = e.problems.map(p => p.path);
    for (const p of ['format.width', 'cast.zed.rig', 'sets.q.kit', 'scenes[0].actors.hare.at', 'scenes[0].shots[0].camera.size',
      'scenes[0].shots[0].camera.move', 'scenes[0].shots[0].beats[5].name', 'scenes[0].shots[0].beats[6].say',
      'scenes[0].shots[0].beats[7].with', 'scenes[0].shots[0].beats[8].do', 'scenes[0].shots[1].id']) assert.ok(paths.includes(p), `missing problem at ${p}`);
    for (const p of e.problems) assert.ok(p.message.startsWith(`${p.path}:`), p.message);
    assert.match(e.message, /film\.json has \d+ problems/);
    assert.match(e.message, /unknown rig "zebra"/);
    return true;
  });
});

test('a JSON syntax error reports line and column', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-film-'));
  try {
    writeFileSync(join(dir, 'film.json'), '{\n  "title": "x",\n  "cast": { "hare": { "rig": "hare" }, }\n}\n');
    await assert.rejects(loadFilm(dir), e => {
      assert.equal(e.name, 'ValidationError');
      assert.match(e.problems[0].message, /invalid JSON at line 3, column \d+/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the test film loads and compiles cleanly', async () => {
  const film = await loadFilm('films/_test');
  assert.deepEqual(film.warnings, []);
  const plan = compile(film);
  assert.deepEqual(plan.warnings, []);
  assert.ok(plan.duration > 30 && plan.duration < 70);
  const sizes = new Set(plan.shots.map(s => s.size)), moves = new Set(plan.shots.map(s => s.move));
  for (const s of ['establishing', 'wide', 'full', 'medium', 'close', 'extreme-close']) assert.ok(sizes.has(s), `size ${s} used`);
  for (const m of ['static', 'push-in', 'pan', 'track', 'tilt-up', 'tilt-down', 'handheld', 'pull-out']) assert.ok(moves.has(m), `move ${m} used`);
});

// ───────────── timing ─────────────
test('beat timing: sequence, with prev, with id, after, at, hold, dur, frame quantization', async () => {
  const { plan } = await smallPlan();
  const a = shotRec(plan, 'a'), [walk, narr, look, wait, sfx] = a.beats, T = a.t0;
  assert.equal(T, 0, 'no open card: the first shot starts at 0');
  near(walk.t0, T, 1e-9, 'walk starts the shot');
  assert.ok(walk.t1 - walk.t0 > 0.5, 'the walk takes time');
  near(narr.t0, walk.t0, 1e-9, 'with prev starts together with the previous beat');
  near(narr.t1 - narr.t0, estimateLine('One morning the hare went for a little walk.'), 1e-9, 'line duration is estimated without a voice');
  near(look.t0, walk.t0 + 0.5, 1e-9, 'with an id + after');
  near(wait.t0, Math.max(walk.t1, narr.t1, look.t1) + 0.3, 1e-9, 'sequential beats start when the previous group ends, plus after');
  near(wait.t1 - wait.t0, 1, 1e-9);
  near(sfx.t0, T + 0.25, 1e-9, 'at pins the start relative to the shot');
  const maxEnd = Math.max(...a.beats.map(b => b.t1));
  near(a.t1, maxEnd + DEFAULT_HOLD, 0.5 / 24 + 1e-9, 'a shot lasts until its last beat ends plus hold');
  for (const s of plan.shots) { near(s.t0 * 24, Math.round(s.t0 * 24), 1e-6, `${s.id} starts on a frame`); near(s.t1 * 24, Math.round(s.t1 * 24), 1e-6, `${s.id} ends on a frame`); }
  const b = plan.shots.find(s => s.id === 'b');
  near(b.t1 - b.t0, 2.5, 1e-9, 'dur overrides the length');
  const d = shotRec(plan, 'd');
  near(d.t1, d.beats[0].t1 + 1, 0.5 / 24 + 1e-9, 'custom hold');
  // shots and scenes tile the film
  for (let i = 1; i < plan.shots.length; i++) near(plan.shots[i].t0, plan.shots[i - 1].t1, 1e-9, 'shots are contiguous');
  assert.equal(plan.scenes[1].transition, 'dissolve', 'a change of set dissolves by default');
  near(plan.duration, plan.shots.at(-1).t1, 1e-9);
});

test('voice durations replace estimates', async () => {
  const { film, plan } = await smallPlan();
  const line = plan.lines.find(l => l.who === 'hare');
  assert.equal(line.estimated, true);
  assert.equal(line.voice, 'hare');
  const voiced = compile(film, { voices: new Map([[line.id, { dur: 3.25, env: null }]]) });
  const l2 = voiced.lines.find(l => l.id === line.id);
  assert.equal(l2.estimated, false);
  near(l2.t1 - l2.t0, 3.25, 1e-9);
  const b = voiced.shots.find(s => s.id === 'b'), c = voiced.shots.find(s => s.id === 'c');
  near(c.t0, b.t1, 1e-9);
  assert.ok(l2.t1 > b.t1, 'shot b has a fixed dur, the line runs past it');
});

// ───────────── continuity ─────────────
test('actor state carries across shots within a scene; a new scene starts from its actors block', async () => {
  const { film, plan } = await smallPlan();
  const s1 = scene(plan, 's1'), hare = s1.actors.get('hare'), tort = s1.actors.get('tortoise');
  const a = plan.shots.find(s => s.id === 'a'), b = plan.shots.find(s => s.id === 'b'), d = plan.shots.find(s => s.id === 'd');
  const end = hare.posAt(a.t1 - 0.01), inB = hare.posAt((b.t0 + b.t1) / 2);
  near(end.x, 1250, 40, 'the walk reached its target');
  near(inB.x, end.x, 1e-6, 'shot b starts where shot a left the hare');
  near(inB.y, end.y, 1e-6);
  const sitName = tort.basePoseName(d.t0 + 0.1);
  assert.notEqual(sitName, 'stand', 'the tortoise sat down in shot c');
  assert.equal(tort.basePoseName(d.t1 - 0.01), sitName, 'and is still sitting in shot d');
  // facing: the hare walked right, so it faces right afterwards
  assert.equal(hare.faceAt(b.t0 + 0.1), 1);
  // scene 2 resets to its own actors block
  const s2 = scene(plan, 's2'), h2 = s2.actors.get('hare'), bank = film.resolved.sets.st.anchor('bank_left');
  const p = h2.posAt(s2.t0 + 0.01);
  near(p.x, bank.x, 30, 'scene 2 starts at bank_left');
  assert.equal(s2.actors.has('tortoise'), false);
});

test('walks follow set.route around obstacles', async () => {
  const film = smallFilm();
  film.scenes = [{
    id: 's1', set: 'm', actors: { hare: { at: 'x:1840,y:1000' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, beats: [{ do: 'walk', who: 'hare', to: 'x:2260,y:1000' }] }],
  }];
  const f = await loadFilm(film), S = f.resolved.sets.m;
  let calls = 0;
  const route = S.route;
  S.route = (...args) => { calls++; return route.apply(S, args); };
  const plan = compile(f);
  assert.ok(calls > 0, 'compile asks the set for a route');
  // the straight line crosses the stump; the walked path does not
  const stump = S.colliders().find(c => c.id === 'stump');
  const inside = (x, y) => ((x - stump.x) / stump.rx) ** 2 + ((y - stump.y) / stump.ry) ** 2 < 1;
  assert.ok(inside(2050, 1000), 'precondition: the stump is in the way');
  const A = scene(plan, 's1').actors.get('hare'), mv = A.moves[0];
  let maxDev = 0;
  for (let t = mv.t0; t <= mv.t1; t += 1 / 48) {
    const p = A.posAt(t);
    assert.ok(!inside(p.x, p.y), `t=${t.toFixed(2)}: inside the stump at ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
    assert.ok(S.isWalkable(p.x, p.y), `t=${t.toFixed(2)}: not walkable`);
    maxDev = Math.max(maxDev, Math.abs(p.y - 1000));
  }
  assert.ok(maxDev > 15, 'the path detours');
  near(A.posAt(mv.t1 + 0.1).x, 2260, 30, 'and arrives');
});

test('stepping stones become jumps; hops land; footsteps follow the gait', async () => {
  const { plan } = await smallPlan();
  const A = scene(plan, 's2').actors.get('hare'), mv = A.moves[0];
  const types = mv.legs.map(L => L.type);
  assert.ok(types.filter(t => t === 'jump').length >= 3, `jumps over the stones (${types.join(',')})`);
  const e = plan.shots.find(s => s.id === 'e');
  const hops = plan.sfx.filter(s => s.name === 'hop' && s.t >= e.t0 && s.t < e.t1), lands = plan.sfx.filter(s => s.name === 'land' && s.t >= e.t0 && s.t < e.t1);
  assert.ok(hops.length >= 3 && lands.length >= 3, 'hop and land sounds');
  assert.equal(plan.sfx.some(s => s.name === 'splash' && s.t >= e.t0), false, 'nobody falls in the water');
  // airborne somewhere over the water, never standing in it
  const S = plan.shots.find(s => s.id === 'e').set;
  let air = 0;
  for (let t = e.t0; t < e.t1; t += 1 / 24) { const st = A.state(t); if (st.airborne) air++; else if (st.mode === 'ground') assert.ok(!S.inWater(st.x, st.y), `t=${t.toFixed(2)} standing in water`); }
  assert.ok(air > 5);
  // footsteps of the walk in scene 1 land inside the walk, on grass
  const walk = scene(plan, 's1').actors.get('hare').moves[0];
  const steps = plan.sfx.filter(s => s.name.startsWith('footstep-') && s.who === 'hare' && s.t < plan.scenes[0].t1);
  assert.ok(steps.length >= 2);
  for (const s of steps) { assert.equal(s.name, 'footstep-grass'); assert.ok(s.t >= walk.t0 - 1e-6 && s.t <= walk.t1 + 1e-6); assert.ok(Math.abs(s.pan) <= 0.8); }
});

test('planted feet do not slide while walking', async () => {
  const film = smallFilm();
  film.scenes = [{
    id: 's1', set: 'm', actors: { tortoise: { at: 'x:1000,y:1060' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['tortoise'] }, beats: [{ do: 'walk', who: 'tortoise', to: 'x:1400,y:1060' }] }],
  }];
  const f = await loadFilm(film), plan = compile(f);
  const A = scene(plan, 's1').actors.get('tortoise'), rig = A.rig, mv = A.moves[0];
  assert.ok(rig.feet, 'the tortoise rig reports its feet');
  const foot = t => { const st = A.state(t); return rig.feet(st.st.pose).map(([x, y, c]) => [st.x + st.face * x * st.s, c]); };
  // follow each foot through every stance: from touchdown to lift-off it must stay where it landed
  let checked = 0, worst = 0, travelled = 0;
  const dt = 1 / 240, down = [];
  for (let t = mv.t0 + 0.5; t < mv.t1 - 0.5; t += dt) {
    foot(t).forEach(([x, c], j) => {
      if (!c) { down[j] = null; return; }
      if (down[j] == null) { down[j] = x; return; }
      checked++; worst = Math.max(worst, Math.abs(x - down[j]));
    });
  }
  travelled = Math.abs(A.posAt(mv.t1 - 0.5).x - A.posAt(mv.t0 + 0.5).x);
  assert.ok(travelled > 150, 'the tortoise walked');
  assert.ok(checked > 100, 'feet are planted for much of the walk');
  assert.ok(worst < 1, `a planted foot slid ${worst.toFixed(2)} px during its stance`);
});

// ───────────── camera ─────────────
test('framing math: each size puts its region at the specified fraction of the frame', () => {
  const W = 1920, H = 1080;
  const sub = { box: [1000, 600, 1120, 1000], head: [1090, 700], hh: 80, face: 1 };
  for (const size of ['wide', 'full', 'medium', 'close', 'extreme-close']) {
    const F = frameSubjects([sub], size, { W, H });
    const R = regionOf(sub, size), h = (R[3] - R[1]) * F.zoom, spec = SIZE_SPEC[size];
    const cap = Math.min(ZMAX, (spec.wmax * W) / (R[2] - R[0]), ((spec.region === 'head' || spec.region === 'face' ? 0.94 : 0.86) * H) / (R[3] - R[1]));
    near(F.zoom, Math.min((spec.f * H) / (R[3] - R[1]), cap), 1e-9, size);
    if (F.zoom < cap - 1e-9) near(h / H, spec.f, 1e-6, `${size}: region fraction`);
    // the region is inside the frame
    const sx0 = (R[0] - F.cx) * F.zoom + W / 2, sx1 = (R[2] - F.cx) * F.zoom + W / 2, sy0 = (R[1] - F.cy) * F.zoom + H / 2, sy1 = (R[3] - F.cy) * F.zoom + H / 2;
    assert.ok(sx0 >= 0 && sx1 <= W && sy0 >= -1 && sy1 <= H + 1, `${size}: region in frame`);
    // lead room: facing right, the subject sits left of centre
    if (size !== 'extreme-close') assert.ok((sx0 + sx1) / 2 < W / 2, `${size}: lead room`);
  }
  // tighter sizes zoom in more
  const zs = ['wide', 'full', 'medium', 'close', 'extreme-close'].map(s => frameSubjects([sub], s, { W, H }).zoom);
  for (let i = 1; i < zs.length; i++) assert.ok(zs[i] > zs[i - 1], 'sizes order');
  // a tiny subject hits the zoom limit instead of the fraction
  const tiny = { box: [0, 0, 4, 5], head: [3, 1], hh: 1, face: 1 };
  assert.equal(frameSubjects([tiny], 'close', { W, H }).zoom, ZMAX);
  // two subjects far apart: the union has to fit the width
  const other = { ...sub, box: [2400, 600, 2520, 1000], head: [2490, 700] };
  const F2 = frameSubjects([sub, other], 'full', { W, H });
  near((2520 - 1000) * F2.zoom, SIZE_SPEC.full.wmax * W, 1e-6, 'two-shot fits the width');
});

test('cameras are clamped inside the painted set, at any zoom and aspect', async () => {
  const S = getKit('meadow')({});
  const inArea = (v, msg) => { const A = S.area; assert.ok(v[0] >= A.x0 - 0.5 && v[2] <= A.x1 + 0.5 && v[1] >= A.y0 - 0.5 && v[3] <= A.y1 + 0.5, `${msg}: view ${v.map(Math.round)} outside the set`); };
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    for (const zoom of [0.05, 0.6, 1, 3, 10]) for (const [cx, cy] of [[-5000, -5000], [436, 600], [5000, 2000], [1400, 900]]) {
      const c = clampFrame(S, { cx, cy, zoom }, W, H);
      inArea(viewRect(c, W, H), `${W}x${H} z${zoom} (${cx},${cy})`);
      assert.ok(c.zoom >= zoom - 1e-9);
    }
  }
  // tight shots may move past the view rect toward a subject near its edge (the owl hollow at x 436 < view.x0)
  const c = clampFrame(S, { cx: 436, cy: 600, zoom: 8 }, 1920, 1080);
  near(c.cx, 436, 1e-6, 'close shot reaches the hollow');
  const w = clampFrame(S, { cx: 436, cy: 600, zoom: 1 }, 1920, 1080);
  assert.ok(w.cx >= S.view.x0 - 1e-6, 'wide shots keep the centre inside the view rect');
  // every frame of a compiled film stays inside its set
  const { plan } = await smallPlan();
  for (const s of plan.shots) for (const u of [0, 0.5, 0.99]) { const info = frameInfo(plan, s.t0 + (s.t1 - s.t0) * u); inArea(info.view, `${s.id}@${u}`); }
});

test('compiled shots frame their subjects at the requested size', async () => {
  const { plan } = await smallPlan();
  const check = (id, who, lo, hi) => {
    const s = plan.shots.find(x => x.id === id), info = frameInfo(plan, (s.t0 + s.t1) / 2), a = info.actors.find(x => x.id === who);
    const b = a.screenBox, H = plan.H, W = plan.W;
    const frac = (b[3] - b[1]) / H;
    assert.ok(frac >= lo && frac <= hi, `${id}: ${who} is ${frac.toFixed(2)} of the frame height`);
    return { b, W, H, info };
  };
  check('a', 'hare', 0.08, 0.4);
  const full = check('c', 'tortoise', 0.4, 0.95);
  assert.ok(full.b[0] >= 0 && full.b[2] <= full.W, 'full shot keeps the whole body in frame');
  // close shot: the head fills a good part of the frame and is in frame
  const s = plan.shots.find(x => x.id === 'b'), info = frameInfo(plan, (s.t0 + s.t1) / 2), h = info.actors.find(x => x.id === 'hare').headBox;
  assert.ok(h[0] >= 0 && h[2] <= plan.W && h[1] >= -2 && h[3] <= plan.H, 'close shot keeps the head in frame');
  assert.ok((h[3] - h[1]) / plan.H > 0.35, 'close shot is close');
});

// ───────────── plan contents ─────────────
test('plan: lines, captions, sfx, music, ambience, fx and cards', async () => {
  const { plan } = await smallPlan();
  assert.equal(plan.W, 320); assert.equal(plan.H, 180); assert.equal(plan.fps, 24);
  assert.equal(plan.lines.length, 3);
  for (const l of plan.lines) {
    assert.match(l.id, /^[0-9a-f]{12}$/);
    for (const k of ['who', 'voice', 'text', 't0', 't1', 'narrator', 'vo', 'shot', 'scene']) assert.ok(k in l, `line.${k}`);
  }
  assert.equal(plan.lines[0].narrator, true);
  // captions: every spoken line, plus the sound caption, all burned in 'all' mode
  for (const l of plan.lines) {
    const cs = plan.captions.filter(c => c.line === l.id);
    assert.ok(cs.length >= 1 && cs.every(c => c.burn), `caption for "${l.text}"`);
    assert.equal(cs.map(c => c.text).join(' '), l.text, 'long lines are split into chunks, nothing lost');
    near(cs[0].t0, l.t0, 1e-9); assert.ok(cs.at(-1).t1 >= l.t1, 'the caption stays up for the whole line');
    for (let i = 1; i < cs.length; i++) near(cs[i].t0, cs[i - 1].t1, 1e-9, 'chunks follow each other');
  }
  assert.ok(plan.captions.some(c => c.style === 'sound' && c.text === '[a bell]'));
  assert.ok(plan.sfx.some(s => s.name === 'chime' && Math.abs(s.t - 0.25) < 1e-3));
  for (const s of plan.sfx) { assert.ok(Number.isFinite(s.t) && s.t >= 0 && s.t <= plan.duration); assert.ok(Number.isFinite(s.gain)); }
  for (let i = 1; i < plan.sfx.length; i++) assert.ok(plan.sfx[i].t >= plan.sfx[i - 1].t, 'sfx sorted');
  // music covers the film from 0; the scene without a cue inherits the previous mood
  const cues = plan.music.filter(m => m.mood);
  near(cues[0].t0, 0, 1e-9); near(cues.at(-1).t1, plan.duration, 1e-9);
  assert.ok(cues.every(c => c.mood === 'pastoral'));
  // ambience per scene from the set
  assert.deepEqual(plan.ambience.map(a => a.name), ['meadow-day', 'stream']);
  assert.ok(plan.cards.length === 0, 'no titles block, no cards');
  assert.equal(typeof plan.shotAt, 'function'); assert.equal(plan.shotAt(0.01).id, 'a'); assert.equal(plan.sceneAt(plan.duration - 0.01).id, 's2');
});

test('frameInfo describes the frame', async () => {
  const { plan } = await smallPlan();
  const s = plan.shots.find(x => x.id === 'd'), t = s.t0 + 0.3, info = frameInfo(plan, t);
  for (const k of ['t', 'shot', 'scene', 'set', 'size', 'camera', 'view', 'actors', 'captionBox', 'captions', 'colliders']) assert.ok(k in info, `info.${k}`);
  assert.equal(info.shot, 'd'); assert.equal(info.scene, 's1'); assert.equal(info.size, 'medium');
  assert.deepEqual(info.actors.map(a => a.id).sort(), ['hare', 'tortoise']);
  for (const a of info.actors) {
    for (const k of ['screenBox', 'worldBox', 'headBox']) assert.ok(a[k].length === 4 && a[k].every(Number.isFinite), `${a.id}.${k}`);
    assert.ok(['ground', 'air', 'perch', 'surface', 'hollow'].includes(a.contact.kind));
    assert.ok(a.screenBox[2] > a.screenBox[0] && a.screenBox[3] > a.screenBox[1]);
  }
  assert.ok(info.actors.find(a => a.id === 'tortoise').speaking, 'the tortoise is speaking');
  assert.ok(info.captionBox && info.captions[0].text === 'Good morning.');
  assert.ok(Array.isArray(info.colliders) && info.colliders.length > 0);
});

// ───────────── drawing ─────────────
const pixels = (plan, t) => { const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); drawFrame(x, plan, t); return createHash('sha1').update(x.getImageData(0, 0, plan.W, plan.H).data).digest('hex'); };

test('drawFrame is deterministic and has no hidden state', async () => {
  const { plan } = await smallPlan();
  const b = plan.shots.find(s => s.id === 'b'), e = plan.shots.find(s => s.id === 'e');
  const t1 = (b.t0 + b.t1) / 2, t2 = e.t0 + 0.2;           // a close-up (depth of field) and a dissolve
  const h1 = pixels(plan, t1), h2 = pixels(plan, t2);
  assert.notEqual(h1, h2);
  assert.equal(pixels(plan, t2), h2, 'same t → same pixels');
  assert.equal(pixels(plan, t1), h1, 'drawing another frame in between changes nothing');
  // a freshly compiled plan draws the same pixels
  const again = compile(await loadFilm(smallFilm()));
  assert.equal(pixels(again, t1), h1, 'compile is deterministic');
});

test('vertical format renders and frames its subjects', async () => {
  const film = smallFilm({ W: 180, H: 320 });
  const plan = compile(await loadFilm(film));
  for (const id of ['a', 'b', 'c']) {
    const s = plan.shots.find(x => x.id === id), t = (s.t0 + s.t1) / 2, info = frameInfo(plan, t);
    for (const a of info.actors.filter(a => s.on.includes(a.id))) {
      const cx = (a.screenBox[0] + a.screenBox[2]) / 2;
      assert.ok(cx > 0 && cx < plan.W, `${id}: ${a.id} is in the vertical frame`);
    }
    const c = createCanvas(plan.W, plan.H), x = c.getContext('2d');
    drawFrame(x, plan, t);
    const d = x.getImageData(0, 0, plan.W, plan.H).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    assert.ok(lit > d.length / (4 * 97) * 0.9, `${id}: the frame is painted`);
  }
});

test('cards: open and end cards bracket the film', async () => {
  const film = smallFilm();
  film.titles = { open: { dur: 2 }, end: { dur: 2, lines: ['The End'] } };
  film.scenes = [film.scenes[0]];
  const plan = compile(await loadFilm(film));
  assert.deepEqual(plan.cards.map(c => c.kind), ['open', 'end']);
  near(plan.shots[0].t0, 2, 1e-9, 'the first shot follows the open card');
  near(plan.duration, plan.cards[1].t1, 1e-9);
  assert.equal(frameInfo(plan, 1).card, 'open');
  assert.notEqual(pixels(plan, 0.5), pixels(plan, plan.duration - 0.5));
});

// ═════════════ round 2 (DESIGN §9.1) ═════════════
// A one-scene film at 320×180 around a set; `shots` and `actors` fill it in.
function tiny({ set = 'meadow', actors, shots, cast = {}, extra = {}, scene = {}, W = 320, H = 180 }) {
  return {
    title: 'Tiny', format: { width: W, height: H, fps: 24, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' }, hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' } },
    cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise', scale: 1.3 }, ...cast },
    sets: { m: { kit: set } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors, shots, ...scene }],
    ...extra,
  };
}
const problemsOf = async film => { try { await loadFilm(film); return []; } catch (e) { if (!(e instanceof ValidationError)) throw e; return e.problems; } };
const withCustom = async (src, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-custom-'));
  try { writeFileSync(join(dir, 'custom.mjs'), src); return await fn(join(dir, 'custom.mjs')); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const stateAt = (plan, id, t) => plan.actorsAt(t).find(a => a.id === id);

test('say: tts is spoken, text is the caption; non-verbal lines; trimEnd shortens the estimate; ids hash speak', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' } },
    shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, beats: [
      { say: 'hare', text: '[laughs]', tts: 'Ha ha ha ha!', tone: 'giggling' },
      { say: 'hare', text: 'Ha ha ha ha!', tone: 'giggling' },
      { say: 'hare', text: 'Now kindly go aw—', tts: 'Now kindly go away.', trimEnd: 0.4 },
    ] }],
  });
  const plan = compile(await loadFilm(film)), [laugh, plain, cut] = plan.lines;
  assert.equal(laugh.text, '[laughs]'); assert.equal(laugh.speak, 'Ha ha ha ha!'); assert.equal(laugh.nonverbal, true); assert.equal(laugh.trimEnd, 0);
  assert.equal(plain.speak, plain.text); assert.equal(plain.nonverbal, false);
  assert.equal(laugh.id, plain.id, 'the id hashes what is spoken, not the caption');
  assert.equal(laugh.id, shortHash('hare', 'Puck', 'Ha ha ha ha!', 'giggling'), 'same hash as voice.mjs lineId(who, voice, speak, tone)');
  near(laugh.t1 - laugh.t0, estimateLine('Ha ha ha ha!'), 1e-9, 'the estimate counts the spoken words');
  near(cut.t1 - cut.t0, estimateLine('Now kindly go away.') - 0.4, 1e-9, 'trimEnd comes off the estimate');
  assert.equal(cut.trimEnd, 0.4); assert.equal(cut.text, 'Now kindly go aw—');
  assert.ok(plan.captions.some(c => c.line === laugh.id && c.text === '[laughs]'), 'the caption shows text');
  // with a voice: its (already trimmed) length is used as is
  const voiced = compile(await loadFilm(film), { voices: new Map([[cut.id, { dur: 1.1, env: null }]]) });
  near(voiced.lines[2].t1 - voiced.lines[2].t0, 1.1, 1e-9);
});

test('marks: a named instant, timed like any beat, in plan.marks; names are unique per film', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, beats: [{ wait: 1 }, { say: 'hare', text: 'Hello there.' }, { mark: 'bloom', after: 0.5 }, { wait: 0.4 }] }],
  });
  const plan = compile(await loadFilm(film)), a = shotRec(plan, 'a'), line = plan.lines[0];
  near(plan.marks.bloom, line.t1 + 0.5, 1e-9, 'after the line, plus after');
  near(a.beats[3].t0, plan.marks.bloom, 1e-9, 'a mark takes no time');
  film.scenes[0].shots[0].beats.push({ mark: 'bloom' });
  const ps = await problemsOf(film);
  assert.ok(ps.some(p => p.path === 'scenes[0].shots[0].beats[4].mark' && /duplicate mark "bloom"/.test(p.message)));
});

test('riding: hop on, ride the walk bob, turn with the carrier, hop off; no pops', async () => {
  const film = tiny({
    actors: { tortoise: { at: 'x:1000,y:1060', face: 'right' }, hare: { at: 'x:1180,y:1060', face: 'left' } },
    shots: [
      { id: 'a', camera: { size: 'wide', on: ['tortoise', 'hare'] }, beats: [
        { do: 'walk', who: 'tortoise', to: 'x:1500,y:1060', speed: 2, at: 0 },
        { do: 'hop', who: 'hare', to: 'on:tortoise', at: 0.6 },
      ], dur: 8 },
      { id: 'b', camera: { size: 'wide', on: ['tortoise', 'hare'] }, beats: [{ do: 'turn', who: 'tortoise', face: 'left' }, { wait: 0.5 }, { do: 'hop', who: 'hare', to: 'x:1800,y:1060' }], hold: 1 },
    ],
  });
  const f = await loadFilm(film), plan = compile(f), S = f.resolved.sets.m, T = getRig('tortoise');
  const a = plan.shots.find(s => s.id === 'a'), b = plan.shots.find(s => s.id === 'b');
  const hare = scene(plan, 's1').actors.get('hare'), mv = hare.moves[0];
  assert.equal(mv.kind, 'hop'); assert.ok(mv.mount, 'the hop ends mounted');
  let bob = [Infinity, -Infinity], mounted = 0, prev = null, worst = 0;
  for (let t = a.t0; t < b.t1; t += 1 / 24) {
    const h = stateAt(plan, 'hare', t), c = stateAt(plan, 'tortoise', t), y = h.y - (h.st.lift || 0) * h.s;
    if (prev) worst = Math.max(worst, Math.hypot(h.x - prev[0], y - prev[1]));
    prev = [h.x, y];
    if (h.mode !== 'mount') continue;
    mounted++;
    // the rider sits on the carrier's riding point (rig.mount mirrored by face, squashed in a turn), just in front of it
    const m = mountPoint(T, c.st.pose, c.st.params);
    near(h.x, c.x + c.face * m[0] * c.squash * c.s, 1e-6, `t=${t.toFixed(2)} rider x`);
    near(h.y, c.y + (m[1] - (c.st.lift || 0)) * c.s, 1e-6, `t=${t.toFixed(2)} rider y`);
    near(h.key, c.key + 0.01, 1e-9); assert.equal(h.carrier, 'tortoise'); assert.equal(h.st.shadow, false);
    if (h.action !== 'hop') assert.equal(h.airborne, false);
    near(h.s, c.s / 1.3, 1e-9, 'the rider keeps its own cast scale');
    if (c.action === 'walk') { bob[0] = Math.min(bob[0], h.y - c.y); bob[1] = Math.max(bob[1], h.y - c.y); }
  }
  assert.ok(mounted > 24 * 4, 'rides for most of the walk');
  assert.ok(bob[1] - bob[0] > 0.3, `follows the walk bob (${(bob[1] - bob[0]).toFixed(2)} px)`);
  assert.ok(worst < 40, `smooth hops (largest step ${worst.toFixed(1)} px per frame)`);
  // landing and take-off frames don't pop
  const land = mv.t1, J = mv.legs.at(-1);
  const p0 = hare.posAt(mv.t0 + J.T * 0.78 - 1e-3), p1 = hare.posAt(mv.t0 + J.T * 0.78 + 1e-3);
  assert.ok(Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2, 'touch-down onto the moving shell is continuous');
  const after = hare.posAt(land + 1e-3), before = hare.posAt(land - 1e-3);
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 2, 'the end of the hop hands over to the riding point');
  // hopping off: ends on the ground at the target, facing it
  const off = hare.moves.at(-1), end = hare.posAt(off.t1 + 0.1);
  assert.equal(end.mode, 'ground'); near(end.x, 1800, 40); assert.ok(S.isWalkable(end.x, end.y));
  const q0 = hare.posAt(off.t0 - 1e-3), q1 = hare.posAt(off.t0 + 1e-3);
  assert.ok(Math.hypot(q1.x - q0.x, q1.y - q0.y) < 2, 'take-off from the shell is continuous');
  // frameInfo reports the contact as a mount, with its carrier
  const info = frameInfo(plan, (a.t0 + a.t1) / 2 + 2), fh = info.actors.find(x => x.id === 'hare');
  assert.equal(fh.contact.kind, 'mount'); assert.equal(fh.contact.carrier, 'tortoise');
  // the sounds: a hop off the grass, a landing on the shell
  assert.ok(plan.sfx.some(e => e.name === 'land' && e.who === 'hare' && e.params?.surface === 'wood'));
});

test('riding: scene actors may start mounted; place "on:" mounts at once; rigs without mount use the top of their bounds', async () => {
  const film = tiny({
    cast: { pip: { rig: 'squirrel' }, nut: { rig: 'squirrel' } },
    actors: { tortoise: { at: 'x:1200,y:1060' }, pip: { on: 'tortoise', pose: 'sleep' }, hare: { at: 'x:1500,y:1060' }, nut: { at: 'x:1700,y:1060' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['tortoise', 'hare'] }, beats: [{ do: 'place', who: 'nut', to: 'on:hare', at: 0.5 }, { wait: 1 }] }],
  });
  film.scenes[0].actors.pip.face = 'right';
  const plan = compile(await loadFilm(film)), t = 0.2, p = stateAt(plan, 'pip', t), c = stateAt(plan, 'tortoise', t);
  assert.equal(p.mode, 'mount'); assert.equal(p.carrier, 'tortoise'); assert.equal(p.face, 1);
  assert.ok(p.y < c.y - 20, 'sits up on the shell');
  assert.equal(p.st.shadow, false); near(p.key, c.key + 0.01, 1e-9);
  // nut is placed onto the hare (a rig without mount: the top centre of its bounds)
  const H = getRig('hare'), tt = stateAt(plan, 'nut', 1), h = stateAt(plan, 'hare', 1);
  assert.equal(stateAt(plan, 'nut', 0.4).mode, 'ground'); assert.equal(tt.mode, 'mount'); assert.equal(tt.carrier, 'hare');
  const b = H.bbox(h.st.pose, 1), m = mountPoint(H, h.st.pose, h.st.params);
  near(m[0], (b[0] + b[2]) / 2, 1e-9); near(m[1], b[1], 1e-9);
  near(tt.y, h.y + m[1] * h.s, 1e-6);
});

test('riding is validated: only hop / place ride, riders cannot walk, carriers must be in the scene', async () => {
  const film = tiny({
    cast: { pip: { rig: 'squirrel' }, fox: { rig: 'fox' } },
    actors: { tortoise: { at: 'x:1200,y:1060' }, pip: { on: 'tortoise' }, hare: { at: 'x:1500,y:1060', on: 'tortoise' }, fox: { on: 'nobody' } },
    shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
      { do: 'walk', who: 'pip', to: 'x:1300' },
      { do: 'walk', who: 'tortoise', to: 'on:hare' },
      { do: 'hop', who: 'tortoise', to: 'on:tortoise' },
      { do: 'hop', who: 'pip', to: 'x:1300' },
      { do: 'walk', who: 'pip', to: 'x:1400' },
      { do: 'hop', who: 'pip', to: 'on:hare' },
    ] }],
  });
  const ps = await problemsOf(film), at = path => ps.find(p => p.path === path)?.message ?? '';
  assert.match(at('scenes[0].actors.hare.at'), /either "at".*or "on"/);
  assert.match(at('scenes[0].actors.fox.on'), /not in the cast/);
  assert.match(at('scenes[0].shots[0].beats[0].do'), /riding "tortoise".*hop off/);
  assert.match(at('scenes[0].shots[0].beats[1].to'), /only valid as the target of a hop or a place/);
  assert.match(at('scenes[0].shots[0].beats[2].to'), /cannot ride itself/);
  assert.equal(at('scenes[0].shots[0].beats[4].do'), '', 'after hopping off, pip may walk');
  assert.match(at('scenes[0].shots[0].beats[5].to'), /riders cannot carry riders/, 'hare rides the tortoise');
  assert.match(at('scenes[0].shots[0].beats[2].to') + at('scenes[0].shots[0].beats[1].to'), /./);
});

test('wading: the route crosses the water, the actor sinks 0.6 px per px and rises on the far side', async () => {
  const film = tiny({
    set: 'stream', cast: { pip: { rig: 'squirrel' } },
    actors: { tortoise: { at: 'x:960,y:1080', face: 'right' }, pip: { on: 'tortoise', face: 'right' } },
    shots: [{ id: 'a', camera: { size: 'full', on: ['tortoise'], move: 'track' }, beats: [{ do: 'walk', who: 'tortoise', to: 'x:1700,y:1080', wade: true, speed: 4 }], hold: 0.5 }],
  });
  const f = await loadFilm(film), plan = compile(f), S = f.resolved.sets.st ?? f.resolved.sets.m;
  const A = scene(plan, 's1').actors.get('tortoise'), mv = A.moves[0];
  assert.equal(mv.legs.length, 1); assert.equal(mv.legs[0].type, 'route', 'straight through, no jumps over stones');
  const T = getRig('tortoise'), maxSink = 1.1 * T.height;
  let wet = 0, top = 0, dryAfter = false, prev = null;
  for (let t = mv.t0; t <= mv.t1 + 0.4; t += 1 / 48) {
    const st = stateAt(plan, 'tortoise', t), p = stateAt(plan, 'pip', t);
    near(st.y, 1080, 0.5, 'the wade goes straight across');
    if (S.inWater(st.x, st.y)) {
      wet++; top = Math.max(top, st.sink);
      assert.ok(st.sink <= maxSink * st.s + 1e-6, 'never deeper than depth × s');
      if (st.sink > 0.05) { assert.equal(st.waterY, st.y); assert.equal(st.wade, true); assert.equal(st.st.shadow, false); }
      if (st.sink > 0.5) { assert.equal(p.waterY, st.y, 'the rider shares the waterline'); }
      if (prev && prev.sink > 0 && st.sink < maxSink * st.s - 1) assert.ok(Math.abs(st.sink - prev.sink) <= 0.6 * Math.abs(st.x - prev.x) + 0.5, 'sinks 0.6 px per px');
    } else { if (wet) dryAfter = true; assert.ok(st.sink < 0.01, `dry ground: no sink (${st.sink})`); }
    prev = st;
  }
  assert.ok(wet > 10 && dryAfter, 'goes in and comes out');
  near(top, maxSink * stateAt(plan, 'tortoise', mv.t0).s, 2, 'fully under in the middle (default depth 1.1 × height)');
  // drawn below the waterline: the visible box stops at the waterline, the drawing is shifted down by the sink
  let tm = mv.t0; while (!(stateAt(plan, 'tortoise', tm).sink > 20)) tm += 1 / 24;
  const info = frameInfo(plan, tm), ft = info.actors.find(a => a.id === 'tortoise'), z = info.camera.zoom;
  assert.ok(ft.waterline != null && ft.visibleBox[3] <= ft.waterline + 1e-6 && ft.screenBox[3] > ft.waterline);
  near(ft.sink, stateAt(plan, 'tortoise', tm).sink, 1e-9);
  assert.ok(ft.screenBox[3] - ft.contact.screen[1] > ft.sink * z * 0.8, 'the drawing is shifted down');
  // a depth limit
  film.scenes[0].shots[0].beats[0].depth = 12;
  const p2 = compile(await loadFilm(film)), A2 = scene(p2, 's1').actors.get('tortoise');
  let deep = 0; for (let t = A2.moves[0].t0; t < A2.moves[0].t1; t += 0.1) deep = Math.max(deep, A2.posAt(t).sink || 0);
  near(deep, 12 * A2.posAt(A2.moves[0].t0).s, 1);
  // pixels: the frame draws (ripples, the faint body under the water) deterministically
  assert.equal(pixels(plan, tm), pixels(plan, tm));
});

test('look to up / sky / down tilts the head over rig.lookTime; "to" is the target and "at" a time pin', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' }, tortoise: { at: 'x:1500' } },
    shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
      { do: 'look', who: 'hare', to: 'up', at: 0 },
      { do: 'look', who: 'hare', to: 'down', at: 1 },
      { do: 'look', who: 'hare', to: 'tortoise', at: 2 },
      { do: 'look', who: 'tortoise', to: 'sky', at: 0 },
    ], dur: 3 }],
  });
  const plan = compile(await loadFilm(film)), tilt = (id, t) => stateAt(plan, id, t).st.tilt, LT = getRig('hare').lookTime ?? 0.3;
  near(tilt('hare', 0.5), 1, 1e-9); near(tilt('hare', LT / 2), 0.5, 1e-6, 'eased halfway');
  near(tilt('hare', 1 + LT + 0.01), -1, 1e-9); near(tilt('hare', 2.9), 0, 1e-9);
  assert.ok(tilt('hare', 1 + LT / 2) > -1 && tilt('hare', 1 + LT / 2) < 1, 'blends from up to down');
  const T = getRig('tortoise');
  assert.ok((T.lookTime ?? 0.3) >= 0.3);
  near(tilt('tortoise', (T.lookTime ?? 0.3) + 0.05), 1, 1e-9);
  if (T.lookTime > 0.5) assert.ok(tilt('tortoise', 0.3) < 0.6, 'a slow looker takes its time');
  assert.equal(stateAt(plan, 'hare', 0.5).st.look, 0, 'looking up turns the head to centre');
});

test('camera: push-in / pull-out to another size and subjects, zoomTo, a move window, pixel offsets', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200,y:1060', face: 'right' }, tortoise: { at: 'x:1700,y:1060', face: 'left' } },
    shots: [
      { id: 'p', camera: { size: 'wide', on: ['hare'], move: 'push-in', to: 'close' }, dur: 3 },
      { id: 'q', camera: { size: 'close', on: ['hare'] }, dur: 2 },
      { id: 'r', camera: { size: 'close', on: ['hare'], move: 'pull-out', to: 'wide', toOn: ['tortoise'] }, dur: 3 },
      { id: 's', camera: { size: 'wide', on: ['tortoise'] }, dur: 2 },
      { id: 'z', camera: { size: 'full', on: ['tortoise'], move: 'push-in', zoomTo: 1.5 }, dur: 3 },
      { id: 'w', camera: { size: 'full', on: ['hare'], move: 'push-in', moveAt: 1, moveDur: 1 }, dur: 4 },
    ],
  });
  const plan = compile(await loadFilm(film)), sh = id => plan.shots.find(s => s.id === id);
  const same = (c1, c2, msg) => { near(c1.zoom / c2.zoom, 1, 0.01, `${msg} zoom`); near(c1.cx, c2.cx, 2, `${msg} cx`); near(c1.cy, c2.cy, 2, `${msg} cy`); };
  const end = s => s.cameraAt(s.t1 - 1e-4), start = s => s.cameraAt(s.t0);
  same(end(sh('p')), start(sh('q')), 'push-in ends on the close framing');
  same(start(sh('r')), start(sh('q')), 'pull-out starts on the close framing');
  same(end(sh('r')), start(sh('s')), 'and ends on the wide framing of toOn');
  near(end(sh('z')).zoom / start(sh('z')).zoom, 1.5, 0.01, 'zoomTo multiplies the starting zoom');
  // the subject glides straight across the screen during a big zoom
  const r = sh('r'), hx = [];
  for (let u = 0.1; u < 0.95; u += 0.2) { const c = r.cameraAt(r.t0 + u * (r.t1 - r.t0)); hx.push((stateAt(plan, 'hare', r.t0).x - c.cx) * c.zoom + 160); }
  for (const x of hx) assert.ok(x > -40 && x < 360, 'the hare stays near the frame during the pull-out');
  const w = sh('w'), cw = t => w.cameraAt(w.t0 + t);
  same(cw(0.2), cw(0.9), 'holds before moveAt');
  same(cw(2.2), cw(3.9), 'holds after the move');
  assert.ok(cw(1.5).zoom > cw(0.9).zoom * 1.05 && cw(2.1).zoom > cw(1.5).zoom, 'moves inside the window');
  // offsets: frame fractions (small) or a world-pixel shift of the framing (large)
  const sub = { box: [1000, 600, 1120, 1000], head: [1090, 700], hh: 80, face: 1 }, W = 1920, H = 1080;
  const F0 = frameSubjects([sub], 'full', { W, H }), F1 = frameSubjects([sub], 'full', { W, H, offset: [200, -120] });
  near(F1.cx - F0.cx, 200, 1e-6); near(F1.cy - F0.cy, -120, 1e-6); near(F1.zoom, F0.zoom, 1e-9);
  const F2 = frameSubjects([sub], 'full', { W, H, offset: [0.1, 0] });
  near((F0.cx - F2.cx) * F0.zoom, 0.1 * W, 1e-6, 'fractions move the subject on screen');
});

test('a shot may override the time of day (blended across it) and the grade, blending to gradeTo', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' } },
    shots: [
      { id: 'a', camera: { size: 'wide' }, dur: 2 },
      { id: 'b', camera: { size: 'wide' }, time: { from: 'night', to: 'dawn' }, grade: 'memory', gradeTo: 'none', dur: 4 },
      { id: 'c', camera: { size: 'wide' }, dur: 2 },
    ],
    scene: { grade: 'dream' },
  });
  const plan = compile(await loadFilm(film)), [a, b, c] = plan.shots;
  assert.deepEqual(a.skyAt(a.t0 + 0.5), [['morning', 1]]); assert.deepEqual(c.skyAt(c.t0 + 0.5), [['morning', 1]]);
  assert.deepEqual(b.skyAt(b.t0 + 0.01), [['night', 1]]); assert.deepEqual(b.skyAt(b.t1 - 0.01), [['dawn', 1]]);
  const mid = b.skyAt((b.t0 + b.t1) / 2); assert.equal(mid.length, 2); near(mid[1][1], 0.5, 1e-6);
  assert.deepEqual(b.gradeAt(b.t0 + 0.01).story, STORY.memory); assert.equal(b.gradeAt(b.t1 - 0.01).story, null);
  const g = b.gradeAt((b.t0 + b.t1) / 2).story; near(g.sat, (STORY.memory.sat + 1) / 2, 1e-6); near(g.sepia, STORY.memory.sepia / 2, 1e-6);
  assert.deepEqual(a.gradeAt(a.t0).story, STORY.dream, 'other shots keep the scene grade');
  assert.notEqual(pixels(plan, b.t0 + 0.05), pixels(plan, b.t1 - 0.05));
});

const OVERLAY_SRC = `
export const overlays = Object.fromEntries(['sky', 'back', 'world', 'front', 'grade', 'screen'].map(layer => [layer + 'Mark', { layer, draw(ctx, api) {
  const m = ctx.getTransform();
  (globalThis.__ovl ||= []).push({ layer, scale: m.a, api: { ...api, hare: api.actor('hare'), back: api.toWorld(api.toScreen([1234, 987])), anchor: api.anchor('pond_edge') } });
  ctx.fillStyle = 'rgba(255,0,0,0.2)'; ctx.fillRect(0, 0, 4, 4);
} }]));
export const custom = { beam: { layer: 'grade', draw(ctx, u, api) { (globalThis.__cus ||= []).push({ u, api }); } } };
export const sounds = { 'tiny-bell': ({ dur = 1 } = {}) => new Float32Array(Math.round(48000 * dur)) };
`;
test('overlays: custom.mjs overlays on six layers with the full api; custom beats get the same api', async () => {
  await withCustom(OVERLAY_SRC, async custom => {
    const film = tiny({
      actors: { hare: { at: 'x:1200' } },
      scene: { overlays: ['skyMark', 'backMark', { name: 'worldMark', params: { k: 2 } }, 'frontMark', 'gradeMark', 'screenMark', { name: 'motes', params: { density: 2 } }] },
      shots: [
        { id: 'a', camera: { size: 'wide', on: ['hare'] }, dur: 2 },
        { id: 'b', camera: { size: 'full', on: ['hare'] }, beats: [{ wait: 0.5 }, { mark: 'm1' }, { do: 'custom', name: 'beam', dur: 2, gain: 3 }, { sfx: 'tiny-bell' }], hold: 0.5 },
      ],
    });
    const plan = compile(await loadFilm(film, { custom }));
    assert.equal(plan.overlays.length, 6); assert.ok(plan.fx.some(e => e.name === 'motes' && e.density === 2), 'built-in fields still work, with params');
    assert.equal(typeof plan.sounds['tiny-bell'], 'function', 'plan.sounds carries custom.mjs sounds');
    const b = plan.shots.find(s => s.id === 'b'), t = b.t0 + 1, c = createCanvas(plan.W, plan.H);
    globalThis.__ovl = []; globalThis.__cus = [];
    drawFrame(c.getContext('2d'), plan, t);
    assert.deepEqual(globalThis.__ovl.map(o => o.layer), ['sky', 'back', 'world', 'front', 'grade', 'screen'], 'layer order');
    const cam = b.cameraAt(t);
    for (const o of globalThis.__ovl) near(o.scale, ['back', 'world', 'front'].includes(o.layer) ? cam.zoom : 1, 1e-6, `${o.layer} transform`);
    const api = globalThis.__ovl.find(o => o.layer === 'world').api, sc = plan.scenes[0];
    near(api.t, t, 1e-9); near(api.st, t - sc.t0, 1e-9); near(api.su, (t - sc.t0) / (sc.t1 - sc.t0), 1e-9); near(api.lt, t - b.t0, 1e-9);
    assert.equal(api.scene.id, 's1'); assert.equal(api.shot.id, 'b'); assert.equal(api.W, 320); assert.equal(api.H, 180);
    assert.deepEqual(api.params, { k: 2 }); assert.ok(Number.isInteger(api.seed)); near(api.marks.m1, b.t0 + 0.5, 1e-9);
    assert.equal(api.plan, plan); near(api.cam.zoom, cam.zoom, 1e-9); assert.ok(api.set.anchorNames.includes('pond_edge'));
    near(api.back[0], 1234, 1e-6); near(api.back[1], 987, 1e-6); assert.ok(Number.isFinite(api.anchor.x));
    assert.equal(api.hare.id, 'hare'); assert.ok(api.hare.head.every(Number.isFinite) && api.hare.box.length === 4);
    const cu = globalThis.__cus[0];
    assert.ok(cu, 'the custom beat drew'); near(cu.u, (t - (b.t0 + 0.5)) / 2, 1e-6); near(cu.api.bt, t - (b.t0 + 0.5), 1e-6); near(cu.api.lt, t - b.t0, 1e-9);
    assert.equal(cu.api.params.gain, 3); assert.equal(typeof cu.api.toScreen, 'function'); near(cu.api.st, api.st, 1e-9);
    // unknown overlays and bad layers are problems
    film.scenes[0].overlays.push('nope');
    const ps = await problemsOf({ ...film });
    assert.ok(ps.some(p => p.path === 'scenes[0].overlays[7]' && /unknown overlay "nope"/.test(p.message)), 'no custom.mjs: every custom overlay is unknown');
    await assert.rejects(loadFilm(film, { custom }), e => e.problems.some(p => p.path === 'scenes[0].overlays[7]'));
  });
  await withCustom(`export const overlays = { bad: { layer: 'middle', draw() {} } };`, async custom => {
    const ps = await (async () => { try { await loadFilm(tiny({ actors: {}, shots: [{ id: 'a', dur: 1 }], scene: { overlays: ['bad'] } }), { custom }); return []; } catch (e) { return e.problems; } })();
    assert.ok(ps.some(p => p.path === 'custom.mjs overlays.bad.layer'));
  });
});

test('rim light: after the grade, on the light side of each actor, from a mark, easing in', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200,y:1060' }, tortoise: { at: 'x:1500,y:1060' } },
    scene: { time: 'night', rim: { dir: 'upper-left', color: '#fff1d6', strength: 0.9, start: 'glow', rise: 1 } },
    shots: [{ id: 'a', camera: { size: 'full', on: ['hare', 'tortoise'] }, beats: [{ wait: 1 }, { mark: 'glow' }, { wait: 3 }] }],
  });
  const plan = compile(await loadFilm(film)), rim = plan.scenes[0].rim;
  near(rim.t0, 1, 1e-9); assert.equal(rimStrength(rim, 0.9), 0); near(rimStrength(rim, 1.5), 0.45, 1e-6); near(rimStrength(rim, 3), 0.9, 1e-9);
  const lit = compile(await loadFilm(film)), dark = compile(await loadFilm({ ...film, scenes: [{ ...film.scenes[0], rim: undefined }] }));
  assert.equal(pixels(lit, 0.5), pixels(dark, 0.5), 'nothing before the start');
  const t = 3, img = p => { const c = createCanvas(p.W, p.H), x = c.getContext('2d'); drawFrame(x, p, t); return x.getImageData(0, 0, p.W, p.H).data; };
  const A = img(lit), B = img(dark), info = frameInfo(lit, t);
  let changed = 0, outside = 0, brighter = 0;
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4, d = A[i] + A[i + 1] + A[i + 2] - B[i] - B[i + 1] - B[i + 2];
    if (Math.abs(d) < 6) continue;
    changed++; if (d > 0) brighter++;
    if (!info.actors.some(a => x >= a.screenBox[0] - 8 && x <= a.screenBox[2] + 8 && y >= a.screenBox[1] - 8 && y <= a.screenBox[3] + 8)) outside++;
  }
  assert.ok(changed > 30, `the rim shows (${changed} px)`); assert.equal(outside, 0, 'only around the actors'); assert.ok(brighter / changed > 0.95, 'it brightens (screen blend)');
  // the lit edge faces the light: more of it in the upper-left half of each actor box
  let ul = 0, lr = 0;
  for (const a of info.actors) { const [x0, y0, x1, y1] = a.screenBox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; for (let y = Math.max(0, Math.floor(y0)); y < Math.min(180, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(320, x1); x++) { const i = (y * 320 + x) * 4; if (A[i] + A[i + 1] + A[i + 2] - B[i] - B[i + 1] - B[i + 2] < 6) continue; if (x - cx + y - cy < 0) ul++; else lr++; } }
  assert.ok(ul > 2 * lr, `the upper-left edges glow (${ul} vs ${lr})`);
  film.scenes[0].rim.start = 'nomark';
  assert.ok((await problemsOf(film)).some(p => p.path === 'scenes[0].rim.start'));
});

test('validation: sound names from the sfx module (+ custom sounds), stings and moods from music, the new fields', async () => {
  const sting = stingNames().at(-1);
  const film = tiny({
    actors: { hare: { at: 'x:1200' }, tortoise: { at: 'x:1500' } },
    extra: { score: { key: 'C', motif: 'G4:1 E4:0.5 G4' } },
    shots: [{ id: 'a', camera: { size: 'wide', move: 'pan', on: ['hare', 'tortoise'], to: 'huge', zoomTo: -1, moveAt: -1, offset: [1] }, time: 'noonish', gradeTo: 'sepia', beats: [
      { sfx: 'laugh' }, { sfx: 'gate-creak' }, { sfx: sfxNames()[0] },
      { music: 'sting', name: 'kazoo' }, { music: 'sting', name: sting },
      { music: { mood: 'wonder', motif: 2.5, motifVoice: 'kazoo', hold: 'yes', tempo: 1000 } },
      { say: 'hare', text: 'Hi.', tts: 5, trimEnd: -1 },
      { do: 'walk', who: 'hare', to: 'x:1300', wade: 'yes', depth: -2 },
      { do: 'look', who: 'hare', to: 'sideways!' },
      { do: 'look', who: 'hare', to: 'down', touch: 'tortoise', contact: ['hare', 'tortoise'] },
    ] }],
    scene: { rim: { dir: 'down', strength: 2 } },
  });
  const ps = await problemsOf(film), at = path => ps.filter(p => p.path === path).map(p => p.message).join(' | ');
  const B = 'scenes[0].shots[0]';
  assert.match(at(`${B}.beats[0].sfx`), /unknown sound "laugh"/, 'laughs are voice lines, not sounds');
  assert.equal(at(`${B}.beats[1].sfx`), '', 'aliases are fine'); assert.equal(at(`${B}.beats[2].sfx`), '');
  assert.match(at(`${B}.beats[3].music`), /unknown sting "kazoo"/); assert.equal(at(`${B}.beats[4].music`), '', `"${sting}" comes from music.mjs STING_NAMES`);
  for (const k of ['motif', 'motifVoice', 'hold', 'tempo']) assert.ok(at(`${B}.beats[5].music.${k}`), `music ${k}`);
  assert.ok(at(`${B}.beats[6].tts`)); assert.ok(at(`${B}.beats[6].trimEnd`));
  assert.ok(at(`${B}.beats[7].wade`)); assert.ok(at(`${B}.beats[7].depth`));
  assert.match(at(`${B}.beats[8].to`), /not a place/);
  assert.equal(at(`${B}.beats[9].to`), ''); assert.equal(at(`${B}.beats[9].touch`), ''); assert.equal(at(`${B}.beats[9].contact`), '');
  for (const k of ['to', 'zoomTo', 'moveAt', 'offset']) assert.ok(at(`${B}.camera.${k}`), `camera.${k}`);
  assert.ok(at(`${B}.time`)); assert.ok(at(`${B}.gradeTo`)); assert.ok(at('score.motif')); assert.ok(at('scenes[0].rim.dir')); assert.ok(at('scenes[0].rim.strength'));
  // touch / contact are not unknown fields
  const ok = tiny({ actors: { hare: { at: 'x:1200' }, tortoise: { at: 'x:1500' } }, shots: [{ id: 'a', beats: [{ do: 'walk', who: 'hare', to: 'near:tortoise', touch: 'tortoise' }, { say: 'hare', text: 'Hi.', contact: 'tortoise' }] }] });
  assert.deepEqual((await loadFilm(ok)).warnings, []);
});

test('plan: score, music cue extras (beats and shots), sounds', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' } }, extra: { score: { key: 'D', motif: 'G4:1 E4:0.5' } },
    shots: [
      { id: 'a', camera: { size: 'wide' }, dur: 2, music: { mood: 'tender', intensity: 0.3, motif: 2, motifVoice: 'flute', hold: true } },
      { id: 'b', camera: { size: 'wide' }, beats: [{ wait: 0.5 }, { music: { mood: 'triumph', intensity: 0.7, downbeat: true, tempo: 90 } }, { wait: 1 }] },
    ],
  });
  const plan = compile(await loadFilm(film)), cues = plan.music.filter(m => m.mood);
  assert.deepEqual(plan.score, { key: 'D', motif: 'G4:1 E4:0.5' }); assert.deepEqual(plan.sounds, {});
  assert.equal(cues[0].mood, 'tender'); assert.equal(cues[0].motif, 2); assert.equal(cues[0].motifVoice, 'flute'); assert.equal(cues[0].hold, true);
  const tr = cues.find(c => c.mood === 'triumph');
  near(tr.t0, plan.shots[1].t0 + 0.5, 1e-9); assert.equal(tr.downbeat, true); assert.equal(tr.tempo, 90);
});

test('fix: a dissolve draws the outgoing scene with its own actors', async () => {
  const { plan } = await smallPlan();
  const s2 = plan.scenes[1], t = s2.t0 + 0.2, seen = new Set(), orig = plan.actorsAt;
  plan.actorsAt = (tt, sc) => { const r = orig(tt, sc); for (const a of r) seen.add(`${sc}:${a.id}`); return r; };
  try { drawFrame(createCanvas(plan.W, plan.H).getContext('2d'), plan, t); } finally { plan.actorsAt = orig; }
  assert.ok(seen.has('s1:tortoise'), 'the outgoing picture has scene 1 actors'); assert.ok(seen.has('s2:hare'));
  assert.ok(!seen.has('s2:tortoise'));
  assert.ok(orig(t, 's1').some(a => a.id === 'tortoise') && !orig(t).some(a => a.id === 'tortoise'));
});

test('fix: close shots compose the resting head, not a jump apex', async () => {
  const mk = beats => tiny({ actors: { hare: { at: 'x:1200,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'close', on: ['hare'] }, beats, dur: 2.5 }] });
  const still = compile(await loadFilm(mk([]))), jump = compile(await loadFilm(mk([{ do: 'gesture', who: 'hare', name: 'jump', at: 0.5 }])));
  const c0 = still.shots[0].cameraAt(0.1), c1 = jump.shots[0].cameraAt(0.1);
  near(c1.cy, c0.cy, 0.5, 'the same composition'); near(c1.zoom, c0.zoom, 0.02 * c0.zoom);
});

test('fix: frameInfo boxes include the squash of a turn', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1200,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, beats: [{ wait: 0.5 }, { do: 'turn', who: 'hare', face: 'left' }], dur: 2 }] });
  const plan = compile(await loadFilm(film)), A = scene(plan, 's1').actors.get('hare'), e = A.faceEv.find(x => x.flip);
  const t = e.t - 0.03, st = stateAt(plan, 'hare', t), info = frameInfo(plan, t), a = info.actors[0];
  assert.ok(st.squash < 0.75); near(a.squash, st.squash, 1e-9);
  const free = frameInfo(plan, 1.9).actors[0], w = b => b[2] - b[0];
  near(w(a.screenBox) / w(free.screenBox), st.squash, 0.08, 'the box narrows with the drawing');
  const sx = a.contact.screen[0]; assert.ok(Math.abs(a.head[0] - sx) < Math.abs(free.head[0] - free.contact.screen[0]), 'the head moves in toward the contact');
});

test('the test film exercises round 2: tts, marks, look up, camera to / zoomTo / moveAt, shot time + grade, overlays, rim, sounds', async () => {
  const film = await loadFilm('films/_test'), plan = compile(film), beats = film.scenes.flatMap(s => s.shots.flatMap(h => h.beats || []));
  assert.ok(plan.lines.some(l => l.nonverbal && l.speak !== l.text)); assert.ok(plan.lines.some(l => l.trimEnd > 0));
  assert.ok(Object.keys(plan.marks).length >= 1); assert.ok(plan.overlays.length >= 1); assert.ok(plan.scenes.some(s => s.rim));
  assert.ok(Object.keys(plan.sounds).length >= 1 && plan.sfx.some(e => plan.sounds[e.name]));
  assert.ok(beats.some(b => b.do === 'look' && ['up', 'sky', 'down'].includes(b.to)));
  const cams = film.scenes.flatMap(s => s.shots.map(h => h.camera || {}));
  assert.ok(cams.some(c => c.zoomTo) && cams.some(c => c.to) && cams.some(c => c.moveAt !== undefined));
  assert.ok(film.scenes.some(s => s.shots.some(h => h.time && h.gradeTo)));
  assert.ok(plan.score?.motif);
});

// ═════════════ review fixes (round 2) ═════════════
test('fix: a rider leaves with a carrier that exits (and fades with it); validation follows it off and back on', async () => {
  const mk = rider => tiny({
    cast: { pip: { rig: 'squirrel' } },
    actors: { tortoise: { at: 'x:1400,y:1060', face: 'right' }, ...(rider ? { pip: { on: 'tortoise' } } : {}), hare: { at: 'x:900,y:1060' } },
    shots: [
      { id: 'a', camera: { size: 'wide', on: ['tortoise', 'hare'] }, beats: [{ do: 'exit', who: 'tortoise', to: 'right', speed: 4 }] },
      { id: 'b', camera: { size: 'full' }, beats: [{ wait: 2 }] },
      { id: 'c', camera: { size: 'wide' }, beats: [{ do: 'enter', who: 'tortoise', from: 'right', to: 'x:1300,y:1060' }, { do: 'fade', who: 'tortoise', to: 0, dur: 1 }] },
    ],
  });
  const plan = compile(await loadFilm(mk(true))), bare = compile(await loadFilm(mk(false)));
  const b = plan.shots.find(s => s.id === 'b'), t = (b.t0 + b.t1) / 2;
  assert.equal(stateAt(plan, 'tortoise', t).visible, false);
  const p = stateAt(plan, 'pip', t); assert.equal(p.visible, false, 'the rider went with it'); assert.equal(p.carrier, 'tortoise');
  assert.deepEqual(frameInfo(plan, t).actors.map(a => a.id), ['hare']);
  assert.deepEqual(b.cameraAt(t), bare.shots.find(s => s.id === 'b').cameraAt(t), 'the default framing ignores the offstage rider');
  // the carrier comes back with its rider, then fades out with it
  const c = plan.shots.find(s => s.id === 'c'), A = scene(plan, 's1').actors.get('tortoise'), fade = A.alphaEv[0];
  const back = stateAt(plan, 'pip', fade.t0 - 0.05); assert.equal(back.visible, true); assert.equal(back.mode, 'mount');
  const mid = (fade.t0 + fade.t1) / 2; near(stateAt(plan, 'pip', mid).alpha, stateAt(plan, 'tortoise', mid).alpha, 1e-9, 'fades with its carrier');
  assert.ok(stateAt(plan, 'pip', c.t1 - 0.01).alpha < 0.01);
  // validation: while its carrier is off, the rider is not in the scene; it is again once the carrier enters
  const film = mk(true);
  film.scenes[0].shots[1].beats.push({ do: 'hop', who: 'pip', to: 'x:1000,y:1060' });
  film.scenes[0].shots[2].beats.push({ do: 'gesture', who: 'pip', name: Object.keys(getRig('squirrel').gestures)[0] });
  const ps = await problemsOf(film);
  assert.ok(ps.some(q => q.path === 'scenes[0].shots[1].beats[1].who' && /not in this scene/.test(q.message)), 'cannot hop off a carrier that has left');
  assert.ok(!ps.some(q => q.path.startsWith('scenes[0].shots[2]')), ps.map(q => q.message).join('\n'));
});

test('fix: frameInfo applies the squash of a turn exactly once', async () => {
  const film = tiny({ actors: { hare: { at: 'x:1200,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, beats: [{ do: 'turn', who: 'hare', face: 'left', at: 1 }], dur: 3 }] });
  const plan = compile(await loadFilm(film));
  let t = 1, q = 1; for (let u = 0.9; u < 1.6; u += 1 / 192) { const k = stateAt(plan, 'hare', u).squash; if (k < q) { q = k; t = u; } }
  assert.ok(q < 0.65, `a deep squash (${q})`);
  const st = stateAt(plan, 'hare', t), a = frameInfo(plan, t).actors[0], cam = frameInfo(plan, t).camera, W = plan.W, H = plan.H;
  const sx = (st.x - cam.cx) * cam.zoom + W / 2, sy = (st.y - cam.cy) * cam.zoom + H / 2;
  const raw = probe(st.R, sx, sy, st.s * cam.zoom, st.face, { ...st.st, shadow: false }).bounds, w = b => b[2] - b[0];
  near(w(a.screenBox), w(raw) * q, 1e-6, 'box width = unsquashed width × squash (once)');
  near(a.head[0], sx + (probe(st.R, sx, sy, st.s * cam.zoom, st.face, { ...st.st, shadow: false }).head[0] - sx) * q, 1e-6);
});

test('fix: a scene without music continues the previous cue (no restated motif, no downbeat cut)', async () => {
  const film = tiny({
    actors: { hare: { at: 'x:1200' } },
    scene: { music: { mood: 'night', intensity: 0.3, motif: 3, motifVoice: 'flute', downbeat: true, hold: true } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, beats: [{ wait: 3 }] }],
    extra: { score: { key: 'C', motif: 'G4:1 E4:0.5 G4:0.5 A4:2 C5:3' } },
  });
  film.scenes.push({ id: 's2', set: 'm', time: 'morning', actors: { hare: { at: 'x:1300' } }, shots: [{ id: 'b', camera: { size: 'wide', on: ['hare'] }, beats: [{ wait: 3 }] }] });
  const plan = compile(await loadFilm(film)), cues = plan.music.filter(m => m.mood);
  assert.equal(cues.length, 1, JSON.stringify(cues));
  near(cues[0].t0, 0, 1e-9); near(cues[0].t1, plan.duration, 1e-9);
  assert.equal(cues[0].motif, 3); assert.equal(cues[0].downbeat, true);
  // a scene that gives the same music again is a new cue (stated again, on purpose)
  film.scenes[1].music = { ...film.scenes[0].music };
  assert.equal(compile(await loadFilm(film)).music.filter(m => m.mood).length, 2);
});

test('fix: scene actors placed relative to a rider (or to another relative place) resolve in dependency order', async () => {
  const film = tiny({
    cast: { pip: { rig: 'squirrel' }, nut: { rig: 'squirrel' } },
    actors: { nut: { at: 'right-of:hare' }, hare: { at: 'left-of:pip' }, pip: { on: 'tortoise' }, tortoise: { at: 'x:1200,y:1060', face: 'right' } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['tortoise', 'hare'] }, beats: [{ wait: 1 }, { do: 'walk', who: 'hare', to: 'right-of:pip' }] }],
  });
  assert.deepEqual(await problemsOf(film), []);
  const plan = compile(await loadFilm(film)), t = 0.5, T = stateAt(plan, 'tortoise', t), h = stateAt(plan, 'hare', t), n = stateAt(plan, 'nut', t);
  assert.equal(stateAt(plan, 'pip', t).mode, 'mount');
  assert.equal(h.mode, 'ground'); near(h.y, T.y, 2, 'on the carrier\'s ground line, not the rider\'s seat');
  const box = id => frameInfo(plan, t).actors.find(a => a.id === id).worldBox;
  assert.ok(box('hare')[2] <= box('tortoise')[0] + 4, 'left of the carrier, clear of its shell');
  assert.ok(n.x > h.x, 'right of the hare');
  const end = stateAt(plan, 'hare', plan.duration - 0.01);
  assert.ok(end.x > T.x && frameInfo(plan, plan.duration - 0.01).actors.find(a => a.id === 'hare').worldBox[0] >= box('tortoise')[2] - 4, 'walks round to the other side of the pair');
});

test('fix: the rim width is honoured in every shot size', async () => {
  const lit = async (size, width) => {
    const film = tiny({ W: 640, H: 360, actors: { hare: { at: 'x:1200,y:1060', face: 'right' } }, scene: { time: 'night', rim: width ? { dir: 'left', width, strength: 1 } : undefined },
      shots: [{ id: 'a', camera: { size, on: ['hare'] }, beats: [{ wait: 2 }] }] });
    const plan = compile(await loadFilm(film)), c = createCanvas(640, 360), x = c.getContext('2d'); drawFrame(x, plan, 1);
    return x.getImageData(0, 0, 640, 360).data;
  };
  for (const size of ['wide', 'close']) {
    const off = await lit(size, 0), count = d => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] - off[i] - off[i + 1] - off[i + 2] > 12) n++; return n; };
    const thin = count(await lit(size, 4)), wide = count(await lit(size, 9));
    assert.ok(thin > 0, `${size}: the rim shows`);
    assert.ok(wide > thin * 1.5, `${size}: width 9 lights more than width 4 (${wide} vs ${thin} px)`);
  }
});

test('fix: score motif tokens must be playable; music extras on a beat next to an object cue are validated', async () => {
  const motif = async m => (await problemsOf(tiny({ actors: { hare: { at: 'x:1200' } }, shots: [{ id: 'a', beats: [{ wait: 1 }] }], extra: { score: { key: 'C', motif: m } } }))).map(p => p.message).join(' | ');
  assert.match(await motif('G4:0 E4:1'), /token 1 "G4:0": beats must be more than 0/);
  assert.match(await motif('G4:1 Cb4:1'), /token 2 "Cb4:1"/);
  assert.equal(await motif('G4:1 E4:0.5 Bb3:2 C9:1'), '');
  const film = tiny({ actors: { hare: { at: 'x:1200' } }, shots: [{ id: 'a', beats: [{ music: { mood: 'night', intensity: 0.3 }, motif: 99.5, motifVoice: 'kazoo', tempo: 5000, hold: 'yes', downbeat: 1 }, { wait: 1 }] }] });
  const ps = await problemsOf(film), B = 'scenes[0].shots[0].beats[0]';
  for (const k of ['motif', 'motifVoice', 'tempo', 'hold', 'downbeat']) assert.ok(ps.some(p => p.path === `${B}.${k}`), `beat ${k}`);
  Object.assign(film.scenes[0].shots[0].beats[0], { motif: 2, motifVoice: 'flute', tempo: 80, hold: true, downbeat: true });
  assert.deepEqual(await problemsOf(film), []);
});

test('fix: a track ignores motion across the cut (a teleport in the next shot); a carrier is framed with its rider', async () => {
  const mk = (teleport, rider = false) => tiny({
    cast: { pip: { rig: 'squirrel' } },
    actors: { tortoise: { at: 'x:1000,y:1060', face: 'right' }, ...(rider ? { pip: { on: 'tortoise' } } : {}) },
    shots: [
      { id: 'a', camera: { size: 'full', on: ['tortoise'], move: 'track' }, beats: [{ do: 'walk', who: 'tortoise', to: 'x:1400,y:1060' }], dur: 3 },
      { id: 'b', camera: { size: 'full', on: ['tortoise'] }, beats: teleport ? [{ do: 'place', who: 'tortoise', to: 'x:1900,y:1060' }, { wait: 1 }] : [{ wait: 1 }] },
    ],
  });
  const plain = compile(await loadFilm(mk(false))), cut = compile(await loadFilm(mk(true)));
  for (const t of [0, 1.5, 2.95]) near(cut.shots[0].cameraAt(t).zoom, plain.shots[0].cameraAt(t).zoom, 1e-9, `t=${t} the same track`);
  // with a rider on its back, the full shot of the carrier keeps the rider in frame
  const ridden = compile(await loadFilm(mk(false, true)));
  for (const t of [0.2, 1.5, 2.8]) {
    const fi = frameInfo(ridden, t), p = fi.actors.find(a => a.id === 'pip').screenBox;
    assert.ok(p[1] >= 0 && p[0] >= 0 && p[2] <= ridden.W, `t=${t}: the rider is inside the frame (${p.map(Math.round)})`);
  }
  assert.ok(ridden.shots[0].cameraAt(1.5).zoom < plain.shots[0].cameraAt(1.5).zoom, 'the pair is framed a little wider than the carrier alone');
});
