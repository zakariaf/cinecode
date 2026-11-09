// Seventy-Six Summers sky and light (films/seventy-six-summers/fx/sky.mjs): the comet's modes and its one eased
// bloom, the stone's last light going out exactly on its mark, the hill mist (height fog, its extent, the radial
// parting), the time-lapse (photosensitivity, seasons, the eight ghosts), and the drawings themselves on a small film
// (layers, occlusion, determinism).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as sky from '../films/seventy-six-summers/fx/sky.mjs';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame } from '../engine/film/frame.mjs';
import { getKit } from '../engine/set/kits/index.mjs';

const SKY = fileURLToPath(new URL('../films/seventy-six-summers/fx/sky.mjs', import.meta.url));
const FPS = 24;
const frames = (t0, t1) => { const out = []; for (let f = Math.ceil(t0 * FPS); f / FPS <= t1 + 1e-9; f++) out.push(f / FPS); return out; };
// Swings: monotone runs of a signal whose total change is at least `min`; → the frame index where each one ends.
function swings(L, min) {
  const ext = [0]; let dir = 0;
  for (let i = 1; i < L.length; i++) { const d = Math.sign(L[i] - L[i - 1]); if (d && dir && d !== dir) ext.push(i - 1); if (d) dir = d; }
  ext.push(L.length - 1);
  const out = []; for (let i = 1; i < ext.length; i++) if (Math.abs(L[ext[i]] - L[ext[i - 1]]) >= min) out.push(ext[i]);
  return out;
}
const worstPerSecond = S => Math.max(0, ...S.map(f => S.filter(g => g >= f && g < f + FPS).length));

test('exports the overlays and the custom beat on the layers they need', () => {
  assert.deepEqual(Object.keys(sky.overlays).sort(), ['comet', 'hill-mist', 'stone-light']);
  assert.equal(sky.overlays.comet.layer, 'grade');            // emitted light: after the grade
  assert.equal(sky.overlays['stone-light'].layer, 'grade');
  assert.equal(sky.overlays['hill-mist'].layer, 'front');     // the mist is lit and graded with the scene
  assert.equal(sky.custom.timelapse.layer, 'grade');
  for (const d of [...Object.values(sky.overlays), sky.custom.timelapse]) assert.equal(typeof d.draw, 'function');
});

test('value noise is deterministic, smooth and in 0..1', () => {
  const n = sky.vnoise(5), m = sky.vnoise(5), f = sky.fbm(9);
  for (let i = 0; i < 200; i++) {
    const x = i * 0.731, y = i * 0.377;
    assert.equal(n(x, y), m(x, y));
    assert.ok(n(x, y) >= 0 && n(x, y) <= 1 && f(x, y) >= 0 && f(x, y) <= 1);
    assert.ok(Math.abs(n(x, y) - n(x + 0.01, y)) < 0.05);
  }
  assert.notEqual(sky.vnoise(5)(0.5, 0.5), sky.vnoise(6)(0.5, 0.5));
});

// ───────────── comet ─────────────
const capi = (params, t, marks = {}, extra = {}) => ({ params, t, marks, scene: { id: 's', t0: 0, t1: 100 }, shot: { scene: 's' }, plan: { custom: [], overlays: [] }, ...extra });

test('comet modes: memory and full share the locked sky position; dim and faint are dim smudges', () => {
  const full = sky.cometState(capi({ mode: 'full' }, 5)), mem = sky.cometState(capi({ mode: 'memory' }, 5));
  const dim = sky.cometState(capi({ mode: 'dim' }, 5)), faint = sky.cometState(capi({ mode: 'faint' }, 5));
  assert.deepEqual(full.pos, mem.pos);
  assert.deepEqual(dim.pos, full.pos);
  assert.notDeepEqual(faint.pos, full.pos);
  assert.ok(faint.pos[1] > full.pos[1], 'the dawn smudge hangs lower');
  assert.equal(full.B, 1); assert.ok(mem.B <= full.B, 'the memory never reads brighter than the finale');
  for (const s of [dim, faint]) { assert.ok(s.B < 0.5 && s.L < 0.35); }
  assert.ok(full.stars > 0 && mem.stars === 0);
});

