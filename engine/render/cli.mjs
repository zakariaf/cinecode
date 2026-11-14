// The cinecode command line: argument parsing (no dependencies), help, and every command.
// Engine modules are imported lazily inside each command, so `--help`, `new` and the render core work on their own.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { need, MissingModuleError, resolveFilmDir, filmPaths, loadPlan, loadVoiceCache, is3d } from './film-source.mjs';
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

// Does the 3D engine find a GPU adapter? Asked in a fresh process, so its WebGPU library is never loaded into this one.
// → true, false (no adapter), null (the optional packages three / webgpu are not installed), or the error the GPU
// library stopped with (a string)
async function gpuAdapter() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "let h; try { import.meta.resolve('three'); h = await import('./engine/scene3d/host-node.mjs'); } catch (e) { if (e?.code === 'ERR_MODULE_NOT_FOUND' && /'(three|webgpu)'/.test(e.message)) process.exit(4); throw e; } process.exit((await h.hasAdapter()) ? 0 : 3);"], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (r.status === 0 || r.status === 3) return r.status === 0;
  if (r.status === 4) return null;
  return (r.stderr || '').split('\n').find(l => /^\w*Error\b.*:/.test(l))?.trim() || `the GPU check stopped (exit ${r.status ?? r.signal})`;
}
/** A 3D film can only be drawn with a GPU: say so plainly before anything is rendered. */
async function need3d(film, what) {
  if (!is3d(film)) return false;
  const gpu = await gpuAdapter();
  if (gpu === null) throw new CliError(`this film uses the 3D engine ("format": { "engine": "3d" }), which needs the optional packages three and webgpu: run \`npm install\` in ${ROOT}`);
  if (typeof gpu === 'string') throw new CliError(`this film uses the 3D engine ("format": { "engine": "3d" }), and the GPU could not be started: ${gpu}`);
  if (!gpu) throw new CliError(`this film uses the 3D engine ("format": { "engine": "3d" }), and no GPU was found on this machine to draw it with (${what} needs one; check, plan and lint do not)`);
  return true;
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

/** First run: Node, the canvas library (installed into cinecode's own folder when missing), ffmpeg, the Gemini key. */
async function cmdSetup(opts, ctx) {
  const { spawnSync } = await import('node:child_process');
  const row = (ok, label, msg) => ctx.out.write(`  ${ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'note'}  ${label.padEnd(10)} ${msg}\n`);
  const fails = [];
  const major = +process.versions.node.split('.')[0];
  row(major >= 20, 'node', major >= 20 ? `${process.version}` : `${process.version}: cinecode needs Node.js 20 or newer (https://nodejs.org)`);
  if (major < 20) fails.push('node');
  // a fresh process, so a failed import in this one is not cached
  const canvasOk = () => spawnSync(process.execPath, ['--input-type=module', '-e', "await import('@napi-rs/canvas')"], { cwd: ROOT, stdio: 'ignore' }).status === 0;
  let canvas = canvasOk();
  if (!canvas && !opts.check) {
    ctx.out.write(`  …     canvas     installing @napi-rs/canvas into ${ROOT} (npm install --omit=dev)\n`);
    const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.error || r.status !== 0) row(false, 'npm', r.error ? `npm is not on the PATH (${r.error.code}): install Node.js with npm, or run npm install in ${ROOT}` : (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' / '));
    canvas = canvasOk();
  }
  row(canvas, 'canvas', canvas ? '@napi-rs/canvas loads (drawing works)' : `@napi-rs/canvas is missing: run \`npm install --omit=dev\` in ${ROOT}`);
  if (!canvas) fails.push('canvas');
  const { hasFfmpeg } = await import('./ffmpeg.mjs');
  const ff = hasFfmpeg();
  row(ff || null, 'ffmpeg', ff ? 'ffmpeg and ffprobe found' : 'ffmpeg/ffprobe not on the PATH: check, plan, sheet and lint work; mix, animatic and render need them (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt install ffmpeg)');
  row(ctx.env.GEMINI_API_KEY ? true : null, 'voices', ctx.env.GEMINI_API_KEY ? 'GEMINI_API_KEY is set' : 'GEMINI_API_KEY is not set: only `voice` (and rendering unvoiced lines) needs it. Get a key at https://aistudio.google.com/apikey, export it in your shell profile and restart; never paste it into a chat');
  // 3D films ("format": { "engine": "3d" }) are drawn on the GPU by the Node host (engine/scene3d/host-node.mjs)
  const gpu = await gpuAdapter();
  row(gpu === true || null, '3d', gpu === true ? 'a GPU adapter was found: 3D films render on it (host: node)' : typeof gpu === 'string' ? `the GPU could not be started, so 3D films cannot be rendered: ${gpu}` : gpu === false ? 'no GPU adapter found: 3D films cannot be rendered on this machine (check, plan and lint of a 3D film still work; 2D films are not affected)' : `the optional packages three and webgpu are not installed: only 3D films need them (npm install in ${ROOT})`);
  row(null, 'films', `films live in films/<slug>/ under the folder you work in (cinecode new <slug>); rigs, kits and effects several films share go in cinecode/{rigs,kits,effects}/ at the project root`);
  // Claude Code sets CLAUDE_CODE_ENTRYPOINT: "cli" with a person at the keyboard; "sdk-cli" for `claude -p`, "sdk-ts" /
  // "sdk-py" for the SDKs, where no one can answer a question. The skill's checkpoint reads this row.
  const entry = ctx.env.CLAUDE_CODE_ENTRYPOINT;
  if (entry === 'cli') row(null, 'session', 'interactive: a person can answer the checkpoint');
  else if (entry) row(null, 'session', `nobody can answer questions in this run (Claude Code entry point "${entry}": claude -p or the SDK). Skip the checkpoint: decide yourself, work to the end, and list your choices in the report`);
  if (fails.length) throw new CliError(`setup: ${fails.join(' and ')} not ready`);
  say(ctx, 'setup', 'ready');
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
    // text templates keep their own layout; every {{title}} in them becomes the title (JSON-escaped in .json files)
    const fill = (f, text) => text.replaceAll('{{title}}', () => (f.endsWith('.json') ? JSON.stringify(title).slice(1, -1) : title));
    for (const f of readdirSync(tpl)) {
      const src = join(tpl, f), dst = join(dir, f);
      if (!statSync(src).isFile() || (existsSync(dst) && !opts.force)) continue;
      if (/\.(json|md|mjs|txt)$/.test(f)) writeFileSync(dst, fill(f, readFileSync(src, 'utf8')));
      else copyFileSync(src, dst);
      made.push(f);
    }
    say(ctx, 'new', `${rel(ctx, dir)}/ from templates/ (${made.join(', ')})`);
  } else {
    writeFileSync(json, `${JSON.stringify(starterFilm(title), null, 2)}\n`);
    say(ctx, 'new', `${rel(ctx, json)} (minimal starter; no templates/film.json found)`);
  }
  say(ctx, 'next', `${made.includes('screenplay.md') ? 'write screenplay.md, ' : ''}edit film.json, then: cinecode check ${rel(ctx, dir)}`);
}

