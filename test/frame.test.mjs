// The frame's compositing (engine/film/frame.mjs, fx.mjs, the hill's night passes): a dissolve never eats most of a
// short shot; depth of field keeps sharp every subject the camera names (a pull-out's toOn too); movement dust takes
// the light of the ground it rises from; by night the hill's crest tussocks are shaded whole and its far ranges'
// trees are shaded with them, as soft as the layer is drawn.
//   node --test test/frame.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo, dissolveLen, DISSOLVE } from '../engine/film/frame.mjs';
import { drawEvent, groundTone } from '../engine/film/fx.mjs';
import { getKit } from '../engine/set/kits/index.mjs';
import { hillGround } from '../engine/set/kits/hill.mjs';

const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const film = (scenes, { W = 320, H = 180, sets = { m: { kit: 'meadow' }, w: { kit: 'wayside' } } } = {}) => ({
  title: 'Frame', format: { width: W, height: H, fps: 24, captions: 'none' },
  voices: { hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' } },
  cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' } },
  sets, scenes,
});
// The scenes whose actors a frame at t draws (the outgoing scene of a dissolve draws its own).
function scenesDrawn(plan, t) {
  const seen = new Set(), orig = plan.actorsAt;
  plan.actorsAt = (tt, sc) => { seen.add(sc ?? plan.sceneAt(tt)?.id); return orig(tt, sc); };
  try { drawFrame(createCanvas(plan.W, plan.H).getContext('2d'), plan, t); } finally { plan.actorsAt = orig; }
  return seen;
}

// ───────────── dissolves ─────────────
test('a dissolve lasts at most 40% of the shot it opens and of the shot it leaves', async () => {
  const two = (inDur, outDur) => film([
    { id: 's1', set: 'm', time: 'morning', actors: { hare: { at: 'x:1200' } }, shots: [{ id: 'a', camera: { size: 'wide', on: ['hare'] }, dur: outDur }] },
    { id: 's2', set: 'w', time: 'morning', actors: { tortoise: { at: 'x:1200' } }, shots: [
      { id: 'b', camera: { size: 'wide', on: ['tortoise'] }, dur: inDur }, { id: 'c', camera: { size: 'full', on: ['tortoise'] }, dur: 2 }] },
  ]);
  const short = compile(await loadFilm(two(1, 3))), s2 = short.scenes[1];
  assert.equal(s2.transition, 'dissolve');
  assert.ok(Math.abs(dissolveLen(short, 1) - 0.4) < 1e-9, `a 1 s shot dissolves in over 0.4 s, not ${dissolveLen(short, 1)}`);
  assert.ok(scenesDrawn(short, s2.t0 + 0.3).has('s1'), 'the outgoing scene is still in the frame early in the dissolve');
  assert.ok(!scenesDrawn(short, s2.t0 + 0.5).has('s1'), 'the middle of a 1 s shot is clean: the dissolve is over');
  // a short outgoing shot caps it too; long shots keep the full dissolve
  const after = compile(await loadFilm(two(3, 1.5)));
  assert.ok(Math.abs(dissolveLen(after, 1) - 0.6) < 1e-9);
  const long = compile(await loadFilm(two(4, 4)));
  assert.equal(dissolveLen(long, 1), DISSOLVE);
  assert.ok(scenesDrawn(long, long.scenes[1].t0 + 0.7).has('s1'), 'long shots keep the full 0.8 s');
});

// ───────────── depth of field ─────────────
test('depth of field keeps sharp the subjects a pull-out ends on (toOn), even one just behind the first', async () => {
  const W = 640, H = 360, mk = dof => film([{ id: 's1', set: 'm', time: 'morning',
    actors: { hare: { at: 'x:1240,y:1062', face: 'left' }, tortoise: { at: 'x:1120,y:1056', face: 'right' } },
    shots: [{ id: 'a', dur: 5, camera: { size: 'close', on: ['hare'], move: 'pull-out', to: 'medium', toOn: ['hare', 'tortoise'], moveAt: 0.3, moveDur: 1, dof } }] }],
  { W, H, sets: { m: { kit: 'meadow' } } });
  const soft = compile(await loadFilm(mk(8))), sharp = compile(await loadFilm(mk(false))), t = 2.5;   // (after the move, before the film's closing fade)
  const px = plan => { const c = createCanvas(W, H), x = c.getContext('2d'); drawFrame(x, plan, t); return x.getImageData(0, 0, W, H).data; };
  const a = px(soft), b = px(sharp), info = frameInfo(soft, t);
  const diff = id => {
    const q = info.actors.find(o => o.id === id).screenBox, w = q[2] - q[0], h = q[3] - q[1];
    const x0 = Math.max(0, Math.round(q[0] + w * 0.25)), x1 = Math.min(W, Math.round(q[2] - w * 0.25)), y0 = Math.max(0, Math.round(q[1] + h * 0.25)), y1 = Math.min(H, Math.round(q[3] - h * 0.25));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; }
    assert.ok(n > 300, `${id} is in the picture`);
    return s / n;
  };
  assert.ok(diff('tortoise') < 1.5, `the tortoise, a subject of the toOn, is as sharp as without depth of field (${diff('tortoise').toFixed(2)})`);
  assert.ok(diff('hare') < 1.5, `the hare is sharp (${diff('hare').toFixed(2)})`);
});

