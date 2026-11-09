---
name: build-kit
description: Build a new cinecode set kit (a place: a harbour, a cave, a beach, a city street, a snowy wood, a room) when no built-in kit can be the location, and pass its gate (`cinecode verify-kit`). Use when a film needs a location the engine doesn't have.
---

# Build a set kit

Use this after the cinecode skill decided no built-in kit (meadow, forest, stream, wayside, valley, hill, village) can be the place with its params and time of day. A kit is one file that default-exports `(params) => set`, built with `makeSet`; cinecode registers it under its file name and stages, routes, frames and lints on it exactly like a built-in.

- One film: `films/<slug>/kits/<name>.mjs` (`"sets": { "harbour": { "kit": "<name>" } }`). Several films: `cinecode/kits/<name>.mjs` at the project root.
- CINECODE below is cinecode's own folder, `${CLAUDE_SKILL_DIR}/../../..`. The CLI is `cinecode` (if it isn't on the PATH: `node ${CLAUDE_SKILL_DIR}/../../../bin/cinecode.mjs`).

## Steps

1. **Read a model**: `CINECODE/engine/set/kits/meadow.mjs` (open ground, a hollow tree, a pond), `forest.mjs` (a path between trunks), `stream.mjs` (water and stepping stones), `hill.mjs` (a ridge set: ground as a line), `village.mjs` (buildings, lights at dusk). Draw it: `cinecode set-sheet meadow -o out/set-meadow.jpg`.
2. **Start from the starter**, which passes the gate: `mkdir -p films/<slug>/kits && cp ${CLAUDE_SKILL_DIR}/starter.mjs films/<slug>/kits/<name>.mjs`, set `id` to the name, run the gate once.
3. **Lay out the staging first** (anchors, walk region, props with solid footprints, water), from the screenplay: where everyone stands, sits, perches and walks. Then paint the layers back to front.
4. **Gate**: `cinecode verify-kit films/<slug>/kits/<name>.mjs` until every check passes, then **Read both review images** in `films/<slug>/out/verify/`. Both are required before the kit goes into `film.json`.
5. **Use it**, then sheet every shot on it: framing, actors' sizes at each anchor, nothing floating.

## The contract (`makeSet` from `cinecode/set`; DESIGN.md §3, `CINECODE/docs/sets.md` "Adding a kit")

| field | meaning |
|---|---|
| `id`, `W`, `H`, `refX`, `refY` | name, nominal size, the reference camera centre for parallax |
| `area` | the painted world `{ x0, x1, y0, y1 }`: at least 3200 × 1800 (the widest view a camera shows) |
| `view` | where the camera centre may go (inside `area`) |
| `horizon`, `laneY`, `baseS`, `lane(x)` | perspective: scale = `baseS × (y − horizon) / (laneY − horizon)`, 0 at the horizon; `lane(x)` is the main lane (`x:1500` stands there). A ridge set gives `walk.ground(x)` and `walk.band` instead (the hill). |
| `layers` | `[{ k, paint(ctx, r, S, E), front, outline, anim, shade }]`: `k` the parallax (0.4 far … 1 the ground … 1.3 `front: true`, over the actors). `paint` draws once in world pixels inside `E` with the seeded `r()`, then it is cached; cover all of `E` horizontally or the camera sees a gap. `anim(ctx, t)` for moving parts (water shimmer). |
| `props` | `[{ id, x, y, base, solid: { rx, ry }, bounds, paint(ctx, r), ground(ctx), anchors }]`: things sorted in depth with the actors by `y` (trees, rocks, houses). `solid` is the footprint actors route around; `bounds` must contain everything `paint` draws (the gate flags a clipped sprite); `anchors` on a prop are its surfaces. |
| `anchors` | at least 4: `{ x, y, type }`, type `ground` (default; must be walkable), `surface` (a top: `prop`, `depth`), `perch` (`branch: { pts, w0, w1 }`, `at`), `hollow` (`clip` polygon), `view` (far landmarks). `face`, `s`, `surface` (footstep sound) optional. Name them for the story (`dock_end`, `cave_mouth`). |
| `walk` | `region` (the walkable polygon: keep it below the horizon band), `water` (polygons; wading and stones), `stones` (prop ids), `paths` (`[{ poly, surface }]`) |
| `ambience` | `{ day, night }` from meadow-day, meadow-night, forest-day, forest-night, stream, village-day, village-night, wind-hill |
| optional | `skies` (default: the eight painted skies), `light`, `defaultSky`, `surface`, `sampleRoute` |

Paint only with the `r()` you are given (never `Math.random()`), and from the params: two builds must paint the same picture.

## The house style

The helpers in `cinecode/paint/paint` (`CINECODE/engine/paint/`): `ridge`, `hazeBand`, `paper` (far hills, haze, paper grain), `treeline`, `bigTree`, `bush`, `boulder`, `stump`, `meadowFloor`, `blades`, `fern`, `reeds` (nature and scenery), `paintWater`, `waterShimmer`, `lilyPad`, `steppingStone` (water), `contactShadow` under every prop; cottages, fences, wells, benches, lanterns, cobbles and `glow` in `cinecode/paint/structures`. Light from the upper left (`LEFT`), haze toward the horizon, gouache dabs (`clump`), an ink `outline` on mid layers, a ground layer that fills to the bottom of `E`, and foreground grass (`front: true`) for depth. Build new structures from the same pieces (inked polygons with `cel`-style shade) rather than flat fills.

## The gate: `cinecode verify-kit <file>`

| check | fails when | fix |
|---|---|---|
| contract | not a function, or not a `makeSet` set | `export default function name(params = {}) { return makeSet({ … }); }` |
| anchors | fewer than 4; a ground anchor off the walk region or in a solid or water; a scale outside 0.2–4; a hollow's contact outside its clip; a perch off its branch | move the anchor, widen `walk.region`, check `horizon`/`laneY` |
| world | a missing sky; an unknown ambience; `area` smaller than 3200 × 1800; `view` outside `area`; scale not growing toward the viewer; the lane outside the picture; a layer that leaves a gap at some camera | widen `area`/`E` coverage; paint each layer across its whole extent |
| walk | a collider's centre walkable; open water walkable; a route between two ground anchors blocked or crossing a solid | separate solids, leave lanes between props |
| paint | a time of day leaves the frame unpainted; a prop clipped by its `bounds`; two builds differ | fill to the edges; widen `bounds`; use `r()` |

Then **look at** `<name>.jpg` (the set at its widest view with the walk region, water, solid footprints, anchors with a hare-height tick at each one's scale, and a sample route) and `<name>-times.jpg` (dawn to night). Fix what doesn't read: an anchor whose tick is too tall or too short for the place, a prop floating or sunk, a flat or empty area the camera will frame, a night where nothing can be seen.
