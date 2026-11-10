// Kit times: a kit not under Earth's sky declares its own times of day (makeSet `times`), each with its grade, its sun
// (or none: no cast shadows) and its haze. A time's light is looked up by name, so a name with no light is a check
// error, never a silent morning. verify-kit checks the times a kit declares (Earth kits keep the eight).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { makeSet, SKY_TIMES } from '../engine/set/set.mjs';
import { registerKit } from '../engine/set/kits/index.mjs';
import { renderSet, setSheet, previewGrade } from '../engine/set/sheet.mjs';
import { GR, SUN, grade, mixGrade, sunOf, hasLight } from '../engine/film/grade.mjs';
import { drawFrame, frameInfo, sunFor } from '../engine/film/frame.mjs';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { verifyKit, kitReview } from '../engine/render/verify.mjs';

const FLAT = [40, 60, 120];
const flatSky = (x, r, w, h) => { x.fillStyle = `rgb(${FLAT})`; x.fillRect(0, 0, w, h); };
// A space-like kit: a flat sky painter for each of its own times, no ground, four ground anchors on an invisible plane.
function spaceKit(id, times, extra = {}) {
  const own = Object.keys(times || {}).filter(n => !SKY_TIMES.includes(n));
  return () => makeSet({
    id, W: 3200, H: 1800, refX: 1600, refY: 900,
    area: { x0: -1600, x1: 4800, y0: -900, y1: 2700 }, view: { x0: -200, x1: 3400, y0: 0, y1: 1800 },
    horizon: -3000, laneY: 1000, baseS: 1,
    skies: Object.fromEntries(own.map(n => [n, flatSky])), times, layers: [], props: [],
    anchors: { west: { x: 1300, y: 1000 }, east: { x: 1900, y: 1000 }, far: { x: 1600, y: 700 }, near: { x: 1600, y: 1300 } },
    walk: { region: [[-1500, -400], [4700, -400], [4700, 2600], [-1500, 2600]] },
    ambience: { day: 'wind-hill', night: 'wind-hill' },
    ...extra,
  });
}
const film = (kit, { time, actors = {}, on = ['west'], size = 'wide' } = {}) => ({
  title: 'Times', format: { width: 480, height: 270, fps: 24, captions: 'none' }, voices: {},
  cast: { hare: { rig: 'hare' } }, sets: { sp: { kit } },
  scenes: [{ id: 's1', set: 'sp', ...(time ? { time } : {}), ambience: 'none', actors, shots: [{ id: 'a', camera: { size, on }, dur: 4 }] }],
});
const problemsOf = async f => { try { await loadFilm(f); return []; } catch (e) { if (!(e instanceof ValidationError)) throw e; return e.problems.map(p => p.message); } };
const pixels = (plan, t) => { const c = createCanvas(plan.W, plan.H), x = c.getContext('2d'); drawFrame(x, plan, t); return x.getImageData(0, 0, plan.W, plan.H).data; };

test('a kit declares its own times: they are all the times it has, the first is its default', () => {
  const S = spaceKit('t-own', { space: { sun: null } })();
  assert.deepEqual(S.skyNames, ['space']);
  assert.equal(S.defaultSky, 'space');
  // Earth kits keep the eight
  assert.deepEqual(spaceKit('t-earth', undefined, { skies: undefined })().skyNames, SKY_TIMES);
  // one of Earth's eight may be listed (empty: it keeps the engine's light) next to a time of the kit's own
  const T = spaceKit('t-mixed', { 'moon-day': { grade: 'noon', sun: null }, night: {} })();
  assert.deepEqual(T.skyNames, ['moon-day', 'night']);
});

