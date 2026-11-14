// A harder repeatability test than tools/determinism.mjs: many processes at once, all
// fighting for the one GPU, each rendering the same frames; count how many different
// answers come back.
//   node engine/scene3d/tools/stress.mjs engine/scene3d/scenes/zero.mjs 30,100,200,222 [processes=40] [at a time=8] [1280x720] [blur]
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const [sceneFile, list, total = '40', batch = '8', size = '1280x720', blur = 'shot'] = process.argv.slice(2);
const det = path.join(path.dirname(fileURLToPath(import.meta.url)), 'determinism.mjs');
const one = (order) => new Promise((res, rej) => execFile(process.execPath, [det, sceneFile, order, size, blur, 'child'], { encoding: 'utf8', maxBuffer: 1 << 24 }, (e, out) => (e ? rej(e) : res(JSON.parse(out.trim().split('\n').pop())))));
const frames = list.split(','), seen = new Map();
let done = 0;
while (done < Number(total)) {
  const n = Math.min(Number(batch), Number(total) - done), jobs = [];
  for (let i = 0; i < n; i++) jobs.push(one((done + i) % 2 ? [...frames].reverse().join(',') : frames.join(',')));   // every second process goes through the frames backwards
  for (const r of await Promise.all(jobs)) { const key = frames.map((f) => `${f}:${r[f].slice(0, 12)}`).join(' '); seen.set(key, (seen.get(key) ?? 0) + 1); }
  done += n;
}
console.log(`stress: ${total} processes, ${batch} at a time, frames ${list} at ${size}, blur ${blur} (half of the processes in reverse order)`);
for (const [k, n] of seen) console.log(`  ${n} processes gave  ${k}`);
console.log(seen.size === 1 ? 'RESULT: identical in every process.' : `RESULT: NOT identical (${seen.size} different answers).`);
process.exitCode = seen.size === 1 ? 0 : 1;
