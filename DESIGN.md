# cinecode — design and module contracts

cinecode turns a **storyboard file** (`films/<slug>/film.json`) into a finished film: painted backgrounds, animated characters, camera work, captions, voices, music, sound effects and a final mix. Everything is drawn and synthesized by code. Only the voices come from a model (Gemini TTS), and they are cached on disk, so a film re-renders identically without network access.

This document is the contract between modules. **If you build a module, implement exactly the exported names and shapes below.** If you need something another module doesn't provide, add it to *your* module and note it in your report. Don't edit files you don't own.

---

## 0. Ground rules for all code

- Node ≥ 20, ES modules (`.mjs`), **one runtime dependency only: `@napi-rs/canvas@1.1.0`**. Audio DSP, WAV I/O, HTTP (global `fetch`), and tests (`node:test`) use built-ins. `ffmpeg`/`ffprobe` are invoked as external binaries (`node:child_process`).
- **Deterministic.** Never use `Math.random()` or `Date.now()` in rendering or audio. Use `rng(seed)` / `hash(str)` from `engine/core/lib.mjs`. Same input → identical frames and samples.
- **Style.** Match the existing hand-painted look: wobbly hand-inked outlines (`ink`, `wobble`), cel shading with one hard lavender multiply shadow (`cel()` in the rigs), gouache dabs (`clump`, `foliage`), paper texture, grain. Light comes from the upper left unless a set says otherwise.
- **Tests.** Each module ships `test/<module>.test.mjs` runnable with `node --test test/`. Tests must not need network or API keys (mock `fetch`).
- **Units.** World coordinates are pixels in set space. A character's `(x, y)` is its **contact point** (feet on the ground, or the perch point). `y` grows downward. `face = 1` looks right, `-1` looks left. Time is in seconds.

## 1. Repository layout and ownership

```
bin/cinecode.mjs            CLI                                   (owner: render)
engine/core/lib.mjs         primitives: rng, noise, ink, blob…    (shared; additions OK, no breaking changes)
engine/core/style.mjs       cel(), darken(), groundShadow(), eye() (owner: rigs)
engine/paint/*.mjs          background painting helpers            (owner: sets)
engine/cast/rig.mjs         rig contract helpers + registry        (owner: rigs)
engine/cast/<kind>.mjs      one file per rig                       (owner: rigs; human.mjs owner: human)
engine/set/set.mjs          makeSet(), anchors, props, routing     (owner: sets)
engine/set/kits/<kit>.mjs   one file per location kit              (owner: sets)
engine/film/*.mjs           load, validate, compile, camera, frame (owner: film)
engine/audio/wav.mjs        WAV read/write, resample               (done; read-only)
engine/audio/voice.mjs      Gemini TTS + cache + QA + lip envelope (owner: voice)
engine/audio/synth.mjs      DSP building blocks                    (owner: music)
engine/audio/music.mjs      procedural score                       (owner: music)
engine/audio/sfx.mjs        procedural sound effects + ambience    (owner: sfx)
engine/audio/mix.mjs        final audio mix                        (owner: sfx)
engine/lint/lint.mjs        staging and editing checks             (owner: lint)
engine/render/*.mjs         frame workers, encode, mux, sheets     (owner: render)
films/<slug>/               film.json, custom.mjs, audio cache, out/
templates/                  film.json starter, bible template      (owner: docs)
docs/                       guides                                 (owner: docs)
SKILL.md                    Claude Code skill: idea → film         (owner: docs)
```

## 2. Rigs (`engine/cast/`)

A rig is a module whose **default export** is a rig object:

```js
export default {
  kind: 'hare',                    // registry key, used in film.json  "rig": "hare"
  label: 'Hare',
  height: 118,                     // standing height in units at scale 1 (top of ears to feet), for framing
  headHeight: 40,                  // size of the head region at the top, for close-ups
  width: 70,                       // body length in units (footprint = width × 0.3 deep)
  params: { fur: '#b08559' },      // customizable look; film.json cast.params override these
  speeds: { walk: 90, run: 900 },  // world px per second at scale 1
  stride: { walk: 60, run: 124 },  // px travelled per gait cycle at scale 1
  poses: { stand: {...}, sit: {...}, sleep: {...}, ... },   // named pose parameter objects (numbers only)
  gaits: { walk: phase => pose, run: phase => pose },       // phase 0..1 per stride
  gestures: { laugh: { dur: 1.2, at: (u, base) => pose }, wave: {...}, nod: {...} },  // u 0..1
  expressions: ['neutral', 'happy', 'sad', 'surprised', 'angry', 'sleepy'],          // supported expr names
  perch: false,                    // true if it can stand on branches / ledges
  flies: false,
  draw(ctx, x, y, s, face, st) { ...; return { head: [hx, hy], mouth: [mx, my], bounds: [x0, y0, x1, y1] } },
  bbox(pose, face) { return [x0, y0, x1, y1] },    // in units relative to the contact point (scale 1)
}
```

