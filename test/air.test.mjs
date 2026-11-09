// Air and water: fliers that hover (a fly / enter / place with "height" ends in the air, holds there with a gentle bob,
// flaps, talks, is framed by the camera and is clean in lint; non-fliers get a check error), an entrance to near:<actor>
// that arrives without overshooting and leaves a visible gap, the enter's "fly" field, and the waterline painted where
// a wading body meets the water (engine/paint/water.mjs).
//   node --test test/air.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { frameInfo, drawFrame } from '../engine/film/frame.mjs';
import { lintPlan } from '../engine/lint/lint.mjs';
import { HOVER_BOB, canHover } from '../engine/film/actor.mjs';
import { getRig } from '../engine/cast/index.mjs';
import { wadeRing, wadeCut, wadeSpans } from '../engine/paint/water.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

// A mouse on the meadow path and a firefly (the butterfly rig, small) waiting off to the left.
function airFilm(shots, { actors, cast = {}, W = 320, H = 180 } = {}) {
  return {
    title: 'Air', format: { width: W, height: H, fps: 24, captions: 'dialogue' },
    voices: { tilly: { voice: 'Leda' }, glim: { voice: 'Puck' } },
    cast: { tilly: { rig: 'mouse', voice: 'tilly', scale: 1.15 }, glim: { rig: 'butterfly', voice: 'glim', scale: 0.6 }, ...cast },
    sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 's1', set: 'm', time: 'morning', actors: actors ?? { tilly: { at: 'x:1400', face: 'left' }, glim: { offstage: 'left' } }, shots }],
  };
}
const problemsOf = async film => { try { await loadFilm(film); return { problems: [], warnings: [] }; } catch (e) { if (!(e instanceof ValidationError)) throw e; return { problems: e.problems, warnings: e.warnings }; } };
const actor = (plan, id) => plan._scenes[0].actors.get(id);
const stateAt = (plan, id, t) => plan.actorsAt(t).find(a => a.id === id);

// ───────────── hovering ─────────────
test('hover: a flight with "height" ends in the air above its place, holds there with a gentle bob and keeps flapping', async () => {
  const film = airFilm([
    { id: 'a', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [{ do: 'enter', who: 'glim', from: 'left', to: 'x:1250' }] },
    { id: 'b', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [{ do: 'fly', who: 'glim', to: 'x:1330', height: 14 }, { say: 'glim', text: 'Follow me, little one!' }, { wait: 1 }] },
  ]);
  const f = await loadFilm(film), plan = compile(f), A = actor(plan, 'glim'), S = f.resolved.sets.m;
  assert.deepEqual(f.warnings, []);
  const mv = A.moves.find(m => m.kind === 'fly'), line = plan.lines[0];
  assert.ok(mv && mv.legs[0].type === 'fly', 'a flight');
  const p1 = A.posAt(mv.t1), k = A.k, sc = S.scaleAt(p1.x, p1.y);
  assert.equal(p1.mode, 'air'); assert.ok(p1.hover != null, 'it ends hovering');
  near(p1.x, 1330, 1); near(p1.y, S.laneAt(1330), 1, 'over the ground of its place');
  near(p1.lift * p1.s, 14 * sc, 1e-6, 'its feet 14 units (at the set scale) above the ground');
  near(p1.s, sc * k, 1e-9);
  // holds there: same spot, the lift bobs gently about the hover (eased in), never more than HOVER_BOB × its height
  const h = getRig('butterfly').height, lifts = [];
  for (let t = mv.t1; t < line.t1; t += 1 / 24) {
    const p = A.posAt(t), st = stateAt(plan, 'glim', t);
    near(p.x, p1.x, 1e-9); near(p.y, p1.y, 1e-9);
    assert.ok(Math.abs(p.lift - p.hover) <= HOVER_BOB * h + 1e-9, `a gentle bob (${p.lift - p.hover})`);
    assert.equal(st.mode, 'air'); assert.equal(st.airborne, true); assert.equal(st.st.shadow, false);
    lifts.push(p.lift);
  }
  assert.ok(Math.max(...lifts) - Math.min(...lifts) > 0.2 * HOVER_BOB * h, 'it bobs');
  // the lift is continuous at the arrival (no pop into the bob)
  near(A.posAt(mv.t1 - 1 / 240).lift, A.posAt(mv.t1 + 1 / 240).lift, 0.3, 'arrives smoothly');
  // it flaps on: the wings move from frame to frame while it hovers and talks
  const wings = [0, 1, 2, 3].map(i => JSON.stringify(A.poseAt(line.t0 + 0.1 + i / 12)));
  assert.ok(new Set(wings).size >= 3, 'the wings beat');
  // it talks there
  assert.ok(line.t0 >= mv.t1 - 1e-9 && stateAt(plan, 'glim', (line.t0 + line.t1) / 2).speaking);
  // drawn up in the air: its screen box sits well above its ground point, the contact is 'air'
  const info = frameInfo(plan, (line.t0 + line.t1) / 2), g = info.actors.find(a => a.id === 'glim');
  assert.equal(g.contact.kind, 'air');
  assert.ok(g.screenBox[3] < g.contact.screen[1] - 8 * g.s * info.camera.zoom, 'the feet hang well above the ground');
  // lint: no floating, no collision with the mouse
  const L = lintPlan(plan, { rules: ['floating', 'collision', 'teleport'] });
  assert.deepEqual([...L.errors, ...L.warnings].filter(e => e.actor === 'glim' || e.actors?.includes?.('glim')).map(e => e.message), []);
});

