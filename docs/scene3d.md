# 3D films: `"format": { "engine": "3d" }`

One field in `film.json` switches a film's picture from the flat 2D drawing to the 3D engine (`engine/scene3d`):

```json
"format": { "width": 1920, "height": 1080, "fps": 24, "captions": "all", "engine": "3d" }
```

Without it (or with `"engine": "2d"`) nothing changes anywhere: a film is the 2D film it always was, and the 3D
packages are never loaded. `films/_test3d/film.json` is a complete example (a man, a girl, a cat and a ball in the
living room in two scenes, the second at twilight: about 24 s of picture between an opening and an end card).

## What stays the same

The storyboard language is the one in [storyboard.md](storyboard.md): scenes, shots, beats, `say`, `do`, camera
`size` / `on` / `move` / `angle`, `time`, titles, captions, music, ambience and sfx. The film compiler still does all of
the timing, the voices, the captions, the score and the mix, so lines, music, sfx, the `.srt`, `verify` and the
segment join are exactly as in a 2D film; only how long each action takes comes from the 3D actors (below). Opening and end cards, title beats, burned-in captions and fades are drawn by
the same 2D code and laid over the 3D picture, so they look the same.

## What changes underneath

- **A cast entry's `rig`** names a 3D character: `man`, `girl`, `cat`, the prop `ball`, or the `car` (a small rounded
  teal hatchback; `"params": { "color": "#c0503a" }` paints it another colour). See [the house, the car, the ball and
  the cat](#the-house-the-car-the-ball-and-the-cat).
- **A set's `kit`** names a 3D place:
  - `room` (the living room). Its anchors are `centre`, `rug_left`, `rug_right`, `rug_front`, `rug_back`, `sofa`,
    `window`, `lamp`, `door_left`, `by_camera`; `left` / `right` entrances start at the door on the left and beside
    the camera on the right.
  - `home`: the same living room inside a small house, with a hall and a front door, the front garden, a gravel
    drive, the street and the houses across it, and a sky, built once: a scene's shots may frame it from inside or
    from outside, shot by shot, and a camera inside sees the garden and the street through the window (one outside
    sees into the room). Each shot is framed from the area (`inside` or `outside`) where the actors it is `on` (or the
    anchors and points it names; everyone when it names none) mostly stand during it; its camera's `"area"` says
    which outright (`"camera": { "size": "medium", "on": ["milo"], "area": "inside" }`). Its light is the place's own
    for that side (indoors the room's fills, outdoors more sky; at `twilight` the room's lamp and the porch lantern
    are lit, and the window glows from outside). A set may name an `area` too
    (`"sets": { "home": { "kit": "home", "area": "outside" } }`): its shots are framed from it when their subjects do
    not say. A film may use several sets of one kit. `time`: `golden` or `twilight`. Anchors, `[x, z]`
    in metres in the room's axes (the garden is toward -z): inside `centre`, `rug`, `sofa`, `window_seat` (0.39 m
    high: the cat leaps onto it), `window`, `hall`, `door_inside` (beside the front door, clear of its swing);
    outside `door` and `step` (on the flush doorstep), `path`, `gate`, `lawn`, `pavement`, `street_left`,
    `street_right` (the street's ends, where `left` / `right` entrances start), `drive` (the middle of a car parked
    facing the house), `drive_door` (where its driver stands, clear of the car's door). Two-legged actors sit on the
    sofa (not on the window seat). The front door opens and closes (`open`, `close`), and a move may pass through
    it only while it stands open; no move goes through a wall (below).
- **A point `"x:…,y:…"`** is a mark on the floor, in centimetres: `x` = 2000 + 100 × metres to the right of the
  room's middle, `y` = 1000 + 100 × metres toward the camera. `"x:2180,y:1060"` is 1.8 m right, 0.6 m forward.
- **`time`** picks the sun: `morning`, `noon`, `golden` (the default), `twilight`, `night`.
- **`do` beats** become the 3D performers' verbs:

  | rig | can do |
  |---|---|
  | `man`, `girl` | `walk`, `run`, `enter`, `exit`, `turn`, `look`, `pose` (`crouch`, `sit`, `stand`), `sit`, `stand`, `gesture` (`wave`, `point`, `clap`, `jump`), `emote` (`neutral`, `happy`, `surprised`, `sad`, `angry`), `blink`, `place` (only out of a car), and `say` (the mouth follows the line: the voice's loudness once it is voiced, a syllable rhythm from the line's timing before) |
  | `cat` | `walk`, `run` (a trot), `hop` (a leap of 0.2 to 2 m, down off the sofa, up onto it or along the floor; a mark more than about 60° off its heading is turned to first; at `"near:<ball>"` a pounce), `enter`, `exit`, `turn`, `look`, `sit`, `stand`, `gesture` `skid`, `meow` |
  | `ball` | `hop` (thrown from the hands it starts in; to `"on:<actor>"`: picked up), `roll` |
  | `car` | `drive`, `stop`, `set` (`lights`, `engine`) |
  | (none) | `open`, `close`: the front door (`"to": "door"`) or a car's door (`"to": "<car>"`) |

  A move goes to the place its beat names; a `turn` turns to the beat's `face`. A two-legged actor sent to a mark
  on a seat (`"to": "sofa"`) stops in front of it; `sit` then turns its back to the seat, steps back and sits on it
  (away from a seat it sits on the floor), and `stand` gets up again. A sitting actor must `stand` before it moves
  (`check` says so: `man is sitting: give it a "stand" first`); a sitting cat stands by itself for a `turn` or a
  `hop`.
- **Timing.** Each action takes as long as the 3D actor really needs from where it stands, at its own pace (`speed`
  scales it): the film compiler acts every beat out on the 3D motion system as it lays the film out (no GPU), so a
  walk, a run, a turn (a half turn is about 1.5 s), a crouch, a jump, a cat's leap or sit, a throw (until the ball
  rests on its mark) lasts in the plan, the captions, the sound cues (footsteps come from the 3D feet) and the shot
  lengths exactly as long as on screen, and beats that follow it wait for it as in a 2D film. An action that moves an
  actor (all of the above) starts at its beat's time; if that actor is still busy with the one before, it starts as
  soon as that one ends, and `check` / `plan` warn (`shot s01-01: man's turn (beats[5]) waits 1.20 s, ...`). Looks,
  expressions, lines and the gestures `wave`, `point`, `clap` are laid over whatever the actor is doing. So write
  beats one after another (or `with` / `after` another) and they play as written: `films/_test3d` is written that way.