`st` (draw state) fields, all optional:

| field | meaning |
|---|---|
| `pose` | pose params object (from `poses`, `gaits`, `gestures` or a blend via `mixPose`) |
| `expr` | expression name (`'happy'`, `'sad'`, …) → the rig maps it to eyes/brows/mouth |
| `talk` | 0..1 mouth openness from the lip-sync envelope; overrides the closed mouth while > 0.05 |
| `blink` | 0..1 eyelid closure (1 = closed) |
| `breath` | 0..1 idle breathing phase (subtle chest/shoulder rise) |
| `look` | -1..1 head turn/tilt toward a target (small rotation; never flips the body) |
| `lift` | units above the contact point (jumps/hops); the shadow stays on the ground |
| `params` | per-actor look overrides (colours, size variants) |
| `shadow` | false to skip the ground shadow (perched actors) |
| `t` | scene time, for secondary motion (ear/tail sway) |

`engine/cast/rig.mjs` exports: `register(rig)`, `getRig(kind)`, `listRigs()`, `mixPose(a, b, u)`, `idle(rig, t, seed)` → `{ breath, blink }` (seeded blink every 2.5–5 s, 0.15 s long), and `RIG_KINDS`.
`engine/cast/index.mjs` imports every rig file and registers it, then re-exports `getRig`, `listRigs`, `register`. Other modules import rigs **only** through `engine/cast/index.mjs`.
`engine/cast/sheet.mjs` exports `castSheet(kinds, outPath)` (every pose, gait phase, gesture key frame and expression of each rig, labelled).
**Rigs required:** hare, tortoise, fox, owl, squirrel, songbird, mouse, hedgehog, badger, deer, frog, beetle, butterfly. **New:** `human` (child/adult/elder variants via params). Every rig must support `talk`, `blink` and `expr` (rigs with no visible mouth may ignore `talk`).

`engine/core/style.mjs` exports `SHADE`, `cel(ctx, P, col, sh, w, seed)`, `darken(hex, f)`, `lighten(hex, f)`, `groundShadow(ctx, x, y, w, lift, a)`, `eye(ctx, x, y, rx, ry, state, iris, look)`.

## 3. Sets (`engine/set/`)

```js
import { makeSet } from '../set.mjs';
export default function kit(params = {}) {          // engine/set/kits/meadow.mjs
  return makeSet({
    id: 'meadow', W: 2800, H: 1500, refX: 1400, refY: 850,
    view: { x0: 500, x1: 2300, y0: 300, y1: 1400 },   // where the camera centre may go
    horizon: 700, laneY: 1040, baseS: 1.3,            // scale = baseS * (y - horizon) / (laneY - horizon)
    skies: { dawn: paintFn, morning: paintFn, golden: …, twilight: …, night: … },   // (x, r, w, h) => void
    layers: [ { k: 0.5, paint(x, r, S) {} }, { k: 1, paint(x, r, S) {} }, { k: 1.3, front: true, paint() {} } ],
    props: [ { id: 'owl_tree', x: 420, y: 1010, solid: { rx: 90, ry: 22 }, paint(x, r) {}, bounds: [x0, y0, x1, y1] } ],
    anchors: {
      stump_top:   { x: 2050, y: 903, type: 'surface', depth: 1012 },  // depth = the y that sets the scale
      owl_hollow:  { x: 436,  y: 604, type: 'hollow', depth: 1010, clip: [[x, y], …] },
      low_branch:  { type: 'perch', branch: { pts: [[x, y], …], w0: 26, w1: 9 }, depth: 1010, at: 0.5 },
      pond_edge:   { x: 1200, y: 1120, type: 'ground' },
    },
    walk: { region: [[x, y], …] | null, ground: (x) => y | null, water: [[[x, y], …]], stones: ['stone_1', …] },
    ambience: { day: 'meadow-day', night: 'meadow-night' },
  });
}
```

