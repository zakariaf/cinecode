// loadFilm: read films/<slug>/film.json (or take a parsed object), load the film's own code (project and film
// extensions, then custom.mjs: rigs, kits, custom beats, overlays, sounds), resolve rigs and set kits, validate
// everything and either return the resolved film or throw a ValidationError listing every problem.
//
// Film code reaches the engine as `cinecode/<name>` (package.json "exports": cinecode/lib, cinecode/rig, …) from
// wherever the film lives: importFilmCode() resolves that specifier as if it were imported from inside this
// package, so a film in another project shares the engine's module instances (one rig registry, one kit registry).
//
// Extensions (loadExtensions): a film folder and a project folder may hold rigs, kits and effects that load like
// the built-ins: `films/<slug>/{rigs,kits,effects}/*.mjs`, and `<project>/cinecode/{rigs,kits,effects}/*.mjs` for
// everything a project's films share (<project> = the nearest folder above the film with a cinecode/ folder holding
// one of those, searched up to the first folder with a .git). rigs/*.mjs default-export a rig (registered by its
// kind), kits/*.mjs a kit function (registered under the file name, like engine/set/kits/), effects/*.mjs any of
// custom.mjs's `custom`, `overlays` and `sounds`. Load order: project, film folder, custom.mjs; a later name wins.
// Built-in effects (engine/effects/) come first: a film gets the ones its film.json names. A rig, kit or effect of the
// film's or project's own named like a built-in one replaces it, and check says so (its file is listed with
// "replaces the built-in …", and film.warnings carries the same note).
import module from 'node:module';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getRig, register, listRigs, BUILTIN_RIGS } from '../cast/index.mjs';
import { getKit, listKits, registerKit, BUILTIN_KITS } from '../set/kits/index.mjs';
import { BUILTIN_EFFECTS } from '../effects/index.mjs';
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

const PKG_URL = new URL('../../package.json', import.meta.url).href;
const ownSpecifier = s => s === 'cinecode' || s.startsWith('cinecode/');
let hooked = false;
/** Import a film's own module (custom.mjs, an extension), with `cinecode/…` resolving to this engine. */
export async function importFilmCode(file) {
  if (!hooked) {
    hooked = true;
    if (typeof module.registerHooks === 'function') module.registerHooks({ resolve: (s, c, next) => next(s, ownSpecifier(s) ? { ...c, parentURL: PKG_URL } : c) });
    else module.register(`data:text/javascript,${encodeURIComponent(`export const resolve = (s, c, next) => next(s, s === 'cinecode' || s.startsWith('cinecode/') ? { ...c, parentURL: ${JSON.stringify(PKG_URL)} } : c);`)}`);
  }
  return import(pathToFileURL(file).href);
}

/** The project extensions folder (<project>/cinecode) for a film or working directory, or null. */
export function projectExtDir(from) {
  for (let d = resolve(from); ; d = dirname(d)) {
    const c = join(d, 'cinecode');
    if (['rigs', 'kits', 'effects'].some(k => existsSync(join(c, k)))) return c;
    if (existsSync(join(d, '.git')) || dirname(d) === d) return null;
  }
}

// What of a module's (or custom.mjs's) rigs, kits and effects carries the name of a built-in one: → ['rig "planet"', …]
function builtinNames({ rigs = [], kits = {}, custom = {}, overlays = {} }) {
  return [...rigs.filter(r => BUILTIN_RIGS.includes(r?.kind)).map(r => `rig "${r.kind}"`), ...Object.keys(kits).filter(n => BUILTIN_KITS.includes(n)).map(n => `kit "${n}"`),
    ...Object.keys(custom).filter(n => Object.hasOwn(BUILTIN_EFFECTS.custom, n)).map(n => `custom beat "${n}"`),
    ...Object.keys(overlays).filter(n => Object.hasOwn(BUILTIN_EFFECTS.overlays, n)).map(n => `overlay "${n}"`)];
}

/**
 * Load and register the extensions for a film folder (and its project), or for a working directory (the project's
 * only). → { rigs, kits, custom, overlays, sounds, files: [paths relative to `dir`], problems,
 *   replaced: [{ file, names: ['rig "planet"', …] }] (what a file defines in place of a built-in one) }
 */
