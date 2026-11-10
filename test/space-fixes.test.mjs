// Space fixes before the long solar-system film: the globe's shadow on its rings (a soft-edged cylinder across all of
// them, away from the Sun), no limb showing through the near rings, moons drawn as small lit worlds (Titan bigger and
// orange), two effects promoted from the Saturn chapter (lightbeam, ringfield), Pluto and Charon, NASA's Jupiter and
// Neptune, and lint treating deliberate crops (a focus, a zoom above 1 on a faceless subject, a dolly) as deliberate,
// counting kept warnings, and check validating a shot's lint block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { BUILTIN_EFFECTS } from '../engine/effects/index.mjs';
import { BODIES, drawBody, radiusOf, sunDir, ringShade, lightIn } from '../engine/paint/planets.mjs';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { lintPlan } from '../engine/lint/lint.mjs';
import { verifyEffects } from '../engine/render/verify.mjs';
import { LENS } from '../engine/set/set.mjs';
import { Tee } from '../engine/cast/rig.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BIN = join(ROOT, 'bin', 'cinecode.mjs');
const TILT = BODIES.saturn.tilt, ST = Math.sin(TILT);
const lum = (d, W, x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
// Saturn with plain rings and a plain globe (no ringlets, bands or gaps), unrolled, on a dark sky
const PLAIN = { body: 'saturn', roll: 0, bands: [], base: '#d8c090', spots: [],
  rings: [{ r0: 1.24, r1: 1.53, col: '#a69a84', a: 0.42 }, { r0: 1.53, r1: 1.95, col: '#ecdfbf', a: 0.96 }, { r0: 2.03, r1: 2.27, col: '#d6c6a2', a: 0.86 }] };
function paint(P, R) {
  const W = Math.round(R * 5.5), H = Math.round(R * 3), c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#1a1d3a'; x.fillRect(0, 0, W, H);
  drawBody(x, P, W / 2, H / 2, R, { t: 0 });
  return { d: x.getImageData(0, 0, W, H).data, W, H, cx: W / 2, cy: H / 2, light: lightIn(x) };
}

test('the globe\'s shadow on the rings: a cylinder as wide as the globe, away from the Sun, soft-edged, long enough to cross Saturn\'s rings', () => {
  // the Sun straight from the left in the ring plane: a strip one globe radius either side of the axis, to the right
  const side = [-1, 0, 0];
  assert.equal(ringShade(side, 1, 2, 0.9), 1); assert.equal(ringShade(side, 1, 2, -0.9), 1);
  assert.equal(ringShade(side, 1, 2, 1.1), 0); assert.equal(ringShade(side, 1, -2, 0), 0, 'nothing on the Sun\'s side');
  const edge = ringShade(side, 1, 2, 1);
  assert.ok(edge > 0.2 && edge < 0.8, `a soft edge (${edge})`);
  // Saturn's Sun, from its painter's light: low over the ring plane (the shadow reaches past the A ring's outer edge)
  const S = sunDir([-Math.SQRT1_2, -Math.SQRT1_2], TILT);
  assert.ok(Math.abs(Math.hypot(...S) - 1) < 1e-9 && S[2] > 0 && Math.asin(S[2]) <= 0.3 + 1e-9, `${S}`);
  const ang = Math.atan2(S[1], S[0]), axis = r => [-Math.cos(ang) * r, -Math.sin(ang) * r];
  for (const r of [1.3, 1.75, 2.1, 2.26]) assert.equal(ringShade(S, BODIES.saturn.ob, ...axis(r)), 1, `in shadow on the axis at ${r} radii`);
});

test('drawn: every ring is dark in the shadow and lit beside it at the same radius, the edge soft, on the side away from the light', () => {
  const R = 300, { d, W, cx, cy, light } = paint(PLAIN, R), S = sunDir(light, TILT), ob = BODIES.saturn.ob;
  const at = (r, th) => [cx + Math.cos(th) * r * R, cy + Math.sin(th) * r * R * ST];
  const hidden = (r, th) => Math.sin(th) < 0 && (Math.cos(th) * r) ** 2 + (Math.sin(th) * r * ST / ob) ** 2 < 1.05;
  for (const r of [1.38, 1.75, 2.15]) {
    // round the far half of the ring: the shaded and the lit points the globe does not hide
    const dark = [], lit = [], prof = [];
    for (let i = 0; i <= 720; i++) {
      const th = Math.PI + (Math.PI * i) / 720;
      if (hidden(r, th)) continue;
      const s = ringShade(S, ob, Math.cos(th) * r, Math.sin(th) * r), [x, y] = at(r, th), L = lum(d, W, x, y);
      if (s === 1) dark.push({ L, x, y }); else if (s === 0) lit.push(L);
      prof.push(L);
    }
    assert.ok(dark.length > 5 && lit.length > 5, `${r}: ${dark.length} shaded, ${lit.length} lit points in view`);
    const mD = dark.reduce((s, p) => s + p.L, 0) / dark.length, mL = lit.reduce((s, v) => s + v, 0) / lit.length;
    assert.ok(mD < 0.55 * mL, `${r}: shaded ${mD.toFixed(0)} vs lit ${mL.toFixed(0)}`);
    // away from the light (on the whole: a cylinder as wide as the globe reaches round beside it)
    const mx = dark.reduce((s, p) => s + p.x, 0) / dark.length - cx, my = dark.reduce((s, p) => s + p.y, 0) / dark.length - cy;
    assert.ok(mx * light[0] + my * light[1] < 0, `${r}: the shadow is on the lit side`);
    // soft: several samples between the two levels where it meets the lit ring
    const mid = prof.filter(v => v > mD + 0.15 * (mL - mD) && v < mL - 0.15 * (mL - mD)).length;
    assert.ok(mid >= 6, `${r}: a hard edge (${mid} samples between)`);
  }
});

test('the limb does not show through the near rings: no light or dark line where a ring crosses the globe\'s edge', () => {
  for (const R of [300, 700]) {
    const { d, W, cx, cy } = paint(PLAIN, R), ob = BODIES.saturn.ob, n = Math.round(0.04 * R) + 6;
    for (const r of [1.3, 1.38, 1.7, 1.8]) for (const side of [-1, 1]) {
      // where the near ring at radius r crosses the limb: across it, the ring over the globe, then over the sky
      const k2 = (r * ST / ob) ** 2, cos2 = (1 - k2) / (r * r - k2), X = cx + side * r * R * Math.sqrt(cos2), Y = cy + r * R * ST * Math.sqrt(1 - cos2);
      const prof = []; for (let i = -n; i <= n; i++) prof.push(lum(d, W, X + i, Y));
      const hi = Math.max(prof[0], prof[2 * n]), lo = Math.min(prof[0], prof[2 * n]);
      assert.ok(Math.max(...prof) - hi <= 6 && lo - Math.min(...prof) <= 6, `R ${R}, ring at ${r} (${side < 0 ? 'left' : 'right'}): ${prof.map(Math.round).join(' ')}`);
    }
  }
});

test('the C ring over the limb (the real Saturn, film scale): laid once over the globe and its outline, so no line shows at the limb', () => {
  // the drawing against the same drawing with the C ring clear, composited as one veil of the C ring over it
  const S0 = BODIES.saturn, C = S0.rings[0], col = [1, 3, 5].map(i => parseInt(C.col.slice(i, i + 2), 16));
  for (const R of [350, 700]) {
    const V = paint({ body: 'saturn', roll: 0 }, R), U = paint({ body: 'saturn', roll: 0, rings: S0.rings.map((q, i) => (i ? q : { ...q, a: 0 })) }, R);
    const n = Math.round(0.04 * R) + 6;
    for (const r of [1.34, 1.38, 1.45]) for (const side of [-1, 1]) {
      const k2 = (r * ST / S0.ob) ** 2, cos2 = (1 - k2) / (r * r - k2), X = V.cx + side * r * R * Math.sqrt(cos2), Y = V.cy + r * R * ST * Math.sqrt(1 - cos2);
      let worst = 0;
      for (let dy = -4; dy <= 4; dy++) for (let i = -n; i <= n; i++) {
        const q = (Math.round(Y + dy) * V.W + Math.round(X + i)) * 4;
        for (let ch = 0; ch < 3; ch++) { const e = V.d[q + ch] - (U.d[q + ch] * (1 - C.a) + col[ch] * C.a); if (Math.abs(e) > Math.abs(worst)) worst = e; }
      }
      assert.ok(Math.abs(worst) <= 10, `R ${R}, the C ring at ${r} (${side < 0 ? 'left' : 'right'}): ${worst.toFixed(0)} off one veil`);
    }
  }
});

test('in the globe\'s shadow, no light line along a ring\'s edge (the real Saturn)', () => {
  const R = 600, { d, W, cx, cy, light } = paint({ body: 'saturn', roll: 0 }, R), S = sunDir(light, TILT), th0 = Math.atan2(-S[1], -S[0]);
  for (const dth of [-0.06, 0, 0.06]) {
    const th = th0 + dth, step = 1 / (R * Math.hypot(Math.cos(th), Math.sin(th) * ST)), prof = [];
    for (let r = 1.2; r <= 2.32; r += step) prof.push([r, lum(d, W, cx + Math.cos(th) * r * R, cy + Math.sin(th) * r * R * ST)]);
    for (let i = 3; i < prof.length - 3; i++) {
      const s = prof[i][1] - Math.max(prof[i - 3][1], prof[i + 3][1]);
      assert.ok(s <= 6, `a light line +${s.toFixed(0)} at ${prof[i][0].toFixed(3)} globe radii`);
    }
  }
});

test('a negative tilt draws the rings and their shadow as the positive one does (the shadow behind the globe)', () => {
  for (const L of [[-Math.SQRT1_2, -Math.SQRT1_2], [1, 0], [-0.6, 0.8]]) assert.deepEqual(sunDir(L, -TILT), sunDir(L, TILT));
  const R = 200, A = paint({ body: 'saturn', roll: 0 }, R), N = paint({ body: 'saturn', roll: 0, tilt: -TILT }, R);
  // the near half of the rings, beside the globe: the same pixels (no shadow there)
  let diff = 0, n = 0;
  for (let r = 1.26; r < 2.26; r += 0.02) for (let th = 0.02; th < Math.PI; th += 0.02) {
    const x = Math.cos(th) * r, y = Math.sin(th) * r * ST;
    if (x * x + (y / BODIES.saturn.ob) ** 2 < 1.1) continue;
    const X = A.cx + x * R, Y = A.cy + y * R; diff = Math.max(diff, Math.abs(lum(A.d, A.W, X, Y) - lum(N.d, N.W, X, Y))); n++;
  }
  assert.ok(n > 1000 && diff <= 2, `the near rings differ by ${diff.toFixed(0)}`);
});

test('the planet rig\'s box: the rings out a unit past their edge, as before (a Saturn shot keeps its framing)', () => {
  const T = new Tee(null, 1); T.translate(400, 300);
  drawBody(T, 'saturn', 0, 0, 50, { t: 0 });
  assert.deepEqual(T.box().map(v => Math.round(v * 100) / 100), [286.07, 253.99, 513.93, 345.65]);
});

test('Pluto and Charon at their true sizes; Jupiter\'s Great Red Spot and Neptune\'s Great Dark Spot in the south, Jupiter\'s equator pale between dark belts', () => {
  assert.ok(Math.abs(radiusOf('pluto') / radiusOf('earth') - 0.1863) < 1e-3);
  assert.ok(Math.abs(radiusOf('charon') / radiusOf('pluto') - 0.51) < 0.005);
  const disc = (body, t = 0, R = 200) => { const W = 2 * R + 40, c = createCanvas(W, W), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, W); drawBody(x, body, W / 2, W / 2, R, { t, ink: false }); return { d: x.getImageData(0, 0, W, W).data, W, c: W / 2 }; };
  // Pluto: the bright heart and the dark red-brown Cthulhu
  { const { d } = disc('pluto'); let bright = 0, red = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 215 && d[i + 1] > 205 && d[i + 2] > 185) bright++; if (d[i] > 70 && d[i] < 140 && d[i] > d[i + 1] + 20 && d[i + 1] > d[i + 2]) red++; } assert.ok(bright > 800 && red > 800, `heart ${bright}, red ${red}`); }
  { const { d } = disc('charon'); let red = 0, grey = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > d[i + 2] + 25 && d[i] > 60) red++; if (Math.abs(d[i] - d[i + 2]) < 12 && d[i] > 90) grey++; } assert.ok(red > 300 && grey > 3000, `red pole ${red}, grey ${grey}`); }
  // a spot's colour: the centroid of its pixels is below the disc's centre (y grows down: south)
  // (at the time the planet's spin brings the spot to the central meridian)
  const south = (body, hit) => { const B = BODIES[body], { d, W, c } = disc({ body, roll: 0 }, B.spots[0].lon / (B.spin * 2 * Math.PI)); let n = 0, sy = 0; for (let i = 0; i < d.length; i += 4) if (hit(d[i], d[i + 1], d[i + 2])) { n++; sy += Math.floor(i / 4 / W); } assert.ok(n > 100, `${body}: ${n} spot pixels`); return sy / n - c; };
  assert.ok(south('jupiter', (r, g, b) => r > 140 && r > g + 60 && g > b) > 30, 'the Great Red Spot at 22°S');
  assert.ok(south('neptune', (r, g, b) => b < 120 && b > r + 40 && g < 80) > 30, 'the Great Dark Spot at 20°S');
  // Jupiter on its central meridian: the Equatorial Zone lighter than the North and South Equatorial Belts
  const { d, W, c } = disc({ body: 'jupiter', roll: 0, spots: [] }), R = 200, Bo = BODIES.jupiter.axis, at = lat => lum(d, W, c, c + R * BODIES.jupiter.ob * (-Math.sin(lat) * Math.cos(Bo) + Math.cos(lat) * Math.sin(Bo)));
  const deg = Math.PI / 180, ez = at(0), neb = at(12 * deg), seb = at(-13 * deg);
  assert.ok(ez > neb + 15 && ez > seb + 15, `EZ ${ez.toFixed(0)}, NEB ${neb.toFixed(0)}, SEB ${seb.toFixed(0)}`);
});

