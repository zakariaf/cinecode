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
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { getKit } from '../engine/set/kits/index.mjs';
import { clamp } from '../engine/core/lib.mjs';

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
  // that is for faces: a close-up that frames no figure (9.5 on the stone's tip above the mist) keeps the mist
  for (const z of [4, 8.4]) { const l = sky.mistLens(z, false); assert.ok(l.a >= 0.85 && l.wisp <= 0.3 && l.e === sky.mistLens(z).e); }
  // the same patch of bank seen wide and close: close up it is thinner on average and has clear gaps
  const stone = S.props.find(q => q.id === 'standing_stone'), cx = stone.x - 650, cy = S.groundAt(cx) - 70;
  const at = zoom => { const api = { set: S, t: 3, W: 480, H: 270, cam: { cx, cy, zoom }, shot: { id: 'z' + zoom }, scene: { t0: 0 }, marks: {}, params: { to: 4000 } };
    const F = sky.fogField(api, api.params, 5, 6), v = []; for (let j = 0; j < F.gh; j++) for (let i = 0; i < F.gw; i++) { const x = (i * 6 - 240) / zoom + cx, y = (j * 6 - 135) / zoom + cy; if (Math.abs(x - cx) < 60 && Math.abs(y - cy) < 25) v.push(F.grid[j * F.gw + i]); } return v; };
  const wide = at(1), close = at(6), mean = a => a.reduce((s, q) => s + q, 0) / a.length;
  assert.ok(wide.length > 4 && close.length > 100);
  assert.ok(mean(close) < mean(wide) * 0.75, `close ${mean(close).toFixed(2)} vs wide ${mean(wide).toFixed(2)}`);
  assert.ok(Math.min(...close) < Math.max(...close) * 0.6, 'wisps with gaps');
});

test('mist parting: unchanged before the mark and on it, then it opens outward from the stone and thins to a lasting veil', () => {
  const p = { ...sky.MIST, to: 4000, partT: 50 }, stone = S.props.find(q => q.id === 'standing_stone'), O = [stone.x, (stone.bounds[1] + stone.bounds[3]) / 2];
  // on the mark frame the field is still the one before it (it used to vanish there in one frame), and one frame later
  // it has barely moved
  for (const t of [49.9, 50]) {
    const still = sky.mistDensity(S, { ...p, partT: null }, t, 3), before = sky.mistDensity(S, p, t, 3);
    for (let x = 1500; x < 3000; x += 37) for (const dy of [20, 80, 160, 220]) assert.deepEqual(before(x, S.groundAt(x) - dy), still(x, S.groundAt(x) - dy));
  }
  const D0 = sky.mistDensity(S, { ...p, partT: null }, 50 + 1 / 24, 3), D1 = sky.mistDensity(S, p, 50 + 1 / 24, 3);
  for (let x = O[0] - 295; x <= O[0] + 300; x += 10) for (let y = O[1] - 145; y <= O[1] + 150; y += 10) assert.ok(Math.abs(D1(x, y).bank - D0(x, y).bank) < 0.05, `frame after the mark at ${x}, ${y}`);
  const near = t => { const D = sky.mistDensity(S, p, t, 3); let m = 0; for (let x = O[0] - 200; x <= O[0] + 200; x += 20) m += D(x, S.groundAt(x) - 60).bank; return m; };
  const mid = t => { const D = sky.mistDensity(S, p, t, 3); let m = 0; for (let x = O[0] - 100; x <= O[0] + 100; x += 10) for (let y = O[1] - 60; y <= O[1] + 60; y += 10) m += D(x, y).bank; return m; };
  assert.ok(near(49.9) > 2 && mid(49.9) > 50);
  assert.ok(mid(50.6) < mid(49.9) * 0.9, 'opening from the stone (what the close-up on its tip sees)');
  assert.ok(near(51) < near(49.9) * 0.6, 'reaching its foot within a second');
  assert.equal(near(53.2), 0, 'open around the stone');
  // the pushed mist lies on the slope below the clearing at the end of the 9.5 pull-back: a lit veil, not nothing
  const D = sky.mistDensity(S, p, 54.5, 3); let ring = 0;
  for (let x = 1100; x <= 1700; x += 20) for (const h of [10, 30, 60]) ring = Math.max(ring, sky.glaze(D(x, S.groundAt(x) - h).bank));
  assert.ok(ring > 0.25, `the parted mist is still there (${ring.toFixed(2)})`);
  // a point beyond the opening sees mist pushed out to it, then the remnant thins
  const total = t => { const D = sky.mistDensity(S, p, t, 3); let m = 0; for (let x = 0; x < 3300; x += 30) for (const dy of [30, 90, 150]) { const d = D(x, S.groundAt(x) - dy); m += d.bank + d.veil; } return m; };
  assert.ok(total(55) < total(49.9) * 0.5);
});

