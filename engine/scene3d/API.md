# engine/scene3d: the contract

The 3D picture engine: three.js 0.187.0 with its WebGPU renderer, in plain Node on the `webgpu` package 0.6.2.
It was moved here from the bake-off winner (`three-native`) with the picture unchanged: Scene Zero renders to the
same bytes as before the move.

Three tracks (PICTURE, BODIES, STORYBOARD) built this folder side by side and an integration step joined them (see
`STATUS.md` for what works today). This file says who owns which file and which signatures the others may rely on. **An owner may extend what is listed here, but may not rename or remove it without writing the
change under [CHANGES](#changes) at the end of this file.** If you need a change in a file you do not own, ask its
owner; do not make it.

Run everything from the repo root.

## Rules every file here keeps

1. **A frame is a pure function of its time.** No `Math.random()`, no clocks, nothing carried from one frame to the
   next. Anything with memory (a spring, a ball) is stepped at a fixed rate from t = 0 and read back
   (`motion.mjs` `spring`, `ball.mjs` `ballPath`). `update(t)` may be called for any t in any order.
2. **Only `host-node.mjs` starts a GPU.** Every other module imports three's classes with
   `import * as THREE from 'three/webgpu'` and nodes from `'three/tsl'`; neither starts a device. Nothing but
   `stage.mjs` may import `host-node.mjs`, and it does so inside `render()`. `test/scene3d-nogpu.test.mjs` imports
   every module in this folder, `cast/` and `scenes/` and fails if a device appears.
3. **`three` and `webgpu` are imported only from this folder**, and this folder is imported by the rest of cinecode
   only when a film asks for the 3D engine (a dynamic `import()`), so 2D films never load them.
4. **Caches live outside the repo**: the mesh cache is `<os.tmpdir()>/cinecode-scene3d/<code>/` (`sdf.mjs` `cached`):
   files named by a hash of the description, in a folder named by a hash of `sdf.mjs` itself; the first mesh a new
   version of `sdf.mjs` writes removes the other folders. It is only a shortcut; deleting it changes no pixel (about 10 s to refill for
   Scene Zero).
5. Units: metres, seconds, radians. y is up, the floor is y = 0. A floor mark is `[x, z]`. Yaw 0 faces +z;
   positive yaw turns toward +x. Pixels are RGBA bytes, top row first.

## The entry point (`index.mjs`, owner: PICTURE)

```js
import { openScene } from './engine/scene3d/index.mjs';

const src = await openScene(scene, { width, height, blur });   // builds the scene; starts no GPU. blur: optional, overrides every shot
const rgba = await src.pixels(t);                        // Buffer, width * height * 4, RGBA, top row first, alpha 255
                                                         // (pixels(t, into): written into `into` instead, which is returned)
src.close();                                             // lets go of the GPU
```

`src` is `{ width, height, fps, duration, stage, built, pixels(t), close() }`.

- `pixels(t, into)`: poses the scene at `t` seconds (`built.update(t)`), draws it with the shot's motion blur, resolves
  to a new `Buffer`, or to `into` written over (a render loop reuses one buffer). The frame number that keys the grain is `Math.round(t * fps)`. The first call starts the GPU
  and builds the shaders (3 to 4 s), the second builds a few more (about 0.35 s); later calls are the steady cost.
- **Motion blur** (a shutter open for half of each frame): the shot at `t` chooses it through `built.shot(t)` →
  `{ blur, t0, t1 }`, where `blur` is `'none'`, `'vector'` (the default, for long films: one extra pose, about
  1 ms at 1080p) or `'moments:N'` (hero shots: N full renders, see `PERF.md` for the cost), and `t0`, `t1` are the
  shot's span, so the shutter never reaches across a cut (a moment that would is taken from the other side of `t`).
  A scene without `shot` is one shot with `'vector'`. `openScene`'s `blur` overrides every shot (the tools use
  it). Each pose is `built.update(time)` at a time inside the shutter; the pose at `t` is drawn last only in
  `'none'` and `'vector'`.
- `built` is what `scene.build(stage)` returned (below). `src.built.update(t)` poses without drawing: this is how
  plans are read and motion is checked with no GPU.
- `close()`: disposes the renderer and destroys the device. Safe on a source that never drew.
- No adapter, or no `webgpu` package: the first `pixels(t)` rejects (`no WebGPU adapter`, or the import error).
  Ask first with `hasAdapter()` from `host-node.mjs` (importing that file loads Dawn, so do it in the render
  process or a child, never in `check`/`plan`/`lint`).
