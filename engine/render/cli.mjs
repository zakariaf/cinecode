// The cinecode command line: argument parsing (no dependencies), help, and every command.
// Engine modules are imported lazily inside each command, so `--help`, `new` and the render core work on their own.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { need, MissingModuleError, resolveFilmDir, filmPaths, loadPlan, loadVoiceCache } from './film-source.mjs';
import { fmtDur, progressLine, parseTime, clock } from './progress.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILM_SOURCE = fileURLToPath(new URL('./film-source.mjs', import.meta.url));

export class UsageError extends Error {}
export class CliError extends Error { constructor(message, exitCode = 1) { super(message); this.exitCode = exitCode; } }

// ───────────── argument parsing ─────────────

const coerce = {
  bool: v => v,
  string: v => v,
  int: (v, name) => { if (!/^\d+$/.test(v) || Number(v) < 1) throw new UsageError(`--${name} must be a positive integer, got "${v}"`); return Number(v); },
  number: (v, name) => { const n = Number(v); if (v === '' || !Number.isFinite(n)) throw new UsageError(`--${name} must be a number, got "${v}"`); return n; },
  time: (v, name) => { try { return parseTime(v); } catch { throw new UsageError(`--${name} must be a time in seconds or m:ss, got "${v}"`); } },
  times: (v, name) => String(v).split(',').filter(s => s.trim()).map(s => coerce.time(s, name)),
};

/**
 * Parse argv against an option spec { name: { type: 'bool'|'string'|'int'|'number'|'time'|'times', alias } }.
 * Accepts --name=value, --name value, --flag, --no-flag, -a value, -a=value, -avalue, and `--` to end options.
 * `--help` / `-h` are always accepted. → { _: [positionals], help?, ...options }; throws UsageError.
 */
export function parseArgs(argv, spec = {}) {
  const out = { _: [] }, aliases = { h: 'help' };
  const S = { help: { type: 'bool' }, ...spec };
  for (const [k, v] of Object.entries(spec)) if (v.alias) aliases[v.alias] = k;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    let name, val;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      [name, val] = eq > 0 ? [a.slice(2, eq), a.slice(eq + 1)] : [a.slice(2), undefined];
    } else if (/^-[A-Za-z]/.test(a)) {
      name = aliases[a[1]];
      if (!name) throw new UsageError(`unknown option -${a[1]}`);
      if (a.length > 2) val = a.slice(a[2] === '=' ? 3 : 2);
    } else { out._.push(a); continue; }
    let opt = S[name];
    if (!opt && name.startsWith('no-') && S[name.slice(3)]?.type === 'bool' && val === undefined) { out[name.slice(3)] = false; continue; }
    if (!opt) throw new UsageError(`unknown option --${name}`);
    if (opt.type === 'bool') {
      if (val === undefined) out[name] = true;
      else if (/^(true|1|yes)$/i.test(val)) out[name] = true;
      else if (/^(false|0|no)$/i.test(val)) out[name] = false;
      else throw new UsageError(`--${name} is a flag (no value), got "${val}"`);
      continue;
    }
    if (val === undefined) {
      if (i + 1 >= argv.length || /^--?[A-Za-z]/.test(argv[i + 1])) throw new UsageError(`--${name} needs a value`);
      val = argv[++i];
    }
    out[name] = coerce[opt.type](val, name);
  }
  return out;
}

// ───────────── output helpers ─────────────

const elapsed = t0 => (performance.now() - t0) / 1000;
const rel = (ctx, p) => { const r = relative(ctx.cwd, p); return r && !r.startsWith('..') ? r : p; };
function say(ctx, label, msg = '', secs) {
  const left = `${label.padEnd(8)} ${msg}`;
  ctx.out.write(secs == null ? `${left}\n` : `${left.padEnd(62)} ${fmtDur(secs).padStart(8)}\n`);
}
async function step(ctx, label, fn) {
  ctx.signal?.throwIfAborted();
  const t0 = performance.now(), r = await fn();
  say(ctx, label, typeof r === 'string' ? r : r?.msg ?? '', elapsed(t0));
  return r;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const names = list => list.flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean);

function filmDir(opts, ctx) {
  if (!opts._[0]) throw new UsageError('missing <film> (e.g. films/lantern)');
  try { return resolveFilmDir(opts._[0], ctx.cwd); } catch (e) { throw new CliError(e.message); }
}

