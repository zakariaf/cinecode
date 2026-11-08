// Film core: loading and validation, beat timing, state carried across shots, routes, feet that don't slide,
// camera framing math and clamping, drawFrame determinism, plan contents and frameInfo.
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
