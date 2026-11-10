// Camera (round 5): the staging warning for an actor dwarfed by what it is framed with (an anchor, a much bigger
// actor); close shots that follow a long-held gesture (its head and ears in frame while it lasts, the shot's own
// composition before and after) and ignore a short apex (a jump) or a held head that fits anyway; static frames that
// depend on their subjects only (a head cut by the edge is lint's to report).
// Round 6: framing part of a subject: a zoom above 1 on a subject without a face crops into it and its offset moves
// the frame as given (no head to keep above the captions); a "focus" frames a point of the subjects' box, their head or
// a world point; "on" takes world points (one in the air is framed as itself), and check validates both.
//   node --test test/camera.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { frameInfo } from '../engine/film/frame.mjs';
import { heldOffsets, HOLD, FLAT, frameSubjects, CAPTION_BAND } from '../engine/film/camera.mjs';
import { getRig, register } from '../engine/cast/index.mjs';
import { makeRig } from '../engine/cast/rig.mjs';

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

// ───────────── 4. framing part of a subject ─────────────
const W6 = 1920, H6 = 1080, scr = (c, p) => [(p[0] - c.cx) * c.zoom + W6 / 2, (p[1] - c.cy) * c.zoom + H6 / 2];
const close6 = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// a planet: rings wider than the frame allows at a full shot, its "head" the whole globe, no face (the Saturn chapter's)
const planet = faceless => ({ id: 'p', box: [1315, 772, 1885, 1000], head: [1600, 878], hh: 264, face: 1, faceless });
test('framing part of a subject: a zoom above 1 on a subject without a face crops into it; its offset moves the frame as given', () => {
  const F = (o = {}, faceless = true) => frameSubjects([planet(faceless)], 'full', { W: W6, H: H6, ...o });
  const F1 = F(), Fz = F({ zoomK: 1.6 }), Fo = F({ zoomK: 1.6, offset: [-0.3, 0.1] });
  close6(Fz.zoom / F1.zoom, 1.6, 'the zoom is 1.6 × the full shot (not held back by the globe over the captions)', 1e-9);
  // the crop closes in on the full shot's composition: the middle of the planet stays where the full shot puts it
  const mid = [1600, 886], a = scr(F1, mid), b = scr(Fz, mid);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1, `the crop is about the composition (${a.map(Math.round)} vs ${b.map(Math.round)})`);
  // the offset as given: the planet 0.3 of the frame to the left and 0.1 down, its left side out of frame
  const c = scr(Fz, mid), d = scr(Fo, mid);
  close6(d[0] - c[0], -0.3 * W6, 'offset x', 1e-6); close6(d[1] - c[1], 0.1 * H6, 'offset y', 1e-6);
  assert.ok(scr(Fo, [1315, 886])[0] < -W6 / 4, 'the rings\' left end is well out of frame');
  // a subject with a face keeps its head (here the globe) above the caption band, zoom or not
  for (const o of [{}, { zoomK: 1.6 }, { zoomK: 1.6, offset: [-0.3, 0.1] }]) {
    const f = F(o, false);
    assert.ok(scr(f, [1600, 878 + 0.55 * 264])[1] <= CAPTION_BAND * H6 + 1, `with a face, ${JSON.stringify(o)}: the head clears the captions`);
  }
});