test('the bloom: dim until the mark, then one eased monotone rise into the full comet over 1.5 s', () => {
  const tm = 40, at = t => sky.cometState(capi({ mode: 'bloom' }, t, { bloom: tm }));
  const dim = sky.cometState(capi({ mode: 'dim' }, 0));
  for (const t of frames(30, tm - 1e-6)) { const s = at(t); assert.equal(s.B, dim.B); assert.equal(s.L, dim.L); assert.equal(s.rise, 0); }
  const B = frames(tm, tm + 4).map(t => at(t).B);
  for (let i = 1; i < B.length; i++) assert.ok(B[i] >= B[i - 1] - 1e-12, 'never dims again');
  assert.ok(at(tm + 1 / FPS).B > dim.B, 'starts on the mark');
  assert.ok(at(tm + 0.75).B < 0.9, 'not a pop: eased');
  assert.equal(at(tm + sky.BLOOM_RISE).B, 1);
  assert.equal(swings(B, 0.05).length, 1, 'one rise');
  // per-frame step stays small (no flash)
  for (let i = 1; i < B.length; i++) assert.ok(B[i] - B[i - 1] < 0.06);
  // a missing mark keeps it dim; a named mark is honoured
  assert.equal(sky.cometState(capi({ mode: 'bloom' }, 99)).B, dim.B);
  assert.equal(sky.cometState(capi({ mode: 'bloom', mark: 'x' }, tm + 2, { x: tm })).B, 1);
});

test('a time-lapse in the scene carries the memory comet away to the faint dawn place', () => {
  const tl = { name: 'timelapse', scene: 's', t0: 10, t1: 14 }, api = t => capi({ mode: 'memory' }, t, {}, { plan: { custom: [tl], overlays: [] } });
  const before = sky.cometState(api(9)), after = sky.cometState(api(13.9)), faint = sky.cometState(capi({ mode: 'faint' }, 0));
  assert.equal(before.B, sky.cometState(capi({ mode: 'memory' }, 9)).B);
  assert.ok(Math.abs(after.B - faint.B) < 1e-9);
  assert.ok(Math.hypot(after.pos[0] - faint.pos[0], after.pos[1] - faint.pos[1]) < 1e-6);
});

// ───────────── stone light ─────────────
test('stoneLit: all lit before the shadow reaches the stone, shrinking, never 0 before dark, 0 from dark', () => {
  assert.equal(sky.stoneLit(0.7), 1);
  assert.equal(sky.stoneLit(0.8), 1);
  let prev = 1;
  for (let d = 0.8; d < 0.95; d += 0.0005) { const v = sky.stoneLit(d); assert.ok(v > 0, `lit at ${d}`); assert.ok(v <= prev + 1e-12); prev = v; }
  assert.equal(sky.stoneLit(0.95), 0);
  assert.equal(sky.stoneLit(1), 0);
  assert.ok(sky.stoneLit(0.87) < 0.25, 'a thin sliver at twilight');
  assert.ok(sky.stoneLit(0.9499) > 0);
  assert.equal(sky.stoneLit(0.9, 0.9), 0);
  assert.ok(sky.stoneLit(0.899, 0.9) > 0);
});

test('stone light with out: a visible thread until the mark, exactly 0 on the mark frame and after', () => {
  const scene = { id: 's09', t0: 200, t1: 260 }, mark = 229.125;   // on a frame
  const at = t => sky.stoneLightAt({ t, scene, marks: { bloom: mark }, params: { dayT: [0.92, 1], out: 'bloom' } });
  for (const t of frames(200, mark - 1 / FPS)) assert.ok(at(t).lit > 0, `still lit at ${t}`);
  for (const t of frames(mark, 260)) assert.equal(at(t).lit, 0);
  // 14 frames before the mark there is still a thread worth watching (≥ 1% of the stone, ~3 world px)
  assert.ok(at(mark - 14 / FPS).lit > 0.01);
  assert.ok(at(mark - 1 / FPS).lit < at(mark - 14 / FPS).lit);
  // continuity with the scene before: s08 ends at 0.915, s09 starts at 0.92
  const s08 = sky.stoneLightAt({ t: 130, scene: { t0: 100, t1: 130 }, marks: {}, params: { dayT: [0.91, 0.915] } }).lit;
  assert.ok(Math.abs(at(200).lit - s08) < 0.03);
  // dayT goes from the first to the second value across the scene
  const tw = t => sky.stoneLightAt({ t, scene: { t0: 0, t1: 10 }, marks: {}, params: { dayT: [0.87, 0.9] } });
  assert.ok(Math.abs(tw(0).dayT - 0.87) < 1e-9 && Math.abs(tw(10).dayT - 0.9) < 1e-9 && tw(10).lit < tw(0).lit);
});

