// The music and the mix of a render, made in a process of their own. A film's score and mix are whole-film buffers
// (a 10-minute film's mix peaks at about 4.4 GB while it is made): made here, the render process, which lives for the
// whole render, never holds them, and a 3D film's picture is drawn meanwhile. The steps and the bytes are those of
// `cinecode music` and `mix`.
//
// parent → { filmDir }   child → { label: 'music', path, dur, secs } · { label: 'mix', path, lufs, secs } · { error, stack }
import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { need, loadPlan } from './film-source.mjs';

const SELF = fileURLToPath(import.meta.url);

/** Score and mix the film in a child process; onStep(message) as each step ends. → a promise of the mix's path. */
export function soundJob(filmDir, onStep, signal) {
  return new Promise((resolve, reject) => {
    const k = fork(SELF, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], serialization: 'advanced' });
    let mix = null, err = null;
    k.on('message', m => { if (m.error) err = Object.assign(new Error(m.error), { workerStack: m.stack }); else { onStep(m); if (m.label === 'mix') mix = m.path; } });
    k.on('error', reject);
    k.on('close', (code, sig) => (mix ? resolve(mix) : reject(err ?? new Error(`the music and mix process exited with ${sig || code}`))));
    signal?.addEventListener('abort', () => k.kill('SIGKILL'), { once: true });
    k.send({ filmDir });
  });
}

async function run({ filmDir }) {
  const { film, plan, voices, paths } = await loadPlan(filmDir);
  const { scoreFilm } = await need('engine/audio/music.mjs', 'the music module');
  const { writeWav, SAMPLE_RATE } = await need('engine/audio/wav.mjs', 'the wav module');
  let t0 = performance.now();
  const music = await scoreFilm(plan, film.seed != null ? { seed: film.seed } : {});
  mkdirSync(paths.out, { recursive: true });
  writeWav(paths.music, [music.L, music.R], SAMPLE_RATE, 24);
  process.send({ label: 'music', path: paths.music, dur: music.L.length / SAMPLE_RATE, secs: (performance.now() - t0) / 1000 });
  const { mixFilm, writeMaster } = await need('engine/audio/mix.mjs', 'the mixer');
  t0 = performance.now();
  const r = await writeMaster(paths.mix, await mixFilm(plan, { voices, music, sounds: film.custom?.sounds }));   // (as cmdMix: plan.sounds wins)
  await new Promise(res => process.send({ label: 'mix', path: paths.mix, lufs: r?.lufs ?? r?.integrated, secs: (performance.now() - t0) / 1000 }, res));
}

if (process.send && process.argv[1] === SELF) {
  process.once('message', m => run(m).then(() => process.exit(0), e => process.send({ error: e?.message || String(e), stack: e?.stack }, () => process.exit(1))));
  process.on('disconnect', () => process.exit(1));   // the render stopped
}