// ───────────── movement dust ─────────────
// A stand-in set whose back is one flat colour (a dirt path everywhere).
const flatSet = rgb => ({ surfaceAt: () => 'dirt', drawBack: x => { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = `rgb(${rgb})`; x.fillRect(0, 0, x.canvas.width, x.canvas.height); x.restore(); } });
test('movement dust takes the light of the ground it rises from: no pale glow on a night path', () => {
  const puff = ground => {
    const c = createCanvas(240, 200), x = c.getContext('2d'), tone = groundTone(flatSet(ground), 120, 150, 2);
    x.fillStyle = `rgb(${ground})`; x.fillRect(0, 0, 240, 200);
    for (const age of [0.15, 0.4, 0.7]) drawEvent(x, { name: 'dust', t0: 0, x: 120, y: 150, s: 2, dir: 1, seed: 7, n: 6 }, age, { tone });
    const d = x.getImageData(0, 0, 240, 200).data;
    let top = 0, r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { top = Math.max(top, lum(d, i)); if (lum(d, i) > lum(ground, 0) + 1) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
    return { top, n, col: [r / n, g / n, b / n] };
  };
  const night = [30, 36, 72], day = [196, 176, 132];
  const N = puff(night), D = puff(day);
  assert.ok(N.n > 200, 'the puff is there at night');
  assert.ok(N.top < lum(night, 0) * 1.45 + 6, `at night the dust is only a little lighter than the path (${N.top.toFixed(0)} over ${lum(night, 0).toFixed(0)})`);
  assert.ok(N.col[2] > N.col[0] + 15, `and of its blue light, not tan (${N.col.map(Math.round)})`);
  assert.ok(D.n > 200 && D.top > lum(day, 0) + 8, 'by day it still reads, lighter than the dirt');
  assert.ok(D.col[0] > D.col[2] + 20, 'in the dirt\'s own warm colour');
});

// The hare runs the wayside path at noon (auto dust on every stride), the camera tracking it.
const dayRun = (W, H) => film([{ id: 's1', set: 'w', time: 'noon', actors: { hare: { at: 'path_west', face: 'right' } },
  shots: [{ id: 'a', camera: { size: 'full', on: ['hare'], move: 'track' }, beats: [{ do: 'run', who: 'hare', to: 'path_east' }], hold: 2 }] }], { W, H, sets: { w: { kit: 'wayside' } } });

test('day dust is lighter than the dirt it rises from, even with the runner and its shadow over the contact', async () => {
  const plan = compile(await loadFilm(dayRun(960, 540))), all = plan.fx, dust = all.filter(e => e.name === 'dust');
  assert.ok(dust.length >= 8, `the run kicks up dust (${dust.length})`);
  const px = (t, fx) => { plan.fx = fx; const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); try { drawFrame(x, plan, t); } finally { plan.fx = all; } return x.getImageData(0, 0, plan.W, plan.H).data; };
  let darker = 0, lighter = 0;
  for (const e of dust) {
    // the puff's first frame, when the runner's foot and cast shadow are still over the contact
    const t = e.t0 + 1 / 24, a = px(t, all.filter(o => o !== e)), b = px(t, all);
    for (let i = 0; i < a.length; i += 4) { const v = lum(b, i) - lum(a, i); if (v < -4) darker++; else if (v > 4) lighter++; }
  }
  assert.ok(lighter > 400, `the puffs show (${lighter} pixels lighter)`);
  assert.ok(darker <= lighter * 0.02, `no puff darkens what it rises over (${darker} pixels darker, ${lighter} lighter)`);
});

