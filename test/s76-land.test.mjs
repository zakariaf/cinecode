// Seventy-Six Summers places and props (films/seventy-six-summers/fx/land.mjs): the far hill's clock (the shadow line,
// the stone's last gold, the hand-off to scene 7), its geometry and per-set placement (the stone clears the forest edge,
// the wayside tree and the cottage in the shots that frame it), the valley patch, the village overlays, and the custom
// beats drawing in the compiled film (reflection, lantern, crest figure, eye glint, star highlight).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as land from '../films/seventy-six-summers/fx/land.mjs';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame } from '../engine/film/frame.mjs';
import { getKit } from '../engine/set/kits/index.mjs';

const DIR = fileURLToPath(new URL('../films/seventy-six-summers/', import.meta.url));
const W = 960, H = 540;                      // the film at half size: framings scale with the frame

let PLAN = null;
async function plan() {
  if (PLAN) return PLAN;
  const json = JSON.parse(readFileSync(DIR + 'film.json', 'utf8'));
  json.format = { ...json.format, width: W, height: H };
  PLAN = compile(await loadFilm(json, { custom: DIR + 'custom.mjs' }));
  return PLAN;
}
const shotT = (p, id, u) => { const s = p.shots.find(s => s.id === id); assert.ok(s, id); return s.t0 + (s.t1 - s.t0) * u; };
function render(p, t) { const c = createCanvas(W, H), x = c.getContext('2d'); drawFrame(x, p, t); return x.getImageData(0, 0, W, H).data; }
const md5 = d => createHash('md5').update(d).digest('hex');
// The plan with some overlays / custom beats removed (a view: the plan's other fields stay).
function without(p, names) {
  const v = Object.create(p);
  v.overlays = p.overlays.filter(o => !names.includes(o.name)); v.custom = p.custom.filter(c => !names.includes(c.name));
  return v;
}
const differs = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12;
function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
}
// Pixels that differ between two frames: { n, box: [x0, y0, x1, y1] }, optionally only inside a screen polygon.
function diff(a, b, poly = null) {
  let n = 0; const box = [W, H, -1, -1];
  const [x0, y0, x1, y1] = poly ? [Math.min(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[0])), Math.max(...poly.map(q => q[1]))].map(Math.round) : [0, 0, W, H];
  for (let y = Math.max(0, y0); y < Math.min(H, y1 + 1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1 + 1); x++) {
    if (poly && !inside(poly, x + 0.5, y + 0.5)) continue;
    if (differs(a, b, (y * W + x) * 4)) { n++; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  }
  return { n, box };
}
const area = poly => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(a / 2); };

test('exports the overlays and custom beats on the layers they need', () => {
  const L = o => o.layer;
  assert.equal(L(land.overlays['far-hill']), 'sky');           // behind every painted layer of the set
  assert.equal(L(land.overlays['empty-house']), 'sky');        // before the set paints its lamps
  assert.equal(L(land.overlays['pressed-trail']), 'back');     // on the ground, under props and actors
  assert.equal(L(land.overlays['set-patch']), 'back');
  assert.equal(L(land.custom.reflection), 'front');            // the bank and water are in front of everything
  assert.equal(L(land.custom['crest-figure']), 'sky');         // on the far hill
  for (const n of ['lantern-reveal', 'eye-glint', 'star-highlight']) assert.equal(L(land.custom[n]), 'grade');
  for (const d of [...Object.values(land.overlays), ...Object.values(land.custom)]) assert.equal(typeof d.draw, 'function');
});

