# Rendering: the command line

```sh
node bin/cinecode.mjs <command> films/<slug> [options]
```

Run it from the repository root. The film argument is a folder holding a `film.json` (`films/my-film`, or any path),
a path to a `film.json`, or a bare slug (`my-film` → `films/my-film`). Options take `--name=value` or `--name value`;
`cinecode <command> --help` (or `cinecode help <command>`) prints a command's options, `cinecode --help` the list, and
`cinecode --version` the version.

Exit status: 0 done, 1 failed (including `lint` finding errors), 2 a usage error, 130 interrupted (Ctrl-C stops the
workers and encoders and cleans up; a second Ctrl-C exits at once).

## Commands

| command | does | writes |
|---|---|---|
| `new <slug>` | scaffold a film from `templates/` | `films/<slug>/film.json`, `screenplay.md`, `custom.mjs` |
| `check <film>` | validate `film.json` and load `custom.mjs` | nothing |
| `plan <film>` | compile and print the shot list | nothing |
| `voice <film>` | voice new or changed lines, with QA | `voices/<id>.wav` + `.json` |
| `sheet <film>` | contact sheet: the middle frame of every shot | `out/sheet.jpg` |
| `lint <film>` | staging and editing checks | `out/lint.json`, `out/lint.jpg` |
| `music <film>` | compose the score | `out/music.wav` |
| `mix <film>` | score + dialogue + effects + ambience, mastered | `out/music.wav`, `out/mix.wav` |
| `animatic <film>` | quick preview with sound | `out/animatic.mp4` (+ the mix) |
| `render <film>` | the final film | `out/<slug>.mp4`, `out/<slug>.srt` (+ the mix) |
| `cast-sheet [film] [kinds…]` | every rig in its poses and expressions | `out/cast-sheet.jpg` |
| `set-sheet [film] [kits…]` | every kit with anchors, footprints and walk regions | `out/set-sheet.jpg` |

`out/` is the film's own `films/<slug>/out/`, except for `cast-sheet` and `set-sheet` without a film, which write to
`out/` in the current folder.

### new

```sh
node bin/cinecode.mjs new my-film --title="The Lantern Moth"
```

Creates `films/my-film/` (or the path given, when it contains a `/`) from the files in `templates/`: a starter
`film.json` (one scene of six shots, about 39 s with its title cards: a girl, a hare and an owl in the meadow), `screenplay.md` with the
sections to fill in, and `custom.mjs` with a commented custom beat, overlay and sound. Every `{{title}}` in them
becomes the title (default: from the slug, `my-film` → "My Film"). It refuses to overwrite an existing `film.json`
and skips existing files unless `--force` is given.

### check and plan

```sh
node bin/cinecode.mjs check films/my-film
node bin/cinecode.mjs plan films/my-film
```

