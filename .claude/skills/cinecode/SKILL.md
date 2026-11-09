---
name: cinecode
description: Make a finished animated film with cinecode (painted, animated, voiced, scored and mixed by code; only voices come from Gemini TTS), from a one-sentence idea or a full screenplay to an MP4. Use when someone asks to "make an animated film / short / cartoon / animation / movie about …", to turn a story, fable or screenplay into an animation, or to storyboard, voice, review, fix or render a film in films/<slug>.
---

# cinecode: from an idea to a finished film

cinecode turns `films/<slug>/film.json` (a storyboard) into a film: painted sets, animated characters, camera, captions, voices, music, sound effects and a mix. Everything is drawn and synthesized by code except the voices (Gemini TTS, cached in `films/<slug>/voices/`). This is the working method that made `films/seventy-six-summers` (3:43, 12 scenes, 57 shots, 56 voiced lines) good. Follow it in order.

Run everything from the repo root. The CLI is `node bin/cinecode.mjs <command> films/<slug>` (`--help` on any command). Where things are:

- `DESIGN.md`: the module contract (§4 storyboard, §9 the round-2 additions). `docs/storyboard.md`: every storyboard field. `docs/effects.md`: custom effects, rigs and kits in `custom.mjs`.
- `references/` next to this file: `cast.md` (every rig: speeds, poses, gestures, expressions, params), `sets.md` (every kit: anchors with x, y and scale), `storyboard-quick.md` (a valid skeleton, beats, camera, valid names), `voices.md` (the 30 voices, writing tones, fixing takes), `review.md` (how to render stills and strips, the per-frame checklist, lint rules, reviewer lenses).
- `scripts/` next to this file: `inventory.mjs` (live rig and kit tables), `takes.mjs` (audit voice takes), `warnings.mjs` (warnings `check` and `plan` don't print).
- `films/seventy-six-summers/` is the worked example: `screenplay.md`, `film.json`, `custom.mjs` + `fx/`. `films/_test/custom.mjs` is a small custom-effects example.

Ground rules:

- Work inside `films/<slug>/`. Don't edit `engine/` for one film: if the engine lacks something, add it in the film's `custom.mjs` (step 6). If you find an engine bug, tell the person.
- Deterministic: no `Math.random()` or `Date.now()` in `custom.mjs`; use `rng(seed)` / `hash(str)` from `engine/core/lib.mjs`.
- **Look at every image you render** with the Read tool. A film is done when the frames are good, not when the commands pass.
- One checkpoint with the person: after step 1, show the logline, cast (rig + voice), sets and length in a few lines and ask for a go-ahead or changes. If they said "just make it", skip it and list your choices in the report. After that, work to the end without asking.

## 1. The story

Write `films/<slug>/screenplay.md` before any JSON. `node bin/cinecode.mjs new <slug> --title="The Title"` creates `films/<slug>/` with a `screenplay.md` template (keep its sections), a starter `film.json` and a `custom.mjs` stub.

**From a one-sentence idea**, invent the rest: who wants what, what stands in the way, the turn, a last image. **From a full screenplay**, adapt it: map every character to a rig and every place to a kit, cut or restage what the engine can't show, and list the substitutions for the report.

The screenplay has, in this order:

1. **Logline**: one sentence, who wants what and what's in the way. A theme line if there is one, and the lines or images that come back later with a new meaning.
2. **Characters**: for each, the rig, look (`params` colours, cast `scale`), voice (a Gemini voice + 2–3 delivery adjectives), personality in a line.
3. **Locations and times**: kit + time of day per scene, the anchors you will use, what happens there, and the **length target** (below) as seconds per scene.
4. **Music plan**: a mood per scene; optionally a motif (`note:beats` tokens) and where it is stated in full.
5. **Screenplay**: scenes with starting places, then shots, each with an id (`2.2` = scene 2, shot 2), size, move, action and lines; `(pad 0.6 s)` for a pause:

```
**2.2** medium on Fidget and Pebble, static. Fidget sits on the stump; Pebble plods toward it.
FIDGET (bright): "Morning, boulder! Where you headed?"
(pad 0.6 s)
PEBBLE (slow): "The standing stone. Tonight."
```

6. **Ending and final image**: the last image and how it answers the opening.

**Characters: choose from the existing rigs** (live list: `node .claude/skills/cinecode/scripts/inventory.mjs cast`; drawn: `node bin/cinecode.mjs cast-sheet <kinds> -o out/cast.jpg`). Walk speeds are units/s; see `references/cast.md` for on-screen times.

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
- `frog`: sits, hops, croaks (throat sac), catches with its tongue.
- `beetle`: tiny, six-legged, slow.
- `butterfly`: flies and glides, perches with folded wings.

**Places: choose from the existing kits** (anchors in `references/sets.md`; drawn with anchors: `node bin/cinecode.mjs set-sheet <kit> -o out/set-<kit>.jpg`). Skies: dawn, morning, noon, afternoon, golden, sunset, twilight, night.

- `meadow`: forest edge; the owl's hollow tree with a low branch (perches), an old stump (`stump_top`), rocks, a lily pond.
- `forest`: a dirt path between big trunks; an oak with a den (hollow), a fallen log (`log_top`), a boulder; extra wide.
- `stream`: a brook across the path; four stepping stones (`stone_1`–`stone_4`), a frog rock, banks; wading is possible.
- `wayside`: a great tree with a long low branch over a nap spot, a signpost at a fork, three perches.
- `valley`: a lookout knoll above a wide valley; far `view_*` landmarks for journeys seen from afar.
- `hill`: a ridge set; a long slope rising left to right to a crest with a standing stone (`stone_top`) and a hawthorn.
- `village`: a cottage with door and windows, picket fence and gate, well, bench (`bench_seat`), lantern, lane, a tree with perches; windows and lantern light up at dusk.

**Write for what the rigs can do.** Every view is side-on. Characters don't touch, hug or hold props: tell the story with positions, walks, looks, poses, gestures, expressions, timing and the camera. Keep lines short (most under ten words), one emotion per line. Every scene needs a turn you can see with the sound off.

**Length target.** Seventy-Six Summers runs about 15 shots and 15 lines a minute (shots average 4 s). A 1-minute short: 1–2 scenes, 12–16 shots. A 3-minute film: 6–10 scenes, 40–50 shots. A line lasts about `words / 2.6 + 0.3` s until it is voiced. A shot lasts as long as its slowest thing: the action, or the lines plus their pauses.

## 2. The storyboard (`film.json`)

Look fields up in `docs/storyboard.md` (or `DESIGN.md` §4 and §9.1); the short version with every valid name is `references/storyboard-quick.md`. Translate the screenplay shot by shot: scene `actors` (where everyone starts), then each shot's `camera` and `beats`. Put the intent in `note` fields; reviewers read them.

**Staging rules** (the ones that cost the most rework):

- **Everyone stands on something real.** Use anchor names from the kit, or `x:…,y:…` points you have seen inside the walk region on the set sheet (`x:` alone puts them on the main lane). Branches (`perch` anchors) only for rigs that can perch. Riding is `"to": "on:<actor>"` on a hop or place.
- **Plan distances from rig speeds.** On screen an actor covers `speed × s` world px/s, s = the set's scale there × cast `scale` (about 1.3 on most lanes, up to 2 near the camera). A human crosses 300 px in about 2.5 s; a tortoise needs about 15 s. Write each shot's target position from the previous one: positions carry over from shot to shot inside a scene.
- **Lead room and the axis.** Face characters the way they move or talk. In a conversation keep A on the left facing right and B on the right facing left for the whole scene. `near:<actor>` stops beside someone and turns to face them.
- **One action per beat.** Walk, then talk; `"with": "prev"` only when two things truly happen together (a gesture on its line). Pauses are `"after": 0.6`, never "…" in the text.
- **Tones are short delivery adjectives**: "dry", "soft, tender", "squeaky, disbelieving". The voices-block tone (2–3 words) is joined with every line's tone, and only the last three descriptors are sent (`references/voices.md`).
- **Vary the framing.** Establish a place wide, then go in; don't cut between two near-identical framings; a two-shot only when the two are close together at a similar height (see the pitfalls).

## 3. Check and plan

```bash
node bin/cinecode.mjs check films/<slug>      # validate; lists every problem with its path
node bin/cinecode.mjs plan films/<slug>       # shot list: start, length, first line (~ = estimated, not voiced yet)
node .claude/skills/cinecode/scripts/warnings.mjs films/<slug>   # misspelled fields `check` ignores; two-shots staged too far apart; blocked routes
```

Fix until `check` is valid and `warnings.mjs` is clean or every warning is understood. Compare `plan`'s total with the length target.

## 4. Voices

`voice` needs `GEMINI_API_KEY` in the environment. **Never print it**: no `echo $GEMINI_API_KEY`, `env`, `printenv` or `set`, and never write it into a file or a command line. Check it with:

```bash
[ -n "$GEMINI_API_KEY" ] && echo "key is set" || echo "key is missing"
```

If it's missing, ask the person to export it in their shell profile and restart the session; don't ask them to paste it into the chat. Then:

```bash
node bin/cinecode.mjs voice films/<slug>                      # only new or changed lines go to the network
node .claude/skills/cinecode/scripts/takes.mjs films/<slug>   # flagged and non-verbal takes: what was asked vs what was heard
```

Each new take is transcribed and checked; a failing take is retried (up to 3 tries, the best kept), and `voice` marks lines still above 20% word error with `!`. Read `takes.mjs` and fix every wrong take: the tone read aloud, words added ("Huh,", "Um"), a clipped first word, a laugh that came out as a word. Simplify the tone (a new take), or delete `voices/<id>.wav` and `voices/<id>.json` for a fresh one, then run `voice` again. You can't hear the takes: for the lines the film hangs on, name them (id and file) for the person to listen to. Details: `references/voices.md`.

Voice before the contact-sheet loop: shot lengths come from the real takes, so staging timed on estimates moves. Run `plan` again afterwards.

## 5. The contact-sheet loop

This is where the film gets good. Commands and the full checklist are in `references/review.md`.

```bash
node bin/cinecode.mjs sheet films/<slug>       # middle frame of every shot → films/<slug>/out/sheet.jpg
node engine/film/sheet.mjs films/<slug> films/<slug>/out/s03.jpg --shots=3.1,3.2,3.3,3.4 --cols=2 --tile=640   # one scene, bigger
node engine/film/sheet.mjs films/<slug> films/<slug>/out/s03d.jpg --shots=3.3 --debug                          # boxes, contacts, caption box
node engine/film/sheet.mjs films/<slug> films/<slug>/out/strip.jpg --shots=3.3@0.1,3.3@0.3,3.3@0.5,3.3@0.7,3.3@0.9 --cols=5 --tile=384
```

`--shots=` takes shot ids (with `@u` for a point 0..1 in the shot); `--t=` takes **seconds**, so `--t=2.2` is not shot 2.2.

1. Render a scene's sheet and **look at every tile**. List what's wrong, as `shot: problem → fix`: framing (size, lead room, headroom, cut-off heads), floating (feet above their own shadow when nobody is jumping, a shadow on nothing), hidden subjects (behind a trunk, a front layer, mist, an overlay, the dark), eyes (shut, looking at the wrong person), overlap (two characters drawn into each other), captions (over a face, too long), continuity across cuts.
2. Middle frames hide motion. For every shot with a walk, hop, entrance, camera move or pose change, render a strip of 4–6 frames and check the whole move: where it starts, that it ends where the next shot begins, that nobody slides or pops.
3. Fix `film.json`, re-render only those shots and their neighbours, look again. Repeat until a whole pass finds nothing.
4. `node bin/cinecode.mjs lint films/<slug> --step=0.5` (slow: about a minute for 3½ minutes of film; run it in the background). Read `films/<slug>/out/lint.jpg`. Fix every error and every warning that is a real problem; a warning you keep on purpose goes in the report.

## 6. Custom effects, rigs or kits (only when the story needs them)

When the story needs something the engine lacks (a comet, mist that parts, a reflection, a new sound, a new animal or place), write it in `films/<slug>/custom.mjs`. Read `docs/effects.md` and `DESIGN.md` §4 and §9.1 first: `custom.mjs` may export `custom` (custom beats, `{ "do": "custom", "name": … }`), `overlays` (whole-scene drawings on a layer: sky, back, world, front, grade, screen), `sounds`, `rigs` and `kits`. `films/_test/custom.mjs` is a 50-line example; `films/seventy-six-summers/fx/` is a large one (comet, mist, far hill, reflection, star highlight).

- Match the style: inked wobbly outlines, gouache dabs, cel shading, light from the upper left. Emitted light (a lamp, a comet) goes on the `grade` layer, after the night grade, or it turns grey.
- Deterministic and stateless: draw only from `api.t`, `api.seed`, the params and a seeded `rng()`, never from state kept between calls (workers draw frames out of order). Key timed events off `mark` beats (`api.marks`), not hard-coded seconds.
- Run `check`, then a strip across the shots that use it. Make sure it never covers a character's face or makes a speaker unreadable.

## 7. Music, mix, animatic, render

```bash
node bin/cinecode.mjs music films/<slug>      # the score alone → out/music.wav (to judge the moods)
node bin/cinecode.mjs mix films/<slug>        # score + dialogue + sfx + ambience, ducked and mastered to −16 LUFS → out/mix.wav
node bin/cinecode.mjs animatic films/<slug>   # 12 fps, half size, with sound → out/animatic.mp4 (mixes first if stale)
```

Music comes from scene and shot `music` cues (moods, stings, a `score` motif); footsteps and hops are added automatically. Check the animatic:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 films/<slug>/out/animatic.mp4
ffmpeg -v error -y -i films/<slug>/out/animatic.mp4 -vf "fps=1/4,scale=320:-1,tile=8x8" -frames:v 1 films/<slug>/out/overview.jpg
```

Read the overview (the whole film, one frame every 4 s): the journey, the light and the screen direction should read at a glance. Ask the person to watch the animatic: they can hear it, and it's the cheapest moment for notes. Then render:

```bash
node bin/cinecode.mjs render films/<slug>                       # → out/<slug>.mp4 + out/<slug>.srt (run in the background)
node bin/cinecode.mjs render films/<slug> --from=1:20 --to=1:40  # a full-quality sequence → out/<slug>-80s.mp4
```

`render` voices any missing lines first (with the key) and stops without it. It takes tens of minutes for a few minutes of film (every core works). Its last line (`verify`) is an ffprobe check: size, codec, frame count, fps, duration, audio, subtitles. Grab a few frames from the final file with `ffmpeg -ss <t>` and look at them.

## 8. The report to the person

- The file: `films/<slug>/out/<slug>.mp4` (and the `.srt`), its length, resolution, and how to re-render (`node bin/cinecode.mjs render films/<slug>`).
- What's in it: the logline, the scenes in a line each, the cast (rig and voice), anything custom you built.
- What you changed from their idea or screenplay, and why (substitutions for missing rigs or places, cut lines).
- Known issues, honestly: lint warnings you kept, takes you couldn't get right (ids), shots you'd still improve, lines they should listen to.
- Don't commit, push or publish unless they ask.

## Pitfalls we hit

- **Tone words read aloud.** `[quick, bright, cheeky, sincere, low, slow] Don't stop…` came back as the six adjectives. Long lists, nouns ("grumpy old badger") and stage directions ("voice catching") get spoken. Two or three short adjectives, the line's own delivery last.
- **Direction-only takes.** A take can say the direction instead of the line, or insert "Huh," or "Um" before it; a laugh can come out as "Oh". The QA catches most; `takes.mjs` shows the rest. Never trust a take you haven't read the transcript of.
- **The slow tortoise.** 15 units/s is about 20–30 world px/s: a few hundred pixels is a whole scene. Move it a small step per shot, cut instead of walking (a `place` between shots or scenes hides the distance), and let the quick characters carry the action while it plods (Seventy-Six Summers: the squirrel talks and hops, the tortoise takes a step a shot). `speed` multipliers above about 1.5 make a slow rig scurry.
- **Static two-shots too loose.** A static shot frames everything its subjects do, so two characters far apart (or one walking across) make both tiny. `warnings.mjs` says "they stand too far apart for a full two-shot". Stage them within a body length or two, cut between singles, or push in with `"to"` as they meet.
- **Branches and ground in one shot.** An owl on a branch and a squirrel on the grass: the frame spans both heights and each is tiny (Seventy-Six Summers 2.4: 19% of their single size). Cut between them, or bring the one on the ground up to a perch or a surface near the other.
- **Captions over faces.** Burned-in captions sit in a band at the bottom. The camera keeps the heads it frames above the band, but not everyone is framed: a character missing from `on`, a small one low in an establishing shot, or the action at someone's feet can end up under the caption. Look at every captioned tile; lint's `caption-face` checks speakers only. Fix with `on`, `offset`, a tighter size, or staging further up the ground.
- **Mist and overlays hiding characters.** Height fog, front bands and night grades swallowed the old woman coming down the hill. Check every night and mist shot at full size (`--frame`); add a scene `rim` light, keep key figures in front of the band, or turn the overlay's params down.
- **Shot ids are not times.** `--t=2.2` renders second 2.2. Use `--shots=2.2`.
- **Two editors, one file.** Only one agent edits `film.json`; reviewers report.

## Big films: subagents and workflows

For a film past ~15 shots, split the work. Storyboard scene by scene (a subagent per scene is fine when each gets the screenplay, the staging rules above and its scene's start positions, and returns its scene JSON for you to merge). For review, run parallel reviewers on the same sheets, each with one lens (staging and continuity, camera and framing, acting and eyelines, light and atmosphere, captions and timing, story, sound), reporting `shot | problem | fix | severity` and editing nothing; each renders into its own file names (`out/review-<lens>-s03.jpg`) so they don't overwrite each other. With a workflow tool, fan out one reviewer per lens (or per scene × lens), then a single fixer. Merge, fix, re-render, and run a second round with fresh reviewers on what changed. Prompts and lenses are in `references/review.md`.
