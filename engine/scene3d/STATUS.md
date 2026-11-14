# engine/scene3d: where it stands (wave 0b, integrated and repaired 2026-11-13)

A film with `"format": { "engine": "3d" }` renders through `node bin/cinecode.mjs render` with the 3D picture: three.js
0.187.0's WebGPU renderer in plain Node (`webgpu` 0.6.2), the frozen character format, the motion system, the
golden-hour look and the vector motion blur. `films/_test3d` is the gate film: two scenes in the living room (golden
hour, then twilight), 4 shots, 29.6 s (710 frames) with its two 2 s cards. 2D films are untouched and never load
`three` or `webgpu`. Every number below was measured on 2026-11-13 between 08:50 and 09:25 (the repair track, after
its last edit) on the owner's M1 Max with other sessions open; the 1-minute load average is given with each timing.
Outputs are in `scratchpad/wave0b/final/`.

## Works

- **The gate film.** `render` of a copy of `films/_test3d` at 1920x1080, twice: the same mp4 bytes (sha256
  `66ba92d98853...`, 710 frames, h264 + AAC + subtitles), and the same `music.wav` and `mix.wav`; a third render
  later gave the same bytes again. At 1280x720 it renders and verifies. A range (`--from 16 --to 19`) rendered twice
  kept the music and the mix (`... are up to date`, same mp4 bytes); after `touch film.json` they were made again.
- **Repeatable.** `tools/determinism.mjs films/_test3d 0,100,240,298,410,411,413,450,520,600,700 1920x1080` (across
  the cut into the second scene and the frames where the cat was NaN): identical in 3 processes, one backwards.
  `tools/stress.mjs` (40 processes, 8 at a time, half reversed): one answer for the film (100, 298, 411, 600) and for
  Scene Zero (30, 100, 153, 222). Scene Zero 30, 100, 153, 222 at 1080p: identical in 3 processes.
- **Motion gates** (`tools/check-motion.mjs`, no GPU; a film is checked scene by scene; gates: pops < 5 m/s, holds
  < 1/3 s, reach and through < 5 mm, turns < 8 rad/s over a frame, overlap < 10 mm, feet < 0.01 mm, paws < 2 mm):

  | | slide | pops | hold | turns | overlap |
  |---|---|---|---|---|---|
  | film s01: man / girl / cat | 0.00 / 0.00 / 1.30 mm | 4.24 / 3.13 / 4.34 m/s | 0.054 / 0.050 / 0.292 s | 5.97 / 6.78 / 5.01 | 0 mm, every pair |
  | film s02: man / cat | 0.00 / 1.27 mm | 4.24 / 4.03 m/s | 0.087 / 0.171 s | 5.67 / 6.41 | 0 mm |
  | Scene Zero: man / girl / cat | 0.00 / 0.00 / 1.30 mm | 3.56 / 2.70 / 1.99 m/s | 0.033 / 0.033 / 0.204 s | 6.50 / 6.87 / 7.54 | 0 mm |

  Reach and through are 0 everywhere; no joint is ever NaN (the check now counts one as a pop of Infinity).
  `test/scene3d-film.test.mjs` holds the film to these gates, scene by scene, and `lint` holds every film to them.
- **Turntables** (`tools/spin.mjs`, 9 x 360 frames): all under the 1.4 gate, worst 1.21 (girl standing, neck box);
  frame 0 repeats exactly in all nine.
- **The look gate** (`tools/look.mjs` Scene Zero 30, 100, 153, 222 at 1080p): within the gate. p1 21 / 21 / 21 / 26,
  p50 119 to 131, RMS contrast 60.0 to 62.0, clipped 2.0 to 2.7 %; flicker over frames 100 to 110 worst still tile
  0.305 without grain, 0.897 with it (gate 1). The gate is for golden hour only: the twilight scene is outside it by
  choice (below).
