---
name: build-rig
description: Build a new cinecode rig (a character or a prop the camera frames: a wolf, a crow, a dragon, a kite, a strawberry, a lantern) when no built-in rig reads as it, and pass its gate (`cinecode verify-rig`). Use when a film needs a character or object the engine doesn't have, or when an adapted rig wouldn't read as the thing.
---

# Build a rig

Use this after the cinecode skill's "reuse, adapt, build" step decided that nothing built in reads as the thing. A rig is one file that default-exports the rig; cinecode registers it by its `kind` when the film loads, and from then on it is cast, staged, framed, lit, linted and sheeted exactly like a built-in.

- One film: `films/<slug>/rigs/<kind>.mjs`. Several films of the project: `cinecode/rigs/<kind>.mjs` at the project root.
- CINECODE below is cinecode's own folder, `${CLAUDE_SKILL_DIR}/../../..`. The CLI is `cinecode` (if it isn't on the PATH: `node ${CLAUDE_SKILL_DIR}/../../../bin/cinecode.mjs`).

## Steps

1. **Pick a model to learn from** and read it: four legs `CINECODE/engine/cast/fox.mjs` (or `badger`, `deer`: `leg()`, `quadFeet()`), a bird `songbird.mjs` or `owl.mjs` (perching, `fly` gait), something tiny `mouse.mjs` or `beetle.mjs`, a prop `CINECODE/films/strawberry-race/rigs/strawberry.mjs` (a pose per state, `expressions: ['neutral']`). Draw it: `cinecode cast-sheet fox -o out/fox.jpg` and look.
2. **Start from the starter**, which passes the gate: `mkdir -p films/<slug>/rigs && cp ${CLAUDE_SKILL_DIR}/starter.mjs films/<slug>/rigs/<kind>.mjs`. Set `kind` (the file name), `label`, then run the gate once to see a pass.
3. **Reshape it** pose by pose: body and head shapes, limbs, the face, colours as `params` (so the cast can recolour it), then `height`/`headHeight`/`width` to match the drawing. Rerun the gate after each big change.
4. **Gate**: `cinecode verify-rig films/<slug>/rigs/<kind>.mjs` until every check passes, then **Read both review images** it writes to `films/<slug>/out/verify/` and fix what looks wrong (below). Both are required before the rig goes into `film.json`.
5. **Use it**: `"cast": { "rex": { "rig": "<kind>", "params": { … } } }`. `cinecode check` lists `rigs/<kind>.mjs`; then sheet and strip the shots with it (`cinecode sheet films/<slug> --shots=1.3@0.2,1.3@0.5,1.3@0.8 --cols=3`).

## The contract

`makeRig` (`import { makeRig } from 'cinecode/rig'`) turns a `paint()` into the full rig (DESIGN.md §2, `CINECODE/docs/cast.md` "Adding a rig"):

| field | meaning |
|---|---|
| `kind`, `label` | registry key (= file name) and display name |
| `height`, `headHeight`, `width` | units at scale 1: standing height (framing, lint), head size (close-ups), body length (routing footprint). The gate holds `height` to the drawn stand pose within 12%. For scale: mouse 17.5, frog 19, hedgehog 24, songbird 24, fox 83, hare 103, deer 143. |
| `params` | colours and look switches; the cast's `params` override them. Use them in `paint` as `o.P.<name>`. |
| `poses` | named pose objects, **numbers only**, `stand` required; give `sit`, `sleep`, `alert` (the `sit`/`sleep`/`wake` beats use them), `lie`, `perch` when it can. **Every pose carries every key** (a key one pose lacks pops when a gesture blends into it). |
| `gaits`, `speeds`, `stride`, `steps` | `walk` (and `run`; `fly` for a flier) as `phase => pose`, phase 0..1 per stride, looping (phase 0 = phase 1). `speeds` (units per second) and `stride` (units per cycle) at scale 1. `footAt()` plants a foot and sweeps it back one stride so feet don't slide; `feet(pose)` → `[[x, y, planted], …]` and `steps` (phases where a foot lands) make footsteps and the slide check work. |
| `gestures` | `gest(dur, [[u, deltas], …])` (starts and ends on its base pose), or `{ dur, keys, at(u, base) }`; `jumpAt()` for jumps (sets `lift`). |
| `expressions` | default all eleven (neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined); `['neutral']` for a thing with no face (no talk or blink checks). |
| `flies`, `perch` | a flier needs `flies: true` and a `fly` gait (it can hover with `"height"`); `perch: true` stands on branches. |
| optional | `shadowW` (ground shadow half-width), `mount(pose, params)` (a riding point), `lookTime`, `hangPoses`, `breathPeriod`. |

