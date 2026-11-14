// The hard pieces of the house "home", written with the shape kit: the front of the entrance wing with its door on a
// hinge (joint "door": 0 shut, 1 open 100 degrees into the hall), the window seat, the wall lantern, the chimney and
// the doorstep. Each is one function that returns a root part; home.mjs builds and places them.
import { box, cyl, ball, extrude, part, at, cut, hinge, mark, grid } from '../shape.mjs';

export const D = {
  wingW: 2.08, wingH: 2.85, wall: 0.24,              // the entrance wing's front wall
  doorW: 0.98, doorH: 2.18, doorT: 0.055, lap: 0.03,   // the doorway's leaf size; the leaf laps the opening by `lap` (it hangs behind the wall)
  casing: 0.09, casingT: 0.05,                        // the trim round the doorway
  seatW: 1.86, seatH: 0.3, seatD: 0.46, cushT: 0.08,  // window seat: base, cushion
  stepW: 1.4, stepH: 0.05, stepD: 0.6,
};
// an arch: straight sides, the top a half circle
const arch = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h, w / 2], [-w / 2, h, w / 2]];
const DOOR = { color: 0xc8553f }, TRIM = { color: 0xf3ead8 }, BRASS = { color: 0xc9a24a, finish: 'metal' }, IRON = { color: 0x3b3640, finish: 'metal' };

// The leaf is hung behind the wall, against its inner face, and a little bigger than the doorway all round (lap): an
// arched leaf hung inside the arch's depth has to turn its top corner through the arch as it swings (it did, a notch
// at the top of the hinge side); behind the wall, nothing of it is ever inside the wall.
function leaf() {
  const d = extrude(arch(D.doorW + 2 * D.lap, D.doorH + D.lap), D.doorT);
  // two sunk panels below, the round window above
  const panels = grid(d.front, 2, 1, 0.45).map((f) => cut(at(box(0.3, 0.72, 0.05, { round: 0.02 }), d.front.at(f.u, -0.5).move(0, 0, -0.038))));
  const hole = cut(at(extrude([[-0.15, 0, 0.15], [0.15, 0, 0.15], [0.15, 0.3, 0.15], [-0.15, 0.3, 0.15]], 0.2), d.center.at(0, 0.45)));
  const p = part('door', DOOR, d, panels, hole);
  hinge(p, d.left.at(0, 0), 'y', [0, 100]);          // opens into the hall (the group is turned to face the street)
  mark(p, 'knob', d.front.at(0.78, -0.08));
  mark(p, 'knobIn', d.back.at(0.78, -0.08));
  mark(p, 'slot', d.front.at(0, -0.12));
  mark(p, 'window', d.center.at(0, 0.45));
  return p;
}

/** The front of the entrance wing: the wall with its arched doorway, the trim round it, and the door. */
export function wingFront() {
  const w = box(D.wingW, D.wingH, D.wall, { round: 0.03 });
  // the doorway: from below the floor up to the arch, through the wall
  const hole = cut(at(extrude(arch(D.doorW + 0.02, D.doorH + 0.12), D.wall * 3), w.center.at(0, (D.doorH / 2 - 0.05) / (D.wingH / 2) - 1)));
  const root = part('wing', 0xf0dcb4, w, hole);
  const cw = D.doorW + 0.02 + 2 * D.casing, ch = D.doorH + 0.01 + D.casing;
  const casing = extrude(arch(cw, ch), D.casingT);
  part('casing', TRIM, at(casing, w.front.at(0, ch / D.wingH - 1)), cut(at(extrude(arch(D.doorW + 0.02, D.doorH + 0.01), 0.2), casing.center.at(0, -1 + (D.doorH + 0.01) / ch))));
  const zIn = -(D.wall / 2 + D.doorT / 2 + 0.004) / (D.wall / 2);      // (behind the wall's inner face, 4 mm off it)
  const door = at(leaf(), w.center.at(0, ((D.doorH + D.lap) / 2 + 0.005) / (D.wingH / 2) - 1, zIn));
  part('knob', BRASS, at(ball(0.032), door.knob.move(0, 0, -0.004)));
  part('knobIn', BRASS, at(ball(0.032), door.knobIn.move(0, 0, 0.004)));
  part('slot', BRASS, at(box(0.24, 0.05, 0.014, { round: 0.005 }), door.slot.move(0, 0, -0.003)));
  part('glass', { color: 0x9fb7c8, finish: 'glass' }, at(box(0.3, 0.3, 0.02, { round: 0.009 }), door.window));
  return root;
}