async function cmdCheck(opts, ctx) {
  const dir = filmDir(opts, ctx);
  // the film is compiled too, for the warnings only the plan finds (a 3D film's actions are acted out as it is laid
  // out: one that cannot be played stops check here, with its shot and beat)
  const { film, plan } = await loadPlan(dir);
  const n = o => Object.keys(o || {}).length, shots = (film.scenes || []).reduce((s, sc) => s + (sc.shots?.length || 0), 0);
  say(ctx, 'check', `${film.title ?? basename(dir)}: valid`);
  say(ctx, '', `${plural(film.scenes?.length ?? 0, 'scene')}, ${plural(shots, 'shot')}, ${n(film.cast)} cast, ${plural(n(film.sets), 'set')}${(film.custom.files || []).map(f => `, ${f}`).join('')}`);
  const all = warnings(ctx, film, plan);
  if (opts.strict && all.length) throw new CliError(`${plural(all.length, 'warning')} (--strict makes them errors)`);
}

/** The film's warnings (fields it ignores, things that are probably mistakes) and the plan's, one a line; with `max`,
 *  their count and the first `max` of them. → the warnings */
function warnings(ctx, film, plan, max = Infinity) {
  const all = [...(film.warnings ?? []), ...(plan.warnings ?? [])].map(w => (typeof w === 'string' ? w : w.message));
  if (all.length > max) say(ctx, 'warnings', `${all.length}, the first ${max} below (cinecode check prints them all)`);
  for (const w of all.slice(0, max)) say(ctx, 'warning', w);
  return all;
}

