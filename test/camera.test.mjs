// Camera (round 5): the staging warning for an actor dwarfed by what it is framed with (an anchor, a much bigger
// actor); close shots that follow a long-held gesture (its head and ears in frame while it lasts, the shot's own
// composition before and after) and ignore a short apex (a jump) or a held head that fits anyway; static frames that
// depend on their subjects only (a head cut by the edge is lint's to report).
//   node --test test/camera.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { frameInfo } from '../engine/film/frame.mjs';
import { heldOffsets, HOLD, FLAT } from '../engine/film/camera.mjs';

function tiny({ set = 'meadow', actors, shots, cast = {}, W = 640, H = 360 }) {
  return {
    title: 'Tiny', format: { width: W, height: H, fps: 24, captions: 'dialogue' },
    voices: { narrator: { voice: 'Sulafat' } },
    cast: { hare: { rig: 'hare' }, tortoise: { rig: 'tortoise', scale: 1.3 }, ...cast },
    sets: { m: { kit: set } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors, shots }],
  };
}
const shotOf = (plan, id) => plan.shots.find(s => s.id === id);
// the part of a screen box inside the frame
const inFrame = (b, W, H) => (Math.max(0, Math.min(W, b[2]) - Math.max(0, b[0])) * Math.max(0, Math.min(H, b[3]) - Math.max(0, b[1]))) / ((b[2] - b[0]) * (b[3] - b[1]));

// ───────────── 1. an actor dwarfed by what it is framed with ─────────────
test('staging: an actor framed with an anchor or a much bigger actor far under its own size is flagged; a normal pair is not', async () => {
  const mouse = { tilly: { rig: 'mouse', scale: 1.15 } };
  // a mouse and the den in the oak (glim-c 1.3): the den sets the framing and the mouse reads at a sixth of a full shot
  const den = compile(await loadFilm(tiny({ set: 'forest', cast: mouse, actors: { tilly: { at: 'x:1820', face: 'left' } }, shots: [{ id: 'd', camera: { size: 'full', on: ['tilly', 'den'] }, beats: [{ wait: 2 }] }] })));
  const w = den.warnings.find(m => m.startsWith('d: the full shot of tilly, den shows tilly at'));
  assert.ok(w, den.warnings.join('; ') || 'no warning');
  assert.match(w, /den sets the framing/);
  // a mouse beside a woman in a full two-shot: the woman sets the framing
  const big = compile(await loadFilm(tiny({ cast: { ...mouse, nan: { rig: 'human' } }, actors: { nan: { at: 'x:1250,y:1060', face: 'right' }, tilly: { at: 'x:1400,y:1060', face: 'left' } }, shots: [{ id: 'b', camera: { size: 'full', on: ['nan', 'tilly'] }, beats: [{ wait: 2 }] }] })));
  assert.ok(big.warnings.some(m => m.startsWith('b: the full shot of nan, tilly shows tilly at') && /nan sets the framing/.test(m)), big.warnings.join('; ') || 'no warning');
  // a squirrel beside the tortoise (a pair the size of Seventy-Six Summers' Fidget and Pebble) and a hare beside it
  const pair = compile(await loadFilm(tiny({ cast: { pip: { rig: 'squirrel' } }, actors: { tortoise: { at: 'x:1250,y:1060', face: 'right' }, pip: { at: 'x:1450,y:1060', face: 'left' }, hare: { at: 'x:1000,y:1060', face: 'right' } },
    shots: [{ id: 'p', camera: { size: 'full', on: ['tortoise', 'pip'] }, beats: [{ wait: 2 }] }, { id: 'h', camera: { size: 'medium', on: ['hare', 'tortoise'] }, beats: [{ wait: 2 }] }] })));
  assert.deepEqual(pair.warnings, []);
});

// ───────────── 2. gestures that hold the head somewhere else ─────────────
// a static close shot of one actor (1920×1080, 5 s) making a gesture at 1.5 s (none: just waiting)
const gestureClose = (rig, name, scale = 1) => tiny({ W: 1920, H: 1080, cast: { a: { rig, scale } }, actors: { a: { at: 'x:1400,y:1060', face: 'left' } },
  shots: [{ id: 'c', camera: { size: 'close', on: ['a'] }, beats: name ? [{ wait: 1.5 }, { do: 'gesture', who: 'a', name }] : [{ wait: 5 }], dur: 5 }] });
const camEq = (a, b, H, msg) => assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) * b.zoom < 0.5 && Math.abs(a.zoom / b.zoom - 1) < 1e-4, `${msg}: (${a.cx.toFixed(1)}, ${a.cy.toFixed(1)}, ${a.zoom.toFixed(2)}) vs (${b.cx.toFixed(1)}, ${b.cy.toFixed(1)}, ${b.zoom.toFixed(2)})`);
test('close shots: a held gesture (the mouse sits up to gasp) is followed with its ears in frame, and only while it lasts', async () => {
  const plan = compile(await loadFilm(gestureClose('mouse', 'gasp', 1.15))), s = shotOf(plan, 'c'), W = plan.W, H = plan.H;
  const still = shotOf(compile(await loadFilm(gestureClose('mouse', null, 1.15))), 'c');
  // the shot keeps its own composition (the resting head where it was composed) before the gesture and after it (the
  // frame eases out over 0.5 s, from 0.15 s before the head leaves it, and back after)
  for (const u of [0, 0.3, 0.6, 3.5, 4.2, 4.9]) camEq(s.cameraAt(s.t0 + u), still.cameraAt(still.t0 + u), H, `t=${u}: the frame is the shot's own`);
  // the gasp: 1.2 s from 1.5 s, held (sat up) from about 1.65 s to 2.35 s: the head, ears and all, is in frame
  for (let t = s.t0 + 1.65; t < s.t0 + 2.35; t += 1 / 24) {
    const a = frameInfo(plan, t).actors.find(a => a.id === 'a');
    assert.ok(inFrame(a.headBox, W, H) > 0.999 && a.screenBox[1] >= 0, `t=${(t - s.t0).toFixed(2)}: the gasping head is ${(inFrame(a.headBox, W, H) * 100).toFixed(0)}% in frame, its top at ${a.screenBox[1].toFixed(0)}`);
  }
  // ... and the frame gets there and back smoothly, never a jump, with the head in frame all the way
  let prev = null;
  for (let t = s.t0; t < s.t1; t += 1 / 24) {
    const c = s.cameraAt(t), a = frameInfo(plan, t).actors.find(a => a.id === 'a');
    if (prev) assert.ok(Math.hypot(c.cx - prev.cx, c.cy - prev.cy) * c.zoom < 0.06 * H && Math.abs(Math.log(c.zoom / prev.zoom)) < 0.04, `t=${(t - s.t0).toFixed(2)}: the frame jumps`);
    assert.ok(inFrame(a.headBox, W, H) > 0.95, `t=${(t - s.t0).toFixed(2)}: the head is ${(inFrame(a.headBox, W, H) * 100).toFixed(0)}% in frame`);
    prev = c;
  }
});

