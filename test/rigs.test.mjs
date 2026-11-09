// Animal rigs: contract, drawing, bounds, determinism, gaits with planted feet, gestures, idle, style, cast sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getRig, listRigs, register, requireRig, mixPose, idle, RIG_KINDS, EXPRESSIONS } from '../engine/cast/index.mjs';
import { faceOf, pitchPose, gaze } from '../engine/cast/rig.mjs';
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
    for (const [n, p] of Object.entries(rig.poses)) if (!(rig.hangPoses || []).includes(n)) check(n, p);   // hanging poses drape below the contact on purpose
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

// ───────────── round 2 (DESIGN §9.2) ─────────────
const PITCHERS = ['tortoise', 'squirrel', 'owl', 'hare', 'fox', 'deer', 'badger', 'mouse', 'hedgehog', 'frog'];
const ELDER = { shell: '#4b4630', skin: '#8c8a6e', rim: '#7a7056', seam: '#2e2a1c', moss: '#6e8b3d', star: 0.35, starCol: '#ede6d0', lids: 0.6, eye: '#3a2412', iris: '#b07a2a' };
const YOUNG = { shell: '#9a6b32', skin: '#a7a47f', rim: '#d8b07a', star: 1, starCol: '#ede6d0', moss: null };
// draw on a fixed canvas with the contact point at (cx, cy)
function shot(rig, st, { s = 4, face = 1, W = 560, H = 320, cx = 280, cy = 280 } = {}) {
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  const res = rig.draw(ctx, cx, cy, s, face, { shadow: false, t: 0.5, ...st });
  return { res, data: ctx.getImageData(0, 0, W, H).data, W, H, cx, cy, s, face };
}
const alphaAt = (R, x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= R.W || y >= R.H ? 0 : R.data[(y * R.W + x) * 4 + 3]; };
function boxStats(R, [x0, y0, x1, y1]) {
  let n = 0, lum = 0, green = 0;
  for (let y = Math.max(0, y0 | 0); y < Math.min(R.H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(R.W, x1); x++) {
    const i = (y * R.W + x) * 4; if (R.data[i + 3] < 200) continue;
    const r = R.data[i], g = R.data[i + 1], b = R.data[i + 2]; n++; lum += 0.3 * r + 0.59 * g + 0.11 * b; if (g > r + 12 && g > b + 12) green++;
  }
  return { n, lum: lum / (n || 1), green };
}
const coverage = R => { let n = 0; for (let i = 3; i < R.data.length; i += 4) if (R.data[i] > 2) n++; return n; };

test('faceOf: st.tilt becomes F.pitch (clamped); pitchPose and gaze', () => {
  assert.equal(faceOf({}).pitch, 0);
  assert.equal(faceOf({ tilt: 0.4 }).pitch, 0.4);
  assert.equal(faceOf({ tilt: 3 }).pitch, 1); assert.equal(faceOf({ tilt: -3 }).pitch, -1);
  const p = { hr: 0.1, hy: -10 };
  assert.equal(pitchPose(p, 0, { hr: -0.5 }, { hr: 0.5 }), p, 'no pitch → the same pose');
  assert.deepEqual(pitchPose(p, 0.5, { hr: -0.4, hy: -2 }, { hr: 0.4 }), { hr: 0.1 - 0.2, hy: -11 });
  assert.deepEqual(pitchPose(p, -1, { hr: -0.4 }, { hr: 0.4 }), { hr: 0.5, hy: -10 });
  assert.deepEqual(gaze({ look: 1, pitch: 1 }, 0.5, 2), [0.5, -0.76]);
});

for (const kind of PITCHERS) {
  test(`${kind}: st.tilt pitches the head (up raises it, down lowers it), stays off the ground`, () => {
    const rig = getRig(kind), pose = rig.poses.stand, S = 160 / Math.max(rig.height, rig.width);
    const W = Math.ceil(rig.width * S * 2.2 + 80), H = Math.ceil(rig.height * S * 1.8 + 60), opt = { s: S, W, H, cx: W / 2, cy: H - 20 };
    const a0 = shot(rig, { pose }, opt), up = shot(rig, { pose, tilt: 1 }, opt), dn = shot(rig, { pose, tilt: -1 }, opt);
    assert.equal(pixelDiff(shot(rig, { pose, tilt: 0 }, opt).data, a0.data), 0, 'tilt 0 = no tilt');
    assert.ok(pixelDiff(up.data, a0.data) > 20, 'tilt +1 changes the drawing');
    assert.ok(pixelDiff(dn.data, a0.data) > 20, 'tilt -1 changes the drawing');
    assert.ok(up.res.head[1] < a0.res.head[1] - 0.2, `up: head ${up.res.head[1].toFixed(1)} above ${a0.res.head[1].toFixed(1)}`);
    assert.ok(dn.res.head[1] > a0.res.head[1] + 0.2, `down: head ${dn.res.head[1].toFixed(1)} below ${a0.res.head[1].toFixed(1)}`);
    for (const t of [-1, -0.5, 0.5, 1]) for (const p of [rig.poses.stand, rig.poses.alert, rig.poses.sit || rig.poses.rest, Object.values(rig.gaits)[0](0.3)]) {
      const b = rig.draw(null, 0, 0, 1, 1, { pose: p, tilt: t, shadow: false, t: 0.4 }).bounds;
      assert.ok(b[3] <= GROUND_TOL, `tilt ${t}: bottom ${b[3].toFixed(2)} on the ground`);
    }
  });
  // a "look down" beat holds tilt -1 until the next look, so every later pose, gait and gesture inherits it
  test(`${kind}: st.tilt never pushes any pose, gait phase or gesture into the ground`, () => {
    const rig = getRig(kind), cases = [];
    for (const [n, p] of Object.entries(rig.poses)) if (!(rig.hangPoses || []).includes(n)) cases.push([n, p]);
    for (const [g, f] of Object.entries(rig.gaits)) for (let i = 0; i < 8; i++) cases.push([`${g}@${i / 8}`, f(i / 8)]);
    for (const [g, G] of Object.entries(rig.gestures || {})) for (let i = 0; i <= 8; i++) cases.push([`${g}@${i / 8}`, G.at(i / 8, rig.poses.stand)]);
    for (const [n, pose] of cases) {
      const b0 = rig.draw(null, 0, 0, 1, 1, { pose, shadow: false, t: 0.4 }).bounds[3];
      for (const tilt of [-1, -0.5, 1]) {
        const b = rig.draw(null, 0, 0, 1, 1, { pose, tilt, shadow: false, t: 0.4 }).bounds[3];
        assert.ok(b <= Math.max(b0 + 0.05, 0.65), `${n} tilt ${tilt}: bottom ${b.toFixed(2)} (untilted ${b0.toFixed(2)})`);
      }
    }
  });
}

test('tilt -1 on poses already near the ground: chins rest on it, never through it; the pitch is scaled back, not dropped', () => {
  const cases = [['hare', 'sleep'], ['hare', 'rest'], ['fox', 'sleep'], ['deer', 'graze'], ['deer', 'sleep'], ['badger', 'sleep'], ['badger', 'dig', 0.5],
    ['badger', 'sniff', 0.4], ['squirrel', 'sleep'], ['mouse', 'sleep'], ['hedgehog', 'sniff', 0.6], ['tortoise', 'stretch', 0.5]];
  for (const [kind, name, u] of cases) {
    const rig = getRig(kind), pose = u === undefined ? rig.poses[name] : rig.gestures[name].at(u, rig.poses.stand);
    const s = 200 / Math.max(rig.height, rig.width), W = Math.ceil(rig.width * s * 2.4), H = Math.ceil(rig.height * s * 1.6 + 60), cy = H - 40;
    for (const tilt of [0, -1]) {
      const R = shot(rig, { pose, tilt }, { s, W, H, cx: W / 2, cy });
      let below = 0;
      for (let y = Math.ceil(cy + GROUND_TOL * s) + 1; y < H; y++) for (let x = 0; x < W; x++) if (R.data[(y * W + x) * 4 + 3] > 128) below++;
      assert.equal(below, 0, `${kind} ${name}${u === undefined ? '' : '@' + u} tilt ${tilt}: ${below} px of ink below the ground`);
    }
  }
  const head = (kind, pose, tilt) => getRig(kind).draw(null, 0, 0, 1, 1, { pose, tilt, shadow: false, t: 0.4 }).head[1];
  const fox = getRig('fox'), deer = getRig('deer');
  assert.ok(head('fox', fox.poses.sleep, -1) > head('fox', fox.poses.sleep, 0) + 0.5, 'a sleeping fox still lowers its head as far as the ground allows');
  assert.ok(head('deer', deer.poses.stand, -1) > head('deer', deer.poses.stand, 0) + 4, 'a standing deer, with room to spare, gets the full pitch');
});

test('tortoise: a slow looker (lookTime ≈ 1 s); full tilt trembles with effort', () => {
  const T = getRig('tortoise');
  assert.ok(Math.abs(T.lookTime - 1) < 0.2, `lookTime ${T.lookTime}`);
  for (const k of PITCHERS) if (k !== 'tortoise') assert.ok(getRig(k).lookTime === undefined || getRig(k).lookTime < T.lookTime);
  const o = { s: 4 }, a = shot(T, { pose: T.poses.stand, tilt: 1, t: 0.1 }, o), b = shot(T, { pose: T.poses.stand, tilt: 1, t: 0.13 }, o);
  assert.ok(pixelDiff(a.data, b.data) > 0, 'the lifted head trembles over time');
  assert.equal(pixelDiff(shot(T, { pose: T.poses.stand, t: 0.1 }, o).data, shot(T, { pose: T.poses.stand, t: 0.13 }, o).data), 0, 'a resting dry tortoise is still');
  assert.equal(pixelDiff(shot(T, { pose: T.poses.hide, tilt: 1 }, o).data, shot(T, { pose: T.poses.hide }, o).data), 0, 'a withdrawn head cannot pitch');
});

test('tortoise.mount: the riding point sits on the drawn shell top in every pose, gait phase, lift and size', () => {
  const T = getRig('tortoise');
  assert.equal(typeof T.mount, 'function');
  const cases = [];
  for (const [n, p] of Object.entries(T.poses)) cases.push([n, p]);
  for (const [g, f] of Object.entries(T.gaits)) for (let i = 0; i < 12; i++) cases.push([`${g}@${i / 12}`, f(i / 12)]);
  for (const u of [0.3, 0.5, 0.7]) cases.push([`jump@${u}`, T.gestures.jump.at(u, T.poses.stand)]);
  for (const u of [0.2, 0.5]) cases.push([`laugh@${u}`, T.gestures.laugh.at(u, T.poses.stand)]);
  const bobs = new Set();
  for (const params of [{}, ELDER, { ...YOUNG, size: 0.55 }, { ...ELDER, size: 1.35, wet: 1 }]) for (const face of [1, -1]) for (const [name, pose] of cases) {
    const s = 4, R = shot(T, { pose, params }, { s, face, W: 700, H: 420, cx: 350, cy: 380 }), k = params.size ?? 1;
    const [ux, uy] = T.mount(pose, params);
    assert.ok(finite(ux) && finite(uy), `${name}: finite mount`);
    if (face === 1 && params === ELDER) bobs.add(uy.toFixed(3));
    const mx = R.cx + ux * s * face, my = R.cy + uy * s;
    let top = -1; for (let y = 0; y < R.H; y++) if (alphaAt(R, mx, y) > 128) { top = y; break; }
    const tag = `${name} face ${face} size ${k}`;
    assert.ok(top >= 0, `${tag}: shell under the mount`);
    assert.ok(alphaAt(R, mx, my) > 200, `${tag}: the mount point is on the drawing`);
    assert.ok(my - top >= 0 && my - top <= 1.6 * s * k + 2, `${tag}: mount ${my.toFixed(1)} vs shell top ${top} (it should sit just inside the top edge)`);
    assert.ok(alphaAt(R, mx, my - 2.5 * s * k) < 30, `${tag}: nothing of the shell above the riding point`);
  }
  assert.ok(bobs.size > 6, 'the riding point bobs with the walk');
  // scale and size: units at face 1, scale 1, size applied
  const m1 = T.mount(T.poses.stand, {}), m2 = T.mount(T.poses.stand, { size: 1.5 });
  assert.ok(Math.abs(m2[0] - m1[0] * 1.5) < 1e-9 && Math.abs(m2[1] - m1[1] * 1.5) < 1e-9);
  assert.ok(m1[1] < -45 && m1[1] > -51, `on top of a 50-unit shell (${m1[1].toFixed(2)})`);
  assert.ok(T.mount(T.poses.sit)[1] > m1[1] + 5, 'the shell sinks when it sits');
  const j = T.gestures.jump.at(0.5, T.poses.stand);
  assert.ok(Math.abs(T.mount(j)[1] - (T.mount({ ...j, lift: 0 })[1] - j.lift)) < 1e-9, 'lift raises the riding point');
  assert.deepEqual(T.mount(undefined), T.mount(T.poses.stand), 'no pose → stand');
});

test('tortoise params: star, moss, seam, lids, iris, wet', () => {
  const T = getRig('tortoise'), o = { s: 4 }, pose = T.poses.stand, base = { ...ELDER, star: 0 };
  const draw = (params, st = {}) => shot(T, { pose, params, ...st }, o);
  const B = draw(base);
  for (const [k, v] of [['star', 0.35], ['moss', null], ['seam', '#a03020'], ['lids', 0], ['iris', null], ['wet', 1], ['starCol', '#ff00ff']]) {
    const d = pixelDiff(draw({ ...base, [k]: v, ...(k === 'starCol' ? { star: 1 } : {}) }).data, (k === 'starCol' ? draw({ ...base, star: 1 }) : B).data);
    assert.ok(d > 30, `${k} changes the drawing (${d})`);
  }
  // the star: a pale marking on a rear scute, brighter with opacity, off-centre behind the dome's crest
  const sx = 280 - 16 * 4, sy = 280 - 30 * 4, box = [sx - 14, sy - 14, sx + 14, sy + 14];
  const s0 = boxStats(draw({ ...YOUNG, star: 0 }), box), s35 = boxStats(draw({ ...YOUNG, star: 0.35 }), box), s1 = boxStats(draw(YOUNG), box);
  assert.ok(s35.lum > s0.lum + 4 && s1.lum > s35.lum + 10, `star opacity lightens its scute (${s0.lum.toFixed(0)} → ${s35.lum.toFixed(0)} → ${s1.lum.toFixed(0)})`);
  const far = [280 + 14 * 4 - 14, 280 - 30 * 4 - 14, 280 + 14 * 4 + 14, 280 - 30 * 4 + 14];
  assert.ok(Math.abs(boxStats(draw({ ...YOUNG, star: 0 }), far).lum - boxStats(draw(YOUNG), far).lum) < 0.5, 'the star is one marking, not a pattern');
  // moss: green patches on the shell top
  const top = [280 - 40 * 4, 280 - 52 * 4, 280 + 30 * 4, 280 - 36 * 4];
  assert.ok(boxStats(draw(ELDER), top).green > boxStats(draw({ ...ELDER, moss: null }), top).green + 300, 'moss greens the top of the shell');
  // wet: darker, and the drips move with st.t (a dry tortoise does not)
  const shellBox = [280 - 30 * 4, 280 - 40 * 4, 280 + 25 * 4, 280 - 20 * 4];
  assert.ok(boxStats(draw({ ...ELDER, wet: 1 }), shellBox).lum < boxStats(draw(ELDER), shellBox).lum - 3, 'wet darkens the shell');
  const w1 = draw({ ...ELDER, wet: 1 }, { t: 0.3 }), w2 = draw({ ...ELDER, wet: 1 }, { t: 0.9 });
  assert.ok(pixelDiff(w1.data, w2.data) > 10, 'drips animate with st.t');
  assert.equal(pixelDiff(w1.data, draw({ ...ELDER, wet: 1 }, { t: 0.3 }).data), 0, 'deterministic drips');
  assert.equal(pixelDiff(draw(ELDER, { t: 0.3 }).data, draw(ELDER, { t: 0.9 }).data), 0, 'no drips when dry');
  // lids: a heavier resting lid hides more of the eye (it still blinks shut)
  const head = draw(ELDER).res.head, eyeBox = [head[0] + 2 * 4 - 14, head[1] - 2.4 * 4 - 12, head[0] + 7 * 4 + 14, head[1] - 2.4 * 4 + 12];
  assert.ok(pixelDiff(draw({ ...ELDER, lids: 0 }).data, draw(ELDER).data) > 10);
  assert.ok(pixelDiff(draw(ELDER, { blink: 1 }).data, draw(ELDER).data) > 10, 'heavy-lidded eyes still blink');
  assert.ok(boxStats(draw({ ...ELDER, lids: 0 }), eyeBox).lum !== boxStats(draw(ELDER), eyeBox).lum);
  // bounds stay honest with every look
  for (const params of [ELDER, YOUNG, { ...ELDER, wet: 1 }]) for (const p of [pose, T.poses.droop, T.gaits.walk(0.4)]) {
    const R = render(T, { pose: p, params, t: 0.85 }), ex = inkExtent(R), bd = R.res.bounds, tol = 2.5 + 0.02 * (bd[2] - bd[0] + bd[3] - bd[1]);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(ex[i] - bd[i]) <= tol, `bounds[${i}] ${bd[i].toFixed(1)} vs pixels ${ex[i]}`);
  }
});

