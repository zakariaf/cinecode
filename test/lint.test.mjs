// Lint: staging and editing checks. A film broken on purpose (each fault in its own shot) must trip each rule,
// faults the compiler never produces (feet on air, standing in a rock or a stream) are injected into the plan,
// and the test film must come out clean. A film that rides, wades and uses scaled cast members (DESIGN §9.4) must
// come out clean but for its one deliberate fault.
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
import { ZMAX } from '../engine/film/camera.mjs';

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

// ───────────── riding, wading, cast scale (DESIGN §9.4) ─────────────
// R (meadow): a squirrel rides a big tortoise (cast scale 1.3) through a full shot while it talks, hops off and back
// on, then a close-up of a tiny tortoise (cast scale 0.55) at the closest zoom and a pull-out from medium to wide.
// W (stream): the tortoise wades across with the squirrel on its back (half under, depth 30 units) while the squirrel
// talks, then wades back in and goes fully under, and speaks from there (the one fault, on purpose).
// Scene overlays, marks, fx and sfx beats are sprinkled in: none of them may trip a rule.
function rideFilm() {
  return {
    title: 'Riders and waders', format: { width: 1920, height: 1080, fps: 24, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' }, nut: { voice: 'Puck' }, shell: { voice: 'Algenib' } },
    cast: { shell: { rig: 'tortoise', voice: 'shell', scale: 1.3 }, nut: { rig: 'squirrel', voice: 'nut' }, tiny: { rig: 'tortoise', scale: 0.55 } },
    sets: { m: { kit: 'meadow' }, st: { kit: 'stream' } },
    scenes: [
      { id: 'R', set: 'm', time: 'morning', overlays: ['motes'],
        actors: { shell: { at: 'x:1150,y:1060', face: 'right' }, nut: { on: 'shell', face: 'right', pose: 'sit' }, tiny: { at: 'x:1750,y:1110', face: 'left' } },
        shots: [
          { id: 'r1', camera: { size: 'full', on: ['shell'] }, beats: [{ say: 'nut', text: 'Onward, old shell, onward!' }, { do: 'walk', who: 'shell', to: 'x:1300,y:1060', speed: 3, with: 'prev' }, { mark: 'onward' }, { wait: 0.5 }] },
          { id: 'r2', camera: { size: 'wide', on: ['shell', 'nut'] }, beats: [{ do: 'hop', who: 'nut', to: 'x:1500,y:1000' }, { say: 'nut', text: 'Down I go.' }, { do: 'hop', who: 'nut', to: 'on:shell' }, { wait: 0.8 }] },
          { id: 'r3', camera: { size: 'close', on: ['tiny'] }, beats: [{ say: 'shell', text: 'Look at the little one.', vo: true }, { wait: 1 }] },
          { id: 'r4', camera: { size: 'medium', on: ['shell'], move: 'pull-out', to: 'wide' }, beats: [{ fx: 'sparkle', at: 'shell' }, { wait: 2.5 }] },
        ] },
      { id: 'W', set: 'st', time: 'noon', overlays: ['fireflies'],
        actors: { shell: { at: 'x:950,y:1100', face: 'right' }, nut: { on: 'shell', face: 'right', pose: 'sit' } },
        shots: [
          { id: 'w1', camera: { size: 'wide', on: ['shell'], move: 'track' }, beats: [
            { do: 'walk', who: 'shell', to: 'x:1700,y:1100', wade: true, depth: 30, speed: 4 },
            { say: 'nut', text: 'Keep your chin up!', at: 3 }, { fx: 'splash', at: 'shell', with: 'prev' }, { sfx: 'slosh', with: 'prev' }] },
          { id: 'w2', camera: { size: 'wide', on: ['shell'] }, beats: [
            { do: 'walk', who: 'shell', to: 'x:1300,y:1100', wade: true, speed: 4 }, { say: 'shell', text: 'Blub.' }, { mark: 'under' }] },
        ] },
    ],
  };
}
let rideCached;
async function riding() {
  if (!rideCached) { const plan = compile(await loadFilm(rideFilm())); rideCached = { plan, result: lintPlan(plan) }; }
  return rideCached;
}
// frameInfo actors (by id) at the frame nearest t, and the times of a shot's frames that satisfy pred(info, byId)
const actorsOf = (plan, t) => new Map(frameInfo(plan, t).actors.map(a => [a.id, a]));
function framesWhere(plan, s, pred) {
  const out = [];
  for (let f = Math.ceil(s.t0 * plan.fps); f < Math.floor(s.t1 * plan.fps); f += 2) { const t = f / plan.fps; if (pred(actorsOf(plan, t), t)) out.push(t); }
  return out;
}

test('riding, wading, cast scale, overlays and marks: the only issue is the line spoken from under the water', async () => {
  const { plan, result } = await riding();
  assert.deepEqual(Object.keys(plan.marks).sort(), ['onward', 'under']);
  const all = issues(result);
  assert.equal(all.length, 1, all.map(i => `${i.rule} ${i.shot} ${i.message}`).join('\n'));
  const [i] = all;
  assert.equal(i.rule, 'offscreen-speaker'); assert.equal(i.severity, 'error'); assert.equal(i.shot, 'w2'); assert.equal(i.actor, 'shell');
  assert.match(i.message, /from under the water/);
});

test('a rider is on its carrier: not floating, not colliding, in scale at the carrier\'s depth', async () => {
  const { plan } = await riding();
  const r1 = shotOf(plan, 'r1'), [t0, t1] = mid(r1), tm = (t0 + t1) / 2, A = actorsOf(plan, tm), nut = A.get('nut'), S = r1.set;
  assert.equal(nut.contact.kind, 'mount'); assert.equal(nut.carrier, 'shell');
  // the riding point is far above the ground: the perspective there is not the rider's
  assert.ok(Math.abs(S.scaleAt(nut.x, nut.y) / nut.s - 1) > LIMITS.scaleTol, 'the riding point sits well above the ground line');
  // its footprint overlaps its carrier's: standing there on the ground instead is a collision
  const grounded = perturb(plan, t0, t1, a => (a.id === 'nut' ? { ...a, mode: 'ground', carrier: null, y: A.get('shell').y, key: A.get('shell').y, ground: null } : a));
  const col = lintPlan(grounded, { rules: ['collision'] }).errors;
  assert.ok(col.some(x => x.shot === 'r1' && x.actor === 'nut' && x.other === 'shell'), JSON.stringify(col));
  // a carrier that is not there leaves the rider floating
  const gone = Object.create(plan); gone.actorsAt = t => plan.actorsAt(t).filter(a => !(a.id === 'shell' && t >= t0 && t < t1));
  const fl = lintPlan(gone, { rules: ['floating'] }).errors;
  assert.ok(fl.length >= 1 && fl.every(x => x.actor === 'nut' && x.shot === 'r1') && /rides shell .* but it is not there/.test(fl[0].message), JSON.stringify(fl));
  // a rider drawn too big is measured against its carrier's depth
  const big = lintPlan(perturb(plan, t0, t1, a => (a.id === 'nut' ? { ...a, s: a.s * 1.4 } : a)), { rules: ['scale'] }).warnings;
  assert.ok(big.some(x => x.actor === 'nut' && /1\.40× the set's scale at its carrier shell's depth/.test(x.message)), JSON.stringify(big));
});

test('a wading actor may stand in the water and is judged by what shows above it', async () => {
  const { plan } = await riding();
  const w1 = shotOf(plan, 'w1'), S = w1.set;
  const wet = framesWhere(plan, w1, A => { const s = A.get('shell'); return S.inWater(s.x, s.y) && s.sink > 20; });
  assert.ok(wet.length > 10, 'the tortoise is well into the stream for a while');
  const A = actorsOf(plan, wet[wet.length >> 1]), shell = A.get('shell'), nut = A.get('nut');
  assert.ok(shell.wade && shell.visibleBox[3] < shell.screenBox[3] - 10, 'part of the tortoise is hidden under the water');
  assert.equal(nut.waterline, shell.waterline, 'the rider shares its carrier\'s waterline');
  const L = plan.lines.find(l => l.who === 'nut' && l.text.startsWith('Keep'));
  assert.ok(wet.some(t => t >= L.t0 && t < L.t1), 'the rider talks while its carrier wades');
  // the same frames without the wade are a tortoise standing in the stream
  const [a, b] = [wet[0], wet[wet.length - 1] + 1e-3];
  const dry = lintPlan(perturb(plan, a, b, x => (x.id === 'shell' ? { ...x, wade: false } : x)), { rules: ['in-water'] }).errors;
  assert.ok(dry.length >= 1 && dry.every(x => x.actor === 'shell' && x.shot === 'w1'), JSON.stringify(dry));
});

test('a cast member scaled down that the closest zoom cannot fill is judged at scale 1; a zoom move to another size at its start', async () => {
  const { plan } = await riding();
  const r3 = shotOf(plan, 'r3'), [t0, t1] = mid(r3);
  assert.ok(r3.cameraAt((t0 + t1) / 2).zoom >= ZMAX * 0.98, 'the close-up of the tiny tortoise is at the closest zoom');
  assert.equal(lintPlan(plan, { rules: ['subject-size'] }).warnings.length, 0);
  // half as big again is too small even at scale 1
  const small = lintPlan(perturb(plan, t0, t1, a => (a.id === 'tiny' ? { ...a, s: a.s * 0.5 } : a)), { rules: ['subject-size'] }).warnings;
  assert.ok(small.some(x => x.shot === 'r3' && x.actor === 'tiny' && /closest zoom.*cast scale 0\.55/.test(x.message)), JSON.stringify(small));
  // r4 ends at a wide framing: the medium-shot size would be far too small there
  const r4 = shotOf(plan, 'r4'), end = actorsOf(plan, r4.t1 - 2 / plan.fps).get('shell');
  assert.ok((end.screenBox[3] - end.screenBox[1]) / plan.H < 0.5 * 0.75, 'the pull-out really ends wide');
});

// Two talkers on different depth lines. The hare walks up to the fox (x2) and on past it right after the cut (x3): the
// sides swap during a shot, in view, while their screen positions are too close to call, so it is no axis flip.
// Placing the hare on the right at the cut instead is.
function crossFilm(placeAtCut) {
  return {
    title: 'Crossing', format: { width: 640, height: 360, fps: 24, captions: 'none' },
    voices: { hare: { voice: 'Puck' }, fox: { voice: 'Algieba' } },
    cast: { hare: { rig: 'hare', voice: 'hare' }, fox: { rig: 'fox', voice: 'fox' } },
    sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 'X', set: 'm', time: 'morning', actors: { hare: { at: 'x:1000,y:1000', face: 'right' }, fox: { at: 'x:1300,y:1120', face: 'left' } },
      shots: [
        { id: 'x1', camera: { size: 'wide', on: ['hare', 'fox'] }, beats: [{ say: 'hare', text: 'I am on the left.' }, { say: 'fox', text: 'So you are.' }] },
        { id: 'x2', camera: { size: 'establishing' }, beats: [placeAtCut ? { wait: 2 } : { do: 'walk', who: 'hare', to: 'x:1295,y:1000' }] },
        { id: 'x3', camera: { size: 'full', on: ['hare', 'fox'] }, beats: [{ do: placeAtCut ? 'place' : 'walk', who: 'hare', to: 'x:1600,y:1000', at: 0 }, { say: 'hare', text: 'Now I am on the right.' }] },
      ] }],
  };
}

