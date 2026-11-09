// Print what `cinecode check` and `plan` don't: validation warnings (unknown fields, e.g. a typo that is silently
// ignored) and compile warnings (blocked routes, perch on a rig that can't, two-shots staged too far apart, an actor
// dwarfed by an anchor or a much bigger actor in "on").
//   node <skill>/scripts/warnings.mjs films/<slug>
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
if (!process.argv[2]) { console.error('usage: node <skill>/scripts/warnings.mjs films/<slug>'); process.exit(2); }
const { loadPlan, resolveFilmDir } = await import(join(ROOT, 'engine/render/film-source.mjs'));
const { film, plan } = await loadPlan(resolveFilmDir(process.argv[2]));
const all = [...(film.warnings ?? []).map(w => `check  ${w.message ?? w}`), ...(plan.warnings ?? []).map(w => `plan   ${w.message ?? w}`)];
console.log(all.length ? all.join('\n') : 'no warnings');
