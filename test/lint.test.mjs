// Lint: staging and editing checks. A film broken on purpose (each fault in its own shot) must trip each rule,
// faults the compiler never produces (feet on air, standing in a rock or a stream) are injected into the plan,
// and the test film must come out clean.
//   node --test test/lint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { frameInfo } from '../engine/film/frame.mjs';
import { lintPlan, writeLintReport, RULES, LIMITS } from '../engine/lint/lint.mjs';

// Every fault in its own shot: a1–a2 identical framings (cut-jump), a3 a place that swaps the talkers' sides at
// the cut (axis), a4 a line from an actor far outside a close-up (offscreen-speaker) and a vo line (fine), a5 a
// 0.8 s shot, a6 a place in the middle of a shot (teleport), a7 two actors walking into the same spot (collision),
// a8 the same overlap while a beat says they touch (a warning), b1 two narrator lines at once with a caption far
// too fast to read, b2 an extreme close-up (used for caption-face).
function brokenFilm() {
  return {
    title: 'Broken on purpose', format: { width: 640, height: 360, fps: 24, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' }, hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' }, fox: { voice: 'Algieba' } },
    cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' }, fox: { rig: 'fox', voice: 'fox' }, frog: { rig: 'frog' } },
    sets: { m: { kit: 'meadow' }, st: { kit: 'stream' } },
    scenes: [
      { id: 'A', set: 'm', time: 'morning',
        actors: { hare: { at: 'x:1000', face: 'right' }, tortoise: { at: 'x:1500', face: 'left' }, fox: { at: 'x:2300', face: 'left' } },
        shots: [
          { id: 'a1', camera: { size: 'wide', on: ['hare', 'tortoise'] }, beats: [{ say: 'hare', text: 'Good morning to you, old friend.' }, { say: 'tortoise', text: 'And to you.' }] },
          { id: 'a2', camera: { size: 'wide', on: ['hare', 'tortoise'] }, beats: [{ say: 'tortoise', text: 'Lovely weather today.' }] },
          { id: 'a3', camera: { size: 'medium', on: ['hare', 'tortoise'] }, beats: [{ do: 'place', who: 'hare', to: 'right-of:tortoise', at: 0 }, { say: 'hare', text: 'Now I am over here.' }] },
          { id: 'a4', camera: { size: 'close', on: ['fox'] }, beats: [{ say: 'hare', text: 'Can you hear me, fox?' }, { say: 'hare', text: 'I am only a voice here.', vo: true }] },
          { id: 'a5', dur: 0.8, camera: { size: 'establishing' }, beats: [{ wait: 0.5 }] },
          { id: 'a6', camera: { size: 'wide', on: ['hare'] }, beats: [{ wait: 1 }, { do: 'place', who: 'hare', to: 'x:1250' }, { wait: 1 }] },
          { id: 'a7', camera: { size: 'full', on: ['hare', 'tortoise'] }, beats: [{ do: 'walk', who: 'hare', to: 'x:1600' }, { do: 'walk', who: 'tortoise', to: 'x:1600', with: 'prev', speed: 3 }, { wait: 1 }] },
          { id: 'a8', camera: { size: 'wide', on: ['hare', 'tortoise'] }, beats: [{ do: 'gesture', who: 'hare', name: 'wave', touch: 'tortoise' }, { wait: 1.5 }] },
        ] },
      { id: 'B', set: 'st', time: 'golden',
        actors: { hare: { at: 'bank_left', face: 'right' }, frog: { at: 'frog_rock' } },
        shots: [
          { id: 'b1', camera: { size: 'establishing' }, beats: [{ say: 'narrator', text: 'Supercalifragilistic extraordinarily incomprehensibilities.' }, { say: 'narrator', text: 'Overlapping words.', with: 'prev' }] },
          { id: 'b2', camera: { size: 'extreme-close', on: ['hare'] }, beats: [{ say: 'hare', text: 'Look at my face, so very close.' }] },
        ] },
    ],
  };
}

let cached;
async function broken() {
  if (!cached) { const film = await loadFilm(brokenFilm()); const plan = compile(film); cached = { film, plan, result: lintPlan(plan) }; }
  return cached;
}
const issues = r => [...r.errors, ...r.warnings];
const find = (r, rule, pred = () => true) => issues(r).filter(i => i.rule === rule && pred(i));
const shotOf = (plan, id) => plan.shots.find(s => s.id === id);
// The same plan with actor states rewritten inside [t0, t1) (faults the compiler never makes).
function perturb(plan, t0, t1, fn) {
  const p = Object.create(plan);
  p.actorsAt = t => plan.actorsAt(t).map(a => (t >= t0 && t < t1 ? fn(a, t) ?? a : a));
  return p;
}
const mid = s => [s.t0 + 0.25 * (s.t1 - s.t0), s.t0 + 0.75 * (s.t1 - s.t0)];

