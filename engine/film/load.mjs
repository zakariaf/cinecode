// loadFilm: read films/<slug>/film.json (or take a parsed object), load custom.mjs (rigs, kits, custom beats,
// overlays, sounds), resolve rigs and set kits, validate everything and either return the resolved film or throw
// a ValidationError listing every problem.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getRig, register, listRigs } from '../cast/index.mjs';
import { getKit, listKits, registerKit } from '../set/kits/index.mjs';
import { validateFilm } from './validate.mjs';

export class ValidationError extends Error {
  constructor(problems, warnings = []) {
    const list = problems.map(p => `  - ${typeof p === 'string' ? p : p.message}`).join('\n');
    super(`film.json has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${list}`);
    this.name = 'ValidationError';
    this.problems = problems;
    this.warnings = warnings;
  }
}

// Line and column of a JSON.parse error (Node reports "at position N" or "line L column C").
function jsonError(text, err, file) {
  const msg = String(err.message);
  let line, col;
  const lc = /line (\d+) column (\d+)/.exec(msg);
  if (lc) { line = +lc[1]; col = +lc[2]; }
  else {
    const m = /position (\d+)/.exec(msg);
    if (m) { const pos = +m[1], before = text.slice(0, pos); line = before.split('\n').length; col = pos - before.lastIndexOf('\n'); }
  }
  const where = line ? ` at line ${line}, column ${col}` : '';
  const src = line ? text.split('\n')[line - 1] ?? '' : '';
  const caret = line ? `\n      ${src.trim().slice(0, 120)}` : '';
  const reason = msg.replace(/^.*?JSON[^:]*:\s*/, '').replace(/\s*\(line \d+ column \d+\)|\s+in JSON at position \d+.*$/, '');
  return new ValidationError([{ path: basename(file), message: `${basename(file)}: invalid JSON${where}: ${reason}${caret}` }]);
}

/**
 * Load and validate a film.
 *   src: a film directory, a path to film.json, or an already parsed film object (opts.dir for custom.mjs)
 * → the film: the JSON fields unchanged plus { dir, slug, warnings, custom, resolved: { rigs, sets, kits } }
 *   resolved.rigs: castId → rig object; resolved.sets: setId → set instance (unbuilt; built lazily on draw)
 */
export async function loadFilm(src, opts = {}) {
  let json, dir = opts.dir ? resolve(opts.dir) : null, file = 'film.json';
  if (typeof src === 'string') {
    const p = resolve(src);
    file = existsSync(p) && statSync(p).isFile() ? p : join(p, 'film.json');
    dir = dirname(file);
    if (!existsSync(file)) throw new ValidationError([{ path: 'film.json', message: `film.json: not found at ${file}` }]);
    const text = readFileSync(file, 'utf8');
    try { json = JSON.parse(text); } catch (e) { throw jsonError(text, e, file); }
  } else if (src && typeof src === 'object') {
    json = structuredClone(src);
  } else throw new ValidationError([{ path: 'film', message: 'loadFilm: expected a film directory, a film.json path or a film object' }]);

  // custom.mjs: extra rigs, kits, custom beats, overlays (scene-long drawings) and sounds
  const problems = [], custom = { rigs: [], kits: {}, custom: {}, overlays: {}, sounds: {} };
  const customPath = opts.custom ?? (dir ? join(dir, 'custom.mjs') : null);
  if (customPath && existsSync(customPath)) {
    try {
      const m = await import(pathToFileURL(customPath).href);
      custom.rigs = Array.isArray(m.rigs) ? m.rigs : [];
      custom.kits = m.kits && typeof m.kits === 'object' ? m.kits : {};
      custom.custom = m.custom && typeof m.custom === 'object' ? m.custom : {};
      custom.overlays = m.overlays && typeof m.overlays === 'object' ? m.overlays : {};
      custom.sounds = m.sounds && typeof m.sounds === 'object' ? m.sounds : {};
      custom.module = m;
    } catch (e) { problems.push({ path: 'custom.mjs', message: `custom.mjs: failed to load: ${e.message}` }); }
  }
  custom.rigs.forEach((r, i) => { try { register(r); } catch (e) { problems.push({ path: `custom.mjs rigs[${i}]`, message: `custom.mjs rigs[${i}]: ${e.message}` }); } });
  for (const [name, fn] of Object.entries(custom.kits)) { try { registerKit(name, fn); } catch (e) { problems.push({ path: `custom.mjs kits.${name}`, message: `custom.mjs kits.${name}: ${e.message}` }); } }

  // set instances (validation needs their anchors and sky names)
  const kits = new Set(listKits()), sets = {};
  if (json && typeof json.sets === 'object' && json.sets) {
    for (const [id, s] of Object.entries(json.sets)) {
      if (!s || typeof s.kit !== 'string' || !kits.has(s.kit)) continue;
      try { sets[id] = getKit(s.kit)({ ...(s.params || {}) }); }
      catch (e) { problems.push({ path: `sets.${id}`, message: `sets.${id}: kit "${s.kit}" failed: ${e.message}` }); }
    }
  }
  const v = validateFilm(json, { getRig, rigKinds: listRigs(), kits, sets, custom: custom.custom, overlays: custom.overlays, sounds: custom.sounds });
  problems.push(...v.problems);
  if (problems.length) throw new ValidationError(problems, v.warnings);

  const rigs = {};
  for (const [id, c] of Object.entries(json.cast || {})) rigs[id] = getRig(c.rig);
  const film = { ...json, dir, slug: dir ? basename(dir) : (json.slug || 'film'), warnings: v.warnings, custom };
  Object.defineProperty(film, 'resolved', { value: { rigs, sets, kits: Object.fromEntries(Object.entries(json.sets).map(([id, s]) => [id, s.kit])) }, enumerable: false });
  return film;
}

export { validateFilm };