test('a declared time\'s grade: neutral by default, an Earth time\'s by name, or its own', () => {
  spaceKit('t-grades', {
    'g-neutral': {}, 'g-night': { grade: 'night' },
    'g-own': { grade: { sl: [200, 220, 255, 0.3], mul: [220, 230, 255], vig: 0.4, con: 1.2 } }, 'g-part': { grade: { vig: 0.5 } },
  })();
  const neutral = { sl: [255, 255, 255, 0], mul: [255, 255, 255], vig: 0.3, con: 1 };
  assert.deepEqual(mixGrade([['g-neutral', 1]]), neutral, 'the picture as painted, under the house vignette');
  assert.deepEqual(mixGrade([['g-night', 1]]), mixGrade([['night', 1]]));
  assert.deepEqual(mixGrade([['g-own', 1]]), { sl: [200, 220, 255, 0.3], mul: [220, 230, 255], vig: 0.4, con: 1.2 });
  assert.deepEqual(mixGrade([['g-part', 1]]), { ...neutral, vig: 0.5 }, 'what a grade leaves out is neutral');
  // it crossfades with Earth's like any time
  const half = mixGrade([['g-neutral', 0.5], ['night', 0.5]]);
  assert.ok(Math.abs(half.mul[0] - (255 + GR.night.mul[0]) / 2) < 1e-9 && Math.abs(half.con - (1 + GR.night.con) / 2) < 1e-9);
});

test('a declared time\'s sun: none by default (no cast shadows), an Earth time\'s by name, or its own', () => {
  const S = spaceKit('t-suns', { 's-none': {}, 's-null': { sun: null }, 's-golden': { sun: 'golden' }, 's-own': { sun: { len: 1, a: 0.25 } } })();
  for (const n of ['s-none', 's-null']) { assert.equal(sunOf([[n, 1]]).a, 0, n); assert.equal(sunFor(S, n), null, `${n}: no sun, so no shadow direction`); }
  assert.deepEqual(sunOf([['s-golden', 1]]), SUN.golden);
  assert.deepEqual(sunOf([['s-own', 1]]), { len: 1, a: 0.25 });
  assert.ok(sunFor(S, 's-own').dx > 0, 'its shadows fall away from the set\'s light');
  assert.ok(Math.abs(sunOf([['s-none', 0.5], ['noon', 0.5]]).a - SUN.noon.a / 2) < 1e-9, 'a crossfade into a sunless time fades the shadows');
});

test('a time with no light is an error, never a silent morning', async () => {
  assert.throws(() => mixGrade([['nowhere', 1]]), /unknown time "nowhere"/);
  assert.throws(() => sunOf([['nowhere', 1]]), /unknown time "nowhere"/);
  // a kit that paints a sky under its own name but declares no light for it (the old way): check fails on its use
  registerKit('t-unlit', spaceKit('t-unlit', undefined, { skies: { 'unlit-space': flatSky }, defaultSky: 'unlit-space' }));
  const used = await problemsOf(film('t-unlit', { time: 'unlit-space' }));
  assert.equal(used.length, 1, used.join('\n'));
  assert.match(used[0], /scenes\[0\]\.time: .*"unlit-space".*no light.*times/);
  const dflt = await problemsOf(film('t-unlit'));
  assert.equal(dflt.length, 1, dflt.join('\n'));
  assert.match(dflt[0], /scenes\[0\]\.time: .*default time "unlit-space".*no light/);
  // a time the kit doesn't declare is unknown
  registerKit('t-space', spaceKit('t-space', { space: { sun: null } }));
  const other = await problemsOf(film('t-space', { time: 'morning' }));
  assert.match(other.join('\n'), /unknown time "morning" \(one of space\)/);
  assert.deepEqual(await problemsOf(film('t-space', { time: 'space' })), []);
  assert.deepEqual(await problemsOf(film('t-space')), [], 'the kit\'s default time');
});

