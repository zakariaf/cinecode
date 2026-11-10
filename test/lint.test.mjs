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
import { lintPlan, writeLintReport, RULES, LIMITS, silhouette, skyDiscs, blended } from '../engine/lint/lint.mjs';
import { createCanvas } from '@napi-rs/canvas';
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

test('every rule of the DESIGN table exists with its severity, and every rule says how to fix it', () => {
  assert.deepEqual(Object.keys(RULES).sort(), ['axis', 'caption-face', 'collision', 'continuity', 'cut-jump', 'edge-cut', 'floating', 'halo', 'in-water', 'inside-solid', 'offscreen-speaker', 'scale', 'subject-size', 'tangent', 'teleport', 'timing']);
  for (const r of ['floating', 'inside-solid', 'in-water', 'teleport', 'offscreen-speaker', 'collision']) assert.equal(RULES[r].severity, 'error', r);
  for (const r of ['subject-size', 'caption-face', 'cut-jump', 'axis', 'scale', 'timing', 'continuity', 'edge-cut', 'tangent', 'halo']) assert.equal(RULES[r].severity, 'warning', r);
  for (const [r, R] of Object.entries(RULES)) assert.ok(typeof R.fix === 'string' && R.fix.length > 20 && typeof R.catches === 'string', r);
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
// on, then a close-up of a tiny tortoise (cast scale 0.55) and a pull-out from medium to wide.
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
  // since the zoom cap went from 12 to 36 the camera can really close in on a 0.55-scale tortoise
  assert.ok(r3.cameraAt((t0 + t1) / 2).zoom > 12, 'the close-up of the tiny tortoise closes in past the old zoom cap');
  assert.equal(lintPlan(plan, { rules: ['subject-size'] }).warnings.length, 0);
  // half as big again is too small even at scale 1
  const small = lintPlan(perturb(plan, t0, t1, a => (a.id === 'tiny' ? { ...a, s: a.s * 0.5 } : a)), { rules: ['subject-size'] }).warnings;
  assert.ok(small.some(x => x.shot === 'r3' && x.actor === 'tiny' && /fills \d+% of the frame height/.test(x.message)), JSON.stringify(small));
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

// ───────────── continuity across cuts, time seen on its own after a dissolve ─────────────
// C: Pip sits on the grass; at the cut to c2 she is standing (a "set" at the cut, never seen); in c3 she sits down
// on screen (seen). D dissolves in (same set and time) on a d1 of Pip standing elsewhere: at 1.2 s the dissolve leaves
// too little of it on its own to pass time; then d2 places her back on the grass, sitting, at the cut. Held 2.5 s, d1
// passes time: only the cut into d2 jumps.
function contFilm(d1 = 1.2) {
  return {
    title: 'Continuity', format: { width: 640, height: 360, fps: 24, captions: 'none' },
    cast: { pip: { rig: 'human', params: { age: 'child' } }, hare: { rig: 'hare' } },
    sets: { m: { kit: 'meadow' } },
    scenes: [
      { id: 'C', set: 'm', time: 'morning', actors: { pip: { at: 'x:1200,y:1060', face: 'right', pose: 'sit-ground' }, hare: { at: 'x:1450,y:1060', face: 'left' } },
        shots: [
          { id: 'c1', camera: { size: 'wide', on: ['pip', 'hare'] }, beats: [{ wait: 2 }] },
          { id: 'c2', camera: { size: 'wide', on: ['pip', 'hare'], angle: 'high' }, beats: [{ do: 'set', who: 'pip', pose: 'stand', at: 0 }, { wait: 2 }] },
          { id: 'c3', camera: { size: 'full', on: ['pip'] }, beats: [{ do: 'pose', who: 'pip', pose: 'sit-ground', dur: 1 }, { wait: 1 }] },
        ] },
      { id: 'D', set: 'm', time: 'morning', transition: 'dissolve', actors: { pip: { at: 'x:1650,y:1060', face: 'left' }, hare: { at: 'x:1450,y:1060', face: 'left' } },
        shots: [
          { id: 'd1', camera: { size: 'wide', on: ['pip', 'hare'] }, beats: [{ wait: 0.5 }], dur: d1 },
          { id: 'd2', camera: { size: 'wide', on: ['pip', 'hare'], angle: 'high' }, beats: [{ do: 'place', who: 'pip', to: 'x:1250,y:1060', at: 0 }, { do: 'set', who: 'pip', pose: 'sit-ground', at: 0 }, { wait: 2 }] },
        ] },
    ],
  };
}

test('a pose or place changed across a cut, unseen, is a continuity warning; across a dissolve only when it is too short to pass time', async () => {
  const short = lintPlan(compile(await loadFilm(contFilm(1.2))), { rules: ['continuity'] }).warnings;
  assert.deepEqual(short.map(i => i.shot), ['c2', 'd1', 'd2'], JSON.stringify(short.map(i => i.message)));
  const [c2, d1, d2] = short;
  assert.equal(c2.actor, 'pip'); assert.match(c2.message, /across the cut c1 → c2, pip goes from low \(drawn at 0\.\d\d× its standing height\) to standing/);
  assert.ok(!/moves/.test(c2.message), 'she sits where she stood');
  assert.equal(c2.frames.length, 2); assert.ok(c2.frames[0] < c2.frames[1]);
  assert.match(d1.message, /across the dissolve c3 → d1 \(too short to pass time: d1 plays 0\.\d\d s on its own\), pip goes from low .* to standing .* and moves \d+ px/);
  assert.match(d2.message, /across the cut d1 → d2, pip goes from standing .* to low .* and moves \d+ px/);
  assert.ok(!short.some(i => i.actor === 'hare'), 'the hare stays put');
  // held long enough, the dissolve passes time
  const long = lintPlan(compile(await loadFilm(contFilm(2.5))), { rules: ['continuity'] }).warnings;
  assert.deepEqual(long.map(i => i.shot), ['c2', 'd2']);
});

test('a shot a dissolve leaves less than 1.2 s of on its own is a timing warning, and its "dur" fixes it', async () => {
  const plan = compile(await loadFilm(contFilm(1.2))), d1 = shotOf(plan, 'd1'), b = blended(plan, d1);
  assert.ok(d1.t1 - d1.t0 >= LIMITS.minShot - 1e-6 && b.clean < 0.9 && b.parts.length === 1 && /dissolve from C/.test(b.parts[0].what), JSON.stringify(b));
  assert.equal(blended(plan, shotOf(plan, 'c2')).clean, shotOf(plan, 'c2').t1 - shotOf(plan, 'c2').t0, 'a cut takes nothing');
  const tm = lintPlan(plan, { rules: ['timing'] }).warnings.filter(i => i.shot === 'd1');
  assert.equal(tm.length, 1, JSON.stringify(tm));
  const m = /lasts 1\.2\d s, but 0\.\d\d s of the dissolve from C leaves it only (0\.\d\d) s on its own .*"dur": (\d\.\d\d)/.exec(tm[0].message);
  assert.ok(m, tm[0].message);
  // the hint works: at that length the shot plays 1.2 s on its own
  const fixed = lintPlan(compile(await loadFilm(contFilm(+m[2]))), { rules: ['timing'] }).warnings;
  assert.deepEqual(fixed, [], JSON.stringify(fixed));
});

// ───────────── the frame's edges ─────────────
// Faults made by moving an actor (screen px) inside a1's middle; each message's fix, applied to the film, clears it.
const shove = (plan, id, [t0, t1], dx, dy) => {
  const z = plan.shotAt(t0).cameraAt(t0).zoom;
  return perturb(plan, t0, t1, a => (a.id === id ? { ...a, x: a.x + dx / z, y: a.y + dy / z, key: a.key + dy / z } : a));
};
const actorAt = (plan, t, id) => { const info = frameInfo(plan, t), a = info.actors.find(x => x.id === id), st = plan.actorsAt(t, info.scene).find(x => x.id === id); return { info, a, st, sil: silhouette(plan, info, a, st) }; };
// the film with one shot's camera offset set as a message suggests
async function withOffset(msg, shot) {
  const m = /"offset": \[(-?[\d.]+), (-?[\d.]+)\]/.exec(msg);
  assert.ok(m, `an offset in: ${msg}`);
  const film = brokenFilm(); for (const sc of film.scenes) for (const sh of sc.shots) if (sh.id === shot) sh.camera = { ...sh.camera, offset: [+m[1], +m[2]] };
  return compile(await loadFilm(film));
}

test('an outline just touching a frame edge is a tangent, and its offset clears it', async () => {
  const { plan } = await broken();
  const win = mid(shotOf(plan, 'a1')), tm = (win[0] + win[1]) / 2, { sil } = actorAt(plan, tm, 'tortoise'), H = plan.H;
  assert.equal(lintPlan(plan, { rules: ['tangent'] }).warnings.filter(i => i.shot === 'a1').length, 0, 'clear of the edges as composed');
  // the feet 3 px above the bottom edge
  const dy = H - 3 - sil.box[3], r = lintPlan(shove(plan, 'tortoise', win, 0, dy), { rules: ['tangent'] }).warnings;
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.equal(r[0].actor, 'tortoise'); assert.match(r[0].message, /tortoise's outline ends \d px above the bottom edge of the frame \(a tangent\)/);
  assert.ok(r[0].t1 - r[0].t0 >= LIMITS.edgeHold);
  // well clear, or for a moment only, it is none
  assert.equal(lintPlan(shove(plan, 'tortoise', win, 0, H - 40 - sil.box[3]), { rules: ['tangent'] }).warnings.length, 0);
  assert.equal(lintPlan(shove(plan, 'tortoise', [win[0], win[0] + 0.3], 0, dy), { rules: ['tangent'] }).warnings.length, 0);
  // the offset in the message, applied: the same feet clear the edge
  const fixed = await withOffset(r[0].message, 'a1');
  assert.equal(lintPlan(shove(fixed, 'tortoise', win, 0, dy), { rules: ['tangent'] }).warnings.filter(i => i.actor === 'tortoise').length, 0);
});

test('a head the frame edge cuts near its eyes, and a sliver of an actor, are edge-cuts', async () => {
  const { plan } = await broken();
  const win = mid(shotOf(plan, 'a1')), { a } = actorAt(plan, (win[0] + win[1]) / 2, 'tortoise');
  assert.equal(lintPlan(plan, { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a1').length, 0);
  // its eyes a tenth of a head below the top edge
  const hh = (a.headBox[2] - a.headBox[0]) / 1.2, head = lintPlan(shove(plan, 'tortoise', win, 0, 0.1 * hh - a.head[1]), { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a1');
  assert.equal(head.length, 1, JSON.stringify(head));
  assert.match(head[0].message, /tortoise's head is cut by the top edge of the frame, \d+ px from its eyes: /);
  assert.ok(head[0].marks.some(m => /head/.test(m.label)));
  // in the medium a3, the back fifth of its box left in at the left edge, its head (it faces left) out
  const w3 = mid(shotOf(plan, 'a3')), s3 = actorAt(plan, (w3[0] + w3[1]) / 2, 'tortoise').sil.box, left = f => shove(plan, 'tortoise', w3, -(s3[2] - f * (s3[2] - s3[0])), 0);
  assert.equal(lintPlan(plan, { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a3').length, 0);
  const sl = lintPlan(left(0.2), { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a3');
  assert.equal(sl.length, 1, JSON.stringify(sl));
  assert.match(sl[0].message, /only a sliver of tortoise is in frame \(\d+% of it, at the left edge, its head out\): /);
  // half of it in is no sliver
  assert.equal(lintPlan(left(0.5), { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a3').length, 0);
});

// The plan with one actor drawn by its rig changed (R: fields over the rig's): a rig with no face is one with only the
// 'neutral' expression, or one that says faceless: true.
function rigged(plan, id, R = { expressions: ['neutral'] }) {
  const p = Object.create(plan), memo = new Map(), as = r => { if (!memo.has(r)) memo.set(r, { ...r, ...R }); return memo.get(r); };
  p.actorsAt = (t, sc) => plan.actorsAt(t, sc).map(a => (a.id === id ? { ...a, R: as(a.R) } : a));
  return p;
}

test('a rig with no face has no head to cut, crown with a halo or hide under a caption; its sliver and framed region are judged by its body', async () => {
  const { plan } = await broken();
  // a head cut near its eyes: none for the same tortoise without a face (by its expressions or its own flag)
  const win = mid(shotOf(plan, 'a1')), { a } = actorAt(plan, (win[0] + win[1]) / 2, 'tortoise'), hh = (a.headBox[2] - a.headBox[0]) / 1.2;
  const cut = shove(plan, 'tortoise', win, 0, 0.1 * hh - a.head[1]), heads = p => lintPlan(p, { rules: ['edge-cut'], hints: false }).warnings.filter(i => i.shot === 'a1');
  assert.equal(heads(cut).length, 1);
  assert.deepEqual(heads(rigged(cut, 'tortoise')).map(i => i.message), []);
  assert.deepEqual(heads(rigged(cut, 'tortoise', { faceless: true })).map(i => i.message), []);
  assert.equal(heads(rigged(cut, 'tortoise', { expressions: ['neutral'], faceless: false })).length, 1, 'a rig that says it has a face');
  // a sliver of it is still a sliver (its body), said without a head
  const w3 = mid(shotOf(plan, 'a3')), s3 = actorAt(plan, (w3[0] + w3[1]) / 2, 'tortoise').sil.box;
  const sl = lintPlan(rigged(shove(plan, 'tortoise', w3, -(s3[2] - 0.2 * (s3[2] - s3[0])), 0), 'tortoise'), { rules: ['edge-cut'], hints: false }).warnings.filter(i => i.shot === 'a3');
  assert.equal(sl.length, 1, JSON.stringify(sl));
  assert.match(sl[0].message, /only a sliver of tortoise is in frame \(\d+% of it, at the left edge\): /);
  // the moon over its top is no halo
  const moon = compile(await loadFilm(moonFilm())), s = moon.shots[0], mw = [s.t0 + 0.3, s.t1 - 0.3], mt = (mw[0] + mw[1]) / 2;
  const m = actorAt(moon, mt, 'pip'), [d] = skyDiscs(s.set, m.info.camera, s.skyAt(mt), moon.W, moon.H), mh = (m.a.headBox[2] - m.a.headBox[0]) / 1.2;
  const crowned = shove(moon, 'pip', mw, d.x - m.a.head[0], d.y + d.r + 0.6 * mh - m.a.head[1]);
  assert.equal(lintPlan(crowned, { rules: ['halo'], hints: false }).warnings.length, 1);
  assert.deepEqual(lintPlan(rigged(crowned, 'pip'), { rules: ['halo'] }).warnings, []);
  // a caption over where its face would be is no caption-face
  const [u0, u1] = mid(shotOf(plan, 'b2')), tm = (u0 + u1) / 2, z = frameInfo(plan, tm).camera.zoom, grown = perturb(plan, u0, u1, x => (x.id === 'hare' ? { ...x, s: x.s * 1.6 } : x));
  const h = frameInfo(grown, tm).actors.find(x => x.id === 'hare').head, dx = (plan.W / 2 - h[0]) / z, dy = (plan.H / 2 - h[1]) / z;
  const over = perturb(plan, u0, u1, x => (x.id === 'hare' ? { ...x, s: x.s * 1.6, x: x.x + dx, y: x.y + dy, key: x.y + dy } : x));
  assert.ok(lintPlan(over, { rules: ['caption-face'] }).warnings.length >= 1);
  assert.deepEqual(lintPlan(rigged(over, 'hare'), { rules: ['caption-face'] }).warnings, []);
  // a close-up frames it around its head point, as the camera does: measured the same, named without "head and shoulders"
  const [f0, f1] = mid(shotOf(plan, 'a4')), huge = perturb(plan, f0, f1, x => (x.id === 'fox' ? { ...x, s: x.s * 2.4 } : x));
  const sized = p => lintPlan(p, { rules: ['subject-size'] }).warnings.filter(i => i.shot === 'a4').map(i => i.message), faced = sized(huge), bareFox = sized(rigged(huge, 'fox'));
  assert.ok(faced.length && faced.every(m => /fox's head and shoulders region (fills|is not in frame)/.test(m)), faced.join('\n'));
  assert.deepEqual(bareFox, faced.map(m => m.replace('head and shoulders region', 'head-point region')));
});

// ───────────── kept warnings ─────────────
test('a shot\'s "lint": { "allow", "note" } keeps its warnings of those rules (with the note, no fix tried), never errors; a bad block is a film.json problem', async () => {
  const film = brokenFilm(), shot = id => film.scenes.flatMap(s => s.shots).find(s => s.id === id);
  shot('a5').lint = { allow: ['timing'], note: 'a flash of the whole meadow, on purpose' };
  shot('a1').lint = { allow: ['tangent'], note: 'feet on the frame edge: the grass line' };
  for (const id of ['a7', 'a8']) shot(id).lint = { allow: ['collision'], note: 'they bump into each other' };
  const plan = compile(await loadFilm(film));
  const r = lintPlan(plan, { rules: ['timing', 'collision'] });
  assert.deepEqual(r.warnings.filter(i => i.shot === 'a5'), []);
  const k = r.kept.filter(i => i.shot === 'a5');
  assert.equal(k.length, 1, JSON.stringify(r.kept));
  assert.equal(k[0].rule, 'timing'); assert.equal(k[0].severity, 'warning'); assert.equal(k[0].note, 'a flash of the whole meadow, on purpose');
  assert.ok(r.errors.some(i => i.shot === 'a7' && i.rule === 'collision'), 'errors are never kept');
  assert.ok(r.kept.some(i => i.shot === 'a8' && i.rule === 'collision'), 'a collision while a beat brings them together is a warning: kept');
  assert.ok(r.warnings.some(i => i.rule === 'timing' && i.shot !== 'a5'), 'other shots keep their warnings');
  assert.equal(r.stats.byRule.timing, r.warnings.filter(i => i.rule === 'timing').length);
  // a framing fault kept: no fix tried, so none in its message
  const win = mid(shotOf(plan, 'a1')), { sil } = actorAt(plan, (win[0] + win[1]) / 2, 'tortoise');
  const t = lintPlan(shove(plan, 'tortoise', win, 0, plan.H - 3 - sil.box[3]), { rules: ['tangent'] });
  assert.deepEqual(t.warnings, []);
  assert.equal(t.kept.length, 1);
  assert.match(t.kept[0].message, /^tortoise's outline ends \d px above the bottom edge of the frame \(a tangent\)( \([\d.–]+ s\))?$/);
  // the report: lint.json lists them apart, lint.jpg draws them
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-kept-'));
  try {
    const out = await writeLintReport(plan, r, dir);
    const j = JSON.parse(readFileSync(out.json, 'utf8'));
    assert.equal(j.counts.kept, r.kept.length); assert.equal(j.counts.warnings, r.warnings.length);
    assert.equal(j.kept[0].note, r.kept[0].note);
    assert.equal(out.tiles, r.errors.length + r.warnings.length + r.kept.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // malformed blocks: every problem with its path
  const bad = brokenFilm(), sh = bad.scenes[0].shots;
  sh[0].lint = { allow: ['tangent', 'floating', 'nope'] };
  sh[1].lint = { allow: 'tangent', note: 'x', why: 1 };
  sh[2].lint = ['tangent'];
  const p2 = compile(await loadFilm(bad));
  assert.throws(() => lintPlan(p2), e => {
    assert.equal(e.name, 'ValidationError');
    const m = e.problems.map(q => q.message);
    for (const re of [/^scenes\[0\]\.shots\[0\]\.lint\.allow\[1\]: "floating" is an error: errors are never kept/, /^scenes\[0\]\.shots\[0\]\.lint\.allow\[2\]: unknown rule "nope"/,
      /^scenes\[0\]\.shots\[0\]\.lint\.note: say why/, /^scenes\[0\]\.shots\[1\]\.lint\.why: unknown field/, /^scenes\[0\]\.shots\[1\]\.lint\.allow: must be a non-empty array/, /^scenes\[0\]\.shots\[2\]\.lint: must be an object/]) assert.ok(m.some(x => re.test(x)), `${re} in ${m.join('\n')}`);
    assert.equal(m.length, 6, m.join('\n'));
    return true;
  });
});

// ───────────── the moon on a head ─────────────
// (the hill's sky is open: its moon shows over the slope in a low full shot, where a meadow's trees hide it)
function moonFilm(time = 'night') {
  return { title: 'Moon', format: { width: 640, height: 360, fps: 24, captions: 'none' }, cast: { pip: { rig: 'human', params: { age: 'child' } } }, sets: { h: { kit: 'hill' } },
    scenes: [{ id: 'N', set: 'h', time, actors: { pip: { at: 'x:1180', face: 'right' } }, shots: [{ id: 'n1', camera: { size: 'full', on: ['pip'], angle: 'low' }, beats: [{ wait: 3 }] }] }] };
}

test('the sky\'s discs are where the sky paints them', async () => {
  const plan = compile(await loadFilm(moonFilm())), s = plan.shots[0], t = (s.t0 + s.t1) / 2, cam = s.cameraAt(t);
  const [d, ...more] = skyDiscs(s.set, cam, s.skyAt(t), plan.W, plan.H);
  assert.equal(more.length, 0); assert.equal(d.kind, 'moon'); assert.equal(d.a, 1);
  const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); s.set.drawSky(x, cam, s.skyAt(t), t);
  const lum = (px, py) => { const p = x.getImageData(Math.round(px), Math.round(py), 1, 1).data; return p[0] + p[1] + p[2]; };
  assert.ok(lum(d.x, d.y) > lum(d.x + 2.5 * d.r, d.y) + 150 && lum(d.x - 0.6 * d.r, d.y) > lum(d.x - 1.6 * d.r, d.y) + 100, 'a bright disc of radius r at (x, y)');
  // a morning sky has no disc (its sun is a glow), a crossfade weights them
  assert.deepEqual(skyDiscs(s.set, cam, 'morning', plan.W, plan.H), []);
  assert.equal(skyDiscs(s.set, cam, [['night', 1], ['morning', 1]], plan.W, plan.H)[0].a, 0.5);
});

test('the moon on a head is a halo, and the offset in its message moves the head off it', async () => {
  const plan = compile(await loadFilm(moonFilm())), s = plan.shots[0], win = [s.t0 + 0.3, s.t1 - 0.3], tm = (win[0] + win[1]) / 2;
  assert.equal(lintPlan(plan, { rules: ['halo'] }).warnings.length, 0, 'clear of the moon as composed');
  const { info, a } = actorAt(plan, tm, 'pip'), [d] = skyDiscs(s.set, info.camera, s.skyAt(tm), plan.W, plan.H), hh = (a.headBox[2] - a.headBox[0]) / 1.2;
  // the moon just over the crown of her head
  const put = p => shove(p, 'pip', win, d.x - a.head[0], d.y + d.r + 0.6 * hh - a.head[1]);
  const r = lintPlan(put(plan), { rules: ['halo'] }).warnings;
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].message, /the moon (sits on|stands just over|touches) pip's head like a halo .*"offset": \[-?[\d.]+, -?[\d.]+\] moves pip/);
  assert.ok(r[0].marks.some(m => m.kind === 'ellipse' && m.label === 'moon'));
  // by day there is no disc to sit on
  const day = compile(await loadFilm(moonFilm('morning')));
  assert.equal(lintPlan(put(day), { rules: ['halo'] }).warnings.length, 0);
  // the hint, applied
  const m = /"offset": \[(-?[\d.]+), (-?[\d.]+)\]/.exec(r[0].message), film = moonFilm();
  film.scenes[0].shots[0].camera.offset = [+m[1], +m[2]];
  assert.equal(lintPlan(put(compile(await loadFilm(film))), { rules: ['halo'] }).warnings.length, 0);
});

// ───────────── framing faults: what counts, and fixes that work ─────────────
// The camera change a message suggests ("offset", "zoom", "size", "angle"), or null for staging advice.
function cameraFix(msg) {
  const o = /"offset": \[(-?[\d.]+), (-?[\d.]+)\]/.exec(msg), z = /"zoom": (-?[\d.]+)/.exec(msg), s = /"size": "([\w-]+)"/.exec(msg), g = /"angle": "(\w+)"/.exec(msg);
  const fix = { ...(o ? { offset: [+o[1], +o[2]] } : {}), ...(z ? { zoom: +z[1] } : {}), ...(s ? { size: s[1] } : {}), ...(g ? { angle: g[1] } : {}) };
  return Object.keys(fix).length ? fix : null;
}
async function refilm(film, shot, fix) {
  for (const sc of film.scenes) for (const sh of sc.shots) if (sh.id === shot) sh.camera = { ...sh.camera, ...fix };
  return compile(await loadFilm(film));
}
const FRAMING = ['edge-cut', 'tangent', 'halo'];

test('a tangent is measured on the part of the drawing facing the frame: a low end leaving by the side is not at the bottom', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a3'), win = mid(s), tm = (win[0] + win[1]) / 2, W = plan.W, H = plan.H, T = LIMITS.tangent * H, z = s.cameraAt(tm).zoom;
  // the tortoise tilted (its back end down), that end leaving by the right edge 3 px above the bottom
  const tilt = (p, dx = 0, dy = 0) => perturb(p, win[0], win[1], a => (a.id === 'tortoise' ? { ...a, pitch: 0.6, x: a.x + dx / z, y: a.y + dy / z, key: a.key + dy / z } : a));
  const b = actorAt(tilt(plan), tm, 'tortoise').sil.box, w = b[2] - b[0], p = tilt(plan, W + 0.36 * w - b[2], H - 3 - b[3]), { sil } = actorAt(p, tm, 'tortoise');
  assert.ok(H - sil.box[3] < T && sil.frac >= 0.5, 'its outline\'s box ends just above the bottom');
  assert.ok(sil.edges.bottom > T && sil.edges.right < -T, `in the frame's width it ends higher, and it crosses the right edge clearly: ${JSON.stringify(sil.edges)}`);
  assert.deepEqual(lintPlan(p, { rules: ['tangent'] }).warnings.filter(i => i.shot === 'a3'), []);
});

test('touches that come and go are not held: two 0.2 s touches 0.6 s apart are no tangent; 0.7 s in one stretch is', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a1'), { sil } = actorAt(plan, (s.t0 + s.t1) / 2, 'tortoise'), dy = plan.H - 3 - sil.box[3], t0 = s.t0 + 0.5;
  const touch = (p, a) => shove(p, 'tortoise', [a, a + 0.2], 0, dy);
  assert.deepEqual(lintPlan(touch(touch(plan, t0), t0 + 0.8), { rules: ['tangent'] }).warnings, []);
  assert.equal(lintPlan(shove(plan, 'tortoise', [t0, t0 + 0.7], 0, dy), { rules: ['tangent'] }).warnings.length, 1);
});

test('a sliver of a walker at the top edge is an edge-cut (a walker is judged at the top and bottom only)', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a7'), win = mid(s), tm = (win[0] + win[1]) / 2, { sil, st } = actorAt(plan, tm, 'hare');
  assert.equal(st.action, 'walk');
  // its feet 12% of its height below the top edge, its head out
  const up = shove(plan, 'hare', win, 0, 0.12 * (sil.box[3] - sil.box[1]) - sil.box[3]);
  const r = lintPlan(up, { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a7' && i.actor === 'hare');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].message, /only a sliver of hare is in frame \(\d+% of it, at the top edge, its head out\): /);
  // (the shot's subject: the fix frames it in)
  const fix = cameraFix(r[0].message);
  assert.ok(fix, r[0].message);
  const dz = shotOf(plan, 'a7').cameraAt(tm).zoom, fixed = await refilm(brokenFilm(), 'a7', fix), k = fixed.shotAt(tm).cameraAt(tm).zoom / dz;
  const again = shove(fixed, 'hare', win, 0, (0.12 * (sil.box[3] - sil.box[1]) - sil.box[3]) * k);
  assert.deepEqual(lintPlan(again, { rules: FRAMING }).warnings.filter(i => i.shot === 'a7').map(i => i.message), []);
  // the same walker leaving by the side edge is not judged there
  const out = shove(plan, 'hare', win, plan.W - sil.box[0] - 0.12 * (sil.box[2] - sil.box[0]), 0);
  assert.equal(lintPlan(out, { rules: ['edge-cut'] }).warnings.filter(i => i.shot === 'a7' && i.actor === 'hare').length, 0);
});

test('a fix never brings a new framing fault: clearing one actor\'s edge would make another touch the opposite one', async () => {
  const { plan } = await broken();
  const s = shotOf(plan, 'a1'), win = mid(s), tm = (win[0] + win[1]) / 2, W = plan.W, z = s.cameraAt(tm).zoom;
  // the tortoise's outline 3 px inside the right edge, the hare's 14 px inside the left one: moving the picture 11 px
  // left clears the tortoise but brings the hare to 3 px
  const t = actorAt(plan, tm, 'tortoise').sil.box, h = actorAt(plan, tm, 'hare').sil.box;
  const both = p => { const d = { tortoise: (W - 3 - t[2]) / z, hare: (14 - h[0]) / z }; return perturb(p, win[0], win[1], a => (d[a.id] ? { ...a, x: a.x + d[a.id] } : a)); };
  const r = lintPlan(both(plan), { rules: FRAMING }).warnings.filter(i => i.shot === 'a1');
  assert.equal(r.length, 1, JSON.stringify(r)); assert.equal(r[0].actor, 'tortoise'); assert.equal(r[0].rule, 'tangent');
  const fix = cameraFix(r[0].message);
  assert.ok(fix, r[0].message);
  const after = lintPlan(both(await refilm(brokenFilm(), 'a1', fix)), { rules: FRAMING }).warnings.filter(i => i.shot === 'a1');
  assert.deepEqual(after.map(i => i.message), []);
});

// A pull-out from a close shot of pip to a full one (inside a window of the shot); a hare beside her, not framed.
function pullFilm(cam = {}) {
  return { title: 'Pull', format: { width: 640, height: 360, fps: 24, captions: 'none' }, cast: { pip: { rig: 'human', params: { age: 'child' } }, hare: { rig: 'hare' } }, sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 'P', set: 'm', time: 'morning', actors: { pip: { at: 'x:1180,y:1100', face: 'right' }, hare: { at: 'x:1300,y:1100', face: 'left' } },
      shots: [{ id: 'p1', camera: { size: 'close', on: ['pip'], move: 'pull-out', to: 'full', moveAt: 1, moveDur: 2.2, ...cam }, beats: [{ wait: 4 }] }] }] };
}

test('a fix is tried on the shot\'s real camera: in a pull-out, the camera change in the message, applied, frames the head in', async () => {
  const plan = compile(await loadFilm(pullFilm())), s = plan.shots[0], tm = s.t0 + 0.8 * (s.t1 - s.t0), W = plan.W;
  // the hare moved so that, at the end of the pull-out, the right edge cuts its head just past its eyes
  const { a } = actorAt(plan, tm, 'hare'), hh = (a.headBox[2] - a.headBox[0]) / 1.2, z = s.cameraAt(tm).zoom, d = (W - 0.15 * hh - a.head[0]) / z;
  const put = p => perturb(p, -1, 1e9, x => (x.id === 'hare' ? { ...x, x: x.x + d } : x));
  const r = lintPlan(put(plan), { rules: FRAMING }).warnings;
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].message, /hare's head is cut by the right edge of the frame/);
  const fix = cameraFix(r[0].message);
  assert.ok(fix, r[0].message);
  const fixed = await refilm(pullFilm(), 'p1', fix), c0 = s.cameraAt(r[0].t), c1 = fixed.shots[0].cameraAt(r[0].t);
  assert.ok(Math.abs(c1.cx - c0.cx) * c0.zoom > 10, 'the camera moves');
  assert.deepEqual(lintPlan(put(fixed), { rules: FRAMING }).warnings.map(i => i.message), []);
});

test('a camera its composition holds gets no "offset"; a staging is printed only when it lands there and works', async () => {
  // a full shot of the hare at "zoom" 1.5: its head is pinned under the top edge, the picture can't move up or down;
  // (fox: a fox standing just behind the tortoise's spot, where compile won't let it step back)
  const film = (at = 'x:1420,y:1120', fox = false) => ({ title: 'Held', format: { width: 640, height: 360, fps: 24, captions: 'none' }, cast: { hare: { rig: 'hare' }, tortoise: { rig: 'tortoise' }, fox: { rig: 'fox' } }, sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 'A', set: 'm', time: 'morning', actors: { ...(fox ? { fox: { at: 'x:1420,y:1090', face: 'left' } } : {}), hare: { at: 'x:1200,y:1100', face: 'right' }, tortoise: { at, face: 'left' } },
      shots: [{ id: 'h1', camera: { size: 'full', on: ['hare'], zoom: 1.5 }, beats: [{ wait: 3 }] }] }] });
  for (const fox of [false, true]) {
    const plan = compile(await loadFilm(film(undefined, fox))), s = plan.shots[0], win = [0.5, 2.5], tm = 1.5, z = s.cameraAt(tm).zoom;
    // the tortoise (not framed) 200 px left and its feet 4 px above the bottom
    const { sil } = actorAt(plan, tm, 'tortoise'), dy = (plan.H - 4 - sil.box[3]) / z;
    const put = p => perturb(p, win[0], win[1], a => (a.id === 'tortoise' ? { ...a, x: a.x - 200 / z, y: a.y + dy, key: a.key + dy } : a));
    const r = lintPlan(put(plan), { rules: FRAMING }).warnings;
    assert.equal(r.length, 1, JSON.stringify(r)); assert.equal(r[0].rule, 'tangent');
    assert.equal(cameraFix(r[0].message), null, r[0].message);
    const m = /stage tortoise about (\d+) px (further back|nearer) \(y [−+] \d+\)/.exec(r[0].message);
    if (fox && !m) { assert.match(r[0].message, /no "offset" or simple move of tortoise clears it here/); continue; }
    assert.ok(m, r[0].message);
    // applied: the tortoise stands where the message says, and the tangent is gone
    const y = 1120 + (m[2] === 'nearer' ? 1 : -1) * +m[1], moved = compile(await loadFilm(film(`x:1420,y:${y}`, fox))), t = moved.actorsAt(tm, 'A').find(a => a.id === 'tortoise');
    assert.ok(Math.abs(t.x - 1420) < 2 && Math.abs(t.y - y) < 2, `staged at (1420, ${y}), it lands at (${t.x}, ${t.y})`);
    assert.deepEqual(lintPlan(put(moved), { rules: FRAMING }).warnings.map(i => i.message), []);
  }
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
    assert.deepEqual(Object.keys(j.fixes), Object.keys(RULES)); assert.equal(j.fixes.halo, RULES.halo.fix);
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
