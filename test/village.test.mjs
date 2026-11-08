// The village kit: registration, anchors (door, gate, bench seat, perches, chimney), routing through the gate,
// walkability of the garden, camera/layer coverage, a deterministic build, and the lamps (levels by sky, the
// emitted-light pass and its occlusion by whatever stands in front).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getKit, listKits } from '../engine/set/kits/index.mjs';
import village, { COTTAGE, COTTAGE_G, GARDEN, BEDS, BENCH, BENCH_G, WELL, WELL_G, LANTERN, VILLAGE_BRANCH, villageLane, villageScale, villagePath } from '../engine/set/kits/village.mjs';
import { clampCamera, pointInPoly, inEllipse, SKY_TIMES, MAX_VIEW } from '../engine/set/set.mjs';
import { branchTop } from '../engine/paint/nature.mjs';
import { canvas } from '../engine/core/lib.mjs';
import { lampLevel, LAMP_LEVEL, cottageGeom, fenceStations, benchGeom, wellGeom, lanternGeom } from '../engine/paint/structures.mjs';

const S = getKit('village')();
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
// Where a polyline crosses the horizontal line y = Y (x of each crossing).
const crossings = (R, Y) => { const out = []; for (let i = 1; i < R.length; i++) { const [x0, y0] = R[i - 1], [x1, y1] = R[i]; if ((y0 - Y) * (y1 - Y) < 0) out.push(x0 + ((Y - y0) / (y1 - y0)) * (x1 - x0)); } return out; };
const sampleRoute = (R, n = 40) => { const P = []; for (let i = 1; i < R.length; i++) for (let k = 0; k <= n; k++) P.push([R[i - 1][0] + ((R[i][0] - R[i - 1][0]) * k) / n, R[i - 1][1] + ((R[i][1] - R[i - 1][1]) * k) / n]); return P; };

test('registry discovers the village kit', () => {
  assert.ok(listKits().includes('village'));
  assert.equal(getKit('village'), village);
  assert.equal(S.id, 'village');
  assert.deepEqual(S.ambience, { day: 'village-day', night: 'village-night' });
  for (const t of SKY_TIMES) assert.ok(S.skyNames.includes(t), `sky ${t}`);
});

test('at least 8 anchors, all resolve to sane values', () => {
  assert.ok(S.anchorNames.length >= 8, `${S.anchorNames.length} anchors`);
  const want = { door_front: 'ground', gate: 'ground', garden_path: 'ground', window_left: 'ground', bench_seat: 'surface', bench_front: 'ground', well_rim: 'surface', well_side: 'ground', low_branch: 'perch', branch_tip: 'perch', chimney_top: 'surface', roof_ridge: 'surface', lantern_foot: 'ground', lane_mid: 'ground' };
  for (const [name, type] of Object.entries(want)) assert.equal(S.anchor(name).type, type, name);
  for (const a of S.anchors()) {
    for (const f of ['x', 'y', 's', 'depth']) assert.ok(Number.isFinite(a[f]), `${a.name}.${f} = ${a[f]}`);
    assert.ok(a.s > 0.2 && a.s < 4, `${a.name} scale ${a.s}`);
    if (a.type === 'ground') { assert.ok(S.isWalkable(a.x, a.y), `${a.name} (${a.x},${a.y}) is not walkable`); assert.ok(near(a.s, villageScale(a.y), 1e-9)); }
    else { const p = S.props.find(q => q.id === a.prop); assert.ok(p, `${a.name} belongs to a prop`); assert.ok(a.depth >= p.y, `${a.name} sorts in front of ${p.id}`); assert.ok(a.y < a.depth, `${a.name} sits above the ground`); }
    if (a.type === 'perch') { assert.ok(near(a.y, branchTop(a.branch, a.x))); assert.ok(a.x >= a.range[0] && a.x <= a.range[1]); }
  }
  assert.throws(() => S.anchor('nope'), /no anchor/);
});