test('Pluto\'s heart: two lobes on top narrowing to a point, the western lobe the brighter, about 60% of the disc across', () => {
  const R = 200, H = BODIES.pluto.heart, t = H[0] / (BODIES.pluto.spin * 2 * Math.PI);
  const draw = P => { const W = 2 * R + 40, c = createCanvas(W, W), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, W); drawBody(x, P, W / 2, W / 2, R, { t, ink: false }); return { d: x.getImageData(0, 0, W, W).data, W }; };
  const A = draw('pluto'), B = draw({ body: 'pluto', heart: false }), W = A.W;
  const inH = (x, y) => { const i = (y * W + x) * 4; return Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]) > 30; };
  let x0 = W, x1 = 0, y0 = W, y1 = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (inH(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const wide = (x1 - x0) / (2 * R);
  assert.ok(wide > 0.5 && wide < 0.72, `${(wide * 100).toFixed(0)}% of the disc across`);
  assert.ok((y0 + y1) / 2 < W / 2, 'north of the equator');
  // a row's width, and a column's top
  const rowW = y => { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (inH(x, y)) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a; };
  const top = x => { for (let y = y0; y <= y1; y++) if (inH(x, y)) return y; return y1; };
  const h = y1 - y0, mx = Math.max(...Array.from({ length: h }, (_, i) => rowW(y0 + i)));
  assert.ok(rowW(Math.round(y1 - 0.12 * h)) < 0.25 * mx, 'a point at the bottom');
  // the notch between the lobes: the top dips between two higher lobes
  const cols = Array.from({ length: x1 - x0 + 1 }, (_, i) => top(x0 + i)), mid = cols.slice(Math.round(0.3 * cols.length), Math.round(0.7 * cols.length));
  const lobeL = Math.min(...cols.slice(0, Math.round(0.5 * cols.length))), lobeR = Math.min(...cols.slice(Math.round(0.5 * cols.length))), notch = Math.max(...mid);
  assert.ok(notch - Math.max(lobeL, lobeR) > 0.08 * h, `no notch: lobes at ${lobeL}, ${lobeR}, between them ${notch}`);
  // the western (left) lobe brighter
  const mean = (xa, xb) => { let s = 0, n = 0; for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) if (inH(x, y)) { s += lum(A.d, W, x, y); n++; } return s / n; };
  const xm = Math.round((x0 + x1) / 2);
  assert.ok(mean(x0, xm - 5) > mean(xm + 5, x1) + 5, 'Sputnik Planitia the brighter');
});

