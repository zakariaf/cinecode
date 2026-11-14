// What `cinecode lint` checks on a 3D film, with no GPU: the film is built (every plan laid, every camera solved) and
// posed, never drawn.
//   build              a storyboard asks for what cannot be played as written (the message names the shot and beat);
//                      anything else thrown while the scene is built is a fault of the engine and is thrown on, with its
//                      stack (compile.mjs engineFault)
//   feet-slide         a planted foot of a two-legged actor moves (more than 0.01 mm between two frames)
//   paw-slide          a planted paw of a four-legged actor moves (more than 2 mm)
//   head-out-of-frame  the head of an actor the shot's camera is on is outside the picture (a pan or a push-in to
//                      other subjects lets go of the ones it leaves: compile.mjs framed)
//   words-over-face    (warning) a title or caption covers a face or a hand where no place clear of them was found
//   subject-hidden     (warning) the face of an actor the shot is on is mostly behind another actor's head, nearer the lens
//   collide            two actors' bodies go into each other (checks.mjs overlap: deeper than OVERLAP_GATE)
//   pop, hold, over-reach, through-body
//                      the motion gates (checks.mjs motion, GATES): a joint's velocity jumps (a snap or a flip), a joint
//                      stays dead still on screen, a limb is asked past its length, a hand or forearm goes into the body
//   turn-speed         a head, chest or hips turns faster than checks.mjs TURN_GATE over a frame (it smears)
//   door-sweep         a door swings through an actor's body (the front door, a car's door: checks.mjs doorSweep,
//                      deeper than DOOR_GATE while it moves)
//   door-brush         (warning) a moving door passes within DOOR_NEAR of a body: on screen it reads as hitting it
//   waits              (warning) an action starts later than its beat says: its actor is still busy with the one before
// → { errors, warnings, kept } as engine/lint/lint.mjs lintPlan gives them ({ rule, shot, t, message }).
import { openScene } from './index.mjs';
import { compileScene, project, StoryError, engineFault } from './compile.mjs';
import { createOverlay, marksAt, hit as covers } from './overlay.mjs';
import { feetSlide, pawSlide, motion, overlap, doorSweep, sceneSource, GATES, TURN_GATE, OVERLAP_GATE, DOOR_GATE, DOOR_NEAR } from './checks.mjs';

