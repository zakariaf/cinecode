# Reviewing frames: checklist, lint rules, reviewer lenses

## Rendering what you need to look at

All from the repo root. Scratch images go in `films/<slug>/out/` (or `out/` at the root); the Read tool shows them.

```bash
# every shot, middle frame (films/<slug>/out/sheet.jpg; big films make a huge grid, so prefer per-scene sheets)
node bin/cinecode.mjs sheet films/<slug>
# one scene, bigger tiles: shot ids with --shots (NOT --t: --t=2.2 means 2.2 seconds)
node engine/film/sheet.mjs films/<slug> films/<slug>/out/s02.jpg --shots=2.1,2.2,2.3,2.4 --cols=2 --tile=640
# debug overlay: actor boxes (yellow = speaking), head boxes (magenta), contact dots (green ground, orange air,
# yellow anchor or mount), solid footprints (red), caption box (dashed), camera zoom and centre
node engine/film/sheet.mjs films/<slug> films/<slug>/out/s02-debug.jpg --shots=2.2,2.4 --debug --cols=2
# a motion strip: one shot at several points (u = 0..1 of the shot), or explicit seconds with --t
node engine/film/sheet.mjs films/<slug> films/<slug>/out/strip-2.7.jpg --shots=2.7@0.05,2.7@0.25,2.7@0.45,2.7@0.65,2.7@0.85 --cols=5 --tile=384
# full-resolution single stills (eyes, small characters): writes out.jpg, or out-0.jpg, out-1.jpg… for several
node engine/film/sheet.mjs films/<slug> films/<slug>/out/still.jpg --frame --shots=9.3@0.7
# a set with every anchor, footprint, walk region and water drawn (stage from this)
node bin/cinecode.mjs set-sheet meadow -o films/<slug>/out/set-meadow.jpg
```

Middle frames lie about shots with movement: for any shot with a walk, a hop, an entrance, a camera move or a pose change, look at a strip (start, middle, end, and the moment of the action).

## The checklist, per tile

Write down every problem as `shot id: what is wrong → the fix` before changing anything.

