# Seventy-Six Summers

## Logline

A hundred-year-old tortoise has one day left to cross the valley and keep a promise. He made it to a six-year-old girl the last time the comet came, seventy-six years ago. A fast-talking squirrel rides along on his shell, sure that she has forgotten. Neither of them knows that she has climbed the hill to wait for him every summer since.

## Theme

A promise is a road walked from both ends. Pebble walks from spring to the night of the comet to keep his word. Nell keeps a promise she never said out loud: she has climbed the hill every summer for a lifetime so that he would never arrive at an empty hill. In the end neither of them reaches the other's end of the road. They meet halfway.

Three lines from the prologue come back later with new meanings:
- "I'll be here." becomes "I'm here." He says it halfway down the slope, so "here" now means wherever she is.
- "Don't be late." becomes "You're late."
- "I'm a tortoise." is first a child's joke and later his answer to seventy-six years.

## Characters

### Pebble, the old tortoise (lead)
- **Rig:** tortoise, elder preset. The prologue uses the young preset of the same rig.
- **Look (today):** 1.35× the default scale. Shell dark olive-umber `#4B4630`, scute seams `#2E2A1C`, moss patches `#6E8B3D`, pale scuffs `#7A7056`. Skin grey-green `#8C8A6E`. Amber eyes with heavy lids, 60% closed.
- **The star:** a pale five-point marking he was born with, never paint. It is one decal, off-centre on the rear-left scute, in ivory `#EDE6D0`, half under moss. Its opacity is 35% by day and rises to about 55% at night so it still reads under moonlight.
- **Look (prologue, 76 years younger):** 0.4× scale, pebble-sized beside the girl, which is why she named him Pebble. Warm amber shell `#9A6B32`, the star crisp at 100%, skin `#A7A47F`.
- **Poses:** to sit, he uses the lie/rest pose with his belly on the ground, and `shellTop` follows the pose. Tortoises can barely look up, so lifting his head is slow and takes effort.
- **Walk:** 1.3 s per step, a head bob, and a pause on every fourth step. One list of footfall events drives both the rig and the score.
- **Personality:** he never doubts the plan, only his legs. He uses few words, weighs each one and delivers it deadpan. His tenderness shows only in the length of his pauses.
- **Voice:** **Algenib**, gravelly. Generate at a natural slow pace of about 120–130 wpm with the style prompt "old, dry, unhurried, few words". The weight comes from 0.6–1.2 s of edited silence before his lines. Check that "tortoise" is said TOR-tus and "tortoises" TOR-tuh-siz, and regenerate any take that drifts. **Young Pebble:** first prompt Algenib with "younger, lighter, same dry delivery", then apply a formant-preserving shift of no more than +2 semitones at about 1.08× speed, so he is still recognisably the same voice.

### Fidget, the squirrel (he)
- **Rig:** squirrel.
- **Look:** red-orange fur `#C8562A`, cream belly `#F1DEC0`, ear tufts, tail 1.35× the default. Two extra states, changing colour and scale only with no new drawings: **wet** (fur `#8E3C1E`, tail scaleY 0.45, flat as a wet paintbrush) and **puffy** (tail scale 1.6). Idle: a tail flick every 1.2–1.8 s and a head twitch. When he is hurt, he uses the stock worried or sad expressions rather than an ear angle.
- **Personality:** the comic engine. He is fast, cocky and sure the old shell will fail. He calls Pebble "boulder" and then "Old Shell". At the wayside Pebble tells him off without a word, and from then on he is the film's cheerleader and messenger. He runs ahead to announce his friend, not to win anything, and when he gets there first he steps aside. He undercuts every sincere moment, including his own.
- **Voice:** **Puck**, upbeat and rapid-fire. His sincere lines (6.3, 7.3, and "I'm coming." in 10.3) are separate takes, lower and slower. 6.3 uses a whispered style prompt; check that it comes out as a real whisper and not just breathy.

### Nell, elder (82)
- **Rig:** human elder woman.
- **Look:** silver hair `#D9D6D0` in a loose bun (the stock bun, or the nearest stock style). Round glasses with thin brass frames and one small glint highlight on the near lens. The moss-green fringed scarf `#5E7B3F`, which fits her now. Oatmeal cardigan `#CDBFA3`, long dusty-blue skirt `#5F6F8C`, walking shoes. Warm tan skin `#C99A72`. A tear highlight (one extra eye highlight, no drop) for 9.7.
- **Movement:** every pose change is blended, never popped. Standing up from sitting takes 2.0 s. Sitting down goes stand, crouch, sit in one eased 2.5 s blend. Walking downhill uses 0.6× stride with a slight forward lean.
- **Personality:** warm and wry, with a six-year-old's laugh still underneath. She is not sentimental about her own faithfulness and treats it as common sense.
- **Voice:** **Sulafat**, warm. A/B test against **Gacrux** (mature) with the style prompt "elderly woman, slightly creaky, wry", and keep whichever sounds 82 rather than 40.

### Young Nell (6, prologue only)
- **Rig:** human child, in the stock ground sit.
- **Look:** dark-brown braids `#3B2A20` (or the nearest stock style). The same moss-green scarf at the longest stock length, so it trails in the grass. Ochre smock dress `#D9A441`, barefoot. Same skin tone as elder Nell.
- **Ghost variants for the time-lapse only:** teen and adult Nell.
- **Personality:** earnest, bossy, delighted.
- **Voice:** **Leda**, youthful. No Gemini voice is a child, so lock this voice before anything else, because the prologue is the hook and the 9.8 laugh depends on it. First test the style prompt "a six-year-old girl, small, serious". Then raise the pitch +3 semitones, raise the formants about 10% and speed it to 1.05×. A/B this against a formant-preserved +3–4 semitone version.

### Hollis, the owl
- **Rig:** owl, perched on the low branch of the meadow tree. Needs a one-eye-open lid.
- **Look:** tawny plumage `#8A6A45` with cream bars and ruffled crown feathers.
- **Personality:** a bone-dry pedant who only wants to sleep. He takes a joke literally and corrects it exactly, gives the travellers the film's clock to get rid of them, and falls asleep mid-word.
- **Voice:** **Enceladus**, breathy. Drowsy, clipped, academic. He never raises his voice.

### The Frog (cameo, non-speaking)
- **Rig:** frog on the frog rock, green `#6F8F3A`. He stares, turns his head, and croaks once (a code SFX).