test('hover: the camera frames a hovering flier where it is drawn (a close-up keeps its head in frame)', async () => {
  const film = airFilm([
    { id: 'a', camera: { size: 'wide', on: ['tilly'] }, beats: [{ do: 'enter', who: 'glim', from: 'left', to: 'x:1250', height: 40 }] },
    { id: 'b', camera: { size: 'close', on: ['glim'] }, beats: [{ say: 'glim', text: 'Up here!' }, { wait: 0.6 }] },
  ]);
  const plan = compile(await loadFilm(film)), shot = plan.shots.find(s => s.id === 'b');
  for (const u of [0.2, 0.5, 0.8]) {
    const info = frameInfo(plan, shot.t0 + u * (shot.t1 - shot.t0)), g = info.actors.find(a => a.id === 'glim'), [x0, y0, x1, y1] = g.headBox;
    assert.ok(g.contact.kind === 'air' && g.screenBox[3] < g.contact.screen[1] - 30 * g.s * info.camera.zoom, 'it hovers high above its ground');
    assert.ok(x0 >= 0 && x1 <= plan.W && y0 >= 0 && y1 <= plan.H, `the hovering head is in the close-up at u=${u}: ${g.headBox.map(Math.round)}`);
    assert.ok(y1 - y0 > 0.25 * plan.H, `a close-up of it (not of the ground under it): its head is ${Math.round(y1 - y0)} px tall at u=${u}`);
  }
});

test('hover: place with "height" hovers at once; a hoverer flies on to land, walks by flying, and hops on from the air', async () => {
  const film = airFilm([
    { id: 'a', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [
      { do: 'place', who: 'glim', to: 'near:tilly', height: 10 },
      { wait: 1 },
      { do: 'walk', who: 'glim', to: 'x:1200' },
      { wait: 0.6 },
      { do: 'fly', who: 'glim', to: 'x:1300', height: 20 },
      { wait: 0.4 },
      { do: 'hop', who: 'glim', to: 'on:tilly' },
      { wait: 0.5 },
    ] },
  ], { actors: { tilly: { at: 'x:1400', face: 'left' }, glim: { at: 'x:1100', face: 'right' } } });
  const plan = compile(await loadFilm(film)), A = actor(plan, 'glim'), [, walk, fly, hop] = A.moves;
  const p = A.posAt(0.5);
  assert.equal(p.mode, 'air'); assert.ok(p.hover > 0); assert.ok(p.x < 1400, 'beside her, on the side it came from');
  // a walk from the air is a flight down to the place, landing there
  assert.equal(walk.legs[0].type, 'fly');
  const landed = A.posAt(walk.t1 + 0.01);
  assert.equal(landed.mode, 'ground'); assert.ok(!landed.hover); near(landed.x, 1200, 2);
  assert.equal(stateAt(plan, 'glim', walk.t1 + 0.3).airborne, false, 'landed');
  assert.equal(A.posAt(fly.t1 + 0.1).mode, 'air');
  // the hop starts at the hover's height (no drop to the ground first) and ends riding
  const a = A.posAt(hop.t0 - 1e-4), b = A.posAt(hop.t0 + 1e-4);
  near(b.lift * b.s, a.lift * a.s, 0.5, 'the hop takes off from the hover');
  assert.ok(stateAt(plan, 'glim', hop.t0 + 0.05).airborne, 'still in the air as it gathers to jump');
  assert.equal(A.posAt(hop.t1 + 0.1).mode, 'mount');
});

