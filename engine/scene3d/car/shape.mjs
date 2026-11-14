// The car's shape, written with the shape kit (docs/scene3d-shapes.md): a small rounded hatchback, toy-like, sized round the
// engine's man (1.98 m) in the driver's seat. Front is +z, the driver sits on the left (+x, the side the man's left
// hand is on), the floor is y = 0 under the tyres. Every size is named once in CAR.
//
// Parts and joints (for drive.mjs): body (root); door (hinge "door", 0 shut .. 1 open, on its front edge);
// steer_fl / steer_fr (hinge about y, the front wheels' steering), wheel_fl / wheel_fr / wheel_rl / wheel_rr (spin
// about x); steering (spin about its column). Glass, the lit lenses and the shadow under the car are not kit solids:
// car.mjs adds them.
import { box, cyl, ball, dome, torus, loft, revolve, extrude, part, at, cut, keep, turn, mirror, hinge, spin, mark, ring }
  from '../shape.mjs';

export const CAR = {
  len: 3.9, wid: 1.9, clear: 0.24, belt: 1.04,
  axleF: 1.28, axleR: -1.28, track: 0.8,                 // wheel centres: z of each axle, x of each wheel
  wheelR: 0.37, rimR: 0.24, tyreW: 0.26, archR: 0.45, bolts: 3,
  wall: 0.07, floor: 0.3,                                // the shell's thickness; the cabin floor
  // the driver: the seat under his hips (in from the door far enough that the man's shoulder clears its wall) (x, y of the cushion top, z), and the steering wheel's centre and tilt
  seat: [0.32, 0.5, -0.2], wheel: [0.32, 0.98, 0.22], wheelTilt: 28, wheelRad: 0.19,
  // the opening driver's door and the windows, in (z, y) on the car's side
  // (the door's top stays below where the roof curves in past x = doorIn, so its frame keeps a full section: higher, its
  // front corner thinned to a horn)
  door: [[0.72, 0.36, 0.05], [0.72, 1.06, 0.04], [0.34, 1.63, 0.08], [-0.36, 1.72, 0.06], [-0.36, 0.36, 0.05]],
  doorGap: 0.004, doorIn: 0.55,                          // the door's inner face (x)
  frontWin: [[0.6, 1.12, 0.05], [0.25, 1.57, 0.07], [-0.27, 1.64, 0.06], [-0.27, 1.12, 0.05]],
  rearWin: [[-0.45, 1.12, 0.05], [-0.45, 1.64, 0.06], [-1.25, 1.62, 0.12], [-1.5, 1.3, 0.1], [-1.5, 1.12, 0.05]],
  // windscreen: the roof's front edge (z), how far forward its cutter reaches (z), its foot (y); its sides keep an
  // A-pillar this deep (z) ahead of the side window's front edge, all the way up into the roof
  screen: { top: 0.3, front: 1.1, foot: 1.1, pillar: 0.13 },
  back: { a: [-1.94, 1.15], b: [-1.74, 1.7], half: 0.58 },    // the hatch's window
  lamp: [0.56, 0.76, 1.94], lampR: 0.17, lampTilt: 12,     // the headlights: the middle of each face (x, y, z), radius, tilt up (degrees)
  bonnet: 1.0,                                                 // the bonnet's back edge (z)
  fender: { x: 0.7, y: 0.72, r: [0.3, 0.33, 0.62] },           // the round wings over each wheel
};
const C = CAR;
export const COLORS = { body: 0x3a908e, cream: 0xf0e2c4, tyre: 0x34303a, dash: 0x41545a, seat: 0xe3cfa8, red: 0xd2453a, lens: 0xfff4d8, plate: 0xf7efd6 };
const BODY = () => ({ color: COLORS.body, seams: true });          // (car.mjs paints the seams on the body's look)