`makeSet` returns a **set instance** `S` with:

| member | contract |
|---|---|
| `S.build()` | paints all layers and props once into cached canvases (idempotent) |
| `S.scaleAt(x, y)` | actor scale at a ground point (perspective); ridge-type sets may return a constant |
| `S.groundAt(x)` | for ridge/path sets, the ground y at x; otherwise `null` |
| `S.anchor(name)` | `{ x, y, s, type, depth, clip? }` resolved (for perch: the top surface point at `at`) |
| `S.isWalkable(x, y)` | inside the walk region, not in water (unless on a stone), not inside a solid prop footprint |
| `S.route(from, to)` | list of `[x, y]` waypoints on walkable ground that avoids solid footprints and water |
| `S.drawSky(ctx, cam, skyName \| [[name, alpha]…], t)` | sky in screen space with slow drift |
| `S.drawBack(ctx, cam, opts)` | layers with `k ≤ 1`, *excluding props*; `opts.dof` blurs far layers |
| `S.propsSorted()` | props as depth-sortable items `{ y, draw(ctx) }` (drawn from cached sprites) |
| `S.drawFront(ctx, cam, opts)` | front layers (`front: true`) after actors |
| `S.colliders()` | `[{ id, x, y, rx, ry }]` solid footprints, for routing and lint |
| `S.bounds` | `{ x0, x1, y0, y1 }` camera centre limits (from `view`) |

**Props are depth-sorted with the actors.** Trees, stumps, rocks and stones are props, not painted into the ground layer, so a character behind a tree is correctly hidden by it. Parallax: a layer with factor `k` is offset by `(cam.cx - refX) * (1 - k)` horizontally and `(cam.cy - refY) * (1 - k) * 0.4` vertically.

`engine/set/kits/index.mjs` exports `getKit(name)`, `listKits()`, `registerKit(name, fn)`; other modules import kits **only** through it. `engine/set/sheet.mjs` exports `setSheet(kitNames, outPath)` (each kit at a wide view with anchors, solid footprints, walk region, water and routes drawn as a debug overlay).

**Kits required:** `valley`, `meadow`, `forest`, `stream`, `wayside`, `hill`. **New:** `village` (cottage with door and window, fence, well, path, garden) and `night-sky` variants of skies. Every kit defines at least 4 anchors and its ambience names.

## 4. The storyboard file (`films/<slug>/film.json`)

```jsonc
{
  "title": "The Lantern Moth",
  "logline": "One sentence.",
  "format": { "width": 1920, "height": 1080, "fps": 24, "captions": "dialogue" },  // captions: dialogue | all | none
  "titles": { "open": { "title": "…", "subtitle": "…", "dur": 6 }, "end": { "lines": ["The End"], "dur": 5 } },
  "voices": {
    "narrator": { "voice": "Sulafat", "tone": "warm, gentle storyteller" },
    "pip":      { "voice": "Puck",    "tone": "bright, curious child" }
  },
  "cast": {
    "pip": { "rig": "human", "name": "Pip", "voice": "pip", "params": { "age": "child", "hair": "#3a2a20", "shirt": "#e0703a" } },
    "fox": { "rig": "fox", "name": "Old Fox", "voice": "fox" }
  },
  "sets": { "meadow": { "kit": "meadow", "params": {} } },
  "scenes": [
    {
      "id": "s01",
      "set": "meadow",
      "time": "dawn",                              // or { "from": "golden", "to": "twilight" } across the scene
      "music": { "mood": "wonder", "intensity": 0.4 },   // optional; "none" for silence
      "ambience": "auto",                          // auto from the set + time, a name, or "none"
      "actors": {
        "pip": { "at": "pond_edge", "face": "right", "pose": "sit" },
        "fox": { "offstage": "right" }
      },
      "shots": [
        {
          "id": "s01-01",
          "camera": { "size": "wide", "on": ["pip"], "move": "push-in", "angle": "eye" },
          "beats": [
            { "say": "narrator", "text": "At the edge of an old forest…", "tone": "softly" },
            { "do": "walk", "who": "pip", "to": "stump_front" },
            { "do": "gesture", "who": "pip", "name": "wave", "with": "prev" },
            { "do": "enter", "who": "fox", "from": "right", "to": "x:1700" },
            { "say": "pip", "text": "Hello?", "tone": "curious", "expr": "surprised" },
            { "sfx": "owl-hoot", "after": 0.3 },
            { "wait": 1.0 }
          ],
          "hold": 0.6
        }
      ]
    }
  ]
}
```

