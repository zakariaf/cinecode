# Voices: casting, directions, fixing takes

Voices are the only part of a film that comes from a model: Gemini TTS (`gemini-3.8-flash-lite-tts`), checked by transcribing each take with `gemini-3.8-flash`. Everything is cached in `films/<slug>/voices/<id>.wav` + `<id>.json`, so a voiced film re-renders with no network and no key. The id hashes who + voice + spoken text + tone: change any of them and that line gets a new take.

## The 30 prebuilt voices

From `VOICES` in `engine/audio/voice.mjs`. No voice is a real child: for a child, use Leda (or Laomedeia, Zephyr) with a "small, high" tone.

| voice | | character |
|---|---|---|
| Zephyr | F | bright, airy, light-hearted young woman |
| Puck | M | upbeat, playful, boyish energy |
| Charon | M | informative, deep, calm documentary voice |
| Kore | F | firm, confident, clear-spoken woman |
| Fenrir | M | excitable, quick, eager |
| Leda | F | youthful, light, girlish |
| Orus | M | firm, steady, grounded adult |
| Aoede | F | breezy, relaxed, natural |
| Callirrhoe | F | easy-going, friendly, unhurried |
| Autonoe | F | bright, articulate, cheerful |
| Enceladus | M | breathy, soft-spoken, intimate |
| Iapetus | M | clear, plain, trustworthy |
| Umbriel | M | easy-going, mellow, warm |
| Algieba | M | smooth, polished, gentle |
| Despina | F | smooth, warm, poised |
| Erinome | F | clear, precise, composed |
| Algenib | M | gravelly, rough, gruff old character |
| Rasalgethi | M | informative, measured, professorial |
| Laomedeia | F | upbeat, lively, curious |
| Achernar | F | soft, tender, quiet |
| Alnilam | M | firm, strong, authoritative |
| Schedar | M | even, level, dependable |
| Gacrux | F | mature, grandmotherly, rich |
| Pulcherrima | F | forward, bold, expressive |
| Achird | M | friendly, kind, approachable |
| Zubenelgenubi | M | casual, laid-back, conversational |
| Vindemiatrix | F | gentle, calm, soothing |
| Sadachbia | M | lively, animated, spirited |
| Sadaltager | M | knowledgeable, wise, thoughtful |
| Sulafat | F | warm, rich, a natural storyteller |

Seventy-Six Summers cast: narrator Vindemiatrix "gentle, warm, unhurried"; old tortoise Algenib "old, gravelly, slow, dry"; squirrel Puck "quick, bright, cheeky"; old woman Sulafat "elderly, warm, wry"; girl of six Leda "small, high, earnest"; owl Enceladus "drowsy, clipped, dry". Give two characters who talk to each other clearly different voices (pitch, pace, gender).

## Writing directions (tones)

The request is `[<voice tone>, <line tone>] <text>`. The bracket is meant to be a silent direction, but the lite model reads it aloud whenever it looks like words to say. The engine joins the voices-block tone with the line tone, drops duplicates and keeps the **last three** descriptors on the first try (then only the last one, then none).

- **Short delivery adjectives only**: "dry", "soft, tender", "teasing", "squeaky, disbelieving", "flat". Two or three words at most per line.
- **No adjective is safe every time.** Read aloud in our films, some even alone: "wondering", "hopeful", "certain", "less sure", "steady", "simple", "deadpan", "whispering". Never read aloud so far: "soft", "warm", "teasing", "tender", "scared", "grateful", "delighted", "excited", "quiet", "solemn", "earnest", "breathless". When a word gets read, change the word (Glim's "wondering" → "soft" took first time).
- **Made-up names cost tries.** The transcriber mishears them ("Glim" → "Clem", "Glem": two failed takes of a good reading). Read what was heard before redoing; a real word or name is safer.
- **One-word lines and homophones fail the check.** "Ours." was heard as "hours", "Hours." and "Walrus" on all three tries (WER 1.0, `!`); "Ours, then." passed first time. Give a lone word, or a word that sounds like another, a word of context.
- **Slow voices run long.** Before voicing, `plan` estimates `words / 2.6 + 0.3` s a line. A gruff or slow voice, or two sentences in one line, can double it: Algenib ("gruff, low") took 3.76 s over "The last strawberry. Mine!" (estimate 1.84 s), with a 0.64 s pause between the sentences. Leave slack in a short film, and re-time after `voice`.
- **No nouns, no stage directions, no sentences**: "grumpy old badger", "voice catching", "half asleep", "to himself", "nodding off" all risk being spoken. Seen live: `[quick, bright, cheeky, sincere, low, slow] Don't stop. I'll tell her you're coming.` came back as just "quick, bright, cheeky, sincere, low, slow".
- **Keep the voices-block tone short too** (2–3 words): it is prepended to every line, so its words eat the three-descriptor budget.
- **One emotion per take.** A line that turns ("I'm not coming." … "I'm coming.") is two `say` beats with their own tones.
- **Pauses come from timing, not punctuation**: put `"after": 0.8` on the next beat. No leading or trailing "…" or "—" in the spoken text.
- **Numbers as words** ("seventy-five") in the text. The transcriber may answer with digits ("75"), which raises the WER of a perfect take: read the transcript before you redo it.
- **Non-verbal sounds** (laughs, sniffs, gasps): caption `"text": "[laughs]"`, spoken `"tts": "Hahaha!"`, tone a single word like "giggling" or "chuckling". The QA can't hold a laugh to words; it only checks that no direction word was heard. Code sounds (snore, gasp, sniff, breath, hum) are `sfx` beats instead, with `"caption": "[snores]"` if you want it captioned.
- **A line cut off mid-word**: voice the whole sentence in `tts` and cut it with `"trimEnd": <s>`; the caption ends with "—". Lip sync follows the cut.

## Fixing takes

1. `node bin/cinecode.mjs voice films/<slug>` prints every line with its duration and WER, `!` when WER > 0.2.
2. `node .claude/skills/cinecode/scripts/takes.mjs films/<slug> --all` prints, for every line, the exact prompt, what the transcription heard, the take's length against the estimate, and any pause of 0.35 s or more inside it; for a flagged line also every try. Without `--all` it prints only flagged and non-verbal lines. Flags: FAIL, WER, DIRECTION (tone read aloud), LEADING (inserted words such as "Huh," or "Um"), MISSING, TONE-CUT (earlier tries read the tone aloud, so the kept take was sent with less direction, or none: the words pass, the delivery may be flat). `voice` prints `wer 0.00` for a TONE-CUT take; only `takes.mjs` shows it.
3. What counts as wrong even when it passed: an inserted filler word, a clipped first word ("promised" for "I promised."), a laugh transcribed as a word ("Oh"), a take much longer than the words need (a spoken direction or a sigh), the wrong emphasis on the line the scene hangs on.
4. Fix: change or simplify the tone (that alone gives a new id and a new take; fix every TONE-CUT this way), or delete `voices/<id>.wav` and `voices/<id>.json` for a fresh take with the same direction, then run `voice` again. For the lines the film hangs on, ask the person to listen (you can't): name the id and the file.
5. Re-run `plan`: shot lengths follow the real takes, so staging that was timed against estimates may now be off (a walk that ends after the line, a look that lands late). Re-check those shots on the contact sheet.
6. Old takes stay in `voices/` after a line's text or tone changes; they are never used. `takes.mjs` lists them with an `rm` command; deleting them is safe.
