// Planets: the painter shared by the `planet` rig (engine/cast/planet.mjs) and the space effects (engine/effects/:
// sizerow, moonlets, sunglow, …). Film code draws a world with it too: import { drawBody } from 'cinecode/paint/planets'.
// Bodies: saturn, jupiter, earth, mars, venus, mercury, uranus, neptune, moon (Earth's), titan, pluto, charon, sun.
//
// drawBody(ctx, P, cx, cy, R, o) paints one world centred at (cx, cy) with equatorial radius R (ctx units): its globe
// (latitude bands seen from the sub-observer latitude, spots, continents, clouds, craters), the shading of a sphere lit
// from the upper left (a soft fall-off and the house's hard lavender cel crescent), the ink outline, and rings in two
// passes (the whole ring behind the globe; the near half again over the globe: an opaque ring hides the limb, a
// see-through one, the C ring, is laid once over the globe and its outline, so no line shows where it crosses the limb).
// On the rings lies the globe's shadow: the cylinder of shadow the globe casts away from the Sun, cut by the ring plane,
// soft-edged (sunDir, ringShade). The rings are drawn seen from the north whatever the sign of tilt.
// P: a body name ('saturn') or { body, tilt, roll, axis, spin, … } (params override the preset). o: { t (s, for the
// spin), light ([x, y] toward the light in ctx's frame; default upper left), lw (ink width, ctx units), ink (false: no
// outline) }.
//
// Proportions are true where they are known: Saturn's polar radius is 0.902 of its equatorial one; its C ring spans
// 1.24–1.53, the B ring 1.53–1.95, the Cassini Division 1.95–2.03, the A ring 2.03–2.27 equatorial radii, with the
// Encke Gap at 2.21. Colours are a storybook's, not a photograph's, after NASA's: Jupiter's pale Equatorial Zone between
// its two dark belts and the Great Red Spot at 22°S, Neptune's Great Dark Spot at 20°S with its white companion cloud,
// Pluto's bright heart (Tombaugh Regio, 1 600 km across: two lobes, the western one Sputnik Planitia) and dark red
// Cthulhu Macula, Charon grey with its red north pole.
//
// radiusOf(body) is a body's true equatorial radius in km (RADIUS_KM), for true relative sizes: Earth / Saturn = 0.1058.
// globeOf(api, who) finds a planet actor's globe for an effect (the overlay / custom-beat api), at its depth.
// sunDir(light, tilt) and ringShade(S, ob, u, v): the Sun's direction in a ringed body's frame and how much of it the
// globe hides at a point of its ring plane, for an effect that draws on the rings (ringfield).
import { ell, ink, clamp, rng, smooth, INK } from '../core/lib.mjs';
import { SHADE, lineScale } from '../core/style.mjs';

export const R0 = 50;   // the planet rig's equatorial radius, in local units

// True equatorial radii, km (the Moon is Earth's; Pluto and Charon from New Horizons).
export const RADIUS_KM = { sun: 695700, mercury: 2439.7, venus: 6051.8, earth: 6378.1, moon: 1738.1, mars: 3396.2, jupiter: 71492, saturn: 60268,
  uranus: 25559, neptune: 24764, titan: 2574.7, pluto: 1188.3, charon: 606 };
export const radiusOf = body => RADIUS_KM[body] ?? RADIUS_KM.saturn;

const SATURN_RINGS = [
  { r0: 1.24, r1: 1.53, col: '#a69a84', a: 0.42 },                          // C ring: faint, greyish, see-through
  { r0: 1.53, r1: 1.95, col: '#ecdfbf', a: 0.96, lets: 14 },                // B ring: the brightest
  { r0: 1.95, r1: 2.03, col: '#4a4060', a: 0.16 },                          // Cassini Division
  { r0: 2.03, r1: 2.27, col: '#d6c6a2', a: 0.86, lets: 8, gap: [2.205, 2.218] },   // A ring, Encke Gap
];
const URANUS_RINGS = [
  { r0: 1.62, r1: 1.66, col: '#7d8c96', a: 0.5 }, { r0: 1.74, r1: 1.77, col: '#7d8c96', a: 0.45 }, { r0: 1.98, r1: 2.03, col: '#9aa6ae', a: 0.6 },
];

