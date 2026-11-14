# The shape language: hard objects by name

Furniture, vehicles, buildings and props for the 3D engine (`engine/scene3d/shape.mjs`), written as a small program. Solids are soft distance
fields; `part()` melts solids into one painted mesh; `at()` sets a shape on a named face of another; `build()` gives
the engine's three.js group. Metres and degrees; y up, front is +z, right is +x. Every solid's origin is the centre
of its base (y = 0) unless said otherwise.

A prop file exports one function that returns the root part (`engine/scene3d/props/` has three: `chair`,
`armchair`, `mailbox`; the car's shape is `car/shape.mjs`, the house's hard pieces `home/parts.mjs`):

```js
import { box, cyl, part, at, grid } from '../shape.mjs';
const D = { topW: 0.8, topD: 0.5, topT: 0.04, height: 0.72, legR: 0.025 };   // every size named once
export default function table() {
  const top = box(D.topW, D.topT, D.topD);
  const legs = grid(top.bottom, 2, 2, 0.8).map((f) => at(cyl(D.legR, D.height - D.topT, { taper: -0.2 }), f));
  return part('table', { color: 0xa8743f, finish: 'wood' }, top, legs);
}
```

## Solids

Every solid also takes `blend` (width of the soft fillet where it joins the solids before it in its part, default
0.015) and `hollow` (keep only a wall this thick, inside its surface, closed all round: cut it to open it; the
wall counts as its thinnest side). Rounding is generous by default. `taper` takes any value (-1.4: the top 2.4 times as wide).

- `box(w, h, d, { round, bulge, taper })`: w along x, h along y, d along z. `round` edge radius; `bulge` the faces
  (not the base) swell out by this much; `taper` the top this share narrower (negative: wider).
- `cyl(r, h, { round, taper })`: upright cylinder; `taper` the top radius this share smaller (negative: larger).
- `ball(r)` or `ball(rx, ry, rz)`: a ball or egg resting on its origin.
- `dome(r, h = r, { round })`: half an egg on its flat base.
- `torus(R, r, { arc })`: a ring of radius R whose tube has radius r, standing in the x-y plane, origin at its centre; `arc`
  degrees kept, centred on its top (180: a handle's arch).
- `loft(sections, { round })`: a body along z through sections `{ z, w, h, y = 0, n = 2.5 }` (z increasing): each a
  rounded box-ellipse w wide, h tall, its bottom at y; `n` 2 is an ellipse, 4 a soft box. Car shells, cushions,
  boats, bread.
- `revolve(profile, { thick, round })`: turned round the y axis from `[[r, y], ...]` that starts and ends on the axis
  (r = 0). With `thick` the profile is an open line (it need not touch the axis) given that thickness, centred on
  the line (a shade, a bowl, a can's wall).
- `extrude(outline, depth, { thick, round })`: outline `[[x, y], ...]` in x-y pushed `depth` along z (centred on
  z = 0). With `thick` an open line of that thickness (a handle, a bent rail).
- In outlines and profiles a third number rounds that corner: `[x, y, 0.05]`.
- `cut(solid)`: carve it out of what comes before it in the part. `keep(solid)`: keep only what is inside it.
  `cut(at(s, f))` and `at(cut(s), f)` are the same. A cutter set on a face only touches it: sink it, e.g.
  `cut(at(cyl(0.03, 0.1), lid.top.at(0, 0.4).move(0, -0.05, 0)))`, or put its middle on `center.at(...)`.
- `turn(shape, [x, y, z])`: turn a shape in place about its own origin (a first solid that should lie another way).

## Faces and frames

Every solid and part has frames `top bottom left right front back center`, in its own axes (they turn with it).
- `face.at(u, v)`: a spot across the face, u and v from -1 to 1 of the shape's box along the other two axes in x, y, z order
  (top/bottom: x, z; front/back: x, y; left/right: y, z). The point is where a ray from outside meets the surface
  there. `center.at(u, v, w)` is a spot inside the box.
- `frame.move(dx, dy, dz)` → a new frame shifted in metres along the axes of the shape it is on.
- A frame on a solid sees only that solid; a frame on a part sees that part's own solids, not the parts hanging
  from it (a ray may go through an opening to the back wall, or meet a curved roof instead of the side).

## Placing, repeating, naming, moving

- `at(x, frame, { turn, flush })` → x: turn x (degrees, about its own origin), then move it so the point of x that
  sticks out furthest toward the frame (into the face: set on `top`, x sits on it) lands on the frame point: the
  middle of that side if it is flat or nearly so (a leg's top, a cushion's bottom), the tip if not (the root of a
  slanting spout; two tips: their middle). `turn` is about the axes of the shape x is set on. Separate parts only
  touch: on a curve, sink a few millimetres with `move()` so no gap shows. On a `center` frame the
  middle of x's box goes there. x keeps the axes of what it is set on and moves with it from then on (it hangs
  from it: the root does not list it). `flush: true` instead lines x up by the same u, v on its own touching face,
  scaled by its own size (`base.left.at(-1, 0)` + flush: x's foot level with the base's foot).
- `grid(face, nu, nv = 1, su = 0.8, sv = su)` → frames in a grid spread over ±su, ±sv (shares of the face, like
  u, v). A frame has `.u`, `.v`.
- `ring(face, n, r, start = 0)` → n frames on a circle of radius r (metres) round the middle of a face; each turns
  what is set on it so its +x points outward.
- `mirror(x, axis = 'x')` → a mirror copy across the object's x = 0 plane. A solid copy must still be listed in a
  part; a part copy brings everything set on it.
- `part(name, look, ...solids)` → one mesh. `look`: `0xrrggbb` or `{ color, finish }`, finish `paint` (default),
  `wood`, `cloth`, `metal`, `rubber`, `glass`. Arrays are flattened. The first solid must be added, not cut.
- A part's origin is the origin its solids were built round (its first solid's base) until it is placed.
- `mark(shape, name, frame)` → the same shape, marked; then `shape.<name>` is that point (a frame you can `move()`,
  not `at()`), and `build()` lists it as `part.name`. Mark as many as you like.