/** The film, its plan with cached voices, and its paths; a note if some lines aren't voiced yet. */
async function planWithNote(dir, ctx, label = 'compile') {
  const r = await step(ctx, label, async () => {
    const p = await loadPlan(dir);
    const voiced = (p.plan.lines ?? []).filter(l => p.voices?.has(l.id)).length;   // missing is per unique line; a repeated line counts each time
    return { ...p, msg: `${clock(p.plan.duration)}, ${plural(p.plan.shots?.length ?? 0, 'shot')}, ${voiced}/${p.plan.lines?.length ?? 0} lines voiced` };
  });
  if (r.missing.length) say(ctx, '', `(${r.missing.length} line${r.missing.length > 1 ? 's' : ''} not voiced yet: timing uses estimates; run \`cinecode voice\`)`);
  return r;
}

/** Generate missing voices with Gemini TTS (cache-first), printing progress and QA. */
async function voiceFilm(film, plan, paths, ctx) {
  const { voiceLines } = await need('engine/audio/voice.mjs', 'the voice module');
  const voices = await voiceLines(film, plan, {
    cacheDir: paths.voices, apiKey: ctx.env.GEMINI_API_KEY,
    onProgress: p => ctx.err.isTTY && ctx.err.write(`\r\x1b[2Kvoice    ${p.done}/${p.total}  ${p.who ?? ''}${p.status ? ` (${p.status})` : ''}`),
  });
  if (ctx.err.isTTY) ctx.err.write('\r\x1b[2K');
  return voices;
}

// ───────────── commands ─────────────

function starterFilm(title) {
  return {
    title,
    logline: 'One sentence: who wants what, and what stands in the way.',
    format: { width: 1920, height: 1080, fps: 24, captions: 'dialogue' },
    titles: { open: { title, dur: 4 }, end: { lines: ['The End'], dur: 4 } },
    voices: {
      narrator: { voice: 'Sulafat', tone: 'warm, gentle storyteller' },
      hare: { voice: 'Puck', tone: 'bright, eager, a little boastful' },
    },
    cast: { hare: { rig: 'hare', name: 'Hare', voice: 'hare' } },
    sets: { meadow: { kit: 'meadow', params: {} } },
    scenes: [{
      id: 's01', set: 'meadow', time: 'morning', music: { mood: 'pastoral', intensity: 0.4 }, ambience: 'auto',
      actors: { hare: { at: 'x:1100', face: 'right', pose: 'stand' } },
      shots: [
        { id: 's01-01', camera: { size: 'establishing', move: 'push-in', angle: 'eye' },
          beats: [{ say: 'narrator', text: 'In a wide green meadow, there lived a hare.', tone: 'softly' }], hold: 0.6 },
        { id: 's01-02', camera: { size: 'full', on: ['hare'], move: 'track', angle: 'eye' },
          beats: [{ do: 'walk', who: 'hare', to: 'x:1500' }, { say: 'hare', text: 'What a morning for a run!', tone: 'cheerful', expr: 'happy' }], hold: 0.8 },
      ],
    }],
  };
}

