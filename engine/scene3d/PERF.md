# engine/scene3d: speed

The budget: a 30-minute film at 1920x1080 and 24 fps rendered in about an hour on the owner's laptop (Apple M1 Max),
so a finished 1080p frame must average under about 80 ms, and no frame may take more than 500 ms.

## Milliseconds per frame (step 0.3)

Scene Zero, 60 consecutive frames (100 to 159: the man crouching and throwing, the girl, the cat, the ball, the
start of the camera move), each frame posed, drawn with its motion blur and read back as RGBA bytes
(`tools/perf.mjs`). Average, with the median and the worst frame in brackets. The first two frames of a process are
start-up and are not in the average (below).

| | 1280x720 | 1920x1080 |
|---|---|---|
| step 0.2 code (no blur, 3 x 3 samples) | 34.7 (34.4, 44.9) | 64.4 (63.7, 86.4) |
| `none` | 24.0 (23.7, 35.0) | 42.3 (41.7, 52.1) |
| `vector` (the default for long films) | 24.7 (24.3, 36.5) | 43.4 (42.7, 64.7) |
| `moments:4` | 76.4 (75.5, 137.6) | 138.0 (136.6, 222.2) |
| `moments:8` | 144.6 (144.3, 180.2) | 261.7 (261.9, 270.0) |

Machine load: these runs were taken one after another on 2026-11-13 between 00:56 and 01:00, with other agents
on the same machine; the 1-minute load average fell from 18.4 to 4.9 over the runs (14 to 18 for the 720p blur rows,
9 to 12 for the 1080p blur rows, 6 to 7 for the step 0.2 rows). The timings are of a frozen copy of the engine (the
character files as they were at the move) with this step's picture files. On the live tree at the same time
(load 5 to 7), with the characters as they stand now: `none` 25.5 / 43.5 ms, `vector` 26.1 / 45.3 ms (720p /
1080p), worst frame 91 ms. Earlier runs of the same code under load 6 to 8 gave 1080p `none` 42.9 to 43.6 ms and
`vector` 43.8 to 44.9 ms; one run disturbed by another process gave `none` 61.6 ms.

So `vector` at 1080p is about 43 to 45 ms a frame: a 30-minute film is about 31 to 33 minutes of drawing (x264,
audio and the overlay are extra and run on the CPU). `moments:8` at 1080p stays under 500 ms but costs six times
as much: keep it for short hero shots.

