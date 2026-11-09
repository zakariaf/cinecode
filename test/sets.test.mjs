// Sets: kit registry, anchors, perspective, walkability, routing, camera clamping, layer coverage,
// sky names, and a deterministic, unclipped build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getKit, listKits, registerKit } from '../engine/set/kits/index.mjs';
import { makeSet, clampCamera, pointInPoly, inEllipse, SKY_TIMES, MAX_VIEW, INK_FADE } from '../engine/set/set.mjs';
import { branchTop, bigTree, inkSilhouette, grassSkirt, steppingStone, waterline, streamGeom, streamFlow, paintStream, nightLevel, NIGHT_LEVEL, treeSkirt, stoneSkirt, standingStoneFoot, standingStonePoly } from '../engine/paint/paint.mjs';
import { canvas, rng } from '../engine/core/lib.mjs';
import { STONES, FROG_ROCK, WATER } from '../engine/set/kits/stream.mjs';
import { STONE, hillGround } from '../engine/set/kits/hill.mjs';
import { WAY_TREE } from '../engine/set/kits/wayside.mjs';

const REQUIRED = ['valley', 'meadow', 'forest', 'stream', 'wayside', 'hill'];
const KITS = listKits().filter(k => REQUIRED.includes(k));
const sets = Object.fromEntries(KITS.map(k => [k, getKit(k)()]));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('registry discovers every kit file and rejects unknown names', () => {
  for (const k of REQUIRED) assert.ok(listKits().includes(k), `missing kit ${k}`);
  assert.throws(() => getKit('no-such-kit'), /unknown set kit/);
  registerKit('test-kit', () => makeSet({ id: 't', W: 3600, H: 2000, refX: 1800, refY: 1000, horizon: 600, laneY: 1100, baseS: 1, layers: [], anchors: { a: { x: 1, y: 1 } } }));
  assert.ok(listKits().includes('test-kit'));
  assert.equal(getKit('test-kit')().id, 't');
});