async function cmdNew(opts, ctx) {
  const slug = opts._[0];
  if (!slug) throw new UsageError('missing <slug> (e.g. cinecode new lantern-moth)');
  const dir = slug.includes('/') ? resolve(ctx.cwd, slug) : resolve(ctx.cwd, 'films', slug);
  const json = join(dir, 'film.json');
  if (existsSync(json) && !opts.force) throw new CliError(`${rel(ctx, json)} already exists (use --force to overwrite)`);
  const title = opts.title || basename(dir).split(/[-_ ]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  mkdirSync(dir, { recursive: true });
  const tpl = join(ROOT, 'templates'), made = [];
  if (existsSync(join(tpl, 'film.json'))) {
    for (const f of readdirSync(tpl)) {
      const src = join(tpl, f), dst = join(dir, f);
      if (!statSync(src).isFile() || (existsSync(dst) && !opts.force)) continue;
      if (f === 'film.json') {
        const text = readFileSync(src, 'utf8');
        let data = null; try { data = JSON.parse(text); } catch { /* not plain JSON: copy as is */ }
        writeFileSync(dst, data ? `${JSON.stringify({ ...data, title }, null, 2)}\n` : text);
      } else copyFileSync(src, dst);
      made.push(f);
    }
    say(ctx, 'new', `${rel(ctx, dir)}/ from templates/ (${made.join(', ')})`);
  } else {
    writeFileSync(json, `${JSON.stringify(starterFilm(title), null, 2)}\n`);
    say(ctx, 'new', `${rel(ctx, json)} (minimal starter; no templates/film.json found)`);
  }
  say(ctx, 'next', `edit film.json, then: cinecode check ${rel(ctx, dir)}`);
}

async function cmdCheck(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { loadFilm } = await need('engine/film/load.mjs', 'the film loader');
  const film = await loadFilm(dir);
  const n = o => Object.keys(o || {}).length, shots = (film.scenes || []).reduce((s, sc) => s + (sc.shots?.length || 0), 0);
  say(ctx, 'check', `${film.title ?? basename(dir)}: valid`);
  say(ctx, '', `${plural(film.scenes?.length ?? 0, 'scene')}, ${plural(shots, 'shot')}, ${n(film.cast)} cast, ${plural(n(film.sets), 'set')}${existsSync(join(dir, 'custom.mjs')) ? ', custom.mjs' : ''}`);
}

async function cmdPlan(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { plan, missing } = await planWithNote(dir, ctx);
  const est = new Set(missing.map(l => l.id)), sceneSet = Object.fromEntries((plan.scenes || []).map(s => [s.id, s.set]));
  ctx.out.write(`\n${plan.title ?? ''} — ${clock(plan.duration)} · ${plural(plan.shots.length, 'shot')} · ${plural(plan.scenes?.length ?? 0, 'scene')} · ${plan.W}×${plan.H} @ ${plan.fps} fps\n\n`);
  ctx.out.write(`${'shot'.padEnd(10)}${'set'.padEnd(10)}${'size'.padEnd(14)}${'start'.padStart(8)}${'dur'.padStart(7)}   lines\n`);
  for (const s of plan.shots) {
    const setName = typeof s.set === 'string' ? s.set : s.set?.id ?? (typeof sceneSet[s.scene] === 'string' ? sceneSet[s.scene] : '');
    const lines = (plan.lines || []).filter(l => l.shot === s.id);
    const first = lines[0] ? `${est.has(lines[0].id) ? '~' : ''}${lines[0].who}: "${lines[0].text}"` : '';
    ctx.out.write(`${trunc(s.id, 9).padEnd(10)}${trunc(String(setName), 9).padEnd(10)}${trunc(String(s.size ?? ''), 13).padEnd(14)}${clock(s.t0).padStart(8)}${`${(s.t1 - s.t0).toFixed(1)}s`.padStart(7)}   ${trunc(first, 56)}${lines.length > 1 ? ` (+${lines.length - 1})` : ''}\n`);
  }
  ctx.out.write(`\n${plan.lines?.length ?? 0} lines (${missing.length} estimated, marked ~) · ${plan.sfx?.length ?? 0} sfx · ${(plan.music || []).filter(m => m.mood).length} music cues · ${plan.captions?.length ?? 0} captions\n`);
}

async function cmdVoice(opts, ctx) {
  const dir = filmDir(opts, ctx);
  if (!ctx.env.GEMINI_API_KEY) throw new CliError('voice needs GEMINI_API_KEY in the environment (cached voices are reused; only new lines are generated)');
  const { film, plan, missing, paths } = await planWithNote(dir, ctx);
  say(ctx, 'voice', `${plan.lines.length} lines, ${missing.length} to generate → ${rel(ctx, paths.voices)}/`);
  const voices = await step(ctx, 'voice', async () => {
    const v = await voiceFilm(film, plan, paths, ctx);
    return Object.assign(v, { msg: `${v.size} lines ready` });
  });
  let flagged = 0;
  const vm = await import('../audio/voice.mjs').catch(() => ({}));
  const pick = l => (typeof vm.voiceFor === 'function' ? vm.voiceFor(voices, l) : voices.get(l.id));   // each line's own cut
  for (const l of plan.lines) {
    const v = pick(l), wer = v?.qa?.wer;
    if (wer > 0.2) flagged++;
    ctx.out.write(`  ${wer > 0.2 ? '!' : ' '} ${l.id.slice(0, 10).padEnd(10)} ${String(l.who).padEnd(10)} ${v ? `${v.dur.toFixed(2)}s`.padStart(6) : '   –  '} ${wer != null ? `wer ${wer.toFixed(2)}` : '        '}  ${trunc(l.text, 60)}\n`);
  }
  if (flagged) say(ctx, 'qa', `${flagged} line${flagged > 1 ? 's' : ''} still above 20% word error after retries (marked !)`);
  const after = await loadVoiceCache(film, plan, paths.voices);
  if (after.missing.length) throw new CliError(`${after.missing.length} lines are still missing from ${rel(ctx, paths.voices)}/`);
}

async function cmdSheet(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { plan, paths } = await planWithNote(dir, ctx);
  const { drawFrame } = await need('engine/film/frame.mjs', 'the frame renderer');
  const { contactSheet } = await import('./sheet.mjs');
  const outPath = opts.out ? resolve(ctx.cwd, opts.out) : paths.sheet;
  await step(ctx, 'sheet', async () => {
    const r = await contactSheet({ plan, drawFrame, outPath, times: opts.t, cols: opts.cols ?? 4, tileW: opts.tile ?? 480,
      onProgress: (i, n) => ctx.err.isTTY && ctx.err.write(`\r\x1b[2Ksheet    ${i}/${n}`) });
    if (ctx.err.isTTY) ctx.err.write('\r\x1b[2K');
    return `${rel(ctx, r.path)} (${r.items.length} stills, ${r.width}×${r.height})`;
  });
}

async function cmdLint(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { plan, paths } = await planWithNote(dir, ctx);
  const { lintPlan, writeLintReport } = await need('engine/lint/lint.mjs', 'the lint module');
  const result = await step(ctx, 'lint', async () => {
    const r = lintPlan(plan, opts.step ? { step: opts.step } : {});
    mkdirSync(paths.out, { recursive: true });
    await writeLintReport(plan, r, paths.out);
    return { ...r, msg: `${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')} → ${rel(ctx, paths.out)}/lint.json, lint.jpg` };
  });
  for (const i of [...result.errors, ...result.warnings]) {
    ctx.out.write(`  ${i.severity === 'error' || result.errors.includes(i) ? 'error' : 'warn '}  ${String(i.rule).padEnd(17)} ${(i.shot ?? '').toString().padEnd(9)} ${Number.isFinite(i.t) ? clock(i.t).padStart(7) : '       '}  ${i.message}\n`);
  }
  if (result.errors.length) throw new CliError(`lint found ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`);
}

async function score(film, plan, paths, ctx) {
  const { scoreFilm } = await need('engine/audio/music.mjs', 'the music module');
  const { writeWav, SAMPLE_RATE } = await import('../audio/wav.mjs');
  return step(ctx, 'music', async () => {
    const music = await scoreFilm(plan, film.seed != null ? { seed: film.seed } : {});
    mkdirSync(paths.out, { recursive: true });
    writeWav(paths.music, [music.L, music.R], SAMPLE_RATE, 24);
    return { music, msg: `${rel(ctx, paths.music)} (${clock(music.L.length / SAMPLE_RATE)})` };
  });
}

async function mixdown(plan, voices, music, paths, ctx, film = null) {
  const { mixFilm, writeMaster } = await need('engine/audio/mix.mjs', 'the mixer');
  return step(ctx, 'mix', async () => {
    const mix = await mixFilm(plan, { voices, music, sounds: film?.custom?.sounds });   // plan.sounds wins when compile copied them
    const r = await writeMaster(paths.mix, mix);
    const lufs = r && Number.isFinite(r.lufs ?? r.integrated) ? `, ${(r.lufs ?? r.integrated).toFixed(1)} LUFS` : '';
    return `${rel(ctx, paths.mix)} (master${lufs})`;
  });
}

async function cmdMusic(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, paths } = await planWithNote(dir, ctx);
  await score(film, plan, paths, ctx);
}

