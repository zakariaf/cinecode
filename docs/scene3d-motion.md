# Staging motion in the 3D engine

How to make characters act in a 3D scene: the verbs a two-legged performer and a four-legged critter know, the
gestures, looks and faces laid over them, the world they share, the thrown ball, and the checks that every
scene must pass. `engine/scene3d/scenes/zero.mjs` is the worked example; read it beside this page.

Units are metres, seconds and radians. A floor mark is `[x, z]` for a person and `[x, y, z]` for an animal
(y is the floor or seat it stands on). Yaw 0 faces +z; positive yaw turns toward +x.

## Two layers: the plan, then the performance

Calling a verb **lays out the plan**: footsteps with times, the path of the body, headings, crouch and sit keys,
the windows of gestures and looks. Nothing is posed while you do this. Then **the performance** reads every
pose off the plan as a function of time, in any order, in any process: `act.apply(t)` poses the bones,
`act.poseAt(t)` returns the numbers only.

Verbs follow one another. Each starts where the last one ended (`act.time`) unless you give it `t0`, and returns
the time it ends, so

```js
man.walkTo([0.95, -0.45], { face: 'girl' });   // walks in, turns to her out of the last step
man.crouchTo(1);                                 // starts when the turn is done
man.wait(1.5);
man.crouchTo(0, { dur: 0.9 });
```

is a script. Gestures, looks and faces (`wave`, `point`, `lookAt`, `express`, ...) are laid over the verbs in
their own time windows and do **not** move `time`; they start at `time` if no `t0` is given.

Lay out each actor's whole plan before another actor reads it (a look, `turnTo('girl')`, the cat following
the ball): what is read is the plan as it stands at the moment it is read. Looks and reaches read their
targets late (at the first pose), so they may name anyone.

## The world

```js
import { createWorld } from '../motion.mjs';
const world = createWorld();
const girl = createPerformer(rig, { world, name: 'girl', at, yaw });   // registers itself
world.add('ball', (t) => ball.at(t).pos);                              // a thing: a function of time
world.where('girl', t);   // [x, 0, z] where she stands at t
world.head('girl', t);    // her eyes at t: what to look at; for a thing, its point
world.radius('girl');     // how wide she is round her middle (m), for walking round her
```