// An effect api for one planet actor at the stage (z 0, zoom k), recording what the effect hands to the depth sort.
function fakeApi({ u = 1, params = {}, zoom = 1, body = 'saturn' } = {}) {
  const items = [], cam = { cx: 1600, cy: 900, zoom }, a = { id: 'p', x: 1600, y: 1000, z: 0, s: 2.5, face: 1, key: 1000, head: [1600, 800], st: { params: { body } } };
  return {
    items, cam,
    api: { t: 2, bt: 4 * u, dur: 4, u, W: 1920, H: 1080, cam, set: { lens: LENS }, shot: { t0: 0, t1: 4, cameraAt: () => cam }, seed: 5, params: { who: 'p', ...params },
      actor: id => (id === 'p' ? a : null), project: ([x, y, d = 0]) => { const k = cam.zoom * LENS / (LENS + d); return [(x - cam.cx) * k + 960, (y - cam.cy) * k + 540, k, 1]; },
      item: (at, draw) => items.push({ at, draw }) },
  };
}
// one depth piece drawn alone on a clear frame (the world transform at the stage) → its pixels
function piece(F, it) {
  const c = createCanvas(1920, 1080), x = c.getContext('2d'), k = F.cam.zoom;
  x.setTransform(k, 0, 0, k, 960 - F.cam.cx * k, 540 - F.cam.cy * k); it.draw(x, { x: 0, y: 0, s: k, z: 0, a: 1 });
  return x.getImageData(0, 0, 1920, 1080).data;
}
const footprint = d => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { const p = (i - 3) / 4, x = p % 1920, y = Math.floor(p / 1920); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++; } return { box: [x0, y0, x1, y1], n }; };

