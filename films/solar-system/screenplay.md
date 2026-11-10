# Our Solar System

<!-- One continuous family film of about 15 minutes, made with cinecode. It grows out of the 90 s Saturn chapter
     (films/saturn): the same hill, telescope, Nell, Gran and narrator, and its Saturn material is Part 8 here.
     Facts checked 2026-11-10 against NASA pages; every spoken or shown claim is in the facts table at the end. -->

## Logline

On a clear night a girl asks about a bright "star", and her questions carry her and her Gran on an imagined journey
from the Sun out past Pluto, until home is a single blue dot, and then back to their hill as the Sun comes up.

**Theme:** the farther you look, the more precious home is. Curiosity is the telescope.

**Lines and images that come back with a new meaning**

- "That's not a star, love. That's Saturn." (Part 0) → Gran's "evening star" (Part 3) → Herschel thought Uranus was "a
  comet, or a star" and Nell: "Just like me and Saturn!" (Part 9) → at dawn Nell says it herself: "Gran, that's not a
  star. That's Venus." (Part 12).
- "But the Sun's gone." (Part 0: no, the Earth has turned our side away from it) → "And that's our side, in the dark!"
  (Part 4) → "We turned back round to the Sun!" (Part 12, at sunrise).
- **How old would I be?** (the recurring game; Nell is eight): thirty-three on Mercury (Part 2), just over four on Mars
  (5), a first birthday at nearly twelve on Jupiter (7), not even one on Saturn (8), and on Neptune nobody has lived
  one year, "not even Gran" (10). Every number is worked out in the facts table.
- **How long sunlight takes** (the scale ladder): eight minutes to Earth (1), eighty minutes to Saturn (8), four hours
  to Neptune (10), on average five and a half hours to Pluto, and a whole day to Voyager 1 (11); at dawn: "that light left it
  eight minutes ago" (12).
- **The shrinking Sun:** the Sun's glow at the left of every space shot shrinks part by part as we go out (true to
  distance, table below), from a blaze at Mercury to one bright star at Pluto.
- "Are we nearly at Saturn?" (Mars) / "Is that Saturn?" (Jupiter) → "Saturn! At last!" (Part 8).

## Characters

### Nell, a girl of eight (lead)
- **Rig:** `human`, `age: child`; the chapter's look: curly dark hair `#2e211a`, warm brown skin `#b98262`, mustard
  jumper `#e0b040`, navy trousers `#3a4f7a`, red scarf `#c8443a`.
- **Personality:** quick, delighted, cheeky; asks the next question before the last answer has landed; learns as she
  goes and by the end names a planet herself.
- **Voice:** `Leda`, tone "small, bright".
- **Age:** exactly eight here (the chapter said "about seven"): the "how old would I be?" game needs one number.

### Gran, her grandmother
- **Rig:** `human`, `age: elder`; the chapter's look: white bun `#e4e0d8`, glasses, plum cardigan `#7a4a6a` over a
  cream top `#efe6d4`, long skirt `#2f3e5c`.
- **Personality:** calm, dry, amused; knows a lot and lets Nell find things out; remembers the first moonwalk.
- **Voice:** `Gacrux`, tone "warm, gentle" (line tones one word each; "soft" was once read aloud, "tender" took).

### Narrator
- **Voice:** `Charon`, tone "warm, calm". Speaks only in space, and only facts; often amused, never a lecture.

### The worlds (`planet` rig, `body` preset, at the `space` kit's perches)
- Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Titan, Uranus, Neptune, Pluto, Charon. Sizes are true
  wherever two bodies share a shot (ratios from `radiusOf`, given in each shot); a planet alone is framed as needed.
- An asteroid: a `planet` with `body: mercury` (grey, cratered), `ob` 0.62, `roll` 0.5: an egg-shaped rock.

