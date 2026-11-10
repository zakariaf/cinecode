// A planet, moon or star as an actor: the camera frames it (`on`), pushes in on it and lints it like a character, and
// it stands on a set's ground or holds at a perch anchor (the `space` kit's anchors). One rig, a `body` preset per world:
// saturn (default), jupiter, earth, mars, venus, mercury, uranus, neptune, pluto, moon, titan, charon, sun. The painter
// is engine/paint/planets.mjs (drawBody), shared with the space effects (sizerow, moonlets, ringfield, …).
//
// Params: body; tilt (the rings' opening, radians: 0 = edge-on; Saturn's default 0.38 ≈ 22°); roll (the whole body
// turned in the picture, radians); axis (a ringless body's sub-observer latitude: how much of its north pole we see);
// spin (band and feature drift per second); size (scales the drawing). Saturn's rings are in true proportion to its
// globe (C, B, A rings, the Cassini Division and the Encke Gap at their real radii). A planet has no face (expressions:
// neutral; the camera crops into it with `zoom` or `focus`), no shadow on the ground, and stays upright on a slope.
// Its `head` is the globe's centre, so `close` frames the globe. Size it with the cast `scale`; for true relative
// sizes, multiply by the ratio of radii (radiusOf in engine/paint/planets.mjs: Earth / Saturn = 0.1058). For a moon
// in front of or behind a planet, give it a depth (`z`, DESIGN §10): the draw order then follows.
import { makeRig } from './rig.mjs';
import { drawBody, extentOf, R0 } from '../paint/planets.mjs';

const r1 = v => Math.round(v * 10) / 10;   // (to a tenth of a unit)
const sizes = (params = {}) => {
  const e = extentOf(params), k = params.size || 1, pad = 1.2;
  return { height: r1((2 * e.h * R0 + pad) * k), headHeight: r1((2 * e.gh * R0) * k), width: r1((2 * e.w * R0) * k) };
};
const S0 = sizes({});

export default makeRig({
  kind: 'planet', label: 'Planet',
  height: S0.height, headHeight: S0.headHeight, width: S0.width,
  sizes,
  expressions: ['neutral'],
  upright: true, noShadow: true, shadowW: 0, perch: true,
  params: { body: 'saturn' },
  speeds: { walk: 40, run: 200 }, stride: { walk: 40, run: 200 },
  poses: { stand: { lift: 0 }, perch: { lift: 0 } },
  gaits: { walk: () => ({ lift: 0 }), run: () => ({ lift: 0 }) },
  gestures: {},
  paint(T, p, F, o) {
    const e = extentOf(o.P), cy = e.h * R0 + 0.6;
    drawBody(T, o.P, 0, -cy, R0, { t: o.t });
    o.out.head = T.map(0, -cy); o.out.mouth = T.map(0, -cy);
  },
});
