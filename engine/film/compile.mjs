// compile(film, { voices }) → plan. Turns the storyboard into timed shots, actor performances (blocking along
// set routes, poses, gestures, looks, lip sync, idle life), cameras, captions, sound cues and music cues.
// Times are seconds from the film start; shot boundaries land on frames.
// Round 2 (DESIGN §9.1): say beats carry `tts` (what is spoken; `text` stays the caption) and `trimEnd`; lines get
// speak / nonverbal / trimEnd and their id hashes `speak`. `{ "mark": name }` beats fill plan.marks. Riding:
// hop / place "to": "on:<actor>" and scene actors { "on": "<actor>" }. Wading: walk / run "wade": true, "depth".
// Look "to": "up" | "sky" | "down" tilts the head. Shots may override "time" and "grade" (with "gradeTo"); a shot's
// "music" is a cue at its start. Scene "overlays" (built-in fields or custom.mjs overlays) → plan.overlays; scene
// "rim" → plan.scenes[i].rim. plan.score = film.score, plan.sounds = custom.mjs sounds.
// Round 3: cameras see each subject's head as it is held (look up / down, turned) and the other actors (to keep those
// in front of a close-up's subject out of its frame); an exit to a side walks past every view the shot may show and,
// once the real cameras exist, on out of the frame they show (nobody vanishes in view); title beats may give "place".
// Subjects carry `now` (where the drawing really is when it is framed elsewhere, as an exit is) for the camera; a
// two-shot whose staging can't come near its size is a plan warning.
// Round 5: a speaker who has no look of their own in the scene yet (or only "down") talks to the nearest actor in front
// of them. Cameras frame a subject on a slope as it is drawn: turned about its contact by the pitch it takes there.
// Acting: a look beat may give "tilt" (the head's pitch, outright); the "expr" of a line, pose, set or emote is held
// until a beat changes it (emote(); one set within 0.1 s of a shot's start changes at the cut, which hides it),
// except a line's reaction (REACTIONS: surprised, laughing, scared), which lasts the line and REACT_HOLD s after it, or
// ends at the cut if that comes first.
// Air: fly / enter / place "height" (units above the place, at the set's scale; a scene actor's too) ends a flier in the
// air, hovering (hoverPos) over the spot as given (water too); the camera frames it with the reach of its beating wings
// (actor.mjs hoverProfile); an enter into a hover comes in level at its height, "fly": true makes a flier's enter a
// flight from above.
// An entrance never runs past its destination and back (the way in starts at the frame edge or at the destination,
// whichever is nearer the entry side); near:<actor> keeps clear of the other's longer end and of a hoverer's wings.
// Camera (round 6): an actor subject says whether its rig has a face (faceless: camera.mjs keeps only faces above the
// captions); a world point "x:…,y:…" in "on" / "toOn" is framed as itself (in the air too); the provisional cameras
// take the shot's "focus".
// Depth (DESIGN §10): an actor's z (zAt: the scene actor's "z" or its starting anchor's, then each beat's "z" or the depth
// of the place it places or moves it to (targetZ: an anchor's, 0 when it declares none; a carrier's; the actor's it goes
// beside), eased over the beat; an entrance takes it at once; a "set" over its "dur"; a rider has its carrier's, and
// hopping on or off eases between the two) is on its subjects (anchors too) and its actorsAt states, which sort farther
// first; cameras of a scene using depth carry z and lens (buildCamera "depth"). An exit or entrance at a side is off
// screen as its depth shows it; an actor on the painted ground off the stage is warned about (groundDepth).
import { Actor, RouteLeg, JumpLeg, FlyLeg, groundPos, anchorPos, canHover, hoverProfile, REACTIONS, REACT_HOLD } from './actor.mjs';
import { buildCamera, frameSubjects, clampFrame, depthScale } from './camera.mjs';
import { skyList, mixGrade, mixStory, spanU, STORY, isNight } from './grade.mjs';
import { chunkCaption } from './text.mjs';
import { voiceFor } from '../audio/voice.mjs';
import { FX_DUR, ONE_SHOT } from './fx.mjs';
import { dissolveLen } from './frame.mjs';
import { moodNames, stingNames, MUSIC_EXTRAS, RIM_DEFAULTS, DEPTH_DO } from './validate.mjs';
import { clamp, hash32, shortHash, parseTarget, rigPose, profile, probe, lerp, easeIO } from './util.mjs';

