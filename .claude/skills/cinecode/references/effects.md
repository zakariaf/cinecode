# Effect reference (built-in effects)

Generated from `engine/effects/` by `node <skill>/scripts/inventory.mjs effects` (add `films/<slug>` to also name that film's own); the notes at the end are by hand. Rerun it when the engine changes. These are custom beats and overlays like a film's own (`CINECODE/docs/effects.md`). The `fx` beats and scene fields (dust, splash, sparkle, leaves, rain, fireflies, motes, mist) are in `storyboard-quick.md`.

Built in (`engine/effects/`): name one in film.json and the film gets it, as a custom beat (`{ "do": "custom", "name": … }`) or a scene overlay (`"overlays": [{ "name": …, "params": { … } }]`). Every field of the beat (or the overlay's `params`) arrives as its params. A film's or project's own effect of the same name replaces the built-in one (`check` says so).

| effect | as | layer |
|---|---|---|
| debris | custom beat | depth |
| eyepiece | custom beat | screen |
| lightpulse | custom beat | grade |
| moonlets | custom beat | depth |
| orbit | custom beat | back |
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

### lightpulse

Light travelling from the Sun to a planet: a bright pulse with a fading trail crosses the frame over the first 85% of the beat, eased, and flashes on the planet's lit limb as it arrives. A custom beat; time its `dur` to the line it illustrates ("with": "prev").

Beat params: from (where the light leaves: an actor, at its depth, or [fx, fy], fractions of the frame), to (a planet actor, required), col (rgb, default a warm white).

Layer `grade`: emitted light, after the grade.

### moonlets

A planet's many moons: small moons appear around it, slowly at first, then faster and faster (each with a pop of light), and go round on orbits in its ring plane, the inner ones faster. One bigger moon can be a world of its own (big: a body, e.g. 'titan'), appearing early. A custom beat; time it to the line ("with": "prev").

Beat params: who (a planet actor, required), n (moons, default 90), big (a body name for the big moon, default none), bigAt (when it appears, 0..1 of the beat, default 0.1), bigX, bigY (where, globe radii from the centre along and across the equator, default 3.4, 0.75), bigR (its radius, globe radii, default 0.09).

Layer `depth`: each moon is a piece at the planet's depth, set behind or in front of it by its side of the orbit, so the far ones pass behind the globe and the rings and the near ones in front; drawn flat, like the planet's rings (the orbits keep the rings' ellipse at any depth). The big moon is in front.

### orbit

A planet's orbit: a dotted arc through the planet, around a sun off to one side, drawing itself in over the first 60% of the beat (the dots under the globe are left out). A custom beat; pair it with a sunglow on that side.

Beat params: who (a planet actor, required), side (-1: the sun is to the left, default; 1: to the right), rx (the orbit's half-width, world px, default 14 globe radii), squash (its height / width, default 0.32: seen from a little above), span (radians of the arc either side of the planet, default 0.9).

Layer `back`: behind the actors, at the planet's depth (it scales with it).

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
- **Effects at depth.** `debris`, `moonlets` and `sizerow` hand their pieces to the depth sort (layer `depth`), so a planet hides what is behind it and a dolly (`zTo`) flies through the debris. The others follow a planet off the stage (its `z`) with `api.project`. Your own code can do the same: `CINECODE/docs/effects.md`, "Depth".
- **Drawing a world in your own code**: `import { drawBody, globeOf, atDepth, radiusOf } from 'cinecode/paint/planets'` (the planet rig's painter: `drawBody(ctx, 'mars', cx, cy, R, { t })`; `globeOf(api, who)` a planet actor's globe on screen at its depth; `radiusOf(body)` true radii in km for true relative sizes).