- One GPU draws one frame at a time: call `pixels` one at a time per source.
- The light of a shot belongs to the stage (`stage.setLight`): `openScene` switches off any light a scene adds to
  `stage.scene` by hand (Scene Zero's two warm point lights), keeping only `stage.sun`, `stage.fill` and `stage.lamp`.
- Opening is not free: every `openScene` pays the shader build again at its first frame (3.7 s each, measured 12
  times in one process). A film should not open a source per shot.

## The scene description (owner of the shape: PICTURE; `scenes/zero.mjs` is the reference, owner: BODIES)

```js
export default {
  fps: 24,
  duration: 10,                   // seconds
  stage: { rays: true },          // optional: options for createStage (rays)
  async build(stage) {            // put things in stage.scene, set light and look, lay out the plans
    return {
      cast: { man: { ch, rig, act }, girl: { ch, rig, act }, cat: { ch, rig, act } },   // ch: buildCharacter(), rig: createBiped()/createQuadruped(), act: createPerformer()/createCritter()
      update(t) { /* pose every actor and prop at t, set the camera for t */ },
      shot(t) { return { blur: 'vector', t0, t1 }; },   // optional: the motion blur and span of the shot at t (see pixels)
      // anything else the scene wants to show (Scene Zero adds marks and ball)
    };
  },
};
```

`build` runs with no GPU. `update(t)` must leave the stage exactly as time `t` needs it, whatever was posed before.

## The stage (`stage.mjs`, owner: PICTURE)

`await createStage({ width = 1280, height = 720, rays = false })` returns

| field | what it is |
|---|---|
| `THREE` | the `three/webgpu` module (same classes as a direct import) |
| `scene` | `THREE.Scene` everything lit is added to |
| `air` | `THREE.Scene` of things that only add light (dust); drawn without a depth test |
| `softDepth(range = 0.05)` | node: 0 at the surface behind a point, 1 once it is `range` metres in front (for `air` materials) |
| `camera` | `THREE.PerspectiveCamera(35, width / height, 0.1, 100)` |
| `setCamera({ pos: [x, y, z], target: [x, y, z], fov, roll = 0 })` | `fov` is the vertical angle in degrees and is kept when left out; `roll` in radians |
| `setLight(light)` | the light of the shot: a row of `LIGHTS` by name (`'morning' 'noon' 'golden' 'twilight' 'night'`) or an object of the same shape (`light.mjs`). Aims the sun at once; colours, strengths and grade are written before every frame. Default `'noon'`; `buildRoom` sets `'golden'` |
| `light` | the row in use (read it; change it with `setLight`) |
| `sun`, `fill`, `lamp` | `THREE.DirectionalLight` (casts the shadow), `THREE.HemisphereLight` and a `THREE.PointLight` (off unless the light has a `lamp`; a set moves it). Their colour and strength come from `light`: setting them by hand is overwritten at the next frame |
| `setSun({ dir, center, extent, depth, box, air })` | aims the sun along `dir`; the shadow picture covers `center` ± `extent`, or the world box `[[x0, y0, z0], [x1, y1, z1]]`; `air` (a box like `box`, default `box`) is where sunlit air glows. What is left out keeps its last value |
| `setBounce({ box, patches, portals })`, `bounceColor` | where light that is not straight sun comes from (a set calls it in `build`, before the first frame): `patches` are rectangles `{ p0, du, dv }` that throw the sun back (their sunlit part only), `portals` are openings the sky shines through; `du x dv` points into the room; `box` is the room. `bounceColor` (`THREE.Color`) is the colour of the patches |
| `look` | uniforms a scene sets with `.value`: `vignette grain occlusion contact rays airMin airMax focus blur paint paper shoulder ink inkColor` (and `frame`, set by `render`). `bloom glow exposure contrast saturation shadowTint lightTint lift rayDensity rayColor shade bounce skyOpen outdoor dust` are written from `light` before every frame |
| `render(frame = 0, { blur = 'none', pose, shutter = 0.5 / 24, into })` | draws the scene as it stands; resolves to the RGBA bytes (a new Buffer, or `into` written over). Starts the GPU on the first call. With `pose(dt)` (poses the scene `dt` seconds from the frame's time) it draws motion blur over `shutter` seconds: `'vector'` poses at `-shutter`, remembers, poses at 0 and smears each pixel along how far it moved; `'moments:N'` poses N times across the shutter, each with its own sub-pixel camera shift, and sums them before the finishing |
| `close()` | lets go of the GPU |
| `width`, `height` | the picture size |

A camera, as far as other tracks may rely on it, is exactly `setCamera`'s argument plus the depth-of-field pair
`look.focus.value` (metres to what is sharp) and `look.blur.value` (0 = off).

## The host (`host-node.mjs`, owner: PICTURE)

- `await hasAdapter()` → boolean.
- `await createSurface(width, height)` → `{ device, canvas, width, height, read(into), close() }`. `canvas` is a
  canvas-shaped object for `new THREE.WebGPURenderer({ canvas, device })`; `read(into)` resolves to the last frame as
  RGBA bytes (a new Buffer, or written into `into`, width * height * 4 bytes); `close()` destroys the device. The canvas is `rgba8unorm` (the host tells three.js so), so the bytes
  come out in order with no swap.

A second host (headless Chrome) will export the same two functions. Nothing above the host may know which one it is.

## Bodies (owner: BODIES)

**`character.mjs`**: `buildCharacter(desc)` → `{ name, desc, group, bones, rest, skeleton, meshes, extras, face, loose, triangles }`
(`group` goes in `stage.scene`; `bones[name]` are `THREE.Bone`; `rest[name]` the rest position; `face.set(controls)`
sets the face; `loose` the springy parts; `triangles[part]` the count per part).
Helpers for writing descriptions: `mirrorJoints(joints)`, `mirrorOps(ops)`, `scaleOps(ops, pivot, s)`, `toes({ at, width, r, tint })`.
Constants: `STANDARD` (the joint names every `biped` / `quadruped` must have), `MOUTHS`, `EXPRESSIONS`, `FINGER_NAMES`.
`applyWorld(ch, world)` is the last step of every rig's `solve`.

**The character format is frozen** and written down field by field in `docs/scene3d-characters.md` (the girl is the
worked example). In short (`cast/man.mjs`, `cast/girl.mjs`, `cast/cat.mjs` export `man`, `girl`, `cat`):

```js
{ name, kind: 'biped' | 'quadruped',
  joints: { name: { at: [x, y, z], parent, near: [names], bend } },   // rest pose, standard names; left written, right mirrored
  parts: [{ name, ops: [solid, ...], h, soft, material }],            // one smooth mesh per material; the bare body is 'skin'
  hands: { length, width, thick, segments, tint },                   // biped: finger bones and a part 'hands'
  hair: { thick, line, edge, ridges, locks, material }, beard: { ... },   // a shell cut along a line + named locks (buns, springs)
  face: { eyes: { at, size, open, iris, ... }, brows: { at, size, tilt }, mouth: { at, width, on } },
  loose: [{ bone, f, z, drag, shift, swing, stretch, reach, breath }],   // springs of belly, skirt, tail, ears
  attach: [{ name, bone, at, geo, scale, rot, flat | material }],   // small rigid pieces (the cat's nose)
  rig: { ... } }                                                      // biped: { ball, heel, armSpread }; quadruped: { hindToe }
```

Face controls, in a biped pose's `face` (and a critter's): `{ gaze: [x, y], blink, squint, wide, browUp, browTilt,
mouth: { open, wide, round, smile, frown, closed }, expr: { happy, worried, surprised, sad, sleepy, angry } }`
(`mouth` may still be one number, the old single control: it is laid over the expression's mouth as the opening of
speech, so a spoken line moves the mouth whatever face is on). Hand shapes per arm: `curl` (a number or one per
finger), `thumb`, `fan`; named ones in `biped.mjs` `HANDS` (`open relaxed point grip fist`).

**`sdf.mjs`**: `compileSolid`, `compileShape`, `meshShape(ops, h)`, `skinShape(mesh, boneIndex, near, opts)`,
`cached(key, build)`.
**`soft.mjs`**: `softMesh(ops, { h, material })` → `THREE.Mesh` (a prop built from the same solids; `room.mjs` uses it).

**`biped.mjs`**: `defaultPose()`, `HANDS`, `createBiped(ch)` → `{ solve(pose), frames(pose), info, ankleOf, character }`. A pose is plain
numbers:

```js
{ pelvis: { pos: [x, y, z], yaw, pitch, roll }, spine: { yaw, pitch, roll }, head: { yaw, pitch, roll },
  footL / footR: { pos: [x, z], yaw, pitch, lift, toe, splay },
  armL / armR: { swing, spread, twist, elbow, wrist: [a, b, c], curl, thumb, fan, shrug },
  face: { gaze, blink, squint, wide, browUp, browTilt, mouth, expr },
  loose: { bone: { shift, swing, stretch } } }                     // set by the performer from the springs
```

**The motion system** is written down for someone staging a film in `docs/scene3d-motion.md` (every verb, layer,
parameter and check). In short: verbs lay out a plan (footsteps, paths, keys, windows); every pose is read off it
at time t. Each verb starts at the performer's `time` (where the plan so far ends) unless given `t0`, and returns
its end time. Gestures, looks and faces do not move `time`. Actors share a `world` (`motion.mjs` `createWorld`).

**`performer.mjs`**: `createPerformer(rig, { at: [x, z], yaw, world, name, seed, stepTime, stepLen, armSwing, armSpread, toeOut, idle })`.
Verbs (return their end time): `walkTo(to, { face, through, stepLen, stepTime, first, t0 })`, `runTo(to, { face, ... })`,
`turnTo(target, { through, stepTime, per, t0 })`, `crouchTo(amount, { dur, t0 })`, `sit({ on, dur, t0 })`, `stand({ dur, t0 })`,
`jump({ height, sink, turn, t0 })`, `wait(dur)`. Layers: `lookAt(target, { t0, t1, dur, ease })`, `express(name, { t0, t1, amount, ease })`,
`wave({ arm, dur, rate, t0 })`, `point({ at, arm, dur, t0 })`, `clap({ dur, rate, t0 })`, `reach({ to, arm, dur, t0 })`,
`holdBall({ r, t0, t1, release, aim, ball })` → `{ at(t), path() }`, `carry(o)`. A target is `[x, y, z]`, a function of t,
or a name in the world. Read-out adds `time`, `where(t)`, `headAt(t)`, `radius` (m, round the middle: steering).
The older verbs, still there (STORYBOARD's `compile.mjs` uses them):

| verb | does | returns |
|---|---|---|
| `walk({ t0 = time, to: [x, z], stepTime, stepLen, first: 'L' or 'R', close = true })` | footsteps to `to`; `close: false` leaves the last step open for a turn (the turn then starts with the trailing foot) | end time |
| `run({ t0, to: [x, z], stepTime = 0.19, stepLen, air = 0.3, first, endYaw })` | a run, both feet off the floor between steps | end time |
| `turn({ t0, yaw, by, stepTime = 0.44, per = 1.45 })` | steps round to heading `yaw` (short way) or by a signed amount `by` | end time |
| `crouch({ t0, dur = 0.7, amount = 1 })` | 0 standing, 1 fully down, through a spring | `t0 + dur` |
| `jump({ t0, height, sink = 0.32, turn = 0 })` | sink, push off, a true parabola, land, settle | end time |
| `layer(fn)` | `fn(pose, t, ctx)` changes the base pose (a wave, a throw); it may set `pose.hand = { L: { to, w, elbowDir, wrist, curl }, R }` or `pose.after = (pose, out, ctx) => {}` | nothing |

Read-out: `poseAt(t, withLayers = true)` → `{ pose, ctx }` (no bones touched); `apply(t)` → `{ pose, out, ctx }`
(poses the bones); `footAt('L' | 'R', t)`; `bodyAt(t)` → `[x, z]`; `heading(t)`; `lookAt(pose, ctx, target, w = 1)` (the old
form: called inside a layer with a pose, it turns the head at once; called with a target first it is the new layer);
`tracks`, `cur`, `rig`, `opts`.

**`quadruped.mjs`**: `createQuadruped(ch)` → `{ solve(pose), info, character, out }`;
`createCritter(rig, { at: [x, y, z], yaw, seed, sit, tailSide, world, name, idle })` with `walkTo(to, o)`, `trotTo(to, o)`,
`runTo(to, o)` (`{ stride, beat, t0 }`), `hopTo(to, { yaw, air, t0 })`, `sit({ t0 })`, `lie({ dur, t0 })`, `stand({ dur, t0 })`,
`turnTo(target, { beat, t0 })` (a heading, `[x, z]`, `[x, y, z]` or a name; `turn({ t0, yaw | by, beat = 0.13 })`), `wait(dur)` (each returns its end time), the old `hop({ t0, to: [x, y, z], yaw, air })` (`air`: flight time; default worked out from the height) and `trot({ t0, to, stride = 0.24, beat = 0.12 })`, `bat({ t0, at: [x, y, z] })` (a fore paw out to touch `at` at t0 and back), `skid({ t0, dist = 0.22, dur = 0.35 })`,
`look(target, { t0, t1, ease })` (or `look(fn)`: watch `fn(t)` always), `alert(...[t, amount])`, and `poseAt(t)`, `apply(t)`,
`pawAt('FL' | 'FR' | 'HL' | 'HR', t)`, `where(t)`, `headAt(t)`, `time`, `tracks`, `cur`, `rig`, `stance`, `radius`.
A paw's `down` in a pose may be a weight 0..1 (how much it holds the body) as well as true/false.

**`motion.mjs`**: `clamp lerp smooth smoother ramp lerpAngle rnd(n, seed) curve(points) spring(target, { f, z, dt, vmax }) springVec(target, opts)
followers(specs, anchors, dt) wobble(t, i, seed, f) soft(x, limit) createWorld()` (`world.add(name, actor | fn)`, `world.where(name, t)`,
`world.head(name, t)`, `world.names()`, `world.radius(name)`), `detour(world, self, r, from, to, when)` → `{ at(s), yaw(s), D }` (a floor path from `from` to `to` bowing round whoever stands in it at `when(s)`). `spring` and `followers` (the loose parts) are the only memory allowed: they step from t = 0 at
a fixed rate and are read back at any t.
**`ball.mjs`**: `throwTo({ t0, p0, to: [x, z], land | vy, stop, r, bounce, grip, roll, settle, spin })` → a ball's path
`{ at(t) → { pos, angle, axis, squash, vel }, t0, tStop, rest, r, segs }` that lands at `to` at `land` and rests at `stop`; `rollTo({ t0, p0: [x, z], to, stop, r, roll })` (along the floor, to rest on `to`); `rollBall(act, { from, t0, to, stop, r })` (rolled from the hands of a sitting performer) → `{ at, tStop, rest }`; `pickUp(act, at, { t0, grab, r })` → `{ at }` (the hands' part of a pick-up); `ballMesh(r)`.
**`checks.mjs`**: `feetSlide(src, who)` → `{ n, worst, at }`, `pawSlide(src, who)` → `{ n, worst, at, paw }`
(`src` from `openScene`; `worst` in metres between two frames; no GPU); `motion(src, { hz = 240, still = 2e-5, from, to })` →
`{ [who]: { pops, holds, reach, through, turns, onScreen, joints } }` (each `{ worst, at, joint | limb }`: m/s, s, m, m, rad/s;
`turns`: skull, chest, pelvis/hips, gate `TURN_GATE` = 8); `overlap(src, { hz = 48, from, to })` → `{ worst, at, a, b, partA, partB, pairs }`
(m, gate `OVERLAP_GATE` = 0.01); `sceneSource(src, sc)` → one scene of a compiled film (`src.built.scenes[i]`) as a
source the checks read: its own actors, posed and framed in the scene's time. Cast entries with no `ch` (a prop) are
left out of `motion` and `overlap`. `doorSweep(src, { hz = 240, from, to })` → `[{ door, who, part, worst, at }]` (how
deep a moving door's leaf goes into any actor's capsule, m, less than 0 is clear; every door and actor pair within
`DOOR_NEAR` = 0.03; gate `DOOR_GATE` = 0.01). A place or a prop names its doors on a group: `userData.doors = [{ name,
leaf (the leaf's mesh), root (the object it turns against) }]` (`home.mjs` `buildHome`, `car.mjs` `buildCar`).
**`biped.mjs`** `createBiped` also returns `out` (the last solve; `out.miss` how far each limb was asked past its length) and
`info.armLength`, `info.shoulder`.

## Picture (owner: PICTURE)

**`materials.mjs`**: `paint(opts)` (the one lit material), `flat(hex)`, `lookUniforms` (`rampLo`, `rampHi`, `rim`: shared
by every material in the process; `createStage` puts them back to their defaults, a scene sets what it wants in
`build`), `shadowUniforms`, `softShadowFilter`, `hash12`.
**`sets.mjs`**: `woodFloor({ color, board })` (boards painted once on a canvas), `plaster({ color })`, `slab(w, h, d, material, pos)`.
**`light.mjs`**: `LIGHTS` (the hours, see `docs/scene3d-picture.md`), `sunDir(az, el)` → the way the sun's light travels,
`createField(sunLit, sunAxis)` (the bounce and sky-light probes; the stage makes one).
**`room.mjs`**: `ROOM` (the living room's measurements: `win`, `side`, `sofa`, ...), `livingRoom(stage)` → `{ update(t) }` (the room
dressed as Scene Zero and the kit `room` have it: the room, two curtains, the dust, the finish), `buildRoom(stage)` (the
bare room), `dustMotes(stage, { count, seed })` → `{ mesh, update(t) }`.
**`img.mjs`**: `saveImage(file, rgba, w, h, { scaleTo })`, `tile(cells, w, h, cols, crop)`, `encoder(file, w, h, fps)` (through ffmpeg).
**`materials.mjs`** also: `paint({ keepHue: true })` (the fills light it as a warm grey of their strength: a saturated
paint keeps its hue in shade), `paint({ sun: k })` (the paint takes k of the direct light and all of the fills; default
1; `customProgramCacheKey` adds `:sun<k>` when k is not 1), `colourPassOnly(node)` (a float node that is `node` in the colour pass and 0 in every
other pass: the opacity of glass or a ground shadow, so the ink, the occlusion and the blur see behind it).
**`room.mjs`** also: `buildRoom(stage, { garden = true, door })` / `livingRoom(stage, opts)` (`garden: false` leaves out
the painted garden cards; `door: { z0, z1, h }` a doorway in the right wall), `wallPaint(base)`, `boards(base, { width,
along })`, `sofaSeat(x, z, leg)` (the kits' `seat`).

## Hard objects and places (library pieces)

**`shape.mjs`**, the shape language (manual: `docs/scene3d-shapes.md`): solids `box cyl ball dome torus loft revolve
extrude`, `cut keep turn`, `at(x, frame, { turn, flush })`, `grid ring mirror mark`, `part(name, look, ...solids)`,
`hinge(part, frame, axis, [lo, hi])`, `spin(part, frame, axis)`, `build(...roots)` → `{ group, pose(values), joints,
marks, parts, triangles, digest, ms }`. A part is meshed by surface nets (cells from its thinnest solid, 2.5 mm to
2 cm), thinned (a point goes while the surface moves under 1/20 of a cell) and cached through `sdf.mjs` `cached`
(`SHAPE_NOCACHE=1`: always mesh). **`props/`**: `chair.mjs`, `armchair.mjs`, `mailbox.mjs` (joints `flap`, `flag`):
each a default export returning a root part.

**The car** (`car/`): a small rounded teal hatchback that drives (a thing that acts, like a performer: verbs lay out a
plan, every pose is read off it at t).
- `car/shape.mjs`: `CAR` (every size), `COLORS`, `SHELL()`, `skin()` (the outer skin as a distance), default export
  the parts as roots. Front is +z, the driver sits on +x, y = 0 under the tyres.
- `car/car.mjs`: `buildCar({ color })` → `{ group, body (the sprung group), pivot, obj (the kit's build), parts, marks,
  joints, triangles, lights, shadow, set({ body: { pitch, roll, heave }, wheels: { fl, fr, rl, rr }, steer: { fl, fr },
  wheel, door, head, tail }) }`: see-through glass, painted seams, lamps that light, a soft ground shadow, the body
  paint `keepHue`. Parts: `body`, `door` (hinge on its front edge, 0..68 degrees), `steer_fl/fr`, `wheel_fl/fr/rl/rr`,
  `steering`, lamps, bumpers; marks `body.nose`, `body.tail`, `body.seat`. `CAR`, `COLORS`, `WHEELS`.
- `car/drive.mjs`: `createCar({ at: [x, z] (its middle), yaw, color, speed = 5, accel = 1.6, brake = 2.6, lateral = 2.2, mesh })` (`mesh: null`: a plan alone)
  → verbs `driveTo(marks, { t0, speed, rolling })` (through the marks, stopping with its middle on the last one, its
  wheels straight; returns the stop time), `stop({ t0 })` (brakes the drive under way; returns when it stands),
  `door(open 0..1, { t0, dur })`, `engine(on, { t0 })`, `lights(on, { t0 })`,
  `wait(dur)`; read-out `apply(t)`, `poseAt(t)`, `where(t)`, `heading(t)`, `speed(t)`, `toWorld(t, [x, y, z])`,
  `driverOut(t)` → `{ at, yaw }`, `time`, `group`, `mesh`, `triangles`. Forward only; the front wheels turn at most 40
  degrees (a bend tighter than about a 4 m radius makes them skate sideways: give the marks room); the body's pitch, roll and heave
  are `motion.mjs` springs. `WHEEL_AT`, `WB`, `BACK`.
- `car/driver.mjs`: `seatDriver(car, desc | character, { seed })` → `{ ch, act, group, leave(t), apply(t) }` (a character at the
  wheel, hands on the rim; call `apply(t)` after `car.apply(t)`; from `leave(t)` he is hidden).
- A storyboard rig (`RIGS.car`, kind `car`: `docs/scene3d.md`); a scene file may drive it too (`scenes/home.mjs`).

**The place "home"** (`home/`): the living room (`livingRoom(stage, { garden: false, door })`, the same room, not a
copy) inside a cottage: a hall and front door, the front garden, drive, street, the houses across it, a sky.
- `home/home.mjs`: `buildHome(stage, { door: cues })` → `{ group, door (the wing's build: joint "door"), lantern,
  light(time, side = 'inside'), swing, update(t) }`; `HOME` (the measurements), `HOME_LIGHTS` (`golden`,
  `twilight`, each `{ inside, outside, sky, porch, haze: { color, amount } }`: rows of `light.mjs`' shape; `haze` is
  what the far hills and trees fade toward); the group's `userData.doors` names the front door for `checks.mjs`
  `doorSweep`, `doorSwing(cues)` → `(t) → 0..1`
  (cues `[{ t, to, w, z }]`; opening flings, shutting latches when it first meets the frame), `BACK`.
- `home/parts.mjs`: shape-language pieces `wingFront` (joint `door`), `windowSeat`, `lantern` (part `glass`),
  `chimney`, `doorstep`, and `D` (their sizes).
- `home/kit.mjs`: `HOME_KIT` (`library.mjs` `KITS.home`): `floor`, `anchors`, `heightAt`, `seat`, `sides`, `areas: {
  inside, outside }` (each `{ stage, view, bounds }`; the kit's own `view`, `stage`, `bounds` are the inside's),
  `cameras` (named `{ pos, target, fov }`), `side(camera)` → its area, `times`, `build(stage, { door })` → `{ update,
  light(time, area), home }`, `doors` (`door: doorSwing`), `walls`, `route(from, yaw, to)` (the car's way),
  `carStart(at, yaw)`.

## Who owns what

| track | files |
|---|---|
| **PICTURE** | `index.mjs`, `stage.mjs`, `host-node.mjs`, `materials.mjs`, `sets.mjs`, `room.mjs`, `light.mjs`, `img.mjs`, `tools/look.mjs`, `tools/scene.mjs`, `tools/render.mjs`, `tools/strip.mjs`, `tools/determinism.mjs`, `tools/stress.mjs`, `tools/perf.mjs`, `test/scene3d-determinism.test.mjs`, `test/scene3d-nogpu.test.mjs`, new `test/scene3d-picture*.test.mjs`, `docs/scene3d-picture.md` |
| **BODIES** | `character.mjs`, `sdf.mjs`, `soft.mjs`, `biped.mjs`, `quadruped.mjs`, `performer.mjs`, `motion.mjs`, `ball.mjs`, `checks.mjs`, `cast/*`, `scenes/zero.mjs`, `tools/check-motion.mjs`, `tools/spacing.mjs`, `docs/scene3d-motion.md`, `tools/turnaround.mjs`, `tools/faces.mjs`, `tools/hands.mjs`, `tools/bend.mjs`, `tools/studio.mjs`, `test/scene3d-planted.test.mjs`, `test/scene3d-bodies*.test.mjs`, `docs/scene3d-characters.md` |
| **STORYBOARD** | `compile.mjs` (the timed plan of a film → a scene description), `library.mjs` (the rigs and kits a storyboard names, and their flat stand-ins), `lint.mjs` (the 3D lint), `source.mjs` (the frame source `{ plan, pixels(t) }` for `engine/render`), `overlay.mjs` (captions and titles drawn by the 2D code, laid over the RGBA frame), `films/_test3d`, `test/scene3d-film*.test.mjs`, `docs/scene3d.md`; and the edits in `engine/render/` and `engine/film/` |
| **integration** | `STATUS.md`, `tools/spin.mjs`; it may change any file above, and writes what it changed under CHANGES |
| **LIBRARY** (pieces) | `shape.mjs`, `props/*`, `car/*`, `home/*`, `scenes/home.mjs`, `tools/sheet.mjs`, `tools/views.mjs`, `test/scene3d-pieces.test.mjs`, `docs/scene3d-shapes.md` |
| nobody | `API.md` (each owner edits only its own sections and CHANGES), `package.json`, `package-lock.json` |

Where files cross tracks today: `room.mjs` uses `softMesh` and `rnd`; `scenes/zero.mjs` and `library.mjs` use
`livingRoom` and `ROOM`; the tools and tests use `openScene`.

## Tools

Every tool that takes a scene file also takes a film folder (`films/_test3d`): it is compiled as a render compiles it
(`tools/scene.mjs`), so the checks, determinism, stress, perf, render and strip run on a film's picture (no overlay).

```
node engine/scene3d/tools/render.mjs engine/scene3d/scenes/zero.mjs --size 1280x720 --out DIR --video FILE.mp4 [--frames 0-239]
node engine/scene3d/tools/strip.mjs engine/scene3d/scenes/zero.mjs FILE.jpg --range 2.75-4.25 --n 37 --cols 10 --size 1280x720 --follow man --cell 240x380
node engine/scene3d/tools/strip.mjs films/_test3d FILE.jpg --times 9.25 --cols 1 --size 1920x1080 --max 1920   # one still
node engine/scene3d/tools/turnaround.mjs FILE.jpg man girl cat          # (each tool also takes a path to a .mjs that exports a description)
node engine/scene3d/tools/faces.mjs FILE.jpg man girl                    # every expression and mouth shape, front and three-quarter
node engine/scene3d/tools/hands.mjs FILE.jpg man girl                    # open, point, grip, wave
node engine/scene3d/tools/bend.mjs FILE.jpg man girl                     # deep crouch and raised arm, plain skinning against the bend helpers
node engine/scene3d/tools/determinism.mjs engine/scene3d/scenes/zero.mjs 30,100,200 [1280x720] [blur]     # 3 processes, one backwards; exit 1 if they differ
node engine/scene3d/tools/stress.mjs engine/scene3d/scenes/zero.mjs 30,100,200,222 [40] [8] [1280x720] [blur]   # 40 processes, 8 at a time; exit 1 if they differ
node engine/scene3d/tools/perf.mjs engine/scene3d/scenes/zero.mjs 1920x1080 [60] [blur] [from=100]          # 60 consecutive frames; see PERF.md
node engine/scene3d/tools/look.mjs engine/scene3d/scenes/zero.mjs 30,100,153,222 100-110 1920x1080 [--save DIR]   # tone and flicker gate; exit 1 outside it
node engine/scene3d/tools/check-motion.mjs engine/scene3d/scenes/zero.mjs [--joints]   # pops, holds, reach, through, turns, planted, overlap; no GPU
node engine/scene3d/tools/spacing.mjs engine/scene3d/scenes/zero.mjs man 0.3-2.9 FILE.png   # spacing chart; no GPU
node engine/scene3d/tools/check-motion.mjs films/_test3d                # a film: scene by scene, not under the cards
node engine/scene3d/tools/spin.mjs DIR [man-stand man-turn ...]         # the spin gate: 9 turntables, 1 degree a frame, and 6 moving spins (turns by the verbs); exit 1 at a spike ratio of 1.4
node engine/scene3d/tools/sheet.mjs car FILE.jpg [--pose door=1,steer=0.4,head=1]      # a hard object's 12 views (or a prop file: engine/scene3d/props/mailbox.mjs); triangles, digest
node engine/scene3d/tools/views.mjs golden FILE.jpg [--save DIR] [--stats] [view ...]  # the place "home" from its named cameras (or pos@target@fov)
HOME_VIEW=lawn_wide HOME_TIME=twilight HOME_CAR=1 HOME_CAST=1 node engine/scene3d/tools/look.mjs engine/scene3d/scenes/home.mjs 100 100-110   # the house (and car, cast) for any tool
```

Write pictures to a scratch folder, never into the repo.

## Keeping the picture repeatable

The same frame gives the same bytes in every process on this machine. That took these workarounds; each new shader
feature can break it, so run `tools/stress.mjs` after any change to the picture.

1. three.js advances its frame counter from a browser animation loop. There is none here, so `stage.render()`
   advances `renderer._nodes.nodeFrame.frameId` by hand. This is a private field: recheck it on any three.js upgrade.
2. No multisampling: it is not repeatable on this GPU when other processes use it. Edges are smoothed by drawing
   twice as large each way and resolving with a tent filter (`stage.mjs` `SS`).
3. The light-in-the-air pass reads the sun's shadow picture, which exists only once the scene has been drawn, so the
   scene is drawn once plainly before the first frame.
4. Anything that changes shape every frame needs a fixed bounding ball (the curtain): three.js measures bounds the
   first time it draws an object and sorts by them, which made the picture depend on the first frame rendered.
5. No hard depth test on things thinner than a pixel (dust): they go in `stage.air` and fade with `stage.softDepth`.
6. No screen-space derivatives in the shadow filter: the slope comes from the surface normal as seen from the sun.
7. Motion of soft things (curtain, dust) runs on the GPU from one time number; no vertex data is re-sent per frame.
8. Process-wide uniforms (`lookUniforms`) are put back to their defaults by every `createStage`.
9. Motion vectors come from a pose the stage is shown half a frame before (`stage.render`'s `pose(-shutter)`),
   never from whatever frame was drawn last (three's own `VelocityNode` keeps that); a skinned body's earlier
   shape is skinned from the stage's own copy of its earlier bones, because three fills its copy only when a
   material is first built, which made the first frame of every process unblurred.
10. Still areas must not shimmer: the walk through the air starts at an offset that is a pattern of the pixel alone
   (not of the frame), and the only thing that changes per frame in a still area is the grain (`look.grain`,
   0.008: a mean change of 0.7 luma between frames). `tools/look.mjs` measures it.

## Measured at the move (superseded for speed by `PERF.md`; Apple M1 Max, load average 10 to 19: other agents were using the CPU and GPU)

- Scene Zero, steady state, pose + render + read-back: 38.4 to 38.5 ms a frame at 1280x720; 68.6, 69.0 and 75.0 ms
  in three runs at 1920x1080
  (the unmoved bake-off code measured 66.3 ms at 1080p in the same minute; the RGBA swap in `read()` is 1.6 ms of
  the difference).
- Once per `openScene`: 0.1 s to build with a warm mesh cache (10 s cold), 0.2 s to fill the springs, 3.2 to 4.2 s
  for the first frame.
- Memory: 1.0 GB resident after the first frame at 720p. `close()` destroys the device but resident memory does
  not fall: open, draw, close repeated 12 times in one process went 1.0, 1.6, 1.6, ... and levelled at 1.7 GB
  (JS heap flat at 30 MB).

## CHANGES

Changes to signatures listed above, newest last. Write: date, track, what changed, what callers must do.

- Move (step 0.1), against `bake/three-native`:
  - `src/gpu.mjs` is gone. `host-node.mjs` has the device, the canvas and the read-back; modules import three
    directly. The stage makes the renderer itself, at the first `render()`.
  - Pixels are RGBA everywhere (they were BGRA).
  - The stage no longer has `surface` and `renderer` fields; it has `close()`.
  - `cached(key, build)` lost its `dir` argument; the cache moved from `.cache/` to the OS temp folder.
  - `tools/render.mjs` moved from `src/`, and lost `--workers` (one GPU draws one frame at a time; more processes
    did not help).
  - New: `index.mjs` (`openScene`), `checks.mjs`, `tools/scene.mjs`.
  - `createStage` resets `lookUniforms` (a scene opened after Scene Zero in the same process used to inherit its
    light ramp).
- Look (step 0.2, PICTURE), against the move:
  - The light of a shot is `stage.setLight(name | object)` (`light.mjs` `LIGHTS`). The stage writes the sun's and
    the fill's colour and strength and the grade (`look.bloom exposure contrast saturation shadowTint lightTint
    rayDensity rayColor`) from it before every frame, so a scene that sets those by hand (Scene Zero `build`, lines
    42 to 47) no longer changes the picture. `look.contrast` now means the strength of an S-curve on screen values
    (0 = none; it was a multiplier round 0.5). `look.ink`, `inkColor`, `glow`, `lift` are new.
  - `openScene` switches off lights a scene adds by hand (Scene Zero's two point lights, line 48); bounce and sky
    light come from `stage.setBounce`, which `buildRoom` calls.
  - New on the stage: `setLight`, `light`, `lamp`, `setBounce`, `bounceColor`. New: `light.mjs`,
    `sets.mjs` `canvasTexture`, `tools/look.mjs`, `test/scene3d-picture.test.mjs`, `docs/scene3d-picture.md`.
  - `ROOM.sunDir` is now the golden hour's (`sunDir(58, 16)`, within 1 degree of before); the dust follows the sun
    of whatever light is set.
- Characters (step 0.4, BODIES), against the move:
  - The format is frozen (`docs/scene3d-characters.md`). New blocks: `hands` (finger bones), `hair` and `beard`
    (shell cut along a hairline, named locks, buns, locks on springs), `face` (eyes with lids and gaze, brows, a
    painted mouth with seven mixable shapes, six expressions), `loose` (springs), `bend` on joints (helper joints).
    Eyes, brows and the mouth are no longer `attach` pieces; `extras` now holds `eyeL eyeR browL browR` and any
    `attach`.
  - `face.eyes.size` and `face.brows.size` are full sizes and `face.mouth.width` the full width (`r` is always a
    radius, every other size a full size). `hands` has no `wrist` field: the hand joins the skin where it is.
  - Pose: `pose.face` is `{ gaze, blink, squint, wide, browUp, browTilt, mouth: { shapes }, expr }` (a number for
    `mouth` still works); the quadruped's `pose.blink` became `pose.face.blink`. Arms gained `fan`; `curl` may be
    one number per finger. `pose.nudge` (the belly) is gone: the performer fills `pose.loose` from the
    description's springs for every loose part (belly, skirt, buns, quiff).
  - `scenes/zero.mjs` no longer runs its own bun and skirt springs (`girlLoose`): the girl's description has them.
  - Mesh cache version 7 (old cache files are ignored).
- Motion (step 0.5, BODIES), against the characters step:
  - The two-layer motion system: verbs that chain on the performer's `time`, gestures/looks/faces as windowed layers,
    `createWorld`, idle life and seeded variation, `throwTo`, the gates in `checks.mjs` `motion()` and
    `test/scene3d-bodies-motion.test.mjs`. Everything listed before still works with the same arguments.
  - Changed behaviour callers may notice: every verb's `t0` is optional; `walk({ close: false })` followed by a turn
    starts the turn with the trailing foot; a critter's `trot` takes a few shorter steps to get going and one more
    closing step (it ends one beat later than before), carries the body lower while moving, and its default stride is
    0.24 (was 0.3) and beat 0.12 (was 0.17); jumps take off and land at full speed (push and landing times now come from
    the height, so a jump's end time changed slightly); `jumpAt` arms are flung; joint limits on spine and head yaw are
    soft; `lookAt(pose, ctx, target, w)` lets go smoothly of a target behind.
  - The critter's `look(fn)` target and the performer's looks are mixed as directions from the eyes.
  - The quadruped solver's paw `down` may be a weight; legs are held at 97 % of their length (was 99.2 %) and the
    body sinks at most 4 cm for a paw before it is drawn over it.
  - Scene Zero is re-staged with the new verbs (the girl now waits at the back of the room and runs out behind the
    man; his hand-set lights and point lights, dead since the look step, are gone). Its frames are not the same as
    before.
- Motion blur and speed (step 0.3, PICTURE), against the look step:
  - `pixels(t)` now draws the motion blur the shot chooses: `built.shot(t)` → `{ blur, t0, t1 }` (optional; without
    it, `'vector'` over the whole scene). `openScene(scene, { width, height, blur })` overrides every shot. Frames of
    anything that moves are not the same bytes as before.
  - `stage.render(frame, { blur, pose, shutter })`; `stage.render(frame)` alone draws the scene as it stands, as
    before. `stage.parts.output` is new; the first pass gained a `motion` output.
  - `createStage`'s `ss` default is 2 (was 3), resolved with a tent: about 20 ms a frame less at 1080p with no
    visible loss (`PERF.md`). Pass `stage: { ss: 3 }` in a scene to get the old sampling.
  - The canvas is `rgba8unorm`: `read()` copies rows instead of swapping red and blue (about 1.5 ms at 1080p). 109
    of 2.76 million bytes of a 720p frame moved by one level against the BGRA canvas; nothing else changed.
  - Tools: `determinism.mjs`, `stress.mjs` and `perf.mjs` take a blur mode (`determinism.mjs`'s `child` argument
    moved to fifth place); `perf.mjs` times consecutive frames (default 100 to 159) instead of frames spread over the
    clip. New: `PERF.md`, `test/scene3d-picture-blur.test.mjs`.
- Integration (wave 0), against all of the above:
  - `compile.mjs` acts through the motion system's layers: looks are `lookAt` windows (critter: `look` windows),
    `emote` is `express` held until the next one (its own `FACES` table is gone), `wave` / `point` / `clap` are the
    performer's, the ball is held and thrown with `holdBall` (aimed by bisection so that it still comes to rest on its
    mark), the film's blink beats and the spoken line's mouth are one small layer. A `turn` beat turns to its own
    `face` (the stand-in's facing track lagged it, so the man never turned). A cat's `hop` leaps at most 0.7 m in
    0.4 s and trots the rest (the 2 m sofa-to-rug leap asked the legs 124 mm past their length and popped at 28 m/s).
    The built scene has `shot(t)` → `{ blur: 'vector', t0, t1 }` from the plan's shots, and its cast entries carry
    `t0` (the scene's start, for the checks).
  - `character.mjs`: a numeric `mouth` is laid over the expression (max of the two openings); a mouth given as
    shapes mixes as before. Scene Zero's frames are unchanged by this.
  - `checks.mjs`: `t0` on a cast entry, props left out of `motion`.
  - `tools/scene.mjs` opens film folders; `tools/check-motion.mjs` checks a film over its scenes only.
  - New `tools/spin.mjs` (the spin study's turntable, on the frozen cast and the motion system, as a gate).
  - `scenes/stage1.mjs` sets the studio light of the character sheets (it rendered nearly white under the default noon).
  - `films/_test3d`: the throw and what follows it in shot 1 moved 1 s later (shot 1 is 7.5 s) so that the man, who
    now turns, is crouched when the ball comes; the thud stays on the first bounce (scene 7.42 s).
- **Repair after the wave-0 checks (2026-11-13)**
  - `character.mjs`: the `happy` expression squints 0.4 (was 0.75: the eyes read as shut, worst in profile); eyes are
    sunk 0.35 of their depth into the head (was 0.55), so more of the ball stands out and the eye still reads in
    profile.
  - `stage.mjs`: the occlusion on the fill light never goes below 0.4 (where arms crowd a chest in shade it went near
    black: the girl's chest in the opening shot of `films/_test3d`).
  - `room.mjs`: the sofa's loose pillow is dusty rose (in mustard it read as part of the man's shirt behind his hip).
  - `sdf.mjs` `cached`: files live in `<os.tmpdir()>/cinecode-scene3d/<hash of sdf.mjs>/`; the first mesh a new
    version writes removes the other folders.
  - `checks.mjs` `feetSlide`: also checks a foot rolled onto its ball or heel (the point it stands on, from
    `desc.rig.ball` / `heel`) and crouched frames; only swinging and jumping feet are left out.
  - `compile.mjs` `unbuilt`: says nothing about an action `validate.mjs` already rejects as unknown.
  - Unused imports removed from `ball.mjs`, `materials.mjs`, `room.mjs`, `stage.mjs`.
- **Shapes (wave 0b, SHAPES track, 2026-11-13)**, against the repair:
  - `character.mjs` face: an eye is a rounder ball (depth 0.85 of its half width, was 0.62) sunk half its depth
    into the head (was 0.35); the lids follow the gaze up and down (upper lid +0.22, lower +0.15 per unit of
    `gaze[1]`); the iris slides toward the camera as the view leaves the front (a view-dependent paint: 0.03 of
    the eye at three-quarter, about 0.25 in profile). A brow's geometry is bent onto the head and carries its size
    (`extras.browL.scale` is 1 now; its `position` is set by the face: it slides along the head), it stands 0.3
    of its thickness proud of the skin (was 0.15), and `browUp` below 0 moves it 0.6 as far as above 0.
  - `sdf.mjs`: the `ridge` op also takes `axis` and `r` (strands wound round a bun, within 1.3 r of `c`). A new
    version of `sdf.mjs`: the mesh cache refills once (about 10 s).
  - `character.mjs` hair: every bun gets those wound strands (no new field).
  - `cast/man.mjs`: `rig.armSpread` 0.34 (was the default 0.22: the forward hand lay on the belly in the walk);
    eyes up 8 mm, brows down 16 mm and thinner; neck, sleeves and upper arms reshaped. `cast/girl.mjs`: neck,
    dress (raised back neckline, sleeve band, a thigh-borne egg in the front of the bell; `skirt` is `near` the
    thighs), collar (front only), side lock, shoe strap reshaped. Frames of anything with these characters differ.
  - Spin gate (`tools/spin.mjs`, unchanged): worst 1.24 over all nine (was 1.38); man 357k triangles, girl 282k
    (+0.3 %, +0.9 %); cold mesh build man 5.9 s, girl 2.9 s (was 5.6, 2.6).
- **Storyboard (wave 0b, STORYBOARD track part 1, 2026-11-13)**, against the repair:
  - Timing: a 3D film's actions are timed on the 3D motion system while the film compiler lays the film out.
    `compile.mjs` exports `createTiming(film)` → `{ free(rec, b, t), act(rec, b, t), footfalls(rec, id) }`, which
    `engine/film/load.mjs` hands to the compiler as `film.resolved.timing` (3D films only). It acts each beat out on
    performers of its own (characters built once a process, never drawn) and keeps each actor's part per scene in
    `rec.three` (Map id → `{ kind, start, calls: [[verb, args]], gestures, shown, hidden, release, mark, busy }`); the
    build replays exactly those calls on the drawn characters (no fitting any more: the old `move`'s dry runs and
    step-time stretching, the early entrance and the per-beat switch in `stageScene` are gone). In the plan a verb beat
    (walk, run, enter, exit, turn, pose, stand, gesture jump; a cat's walk, run, enter, exit, hop, sit; a ball's hop)
    starts at its time, or when its actor's previous verb ends (a warning in `plan.warnings`), and lasts as long as
    in 3D (a ball's hop: until it rests on its mark); the flat stand-in's move is slowed or hurried to match, and
    `finishExits` is skipped for 3D films. Auto footsteps of a 3D film come from the 3D feet (`footfalls`: every
    biped step's landing; a critter's fore paws, a leap's landing once). Relies on: every verb's return value, the
    performer's and critter's `tracks[foot].steps[i]` `{ t0, t1, pos, drop }`, `act.cur.pos` / `cur.yaw` / `cur.at`,
    `act.opts.size`. Frames of `films/_test3d` differ (it is re-written: beats follow one another).
  - Errors: `compile.mjs` exports `StoryError` (a storyboard asks what cannot be played: the film compiler names its
    shot and beat, `shot s01-02, beats[0] (walk cat): ...`) and `engineFault(e)` (anything else: `a fault in the 3D
    engine (not in the storyboard): <stack>`). `lintFilm` rethrows a build fault as one (it used to report any
    exception as a `build` error, stack dropped).
  - Words: `overlay.mjs` `drawOverlay(ctx, plan, t)` is replaced by `createOverlay(plan, built)` → `{ draw(ctx, t),
    words(t), over(t) }`; new `marksAt(plan, built, t)` → `[{ id, kind: 'head' | 'hand', box, z }]` (it poses the
    scene) and `hit`. Captions avoid those boxes (through a new 3D hook in `engine/film/frame.mjs`
    `captionSchedule`: `plan.facesAt`), titles move off their place to the nearest clear title place. Drivers'
    `points()` gained `hands`; drivers carry `R`. `source.mjs`: `canvas(t, debug)`, `overlay`.
  - Lint: `head-under-caption` is gone; new warnings `words-over-face` and `subject-hidden`; `head-out-of-frame` checks
    `scene.shots[i].framed(t)` (new: a pan lets go of its first subject, a push-in or pull-out with `toOn` of the
    others).
  - Camera: `tilt-down` starts above the framing and ends on it (it ended below it); where the room's bounds hold the
    lens so near that the framed part would fill more than 80 % of the frame's height, the lens widens (up to 70°).
  - `engine/render/sheet.mjs` `contactSheet({ cards })` / `sheetItems(plan, times, cards)`: a still under a card is
    labelled as the card (3D sheets only); `cinecode sheet --frame` / `--debug` work for 3D films.
- **Motion (wave 0b, MOTION track, 2026-11-13)**, against the repair:
  - Turns: the performer's heading eases (`face(t, yaw, dur)`, a half turn about 0.9 s) instead of stepping; a look
    lets go of a target more than 80 degrees round (all of it by straight behind) and the head is sprung as angles
    with `spring(..., { vmax })` at most 6 rad/s (`HEAD_TURN`); the critter's gaze likewise. `turn()` sets the
    heading over 0.65 of the turn: a 3D turn takes as long as before, the facing gets there later.
    New gate `checks.mjs` `TURN_GATE` (8 rad/s) and `motion().turns`. Callers: none must change.
  - `walkTo` turns on the spot first to a mark more than 90 degrees round (a first step that pivoted a foot half round
    crossed the feet's heading in one frame: a 120 m/s pop); it then ends later than before.
  - `sit({ on })`: turns its back to a seat that is not behind it, shuffles to half a leg in front of it (0.6 s
    more), bends forward on the way down; `stand` leans forward first. Both end later than before when they shuffle.
  - Running, each foot keeps more weight in the balance (0.1 + 0.3 x run): Scene Zero's run-stop no longer swings
    the hips 8 cm in 30 ms (girl pops 4.65 to 3.40 m/s).
  - Critter: new `turnTo` / `turn`; a `walkTo`/`trotTo`/`runTo` to a mark more than 30 degrees off turns first (it ends
    later); `hopTo`/`hop` of 0.2 to 2 m: flight time from the height (`air` overrides), push, a ballistic flight of
    chest and hips, a landing that bends by the landing speed; its paws' leap steps carry `leap`, `part` and `drop:
    true` (no more `drop` stepping). All leaps 0.2 to 2 m, down, up and level: pops at most 4.04 m/s, reach 0.
    STORYBOARD may drop the 0.7 m cap and `air: 0.4` in `compile.mjs` hop.
  - World: `world.radius(name)`, `motion.mjs` `detour`; a performer's walk and a critter's gaits in a world bow round
    others (not a run). Actors without a world walk straight, as before.
  - `checks.mjs` `overlap`, `capsulesOf`, `OVERLAP_GATE`; `tools/check-motion.mjs` prints turns and overlap.
  - `tools/spin.mjs` (moved to this track for wave 0b): six moving spins (`man-turn man-walk-turn girl-turn
    girl-walk-turn cat-turn cat-trot-turn`) at 120 Hz with a fixed camera, writing `<name>.mp4`, `.jpg` (strip) and
    `.json` (the series); the frozen nine are unchanged.
  - `scenes/zero.mjs`: the cat's hop lands at `[-0.15, 0, -0.88]` (the man's reaching hand went through its head at
    6.19 s); it sits at 9.98 s. Frames of Scene Zero and `films/_test3d` differ.
- **Look (wave 0b, LOOK track, 2026-11-13)**, against the repair: the picture moved to the reference's values.
  Frames of Scene Zero and `films/_test3d` differ (every pixel).
  - `light.mjs` `LIGHTS.golden`: the sun at `az` 125, `el` 12 (was 58, 16: it came in by the back window and now
    comes in by the room's side windows), cream `0xffe8c8` at 2.6; low cool fills (`sky` 0.18, `shade` 0.42 of
    `0xa8acf4`, `ground` 0.12), `bounce` 0.35, `air.density` 0.025; grade `exposure` 0.95, `contrast` 1.0,
    `saturation` 1.1, `lift` `0x0e0a16`, `bloom` 0.04, `glow` 0.02. `morning` and `noon`: `ground.power` 0.3 (was
    0.55, 0.6). Every row is still complete and renders.
  - `room.mjs`: `ROOM.side` (new: five tall windows in the left wall, with glazing bars); `ROOM.sunDir` is gone (no
    caller). The bounce patches are the floor and the back wall (the right wall was), the sky portals are all six
    windows. `dustMotes(stage, { count = 300, seed })`: `zMax` is gone; the specks are laid out in every opening and
    loop (sink half a metre in 42 s, fade in and out) instead of sinking out of the room. The loose sofa cushion is
    a plump striped cushion in the middle of the seat (was a rose slab at the right end). Ceiling `0xd8ccbc` (was
    `0xf2e6d2`); the walls darken a little more toward the ceiling.
  - `stage.mjs`: `setSun({ air })` (the room keeps z > 2 clear); `look.shoulder` default 0.7 (was 0.55) and the
    shoulder now bends the brightest channel toward 0.92 (paper white) and scales the others with it (it bent each
    channel toward 1); `contrast` is applied at 0.4 strength in the lights; the ink line is drawn on the near side
    of a jump only, two pixels wide in shade where the jump is large, and not past 12 m.
  - `materials.mjs`: in shade a surface keeps its hue and is darkened by its luminance to the power 0.6 (it was
    the colour to the power 1.18, which turned cream shade brown); `paint` adds dry-brush strokes as strong as
    `mottle`; `softShadowFilter` turns its sample disc by a quarter turn per sample of the 2 x 2 block (was a hash
    per sample).
  - `tools/look.mjs`: also gates RMS contrast (at least 58) and the 1st percentile of luma (15 to 45), prints them;
    the still tiles of the flicker gate are judged once, with the grain off.
  - `test/scene3d-picture.test.mjs`: frame 222 at 960x540 to the new gate; new test: the dust at 0, 600 and 1800 s.
- **Long films (wave 0b, STORYBOARD track part 2, 2026-11-13)**, against all of the above:
  - `compile.mjs` `compileScene`: a scene is staged when it is first asked for, not in `build`: `built.scenes[i]` is
    `{ id, t0, t1, time, stage, drivers, shots, pose(t), camera(t), drop() }` with `drivers` and `shots` getters that
    stage it (`drop()` lets it go; staged again it is the same). `update(t)` drops the scenes more than one behind the
    one at `t`, and first solves part of the next shot's camera (paced to finish before the shot at `t` ends). A shot's
    camera is solved at its first `camera(t)` (`cameraFor` now returns `{ step, at }`; `scene.shots[i]` gained
    `solve()`: one sixth of a second a call, → how many are left, 0 when done); a solve puts back the pose the scene stood in (`scene.last`). A cast entry's `act` is a getter
    (its first scene's performer). The cameras are the same numbers as before (the same calls per shot): frames of
    `films/_test3d` drawn with every camera solved up front and solved as they come are the same bytes.
  - `lint.mjs` stages every scene and solves every camera inside its fault catch (it did so through the eager build).
  - Camera: `tilt-up` / `tilt-down` turn the lens where the framing puts it (they moved it with the aim: a wide tilt-up
    on the girl and the cat stood the lens under the floor, outside the room). Frames of tilt shots differ.
  - `index.mjs` `pixels(t, into)`, `stage.render(frame, { ..., into })`, `host-node.mjs` `read(into)`: the read-back
    is written into `into` when given (a new Buffer otherwise, as before: the tools that keep frames are unchanged).
  - `overlay.mjs` `createOverlay` → also `bare(t)`: nothing lies over the picture at t.
  - `source.mjs`: `pixels(t)` reads the picture into one buffer kept for the source, and where nothing lies over it
    returns that buffer itself (valid until the next call; `encode.mjs` writes it out before it asks again; only where
    `pixelOrder()` is `'rgba'` and the size is the plan's); elsewhere it goes through the canvas as before. A full
    garbage collection runs after every `fps` frames (`v8.setFlagsFromString('--expose-gc')`). The warm-up draws the
    first picture with every cast member shown and nothing frustum-culled, plainly and with the vector blur, then puts
    `frustumCulled` back: every pipeline is built there (`films/_test3d`: 293 at its first picture, none after).
  - `engine/render/video.mjs` `renderVideo({ resume })`: a key naming what is drawn makes the render resumable
    (segments of `CHUNK` = 480 frames split evenly over the range, kept in `.<out>.parts/` with `resume.json` holding
    the key and the options; whole segments are reused, the folder is kept when the render stops). `audio` may be a
    promise of the WAV's path. The result gained `jobs` (processes that drew; `segments` is the number of files). The
    worker message is now `{ parts: [{ range, outPath }], ... }` (was `range`, `outPath`): a worker encodes its parts in
    order, each to `<outPath>.part.mp4` renamed when whole.
  - New `engine/render/sound.mjs` `soundJob(filmDir, onStep, signal)`: `render`'s music and mix in a child process
    (the same steps and bytes). `cinecode render` of a 3D film starts it beside the picture and passes `resume` (a
    stamp of the film's files and of `engine/`: path, size, time); a 2D film waits for it before drawing (no `resume`; its frames, music,
    mix and mp4 are byte-identical to main: `films/_test`, `glim`, `kite`).
- **Integration (wave 0b, 2026-11-13)**, against all of the above:
  - Storyboard verbs (`compile.mjs`): `sit` for the man and the girl (also `pose: "sit"`), on the seat the kit names at
    the mark they stand at (`KITS.room.seat(x, z, leg)` → `{ on, front }`: new; a two-legged move to a mark on a seat
    stops at its `front`) or on the floor; `stand` from a sit is the performer's `stand()`. The cat gained `turn` and
    `stand`; its `hop` is the critter's own leap of 0.2 to 2 m (the 0.7 m cap, `air: 0.4` and the trot after it are
    gone; over 2 m is a `StoryError`), turned to first when the mark is more than 1 rad off its heading. A sitting
    actor asked to move is a `StoryError` (`... is sitting: give it a "stand" first`). The cat's looks ease in over
    0.5 s (was 0.3: a look 1.3 rad round at a scene's start turned its head 9.9 rad/s). `library.mjs` `RIGS.man/girl.poses`
    gained `sit`. The plan's timing comes from these calls like every other verb (no change to `createTiming`).
  - Lint (`lint.mjs`): `collide` is now `checks.mjs` `overlap` (capsules deeper than `OVERLAP_GATE`; the disc test is
    gone) and a new error `turn-speed` (`motion().turns` over `TURN_GATE`, posed at 48 Hz); every check runs scene by
    scene through the new `checks.mjs` `sceneSource(src, sc)`. `tools/check-motion.mjs` checks a film scene by scene.
  - Removed: `compileScene`'s cast `t0` and `act` getter and `feetSlide`/`pawSlide`'s `t0` (the checks take a scene
    through `sceneSource`); `createStage`'s `ss`, `msaa`, `occlusion` options and their branches (`SS` = 2, no
    multisampling, the first pass always on; Scene Zero frames 100 and 222 are the same bytes as before), `stage.parts`,
    `stage.debugOutput`, `stage.aoPass`; `scenes/stage1.mjs`; `tools/check-feet.mjs`, `tools/check-paws.mjs`,
    `tools/stills.mjs`, `tools/sheet.mjs` and `tools/render.mjs --still` (`tools/strip.mjs` is the one still tool:
    `--times T --cols 1`); exports used only in their own file: `ball.mjs` `ballPath`, `checks.mjs` `capsulesOf`,
    `sdf.mjs` `smin` / `smax`, `sets.mjs` `canvasTexture`, `room.mjs` `curtain`.
  - `room.mjs` `livingRoom(stage)` → `{ update(t) }`: the room as `scenes/zero.mjs` and the kit `room` dress it (they
    each had a copy). Frames unchanged.
  - `films/_test3d`: a second scene at twilight (the man walks to the sofa and sits; the cat turns, leaps onto the sofa,
    turns to him and sits; a medium shot with the title "Home." placed clear of his face); cards 2 s each; 28.6 s.
  - `test/render.test.mjs`: the resume test no longer fails when the stop comes after both segments are whole.
- **Repair (wave 0b, 2026-11-13)**, from the independent checks:
  - `motion.mjs` `curve(points)`: a point at or before the time of the point before it replaces that point (two keys
    at one time made 0 / 0: the cat of `films/_test3d` went NaN from 17.13 to 17.28 s, frames 412 to 414, because the
    film's finish gave it an alert key at its first key's time). `springVec` asks its target once a step for every
    number (the same values; it was once per number). `checks.mjs` `motion()`: a bone whose world matrix is not finite
    is a pop of `Infinity` at that time.
  - `checks.mjs` exports `GATES = { pops: 5, holds: 1/3, reach: 0.005, through: 0.005 }` (the film test and lint use
    them). `lint.mjs` runs `motion()` on every scene at 240 Hz and adds the errors `pop`, `hold`, `over-reach`,
    `through-body`; `turn-speed` now reads `<who>: the <joint> turns at X rad/s (more than 8): ...`; the plan's warnings
    (an action that waits) are lint warnings (rule `waits`). `tools/check-motion.mjs` prints `RESULT:` and exits 1
    when a gate fails, and prints a storyboard error and exits 1 instead of a stack.
  - `performer.mjs`: `export const TURN_FIRST = 1.05` (a walk or run to a mark further round turns on the spot first;
    was 1.6, and `compile.mjs` `move` does the same, turning with `stepTime` 0.3, `per` 1.6). A walk that starts
    more than 0.2 rad off its way leads with the outside foot; steps are at most 1.15 x `stepLen` (one more step
    instead). The weight's sideways shift follows the support foot through a spring (1.3 Hz, leading by 0.08 s), the
    hips' yaw follows the feet' through a spring (2.2 Hz) and the idle life fades in and out through a spring (1.5 Hz)
    of the supports. A turn on the spot places each foot (arc `sin²(πu)`, position `smoother(u)`). `sit`'s own turn
    uses `stepTime` 0.36, `per` 1.6. (The window walk from `rug_left`: pelvis 72 rad/s and a 222 m/s pop before;
    every gate passes now.)
  - `stage.mjs`: a GPU validation error or a lost device during `render()` rejects it (`the GPU reported an error
    (GPUValidationError): ...`) instead of returning a blank picture. The grain's per-frame offset is
    `frame * 37 mod 4096`, `frame * 17 mod 4096` (it grew without bound; the grain bytes differ from frame ~110 on).
  - `compile.mjs`: `verbNames()` (every storyboard verb a 3D rig can do; `load.mjs` passes it to `validate.mjs` as
    `do3`, so an unknown action lists the 3D verbs); a `format.width` or `height` over 4096 is a storyboard error
    (`a picture more than 4096 px wide is not built for the 3D engine yet`). `validate.mjs`: an unknown kit is one
    problem (its anchors are not then reported missing).
  - `engine/film/frame.mjs` exports `fadeAmount`, `START_FADE`, `END_FADE`, `CARD_DISSOLVE` (values unchanged; 2D
    frames byte-identical); `overlay.mjs` uses them instead of its own copy. Removed: `light.mjs` `lilac`, an unused
    `X` in `quadruped.mjs`, unused staged-scene fields in `compile.mjs`.
  - `light.mjs` `twilight`: lighter and warmer (sun 0.45, sky 0x6f78d8 0.32, shade 0x8a80d0 0.34, ground 0xb88090
    0.16, bounce 0.5, outdoor 0.75, air 0.02, lamp 0xffb468 0.85; grade exposure 0.95, contrast 0.9, saturation 1.08,
    lift 0x080612, bloom 0.1, glow 0.22). RMS contrast about 46 against the look gate's 58: kept below it as a taste
    decision (STATUS.md).
  - `engine/render/cli.mjs`: `check` of a 3D film lays the plan out (a storyboard error exits 1) and prints its
    warnings (`film.warnings`, `plan.warnings`), as `plan` now does. `render` of a 3D film keeps `out/mix.wav` and
    `out/music.wav` when `out/.sound.stamp` matches the film's and the engine's files (`mix ... are up to date`). The
    2D log order is main's again (music, mix, srt, range). `help lint` says what a 3D film's lint does (out/lint.json
    only). `video.mjs`: a missing audio file is an error.
  - `films/_test3d` s02: the man starts at `window` facing right and walks to the sofa with no `face` (one turn, at
    the sofa); 29.6 s, 710 frames. `tools/spin.mjs`: the moving walks use the rig's own walk pace (`RIGS[who].walk`).
- **Library pieces (LIBRARY, 2026-11-13)**: the shape language, the car and the house moved into the engine from
  the "Dad's Home" builders' scratch folders (`film1/kit`, `car`, `home`); see "Hard objects and places" above.
  - New: `shape.mjs`, `props/chair.mjs armchair.mjs mailbox.mjs`, `car/shape.mjs car.mjs drive.mjs driver.mjs`,
    `home/home.mjs parts.mjs kit.mjs`, `scenes/home.mjs`, `tools/sheet.mjs` (props and the car), `tools/views.mjs`
    (the house's cameras), `test/scene3d-pieces.test.mjs`, `docs/scene3d-shapes.md`.
  - `shape.mjs` thins every part's mesh after surface nets (quadric-ordered half-edge collapses while the surface
    moves under 1/20 of a cell): the car went from 442 348 triangles (body 225 092) to 60 476 (body 18 522); the
    kit's other pieces likewise. Cold meshing is slower (the car 11 s → about 19 s; cached 0.6 s). Meshes and
    digests differ from the scratch kit's.
  - `car/drive.mjs` `driveTo`: the car's middle now stops on the last mark (it stopped up to 15 cm off it) with its
    wheels straight (the back-axle path's last point is set behind the mark the way the path ends up facing).
  - `materials.mjs`: `paint({ keepHue })` (was `car.mjs` `keepHueInShade`, a copy of `PaintLightingModel.indirect`;
    `PaintMaterial.customProgramCacheKey` adds `:keepHue` for such a paint only) and `colourPassOnly(node)` (was
    `car.mjs` `InColourPass`). Paints without `keepHue` build the same shaders: Scene Zero and `films/_test3d` frames
    are the same bytes.
  - `room.mjs`: `buildRoom(stage, { garden, door })` and `livingRoom(stage, opts)` (the house's two workarounds,
    removing the garden cards by type and cutting the hall doorway out of the built walls, are gone); exports
    `wallPaint`, `boards` (the house used copies) and `sofaSeat` (`KITS.room.seat` is it). Defaults build the same
    room, in the same order: Scene Zero frames 4.2 and 9.25 s and `films/_test3d` frames 9.3 and 23 s are the same
    bytes as before.
  - `library.mjs`: `KITS.home` (`home/kit.mjs`). A kit may have `areas`; `compile.mjs` `stageScene` frames a scene's
    cameras from the area its set names (`K.areas[area]`: `view`, `stage`, `bounds`), a staged scene carries `area` and
    the area's `stage`, and the build calls `place.light(time, area)`. `unbuilt`: sets of one kit are allowed in a
    film (`more than one kit in a film` replaces `more than one set`), and `sets.<id>.area` must be one of the kit's
    areas. Callers: a kit's `light(time)` may take a second argument.
  - `home/home.mjs` `doorSwing`: a shutting cue latches at its first touch of the frame (it bounced back to 7e-6 at
    6 s). `HOME_KIT.floor.x0` is -30 (it was -7.4: `street_right` and the `right` side were off the floor).
  - The tests' 3D kit lists read `home, room`.
- **Storyboard wiring (STORYBOARD, 2026-11-13)**: a storyboard can use the place `home`, the car, the front door, the
  ball and the cat as "Dad's Home" needs them (`docs/scene3d.md` "The house, the car, the ball and the cat").
  - Storyboard: rig `car` (cast `params.color` "#rrggbb"); actions only a 3D film has (`compile.mjs` `OWN`, taken by
    `validate.mjs` through `ctx.do3`): `drive` (`to`, `dur`, `arrive` (seconds from the shot's start), `speed`), `stop`,
    `roll` (`to`, `dur`, `from`: the cat that bats it), `open` / `close` (`to`: `"door"` or a car; `dur`, `speed`; no
    `who`); for the car `set` with `params` `lights`, `engine` (`on` / `off`); `place` for a rider getting out of a
    car; a cat's `gesture` `skid` (`RIGS.cat.gestures`); a ball's `hop` to `"on:<two-legged actor>"` (picked up); a
    cat's `hop` / `walk` / `run` to `"near:<ball>"` (a pounce at where it will be; going after it to where it rests);
    scene actors `"on": "<car>"` (a two-legged rider, one a car) and `"pose": "sit" | "crouch"` for two-legged actors;
    camera `area`.
  - `validate.mjs`: an action in `ctx.do3` is known; `open` / `close` need no `who`; `drive` and `roll` need a `to`
    (`checkTarget`); `DO_KEYS.drive = ['arrive']`. A 2D film never reaches these (its actions are `DO` only).
  - `engine/film/compile.mjs`: `drive` and `roll` move the flat stand-in as a walk (a roll from the hands as a hop off
    them); `stop`, `open`, `close` take 0 there; `act3d` passes the shot's start to `T3.act(rec, b, t, shotT0)`.
  - `compile.mjs`: rig kind `car` (`createCar` on the one body the build makes: `buildCar({ color })`); the timing's
    calls are `[verb, [args]]` (a car's `driveTo(marks, opts)` takes two): callers that push calls by hand (tests)
    write `['turn', [{ ... }]]`. A ball's part keeps `ops` (`['hold' | 'throw' | 'hand' | 'roll' | 'pick' | 'rest', ...]`,
    `ballOp`, `ballLegs`) where it kept `release` / `mark`. `rec.doors` (film-time cues of the place's door, passed to
    `K.build(stage, { door })`). Each shot of a staged scene has `area` and `stage` (the area it is framed from:
    camera `area`, else where its subjects stand, else the set's); the build lights each shot by its area; `lint`'s
    head-out-of-frame reads the shot's `stage`. A move through `K.walls` stops `check` (`throughWalls`). A biped
    starting `sit` / `crouch` sits or crouches before 0 (t0 -3.5 / -2): settled by the first frame. `footfalls` leaves
    out steps before the scene starts and a car's (none).
  - `library.mjs`: `RIGS.car`; `RIGS.cat.gestures = { skid: 0.5 }`.
  - `home/kit.mjs`: `doors: { door: doorSwing }`, `walls` (`{ a, b, door | gap, via, name }`), `route(from, yaw, to)`
    → `{ marks } | { error }` (the road's middle at z -13.8, the turn into the drive from either end), `carStart(at,
    yaw)` → `{ at, yaw }`.
  - `car/drive.mjs`: `createCar({ mesh })` (`null`: a plan with no body, for timing; `group` is then undefined);
    `stop({ t0 })` brakes the drive under way at `brake` and ends it where it stands (→ the time). The plan's read-out
    goes by the table's length (stop cuts it).
  - `car/driver.mjs`: `seatDriver(car, desc | character)`: a built character (`buildCharacter`) is seated as it is.
  - `ball.mjs`: a ball set going along the floor only rolls (`ballPath`); `rollTo({ t0, p0: [x, z], to, stop, r, roll })`;
    `rollBall(act, { from, t0, to, stop, r })` (from the hands of a sitting performer: carried, taken down past the
    feet, pushed off at t0; from the people builders' `rollBall`); `pickUp(act, at, { t0, grab, r })` (the hands'
    part only: reach, then carry; the crouch and any walk are the caller's). The right hand reaches for the ball's right
    side (a hand's breadth out, as `rollBall`'s): reaching for its middle put the girl's forearm 5 mm into her
    crouched body when the pick-up started 2.0 s into a scene (15 start times from 0 to 3.5 s now lint clean). The hand
    does not get down to the ball: at the grab the girl's middle finger's middle bone is 5.4 cm above its top (the same before this change: 6.1 cm).
  - `quadruped.mjs`: `bat({ t0, at })` (a fore paw out to touch `at` at t0 and back; → t0 + 0.25), `skid({ t0, dist,
    dur })`. The cat breathes through its neck (head pitch ± 0.025 rad) and its chest forward and back (± 1.5 mm):
    a cat holding a look, or sitting or standing still, had a joint dead still past the hold gate (an ear 0.64 s, a
    fore leg 0.38 to 0.41 s). `films/_test3d` still passes its gates.
  - `lint.mjs`: skips actors with no body (a ball, a car) for feet and paws.
  - Tests: `test/scene3d-story.test.mjs` (new, no GPU); `test/scene3d-film.test.mjs` reads a thrown ball's mark from its
    `ops` and pushes calls as `[verb, [args]]`; its unknown-rig and unknown-action lists include the new names.
- The boy and the man's work clothes in the engine (CAST, 2026-11-13; from the people builders' `scratch/film1/people/`):
  - `cast/boy.mjs` (new): `boy` (Milo, about six, 1.1 m; the people builders' `boy.mjs` with relative imports) and
    `boyWith({ skin, hair, shirt, shorts })` (0xrrggbb each, optional) → the same description recoloured (the hair's
    colour is the brows' too; nothing is meshed again).
  - `cast/man-work.mjs` (new): `manWork` (the man in a shirt, trousers, shoes and a briefcase: the people builders'
    `dad.mjs`), name `'man-work'`. It spreads `man` and replaces its parts; its `hang` block hangs the case.
  - `character.mjs`: `grow(ops, d)` (from `cloth.mjs`: the solids grown by d; sub and clip dropped). A part with
    `fit: <solids>` is weighted as the skin under it, in the cached build (each point taken onto the `fit` shape by three
    Newton steps, then `skinShape` with the `skin` part's `soft`); its cache key adds `fit` and `skinSoft` (parts
    without `fit` keep their keys: every old mesh is served from the cache as before). Same weights as `cloth.mjs`
    `fit()` to the bit (both garments of both, `film1work/cast/fitsame.mjs`). `EXPRESSIONS.laugh` (new).
  - `hang.mjs` (new, from the people builders'): `hangOn(act)`; `createPerformer` calls it for a description with a
    `hang` block, unless given `hang: false` (→ the performer with `apply` replaced and `hangAt(t)` added). Callers of
    `hangOn` by hand: drop it.
  - `performer.mjs`: options `runArms: { twist, spread }` (laid on the arms in a run, by `ctx.run`) and `hang`; verbs
    `tired({ t0, t1, amount, ease })` (a layer: → t1), `sigh({ t0, dur = 1.6 })` and `laugh({ t0, dur = 1.4 })` (laid
    over: → their end). `clap`'s lift in a jump is at most three quarters of the way from the shoulder line to the
    mouth (`desc.face.mouth.at[1]`): the boy's and the man's jump-claps sit lower (boy 0.114 → 0.083 m above the
    shoulders, man 0.204 → 0.161); the girl's is unchanged (0.100, cap 0.104), so `films/_test3d` and Scene Zero are not.
  - `library.mjs`: `RIGS.boy` (height 1.1, head 0.33, width 0.42, walk 0.34 / 0.36 s, run 0.42 / 0.17 s, performer
    `{ armSwing: 0.6, toeOut: 0.2, seed: 11, runArms: { twist: -0.4, spread: 0.18 } }`); a rig's `params` (name → `'#'`
    a colour, or the values it takes) and `look(params)` → the description; `RIGS.man.params = { wardrobe: ['work'] }`,
    `RIGS.boy.params = { skin, hair, shirt, shorts: '#' }`, `RIGS.car.params = { color: '#' }`; `descOf({ rig, params })`
    (new export). Every biped's gestures add `sigh` 1.6 s and `laugh` 1.4 s, its expressions `tired`.
  - `compile.mjs`: `unbuilt` checks cast params against the rig's `params` (one message shape for every rig; the car's
    are unchanged). Timing rigs are keyed by rig and params; the drawn cast keeps `desc` (`cast[id].desc`), and the
    driver's seated body is built from it. An expression `tired` is `act.tired({ t0, t1: next + 0.6 })` (at a cut it
    starts 0.6 s before, so it is there at the cut), not `express`.
  - `car/drive.mjs`: `driveTo` plans from the back axle where it stands (`cur.pos`); it planned from the car's middle
    and so moved the car 1.28 m forward in one frame at the start of every drive that did not start at a scene's
    very start (a parked car driving off, a second drive). A first drive at a scene's start now starts where
    `carStart` puts the car (it started 1.28 m further on).
  - `car/driver.mjs`: the seated driver's performer has `hang: false`, and the parts that hang (a case) are hidden.
  - `tools/spin.mjs`: `CAST` holds cast entries (`dad`: the man, wardrobe work); performers take their rig's
    `performer` options (the girl's were written in by hand: the same numbers); kinds `sit`, `crouch`, `jumpclap`;
    spins `boy-*`, `dad-*` (`boy-sit`, `boy-jump`, `dad-crouch` among them) and moves `boy-turn`, `boy-walk-turn`,
    `dad-turn`, `dad-walk-turn`.
  - Tests: `test/scene3d-cast.test.mjs` (new, no GPU, 6 tests).
- A scene actor may start facing a place (FILM "Dad's Home", 2026-11-13; written by the film's first agent, checked and
  recorded by the second):
  - `engine/film/validate.mjs`: a 3D film's scene actor `face` may be any string (`ctx.do3`); the 3D side checks it.
  - `compile.mjs`: `unbuilt` accepts a scene actor's `face` of `left`, `right`, an anchor of the set's kit, a point
    `"x:…,y:…"` or another actor of the scene that stands `at` a place, and names anything else; `startOf` turns the
    actor (a car too) to face it as the scene starts (`left` / `right` as before).
- Repairs for "Dad's Home", round 1 (FILM REPAIR, 2026-11-13):
  - `home/home.mjs` `HOME_LIGHTS`: `golden.inside` takes cream fills instead of the engine's lilac (`sky` 0xf0dcc8
    at 0.24, `shade` 0xf0dcc8 at 0.5), `bounce` 1.0 (was 0.35), `air.density` 0.04 (was 0.025), `grade.shadows`
    [1.0, 0.97, 0.94] (was [0.9, 0.93, 1.12]); `golden.outside` `shade` 0xe8d8c4 at 0.75 (was 0xb0b4f0 at 0.35),
    `ground` 0xd8d0a0 at 0.36 (was 0xc8d49c at 0.18); `twilight.outside` navy fills (`sky` 0x44528e at 0.6, `shade`
    0x40508a at 0.85, `ground` 0x34462e at 0.3; were 0x5a6ad0 / 0x6a70c8 / 0x6a5a98), the sun at 0.08 (was 0.2: no hard
    shadow at 3 degrees), `grade.shadows` [0.95, 0.97, 1.06] (was [0.85, 0.9, 1.2]), `lift` 0x0e1018 (was 0x160e28).
    `LIGHTS` (the room kit, `films/_test3d`, Scene Zero) is unchanged.
  - `home/kit.mjs`: `HOME_KIT.surface(x, z)` → the ground at a floor mark: `wood` in the room, `stone` in the hall, on
    the step, the path, the pavement and the road, `dirt` in the gravel drive, `grass` elsewhere outside.
  - `library.mjs` `kit2d`: a kit's `surface(x, z)` (metres) becomes the stand-in set's `surfaceAt(x, y)` (px), so the
    automatic footsteps take the ground's sound (they were `footstep-wood` everywhere). A kit without one keeps `wood`.
  - `compile.mjs` `createTiming().footfalls`: a four-legged actor's steps are `kind: 'paw'` (a leap's landing stays
    `land`); `engine/film/compile.mjs` `moveSounds` plays a `paw` as the ground's footstep at gain 0.1 and weight 0.1
    (a cat's pads, near silent; they were the boy's steps at gain about 0.6). 2D films never make a `paw`.
  - `performer.mjs` `clap`: each clap opens its own width (0.17 m x 0.4 to 1.1, picked by the clap's number, so it
    changes only when the palms meet), and the hands' targets stay 0.032 (x the body's scale) either side of the
    middle when they meet (was 0.02: the forearms crossed). `films/_test3d` and Scene Zero clap, so their frames change.
  - Tests: `test/scene3d-story.test.mjs` "the footsteps of "home" sound the ground ..." and "a clap: the palms stop
    where they meet ..." (no GPU).
- Repairs for "Dad's Home", round 2 (FILM REPAIR, 2026-11-13):
  - `performer.mjs` `clap`: the hands meet 0.2 (x the body's scale) in front of the chest and 0.05 below its middle,
    elbows down (`elbowDir` [0.5, -0.85, -0.1] in the chest's frame, was [1, -0.35, 0.1]), wrists not rolled
    (`wrist` [-0.1, 0, 0], was [-0.1, 0, 1.2]): thumbs up, palms facing, fingers forward; the targets stay 0.035 either
    side of the middle at contact (was 0.032). The fingers stopped 31 mm past the middle before (they crossed in an
    X); now 6.5 mm short of it (the boy). `films/_test3d` and Scene Zero clap, so their frames change.
  - `quadruped.mjs` `createCritter(...).meow({ t0, dur = 0.7 })` (new): laid over whatever it does (does not move the
    clock): the chin lifts 0.32 rad, the ears go back (pitch -0.45, roll +0.2), the lids half close, the last three
    tail bones curl up 0.3 rad, eased in and out over 0.15 s. Returns `t0 + dur`. The cat rig has no mouth: none opens.
  - Storyboard: `{ "do": "gesture", "who": "<cat>", "name": "meow" }` (`library.mjs` cat `gestures: { skid: 0.5, meow:
    0.7 }`; `compile.mjs` plays it laid over: `isVerb` is false for it, a sitting cat may meow; the check names "skid"
    or "meow"). The sound is still the writer's sfx beat.
  - `library.mjs`: a rig entry's `feet: 'socks'` (the boy) is carried onto its 2D stand-in (`rig2d(...).feet`);
    `engine/film/compile.mjs` `moveSounds` plays such a rig's steps at half the gain and half the weight (a softer,
    duller footstep). 2D rigs have no `feet`, so 2D films are unchanged.
  - `compile.mjs` `prop(...).head(t)`: while the ball's legs are still being laid (a look at it read by the hands that
    pick it up or bat it), it is where it started on the floor (was a crash: `Cannot read properties of null`).
  - `cast/cat.mjs`: the ears' hollow is shallower (the cut and the pink lining 1 cm further out) and the lining paler
    (`pink` [1.08, 0.8, 0.78], was [1.05, 0.62, 0.62]): from behind it read as a dark hole in the head.
  - `home/home.mjs` `HOME_LIGHTS.twilight.outside`: slate fills (`sky` 0x4a5a7c, `shade` 0x5a5c6c; were 0x44528e,
    0x40508a), the lamp amber 0xffa04a at 5 (was 0xffb468 at 7), `grade` `exposure` 1.9 (1.8), `contrast` 1.4 (1.45),
    `shadows` [1.0, 0.98, 1.0] (was [0.95, 0.97, 1.06]), `lift` 0x14110e (was 0x0e1018). `LAMP.outside` [-2.1, 2.2,
    -1.5] (was [-2.3, 2.2, -0.6]): the cheated lamp stands above and in front of anyone at the big window, so the faces
    in it are lit warm (they were lit by the blue fills from outside). Indoors and golden hour are unchanged.
  - Tests: `test/scene3d-story.test.mjs` "a clap: ..." now also asserts no finger goes past the middle (it fails on the
    round 1 clap: 31.0 mm); new "a cat's meow lifts its chin ...; a boy in socks treads soft" (no GPU).
- Repairs for "Dad's Home", round 3, the characters and the cat (PEOPLE, 2026-11-13):
  - `character.mjs` `mouthPaint`: a mouth reads side on. As the camera leaves the front of the head (|side| 0.75 to
    0.97, side = the camera's direction from the mouth in the head bone's frame, read each frame through a
    `uniform(Matrix4).onObjectUpdate` on the head bone), the half of the mouth toward the camera is measured back along
    the side of the head (depth behind the mouth's front over half widths, x `face.mouth.depth`, default 0.5) instead of
    across it, so its corner sits about two half widths back round the cheek, and its line is up to 1.9 times thicker.
    From the front and three-quarter it is as before. New `face.mouth` fields: `depth` (0.5; the man 0.8: further back
    the line ran onto the jaw's locks and read as two mouths) and `line: false` (only an opening is painted: a shut
    mouth draws nothing).
  - `character.mjs` eyes: the eyeball is shaded with its normal bent 70 % toward the face's outward axis
    (`normalNode`), so the lids painted on it light like the skin round them (as a ball they were pale discs under a
    high light, dark rings under a low one).
  - `character.mjs` `addHair` (hair and beards): `keepHue: true`, `rim` 1.3 (was 2.4), streaks x0.86..1.22 (were
    0.78..1.45). A dark paint lit the usual way went near black in the room and mid brown with bright streaks in the sun.
    Every haired character's look changes a little (`films/_test3d`, Scene Zero).
  - `cast/cat.mjs`: the ear hollow starts above the skull (`sub` cone a [0.075, 0.428, 0.236], ra 0.02; was a [0.07,
    0.4, 0.242], ra 0.03, which also scooped a crater in the skull in front of each ear); the pink lining moved with
    it. The coat (`cream`) is light ginger [1.06, 0.88, 0.7] (was [1.04, 1.02, 0.97]), so it reads as the same ginger
    tabby outdoors. A mouth: `face.mouth { at: [0, 0.281], width: 0.048, line: false, teeth: false }`.
  - `quadruped.mjs` critter: the mouth opens over a `meow` (from t0 + 0.02 s, open by + 0.1 s, shut by + 0.54 s; open
    1.15, round 0.35). New `yawn({ t0, dur = 1.6 })` (head up 0.4, eyes 0.8 shut, ears back, mouth wide for the middle
    third; laid over, returns t0 + dur) and `opens(...keys)` ([time, amount] keys of the mouth: a pant about 0.3).
    `bat({ ..., watch = true })` looks at a point 0.3 m beyond what it strikes from t0 - 0.4 to t0 + 0.2 (ease 0.15),
    and that look wins over the writer's looks (`top`). Looks: `HEAD_TURN` 3.5 rad/s (was 6), gaze spring f 2.6, z 0.8
    (was 3.6, 0.7).
  - `performer.mjs` looks: `HEAD_TURN` 3.5 rad/s (was 6; now exported), the head's spring f 1.7, z 0.85 (was 2.3, 0.78);
    the chest turns toward its own later point (spring f 0.9, at most 0.6 x HEAD_TURN) a fifth of the way, and the head
    the rest. An 80 degree look: the eyes there first, the head half way in about 0.3 s, the chest after it. Idle life:
    the weight shift 0.42 x width (was 0.3), head and chest drift larger (head yaw 0.1, pitch 0.07, roll 0.05; chest
    0.07), breath 0.0045 x size (0.003), chest swell 0.013 (0.008), and under a look the head keeps drifting about its
    point (yaw 0.08, pitch 0.06, roll 0.04 rad; a look used to hold it dead still).
  - `cast/boy.mjs`: the freckles are small, sparse and light, over the bridge of the nose and the tops of the cheeks
    (y 0.858-0.888, 0.45 strength; were a band under the eyes at 0.7 that read as dirt). The skin always inside the
    shorts is cut away (`underShorts`), so a deep hip bend cannot bring the thigh through the seat; the clothes are still
    fitted to the whole skin.
  - `cast/man.mjs`: `face.mouth.depth` 0.8.
  - Tests: `test/scene3d-cast.test.mjs` "the cat's mouth opens on a meow and a yawn ...", "a look eases: ...", "the
    boy's skin is cut away where the shorts always cover it ..." (no GPU).
- Repairs for "Dad's Home", round 3, the house, the car and the light (PLACE, 2026-11-13):
  - `materials.mjs` `PaintLightingModel.indirect`: a `keepHue` paint takes the fills as a neutral grey (1, 1, 0.97) of
    their strength (was a warm (1.12, 1, 0.82)) and is darkened by its own lightness to the power 0.2 (was 0.6). The
    teal car in the shade of 2.2 was value 0.32 and near black at dusk (hue 139, green); now 0.43 in shade, 0.39 at
    dusk, hue 167 to 185 in sun, shade and dusk. Hair (`character.mjs` `addHair`, which the people track made `keepHue`)
    changes with it.
  - `stage.mjs` `setSun`: `shadowUniforms.maxRadius` = min(32, 0.12 m / texel): the soft edge is at most 12 cm in the
    world (12.2 texels in the home's garden, 32 in a room, as before). The garden's 32 texels (31 cm) stippled a
    shirt in the sun. Vector motion blur: the per-pixel jitter of the samples along a streak is half a step (was a
    whole step: a stipple on a slow chin).
  - `room.mjs` `dustMotes`: a speck is at most 0.0015 x its distance from the camera in size and fades out from 2.5 m
    to 1.5 m from it (one near the lens was a 100 px pale disc).
  - `home/home.mjs`:
    - `cottage()` returns `{ parts, leaves }` and takes `shutter` (a colour) and `climber` (-1 or 1, the side a rose
      climbs): each gable end has two windows (frame, lit glass, bars, sill, shutters), each front corner a drainpipe,
      and a climbing rose (three canes of leaves, roses). The cottage at x 16.5 (seen side on in 2.4 and 3.1) is apricot
      0xd9b48c with teal shutters 0x4f8a8c (it was a grey-green box).
    - `neighbourhood()`: the eight round domes on the horizon are two rings of long low rises (near: radius 60 m, 14
      rises 16 to 26 m long and 3.2 to 5.5 m high, with clumps of trees along their crests; far: radius 74 m, 12 rises,
      5 to 8.5 m high). `M.hill` mottle 0.12 at scale 0.09.
    - Haze: the hills (up to 62 %) and the far trees (up to 30 %) fade from 25 m toward a haze colour, uniforms
      `U.haze`, `U.hazeK` set in `light()` from the hour's new field `HOME_LIGHTS[time].haze: { color, amount }`
      (next to `sky` and `porch`; golden 0xeedcbc at 1, twilight 0x3e4462 at 0.8). A new hour must have it.
    - `groundPaint()`: big patches of dry and lush lawn, darker grass along the bed, the house front, the drive and the
      path, and two darker tyre tracks in the gravel drive.
    - `HOME_LIGHTS.golden.outside`: `sky` 0xb4bce8 at 0.7 (was 0xa9c2f2 at 0.5), `air` density 0.008. `HOME_LIGHTS.
      twilight.outside`: `sky` 0x5a6a90 at 0.8, `grade` `contrast` 0.9 (was 1.4), `lift` 0x12111a (was 0x14110e), `air`
      density 0. 3.3 median luma 32 → 49.
    - `YARD_AIR` (new, not exported): the box of air outdoors, x -16..20, y 0..7, z -21 to the house front; `light()`
      passes it to `setSun({ air })` outdoors.
    - The group names its door for the door check: `userData.doors = [{ name: 'the front door', leaf, root }]`.
  - `home/parts.mjs`: `D.lap` 0.03 (replaces `D.inset`): the arched leaf is 3 cm wider each side and 3 cm taller than
    the opening and hangs just behind the wall, against its inner face (it stood inside the wall's thickness and its
    corner came through the arch as it swung). `windowSeat`: the teal pillow is at `cush.top.at(-0.36, -0.3)` (was
    u -0.82: behind Milo's head in 1.1 and 1.5).
  - `car/car.mjs` `buildCar`: `group.userData.doors = [{ name: 'the car door', leaf, root: group }]`.
  - `checks.mjs`: `doorSweep(src, { hz = 240, from, to })`, `DOOR_GATE` 0.01, `DOOR_NEAR` 0.03 (see Bodies above).
  - `lint.mjs`: error `door-sweep` (a door goes more than 1 cm into an actor while it moves; names the door, the
    actor, the part, the shot and the time into it) and warning `door-brush` (within 3 cm).
  - `tools/check-motion.mjs`: prints each door and actor pair's deepest or nearest moment with its shot, gated at
    `DOOR_GATE`.
  - Tests: `test/scene3d-film.test.mjs` "lint finds a door that swings through a body, with the shot and time";
    `test/scene3d-pieces.test.mjs` the front door's leaf is never inside the wall and laps the doorway when shut;
    `test/scene3d-picture.test.mjs` "a soft shadow's widest edge is 12 cm over a garden and 32 pixels in a room" (no
    GPU) and "a dust speck near the lens stays a speck" (GPU).
- Restaging "Dad's Home", round 3 (FILM, 2026-11-13), all in `compile.mjs`:
  - An `open` or `close` of a door may name `"who"`, a two-legged actor of the scene (was refused: "an open names no
    actor"). `unbuilt` refuses anything else by name ("whose hand opens or closes the door: a two-legged actor of the
    cast"). `createTiming`'s `door()` records `{ to, t, open }` on the actor's part as `holds`; biped `finish()` lays a
    hand layer for each over whatever the actor does: from 0.5 s before the swing (ramp 0.4 s) the nearer arm that does
    not carry something (`desc.hang`) goes to the handle through `pose.after` / `pose.hand` and follows it; a door whose
    handle first moves toward the actor is pulled and the hand lets go 0.2 s into the swing, one moving away is pushed
    and the hand goes with it for 1.1 s; past 1.15 arm lengths the hand fades off.
  - `doorHandle(entry, set, poseAt, height)` (new, not exported): the handle point on a door leaf named by a group's
    `userData.doors`: 9 cm in from the free edge (found by posing shut and open), at `height` (front door 0.98 m, car
    1.62 m world height, at most 12 cm under the top), 6 cm off the face on the actor's side. It builds the leaf's world
    matrix from `o.matrix` up the parents, since a hinge pivot's `matrixWorld` is stale between frames.
    `stageScene(rec, plan, K0, cast, place)` takes the place and gives `world.doorHandle(to)` ("door" or a car's id).
  - `footfalls()`: in a kit with `areas`, a step that lands in another area than the shot's camera (`camera.area`, else
    the set's) is not heard, unless within 1.5 m of the `door` anchor while `doorAt(t)` ≥ 0.5 (Dad's steps in the hall
    were heard in the garden after the door shut).
  - A ball in someone's hands while no legs are laid (`head()` during staging, read by a look at it) is 0.3 m under the
    holder's head (it was `ballAt(null)`, which threw in `sheet`).
  - Tests: `test/scene3d-story.test.mjs` "what cannot be played…" now checks a cat named as `who` on an open is refused; in its DOOR scene Milo starts at x:2410,y:900 (was y:860) and
    the cat at x:2350,y:900 (was x:2370), clear of the front door's sweep (the new `door-sweep` lint found the leaf 15 cm
    into Milo's pelvis 0.16 s into 1.2).
  - Docs: `docs/scene3d.md` the front door's `"who"` row, and footsteps heard by area.
- "Dad's Home", round 3, last repair (FILM, 2026-11-14):
  - `materials.mjs`: `paint({ sun })`, how much of the direct light a paint takes (default 1; `PaintLightingModel.direct`
    scales `lightColor` by it; the fills are untouched). Paints that leave it out build the same shaders as before.
  - `cast/cat.mjs`: the coat (`cream`) is a mid ginger [1.0, 0.62, 0.36] (was [1.06, 0.88, 0.7]); the skull is a
    deeper `face` ginger [1.0, 0.55, 0.28]; the skin takes `sun: 0.45`; the eyelids are 0xd6a272 (were 0xd9c3a2, the old
    coat). `fur()`: the body's bands are left off the head (rest z > 0.17, y > 0.26); the head has its own markings,
    lines back over the crown from the brow (an M from the front) and two thin lines across each cheek; white fur has
    none. Measured in "Dad's Home": the cat was rgb(244,202,159), saturation 0.35, in the sun of the 3.1b insert and
    (177,117,68) indoors; now its forehead is (237,167,101), saturation 0.57, in that sun, its body (174,105,55), and
    indoors (167,107,66). It changes every film with the cat (films/_test3d).
  - `character.mjs` `addHair`: hair and beards take `sun: 0.6` (Milo's hair in the garden's sun 0.53 → 0.47 value; in
    the room 0.23, unchanged).
  - `home/home.mjs`: `HOME_LIGHTS.twilight.outside` shade fill 0x7a6860 (was slate 0x5a5c6c) and grade saturation 1.0
    (was 0.85): the house's walls at dusk keep their peach (3.2's wall rgb(103,98,102), saturation 0.05 → rgb(138,110,96),
    0.30). New `frontDressing(g, M)`, called from `house()`: on the blank front between the big window's shutters and
    the wing (x -0.44 to 2.72), a small window (frame, panes lit at dusk through `M.cottage`'s glow, bars, sill,
    shutters) at x 1.05, and a climbing rose (three canes from x 2.45, leaves and roses in `M.vcSoft`). Panels on the
    wall's outer face: the room inside is unchanged.