/** The window seat: a panelled base with a plump cushion and two pillows at its ends. */
export function windowSeat() {
  const b = box(D.seatW, D.seatH, D.seatD, { round: 0.02 });
  const panels = grid(b.front, 3, 1, 0.66).map((f) => cut(at(box(0.48, 0.18, 0.05, { round: 0.02 }), b.front.at(f.u, 0).move(0, 0, -0.038))));
  const root = part('seat', TRIM, b, panels);
  const cush = at(box(D.seatW - 0.02, D.cushT, D.seatD - 0.02, { round: 0.03, bulge: 0.012 }), b.top);
  part('cushion', { color: 0xd9a441, finish: 'cloth' }, cush);
  // (the teal one sits about 0.4 m in from the left end: at the end it stood right behind the head of a child sitting
  // on the floor in front of the seat's left end, and read as a cap on him)
  part('pillow', { color: 0x3f8c8e, finish: 'cloth' }, at(box(0.36, 0.32, 0.12, { round: 0.05, bulge: 0.025 }), cush.top.at(-0.36, -0.3).move(0, -0.01, 0), { turn: [-12, 80, 0] }));
  part('pillow', { color: 0xc9654a, finish: 'cloth' }, at(box(0.34, 0.3, 0.12, { round: 0.05, bulge: 0.025 }), cush.top.at(0.83, -0.25).move(0, -0.01, 0), { turn: [-10, -75, 0] }));
  return root;
}

/** A wall lantern: a back plate, an arm, and a little iron lantern on it with glass that can glow (part "glass"). */
export function lantern() {
  const plate = box(0.1, 0.2, 0.02, { round: 0.008 });
  const root = part('plate', IRON, plate);
  const arm = at(box(0.025, 0.025, 0.2, { round: 0.008 }), plate.front.at(0, -0.55));
  part('arm', IRON, arm);
  const g = at(box(0.13, 0.19, 0.13, { round: 0.01 }), arm.top.at(0, 0.62));
  part('glass', { color: 0xffe2a8, finish: 'glass' }, g);
  const posts = grid(g.top, 2, 2, 0.95).map((f) => at(box(0.016, 0.2, 0.016, { round: 0.006 }), g.center.at(f.u, 0, f.v)));
  const base = at(box(0.17, 0.025, 0.17, { round: 0.008 }), g.bottom, { turn: [180, 0, 0] });
  part('cage', IRON, posts, base);
  const cap = at(cyl(0.12, 0.08, { taper: 0.75, round: 0.01 }), g.top);
  part('cap', IRON, cap, at(ball(0.018), cap.top.move(0, -0.004, 0)));
  return root;
}

/** The chimney: brick, a little wider at the foot, with a cap and two pots. */
export function chimney() {
  const c = box(0.66, 2.6, 0.66, { round: 0.04, bulge: 0.02, taper: 0.06 });
  const root = part('chimney', 0xb06a52, c);
  const capS = at(box(0.8, 0.12, 0.8, { round: 0.04 }), c.top);
  part('cap', 0xd9cbb8, capS);
  part('pots', 0xc46f4a, grid(capS.top, 2, 1, 0.45).map((f) => at(cyl(0.085, 0.34, { taper: 0.18, round: 0.02 }), f)));
  return root;
}

/** The doorstep: a broad, low stone. */
export function doorstep() {
  return part('step', 0xc9bfb3, box(D.stepW, D.stepH, D.stepD, { round: 0.02, bulge: 0.006 }));
}