// Bands: [sin(latitude) of a zone's southern edge (+ = north), the zone's colour]: the globe is filled with `base`
// (the south polar colour), then the zones are laid from south to north, each over everything north of its edge.
// (Listed from north to south below; drawBody sorts them.)
export const BODIES = {
  saturn: { ob: 0.902, tilt: 0.38, roll: -0.1, spin: 0.035, base: '#bfa985', wave: 0.012, rings: SATURN_RINGS,
    bands: [[0.86, '#cdb48a'], [0.66, '#dcc597'], [0.47, '#e6d1a1'], [0.3, '#d6b884'], [0.16, '#e9d4a2'], [0.02, '#f2e2b4'], [-0.14, '#ead4a0'],
      [-0.26, '#d4b27c'], [-0.4, '#e8d3a2'], [-0.56, '#dcc496'], [-0.72, '#ccb68e'], [-0.86, '#b9ae94']] },
  // the pale Equatorial Zone (7°S–7°N) between the dark North (7°–17°N) and South (7°–20°S) Equatorial Belts, the
  // tropical zones and temperate belts, grey-brown poles; the Great Red Spot (16 000 km across) at 22°S, in its hollow
  jupiter: { ob: 0.935, axis: 0.05, roll: 0, spin: 0.05, base: '#b6a68e', wave: 0.02,
    bands: [[0.86, '#bcb09a'], [0.68, '#cbb797'], [0.52, '#e3d4b4'], [0.41, '#c69a70'], [0.29, '#eee2c6'], [0.12, '#b97d50'], [-0.12, '#f2e8d0'],
      [-0.34, '#bb8459'], [-0.45, '#efe4c8'], [-0.54, '#bf9670'], [-0.66, '#e2d3b2'], [-0.86, '#c9b896']],
    spots: [{ lon: 0.7, lat: -0.375, w: 0.115, h: 0.07, col: '#c0603e', ring: '#ead2b0' }] },
  earth: { ob: 0.997, axis: 0.25, roll: 0.15, spin: 0.08, base: '#3a6db6', bands: [[-0.86, '#3a6db6']],
    land: [[0.2, 0.55, 0.35, 0.28, '#5c8a46'], [0.55, 0.15, 0.22, 0.38, '#6b8f48'], [0.62, -0.4, 0.12, 0.2, '#8e8250'], [2.2, 0.45, 0.6, 0.3, '#6e9050'],
      [2.6, -0.1, 0.2, 0.3, '#8a7e4c'], [3.4, -0.45, 0.24, 0.18, '#b39a5e'], [4.6, 0.6, 0.25, 0.22, '#5e8a48'], [5.0, 0.15, 0.18, 0.4, '#6c9050'], [5.3, -0.35, 0.1, 0.22, '#7c8c4a']],
    caps: '#f4f6f8', clouds: '#ffffff' },
  mars: { ob: 0.994, axis: 0.3, roll: 0.1, spin: 0.08, base: '#c4673f', bands: [[-0.86, '#c4673f']],
    land: [[0.4, 0.1, 0.4, 0.18, '#93492e'], [1.6, -0.25, 0.3, 0.2, '#9c5233'], [3.0, 0.2, 0.5, 0.14, '#8e4630'], [4.4, -0.1, 0.3, 0.22, '#a3573a'], [5.4, 0.3, 0.2, 0.12, '#d88a5c']],
    caps: '#f3eee8' },
  venus: { ob: 1, axis: 0.05, roll: 0, spin: 0.02, base: '#e2c88e', wave: 0.05,
    bands: [[0.6, '#ead6a2'], [0.25, '#e4cb94'], [-0.1, '#eedcae'], [-0.45, '#e2c88e'], [-0.75, '#ead7a8']] },
  mercury: { ob: 1, axis: 0.05, roll: 0, spin: 0.01, base: '#9a938c', bands: [[-0.86, '#9a938c']], craters: 26, crater: '#7d7670' },
  moon: { ob: 1, axis: 0.05, roll: 0, spin: 0, base: '#c8c3b8', bands: [[-0.86, '#c8c3b8']], craters: 20, crater: '#a7a196',
    land: [[0.3, 0.35, 0.3, 0.22, '#9e998f'], [-0.2, 0.05, 0.25, 0.2, '#a29d93'], [0.5, -0.1, 0.22, 0.25, '#9a958c']] },
  uranus: { ob: 0.977, tilt: 0.55, roll: 1.42, axis: 0.55, spin: 0.03, base: '#a6d8dc', wave: 0.005, rings: URANUS_RINGS,
    bands: [[0.5, '#a9dde0'], [0, '#b0e2e4'], [-0.5, '#b9e6e6']] },
  // the Great Dark Spot (Voyager 2) at 20°S, a white methane cloud along its southern edge
  neptune: { ob: 0.983, axis: 0.2, roll: 0.05, spin: 0.04, base: '#3d5fc0', wave: 0.01,
    bands: [[0.6, '#3a5ab8'], [0.3, '#4468c8'], [-0.1, '#4a70cf'], [-0.45, '#4064c4'], [-0.75, '#3a5cbc']],
    spots: [{ lon: 0.4, lat: -0.34, w: 0.16, h: 0.08, col: '#273e8e' }, { lon: 0.44, lat: -0.43, w: 0.11, h: 0.025, col: '#e6ecf6' }] },
  titan: { ob: 1, axis: 0.1, roll: 0, spin: 0.01, base: '#d39a48', wave: 0.02, haze: '#e8b864',
    bands: [[0.6, '#cf9644'], [0.2, '#d8a24e'], [-0.3, '#dca854'], [-0.7, '#c99a58']] },
  // New Horizons: pale tan, a lighter north, the bright nitrogen-ice "heart" (Tombaugh Regio, centred at 25°N) and the
  // dark red-brown Cthulhu Macula west of it along the equator
  pluto: { ob: 1, axis: 0.15, roll: 0, spin: 0.01, base: '#bf9f80', bands: [[0.55, '#d4c0a8'], [0.2, '#c9ac8c'], [-0.86, '#bf9f80']],
    land: [[-0.65, -0.08, 0.42, 0.16, '#6f4634'], [-1.2, -0.14, 0.3, 0.12, '#7a4c36'], [2.6, -0.1, 0.5, 0.14, '#764a35']], craters: 8, crater: '#a88a6e',
    heart: [0.45, 0.42, 1.6, 0.95, '#e4d7c3', '#f5efe5'] },
  // grey water ice, its north pole stained red-brown (Mordor Macula)
  charon: { ob: 1, axis: 0.2, roll: 0, spin: 0.01, base: '#9c9690', bands: [[0.82, '#7c5444'], [0.7, '#94827a'], [-0.86, '#9c9690']], craters: 16, crater: '#85807a' },
  sun: { ob: 1, axis: 0, roll: 0, spin: 0.01, base: '#ffd46a', bands: [[-0.86, '#ffe08a']], emissive: true },
};