test('mist has no hard top: above the ground skin its opacity never steps by more than 0.12 per 4 world px', () => {
  const p = { ...sky.MIST, to: 4000, partT: null }, g = x => S.groundAt(x);
  for (const t of [3, 17.5, 40]) {
    const D = sky.mistDensity(S, p, t, 11);
    let worst = 0;
    for (let x = p.from - 300; x <= 3000; x += 25) {
      let prev = null;
      for (let h = 60; h <= p.top * 1.5; h += 4) { const o = sky.glaze(D(x, g(x) - h).bank); if (prev != null) worst = Math.max(worst, Math.abs(o - prev)); prev = o; }
    }
    assert.ok(worst < 0.12, `step ${worst.toFixed(3)} at t ${t}`);   // the old bank's washes stepped by 0.34 along its top
  }
});

test('mist is low where the figures walk and thicker up the slope; over the crest only the stone tip stands clear', () => {
  const p = { ...sky.MIST, to: 4000, partT: null }, g = x => S.groundAt(x), D = sky.mistDensity(S, p, 3, 11);
  const column = x0 => { let s = 0; for (let x = x0 - 60; x <= x0 + 60; x += 20) for (let h = 0; h <= 400; h += 5) s += D(x, g(x) - h).bank; return s; };
  const cols = [p.from + 150, p.from + 300, p.from + 600, 2420].map(column);
  for (let i = 1; i < cols.length; i++) assert.ok(cols[i] > cols[i - 1], `deeper up the slope (${cols.map(c => c.toFixed(0))})`);
  // where Nell comes down and stops (x ≈ 1450..1600), chest and head height (150+ of her ~290 px) are clear
  for (let x = 1400; x <= 1650; x += 10) for (const h of [150, 200, 260]) assert.ok(sky.glaze(D(x, g(x) - h).bank) < 0.05, `clear at ${x}, ${h}`);
  // over the crest: the stone's foot is veiled, its top (> 0.8 of its ~310 px) above the mist
  const mean = h => { let m = 0, n = 0; for (let x = 2270; x <= 2570; x += 10) { m += sky.glaze(D(x, g(x) - h).bank); n++; } return m / n; };
  assert.ok(mean(40) > 0.5 && mean(80) > 0.4, 'the foot of the stone is in the mist');
  assert.ok(mean(290) < 0.05, 'the tip is clear');
  // a wash with no mist has no opacity whatever its softness (close-ups used to fog the whole frame, sky included)
  for (const e of [0.06, 0.12, 0.2]) { assert.equal(sky.washes(0, e), 0); assert.equal(sky.glaze(0, e), 0); }
  const stone = S.props.find(q => q.id === 'standing_stone');
  const api = { set: S, t: 3, W: 480, H: 270, cam: { cx: stone.x - 300, cy: g(stone.x) - 700, zoom: 6 }, shot: { id: 'sky-close' }, scene: { t0: 0 }, marks: {}, params: { to: 4000 } };
  assert.equal(sky.fogField(api, api.params, 5, 6).any, 0, 'a close-up of the sky above the mist is clear');
});

test('over the crest the mist hides the stone up to its tip: near opaque to over half its height, clear at the tip', () => {
  const stone = S.props.find(q => q.id === 'standing_stone'), g = S.groundAt(stone.x), top = stone.bounds[1], hs = g - top;
  // the drawn opacity (alpha of the fog canvas) in a column through the stone, in a wide shot (zoom 1)
  const cy = g - hs / 2, api = { set: S, t: 3, W: 480, H: 480, cam: { cx: stone.x, cy, zoom: 1 }, shot: { id: 'crest-depth' }, scene: { t0: 0 }, marks: {}, params: { to: 4000 } };
  const F = sky.fogField(api, api.params, 7, 4), d = F.c.getContext('2d').getImageData(0, 0, F.gw, F.gh).data;
  const at = h => { const j = Math.round((g - h - cy + 240) / 4), i = Math.round(240 / 4); let m = 0; for (let k = -3; k <= 3; k++) m += d[(j * F.gw + i + k) * 4 + 3] / 255; return m / 7; };
  for (const f of [0.1, 0.3, 0.5, 0.55]) assert.ok(at(hs * f) >= 0.85, `hidden at ${f} of its height (${at(hs * f).toFixed(2)})`);
  assert.ok(at(hs * 0.7) > 0.4, 'still veiled at 0.7');
  for (const f of [0.92, 0.97]) assert.ok(at(hs * f) < 0.05, `the tip is clear at ${f} (${at(hs * f).toFixed(2)})`);
  // the default bank (the crest left clear, as 8.x has it) is not made any deeper by this
  const api2 = { ...api, shot: { id: 'crest-clear' }, params: {} }, F2 = sky.fogField(api2, api2.params, 7, 4);
  assert.equal(F2.any, 0);
});