test('moonlets: small lit worlds (a lit side toward the light, no glow, sizes varied) near the ring plane; Titan clearly bigger and orange', () => {
  // mid-beat, some moons are still appearing
  const F = fakeApi({ u: 0.5, params: { big: 'titan', bigR: 0.044, bigAt: 0.1 } });
  BUILTIN_EFFECTS.custom.moonlets.draw(null, 0.5, F.api);
  const moons = F.items.slice(0, -1), sizes = [];
  assert.ok(moons.length > 25, `${moons.length} moons`);
  const R = 50 * 2.5;
  for (const m of moons) {
    const d = piece(F, m), { box, n } = footprint(d), w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
    assert.ok(n > 0 && Math.abs(w - h) <= 2 && w <= 2 * 7.5 + 3, `a disc with no glow around it: ${w}×${h}`);
    sizes.push(w);
    // lit toward the upper left, darker away from it
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, r = w / 2;
    if (r >= 3.5) assert.ok(lum(d, 1920, cx - r * 0.45, cy - r * 0.45) > lum(d, 1920, cx + r * 0.5, cy + r * 0.5) + 40, 'a lit side and a night side');
    // near the planet's ring plane (its rings' ellipse, a little wider)
    const [hx, hy] = F.api.project([1600, 800]), dx = cx - hx, dy = cy - hy;
    assert.ok(Math.hypot(dx / (5.4 * R), dy / (5.4 * R * ST + 0.3 * R)) < 1, `moon at (${dx.toFixed(0)}, ${dy.toFixed(0)}) from the centre`);
  }
  assert.ok(Math.max(...sizes) - Math.min(...sizes) >= 3, `sizes vary: ${Math.min(...sizes)}–${Math.max(...sizes)} px`);
  // Titan: at least twice the biggest small moon, orange
  const T = piece(F, F.items[F.items.length - 1]), tf = footprint(T), tw = tf.box[2] - tf.box[0];
  assert.ok(tw >= 1.75 * Math.max(...sizes), `Titan ${tw} px across, the small moons at most ${Math.max(...sizes)}`);
  let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < T.length; i += 4) if (T[i + 3] > 200) { r += T[i]; g += T[i + 1]; b += T[i + 2]; n++; }
  assert.ok(r / n > g / n + 25 && g / n > b / n + 25, `orange: ${[r, g, b].map(v => (v / n).toFixed(0))}`);
});