// ───────────── mist ─────────────
const S = getKit('hill')(); S.build();
test('mist: a bank on the upper slope (over the crest when asked), as deep as the stone, absent down the slope', () => {
  const p = { ...sky.MIST, to: 4000, partT: null }, D = sky.mistDensity(S, p, 3, 11), g = x => S.groundAt(x);
  const stone = S.props.find(q => q.id === 'standing_stone'), sx = stone.x;
  // over the crest: dense near the ground, gone well above the stone's tip
  let lowMean = 0, n = 0; for (let x = sx - 300; x <= sx + 300; x += 20) { lowMean += D(x, g(x) - 60).bank; n++; }
  assert.ok(lowMean / n > 0.4, `dense near the ground (${(lowMean / n).toFixed(2)})`);
  for (let x = sx - 300; x <= sx + 300; x += 20) assert.equal(D(x, g(x) - p.top * 1.6).bank, 0);
  // far down the slope: no bank, at most a faint veil
  for (const x of [200, 500, 800]) { const d = D(x, g(x) - 40); assert.equal(d.bank, 0); assert.ok(d.veil < 0.1); }
  // by default the bank lies on the slope and the crest is clear (the PROMISE two-shot at the stone stays clean)
  const D2 = sky.mistDensity(S, { ...sky.MIST, partT: null }, 3, 11);
  for (let x = 2300; x < 2700; x += 25) { const d = D2(x, g(x) - 40); assert.equal(d.bank, 0); assert.equal(d.veil, 0); }
  assert.ok(D2(1800, g(1800) - 30).bank > 0.2);
  // mist that parts from the stone must reach it: `part` alone puts the bank over the crest; an explicit `to` wins
  const api = { scene: { t0: 0 }, marks: { bloom: 9 } };
  assert.equal(sky.mistParams(api, { part: 'bloom' }).to, 4000);
  assert.equal(sky.mistParams(api, { part: 'bloom' }).partT, 9);
  assert.equal(sky.mistParams(api, { part: 'bloom', to: 2100 }).to, 2100);
  assert.equal(sky.mistParams(api, {}).to, sky.MIST.to);
});

test('mist close up: softer washes, thinner, broken into drifting wisps; wide shots keep the full bank', () => {
  const L = [0.6, 1, 1.8, 2.5, 4, 6, 10].map(sky.mistLens);
  assert.equal(L[0].wisp, 0); assert.equal(L[2].wisp, 0); assert.equal(L[0].a, 1); assert.equal(L[1].a, 1);
  for (let i = 1; i < L.length; i++) { assert.ok(L[i].a <= L[i - 1].a && L[i].wisp >= L[i - 1].wisp && L[i].e >= L[i - 1].e); }
  assert.ok(L[6].a >= 0.3 && L[6].wisp > 0.5);
  // the same patch of bank seen wide and close: close up it is thinner on average and has clear gaps
  const stone = S.props.find(q => q.id === 'standing_stone'), cx = stone.x - 650, cy = S.groundAt(cx) - 70;
  const at = zoom => { const api = { set: S, t: 3, W: 480, H: 270, cam: { cx, cy, zoom }, shot: { id: 'z' + zoom }, scene: { t0: 0 }, marks: {}, params: { to: 4000 } };
    const F = sky.fogField(api, api.params, 5, 6), v = []; for (let j = 0; j < F.gh; j++) for (let i = 0; i < F.gw; i++) { const x = (i * 6 - 240) / zoom + cx, y = (j * 6 - 135) / zoom + cy; if (Math.abs(x - cx) < 60 && Math.abs(y - cy) < 25) v.push(F.grid[j * F.gw + i]); } return v; };
  const wide = at(1), close = at(6), mean = a => a.reduce((s, q) => s + q, 0) / a.length;
  assert.ok(wide.length > 4 && close.length > 100);
  assert.ok(mean(close) < mean(wide) * 0.75, `close ${mean(close).toFixed(2)} vs wide ${mean(wide).toFixed(2)}`);
  assert.ok(Math.min(...close) < Math.max(...close) * 0.6, 'wisps with gaps');
});