async function cmdMix(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, voices, missing, paths } = await planWithNote(dir, ctx);
  if (missing.length) say(ctx, 'mix', `warning: mixing without ${missing.length} unvoiced line${missing.length > 1 ? 's' : ''}`);
  const { music } = await score(film, plan, paths, ctx);
  await mixdown(plan, voices, music, paths, ctx, film);
}

/** True when out/mix.wav exists and is newer than every file of the film (film.json, custom.mjs, fx/, voices/, …). */
function mixFresh(dir, paths) {
  if (!existsSync(paths.mix)) return false;
  const t = statSync(paths.mix).mtimeMs;
  const newer = d => readdirSync(d, { withFileTypes: true }).some(e => {
    const p = join(d, e.name);
    if (e.isDirectory()) return p !== paths.out && !e.name.startsWith('.') && newer(p);
    return e.isFile() && statSync(p).mtimeMs > t;
  });
  return !newer(dir);
}

function frameRange(opts, fps, ctx) {
  if (opts.from == null && opts.to == null) return null;
  const a = Math.round((opts.from ?? 0) * fps), b = opts.to == null ? Infinity : Math.round(opts.to * fps);
  if (b <= a) throw new UsageError('--to must be after --from');
  say(ctx, 'range', `${clock(a / fps)} → ${b === Infinity ? 'end' : clock(b / fps)}`);
  return [a, b];
}