### Props, places and effects
- The **telescope** rig on the **hill** kit; the **space** kit.
- Built-in effects: `eyepiece`, `starstream`, `sunglow`, `skydot`, `orbit`, `sizerow`, `moonlets`, `debris`.
- From the Saturn chapter (`films/saturn/effects/`, to be shared): `sunbeam` (sunlight as a growing beam) and
  `ringfield` (the rings' ice and rock).
- New: `orrery` (a top-down map of the orbits, Parts 2 and 11). See "Pieces cinecode doesn't have" at the end.

## Locations and times

| # | Part | Location (kit) | Time | Anchors | What happens | Length |
|---|---|---|---|---|---|---|
| 1 | 0 | Gran's hill (`hill`) | `night` | crest x 2080–2480 | "What's that bright star?"; where the Sun goes | 50 s |
| 2 | 0 | Space (`space`) | `space` | `centre` | through the eyepiece; flight toward the Sun | 17 s |
| 3 | 1 | Space | `space` | `centre`, `east` | the Sun | 1:23 |
| 4 | 2 | Space | `space` | `west` → `east`, `centre` | Mercury; the orrery race | 55 s |
| 5 | 3 | Space | `space` | `centre`, `east` | Venus | 1:13 |
| 6 | 4 | Space | `space` | `centre`, Moon at z 2400 | Earth | 33 s |
| 7 | 4 | Gran's hill | `night` | as scene 1, Nell at the eyepiece | "Hello, Gran!" | 17 s |
| 8 | 4 | Space | `space` | `west`, `east`, `centre` | the Moon | 31 s |
| 9 | 5 | Space | `space` | `centre` | Mars | 1:09 |
| 10 | 6 | Space | `space` | `centre` | the asteroid belt | 49 s |
| 11 | 7 | Space | `space` | `centre` | Jupiter | 1:25 |
| 12 | 8 | Space | `space` | `centre` | Saturn | 1:29 |
| 13 | 9 | Space | `space` | `centre` | Uranus | 1:01 |
| 14 | 10 | Space | `space` | `centre` | Neptune | 50 s |
| 15 | 11 | Space | `space` | `centre`, `east` | Pluto, the Kuiper Belt, the zoom out, the blue dot | 1:30 |
| 16 | 12 | Gran's hill | `night` → `dawn` (shot times) | crest, as scene 1 | home; sunrise | 1:00 |

**Length target:** 15:00–15:45 with the cards (open card 3.5 s, end card 4 s). **Estimate: 15:12** (1,495 spoken
words in 161 lines ≈ 10:40 of speech at 140 words a minute, plus 0.4 s between lines, 0.5 s at the end of each of the
62 shots, and the pictures, pauses and moves listed under each part). The chapter's real takes ran faster than 140 a
minute (its space scene: 111 words and all its pictures in 54 s), so if the voices come back quick, hold the listed
picture beats longer (shot `hold`s, slower moves) rather than adding lines.

**The shrinking Sun (sunglow core radius `r`, fraction of the frame height, ∝ 1 / distance; Earth's view = 0.12).**
Always at the frame's left (screen direction: outward is left to right, the Sun behind us on the left).

| Mercury | Venus | Earth & Moon | Mars | Belt | Jupiter | Saturn | Uranus | Neptune | Pluto |
|---|---|---|---|---|---|---|---|---|---|
| 0.31 (×2.6) | 0.17 | 0.12 | 0.08 | 0.045 | 0.023 | 0.013 | 0.006 | 0.004 | 0.003 |

From Uranus out the glow is a single bright star with a small halo. (The chapter's Saturn shots had a big glow at the
left edge; here Saturn's Sun is much smaller, to keep the ladder true.)

## Music plan

**Motif** (the chapter's): `G4:1 B4:0.5 D5:0.5 G5:2 F#5:1 D5:2` in `G`: wonder, Nell's question. Stated on `celesta`
on the hill; in full on `strings` at the launch (2.2); on `flute` over Earth (6.1); on `celesta` again through the
eyepiece at Jupiter (11.4, the hill's own instrument); in full on `strings` when Saturn arrives (12.1, the payoff);
slow on `music-box` at the blue dot (15.5); in full on `tutti` at sunrise (16.4), `hold` under the end card.

| Part | Mood | Motif | Stings and sound |
|---|---|---|---|
| 0 Opening | `night` 0.3 → `wonder` 0.55 at the launch | celesta; strings in full at 2.2 | crickets (`meadow-night`), `wind-hill`; `wind-swell` into the flight |
| 1 Sun | `wonder` 0.5, big | | `swell` at the reveal (3.1); `pop`s for the first nine Earths |
| 2 Mercury | `playful` 0.45, quick (`tempo` up) | | `whoosh` as Mercury races past |
| 3 Venus | `mystery` 0.3 → `tension` 0.35 under the heat (5.3) → `playful` 0.35 (5.4) | | low rumble (`hum`) under the cloud dive |
| 4 Earth & Moon | `tender` 0.35; the hill: crickets only; the Moon: `wonder` 0.35 | flute over Earth | `pop`s for the Earths in a row |
| 5 Mars | `playful` 0.4 | | |
| 6 Belt | `chase` 0.7 (10.1) → `"music": "none"` with a `plunk` sting (10.2) → `mystery` 0.2 | | `whoosh` rocks past the lens |
| 7 Jupiter | `triumph` 0.5 → `wonder` 0.35 at the eyepiece → `playful` 0.35 for the cake | celesta through the eyepiece | `swell` as Jupiter rises |
| 8 Saturn | `wonder` 0.45 rising to 0.6 at arrival | strings, in full, at 12.1 | `wind-swell` on the flights; `pop`s |
| 9 Uranus | `tender` 0.3 (Gran's story) → `playful` 0.3 for the scarf | | |
| 10 Neptune | `mystery` 0.2, sparse; 3 s of near silence at the start | | |
| 11 Pluto and beyond | `wonder` 0.35 → `tender` 0.3; silence for the dot, then the motif | music-box, slow, at the dot | |
| 12 Home | `night` 0.2 → `tender` 0.3 → full at sunrise, `hold` under the end card | tutti, in full, at sunrise | crickets fade out, one `birdsong` at the sunrise |

## Screenplay

**Conventions**
- Every spoken line is captioned. VO = voice over (the speaker is not in the picture); O.S. = off screen (in the
  scene, out of the frame). Neither is a tone. In space, Nell and Gran are always VO: they are on the hill, imagining.
- Tones are delivery adjectives only, joined to the voice's own tone (only the last three words are sent). Avoid
  "soft" and "wondering" (both have been read aloud).
- Shot ids are `<scene>.<shot>`, the same in `film.json`. Durations are estimates until the voices exist.
- Numbers are captioned as digits and spoken as words: give `tts` for years ("seventeen eighty-one", "sixteen ten",
  "nineteen ninety", "twenty twenty-six"). Listen to "Uranus" (YOOR-uh-nus) and "Kuiper" (KY-per) takes.

## Part 0 — Opening on the hill

**Estimate 1:07** (93 words ≈ 40 s; line gaps and shot holds ≈ 10 s; the 3.5 s title card, the 6 s establishing shot,
Nell's walk to the eyepiece, the eyepiece view and the flight ≈ 17 s). Music: `night`, the motif on celesta; `wonder`
at the launch.

### Scene 1: Gran's hill, night

**Starting places** (as the chapter): the telescope at x 2080 facing left, its tube up-left over the downslope; Nell at
x 2320 facing left; Gran in front of the standing stone at x 2480 facing left. Saturn is a steady golden point up-left
(`skydot`, the chapter's); the moon is up-right.

**1.1** establishing, slow push-in toward wide. The hill under the Milky Way, the standing stone, two small figures and
the telescope on the crest. No words: crickets, wind, the motif on celesta.

**1.2** close on Nell against the sky, static. She looks up, then points up-left into the open sky.
NELL (curious): "Gran, what's that bright star?"

**1.3** medium on Gran, static, Nell at the left of frame. She looks where Nell points, and smiles.
GRAN (amused): "That's not a star, love. That's Saturn."
NELL (O.S., curious): "How can you tell?"
GRAN (warm): "See how it shines so steady? Stars twinkle. Planets don't."

**1.4** close on Nell, static: she looks up at the steady point, then turns to Gran, eyes wide (`surprised`).
NELL (amazed): "A real planet? Can we go there?"

**1.5** full on Nell, Gran and the telescope, static.
GRAN (gentle): "Let's imagine we can. But let's go the long way round."
(pad 0.4 s)
GRAN (playful): "We'll start in the middle, with the Sun."
NELL (puzzled): "But the Sun's gone."

**1.6** medium on Gran, static. She points down at the ground (`point-down`): the Sun is down there, round the far
side of the world.
GRAN (warm): "It hasn't gone anywhere. The Earth spins, and right now our side is facing away from it."
NELL (O.S., delighted): "So it's round the other side!"

**1.7** full, static. Gran beckons toward the telescope; Nell steps up to the eyepiece (x 2172, facing left) and
bends to it; Gran comes to x 2350 behind her.
GRAN (tender): "Have a look."

### Scene 2: Space, through the eyepiece (cut)

**2.1** POV through the eyepiece (`eyepiece`, pinned at 0, `scope: shot`): black, a round view; Saturn small in its
middle (scale 2.5, as the chapter), rings open, Titan a tiny orange dot beside it.
NELL (VO, excited): "It's got rings!"
GRAN (VO, playful): "Later. Sun first. Hold on tight."

**2.2** the round view opens to the whole frame (`eyepiece` `open`) and the camera pans left, away from Saturn, which
slides out of frame right. Stars stream out of a vanishing point at the left (`starstream`, fx 0.15, fy 0.45, speed
1.6) where a small warm glow is waiting (`sunglow` x 0.15, y 0.45, r 0.05). The motif in full on strings.
NELL (VO, thrilled): "We're flying!"

## Part 1 — The Sun

**Estimate 1:23** (145 words ≈ 62 s; gaps and holds ≈ 9 s; the reveal, the dolly back, the row of Earths, the pan and
the beam ≈ 12 s). Music: `wonder`, big; a `swell` at the reveal. The narrator's first words in the film.

### Scene 3: Space, the Sun (cut)

**Starting places:** the Sun (`planet`, `body: sun`, scale 7) at `centre`, with a `sunglow` on it (`who: sun`);
Earth (scale 7 × 0.00917 = 0.064) at `east`, a blue speck.

**3.1** the starstream dies away as the glow swells; the Sun fills the frame, its face churning (`spin` 0.03); full,
slow handheld drift. A `swell` sting.
NARRATOR (gentle): "This is the Sun. It's a star: our very own star."
NELL (VO, awed): "It's so bright!"
NARRATOR: "It's about four and a half billion years old."
NELL (VO, cheeky): "Older than Gran!"
GRAN (VO, dry): "Only just."

**3.2** wide, the camera dollies back (z 800 → −900) until the whole Sun sits left of centre and a blue speck, Earth,
floats at the right, at its true size. Then a string of tiny Earths races across the Sun's middle, one after another,
like beads (`sizerow` who: sun, n 109 by default, gap 0.04: the whole row in about 4.7 s).
NELL (VO, curious): "Where's Earth?"
NARRATOR: "That little dot. The Sun is about a hundred times wider than Earth."
(pad 0.4 s)
NARRATOR: "It would take more than a million Earths to fill it up."
NELL (VO, giggling): "That's a lot of Earths."

**3.3** a crop into the Sun's edge (zoom 3, focus [0.15, 0.4]): the bright rim against black, the surface boiling;
slow push-in.
NARRATOR: "Its surface is about five and a half thousand degrees Celsius. And its middle is fifteen million."
NELL (VO, amazed): "My bath is only forty!"

**3.4** wide, a slow pan from the Sun's blazing edge out to the right into the dark, where a few far, tiny worlds
glint (four `skydot`s, small, at points along the line).
NARRATOR: "Almost all the stuff in our solar system is in the Sun: ninety-nine point eight percent."
GRAN (VO, amused): "The planets are just the crumbs."

**3.5** wide, static: the Sun at the left; a beam of sunlight grows from it out across the dark to the blue speck at
the right (`sunbeam` from the Sun to Earth) and lights it.
NARRATOR: "Its light reaches Earth in about eight minutes. And Earth goes once round the Sun every year."
NELL (VO, proud): "I've been round eight times. I'm eight!"
GRAN (VO, firm): "And remember, love: never look at the Sun through a telescope. Never ever."
NELL (VO, solemn): "Never ever. I promise."

## Part 2 — Mercury

**Estimate 0:55** (98 words ≈ 42 s; gaps and holds ≈ 5 s; the race past the camera, the orrery laps and the drift
across the terminator ≈ 8 s). Music: `playful`, quick.

### Scene 4: Space, Mercury (cut)

**Starting places:** a huge `sunglow` at the frame's left (x −0.12, y 0.4, r 0.31: from Mercury the Sun looks about
two and a half times as big as from Earth, more than three times at its closest). Mercury (`body: mercury`, scale
1.2) at `west`.

**4.1** wide, pan from `west` to `east`: Mercury races left to right (`run`, speed 2) along its dotted orbit (`orbit`
who: mercury, side −1), the camera panning to keep up; a `whoosh` as it passes.
NARRATOR (brisk): "Mercury: the smallest planet, only a little bigger than our Moon. And the closest to the Sun."
NELL (VO, giggling): "It's so fast!"
NARRATOR: "The fastest of all. It whizzes round the Sun in just eighty-eight days."

**4.2** the `orrery` (new), full frame: seen from above, the Sun in the middle, Mercury's small orbit and Earth's
bigger one as dotted rings. Earth goes round 8 times while Mercury laps it again and again; an inked counter by each
ticks up on every lap: Earth's to 8, Mercury's to 33. Both stop together.
NELL (VO, curious): "So how old would I be on Mercury?"
NARRATOR: "You're eight in Earth years. In Mercury years, you'd be thirty-three."
NELL (VO, delighted): "Thirty-three! I'm a grown-up!"
GRAN (VO, dry): "You'd still go to bed at eight."

**4.3** a crop of Mercury (zoom 2.4), grey and cratered: the day side blazing at the left, the night side dark at the
right; the camera drifts slowly across the line between them.
NARRATOR: "With almost no air to hold in the heat, its days reach four hundred and thirty degrees, and its nights
drop to minus one hundred and eighty."
NELL (VO, cheeky): "I'd need my scarf and my sun hat."

## Part 3 — Venus

**Estimate 1:13** (130 words ≈ 56 s; gaps and holds ≈ 8 s; the slow push, Earth gliding in, the dive into the clouds
and the glow from below ≈ 9 s). Music: `mystery` → `tension` under the heat → `playful`.

### Scene 5: Space, Venus (cut)

**Starting places:** `sunglow` x −0.1, y 0.4, r 0.17. Venus (`body: venus`, scale 2.4) at `centre`. Earth (scale
2.4 / 0.949 = 2.53) offstage right, then placed at `east` for 5.2.

**5.1** full on Venus, slow push-in: a smooth, creamy, glowing globe.
GRAN (VO, fond): "Ah, Venus. When I was little, I called her the evening star."
NELL (VO, cheeky): "But she's not a star, Gran!"
GRAN (VO, amused): "Quite right."
NARRATOR: "After the Moon, Venus is the brightest thing in our night sky."

**5.2** wide, static: Venus at the left of centre; Earth glides in from the right to sit beside it, nearly the same
size (Venus = 0.949 Earth).
NARRATOR: "It's almost the same size as Earth. Some call it Earth's twin."
NELL (VO, hopeful): "Could we live there?"

**5.3** the camera dives at Venus (push-in, zoom 1 → 4, z 0 → 1200) until creamy cloud fills the frame; as it goes
deeper the cloud darkens and a deep orange glow rises from below (`sunglow` x 0.5, y 1.3, r 0.7, a 0.6, as a custom
beat). A low `hum`.
NARRATOR (grave): "Not a chance. Under those thick clouds, it's the hottest planet of all. Hot enough to melt lead."
NELL (VO, surprised): "Hotter than Mercury?"
NARRATOR: "Hotter than Mercury, even though Mercury is closer to the Sun. The longest a robot probe lasted down there
was just over two hours."
NELL (VO, sad): "Oh, poor robots."

**5.4** wide: Venus alone again, its cloud bands drifting the "wrong" way (`spin` −0.05), a dotted orbit beside it
(`orbit`, side −1).
NARRATOR: "And Venus spins backwards. There, the Sun rises in the west."
GRAN (VO, delighted): "And Venus spins so slowly that one turn takes longer than its whole year!"
NELL (VO, scheming): "So I'd get a birthday every day!"
GRAN (VO, dry): "Nice try."

## Part 4 — Earth and the Moon

**Estimate 1:21** (146 words ≈ 63 s; gaps and holds ≈ 9 s; the slow dolly to Earth, the cut home, the row of Earths
and the push on the Moon ≈ 9 s). Music: `tender`, the motif on flute; crickets on the hill; `wonder` at the Moon. The
only part that cuts back home in the middle of the journey.

### Scene 6: Space, Earth (cut)

**Starting places:** `sunglow` x −0.1, y 0.4, r 0.12. Earth (`body: earth`, scale 2.6) at `centre`; the Moon (scale
2.6 × 0.2725 = 0.71) at `far_east`, z 2400 (smaller and behind). A tiny warm point on Earth's night side, in the
shaded crescent at its lower right (`skydot`, col warm, size 2): Gran's hill.

**6.1** wide, slow dolly in (z −600 → 300): the blue Earth turning, clouds over it, the Moon small beyond. The motif on
flute.
NELL (VO, hushed): "There's us!"
NARRATOR: "Earth: the third planet from the Sun. Our home."

**6.2** full on Earth, static: the lit side at the left, the dark side at the right, and on the dark side the tiny
warm point.
NARRATOR: "It's the only place we know of with living things. And about seventy-one percent of its surface is ocean."
NELL (VO, excited): "And that's our side, in the dark!"

### Scene 7: Gran's hill, night (`transition: cut`)

**Starting places:** the telescope at x 2080; Nell at the eyepiece at x 2172 facing left; Gran at x 2350 facing left,
just behind her.

**7.1** medium on Nell and Gran, static. Nell keeps her eye to the eyepiece and waves up at the sky with her free hand
(`wave`). Gran, right behind her, smiles (`happy`).
NELL (cheerful): "Hello, Gran! I can see you from up here!"
GRAN (dry): "I'm right behind you, love."
(pad 0.4 s)
GRAN (warm): "You know, every other planet is named after a god. Earth just means 'the ground'."

### Scene 8: Space, the Moon (`transition: cut`)

**Starting places:** Earth (scale 0.6) at `x:250,y:1000` near the left edge; the Moon (scale 0.6 × 0.2725 = 0.164)
at the right, 60.3 Earth radii away (true distance): about `x:2060,y:1000` at that scale; both z 0.

**8.1** wide, static, the two at the frame's edges: Earth at the left, the Moon a grey speck at the right. Earths pop
in one by one in a row between them (`sizerow` with ratio 1, n 29, on a hidden stand-in Earth at the middle of the
gap, 30.5 Earth radii from Earth's centre: `x:1165,y:1000` at this scale, R = 30 px; the row then runs from x 295 to
2035, clear of Earth's edge at 280 and the Moon's near edge at 2050; or the small film piece in the list at the end).
NELL (VO, curious): "Is the Moon far?"
NARRATOR: "About thirty Earths could fit in a row between us and the Moon."

**8.2** full on the Moon (a second, bigger Moon actor at `centre`, scale 2), grey and cratered; slow push-in.
NELL (VO): "Has anyone been there?"
NARRATOR: "Twelve people have walked on it. And in 2026, four astronauts flew all the way around it."
GRAN (VO, wistful): "I watched the first moonwalk on a tiny television."
NELL (VO, determined): "I'm going there. I'll jump really high."
NARRATOR (amused): "You would. On the Moon, you'd weigh only a sixth as much."
NARRATOR: "And every year, the Moon drifts about four centimetres farther away."
NELL (VO, worried): "Come back, Moon!"

## Part 5 — Mars

**Estimate 1:09** (127 words ≈ 54 s; gaps and holds ≈ 7 s; the short flight in, the moons going round, the glide over
the limb and the orbit drawing ≈ 8 s). Music: `playful`. Built as Nell's "could I live here?" checklist; this time she
does the age sum herself.

### Scene 9: Space, Mars (cut)

**Starting places:** `sunglow` x −0.1, y 0.4, r 0.08. Mars (`body: mars`, scale 2.2, its white polar cap showing) at
`centre`.

**9.1** a short `starstream` (2 s), then wide: Mars swims up out of the dark, small and red.
NELL (VO, hopeful): "Are we nearly at Saturn?"
GRAN (VO, amused): "Not even close. This is Mars."
NARRATOR: "The red planet. It's red because its dusty ground is full of rust."

**9.2** full on Mars, turning (`spin` 0.08); two tiny moons go round it, one passing in front, one behind (`moonlets`
who: mars, n 2: two specks, true to how small Phobos and Deimos are).
NELL (VO, thoughtful): "Could I live on Mars?"
NARRATOR: "It's about half as wide as Earth. A day there is only a little longer than ours. But the air is thin, and
mostly carbon dioxide. You couldn't breathe it."

**9.3** a crop of Mars's edge (zoom 2.8, focus [0.85, 0.3]); the camera glides low along the limb, over rust-red
ground and dark patches.
NARRATOR: "It has the biggest volcano in the solar system: Olympus Mons, about twenty-five kilometres tall. Mount
Everest is less than nine."
NELL (VO, curious): "Does anyone live there?"
NARRATOR: "Only robots. Mars is the only planet we know of where everyone is a robot."

**9.4** wide: Mars small at the right, the Sun's glow at the left; Mars's dotted orbit draws itself in (`orbit`).
NARRATOR: "A year on Mars is six hundred and eighty-seven days. Nearly two of ours."
NELL (VO, thoughtful): "So on Mars, I'd be four?"
NARRATOR: "Just over four."
GRAN (VO, teasing): "Four again. Heaven help us."

## Part 6 — The asteroid belt

**Estimate 0:49** (79 words ≈ 34 s; gaps and holds ≈ 4 s; the rush of rocks, the silence and the empty dark ≈ 11 s).
Music: `chase` → silence → `mystery`. Built as a gag: the film's one "action scene", which turns out to be nothing to
fear.

### Scene 10: Space, the asteroid belt (cut)

**Starting places:** `sunglow` x −0.1, y 0.4, r 0.045. An asteroid (`planet`, `body: mercury`, `ob` 0.62, `roll`
0.5, scale 0.5) at `centre`, z 3000 (far) for 10.1–10.2.

**10.1** the camera rushes forward (z −1500 → 1500) through a thick storm of rocks (`debris` n 160, ice 0.2, speed
1.8) streaking past the lens; rocks `whoosh` by. Music: `chase`, loud. Handheld.
NELL (VO, alarmed): "Rocks! Hold on, Gran!"

**10.2** cut: the music stops dead (a `plunk`). Wide, static: almost empty space. Far off, one small rock turns
slowly (the asteroid; `debris` n 4, ice 0.2, speed 0.3 for a couple more, very far).
NARRATOR (amused): "Don't worry. This is the asteroid belt, between Mars and Jupiter. There are millions of rocks
here, left over from when the solar system was made."

**10.3** full on the one asteroid (placed at z 0), egg-shaped, grey and cratered, turning slowly in the dark; the
camera drifts round it.
NARRATOR: "But space is so big that they're very far apart. The big ones are, on average, nearly eight times farther
apart than Earth and the Moon."
NARRATOR: "Put them all together, and they'd still weigh less than our Moon. Spacecraft travel through quite safely."
NELL (VO, sheepish): "Oh. I was holding my breath."

## Part 7 — Jupiter

**Estimate 1:25** (154 words ≈ 66 s; gaps and holds ≈ 8 s; Jupiter rising, Earth drifting to the storm, the spin-up
and the eyepiece ≈ 11 s). Music: `triumph` → `wonder` (celesta at the eyepiece) → `playful`.

### Scene 11: Space, Jupiter (cut)

**Starting places:** `sunglow` x −0.08, y 0.4, r 0.023. Jupiter (`body: jupiter`, scale 4) at `centre`. Earth
(scale 4 × 0.0892 = 0.357) placed in front of the Great Red Spot for 11.2 (z −50). For 11.4, four tiny moons (`moon`
body, scale 0.12) in a line along Jupiter's equator, two each side, a few Jupiter widths out.

**11.1** wide → full: out of the dark below, a giant striped globe rises and swells as the camera dollies in (z −1500
→ 600), until it fills two-thirds of the frame. A `swell`; music `triumph`.
NELL (VO, hopeful): "Is that Saturn?"
NARRATOR: "Not yet. This is Jupiter, the biggest planet of all. If it were hollow, about a thousand Earths could fit
inside."

**11.2** a crop of the Great Red Spot (zoom 3.4, focus on the spot at 22° S); a small blue Earth drifts in and stops
beside it: smaller than the storm.
NELL (VO, curious): "What's that red spot? An eye?"
NARRATOR: "A storm. A giant storm, bigger than Earth, that has been raging for hundreds of years."

**11.3** full on Jupiter; its bands start to race round (`spin` 0.05 → 0.4, `set` over 2 s).
NARRATOR: "And it spins faster than any other planet. A day on Jupiter lasts only about ten hours."
NELL (VO, impressed): "That's how long I sleep!"

**11.4** POV through the eyepiece again (`eyepiece`, r 0.36): Jupiter a small striped disc, four bright pinpoints in a
line beside it, as Nell could see it from her hill. The motif on celesta.
NARRATOR: "It has more than a hundred moons. The four biggest were first seen in 1610, by Galileo, with one of the
very first telescopes."
GRAN (VO, warm): "And with your telescope, you can see those four from our hill."
NELL (VO, thrilled): "Tomorrow night!"
NARRATOR: "One of them, Ganymede, is the biggest moon of all. It's even bigger than the planet Mercury."

**11.5** wide: the eyepiece opens; Jupiter small at the right, its dotted orbit drawing round from the Sun's side.
NARRATOR: "One trip round the Sun takes Jupiter about twelve of our years."
GRAN (VO, teasing): "So your first Jupiter birthday is when you're nearly twelve."
NELL (VO, outraged): "Twelve years for one cake?"
GRAN (VO, amused): "One very big cake."

## Part 8 — Saturn

**Estimate 1:29** (134 words ≈ 57 s; gaps and holds ≈ 11 s; the flight in, the beam, the nine Earths, the rings
fly-through, the rings closing edge-on, the moons and the pull-back ≈ 20 s). Music: `wonder`, the motif in full on
strings as Saturn arrives. Built as the chapter was: a rapid-fire run of Nell's questions, the only part made that
way. Its shots are the chapter's 2.1–2.7, re-staged where noted.

### Scene 12: Space, Saturn (cut)

**Starting places:** `sunglow` x −0.08, y 0.4, r 0.013 (much smaller than the chapter's). Saturn (scale 2.5) at
`centre`; Titan (scale 0.107 = 2.5 × 0.0427, its true size) near the camera's path, as the chapter's 2.1.

**12.1** the camera flies (z −1500 → 1000) toward a small golden point ahead, which opens into Saturn with its rings;
Titan swings past the left edge. The motif in full on strings.
NELL (VO, overjoyed): "Saturn! At last!"
(pad 0.4 s)
NELL (VO, excited): "It's got rings!"
NARRATOR: "Saturn: the sixth planet from the Sun."

**12.2** wide, static: the small Sun at the left, Saturn small on the right. A beam of sunlight grows from the Sun to
Saturn and lights it (`sunbeam`).
NELL (VO, curious): "Is it far from the Sun?"
NARRATOR: "So far that sunlight takes about eighty minutes to get here."

**12.3** full on Saturn, static. Nine small Earths pop in one by one across its middle (`sizerow`, true scale).
NELL (VO, eager): "Is it big?"
NARRATOR: "Nine times wider than Earth."

**12.4** a crop of Saturn (the globe big, its top cut, the rings across it), then the camera drifts in toward the cloud
bands until they fill the frame.
NELL (VO, eager): "Could I stand on it?"
NARRATOR: "No. Saturn has no solid ground. It's mostly hydrogen and helium."
GRAN (VO, mischievous): "It's so light for its size, it would float in a bath."
NELL (VO, giggling): "We'd need a really big bath."

**12.5** the rings' edge, close (a crop), speckled with ice and rock from dust to boulders (`ringfield`); the camera
flies in and a few chunks open out past the lens.
NELL (VO, curious): "What are the rings made of?"
NARRATOR: "Billions of chunks of ice and rock: some as small as dust, some as big as a house."

**12.6** full, static: the camera sinks to the ring plane (the planet's `tilt` 0.38 → 0.012 over 3 s, `set`) and the
huge rings close to a thin bright line across the globe.
NARRATOR: "And the main rings are only about ten metres thick."

**12.7** wide on Saturn (rings open again), small moons appearing around it one by one, faster and faster, the far ones
passing behind the globe and rings (`moonlets`, big: titan).
NELL (VO, eager): "Does it have a moon?"
NARRATOR: "Hundreds! More than any other planet."

**12.8** wide: the Sun's small glow at the left; the camera pulls back through depth as Saturn's dotted orbit draws
itself (`orbit`).
NARRATOR: "And one year on Saturn lasts about twenty-nine Earth years."
NELL (VO, giggling): "So on Saturn, I'm not even one!"

## Part 9 — Uranus

**Estimate 1:01** (108 words ≈ 46 s; gaps and holds ≈ 6 s; the long dark approach, the roll and the slow push into the
shadow ≈ 9 s). Music: `tender` (Gran's story), `playful` for the scarf. Built as a story Gran tells, which turns out
to be Nell's own.

### Scene 13: Space, Uranus (cut)

**Starting places:** `sunglow` x −0.06, y 0.4, r 0.006 (a bright star now). Uranus (`body: uranus`, scale 2) at
`centre`, z 4000 at the start of 13.1 (a small pale dot), its rings standing upright round it.

**13.1** a long, slow dolly through the dark (camera z −1500 → 1500 over the whole shot): far ahead, a pale
blue-green dot slowly grows into a small globe.
GRAN (VO, fond): "In 1781, a man called William Herschel was looking through his telescope, just like you."
GRAN (VO): "He spotted a little dot, and thought it was a comet, or a star."
NELL (VO, delighted): "Just like me and Saturn!"
NARRATOR: "It was a planet: Uranus. The first planet ever found with a telescope."
GRAN (VO, amused): "He wanted to name it after the King. King George."
NELL (VO, giggling): "Planet George!"

**13.2** full on Uranus (placed at z 0): tipped on its side, rings standing up round it like a hoop; it rolls along
its dotted orbit (`orbit`, and a slow `walk` from `west` toward `centre`), its bands turning top to bottom.
NELL (VO, curious): "Why is it so blue?"
NARRATOR: "A gas called methane. And look: Uranus is tipped right over. It rolls around the Sun on its side, like a
ball."

**13.3** a crop of Uranus: one side lit by the far-off Sun, the other in deep shadow; a slow push into the dark half.
NARRATOR: "So parts of it have a winter twenty-one years long, in the dark."
NELL (VO, aghast): "Twenty-one years of winter?"
GRAN (VO, dry): "Better pack a bigger scarf."

## Part 10 — Neptune

**Estimate 0:50** (75 words ≈ 32 s; gaps and holds ≈ 4 s; near silence at the start, the fade-up, the racing clouds,
the slow orbit and a last hold ≈ 14 s). Music: `mystery`, sparse and quiet. Built as the film's quietest part: mostly
picture, and whispers.

### Scene 14: Space, Neptune (cut)

**Starting places:** `sunglow` x −0.05, y 0.4, r 0.004 (one bright star). Neptune (`body: neptune`, scale 2) at
`centre`, in its true colour: a pale greenish blue only a shade bluer than Uranus (`#a6d8dc`), not Voyager's
contrast-boosted deep blue. Until the engine's preset is repainted (Pieces, 3), pass the colours on the actor (the
rig merges them over the preset): `base: "#8cc0dc"`, `bands: [[0.6, "#88bad8"], [0.3, "#92c4e0"], [-0.1,
"#96c8e2"], [-0.45, "#8ec0de"], [-0.75, "#88bcd8"]]`, and its dark spot softened to match (`#5f8fbc`, the white cloud
beside it kept).

**14.1** wide, static, near silence for 3 s: a pale blue globe, a shade bluer than Uranus, slowly lifts out of the
black (a `fade` up from 0), the far Sun a single bright star at the left.
NELL (VO, hushed): "It's so dark out here."
NARRATOR (hushed): "Neptune: the farthest planet. Sunlight takes four hours to get here."

**14.2** a crop of Neptune (zoom 2.6): white clouds streaking fast across the pale blue (`spin` 0.5).
NARRATOR: "It's the windiest planet. Its winds blow faster than two thousand kilometres an hour."

**14.3** wide, static: Neptune small, its dotted orbit drawing very slowly.
GRAN (VO, gentle): "You can't see Neptune with just your eyes. People found it with sums first."
NARRATOR: "One year here is a hundred and sixty-five of ours. Since it was discovered, Neptune has been round the Sun
only once."
NELL (VO, hushed): "Not even Gran is that old."
GRAN (VO, amused): "Thank you, love."

## Part 11 — Pluto, the Kuiper Belt and how big it all is

**Estimate 1:30** (148 words ≈ 63 s; gaps, pads and holds ≈ 11 s; the approach, the flight, the zoom out, the pull
back and the long hold on the dot ≈ 16 s). Music: `wonder` → `tender`; silence, then the motif on music-box at the
dot. Built as a great zoom out, and then the smallest picture in the film.

### Scene 15: Space, Pluto and beyond (cut)

**Starting places:** `sunglow` x −0.05, y 0.4, r 0.003. Pluto (`body: pluto`, scale 1.4, its pale heart toward us)
at `centre`; Charon (`body: charon`, scale 1.4 × 0.51 = 0.71) at `east`, z 300.

**15.1** almost empty dark, one or two far icy specks turning slowly (`debris` n 5, ice 0.95, speed 0.3, very far, as
in 10.2: the whole belt weighs at most a tenth of Earth, spread from 30 to 50 AU, so it is almost all empty space,
as the asteroid belt was); a small pale world comes into view, its
bright heart facing us, its moon Charon beside it, half its size. Music: `wonder`.
NELL (VO, delighted): "Look! That one's got a heart!"
NARRATOR: "That's Pluto: a dwarf planet, smaller than our Moon."
GRAN (VO, warm): "And it was named by a girl of eleven, at breakfast with her grandad."
NELL (VO, amazed): "A girl named a planet?"
GRAN (VO, proud): "She did."

**15.2** the camera flies on through near-empty dark (dolly, z −1200 → 1500), only a far speck or two passing, Pluto
falling behind at the left. (The belt as a crowd of icy worlds is shown in 15.3, as the orrery's misty band.)
NARRATOR: "Pluto lives in the Kuiper Belt: a huge ring of icy worlds out past Neptune. There may be millions of them."

**15.3** the `orrery`, full frame, zooming out: it starts on the Sun and the four small inner orbits and pulls out and
out, past Jupiter's, Saturn's, Uranus's and Neptune's dotted rings, to Pluto's tilted oval and the misty band of the
Kuiper Belt; the inner planets shrink to a tiny bright knot round the Sun.
NARRATOR: "On average, sunlight takes about five and a half hours to reach Pluto."
NARRATOR: "And the spacecraft Voyager 1 is out even farther. So far that its messages take a whole day to get home."

**15.4** the orrery fades into the space set's starfield: the camera keeps pulling back until our Sun is one star
among thousands, the Milky Way's band across the frame.
NARRATOR: "And our Sun is just one of more than a hundred billion stars in our galaxy."
(pad 1 s)
NELL (VO, quiet): "Where's home?"

**15.5** wide, static, very still: the far Sun a bright star at the left; a faint scattered ray of light across the
black (`sunbeam`, faint, from the Sun to the right edge); in the ray, one pale blue point (`skydot`, col pale blue,
size 2). Hold. The motif, slow, on music-box.
NARRATOR (hushed): "In 1990, from far past Neptune, Voyager 1 looked back one last time and took a picture of home."
NARRATOR (hushed): "Earth was a single point of light."
(pad 1.5 s)
NELL (VO, quiet): "That's us?"
GRAN (VO, tender): "That's us. Everyone we've ever loved is on that little dot."

## Part 12 — Home on the hill

**Estimate 1:00** (58 words ≈ 25 s; gaps, pads and holds ≈ 7 s; the dissolve, the silent time-lapse to dawn, the
sunrise, the pull-out and the 4 s end card ≈ 28 s). Music: `night` → `tender` → the motif in full on tutti at sunrise,
`hold` under the end card. Built as the film's quietest scene on Earth: mostly picture.

### Scene 16: Gran's hill, night → dawn (dissolve)

**Starting places:** as scene 7: the telescope at x 2080, Nell at the eyepiece at x 2172 facing left, Gran at x 2350
facing left. Shot times: 16.1 `night`; 16.2 `{ "from": "night", "to": "dawn" }`; 16.3–16.5 `dawn`.

**16.1** the blue dot dissolves into a close of Nell at the eyepiece; she straightens slowly, turns to Gran (face
right) and looks up at her. Crickets, no music for a beat.
NELL (quiet): "Gran, we're on the dot. Right now."
GRAN (tender): "Right now, love. Both of us."

**16.2** wide, static. Nell sits on the grass beside Gran's feet; Gran sits down beside her; both look up at the sky.
The sky slowly changes from night to dawn (a time-lapse over about 10 s): the stars fade, the far hills on the left
are edged with rose. No words; the motif on music-box, `tender`.

**16.3** full on the two of them sitting, low angle, the brightening sky above. Low in the sky on the left, one
bright, steady point (`skydot` x over the downslope, col white, glow pale gold, size 4): Venus. Nell points at it.
NELL (sleepy, proud): "Gran, that's not a star. That's Venus."
GRAN (proud): "That's my clever girl."

**16.4** medium on both, static. The first edge of the Sun comes up over the far hills at the left (`sunglow` x
−0.05, y 0.55, r 0.12, growing a), warm light on their faces (scene `rim` left); one `birdsong`. The motif in full on
tutti.
NELL (delighted): "We turned back round to the Sun!"
GRAN (warm): "And that light left it eight minutes ago."

**16.5** wide, pull-out to establishing: the two small figures and the telescope on the crest in the morning light,
the last stars going out.
NELL (sleepy): "Thank you for the trip, Gran."
GRAN (tender): "Thank you for the questions."
(pad 0.6 s)
NELL (hopeful): "Same time tomorrow night?"
GRAN (amused): "Same time tomorrow night."

End card: "Look up."

## Ending and final image

The pull-out leaves Nell and Gran small on the crest of their hill, sitting by the telescope as the Sun rises: the
dot we saw from the edge of the solar system, seen from where everyone on it lives. The opening asked where the Sun
goes at night; the ending answers it with the Earth turning them back to face it. The opening's "That's not a star"
comes back in Nell's own mouth. End card: "Look up."

## Facts table

Checked 2026-11-10. NASA pages unless stated. "Shown" = in the picture, not spoken. Nell's ages use 8.0 Earth
years = 2,922 days. Revised the same day after an independent fact-check (rows 7, 15, 23, 25, 28, 31, 37, 43, 69, 78,
86, 94, 95; rows 96–97 added at the end so the earlier numbers stay as they were).

| # | Where | Claim (spoken or shown) | Source | Quote |
|---|---|---|---|---|
| 1 | 1.3 | Saturn can be seen without a telescope, like a bright star. | https://science.nasa.gov/saturn/facts/ | "The farthest planet from Earth discovered by the unaided human eye, Saturn has been known since ancient times." |
| 2 | 1.3 | Planets shine steady; stars twinkle. | https://imagine.gsfc.nasa.gov/ask_astro/night_sky.html | "Why do the stars appear to twinkle while the planets don't?"; "Thus, the turbulent effects are averaged out, making the planets look steady." |
| 3 | 1.6 | Night: the Earth spins and our side faces away from the Sun. | https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-earth-grades-k-4/ | "Day and night happen as Earth spins. When places on Earth are facing toward the sun, it is daytime. When they are facing away from the sun, it is nighttime." |
| 4 | 3.1 | The Sun is a star, our solar system's own star. | https://science.nasa.gov/sun/facts/ | "Our Sun is a 4.5 billion-year-old yellow dwarf star … it's our solar system's only star." |
| 5 | 3.1 | The Sun is about four and a half billion years old. | https://science.nasa.gov/sun/facts/ | "Our Sun is a 4.5 billion-year-old yellow dwarf star" |
| 6 | 3.2 | The Sun is about a hundred times wider than Earth (shown: 109 Earths across it, true radii 695,700 / 6,378 km). | https://science.nasa.gov/sun/facts/ | "The Sun is about 100 times wider than Earth and about 10 times wider than Jupiter, the biggest planet." |
| 7 | 3.2 | It would take more than a million Earths to fill the Sun up (NASA's wording: Earths' volume, squashed to fill it; round Earths packed in would be under a million, so the line does not say "fit"). | https://science.nasa.gov/sun/facts/ | "it would take 1.3 million Earths to fill the Sun's volume." |
| 8 | 3.3 | The surface is about 5,500 °C; the middle (core) about 15 million °C. | https://science.nasa.gov/sun/facts/ | "The part of the Sun we call its surface – the photosphere – is a relatively cool 10,000 °F (5,500 °C)."; "Temperatures top 27 million °F (15 million °C)" (the core) |
| 9 | 3.4 | 99.8% of the solar system's stuff (mass) is the Sun. | https://science.nasa.gov/sun/facts/ | "our Sun, which accounts for 99.8% of our solar system's mass." |
| 10 | 3.5 | Sunlight reaches Earth in about eight minutes (also 16.4: "that light left it eight minutes ago"). | https://science.nasa.gov/earth/facts/ | "It takes about eight minutes for light from the Sun to reach our planet." |
| 11 | 3.5 | Earth goes round the Sun once a year (so an eight-year-old has been round eight times). | https://science.nasa.gov/earth/facts/ | "It takes 365.25 days to complete one trip around the Sun." |
| 12 | 3.5 | Never look at the Sun through a telescope. | https://science.nasa.gov/eclipses/safety/ | "Viewing any part of the bright Sun through a camera lens, binoculars, or a telescope without a special-purpose solar filter secured over the front of the optics will instantly cause severe eye injury." |
| 13 | 4.1 | Mercury is the smallest planet, only a little bigger than our Moon, and the closest to the Sun. | https://science.nasa.gov/mercury/facts/ | "Mercury is the smallest planet in our solar system and nearest to the Sun. It's only slightly larger than Earth's Moon." |
| 14 | 4.1 | Mercury is the fastest planet; it goes round the Sun in 88 days. | https://science.nasa.gov/mercury/facts/ | "Mercury is the fastest planet, zipping around the Sun every 88 Earth days." |
| 15 | Scene 4 (shown) | From Mercury the Sun looks about 2.6 times as big as from Earth at Mercury's average distance, more than three times at its closest (the glow: r 0.31 = 0.12 / 0.387 AU, on the same ∝ 1 / distance ladder as every other part). | https://science.nasa.gov/mercury/facts/ | "From an average distance of 36 million miles (58 million kilometers), Mercury is 0.4 astronomical units away from the Sun." (58 / 149.6 = 0.387 AU → ×2.6); "takes the planet as close as 29 million miles (47 million kilometers)" (0.314 AU → ×3.2); "From the surface of Mercury, the Sun would appear more than three times as large as it does when viewed from Earth" |
| 16 | 4.2 | Eight on Earth = thirty-three on Mercury (shown: 8 Earth laps, 33 Mercury laps). | https://science.nasa.gov/mercury/facts/ | 88-day year (#14): 2,922 / 88 = 33.2 Mercury years |
| 17 | 4.3 | Almost no air to hold the heat; days about 430 °C, nights about −180 °C. | https://science.nasa.gov/mercury/facts/ | "day temperatures can reach highs of 800°F (430°C). Without an atmosphere to retain that heat at night, temperatures can dip as low as -290°F (-180°C)." |
| 18 | 5.1 | People called Venus the evening star. | https://science.nasa.gov/venus/facts/ | "even thinking it was two objects: a morning star and an evening star." |
| 19 | 5.1 | After the Moon, Venus is the brightest thing in our night sky. | https://science.nasa.gov/venus/facts/ | "From Earth, Venus is the brightest object in the night sky after our own Moon." |
| 20 | 5.2 | Venus is almost the same size as Earth; called Earth's twin (shown: Venus = 0.949 Earth). | https://science.nasa.gov/venus/facts/ | "The planet is nearly as big around as Earth. Its diameter at its equator is about 7,521 miles (12,104 kilometers), versus 7,926 miles (12,756 kilometers) for Earth."; "is sometimes called Earth's twin." |
| 21 | 5.3 | Thick clouds; the hottest planet; hot enough to melt lead. | https://science.nasa.gov/venus/facts/ | "Its thick atmosphere traps heat in a runaway greenhouse effect, making it the hottest planet in our solar system with surface temperatures hot enough to melt lead — about 872 degrees Fahrenheit (467 Celsius)." |
| 22 | 5.3 | Hotter than Mercury, though Mercury is closer to the Sun. | https://science.nasa.gov/mercury/facts/ | "Despite its proximity to the Sun, Mercury is not the hottest planet in our solar system – that title belongs to nearby Venus, thanks to its dense atmosphere." |
| 23 | 5.3 | The longest a robot probe lasted on Venus's surface was just over two hours (Venera 13, 127 minutes). | https://ntrs.nasa.gov/citations/20190029198 (NASA, "Long Duration Venus Probes and Landers"); https://science.nasa.gov/venus/facts/ | "the longest surviving asset Venera-13 lasted only 127 minutes before succumbing to the extreme temperature"; "The longest survivor lasted two hours; the shortest, 23 minutes." (the facts page rounds 127 minutes down) |
| 24 | 5.4 | Venus spins backwards; there the Sun rises in the west. | https://science.nasa.gov/venus/facts/ | "the Sun would rise in the west and set in the east, because Venus spins backward compared to Earth." |
| 25 | 5.4 | Venus spins so slowly that one turn (243 Earth days) takes longer than its year (225 days). Gran says "one turn", not "one day": a day by the Sun (sunrise to sunrise, which the line before is about) is 116.75 Earth days, about half a Venus year. (Nell's "a birthday every day" is her joke; Gran: "Nice try.") | https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html; https://science.nasa.gov/venus/facts/ | NSSDC: "Sidereal rotation period (hrs) -5832.6" (243 d); "Length of day (hrs) 2802.0" (116.75 d); "Sidereal orbit period (days) 224.701". Facts page: "your "day" would be 243 Earth days long — longer even than a Venus year (one trip around the Sun), which takes only 225 Earth days." |
| 26 | 6.1 | Earth is the third planet from the Sun. | https://science.nasa.gov/earth/facts/ | "Earth – our home planet – is the third planet from the Sun" |
| 27 | 6.2 | The only place we know of with living things. | https://science.nasa.gov/earth/facts/ | "It's the only place we know of inhabited by living things." |
| 28 | 6.2 | About 71% of Earth's surface is ocean. | https://science.nasa.gov/earth/facts/ | "Earth's global ocean, which covers about 71% of the planet's surface" |
| 29 | 6.2 | Our side of Earth, at night, is the side turned away from the Sun (shown: the hill's light on the shaded side). | as #3 | as #3 |
| 30 | 7.1 | Every other planet is named after a god; Earth means "the ground". | https://science.nasa.gov/earth/facts/ | "All of the planets, except for Earth, were named after Greek and Roman gods and goddesses. However, the name Earth is a Germanic word, which simply means "the ground."" |
| 31 | 8.1 | About thirty Earths fit between Earth and the Moon (shown: true distance, 384,400 / 6,378.1 = 60.27 Earth radii centre to centre; the gap from Earth's edge to the Moon's is 60.27 − 1 − 0.2725 = 59.0 radii, where 29.5 fit; the row shows 29 Earths edge to edge, centred in the gap at 30.5 radii). | https://science.nasa.gov/moon/facts/ | "The Moon is an average of 238,855 miles (384,400 kilometers) away. That means 30 Earth-sized planets could fit in between Earth and the Moon." |
| 32 | Scene 6, 8 (shown) | The Moon is less than a third of Earth's width (shown: 0.2725). | https://science.nasa.gov/moon/facts/ | "With a radius of about 1,080 miles (1,740 kilometers), the Moon is less than a third of the width of Earth." |
| 33 | 8.2 | Twelve people have walked on the Moon. | https://science.nasa.gov/moon/moon-walkers/ | "Neil Armstrong and Edwin "Buzz" Aldrin were the first of 12 human beings to walk on the Moon." |
| 34 | 8.2 | In 2026 four astronauts flew all the way around the Moon (Artemis II, April 2026). | https://www.nasa.gov/news-release/nasa-welcomes-record-setting-artemis-ii-moonfarers-back-to-earth/ | "NASA's Artemis II mission took Wiseman, Glover, Koch, and Hansen on a 10-day journey around the Moon and back to Earth." (splashdown "Friday, April 10, 2026") |
| 35 | 8.2 | Gran watched the first moonwalk on television (it was televised live, July 1969). | https://www.nasa.gov/missions/apollo/apollo-11/apollo-11-mission-overview/ | "An estimated 650 million people watched Armstrong's televised image and heard his voice describe the event as he took "…one small step for a man, one giant leap for mankind" on July 20, 1969." |
| 36 | 8.2 | On the Moon you'd weigh a sixth as much. | https://science.nasa.gov/moon/facts/ | "the gravity on the surface of the Moon is one-sixth of Earth's" |
| 37 | 8.2 | The Moon drifts about 4 cm (3.8 cm, measured by laser) farther away every year. | https://www.nasa.gov/solar-system/the-apollo-experiment-that-keeps-on-giving/ | "lunar laser ranging has accurately shown that the distance between the two increases by 1.5 inches (3.8 centimeters) a year." (science.nasa.gov/moon/facts' "about an inch" is a looser rounding, not used) |
| 38 | 9.1 | Mars is red because its dusty ground is full of rust. | https://science.nasa.gov/mars/facts/ | "it is frequently called the "Red Planet" because iron minerals in the Martian dirt oxidize, or rust, causing the surface to look red." |
| 39 | 9.2 | Mars has two small moons (shown: two specks). | https://science.nasa.gov/mars/facts/ | "Mars has two small moons, Phobos and Deimos" |
| 40 | 9.2 | Mars is about half as wide as Earth. | https://science.nasa.gov/mars/facts/ | "With a radius of 2,106 miles (3,390 kilometers), Mars is about half the size of Earth."; "while Mars is about half the diameter of Earth" |
| 41 | 9.2 | A Mars day is only a little longer than ours. | https://science.nasa.gov/mars/facts/ | "it completes one rotation every 24.6 hours, which is very similar to one day on Earth (23.9 hours)." |
| 42 | 9.2 | The air is thin and mostly carbon dioxide (so we couldn't breathe it). | https://science.nasa.gov/mars/facts/ | "Mars has a thin atmosphere made up mostly of carbon dioxide, nitrogen, and argon gases." |
| 43 | 9.3 | Olympus Mons, the biggest volcano in the solar system, about 25 km tall (NASA gives 22.5 to 27 km); Everest under 9 km (so almost three Everests). | https://science.nasa.gov/photojournal/pj-olympus-mons-lava-flows-4/; https://spaceplace.nasa.gov/volcanoes/en/; https://science.nasa.gov/mars/facts/ (largest, and Everest) | Photojournal: "Olympus Mons stands 26 km (16 miles) above the surrounding plains". Space Place: "Mars is home to the largest volcano in our solar system—Olympus Mons."; "At 14 miles high, it is also the largest mountain in our solar system."; "It is almost three times taller than Mount Everest!" Facts page: "Mount Everest, which rises 29,029 feet, or 8,848 meters". (The facts page's "more than 25 miles … or 40 kilometers" disagrees with these and with the laser-altimeter height; not used.) |
| 44 | 9.3 | Only robots live on Mars. | https://science.nasa.gov/mars/facts/ | "Mars is the only planet we know of inhabited entirely by robots." |
| 45 | 9.4 | A Mars year is 687 days, nearly two of ours; Nell would be just over four. | https://science.nasa.gov/mars/facts/ | "A year on Mars lasts 669.6 sols, which is the same as 687 Earth days." (687 / 365.25 = 1.88; 2,922 / 687 = 4.25) |
| 46 | 10.2 | The asteroid belt is between Mars and Jupiter. | https://science.nasa.gov/solar-system/asteroids/facts/ | "Most asteroids orbit our Sun between Mars and Jupiter within the main asteroid belt." |
| 47 | 10.2 | Millions of rocks. | https://science.nasa.gov/solar-system/asteroids/facts/ | "The belt is estimated to contain between 1.1 and 1.9 million asteroids larger than 1 kilometer (0.6 miles) in diameter, and millions of smaller ones." |
| 48 | 10.2 | Left over from when the solar system was made. | https://science.nasa.gov/solar-system/asteroids/facts/ | "Asteroids, sometimes called minor planets, are rocky remnants left over from the formation of our solar system about 4.6 billion years ago." |
| 49 | 10.3 | They are very far apart: the big ones (a mile or more across) on average nearly eight times the Earth–Moon distance. | https://science.nasa.gov/mission/dawn/faq/ | "the average distance between individual asteroids 1 mile in diameter or larger would be about 1.9 million miles. That is nearly 8 times the distance between Earth and the Moon."; "the asteroid belt is mostly empty space" |
| 50 | 10.3 | All together they weigh less than our Moon. | https://science.nasa.gov/solar-system/asteroids/facts/ | "The total mass of all the asteroids combined is less than that of Earth's Moon." |
| 51 | 10.3 | Spacecraft travel through safely. | https://science.gsfc.nasa.gov/690/solar-system-tour/Asteroids.html | "Despite the large numbers of asteroids, the main asteroid belt is still mostly empty space, and spacecraft can travel through it with almost no risk of collision." |
| 52 | 11.1 | Jupiter is the biggest planet; about 1,000 Earths would fit inside if it were hollow. | https://science.nasa.gov/jupiter/facts/ | "It's the largest planet in our solar system – if it were a hollow shell, 1,000 Earths could fit inside." |
| 53 | 11.2 | The Great Red Spot is a storm bigger than Earth, raging for hundreds of years (shown: Earth smaller than the spot; the spot at 22° S). | https://science.nasa.gov/jupiter/facts/ | "Jupiter's iconic Great Red Spot is a giant storm bigger than Earth that has raged for hundreds of years." |
| 54 | 11.3 | Jupiter spins fastest; a day is about ten hours. | https://science.nasa.gov/jupiter/facts/ | "Jupiter has the shortest day in the solar system. One day on Jupiter takes 9.9 hours" |
| 55 | 11.4 | More than a hundred moons. | https://spaceplace.nasa.gov/how-many-moons/en/ | "Jupiter, for instance, has 115 known moons (as of April 2026)!" Also https://science.nasa.gov/jupiter/facts/: "Jupiter has 115 moons that are officially recognized by the International Astronomical Union." |
| 56 | 11.4 | The four biggest were first seen in 1610 by Galileo with one of the first telescopes. | https://science.nasa.gov/jupiter/facts/ | "The four largest moons – Io, Europa, Ganymede, and Callisto – were first observed by the astronomer Galileo Galilei in 1610 using an early version of the telescope." |
| 57 | 11.4 | A small telescope shows those four (shown: four pinpoints in a line through the eyepiece). | https://science.nasa.gov/solar-system/skywatching/night-sky-network/octobers-night-sky-notes-from-galileo-to-clipper-exploring-jupiters-moons/ | "Jupiter's four largest Moons, which are easily visible through a pair of modest binoculars or a small telescope as a series of pinpoints of light around Jupiter." |
| 58 | 11.4 | Ganymede is the biggest moon of all, bigger than Mercury. | https://science.nasa.gov/jupiter/facts/ | "Ganymede is the largest moon in the solar system (even bigger than the planet Mercury)." |
| 59 | 11.5 | Jupiter's year is about twelve Earth years; a first Jupiter birthday at nearly twelve. | https://science.nasa.gov/jupiter/facts/ | "Jupiter makes a complete orbit around the Sun (a year in Jovian time) in about 12 Earth years (4,333 Earth days)." (4,333 / 365.25 = 11.86) |
| 60 | 12.1 | Saturn is the sixth planet from the Sun. | https://science.nasa.gov/saturn/facts/ | "Saturn is the sixth planet from the Sun, and the second-largest planet in our solar system." |
| 61 | 12.2 | Sunlight takes about 80 minutes to reach Saturn. | https://science.nasa.gov/saturn/facts/ | "From this distance, it takes sunlight 80 minutes to travel from the Sun to Saturn." |
| 62 | 12.3 | Nine times wider than Earth (shown: 9 Earths across, true radii). | https://science.nasa.gov/saturn/facts/ | "With an equatorial diameter of about 74,897 miles (120,500 kilometers), Saturn is 9 times wider than Earth." |
| 63 | 12.4 | No solid ground; mostly hydrogen and helium. | https://science.nasa.gov/saturn/facts/ | "As a gas giant, Saturn doesn't have a true surface."; "Saturn is a massive ball made mostly of hydrogen and helium." |
| 64 | 12.4 | So light for its size it would float in a bath. | https://science.nasa.gov/saturn/facts/ | "Saturn is the only planet in our solar system with an average density that is less than water. The giant gas planet could float in a bathtub if such a colossal thing existed." |
| 65 | 12.5 | Rings: billions of chunks of ice and rock, from dust to the size of a house. | https://science.nasa.gov/saturn/facts/ | "They are made of billions of small chunks of ice and rock coated with other materials such as dust. The ring particles mostly range from tiny, dust-sized icy grains to chunks as big as a house." |
| 66 | 12.6 | The main rings are only about ten metres thick. | https://science.nasa.gov/saturn/facts/ | "Saturn's ring system extends up to 175,000 miles (282,000 kilometers) from the planet, yet the vertical height is typically about 30 feet (10 meters) in the main rings." |
| 67 | 12.7 | Hundreds of moons, more than any other planet. | https://spaceplace.nasa.gov/how-many-moons/en/ | "As of June 2026, Saturn has 293 moons." (Jupiter: 115 as of April 2026.) Also https://science.nasa.gov/saturn/facts/: "As of March 2025, Saturn had 274 confirmed moons in its orbit, far more than any other planet in our solar system" |
| 68 | 12.8 | A Saturn year is about 29 Earth years; Nell is not even one. | https://science.nasa.gov/saturn/facts/ | "Saturn makes a complete orbit around the Sun (a year in Saturnian time) in about 29.4 Earth years (10,756 Earth days)." (8 / 29.4 = 0.27) |
| 69 | Scene 12 (shown) | Titan at its true size beside Saturn (0.0427 of Saturn's radius: scale 2.5 × 0.0427 = 0.107). | engine `radiusOf` (Titan 2,574.7 km, Saturn 60,268 km) | 2,574.7 / 60,268 = 0.0427 |
| 70 | 13.1 | In 1781 William Herschel found Uranus with a telescope; he thought it was a comet or a star; the first planet found with a telescope. | https://science.nasa.gov/uranus/facts/ | "Uranus was the first planet found with the aid of a telescope. It was discovered in 1781 by astronomer William Herschel, although he originally thought it was either a comet or a star." |
| 71 | 13.1 | Herschel wanted to name it after King George. | https://science.nasa.gov/uranus/facts/ | "William Herschel tried unsuccessfully to name his discovery Georgium Sidus after King George III." |
| 72 | 13.2 | Its blue colour comes from methane. | https://science.nasa.gov/uranus/facts/ | "Uranus gets its blue-green color from methane gas in the atmosphere." |
| 73 | 13.2 | Tipped over; rolls around the Sun on its side, like a ball. | https://science.nasa.gov/uranus/facts/ | "Uranus rotates at a nearly 90-degree angle from the plane of its orbit. This unique tilt makes Uranus appear to spin sideways, orbiting the Sun like a rolling ball." |
| 74 | 13.3 | Parts of it have a 21-year-long winter in the dark. | https://science.nasa.gov/uranus/facts/ | "For nearly a quarter of each Uranian year, the Sun shines directly over each pole, plunging the other half of the planet into a 21-year-long, dark winter." |
| 75 | 14.1 | Neptune is the farthest planet. | https://science.nasa.gov/neptune/facts/ | "Neptune is the eighth and most distant planet in our solar system." |
| 76 | 14.1 | Sunlight takes four hours to reach Neptune. | https://science.nasa.gov/neptune/facts/ | "From this distance, it takes sunlight 4 hours to travel from the Sun to Neptune." |
| 77 | 14.2 | The windiest planet; winds faster than 2,000 km/h. | https://science.nasa.gov/neptune/facts/ | "Neptune is our solar system's windiest world. … These winds whip clouds of frozen methane across the planet at speeds of more than 1,200 miles per hour (2,000 kilometers per hour)." |
| 78 | 14.3 | You can't see Neptune with just your eyes (binoculars or a telescope can show it). | https://science.nasa.gov/solar-system/skywatching/whats-up-september-2026-skywatching-tips-from-nasa/; https://science.nasa.gov/neptune/facts/ | "At around magnitude 8, it's too faint to see with the unaided eye …so you'll need binoculars or a telescope to spot it."; "Neptune is the only planet in our solar system not visible to the naked eye" |
| 79 | 14.3 | It was found with sums (mathematics) first. | https://science.nasa.gov/neptune/facts/ | "the ice giant became the first planet located through mathematical predictions rather than through regular observations of the sky." |
| 80 | 14.3 | A Neptune year is 165 Earth years; since its discovery it has been round the Sun only once. | https://science.nasa.gov/neptune/facts/ | "Neptune makes a complete orbit around the Sun (a year in Neptunian time) in about 165 Earth years"; "In 2011 Neptune completed its first 165-year orbit since its discovery in 1846." |
| 81 | 15.1 | Pluto is a dwarf planet with a "heart" (shown). | https://science.nasa.gov/dwarf-planets/pluto/facts/ | "Pluto was reclassified as a dwarf planet in 2006 by the International Astronomical Union."; "This image showing Pluto's "heart" was taken by NASA's New Horizons spacecraft on July 13, 2015" |
| 82 | 15.1 | Pluto is smaller than our Moon. | https://science.nasa.gov/dwarf-planets/pluto/facts/ | "Pluto is about two-thirds the diameter of Earth's Moon" |
| 83 | 15.1 | Charon, its moon, is about half its size (shown). | https://science.nasa.gov/dwarf-planets/pluto/facts/ | "Charon is about half the size of Pluto itself" |
| 84 | 15.1 | Pluto was named by an eleven-year-old girl at breakfast with her grandfather. | https://science.nasa.gov/people/venetia-burney-phair/ | "as an 11-year-old schoolgirl you named Pluto"; "Phair said she offered the name Pluto over breakfast with her mother and grandfather. It was March 14, 1930" |
| 85 | 15.2 | Pluto is in the Kuiper Belt, a huge ring (doughnut) of icy worlds past Neptune; maybe millions of them. | https://science.nasa.gov/solar-system/kuiper-belt/facts/ | "The Kuiper Belt is a large, doughnut-shaped region of icy bodies extending far beyond the orbit of Neptune."; "Astronomers think there are millions of small, icy objects in this region" |
| 86 | 15.3 | On average, sunlight takes about five and a half hours to reach Pluto (at its average distance, 39 AU; its orbit runs from 30 to 49.3 AU, so the time is shorter when Pluto is nearer, hence "on average"). | https://science.nasa.gov/dwarf-planets/pluto/facts/ | "But on average, Pluto is 3.7 billion miles (5.9 billion kilometers) away from the Sun, or 39 AU."; "From this distance, it takes sunlight 5.5 hours to travel from the Sun to Pluto." |
| 87 | 15.3 | Voyager 1 is so far that its messages take a whole day to reach home (one light-day, reached 18 November 2026). | https://science.nasa.gov/mission/voyager/voyager-1/ | "Voyager 1 is on the brink of another unprecedented milestone — reaching a distance one light-day away from Earth."; "The milestone Voyager 1 will reach on Wednesday, Nov. 18, is about distance, not time. And it's very, very far — more than 16 billion miles" |
| 88 | 15.3 (shown) | The orbits' sizes and the planets' periods in the orrery are true to scale (Mercury 0.39 AU … Neptune 30 AU; Pluto 30–49 AU; the Kuiper Belt from 30 to about 50 AU). | https://science.nasa.gov/solar-system/kuiper-belt/facts/; https://science.nasa.gov/dwarf-planets/pluto/facts/ | "Its inner edge begins at the orbit of Neptune, at about 30 AU from the Sun. … The inner, main region of the Kuiper Belt ends around 50 AU from the Sun."; "Pluto's 248-year-long, oval-shaped orbit can take it as far as 49.3 astronomical units (AU) from the Sun, and as close as 30 AU." |
| 89 | 15.4 | Our Sun is one of more than a hundred billion stars in our galaxy. | https://science.nasa.gov/universe/stars/ | "Our Milky Way alone contains more than 100 billion, including our most well-studied star, the Sun." |
| 90 | 15.5 | In 1990, from beyond Neptune, Voyager 1 looked back one last time and photographed Earth: a single point of light. | https://science.nasa.gov/mission/voyager/voyager-1s-pale-blue-dot/ | "The Pale Blue Dot is a photograph of Earth taken Feb. 14, 1990, by NASA's Voyager 1 at a distance of 3.7 billion miles (6 billion kilometers) from the Sun."; "beyond Neptune … when mission managers commanded it to look back toward home for a final time."; "Earth was just a point of light about a pixel in size." |
| 91 | 15.5 (shown) | Earth in a scattered ray of sunlight. | https://science.nasa.gov/mission/voyager/voyager-1s-pale-blue-dot/ | "The picture that would become known as the Pale Blue Dot shows Earth within a scattered ray of sunlight." |
| 92 | 15.5 | Gran's "That's us" echoes Carl Sagan on the photo (not a quote of him). | https://science.nasa.gov/mission/voyager/voyager-1s-pale-blue-dot/ | ""Look again at that dot. That's here. That's home. That's us."" |
| 93 | 16.3 | Venus can shine at dawn as the "morning star", near the Sun. | https://science.nasa.gov/venus/facts/ | "even thinking it was two objects: a morning star and an evening star."; "Because Venus' orbit is closer to the Sun than ours, the two of them — from our viewpoint — never stray far from each other." |
| 94 | 16.4 | Sunrise: the Earth's turning brings our side back round to face the Sun ("back round", not "all the way round": a full spin takes a day; overnight our side turns only part of the way). | as #3; https://science.nasa.gov/earth/facts/ | as #3; "As Earth orbits the Sun, it completes one rotation every 23.9 hours." |
| 95 | All space scenes (shown) | The Sun's glow shrinks with distance (core ∝ 1 / mean distance from the Sun: 0.12 / AU, Mercury 0.31 … Pluto 0.003). | https://science.nasa.gov/mercury/facts/ (#15) and the distances on each planet's facts page | e.g. "Saturn is 9.5 astronomical units away from the Sun"; "Neptune is 30 astronomical units away from the Sun" |
| 96 | 14.1–14.2 (shown) | Neptune's true colour: a pale blue only a shade bluer than Uranus, not the deep blue of Voyager 2's contrast-boosted pictures. | https://science.nasa.gov/neptune/facts/ | "Many images of Neptune, coming from the Voyager 2 flyby in 1989, show Neptune as a much deeper blue."; "This was because the Voyager team tweaked the images, to better reveal clouds and other distinctive features on the planet"; "Researchers in 2024 re-processed the images, showing the planets look much more alike than many thought." |
| 97 | 15.1–15.2 (shown) | The Kuiper Belt is almost all empty space: near Pluto, only a far icy speck or two (the belt as a band is shown only on the orrery, 15.3). | https://science.nasa.gov/solar-system/kuiper-belt/facts/ | "the total mass of all the material in the Kuiper Belt is estimated to be no more than about 10% of the mass of Earth"; "its inner edge begins at the orbit of Neptune, at about 30 AU from the Sun." (the main belt ends around 50 AU) |

## Pieces cinecode doesn't have

Everything else is built in or already made: the hill, telescope, space kit, every body including `pluto` and
`charon` (now in `engine/paint/planets.mjs`), and the effects `eyepiece`, `starstream`, `sunglow`, `skydot`, `orbit`,
`sizerow`, `moonlets`, `debris`. `sunbeam` and `ringfield` exist in `films/saturn/effects/`: move them to the
project's `cinecode/effects/` so both films load them (or copy them into this film's `effects/`).

1. **`orrery`** (new effect, Parts 2 and 11; build-effect). A top-down map of the solar system on the space set's
   black: the Sun a glowing disc in the middle; the orbits as faint dotted rings at their true relative sizes
   (Mercury 0.39 AU, Venus 0.72, Earth 1, Mars 1.52, Jupiter 5.2, Saturn 9.5, Uranus 19.2, Neptune 30; Pluto's
   tilted, off-centre oval 30–49 AU; the Kuiper Belt as a misty band of icy specks 30–50 AU); each planet a small
   painted disc (`drawBody`, sizes exaggerated so they read) going round at its true period (88, 225, 365.25, 687,
   4,333, 10,756, 30,687, 60,190 days; Pluto 248 years). Params: `bodies` (which to show), `years` (Earth years
   that pass over the beat, e.g. 8), `counters` (inked lap numbers beside chosen bodies, ticking each lap: Earth and
   Mercury in 4.2), `au` / `auTo` (half the frame width in AU at the start and end: 1.3 → 1.3 in 4.2, 1.6 → 60 in
   15.3, eased, the inner planets shrinking to a bright knot). Drawn over the starfield, under the captions, with no
   planet actor in frame.
2. **A row of Earths between Earth and the Moon** (8.1), only if a hidden stand-in won't work: `sizerow` centres
   its row on its planet, so it needs an Earth at the midpoint drawn invisibly (scene actor at opacity 0 from the
   first frame). If the rig can't start invisible, a ten-line film effect (a copy of `sizerow` that starts its row at
   one body's limb and lays `n` Earths toward another) does it. Either way, 29 Earths centred in the gap (facts #31).
3. **Neptune's true colour** (engine preset, Part 10; facts #96). The `neptune` body in `engine/paint/planets.mjs` is
   Voyager's contrast-boosted deep blue (`base` `#3d5fc0`). Repaint it a pale greenish blue a shade bluer than Uranus
   (`#a6d8dc`): `base` `#8cc0dc`, the bands and the softened dark spot as in Scene 14's starting places. Until then,
   Scene 14 passes the same colours on the actor, which `bodyOf` merges over the preset.