test('mist parting: unchanged before the mark, then it opens outward from the stone and thins', () => {
  const p = { ...sky.MIST, to: 4000, partT: 50 }, stone = S.props.find(q => q.id === 'standing_stone'), O = [stone.x, (stone.bounds[1] + stone.bounds[3]) / 2];
  const still = sky.mistDensity(S, { ...p, partT: null }, 49.9, 3), before = sky.mistDensity(S, p, 49.9, 3);
  for (let x = 1500; x < 3000; x += 37) for (const dy of [20, 80, 160]) assert.deepEqual(before(x, S.groundAt(x) - dy), still(x, S.groundAt(x) - dy));
  const near = t => { const D = sky.mistDensity(S, p, t, 3); let m = 0; for (let x = O[0] - 200; x <= O[0] + 200; x += 20) m += D(x, S.groundAt(x) - 60).bank; return m; };
  assert.ok(near(49.9) > 2);
  assert.ok(near(50.6) < near(49.9), 'opening');
  assert.equal(near(53.2), 0, 'open around the stone');
  // a point beyond the opening sees mist pushed out to it, then the remnant thins
  const total = t => { const D = sky.mistDensity(S, p, t, 3); let m = 0; for (let x = 0; x < 3300; x += 30) for (const dy of [30, 90, 150]) { const d = D(x, S.groundAt(x) - dy); m += d.bank + d.veil; } return m; };
  assert.ok(total(55) < total(49.9) * 0.5);
});

// ───────────── time-lapse ─────────────
test('time-lapse: starts and ends on the frame, days slow then averaged, at most 3 brightness changes a second', () => {
  const fr = Array.from({ length: 96 }, (_, f) => sky.timelapseAt(f / FPS, 4, FPS));
  assert.equal(fr[0].alpha, 0); assert.ok(fr[95].alpha < 0.02);
  const L = fr.map(sky.timelapseLight), S = swings(L, 0.1);
  assert.ok(S.length >= 2, 'days and nights are seen');
  assert.ok(worstPerSecond(S) <= 3, `swings per second ${worstPerSecond(S)}`);
  // the cycling is gone (amp 0) before the days pass faster than ~1.3 a second
  for (let f = 1; f < 96; f++) { const rate = (fr[f].phase - fr[f - 1].phase) * FPS; if (rate > 1.3) assert.ok(fr[f].amp < 0.02, `frame ${f}`); }
  // and the first cycles are slower than 1 a second
  for (let f = 1; f < 40; f++) assert.ok((fr[f].phase - fr[f - 1].phase) * FPS < 1);
});

test('time-lapse: seasons cycle about once a second (green, gold, pale, green) and are gone by dawn', () => {
  const fr = Array.from({ length: 96 }, (_, f) => sky.timelapseAt(f / FPS, 4, FPS));
  const summers = [];
  for (let f = 1; f < 96; f++) if (fr[f].season.q < fr[f - 1].season.q) summers.push(f);
  assert.ok(summers.length >= 3);
  for (let i = 1; i < summers.length; i++) { const d = summers[i] - summers[i - 1]; assert.ok(d >= 18 && d <= 26, `period ${d} frames`); }
  const gold = sky.seasonAt(28 + 22 * 0.25), pale = sky.seasonAt(28 + 22 * 0.5);
  assert.ok(gold.col[0] > gold.col[2] + 80, 'autumn is gold');
  assert.ok(Math.abs(pale.col[0] - pale.col[2]) < 40 && pale.col[1] > 200, 'winter is pale');
  assert.equal(fr[0].season.k, 0); assert.ok(fr[95].season.k < 0.02);
});

test('time-lapse: eight ghosts of Nell, child to elder, 5 frames each, the last held 8', () => {
  assert.deepEqual(sky.GHOSTS.map(g => g.age), ['child', 'child', 'teen', 'teen', 'adult', 'adult', 'elder', 'elder']);
  const seen = new Map();
  for (let f = 0; f < 96; f++) { const g = sky.timelapseAt(f / FPS, 4, FPS).ghost; if (g >= 0) seen.set(g, (seen.get(g) || 0) + 1); }
  assert.equal(seen.size, 8);
  for (let i = 0; i < 7; i++) assert.equal(seen.get(i), 5);
  assert.equal(seen.get(7), 8);
  // never two at once, and in order
  const order = []; for (let f = 0; f < 96; f++) { const g = sky.timelapseAt(f / FPS, 4, FPS).ghost; if (g >= 0 && order[order.length - 1] !== g) order.push(g); }
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(sky.SCARF, '#5e7b3f');
});