test('the parting: slow on the stone tip, then a ring that keeps ahead of the 9.5 pull-back', () => {
  const R = sky.partRadius;
  assert.equal(R(0), 0); assert.equal(R(-1), 0);
  for (let t = 0.05; t < 8; t += 0.05) assert.ok(R(t) > R(t - 0.05), 'grows');
  assert.ok(R(0.5) > 20 && R(1) < 300, 'the wisps under the tip begin to move in the close-up');
  // the cleared core stays inside an extreme-wide frame (half width ≈ 1600 world px at zoom 0.6) while the ring is seen
  for (const t of [2, 2.5, 3, 3.5]) assert.ok(R(t) * sky.PART.clear < 1000 + (t - 2) * 400, `core at ${t}`);
  assert.ok(R(3) > 800, 'and is wide by the end of the pull-back');
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
  // a shorter beat (the film's is 3.5 s = 84 frames) moves them with it: all eight are seen, and the old woman's 8
  // frames end on the beat's last frame (she used to fall after its end, frames 87..94, and never played)
  for (const dur of [3.5, 3.75]) {
    const n = Math.round(dur * FPS), at = new Map();
    for (let f = 0; f < n; f++) { const g = sky.timelapseAt(f / FPS, dur, FPS).ghost; if (g >= 0) at.set(g, [...(at.get(g) || []), f]); }
    assert.equal(at.size, 8, `${dur} s`);
    for (let i = 0; i < 7; i++) assert.equal(at.get(i).length, 5);
    assert.deepEqual(at.get(7), Array.from({ length: 8 }, (_, i) => n - 8 + i), `the last held 8 frames to the end of a ${dur} s beat`);
  }
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
      // she comes down out of the mist: an alpha fade where the mist lies (as film.json 9.1 does it)
      { id: 'c', set: 'hill', time: 'night', overlays: [{ name: 'hill-mist', params: {} }], actors: { nell: { at: 'x:1610', face: 'left' } },
        shots: [{ id: 'c1', camera: { size: 'wide', on: ['nell'] }, beats: [{ do: 'fade', who: 'nell', to: 0, dur: 0.01, at: 0 }, { do: 'fade', who: 'nell', to: 1, dur: 1.4, at: 1.5 }, { wait: 2 }] }] },
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

test('the time-lapse land takes the light of the sky over it: dark under its nights, lit under its days', async () => {
  const p = await plan(), c = p.custom.find(q => q.name === 'timelapse'), dur = c.t1 - c.t0, noTl = without(p, ['timelapse']);
  // the frames of the cycling days (alpha high, amp 1) where the sky is darkest and brightest
  let night = null, day = null;
  for (let f = 0; f < dur * FPS; f++) { const s = sky.timelapseAt(f / FPS, dur, FPS); if (s.alpha < 0.6 || s.amp < 0.98) continue; if (!night || s.day < night.day) night = { ...s, t: c.t0 + f / FPS }; if (!day || s.day > day.day) day = { ...s, t: c.t0 + f / FPS }; }
  assert.ok(night && day && night.day < 0.15 && day.day > 0.85, 'a night and a day are seen');
  const skyBox = [0, 0, W, 30], landBox = [0, Math.round(H * 0.72), W, H];
  const N = render(p, night.t), D = render(p, day.t);
  assert.ok(lum(N, skyBox) < lum(D, skyBox) - 30, 'the sky turns');
  assert.ok(lum(N, landBox) < lum(D, landBox) * 0.75, `the land darkens with it (${lum(N, landBox).toFixed(0)} vs ${lum(D, landBox).toFixed(0)})`);
  // at night the land is darker than the frame's own (night-to-dawn graded) land; by day it is lighter
  assert.ok(lum(N, landBox) < lum(render(noTl, night.t), landBox), 'night land below the shot grade');
  assert.ok(lum(D, landBox) > lum(render(noTl, day.t), landBox), 'day land above it');
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

test('a figure in the mist is veiled by only part of it (the ground behind is further away), so it stays readable', async () => {
  const p = await plan(), tm = p.marks.bloom, t = tm - 0.5;
  const nb = frameInfo(p, t).actors.find(a => a.id === 'nell').screenBox.map(Math.round);
  const opaque = Object.create(p); opaque.overlays = p.overlays.map(o => (o.name === 'hill-mist' ? { ...o, params: { ...o.params, through: 1 } } : o));
  const bare = render(without(p, ['hill-mist']), t);
  const change = d => { let s = 0, n = 0; for (let y = Math.max(0, nb[1]); y < Math.min(H, nb[3]); y++) for (let x = Math.max(0, nb[0]); x < Math.min(W, nb[2]); x++) { const i = (y * W + x) * 4; s += Math.abs(d[i] - bare[i]) + Math.abs(d[i + 1] - bare[i + 1]) + Math.abs(d[i + 2] - bare[i + 2]); n++; } return s / n; };
  const veiled = change(render(p, t)), full = change(render(opaque, t));
  assert.ok(full > 5, `there is mist on her (${full.toFixed(1)})`);
  assert.ok(veiled < full * 0.7, `half veiled (${veiled.toFixed(1)} vs ${full.toFixed(1)})`);
});

test('the comet lights the land without greying the night: the land gains contrast, and the parted mist glows gold', async () => {
  const p = await plan(), tm = p.marks.bloom, noComet = without(p, ['comet']);
  const land = d => { const L = []; for (let y = Math.round(H * 0.62); y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); } L.sort((a, b) => a - b); return q => L[Math.floor(q * (L.length - 1))]; };
  const lit = land(render(p, tm + 3)), dark = land(render(noComet, tm + 3));
  assert.ok(lit(0.9) > dark(0.9) + 6, 'the lit land brightens');
  assert.ok(lit(0.9) / lit(0.1) >= dark(0.9) / dark(0.1) - 0.02, `no grey wash (${(lit(0.9) / lit(0.1)).toFixed(2)} vs ${(dark(0.9) / dark(0.1)).toFixed(2)})`);
  // where the mist is, the bloom turns it from moonlit blue toward gold (R − B), far more than the dim comet does
  const warmth = t => {
    const a = render(p, t), m0 = render(without(p, ['hill-mist']), t), c0 = render(noComet, t);
    let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - m0[i]) + Math.abs(a[i + 2] - m0[i + 2]) > 24) { s += (a[i] - a[i + 2]) - (c0[i] - c0[i + 2]); n++; }
    return n > 200 ? s / n : 0;
  };
  const before = warmth(tm - 0.5), after = warmth(tm + 2.5);
  assert.ok(after > 30 && after > before + 25, `gold mist (${after.toFixed(1)} vs ${before.toFixed(1)} before the bloom)`);
});

test('after the bloom the stone catches the comet: its face toward it turns warm and brighter, with a gold edge; none before', async () => {
  const p = await plan(), tm = p.marks.bloom, K = { ...sky.STONE_KEY };
  const off = t => { Object.assign(sky.STONE_KEY, { hue: 0, face: 0, edge: 0 }); try { return render(p, t); } finally { Object.assign(sky.STONE_KEY, K); } };
  assert.equal(sky.stoneKeyAt({ key: 0.12, B: 0.34 }), 0, 'the dim smudge lights nothing');
  assert.equal(sky.stoneKeyAt({ key: 1, B: 1 }), 1);
  assert.equal(md5(render(p, tm - 0.5)), md5(off(tm - 0.5)), 'nothing before the bloom');
  const t = tm + 3, shot = p.shotAt(t), cam = shot.cameraAt(t), z = cam.zoom, b = shot.set.props.find(q => q.id === 'standing_stone').bounds;
  const [x0, y0, x1, y1] = b.map((v, i) => Math.round(i % 2 ? (v - cam.cy) * z + H / 2 : (v - cam.cx) * z + W / 2)), xm = Math.round((x0 + x1) / 2);
  const stats = (d, [a0, a1]) => { let w = 0, l = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = a0; x < a1; x++) { const i = (y * W + x) * 4; w += d[i] - d[i + 2]; l += luma(d, i); n++; } return { warm: w / n, lum: l / n }; };
  const on = render(p, t), dark = off(t), L = stats(on, [x0, xm]), L0 = stats(dark, [x0, xm]), R = stats(on, [xm, x1]), R0 = stats(dark, [xm, x1]);
  assert.ok(L.warm > L0.warm + 6 && L.lum > L0.lum + 3, `the face toward the comet (warmth ${L0.warm.toFixed(1)} → ${L.warm.toFixed(1)}, light ${L0.lum.toFixed(1)} → ${L.lum.toFixed(1)})`);
  assert.ok(L.lum - L0.lum > (R.lum - R0.lum) * 1.3, 'more than the far side');
});