test('framing part of a subject: a focus (a point of the subjects\' box, their head or a world point) is framed at the centre, closer by the zoom', () => {
  // a standing figure (a face): its box and head
  const fig = { id: 'n', box: [1000, 600, 1120, 1000], head: [1070, 650], hh: 80, face: 1 };
  const F = o => frameSubjects([fig], 'full', { W: W6, H: H6, ...o }), F1 = F();
  for (const [focus, P] of [[[0.5, 0.95], [1060, 980]], ['head', [1070, 650]], ['x:1300,y:500', [1300, 500]]]) {
    const f = F({ focus, zoomK: 2 }), p = scr(f, P);
    close6(f.zoom / F1.zoom, 2, `${JSON.stringify(focus)}: 2 × the full shot's zoom`, 1e-9);
    close6(p[0], W6 / 2, `${JSON.stringify(focus)}: centred`, 1e-6); close6(p[1], H6 / 2, `${JSON.stringify(focus)}: centred`, 1e-6);
    // ... and moved by the offset
    const g = F({ focus, zoomK: 2, offset: [0.1, -0.1] }), q = scr(g, P);
    close6(q[0], 0.6 * W6, 'offset x', 1e-6); close6(q[1], 0.4 * H6, 'offset y', 1e-6);
  }
  // the feet close up: the head is cut (asked for), not held in frame
  assert.ok(scr(F({ focus: [0.5, 0.95], zoomK: 2 }), fig.head)[1] < 0, 'the head is above the frame');
  // zoom 1: the size's zoom, the focus centred; an establishing view centres on it too
  close6(F({ focus: 'head' }).zoom, F1.zoom, 'zoom 1 with a focus', 1e-9);
  const E = frameSubjects([fig], 'establishing', { W: W6, H: H6, focus: 'x:1300,y:500' });
  assert.deepEqual([E.cx, E.cy, ...E.target], [1300, 500, 1300, 500], 'establishing: the view and its zoom target on the focus');
});

test('framing part of a subject: a rig without a face is framed as one; a focus holds through a push-in', async () => {
  // a tortoise that is a prop (only the neutral expression): a zoom above 1 and an offset are taken as given
  if (!getRig('shell')) register(makeRig({ ...getRig('tortoise'), kind: 'shell', label: 'Shell', expressions: ['neutral'] }));
  const mk = (rig, camera) => tiny({ W: W6, H: H6, cast: { a: { rig, scale: 1.3 } }, actors: { a: { at: 'x:1400', face: 'right' } }, shots: [{ id: 's', camera: { size: 'full', on: ['a'], ...camera }, beats: [{ wait: 2 }] }] });
  const cam = async (rig, camera) => { const p = compile(await loadFilm(mk(rig, camera))), s = shotOf(p, 's'); return { c: s.cameraAt(s.t0 + 1), a: frameInfo(p, s.t0 + 1).actors.find(a => a.id === 'a') }; };
  const one = await cam('shell'), z = await cam('shell', { zoom: 1.6 }), o = await cam('shell', { zoom: 1.6, offset: [-0.3, 0.1] });
  close6(z.c.zoom / one.c.zoom, 1.6, 'shell: the zoom is taken as given', 1e-6);
  close6(o.a.contact.screen[0] - z.a.contact.screen[0], -0.3 * W6, 'shell: offset x', 0.5); close6(o.a.contact.screen[1] - z.a.contact.screen[1], 0.1 * H6, 'shell: offset y', 0.5);
  // the same tortoise with a face: its head stays above the captions with the same camera
  const t = await cam('tortoise', { zoom: 1.6, offset: [-0.3, 0.1] });
  assert.ok(t.a.headBox[3] <= CAPTION_BAND * H6 + 1 && t.a.headBox[1] >= 0, `tortoise: the head in frame, above the captions (${t.a.headBox.map(Math.round)})`);
  // a focus on a world point, pushing in about it: centred all the way
  const p = compile(await loadFilm(mk('tortoise', { focus: 'x:1500,y:900', move: 'push-in', zoomTo: 1.5 }))), s = shotOf(p, 's');
  for (const u of [0, 0.5, 0.99]) { const c = s.cameraAt(s.t0 + u * (s.t1 - s.t0)), q = scr(c, [1500, 900]); assert.ok(Math.hypot(q[0] - W6 / 2, q[1] - H6 / 2) < 1, `push-in, u=${u}: the focus at the centre (${q.map(Math.round)})`); }
  assert.ok(s.cameraAt(s.t1 - 1e-3).zoom > 1.45 * s.cameraAt(s.t0).zoom, 'it pushes in');
  // a close shot with a focus is not moved by a held gesture (the mouse's feet at the centre: sitting up to gasp takes
  // her head out of the top, and is followed without a focus)
  const g = gestureClose('mouse', 'gasp', 1.15); g.scenes[0].shots[0].camera.focus = 'x:1400,y:1060';
  const gs = shotOf(compile(await loadFilm(g)), 'c'), c0 = gs.cameraAt(gs.t0);
  for (let u = 0; u < 5; u += 0.25) camEq(gs.cameraAt(gs.t0 + u), c0, H6, `gasp with a focus, t=${u}`);
});