export const bodyOf = P => {
  const p = typeof P === 'string' ? { body: P } : P || {}, B = BODIES[p.body] || BODIES.saturn;
  return { ...B, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null)) };
};

// Half the drawn height and width of a body (globe and rings, rolled), and of its globe alone, for R = 1.
export function extentOf(P) {
  const B = bodyOf(P), roll = B.roll || 0, rp = B.ob ?? 1, hz = B.haze ? 1.05 : 1;
  const half = (a, b) => [Math.sqrt((a * Math.cos(roll)) ** 2 + (b * Math.sin(roll)) ** 2), Math.sqrt((a * Math.sin(roll)) ** 2 + (b * Math.cos(roll)) ** 2)];
  const [gw, gh] = half(hz, rp * hz);
  let [w, h] = [gw, gh];
  if (B.rings?.length) { const ro = Math.max(...B.rings.map(q => q.r1)), [rw, rh] = half(ro, ro * Math.abs(Math.sin(B.tilt || 0))); w = Math.max(w, rw); h = Math.max(h, rh); }
  return { w, h, gw, gh };
}

// The unit vector toward the light (the upper left of the screen) in ctx's current frame.
export function lightIn(ctx) {
  let v;
  if (ctx.lightShift) v = ctx.lightShift(1);
  else { const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c || 1; v = [(-m.d + m.c) / det, (m.b - m.a) / det]; }
  const L = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / L, v[1] / L];
}