for (const name of KITS) {
  const S = sets[name];
  test(`${name}: at least 4 anchors, all resolve to sane values`, () => {
    assert.ok(S.anchorNames.length >= 4, `${name} has ${S.anchorNames.length} anchors`);
    for (const a of S.anchors()) {
      assert.ok(['ground', 'surface', 'perch', 'hollow', 'view'].includes(a.type), `${a.name} type ${a.type}`);
      for (const f of ['x', 'y', 's', 'depth']) assert.ok(Number.isFinite(a[f]), `${name}.${a.name}.${f} = ${a[f]}`);
      assert.ok(a.s > 0.2 && a.s < 4, `${name}.${a.name} scale ${a.s}`);
      if (a.type === 'hollow') { assert.ok(Array.isArray(a.clip) && a.clip.length > 8); assert.ok(pointInPoly(a.clip, a.x, a.y - 4), `${a.name} contact inside its clip`); }
      if (a.type === 'perch') { assert.ok(near(a.y, branchTop(a.branch, a.x))); assert.ok(a.x >= a.range[0] && a.x <= a.range[1]); }
      if (a.type === 'ground') assert.ok(S.isWalkable(a.x, a.y), `${name}.${a.name} (${a.x},${a.y}) is not walkable`);
      if (a.type !== 'ground' && a.type !== 'view') assert.ok(a.depth >= (S.props.find(p => p.id === a.prop)?.y ?? -Infinity), `${a.name} sorts in front of its prop`);
    }
    assert.throws(() => S.anchor('nope'), /no anchor/);
  });

  test(`${name}: skies, ambience, area wide enough for zoom 0.6`, () => {
    for (const t of SKY_TIMES) assert.ok(S.skyNames.includes(t), `${name} lacks sky ${t}`);
    assert.equal(typeof S.ambience.day, 'string'); assert.equal(typeof S.ambience.night, 'string');
    assert.ok(S.area.x1 - S.area.x0 >= MAX_VIEW.w && S.area.y1 - S.area.y0 >= MAX_VIEW.h, `${name} area too small`);
    assert.deepEqual(S.bounds, S.view);
  });

  test(`${name}: scaleAt grows toward the viewer`, () => {
    for (const x of [S.view.x0, (S.view.x0 + S.view.x1) / 2, S.view.x1]) {
      const y0 = S.ridge ? S.groundAt(x) : S.horizon + 60;
      let prev = 0;
      for (let y = y0; y < y0 + (S.ridge ? S.walk.band : 700); y += 10) { const s = S.scaleAt(x, y); assert.ok(s > 0 && s >= prev - 1e-9, `${name} scale not monotonic at ${x},${y}`); prev = s; }
    }
  });

  test(`${name}: clampCamera keeps every frame inside the painted area`, () => {
    const W = 1920, H = 1080;
    for (const zoom of [0.3, 0.6, 0.75, 1, 1.4, 2, 3]) for (const cx of [-5000, S.view.x0, S.refX, S.view.x1, 9000]) for (const cy of [-5000, S.view.y0, S.refY, S.view.y1, 9000]) {
      const c = clampCamera(S, { cx, cy, zoom }, W, H), hw = W / 2 / c.zoom, hh = H / 2 / c.zoom;
      assert.ok(c.zoom >= Math.max(zoom, 0.6 - 1e-9));
      assert.ok(c.cx - hw >= S.area.x0 - 1e-6 && c.cx + hw <= S.area.x1 + 1e-6, `${name} x out at zoom ${zoom}`);
      assert.ok(c.cy - hh >= S.area.y0 - 1e-6 && c.cy + hh <= S.area.y1 + 1e-6, `${name} y out at zoom ${zoom}`);
      // every parallax layer still covers the frame (horizontally, and at the top)
      for (const ly of S.def.layers) {
        const E = S.layerExtent(ly.k), dx = (c.cx - S.refX) * (1 - ly.k), dy = (c.cy - S.refY) * (1 - ly.k) * 0.4;
        assert.ok(E.x0 + dx <= c.cx - hw + 1e-6 && E.x1 + dx >= c.cx + hw - 1e-6, `${name} layer k=${ly.k} leaves a side gap`);
        assert.ok(E.y0 + dy <= c.cy - hh + 1e-6, `${name} layer k=${ly.k} leaves a gap at the top`);
        if (ly.k === 1) assert.ok(E.y1 + dy >= c.cy + hh - 1e-6);
      }
    }
    const s = clampCamera(S, { cx: S.refX, cy: S.refY, s: 1 });
    assert.equal(s.s, s.zoom);
  });

  test(`${name}: isWalkable rejects solids, water and the outside`, () => {
    for (const c of S.colliders()) { assert.ok(Number.isFinite(c.rx) && c.rx > 0 && c.ry > 0); assert.equal(S.isWalkable(c.x, c.y), false, `${name} collider ${c.id} centre walkable`); }
    assert.equal(S.isWalkable(S.area.x0 - 500, S.area.y0 - 500), false);
    for (const P of S.walk.water) { const x = P.reduce((a, p) => a + p[0], 0) / P.length, y = P.reduce((a, p) => a + p[1], 0) / P.length; assert.ok(S.inWater(x, y), `${name} water centroid ${x},${y}`); if (!S.onStone(x, y)) assert.equal(S.isWalkable(x, y), false); assert.equal(S.surfaceAt(x, y), S.onStone(x, y) ? 'stone' : 'water'); }
    for (const st of S.stones) { assert.ok(S.isWalkable(st.x, st.y), `stone ${st.id} top walkable`); assert.equal(S.surfaceAt(st.x, st.y), 'stone'); }
  });

  test(`${name}: routes stay on walkable ground and avoid colliders and water`, () => {
    const pts = S.anchors().filter(a => a.type === 'ground');
    const pairs = []; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j += 2) pairs.push([pts[i], pts[j]]);
    for (const [a, b] of pairs) {
      const R = S.route(a.name, b.name);
      assert.ok(R.length >= 2, `${a.name}->${b.name} empty`);
      assert.deepEqual(R[0], [a.x, a.y]);
      if (!R.blocked) assert.deepEqual(R[R.length - 1], [b.x, b.y]);
      for (const [x, y] of R) assert.ok(S.isWalkable(x, y), `${name} ${a.name}->${b.name} waypoint ${x},${y}`);
      for (let i = 1; i < R.length; i++) {
        if (R.stones.includes(i) || R.stones.includes(i - 1)) continue;          // hops between stones and banks
        for (let k = 0; k <= 40; k++) {
          const x = R[i - 1][0] + ((R[i][0] - R[i - 1][0]) * k) / 40, y = R[i - 1][1] + ((R[i][1] - R[i - 1][1]) * k) / 40;
          assert.ok(S.isWalkable(x, y), `${name} ${a.name}->${b.name} segment ${i} crosses unwalkable ground at ${x.toFixed(0)},${y.toFixed(0)}`);
          for (const c of S.colliders()) assert.ok(!inEllipse(c, x, y), `${name} route passes through ${c.id}`);
        }
      }
      assert.deepEqual(S.route(a.name, b.name), R, 'routing is deterministic');
    }
  });
}

test('stream: crossing the brook hops over all four stepping stones', () => {
  const S = sets.stream, R = S.route('bank_left', 'bank_right');
  assert.equal(R.blocked, false);
  const tops = R.stones.map(i => R[i][0]);
  assert.deepEqual(tops, [1170, 1270, 1370, 1470]);
  for (let i = 1; i < R.length; i++) assert.ok(Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]) < 400);
  assert.equal(S.surfaceAt(800, S.laneAt(800)), 'dirt');
  assert.equal(S.surfaceAt(1300, 1300), 'water');
  // the frog's rock is out of reach: the route stops on dry ground or a stone, never in the water
  const F = S.route('bank_left', 'frog_rock');
  assert.ok(F.blocked);
  for (const [x, y] of F) assert.ok(S.isWalkable(x, y));
});

