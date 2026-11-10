# Storyboard quick reference

The full field reference is `docs/storyboard.md`; the contract is `DESIGN.md` §4 (base), §9.1 (round 2) and §10–11 (round 6); the validator `engine/film/validate.mjs` is the final word. This page is the short version, with the names that are valid today (read from the engine).

## A minimal valid film.json

Checked with `check` and `plan` (21 s, 3 shots). Start from `cinecode new <slug>` and grow it.

```json
{
  "title": "The Acorn",
  "logline": "A tortoise wants the last acorn of autumn; a squirrel wants it faster.",
  "format": { "width": 1920, "height": 1080, "fps": 24, "captions": "dialogue" },
  "titles": { "open": { "title": "The Acorn", "dur": 4 }, "end": { "lines": ["The End"], "dur": 4 } },
  "voices": {
    "narrator": { "voice": "Sulafat", "tone": "warm, unhurried" },
    "tess": { "voice": "Algenib", "tone": "old, dry" },
    "nib": { "voice": "Puck", "tone": "quick, cheeky" }
  },
  "cast": {
    "tess": { "rig": "tortoise", "name": "Tess", "voice": "tess", "scale": 1.2, "params": { "moss": "#6e8b3d" } },
    "nib": { "rig": "squirrel", "name": "Nib", "voice": "nib", "params": { "coat": "#c8562a" } }
  },
  "sets": { "meadow": { "kit": "meadow" } },
  "scenes": [{
    "id": "s01", "set": "meadow", "time": "morning", "ambience": "auto",
    "music": { "mood": "pastoral", "intensity": 0.35 },
    "actors": {
      "tess": { "at": "x:1250,y:1060", "face": "right" },
      "nib": { "at": "stump_top", "face": "left", "pose": "sit" }
    },
    "shots": [
      { "id": "1.1", "camera": { "size": "establishing", "move": "push-in" },
        "beats": [{ "say": "narrator", "text": "In the meadow, one acorn was left.", "tone": "softly" }], "hold": 0.6 },
      { "id": "1.2", "camera": { "size": "full", "on": ["tess"], "move": "track" },
        "beats": [
          { "do": "walk", "who": "tess", "to": "x:1400,y:1060" },
          { "say": "tess", "text": "Mine, I think.", "tone": "slow", "with": "prev", "after": 1.0 }
        ], "hold": 0.5 },
      { "id": "1.3", "camera": { "size": "full", "on": ["nib"] },
        "beats": [
          { "do": "look", "who": "nib", "to": "tess" },
          { "say": "nib", "text": "Not at that speed!", "tone": "delighted", "expr": "smug" },
          { "do": "gesture", "who": "nib", "name": "laugh", "with": "prev" }
        ], "hold": 0.4 }
    ]
  }]
}
```

## A space scene

A night on the hill, then a cut into the eyepiece and out among Saturn's rings (21 s, 5 shots; `check`, `warnings.mjs` and `lint` are clean). It uses the `telescope` and `planet` rigs, the `space` kit and its own time, the built-in effects `skydot`, `eyepiece` and `debris`, a moon off the stage (`z`), a dolly (`zTo`), a crop (`focus` with `zoom`), and custom beats ended at their cut (`scope`) or laid under the lines (`hold`). Lint's `subject-size` judges the dolly and the crop as whole-subject shots, so those warnings are kept on purpose (`lint`).