test('makeSet refuses a declaration it cannot honour', () => {
  const bad = (id, times, extra, re) => assert.throws(() => spaceKit(id, times, extra)(), re, id);
  bad('b-earth', { noon: { grade: 'night' } }, {}, /times\.noon: .*Earth's .*engine's/);
  bad('b-nosky', { 'b-sky': {} }, { skies: {} }, /times\.b-sky: no sky painter .*skies\.b-sky/);
  bad('b-grade', { 'b-grade': { grade: { mul: [1, 2] } } }, {}, /times\.b-grade: grade/);
  bad('b-gname', { 'b-gname': { grade: 'dusky' } }, {}, /times\.b-gname: grade/);
  bad('b-sun', { 'b-sun': { sun: { len: -1, a: 0.2 } } }, {}, /times\.b-sun: sun/);
  bad('b-haze', { 'b-haze': { haze: '1,2,3' } }, {}, /times\.b-haze: haze/);
  bad('b-field', { 'b-field': { light: 1 } }, {}, /times\.b-field: unknown field "light"/);
  bad('b-empty', {}, {}, /times: declare at least one/);
  bad('b-default', { 'b-default': {} }, { defaultSky: 'morning' }, /defaultSky "morning" is not one of its times/);
  // a name is film-wide: another kit may declare it again only with the same light
  spaceKit('c-one', { shared: { sun: null } })();
  spaceKit('c-same', { shared: { sun: null } })();
  bad('c-two', { shared: { sun: 'noon' } }, {}, /times\.shared: .*another light .*c-one/);
});

test('two declarations of a name agree when their light does, however it is written; a set that fails claims nothing', () => {
  spaceKit('l-one', { lit: { grade: 'neutral', sun: null } })();
  // the same light: its defaults left out, its fields in another order, "no sun" as false, a grade spelled out
  for (const [id, sp] of [['l-defaults', {}], ['l-order', { sun: null, grade: 'neutral' }], ['l-false', { grade: 'neutral', sun: false }], ['l-spelled', { grade: { vig: 0.3, con: 1 } }]])
    assert.doesNotThrow(() => spaceKit(id, { lit: sp })(), id);
  spaceKit('l-night', { 'lit-night': { grade: 'night', sun: 'twilight' } })();
  assert.doesNotThrow(() => spaceKit('l-night2', { 'lit-night': { grade: { ...GR.night }, sun: { ...SUN.twilight } } })(), 'an Earth time\'s light written out');
  assert.throws(() => spaceKit('l-other', { lit: { grade: 'night' } })(), /times\.lit: .*another light .*l-one/);
  // a set that fails to build declares none of its times
  assert.throws(() => spaceKit('l-broken', { 'lit-a': { sun: null } }, { defaultSky: 'morning' })(), /defaultSky/);
  assert.equal(hasLight('lit-a'), false, 'a failed build left its time behind');
  assert.doesNotThrow(() => spaceKit('l-fixed', { 'lit-a': { sun: 'noon' } })(), 'the corrected build is refused');
  assert.throws(() => spaceKit('l-clash', { 'lit-b': {}, lit: { sun: 'noon' } })(), /times\.lit: .*another light/);
  assert.equal(hasLight('lit-b'), false, 'a build refused on one time left another behind');
});

test('verify-kit checks the times a kit declares; Earth kits keep the eight; a sky with no light fails', () => {
  const r = verifyKit(spaceKit('v-space', { 'v-space': { sun: null } }), 'v-space');
  assert.deepEqual(r.filter(c => !c.ok), [], 'one time of its own is enough');
  const earth = Object.fromEntries(verifyKit(spaceKit('v-earth', undefined, { skies: { dawn: flatSky } }), 'v-earth').map(c => [c.name, c]));
  assert.equal(earth.world.ok, false); assert.match(earth.world.detail, /no morning sky/);
  const unlit = Object.fromEntries(verifyKit(spaceKit('v-unlit', undefined, { skies: Object.fromEntries([...SKY_TIMES, 'v-dark'].map(n => [n, flatSky])) }), 'v-unlit').map(c => [c.name, c]));
  assert.equal(unlit.world.ok, false); assert.match(unlit.world.detail, /v-dark sky has no light/);
});