### Narrator
- **Voice only:** **Vindemiatrix**, gentle. A grandparent reading at bedtime. Speaks twice: one line at the start and one at the end.

### Rig and kit asks (all small; nothing else is new)
- **Tortoise:**
  - a `shellTop` anchor where Fidget can perch or lie flat. Hops blend him from world space into shell space along the arc, so he never pops.
  - a star decal with an opacity parameter.
  - young (0.4×) and elder (1.35×) scale and colour presets.
  - a dark wet-shell tint that fades, plus drips off the rim.
- **Human:**
  - Nell at four ages: child, teen, adult and elder. The teen and adult are used only for the ghosts.
  - pose interpolation for the elder, blending stand to crouch to sit and back over 2.0–2.5 s with easing. Confirm the rig already supports this, or build it.
  - a glasses glint (one highlight) and a tear highlight.
  - braids, bun and scarf length taken from the customisation library, using the nearest stock version if one is missing.
- **Squirrel:** wet and puffy states, changing colour and tail scale only.
- **Owl:** one-eye-open lid.
- **farHill (shared component):**
  - contains the hill, the standing stone, `shadowLine(dayT)` and a `stoneLight` mask on the stone.
  - placed in every daytime scene at 4%, 7%, 11%, 20% and 55% of frame height.
  - check that the meadow's forest edge and the wayside's big tree do not hide the stone.
  - in the village edge it replaces the far background.
- **Village edge:**
  - the gate as its own layer with a hinge. The swing is a horizontal scale and skew around the hinge, and the gate is unlatched.
  - a surface anchor on top of a fence post.
  - the lantern's lit state, with bloom that rises as ambient light falls.
  - a pressed-grass trail (a darker tint stroke) running from the gate up the hill.
- **Stream:**
  - a reflection pass: a flipped render with a sine-wave ripple displacement.
  - a front water band that hides everything below the waterline, for the wade.
- **Valley:** a foreground band at medium scale for the tracking shots. Confirm that the kit has five parallax layers.
- **Hill at night:**
  - the moon as the key light.
  - mist built as height fog plus a front band, with a radial parting (see Locations).
- **Render passes:**
  - comet rim light on every rig.
  - the ink-lift dissolve.
  - the memory-plate grade.
  - fireflies (an existing effect).
- **The comet, the film's one new element:**
  - a white-gold nucleus, a coma `#FFF3D6`, a pale-blue ion tail `#9FC8FF` and a gold dust tail `#FFD38A`, all built from particles with bloom on mist and cloud.
  - a brightness curve: a dim smudge until `bloomFrame`, then one eased rise.
  - most of the effects budget goes here.

## Locations and times

The whole film is one continuous day driven by a single parameter, `dayT`: 0 at dawn, 1 at full night. The kit presets act as keyframes, and the grade is interpolated between them, never switched. The hill is the visual clock. The `farHill` component sits on the horizon of every daytime scene and grows larger each time, so viewers can follow the journey with the sound off.

| # | Location (kit) | Time | dayT | Far hill (share of frame height) | Purpose |
|---|---|---|---|---|---|
| 1 | Hill crest (hill) | Night, 76 summers ago, then a time-lapse to today's dawn | memory plate, then 0.00 | is the hill | The two locked compositions, PROMISE WIDE and PROMISE TWO-SHOT, in the storybook-plate grade |
| 2 | Meadow | Dawn | 0.03 | 4% | Pebble meets Fidget. Hollis gives the clock. |
| 3 | Stream | Noon | 0.40 | 7% | The stones he ignores, the comet glint in the reflection, the wade, the frog |
| 4 | Wayside | Afternoon | 0.55 | 11% | "Then I'll remember for both of us." |
| 5 | Valley | Golden hour | 0.70 | 20% | Vast parallax. The shadow line climbs toward the stone. |
| 6 | Village edge, with `farHill` as the far plane | Sunset into twilight | 0.78 → 0.86 | 55%, looming behind the cottage | The empty-house fake-out, the clue, the figure on the crest |
| 7 | Hill slope | Twilight | 0.87 → 0.90 | stone tip above the mist | The climb |
| 8 | Hill crest | Early night | 0.91 | n/a | Nell alone at the stone |
| 9 | Hill slope | Night | 0.92 → bloom → 1.0 | stone tip above the mist until the bloom | The reunion |
| 10 | Hill crest | Night | 1.0 | n/a | The locked-frame rhyme and the rise into the stars |

**The clock in code.**
- `shadowLine(dayT)` is the height of the blue shadow climbing the hill.
- `stoneLight(dayT)` is the gold sliver on the stone. The stone is the highest point, so it keeps the light after the valley goes dark, exactly as Hollis says.
- `bloomFrame` is the last frame of the measured "I'm here." take plus 16 frames. It is computed once from the measured timeline and never hard-coded. Its planned value is about 2:34.6, roughly frame 3710.
  - The `dayT` keys for scenes 7–9 are solved so that `stoneLight` reaches 0 on that frame and no other.
  - The mist parting, the comet's scale and brightness, and bar 1 of the triumph cue all read the same value.
  - The score is generated backward from it.

**Sun direction (one rule for scenes 4–8).** The travellers walk left to right, toward the hill. The sun moves behind them and sets at frame left. The face of the hill looks toward the sun, so it stays lit while the valley floor goes into shadow, and the shadow line climbs the hill from below. The stone keeps the last gold. The sun is never shown setting behind the hill.

**Night lighting.**
- **Before the bloom:**
  - The key is the moon, upper right, cool.
  - The comet is a dim smudge upper left that warms the mist from behind. This is the glow the 9.1–9.2 silhouettes stand against.
  - An invisible local fill sits on each character until 9.11, when the fireflies take over as fill.
  - The star decal is at about 55% and gets a moon highlight in 9.3.
- **At the bloom:** the comet becomes the key, upper left. The rim-light pass lights every figure, at least 2–3 px wide even at extreme-wide scale.

**Mist.** The mist is height fog, not a fixed layer. Each layer and each character gets a fog amount from its height on the slope, plus a separate front mist band. That is how Fidget (7.3, 8.2, 9.1) and Nell (8.3, 9.1) can disappear into the mist and step out of it. At the bloom, the parting is a radial displacement of the same noise field, with one origin: the stone.