const TAU = Math.PI * 2;
const fillPts = (c, P) => { c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
// screen pixels per unit of ctx (a rig's context knows the canvas transform under it)
const pxOf = c => { if (c.pxPerUnit) return c.pxPerUnit(); const m = c.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; };
// clip to a globe's disc (R, Rp), out by m ctx units
const discClip = (c, disc, R, Rp, m = 0) => { const kx = 1 + m / R, ky = 1 + m / Rp; c.beginPath(); disc.forEach(([x, y], i) => (i ? c.lineTo(x * kx, y * ky) : c.moveTo(x * kx, y * ky))); c.closePath(); c.clip(); };
// A point at longitude lam (from the central meridian, + toward +x) and latitude phi on a globe (R, Rp) seen from
// sub-observer latitude Bo: [x, y, mu] (mu > 0: on the near side; y down is south).
const onGlobe = (lam, phi, R, Rp, Bo) => [R * Math.cos(phi) * Math.sin(lam), Rp * (-Math.sin(phi) * Math.cos(Bo) + Math.cos(phi) * Math.cos(lam) * Math.sin(Bo)),
  Math.cos(phi) * Math.cos(lam) * Math.cos(Bo) + Math.sin(phi) * Math.sin(Bo)];

// Lay `col` over every visible point north of latitude asin(s) (wavy edge).
function northOf(c, s, col, R, Rp, Bo, wave, ph) {
  const phi = Math.asin(clamp(s, -0.999, 0.999)), rx = R * Math.cos(phi), Y = 2.2 * R, arc = [];
  for (let i = 0; i <= 120; i++) {
    const lam = -Math.PI / 2 + (Math.PI * i) / 120, w = wave * Math.sin(lam * 5 + ph) + wave * 0.6 * Math.sin(lam * 11 - ph * 1.7);
    const [x, y] = onGlobe(lam, phi + w, R, Rp, Bo);
    arc.push([x, y]);
  }
  c.fillStyle = col;
  if (phi > Math.PI / 2 - Bo - 1e-3) {           // the whole latitude circle is in view: its ellipse
    const yc = -Rp * Math.sin(phi) * Math.cos(Bo), ry = Rp * Math.cos(phi) * Math.sin(Bo);
    c.beginPath(); c.ellipse(0, yc, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); c.fill(); return;
  }
  const yc = arc[0][1], back = arc.slice().reverse();
  if (phi >= 0) fillPts(c, [[-rx, -Y], [rx, -Y], [rx, yc], ...back, [-rx, yc]]);
  else fillPts(c, [[-Y, -Y], [Y, -Y], [Y, Y], [rx, Y], [rx, yc], ...back, [-rx, yc], [-rx, Y], [-Y, Y]]);
}

// A blob on the sphere (a spot, a continent, a cloud, a crater floor), foreshortened toward the limb.
function onSphere(c, lam, phi, w, h, col, R, Rp, Bo, a = 1, seed = 1) {
  const [x, y, mu] = onGlobe(lam, phi, R, Rp, Bo);
  if (mu <= 0.02) return;
  const fx = Math.max(0.12, Math.cos(lam)), fy = Math.max(0.12, mu);
  c.save(); c.globalAlpha *= a * clamp(mu / 0.18);
  c.fillStyle = col; fillPts(c, ell(x, y, w * R * fx, h * R * fy, seed, Math.min(w * R * fx, h * R * fy) * 0.12));
  c.restore();
}

// Pluto's heart (Tombaugh Regio) on the sphere: H = [lon, lat (radians), width, height (radians), colour, the western
// lobe's colour]: two lobes, the western one (Sputnik Planitia, brighter) larger and running down into the point, which
// leans south-west. What has turned past the limb is laid along it.
function heartOn(c, H, R, Rp, Bo, ph) {
  const [lon, lat, w, h, col, west] = H, out = [], sp = [];
  const at = (x, y) => {
    const [X, Y, mu] = onGlobe(lon - ph + (x * w) / 2, lat + (y * h) / 2, R, Rp, Bo);
    if (mu >= 0) return [X, Y, mu];
    const k = 1 / (Math.hypot(X / R, Y / Rp) || 1); return [X * k, Y * k, mu];
  };
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * TAU, y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 + 0.155;
    let x = Math.sin(t) ** 3;
    if (x > 0) x *= 0.82;
    out.push(at(x - 0.22 * clamp((0.4 - y) / 1.3), y));
    // Sputnik Planitia: an oval over the western lobe, down into the point
    sp.push(at(-0.4 + 0.42 * Math.cos(t) - 0.12 * (0.5 - 0.5 * Math.sin(t)), -0.15 + 0.72 * Math.sin(t)));
  }
  if (!out.some(p => p[2] > 0)) return;
  c.save(); c.fillStyle = col; fillPts(c, out); c.clip(); c.fillStyle = west; fillPts(c, sp); c.restore();
}