// ───────────── the shell ─────────────
// lower body: bumper to bumper, below the windows (z, width, height, bottom, roundness)
const LOWER = [
  [-1.95, 1.56, 0.62, 0.36, 3.0], [-1.86, 1.84, 0.8, 0.27, 3.6], [-1.5, 1.9, 0.82, 0.24, 4], [0.9, 1.9, 0.82, 0.24, 4],
  [1.45, 1.86, 0.7, 0.25, 3.8], [1.8, 1.74, 0.56, 0.28, 3.2], [1.95, 1.5, 0.4, 0.34, 2.8],
];
// the glasshouse: a round-topped bubble whose lower half sinks into the body
const GREEN = [
  [-1.92, 1.4, 0.62], [-1.84, 1.62, 0.92], [-1.6, 1.74, 1.08], [-1.0, 1.78, 1.15], [-0.3, 1.78, 1.16], [0.2, 1.76, 1.08],
  [0.6, 1.7, 0.84], [0.95, 1.6, 0.54], [1.12, 1.46, 0.38],
];
const GREEN_Y = 0.7, GREEN_N = 2.3;
const lower = () => loft(LOWER.map(([z, w, h, y, n]) => ({ z, w, h, y, n })));
const green = () => loft(GREEN.map(([z, w, h]) => ({ z, w, h, y: GREEN_Y, n: GREEN_N })), { blend: 0.08 });
/** The outer shell's two lofts (the lower body, the glasshouse blended onto it). */
export const SHELL = () => [lower(), green()];
/** The outer skin as a distance (the two lofts blended as in the body part): (x, y, z) => metres, < 0 inside. */
export function skin() {
  const [lo, gr] = SHELL(), k = gr.k, smin = (a, b) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  return (x, y, z) => smin(lo.d(x, y, z), gr.d(x, y, z));
}
// the cabin: the shell less its wall, from the hatch to the dashboard, above the floor
const cabin = () => [
  cut(loft([[-1.84, 1.6, 0.78], [-1.7, 1.74, 0.8], [0.6, 1.74, 0.8], [0.92, 1.6, 0.7]].map(([z, w, h]) => ({ z, w, h, y: C.floor, n: 4 })))),
  cut(loft(GREEN.filter(([z]) => z > -1.85 && z < 1.05).map(([z, w, h]) => ({ z: Math.min(z, 0.95), w: w - 2 * C.wall, h: h - 2 * C.wall, y: GREEN_Y + C.wall, n: GREEN_N })))),
];

// A flat outline drawn on the car's side, (z, y) with fillets, pushed across x from x0 to x1: a turned extrude whose
// outline is already in the car's coordinates, so it needs only sliding across x (a centre frame on `ref`).
function across(outline, x0, x1, ref, o = {}) {
  const e = turn(extrude(outline.map(([z, y, r]) => (r === undefined ? [-z, y] : [-z, y, r])), x1 - x0, o), [0, 90, 0]);
  if (!ref) return e;            // centred on x = 0
  const zs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  return at(e, point(ref, (x0 + x1) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2));
}
// a point inside a solid's box given in its own metres, as a centre frame
function point(s, x, y, z) {
  const p = [x, y, z].map((v, i) => (v - (s.lo[i] + s.hi[i]) / 2) / ((s.hi[i] - s.lo[i]) / 2));
  return s.center.at(...p);
}
// a band round the line from a to b (z, y), `t` either side of it: the cutter of a sloping window
function band({ a, b }, t = 0.15) {
  const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy), nz = dy / l * t, ny = -dz / l * t;
  return [[a[0] + nz, a[1] + ny], [b[0] + nz, b[1] + ny], [b[0] - nz, b[1] - ny], [a[0] - nz, a[1] - ny]];
}
const grow = (outline, g) => {          // an outline grown by g (about its centre: enough for a gap of a centimetre)
  const zs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]), cz = (Math.min(...zs) + Math.max(...zs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return outline.map(([z, y, r]) => [z + Math.sign(z - cz) * g, y + Math.sign(y - cy) * g, r]);
};
// The windscreen's cutters. Each A-pillar runs up the shell `pillar` ahead of the side window's front edge, keeping
// that depth up into the roof (a cutter of one width ate the pillar where the roof narrows). A cutter for each side
// is pushed along the shell's normal at the pillar, so it meets the skin square there (a cut that grazed the skin
// left a knife edge the 2 cm cells drew as a row of teeth); the middle is pushed straight back, so the roof's front
// edge (`top`) runs straight across.
function screenCutters(lo) {
  const f = skin(), S = C.screen, [[z0, y0], [z1, y1]] = C.frontWin;
  const half = (y, z) => { if (f(0, y, z) > 0) return 0; let a = 0, b = 1.3; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (f(m, y, z) < 0) a = m; else b = m; } return a; };
  const pts = [];                    // the pillar's front edge on the skin, foot to roof
  for (let y = S.foot; ; y += 0.04) {
    const z = z0 + (z1 - z0) * (y - y0) / (y1 - y0) + S.pillar, x = half(y, z);
    if (x < 0.3) break;
    pts.push([x, y, z]);
  }
  const [xt, yt] = pts.at(-1), o = { round: 0.04, blend: 0.05 };
  // the middle: seen from the front, 10 cm inside the pillars
  const mid = pts.map(([x, y]) => [Math.min(x - 0.1, 0.45), y]);
  const midOut = [...mid, [mid.at(-1)[0], 2.1], [-mid.at(-1)[0], 2.1], ...mid.map(([x, y]) => [-x, y]).reverse()];
  const m = at(extrude(midOut, S.front - S.top, o), point(lo, 0, (S.foot + 2.1) / 2, (S.front + S.top) / 2));
  // the sides: pushed along the way the skin faces at the middle of the pillar's run (in x-z)
  const [px, py, pz] = pts[pts.length >> 1], e = 1e-3, th = Math.atan2(f(px + e, py, pz) - f(px - e, py, pz), f(px, py, pz + e) - f(px, py, pz - e));
  const sn = Math.sin(th), cs = Math.cos(th), U = (x, z) => z * sn - x * cs;     // u: across that, toward the screen's middle
  const far = 3, outline = [...pts.map(([x, y, z]) => [-U(x, z), y]), [-U(xt, S.top), yt + 0.05, 0.06], [-U(xt, S.top), 2.1], [-far, 2.1], [-far, S.foot]];
  const w0 = 0.3, w1 = 1.6, wc = (w0 + w1) / 2;                                  // how far along the push (0 at x = z = 0): from the middle's cut outward
  const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const c = at(turn(extrude(outline, w1 - w0, o), [0, th * 180 / Math.PI, 0]), point(lo, wc * sn + mx * cs, my, wc * cs - mx * sn));
  return [cut(m), cut(c), mirror(c)];
}
// (cut with a 5 cm blend: the 2 cm cells draw a sharper edge as a row of teeth)
const windows = (lo) => [
  cut(across(C.frontWin, -1.1, 1.1, null, { blend: 0.05 })), cut(across(C.rearWin, -1.1, 1.1, null, { blend: 0.05 })),
  ...screenCutters(lo),
  cut(across(band(C.back), -C.back.half, C.back.half, null, { round: 0.08, blend: 0.03 })),
];