test('close shots: a long move (a deer grazing) pulls back only while it lasts; a jump\'s apex and a held head that fits do not move the frame', async () => {
  const still = shotOf(compile(await loadFilm(gestureClose('deer', null))), 'c');
  const plan = compile(await loadFilm(gestureClose('deer', 'graze'))), s = shotOf(plan, 'c');
  for (const u of [0, 0.5, 4.9]) camEq(s.cameraAt(s.t0 + u), still.cameraAt(still.t0 + u), plan.H, `graze, t=${u}: the close shot is still a close shot`);
  for (let t = s.t0 + 1.5; t < s.t0 + 3.9; t += 1 / 12) {
    const a = frameInfo(plan, t).actors.find(a => a.id === 'a');
    assert.ok(inFrame(a.headBox, plan.W, plan.H) > 0.95, `graze, t=${(t - s.t0).toFixed(2)}: the head is ${(inFrame(a.headBox, plan.W, plan.H) * 100).toFixed(0)}% in frame`);
  }
  // a jump (the deer's lasts 1.1 s, airborne for half of it) frames like no gesture at all
  const jump = shotOf(compile(await loadFilm(gestureClose('deer', 'jump'))), 'c');
  for (let u = 0; u < 5; u += 0.25) camEq(jump.cameraAt(jump.t0 + u), still.cameraAt(still.t0 + u), plan.H, `jump, t=${u}`);
  // a fox's bow holds its head lower, still in the frame: the framing stays on the resting head
  const fox = async name => shotOf(compile(await loadFilm(gestureClose('fox', name))), 'c'), fs = await fox(null), bow = await fox('bow');
  for (let u = 0; u < 5; u += 0.25) camEq(bow.cameraAt(bow.t0 + u), fs.cameraAt(fs.t0 + u), plan.H, `bow, t=${u}`);
});

test('heldOffsets: only a place the head holds for HOLD seconds counts, not the arc of a jump', () => {
  const ts = Array.from({ length: 25 }, (_, i) => i / 8), mk = f => ts.map(t => ({ head: [0, -f(t)], rest: [0, 0], hh: 20 }));
  const sitUp = t => (t >= 0.25 && t < 1.25 ? 10 : 0), hop = t => (t >= 1 && t < 1.3 ? 20 : 0);
  const a = heldOffsets(mk(sitUp), ts).map(v => v[1]), b = heldOffsets(mk(hop), ts).map(v => v[1]), c = heldOffsets(mk(t => sitUp(t) + (t > 0.5 && t < 0.7 ? 30 : 0)), ts).map(v => v[1]);
  assert.equal(Math.min(...a), -10, 'a second sitting up is kept');
  assert.equal(Math.min(...b), 0, `a ${0.3} s hop is not (HOLD ${HOLD} s)`);
  assert.equal(Math.min(...c), -10, 'a quick bob on top of the held offset is not');
  // a jump: 0.7 s in the air, 1.5 head heights at the top; it is above 0.5 head heights for over HOLD s, but never holds
  // a place (FLAT)
  const arc = t => (t >= 1 && t < 1.7 ? 30 * (1 - ((t - 1.35) / 0.35) ** 2) : 0);
  assert.equal(Math.min(...heldOffsets(mk(arc), ts).map(v => v[1])), 0, `a jump's arc is not held (FLAT ${FLAT} head heights)`);
  // moving samples are never gestures
  assert.deepEqual(heldOffsets(mk(sitUp).map(s => ({ ...s, moving: true })), ts).map(v => v[1]), ts.map(() => 0));
});

// ───────────── 3. heads cut by the edge of the frame: left to lint ─────────────
test('static frames are composed for their subjects only: a bystander whose head the edge cuts does not move them', async () => {
  // a full shot of the hare; a boy stands behind it, his head across the top edge of the frame (the camera only knows
  // estimated heads, which can be far from the drawn ones, so a cut head is lint's to report: edge-cut)
  const mk = boy => tiny({ cast: { nan: { rig: 'human' } }, actors: { hare: { at: 'x:1400,y:1080', face: 'left' }, ...(boy ? { nan: { at: 'x:1300,y:1000', face: 'right' } } : {}) }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, beats: [{ wait: 2 }] }] });
  const a = shotOf(compile(await loadFilm(mk(true))), 'a'), b = shotOf(compile(await loadFilm(mk(false))), 'a');
  camEq(a.cameraAt(a.t0 + 1), b.cameraAt(b.t0 + 1), 360, 'the frame');
});
