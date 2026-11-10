// Print the live cast, set and effect inventory as Markdown: every registered rig (size, speeds, poses, gestures,
// expressions, params), every kit (anchors with type, position and scale; props with their painted extent; times;
// ambience) and every built-in effect (custom beat or overlay, its layer, and its file's own description).
//   node <skill>/scripts/inventory.mjs [cast|sets|effects] [films/<slug>]
// With a film, its own rigs and kits (custom.mjs, rigs/, kits/, the project's cinecode/) are registered first
// (loadFilm), so they are listed too, and its own effects are named.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = process.argv.slice(2), what = args.find(a => ['cast', 'sets', 'effects'].includes(a)), film = args.find(a => a !== what);
const imp = p => import(resolve(ROOT, p));
const loaded = film ? await (await imp('engine/film/load.mjs')).loadFilm(resolve(process.cwd(), film)) : null;

const LANE_S = 1.3, CROSS = 300;   // most kits put the main lane at scale ≈ 1.3
const out = [];

if (!what || what === 'cast') {
  const { listRigs, getRig } = await imp('engine/cast/index.mjs');
  out.push('## Rigs', '', `Speeds are units/s at scale 1. On screen an actor covers \`speed × s\` world px/s, where s = set.scaleAt(x, y) × cast \`scale\`. "${CROSS} px" = seconds to walk ${CROSS} world px at s ${LANE_S}.`, '');
  out.push('| rig | height | walk | fastest | ' + `${CROSS} px` + ' | can |', '|---|---|---|---|---|---|');
  const rigs = listRigs().map(r => (typeof r === 'string' ? getRig(r) : r));
  for (const r of rigs) {
    const [fast, v] = Object.entries(r.speeds || {}).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
    const faceless = typeof r.faceless === 'boolean' ? r.faceless : !(r.expressions || []).some(e => e !== 'neutral');
    const can = [r.perch && 'perch', r.flies && 'fly', typeof r.mount === 'function' && 'carry a rider', r.lookTime && `look ${r.lookTime}s`, faceless && 'no face'].filter(Boolean).join(', ');
    out.push(`| ${r.kind} | ${r.height} | ${r.speeds?.walk ?? '-'} | ${fast} ${v} | ${r.speeds?.walk ? (CROSS / (r.speeds.walk * LANE_S)).toFixed(1) : '-'} s | ${can || 'ground'} |`);
  }
  for (const r of rigs) {
    out.push('', `### ${r.kind}`, '',
      `- poses: ${Object.keys(r.poses || {}).join(', ')}`,
      `- gaits: ${Object.keys(r.gaits || {}).join(', ')}`,
      `- gestures: ${Object.keys(r.gestures || {}).join(', ')}`,
      `- expressions: ${(r.expressions || []).join(', ')}`,
      `- params: ${Object.keys(r.params || {}).join(', ')}`);
  }
  out.push('');
}

if (!what || what === 'sets') {
  const { listKits, getKit } = await imp('engine/set/kits/index.mjs');
  out.push('## Kits', '', 'Anchor types: ground (stand here), surface (stand on a prop top: walk there and the actor jumps up), perch (branch; perch rigs only), hollow (an opening in a prop: the actor jumps in and is drawn clipped to it, in front of a dark hole), view (a far landmark to frame or look at, not to stand on). s = actor scale there.', '');
  for (const k of listKits()) {
    const name = typeof k === 'string' ? k : k.id ?? k.name, S = getKit(name)({});
    const b = S.bounds, amb = S.ambience ?? S.def?.ambience ?? {};
    const times = S.def.times ? `its own times: ${S.skyNames.join(', ')} (default ${S.defaultSky})` : `Earth's eight times (default ${S.defaultSky})`;
    const extra = [S.def.groundShadows === false && 'no ground, so no shadows', S.def.lens && `lens ${S.lens}`].filter(Boolean);
    out.push(`### ${name}`, '', `${S.W}×${S.H} world px, camera centre x ${b.x0}–${b.x1}, horizon ${S.horizon}, ${S.groundAt(b.x0) != null ? 'ridge set (ground follows a slope: give x only)' : `lane y ${S.laneY}`}; ${times}${extra.map(e => `; ${e}`).join('')}; ambience ${amb.day ?? '-'} / ${amb.night ?? '-'}.`, '');
    const props = S.props.filter(p => p.bounds).map(p => { const [x0, y0, x1, y1] = p.bounds.map(Math.round); return `${p.id}${p.solid ? '*' : ''} ${x0}–${x1} × ${y0}–${y1}`; });
    out.push(`Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): ${props.join(', ') || 'none'}.`, '');
    out.push('| anchor | type | x | y | s | surface |', '|---|---|---|---|---|---|');
    for (const a of S.anchors()) out.push(`| ${a.name} | ${a.type}${a.prop ? ` (${a.prop})` : ''}${a.z ? `, z ${a.z}` : ''} | ${Math.round(a.x)} | ${Math.round(a.y)} | ${a.s.toFixed(2)} | ${a.surface} |`);
    out.push('');
  }
}

if (!what || what === 'effects') {
  // each built-in effect file's own description: its leading comment, as paragraphs (a blank comment line, or a line
  // that starts "Beat params:", "Params:", "Layer …", "Sounds:", starts a new one)
  const dir = join(ROOT, 'engine/effects'), lead = /^(?:[A-Z][a-z]+ params|Params|Sounds|Layer)\b/;
  const header = f => {
    const paras = [[]];
    for (const l of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!l.startsWith('//')) break;
      const t = l.replace(/^\/\/ ?/, '').trim();
      if (!t || lead.test(t)) paras.push([]);
      if (t) paras[paras.length - 1].push(t);
    }
    return paras.filter(p => p.length).map(p => p.join(' '));
  };
  out.push('## Effects', '', 'Built in (`engine/effects/`): name one in film.json and the film gets it, as a custom beat (`{ "do": "custom", "name": … }`) or a scene overlay (`"overlays": [{ "name": …, "params": { … } }]`). Every field of the beat (or the overlay\'s `params`) arrives as its params. A film\'s or project\'s own effect of the same name replaces the built-in one (`check` says so).', '');
  out.push('| effect | as | layer |', '|---|---|---|');
  const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'index.mjs' && !f.startsWith('_')).sort(), list = [];
  for (const f of files) {
    const m = await import(pathToFileURL(join(dir, f)).href);
    for (const [kind, as] of [['custom', 'custom beat'], ['overlays', 'overlay']]) for (const [n, d] of Object.entries(m[kind] || {})) list.push({ n, as, layer: d.layer || 'world', f });
  }
  const byName = [...new Set(list.map(e => e.n))].sort();
  for (const n of byName) { const es = list.filter(e => e.n === n); out.push(`| ${n} | ${es.map(e => e.as).join(', ')} | ${[...new Set(es.map(e => e.layer))].join(', ')} |`); }
  for (const f of files) out.push('', `### ${[...new Set(list.filter(e => e.f === f).map(e => e.n))].join(', ')}`, '', ...header(f).flatMap((p, i) => (i ? ['', p] : [p])));
  if (loaded) {
    const own = [...Object.keys(loaded.custom?.custom || {}).map(n => `${n} (custom beat)`), ...Object.keys(loaded.custom?.overlays || {}).map(n => `${n} (overlay)`)];
    out.push('', `This film's effects (its own and the built-ins it names): ${own.join(', ') || 'none'}.`);
  }
  out.push('');
}

process.stdout.write(`${out.join('\n')}\n`);