// nothing hangs below the body's floor pan (the wheel housings' round bottoms would)
const under = (lo) => cut(at(box(2.6, 0.6, 4.4, { round: 0.05 }), lo.bottom.move(0, -0.02, 0)));
function body() {
  const lo = lower(), gr = green();
  // wheel arches: a round lip at each, a housing inside the cabin, the well cut out of both
  const lips = [], wells = [];
  for (const z of [C.axleF, C.axleR]) {
    const F = C.fender, wing = at(ball(...F.r, { blend: 0.12 }), point(lo, F.x, F.y, z));
    const lip = at(torus(C.archR, 0.045, { arc: 196, blend: 0.03 }), point(lo, F.x + F.r[0] - 0.05, C.wheelR + 0.02, z), { turn: [0, 90, 0] });
    lips.push(wing, mirror(wing), lip, mirror(lip));
    const tub = at(turn(cyl(C.archR + C.wall, 0.42), [0, 0, 90]), point(lo, C.track - 0.06, C.wheelR + 0.02, z));
    const well = at(cut(turn(cyl(C.archR, 0.6), [0, 0, 90])), point(lo, C.track + 0.12, C.wheelR + 0.02, z));
    wells.push(tub, mirror(tub), well, mirror(well));
  }
  const hole = cut(across(grow(C.door, C.doorGap), C.doorIn, 1.2, lo, { blend: 0.03 }));
  const b = part('body', BODY(), lo, gr, ...lips, ...cabin(), ...wells.filter((s) => s.op === 'add'), ...wells.filter((s) => s.op === 'cut'), ...windows(lo), hole, under(lo));
  mark(b, 'nose', lo.front);
  mark(b, 'tail', lo.back);
  return { b, lo, gr };
}