In a world, a walk or a trot bows round anyone who will be standing in its way when it gets there (`detour` in
motion.mjs: up to three smooth bumps, each keeping both bodies' radii plus 4 cm apart). A run does not steer.

Anywhere a verb takes a **target** you may give a point `[x, y, z]`, a function of time returning one, or the
name of anything in the world (its head is looked at). `turnTo` and `face` also take a floor mark `[x, z]` or a
heading (a number). Asking for a name the world does not have fails with the names it does have.

## A person: `createPerformer(rig, opts)`

`rig` is `createBiped(buildCharacter(desc))`. Options:

| option | default | what it is |
|---|---|---|
| `at`, `yaw` | `[0, 0]`, 0 | where it stands at the start and which way it faces |
| `world`, `name` | | join a world under this name |
| `seed` | 1 | everything that varies (blinks, eye darts, weight shifts, step heights, jumps, waves) is seeded from it: give each actor its own |
| `stepLen`, `stepTime` | 0.5, 0.5 | the walk's step length (m) and time (s) |
| `armSwing`, `armSpread` | 0.5, from the rig | how far the arms swing in a walk and how far they hang out from the body |
| `toeOut` | 0.13 | feet turned out (rad) |
| `idle` | 1 | how much idle life: weight shifts, head drift, small arm and finger moves (breathing, blinks and eye darts stay at 0) |

### Verbs (they move the clock)

| verb | parameters | what it looks like |
|---|---|---|
| `walkTo(to, o)` | `stepLen`, `stepTime`, `first: 'L'\|'R'`, `face`, `through`, `t0` | Footsteps to the mark (one more than 60 degrees round, `TURN_FIRST` = 1.05 rad, is turned to first, on the spot; a smaller turn is taken in the steps, the outside foot first). Steps are at most 15 % longer than `stepLen` (a short walk takes one more step rather than one stride the legs cannot reach). The body rises as a leg passes under it and sinks as the feet spread; hips ride over the foot that carries the weight; arms swing against the legs a beat late; the body leans into the start and rocks back when it stops. With `face` it turns to that target straight out of the last step, the trailing foot first (no stop between); `through` as in `turnTo`. |
| `runTo(to, o)` | `stepLen` (0.5 × size), `stepTime` (0.19), `air` (0.3), `face`, `t0` | Quick steps with both feet off the floor between them, a lower body, forearms up, a bounce. It pulls up in two braking steps; with `face` it swings round on them to face the target as it stops (more time for a bigger swing). |
| `turnTo(target, o)` | `stepTime` (0.44), `per` (1.45: most one pair of steps turns), `through`, `t0` | Steps round on the spot: eyes first, then head, shoulders, hips, feet. The heading eases round over most of the turn (a half turn takes about 0.9 s), never in a step. The short way round, unless `through` names a point the turn must face on the way (give the camera for a turn through a front view, never the back). |
| `crouchTo(amount, o)` | `dur` (0.7), `t0` | 0 standing, 1 squatting. A small rise first, then down through a spring that dips and settles; the hands go to the knees. Back to 0 to stand. |
| `sit(o)` | `on: [x, y, z]` (the seat under the hips; leave out for the floor), `dur` (1.1), `t0` | Walk to just in front of the seat; a seat not behind it is turned from first, and the feet shuffle (two short steps, 0.6 s) to half a leg in front of it. The body hinges forward at the hips as they go back and down, then sits up; hands rest on the thighs; it breathes and its weight drifts while it sits. On the floor the legs slide out in front, heels down. |
| `stand(o)` | `dur` (0), `t0` | From a seat it leans forward until its weight is over its feet, then rises, coming upright as it straightens (feet back under it first, from the floor); then holds for `dur`. |
| `jump(o)` | `height` (0.2 × size, of the feet), `sink` (0.32), `turn` (rad, turned in the air), `t0` | Sink, push off at full speed, a true parabola with the arms flung up, land into a squash, rise and settle. Sink and fling are seeded per jump but vary only a little: two jumps in a row read alike. |
| `wait(dur)` | | Hold. Idle life goes on: breathing, blinks, eye darts, a slow shift of the weight and drift of the head. |

The older forms `walk({ t0, to, ... })`, `run({ ... })`, `turn({ t0, yaw | by, ... })`, `crouch({ t0, dur,
amount })` are the same verbs with the target in the object; `walk({ close: false })` leaves the last step open
for a turn.

### Gestures, looks and faces (they do not move the clock)

| layer | parameters | what it looks like |
|---|---|---|
| `lookAt(target, o)` | `t0`, `t1` (or `dur`; open-ended if neither), `ease` (0.35) | The eyes get there first (a fast spring), the head follows with a lag (a slow one, never faster than `HEAD_TURN`, 3.5 rad/s: an 80 degree look takes about half a second), the chest a fifth of the way and later still (its own slower spring). While a look holds, the head keeps drifting a few degrees about the point (idle life), so a listener is never a statue. A later look wins while it is on; when it ends the gaze slides back. A target more than 80 degrees round is let go of, all of it by straight behind, and taken up again as the body turns. Each new look starts with a blink. |
| `express(name, o)` | `t0`, `t1` (or `dur` 1.5), `amount` (1), `ease` (0.25) | One of the character's expressions (`happy worried surprised sad sleepy angry`: brows, lids, mouth). Overlapping ones mix. |
| `tired(o)` | `t0`, `t1` (open-ended), `amount` (1), `ease` (0.6) | A posture: shoulders low and forward, chest sunk, head hanging a little, arms heavy and swinging less, lids lower, brows sagging. It walks with the body. |
| `sigh(o)` | `t0`, `dur` (1.6) | The chest fills and lifts, then lets go: shoulders and head drop a little below where they were and come back; the lids lower on the way out. |
| `laugh(o)` | `t0`, `dur` (1.4) | The face laughs (eyes squeezed, open smile), the head tips back a little, chest and shoulders shake about 4.5 times a second, dying away. |
| `wave(o)` | `arm` ('R'), `dur` (2.5), `rate` (2 a second), `t0` | The arm goes up past its place and settles, the forearm rocks from the elbow, the hand a beat behind; the shoulder lifts, the body sways, the other arm lifts off the side. Amplitude and rhythm drift a little. |
| `point(o)` | `at` (target), `arm` ('R'), `dur` (1.5), `t0` | The arm straight out at the target, index finger out, a small overshoot; the head looks along the arm. |
| `clap(o)` | `dur` (2), `rate` (3.1 a second), `t0` | Hands meet well in front of the chest, elbows down, thumbs up and palms facing, a little unevenly, and stop where they meet (the fingers never cross); higher in a jump, but never above three quarters of the way from the shoulders to the mouth. |
| `reach(o)` | `to` (target), `arm` ('R'), `dur` (1), `t0` | The hand goes for the target and comes back. It chases the target on a spring, so a flying ball is followed (and missed), never snapped to; never farther than the arm. |
| `holdBall(o)` | `r`, `t0`, `t1`; for a throw `release`, `aim: { to: [x, z], vy }` or `{ to, land: time }`, `ball: { bounce, grip, roll, stop, ... }` | Both hands on a ball in front of the chest. With `release`: pull it in and lean back, drive it up and out, up on the toes, let go, the hands follow it and drop. Returns `{ at(t), path() }`: where the ball is at any time (in the hands, then its flight). `carry(o)` is the same with no throw. |
| `layer(fn)` | `fn(pose, t, ctx)` | Anything particular to one scene. It may set `pose.hand = { L: { to, w, elbowDir, wrist, curl, thumb, fan } }` or `pose.after = (pose, out, ctx) => {}`. |

Two asks for the same hand at the same time (two `reach`es, a `clap` during a `holdBall`) are mixed by their weights.

### Read-out

`apply(t)` → `{ pose, out, ctx }` (poses the bones), `poseAt(t)`, `where(t)`, `headAt(t)`, `heading(t)`,
`footAt('L'|'R', t)`, `time`, `cur` (`pos`, `yaw` where the plan ends), `radius` (round the middle, for steering).

## An animal: `createCritter(rig, opts)`

`rig` is `createQuadruped(buildCharacter(desc))`. Options: `at: [x, y, z]`, `yaw`, `sit` (1 to start sitting),
`seed`, `world`, `name`, `tailSide` (which side the tail lies when sitting), `idle`.

| verb | parameters | what it looks like |
|---|---|---|
| `walkTo(to, o)` | `stride` (0.2), `beat` (0.15), `t0` | One paw at a time: hind, fore on the same side, then the other side. A mark more than 30 degrees off the way it faces is turned to first (`turnTo`); in a world the way bows round others, as for a person. |
| `trotTo(to, o)` | `stride` (0.24), `beat` (0.12), `t0` | Diagonal pairs. It gets going over a few shorter steps and closes up at the mark; it carries itself a little lower while moving and the body stays level (the paws lift, the body does not). |
| `runTo(to, o)` | `stride` (0.3), `beat` (0.1), `t0` | A fast trot whose steps overlap, so for a moment all four paws are off the floor. Not a gallop. |
| `hopTo(to, o)` | `yaw`, `air` (worked out), `t0` | A leap of 0.2 to 2 m to a mark higher, lower or level (off a sofa, onto it): it gathers itself, pushes off, flies on a true parabola (chest and hips each on their own, the paws carried with them and tucked), front paws reach first, and the landing bends the legs by as much as the speed asks (3 to 8 cm), then it settles. The flight time comes from the height it must clear (`air` sets it instead). |
| `turnTo(target, o)` | `beat` (0.13), `t0`; or `turn({ yaw \| by })` | Turns on the spot to a heading, a floor mark `[x, z]`, a point or someone in the world, the short way: diagonal pairs of paws step round its middle, at most 0.5 rad a step. From sitting or lying it stands first. |
| `sit(o)` | `t0` | Hind paws shuffle under, haunches sink, tail curls to `tailSide`. |
| `lie(o)` | `dur` (1.2), `t0` | Fore paws slide out, hind legs fold, the body sinks to the floor (a sphinx); the tail lies flatter. |
| `stand(o)` | `dur` (0), `t0` | From sitting or lying, paws back under it; then holds. |
| `wait(dur)` | | Hold: it breathes, blinks, glances about, sways a little, flicks its ears, its tail swings. |
| `look(target, o)` | `t0`, `t1`, `ease` (0.3) | Turns its head to the target (a later look wins), never faster than 3.5 rad/s. `look(fn)` with no window watches `fn(t)` all the time. |
| `bat(o)` | `t0`, `at` [x, y, z], `watch` (true) | A fore paw strikes `at` at t0 and comes back; it watches the point from 0.4 s before to 0.2 s after (that look wins over the writer's; `watch: false` leaves its looks alone). |
| `meow(o)` | `t0`, `dur` (0.7) | Laid over whatever it does (does not move the clock): the chin lifts, the ears go back, the lids half close, the tail tip curls, and the mouth opens from just after t0 to about t0 + 0.5 (the call). |
| `yawn(o)` | `t0`, `dur` (1.6) | Laid over: the head tips up, the eyes squeeze, the ears go back, the mouth opens wide through the middle of it. |
| `opens(...[t, amount])` | | The mouth open from 0 (shut) to 1 (wide), as keys: a pant is about 0.3. |
| `alert(...[t, amount])` | | How keen it is from 0 (calm) to 1 (ears forward, tail quick). |

Strides are for the cat (a shoulder 19 cm high). A longer-legged animal takes longer strides: pass `stride`.
The old `hop({ t0, to, yaw, air })` and `trot({ t0, to, stride, beat })` still work. Read-out: `apply(t)`,
`poseAt(t)`, `pawAt(name, t)`, `where(t)`, `headAt(t)`, `time`, `cur`, `radius`. Its look is sprung as angles
(never faster than 6 rad/s) and lets go of a point behind it, as a person's does.

## A thrown ball: `throwTo` (ball.mjs)

```js
const path = throwTo({ t0, p0: [x, y, z], to: [x, z], land: 1.6, stop: 3.2, r: 0.085, bounce: 0.55, grip: 0.72 });
path.at(t)    // { pos, vel, angle, axis, squash }; path.rest, path.tStop
```

Solved in closed form: it leaves `p0` at `t0`, lands first at `to` at time `land` (or with upward speed `vy`),
bounces losing speed, rolls, and comes to rest exactly at `stop` (the rolling friction is worked out from it).
A `stop` before it has finished bouncing fails and says when it can stop. `holdBall({ release, aim, ball })`
uses it.

## The checks (no GPU) and the gates

```
node engine/scene3d/tools/check-motion.mjs SCENE.mjs|films/<slug> [--joints]   # all actors, every gate, overlap of every pair
node engine/scene3d/tools/spin.mjs OUT_DIR man-turn cat-trot-turn ...   # the moving spins (GPU): turns judged in the picture
node engine/scene3d/tools/spacing.mjs SCENE.mjs man 0.3-2.9 FILE.png  # a spacing chart
```

| check | measures | gate (test/scene3d-bodies-motion.test.mjs) |
|---|---|---|
| planted | how far a foot or paw that is down moves between frames | feet < 0.01 mm, paws < 2 mm |
| pops | every joint sampled 240 times a second: the largest jump in its velocity from one step to the next | < 5 m/s (a foot strike or a landing is up to about 4.7; a knee that flips or a hand that snaps is 8 to 70) |
| holds | the longest time a joint (not a planted foot or paw) stays within 0.02 mm while the actor is on screen | < 1/3 s |
| reach | how far any leg or arm was asked to reach past its full length (a paw in the air is not counted) | < 5 mm |
| through | (people) how deep the elbows, forearms, wrists and hands go inside the torso | < 5 mm |
| turns | how fast the head (skull), chest and pelvis (hips) turn: the largest angle their forward or up axis turns through over one frame (1/24 s), per second | < 8 rad/s (`TURN_GATE`: a quick real head turn, 180 degrees in 0.4 s, is 7.9) |
| overlap | (`overlap(src)`, every pair of actors) each body as a capsule per bone of limbs, trunk, head and tail, fitted to its skin; how deep a capsule of one goes into one of another, 48 times a second | < 10 mm (`OVERLAP_GATE`: the capsules are rounder than the bodies, so up to 1 cm is two bodies brushing) |
| doors | (`doorSweep(src)`, every door named in a group's `userData.doors`: the home's front door, a car's door) over every frame the leaf turns against its object, 240 times a second, how deep its leaf (its mesh's box) goes into any actor's capsule | < 10 mm (`DOOR_GATE`); within 30 mm (`DOOR_NEAR`) lint warns `door-brush` |

The spacing chart draws one dot per frame for the head, hands, hips and feet, from above, from the side along
the way the actor goes, and as height against time, with every quarter second ringed: even gaps are even
speed, closing gaps are easing, a dot out of line is a hitch.

When a check fails, `--joints` lists every joint's worst moment; the usual causes are a hard limit (use
`soft` from motion.mjs, not `clamp`, on a joint angle), a target that changes in one step (a heading, a hand
switched from one target to another without a weight), or a plan the legs cannot follow (a stride too long
for the legs, a body carried past the trailing foot).

## What still looks mechanical

- The walk is regular: the same stride length and timing every step (only lift, swing and sway vary). The weight
  moves over the support foot, and the hips turn after the feet, through springs (`performer.mjs` `LAT_F`,
  `HIPS_F`), so a turning walk does not whip the pelvis round with each step.
- The cat's trot is fast stepping with a level body; its run is a trot, not a gallop; its paws have no toes.
- A run that stops with a big turn sinks the hips about 10 cm in a sharp V on the braking step (Scene Zero, the
  girl at 4.1 s): the body is carried past the trailing foot while the braking foot swings round. Carrying it less
  far leaves the braking foot out of reach (tried: a 67 m/s pop), so it needs the braking step planned anew.
- A cat's trot that sets off has a long first step: as the far fore paw lands the chest sinks 5 mm in about 12 ms
  (the moving spin `cat-trot-turn` sees it, at 0.86 s). A person's turn on the spot ends with a small settle
  (the girl's head dips 2 mm as the last step lands; `girl-turn`, 6.54 s).
- Hands on the knees or thighs are placed, not pressed: nothing bears weight on them.
- Nothing collides with the furniture, and a run does not steer round people; walks and trots do (in a world), and
  `overlap` finds any two bodies that still meet.
- Fingers only take the named shapes; there is no grip that wraps a particular object.