test('hover: validation — fliers only, fly / enter / place only, a positive height, not with on:', async () => {
  const film = airFilm([
    { id: 'a', camera: { size: 'wide', on: ['tilly'] }, beats: [
      { do: 'enter', who: 'glim', from: 'left', to: 'near:tilly', height: 12 },        // fine
      { do: 'fly', who: 'glim', to: 'x:1300', height: 30 },                             // fine
      { do: 'place', who: 'glim', to: 'x:1200', height: 8 },                            // fine
      { do: 'place', who: 'tilly', to: 'x:1500', height: 10 },                          // a mouse cannot fly
      { do: 'walk', who: 'glim', to: 'x:1250', height: 10 },                            // not a walk
      { do: 'fly', who: 'glim', to: 'x:1250', height: -3 },                             // not ≤ 0
      { do: 'place', who: 'glim', to: 'on:tilly', height: 5 },                          // not riding
      { do: 'place', who: 'bug', to: 'x:1100', height: 5 },                             // a beetle cannot fly
    ] },
  ], { actors: { tilly: { at: 'x:1400', face: 'left' }, glim: { offstage: 'left' }, bug: { at: 'x:1000' } }, cast: { bug: { rig: 'beetle' } } });
  const { problems } = await problemsOf(film), at = p => problems.filter(q => q.path === p).map(q => q.message).join(' | ');
  const B = 'scenes[0].shots[0].beats';
  for (const i of [0, 1, 2]) assert.equal(at(`${B}[${i}].height`), '', `beat ${i} is fine`);
  assert.match(at(`${B}[3].height`), /rig "mouse" cannot fly/);
  assert.match(at(`${B}[4].height`), /only a fly, enter or place/);
  assert.match(at(`${B}[5].height`), /positive number of units/);
  assert.match(at(`${B}[6].height`), /cannot hover and ride/);
  assert.match(at(`${B}[7].height`), /rig "beetle" cannot fly/);
  assert.ok(!canHover(getRig('beetle')) && !canHover(getRig('mouse')));
  for (const k of ['butterfly', 'songbird', 'owl']) assert.ok(canHover(getRig(k)), `${k} hovers`);
});

test('hover: a full shot of a hovering bird keeps its beating wings in the frame on every frame', async () => {
  const film = airFilm([
    { id: 'a', camera: { size: 'wide', on: ['tilly'] }, beats: [{ do: 'place', who: 'bird', to: 'x:1100', height: 25 }, { wait: 0.5 }] },
    { id: 'c', camera: { size: 'full', on: ['bird'] }, beats: [{ wait: 1.5 }] },
  ], { W: 960, H: 540, cast: { bird: { rig: 'songbird' } }, actors: { tilly: { at: 'x:1400' }, bird: { at: 'x:1100' } } });
  const plan = compile(await loadFilm(film)), shot = plan.shots.find(s => s.id === 'c');
  let worst = -Infinity, at = 0;
  for (let t = shot.t0 + 1 / 48; t < shot.t1; t += 1 / 24) {
    const b = frameInfo(plan, t).actors.find(a => a.id === 'bird').screenBox, o = Math.max(-b[0], -b[1], b[2] - plan.W, b[3] - plan.H);
    if (o > worst) { worst = o; at = t; }
  }
  assert.ok(worst < 0, `the wings stay inside the frame (worst ${worst.toFixed(1)} px out at ${at.toFixed(3)} s)`);
});