test('tortoise: "droop" lowers the head (sad) without withdrawing it', () => {
  const T = getRig('tortoise'), P = T.poses.droop;
  assert.ok(P, 'droop pose');
  const st = T.draw(null, 0, 0, 1, 1, { pose: T.poses.stand }), dr = T.draw(null, 0, 0, 1, 1, { pose: P, expr: 'sad' }), hd = T.draw(null, 0, 0, 1, 1, { pose: T.poses.hide });
  assert.ok(dr.head[1] > st.head[1] + 4, `head lower (${dr.head[1].toFixed(1)} vs ${st.head[1].toFixed(1)})`);
  assert.ok(dr.head[0] > 38 && dr.head[0] > hd.head[0] + 15, 'head still out of the shell');
  assert.ok(dr.head[1] < -6, 'head clear of the ground');
  assert.ok(P.nl > 0.6 && P.na < 0 && P.hr > T.poses.stand.hr, 'neck out and down, head bowed');
});

test('squirrel: tail param (big and fluffy; < 0.7 a flat wet paintbrush that hangs)', () => {
  const S = getRig('squirrel'), o = { s: 4, W: 520, H: 340, cx: 300, cy: 300 };
  assert.equal(S.params.tail, 1);
  for (const pose of [S.poses.sit, S.poses.stand]) {
    const c = k => coverage(shot(S, { pose, params: { tail: k } }, o));
    const wet = c(0.6), small = c(0.75), one = c(1), big = c(1.7);
    assert.ok(wet < small && small < one && one < big, `coverage grows with tail: ${wet} ${small} ${one} ${big}`);
    assert.ok(wet < one * 0.75, 'the wet tail is much slimmer');
  }
  // the highest drawn point behind the body (x < -8 units): the brush stands up; a wet one is held low
  const topBehind = (k, pose) => { const R = shot(S, { pose, params: { tail: k } }, o); for (let y = 0; y < R.H; y++) for (let x = 0; x < R.cx - 8 * R.s; x++) if (R.data[(y * R.W + x) * 4 + 3] > 128) return (y - R.cy) / R.s; return 0; };
  for (const pose of [S.poses.sit, S.poses.stand]) {
    assert.ok(topBehind(0.6, pose) > -20 && topBehind(0.6, pose) > topBehind(1, pose) + 20, `the wet tail is held low (${topBehind(0.6, pose).toFixed(1)})`);
    assert.ok(topBehind(1, pose) < -35, 'a dry tail stands up');
    assert.ok(topBehind(1.7, pose) < topBehind(1, pose) - 5, 'a big tail stands taller');
  }
  const b = S.draw(null, 0, 0, 1, 1, { pose: S.poses.sit, params: { tail: 0.4 } }).bounds;
  assert.ok(b[3] <= GROUND_TOL, 'a wet tail lies on the ground, not through it');
  assert.equal(pixelDiff(shot(S, { pose: S.poses.sit, params: { tail: 3 } }, o).data, shot(S, { pose: S.poses.sit, params: { tail: 1.8 } }, o).data), 0, 'clamped to 0.4..1.8');
  assert.equal(pixelDiff(shot(S, { pose: S.poses.sit, params: { tail: 0.1 } }, o).data, shot(S, { pose: S.poses.sit, params: { tail: 0.4 } }, o).data), 0, 'clamped below at 0.4');
});

