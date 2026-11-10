# Cast reference (rigs)

Generated from the rig registry by `node <skill>/scripts/inventory.mjs cast` (add `films/<slug>` to include that film's custom rigs). Rerun it when the engine changes; the live registry wins over this snapshot. The notes at the end are by hand. `cinecode cast-sheet <kinds> -o out/<name>.jpg` draws every pose, gesture and expression.

Speeds are units/s at scale 1. On screen an actor covers `speed × s` world px/s, where s = set.scaleAt(x, y) × cast `scale`. "300 px" = seconds to walk 300 world px at s 1.3.

| rig | height | walk | fastest | 300 px | can |
|---|---|---|---|---|---|
| badger | 35 | 36 | run 120 | 6.4 s | ground |
| beetle | 7.5 | 11 | run 26 | 21.0 s | ground |
| butterfly | 17 | 4 | fly 80 | 57.7 s | perch, fly |
| deer | 143 | 72 | run 580 | 3.2 s | ground |
| fox | 83 | 52 | run 500 | 4.4 s | ground |
| frog | 19 | 26 | run 92 | 8.9 s | ground |
| hare | 103 | 46 | run 640 | 5.0 s | ground |
| hedgehog | 24 | 18 | run 42 | 12.8 s | ground |
| human | 141 | 92 | run 240 | 2.5 s | ground |
| mouse | 17.5 | 24 | run 80 | 9.6 s | ground |
| owl | 62 | 22 | fly 220 | 10.5 s | perch, fly |
| planet | 91.5 | 40 | run 200 | 5.8 s | perch, no face |
| songbird | 24 | 26 | fly 190 | 8.9 s | perch, fly |
| squirrel | 52 | 24 | run 165 | 9.6 s | perch |
| telescope | 192.3 | 30 | walk 30 | 7.7 s | no face |
| tortoise | 50 | 15 | run 34 | 15.4 s | carry a rider, look 1s |

### badger

- poses: stand, alert, sit, upright, cheer, sleep, rest
- gaits: walk, run
- gestures: nod, laugh, jump, cheer, wave, dig, sniff
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: coat, face, dark, leg, claw

### beetle

- poses: stand, alert, sit, sleep, rest
- gaits: walk, run
- gestures: nod, laugh, jump, wave
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: shell, leg

### butterfly

- poses: stand, sit, open, alert, sleep, rest, perch
- gaits: fly, glide, walk
- gestures: nod, laugh, jump, flutter, wave
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: col, col2, tip, spot, body

### deer

- poses: stand, alert, graze, sit, sleep, rest, lie
- gaits: walk, run
- gestures: nod, laugh, jump, graze, flick, stamp
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: coat, belly, muzzle, earIn, hoof, eye, antler, antlers

### fox

- poses: stand, alert, sit, lie, sleep, crouch, leap, rest, walk
- gaits: walk, trot, run
- gestures: nod, laugh, jump, wave, point, sniff, bow
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: coat, cream, sock, eye

### frog

- poses: stand, alert, sit, sleep, croak, rest
- gaits: walk, hop, run
- gestures: nod, laugh, jump, croak, catch
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: skin, belly, spot, sac, eye

### hare

- poses: stand, sit, stretch, bunch, up, mock, laugh, wiggle, offer, look, yawn, sleep, alert, ready, skid, slump, rest, crouch
- gaits: walk, hop, run
- gestures: nod, laugh, jump, wave, point, yawn, thump, shrug
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: fur, belly, earIn, earTip, nose, eye, tail

### hedgehog

- poses: stand, alert, sit, ball, sleep, rest
- gaits: walk, run
- gestures: nod, laugh, jump, sniff, curl, bristle
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: spine, tip, face, belly, skin

### human

- poses: stand, idle-weight-shift, sit-ground, sit-seat, crouch, kneel, lie, sleep, look-up, hands-on-hips, arms-crossed, reach-up, carry, hold-hand-out, sit, idle
- gaits: walk, run
- gestures: wave, nod, shake-head, shrug, laugh, jump-for-joy, point, point-up, point-down, bow, gasp, beckon, clap
- expressions: neutral, happy, sad, surprised, angry, sleepy, worried, laughing, curious
- params: age, build, height, seed, skin, blush, eyes, view, hairStyle, hair, beard, shirt, sleeves, bottom, pants, dress, shoes, socks, scarf, glasses, hat, apron, backpack, tear, hem, scarfLength, dressStyle, top, under

### mouse

- poses: stand, sit, alert, gasp, cheer, sleep, rest, idle
- gaits: walk, scurry, run
- gestures: nod, laugh, jump, wave, point, cheer, gasp
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: fur, belly, earIn, nose, paw, tail, eye

### owl

- poses: stand, alert, sit, sleep, spread, hoot, rest
- gaits: walk, run, fly, glide
- gestures: nod, laugh, jump, hoot, flap, turn, wave
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined, one-eye
- params: body, belly, disc, wing, beak, eye, leg, toe

### planet

- poses: stand, perch
- gaits: walk, run
- gestures: 
- expressions: neutral
- params: body

### songbird

- poses: stand, alert, sit, sleep, sing, spread, rest, perch
- gaits: walk, hop, run, fly, glide
- gestures: nod, laugh, jump, sing, flap, peck, wave
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: body, breast, wing, beak, leg

### squirrel

- poses: stand, sit, hold, alert, shush, sleep, flop, sprawl, rest, perch
- gaits: walk, run
- gestures: nod, laugh, jump, wave, point, shush, drop, nibble
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: coat, cream, earIn, nose, eye, tail

### telescope

- poses: stand
- gaits: walk
- gestures: 
- expressions: neutral
- params: angle, eye, tube, trim, legs, dark

### tortoise

- poses: stand, alert, stretch, sit, sleep, hide, droop, rest
- gaits: walk, run
- gestures: nod, laugh, jump, wave, hide, stretch
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: skin, shell, rim, claw, eye, iris, seam, moss, star, starCol, lids, wet


## Notes that the tables don't show

- **human** (`engine/cast/human.mjs` header has the full list): `age` child | teen | adult | elder (each has its own proportions and default clothes); `view` profile (default) | three-quarter (the older head with both eyes); `hairStyle` short | long | ponytail | bun | braids | curly | bald | cap; `build` slight | slim | average | sturdy; `bottom` trousers | shorts | skirt | dress with `pants` / `dress` colours; `top` shirt | cardigan; `scarf` colour + `scarfLength`; `glasses` true or a frame colour (one glint); `tear` 0..1; `shoes` null = barefoot; `hat`, `apron`, `backpack`, `beard`. Poses `sit-ground` (on the grass) and `sit-seat` (contact = the seat surface, e.g. a `bench_seat` anchor). Sit ↔ stand blends route through a crouch: give the pose beat a `dur` of 1–2.5 s for an elder. A gesture beat passes only its `name`: `point` follows her eyeline (a `look` at the sky or at someone first), `point-up` / `point-down` aim outright; a `to` on the gesture is ignored. Her hands are `hand` / `hands.front` / `hands.back` of the rig's `draw(null, …)` (`docs/effects.md`), for a string or a held prop drawn as an overlay.
- **tortoise**: `mount()` gives the shell-top riding point (`"to": "on:<tortoise>"`), `lookTime` 1 s (looks and tilts are slow), and params `star`, `starCol`, `moss`, `seam`, `lids`, `wet` (animate with `do: set`). Cast `"scale"` sizes him (Seventy-Six Summers: 1.35 old, 0.4 young).
- **squirrel**: `tail` 0.4..1.8 (under 0.7 = flat and wet); pose `flop` lies over something round (a shell, a branch).
- **frog**: `walk` and `hop` are small hops at 26 (its slowest: 300 px takes about 9 s); `run` is big leaps at 92. Across
  stepping stones every rig jumps stone to stone, 0.7–1.5 s a stone (the small rigs the longest) whatever its gait or `speed`.
- **owl**: expression `one-eye` (a dozing owl peeking). Perches on `perch` anchors; can fly.
- **planet**: a planet, moon or star, one rig with a `body` preset: saturn (default), jupiter, earth, mars, venus,
  mercury, uranus, neptune, moon, titan, sun. Other params: `tilt` (the rings' opening, radians; Saturn 0.38),
  `roll` (the whole body turned), `axis` (how much of a ringless body's pole we see), `spin` (band drift per second),
  `size`. Saturn's rings are at their true radii. Size it with the cast `scale` (the Saturn chapter's Saturn is 2.5);
  for true relative sizes multiply by the ratio of radii (`radiusOf` in `cinecode/paint/planets`:
  Earth / Saturn = 0.1058). It holds at a `perch` anchor (the `space` kit's), stays upright, throws no shadow, has
  no face (the camera crops into it: `zoom` above 1, `focus`), and its `head` is the globe's centre, so `close`
  frames the globe. A moon behind or in front of it is a second planet actor with a `z` (SKILL.md, "Space and depth").
- **telescope**: a refractor on a wooden tripod, a prop (no face), pointing up the way it faces; params `angle`
  (the tube's elevation, default 0.5 rad), `eye` (the eyepiece height, default 116: a standing child's eye) and its
  colours. A child at the eyepiece faces the same way and stands 66 × s behind its contact point (s = the set's scale
  there × cast `scale`): facing left, child x = telescope x + 66 × s. Its `head` is the eyepiece, so a `close` on
  it frames the eyecup and a face at it.
- **Rigs with no face** (planet, telescope, a prop rig like the strawberry: only the `neutral` expression, or the
  rig's own `faceless: true`): the camera has no head to keep above the captions, so a `zoom` above 1 on a shot
  whose subjects all have no face crops into them, and lint's face rules (a head cut near the eyes, a halo, a caption over a face) skip them.
- Cast-level `scale` multiplies the set's perspective scale; lint divides by it, so a big or tiny character isn't a `scale` error.
- `do: set` changes params mid-shot (`{ "do": "set", "who": "fidget", "params": { "coat": "#8e3c1e", "tail": 0.45 } }`), e.g. wet fur after a wade.
- **Fliers** (owl, songbird, butterfly; the beetle has no fly gait) hover with `"height": N` on a `fly`, `enter` or
  `place` (or a scene actor's `at`): they hold N units above the place (at the set's scale), flapping with a gentle
  bob, and talk and gesture there; the camera allows for the beating wings. Without `height` a flight ends on the
  ground, a surface, a perch, a hollow or another actor (`hop` to `on:<actor>`: a butterfly rides a mouse's head).
  `enter` flies in from above to a perch, a surface, a hollow or `on:<actor>`, or with `"fly": true`; to a ground
  place without it, it comes along the ground in its `gait`.
- **Head tilt** (`look` `to` up / sky / down, or `tilt` −1..1, + up, − down): every rig but the beetle, butterfly and
  songbird. `up` is a full look up, `sky` a moderate one (about 16°). On a small rig in a wide or full shot it is a few
  pixels; a pose reads better (mouse `alert`, human `look-up`). The deer's head barely drops at −1 (its neck stays up):
  for a shy deer, turn it away, use `worried`, or the `graze` pose.
- **Faces that read wrong.** On the hedgehog, mouse and badger in profile, `sad` (a heavy, slanted lid, no visible
  frown) reads as a scowl, close to `angry`: use `worried` (anxious) or `sleepy` (weary), and let a pose or the music
  carry the sadness. Talking, the badger opens a dark red gape with fangs and the fox shows its teeth (gentle lines read
  as a snarl in a close-up: frame them medium), and the deer's dropped white jaw reads as a grin. Look at the face in a
  still before a close-up of a gentle line.
- **Gestures vs. poses in close shots.** A static or handheld `close` shot follows a gesture that holds the head out
  of frame for 0.5 s or more (the mouse's `gasp` sits her up): it eases out to keep the ears in and back after.
  Extreme close-ups and moving shots frame the resting head only: use the pose of the same name there (mouse poses
  `gasp`, `cheer`, `alert`).
- **No rig for the animal?** Adapt first, build second (SKILL.md, "What isn't there"). These adaptations have read
  well, at the framings they were used in: firefly = butterfly `scale` 0.6, dark wings (`col`, `col2`, `tip`), yellow
  `body` + a glow overlay; crow (loosely, a bat) = near-black songbird `scale` 1.3; rabbit = hare `scale` 0.7; rat =
  mouse; wolf or dog = grey or brown fox (`coat`, `cream`, `sock`); ladybird = red beetle (`shell`); turtle = tortoise.
  They are a fallback, not the answer: when the animal must read as itself (a wolf in a close-up, a crow that caws on a
  branch), build its rig with the `build-rig` skill (`films/<slug>/rigs/<kind>.mjs`, gated by `cinecode verify-rig`).
  Name every adaptation or new rig in the screenplay and the report.
- **Props.** A ground object the camera frames and that changes state (a strawberry that splits, is eaten): a small
  static rig (`build-rig`; `CINECODE/films/strawberry-race/rigs/strawberry.mjs` is one) with a pose per state and params
  for the rest; moving actors route round it (a wide detour near a small prop: keep routes clear of it) and its ground
  shadow stays until a `fade`. A thing in the air (a kite, a ball, a lantern): its own flying rig (`flies: true`, a `fly`
  gait, hovering with `height`), or the quicker stand-in: a butterfly hovering with `height`, moved by `fly`, faded to 0
  by its first beat, carrying an overlay that draws the thing at its `box` (still returned at opacity 0; the camera
  frames it with `on`; `CINECODE/films/kite/`).
- **Framing part of something** (Saturn's cloud bands, the edge of its rings, a crown of leaves) needs no stand-in:
  `"zoom": 1.6` (and an `offset`) crops into a subject with no face, `"focus": [0.9, 0.5]` puts that point of the
  subjects' box at the centre (any subject), and `"on": ["x:1840,y:886"]` frames a point of the set. A hidden
  stand-in is still the way to give the camera a subject that moves through the air.