```json
{
  "title": "The Ringed One",
  "titles": { "open": { "title": "The Ringed One", "dur": 3 }, "end": { "lines": ["The End"], "dur": 3 } },
  "voices": { "narrator": { "voice": "Charon", "tone": "calm" }, "nell": { "voice": "Leda", "tone": "small, bright" } },
  "cast": {
    "nell": { "rig": "human", "name": "Nell", "voice": "nell", "params": { "age": "child", "hairStyle": "curly" } },
    "scope": { "rig": "telescope", "name": "Telescope" },
    "saturn": { "rig": "planet", "name": "Saturn", "scale": 2.5, "params": { "body": "saturn" } },
    "titan": { "rig": "planet", "name": "Titan", "scale": 0.6, "params": { "body": "titan" } }
  },
  "sets": { "hill": { "kit": "hill" }, "space": { "kit": "space" } },
  "scenes": [
    { "id": "s01", "set": "hill", "time": "night", "music": { "mood": "night", "intensity": 0.3 },
      "overlays": [{ "name": "skydot", "params": { "x": 1640, "y": 480, "size": 4 } }],
      "actors": { "scope": { "at": "x:2080", "face": "left" }, "nell": { "at": "x:2146", "face": "left" } },
      "shots": [
        { "id": "1.1", "camera": { "size": "full", "on": ["nell", "scope"], "offset": [0.2, 0] },
          "beats": [{ "say": "nell", "text": "Is that a star?", "tone": "curious" }] }
      ] },
    { "id": "s02", "set": "space", "time": "space", "ambience": "none", "transition": "cut",
      "actors": { "saturn": { "at": "centre", "face": "right" }, "titan": { "at": "east", "face": "right", "z": 1500 } },
      "shots": [
        { "id": "2.1", "dur": 3, "camera": { "size": "full", "on": ["saturn"] },
          "beats": [{ "do": "custom", "name": "eyepiece", "at": 0, "dur": 3, "scope": "shot" }] },
        { "id": "2.2", "camera": { "size": "wide", "on": ["saturn"], "zTo": 1200, "moveAt": 0.5, "moveDur": 3 },
          "lint": { "allow": ["subject-size"], "note": "the dolly brings Saturn past a wide shot's size on purpose" },
          "beats": [{ "say": "narrator", "text": "No. That is Saturn." }, { "wait": 2 }] },
        { "id": "2.3", "camera": { "size": "full", "on": ["saturn"], "focus": [0.95, 0.5], "zoom": 2 },
          "lint": { "allow": ["subject-size"], "note": "a crop into the edge of the rings" },
          "beats": [{ "do": "custom", "name": "debris", "dur": 5, "hold": false, "scope": "shot" },
                    { "say": "narrator", "text": "Its rings are ice and rock." }] },
        { "id": "2.4", "camera": { "size": "wide", "on": ["saturn", "titan"] },
          "beats": [{ "say": "narrator", "text": "And far behind it, Titan." }] }
      ] }
  ]
}
```

- `"transition": "cut"`: going into another set dissolves by default, and the hill would show through the eyepiece's black.
- The child stands 66 × s behind the telescope, facing the same way, so her eye meets the eyepiece.
- `"z": 1500` puts Titan behind the stage at 0.6 of its size there (p = 2304 / (2304 + z)), drawn behind Saturn; the dolly (`zTo`) grows Saturn more than Titan.

## Structure