test('squirrel: tail is a size multiplier all the way down (0.4 < 0.5 < 0.6), the wet shape on top', () => {
  const S = getRig('squirrel'), o = { s: 4, W: 520, H: 340, cx: 300, cy: 300 };
  for (const pose of [S.poses.sit, S.poses.stand]) {
    const R = k => shot(S, { pose, params: { tail: k } }, o), c = [0.4, 0.5, 0.6, 0.7].map(k => coverage(R(k)));
    assert.ok(c[0] < c[1] && c[1] < c[2] && c[2] < c[3], `coverage grows below 0.7: ${c.join(' ')}`);
    assert.ok(pixelDiff(R(0.4).data, R(0.6).data) > 300, 'tail 0.4 and 0.6 draw differently');
  }
});

// the vertical extent (units) of the ink in the rearmost 3 units of a drawing: a hanging tip is tall, a level rod is thin
function rearSpan(data, W, H, s, keep = () => true) {
  let x0 = W;
  for (let x = 0; x < W && x0 === W; x++) for (let y = 0; y < H; y++) if (keep(x, y) && data[(y * W + x) * 4 + 3] > 128) { x0 = x; break; }
  let y0 = H, y1 = -1;
  for (let x = x0; x < x0 + 3 * s; x++) for (let y = 0; y < H; y++) if (keep(x, y) && data[(y * W + x) * 4 + 3] > 128) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, span: (y1 - y0) / s };
}
test('squirrel: the wet tail hangs, never a stiff level rod — on the grass and riding a shell (film shot 3.4)', () => {
  const S = getRig('squirrel'), T = getRig('tortoise'), WET = { coat: '#8e3c1e', tail: 0.6 };
  for (const name of ['sit', 'stand', 'alert', 'hold']) {
    const R = shot(S, { pose: S.poses[name], params: WET }, { s: 4, W: 520, H: 340, cx: 300, cy: 300 });
    const { span } = rearSpan(R.data, R.W, R.H, R.s);
    assert.ok(span > 4, `${name}: the tip hangs (${span.toFixed(2)} units tall at the back)`);
  }
  // riding the wet elder at the film's relative scale (pebble 1.35): the tip comes down toward the dome
  const s = 3, sT = s * 1.35, W = 700, H = 400, P = { ...ELDER, wet: 1 };
  for (const name of ['sit', 'alert']) {
    const cv = createCanvas(W, H), ctx = cv.getContext('2d'), m = T.mount(T.poses.stand, P);
    T.draw(ctx, 350, 360, sT, 1, { pose: T.poses.stand, params: P, shadow: false, t: 0.5 });
    const before = ctx.getImageData(0, 0, W, H).data;
    S.draw(ctx, 350 + m[0] * sT, 360 + m[1] * sT, s, 1, { pose: S.poses[name], params: WET, shadow: false, t: 0.5 });
    const after = ctx.getImageData(0, 0, W, H).data, mine = (x, y) => before[(y * W + x) * 4 + 3] < 30;
    const { x0, span } = rearSpan(after, W, H, s, mine);
    assert.ok(span > 4, `${name} on the shell: the tip hangs (${span.toFixed(2)})`);
    let gap = Infinity;                                       // from the tip's lowest ink down to the shell's top
    for (let x = x0; x < x0 + 3 * s; x++) {
      let low = -1, top = -1;
      for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (after[i + 3] > 128 && mine(x, y)) low = y; else if (low >= 0 && top < 0 && before[i + 3] > 128) top = y; }
      if (low >= 0 && top >= 0) gap = Math.min(gap, (top - low) / s);
    }
    assert.ok(gap < 8, `${name} on the shell: the tip hangs down toward the dome (${gap.toFixed(1)} units above it)`);
  }
});