async function cmdPlan(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, missing } = await planWithNote(dir, ctx);
  warnings(ctx, film, plan);
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
  const { film, plan, paths } = await planWithNote(dir, ctx);
  // (a 3D film's stills, plain or with its debug drawing, come from its own frame source)
  const src3d = (await need3d(film, 'a contact sheet')) ? await (await need('engine/scene3d/source.mjs', 'the 3D frame source')).createSource(plan) : null;
  const still3d = async (t, file) => { const c = await src3d.canvas(t, !!opts.debug); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, await c.encode(file.endsWith('.png') ? 'png' : 'jpeg', 90)); return file; };
  const { drawFrame, frameInfo } = await need('engine/film/frame.mjs', 'the frame renderer');
  const F = opts.shots || opts.frame || opts.debug ? await need('engine/film/sheet.mjs', 'the film sheet') : null;   // only these options use it
  const { contactSheet } = await import('./sheet.mjs');
  let times = opts.t ?? null;
  if (opts.shots) { try { times = [...(times || []), ...F.sheetTimes(plan, { shots: opts.shots })]; } catch (e) { throw new CliError(e.message); } }
  const outPath = opts.out ? resolve(ctx.cwd, opts.out) : opts.frame ? join(paths.out, 'frame.jpg') : paths.sheet;
  if (opts.frame) {                                     // full-size stills, one file per time
    const ts = times || [plan.duration / 2];
    await step(ctx, 'frame', async () => {
      const files = [];
      for (const [i, t] of ts.entries()) {
        const file = ts.length > 1 ? outPath.replace(/(\.\w+)$/, `-${i}$1`) : outPath;
        files.push(await (src3d ? still3d(t, file) : F.renderStill(plan, t, file, { debug: !!opts.debug })));
        await new Promise(setImmediate);   // (lets the frame's canvases be freed, as contactSheet does)
      }
      src3d?.close();
      return files.map(f => rel(ctx, f)).join(', ');
    });
    return;
  }
  const draw = opts.debug ? (c, p, t) => { drawFrame(c, p, t); F.drawOverlay(c, frameInfo(p, t), p.W, p.H); } : drawFrame;
  await step(ctx, 'sheet', async () => {
    const r = await contactSheet({ plan, drawFrame: draw, ...(src3d && { canvasAt: t => src3d.canvas(t, !!opts.debug) }), outPath, times, cols: opts.cols ?? 4, tileW: opts.tile ?? 480, ...(opts.debug ? { title: `${plan.title} (debug)` } : {}),
      onProgress: (i, n) => ctx.err.isTTY && ctx.err.write(`\r\x1b[2Ksheet    ${i}/${n}`) });
    src3d?.close();
    if (ctx.err.isTTY) ctx.err.write('\r\x1b[2K');
    return `${rel(ctx, r.path)} (${r.items.length} stills, ${r.width}×${r.height})`;
  });
}

