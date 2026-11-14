// What lies over the picture of a 3D film: the opening and end cards, title beats, burned-in captions and fades.
// All of it is drawn by the film's own 2D code (engine/film/text.mjs drawCard / drawTitle / drawCaption, grade.mjs
// black, frame.mjs captionLayouts) on a canvas that already holds the 3D frame, so it looks as it does in a 2D film.
// What differs is where the words go: clear of the faces and hands the 3D camera shows (the actors' projected joints,
// marksAt). A caption takes the bottom band unless that covers more of them than the top one (the film's own
// layoutCaption, given these boxes); a title beat goes to its place ("place", or 0.38 of the frame's height) or, if
// that covers a face or a hand, to the nearest of the other title places that does not. Each is placed once for the
// whole time it is up (sampled every sixth of a second), so it never jumps.
import { createCanvas } from '@napi-rs/canvas';
import { drawCaption, drawTitle, drawCard, titleBlock, TITLE_PLACES } from '../film/text.mjs';
import { captionLayouts, fadeAmount, START_FADE, END_FADE, CARD_DISSOLVE } from '../film/frame.mjs';
import { black } from '../film/grade.mjs';
import { clamp, ease } from '../film/util.mjs';
import { Vector3 } from 'three/webgpu';
import { project } from './compile.mjs';

const V3 = (x, y, z) => new Vector3(x, y, z);


const cardAt = (plan, t) => plan.cards.find(c => t >= c.t0 && t < c.t1);
// How much of a card covers the picture: an opening card dissolves into the first shot over its last second, the
// last shot into the end card over its first.
const cardCover = (plan, card, t) => (!plan.shots.length ? 1 : card.kind === 'open' ? 1 - ease((t - (card.t1 - CARD_DISSOLVE)) / CARD_DISSOLVE) : ease((t - card.t0) / CARD_DISSOLVE));

/** The film time whose 3D picture lies under the frame at t, or null when a card covers all of it. */
export function pictureTime(plan, t) {
  const card = cardAt(plan, t);
  if (!card) return t;
  if (cardCover(plan, card, t) >= 1) return null;
  return card.kind === 'open' ? plan.shots[0].t0 : card.t0 - 1 / plan.fps;
}

// The faces and hands in the picture at film time t (built: the film's built 3D scene, which this poses): [{ id, kind, box:
// [x0, y0, x1, y1] in pixels, z: metres from the lens }]: a box round each head (its size: the rig's head) and round each hand with its fingers (0.32 m).
export function marksAt(plan, built, t) {
  const W = plan.W, H = plan.H, sc = built.scenes.find(s => t < s.t1) ?? built.scenes.at(-1), tt = clamp(t, sc.t0, sc.t1) - sc.t0;
  sc.pose(tt);
  const cam = sc.camera(tt), px = p => { const [x, y] = project(cam, p, W / H); return [(x + 1) / 2 * W, (1 - y) / 2 * H]; };
  const box = (id, kind, p, r) => { const [x, y] = px(p), s = Math.abs(px(p.clone().setY(p.y + r))[1] - y); return { id, kind, box: [x - s, y - s, x + s, y + s], z: p.distanceTo(V3(...cam.pos)) }; };
  const out = [];
  for (const [id, D] of sc.drivers) {
    if (!D.face || !D.visibleAt(tt)) continue;
    const P = D.points();
    out.push(box(id, 'head', P.head, 0.6 * D.R.head), ...P.hands.map(h => box(id, 'hand', h, 0.16)));
  }
  return out;
}
export const hit = (b, marks) => marks.reduce((a, { box: q }) => a + Math.max(0, Math.min(b[2], q[2]) - Math.max(b[0], q[0])) * Math.max(0, Math.min(b[3], q[3]) - Math.max(b[1], q[1])), 0);
// the times a caption or title is up, every sixth of a second, where the picture shows (not under a full card)
const upAt = (plan, c) => { const ts = []; for (let t = c.t0; t < c.t1; t += 1 / 6) if (pictureTime(plan, t) === t) ts.push(t); return ts; };