### Beats

Beats run **in sequence** within a shot: each starts when the previous one ends. Modifiers: `"with": "prev"` starts together with the previous beat; `"after": 0.4` adds a delay; `"at": 2.0` pins the start time relative to the shot start. A shot lasts until its last beat ends, plus `hold` (default 0.5 s), unless `"dur"` is given. **Actor state carries over from shot to shot within a scene** (positions, poses), so continuity is automatic. A new scene starts from its `actors` block.

| beat | fields | duration |
|---|---|---|
| `say` | `say` (cast id or `narrator`), `text`, `tone`, `expr`, `vo` (true = speaker may be off-screen) | voice audio length (estimate `words / 2.6 + 0.3` before voicing) |
| `do: walk / run / hop / fly` | `who`, `to` (anchor name, `x:1500`, `x:1500,y:1060`, `near:<actor>`, `left-of:<actor>`), `speed` | route length / speed |
| `do: enter / exit` | `who`, `from` / `to` (`left`/`right` or a target) | as walk |
| `do: pose` | `who`, `pose`, `dur`, `expr` | `dur` (default 1) |
| `do: gesture` | `who`, `name` | rig gesture `dur` |
| `do: look` | `who`, `at` (actor/anchor) — turns to face it, head look | 0.3 |
| `do: turn` | `who`, `face` | 0.25 |
| `do: emote` | `who`, `expr` | 0 |
| `do: sit / stand / lie / sleep / wake` | `who` | 0.6 |
| `do: custom` | `name` (function in `custom.mjs`), `dur`, any params | `dur` |
| `sfx` | name, `gain`, `pan` | 0 |
| `fx` | `dust` / `splash` / `leaves` / `sparkle` / `rain` / `fireflies`, `at` (actor/anchor), `dur` | 0 |
| `music` | `mood`, `intensity`, or `sting` | 0 |
| `wait` | seconds | the value |

### Camera

`camera.size`: `establishing` (the whole view), `wide` (subject ≈ 18% of frame height), `full` (whole body ≈ 60%), `medium` (waist up fills ≈ 75%), `close` (head and shoulders fill ≈ 70%), `extreme-close` (face). `on`: actor ids and/or anchor names (the union of their bounds is framed). `move`: `static`, `push-in`, `pull-out`, `pan` (from `on[0]` to `on[1]`), `track` (follows the subjects), `tilt-up`, `tilt-down`, `handheld` (subtle seeded drift). `angle`: `eye`, `low`, `high`. Framing leaves **lead room** in the direction a single subject faces, keeps headroom, and is clamped to the set's `view` bounds. Optional `"dof": true` blurs the far layers (close-ups default to true).

### `custom.mjs` (optional)

```js
export const rigs = [ myRig ];               // extra rigs registered for this film
export const kits = { harbour: harbourKit }; // extra set kits
export const custom = { acornDrop: { draw(ctx, u, api) {}, sfx: [{ at: 0.3, name: 'plop' }] } };
```

## 5. Compiled plan (`engine/film/`)

```js
import { loadFilm } from './engine/film/load.mjs';        // parse + validate + resolve rigs/kits/custom
import { compile } from './engine/film/compile.mjs';
import { drawFrame, frameInfo } from './engine/film/frame.mjs';

const film = await loadFilm('films/lantern');              // throws ValidationError with a list of problems
const plan = compile(film, { voices });                    // voices: Map lineId → { wav, dur, env }  (optional)
drawFrame(ctx, plan, t);                                   // draws the frame at time t into a W×H context
frameInfo(plan, t);                                        // geometry for lint/sheets (see below)
```

`plan` fields (all times in seconds from film start):