// The Sun's direction [u, v, w] in a ringed body's frame (u: the picture's x, v: in the ring plane toward the viewer,
// w: the north pole), from `light` (toward the light on the picture, in the body's rolled frame) as the globe's shading
// has it (the sub-solar point at 0.55 of the radius toward it), its height over the ring plane kept within SUN_EL
// (Saturn's is at most 27°; at 17° the shadow reaches across all its rings). tilt: the rings' opening (its sign is
// ignored, as drawBody draws the rings seen from the north).
const SUN_EL = 0.3, PHASE = 0.55, PEN = 0.07;   // PEN: the shadow's soft edge, ± this many globe radii
export function sunDir(light, tilt) {
  const L = Math.hypot(light[0], light[1]) || 1, x = (light[0] / L) * PHASE, y = (light[1] / L) * PHASE, z = Math.sqrt(1 - PHASE * PHASE);
  const st = Math.abs(Math.sin(tilt)), ct = Math.cos(tilt), u = x, v = y * st + z * ct, w = -y * ct + z * st;
  const el = clamp(Math.asin(clamp(w, -1, 1)), -SUN_EL, SUN_EL), h = Math.hypot(u, v) || 1;
  return [(Math.cos(el) * u) / h, (Math.cos(el) * v) / h, Math.sin(el)];
}
// The globe's shadow on its ring plane: the points (p along the Sun's direction in the plane, q across it, in globe
// radii) whose line to the Sun passes through the globe (polar radius ob): p < 0 and (ĉ p)² + q² < 1, ĉ the Sun's
// height over the plane in the frame where the globe is round. → [the Sun's direction in the plane (radians), ĉ]
const shadowOf = (S, ob) => [Math.atan2(S[1], S[0]), Math.max(0.05, Math.abs(S[2] / ob) / Math.hypot(S[0], S[1], S[2] / ob))];
// How much of the Sun the globe hides at the point (u, v) of the ring plane (globe radii): 0 (lit) .. 1, soft-edged.
export function ringShade(S, ob, u, v) {
  const [ang, cc] = shadowOf(S, ob), p = u * Math.cos(ang) + v * Math.sin(ang), q = -u * Math.sin(ang) + v * Math.cos(ang);
  return p >= 0 ? 0 : 1 - smooth(1 - PEN, 1 + PEN, Math.hypot(cc * p, q));
}

const OPAQUE = 0.6;   // a ring more opaque than this hides the globe's limb; a thinner one (the C ring) is seen through

// The outer edge of the globe's ink line (ink() replayed into a recorder; the disc itself with no ink): what the globe
// and its line cover. A clip there meets the line's own antialiased edge, so a ring laid over both shows no seam.
function rimOf(disc, lw) {
  if (lw <= 0) return disc;
  const subs = [], rec = { beginPath() {}, moveTo(x, y) { subs.push([[x, y]]); }, lineTo(x, y) { subs[subs.length - 1].push([x, y]); }, closePath() {}, fill() {} };
  ink(rec, disc, lw, { seed: 23 });
  const area = P => Math.abs(P.reduce((s, [x, y], i) => { const [u, v] = P[(i + 1) % P.length]; return s + x * v - u * y; }, 0));
  return subs.reduce((a, b) => (area(b) > area(a) ? b : a));
}