1. **Framing.** Does the subject fill the frame the shot size promises? Lead room in front of the face, headroom above, nobody important cut by the frame edge, no big empty half. A two-shot where one subject is tiny is too loose (see pitfalls). Close-ups frame the resting head, not a gesture's peak: a gesture that lifts the head (the mouse's `gasp`) can leave the frame; use the pose of the same name.
2. **Ground contact.** Feet (or belly, or claws on a branch) on the ground, on an anchor surface, or on a perch. Floating looks like feet above their own shadow when nobody is jumping, or a shadow lying on nothing. In `--debug` the contact dot is green (ground) or yellow (anchor, perch, mount); orange (air) is right only during a jump or a flight. Riders sit on the carrier's shell, not above it.
3. **Hidden subjects.** Behind a tree trunk, a prop, a front layer (grass, ferns), the caption band, mist, an overlay, or night darkness. The speaker must be visible and readable.
4. **Eyes and eyelines.** Eyes open when they should be (not mid-blink in a key frame), looking at whom they talk to or at what the line is about. Eyelines match across a cut (if A looks right at B in one shot, B looks left at A in the reverse).
5. **Overlap.** Two characters drawn into each other at the same depth; a character's head inside another's body; a small character lost in front of a big one.
6. **Captions.** Not over a face or the action; short enough to read; the right person speaking; carried over a cut only when the line is. In a shot that moves during a line (a pull-out, a walk toward the camera), check a strip: the caption is placed frame by frame and can jump from the bottom to the top mid-line (an engine issue lint doesn't catch); restage so no head crosses the bottom band.
7. **Continuity across cuts.** Same positions and poses from the end of one shot to the start of the next; screen direction kept (a journey left to right stays left to right); the time of day doesn't jump.
8. **Light.** At night and in mist every character still reads as a shape; key characters are lit (rim light, `rim` on the scene); nothing important is a dark blob.
9. **Story.** With the sound off, does the frame say what the shot is for? If the beat is "she recognises him", is her face turned to him and is he in frame?

Fix, re-render only the shots you touched (and their neighbours, for continuity), compare, repeat until a whole pass finds nothing.

## Lint

`node bin/cinecode.mjs lint films/<slug>` writes `out/lint.json` and `out/lint.jpg` (the offending frames with boxes) and exits 1 on errors. It is slow (about a minute for a 3½-minute film at `--step=0.5`, three times that at the default 1/6 s): run it in the background, and use `--step=0.5` while iterating. Fix every error. Judge each warning: some are intended (a cut-jump into an end title over the same sky).

| rule | means | usual fix |
|---|---|---|
| floating | contact point on nothing | target a real anchor or a ground point; perch only perch rigs |
| inside-solid | walking through a tree, stump, rock | route around: a target on the near side, or an anchor in front of the prop |
| in-water | standing in water, not wading | `"wade": true` on the walk, or target a stone |
| collision | two footprints overlap at similar depth | spread them (`near:`, `left-of:`, `right-of:` stop beside the other actor with a gap, facing it), or one behind the other in depth |
| offscreen-speaker | the speaker is < 60% visible | reframe (`on` includes the speaker), or `"vo": true` if off screen on purpose |
| subject-size | subject height wrong for the shot size | change the size; stage subjects closer. `zoom` rarely helps (the accepted range scales with it). Too small usually means the frame also holds something else: a partner, an anchor in `on`, a walk, or a later taller pose or rider (start the shot in the final pose: `{ "do": "set", "who": …, "pose": … }` first) |
| caption-face | the caption covers a speaker's head | `on`, `offset`, a tighter size, or stage further up the ground |
| cut-jump | two consecutive shots with nearly the same framing | change size, subject or angle, or merge the shots |
| axis | two talkers swap screen sides across a cut | keep A left / B right through the dialogue |
| teleport | an actor jumps > 40 px between frames | a missing walk; `place` only between shots |
| scale | actor scale off the set's perspective | wrong y for the anchor depth; use the anchor |
| timing | overlapping dialogue, shots < 1.2 s, captions faster than 20 chars/s | add `after`, lengthen the shot, split the line |

Also run `node .claude/skills/cinecode/scripts/warnings.mjs films/<slug>`: compile warnings ("they stand too far apart for a full two-shot", blocked routes, perch on a rig that can't) and misspelled fields, which `check` accepts silently. "no warnings" says nothing about framing: the two-shot check compares with the larger subject, so a small actor framed with a big one or with an anchor passes it. Only lint and the sheets show those.

## Parallel reviewers (big films)

For more than ~15 shots, review with several subagents at once, each with one lens and the same rendered sheets. Each reviewer only reports; one agent (you) edits `film.json`, so edits never collide.

Give each reviewer: the film folder, the screenplay, which sheets and strips to Read (or the commands to render its own), its lens, and the report format `shot id | time | problem | proposed fix | severity (blocker / should / nice)`. Ask it to Read every image it cites and to quote what it sees, not what the storyboard says.

| lens | looks for |
|---|---|
| staging and continuity | floating, hidden subjects, overlap, positions and screen direction across cuts, routes through props |
| camera and framing | shot sizes, loose two-shots, lead room, headroom, cut-jumps, the axis, moves that end badly |
| acting and eyelines | eyes, looks at the right person, expressions that match the line, poses, gestures on the right word |
| light and atmosphere | night readability, mist and overlays over characters, rim light, grade changes |
| captions and timing | captions over faces, reading speed, pauses that are too long or short, lines cut early |
| story | does each scene play with the sound off, is the turn of each scene on screen, is anything confusing |
| sound (after `mix`) | wrong takes (from `takes.mjs` and the transcripts), music mood per scene, sfx missing or doubled |

Then merge the reports, drop duplicates and disagreements you can't see in the frames, fix in order of severity, and re-render. A second round with fresh reviewers on the fixed shots catches what the fixes broke.
