// Audit a film's cached voice takes: for every line, what was asked, what the QA transcription heard, and the flags
// that mean "regenerate this take". Reads only the cache (no network, no API key).
//   node .claude/skills/cinecode/scripts/takes.mjs films/<slug> [--all]
// Flags: MISSING (not voiced yet), FAIL (QA never passed), WER (word error > 0.2), DIRECTION (the bracketed tone was
// read aloud), LEADING (words inserted before the line, e.g. "Huh, then…"), TONE-CUT (earlier tries read the tone
// aloud, so the take kept was sent with less of it, or none: its words pass, but its delivery may not be the one asked
// for). Non-verbal lines ([laughs]) have no word gate: their transcript should be empty or the sound itself ("ha ha");
// real words ("Oh", "Giggling") mean redo. Without --all only flagged and non-verbal lines are printed; --all prints
// every line, so you can read what was heard for each take. Under each take: its length against the estimate `plan`
// used before it was voiced (a slow voice or a sentence break can double it) and any pause of 0.35 s or more inside it.
// It also lists unused takes: cache files no line of film.json uses any more (left behind when a line's text, tone or
// voice changed). They are never rendered; deleting them is safe.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = process.argv.slice(2), all = args.includes('--all'), arg = args.find(a => !a.startsWith('--'));
if (!arg) { console.error('usage: node .claude/skills/cinecode/scripts/takes.mjs films/<slug> [--all]'); process.exit(2); }
const { loadPlan, resolveFilmDir } = await import(join(ROOT, 'engine/render/film-source.mjs'));
const { estimateLine } = await import(join(ROOT, 'engine/film/compile.mjs'));
// pauses inside a take: runs of 20 ms frames more than 30 dB under its loudest, between its first and last sound
const pauses = (x, sr) => {
  const F = Math.max(1, Math.round(sr * 0.02)), d = [];
  for (let i = 0; i + F <= x.length; i += F) { let e = 0; for (let k = i; k < i + F; k++) e += x[k] * x[k]; d.push(10 * Math.log10(e / F + 1e-12)); }
  const top = Math.max(...d), on = d.map(v => v > top - 30), out = [];
  for (let i = on.indexOf(true), run = 0; i >= 0 && i <= on.lastIndexOf(true); i++) {
    if (!on[i]) run++; else { if (run * 0.02 >= 0.35) out.push({ at: (i - run) * 0.02, len: run * 0.02 }); run = 0; }
  }
  return out;
};
const { plan, voices, paths } = await loadPlan(resolveFilmDir(arg));

const seen = new Set();
let flagged = 0;
for (const l of plan.lines) {
  if (seen.has(l.id)) continue;
  seen.add(l.id);
  const v = voices.get(l.id), q = v?.qa ?? {}, metaPath = join(paths.voices, `${l.id}.json`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const tries = q.takes ?? [], kept = tries.find(k => k.attempt === q.take), cut = q.take > 1 && kept && kept.direction !== tries[0]?.direction;
  const flags = [];
  if (!v) flags.push('MISSING');
  else {
    if (q.pass === false) flags.push('FAIL');
    if (q.wer > 0.2) flags.push(`WER ${q.wer}`);
    if (q.directionSpoken) flags.push('DIRECTION');
    if (q.leading > 0) flags.push('LEADING');
    if (cut) flags.push('TONE-CUT');
  }
  if (flags.length) flagged++;
  if (!all && !flags.length && !l.nonverbal) continue;
  const asked = meta.prompt ?? `${l.speak ?? l.text}  (line tone: ${l.tone ?? '-'}; not voiced yet)`;
  console.log(`${flags.length ? '!' : ' '} ${l.id}  ${String(l.shot).padEnd(6)} ${String(l.who).padEnd(12)} ${v ? `${v.dur.toFixed(2)}s` : '  -  '}  ${flags.join(' ')}${l.nonverbal ? ' (non-verbal: heard should be empty or the sound itself)' : ''}`);
  console.log(`      asked: ${asked}`);
  if (v) console.log(`      heard: ${q.transcript ?? '(no transcript)'}`);
  if (v?.wav?.length && !l.nonverbal) {
    const est = estimateLine(l.speak ?? l.text), ps = pauses(v.wav, v.sampleRate);
    console.log(`      length ${v.dur.toFixed(2)} s (estimate ${est.toFixed(2)} s${v.dur > 1.5 * est ? `, ${(v.dur / est).toFixed(1)}×` : ''})${ps.length ? `; pause${ps.length > 1 ? 's' : ''} ${ps.map(p => `${p.len.toFixed(2)} s at ${p.at.toFixed(2)} s`).join(', ')}` : ''}`);
  }
  if (cut) console.log(`      kept take ${q.take} of ${tries.length}, sent with ${kept.direction ? `only "${kept.direction}"` : 'no direction'} instead of "${tries[0].direction}": listen to it, or give the line a tone that isn't read aloud`);
  if (flags.length && tries.length > 1) for (const k of tries) console.log(`      try ${k.attempt} [${k.direction}]: ${k.transcript ?? k.error ?? '(no transcript)'}`);
}
console.log(`${seen.size} lines, ${flagged} flagged. Redo a take: delete ${resolve(paths.voices)}/<id>.wav and <id>.json (or change the line's tone or text), then run voice again.`);

const unused = existsSync(paths.voices) ? readdirSync(paths.voices).filter(f => f.endsWith('.json') && !seen.has(f.slice(0, -5))).map(f => f.slice(0, -5)).sort() : [];
if (unused.length) {
  const rel = p => relative(process.cwd(), p) || '.';
  console.log(`${unused.length} unused take${unused.length > 1 ? 's' : ''} (no line uses ${unused.length > 1 ? 'them' : 'it'} any more; safe to delete): ${unused.join(', ')}`);
  console.log(`  rm ${unused.map(id => `${rel(join(paths.voices, id))}.wav ${rel(join(paths.voices, id))}.json`).join(' ')}`);
}