test('depth of field: in a close shot the comet and its masks are as soft as the frame; wide shots stay sharp', async () => {
  const p = await plan(), tm = p.marks.bloom, shot = p.shotAt(tm), scene = p.scenes.find(s => s.id === shot.scene), cam0 = shot.cameraAt(tm);
  // masks are made inside a frame, after the set has drawn its hazed far layers (a set's drawBack without haze paints
  // its far layers differently before its first hazed draw: engine/set/set.mjs, not this module)
  render(p, tm);
  // masks at full HD (the blur is in screen px; the test film's 480 px frame would make it sub-pixel)
  const api = (sh, cam) => ({ t: tm, W: 1920, H: 1080, cam, shot: sh, scene, set: shot.set, plan: p, marks: p.marks, params: {} });
  assert.equal(sky.dofOf(api(shot, cam0)), 0, 'the establishing shot has no blur');
  const nell = p.actorsAt(tm, shot.scene).find(a => a.id === 'nell'), cam = { cx: nell.x, cy: nell.y - 120, zoom: 2.2 };
  const close = { ...shot, id: 'close', dof: true, on: ['nell'] }, sharp = { ...close, id: 'sharp', dof: false };
  assert.ok(sky.dofOf(api(close, cam)) >= 5, 'a close shot with dof: true blurs at least 5 px');
  assert.equal(sky.dofOf(api({ ...close, on: ['nobody'] }, cam)), 0, 'no framed subject on stage: no blur (as the frame does)');
  // a blurred mask has less edge: its total variation (summed alpha steps between neighbours) falls
  const tv = m => { const w = m.width, d = m.getContext('2d').getImageData(0, 0, w, m.height).data; let s = 0; for (let i = 3; i < d.length - 4 * w; i += 4) s += Math.abs(d[i] - d[i + 4]) + Math.abs(d[i] - d[i + 4 * w]); return s; };
  const tSharp = tv(sky.coverMask(api(sharp, cam), 0.5)), tSoft = tv(sky.coverMask(api(close, cam), 0.5));
  assert.ok(tSoft < tSharp * 0.8, `soft edges (${tSoft} vs ${tSharp})`);
});