// The driver's door: the shell cut to its outline, hinged on its front edge, opening outward.
function door() {
  const lo = lower();
  const d = part('door', BODY(), lo, green(), ...cabin(), ...windows(lo), keep(across(C.door, C.doorIn, 1.2, lo, { blend: 0.03 })));
  const [hz, hy] = C.door[0];
  hinge(d, point(lo, C.wid / 2 - 0.03, hy + 0.3, hz), 'y', [0, -68]);
  // a handle toward the back below the window, a mirror below the window's front corner (frames on the door's
  // shell: u up, v along the car)
  part('handle', { color: COLORS.cream, finish: 'metal' }, at(box(0.16, 0.035, 0.03, { round: 0.012 }), d.right.at(-0.2, -0.7).move(-0.012, 0, 0), { turn: [0, 90, 0] }));
  const stalk = at(box(0.11, 0.045, 0.06, { round: 0.02 }), d.right.at(-0.08, 0.66).move(-0.02, 0, 0));
  const head = at(ball(0.07, 0.065, 0.1, { blend: 0.03 }), stalk.right.move(-0.02, 0.03, 0));
  part('mirror', COLORS.cream, stalk, head);
  return d;
}
// the passenger's mirror: the driver's mirrored onto the other side (it hangs on nothing: a root)
function passengerMirror(d) {
  const m = d.kids.find((k) => k.part?.name === 'mirror').part;
  const c = mirror(m); c.name = 'mirror_r';
  return c;
}

// ───────────── wheels ─────────────
const TYRE = [[0, -C.tyreW / 2], [C.rimR, -C.tyreW / 2], [C.wheelR - 0.05, -C.tyreW / 2 - 0.004, 0.05], [C.wheelR, -C.tyreW / 2 + 0.05, 0.05],
  [C.wheelR, C.tyreW / 2 - 0.05, 0.05], [C.wheelR - 0.05, C.tyreW / 2 + 0.004, 0.05], [C.rimR, C.tyreW / 2], [0, C.tyreW / 2]];
// A wheel about its own y (the axle): a fat tyre, a cream hubcap with three bolts (so its turning shows: three, not
// five, so they do not seem to turn backward below 9 m/s at 24 frames a second), facing +y.
// The caller turns it so +y points out of the car.
function wheel(name) {
  const t = revolve(TYRE);
  const w = part(name, { color: COLORS.tyre, finish: 'rubber' }, t);
  spin(w, t.center, 'y');
  const cap = at(dome(C.rimR - 0.02, 0.07, { round: 0.03 }), t.top.move(0, -0.03, 0));
  const hub = at(cyl(0.05, 0.03), cap.top.move(0, -0.006, 0));
  part(name + '_cap', { color: COLORS.cream, finish: 'metal' }, cap);
  part(name + '_bolts', { color: COLORS.tyre, finish: 'metal' }, hub, ring(cap.top, C.bolts, 0.12, 90).map((f) => at(ball(0.017), f.move(0, -0.012, 0))));
  return w;
}
// side 1: the left wheels (+x), -1: the right. A front wheel hangs from a steering knuckle (a brake disc) that
// turns about y; both knuckles turn the same way for the same pose.
const out = (side) => ({ turn: [0, 0, -90 * side] });
function frontWheel(lo, side) {
  const disc = at(cyl(0.16, 0.04), point(lo, side * (C.track - 0.08), C.wheelR, C.axleF), out(side));
  const k = part(side > 0 ? 'steer_fl' : 'steer_fr', COLORS.tyre, disc);
  hinge(k, disc.center.move(0, 0.08, 0), 'y', [-40, 40]);          // (about the wheel's middle: steering does not push the tyre along)
  at(wheel(side > 0 ? 'wheel_fl' : 'wheel_fr'), disc.center.move(0, 0.08, 0));
  return k;
}
const rearWheel = (lo, side) => at(wheel(side > 0 ? 'wheel_rl' : 'wheel_rr'), point(lo, side * C.track, C.wheelR, C.axleR), out(side));