`check` lists every problem with its path in `film.json` ([storyboard.md](storyboard.md#checking-a-storyboard)).
`plan` compiles the film and prints its length and the shot list: id, set, size, start, length and the first line of
each shot. Unvoiced lines use an estimate, marked `~`. Neither prints warnings; the Claude Code skill's
`node .claude/skills/cinecode/scripts/warnings.mjs films/my-film` does.

```
compile  0:38.8, 6 shots, 0/5 lines voiced                        0.4 s
         (5 lines not voiced yet: timing uses estimates; run `cinecode voice`)

My Film — 0:38.8 · 6 shots · 1 scene · 1920×1080 @ 24 fps

shot      set       size             start    dur   lines
1.1       meadow    establishing    0:04.0   7.8s   ~narrator: "At the edge of the old forest, a girl named…
1.2       meadow    full            0:11.8   5.8s   ~pip: "Hello? Is anybody out here?"
1.3       meadow    medium          0:17.6   3.8s   ~hare: "Only me. I was having a nap."
1.4       meadow    full            0:21.4   4.3s   ~pip: "Then wake up! Race you to the pond!"
1.5       meadow    wide            0:25.7   2.3s
1.6       meadow    full            0:28.0   6.8s   ~narrator: "And that is how the summer began."

5 lines (5 estimated, marked ~) · 17 sfx · 1 music cues · 5 captions
```

The first shot starts at 0:04 because the opening title card comes first; the total (0:38.8) includes both title
cards, 4 s each here, so for a short film they are a big share of its length.

### voice

Needs `GEMINI_API_KEY`. Sends only lines missing from the cache, checks every take, and prints each line's length
and word error rate ([sound.md](sound.md#voices)).

### sheet

```sh
node bin/cinecode.mjs sheet films/my-film                     # middle frame of every shot
node bin/cinecode.mjs sheet films/my-film --t=12,0:40.5 --cols=2 --tile=960 -o films/my-film/out/two.jpg
```

| option | meaning | default |
|---|---|---|
| `--t=T,T,…` | draw these times (seconds or m:ss) instead of one frame per shot | |
| `--cols=N` | columns | 4 |
| `--tile=PX` | tile width in pixels | 480 |
| `-o`, `--out=PATH` | output file | `out/sheet.jpg` |

Each tile is labelled with its shot id, time and the caption or line at that moment.

For closer work there is a second tool with shot ids, points inside a shot, a debug overlay and full-size stills:

```sh
node engine/film/sheet.mjs films/<slug> films/<slug>/out/s01.jpg --shots=1.2,1.3 --cols=2 --tile=640
node engine/film/sheet.mjs films/<slug> films/<slug>/out/strip.jpg --shots=1.5@0.1,1.5@0.5,1.5@0.9 --cols=3
node engine/film/sheet.mjs films/<slug> films/<slug>/out/debug.jpg --shots=1.4 --debug
node engine/film/sheet.mjs films/<slug> films/<slug>/out/still.jpg --shots=1.6 --frame
```

`--shots=` takes shot ids, each at its middle or at `@u` (0..1 through the shot; `--u=` changes the default);
`--t=` takes seconds. `--debug` draws actor boxes (yellow while speaking), head boxes, contact points, solid
footprints and the caption box. `--frame` writes full-size stills instead of a sheet (one file per time).

### lint

`--step=S` sets the sampling step in seconds (default 1/6). See [lint.md](lint.md).

### music and mix

`music` composes the score to `out/music.wav`. `mix` composes it and mixes it with the cached dialogue, the
effects and the ambience, mastering to −16 LUFS in `out/mix.wav` ([sound.md](sound.md#the-mix)). Unvoiced lines are
left out with a warning.

### animatic

```sh
node bin/cinecode.mjs animatic films/my-film
node bin/cinecode.mjs animatic films/my-film --from=0:20 --to=0:40
```

Half resolution, 12 fps, x264 crf 23 `veryfast`, with sound. It mixes first when `out/mix.wav` is missing or older
than any file of the film (`film.json`, `custom.mjs`, `voices/`, …), otherwise reuses it.

| option | meaning | default |
|---|---|---|
| `-j`, `--jobs=N` | worker processes | CPUs − 1 |
| `--from=T`, `--to=T` | a part of the film (seconds or m:ss) | the whole film |
| `-o`, `--out=PATH` | output file | `out/animatic.mp4` |

### render

```sh
node bin/cinecode.mjs render films/my-film
node bin/cinecode.mjs render films/my-film --from=1:20 --to=1:40     # → out/my-film-80s.mp4
```

The steps, each printed as it finishes:

1. **voices**: from the cache. Missing lines are voiced first when `GEMINI_API_KEY` is set; without it the render
   stops and lists them.
2. **music** and **mix**: the score, the mix, and the master to −16 LUFS / −1.5 dBTP (`out/mix.wav`).
3. **srt**: every caption (dialogue, narration and sounds) to `out/<slug>.srt`.
4. **render**: the frames are split into contiguous ranges, one per worker process; each worker loads the film
   itself and pipes its frames into its own x264 encoder (`yuv420p`, BT.709, a keyframe every 2 s). The segments
   are joined without re-encoding, then the master audio (AAC 192 kbit/s, 48 kHz stereo) and the captions as soft
   subtitles (`mov_text`, off by default) are added.
5. **verify**: ffprobe checks the result (frame count, size, frame rate, duration, audio and subtitle streams)
   before it replaces the output file.

| option | meaning | default |
|---|---|---|
| `-j`, `--jobs=N` | worker processes | CPUs − 1 |
| `--from=T`, `--to=T` | render only this part, at full quality | the whole film |
| `-o`, `--out=PATH` | output file | `out/<slug>.mp4`, or `out/<slug>-<from>s.mp4` for a part |
| `--crf=N` | x264 quality (lower is better and bigger) | 17 |
| `--preset=NAME` | x264 preset | `slow` |
| `--keep` | keep the per-worker segment files | off |

Work in progress lives in a hidden `.<name>.mp4.parts/` folder next to the output and is removed at the end (kept with
`--keep`). The burned-in captions follow `format.captions` (`dialogue` by default); the `.srt` and the subtitle track
always hold all of them.

### cast-sheet and set-sheet

```sh
node bin/cinecode.mjs cast-sheet hare,tortoise -o out/two.jpg
node bin/cinecode.mjs set-sheet films/my-film meadow
```

With a film first, its own rigs and kits from `custom.mjs` are included and the sheet goes to the film's `out/`.
Names may be comma-separated; without names every rig or kit is drawn. See [cast.md](cast.md) and
[sets.md](sets.md).

## Environment

| variable | used for |
|---|---|
| `GEMINI_API_KEY` | voicing lines (`voice`, and `render` when lines are missing). Nothing else uses the network. |
| `CINECODE_FFMPEG`, `CINECODE_FFPROBE` | the ffmpeg and ffprobe binaries for video (default: from `PATH`). Mastering the mix always runs `ffmpeg` from `PATH`. |
| `CINECODE_DEBUG` | print stack traces on errors (and a worker's stack when a worker fails) |

## Performance

Measured on a 10-core Mac (Node 22, ffmpeg 7.1):

| | |
|---|---|
| Seventy-Six Summers, load and compile | 2–3 s |
| Seventy-Six Summers, one 1920×1080 frame in one process | about 0.7–0.85 s on average |
| the starter film, one 1920×1080 frame | about 0.12–0.13 s |
| the starter's animatic (466 frames, 9 workers) | 31 s in all, including the mix |

A frame's cost depends on what is in it: painted sets are cached after the first frame a worker draws, while depth of
field, night grades, many actors and fields of particles cost more. The render scales with cores (`-j`). For quick
looks, use contact sheets and strips (seconds) and the animatic (a quarter of the pixels at half the frame rate)
before a full render, and `--from`/`--to` to check one sequence at full quality.