test('at the bloom the stars come out one by one over its rise', () => {
  const tm = 100, T = Array.from({ length: sky.STARS_ON.n }, (_, i) => sky.bloomStarTime(i, tm));
  for (const t of T) assert.ok(t >= tm + sky.BLOOM_STARS.after && t <= tm + sky.BLOOM_STARS.after + sky.BLOOM_STARS.span);
  for (let i = 1; i < T.length; i++) assert.ok(T[i] > T[i - 1] - sky.BLOOM_STARS.span / sky.STARS_ON.n, 'brightest first, in order');
  assert.equal(sky.bloomStarTime(7, tm), sky.bloomStarTime(7, tm));
});

// ───────────── round 3: the lining, the bloom's ring, a figure out of the mist, the comet in soft focus ─────────────
const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const median = v => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

test('the comet lines the clouds with a crisp edge that falls off into them (full resolution, no flat offset band)', async () => {
  const p = await plan(), t = p.marks.bloom + 3, shot = p.shotAt(t), scene = p.scenes.find(s => s.id === shot.scene);
  render(p, t);   // the set's hazed layers (see the depth of field test)
  const api = { t, W: 1920, H: 1080, cam: shot.cameraAt(t), shot, scene, set: shot.set, plan: p, marks: p.marks, params: { mode: 'bloom' } };
  const st = sky.cometState(api), F = sky.skyFrame(api), P = { hx: F.x0 + st.pos[0] * F.s, hy: F.y0 + st.pos[1] * F.s, s: F.s, L: st.L, B: st.B };
  const lit = createCanvas(960, 540), lx = lit.getContext('2d'); lx.fillStyle = '#fff'; lx.fillRect(0, 0, 960, 540);   // no falloff
  // drawn unscaled over the clouds' box: full resolution (a half-res line shows its pixels as steps)
  const L = sky.cloudLight(api, st, P, lit, [255, 255, 255]), lw = L.c.width, lh = L.c.height;
  assert.ok(L.x >= 0 && L.y >= 0 && L.x + lw <= 1920 && L.y + lh <= 1080 && lw * lh < 1920 * 1080, 'only over the clouds');
  const d = L.c.getContext('2d').getImageData(0, 0, lw, lh).data, a = (x, y) => { x = Math.round(x) - L.x; y = Math.round(y) - L.y; return x < 0 || y < 0 || x >= lw || y >= lh ? 0 : d[(y * lw + x) * 4 + 3] / 255; };
  // along rays from the head toward the frame's middle, where each first meets a cloud
  const dx = 960 - P.hx, dy = 540 - P.hy, dl = Math.hypot(dx, dy), found = [];
  for (let ang = -0.6; ang <= 0.61; ang += 0.1) {
    const c = Math.cos(ang), s = Math.sin(ang), nx = (dx * c - dy * s) / dl, ny = (dx * s + dy * c) / dl, prof = [];
    for (let r = 0; r < 1400; r++) prof.push(a(P.hx + nx * r, P.hy + ny * r));
    const i = prof.findIndex(v => v > 0.3); if (i >= 4) found.push(prof.slice(i - 4, i + 30));
  }
  assert.ok(found.length >= 3, `rays meet clouds (${found.length})`);
  const peak = found.map(q => Math.max(...q));
  assert.ok(median(found.map(q => Math.max(...q.slice(4, 9)))) > 0.8, 'brightest right at the edge');
  assert.ok(median(found.map((q, j) => q.filter(v => v > peak[j] / 2).length)) <= 9, 'a line, not an 18 px band');
  assert.ok(median(found.map((q, j) => q[26] / peak[j])) < 0.45, 'falls off into the cloud');
  assert.ok(median(found.map((q, j) => q[1] / peak[j])) < 0.35, 'only a faint glow past the edge');
});

