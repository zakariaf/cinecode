// Tests for the cinecode skill: its helper scripts run, its references cover the live registries, and every command
// line it documents names a real command with options the CLI accepts.
//   node --test .claude/skills/cinecode/scripts/skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const run = (script, ...args) => spawnSync(process.execPath, [join(SKILL, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });
const docs = () => [join(SKILL, 'SKILL.md'), ...readdirSync(join(SKILL, 'references')).map(f => join(SKILL, 'references', f))]
  .map(p => ({ p, text: readFileSync(p, 'utf8') }));

test('SKILL.md has the frontmatter that makes it trigger, and stays short', () => {
  const s = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
  assert.ok(fm, 'frontmatter');
  assert.match(fm[1], /^name: cinecode$/m);
  assert.match(fm[1], /^description: .*animated film/m);
  assert.ok(s.split('\n').length < 350, 'under ~350 lines');
});

test('inventory lists every registered rig and kit, and the references cover them', async () => {
  const { listRigs } = await import(join(ROOT, 'engine/cast/index.mjs'));
  const { listKits } = await import(join(ROOT, 'engine/set/kits/index.mjs'));
  const kinds = listRigs().map(r => (typeof r === 'string' ? r : r.kind)), kits = listKits().map(k => (typeof k === 'string' ? k : k.id ?? k.name));
  const cast = run('inventory.mjs', 'cast'), sets = run('inventory.mjs', 'sets');
  assert.equal(cast.status, 0, cast.stderr);
  assert.equal(sets.status, 0, sets.stderr);
  for (const k of kinds) assert.match(cast.stdout, new RegExp(`^\\| ${k} \\|`, 'm'), `rig ${k} in the table`);
  assert.match(cast.stdout, /^\| tortoise \|.*carry a rider/m);
  for (const k of kits) assert.match(sets.stdout, new RegExp(`^### ${k}$`, 'm'), `kit ${k}`);
  assert.match(sets.stdout, /^\| stump_top \| surface \(stump\) \|/m);
  const castRef = readFileSync(join(SKILL, 'references/cast.md'), 'utf8'), setsRef = readFileSync(join(SKILL, 'references/sets.md'), 'utf8');
  for (const k of kinds) assert.match(castRef, new RegExp(`^### ${k}$`, 'm'), `references/cast.md is missing rig ${k}: regenerate it`);
  for (const k of kits) assert.match(setsRef, new RegExp(`^### ${k}$`, 'm'), `references/sets.md is missing kit ${k}: regenerate it`);
});

test('warnings.mjs and takes.mjs run on a film without the network', () => {
  const w = run('warnings.mjs', 'films/_test');
  assert.equal(w.status, 0, w.stderr);
  assert.ok(w.stdout.trim().length > 0);
  const t = run('takes.mjs', 'films/_test', '--all');
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /^\d+ lines, \d+ flagged\./m);
  assert.equal(run('takes.mjs').status, 2, 'usage error without a film');
  assert.equal(run('warnings.mjs').status, 2, 'usage error without a film');
});

test('every documented cinecode command line names a real command with valid options', async () => {
  const { COMMANDS, parseArgs } = await import(join(ROOT, 'engine/render/cli.mjs'));
  let n = 0;
  for (const { p, text } of docs()) {
    for (const m of text.matchAll(/node bin\/cinecode\.mjs ([a-z-]+)((?: +[^\s`#|)]+)*)/g)) {
      const [cmd, rest] = [m[1], m[2].trim().split(/\s+/).filter(Boolean).filter(a => !/^[<…]/.test(a))];
      assert.ok(COMMANDS[cmd], `${p}: unknown command "${cmd}" in "${m[0]}"`);
      assert.doesNotThrow(() => parseArgs(rest, COMMANDS[cmd].options), `${p}: bad options in "${m[0]}"`);
      n++;
    }
  }
  assert.ok(n >= 10, `found ${n} command lines`);
});

test('every documented sheet.mjs option and helper script exists', () => {
  const src = readFileSync(join(ROOT, 'engine/film/sheet.mjs'), 'utf8');
  for (const { p, text } of docs()) {
    for (const m of text.matchAll(/node engine\/film\/sheet\.mjs[^\n`]*/g)) {
      for (const o of m[0].matchAll(/--([a-z]+)/g)) assert.match(src, new RegExp(`opt\\.${o[1]}\\b`), `${p}: sheet.mjs has no --${o[1]}`);
    }
    for (const m of text.matchAll(/\.claude\/skills\/cinecode\/scripts\/([\w.-]+\.mjs)/g)) assert.ok(existsSync(join(SKILL, 'scripts', m[1])), `${p}: no script ${m[1]}`);
  }
});

test('the storyboard skeleton in the quick reference is a valid film', async () => {
  const text = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8');
  const json = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)[1]);
  const { validateFilm } = await import(join(ROOT, 'engine/film/validate.mjs'));
  const { getRig, listRigs } = await import(join(ROOT, 'engine/cast/index.mjs'));
  const { getKit, listKits } = await import(join(ROOT, 'engine/set/kits/index.mjs'));
  const sets = Object.fromEntries(Object.entries(json.sets).map(([id, s]) => [id, getKit(s.kit)(s.params || {})]));
  const r = validateFilm(json, { getRig, rigKinds: listRigs(), kits: new Set(listKits()), sets, custom: {}, overlays: {}, sounds: {} });
  assert.deepEqual(r.problems.map(x => x.message), []);
  assert.deepEqual(r.warnings.map(x => x.message), []);
});

test('the inventory works from another working directory', () => {
  const out = execFileSync(process.execPath, [join(SKILL, 'scripts/inventory.mjs'), 'sets'], { cwd: SKILL, encoding: 'utf8' });
  assert.match(out, /^### village$/m);
});