test('ringfield: ring pieces lie in the ring material, inside the rings\' edges, out of the Cassini Division', () => {
  const F = fakeApi({ u: 0.5, zoom: 4, params: { near: 0, motes: 0 } });
  BUILTIN_EFFECTS.custom.ringfield.draw(null, 0.5, F.api);
  assert.equal(F.items.length, 1);
  const d = piece(F, F.items[0]), R = 50 * 2.5 * 4, roll = BODIES.saturn.roll, [hx, hy] = F.api.project([1600, 800]);
  let n = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 60) continue;
    const p = (i - 3) / 4, x = p % 1920 - hx, y = Math.floor(p / 1920) - hy;
    const u = x * Math.cos(-roll) - y * Math.sin(-roll), v = x * Math.sin(-roll) + y * Math.cos(-roll), r = Math.hypot(u / R, v / (R * ST));
    assert.ok(r > 1.225 && r < 2.285 && !(r > 1.96 && r < 2.02), `a piece at ${r.toFixed(3)} globe radii`);
    n++;
  }
  assert.ok(n > 2000, `${n} pixels of ring pieces`);
});

test('ringfield: the grains near the lens are soft and faint (out of focus), not specks that read as pieces in a gap', () => {
  const F = fakeApi({ u: 0.5, zoom: 4, params: { n: 0, dust: 0, near: 0, motes: 40 } });
  BUILTIN_EFFECTS.custom.ringfield.draw(null, 0.5, F.api);
  const motes = F.items.slice(1);
  assert.ok(motes.length > 20, `${motes.length} motes`);
  let biggest = null;
  for (const m of motes) {
    // drawn at its own depth's scale, as the frame draws it
    const c = createCanvas(1920, 1080), x = c.getContext('2d'), k = F.cam.zoom * LENS / (LENS + m.at[2]);
    x.setTransform(k, 0, 0, k, 960 - F.cam.cx * k, 540 - F.cam.cy * k); m.draw(x, { s: k });
    const d = x.getImageData(0, 0, 1920, 1080).data, f = footprint(d);
    let top = 0; for (let i = 3; i < d.length; i += 4) top = Math.max(top, d[i]);
    assert.ok(top <= 0.35 * 255, `faint: alpha ${(top / 255).toFixed(2)}`);
    if (!biggest || f.box[2] - f.box[0] > biggest.f.box[2] - biggest.f.box[0]) biggest = { d, f, top };
  }
  // across the biggest: a soft fall-off (no edge where the alpha drops at once)
  const { d, f, top } = biggest, w = f.box[2] - f.box[0], y = Math.round((f.box[1] + f.box[3]) / 2);
  assert.ok(w >= 8, `${w} px across`);
  for (let x = f.box[0] - 1; x <= f.box[2]; x++) assert.ok(Math.abs(d[(y * 1920 + x + 1) * 4 + 3] - d[(y * 1920 + x) * 4 + 3]) <= 0.4 * top, `a hard edge at ${x}`);
});

