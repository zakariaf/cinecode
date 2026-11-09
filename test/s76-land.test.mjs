// Seventy-Six Summers places and props (films/seventy-six-summers/fx/land.mjs): the far hill's clock (the shadow line,
// the stone's last gold, the hand-off to scene 7), its geometry and per-set placement (the stone clears the forest edge,
// the wayside tree and the cottage in the shots that frame it), the valley patch, the village overlays, and the custom
// beats drawing in the compiled film (reflection, lantern, crest figure, eye glint, star highlight, firefly fill), the
// stone's halo, the shadow's edge, the trail round the well; and the film as restaged on the measured takes: its running
// time, the protected beats, the cast looks and the staging fixes (the cuts, Nell out of the mist, the clean closes,
// the walk-off after the wayside, the walk to the stone and the crane).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as land from '../films/seventy-six-summers/fx/land.mjs';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { loadPlan } from '../engine/render/film-source.mjs';
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
  for (const n of ['lantern-reveal', 'eye-glint', 'star-highlight', 'firefly-fill']) assert.equal(L(land.custom[n]), 'grade');
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

test('glintCore: a small bright point with its glow, nothing at k 0', () => {
  const run = k => {
    const c = createCanvas(400, 300), x = c.getContext('2d');
    x.fillStyle = '#5a8aa0'; x.fillRect(0, 0, 400, 300);
    land.glintCore(x, 200, 150, k, 1080);
    return x.getImageData(0, 0, 400, 300).data;
  };
  const bg = run(0), d = run(1);
  assert.ok(bg.every((v, i) => (i % 4 === 3 ? v === 255 : v === [90, 138, 160][i % 4])), 'k 0 draws nothing');
  const px = (x, y) => [...d.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 3)];
  assert.ok(px(200, 150).every((v, i) => Math.abs(v - [255, 243, 214][i]) <= 3), `the #FFF3D6 core ${px(200, 150)}`);
  const [r, , b] = px(200, 175);
  assert.ok(r - 90 > 30 && r - 90 > b - 160 + 25, `a glow round it that warms the water ${px(200, 175)}`);
  assert.deepEqual(px(5, 5), [90, 138, 160], 'and only round the point');
  assert.deepEqual(px(395, 295), [90, 138, 160]);
});

test('fireflyPoints: staggered, rising from the bottom of the frame, mostly behind her, in frame', () => {
  const W = 1920, H = 1080, head = [1300, 420];
  assert.equal(land.fireflyPoints(head, -1, 0, W, H).length, 0, 'none before the first lifts');
  assert.deepEqual(land.fireflyPoints(head, -1, 3, W, H), land.fireflyPoints(head, -1, 3, W, H), 'deterministic');
  let prev = 0;
  for (const bt of [0.6, 1.5, 3, 4.5]) { const n = land.fireflyPoints(head, -1, bt, W, H).length; assert.ok(n >= prev, `more as they lift (${n} at ${bt} s)`); prev = n; }
  assert.ok(prev >= 7, `${prev} up by 4.5 s`);
  // one at a time (n 1): it rises steadily and stays in the frame's width, on the side behind her (she faces left)
  for (let seed = 1; seed <= 30; seed++) {
    const [a] = land.fireflyPoints(head, -1, 2.5, W, H, { n: 1, seed }), [b] = land.fireflyPoints(head, -1, 4, W, H, { n: 1, seed });
    assert.ok(a && b && b.y < a.y - 0.1 * H, `seed ${seed}: rises`);
    for (const q of [a, b]) assert.ok(q.x > 0 && q.x < W && q.x > head[0] - 0.05 * W, `seed ${seed}: behind her, in frame (${q.x.toFixed(0)})`);
  }
  const all = land.fireflyPoints(head, -1, 4.5, W, H);
  assert.ok(all.every(q => q.x > 0 && q.x < W && q.y < 1.1 * H && q.a > 0 && q.a <= 1));
});

