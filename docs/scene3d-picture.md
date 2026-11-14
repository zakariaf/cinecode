# The 3D picture: light and look

How a frame of the 3D engine (`engine/scene3d`) gets its light and its finish. Signatures are in
`engine/scene3d/API.md`; this page says what the numbers mean.

## The light of a shot

A shot's light is one row of numbers, `LIGHTS` in `engine/scene3d/light.mjs`. A scene or the compile step picks a
row by name (`stage.setLight('golden')`) or passes an object of the same shape
(`stage.setLight({ ...LIGHTS.golden, bounce: 1.2 })`). The stage writes everything from it before every frame.

| entry | what it is |
|---|---|
| `sun: { az, el, color, power }` | where the light comes from: `az` degrees round from +z toward +x (the way it travels), `el` degrees above the horizon; its colour and strength |
| `sky: { color, power }` | fill on what faces up; three times as bright seen through an opening (window) |
| `shade: { color, power }` | fill on what stands upright: the colour of the shade (cool lilac by day) |
| `ground: { color, power }` | fill on what faces down |
| `bounce` | how much of the sun that lands on the set's bounce patches is thrown back into the room (about 0.3 to 2) |
| `outdoor: { color, power }` | how bright the world outside the window is |
| `air: { color, density }` | the light in the air where the sun passes (the shaft through a window) |
| `lamp: { color, power }` | the set's lamp; left out = off |
| `grade` | `exposure`, `contrast` (an S-curve, 0 = none, at most 1; full strength in the darks, 0.4 of it in the lights), `saturation` (1 = as lit), `shadows` and `lights` (split tone: what the darks and the lights are multiplied by), `lift` (the darkest colour the picture has), `bloom` (narrow glow of the hot spots), `glow` (wide glow: the window floods the air round it) |