export async function lintFilm(plan) {
  // (the plan's own warnings: an action that waits for its actor's one before)
  const errors = [], warnings = (plan.warnings ?? []).map(message => ({ rule: /\bwaits\b/.test(message) ? 'waits' : 'plan', shot: /^shot (\S+):/.exec(message)?.[1], message }));
  let src;
  // (every scene staged and every camera solved here, where a fault is caught: a render does it as it goes)
  try { src = await openScene(compileScene(plan), { width: plan.W, height: plan.H }); for (const sc of src.built.scenes) for (const s of sc.shots) s.camera(s.t0 - sc.t0); }
  catch (e) { if (e instanceof StoryError) return { errors: [{ rule: 'build', message: e.message }], warnings, kept: [] }; throw engineFault(e); }
  const built = src.built, over = createOverlay(plan, built), covered = new Map();
  for (const sc of built.scenes) {
    const one = sceneSource(src, sc), shotAt = t => sc.shots.find(s => t + sc.t0 < s.t1) ?? sc.shots.at(-1);
    for (const [id, D] of sc.drivers) {
      if (!D.ch) continue;   // (a ball, a car: no feet)
      const r = (D.kind === 'biped' ? feetSlide : pawSlide)(one, id), limit = D.kind === 'biped' ? 1e-5 : 2e-3;
      if (r.worst > limit) errors.push({ rule: D.kind === 'biped' ? 'feet-slide' : 'paw-slide', shot: shotAt(r.at).id, t: r.at + sc.t0, message: `${id}: a planted ${D.kind === 'biped' ? 'foot' : 'paw'} slides ${(r.worst * 1000).toFixed(2)} mm in one frame` });
    }
    // (the motion gates, 240 poses a second as check-motion and the tests measure them)
    for (const [id, m] of Object.entries(motion(one))) {
      const E = (rule, o, message) => errors.push({ rule, shot: shotAt(o.at).id, t: o.at + sc.t0, message: `${id}: ${message}` });
      if (!(m.pops.worst < GATES.pops)) E('pop', m.pops, `the ${m.pops.joint} jumps ${m.pops.worst.toFixed(1)} m/s in 1/240 s (more than ${GATES.pops}): a snap or a flip; give the action more time or room`);
      if (m.holds.worst >= GATES.holds) E('hold', m.holds, `the ${m.holds.joint} stays dead still for ${m.holds.worst.toFixed(2)} s on screen (${(GATES.holds).toFixed(2)} at most): it reads frozen`);
      if (m.reach.worst >= GATES.reach) E('over-reach', m.reach, `the ${m.reach.limb} is asked ${(m.reach.worst * 1000).toFixed(0)} mm past its length: the mark is out of reach of the step`);
      if (m.through?.worst >= GATES.through) E('through-body', m.through, `the ${m.through.joint} goes ${(m.through.worst * 1000).toFixed(0)} mm into the body`);
      if (m.turns.worst > TURN_GATE) E('turn-speed', m.turns, `the ${m.turns.joint} turns at ${m.turns.worst.toFixed(1)} rad/s (more than ${TURN_GATE}): it smears; give the turn more time`);
    }
    for (const p of Object.values(overlap(one).pairs)) if (p.worst > OVERLAP_GATE)
      errors.push({ rule: 'collide', shot: shotAt(p.at).id, t: p.at + sc.t0, message: `${p.a} and ${p.b} pass through each other (${p.a}'s ${p.partA} ${(p.worst * 100).toFixed(0)} cm into ${p.b}'s ${p.partB}): give one of them another place or time` });
    for (const shot of sc.shots) {
      // (the part of the place the shot's camera frames: its area's)
      const inside = ([x, z]) => x >= shot.stage.x0 && x <= shot.stage.x1 && z >= shot.stage.z0 && z <= shot.stage.z1;
      const out = new Map(), hidden = new Map();
      for (let t = shot.t0 - sc.t0; t < shot.t1 - sc.t0 - 1e-6; t += 1 / 6) {
        sc.pose(t);
        const cam = shot.camera(t);
        for (const id of shot.framed(t)) {
          const D = sc.drivers.get(id), head = D.face && D.visibleAt(t) && inside(D.at(t)) ? D.points().head : null;
          if (!head) continue;
          const [x, y] = project(cam, head, plan.W / plan.H);
          if (Math.abs(x) > 1 || Math.abs(y) > 1) out.set(id, [...(out.get(id) ?? []), t + sc.t0]);
        }
        const marks = marksAt(plan, built, t + sc.t0), heads = marks.filter(m => m.kind === 'head');
        for (const m of heads) {
          const b = m.box, area = (b[2] - b[0]) * (b[3] - b[1]);
          if (shot.framed(t).includes(m.id) && !hidden.has(m.id) && covers(b, heads.filter(o => o.id !== m.id && o.z < m.z)) > 0.5 * area) hidden.set(m.id, { rule: 'subject-hidden', shot: shot.id, t: t + sc.t0, message: `${m.id}'s face is behind another actor from ${(t + sc.t0 - shot.t0).toFixed(1)} s into the shot: move one of them, or frame it from another angle` });
        }
        for (const w of over.over(t + sc.t0)) if (!covered.has(w.text)) covered.set(w.text, { rule: 'words-over-face', shot: shot.id, t: t + sc.t0, message: `"${w.text}" covers a face or a hand from ${(t + sc.t0 - shot.t0).toFixed(1)} s into the shot, and no place clear of them was found: shorten it, move it or reframe` });
      }
      warnings.push(...hidden.values());
      for (const [id, ts] of out) errors.push({ rule: 'head-out-of-frame', shot: shot.id, t: ts[0], message: `${id}'s head is outside the picture (${ts.length} of the shot's sixths of a second, from ${(ts[0] - shot.t0).toFixed(1)} s in)` });
    }
  }
  // (the doors, over the whole film in its own time)
  for (const d of doorSweep(src)) {
    const sc = built.scenes.find(s => d.at < s.t1) ?? built.scenes.at(-1), shot = sc.shots.find(s => d.at < s.t1) ?? sc.shots.at(-1), at = `${(d.at - shot.t0).toFixed(2)} s into the shot`;
    if (d.worst > DOOR_GATE) errors.push({ rule: 'door-sweep', shot: shot.id, t: d.at, message: `${d.door} swings through ${d.who}'s ${d.part} (${(d.worst * 100).toFixed(0)} cm deep) ${at}: stand ${d.who} clear of its swing, or move the door when ${d.who} has passed` });
    else warnings.push({ rule: 'door-brush', shot: shot.id, t: d.at, message: `${d.door} passes within ${(DOOR_NEAR * 100).toFixed(0)} cm of ${d.who}'s ${d.part} ${at}: on screen it reads as hitting it; give ${d.who} more room` });
  }
  warnings.push(...covered.values());
  return { errors, warnings, kept: [] };
}
