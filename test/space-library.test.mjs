// The space library: the pieces a plugin user built for a Saturn chapter, promoted into cinecode so every film has
// them. A `planet` rig (11 bodies, Saturn's rings in true proportion; engine/paint/planets.mjs paints them), a
// `telescope` rig, a `space` kit with a time of its own and no sun, and nine built-in effects (engine/effects/) that a
// film gets by naming them in film.json, the planet ones following their planet at its depth. A project's (or film's)
// rig, kit or effect of a built-in's name replaces it, and check says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { getRig, listRigs, BUILTIN_RIGS } from '../engine/cast/index.mjs';
import { getKit, BUILTIN_KITS } from '../engine/set/kits/index.mjs';
import { BUILTIN_EFFECTS } from '../engine/effects/index.mjs';
import { BODIES, extentOf, radiusOf, R0 } from '../engine/paint/planets.mjs';
import { verifyRig, verifyKit, verifyEffects } from '../engine/render/verify.mjs';
import { mixGrade, sunOf, NEUTRAL } from '../engine/film/grade.mjs';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { LENS } from '../engine/set/set.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BIN = join(ROOT, 'bin', 'cinecode.mjs');
const SKILLS = join(ROOT, '.claude', 'skills');
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });
const EFFECTS = ['debris', 'eyepiece', 'lightbeam', 'lightpulse', 'moonlets', 'orbit', 'ringfield', 'sizerow', 'starstream', 'sunglow'];

// A small film in space: Saturn (and a Sun) as actors, with the given beats and overlays.
const spaceFilm = ({ beats = [], overlays = [], saturn = {}, size = 'wide', dur = 4, W = 480, H = 270 } = {}) => ({
  title: 'Space', format: { width: W, height: H, fps: 24, captions: 'none' }, voices: {},
  cast: { saturn: { rig: 'planet', scale: 2.5, params: { body: 'saturn' } }, sun: { rig: 'planet', scale: 3, params: { body: 'sun' } } },
  sets: { sp: { kit: 'space' } },
  scenes: [{ id: 's1', set: 'sp', time: 'space', ambience: 'none', music: 'none', overlays,
    actors: { saturn: { at: 'centre', face: 'right', ...saturn }, sun: { at: 'far_west', face: 'right', z: 4000 } },
    shots: [{ id: 'a', dur, camera: { size, on: ['saturn'] }, beats }] }],
});
const pixels = (plan, t) => { const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); drawFrame(x, plan, t); return x.getImageData(0, 0, plan.W, plan.H).data; };

test('the space pieces are built in: the planet and telescope rigs, the space kit, eleven effects', () => {
  for (const k of ['planet', 'telescope']) { assert.ok(listRigs().includes(k), k); assert.ok(BUILTIN_RIGS.includes(k), k); }
  assert.ok(BUILTIN_KITS.includes('space'));
  assert.deepEqual(Object.keys(BUILTIN_EFFECTS.custom).sort(), EFFECTS);
  assert.deepEqual(Object.keys(BUILTIN_EFFECTS.overlays).sort(), ['skydot', 'sunglow']);
  for (const [n, d] of [...Object.entries(BUILTIN_EFFECTS.custom), ...Object.entries(BUILTIN_EFFECTS.overlays)]) assert.equal(typeof d.draw, 'function', n);
});

test('the planet and telescope rigs pass verify-rig; the space kit passes verify-kit', () => {
  for (const k of ['planet', 'telescope']) assert.deepEqual(verifyRig(getRig(k)).filter(c => !c.ok), [], k);
  assert.deepEqual(verifyKit(getKit('space'), 'space').filter(c => !c.ok), []);
});

test('the planet rig: thirteen bodies, Saturn\'s rings in true proportion, true radii for relative sizes', () => {
  assert.deepEqual(Object.keys(BODIES).sort(), ['charon', 'earth', 'jupiter', 'mars', 'mercury', 'moon', 'neptune', 'pluto', 'saturn', 'sun', 'titan', 'uranus', 'venus']);
  const S = BODIES.saturn, ring = n => S.rings[n];
  assert.equal(S.ob, 0.902, 'polar / equatorial radius');
  assert.deepEqual([ring(0).r0, ring(0).r1, ring(1).r1, ring(2).r1, ring(3).r1], [1.24, 1.53, 1.95, 2.03, 2.27], 'C, B rings, Cassini Division, A ring');
  assert.deepEqual(ring(3).gap, [2.205, 2.218], 'the Encke Gap');
  // the drawing's half-width at no roll is the A ring's outer edge
  assert.ok(Math.abs(extentOf({ body: 'saturn', roll: 0 }).w - 2.27) < 1e-9);
  assert.ok(Math.abs(radiusOf('earth') / radiusOf('saturn') - 0.1058) < 5e-4);
  assert.ok(Math.abs(getRig('planet').width - 2 * extentOf('saturn').w * R0) <= 0.05);
});

