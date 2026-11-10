// Effect scope: how long and where custom beats and overlays draw, and what waits for them.
// - A custom beat lives for its `dur`, on into the next shots of its scene (unchanged); "scope": "shot" ends it at its
//   shot's cut (its drawing and its sounds), "scope": "scene" keeps it on; one that runs on into a later shot without
//   saying so is a plan warning.
// - A scene overlay may give "shots": it draws only in those shots of the scene (custom overlays and built-in fields).
// - "hold": false on a custom beat or an sfx: it plays for its whole dur, but takes no time in the beat timeline (the
//   next beat, its group and the shot's length don't wait for it).
//   node --test test/scope.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';
import { compile, estimateLine, DEFAULT_HOLD } from '../engine/film/compile.mjs';
import { drawFrame } from '../engine/film/frame.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

// a 320×180 one-scene film on the meadow
function tiny({ actors = { hare: { at: 'x:1200' } }, shots, scene = {} }) {
  return {
    title: 'Scope', format: { width: 320, height: 180, fps: 24, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' }, hare: { voice: 'Puck' } },
    cast: { hare: { rig: 'hare', voice: 'hare' } },
    sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors, shots, ...scene }],
  };
}
const withCustom = async (src, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-scope-'));
  try { writeFileSync(join(dir, 'custom.mjs'), src); return await fn(join(dir, 'custom.mjs')); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const problemsOf = async (film, custom) => { try { await loadFilm(film, { custom }); return []; } catch (e) { if (!(e instanceof ValidationError)) throw e; return e.problems; } };
const cam = on => ({ size: 'wide', on: [on] });

// a custom beat and an overlay that log every draw (name, shot, u); the beat pops a chime every 0.5 s
const SRC = `
const log = (name, api, u) => (globalThis.__draws ||= []).push({ name, shot: api.shot.id, u });
export const custom = { lens: { layer: 'screen', sfx: [0, 0.5, 1, 1.5, 2, 2.5].map(at => ({ at, name: 'chime' })), draw(ctx, u, api) { log('lens', api, u); } } };
export const overlays = { glow: { layer: 'grade', draw(ctx, api) { log(api.name, api); } } };
`;
const drawsAt = (plan, t) => { globalThis.__draws = []; drawFrame(createCanvas(plan.W, plan.H).getContext('2d'), plan, t); return globalThis.__draws; };
const shot = (plan, id) => plan.shots.find(s => s.id === id);

// shot a (1 s) holds a 3 s custom beat; b and c follow in the scene
const threeShots = lens => tiny({ shots: [
  { id: 'a', dur: 1, camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', at: 0, dur: 3, ...lens }] },
  { id: 'b', camera: cam('hare'), beats: [{ wait: 1 }] },
  { id: 'c', camera: cam('hare'), beats: [{ wait: 1 }] },
] });

test('a custom beat lives for its dur into the next shots; "scope": "shot" ends it at the cut, "scene" keeps it', async () => {
  await withCustom(SRC, async custom => {
    const P = {};
    for (const s of ['none', 'shot', 'scene']) P[s] = compile(await loadFilm(threeShots(s === 'none' ? {} : { scope: s }), { custom }));
    const a = shot(P.none, 'a'), b = shot(P.none, 'b');
    near(a.t1 - a.t0, 1, 1e-9, 'shot a keeps its dur');
    const inA = a.t0 + 0.5, inB = b.t0 + 0.25;
    for (const s of ['none', 'shot', 'scene']) {
      const d = drawsAt(P[s], inA).filter(x => x.name === 'lens');
      assert.equal(d.length, 1, `${s}: drawn in its own shot`); near(d[0].u, 0.5 / 3, 1e-6, `${s}: u runs over the whole dur`);
    }
    assert.equal(drawsAt(P.none, inB).filter(x => x.name === 'lens').length, 1, 'by default it draws on into shot b (unchanged)');
    assert.equal(drawsAt(P.scene, inB).filter(x => x.name === 'lens').length, 1, '"scene": it draws on into shot b');
    assert.equal(drawsAt(P.shot, inB).filter(x => x.name === 'lens').length, 0, '"shot": it ends at the cut');
    assert.equal(drawsAt(P.shot, b.t0).filter(x => x.name === 'lens').length, 0, '"shot": not even the first frame of b');
    // its sounds: every chime by default; with "shot" only those before the cut
    const chimes = p => p.sfx.filter(e => e.name === 'chime').map(e => Math.round((e.t - a.t0) * 1000) / 1000);
    assert.deepEqual(chimes(P.none), [0, 0.5, 1, 1.5, 2, 2.5]);
    assert.deepEqual(chimes(P.scene), [0, 0.5, 1, 1.5, 2, 2.5]);
    assert.deepEqual(chimes(P.shot), [0, 0.5]);
    // the plan says when a beat runs on into a later shot without a scope
    const w = P.none.warnings.filter(m => /custom beat "lens"/.test(m));
    assert.equal(w.length, 1, P.none.warnings.join('\n'));
    assert.match(w[0], /shot a/); assert.match(w[0], /into b, c/); assert.match(w[0], /"scope": "shot"/);
    for (const s of ['shot', 'scene']) assert.ok(!P[s].warnings.some(m => /custom beat/.test(m)), `${s}: said so, no warning`);
  });
});

test('no scope warning for a custom beat that ends in its shot, or runs past the scene\'s last shot', async () => {
  await withCustom(SRC, async custom => {
    const film = tiny({ shots: [
      { id: 'a', camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', dur: 3 }] },              // the shot grows to hold it
      { id: 'b', dur: 2, camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', at: 1, dur: 1 }] }, // ends at the cut
      { id: 'c', dur: 1, camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', at: 0, dur: 4 }] }, // last shot of the scene
    ] });
    const plan = compile(await loadFilm(film, { custom }));
    assert.deepEqual(plan.warnings.filter(m => /custom beat/.test(m)), []);
    near(shot(plan, 'a').t1 - shot(plan, 'a').t0, 3 + DEFAULT_HOLD, 1 / 24, 'a custom beat still holds its shot');
  });
});

test('the spill warning goes by frames: a beat whose end lands a hair past the cut is drawn on the next shot\'s first frame', async () => {
  await withCustom(SRC, async custom => {
    // a fills its 1 s, but 14/24 + 1 comes out 2e-16 s past b's start: b's first frame draws the beat at u ≈ 1
    const film = scope => tiny({ shots: [
      { id: 'p', dur: 14 / 24, camera: cam('hare'), beats: [{ wait: 0.1 }] },
      { id: 'a', dur: 1, camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', at: 0, dur: 1, ...scope }] },
      { id: 'b', dur: 1, camera: cam('hare'), beats: [{ wait: 0.1 }] },
    ] });
    const plan = compile(await loadFilm(film({}), { custom })), b = shot(plan, 'b');
    assert.ok(plan.custom[0].t1 > b.t0, 'the beat ends after b starts');
    assert.equal(drawsAt(plan, b.t0).filter(x => x.name === 'lens').length, 1, 'drawn on b\'s first frame');
    const w = plan.warnings.filter(m => /custom beat "lens"/.test(m));
    assert.equal(w.length, 1, plan.warnings.join('\n')); assert.match(w[0], /1 frame\b/); assert.match(w[0], /into b/);
    const shotScope = compile(await loadFilm(film({ scope: 'shot' }), { custom }));
    assert.equal(drawsAt(shotScope, b.t0).filter(x => x.name === 'lens').length, 0, '"scope": "shot": not on b\'s first frame');
  });
});

test('"scope": "shot" ends a beat at the cut into a dissolve too; one that ends partway through a dissolve is a warning', async () => {
  await withCustom(SRC, async custom => {
    // s1's last shot b (2 s) dissolves into s2's first shot c (3 s): the dissolve lasts 0.8 s, and draws b over c
    const film = lens => {
      const f = tiny({ shots: [
        { id: 'a', dur: 2, camera: cam('hare'), beats: [{ wait: 0.1 }] },
        { id: 'b', dur: 2, camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', at: 0, ...lens }] },
      ] });
      f.scenes.push({ id: 's2', set: 'm', time: 'night', transition: 'dissolve', actors: { hare: { at: 'x:1500' } }, shots: [{ id: 'c', dur: 3, camera: cam('hare'), beats: [{ wait: 0.1 }] }] });
      return f;
    };
    const run = async lens => compile(await loadFilm(film(lens), { custom }));
    const lensAt = (p, t) => drawsAt(p, t).filter(x => x.name === 'lens').length;
    const warned = p => p.warnings.filter(m => /custom beat "lens"/.test(m));
    // "shot": gone from the outgoing picture from the cut on, like its sounds
    const S = await run({ dur: 2.3, scope: 'shot' }), b = shot(S, 'b'), c = shot(S, 'c');
    near(c.t0, b.t1, 1e-9);
    assert.equal(lensAt(S, b.t1 - 1 / 24), 1, 'drawn on b\'s last frame');
    for (const k of [0, 6]) assert.equal(lensAt(S, b.t1 + k / 24), 0, `"shot": not drawn ${k} frames into the dissolve`);
    assert.deepEqual(S.sfx.filter(e => e.name === 'chime').map(e => Math.round((e.t - b.t0) * 1000) / 1000), [0, 0.5, 1, 1.5]);
    assert.deepEqual(warned(S), []);
    // no scope: drawn on into the dissolve (in b's fading picture) and gone before it ends: a warning naming c
    const D = await run({ dur: 2.3 });
    assert.equal(lensAt(D, b.t1 + 6 / 24), 1, 'drawn 6 frames into the dissolve'); assert.equal(lensAt(D, b.t1 + 8 / 24), 0);
    assert.equal(warned(D).length, 1, D.warnings.join('\n')); assert.match(warned(D)[0], /shot b/); assert.match(warned(D)[0], /dissolve to c, where it vanishes partway \(a dur of 2\.80 s or more/);
    // said so, lasting the whole dissolve (the dur it names: it fades out with the picture), or ending at the cut: none
    for (const lens of [{ dur: 2.3, scope: 'scene' }, { dur: 2.8 }, { dur: 2 }]) assert.deepEqual(warned(await run(lens)), [], JSON.stringify(lens));
  });
});

test('"hold": false: a custom beat or an sfx plays its dur but the next beat, its group and the shot don\'t wait', async () => {
  await withCustom(SRC, async custom => {
    const line = 'Look at the rings go round and round.', L = estimateLine(line);
    const beats = hold => [
      { say: 'hare', text: line },
      { do: 'custom', name: 'lens', dur: L + 4, with: 'prev', ...hold },
      { say: 'narrator', text: 'They do.' },
    ];
    const run = async hold => compile(await loadFilm(tiny({ shots: [{ id: 'a', camera: cam('hare'), beats: beats(hold) }] }), { custom }));
    const held = await run({}), free = await run({ hold: false });
    const second = p => p.lines.find(l => l.who === 'narrator');
    near(second(held).t0, L + 4, 1e-6, 'by default the group lasts until the beat ends');
    near(second(free).t0, L, 1e-6, 'hold false: the next line follows the line');
    const c = free.custom[0], a = shot(free, 'a');
    near(c.t1 - c.t0, L + 4, 1e-9, 'it still lasts its dur');
    near(a.t1, free.lines.at(-1).t1 + DEFAULT_HOLD, 1 / 24, 'the shot ends after the last line, not after the beat');
    assert.ok(free.warnings.some(m => /custom beat "lens"/.test(m)) === false, 'nothing follows in the scene: no warning');
    // an sfx with a dur: hold false takes no time either, and keeps its length
    const sfx = async hold => compile(await loadFilm(tiny({ shots: [{ id: 'a', camera: cam('hare'), beats: [{ sfx: 'chime', dur: 2, ...hold }, { wait: 0.5 }] }] })));
    const s0 = await sfx({}), s1 = await sfx({ hold: false });
    near(shot(s0, 'a').t1, 2.5 + DEFAULT_HOLD, 1 / 24); near(shot(s1, 'a').t1, 0.5 + DEFAULT_HOLD, 1 / 24);
    assert.equal(s1.sfx.find(e => e.name === 'chime').params.dur, 2);
    // "hold": true is the default
    const s2 = await sfx({ hold: true }); near(shot(s2, 'a').t1, shot(s0, 'a').t1, 1e-9);
  });
});

test('a scene overlay with "shots" draws only in those shots (custom overlays and built-in fields)', async () => {
  await withCustom(SRC, async custom => {
    const film = tiny({
      scene: { overlays: [{ name: 'glow', shots: ['a', 'c'] }, { name: 'glow', params: { all: true } }, { name: 'motes', shots: ['b', 'c'] }, { name: 'leaves', shots: ['a', 'c'] }] },
      shots: ['a', 'b', 'c'].map(id => ({ id, camera: cam('hare'), beats: [{ wait: 1 }] })),
    });
    const plan = compile(await loadFilm(film, { custom }));
    const glows = id => drawsAt(plan, shot(plan, id).t0 + 0.5).filter(x => x.name === 'glow').length;
    assert.deepEqual(['a', 'b', 'c'].map(glows), [2, 1, 2]);
    const [a, b, c] = ['a', 'b', 'c'].map(id => shot(plan, id));
    // a field covers its shots: one stretch per run of consecutive shots, seeded as one
    const spans = n => plan.fx.filter(e => e.name === n).map(e => [e.t0, e.t1]);
    assert.deepEqual(spans('motes'), [[b.t0, c.t1]]);
    assert.deepEqual(spans('leaves'), [[a.t0, a.t1], [c.t0, c.t1]]);
    assert.equal(new Set(plan.fx.filter(e => e.name === 'leaves').map(e => e.seed)).size, 1);
    // without "shots" nothing changes: one overlay and one field for the whole scene
    const whole = compile(await loadFilm(tiny({ scene: { overlays: ['glow', 'motes'] }, shots: film.scenes[0].shots }), { custom }));
    assert.deepEqual(whole.fx.filter(e => e.name === 'motes').map(e => [e.t0, e.t1]), [[whole.scenes[0].t0, whole.scenes[0].t1]]);
    assert.ok(whole.overlays.every(o => !o.shots));
  });
});

test('a rain kept to some shots is fully on from the cut: it fades in and out only at the scene\'s edges', async () => {
  const film = overlays => tiny({ scene: { overlays }, shots: ['a', 'b', 'c'].map(id => ({ id, dur: 3, camera: cam('hare'), beats: [{ wait: 1 }] })) });
  const whole = compile(await loadFilm(film(['rain']))), inB = compile(await loadFilm(film([{ name: 'rain', shots: ['b'] }])));
  const atFirst = compile(await loadFilm(film([{ name: 'rain', shots: ['a'] }]))), none = compile(await loadFilm(film([])));
  const px = (plan, t) => { const ctx = createCanvas(plan.W, plan.H).getContext('2d'); drawFrame(ctx, plan, t); return Buffer.from(ctx.getImageData(0, 0, plan.W, plan.H).data); };
  const [a, b] = ['a', 'b'].map(id => shot(inB, id));
  // in b (mid-scene) it is the scene's rain, from b's first frame to its last; a has none
  for (const t of [b.t0, b.t0 + 6 / 24, b.t1 - 1 / 24]) assert.ok(px(inB, t).equals(px(whole, t)), `rain in b at ${(t - b.t0).toFixed(2)} s`);
  assert.ok(px(inB, a.t1 - 1 / 24).equals(px(none, a.t1 - 1 / 24)), 'no rain in a');
  // a stretch at the scene's start still fades in there, as the scene's rain does
  for (const t of [a.t0 + 6 / 24, a.t1 - 1 / 24]) assert.ok(px(atFirst, t).equals(px(whole, t)), `rain in a at ${(t - a.t0).toFixed(2)} s`);
});

test('check: scope, hold and overlay shots are validated', async () => {
  await withCustom(SRC, async custom => {
    const film = tiny({
      scene: { overlays: [{ name: 'glow', shots: ['a', 'zz'] }, { name: 'glow', shots: [] }, { name: 'motes', shots: 'a' }] },
      shots: [
        { id: 'a', camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', scope: 'film' }, { do: 'custom', name: 'lens', hold: 'no' }, { sfx: 'chime', hold: 0 }] },
        { id: 'b', camera: cam('hare'), beats: [{ do: 'custom', name: 'lens', scope: 'shot', hold: false }, { sfx: 'chime', dur: 1, hold: false }] },
      ],
    });
    const ps = await problemsOf(film, custom), at = p => ps.find(x => x.path === p)?.message ?? '';
    assert.match(at('scenes[0].overlays[0].shots'), /"zz" is not a shot of scene s1 \(shots: a, b\)/);
    assert.match(at('scenes[0].overlays[1].shots'), /non-empty list of shot ids/);
    assert.match(at('scenes[0].overlays[2].shots'), /non-empty list of shot ids/);
    assert.match(at('scenes[0].shots[0].beats[0].scope'), /"shot" or "scene"/);
    assert.match(at('scenes[0].shots[0].beats[1].hold'), /true or false/);
    assert.match(at('scenes[0].shots[0].beats[2].hold'), /true or false/);
    assert.equal(ps.length, 6, ps.map(p => p.message).join('\n'));
    // the good ones load without warnings about these fields
    film.scenes[0].overlays = [{ name: 'glow', shots: ['b'] }];
    film.scenes[0].shots[0].beats = [{ wait: 1 }];
    const ok = await loadFilm(film, { custom });
    assert.deepEqual(ok.warnings.filter(w => /scope|hold|shots/.test(w.message)), []);
  });
});