test('no randomness or wall clock in the drawing code', () => {
  const src = readFileSync(DIR + 'fx/land.mjs', 'utf8');
  assert.ok(!/Math\.random\s*\(/.test(src) && !/Date\.now\s*\(/.test(src) && !/performance\.now\s*\(/.test(src));
});

// ───────────── the clock ─────────────
test('the shadow climbs the hill from below and only ever up; none until the sun gets low', () => {
  let prev = -Infinity;
  for (let i = 0; i <= 2000; i++) { const s = land.shadowLine(i / 2000); assert.ok(s >= prev - 1e-12, `monotone at ${i / 2000}`); prev = s; }
  for (const d of [0, 0.03, 0.4, 0.55]) assert.ok(land.shadowLine(d) < 0, `no shadow at dayT ${d}`);
  // the valley (0.70 → 0.76): the line is on the lower slope and visibly climbs
  assert.ok(land.shadowLine(0.7) > 0.2 && land.shadowLine(0.76) > land.shadowLine(0.7) + 0.1 && land.shadowLine(0.76) < 0.6);
  // the village: the hill's face (its top fifth shows over the roofs) still holds gold at 6.5 (≈ 0.845); the crest goes
  // into shadow only as the crest figure plays (0.85 → 0.87)
  assert.ok(land.shadowLine(0.845) < 1 && land.shadowLine(0.85) < 1 && land.shadowLine(0.87) > 1);
  assert.ok(land.shadowLine(1) === 1 + land.STONE_H);
});

test('the stone keeps the last gold: full until the crest is dark, then a sliver that goes out at dayT 1 and not before', () => {
  for (const d of [0, 0.4, 0.7, 0.78, 0.83, 0.85, 0.855]) assert.ok(land.stoneLight(d) > 1 - 1e-9, `lit at ${d}`);
  let prev = 1;
  for (let i = 1; i < 1000; i++) {
    const d = 0.855 + (0.145 * i) / 1000, v = land.stoneLight(d);
    assert.ok(v > 0 && v < prev + 1e-12, `still lit and shrinking at ${d.toFixed(4)}`); prev = v;
  }
  assert.equal(land.stoneLight(1), 0);
  assert.ok(land.stoneLight(0.87) < 0.3, '6.6 ends on a thin sliver');
});

test('scene 7 opens on the sliver scene 6 leaves: the hand-off matches the stone-light overlay', async t => {
  const sky = await import('../films/seventy-six-summers/fx/sky.mjs');
  if (typeof sky.stoneLit !== 'function') return t.skip('fx/sky.mjs has no stoneLit');
  for (const d of [0.87, 0.9]) assert.ok(Math.abs(land.stoneLight(d) - sky.stoneLit(d)) < 0.03, `at ${d}: ${land.stoneLight(d)} vs ${sky.stoneLit(d)}`);
});

test('dayTAt: one value, or [from, to] eased across the scene', () => {
  assert.equal(land.dayTAt({ dayT: 0.4 }, 0.7), 0.4);
  assert.equal(land.dayTAt({}, 0.3), 0.4);
  const r = { dayT: [0.78, 0.86] };
  assert.equal(land.dayTAt(r, 0), 0.78); assert.equal(land.dayTAt(r, 0.05), 0.78);
  assert.equal(land.dayTAt(r, 1), 0.86); assert.equal(land.dayTAt(r, 0.95), 0.86);
  assert.ok(Math.abs(land.dayTAt(r, 0.5) - 0.82) < 1e-12);
  let prev = 0; for (let i = 0; i <= 100; i++) { const v = land.dayTAt(r, i / 100); assert.ok(v >= prev); prev = v; }
});

test('lightAt: the sun moves from frame right at dawn to frame left in the evening; gold only late', () => {
  assert.ok(land.lightAt(0.03).side > 0.5 && land.lightAt(0.75).side < -0.5);
  assert.equal(land.lightAt(0.3).gold, 0);
  assert.ok(land.lightAt(0.85).gold > 0.8);
  for (const k of ['sun', 'rim', 'sh']) assert.equal(land.lightAt(0.62)[k].length, 4);
});

// ───────────── geometry ─────────────
test('hillGeom: the hill is frac of the frame height at the set\'s widest zoom, on its own slow parallax plane', () => {
  const S = getKit('meadow')({}), zref = S.clampCamera({ cx: S.refX, cy: S.refY, zoom: 0.01 }, 1920, 1080).zoom;
  const cam = { cx: S.refX, cy: S.refY, zoom: zref }, api = { set: S, cam, W: 1920, H: 1080 };
  const G = land.hillGeom(api, { frac: 0.2 });
  assert.ok(Math.abs(G.U - 0.2 * 1080) < 1e-9);
  assert.ok(Math.abs((G.at(0, 0)[1] - G.at(0, 1)[1]) - 0.2 * 1080) < 1e-9, 'foot to crest');
  // at the reference camera the foot sits where its world point is drawn (the set's default placement)
  assert.ok(Math.abs(G.sx - ((land.PLACE.meadow.x - cam.cx) * zref + 960)) < 1e-9);
  // panning by d moves it by k·d·zoom on screen (the painted layers move by their own k)
  const G2 = land.hillGeom({ ...api, cam: { ...cam, cx: cam.cx + 100 } }, { frac: 0.2 });
  assert.ok(Math.abs((G.sx - G2.sx) - 0.22 * 100 * zref) < 1e-9);
  // zooming in scales it with the frame
  const G3 = land.hillGeom({ ...api, cam: { ...cam, zoom: zref * 2 } }, { frac: 0.2 });
  assert.ok(Math.abs(G3.U - 2 * G.U) < 1e-9);
  // x / y / k params override the defaults
  const G4 = land.hillGeom(api, { frac: 0.2, x: 0, y: 0, k: 1 });
  assert.ok(Math.abs(G4.sx - ((0 - cam.cx) * zref + 960)) < 1e-9);
});

test('the stone outline stands on the crest, taller than wide, inside the hill\'s top', () => {
  const xs = land.STONE_P.map(p => p[0]), hs = land.STONE_P.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...hs) - Math.min(...hs);
  assert.ok(h > 1.8 * w && Math.abs(h - land.STONE_H) < 0.03);
  assert.ok(Math.min(...hs) < land.hillTop(land.STONE.x), 'its foot is in the turf');
  assert.equal(land.hillTop(0), 1);
  for (const u of [-2, -1, -0.3, 0.3, 1]) assert.ok(land.hillTop(u) < 1);
});

test('starPoint follows the rig\'s star through facing and scale', () => {
  const a = { x: 100, y: 200, s: 2, face: 1, st: { pose: {}, params: {} } };
  const r = land.starPoint(a), l = land.starPoint({ ...a, face: -1 });
  assert.ok(Math.abs(r.x - (100 - 16.2 * 2)) < 1e-9 && Math.abs(r.y - (200 - 30.2 * 2)) < 1e-9 && Math.abs(r.r - 13.2) < 1e-9);
  assert.ok(Math.abs(l.x - (100 + 16.2 * 2)) < 1e-9 && l.y === r.y);
  assert.ok(land.starPoint({ ...a, st: { pose: { by: 3 }, params: {} } }).y > r.y, 'the shell drops with the pose');
});

// ───────────── the village overlays ─────────────
test('empty-house keeps the kit\'s lamps out; pressed-trail is faint until the lantern-reveal beat, then clear', () => {
  const S = { lamps: 0.9 };
  land.overlays['empty-house'].draw(null, { set: S });
  assert.equal(S.lamps, 0);
  const sum = t => {
    const c = createCanvas(2400, 1300), x = c.getContext('2d');
    land.overlays['pressed-trail'].draw(x, { t, params: {}, scene: { id: 's' }, plan: { custom: [{ scene: 's', name: 'lantern-reveal', t0: 10, params: { rise: 2 } }] } });
    const d = x.getImageData(0, 0, 2400, 1300).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return a;
  };
  const before = sum(5), mid = sum(11), after = sum(13);
  assert.ok(before > 0 && mid > before * 1.5 && after > mid && after > before * 2, `${before} ${mid} ${after}`);
  assert.equal(sum(5), before, 'deterministic');
});

// ───────────── in the film ─────────────
test('the film validates; every daytime scene has the far hill at the screenplay\'s size', async () => {
  await loadFilm(DIR);                                         // throws on any validation problem
  const p = await plan(), F = p.overlays.filter(o => o.name === 'far-hill');
  assert.deepEqual(F.map(o => o.params.frac), [0.04, 0.07, 0.11, 0.2, 0.55]);
  const sets = F.map(o => p.shots.find(s => s.scene === o.scene).set.id);
  assert.deepEqual(sets, ['meadow', 'stream', 'wayside', 'valley', 'village']);
  for (const o of F) assert.ok(land.PLACE[p.shots.find(s => s.scene === o.scene).set.id], 'a default placement per set');
  const v = F.find(o => o.params.frac === 0.55);
  assert.deepEqual(v.params.dayT, [0.78, 0.86]);
});

test('the stone is in frame and clear of the forest edge, the wayside tree and the cottage', async () => {
  const p = await plan();
  for (const [id, u] of [['2.1', 0.95], ['2.7', 0.6], ['3.1', 0.5], ['4.1', 0.5], ['5.1', 0.5], ['6.1', 0.5], ['6.6', 0.9]]) {
    const t = shotT(p, id, u), shot = p.shotAt(t), o = p.overlays.find(o => o.scene === shot.scene && o.name === 'far-hill');
    const G = land.hillGeom({ set: shot.set, cam: shot.cameraAt(t), W, H }, o.params), poly = land.STONE_P.map(([a, b]) => G.at(a, b));
    for (const [x, y] of poly) assert.ok(x > 0 && x < W && y > 0 && y < H, `${id}: the stone is in frame`);
    const d = diff(render(p, t), render(without(p, ['far-hill']), t), poly);
    assert.ok(d.n > 0.6 * area(poly), `${id}: ${d.n} of ${area(poly).toFixed(0)} stone pixels show`);
  }
});

test('the far hill draws the same frame twice', async () => {
  const p = await plan();
  for (const t of [shotT(p, '5.1', 0.4), shotT(p, '6.1', 0.5)]) assert.equal(md5(render(p, t)), md5(render(p, t)));
});

test('the valley patch paints out the kit\'s own small stone, and only there', async () => {
  const p = await plan(), t = shotT(p, '5.1', 0.5), shot = p.shotAt(t), cam = shot.cameraAt(t), S = shot.set;
  const o = p.overlays.find(o => o.scene === shot.scene && o.name === 'set-patch'), k = o.params.k, z = cam.zoom;
  const dx = (cam.cx - S.refX) * (1 - k), dy = (cam.cy - S.refY) * (1 - k) * 0.4;
  const poly = o.params.poly.map(([x, y]) => [(x + dx - cam.cx) * z + W / 2, (y + dy - cam.cy) * z + H / 2]);
  const d = diff(render(p, t), render(without(p, ['set-patch']), t));
  assert.ok(d.n > 0.3 * area(poly), `the patch changes the picture (${d.n} px)`);
  const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
  assert.ok(d.box[0] >= Math.min(...xs) - 2 && d.box[2] <= Math.max(...xs) + 2 && d.box[1] >= Math.min(...ys) - 2 && d.box[3] <= Math.max(...ys) + 2, 'nothing changes outside it');
});

test('each custom beat draws in its shot', async () => {
  const p = await plan();
  for (const [id, name, u, min] of [['3.2', 'reflection', 0.6, 5000], ['6.5', 'lantern-reveal', 0.8, 400], ['6.6', 'crest-figure', 0.6, 30], ['6.8', 'eye-glint', 0.4, 3], ['9.3', 'star-highlight', 0.5, 40]]) {
    assert.ok(p.custom.some(c => c.name === name), name);
    const t = shotT(p, id, u), d = diff(render(p, t), render(without(p, [name]), t));
    assert.ok(d.n >= min, `${name} in ${id}: ${d.n} px`);
  }
});

test('the comet glints in the reflected sky only, on the flute\'s A', async () => {
  const p = await plan(), c = p.custom.find(c => c.name === 'reflection'), g = c.params.glint;
  assert.ok(g > 0 && c.t0 + g < c.t1, 'the glint falls inside the shot');
  const t = c.t0 + g + 0.2, off = Object.create(p);
  off.custom = p.custom.map(x => (x === c ? { ...x, params: { ...x.params, glint: 99 } } : x));
  const d = diff(render(p, t), render(off, t));
  assert.ok(d.n > 10, `the glint shows (${d.n} px)`);
  assert.ok(d.box[1] > H * 0.5, 'below the waterline, in the water');
  // a few frames, not the whole shot
  assert.equal(diff(render(p, c.t0 + 0.3), render(off, c.t0 + 0.3)).n, 0);
});

test('the lantern\'s bloom rises as the light falls', async () => {
  const p = await plan(), c = p.custom.find(c => c.name === 'lantern-reveal');
  const at = s => diff(render(p, c.t0 + s), render(without(p, ['lantern-reveal']), c.t0 + s)).n;
  const early = at(0.25), late = at(3.0);
  assert.ok(late > early * 1.5, `${early} → ${late}`);
});
