---
name: build-effect
description: Build a new cinecode effect (an overlay, a custom beat or a sound: a storm, lightning, snow, a glow, a swarm, a spell, a comet, a rain bed, thunder) when the built-in fx don't have it, and pass its gate (`cinecode verify-effect`). Use when a film needs weather, light, particles, a drawn prop that follows an actor, or a sound the engine lacks.
---

# Build an effect

Built-in effects first: `fx` beats (`dust`, `splash`, `sparkle`, `leaves`, `rain`, `fireflies`, `motes`, `mist`; the last five also as scene `overlays`), the built-in custom beats and overlays (`skydot`, `sunglow`, `starstream`, `eyepiece`, `lightpulse`, `orbit`, `sizerow`, `moonlets`, `debris`: what each draws and its params in `${CLAUDE_SKILL_DIR}/../cinecode/references/effects.md`), the built-in sounds, rim light, grades (`CINECODE/docs/storyboard.md`). When none is the thing, build it, or start from the built-in that is nearest (`CINECODE/engine/effects/<name>.mjs`) under a name of your own: an effect named like a built-in replaces it for the whole film (`check` lists the file with "replaces the built-in …"). An effect file exports any of `overlays`, `custom` (beats) and `sounds`, the same shapes as `custom.mjs` (`CINECODE/docs/effects.md`), and is loaded with the film.

- One film: `films/<slug>/effects/<name>.mjs` (or, for a few lines, the film's `custom.mjs`). Several films: `cinecode/effects/<name>.mjs` at the project root.
- CINECODE below is cinecode's own folder, `${CLAUDE_SKILL_DIR}/../../..`. The CLI is `cinecode` (if it isn't on the PATH: `node ${CLAUDE_SKILL_DIR}/../../../bin/cinecode.mjs`).
- Models: `${CLAUDE_SKILL_DIR}/starter.mjs` (a glow that follows an actor, a dust puff, a bell), `CINECODE/engine/effects/` (the built-ins: `debris.mjs` and `moonlets.mjs` draw at depth, `eyepiece.mjs` over the whole frame for one shot), `CINECODE/films/storm-shelter/custom.mjs` (a storm sky with bolts at marks, a storm grade, spray, thunder, a rain bed), `CINECODE/films/glim/custom.mjs` (a firefly glow, a swarm keyed to a mark), `CINECODE/films/kite/custom.mjs` (a kite on a string from a hand), `CINECODE/films/seventy-six-summers/fx/` (comet, mist, reflections).

## Steps

1. `mkdir -p films/<slug>/effects && cp ${CLAUDE_SKILL_DIR}/starter.mjs films/<slug>/effects/<name>.mjs`; keep what you need, rename.
2. Use it in `film.json`: a scene's `"overlays": [{ "name": "storm", "params": { … } }]` (add `"shots": ["2.1", "2.3"]` to draw only in those shots of the scene), a beat `{ "do": "custom", "name": "puff", "who": "pip", "dur": 0.8 }`, a sound `{ "sfx": "thunder", "params": { "near": 1 } }`. Key timed events to `{ "mark": "bolt" }` beats (`api.marks.bolt`), not seconds. Mind a custom beat's time (below): `"hold": false` and `"scope": "shot"`.
3. `cinecode check films/<slug>` (lists `effects/<name>.mjs`; an unknown overlay name is an error, an unknown custom beat a warning).
4. **Gate**: `cinecode verify-effect films/<slug> <name…>` until every check passes, then **Read** the review strip (`films/<slug>/out/verify/effects-<names>.jpg`: three frames from the first use of each drawn effect: a beat's span, an overlay's scene, or only the shots its `"shots"` names, or, for one that keeps to some shots by itself, the shots it draws in). Required before you move on.
5. Strip every shot that uses it (`cinecode sheet films/<slug> --shots=2.1@0.2,2.1@0.5,2.1@0.8 --cols=3`) and look: it never covers a face or makes a speaker unreadable, and it reads at the shot's size.

## The contract

