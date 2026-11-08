// Animal rigs: contract, drawing, bounds, determinism, gaits with planted feet, gestures, idle, style, cast sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getRig, listRigs, register, requireRig, mixPose, idle, RIG_KINDS, EXPRESSIONS } from '../engine/cast/index.mjs';
import { SHADE, cel, darken, lighten, groundShadow, eye } from '../engine/core/style.mjs';
import { castSheet } from '../engine/cast/sheet.mjs';

const ANIMALS = ['hare', 'tortoise', 'fox', 'owl', 'squirrel', 'songbird', 'mouse', 'hedgehog', 'badger', 'deer', 'frog', 'beetle', 'butterfly'];
const FLYERS = ['owl', 'songbird', 'butterfly'];
const BASE_EXPR = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'sleepy'];
const GROUND_TOL = 0.85;           // units an outline may poke below the contact line (half an ink stroke)
const finite = v => typeof v === 'number' && Number.isFinite(v);

function render(rig, st, { s = 3, face = 1, W = 0, H = 0 } = {}) {
  const b = rig.bbox(st.pose, face), w = W || Math.ceil((b[2] - b[0]) * s + 40), h = H || Math.ceil((b[3] - b[1]) * s + 40);
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'), x = 20 - b[0] * s, y = 20 - b[1] * s;
  const res = rig.draw(ctx, x, y, s, face, { shadow: false, t: 0.5, ...st });
  return { cv, ctx, res, w, h, data: ctx.getImageData(0, 0, w, h).data };
}
function inkExtent({ data, w, h }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1 + 1, y1 + 1];
}
const pixelDiff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 12) n++; return n; };

test('registry: every animal rig is discovered and registered', () => {
  const kinds = listRigs();
  for (const k of ANIMALS) {
    assert.ok(kinds.includes(k), `${k} registered`);
    assert.ok(RIG_KINDS.includes(k), `${k} in RIG_KINDS`);
    assert.equal(getRig(k).kind, k);
  }
  assert.deepEqual(kinds, [...kinds].sort(), 'listRigs is sorted');
  assert.equal(getRig('no-such-rig'), undefined);
  assert.throws(() => requireRig('no-such-rig'), /no-such-rig/);
  assert.equal(typeof register, 'function');
  for (const e of BASE_EXPR) assert.ok(EXPRESSIONS.includes(e), `expression ${e}`);
});

