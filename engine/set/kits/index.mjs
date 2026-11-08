// The kit registry. Every *.mjs file in this folder (except this one) is a kit whose default export is
// (params) => set instance; it is registered under its file name. Films can add more with registerKit().
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';

const KITS = new Map();
export function registerKit(name, fn) {
  if (typeof fn !== 'function') throw new Error(`kit "${name}": expected a function (params) => set`);
  KITS.set(name, fn);
}
export function getKit(name) {
  const fn = KITS.get(name);
  if (!fn) throw new Error(`unknown set kit "${name}" (have: ${listKits().join(', ')})`);
  return fn;
}
export const listKits = () => [...KITS.keys()].sort();

const dir = dirname(fileURLToPath(import.meta.url));
// A kit file that fails to load does not take the others down: it is registered as a kit that rethrows
// its load error when someone actually uses it.
for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'index.mjs').sort()) {
  const name = basename(f, '.mjs');
  try {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    registerKit(name, mod.default);
  } catch (err) {
    registerKit(name, () => { throw new Error(`set kit "${name}" failed to load: ${err.message}`, { cause: err }); });
  }
}
