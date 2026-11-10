// Flying through space (DESIGN §10, §11): a faceless subject gets no lead room (a dolly toward it keeps it centred
// across the frame), a dolly in keeps its subjects in frame to its end, near things pass the lens (whole until they
// truly reach it, never a small see-through ghost mid-frame), the space kit's near field of specks at every depth
// streams past a camera moving through depth (and only then), and a body staged on the camera's path grows as it
// swings past.
//   node --test test/flight.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { depthFade, LENS, PASS, PASS_FADE } from '../engine/film/camera.mjs';
import { getKit } from '../engine/set/kits/index.mjs';

const film = ({ actors, shots, cast = {}, set = 'space', params, W = 480, H = 270 }) => ({
  title: 'Flight', format: { width: W, height: H, fps: 24, captions: 'none' }, voices: {},
  cast: { saturn: { rig: 'planet', scale: 2.5, params: { body: 'saturn' } }, titan: { rig: 'planet', scale: 0.11, params: { body: 'titan' } }, hare: { rig: 'hare' }, ...cast },
  sets: { m: { kit: set, ...(params ? { params } : {}) } },
  scenes: [{ id: 's1', set: 'm', time: set === 'space' ? 'space' : 'morning', ambience: 'none', music: 'none', actors, shots }],
});
const plan = async f => compile(await loadFilm(f));
const shotOf = (p, id) => p.shots.find(s => s.id === id);
const actorAt = (p, t, id) => frameInfo(p, t).actors.find(a => a.id === id);
const mid = b => (b[0] + b[2]) / 2;
const pixels = (p, t) => { const c = createCanvas(p.W, p.H), x = c.getContext('2d'); drawFrame(x, p, t); return x.getImageData(0, 0, p.W, p.H).data; };

