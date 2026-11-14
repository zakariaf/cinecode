// A wingback armchair in mustard cloth: a deep seat between rolled arms, a tall back with wings, a plump seat
// cushion and a leaning back cushion, on four short turned wooden feet.
import { box, cyl, part, at, grid, mirror } from '../shape.mjs';

const D = {
  W: 0.9, depth: 0.86, backT: 0.2,          // overall width, depth (arms to front), the back's thickness
  baseH: 0.3, armW: 0.17, armH: 0.6, rollR: 0.1, backH: 1.08,
  cushT: 0.14, pillowH: 0.5, pillowT: 0.16, footH: 0.09, footR: 0.032,
};
const seatW = D.W - 2 * D.armW, seatD = D.depth - D.backT;
const CLOTH = { color: 0xd39a3c, finish: 'cloth' }, CUSHION = { color: 0xe0aa4e, finish: 'cloth' };

function frame() {
  const base = box(seatW, D.baseH, seatD, { round: 0.04 });
  const arm = at(box(D.armW, D.armH - D.rollR, seatD, { round: 0.05 }), base.left.at(-1, 0), { flush: true });
  const roll = at(cyl(D.rollR, seatD + 0.02, { round: 0.04, blend: 0.05 }), arm.top, { turn: [90, 0, 0] });      // the arm's rolled top
  const back = at(box(D.W, D.backH, D.backT, { round: 0.06, bulge: 0.02 }), base.back.at(0, -1), { flush: true });
  const wing = at(box(D.armW, D.backH - D.armH, 0.24, { round: 0.06, taper: -0.15, blend: 0.08 }), back.front.at(-1, 1), { flush: true });
  return part('frame', CLOTH, base, arm, roll, back, wing, mirror(arm), mirror(roll), mirror(wing));
}

export default function armchair() {
  const f = frame();
  const seat = at(box(seatW - 0.01, D.cushT, seatD - 0.01, { round: 0.06, bulge: 0.025 }), f.top.at(0, 0));
  part('cushion', CUSHION, seat);
  part('pillow', CUSHION, at(box(seatW - 0.03, D.pillowH, D.pillowT, { round: 0.07, bulge: 0.03 }), seat.top.at(0, -1), { flush: true, turn: [-10, 0, 0] }));
  part('feet', { color: 0x6b4630, finish: 'wood' }, grid(f.bottom, 2, 2, 0.84).map((p) => at(cyl(D.footR, D.footH, { taper: -0.3 }), p)));
  return f;
}