test('meadow: a route around the pond and behind the owl tree', () => {
  const S = sets.meadow, R = S.route([2380, 1360], 'pond_far');
  assert.equal(R.blocked, false);
  assert.ok(R.length >= 3, 'had to bend round the pond');
  const T = S.route([100, 1000], [700, 1000]);
  assert.ok(T.length >= 3, 'had to bend round the tree');
  const den = S.anchor('owl_hollow'), stump = S.anchor('stump_top');
  assert.equal(den.type, 'hollow'); assert.equal(stump.surface, 'wood');
  assert.ok(stump.y < S.anchor('stump_front').y);
});

test('hill: a ridge set — ground line, band routing, stone in the way', () => {
  const S = sets.hill;
  assert.ok(S.ridge);
  for (const x of [0, 800, 1600, 2400, 3200]) assert.ok(Number.isFinite(S.groundAt(x)));
  assert.equal(sets.meadow.groundAt(500), null);
  const R = S.route('slope_low', 'stone_right');
  assert.equal(R.blocked, false);
  for (const [x, y] of R) { const g = S.groundAt(x); assert.ok(y >= g - 4 && y <= g + S.walk.band + 4, `off the band at ${x},${y}`); }
  const st = S.colliders().find(c => c.id === 'standing_stone');
  for (const [x, y] of R) assert.ok(!inEllipse(st, x, y));
  // the scale barely changes along the ridge for the same band offset
  const s1 = S.scaleAt(500, S.groundAt(500) + 20), s2 = S.scaleAt(2500, S.groundAt(2500) + 20);
  assert.ok(near(s1, s2, 1e-9));
});

test('build is deterministic, idempotent, and no prop sprite is clipped', () => {
  const hash = S => {
    const h = createHash('sha1');
    for (const ly of S.L) { const [c, x] = canvas(256, 128); x.drawImage(ly.c, 0, 0, 256, 128); h.update(c.data ? c.data() : x.getImageData(0, 0, 256, 128).data); }
    for (const p of S.props) { const [c, x] = canvas(64, 64); x.drawImage(p.sprite, 0, 0, 64, 64); h.update(x.getImageData(0, 0, 64, 64).data); }
    return h.digest('hex');
  };
  const a = getKit('meadow')().build(), b = getKit('meadow')().build();
  assert.equal(hash(a), hash(b));
  const L = a.L; a.build(); assert.equal(a.L, L, 'build() is idempotent');
  for (const name of KITS) {
    const S = name === 'meadow' ? a : sets[name].build();
    for (const p of S.props) { assert.ok(p.sprite && p.sw > 0 && p.sh > 0, `${name}.${p.id} sprite`); assert.equal(p.clipped, false, `${name}.${p.id} is clipped by its paint canvas`); }
    const items = S.propsSorted();
    for (let i = 1; i < items.length; i++) assert.ok(items[i].y >= items[i - 1].y);
  }
});

test('draws a frame: sky crossfade, back layers, props, front layers', () => {
  const S = sets.meadow.build(), [c, x] = canvas(480, 270), cam = clampCamera(S, { cx: 1400, cy: 850, zoom: 0.25 }, 480, 270);
  S.drawSky(x, cam, [['dawn', 0.4], ['morning', 0.6]], 2);
  x.setTransform(cam.zoom, 0, 0, cam.zoom, 240 - cam.cx * cam.zoom, 135 - cam.cy * cam.zoom);
  S.drawBack(x, cam, { t: 2, dof: 2, haze: 'morning' });
  for (const p of S.propsSorted()) p.draw(x);
  S.drawFront(x, cam, { t: 2 });
  const d = x.getImageData(0, 0, 480, 270).data; let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] + d[i + 1] + d[i + 2] > 60) lit++;
  assert.ok(lit > 480 * 270 * 0.95, 'frame fully painted');
});

test('paint.mjs still exports every helper the legacy module did, plus the sky set', async () => {
  const P = await import('../engine/paint/paint.mjs');
  for (const n of ['paperTex', 'paper', 'foliage', 'trunk', 'branchTop', 'paintBranch', 'oak', 'grassField', 'flowers', 'blades', 'fern', 'rock', 'skyGradient', 'clouds', 'hillsRow', 'mistSprite', 'raysSprite']) assert.equal(typeof P[n], 'function', n);
  assert.deepEqual(P.SKY_TIMES, ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'sunset', 'twilight', 'night']);
  for (const t of P.SKY_TIMES) { const k = P.skyCanvases(t); assert.ok(k.back.width > 0 && k.clouds.width > 0); assert.match(P.skyHaze(t), /^\d+,\d+,\d+$/); }
});

// ───────────── round 3: tree feet, river stones, moving water, the hill by night ─────────────
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const alphaAt = (c, x, y) => c.getContext('2d').getImageData(x, y, 1, 1).data[3];

