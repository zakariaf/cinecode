// Films outside this repository: custom.mjs reaches the engine as `cinecode/…` from anywhere, and the CLI runs from
// any directory on a film anywhere. Project-local extensions (a film's rigs/ kits/ effects/, a project's cinecode/)
// load like built-ins. The gates (verify-rig, verify-kit, verify-effect) pass the house pieces and catch broken ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BIN = join(ROOT, 'bin', 'cinecode.mjs');
const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });

// A project directory outside the repo with copies of the given films (without their out/ folders).
function project(...films) {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-project-'));
  for (const f of films) cpSync(join(ROOT, 'films', f), join(dir, 'films', f), { recursive: true, filter: src => !/[\\/]out$/.test(src) });
  return dir;
}

test('films import the engine as cinecode/…, never by a relative path into engine/', () => {
  const bad = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== 'out' && e.name !== 'voices') walk(p); } else if (p.endsWith('.mjs') && /from ['"](\.\.\/)+engine\//.test(readFileSync(p, 'utf8'))) bad.push(p.slice(ROOT.length)); } };
  walk(join(ROOT, 'films')); walk(join(ROOT, 'templates'));
  assert.deepEqual(bad, []);
});

test('package.json exports the engine helpers under the name cinecode', async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'cinecode');
  const lib = await import('cinecode/lib'), rig = await import('cinecode/rig'), own = await import('../engine/cast/rig.mjs');
  assert.equal(typeof lib.rng, 'function');
  assert.equal(rig.makeRig, own.makeRig, 'one module instance: the same registry as the engine');
  assert.equal((await import('cinecode/paint/nature')).foliage, (await import('../engine/paint/nature.mjs')).foliage);
  assert.equal((await import('cinecode/engine/film/grade.mjs')).mixGrade, (await import('../engine/film/grade.mjs')).mixGrade);
});