**Grades.**
- **Memory plate:** saturation 0.55, a warm sepia lift, a heavy vignette, paper grain and a deckled page-edge mask. All of these interpolate to 0 during the time-lapse.
- **Prologue comet:** bright but muted by the plate, so the finale comet always reads brighter than the memory.

**Locked compositions.**
- **PROMISE WIDE** is used in 1.1, 1.6, 1.7 and 10.4. It is checked with three figures at the stone for 10.4.
- **PROMISE TWO-SHOT** is used in 1.2, 1.5, 8.1 and 10.2.
  - It is designed around the elder cast: Nell seated at adult height, Pebble at 1.35×, and Fidget on the shell, with headroom and no overlap.
  - The young cast sits on the same marks and looks small in the frame. That is the point.

## Music plan

**One motif, stored once as data, used everywhere.** It is the Promise motif in C major.

```js
const PROMISE = [
  { note: 'G4', beats: 1   },
  { note: 'E4', beats: 0.5 },
  { note: 'G4', beats: 0.5 },
  { note: 'A4', beats: 2   },  // the question: all day, the music stops here
  { note: 'C5', beats: 3   },  // the answer: heard once in the prologue, withheld until the bloom
];
// Tempo is set per cue. Every statement is generated from this array: the hums,
// bassoon, flute, cello, horns, celesta, the ostinato, the violin and the tutti.
```

**The hums are synthesised in code, not by TTS.** Each hum is a tone sequence from `PROMISE` passed through a closed-mouth "mm" formant filter, with vibrato and breath noise. There are child and elder settings, and an optional short TTS breath onset can be layered on top for character. For lip sync the hums are marked as closed-mouth.

The audience hears the complete five-note tune exactly once at the start, hummed by a child. From then until the bloom they hear only the first four notes, so the tune hangs on A. The fifth note returns at the bloom.

| Scene | Mood | Motif | Stings and notes |
|---|---|---|---|
| 1 Prologue | wonder | Young Nell hums all five notes (diegetic, synthesised, about 100 bpm), landing on C before the cut. In the time-lapse a music box plays only notes 1–4 and slows down. Where C should come, a rising wind takes its place. | The wind cuts to dawn birdsong. |
| 2 Meadow | pastoral, then playful | Bassoon plays four notes locked to Pebble's footfalls. One step is one beat (about 46 bpm): G on step 1, E and G on step 2, and A held across steps 3–4 and the pause. | A contrabassoon snore crossfades out of Hollis's cut-off "away". |
| 3 Stream | playful, then mystery | Solo flute plays four notes over the reflection, and the comet glint lands on its A. | A bassoon slides down as the shell goes under. A pizzicato plunk and the frog's croak come before "Don't ask." |
| 4 Wayside | tender | Solo cello plays four notes under "Then I'll remember for both of us." | None. |
| 5 Valley | pastoral, then chase | Horns play the four notes broadly. | Timpani and brass stab on "Since spring?!", then a pizzicato chase drive. |
| 6 Village edge | chase decaying, then **total silence**, then mystery and tender | The score cuts out at the gate (6.1), leaving only wind and the creaking gate. A celesta enters very softly when the lantern shows (6.5). Its four notes land on the POV of the figure (6.6) and the A holds through 6.8. | None. |
| 7 Climb | tension and night | A low-string ostinato built from the motif, its tempo locked to Pebble's footfalls. It slows as he slows and stops when he stops. Glockenspiel twinkles as the stars appear. | It accelerates into chase when Fidget bolts, then restarts slowly on Pebble's next footfall. |
| 8 Crest | night | Nell hums four notes (diegetic, synthesised, elder setting, 72 bpm) and stops on A. | A pizzicato flurry as Fidget pulls up, and a held breath on her gasp. |
| 9 Reunion | tender, then **triumph**, then tender | Violas hold a pedal A from 9.1 through "Hello, Pebble." and "I'm here." On `bloomFrame` the full orchestra lands C (bar 1 of the triumph cue). A solo violin plays all five notes under "empty hill." Celesta arpeggios for the fireflies. | **The bloom downbeat is `bloomFrame`**, computed from the measured audio (planned about 2:37.4 is superseded; the planned value is now about 2:34.6). The pedal is placed backward from it. |
| 10 Ending | night, then triumph and wonder | The full orchestra plays the complete motif under the crane-up. | The final chord resolves on C under the title. |

## Screenplay

**Conventions**
- **Captions and TTS text:**
  - Every spoken line is captioned. Bracketed captions mark non-verbal sound only, and sparingly: [hums], [laughs], [snores], [croak], [gate creaks], [gasps], [sniffs].
  - Each line is stored as `{caption, tts, style, padBefore, takes}`. The quoted text is both the caption and the TTS text unless a `tts:` override is given.
  - TTS text never contains all-caps words, bracketed sounds, or leading or trailing ellipses or dashes. Pauses come from `padBefore`, never from punctuation.
  - `(pad n s)` means n seconds of silence inserted before a take.
- **Takes and post:**
  - A line that changes emotion is split into separate takes, each with one direction.
  - A line that is cut off mid-word is generated in full and truncated in post with a 2-frame fade, and the lip sync follows the cut audio.
  - Take counts: 8–12 for the hinge lines ("Then I'll remember for both of us.", "Hello, Pebble.", "I'm here.", "I just couldn't let you…") and 3–5 for comic lines. Pick by both feel and duration.
  - Laughs, the gasp and the sniff are separate short takes, with code-generated breath and noise as fallbacks. The snore is a contrabassoon and the croak is a code SFX.
- **Timing pipeline:**
  - Generate and measure all TTS first, then build the EDL, with shot length = max(action, audio + pads).
  - The durations below are planning estimates: Pebble about 125 wpm plus edited silences, Fidget about 5 syllables/s, and Nell, Hollis and the narrator about 3.2 syllables/s.
  - The planned running time is 208 s (3:28) at 24 fps. The hard cap is 3:30.
- **If the measured cut runs over 3:30,** trim holds that have no dialogue, in this order:
  1. 10.4 music-only crane −1.0 s
  2. 5.1 −0.5 s
  3. 7.1 −0.5 s
  4. 6.1 −0.5 s
  5. 2.1 −0.5 s
  6. 10.1 −0.5 s
  7. 9.12 −0.5 s
  8. 1.6 −0.5 s

  Never trim the hum in 1.5, the still hold in 9.1, the silence before "I'm here.", or the post-bloom hold in 9.5 below 4.5 s. If the cut comes in under 3:20, give the time back to 9.1 and 9.5.