test('hover: over water (or any spot nobody could stand on) the flier hovers where it is told', async () => {
  const film = {
    title: 'Over', format: { width: 320, height: 180, fps: 24 }, cast: { fly: { rig: 'butterfly' }, bird: { rig: 'songbird' } }, sets: { st: { kit: 'stream' } },
    scenes: [{ id: 's', set: 'st', time: 'morning', actors: { fly: { at: 'x:900' }, bird: { offstage: 'right' } }, shots: [{ id: 'a', camera: { size: 'wide' }, beats: [
      { do: 'fly', who: 'fly', to: 'x:1200,y:1150', height: 15 },
      { do: 'enter', who: 'bird', from: 'right', to: 'x:1400,y:1120', height: 12 },
      { do: 'place', who: 'fly', to: 'x:1350,y:1200', height: 8 },
      { wait: 0.5 },
    ] }] }],
  };
  const f = await loadFilm(film), plan = compile(f), S = f.resolved.sets.st, sc = plan._scenes[0];
  const fly = sc.actors.get('fly'), bird = sc.actors.get('bird');
  const [flight, place] = fly.moves.filter(m => m.kind === 'fly' || m.kind === 'place').slice(-2), enter = bird.moves.find(m => m.kind === 'enter');
  for (const [A, mv, x, y] of [[fly, flight, 1200, 1150], [bird, enter, 1400, 1120], [fly, place, 1350, 1200]]) {
    const p = A.posAt(mv.t1 + 0.01);
    assert.ok(S.inWater(x, y), `(${x}, ${y}) is over the water`);
    assert.equal(p.mode, 'air'); assert.ok(p.hover > 0);
    near(p.x, x, 1e-6, `${A.id} hovers over x ${x}`); near(p.y, y, 1e-6, `${A.id} over y ${y}`);
  }
});

test('hover: a scene can open on a hovering flier ("height" on a scene actor); checks as for a beat', async () => {
  const film = airFilm([{ id: 'a', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [{ say: 'glim', text: 'Up here!' }] }],
    { actors: { tilly: { at: 'x:1400', face: 'left' }, glim: { at: 'x:1300', height: 12 } } });
  const f = await loadFilm(film), plan = compile(f), A = actor(plan, 'glim'), S = f.resolved.sets.m;
  assert.deepEqual(f.warnings, []);
  const p = A.posAt(0.3), st = stateAt(plan, 'glim', 0.3);
  assert.equal(p.mode, 'air'); near(p.hover * p.s, 12 * S.scaleAt(1300, S.laneAt(1300)), 1e-6, 'its feet 12 units up');
  assert.equal(st.airborne, true); assert.equal(A.hoverAt(0.3), true);
  const bad = airFilm([{ id: 'a', beats: [{ wait: 1 }] }], { cast: { bird: { rig: 'songbird' }, wren: { rig: 'songbird' } }, actors: {
    tilly: { at: 'x:1400', height: 10 }, glim: { offstage: 'left', height: 10 }, bird: { at: 'x:1000', height: 0 }, wren: { at: 'x:1100', height: 6, pose: 'perch' },
  } });
  const { problems } = await problemsOf(bad), at = p => problems.filter(q => q.path === p).map(q => q.message).join(' | ');
  assert.match(at('scenes[0].actors.tilly.height'), /rig "mouse" cannot fly/);
  assert.match(at('scenes[0].actors.glim.height'), /starting at a place/);
  assert.match(at('scenes[0].actors.bird.height'), /positive number/);
  assert.match(at('scenes[0].actors.wren.pose'), /takes no pose/);
});