export const DEFAULT_HOLD = 0.5;
export const estimateLine = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).length / 2.6 + 0.3;
const normText = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export function joinTones(...tones) {
  const parts = tones.flat().filter(Boolean).map(s => String(s).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean), out = [];
  for (const p of parts) if (!out.some(o => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out.join(', ');
}
const faceVal = f => (f === 'left' || f === -1 ? -1 : f === 'right' || f === 1 ? 1 : 0);
const FOOT = { grass: 'footstep-grass', dirt: 'footstep-dirt', path: 'footstep-dirt', sand: 'footstep-dirt', mud: 'footstep-dirt', stone: 'footstep-stone', rock: 'footstep-stone', wood: 'footstep-wood', leaf: 'footstep-grass', leaves: 'footstep-grass' };
const timeAt = b => (typeof b.at === 'number' ? b.at : null);

/** Compile a loaded film. voices: Map lineId → { dur, env } (optional; lines without one use an estimate). */
export function compile(film, { voices } = {}) {
  if (!film?.resolved) throw new Error('compile(film): pass a film returned by loadFilm()');
  const V = voices instanceof Map ? voices : new Map(Object.entries(voices || {}));
  return new Compiler(film, V).run();
}

class Compiler {
  constructor(film, voices) {
    const fmt = film.format || {};
    Object.assign(this, { film, voices, R: film.resolved, W: fmt.width || 1920, H: fmt.height || 1080, fps: fmt.fps || 24, captionMode: fmt.captions || 'dialogue', style: fmt.style || 'painted' });
    this.lines = []; this.rawSfx = []; this.fx = []; this.captions = []; this.shots = []; this.scenes = []; this.cards = []; this.custom = []; this.warnings = [];
    this.marks = {};
    this.zs = new Map();        // actor → its depth changes [{ t0, t1, z0, z1 }] (DESIGN §10)
    // a 3D film: its actions are timed on the 3D motion system (engine/scene3d/compile.mjs createTiming)
    this.T3 = film.resolved.timing?.(film) ?? null;
  }
  q(t) { return Math.round(t * this.fps) / this.fps; }
  warn(msg) { this.warnings.push(msg); }

  run() {
    const film = this.film;
    let t = 0;
    const open = film.titles?.open;
    if (open && (open.title || open.subtitle || film.title)) {
      const d = this.q(open.dur ?? 5);
      this.cards.push({ kind: 'open', t0: 0, t1: d, title: open.title ?? film.title, subtitle: open.subtitle ?? null });
      t = d;
    }
    film.scenes.forEach((sc, i) => { t = this.scene(sc, i, t); });
    this.scenes.forEach((rec, i) => this.scopeCustom(rec, i));
    const end = film.titles?.end;
    if (end) { const d = this.q(end.dur ?? 5); this.cards.push({ kind: 'end', t0: t, t1: t + d, lines: end.lines?.length ? end.lines : ['The End'] }); t += d; }
    this.duration = this.q(t);
    this.finishCaptions();
    const plan = this.plan();
    this.finishSfx(plan);
    return plan;
  }

  // ───────────── scenes ─────────────
  scene(sc, index, T0) {
    const S = this.R.sets[sc.set], film = this.film, actors = new Map();
    const prev = this.scenes[this.scenes.length - 1];
    const rec = { id: sc.id, sc, S, index, t0: T0, t1: T0, actors, shots: [], time: sc.time ?? S.defaultSky, story: STORY[sc.grade] ?? null, gradeName: sc.grade,
      musicEv: [], transition: sc.transition ?? (index === 0 ? 'cut' : prev && (prev.S !== S || JSON.stringify(prev.time) !== JSON.stringify(sc.time ?? S.defaultSky)) ? 'dissolve' : 'cut') };
    this.ensure = (id) => {
      if (!actors.has(id)) actors.set(id, new Actor({ id, rig: this.R.rigs[id], castDef: film.cast[id], S, sceneActors: actors, seed: hash32(id) }));
      return actors.get(id);
    };
    this.rec = rec;
    // starting places in dependency order: absolute targets and offstage actors first, then riders whose carrier and
    // relative places whose actor is already placed, and so on (a cycle or a missing actor reports itself in place())
    const rel = v => ['near', 'left-of', 'right-of', 'behind', 'front-of'].includes(parseTarget(v).kind);
    const dep = a => (a.offstage ? null : a.on !== undefined ? a.on : rel(a.at) ? parseTarget(a.at).who : null);
    let left = Object.entries(sc.actors || {});
    while (left.length) {
      const ready = left.filter(([, a]) => { const d = dep(a); return d == null || actors.get(d)?.place0 || !sc.actors[d]; }), batch = ready.length ? ready : left;
      for (const [id, a] of batch) {
        if (a.offstage) { this.initOff(rec, this.ensure(id), a.offstage, T0, a); continue; }
        if (a.on !== undefined) {
          const A = this.ensure(id), C = actors.get(a.on);
          if (!C?.place0) throw new Error(`scene ${sc.id}: ${id} rides "${a.on}", which is not in the scene`);
          A.init(T0, C.mountAt(T0, A), faceVal(a.face) || C.faceAt(T0), a.pose ?? (rigPose(A.rig, 'sit')?.name || 'stand'), { expr: a.expr ?? 'neutral', mount: C });
          continue;
        }
        // ("height": a flier starts hovering that high above its place)
        const A = this.ensure(id), pos = a.height != null ? this.hoverPos(rec, A, this.place(rec, A, a.at, T0, null, true), a.height) : this.place(rec, A, a.at, T0);
        let face = faceVal(a.face) || faceVal(pos.face) || (pos.faceTo ?? (pos.x < S.refX ? 1 : -1));
        const poseName = a.pose ?? (pos.mode === 'perch' ? (rigPose(A.rig, 'perch')?.name || 'stand') : 'stand');
        A.init(T0, pos, face, poseName, { expr: a.expr ?? 'neutral' });
      }
      left = left.filter(e => !batch.includes(e));
    }
    // (depth: an actor's starting z, its own or its starting anchor's; a rider has its carrier's)
    for (const [id, a] of Object.entries(sc.actors || {})) { const z = a.on !== undefined ? 0 : a.z ?? anchorZ(S, a.at) ?? 0; if (z && actors.has(id)) this.zs.set(actors.get(id), [{ t0: T0, t1: T0, z0: z, z1: z }]); }
    let t = T0;
    sc.shots.forEach((sh, i) => { t = this.shot(rec, sh, i, t); });
    rec.t1 = t;
    // music: scene cue (inherited if absent, as a continuation: mood and intensity only, so it merges into the
    // previous cue instead of restating the motif or cutting on a downbeat), split by music beats
    const pm = prev?.music, m = sc.music === undefined ? (pm?.mood ? { mood: pm.mood, intensity: pm.intensity } : pm) : normMusic(sc.music);
    rec.music = m;
    this.scenes.push(rec);
    this.glances(rec);
    for (const s of rec.shots) this.camera(rec, s);
    if (!this.T3) this.finishExits(rec);   // (a 3D exit ends where the 3D kit's side is)
    this.groundDepth(rec);
    this.moveSounds(rec);
    return t;
  }
  // An exit to a side walks on, at the same pace, until it is out of the real camera (which may show more than the
  // guess made while the beats were laid out), so nobody vanishes in view. The beat keeps its length; the walk past
  // the old end point just goes on (and is cut by the next shot if that comes first).
  finishExits(rec) {
    const W = this.W, S = rec.S;
    for (const A of rec.actors.values()) for (const mv of A.moves) {
      const L = mv.legs?.[mv.legs.length - 1];
      if (mv.kind !== 'exit' || !mv.side || mv.cut !== undefined || L?.type !== 'route' || L.hops || !L.args) continue;
      const shot = rec.shots.find(s => mv.t1 >= s.t0 && mv.t1 < s.t1)?.out;
      if (!shot) continue;
      const dir = mv.side === 'left' ? -1 : 1, m = this.offMargin(A, mv.final.s);
      let need = mv.final.x;
      // (off the stage: out of the view its depth sees, W/2/(zoom × p) either side of the camera's centre)
      for (let tt = mv.t1; tt < shot.t1; tt += 1 / 12) { const c = shot.cameraAt(tt), p = depthScale(c, this.zAt(A, tt)), e = c.cx + dir * (W / 2 / (p === 1 ? c.zoom : c.zoom * p) + m); need = dir > 0 ? Math.max(need, e) : Math.min(need, e); }
      if ((need - mv.final.x) * dir < 1) continue;
      const pts = L.args.pts, y = pts[pts.length - 1][1], L2 = new RouteLeg({ ...L.args, pts: [...pts, [need, y]] });
      const t1 = mv.t1 + L2.T - L.T, next = A.moves.find(o => o !== mv && o.t0 > mv.t0);
      if (next && next.t0 < t1) continue;
      for (const list of [A.visEv, A.faceEv, A.poseEv]) for (const e of list) if (e.src === mv && Math.abs(e.t - mv.t1) < 1e-6) e.t = t1;
      mv.legs[mv.legs.length - 1] = L2; mv.t1 = t1;
      mv.end = groundPos(S, need, y, A.k); mv.final = { ...mv.end, mode: 'off' };
    }
  }
  // A custom beat lives for its dur, on into the next shots of its scene and, when the next scene dissolves in, into
  // the dissolve (frame.mjs draws the scene's last shot on, fading, over the next one). "scope": "shot" ends it at its
  // shot's cut (frame.mjs draws it only in its own shot and before its end; its sounds from the cut on are dropped
  // here); "scope": "scene" says it carries on. A warning: one drawn on into a later shot without saying so, or that
  // ends partway through the dissolve (it vanishes from the fading picture). Frame k is drawn at k / fps, so this goes
  // by frames, as the drawing does (a beat that fills its shot can end a hair after the next shot's first frame).
  scopeCustom(rec, i) {
    const fps = this.fps, frame = t => Math.round(t * fps) / fps, cut = new Map(), next = this.scenes[i + 1];
    // the dissolve's last frame (the compiler holds the plan's scenes and shots)
    const d = next?.transition === 'dissolve' ? dissolveLen(this, i + 1) : 0;
    let last = null;
    for (let k = Math.round(rec.t1 * fps); k / fps - rec.t1 < d; k++) last = k / fps;
    for (const c of this.custom) {
      if (c.scene !== rec.id) continue;
      const own = rec.shots.find(s => s.id === c.shot);
      if (c.beat.scope === 'shot') { cut.set(c, own.t1); continue; }
      if (c.beat.scope !== undefined || !c.def?.draw) continue;
      const into = rec.shots.filter(s => s.index > own.index && frame(s.t0) < c.t1).map(s => s.id);
      if (last !== null && frame(rec.t1) < c.t1 && c.t1 <= last) into.push(`the dissolve to ${next.shots[0].id}, where it vanishes partway (a dur of ${(Math.ceil((last - c.t0) * 100 + 1e-6) / 100).toFixed(2)} s or more lets it fade out with the picture)`);
      if (!into.length) continue;
      let n = 0;
      for (let k = Math.round(own.t1 * fps); k / fps < c.t1; k++) n++;
      this.warn(`shot ${own.id}: custom beat "${c.name}" (${(c.t1 - c.t0).toFixed(2)} s from ${(c.t0 - own.t0).toFixed(2)} s) runs ${(c.t1 - own.t1).toFixed(2)} s (${n} frame${n > 1 ? 's' : ''}) past the shot's end, so it is drawn on into ${into.join(', ')}: "scope": "shot" ends it at the cut, "scope": "scene" keeps it on`);
    }
    if (cut.size) this.rawSfx = this.rawSfx.filter(e => !(cut.has(e.of) && e.t >= cut.get(e.of)));
  }
  initOff(rec, A, side, t, a = {}) {
    const S = rec.S, y = S.laneAt(side === 'left' ? S.area.x0 : S.area.x1);
    const x = side === 'left' ? S.area.x0 - 600 : S.area.x1 + 600;
    A.init(t, { ...groundPos(S, x, y, A.k), mode: 'off' }, side === 'left' ? 1 : -1, a.pose ?? 'stand', { visible: false, expr: a.expr ?? 'neutral' });
    A.offSide = side;
  }

  // ───────────── shots and beat timing ─────────────
  shot(rec, sh, index, T) {
    const beats = sh.beats || [];
    let gStart = 0, gEnd = 0, maxEnd = 0;
    const byId = {}, srec = { def: sh, id: sh.id, index, t0: T, beats: [], refs: new Set() }, ends = [];
    rec.shots.push(srec); this.srec = srec;
    if (sh.music !== undefined) { const m = normMusic(sh.music); if (m) rec.musicEv.push({ t: T, m }); }
    for (const b of beats) {
      const pinned = timeAt(b);
      const base = pinned != null ? pinned : b.with === 'prev' ? gStart : b.with ? (byId[b.with]?.start ?? gStart) : gEnd;
      let start = base + (b.after ?? 0);
      // (3D: an action waits for its actor to finish the one before)
      if (this.T3) { const s = this.T3.free(rec, b, T + start) - T; if (s > start + 1e-6) this.warn(`shot ${sh.id}: ${b.who}'s ${b.do} (beats[${srec.beats.length}]) waits ${(s - start).toFixed(2)} s, until ${b.who} has finished the action before it`); start = s; }
      let dur = 0;
      this.made = null;
      try { dur = this.beat(rec, srec, b, T + start); }
      catch (e) { throw new Error(`shot ${sh.id}: ${b.do ?? Object.keys(b)[0]} beat: ${e.message}`, { cause: e }); }
      if (this.T3) dur = this.act3d(rec, sh, srec.beats.length, b, T + start, dur, T);
      dur = Math.max(0, dur || 0);
      if (b.do !== undefined) dur = Math.max(dur, this.depthBeat(rec, b, T + start, dur));
      const end = start + dur;
      // "hold": false (a custom beat or an sfx): it plays its whole dur but takes no time here, so neither the next
      // beat, its group nor the shot's length waits for it
      const held = b.hold === false && (b.do === 'custom' || b.sfx !== undefined) ? start : end;
      if (b.with) gEnd = Math.max(gEnd, held); else { gStart = start; gEnd = held; }
      if (b.id) byId[b.id] = { start, end };
      srec.beats.push({ beat: b, t0: T + start, t1: T + end });
      ends.push({ held, mv: this.made, i: srec.beats.length - 1 });
      maxEnd = Math.max(maxEnd, held);
    }
    // a move cut by one that starts during it (in this shot) ends at its cut: the shot doesn't wait for the rest; a cut
    // that throws away most of the move is warned about
    if (ends.some(e => e.mv?.cut !== undefined)) {
      maxEnd = 0;
      for (const { held, mv, i } of ends) {
        if (mv?.cut === undefined) { maxEnd = Math.max(maxEnd, held); continue; }
        maxEnd = Math.max(maxEnd, Math.min(held, mv.cut - T));
        if (mv.cut - mv.t0 < (mv.t1 - mv.t0) / 2) this.warn(`shot ${sh.id}: ${srec.beats[i].beat.who}'s ${mv.kind} (beats[${i}]) is cut ${(mv.cut - mv.t0).toFixed(2)} s into its ${(mv.t1 - mv.t0).toFixed(2)} s by ${srec.beats[i].beat.who}'s next move, which starts then; the rest of it is dropped`);
      }
    }
    const len = sh.dur ?? (maxEnd + (sh.hold ?? DEFAULT_HOLD));
    srec.t1 = Math.max(T + 1 / this.fps, this.q(T + len));
    // a line's reaction still on at the cut ends there (the cut hides the change)
    for (const e of srec.reactions || []) if (e.until > srec.t1) Object.assign(e, { until: srec.t1, untilCut: true });
    return srec.t1;
  }

  // A 3D film: the beat at t acted out on the 3D motion system → its duration there (the flat stand-in's move it started
  // is slowed or hurried to take as long). A storyboard mistake names its shot and beat; an engine fault reads as one.
  act3d(rec, sh, i, b, t, dur, shotT0) {
    let d;
    try { d = this.T3.act(rec, b, t, shotT0); }
    catch (e) { throw e?.name === 'StoryError' ? new Error(`shot ${sh.id}, beats[${i}] (${b.do} ${b.who}): ${e.message}`, { cause: e }) : e; }
    if (d === undefined) return dur;
    const A = rec.actors.get(b.who), mv = A.moves.find(m => m.t0 === t && m.legs.length);
    if (mv) {
      const k = Math.max(d, 1e-3) / (mv.t1 - mv.t0), was = mv.t1;
      mv.legs = mv.legs.map(L => Object.assign(Object.create(L), { T: L.T * k, at: τ => L.at(τ / k), pose: (τ, rig) => L.pose(τ / k, rig), airborne: τ => L.airborne(τ / k), phaseAt: τ => L.phaseAt?.(τ / k), timeOfPhase: p => L.timeOfPhase(p) * k }));
      mv.t1 = t + Math.max(d, 1e-3);
      for (const list of [A.visEv, A.faceEv, A.poseEv]) for (const e of list) if (e.src === mv && Math.abs(e.t - was) < 1e-6) e.t = mv.t1;
    }
    return d;
  }

  beat(rec, srec, b, t) {
    if (b.say !== undefined) return this.say(rec, srec, b, t);
    if (b.wait !== undefined) return b.wait;
    if (b.mark !== undefined) { this.marks[b.mark] = t; return 0; }
    if (b.sfx !== undefined) {
      const where = b.on ?? b.who ?? (typeof b.at === 'string' ? b.at : null);
      this.rawSfx.push({ t, name: b.sfx, gain: b.gain ?? 1, pan: b.pan, params: { ...(b.params || {}), ...(b.dur ? { dur: b.dur } : {}) }, seed: b.seed, shot: srec.id, where: where ? this.where(rec, where, t) : null });
      if (b.caption) this.captions.push({ t0: t, t1: t + Math.max(1.2, b.dur || 0), text: b.caption, style: 'sound', burn: this.captionMode === 'all' });
      return b.dur ?? 0;
    }
    if (b.fx !== undefined) {
      const where = b.on ?? b.who ?? (typeof b.at === 'string' ? b.at : null);
      const p = where ? this.where(rec, where, t) : null;
      const one = ONE_SHOT.has(b.fx);
      this.fx.push({ name: b.fx, t0: t, t1: one ? t + FX_DUR[b.fx] : (b.dur ? t + b.dur : null), scene: rec.id, x: p?.x, y: p?.y, key: p?.key, s: (p?.s ?? 1) * (b.size ?? 1), dir: b.dir ?? 1, seed: hash32(`${srec.id}|${b.fx}|${t.toFixed(3)}`), density: b.n ?? 1, color: b.color });
      return 0;
    }
    if (b.music !== undefined) {
      const m = normMusic(b.music, b);
      if (m) rec.musicEv.push({ t, m });
      return 0;
    }
    if (b.title !== undefined) {
      const d = b.dur ?? 3;
      this.captions.push({ t0: t, t1: t + d, text: b.title, sub: b.sub ?? b.subtitle ?? null, style: 'title', burn: true, place: b.place ?? null });
      return d;
    }
    return this.act(rec, srec, b, t);
  }

  say(rec, srec, b, t) {
    const film = this.film, who = b.say, narrator = who === 'narrator';
    const key = narrator ? 'narrator' : (film.cast[who]?.voice && film.voices?.[film.cast[who].voice] ? film.cast[who].voice : film.voices?.[who] ? who : film.cast[who]?.voice);
    const cfg = film.voices?.[key] || {}, text = normText(b.text), speak = normText(b.tts ?? b.text), tone = joinTones(cfg.tone, b.tone);
    const id = shortHash(who, cfg.voice ?? '', speak, tone), trimEnd = Math.max(0, Number(b.trimEnd) || 0);
    const v = voiceFor(this.voices, { id, trimEnd });   // each line gets its own cut, even when two lines share words
    // the voice module returns the trimmed take's length; before voicing, estimate the spoken words minus the cut
    const dur = Number.isFinite(v?.dur) && v.dur > 0 ? v.dur : Math.max(0.25, estimateLine(speak) - trimEnd);
    const line = { id, who, voice: key, tone: b.tone ?? '', text, speak, nonverbal: text.startsWith('['), trimEnd, t0: t, t1: t + dur, vo: !!b.vo, narrator, shot: srec.id, scene: rec.id, estimated: !v };
    this.lines.push(line);
    const A = narrator ? null : rec.actors.get(who);
    if (A && A.place0) {
      A.talk.push({ t0: t, t1: t + dur, env: v?.env || null, seed: hash32(id) });
      // a mood is held until a beat changes it (listening doesn't reset it); a reaction lasts the line and a moment after
      if (b.expr) this.emote(A, srec, t, b.expr, REACTIONS.has(b.expr) ? t + dur + REACT_HOLD : null);
      srec.refs.add(who);
    }
    return dur;
  }

  // ───────────── actions ─────────────
  act(rec, srec, b, t) {
    const d = b.do, S = rec.S;
    if (d === 'custom') {
      const dur = b.dur ?? 1, def = this.film.custom?.custom?.[b.name];
      const c = { name: b.name, t0: t, t1: t + dur, beat: b, scene: rec.id, shot: srec.id, def, params: { ...b, ...(b.params || {}) }, seed: hash32(`${srec.id}|${b.name}|${t.toFixed(3)}`) };
      this.custom.push(c);
      for (const e of def?.sfx || []) this.rawSfx.push({ t: t + (e.at ?? 0), name: e.name, gain: e.gain ?? 1, pan: e.pan, params: e.params || {}, shot: srec.id, where: null, of: c });
      return dur;
    }
    if (d === 'enter') return this.enter(rec, srec, b, t);
    // (3D only: a door that swings by itself, timed by the 3D side)
    if (d === 'open' || d === 'close') return 0;
    const A = rec.actors.get(b.who);
    if (!A || !A.place0) throw new Error(`"${b.who}" is not in scene ${rec.id}`);
    srec.refs.add(b.who);
    const rig = A.rig;
    switch (d) {
      case 'walk': case 'run': case 'hop': case 'fly': return this.move(rec, srec, A, b, t, d);
      case 'exit': return this.exit(rec, srec, A, b, t);
      case 'pose': {
        // an explicit dur is how long the change takes (an old woman rising over 2 s); otherwise a quick 0.35 s blend
        const dur = b.dur ?? 1;
        const [tp, src] = this.poseTime(A, srec, b, t);
        A.setPose(tp, b.pose, b.dur !== undefined ? Math.max(0.12, dur) : 0.35, src);
        if (b.expr) this.emote(A, srec, t, b.expr);
        if (b.pose !== 'sleep') A.sleepEv.push({ t, asleep: false });
        return dur;
      }
      case 'gesture': {
        const g = rig.gestures[b.name], dur = g.dur;
        A.gest.push({ t0: t, t1: t + dur, name: b.name }); A.gest.sort((a, c) => a.t0 - c.t0);
        // (over a walk or run the gait keeps its feet, lift and body height: a gesture that leaves the ground doesn't)
        const mv = A.moves.find(m => m.legs?.some(L => L.type === 'route' && !L.hops) && m.t0 < t + dur && t < A.end(m)), st = rig.poses.stand;
        if (mv && [0.25, 0.5, 0.75].some(u => (g.at(u, st).lift || 0) - (st.lift || 0) > 0.5)) this.warn(`shot ${srec.id}: ${A.id}'s gesture "${b.name}" (beats[${srec.beats.length}]) leaves the ground, but it comes during ${A.id}'s ${mv.kind}, whose gait keeps the feet, lift and body height: the gesture's lift is left out (give it after the ${mv.kind})`);
        return dur;
      }
      case 'look': {
        const tgt = b.to !== undefined ? b.to : typeof b.at === 'string' ? b.at : undefined;
        const target = this.lookTarget(rec, tgt);
        A.lookEv.push({ t, target, ...(Number.isFinite(b.tilt) ? { tilt: b.tilt } : {}) }); A.lookEv.sort((a, c) => a.t - c.t);
        // turn to face the target if it is behind
        const p = A.posAt(t), tx = typeof target === 'object' && target ? target.x : rec.actors.get(target)?.posAt(t).x;
        const f0 = A.faceAt(t);
        let f1 = f0;
        if (Number.isFinite(tx) && Math.abs(tx - p.x) > 8) f1 = Math.sign(tx - p.x);
        else if (target === 'left') f1 = -1; else if (target === 'right') f1 = 1;
        if (f1 !== f0) A.faceEv.push({ t: t + 0.08, face: f1, flip: true });
        A.faceEv.sort((a, c) => a.t - c.t);
        return 0.3;
      }
      case 'turn': {
        // (during a move: the move's end facing, the way the actor faces once it is over)
        const mv = this.during(A, t + 0.12), e = mv && A.faceEv.find(x => x.src === mv && x.t === mv.t1);
        if (e) {
          const f1 = b.face === 'around' ? -e.face : faceVal(b.face);
          this.warn(`shot ${srec.id}: ${A.id}'s turn (beats[${srec.beats.length}]) comes during ${A.id}'s ${mv.kind}, which ends ${(mv.t1 - srec.t0).toFixed(2)} s into the shot: it becomes the ${mv.kind}'s end facing${mv.beat.face ? ` (over its own "face")` : ''}`);
          if (f1) Object.assign(e, { face: f1, flip: f1 !== A.faceAt(mv.t1 - 1e-4) });
          return 0.25;
        }
        const f0 = A.faceAt(t), f1 = b.face === 'around' ? -f0 : faceVal(b.face);
        if (f1 && f1 !== f0) { A.faceEv.push({ t: t + 0.12, face: f1, flip: true }); A.faceEv.sort((a, c) => a.t - c.t); }
        return 0.25;
      }
      case 'emote': this.emote(A, srec, t, b.expr); return 0;
      case 'sit': case 'stand': case 'lie': case 'sleep': {
        if (d !== 'sleep') A.sleepEv.push({ t, asleep: false });
        const [tp, src] = this.poseTime(A, srec, b, t);
        if (d === 'sleep') { A.preSleep = A.basePoseName(tp); A.sleepEv.push({ t: tp + 0.3, asleep: true }); }
        A.setPose(tp, d, 0.6, src);
        A.sleepEv.sort((a, c) => a.t - c.t);
        return 0.6;
      }
      case 'wake': {
        A.sleepEv.push({ t, asleep: false }); A.sleepEv.sort((a, c) => a.t - c.t);
        const back = b.pose ?? (A.preSleep && A.preSleep !== 'sleep' ? A.preSleep : 'stand');
        A.setPose(t + 0.15, back, 0.6, 'beat');
        A.blinks.push(t + 0.05, t + 0.5);
        return 0.75;
      }
      case 'place': {
        const where = b.to ?? (typeof b.at === 'string' ? b.at : null), air = b.height != null;
        let pos = this.place(rec, A, where, t, null, air);
        if (air) pos = this.hoverPos(rec, A, pos, b.height);
        if (pos.mode === 'mount') A.addMove({ t0: t, t1: t, mount: rec.actors.get(pos.carrier), legs: [], kind: 'place' });
        else A.addMove({ t0: t, t1: t, place: pos, legs: [], kind: 'place' });
        const f = faceVal(b.face) || faceVal(pos.face) || A.faceAt(t);
        A.faceEv.push({ t, face: f }); A.faceEv.sort((a, c) => a.t - c.t);
        if (b.pose) A.setPose(t, b.pose, 0, 'beat');
        A.visEv.push({ t, visible: true }); A.visEv.sort((a, c) => a.t - c.t);
        return 0;
      }
      case 'fade': {
        const dur = b.dur ?? 1;
        A.alphaEv.push({ t0: t, t1: t + dur, from: A.alphaAt(t), to: b.to }); A.alphaEv.sort((a, c) => a.t0 - c.t0);
        return dur;
      }
      case 'set': {
        // ("dur": numbers and hex colours ease to the new values over it, and the beat takes that long; else at once)
        const ease = b.params && b.dur > 0;
        if (b.params) A.paramEv.push({ t, params: b.params, ...(ease ? { t1: t + b.dur } : {}) });
        if (b.pose) A.setPose(t, b.pose, 0, 'beat');
        if (b.expr) this.emote(A, srec, t, b.expr);
        return ease ? b.dur : 0;
      }
      case 'blink': A.blinks.push(t); return 0.2;
      // (3D only: a car's drive and stop, a ball's roll; the stand-in goes as a walk, or hops off the hands it is in)
      case 'drive': case 'roll': return this.move(rec, srec, A, b, t, d === 'roll' && A.posAt(t).mode === 'mount' ? 'hop' : 'walk');
      case 'stop': return 0;
      default: throw new Error(`unknown action "${d}"`);
    }
  }

  // An expression from a beat, held until another changes it (or, a line's reaction, until `until`: shot() ends it at
  // the cut if that comes first). One set as a shot opens (within 0.1 s of the cut) changes at the cut, which hides it
  // (elsewhere the actor changes it behind a blink).
  emote(A, srec, t, expr, until = null) {
    const cut = t - srec.t0 < 0.1, e = { t: cut ? srec.t0 : t, expr, cut };
    if (until != null) { e.until = until; (srec.reactions ??= []).push(e); }
    A.exprEv.push(e); A.exprEv.sort((a, c) => a.t - c.t);
  }
  // The move A is making at t (one not cut short), or null.
  during(A, t) { const mv = A.moveAt(t); return mv && !mv.place && mv.legs.length && t < mv.t1 && mv.cut === undefined ? mv : null; }
  // When a pose beat at t takes effect → [time, src]: at t; or, during a move (whose drawing is the gait's), at the
  // move's end, in place of the move's own end pose (dropped with the move if a later one cuts it).
  poseTime(A, srec, b, t) {
    const mv = this.during(A, t); if (!mv) return [t, 'beat'];
    const own = mv.beat.pose ?? mv.beat.end;
    this.warn(`shot ${srec.id}: ${A.id}'s ${b.do === 'pose' ? `pose "${b.pose}"` : b.do} (beats[${srec.beats.length}]) comes during ${A.id}'s ${mv.kind}, which ends ${(mv.t1 - srec.t0).toFixed(2)} s into the shot: it is taken when the ${mv.kind} ends${own ? ` (over its own "pose": "${own}")` : ''}`);
    A.poseEv = A.poseEv.filter(e => !(e.src === mv && e.t === mv.t1));
    return [mv.t1, mv];
  }

  lookTarget(rec, tgt) {
    if (!tgt || ['none', 'camera', 'left', 'right', 'up', 'sky', 'down'].includes(tgt)) return tgt || 'none';
    if (rec.actors.has(tgt) || this.film.cast[tgt]) return tgt;
    const T = parseTarget(tgt);
    if (T.kind === 'name') { const a = rec.S.anchor(T.name); return { x: a.x, y: a.y }; }
    if (T.kind === 'x') return { x: T.x, y: rec.S.laneAt(T.x) };
    if (T.kind === 'xy') return { x: T.x, y: T.y };
    return 'none';
  }

  // A point in the set at time t (for sfx pan, fx placement): an actor's contact point or an anchor.
  where(rec, v, t) {
    const A = rec.actors.get(v);
    if (A && A.place0) { const p = A.posAt(t); return { x: p.x, y: p.y - (p.lift || 0) * p.s, s: p.s, key: p.key, who: v }; }
    const T = parseTarget(v);
    if (T.kind === 'name' && rec.S.anchorNames.includes(T.name)) { const a = rec.S.anchor(T.name); return { x: a.x, y: a.y, s: a.s }; }
    if (T.kind === 'x' || T.kind === 'xy') { const y = T.kind === 'xy' ? T.y : rec.S.laneAt(T.x); return { x: T.x, y, s: rec.S.scaleAt(T.x, y) }; }
    return null;
  }

  // ───────────── places ─────────────
  footprint(A, s) { const b = profile(A.rig, 'stand', A.params0).box; return { w: (b[2] - b[0]) * s, front: b[2] * s, back: -b[0] * s }; }
  // How far a flier's beating wings reach in front of it (world px at scale s): the furthest its fly gait's drawing
  // reaches over a wing beat (at least its standing front).
  wingspan(A, s) {
    const rig = A.rig;
    if (A.wing0 === undefined) { A.wing0 = profile(rig, 'stand', A.params0).box[2]; if (rig.gaits?.fly) for (let i = 0; i < 8; i++) A.wing0 = Math.max(A.wing0, probe(rig, 0, 0, 1, 1, { pose: rig.gaits.fly(i / 8), params: A.params0, shadow: false, t: 0 }).bounds[2]); }
    return A.wing0 * s;
  }
  // A flier hovering `height` units (at the set's scale) above a place (above the ground, or above a perch or surface
  // point): drawn like a flight, y the ground line under it and lift its altitude; pos.hover is the lift it holds.
  hoverPos(rec, A, pos, height) {
    if (!canHover(A.rig)) throw new Error(`${A.id} (${A.rig.kind}) cannot fly, so it cannot hover ("height")`);
    const S = rec.S, gy = pos.mode === 'ground' ? pos.y : pos.depth ?? pos.key, g = groundPos(S, pos.x, gy, A.k);
    const lift = (height * S.scaleAt(pos.x, gy) + Math.max(0, gy - pos.y)) / g.s;
    return { ...g, mode: 'air', depth: gy, ground: gy, anchor: pos.anchor ?? null, lift, hover: lift, airborne: true, face: pos.face, faceTo: pos.faceTo };
  }
  walkable(rec, A, x, y, t, avoid = null) {
    const S = rec.S, s = S.scaleAt(x, y) * A.k, rx = Math.max(8, A.sz.width * s * 0.3), ry = rx * 0.3;
    let p = S.isWalkable(x, y) && !insideCollider(S, x, y, rx * 0.6, ry * 0.6) ? [x, y] : S.nearestWalkable(x, y, { rx: rx * 0.6, ry: ry * 0.6 }) || [x, y];
    // don't stand inside another actor
    for (let it = 0; it < 4; it++) {
      let hit = null;
      for (const [id, O] of rec.actors) {
        if (O === A || !O.place0 || id === avoid || !O.visibleAt(t)) continue;
        const q = O.posAt(t); if (q.mode !== 'ground') continue;
        const so = q.s, need = (this.footprint(A, s).w + this.footprint(O, so).w) * 0.32;
        if (Math.abs(q.x - p[0]) < need && Math.abs(q.y - p[1]) < 18 * Math.max(s, so)) { hit = { q, need }; break; }
      }
      if (!hit) break;
      const dir = p[0] >= hit.q.x ? 1 : -1, nx = hit.q.x + dir * (hit.need + 4);
      p = S.nearestWalkable(nx, p[1], { rx: rx * 0.6, ry: ry * 0.6 }) || [nx, p[1]];
    }
    return p;
  }
  // air: the actor will hover there: the spot is taken as given (over water or a stone too, kept inside the set's area),
  // and beside another actor it keeps clear of that one with its wings spread.
  place(rec, A, target, t, from = null, air = false) {
    const S = rec.S, T = parseTarget(target), over = (x, y) => [clamp(x, S.area.x0, S.area.x1), clamp(y, S.area.y0, S.area.y1)];
    if (T.kind === 'on') {
      const C = rec.actors.get(T.who);
      if (!C || !C.place0) throw new Error(`"${T.who}" is not in scene ${rec.id}`);
      if (C === A || C.carrierAt(t) === A) throw new Error(`${A.id} cannot ride ${C === A ? 'itself' : `its own rider ${C.id}`}`);
      return { ...C.mountAt(t, A), faceTo: C.faceAt(t) };
    }
    if (T.kind === 'name') {
      if (S.anchorNames.includes(T.name)) {
        const pos = anchorPos(S, T.name, A.k);
        if (pos.mode === 'ground') { const [x, y] = air ? over(pos.x, pos.y) : this.walkable(rec, A, pos.x, pos.y, t); return { ...groundPos(S, x, y, A.k), anchor: T.name, face: pos.face }; }
        if (pos.mode === 'perch' && !A.rig.perch && !A.rig.flies) this.warn(`${A.id} (${A.rig.kind}) is placed on the perch "${T.name}" but its rig cannot perch`);
        return pos;
      }
      if (rec.actors.has(T.name)) return this.place(rec, A, `near:${T.name}`, t, from, air);
    }
    if (T.kind === 'x' || T.kind === 'xy') {
      const y = T.kind === 'xy' ? T.y : S.laneAt(T.x), [x, yy] = air ? over(T.x, y) : this.walkable(rec, A, T.x, y, t);
      return groundPos(S, x, yy, A.k);
    }
    if (['near', 'left-of', 'right-of', 'behind', 'front-of'].includes(T.kind)) {
      let O = rec.actors.get(T.who);
      if (!O || !O.place0) throw new Error(`"${T.who}" is not in scene ${rec.id}`);
      // beside a rider = beside its carrier (the pair stands on the carrier's feet)
      const C = O.carrierAt(t); if (C && C !== A) { O = C; T.who = C.id; }
      // (a hovering actor's ground is the line under it)
      const q = O.posAt(t), oy = q.mode === 'ground' || q.hover != null ? q.y : S.laneAt(q.x), sA = S.scaleAt(q.x, oy) * A.k, sO = q.s;
      // the clear space between the two: the arriving actor's front (a hoverer's beating wings), the other's longer end
      // (it may turn to face the newcomer: a tail or a head), and a gap of 0.42 × their mean height
      const fO = this.footprint(O, sO);
      const gap = (air ? this.wingspan(A, sA) : this.footprint(A, sA).front) + Math.max(fO.front, fO.back) + 0.42 * (A.sz.height * sA + O.sz.height * sO) / 2;
      const fx = from ? from.x : A.place0 ? A.posAt(t).x : q.x - 1;
      let side = T.kind === 'left-of' ? -1 : T.kind === 'right-of' ? 1 : Math.sign(fx - q.x) || -1;
      let x = q.x + side * gap, y = oy;
      if (T.kind === 'behind') { x = q.x + side * gap * 0.35; y = oy - 34 * sO; }
      if (T.kind === 'front-of') { x = q.x + side * gap * 0.35; y = oy + 40 * sO; }
      // (hovering, the ground under it need not be clear of the other actor's feet: only the gap counts)
      let [px, py] = air ? over(x, y) : this.walkable(rec, A, x, y, t, T.who);
      if (Math.sign(px - q.x) !== side && T.kind === 'near') { side = -side; [px, py] = this.walkable(rec, A, q.x + side * gap, y, t, T.who); }
      return { ...groundPos(S, px, py, A.k), faceTo: px < q.x ? 1 : -1 };
    }
    throw new Error(`cannot resolve place ${JSON.stringify(target)}`);
  }
  // A walkable spot in front of (or below) an elevated anchor, on the side nearest `from`.
  approach(rec, A, pos, from, t) {
    const S = rec.S, a = S.anchor(pos.anchor), col = a.prop ? S.colliders().find(c => c.id === a.prop) : null;
    const s = S.scaleAt(pos.x, a.depth) * A.k, half = A.sz.width * s * 0.5;
    const y = col ? col.y + col.ry + 4 : a.depth + 4;
    const pref = from && Number.isFinite(from.x) ? Math.sign(from.x - pos.x) || -1 : -1;
    for (const side of [pref, -pref]) for (let d = (col ? Math.min(col.rx * 0.45, half) : 0); d < 600; d += 8) {
      const x = pos.x + side * d;
      if (S.isWalkable(x, y) && !insideCollider(S, x, y, half * 0.4, 4)) return { ...groundPos(S, x, y, A.k), face: -side || 1 };
    }
    const p = S.nearestWalkable(pos.x, y) || [pos.x, y];
    return groundPos(S, p[0], p[1], A.k);
  }

  // ───────────── locomotion ─────────────
  gaitFor(A, want) {
    const g = A.rig.gaits || {};
    if (want === 'hop') return g.hop ? 'hop' : A.rig.gestures?.jump ? '#hops' : 'walk';
    if (want === 'fly') return g.fly ? 'fly' : 'walk';
    if (g[want]) return want;
    if (want === 'run') return g.run ? 'run' : g.trot ? 'trot' : 'walk';
    return g.walk ? 'walk' : Object.keys(g)[0];
  }
  routeLegs(rec, A, from, to, gait, mult, { lead = null, tail = null, face0 = 1 } = {}) {
    const S = rec.S, rig = A.rig, s0 = (from.s + to.s) / 2, rx = Math.max(10, A.sz.width * s0 * 0.3), ry = Math.max(4, rx * 0.3);
    let pts = S.route([from.x, from.y], [to.x, to.y], { rx, ry });
    if (pts.blocked) this.warn(`${A.id}: no clear route to (${Math.round(to.x)}, ${Math.round(to.y)}) in ${rec.id}; stopping at the nearest reachable point`);
    if (!pts.length) pts = Object.assign([[from.x, from.y], [to.x, to.y]], { stones: [] });
    let P = pts.map(p => [p[0], p[1]]), shift = lead ? lead.length : 0;
    // the route starts at the nearest walkable cell: keep the actor's real start so nothing jumps
    if (Math.hypot(P[0][0] - from.x, P[0][1] - from.y) > 0.5) { P.unshift([from.x, from.y]); shift++; }
    if (lead) P = [...lead, ...P];
    const sIdx = new Set((pts.stones || []).map(i => i + shift));
    if (!sIdx.size) P = this.detour(rec, A, P, s0);
    if (tail) P = [...P, ...tail];
    const legs = [];
    const gName = gait === '#hops' ? null : gait;
    const speed = (A.sz.speeds[gName] ?? A.sz.speeds.walk ?? 40) * mult;
    const stride = gait === '#hops' ? A.sz.width * 1.05 : (A.sz.stride[gName] ?? A.sz.stride.walk ?? 30);
    const cycleDur = gait === '#hops' ? (rig.gestures.jump.dur || 0.8) / Math.sqrt(mult) : 0;
    let run = [P[0]], phase = 0;
    const stonePos = i => ({ ...groundPos(S, P[i][0], P[i][1], A.k), mode: 'surface', surface: 'stone' });
    const flush = (rampOut) => {
      if (run.length < 2) { run = [run[run.length - 1]]; return; }
      const L = new RouteLeg({ S, pts: run, k: A.k, gait: gName || 'walk', speed, stride, phase0: phase, rampIn: !legs.length || legs[legs.length - 1].type !== 'route', rampOut, face0, rig, cycleDur });
      if (L.len > 0.5) { legs.push(L); phase = L.phaseAt(L.T); }
      run = [run[run.length - 1]];
    };
    for (let i = 0; i < P.length - 1; i++) {
      if (sIdx.has(i) || sIdx.has(i + 1)) {
        flush(true);
        const a = sIdx.has(i) ? stonePos(i) : groundPos(S, P[i][0], P[i][1], A.k), b = sIdx.has(i + 1) ? stonePos(i + 1) : groundPos(S, P[i + 1][0], P[i + 1][1], A.k);
        legs.push(new JumpLeg({ A: a, B: b, rig, sz: A.sz, face0: legs.length ? legs[legs.length - 1].face1 : face0 }));
        run = [P[i + 1]];
      } else run.push(P[i + 1]);
    }
    flush(true);
    return { legs, end: P[P.length - 1] };
  }
  // Walk around (in front of) other actors standing on the way instead of through them.
  detour(rec, A, P, s, t = this.tNow ?? 0) {
    const S = rec.S, me = this.footprint(A, s);
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const [id, O] of rec.actors) {
        if (O === A || !O.place0 || !O.visibleAt(t)) continue;
        const q = O.posAt(t); if (q.mode !== 'ground') continue;
        const rx = (me.w + this.footprint(O, q.s).w) * 0.42, ry = 16 * Math.max(s, q.s);
        for (let i = 0; i < P.length - 1; i++) {
          const [x0, y0] = P[i], [x1, y1] = P[i + 1], dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
          const u = clamp(((q.x - x0) * dx + (q.y - y0) * dy) / L2), cx = x0 + dx * u, cy = y0 + dy * u;
          const ex = (cx - q.x) / rx, ey = (cy - q.y) / ry;
          if (ex * ex + ey * ey >= 1 || u <= 0.02 || u >= 0.98) continue;
          // pass in front if there is room, else behind
          let w = null;
          for (const side of [1, -1]) {
            const wy = q.y + side * (ry + 12 * s), wx = q.x;
            if (S.isWalkable(wx, wy) && S.isWalkable(q.x - rx, wy) && S.isWalkable(q.x + rx, wy)) { w = [[q.x - Math.sign(dx || 1) * rx, wy], [q.x + Math.sign(dx || 1) * rx, wy]]; break; }
          }
          if (!w) continue;
          P = [...P.slice(0, i + 1), ...w, ...P.slice(i + 1)]; changed = true; break;
        }
      }
      if (!changed) break;
    }
    return P;
  }
  // Legs from p0 to dest for a walk/run/hop/fly, including getting down from and up onto elevated places.
  path(rec, A, p0, dest, kind, gait, mult, opts = {}) {
    const rig = A.rig, flier = !!(rig.flies && rig.gaits?.fly), legs = [];
    const flySpeed = (A.sz.speeds.fly ?? 150) * mult;
    // (a hoverer flies wherever it goes next, landing there)
    if (kind === 'fly' || p0.hover != null || dest.hover != null || (flier && (p0.mode !== 'ground' || dest.mode !== 'ground') && kind !== 'walk')) {
      return { legs: [new FlyLeg({ A: p0, B: dest, rig, sz: A.sz, speed: flySpeed })], end: dest };
    }
    let cur = p0;
    if (cur.mode !== 'ground' && cur.mode !== 'off' && !(cur.mode === 'surface' && rec.S.onStone(cur.x, cur.y))) {
      const g = this.approach(rec, A, cur, dest, 0);
      legs.push(new JumpLeg({ A: cur, B: g, rig, sz: A.sz, face0: opts.face0 ?? (p0.face || 1) })); cur = g;
    }
    let target = dest, up = null;
    const stone = p => p.mode === 'surface' && rec.S.onStone(p.x, p.y);
    if (dest.mode !== 'ground' && !stone(dest)) { up = dest; target = this.approach(rec, A, dest, cur, 0); }
    const r = this.routeLegs(rec, A, cur, target, gait, mult, { face0: opts.face0 ?? (p0.face || 1), ...opts });
    legs.push(...r.legs);
    let end = up || { ...groundPos(rec.S, r.end[0], r.end[1], A.k), anchor: target.anchor ?? null, faceTo: dest.faceTo, face: dest.face };
    if (up) legs.push(new JumpLeg({ A: { ...groundPos(rec.S, r.end[0], r.end[1], A.k) }, B: up, rig, sz: A.sz, face0: legs.length ? legs[legs.length - 1].face1 : opts.face0 ?? (p0.face || 1) }));
    return { legs, end };
  }
  addMove(A, t, legs, kind, end, b, extra = {}) {
    const total = legs.reduce((a, L) => a + L.T, 0);
    this.made = null;
    // (into a hover the flapping goes straight on: no blend back to a resting pose)
    const mv = { t0: t, t1: t + total, legs, kind, end, beat: b, ...(end?.hover != null ? { noBlendOut: true } : {}), ...extra };
    if (!legs.length || total <= 1e-6) {
      if (b.face) { A.faceEv.push({ t, face: faceVal(b.face), flip: faceVal(b.face) !== A.faceAt(t) }); A.faceEv.sort((a, c) => a.t - c.t); }
      if (b.pose) A.setPose(t, b.pose, 0.3, 'beat');
      return 0;
    }
    const face0 = A.faceAt(t - 1e-6);
    if (!this.T3) this.carryStride(A, t, legs);   // (3D: the 3D actor moves and turns itself)
    A.addMove(mv); this.made = mv;
    if (!this.T3) this.legTurns(A, mv, face0);
    A.sleepEv.push({ t, asleep: false }); A.sleepEv.sort((a, c) => a.t - c.t);
    // (cut at once by a move laid earlier that starts during it: it has no end, and takes only until the cut)
    if (mv.cut !== undefined) return mv.cut - t;
    const last = legs[legs.length - 1], moveFace = last.face1 ?? A.faceAt(mv.t1 - 1e-4);
    const endFace = faceVal(b.face) || end.faceTo || moveFace;
    A.faceEv.push({ t: mv.t1, face: endFace, src: mv, flip: endFace !== moveFace });
    A.faceEv.sort((a, c) => a.t - c.t);
    const endPose = b.pose ?? b.end ?? (end.mode === 'perch' ? (rigPose(A.rig, 'perch')?.name || 'stand') : end.mode === 'mount' ? (rigPose(A.rig, 'sit')?.name || 'stand') : 'stand');
    A.setPose(mv.t1, endPose, 0, mv);
    return total;
  }
  // A move that starts as the one before it ends (within a frame) or cuts into it, on the same gait, goes on with its
  // stride where it was, so the legs carry straight on instead of blending through a fresh step.
  carryStride(A, t, legs) {
    const prev = A.moveAt(t - 1e-6), L0 = legs[0];
    if (!prev || prev.place || !prev.legs.length || t - A.end(prev) >= 1 / this.fps || L0.type !== 'route' || L0.hops) return;
    const r = A.legAt(prev, Math.min(t, A.end(prev)));
    if (r.L.type !== 'route' || r.L.hops || r.L.gait !== L0.gait) return;
    const d = r.L.phaseAt(r.τ) - L0.phase0;
    for (const L of legs) if (L.type === 'route') { L.phase0 += d; L.args.phase0 = L.phase0; }
  }
  // A move turns through the squash (a flip event, dropped with the rest of the move if a later one cuts it) where it
  // sets off the other way from face0 (the way the actor faced), where a leg faces otherwise than the one before it,
  // and where a route turns back.
  legTurns(A, mv, face0) {
    let f = face0, τ0 = 0;
    const flip = (τ, face) => { if (face !== f && mv.t0 + τ < A.end(mv)) A.faceEv.push({ t: mv.t0 + τ, face, flip: true, src: mv }); f = face; };
    for (const L of mv.legs) {
      flip(τ0, L.at(0).face ?? 1);
      if (L.type === 'route') for (let i = 1; i < L.F.length; i++) {
        if (L.F[i] === L.F[i - 1]) continue;
        // (the route's facing switches half way between the two samples)
        const u = (L.U[i - 1] + L.U[i]) / 2; let a = 0, b = L.T;
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (L.uAt(m) < u) a = m; else b = m; }
        flip(τ0 + b, L.F[i]);
      }
      τ0 += L.T;
    }
    A.faceEv.sort((a, c) => a.t - c.t);
  }
  move(rec, srec, A, b, t, kind) {
    this.tNow = t;
    const p0 = A.posAt(t), mult = b.speed ?? 1;
    const gait = b.gait && A.rig.gaits?.[b.gait] ? b.gait : this.gaitFor(A, kind);
    if (parseTarget(b.to).kind === 'on') return this.hopOn(rec, A, b, t, p0, mult);
    if (p0.mode === 'mount' && kind !== 'fly') {
      if (kind !== 'hop') throw new Error(`${A.id} is riding ${p0.carrier}: it can only hop off (do: hop) or be placed`);
      return this.hopOff(rec, A, b, t, p0, gait, mult);
    }
    if (b.wade && (kind === 'walk' || kind === 'run') && p0.mode === 'ground') return this.wade(rec, A, b, t, p0, gait, mult);
    // "height": the flight ends hovering that high above the place
    const air = b.height != null;
    let dest = this.place(rec, A, b.to, t, p0, air);
    if (air) dest = this.hoverPos(rec, A, dest, b.height);
    if (Math.hypot(dest.x - p0.x, dest.y - p0.y) < 2 && dest.mode === p0.mode && Math.abs((dest.hover ?? 0) - (p0.hover ?? 0)) < 0.5) return this.addMove(A, t, [], kind, dest, b);
    const { legs, end } = this.path(rec, A, p0, dest, kind, gait, mult, { face0: A.faceAt(t) });
    return this.addMove(A, t, legs, kind, end, b, { framing: 'all', from: p0 });
  }
  // Hop onto a carrier: hop over to it first if it is out of reach, then jump onto its riding point, which keeps
  // moving with it during the jump. The rider lands facing the way the carrier faces (unless "face" is given).
  hopOn(rec, A, b, t, p0, mult) {
    const C = rec.actors.get(parseTarget(b.to).who), legs = [];
    this.place(rec, A, b.to, t);                                  // validates the carrier
    let cur = p0, tj = t;
    const cp = C.posAt(t), reach = A.sz.height * p0.s * 2.6 + C.sz.width * cp.s * 0.5;
    if ((p0.mode === 'ground' || p0.hover != null) && Math.hypot(cp.x - p0.x, cp.y - p0.y) > reach) {
      const near = this.place(rec, A, `near:${C.id}`, t, p0), r = this.path(rec, A, p0, near, 'hop', this.gaitFor(A, 'hop'), mult, { face0: A.faceAt(t) });
      legs.push(...r.legs); cur = groundPos(rec.S, r.end.x, r.end.y, A.k); tj = t + legs.reduce((a, L) => a + L.T, 0);
    }
    const Afn = cur.mode === 'mount' && cur.carrier ? (O => τ => O.mountAt(tj + τ, A))(rec.actors.get(cur.carrier)) : null;
    const face0 = legs.length ? legs[legs.length - 1].face1 : A.faceAt(t);
    let J = new JumpLeg({ A: cur, B: C.mountAt(tj + 0.6, A), rig: A.rig, sz: A.sz, face0 });
    const B = C.mountAt(tj + J.T * 0.78, A);
    J = new JumpLeg({ A: cur, B, rig: A.rig, sz: A.sz, Afn, Bfn: τ => C.mountAt(tj + τ, A), face0 });
    legs.push(J);
    return this.addMove(A, t, legs, 'hop', { ...B, faceTo: C.faceAt(tj + J.T) }, b, { framing: 'all', from: p0, mount: C });
  }
  // Hop off a carrier: a jump from its (moving) riding point to the target, or to the ground beside the carrier on
  // the target's side and on from there.
  hopOff(rec, A, b, t, p0, gait, mult) {
    const C = rec.actors.get(p0.carrier), S = rec.S, cp = C.posAt(t);
    const dest = this.place(rec, A, b.to, t, p0), reach = A.sz.height * dest.s * 2.6 + C.sz.width * cp.s * 0.5;
    let land = dest;
    if (dest.mode !== 'ground' || Math.hypot(dest.x - cp.x, dest.y - cp.y) > reach) {
      const side = Math.sign(dest.x - cp.x) || A.faceAt(t), fc = this.footprint(C, cp.s), fa = this.footprint(A, dest.s);
      const [x, y] = this.walkable(rec, A, cp.x + side * (Math.max(fc.front, fc.back) + fa.w * 0.7 + 8), cp.y, t);
      land = groundPos(S, x, y, A.k);
    }
    const J = new JumpLeg({ A: p0, B: land, rig: A.rig, sz: A.sz, Afn: τ => C.mountAt(t + τ, A), face0: A.faceAt(t) }), legs = [J];
    let end = land;
    if (land !== dest) { const r = this.path(rec, A, land, dest, 'hop', gait, mult, { face0: J.face1 }); legs.push(...r.legs); end = r.end; }
    return this.addMove(A, t, legs, 'hop', end, b, { framing: 'all', from: p0 });
  }
  // A walk that may cross water: straight to the target (around actors standing in the way), sinking while in the
  // water. A target in the water is kept there. Falls back to the dry route when a solid prop is in the way.
  wade(rec, A, b, t, p0, gait, mult) {
    const S = rec.S, T = parseTarget(b.to);
    const dest = T.kind === 'x' || T.kind === 'xy' ? groundPos(S, T.x, T.kind === 'xy' ? T.y : S.laneAt(T.x), A.k) : this.place(rec, A, b.to, t, p0);
    if (dest.mode !== 'ground') { const r = this.path(rec, A, p0, dest, 'walk', gait, mult, { face0: A.faceAt(t) }); return this.addMove(A, t, r.legs, 'walk', r.end, b, { framing: 'all', from: p0 }); }
    const s0 = (p0.s + dest.s) / 2, rx = Math.max(10, A.sz.width * s0 * 0.3) * 0.5;
    const L = Math.hypot(dest.x - p0.x, dest.y - p0.y), n = Math.max(1, Math.ceil(L / 6));
    for (let i = 1; i < n; i++) {
      const x = p0.x + (dest.x - p0.x) * i / n, y = p0.y + (dest.y - p0.y) * i / n;
      if (insideCollider(S, x, y, rx, rx * 0.3)) {
        this.warn(`${A.id}: a solid prop is in the way of the wade in ${rec.id}; taking the dry route`);
        const r = this.path(rec, A, p0, this.place(rec, A, b.to, t, p0), 'walk', gait, mult, { face0: A.faceAt(t) });
        return this.addMove(A, t, r.legs, 'walk', r.end, b, { framing: 'all', from: p0 });
      }
    }
    if (L < 2) return this.addMove(A, t, [], 'walk', dest, b);
    const P = this.detour(rec, A, [[p0.x, p0.y], [dest.x, dest.y]], s0, t);
    const speed = (A.sz.speeds[gait] ?? A.sz.speeds.walk ?? 40) * mult, stride = A.sz.stride[gait] ?? A.sz.stride.walk ?? 30;
    const leg = new RouteLeg({ S, pts: P, k: A.k, gait, speed, stride, face0: A.faceAt(t), rig: A.rig, wade: { depth: b.depth ?? null, height: A.sz.height, sink0: p0.sink || 0 } });
    return this.addMove(A, t, [leg], b.do === 'run' ? 'run' : 'walk', { ...leg.at(leg.T), faceTo: dest.faceTo }, b, { framing: 'all', from: p0, wade: true });
  }
  // A provisional camera for the shot at time t (used to know where "off screen" is before cameras exist).
  provisional(rec, srec, t, override = {}) {
    const spec = srec.def.camera || {}, ids = this.subjectIds(rec, srec);
    const subs = ids.map(id => this.subject(rec, id, t, override[id])).filter(Boolean);
    const F = frameSubjects(subs, spec.size || (ids.length ? 'wide' : 'establishing'), { W: this.W, H: this.H, angle: spec.angle, S: rec.S, zoomK: spec.zoom || 1, focus: spec.focus, z: spec.z, lens: rec.S.lens });
    return clampFrame(rec.S, F, this.W, this.H);
  }
  // Where an actor entering or leaving at a side is out of frame: past the edge of every view the shot may show then
  // (its framing now and, for a pan, a push-in or a pull-out, the framings at either end of the move). edge: a point
  // just inside the present view. za: the actor's depth there (a view at depth c shows it out to W/2/(zoom × p) either
  // side of its centre, p = (D − c)/(D + za − c): farther than the stage, it must go farther out; DESIGN §10).
  offscreenX(rec, srec, A, side, t, override, y, za = 0) {
    const cam = this.provisional(rec, srec, t, override), spec = srec.def.camera || {}, ids = this.subjectIds(rec, srec), W = this.W, H = this.H;
    const views = [cam], frame = (list, size) => {
      const subs = list.map(id => this.subject(rec, id, t, override[id])).filter(Boolean);
      return subs.length ? clampFrame(rec.S, frameSubjects(subs, size, { W, H, angle: spec.angle, S: rec.S, zoomK: spec.zoom || 1, focus: spec.focus, z: spec.z, lens: rec.S.lens }), W, H) : null;
    };
    const size = spec.size || (ids.length ? 'wide' : 'establishing');
    if (spec.move === 'pan' && ids.length >= 2) views.push(frame([ids[0]], size), frame([ids[ids.length - 1]], size));
    if (spec.move === 'pull-out' || spec.move === 'push-in') {
      if (spec.to || spec.toOn) views.push(frame(spec.toOn ? [].concat(spec.toOn) : ids, spec.to || size));
      const k = spec.zoomTo ? Math.min(1, spec.zoomTo) : 1 / 1.3;
      for (const v of views.slice()) if (v) views.push(clampFrame(rec.S, { ...v, zoom: v.zoom * k }, W, H));
    }
    // (a camera pulled back through depth ends on more of the stage: its zoom × (D − zTo)/(D − z); DESIGN §10)
    if (spec.zTo < (spec.z ?? 0)) { const D = rec.S.lens, k = (D - (spec.z ?? 0)) / (D - spec.zTo); for (const v of views.slice()) if (v) views.push({ ...v, zoom: v.zoom * k, z: spec.zTo }); }
    const vz = v => (za ? v.zoom * Math.max(0.05, depthScale({ z: v.z ?? spec.z ?? 0, lens: rec.S.lens }, za)) : v.zoom);
    const ext = views.filter(Boolean).map(v => v.cx + (side === 'left' ? -1 : 1) * W / 2 / vz(v));
    const half = W / 2 / vz(cam), far = side === 'left' ? Math.min(...ext) : Math.max(...ext);
    const m = this.offMargin(A, rec.S.scaleAt(cam.cx, y) * A.k);
    return { off: side === 'left' ? far - m : far + m, edge: side === 'left' ? cam.cx - half + 30 : cam.cx + half - 30, cam };
  }
  // How far past a frame edge an actor's contact point must be for all of it (a tail swinging out behind a walk) to
  // be out of frame.
  offMargin(A, s) {
    const fp = this.footprint(A, s);
    return Math.max(fp.front, fp.back, A.sz.width * s) * 1.2 + 30;
  }
  enter(rec, srec, b, t) {
    this.tNow = t;
    const A = this.ensure(b.who), S = rec.S;
    srec.refs.add(b.who);
    const fromT = b.from !== undefined ? parseTarget(b.from) : { kind: 'side', side: A.offSide || 'left' };
    if (!A.place0) this.initOff(rec, A, fromT.kind === 'side' ? fromT.side : 'left', rec.t0);
    const mult = b.speed ?? 1, kind = b.run ? 'run' : 'walk';
    const gait = b.gait && A.rig.gaits?.[b.gait] ? b.gait : this.gaitFor(A, kind);
    A.visEv.push({ t, visible: true }); A.visEv.sort((a, c) => a.t - c.t);
    // "height": the entrance ends hovering that high above its place; "fly": true: a flier flies in (from above when it
    // comes in from a side) instead of making its way along the ground
    const air = b.height != null, hover = pos => (air ? this.hoverPos(rec, A, pos, b.height) : pos);
    if (fromT.kind !== 'side') {
      // appear at a place (out of a hollow, from behind a tree) and walk on
      let p0 = this.place(rec, A, b.from, t, null, air && !b.to);
      if (!b.to) p0 = hover(p0);
      A.addMove({ t0: t, t1: t, place: p0, legs: [], kind: 'place' });
      if (!b.to) return 0;
      const dest = hover(this.place(rec, A, b.to, t, p0, air)), { legs, end } = this.path(rec, A, p0, dest, b.fly ? 'fly' : kind, gait, mult);
      return this.addMove(A, t, legs, 'enter', end, b, { framing: 'all', from: p0 });
    }
    const side = fromT.side;
    // (the depth it comes in at: the beat's or its destination's, else its own; DESIGN §10)
    const za = this.targetZ(rec, b, t) ?? this.zAt(A, t);
    // destination: given, or a third of the way into the frame from the entry side (as its depth shows it)
    let dest;
    if (b.to) dest = this.place(rec, A, b.to, t, null, air);
    else {
      const cam = this.provisional(rec, srec, t), p = za ? Math.max(0.05, depthScale({ z: cam.z ?? 0, lens: S.lens }, za)) : 1, half = this.W / 2 / (cam.zoom * p), x = cam.cx + (side === 'left' ? -half * 0.45 : half * 0.45);
      dest = this.place(rec, A, `x:${Math.round(x)}`, t);
    }
    dest = hover(dest);
    const yRef = dest.mode === 'ground' || dest.hover != null ? dest.y : S.laneAt(dest.x);
    const { off, edge } = this.offscreenX(rec, srec, A, side, t, { [A.id]: dest }, yRef, za);
    // the way in runs from off screen past the frame edge to the destination; a destination nearer the entry side than
    // the edge is walked straight to (never past it and back)
    let ex = clamp(edge, S.area.x0 + 20, S.area.x1 - 20);
    if ((ex - dest.x) * (side === 'left' ? 1 : -1) > 0) ex = dest.x;
    const e = S.nearestWalkable(ex, yRef) || [ex, yRef];
    const start = { ...groundPos(S, off, e[1], A.k) };
    A.addMove({ t0: t - 1e-6, t1: t - 1e-6, place: start, legs: [], kind: 'place' });
    let legs, end;
    if (A.rig.flies && A.rig.gaits?.fly && (dest.mode !== 'ground' || b.fly)) {
      // in from above (to a perch, or "fly": true), or into a hover level at its height
      const hi = dest.hover != null && !b.fly ? { ...start, lift: (dest.hover * dest.s) / start.s, mode: 'air', depth: start.y } : { ...start, y: start.y - 260 * start.s, mode: 'air', depth: start.y };
      ({ legs, end } = { legs: [new FlyLeg({ A: hi, B: dest, rig: A.rig, sz: A.sz, speed: (A.sz.speeds.fly ?? 150) * mult })], end: dest });
    } else {
      const entry = groundPos(S, e[0], e[1], A.k);
      const r = this.path(rec, A, entry, dest, kind, gait, mult, { lead: [[off, e[1]]], face0: side === 'left' ? 1 : -1 });
      legs = r.legs; end = r.end;
    }
    return this.addMove(A, t, legs, 'enter', end, b, { framing: 'end', from: start });
  }
  exit(rec, srec, A, b, t) {
    this.tNow = t;
    const S = rec.S, p0 = A.posAt(t), mult = b.speed ?? 1, T = parseTarget(b.to);
    if (p0.mode === 'mount') throw new Error(`${A.id} is riding ${p0.carrier}: hop off before it exits`);
    const kind = b.run ? 'run' : 'walk', gait = b.gait && A.rig.gaits?.[b.gait] ? b.gait : this.gaitFor(A, kind);
    let legs, end;
    if (T.kind !== 'side') {
      const dest = this.place(rec, A, b.to, t, p0);
      ({ legs, end } = this.path(rec, A, p0, dest, kind, gait, mult));
    } else {
      const yRef = p0.mode === 'ground' ? p0.y : S.laneAt(p0.x);
      // (off screen at the depth it leaves at: the beat's, else its own)
      const { off, edge } = this.offscreenX(rec, srec, A, T.side, t, {}, yRef, b.z ?? this.zAt(A, t));
      const ex = clamp(edge, S.area.x0 + 20, S.area.x1 - 20), e = S.nearestWalkable(ex, yRef) || [ex, yRef];
      if (A.rig.flies && A.rig.gaits?.fly && p0.mode !== 'ground') {
        const hi = { ...groundPos(S, off, e[1], A.k), y: e[1] - 300, mode: 'air', depth: e[1] };
        legs = [new FlyLeg({ A: p0, B: hi, rig: A.rig, sz: A.sz, speed: (A.sz.speeds.fly ?? 150) * mult })]; end = hi;
      } else {
        const r = this.path(rec, A, p0, groundPos(S, e[0], e[1], A.k), kind, gait, mult, { tail: [[off, e[1]]] });
        legs = r.legs; end = groundPos(S, off, e[1], A.k);
      }
    }
    const dur = this.addMove(A, t, legs, 'exit', end, b, { framing: 'start', from: p0, final: T.kind === 'side' ? { ...end, mode: 'off' } : null, side: T.kind === 'side' ? T.side : null });
    if (T.kind === 'side' && this.made?.cut === undefined) { const mv = A.moves[A.moves.length - 1]; A.visEv.push({ t: t + dur, visible: false, src: mv }); A.visEv.sort((a, c) => a.t - c.t); }
    return dur;
  }

  // ───────────── depth (DESIGN §10) ─────────────
  // An actor's z at t: its depth changes eased in turn (0 before any); a rider has its carrier's.
  zAt(A, t) {
    const C = A.carrierAt(t);
    if (C && C !== A) return this.zAt(C, t);
    let z = 0;
    for (const e of this.zs.get(A) || []) { if (t < e.t0) break; z = t >= e.t1 ? e.z1 : lerp(e.z0, e.z1, easeIO((t - e.t0) / (e.t1 - e.t0))); }
    return z;
  }
  // The depth a beat takes an actor to: its own "z", else that of the place it goes to (t: when it gets there): a named
  // anchor's (0 when it declares none: a named place is on the stage unless it says otherwise), the carrier's it lands
  // on ("on:X"), the actor's it goes beside ("near:X", "left-of:X", …, or an actor's name). undefined: it keeps its
  // depth (a point "x:…", a side, a beat without a place).
  targetZ(rec, b, t) {
    if (b.z !== undefined) return b.z;
    const to = b.to ?? (b.do === 'place' && typeof b.at === 'string' ? b.at : undefined);
    if (to === undefined) return undefined;
    const T = parseTarget(to), S = rec.S;
    if (T.kind === 'name' && S.anchorNames.includes(T.name)) return S.anchor(T.name).z ?? 0;
    const O = rec.actors.get(T.kind === 'name' ? T.name : T.who);
    return O && ['name', 'on', 'near', 'left-of', 'right-of', 'behind', 'front-of'].includes(T.kind) ? this.zAt(O, t) : undefined;
  }
  // A beat that changes an actor's depth (targetZ), eased over the beat (dur: the action's; a "set" takes its own "dur";
  // an entrance takes it at once, from off screen, or appears at its place's depth and then eases to its destination's).
  // A rider hopping off starts from its carrier's depth (keeping it when the hop goes to a point), and one hopping on
  // eases to its carrier's by the landing. → how long the change itself takes (a set's dur).
  depthBeat(rec, b, t, dur) {
    const A = rec.actors.get(b.who);
    if (!A || !DEPTH_DO.includes(b.do)) return 0;
    const list = this.zs.get(A) || [], add = (t0, t1, z0, z1) => { list.push({ t0, t1, z0, z1 }); list.sort((p, q) => p.t0 - q.t0); this.zs.set(A, list); };
    // (riding until now: the carrier's depth, where it starts from)
    const C = A.carrierAt(t - 1e-6), z0 = C && C !== A ? this.zAt(C, t) : this.zAt(A, t);
    if (b.do === 'enter') {
      const F = b.from !== undefined ? parseTarget(b.from) : null, at = F && F.kind !== 'side' ? this.targetZ(rec, { to: b.from }, t) : undefined;
      const z1 = this.targetZ(rec, b, t + dur);
      if (at !== undefined) { if (at !== z0) add(t, t, at, at); if (z1 !== undefined && z1 !== at) add(t, t + dur, at, z1); }
      else if (z1 !== undefined && z1 !== z0) add(t, t, z1, z1);
      return 0;
    }
    const d = b.do === 'set' ? b.dur ?? 0 : dur, z1 = this.targetZ(rec, b, t + d) ?? (C && C !== A ? z0 : undefined);
    if (z1 !== undefined && !(z1 === z0 && z0 === this.zAt(A, t))) add(t, t + d, z0, z1);
    return b.do === 'set' && b.z !== undefined ? d : 0;
  }
  // The scene uses depth: an actor in it is ever off the stage.
  usesDepth(rec) { return [...rec.actors.values()].some(A => (this.zs.get(A) || []).some(e => e.z0 || e.z1)); }
  // An actor standing (on the ground, a perch, a hollow) off the stage on a set that paints its stage (a ground layer or
  // props): its depth draws it away from the painted spot it stands on (smaller or larger, nearer the frame centre or
  // farther from it), so it slides over the ground as the camera moves, and it is drawn behind (z > 0) or in front of
  // (z < 0) everything on the stage whatever its ground y. Said once per actor and scene, of a depth it holds (not
  // while a beat changes it: a hop onto a carrier off the stage); fliers in the air may have any depth.
  groundDepth(rec) {
    const S = rec.S, painted = (S.def.layers || []).some(l => l.k === 1 && !l.front) || (S.def.props || []).length > 0;
    if (!painted) return;
    for (const A of rec.actors.values()) {
      const list = this.zs.get(A) || [];
      if (!list.some(e => e.z0 || e.z1)) continue;
      for (let t = rec.t0; t < rec.t1; t += 0.25) {
        const z = this.zAt(A, t), mode = A.posAt(t)?.mode;
        if (Math.abs(z) < 1 || !A.visibleAt(t) || !['ground', 'perch', 'hollow'].includes(mode) || list.some(e => t > e.t0 && t < e.t1)) continue;
        this.warn(`${rec.id}: ${A.id} stands on ${mode === 'ground' ? 'the ground' : `a ${mode}`} at z ${Math.round(z)} (${(t - rec.t0).toFixed(2)} s into the scene) on set ${S.id}, which paints its stage: off the stage it slides over the ground as the camera moves and is drawn ${z > 0 ? 'behind everything on the stage whatever its ground y (and beyond the set\'s nearest backdrop layer, behind that layer and the painted ground too)' : 'in front of everything on the stage whatever its ground y'}. Keep figures that stand at z 0; depth is for fliers, effect pieces (api.item) and sets with no painted ground`);
        break;
      }
    }
  }

  // ───────────── framing subjects ─────────────
  subjectIds(rec, srec) {
    const on = srec.def.camera?.on;
    if (on) return (typeof on === 'string' ? [on] : on).slice();
    const ids = [...srec.refs].filter(id => rec.actors.has(id));
    if (ids.length) return ids;
    return [...rec.actors.keys()].filter(id => rec.actors.get(id).place0);
  }
  framingPos(A, t) {
    const mv = A.moveAt(t);
    if (mv && !mv.place && t < A.end(mv)) {
      if (mv.framing === 'end') return { ...(mv.end || A.posAt(mv.t1)), mode: 'ground' };
      if (mv.framing === 'start' && mv.from) return mv.from;
    }
    return A.posAt(t);
  }
  // win: [t0, t1] of the shot being framed; velocity samples stay inside it (a teleport in the next shot is not motion)
  subject(rec, id, t, override, win = null) {
    const A = rec.actors.get(id), S = rec.S;
    if (A) {
      if (!A.place0) return null;
      const pos = override || this.framingPos(A, t);
      if (!override && (!A.visibleAt(t) || pos.mode === 'off')) {
        // an actor about to enter is framed at its destination; otherwise it is not a subject now
        return null;
      }
      const face = override?.faceTo || A.faceAt(t), moving = A.moving(t);
      const g = moving ? null : A.gest.find(G => t >= G.t0 && t < G.t1);
      // the head as it is held then (looking up / down, turned toward someone), so a close shot keeps it in frame (a
      // glance's pitch at a speaker stays inside the headroom: the frame doesn't loosen for it)
      const hd = override ? null : { tilt: A.tiltAt(t, false), look: A.lookAt(t, pos) };
      // (a hoverer: the reach of its beating wings and its bob, about the hover's height)
      const hov = pos.hover != null && canHover(A.rig);
      const pr = hov ? hoverProfile(A.rig, A.paramsAt(t), hd) : g ? gestureProfile(A, g, t) : profile(A.rig, moving ? 'stand' : A.basePoseName(t), A.paramsAt(t), hd), s = pos.s;
      const yb = pos.y - (hov ? pos.hover : pos.lift || 0) * s, b = pr.box;
      let box = face > 0 ? [pos.x + b[0] * s, yb + b[1] * s, pos.x + b[2] * s, yb + b[3] * s] : [pos.x - b[2] * s, yb + b[1] * s, pos.x - b[0] * s, yb + b[3] * s];
      // on a slope the drawing turns about the contact point (the pitch it takes there)
      const th = A.pitchFor(pos, t), turn = th ? turnAbout(pos.x, pos.y, th) : null;
      if (turn) box = turn.box(box);
      // a carrier is framed with its riders (one figure); they move with its framing position (an entrance's end)
      if (!override) {
        const real = A.posAt(t), dx = pos.x - real.x, dy = pos.y - real.y;
        for (const [rid, R] of rec.actors) {
          if (R === A || !R.place0 || R.carrierAt(t) !== A) continue;
          const r = this.subject(rec, rid, t, null, win);
          if (r) box = [Math.min(box[0], r.box[0] + dx), Math.min(box[1], r.box[1] + dy), Math.max(box[2], r.box[2] + dx), Math.max(box[3], r.box[3] + dy)];
        }
      }
      const ta = Math.max(win ? win[0] : rec.t0, t - 0.15), tb = win ? Math.max(ta, Math.min(t + 0.15, win[1] - 1e-3)) : t + 0.15;
      const p1 = A.posAt(tb), p_ = A.posAt(ta), vx = tb - ta > 0.02 ? (p1.x - p_.x) / (tb - ta) : 0;
      // the resting head (base pose, on the ground): what close shots compose, ignoring jump and gesture apexes
      const rest = moving || !g || hov ? pr : profile(A.rig, A.basePoseName(t), A.paramsAt(t), hd), y0 = A.actionAt(t) === 'fly' || pos.hover != null ? yb : pos.y;
      // now: where the drawing really is when it is framed elsewhere (an exit framed where it starts)
      const real = override ? pos : A.posAt(t), now = real.x !== pos.x || real.y !== pos.y ? [box[0] + real.x - pos.x, box[1] + real.y - pos.y, box[2] + real.x - pos.x, box[3] + real.y - pos.y] : null;
      let head = [pos.x + face * pr.head[0] * s, yb + pr.head[1] * s], restHead = [pos.x + face * rest.head[0] * s, y0 + rest.head[1] * s];
      if (turn) { head = turn.pt(head); restHead = turn.pt(restHead); }
      // (faceless: a rig with no expression beyond 'neutral', a planet or a prop, or one that says faceless: true: no
      // head for the captions to spare)
      const faceless = typeof A.rig.faceless === 'boolean' ? A.rig.faceless : !(A.rig.expressions || []).some(e => e !== 'neutral');
      return { id, box, head, rest: restHead, hh: A.sz.headHeight * s, face, vx, key: pos.key ?? pos.y, moving, now, faceless, z: this.zAt(A, t) };
    }
    const T = parseTarget(id);
    let x, y, s, raised = false, z = 0;
    if (T.kind === 'name' && S.anchorNames.includes(T.name)) { const a = S.anchor(T.name); x = a.x; y = a.y; s = a.s; raised = a.type !== 'ground'; z = a.z || 0; }
    else if (T.kind === 'x') { x = T.x; y = S.laneAt(T.x); s = S.scaleAt(x, y); }
    // (a world point "x:…,y:…", on the ground or in the air: itself the thing to look at, at the size things have on
    // the set's lane below it)
    else if (T.kind === 'xy') { x = T.x; y = T.y; s = S.scaleAt(x, S.laneAt(x)); raised = true; }
    else return null;
    // a ground point is framed like a figure standing there; a raised anchor (a stone's top, a branch, a hollow)
    // is itself the thing to look at, so close shots centre on it
    if (raised) return { id, box: [x - 60 * s, y - 60 * s, x + 60 * s, y + 50 * s], head: [x, y], rest: [x, y], hh: 40 * s, face: 0, vx: 0, z };
    return { id, box: [x - 60 * s, y - 110 * s, x + 60 * s, y], head: [x, y - 75 * s], rest: [x, y - 75 * s], hh: 40 * s, face: 0, vx: 0, z };
  }

  camera(rec, srec) {
    const spec = srec.def.camera || {}, ids = this.subjectIds(rec, srec);
    const size = spec.size || (ids.length ? 'wide' : 'establishing');
    const W = this.W, H = this.H;
    const win = [srec.t0, srec.t1], subjectsAt = (t, list) => list.map(id => this.subject(rec, id, t, null, win)).filter(Boolean);
    const othersAt = (t, list) => subjectsAt(t, [...rec.actors.keys()].filter(id => !list.includes(id) && rec.actors.get(id).place0));
    const cam = buildCamera({ spec, size, ids, subjectsAt, othersAt, t0: srec.t0, t1: srec.t1, S: rec.S, W, H, seed: hash32(srec.id), depth: this.usesDepth(rec) });
    // staging the camera can't frame at the size asked for: subjects too far apart for a two-shot of that size; or an
    // actor framed far under its own size because something else in "on" sets the framing: an anchor or other place
    // (no actor comes near its size), or a much bigger actor (under a sixth of its own size)
    if (ids.length >= 2 && cam.reach < 0.45 && size !== 'wide') {
      this.warn(`${srec.id}: the ${size} shot of ${ids.join(', ')} shows them at ${Math.round(cam.reach * 100)}% of the size each would get alone; they stand too far apart for a ${size} two-shot (stage them closer, or cut between singles)`);
    } else if (ids.length >= 2 && size !== 'wide') {
      const R = cam.reaches || {}, acts = ids.filter(id => rec.actors.has(id) && R[id] !== undefined);
      const top = Math.max(0, ...acts.map(id => R[id])), small = acts.filter(id => R[id] < (top < 0.45 ? 0.45 : 1 / 6)).sort((a, b) => R[a] - R[b])[0];
      const by = small && ids.filter(id => id !== small && R[id] !== undefined).sort((a, b) => R[b] - R[a])[0];
      if (small && by) this.warn(`${srec.id}: the ${size} shot of ${ids.join(', ')} shows ${small} at ${Math.round(R[small] * 100)}% of the size it would get alone; ${by} sets the framing (give ${small} a shot without ${by}, or leave ${small} out of "on" if the shot is about ${by})`);
    }
    // depth of field: true/false, a blur radius, or 'auto' (blur grows as the painted set gets enlarged)
    const dof = spec.dof !== undefined ? spec.dof : (size === 'close' || size === 'extreme-close') ? true : 'auto';
    // a shot may override the scene's time of day (blended across the shot) and grade (blended to gradeTo)
    const def = srec.def, own = def.time !== undefined, fallback = rec.S.defaultSky;
    const time = own ? def.time : rec.time, t0s = own ? srec.t0 : rec.t0, t1s = own ? srec.t1 : rec.t1;
    const story = def.grade !== undefined ? STORY[def.grade] ?? null : rec.story, storyTo = def.gradeTo !== undefined ? STORY[def.gradeTo] ?? null : undefined;
    const skyAt = t => skyList(time, t0s, t1s, t, fallback);
    srec.out = {
      id: srec.id, scene: rec.id, t0: srec.t0, t1: srec.t1, size, move: cam.move, angle: cam.angle, on: ids, set: rec.S, setId: rec.sc.set,
      cameraAt: cam.cameraAt, dof, frames: cam.frames, time, grade: def.grade ?? rec.gradeName ?? null, gradeTo: def.gradeTo ?? null,
      skyAt,
      gradeAt: storyTo === undefined ? t => ({ ...mixGrade(skyAt(t)), story }) : t => ({ ...mixGrade(skyAt(t)), story: mixStory(story, storyTo, spanU(srec.t0, srec.t1, t)) }),
      fadeIn: def.fadeIn ?? 0, fadeOut: def.fadeOut ?? 0,
    };
    this.shots.push(srec.out);
  }

  // ───────────── idle life: listeners glance at the speaker ─────────────
  glances(rec) {
    for (const L of this.lines) {
      if (L.scene !== rec.id || L.narrator) continue;
      const sp = rec.actors.get(L.who);
      if (!sp || !sp.place0 || !sp.visibleAt(L.t0)) continue;
      let to = null, best = Infinity;
      const p = sp.posAt(L.t0), f = sp.faceAt(L.t0);
      for (const [id, B] of rec.actors) {
        if (B === sp || !B.place0 || !B.visibleAt(L.t0) || B.asleep(L.t0)) continue;
        // the speaker's addressee: the nearest one in front of them (else the nearest)
        const q = B.posAt(L.t0), d = Math.hypot(q.x - p.x, q.y - p.y) * (Math.sign(q.x - p.x) === f ? 1 : 3);
        if (d < best) { best = d; to = id; }
        if (B.speaking(L.t0 + 0.01)) continue;
        const delay = 0.05 + ((hash32(`${L.id}|${id}`) % 1000) / 1000) * 0.25;
        B.glances.push({ t0: L.t0 + delay, t1: L.t1 + 0.35, target: L.who });
      }
      // a speaker who hasn't been told where to look (no look in the scene yet, or only "down") talks to that one
      const i = sp.lookEv.findLastIndex(e => e.t <= L.t0), told = i >= 0 && !(sp.lookEv[i].target === 'down' && sp.hTarget(i) == null);
      if (to && !sp.asleep(L.t0) && !told) sp.glances.push({ t0: L.t0, t1: L.t1 + 0.35, target: to });
    }
  }

  // ───────────── automatic sounds and dust from movement ─────────────
  moveSounds(rec) {
    const S = rec.S;
    for (const [id, A] of rec.actors) {
      const rig = A.rig, weight = clamp(Math.sqrt(A.sz.height * A.sz.width) / 90 * A.k, 0.08, 1);
      const out = [];
      const contact = (t, x, y, s, kind, gait, deep = 0) => {
        if (!A.visibleAt(t)) return;
        const water = kind !== 'mount' && S.inWater(x, y) && !S.onStone(x, y), surf = kind === 'mount' ? 'wood' : water ? 'water' : S.surfaceAt(x, y);
        if (kind === 'mount') { out.push({ t, name: 'land', gain: 0.3 + 0.4 * weight, params: { weight, surface: 'wood' }, x, y, who: id }); return; }
        if (kind === 'wade') {
          // feet in the water: soft sloshes that fade as the actor goes under
          if (deep < 0.6) out.push({ t, name: 'splash', gain: (0.18 + 0.25 * weight) * (1 - deep), params: { size: 0.2 + 0.2 * weight }, x, y, who: id });
          return;
        }
        if (kind === 'paw') { out.push({ t, name: FOOT[surf] || 'footstep-grass', gain: 0.1, params: { weight: 0.1 }, x, y, who: id }); return; }     // (3D: a cat's pads, near silent)
        if (kind === 'step') {
          if (water) { out.push({ t, name: 'splash', gain: 0.35 + 0.4 * weight, params: { size: 0.3 + 0.4 * weight }, x, y, who: id }); this.fx.push({ name: 'splash', t0: t, t1: t + 1.2, x, y, s: s * 0.5, seed: hash32(`${id}${t}`), scene: rec.id }); return; }
          // (3D: a rig in socks treads soft: half as loud and duller)
          if (rig.feet === 'socks') { out.push({ t, name: FOOT[surf] || 'footstep-grass', gain: 0.5 * (0.3 + 0.45 * weight), params: { weight: 0.5 * weight }, x, y, who: id }); return; }
          out.push({ t, name: FOOT[surf] || 'footstep-grass', gain: 0.3 + 0.45 * weight, params: { weight }, x, y, who: id });
          if (gait === 'run' && (surf === 'dirt' || surf === 'path' || surf === 'sand') && weight > 0.3) this.fx.push({ name: 'dust', t0: t, t1: t + 1.3, x, y, s: s * 0.6, dir: A.faceAt(t), seed: hash32(`${id}${t}`), scene: rec.id, n: 6 });
        } else if (kind === 'land') {
          if (water) { out.push({ t, name: 'splash', gain: 0.6 + 0.4 * weight, params: { size: 0.5 + 0.5 * weight }, x, y, who: id }); this.fx.push({ name: 'splash', t0: t, t1: t + 1.2, x, y, s: s * 0.8, seed: hash32(`${id}${t}`), scene: rec.id }); return; }
          out.push({ t, name: 'land', gain: 0.4 + 0.5 * weight, params: { weight, surface: surf === 'wood' ? 'wood' : surf === 'stone' ? 'stone' : surf === 'dirt' ? 'dirt' : 'grass' }, x, y, who: id });
          if (surf === 'dirt' && weight > 0.3) this.fx.push({ name: 'dust', t0: t, t1: t + 1.3, x, y, s: s * 0.5, dir: 1, seed: hash32(`${id}l${t}`), scene: rec.id, n: 5 });
        } else if (kind === 'hop') out.push({ t, name: 'hop', gain: 0.35 + 0.4 * weight, params: { weight }, x, y, who: id });
        else if (kind === 'flap') out.push({ t, name: 'wing-flap', gain: 0.25 + 0.3 * weight, params: {}, x, y, who: id });
      };
      // (3D: the feet of the 3D actor, as the timing laid them)
      const falls = this.T3?.footfalls(rec, id);
      for (const f of falls ?? []) contact(f.t, f.x, f.y, 1, f.kind, 'walk');
      for (const mv of falls ? [] : A.moves) {
        if (mv.place) continue;
        let t0 = mv.t0; const cut = A.end(mv);
        for (const L of mv.legs) {
          if (t0 >= cut) break;
          const Tm = Math.min(L.T, cut - t0);
          if (L.type === 'route') {
            if (L.hops) {
              for (let i = 0; i < L.hops; i++) for (const [u, k] of [[0.27, 'hop'], [0.78, 'land']]) {
                const τ = (i + u) * L.cycleDur; if (τ > Tm) continue;
                const p = L.at(τ); contact(t0 + τ, p.x, p.y, p.s, k);
              }
            } else {
              const steps = rig.steps?.[L.gait] ?? (L.gait === 'fly' || L.gait === 'glide' ? null : [0, 0.5]);
              const p0 = L.phaseAt(0), p1 = L.phaseAt(Tm);
              if (steps) for (let n = Math.floor(p0); n <= Math.ceil(p1); n++) for (const st of steps) {
                const ph = n + st; if (ph <= p0 + 1e-6 || ph > p1) continue;
                const τ = L.timeOfPhase(ph), p = L.at(τ);
                if (p.sink > 0) contact(t0 + τ, p.x, p.y, p.s, 'wade', L.gait, p.sink / (A.sz.height * p.s));
                else contact(t0 + τ, p.x, p.y, p.s, 'step', L.gait);
              }
            }
          } else if (L.type === 'jump') {
            const a = L.at(0.27 * L.T - 1e-6), b = L.at(0.78 * L.T + 1e-6);
            if (0.27 * L.T <= Tm) contact(t0 + 0.27 * L.T, a.x, a.mode === 'mount' ? a.ground : a.y, a.s, 'hop');
            if (0.78 * L.T <= Tm) contact(t0 + 0.78 * L.T, b.x, b.y, b.s, b.mode === 'mount' ? 'mount' : 'land');
          } else if (L.type === 'fly' && (rig.kind === 'owl' || rig.kind === 'songbird')) {
            const n = Math.floor(L.d / L.stride);
            for (let i = 1; i <= n; i += 2) { const τ = (i / Math.max(1, n)) * L.T * 0.8; if (τ <= Tm) { const p = L.at(τ); contact(t0 + τ, p.x, p.y, p.s, 'flap'); } }
          }
          t0 += L.T;
        }
      }
      out.sort((a, b) => a.t - b.t);
      let last = -1;
      for (const e of out) { if (e.name.startsWith('footstep') && e.t - last < 0.07) continue; if (e.name.startsWith('footstep')) last = e.t; this.rawSfx.push({ ...e, where: { x: e.x, y: e.y }, auto: true }); }
    }
  }

  // ───────────── captions ─────────────
  finishCaptions() {
    const W = this.W, H = this.H, mode = this.captionMode, out = [];
    const spoken = this.lines.slice().sort((a, b) => a.t0 - b.t0);
    spoken.forEach((L, i) => {
      const next = spoken[i + 1];
      let t1 = Math.max(L.t1 + 0.25, L.t0 + 1.0);
      if (next) t1 = Math.min(t1, next.t0 - 0.04);
      t1 = Math.max(t1, L.t0 + 0.4);
      const style = L.narrator ? 'narration' : 'dialogue';
      const burn = mode === 'all' || (mode === 'dialogue' && !L.narrator);
      for (const c of chunkCaption(L.text, style, L.t0, t1, W, H)) out.push({ ...c, style, burn, who: L.who, line: L.id });
    });
    for (const c of this.captions) out.push(c.style === 'title' ? { ...c } : { ...c, ...chunkCaption(c.text, c.style, c.t0, c.t1, W, H)[0] });
    this.captions = out.sort((a, b) => a.t0 - b.t0);
  }

  // ───────────── music and ambience ─────────────
  musicCues() {
    const out = [], stings = [];
    for (const rec of this.scenes) {
      const ev = [{ t: rec.t0, m: rec.music }, ...rec.musicEv.filter(e => !e.m?.sting).sort((a, b) => a.t - b.t)];
      for (const e of rec.musicEv) if (e.m?.sting) stings.push({ t: e.t, sting: e.m.sting });
      ev.forEach((e, i) => {
        const t1 = i + 1 < ev.length ? ev[i + 1].t : rec.t1;
        if (e.m && e.m !== 'none' && e.m.mood && t1 > e.t + 1e-3) out.push({ t0: e.t, t1, mood: e.m.mood, intensity: e.m.intensity ?? 0.5, scene: rec.id, ...extras(e.m) });
      });
    }
    // merge touching cues with the same mood and intensity; title cards ride on the first and last cues
    const merged = [];
    for (const c of out) { const p = merged[merged.length - 1]; if (p && p.mood === c.mood && p.intensity === c.intensity && !Object.keys(extras(c)).length && Math.abs(p.t1 - c.t0) < 1e-3) p.t1 = c.t1; else merged.push({ ...c }); }
    const open = this.cards.find(c => c.kind === 'open'), end = this.cards.find(c => c.kind === 'end');
    if (merged.length && open && Math.abs(merged[0].t0 - open.t1) < 1e-3) merged[0].t0 = 0;
    if (merged.length && end && Math.abs(merged[merged.length - 1].t1 - end.t0) < 1e-3) merged[merged.length - 1].t1 = end.t1;
    return [...merged, ...stings].sort((a, b) => (a.t0 ?? a.t) - (b.t0 ?? b.t));
  }
  ambienceBeds() {
    const out = [];
    for (const rec of this.scenes) {
      const a = rec.sc.ambience ?? 'auto';
      if (a === 'none') continue;
      if (a !== 'auto') { out.push({ t0: rec.t0, t1: rec.t1, name: a, scene: rec.id }); continue; }
      const amb = rec.S.ambience || {}, name = n => (isNight(n) ? amb.night || amb.day : amb.day || amb.night);
      const T = rec.time;
      if (typeof T === 'object' && T && name(T.from) !== name(T.to)) {
        const tm = (rec.t0 + rec.t1) / 2;
        if (name(T.from)) out.push({ t0: rec.t0, t1: tm, name: name(T.from), scene: rec.id });
        if (name(T.to)) out.push({ t0: tm, t1: rec.t1, name: name(T.to), scene: rec.id });
      } else { const n = name(typeof T === 'object' && T ? T.from : T); if (n) out.push({ t0: rec.t0, t1: rec.t1, name: n, scene: rec.id }); }
    }
    const open = this.cards.find(c => c.kind === 'open');
    if (out.length && open && Math.abs(out[0].t0 - open.t1) < 1e-3) out[0].t0 = Math.max(0, open.t1 - 2);
    return out;
  }

  // sfx pan and level from where the sound is on screen
  finishSfx(plan) {
    const W = this.W, out = [];
    for (const e of this.rawSfx) {
      const shot = plan.shotAt(e.t);
      let pan = e.pan ?? 0, gain = e.gain ?? 1;
      if (e.where && shot && e.pan === undefined) {
        const cam = shot.cameraAt(e.t), sx = (e.where.x - cam.cx) * cam.zoom + W / 2;
        pan = clamp((sx / W - 0.5) * 1.4, -0.8, 0.8);
        if (sx < -W * 0.1 || sx > W * 1.1) gain *= 0.45;
      }
      if (shot && e.t >= shot.t1) continue;
      const o = { t: Math.round(e.t * 1000) / 1000, name: e.name, gain: Math.round(gain * 1000) / 1000, pan: Math.round(pan * 1000) / 1000, shot: shot?.id ?? e.shot ?? null };
      if (e.params && Object.keys(e.params).length) o.params = e.params;
      if (e.who) o.who = e.who;
      if (e.seed !== undefined) o.seed = e.seed;
      if (e.auto) o.auto = true;
      out.push(o);
    }
    plan.sfx = out.filter(e => e.t >= 0 && e.t < plan.duration).sort((a, b) => a.t - b.t || (a.name < b.name ? -1 : 1));
  }

  plan() {
    const scenes = this.scenes, shots = this.shots.sort((a, b) => a.t0 - b.t0), fps = this.fps;
    const fx = this.fx.map(e => ({ ...e, t1: e.t1 ?? scenes.find(s => s.id === e.scene)?.t1 })), overlays = [], custom = this.film.custom?.overlays || {};
    // (kept to some shots: a stretch per run of them, each with its scene's edges, the only place a screen rain fades)
    const field = (rec, n, p = {}, spans) => { if (FX_DUR[n] && !ONE_SHOT.has(n)) for (const [t0, t1] of spans ?? [[rec.t0, rec.t1]]) fx.push({ name: n, t0, t1, scene: rec.id, seed: hash32(`${rec.id}|${n}`), density: p.density ?? p.n ?? 1, color: p.color, fade: false, ...(spans ? { edges: [rec.t0, rec.t1] } : {}) }); };
    // an overlay's "shots" (ids of the scene's shots): the stretches of the scene they cover, consecutive shots joined
    const spansOf = (rec, ids) => rec.shots.filter(s => ids.includes(s.id)).reduce((out, s) => { const l = out[out.length - 1]; if (l && l[1] === s.t0) l[1] = s.t1; else out.push([s.t0, s.t1]); return out; }, []);
    for (const rec of scenes) {
      for (const n of rec.sc.fx || []) field(rec, n);
      (rec.sc.overlays || []).forEach((o, i) => {
        const name = typeof o === 'string' ? o : o?.name, params = (o && typeof o === 'object' && o.params) || {}, def = custom[name];
        const shots = Array.isArray(o?.shots) ? o.shots : null;
        if (def && typeof def.draw === 'function') overlays.push({ scene: rec.id, name, params, layer: def.layer || 'world', def, seed: hash32(`${rec.id}|${name}|${i}`), t0: rec.t0, t1: rec.t1, ...(shots ? { shots } : {}) });
        else field(rec, name, params, shots ? spansOf(rec, shots) : undefined);
      });
      // rim light: start is a mark (film time) or seconds from the scene start
      const r = rec.sc.rim;
      if (r) rec.rim = { ...RIM_DEFAULTS, ...r, t0: typeof r.start === 'string' ? this.marks[r.start] ?? rec.t0 : rec.t0 + (r.start ?? 0) };
    }
    const sceneAt = t => scenes.find(s => t >= s.t0 && t < s.t1) ?? null;
    const shotAt = t => { let lo = 0, hi = shots.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (shots[m].t0 <= t) { r = shots[m]; lo = m + 1; } else hi = m - 1; } return r && t < r.t1 ? r : null; };
    const plan = {
      W: this.W, H: this.H, fps, duration: this.duration, title: this.film.title ?? '', captionMode: this.captionMode, style: this.style,
      scenes: scenes.map(s => ({ id: s.id, t0: s.t0, t1: s.t1, set: s.sc.set, time: s.time, grade: s.gradeName ?? null, transition: s.transition, rim: s.rim ?? null })),
      shots, lines: this.lines.sort((a, b) => a.t0 - b.t0), sfx: [], ambience: this.ambienceBeds(), music: this.musicCues(),
      captions: this.captions, cards: this.cards, fx: fx.sort((a, b) => a.t0 - b.t0), custom: this.custom, overlays, warnings: this.warnings,
      marks: { ...this.marks }, score: this.film.score ?? null, sounds: { ...(this.film.custom?.sounds || {}) },
      shotAt, sceneAt,
      // actors of the scene at t, or of the given scene (the outgoing scene of a dissolve)
      actorsAt: (t, sceneId = null) => {
        const rec = sceneId ? scenes.find(s => s.id === sceneId) : sceneAt(t); if (!rec) return [];
        const shot = shotAt(t), own = shot?.scene === rec.id ? shot : null, out = [];
        for (const A of rec.actors.values()) { if (!A.place0) continue; const st = A.state(t, fps); st.shot = own?.id ?? rec.shots[rec.shots.length - 1]?.id ?? null; st.z = this.zAt(A, t); out.push(st); }
        // (farther first: by depth, then by key; DESIGN §10)
        return out.sort((a, b) => b.z - a.z || a.key - b.key);
      },
      cast: Object.fromEntries(Object.entries(this.film.cast || {}).map(([id, c]) => [id, { rig: c.rig, name: c.name ?? id, scale: c.scale ?? 1 }])),
    };
    Object.defineProperty(plan, 'film', { value: this.film, enumerable: false });
    Object.defineProperty(plan, '_scenes', { value: scenes, enumerable: false });
    return plan;
  }
}