for (const kind of ANIMALS) {
  const rig = getRig(kind);

  test(`${kind}: contract fields`, () => {
    assert.equal(typeof rig.label, 'string');
    for (const f of ['height', 'headHeight', 'width']) assert.ok(finite(rig[f]) && rig[f] > 0, f);
    assert.ok(rig.headHeight < rig.height + 1e-9, 'head fits in height');
    assert.equal(typeof rig.params, 'object');
    assert.equal(typeof rig.perch, 'boolean'); assert.equal(typeof rig.flies, 'boolean');
    assert.equal(typeof rig.draw, 'function'); assert.equal(typeof rig.bbox, 'function');
    for (const e of BASE_EXPR) assert.ok(rig.expressions.includes(e), `expression ${e}`);
    // poses: numbers only, and the required set
    for (const p of ['stand', 'sleep', 'alert']) assert.ok(rig.poses[p], `pose ${p}`);
    assert.ok(rig.poses.sit || rig.poses.rest, 'sit or rest');
    for (const [n, p] of Object.entries(rig.poses)) for (const [k, v] of Object.entries(p)) assert.ok(finite(v), `pose ${n}.${k} is a number`);
    // gaits with speed and stride
    const need = FLYERS.includes(kind) ? (kind === 'butterfly' ? ['fly'] : ['walk', 'run', 'fly']) : ['walk', 'run'];
    for (const g of need) assert.equal(typeof rig.gaits[g], 'function', `gait ${g}`);
    for (const g of Object.keys(rig.gaits)) {
      assert.ok(finite(rig.speeds[g]) && rig.speeds[g] > 0, `speed ${g}`);
      assert.ok(finite(rig.stride[g]) && rig.stride[g] > 0, `stride ${g}`);
      const hz = rig.speeds[g] / rig.stride[g];
      assert.ok(hz >= 0.5 && hz <= 4.5, `${g} cadence ${hz.toFixed(2)} Hz is animal-like`);
    }
    if (FLYERS.includes(kind)) assert.equal(rig.flies, true);
    // gestures
    const gNeed = ['nod', 'jump', 'laugh'];
    if (['hare', 'fox', 'squirrel', 'mouse'].includes(kind)) gNeed.push('wave', 'point');
    if (kind === 'owl') gNeed.push('hoot');
    if (kind === 'squirrel') gNeed.push('shush', 'drop');
    for (const g of gNeed) assert.ok(rig.gestures[g], `gesture ${g}`);
    for (const [n, G] of Object.entries(rig.gestures)) {
      assert.ok(finite(G.dur) && G.dur > 0, `${n}.dur`); assert.equal(typeof G.at, 'function');
      for (const u of [0, 0.3, 0.7, 1]) for (const [k, v] of Object.entries(G.at(u, rig.poses.stand))) assert.ok(finite(v), `${n}(${u}).${k}`);
    }
  });

  test(`${kind}: draw returns head, mouth and bounds; bbox is sane and mirrors`, () => {
    for (const pose of [rig.poses.stand, rig.poses.sleep, Object.values(rig.gaits)[0](0.3)]) {
      const r = rig.draw(null, 100, 200, 2, 1, { pose, shadow: false });
      for (const q of [r.head, r.mouth]) { assert.equal(q.length, 2); assert.ok(q.every(finite)); }
      assert.equal(r.bounds.length, 4); assert.ok(r.bounds.every(finite));
      const [x0, y0, x1, y1] = r.bounds, m = 2 * 4;
      assert.ok(x1 > x0 && y1 > y0);
      for (const q of [r.head, r.mouth]) assert.ok(q[0] >= x0 - m && q[0] <= x1 + m && q[1] >= y0 - m && q[1] <= y1 + m, 'anchor inside bounds');
      // bbox is the same drawing at scale 1 relative to the contact point
      const b = rig.bbox(pose);
      for (let i = 0; i < 4; i++) assert.ok(Math.abs((r.bounds[i] - [100, 200, 100, 200][i]) / 2 - b[i]) < 0.6, 'draw bounds = bbox * s');
      const bm = rig.bbox(pose, -1);
      assert.deepEqual(bm.map(v => +v.toFixed(6)), [-b[2], b[1], -b[0], b[3]].map(v => +v.toFixed(6)));
      const rm = rig.draw(null, 0, 0, 1, -1, { pose, shadow: false }).bounds;
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(rm[i] - bm[i]) < 0.6, 'face -1 draws the mirror image');
    }
    // stand: feet on the ground, calibrated height
    const b = rig.bbox(rig.poses.stand);
    assert.ok(b[3] <= GROUND_TOL && b[3] >= -1.5, `stand bottom ${b[3].toFixed(2)} on the ground`);
    assert.ok(Math.abs(-b[1] - rig.height) / rig.height < 0.08, `height ${rig.height} vs drawn ${(-b[1]).toFixed(1)}`);
    // lift raises the drawing, size scales it
    const l = rig.draw(null, 0, 0, 2, 1, { pose: rig.poses.stand, lift: 10, shadow: false }).bounds;
    assert.ok(Math.abs(l[3] - (b[3] * 2 - 20)) < 1.2, 'lift in units');
    const big = rig.draw(null, 0, 0, 1, 1, { pose: rig.poses.stand, params: { size: 1.5 }, shadow: false }).bounds;
    assert.ok(Math.abs(-big[1] / -b[1] - 1.5) < 0.05, 'params.size scales the rig');
  });

  test(`${kind}: tracked bounds match the painted pixels`, () => {
    for (const pose of [rig.poses.stand, rig.poses.alert, Object.values(rig.gaits)[0](0.6)]) {
      const R = render(rig, { pose, expr: 'happy', talk: 0.6 });
      const ex = inkExtent(R), bd = R.res.bounds, tol = 2.5 + 0.02 * (bd[2] - bd[0] + bd[3] - bd[1]);
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(ex[i] - bd[i]) <= tol, `bounds[${i}] ${bd[i].toFixed(1)} vs pixels ${ex[i]} (tol ${tol.toFixed(1)})`);
    }
  });

  test(`${kind}: deterministic pixels; talk, blink and expressions show`, () => {
    const st = { pose: rig.poses.stand, t: 1.25, breath: 0.4, look: 0.3 };
    const S = 120 / Math.max(rig.height, rig.width);
    const a = render(rig, st, { s: S }), b = render(rig, st, { s: S });
    assert.equal(pixelDiff(a.data, b.data), 0, 'same state → identical pixels');
    const dim = { s: S, W: a.w, H: a.h };
    const base = render(rig, { pose: rig.poses.stand }, dim).data;
    assert.ok(pixelDiff(render(rig, { pose: rig.poses.stand, talk: 1 }, dim).data, base) > 0, 'talk opens the mouth');
    assert.ok(pixelDiff(render(rig, { pose: rig.poses.stand, blink: 1 }, dim).data, base) > 0, 'blink closes the eyes');
    for (const e of BASE_EXPR.slice(1)) assert.ok(pixelDiff(render(rig, { pose: rig.poses.stand, expr: e }, dim).data, base) > 0, `expression ${e} changes the face`);
  });

  test(`${kind}: nothing goes through the ground`, () => {
    const bad = [];
    const check = (name, pose) => { const b = rig.draw(null, 0, 0, 1, 1, { pose, shadow: false }).bounds; if (b[3] > GROUND_TOL) bad.push(`${name}:${b[3].toFixed(2)}`); };
    for (const [n, p] of Object.entries(rig.poses)) check(n, p);
    for (const [g, f] of Object.entries(rig.gaits)) for (let i = 0; i < 16; i++) check(`${g}@${i / 16}`, f(i / 16));
    for (const [g, G] of Object.entries(rig.gestures)) for (let i = 0; i <= 12; i++) check(`${g}@${(i / 12).toFixed(2)}`, G.at(i / 12, rig.poses.stand));
    assert.deepEqual(bad, []);
  });

  test(`${kind}: gaits plant their feet (no sliding) and loop`, () => {
    for (const [g, fn] of Object.entries(rig.gaits)) {
      const p0 = fn(0), p1 = fn(1);
      for (const k of Object.keys(p0)) assert.ok(Math.abs(p0[k] - p1[k]) < 1e-6, `${g}: phase 0 and 1 agree on ${k}`);
      if (!rig.feet) continue;
      const st = rig.stride[g], N = 240;
      let planted = 0;
      const touch = [];
      for (let i = 0; i < N; i++) {
        const F = rig.feet(fn(i / N)), F2 = rig.feet(fn((i + 1) / N)), Fp = rig.feet(fn((i - 1 + N) / N));
        F.forEach(([x, y, c], j) => {
          assert.ok(y <= 0.05, `${g}@${i / N}: foot ${j} below the ground (${y.toFixed(2)})`);
          if (c && !Fp[j][2]) touch.push(i / N);
          if (c && F2[j][2]) {                        // planted over this step: moves back by exactly stride/N, stays down
            planted++;
            assert.ok(Math.abs(F2[j][0] - x + st / N) < 1e-3 && Math.abs(F2[j][1] - y) < 1e-3, `${g}@${i / N}: planted foot ${j} slides`);
            assert.ok(Math.abs(y) < 0.05, `${g}: planted foot ${j} is on the ground`);
          }
        });
      }
      const flying = ['fly', 'glide'].includes(g);
      if (flying) { assert.equal(planted, 0, `${g}: no planted feet in the air`); continue; }
      assert.ok(planted > N * 0.3, `${g}: feet are planted for a good part of the cycle`);
      // footfall cues match the actual touchdowns
      const steps = rig.steps?.[g];
      assert.ok(Array.isArray(steps) && steps.length, `${g}: steps declared`);
      const near = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
      for (const s of steps) assert.ok(touch.some(t => near(t, s) < 0.03), `${g}: step ${s} has a touchdown`);
      for (const t of touch) assert.ok(steps.some(s => near(t, s) < 0.07), `${g}: touchdown at ${t} has a step cue`);
    }
  });

  test(`${kind}: gestures start and end on the base pose`, () => {
    for (const [n, G] of Object.entries(rig.gestures)) {
      if (kind === 'squirrel' && n === 'drop') continue;          // one-way: the acorn ends on the ground
      for (const bn of ['stand', 'sit', 'rest']) {
        const b = rig.poses[bn]; if (!b) continue;
        for (const u of [0, 1]) { const p = G.at(u, b); for (const k of Object.keys(b)) assert.ok(Math.abs((p[k] ?? 0) - b[k]) < 0.02, `${n}(${u}) from ${bn}: ${k}`); }
      }
    }
  });
}