test('squirrel: asleep, a wet tail drops off the rump and tucks under (not the dry curl standing as a thin hook)', () => {
  const S = getRig('squirrel'), o = { s: 4, W: 520, H: 340, cx: 300, cy: 300 };
  const topBehind = k => { const R = shot(S, { pose: S.poses.sleep, params: { tail: k } }, o); for (let y = 0; y < R.H; y++) for (let x = 0; x < R.cx - 8 * R.s; x++) if (R.data[(y * R.W + x) * 4 + 3] > 128) return (y - R.cy) / R.s; return 0; };
  assert.ok(topBehind(1) < -28, `dry: the brush curls up over the sleeper (${topBehind(1).toFixed(1)})`);
  for (const k of [0.4, 0.6]) assert.ok(topBehind(k) > -18, `wet ${k}: nothing stands up behind the body (${topBehind(k).toFixed(1)})`);
  const b = S.draw(null, 0, 0, 1, 1, { pose: S.poses.sleep, params: { tail: 0.6 } }).bounds;
  assert.ok(b[3] <= GROUND_TOL, 'the tucked tail lies on the ground, not through it');
});

test('squirrel: "flop" lies flat and exhausted over a shell (a hanging pose)', () => {
  const S = getRig('squirrel'), T = getRig('tortoise');
  assert.ok(S.poses.flop && S.hangPoses.includes('flop'));
  const f = S.bbox(S.poses.flop), sit = S.bbox(S.poses.sit);
  assert.ok(-f[1] < -sit[1] * 0.55, `flat: ${(-f[1]).toFixed(1)} tall vs sitting ${(-sit[1]).toFixed(1)}`);
  assert.ok(f[2] - f[0] > sit[2] - sit[0], 'sprawled long');
  assert.ok(f[3] > 3, 'limbs and tail hang below the contact point');
  const r = S.draw(null, 0, 0, 1, 1, { pose: S.poses.flop, expr: 'sleepy', talk: 0.5 });
  assert.ok(r.head[1] > -12 && r.head[1] < 0 && r.mouth[1] < 2, 'chin down, the mouth still visible to talk');
  // on the tortoise's shell the hanging parts stay over the shell's silhouette
  const s = 3, cv = createCanvas(700, 400), ctx = cv.getContext('2d'), m = T.mount(T.poses.stand, ELDER);
  T.draw(ctx, 350, 360, s, 1, { pose: T.poses.stand, params: ELDER, shadow: false });
  const before = ctx.getImageData(0, 0, 700, 400).data;
  S.draw(ctx, 350 + m[0] * s, 360 + m[1] * s, s, 1, { pose: S.poses.flop, shadow: false });
  const after = ctx.getImageData(0, 0, 700, 400).data;
  let added = 0, low = -Infinity;
  for (let i = 0; i < after.length; i += 4) if (after[i + 3] > 128 && before[i + 3] < 30) { added++; low = Math.max(low, Math.floor(i / 4 / 700)); }
  assert.ok(added > 1500, 'the squirrel shows on top');
  assert.ok((low - 360) / s < -18, `whatever hangs past the shell's outline stays on its upper half (lowest ${((low - 360) / s).toFixed(1)} units)`);
});