function ringHalf(c, B, R, tilt, half, lw, rp, S, disc, rim) {
  // The far pass paints the whole ring (the globe then hides what is behind it: no seam). The near pass repaints the
  // near half where it crosses the globe: an opaque ring clipped to the globe's disc out 0.6 px (else the globe's
  // antialiased edge shows as a dark hairline; the globe's ink is left out under it), a see-through one to the outer
  // edge of the globe's ink line (`rim`), over the globe and its line (painted again beside the limb, or over the
  // globe's bare antialiased edge, it shows the limb as a light line).
  // The rings are drawn as seen from the north (the near half below the centre) whatever the sign of tilt.
  const sy = Math.abs(Math.sin(tilt)), Rp = R * rp, front = half === 'front', a0 = 0, a1 = front ? Math.PI : 2 * Math.PI, ccw = false;
  const band = (r0, r1) => { c.beginPath(); c.ellipse(0, 0, r1 * R, Math.max(0.02, r1 * R * sy), 0, a0, a1, ccw); c.ellipse(0, 0, r0 * R, Math.max(0.02, r0 * R * sy), 0, a1, a0, !ccw); c.closePath(); };
  // nearly edge-on: a thin bright line, the near half crossing the globe
  const thin = sy * R < 0.6, last = B.rings[B.rings.length - 1], ro = last.r1;
  const see = q => !thin && q.a <= OPAQUE;
  const px = pxOf(c), onDisc = m => discClip(c, disc, R, Rp, m / px);
  // the near half of the rim, as a clip that adds nothing to a rig's box (its context's mask)
  const onRim = () => { c.beginPath(); rim.forEach(([x, y], i) => (i ? c.lineTo(x, Math.max(0, y)) : c.moveTo(x, Math.max(0, y)))); c.closePath(); if (c.mask) c.mask(); else c.clip(); };
  const paint = q => {
    c.globalAlpha = q.a; c.fillStyle = q.col; band(q.r0, q.r1); c.fill();
    // ringlets: fine concentric lines of lighter and darker ice
    if (q.lets && !thin) {
      const r = rng(Math.round(q.r0 * 1000));
      for (let i = 0; i < q.lets; i++) {
        const rr = q.r0 + (q.r1 - q.r0) * ((i + 0.5 + (r() - 0.5) * 0.6) / q.lets), dark = r() < 0.5;
        c.globalAlpha = 0.18 + 0.2 * r(); c.strokeStyle = dark ? '#8c7c62' : '#fff6de'; c.lineWidth = (0.25 + 0.5 * r()) * R / R0;
        c.beginPath(); c.ellipse(0, 0, rr * R, Math.max(0.02, rr * R * sy), 0, a0, a1, ccw); c.stroke();
      }
    }
    if (q.gap) { c.globalAlpha = 0.7; c.fillStyle = '#3a3350'; band(q.gap[0], q.gap[1]); c.fill(); }
  };
  // ink: the outer edge of the rings, one closed line (the near pass redraws the same line where it crosses the globe)
  const edge = () => {
    if (lw <= 0 || thin) return;
    const P = [];
    for (let i = 0; i < 128; i++) { const a = (TAU * i) / 128; P.push([Math.cos(a) * ro * R, Math.sin(a) * ro * R * sy]); }
    c.globalAlpha = 0.75; ink(c, P, lw * 0.6, { closed: true, seed: 61, color: INK });
  };
  if (!front) {
    c.save(); for (const q of B.rings) paint(q); edge(); c.restore();
    // the globe's shadow on the rings (only here: the Sun is on our side of the globe, so the shadow falls behind it,
    // never on the near half where it crosses the globe): a disc in the frame where the shadow (a half-ellipse 1/ĉ long
    // and the globe wide, away from the Sun) is round, soft at its edge. One pass over all the ring material (the rings
    // at least 0.3 opaque, not the space a nearly empty division shows), its clip a pixel past their edges: clipped to
    // each ring, or to their own edges, it would leave a light line where the ring's antialiased edge meets the clip's.
    if (!thin) {
      const [sang, cc] = shadowOf(S, rp), k = (1 + PEN) * R, e = Math.min(1, 1 / px), iv = [];
      for (const q of B.rings) if (q.a >= 0.3) { const l = iv[iv.length - 1]; if (l && Math.abs(l[1] - q.r0) < 1e-9) l[1] = q.r1; else iv.push([q.r0, q.r1]); }
      c.save(); c.beginPath();
      for (const [r0, r1] of iv) {
        c.moveTo(r1 * R + e, 0); c.ellipse(0, 0, r1 * R + e, r1 * R * sy + e, 0, 0, TAU);
        c.ellipse(0, 0, Math.max(0.02, r0 * R - e), Math.max(0.02, r0 * R * sy - e), 0, TAU, 0, true); c.closePath();
      }
      c.clip(); c.scale(1, sy); c.rotate(sang); c.scale(1 / cc, 1);
      const g = c.createRadialGradient(0, 0, (1 - PEN) * R, 0, 0, k);
      g.addColorStop(0, 'rgba(28,24,48,0.88)'); g.addColorStop(1, 'rgba(28,24,48,0)');
      c.fillStyle = g; c.fillRect(-k, -k, k, 2 * k);
      c.restore();
      // a rig's box holds the rings out a unit past their edge, room for its ink line (its context counts what a clip
      // encloses: this one paints nothing)
      c.save(); c.beginPath(); c.ellipse(0, 0, ro * R + 1, ro * R * sy + 1, 0, 0, TAU); c.clip(); c.restore();
    }
  } else {
    // the see-through rings over the rim (beyond the clip below, which keeps within the globe's ink line)
    for (const q of B.rings) if (see(q)) { c.save(); onRim(); paint(q); c.restore(); }
    if (see(last)) { c.save(); onRim(); edge(); c.restore(); }
    // (the near pass clips to the globe and its ink line, as the edge-on line keeps doing: the rig's box)
    c.save();
    const m = Math.max(lw * 0.6, 0.5); c.beginPath(); c.ellipse(0, 0, R + m, Rp + m, 0, 0, TAU); c.clip(); c.beginPath(); c.rect(-3 * R, 0, 6 * R, 3 * R); c.clip();
    for (const q of B.rings) if (!see(q)) { c.save(); if (!thin) onDisc(0.6); paint(q); c.restore(); }
    if (!see(last)) { onDisc(0.6); edge(); }
    c.restore();
  }
  if (thin) {
    c.save(); c.globalAlpha = 0.95; c.fillStyle = '#efe2c2';
    const ro = B.rings[B.rings.length - 1].r1 * R, ri = B.rings[0].r0 * R, hw = 0.45 * R / R0;
    if (front) c.fillRect(-ro, -hw, 2 * ro, 2 * hw);   // seen edge-on, the near half crosses the globe
    else { c.globalAlpha = 0.5; c.fillRect(-ro, -hw, ro - ri, 2 * hw); c.fillRect(ri, -hw, ro - ri, 2 * hw); }
    c.restore();
  }
}