test('hover: a hovering flier cannot sit, lie, sleep or take a pose in mid-air (check error); landed, it can', async () => {
  const film = airFilm([{ id: 'a', beats: [
    { do: 'place', who: 'glim', to: 'x:1200', height: 20 },
    { do: 'sleep', who: 'glim' },
    { do: 'sit', who: 'glim' },
    { do: 'pose', who: 'glim', pose: 'stand' },
    { do: 'set', who: 'glim', pose: 'stand' },
    { do: 'look', who: 'glim', to: 'tilly' },
    { do: 'fly', who: 'glim', to: 'x:1250', height: 10, pose: 'stand' },
    { do: 'walk', who: 'glim', to: 'x:1300' },
    { do: 'sleep', who: 'glim' },
  ] }], { actors: { tilly: { at: 'x:1400', face: 'left' }, glim: { at: 'x:1100' } } });
  const { problems } = await problemsOf(film), at = p => problems.filter(q => q.path === p).map(q => q.message).join(' | ');
  const B = 'scenes[0].shots[0].beats';
  assert.match(at(`${B}[1].do`), /"glim" is hovering .* cannot sleep there; land it first/);
  assert.match(at(`${B}[2].do`), /cannot sit there/);
  assert.match(at(`${B}[3].do`), /cannot take a pose there/);
  assert.match(at(`${B}[4].pose`), /takes no pose/);
  assert.equal(at(`${B}[5].do`), '', 'it may look about');
  assert.match(at(`${B}[6].pose`), /takes no pose/);
  assert.equal(at(`${B}[8].do`), '', 'landed by the walk, it may sleep');
});

// ───────────── entrances ─────────────
test('enter to near:<actor> arrives without overshooting and leaves a visible gap (a small flier by a mouse)', async () => {
  // the frame edge the way in starts from lies past the destination (a full shot of a mouse)
  for (const extra of [{ gait: 'fly' }, { gait: 'fly', height: 9 }, {}]) {
    const film = airFilm([{ id: 'a', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [{ do: 'enter', who: 'glim', from: 'left', to: 'near:tilly', ...extra }, { wait: 1 }] }]);
    const plan = compile(await loadFilm(film)), A = actor(plan, 'glim'), mv = A.moves.find(m => m.kind === 'enter');
    const end = A.posAt(mv.t1).x;
    let prev = -Infinity;
    for (let t = mv.t0; t <= mv.t1 + 0.5; t += 1 / 48) {
      const x = A.posAt(t).x;
      assert.ok(x >= prev - 1e-6, `${JSON.stringify(extra)}: never backs off (x ${prev.toFixed(1)} → ${x.toFixed(1)} at ${t.toFixed(2)})`);
      assert.ok(x <= end + 1e-6, `${JSON.stringify(extra)}: never past where it stops (${x.toFixed(1)} > ${end.toFixed(1)})`);
      prev = x;
    }
    // the drawings keep apart: a gap between the firefly (wings beating) and the mouse's nose of at least 8% of the
    // mouse's length, all through the line after it arrives
    for (let t = mv.t1; t < mv.t1 + 0.9; t += 1 / 12) {
      const info = frameInfo(plan, t), g = info.actors.find(a => a.id === 'glim'), m = info.actors.find(a => a.id === 'tilly');
      const gap = m.screenBox[0] - g.screenBox[2], len = m.screenBox[2] - m.screenBox[0];
      assert.ok(gap > 0.08 * len, `${JSON.stringify(extra)}: a visible gap (${gap.toFixed(1)} px of ${len.toFixed(1)}) at ${t.toFixed(2)}`);
    }
  }
});