test('inkSilhouette fade: the ink stops above the fade line, the sprite itself is untouched', () => {
  const [src, x] = canvas(80, 80); x.fillStyle = '#88cc66'; x.fillRect(20, 10, 40, 60);   // a block from y 10 to 70
  const plain = inkSilhouette(src, 3), faded = inkSilhouette(src, 3, { fade: [40, 50] });
  const px = (c, X, Y) => [...c.getContext('2d').getImageData(X, Y, 1, 1).data];
  assert.ok(px(plain, 18, 30)[3] > 200 && px(faded, 18, 30)[3] > 200, 'ink beside the block above the fade');
  assert.ok(px(plain, 18, 62)[3] > 200, 'unfaded ink low on the side');
  assert.equal(px(faded, 18, 62)[3], 0, 'no ink below the fade');
  assert.equal(px(faded, 40, 73)[3], 0, 'no ink line under the foot');
  assert.deepEqual(px(faded, 40, 65), px(plain, 40, 65), 'the sprite is unchanged');
});

test('a prop with inkFloor has no ink line where it meets the ground', () => {
  const def = inkFloor => makeSet({ id: 'p', W: 400, H: 300, refX: 200, refY: 150, horizon: 50, laneY: 250, baseS: 1, layers: [], anchors: { a: { x: 1, y: 1 } },
    props: [{ id: 'post', x: 200, y: 200, base: 200, inkFloor, bounds: [180, 100, 220, 200], paint: x => { x.fillStyle = '#c08040'; x.fillRect(185, 100, 30, 100); } }] }).build();
  const sprite = S => { const p = S.props[0], [c, x] = canvas(400, 300); x.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh); return x.getImageData(0, 0, 400, 300).data; };
  const a = sprite(def(undefined)), b = sprite(def(196)), at = (d, X, Y) => d[(Y * 400 + X) * 4 + 3];
  assert.ok(at(a, 200, 202) > 200, 'ink under the foot without inkFloor');
  assert.equal(at(b, 200, 202), 0, 'none with it');
  assert.ok(at(b, 216, 130) > 200 && at(b, 183, 130) > 100, 'the sides are still inked well above the floor');
  assert.equal(at(b, 216, 199), 0, 'and fade out by the floor');
  assert.equal(INK_FADE, 24);
});

test('grassSkirt: deterministic, ragged organic top edge, soft foot, short grass in gaps', () => {
  const draw = (seed, gaps = []) => { const [c, x] = canvas(600, 160); grassSkirt(x, rng(seed), 300, 120, 400, 40, { seed, gaps }); return c; };
  const a = draw(7), d = a.getContext('2d').getImageData(0, 0, 600, 160).data;
  assert.deepEqual(Buffer.from(draw(7).getContext('2d').getImageData(0, 0, 600, 160).data), Buffer.from(d), 'deterministic');
  // the top edge: the first painted row in each column varies a lot (tufts and gaps, not a comb or a step line)
  const tops = []; for (let X = 140; X <= 460; X += 4) { let Y = 0; while (Y < 160 && d[(Y * 600 + X) * 4 + 3] < 40) Y++; tops.push(Y); }
  const mean = tops.reduce((p, q) => p + q, 0) / tops.length, sd = Math.sqrt(tops.reduce((p, q) => p + (q - mean) ** 2, 0) / tops.length);
  assert.ok(sd > 5, `top edge varies (sd ${sd.toFixed(1)})`);
  let runs = 0; for (let i = 1; i < tops.length; i++) if (tops[i] === tops[i - 1]) runs++;
  assert.ok(runs < tops.length * 0.4, 'no long flat steps along the top');
  // the blades at the middle are taller than at the ends
  const at = X => { let Y = 0; while (Y < 160 && d[(Y * 600 + X) * 4 + 3] < 40) Y++; return Y; };
  assert.ok(Math.min(...[260, 280, 300, 320, 340].map(at)) < Math.min(...[106, 110, 490, 494].map(at)));
  // the foot fades into the ground: nothing solid below base + 12, full grass just above the base
  assert.ok(alphaAt(a, 300, 116) > 200, 'opaque just above the base');
  for (let X = 120; X < 480; X += 10) assert.ok(alphaAt(a, X, 140) < 30, `faded foot at ${X}`);
  // a gap keeps the grass short (an open hollow)
  const g = draw(7, [[280, 320]]), gd = g.getContext('2d').getImageData(0, 0, 600, 160).data;
  let tall = 0, tallGap = 0; for (let X = 284; X < 316; X++) { for (let Y = 0; Y < 104; Y++) { if (d[(Y * 600 + X) * 4 + 3] > 100) tall++; if (gd[(Y * 600 + X) * 4 + 3] > 100) tallGap++; } }
  assert.ok(tallGap < tall * 0.35, `gap kept short (${tallGap} vs ${tall})`);
  const sk = treeSkirt(WAY_TREE); assert.ok(sk.w > WAY_TREE.w * 2 && sk.inkFloor < WAY_TREE.base && sk.inkFloor > WAY_TREE.base - sk.h);
});