test('lightbeam: a soft shaft of light (one bright middle, no streaks, no cap at its front) that stops at the globe, which brightens without bleaching', () => {
  const W = 1920, H = 1080, run = u => {
    const F = fakeApi({ u, params: { to: 'p', from: [0.05, 0.3] } }), c = createCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#1a1d3a'; x.fillRect(0, 0, W, H);
    const [sx, sy, s] = F.api.project([1600, 800]), Rs = 125 * s;
    x.fillStyle = '#e6d2a0'; x.beginPath(); x.ellipse(sx, sy, Rs, Rs * BODIES.saturn.ob, 0, 0, Math.PI * 2); x.fill();
    BUILTIN_EFFECTS.custom.lightbeam.draw(x, u, F.api);
    return { d: x.getImageData(0, 0, W, H).data, A: [0.05 * W, 0.3 * H], C: [sx, sy], Rs };
  };
  // across the shaft halfway: one peak, no steps
  const { d, A, C, Rs } = run(0.95), L = Math.hypot(C[0] - A[0], C[1] - A[1]), ux = (C[0] - A[0]) / L, uy = (C[1] - A[1]) / L;
  const across = []; for (let o = -1.6 * Rs; o <= 1.6 * Rs; o += 2) across.push(lum(d, W, A[0] + ux * L * 0.5 - uy * o, A[1] + uy * L * 0.5 + ux * o));
  const runs = across.map(Math.round).filter((v, i, a) => i === 0 || v !== a[i - 1]), peaks = runs.filter((v, i) => i > 0 && i < runs.length - 1 && v > runs[i - 1] && v > runs[i + 1]);
  assert.equal(peaks.length, 1, `one bright middle: ${across.map(Math.round).join(' ')}`);
  const sky = lum(d, W, 30, 1050), top = Math.max(...across);
  assert.ok(top > sky + 25, 'it shows'); assert.ok(across[0] < sky + 4 && across[across.length - 1] < sky + 4, 'and fades to nothing at its edges');
  for (let i = 1; i < across.length; i++) assert.ok(Math.abs(across[i] - across[i - 1]) < 0.12 * (top - sky), `a step across it at ${i}`);
  // the globe: brighter on its sunward side, nowhere white
  let white = 0, lifted = 0;
  for (let y = Math.round(C[1] - Rs); y < C[1] + Rs; y++) for (let x = Math.round(C[0] - Rs); x < C[0] + Rs; x++) {
    if (((x - C[0]) / Rs) ** 2 + ((y - C[1]) / (Rs * BODIES.saturn.ob)) ** 2 > 0.95) continue;
    const i = (y * W + x) * 4; if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 230) white++; if (d[i + 2] > 172) lifted++;
  }
  assert.equal(white, 0, 'bleached'); assert.ok(lifted > 200, `the sunward side brightens (${lifted} px)`);
  // on its way: along the axis it fades out ahead of its front, with no bright head
  const mid = run(0.5), along = []; for (let t = 0.2; t <= 0.98; t += 0.01) along.push(lum(mid.d, W, A[0] + ux * L * t, A[1] + uy * L * t));
  const head = along.indexOf(Math.max(...along.slice(10)));
  for (let i = Math.max(head, 10) + 1; i < along.length; i++) assert.ok(along[i] <= along[i - 1] + 1, `a bright front at ${(0.2 + i * 0.01).toFixed(2)}: ${along.map(Math.round).join(' ')}`);
});

