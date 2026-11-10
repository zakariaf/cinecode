# Reviewing frames: checklist, lint rules, reviewer lenses

## Rendering what you need to look at

All from the repo root. Scratch images go in `films/<slug>/out/` (or `out/` at the root); the Read tool shows them.

```bash
# every shot, middle frame (films/<slug>/out/sheet.jpg; big films make a huge grid, so prefer per-scene sheets)
cinecode sheet films/<slug>
# one scene, bigger tiles: shot ids with --shots (NOT --t: --t=2.2 means 2.2 seconds)
cinecode sheet films/<slug> --shots=2.1,2.2,2.3,2.4 --cols=2 --tile=640 -o films/<slug>/out/s02.jpg
# debug overlay: actor boxes (yellow = speaking), head boxes (magenta), contact dots (green ground, orange air,
# yellow anchor or mount), solid footprints (red), caption box (dashed), camera zoom and centre
cinecode sheet films/<slug> --shots=2.2,2.4 --debug --cols=2 -o films/<slug>/out/s02-debug.jpg
# a motion strip: one shot at several points (u = 0..1 of the shot), or explicit seconds with --t
cinecode sheet films/<slug> --shots=2.7@0.05,2.7@0.25,2.7@0.45,2.7@0.65,2.7@0.85 --cols=5 --tile=384 -o films/<slug>/out/strip-2.7.jpg
# a moment keyed to a mark (a flash, a landing): its film time is on the last line of timeline.mjs; pass it to --t
node <skill>/scripts/timeline.mjs films/<slug> 2.7
# full-resolution single stills (eyes, small characters): writes out.jpg, or out-0.jpg, out-1.jpg… for several
cinecode sheet films/<slug> --frame --shots=9.3@0.7 -o films/<slug>/out/still.jpg
# a set with every anchor, footprint, walk region and water drawn (stage from this)
cinecode set-sheet meadow -o films/<slug>/out/set-meadow.jpg
```

Middle frames lie about shots with movement: for any shot with a walk, a hop, an entrance, a camera move or a pose change, look at a strip (start, middle, end, and the moment of the action).

## The checklist, per tile

Write down every problem as `shot id: what is wrong → the fix` before changing anything.