test('bench_seat is a seat a person can sit on', () => {
  const a = S.anchor('bench_seat'), bench = S.props.find(p => p.id === 'bench');
  assert.equal(a.type, 'surface'); assert.equal(a.prop, 'bench'); assert.equal(a.surface, 'wood');
  assert.ok(near(a.y, BENCH_G.y), 'contact point on the seat top');
  assert.ok(a.x > BENCH.x - BENCH.w / 2 && a.x < BENCH.x + BENCH.w / 2);
  const seatUnits = (a.depth - 1 - a.y) / a.s;                // what a sitter passes as st.seatHeight
  assert.ok(seatUnits > 40 && seatUnits < 70, `seat height ${seatUnits.toFixed(1)} units`);
  assert.ok(near(seatUnits, (BENCH.base - BENCH_G.y) / villageScale(BENCH.base + 1), 1e-9));
  assert.ok(!inEllipse(bench.solid, a.x, a.y), 'the seat is above the footprint, not inside it');
  for (const n of ['bench_left', 'bench_right']) { const b = S.anchor(n); assert.equal(b.y, a.y); assert.equal(b.depth, a.depth); }
  assert.ok(S.isWalkable(S.anchor('bench_front').x, S.anchor('bench_front').y));
});

test('door_front stands on the path in front of the door', () => {
  const a = S.anchor('door_front'), D = COTTAGE_G.door;
  assert.ok(a.x > D.x0 && a.x < D.x1, 'in front of the door');
  assert.ok(a.y > COTTAGE.base && a.y < COTTAGE.base + 40, 'just in front of the wall');
  assert.ok(['gravel', 'stone'].includes(a.surface), a.surface);
  assert.ok(!S.inSolid(a.x, a.y));
  const top = S.anchor('chimney_top');
  assert.ok(top.y < COTTAGE_G.ridgeY, 'chimney top above the ridge');
});

test('route from the gate to the door goes up the garden path and avoids every solid', () => {
  const R = S.route('gate', 'door_front'), g = S.anchor('gate'), d = S.anchor('door_front');
  assert.equal(R.blocked, false);
  assert.deepEqual(R[0], [g.x, g.y]); assert.deepEqual(R[R.length - 1], [d.x, d.y]);
  for (const [x, y] of sampleRoute(R)) {
    assert.ok(S.isWalkable(x, y), `unwalkable at ${x.toFixed(0)},${y.toFixed(0)}`);
    for (const c of S.colliders()) assert.ok(!inEllipse(c, x, y), `route passes through ${c.id}`);
    if (y < GARDEN.front + 10) assert.ok(x > GARDEN.gate[0] && x < GARDEN.gate[1], `left the path at ${x.toFixed(0)},${y.toFixed(0)}`);
  }
  const [cx] = crossings(R, GARDEN.front);
  assert.ok(cx > GARDEN.gate[0] + 12 && cx < GARDEN.gate[1] - 12, 'through the gate between its posts');
  assert.deepEqual(S.route('gate', 'door_front'), R, 'routing is deterministic');
});

test('the garden can only be entered through the gate', () => {
  for (const [from, to] of [['lane_west', 'window_left'], ['orchard', 'door_front'], ['well_side', 'window_right'], ['lane_east', 'garden_path']]) {
    const R = S.route(from, to);
    assert.equal(R.blocked, false, `${from}->${to}`);
    const xs = crossings(R, GARDEN.front).filter(x => x > GARDEN.x0 - 10 && x < GARDEN.x1 + 10);      // crossings of the front fence's line
    assert.ok(xs.length >= 1, `${from}->${to} enters the garden`);
    for (const x of xs) assert.ok(x > GARDEN.gate[0] && x < GARDEN.gate[1], `${from}->${to} crosses the fence at x=${x.toFixed(0)}`);
    for (const [x, y] of sampleRoute(R, 30)) { assert.ok(S.isWalkable(x, y), `${from}->${to} at ${x.toFixed(0)},${y.toFixed(0)}`); for (const c of S.colliders()) assert.ok(!inEllipse(c, x, y), `${from}->${to} through ${c.id}`); }
  }
});

