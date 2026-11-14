// Timing: node engine/scene3d/tools/perf.mjs engine/scene3d/scenes/zero.mjs 1280x720 [frames=60] [blur] [from=100]
// Reports start-up (the first two frames build shaders), then the steady cost of a whole frame (pose, render,
// read-back, and the motion blur the shot chooses, or `blur`: none, vector, moments:N) over `frames` consecutive
// frames starting at `from`.
import { open } from './scene.mjs';
const [sceneFile, size, nArg = '60', blur = 'shot', fromArg = '100'] = process.argv.slice(2);
const n = Number(nArg), from = Number(fromArg);
let t0 = performance.now();
const src = await open(sceneFile, size, blur === 'shot' ? {} : { blur }), { built, fps } = src;
const build = performance.now() - t0;
t0 = performance.now(); built.update(src.duration - 1 / fps); const firstPose = performance.now() - t0;   // fills every spring from t = 0
t0 = performance.now(); await src.pixels(from / fps); const firstRender = performance.now() - t0;
t0 = performance.now(); await src.pixels(from / fps); const second = performance.now() - t0;
const ms = [];
for (let f = from; f < from + n; f++) { const a = performance.now(); await src.pixels(f / fps); ms.push(performance.now() - a); }
const mean = ms.reduce((a, b) => a + b) / n, sorted = [...ms].sort((a, b) => a - b);
console.log(`${src.width}x${src.height} blur ${blur}: start-up ${(build / 1000).toFixed(2)} s (meshes from cache, scene); first pose ${(firstPose / 1000).toFixed(2)} s (springs filled from t = 0); first frame ${(firstRender / 1000).toFixed(2)} s (GPU started, shaders built), second ${second.toFixed(0)} ms; then ${mean.toFixed(1)} ms per frame on average (median ${sorted[n >> 1].toFixed(1)}, worst ${sorted[n - 1].toFixed(1)}) for pose + render + read-back over frames ${from}-${from + n - 1}`);
src.close();