test('the lining fades near the land: a cloud lobe just over a ridge gets no gold rim (only its edges near the land change)', async () => {
  const p = await plan(), t = p.marks.bloom + 3, shot = p.shotAt(t), scene = p.scenes.find(s => s.id === shot.scene);
  render(p, t);
  const lit = createCanvas(960, 540), lx = lit.getContext('2d'); lx.fillStyle = '#fff'; lx.fillRect(0, 0, 960, 540);
  let faded = 0;
  // cameras low on the slope, where the far ridges cross the clouds
  for (const [i, cam] of [{ cx: 1300, cy: 700, zoom: 1 }, { cx: 1000, cy: 650, zoom: 0.8 }, { cx: 2000, cy: 600, zoom: 1.2 }].entries()) {
    const api = { t, W: 1920, H: 1080, cam, shot: { ...shot, id: `near-${i}` }, scene, set: shot.set, plan: p, marks: p.marks, params: { mode: 'bloom' } };
    const st = sky.cometState(api), F = sky.skyFrame(api), P = { hx: F.x0 + st.pos[0] * F.s, hy: F.y0 + st.pos[1] * F.s, s: F.s, L: st.L, B: st.B };
    const alpha = L => { const d = L.c.getContext('2d').getImageData(0, 0, L.c.width, L.c.height).data, a = new Float32Array(L.c.width * L.c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; return a; };
    const near = sky.LINING.near, A = sky.cloudLight(api, st, P, lit, [255, 255, 255]);
    if (!A) continue;
    const a = alpha(A);
    sky.LINING.near = 0; let B; try { B = sky.cloudLight(api, st, P, lit, [255, 255, 255]); } finally { sky.LINING.near = near; }
    const b = alpha(B); assert.equal(A.x, B.x); assert.equal(A.y, B.y);
    // the land (half-res cover mask), grown by 2.5 × near
    const m = sky.coverMask(api, 0.5), mw = m.width, mh = m.height, md = m.getContext('2d').getImageData(0, 0, mw, mh).data, r = Math.ceil(near * 2.5 / 2);
    let g = new Uint8Array(mw * mh); for (let i = 0; i < g.length; i++) g[i] = md[i * 4 + 3] > 128 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const o = new Uint8Array(g.length); for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx >= 0 && yy >= 0 && xx < mw && yy < mh) v = g[yy * mw + xx]; } o[y * mw + x] = v; } g = o; }
    let less = 0, far = 0;
    for (let y = 0; y < A.c.height; y++) for (let x = 0; x < A.c.width; x++) { const i = y * A.c.width + x, dlt = b[i] - a[i]; if (dlt > 0.02) { less += dlt; if (!g[Math.min(mh - 1, (y + A.y) >> 1) * mw + Math.min(mw - 1, (x + A.x) >> 1)]) far++; } }
    faded += less;
    assert.equal(far, 0, 'only near the land');
  }
  assert.ok(faded > 20, `the lining near the land is faded (${faded.toFixed(0)})`);
});

test('the bloom does not wash the night: the lit ring of mist is torn into strands and lifts no patch of land by more than 20%', async () => {
  const p = await plan(), tm = p.marks.bloom, bare = without(p, ['hill-mist']);
  for (const dt of [2, 2.5, 3]) {
    const a = render(p, tm + dt), b = render(bare, tm + dt);
    let worst = 0;
    for (let by = Math.round(H * 0.62); by + 20 <= H; by += 10) for (let bx = 0; bx + 40 <= W; bx += 20) {
      let s1 = 0, s2 = 0; for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 40; x++) { const i = (y * W + x) * 4; s1 += luma(a, i); s2 += luma(b, i); }
      worst = Math.max(worst, s1 / s2);
    }
    assert.ok(worst <= 1.2, `land lifted ${worst.toFixed(2)}x at bloom + ${dt}`);   // the flat gold sheet lifted it 1.3x here, 1.9x in 9.5
  }
  // the pushed ring is broken strands with the land between them, not a filled field
  const st = S.props.find(q => q.id === 'standing_stone'), O = (st.bounds[0] + st.bounds[2]) / 2, R = sky.partRadius(2.5);
  const D = sky.mistDensity(S, { ...sky.MIST, to: 4000, partT: 50 }, 52.5, 3), ring = [];
  for (let x = O - R * 1.05; x <= O - R * 0.65; x += 6) ring.push(D(x, S.groundAt(x) - 15).bank);
  assert.ok(Math.max(...ring) > 0.08, 'there is a ring');
  assert.ok(Math.min(...ring) < 0.35 * Math.max(...ring), 'with gaps in it');
});