The hours in the table: `morning`, `noon`, `golden` (Scene Zero and `films/_test3d`), `twilight` (`films/_test3d`'s
second scene: the last of the sun, a blue-lilac sky through the window, the lamp on as a warm pool; darker than the
look gate's RMS 58 by choice, about 46), `night` (the moon plus the lamp; rough). Add an hour by adding a row.

`golden` is the look the owner chose (the reference frames in `plan/ref`): a low sun (12 degrees) from the front
left (`az` 125) through the room's tall side windows lays broad diagonal bands of sun across the floor, up the back
wall and on the right wall, with the soft shadows of the glazing bars inside them and the light in the air along
them; the shade is cool lilac and deep, dark things (hair, wood in shade) go nearly dark, lit cream goes nearly
white. The fills are low on purpose (`sky` 0.18, `shade` 0.42, `ground` 0.12, `bounce` 0.35): the ground fill
lit every upright surface from below and was most of the old pink-cream veil. The other hours keep their earlier
numbers (`morning` and `noon` with half the ground fill); they come in through the back window (and the side
windows where the sun is on that side) and look right for their hour, but were not tuned to the reference.

The place `home` (`home/home.mjs` `HOME_LIGHTS`) lights its two sides with rows of its own. Its golden hour indoors
has cream fills, not lilac (`sky` and `shade` 0xf0dcc8 at 0.24 and 0.5, `bounce` 1.0, neutral-warm shadows): the
room measured lilac-grey against the reference ("Dad's Home", 35 to 46 % of the frame violet, red minus blue about
2 to 17; after, under 1 % and 56 to 69). Outdoors at golden hour the shade and ground fills are warm and about
twice as strong, so a backlit face or the teal car does not go near-black; at dusk outdoors the fills are slate
(blue leaning grey, not violet) with a dark green ground, a warm lift and the sun too weak to throw a hard shadow,
and the room's lamp, amber, is cheated to just inside the big window above anyone standing at it, so the lit window
reads warm and the faces in it are not lit blue by the dusk.

Outdoors at golden hour the sky fill is lavender (0xb4bce8 at 0.7) so the shade on the lawn and walls is cool
against the warm sun, and the yard has a thin warm light in the air (density 0.008, in `YARD_AIR`: the yard from the
street to the house front, 7 m high). At dusk outdoors the sky fill is 0x5a6a90 at 0.8, the S-curve 0.9 (it was 1.4:
it crushed the dusk to a median luma of 32) and the lift 0x12111a; there is no light in the air at dusk (its glow is
not scaled by the sun's power, so the yard turned into a pink fog). Shot 3.3 of "Dad's Home" went from p1 16, median
32, p90 91 to p1 24, median 49, p90 113, with no near black; the lit window is still the brightest thing in it.
The far hills and the trees on them fade toward a haze colour with distance (`home.mjs` `U.haze`, `U.hazeK`, set
from the row's `haze: { color, amount }`: golden 0xeedcbc at 1, dusk 0x3e4462 at 0.8; the hills up to 62 %, the
trees up to 30 %, from 25 m to 80 m and 70 m from the camera).

Measured on Scene Zero frames 30, 100, 153, 222 and the film at 12.4 s (luma at 960 px wide): 1st percentile 21
to 26, RMS contrast 59 to 62 (58.8 for the film), saturation 28 to 32 %, near black under 0.1 %, clipped under
2.5 %. The reference frames: `d_run_full` p1 55, RMS 63.6; `d_fridge_full` p1 35, RMS 56.8; `d_face_mirror` p1 19,
RMS 78.2.

## Where the light comes from

- **The sun**, with its shadow picture (soft, wider far from the caster). The widest soft edge is 12 cm in the world
  (`setSun` sets `shadowUniforms.maxRadius` to 0.12 m over the texel, at most 32 texels): a room's shadow picture has
  small texels and keeps 32; a garden's covers more ground, and 32 of its texels (31 cm) left a stipple on a shirt in
  the sun.
- **Sky and ground fill** (`sky`, `ground`) and the **shade colour** on upright surfaces (`shade`), so shade is
  coloured, never black. In shade a surface keeps its own hue (the fills make it cool) and is darkened by its own
  lightness to the power 0.6: hair, wood and a teal sofa go much darker in shade than a cream wall does. A
  `paint({ keepHue: true })` (the car's body, hair) takes the fills as a neutral grey of their strength and is
  darkened by its lightness to the power 0.2 only, so the teal car stays the same teal in sun, in shade and at dusk.
  A `paint({ sun: k })` takes k of the direct light (the sun, the lamp) and all of the fills: a light colour that
  must keep its hue in full sun (the ginger cat, 0.45; hair, 0.6) stays under the highlight shoulder, which bends
  anything brighter toward the paper's white.
- **Bounce**: the set names flat patches that throw the sun back (`stage.setBounce`; the room uses its floor and
  back wall). Each patch is cut into cells about 0.3 m wide; each cell sends as much as the sun reaching it now (read
  from the shadow picture, so a figure standing in the sun patch dims what it throws back). A grid of probes adds
  this up once a frame; every surface reads the probes round it.
- **Sky through the openings**: the same probes, fed by the windows (the room's back window and its five side
  windows).
- **Thin things lit from behind** (`paint({ through, throughColor })`): curtain, lamp shade, leaves glow with the
  light on their far side.
- **Light in the air** only in the part of the room the set names (`setSun({ air })`: the room keeps the air
  between the camera and the set clear, so the shafts glow in front of the back wall and do not veil the picture).
- **Dust** (`room.mjs` `dustMotes`): specks laid out in every opening and along the sun of the hour; the specks of
  an opening the sun does not come in by are out. Each sinks through half a metre, fading in and out, and starts
  again, so a 30-minute film has dust at every minute (it used to sink out of the room in about 4 minutes). A speck
  is never bigger than 1.5 mm per metre from the camera, and it fades out between 2.5 m and 1.5 m from it, so one
  near the lens does not become a big pale disc.

## The painted surface

- **Mottle**: soft value and hue variation (`paint({ mottle, mottleScale })`), warmer where lighter.
- **Dry-brush strokes**: long soft-edged dabs a little lighter or darker, laid along the form in its rest position
  (so they stay put on a moving body), as strong as the mottle (so faces, which have little, stay clean).
- **Patterned cloth** by `paint({ pattern })`: the man's spotted shorts, the girl's hem band, the striped cushion,
  the rug, the curtains' band.
- None of these is drawn on the screen, so none crawls when the camera moves; they cost under a millisecond at
  1080p together (they are part of the 47 to 52 ms frame measured in `PERF.md`).

## The finish, in order

Supersampled scene (2 x 2, a tent over the samples round each pixel) → contact darkening → ink line → light in
the air → dust → [the moments of the shutter are summed here] → vector motion blur → depth of field → brush
filter → narrow and wide glow → vignette → saturation → split tone → exposure → highlight shoulder → to screen
values → S-curve → lift → paper tooth → grain.

- **Ink line**: drawn on the near side of a depth jump only (both sides drew every outline twice) and along
  creases; the picture is multiplied by a plum colour under it. One pixel (at 720 lines) in the light, where it
  also fades out on lit edges; two in shade where a form stands well in front of what is behind it, thinning as
  the jump dies away along the edge. Nothing past 12 m gets a line (the garden through the window: its cards are
  cut out without supersampling and the line broke into steps there).
- **Highlight shoulder**: above `look.shoulder` (0.7) the brightest channel bends toward the white of the paper
  (0.92 in light, a little under full white) and the other two are scaled with it, so a lit orange stays orange;
  only pale hot things (a sunlit cream wall) also lean toward white. Nothing reaches 250 of 255 but grain.
- **S-curve**: full strength in the darks, 0.4 of it in the lights (the shoulder has bent those already).
- **Soft shadow edges**: the disc of shadow samples is turned a quarter turn more at each of the 2 x 2 samples
  that make one pixel, so each pixel averages 4 x 32 directions (no stipple, the same in every frame).

## Motion blur

The shutter is open for half of each frame (a 180 degree shutter). Each shot chooses one of three ways to show
what moves while it is open (`built.shot(t).blur`; `engine/scene3d/API.md`, the entry point):

- `none`: the frame at its time, sharp.
- `vector` (the default, for long films): the scene is posed half a frame earlier, the stage remembers where every
  object and bone was, then the frame is drawn and the first pass records how far each point moved on the screen.
  Before the finishing, each pixel is spread along the motion of the fastest thing near it (McGuire et al.'s
  reconstruction filter: a moving thing smears over the still background as well as over itself). A camera move
  blurs the whole picture the same way. It costs about 1 ms at 1080p. Its limits: a streak is at most two tiles
  (32 px at 720p, 48 px at 1080p) long; what a moving thing uncovers is guessed from its neighbours; something that
  turns fast (a head shaking) smears into a soft blur rather than showing its features twice. The samples along a
  streak are shifted per pixel by a fixed noise of half a step (it was a whole step, which left a visible stipple on a
  slow-moving chin).
- `moments:N` (hero shots): the frame is drawn N times at times spread over the shutter, each with its own
  sub-pixel shift of the camera, and the pictures are summed before the finishing (so the glow, the grade and the
  grain are done once). True to anything, including turning and uncovering, but N times the cost (`PERF.md`), and
  with 4 moments a fast thing shows as 4 faint copies.

## Painting set textures with the 2D code

`canvasTexture(w, h, draw)` in `sets.mjs` paints a picture once with ordinary canvas calls and returns it as a
repeating texture. The floor boards are painted this way, finished with the 2D engine's `paper` from
`engine/paint/atmos.mjs`. Any 2D paint routine that draws on a `ctx` can dress a 3D set the same way.

## The gate

`node engine/scene3d/tools/look.mjs engine/scene3d/scenes/zero.mjs 30,100,153,222 100-110 1920x1080` prints, for
each frame, the share of near-black pixels (luma under 16) and of clipped ones (a channel at 250 or more), luma
percentiles (1st, 10th, 50th, 90th), RMS contrast and saturation; then the flicker of still tiles over the frame
range, without and with grain (the still tiles are found once, without the grain, so the grain cannot hide a slow
movement such as a long shadow swaying on a wall). It exits 1 outside the gate: 2 % near black, 3 % clipped, RMS
contrast under 58, a 1st percentile outside 15 to 45, 1.0 luma of flicker. With the camera moving no tile is
still and the flicker part of the gate cannot be judged (it exits 1). A moving camera was checked by holding the
scene at one frame and sliding the camera sideways 2 mm a frame (about a third of a pixel), grain off: steady
motion changes a pixel steadily, so half the second difference over three frames is the shimmer. Scene Zero frame
195: median tile 0.43 luma, worst 2.47 (the edges of the jumping girl and the man: the 2 x 2 samples of a hard
edge crossing pixels; it was 0.42 and 3.68 before this look); walls and floor away from the figures 0.1 to 0.3.