export function drawBody(c, Pin, cx, cy, R, o = {}) {
  const B = bodyOf(Pin), t = (o.t || 0) * (B.spin || 0) * (B.spinK ?? 1), rp = B.ob ?? 1, Rp = R * rp;
  const roll = B.roll || 0, tilt = B.tilt || 0, Bo = B.rings ? tilt : (B.axis || 0);
  const L0 = o.light || lightIn(c), lw = o.ink === false ? 0 : (o.lw ?? 1.3 * R / R0) * lineScale();
  c.save(); c.translate(cx, cy); c.rotate(roll);
  const light = [L0[0] * Math.cos(-roll) - L0[1] * Math.sin(-roll), L0[0] * Math.sin(-roll) + L0[1] * Math.cos(-roll)];
  const S = B.rings ? sunDir(light, tilt) : null, disc = ell(0, 0, R, Rp, 17, R * 0.004);
  if (B.rings) ringHalf(c, B, R, tilt, 'back', lw, rp, S, disc);
  // a thick atmosphere (Titan): a soft haze around the limb
  if (B.haze) {
    c.save(); const g = c.createRadialGradient(0, 0, R * 0.92, 0, 0, R * 1.08);
    g.addColorStop(0, B.haze); g.addColorStop(0.55, B.haze); g.addColorStop(1, 'rgba(232,184,100,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, R * 1.08, Rp * 1.08, 0, 0, TAU); c.fill(); c.restore();
  }
  c.save(); c.beginPath(); disc.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
  c.fillStyle = B.base; c.fillRect(-R - 2, -Rp - 2, 2 * R + 4, 2 * Rp + 4);
  const ph = t * TAU;
  for (const [s, col] of [...B.bands].sort((a, b) => a[0] - b[0])) northOf(c, s, col, R, Rp, Bo, B.wave || 0, ph + s * 7);
  for (const [lon, lat, w, h, col] of B.land || []) {
    // a continent: three overlapping blobs
    const r = rng(Math.round(lon * 977 + lat * 131));
    for (let k = 0; k < 3; k++) onSphere(c, lon + (r() - 0.5) * w * 1.2 - ph, Math.asin(clamp(lat + (r() - 0.5) * h)), w * (0.5 + 0.4 * r()), h * (0.5 + 0.4 * r()), col, R, Rp, Bo, 1, k + 3);
  }
  if (B.craters) {
    const r = rng(B.craters * 37);
    for (let k = 0; k < B.craters; k++) {
      const lon = r() * TAU, lat = Math.asin(r() * 1.8 - 0.9), sz = 0.03 + 0.07 * r() * r();
      onSphere(c, lon - ph, lat, sz, sz, B.crater, R, Rp, Bo, 0.9, k);
      onSphere(c, lon - ph - sz * 0.25, lat + sz * 0.25, sz * 0.75, sz * 0.75, '#ffffff', R, Rp, Bo, 0.18, k + 50);
    }
  }
  if (B.heart) heartOn(c, B.heart, R, Rp, Bo, ph);
  for (const sp of B.spots || []) {
    if (sp.ring) onSphere(c, sp.lon - ph, Math.asin(sp.lat), sp.w * 1.25, sp.h * 1.35, sp.ring, R, Rp, Bo, 0.9, 7);
    onSphere(c, sp.lon - ph, Math.asin(sp.lat), sp.w, sp.h, sp.col, R, Rp, Bo, 1, 8);
  }
  if (B.caps) { onSphere(c, 0, Math.PI / 2, 0.55, 0.25, B.caps, R, Rp, Bo, 1, 9); onSphere(c, 0, -Math.PI / 2, 0.45, 0.22, B.caps, R, Rp, Bo, 1, 10); }
  if (B.clouds) {
    const r = rng(404);
    for (let k = 0; k < 14; k++) { const lon = r() * TAU, lat = Math.asin(r() * 1.6 - 0.8); onSphere(c, lon - ph * 1.6, lat, 0.12 + 0.2 * r(), 0.03 + 0.03 * r(), B.clouds, R, Rp, Bo, 0.75, k + 20); }
  }
  if (B.emissive) {
    // the Sun: brighter in the middle, darker toward the limb, a fine granulation
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, 'rgba(255,252,236,0.95)'); g.addColorStop(0.6, 'rgba(255,236,170,0.5)'); g.addColorStop(1, 'rgba(240,150,60,0.6)');
    c.fillStyle = g; c.fillRect(-R, -R, 2 * R, 2 * R);
  } else {
    // the shading of a ball lit from the upper left: a soft fall-off, then the house's hard lavender crescent
    c.save(); c.globalCompositeOperation = 'multiply';
    const lx = light[0] * R * 0.55, ly = light[1] * Rp * 0.55, g = c.createRadialGradient(lx, ly, R * 0.1, lx, ly, R * 1.55);
    g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(0.5, 'rgb(246,240,236)'); g.addColorStop(0.82, 'rgb(150,132,170)'); g.addColorStop(1, 'rgb(70,58,104)');
    c.fillStyle = g; c.fillRect(-R - 2, -Rp - 2, 2 * R + 4, 2 * Rp + 4);
    c.fillStyle = SHADE; c.beginPath(); c.rect(-R - 4, -Rp - 4, 2 * R + 8, 2 * Rp + 8);
    c.ellipse(light[0] * R * 0.2, light[1] * Rp * 0.2, R * 1.0, Rp * 1.0, 0, 0, TAU); c.fill('evenodd');
    c.restore();
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.22;
    const h = c.createRadialGradient(light[0] * R * 0.5, light[1] * Rp * 0.5, 0, light[0] * R * 0.5, light[1] * Rp * 0.5, R * 0.7);
    h.addColorStop(0, '#fff6e0'); h.addColorStop(1, 'rgba(255,246,224,0)'); c.fillStyle = h; c.fillRect(-R, -Rp, 2 * R, 2 * Rp);
    c.restore();
  }
  c.restore();
  if (lw > 0 && !B.emissive) {
    c.save(); if (B.haze) c.globalAlpha = 0.35;
    // no limb under the near opaque rings (their near pass covers the disc only, so the line would show through them);
    // a see-through ring is painted over it (the globe's outline seen through the C ring)
    const sy = Math.sin(tilt);
    if (B.rings && Math.abs(sy) * R >= 0.6) {
      c.beginPath(); c.rect(-3 * R, -3 * R, 6 * R, 6 * R);
      for (const q of B.rings) if (q.a > OPAQUE) { c.moveTo(q.r1 * R, 0); c.ellipse(0, 0, q.r1 * R, Math.abs(q.r1 * R * sy), 0, 0, Math.PI); c.ellipse(0, 0, q.r0 * R, Math.abs(q.r0 * R * sy), 0, Math.PI, 0, true); c.closePath(); }
      if (c.mask) c.mask('evenodd'); else c.clip('evenodd');   // (the rig's context: a clip that adds no bounds)
    }
    ink(c, disc, lw, { seed: 23 }); c.restore();
  }
  if (B.rings) ringHalf(c, B, R, tilt, 'front', lw, rp, S, disc, rimOf(disc, lw));
  c.restore();
}