async function video(ctx, label, args) {
  const { renderVideo } = await import('./video.mjs');
  const bar = progressLine(label, { stream: ctx.err });
  const t0 = performance.now();
  try {
    const r = await renderVideo({ ...args, signal: ctx.signal, onProgress: p => bar.update(p) });
    bar.done();
    const v = r.probe?.video, a = r.probe?.audio;
    const mb = statSync(r.path).size / 1048576;
    say(ctx, label, `${rel(ctx, r.path)}  ${r.frames} frames, ${plural(r.segments, 'job')}, ${mb.toFixed(1)} MB`, elapsed(t0));
    if (r.probe) say(ctx, 'verify', `${v.width}×${v.height} ${v.codec} ${v.frames} frames @ ${v.fps} fps, ${r.probe.duration.toFixed(3)} s${a ? `, ${a.codec} ${a.sampleRate / 1000} kHz` : ', no audio'}${r.probe.subtitles ? ', subtitles' : ''}`);
    return r;
  } catch (e) { bar.done(); throw e; }
}

async function cmdAnimatic(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, voices, missing, paths } = await planWithNote(dir, ctx);
  const { drawFrame } = await need('engine/film/frame.mjs', 'the frame renderer');
  const fps = 12, audio = paths.mix;
  if (mixFresh(dir, paths)) say(ctx, 'mix', `${rel(ctx, paths.mix)} is up to date`);
  else { // the preview always has sound: mix first (unvoiced lines are left out)
    if (missing.length) say(ctx, 'mix', `warning: mixing without ${missing.length} unvoiced line${missing.length > 1 ? 's' : ''}`);
    const { music } = await score(film, plan, paths, ctx);
    await mixdown(plan, voices, music, paths, ctx, film);
  }
  await video(ctx, 'animatic', {
    plan, drawFrame, workerModule: FILM_SOURCE, workerArgs: { filmDir: dir }, jobs: opts.jobs,
    outPath: opts.out ? resolve(ctx.cwd, opts.out) : paths.animatic, range: frameRange(opts, fps, ctx),
    width: Math.round(plan.W / 4) * 2, height: Math.round(plan.H / 4) * 2, fps,
    encoder: { crf: 23, preset: 'veryfast' }, audio,
  });
}