- `hinge(part, frame, axis, [lo, hi])`: the part turns about the line through the frame along `'x' 'y' 'z'`, lo to hi
  degrees (lo at pose 0). `spin(part, frame, axis)`: turns freely (a wheel on its axle). Parts set on it turn with it.
- Angles (hinge, spin, `turn`) go by the right hand: about y a positive angle turns +z toward +x, about x +y toward
  +z, about z +x toward +y. With several angles in one `turn`, z is applied first, then y, then x (fixed axes);
  one angle at a time is clearer.

## Building

```js
const obj = build(table());   // the root and every part hanging from it: { group, pose, joints, marks, parts, triangles, digest, ms }
stage.scene.add(obj.group);   // stands on y = 0; move and turn obj.group as a whole
obj.pose({ flap: 0.5, wheel_fl: 3.1 });   // hinge 0..1 from lo to hi; spin in radians; a pure function of the values
obj.marks['box.mouth'].p;     // [x, y, z] in the object at rest
```

A part is meshed as fine as its thinnest solid (2.5 mm to 2 cm cells), then flat and gently curved stretches are
thinned out: a point goes while the surface moves less than a twentieth of a cell (the car: 442 000 triangles
meshed, 60 000 kept). Meshes are cached on disk by their exact description (a few ms when cached; one to twenty
seconds the first time); `SHAPE_NOCACHE=1` meshes afresh.

Tool: `node engine/scene3d/tools/sheet.mjs engine/scene3d/props/mailbox.mjs out.jpg [--pose flap=0.5,flag=1]` (12
views: 8 round it, 2 from above, 2 from low down; prints the triangles and the digest). `test/scene3d-pieces.test.mjs`
holds every piece to one digest in fresh processes, with and without the cache.

## Rules

**1. Name each size once and derive the rest.**
RIGHT `const D = { seatH: 0.46, seatT: 0.045 }; cyl(D.legR, D.seatH - D.seatT)`
WRONG `cyl(0.021, 0.415)` (where does 0.415 come from?)

**2. One function per part, built round its own origin and placed once, by the caller.**
RIGHT `function flap() { ... return part('flap', BLUE, f); }  at(flap(), box.mouth);`
WRONG building the flap where it will end up with `move()` offsets added up by hand.

**3. Place by frames, never by coordinates.** `move()` is for a small nudge, not for position.
RIGHT `at(knob, door.front.at(0.7, 0))`
WRONG `at(knob, door.center.move(0.31, 0.02, 0.04))`

**4. Know what a frame's ray meets.** On an open box, a curved top or a gap, use a solid's frame or mark one.
RIGHT `mark(part('box', BLUE, shell, opening), 'mouth', shell.front)` then `at(flap(), b.mouth)`
WRONG `at(flap(), b.front)` (the ray goes through the opening: the flap lands on the back wall)

**5. Line things up with flush, not with sums.**
RIGHT `at(arm, base.left.at(-1, 0), { flush: true })` (the arm's foot level with the base's)
WRONG `at(arm, base.left.move(0, (armH - baseH) / 2, 0))`

**6. Pairs by mirror, repeats by grid and ring.**
RIGHT `part('frame', CLOTH, base, arm, mirror(arm))`; `grid(top.bottom, 2, 2, 0.8)`
WRONG writing the right arm again with its x negated.

**7. Small things in their own parts.** A part is meshed as fine as its thinnest solid (or wall); a 1 cm rod in a
2 m part makes all of it fine, slow to mesh and heavy at its edges. Big thin shells cost most: a lamp shade 40 cm
across is meshed in 360 000 triangles with a 5 mm wall, 170 000 with 12 mm, before thinning (the kit warns of a part
over 100 000 after it).
RIGHT `part('handle', METAL, at(torus(0.05, 0.008, { arc: 180 }), lid.top))`
WRONG the same handle listed in the lid's part.

**8. Keep it soft.** Use the default rounding, `bulge` and `taper`; a hard edge needs a reason.
RIGHT `box(0.5, 0.14, 0.5, { round: 0.06, bulge: 0.025 })` (a plump cushion)
WRONG `box(0.5, 0.14, 0.5, { round: 0 })`

**9. Joints sit on the edge they turn about, with names motion can use.**
RIGHT `hinge(door, d.left.at(0, 0), 'y', [0, -95])` in `door()` (its free edge swings out toward +z); wheels named
`wheel_fl`, `wheel_fr`
WRONG `hinge(door, d.center, 'y', ...)` (it spins round its middle); four parts all called `wheel`

**10. Look at all eight views** (and each joint posed) before calling a prop done; a frame that missed its surface
shows as a part floating or sunk.