test('a figure fading in where the mist lies does it inside a drift that gathers before and clears after (never a see-through ghost)', () => {
  const g = S.groundAt(1610), box = [1580, g - 290, 1640, g], fade = t => clamp((t - 10) / 1.4);
  const api = (t, x = 1610) => ({ t, scene: { id: 's' }, shot: { scene: 's' }, actor: () => ({ box: box.map((v, i) => (i % 2 ? v : v + x - 1610)) }),
    plan: { actorsAt: tt => [{ id: 'nell', x, visible: true, mode: 'ground', alpha: fade(tt) }] } });
  const p = { ...sky.MIST }, k = (t, x) => sky.emergeVeils(api(t, x), p)[0]?.k ?? 0;
  assert.equal(k(8), 0, 'no drift while she is away');
  assert.ok(k(9.7) > 0.5, 'it gathers before she appears');
  assert.ok(k(10.3) > k(10.9) && k(10.9) > k(11.2) && k(11.2) > 0, 'and thins as she becomes solid');
  assert.equal(k(11.5), 0, 'gone once she is');
  assert.equal(k(10.3, 600), 0, 'only where the mist lies');
  assert.deepEqual(sky.mistParams({ scene: { t0: 0 }, marks: {} }, {}).veils, [], 'no plan, no drift');
  const at = t => { const D = sky.mistDensity(S, { ...p, partT: null, veils: sky.emergeVeils(api(t), p) }, t, 11); return (x, h) => sky.glaze(D(x, S.groundAt(x) - h).bank); };
  const mid = at(10.4), after = at(11.6);
  for (const h of [60, 150, 230]) assert.ok(mid(1610, h) > 0.6, `veiled at ${h} (${mid(1610, h).toFixed(2)})`);
  for (const h of [150, 230]) assert.ok(after(1610, h) < 0.05, `chest and head clear again at ${h}`);
  // a drift, not a pillar: wider on the ground than at her head, nothing well above her
  const width = h => { let n = 0; for (let x = 1300; x <= 1920; x += 5) if (mid(x, h) > 0.3) n++; return n; };
  assert.ok(width(40) > width(260) * 1.3, `wider below (${width(40)} vs ${width(260)})`);
  assert.ok(mid(1610, 290 * 1.6) < 0.02);
});

test('a pale stone in the mist fades as one shape: its ink is veiled more than its pale fill (no hollow outline)', async () => {
  const p = await plan(), c = p.shots.find(s => s.id === 'c1'), t = c.t0 + 3.4, cam = c.cameraAt(t), z = cam.zoom, bare = without(p, ['hill-mist']);
  const rock = c.set.props.find(q => q.id === 'rock_mid'), sb = rock.bounds.map((v, i) => Math.round(i % 2 ? (v - cam.cy) * z + H / 2 : (v - cam.cx) * z + W / 2));
  assert.ok(sb[0] >= 0 && sb[2] <= W && sb[1] >= 0 && sb[3] <= H, 'the rock is in frame');
  assert.ok(sky.STONES.test('rock_mid') && sky.STONES.test('standing_stone') && !sky.STONES.test('hawthorn'));
  // the rock's own pixels: its ink (the darkest of them) and its pale fill (the lightest half)
  const m = createCanvas(W, H), mx = m.getContext('2d'), b = render(bare, t);
  mx.setTransform(z, 0, 0, z, W / 2 - cam.cx * z, H / 2 - cam.cy * z); c.set.propsSorted().find(q => q.id === 'rock_mid').draw(mx);
  const sil = mx.getImageData(0, 0, W, H).data, px = [];
  for (let y = sb[1]; y < sb[3]; y++) for (let x = sb[0]; x < sb[2]; x++) { const i = (y * W + x) * 4; if (sil[i + 3] > 220) px.push(i); }
  px.sort((u, v) => luma(b, u) - luma(b, v));
  const mean = (d, list) => list.reduce((s, i) => s + luma(d, i), 0) / list.length, ink = px.slice(0, Math.ceil(px.length * 0.12)), fill = px.slice(Math.floor(px.length / 2));
  const contrast = d => mean(d, fill) - mean(d, ink);
  // the same frame with the mist laid over the stone as over any land (a uniform veil)
  const own = Object.getOwnPropertyDescriptor(sky.STONES, 'test'); sky.STONES.test = () => false;
  let flat; try { flat = render(p, t); } finally { if (own) Object.defineProperty(sky.STONES, 'test', own); else delete sky.STONES.test; }
  const a = render(p, t);
  assert.ok(contrast(b) > 40 && contrast(flat) < contrast(b), 'the rock stands in the mist');
  assert.ok(contrast(a) < contrast(flat) * 0.92, `its ink fades into the mist more than a uniform veil leaves it (${contrast(a).toFixed(1)} vs ${contrast(flat).toFixed(1)})`);
  assert.ok(mean(a, fill) >= mean(flat, fill) - 0.5, 'its pale fill is not darkened');
});