Start-up, once per process: building the scene 0.25 s (mesh cache warm), filling the springs 0.2 s, first frame
3.6 to 4.8 s (GPU and shaders; once 20.8 s while other processes loaded the GPU), second frame about 0.32 to 0.4 s (three.js builds a few more pipelines once the
sun's shadow picture exists). In a whole run of Scene Zero two more frames take about 0.2 s, where something comes
into view for the first time (a material's first pipeline); `source.mjs` draws the whole cast once at the start to
take these up front.

## Measured at the integration (wave 0, 2026-11-13 01:20 to 01:23)

`tools/perf.mjs`, 60 consecutive frames, each posed, drawn with the motion blur its shot chooses (`vector`
everywhere: the default) and read back as RGBA. Average (median, worst). Other agents were on the machine: the
1-minute load average is given for each run.

| | 1280x720 | 1920x1080 |
|---|---|---|
| `films/_test3d`, frames 240 to 299 (the crouch, the ball landing, the cut, the push-in) | 26.1 (25.5, 36.8), load 15.9 | 44.7 (43.8, 52.3), load 15.0; again 45.3 (44.2, 54.0), load 13.0 |
| Scene Zero, frames 100 to 159 | 26.7 (24.8, 74.2), load 13.4 | 45.8 (43.7, 93.6), load 13.1 |

Start-up per process: 0.7 s to open the film (plan, meshes from the cache, the camera solved over every shot),
first frame 3.6 to 3.8 s, second 0.34 to 0.37 s.

Through the command line, everything included (plan, music and mix, the 3D picture, cards, captions and titles laid
over it, x264 `slow` crf 17, audio mux, ffprobe check), `node bin/cinecode.mjs render` of `films/_test3d` (420
frames, 17.5 s; 96 frames are all card and draw no 3D picture):

| size | video step | per frame | whole command | load |
|---|---|---|---|---|
| 1280x720 | 16.2 s and 16.5 s (two runs) | 38.6 / 39.3 ms | 18.9 s / 19.2 s, 1.5 GB resident | 4.8 to 5.9 |
| 1920x1080 | 25.4 s | 60.5 ms (about 66 ms per picture frame after the 4 s start-up) | 28.1 s, 1.6 GB resident | 10.8 to 11.3 |

Correction (checked after the integration): the 15 ms between the picture's 45 ms and the command's 60 ms is
not x264 or the overlay. Measured inside the render loop: the overlay 0.3 ms, the canvas copy (`data()`) 2.8 ms,
the pipe write 2.8 ms a frame; x264 `slow` runs beside the GPU on other cores (`slow` against `ultrafast` changed the
frame by under 1 ms). The rest is spread start-up: about 4.5 s (the film opened, the first frame's shaders) and
music and mix (2.2 s) over a 17.5 s film. For a long film those shrink per frame: the checkers' 144 s film
(`_test3d` x12, 3456 frames) took 59.3 ms a frame everything included, and projects to about 42 to 43 minutes for
30 minutes of 1080p on a quiet machine.

## The repaired core (2026-11-13, 03:04 to 03:05, load 4 to 6)

`films/_test3d` at 1920x1080, every frame of the film timed in one process (picture, overlay, read-back; the
checkers' `verify-gates/time3d.mjs`), two runs:

| | run 1 | run 2 |
|---|---|---|
| frames 2 to 419: average / median / p95 | 46.2 / 45.9 / 48.4 ms | 46.3 / 46.0 / 48.3 ms |
| picture frames 72 to 347: average | 47.2 ms | 47.5 ms |
| frames over 80 ms | 6 (49: 3758, 203: 162, 361: 130, 91: 116, 84: 92, 92: 81) | 6 (49: 3762, 209: 152, 322: 133, 91: 118, 84: 90, 92: 84) |

- Frame 49 (the first that shows the picture) is the start-up: the GPU starts and about 270 pipelines and 380 shader
  modules are built. It is the only frame over 500 ms, once per render process.
- (Fixed in the long-films step below.) Frames 84, 91 and 92 come back in every run: three.js builds pipelines there that the warm-up frame did not
  (counted on the device: at 84 six `ShadowMaterial` pipelines, the man's six meshes in the sun's shadow pass as he
  first walks in; at 91 two `PaintMaterial` pipelines; at 92 the `RTT` and `GTAO` pass pipelines again). Not fixed:
  drawing the warm-up with the shot's motion blur did not change them.
- The other slow frames (130 to 162 ms) move from run to run.
- `tools/perf.mjs films/_test3d 1920x1080 60`: 43.9 ms a frame (median 43.5, worst 52.4) over frames 100 to 159.
- Whole `render` command, 1920x1080, 420 frames: 27.3 s twice (the video step 24.7 s, 58.8 ms a frame with the
  start-up in it), 1.58 GB resident at most; both mp4 files the same bytes.

Not fixed then (fixed in the long-films step below), measured by the checkers: in long runs a V8 major collection in the render worker stalls one frame
every 10 to 12 s for 250 to 420 ms (the heap grows by about 1.3 MB a frame; every frame also allocates two 8 MB
buffers outside the heap: the read-back and the canvas copy). Every frame stayed under 500 ms, with about 80 ms to
spare on a quiet machine.

## Long films (wave 0b, STORYBOARD part 2, 2026-11-13 04:56 to 05:11)

### What changed for speed and memory

- **Scenes are staged when first needed and let go behind** (`compile.mjs`). Opening the 10-minute gate film took
  10.98 s (37 scenes, every camera solved, 273 MB of heap); now 0.15 s (64 MB). A shot's camera (about 3 ms per
  sixth of a second of shot, posing everyone) is solved a little at each `update(t)` of the shot before, at the pace
  that finishes it before that shot ends. Posing per frame through the whole gate film, no GPU
  (`update(t - 1/48)` and `update(t)`): mean 0.94 ms, p95 5.8 ms; one frame in about 1500 costs 45 to 47 ms (892,
  2418, 3944, ..., not looked into further), every other frame under 36 ms; the very first frame of a process 322 ms
  (its shot solved at once). A frame drawn alone equals the same frame drawn in sequence (below).
- **No 8 MB buffers a frame** (`source.mjs`, `host-node.mjs` `read(into)`): the read-back goes into one buffer, and a
  frame with nothing laid over it is handed to x264 from that buffer (no canvas, no `data()` copy). Frames with words
  or a fade still go through the canvas (one 8 MB copy each: about 3600 of the gate film's 14361 frames).
- **A full garbage collection after every 24 frames** (`source.mjs`). With the buffers gone, about 1.4 MB a frame
  still reached the old heap (three.js makes about 39 command encoders, 38 render passes and 150 buffer writes a
  frame, and the WebGPU wrappers outlive two scavenges); V8 then collected it in one stop of 50 to 60 ms every 5 or 6 s,
  and with the stop the frame took 120 to 210 ms. Collected every second, each collection costs 10 to 12 ms (median;
  up to 80 ms late in the gate run, under load). Before this step, in a loop of the same frames, the 8 MB buffers
  forced a collection every second frame (147 in 420 frames, mutator utilisation 0.70).
- **Every pipeline at the first picture** (`source.mjs`): three.js leaves out of a pass anything outside the view of
  that pass's camera, so the warm-up frame never built what stood outside the camera's or the sun's view then (the man
  in the wings: his eyes and brows in the sun's shadow pass, frames 84, 91, 92 of `films/_test3d`). The warm-up now
  shows the whole cast with `frustumCulled` off on everything, draws once plainly and once with the vector blur, and
  puts `frustumCulled` back. Counted on the device: `films/_test3d` 293 pipelines at its first picture and none after;
  the 10-minute gate film (5 times of day, every shot size and move) 293 and none after in 14361 frames.
  `renderer.compileAsync` (three 0.187.0, `Renderer.js` line 1019) was read and not used: it compiles the objects
  `drawingPipeline.project` keeps for one render context (the canvas, with the same culling), not the 38 passes of
  the stage, which have their own targets and outputs.
- **Music and mix in a process of their own** (`engine/render/sound.mjs`), beside the picture for a 3D film: the
  render process holds no sound.
- **Resumable 3D renders** (`video.mjs` `resume`): segments of up to 480 frames; a killed render goes on from its
  whole segments.

### The long gate: a 10-minute film rendered for real

`scratchpad/wave0b/long/gen.mjs` writes `films/_long3d`: 9:58.4, 37 scenes (four choreographies over the room, the
man, the girl, the cat and the ball: every verb, every size, move and angle, five times of day, cuts and fades), 147
shots, 14361 frames, 103 captions and titles, 1325 sfx, 37 music cues, no voices. `check`: valid; `lint`: 0 errors, 10
warnings (`words-over-face`). Rendered with `node bin/cinecode.mjs render` at 1920x1080 from a frozen copy of the tree
with a per-frame timing log added to `encode.mjs` (`scratchpad/wave0b/long/patch.mjs`). The machine was not quiet:
the 1-minute load average, sampled every 5 s, was 6.2 at least, 8.0 in the median, 13.5 at most.

| | |
|---|---|
| whole command | 14 m 54 s (894 s): 62.3 ms a frame with everything (plan, srt, start-up, x264 `slow`, join, mux, ffprobe) |
| load (plan) | 0.6 s |
| music / mix (child process, beside the picture) | 68 s / 64 s, done 2 m 12 s into the render |
| picture start-up (first picture frame) | 4.97 s, 293 pipelines |
| picture + words a frame, 14360 steady frames | mean 54.5, median 52.3, p95 73.1, p99 146, worst 180 ms |
| the same with the pipe write to x264 | mean 57.4, median 54.7, p95 80.0, worst 186 ms |
| without frames 4790 to 5090 (below) | mean 52.8, median 52.1, p95 67.9, p99 87.7, worst 153 ms |
| pipelines built after start-up | none |
| peak resident memory | render process 316 MB; sound process 3567 MB; render worker 1384 MB (footprint 1964 MB); x264 920 MB |
| GPU memory (system, "In use system memory") | 274 MB before, 1.4 to 1.8 GB while drawing, 239 MB after |
| the worker's graphics memory (footprint, every 30 s) | 592 MB + 107 MB from the first sample (04:57:40) to the last (05:10:43): no growth |
| live JS heap of the worker (low point per 960 frames) | 93 MB at frame 960, rising to 104 MB at frame 13440 (cause not found) |

Frames whose picture took over 150 ms: 84. 83 of them are frames 4796 to 5080 (the whole stretch ran at about
140 ms a frame, across three shots, and stopped mid-shot): drawn again alone after the run, frames 4761 to 5099 took
46.7 ms on average, worst 67 ms, so that was another process on the GPU or CPU. The other is frame 13100 (153 ms, of
which 100 ms posing): its shot's camera was not solved in time by the one-sixth-a-call prefetch the run had; the
prefetch is now paced to finish before the shot before ends (no-GPU posing of that frame: 46 ms). Counting the pipe
write, 115 frames passed 150 ms: these and x264 falling behind (frame 5154: 99 ms writing; frame 14302 on the end
card: 153 ms writing). No frame passed 500 ms after start-up.

**Frame 5000 alone**: sha256 of the finished frame (picture and words, as x264 gets it) `8e4363d6...` drawn alone in a
fresh process (frozen copy and live tree), and the same drawn in sequence from frame 0 in one process; frame 1234
drawn after 5000 in the same process equals frame 1234 in sequence (`ff8c9862...`).

**Projected 30 minutes** (43200 frames) at this run's 62.3 ms a frame: 44.8 minutes, on a machine loaded as this one
was. The sound process would take about 7 minutes beside the picture and, scaling with length, about 10.7 GB at its
peak (the render process stays near 300 MB).

**Resume.** `render` of a 960x540 copy of `films/_test3d` (507 frames, 2 segments): killed (SIGKILL to the render
process and its children) once the first segment was whole, then run again: it drew only the second segment, and the
mp4 is the same bytes as an unbroken render (sha256 `ccbc6461...`). `test/render.test.mjs` does the same with an
abort.

**2D unchanged.** `render` of `films/_test` (with stand-in cached voices, the same files for both), `glim` and `kite`
with this tree and with `main` (`wave0/main-ref`), no TTS: `music.wav`, `mix.wav`, the mp4 and the srt are the same
bytes for all three.

Not done: the sound process's own memory (the mix holds many whole-film float buffers at once: `engine/audio/mix.mjs` is
not this track's); the slow rise of the worker's live heap; a 30-minute film rendered for real.

## The integrated core (wave 0b, 2026-11-13 05:58 to 06:03)

`films/_test3d` (now two scenes, 710 frames) at 1920x1080, every frame timed in one process (picture and words, read
back: `scratchpad/wave0b/integ/time3d.mjs`), two runs at load 23 falling to 14 and 14 to 10: start-up 4.49 and 4.47 s
(frame 25, under the opening card); after it, mean 44.9 / 45.0 ms, median 44.2 / 44.3, p95 55.2 / 55.3, worst 107 /
105 ms (frame 411, the first frame of the second scene, in both runs); one frame over 80 ms, none over 500. The whole
`render` command: 42.4 s and 44.1 s (59.7 and 62.1 ms a frame with everything), 1.43 GB resident, load 7 to 9; the
two mp4 files are the same bytes. Removing `createStage`'s `ss` / `msaa` / `occlusion` branches changed no byte (Scene
Zero 100 and 222 against the old stage).

## The repaired core (wave 0b repair, 2026-11-13 08:50 to 09:25)

On mains at 09:07 (load 3 to 6): the whole `render` of a copy of `films/_test3d` at 1080p took 41.7 s and 42.5 s
(58.7 and 59.9 ms a frame with everything), the same as the integration: the repair's motion springs, lint gates and
GPU error check cost nothing measurable in a render. Posing alone (`built.update(t)`, no GPU) is 0.18 ms a frame once
the springs are stepped (1.06 ms on the first pass). A range of 3 s (`--from 16 --to 19`) whose music and mix are
up to date: 10.7 s (the score and the mix are no longer made again). From 09:10:18 the machine ran on battery in low
power mode, and other sessions used the GPU in bursts: the same render took 69 s (same bytes), `time3d.mjs` gave a
mean 67.8 to 69.3 ms after start-up (p95 81 to 84, worst 112 to 116 at frame 411, 43 to 70 frames over 80 ms, none
over 500) and `tools/perf.mjs` 59 to 70 ms (Scene Zero) and 64.9 ms (`films/_test3d`, 43.9 on mains). Those are not
the engine's numbers; rerun on mains.

`lint` at 240 Hz (the `check-motion` gates): `films/_test3d` 2.0 s before, 2.8 s after (quiet machine); the 10-minute
`_long3d` 83 s at load 7 to 10.

## Where the time goes (1080p, 2 x 2 samples, frame 153, load about 5)

Measured by cutting the picture off at successive stages and timing the frame (median of 15, interleaved); the
GPU's own timestamps were tried and are not usable on this Dawn/Metal build (most passes read the same value).

| part | ms |
|---|---|
| one moment: sun's shadow picture (4096 x 4096), first pass (depth, normals, motion), contact darkening, scene at 2 x 2 samples, light in the air, dust, added into the sum | 31.4 |
| of which the light in the air (`rays`, 64 steps a pixel) | 3.8 |
| of which the scene at 3 x 3 samples instead of 2 x 2 (the old `ss = 3`) | +20.7 |
| copy of the sum (`none`) / vector motion blur (`vector`) | 1.4 / 1.9 |
| depth of field | 1.8 |
| brush filter, the two glows, grade, paper, grain | 4.1 |
| the rest: read-back (about 0.7), posing (0.6), encoding the passes on the CPU | about 3.7 |

A moment is everything before the finishing, so `moments:N` costs about N x 31 ms plus 11 ms.

## What this step changed for speed

- **2 x 2 samples with a tent instead of 3 x 3 with a box** (`stage.mjs` `SS` = 2): 20.7 ms a frame less at
  1080p. The tent spreads each pixel's 4 x 4 nearest samples with weights 1 3 3 1 (4 bilinear taps). Side by side
  at 1080p (frame 153: the shelf and books, the plant, the man's face) at 1:1 I saw no difference; at 2x zoom the
  tent is a hair softer on hard edges and its edges are as smooth as 3 x 3 (the plain 2 x 2 box showed small steps
  on the plant's leaves at 2x, and 1 x 1 showed clear steps even at 1:1). PSNR against 3 x 3: 41.5 dB. Stills only:
  edges crawling in motion were not watched. (The `ss` option and its 3 x 3 and 4 x 4 branches were removed at the
  wave 0b integration: no scene used them.)
- **The canvas is `rgba8unorm`**: the read-back copies rows instead of swapping red and blue pixel by pixel (the
  move measured the swap at 1.6 to 2 ms at 1080p). 109 of 2.76 million bytes of a 720p frame moved by one level.
- **Motion blur is summed before the finishing**: the glows, depth of field, brush, grade and grain run once a
  frame whatever the number of moments. The naive version, which finished every moment, measured 122 ms at 720p
  for 4 moments with 3 x 3 samples under load; this one 76 ms with 2 x 2 samples (most of that difference is the
  sampling; finishing and reading back once instead of 4 times saves about 3 x 8 ms at 1080p).

Not done, for later: the light in the air at 32 steps instead of 64 (about 2 ms; changes the look, needs a side by
side); the sun's shadow picture redrawn only when something in it moves (it is redrawn every moment now).

## How to measure

```
node engine/scene3d/tools/perf.mjs engine/scene3d/scenes/zero.mjs 1920x1080 60 vector      # also none, moments:4, moments:8
node engine/scene3d/tools/determinism.mjs engine/scene3d/scenes/zero.mjs 30,100,153,222 1280x720 vector
node engine/scene3d/tools/stress.mjs engine/scene3d/scenes/zero.mjs 30,100,153,222 40 8 1280x720 vector
```

Write down the load average (`uptime`) with every timing: other processes on the GPU change the numbers by tens of
milliseconds.
