// Audit a film's cached voice takes: for every line, what was asked, what the QA transcription heard, and the flags
// that mean "regenerate this take". Reads only the cache (no network, no API key).
//   node .claude/skills/cinecode/scripts/takes.mjs films/<slug> [--all]
// Flags: MISSING (not voiced yet), FAIL (QA never passed), WER (word error > 0.2), DIRECTION (the bracketed tone was
// read aloud), LEADING (words inserted before the line, e.g. "Huh, then…"). Non-verbal lines ([laughs]) have no word
// gate: their transcript should be empty or the sound itself ("ha ha"); real words ("Oh", "Giggling") mean redo.
// Without --all only flagged and non-verbal lines are printed.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = process.argv.slice(2), all = args.includes('--all'), arg = args.find(a => !a.startsWith('--'));
if (!arg) { console.error('usage: node .claude/skills/cinecode/scripts/takes.mjs films/<slug> [--all]'); process.exit(2); }
const { loadPlan, resolveFilmDir } = await import(join(ROOT, 'engine/render/film-source.mjs'));
const { plan, voices, paths } = await loadPlan(resolveFilmDir(arg));

const seen = new Set();
let flagged = 0;
for (const l of plan.lines) {
  if (seen.has(l.id)) continue;
  seen.add(l.id);
  const v = voices.get(l.id), q = v?.qa ?? {}, metaPath = join(paths.voices, `${l.id}.json`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const flags = [];
  if (!v) flags.push('MISSING');
  else {
    if (q.pass === false) flags.push('FAIL');
    if (q.wer > 0.2) flags.push(`WER ${q.wer}`);
    if (q.directionSpoken) flags.push('DIRECTION');
    if (q.leading > 0) flags.push('LEADING');
  }
  if (flags.length) flagged++;
  if (!all && !flags.length && !l.nonverbal) continue;
  const asked = meta.prompt ?? `${l.speak ?? l.text}  (line tone: ${l.tone ?? '-'}; not voiced yet)`;
  console.log(`${flags.length ? '!' : ' '} ${l.id}  ${String(l.shot).padEnd(6)} ${String(l.who).padEnd(12)} ${v ? `${v.dur.toFixed(2)}s` : '  -  '}  ${flags.join(' ')}${l.nonverbal ? ' (non-verbal: heard should be empty or the sound itself)' : ''}`);
  console.log(`      asked: ${asked}`);
  if (v) console.log(`      heard: ${q.transcript ?? '(no transcript)'}`);
}
console.log(`${seen.size} lines, ${flagged} flagged. Redo a take: delete ${resolve(paths.voices)}/<id>.wav and <id>.json (or change the line's tone or text), then run voice again.`);