test('a puff keeps one colour all its life, wherever the tracking camera goes', async () => {
  const plan = compile(await loadFilm(dayRun(320, 180))), all = plan.fx, e = all.filter(o => o.name === 'dust')[2];
  // the colours the frame's radial gradients start from (dust dabs are radial gradients from their colour)
  const stops = (t, fx) => {
    const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'), rg = x.createRadialGradient.bind(x), L = [];
    x.createRadialGradient = (...a) => { const g = rg(...a), add = g.addColorStop.bind(g); g.addColorStop = (o, s) => { if (o === 0) L.push(s); return add(o, s); }; return g; };
    plan.fx = fx; try { drawFrame(x, plan, t); } finally { plan.fx = all; }
    return L;
  };
  const cols = new Set();
  let frames = 0;
  for (let t = e.t0 + 1 / 48; t < e.t1 - 0.2; t += 1 / 12, frames++) {
    const mine = stops(t, all);
    for (const s of stops(t, all.filter(o => o !== e))) { const i = mine.indexOf(s); if (i >= 0) mine.splice(i, 1); }
    for (const s of mine) cols.add(s.replace(/^rgba\((\d+,\d+,\d+),.*$/, '$1'));
  }
  assert.ok(frames >= 10 && cols.size > 0, 'the puff is drawn');
  assert.ok(cols.size <= e.n, `each of its ${e.n} dabs keeps one colour over ${frames} frames (${cols.size} colours)`);
});

// ───────────── the hill by night ─────────────
const hill = getKit('hill')().build();
// The ground layer (k = 1) with its anim at a night level, in a world window at 1 px per world unit.
function groundAt(night, [wx0, wy0, wx1, wy1]) {
  const W = wx1 - wx0, H = wy1 - wy0, c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#1c2450'; x.fillRect(0, 0, W, H);
  hill.night = night;
  x.setTransform(1, 0, 0, 1, -wx0, -wy0);
  const ly = hill.L.find(l => l.k === 1 && !l.front);
  x.drawImage(ly.c, ly.E.x0, ly.E.y0, ly.c.width / ly.res, ly.c.height / ly.res); ly.anim(x, 0, hill, { blur: 0 });
  return x.getImageData(0, 0, W, H).data;
}

test('hill by night: each crest tussock takes one shade, with no lighter band across its foot', () => {
  const T = hill.tufts;
  assert.ok(T?.c, 'the set keeps its crest tussocks (S.tufts)');
  const R = [600, 650, 3000, 1150], W = R[2] - R[0], day = groundAt(0, R), nite = groundAt(1, R);
  const ta = T.c.getContext('2d').getImageData(0, 0, T.c.width, T.c.height).data, k = T.c.width / T.w;
  const inTuft = (wx, wy) => { const i = Math.floor((wx - T.x0) * k), j = Math.floor((wy - T.y0) * k); return i >= 0 && j >= 0 && i < T.c.width && j < T.c.height && ta[(j * T.c.width + i) * 4 + 3] === 255; };
  // the tussocks' inside (8 units from any edge), above the crest line and down over the slope
  const above = [], below = [];
  for (let wy = R[1]; wy < R[3]; wy += 2) for (let wx = R[0]; wx < R[2]; wx += 2) {
    if (![[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6]].every(([dx, dy]) => inTuft(wx + dx, wy + dy))) continue;
    const i = ((wy - R[1]) * W + (wx - R[0])) * 4, r = (lum(nite, i) + 1) / (lum(day, i) + 1), g = hillGround(wx);
    if (wy < g - 8) above.push(r); else if (wy > g + 3) below.push(r);
  }
  const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(above.length > 50 && below.length > 50, `tussock insides on both sides of the crest line (${above.length}, ${below.length})`);
  assert.ok(Math.abs(mean(below) - mean(above)) < 0.04, `the night shades a tussock's foot as its top (${mean(below).toFixed(3)} vs ${mean(above).toFixed(3)})`);
});

test('hill by night: the trees on the far ranges\' crests are shaded too, sharp or as soft as the layer is drawn', () => {
  const R = [1200, 760, 2100, 1060], W = R[2] - R[0], H = R[3] - R[1], L0 = hill.L, sky = lum([0x1c, 0x24, 0x50], 0);
  hill.L = L0.filter(l => l.k === 0.7);                                     // the far range alone, at its own place
  try {
    for (const dof of [0, 2, 6]) {
      const draw = night => {
        const c = createCanvas(W, H), x = c.getContext('2d');
        x.fillStyle = '#1c2450'; x.fillRect(0, 0, W, H);
        x.setTransform(1, 0, 0, 1, -R[0], -R[1]);
        hill.drawBack(x, { cx: hill.refX, cy: hill.refY, zoom: 1 }, { night, dof });
        return x.getImageData(0, 0, W, H).data;
      };
      const day = draw(0), nite = draw(1);
      let lit = 0, bad = 0;
      for (let i = 0; i < day.length; i += 4) {
        if (lum(day, i) < sky + 25) continue;                             // the far layer (not the sky round it)
        lit++; if (lum(nite, i) > 0.85 * lum(day, i)) bad++;
      }
      assert.ok(lit > 2000, 'the far range is in the window');
      assert.ok(bad < lit * 0.002, `dof ${dof}: ${bad} of ${lit} of the far range's pixels keep their day light at night`);
    }
  } finally { hill.L = L0; }
});