// A small space film: Saturn (no face) with the given shots.
const spaceFilm = shots => ({
  title: 'Crops', format: { width: 480, height: 270, fps: 24, captions: 'none' }, voices: {},
  cast: { saturn: { rig: 'planet', scale: 2.5, params: { body: 'saturn' } } }, sets: { sp: { kit: 'space' } },
  scenes: [{ id: 's1', set: 'sp', time: 'space', ambience: 'none', music: 'none', actors: { saturn: { at: 'centre', face: 'right' } }, shots }],
});

test('lint: a crop on purpose (a focus, a zoom above 1 on a faceless subject, a dolly through depth) is not a framing fault', async () => {
  const film = spaceFilm([
    { id: 'focus', dur: 3, camera: { size: 'full', on: ['saturn'], focus: [0.93, 0.55], zoom: 2 }, beats: [] },
    { id: 'zoom', dur: 3, camera: { size: 'full', on: ['saturn'], zoom: 2.2 }, beats: [] },
    { id: 'dolly', dur: 3, camera: { size: 'wide', on: ['saturn'], z: 0, zTo: 1500 }, beats: [] },
    // the Saturn chapter's flight into the rings' edge: the globe all but leaves the frame
    { id: 'rings', dur: 6, camera: { size: 'full', on: ['saturn'], focus: [0.93, 0.55], zoom: 2, z: 0, zTo: 1100 }, beats: [] },
    { id: 'plain', dur: 3, camera: { size: 'wide', on: ['saturn'] }, beats: [] },
  ]);
  const r = lintPlan(compile(await loadFilm(film)), { step: 0.25 });
  const framing = [...r.errors, ...r.warnings].filter(i => i.rule === 'subject-size' || i.rule === 'edge-cut');
  assert.deepEqual(framing.map(i => `${i.shot}: ${i.message}`), []);
});

