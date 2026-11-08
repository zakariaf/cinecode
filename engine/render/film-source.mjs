// A film as a frame source: load film.json, read cached voices, compile. Each render worker calls createSource()
// itself, so all workers build the identical plan without passing functions or audio between processes.
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export class MissingModuleError extends Error {}

/**
 * Import an engine module by repo-relative path, lazily. A clear error if that module doesn't exist yet;
 * any other failure (including a missing import *inside* it) propagates unchanged.
 */
export async function need(rel, what = rel) {
  const file = join(ROOT, rel);
  try { return await import(pathToFileURL(file).href); }
  catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(file)) throw new MissingModuleError(`${what} is not available: ${rel} is missing`);
    throw e;
  }
}

/** `films/<slug>`, a path, or a bare slug → the absolute film directory (must hold film.json). */
export function resolveFilmDir(arg, cwd = process.cwd()) {
  if (!arg) throw new Error('no film given (expected films/<slug>)');
  for (const d of [resolve(cwd, arg), resolve(cwd, 'films', arg), resolve(ROOT, 'films', arg)]) {
    if (existsSync(join(d, 'film.json'))) return d;
    if (existsSync(d) && statSync(d).isFile() && basename(d) === 'film.json') return resolve(d, '..');
  }
  throw new Error(`no film.json in ${resolve(cwd, arg)}`);
}

/** Every file a film reads or writes. */
export function filmPaths(dir) {
  const slug = basename(dir), out = join(dir, 'out');
  return {
    dir, slug, out, json: join(dir, 'film.json'), custom: join(dir, 'custom.mjs'), voices: join(dir, 'voices'),
    music: join(out, 'music.wav'), mix: join(out, 'mix.wav'), video: join(out, `${slug}.mp4`), srt: join(out, `${slug}.srt`),
    animatic: join(out, 'animatic.mp4'), sheet: join(out, 'sheet.jpg'),
  };
}

/**
 * Cached voices for every line of a plan, read through the voice module with no API key, so this never
 * touches the network. → { voices: Map lineId → { wav, dur, env, qa, … }, missing: [line + { reason }] }
 */
export async function loadVoiceCache(film, plan, cacheDir) {
  const V = await need('engine/audio/voice.mjs', 'the voice module');
  const voices = new Map(), missing = [], seen = new Set();
  for (const line of plan.lines || []) {
    if (seen.has(line.id)) continue;
    seen.add(line.id);
    try { voices.set(line.id, await V.voiceLine(V.resolveLine(film, line), { cacheDir, apiKey: '', fps: plan.fps })); }
    catch (e) { missing.push({ ...line, reason: e.message }); }
  }
  return { voices, missing };
}

/**
 * Load and compile a film with whatever voices are cached (lines without one keep their estimated length).
 * → { film, plan, voices, missing, paths }
 */
export async function loadPlan(filmDir) {
  const { loadFilm } = await need('engine/film/load.mjs', 'the film loader');
  const { compile } = await need('engine/film/compile.mjs', 'the film compiler');
  const paths = filmPaths(filmDir), film = await loadFilm(filmDir);
  const draft = await compile(film, {});
  const { voices, missing } = await loadVoiceCache(film, draft, paths.voices);
  const plan = voices.size ? await compile(film, { voices }) : draft;
  return { film, plan, voices, missing, paths };
}

/** Worker entry: { filmDir } → { plan, drawFrame }. */
export async function createSource({ filmDir }) {
  const { plan } = await loadPlan(filmDir);
  const { drawFrame } = await need('engine/film/frame.mjs', 'the frame renderer');
  return { plan, drawFrame };
}

export default createSource;
