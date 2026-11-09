# Storm Shelter

<!-- The screenplay is the plan the storyboard (film.json) is built from. Keep every section; replace the
     placeholders in angle brackets. Names in `backticks` are cinecode names (rigs, kits, anchors, moods, sounds):
     check them with `node bin/cinecode.mjs cast-sheet` / `set-sheet` and docs/ before you use them. -->

## Logline

A soaked badger dashes through a thunderstorm to the old wayside tree and finds a shy deer already sheltering there;
she offers to leave, and he has to decide whether the tree is his or theirs.

**Theme:** shelter is bigger when it is shared. The thunder that sends the deer away is the thunder that keeps her:
the first crack frightens her alone, the last one finds her lying beside the badger, unafraid.

## Characters

### Bramble, a badger (lead)
- **Rig:** `badger`
- **Look:** default grey coat, dark legs; cast `scale` 1.15 so he reads next to the deer.
- **Personality:** gruff, hurried, kind underneath; wants to be dry; changes from "my tree" panic to making room.
- **Voice:** `Algenib`, tone "gruff, warm"

### Fern, a young doe
- **Rig:** `deer`, no antlers
- **Look:** warm fawn coat `#a87a4e`, pale belly `#efe0c6`; cast `scale` 0.9 (young, slight).
- **Personality:** shy, quick to apologise, startled by noise; wants to stay but won't ask.
- **Voice:** `Achernar`, tone "soft, quiet"

### Narrator
- **Voice:** none. The film has no narrator; the storm and the two characters carry it.

## Locations and times

| # | Location (kit) | Time | Anchors used | Purpose | Length |
|---|---|---|---|---|---|
| 1 | The old wayside tree in a thunderstorm (`wayside`) | `afternoon`, darkened by a custom storm sky and grade | `x:1320,y:1026` (Fern lies here: just left of `nap`, so she reads against grass, not the brown root), `x:1545,y:1042` (Bramble stops here: just left of `roots_front`), the path from `x:2720` | the dash, the find, the offer to leave, the thunder, the shared shelter | 30 s |

**Length target:** about 30 s with two 2 s title cards: 1 scene, 8 shots, 5 lines. (Voiced and staged: 34.3 s.)

Substitutions and custom work (the engine has no storm): a custom `storm-sky` overlay (dark rolling clouds and
lightning bolts on the `sky` layer), a `storm-light` overlay (a cold grey grade and the lightning flash on the
`grade` layer), the built-in `rain` field, custom `thunder` and `rain-bed` sounds, and a `shake` custom beat (spray
flying off the badger: the badger rig has no shake gesture).

## Music plan

**Motif:** `E5:1 D5:0.5 C5:0.5 D5:2 G4:2` in `C`. A small falling-and-rising phrase for "come in out of the rain";
stated once in full on `cello` under the final image.

| Scene | Mood | Motif | Stings and sound |
|---|---|---|---|
| 1 (1.1–1.3) | `chase` 0.55 | none | thunder with each bolt; `rain-bed` and `wind` the whole scene |
| 1 (1.4–1.6) | `tension` 0.3 | none | `surprise` sting on the find |
| 1 (1.7–1.8) | `tender` 0.35 | full motif on `cello` | the last thunder far and soft |

## Screenplay

**Conventions**
- Every spoken line is captioned. A caption in brackets is a non-verbal sound: [laughs], [gasps]; give the voice
  what to say with `tts:` ("Hahaha!").
- A line is `NAME (delivery): "Text."`. The delivery becomes the line's tone: one to three adjectives.
- Shot ids are `<scene>.<shot>`; sizes are establishing, wide, full, medium, close, extreme-close.
- `(pad 0.6 s)` on its own line is a pause between two lines or actions.
- Durations are estimates (a line lasts about words / 2.6 + 0.3 s) until the voices are generated.

### Scene 1: The wayside tree, a thunderstorm (0:02–0:32)

**Starting places:** Fern lies at `x:1320,y:1026` facing right, head up, worried; Bramble at the far right of the path (`x:2720`), facing left.

**1.1** establishing, slow push-in. Rain sheets over the field; the great tree stands black against a bruised sky. A
bolt forks behind the tree and thunder rolls. Far right, a small striped shape tears in along the path: Bramble.

**1.2** full on Bramble, track. He runs left along the path, head down, rain bouncing off his back.
BRAMBLE (breathless): "Rain, rain, rain!"

**1.3** full two-shot, static. Bramble skids in under the tree at `x:1545,y:1042` and shakes the water off (spray). A
flash: he sees Fern lying a body-length away. Both freeze.
BRAMBLE (startled): "Oh! Didn't see you there."

**1.4** medium on Fern, tilt-up with her as she rises. Fern scrambles to her feet, eyes down.
FERN (timid): "Sorry. I'll go."
She turns away, toward the open field.

**1.5** wide on Fern at the tree's edge, static. The biggest bolt of the film; thunder cracks right overhead. Fern
startles into a jump; she looks back at Bramble, and he sits back on his haunches: a badger making room.

**1.6** medium on Bramble, static. Sitting, he looks at her. (A close-up showed his talking mouth as a snarl.)
BRAMBLE (gentle): "Stay. It's a big tree."

**1.7** full on Fern, static. She looks at him, then folds back down onto the dry roots.
FERN (grateful): "Thank you."

**1.8** wide, slow pull-out (to 0.55× the zoom). The two of them under the old tree, rain silver around it, a last soft roll of thunder far
off. Fern lowers her head; Bramble settles. Hold.

## Ending and final image

The tree from 1.1 again, but now there are two shapes in its dry ring and the thunder is far away. It answers the
opening: the storm that drove both of them here is still falling, and neither is alone in it.