test('the space kit has one time of its own, "space": no grade but the vignette, no sun, no ground shadows', async () => {
  const S = getKit('space')({});
  assert.deepEqual(S.skyNames, ['space']);
  assert.equal(S.defaultSky, 'space');
  assert.equal(S.def.groundShadows, false);
  assert.deepEqual(mixGrade([['space', 1]]), { ...NEUTRAL, con: 1 });
  assert.equal(sunOf([['space', 1]]).a, 0);
  // an Earth time is not one of its times
  const f = spaceFilm(); f.scenes[0].time = 'morning';
  await assert.rejects(loadFilm(f), e => e instanceof ValidationError && e.problems.some(p => /unknown time "morning" \(one of space\)/.test(p.message)));
});

test('a film gets the built-in effects its film.json names, and only those', async () => {
  const film = await loadFilm(spaceFilm({ overlays: [{ name: 'sunglow', params: { x: 0.1, y: 0.3 } }], beats: [{ do: 'custom', name: 'starstream', dur: 2 }] }));
  assert.deepEqual(Object.keys(film.custom.overlays), ['sunglow']);
  assert.deepEqual(Object.keys(film.custom.custom), ['starstream']);
  assert.equal(film.custom.custom.starstream, BUILTIN_EFFECTS.custom.starstream);
  assert.deepEqual(film.custom.files, []);
  // a name that is neither built in nor the film's is still unknown to check
  const other = await loadFilm(spaceFilm({ beats: [{ do: 'custom', name: 'starstreams', dur: 2 }] }));
  assert.ok(other.warnings.some(w => /has no "starstreams"/.test(w.message)));
  assert.deepEqual(Object.keys(other.custom.custom), []);
});

test('every built-in effect passes the effects gate: deterministic in any drawing order, and it draws', async () => {
  const film = await loadFilm(spaceFilm({
    dur: 8, overlays: [{ name: 'skydot', params: { at: 'east', size: 4 } }],
    beats: [
      { do: 'custom', name: 'eyepiece', at: 0, dur: 1 },
      { do: 'custom', name: 'starstream', at: 1, dur: 2 },
      { do: 'custom', name: 'sunglow', who: 'sun', at: 0, dur: 8 },
      { do: 'custom', name: 'lightpulse', from: 'sun', to: 'saturn', at: 3, dur: 2 },
      { do: 'custom', name: 'orbit', who: 'saturn', at: 0, dur: 8 },
      { do: 'custom', name: 'sizerow', who: 'saturn', at: 2, dur: 4 },
      { do: 'custom', name: 'moonlets', who: 'saturn', big: 'titan', at: 3, dur: 5 },
      { do: 'custom', name: 'debris', at: 1, dur: 7 },
    ],
  }));
  const plan = compile(film), checks = await verifyEffects(film, plan);
  assert.equal(checks.length, 9);
  for (const c of checks) {
    // (engine/render/verify.mjs keeps its own list of layers, without 'depth': until it has it, that is the only
    // complaint about the three depth effects, and the same checks are made by hand below)
    assert.ok(c.ok || /^layer "depth" is not one of/.test(c.detail), `${c.name}: ${c.detail}`);
  }
  // by hand, for every effect: the same frame drawn in any order, and the effect changes it
  for (const [kind, name] of [...Object.keys(film.custom.custom).map(n => ['custom', n]), ['overlays', 'skydot']]) {
    const uses = kind === 'custom' ? plan.custom.filter(c => c.name === name) : plan.overlays.filter(o => o.name === name);
    const t0 = uses[0].t0 ?? 0, t1 = Math.min(uses[0].t1 ?? 8, 8), ts = [0.3, 0.6, 0.9].map(k => t0 + (t1 - t0) * k);
    const fwd = ts.map(t => pixels(plan, t)), back = [...ts].reverse().map(t => pixels(plan, t)).reverse();
    ts.forEach((t, i) => assert.ok(fwd[i].every((v, j) => v === back[i][j]), `${name} at ${t.toFixed(2)} s: the frame changes with the drawing order`));
    const def = film.custom[kind][name], draw = def.draw;
    let changed = 0;
    try { def.draw = () => {}; ts.forEach((t, i) => { const off = pixels(plan, t); for (let j = 0; j < off.length; j += 4) if (Math.abs(off[j] - fwd[i][j]) + Math.abs(off[j + 1] - fwd[i][j + 1]) + Math.abs(off[j + 2] - fwd[i][j + 2]) > 12) changed++; }); }
    finally { def.draw = draw; }
    assert.ok(changed > 0, `${name} draws nothing`);
  }
});

