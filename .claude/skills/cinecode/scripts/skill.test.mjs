// Tests for the cinecode skill: its helper scripts run, its references cover the live registries, and every command
// line it documents names a real command with options the CLI accepts.
//   node --test .claude/skills/cinecode/scripts/skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const run = (script, ...args) => spawnSync(process.execPath, [join(SKILL, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } });
const BUILD = ['build-rig', 'build-kit', 'build-effect'];
const docs = () => [join(SKILL, 'SKILL.md'), ...readdirSync(join(SKILL, 'references')).map(f => join(SKILL, 'references', f)), ...BUILD.map(b => join(SKILL, '..', b, 'SKILL.md'))]
  .map(p => ({ p, text: readFileSync(p, 'utf8') }));

test('SKILL.md has the frontmatter that makes it trigger, and stays short', () => {
  const s = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
  assert.ok(fm, 'frontmatter');
  assert.match(fm[1], /^name: cinecode$/m);
  assert.match(fm[1], /^description: .*animated film/m);
  assert.ok(s.split('\n').length < 350, 'under ~350 lines');
});

test('each build skill triggers, has its starter, and sends the work through its gate', () => {
  for (const [b, gate] of [['build-rig', 'verify-rig'], ['build-kit', 'verify-kit'], ['build-effect', 'verify-effect']]) {
    const s = readFileSync(join(SKILL, '..', b, 'SKILL.md'), 'utf8'), fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
    assert.ok(fm, `${b}: frontmatter`);
    assert.match(fm[1], new RegExp(`^name: ${b}$`, 'm'));
    assert.match(fm[1], /^description: .{80,}/m);
    assert.ok(existsSync(join(SKILL, '..', b, 'starter.mjs')), `${b}: starter.mjs`);
    assert.match(s, new RegExp(`\`cinecode ${gate} `), `${b}: documents its gate`);
    assert.match(s, /starter\.mjs/, `${b}: points at its starter`);
  }
  const main = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const b of BUILD) assert.ok(main.includes(b), `the main skill hands off to ${b}`);
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

test('takes.mjs flags a kept take whose tone was cut, and lists unused takes', async () => {
  const { loadPlan } = await import(join(ROOT, 'engine/render/film-source.mjs'));
  const { resolveLine } = await import(join(ROOT, 'engine/audio/voice.mjs'));
  const { encodeWav } = await import(join(ROOT, 'engine/audio/wav.mjs'));
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-takes-'));
  try {
    const text = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8');
    writeFileSync(join(dir, 'film.json'), /```json\n([\s\S]*?)\n```/.exec(text)[1]);
    const { film, plan } = await loadPlan(dir), voices = join(dir, 'voices');
    mkdirSync(voices);
    const take = (id, L, takes, keep) => {
      writeFileSync(join(voices, `${id}.wav`), encodeWav([new Float32Array(24000).fill(0.1)], 48000, 16));
      const k = takes[keep - 1];
      writeFileSync(join(voices, `${id}.json`), JSON.stringify({ id, who: L.who, text: L.text, voice: L.voice, tone: L.tone, prompt: k.direction ? `[${k.direction}] ${L.text}` : L.text, qa: { wer: 0, transcript: L.text, leading: 0, pass: true, take: keep, takes } }));
    };
    const [a, b] = plan.lines.slice(1, 3).map(l => resolveLine(film, l));
    take(a.id, a, [{ attempt: 1, direction: a.tone, wer: 0.5, transcript: `${a.tone} ${a.text}`, directionSpoken: true }, { attempt: 2, direction: '', wer: 0, transcript: a.text }], 2);
    take(b.id, b, [{ attempt: 1, direction: b.tone, wer: 0, transcript: b.text }], 1);
    take('0123456789ab', b, [{ attempt: 1, direction: b.tone, wer: 0, transcript: b.text }], 1);
    const t = run('takes.mjs', dir);
    assert.equal(t.status, 0, t.stderr);
    assert.match(t.stdout, new RegExp(`^! ${a.id} .*TONE-CUT`, 'm'));
    assert.match(t.stdout, /kept take 2 of 2, sent with no direction instead of "old, dry, slow"/);
    assert.match(t.stdout, /try 1 \[old, dry, slow\]: old, dry, slow Mine, I think\./);
    assert.doesNotMatch(t.stdout, new RegExp(`^! ${b.id}`, 'm'), 'a first-try take is not flagged');
    assert.match(t.stdout, /^3 lines, 2 flagged\./m, 'the unvoiced narrator line is MISSING, the cut take TONE-CUT');
    assert.match(t.stdout, /^1 unused take .*: 0123456789ab$/m);
    assert.match(t.stdout, /^ {2}rm \S*voices\/0123456789ab\.wav \S*voices\/0123456789ab\.json$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every documented cinecode command line names a real command with valid options', async () => {
  const { COMMANDS, parseArgs } = await import(join(ROOT, 'engine/render/cli.mjs'));
  let n = 0;
  for (const { p, text } of docs()) {
    // command lines in code: fenced blocks and inline spans, as `cinecode <cmd>` (the plugin's PATH) or `node bin/cinecode.mjs <cmd>`
    const code = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].flatMap(b => b[1].split('\n')).concat([...text.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(m => m[1]));
    for (const m of code.flatMap(l => [...l.matchAll(/^(?:node bin\/cinecode\.mjs|cinecode) ([a-z-]+)((?: +[^\s`#|)]+)*)/g)])) {
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
    for (const m of text.matchAll(/(?:\.claude\/skills\/cinecode|\$\{CLAUDE_SKILL_DIR\}|<skill>)\/scripts\/([\w.-]+\.mjs)/g)) assert.ok(existsSync(join(SKILL, 'scripts', m[1])), `${p}: no script ${m[1]}`);
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

test('every lint rule is in docs/lint.md (table and section) and in the review reference\'s lint table', async () => {
  const { RULES } = await import(join(ROOT, 'engine/lint/lint.mjs'));
  const lint = readFileSync(join(ROOT, 'docs/lint.md'), 'utf8'), review = readFileSync(join(SKILL, 'references/review.md'), 'utf8');
  for (const [rule, R] of Object.entries(RULES)) {
    assert.match(lint, new RegExp(`^\\| \`${rule}\` \\| ${R.severity}`, 'm'), `docs/lint.md rule table is missing ${rule} (${R.severity})`);
    assert.match(lint, new RegExp(`^### ${rule}$`, 'm'), `docs/lint.md has no section for ${rule}`);
    assert.match(review, new RegExp(`^\\| ${rule} \\|`, 'm'), `references/review.md lint table is missing ${rule}`);
  }
});

test('hovering ("height", enter "fly") and a look\'s "tilt" are valid fields and documented; no doc says fliers can\'t hover', async () => {
  const { validateFilm } = await import(join(ROOT, 'engine/film/validate.mjs'));
  const { getRig, listRigs } = await import(join(ROOT, 'engine/cast/index.mjs'));
  const { getKit, listKits } = await import(join(ROOT, 'engine/set/kits/index.mjs'));
  const film = {
    title: 'Hover', cast: { tilly: { rig: 'mouse' }, wren: { rig: 'songbird' }, owl: { rig: 'owl' } }, sets: { meadow: { kit: 'meadow' } },
    scenes: [{ id: 's01', set: 'meadow', actors: { tilly: { at: 'x:1500' }, wren: { at: 'x:1600', height: 40 }, owl: { offstage: 'left' } },
      shots: [{ id: '1.1', camera: { size: 'full', on: ['tilly'] }, beats: [
        { do: 'look', who: 'tilly', to: 'wren', tilt: 0.4 },
        { do: 'enter', who: 'owl', from: 'left', to: 'x:1300', height: 50, fly: true },
        { do: 'fly', who: 'wren', to: 'near:tilly', height: 20 },
        { do: 'place', who: 'owl', to: 'x:1200', height: 30 },
      ] }] }],
  };
  const r = validateFilm(film, { getRig, rigKinds: listRigs(), kits: new Set(listKits()), sets: { meadow: getKit('meadow')({}) }, custom: {}, overlays: {}, sounds: {} });
  assert.deepEqual(r.problems.map(x => x.message), []);
  assert.deepEqual(r.warnings.map(x => x.message), []);
  const quick = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8'), board = readFileSync(join(ROOT, 'docs/storyboard.md'), 'utf8');
  for (const [name, text] of [['references/storyboard-quick.md', quick], ['docs/storyboard.md', board]]) {
    assert.match(text, /^\| `do: look` \|.*`tilt`|^\| `look` \|.*`tilt`/m, `${name}: the look row lists "tilt"`);
    for (const d of ['fly', 'enter', 'place']) assert.match(text, new RegExp(`^\\| \`(do: )?[a-z /]*\\b${d}\\b[a-z /]*\` \\|.*\`height\``, 'm'), `${name}: the ${d} row lists "height"`);
    assert.match(text, /`"?fly"?: true`/, `${name}: enter's "fly": true`);
  }
  assert.match(board, /^### Hovering$/m);
  const all = [...docs(), ...readdirSync(join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => ({ p: join(ROOT, 'docs', f), text: readFileSync(join(ROOT, 'docs', f), 'utf8') }))];
  for (const { p, text } of all) assert.doesNotMatch(text, /fliers can't hover|no rig hovers|nothing is in the air|no point in the air/i, `${p} still says fliers can't hover`);
});

// A throwaway film folder (removed by the caller): film.json from an object.
const tmpFilm = (film) => { const dir = mkdtempSync(join(tmpdir(), 'cinecode-skill-')); writeFileSync(join(dir, 'film.json'), JSON.stringify(film)); return dir; };
const allDocs = () => [...docs(), ...readdirSync(join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => ({ p: join(ROOT, 'docs', f), text: readFileSync(join(ROOT, 'docs', f), 'utf8') })), { p: 'templates/screenplay.md', text: readFileSync(join(ROOT, 'templates/screenplay.md'), 'utf8') }];

test('takes.mjs --all prints every take, with its length against the estimate and the pauses inside it', async () => {
  const { loadPlan } = await import(join(ROOT, 'engine/render/film-source.mjs'));
  const { resolveLine } = await import(join(ROOT, 'engine/audio/voice.mjs'));
  const { encodeWav } = await import(join(ROOT, 'engine/audio/wav.mjs'));
  const text = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8');
  const dir = tmpFilm(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)[1]));
  try {
    const { film, plan } = await loadPlan(dir), voices = join(dir, 'voices');
    mkdirSync(voices);
    const L = resolveLine(film, plan.lines[1]), sr = 48000;
    // 0.5 s of sound, 0.6 s of silence, 0.5 s of sound: "Mine, I think." (3 words, estimate 1.45 s) at 1.6 s
    const x = new Float32Array(Math.round(1.6 * sr)).map((_, i) => (i < 0.5 * sr || i >= 1.1 * sr ? 0.2 * Math.sin(i / 7) : 0));
    writeFileSync(join(voices, `${L.id}.wav`), encodeWav([x], sr, 16));
    writeFileSync(join(voices, `${L.id}.json`), JSON.stringify({ id: L.id, who: L.who, text: L.text, voice: L.voice, tone: L.tone, prompt: `[${L.tone}] ${L.text}`, qa: { wer: 0, transcript: 'Mine, I think.', leading: 0, pass: true, take: 1, takes: [{ attempt: 1, direction: L.tone, wer: 0, transcript: 'Mine, I think.' }] } }));
    const quiet = run('takes.mjs', dir), all = run('takes.mjs', dir, '--all');
    assert.equal(all.status, 0, all.stderr);
    assert.doesNotMatch(quiet.stdout, new RegExp(`^ {2}${L.id} `, 'm'), 'without --all a clean take is not printed');
    assert.match(all.stdout, new RegExp(`^ {2}${L.id} `, 'm'), 'with --all it is');
    assert.match(all.stdout, /heard: Mine, I think\./);
    assert.match(all.stdout, /length 1\.60 s \(estimate 1\.45 s\); pause 0\.60 s at 0\.50 s/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(skill, /takes\.mjs films\/<slug> --all/, 'SKILL.md step 4 runs takes.mjs with --all');
});

test('timeline.mjs prints each beat\'s times, a move that runs past its cut, mark times, and a pose or gesture lost under a move', () => {
  const dir = tmpFilm({ title: 'T', cast: { a: { rig: 'human' }, d: { rig: 'deer' } }, sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 's', set: 'm', actors: { a: { at: 'x:900', face: 'right' }, d: { at: 'x:1700', face: 'left' } }, shots: [
      { id: '1.1', dur: 1.5, camera: { size: 'wide', on: ['a'] }, beats: [{ do: 'walk', who: 'a', to: 'x:1300' }, { mark: 'go', at: 0.5 }] },
      { id: '1.2', camera: { size: 'wide', on: ['a'] }, beats: [{ do: 'pose', who: 'a', pose: 'sit-ground', at: 0.3 }, { wait: 3 }] },
      { id: '1.3', camera: { size: 'wide', on: ['d'] }, beats: [{ do: 'walk', who: 'd', to: 'x:1500' }, { do: 'gesture', who: 'd', name: 'jump', with: 'prev', after: 0.3 }] }] }] });
  try {
    const r = run('timeline.mjs', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^1\.1 {2}0:00\.00–0:01\.50 {2}1\.50 s \(fixed dur\)$/m);
    assert.match(r.stdout, /walk a → x:1300 {3}runs on into 1\.2 \(to \+\d\.\d\d\)/);
    assert.match(r.stdout, /pose a sit-ground {3}! during a's walk .*end pose replaces it/);
    assert.match(r.stdout, /gesture d jump {3}! during d's walk .*legs keep the gait/);
    assert.match(r.stdout, /^marks: go 0:00\.50 \(0\.50 s\)$/m);
    assert.equal(run('timeline.mjs').status, 2, 'usage error without a film');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('levels.mjs flags a quiet hole under a music cue that a whole-shot mean hides', async () => {
  const { encodeWav } = await import(join(ROOT, 'engine/audio/wav.mjs'));
  const dir = tmpFilm({ title: 'L', cast: { a: { rig: 'mouse' } }, sets: { m: { kit: 'meadow' } },
    scenes: [{ id: 's', set: 'm', music: { mood: 'playful' }, actors: { a: { at: 'x:1000' } }, shots: [
      { id: '1.1', dur: 4, camera: { size: 'full', on: ['a'] } }, { id: '1.2', dur: 4, camera: { size: 'close', on: ['a'] } }] }] });
  try {
    mkdirSync(join(dir, 'out'));
    const sr = 48000, wav = hole => { const x = new Float32Array(8 * sr).map((_, i) => (hole && i >= 5 * sr && i < 6.5 * sr ? 0 : 0.1 * Math.sin(i / 9))); writeFileSync(join(dir, 'out/music.wav'), encodeWav([x, x], sr, 16)); };
    wav(true);
    let r = run('levels.mjs', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^1\.2 .*! {2}playful {3}quiet 0:05\.0–0:06\.5$/m);
    assert.match(r.stdout, /1 quiet stretch under a cue\. .*"downbeat": true.*"hold": true/);
    wav(false);
    r = run('levels.mjs', dir);
    assert.match(r.stdout, /^no quiet stretches under a cue$/m);
    assert.equal(run('levels.mjs').status, 2, 'usage error without a film');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(readFileSync(join(SKILL, 'SKILL.md'), 'utf8'), /scripts\/levels\.mjs films\/<slug>/, 'SKILL.md step 7 uses levels.mjs');
});

test('the set inventory and reference give every prop\'s painted extent (the hill\'s hawthorn has no anchor)', async () => {
  const { getKit } = await import(join(ROOT, 'engine/set/kits/index.mjs'));
  const [x0, y0, x1, y1] = getKit('hill')({}).props.find(p => p.id === 'hawthorn').bounds.map(Math.round);
  const line = `hawthorn* ${x0}–${x1} × ${y0}–${y1}`;
  assert.ok(run('inventory.mjs', 'sets').stdout.split('\n').some(l => l.startsWith('Props (painted extent') && l.includes(line)), `inventory prints "${line}"`);
  assert.ok(readFileSync(join(SKILL, 'references/sets.md'), 'utf8').includes(line), 'references/sets.md is regenerated with the prop extents');
  const fx = readFileSync(join(ROOT, 'docs/effects.md'), 'utf8');
  for (const f of ['set.props', 'set.horizon', '`alpha`', 'hands.front']) assert.ok(fx.includes(f), `docs/effects.md documents ${f}`);
});

test('engine facts the skill teaches: a gesture reads only its name, a move ends standing and replaces a pose under it, a long sfx in params takes no time', async () => {
  const { loadPlan } = await import(join(ROOT, 'engine/render/film-source.mjs'));
  const { probe } = await import(join(ROOT, 'engine/film/util.mjs'));
  const film = extra => ({ title: 'F', cast: { a: { rig: 'human' } }, sets: { m: { kit: 'meadow' } }, scenes: [{ id: 's', set: 'm', actors: { a: { at: 'x:900', face: 'right' } }, shots: [
    { id: '1.1', dur: 1.5, camera: { size: 'wide', on: ['a'] }, beats: [{ do: 'walk', who: 'a', to: 'x:1300' }, { sfx: 'wind', params: { dur: 9 } }] },
    { id: '1.2', camera: { size: 'wide', on: ['a'] }, beats: [{ do: 'pose', who: 'a', pose: 'sit-ground', at: 0.3 }, { do: 'gesture', who: 'a', name: 'point', ...extra }, { wait: 3 }] }] }] });
  const dirs = [tmpFilm(film({})), tmpFilm(film({ to: 'down' }))];
  try {
    const [A, B] = await Promise.all(dirs.map(d => loadPlan(d)));
    const s2 = A.plan.shots[1], st = (P, t) => P.plan.actorsAt(t).find(x => x.id === 'a');
    assert.ok(Math.abs(A.plan.shots[0].t1 - 1.5) < 1e-6, 'the 9 s wind (dur in params) does not hold its shot');
    const box = (P, t) => { const a = st(P, t); return probe(a.R, 0, 0, 1, 1, { ...a.st, shadow: false }).bounds; };
    assert.ok(-box(A, s2.t1 - 0.1)[1] > 130, 'the pose under the carried walk is replaced: she ends standing');
    const g = s2.t0 + 4.6;   // mid-point
    assert.deepEqual(box(A, g), box(B, g), 'a "to" on a gesture changes nothing');
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
  const quick = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8'), board = readFileSync(join(ROOT, 'docs/storyboard.md'), 'utf8');
  for (const [name, text] of [['storyboard-quick', quick], ['docs/storyboard.md', board]]) {
    assert.match(text, /default `stand`|ends in `stand`/, `${name}: a move ends in stand`);
    assert.match(text, /move's end pose replaces it|replaced by the move's end pose/, `${name}: a pose under a move is replaced`);
    assert.match(text, /"params": \{ "dur": 30 \}/, `${name}: a long sound in params takes no time`);
  }
  for (const { p, text } of allDocs()) assert.doesNotMatch(text, /`point` aims with `to`/, `${p} says a gesture beat's "to" aims the point`);
});

test('title cards: no doc recommends a card shorter than the 3 s it takes to be read', () => {
  for (const { p, text } of allDocs()) {
    assert.doesNotMatch(text, /2–2\.5 s each|2-2\.5 s/, `${p} recommends 2–2.5 s cards (they never reach full strength)`);
    for (const m of text.matchAll(/cards? (?:of )?(\d+(?:\.\d+)?) s each|(\d+(?:\.\d+)?) s each \(/g)) assert.ok(Number(m[1] ?? m[2]) >= 3, `${p}: "${m[0]}"`);
  }
  assert.match(readFileSync(join(SKILL, 'SKILL.md'), 'utf8'), /^\| about 30 s \| 1 \| 5–6 \|/m, 'SKILL.md has a row for about 30 s');
});

// ───────────── round 6: the space library, depth, partial framing, scoped effects, a kit's own times ─────────────

const read = p => readFileSync(join(ROOT, p), 'utf8');
const skillDoc = name => readFileSync(join(SKILL, '..', name, 'SKILL.md'), 'utf8');

test('inventory lists every built-in effect (as, layer, its description), and references/effects.md covers them', async () => {
  const { BUILTIN_EFFECTS } = await import(join(ROOT, 'engine/effects/index.mjs'));
  const names = [...new Set([...Object.keys(BUILTIN_EFFECTS.custom), ...Object.keys(BUILTIN_EFFECTS.overlays)])];
  assert.ok(names.length >= 9, `${names.length} built-in effects`);
  const r = run('inventory.mjs', 'effects');
  assert.equal(r.status, 0, r.stderr);
  const ref = readFileSync(join(SKILL, 'references/effects.md'), 'utf8');
  for (const n of names) {
    const layer = (BUILTIN_EFFECTS.custom[n] ?? BUILTIN_EFFECTS.overlays[n]).layer || 'world';
    assert.match(r.stdout, new RegExp(`^\\| ${n} \\| [a-z ,]+ \\| ${layer}`, 'm'), `inventory: ${n} on ${layer}`);
    assert.match(ref, new RegExp(`^\\| ${n} \\|`, 'm'), `references/effects.md is missing ${n}: regenerate it`);
    assert.match(ref, new RegExp(`^### (?:[a-z, ]+, )?${n}(?:, [a-z, ]+)?$`, 'm'), `references/effects.md has no section for ${n}`);
  }
  assert.match(r.stdout, /^\| sunglow \| custom beat, overlay \| grade \|$/m, 'an effect that is both a beat and an overlay');
  assert.match(run('inventory.mjs', 'cast').stdout, /^\| planet \|.*no face/m, 'a rig with no face says so');
  assert.match(run('inventory.mjs', 'sets').stdout, /^### space\n\n.*its own times: space \(default space\); no ground, so no shadows/m, 'a kit with its own times');
});

test('the build skills say where the gate writes its review images: the film\'s out/ or the project\'s cinecode/out/', () => {
  for (const b of ['build-rig', 'build-kit']) {
    const s = skillDoc(b);
    assert.match(s, /films\/<slug>\/out\/verify\//, `${b}: a film's piece`);
    assert.match(s, /cinecode\/out\/verify\//, `${b}: a project's piece`);
  }
  // and that is where verify-kit writes them for a project's kit
  const dir = mkdtempSync(join(tmpdir(), 'cinecode-gate-'));
  try {
    mkdirSync(join(dir, '.git')); mkdirSync(join(dir, 'cinecode/kits'), { recursive: true });
    writeFileSync(join(dir, 'cinecode/kits/glade.mjs'), readFileSync(join(SKILL, '..', 'build-kit', 'starter.mjs'), 'utf8'));
    const r = spawnSync(process.execPath, [join(ROOT, 'bin/cinecode.mjs'), 'verify-kit', 'cinecode/kits/glade.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const f of ['glade.jpg', 'glade-times.jpg']) assert.ok(existsSync(join(dir, 'cinecode/out/verify', f)), `cinecode/out/verify/${f}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('build-rig\'s contract lists every optional rig field the engine reads', () => {
  const s = skillDoc('build-rig'), src = ['engine/cast/rig.mjs', 'engine/film/util.mjs', 'engine/film/actor.mjs', 'engine/film/compile.mjs', 'engine/film/frame.mjs', 'engine/lint/lint.mjs', 'engine/render/verify.mjs'].map(read).join('\n');
  for (const f of ['sizes', 'upright', 'noShadow', 'shadowA', 'shadowW', 'faceless', 'mount', 'lookTime', 'hangPoses', 'breathPeriod', 'feet', 'steps']) {
    assert.match(src, new RegExp(`\\.${f}\\b`), `the engine reads ${f}`);
    assert.match(s, new RegExp(`\`${f}(?:\\(|\`)`), `build-rig documents ${f}`);
  }
  assert.match(s, /planet\.mjs/, 'build-rig names the planet rig (no face, sizes from params) as a model');
});

test('build-kit documents a kit\'s own times, the paint rule, depth, and the anchor names check reads as something else', () => {
  const s = skillDoc('build-kit');
  for (const f of ['times', 'groundShadows', 'lens']) assert.match(s, new RegExp(`\`${f}\``), `build-kit: ${f}`);
  assert.match(s, /90%/, 'the paint check: 90% of the frame painted after each grade');
  assert.match(s, /"left"/, 'reserved anchor names');
  assert.match(s, /space\.mjs/, 'the space kit as a model');
  assert.doesNotMatch(s, /\(meadow, forest, stream, wayside, valley, hill, village\)/, 'the list of built-in kits includes space');
});

test('build-effect and docs/effects.md document every overlay layer, scope, hold, overlay shots and the built-in effects', async () => {
  const { OVERLAY_LAYERS } = await import(join(ROOT, 'engine/film/validate.mjs'));
  const s = skillDoc('build-effect'), fx = read('docs/effects.md');
  for (const l of OVERLAY_LAYERS) {
    assert.match(s, new RegExp(`\`${l}\``), `build-effect: layer ${l}`);
    assert.match(fx, new RegExp(`^\\| \`${l}\` \\|`, 'm'), `docs/effects.md layer table: ${l}`);
  }
  for (const f of ['api.item', 'api.project', '"scope": "shot"', '"hold": false', '"shots"']) {
    assert.ok(s.includes(f), `build-effect: ${f}`);
    assert.ok(fx.includes(f), `docs/effects.md: ${f}`);
  }
  assert.match(s, /references\/effects\.md/, 'build-effect points at the built-in effects');
});

test('camera: focus, z, zTo and world points in "on" are documented, and no doc says "on" can\'t take points', () => {
  const quick = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8'), board = read('docs/storyboard.md');
  for (const [name, text] of [['references/storyboard-quick.md', quick], ['docs/storyboard.md', board]]) {
    for (const f of ['focus', 'z', 'zTo']) assert.match(text, new RegExp(`^\\| (?:\`\\w+\`, )*\`${f}\`(?:, \`\\w+\`)* \\|`, 'm'), `${name}: camera row for ${f}`);
    assert.match(text, /^\| `on` \|.*x:…,y:…/m, `${name}: "on" takes world points`);
    assert.match(text, /"scope"/, `${name}: a custom beat's scope`);
    assert.match(text, /"hold": false/, `${name}: hold false`);
  }
  for (const { p, text } of allDocs()) assert.doesNotMatch(text, /not `x:…,y:…` points|Not `x:…,y:…` points/i, `${p} still says "on" can't take points`);
  assert.doesNotMatch(board, /multiplier on the size's zoom \(`0\.8` = a little wider\) \|/, 'docs/storyboard.md explains zoom on subjects with and without a face');
});

test('the quick reference\'s space scene is a valid film (space kit, planets, depth, partial framing, a scoped effect)', async () => {
  const text = readFileSync(join(SKILL, 'references/storyboard-quick.md'), 'utf8'), blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.ok(blocks.length >= 2, 'a second JSON block: the space scene');
  const dir = tmpFilm(JSON.parse(blocks[1][1]));
  try {
    const { loadPlan } = await import(join(ROOT, 'engine/render/film-source.mjs'));
    const { film, plan } = await loadPlan(dir);
    assert.deepEqual(film.warnings.map(w => w.message ?? w), []);
    assert.deepEqual(plan.warnings.map(w => w.message ?? w), []);
    const src = blocks[1][1];
    for (const f of ['"kit": "space"', '"rig": "planet"', '"focus"', '"zTo"', '"z":', '"scope": "shot"']) assert.ok(src.includes(f), `the space scene uses ${f}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('voices: "soft" and "warm" are not listed as never read aloud ("[warm, gentle, soft]" was)', () => {
  for (const [p, text] of [['references/voices.md', readFileSync(join(SKILL, 'references/voices.md'), 'utf8')], ['docs/sound.md', read('docs/sound.md')]]) {
    const never = /Never read aloud[^.]*\./i.exec(text)?.[0] ?? '';
    assert.ok(never, `${p}: the never-read list`);
    assert.doesNotMatch(never, /"soft"|"warm"/, `${p} lists soft or warm as never read aloud`);
    assert.match(text, /\[warm, gentle, soft\]/, `${p}: the take that read "soft" aloud`);
  }
});

test('SKILL.md starts space and depth films, reuses the bigger library first, and cuts into a full-frame effect', () => {
  const s = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const f of ['`space`', '`planet`', '`telescope`', '`focus`', '`zTo`', '"transition": "cut"', 'references/effects.md', '"scope": "shot"', '"hold": false', '"lint": { "allow"']) assert.ok(s.includes(f), `SKILL.md: ${f}`);
});

test('every built-in rig and kit is in the docs and in the screenplay template\'s lists', async () => {
  const { listRigs } = await import(join(ROOT, 'engine/cast/index.mjs'));
  const { listKits } = await import(join(ROOT, 'engine/set/kits/index.mjs'));
  const cast = read('docs/cast.md'), sets = read('docs/sets.md'), tpl = read('templates/screenplay.md');
  for (const k of listRigs().map(r => (typeof r === 'string' ? r : r.kind))) {
    assert.match(cast, new RegExp(`^##+ ${k}$`, 'm'), `docs/cast.md has no section for ${k}`);
    assert.match(tpl, new RegExp(`\\b${k}\\b`), `templates/screenplay.md doesn't list rig ${k}`);
  }
  for (const k of listKits().map(x => (typeof x === 'string' ? x : x.id ?? x.name))) {
    assert.match(sets, new RegExp(`^### ${k}$`, 'm'), `docs/sets.md has no section for kit ${k}`);
    assert.match(tpl, new RegExp(`\\b${k}\\b`), `templates/screenplay.md doesn't list kit ${k}`);
  }
});

test('a shot\'s lint block for a warning kept on purpose is documented where the skill and the docs talk about lint', () => {
  for (const [p, text] of [['docs/lint.md', read('docs/lint.md')], ['references/review.md', readFileSync(join(SKILL, 'references/review.md'), 'utf8')], ['docs/storyboard.md', read('docs/storyboard.md')]]) {
    assert.match(text, /"lint": \{ "allow": \[/, `${p}: the lint block`);
  }
});
