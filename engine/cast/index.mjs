// The cast registry. Discovers every rig file in this directory (each *.mjs except the helpers), imports it and
// registers its default export. Other modules import rigs only through here.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodePath from 'node:path';
import { register, getRig, listRigs, requireRig, mixPose, idle, RIG_KINDS, EXPRESSIONS, FACES } from './rig.mjs';

const DIR = nodePath.dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['rig.mjs', 'index.mjs', 'sheet.mjs']);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.mjs') && !SKIP.has(f) && !f.startsWith('_')).sort();
for (const f of files) {
  const mod = await import(pathToFileURL(nodePath.join(DIR, f)).href);
  if (mod.default && typeof mod.default.draw === 'function') register(mod.default);
}
// The kinds of the rigs above (a film's or project's rig of the same kind replaces one: engine/film/load.mjs says so).
export const BUILTIN_RIGS = Object.freeze(listRigs());

export { register, getRig, listRigs, requireRig, mixPose, idle, RIG_KINDS, EXPRESSIONS, FACES };
