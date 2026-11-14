// The lint rules (the report's rule table) and a shot's lint block, with no imports, so the film validator (check)
// reads them too (engine/film/validate.mjs): lint.mjs re-exports both.
//   RULES: { rule: { severity, catches, fix } }
//   allowProblems(film) → [{ path, message }]: what is wrong with each shot's "lint": { "allow", "note" } block

// The flip rule (below) is written but off: the shipped films fail it until the motion seams are fixed (PLAN-2D item
// 1.1, package P1). true: lint runs it on every film and lists it in the rule table; off, it runs only when named
// (lintPlan(plan, { rules: ['flip'] })).
export const FLIP_RULE = false;

// Each rule: its severity, what it catches and how to fix it (the report's rule table; lint.json "fixes").
export const RULES = {
  floating: { severity: 'error', catches: 'contact point not on the ground, an anchor surface or a perch, and not airborne by action',
    fix: 'send the actor to an anchor or a point inside the walk region (see the set sheet); don\'t hold a pose or lift that leaves the ground' },
  'inside-solid': { severity: 'error', catches: 'contact point inside a solid prop footprint (walking through a tree, stump, rock)',
    fix: 'move the target off the prop\'s footprint (the red ellipse on the set sheet), or stop beside it with near:<actor> or an anchor' },
  'in-water': { severity: 'error', catches: 'contact point in water, not on a stone, and the rig cannot swim',
    fix: 'stand on a stepping stone or the bank, or make the walk "wade": true' },
  collision: { severity: 'error', catches: 'two actors\' footprints overlap at similar depth (a warning when a beat makes them interact)',
    fix: 'move one along x or to another depth (y); "near:<actor>" stops beside someone instead of on them' },
  'offscreen-speaker': { severity: 'error', catches: 'a speaking actor (not vo) is less than 60% visible',
    fix: 'put the speaker in "on" (or a looser size), bring them out from behind what hides them, or mark the line "vo": true' },
  'subject-size': { severity: 'warning', catches: 'the framed subject\'s screen height is outside the range for the shot size (in a crop on purpose, a camera "focus", a "zoom" above 1 on subjects with no face or a dolly through depth, only too small)',
    fix: 'follow the cause in the message: frame the subject alone or stage the others closer; for a subject that grows later in the shot (a pose, a rider), make that change at the end of the shot before; at the closest zoom use a looser size. "zoom" never clears it (the range scales with it); a push-in or pull-out is judged at its start, a dolly through depth ("zTo") at its first frame' },
  'edge-cut': { severity: 'warning', catches: 'a head cut by the frame edge (its eyes at or past the edge; not for a rig with no face), or a sliver of an actor (under 25% of it in frame, head out; a walker only at the top or bottom; not a subject its shot crops on purpose, nor anything a dolly through depth sweeps past the edges) held for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset" or "size") that frames the actor in or out without a new edge-cut, tangent or halo, else a staging (move where the actor stands as the shot starts and where it goes in it)' },
  tangent: { severity: 'warning', catches: 'an actor\'s outline just touching a frame edge (an ear or a tail tip against the top, feet just above the bottom; measured on the part of the drawing facing the frame) for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset" or "zoom") that clears the edge or lets it cut clearly without a new framing fault, else a staging (move where the actor stands as the shot starts and where it goes in it)' },
  halo: { severity: 'warning', catches: 'the sun or moon disc of the sky touching or behind a head (of a rig with a face) for 0.5 s or more',
    fix: 'apply the change in the message, tried on the recompiled film: a camera change ("offset", "angle", "size", "zoom") or a staging that moves the head off the disc without a new framing fault; else re-block the scene under a clear sky' },
  'caption-face': { severity: 'warning', catches: 'the caption box overlaps a speaker\'s face (a rig with a face)',
    fix: 'stage the speaker higher in frame (an "offset" or the "high" angle), or a tighter size' },
  'cut-jump': { severity: 'warning', catches: 'consecutive shots of the same set with nearly identical framing',
    fix: 'change the size (a zoom ratio of at least 1.2), the subject or the angle between the two shots, or make them one shot' },
  continuity: { severity: 'warning', catches: 'an actor\'s pose (lying, low: sitting or crouching, standing, raised: sitting or rearing up) or place changes across a cut in the same set (or a dissolve to a shot too short to pass time) without the change being seen',
    fix: 'let the change happen on screen (a walk, a pose with a "dur") before or after the cut, start the shot where the last one left them, or cut away first' },
  axis: { severity: 'warning', catches: 'the left/right order of two talking actors flips across a cut',
    fix: 'keep each talker on their side for the whole conversation, or show the crossing inside a shot' },
  teleport: { severity: 'error', catches: 'an actor jumps between two frames inside a shot: more than half its own height (at most 40 rig units), its speed changing as much',
    fix: 'walk there instead of placing, or place while the actor is off screen' },
  ...(FLIP_RULE ? { flip: { severity: 'error', catches: 'an actor\'s drawing mirrors from one frame to the next inside a shot with no turn squash on either side (a snap, not a turn)',
    fix: 'give the change of facing a "turn" (or a look) before the move, or cut on it' } } : {}),
  scale: { severity: 'warning', catches: 'actor scale differs from set.scaleAt by more than 15% (perched actors use the anchor depth)',
    fix: 'usually an engine bug or a custom kit\'s anchor with a wrong depth: check the anchor on the set sheet' },
  timing: { severity: 'warning', catches: 'overlapping dialogue, shots seen on their own (after a dissolve or fade) for under 1.2 s, captions faster than 20 characters per second',
    fix: 'hold the shot longer ("hold", "dur") so it plays 1.2 s on its own after a dissolve or fade, space the lines ("after"), or shorten the caption' },
  plan: { severity: 'warning', catches: 'a warning check or the compiler gives the storyboard (a misspelt field, a camera subject not in the scene, a custom beat drawn on past its shot, a two-shot staged too far apart, …)',
    fix: 'follow the message; one that is intended can be kept in its shot\'s "lint" block' },
};

