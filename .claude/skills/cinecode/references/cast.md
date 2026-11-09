# Cast reference (rigs)

Generated from the rig registry by `node .claude/skills/cinecode/scripts/inventory.mjs cast` (add `films/<slug>` to include that film's custom rigs). Rerun it when the engine changes; the live registry wins over this snapshot. The notes at the end are by hand. `node bin/cinecode.mjs cast-sheet <kinds> -o out/<name>.jpg` draws every pose, gesture and expression.

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
| songbird | 24 | 26 | fly 190 | 8.9 s | perch, fly |
| squirrel | 52 | 24 | run 165 | 9.6 s | perch |
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
- params: age, build, height, seed, skin, blush, eyes, hairStyle, hair, beard, shirt, sleeves, bottom, pants, dress, shoes, socks, scarf, glasses, hat, apron, backpack, tear, hem, scarfLength, dressStyle, top, under, view (profile | three-quarter)

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

### tortoise

- poses: stand, alert, stretch, sit, sleep, hide, droop, rest
- gaits: walk, run
- gestures: nod, laugh, jump, wave, hide, stretch
- expressions: neutral, happy, laugh, sad, surprised, angry, sleepy, smug, worried, scared, determined
- params: skin, shell, rim, claw, eye, iris, seam, moss, star, starCol, lids, wet


## Notes that the tables don't show

- **human** (`engine/cast/human.mjs` header has the full list): `age` child | teen | adult | elder (each has its own proportions and default clothes); `hairStyle` short | long | ponytail | bun | braids | curly | bald | cap; `build` slight | slim | average | sturdy; `bottom` trousers | shorts | skirt | dress with `pants` / `dress` colours; `top` shirt | cardigan; `scarf` colour + `scarfLength`; `glasses` true or a frame colour (one glint); `tear` 0..1; `shoes` null = barefoot; `hat`, `apron`, `backpack`, `beard`. Poses `sit-ground` (on the grass) and `sit-seat` (contact = the seat surface, e.g. a `bench_seat` anchor). Sit ↔ stand blends route through a crouch: give the pose beat a `dur` of 1–2.5 s for an elder. `point` aims with `to`: up | sky | ahead | down.
- **tortoise**: `mount()` gives the shell-top riding point (`"to": "on:<tortoise>"`), `lookTime` 1 s (looks and tilts are slow), and params `star`, `starCol`, `moss`, `seam`, `lids`, `wet` (animate with `do: set`). Cast `"scale"` sizes him (Seventy-Six Summers: 1.35 old, 0.4 young).
- **squirrel**: `tail` 0.4..1.8 (under 0.7 = flat and wet); pose `flop` lies over something round (a shell, a branch).
- **owl**: expression `one-eye` (a dozing owl peeking). Perches on `perch` anchors; can fly.
- Cast-level `scale` multiplies the set's perspective scale; lint divides by it, so a big or tiny character isn't a `scale` error.
- `do: set` changes params mid-shot (`{ "do": "set", "who": "fidget", "params": { "coat": "#8e3c1e", "tail": 0.45 } }`), e.g. wet fur after a wade.
- **Fliers** (owl, songbird, butterfly) can't hover: every flight ends standing on the ground, a surface, a perch, a
  hollow, or another actor (`hop` to `on:<actor>`: a butterfly rides a mouse's head). `enter` flies in from above
  only to a perch, a surface, a hollow or `on:<actor>`; to a ground place it comes along the ground in its `gait`.
  Land a small flier with an explicit `x:` a body length away: `near:` can put its wings over the other's face.
- **Head tilt** (`look` `to` up / sky / down): every rig but the beetle, butterfly and songbird. On a small rig in a
  wide or full shot it is a few pixels; a pose reads better (mouse `alert`, human `look-up`).
- **Gestures vs. poses in close shots.** Close and extreme-close shots frame the resting head, not a gesture's peak:
  the mouse's `gasp` gesture sits her up out of the top of a close-up. Use the pose of the same name there (mouse
  poses `gasp`, `cheer`, `alert`).
- **No rig for the animal?** Reskin the nearest rig (`params`, cast `scale`) and draw what it lacks as an overlay that
  follows `api.actor(id).box` (light on the `grade` layer). Seen to read well: firefly = butterfly `scale` 0.6, dark
  wings (`col`, `col2`, `tip`), yellow `body` + a glow overlay; crow (loosely, a bat) = near-black songbird `scale`
  1.3; rabbit = hare `scale` 0.7; rat = mouse; wolf or dog = grey or brown fox (`coat`, `cream`, `sock`); ladybird =
  red beetle (`shell`); turtle = tortoise. Name the substitution in the screenplay and the report.
