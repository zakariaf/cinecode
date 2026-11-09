// The score's level shot by shot, in short windows, and the quiet holes in it: stretches where a music cue is playing
// but almost nothing sounds (a cue that starts on a cut without "downbeat" can open with a near-silent lead-in; the
// last cue's final chord can die before the end card does). A mean over a whole shot hides a 1.5 s hole: this doesn't.
// Reads out/music.wav (or out/mix.wav), so run `cinecode music` (or `mix`) first. No ffmpeg, no network.
//   node .claude/skills/cinecode/scripts/levels.mjs films/<slug> [music|mix] [--win=0.5] [--quiet=-40]
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const [film, which = 'music'] = args.filter(a => !a.startsWith('--'));
if (!film || !['music', 'mix'].includes(which)) { console.error('usage: node .claude/skills/cinecode/scripts/levels.mjs films/<slug> [music|mix] [--win=0.5] [--quiet=-40]'); process.exit(2); }
const WIN = Number(opt('win') ?? 0.5), QUIET = Number(opt('quiet') ?? -40), END_FADE = 1.2;
const { loadPlan, resolveFilmDir } = await import(join(ROOT, 'engine/render/film-source.mjs'));
const { readWav } = await import(join(ROOT, 'engine/audio/wav.mjs'));
const { plan, paths } = await loadPlan(resolveFilmDir(film));
const file = paths[which];
if (!existsSync(file)) { console.error(`no ${file}: run \`node bin/cinecode.mjs ${which} ${film}\` first`); process.exit(1); }
if (statSync(file).mtimeMs < statSync(paths.json).mtimeMs) console.log(`(${which}.wav is older than film.json: run \`${which}\` again for current levels)`);

const { sampleRate: sr, channels: ch } = readWav(file);
const db = (t0, t1) => {
  let s = 0, n = 0;
  for (let i = Math.max(0, Math.floor(t0 * sr)), e = Math.min(ch[0].length, Math.floor(t1 * sr)); i < e; i++) for (const c of ch) { s += c[i] * c[i]; n++; }
  return n ? 10 * Math.log10(s / n + 1e-12) : -120;
};
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const cueAt = t => plan.music.find(m => m.mood && m.mood !== 'none' && t >= m.t0 && t < m.t1);
// every window, and the quiet runs inside a cue: 1 s or more (a shorter dip is a breath), or any that runs into the
// film's last END_FADE s (which fade to black anyway, so they are not judged)
const wins = [];
for (let t = 0; t + WIN / 2 < plan.duration; t += WIN) {
  const c = cueAt(t + WIN / 2), d = db(t, t + WIN);
  wins.push({ t, d, quiet: !!c && d < QUIET && t + WIN <= plan.duration - END_FADE + 1e-6 });
}
const holes = [];
for (const w of wins) {
  const h = holes[holes.length - 1];
  if (w.quiet) { if (h && Math.abs(h.t1 - w.t) < 1e-6) { h.t1 = w.t + WIN; h.min = Math.min(h.min, w.d); } else holes.push({ t0: w.t, t1: w.t + WIN, min: w.d }); }
}
for (let i = holes.length - 1; i >= 0; i--) if (holes[i].t1 - holes[i].t0 < 1 - 1e-6 && holes[i].t1 < plan.duration - END_FADE - WIN) holes.splice(i, 1);

const rows = [...(plan.cards || []).map(c => ({ id: c.kind === 'open' ? 'open' : 'end', t0: c.t0, t1: c.t1 })), ...plan.shots.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 }))].sort((a, b) => a.t0 - b.t0);
console.log(`${which}.wav in ${WIN} s windows: mean and quietest window per shot (dB RMS); "!" = quiet (under ${QUIET} dB) for 1 s or more while a cue plays`);
console.log('shot      start     mean   min    cue');
for (const r of rows) {
  const ws = wins.filter(w => w.t + WIN / 2 >= r.t0 && w.t + WIN / 2 < r.t1), min = ws.length ? Math.min(...ws.map(w => w.d)) : db(r.t0, r.t1);
  const hs = holes.filter(h => h.t0 < r.t1 && h.t1 > r.t0), c = cueAt((r.t0 + r.t1) / 2);
  console.log(`${String(r.id).padEnd(9)} ${fmt(r.t0).padStart(7)}  ${db(r.t0, r.t1).toFixed(0).padStart(5)}  ${min.toFixed(0).padStart(5)} ${hs.length ? '!' : ' '}  ${c ? c.mood : '-'}${hs.length ? `   quiet ${hs.map(h => `${fmt(Math.max(h.t0, r.t0))}–${fmt(Math.min(h.t1, r.t1))}`).join(', ')}` : ''}`);
}
console.log(holes.length
  ? `${holes.length} quiet stretch${holes.length > 1 ? 'es' : ''} under a cue. A cue that starts on a cut: give it "downbeat": true. The last cue dying under the end card: "hold": true. Then run music again.`
  : 'no quiet stretches under a cue');