async function cmdLint(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, paths } = await planWithNote(dir, ctx);
  const { lintPlan, writeLintReport } = await need('engine/lint/lint.mjs', 'the lint module');
  const result = await step(ctx, 'lint', async () => {
    if (is3d(film)) {   // the 3D engine's own checks, on the film built and posed with no GPU (no picture: lint.json only)
      const r = await (await need('engine/scene3d/lint.mjs', 'the 3D lint')).lintFilm(plan);
      mkdirSync(paths.out, { recursive: true });
      writeFileSync(join(paths.out, 'lint.json'), `${JSON.stringify({ film: plan.title, engine: '3d', errors: r.errors, warnings: r.warnings }, null, 2)}\n`);
      return { ...r, msg: `${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')} → ${rel(ctx, paths.out)}/lint.json` };
    }
    const r = lintPlan(plan, opts.step ? { step: opts.step } : {});
    mkdirSync(paths.out, { recursive: true });
    await writeLintReport(plan, r, paths.out);
    const kept = r.kept?.length ? ` (${r.kept.length} kept: allowed by their shots' "lint" blocks)` : '';
    return { ...r, msg: `${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')}${kept} → ${rel(ctx, paths.out)}/lint.json, lint.jpg` };
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
  const stamp = filmStamp(dir, paths);
  const { music } = await score(film, plan, paths, ctx);
  await mixdown(plan, voices, music, paths, ctx, film);
  writeFileSync(join(paths.out, SOUND_STAMP), stamp);   // (the same bytes render makes: render keeps them)
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

// --from / --to, widened to whole segments of the render (4 s, counted from the start), so a part rendered again is the
// very segments of the whole film's render and can be spliced into it
async function frameRange(opts, fps, ctx) {
  if (opts.from == null && opts.to == null) return null;
  const { segmentFrames } = await import('./video.mjs'), g = segmentFrames(fps);
  let a = Math.round((opts.from ?? 0) * fps), b = opts.to == null ? Infinity : Math.round(opts.to * fps);
  if (b <= a) throw new UsageError('--to must be after --from');
  a = Math.floor(a / g) * g; b = Math.ceil(b / g) * g;
  say(ctx, 'range', `${clock(a / fps)} → ${b === Infinity ? 'end' : clock(b / fps)}`);
  return [a, b];
}

// Render processes: as asked, or CPUs − 1; a 3D film is drawn by one GPU, one frame at a time, so it takes 1 (2 at
// most), each in a worker of its own (never in this process: the GPU's memory goes when the worker does).
const jobsFor = (three, opts) => (three ? Math.min(opts.jobs ?? 1, 2) : opts.jobs);

async function video(ctx, label, args) {
  const { renderVideo } = await import('./video.mjs');
  const bar = progressLine(label, { stream: ctx.err });
  const t0 = performance.now();
  try {
    const r = await renderVideo({ ...args, signal: ctx.signal, onProgress: p => bar.update(p) });
    bar.done();
    const v = r.probe?.video, a = r.probe?.audio;
    const mb = statSync(r.path).size / 1048576;
    say(ctx, label, `${rel(ctx, r.path)}  ${r.frames} frames, ${plural(r.jobs, 'job')}, ${mb.toFixed(1)} MB`, elapsed(t0));
    if (r.probe) say(ctx, 'verify', `${v.width}×${v.height} ${v.codec} ${v.frames} frames @ ${v.fps} fps, ${r.probe.duration.toFixed(3)} s${a ? `, ${a.codec} ${a.sampleRate / 1000} kHz` : ', no audio'}${r.probe.subtitles ? ', subtitles' : ''}`);
    return r;
  } catch (e) { bar.done(); throw e; }
}

async function cmdAnimatic(opts, ctx) {
  const dir = filmDir(opts, ctx);
  const { film, plan, voices, missing, paths } = await planWithNote(dir, ctx);
  warnings(ctx, film, plan, 3);
  const three = await need3d(film, 'an animatic');
  const { drawFrame } = three ? {} : await need('engine/film/frame.mjs', 'the frame renderer');
  const fps = 12, audio = paths.mix;
  if (mixFresh(dir, paths)) say(ctx, 'mix', `${rel(ctx, paths.mix)} is up to date`);
  else { // the preview always has sound: mix first (unvoiced lines are left out)
    if (missing.length) say(ctx, 'mix', `warning: mixing without ${missing.length} unvoiced line${missing.length > 1 ? 's' : ''}`);
    const { music } = await score(film, plan, paths, ctx);
    await mixdown(plan, voices, music, paths, ctx, film);
  }
  await video(ctx, 'animatic', {
    plan, drawFrame, workerModule: FILM_SOURCE, workerArgs: { filmDir: dir }, jobs: jobsFor(three, opts),
    outPath: opts.out ? resolve(ctx.cwd, opts.out) : paths.animatic, range: await frameRange(opts, fps, ctx),
    width: Math.round(plan.W / 4) * 2, height: Math.round(plan.H / 4) * 2, fps,
    encoder: { crf: 23, preset: 'veryfast' }, audio,
  });
}

async function cmdRender(opts, ctx) {
  const dir = filmDir(opts, ctx);
  let { film, plan, voices, missing, paths } = await planWithNote(dir, ctx, 'load');
  warnings(ctx, film, plan, 3);
  const three = await need3d(film, 'a render');
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
  const { subtitleCues, toSrt } = await import('./srt.mjs');
  const cues = subtitleCues(plan);
  mkdirSync(paths.out, { recursive: true });
  const { drawFrame } = three ? {} : await need('engine/film/frame.mjs', 'the frame renderer');
  // The music and the mix are made in a process of their own (sound.mjs: they hold the whole film's sound). A 3D film
  // draws its picture meanwhile (one GPU process leaves the CPU free) and waits for them only to mux; a 2D film's
  // workers take every core, so it waits for them first. A failed mix stops the picture, and the other way round.
  const { soundJob } = await import('./sound.mjs');
  const sound = new AbortController(), stop = () => sound.abort(ctx.signal.reason);
  ctx.signal?.addEventListener('abort', stop, { once: true });
  let failed = null;
  // (a film whose music and mix were made for these very files, its own and the engine's, keeps them: a range of a
  // 30-minute film took 6 minutes, nearly all of it the score and the mix again)
  const stamp = filmStamp(dir, paths), stampFile = join(paths.out, SOUND_STAMP);
  const fresh = existsSync(paths.mix) && existsSync(paths.music) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp;
  if (fresh) say(ctx, 'mix', `${rel(ctx, paths.mix)} and ${rel(ctx, paths.music)} are up to date`);
  const audio = fresh ? Promise.resolve(paths.mix) : soundJob(dir, m => {
    if (three && ctx.err.isTTY) ctx.err.write('\r\x1b[2K');   // (over the progress line)
    say(ctx, m.label, m.label === 'music' ? `${rel(ctx, m.path)} (${clock(m.dur)})` : `${rel(ctx, m.path)} (master${Number.isFinite(m.lufs) ? `, ${m.lufs.toFixed(1)} LUFS` : ''})`, m.secs);
  }, sound.signal).then(p => { writeFileSync(stampFile, stamp); return p; });
  audio.catch(e => { failed = e; sound.abort(e); });
  try {
    if (!three) await audio;
    writeFileSync(paths.srt, toSrt(cues));
    say(ctx, 'srt', `${rel(ctx, paths.srt)} (${cues.length} cues)`);
    const range = await frameRange(opts, plan.fps, ctx);
    const outPath = opts.out ? resolve(ctx.cwd, opts.out) : range ? paths.video.replace(/\.mp4$/, `-${Math.round(range[0] / plan.fps)}s.mp4`) : paths.video;
    await video({ ...ctx, signal: sound.signal }, 'render', {
      plan, drawFrame, workerModule: FILM_SOURCE, workerArgs: { filmDir: dir }, jobs: jobsFor(three, opts), outPath, range,
      // a part of the film is a check: x264 "medium" (a third less encoding, the same quality); the whole film "slow".
      // A 3D film's one GPU process draws faster than x264 "slow" on 2 threads encodes, so it gets more.
      encoder: { ...(opts.crf != null && { crf: opts.crf }), preset: opts.preset ?? (range ? 'medium' : 'slow'), ...(three && { threads: 8 }) },
      audio, captions: cues, title: plan.title, keep: opts.keep,
      // a render stopped part way picks up where it stopped (the film's and the engine's files name what it drew)
      resume: stamp,
    });
  } catch (e) { sound.abort(e); throw failed ?? e; }   // (the mix's own error, if it was the mix that failed)
  finally { ctx.signal?.removeEventListener('abort', stop); }
}

const SOUND_STAMP = '.sound.stamp';   // in out/: the filmStamp that out/music.wav and out/mix.wav were made for

/** Every file that changes what a film renders (its film.json, custom.mjs, fx/, voices/, …: not out/; and the engine's
 *  code), by name, size and time: a resumed render goes on only while this is unchanged. */
function filmStamp(dir, paths) {
  const files = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (p !== paths.out && !e.name.startsWith('.')) walk(p); } else if (e.isFile()) { const s = statSync(p); files.push([p, s.size, s.mtimeMs]); } } };
  walk(dir); walk(join(ROOT, 'engine'));
  return JSON.stringify(files.sort());
}