test('walkable sanity: beds, lawn behind the fence, cottage, well and lane', () => {
  for (const b of BEDS) assert.equal(S.isWalkable((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), false, b.id);
  assert.equal(S.isWalkable(720, GARDEN.front - 12), false, 'the lawn just inside the fence');
  assert.equal(S.isWalkable((COTTAGE.x0 + COTTAGE.x1) / 2, COTTAGE.base - 20), false, 'inside the cottage');
  assert.equal(S.isWalkable(WELL.x, WELL.base), false, 'inside the well');
  assert.equal(S.isWalkable(S.area.x0 - 200, S.area.y0 - 200), false);
  for (const c of S.colliders()) { assert.ok(c.rx > 0 && c.ry > 0); assert.equal(S.isWalkable(c.x, c.y), false, `collider ${c.id} centre`); }
  for (const x of [0, 900, 1800, 2700]) { const y = villageLane(x); assert.ok(S.isWalkable(x, y)); assert.equal(S.surfaceAt(x, y), 'stone'); assert.ok(pointInPoly(villagePath, x, y)); }
  assert.equal(S.surfaceAt(1900, 900), 'grass');
  assert.equal(S.surfaceAt(1050, 990), 'stone', 'the flagstone path');
  assert.equal(S.laneAt(500), villageLane(500));
  assert.equal(S.walk.water.length, 0);
});

test('routes between ground anchors stay walkable and clear of colliders', () => {
  const pts = S.anchors().filter(a => a.type === 'ground');
  for (let i = 0; i < pts.length; i++) for (let j = i + 3; j < pts.length; j += 4) {
    const a = pts[i], b = pts[j], R = S.route(a.name, b.name);
    assert.equal(R.blocked, false, `${a.name}->${b.name}`);
    assert.deepEqual(R[0], [a.x, a.y]); assert.deepEqual(R[R.length - 1], [b.x, b.y]);
    for (const [x, y] of sampleRoute(R, 20)) { assert.ok(S.isWalkable(x, y), `${a.name}->${b.name} at ${x.toFixed(0)},${y.toFixed(0)}`); for (const c of S.colliders()) assert.ok(!inEllipse(c, x, y), `${a.name}->${b.name} through ${c.id}`); }
  }
});

test('scaleAt grows toward the viewer; camera clamping keeps every layer covering the frame', () => {
  let prev = 0; for (let y = S.horizon + 20; y < 1500; y += 10) { const s = S.scaleAt(1400, y); assert.ok(s > prev); prev = s; }
  assert.ok(near(S.scaleAt(0, 1080), 1.3, 1e-9));
  assert.ok(S.area.x1 - S.area.x0 >= MAX_VIEW.w && S.area.y1 - S.area.y0 >= MAX_VIEW.h);
  const W = 1920, H = 1080;
  for (const zoom of [0.3, 0.6, 1, 1.6, 3]) for (const cx of [-5000, S.view.x0, S.refX, S.view.x1, 9000]) for (const cy of [-5000, S.view.y0, S.view.y1, 9000]) {
    const c = clampCamera(S, { cx, cy, zoom }, W, H), hw = W / 2 / c.zoom, hh = H / 2 / c.zoom;
    assert.ok(c.cx - hw >= S.area.x0 - 1e-6 && c.cx + hw <= S.area.x1 + 1e-6 && c.cy - hh >= S.area.y0 - 1e-6 && c.cy + hh <= S.area.y1 + 1e-6);
    for (const ly of S.def.layers) {
      const E = S.layerExtent(ly.k), dx = (c.cx - S.refX) * (1 - ly.k), dy = (c.cy - S.refY) * (1 - ly.k) * 0.4;
      assert.ok(E.x0 + dx <= c.cx - hw + 1e-6 && E.x1 + dx >= c.cx + hw - 1e-6, `layer k=${ly.k} side gap`);
      assert.ok(E.y0 + dy <= c.cy - hh + 1e-6, `layer k=${ly.k} top gap`);
    }
  }
});

const hashSet = T => {
  const h = createHash('sha1');
  for (const ly of T.L) { const [c, x] = canvas(256, 128); x.drawImage(ly.c, 0, 0, 256, 128); h.update(x.getImageData(0, 0, 256, 128).data); }
  for (const p of T.props) { const [c, x] = canvas(64, 64); x.drawImage(p.sprite, 0, 0, 64, 64); h.update(x.getImageData(0, 0, 64, 64).data); }
  return h.digest('hex');
};

test('build is deterministic and idempotent; no prop is clipped; props sort by depth', () => {
  const a = S.build(), b = village().build();
  assert.equal(hashSet(a), hashSet(b));
  const L = a.L; a.build(); assert.equal(a.L, L);
  for (const p of a.props) { assert.ok(p.sprite && p.sw > 0 && p.sh > 0, p.id); assert.equal(p.clipped, false, `${p.id} clipped`); }
  const items = a.propsSorted();
  for (let i = 1; i < items.length; i++) assert.ok(items[i].y >= items[i - 1].y);
  for (const id of ['cottage', 'well', 'bench', 'lantern', 'tree', 'gate_post_l', 'gate_post_r', 'fence_left', 'fence_right']) { const it = items.find(q => q.id === id); assert.ok(it?.solid, `${id} is a solid prop`); }
});

test('lamp levels follow the sky; drawSky and drawBack set them', () => {
  assert.equal(lampLevel('night'), 1); assert.equal(lampLevel('morning'), 0); assert.equal(lampLevel('noon'), 0);
  assert.ok(lampLevel('twilight') > 0.5 && lampLevel('sunset') > 0 && lampLevel('dawn') > 0);
  assert.ok(near(lampLevel([['golden', 0.5], ['night', 0.5]]), (LAMP_LEVEL.golden + 1) / 2));
  assert.equal(lampLevel(0.4), 0.4); assert.equal(lampLevel(null), 0);
  const [c, x] = canvas(64, 36), cam = { cx: 1400, cy: 850, zoom: 0.05 };
  S.drawSky(x, cam, 'night', 0); assert.equal(S.lamps, 1);
  S.drawSky(x, cam, [['morning', 1]], 0); assert.equal(S.lamps, 0);
  S.drawBack(x, cam, { lights: 0.7 }); assert.equal(S.lamps, 0.7);
  S.drawBack(x, cam, { sky: 'twilight' }); assert.equal(S.lamps, LAMP_LEVEL.twilight);
  void c;
});

test('the emitted light: none by day, warm windows at night, hidden by whatever stands in front', () => {
  S.build();
  const w = COTTAGE_G.windows[0], px = w.x0 + w.w * 0.36, py = w.y0 + w.h * 0.27;        // the upper-left pane of the left window
  const W = 240, H = 160, cam = { cx: px, cy: py, zoom: 1 };
  const frame = (sky, occluders) => {
    const [c, x] = canvas(W, H); x.fillStyle = '#101018'; x.fillRect(0, 0, W, H);
    x.setTransform(1, 0, 0, 1, W / 2 - px, H / 2 - py);
    const drew = S.drawLights(x, cam, { t: 1.5, sky, occluders });
    x.setTransform(1, 0, 0, 1, 0, 0);
    return { drew, px: [...x.getImageData(W / 2, H / 2, 1, 1).data], data: x.getImageData(0, 0, W, H).data };
  };
  const day = frame('morning');
  assert.equal(day.drew, false); assert.deepEqual(day.px.slice(0, 3), [16, 16, 24]);
  const night = frame('night');
  assert.equal(night.drew, true);
  assert.ok(night.px[0] > 150 && night.px[0] > night.px[2] + 50, `warm pane at night: ${night.px}`);
  // someone standing in front of the window hides its light; someone behind the cottage does not
  const box = { y: COTTAGE.base + 30, draw: x => { x.fillStyle = '#000'; x.fillRect(w.x0 - 10, w.y0 - 10, w.w + 20, w.h + 20); } };
  const front = frame('night', [box]);
  assert.deepEqual(front.px.slice(0, 3), [16, 16, 24], 'occluded by an actor in front');
  const behind = frame('night', [{ ...box, y: COTTAGE.base - 30 }]);
  assert.deepEqual(behind.px, night.px, 'an actor behind the cottage does not hide its windows');
  // deterministic for the same time
  assert.deepEqual(Buffer.from(frame('night').data), Buffer.from(night.data));
});

test('a full night frame draws: sky, back layers, props, front layers, then the lights', () => {
  S.build();
  const W = 480, H = 270, [c, x] = canvas(W, H), cam = clampCamera(S, { cx: 1300, cy: 820, zoom: 0.25 }, W, H);
  S.drawSky(x, cam, [['twilight', 0.5], ['night', 0.5]], 3);
  x.setTransform(cam.zoom, 0, 0, cam.zoom, W / 2 - cam.cx * cam.zoom, H / 2 - cam.cy * cam.zoom);
  S.drawBack(x, cam, { t: 3, haze: 'night' });
  for (const p of S.propsSorted()) p.draw(x);
  S.drawFront(x, cam, { t: 3 });
  assert.equal(S.drawLights(x, cam, { t: 3 }), true);
  const d = x.getImageData(0, 0, W, H).data; let painted = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255) painted++;
  assert.equal(painted, W * H, 'frame fully painted');
  void c;
});