// Bounds of an actor mid-gesture (quantized to eighths of the gesture, cached per actor).
function gestureProfile(A, g, t) {
  const u = Math.round(clamp((t - g.t0) / (g.t1 - g.t0)) * 8) / 8, base = A.basePoseName(g.t0), key = `${g.name}|${u}|${base}`;
  A._gp ||= new Map();
  if (!A._gp.has(key)) {
    const bp = rigPose(A.rig, base)?.pose || A.rig.poses.stand, pose = A.rig.gestures[g.name].at(u, bp);
    const r = probe(A.rig, 0, 0, 1, 1, { pose, params: A.params0, shadow: false, t: 0 });
    A._gp.set(key, { box: r.bounds.slice(), head: r.head.slice() });
  }
  return A._gp.get(key);
}
// The depth of an anchor that declares one (undefined: a place on the stage, or not an anchor: the actor keeps its
// depth).
function anchorZ(S, target) {
  const T = target === undefined ? null : parseTarget(target);
  return T?.kind === 'name' && S.anchorNames.includes(T.name) ? S.anchor(T.name).z : undefined;
}
// Turning by th about (cx, cy) (world): a point, and a box (the box of its turned corners).
function turnAbout(cx, cy, th) {
  const c = Math.cos(th), s = Math.sin(th), pt = ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  return { pt, box: b => { const Q = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(pt), xs = Q.map(q => q[0]), ys = Q.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; } };
}
function insideCollider(S, x, y, gx, gy) {
  for (const c of S.colliders()) { const dx = (x - c.x) / (c.rx + gx), dy = (y - c.y) / (c.ry + gy); if (dx * dx + dy * dy < 1) return true; }
  return false;
}
// A music cue: { mood, intensity, motif?, motifVoice?, hold?, downbeat?, tempo? } | { sting } | 'none'. The extras come
// from the music object or from the beat's own fields.
const extras = o => { const e = {}; for (const k of MUSIC_EXTRAS) if (o?.[k] !== undefined) e[k] = o[k]; return e; };
function normMusic(v, b = {}) {
  if (v === undefined) return undefined;
  if (v === 'none' || v === null || v === false) return 'none';
  if (v === 'sting') return b.name || b.sting ? { sting: b.name ?? b.sting } : undefined;
  if (v === true || v === 'cue') return b.mood ? { mood: b.mood, intensity: b.intensity ?? 0.5, ...extras(b) } : b.sting ? { sting: b.sting } : undefined;
  if (typeof v === 'string') return moodNames().includes(v) ? { mood: v, intensity: b.intensity ?? 0.5, ...extras(b) } : stingNames().includes(v) ? { sting: v } : undefined;
  if (typeof v === 'object') return v.sting ? { sting: v.sting } : v.mood ? { mood: v.mood, intensity: v.intensity ?? 0.5, ...extras(b), ...extras(v) } : undefined;
  return undefined;
}