// An effect api for one planet actor, recording what the effect hands to the depth sort.
function fakeApi({ body = 'saturn', z = 0, u = 1, params = {}, cam = { cx: 1600, cy: 900, zoom: 1 } } = {}) {
  const items = [], a = { id: 'p', x: 1600, y: 1000, z, s: 2.5, face: 1, key: 1000, head: [1600, 800], st: { params: { body } } };
  const p = c => (LENS - (c.z || 0)) / (LENS + z - (c.z || 0));
  const shot = { t0: 0, t1: 4, cameraAt: () => cam };
  return {
    items, a,
    api: { t: 2, bt: 4 * u, dur: 4, u, W: 1920, H: 1080, cam, set: { lens: LENS }, shot, seed: 5, params: { who: 'p', ...params },
      actor: id => (id === 'p' ? a : null),
      project: ([x, y, d = 0]) => { const k = cam.zoom * (LENS - (cam.z || 0)) / (LENS + d - (cam.z || 0)); return [(x - cam.cx) * k + 960, (y - cam.cy) * k + 540, k, 1]; },
      item: (at, draw) => items.push({ at, draw }), p },
  };
}
// a ctx that records where drawBody puts each world (it translates to the centre first) and ignores the rest
function recorder() {
  const at = [], grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (o, k) => (k === 'translate' ? (x, y) => at.push([x, y]) : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1 }) : k === 'lightShift' ? undefined : k.startsWith?.('create') ? () => grad : k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  return { ctx, at };
}

test('sizerow: as many Earths as fit across the planet (9 across Saturn, 11 across Jupiter), in front of it at its depth', () => {
  const run = (body, params = {}, z = 0) => { const F = fakeApi({ body, z, params }); BUILTIN_EFFECTS.custom.sizerow.draw(null, 1, F.api); assert.equal(F.items.length, 1); const R = recorder(); F.items[0].draw(R.ctx, {}); return { F, at: R.at }; };
  assert.equal(run('saturn').at.length, 9);
  assert.equal(run('jupiter').at.length, 11);
  assert.equal(run('saturn', { n: 4 }).at.length, 4);
  const { F, at } = run('saturn', {}, 1200);
  assert.deepEqual(F.items[0].at, [1600, 1000, 1200], 'one piece at the planet\'s depth and key: drawn right after it');
  const mid = at.reduce((s, [x, y]) => [s[0] + x / at.length, s[1] + y / at.length], [0, 0]);
  assert.ok(Math.abs(mid[0] - 1600) < 1e-6 && Math.abs(mid[1] - 800) < 1e-6, 'the row is centred on the globe');
});

test('moonlets: each moon sorts behind or in front of its planet by its side of the orbit; the big moon is in front', () => {
  const F = fakeApi({ z: 700, params: { big: 'titan' } });
  BUILTIN_EFFECTS.custom.moonlets.draw(null, 1, F.api);
  const moons = F.items.slice(0, -1), big = F.items[F.items.length - 1];
  assert.equal(moons.length, 90);
  const behind = moons.filter(m => m.at[2] > 700), front = moons.filter(m => m.at[2] < 700);
  assert.ok(behind.length > 20 && front.length > 20, `${behind.length} behind, ${front.length} in front`);
  assert.ok(moons.every(m => Math.abs(m.at[2] - 700) < 1.5), 'a nudge for the sort, drawn at the planet\'s scale');
  assert.ok(moons.every(m => m.at[1] === 1000), 'sorted at the planet\'s key');
  assert.ok(big.at[2] < 700);
});

test('debris: chunks at depths from just short of the near fade to beyond the stage; a dolly past some keeps the rest whole', () => {
  const F = fakeApi({ u: 0.5 });
  BUILTIN_EFFECTS.custom.debris.draw(null, 0.5, F.api);
  assert.equal(F.items.length, 70);
  const zs = F.items.map(i => i.at[2]);
  assert.ok(Math.min(...zs) >= -0.72 * LENS && Math.max(...zs) <= 0.35 * LENS);
  assert.ok(zs.some(z => z < -0.3 * LENS) && zs.some(z => z > 0), 'near and far');
  // every chunk of a static shot is spread over what the camera sees at its depth
  for (const { at } of F.items) { const [sx, sy] = F.api.project(at); assert.ok(sx > -400 && sx < 2320 && sy > -400 && sy < 1480, `${at}`); }
  // a dolly whose end is past the nearest chunks: they are laid out from the start, the rest stay finite
  const G = fakeApi({ u: 0.5 });
  G.api.shot = { t0: 0, t1: 4, cameraAt: t => (t < 1 ? { cx: 1600, cy: 900, zoom: 1 } : { cx: 1600, cy: 900, zoom: 2, z: 1500 }) };
  BUILTIN_EFFECTS.custom.debris.draw(null, 0.5, G.api);
  assert.equal(G.items.length, 70);
  assert.ok(G.items.every(i => i.at.every(Number.isFinite)));
});

