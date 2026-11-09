// When every beat starts and ends, shot by shot, with the voiced line lengths: what `plan` doesn't print. Also each
// mark's film time (for `sheet.mjs --t=`), a move that runs on past its shot's cut (and into which shot), and two
// traps: a pose that starts while its actor is still moving (the move's end pose replaces it) and a gesture laid over
// a move (the legs keep the gait: a jump or a stamp doesn't show until the move ends).
//   node <skill>/scripts/timeline.mjs films/<slug> [shot ids…]
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const [film, ...only] = process.argv.slice(2);
if (!film) { console.error('usage: node <skill>/scripts/timeline.mjs films/<slug> [shot ids…]'); process.exit(2); }
const { loadPlan, resolveFilmDir } = await import(join(ROOT, 'engine/render/film-source.mjs'));
const { plan } = await loadPlan(resolveFilmDir(film));

const MOVES = new Set(['walk', 'run', 'hop', 'fly', 'enter', 'exit']), POSES = new Set(['pose', 'sit', 'stand', 'lie', 'sleep']);
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`, rel = (t, s) => `+${(t - s.t0).toFixed(2)}`;
const what = b => {
  if (b.say !== undefined) return `say ${b.say}${b.vo ? ' (vo)' : ''} "${String(b.text ?? '').slice(0, 48)}"`;
  if (b.do !== undefined) return [b.do, b.who, b.to !== undefined && `→ ${b.to}`, b.from !== undefined && `from ${b.from}`, b.name, b.pose, b.expr, b.face && `face ${b.face}`, b.wade && 'wading', b.height !== undefined && `height ${b.height}`].filter(Boolean).join(' ');
  for (const k of ['sfx', 'fx', 'title', 'mark']) if (b[k] !== undefined) return `${k} ${b[k]}${k === 'sfx' && b.params?.dur ? ` (sounds ${b.params.dur} s)` : ''}`;
  if (b.music !== undefined) return `music ${typeof b.music === 'string' ? `${b.music}${b.name ? ` ${b.name}` : ''}` : JSON.stringify(b.music)}`;
  if (b.wait !== undefined) return `wait ${b.wait}`;
  return JSON.stringify(b);
};
const shotOf = t => plan.shots.find(s => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6);

for (const sc of plan._scenes) {
  const moves = [];       // { who, t0, t1, kind } of this scene, carried across its cuts
  for (const s of sc.shots) for (const { beat: b, t0, t1 } of s.beats) if (MOVES.has(b.do) && t1 > t0 + 1e-3) moves.push({ who: b.who, t0, t1, kind: b.do });
  for (const s of sc.shots) {
    if (only.length && !only.includes(s.id)) continue;
    console.log(`${s.id}  ${fmt(s.t0)}–${fmt(s.t1)}  ${(s.t1 - s.t0).toFixed(2)} s${s.def.dur !== undefined ? ' (fixed dur)' : ''}`);
    for (const { beat: b, t0, t1 } of s.beats) {
      const span = t1 > t0 + 1e-3 ? `${rel(t0, s).padStart(6)}–${rel(t1, s).padEnd(7)} ${fmt(t0)}–${fmt(t1)}` : `${rel(t0, s).padStart(6)}         ${fmt(t0)}          `;
      const notes = [];
      if (t1 > s.t1 + 1e-3) { const n = shotOf(t1 - 1e-3); notes.push(n && n.scene === sc.id ? `runs on into ${n.id} (to ${rel(t1, n)})` : 'runs past the scene end'); }
      const mv = (POSES.has(b.do) || b.do === 'gesture' || (b.do === 'set' && b.pose)) && moves.find(m => m.who === b.who && t0 >= m.t0 - 1e-6 && t0 < m.t1 - 1e-3);
      if (mv) notes.push(b.do === 'gesture' ? `! during ${b.who}'s ${mv.kind} (until ${fmt(mv.t1)}): the legs keep the gait, a jump or stamp won't show` : `! during ${b.who}'s ${mv.kind} (until ${fmt(mv.t1)}): the move's end pose replaces it; start it after, or give the move "pose"`);
      console.log(`  ${span}  ${what(b)}${notes.length ? `   ${notes.join('; ')}` : ''}`);
    }
  }
}
const marks = Object.entries(plan.marks || {});
if (marks.length) console.log(`marks: ${marks.map(([k, t]) => `${k} ${fmt(t)} (${t.toFixed(2)} s)`).join(', ')}`);
