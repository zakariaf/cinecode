# The storyboard: film.json

A film is a folder `films/<slug>/` with one storyboard file, `film.json`. It says who is in the film, where it takes
place, and what happens shot by shot. The engine works out everything else: where the actors walk, how the camera
frames them, how long each shot lasts, the captions, the sound effects and the music cues.

This page lists every field the engine reads. `cinecode check` validates the file against the same rules (the
validator is `engine/film/validate.mjs`; the compiler that turns it into a timed plan is `engine/film/compile.mjs`).

Contents: [top level](#top-level) · [format and titles](#format-and-titles) · [voices and cast](#voices-and-cast) ·
[sets](#sets) · [score](#score) · [scenes](#scenes) · [places](#places) · [shots](#shots) · [camera](#camera) ·
[framing part of a subject](#framing-part-of-a-subject) · [beats](#beats) · [timing rules](#timing-rules) ·
[say](#say) · [do](#do-actions) · [depth](#depth) · [sfx](#sfx) · [fx](#fx) · [music](#music) · [title](#title) ·
[mark](#mark) · [wait](#wait) · [captions](#captions) · [extensions](#extensions-at-a-glance) ·
[checking](#checking-a-storyboard)

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
(1.2 s). The first music cue starts under the opening card and the last one runs on under the end card (its final
chord dies about 3 s before the end unless the cue has `"hold": true`: see [music](#music)). The cards count in the
film's length (`plan`'s total includes them, and the first shot starts after the opening card).

How long a card is readable: the opening card fades in from black over 0.8 s, its title inks in from 0.5 s to 1.4 s
(the rule under it by 2.2 s, a subtitle by 2.7 s) and it dissolves into the first shot over its last 1 s, so the title
is at full strength for `dur − 2.4` s. The end card dissolves in over 1 s, its first line inks in from 0.4 s to 1.3 s
(a second line by 1.8 s) and it fades to black over its last 1.2 s: full strength for `dur − 2.5` s. A 2 s card never
reaches full strength; 3 s is the shortest that reads (a short film), 4 s is comfortable.

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
the kit (the built-in kits read `seed`, which changes the random details of the painting; `space` also reads
`milky`, `nebula` and `tint`). Two sets may use the same kit.

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
| `time` | time of day: `dawn`, `morning`, `noon`, `afternoon`, `golden`, `sunset`, `twilight`, `night`, or a change across the scene `{ "from": "golden", "to": "twilight" }` (the change happens over the middle 80% of the scene). A kit that is not under Earth's sky has times of its own instead (the `space` kit: `space`): only those are valid on it. A name the kit doesn't have is a check error (it is never lit like morning). Default: the kit's default time. |
| `grade` | a story grade on top of the time of day: `memory` (sepia storybook plate with a torn page edge), `dream` (soft, bloomed), `none` |
| `transition` | how the scene begins: `cut`, `fade` (0.35 s through black on each side), `dissolve` (0.8 s, but never more than 40% of the shot it opens or of the shot it leaves: a 1.2 s shot dissolves in over 0.48 s; there is no field to change it). Default: `dissolve` when the set or the time changes from the previous scene, else `cut`. In a dissolve the last scene shows through the new one's first shot, through anything drawn over it too: a scene that opens on a full-frame effect (the `eyepiece` beat's black field) wants `"transition": "cut"`. |
| `music` | the scene's music cue: a mood name, `"none"` (silence; the score fades out over 0.3 s), or `{ "mood", "intensity", "motif", "motifVoice", "hold", "downbeat", "tempo" }`. Leave it out to continue the previous scene's mood and intensity. See [music](#music). |
| `ambience` | `"auto"` (default: the set's day or night bed by the time of day), `"none"`, or an ambience name (`meadow-day`, `meadow-night`, `forest-day`, `forest-night`, `stream`, `village-day`, `village-night`, `wind-hill`) |
| `fx` | built-in effects for the whole scene: `["fireflies", "mist"]` (`leaves`, `rain`, `fireflies`, `motes`, `mist`) |
| `overlays` | drawings for the whole scene: built-in effect names as above, built-in overlays (`skydot`, `sunglow`: [effects.md](effects.md#built-in-effects)), or overlays from `custom.mjs`: `["comet", { "name": "far-hill", "params": { "frac": 0.04 } }]`. `{ "name", "params", "shots": ["2.1", "2.4"] }` draws only in those shots of the scene (a non-empty list of its shot ids; a built-in field covers each run of consecutive listed shots, and a `rain` fades only at the scene's start and end). See [effects.md](effects.md). |
| `rim` | a rim light on every visible actor, drawn after the grade: `{ "dir", "color", "strength", "start", "rise", "width" }`, see below |
| `actors` | who is in the scene at its start, see below |
| `shots` | required, at least one |

`rim`: `dir` is the side the light comes from (`left`, `right`, `top`, `upper-left` (default), `upper-right`),
`color` a CSS colour (default `#fff1d6`), `strength` 0..1 (default 0.8), `width` in screen pixels (default 3, at
least 2 is drawn), `start` a [mark](#mark) name or seconds from the scene start (default 0), `rise` seconds to ease in
(default 0).

**Scene actors.** Each entry is one of:

- `{ "at": <place>, "face": "left" | "right", "pose": <pose>, "expr": <expression>, "height": <units>, "z": <px> }`:
  on stage from the start. `at` is required. Without `face`, an actor faces the set's centre (or the way the anchor
  says). Without `pose` it stands (or perches, on a perch). `height` starts a flier [hovering](#hovering) that many
  units above `at` (no `pose` with it). `z` puts it off the stage ([depth](#depth)); without it, the anchor's `z`, if
  it has one.
- `{ "on": <actor>, "pose": <pose> }`: riding another actor of the scene from the start (default pose `sit`). The
  carrier must start on stage and not be a rider itself.
- `{ "offstage": "left" | "right" }`: not visible; brought in later with an [`enter`](#do-actions) beat.

There is no way to start an actor invisible: a stand-in faded out by a [`fade`](#do-actions) beat at the start of a
shot is still drawn in that shot's first frame, and the opening card dissolves into the first shot's first frame.

Anyone not listed can still come in with `enter`. **Actor state carries from shot to shot within a scene**
(positions, facing, poses, expressions), so continuity is automatic; each scene starts again from its own `actors`.

## Places

Everywhere a beat or an actor needs a place (`at`, `to`, `from`, camera `on`), it takes one of:

| place | meaning |
|---|---|
| `"stump_front"` | an anchor of the scene's set ([sets.md](sets.md) lists them; `cinecode set-sheet` draws them) |
| `"x:1500"` | that x on the set's main lane (or on the slope of a ridge set); give a `y` for anywhere else |
| `"x:1500,y:1060"` | an exact ground point in set coordinates (y grows downward; bigger y = nearer the camera). In a camera's `on`, `toOn` or `focus` it is the point itself, in the air too |
| `"near:fox"` | beside that actor, on the side the mover comes from, facing it. The gap allows for the mover's front (a flier arriving to hover: its beating wings), the other actor's longer end (head or tail, as it may turn to face the mover) and about a fifth of their two heights (two mice: about 10 world px between them) |
| `"left-of:fox"`, `"right-of:fox"` | beside that actor on that side, with the same gap |
| `"behind:fox"`, `"front-of:fox"` | a little further from / nearer to the camera than that actor |
| `"on:pebble"` | riding that actor (only for `hop` and `place`; see [riding](#riding)) |
| `"left"`, `"right"` | off that side of the frame (only `enter` `from` and `exit` `to`) |

Ground places are moved to the nearest walkable spot that doesn't overlap a solid prop or another standing actor.
Moves follow the set's walkable ground around solid props and water (stepping stones become hops). The one exception
is a place a flier [hovers](#hovering) over: it is taken exactly as written (over water, a stepping stone, anywhere
nobody could stand), only kept inside the set's area.

## Shots

```json
{ "id": "1.2", "camera": { "size": "full", "on": ["pip"], "move": "track" },
  "beats": [ … ], "hold": 0.6 }
```

| field | meaning |
|---|---|
| `id` | required, unique in the film (`cinecode sheet` and `lint` refer to shots by id). Any string works; the screenplay's `<scene>.<shot>` (`2.3`) keeps the two in step. |
| `camera` | see [camera](#camera) |
| `beats` | what happens, see [beats](#beats). A shot with no beats and no `dur` lasts only its hold (a warning). |
| `hold` | seconds added after the last beat ends (default 0.5) |
| `dur` | the shot's exact length in seconds; overrides beats + hold. Beats that run past it carry on into the next shot of the scene. |
| `time` | this shot's own time of day (a name or `{ "from", "to" }`, blended across the shot), e.g. a time-lapse |
| `grade`, `gradeTo` | this shot's story grade, and a grade to blend to across the shot (`"none"` = no story grade): `"grade": "memory", "gradeTo": "none"` |
| `music` | a music cue starting at the shot's first frame (same forms as the scene's `music`) |
| `fadeIn`, `fadeOut` | seconds of fade from / to black at the shot's start / end |
| `lint` | `"lint": { "allow": ["subject-size"], "note": "why" }`: the shot's [lint](lint.md#kept-warnings) warnings of those rules are intended. Lint lists them as kept, with the note and no fix tried. Errors can't be kept, and `check` rejects a malformed block. |
| `note` | free text for people; ignored |

Shot boundaries land on frames. A shot is at least one frame long.

## Camera

```json
"camera": { "size": "medium", "on": ["pip", "fox"], "move": "push-in", "angle": "low" }
```

| field | values | default |
|---|---|---|
| `size` | `establishing` (the whole view), `wide` (subject ≈ 18% of the frame height), `full` (whole body ≈ 60%), `medium` (waist up ≈ 75%), `close` (head and shoulders ≈ 70%), `extreme-close` (the face) | `wide` with subjects, else `establishing` |
| `on` | actor ids, anchor names and/or points of the set (`x:…` or `x:…,y:…`): the union of their regions is framed. `"x:1500"` is framed like a figure standing on the lane there (an anchor's box), `"x:1500,y:700"` as the point itself, in the air too, at the size things have on the lane below it. Points must lie inside the set | the actors the shot's beats name, else everyone on stage |
| `move` | `static`, `push-in`, `pull-out`, `pan`, `track`, `tilt-up`, `tilt-down`, `handheld` | `static` |
| `angle` | `eye`, `low` (subjects sit lower, under more sky), `high` (higher, over more ground) | `eye` |
| `zoom` | multiplier on the size's zoom: `0.8` a little wider, `1.3` tighter. With a subject that has a face the frame still keeps every such head in it and above the captions (it cuts the body, never the head). When no subject has a face (a planet, a prop) a zoom above 1 crops into the size's framing: [framing part of a subject](#framing-part-of-a-subject) | 1 |
| `focus` | `[fx, fy]` (a point of the subjects' box: `[0, 0]` its top left, `[1, 1]` its bottom right), `"head"` (their heads' mean) or a world point `"x:…,y:…"`: that point at the centre of the frame, at the size's zoom × `zoom`: [framing part of a subject](#framing-part-of-a-subject) | none |
| `offset` | `[x, y]`: frame fractions when both are ≤ 2 in size (`[0.16, 0]` moves the subject right of centre), else world pixels | none |
| `z`, `zTo` | the camera's depth at the shot's start and at its move's end, world px (positive: toward the stage, a dolly in; negative: pulled back), each under 3/4 of the set's lens (1728 on the built-in kits): [depth](#depth) | 0 |
| `dof` | depth of field: `true`, `false` or a blur radius. Everything behind the subjects is blurred; every subject in `on` and in `toOn` (anchors too) stays sharp for the whole shot. | on for `close` and `extreme-close`; elsewhere automatic as the set is enlarged |

Moves:

- `static` composes one framing for everything the subjects do in the shot: someone walking across stays whole in it.
  Its size comes from the pose a subject holds for most of the shot, so a pose change near one end of the shot is
  framed for the other pose: a subject that sits or lies down early (or stands up late) is too big while it is taller
  (a standing elder filled 86% of a `full` frame before sitting). Keep the taller pose for most of the shot (sit
  down late, stand up early), cut on the change, or loosen the shot (`"zoom": 0.8`).
- `push-in` eases from 1/1.3 of the size's zoom to the size; `pull-out` the reverse. On an establishing shot a push-in
  goes from the widest view to 1.3× it.
- `pan` needs two subjects, `"on": [from, to]`: it holds on the first for the first 12% of the shot, moves, and holds
  on the last for the last 12%.
- `track` follows the subjects at a constant zoom, smoothed, keeping them inside the frame; with fast runners it
  frames looser so the background never sweeps faster than about a frame width a second. A track on a crop or with a
  `focus` keeps its composition and offset (it doesn't pull the subjects back to the middle).
- `tilt-up` / `tilt-down` start 0.32 of a frame height below / above the framing and end on it.
- `handheld` adds a small seeded drift to the framing.

Moves are eased over the whole shot unless confined (below). Framing keeps lead room in the direction a single subject
faces (a subject without a face, a planet or a prop, faces nowhere and gets none: it is centred across the frame),
keeps headroom, keeps the heads of subjects with a face above the caption band, and is clamped to the set's view
so the frame never shows unpainted edges.

What gets framed is each subject's poses over the shot, not the peaks of its gestures and jumps. A `static` or
`handheld` `close` shot follows a gesture that holds the head in one place for 0.5 s or more and would take it out
of the frame (the mouse's `gasp` sits her up, a deer grazes): the frame eases out just before, holds the head with
its ears, and eases back after; the rest of the shot keeps its composition. A jump's apex, a quick nod, an
`extreme-close` shot and the other moves are not followed, so there a gesture that lifts the head can still leave the
frame: use the pose of the same name (`{ "do": "pose", "who": "tilly", "pose": "gasp", "dur": 0.3 }`), which is
framed, or a looser size. An anchor in `on` is framed as a box about the size of a standing hare (120 × 110 world px ×
the scale there), so a small actor framed with an anchor comes out small: staging warns when an actor in `on` gets
far under its own size because an anchor or a much bigger actor sets the framing ([checking](#checking-a-storyboard)).

[§9](#9-extensions-at-a-glance) additions for `push-in` / `pull-out` and windowed moves:

| field | meaning |
|---|---|
| `to` | the move ends at this size's framing: `"size": "full", "move": "push-in", "to": "close"` |
| `toOn` | …of these subjects (default: `on`): a push-in from a two-shot to a close-up of one of them |
| `zoomTo` | the move ends at k × the starting zoom, about the subjects (ignored when `to` is given) |
| `moveAt`, `moveDur` | the move happens only between these seconds of the shot (eased); the camera holds before and after. Works with any move. |

### Framing part of a subject

A shot size frames a region of each subject (the body, waist up, head and shoulders, the face) whole. To frame a part
of something (the edge of Saturn's rings, its cloud bands, a tree's crown) there are three ways, and none needs a
hidden stand-in:

- **A zoom on subjects with no face.** A rig with no face (only the `neutral` expression, like the `planet` and
  `telescope` rigs and prop rigs, or one that says `faceless: true`) has no head to keep above the captions. When every
  subject in the shot is one, a `zoom` above 1 crops into the size's framing about where it composes them, and the
  `offset` then moves the frame as given: `{ "size": "full", "on": ["saturn"], "zoom": 1.6, "offset": [-0.3, 0.1] }`
  frames the left part of Saturn with the rings. (With a subject that has a face, the zoom tightens but the frame
  keeps that head in and above the captions.)
- **A focus**, on any subject, faces included: `"focus": [0.95, 0.5]` puts the point 95% across and halfway down the
  subjects' box at the centre of the frame (moved by `offset` and a low or high `angle`), at the size's zoom of the
  whole subjects × `zoom`. `"head"` focuses their heads; `"x:1840,y:886"` a world point. Nothing else places a focused
  frame: no lead room, headroom or caption band, no following a held gesture, no clearing actors in front. A push-in
  zooms about the focus, a track holds it, and an establishing view centres on it.
- **A point as the subject**: `"on": ["x:1840,y:886"]` frames that point of the set at the shot size (a box the size of
  a standing hare at the lane's scale below it).

Lint takes a focused shot (and a `zoom` above 1 on faceless subjects, and a dolly) as a deliberate crop: it doesn't
warn that the subject is too big or gone off frame, nor that the crop leaves a sliver of the subject
([lint](lint.md#subject-size)). A hidden stand-in is still the way to
give the camera a subject that moves through the air ([effects.md](effects.md#props)).

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
6. A custom or sfx beat with `"hold": false` plays or draws its whole `dur` but ends, for the timeline, where it
   starts: the next beat, its `with` group and the shot's length don't wait for it (the rule `fx`, `mark` and `music`
   beats always follow). A long custom beat laid `"with": "prev"` over a line otherwise holds the next line back
   until it ends.

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
| `expr` | the speaker's expression from the line's start: a mood (`happy`, `sad`, `smug`, `worried`, …) is held until a beat changes it (listening doesn't reset it); a reaction (`surprised`, `laugh`, `laughing`, `scared`) lasts the line plus 0.4 s, or until the cut if that comes first, then gives way to the expression the actor had before |
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
| `walk`, `run` | `to` (a place), `speed`, `gait`, `pose`, `face`, `wade`, `depth`, `z` | the route's length at the rig's pace |
| `hop` | `to` (a place or `on:<actor>`), `speed`, `pose`, `face`, `z` | as walk, hopping (rigs without a hop gait repeat their jump, or walk) |
| `fly` | `to`, `speed`, `pose`, `face`, `height` ([hovering](#hovering)), `z`; only rigs that fly | flight time |
| `enter` | `from` (`left` / `right` or a place), `to` (a place; default about a quarter of the way into the frame), `run`, `speed`, `gait`, `pose`, `fly` (`true`: a flier flies in from above), `height`, `z` | as walk |
| `exit` | `to` (`left` / `right`, or a place), `run`, `speed`, `gait`, `z` | as walk |
| `place` | `to` (a place or `on:<actor>`), `face`, `pose`, `height`, `z` | 0: the actor is simply there, visible |
| `pose` | `pose`, `dur`, `expr` | `dur` (default 1) |
| `gesture` | `name` (a gesture of the rig) | the gesture's length |
| `look` | `to`: an actor, an anchor, a place, `left`, `right`, `up`, `sky`, `down`, `camera` or `none`; `tilt` (−1..1, the head's pitch) | 0.3 |
| `turn` | `face`: `left`, `right` or `around` | 0.25 |
| `emote` | `expr` | 0 |
| `sit`, `stand`, `lie`, `sleep` | | 0.6 |
| `wake` | `pose` (default: the pose before sleeping, or `stand`) | 0.75 |
| `fade` | `to` (opacity 0..1), `dur` (default 1) | `dur` |
| `set` | `params` (rig param changes from now on), `pose` (instant), `expr`; `z` with `dur`: a change of depth over that time | 0 (with a `z`: its `dur`) |
| `blink` | | 0.2 |
| `custom` | `name` (a built-in effect or one in `custom.mjs` `custom`), `dur` (default 1), `scope`, `hold`, any other fields | `dur` (`"hold": false`: 0) |

Details:

- **Moves.** `speed` multiplies the rig's natural pace (0–8, default 1). `gait` picks one of the rig's gaits (`trot`
  for the fox, `scurry` for the mouse, `glide` for birds). `run` falls back to `trot`, then `walk`, for rigs without
  a run. `pose` (or `face`) sets the pose (or facing) the actor ends in; without `pose` a move ends in `stand`
  (perched on a perch, sitting on a carrier), so a held pose such as `hold-hand-out` is dropped by any move. Moves
  start and stop with a short ease; footsteps, hops, landings and splashes are added as sound effects automatically,
  matched to the ground surface. A move that doesn't fit in its shot simply continues into the next shot; a `pose`,
  `sit`, `lie` or `sleep` that starts while the actor is still moving is replaced by the move's end pose, so start it
  after the move ends (the skill's `timeline.mjs` prints when each move ends and marks the clash). A route across
  stepping stones jumps from stone to stone, 0.7–1.5 s a stone (the small rigs the longest) whatever the `speed`.
- **Getting up and down.** A walk to an elevated anchor (a stump top, a rock top, a branch, a hollow) walks to the foot
  of it and jumps up; a move away from one jumps down first. A `hop`, `run` or `fly` by a rig that flies flies there
  instead.
- **Fliers.** Without `height` a flight ends where the flier stands: a ground point (`fly` to `x:…,y:…` or `near:`
  lands on the ground there), a surface, a perch, or a rider's place (`"to": "on:<actor>"`). With `height` it ends in
  the air ([hovering](#hovering)). `enter` flies in from above when `to` is a perch, a surface, a hollow or
  `on:<actor>`, or with `"fly": true`; to a ground place without it, the flier comes along the ground route in its
  `gait` (`"gait": "fly"` flaps in at wing height).
- **enter / exit.** `enter` from a side starts just outside every view the shot may show and walks in, straight to
  `to`: it never runs past it and comes back (a `to` nearer the entry side than the frame edge is reached directly).
  In an establishing shot, or a push-in from one, that view is most of the set, so the actor arrives only at the end
  of a long walk: start it as a scene actor just inside the frame and `run` instead. `enter` from a place appears
  there (out of a hollow) and walks on to `to`. `exit` to a side walks out of the frame and the actor is then off
  stage (it may `enter` again later). An exit to a place just walks there.
- **pose.** With `dur` the change takes that long (an old woman rising over 2 s); without, it blends over 0.35 s and
  the beat still takes 1 s. Pose names come from the rig ([cast.md](cast.md)); `sit`, `lie`, `sleep`, `rest`,
  `crouch`, `perch`, `stand` also accept the rig's nearest equivalent (`sit` → `sit-ground` for the human).
- **gesture.** Gestures layer in the order they start: one that starts while another is still running takes over
  from the pose at that moment, and the first one ending underneath changes nothing. Gestures that don't start or end
  on the actor's pose are eased in and out over 0.15–0.3 s. A gesture beat passes only its `name` (a `to` is ignored:
  the human's `point` follows her look, `point-up` and `point-down` aim outright). Over a walk or run the gait keeps
  everything that moves the feet, so head gestures (`nod`) and the human's arm gestures (`wave`) show, but one made
  with the legs barely shows until the move ends: a `jump` stays on the ground, and a `stamp` or the fox's raised-paw
  `wave` and `point` hardly move. Put those after the move.
- **Expressions** (`expr` on a line, `pose` or `set`, and `emote`). An expression holds until a beat changes it,
  except a line's reaction (see [say](#say)). It changes behind a quick blink (about 4 frames) while the mouth eases
  between the two faces; one set within 0.1 s of a shot's start changes on the cut frame itself. A gesture that
  switches the face (the human's `laugh`, `gasp`, `wave`, `beckon`, `clap` and `jump-for-joy`; an animal's `laugh`,
  which shuts its eyes) does it behind the same blink, and changes whose blinks would overlap share one.
- **look.** The head turns toward the target (and the body turns round if the target is behind) and holds there until
  another beat changes it, easing from wherever the head is (slow lookers like the tortoise take about 1 s). The head
  also pitches (§9): `up` is a full look up, `down` a full look down, `sky` a moderate look up (about 16°, where a comet
  or stars low over the land are); a look at an actor, an anchor or a point pitches along the line from the head to it
  (at most 0.9 of the full tilt). `"tilt"` (−1..1, any target; + up, − down) sets the pitch outright: `{ "do": "look",
  "who": "nell", "to": "sky", "tilt": 0.6 }`. The deer's long neck stays up: its head barely drops even at −1. The
  beetle, butterfly and songbird don't tilt; on a small rig in a wide or full shot the tilt is a few pixels, so a pose
  reads better there (the mouse's `alert`, the human's `look-up`). Use `to` for the target so `at` stays a time.
- **Listening.** When someone speaks, the others on stage glance at the speaker (turning round, body and all, if the
  speaker is behind them). An actor with a look of its own goes back to it after the line; one never told where to
  look keeps looking at the speaker. So a look that must be seen (at a prize, at the sky) goes before or after someone
  else's line, not under it.
- **sleep / wake.** A sleeping actor shows "z z z" and doesn't glance at speakers; `wake` blinks and returns to the
  previous pose.
- **set.** Changes rig params from that moment, e.g. a tortoise coming out of the water: `{ "do": "set", "who":
  "pebble", "params": { "wet": 0.6 } }`.
- **custom.** Draws a custom beat: a built-in effect ([effects.md](effects.md#built-in-effects)) or one from the
  film's `custom.mjs` or effect files. If there is no such name the beat only takes time (a warning). The beat lasts
  its whole `dur`: on into the later shots of its scene and, from the scene's last shot, into the fading picture of a
  dissolve to the next scene. `"scope": "shot"` ends it at its shot's cut: it is drawn only in its own shot, until
  its end (not in a dissolve's fading picture either), and its sounds from the cut on are dropped (`u` still runs over
  the full `dur`, so it just stops partway). `"scope": "scene"` keeps the default and says so. Without a scope, a
  beat still drawn on the first frame of a later shot, or one that ends partway through the dissolve out of its scene
  (it vanishes from the fading picture), is a warning naming the shots and the frames. `"hold": false` lets the beat
  play its whole `dur` without holding the next beat ([timing rules](#timing-rules)).

### Riding

§9: an actor can ride another (a squirrel on a tortoise's shell). Start mounted with a scene actor `{ "on":
"pebble" }`, or get on with `{ "do": "hop", "who": "fidget", "to": "on:pebble" }` (or `place` there). A rider moves
with its carrier, is drawn just in front of it, casts no shadow, and keeps its own facing, pose, gestures and lines. A
rider can't walk, run or exit; it gets off with an ordinary `hop` to a place. A carrier that exits takes its riders
with it. Riders can't carry riders.

### Wading

§9: `{ "do": "walk", "who": "pebble", "to": "x:1700", "wade": true }` lets a walk or run cross water in a straight
line. In the water the actor sinks as it goes deeper (0.6 px per px travelled into the water) down to `depth` rig
units (default 1.1 × the rig's height: fully under), and rises again on the far side. Riders sink with their carrier.
If a solid prop is in the way, the dry route is taken instead.

The body is not cut flat at the waterline: wherever it breaks the surface (the trunk, each leg, a tail) it curves
down into the water along its own near arc, with a dark meniscus lip, a shivering highlight, a darker band just under
the surface and flecks of foam, and rings spread round the whole body. Below the surface it shows faintly through the
water. A body fully under shows only faint rings, with nothing dry below the surface.

### Hovering

A flier (a rig with a fly gait: `butterfly`, `songbird`, `owl`; not the `beetle`) can stay in the air. Give a `fly`,
`enter` or `place` beat `"height": N` and the flight ends N units above its place, at the set's scale (the units of
rig heights: a songbird is 24 tall, an owl 62); above the anchor point for a perch or surface anchor. The flier holds
there, keeps flapping with a gentle bob (about 4% of its height), and can talk and gesture:

```json
{ "do": "enter", "who": "wren", "from": "right", "to": "x:1250,y:1080", "height": 60 }
{ "do": "fly", "who": "wren", "to": "near:tilly", "height": 40 }
```

- The place is taken exactly as written (over water, a stepping stone, anywhere nobody could stand), only kept inside
  the set's area. `near:` leaves room for the beating wings.
- An `enter` that ends in a hover comes in level at that height (from above with `"fly": true`).
- A scene can open on a hovering flier: a scene actor's `"height"` next to its `"at"`.
- A hovering flier's next move is always a flight: a `walk` or `fly` without `height` flies down and lands, a `hop` to
  `on:<actor>` takes off from the hover height.
- The camera frames it where it is drawn, allowing for the full reach of its beating wings and its bob: full shots
  keep the wings in frame, close shots hold its head.

`check` reports as errors: `height` on a rig that can't fly, on a beat other than `fly`, `enter` or `place`, 0 or
less, with an `on:` target, or on a scene actor without `at`; a `pose` given with `height`; and `sit`, `lie`, `sleep`,
`pose` (or a `set` with a `pose`) while the actor hovers. Land it first: a `fly` or `walk` to a place without
`height`.

### Depth

Things can be in front of and behind each other, not only up and down the ground: a moon behind a planet, debris the
camera flies through. `z` is world px off the **stage**, the plane the set stages on (its ground, props and anchors):
positive is farther from the lens, negative nearer. A thing at depth z is drawn at p = (lens − c) / (lens + z − c) of
its size about the frame centre, c being the camera's depth; the lens is the kit's (2304 world px on the built-in
kits), so a camera at depth 0 sees z 2400 at about half size and z −900 at about 1.6×.

- **Actors.** A scene actor's `"z"` (or its starting anchor's `z`). A beat that takes an actor somewhere (`place`,
  `walk`, `run`, `hop`, `fly`, `enter`, `exit`) takes it to its own `"z"`, else to the depth of where it goes: a named
  anchor's `z` (0 when the anchor has none), the carrier's for `on:<actor>`, the other actor's for `near:`,
  `left-of:`, `right-of:`, `behind:`, `front-of:` or an actor's name. A point (`x:…`), a side, or a beat with no place
  keeps the depth. The change is eased over the beat; a `set` with a `z` takes its `dur`. An `enter` takes its depth at
  once (from a side it was off screen; from a place it appears at that place's depth, then eases to its
  destination's), and an exit or entrance at a side starts or ends fully off screen at the actor's depth. A rider has
  its carrier's depth (hopping on eases to it by the landing). A `"z"` on another action is ignored with a warning,
  and one on a riding scene actor too.
- **Draw order.** Depth first, then ground y: whatever is off the stage is drawn behind (z > 0) or in front of (z < 0)
  everything on it, whatever its ground y. A painted layer with parallax k sits at z = lens × (1/k − 1) and hides what
  is beyond it (a front layer what is behind it); the stage's own ground layer reaches back to the nearest backdrop, so
  things between them still show over the ground.
- **Stand on the stage.** Off the stage a figure is drawn away from the painted spot under it (it slides over the
  ground as the camera moves) and throws no ground shadow, so figures that stand stay at z 0 on a set that paints its
  stage: compile warns about one standing on the ground, a perch or a hollow at another depth (the skill's
  `warnings.mjs` prints it). Depth is for fliers, effect pieces and sets with no painted ground (`space`).
- **The camera.** `"z"` (its depth at the shot's start) and `"zTo"` (at the move's end) move it through depth, eased
  over the move's window (`moveAt` / `moveDur`, else the whole shot), with any move: the near things grow faster than
  the far, and the sky stays put. A `push-in` or `pull-out` `to` a size composes its end as seen from `zTo`: the
  subjects frame as asked and only what lies at other depths changes (a dolly-zoom when the depth goes against the
  zoom). Every other move travels along the camera's axis (the frame's centre is where it flies toward), so what it
  frames grows out from the centre: a move in is composed with the subjects near enough the centre that they are still
  in frame at its end (a planet framed `wide` starts a little higher than a still `wide` puts it, and ends a little
  lower; one that ends bigger than the frame is flown at dead centre). Both must stay under 3/4 of the set's lens.
- **Passing the lens.** An actor or an effect piece the camera comes up to is drawn whole until it is 0.04 × the lens
  from it (25× its size on the stage), then fades out by 0.01 × it (or as it passes it): whatever is off the camera's
  axis has grown out of the frame by then, so only what the lens truly meets fades, briefly, filling the frame. Don't
  `fade` a body out by hand as the camera passes it (it would turn see-through mid-frame): the pass takes it out. A
  painted layer (the whole frame) fades out from 0.25 × the lens to 0.1 × it.
- **Flying past something.** A thing grows as it nears the lens and slides out from the frame's centre (the camera's
  axis: its `cx`, `cy`); it leaves the frame when its offset from the axis × its depth's scale reaches half the frame,
  so it is then about its own width × (half the frame width) / its offset across. To have a moon swing past big, stage
  it near the axis: Titan (11 world px across at cast scale 0.11) 180 px off the axis leaves at about 60 px, a dot;
  20 px off it leaves at half the frame height. Give it a depth in front of the stage (`"z": -1400`) that the dolly
  passes (`zTo` beyond `z + lens`: there the camera is level with it).
- **The near field.** A kit may have one (`space` does, its `dust` param): specks of dust and stars at every depth,
  out to 1.5 × the lens, so a camera moving through depth reads as flight: they stream out from the frame's centre,
  the nearer the faster and bigger, streaking with the move, while the painted sky stays put. They show only while
  the camera moves through depth, faded in and out with its speed (whole from about 0.06 × the lens a second): a still
  shot, a pan, a zoom with no `z` / `zTo`, and the hold before or after a windowed move show none, so no speck sits on a
  planet like a star and nothing pops at a cut. A shot's field is laid out for its first camera (a flight at any zoom
  starts with the same amount of it).
- **Framing** a subject off the stage is exact when the subjects share one depth (several depths are iterated).
- **Effects** draw at depth on the overlay layer `depth` ([effects.md](effects.md#depth)).

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
| `dur` | length for continuous effects; the beat then takes `dur` seconds. Put the length in `params` instead (`"params": { "dur": 30 }`) and the beat takes no time while the sound plays on, across cuts: a bed of rain or wind under a whole scene |
| `seed` | a fixed seed (default: from the name, time and shot) |
| `hold` | `false`: a beat `dur` plays but takes no time (the next beat and the shot don't wait); default `true` |
| `caption` | a sound caption such as `"[croak]"`, shown for max(1.2 s, `dur`) but counted as heard only for `dur` (give a long sound a `dur` if its caption should cross a cut; see [captions](#captions)); burned in only with `captions: "all"` |

## fx

```json
{ "fx": "splash", "at": "pond_edge" }
{ "fx": "sparkle", "on": "pip", "size": 1.5, "color": "255,236,170" }
{ "fx": "rain", "dur": 6 }
```

| field | meaning |
|---|---|
| `fx` | `dust`, `splash`, `sparkle` (one-shots: 1.3, 1.2 and 1.6 s), or `leaves`, `rain`, `fireflies`, `motes`, `mist` (fields). `dust` takes its colour from the set's painted ground where it rises, in the scene's light (below). |
| `on`, `who`, `at` | where: an actor or an anchor (or `x:…`) |
| `dur` | how long a field lasts (default: to the end of the scene); fields fade in and out over 1.2 s |
| `size` | size multiplier (one-shots): it scales a sparkle's spread and stars, but a sparkle is always 14 stars, so for a single glint on a small prop write a custom beat |
| `n` | density multiplier for fields |
| `dir` | direction of travel for `dust` (1 or −1) |
| `color` | `sparkle` colour as `"r,g,b"` |

An `fx` beat takes no time. For a whole scene, use the scene's `fx` or `overlays`.

Dust (an `fx` beat, and the dust a run or a landing on dirt kicks up by itself) takes its colour once, as it is kicked
up, from the set's painted ground on the contact's own surface (the path, not the grass or water beside it) in the
scene's light, and keeps it for its 1.3 s. Actors, shadows and props over the spot never tint it. By day it is a
little lighter and greyer than the ground, on grass a pale green-grey, by night a dim haze in the night's light.

Fields (`fireflies`, `leaves`, `motes`, `mist`, `rain`) fill the whole frame: `at`, `on` and `size` don't place or
scale them (only `mist` takes its height from `at`). Their density is per world area, so how many you see depends on
the shot: `fireflies` puts 3–6 × `n` in every 420 × 420 world px (from 220 px above the horizon down), each lit about
half the time. An establishing shot shows dozens; a shot of a mouse, a few hundred world px across, shows a few or none
even at `n: 6`. For a swarm around small characters, raise `n` a lot or draw your own overlay
([effects.md](effects.md)).

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
(20–300 bpm). See [sound.md](sound.md#music). Two habits: give a mood change that starts on a cut `"downbeat": true`
(without it the new cue can open with a second or more of near-silence), and give the film's last cue `"hold": true`
if the end card is short (its final chord lands about 3 s before the end and dies).

## title

```json
{ "title": "SEVENTY-SIX SUMMERS", "sub": "a film in code", "dur": 2.7, "place": "upper" }
```

Big italic lettering in the picture for `dur` seconds (default 3). `sub` (or `subtitle`) adds a smaller line; a `\n`
in it starts another line under it (a credit, say).
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
Narration is set in italics in a soft band. What is burned in depends on `format.captions`; the `.srt` and the MP4's
soft subtitles carry every caption.

Burned-in captions are always centred; only their band changes, the bottom or the top of the frame:

- **One band per chunk.** A chunk keeps its band for its whole time on screen, so it never jumps mid-line. It goes at
  the bottom unless the top covers less of the heads in the picture over the whole chunk; the caption's own speaker
  counts three times anyone else (for a sound caption every head counts the same).
- **One caption per band.** A newer caption replaces the one up there (which fades out in 0.08 s); captions are never
  stacked.
- **Lines come first.** A line's caption is placed by the picture alone. A sound caption never takes a line's caption
  off the screen while the line is being spoken or before it has been up 0.6 s: it goes to the other band when its own
  is taken while it would be up (by a line being spoken, or by a caption up less than 0.6 s), or when a line would take
  its band before it has been up 0.6 s; when both bands are taken it waits for one. So a sound during a line shows at
  the same time as the line, in the other band.
- **Cuts and fades.** A caption carries over a cut only while its line is still being spoken (a sound caption: for its
  sfx beat's `dur`), or until it has been up 0.6 s; otherwise it ends exactly at the cut. At a scene dissolve or fade,
  or at a shot's `fadeIn` or `fadeOut`, a caption that ends there fades out over 0.15 s by the boundary instead.

## Extensions at a glance

These were added in DESIGN.md §9 (round 2) and §10–11 (round 6) and are documented in place above:

| where | field |
|---|---|
| say | [`tts`, `trimEnd`](#say); non-verbal lines `[laughs]` |
| beat | [`{ "mark": name }`](#mark) |
| hop / place, scene actors | [riding](#riding): `"to": "on:<actor>"`, `{ "on": "<actor>" }` |
| walk / run | [wading](#wading): `"wade": true`, `"depth"` |
| fly / enter / place, scene actors | [hovering](#hovering): `"height"`; enter `"fly": true` |
| look | [`"to": "up" / "sky" / "down"`, `"tilt"`](#do-actions) |
| camera | [`to`, `toOn`, `zoomTo`, `moveAt`, `moveDur`](#camera) |
| shot | [`time`, `grade`, `gradeTo`](#shots) |
| scene | [`overlays`, `rim`](#scenes) |
| sfx | names checked against the built-in list and `custom.mjs` `sounds` |
| music | [stings `plunk`, `stab`, `swell`; `motif`, `motifVoice`, `hold`, `downbeat`, `tempo`](#music) |
| top level | [`score`](#score) |
| camera | [`focus`; `zoom` cropping subjects with no face; points in `on` / `toOn`](#framing-part-of-a-subject); [`z`, `zTo`](#depth) |
| scene actors, moves, place, set | [`z`](#depth) |
| custom beat | [`scope`, `hold`](#do-actions) |
| sfx | [`hold`](#sfx) |
| scene | [`overlays` `shots`](#scenes); `time` names a kit declares (`space`) |
| shot | [`lint`](#shots) |

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
expression a rig doesn't have on a `say`, a speaker not in the scene without `vo`, a missing custom beat, a `z` on an
action that can't change depth, and a film's rig, kit or effect named like a built-in one (it replaces it; `check`
also marks the file in its list: "replaces the built-in …"). Neither `check` nor `plan` prints warnings, and staging
adds its own: a blocked route, a perch for a rig that can't perch, a two-shot staged too far apart, an actor in `on`
shown far under the size it would get alone because something else in `on` sets the framing (under 45% of it when an
anchor does, under a sixth when a much bigger actor does; not in `wide` shots), a custom beat without a `scope`
drawn on into a later shot or ending partway through a dissolve, and an actor standing off the stage on a painted set.
The Claude Code skill's script prints both kinds:

```sh
node .claude/skills/cinecode/scripts/warnings.mjs films/my-film
```

```
check  scenes[0].shots[2].beats[0].speeed: unknown field "speeed" for a "look" beat; ignored
check  scenes[0].shots[5].beats[2].name: custom.mjs has no "glints" (have: no custom.mjs); the beat only takes time
plan   3.3: the medium shot of pebble, frog shows frog at 11% of the size it would get alone; pebble sets the framing (give frog a shot without pebble, or leave frog out of "on" if the shot is about pebble)
```

"no warnings" says little about framing. Problems that only show once the film is staged (an actor standing in a
tree, a speaker out of frame, a subject too small, a head cut by the frame edge, the moon behind a head, a caption over
a face) are found by [`cinecode lint`](lint.md), and the rest only by looking at the contact sheets.