test('enter "fly": true is a known field (a flier flies in from above); only an enter of a flier takes it', async () => {
  const ok = airFilm([{ id: 'a', camera: { size: 'full', on: ['tilly', 'glim'] }, beats: [{ do: 'enter', who: 'glim', from: 'left', to: 'x:1300', fly: true }] }]);
  const f = await loadFilm(ok);
  assert.deepEqual(f.warnings.map(w => w.message), [], 'no "unknown field" warning');
  const A = actor(compile(f), 'glim'), mv = A.moves.find(m => m.kind === 'enter');
  assert.equal(mv.legs[0].type, 'fly', 'a flight');
  assert.ok(mv.legs[0].altA > 100, 'from above');
  const bad = airFilm([{ id: 'a', beats: [
    { do: 'enter', who: 'glim', from: 'left', to: 'x:1300', fly: 'yes' },
    { do: 'walk', who: 'tilly', to: 'x:1500', fly: true },
    { do: 'enter', who: 'mole', from: 'right', to: 'x:1600', fly: true },
  ] }], { cast: { mole: { rig: 'hedgehog' } }, actors: { tilly: { at: 'x:1400' }, glim: { offstage: 'left' }, mole: { offstage: 'right' } } });
  const { problems } = await problemsOf(bad), at = p => problems.filter(q => q.path === p).map(q => q.message).join(' | ');
  assert.match(at('scenes[0].shots[0].beats[0].fly'), /true or false/);
  assert.match(at('scenes[0].shots[0].beats[1].fly'), /only an enter/);
  assert.match(at('scenes[0].shots[0].beats[2].fly'), /rig "hedgehog" cannot fly/);
});

// ───────────── the waterline ─────────────
// A grey body standing in a pond: the water drawn, the body cut at the waterline, the waterline painted.
function wading(fn) {
  const c = createCanvas(240, 160), x = c.getContext('2d');
  x.fillStyle = '#4a8296'; x.fillRect(0, 0, 240, 160);
  x.fillStyle = '#888888'; x.beginPath(); x.ellipse(120, 80, 50, 40, 0, 0, Math.PI * 2); x.fill();
  fn?.(x);
  return x;
}
const px = (x, X, Y) => [...x.getImageData(X, Y, 1, 1).data];
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

test('waterline: the cut follows the near half of the waterline ring (the body below it is under, above it dry)', () => {
  const geo = { x: 120, y: 80, rx: 40, ry: 10 };
  const x = wading(c => { c.globalCompositeOperation = 'destination-out'; wadeCut(c, geo, 240, 160); c.fill(); });
  assert.equal(px(x, 120, 86)[3], 255, 'between the waterline and the near arc the body is above the water');
  assert.equal(px(x, 120, 95)[3], 0, 'below the near arc it is under');
  assert.equal(px(x, 70 + 1, 84)[3], 0, 'beside the ring, below the waterline, it is under');
  assert.equal(px(x, 120, 75)[3], 255, 'above the waterline it is dry');
});

test('waterline: a meniscus and a darker band under it, deterministic, faint once the body is under', () => {
  const geo = { x: 120, y: 80, rx: 40, a: 1, seed: 7, t: 1.25, s: 1.4, depth: 30 };
  const back = wading(c => wadeRing(c, { ...geo, half: 'back' }));
  const front = wading(c => wadeRing(c, { ...geo, half: 'front' })), bare = wading();
  // the band just under the near arc is darker than the bare body there; the water far below is untouched
  assert.ok(lum(px(front, 120, 96)) < lum(px(bare, 120, 96)) - 6, 'a darker band under the waterline');
  assert.deepEqual(px(front, 120, 150), px(bare, 120, 150), 'nothing far below');
  // the meniscus: a dark lip along the near arc, light catching just under it somewhere along the ring
  let dark = 0, light = 0;
  for (let X = 90; X <= 150; X += 2) for (let Y = 84; Y <= 96; Y++) { const d = lum(px(front, X, Y)) - lum(px(bare, X, Y)); if (d < -20) dark++; if (d > 20) light++; }
  assert.ok(dark > 10 && light > 4, `meniscus dark ${dark} / light ${light}`);
  // the back half paints only behind (above) the waterline
  let above = 0, below = 0;
  for (let X = 70; X <= 170; X += 2) for (let Y = 60; Y <= 110; Y++) { if (lum(px(back, X, Y)) !== lum(px(bare, X, Y))) (Y < 80 ? above++ : below++); }
  assert.ok(above > 10 && below < above * 0.25, `the back half lies behind (${above} above, ${below} below)`);
  // deterministic, and faint for a body entirely under
  const again = wading(c => wadeRing(c, { ...geo, half: 'front' }));
  assert.deepEqual([...front.getImageData(0, 0, 240, 160).data], [...again.getImageData(0, 0, 240, 160).data]);
  const faint = wading(c => wadeRing(c, { ...geo, half: 'front', a: 0.35 }));
  const diff = (a, b) => { let n = 0; const A = a.getImageData(0, 0, 240, 160).data, B = b.getImageData(0, 0, 240, 160).data; for (let i = 0; i < A.length; i += 4) n += Math.abs(A[i] - B[i]); return n; };
  assert.ok(diff(faint, bare) < diff(front, bare) * 0.6, 'fainter when under');
});