async function cmdRender(opts, ctx) {
  const dir = filmDir(opts, ctx);
  let { film, plan, voices, missing, paths } = await planWithNote(dir, ctx, 'load');
  if (missing.length) {
    if (!ctx.env.GEMINI_API_KEY) {
      const why = l => (l.reason && !/not in the cache/.test(l.reason) ? `  (${l.reason})` : '');
      const list = missing.slice(0, 5).map(l => `    ${l.id}  ${l.who}: "${trunc(l.text, 50)}"${why(l)}`).join('\n');
      throw new CliError(`${missing.length} line${missing.length > 1 ? 's have' : ' has'} no cached voice in ${rel(ctx, paths.voices)}/ and GEMINI_API_KEY is not set:\n${list}${missing.length > 5 ? `\n    … and ${missing.length - 5} more` : ''}\n  run \`cinecode voice ${rel(ctx, dir)}\` with GEMINI_API_KEY set, then render again`);
    }
    await step(ctx, 'voice', async () => { await voiceFilm(film, plan, paths, ctx); return `${missing.length} new lines → ${rel(ctx, paths.voices)}/`; });
    ({ film, plan, voices, missing, paths } = await planWithNote(dir, ctx));
    if (missing.length) throw new CliError(`${missing.length} lines still have no voice after generation`);
  } else say(ctx, 'voices', `${voices.size} cached`);
  const { music } = await score(film, plan, paths, ctx);
  await mixdown(plan, voices, music, paths, ctx);
  const { subtitleCues, toSrt } = await import('./srt.mjs');
  const cues = subtitleCues(plan);
  writeFileSync(paths.srt, toSrt(cues));
  say(ctx, 'srt', `${rel(ctx, paths.srt)} (${cues.length} cues)`);
  const { drawFrame } = await need('engine/film/frame.mjs', 'the frame renderer');
  const range = frameRange(opts, plan.fps, ctx);
  const outPath = opts.out ? resolve(ctx.cwd, opts.out) : range ? paths.video.replace(/\.mp4$/, `-${Math.round(range[0] / plan.fps)}s.mp4`) : paths.video;
  await video(ctx, 'render', {
    plan, drawFrame, workerModule: FILM_SOURCE, workerArgs: { filmDir: dir }, jobs: opts.jobs, outPath, range,
    encoder: { ...(opts.crf != null && { crf: opts.crf }), ...(opts.preset && { preset: opts.preset }) },
    audio: paths.mix, captions: cues, title: plan.title, keep: opts.keep,
  });
}

/** cast-sheet / set-sheet: an optional film first (to register its custom rigs and kits), then names. */
async function sheetTargets(opts, ctx) {
  let pos = names(opts._), dir = null;
  if (pos[0]) { try { dir = resolveFilmDir(pos[0], ctx.cwd); } catch { dir = null; } }
  if (dir) {
    const { loadFilm } = await need('engine/film/load.mjs', 'the film loader');
    await loadFilm(dir); pos = pos.slice(1);
  }
  return { list: pos, outDir: dir ? filmPaths(dir).out : resolve(ctx.cwd, 'out') };
}

async function cmdCastSheet(opts, ctx) {
  const { list, outDir } = await sheetTargets(opts, ctx);
  const { castSheet } = await need('engine/cast/sheet.mjs', 'the cast sheet');
  let kinds = list;
  if (!kinds.length) { const { listRigs } = await need('engine/cast/index.mjs', 'the rig registry'); kinds = listRigs().map(r => (typeof r === 'string' ? r : r.kind)); }
  const outPath = opts.out ? resolve(ctx.cwd, opts.out) : join(outDir, 'cast-sheet.jpg');
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  await step(ctx, 'cast', async () => { await castSheet(kinds, outPath); return `${rel(ctx, outPath)} (${kinds.join(', ')})`; });
}

async function cmdSetSheet(opts, ctx) {
  const { list, outDir } = await sheetTargets(opts, ctx);
  const { setSheet } = await need('engine/set/sheet.mjs', 'the set sheet');
  let kits = list;
  if (!kits.length) { const { listKits } = await need('engine/set/kits/index.mjs', 'the kit registry'); kits = listKits().map(k => (typeof k === 'string' ? k : k.id ?? k.name)); }
  const outPath = opts.out ? resolve(ctx.cwd, opts.out) : join(outDir, 'set-sheet.jpg');
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  await step(ctx, 'sets', async () => { await setSheet(kits, outPath); return `${rel(ctx, outPath)} (${kits.join(', ')})`; });
}

// ───────────── command table and help ─────────────

const JOBS = { type: 'int', alias: 'j', arg: 'N', desc: 'worker processes (default: CPUs − 1)' };
const OUT = { type: 'string', alias: 'o', arg: 'PATH', desc: 'output file instead of the default' };
const FROM = { type: 'time', arg: 'T', desc: 'start time (seconds or m:ss), for a partial render' };
const TO = { type: 'time', arg: 'T', desc: 'end time (seconds or m:ss), for a partial render' };

