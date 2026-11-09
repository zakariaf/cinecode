# Custom effects: custom.mjs

When a film needs something the engine doesn't have (a comet, mist that parts, a glow around a lantern, a new sound,
a new animal or place), it goes in the film's own `films/<slug>/custom.mjs`. cinecode loads it together with
`film.json`; `check` reports `, custom.mjs` when it does, and every problem in it as a check error.

```js
// films/<slug>/custom.mjs: every export is optional
export const custom = { … };    // custom beats: { "do": "custom", "name": … }
export const overlays = { … };  // whole-scene drawings: a scene's "overlays": [ … ]
export const sounds = { … };    // new sound effects: { "sfx": … } and custom beats' sfx
export const rigs = [ … ];      // new characters (see cast.md, "Adding a rig")
export const kits = { … };      // new locations (see sets.md, "Adding a kit")
```

`cinecode new` writes a working example (`templates/custom.mjs`): a custom beat that throws glints from a character,
an overlay of sunbeams and a bell sound. `films/_test/custom.mjs` is another small one, and
`films/seventy-six-summers/custom.mjs` with its `fx/` folder a large one (a comet, mist, a far hill, a reflection).

Film code imports the engine's helpers by the name `cinecode`, never by a relative path, so a film works wherever it
lives (in this repo, in another project, in a copy under `out/`):

```js
import { rng, ell, ink } from 'cinecode/lib';             // engine/core/lib.mjs
import { cel, eye, darken } from 'cinecode/style';         // engine/core/style.mjs
import { makeRig, mixPose } from 'cinecode/rig';           // engine/cast/rig.mjs
import { makeSet } from 'cinecode/set';                    // engine/set/set.mjs
import { ridge, paper } from 'cinecode/paint/paint';       // engine/paint/paint.mjs (nature, scenery, water, sky, …)
import { glow } from 'cinecode/paint/structures';         // engine/paint/structures.mjs (cottages, lanterns, glow)
import { grade } from 'cinecode/engine/film/grade.mjs';    // any other engine file
```

**Extension folders.** Effects, rigs and kits can also be files of their own, loaded with the film before
`custom.mjs` (which wins on a name clash). `check` lists every file it loaded.

| folder | each file | registered as |
|---|---|---|
| `films/<slug>/effects/` | exports `custom`, `overlays` and/or `sounds`, as above | merged with `custom.mjs`'s |
| `films/<slug>/rigs/` | `export default makeRig({ kind, … })` | its `kind` (see cast.md, "Adding a rig") |
| `films/<slug>/kits/` | `export default (params) => makeSet({ … })` | the file name (see sets.md, "Adding a kit") |
| `cinecode/effects/`, `cinecode/rigs/`, `cinecode/kits/` | the same, shared by every film of a project | the nearest `cinecode/` folder above the film, up to the project root (the folder with `.git`) |

Files whose name starts with `_` are skipped (helpers they import). Each kind has a gate that checks it the way the
engine will use it and draws review images: `cinecode verify-effect <film> [names…]`, `cinecode verify-rig <file>`,
`cinecode verify-kit <file>`; the `build-effect`, `build-rig` and `build-kit` skills walk through them.

## Two rules

- **Deterministic.** No `Math.random()` or `Date.now()`. Use `api.seed` (or a fixed number) with a seeded
  generator: `rng(seed)` from `cinecode/lib`, or your own. Every render of a
  frame must be identical.
- **Stateless.** Draw only from what you are given (the time, the params, the api), never from state kept between
  calls. Frames are drawn out of order: the contact sheet draws single frames, and a render splits the film between
  several worker processes. If something random decides whether an element is drawn at all, draw all its random
  numbers first, so the sequence is the same on every frame.

Match the house style where you can: inked outlines, soft gouache colour, light from the upper left. Key timed events to
`mark` beats (`api.marks`) rather than hard-coded seconds, so they move with the edit.

## Custom beats

A custom beat draws something for a while inside a shot:

```json
{ "do": "custom", "name": "glints", "who": "pip", "dur": 1.6, "with": "prev" }
```

```js
export const custom = {
  glints: {
    layer: 'world',                                   // default 'world'
    sfx: [{ at: 0, name: 'tiny-bell', gain: 0.6 }],   // sounds at seconds from the beat's start
    draw(ctx, u, api) {                               // every frame of the beat; u goes 0 → 1
      const a = api.actor(api.params.who);
      if (!a) return;
      …
    },
  },
};
```