- **Captions on screen:** each stays up for at least 1.2 s and carries across a cut when needed. The position is fixed, with a soft dark backing at night.
- **Faces and lip sync:**
  - Expressions drive only brows, eyes and cheeks. During speech the mouth follows the visemes, and the laughing mouth is used only in silence.
  - Expression changes blend over 6–8 frames.
  - Beaks and muzzles (tortoise, owl, squirrel) use a loudness envelope. Human mouths use a simple vowel and closed-mouth classifier.
- **Close-ups:**
  - Outline width stays constant on screen, with mild zoom compensation.
  - Background layers blur.
  - The rigs carry eye highlights, scute seams, fur strokes and moss decals that hold up at 6×.
- **Photosensitivity:** no more than 3 full-frame brightness changes per second anywhere in the film. The bloom is one eased rise.
- **Render budget:** comet particles, bloom and mist fields render at half resolution and are scaled up. The bloom budget is spent on 9.5 and 10.4.

**Adaptation notes (fixes applied)**
- **Kept from earlier rounds:**
  - The forest path is cut, and Hollis sits on the meadow tree's low branch.
  - The only parenting is Fidget on `shellTop`.
  - The prologue and finale use identical locked compositions.
  - One motif stored as data drives the score, with silence at the cottage.
  - The star is a natural marking, and Fidget is "he" throughout.
  - There is no race framing anywhere: no finish line, no rival, nobody to beat.
- **This revision:**
  - **Timing:** rebuilt from speaking rates. The edit is built from measured takes, and `bloomFrame` is derived, never hard-coded.
  - **Prologue:**
    - 1.5 is lengthened so the whole hum fits.
    - The time-lapse is resampled (seasons as tint, a sky that averages into a smooth colour once the cycling gets fast, 8 ghosts) and is photosensitivity-safe.
    - Young Pebble is pebble-sized.
  - **The clock is honest:**
    - one sun direction.
    - Hollis is exactly right ("seventy-five years early for the next comet").
    - we watch the last gold leave the stone.
  - **Stream:** the doe is cut, and Pebble wades the stream himself.
  - **4.2:** Pebble supplies the missing fact ("She showed me the last one.").
  - **Village edge:** the gate becomes a clue, and the turn gets Pebble's silent reaction close.
  - **Reunion:** it breathes. Fidget steps aside, there is a held two-shot, a longer silence before "I'm here.", and a held bloom.
  - **"Pebble?!":** it has a reason. He is first called "boulder", and the beat is staged as a double take.
  - **Ending:** both comic buttons stay. There is one concrete narration line and the meteors are cut. The end card is honest about the voices.
  - **Cutbacks:** every view is side-on. The hums are synthesised in code. New poses, props and effects are cut back to the asks list.

| Scene | Location | Time code | Duration |
|---|---|---|---|
| 1 | Hill crest, the past | 0:00–0:27.5 | 27.5 s |
| 2 | Meadow | 0:27.5–0:53.5 | 26.0 s |
| 3 | Stream | 0:53.5–1:06.5 | 13.0 s |
| 4 | Wayside | 1:06.5–1:24.0 | 17.5 s |
| 5 | Valley | 1:24.0–1:34.5 | 10.5 s |
| 6 | Village edge | 1:34.5–1:58.0 | 23.5 s |
| 7 | Hill slope | 1:58.0–2:08.0 | 10.0 s |
| 8 | Hill crest | 2:08.0–2:19.0 | 11.0 s |
| 9 | Hill slope | 2:19.0–3:06.0 | 47.0 s |
| 10 | Hill crest | 3:06.0–3:28.0 | 22.0 s |

---

### SCENE 1 — HILL CREST — NIGHT, SEVENTY-SIX SUMMERS AGO (0:00–0:27.5)
*Grade: storybook plate. Music: wonder.*

**1.1 — EXTREME WIDE, establishing ("PROMISE WIDE", locked composition 1) — fade up from black over 12 frames, slow 4% push-in — 4.0 s**
- Action: The standing stone sits right of centre on the crest. The hill falls away to the left toward a dark valley. A comet hangs upper left, bright but muted by the plate grade, its tail sweeping over the stone. Two small shapes sit at the foot of the stone.
- NARRATOR [gentle, bedtime-slow]: "Once in a long life, a star with a tail comes back."
- Note: the voice-over starts at frame 4. If the measured take runs long, it carries over into the silent first second of 1.2.
- SFX: crickets, soft night wind.
- FX: twinkling stars, drifting comet-tail particles.

**1.2 — MEDIUM ("PROMISE TWO-SHOT", locked composition 2) — static — 4.5 s**
- Action: YOUNG NELL sits against the stone, her scarf trailing in the grass. YOUNG PEBBLE rests beside her: amber, bright, no bigger than a loaf of bread, his star crisp. She points up at the comet as she speaks, then turns to him.
- YOUNG NELL [small, earnest]: "When it comes back, will you be here?"
- Action: Pebble looks at the comet, then at her.
- (pad 0.7 s)
- YOUNG PEBBLE [steady]: "I'll be here."

**1.3 — CLOSE: Young Nell, comet light on her face — 1.5 s**
- YOUNG NELL [solemn]: "Promise?"

**1.4 — CLOSE: Young Pebble — 1.5 s**
- YOUNG PEBBLE [simple]: "Promise."

**1.5 — MEDIUM, PROMISE TWO-SHOT — static — 8.5 s**
- Action: She narrows her eyes at him.
- YOUNG NELL [stern, bossy]: "Don't be late."
- (pad 0.4 s)
- YOUNG PEBBLE [deadpan]: "I'm a tortoise."
- Action: She laughs [laughs]. Still laughing, she points at the comet and then at the star on his shell (one in the sky, one on his back), and laughs again [laughs].
- Action: She settles back against the stone and hums the whole tune, all five notes, at about 100 bpm, landing on C just before the cut [hums]. The hum is synthesised and her mouth stays closed.

