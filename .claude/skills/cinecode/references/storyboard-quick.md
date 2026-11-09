# Storyboard quick reference

The full field reference is `docs/storyboard.md`; the contract is `DESIGN.md` §4 (base) and §9.1 (round 2); the validator `engine/film/validate.mjs` is the final word. This page is the short version, with the names that are valid today (read from the engine).

## A minimal valid film.json

Checked with `check` and `plan` (21 s, 3 shots). Start from `node bin/cinecode.mjs new <slug>` and grow it.

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

## Structure

- **film**: `title`, `logline`, `format` (`captions`: dialogue = characters' lines burned in | all = also narration and sfx that carry a `caption` | none), `titles` (`open`: title, subtitle, dur; `end`: lines, dur), `voices`, `cast`, `sets`, `scenes`, optional `score` (`{ "key": "C", "motif": "G4:1 E4:0.5 G4:0.5 A4:2 C5:3" }`: the film's melodic motif, stated by music cues with `motif`), `seed` (the score's seed).
- **cast entry**: `rig`, `name`, `voice` (a key of `voices`; omit for a silent character), `scale` (multiplies the set's perspective scale), `params` (rig look).
- **scene**: `id`, `set`, `time` (a sky name or `{ "from": "golden", "to": "twilight" }`), `transition` (cut | fade | dissolve), `music`, `ambience` (auto | a name | none), `actors`, `overlays`, `rim`, `shots`.
- **scene actor**: `at` (target), `face` (left | right), `pose`, `expr`, `on` (start riding another actor), `offstage` (left | right: not in the scene until an `enter`).
- **shot**: `id`, `camera`, `beats`, `hold` (seconds after the last beat, default 0.5) or `dur` (fixed length), `fadeIn` / `fadeOut`, `time` / `grade` / `gradeTo` (override the scene's light), `music` (a cue at the shot start), `note`.
- **Every object accepts `note`**: write the intent there ("he lands and sits before 2.2"); reviewers read it.

Actor state (position, pose, face, params) **carries over from shot to shot inside a scene**; a new scene starts from its `actors` block.

## Beats

Beats run in sequence. Modifiers: `"with": "prev"` (start with the previous beat), `"after": 0.4` (a delay), `"at": 2.0` (pinned to seconds from the shot start; for `look`, `place`, `fx`, `sfx` it may also be a place).

| beat | fields | lasts |
|---|---|---|
| `say` | `say` (cast id or narrator), `text` (caption), `tone`, `expr`, `vo`, `tts` (what is spoken), `trimEnd` | the voiced take |
| `do: walk / run / hop / fly` | `who`, `to`, `speed` (a multiplier, 1 = the rig's speed), `wade` + `depth` (cross water), `pose` (hop: land in it) | route length / speed |
| `do: enter / exit` | `who`, `from` / `to` (left, right, or a target), `run: true`, `speed` | as walk |
| `do: place` | `who`, `to`, `face`: put an actor somewhere instantly (between shots; a cut hides it) | 0 |
| `do: pose` | `who`, `pose`, `dur` (the blend; 1–2.5 s for a slow body), `expr` | `dur` |
| `do: gesture` | `who`, `name` | the gesture |
| `do: look` | `who`, `to` (actor, anchor, left, right, up, sky, down) | 0.3 (tortoise 1.0) |
| `do: turn` / `emote` / `blink` | `who`, `face` / `expr` | 0.25 / 0 / 0.2 |
| `do: sit / stand / lie / sleep / wake` | `who` (`wake` may keep a `pose`) | 0.6 |
| `do: set` | `who`, `params`, `pose`, `expr`: change look or state instantly (wet fur, a star's opacity) | 0 |
| `do: fade` | `who`, `to` (opacity 0..1), `dur` | `dur` |
| `do: custom` | `name` (in custom.mjs `custom`), `dur`, any params | `dur` |
| `sfx` | name, `gain`, `pan`, `params`, `dur`, `caption` | 0 |
| `fx` | dust, splash, leaves, sparkle, rain, fireflies, motes, mist; `at` / `on` (place), `dur`, `n` | 0 |
| `music` | `{ "music": { "mood": "tender", "intensity": 0.3 } }` or `{ "music": "sting", "name": "plunk" }`; cue extras `motif`, `motifVoice`, `hold`, `downbeat`, `tempo` | 0 |
| `title` | `title`, `sub`, `dur`, `place` (top, upper, center, lower, bottom, auto, or a fraction) | `dur` |
| `mark` | a unique name; `plan.marks[name]` = its film time (custom effects key off it) | 0 |
| `wait` | seconds | the value |

**Targets** (`to`, `at`): an anchor name, `x:1500`, `x:1500,y:1060`, `near:<actor>`, `left-of:<actor>`, `right-of:<actor>`, `front-of:<actor>`, `behind:<actor>`, `on:<actor>` (ride its mount point; hop or place only), `left` / `right` (enter and exit only).

## Camera

| field | values |
|---|---|
| `size` | establishing (whole view), wide (subject ≈ 18% of the frame height), full (whole body ≈ 60%), medium (waist up), close (head and shoulders), extreme-close (face) |
| `on` | actor ids and/or anchor names; the union of their bounds is framed |
| `move` | static, push-in, pull-out, pan (from `on[0]` to `on[1]`), track, tilt-up, tilt-down, handheld |
| `angle` | eye, low (subjects lower, more sky), high |
| `zoom` | a multiplier on the size's framing (0.8 = looser, 1.3 = tighter) |
| `offset` | `[fx, fy]` frame fractions (≤ 2), or larger numbers = a world-pixel shift |
| `to`, `toOn`, `zoomTo` | push-in / pull-out end framing: another size, other subjects, or k × the start zoom |
| `moveAt`, `moveDur` | confine the move to a window of the shot (eased, holding before and after) |
| `dof` | true blurs the far layers (close-ups default to true) |

A static shot is composed once for everything its subjects do in the shot: if someone walks across, the frame holds the whole walk (and gets loose). To tighten as subjects come together, use a push-in with `to`.

## Names valid today

- **sky / time**: dawn, morning, noon, afternoon, golden, sunset, twilight, night
- **music moods**: wonder, pastoral, tender, playful, tension, chase, sad, triumph, night, mystery (`"music": "none"` for silence)
- **stings**: surprise, sad, triumph, magic, plunk, stab, swell
- **motif voices**: bassoon, flute, cello, horn, celesta, violin, strings, music-box, tutti
- **sfx**: footstep-grass, footstep-dirt, footstep-wood, footstep-stone, hop, land, whoosh, splash, plop, rustle, thud, pop, chime, sparkle, owl-hoot, birdsong, cricket, frog-croak, wind, stream, fire, door-creak, bell, mouse-squeak, songbird-tweet, wing-flap, knock, woodpecker, anvil, hum, music-box, gasp, sniff, snore, breath, slosh, bubbles, wind-swell, drip. Aliases: footstep, squeak, tweet, flap, hoot, croak, creak, gate-creak, leaves, bird. Footsteps and hops are added automatically from the gaits; don't add them by hand.
- **ambiences**: meadow-day, meadow-night, forest-day, forest-night, stream, village-day, village-night, wind-hill
- **grades**: memory (a storybook plate: sepia, vignette, deckled edge), dream, none
- **overlay layers** (custom.mjs): sky, back, world, front, grade, screen. **rim** dirs: left, right, top, upper-left, upper-right