test('grassSkirt: the mound under the grass sinks and dissolves at both ends (no turf block with vertical ends)', () => {
  for (const seed of [1, 7, 42, 99]) {
    // paint the mound red so it can be told from the blades
    const [c, x] = canvas(600, 160); grassSkirt(x, rng(seed), 300, 120, 400, 40, { seed, ground: ['#ff0000', '#ff0000'] });
    const d = x.getImageData(0, 0, 600, 160).data;
    const cov = (a, b) => { let n = 0; for (let X = a; X < b; X++) for (let Y = 112; Y < 124; Y++) { const i = (Y * 600 + X) * 4; if (d[i + 3] > 60 && d[i] > d[i + 1] + 60) n++; } return n / ((b - a) * 12); };
    assert.ok(cov(100, 112) < 0.02 && cov(488, 500) < 0.02, `seed ${seed}: no mound at the ends (${cov(100, 112).toFixed(2)}, ${cov(488, 500).toFixed(2)})`);
    assert.ok(cov(180, 420) > 0.1, `seed ${seed}: the mound is there under the middle`);
  }
});

test('hill: the standing stone stands in grass, with no ink line at its foot and no moonlight over that grass', () => {
  const S = getKit('hill')().build(), W = 300, H = 360, ox = STONE.x - 150, oy = STONE.base - 300;
  const p = S.props.find(q => q.id === 'standing_stone'), sk = stoneSkirt(STONE);
  assert.equal(p.inkFloor, sk.inkFloor);
  assert.ok(sk.w > STONE.w * 1.4 && sk.inkFloor < STONE.base && sk.base > STONE.base);
  const prop = S.propsSorted().find(q => q.id === 'standing_stone');
  const shot = night => { S.night = night; const [c, x] = canvas(W, H); x.translate(-ox, -oy); prop.draw(x); return x.getImageData(0, 0, W, H).data; };
  const day = shot(0), night = shot(1);
  // by day: nothing dark (ink) along the foot, where the flat bottom and the tufts used to be outlined
  let dark = 0; for (let Y = Math.round(STONE.base + 2 - oy); Y < Math.round(STONE.base + 14 - oy); Y++) for (let X = 80; X < 220; X++) { const i = (Y * W + X) * 4; if (day[i + 3] > 200 && lum(day, i) < 50) dark++; }
  assert.equal(dark, 0, 'no ink line under the stone');
  // by night: where the foot grass covers the stone it is still grass (green), while the stone above turns moonlit (blue)
  const [fc, fx] = canvas(W, H); fx.translate(-ox, -oy); standingStoneFoot(fx, STONE); const foot = fx.getImageData(0, 0, W, H).data; void fc;
  const P = standingStonePoly(STONE); let grass = 0, green = 0, bd = 0, bn = 0, n = 0;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const i = (Y * W + X) * 4, wx = X + ox + 0.5, wy = Y + oy + 0.5;
    if (!pointInPoly(P, wx, wy)) continue;
    if (foot[i + 3] === 255 && wy < sk.base - 3) { grass++; if (night[i + 1] > night[i + 2]) green++; }
    if (foot[i + 3] === 0 && wy < STONE.base - 40) { n++; bd += day[i + 2] - day[i + 1]; bn += night[i + 2] - night[i + 1]; }
  }
  assert.ok(grass > 100 && green === grass, `foot grass stays green at night (${green}/${grass})`);
  assert.ok(bn / n > bd / n + 20, 'the stone above it is moonlit');
});

test('a big tree is inked down its sides but not along its foot in the grass', () => {
  const T = { ...WAY_TREE, branches: [], canopy: null }, sk = treeSkirt(T);
  const build = extra => makeSet({ id: 't', W: 3000, H: 1500, refX: 1500, refY: 800, horizon: 600, laneY: 1100, baseS: 1, layers: [], anchors: { a: { x: 1, y: 1 } },
    props: [{ id: 'tree', x: T.x, y: T.base - 10, base: T.base, bounds: [T.x - 300, T.top, T.x + 300, T.base + 30], paint: (x, r) => bigTree(x, r, T), ...extra }] }).build().props[0];
  const img = p => { const [c, x] = canvas(700, 260); x.translate(-(T.x - 350), -(T.base - 200)); x.drawImage(p.sprite, p.sx, p.sy, p.sw, p.sh); return x.getImageData(0, 0, 700, 260).data; };
  const bare = img(build({ inkW: 0 })), inked = img(build({})), floor = img(build({ inkFloor: sk.inkFloor }));
  const diff = (A, B, y0, y1) => { let n = 0; for (let Y = y0; Y < y1; Y++) for (let X = 0; X < 700; X++) { const i = (Y * 700 + X) * 4; if (Math.abs(A[i + 3] - B[i + 3]) > 60) n++; } return n; };
  const fy = Math.round(sk.inkFloor - (T.base - 200));
  assert.ok(diff(inked, bare, fy + 2, 260) > 200, 'without inkFloor an ink line runs under the foot');
  assert.equal(diff(floor, bare, fy + 2, 260), 0, 'with it: nothing but paint below the floor');
  assert.ok(diff(floor, bare, 0, fy - INK_FADE) > 200, 'the trunk is still inked higher up');
});