test('waterline: wadeSpans finds each place a drawing crosses the surface, its ring no deeper than the body allows', () => {
  const c = createCanvas(200, 100), x = c.getContext('2d');
  x.fillStyle = '#c63'; x.fillRect(20, 30, 40, 50);                                  // a slab 20..60 wide, 30..80 tall
  x.beginPath(); x.ellipse(140, 60, 30, 20, 0, 0, Math.PI * 2); x.fill();           // a dome 110..170, 40..80
  const [slab, dome, ...more] = wadeSpans(x, 60);
  assert.equal(more.length, 0, 'two crossings');
  near(slab.x, 40, 1); near(slab.rx, 20, 1); near(dome.x, 140, 1); near(dome.rx, 30, 1.5);
  near(slab.ry, 0.26 * slab.rx, 1e-9, 'the surface seen from a little above'); near(dome.ry, 0.26 * dome.rx, 1e-9);
  // no deeper than half the depth the body reaches under the line, nor than it rises above it
  assert.ok(wadeSpans(x, 60, { below: 6 }).every(c => c.ry <= 3));
  const cap = wadeSpans(x, 43).find(c => c.x > 100);
  assert.ok(cap.rise <= 3 && cap.ry <= cap.rise, `a dome just breaking the surface: a shallow ring (${cap.ry})`);
  // fully under: none
  assert.deepEqual(wadeSpans(x, 29).filter(c => c.x > 100), []);
  assert.deepEqual(wadeSpans(x, 20), []);
  // the cut keeps the lens in front of each crossing, not between them
  const k = createCanvas(200, 100), y = k.getContext('2d');
  y.fillStyle = '#c63'; y.fillRect(0, 0, 200, 100);
  y.globalCompositeOperation = 'destination-out'; wadeCut(y, { x: 100, y: 60, rx: 80, spans: [slab, dome] }, 200, 100); y.fill();
  for (const c of [slab, dome]) assert.equal(px(y, Math.round(c.x), 60 + Math.floor(c.ry / 2))[3], 255, 'its front dry');
  assert.equal(px(y, 85, 62)[3], 0, 'between the crossings, under');
});