`paint(T, pose, F, o)` draws in **local units**: origin = the contact point (feet), +x forward (mirrored for `face: -1` by the engine, never by you), ground y = 0, up is negative y. `T` records the bounds of everything filled or stroked: draw only through `T`. `F` is the face: `F.eye` (`open`, `wide`, `happy`), `F.lid`, `F.tilt`, `F.cheek`, `F.browY`, `F.browT`, `F.smile`, `F.open` (mouth, follows the voice), `F.round`, `F.look` (−1..1 head turn), `F.pitch` (−1..1 head up/down; `pitchPose()` applies it), `F.breath`. `o.P` params, `o.t` scene time (ear and tail sway), and set `o.out.head = T.map(x, y)` and `o.out.mouth = T.map(x, y)`: the camera composes close-ups on the head, captions avoid it, the mouth is where talking happens.

Deterministic and stateless: no `Math.random()`, `Date.now()` or variables changed between calls; seeded detail comes from `rng(seed)` (`cinecode/lib`) drawn the same way every call.

## The house style

- `cel(T, pts, colour, shade, ink, seed)` (`cinecode/style`): fill, one hard lavender shadow on the side away from the upper-left light, a wobbly ink outline. Every body part goes through it.
- `line(T, pts, width, { seed, color, taper })`: inked strokes (legs of small animals, whiskers, toes, antennae). `eye(T, x, y, rx, ry, F.eye, iris, F.look * k, F.lid, F.tilt, { cheek: F.cheek })` and `brow(T, x, y, w, F.browY, F.browT, colour)`: the storybook eye and brow every rig uses.
- Shapes: `ell(cx, cy, rx, ry, seed, wobble)` and `rpoly(pts, r, { seed })` (`cinecode/lib`) for hand-drawn ovals and rounded polygons; `smoothPts(T, pts)` (`cinecode/style`) to round a polygon into a curve; `tube()`, `spine()` (tails), `leg()`, `ik2()`, `quadFeet()` in `cinecode/rig`.
- Colour: muted gouache, ink `#2a2130`; the far legs and far wing drawn first and darker (`darken(col, 0.8)`); a lighter belly or muzzle patch without ink (`cel(…, ink 0)`); big readable eyes on small animals.
- Compare with the house rigs in the line-up image: same ink weight, same shading, a size that makes sense next to the hare, the child and the mouse.

## The gate: `cinecode verify-rig <file>`

| check | fails when | fix |
|---|---|---|
| contract | a field is missing or not a number | the table above |
| size | `height` far from the drawn stand pose; stand not touching the ground; `lift` ignored | measure `-bbox(stand)[1]`; the contact point is the feet |
| bounds | pixels painted outside the bounds `draw()` reports (both facings) | draw through `T` only; a raw `ctx` or `drawImage` isn't tracked |
| ground | a pose, gait phase or gesture frame goes below y = 0 | raise the body (`by`), clamp feet with `footAt`; legs that hang on purpose go in `hangPoses` |
| flip | face −1 isn't the mirror of face 1 | never branch on `o.face` in `paint` |
| deterministic | the same state draws different pixels | no `Math.random()`, `Date.now()` or state between calls |
| face | an expression, `talk` or `blink` changes nothing in the head | use every `F` field: lids and brows for moods, `F.open` for the mouth, `F.lid` for blinks |
| motion | a gait doesn't loop, a planted foot slides, a gesture doesn't start and end on its pose | `footAt` with the gait's own `stride`; every key in every pose; `gest()` keys `[0, null]` … `[1, null]` |

Then **look at** `<kind>.jpg` (every pose, four phases of each gait, gesture keys, every expression, talk and blink, with bounds, head and mouth marked) and `<kind>-lineup.jpg` (both facings beside hare, human and mouse at one scale). Fix anything that doesn't read: a face that looks the same in two moods, a walk whose legs cross wrongly, a head anchor off the head, the wrong size beside the others.