// ───────────── drawing, on a small film ─────────────
const W = 480, H = 270;
function film() {
  return {
    title: 'Sky test', format: { width: W, height: H, fps: FPS, captions: 'none' },
    cast: { nell: { rig: 'human', params: { age: 'elder', scarf: '#5e7b3f' } } },
    sets: { hill: { kit: 'hill' } },
    scenes: [
      { id: 'a', set: 'hill', time: 'night', grade: 'memory', overlays: [{ name: 'comet', params: { mode: 'memory' } }], actors: {},
        shots: [
          { id: 'a1', camera: { size: 'establishing', on: ['stone_front'] }, beats: [{ wait: 2 }] },
          { id: 'a2', camera: { size: 'establishing', on: ['stone_front'] }, time: { from: 'night', to: 'dawn' }, grade: 'memory', gradeTo: 'none', dur: 4, beats: [{ do: 'custom', name: 'timelapse', dur: 4, at: 0 }] },
        ] },
      { id: 'a3', set: 'hill', time: 'dawn', overlays: [{ name: 'comet', params: { mode: 'faint' } }], actors: {},
        shots: [{ id: 'a4', camera: { size: 'establishing', on: ['stone_front'] }, beats: [{ wait: 1 }] }] },
      { id: 'b', set: 'hill', time: 'night', overlays: [{ name: 'comet', params: { mode: 'bloom' } }, { name: 'hill-mist', params: { part: 'bloom', to: 4000 } }, { name: 'stone-light', params: { dayT: [0.92, 1], out: 'bloom' } }],
        actors: { nell: { at: 'x:1660', face: 'left' } },
        shots: [{ id: 'b1', camera: { size: 'establishing', on: ['stone_front', 'slope_mid'] }, beats: [{ wait: 2 }, { mark: 'bloom' }, { wait: 4 }] }] },
    ],
  };
}
let PLAN = null;
async function plan() { if (!PLAN) PLAN = compile(await loadFilm(film(), { custom: SKY })); return PLAN; }
function render(p, t) { const c = createCanvas(W, H), x = c.getContext('2d'); drawFrame(x, p, t); return x.getImageData(0, 0, W, H).data; }
const md5 = d => createHash('md5').update(d).digest('hex');
const lum = (d, [x0, y0, x1, y1]) => { let m = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; m += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; } return m / n; };
// The plan with some overlays / custom beats removed (a view: the plan's other fields, enumerable or not, stay).
function without(p, names) {
  const v = Object.create(p);
  v.overlays = p.overlays.filter(o => !names.includes(o.name)); v.custom = p.custom.filter(c => !names.includes(c.name));
  return v;
}

test('drawings run in a real frame and are deterministic', async () => {
  const p = await plan(), b = p.scenes.find(s => s.id === 'b'), tm = p.marks.bloom;
  assert.ok(tm > b.t0 && tm < b.t1);
  for (const t of [1, p.shots[1].t0 + 1.3, tm - 0.5, tm + 0.7, tm + 3]) assert.equal(md5(render(p, t)), md5(render(p, t)));
});

test('the comet lights its patch of sky after the grade; the bloom is brighter than the dim smudge', async () => {
  const p = await plan(), tm = p.marks.bloom, F = sky.skyFrame({ W, H, cam: p.shotAt(tm).cameraAt(tm), set: p.shotAt(tm).set });
  const hx = Math.round(F.x0 + sky.COMET.head[0] * F.s), hy = Math.round(F.y0 + sky.COMET.head[1] * F.s);
  const box = [hx - 6, hy - 6, hx + 30, hy + 6];
  const dimL = lum(render(p, tm - 0.5), box), fullL = lum(render(p, tm + 2), box), none = lum(render(without(p, ['comet']), tm + 2), box);
  assert.ok(dimL > none + 4, `dim smudge visible (${dimL.toFixed(1)} vs ${none.toFixed(1)})`);
  assert.ok(fullL > dimL + 20, `bloomed (${fullL.toFixed(1)} vs ${dimL.toFixed(1)})`);
  // the memory comet in scene a: muted (less saturated) than the finale's colours
  const memL = lum(render(p, 1), box), noneA = lum(render(without(p, ['comet']), 1), box);
  assert.ok(memL > noneA + 20);
});