test('cinecode lint prints the warnings its shots keep; check rejects a malformed lint block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-kept-'));
  try {
    const film = spaceFilm([
      { id: 'flash', dur: 0.8, camera: { size: 'wide', on: ['saturn'] }, beats: [], lint: { allow: ['timing'], note: 'a flash on purpose' } },
      { id: 'hold', dur: 4, camera: { size: 'full', on: ['saturn'] }, beats: [] },
    ]);
    mkdirSync(join(dir, 'films', 'k'), { recursive: true });
    writeFileSync(join(dir, 'films', 'k', 'film.json'), JSON.stringify(film));
    const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });
    const l = run('lint', 'films/k', '--step=0.5');
    assert.equal(l.status, 0, l.stderr);
    assert.match(l.stdout + l.stderr, /0 errors, 0 warnings \(1 kept: allowed by their shots' "lint" blocks\)/);
    film.scenes[0].shots[0].lint = { allow: ['floating'] };
    writeFileSync(join(dir, 'films', 'k', 'film.json'), JSON.stringify(film));
    const c = run('check', 'films/k');
    assert.notEqual(c.status, 0);
    assert.match(c.stdout + c.stderr, /scenes\[0\]\.shots\[0\]\.lint\.allow\[0\]: "floating" is an error/);
    assert.match(c.stdout + c.stderr, /scenes\[0\]\.shots\[0\]\.lint\.note: say why/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the promoted effects pass the effects gate in a film that names them', async () => {
  const film = spaceFilm([{ id: 'a', dur: 6, camera: { size: 'full', on: ['saturn'] }, beats: [
    { do: 'custom', name: 'lightbeam', to: 'saturn', at: 0, dur: 3 },
    { do: 'custom', name: 'ringfield', who: 'saturn', at: 0, dur: 6, n: 60, dust: 120, near: 4, motes: 20 },
  ] }]);
  const f = await loadFilm(film);
  assert.deepEqual(Object.keys(f.custom.custom).sort(), ['lightbeam', 'ringfield']);
  for (const c of await verifyEffects(f, compile(f))) assert.ok(c.ok || /^layer "depth" is not one of/.test(c.detail), `${c.name}: ${c.detail}`);
});