**1.6 — EXTREME WIDE, PROMISE WIDE (identical to 1.1) — locked — 4.0 s — THE TIME-LAPSE**
- Action: The girl and the little tortoise fade out like ink lifting off a page. The comet dims and slides away.
- Sky: the first few days and nights turn slowly, under 2 per second. As the years speed up, the sky stops cycling and becomes a smooth, drifting average colour, so no full-frame brightness change happens more than 3 times per second.
- Seasons: shown only as a palette tint on the grass (green, gold, pale, green), sampled about once per second, so each visible cycle stands for many years. There are no snow particles.
- The lichen on the stone is a slow tint ramp. The grade bleeds from the faded plate into full gouache colour.
- Rewatch reward: on 8 sampled summers, a figure in a green scarf sits at the stone for 5 frames at about 30% opacity, never in focus. She appears as a child, a child, a teen, a teen, a woman, a woman, an older woman, and finally an old woman. The old woman is held for 8 frames, still out of focus, as the time-lapse slows into dawn.
- Music: the hum becomes a music box that plays notes 1–4 and slows down. Where C should come, a rising wind takes its place.
- SFX: the wind swell cuts to birdsong.

**1.7 — EXTREME WIDE, PROMISE WIDE — dawn, today — static — 3.5 s**
- Action: The same frame in full colour, in a pink dawn. The stone is empty. A faint smudge of comet hangs low in the sky.
- TITLE fades in above the stone over 1.0 s, holds, and fades out: **SEVENTY-SIX SUMMERS**.

---

### SCENE 2 — MEADOW — DAWN (0:27.5–0:53.5)
*Grade: pink-gold dawn, ground mist. The far hill is a speck on the horizon (4%), clear of the forest edge. Music: pastoral, then playful.*

**2.1 — WIDE, establishing — slow pan right — 3.0 s**
- Action: The forest edge, the big tree with its low branch, the old mossy stump. HOLLIS sleeps on the low branch with FIDGET perched beside him.
- Action: From frame left, very slowly, a huge mossy shell enters: PEBBLE, now a hundred, his star faded to a ghost. He takes one step, then after a long pause another.
- Action: Fidget drops from the branch onto the stump, right in his path.
- SFX: heavy, slow footfalls, a rustle of grass.
- Music: the bassoon plays four notes in time with his steps.

**2.2 — MEDIUM: Fidget on the stump, Pebble plodding toward it — static — 4.5 s**
- FIDGET [bright, rapid-fire]: "Morning, boulder! Where you headed?"
- Action: Pebble doesn't stop.
- (pad 0.6 s)
- PEBBLE [slow, gravel]: "The standing stone. Tonight."

**2.3 — FULL: Fidget on the stump — static, the speck of hill already in frame — 3.0 s**
- FIDGET [delighted]: "At this speed? You'll get there next spring!"
- Action: He flops belly-down on the stump, laughing [laughs].

**2.4 — MEDIUM: Hollis on the low branch, Fidget on the stump below — static — 4.5 s**
- Action: Hollis doesn't open his eyes.
- HOLLIS [bone-dry, drowsy]: "Then he'll be seventy-five years early for the next comet."
- Action: Fidget sits up, startled, and looks up at him.

**2.5 — CLOSE: Hollis — 4.0 s**
- Action: One eye opens and slowly travels down to Pebble while he speaks.
- HOLLIS [pedantic, correcting homework]: "When the standing stone goes dark, the comet blooms."

**2.6 — MEDIUM: Hollis — 3.0 s**
- Action: The eye closes and his head droops.
- HOLLIS [drifting off]: "Take the stream. Now kindly go aw—"
  - tts: "Take the stream. Now kindly go away." Cut it inside "way", then pitch-drop and stretch the vowel and crossfade it into the snore.
- [snores]. Sting: contrabassoon snore.

**2.7 — WIDE: Fidget and Pebble — tracking with Pebble — 4.0 s**
- Action: Fidget looks from the owl to the far hill, then to Pebble, who has moved about one shell-length. He hops onto the shell, blending into `shellTop` along the arc, and settles in.
- FIDGET [friendly]: "Got a name, Old Shell?"
- (pad 1.0 s)
- PEBBLE: "Yes."
- Action: Fidget waits for more. Nothing comes. Pebble plods on. (Hold 1.0 s before the cut.)

---

### SCENE 3 — STREAM — NOON (0:53.5–1:06.5)
*Grade: bright noon, shimmering mist over the water, sparkles. The far hill is a little larger (7%). Music: playful, then mystery.*

**3.1 — WIDE, establishing — static — 4.0 s**
- Action: Stepping stones, set far apart. A frog sits on the frog rock. Pebble stands at the bank studying the first gap, which is wider than he is long. Fidget leans out over the front of the shell and points at the stones like a backseat driver.
- FIDGET [cheerful, useless]: "Easy! Big step!"
- (pad 0.6 s)
- FIDGET [less sure]: "Bigger step."
- (pad 0.6 s)
- FIDGET [doubtful]: "Much bigger step."
- SFX: burbling water.
- FX: sparkles, mist.

**3.2 — CLOSE, side-on: the water's edge — 2.5 s**
- Action: The bank edge runs across the frame. Above the waterline, Pebble's head is in profile, looking down. Below it lies his mirrored head and a mirrored sky, rippling in a slow sine wave. A tortoise can barely look up, so the water shows him the sky. For a few frames, timed with the flute's A, the comet glints in the reflected sky and nowhere else. He looks at it for a long moment.
- Music: solo flute, four notes.

**3.3 — MEDIUM, side-on: the wade — static — 3.5 s**
- Action: Pebble ignores the stepping stones and walks straight into the water beside them, down along the stream bed. The water climbs his legs, then his shell. Fidget scrambles up and stands on tiptoe at the very top of the shell as it sinks. The shell goes under.
- Action: All that is left above the surface is a squirrel, chin-deep, tail held high, gliding steadily across the stream. The frog's head turns to follow him.
- SFX: a long slosh, bubbles.
- FX: splash, splash rings.
- Music: a bassoon slides down.

**3.4 — FULL: the far bank — HARD CUT — static — 3.0 s**
- Action: Pebble stands on the far bank with water streaming off his shell. The shell is darkened by the wet tint, which slowly fades, and drips fall from its rim. Fidget sits on top, soaked in the wet state, his tail flat as a wet paintbrush. The frog stares at them [croak]. A beat.
- FIDGET [flat, dripping]: "Don't ask."
- FX: drips, splash rings.
- Sting: pizzicato plunk.

---

