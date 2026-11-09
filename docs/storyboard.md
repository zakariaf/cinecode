# The storyboard: film.json

A film is a folder `films/<slug>/` with one storyboard file, `film.json`. It says who is in the film, where it takes
place, and what happens shot by shot. The engine works out everything else: where the actors walk, how the camera
frames them, how long each shot lasts, the captions, the sound effects and the music cues.

This page lists every field the engine reads. `cinecode check` validates the file against the same rules (the
validator is `engine/film/validate.mjs`; the compiler that turns it into a timed plan is `engine/film/compile.mjs`).

Contents: [top level](#top-level) · [format and titles](#format-and-titles) · [voices and cast](#voices-and-cast) ·
[sets](#sets) · [score](#score) · [scenes](#scenes) · [places](#places) · [shots](#shots) · [camera](#camera) ·
[beats](#beats) · [timing rules](#timing-rules) · [say](#say) · [do](#do-actions) · [sfx](#sfx) · [fx](#fx) ·
[music](#music) · [title](#title) · [mark](#mark) · [wait](#wait) · [captions](#captions) ·
[§9 extensions](#9-extensions-at-a-glance) · [checking](#checking-a-storyboard)

A complete small example is `templates/film.json` (what `cinecode new` gives you). A large one is
`films/seventy-six-summers/film.json`.

## Top level

| field | required | meaning |
|---|---|---|
| `title` | no (warning if missing) | the film's title: opening card, contact sheets, the video's metadata |
| `logline` | no | one sentence for people reading the file; the engine does not use it |
| `format` | no | `{ width, height, fps, captions }`, see below |
| `titles` | no | opening and end cards, see below |
| `score` | no | the film's key and melodic motif, see [score](#score) |
| `voices` | for any line | voice id → `{ voice, tone }` |
| `cast` | for any actor | cast id → `{ rig, name, voice, params, scale }` |
| `sets` | yes (at least one) | set id → `{ kit, params }` |
| `scenes` | yes (at least one) | the film, in order |
| `seed` | no | seed for the score (`cinecode music`, `mix`, `animatic`, `render`); default 1 |

Fields the engine doesn't know at the top level, scene or shot level are ignored; unknown fields on a beat are
reported as warnings (see [checking](#checking-a-storyboard)).

## Format and titles

```json
"format": { "width": 1920, "height": 1080, "fps": 24, "captions": "dialogue" },
"titles": {
  "open": { "title": "The Lantern Moth", "subtitle": "a cinecode film", "dur": 4 },
  "end":  { "lines": ["The End"], "dur": 4 }
}
```

| field | default | rules |
|---|---|---|
| `format.width`, `format.height` | 1920, 1080 | even integers, 16–8192 |
| `format.fps` | 24 | integer, 1–120 |
| `format.captions` | `"dialogue"` | which captions are burned into the picture: `dialogue` (cast lines only), `all` (also narration and sound captions), `none`. The `.srt` file and the soft subtitles in the MP4 always carry every caption. |
| `titles.open` | none | a parchment title card before the first scene: `title` (default: the film's `title`), `subtitle`, `dur` (seconds, default 5). It dissolves into the first shot over its last second. |
| `titles.end` | none | an end card after the last scene: `lines` (default `["The End"]`), `dur` (default 5). It dissolves in from the last shot and fades to black over its last 1.2 s. |

Without an opening card the first scene fades in from black (0.8 s); without an end card the last scene fades out
(1.2 s). The first music cue starts under the opening card and the last one runs on under the end card.

## Voices and cast

```json
"voices": {
  "narrator": { "voice": "Sulafat", "tone": "warm, gentle, unhurried" },
  "pip":      { "voice": "Leda",    "tone": "bright, eager" }
},
"cast": {
  "pip": { "rig": "human", "name": "Pip", "voice": "pip",
           "params": { "age": "child", "hairStyle": "braids", "hair": "#3b2a20" } },
  "fox": { "rig": "fox", "name": "Old Fox", "voice": "fox", "scale": 1.2 }
}
```

`voices.<id>`: `voice` is one of the 30 prebuilt Gemini voices (required), `tone` is the voice's standing direction,
joined with each line's own `tone`. See [sound.md](sound.md#voices) for the list and for how to write tones.
The id `narrator` is the narrator; every other voice id is referred to by a cast member's `voice`.

`cast.<id>` (the id `narrator` is reserved):

| field | meaning |
|---|---|
| `rig` | required: a rig kind (`hare`, `human`, …; see [cast.md](cast.md)) or a rig from `custom.mjs` |
| `name` | display name (default: the id) |
| `voice` | a key of `voices`. A speaker may also use a voice with the same id as itself (`voices.fox` for `cast.fox`). |
| `params` | the rig's look: colours, sizes, the human's age, hair, clothes… ([cast.md](cast.md)) |
| `scale` | size multiplier, 0.1–10 (default 1): a big old tortoise is `1.35`, a baby one `0.4` |

## Sets

```json
"sets": { "meadow": { "kit": "meadow" }, "home": { "kit": "village", "params": { "seed": 2 } } }
```

A set is an instance of a kit (a painted location; see [sets.md](sets.md)). `kit` is required; `params` is passed to
the kit (the built-in kits read only `seed`, which changes the random details of the painting). Two sets may use the
same kit.

## Score

```json
"score": { "key": "G", "motif": "D5:1 B4:0.5 D5:0.5 E5:2 G5:3" }
```

`key` is a key name (`"C"`, `"Eb"`, `"F#m"`, `"A minor"`); `motif` is the film's tune as `note:beats` tokens
(`G4:1`, `Bb3:0.5`; beats > 0). With a score every cue is in that key and its melodies grow out of the motif; a
music cue with `"motif": n` states the motif's first n notes. See [sound.md](sound.md#the-motif).

## Scenes

```json
{
  "id": "s01", "set": "meadow", "time": "dawn",
  "music": { "mood": "wonder", "intensity": 0.4 }, "ambience": "auto",
  "actors": {
    "pip": { "at": "pond_edge", "face": "right", "pose": "sit" },
    "fox": { "offstage": "right" }
  },
  "shots": [ … ]
}
```

| field | meaning |
|---|---|
| `id` | required, unique in the film |
| `set` | required: a key of `sets` |
| `time` | time of day: `dawn`, `morning`, `noon`, `afternoon`, `golden`, `sunset`, `twilight`, `night`, or a change across the scene `{ "from": "golden", "to": "twilight" }` (the change happens over the middle 80% of the scene). Default: the kit's default time. |
| `grade` | a story grade on top of the time of day: `memory` (sepia storybook plate with a torn page edge), `dream` (soft, bloomed), `none` |
| `transition` | how the scene begins: `cut`, `fade` (0.35 s through black on each side), `dissolve` (0.8 s). Default: `dissolve` when the set or the time changes from the previous scene, else `cut`. |
| `music` | the scene's music cue: a mood name, `"none"` (silence; the score fades out over 0.3 s), or `{ "mood", "intensity", "motif", "motifVoice", "hold", "downbeat", "tempo" }`. Leave it out to continue the previous scene's mood and intensity. See [music](#music). |
| `ambience` | `"auto"` (default: the set's day or night bed by the time of day), `"none"`, or an ambience name (`meadow-day`, `meadow-night`, `forest-day`, `forest-night`, `stream`, `village-day`, `village-night`, `wind-hill`) |
| `fx` | built-in effects for the whole scene: `["fireflies", "mist"]` (`leaves`, `rain`, `fireflies`, `motes`, `mist`) |
| `overlays` | drawings for the whole scene: built-in effect names as above, or overlays from `custom.mjs`: `["comet", { "name": "far-hill", "params": { "frac": 0.04 } }]`. See [effects.md](effects.md). |
| `rim` | a rim light on every visible actor, drawn after the grade: `{ "dir", "color", "strength", "start", "rise", "width" }`, see below |
| `actors` | who is in the scene at its start, see below |
| `shots` | required, at least one |

`rim`: `dir` is the side the light comes from (`left`, `right`, `top`, `upper-left` (default), `upper-right`),
`color` a CSS colour (default `#fff1d6`), `strength` 0..1 (default 0.8), `width` in screen pixels (default 3, at
least 2 is drawn), `start` a [mark](#mark) name or seconds from the scene start (default 0), `rise` seconds to ease in
(default 0).

**Scene actors.** Each entry is one of:

- `{ "at": <place>, "face": "left" | "right", "pose": <pose>, "expr": <expression> }`: on stage from the start.
  `at` is required. Without `face`, an actor faces the set's centre (or the way the anchor says). Without `pose` it
  stands (or perches, on a perch).
- `{ "on": <actor>, "pose": <pose> }`: riding another actor of the scene from the start (default pose `sit`). The
  carrier must start on stage and not be a rider itself.
- `{ "offstage": "left" | "right" }`: not visible; brought in later with an [`enter`](#do-actions) beat.

Anyone not listed can still come in with `enter`. **Actor state carries from shot to shot within a scene**
(positions, facing, poses, expressions), so continuity is automatic; each scene starts again from its own `actors`.

## Places

Everywhere a beat or an actor needs a place (`at`, `to`, `from`, camera `on`), it takes one of:

| place | meaning |
|---|---|
| `"stump_front"` | an anchor of the scene's set ([sets.md](sets.md) lists them; `cinecode set-sheet` draws them) |
| `"x:1500"` | that x on the set's main lane (or on the slope of a ridge set) |
| `"x:1500,y:1060"` | an exact ground point in set coordinates (y grows downward; bigger y = nearer the camera) |
| `"near:fox"` | beside that actor, on the side the mover comes from |
| `"left-of:fox"`, `"right-of:fox"` | beside that actor on that side |
| `"behind:fox"`, `"front-of:fox"` | a little further from / nearer to the camera than that actor |
| `"on:pebble"` | riding that actor (only for `hop` and `place`; see [riding](#riding)) |
| `"left"`, `"right"` | off that side of the frame (only `enter` `from` and `exit` `to`) |

Ground places are moved to the nearest walkable spot that doesn't overlap a solid prop or another standing actor.
Moves follow the set's walkable ground around solid props and water (stepping stones become hops).

## Shots

```json
{ "id": "s01-02", "camera": { "size": "full", "on": ["pip"], "move": "track" },
  "beats": [ … ], "hold": 0.6 }
```

| field | meaning |
|---|---|
| `id` | required, unique in the film (`cinecode sheet` and `lint` refer to shots by id) |
| `camera` | see [camera](#camera) |
| `beats` | what happens, see [beats](#beats). A shot with no beats and no `dur` lasts only its hold (a warning). |
| `hold` | seconds added after the last beat ends (default 0.5) |
| `dur` | the shot's exact length in seconds; overrides beats + hold. Beats that run past it carry on into the next shot of the scene. |
| `time` | this shot's own time of day (a name or `{ "from", "to" }`, blended across the shot), e.g. a time-lapse |
| `grade`, `gradeTo` | this shot's story grade, and a grade to blend to across the shot (`"none"` = no story grade): `"grade": "memory", "gradeTo": "none"` |
| `music` | a music cue starting at the shot's first frame (same forms as the scene's `music`) |
| `fadeIn`, `fadeOut` | seconds of fade from / to black at the shot's start / end |
| `note` | free text for people; ignored |

Shot boundaries land on frames. A shot is at least one frame long.

## Camera

```json
"camera": { "size": "medium", "on": ["pip", "fox"], "move": "push-in", "angle": "low" }
```

| field | values | default |
|---|---|---|
| `size` | `establishing` (the whole view), `wide` (subject ≈ 18% of the frame height), `full` (whole body ≈ 60%), `medium` (waist up ≈ 75%), `close` (head and shoulders ≈ 70%), `extreme-close` (the face) | `wide` with subjects, else `establishing` |
| `on` | actor ids and/or anchor names: the union of their regions is framed | the actors the shot's beats name, else everyone on stage |
| `move` | `static`, `push-in`, `pull-out`, `pan`, `track`, `tilt-up`, `tilt-down`, `handheld` | `static` |
| `angle` | `eye`, `low` (subjects sit lower, under more sky), `high` (higher, over more ground) | `eye` |
| `zoom` | multiplier on the size's zoom (`0.8` = a little wider) | 1 |
| `offset` | `[x, y]`: frame fractions when both are ≤ 2 in size (`[0.16, 0]` moves the subject right of centre), else world pixels | none |
| `dof` | depth of field: `true`, `false` or a blur radius | on for `close` and `extreme-close`; elsewhere automatic as the set is enlarged |

Moves:

- `static` composes one framing for everything the subjects do in the shot (someone walking across stays whole in it).
- `push-in` eases from 1/1.3 of the size's zoom to the size; `pull-out` the reverse. On an establishing shot a push-in
  goes from the widest view to 1.3× it.
- `pan` needs two subjects, `"on": [from, to]`: it holds on the first for the first 12% of the shot, moves, and holds
  on the last for the last 12%.
- `track` follows the subjects at a constant zoom, smoothed, keeping them inside the frame; with fast runners it
  frames looser so the background never sweeps faster than about a frame width a second.
- `tilt-up` / `tilt-down` start 0.32 of a frame height below / above the framing and end on it.
- `handheld` adds a small seeded drift to the framing.

Moves are eased over the whole shot unless confined (below). Framing keeps lead room in the direction a single subject
faces, keeps headroom, keeps heads above the caption band, and is clamped to the set's view so the frame never shows
unpainted edges.

[§9](#9-extensions-at-a-glance) additions for `push-in` / `pull-out` and windowed moves:

| field | meaning |
|---|---|
| `to` | the move ends at this size's framing: `"size": "full", "move": "push-in", "to": "close"` |
| `toOn` | …of these subjects (default: `on`): a push-in from a two-shot to a close-up of one of them |
| `zoomTo` | the move ends at k × the starting zoom, about the subjects (ignored when `to` is given) |
| `moveAt`, `moveDur` | the move happens only between these seconds of the shot (eased); the camera holds before and after. Works with any move. |

## Beats

A beat is one object with exactly one of these keys:

| key | what it is | takes time |
|---|---|---|
| `say` | a spoken line | the voice's length |
| `do` | an action (walk, gesture, look, …) | depends on the action |
| `sfx` | a sound effect | 0 (or its `dur`) |
| `fx` | a visual effect (dust, splash, sparkle, rain, …) | 0 |
| `music` | a music cue or a sting | 0 |
| `title` | an in-picture title | its `dur` (default 3) |
| `mark` | a named instant | 0 |
| `wait` | a pause | its value |

Modifiers any beat may carry:

| field | meaning |
|---|---|
| `with` | `"prev"`: start together with the previous beat group (see below); or the `id` of an earlier beat of this shot: start with that beat |
| `after` | seconds of delay added to the start |
| `at` | pin the start to this many seconds from the shot's start (for `look`, `place`, `fx` and `sfx`, `at` may instead be a place) |
| `id` | a name for `with` to refer to |
| `touch`, `contact` | an actor id or list: this beat brings these actors into contact on purpose (lint then reports an overlap as a warning, not an error) |
| `note`, `comment` | free text; ignored |

## Timing rules

Beats run **in sequence**: each starts when the previous one ends. Precisely:

1. A beat with neither `with` nor `at` starts when the previous **group** ends. A group is a beat plus every beat
   started `"with": "prev"` after it; it ends when the last of them ends.
2. `"with": "prev"` starts at the start of the current group (its first beat), and makes the group last until the
   longer of the two ends. `"with": "<id>"` starts with that beat.
3. `"at": 2.0` starts the beat 2.0 s after the shot starts, wherever it is in the list. A pinned beat starts a new
   group: the beat after it follows **it**, not the beats before it.
4. `"after": 0.4` delays any of the above by 0.4 s.
5. The shot lasts until the latest beat ends plus `hold` (default 0.5 s), rounded to a frame, or exactly `dur` when
   given.

An example, with the times the compiler gives (the fox's `wave` lasts 1.6 s, the human's `nod` 0.9 s):

| beat | starts | ends |
|---|---|---|
| `{ "do": "gesture", "who": "fox", "name": "wave" }` | 0.0 | 1.6 |
| `{ "do": "look", "who": "pip", "to": "fox", "with": "prev", "after": 0.5 }` | 0.5 | 0.8 |
| `{ "do": "gesture", "who": "pip", "name": "nod" }` | 1.6 | 2.5 |
| `{ "wait": 1, "with": "prev" }` | 1.6 | 2.6 |
| `{ "sfx": "owl-hoot", "at": 0.2 }` | 0.2 | 0.2 |
| `{ "do": "turn", "who": "fox", "face": "around" }` | 0.2 | 0.45 |

The shot ends at 2.6 + 0.5 = 3.1 s (frame 74 at 24 fps). Note the last beat: it follows the pinned `sfx`, not the
wait.

Before the voices exist a line lasts an estimate of `words / 2.6 + 0.3` seconds; once they are generated, `plan`,
`sheet`, `lint` and the renders use the real lengths, so shots can change length after `cinecode voice`.
`cinecode plan` marks estimated lines with `~`.

## say

```json
{ "say": "pip", "text": "Then wake up! Race you to the pond!", "tone": "excited", "expr": "happy" }
```

| field | meaning |
|---|---|
| `say` | `"narrator"` or a cast id with a voice |
| `text` | required: the caption, and what is spoken unless `tts` is given |
| `tone` | the line's delivery, joined after the voice's `tone`: one to three adjectives ([sound.md](sound.md#tone)) |
| `expr` | the speaker's expression for the line (held until 0.4 s after it) |
| `vo` | `true`: a voice-over; the speaker may be off screen or not in the scene |
| `tts` | §9: what the voice actually says when it differs from the caption: `{ "text": "[laughs]", "tts": "Hahaha!" }` |
| `trimEnd` | §9: seconds cut off the end of the spoken audio (a line interrupted mid-word); timing and lip sync follow the cut |

A line whose `text` starts with `[` is **non-verbal** (`[laughs]`, `[gasps]`): captioned in italics, and voice QA
does not hold it to the words. The speaker's mouth follows the voice (lip sync from the audio's envelope); the
other actors on stage glance at the speaker; a speaker who hasn't been told where to look talks to the nearest actor
in front of them. A speaker in the scene who is not `vo` should be at least 60% on screen (lint
`offscreen-speaker`). Each line is voiced once and cached; changing its words, its tone or its voice makes it a new
line ([sound.md](sound.md#the-voice-cache)).

## do: actions

Every action except `custom` needs `who`, an actor present in the scene (in its `actors`, or brought in by an
earlier `enter`).

| action | fields | takes |
|---|---|---|
| `walk`, `run` | `to` (a place), `speed`, `gait`, `pose`, `face`, `wade`, `depth` | the route's length at the rig's pace |
| `hop` | `to` (a place or `on:<actor>`), `speed`, `pose`, `face` | as walk, hopping (rigs without a hop gait repeat their jump, or walk) |
| `fly` | `to`, `speed`, `pose`, `face`; only rigs that fly | flight time |
| `enter` | `from` (`left` / `right` or a place), `to` (a place; default about a quarter of the way into the frame), `run`, `speed`, `gait`, `pose` | as walk |
| `exit` | `to` (`left` / `right`, or a place), `run`, `speed`, `gait` | as walk |
| `place` | `to` (a place or `on:<actor>`), `face`, `pose` | 0: the actor is simply there, visible |
| `pose` | `pose`, `dur`, `expr` | `dur` (default 1) |
| `gesture` | `name` (a gesture of the rig) | the gesture's length |
| `look` | `to`: an actor, an anchor, a place, `left`, `right`, `up`, `sky`, `down`, `camera` or `none` | 0.3 |
| `turn` | `face`: `left`, `right` or `around` | 0.25 |
| `emote` | `expr` | 0 |
| `sit`, `stand`, `lie`, `sleep` | | 0.6 |
| `wake` | `pose` (default: the pose before sleeping, or `stand`) | 0.75 |
| `fade` | `to` (opacity 0..1), `dur` (default 1) | `dur` |
| `set` | `params` (rig param changes from now on), `pose` (instant), `expr` | 0 |
| `blink` | | 0.2 |
| `custom` | `name` (in `custom.mjs` `custom`), `dur` (default 1), any other fields | `dur` |

Details:

- **Moves.** `speed` multiplies the rig's natural pace (0–8, default 1). `gait` picks one of the rig's gaits (`trot`
  for the fox, `scurry` for the mouse, `glide` for birds). `run` falls back to `trot`, then `walk`, for rigs without
  a run. `pose` (or `face`) sets the pose (or facing) the actor ends in. Moves start and stop with a short ease;
  footsteps, hops, landings and splashes are added as sound effects automatically, matched to the ground surface.
  A move that doesn't fit in its shot simply continues into the next shot.
- **Getting up and down.** A walk to an elevated anchor (a stump top, a rock top, a branch) walks to the foot of it and
  jumps up; a move away from one jumps down first. A `hop`, `run` or `fly` by a rig that flies flies there instead.
- **enter / exit.** `enter` from a side starts just outside every view the shot may show and walks in; `enter` from a
  place appears there (out of a hollow) and walks on to `to`. `exit` to a side walks out of the frame and the actor
  is then off stage (it may `enter` again later). An exit to a place just walks there.
- **pose.** With `dur` the change takes that long (an old woman rising over 2 s); without, it blends over 0.35 s and
  the beat still takes 1 s. Pose names come from the rig ([cast.md](cast.md)); `sit`, `lie`, `sleep`, `rest`,
  `crouch`, `perch`, `stand` also accept the rig's nearest equivalent (`sit` → `sit-ground` for the human).
- **look.** The head turns toward the target (and the body turns round if the target is behind); `up` / `sky` / `down`
  tilt the head (§9; slow lookers like the tortoise take about 1 s). Use `to` for the target so `at` stays a time.
- **sleep / wake.** A sleeping actor shows "z z z" and doesn't glance at speakers; `wake` blinks and returns to the
  previous pose.
- **set.** Changes rig params from that moment, e.g. a tortoise coming out of the water: `{ "do": "set", "who":
  "pebble", "params": { "wet": 0.6 } }`.
- **custom.** Draws a custom beat from `custom.mjs` (see [effects.md](effects.md)). If `custom.mjs` has no such name the
  beat only takes time (a warning).

### Riding

§9: an actor can ride another (a squirrel on a tortoise's shell). Start mounted with a scene actor `{ "on":
"pebble" }`, or get on with `{ "do": "hop", "who": "fidget", "to": "on:pebble" }` (or `place` there). A rider moves
with its carrier, is drawn just in front of it, casts no shadow, and keeps its own facing, pose, gestures and lines. A
rider can't walk, run or exit; it gets off with an ordinary `hop` to a place. A carrier that exits takes its riders
with it. Riders can't carry riders.

### Wading

§9: `{ "do": "walk", "who": "pebble", "to": "x:1700", "wade": true }` lets a walk or run cross water in a straight
line. In the water the actor sinks as it goes deeper (0.6 px per px travelled into the water) down to `depth` rig
units (default 1.1 × the rig's height: fully under), is clipped at the waterline with a ripple ring, and rises again
on the far side. Riders sink with their carrier. If a solid prop is in the way, the dry route is taken instead.

## sfx

```json
{ "sfx": "owl-hoot", "gain": 0.8, "with": "prev", "after": 0.3 }
{ "sfx": "hum", "caption": "[hums]", "params": { "notes": "G4:1 E4:0.5 G4:0.5 A4:2", "tempo": 100, "voice": "child" } }
```

| field | meaning |
|---|---|
| `sfx` | a built-in effect name or alias, or a sound from `custom.mjs` `sounds` ([sound.md](sound.md#sound-effects)) |
| `gain` | level multiplier (≥ 0, default 1) |
| `pan` | −1..1; default: from where `on` / `who` / `at` is on screen |
| `on`, `who` | an actor or anchor the sound comes from (pans it; quieter when far off screen) |
| `params` | the generator's parameters (`size`, `weight`, `notes`, …) |
| `dur` | length for continuous effects; the beat then takes `dur` seconds |
| `seed` | a fixed seed (default: from the name, time and shot) |
| `caption` | a sound caption such as `"[croak]"`, shown for max(1.2 s, `dur`); burned in only with `captions: "all"` |

## fx

```json
{ "fx": "splash", "at": "pond_edge" }
{ "fx": "sparkle", "on": "pip", "size": 1.5, "color": "255,236,170" }
{ "fx": "rain", "dur": 6 }
```

| field | meaning |
|---|---|
| `fx` | `dust`, `splash`, `sparkle` (one-shots: 1.3, 1.2 and 1.6 s), or `leaves`, `rain`, `fireflies`, `motes`, `mist` (fields) |
| `on`, `who`, `at` | where: an actor or an anchor (or `x:…`) |
| `dur` | how long a field lasts (default: to the end of the scene); fields fade in and out over 1.2 s |
| `size` | size multiplier |
| `n` | density multiplier for fields |
| `dir` | direction of travel for `dust` (1 or −1) |
| `color` | `sparkle` colour as `"r,g,b"` |

An `fx` beat takes no time. For a whole scene, use the scene's `fx` or `overlays`.

## music

```json
{ "music": "tension", "intensity": 0.6 }
{ "music": { "mood": "triumph", "intensity": 0.8, "motif": 5, "motifVoice": "tutti", "downbeat": true } }
{ "music": "sting", "name": "surprise" }
{ "music": "none" }
```

A music beat starts a new cue at that moment (until the next cue or the end of the scene), plays a sting, or
silences the score. Forms:

- a mood name (`wonder`, `pastoral`, `tender`, `playful`, `tension`, `chase`, `sad`, `triumph`, `night`, `mystery`),
  with `intensity` (0..1, default 0.5) and the extras below as sibling fields;
- an object `{ "mood", "intensity", … }`;
- `"sting"` with `name` (or `sting`), or a sting name directly: `surprise`, `sad`, `triumph`, `magic`, `plunk`,
  `stab`, `swell`; or `{ "sting": "stab" }`;
- `"none"`: the score fades out over 0.3 s and stays silent.

§9 extras on a cue: `motif` (state the first n notes of the score's motif), `motifVoice` (`bassoon`, `flute`,
`cello`, `horn`, `celesta`, `violin`, `strings`, `music-box`, `tutti`), `hold` (`true`: the last stated note
sustains to the cue's end), `downbeat` (`true`: bar 1 lands exactly on the beat, cutting the previous cue), `tempo`
(20–300 bpm). See [sound.md](sound.md#music).

## title

```json
{ "title": "SEVENTY-SIX SUMMERS", "sub": "a film in code", "dur": 2.7, "place": "upper" }
```

Big italic lettering in the picture for `dur` seconds (default 3). `sub` (or `subtitle`) adds a smaller line.
`place`: `"auto"` (default: the calmest band of the picture, centred over the subjects), `top`, `upper`, `center`
(or `middle`), `lower`, `bottom`, or a fraction 0..1 of the frame height for the title line.

## mark

```json
{ "mark": "bloom", "with": "prev" }
```

§9: a named instant (takes no time). Mark names are unique in the film. A scene's `rim.start` may name a mark, and
custom drawing code reads them as `api.marks.bloom` (film time in seconds), so drawing can be keyed to a moment in the
dialogue whose time is only known once the voices exist.

## wait

```json
{ "wait": 1.5 }
```

A pause of that many seconds.

## Captions

Every spoken line gets a caption from its `text`, shown from the line's start until 0.25 s after it ends (at least
1 s, and never overlapping the next line). Long lines are split into chunks of at most two lines, timed by length.
Burned-in captions sit at the bottom, or at the top when that covers fewer heads (a speaker's head counts most);
narration is set in italics in a soft band. What is burned in depends on `format.captions`; the `.srt` and the MP4's
soft subtitles carry every caption.

## §9 extensions at a glance

These were added in DESIGN.md §9 and are documented in place above:

| where | field |
|---|---|
| say | [`tts`, `trimEnd`](#say); non-verbal lines `[laughs]` |
| beat | [`{ "mark": name }`](#mark) |
| hop / place, scene actors | [riding](#riding): `"to": "on:<actor>"`, `{ "on": "<actor>" }` |
| walk / run | [wading](#wading): `"wade": true`, `"depth"` |
| look | [`"to": "up" / "sky" / "down"`](#do-actions) |
| camera | [`to`, `toOn`, `zoomTo`, `moveAt`, `moveDur`](#camera) |
| shot | [`time`, `grade`, `gradeTo`](#shots) |
| scene | [`overlays`, `rim`](#scenes) |
| sfx | names checked against the built-in list and `custom.mjs` `sounds` |
| music | [stings `plunk`, `stab`, `swell`; `motif`, `motifVoice`, `hold`, `downbeat`, `tempo`](#music) |
| top level | [`score`](#score) |

## Checking a storyboard

```sh
node bin/cinecode.mjs check films/my-film
```

`check` loads `custom.mjs`, builds every set and validates the whole file, listing **every** problem with its path:

```
cinecode check: film.json has 2 problems:
  - scenes[0].shots[0].beats[1].who: "pip" is not in this scene yet (add it to the scene's actors, or bring it in with an "enter" beat first)
  - scenes[0].shots[1].camera.size: must be one of establishing, wide, full, medium, close, extreme-close (got "mid")
check failed after 0.2 s
```

Invalid JSON is reported with its line and column (`film.json: invalid JSON at line 4, column 2: Expected ',' or '}'
after property value`). Some things are only warnings and don't stop a render: an unknown field on a beat, an
expression a rig doesn't have on a `say`, a speaker not in the scene without `vo`, a missing custom beat. Neither
`check` nor `plan` prints warnings, and staging adds its own (a blocked route, a perch for a rig that can't perch, a
two-shot staged too far apart). The Claude Code skill's script prints both kinds:

```sh
node .claude/skills/cinecode/scripts/warnings.mjs films/my-film
```

```
check  scenes[0].shots[2].beats[0].speeed: unknown field "speeed" for a "look" beat; ignored
check  scenes[0].shots[5].beats[2].name: custom.mjs has no "glints" (have: no custom.mjs); the beat only takes time
```

Problems that only show once the film is staged (an actor standing in a tree, a speaker out of frame, a caption over
a face) are found by [`cinecode lint`](lint.md).