test('every rule of the DESIGN table exists with its severity', () => {
  assert.deepEqual(Object.keys(RULES).sort(), ['axis', 'caption-face', 'collision', 'cut-jump', 'floating', 'in-water', 'inside-solid', 'offscreen-speaker', 'scale', 'subject-size', 'teleport', 'timing']);
  for (const r of ['floating', 'inside-solid', 'in-water', 'teleport', 'offscreen-speaker', 'collision']) assert.equal(RULES[r].severity, 'error', r);
  for (const r of ['subject-size', 'caption-face', 'cut-jump', 'axis', 'scale', 'timing']) assert.equal(RULES[r].severity, 'warning', r);
});

test('a speaker far outside a close-up is an error; a vo line is not', async () => {
  const { plan, result } = await broken();
  const hits = find(result, 'offscreen-speaker');
  assert.equal(hits.length, 1, JSON.stringify(hits));
  const [i] = hits, line = plan.lines.find(L => L.text.startsWith('Can you hear me'));
  assert.equal(i.severity, 'error'); assert.equal(i.shot, 'a4'); assert.equal(i.actor, 'hare');
  assert.match(i.message, /outside the frame/);
  // consecutive samples merged into one issue covering the line
  assert.ok(i.samples > 3 && Math.abs(i.t0 - line.t0) < 1 / 24 + 1e-9 && i.t1 > line.t1 - 0.2 && i.t1 < line.t1, `${i.t0}–${i.t1} vs ${line.t0}–${line.t1}`);
  assert.ok(!issues(result).some(x => /only a voice/.test(x.message)));
});

test('a place in the middle of a shot is a teleport', async () => {
  const { plan, result } = await broken();
  const hits = find(result, 'teleport');
  assert.equal(hits.length, 1, JSON.stringify(hits));
  const s = shotOf(plan, 'a6');
  assert.equal(hits[0].shot, 'a6'); assert.equal(hits[0].actor, 'hare'); assert.equal(hits[0].severity, 'error');
  assert.ok(hits[0].t > s.t0 + 0.9 && hits[0].t < s.t1);
  assert.match(hits[0].message, /jumps \d+ px/);
});

test('two actors walking into the same spot collide; touching on purpose is only a warning', async () => {
  const { result } = await broken();
  const a7 = find(result, 'collision', i => i.shot === 'a7'), a8 = find(result, 'collision', i => i.shot === 'a8');
  assert.ok(a7.length >= 1 && a7.every(i => i.severity === 'error'), JSON.stringify(a7));
  assert.deepEqual([a7[0].actor, a7[0].other], ['hare', 'tortoise']);
  assert.ok(a8.length >= 1 && a8.every(i => i.severity === 'warning'), JSON.stringify(a8));
  assert.match(a8[0].message, /interact/);
  assert.ok(!find(result, 'collision', i => !['a7', 'a8'].includes(i.shot)).length, 'no other collisions');
});

test('two identical consecutive framings are a cut-jump; an axis flip across a cut is caught', async () => {
  const { result } = await broken();
  const cj = find(result, 'cut-jump', i => i.shot === 'a2');
  assert.equal(cj.length, 1); assert.equal(cj[0].severity, 'warning'); assert.equal(cj[0].frames.length, 2);
  assert.ok(cj[0].frames[0] < cj[0].frames[1]);
  assert.ok(!find(result, 'cut-jump', i => ['a3', 'a4', 'a5', 'b1', 'b2'].includes(i.shot)).length, 'real changes of framing are fine');
  const ax = find(result, 'axis');
  assert.equal(ax.length, 1, JSON.stringify(ax));
  assert.equal(ax[0].shot, 'a3'); assert.deepEqual([ax[0].actor, ax[0].other], ['hare', 'tortoise']);
  assert.match(ax[0].message, /was left of tortoise in a2, now right in a3/);
});