/** cast-sheet / set-sheet: an optional film first (to register its own rigs and kits), then names. Without a film,
 *  the project's shared extensions (cinecode/{rigs,kits}/ at or above the working directory) are registered. */
async function sheetTargets(opts, ctx) {
  let pos = names(opts._), dir = null;
  if (pos[0]) { try { dir = resolveFilmDir(pos[0], ctx.cwd); } catch { dir = null; } }
  const { loadFilm, loadExtensions } = await need('engine/film/load.mjs', 'the film loader');
  if (dir) { await loadFilm(dir); pos = pos.slice(1); }
  else {
    const ext = await loadExtensions(ctx.cwd, { film: false });
    if (ext.problems.length) throw new CliError(ext.problems.map(p => p.message).join('\n'));
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

// ───────────── verify: the gate for a rig, kit or effect built for a film ─────────────

function report(ctx, checks) {
  for (const c of checks) ctx.out.write(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(14)} ${c.detail}\n`);
}
async function gate(ctx, what, checks, review) {
  report(ctx, checks);
  let imgs = [];
  try { imgs = (await review()).filter(Boolean); } catch (e) { say(ctx, 'review', `could not draw the review images: ${e.message}`); }
  if (imgs.length) say(ctx, 'review', `${imgs.map(p => rel(ctx, p)).join(', ')}: look at every image before using it`);
  const bad = checks.filter(c => !c.ok);
  if (bad.length) throw new CliError(`${what}: ${plural(bad.length, 'check')} failed (${bad.map(c => c.name).join(', ')})`);
  say(ctx, 'verify', `${what}: all ${checks.length} checks pass`);
}
// A piece given as a file (imported like a film's own code) or by its registered name. → { mod, file, outDir }
async function piece(opts, ctx, folder) {
  const arg = opts._[0];
  if (!arg) throw new UsageError(`missing <file|name> (e.g. films/my-film/${folder}/thing.mjs)`);
  const { importFilmCode, loadExtensions } = await need('engine/film/load.mjs', 'the film loader');
  const file = resolve(ctx.cwd, arg);
  let r;
  if (existsSync(file) && statSync(file).isFile()) r = { mod: await importFilmCode(file), file, outDir: join(resolve(file, '..', '..'), 'out', 'verify') };
  else { await loadExtensions(ctx.cwd, { film: false }); r = { mod: null, file: null, outDir: resolve(ctx.cwd, 'out', 'verify') }; }
  if (opts.out) r.outDir = resolve(ctx.cwd, opts.out);
  return r;
}

async function cmdVerifyRig(opts, ctx) {
  const V = await need('engine/render/verify.mjs', 'the verify module');
  const { register, getRig } = await need('engine/cast/index.mjs', 'the rig registry');
  const { mod, file, outDir } = await piece(opts, ctx, 'rigs');
  const rig = mod ? mod.default : getRig(opts._[0]);
  if (!rig) throw new CliError(mod ? `${rel(ctx, file)}: no default export (export default makeRig({ … }))` : `no rig file or rig kind "${opts._[0]}"`);
  if (mod && typeof rig.draw === 'function' && typeof rig.kind === 'string') register(rig);
  const checks = await step(ctx, 'verify', async () => Object.assign(V.verifyRig(rig), { msg: `rig ${rig.kind ?? '?'}` }));
  await gate(ctx, `rig ${rig.kind}`, checks, () => V.rigReview(rig, outDir));
}

async function cmdVerifyKit(opts, ctx) {
  const V = await need('engine/render/verify.mjs', 'the verify module');
  const { registerKit, getKit, listKits } = await need('engine/set/kits/index.mjs', 'the kit registry');
  const { mod, file, outDir } = await piece(opts, ctx, 'kits');
  const name = file ? basename(file, '.mjs') : opts._[0];
  if (mod && typeof mod.default === 'function') registerKit(name, mod.default);
  if (!mod && !listKits().includes(name)) throw new CliError(`no kit file or kit name "${name}"`);
  const kit = mod ? mod.default : getKit(name);
  const checks = await step(ctx, 'verify', async () => Object.assign(V.verifyKit(kit, name), { msg: `kit ${name}` }));
  await gate(ctx, `kit ${name}`, checks, () => (checks[0].ok ? V.kitReview(name, outDir) : []));
}

async function cmdVerifyEffect(opts, ctx) {
  const dir = filmDir(opts, ctx), wanted = names(opts._.slice(1));
  const V = await need('engine/render/verify.mjs', 'the verify module');
  const { film, plan } = await planWithNote(dir, ctx);
  const checks = await step(ctx, 'verify', async () => Object.assign(await V.verifyEffects(film, plan, wanted), { msg: `${wanted.join(', ') || 'every custom effect'}` }));
  // a film-made sound (as verifyEffects made it) whose level below 20 Hz is near its whole band's: a rumble no speaker
  // plays, which still takes the master's headroom
  const { filt } = await need('engine/audio/sfx.mjs', 'the sound effects');
  for (const e of V.filmEffects(film, plan, wanted)) {
    const c = checks.find(k => k.name === `sound ${e.name}`);
    if (e.kind !== 'sound' || !c?.ok) continue;
    const x = e.def({ seed: 7, dur: 1.5, params: {} }), low = filt(filt(Float32Array.from(x), 'lp', 20, Math.SQRT1_2), 'lp', 20, Math.SQRT1_2);
    const energy = a => a.reduce((s, v) => s + v * v, 0), all = energy(x);
    if (!all) { Object.assign(c, { ok: false, detail: 'it is silent: every sample is 0' }); continue; }
    const db = 10 * Math.log10(energy(low) / all);
    if (db > -6) Object.assign(c, { ok: false, detail: `below 20 Hz it is only ${(-db).toFixed(1)} dB under its whole band: a rumble no speaker plays that takes the master's headroom; high-pass it at 20–25 Hz` });
    else c.detail += `, below 20 Hz ${(-db).toFixed(0)} dB under`;
  }
  const out = opts.out ? resolve(ctx.cwd, opts.out) : join(filmPaths(dir).out, 'verify', `effects${wanted.length ? `-${wanted.join('-')}` : ''}.jpg`);
  await gate(ctx, `effects of ${basename(dir)}`, checks, async () => [await V.effectReview(film, plan, wanted, out)]);
}

// ───────────── command table and help ─────────────

const JOBS = { type: 'int', alias: 'j', arg: 'N', desc: 'worker processes (default: CPUs − 1; a 3D film: 1, at most 2)' };
const OUT = { type: 'string', alias: 'o', arg: 'PATH', desc: 'output file instead of the default' };
const FROM = { type: 'time', arg: 'T', desc: 'start time (seconds or m:ss), for a partial render (down to a whole 4 s)' };
const TO = { type: 'time', arg: 'T', desc: 'end time (seconds or m:ss), for a partial render (up to a whole 4 s)' };

export const COMMANDS = {
  setup: { args: '', summary: 'first run: check Node, install the canvas library, check ffmpeg and the Gemini key', run: cmdSetup,
    detail: 'Checks Node.js (20 or newer), installs @napi-rs/canvas into cinecode\'s own folder when it is missing (npm install --omit=dev), and reports whether ffmpeg/ffprobe are on the PATH, GEMINI_API_KEY is set (never printing it) and a GPU adapter is there for 3D films. Exit 1 when drawing cannot work.',
    options: { check: { type: 'bool', desc: 'only report, install nothing' } } },
  new: { args: '<slug>', summary: 'scaffold a film from templates/', run: cmdNew,
    detail: 'Creates films/<slug>/ (or the given path) from templates/: a starter film.json, screenplay.md and custom.mjs, with {{title}} filled in. Without templates/film.json, writes a minimal valid starter.',
    options: { title: { type: 'string', arg: 'TEXT', desc: 'film title (default: from the slug)' }, force: { type: 'bool', desc: 'overwrite existing files' } } },
  check: { args: '<film>', summary: 'validate film.json (and custom.mjs), and print its warnings', run: cmdCheck,
    detail: 'Validates film.json and custom.mjs, compiles the film, and prints the warnings of both (an unknown field, a perch the rig cannot use, a beat drawn on past its shot…). Exit 1 on a problem; with --strict on a warning too.',
    options: { strict: { type: 'bool', desc: 'warnings are errors too (exit 1)' } } },
  plan: { args: '<film>', summary: 'compile and print the shot list with times and durations', run: cmdPlan, options: {},
    detail: 'Uses cached voices for line timing; unvoiced lines use an estimate (marked ~).' },
  voice: { args: '<film>', summary: 'generate/cache voices with QA (needs GEMINI_API_KEY)', run: cmdVoice, options: {},
    detail: 'Only lines missing from films/<slug>/voices/ are sent to Gemini TTS; each is transcribed and checked (WER).' },
  sheet: { args: '<film>', summary: 'contact sheet: one frame per shot, or the given times', run: cmdSheet,
    detail: 'Writes out/sheet.jpg: the middle frame of every shot (or each --t time / --shots point), labelled with shot id, time and caption. --shots=3.3@0.1,3.3@0.5 draws points inside shots (u 0..1, default 0.5): a strip of a move. --debug draws actor boxes, head boxes, contacts and the caption box. --frame writes full-size stills instead (out/frame.jpg, -0, -1… for several).',
    options: { t: { type: 'times', arg: 'T,T,…', desc: 'times to draw instead of one per shot (seconds or m:ss)' },
      shots: { type: 'string', arg: 'ID[@U],…', desc: 'shot ids to draw (each at its middle, or at u 0..1 with @u)' },
      debug: { type: 'bool', desc: 'draw the geometry overlay (boxes, contacts, caption box)' },
      frame: { type: 'bool', desc: 'full-size stills instead of a contact sheet' },
      cols: { type: 'int', arg: 'N', desc: 'columns (default 4)' }, tile: { type: 'int', arg: 'PX', desc: 'tile width in pixels (default 480)' }, out: OUT } },
  lint: { args: '<film>', summary: 'staging/editing checks → out/lint.json + out/lint.jpg; exit 1 on errors', run: cmdLint,
    detail: 'A 3D film ("format": { "engine": "3d" }) is checked by the 3D engine instead (slides, collisions, turns, pops, holds, reach, words over faces: docs/scene3d.md), with no GPU, and writes out/lint.json only; --step does not apply.',
    options: { step: { type: 'number', arg: 'S', desc: 'sampling step in seconds (default 1/6)' } } },
  music: { args: '<film>', summary: 'compose the score → out/music.wav', run: cmdMusic, options: {} },
  mix: { args: '<film>', summary: 'mix dialogue, music, sfx, ambience → out/mix.wav', run: cmdMix, options: {},
    detail: 'Composes the score, mixes it under the cached dialogue with sfx and ambience, and masters to −16 LUFS.' },
  animatic: { args: '<film>', summary: 'fast low-res preview with sound → out/animatic.mp4', run: cmdAnimatic,
    detail: 'Half resolution, 12 fps, with sound: out/mix.wav, mixed first when it is missing or older than the film\'s files.',
    options: { jobs: JOBS, from: FROM, to: TO, out: OUT } },
  render: { args: '<film>', summary: 'final film → out/<slug>.mp4 + out/<slug>.srt', run: cmdRender,
    detail: 'voices (from cache) → compile → music → mix → master (all kept while the film\'s and the engine\'s files are unchanged) → parallel video in 4 s segments (x264 crf 17, slow; medium for a part) → mux AAC 192k + soft subtitles → ffprobe check. A render stopped part way keeps its whole segments and goes on from them. --from/--to are widened to whole 4 s segments, so a part can be spliced into the whole film.',
    options: { jobs: JOBS, from: FROM, to: TO, out: OUT,
      crf: { type: 'int', arg: 'N', desc: 'x264 quality (default 17)' }, preset: { type: 'string', arg: 'NAME', desc: 'x264 preset (default slow; medium for a part, --from/--to)' },
      keep: { type: 'bool', desc: 'keep the segment files' } } },
  'cast-sheet': { args: '[film] [kinds…]', summary: 'every rig in every pose/expression → out/cast-sheet.jpg', run: cmdCastSheet,
    detail: 'With a film first, its custom rigs are included and the sheet goes to its out/. Kinds may be comma-separated.', options: { out: OUT } },
  'set-sheet': { args: '[film] [kits…]', summary: 'every kit with anchors, colliders and walk regions drawn → out/set-sheet.jpg', run: cmdSetSheet,
    detail: 'With a film first, its custom kits are included and the sheet goes to its out/. Kits may be comma-separated.', options: { out: OUT } },
  'verify-rig': { args: '<file|kind>', summary: 'the gate for a new rig: contract checks + review sheets; exit 1 on a failure', run: cmdVerifyRig,
    detail: 'Checks the rig file (or a registered kind): contract fields, size vs height, every state painted inside its bounds in both facings, nothing through the ground, face -1 mirrors face 1, deterministic, each expression/talk/blink changes the face, gaits loop and gestures return to their pose. Writes <folder>/out/verify/<kind>.jpg (cast sheet with bounds, head and mouth) and <kind>-lineup.jpg (beside hare, human, mouse).',
    options: { out: { ...OUT, arg: 'DIR', desc: 'folder for the review images' } } },
  'verify-kit': { args: '<file|name>', summary: 'the gate for a new set kit: contract checks + review sheets; exit 1 on a failure', run: cmdVerifyKit,
    detail: 'Checks the kit file (or a registered kit): at least 4 anchors with sane scales, ground anchors on walkable ground, every route between them clear, skies and ambience, area and parallax cover every camera, the ground line, every time of day painted (the eight, or the times the kit declares), each with a light, deterministic builds. Writes <folder>/out/verify/<name>.jpg (anchors, walk region, colliders) and <name>-times.jpg (its times of day: the eight, or its own).',
    options: { out: { ...OUT, arg: 'DIR', desc: 'folder for the review images' } } },
  'verify-effect': { args: '<film> [names…]', summary: 'the gate for a film\'s own effects: checks + a review strip; exit 1 on a failure', run: cmdVerifyEffect,
    detail: 'For each custom overlay and beat the film uses (or the names given): a known layer, frames identical in any drawing order, and it draws something; for each custom sound: finite, deterministic, peak under 1, and not mostly rumble below 20 Hz. Writes out/verify/effects.jpg: three frames from the first use of each.',
    options: { out: OUT } },
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
      for (const w of e.warnings ?? []) ctx.err.write(`  warning: ${typeof w === 'string' ? w : w.message}\n`);
    } else if (e?.code === 'ERR_MODULE_NOT_FOUND' && /@napi-rs\/canvas/.test(String(e.message))) {
      ctx.err.write(`cinecode ${cmd}: the drawing library @napi-rs/canvas is not installed: run \`cinecode setup\`\n`);
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