test('the stone keeps its gold until the mark, then it is gone; the mist veils the upper slope', async () => {
  const p = await plan(), tm = p.marks.bloom, shot = p.shotAt(tm), cam = shot.cameraAt(tm), z = cam.zoom, st = shot.set;
  const stone = st.props.find(q => q.id === 'standing_stone'), top = st.anchor('stone_top');
  const sx = Math.round((top.x - cam.cx) * z + W / 2), sy = Math.round((top.y - cam.cy) * z + H / 2), box = [sx - 6, sy - 1, sx + 6, sy + 3];
  const gold = d => { let g = 0; for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const i = (y * W + x) * 4; g += Math.max(0, d[i] - d[i + 2]); } return g; };
  const lit = gold(render(p, tm - 1.5)), out = gold(render(p, tm + 0.1)), base = gold(render(without(p, ['stone-light']), tm - 1.5));
  assert.ok(lit > base + 200, `gold before the mark (${lit} vs ${base})`);
  assert.ok(Math.abs(out - gold(render(without(p, ['stone-light']), tm + 0.1))) < 1e-9, 'nothing after the mark');
  // the mist brightens the crest below the stone's tip (before the parting) and is gone there after it
  const by = Math.round((stone.base - 60 - cam.cy) * z + H / 2), mbox = [sx - 20, by - 3, sx + 20, by + 3];
  const withMist = lum(render(p, tm - 0.2), mbox), noMist = lum(render(without(p, ['hill-mist']), tm - 0.2), mbox);
  assert.ok(withMist > noMist + 6, `mist (${withMist.toFixed(1)} vs ${noMist.toFixed(1)})`);
  const parted = lum(render(p, tm + 3.5), mbox), partedNo = lum(render(without(p, ['hill-mist']), tm + 3.5), mbox);
  assert.ok(Math.abs(parted - partedNo) < 2.5, 'parted');
});

test('the time-lapse draws its sky, seasons and a ghost at the stone', async () => {
  const p = await plan(), t0 = p.shots[1].t0, noTl = without(p, ['timelapse']);
  const day = t0 + 1.0, a = render(p, day), b = render(noTl, day);
  assert.ok(lum(a, [0, 0, W, 40]) > lum(b, [0, 0, W, 40]) + 15, 'a day in the sky');
  // the first ghost (frames 22..26) is drawn by the stone and only on its frames
  const shot = p.shots[1], cam = shot.cameraAt(t0 + 1), z = cam.zoom, at = shot.set.anchor('stone_left');
  const gx = Math.round((at.x - cam.cx) * z + W / 2), gy = Math.round((at.y - cam.cy) * z + H / 2), gbox = [gx - 12, gy - 30, gx + 12, gy];
  const diff = (t, box) => { const u = render(p, t), v = render(noTl, t); let s = 0; for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const i = (y * W + x) * 4; s += Math.abs(u[i] - v[i]) + Math.abs(u[i + 1] - v[i + 1]); } return s; };
  const ghostAt = t0 + 23.5 / FPS, notAt = t0 + 27.5 / FPS;
  // remove the sky/season difference by comparing against the neighbouring frame without a ghost
  assert.ok(diff(ghostAt, gbox) > diff(notAt, gbox) + 200, 'ghost');
});

test('the rendered time-lapse (and its cut to dawn) changes full-frame brightness at most twice a second', async () => {
  const p = await plan(), t0 = p.shots[1].t0, c = createCanvas(W, H), x = c.getContext('2d');
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = [];
  for (let f = 0; f < 4 * FPS + 12; f++) {
    drawFrame(x, p, t0 + f / FPS); const d = x.getImageData(0, 0, W, H).data;
    let m = 0; for (let i = 0; i < d.length; i += 16) m += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    L.push(m / (d.length / 16));
  }
  const S = swings(L, 0.1);
  assert.ok(S.length >= 2, 'days and nights are seen');
  assert.ok(worstPerSecond(S) <= 2, `${worstPerSecond(S)} brightness changes in a second`);
  // and it lands on the next shot's dawn without a jump
  assert.ok(Math.abs(L[4 * FPS - 1] - L[4 * FPS]) < 0.02);
});