test('verify-kit\'s review strip shows the kit\'s own times, graded as the film grades them', async () => {
  registerKit('r-space', spaceKit('r-space', { 'r-space': { grade: { mul: [128, 128, 128] }, sun: null } }));
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-times-'));
  try {
    const [, strip] = await kitReview('r-space', dir), img = await loadImage(strip);
    assert.equal(img.width, 480); assert.equal(img.height, 270);
    const c = createCanvas(480, 270), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(300, 200, 1, 1).data;     // under the label, away from the vignette's corners
    assert.ok(Math.abs(d[2] - FLAT[2] / 2) < 12, `the multiply tint halves the sky (blue ${d[2]})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a frame under a declared time is graded with its own grade', async () => {
  const g = { sl: [200, 220, 255, 0.3], mul: [220, 230, 255], vig: 0.4 };
  registerKit('f-grade', spaceKit('f-grade', { 'f-grade': { grade: g, sun: null } }));
  const plan = compile(await loadFilm(film('f-grade', { time: 'f-grade' })));
  const c = createCanvas(plan.W, plan.H), x = c.getContext('2d');
  x.fillStyle = `rgb(${FLAT})`; x.fillRect(0, 0, plan.W, plan.H); grade(x, { ...g, con: 1, story: null }, 2, plan.W, plan.H);
  const got = pixels(plan, 2), want = x.getImageData(0, 0, plan.W, plan.H).data;
  let n = 0; for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) n++;
  assert.equal(n, 0, `${n} channel values differ from the declared grade`);
});

test('a sunless time casts no shadows; a set with no ground (groundShadows: false) takes none at all', async () => {
  registerKit('f-dark', spaceKit('f-dark', { 'f-dark': { sun: null } }));
  registerKit('f-sun', spaceKit('f-sun', { 'f-sun': { sun: 'morning' } }));
  registerKit('f-void', spaceKit('f-void', { 'f-void': { sun: null } }, { groundShadows: false }));
  registerKit('f-void-sun', spaceKit('f-void-sun', { 'f-void-sun': { sun: 'morning' } }, { groundShadows: false }));
  // what a figure changes outside its drawing: past it, where the sun lays its shadow out along the ground (to the
  // right of it), and under its feet (its contact shadow)
  const shadows = async kit => {
    const mk = async hare => compile(await loadFilm(film(kit, { time: kit, actors: hare ? { hare: { at: 'west', face: 'right' } } : {}, on: ['west'], size: 'full' })));
    const pa = await mk(true), pb = await mk(false);
    const box = frameInfo(pa, 2).actors[0].screenBox, w = box[2] - box[0], h = box[3] - box[1], a = pixels(pa, 2), b = pixels(pb, 2);
    const n = { past: 0, under: 0 };
    for (let y = Math.round(box[3] - 0.15 * h); y < pa.H; y++) for (let x = 0; x < pa.W; x++) {
      const i = (y * pa.W + x) * 4; if (!(Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6)) continue;
      if (x >= box[2] + 2) n.past++; else if (y >= box[3] + 2 && x >= box[0] - w / 2) n.under++;
    }
    return n;
  };
  const lit = await shadows('f-sun'), dark = await shadows('f-dark'), voidDark = await shadows('f-void'), voidSun = await shadows('f-void-sun');
  assert.ok(lit.past > 200, `a declared sun casts its shadow (${lit.past} px darkened past the figure)`);
  assert.equal(dark.past, 0, 'no sun: nothing past the figure');
  assert.ok(dark.under > 20, `no sun, but ground: the figure still sits on it, as at night (${dark.under} px under its feet)`);
  assert.deepEqual(voidDark, { past: 0, under: 0 }, 'no ground: nothing under the feet either');
  assert.deepEqual(voidSun, { past: 0, under: 0 }, 'no ground: a sun lays no shadow on it');
  // a flier: no shadow on the ground under it when there is no ground
  const flier = async kit => {
    const f = film(kit, { time: kit, on: ['west', 'east'], size: 'wide' });
    f.cast = { bird: { rig: 'songbird' } };
    const sc = f.scenes[0], mk = async bird => { sc.actors = bird ? { bird: { at: 'west', face: 'right' } } : {}; sc.shots[0].beats = bird ? [{ do: 'fly', who: 'bird', to: 'east', speed: 0.5 }] : undefined; return compile(await loadFilm(f)); };
    const pa = await mk(true), pb = await mk(false);
    let n = 0;
    for (const t of [0.8, 1.2, 1.6]) {
      const A = frameInfo(pa, t).actors[0], [x0, y0, x1, y1] = A.screenBox, a = pixels(pa, t), b = pixels(pb, t);
      assert.equal(pa.actorsAt(t, 's1')[0].mode, 'air', `in flight at ${t}`);
      for (let y = 0; y < pa.H; y++) for (let x = 0; x < pa.W; x++) {
        if (x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) continue;
        const i = (y * pa.W + x) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++;
      }
    }
    return n;
  };
  assert.ok(await flier('f-dark') > 10, 'over ground a flier\'s shadow follows it');
  assert.equal(await flier('f-void'), 0, 'no ground: no flier\'s shadow');
});

test('a declared time\'s haze: far layers are drawn as painted unless it gives one', () => {
  const far = { k: 0.5, paint: (x, r, S, E) => { x.fillStyle = 'rgb(100,140,90)'; x.fillRect(E.x0, E.y0, E.x1 - E.x0, E.y1 - E.y0); } };
  const at = (id, time) => { const S = spaceKit(id, { [id]: time }, { layers: [far] })(); const d = renderSet(S, { W: 160, H: 90, sky: id, grade: false }).canvas.getContext('2d').getImageData(80, 45, 1, 1).data; return [...d.slice(0, 3)]; };
  assert.deepEqual(at('h-none', {}), [100, 140, 90]);
  const red = at('h-red', { haze: [255, 0, 0] });
  assert.ok(red[0] > 130 && red[1] < 120, `hazed toward its own colour (${red})`);
});

test('set sheets light a kit\'s own time with its own grade, and show its default for a time it doesn\'t have', async () => {
  const far = { k: 0.5, paint: (x, r, S, E) => { x.fillStyle = 'rgb(100,140,90)'; x.fillRect(E.x0, E.y0, E.x1 - E.x0, E.y1 - E.y0); } };
  registerKit('sh-space', spaceKit('sh-space', { 'sh-space': { grade: { mul: [128, 128, 128] }, sun: null } }, { layers: [far] }));
  const S = spaceKit('sh-space', { 'sh-space': { grade: { mul: [128, 128, 128] }, sun: null } }, { layers: [far] })();
  const px = o => renderSet(S, { W: 160, H: 90, ...o }).canvas.getContext('2d').getImageData(0, 0, 160, 90).data;
  // its own time, under its declared grade (the film's)
  const raw = renderSet(S, { W: 160, H: 90, sky: 'sh-space', grade: false }).canvas, x = raw.getContext('2d');
  grade(x, mixGrade([['sh-space', 1]]), 0, 160, 90);
  const own = px({ sky: 'sh-space' }), differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  assert.equal(differ(own, x.getImageData(0, 0, 160, 90).data), 0, 'graded as the film grades it');
  // a time it doesn't have, or none given: its default (its sky, its haze: none, its grade), never morning's
  assert.equal(differ(px({ sky: 'morning' }), own), 0, 'morning');
  assert.equal(differ(px({}), own), 0, 'no time given');
  assert.equal(renderSet(S, { W: 160, H: 90, sky: 'morning' }).sky, 'sh-space');
  // the set sheet (cinecode set-sheet, verify-kit) shows it under its default
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-times-'));
  try {
    const img = await loadImage(setSheet(['sh-space'], join(dir, 'sheet.png'), { debug: false, cols: 1, cellW: 160 }));
    const c = createCanvas(160, 90), y = c.getContext('2d'); y.drawImage(img, 0, 0);
    const d = y.getImageData(80, 60, 1, 1).data;     // the far layer (100, 140, 90), under the label: halved by the kit's grade
    assert.ok(Math.abs(d[1] - 70) < 12 && Math.abs(d[0] - 50) < 12, `the set sheet shows the kit's own time in its own light (${[...d.slice(0, 3)]})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // a name with no light is an error on a sheet too
  assert.throws(() => previewGrade(createCanvas(16, 9).getContext('2d'), 'nowhere'), /unknown time "nowhere"/);
});