test('the shadow\'s edge bows down a little toward the hill\'s flanks; its glaze is a cool blue', () => {
  for (const h of [0.3, 0.8]) {
    assert.equal(land.shadowEdgeAt(h, 0), h);
    assert.equal(land.shadowEdgeAt(h, -1.5), land.shadowEdgeAt(h, 1.5));
    assert.ok(land.shadowEdgeAt(h, 2) < land.shadowEdgeAt(h, 1) && h - land.shadowEdgeAt(h, -3.1) < 0.3, 'a slight bow, not a slant');
  }
  const [r, g, b] = land.SHADOW_BLUE;
  assert.ok(b > r + 40 && b > g + 30);
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

test('the pressed trail goes round the well, not through it, and behind it', async () => {
  const { WELL, WELL_G } = await import('../engine/set/kits/village.mjs');
  const P = land.TRAIL, ex = (x, y) => Math.hypot((x - WELL.x) / (WELL.rx + 4), (y - WELL.base) / (WELL_G.ry + 4));
  let behind = false;
  for (let i = 1; i < P.length; i++) for (let u = 0; u <= 1; u += 0.05) {
    const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u;
    assert.ok(ex(x, y) > 1.25, `clear of the well's footing at ${x.toFixed(0)}, ${y.toFixed(0)}`);
    if (Math.abs(x - WELL.x) < WELL.rx && y < WELL.base - WELL_G.ry) behind = true;
  }
  assert.ok(behind, 'it passes behind the well');
  assert.ok(P[0][0] < WELL.x - 400 && P[P.length - 1][1] < WELL.base - 100, 'from the gate, away up the meadow');
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

test('the halo clears the clouds round the gold stone in the valley, and only round it', async () => {
  const p = await plan(), t = shotT(p, '5.1', 0.5), shot = p.shotAt(t), o = p.overlays.find(o => o.scene === shot.scene && o.name === 'far-hill');
  assert.ok(o.params.halo > 0, 'the valley asks for it');
  const off = Object.create(p);
  off.overlays = p.overlays.map(x => (x === o ? { ...x, params: { ...x.params, halo: 0 } } : x));
  const G = land.hillGeom({ set: shot.set, cam: shot.cameraAt(t), W, H }, o.params), [cx, cy] = G.at(land.STONE.x, land.hillTop(land.STONE.x) + land.STONE_H * 0.55);
  const d = diff(render(p, t), render(off, t)), rx = land.HALO.rx * G.U, ry = land.HALO.ry * G.U;
  assert.ok(d.n > 0.15 * Math.PI * rx * ry, `it shows (${d.n} px)`);
  assert.ok(d.box[0] >= cx - rx - 1 && d.box[2] <= cx + rx + 1 && d.box[1] >= cy - ry - 1 && d.box[3] <= cy + ry + 1, 'nothing changes outside its ellipse');
});

test('each custom beat draws in its shot', async () => {
  const p = await plan();
  for (const [id, name, u, min] of [['3.2', 'reflection', 0.6, 5000], ['6.5', 'lantern-reveal', 0.8, 400], ['6.6', 'crest-figure', 0.6, 30], ['6.8', 'eye-glint', 0.4, 3], ['9.3', 'star-highlight', 0.5, 40], ['9.11', 'firefly-fill', 0.5, 2000]]) {
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
  const d = diff(render(p, t), render(off, t)), wl = c.params.waterline;
  assert.ok(d.n > 500, `the glint shows (${d.n} px)`);
  assert.ok(wl > 0.4 && wl < 0.6 && d.box[1] > H * wl, 'below the fixed waterline, in the water');
  // in the middle of the band of reflected sky, where it was placed (not at its top edge, against the bank)
  const bx = (d.box[0] + d.box[2]) / 2 / W, by = (d.box[1] + d.box[3]) / 2 / H;
  assert.ok(Math.abs(bx - c.params.glintX) < 0.06 && Math.abs(by - (wl + (1 - wl) / 2)) < 0.05, `the glint at ${bx.toFixed(2)}, ${by.toFixed(2)}`);
  // a few frames, not the whole shot
  assert.equal(diff(render(p, c.t0 + 0.3), render(off, c.t0 + 0.3)).n, 0);
});

test('the lantern\'s bloom rises as the light falls', async () => {
  const p = await plan(), c = p.custom.find(c => c.name === 'lantern-reveal');
  const at = s => diff(render(p, c.t0 + s), render(without(p, ['lantern-reveal']), c.t0 + s)).n;
  const early = at(0.25), late = at(3.0);
  assert.ok(late > early * 1.5, `${early} → ${late}`);
});

test('the 6.6 push-in ends on the figure by the stone', async () => {
  const p = await plan(), s = p.shots.find(s => s.id === '6.6'), t = shotT(p, '6.6', 0.98);
  const o = p.overlays.find(o => o.scene === s.scene && o.name === 'far-hill'), G = land.hillGeom({ set: s.set, cam: s.cameraAt(t), W, H }, o.params);
  const bx = land.STONE.x - land.STONE.w * 0.5, [fx, fy] = G.at(bx, land.hillTop(bx) + 0.05);
  assert.ok(fx > 0.35 * W && fx < 0.65 * W && fy > 0.25 * H && fy < 0.6 * H, `the figure at ${(fx / W).toFixed(2)}, ${(fy / H).toFixed(2)} of the frame`);
  assert.ok(diff(render(p, t), render(without(p, ['crest-figure']), t)).n >= 30, 'and it is drawn there, not hidden');
});

// ───────────── the film on its measured takes ─────────────
// The voiced plan (the takes cached in voices/; full size).
let VOICED = null;
async function voiced() {
  if (!VOICED) VOICED = (await loadPlan(DIR)).plan;
  return VOICED;
}
const actorsAt = (p, id, u) => frameInfo(p, shotT(p, id, u)).actors;
const actor = (A, id) => A.find(a => a.id === id);
const inFrame = (p, b) => (Math.min(b[2], p.W) - Math.max(b[0], 0)) / (b[2] - b[0]);   // share of a screen box's width in frame

test('the cast looks: Pebble\'s lids, Fidget\'s tail', () => {
  const json = JSON.parse(readFileSync(DIR + 'film.json', 'utf8'));
  const lids = json.cast.pebble.params.lids, tail = json.cast.fidget.params.tail;
  assert.ok(lids >= 0.25 && lids <= 0.35, `lids ${lids}`);
  assert.equal(tail, 1.0);
  // no shot sets the tail back up beyond the puffy state
  const sets = json.scenes.flatMap(sc => sc.shots.flatMap(sh => sh.beats)).filter(b => b.do === 'set' && b.who === 'fidget' && b.params?.tail !== undefined);
  for (const b of sets) assert.ok(b.params.tail <= 1.3, `tail ${b.params.tail}`);
});

test('the cut runs 3:30-3:45 on the measured takes; the protected beats keep their length', async () => {
  const p = await voiced(), L = [...p.lines].sort((a, b) => a.t0 - b.t0);
  assert.equal(L.filter(l => l.estimated).length, 0, 'every line is voiced');
  assert.ok(p.duration >= 210 && p.duration <= 225, `${p.duration.toFixed(1)} s`);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].t0 >= L[i - 1].t1 - 1e-6, `${L[i - 1].shot} / ${L[i].shot}: two lines at once`);
  const hello = L.find(l => l.speak === 'Hello, Pebble.'), here = L.find(l => l.speak === "I'm here.");
  assert.ok(here.t0 - hello.t1 >= 1.4 - 1 / 24, 'the silence before "I\'m here."');
  assert.ok(p.shots.find(s => s.id === '9.5').t1 - p.marks.bloom >= 4.5, 'the held bloom');
  // the whole hum (seven beats) inside 1.5, landing on C before the cut
  const hum = p.sfx.find(x => x.name === 'hum' && x.shot === '1.5'), beats = hum.params.notes.split(' ').reduce((a, n) => a + +n.split(':')[1], 0);
  assert.ok(beats === 7 && hum.t + (beats * 60) / hum.params.tempo <= p.shots.find(s => s.id === '1.5').t1, 'the hum fits');
  // 9.1 ends on 1.5 s of stillness
  const s91 = p.shots.find(s => s.id === '9.1'), a = frameInfo(p, s91.t1 - 1.45).actors, b = frameInfo(p, s91.t1 - 0.05).actors;
  for (const x of a) assert.ok(Math.hypot(x.x - actor(b, x.id).x, x.y - actor(b, x.id).y) < 0.5, `9.1: ${x.id} holds still`);
});

test('every speaker is in frame while speaking', async () => {
  const p = await voiced();
  for (const l of p.lines) {
    if (l.vo || l.narrator) continue;
    for (const t of [l.t0 + 0.05, (l.t0 + l.t1) / 2, l.t1 - 0.05]) {
      const a = actor(frameInfo(p, t).actors, l.who), [x, y] = a.head;
      assert.ok(x > 0 && x < p.W && y > 0 && y < p.H && a.alpha > 0.5, `${l.shot}: ${l.who} "${l.speak}" at ${t.toFixed(2)}`);
    }
  }
});

test('the restaged shots: the wade, the burst onto the crest, the herding, the reunion three-shot', async () => {
  const p = await voiced();
  // 3.3: the shell goes under; Fidget chin-deep, his tail held high
  for (const u of [0.85, 0.95]) {
    const A = actorsAt(p, '3.3', u), f = actor(A, 'fidget'), pb = actor(A, 'pebble'), hh = f.headBox[3] - f.headBox[1];
    assert.ok(pb.visibleBox[3] - pb.visibleBox[1] < 2, `3.3@${u}: the shell has gone under`);
    assert.ok(f.waterline > (f.headBox[1] + f.headBox[3]) / 2 && f.waterline - f.headBox[3] < 0.15 * hh, `3.3@${u}: chin-deep`);
    assert.ok(f.visibleBox[1] < f.headBox[1], `3.3@${u}: the tail above his head`);
  }
  // 8.2: Fidget bursts in at once (no empty first second)
  const s82 = p.shots.find(s => s.id === '8.2'), f1 = actor(frameInfo(p, s82.t0 + 0.25).actors, 'fidget'), f2 = actor(frameInfo(p, s82.t0 + 0.5).actors, 'fidget');
  assert.ok(inFrame(p, f1.screenBox) > 0 && inFrame(p, f2.screenBox) > 0.95, '8.2: in by 0.25 s, whole by 0.5 s');
  // 5.3: the herding plays in a two-shot that holds both
  for (const u of [0.6, 0.8, 0.95]) {
    const A = actorsAt(p, '5.3', u);
    for (const id of ['fidget', 'pebble']) assert.ok(inFrame(p, actor(A, id).screenBox) > 0.95, `5.3@${u}: ${id} in frame`);
  }
  // 9.6: Fidget settles by Pebble's head, clear of Nell
  for (const u of [0.05, 0.4, 0.95]) {
    const A = actorsAt(p, '9.6', u), f = actor(A, 'fidget').screenBox, n = actor(A, 'nell').screenBox;
    assert.ok(Math.max(0, Math.min(f[2], n[2]) - Math.max(f[0], n[0])) < 0.05 * (f[2] - f[0]), `9.6@${u}: Fidget clear of Nell`);
  }
});

const offFrame = (p, b) => b[0] >= p.W || b[2] <= 0 || b[1] >= p.H || b[3] <= 0;
test('scenes 2-8 cut, not dissolve, between places', async () => {
  const p = await voiced();
  for (const id of ['s02', 's03', 's04', 's05', 's06', 's07', 's08']) assert.equal(p.scenes.find(s => s.id === id).transition, 'cut', id);
});

test('9.1: Nell comes out of the mist from nothing, and is whole before she passes Fidget', async () => {
  const p = await voiced(), s = p.shots.find(s => s.id === '9.1'), n0 = actor(frameInfo(p, s.t0).actors, 'nell');
  assert.ok(!n0 || n0.alpha < 0.02, 'no flash of her on the first frame');
  let full = null, seen = false;
  for (let t = s.t0; t < s.t1; t += 1 / 24) {
    const n = actor(frameInfo(p, t).actors, 'nell');
    if (!n || n.alpha < 0.02) { assert.ok(!seen, 'once she shows she stays'); continue; }
    seen = true;
    if (full == null && n.alpha > 0.99) full = n.x;
    if (full != null) assert.ok(n.alpha > 0.99, `no fading once whole (${n.alpha.toFixed(2)} at ${(t - s.t0).toFixed(2)} s)`);
  }
  const f = actor(frameInfo(p, s.t1 - 0.05).actors, 'fidget');
  assert.ok(full != null && full > f.x + 100, `whole by x ${full?.toFixed(0)}, up the slope from Fidget at ${f.x.toFixed(0)}`);
});

test('the clean frames: 6.6 opens on the crest alone; the 9.8 and 9.10 closes hold only Pebble', async () => {
  const p = await voiced();
  for (const u of [0.01, 0.5, 0.99]) for (const a of actorsAt(p, '6.6', u)) assert.ok(offFrame(p, a.screenBox) || a.alpha < 0.02, `6.6@${u}: ${a.id} out of the view`);
  for (const id of ['9.8', '9.10']) for (const u of [0.05, 0.5, 0.95]) {
    const A = actorsAt(p, id, u);
    assert.ok(!offFrame(p, actor(A, 'pebble').screenBox), `${id}@${u}: Pebble`);
    for (const a of A) if (a.id !== 'pebble') assert.ok(offFrame(p, a.screenBox) || a.alpha < 0.02, `${id}@${u}: ${a.id} out of his close-up`);
  }
});

test('4.5: Pebble turns and walks on; Fidget runs after him and falls in at his heels', async () => {
  const p = await voiced(), A0 = actorsAt(p, '4.5', 0.01), A1 = actorsAt(p, '4.5', 0.99);
  const [p0, p1, f0, f1] = [actor(A0, 'pebble'), actor(A1, 'pebble'), actor(A0, 'fidget'), actor(A1, 'fidget')];
  assert.ok(p0.face === -1 && p1.face === 1 && p1.x > p0.x + 30, 'Pebble turns away from him and goes');
  assert.ok(f1.face === 1 && f1.x > f0.x + 100, 'Fidget goes after him');
  assert.ok(f1.x < p1.x && p1.x - f1.x < 200, `at his heels, behind him (${(p1.x - f1.x).toFixed(0)} px)`);
});

test('the walk to the stone, then the crane from PROMISE WIDE into the sky', async () => {
  const p = await voiced();
  const a = actorsAt(p, '10.1', 0.01), b = actorsAt(p, '10.1', 0.99);
  for (const id of ['pebble', 'nell']) assert.ok(actor(a, id).face === 1 && actor(b, id).face === 1 && actor(b, id).x > actor(a, id).x + 5, `10.1: ${id} walks toward the stone`);
  const cam = (id, u) => { const s = p.shots.find(s => s.id === id); return s.cameraAt(s.t0 + (s.t1 - s.t0) * u); };
  const same = (c, d, what) => assert.ok(Math.abs(c.cx - d.cx) < 1 && Math.abs(c.cy - d.cy) < 1 && Math.abs(c.zoom - d.zoom) < 1e-3, `${what}: ${[c.cx, c.cy, c.zoom]} vs ${[d.cx, d.cy, d.zoom]}`);
  same(cam('10.4', 0), cam('1.6', 0.5), '10.4 opens on PROMISE WIDE');
  same(cam('10.4', 1 - 1e-6), cam('10.5', 0), '10.5 picks the crane up where 10.4 leaves it');
  assert.ok(cam('10.4', 1 - 1e-6).cy < cam('10.4', 0).cy - 200, 'and it rises');
  assert.ok(cam('10.5', 1 - 1e-6).cy < cam('10.5', 0).cy, 'on into the sky');
});