- **film**: `title`, `logline`, `format` (`captions`: dialogue = characters' lines burned in | all = also narration and sfx that carry a `caption` | none), `titles` (`open`: title, subtitle, dur; `end`: lines, dur; both count in `plan`'s total. 3 s is the shortest card that reads: the title is fully inked 1.4 s in (a subtitle 2.7 s) and dissolves over the last 1 s; the end card's first line is full from 1.3 s and fades to black over the last 1.2 s), `voices`, `cast`, `sets`, `scenes`, optional `score` (`{ "key": "C", "motif": "G4:1 E4:0.5 G4:0.5 A4:2 C5:3" }`: the film's melodic motif, stated by music cues with `motif`), `seed` (the score's seed).
- **cast entry**: `rig`, `name`, `voice` (a key of `voices`; omit for a silent character), `scale` (multiplies the set's perspective scale), `params` (rig look).
- **scene**: `id`, `set`, `time` (one the kit has: Earth's eight, or the kit's own such as `space`; or `{ "from": "golden", "to": "twilight" }`), `transition` (cut | fade | dissolve: 0.8 s, at most 40% of the shots either side; default dissolve when the set or time changes, else cut), `music`, `ambience` (auto | a name | none), `actors`, `overlays` (names, or `{ "name", "params", "shots": [ids] }` to draw only in those shots of the scene), `rim`, `shots`.
- **scene actor**: `at` (target), `face` (left | right), `pose`, `expr`, `height` (a flier starts hovering that high above `at`), `z` (its depth off the stage, world px: + farther, − nearer), `on` (start riding another actor), `offstage` (left | right: not in the scene until an `enter`). There is no hidden start: a stand-in faded by a `fade` beat is still drawn in a shot's first frame (and in the opening card's dissolve into shot 1.1).
- **shot**: `id` (`<scene>.<shot>` like the screenplay: `2.3`), `camera`, `beats`, `hold` (seconds after the last beat, default 0.5) or `dur` (fixed length), `fadeIn` / `fadeOut`, `time` / `grade` / `gradeTo` (override the scene's light), `music` (a cue at the shot start), `lint` (`{ "allow": ["subject-size"], "note": "why" }`: its warnings of those rules are kept on purpose), `note`.
- **Every object accepts `note`**: write the intent there ("he lands and sits before 2.2"); reviewers read it.

Actor state (position, pose, face, params) **carries over from shot to shot inside a scene**; a new scene starts from its `actors` block.

## Beats

Beats run in sequence. Modifiers: `"with": "prev"` (start with the previous beat), `"after": 0.4` (a delay), `"at": 2.0` (pinned to seconds from the shot start; for `look`, `place`, `fx`, `sfx` it may also be a place).

| beat | fields | lasts |
|---|---|---|
| `say` | `say` (cast id or narrator), `text` (caption), `tone`, `expr` (a mood holds until changed; surprised, laugh, laughing, scared pass 0.4 s after the line), `vo`, `tts` (what is spoken), `trimEnd` | the voiced take |
| `do: walk / run / hop / fly` | `who`, `to`, `speed` (a multiplier, 1 = the rig's speed), `wade` + `depth` (cross water), `pose` (the pose it ends in; default `stand`, so a held pose is dropped), `height` (fly: end hovering), `z` (the depth it ends at; without, the depth of where it goes: an anchor's (0 unless it has one), the actor's it goes beside or rides) | route length / speed; a stepping stone 0.7–1.5 s whatever the `speed` |
| `do: enter / exit` | `who`, `from` / `to` (left, right, or a target), `run: true`, `speed`, `fly: true` (a flier flies in from above), `height` (enter: end hovering) | as walk |
| `do: place` | `who`, `to`, `face`, `height` (hovering), `z`: put an actor somewhere instantly (between shots; a cut hides it) | 0 |
| `do: pose` | `who`, `pose`, `dur` (the blend; 1–2.5 s for a slow body), `expr`; started while the actor still moves (a move carried from the last shot too), the move's end pose replaces it | `dur` |
| `do: gesture` | `who`, `name` (nothing else is read: the human's `point` follows its look, `point-up` / `point-down` aim outright). Over a walk or run the legs keep the gait, so a `jump` or `stamp` shows only after the move | the gesture |
| `do: look` | `who`, `to` (actor, anchor, left, right, up, sky = a moderate look up, down), `tilt` (−1..1: the head's pitch, outright, + up, − down); the beetle, butterfly and songbird don't tilt, and the deer's head barely drops | 0.3 (tortoise 1.0) |
| `do: turn` / `emote` / `blink` | `who`, `face` / `expr` | 0.25 / 0 / 0.2 |
| `do: sit / stand / lie / sleep / wake` | `who` (`wake` may keep a `pose`) | 0.6 |
| `do: set` | `who`, `params`, `pose`, `expr`: change look or state instantly (wet fur, a star's opacity); `z` with a `dur`: move it through depth over that time | 0 (a `z`: its `dur`) |
| `do: fade` | `who`, `to` (opacity 0..1), `dur` | `dur` |
| `do: custom` | `name` (a built-in effect, `references/effects.md`, or one of the film's), `dur`, any params; `"scope": "shot"` ends it at its shot's cut (else it lasts its `dur` into the next shots: a warning; `"scope": "scene"` says that is meant); `"hold": false` plays it without holding the next beat | `dur` (`"hold": false`: 0) |
| `sfx` | name, `gain`, `pan`, `params`, `dur`, `caption`, `"hold": false` (the beat's `dur` plays but takes no time). A long sound under a scene: its length in `params` (`"params": { "dur": 30 }`), not the beat's `dur`; it plays on across cuts | 0, or the beat's `dur` |
| `fx` | dust, splash, sparkle (one-shots at `at` / `on`; `size` scales a sparkle but it is always 14 stars: a single glint is a custom beat); leaves, rain, fireflies, motes, mist (fields over the whole frame, `n` = density per world area: a close shot of a small rig shows few); `dur`, `n` | 0 |
| `music` | `{ "music": { "mood": "tender", "intensity": 0.3 } }` or `{ "music": "sting", "name": "plunk" }`; cue extras `motif`, `motifVoice`, `hold`, `downbeat`, `tempo`. A mood change on a cut: `downbeat: true` (else it may open near-silent); the last cue: `hold: true` to sound under the end card | 0 |
| `title` | `title`, `sub`, `dur`, `place` (top, upper, center, lower, bottom, auto, or a fraction) | `dur` |
| `mark` | a unique name; `plan.marks[name]` = its film time (custom effects key off it) | 0 |
| `wait` | seconds | the value |

**Targets** (`to`, `at`): an anchor name, `x:1500`, `x:1500,y:1060`, `near:<actor>`, `left-of:<actor>`, `right-of:<actor>`, `front-of:<actor>`, `behind:<actor>`, `on:<actor>` (ride its mount point; hop or place only), `left` / `right` (enter and exit only). `x:` alone is the main lane. A flight ends on the ground, a surface, a perch, a hollow or `on:<actor>`, or, with `"height": N` on a fly, enter or place, hovering N units above the target (taken as given, over water too; a songbird is 24 units tall). `near:` and `left-of:` / `right-of:` keep clear of the other's head and tail and of a hoverer's wings.

## Camera

| field | values |
|---|---|
| `size` | establishing (whole view), wide (subject ≈ 18% of the frame height), full (whole body ≈ 60%), medium (waist up), close (head and shoulders), extreme-close (face) |
| `on` | actor ids, anchor names and/or points of the set (`x:1500`: as a figure on the lane there; `x:…,y:…`: the point itself, in the air too); the union of their bounds is framed |
| `move` | static, push-in, pull-out, pan (from `on[0]` to `on[1]`), track, tilt-up, tilt-down, handheld |
| `angle` | eye, low (subjects lower, more sky), high |
| `zoom` | a multiplier on the size's zoom (0.8 = looser, 1.3 = tighter). A head of a subject with a face stays in frame above the captions; when no subject has a face (planet, telescope, a prop) a zoom above 1 crops into the framing and `offset` moves it as given |
| `focus` | `[fx, fy]` (a point of the subjects' box, 0..1 from its top left), `"head"` or a world point `"x:…,y:…"`: that point at the frame's centre (moved by `offset`), at the size's zoom × `zoom`; no lead room, headroom or caption band. Crops any subject |
| `offset` | `[fx, fy]` frame fractions (≤ 2), or larger numbers = a world-pixel shift |
| `to`, `toOn`, `zoomTo` | push-in / pull-out end framing: another size, other subjects, or k × the start zoom |
| `moveAt`, `moveDur` | confine the move to a window of the shot (eased, holding before and after) |
| `dof` | true blurs the far layers (close-ups default to true) |
| `z`, `zTo` | the camera's depth at the shot's start and at the move's end (world px, + toward the stage, under 3/4 of the lens: 1728): a dolly over the move's window (in space the kit's near field streams past, only while it moves); it grows the picture out from the frame's centre, so a dolly in composes its subjects near enough the centre to stay in frame at its end (`focus: [0.5, 0.5]` holds one dead centre); a push-in `to` a size with `zTo` keeps its subject framed (a dolly-zoom). What it comes up to stays whole until 0.04 × the lens from it; off the axis it slides out of the frame first, at about its width × 960 / its offset from the camera's centre (stage a fly-past within ~20 px of it) |

A static shot is composed once for everything its subjects do in the shot: if someone walks across, the frame holds the whole walk (and gets loose). Its size is set by the pose a subject holds for most of the shot: one who sits or lies down early (or stands up late) is too big while taller, so keep the taller pose for most of the shot, cut on the change, or `"zoom": 0.8`. To tighten as subjects come together, use a push-in with `to`. A static or handheld `close` shot eases out while a gesture holds the head out of frame (0.5 s or more) and back after; extreme close-ups and moves frame the resting head only (use the pose of the same name). An anchor in `on` is framed as a box about a standing hare's size. Depth of field keeps everything in `on` and `toOn` sharp.

## Names valid today

- **sky / time**: dawn, morning, noon, afternoon, golden, sunset, twilight, night (Earth's eight, on every built-in kit but `space`); `space` (the `space` kit's only time). A time the kit doesn't have is a `check` error
- **music moods**: wonder, pastoral, tender, playful, tension, chase, sad, triumph, night, mystery (`"music": "none"` for silence)
- **stings**: surprise, sad, triumph, magic, plunk, stab, swell
- **motif voices**: bassoon, flute, cello, horn, celesta, violin, strings, music-box, tutti
- **sfx**: footstep-grass, footstep-dirt, footstep-wood, footstep-stone, hop, land, whoosh, splash, plop, rustle, thud, pop, chime, sparkle, owl-hoot, birdsong, cricket, frog-croak, wind, stream, fire, door-creak, bell, mouse-squeak, songbird-tweet, wing-flap, knock, woodpecker, anvil, hum, music-box, gasp, sniff, snore, breath, slosh, bubbles, wind-swell, drip. Aliases: footstep, squeak, tweet, flap, hoot, croak, creak, gate-creak, leaves, bird. Footsteps and hops are added automatically from the gaits; don't add them by hand.
- **ambiences**: meadow-day, meadow-night, forest-day, forest-night, stream, village-day, village-night, wind-hill
- **grades**: memory (a storybook plate: sepia, vignette, deckled edge), dream, none
- **built-in effects** (custom beats unless marked): debris, eyepiece, lightbeam, lightpulse, moonlets, orbit, ringfield, sizerow, skydot (overlay), starstream, sunglow (both): `references/effects.md`
- **overlay layers** (custom.mjs): sky, back, depth, world, front, grade, screen. **rim** dirs: left, right, top, upper-left, upper-right