test('structure geometry helpers are pure and consistent', () => {
  const G = cottageGeom(COTTAGE);
  assert.equal(JSON.stringify(G), JSON.stringify(cottageGeom(COTTAGE)));
  assert.deepEqual(G.ridgeAt(0.5), cottageGeom(COTTAGE).ridgeAt(0.5));
  assert.ok(G.door.x0 > G.x0 && G.door.x1 < G.x1 && G.door.top > G.ye, 'door inside the front wall');
  for (const w of G.windows) assert.ok(w.x0 > G.x0 && w.x1 < G.x1 && w.y0 > G.ye && w.y1 < G.yb, 'window inside the wall');
  assert.ok(G.chimneyTop[1] < G.ridgeY && G.ridgeY < G.ye);
  assert.equal(G.footprint.length, 4);
  const st = fenceStations([0, 1000], [300, 1000], { sAt: () => 1 });
  assert.ok(st.length > 10); for (let i = 1; i < st.length; i++) assert.ok(st[i].x > st[i - 1].x && st[i].u <= 1 + 1e-9);
  const rec = fenceStations([0, 1000], [0, 880], { sAt: y => y / 1000 });
  for (let i = 1; i < rec.length; i++) assert.ok(rec[i].s < rec[i - 1].s, 'receding pickets get smaller');
  const B = benchGeom(BENCH); assert.ok(B.back < B.y && B.y < B.front && B.front < BENCH.base);
  const Wl = wellGeom(WELL); assert.equal(JSON.stringify(Wl), JSON.stringify(WELL_G)); assert.ok(Wl.rimY < WELL.base && Wl.roofTop < Wl.rimY);
  const Lg = lanternGeom(LANTERN); assert.ok(Lg.lamp[1] > Lg.hook[1] && Lg.lamp[1] < LANTERN.base);
  assert.ok(LANTERN.base - Lg.glass.y1 > 200 * villageScale(LANTERN.base), 'the lamp hangs above head height');
  assert.ok(VILLAGE_BRANCH.pts.length >= 2);
});
