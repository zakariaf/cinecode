// A mailbox on a wooden post: a round-topped tin box, open at the front behind a flap hinged at its foot
// (joint "flap", pose 0 shut, 1 fully open), a knob on the flap, and a red flag on the right side (joint "flag",
// pose 0 down along the box, 1 up).
import { box, cyl, ball, extrude, part, at, cut, hinge, mark } from '../shape.mjs';

const D = {
  postW: 0.09, postH: 1.0,
  boxW: 0.22, boxH: 0.25, boxL: 0.46, wall: 0.015,
  flapT: 0.018, flagL: 0.26, flagW: 0.12, flagH: 0.08,
};
// the box's end outline: flat bottom, round top (each top corner rounded by half the width)
const arch = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h, w / 2], [-w / 2, h, w / 2]];

function post() {
  const p = box(D.postW, D.postH, D.postW, { taper: 0.08 });
  const board = at(box(D.postW * 1.6, 0.03, D.boxL * 0.7), p.top);    // a board the box sits on
  return mark(part('post', { color: 0x8a5a3a, finish: 'wood' }, p, board), 'shelf', board.top);
}

function tin() {
  const shell = extrude(arch(D.boxW, D.boxH), D.boxL, { hollow: D.wall });
  const opening = at(cut(box(D.boxW * 2, D.boxH * 2, 0.1)), shell.front.move(0, 0, -D.wall * 1.5));   // takes the front end off
  // the mouth is the shell's own front (a frame on the part would see through the opening to the back wall)
  return mark(part('box', 0x4f86a8, shell, opening), 'mouth', shell.front);
}

function flap() {
  const f = extrude(arch(D.boxW, D.boxH), D.flapT);
  const p = part('flap', 0x4f86a8, f);
  hinge(p, f.bottom.at(0, -1), 'x', [0, 100]);                          // along its foot; opens forward and down
  mark(p, 'handle', f.front.at(0, 0.55));
  return p;
}

function flag() {
  const arm = box(0.016, D.flagL, 0.012);
  const plate = at(box(0.006, D.flagH, D.flagW), arm.right.at(0.75, 0.5));
  const p = part('flag', 0xd2493a, arm, plate);
  hinge(p, arm.bottom, 'x', [-90, 0]);                                  // pose 0: lying back along the box
  return p;
}

export default function mailbox() {
  const p = post();
  const b = at(tin(), p.shelf);
  const f = at(flap(), b.mouth);
  part('knob', { color: 0xc9a24a, finish: 'metal' }, at(ball(0.014), f.handle));
  at(flag(), b.right.at(0, 0.3));      // on the flat of the side (higher up, the ray would meet the round roof)
  return p;
}
