# Effect reference (built-in effects)

Generated from `engine/effects/` by `node <skill>/scripts/inventory.mjs effects` (add `films/<slug>` to also name that film's own); the notes at the end are by hand. Rerun it when the engine changes. These are custom beats and overlays like a film's own (`CINECODE/docs/effects.md`). The `fx` beats and scene fields (dust, splash, sparkle, leaves, rain, fireflies, motes, mist) are in `storyboard-quick.md`.

Built in (`engine/effects/`): name one in film.json and the film gets it, as a custom beat (`{ "do": "custom", "name": … }`) or a scene overlay (`"overlays": [{ "name": …, "params": { … } }]`). Every field of the beat (or the overlay's `params`) arrives as its params. A film's or project's own effect of the same name replaces the built-in one (`check` says so).

| effect | as | layer |
|---|---|---|
| debris | custom beat | depth |
| eyepiece | custom beat | screen |
| lightbeam | custom beat | grade |
| lightpulse | custom beat | grade |
| moonlets | custom beat | depth |
| orbit | custom beat | back |
| ringfield | custom beat | depth |
| sizerow | custom beat | depth |
| skydot | overlay | grade |
| starstream | custom beat | sky |
| sunglow | custom beat, overlay | grade |

### debris

Chunks of ice and rock drifting past the camera at many depths: ring particles, or an asteroid belt with more rock. Most are small and far, a few big and near; each is a lumpy inked shape, shaded away from the upper-left light, the icy ones frosted. It builds up over the first 12% of the beat and thins out over the last 10%. A custom beat.

Beat params: n (chunks, default 70), ice (0..1, the share of icy chunks, default 0.85; an asteroid belt: 0.2), dir (-1: they drift right to left, default; 1: left to right), speed (default 1).

Layer `depth`: every chunk is a piece at its own depth, from just in front of the lens's near fade (the big ones) to beyond the stage (the small ones), spread over what the shot's camera sees at that depth from its first frame to its last; so a planet hides the chunks behind it, a pan shows them in parallax and a dolly (`zTo`) flies through them.

### eyepiece

The view through a telescope's eyepiece: everything outside a round field is black, with a soft inner edge and a faint cool rim; or the field widening until it fills the frame: the round view opens into the scene.

A custom beat: pin it `"at": 0` with a `dur` at least the shot's and `"scope": "shot"` (it ends at the cut), so the whole shot is seen through the eyepiece; a later beat with `"open": true` widens the field over its `dur` until it fills the frame. (An overlay would cover the whole scene.)

Beat params: r (the field's radius, a fraction of the frame height, default 0.36), open (true: widen it), dx, dy (the field's centre offset, fractions of the frame).

Layer `screen`: over the picture (and the grade), under the captions, so a caption reads on the black.

### lightbeam

Sunlight on its way from the Sun to a planet, drawn as light, not as a travelling ball (lightpulse) or a tube: one soft shaft of warm light reaches out from the Sun toward the planet over the first 85% of the beat (eased), brightest along its middle and fading smoothly to its edges, lit all the way back to the Sun, its front fading out over a third of the way (no head, no cap), and as wide as the planet's globe where it arrives. The light stops at the globe's limb (it falls on the planet, it is not drawn over it), and the planet's sunward side brightens, gently (screened, never bleached), and stays brighter. It fades out over the beat's last 6%. A custom beat; time its dur to the line it illustrates. (The Saturn chapter's own effects/sunbeam.mjs is this effect before its fixes.)

Beat params: from (where the light leaves: [fx, fy], fractions of the frame, default [-0.06, 0.3], or an actor, at its depth: the Sun's centre), to (a planet actor, required), col (rgb, default a warm white), w0 (the shaft's half-width at the Sun, a fraction of the frame height, default 0.035).

Layer `grade`: emitted light, after the grade. Pair it with a sunglow at the same point.

### lightpulse

Light travelling from the Sun to a planet: a bright pulse with a fading trail crosses the frame over the first 85% of the beat, eased, and flashes on the planet's lit limb as it arrives. A custom beat; time its `dur` to the line it illustrates ("with": "prev").

Beat params: from (where the light leaves: an actor, at its depth, or [fx, fy], fractions of the frame), to (a planet actor, required), col (rgb, default a warm white).

Layer `grade`: emitted light, after the grade.

### moonlets

A planet's many moons: small moons appear around it, slowly at first, then faster and faster (each popping up to its size), and go round on orbits close to its ring plane, the inner ones faster. Each is a small lit world, not a star: a grey or tan ball shaded like the planet (its sunward side lit, a dark crescent away from the light), no glow, of varied sizes (3.4–7.5 px at 1080p, most near the smallest). One bigger moon can be a world of its own (big: a body, e.g. 'titan', Saturn's orange moon), appearing early, drawn at least twice the biggest small moon so it reads as the biggest. A custom beat; time it to the line ("with": "prev").

Beat params: who (a planet actor, required), n (moons, default 90), big (a body name for the big moon, default none), bigAt (when it appears, 0..1 of the beat, default 0.1), bigX, bigY (where, globe radii from the centre along and across the equator, default 3.4, 0.75), bigR (its radius, globe radii, default 0.09; true Titan / Saturn: 0.044, drawn larger when that is under two small moons).

Layer `depth`: each moon is a piece at the planet's depth, set behind or in front of it by its side of the orbit, so the far ones pass behind the globe and the rings and the near ones in front; drawn flat, like the planet's rings (the orbits keep the rings' ellipse at any depth). The big moon is in front.

### orbit

A planet's orbit: a dotted arc through the planet, around a sun off to one side, drawing itself in over the first 60% of the beat (the dots under the globe are left out). A custom beat; pair it with a sunglow on that side.

Beat params: who (a planet actor, required), side (-1: the sun is to the left, default; 1: to the right), rx (the orbit's half-width, world px, default 14 globe radii), squash (its height / width, default 0.32: seen from a little above), span (radians of the arc either side of the planet, default 0.9).

Layer `back`: behind the actors, at the planet's depth (it scales with it).

### ringfield

Saturn's rings up close, as what they are made of: countless pieces of ice and rock lying IN the rings (not scattered over empty space like debris), from a haze of glinting dust to pebbles, a few boulders, and some chunks near the camera that rush past as the camera flies in (a dolly, `zTo`). Ring pieces keep to the ring material: inside a ring's edges (a piece is laid at least its own size in from them), never in the Cassini Division or the Encke Gap; they keep to the rings' ellipse (the planet's tilt and roll), go round slowly (the inner ones faster), sit in front of the planet on the near half and behind the globe on the far half, and are dark in the globe's shadow on the rings (ringShade in engine/paint/planets.mjs). The near chunks are pieces at their own depth (the depth sort), set at the start of the shot over the near half of the rings, so they open out past the lens during a dolly. A custom beat; give it the shot's length and "scope": "shot".

Beat params: who (the ringed planet, required), n (ring pieces, default 420), dust (specks and glints of dust, default 1400), near (chunks near the camera, default 16), motes (grains of dust near the lens that stream past, soft and out of focus, default 200), ice (share of icy pieces, default 0.8), orbit (how fast they go round, rad/s at the B ring, default 0.035), dir (1 or -1).

Layer `depth`.

### sizerow

Size by comparison: small worlds popping in one by one side by side across a planet's equator, to true scale (by default Earths, as many as fit across: 9 across Saturn, 11 across Jupiter). A custom beat; time it to the line ("with": "prev").

Beat params: who (a planet actor, required), body (the small world, default 'earth'), ratio (its radius / the planet's, default from their true radii: radiusOf in engine/paint/planets.mjs, Earth / Saturn = 0.1058), n (how many, default as many as fit across: ⌊1 / ratio⌋), gap (seconds between pops, default 0.32; the first at 0.3 s), dy (the row's offset from the equator, globe radii, + = down, default 0).

Sounds: a 'pop' for each of the first 9 at the default gap (a beat's sounds are fixed: for more, or another gap, add sfx beats).

Layer `depth`: one piece just in front of the planet, so the row is drawn over it and under whatever is nearer.

### skydot

A planet seen with the naked eye: a steady point of light in the night sky (planets shine without twinkling much), with a soft glow. Placed at a world point (x, y) or an anchor, so it sits where the telescope points in every shot of the scene; its size stays the same on screen whatever the zoom (it is a point source).

Overlay params: x, y (world px, on the stage) or at (an anchor, at its depth), size (core radius in px at 1080p, default 3), col (core colour, default warm white), glow (the halo's rgb, default a pale gold, Saturn's), a (strength 0..1, default 1).

Layer `grade`: emitted light, drawn after the night grade so it stays bright. Keep it clear of heads.

### starstream

Travelling through space: stars stream out from a vanishing point and past the camera, as streaks that lengthen as they near the edges. A custom beat: it builds up over the first fifth of its `dur`, holds, and dies away over the last third.

Beat params: fx, fy (the vanishing point, fractions of the frame, default the centre), n (streaks, default 240), speed (default 1), col (rgb, default a cool white).

Layer `sky`: over the backdrop, under everything in the scene (a planet ahead stays in front of the streaks).

### sunglow

The Sun's glow: a white-hot core in warm halos, laid on with light. At a planet actor (who: the Sun as a `planet` rig, body 'sun') it follows the actor at its depth; or at a point of the frame (x, y, fractions; it may be off the frame, so only the halo shows at an edge).

An overlay (the whole scene, or the scene overlay's "shots") or a custom beat (pin it "at": 0 with a dur at least the shot's and "scope": "shot", for one shot).

Params: who (an actor) | x, y (fractions of the frame, default -0.1, 0.35) and r (the core's radius, a fraction of the frame height, default 0.22); a (strength 0..1, default 1).

Layer `grade`: emitted light, after the grade, so a dark grade never dims it.


## Notes that the tables don't show

- **A custom beat takes its `dur`** in the beat timeline like any beat: laid `"with": "prev"` over a line, it holds the next line back until it ends. Time its `dur` to the line, or give it `"hold": false`: it still plays (and draws) its whole `dur`, but the next beat, its group and the shot's length don't wait for it.
- **It lasts its whole `dur`**, on into the next shots of its scene and, from a scene's last shot, into the fading picture of a dissolve; `warnings.mjs` says so (with the frames it spills). `"scope": "shot"` ends it at its shot's cut (its sounds from the cut on are dropped too); `"scope": "scene"` keeps it on and silences the warning. The eyepiece, and a sunglow for one shot, are pinned `"at": 0` with a `dur` at least the shot's and `"scope": "shot"`.
- **An overlay in some shots only**: `{ "name": "skydot", "params": { … }, "shots": ["1.1", "3.2"] }` on the scene. It must be a non-empty list of that scene's shot ids.
- **Effects at depth.** `debris`, `moonlets`, `ringfield` and `sizerow` hand their pieces to the depth sort (layer `depth`), so a planet hides what is behind it and a dolly (`zTo`) flies through the debris (or a ringfield's near chunks). The others follow a planet off the stage (its `z`) with `api.project`. Your own code can do the same: `CINECODE/docs/effects.md`, "Depth".
- **Light from the Sun to a planet**: `lightbeam` (a soft shaft that reaches the planet and stays, the planet's sunward side brightening) or `lightpulse` (a bright pulse with a trail, a flash on arrival). Pair either with a `sunglow` at the same `from` point.
- **Drawing a world in your own code**: `import { drawBody, globeOf, atDepth, radiusOf } from 'cinecode/paint/planets'` (the planet rig's painter: `drawBody(ctx, 'mars', cx, cy, R, { t })`; `globeOf(api, who)` a planet actor's globe on screen at its depth; `radiusOf(body)` true radii in km for true relative sizes). Something drawn on a planet's rings can darken where the globe's shadow lies on them: `sunDir(light, tilt)` (the sign of tilt is ignored, as the painter draws the rings from the north) and `ringShade(S, ob, u, v)` (0 lit .. 1 in shadow, at a point of the ring plane in globe radii), as `ringfield` does.