test('stream: river stones a hare can stand on, spaced apart, inked only above the water', () => {
  const S = sets.stream, hareH = 103 * S.scaleAt(1300, STONES[0].top);
  for (const st of STONES) {
    assert.ok(st.rx * 2 > hareH * 0.35 && st.rx * 2 < hareH * 0.6, `${st.id} width ${st.rx * 2} vs a hare ${hareH.toFixed(0)} tall`);
    assert.ok(st.ry / st.rx > 0.2 && st.ry / st.rx < 0.4, 'top ellipse foreshortened like the ground');
    assert.ok(S.isWalkable(st.x, st.top) && S.inWater(st.x, waterline(st) + 2), 'stands in the water');
    const p = S.props.find(q => q.id === st.id); assert.equal(p.inkW, 0, 'paints its own ink');
  }
  for (let i = 1; i < STONES.length; i++) assert.ok(STONES[i].x - STONES[i].rx - (STONES[i - 1].x + STONES[i - 1].rx) > 25, 'water between stones');
  assert.ok(new Set(STONES.map(s => s.rx)).size > 2, 'not all the same size');
  assert.ok(FROG_ROCK.rx < STONES[0].rx);
  // the painted stone: dark ink on the top outline, none along the waterline (soft foam there)
  const st = { x: 100, top: 60, rx: 30, ry: 9 }, [c, x] = canvas(200, 120); steppingStone(x, rng(1), st);
  const d = x.getImageData(0, 0, 200, 120).data, row = Y => { let n = 0; for (let X = 60; X < 140; X++) { const i = (Y * 200 + X) * 4; if (d[i + 3] > 200 && lum(d, i) < 50) n++; } return n; };
  let top = 0; for (let Y = 45; Y < 56; Y++) top += row(Y);
  assert.ok(top > 20, 'inked top');
  assert.ok(row(Math.round(waterline(st)) + 1) < 6, 'no ink along the waterline');
});

test('stream water: varied colour with depth, and it moves (deterministically) inside the water only', () => {
  const S = sets.stream.build(), cam = { cx: 1250, cy: 1060, zoom: 3 }, W = 480, H = 270;
  const frame = t => { const [c, x] = canvas(W, H); x.setTransform(cam.zoom / 4, 0, 0, cam.zoom / 4, W / 2 - cam.cx * cam.zoom / 4, H / 2 - cam.cy * cam.zoom / 4); S.drawBack(x, cam, { t }); return x.getImageData(0, 0, W, H).data; };
  const a = frame(1), b = frame(1.6);
  // inside the water (away from stones): not a flat fill — the luminance spreads, and blue dominates
  const inside = []; for (let Y = 150; Y < 260; Y += 3) for (let X = 120; X < 400; X += 3) { const wx = cam.cx + (X - W / 2) / (cam.zoom / 4), wy = cam.cy + (Y - H / 2) / (cam.zoom / 4); if (S.inWater(wx, wy) && !S.onStone(wx, wy)) inside.push((Y * W + X) * 4); }
  assert.ok(inside.length > 400);
  const L = inside.map(i => lum(a, i)), m = L.reduce((p, q) => p + q, 0) / L.length, sd = Math.sqrt(L.reduce((p, q) => p + (q - m) ** 2, 0) / L.length);
  assert.ok(sd > 8, `water varies (sd ${sd.toFixed(1)})`);
  assert.ok(inside.filter(i => a[i + 2] > a[i] + 20).length > inside.length * 0.8, 'reads as water (blue)');
  let moved = 0; for (const i of inside) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) moved++;
  assert.ok(moved > inside.length * 0.01, `the water moves (${moved} px changed)`);
  assert.deepEqual(Buffer.from(frame(1)), Buffer.from(a), 'same t, same frame');
  // streamFlow draws only inside the water
  const G = streamGeom(WATER.slice(0, WATER.length / 2), WATER.slice(WATER.length / 2).reverse()), [c, x] = canvas(400, 300);
  x.translate(-1100, -950); streamFlow(x, G, 2.3, { stones: STONES.map(s => ({ x: s.x, base: waterline(s), rx: s.rx })) });
  const d = x.getImageData(0, 0, 400, 300).data; let out = 0, inn = 0;
  for (let Y = 0; Y < 300; Y += 2) for (let X = 0; X < 400; X += 2) if (d[(Y * 400 + X) * 4 + 3] > 0) { if (pointInPoly(G.poly, X + 1100, Y + 950)) inn++; else out++; }
  assert.ok(inn > 50 && out === 0, `${inn} inside, ${out} outside`);
  assert.equal(typeof paintStream, 'function');
});