// ───────────── front and back ─────────────
// (a mirrored part hangs on nothing: these return the copies, to be built as roots; a copy and what hangs on it
// are renamed from _l to _r)
const right = (p) => { p.name = p.name.replace(/_l$/, '_r'); for (const k of p.kids) if (k.items) right(k); return p; };
function lamps(lo) {
  // big round headlights: a short pod in the body's colour standing out of the wing (the wing curves away under the
  // lamp: a flat lamp sunk into it broke into a crescent), a cream bezel round its face, a lens that lights up
  const [x, y, z] = C.lamp, a = C.lampTilt * Math.PI / 180, L = 0.3;
  const pod = at(turn(cyl(C.lampR, L, { round: 0.05 }), [90 - C.lampTilt, 0, 0]), point(lo, x, y - Math.sin(a) * L / 2, z - Math.cos(a) * L / 2));
  part('pod_l', COLORS.body, pod);
  part('bezel_l', { color: COLORS.cream, finish: 'metal' }, at(torus(C.lampR - 0.02, 0.028), pod.top.move(0, -0.028, 0), { turn: [90, 0, 0] }));
  part('headlight_l', { color: COLORS.lens, finish: 'glass' }, at(dome(C.lampR - 0.04, 0.05, { round: 0.02 }), pod.top.move(0, -0.01, 0)));
  // tail lights: tall rounded lenses on the back corners
  const tail = at(box(0.13, 0.28, 0.06, { round: 0.028, bulge: 0.01 }), lo.back.at(0.78, 0.3).move(0, 0, 0.02));
  part('taillight_l', { color: COLORS.red, finish: 'glass' }, tail);
  return [mirror(pod.part), mirror(tail.part)].map((p) => right(p));
}
function bumpers(lo) {
  const fb = at(box(1.84, 0.17, 0.2, { round: 0.08, bulge: 0.02 }), lo.front.at(0, -0.62).move(0, 0, -0.1));
  const bf = part('bumper_f', { color: COLORS.cream, finish: 'rubber' }, fb);
  part('plate', COLORS.plate, at(box(0.4, 0.11, 0.03, { round: 0.012 }), fb.front.move(0, 0, -0.008)));
  part('grille', COLORS.tyre, at(box(0.62, 0.1, 0.06, { round: 0.028 }), lo.front.at(0, -0.12).move(0, 0, -0.04)));
  const br = mirror(bf, 'z'); br.name = 'bumper_r';
  return [br];
}

// ───────────── inside ─────────────
function inside(lo) {
  part('dash', COLORS.dash, at(box(1.66, 0.3, 0.42, { round: 0.1, bulge: 0.03 }), point(lo, 0, 0.92, 0.78)));
  // the steering wheel faces the driver: its axis leans up toward him by wheelTilt; the column runs from it down
  // into the dashboard
  const [sx, sy, sz] = C.wheel, a = C.wheelTilt * Math.PI / 180, ax = [0, -Math.sin(a), Math.cos(a)], colL = 0.44;
  part('column', COLORS.tyre, at(cyl(0.035, colL), point(lo, sx, sy + ax[1] * colL / 2, sz + ax[2] * colL / 2), { turn: [90 + C.wheelTilt, 0, 0] }));
  const rim = at(torus(C.wheelRad, 0.022), point(lo, sx, sy, sz), { turn: [C.wheelTilt, 0, 0] });
  const hub = at(cyl(0.06, 0.06), rim.center.move(0, 0, -0.02), { turn: [90, 0, 0] });
  const spokes = [0, 180, 270].map((d) => at(box(0.03, C.wheelRad, 0.018, { round: 0.008 }),
    rim.center.move(Math.cos(d * Math.PI / 180) * C.wheelRad / 2, Math.sin(d * Math.PI / 180) * C.wheelRad / 2, 0), { turn: [0, 0, d - 90] }));
  spin(part('steering', COLORS.tyre, rim, hub, spokes), rim.center, ax);
  // seats: a cushion from the floor up to the seat, a back leaning 14 degrees, a headrest; two in front, a bench behind
  const seat = (name, x, z, w) => {
    const y = C.seat[1];
    const c = at(box(w, y - C.floor, 0.52, { round: 0.06, bulge: 0.025 }), point(lo, x, (C.floor + y) / 2, z));
    const back = at(box(w, 0.95, 0.15, { round: 0.06, bulge: 0.03 }), c.back.at(0, -1).move(0, 0, 0.06), { flush: true, turn: [-14, 0, 0] });
    part(name, COLORS.seat, c, back);
    if (w < 0.8) part(name + '_rest', COLORS.seat, at(box(0.26, 0.17, 0.1, { round: 0.04 }), back.top.move(0, -0.02, 0)));
  };
  seat('seat_driver', C.seat[0], C.seat[2] + 0.02, 0.52);
  seat('seat_passenger', -C.seat[0], C.seat[2] + 0.02, 0.52);
  seat('seat_rear', 0, -1.28, 1.3);
}

/** The car's parts, as roots for build(): the body (everything hangs from it), the door, the mirrored copies. */
export default function carShape() {
  const { b, lo } = body();
  const d = door();
  const pm = passengerMirror(d);
  frontWheel(lo, 1); frontWheel(lo, -1); rearWheel(lo, 1); rearWheel(lo, -1);
  inside(lo);
  const copies = [...lamps(lo), ...bumpers(lo)];
  mark(b, 'seat', point(lo, ...C.seat));
  return [b, d, pm, ...copies];
}