export const COMMANDS = {
  new: { args: '<slug>', summary: 'scaffold a film from templates/', run: cmdNew,
    detail: 'Creates films/<slug>/ (or the given path) with film.json from templates/, or a minimal valid starter.',
    options: { title: { type: 'string', arg: 'TEXT', desc: 'film title (default: from the slug)' }, force: { type: 'bool', desc: 'overwrite existing files' } } },
  check: { args: '<film>', summary: 'validate film.json (and custom.mjs)', run: cmdCheck, options: {} },
  plan: { args: '<film>', summary: 'compile and print the shot list with times and durations', run: cmdPlan, options: {},
    detail: 'Uses cached voices for line timing; unvoiced lines use an estimate (marked ~).' },
  voice: { args: '<film>', summary: 'generate/cache voices with QA (needs GEMINI_API_KEY)', run: cmdVoice, options: {},
    detail: 'Only lines missing from films/<slug>/voices/ are sent to Gemini TTS; each is transcribed and checked (WER).' },
  sheet: { args: '<film>', summary: 'contact sheet: one frame per shot, or the given times', run: cmdSheet,
    detail: 'Writes out/sheet.jpg: the middle frame of every shot (or each --t time), labelled with shot id, time and caption.',
    options: { t: { type: 'times', arg: 'T,T,…', desc: 'times to draw instead of one per shot (seconds or m:ss)' },
      cols: { type: 'int', arg: 'N', desc: 'columns (default 4)' }, tile: { type: 'int', arg: 'PX', desc: 'tile width in pixels (default 480)' }, out: OUT } },
  lint: { args: '<film>', summary: 'staging/editing checks → out/lint.json + out/lint.jpg; exit 1 on errors', run: cmdLint,
    options: { step: { type: 'number', arg: 'S', desc: 'sampling step in seconds (default 1/6)' } } },
  music: { args: '<film>', summary: 'compose the score → out/music.wav', run: cmdMusic, options: {} },
  mix: { args: '<film>', summary: 'mix dialogue, music, sfx, ambience → out/mix.wav', run: cmdMix, options: {},
    detail: 'Composes the score, mixes it under the cached dialogue with sfx and ambience, and masters to −16 LUFS.' },
  animatic: { args: '<film>', summary: 'fast low-res preview with sound → out/animatic.mp4', run: cmdAnimatic,
    detail: 'Half resolution, 12 fps, with sound: out/mix.wav, mixed first when it is missing or older than the film\'s files.',
    options: { jobs: JOBS, from: FROM, to: TO, out: OUT } },
  render: { args: '<film>', summary: 'final film → out/<slug>.mp4 + out/<slug>.srt', run: cmdRender,
    detail: 'voices (from cache) → compile → music → mix → master → parallel video (x264 crf 17, slow) → mux AAC 192k + soft subtitles → ffprobe check.',
    options: { jobs: JOBS, from: FROM, to: TO, out: OUT,
      crf: { type: 'int', arg: 'N', desc: 'x264 quality (default 17)' }, preset: { type: 'string', arg: 'NAME', desc: 'x264 preset (default slow)' },
      keep: { type: 'bool', desc: 'keep the per-worker segment files' } } },
  'cast-sheet': { args: '[film] [kinds…]', summary: 'every rig in every pose/expression → out/cast-sheet.jpg', run: cmdCastSheet,
    detail: 'With a film first, its custom rigs are included and the sheet goes to its out/. Kinds may be comma-separated.', options: { out: OUT } },
  'set-sheet': { args: '[film] [kits…]', summary: 'every kit with anchors, colliders and walk regions drawn → out/set-sheet.jpg', run: cmdSetSheet,
    detail: 'With a film first, its custom kits are included and the sheet goes to its out/. Kits may be comma-separated.', options: { out: OUT } },
};

export function helpText(cmd) {
  if (!cmd) {
    const w = Math.max(...Object.entries(COMMANDS).map(([k, c]) => `${k} ${c.args}`.length));
    return ['cinecode — storyboard JSON → painted, animated, scored and mixed film', '',
      'usage: cinecode <command> films/<slug> [options]', '', 'commands:',
      ...Object.entries(COMMANDS).map(([k, c]) => `  ${`${k} ${c.args}`.padEnd(w)}   ${c.summary}`), '',
      'Run `cinecode <command> --help` for a command\'s options. Only `voice` needs the network (GEMINI_API_KEY).', ''].join('\n');
  }
  const c = COMMANDS[cmd], opts = Object.entries(c.options || {});
  const flag = ([k, o]) => `${o.alias ? `-${o.alias}, ` : '    '}--${k}${o.type === 'bool' ? '' : `=${o.arg || 'V'}`}`;
  const w = Math.max(14, ...opts.map(o => flag(o).length));
  return [`usage: cinecode ${cmd} ${c.args}${opts.length ? ' [options]' : ''}`, '', `  ${c.summary}`, ...(c.detail ? ['', `  ${c.detail}`] : []), '',
    'options:', ...opts.map(o => `  ${flag(o).padEnd(w)}   ${o[1].desc}`), `  ${'-h, --help'.padEnd(w)}   show this help`, ''].join('\n');
}