test('owl: one-eye expression (one open, one shut) — also when woken from sleep', () => {
  const O = getRig('owl'), o = { s: 6, W: 420, H: 480, cx: 210, cy: 440 };
  assert.ok(O.expressions.includes('one-eye'));
  for (const k of ANIMALS) if (k !== 'owl') assert.ok(!getRig(k).expressions.includes('one-eye'), `${k} does not claim one-eye`);
  const n = shot(O, { pose: O.poses.stand }, o), one = shot(O, { pose: O.poses.stand, expr: 'one-eye' }, o), shut = shot(O, { pose: O.poses.stand, blink: 1 }, o);
  assert.ok(pixelDiff(one.data, n.data) > 100 && pixelDiff(one.data, shut.data) > 100, 'differs from both open and shut');
  const eyeDiff = (A, B, ex) => { let d = 0; for (let y = o.cy - 48.5 * o.s; y < o.cy - 39.5 * o.s; y++) for (let x = o.cx + (ex - 4.5) * o.s; x < o.cx + (ex + 4.5) * o.s; x++) { const i = (Math.round(y) * o.W + Math.round(x)) * 4; if (Math.abs(A.data[i] - B.data[i]) > 20) d++; } return d; };
  assert.ok(eyeDiff(one, shut, -6.6) < 20, 'one eye is shut like a blink');
  assert.ok(eyeDiff(one, shut, 6.6) > 300 && eyeDiff(one, n, -6.6) > 300, 'the other is open');
  assert.ok(pixelDiff(shot(O, { pose: O.poses.stand, expr: 'one-eye', blink: 1 }, o).data, one.data) > 50, 'the open eye still blinks');
  assert.ok(pixelDiff(shot(O, { pose: O.poses.sleep, expr: 'one-eye' }, o).data, shot(O, { pose: O.poses.sleep }, o).data) > 100, 'a sleeping owl opens one eye');
});