// The rules a shot may keep (warnings; a collision is one while a beat brings the two together).
const KEEPABLE = Object.keys(RULES).filter(r => RULES[r].severity === 'warning' || r === 'collision');

/**
 * A shot's lint block, "lint": { "allow": [rule names], "note": "why" }, checked on the film JSON: allow is a
 * non-empty list of rules that can warn, note says why. → problems [{ path, message }] as validateFilm lists them.
 */
export function allowProblems(film) {
  const out = [], P = (path, m) => out.push({ path, message: `${path}: ${m}` });
  (Array.isArray(film?.scenes) ? film.scenes : []).forEach((sc, i) => (Array.isArray(sc?.shots) ? sc.shots : []).forEach((sh, j) => {
    const L = sh?.lint, p = `scenes[${i}].shots[${j}].lint`;
    if (L === undefined) return;
    if (!L || typeof L !== 'object' || Array.isArray(L)) { P(p, 'must be an object { "allow": [rule names], "note": "why" }'); return; }
    for (const k of Object.keys(L)) if (k !== 'allow' && k !== 'note') P(`${p}.${k}`, 'unknown field (a shot\'s lint block takes "allow" and "note")');
    if (!Array.isArray(L.allow) || !L.allow.length) P(`${p}.allow`, `must be a non-empty array of rule names (${KEEPABLE.join(', ')})`);
    else L.allow.forEach((r, k) => {
      if (!KEEPABLE.includes(r)) P(`${p}.allow[${k}]`, RULES[r] ? `"${r}" is an error: errors are never kept, fix it` : `unknown rule ${JSON.stringify(r)} (one of ${KEEPABLE.join(', ')})`);
    });
    if (typeof L.note !== 'string' || !L.note.trim()) P(`${p}.note`, 'say why the warning is intended ("note": "…")');
  }));
  return out;
}
