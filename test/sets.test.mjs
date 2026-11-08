// Sets: kit registry, anchors, perspective, walkability, routing, camera clamping, layer coverage,
// sky names, and a deterministic, unclipped build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getKit, listKits, registerKit } from '../engine/set/kits/index.mjs';
import { makeSet, clampCamera, pointInPoly, inEllipse, SKY_TIMES, MAX_VIEW } from '../engine/set/set.mjs';
import { branchTop } from '../engine/paint/paint.mjs';
import { canvas } from '../engine/core/lib.mjs';

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