// ───────────── the waterline in the frame ─────────────
// A wader (and a rider on tiptoe) walked into the stream (wade, depth) and drawn by drawFrame; the same frame without them (left
// on the bank, out of the picture) for comparison. Camera fixed on the banks.
async function wadeFrames(rig, depth, { rider = null, t = 4 } = {}) {
  const mk = here => ({
    title: 'Wade', format: { width: 1280, height: 720, fps: 24 }, cast: { w: { rig }, ...(rider ? { r: { rig: rider } } : {}) }, sets: { st: { kit: 'stream' } },
    scenes: [{ id: 's', set: 'st', time: 'morning', actors: { w: { at: here ? 'x:1075,y:1058' : 'x:300', face: 'right' }, ...(rider ? { r: { on: 'w', pose: 'alert' } } : {}) },
      shots: [{ id: 'a', camera: { size: 'full', on: ['bank_left', 'bank_right'] }, beats: here ? [{ do: 'walk', who: 'w', to: 'x:1330,y:1090', wade: true, depth, speed: 3 }, { wait: 3 }] : [{ wait: 6 }] }] }],
  });
  const draw = async here => { const plan = compile(await loadFilm(mk(here))), c = createCanvas(1280, 720), x = c.getContext('2d'); drawFrame(x, plan, t); return { plan, x }; };
  const A = await draw(true), B = await draw(false), info = frameInfo(A.plan, t);
  // dry: a pixel of the (warm-coloured) body itself, not water or the faint tinted body under it
  const dry = (X, Y) => { const p = px(A.x, X, Y), q = px(B.x, X, Y); return p[2] < p[0] - 8 && Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 60; };
  return { A, B, info, dry, actors: ['w', ...(rider ? ['r'] : [])].map(id => info.actors.find(a => a.id === id)) };
}
// The runs of body (dry pixels, gaps of an ink line or two closed) just above the waterline wl across x0..x1, at least
// `min` px wide.
function crossingsAt(dry, wl, x0, x1, min = 12) {
  const runs = []; let a = -1, last = -9;
  for (let X = Math.floor(x0); X <= Math.ceil(x1) + 5; X++) {
    if (X <= x1 && dry(X, Math.floor(wl) - 2)) { if (a < 0) a = X; last = X; }
    else if (a >= 0 && X - last > 3) { if (last - a + 1 >= min) runs.push([a, last]); a = -1; }
  }
  return runs;
}
// Dry pixels under the waterline (below its anti-aliased row) across columns x0..x1.
const dryBelow = (dry, x0, x1, wl, n = 14) => { let k = 0; for (let X = x0; X <= x1; X++) for (let Y = Math.ceil(wl) + 1; Y <= Math.ceil(wl) + n; Y++) if (dry(X, Y)) k++; return k; };

test('waterline in the frame: a half-sunk body curves down into the water at each crossing (no flat cut)', async () => {
  for (const [rig, depth, rider] of [['tortoise', 25], ['tortoise', 72, 'squirrel'], ['hare', 30]]) {
    const { dry, actors } = await wadeFrames(rig, depth, { rider });
    for (const a of actors) {
      const wl = a.waterline; assert.ok(wl != null, 'wading');
      const runs = crossingsAt(dry, wl, a.screenBox[0], a.screenBox[2]);
      if (a.id === 'r') assert.ok(runs.length >= 2, `${rider}: its tail and its body cross the water apart (${JSON.stringify(runs)})`);
      assert.ok(runs.length >= 1, `${a.id} breaks the surface`);
      for (const [x0, x1] of runs) {
        const n = dryBelow(dry, x0, x1, wl);
        assert.ok(n >= 0.5 * (x1 - x0 + 1), `${rig}${rider ? `+${rider}` : ''} ${a.id}: the crossing ${x0}..${x1} goes on dry under the waterline (its front above the water): ${n} px`);
      }
    }
  }
});

test('waterline in the frame: nothing dry under the surface once a body is under; a shallow wader keeps its feet in', async () => {
  // the tortoise entirely under (depth past its height): no dry shell anywhere below the waterline
  const T = await wadeFrames('tortoise', 60), t = T.actors[0];
  assert.ok(t.visibleBox == null || t.visibleBox[3] <= t.visibleBox[1] + 1 || t.screenBox[1] > t.waterline - 1, 'it is under');
  let n = 0;
  for (let X = Math.floor(t.screenBox[0]); X <= t.screenBox[2]; X++) for (let Y = Math.ceil(t.waterline) + 1; Y <= t.screenBox[3]; Y++) if (T.dry(X, Y)) n++;
  assert.equal(n, 0, 'no dry cap floating under the water');
  // a hare in shallow water: its lowest part (the feet) is under the water, the near arc never lifts it out
  const H = await wadeFrames('hare', 10), h = H.actors[0], feet = h.screenBox[3], wl = h.waterline;
  assert.ok(feet - wl > 4, `its feet are under the surface line (${(feet - wl).toFixed(1)} px)`);
  let low = 0;
  for (let X = Math.floor(h.screenBox[0]); X <= h.screenBox[2]; X++) for (let Y = Math.ceil(wl + 0.55 * (feet - wl)); Y <= feet; Y++) if (H.dry(X, Y)) low++;
  assert.equal(low, 0, 'nothing dry in the lower half of what is under');
});
