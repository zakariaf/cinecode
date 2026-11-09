# Sound: voices, music, effects and the mix

Everything you hear in a cinecode film is made by code except the voices, which come from Gemini TTS and are cached
on disk. The score is composed and played by a synthesizer, the effects and ambience beds are synthesized, and the mix
is done in JavaScript before ffmpeg's loudness normalization.

```sh
node bin/cinecode.mjs voice films/my-film   # generate missing lines (needs GEMINI_API_KEY)
node bin/cinecode.mjs music films/my-film   # the score alone → out/music.wav
node bin/cinecode.mjs mix films/my-film     # everything → out/mix.wav, mastered to −16 LUFS
```

## Voices

Every `say` line is spoken by one of the 30 prebuilt Gemini voices (model `gemini-3.8-flash-lite-tts`). A film maps
its speakers to voices in `voices` ([storyboard.md](storyboard.md#voices-and-cast)):

```json
"voices": {
  "narrator": { "voice": "Sulafat", "tone": "warm, gentle, unhurried" },
  "pip":      { "voice": "Leda",    "tone": "bright, eager" }
}
```

The voices, with the casting note the engine keeps for each (`VOICES` in `engine/audio/voice.mjs`):

| voice | | character |
|---|---|---|
| `Zephyr` | female | bright, airy, light-hearted young woman |
| `Puck` | male | upbeat, playful, boyish energy |
| `Charon` | male | informative, deep, calm documentary voice |
| `Kore` | female | firm, confident, clear-spoken woman |
| `Fenrir` | male | excitable, quick, eager |
| `Leda` | female | youthful, light, girlish |
| `Orus` | male | firm, steady, grounded adult |
| `Aoede` | female | breezy, relaxed, natural |
| `Callirrhoe` | female | easy-going, friendly, unhurried |
| `Autonoe` | female | bright, articulate, cheerful |
| `Enceladus` | male | breathy, soft-spoken, intimate |
| `Iapetus` | male | clear, plain, trustworthy |
| `Umbriel` | male | easy-going, mellow, warm |
| `Algieba` | male | smooth, polished, gentle |
| `Despina` | female | smooth, warm, poised |
| `Erinome` | female | clear, precise, composed |
| `Algenib` | male | gravelly, rough, gruff old character |
| `Rasalgethi` | male | informative, measured, professorial |
| `Laomedeia` | female | upbeat, lively, curious |
| `Achernar` | female | soft, tender, quiet |
| `Alnilam` | male | firm, strong, authoritative |
| `Schedar` | male | even, level, dependable |
| `Gacrux` | female | mature, grandmotherly, rich |
| `Pulcherrima` | female | forward, bold, expressive |
| `Achird` | male | friendly, kind, approachable |
| `Zubenelgenubi` | male | casual, laid-back, conversational |
| `Vindemiatrix` | female | gentle, calm, soothing |
| `Sadachbia` | male | lively, animated, spirited |
| `Sadaltager` | male | knowledgeable, wise, thoughtful |
| `Sulafat` | female | warm, rich, a natural storyteller |

Names are matched without regard to case. None of the voices is a child's: for young girls the starter uses `Leda`
with "bright, eager" and the demo film `Leda` with "small, high, earnest".

### Tone

A line is sent as `[tone] text`: the bracket is a direction the model should follow, not read. The tone is the
voice's `tone` joined with the line's own `tone` (duplicates dropped), and the first try keeps only the **last three**
descriptors, so the line's own delivery, which comes last, always survives.

**Use delivery adjectives only — nouns get read aloud.** Good: `"dry"`, `"soft, tender"`, `"squeaky, disbelieving"`.
Bad: `"grumpy old badger"`, `"voice catching"`, a list of six adjectives, a stage direction. Those come back spoken
before or instead of the line. Pauses are beats (`"after": 0.6`), not "…" in the text.

When a take reads the direction aloud, the next try sends only the last descriptor, and the one after that no
direction at all (the voice alone carries the line). Such a take can pass with the line's words right and its
delivery gone; `takes.mjs` (below) flags it `TONE-CUT`.

No word is safe every time. Read aloud in the demo film or a test film: "wondering", "hopeful", "certain", "less
sure" (each even as the whole direction), "steady", "simple", "deadpan", "whispering", "gently offended". Never read
aloud there: "soft", "warm", "teasing", "tender", "scared", "grateful", "delighted", "excited", "quiet", "solemn",
"earnest", "breathless". When a tone is read aloud, change the word rather than retrying it.

Made-up names are often misheard by the transcriber ("Glim" came back as "Clem", then "Glem"), which fails a good
take and uses up tries: read what was heard before you redo a take, and prefer names that are real words or names.

Non-verbal lines: a `text` starting with `[` (`"[laughs]"`) is a non-verbal caption. Give the voice something to
say with `tts` (`{ "text": "[laughs]", "tts": "Hahaha!" }`): the caption stays, the voice says the `tts` text.

### QA

Every new take is transcribed by `gemini-3.8-flash` and compared with the line:

- words are compared lowercased, without punctuation or accents (`don't` = `dont`, `7` = `seven` up to twenty);
- a take **passes** when its word error rate is at most 0.2 **and** no words were inserted before the line (a take
  that starts "Huh, …" or "Um, …" fails);
- a take that speaks the direction (inserted before the line, or instead of it) is marked and the direction is
  simplified for the next try;
- a non-verbal line has no words to check: it passes unless a word of the direction is heard (a laugh that comes out
  as "Giggling. Hahaha!" fails).

A line gets up to three takes; the best one is kept (lowest error, with a penalty for inserted words). If the
transcription service fails, the take is kept unchecked. The `voice` command then prints every line (the start of its
id, the speaker, the take's length, its error rate and the text), marks those still above 0.2 with `!` and counts
them.

`node .claude/skills/cinecode/scripts/takes.mjs films/<slug>` lists flagged and non-verbal takes with what was asked
and what was heard, every try of a flagged line, and `TONE-CUT` for a kept take that was sent with less direction
than asked (or none) because earlier tries read it aloud. To fix a take, simplify its tone (that makes a new line), or
delete its two cache files and run `voice` again.

The kept take is trimmed of silence below −45 dBFS (10 ms windows, 60 ms kept around the speech), resampled to 48 kHz
and given short edge fades. Its loudness envelope at the film's fps drives the speaker's mouth (lip sync). A line's
`trimEnd` cuts the end of the take after the cache, with a two-frame fade; timing and lip sync follow the cut.

### The voice cache

Each line is stored in `films/<slug>/voices/` as `<id>.wav` (48 kHz mono, 16-bit) and `<id>.json` (text, voice, tone,
the prompt sent, the models, the QA transcript and error of every take, the envelope). The id is a hash of who speaks,
the voice, the spoken text and the tone, so changing any of them makes a new line; an entry is reused while its text,
voice and tone still match. Two identical lines share one take. A line whose text, tone or voice changes leaves its
old take behind; it is never used again. `takes.mjs` lists those unused takes with the command to delete them, which
is safe (they only cost a request if you change the line back).

Once every line is cached, the film plans, mixes and renders with no network and no key. `plan` uses the real take
lengths (unvoiced lines show an estimate of `words / 2.6 + 0.3` s, marked `~`). `voice` sends only missing lines, two
at a time, retrying on rate limits (HTTP 429), server errors and network errors with exponential backoff. `render`
voices missing lines first when `GEMINI_API_KEY` is set and stops when it isn't; `mix` and `animatic` skip unvoiced
lines with a warning.

`voice` needs `GEMINI_API_KEY` in the environment, even when every line is cached. Keep the key in your shell profile;
don't paste it into files or command lines.

## Music

The score is composed from the film's music cues each time it is rendered (seeded by the film's top-level `seed`, so
it is the same every time). A scene sets a cue with `music` (a mood name or `{ "mood", "intensity", … }`), and a
`music` beat changes the cue, plays a sting or silences the score at that moment
([storyboard.md](storyboard.md#music)). `"music": "none"` fades the score out over 0.3 s.

### Moods

| mood | tempo | meter | mode | sound | default motif voice |
|---|---|---|---|---|---|
| `wonder` | 74 | 4/4 | major | celesta and flute over harp arpeggios, a string and choir pad, glockenspiel sparkle | `celesta` |
| `pastoral` | 100 | 3/4 | major | flute and clarinet over a guitar waltz, pizzicato bass | `bassoon` |
| `tender` | 66 | 3/4 | major | piano and strings, broken piano chords, a cello counter-line, no percussion | `cello` |
| `playful` | 116 | 4/4 | major | staccato clarinet and flute, pizzicato off-beats, glockenspiel doubling | `bassoon` |
| `tension` | 84 | 4/4 | minor | slow harmony over a tonic pedal, a low string pulse, a tremolo cluster, a heartbeat drum | `strings` |
| `chase` | 144 | 4/4 | minor | eighth-note string ostinati accented 3+3+2, kick on 1 and 3, a horn counter-line | `horn` |
| `sad` | 54 | 4/4 | minor | cello and piano, sparse piano chords, strings | `cello` |
| `triumph` | 100 | 4/4 | major | horns in thirds on a fanfare form of the theme, marcato strings, timpani | `tutti` |
| `night` | 56 | 3/4 | major | a lullaby: celesta like a music box with an echo, a warm pad, slow harp | `celesta` |
| `mystery` | 66 | 4/4 | Hungarian minor | a tonic drone, a harp cell, choir, bells | `flute` |

**Intensity** (0..1, default 0.5) brings layers in at phrase boundaries: pad, accompaniment, melody, bass,
counter-line, percussion, doublings. 0.3 is sparse, 0.8 is full.

How cues fit together: music is written in four-bar phrases, and the tempo is nudged (up to ±13%) so a cue's last
tonic chord lands about 3 s before it ends. Consecutive cues of the same mood merge into one continuous cue whose
arrangement follows the intensity changes; different moods crossfade over 1.5 s. Without a score key, each cue picks a
key from its mood's preferred keys, close on the circle of fifths to the previous cue.

### The motif

A film can have a tune of its own, given once in `score`:

```json
"score": { "key": "G", "motif": "D5:1 B4:0.5 D5:0.5 E5:2 G5:3" }
```

`motif` is `note:beats` tokens (`G4:1`, `Bb3:0.5`, `F#5:2`) written in `key` (`"G"`, `"Eb"`, `"F#m"`, `"A minor"`).
With a score, every cue is in the score key and the composed melodies grow out of the motif's opening intervals.
The motif is stored as scale degrees, so in a minor mood it is stated in the minor mode (the A of a C-major motif
becomes A-flat in C minor).

A cue states the motif when asked:

| field on the cue | meaning |
|---|---|
| `motif` | `n`: state the first n notes (`true`: all of them) from the cue's first bar; the cue's own phrases continue after |
| `motifVoice` | `bassoon`, `flute`, `cello`, `horn`, `celesta`, `violin`, `strings`, `music-box`, `tutti` (default: by mood, table above) |
| `hold` | `true`: the last stated note sustains to the end of the cue, over slow chords that all contain it |
| `downbeat` | `true`: bar 1 lands exactly on the cue's start with a struck chord, cutting the previous cue |
| `tempo` | 20–300 bpm instead of the mood's tempo |

The chords under a statement are chosen so every long or strong motif note is a chord tone. A motif cue starts exactly
on its time; the cue before it holds its final chord into the statement only when that chord fits.

A good plan: a few notes of the motif early (`"motif": 3`), quietly, on a solo voice; the full statement saved for
the turn or the ending (`"motif": true`, `"motifVoice": "tutti"`).

### Stings

Short accents placed with their hit exactly on the beat's time, in the key of the music around them, with the score
dipped underneath:

| sting | sound |
|---|---|
| `surprise` | a harp run into a bright pizzicato hit |
| `sad` | a iv → i sigh |
| `triumph` | a horn fanfare on a timpani roll |
| `magic` | celesta shimmer, bell and choir |
| `plunk` | one low pizzicato pluck, a comic full stop |
| `stab` | timpani and brass on open fifths (fits a major or a minor cue) |
| `swell` | a 2.2 s cymbal and timpani roll with strings, cresting at the beat: put it just before a downbeat |

## Sound effects

An `sfx` beat plays a synthesized effect ([storyboard.md](storyboard.md#sfx)). Effects are calibrated to sit under the
dialogue; `gain` scales one, and `params.level` trims it in dB. Each event is seeded by its name, time and shot, so
editing one leaves the others alone.

| name | sound | params |
|---|---|---|
| `footstep-grass`, `footstep-dirt`, `footstep-wood`, `footstep-stone` | one footfall | `weight` 0..1 |
| `hop` | a push-off: a brush of the ground and a breath of air | `weight`, `surface` |
| `land` | arriving from a jump: a body whump and crushed ground cover | `weight`, `surface` |
| `whoosh` | air rushing past | `dur`, `pitch` |
| `splash` | water thrown up and falling back | `size` |
| `plop` | a small thing dropping into water | `pitch` |
| `rustle` | leaves and twigs moving | `dur`, `soft` |
| `thud` | something heavy meeting soft ground | `weight` |
| `pop` | a cork or cheek pop | `pitch` |
| `chime` | struck chime tubes, a little pentatonic run | `notes` (how many), `base` (MIDI note), `down` |
| `sparkle` | a magic twinkle: rising celesta-like pings | `count` |
| `owl-hoot` | owl hoots | `kind`: `horned`, `tawny`, `simple`; `pitch` |
| `birdsong` | one bird's song | `species`: `sparrow`, `tit`, `chaffinch`, `robin`, `blackbird`, `warbler`, `dove`, `cuckoo`, `lark`; `pitch`, `dur` (lark) |
| `cricket` | crickets (continuous) | `kind`: `field`, `tree`; `dur` |
| `frog-croak` | a frog | `kind`: `ribbit`, `croak`; `size` |
| `wind` | wind (continuous) | `dur`, `strength`, `leafy`, `whistle` |
| `stream` | running water (continuous) | `dur`, `busy` |
| `fire` | a crackling fire (continuous) | `dur` |
| `door-creak` | a creaking hinge | `dur`, `close` |
| `bell` | a church or hand bell | `f0` (Hz), `count`, `gap`, `size`, `pitch` |
| `mouse-squeak` | a mouse's squeaks | `count`, `pitch` |
| `songbird-tweet` | a small bird's tweets | `count`, `pitch` |
| `wing-flap` | wingbeats | `flaps`, `size` |
| `knock` | knuckles on a door | `count`, `per` (s between knocks) |
| `woodpecker` | a woodpecker drumming | |
| `anvil` | a smith's hammer on an anvil | `count`, `per` |
| `hum` | someone humming a tune with closed lips | `notes` (`"G4:1 E4:0.5 …"`), `tempo`, `voice`: `child`, `adult`, `elder`; `transpose` |
| `music-box` | a wind-up music box | `notes`, `tempo`, `octave`, `slow` 0..1 (the spring runs down) |
| `gasp` | a sharp intake of breath | `voice`: `child`, `adult`, `elder`; `dur` |
| `sniff` | a wet sniff | `count`, `wet` 0..1, `pitch` |
| `snore` | a snore | `dur`, `pitch` |
| `breath` | breathing, from one quiet breath to panting | `heavy` 0..1, `count`, `dur`, `pitch` |
| `slosh` | wading: water pushed around a body | `dur`, `size` |
| `bubbles` | air escaping under water | `dur`, `size` |
| `wind-swell` | a rising gust, strongest at its end | `dur`, `strength`, `release`, `leafy`, `whistle` |
| `drip` | drops falling from something wet | `count`, `dur` |

Aliases: `footstep` (grass), `squeak`, `tweet`, `flap`, `hoot`, `croak`, `creak` and `gate-creak` (door-creak),
`leaves` (rustle), `bird` (birdsong). Every effect also takes `level` (a trim in dB). A `hum` is treated like a
voice: the score ducks under it (`"params": { "duck": false }` turns that off, `true` ducks the score under any
effect).

A film can add its own sounds in `custom.mjs` ([effects.md](effects.md#sounds)).

### Automatic sounds

You don't write footsteps. Every step of a walk or run plays a footstep for the ground under it (the set's `surface`
and `paths`: grass, dirt, stone, wood), louder for heavier rigs; hops and landings play `hop` and `land`; owls and
songbirds flap when they fly; steps in water splash and wading sloshes. Running on dirt kicks up dust (a visual `fx`).
Sounds are panned by where they happen on screen.

## Ambience

Each scene plays an ambience bed under everything: `"ambience": "auto"` (the default) takes the kit's day or night
bed by the scene's time ([sets.md](sets.md#ambience)), a name forces one, `"none"` is silence.

| bed | what's in it |
|---|---|
| `meadow-day` | a light breeze, a far skylark, three songbirds |
| `meadow-night` | a soft breeze, field crickets, an owl now and then |
| `forest-day` | wind in the leaves, four songbirds, a far cuckoo, a woodpecker |
| `forest-night` | wind in the leaves, tree crickets, a tawny owl, an occasional rustle |
| `stream` | running water, a breeze, two songbirds |
| `village-day` | a breeze, sparrows and garden birds, a far smithy's anvil, distant work, a bell |
| `village-night` | a faint breeze, crickets, an owl, a far door creaking |
| `wind-hill` | strong whistling wind and a far skylark |

Beds never loop (every layer is a seeded process), start already alive, and crossfade over 1 s when the bed changes.

## The mix

`mix` (and `animatic` and `render`, which mix first) builds the soundtrack:

| | |
|---|---|
| dialogue | each line high-passed at 70 Hz and normalized to −20 LUFS, panned up to ±0.3 by the speaker's place on screen |
| music | the score normalized to −27 LUFS, ducked 10 dB under dialogue and hums (attack 0.15 s, release 0.4 s, hold 0.25 s, 0.1 s lookahead) |
| effects | at their calibrated levels × `gain`, with a short outdoor reverb send (0.12) |
| ambience | 1 s equal-power crossfades between beds, dipped 3 dB under dialogue |
| bus | gentle compression (2:1 from −18 dB) and a limiter at −1 dBFS |
| master | ffmpeg `loudnorm` two-pass to −16 LUFS integrated, −1.5 dBTP → `out/mix.wav`, 48 kHz 24-bit stereo |

`out/music.wav` is the score alone (48 kHz 24-bit) for judging the moods. Lines without a voice yet are skipped with
one warning, so a film can be mixed (and an animatic made) before it is voiced. The mastering step runs `ffmpeg` from
`PATH`.