- **The acting** is the motion system's (docs/scene3d-motion.md): looks move the eyes first and the head after,
  `emote` is held until the next one, `wave`, `point` and `clap` are its gestures, the ball is held and thrown with
  `holdBall`, and every actor breathes, blinks, shifts its weight and glances about between beats. A spoken line opens
  the mouth over whatever expression is on.
- **The camera** is a real lens. `size` (`establishing`, `wide`, `full`, `medium`, `close`, `extreme-close`) is solved
  from the joints of the actors the shot is `on` (everyone when it names none), with their heads kept inside the
  frame and above the caption band. Where the room stops the camera from standing back far enough (a high angle under
  the ceiling), it takes a wider lens rather than cut into the framing. Every `move` works (`static`, `push-in`, `pull-out`, `pan`, `track`, `tilt-up`,
  `tilt-down`, `handheld`), with `to`, `toOn`, `zoom`, `zoomTo`, `moveAt`, `moveDur`; `angle` is `eye`, `low` or `high`.
- **Words over the picture** keep clear of the faces and hands the camera shows (the actors' projected joints): a
  caption takes the bottom band unless the top one covers less of them; a title beat goes to its `place` (none: a
  little above the middle) or, if that covers a face or a hand, to the nearest other title place that does not. Each
  is placed once for all the time it is up, so it never jumps. (`films/_test3d`'s "Catch!" asks for `upper`, where
  the man's waving hand is, and sits at `top`.)
- **Motion blur**: every shot is drawn with the cheap vector blur (a shutter open for half a frame, never across a
  cut).

## The house, the car, the ball and the cat

Everything here works in the place `home` (the car's road and drive, the front door and the walls are the place's)
and is checked by `check`, `plan` and `lint` with no GPU. `films/_test3d` does not use it; the scratch storyboard
`cinecode-plan/scratch/film1work/port-wire/wire/film.json` uses every beat below.

**Starting places** (a scene's `actors`):

- `"milo": { "at": "rug", "pose": "sit" }`: a two-legged actor starts sitting (on the floor, or on the seat its mark is
  on); `"pose": "crouch"` starts crouched. (A cat may start `"pose": "sit"`.)
- `"milo": { "at": "step", "face": "dad" }`: an actor may start facing a place: `left`, `right`, an anchor (`"lawn"`),
  a point `"x:…,y:…"` or another actor of the scene that stands `at` a place.
- `"ball": { "on": "milo" }`: the ball starts in Milo's hands; `"ball": { "at": "step" }` on the floor.
- `"car": { "at": "street_left" }`: the car stands on the road in its middle, heading for the place's middle (from
  `street_left` toward `street_right`); at `drive`, parked facing the house; anywhere else facing its `face`.
- `"dad": { "on": "car" }`: Dad rides at the wheel of the car (drawn in the driver's seat, hands on the wheel, looking
  down the road) until a `place` puts him out. A car takes one rider. He cannot `walk` or do anything else until then
  (`check`: `dad is at the wheel of car: give it a "place" beside the car first`).

**The car** (`"rig": "car"`):

| beat | does | lasts |
|---|---|---|
| `{ "do": "drive", "who": "car", "to": "drive" }` | drives along the road's middle and turns into the drive (the place's road and drive: `street_left`, `street_right`, a point on the road, `drive`), at its own pace (5 m/s on the straight, slower for the turn; `speed` scales it), speeding up, braking (the body dips) and stopping with its middle on the mark, wheels straight. The first drive at a scene's very start comes in already moving. | until it stands |
| `… "dur": 7` | takes 7 s (the speed is found to fit) | 7 s |
| `… "arrive": 7` | stands on its mark 7 s after its shot starts | until then |
| `{ "do": "stop", "who": "car" }` | brakes now, whatever its drive was going to do, and stands where it comes to rest (written `with` its drive, `after` some seconds). The drive's beat keeps the time it was given. | until it stands |
| `{ "do": "set", "who": "car", "params": { "lights": "on", "engine": "off" } }` | the head and tail lamps on or off; the engine on (it idles: the body shakes a little; the brake lamps glow while it stands with the engine on) or off (a last shudder) | 0 |
| `{ "do": "open", "to": "car" }`, `{ "do": "close", "to": "car" }` | the driver's door swings open (0.9 s) or shut (0.55 s); `"dur": 0` opens it at once (at a cut), `"dur"` / `"speed"` change it | 0 (laid over) |
| `{ "do": "place", "who": "dad", "to": "drive_door", "face": "left" }` | the rider is out of the car, standing at the mark (by default facing the way the car faces); put it at a cut (no climbing out on screen). The car must have stopped. | 0 |

A drive cannot go backward (`car cannot drive to street_left: that is behind it on the road, and a car drives
forward only`), cannot leave the drive once parked, and says when it cannot keep a `dur` or `arrive` (`car cannot
drive to drive in 3.00 s: it takes at least 6.4 s ...`). The car's sounds are the film's own sfx beats (the
`car-far`, `car-arrive`, `car-door` of a film's `effects/`), timed by the writer: `car-arrive`'s `stop` is the drive's
`dur`.

**The front door** (the place's `door`):

| beat | does |
|---|---|
| `{ "do": "open", "to": "door" }` | the door is flung open: it swings into the hall, bangs on its stop and settles (the `door-open` sound hits 0.42 s after) |
| `{ "do": "close", "to": "door" }` | it swings shut softly and latches (the `door-close` sound meets the frame 0.38 s after) |
| `"speed": 2` | faster (or slower, below 1); `"dur": 0` at once |

| `"who": "milo"` | a two-legged actor's hand is on it: the nearer free arm (not one carrying a briefcase) reaches for the handle half a second before, rides it while the door swings, and lets go (at once when the door swings toward the actor, as a door pulled open; about a second later when pushed). Out of reach (over 1.15 arm lengths) the hand fades off. The same works on a car's door (`"to": "car"`). Stand the actor clear of the door's sweep: lint checks the arm against the leaf too |

Without `"who"` the door swings by itself; no one is seen to push it. A walk, run or a cat's
trot or leap whose straight line crosses the house front passes through the doorway only while the door stands open
(at least 3/4) when it gets there (`milo goes through the front door at 31.20 s while it is shut: open it before`); a
line through a wall where there is no opening is refused with the anchor to go by (`milo's way from [0.40, -0.10] to
[3.76, -3.00] goes through the front of the house: go by "door_inside" (two moves)`). The opening between the room
and the hall is passed only through its middle (go by `hall`).

**The ball** (`"rig": "ball"`):

| beat | does | lasts |
|---|---|---|
| `{ "do": "roll", "who": "ball", "to": "x:2200,y:985" }` | in the hands of a sitting (or crouched) actor: the hands take it down to the floor past the feet and push it off; it rolls straight to rest on the mark (slowing at 1 m/s², or in `"dur"` seconds). On the floor: it is set rolling from where it is then, still rolling or not. | until it rests |
| `… "from": "biscuit"` | the cat bats it: a fore paw goes out and meets it as it sets off. The cat's front paws must be within 0.3 m of it then (`biscuit's front paws are 0.47 m from ball ...`); written `"with": "prev"` on a pounce, the paw meets it as the cat lands (it squirts out from under the paws). | until it rests |
| `{ "do": "hop", "who": "ball", "to": "x:…" }` | thrown from the hands it starts in, as before | until it rests |
| `{ "do": "hop", "who": "ball", "to": "on:milo" }` | Milo picks it up: he walks up to it if it is out of reach (when he is free and it has stopped), crouches, takes it with his right hand and stands holding it in both hands; he carries it to the end of the scene. | until he stands |

A ball is batted on while it still rolls (a roll does not wait for the one before), and throws, rolls from the hands
and pick-ups need it where they say: `ball is in milo's hands: a ball is picked up off the floor`, `milo is standing:
it rolls ball along the floor sitting or crouched ... or throws it (a "hop")`.

**The cat**:

- `{ "do": "hop", "who": "biscuit", "to": "near:ball" }`: a pounce at the ball: it leaps to land with its front paws
  where the ball will be when it lands (rolling or not).
- `{ "do": "run", "who": "biscuit", "to": "near:ball" }` (or `walk`): it goes after the ball to where it comes to rest,
  and stops with the ball at its front paws, ready to bat it.
- `{ "do": "gesture", "who": "biscuit", "name": "skid" }`: it slides on 0.22 m on all four paws, low, and stands.
  A camera that tracks the cat cancels the slide: film a skid from a static camera.
- `{ "do": "gesture", "who": "biscuit", "name": "meow" }`: laid over whatever it does (sitting too), 0.7 s: the chin
  lifts, the ears go back, the eyes narrow, the tail tip curls and its mouth opens for about half a second (from
  0.02 s after the gesture; shut, the cat's face shows no mouth at all). The sound is the writer's sfx beat (put it
  about 0.05 s after the gesture, as the chin comes up). A cat that bats a ball watches the ball through the bat.
- `{ "do": "look", "who": "biscuit", "to": "window" }`: stops dead (any look holds its head on the target) with its
  ears forward, keen (a look always makes the cat alert); the sound is the writer's sfx beat.
- `{ "do": "hop", "who": "biscuit", "to": "window_seat" }` then `{ "do": "look", "who": "biscuit", "to": "car" }`:
  up onto the window seat (from at most 2 m: walk nearer first), and it watches the car (an actor, so its head follows
  it) or an anchor outside (`drive`).

**Footsteps** come from the 3D feet as in any 3D film, and in `home` they sound the ground they land on: boards in the room, tiles in the hall, paving on the step, the path, the pavement and the road, gravel in the drive, grass on the lawn. A cat's pads are near silent (its leaps' landings are heard as before), and the boy, in socks, treads at half the level of a shod foot, duller. A step is heard only in the area the shot's camera is in (its `camera.area`, else the set's), or within 1.5 m of the front door while it stands at least half open: once the door shuts, the walk into the hall is not heard from the garden.

**The film's own sounds.** A 3D film loads its own sound effects from its folder exactly as a 2D film does: the
`effects/*.mjs` files (and `custom.mjs` `sounds`) are loaded by `check`, and a beat `{ "sfx": "door-open" }` plays
one; `render` and `mix` use them (the scratch storyboard plays `garden-evening`, `ball-roll`, `cat-skid`, `car-far`,
`cat-meow`, `car-arrive`, `car-door`, `door-open` and `door-close` this way). Copy the files into the film's own
`effects/` folder (a 3D `render` starts over when a file in the film's folder changes; it does not follow links).

## The boy, Dad in his work clothes, and what they do

**The cast** (checked by `check`; a param a rig does not take, or a value it does not know, is named and stops):

- `"milo": { "rig": "boy" }`: Milo, a boy of about six (1.1 m): a big round head, short dark messy hair with a tuft
  and a cowlick that bounce, freckles, a yellow and white striped T-shirt, blue shorts, white socks
  (`engine/scene3d/cast/boy.mjs`). `"params": { "skin": "#rrggbb", "hair": "#rrggbb", "shirt": "#rrggbb", "shorts":
  "#rrggbb" }` recolours him (the hair colour is the brows' too; the stripes stay white); every param is optional.
- `"dad": { "rig": "man", "params": { "wardrobe": "work" } }`: the man in his work clothes (`cast/man-work.mjs`): the
  same body, head, beard and pace; a light blue shirt with rolled sleeves, grey trousers, brown shoes, and a briefcase
  in his right hand. The case hangs from his hand and swings with its own weight as he walks, turns and stops; when he
  crouches or sits his hand goes out low at his side and the case comes down just off the floor. He carries it in
  every scene (it is part of the wardrobe; it cannot be put down). At the wheel of the car the case is left out of the
  picture.
- `"car": { "rig": "car", "params": { "color": "#3a908e" } }` as before.

**What they do** (the storyboard's own words; every one passes `lint` on both, `test/scene3d-cast.test.mjs`):

| beat | the boy | Dad |
|---|---|---|
| `{ "do": "sit", "who": "milo" }` (or a scene start `"pose": "sit"`) | sits down on the floor where he stands, cross-legged (on a seat when his mark is on one) | the same |
| `{ "do": "roll", "who": "ball", "to": "x:…" }` | sitting with the ball in his hands: leans forward, takes it down past his feet and pushes it off | (crouched or sitting, the same) |
| `{ "do": "gesture", "who": "milo", "name": "clap" }` | claps well in front of his chest, about three times a second, 1.6 s, each clap a little wider or narrower than the last, thumbs up and palms facing, stopping where they meet (the fingers never cross); about three firm claps (no sound: lay a clap sfx on each meeting) | the same |
| `{ "do": "gesture", "who": "milo", "name": "laugh" }` | laughs: eyes squeezed, mouth open in a smile, head back a little, chest and shoulders shaking, 1.4 s (laid over whatever he does) | the same |
| `{ "do": "stand", "who": "milo" }` | gets up off the floor | the same |
| `{ "do": "run", "who": "milo", "to": "…" }` | runs at his own pace (his arms held out from his round belly) | runs |
| `{ "do": "gesture", "who": "milo", "name": "jump" }` | jumps on the spot (twice: two beats); a clap laid over it stays below his chin | the same |
| `{ "do": "look", "who": "milo", "to": "dad" }` | looks up at him: eyes first, then the head, held until the next look | the same |
| `{ "do": "emote", "who": "dad", "expr": "tired" }` | (any two-legged rig) | tired: shoulders low and forward, chest sunk, head hanging a little, arms heavy and swinging less, lids low, brows sagging; held until his next expression, and it walks with him. At a cut it is already there. |
| `{ "do": "emote", "who": "dad", "expr": "happy" }` after it | | the tired posture lifts over 0.6 s as the grin comes |
| `{ "do": "gesture", "who": "dad", "name": "sigh" }` | | breathes in and lifts, then lets it go, 1.6 s (laid over) |
| `{ "do": "pose", "who": "dad", "pose": "crouch" }`, then `"pose": "stand"` | | crouches to the boy's height, the case down at his side; stands |
| `{ "do": "walk", "who": "dad", "to": "…" }` | | walks with the case swinging (tired or not, as his expression is) |
| `"dad": { "on": "car" }` and a `drive` | | at the wheel, as before |

**Stage them so they read** (seen in the scratch storyboard `cinecode-plan/scratch/film1work/cast/film/film.json`):

- The cameras outside look from the street toward the house: Dad at `drive_door` is seen from behind whichever way
  he faces, so his tired face and his sigh do not read there. Give the tired beat a shot where he walks toward the
  street, or stands on the path facing it.
- A `full` on `door` while the boy runs out toward the street brings him into the lens (he fills the left edge):
  frame the run on him, or stop his run short of the camera.
- A wide shot outside makes them a few pixels high: the swing of the case, the grin and the jump do not read in it.
- The boy's run from a standstill turns his chest at 7.8 rad/s on its first step (gate 8): keep the run's first
  step out of a big turn (turn first).

## What is not built yet

`cinecode check` names each of these and stops (for example `sets.room.kit: kit "meadow" has no 3D version yet (3D
kits: home, room)`); nothing is skipped silently:

- any other rig or kit, custom rigs and kits (`custom.mjs`, `cinecode/rigs`, `cinecode/kits`), cast `params` other
  than a car's `color`, the man's `wardrobe` and the boy's colours, a cast `scale`, set `params`, sets of more than
  one kit in a film, an `area` its kit does not have (on a set or a camera);
- `do`: `fly`, `fade`, `custom`, `lie`, `sleep`, `wake`, `hop` for the man and the girl, `place` other than out of a
  car, `set` other than a car's `lights` and `engine`; a cat's leap longer than 2 m; a cat's gesture other than
  `skid`; a ball batted by anyone but a cat; a line the cat or the ball speaks on screen (`"vo": true` is fine); beat
  fields `gait`, `wade`, `depth`, `height`, `z`, `tilt`, `end`, `alpha`, `params` (but a car's `set`), `pose` on a
  move, `to: "on:<actor>"` (but a ball picked up); starting a scene riding (but a two-legged actor at the wheel of a
  car), posed other than sitting or crouched, at a depth, or a prop offstage;
- a car that reverses, turns round, or drives anywhere but along the road and into the drive (a mark off them is
  driven to straight); more than one rider; someone climbing in or out on screen; passengers;
- a person who picks the ball up in mid-stride (he stops, crouches and stands), throws or rolls a ball he has picked
  up, or carries something else; a person batting or kicking a ball; Dad putting his case down or handing it over;
- a named camera of the kit (`behind_milo`, `lawn_wide` ...): a storyboard camera is solved from its subjects and
  looks from its area's side (inside: from the room toward the window; outside: from the street toward the house);
- `fx` beats, scene `overlays`, `fx`, `grade`, `rim`, shot `time`, `grade`, `gradeTo`, a time of day that changes
  during a scene, dissolves between scenes (the default when the time changes: give `"transition": "cut"` or
  `"fade"`);
- camera `dof`, `offset`, `z`, `zTo`;
- `"style": "lineart"`.

## Commands

- `check`, `plan` and `lint` work on any machine, with no GPU: the film is built and posed, never drawn. `check`
  lays a 3D film out as `plan` does, so it stops on an action that cannot be played and prints the same warnings.
- `lint` on a 3D film runs the 3D checks, scene by scene, and writes `out/lint.json` (no `lint.jpg`): `feet-slide` and
  `paw-slide` (a planted foot moves), `collide` (two actors' bodies go more than 1 cm into each other, measured on
  capsules round their bones: give one another place or time), `turn-speed` (a head, chest or hips turns faster than
  8 rad/s over a frame, which smears under the motion blur: give the turn more time), and the motion gates of
  `check-motion` on every joint, 240 times a second: `pop` (a joint's speed jumps by 5 m/s or more in 1/240 s: a
  snap), `hold` (a joint dead still for a third of a second on screen: it reads frozen), `over-reach` (a leg or arm
  asked 5 mm or more past its length: usually a stride too long, or a mark the actor cannot reach), `through-body`
  (a hand or forearm 5 mm or more inside the body), `door-sweep` (the front door or a car's door, while it moves, goes
  more than 1 cm into an actor: it names the door, the actor, the part, the shot and the time; stand the actor clear of
  the swing, or move the door when the actor has passed) and the warning `door-brush` (it passes within 3 cm: on screen
  that reads as hitting),
  `head-out-of-frame` (a pan, or a push-in to other subjects, lets go of the ones it leaves), and the warnings
  `words-over-face` (a title or caption that found no place clear of faces and hands) and `subject-hidden` (the face
  of an actor the shot is on is behind another actor's head); the warnings of `check` / `plan` (an action that waits
  for the one before, a field the 3D engine ignores) are there too. An action that cannot be played as written stops
  `check`, `plan` and `lint` with its shot and beat (`shot s01-02, beats[0] (walk cat): cat is sitting: ...`); anything
  else thrown while a 3D film is staged reads `a fault in the 3D engine (not in the storyboard): <stack>`.
- `render`, `animatic` and `sheet` draw on the GPU. `sheet --frame` writes full-size stills; `--debug` draws over them the
  head (magenta) and hand (yellow) boxes the words keep clear of, the words' boxes (dashed) and the shot, its size,
  move, lens and distance. A contact-sheet still under the opening or end card is labelled as the card. `cinecode setup` has a `3d` row that says whether this machine has
  a GPU adapter; on one with none, `render` stops at once with a plain message. A 3D film renders in 1 process
  (`--jobs 2` at most): one GPU draws one frame at a time. `--from` / `--to` work as in 2D. The music and the mix
  are made in a process of their own while the picture is drawn. A 3D render that stops part way (killed, Ctrl-C, a
  crash) goes on from where it stopped when it is run again: its frames are encoded in segments of 20 s kept in
  `out/.<name>.mp4.parts/` until the film is done, and the finished file is the same bytes as an unbroken render's.
  A change to any of the film's files (film.json, voices, ...) or to the engine's code starts it over.
- The first frame of each render process costs about 4 to 5 s (the GPU starts and builds every pipeline the film
  will need); after that the 3D picture of a 1080p frame costs about 45 to 55 ms on an M1 Max. A 10-minute 3D film
  (37 scenes) rendered at 1080p in 14 m 54 s, 62 ms a frame with everything included, with other jobs on the machine:
  about 45 minutes for 30 minutes of film. Laying the words out clear of faces and hands adds about 0.8 ms a frame.
  See `engine/scene3d/PERF.md` and `engine/scene3d/STATUS.md`.
- The same frame gives the same bytes in every run on one machine; it is not promised across machines.