// ───────────── lead room ─────────────
test('a faceless subject gets no lead room: a planet is centred whichever way it "faces", and a dolly toward it keeps it so', async () => {
  const p = await plan(film({ actors: { saturn: { at: 'centre', face: 'right' } }, shots: [
    { id: 'still', camera: { size: 'wide', on: ['saturn'] }, dur: 1, beats: [] },
    { id: 'dolly', camera: { size: 'wide', on: ['saturn'], z: 0, zTo: 1500 }, dur: 3, beats: [] },
  ] }));
  const W = p.W, s = shotOf(p, 'still'), d = shotOf(p, 'dolly');
  const box = actorAt(p, s.t0 + 0.5, 'saturn').screenBox;
  assert.ok(Math.abs(mid(box) - W / 2) < 1, `centred: its middle at ${mid(box).toFixed(1)} of ${W}`);
  const end = actorAt(p, d.t1 - 1e-3, 'saturn').screenBox;
  assert.ok(Math.abs(mid(end) - W / 2) < 1 && end[0] >= 0 && end[2] <= W, `the dolly ends with it whole across the frame: ${end.map(Math.round)}`);
  // its face does not matter, alone or beside a figure with a face (whose lead room stays)
  const two = async face => (await plan(film({ set: 'meadow', actors: { hare: { at: 'x:1300,y:1060', face: 'right' }, saturn: { at: 'x:1700,y:1060', face } },
    shots: [{ id: 'a', camera: { size: 'wide', on: ['hare', 'saturn'] }, dur: 1, beats: [] }, { id: 'b', camera: { size: 'wide', on: ['saturn'] }, dur: 1, beats: [] }] }))).shots.map(q => q.cameraAt(q.t0 + 0.5));
  assert.deepEqual(await two('left'), await two('right'));
  const hare = await plan(film({ set: 'meadow', actors: { hare: { at: 'x:1300,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, dur: 1, beats: [] }] }));
  assert.ok(W / 2 - mid(actorAt(hare, 0.5, 'hare').screenBox) > 0.04 * W, 'a figure with a face keeps its lead room');
});

test('a dolly in along the camera\'s axis keeps its subjects in frame to its end (composed nearer the centre, the vanishing point)', async () => {
  const p = await plan(film({ W: 1920, H: 1080, actors: { saturn: { at: 'centre', face: 'right' }, hare: { at: 'ground_east', face: 'right' } }, shots: [
    { id: 'wide', camera: { size: 'wide', on: ['saturn'], z: 0, zTo: 1500 }, dur: 3, beats: [] },
    { id: 'still', camera: { size: 'wide', on: ['saturn'] }, dur: 1, beats: [] },
    { id: 'full', camera: { size: 'full', on: ['saturn'], zTo: 1500 }, dur: 3, beats: [] },
    { id: 'hare', camera: { size: 'wide', on: ['hare'], zTo: 1500 }, dur: 3, beats: [] },
  ] }));
  const W = p.W, H = p.H, inside = b => b[0] >= -0.5 && b[1] >= -0.5 && b[2] <= W + 0.5 && b[3] <= H + 0.5;
  const w = shotOf(p, 'wide');
  for (let t = w.t0; t < w.t1; t += 1 / 8) { const b = actorAt(p, t, 'saturn').screenBox; assert.ok(inside(b), `whole at ${t.toFixed(2)}: ${b.map(Math.round)}`); }
  const end = actorAt(p, w.t1 - 1e-3, 'saturn').screenBox;
  assert.ok(end[3] - end[1] > 0.45 * H, `and it grows: ${end.map(Math.round)}`);
  // a still shot is composed as before (lower in the frame, as a wide shot puts it)
  const st = actorAt(p, shotOf(p, 'still').t0 + 0.5, 'saturn').screenBox;
  assert.ok((st[1] + st[3]) / 2 > (actorAt(p, w.t0, 'saturn').screenBox[1] + actorAt(p, w.t0, 'saturn').screenBox[3]) / 2 + 10);
  // one that can't stay whole (it ends bigger than the frame) flies at the frame centre
  const f = shotOf(p, 'full'), b0 = actorAt(p, f.t0, 'saturn').screenBox, b1 = actorAt(p, f.t1 - 1e-3, 'saturn').screenBox;
  for (const b of [b0, b1]) assert.ok(Math.abs(mid(b) - W / 2) < 0.01 * W && Math.abs((b[1] + b[3]) / 2 - H / 2) < 0.01 * H, `centred: ${b.map(Math.round)}`);
  // a figure with a face too, keeping some lead room
  const h = shotOf(p, 'hare');
  for (let t = h.t0; t < h.t1; t += 1 / 8) { const a = actorAt(p, t, 'hare'); assert.ok(inside(a.screenBox), `the hare whole at ${t.toFixed(2)}: ${a.screenBox.map(Math.round)}`); }
  assert.ok(mid(actorAt(p, h.t1 - 1e-3, 'hare').screenBox) < W / 2 - 0.02 * W, 'with room ahead of it');
});

// ───────────── passing the lens ─────────────
test('near things pass the lens: whole until PASS_FADE × the lens from it, gone by PASS × it', () => {
  const D = 2000, cam = { cx: 0, cy: 0, zoom: 1, z: 500, lens: D }, at = f => -D + 500 + f * D;   // the z at distance f·D
  for (const f of [0.25, 0.2, 0.1, PASS_FADE + 1e-3]) assert.equal(depthFade(cam, at(f)), 1, `whole at ${f} of the lens`);
  assert.equal(depthFade(cam, at(PASS - 1e-3)), 0);
  const half = depthFade(cam, at((PASS + PASS_FADE) / 2));
  assert.ok(half > 0.3 && half < 0.7, `half way through the fade: ${half}`);
  assert.ok(PASS_FADE <= 0.05, 'a thing is at least 20× its stage size before it fades');
});

test('a depth piece in the middle of the frame stays opaque as the camera nears it (no see-through ghost)', async () => {
  const p = await plan(film({ set: 'meadow', actors: { hare: { at: 'x:1400,y:1060', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'], zTo: 1000 }, dur: 4, beats: [] }] }));
  const s = shotOf(p, 'a'), t = s.t0 + 2.5, cam = s.cameraAt(t);
  // a red square at the frame's centre, f × the lens in front of the camera
  let f = 0.6;
  p.overlays.push({ scene: 's1', name: 'sq', params: {}, layer: 'depth', seed: 1, t0: 0, t1: p.duration, def: { layer: 'depth', draw(ctx, api) {
    api.item([api.cam.cx, api.cam.cy, cam.z - LENS + f * LENS], (c, P) => { const h = 20 / P.s; c.fillStyle = '#ff0000'; c.fillRect(api.cam.cx - h, api.cam.cy - h, 2 * h, 2 * h); });
  } } });
  const j = ((p.H / 2) * p.W + p.W / 2) * 4, far = pixels(p, t).slice(j, j + 3);
  assert.ok(far[0] > 150 && far[1] < 80, `red: ${far}`);
  f = 0.18;
  assert.deepEqual(pixels(p, t).slice(j, j + 3), far, 'as whole near the lens as farther off');
});

// ───────────── the near field ─────────────
test('the space kit has a near field of specks at every depth (dust: 0 or false turns it off), fixed in the world through a shot', () => {
  const S = getKit('space')({}), W = 960, H = 540, D = LENS, dt = 1 / 24;
  // (the camera a frame before, dz nearer the stage: a dolly keeps zoom × (D − z), the lens zoom)
  const back = (c, dz = 40) => ({ ...c, z: c.z - dz, zoom: (c.zoom * (D - c.z)) / (D - c.z + dz) });
  const ref = { cx: 1600, cy: 900, zoom: 0.5, z: 0, lens: LENS };
  for (const dust of [0, false]) assert.deepEqual(getKit('space')({ dust }).fieldSpecks(ref, ref, back(ref), W, H, dt), []);
  const a = S.fieldSpecks(ref, ref, back(ref), W, H, dt);
  assert.ok(a.length > 150 && a.length < 1200, `${a.length} specks`);
  assert.ok(a.some(q => q.z < -0.5 * D) && a.some(q => q.z > 0.4 * D), 'from near the lens to far beyond the stage');
  // a shot starts with the same look at any zoom (the field is scaled to its first camera)
  const close = { ...ref, zoom: 2.5 }, c = S.fieldSpecks(close, close, back(close), W, H, dt).length;
  assert.ok(Math.abs(c / a.length - 1) < 0.2, `${c} at zoom 2.5 vs ${a.length}`);
  // a dolly: every speck moves out from the frame centre by its distance's ratio (the nearer, the more), the far ones
  // hardly at all, like the sky
  const at400 = { ...ref, zoom: ref.zoom * D / (D - 400), z: 400 }, b = S.fieldSpecks(at400, ref, back(at400), W, H, dt), by = new Map(a.map(q => [q.id, q]));
  let n = 0, near = 0, far = 0;
  for (const q of b) {
    const o = by.get(q.id); if (!o) continue;
    const r0 = Math.hypot(o.x - W / 2, o.y - H / 2), r1 = Math.hypot(q.x - W / 2, q.y - H / 2), want = (D + q.z) / (D + q.z - 400);
    if (r0 > 5) { assert.ok(Math.abs(r1 / r0 - want) < 1e-6, `speck ${q.id}: ${r1 / r0} vs ${want}`); n++; }
    if (q.z < -0.5 * D) near = Math.max(near, want); else if (q.z > 0.4 * D) far = Math.max(far, want);
    assert.ok(q.streak > 0 || r0 <= 5, 'and streaks with the move');
  }
  assert.ok(n > 100 && near > 1.5 && far < 1.25, `${n} specks; nearest grow ${near.toFixed(2)}×, the far ones ${far.toFixed(2)}×`);
  // a bad dust says so, by its name
  for (const dust of [-1, 'off', '2']) assert.throws(() => getKit('space')({ dust }), /dust must be a number ≥ 0 or false/);
});

test('the near field shows only while the camera moves through depth: a still shot, a pan or a lens zoom shows none, nothing on a planet', async () => {
  const S = getKit('space')({}), W = 960, H = 540, D = LENS, dt = 1 / 24, ref = { cx: 1600, cy: 900, zoom: 0.5, z: 0, lens: D };
  assert.deepEqual(S.fieldSpecks(ref, ref, ref, W, H, dt), [], 'still');
  assert.deepEqual(S.fieldSpecks(ref, ref, { ...ref, cx: ref.cx - 30 }, W, H, dt), [], 'a pan');
  assert.deepEqual(S.fieldSpecks(ref, ref, { ...ref, zoom: 0.48 }, W, H, dt), [], 'a lens zoom');
  assert.deepEqual(S.fieldSpecks(ref, ref, { ...ref, z: -40 }, W, H, 0), [], 'no time between them');
  // faded in with the camera's speed through depth
  const speed = v => S.fieldSpecks(ref, ref, { ...ref, z: -v * D * dt }, W, H, dt), slow = speed(0.02), fast = speed(0.3), by = new Map(fast.map(q => [q.id, q]));
  assert.ok(fast.length > 150 && slow.length && slow.every(q => q.a < 0.5 * by.get(q.id).a), `${slow.length} faint specks slow, ${fast.length} fast`);
  // whole frames: a still shot and a push-in by the lens draw exactly what they draw with no field; a flight does not
  const frames = async dust => {
    const p = await plan(film({ W: 320, H: 180, params: { dust }, actors: { saturn: { at: 'centre', face: 'right' } }, shots: [
      { id: 'still', camera: { size: 'full', on: ['saturn'] }, dur: 1, beats: [] },
      { id: 'zoom', camera: { size: 'wide', on: ['saturn'], move: 'push-in', to: 'close' }, dur: 2, beats: [] },
      { id: 'fly', camera: { size: 'wide', on: ['saturn'], zTo: 1200 }, dur: 2, beats: [] },
    ] }));
    return ['still', 'zoom', 'fly'].map(id => { const s = shotOf(p, id); return [0.1, 0.5, 0.95].map(u => pixels(p, s.t0 + u * (s.t1 - s.t0))); });
  };
  const [on, off] = [await frames(1), await frames(0)];
  for (const i of [0, 1]) for (const j of [0, 1, 2]) assert.ok(Buffer.from(on[i][j]).equals(Buffer.from(off[i][j])), `${['still', 'zoom'][i]} frame ${j}`);
  assert.ok(!Buffer.from(on[2][1]).equals(Buffer.from(off[2][1])), 'the flight streams through it');
});

test('the near field is drawn in the depth sort: what is in front of a planet covers it, what is behind is hidden', async () => {
  const p = await plan(film({ W: 960, H: 540, actors: { saturn: { at: 'centre', face: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['saturn'], zTo: 900 }, dur: 2, beats: [] }] }));
  const s = shotOf(p, 'a'), t = s.t0 + 1.2, W = p.W, H = p.H, ZW = -100;
  // a red wall over the whole frame at depth ZW, in front of the planet
  p.overlays.push({ scene: 's1', name: 'wall', params: {}, layer: 'depth', seed: 1, t0: 0, t1: p.duration, def: { layer: 'depth', draw(ctx, api) {
    api.item([api.cam.cx, api.cam.cy, ZW], (c, P) => { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#ff0000'; c.fillRect(0, 0, W, H); });
  } } });
  const d = pixels(p, t), cam = s.cameraAt(t), specks = s.set.fieldSpecks(cam, s.cameraAt(s.t0), s.cameraAt(t - 1 / p.fps), W, H, 1 / p.fps);
  // (the wall's red under the grade's vignette: nothing pale over it)
  const red = q => { const j = (Math.round(q.y) * W + Math.round(q.x)) * 4; return d[j] > 60 && d[j + 1] < 15 && d[j + 2] < 15; };
  const inside = q => q.x > 2 && q.x < W - 2 && q.y > 2 && q.y < H - 2;
  // (behind: away from every speck in front, which may cover it)
  const nearer = specks.filter(q => q.z < ZW), clear = q => nearer.every(o => Math.hypot(o.x - q.x, o.y - q.y) > 4 + o.streak);
  const behind = specks.filter(q => q.z > ZW && inside(q) && clear(q)), front = nearer.filter(q => inside(q) && q.r >= 1 && q.a > 0.4);
  assert.ok(behind.length > 20 && front.length > 3, `${behind.length} behind, ${front.length} in front`);
  assert.ok(behind.every(red), `behind the wall: hidden (${JSON.stringify(behind.filter(q => !red(q)).map(q => [q.id, Math.round(q.x), Math.round(q.y), Math.round(q.z)]))})`);
  assert.ok(front.filter(q => !red(q)).length >= 0.8 * front.length, `in front of it: drawn over it (${front.filter(q => !red(q)).length} of ${front.length})`);
});

// ───────────── a body on the camera's path ─────────────
test('a moon staged on the camera\'s path grows as it swings past, and leaves the frame before it fades', async () => {
  const p = await plan(film({ W: 960, H: 540, actors: { saturn: { at: 'centre', face: 'right' }, titan: { at: 'x:1570,y:880', face: 'right', z: -1400 } },
    shots: [{ id: 'fly', camera: { size: 'wide', on: ['saturn'], z: -1500, zTo: 1000, focus: [0.5, 0.5] }, dur: 6, beats: [] }] }));
  const s = shotOf(p, 'fly'), W = p.W, H = p.H;
  let big = 0;
  for (let t = s.t0; t < s.t1; t += 1 / 24) {
    const a = actorAt(p, t, 'titan'); if (!a) continue;
    // (in frame: its middle is)
    const b = a.screenBox, h = b[3] - b[1], inFrame = mid(b) > 0 && mid(b) < W && (b[1] + b[3]) / 2 > 0 && (b[1] + b[3]) / 2 < H;
    if (a.alpha >= 1 && inFrame) big = Math.max(big, h / H);
    if (a.alpha < 1 && inFrame) assert.ok(h > 0.4 * H, `fading while in frame only when it fills it (${(h / H).toFixed(2)} of the height at alpha ${a.alpha.toFixed(2)})`);
  }
  assert.ok(big > 0.25, `it grows to ${(100 * big).toFixed(0)}% of the frame height, whole, before it leaves`);
});