- **Overlay**: `{ layer, draw(ctx, api) }`, drawn every frame of the scenes that list it (or of the shots their `"shots"` names). **Custom beat**: `{ layer, sfx: [{ at, name, gain }], draw(ctx, u, api) }`, `u` 0 → 1 across the beat's `dur`. **Sound**: `({ seed, dur, params }) => Float32Array`, 48 kHz mono, peak well under 1 (the mixer doesn't normalise).
- **A custom beat's time.** It takes its `dur` in the beat timeline: laid `"with": "prev"` over a line, a beat longer than the line holds the next line back. `"hold": false` plays its whole `dur` without holding the next beat or the shot. It also lasts its whole `dur` on into the next shots of the scene (and a dissolve's fading picture): `warnings.mjs` warns, `"scope": "shot"` ends it at its cut (its later `sfx` dropped too), `"scope": "scene"` keeps it on and says so. The engine reads `scope` and `hold` from the beat: don't use them as params of your own.
- **Layers**, in drawing order: `sky` (screen px, after the sky, before land), `back` (world, before props and actors), `depth` (world, at each piece's depth: hands pieces to the depth sort, below), `world` (world, after the actors; the default), `front` (world, after the front layers), `grade` (screen px, after the time-of-day grade: **emitted light goes here** or night greys it), `screen` (screen px, last before titles).
- **api**: `t` (film s), `st` (s into the scene), `su` (scene 0..1), `lt` (s into the shot), `params`, `seed`, `marks`, `W`, `H`, `cam` (`zoom`), `set` (`props`, `horizon`, `lens`), `shot`, `actor(id)` (`x`, `y`, `z`, `s`, `face`, `box`, `head`, `mouth`, `st`; null off stage), `anchor(name)`, `toScreen([x, y])`, `toWorld([sx, sy])`, `project([x, y, z])`, `item([x, y, z], draw)`, `silhouette(ctx, actor)`. World layers already have the camera transform; size screen-space things by `api.cam.zoom` × the actor's `s`.
- **Depth.** An actor with a `z` (off the stage) is drawn at its depth's scale: `api.project([x, y, z])` → `[sx, sy, s, a]` (its screen point, screen px per world px there, its pass of the lens: 1 until 0.04 × the lens from it, 0 by 0.01 × it, don't draw; a near piece off the axis has left the frame by then, so never fade it yourself mid-frame) places anything at its depth on any layer. To be hidden by what is nearer and hide what is farther, draw on the `depth` layer through `api.item([x, y, z], (ctx, P) => …)` (ctx in the world transform of that depth, `P = { x, y, s, z, a }`); anything drawn straight on ctx there lands behind the set. For planets: `globeOf(api, who)` and `atDepth(ctx, api, z)` from `cinecode/paint/planets` (`CINECODE/docs/effects.md`, "Depth").
- **Deterministic and stateless**: workers draw frames out of order, so a frame may depend only on `api.t`/`u`, the params, `api.seed` and a seeded `rng()` (`cinecode/lib`) whose numbers are all drawn up front, before any `continue`. No `Math.random()`, `Date.now()`, or variables kept between calls.

## The house style

Soft gouache and ink, not neon: inked edges (`ink`, `line`) on solid things, soft radial gradients with `screen` or `lighter` for light, colours from the scene's palette, a hint of wobble. Light comes from the upper left. Particles are few and varied in size; motion eases. Match the grade: warm light on `grade` at dusk and night, cold multiply for storms (`storm-light`).

## The gate: `cinecode verify-effect <film> [names…]`

| check | fails when | fix |
|---|---|---|
| layer | not one of the layers | pick the layer from the list (the gate's own list doesn't have `depth` yet, so an effect on it fails this check alone: judge the rest from the other checks and the strip) |
| order | a frame differs when frames are drawn in another order | stateless: no variables kept between calls; draw every random number first |
| draws | the effect changes nothing in its frames | check the times it is active, `api.actor` returning null, alpha 0, drawing off screen |
| sound | not a non-empty Float32Array; not finite; peak ≥ 1; two calls differ | scale it down; seed the noise from `seed` |

Without names it checks every effect the film uses, built-in ones too. An effect the film doesn't use yet is only shape-checked: use it in a shot first. An overlay kept to some shots is looked at in those shots. Then look at the strip: is it where the story needs it, at a size that reads, under (or over) the right things, and does it leave faces and captions clear?