test('a 0.8 s shot, overlapping dialogue and an unreadable caption are timing warnings', async () => {
  const { result } = await broken();
  const tm = find(result, 'timing');
  assert.ok(tm.every(i => i.severity === 'warning'));
  assert.ok(tm.some(i => i.shot === 'a5' && /lasts 0\.79 s/.test(i.message)), 'short shot');
  assert.ok(tm.some(i => i.shot === 'b1' && /dialogue overlaps/.test(i.message)), 'overlap');
  assert.ok(tm.some(i => i.shot === 'b1' && /characters per second/.test(i.message)), 'caption speed');
  assert.ok(!tm.some(i => ['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'b2'].includes(i.shot)), JSON.stringify(tm));
});

test('feet on air are floating (one merged issue); lifted by a jump they are not', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a1'), S = s.set, [t0, t1] = mid(s);
  const v = frameInfo(plan, (t0 + t1) / 2).view, top = Math.min(...S.region.map(p => p[1]));
  const y = v[1] + 0.3 * (v[3] - v[1]);
  assert.ok(y < top - 10, 'the chosen height is above the walkable ground and inside the frame');
  const r = lintPlan(perturb(plan, t0, t1, a => (a.id === 'hare' ? { ...a, y, key: y } : a)), { rules: ['floating'] });
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  const [i] = r.errors;
  assert.equal(i.rule, 'floating'); assert.equal(i.actor, 'hare'); assert.equal(i.shot, 'a1');
  assert.ok(i.t0 >= t0 - 1e-9 && i.t0 < t0 + 0.2 && i.t1 <= t1 && i.t1 > t1 - 0.2, `${i.t0}–${i.t1} vs ${t0}–${t1}`);
  assert.match(i.message, /stands on air/);
  // a pose that leaves the ground without flying or jumping
  const lifted = lintPlan(perturb(plan, t0, t1, a => (a.id === 'hare' ? { ...a, st: { ...a.st, lift: 30 } } : a)), { rules: ['floating'] });
  assert.equal(lifted.errors.length, 1); assert.match(lifted.errors[0].message, /drawn \d+ units above/);
  const jumping = lintPlan(perturb(plan, t0, t1, a => (a.id === 'hare' ? { ...a, airborne: true, st: { ...a.st, lift: 30 } } : a)), { rules: ['floating'] });
  assert.equal(jumping.errors.length, 0);
});

test('standing inside a prop footprint is inside-solid', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a5'), [t0, t1] = mid(s), v = frameInfo(plan, (t0 + t1) / 2).view;
  const col = s.set.colliders().find(c => c.x > v[0] + 100 && c.x < v[2] - 100 && c.y > v[1] && c.y < v[3]);
  assert.ok(col, 'a solid prop in the establishing view');
  const r = lintPlan(perturb(plan, t0, t1, a => (a.id === 'tortoise' ? { ...a, x: col.x, y: col.y, key: col.y } : a)), { rules: ['inside-solid', 'floating'] });
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  assert.equal(r.errors[0].rule, 'inside-solid'); assert.equal(r.errors[0].actor, 'tortoise');
  assert.ok(r.errors[0].message.includes(col.id));
  assert.ok(r.errors[0].marks.some(m => m.kind === 'ellipse'), 'the footprint is drawn in the report');
});

test('standing in the stream is in-water, unless on a stone or a frog', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'b1'), S = s.set, [t0, t1] = mid(s);
  let wet = null;
  for (let x = 1200; x <= 1400 && !wet; x += 5) if (S.inWater(x, 1120) && !S.onStone(x, 1120)) wet = [x, 1120];
  assert.ok(wet, 'a point in the water');
  const at = (a, [x, y]) => ({ ...a, x, y, key: y, mode: 'ground', anchor: null });
  const r = lintPlan(perturb(plan, t0, t1, a => (a.id === 'hare' || a.id === 'frog' ? at(a, wet) : a)), { rules: ['in-water', 'floating'] });
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  assert.equal(r.errors[0].rule, 'in-water'); assert.equal(r.errors[0].actor, 'hare');
  const st = S.anchor('stone_2');
  const ok = lintPlan(perturb(plan, t0, t1, a => (a.id === 'hare' ? { ...a, x: st.x, y: st.y, key: st.y, mode: 'surface', anchor: 'stone_2' } : a)), { rules: ['in-water', 'floating'] });
  assert.equal(ok.errors.length, 0, JSON.stringify(ok.errors));
});

test('a glitch lasting one frame on a beat boundary is still sampled', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a1'), L = plan.lines.find(l => l.text === 'And to you.'), fps = plan.fps;
  const f0 = Math.round(s.t0 * fps), k = Math.round(fps / 6);
  let f = Math.ceil(L.t0 * fps - 1e-6);
  if ((f - f0) % k === 0) f = Math.floor(L.t0 * fps + 1e-6);
  assert.notEqual((f - f0) % k, 0, 'the boundary frame is off the regular grid');
  const r = lintPlan(perturb(plan, f / fps - 1e-6, f / fps + 1e-6, a => (a.id === 'hare' ? { ...a, st: { ...a.st, lift: 40 } } : a)), { rules: ['floating'] });
  assert.equal(r.errors.length, 1); assert.equal(r.errors[0].frame, f);
});