test('the CLI checks and plans films that live in another project, run from that project', () => {
  const dir = project('glim', 'kite', 'storm-shelter');
  try {
    for (const f of ['glim', 'kite', 'storm-shelter']) {
      const r = cli(dir, 'check', `films/${f}`);
      assert.equal(r.status, 0, `${f}: ${r.stderr}`);
      assert.match(r.stdout, /valid/);
    }
    const p = cli(dir, 'plan', 'films/glim');
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /shot/);
    const s = cli(dir, 'sheet', 'films/kite', '--t=3', '--tile=160');
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /sheet/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ───────────── project-local extensions ─────────────

const SKILLS = join(ROOT, '.claude', 'skills');
const DEMO = {
  title: 'Demo', logline: 'A chick finds a strawberry in a glade.',
  format: { width: 1920, height: 1080, fps: 24, captions: 'dialogue' },
  cast: { chick: { rig: 'chick', name: 'Chick' }, berry: { rig: 'strawberry', name: 'Berry' } },
  sets: { glade: { kit: 'glade' } },
  scenes: [{
    id: 's01', set: 'glade', time: 'golden', overlays: [{ name: 'glow', params: { who: 'chick' } }],
    actors: { chick: { at: 'glade_left', face: 'right' }, berry: { at: 'glade_centre' } },
    shots: [
      { id: '1.1', camera: { size: 'wide', on: ['chick'] }, beats: [{ do: 'walk', who: 'chick', to: 'near:berry' }, { do: 'custom', name: 'puff', who: 'chick', dur: 0.8 }] },
      { id: '1.2', camera: { size: 'full', on: ['chick', 'berry'] }, beats: [{ do: 'gesture', who: 'chick', name: 'flap' }, { sfx: 'twinkle' }] },
    ],
  }],
};
// A project with shared extensions in cinecode/ (the build skills' starters) and a film with its own rig folder.
function extProject() {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-ext-'));
  for (const [k, f] of [['rigs', 'chick'], ['kits', 'glade'], ['effects', 'sparkle']]) {
    mkdirSync(join(dir, 'cinecode', k), { recursive: true });
    cpSync(join(SKILLS, `build-${k === 'rigs' ? 'rig' : k === 'kits' ? 'kit' : 'effect'}`, 'starter.mjs'), join(dir, 'cinecode', k, `${f}.mjs`));
  }
  mkdirSync(join(dir, 'films', 'demo', 'rigs'), { recursive: true });
  writeFileSync(join(dir, 'films', 'demo', 'film.json'), JSON.stringify(DEMO, null, 2));
  cpSync(join(ROOT, 'films', 'strawberry-race', 'rigs', 'strawberry.mjs'), join(dir, 'films', 'demo', 'rigs', 'strawberry.mjs'));
  return dir;
}

test('a project\'s cinecode/ folder and a film\'s rigs/ folder load like built-ins: check, sheets, lint, the gates', () => {
  const dir = extProject();
  try {
    const c = cli(dir, 'check', 'films/demo');
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /valid/);
    for (const f of ['cinecode/rigs/chick.mjs', 'cinecode/kits/glade.mjs', 'cinecode/effects/sparkle.mjs', 'rigs/strawberry.mjs']) assert.ok(c.stdout.includes(f), `check lists ${f}: ${c.stdout}`);
    const cs = cli(dir, 'cast-sheet', 'chick', '-o', 'out/cast.jpg');                        // no film: the project's rigs
    assert.equal(cs.status, 0, cs.stderr);
    assert.ok(existsSync(join(dir, 'out', 'cast.jpg')));
    const ss = cli(dir, 'set-sheet', 'films/demo', 'glade');
    assert.equal(ss.status, 0, ss.stderr);
    assert.ok(existsSync(join(dir, 'films', 'demo', 'out', 'set-sheet.jpg')));
    const l = cli(dir, 'lint', 'films/demo', '--step=0.5');
    assert.ok(l.status === 0 || l.status === 1, l.stderr);                                 // runs (exit 1 = staging errors found)
    assert.ok(existsSync(join(dir, 'films', 'demo', 'out', 'lint.json')));
    const vr = cli(dir, 'verify-rig', 'cinecode/rigs/chick.mjs');
    assert.equal(vr.status, 0, vr.stdout + vr.stderr);
    assert.ok(existsSync(join(dir, 'cinecode', 'out', 'verify', 'chick.jpg')) && existsSync(join(dir, 'cinecode', 'out', 'verify', 'chick-lineup.jpg')));
    const vk = cli(dir, 'verify-kit', 'cinecode/kits/glade.mjs');
    assert.equal(vk.status, 0, vk.stdout + vk.stderr);
    assert.ok(existsSync(join(dir, 'cinecode', 'out', 'verify', 'glade-times.jpg')));
    const ve = cli(dir, 'verify-effect', 'films/demo');
    assert.equal(ve.status, 0, ve.stdout + ve.stderr);
    assert.match(ve.stdout, /overlay glow .*deterministic/);
    assert.match(ve.stdout, /beat puff .*deterministic/);
    assert.match(ve.stdout, /sound twinkle/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the strawberry is a film-local rig (films/strawberry-race/rigs/), and the film still loads it', async () => {
  const { loadFilm } = await import('../engine/film/load.mjs');
  const film = await loadFilm(join(ROOT, 'films', 'strawberry-race'));
  assert.deepEqual(film.custom.files, ['rigs/strawberry.mjs', 'custom.mjs']);
  assert.equal(film.resolved.rigs.berry?.kind ?? Object.values(film.resolved.rigs).find(r => r.kind === 'strawberry')?.kind, 'strawberry');
  assert.ok(!/makeRig/.test(readFileSync(join(ROOT, 'films', 'strawberry-race', 'custom.mjs'), 'utf8')), 'custom.mjs no longer holds the rig');
});

test('a broken extension file is a check problem with its path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-bad-'));
  try {
    mkdirSync(join(dir, 'films', 'demo', 'rigs'), { recursive: true });
    mkdirSync(join(dir, 'films', 'demo', 'effects'), { recursive: true });
    writeFileSync(join(dir, 'films', 'demo', 'film.json'), JSON.stringify({ ...DEMO, cast: { berry: { rig: 'hare', name: 'B' } }, sets: { m: { kit: 'meadow' } }, scenes: [] }));
    writeFileSync(join(dir, 'films', 'demo', 'rigs', 'blob.mjs'), 'export default { kind: "blob" };\n');
    writeFileSync(join(dir, 'films', 'demo', 'effects', 'nothing.mjs'), 'export const x = 1;\n');
    const r = cli(dir, 'check', 'films/demo');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /rigs\/blob\.mjs: the default export must be a rig/);
    assert.match(r.stderr, /effects\/nothing\.mjs: an effect file exports custom, overlays or sounds/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ───────────── the gates ─────────────

test('verify-rig: every built-in rig it is run on passes (the gate is not stricter than the house rigs)', async () => {
  const { getRig } = await import('../engine/cast/index.mjs');
  const { verifyRig } = await import('../engine/render/verify.mjs');
  for (const k of ['hare', 'human', 'owl', 'tortoise', 'beetle']) {
    const bad = verifyRig(getRig(k)).filter(c => !c.ok);
    assert.deepEqual(bad, [], k);
  }
});

test('verify-rig: each kind of broken rig fails the check that names its fault', async () => {
  const { verifyRig } = await import('../engine/render/verify.mjs');
  const { default: chick } = await import(join(SKILLS, 'build-rig', 'starter.mjs'));
  const { makeRig } = await import('../engine/cast/rig.mjs');
  const variant = (over, paint = chick.paint) => makeRig({ ...chick, kind: 'broken', ...over, paint });
  const fails = rig => verifyRig(rig).filter(c => !c.ok).map(c => c.name);
  assert.deepEqual(fails(chick), []);
  let n = 0;
  assert.ok(fails(variant({}, (T, p, F, o) => { n++; chick.paint(T, { ...p, wg: (n % 7) / 7 }, F, o); })).includes('deterministic'), 'state kept between calls');
  assert.ok(fails(variant({}, (T, p, F, o) => chick.paint(T, p, { ...F, eye: 'open', lid: 0, tilt: 0, browY: 0, browT: 0, cheek: 0 }, o))).includes('face'), 'a face that ignores expressions and blinks');
  assert.ok(fails(variant({ poses: { ...chick.poses, sit: { ...chick.poses.sit, by: 9 } } })).includes('ground'), 'sitting through the ground');
  assert.ok(fails(variant({}, (T, p, F, o) => { chick.paint(T, p, F, o); if (o.face < 0) { T.fillStyle = '#000'; T.fillRect(-14, -30, 4, 30); } })).includes('flip'), 'face -1 is not the mirror image');
  assert.ok(fails(variant({ height: 60 })).includes('size'), 'declared height far from the drawing');
  const loose = { ...chick, kind: 'loose', draw(ctx, x, y, s, f, st) { const r = chick.draw(ctx, x, y, s, f, st); return { ...r, bounds: [x - 2, y - 4, x + 2, y] }; } };
  assert.ok(fails(loose).includes('bounds'), 'bounds that do not cover the drawing');
  assert.ok(fails(variant({ gestures: { ...chick.gestures, pop: { dur: 0.5, at: (u, b) => ({ ...b, wg: 1 }) } } })).includes('motion'), 'a gesture that does not return to its pose');
});

test('verify-kit: built-in kits pass; a kit with too few anchors, a buried anchor or a small area fails', async () => {
  const { getKit } = await import('../engine/set/kits/index.mjs');
  const { verifyKit } = await import('../engine/render/verify.mjs');
  const { makeSet } = await import('../engine/set/set.mjs');
  for (const k of ['meadow', 'hill']) assert.deepEqual(verifyKit(getKit(k), k).filter(c => !c.ok), [], k);
  const { default: glade } = await import(join(SKILLS, 'build-kit', 'starter.mjs'));
  assert.deepEqual(verifyKit(glade, 'glade').filter(c => !c.ok), []);
  const tiny = () => makeSet({ id: 'tiny', W: 2000, H: 1200, refX: 1000, refY: 600, area: { x0: 0, x1: 2000, y0: 0, y1: 1200 }, horizon: 500, laneY: 900, baseS: 1, layers: [],
    props: [{ id: 'rock', x: 1000, y: 900, solid: { rx: 80, ry: 20 }, bounds: [900, 800, 1100, 920], paint() {} }],
    anchors: { a: { x: 1000, y: 900 }, b: { x: 600, y: 950 } }, ambience: { day: 'meadow-day', night: 'nope' } });
  const r = Object.fromEntries(verifyKit(tiny, 'tiny').map(c => [c.name, c]));
  assert.equal(r.anchors.ok, false); assert.match(r.anchors.detail, /at least 4/); assert.match(r.anchors.detail, /a \(1000, 900\) is not on walkable ground/);
  assert.equal(r.world.ok, false); assert.match(r.world.detail, /smaller than the widest view/); assert.match(r.world.detail, /ambience\.night "nope"/);
});

test('the rig and kit examples in docs/cast.md and docs/sets.md are files of their own that pass their gates', () => {
  const dir = project();
  try {
    for (const [doc, file, cmd] of [['cast.md', 'rigs/pebblet.mjs', 'verify-rig'], ['sets.md', 'kits/glade.mjs', 'verify-kit']]) {
      const text = readFileSync(join(ROOT, 'docs', doc), 'utf8');
      const code = new RegExp('```js\\n(// films/<slug>/' + file.replace('.', '\\.') + '[\\s\\S]*?)```').exec(text);
      assert.ok(code, `docs/${doc} has an example in films/<slug>/${file}`);
      mkdirSync(join(dir, 'films', 'ex', file, '..'), { recursive: true });
      writeFileSync(join(dir, 'films', 'ex', file), code[1]);
      const r = cli(dir, cmd, join('films', 'ex', file));
      assert.equal(r.status, 0, `docs/${doc}: ${r.stdout}${r.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