- The beat lasts `dur` seconds (default 1) and takes that time in the beat timeline like any other beat
  ([storyboard.md](storyboard.md#timing-rules)): use `with` / `after` to lay it over other beats.
- Every field of the beat, and of its `params` object, arrives in `api.params` (`api.params.who` above).
- `sfx` entries are `{ at, name, gain, pan, params }`; `name` is a built-in effect or one of your `sounds`.
- A beat naming a custom effect that `custom.mjs` doesn't have is a warning, not an error: it only takes its time.

## Overlays

An overlay draws over a whole scene, every frame, on one layer:

```json
{ "id": "s01", "set": "meadow", "overlays": ["sunbeams", { "name": "mist", "params": { "n": 2 } }], … }
```

```js
export const overlays = {
  sunbeams: {
    layer: 'grade',
    draw(ctx, api) { const k = api.params.strength ?? 1; … },
  },
};
```

A scene's `overlays` list holds custom overlay names or the built-in fields (`leaves`, `rain`, `fireflies`, `motes`,
`mist`), as a name or `{ "name", "params" }`; an unknown name is a check error. The overlay's `params` arrive in
`api.params`.

An overlay can follow an actor through the scene, which is how a reskinned rig gets what it lacks (a firefly is a
butterfly plus a glow, [cast.md](cast.md)): on the `grade` layer, take `api.actor(id)` (null while it is off stage),
its world `box`, and draw at `api.toScreen` of its centre, sized by `api.cam.zoom` × the actor's `s`.

## Props

The engine has no props: an object the story turns on is built from what it has.

- **On the ground, changing state** (a strawberry that splits and is eaten): a small static rig ([adding a
  rig](cast.md#adding-a-rig)) with a pose for each state and params for the rest (`do: set` changes them). As a cast
  member it sorts in depth, the camera can frame it (`on`), and lint sees it. Moving actors route round it like round
  any actor (near a small prop the detour can swing toward the camera: keep routes clear of it), and its ground
  shadow stays until it is faded (`do: fade`).
- **In the air** (a kite, a ball, a lantern): a stand-in flier, a butterfly hovering with `height`, moved by `fly`
  beats and faded to 0 by its first beat (`{ "do": "fade", "who": "kite", "to": 0, "dur": 0.01 }`), carrying an
  overlay that draws the object at its `box`. `api.actor` still returns it at opacity 0 (its `alpha` is 0), and the
  camera frames it with `on`, so a shot can follow the kite. There is no hidden start: the stand-in is drawn in the
  first frame of its first shot (and in the opening card's dissolve into it), so draw the object over it.
- **Held, or on a string**: draw it from the human's hand. `api.actor` gives no hand point, but the human rig's own
  `draw` with no canvas returns its anchors in world coordinates without drawing (not turned for a slope). The
  animal rigs return only `head`, `mouth` and `bounds`: take a paw from the `box`.
- **A part of the set** that has no anchor (the crown of the hill's hawthorn): its painted extent is in `api.set.props`
  (`{ id, bounds: [x0, y0, x1, y1], solid, … }`, world px), and the skill's `inventory.mjs sets` lists every prop's.
  A stand-in hovering at its middle (`"to": "x:3160", "height": 160` for the hawthorn: [sets.md](sets.md#hill)) puts
  something in it.

```js
// the string of a kite: from June's front hand to the stand-in "kite"
const a = api.actor('june'), k = api.actor('kite');
const { hand, hands } = a.R.draw(null, a.x, a.y + (a.sink || 0), a.s, a.face, a.st);   // hands.front, hands.back
const tip = [(k.box[0] + k.box[2]) / 2, (k.box[1] + k.box[3]) / 2];
```

## Layers

Overlays and custom beats name the layer they draw on. In the order a frame is drawn:

| layer | drawn | coordinates |
|---|---|---|
| `sky` | after the sky, before any land (the horizon is at `api.toScreen([x, api.set.horizon])`) | screen pixels |
| `back` | after the set's back layers, before props and actors | world |
| `world` | after props, actors and the built-in world effects (the default) | world |
| `front` | after the set's front layers (foreground grass, branches) | world |
| `grade` | after the time-of-day grade and the rim light: emitted light (a lamp, a comet) goes here, or the night grade turns it grey | screen pixels |
| `screen` | after glowing effects such as fireflies, before titles and captions | screen pixels |

In world coordinates you draw in the set's own pixels (the numbers in the anchor tables) and the camera transform is
already applied; `api.cam.zoom` tells you how much it is enlarged. In screen pixels (0..`api.W`, 0..`api.H`) use
`api.toScreen` to place things. Each draw call runs between `ctx.save()` and `ctx.restore()`, so you may change
composite modes, filters and transforms freely.

## The api

Overlays get `draw(ctx, api)`, custom beats `draw(ctx, u, api)`. `api` holds:

| field | meaning |
|---|---|
| `t` | film time (s) |
| `st`, `su` | seconds since the scene started, and the scene's progress 0..1 |
| `lt` | seconds since the shot started |
| `scene`, `shot` | the plan's scene and shot records (`id`, `t0`, `t1`, …) |
| `set` | the set: `set.anchor(name)`, `set.scaleAt(x, y)`, `set.inWater(x, y)`, `set.groundAt(x)` (a ridge set's ground line; null on the others), `set.horizon` (world y), `set.props` (each prop's `id`, `bounds` `[x0, y0, x1, y1]` and `solid` footprint), … |
| `cam` | the camera: `{ cx, cy, zoom }`, the world point at the centre of the frame and the zoom |
| `W`, `H` | the frame size in pixels |
| `plan` | the whole compiled plan |
| `marks` | `{ name: film time }` of every `mark` beat |
| `params` | the overlay's params, or the beat's fields and params |
| `seed` | a seed for this overlay in this scene, or for this beat |
| `name` | the overlay's or beat's name |
| `actor(id)` | an actor on stage: its draw state (`x`, `y`, `s` scale, `face` ±1, `alpha` 0..1, `st` with pose, expression and talk, `asleep`, `speaking`, `R` its rig, …) plus `head` and `mouth` points and its `box` `[x0, y0, x1, y1]`, all in world coordinates; `null` while it is off stage (not yet entered, or exited). An actor faded to 0 is still returned. The human's hands: see [props](#props) |
| `anchor(name)` | an anchor of the set: `{ x, y, s, type, … }` |
| `toScreen([x, y])`, `toWorld([x, y])` | map a point between world and screen pixels |
| `silhouette(ctx, actor)` | draw an actor (an id, or a state from `plan.actorsAt`) in screen space exactly as the frame draws it (slope pitch, turn squash, wading cut), without shadows; use it for masks and cut-outs instead of calling the rig yourself |

Custom beats also get `u` (0..1 across the beat), `bt` (seconds since the beat started), `dur` and `beat` (the beat
object itself).

## Sounds

A sound is a function that returns 48 kHz mono samples:

```js
export const sounds = {
  'tiny-bell': ({ dur } = {}) => {        // called with { seed, dur, params }
    const sr = 48000, n = Math.round(sr * (dur || 1.6)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, e = Math.min(1, t / 0.002) * Math.exp(-t * 3.2);
      out[i] = 0.12 * e * (Math.sin(2 * Math.PI * 2093 * t) + 0.45 * Math.sin(2 * Math.PI * 5370 * t) * Math.exp(-t * 6));
    }
    return out;
  },
};
```

Use it like a built-in effect: `{ "sfx": "tiny-bell", "dur": 2, "params": { … } }`, or in a custom beat's `sfx`.
`dur` and `params` come from the beat; `seed` is set per event. A sound under a whole scene (a rain bed) takes its
length from `params` instead of the beat: `{ "sfx": "rain-bed", "params": { "dur": 30 } }` at the start of the scene
takes no time in the shot and plays on across the cuts, while a beat-level `"dur": 30` would hold the shot for 30 s. The mixer replaces non-finite samples with silence and
softens the first 2 ms and last 5 ms. It does **not** level a custom sound the way it levels the built-in effects:
set the level in the function (peaks around 0.1–0.3 sit under dialogue), and adjust with the beat's `gain`.

## A worked example

The starter's custom beat, in full: 18 glints rise from a character's head and fade, each with its own start, life,
direction and size.

```js
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const custom = {
  glints: {
    layer: 'world',
    sfx: [{ at: 0, name: 'tiny-bell', gain: 0.6 }],
    draw(ctx, u, api) {
      const a = api.actor(api.params.who);
      if (!a) return;
      const [hx, hy] = a.head, s = a.s, r = rng(api.seed);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        // draw every random number before any `continue`, so each glint gets the same numbers on every frame
        const t0 = r() * 0.5, life = 0.45 + r() * 0.3, ang = -Math.PI / 2 + (r() - 0.5) * 1.6, dist = (30 + r() * 70) * s, size = 4 + r() * 5;
        const k = (u - t0) / life;
        if (k <= 0 || k >= 1) continue;
        …
      }
    },
  },
};
```

The full file is `templates/custom.mjs`. After writing an effect, run `check`, then look at it in motion with a strip
of frames across the shot:

```sh
node engine/film/sheet.mjs films/<slug> films/<slug>/out/strip.jpg --shots=1.6@0.2,1.6@0.4,1.6@0.6,1.6@0.8 --cols=4 --tile=480
```

and make sure it never covers a face or makes a speaker hard to read.