1. **Framing.** Does the subject fill the frame the shot size promises (or, for a crop or a `focus`, show the part the shot is about)? Lead room in front of the face, headroom above, nobody important cut by the frame edge, no big empty half. A two-shot where one subject is tiny is too loose (see pitfalls). A static or handheld close-up eases out to keep a held gesture's head in (the mouse's `gasp`); an extreme close-up or a moving shot doesn't, so a gesture that lifts the head can leave the frame there: use the pose of the same name. Ears or feet just touching an edge, and the moon on a head, read as mistakes (lint's `tangent` and `halo`).
2. **Ground contact.** Feet (or belly, or claws on a branch) on the ground, on an anchor surface, or on a perch. Floating looks like feet above their own shadow when nobody is jumping, or a shadow lying on nothing. In `--debug` the contact dot is green (ground) or yellow (anchor, perch, mount); orange (air) is right only during a jump or a flight. Riders sit on the carrier's shell, not above it.
3. **Hidden subjects.** Behind a tree trunk, a prop, a front layer (grass, ferns), the caption band, mist, an overlay, or night darkness. The speaker must be visible and readable.
4. **Eyes and eyelines.** Eyes open when they should be (not mid-blink in a key frame), looking at whom they talk to or at what the line is about. Eyelines match across a cut (if A looks right at B in one shot, B looks left at A in the reverse).
5. **Overlap.** Two characters drawn into each other at the same depth; a character's head inside another's body; a small character lost in front of a big one.
6. **Captions.** Not over a face or the action; short enough to read; the right person speaking. Each chunk keeps one band (bottom or top) for its whole time, chosen from the heads over that time, so in a shot that moves during a line check a strip that the band it chose stays clear. A caption crosses a cut only while its line is spoken (a sound caption: its sfx `dur`) or until it has been up 0.6 s.
7. **Continuity across cuts.** Same positions and poses from the end of one shot to the start of the next (lint's `continuity` catches the big changes); screen direction kept (a journey left to right stays left to right); the time of day doesn't jump.
8. **Light.** At night and in mist every character still reads as a shape; key characters are lit (rim light, `rim` on the scene); nothing important is a dark blob.
   **Depth** (things with a `z`): what should pass behind does (a moon behind the globe, debris behind the planet), nothing near the lens pops in or out, and no figure meant to stand on the ground slides over it.
9. **Story.** With the sound off, does the frame say what the shot is for? If the beat is "she recognises him", is her face turned to him and is he in frame?

Fix, re-render only the shots you touched (and their neighbours, for continuity), compare, repeat until a whole pass finds nothing.

## Lint

`cinecode lint films/<slug>` writes `out/lint.json` and `out/lint.jpg` (the offending frames with boxes, then a table of every rule with how to fix it) and exits 1 on errors. It is slow (about a minute for a 3½-minute film at `--step=0.5`, three times that at the default 1/6 s): run it in the background, and use `--step=0.5` while iterating. Fix every error. Judge each warning: some are intended (a cut-jump into an end title over the same sky, a crop into a planet). Mark an intended one on its shot, `"lint": { "allow": ["cut-jump"], "note": "the end title over the same sky" }`: lint then lists it as kept (green on `lint.jpg`, with the note, no fix tried) instead of as a warning; errors can't be kept. For `edge-cut`, `tangent` and `halo` the message ends with a change lint tried on the recompiled film (a camera `offset`, `size`, `zoom` or `angle`, or "stage <actor> about N px …": move where it stands as the shot starts and where it goes in it); it is printed only when it clears the fault without a new one, else the message says to re-block.

| rule | means | usual fix |
|---|---|---|
| floating | contact point on nothing | target a real anchor or a ground point; perch only perch rigs |
| inside-solid | walking through a tree, stump, rock | route around: a target on the near side, or an anchor in front of the prop |
| in-water | standing in water, not wading | `"wade": true` on the walk, or target a stone |
| collision | two footprints overlap at similar depth | spread them (`near:`, `left-of:`, `right-of:` stop beside the other actor with a gap, facing it), or one behind the other in depth |
| offscreen-speaker | the speaker is < 60% visible | reframe (`on` includes the speaker), or `"vo": true` if off screen on purpose |
| subject-size | subject height wrong for the shot size (it doesn't know a shot framing part of a subject on purpose: a `focus`, a `zoom` above 1 on subjects with no face, a dolly with `z` / `zTo`; keep it there) | change the size; stage subjects closer. `zoom` rarely helps (the accepted range scales with it). Too small usually means the frame also holds something else: a partner, an anchor in `on`, a walk, or a later taller pose or rider (start the shot in the final pose: `{ "do": "set", "who": …, "pose": … }` first). Too big in a static shot where the subject sits or lies down early (or stands up late): it is framed for the pose held most of the shot; keep the taller pose longer, cut on the change, or `"zoom": 0.8` for the headroom (the warning may stay: report it) |
| edge-cut | a head cut near the eyes by the frame edge (a rig with a face), or a sliver of an actor in frame, for 0.5 s | the change in the message; else re-block |
| tangent | an outline just touching a frame edge (ears at the top, feet just above the bottom) for 0.5 s | the `offset` / `zoom` or staging in the message |
| halo | the sun or moon touching or behind a head for 0.5 s | the change in the message, or a clear part of the sky |
| caption-face | the caption covers a speaker's head | `on`, `offset`, a tighter size, or stage further up the ground |
| cut-jump | two consecutive shots with nearly the same framing | change size, subject or angle, or merge the shots |
| continuity | a pose (lying, low, standing, raised) or place changes across a cut, unseen (also across a dissolve into a shot under 1.2 s on its own) | show the change in a shot, start the next shot where the last left off, or cut away first |
| axis | two talkers swap screen sides across a cut | keep A left / B right through the dialogue |
| teleport | an actor jumps > 40 px between frames | a missing walk; `place` only between shots |
| scale | actor scale off the set's perspective | wrong y for the anchor depth; use the anchor |
| timing | overlapping dialogue, shots < 1.2 s or seen on their own < 1.2 s after a dissolve or fade, captions faster than 20 chars/s | add `after`, lengthen the shot (the message gives the `dur`), split the line |

Also run `node <skill>/scripts/warnings.mjs films/<slug>`: compile warnings ("they stand too far apart for a full two-shot", "shows frog at 11% of the size it would get alone; pebble sets the framing", blocked routes, perch on a rig that can't) and misspelled fields, which `check` accepts silently. "no warnings" says little about framing: only lint and the sheets show the rest.

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
| sound (after `mix`) | wrong takes (`takes.mjs --all`: every transcript, length and pause), music mood per scene, quiet holes in the score (`levels.mjs`), sfx missing or doubled |

Then merge the reports, drop duplicates and disagreements you can't see in the frames, fix in order of severity, and re-render. A second round with fresh reviewers on the fixed shots catches what the fixes broke.