export async function loadExtensions(dir, { film = true } = {}) {
  const out = { rigs: [], kits: {}, custom: {}, overlays: {}, sounds: {}, files: [], problems: [], replaced: [] };
  const roots = [projectExtDir(film ? dirname(resolve(dir)) : dir), film ? resolve(dir) : null].filter(Boolean);
  for (const root of [...new Set(roots)]) {
    for (const kind of ['rigs', 'kits', 'effects']) {
      const d = join(root, kind);
      if (!existsSync(d) || !statSync(d).isDirectory()) continue;
      for (const f of readdirSync(d).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort()) {
        const file = join(d, f), name = relative(root === resolve(dir) ? root : dirname(root), file);   // rigs/x.mjs, cinecode/rigs/x.mjs
        out.files.push(name);
        try {
          const m = await importFilmCode(file);
          if (kind === 'rigs') {
            const r = m.default;
            if (!r || typeof r.kind !== 'string' || typeof r.draw !== 'function') throw new Error('the default export must be a rig (a kind and a draw(); see makeRig in cinecode/rig)');
            register(r); out.rigs.push(r);
          } else if (kind === 'kits') {
            registerKit(basename(f, '.mjs'), m.default); out.kits[basename(f, '.mjs')] = m.default;
          } else {
            if (!m.custom && !m.overlays && !m.sounds) throw new Error('an effect file exports custom, overlays or sounds (like custom.mjs)');
            for (const k of ['custom', 'overlays', 'sounds']) Object.assign(out[k], m[k] || {});
          }
          const names = builtinNames(kind === 'rigs' ? { rigs: [m.default] } : kind === 'kits' ? { kits: { [basename(f, '.mjs')]: m.default } } : m);
          if (names.length) out.replaced.push({ file: name, names });
        } catch (e) { out.problems.push({ path: name, message: `${name}: ${e.message}` }); }
      }
    }
  }
  return out;
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

  // extensions (project, then film folder), then custom.mjs: extra rigs, kits, custom beats, overlays (scene-long
  // drawings) and sounds
  const ext = dir ? await loadExtensions(dir) : { rigs: [], kits: {}, custom: {}, overlays: {}, sounds: {}, files: [], problems: [], replaced: [] };
  const problems = [...ext.problems], custom = { rigs: [], kits: {}, custom: {}, overlays: {}, sounds: {}, files: ext.files };
  const customPath = opts.custom ?? (dir ? join(dir, 'custom.mjs') : null);
  if (customPath && existsSync(customPath)) {
    try {
      const m = await importFilmCode(customPath);
      custom.rigs = Array.isArray(m.rigs) ? m.rigs : [];
      custom.kits = m.kits && typeof m.kits === 'object' ? m.kits : {};
      custom.custom = m.custom && typeof m.custom === 'object' ? m.custom : {};
      custom.overlays = m.overlays && typeof m.overlays === 'object' ? m.overlays : {};
      custom.sounds = m.sounds && typeof m.sounds === 'object' ? m.sounds : {};
      custom.module = m;
      custom.files = [...ext.files, 'custom.mjs'];
    } catch (e) { problems.push({ path: 'custom.mjs', message: `custom.mjs: failed to load: ${e.message}` }); }
  }
  custom.rigs.forEach((r, i) => { try { register(r); } catch (e) { problems.push({ path: `custom.mjs rigs[${i}]`, message: `custom.mjs rigs[${i}]: ${e.message}` }); } });
  for (const [name, fn] of Object.entries(custom.kits)) { try { registerKit(name, fn); } catch (e) { problems.push({ path: `custom.mjs kits.${name}`, message: `custom.mjs kits.${name}: ${e.message}` }); } }
  const replaced = [...ext.replaced, ...(custom.module ? [{ file: 'custom.mjs', names: builtinNames(custom) }] : [])].filter(r => r.names.length);
  custom.rigs = [...ext.rigs, ...custom.rigs]; custom.kits = { ...ext.kits, ...custom.kits };
  for (const k of ['custom', 'overlays', 'sounds']) custom[k] = { ...ext[k], ...custom[k] };
  // the built-in effects film.json names, under the film's own (a name of its own replaces the built-in)
  for (const sc of Array.isArray(json?.scenes) ? json.scenes : []) {
    for (const o of Array.isArray(sc?.overlays) ? sc.overlays : []) {
      const n = typeof o === 'string' ? o : o?.name;
      if (typeof n === 'string' && !Object.hasOwn(custom.overlays, n) && Object.hasOwn(BUILTIN_EFFECTS.overlays, n)) custom.overlays[n] = BUILTIN_EFFECTS.overlays[n];
    }
    for (const sh of Array.isArray(sc?.shots) ? sc.shots : []) for (const b of Array.isArray(sh?.beats) ? sh.beats : []) {
      if (b?.do === 'custom' && typeof b.name === 'string' && !Object.hasOwn(custom.custom, b.name) && Object.hasOwn(BUILTIN_EFFECTS.custom, b.name)) custom.custom[b.name] = BUILTIN_EFFECTS.custom[b.name];
    }
  }
  // what replaces a built-in: noted on its file in the list check prints, and as a warning
  const notes = replaced.map(r => ({ path: r.file, message: `${r.file}: ${r.names.join(', ')} replace${r.names.length > 1 ? '' : 's'} the built-in one${r.names.length > 1 ? 's' : ''} of ${r.names.length > 1 ? 'those names' : 'that name'}` }));
  custom.files = custom.files.map(f => { const r = replaced.find(q => q.file === f); return r ? `${f} (replaces the built-in ${r.names.join(', ')})` : f; });

  // set instances (validation needs their anchors and sky names)
  const kits = new Set(listKits()), sets = {};
  if (json && typeof json.sets === 'object' && json.sets) {
    for (const [id, s] of Object.entries(json.sets)) {
      if (!s || typeof s.kit !== 'string' || !kits.has(s.kit)) continue;
      try { sets[id] = getKit(s.kit)({ ...(s.params || {}) }); sets[id].lineart = json.format?.style === 'lineart'; }
      catch (e) { problems.push({ path: `sets.${id}`, message: `sets.${id}: kit "${s.kit}" failed: ${e.message}` }); }
    }
  }
  const v = validateFilm(json, { getRig, rigKinds: listRigs(), kits, sets, custom: custom.custom, overlays: custom.overlays, sounds: custom.sounds });
  problems.push(...v.problems);
  if (problems.length) throw new ValidationError(problems, v.warnings);

  const rigs = {};
  for (const [id, c] of Object.entries(json.cast || {})) rigs[id] = getRig(c.rig);
  const film = { ...json, dir, slug: dir ? basename(dir) : (json.slug || 'film'), warnings: [...notes, ...v.warnings], custom };
  Object.defineProperty(film, 'resolved', { value: { rigs, sets, kits: Object.fromEntries(Object.entries(json.sets).map(([id, s]) => [id, s.kit])) }, enumerable: false });
  return film;
}

export { validateFilm };