test('mixPose blends numbers', () => {
  const a = { x: 0, y: 10, k: 1 }, b = { x: 10, y: 20, k: 3 };
  assert.deepEqual(mixPose(a, b, 0), a); assert.deepEqual(mixPose(a, b, 1), b);
  assert.deepEqual(mixPose(a, b, 0.5), { x: 5, y: 15, k: 2 });
});

test('idle: seeded blinks every few seconds and a breathing phase', () => {
  const rig = getRig('fox');
  let blinks = 0, closedFrames = 0, prev = 0;
  for (let f = 0; f < 60 * 24; f++) {
    const { breath, blink } = idle(rig, f / 24, 'fox-1');
    assert.ok(breath >= 0 && breath <= 1 && blink >= 0 && blink <= 1);
    if (blink > 0 && prev === 0) blinks++;
    if (blink > 0) closedFrames++;
    prev = blink;
  }
  assert.ok(blinks >= 12 && blinks <= 24, `${blinks} blinks a minute (one every 2.5–5 s)`);
  assert.ok(closedFrames / blinks <= 0.15 * 24 + 1.5, 'each blink lasts about 0.15 s');
  assert.deepEqual(idle(rig, 12.3, 'a'), idle(rig, 12.3, 'a'));
  const differ = Array.from({ length: 200 }, (_, i) => idle(rig, i / 10, 'a').blink !== idle(rig, i / 10, 'b').blink).some(Boolean);
  assert.ok(differ, 'different seeds blink at different times');
});

test('style helpers', () => {
  assert.equal(SHADE, '#c3b8dc');
  assert.equal(darken('#808080', 0.5), '#404040');
  assert.equal(lighten('#000000', 0.5), '#808080');
  const cv = createCanvas(80, 80), ctx = cv.getContext('2d');
  cel(ctx, [[10, 10], [60, 12], [55, 60], [12, 50]], '#b08559', 3, 1.2, 4);
  groundShadow(ctx, 40, 70, 30, 0, 0.3);
  eye(ctx, 40, 30, 4, 5, 'open', '#2a1a14', 0.5);
  eye(ctx, 20, 30, 4, 5, 'happy');
  const d = ctx.getImageData(0, 0, 80, 80).data;
  let painted = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) painted++;
  assert.ok(painted > 1500);
});

test('castSheet writes a labelled sheet', async () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'cinecode-rigs-'));
  try {
    const out = nodePath.join(dir, 'sheet.png');
    const r = await castSheet(['beetle', 'frog'], out);
    assert.equal(r.path, out);
    assert.ok(r.width > 1000 && r.height > 600);
    assert.ok(fs.statSync(out).size > 50_000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
