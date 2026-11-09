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
Their code may import engine helpers with a relative path (`../../engine/core/lib.mjs` from `films/<slug>/`).

## Two rules

- **Deterministic.** No `Math.random()` or `Date.now()`. Use `api.seed` (or a fixed number) with a seeded
  generator: `rng(seed)` from `engine/core/lib.mjs`, or your own (the template has a four-line one). Every render of a
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

## Layers

Overlays and custom beats name the layer they draw on. In the order a frame is drawn:

| layer | drawn | coordinates |
|---|---|---|
| `sky` | after the sky, before any land | screen pixels |
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
| `set` | the set: `set.anchor(name)`, `set.groundAt(x)`, `set.scaleAt(x, y)`, `set.inWater(x, y)`, … |
| `cam` | the camera: `{ cx, cy, zoom }`, the world point at the centre of the frame and the zoom |
| `W`, `H` | the frame size in pixels |
| `plan` | the whole compiled plan |
| `marks` | `{ name: film time }` of every `mark` beat |
| `params` | the overlay's params, or the beat's fields and params |
| `seed` | a seed for this overlay in this scene, or for this beat |
| `name` | the overlay's or beat's name |
| `actor(id)` | an actor on screen: its draw state (`x`, `y`, `s` scale, `face` ±1, `st` with pose, expression and talk, `asleep`, `speaking`, …) plus `head` and `mouth` points and its `box` `[x0, y0, x1, y1]`, all in world coordinates; `null` if it isn't drawn |
| `anchor(name)` | an anchor of the set: `{ x, y, s, type, … }` |
| `toScreen([x, y])`, `toWorld([x, y])` | map a point between world and screen pixels |

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
`dur` and `params` come from the beat; `seed` is set per event. The mixer replaces non-finite samples with silence and
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
node engine/film/sheet.mjs films/<slug> films/<slug>/out/strip.jpg --shots=s01-06@0.2,s01-06@0.4,s01-06@0.6,s01-06@0.8 --cols=4 --tile=480
```

and make sure it never covers a face or makes a speaker hard to read.
