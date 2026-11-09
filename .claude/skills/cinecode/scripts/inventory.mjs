// Print the live cast and set inventory as Markdown: every registered rig (size, speeds, poses, gestures,
// expressions, params) and every kit (anchors with type, position and scale; props with their painted extent; ambience).
//   node .claude/skills/cinecode/scripts/inventory.mjs [cast|sets] [films/<slug>]
// With a film, its custom.mjs rigs and kits are registered first (loadFilm), so they are listed too.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = process.argv.slice(2), what = args.find(a => a === 'cast' || a === 'sets'), film = args.find(a => a !== what);
const imp = p => import(resolve(ROOT, p));
if (film) await (await imp('engine/film/load.mjs')).loadFilm(resolve(process.cwd(), film));

const LANE_S = 1.3, CROSS = 300;   // most kits put the main lane at scale ≈ 1.3
const out = [];

if (what !== 'sets') {
  const { listRigs, getRig } = await imp('engine/cast/index.mjs');
  out.push('## Rigs', '', `Speeds are units/s at scale 1. On screen an actor covers \`speed × s\` world px/s, where s = set.scaleAt(x, y) × cast \`scale\`. "${CROSS} px" = seconds to walk ${CROSS} world px at s ${LANE_S}.`, '');
  out.push('| rig | height | walk | fastest | ' + `${CROSS} px` + ' | can |', '|---|---|---|---|---|---|');
  const rigs = listRigs().map(r => (typeof r === 'string' ? getRig(r) : r));
  for (const r of rigs) {
    const [fast, v] = Object.entries(r.speeds || {}).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
    const can = [r.perch && 'perch', r.flies && 'fly', typeof r.mount === 'function' && 'carry a rider', r.lookTime && `look ${r.lookTime}s`].filter(Boolean).join(', ');
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

if (what !== 'cast') {
  const { listKits, getKit } = await imp('engine/set/kits/index.mjs');
  out.push('## Kits', '', 'Anchor types: ground (stand here), surface (stand on a prop top: walk there and the actor jumps up), perch (branch; perch rigs only), hollow (an opening in a prop: the actor jumps in and is drawn clipped to it, in front of a dark hole), view (a far landmark to frame or look at, not to stand on). s = actor scale there.', '');
  for (const k of listKits()) {
    const name = typeof k === 'string' ? k : k.id ?? k.name, S = getKit(name)({});
    const b = S.bounds, amb = S.ambience ?? S.def?.ambience ?? {};
    out.push(`### ${name}`, '', `${S.W}×${S.H} world px, camera centre x ${b.x0}–${b.x1}, horizon ${S.horizon}, ${S.groundAt(b.x0) != null ? 'ridge set (ground follows a slope: give x only)' : `lane y ${S.laneY}`}; ambience ${amb.day ?? '-'} / ${amb.night ?? '-'}.`, '');
    const props = S.props.filter(p => p.bounds).map(p => { const [x0, y0, x1, y1] = p.bounds.map(Math.round); return `${p.id}${p.solid ? '*' : ''} ${x0}–${x1} × ${y0}–${y1}`; });
    out.push(`Props (painted extent in world px, x0–x1 × y0–y1; * = solid: routes go round its foot): ${props.join(', ') || 'none'}.`, '');
    out.push('| anchor | type | x | y | s | surface |', '|---|---|---|---|---|---|');
    for (const a of S.anchors()) out.push(`| ${a.name} | ${a.type}${a.prop ? ` (${a.prop})` : ''} | ${Math.round(a.x)} | ${Math.round(a.y)} | ${a.s.toFixed(2)} | ${a.surface} |`);
    out.push('');
  }
}

process.stdout.write(`${out.join('\n')}\n`);