### SCENE 4 — WAYSIDE — AFTERNOON (1:06.5–1:24.0)
*Grade: warm dappled light. The sun is behind them at frame left, and long shadows stretch right toward the hill (11%, visible past the trunk). A few falling leaves. Music: tender.*

**4.1 — WIDE, establishing — 1.5 s**
- Action: The big old tree beside the path. Pebble rests in its shade, eyes half closed. Fidget sits on the ground at the base of the trunk, dry now, his tail puffed up in the puffy state.

**4.2 — MEDIUM two-shot — slow push-in — 6.0 s**
- FIDGET [casual]: "So who's at the stone?"
- (pad 0.8 s)
- PEBBLE: "A girl."
- (pad 0.8 s)
- PEBBLE: "She showed me the last one."

**4.3 — CLOSE: Fidget — 4.0 s**
- Action: His eyes flick up and down as he counts.
- FIDGET [working it out]: "Seventy-six years?"
- Action: His tail droops.
- (pad 0.4 s)
- FIDGET [careful, kinder than he means to be]: "Old Shell, humans forget."
- Action: He stops himself and glances at Pebble.

**4.4 — CLOSE: Pebble — 4.0 s**
- Action: Pebble opens his eyes.
- (pad 0.6 s)
- PEBBLE [quiet, final]: "Then I'll remember for both of us."
- Music: solo cello, four notes.

**4.5 — WIDE — 2.0 s**
- Action: Pebble gets up and walks on without waiting. Fidget stays at the base of the trunk for a beat, watching him go, then runs after him.

---

### SCENE 5 — VALLEY — GOLDEN HOUR (1:24.0–1:34.5)
*Grade: low gold sun at frame left, behind them. Long shadows reach toward the hill (20%). Haze. Music: pastoral, then chase.*

**5.1 — EXTREME WIDE — five-layer parallax drift — 3.0 s**
- Action: The whole painted valley. Two specks cross the gold grass: a shell and a red-orange dot. Far off on the hill, the standing stone glows in the last sun while a blue shadow line creeps up the slope beneath it.
- Music: horns play four notes, broadly.
- FX: light rays, drifting sparkles.

**5.2 — MEDIUM, side-on — tracking on the foreground band — 3.0 s**
- Action: Fidget runs ahead on the ground, stops, and sits up to wait.
- FIDGET [idle]: "How long you been walking?"
- (pad 0.5 s)
- PEBBLE [not breaking stride]: "Since spring."

**5.3 — MEDIUM pushing to CLOSE — tracking — 4.5 s**
- Action: Fidget's mouth falls open (surprised expression, not speaking). He turns to look at the hill. The shadow line has climbed further.
- FIDGET [stunned, incredulous]: "Since SPRING?!" (tts: "Since spring?!")
- Sting: timpani and brass stab.
- (pad 0.3 s)
- FIDGET [all in, rapid-fire]: "Okay. Feet! All four of them! Go, go, go!"
- Action: He runs ahead and back, ahead and back, like a sheepdog.
- Music: chase.

---

### SCENE 6 — VILLAGE EDGE — SUNSET INTO TWILIGHT (1:34.5–1:58.0)
*Grade: amber dimming continuously to blue. The sun sets at frame left. The hill rises behind the cottage (55%), its face toward the sun and its stone still holding gold.*

**6.1 — WIDE, establishing — static — 3.0 s**
- Action: The cottage at the foot of the hill, with its fence, gate, well, garden, bench and lantern post. The unlatched gate swings in the wind [gate creaks]. The windows are dark and the bench is empty. Pebble and Fidget come along the fence, and Pebble stops at the gate.
- Music: **the score cuts out completely.** Only the wind remains.

**6.2 — MEDIUM: Fidget on the fence-post top, Pebble at the gate — 3.5 s**
- FIDGET [bright, hopeful]: "Is this her house?"
- Action: Pebble nods slowly. He looks at the dark windows and the empty bench, and lowers his head.

**6.3 — CLOSE: Fidget on the fence post, worried — 2.0 s**
- FIDGET [whispered, low and slow]: "I'm sorry."
- Hold in silence.

**6.4 — FULL: Pebble — 3.0 s**
- Action: Pebble lifts his head.
- PEBBLE [low, plain]: "I promised."
- Action: He turns from the cottage toward the hill and walks on anyway. Fidget hops down and stares after him.

**6.5 — WIDE — 4.0 s**
- Action: The sun sinks below the valley rim at frame left. The yard falls into blue shadow while the face of the hill above still holds gold.
- Action: With the glare gone, the lantern's flame shows. It was lit all along, so someone lit it today.
- Action: From the swinging gate, a trail of pressed grass leads away up the hill: she has only just gone out. One firefly lifts off the lantern and drifts up along the trail, and Fidget's eyes follow it.
- FX: the lantern's bloom rises as the ambient light falls.
- Music: a celesta enters, very soft.

**6.6 — EXTREME WIDE: Fidget's POV up the hill — slow push-in, ending at about 2× — 3.0 s**
- Action: High on the crest beside the standing stone sits a tiny figure: a simplified silhouette with one saturated fleck of moss-green scarf. The last sliver of gold slides up the stone toward its tip.
- Music: four notes on the celesta, landing on A.

**6.7 — MEDIUM: Fidget and Pebble — 3.0 s**
- Action: Pebble is a few steps ahead, still walking toward the hill.
- FIDGET [breathless]: "Old Shell."
- (pad 0.6 s)
- FIDGET [breathless]: "Look."
- Action: Pebble stops. Slowly, with effort, because a tortoise is not built to look up, he lifts his head.