const usageLine = cmd => `usage: cinecode ${cmd} ${COMMANDS[cmd].args}${Object.keys(COMMANDS[cmd].options || {}).length ? ' [options]' : ''}   (--help for details)\n`;
const suggest = cmd => Object.keys(COMMANDS).find(k => k.startsWith(cmd.slice(0, 2)));

/** Run the CLI. → exit code (0 ok, 1 failed, 2 usage error, 130 interrupted). */
export async function main(argv, io = {}) {
  const ctx = { out: io.out ?? process.stdout, err: io.err ?? process.stderr, cwd: io.cwd ?? process.cwd(), env: io.env ?? process.env };
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || (cmd === 'help' && !rest[0])) { ctx.out.write(helpText()); return cmd ? 0 : 2; }
  if (cmd === '--version' || cmd === '-v') { ctx.out.write(`${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}\n`); return 0; }
  if (cmd === 'help') {
    if (!COMMANDS[rest[0]]) { ctx.err.write(`cinecode: unknown command "${rest[0]}"\n`); return 2; }
    ctx.out.write(helpText(rest[0])); return 0;
  }
  const c = COMMANDS[cmd];
  if (!c) {
    const s = suggest(cmd);
    ctx.err.write(`cinecode: unknown command "${cmd}"${s ? ` (did you mean "${s}"?)` : ''}\nrun \`cinecode --help\` for the list of commands\n`);
    return 2;
  }
  let opts;
  try { opts = parseArgs(rest, c.options); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    ctx.err.write(`cinecode ${cmd}: ${e.message}\n${usageLine(cmd)}`); return 2;
  }
  if (opts.help) { ctx.out.write(helpText(cmd)); return 0; }

  const t0 = performance.now();
  // Ctrl-C: stop workers and encoders and clean up; a second Ctrl-C exits at once.
  const abort = new AbortController();
  ctx.signal = abort.signal;
  let interrupted = false;
  const onSigint = () => { if (interrupted) process.exit(130); interrupted = true; ctx.err.write('\ncinecode: stopping… (Ctrl-C again to force)\n'); abort.abort(new CliError('interrupted', 130)); };
  if (io.signals !== false) process.on('SIGINT', onSigint);
  try {
    await c.run(opts, ctx);
    ctx.out.write(`${cmd} done in ${fmtDur(elapsed(t0))}\n`);
    return 0;
  } catch (e) {
    if (interrupted) { ctx.err.write(`cinecode ${cmd}: interrupted after ${fmtDur(elapsed(t0))}\n`); return 130; }
    if (e instanceof UsageError) { ctx.err.write(`cinecode ${cmd}: ${e.message}\n${usageLine(cmd)}`); return 2; }
    const problems = e?.problems ?? e?.errors ?? e?.issues;
    if (e?.name === 'ValidationError' && Array.isArray(problems)) {
      ctx.err.write(`cinecode ${cmd}: film.json has ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n${problems.map(p => `  - ${typeof p === 'string' ? p : p.message ?? JSON.stringify(p)}`).join('\n')}\n`);
    } else if (e instanceof CliError || e instanceof MissingModuleError) {
      ctx.err.write(`cinecode ${cmd}: ${e.message}\n`);
    } else {
      ctx.err.write(`cinecode ${cmd}: ${ctx.env.CINECODE_DEBUG ? e?.stack ?? e : e?.message ?? e}\n`);
      if (ctx.env.CINECODE_DEBUG && e?.workerStack) ctx.err.write(`worker stack:\n${e.workerStack}\n`);
    }
    ctx.err.write(`${cmd} failed after ${fmtDur(elapsed(t0))}\n`);
    return e?.exitCode ?? 1;
  } finally {
    process.off('SIGINT', onSigint);
  }
}