test('hill by night: the levels follow the sky, day frames are untouched, the stone stays the brightest land', () => {
  assert.equal(nightLevel('night'), 1); assert.equal(nightLevel('noon'), 0); assert.equal(nightLevel(null), 0);
  assert.ok(nightLevel('twilight') > 0.3 && nightLevel('twilight') < 1);
  assert.ok(Math.abs(nightLevel([['night', 0.5], ['dawn', 0.5]]) - (1 + NIGHT_LEVEL.dawn) / 2) < 1e-9);
  const S = getKit('hill')().build(), [c0, x0] = canvas(8, 8);
  S.drawSky(x0, { cx: 1650, cy: 800, zoom: 1 }, 'night', 0); assert.equal(S.night, 1);
  S.drawBack(x0, { cx: 1650, cy: 800, zoom: 0.01 }, { haze: 'golden' }); assert.equal(S.night, 0);
  S.drawBack(x0, { cx: 1650, cy: 800, zoom: 0.01 }, { night: 0.4 }); assert.equal(S.night, 0.4);
  const cam = { cx: 2380, cy: 720, zoom: 1.2 }, W = 480, H = 270, k = cam.zoom / 4;
  const frame = (sky, night) => {
    const [c, x] = canvas(W, H); S.drawSky(x, cam, sky, 0);
    x.setTransform(k, 0, 0, k, W / 2 - cam.cx * k, H / 2 - cam.cy * k);
    S.drawBack(x, cam, { haze: sky, ...(night != null ? { night } : {}) }); for (const p of S.propsSorted()) p.draw(x); S.drawFront(x, cam, {});
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgb(92,102,156)'; x.fillRect(0, 0, W, H);   // the night grade's multiply
    return x.getImageData(0, 0, W, H).data;
  };
  const sp = (d, wx, wy) => { const X = Math.round(W / 2 + (wx - cam.cx) * k), Y = Math.round(H / 2 + (wy - cam.cy) * k); let s = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += lum(d, ((Y + j) * W + X + i) * 4); return s / 25; };
  const lit = [STONE.x + STONE.w * 0.3, STONE.base - STONE.h * 0.55], slope = [STONE.x - 260, hillGround(STONE.x - 260) + 90], fore = [STONE.x - 100, 1150];
  const night = frame('night'), flat = frame('night', 0);
  assert.ok(sp(night, ...lit) > sp(night, ...slope) + 25, `stone ${sp(night, ...lit).toFixed(0)} vs slope ${sp(night, ...slope).toFixed(0)}`);
  assert.ok(sp(night, ...lit) - sp(night, ...slope) > sp(flat, ...lit) - sp(flat, ...slope) + 15, 'the night pass opens up the contrast');
  assert.ok(sp(night, ...fore) < sp(night, ...slope), 'the slope darkens toward the viewer');
  // by day the night passes draw nothing
  const day = frame('golden'), [c1, x1] = canvas(8, 8); void c0; void c1; void x1;
  assert.deepEqual(Buffer.from(day), Buffer.from(frame('golden', 0)));
});

// ───────────── round 4: the moon, the moon's side, a copse's end ─────────────
const ringMeans = (d, W, cx, cy, r0, r1) => {      // mean luminance of a ring around (cx, cy), per quadrant [UL, UR, LL, LR]
  const s = [0, 0, 0, 0], n = [0, 0, 0, 0];
  for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
    const rr = Math.hypot(x - cx, y - cy); if (rr < r0 || rr > r1 || Math.abs(x - cx) < 2 || Math.abs(y - cy) < 2) continue;
    const q = (y > cy ? 2 : 0) + (x > cx ? 1 : 0); s[q] += lum(d, (y * W + x) * 4); n[q]++;
  }
  return s.map((v, i) => v / n[i]);
};

