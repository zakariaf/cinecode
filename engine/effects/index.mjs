// The built-in effects registry. Every *.mjs file in this folder (except this one and helpers starting with "_")
// exports `custom` (custom beats) and/or `overlays`, exactly like a film's custom.mjs or a project's
// cinecode/effects/*.mjs. A film gets the built-ins its film.json names (engine/film/load.mjs), and a project's,
// film folder's or custom.mjs's effect of the same name replaces the built-in one.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

export const BUILTIN_EFFECTS = { custom: {}, overlays: {} };
const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'index.mjs' && !f.startsWith('_')).sort()) {
  const m = await import(pathToFileURL(join(dir, f)).href);
  if (!m.custom && !m.overlays) throw new Error(`engine/effects/${f}: an effect file exports custom and/or overlays`);
  for (const k of ['custom', 'overlays']) Object.assign(BUILTIN_EFFECTS[k], m[k] || {});
}