let scratch = null;
/**
 * What lies over the picture of a 3D film (plan: compiled; built: its scene as openScene built it):
 *   draw(ctx, t)  draws it at film time t onto ctx (a plan.W × plan.H canvas holding the frame of pictureTime)
 *   words(t)      → the boxes the titles and captions up at t take ([{ text, box }], pixels), and over(t) those of them
 *                 that cover a face or a hand there (for lint)
 *   bare(t)       → true when nothing lies over the picture at t
 */
export function createOverlay(plan, built) {
  const W = plan.W, H = plan.H, marks = new Map(), at = t => { if (!marks.has(t)) marks.set(t, marksAt(plan, built, t)); return marks.get(t); };
  // the captions, by the film's own schedule, given the faces and hands to keep clear of
  const capPlan = Object.assign(Object.create(plan), { actorsAt: () => [], facesAt: (p, t) => at(t) });
  const titles = new Map();
  const titleY = c => {
    if (titles.has(c)) return titles.get(c);
    const p = c.place, want = typeof p === 'number' ? clamp(p, 0.05, 0.95) : TITLE_PLACES[p] ?? 0.38, B = titleBlock(c, W, H), ts = upAt(plan, c);
    const box = y => [W / 2 - B.w / 2, y - B.above, W / 2 + B.w / 2, y + B.below];
    const cost = y => ts.reduce((a, t) => a + hit(box(y), at(t)), 0);
    const ys = [want, ...[...new Set(Object.values(TITLE_PLACES))].filter(y => y !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))].map(y => y * H);
    const y = ys.find(y => cost(y) === 0) ?? ys.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    titles.set(c, { y, box: box(y) });
    return titles.get(c);
  };
  const titlesAt = (t, scene) => plan.captions.filter(c => c.style === 'title' && c.burn && t >= c.t0 && t < c.t1 && plan.shotAt(c.t0)?.scene === scene);
  // title beats and fades over the scene's picture at t
  const overScene = (ctx, t) => {
    const shot = plan.shotAt(t) ?? plan.shots[plan.shots.length - 1];
    for (const c of titlesAt(t, shot.scene)) drawTitle(ctx, c, t, W, H, titleY(c).y, W / 2);
    black(ctx, fadeAmount(plan, shot, t), W, H);
  };
  const words = t => {
    if (cardAt(plan, t) || !plan.shots.length) return [];
    const shot = plan.shotAt(t) ?? plan.shots.at(-1), caps = plan.captionMode !== 'none' ? captionLayouts(capPlan, t) : [];
    return [...titlesAt(t, shot.scene).map(c => ({ text: c.text, box: titleY(c).box })), ...caps.map(({ c, L }) => ({ text: c.text, box: L.box }))];
  };
  return {
    words,
    over: t => words(t).filter(w => hit(w.box, at(t)) > 0),
    // nothing lies over the picture at t: draw(ctx, t) would leave it as it is
    bare(t) {
      if (cardAt(plan, t)) return false;
      if (!plan.shots.length) return true;
      const shot = plan.shotAt(t) ?? plan.shots.at(-1);
      return !(fadeAmount(plan, shot, t) > 0) && !titlesAt(t, shot.scene).length && (plan.captionMode === 'none' || !captionLayouts(capPlan, t).length);
    },
    draw(ctx, t) {
      const card = cardAt(plan, t);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      try {
        if (card) {
          const a = cardCover(plan, card, t);
          if (a >= 1) drawCard(ctx, card, t, W, H);
          else {
            overScene(ctx, pictureTime(plan, t));
            if (scratch?.width !== W || scratch.height !== H) scratch = createCanvas(W, H);
            drawCard(scratch.getContext('2d'), card, t, W, H);
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.drawImage(scratch, 0, 0); ctx.globalAlpha = 1;
          }
          black(ctx, card.kind === 'open' ? 1 - ease(t / START_FADE) : ease((t - (card.t1 - END_FADE)) / END_FADE), W, H);
          return;
        }
        if (!plan.shots.length) return;
        overScene(ctx, t);
        if (plan.captionMode !== 'none') for (const { L, alpha } of captionLayouts(capPlan, t)) drawCaption(ctx, L, alpha, W, H);
      } finally { ctx.restore(); }
    },
  };
}