- **Storyboard on the motion system.** Every verb is timed on the 3D actors while the film is laid out, so plan,
  captions, sound cues and picture agree (a test checks every action of the film starts within a frame of its plan
  and ends by it). New in this wave: `sit` and `stand` for the man and the girl (on the sofa the kit names, or on the
  floor; the girl was also checked sitting and leaving the sofa: pops 2.1 m/s, turns 5.7), `turn` and `stand` for
  the cat, cat leaps of 0.2 to 2 m with no trot after them. Words keep clear of faces and hands ("Home." in the
  medium shot sits above the man's head). `check`, `plan` and `lint` run with no GPU.
- **Lint** (no GPU, scene by scene): `feet-slide`, `paw-slide`, `collide` (the motion track's capsule `overlap`),
  `turn-speed` (the `TURN_GATE`), and the `check-motion` gates on every joint at 240 Hz: `pop`, `hold`, `over-reach`,
  `through-body`; `head-out-of-frame`, warnings `words-over-face`, `subject-hidden` and `waits`. Tests prove
  `collide`, `turn-speed`, `pop` and `over-reach` fire. `check` lays a 3D film out, so an action that cannot be
  played stops it (exit 1) and waits are warned. A storyboard mistake names its shot and beat; an engine fault reads
  as one, with its stack; a GPU error during a frame stops the render (it returned a blank picture).
  `films/_test3d`: 0 errors, 0 warnings (lint 2.8 s quiet, 7.3 s beside a test run). The STORYBOARD track's 10-minute film (`wave0b/long`): 45
  errors at the stricter gates, all real and repeated every night of the film: the girl's pelvis at 8.0 rad/s (9),
  her hand 5 to 7 mm into her body (18), the cat dead still 0.35 s (18); lint took 83 s on it under load.
- **2D unchanged.** `films/_test` through `render` here and on `main` (`wave0/main-ref`), with the same stand-in
  voices and no TTS: `music.wav`, `mix.wav`, the mp4 and the srt are the same bytes, and the log prints the same
  steps in the same order; the test comparing its plan and 24 frames with main passes.
- **Tests.** `npm test` with `CINECODE_MAIN_REF` set, after the last edit: 765 tests, 765 pass, 0 skipped.

## Library pieces (2026-11-13, laptop on battery in low power mode)

- **The shape language** (`shape.mjs`, `docs/scene3d-shapes.md`, `props/`): hard objects by name, meshed by surface
  nets and thinned. Every piece (three props, the house's five, the car) gives one digest in two fresh processes from
  scratch and one from the cache (`test/scene3d-pieces.test.mjs`).
- **The car** (`car/`): 60 476 triangles (was 442 348; body 18 522, was 225 092). Its 12-view sheet and three 1080p
  close views (front quarter, the open door, the rear) before and after look the same (scratch `port-lib/
  car-sheet-before.jpg`, `car-sheet-tol05.jpg`, `close-*.png`). Wheels do not skate (under 10 mm/s at the contact,
  test); the car and its door are pure functions of t (test); it stops on its last mark with its wheels straight.
  The seated driver: 96 to 97 vertices of his left sole up to 5.2 mm into the cabin floor, nothing else inside the
  shell, at 0, 3, 4.5 and 7.5 s of `scenes/home.mjs`.
- **The place "home"** (`home/`, `KITS.home`): the living room (built once, `livingRoom(stage, { garden: false,
  door })`) inside a cottage, with a garden, drive and street; areas `inside` / `outside` a set names. A two-area film
  compiles, poses and frames each scene from its area (test). Scene Zero and `films/_test3d` frames are the same bytes
  as before the room change.
- **Gates on `scenes/home.mjs`** (1920x1080): determinism, car moving and three people, frames 48, 100, 140, 215 in 3
  processes (one reversed): identical.
  Look gate frames 100, 240, flicker 100 to 110: `lawn_wide` golden p1 18, RMS 58.4, clipped 0.59 %, worst still tile
  0.750 (0.086 without grain): within; `lawn_wide` twilight p1 16, RMS 59.4, 0.43 %, 0.715 (0.064): within;
  `room_wide` twilight p1 20, RMS 58.4, 2.30 %, 0.801: within; `room_wide` golden p1 19, RMS 52.1: OUTSIDE (flat; as the
  builder reported: the place's sun comes from the garden, az 58).
- **Speed**, 1080p, low power, load 3 to 4: car parked, man, girl and cat in `lawn_wide` 57.3 ms mean (median 59.0,
  worst 71.8); the same without the car 64.5 ms (the run without the car was the slower: the car's cost is inside the
  noise of this machine today); the car driving with its driver and the three, 68.4 ms (worst 104.5).

## Storyboard wiring (2026-11-13, laptop on battery in low power mode, 52 % to 44 %)

- **What a storyboard can now say** (`API.md` CHANGES "Storyboard wiring", `docs/scene3d.md` "The house, the car,
  the ball and the cat"): the car (`drive`, `stop`, `set` lights / engine, a rider `on` it and `place`d out of it),
  the front door and the car's door (`open` / `close`), the ball (rolled from the hands, rolled and batted by the cat,
  picked up), the cat's pounce at the ball, its skid, a person starting seated or crouched, a shot's `area`.
- **The scratch storyboard** (`cinecode-plan/scratch/film1work/port-wire/wire/`, 1280x720, every new beat once, the
  girl as Milo, the man as Dad): `check` valid (2.0 s), 1:08.8 voiced, `lint` 0 errors and 1 warning (the cat's skid
  waits 2.27 s for its pounce to settle; 9.6 s; before the pick-up's reach change it was 1 error, the girl's forearm
  5 mm into her body). Two renders from an empty `out/`, before that change: the same mp4, `mix.wav` and
  `music.wav` bytes; 1650 frames, 1 m 34 s and 1 m 30 s for the picture (about 57 ms a frame with encoding), 1 m 36 s
  and 1 m 54 s in all; after it, 1 m 31 s / 1 m 33 s (battery 34 %), a new mp4 and the same `mix.wav` and
  `music.wav`. `npm test` with `CINECODE_MAIN_REF`: 775 tests, 775 pass, 0 skipped (3 m 30 s). Contact sheets looked at: the ball rolled and chased, the cat on the window seat, the car into
  the drive, Dad by the car's open door, the front door open and shut.
- **Seen, not fixed**: in 1.5 the car is not seen through the window (the inside's default camera; the kit's named
  `behind_milo` is not a storyboard camera); the girl's run from a standstill puts a hand 8 to 9 mm into her body
  (staged as a fast walk); the skid after a pounce waits for the hop to settle; `stop` does not shorten the time the
  drive's beat was given; the picked-up ball's hand stops about 5 cm above it.

## The boy and Dad in the engine (2026-11-13, CAST track, battery 33 % to 20 %, low power mode on)

- **Cast**: `"rig": "boy"` (Milo; params `skin`, `hair`, `shirt`, `shorts`) and `"rig": "man", "params": { "wardrobe":
  "work" }` (Dad: shirt, trousers, shoes, a briefcase that hangs and swings). Built with no GPU: 243 392 and 298 320
  triangles. Garments with `fit` are weighted in `buildCharacter`'s cached build (the same weights as the people
  builders' `cloth.mjs` to the bit). The tired posture is the expression `tired` (held until the next expression),
  `sigh` and `laugh` are gestures; `hang.mjs` runs in every performer.
- **Scratch storyboard** (`cinecode-plan/scratch/film1work/cast/film/film.json`, 1280x720, 44.6 s, no lines, every
  verb once): `check` valid, `lint` 0 errors and 1 warning (the cat's skid waits 2.27 s), `check-motion` every gate
  passes (Milo's chest 7.81 rad/s on the first step of his run from a standstill, gate 8; Dad pops 4.0 m/s). Render
  1071 frames in 1 m 16 s and 59.5 s (whole film); 1080p `perf.mjs`: 63.4 ms mean (worst 180) in the room, 60.9 / 65.1
  ms (worst 452 / 459) outside, load 6 to 20; the worst is frame 816, the cut from 2.4 to 2.5 (446 ms alone): not
  traced. Determinism: frames 100, 330, 560, 760, 980 identical in 3 processes, one reversed.
- **Spins** (`tools/spin.mjs`, gate 1.4): every static spin passes (worst dad-walk 1.19); moving: dad-turn 1.33 passes,
  dad-walk-turn 1.60, boy-turn 2.07, boy-walk-turn 3.22 fail (as man-walk-turn 1.57, girl-turn 2.01, girl-walk-turn
  3.42 do).
- **Fixed on the way**: a car's drive that did not start at its scene's very start jumped 1.28 m forward in one frame
  (`car/drive.mjs`).

## Speed

**The repair track's timings are not comparable with the integration's.** At 09:10:18 the machine went on battery
(`pmset -g log`) in low power mode (`pmset`: `lowpowermode 1`, discharging), and other sessions used the GPU in bursts (84 to 94 %
device utilization with none of these processes running). The same code gave the same mp4 bytes in 41.7 s and 42.5 s
at 09:07 (load 3 to 6, on mains: 58.7 ms a frame with everything, as at integration: 42.4 and 44.1 s) and in 69 s at
09:16. Posing is not the cost: `built.update(t)` is 0.18 ms a frame (1.06 ms on the first pass, which steps every
spring). Under low power, `films/_test3d` at 1920x1080 (`scratchpad/wave0b/integ/time3d.mjs`: every frame, picture
and words, read back):

| | integration, mains (load 23 to 10) | repair, low power (load 33 to 15) | low power (load 15 to 9) | low power, GPU idle at start (load 4.4) |
|---|---|---|---|---|
| start-up (frame 25) | 4.49 s | 6.47 s | 5.92 s | 5.62 s |
| every frame after: mean / median / p95 / worst | 44.9 / 44.2 / 55.2 / 107 ms | 68.5 / 69.2 / 83.2 / 116 ms | 67.8 / 68.5 / 81.2 / 112 ms | 69.3 / 69.2 / 84.1 / 116 ms |
| frames over 80 ms / over 500 ms | 1 / 0 | 51 / 0 | 43 / 0 | 70 / 0 |

`tools/perf.mjs` at 1080p, low power: Scene Zero 59.1 to 70.1 ms, `films/_test3d` 64.9 ms (43.9 on mains). Frame
411, the first of the second scene, is the slowest in every run (105 to 116 ms); not traced. Rerun on mains before
quoting these. The 720p render: 37.9 s (low power).

Long films (the STORYBOARD track's 10-minute gate film, `PERF.md` "Long films"; not re-run here): 14 m 54 s for
9:58 of film at 1080p, 62.3 ms a frame with everything at load 6 to 13; picture and words mean 54.5 ms, p99 146 ms,
worst 180 ms; no frame over 500 ms after start-up; projects to about 45 minutes for 30 minutes of film. Opening a
film is 0.15 s (scenes are staged when first needed and dropped behind). A stopped render resumes from its whole
segments and gives the same bytes.

## Rough (seen or measured, not fixed)

- **Moving spins still fail their gate** (1.4), better for the man: man-turn 1.37 (was 1.82; under the gate),
  man-walk-turn 1.57 (1.50), girl-turn 2.01 (3.29), girl-walk-turn 3.42 (1.96), cat-turn 1.43, cat-trot-turn 4.52
  (both unchanged). girl-turn's worst pair (6.517 s) is her bun and shoulders swinging as the turn decelerates;
  girl-walk-turn's (1.200 s, one 1/120 s pair) shows in the picture only, the bones' motion is smooth there, and the
  strip reads as a clean walk round. cat-trot-turn is the trot's long first step (the chest drops 5 mm in 12 ms).
  At 24 fps (the checker's own measure, `wave0b/verify-turntable-blind/diff.mjs`) the worst ratios fell: man-turn
  5.5 to 2.4, girl-turn 6.3 to 3.7 (at a hold) / 2.4, man-walk-turn 4.2 to 1.6, girl-walk-turn 2.3 to 1.3.
- **The picture against the reference** (`final/compare.jpg`): better than wave 0 in light (real bands of low sun
  across floor and wall, real darks, the twilight scene reads as a different hour, now with the lamp on as a warm
  pool against a blue-lilac room); the golden frames are still darker and cooler than the reference (lilac-grey walls
  in shade where the reference is cream, a heavy dark ceiling band, the man's shirt muddy in shade). Still smooth CG
  against a painted reference (brush texture, tapered lines, patterned cloth). Figures are small in the wide shots.

## Taste decisions (for the owner)

- **Twilight is darker than the look gate on purpose.** The gate (RMS contrast at least 58, from golden hour) would
  make dusk read as day. After the repair, `films/_test3d` frames 450 / 520 / 620 at 1080p: p1 20 / 20 / 19, p50 69 /
  70 / 98, RMS 46.1 / 45.8 / 54.0, clipped 0.5 / 0.5 / 1.9 % (it was RMS 37 to 41, p1 43 to 45: grey and flat, lamp
  off). The reference `d_lamp_full` is RMS 49.7. Its flicker check fails too (worst still tile 1.98 over 450 to 460,
  1.46 over 640 to 650), on tiles that hold the man's planted foot and the cat's head: slow moves the still-tile test
  cannot tell from shimmer, not shimmer I could see. The plant's leaves glow lime against the lamp.
- **The golden hour stays darker and cooler than the reference** (above): wave 0b chose deep shade and blue fill for
  the bands of sun; brightening the shade toward cream is one `light.mjs` row if the owner wants it.
- **The girl's run-stop** drops her hips about 10 cm in a sharp V on the braking step (Scene Zero; under the gates).
- **Gate stability**: the same verbs shifted in time gave the cat a 15.5 m/s leap-landing pop in one staging and
  3.96 in another (STORYBOARD track); the film's staging is the one that passes. Re-run `check-motion` after any
  staging change.
- **The cat's look** at a target well round turns its head 7.2 rad/s (gate 8): looks ease in over 0.5 s; the
  critter mixes the look weight outside its speed-limited spring (`quadruped.mjs`), so a faster ease breaks the gate.
- **Walks do not steer** in films: `compile.mjs` does not give the performers a `world` (the motion track's
  steering), because the build replays each actor's calls one actor at a time and a detour depends on where the
  others will be. Lint's `collide` catches actors who meet; the writer re-stages.
- **Crouch and stand** return when their keys end; the spring settles about 9 mm later.
- **Turntable margin**: an upright outline's ink line jumps whole pixel columns, so any shape change can move a spin
  by about 0.1.
- **The man's raised-arm shoulder** shows a shallow valley from behind; a small dark crease in his armpit with the arm
  high; a crease across the girl's dress at the waist when her chest turns far on her hips.
- **Memory of long renders**: the sound process peaks at 3.6 GB for 10 minutes (about 10.7 GB for 30;
  `engine/audio/mix.mjs` mixes whole-film buffers, not owned here). The worker's heap creep was not reproduced by the
  repair track: after a full collection it stays at 117 to 125 MB through 8160 frames encoded at 960x540 and through
  5000 consecutive frames of `_long30`.
- **Lint at 240 Hz is slower**: 2.0 s to 2.8 s for `films/_test3d`; 83 s for a 10-minute film under load.
- **Rough staging lint now catches** (the repair's cases in `wave0b/repair/cases/`, not in the film): `5-floor-centre`
  (a hand 23 mm into the body, `through-body`) and a cat's 0.7 m hop (an ear dead still 0.37 s, `hold`). Not fixed.

## Missing

- Other rigs and kits, `lie` / `sleep` / `wake`, `hop` for people, putting a carried case down (`check` names each;
  `docs/scene3d.md` lists them all).
- Steering round people in films (above) and round furniture anywhere; runs never steer.
- Two stages open at once in one process (they share `lookUniforms` and `shadowUniforms`).
- A headless-browser host (the host boundary is `host-node.mjs`: `hasAdapter`, `createSurface`).
- A 30-minute film rendered for real; any machine with no GPU adapter (the skip branches are tested by hiding the
  packages); other operating systems.
- Private three.js internals in use (`stage.mjs` nodeFrame, the AO context, the Motion node, the lighting model, the
  fake canvas in `host-node.mjs`): any three.js upgrade means rerunning every gate.

## The files

| file | what it is |
|---|---|
| `index.mjs` | `openScene(scene, opts)` → `{ pixels(t, into), built, stage, close() }` |
| `stage.mjs`, `host-node.mjs` | the renderer, passes, finishing, motion blur; the GPU device and read-back |
| `materials.mjs`, `light.mjs`, `sets.mjs`, `room.mjs` | the painted material, the hours, set pieces, the living room (`livingRoom`) |
| `character.mjs`, `sdf.mjs`, `soft.mjs`, `cast/` | characters from descriptions (man and his work clothes, girl, boy, cat), the mesh cache |
| `biped.mjs`, `quadruped.mjs`, `performer.mjs`, `hang.mjs`, `motion.mjs`, `ball.mjs` | rigs, the performer and the critter, things hanging from a hand, springs and the world, the ball |
| `checks.mjs` | feet, paws, the motion gates, overlap, `sceneSource` |
| `library.mjs`, `compile.mjs`, `lint.mjs`, `overlay.mjs`, `source.mjs` | the storyboard's rigs and kits, timing and staging, 3D lint, words over the picture, the render's frame source |
| `img.mjs` | saving pictures, tiling, the ffmpeg encoder |
| `shape.mjs`, `props/` | the shape language (hard objects), three props |
| `car/`, `home/` | the car (shape, meshes, the driving rig, the driver), the place "home" (house, parts, kit) |
| `scenes/zero.mjs` | Scene Zero, written straight on the motion system |
| `scenes/home.mjs` | the place "home" from a named camera, with the car and the cast (environment variables) |
| `tools/` | `scene` (opens a scene or film), `render`, `strip` (stills and strips), `look`, `determinism`, `stress`, `perf`, `check-motion`, `spacing`, `spin`, `studio`, `turnaround`, `faces`, `hands`, `bend`, `sheet` (hard objects), `views` (the house) |
| `API.md`, `PERF.md`, `STATUS.md` | the contract and CHANGES, speed, this file |

Tests: `test/scene3d-*.test.mjs`. Docs: `docs/scene3d.md` (for a storyboard writer), `scene3d-characters.md`,
`scene3d-motion.md`, `scene3d-picture.md`, `scene3d-shapes.md`.

## Files in `scratchpad/wave0b/final/`

- `test3d-1920x1080.mp4`, `test3d-1280x720.mp4`: the gate film (`render` of a copy of `films/_test3d`).
- `sheet.jpg`: 25 moments, card to card. `still-0.jpg` (s01 at 9.3 s), `still-1.jpg` (s02 at 23.0 s), `still-2.jpg`
  (the medium shot at 26.0 s with "Home."), `still-1080-film-11.4s.jpg` (picture only); `compare.jpg`: these beside
  wave 0's `still-1080-film-12.4s.jpg` and the references `d_run_full`, `d_lamp_full`.
- `strip-turn-man.jpg` (6.5 to 8.0 s), `strip-sit-man.jpg` (17.1 to 22.0 s: from the window along the sofa, one
  turn, the sit), `strip-turn-cat.jpg`, `strip-hop-turn-cat.jpg`: the man's turn, his walk and sit, the cat's turn,
  and its turn, leap, turn and sit on the sofa.
- `spin/`: the nine turntables and six moving spins (`.mp4`), the moving spins' strips and series (`.jpg`, `.json`),
  `worst.jpg` (each spin's worst pair and their difference), `out.txt`.
- `long-sheet40.jpg`: the 10-minute film's 40-moment sheet (STORYBOARD track).
- `logs/`: check-motion, determinism, stress, look (Scene Zero and twilight), timing (`time-film-a/b/c`), render
  logs, the hashes, the 2D comparison, `lint-long3d.txt`, `npm-test-final.txt`, `spin.txt`.
