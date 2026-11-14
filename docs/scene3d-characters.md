# 3D characters: the format

A 3D character in cinecode is one JavaScript file that exports one plain object: a **description**. The engine
reads the description, builds a smooth skinned mesh from it, and poses it. You never write a mesh, a texture or a
picture: every body is made of a few dozen simple solids that melt together, and everything else (fingers, hair,
eyes, mouth, springy parts) comes from short blocks of numbers.

This page says what every field means, with the girl (`engine/scene3d/cast/girl.mjs`) as the worked example. It
is written so that you can write a new person, animal or creature from it without reading the engine's code.

Contents: [1 The rules of the space](#1-the-rules-of-the-space) ·
[2 The file](#2-the-file) · [3 Joints](#3-joints) · [4 Solids](#4-solids) · [5 Parts](#5-parts) ·
[6 Hands](#6-hands) · [7 Feet and toes](#7-feet-and-toes) · [8 Hair and beard](#8-hair-and-beard) ·
[9 Face](#9-face) · [10 Loose parts](#10-loose-parts) · [11 Small rigid pieces](#11-small-rigid-pieces) ·
[12 Rig numbers](#12-rig-numbers) · [13 Bending](#13-bending) · [14 Posing a character](#14-posing-a-character) ·
[15 Common mistakes](#15-common-mistakes) · [16 Checking your character](#16-checking-your-character) ·
[17 The girl, whole](#17-the-girl-whole)

---

## 1. The rules of the space

- **Metres.** The man is 1.95 m to the top of his hair, the girl 1.04 m to the top of her buns, the cat 0.51 m to
  the tip of its tail.
- **y is up, the floor is y = 0.** The character stands on the floor.
- **The character faces +z** (toward the camera in a front view). **+x is the character's own left.** So in a
  front view the character's left arm is on the right of the picture.
- **Everything is written in the rest pose**, at the place it has in the room when the character stands at the
  origin: a point is given as `[x, y, z]` in metres from the floor point under the character, never relative to a
  parent joint.
- **Write the left side only** (x greater than 0). The right side is made by mirroring (x becomes -x). Names of
  left things end in `L`; the mirrored twin gets the same name ending in `R`.
- **`r` always means a radius (half a size). `size`, `width`, `length` and `thick` always mean a full size.**
- **Angles are radians**, except on the head, where directions are in degrees (section 8).
- **Colours** are numbers like `0xf3c7aa` (red, green, blue). A **tint** is three multipliers `[r, g, b]` laid over
  a part's colour: `[1, 1, 1]` changes nothing, `[1.07, 0.82, 0.8]` is rosier.

### The rest pose

- **Two legs:** standing straight, feet under the hips, toes forward, **arms held out and down at 40 degrees
  below level**, palms facing down and back, thumbs forward. The arms must not touch the body: solids that touch
  in the rest pose melt into one another and cannot be pulled apart by posing.
- **Four legs:** standing on all four, back level, head forward and a little up, tail up and back.

The trunk need not be stacked straight: a stooped old person, a hunched creature or a proud chest is written by
putting `chest`, `neck` and `head` forward (or back) of the `pelvis` in z in the rest pose. Motion turns each bone
from where it is in the rest pose, so the stoop stays through every move. Keep the legs and arms in the rest pose
described above.

---

## 2. The file

A character lives in `engine/scene3d/cast/<name>.mjs` and exports one object named like the file:

```js
import { mirrorJoints, mirrorOps, toes } from '../character.mjs';

export const granny = {
  name: 'granny',          // the same word as the file name and the export
  kind: 'biped',           // 'biped' (two legs) or 'quadruped' (four legs)
  joints: { ... },         // section 3
  parts: [ ... ],          // section 5
  hands: { ... },          // section 6   (two-legged characters with hands)
  hair: { ... },           // section 8   (optional)
  beard: { ... },          // section 8   (optional)
  face: { ... },           // section 9   (optional, but almost always wanted)
  loose: [ ... ],          // section 10  (optional)
  attach: [ ... ],         // section 11  (optional)
  rig: { ... },            // section 12
};
```

**Name each measure once.** At the top of the file, give every important point a name and use the name
everywhere after (a shoulder is used by a joint, by the arm's solid, by the sleeve and by the shirt's cut). The
arm points out and down at 40 degrees, so points along it are found with a small helper you write yourself (it is
not part of the engine):

```js
const A = 40 * Math.PI / 180;                 // the arms' angle below level
const dir = [Math.cos(A), -Math.sin(A), 0];   // the way the left arm points
const along = (p, s, extra = [0, 0, 0]) => [p[0] + dir[0] * s + extra[0], p[1] + dir[1] * s + extra[1], p[2] + dir[2] * s + extra[2]];   // s metres down the arm from p

const shoulder = [0.1, 0.64, -0.004];
const elbow = along(shoulder, 0.125);
const wrist = along(elbow, 0.12);
```

The helpers that come from the engine (`import { ... } from '../character.mjs'`) are `mirrorJoints` (section 3),
`mirrorOps` (section 4), `toes` (section 7) and `scaleOps(ops, pivot, s)`, which scales a list of solids by `s`
about the point `pivot` (the man's head is drawn at 1.12 times about the top of his neck). Anything else is plain
arithmetic in your file.

---

## 3. Joints

`joints` is the skeleton in the rest pose: an object whose keys are joint names and whose values are
`{ at: [x, y, z], parent: 'name' }`. A joint is the point a bone turns about. Write the left side only and wrap
the object in `mirrorJoints(...)`, which adds every joint whose name ends in `L` again with `R`, x mirrored and its
parent renamed.

| field | meaning |
|---|---|
| `at` | where the joint is, in the room, in the rest pose |
| `parent` | the joint it hangs from (none for the root) |
| `bend` | `true` on an elbow, knee, shoulder or hip: adds a helper that stops the bend pinching (section 13) |
| `near` | other joints that share skin with this one though they are not parent and child (a belly and the chest above it) |

### The standard two-legged skeleton

Every two-legged character must have exactly these names, so that walking, running, jumping and gestures written
for one work on all. (The fingers and the thumb are added by the `hands` block; you do not write them.)

| joint | where it is | parent | the girl |
|---|---|---|---|
| `pelvis` | the middle of the hips, at the height of the hip balls | (root) | `[0, 0.415, 0]` |
| `spine` | the waist | `pelvis` | `[0, 0.48, 0]` |
| `chest` | the middle of the rib cage | `spine` | `[0, 0.565, 0]` |
| `neck` | the base of the neck, between the shoulders | `chest` | `[0, 0.665, -0.004]` |
| `head` | the top of the neck, under the skull (the head nods about it) | `neck` | `[0, 0.705, 0]` |
| `upperArmL` | the shoulder ball | `chest` | `[0.1, 0.64, -0.004]` |
| `foreArmL` | the elbow | `upperArmL` | 0.125 m out along the arm |
| `handL` | the wrist | `foreArmL` | 0.12 m further along the arm |
| `thighL` | the hip ball | `pelvis` | `[0.052, 0.395, 0]` |
| `shinL` | the knee | `thighL` | `[0.056, 0.215, 0.004]` |
| `footL` | the ankle | `shinL` | `[0.058, 0.045, -0.008]` |
| `toeL` | the ball of the foot, where the toes bend | `footL` | `[0.06, 0.018, 0.05]` |

Proportions of the two people, as fractions of the height to the top of the hair (the man 1.95 m, the girl
1.04 m with her buns):

| joint height | the man | the girl |
|---|---|---|
| `pelvis` | 0.43 | 0.40 |
| `chest` | 0.62 | 0.54 |
| `neck` | 0.75 | 0.64 |
| `head` | 0.79 | 0.68 |
| `shinL` (knee) | 0.23 | 0.21 |
| `footL` (ankle) | 0.04 | 0.04 |
| `upperArmL` out from the middle | 0.154 | 0.096 |
| `thighL` out from the middle | 0.064 | 0.050 |

Both are cartoon builds with short legs; a realistic adult has the pelvis at about 0.52 and the head joint at 0.87.

Extra joints are allowed for loose parts (section 10): the girl has `skirt`, the man `belly`. A loose joint must
hang from `pelvis`, `spine`, `chest`, `neck` or `head`.

### The standard four-legged skeleton

| joint | where it is | parent |
|---|---|---|
| `hips` | over the hind legs (root) | (root) |
| `spine` | the middle of the back | `hips` |
| `chest` | over the front legs | `spine` |
| `neck` | the base of the neck | `chest` |
| `head` | the top of the neck | `neck` |
| `fUpperL` | the shoulder (front leg, upper) | `chest` |
| `fLowerL` | the elbow | `fUpperL` |
| `fPawL` | the wrist; the front paw hangs from it | `fLowerL` |
| `hThighL` | the hip (hind leg) | `hips` |
| `hShinL` | the knee | `hThighL` |
| `hFootL` | the hock (the backward-pointing heel high up the hind leg) | `hShinL` |
| `tail1`, `tail2`, ... | the tail, from its root backward; at least one, five is usual | `hips`, then each the one before |
| `earL` | the root of the ear (optional) | `head` |

The hind toes are not a joint: say where they meet the floor in `rig.hindToe` (section 12). See
`engine/scene3d/cast/cat.mjs`.

---

## 4. Solids

A body is a list of **solids**. Each solid is an object with a `type` and its measures:

| type | fields | what it is |
|---|---|---|
| `ell` | `c` centre, `r: [rx, ry, rz]` radii, `rot` | an egg (ellipsoid); `rx` across, `ry` up, `rz` front to back |
| `cone` | `a`, `b` the two end points, `ra`, `rb` the radius at each end | a rounded cone: a sausage that may taper. `rb` defaults to `ra`. **Each end is a ball** of radius `ra` (or `rb`) round its end point, so a cone reaches `ra` beyond `a` and `rb` beyond `b`: a skirt cone with `ra: 0.17` at the waist bulges into a 0.17 m ball there. Put a wide end's point inside the body, or cut the bulge off with a `clip` or `sub` |
| `box` | `c`, `r: [rx, ry, rz]` half sizes, `round` corner radius, `rot` | a rounded box |
| `torus` | `c`, `R` ring radius, `r` thickness radius, `rot` | a ring, lying flat (in x and z) unless turned |

`rot: [about x, about y, about z]` turns the solid about its centre, in radians, first about x, then y, then z.

Fields every solid may have:

| field | meaning |
|---|---|
| `bone` | the joint whose bone carries it. **Every added solid needs one.** Use the bone of the body part it belongs to: the thigh's solid belongs to `thighL`, the knee cap to `shinL` |
| `k` | how wide the melted join with what came before is, in metres. 0 is a hard crease; a few centimetres on a big body is a soft flesh join; use about a quarter of the smaller radius |
| `tint` | `[r, g, b]` multipliers for the colour of this solid's area (rosy knees, a ginger patch on a white cat) |
| `both` | `true`: also make the mirrored twin on the right side (with `mirrorOps`, below) |
| `skull` | `true` on the solids of the head the hair and beard grow on (section 8) |
| `soft` | how far this solid's bone reaches into its neighbours' skin, in metres (default the part's `soft`) |

**What a solid does** is set by `op`:

| `op` | does |
|---|---|
| `'add'` (the default, leave it out) | melts the solid into everything before it |
| `'sub'` | carves the solid out of everything before it (the opening of a shoe, the hollow under a skirt). It has no `bone` |
| `'clip'` | cuts everything before it with a flat plane: `{ op: 'clip', n: [x, y, z], d, k }`. It removes the side the arrow `n` points to, beyond the plane where `n · p = d`. `{ op: 'clip', n: [0, -1, 0], d: 0 }` removes everything below the floor; `{ op: 'clip', n: [0, 1, 0], d: 0.118 }` removes everything above 0.118 m |

The order matters: a `sub` or `clip` acts only on the solids before it.

Wrap the list in `mirrorOps([...])`. It copies every entry marked `both: true` to the right side (x of every
point mirrored, the bone renamed from `...L` to `...R`, turns mirrored); this works the same for `sub` and `clip`
entries (a mirrored clip's arrow `n` is mirrored too). Solids on the middle line (torso, head, nose) have no `both`.

**Solids melt only within one part.** Two parts never join, whatever their `k`: a shawl laid over a sleeve stays a
separate surface.

**A `clip` cuts the whole part** (everything before it in the list), across the whole body: a plane at the wrist
also cuts the skirt in that part. To cut one place only (the end of a sleeve, the opening of a shoe), carve it
with a `sub` solid there instead.

---

## 5. Parts

`parts` is a list of **parts**, one per material. Each part becomes one smooth mesh.

```js
{ name: 'dress', h: 0.005, ops: dress, material: { color: 0xf0842c, scatter: 0.3, mottle: 0.1, pattern: hemBand } }
```

| field | meaning |
|---|---|
| `name` | a word. **The bare body must be called `'skin'`**: hands, hair, beard and the face are built from it |
| `ops` | its solids (section 4) |
| `h` | the mesh's grain in metres: the smaller, the finer and the slower to build. About 1/200 of the height for skin and clothes (the girl 0.0045, the man 0.008); 0.003 for small things (a collar, shoes) |
| `soft` | how far skin weights blend between bones, in metres (default 0.03; the cat uses 0.022) |
| `material` | how the surface looks (below) |

Clothes are separate parts laid over the skin: a sleeve is a slightly fatter cone over the arm's cone, on the same
bone. Make a garment 3 to 10 mm thicker than the skin under it, or the skin shows through when the body bends.
Cut openings (neck, sleeve ends, hem) with `sub` and `clip`.

**Grow a garment from the skin and give it `fit`.** Name the skin's solids you will cover, and build the garment from
them with `grow(solids, d)` (`character.mjs`: each solid grown by d metres all round), then cut its openings. Give the
part `fit: <the skin's solids>` (the whole skin list, including solids that are not drawn):

```js
import { mirrorOps, grow } from '../character.mjs';
const shirt = mirrorOps([...grow([spineB, chestB, upperArmB], 0.012), { op: 'clip', n: [0, -1, 0], d: -0.445 }]);
{ name: 'shirt', h: 0.005, ops: shirt, fit: skin, material: { ... } }
```

A part is weighted to the bones from its own solids, and a garment's surface sits a few millimetres out from the skin
among other solids (the other leg's cloth at the crotch, the sleeve at the shoulder), so without `fit` it bends
differently from the skin under it and the body comes out through it (the boy's thighs came 18 mm out through his
shorts when he sat). With `fit`, each point of the garment is weighted as the skin is at the nearest point under it,
so it keeps its distance from the skin however the body bends (the same thigh: 6 mm inside the cloth). It is worked
out once with the meshes and kept in the mesh cache. The boy (`cast/boy.mjs`) and the man's work clothes
(`cast/man-work.mjs`) are the worked examples; the man's and the girl's own clothes do not use it yet.

**A wardrobe** is a description that spreads another and swaps its clothes: `cast/man-work.mjs` is `{ ...man, name,
joints: { ...man.joints, bag }, parts: [the man's skin without the legs, shirt, trousers, shoes, bag, clasps], hang }`,
its measures read from `man.joints`. The storyboard names it through the rig's `params` (`library.mjs`: `RIGS.man.params
= { wardrobe: ['work'] }` and `look(params)` → the description), so a film says `{ "rig": "man", "params":
{ "wardrobe": "work" } }`. Colours are params the same way (`RIGS.boy.look` → `boyWith({ skin, hair, shirt, shorts })`).

**Something that hangs from a hand** (a case, a bag, a lantern): a joint of its own on the hand, at the point that
holds it, its solids written hanging straight down from it in the rest pose, and a `hang` block on the description:
`hang: [{ bone, hand: 'L' | 'R', length, drop, z, stiff, clear, reach }]` (the fields are written down in
`hang.mjs`). Every performer of it hangs it as a pendulum on the hand, stepped from t = 0 (any frame alone gives the
same answer), pushed clear of the leg on that side, standing on the floor when the hand comes that low; the hand grips
it and swings less. The man's case: `{ bone: 'bag', hand: 'R', length: 0.21, drop: 0.35, z: 0.55, stiff: 1.6, clear:
0.235, reach: 0.3 }`.

**Material fields** (all optional except `color`):

| field | meaning |
|---|---|
| `color` | the base colour |
| `scatter`, `scatterColor` | light glowing through the edge of the shadow (skin: 0.3 and `0xff7a4c`; cloth 0.15 to 0.3; hard things 0) |
| `mottle` | how strong the soft uneven patches of colour are (0.04 skin, 0.1 cloth) |
| `rim` | how bright the light edge on the outline is (default 1; shiny shoes 1.6) |
| `mottleScale` | (with `mottle`) how many patches per metre, about; default 5. Cloth 6 to 12, fur 30 |
| `pattern` | a function that paints a pattern that stays on the cloth (stripes, dots, a hem band, a knit); below |
| `sun` | how much of the direct light (sun, lamp) the part takes, default 1. Below 1 a light-coloured part keeps its colour in full sun instead of going toward the paper's white under the picture's highlight shoulder; its shade is unchanged. The cat's coat uses 0.45, all hair 0.6 |
| `keepHue` | the fills light it as a neutral grey of their strength (hair, the car's body) |

The colour of a part is `color`, times each solid's `tint`, then changed by the pattern.

**A pattern** is `(p, base) => colour`. `p` is the point on the body **in the rest pose** (so the pattern stays
on the cloth as the body moves), `base` the colour before the pattern; both are three.js shader nodes, and the
function returns one. Build it from these, imported at the top of the file with
`import { float, vec3, mix, smoothstep, sin, atan, fract, length, abs, max, step, mx_noise_float } from 'three/tsl';`
(only some are needed): `p.x`, `p.y`, `p.z`; `a.add(b)`, `a.sub(b)`, `a.mul(b)`, `a.div(b)`; `mix(a, b, u)`;
`smoothstep(edge0, edge1, x)` (0 below edge0, 1 above edge1; reversed edges give the opposite); `sin`, `atan(y, x)`,
`fract`, `length`, `abs`, `max`, `step`; `mx_noise_float(v)` (smooth noise, -1 to 1). The girl's whole pattern:

```js
// a cream band just above the hem (y 0.312 to 0.335) and soft pleats fanning down the skirt
const hemBand = (p, base) => {
  const pleat = sin(atan(p.z, p.x).mul(11)).mul(0.5).add(0.5);                          // 0..1, 11 pleats round the body
  const c = base.mul(mix(float(1), float(0.86), pleat.mul(smoothstep(0.5, 0.36, p.y))));  // darker in the folds, below y 0.5
  return mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.312, 0.317, p.y).mul(smoothstep(0.335, 0.33, p.y)).mul(0.9));
};
```

A knit is rows of small bumps: for example
`(p, base) => base.mul(mix(float(0.82), float(1.08), sin(p.y.mul(300)).mul(sin(p.x.add(p.z).mul(150))).abs()))`
(rows about 1 cm apart; much finer patterns shimmer when the character is small in the picture).
Leave `pattern` out if unsure; `mottle` alone already keeps a surface from looking like plastic.

### Thin cloth (an apron, a shawl, a cape, a collar)

Make it from flattened solids on the bone it lies on: an egg with one radius small (a shawl over the shoulders:
`r: [0.2, 0.05, 0.16]` on `chest`, laid over the shoulders and hollowed underneath with a `sub` egg of the body's
size; an apron: a `box` 0.008 thick with `round: 0.004` on `spine` and `pelvis`). Edges cut with `clip` are hard
and straight; edges made by the shape of a solid are soft. A shawl's hanging ends are two thin cones per side, on
`chest`, ending in a point (`rb` small).

---

## 6. Hands

Two-legged characters get hands with real finger bones from one block. The hand is joined to the end of the
forearm of the part `skin` (the forearm's solid must end at the wrist joint `handL`).

```js
hands: { length: 0.085, width: 0.056, thick: 0.03, segments: 2, tint: rosy },
```

| field | meaning |
|---|---|
| `length` | from the wrist to the tip of the middle finger (a grown-up about 0.19, a small or old adult 0.16, the girl 0.085, the big man 0.22) |
| `width` | across the knuckles (about 0.45 to 0.65 of `length`) |
| `thick` | the palm's thickness (about half of `width`) |
| `segments` | bones per finger: 3 (grown-up, realistic) or 2 (child, cartoon) |
| `tint` | colour multipliers for the fingers and thumb (a little rosier than the palm) |
| `material` | optional; the default is the material of `skin` |

It adds the joints `thumb1L thumb2L`, `index1L index2L [index3L]`, `middle...`, `ring...`, `pinky...` (and the
right twins) and a part named `hands`. The hand shapes (open, point, grip, wave) are numbers in the pose
(section 14).

---

## 7. Feet and toes

A shod foot is solids on `footL` (the heel and the arch) and `toeL` (the front of the shoe), cut flat at the
floor with `{ op: 'clip', n: [0, -1, 0], d: 0 }` at the end of the list.

A bare foot also gets five toes from the helper `toes`, put inside the `skin` list:

```js
...toes({ at: [0.119, 0.026, 0.196], width: 0.076, r: 0.023, tint: rosy }),
```

`at` is the middle of the big toe of the left foot, `width` how far the row of toes runs outward from it, `r` the
big toe's radius. The toes are on the bone `toeL` and mirrored to the right.

---

## 8. Hair and beard

A hair style is **a map on the head plus named locks**. The engine grows a shell over the skull, cuts it along
the hairline, combs fine ridges into it, and adds locks (and buns) as real solids. A lock with a spring gets a
bone of its own and swings late (a bun, a quiff, a ponytail).

### Directions on the head

Places on the head are written as `[compass, height]` in **degrees**, seen from the centre of the first skull
solid:

- **compass**: 0 is straight ahead (the face), 90 the character's left ear, 180 the back of the head,
  -90 the right ear.
- **height**: 0 is level with the centre of the skull, 90 the crown, negative below the centre (a jaw is at
  about -40).

The engine finds the skull's surface in that direction itself, so you never write a point on the head.

**The skull:** mark the head's solids in the part `skin` with `skull: true` (the cranium and the jaw; not the
nose, ears or cheeks). The first one marked is the centre of all head directions.

### The hair block

```js
hair: {
  material: { color: 0x4a3338 },
  thick: 0.011,
  line: [[0, 36], [45, 34], [68, 8], [88, -4], [108, -30], [180, -62]],
  ridges: { n: 44, amp: 0.0012 },
  locks: [ ... ],
},
```

| field | meaning |
|---|---|
| `material` | as for a part; the hair also gets light streaks by itself |
| `thick` | how far the hair stands off the skull, in metres (short hair 0.01 to 0.015) |
| `line` | **the hairline**: a list of `[compass, height]` points from the front (compass 0) round to the back (compass 180), written once for both sides. Hair is kept above the line. The girl's: a straight fringe across the forehead at 36 degrees up, round over the ear (68 to 108), down to the nape at -62 |
| `edge` | how soft the cut along the line is, in metres (default 0.012) |
| `ridges` | strands: `n` ridges round the head, `amp` their depth in metres (0.001 to 0.0025) |
| `locks` | named locks (below) |
| `h` | mesh grain (default 0.005) |

### Locks

Each lock is a tapered sausage of hair from its root `at` to its tip `to`, or a bun. A lock is two straight
pieces: root to a middle point (on the head, half-way between `at` and `to`), then middle to tip. So it bends once,
following the head at its middle, and a long lock across a curved head looks bumpy: use several short locks in a
row instead.

| field | meaning |
|---|---|
| `name` | a word; with `both`, `L` and `R` are added |
| `at` | `[compass, height]` of the root |
| `to` | `[compass, height]` of the tip (not for a bun) |
| `r` | the lock's radius at the root, in metres |
| `tip` | the radius at the tip as a share of `r` (default 0.6; 0.45 is pointed) |
| `out` | how far the tip stands off the head, in metres (default 0; a quiff 0.05). For a bun: how far the ball's middle stands out (default 0.55 × `r`) |
| `both` | `true`: also on the right side (compass mirrored) |
| `bun` | `true`: a ball of hair of radius `r` standing on the head at `at`, with strands wound round it (they turn as they go, like hair twisted into a bun, so a bun never reads as one mass with the head behind it) |
| `tie` | for a bun: the colour of a band round its foot |
| `tint` | colour multipliers for this lock |
| `spring` | makes the lock a loose part (section 10): `{ f, z, drag, shift, swing, stretch }` |

The girl's locks: a fringe of five locks hanging from 56 degrees to 30 (the middle one and two pairs), side locks
in front of the ears, and two buns on springs:

```js
locks: [
  { name: 'fringe', at: [0, 56], to: [0, 30], r: 0.03 },
  { name: 'fringeNear', at: [21, 56], to: [22, 30], r: 0.03, both: true },
  { name: 'fringeFar', at: [42, 54], to: [45, 29], r: 0.029, both: true },
  { name: 'sideLock', at: [70, 24], to: [76, -14], r: 0.019, tip: 0.25, both: true },
  { name: 'bun', bun: true, at: [106, 51], r: 0.06, out: 0.05, tie: 0xd23a34, both: true,
    spring: { f: 4.2, z: 0.28, drag: 1, shift: 0.7, swing: 4, stretch: 3.5 } },
],
```

A single lock on the right side alone is written with a negative compass (the man's fringe: `at: [-24, 68]`). A
single lock on the middle line has no `both` (a bun on the back of the head: `at: [180, 30]`).
Hair that hangs below the skull (a bob, a ponytail, long hair) is locks whose tips have negative heights; long
hair that moves is several locks with springs.

**Hair pulled back into a bun** (seen from the front: a smooth cap, not a fringe): put the hairline high and level
over the forehead (`[0, 40]`), no fringe locks, `ridges` with a small `n` (24 to 30) so the strands read as combed
back, and the bun behind (`at: [180, 35]`, `out` so it stands clear of the skull) with a `spring`. From straight in
front the bun is hidden by the head; a three-quarter view shows it.

### The beard

`beard` has the same fields as `hair`, but the shell is kept **below** its `line`. The man's: under the nose
(height -16), along the jaw up to the ear (compass 80 to 92), nothing behind the ear (`[102, -90], [180, -90]`),
plus locks `chin`, `jaw` (both) and `moustache` (both).

---

## 9. Face

```js
face: {
  eyes: { at: [0.052, 0.836], size: [0.052, 0.066], iris: 0x5a3422, irisLight: 0xa86a3c, lashWidth: 0.15 },
  brows: { at: [0.055, 0.88], size: [0.04, 0.0085], color: 0x2a1c1e, tilt: 0.1 },
  mouth: { at: [0, 0.778], width: 0.048, color: 0x7a2028 },
},
```

Each feature is placed by `at: [x, y]` only: how far from the middle line (x, for the left one) and how high
above the floor in the rest pose (y). The engine finds the front of the head there and sets the feature into it,
so there is no z to write. The point must be on the front of the part `skin`'s head.

**Eyes** are round balls set half into the head, painted with a white, an iris lighter at the bottom, a pupil, two
catch lights, an upper lid with a lash line, and a lower lid, all in one shader, so a lid can close to any height
and the eye can look anywhere. The lids follow the eye up and down (a look up lifts the upper lid, a look down
lowers it), and as the view goes round toward the profile the iris slides toward the camera, as a drawn profile
shows it (by 0.03 of the eye's width at three-quarter, by a quarter in profile). So an eye reads open from every
side by itself; what you must get right is where it sits against the brow (below).

| field | meaning |
|---|---|
| `at` | `[x, y]` of the middle of the left eye |
| `size` | `[width, height]` of the eye, full size |
| `open` | where the upper lid rests (default 0.62; 0.55 is heavy-lidded, 0.7 wide) |
| `iris`, `irisLight` | the iris colour, and its lighter lower part |
| `irisSize` | the iris radius as a share of the eye (default 0.6; a cat 0.86) |
| `pupil` | leave out for round; `'slit'` for a cat |
| `white`, `lid`, `lash`, `lashWidth` | colours of the white, the lid (default: the skin's colour) and the lash line; the lash line's thickness (default 0.12, the girl 0.15) |

**Brows** are flat bars bent onto the forehead (each point of the bar lies on the head under it, so from the side
the brow hugs the brow ridge instead of standing off it as a straight oval), standing a little proud of the skin.
They slide up and down along the head and tilt. **Put the brow just above the eye**: the bottom of the brow (its
`at` y minus half its thickness) within a few millimetres of the open upper lid (the eye's `at` y plus `open`
times half the eye's height). The man: eye at 1.737, half height 0.034, `open` 0.55, so the lid is at 1.756; brow
at 1.771, half thickness 0.014, so its bottom is at 1.757. With a band of skin between them the brow floats high
on the forehead in profile (see section 15).

| field | meaning |
|---|---|
| `at` | `[x, y]` of the middle of the left brow |
| `size` | `[length, thickness]`, full size; `browUp` 1 lifts the brow 1.6 thicknesses, -1 lowers it 0.6 of that |
| `color` | colour |
| `tilt` | how far the outer end droops at rest, in radians (0.1 is gentle) |

**The mouth** is painted on the skin (and on a beard). Its outline is two curves between the corners, with teeth
along the top and a tongue at the bottom when it opens.

| field | meaning |
|---|---|
| `at` | `[0, y]`: the middle of the mouth |
| `width` | full width at rest |
| `on` | the parts it is painted on (default `['skin']`; the man: `['skin', 'beard']`) |
| `color`, `lip`, `teeth`, `tongue` | the inside (default `0x5a1c22`), the lip line (`0x9a4a44`), the teeth (`0xfff4e4`, or `false` for none) and the tongue (`0xd9706c`) |
| `line` | `false`: no lip line, only an opening is painted (a shut mouth draws nothing: the cat) |
| `depth` | side on, how far back round the cheek the near corner reaches, as the depth behind the mouth's front over its half width (default 0.5: about two half widths back; the man 0.8, so it stays clear of his beard's jaw locks) |

Seen side on, a mouth painted across the front of a round face would lie on the outline and vanish. So, like a drawn
profile, from about 50 degrees off the front onward the half toward the camera is measured back along the side of the
head, and its line thickens: in true profile the lip line, the corner and an opening read. From the front and three
quarter it is unchanged. (It follows the head bone each frame, so a turned head counts, not only a turned body.)

The eyeballs are shaded as if they lay on the face more than as balls (their normals bent toward the face), so lids
painted in the skin's colour match the skin round them in any light.

A four-legged animal usually has `eyes` and at most a mouth that shows only when it opens (the cat: `line: false`,
`teeth: false`). `bone` (default `'head'`) names the bone the face rides on.

### The face controls

A pose sets the face with plain numbers (`pose.face`):

| control | range | does |
|---|---|---|
| `gaze` | `[x, y]`, each -1 to 1 | where the eyes look; x toward the character's left, y up |
| `blink` | 0 to 1 | the upper lid closes |
| `squint` | 0 to 1 | the lower lid rises (a smile reaches the eyes) |
| `wide` | 0 to 1 | the lids open wider |
| `browUp` | -1 to 1 | brows up (surprise) or down (a frown) |
| `browTilt` | -1 to 1 | + inner ends down (angry), - inner ends up (worried) |
| `mouth` | `{ open, wide, round, smile, frown, closed }`, each 0 to 1 | mouth shapes, mixed: `open` "ah", `wide` "ee", `round` "oo", `closed` lips pressed (m, b, p), `smile`, `frown`. All 0 is the mouth at rest |
| `expr` | `{ happy, worried, surprised, sad, sleepy, angry }`, each 0 to 1 | moves every control the expression uses that far toward its numbers |

The expressions are numbers over the controls above:

| expression | numbers |
|---|---|
| `happy` | squint 0.4, browUp 0.35, mouth smile 1 and open 0.4 |
| `worried` | wide 0.25, browUp 0.55, browTilt -0.6, mouth frown 0.6 |
| `surprised` | wide 1, browUp 1, mouth round 0.8 and open 0.35 |
| `sad` | blink 0.3, browUp 0.15, browTilt -0.8, gaze down 0.6, mouth frown 1 |
| `sleepy` | blink 0.65, browUp -0.3, mouth open 0.08 |
| `angry` | squint 0.3, browUp -0.55, browTilt 0.8, mouth frown 0.7 and closed 0.6 |

Talking is a sequence of mouth shapes over time, for example `{ open: 0.7 }` on a vowel, `{ closed: 1 }` on m.

---

## 10. Loose parts

A loose part is a weight that follows the body late and bounces: a belly, a skirt, a bun, a quiff, a tail, ears.
Its spring is written in the description, and the engine works it out from the start of the film at a fixed
step, so any frame can be drawn on its own and always looks the same.

On a two-legged character, a loose part is a joint of its own (the girl's `skirt`, the man's `belly`, and every
hair lock with a `spring`) hanging from `pelvis`, `spine`, `chest`, `neck` or `head`, with its solids tied to it,
listed in `loose` (hair locks list themselves):

```js
loose: [
  { bone: 'skirt', f: 2.6, z: 0.4, drag: 1, swing: 3.2, stretch: -2.2 },
],
```

| field | meaning |
|---|---|
| `bone` | the loose joint |
| `f` | how fast it bounces, in swings per second (a belly 3, a skirt 2.6, a bun 4.2, a cat's ear 5) |
| `z` | damping, 0 to 1: 0.25 bounces several times, 0.5 once, 0.8 hardly |
| `drag` | 0: it is carried along and lags only when the body speeds up or slows (a belly); 1: it trails behind as if through air (hair, a skirt) |
| `shift` | metres it slides per metre of lag (the belly 0.9) |
| `swing` | radians it tips per metre of lag (a skirt 3.2, a bun 4) |
| `stretch` | how much it stretches per metre of lag (a bun 3.5; a skirt -2.2 flares as it drops) |
| `reach` | the most it may slide, in metres (default 0.03) |
| `breath` | metres it moves with the breath (the belly 0.006) |

Mark the loose joint `near` the bones whose skin it shares (`skirt: { ..., near: ['spine', 'chest', 'thighL', 'thighR'] }`,
`belly: { ..., near: ['chest', 'pelvis'] }`).

A four-legged animal's tail and ears are moved by its own motion code; their springs are read from `loose` by
bone name: `{ bone: 'tail1', f: 2.2, z: 0.35 }` and `{ bone: 'earL', f: 5, z: 0.4, swing: 6 }`.

---

## 11. Small rigid pieces

`attach` adds small pieces that do not bend, fixed to a bone (the cat's nose):

```js
attach: [{ name: 'nose', bone: 'head', geo: 'sphere', at: [0, 0.302, 0.334], scale: [0.011, 0.0075, 0.006], material: { color: 0xe58a8a } }],
```

`geo: 'sphere'` is a ball of radius 1 stretched by `scale` (radii); `at` is its centre in the rest pose; `rot`
turns it; `material` as for a part. Prefer solids in a part: an attached piece has a visible edge.

---

## 12. Rig numbers

`rig` tells the motion code what it cannot see in the joints.

Two legs: `{ ball, heel, armSpread }`

- `ball`: how far forward of the ankle the ball of the foot is, in metres (the girl 0.05, the man 0.105).
- `heel`: how far forward of the ankle the back of the heel is (negative; the girl -0.038).
- `armSpread`: how far the arms hang out from the sides when relaxed, in radians (default 0.22; the girl 0.62,
  to clear her bell skirt; the man 0.34, to clear his belly). The walk swings the arms forward from there: if the
  forward hand lies on the body in a walk, raise it.

Four legs: `{ hindToe: [x, y, z] }`: where the left hind toes meet the floor (y is the toe's height above the
floor, about the paw's half height).

---

## 13. Bending

Plain skinning thins a knee or a hip in a deep crouch and pinches a raised shoulder. Mark the four bending joints
of each limb with `bend: true`:

```js
upperArmL: { at: shoulder, parent: 'chest', bend: true },
foreArmL: { at: elbow, parent: 'upperArmL', bend: true },
thighL: { at: hip, parent: 'pelvis', bend: true },
shinL: { at: knee, parent: 'thighL', bend: true },
```

Each gets a hidden helper joint that turns half-way between the two bones and swells a little as they fold
(`bend: 0.35` is the default swell; a number sets it). Measured on the girl and the man, the body keeps 96 to 99
percent of its volume in a deep crouch and with an arm raised high, against 89 to 96 percent without.

**A skirt over bending legs.** A bell skirt on its own bone stays where it is when the thighs come forward, so
the knees go through it when she sits or crouches. Put a small solid of the skirt's part inside the front of the
bell on each thigh bone, with a `soft` that reaches the cloth in front of it, and mark the skirt's joint `near` the
thighs: the front of the skirt then rides up over the knees (a sit with the thighs forward 90 degrees and the
knees bent 90, and a deep crouch, looked at on the girl) and swings a little with the legs in a walk.

```js
{ type: 'ell', c: [0.06, 0.33, 0.13], r: [0.045, 0.05, 0.03], bone: 'thighL', k: 0.005, soft: 0.05, both: true },   // after the bell, before the hollow
```

Checked on the man and the girl (`bend.mjs`, and a sit, a raised arm and a head turned 1.1 rad on a chest turned
0.5): no pinching or thinning that reads at film size. Left: a small dark crease in the man's armpit with the arm
raised high, his raised sleeve still joins his back with a shallow valley seen from behind, and the girl's dress
shows a short crease across the back at the waist when her chest is turned far on her hips.

On a four-legged animal mark the knees and elbows (`fLowerL`, `hShinL`, `hFootL`).

---

## 14. Posing a character

You do not pose in the description, but you should know what a pose can ask of the body you build. Motion code
asks for arm and hand shapes with plain numbers per arm (`pose.armL`, `pose.armR`):

| control | meaning |
|---|---|
| `curl` | how far the fingers fold, 0 straight to 1 a fist; one number, or `[index, middle, ring, pinky]` |
| `thumb` | 0 out to the side, 1 folded across the palm |
| `fan` | 0 fingers together, 1 spread wide |
| `wrist` | `[bend toward the palm, side to side, roll]`, radians |

Named shapes (`HANDS` in `engine/scene3d/biped.mjs`): `open { curl: 0, thumb: 0, fan: 1 }`,
`relaxed { curl: 0.25, thumb: 0.2, fan: 0.3 }`, `point { curl: [0, 1, 1, 1], thumb: 1, fan: 0 }`,
`grip { curl: 0.72, thumb: 0.75, fan: 0.25 }`, `fist { curl: 1, thumb: 1, fan: 0 }`. A wave is `open` with the
wrist rocking side to side.

---

## 15. Common mistakes

**Writing the right side by hand.** The right side is always mirrored.

```js
// wrong: two solids to keep in step, and the right one is easy to get wrong
{ type: 'cone', a: [0.1, 0.64, 0], b: [0.18, 0.56, 0], ra: 0.034, bone: 'upperArmL' },
{ type: 'cone', a: [-0.1, 0.64, 0], b: [-0.18, 0.56, 0], ra: 0.034, bone: 'upperArmR' },
// right
{ type: 'cone', a: shoulder, b: elbow, ra: 0.034, rb: 0.03, bone: 'upperArmL', k: 0.02, both: true },
```

**Writing the left side at negative x.** The character's left is +x. A left joint at negative x crosses the
legs when it is mirrored.

```js
thighL: { at: [-0.052, 0.395, 0], parent: 'pelvis' },   // wrong
thighL: { at: [0.052, 0.395, 0], parent: 'pelvis' },    // right
```

**Joints relative to their parent.** Every `at` is a place in the room in the rest pose.

```js
shinL: { at: [0, -0.18, 0], parent: 'thighL' },          // wrong: this is an offset from the hip
shinL: { at: [0.056, 0.215, 0.004], parent: 'thighL' },  // right
```

**A radius written as a size (or the other way round).** `r`, `ra`, `rb`, `R` are radii; `size`, `width`,
`length`, `thick` are full sizes.

```js
{ type: 'ell', c: [0, 0.845, 0], r: [0.256, 0.244, 0.256], bone: 'head' },   // wrong: a head 51 cm wide
{ type: 'ell', c: [0, 0.845, 0], r: [0.128, 0.122, 0.128], bone: 'head' },   // right: 26 cm
```

**An added solid with no bone, or tied to the wrong one.** Every added solid needs `bone`, and it must be the
bone of the body part it is on: the knee cap on `shinL` (it goes with the shin), the skirt on `skirt`, the hat on
`head`.

**Arms touching the body in the rest pose.** They melt into the body and cannot be pulled out of it. Hold the arms
40 degrees below level, and check the sleeves and hands are clear of the torso and the skirt.

**A garment exactly as thick as the skin.** The skin shows through at every bend. Make each layer 3 to 10 mm
fatter than the one under it, on the same bones.

**A `sub` or `clip` before the solids it should cut.** It only cuts what comes before it in the list.

```js
// wrong: the hollow is carved before the bell exists, so the skirt is solid
[{ op: 'sub', type: 'cone', a: [0, 0.4, 0], b: [0, 0.2, 0], ra: 0.085, rb: 0.215 },
 { type: 'cone', a: [0, 0.5, 0], b: [0, 0.285, 0], ra: 0.105, rb: 0.2, bone: 'skirt' }]
// right
[{ type: 'cone', a: [0, 0.5, 0], b: [0, 0.285, 0], ra: 0.105, rb: 0.2, bone: 'skirt' },
 { op: 'sub', type: 'cone', a: [0, 0.4, 0], b: [0, 0.2, 0], ra: 0.085, rb: 0.215 }]
```

**A clip pointing the wrong way.** `n` points at what is removed.

```js
{ op: 'clip', n: [0, 1, 0], d: 0 },    // wrong: removes everything above the floor
{ op: 'clip', n: [0, -1, 0], d: 0 },   // right: removes what is below the floor
```

**A face feature placed off the head.** `face.eyes.at` is `[x, y]` on the front of the head; a z is not written,
and a y outside the head (or behind hair solids in `skin`) is an error.

**A loose part hanging from a limb.** A loose joint must hang from `pelvis`, `spine`, `chest`, `neck` or `head`
(a skirt from `pelvis`, a bun from `head`), not from `thighL`.

**Hair on a skull with no `skull: true`.** The hair and the beard grow only on solids marked `skull`.

The mistakes below were all in the cast once, and each was seen in a picture before it was fixed.

**A brow high above the eye.** From the front it reads as a raised brow; in profile it is a dark lump floating on
the forehead with bare skin under it, and the eye looks set low by the nose. Keep the brow's bottom at the lid.

```js
eyes: { at: [0.064, 1.729], size: [0.058, 0.068], open: 0.55 }, brows: { at: [0.07, 1.787], size: [0.086, 0.03] },    // wrong: 3 cm of skin between lid and brow
eyes: { at: [0.064, 1.737], size: [0.058, 0.068], open: 0.55 }, brows: { at: [0.07, 1.771], size: [0.086, 0.028] },   // right: the brow sits on the lid
```

**A neck that is a straight tube.** A thin neck of one radius reads as a stalk, and its two upright outlines
flicker from behind as the character turns (the spin gate measured 1.27 to 1.39 there). A child's neck is short
and thick and widens into the shoulders.

```js
{ type: 'cone', a: [0, 0.625, -0.004], b: [0, 0.71, 0], ra: 0.036, rb: 0.035, bone: 'neck' },   // wrong
{ type: 'cone', a: [0, 0.625, -0.004], b: [0, 0.71, 0], ra: 0.052, rb: 0.034, bone: 'neck' },   // right
```

**A collar that reaches round the sides of the neck.** Whatever of it lies beside the neck peeks past the neck
from behind as two white slivers that come and go as the body turns. Keep a front collar in front
(`clip` with `n: [0, 0, -1]` and `d` negative), and let the back of the neckline stand a little higher than the
front, as a dress's does.

```js
{ op: 'clip', n: [0, 0, -1], d: 0.008 },                                    // wrong: keeps the collar back to 8 mm behind the neck's middle
{ op: 'clip', n: [0, 0, -1], d: -0.015 },                                   // right: only in front of the neck
{ type: 'ell', c: [0, 0.622, -0.03], r: [0.112, 0.042, 0.045], bone: 'chest' },   // and in the dress: the back of the neckline
```

**A short puffed sleeve with nothing below the puff.** Seen from the side with the far arm swung forward, the
puff is hidden behind the chest and the bare arm seems to come out of the collar. Add a band below the puff so
the arm leaves a sleeve from every side.

```js
{ type: 'ell', c: along(shoulder, 0.012), r: [0.052, 0.05, 0.052], bone: 'upperArmL', both: true },   // wrong alone
{ type: 'cone', a: along(shoulder, 0.03), b: along(shoulder, 0.08), ra: 0.04, bone: 'upperArmL', both: true },   // right: add the band (and cut the sleeve at 0.08)
```

**Arms that hang too close to a big body.** The walk swings the forward hand onto the belly, where it lies flat
and looks pasted on. Give the arms room with `rig.armSpread`.

```js
rig: { ball: 0.105, heel: -0.085 },                     // wrong for the man: the default spread, 0.22
rig: { ball: 0.105, heel: -0.085, armSpread: 0.34 },    // right
```

**A sleeve or an upper arm that is a straight tube.** Raised, its two outlines stand upright and parallel and
flicker as the body turns (1.31 at the man's raised shoulder). Let a T-shirt sleeve open out toward its end and
give the upper arm its muscle, so the outline curves.

```js
{ type: 'cone', a: shoulder, b: along(shoulder, 0.2), ra: 0.131, rb: 0.13, bone: 'upperArmL', both: true },   // wrong
{ type: 'cone', a: shoulder, b: along(shoulder, 0.2), ra: 0.126, rb: 0.135, bone: 'upperArmL', both: true },  // right: the sleeve opens out
{ type: 'ell', c: along(shoulder, 0.17), r: [0.13, 0.112, 0.112], rot: armRot, bone: 'upperArmL', both: true },   // and, in skin, the muscle
```

**A lock that ends bluntly on the cheek.** A thick lock with a round tip ends in a hard square notch in profile.
End a lock that hangs in front of the ear in a point, at the ear lobe.

```js
{ name: 'sideLock', at: [72, 22], to: [70, -20], r: 0.02, tip: 0.5, both: true },     // wrong
{ name: 'sideLock', at: [70, 24], to: [76, -14], r: 0.019, tip: 0.25, both: true },   // right
```

**A strap that is a straight bar across the shoe.** Its middle is buried in the sock and its two ends stick out of
the shoe's sides as knobs. Make it an arch round the front of the ankle whose ends go down into the shoe.

```js
{ type: 'cone', a: [0.028, 0.052, 0.014], b: [0.09, 0.052, 0.014], ra: 0.0075, bone: 'footL', both: true },   // wrong
{ type: 'torus', c: [0.059, 0.03, 0.03], R: 0.037, r: 0.006, rot: [Math.PI / 2, 0, 0], bone: 'footL', both: true },   // right
```

**A bell skirt that only the pelvis carries.** The knees go through it when she sits. See section 13.

---

## 16. Checking your character

Run from the repository's root. Each writes a picture: look at it.

```
node engine/scene3d/tools/turnaround.mjs OUT.jpg granny              # 8 views round the character, standing relaxed (arms down, not the rest pose), each 440 x 600 pixels, laid side by side
node engine/scene3d/tools/turnaround.mjs OUT.jpg path/to/granny.mjs  # the same, for a file anywhere in the repo
node engine/scene3d/tools/faces.mjs OUT.jpg granny                   # every expression and mouth shape (needs face.eyes and face.mouth)
node engine/scene3d/tools/hands.mjs OUT.jpg granny                   # open, point, grip, wave
node engine/scene3d/tools/bend.mjs OUT.jpg granny                    # a deep crouch and a raised arm, without and with the bend helpers
```

The first build of a character takes seconds (the man 5.9 s, the girl 2.9 s, the cat 1.3 s, a first character
written from this page 14 s); after that the meshes come from a cache in the system's temporary folder, and any
change to the description builds afresh. Every render also prints `Truncating packet of size ... to 65536`: it
comes from writing the picture and is harmless.

The turnaround cells are small; to judge a face use the faces sheet (it is framed on the head), and to see the
rest pose's problems (arms touching the body) use the bend sheet's raised arm. Judge a face from the side as well
as the front: in profile the eye must still read open with the brow just above it, and looking up or down the
iris must stay in the opening. Then run the spin gate on the character (`tools/spin.mjs`): a shape that flickers
as it turns (a sliver that peeks past the neck, two straight upright outlines) shows there as a spike.

A broken description stops with a message that names the problem: a missing standard joint, a solid tied to a
joint that does not exist, a face feature that is not on the head, a skin that does not reach the wrist.

What to look for in the turnaround:

- every view: no gaps between skin and clothes, no clothes cut through by the body, feet flat on the floor;
- the back view: hair covers the back of the head down to the line, no skin showing in the hair;
- the side views: the face is not flat, the nose and the brows stand out, the belly and the seat are round.

**Triangle budget: up to 300,000 for a person, 100,000 for an animal or a small creature.** The man is 357,000
(too many), the girl 282,000, the cat 70,000; all three together cost about 6 ms of a 1080p frame. Halving `h`
makes a part about four times the triangles. Start the skin at `h` = height / 200 and large plain clothes (a long
skirt, a coat) at height / 150; the turnaround prints the count.

---

## 17. The girl, whole

`engine/scene3d/cast/girl.mjs`, read top to bottom:

1. **Named measures.** The arm's angle (40 degrees), the direction it points, a helper `along(p, s)` that walks
   `s` metres down the arm from `p`, then `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`, each written once.
2. **Joints.** The standard skeleton, plus `skirt` hanging from `pelvis` and `near` the spine, the chest and the
   thighs. The shoulders, elbows, hips and knees are marked `bend`.
3. **`skin`.** The torso under the dress (one egg on `pelvis`, one on `chest`), the neck (a short thick cone on `neck`, wider at the shoulders), the
   arms (cones from `shoulder` to `elbow` to `wrist`), the legs (cones from `hip` to `knee` to just above the
   ankle, a rosy knee egg on `shinL`), the head (two skull eggs, rosy cheeks, a small nose, ears). There are no
   hands (the `hands` block) and no feet (inside the socks and shoes).
4. **`socks`.** A cone round each ankle and an egg for the foot, clipped above 0.118 m.
5. **`shoes`.** An egg on `footL` and one on `toeL`, the opening carved with `sub`, a strap arching round the front of the
   ankle, clipped at the floor.
6. **`dress`.** The bodice on `chest` and `spine`, the back of the neckline raised on `chest`, puffed sleeves
   with a band below the puff on `upperArmL`, the bell on `skirt`, a small egg inside the front of the bell on
   each thigh (it carries the cloth over the knees); then the hollow underneath, the neck opening and the sleeve
   ends carved out, and the hem clipped at 0.292 m.
7. **`collar`.** Two little petals and a ring at the neck, clipped to keep only what is in front of the neck.
8. **The hem band pattern.** A cream band just above the hem and pleats that fan down the skirt.
9. **The description.** The five parts with their materials; `hands` (2 segments, child size); `hair` (fringe,
   side locks ending in a point at the ear lobe, two buns on springs with red ties); `face` (big brown eyes, thin brows, a small mouth);
   `loose` (the skirt); `rig` (ball, heel, and arms held out from the skirt).

A new character is best started by copying the girl (or the man, for a grown-up with bare feet, a beard and
three-segment fingers; or the cat, for four legs), renaming it, and changing the named measures first.