test('a planet effect follows its planet off the stage: the Earths of sizerow sit on Saturn at z 1200 in the frame', async () => {
  const plan = compile(await loadFilm(spaceFilm({ saturn: { z: 1200 }, size: 'full', dur: 6, beats: [{ do: 'custom', name: 'sizerow', who: 'saturn', at: 0, dur: 6 }] })));
  const d = pixels(plan, 3.5), head = frameInfo(plan, 3.5).actors.find(a => a.id === 'saturn').head;
  let n = 0, sx = 0, sy = 0;
  // Earth's oceans: blue well above red and green
  for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 140 && d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 25) { n++; sx += (i / 4) % plan.W; sy += Math.floor(i / 4 / plan.W); }
  assert.ok(n > 200, `${n} ocean pixels`);
  assert.ok(Math.hypot(sx / n - head[0], sy / n - head[1]) < 4, `the row's middle (${(sx / n).toFixed(1)}, ${(sy / n).toFixed(1)}) is the globe's (${head.map(v => v.toFixed(1))})`);
});

test('a project\'s rig, kit or effect named like a built-in replaces it, and check says so', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-shadow-'));
  try {
    for (const k of ['rigs', 'kits', 'effects']) mkdirSync(join(dir, 'cinecode', k), { recursive: true });
    mkdirSync(join(dir, 'films', 'own'), { recursive: true });
    // a rig of kind "planet", a kit named "space", an effect file with a custom beat "starstream", and custom.mjs's
    // overlay "sunglow"
    writeFileSync(join(dir, 'cinecode', 'rigs', 'planet.mjs'), `import chick from ${JSON.stringify(join(SKILLS, 'build-rig', 'starter.mjs'))};\nimport { makeRig } from 'cinecode/rig';\nexport default makeRig({ ...chick, kind: 'planet', label: 'Own planet' });\n`);
    cpSync(join(SKILLS, 'build-kit', 'starter.mjs'), join(dir, 'cinecode', 'kits', 'space.mjs'));
    writeFileSync(join(dir, 'cinecode', 'effects', 'mine.mjs'), 'export const custom = { starstream: { layer: "screen", draw(ctx) { ctx.fillRect(0, 0, 9, 9); } } };\n');
    writeFileSync(join(dir, 'films', 'own', 'custom.mjs'), 'export const overlays = { sunglow: { layer: "screen", draw(ctx) { ctx.fillRect(0, 0, 9, 9); } } };\n');
    const f = spaceFilm({ overlays: ['sunglow'], beats: [{ do: 'custom', name: 'starstream', dur: 1 }] });
    f.cast = { p: { rig: 'planet' } }; f.scenes[0].time = undefined; f.scenes[0].actors = { p: { at: 'glade_centre' } }; f.scenes[0].shots[0].camera.on = ['p'];
    writeFileSync(join(dir, 'films', 'own', 'film.json'), JSON.stringify(f));
    const c = cli(dir, 'check', 'films/own');
    assert.equal(c.status, 0, c.stderr);
    for (const s of ['cinecode/rigs/planet.mjs (replaces the built-in rig "planet")', 'cinecode/kits/space.mjs (replaces the built-in kit "space")',
      'cinecode/effects/mine.mjs (replaces the built-in custom beat "starstream")', 'custom.mjs (replaces the built-in overlay "sunglow")']) assert.ok(c.stdout.includes(s), `check says: ${s}\n${c.stdout}`);
    // the project's pieces are the ones the film uses, and its warnings carry the notes
    const probe = `const { loadFilm } = await import(${JSON.stringify(join(ROOT, 'engine', 'film', 'load.mjs'))}); const { BUILTIN_EFFECTS } = await import(${JSON.stringify(join(ROOT, 'engine', 'effects', 'index.mjs'))});
      const f = await loadFilm(${JSON.stringify(join(dir, 'films', 'own'))});
      console.log(JSON.stringify({ rig: f.resolved.rigs.p.label, kit: f.resolved.sets.sp.id, beat: f.custom.custom.starstream === BUILTIN_EFFECTS.custom.starstream, overlay: f.custom.overlays.sunglow === BUILTIN_EFFECTS.overlays.sunglow, warnings: f.warnings.map(w => w.message) }));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.deepEqual([o.rig, o.kit, o.beat, o.overlay], ['Own planet', 'glade', false, false]);
    assert.ok(o.warnings.includes('cinecode/rigs/planet.mjs: rig "planet" replaces the built-in one of that name'), o.warnings.join('\n'));
    assert.ok(o.warnings.includes('custom.mjs: overlay "sunglow" replaces the built-in one of that name'), o.warnings.join('\n'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
