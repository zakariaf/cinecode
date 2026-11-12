---
name: cinecode
description: Make a finished animated film with cinecode (painted, animated, voiced, scored and mixed by code; only voices come from Gemini TTS), from a one-sentence idea or a full screenplay to an MP4. Use when someone asks to "make an animated film / short / cartoon / animation / movie about …", to turn a story, fable or screenplay into an animation, or to storyboard, voice, review, fix or render a film in films/<slug>.
---

# cinecode: from an idea to a finished film

cinecode turns `films/<slug>/film.json` (a storyboard) into a film: painted sets, animated characters, camera, captions, voices, music, sound effects and a mix. Everything is drawn and synthesized by code except the voices (Gemini TTS, cached in `films/<slug>/voices/`). This is the method that made `films/seventy-six-summers` (3:45, 56 shots, 56 voiced lines) good. Follow it in order.

**Where you work.** A film is `films/<slug>/` under the folder Claude Code was started in (the person's project; in the cinecode repository, its own `films/`). Run every command from that folder. Pieces several films share go in `cinecode/{rigs,kits,effects}/` at the project root (step 6).

**The CLI** is `cinecode <command> films/<slug>` (`--help` on any command). As a Claude Code plugin, `cinecode` is on the PATH; if it isn't (inside the cinecode repository without the plugin), run `node ${CLAUDE_SKILL_DIR}/../../../bin/cinecode.mjs` in its place. **The first time on a machine** run `cinecode setup`: it installs the drawing library and checks Node, ffmpeg and the Gemini key; fix what it reports as FAIL before anything else.

**cinecode's own folder** (engine, docs, worked examples) is `${CLAUDE_SKILL_DIR}/../../..`, written CINECODE below; this skill's folder is `${CLAUDE_SKILL_DIR}` (the references write it as `<skill>`). Where things are:

- `CINECODE/docs/storyboard.md`: every storyboard field (`CINECODE/DESIGN.md` §2–4 and §9–11 are the contracts). `CINECODE/docs/effects.md`: custom effects; `docs/cast.md` and `docs/sets.md`: adding a rig or a kit.
- `${CLAUDE_SKILL_DIR}/references/`: `storyboard-quick.md` (a valid skeleton, a space scene, beats, camera, every valid name), `cast.md` (every rig: speeds, poses, gestures, params, what rigs can't do, substitutes for missing animals), `sets.md` (every kit: anchors with x, y and scale, props' extents, times; hollows), `effects.md` (the built-in effects: what each draws, its params, its layer), `voices.md` (the 30 voices, writing tones, fixing takes), `review.md` (rendering stills and strips, the per-frame checklist, lint rules, reviewer lenses).
- `${CLAUDE_SKILL_DIR}/scripts/`: `inventory.mjs` (live rig, kit and effect tables), `warnings.mjs` (warnings `check` and `plan` don't print), `timeline.mjs` (every beat's start and end, marks, moves that run past a cut), `takes.mjs` (what each voice take says), `levels.mjs` (the score's level per shot, and quiet holes in it).
- `CINECODE/films/seventy-six-summers/` is the worked example: `screenplay.md`, `film.json`, `custom.mjs` + `fx/`. `CINECODE/films/_test/custom.mjs` is a small custom-effects example, `CINECODE/films/strawberry-race/rigs/strawberry.mjs` a film-local rig (a prop).
- The build skills, for anything the engine doesn't have: `build-rig` (a character or a prop), `build-kit` (a place), `build-effect` (weather, light, a swarm, a sound). Each ends in a gate: `cinecode verify-rig`, `verify-kit`, `verify-effect`.

Ground rules:

- Work inside `films/<slug>/`. Never edit cinecode's `engine/` for a film: what the engine lacks is built in the film's folder (or the project's `cinecode/`), step 6. If you find an engine bug, work around it and tell the person.
- **Never stop at "not available".** A character, place, prop or effect the engine lacks is reused, adapted or built (step 1, "What isn't there"), never cut or refused for that reason alone.
- Deterministic: no `Math.random()` or `Date.now()` in film code; use `rng(seed)` from `cinecode/lib` with `api.seed`.
- **Look at every image you render** with the Read tool. A film is done when the frames are good, not when the commands pass.
- One checkpoint: after step 1, show the person the logline, cast (rig + voice), sets and length in a few lines and ask for a go-ahead or changes. **First check that someone can answer:** run `cinecode setup --check` and read its `session` row. If it says nobody can answer (`claude -p` or the SDK), or you are a subagent or part of a workflow, or they said "just make it", skip the checkpoint: decide yourself, work to the end, and list your choices in the report. Never end a run on a question nobody will read. After the checkpoint, work to the end without asking.

## 1. The story

`cinecode new <slug> --title="The Title"` creates `films/<slug>/` with a `screenplay.md` template (keep its sections), a starter `film.json` and a `custom.mjs`. The starter is a complete example film (Pip, a hare and an owl in the meadow, and a `glints` custom beat in shot 1.6); only the title is yours. Replace its logline, voices, cast, sets and scenes, and delete from `custom.mjs` whatever you don't use (with the beats that name it).

Write `screenplay.md` before any JSON. **From a one-sentence idea**, invent the rest: who wants what, what stands in the way, the turn, a last image. **From a full screenplay**, adapt it: map every character to a rig and every place to a kit (reusing, adapting or building, below), and list what you adapted or built for the report. The screenplay has, in this order:

1. **Logline**: one sentence, who wants what and what's in the way. A theme line if there is one, and the lines or images that come back later with a new meaning.
2. **Characters**: for each, the rig, look (`params` colours, cast `scale`), voice (a Gemini voice + 2–3 delivery adjectives), personality in a line.
3. **Locations and times**: kit + time of day per scene, the anchors you will use, what happens there, and the **length target** (below) as seconds per scene.
4. **Music plan**: a mood per scene; optionally a motif (`note:beats` tokens) and where it is stated in full.
5. **Screenplay**: scenes with starting places, then shots, each with an id `<scene>.<shot>` (`2.2` = scene 2, shot 2; `film.json` uses the same ids), size, move, action and lines; `(pad 0.6 s)` for a pause:

```
**2.2** medium on Fidget and Pebble, static. Fidget sits on the stump; Pebble plods toward it.
FIDGET (bright): "Morning, boulder! Where you headed?"
(pad 0.6 s)
PEBBLE (slow): "The standing stone. Tonight."
```

6. **Ending and final image**: the last image and how it answers the opening.

**Characters: start from the existing rigs** (live list: `node ${CLAUDE_SKILL_DIR}/scripts/inventory.mjs cast`; drawn: `cinecode cast-sheet <kinds> -o out/cast.jpg`). Walk speeds are units/s; see `references/cast.md` for on-screen times.

- `human`: a storybook person, child / teen / adult / elder, many clothes and hair params; walk 92; sits on the ground or a seat, crouches, kneels, points, waves, claps, jumps for joy.
- `hare`: tall and fast (hop 190, run 640); ears, stretch, yawn, skid, slump; waves, points, thumps, shrugs.
- `tortoise`: **very slow** (walk 15, run 34); scuted shell, neck that hides; carries a rider on its shell (`on:<id>`); slow looks (1 s); moss, star marking, wet shell.
- `fox`: russet; walk, trot, gallop (run 500); points, bows, sniffs.
- `owl`: front-facing; perches and flies; hoots, flaps; a dozing `one-eye` expression.
- `squirrel`: big tail (`tail` 0.4–1.8); perches on branches; quick runner (165); shushes, nibbles, drops an acorn; `flop` over a shell.
- `songbird`: perches, hops, flies; sings.
- `mouse`: tiny; scurries, sits up, gasps, cheers.
- `hedgehog`: tiny and slow; curls into a ball, bristles.
- `badger`: low and wide; waddles; digs, cheers.
- `deer`: the tallest animal; grazes, flicks ears, stamps; optional antlers.
- `frog`: sits, croaks (throat sac), catches with its tongue; small hops (`walk`, `hop`: 26, slow) or big leaps (`run`: 92).
- `beetle`: tiny, six-legged, slow.
- `butterfly`: flies and glides, perches with folded wings.
- `planet`: a planet, moon or the Sun (`body`: saturn, jupiter, earth, mars, venus, mercury, uranus, neptune, moon, titan, pluto, charon, sun); no face, holds at a perch anchor, throws no shadow. For space films (below).
- `telescope`: a prop on a tripod; a child stands at its eyepiece (`references/cast.md`).

**What isn't there: reuse, adapt, build.** For every character, prop, place and effect the story needs, in this order:

1. **Reuse** a rig, kit or built-in effect that is the thing (a fox is the fox; a lantern-lit cottage is the village at dusk; a view through a telescope is the `eyepiece` beat). The library is more than the lists here: `inventory.mjs` prints every rig, kit and effect, and `references/effects.md` says what each built-in effect draws (`skydot`, `sunglow`, `starstream`, `eyepiece`, `lightpulse`, `lightbeam`, `orbit`, `sizerow`, `moonlets`, `debris`, `ringfield`).
2. **Adapt** one: `params` (coat colours, antlers, tail size, clothes), cast `scale`, a kit's time of day, plus at most a small overlay that follows the actor, and only when the result reads as the thing at the film's framing. A firefly is a dark-winged, yellow-bodied butterfly at `scale` 0.6 with a glow overlay (`CINECODE/films/glim/`). The substitutes in `references/cast.md` are this step: a fallback when they truly read, not the answer.
3. **Build** it when an adaptation wouldn't read (a wolf in a close-up, a crow that must be a crow, a kite the story turns on, a strawberry that splits, a harbour, a thunderstorm): a new rig (`build-rig` skill; props on the ground or in the air are rigs too), a new kit (`build-kit`) or an effect (`build-effect`). Each lives in `films/<slug>/rigs|kits|effects/` and loads like a built-in once its gate passes (`cinecode verify-rig|verify-kit|verify-effect`) and you have looked at its review images.

Decide at the checkpoint what you will build: a rig or a kit costs real time, an adaptation that reads is better spent effort. Never tell the person a thing isn't available; say what you reused, adapted or built.

**A colouring-book look** (line art, black outlines on white, no colour) is built in: `"format": { "style": "lineart" }` draws every character, prop, set, effect and title card as ink on white paper (CINECODE/docs/storyboard.md, "Line art"). Don't post-process the rendered video into lines.

**Places: start from the existing kits** (anchors in `references/sets.md`; drawn with anchors: `cinecode set-sheet <kit> -o out/set-<kit>.jpg`); a place none of them can be is built (`build-kit`). Times: Earth's eight (dawn, morning, noon, afternoon, golden, sunset, twilight, night) on every kit but `space`, which has one of its own, `space`; a time a kit doesn't have is a `check` error.

- `meadow`: forest edge; the owl's hollow tree with a low branch (perches), an old stump (`stump_top`), rocks, a lily pond.
- `forest`: a dirt path between big trunks; an oak with a mouse-sized den (`den`, a hollow), a fallen log (`log_top`), a boulder; extra wide.
- `stream`: a brook across the path; four stepping stones (`stone_1`–`stone_4`), a frog rock, banks; wading is possible.
- `wayside`: a great tree with a long low branch over a nap spot, a signpost at a fork, three perches.
- `valley`: a lookout knoll above a wide valley; far `view_*` landmarks for journeys seen from afar.
- `hill`: a ridge set; a long slope rising left to right to a crest with a standing stone (`stone_top`) and a hawthorn.
- `village`: a cottage with door and windows, picket fence and gate, well, bench (`bench_seat`), lantern, lane, a tree with perches; windows and lantern light up at dusk.
- `space`: a starfield with the Milky Way; no ground, no sun, no shadows; perch anchors (`centre`, `west`, `east`, `far*`, `near*`) to hold planets; a near field of dust at every depth that a camera moving through depth streams past, seen only while it moves (`dust` param: 0 or false none, 2 twice as much).

**Write for what the rigs can do.** Every view is side-on. Characters don't touch or hug, and hold only what you draw for them: tell the story with positions, walks, looks, poses, gestures, expressions, timing and the camera. Keep lines short (most under ten words), one emotion per line. Every scene needs a turn you can see with the sound off.

**Length target.** `plan`'s total includes the title cards (shot 1.1 starts after the opening card), so count them. Shots average 4 s. A card needs 3 s to be read: the title is fully inked 1.4 s in and dissolves into shot 1.1 over the last second; the end card's line is full from 1.3 s until it fades to black over the last 1.2 s.

| film | scenes | shots | lines | title cards |
|---|---|---|---|---|
| about 30 s | 1 | 5–6 | 3–5 | 3 s each (24 s of shots) |
| 1 minute | 1–2 | 12–14 | 10–14 | 4 s each (the starter's) |
| 3 minutes | 6–10 | 40–50 | 40–50 | 4 s each |

A line lasts about `words / 2.6 + 0.3` s until it is voiced, but a slow or gruff voice or a line of two sentences can take twice that ("The last strawberry. Mine!" came back at 3.8 s, with a 0.6 s pause), so aim a short film about 10% under its target. A shot lasts as long as its slowest thing: the action, or the lines plus their pauses.

## 2. The storyboard (`film.json`)

Look fields up in `CINECODE/docs/storyboard.md`; the short version with every valid name is `references/storyboard-quick.md`. Translate the screenplay shot by shot: scene `actors` (where everyone starts), then each shot's `camera` and `beats`. Put the intent in `note` fields; reviewers read them.

**Staging rules** (the ones that cost the most rework):

- **Everyone stands on something real.** Use anchor names from the kit, or `x:…,y:…` points you have seen inside the walk region on the set sheet (`x:` alone is the main lane). Branches (`perch` anchors) only for rigs that can perch. Riding is `"to": "on:<actor>"` on a hop or place. A hollow (`den`) is entered by jumping up into it and shows its occupant against a dark hole: read the notes in `references/sets.md` before staging one.
- **Fliers hover with `"height"`.** A `fly`, `enter` or `place` with `"height": N` (units at the set's scale; a songbird is 24 tall) ends with the flier flapping N units above its place, over water too, where it can talk and gesture: `{ "do": "fly", "who": "glim", "to": "near:tilly", "height": 30 }`. Its next move is a flight (a walk flies down and lands). A hoverer can't sit, lie, sleep or take a pose until it lands (a `check` error). Without `height` a flight ends on the ground, a surface, a perch, a hollow or `on:<actor>`.
- **Plan distances from rig speeds.** On screen an actor covers `speed × s` world px/s, s = the set's scale there × cast `scale` (about 1.3 on most lanes, up to 2 near the camera). A human crosses 300 px in about 2.5 s; a tortoise needs about 15 s. Each stepping stone is a jump of 0.7–1.5 s (a small rig the longest) whatever its gait or `speed`. Write each shot's target position from the previous one: positions carry over from shot to shot inside a scene.
- **Moves end standing.** A walk, run, hop or fly ends in `stand` (or perched, on a perch) unless it gives `"pose"`: a held pose (`hold-hand-out`, `sit`) is dropped by any move. A pose that starts while its actor still moves (a move carried over from the shot before too) is replaced by the move's end pose, and a gesture laid over a move keeps the gait's legs (a `jump` or a `stamp` doesn't show): put them after the move. `timeline.mjs` (step 3) marks both.
- **Entrances in wide shots.** `enter` from a side starts outside every view the shot may show: in an establishing shot (or a push-in from one) that is the edge of the set, so the actor arrives only at the end. There, start it as a scene actor just inside the frame and `run`.
- **Lead room and the axis.** Face characters the way they move or talk. In a conversation keep A on the left facing right and B on the right facing left for the whole scene. `near:<actor>` stops beside someone, clear of its head and tail (and of a hoverer's wings), and turns to face them.
- **Expressions.** A line's `expr` that is a mood (`happy`, `worried`) holds until a beat changes it; a reaction (`surprised`, `laugh`, `laughing`, `scared`) passes 0.4 s after the line. Set the next mood with an `emote` when the scene turns. On the hedgehog, mouse and badger `sad` reads as a scowl (use `worried`, or `sleepy` for weary), and the badger and fox bare their teeth when they talk: see the faces in `references/cast.md` before a close-up.
- **Listeners turn to the speaker** (the body too, if the speaker is behind) and go back to their own look after the line: a look that must read goes before or after someone else's line, not under it.
- **One action per beat.** Walk, then talk; `"with": "prev"` only when two things truly happen together (a gesture on its line). Pauses are `"after": 0.6`, never "…" in the text.
- **Tones are short delivery adjectives**: "dry", "soft, tender", "squeaky, disbelieving". The voices-block tone (2–3 words) is joined with every line's tone, and only the last three descriptors are sent (`references/voices.md`).
- **Vary the framing.** Establish a place wide, then go in; don't cut between two near-identical framings; a two-shot only when the two are close together at a similar height (see the pitfalls).
- **Part of a subject.** `zoom` multiplies the size's zoom, but while a subject has a face the frame keeps its head in frame and above the captions (an `offset` can't push it out). When no subject has a face (a planet, a prop) a zoom above 1 crops into the framing and the `offset` moves it as given: `"zoom": 1.6, "offset": [-0.3, 0.1]` frames part of Saturn. `"focus": [0.9, 0.5]` puts that point of the subjects' box (or `"head"`, or a point `"x:…,y:…"`) at the frame's centre, for any subject; `"on": ["x:1840,y:886"]` frames a point of the set. No hidden stand-in needed.

### Space and depth

Films in space, or with things in front of and behind each other, are supported. To start one:

- **Set and cast.** The `space` kit, `"time": "space"`, `"ambience": "none"`; a `planet` actor per world (`"params": { "body": "saturn" }`) at a perch anchor, sized with cast `scale` (true relative sizes: multiply by the ratio of radii, `references/cast.md`). An Earth side (a child at a `telescope` on the `hill` at night, a `skydot` overlay where it points) cuts to it.
- **Depth.** A scene actor's `"z"` (world px; positive farther, negative nearer) draws it smaller or bigger and behind or in front of everything on the stage: a moon at `"z": 2400` is about half size and drawn behind Saturn. `place`, `walk`, `run`, `hop`, `fly`, `enter`, `exit` and `set` take a `"z"` too. Depth is for things in the air and sets with no painted ground: a figure standing on the hill stays at z 0 (`warnings.mjs` says when one doesn't).
- **The camera moves through depth.** `"z"` (its depth at the shot's start, positive toward the stage) and `"zTo"` (at the move's end, over `moveAt` / `moveDur`) dolly in or out, the near things growing faster than the far, and the space kit's near field streams past while the camera moves (flight, not a zoom; a still shot, a pan or a lens zoom shows none of it); both stay under 1728 (3/4 of the lens). A `push-in` `to` a size with a `zTo` holds its subject while the rest changes (a dolly-zoom). A planet has no face, so no lead room: it is centred across the frame. A dolly in grows everything out from the frame's centre, so it composes its subjects near enough the centre to stay in frame at its end (one that ends bigger than the frame is flown at dead centre); for a planet held dead centre throughout, add `"focus": [0.5, 0.5]`. Things the camera comes up to stay whole until they are almost at the lens (don't `fade` one out by hand as the camera passes it: it turns see-through mid-frame); one off the camera's axis slides out of the frame first, leaving it at about its width × 960 / its offset from the axis (screen px at 1080p; offset in world px from the camera's centre): to have a moon swing past big, stage it within about 20 px of the axis (Titan at scale 0.11), with a `z` in front of the stage that the dolly passes (`zTo` beyond `z` + 2304).
- **Effects.** The built-in space effects above; `debris` drifts at many depths, so a dolly flies through it; `ringfield` lays ice and rock in a planet's rings for a flight into them; `lightbeam` brings sunlight to a planet as a soft shaft. Frame parts of a planet with `zoom` and `focus` (above).
- **Lint** takes a crop as meant: on a shot with a `focus`, a `zoom` above 1 on subjects with no face, or a dolly (`zTo`), `subject-size` only warns of a subject too small (a dolly is judged at its first frame) and `edge-cut` reports no sliver of the subject (in a dolly, of anyone). Another warning you keep goes on the shot as `"lint": { "allow": [rules], "note": "why" }`; `cinecode lint` counts the kept ones, and `check` rejects a malformed block.
- **Cut, don't dissolve, into a full-frame effect.** A scene in another set dissolves in by default, and the last scene shows through the eyepiece's black: give it `"transition": "cut"`.

`references/storyboard-quick.md` has a valid space scene to start from.

## 3. Check and plan

```bash
cinecode check films/<slug>      # validate; lists every problem with its path
cinecode plan films/<slug>       # shot list: start, length, first line (~ = estimated, not voiced yet)
node ${CLAUDE_SKILL_DIR}/scripts/warnings.mjs films/<slug>   # misspelled fields `check` ignores; two-shots staged too far apart; an actor dwarfed by an anchor or a bigger actor in "on"; blocked routes; a custom beat drawn on past its shot; your piece replacing a built-in
node ${CLAUDE_SKILL_DIR}/scripts/timeline.mjs films/<slug> 1.4 1.5   # each beat's start and end, moves that run on past a cut, mark times; "!" = a pose or gesture lost under a move
```

Fix until `check` is valid and `warnings.mjs` is clean or every warning is understood. "no warnings" says nothing about framing: only lint and the contact sheets do. Compare `plan`'s total with the length target.

## 4. Voices

`voice` needs `GEMINI_API_KEY` in the environment. **Never print it**: no `echo $GEMINI_API_KEY`, `env`, `printenv` or `set`, and never write it into a file or a command line. Check it with:

```bash
[ -n "$GEMINI_API_KEY" ] && echo "key is set" || echo "key is missing"
```

If it's missing, ask the person to export it in their shell profile and restart the session; don't ask them to paste it into the chat. Then:

```bash
cinecode voice films/<slug>                      # only new or changed lines go to the network
node ${CLAUDE_SKILL_DIR}/scripts/takes.mjs films/<slug> --all   # every take: what was asked, what was heard, its length and pauses
```

Each new take is transcribed and checked: a take that reads its tone aloud is retried with less of it (up to 3 tries, the best kept), and `voice` marks lines still above 20% word error with `!`. That isn't everything, so read every take in `takes.mjs --all` (without `--all` it prints only flagged and non-verbal lines; details in `references/voices.md`):

- Fix every flagged take, `TONE-CUT` included (kept after its tone was cut: the right words, maybe a flat delivery), and anything wrong it doesn't flag: an added "Huh,", a clipped first word, a laugh heard as a word. Change the tone word (a new take), or delete `voices/<id>.wav` and `voices/<id>.json` for a fresh one, then run `voice` again.
- Made-up names get misheard by the checker ("Glim" → "Clem") and use up tries, and so does a one-word line ("Ours." came back as "hours" and "Walrus" three times; "Ours, then." passed): give a lone word some context, and read what was heard before you redo a take.
- Old takes that no line uses any more are listed with an `rm` command; deleting them is safe.
- You can't hear the takes: name the lines the film hangs on (id and file) for the person to listen to.

Voice before the contact-sheet loop: shot lengths come from the real takes, so staging timed on estimates moves. Run `plan` (and `timeline.mjs` for shots with moves) again afterwards.

## 5. The contact-sheet loop

This is where the film gets good. Commands and the full checklist are in `references/review.md`.

```bash
cinecode sheet films/<slug>       # middle frame of every shot → films/<slug>/out/sheet.jpg
cinecode sheet films/<slug> --shots=3.1,3.2,3.3,3.4 --cols=2 --tile=640 -o films/<slug>/out/s03.jpg  # one scene, bigger
cinecode sheet films/<slug> --shots=3.3 --debug -o films/<slug>/out/s03d.jpg                         # boxes, contacts, caption box
cinecode sheet films/<slug> --shots=3.3@0.1,3.3@0.3,3.3@0.5,3.3@0.7,3.3@0.9 --cols=5 --tile=384 -o films/<slug>/out/strip.jpg
```

`--shots=` takes shot ids (with `@u` for a point 0..1 in the shot); `--t=` takes **seconds**, so `--t=2.2` is not shot 2.2.

1. Render a scene's sheet and **look at every tile**. List what's wrong, as `shot: problem → fix`: framing (size, lead room, headroom, cut-off heads), floating (feet above their own shadow when nobody is jumping, a shadow on nothing), hidden subjects (behind a trunk, a front layer, mist, an overlay, the dark), eyes (shut, looking at the wrong person), overlap (two characters drawn into each other), captions (over a face, too long, in a band someone walks into), continuity across cuts.
2. Middle frames hide motion. For every shot with a walk, hop, entrance, camera move, gesture or pose change, render a strip of 4–6 frames and check the whole move: where it starts, that it ends where the next shot begins, that nobody slides or pops.
3. Fix `film.json`, re-render only those shots and their neighbours, look again. Repeat until a whole pass finds nothing.
4. `cinecode lint films/<slug> --step=0.5` (about a minute for 3½ minutes of film, seconds for a short; run long ones in the background). Read `films/<slug>/out/lint.jpg`. Fix every error and every warning that is a real problem; a warning you keep on purpose gets `"lint": { "allow": ["<rule>"], "note": "why" }` on its shot (lint then lists it as kept, in green on `lint.jpg`, with no fix tried) and goes in the report. `edge-cut`, `tangent` and `halo` messages end with a camera change or staging that lint tried on the recompiled film: apply it and look again. A `subject-size` warning that `zoom` doesn't clear means the frame holds something besides the subject: see the lint table in `references/review.md`. One exception: a static shot is framed for the pose its subject holds for most of the shot, so one who sits or lies down early (or stands up late) overfills it while taller: keep the taller pose for most of the shot, cut on the change, or `"zoom": 0.8` (lint may still warn: keep it and say so).

## 6. Building what the engine lacks

Small, film-only drawing (a glow on a reskinned rig, a comet, mist that parts, a reflection, a new sound) goes in `films/<slug>/custom.mjs`: it may export `custom` (custom beats, `{ "do": "custom", "name": … }`), `overlays` (whole-scene drawings on a layer: sky, back, depth, world, front, grade, screen), `sounds`, `rigs` and `kits` (`CINECODE/docs/effects.md`). A piece worth its own file goes in the film's folders, loaded like a built-in:

```
films/<slug>/rigs/<kind>.mjs      export default makeRig({ kind: '<kind>', … })     build-rig skill
films/<slug>/kits/<name>.mjs      export default (params) => makeSet({ … })         build-kit skill  ("kit": "<name>")
films/<slug>/effects/<name>.mjs   export const overlays / custom / sounds           build-effect skill
cinecode/rigs|kits|effects/       the same, shared by every film in the project
```

Film code imports the engine as `cinecode/<name>` wherever the film lives: `cinecode/lib` (rng, noise, ink, ell, rpoly, clump…), `cinecode/style` (cel, line, eye, brow…), `cinecode/rig` (makeRig, footAt, gest…), `cinecode/set` (makeSet), `cinecode/paint/<name>` (scenery, nature, water, structures, planets…), `cinecode/engine/<path>` for anything else. Never a relative path into cinecode's folder.

- Use the build skill: it has the contract, a starter that passes its gate, and the house-style helpers. **The gate is not optional**: `cinecode verify-rig <file>` / `verify-kit <file>` / `verify-effect films/<slug> <name>` must pass, and you must look at every review image it writes, before the piece goes into `film.json`. Fix and rerun until both are good.
- Match the style: inked wobbly outlines, gouache dabs, cel shading, light from the upper left. Emitted light (a lamp, a comet, a firefly) goes on the `grade` layer, after the night grade, or it turns grey.
- To follow an actor, draw at `api.toScreen` of `api.actor(id).box` (null while it is off stage), sized by `api.cam.zoom`; for one off the stage (its `z`), at `api.project([x, y, a.z])`, sized by the scale it returns. A prop's painted extent is `api.set.props` (the hawthorn's crown has no anchor), the horizon `api.set.horizon`, a human's hand in `CINECODE/docs/effects.md`.
- A sound under a whole scene (rain): a custom sound that takes its length from `params`, `{ "sfx": "rain-bed", "params": { "dur": 30 } }` with no beat `dur`. The beat then takes no time and the sound plays on across the cuts (a beat `dur` would hold the shot that long).
- A custom beat takes its `dur` in the timeline: laid `"with": "prev"` over a line, a long one holds the next line back. `"hold": false` lets the next beats go on while it plays. It also lasts its whole `dur` into the next shots (a `warnings.mjs` warning): `"scope": "shot"` ends it at its cut. A scene overlay can keep to some shots: `"shots": ["2.1", "2.4"]`.
- Name your pieces apart from the built-in ones: a rig, kit or effect named like one replaces it for the whole film (`check` lists the file with "replaces the built-in …").
- Deterministic and stateless: draw only from `api.t`, `api.seed`, the params and a seeded `rng()`, never from state kept between calls (workers draw frames out of order). Key timed events off `mark` beats (`api.marks`), not hard-coded seconds.
- The built-in `fireflies` field is spread thinly over the whole world (3–6 × `n` per 420 px square): a shot of a small rig shows few even at `n: 6`. For a swarm, write an overlay around an anchor, keyed to a `mark`.
- Run `check` (it lists the extension files it loaded), then a strip across the shots that use the piece. Make sure it never covers a character's face or makes a speaker unreadable.

## 7. Music, mix, animatic, render

```bash
cinecode music films/<slug>      # the score alone → out/music.wav
cinecode mix films/<slug>        # score + dialogue + sfx + ambience, ducked and mastered to −16 LUFS → out/mix.wav
cinecode animatic films/<slug>   # 12 fps, half size, with sound → out/animatic.mp4 (mixes first if stale)
```

Music comes from scene and shot `music` cues (moods, stings, a `score` motif); footsteps and hops are added automatically. You can't hear it, so check what you can measure: `plan` counts the music cues, `mix` prints the loudness, and `node ${CLAUDE_SKILL_DIR}/scripts/levels.mjs films/<slug>` prints the score's level per shot in 0.5 s windows and flags quiet holes under a cue (a mean over a shot hides them). Two causes so far: a mood change on a cut without `"downbeat": true` can open with a second or more of near-silence (give it `downbeat`), and the last cue's final chord lands about 3 s before the end and dies under a short end card (give it `"hold": true`). A quiet scene should still read quieter than a chase. Whether the moods fit is for the person to judge in the animatic; say so in the report. Then look at the whole film at once:

```bash
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 films/<slug>/out/animatic.mp4)
ffmpeg -v error -y -i films/<slug>/out/animatic.mp4 -vf "fps=32/$d,scale=320:-1,tile=8x4" -frames:v 1 films/<slug>/out/overview.jpg
```

Read the overview (32 frames spread over the film, whatever its length): the journey, the light and the screen direction should read at a glance. Ask the person to watch the animatic: they can hear it, and it's the cheapest moment for notes. Then render:

```bash
cinecode render films/<slug>                       # → out/<slug>.mp4 + out/<slug>.srt (in the background: see below)
cinecode render films/<slug> --from=1:20 --to=1:40  # a full-quality sequence → out/<slug>-80s.mp4
```

`render` voices any missing lines first (with the key) and stops without it. It takes tens of minutes for a few minutes of film (every core works). **Run it once, in the background, and wait for it:** use your shell tool's background option (Claude Code's Bash `run_in_background`) and wait for the notice that it finished; don't detach it with `nohup … &` (the shell returns at once and the render looks done while it is still running), and don't poll with long `sleep`s. Never start a second render of the same film while one runs: cinecode refuses it (`another render of … is already running`); wait for the first, or stop it. Its last line (`verify`) is an ffprobe check: size, codec, frame count, fps, duration, audio, subtitles. Grab a few frames from the final file with `ffmpeg -ss <t>` and look at them.

## 8. The report to the person

- The file: `films/<slug>/out/<slug>.mp4` (and the `.srt`), its length, resolution, and how to re-render (`cinecode render films/<slug>`).
- What's in it: the logline, the scenes in a line each, the cast (rig and voice), anything custom you built.
- The choices you made without asking (when you skipped the checkpoint), and what you changed from their idea or screenplay and why (substitute rigs or places, cut lines).
- Known issues, honestly: lint warnings you kept, takes you couldn't get right (ids), shots you'd still improve, the lines and the music they should listen to.
- Don't commit, push or publish unless they ask.

## Pitfalls we hit

- **Tone words read aloud.** `[quick, bright, cheeky, sincere, low, slow] Don't stop…` came back as the six adjectives; "wondering" alone came back as "Mm, wondering."; `[warm, gentle, soft]` was read aloud (with "tender" for "soft" it took). Long lists, nouns ("grumpy old badger") and stage directions ("voice catching") get spoken, and no adjective is safe every time (`references/voices.md` lists the ones seen). Two or three short adjectives, the line's own delivery last; when one is read, change the word.
- **Takes that pass but are wrong.** A take can say the direction instead of the line, insert "Huh," or "Um", turn a laugh into "Oh", or (`TONE-CUT`) keep the words with no direction at all. Never trust a take you haven't read the transcript of (`takes.mjs --all`).
- **The slow tortoise.** 15 units/s is about 20–30 world px/s: a few hundred pixels is a whole scene. Move it a small step per shot, cut instead of walking (a `place` between shots or scenes hides the distance), and let the quick characters carry the action while it plods. `speed` multipliers above about 1.5 make a slow rig scurry.
- **Loose two-shots.** A static shot frames everything its subjects do, so two characters far apart (or one walking across) make both tiny. `warnings.mjs` catches two actors staged too far apart and a small actor dwarfed by a big one or by an anchor (`"on": ["tilly", "den"]`); lint's `subject-size` catches the rest. Stage them within a body length or two, cut between singles, or push in with `"to"` as they meet.
- **Branches and ground in one shot.** An owl on a branch and a squirrel on the grass: the frame spans both heights and each is tiny (Seventy-Six Summers 2.4: 19% of their single size). Cut between them, or bring the one on the ground up to a perch or a surface near the other.
- **Gestures in close-ups.** A static or handheld `close` shot eases out to keep a held gesture's head in frame (the mouse's `gasp` sits her up), then back. Extreme close-ups and moving shots don't follow: there use the pose of the same name (`{ "do": "pose", "who": "tilly", "pose": "gasp", "dur": 0.3 }`).
- **Captions over faces.** Burned-in captions sit in a band at the bottom, or the top when that covers fewer heads over the whole chunk (a chunk never changes band; a sound caption during a line takes the other band). The camera keeps framed heads above the bottom band, but a character missing from `on`, a small one low in the frame, or the action at someone's feet can end up under it (lint's `caption-face` checks speakers only). Fix with `on`, `offset`, a tighter size, or staging further up the ground. A sound caption crosses a cut only for its sfx `dur` (at least 0.6 s on screen): give a long sound a `dur`.
- **Mist, overlays and night hiding characters.** Height fog, front bands and night grades swallowed the old woman coming down the hill; a mouse in a dark den reads only by its rim light. Check every night and mist shot at full size (`--frame`); add a scene `rim` light, keep key figures in front of the band, or turn the overlay's params down.
- **Shot ids are not times.** `--t=2.2` renders second 2.2. Use `--shots=2.2`.
- **Two editors, one file.** Only one agent edits `film.json`; reviewers report.

## Big films: subagents and workflows

For a film past ~15 shots, split the work. Storyboard scene by scene (a subagent per scene is fine when each gets the screenplay, the staging rules above and its scene's start positions, and returns its scene JSON for you to merge). For review, run parallel reviewers on the same sheets, each with one lens (staging and continuity, camera and framing, acting and eyelines, light and atmosphere, captions and timing, story, sound), reporting `shot | problem | fix | severity` and editing nothing; each renders into its own file names (`out/review-<lens>-s03.jpg`) so they don't overwrite each other. With a workflow tool, fan out one reviewer per lens (or per scene × lens), then a single fixer. Merge, fix, re-render, and run a second round with fresh reviewers on what changed. Prompts and lenses are in `references/review.md`.