test('rendered: the fade happens inside the mist, and the figure steps out of it clear', async () => {
  const p = await plan(), c = p.shots.find(s => s.id === 'c1'), bare = without(p, ['hill-mist']), t0 = c.t0 + 1.5;
  const change = t => { const nb = frameInfo(p, t).actors.find(a => a.id === 'nell').screenBox.map(Math.round), u = render(p, t), v = render(bare, t);
    let s = 0, n = 0; for (let y = Math.max(0, nb[1]); y < Math.min(H, nb[3]); y++) for (let x = Math.max(0, nb[0]); x < Math.min(W, nb[2]); x++) { const i = (y * W + x) * 4; s += Math.abs(u[i] - v[i]) + Math.abs(u[i + 1] - v[i + 1]) + Math.abs(u[i + 2] - v[i + 2]); n++; } return s / n; };
  const mid = change(t0 + 0.5), solid = change(t0 + 2.2);
  assert.ok(mid > solid * 2.5 && mid > 40, `in the mist while she fades (${mid.toFixed(1)}), clear once solid (${solid.toFixed(1)})`);
});

test('a comet half hidden by out-of-focus land rises into clear sky; clear, deeply hidden and wide-shot comets keep their place', async () => {
  const p = await plan(), tm = p.marks.bloom, shot = p.shotAt(tm), scene = p.scenes.find(s => s.id === shot.scene);
  render(p, tm);
  const api = sh => ({ t: tm, W: 1920, H: 1080, cam: sh.cameraAt(tm), shot: sh, scene, set: shot.set, plan: p, marks: p.marks, params: { mode: 'full' } });
  const mk = (id, cam, dof = true) => ({ ...shot, id, dof, on: ['nell'], t0: tm - 1, t1: tm + 1, cameraAt: typeof cam === 'function' ? cam : () => cam });
  assert.equal(sky.cometLift(api(mk('lift-wide', shot.cameraAt(tm), false))), 0, 'no blur: the locked sky position');
  let lifted = 0;
  for (const [z, cx, cy] of [[3, 1200, 900], [3, 1200, 925], [3, 1200, 950], [3, 1660, 925], [3, 1660, 1000], [5, 1660, 850], [5, 1660, 875], [5, 2200, 900]]) {
    const a = api(mk(`lift-${z}-${cx}-${cy}`, { cx, cy, zoom: z })), lift = sky.cometLift(a), F = sky.skyFrame(a), hx = F.x0 + sky.COMET.head[0] * F.s, hy = F.y0 + sky.COMET.head[1] * F.s;
    const m = sky.coverMask(a, 0.5), d = m.getContext('2d').getImageData(0, 0, m.width, m.height).data, A = (x, y) => d[(Math.round(y / 2) * m.width + Math.round(x / 2)) * 4 + 3] / 255;
    if (A(hx, hy) < sky.LIFT.hid) assert.equal(lift, 0, `a head in clear sky stays (${z}, ${cx}, ${cy})`);
    if (lift > 0) { lifted++; assert.ok(lift <= sky.LIFT.max * 1080 && A(hx, hy - lift) < 0.15, `lifted into clear sky (${z}, ${cx}, ${cy})`); }
  }
  assert.ok(lifted >= 2, `half-hidden heads are lifted (${lifted})`);
  // worked out from the shot's middle: the same whichever frame is drawn first, still within a moving shot
  const pan = t => ({ cx: 1200, cy: 925 + (t - tm) * 40, zoom: 3 });
  const late = sky.cometLift({ ...api(mk('lift-pan-a', pan)), t: tm + 0.9 }), early = sky.cometLift({ ...api(mk('lift-pan-b', pan)), t: tm - 0.9 });
  assert.equal(late, early);
  assert.equal(sky.cometLift({ ...api(mk('lift-pan-a', pan)), t: tm - 0.5 }), late);
});
