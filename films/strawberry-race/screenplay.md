# The Last Strawberry

## Logline

A gruff old hedgehog and a cheeky young frog both want the last strawberry of summer on the far bank of the stream;
the frog wins the race by hopping the stones, but when the hedgehog crawls out of the water soaked and beaten, the
frog offers to share.

**Theme:** "mine" becomes "ours". Burr's opening "Mine!" comes back at the end as Plink's "Ours, then?" and Burr's
echo, "Ours, then." (a bare "Ours." was heard as "hours" by the voice check three times). The strawberry is seen whole twice (the insert in 1.2, the two-shot in 1.7) and the second time it splits.

## Characters

### Burr, a hedgehog (lead)
- **Rig:** `hedgehog`
- **Look:** default brown spines, cast `scale` 1.1 (a big old hedgehog next to a small frog). Wet after the wade:
  darker spines (`spine` #3d2a1c, `tip` #7d6e5e) via `do: set`, plus a custom `drips` beat (water dripping off his back).
  Faces: `determined` to start; `worried` then `sleepy` (weary) when beaten (the rig's `sad` reads as angry).
- **Personality:** slow, grumpy, greedy at first; stubborn enough to wade straight through the water; touched when
  the frog shares.
- **Voice:** `Algenib`, tone "gruff, low"

### Plink, a frog
- **Rig:** `frog`
- **Look:** default green, cast `scale` 1.0.
- **Personality:** quick, cocky, a show-off; hops the stepping stones in no time; kind underneath.
- **Voice:** `Puck`, tone "cheeky, quick"

### The strawberry (a prop)
- **Rig:** `strawberry`, a custom rig in `custom.mjs` (cinecode has no props: a static rig is the way to make an
  object the camera can frame, that stands in depth among the actors and can change with `pose` / `set`). Poses
  `stand` (whole) and `split` (two halves apart); params `left` / `right` (how much of each half is left, 1 → 0).
  A custom `glint` beat puts one star of light on its shoulder in the insert.

### Narrator
- None. The film is short and plays on looks and the race.

## Locations and times

| # | Location (kit) | Time | Anchors used | Purpose | Length |
|---|---|---|---|---|---|
| 1 | The stream (`stream`) | `golden` | `bank_left` area (start), `stone_1`, `stone_2`, `bank_right`, a strawberry at `x:1745,y:1076` | spot, race, share | 32 s |

**Length target:** about 30 s with the title cards: 1 scene, 7 shots, 5 lines. Came out at 36.7 s: Burr's gruff take of
line 1 is 3.8 s (a dramatic pause before "Mine!") and the cards need 2.5 / 2.6 s to be readable.

## Music plan

**Motif:** `A4:0.5 C5:0.5 F5:1 E5:0.5 D5:0.5 C5:2` in `F`. The strawberry's tune: first four notes on the flute at
the start, the whole thing on the music-box when they share.

| Scene | Mood | Motif | Stings and sound |
|---|---|---|---|
| 1 | `pastoral` 0.35 (1.1–1.3), `chase` 0.7 (1.4), `playful` 0.6 with `downbeat` (1.5), `sad` 0.3 (1.6), `tender` 0.35 with `hold` (1.7) | 4 notes on `flute` in 1.1; all on `music-box` in 1.7 | `magic` + `sparkle` on the glint; splashes automatic; `sad` sting when Plink sees Burr; `drip` on Burr; `pop` + `swell` when it splits; `croak` at the end |

## Screenplay

**Conventions**
- Every spoken line is captioned. A caption in brackets is a non-verbal sound.
- A line is `NAME (delivery): "Text."`. The delivery becomes the line's tone.
- Shot ids are `<scene>.<shot>`.
- `(pad 0.6 s)` on its own line is a pause.

### Scene 1: The stream, golden afternoon (0:02.5–0:34.2)

**Starting places:** Burr on the left bank at `x:900,y:1058` facing right; Plink beside him at `x:985,y:1062` facing
right; the strawberry on the far bank at `x:1745,y:1076` (a little nearer the camera than the lane, so routes pass
behind it).

**1.1** establishing, push-in. The brook in late-summer light; two small figures on the left bank. (1.6 s)

**1.2** close on the strawberry, static. One red strawberry on the bank; one glint. `magic` sting. (1.8 s)

**1.3** full on Burr and Plink, static. Both look across the water; Plink turns to Burr as he claims it.
BURR (greedy): "The last strawberry. Mine!"
(pad 0.3 s)
PLINK (cheeky): "Not if I get there first!"

**1.4** wide, track on both, 4 s. The race: Plink leaps onto the first two stones; Burr plunges into the water and
swims, sunk to his spines (one long wade that carries on through 1.5 into 1.6). `chase`.

**1.5** full on Plink and the strawberry, static. (The cut skips the last two stones.) Plink hops past behind the
strawberry, turns round.
PLINK (gloating): "Too slow!"
He looks back across the water at Burr; his grin fades (`sad` sting).

**1.6** full on Burr, track. Burr climbs out of the stream, dripping, spines dark; worried, then he slumps, weary.
`sad`.

**1.7** full on all three, static. Plink waits on the right of the strawberry; Burr trudges up to its left and looks
at Plink.
(pad 0.2 s)
PLINK (soft): "Ours, then?"
(pad 0.2 s)
BURR (warm): "Ours, then."
The strawberry splits into two halves (`pop`, `swell`). Plink catches his half with his tongue; Burr nibbles his.
They laugh. Plink hops up beside Burr; Burr sits; a croak.

## Ending and final image

The two of them face to face, close, on the far bank where the strawberry was, in the golden light. It answers the
opening: the same two at the water's edge, but on the far side, and together instead of side by side as rivals.