// The globe of a planet actor (the `planet` rig), for an effect (api: the overlay / custom-beat api; DESIGN §9.1, §10):
// → { a (the actor), c ([x, y]: its centre, world px on its own depth plane), z (its depth), R (its equatorial radius,
// world px), ob (polar / equatorial), roll (as drawn: mirrored when it faces left), tilt (the rings' opening), B (the
// body), sc ([sx, sy]: its centre on screen), s (screen px per world px at its depth), sR (its radius on screen), fade
// (the near fade, 0..1) }, or null when there is no such actor. Draw in world px at its depth with atDepth.
export function globeOf(api, who) {
  const a = api.actor(who);
  if (!a) return null;
  const P = { ...(a.st?.params || {}) }, B = bodyOf(P), k = P.size || 1, z = a.z || 0, R = R0 * a.s * k;
  const [sx, sy, s, fade] = api.project([a.head[0], a.head[1], z]);
  return { a, c: a.head, z, R, ob: B.ob ?? 1, roll: (B.roll || 0) * (a.face < 0 ? -1 : 1), tilt: B.tilt || 0, B, sc: [sx, sy], s, sR: R * s, fade };
}

// Put ctx in the world transform of depth z (zoom × p about the camera centre: world px drawn where the camera sees
// them at that depth). On the stage (z 0) it is the world layers' own transform.
export function atDepth(ctx, api, z = 0) {
  const s = api.project([api.cam.cx, api.cam.cy, z])[2];
  ctx.setTransform(s, 0, 0, s, api.W / 2 - api.cam.cx * s, api.H / 2 - api.cam.cy * s);
  return s;
}
