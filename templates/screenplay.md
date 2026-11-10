# {{title}}

<!-- The screenplay is the plan the storyboard (film.json) is built from. Keep every section; replace the
     placeholders in angle brackets. Names in `backticks` are cinecode names (rigs, kits, anchors, moods, sounds):
     check them with `node bin/cinecode.mjs cast-sheet` / `set-sheet` and docs/ before you use them. -->

## Logline

<One sentence: who wants what, and what stands in the way.>

**Theme:** <what the film is about underneath the plot, if there is a theme. Name the lines or images that come back
later with a new meaning (a line said early that pays off at the end).>

## Characters

### <Name>, <what they are> (lead)
- **Rig:** `<rig>` <!-- hare, tortoise, fox, owl, squirrel, songbird, mouse, hedgehog, badger, deer, frog, beetle, butterfly, human;
     things: planet (a planet, moon or the Sun), telescope.
     No rig for the animal? The nearest one reskinned, plus an overlay for what it lacks (docs/cast.md).
     A prop the story turns on (a kite, a strawberry)? docs/effects.md, "Props". -->
- **Look:** <colours as hex, size (cast `scale`), rig params: e.g. human `age`, `hairStyle`, `glasses`, `scarf`>
- **Personality:** <how they move and talk; what they want; how they change>
- **Voice:** `<Gemini voice>`, tone "<two or three delivery adjectives>" <!-- adjectives only: nouns in a tone get read aloud -->

### <Name>, <what they are>
- **Rig:** `<rig>`
- **Look:** <…>
- **Personality:** <…>
- **Voice:** `<Gemini voice>`, tone "<…>"

### Narrator
- **Voice:** `<Gemini voice>`, tone "<…>". <When the narrator speaks, and when they stay silent.>

## Locations and times

| # | Location (kit) | Time | Anchors used | Purpose | Length |
|---|---|---|---|---|---|
| 1 | <place> (`meadow`) | `morning` | `stump_front`, `pond_edge` | <what happens here> | 30 s |
| 2 | <place> (`<kit>`) | `<time>` | `<anchor>`, `<anchor>` | <…> | <seconds> |

**Length target:** <total, title cards included>. <Shots average 4 s; a title card needs 3 s to be read. About 30 s:
5–6 shots, 3–5 lines, cards of 3 s; a minute: 12–14 shots, cards of 4 s. A slow voice can take twice the estimate:
aim about 10% under.>

<!-- kits: forest, hill, meadow, stream, valley, village, wayside. times: dawn, morning, noon, afternoon, golden,
     sunset, twilight, night (or a change across a scene: from golden to twilight). The space kit has one time of its
     own, space. -->

## Music plan

**Motif:** `<note:beats tokens, e.g. D5:1 B4:0.5 D5:0.5 E5:2 G5:3>` in `<key>`. <What the motif stands for, and where
the full statement is saved for.>

| Scene | Mood | Motif | Stings and sound |
|---|---|---|---|
| 1 | `pastoral` 0.35 | first 4 notes on `flute` | `surprise` sting on <beat>; `owl-hoot` |
| 2 | `<mood>` <intensity> | <…> | <…> |

<!-- moods: wonder, pastoral, tender, playful, tension, chase, sad, triumph, night, mystery (or "none" for silence).
     motif voices: bassoon, flute, cello, horn, celesta, violin, strings, music-box, tutti.
     stings: surprise, sad, triumph, magic, plunk, stab, swell. -->

## Screenplay

**Conventions**
- Every spoken line is captioned. A caption in brackets is a non-verbal sound: [laughs], [gasps]; give the voice
  what to say with `tts:` ("Hahaha!").
- A line is `NAME (delivery): "Text."`. The delivery becomes the line's tone: one to three adjectives.
- Shot ids are `<scene>.<shot>`; sizes are establishing, wide, full, medium, close, extreme-close.
- `(pad 0.6 s)` on its own line is a pause between two lines or actions.
- Durations are estimates (a line lasts about words / 2.6 + 0.3 s) until the voices are generated.

### Scene 1: <Location>, <time> (0:00–0:30)

**Starting places:** <Name> at `<anchor>` facing <left/right>, <pose>; <Name> offstage <left/right>.

**1.1** establishing, push-in. <What we see.>
NARRATOR (softly): "<Line.>"

**1.2** full on <Name>, track. <Name> enters from the left and walks to `<anchor>`.
<NAME> (curious): "<Line.>"

**1.3** medium on <Name>, static. <Action.>
<NAME> (<delivery>): "<Line.>"
(pad 0.6 s)
<NAME> (<delivery>): "<Line.>"

### Scene 2: <Location>, <time> (0:30–1:00)

**2.1** <size>, <move>. <…>

## Ending and final image

<The last image and the last line or sound. How it answers the opening.>