test('framing part of a subject: a track keeps a crop\'s offset (it does not pull the subject back to the middle)', async () => {
  if (!getRig('shell')) register(makeRig({ ...getRig('tortoise'), kind: 'shell', label: 'Shell', expressions: ['neutral'] }));
  const film = tiny({ W: W6, H: H6, cast: { a: { rig: 'shell', scale: 1.3 } }, actors: { a: { at: 'x:1400', face: 'right' } }, shots: ['static', 'track'].map(move => ({ id: move, camera: { size: 'full', on: ['a'], zoom: 1.6, offset: [-0.3, 0.1], move }, beats: [{ wait: 2 }] })) });
  const p = compile(await loadFilm(film)), a = shotOf(p, 'static'), b = shotOf(p, 'track');
  for (const u of [0.1, 0.5, 0.9]) camEq(b.cameraAt(b.t0 + u * (b.t1 - b.t0)), a.cameraAt(a.t0 + 1), H6, `track at ${u}: the crop with its offset`);
});

test('camera "on" takes world points (a point in the air is framed as itself); check validates "on", "toOn" and "focus"', async () => {
  // a point in the air over the hill, with someone on the ground: framed whole, the point near the middle, at a sane zoom
  const film = (camera, extra = {}) => tiny({ set: 'hill', W: W6, H: H6, cast: { june: { rig: 'human' } }, actors: { june: { at: 'x:2500', face: 'right' } }, shots: [{ id: 'k', camera, beats: [{ wait: 1 }], ...extra }] });
  const p = compile(await loadFilm(film({ size: 'wide', on: ['x:2700,y:450'] }))), s = shotOf(p, 'k'), c = s.cameraAt(s.t0 + 0.5), q = scr(c, [2700, 450]);
  assert.ok(Math.abs(q[0] - W6 / 2) < 2 && q[1] > 0.3 * H6 && q[1] < 0.7 * H6, `the point is framed in the middle (${q.map(Math.round)})`);
  assert.ok(c.zoom > 0.6 && c.zoom < 3, `at the size things have on the hill (zoom ${c.zoom.toFixed(2)})`);
  // a pair: June and a point in the air above her; a pull-out ending on a point
  await loadFilm(film({ size: 'full', on: ['june', 'x:2600,y:500'] }));
  await loadFilm(film({ size: 'close', on: ['june'], move: 'pull-out', to: 'wide', toOn: ['june', 'x:2600'] }));
  await loadFilm(film({ size: 'full', on: ['june'], focus: [0.5, 0.2], zoom: 2 }));
  await loadFilm(film({ size: 'full', on: ['june'], focus: 'head' }));
  await loadFilm(film({ size: 'full', on: ['june'], focus: 'x:2550,y:700' }));
  const problems = async camera => { try { await loadFilm(film(camera)); return []; } catch (e) { return (e.problems || [{ path: String(e) }]).map(q => q.path); } };
  const P = 'scenes[0].shots[0].camera';
  for (const focus of [[0.5], [1.5, 0.5], [0.5, '0'], 'feet', 'x:2500', 'june', 'x:99999,y:500'])
    assert.deepEqual(await problems({ size: 'full', on: ['june'], focus }), [`${P}.focus`], `focus ${JSON.stringify(focus)}`);
  assert.deepEqual(await problems({ size: 'full', on: ['june', 'nowhere'] }), [`${P}.on[1]`]);
  assert.deepEqual(await problems({ size: 'full', on: ['x:99999,y:500'] }), [`${P}.on[0]`], 'far outside the set');
  assert.deepEqual(await problems({ size: 'full', on: ['june'], move: 'push-in', to: 'close', toOn: ['x:2600,y:abc'] }), [`${P}.toOn[0]`]);
});
