// A wooden kitchen chair: a soft seat on four splayed, tapered legs, and a leaning back of two posts, a bowed
// splat and a top rail.
import { box, cyl, part, at, grid, mirror } from '../shape.mjs';

const D = {
  seatW: 0.44, seatD: 0.42, seatT: 0.045, seatH: 0.46,      // the seat's top is seatH above the floor
  legR: 0.021, splay: 4,                                     // degrees each leg leans out
  postR: 0.02, splatW: 0.3, splatH: 0.26, splatT: 0.022, railH: 0.07, railT: 0.032, lean: 9,
};
const WOOD = { color: 0xb07a46, finish: 'wood' };

function seat() {
  const top = box(D.seatW, D.seatT, D.seatD, { round: 0.016 });
  // thicker at the seat, thinner at the floor; each leg leans out toward its own corner
  const legs = grid(top.bottom, 2, 2, 0.7).map((f) =>
    at(cyl(D.legR, D.seatH - D.seatT, { taper: -0.35 }), f, { turn: [-Math.sign(f.v) * D.splay, 0, Math.sign(f.u) * D.splay] }));
  return part('seat', WOOD, top, legs);
}

function back() {
  const splat = box(D.splatW, D.splatH, D.splatT, { bulge: 0.008 });
  const post = at(cyl(D.postR, D.splatH + 2 * D.railH, { taper: 0.15 }), splat.left);
  const rail = at(box(D.splatW + 4 * D.postR + 0.03, D.railH, D.railT, { bulge: 0.006 }), splat.top);
  return part('back', WOOD, splat, post, mirror(post), rail);
}

export default function chair() {
  const s = seat();
  at(back(), s.top.at(0, -0.82), { turn: [-D.lean, 0, 0] });
  return s;
}