**6.8 — CLOSE: Pebble — no line — 2.0 s**
- Action: His eyes lift to the crest, and a tiny gold point (the stone's last light) catches in his eye highlight. A long pause. One slow blink.
- Music: the celesta holds A. Otherwise silence and wind.

---

### SCENE 7 — HILL SLOPE — TWILIGHT (1:58.0–2:08.0)
*Grade: deep blue. Stars switch on one by one. A mist band (height fog plus the front band) lies across the upper slope. Key light: the moon, upper right. The comet is a dim smudge upper left. Music: tension and night.*

**7.1 — WIDE, side-on — horizon in the bottom third, the slope a diagonal rising to the top of frame — static — 2.5 s**
- Action: Pebble starts up the long slope from lower left, with Fidget at his side. Above the mist at upper right only the tip of the stone shows, holding a thin gold sliver. Stars blink on.
- Music: a low-string ostinato locked to his footfalls. Glockenspiel twinkles.

**7.2 — MEDIUM, side-on — tracking — 3.0 s**
- Action: His steps get slower, then slower still, and he stops.
- SFX: heavy breathing.
- Action: Fidget looks from Pebble up to the stone. The sliver is shrinking.
- Music: the ostinato slows with him and stops when he does.

**7.3 — CLOSE two-shot — 4.5 s**
- FIDGET [sincere, low and slow, for the first time]: "Don't stop. I'll tell her you're coming."
- Action: He runs straight up the slope, and the fog swallows him as he climbs.
- FX: dust.
- Music: chase, accelerating, then gone.
- Action: Pebble is alone in the frame. A beat. He takes one more step, and the ostinato starts again on his footfall.

---

### SCENE 8 — HILL CREST — NIGHT (2:08.0–2:19.0)
*Grade: early night, full colour. Moon key from upper right, a faint afterglow low at frame left, the comet a dim smudge. The stone's very tip still holds a thread of gold. Music: night.*

**8.1 — MEDIUM, PROMISE TWO-SHOT (identical to 1.2) — static — 4.0 s**
- Action: NELL, 82, sits against the stone exactly where the girl sat, in her glasses and the same moss-green scarf. Beside her, where the little tortoise sat, there is only grass. She looks up at the sky and hums four notes, stopping on A as she always does [hums]. The hum is synthesised and her mouth stays closed.

**8.2 — FULL — 3.0 s**
- Action: Fidget bursts out of the mist onto the crest. He pulls up hard in a lean, with a spray of dust, panting.
- FIDGET [breathless, overjoyed, panting]: "He's coming! He's very slow, but he's coming!"
- FX: dust.
- Music: a pizzicato flurry as he stops.

**8.3 — CLOSE widening to FULL — 4.0 s**
- Action: Nell gasps [gasps]. Over 8 frames her face blends from surprised to happy: brows up, eyes wide, a slight lift of the head, seventy-six years younger.
- Action: She rises in a blended 2.0 s rise, then walks down into the mist with small, careful steps. Fidget races ahead of her down the slope.
- Music: a held breath on her gasp.

---

### SCENE 9 — HILL SLOPE — NIGHT (2:19.0–3:06.0): THE SIGNATURE MOMENT
*Music: tender, a held A. Light until the bloom: moon key, local fill, and the comet's dim glow behind the mist.*

**9.1 — WIDE, mid-slope — static — 5.0 s**
- Action: Pebble climbs alone, very slowly, lower left. At upper right, above the mist, the tip of the stone still shows its shrinking sliver of gold.
- Action: Fidget bursts down out of the mist, sees Pebble and stops dead. Then he steps aside, off the path and into the long grass. This last stretch isn't his.
- Action: A beat later, a figure in a scarf comes carefully down out of the mist, the fog thinning off her as she descends. They see each other. Both stop.
- Hold: a still two-shot on the dark slope for 1.5 s, two silhouettes against the faintly glowing mist.
- Music: violas hold A, the unresolved fourth note.

**9.2 — FULL, side-on, silhouettes against the faintly glowing mist — 4.0 s**
- Action: Nell walks the last few steps and lowers herself into the grass beside him (stand, crouch, sit) in one eased 2.5 s blend. Fidget watches from the grass, out of the way.
- Action: Above them, the gold sliver on the stone tip is almost gone.

**9.3 — CLOSE, side-on: the faded star on the shell — 3.5 s**
- Action: The shell's scutes fill the lower two-thirds of the frame: moss, scuffs, and the ghost of a five-point star caught by a moon highlight. Nell's profile leans in from frame right, tilted no more than 20°, with one glint on her near lens. She finds the star and smiles.
- (pad 0.4 s)
- NELL [soft, as if no time had passed]: "Hello, Pebble."

**9.4 — CLOSE: Pebble, looking up at her — 2.5 s**
- (pad 1.4 s after "Hello, Pebble.")
- PEBBLE [simple, the gravel gone soft]: "I'm here."
- Cut 2 frames after the line ends.

**9.5 — THE BLOOM — opens CLOSE on the stone tip above the mist, slow pull-back to EXTREME WIDE — 5.5 s**
- Action: The shot opens 14 frames before `bloomFrame` on the tip of the stone and its last thread of gold. We watch the gold go out.
- Action, on `bloomFrame` (planned about 2:34.6, computed from the measured take):
  - `stoneLight` reaches 0.
  - The mist parts radially outward from the stone.
  - The comet blooms across the whole sky, its gold and blue tails flaring over the stone, in one eased brightness rise.
- Music: the full orchestra lands C, the first complete statement of the motif since the prologue.
- Action: Over about 3 s the camera pulls back to the extreme wide and holds. Comet light rims three tiny figures on the slope. The starfield brightens.
- FX: comet particles with bloom on the mist.

**9.6 — MEDIUM three-shot — 4.0 s**
- Action: Fidget creeps back out of the grass and settles by Pebble's head. He looks at the huge mossy shell, at Pebble's face, back at the shell, and back at the face: a double take.
- FIDGET [squeaky disbelief]: "PEBBLE?!" (tts: "Pebble?!")
- (pad 0.9 s)
- PEBBLE [deadpan, his eyes never leaving her]: "She was six."

**9.7 — CLOSE: Nell — 2.0 s**
- Action: She is laughing silently, with a tear highlight in her eye. The laughing mouth closes before she speaks.
- NELL [teasing, voice catching]: "You're late."

**9.8 — CLOSE: Pebble — 2.5 s**
- (pad 0.5 s)
- PEBBLE [deadpan]: "I'm a tortoise."
- Off-screen, Nell laughs [laughs], the six-year-old's laugh still in there. Mix: under the first half of Sulafat's laugh, layer the young-Nell laugh from 1.5, pitched down about 2 semitones at −10 to −12 dB, and crossfade it out. The laugh spills into 9.9.

**9.9 — MEDIUM two-shot, comet above — slow push-in — 5.0 s**
- NELL [light, almost confessing]: "I've climbed up here every summer. In case you got the year wrong."
- Action: Pebble turns his head to look at her.

**9.10 — CLOSE: Pebble — 3.5 s**
- (pad 0.5 s)
- PEBBLE [gently offended]: "Tortoises don't get the year wrong."

**9.11 — CLOSE: Nell — 6.5 s**
- NELL [tender, steady]: "I know."
- (pad 0.8 s)
- NELL [tender, steady]: "I just couldn't let you walk all this way to an empty hill."
- Action: Behind her, the first fireflies lift out of the grass and become the fill light.
- Music: a solo violin plays all five notes.

**9.12 — WIDE — slow crane up — 3.0 s**
- Action: Fireflies rise around them in staggered waves toward the comet's tail. Fidget hops up onto the shell (the hop blends him into `shellTop`), sniffs loudly [sniffs] and turns his face away so no one can see.
- Music: celesta arpeggios.

---

### SCENE 10 — HILL CREST — NIGHT (3:06.0–3:28.0)
*Light: the comet is the key, rim-lighting every figure. Music: night, then triumph and wonder.*

**10.1 — WIDE, slope — dissolve in — 2.0 s**
- Action: Under the comet, the three of them climb the rest of the way together. Nell matches her small steps to Pebble's, and Fidget lies flat across the shell.

**10.2 — MEDIUM, PROMISE TWO-SHOT (identical to 1.2 and 8.1) — static — 6.0 s**
- Action: Nell sits against the stone where the girl sat. Pebble rests beside her, belly to the grass, where the young tortoise sat. Fidget lies flopped on the shell. The comet is in the same place in the sky as in the prologue, now in full colour.
- NELL [twinkly, teasing, not wistful]: "Same time next comet?"
- (pad 1.0 s)
- PEBBLE [dry]: "I'll start walking tomorrow."
- Action: Nell laughs [laughs].

**10.3 — CLOSE: Fidget, flat on the shell — 3.5 s**
- FIDGET [flat, exhausted]: "I'm not coming."
- (pad 1.2 s)
- FIDGET [quiet, certain]: "…I'm coming." (tts: "I'm coming.")

**10.4 — EXTREME WIDE, PROMISE WIDE (identical to 1.1) — 1.5 s hold, then crane up into the stars — 7.0 s**
- Action: The film's first picture returns in full colour, now with three figures at the stone instead of two, each a distinct rim-lit silhouette. The camera rises, and the fireflies rise with it to meet the comet's tail.
- NARRATOR [gentle, smiling], over the hold: "And this time, nobody climbed the hill alone."
- Action: After the line, the crane plays on music alone.
- Music: the full orchestra plays the complete motif.

**10.5 — TITLE over the stars — 3.5 s**
- **SEVENTY-SIX SUMMERS** settles into the dark space where the tail fades. The final chord resolves on C.
- At 1.5 s, the end card fades in small beneath it: "Drawn, animated and scored entirely in code. Voices: Gemini TTS."

---

**Totals:** 51 voiced lines: 49 dialogue lines (Fidget 22, Pebble 12, Nell 6, Young Nell 3, Young Pebble 3, Hollis 3) and 2 narration lines. In addition there are 2 hums synthesised in code and 7 non-verbal takes (laughs, a gasp, a sniff). Planned running time is 208 s (3:28) at 24 fps; the final value is measured.

## The signature moment

This is shots 9.1–9.5, then 9.11–9.12. It plays almost silently, and every beat reads with the sound off.

1. **9.1 The messenger steps aside.** Fidget gets there first, stops dead, and gets out of the way. Two old shapes stop on a dark slope and hold still. The orchestra has thinned to a single held A, the note the whole day's music has stopped on. The audience has heard this tune unfinished for more than two minutes without being told why. Above the mist, the gold sliver on the stone is shrinking: they are not at the stone, and the clock is still running.
2. **9.2 She sits down beside him.** There is no hand business, only a slow, eased lowering into the grass. Her care is the acting. Above them the gold is almost gone.
3. **9.3 The star.** In the prologue the girl pointed from the comet to the star on his back. Here it is how she recognises him, half under moss. Her profile leans in, one glint on her glasses, and she says "Hello, Pebble." quietly.
4. **9.4 "I'm here."** It comes after 1.4 s of silence, the longest pause he takes all film. These are his first words to her, and they answer "I'll be here." from 76 years earlier. He says them halfway down the hill rather than at the stone, because she walked down to meet him.
5. **9.5 The bloom.** We open on the stone and watch its last thread of gold go out. Then the mist parts, the comet opens across the sky, and the orchestra finally plays the fifth note. Hollis's rule from the meadow comes true at the exact moment the promise is kept, halfway down the hill. In code this is one value, `bloomFrame`, computed from the measured "I'm here." take. The stone light, the mist, the comet and bar 1 of the triumph cue all read it.
6. **9.6–9.8 The laugh before the tear.** A double take from the boulder of a shell to his face, then "Pebble?!" / "She was six." / "You're late." / "I'm a tortoise." This pays off "Morning, boulder!", the name gag from the meadow ("Got a name?" "Yes."), the pebble-sized tortoise of the prologue, and both prologue lines.
7. **9.11–9.12 The tear, then the undercut.** "I just couldn't let you walk all this way to an empty hill." The fireflies lift like sparks rising to meet the comet. Fidget sniffs and turns away, so the film never sinks into sentiment.

## Ending and final image

They climb the rest of the way together, at his pace. The film then returns to its two locked compositions.
- **PROMISE TWO-SHOT:** the old woman sits where the girl sat, the old tortoise rests where the young one did, and the comet hangs in the same place. Seventy-six years have passed only through parameters: scale, grade, hair colour, moss, and the light of the star decal.
- **The last exchange stays bright and funny:**
  - "Same time next comet?" borrows Hollis's phrase, and "I'll start walking tomorrow." answers "Since spring." Nobody remarks that they would be 158 and 176 by the next comet. Never add a line that says so; it works only if the audience notices it on their own.
  - Fidget's "I'm not coming." / "…I'm coming." gives the skeptic his final turn.
- **PROMISE WIDE:** the first frame of the film returns in full colour, with three figures at the stone instead of two. The narrator speaks one line, "And this time, nobody climbed the hill alone.", which answers her "every summer" and his walk since spring. Then the camera rises into the stars on music alone.

**Final image:** the comet's tail stretches across a sky full of stars, and fireflies rise from the hill to meet its tip. The title SEVENTY-SIX SUMMERS settles into the dark space where the tail fades, with the end card beneath it: "Drawn, animated and scored entirely in code. Voices: Gemini TTS." The last chord resolves on C, the note the film held back all day.