```js
{
  W, H, fps, duration, title,
  scenes: [{ id, t0, t1, set }],
  shots:  [{ id, scene, t0, t1, size, set /* set instance */, cameraAt(t) → { cx, cy, zoom }, skyAt(t), gradeAt(t), dof }],
  lines:  [{ id, who, voice, tone, text, t0, t1, vo, narrator, shot }],     // id = stable hash of who+text+tone
  sfx:    [{ t, name, gain, pan, shot }],          // explicit + automatic (footsteps from gait contacts, hops, splashes)
  ambience: [{ t0, t1, name }],
  music:  [{ t0, t1, mood, intensity }, { t, sting }],
  captions: [{ t0, t1, text, style }],             // style: 'dialogue' | 'narration' | 'title'
  actorsAt(t) → [{ id, rig, x, y, s, face, st, visible, perch, airborne, action, shot }],
}
```

`frameInfo(plan, t)` → `{ shot, camera, actors: [{ id, x, y, s, face, screenBox: [x0, y0, x1, y1], headBox, contact: { x, y, kind }, airborne, perch, speaking }], captionBox, colliders }`.

**Lip sync:** `voices.get(lineId).env` is an array of mouth openness values (0..1) at the film fps; during a line the speaker's `st.talk` comes from it. Speakers also get `expr` from the beat. **Idle life:** every visible actor breathes and blinks (`idle()` from `rig.mjs`); actors that aren't speaking glance at the speaker (`look`) within 0.3 s of a line starting.

## 6. Audio (`engine/audio/`)

All audio is 48 kHz. Internal buffers are `Float32Array`s (mono) or `{ L, R }`.