test('scale, subject-size and caption-face', async () => {
  const { plan } = await broken();
  const grow = (shot, id, k) => { const [t0, t1] = mid(shotOf(plan, shot)); return perturb(plan, t0, t1, a => (a.id === id ? { ...a, s: a.s * k } : a)); };
  assert.equal(lintPlan(plan, { rules: ['scale'] }).warnings.length, 0, 'the compiler keeps everyone in perspective');
  const big = lintPlan(grow('a1', 'tortoise', 1.4), { rules: ['scale'] }).warnings;
  assert.ok(big.some(i => i.actor === 'tortoise' && /1\.40× the set's scale/.test(i.message)), JSON.stringify(big));
  const huge = lintPlan(grow('a4', 'fox', 2.4), { rules: ['subject-size'] }).warnings, tiny = lintPlan(grow('a4', 'fox', 0.35), { rules: ['subject-size'] }).warnings;
  assert.ok(huge.some(i => i.shot === 'a4' && i.actor === 'fox' && /close shot/.test(i.message)), JSON.stringify(huge));
  assert.ok(tiny.some(i => i.shot === 'a4' && i.actor === 'fox'), JSON.stringify(tiny));
  assert.equal(lintPlan(plan, { rules: ['subject-size'] }).warnings.filter(i => i.shot === 'a4').length, 0, 'the real close-up is the right size');
  // a face so big the caption cannot avoid it
  const b2 = shotOf(plan, 'b2'), [u0, u1] = mid(b2);
  assert.equal(lintPlan(plan, { rules: ['caption-face'] }).warnings.length, 0, 'captions are placed off the face');
  // grow the hare's face to fill the frame, centred, so both caption places fall on it
  const tm = (u0 + u1) / 2, z = frameInfo(plan, tm).camera.zoom, grown = perturb(plan, u0, u1, a => (a.id === 'hare' ? { ...a, s: a.s * 1.6 } : a));
  const h = frameInfo(grown, tm).actors.find(a => a.id === 'hare').head, dx = (plan.W / 2 - h[0]) / z, dy = (plan.H / 2 - h[1]) / z;
  const cf = lintPlan(perturb(plan, u0, u1, a => (a.id === 'hare' ? { ...a, s: a.s * 1.6, x: a.x + dx, y: a.y + dy, key: a.y + dy } : a)), { rules: ['caption-face'] }).warnings;
  assert.ok(cf.length >= 1 && cf[0].actor === 'hare' && cf[0].marks.some(m => m.kind === 'caption'), JSON.stringify(cf));
});

test('lint is deterministic', async () => {
  const { plan, result } = await broken();
  const again = lintPlan(plan), strip = r => JSON.stringify({ e: r.errors, w: r.warnings });
  assert.equal(strip(again), strip(result));
});

test('the report writes lint.json and lint.jpg', async () => {
  const { plan, result } = await broken();
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-lint-'));
  try {
    const out = await writeLintReport(plan, result, dir, { maxTiles: 3 });
    const j = JSON.parse(readFileSync(out.json, 'utf8'));
    assert.equal(j.counts.errors, result.errors.length); assert.equal(j.counts.warnings, result.warnings.length);
    assert.equal(j.errors.length, result.errors.length); assert.equal(j.limits.minShot, LIMITS.minShot);
    assert.equal(out.tiles, 3); assert.equal(out.omitted, issues(result).length - 3);
    const jpg = readFileSync(out.jpg);
    assert.ok(jpg[0] === 0xff && jpg[1] === 0xd8 && jpg.length > 20000);
    const clean = await writeLintReport(plan, { errors: [], warnings: [] }, join(dir, 'clean'));
    assert.ok(readFileSync(clean.jpg).length > 1000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the test film has no errors and none of the physical warnings', async () => {
  const plan = compile(await loadFilm('films/_test'));
  const r = lintPlan(plan);
  assert.deepEqual(r.errors, [], r.errors.map(i => `${i.rule} ${i.shot} ${i.message}`).join('\n'));
  const bad = r.warnings.filter(i => ['collision', 'scale', 'cut-jump', 'axis', 'caption-face', 'timing'].includes(i.rule));
  assert.deepEqual(bad, [], bad.map(i => `${i.rule} ${i.shot} ${i.message}`).join('\n'));
  assert.ok(r.stats.samples > (plan.duration - 7) * 6, 'sampled every 1/6 s at least');
});