test('a talker seen walking past the other is no axis flip; one placed there at the cut is', async () => {
  const walked = lintPlan(compile(await loadFilm(crossFilm(false))), { rules: ['axis'] }).warnings;
  assert.deepEqual(walked, []);
  const placed = lintPlan(compile(await loadFilm(crossFilm(true))), { rules: ['axis'] }).warnings;
  assert.equal(placed.length, 1, JSON.stringify(placed));
  assert.equal(placed[0].shot, 'x3'); assert.match(placed[0].message, /fox was right of hare in x2, now left in x3/);
});

test('the same empty view on both sides of a cut (a time-lapse into a title) is no cut-jump', async () => {
  const film = withFox => ({
    title: 'Views', format: { width: 640, height: 360, fps: 24, captions: 'none' },
    cast: { fox: { rig: 'fox' } }, sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 'V', set: 'm', time: 'morning', actors: withFox ? { fox: { at: 'x:1400,y:1060' } } : {},
      shots: [{ id: 'v1', camera: { size: 'establishing' }, time: { from: 'night', to: 'morning' }, beats: [{ wait: 2 }] },
        { id: 'v2', camera: { size: 'establishing' }, beats: [{ title: 'VIEWS', at: 0.2, dur: 1.5 }], dur: 2 }] }],
  });
  assert.deepEqual(lintPlan(compile(await loadFilm(film(false))), { rules: ['cut-jump'] }).warnings, []);
  const seen = lintPlan(compile(await loadFilm(film(true))), { rules: ['cut-jump'] }).warnings;
  assert.equal(seen.length, 1); assert.equal(seen[0].shot, 'v2');
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