- **`wav.mjs`** (already written; shared, read-only): `readWav(path)`, `parseWav(buf) → { sampleRate, channels: Float32Array[] }`, `writeWav(path, channels, sampleRate, bits = 16)`, `encodeWav(channels, sampleRate, bits)`, `resample(f32, from, to)`, `rms(f32, sampleRate, fps) → number[]`, `dbToGain`, `gainToDb`, `SAMPLE_RATE` (48000).
- **`voice.mjs`** (owner: voice): `voiceLines(film, plan, { cacheDir, model = 'gemini-3.8-flash-lite-tts', qaModel = 'gemini-3.8-flash', apiKey = process.env.GEMINI_API_KEY, concurrency = 2, onProgress }) → Map lineId → { wav, dur, env, qa: { wer, transcript } }`.
  - Request format: text = `"[<cast voice tone>, <line tone>] <text>"` (the bracketed direction is not spoken), `generationConfig.responseModalities = ["AUDIO"]`, `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. No system instruction (the lite model rejects it). The response is base64 WAV (24 kHz, 16-bit mono) in `candidates[0].content.parts[0].inlineData.data`.
  - **Cache:** `cacheDir/<id>.wav` + `<id>.json` (meta + qa + env). Cache hit → no network. Cached files are committed, so renders are reproducible without a key.
  - **QA:** transcribe with the QA model and compute the word error rate against the line; if WER > 0.2 or extra words were added at the start, regenerate (max 3 attempts, keep the best).
  - **Trim** leading/trailing silence (threshold −45 dBFS, keep 60 ms pad), resample to 48 kHz, compute `env` at the film fps (smoothed RMS mapped 0..1).
  - Retries with backoff on 429/5xx. Never logs the API key.
- **`synth.mjs`** (owner: music): oscillators (sine, triangle, saw, square, noise with seed), ADSR, biquad filters, one-pole smoothing, Karplus–Strong pluck, FM pair, delay, Schroeder/Freeverb reverb, stereo pan, soft clip, mixing helpers.
- **`music.mjs`** (owner: music): `scoreFilm(plan, { seed }) → { L, R }` and `composeCue({ dur, mood, intensity, key, tempo, seed }) → { L, R }`. Moods: `wonder, pastoral, tender, playful, tension, chase, sad, triumph, night, mystery`. Each mood sets scale, tempo, progression, instrumentation (pads, Karplus harp, soft piano, flute, strings, celesta/bells, soft percussion, bass). Cues crossfade (1.5 s); `sting` cues are short accents. Tasteful, quiet, film-score feel — not chiptune.
- **`sfx.mjs`** (owner: sfx): `makeSfx(name, { seed, dur, ...params }) → Float32Array` for: `footstep-grass, footstep-dirt, footstep-wood, hop, land, whoosh, splash, plop, rustle, thud, pop, chime, sparkle, owl-hoot, birdsong, cricket, frog-croak, wind, stream, fire, door-creak, bell`; `ambience(name, dur, { seed }) → { L, R }` for `meadow-day, meadow-night, forest-day, forest-night, stream, village-day, village-night, wind-hill`.
- **`mix.mjs`** (owner: sfx): `mixFilm(plan, { voices, music, sfxGain }) → { L, R }` — dialogue placed at line times, sfx at their times with pan, ambience beds, music **ducked under dialogue** (−10 dB, 150 ms attack, 400 ms release, computed in JS), a soft limiter; then `writeMaster(path, mix)` loudness-normalizes to −16 LUFS integrated with ffmpeg `loudnorm` (two-pass) and writes a 48 kHz WAV.

## 7. Lint (`engine/lint/lint.mjs`)

`lintPlan(plan, { step = 1/6 }) → { errors: [], warnings: [] }`; each issue: `{ rule, severity, t, shot, actor?, message, box? }`. `writeLintReport(plan, result, outDir)` writes `lint.json` and a contact sheet `lint.jpg` with the offending frames and boxes drawn.

| rule | catches |
|---|---|
| `floating` | contact point not on ground / an anchor surface / a perch, and not airborne by action |
| `inside-solid` | contact point inside a solid prop footprint (walking through a tree, stump, rock) |
| `in-water` | contact point in water, not on a stone, rig can't swim |
| `collision` | two actors' footprints overlap at similar depth |
| `offscreen-speaker` | a speaking actor (not `vo`) is less than 60% visible |
| `subject-size` | the framed subject's screen height is outside the range for the shot size |
| `caption-face` | the caption box overlaps a speaker's head |
| `cut-jump` | consecutive shots of the same set with nearly identical framing |
| `axis` | the left/right order of two talking actors flips across consecutive shots |
| `teleport` | an actor moves > 40 px between frames inside a shot |
| `scale` | actor scale differs from `set.scaleAt` by > 15% (perched actors use the anchor depth) |
| `timing` | overlapping dialogue, shots < 1.2 s, captions faster than 20 characters per second |

## 8. Render (`engine/render/`, `bin/cinecode.mjs`)

- Rendering is split into contiguous frame ranges, one per worker process (`--jobs`, default CPUs − 1), each encoding a segment with x264 (crf 17, yuv420p, same params); segments are joined with the concat demuxer (`-c copy`), then muxed with the master audio (AAC 192 k) and soft subtitles (`mov_text`); an `.srt` file is written alongside.
- `sheet`: one still per shot (middle) or at given times, as a labelled grid JPEG with captions and shot ids.
- `animatic`: half resolution, 12 fps, with the mixed audio — a fast preview.

CLI (`node bin/cinecode.mjs <command> films/<slug> [options]`):

```
new <slug>          scaffold a film from templates/
check               validate film.json (and custom.mjs)
plan                compile and print the shot list with times and durations
voice               generate/cache voices with QA (needs GEMINI_API_KEY)
sheet [--t=…]       contact sheet: one frame per shot, or the given times
lint                staging/editing checks → out/lint.json + out/lint.jpg; exit 1 on errors
music               compose the score → out/music.wav
mix                 mix dialogue, music, sfx, ambience → out/mix.wav
animatic            fast low-res preview with sound → out/animatic.mp4
render [--jobs=N]   final film → out/<slug>.mp4 + out/<slug>.srt
cast-sheet [kinds]  every rig in every pose/expression → out/cast-sheet.jpg
set-sheet [kits]    every kit with anchors, colliders and walk regions drawn → out/set-sheet.jpg
```

## 9. Round 2 extensions (all generic; first used by `films/seventy-six-summers`)

Everything in §1–8 still holds. These are additions; every one must be validated by `validate.mjs`, documented in the module header, and tested.

### 9.1 Storyboard additions (owner: film)

| where | field | meaning |
|---|---|---|
| say beat | `tts` | what the voice actually says; `text` stays the caption. Example: `{ "say": "nell", "text": "[laughs]", "tts": "Hahaha!" }`. Plan lines get `speak` (= `tts ?? text`); the line id hashes `speak`. A line whose `text` starts with `[` is **non-verbal** (`line.nonverbal = true`). |
| say beat | `trimEnd` | seconds cut off the end of the spoken audio (a line interrupted mid-word). The line's duration and lip sync use the trimmed audio. |
| beat | `{ "mark": "bloom" }` | a named instant (0 s long, timed like any beat). `plan.marks = { bloom: <film time> }`. Names are unique per film. |
| hop / place | `"to": "on:<actor>"` | **riding**: the actor sits on the other actor's mount point (see 9.2 `mount`). Scene actors may start mounted: `"fidget": { "on": "pebble", "pose": "sit" }`. A rider moves with its carrier, is drawn just in front of it (depth key + 0.01), casts no shadow, has contact kind `mount`, and keeps its own face/pose/gestures/speech. A rider can't walk/run; it hops off with an ordinary `hop` to a target. |
| walk / run beat | `"wade": true`, `"depth"` | the route may cross water. While the contact point is inside a water polygon the actor **sinks**: `sink` grows with the distance travelled into the water (0.6 px per px) up to `depth` units × s (default: 1.1 × rig height, i.e. fully under). The actor is drawn shifted down by `sink` and clipped above the waterline (the un-sunk contact y), with a ripple ring at the waterline. Riders share the carrier's shift and waterline clip. It rises again the same way on the far side. |
| look beat | `"to": "up" \| "sky" \| "down"` (plus existing targets) | sets `st.tilt` to +1 (up/sky) or −1 (down), blended over `rig.lookTime ?? 0.3` s. Use `to` for the target so `at` stays a time pin. |
| camera | `"to": "<size>"`, `"toOn": [...]` | for `push-in` / `pull-out`: the move ends at that size's framing (of `toOn`, default `on`). |
| camera | `"zoomTo": k` | the move ends at k × the start zoom. |
| camera | `"moveAt"`, `"moveDur"` | the move happens between these seconds of the shot (eased); before/after it the camera holds. |
| shot | `"time"`, `"grade"`, `"gradeTo"` | a shot may override the scene's time of day (a name or `{ "from", "to" }`, blended across the shot) and grade; `gradeTo` blends from `grade` to another grade (`"none"` = no special grade) across the shot. Example (a time-lapse): `"time": { "from": "night", "to": "dawn" }, "grade": "memory", "gradeTo": "none"`. |
| scene | `"overlays": ["name" \| { "name", "params" }]` | persistent drawings for the whole scene. Built-in fx names keep working; any other name is looked up in `custom.mjs` `overlays` (below). |
| scene | `"rim": { "dir", "color", "strength", "start", "rise", "width" }` | a rim light on every visible actor, drawn **after the grade** so night doesn't kill it: the actor's silhouette edge that faces `dir` (`left`, `right`, `top`, `upper-left`, `upper-right`) glows `color` (screen blend) at `strength` 0..1, `width` screen px (default 3, at least 2). `start` is a mark name or seconds from scene start; strength eases in over `rise` s. |
| sfx beat | names | validated against `SFX_NAMES`/`SFX_ALIASES` from `engine/audio/sfx.mjs` plus `custom.mjs` `sounds`; unknown names are problems. |
| music | stings / moods | validated against `MOOD_NAMES` and `STING_NAMES` exported by `engine/audio/music.mjs` (one source of truth). Music cues also accept `motif`, `motifVoice`, `hold`, `downbeat`, `tempo` (see 9.4). |
| top level | `"score": { "key": "C", "motif": "G4:1 E4:0.5 G4:0.5 A4:2 C5:3" }` | the film's melodic motif as `note:beats` tokens (see 9.4). |

`custom.mjs` may also export:

```js
export const overlays = {
  comet: { layer: 'sky', draw(ctx, api) {} },   // layers: 'sky' (screen space, after the sky, before back layers)
};                                              // 'back' (world, after back layers, before props/actors)
                                                // 'world' (world, after actors and world fx), 'front' (world, after front layers)
                                                // 'grade' (screen, after the grade, before glow fx), 'screen' (screen, last before titles)
export const sounds = { 'tiny-bell': ({ seed, dur, params }) => new Float32Array(48000) };   // 48 kHz mono
```

Overlay and custom-beat `api`: `{ t, st /* s since scene start */, su /* 0..1 scene progress */, lt /* s since shot start */, scene, shot, set, cam, W, H, plan, marks, params, seed, actor(id), anchor(name), toScreen([x, y]) → [sx, sy], toWorld([sx, sy]) → [x, y], silhouette(ctx, actor) /* the actor drawn as the frame draws it, no shadows, screen space */ }` (custom beats keep their `u` argument and also get these). The `world` transform is already applied for world layers; `toScreen` works in every layer.

**Fixes owed (film):** the dissolve draws the *outgoing* scene with the *incoming* scene's actors (`picture()` must take the actors of the shot's own scene at t); the camera composes a subject's head from the highest head over the whole shot (use the resting head; ignore transient jump/gesture apexes); the validator must accept `touch` and `contact` on beats (lint reads them); `frameInfo` must apply `a.squash`.

### 9.2 Rig additions (owners: rigs, human)

- `st.tilt` −1..1: head pitch (+1 = look up as far as the species can, −1 = down). Rigs that can't pitch ignore it. Optional `rig.lookTime` (s) for slow lookers (tortoise ≈ 1.0).
- `rig.mount(pose, params) → [ux, uy]`: the riding point in units relative to the contact point at face = 1, scale 1 (the film mirrors x by face and multiplies by s). Required for `tortoise`; optional elsewhere (e.g. deer, badger may add one).
- Tortoise params: `star` (opacity 0..1 of a pale five-point natural marking, off-centre on a rear scute; 0 = none), `starCol`, `moss` (colour or `null`: moss patches on the shell top), `seam` (scute seam colour), `lids` (0..1 resting lid closure for an old animal), `wet` (0..1: darker, glossier shell and skin with a few falling drips animated by `st.t`), `iris`.
- Squirrel params: `tail` (tail size multiplier, 0.4..1.8; < 0.7 also flattens it like a wet paintbrush).
- Owl: an expression `one-eye` (one eye open, one shut).
- Human (`human.mjs`): `hairStyle: 'braids'`; `glasses` may be a frame colour (true = default) and gets one small glint highlight on the near lens; `tear` param 0..1 (one extra wet highlight on the lower lid); `build: 'slight'`; `draw()` must accept `ctx = null` (bounds only, like the animal rigs); `jump-for-joy` must set `pose.lift`; `st.tilt`; `view`: `'profile'` (default: one eye, the nose on the face edge) or `'three-quarter'` (the older head with both eyes).

### 9.3 Audio additions (owners: voice, sfx, music)

- `voice.mjs`: speak `line.speak ?? line.text`; non-verbal lines (`line.nonverbal`) skip the WER gate (QA still transcribes; pass unless the take is empty or the direction is audible); `trimEnd` is applied after the cache (the cache stores the full take): cut, 2-frame fade-out, env recomputed — so `dur`/`env` returned are the trimmed ones.
- `sfx.mjs` new generators (all deterministic, levels in the table, tested): `hum` (closed-mouth "mm" voice singing `params.notes` = `"G4:1 E4:0.5 …"` at `params.tempo` bpm, `params.voice` = `child | adult | elder`, vibrato and breath), `music-box` (comb-tine tones playing `params.notes`, `params.slow` 0..1 ritardando), `gasp`, `sniff`, `snore` (low reedy contrabassoon-like snore), `breath` (`params.heavy`), `slosh`, `bubbles`, `wind-swell` (a rising gust, `dur`), `drip`; alias `gate-creak` → `door-creak`, `laugh` is **not** synthesized (laughs are TTS lines).
- `mix.mjs`: custom sounds from `plan.sounds` (compile copies `custom.mjs` `sounds` there); sfx `dur` and `params` passed through; `cinecode music`, `mix` and `animatic` must produce audio for `films/_test` even with no voices cached (missing lines are skipped with a warning).
- `music.mjs`: `STING_NAMES` export; new stings `plunk` (pizzicato pluck), `stab` (timpani + brass hit), `swell`. **Motif:** `scoreFilm` reads `plan.score` (`{ key, motif }`, parsed `note:beats` tokens); a cue with `motif: n` states the first n notes on `motifVoice` (`bassoon | flute | cello | horn | celesta | violin | strings | music-box | tutti`) starting at the cue's first bar, at the cue's `tempo` (or the mood's); with `hold: true` the last stated note sustains to the cue's end (a held pedal). `downbeat: true` puts bar 1 exactly at the cue's `t0` (no fade-in lead; the previous cue is cut there) — used to land a chord on a mark. `music: "none"` fades the score out over 0.3 s at the scene start and keeps silence.

### 9.4 Lint additions (owner: lint)

Riders (`contact.kind === 'mount'`) are not floating and don't collide with their carrier; wading actors are allowed in water; scale/size rules divide by cast `scale`; riders and sunk actors use their visible (clipped) box for offscreen/size checks.