test('the moon paints nothing outside its disc but a round glow (no shading spills past the limb)', async () => {
  const { paintSkyBack, SKY_STYLE, SKY_W, SKY_H } = await import('../engine/paint/sky.mjs');
  const T0 = SKY_STYLE.twilight.moon;
  try { for (const [name, phase] of [['night', null], ['twilight', null], ['twilight', 0.55]]) for (const side of [-1, 1]) {
    if (phase != null) SKY_STYLE.twilight.moon = { ...T0, phase };          // a crescent too (no sky of this film has one)
    const M = SKY_STYLE[name].moon, paint = moonSide => { const [c, x] = canvas(SKY_W, SKY_H); paintSkyBack(name, x, rng(7), SKY_W, SKY_H, { side, moonSide }); return x.getImageData(0, 0, SKY_W, SKY_H).data; };
    // the same sky with the moon on the other side: the difference around this moon is the moon alone
    const a = paint(side), b = paint(-side), cx = Math.round((side < 0 ? M.x : 1 - M.x) * SKY_W), cy = Math.round(M.y * SKY_H);
    const qa = ringMeans(a, SKY_W, cx, cy, M.r * 1.05, M.r * 1.3), qb = ringMeans(b, SKY_W, cx, cy, M.r * 1.05, M.r * 1.3), q = qa.map((v, i) => v - qb[i]);
    // left and right of the limb at the same heights (the sky's gradient runs top to bottom) get the same glow
    assert.ok(Math.abs(q[0] - q[1]) < 8 && Math.abs(q[2] - q[3]) < 8, `${name} side ${side}: the glow around the limb is even (${q.map(v => v.toFixed(1)).join(' ')})`);
    const fx = cx + (M.phase ? (M.phase * (side < 0 ? 1 : -1) > 0 ? -0.75 : 0.75) * M.r : 0), face = ringMeans(a, SKY_W, Math.round(fx), cy, 0, M.r * 0.2);  // a crescent: on its lit limb
    assert.ok(Math.min(...face) > Math.max(...qa) + 60, `${name} ${M.phase} side ${side}: the lit face is far brighter than the sky beside it (${face.map(v => v.toFixed(0))})`);
  } } finally { SKY_STYLE.twilight.moon = T0; }
});

test('one moon through dusk and night: same size and phase, upper right in the village as on the hill', async () => {
  const { SKY_STYLE, SKY_W, SKY_H } = await import('../engine/paint/sky.mjs');
  const T = SKY_STYLE.twilight.moon, N = SKY_STYLE.night.moon;
  assert.equal(T.r, N.r, 'a cut from twilight to night keeps the moon\'s size');
  assert.equal(T.phase, N.phase, 'and its phase');
  for (const kit of ['village', 'hill']) for (const name of ['twilight', 'night']) {
    const back = getKit(kit)().skyCanvases(name).back, M = SKY_STYLE[name].moon, d = back.getContext('2d').getImageData(0, 0, SKY_W, SKY_H).data;
    const box = fx => { let s = 0, n = 0; const X = Math.round(fx * SKY_W), Y = Math.round(M.y * SKY_H); for (let y = Y - 20; y <= Y + 20; y++) for (let x = X - 20; x <= X + 20; x++) { s += lum(d, (y * SKY_W + x) * 4); n++; } return s / n; };
    assert.ok(box(1 - M.x) > box(M.x) + 80, `${kit} ${name}: the moon is upper right (${box(1 - M.x).toFixed(0)} vs ${box(M.x).toFixed(0)} on the left)`);
  }
});

test('treeline thin: the undergrowth tapers at the run\'s ends with the same random draws', async () => {
  const { treeline } = await import('../engine/paint/scenery.mjs');
  const run = thin => {
    const [c, x] = canvas(1600, 500), r = rng(42);
    treeline(x, r, 300, 1300, () => 400, () => 200, { thin, density: 0.5 });
    const d = x.getImageData(0, 0, 1600, 500).data;
    let past = 0; for (let X = 1305; X < 1600; X++) for (let y = 345; y < 470; y++) if (d[(y * 1600 + X) * 4 + 3] > 0) past++;   // the undergrowth past the end
    return { next: r(), past, mid: [...d.slice((450 * 1600 + 800) * 4, (450 * 1600 + 800) * 4 + 4)] };
  };
  const plain = run(0), thin = run(300);
  assert.equal(thin.next, plain.next, 'whatever is painted after the treeline is unchanged');
  assert.ok(thin.past < plain.past * 0.6, `less undergrowth past the end (${thin.past} vs ${plain.past} px)`);
  assert.deepEqual(thin.mid, plain.mid, 'the middle of the run is the same');
});

test('valley: each copse\'s undergrowth peters out instead of sticking out into the open valley', () => {
  const S = getKit('valley')().build(), ly = S.L.find(l => l.k === 0.86 && !l.front), d = ly.c.getContext('2d').getImageData(0, 0, ly.c.width, ly.c.height).data;
  const painted = (wx0, wx1, wy0, wy1) => { let n = 0; for (let wy = wy0; wy < wy1; wy += 2) for (let wx = wx0; wx < wx1; wx += 2) { const X = Math.round((wx - ly.E.x0) * ly.res), Y = Math.round((wy - ly.E.y0) * ly.res); if (X >= 0 && Y >= 0 && X < ly.c.width && Y < ly.c.height && d[(Y * ly.c.width + X) * 4 + 3] > 0) n++; } return n; };
  assert.equal(painted(1000, 1800, 900, 1120), 0, 'nothing of the copses between them, where the valley opens');
  assert.ok(painted(600, 800, 950, 1080) > 1000 && painted(2100, 2300, 950, 1080) > 1000, 'the copses themselves are there');
});
