// compile(film, { voices }) → plan. Turns the storyboard into timed shots, actor performances (blocking along
// set routes, poses, gestures, looks, lip sync, idle life), cameras, captions, sound cues and music cues.
// Times are seconds from the film start; shot boundaries land on frames.
import { Actor, RouteLeg, JumpLeg, FlyLeg, groundPos, anchorPos } from './actor.mjs';
import { buildCamera, frameSubjects, clampFrame } from './camera.mjs';
import { skyList, mixGrade, STORY, isNight } from './grade.mjs';
import { chunkCaption } from './text.mjs';
import { FX_DUR, ONE_SHOT } from './fx.mjs';
import { MOODS, STINGS } from './validate.mjs';
import { clamp, hash32, shortHash, parseTarget, rigPose, profile, probe } from './util.mjs';

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
    Object.assign(this, { film, voices, R: film.resolved, W: fmt.width || 1920, H: fmt.height || 1080, fps: fmt.fps || 24, captionMode: fmt.captions || 'dialogue' });
    this.lines = []; this.rawSfx = []; this.fx = []; this.captions = []; this.shots = []; this.scenes = []; this.cards = []; this.custom = []; this.warnings = [];
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
    // starting places: absolute targets first, then those relative to other actors
    const entries = Object.entries(sc.actors || {});
    const rel = v => ['near', 'left-of', 'right-of', 'behind', 'front-of'].includes(parseTarget(v).kind);
    for (const pass of [0, 1]) for (const [id, a] of entries) {
      if (a.offstage) { if (pass === 0) this.initOff(rec, this.ensure(id), a.offstage, T0, a); continue; }
      if (rel(a.at) !== !!pass) continue;
      const A = this.ensure(id), pos = this.place(rec, A, a.at, T0);
      let face = faceVal(a.face) || faceVal(pos.face) || (pos.faceTo ?? (pos.x < S.refX ? 1 : -1));
      const poseName = a.pose ?? (pos.mode === 'perch' ? (rigPose(A.rig, 'perch')?.name || 'stand') : 'stand');
      A.init(T0, pos, face, poseName, { expr: a.expr ?? 'neutral' });
    }
    let t = T0;
    sc.shots.forEach((sh, i) => { t = this.shot(rec, sh, i, t); });
    rec.t1 = t;
    // music: scene cue (inherited if absent), split by music beats
    const m = sc.music === undefined ? (prev ? prev.music : undefined) : normMusic(sc.music);
    rec.music = m;
    this.scenes.push(rec);
    this.glances(rec);
    this.moveSounds(rec);
    for (const s of rec.shots) this.camera(rec, s);
    return t;
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
    const byId = {}, srec = { def: sh, id: sh.id, index, t0: T, beats: [], refs: new Set() };
    rec.shots.push(srec); this.srec = srec;
    for (const b of beats) {
      const pinned = timeAt(b);
      const base = pinned != null ? pinned : b.with === 'prev' ? gStart : b.with ? (byId[b.with]?.start ?? gStart) : gEnd;
      const start = base + (b.after ?? 0);
      let dur = 0;
      try { dur = this.beat(rec, srec, b, T + start); }
      catch (e) { throw new Error(`shot ${sh.id}: ${b.do ?? Object.keys(b)[0]} beat: ${e.message}`, { cause: e }); }
      dur = Math.max(0, dur || 0);
      const end = start + dur;
      if (b.with) gEnd = Math.max(gEnd, end); else { gStart = start; gEnd = end; }
      if (b.id) byId[b.id] = { start, end };
      srec.beats.push({ beat: b, t0: T + start, t1: T + end });
      maxEnd = Math.max(maxEnd, end);
    }
    const len = sh.dur ?? (maxEnd + (sh.hold ?? DEFAULT_HOLD));
    srec.t1 = Math.max(T + 1 / this.fps, this.q(T + len));
    return srec.t1;
  }

  beat(rec, srec, b, t) {
    if (b.say !== undefined) return this.say(rec, srec, b, t);
    if (b.wait !== undefined) return b.wait;
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
      this.captions.push({ t0: t, t1: t + d, text: b.title, sub: b.sub ?? b.subtitle ?? null, style: 'title', burn: true });
      return d;
    }
    return this.act(rec, srec, b, t);
  }

  say(rec, srec, b, t) {
    const film = this.film, who = b.say, narrator = who === 'narrator';
    const key = narrator ? 'narrator' : (film.cast[who]?.voice && film.voices?.[film.cast[who].voice] ? film.cast[who].voice : film.voices?.[who] ? who : film.cast[who]?.voice);
    const cfg = film.voices?.[key] || {}, text = normText(b.text), tone = joinTones(cfg.tone, b.tone);
    const id = shortHash(who, cfg.voice ?? '', text, tone);
    const v = this.voices.get(id);
    const dur = Number.isFinite(v?.dur) && v.dur > 0 ? v.dur : estimateLine(text);
    const line = { id, who, voice: key, tone: b.tone ?? '', text, t0: t, t1: t + dur, vo: !!b.vo, narrator, shot: srec.id, scene: rec.id, estimated: !v };
    this.lines.push(line);
    const A = narrator ? null : rec.actors.get(who);
    if (A && A.place0) {
      A.talk.push({ t0: t, t1: t + dur, env: v?.env || null, seed: hash32(id) });
      if (b.expr) A.exprTmp.push({ t0: t, t1: t + dur + 0.4, expr: b.expr });
      srec.refs.add(who);
    }
    return dur;
  }

  // ───────────── actions ─────────────
  act(rec, srec, b, t) {
    const d = b.do, S = rec.S;
    if (d === 'custom') {
      const dur = b.dur ?? 1, def = this.film.custom?.custom?.[b.name];
      this.custom.push({ name: b.name, t0: t, t1: t + dur, beat: b, scene: rec.id, shot: srec.id, def });
      for (const e of def?.sfx || []) this.rawSfx.push({ t: t + (e.at ?? 0), name: e.name, gain: e.gain ?? 1, pan: e.pan, params: e.params || {}, shot: srec.id, where: null });
      return dur;
    }
    if (d === 'enter') return this.enter(rec, srec, b, t);
    const A = rec.actors.get(b.who);
    if (!A || !A.place0) throw new Error(`"${b.who}" is not in scene ${rec.id}`);
    srec.refs.add(b.who);
    const rig = A.rig;
    switch (d) {
      case 'walk': case 'run': case 'hop': case 'fly': return this.move(rec, srec, A, b, t, d);
      case 'exit': return this.exit(rec, srec, A, b, t);
      case 'pose': {
        const dur = b.dur ?? 1;
        A.setPose(t, b.pose, Math.min(0.35, Math.max(0.12, dur)), 'beat');
        if (b.expr) A.exprEv.push({ t, expr: b.expr });
        if (b.pose !== 'sleep') A.sleepEv.push({ t, asleep: false });
        return dur;
      }
      case 'gesture': {
        const g = rig.gestures[b.name], dur = g.dur;
        A.gest.push({ t0: t, t1: t + dur, name: b.name }); A.gest.sort((a, c) => a.t0 - c.t0);
        return dur;
      }
      case 'look': {
        const tgt = typeof b.at === 'string' ? b.at : b.to;
        const target = this.lookTarget(rec, tgt);
        A.lookEv.push({ t, target }); A.lookEv.sort((a, c) => a.t - c.t);
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
        const f0 = A.faceAt(t), f1 = b.face === 'around' ? -f0 : faceVal(b.face);
        if (f1 && f1 !== f0) { A.faceEv.push({ t: t + 0.12, face: f1, flip: true }); A.faceEv.sort((a, c) => a.t - c.t); }
        return 0.25;
      }
      case 'emote': A.exprEv.push({ t, expr: b.expr }); A.exprEv.sort((a, c) => a.t - c.t); return 0;
      case 'sit': case 'stand': case 'lie': case 'sleep': {
        if (d !== 'sleep') A.sleepEv.push({ t, asleep: false });
        if (d === 'sleep') { A.preSleep = A.basePoseName(t); A.sleepEv.push({ t: t + 0.3, asleep: true }); }
        A.setPose(t, d, 0.6, 'beat');
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
        const where = b.to ?? (typeof b.at === 'string' ? b.at : null), pos = this.place(rec, A, where, t);
        A.addMove({ t0: t, t1: t, place: pos, legs: [], kind: 'place' });
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
        if (b.params) A.paramEv.push({ t, params: b.params });
        if (b.pose) A.setPose(t, b.pose, 0, 'beat');
        if (b.expr) A.exprEv.push({ t, expr: b.expr });
        return 0;
      }
      case 'blink': A.blinks.push(t); return 0.2;
      default: throw new Error(`unknown action "${d}"`);
    }
  }

  lookTarget(rec, tgt) {
    if (!tgt || ['none', 'camera', 'left', 'right', 'up', 'sky'].includes(tgt)) return tgt || 'none';
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
  place(rec, A, target, t, from = null) {
    const S = rec.S, T = parseTarget(target);
    if (T.kind === 'name') {
      if (S.anchorNames.includes(T.name)) {
        const pos = anchorPos(S, T.name, A.k);
        if (pos.mode === 'ground') { const [x, y] = this.walkable(rec, A, pos.x, pos.y, t); return { ...groundPos(S, x, y, A.k), anchor: T.name, face: pos.face }; }
        if (pos.mode === 'perch' && !A.rig.perch && !A.rig.flies) this.warn(`${A.id} (${A.rig.kind}) is placed on the perch "${T.name}" but its rig cannot perch`);
        return pos;
      }
      if (rec.actors.has(T.name)) return this.place(rec, A, `near:${T.name}`, t, from);
    }
    if (T.kind === 'x' || T.kind === 'xy') {
      const y = T.kind === 'xy' ? T.y : S.laneAt(T.x), [x, yy] = this.walkable(rec, A, T.x, y, t);
      return groundPos(S, x, yy, A.k);
    }
    if (['near', 'left-of', 'right-of', 'behind', 'front-of'].includes(T.kind)) {
      const O = rec.actors.get(T.who);
      if (!O || !O.place0) throw new Error(`"${T.who}" is not in scene ${rec.id}`);
      const q = O.posAt(t), oy = q.mode === 'ground' ? q.y : S.laneAt(q.x), sA = S.scaleAt(q.x, oy) * A.k, sO = q.s;
      const gap = this.footprint(A, sA).front + this.footprint(O, sO).front + 0.42 * (A.sz.height * sA + O.sz.height * sO) / 2;
      const fx = from ? from.x : A.place0 ? A.posAt(t).x : q.x - 1;
      let side = T.kind === 'left-of' ? -1 : T.kind === 'right-of' ? 1 : Math.sign(fx - q.x) || -1;
      let x = q.x + side * gap, y = oy;
      if (T.kind === 'behind') { x = q.x + side * gap * 0.35; y = oy - 34 * sO; }
      if (T.kind === 'front-of') { x = q.x + side * gap * 0.35; y = oy + 40 * sO; }
      let [px, py] = this.walkable(rec, A, x, y, t, T.who);
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
        legs.push(new JumpLeg({ A: a, B: b, rig, sz: A.sz }));
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
    if (kind === 'fly' || (flier && (p0.mode !== 'ground' || dest.mode !== 'ground') && kind !== 'walk')) {
      return { legs: [new FlyLeg({ A: p0, B: dest, rig, sz: A.sz, speed: flySpeed })], end: dest };
    }
    let cur = p0;
    if (cur.mode !== 'ground' && cur.mode !== 'off' && !(cur.mode === 'surface' && rec.S.onStone(cur.x, cur.y))) {
      const g = this.approach(rec, A, cur, dest, 0);
      legs.push(new JumpLeg({ A: cur, B: g, rig, sz: A.sz })); cur = g;
    }
    let target = dest, up = null;
    const stone = p => p.mode === 'surface' && rec.S.onStone(p.x, p.y);
    if (dest.mode !== 'ground' && !stone(dest)) { up = dest; target = this.approach(rec, A, dest, cur, 0); }
    const r = this.routeLegs(rec, A, cur, target, gait, mult, { face0: opts.face0 ?? (p0.face || 1), ...opts });
    legs.push(...r.legs);
    let end = up || { ...groundPos(rec.S, r.end[0], r.end[1], A.k), anchor: target.anchor ?? null, faceTo: dest.faceTo, face: dest.face };
    if (up) legs.push(new JumpLeg({ A: { ...groundPos(rec.S, r.end[0], r.end[1], A.k) }, B: up, rig, sz: A.sz }));
    return { legs, end };
  }
  addMove(A, t, legs, kind, end, b, extra = {}) {
    const total = legs.reduce((a, L) => a + L.T, 0);
    const mv = { t0: t, t1: t + total, legs, kind, end, ...extra };
    if (!legs.length || total <= 1e-6) {
      if (b.face) { A.faceEv.push({ t, face: faceVal(b.face), flip: faceVal(b.face) !== A.faceAt(t) }); A.faceEv.sort((a, c) => a.t - c.t); }
      if (b.pose) A.setPose(t, b.pose, 0.3, 'beat');
      return 0;
    }
    A.addMove(mv);
    const last = legs[legs.length - 1], moveFace = last.face1 ?? A.faceAt(mv.t1 - 1e-4);
    const endFace = faceVal(b.face) || end.faceTo || moveFace;
    A.faceEv.push({ t: mv.t1, face: endFace, src: mv, flip: endFace !== moveFace });
    A.faceEv.sort((a, c) => a.t - c.t);
    const endPose = b.pose ?? b.end ?? (end.mode === 'perch' ? (rigPose(A.rig, 'perch')?.name || 'stand') : 'stand');
    A.setPose(mv.t1, endPose, 0, mv);
    A.sleepEv.push({ t, asleep: false }); A.sleepEv.sort((a, c) => a.t - c.t);
    return total;
  }
  move(rec, srec, A, b, t, kind) {
    this.tNow = t;
    const p0 = A.posAt(t), mult = b.speed ?? 1;
    const gait = b.gait && A.rig.gaits?.[b.gait] ? b.gait : this.gaitFor(A, kind);
    const dest = this.place(rec, A, b.to, t, p0);
    if (Math.hypot(dest.x - p0.x, dest.y - p0.y) < 2 && dest.mode === p0.mode) return this.addMove(A, t, [], kind, dest, b);
    const { legs, end } = this.path(rec, A, p0, dest, kind, gait, mult, { face0: A.faceAt(t) });
    return this.addMove(A, t, legs, kind, end, b, { framing: 'all', from: p0 });
  }
  // A provisional camera for the shot at time t (used to know where "off screen" is before cameras exist).
  provisional(rec, srec, t, override = {}) {
    const spec = srec.def.camera || {}, ids = this.subjectIds(rec, srec);
    const subs = ids.map(id => this.subject(rec, id, t, override[id])).filter(Boolean);
    const F = frameSubjects(subs, spec.size || (ids.length ? 'wide' : 'establishing'), { W: this.W, H: this.H, angle: spec.angle, S: rec.S, zoomK: spec.zoom || 1 });
    return clampFrame(rec.S, F, this.W, this.H);
  }
  offscreenX(rec, srec, A, side, t, override, y) {
    const cam = this.provisional(rec, srec, t, override), half = this.W / 2 / cam.zoom;
    const s = rec.S.scaleAt(cam.cx, y) * A.k, fp = this.footprint(A, s), m = Math.max(fp.front, fp.back) + 40;
    return { off: side === 'left' ? cam.cx - half - m : cam.cx + half + m, edge: side === 'left' ? cam.cx - half + 30 : cam.cx + half - 30, cam };
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
    if (fromT.kind !== 'side') {
      // appear at a place (out of a hollow, from behind a tree) and walk on
      const p0 = this.place(rec, A, b.from, t);
      A.addMove({ t0: t, t1: t, place: p0, legs: [], kind: 'place' });
      if (!b.to) return 0;
      const dest = this.place(rec, A, b.to, t, p0), { legs, end } = this.path(rec, A, p0, dest, kind, gait, mult);
      return this.addMove(A, t, legs, 'enter', end, b, { framing: 'all', from: p0 });
    }
    const side = fromT.side;
    // destination: given, or a third of the way into the frame from the entry side
    let dest;
    if (b.to) dest = this.place(rec, A, b.to, t);
    else {
      const cam = this.provisional(rec, srec, t), half = this.W / 2 / cam.zoom, x = cam.cx + (side === 'left' ? -half * 0.45 : half * 0.45);
      dest = this.place(rec, A, `x:${Math.round(x)}`, t);
    }
    const yRef = dest.mode === 'ground' ? dest.y : S.laneAt(dest.x);
    const { off, edge } = this.offscreenX(rec, srec, A, side, t, { [A.id]: dest }, yRef);
    const ex = clamp(edge, S.area.x0 + 20, S.area.x1 - 20);
    const e = S.nearestWalkable(ex, yRef) || [ex, yRef];
    const start = { ...groundPos(S, off, e[1], A.k) };
    A.addMove({ t0: t - 1e-6, t1: t - 1e-6, place: start, legs: [], kind: 'place' });
    let legs, end;
    if (A.rig.flies && A.rig.gaits?.fly && (dest.mode !== 'ground' || b.fly)) {
      const hi = { ...start, y: start.y - 260 * start.s, mode: 'air', depth: start.y };
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
    const kind = b.run ? 'run' : 'walk', gait = b.gait && A.rig.gaits?.[b.gait] ? b.gait : this.gaitFor(A, kind);
    let legs, end;
    if (T.kind !== 'side') {
      const dest = this.place(rec, A, b.to, t, p0);
      ({ legs, end } = this.path(rec, A, p0, dest, kind, gait, mult));
    } else {
      const yRef = p0.mode === 'ground' ? p0.y : S.laneAt(p0.x);
      const { off, edge } = this.offscreenX(rec, srec, A, T.side, t, {}, yRef);
      const ex = clamp(edge, S.area.x0 + 20, S.area.x1 - 20), e = S.nearestWalkable(ex, yRef) || [ex, yRef];
      if (A.rig.flies && A.rig.gaits?.fly && p0.mode !== 'ground') {
        const hi = { ...groundPos(S, off, e[1], A.k), y: e[1] - 300, mode: 'air', depth: e[1] };
        legs = [new FlyLeg({ A: p0, B: hi, rig: A.rig, sz: A.sz, speed: (A.sz.speeds.fly ?? 150) * mult })]; end = hi;
      } else {
        const r = this.path(rec, A, p0, groundPos(S, e[0], e[1], A.k), kind, gait, mult, { tail: [[off, e[1]]] });
        legs = r.legs; end = groundPos(S, off, e[1], A.k);
      }
    }
    const dur = this.addMove(A, t, legs, 'exit', end, b, { framing: 'start', from: p0, final: T.kind === 'side' ? { ...end, mode: 'off' } : null });
    if (T.kind === 'side') { const mv = A.moves[A.moves.length - 1]; A.visEv.push({ t: t + dur, visible: false, src: mv }); A.visEv.sort((a, c) => a.t - c.t); }
    return dur;
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
  subject(rec, id, t, override) {
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
      const pr = g ? gestureProfile(A, g, t) : profile(A.rig, moving ? 'stand' : A.basePoseName(t), A.paramsAt(t)), s = pos.s;
      const yb = pos.y - (pos.lift || 0) * s, b = pr.box;
      const box = face > 0 ? [pos.x + b[0] * s, yb + b[1] * s, pos.x + b[2] * s, yb + b[3] * s] : [pos.x - b[2] * s, yb + b[1] * s, pos.x - b[0] * s, yb + b[3] * s];
      const p1 = A.posAt(t + 0.15), p_ = A.posAt(Math.max(rec.t0, t - 0.15));
      return { id, box, head: [pos.x + face * pr.head[0] * s, yb + pr.head[1] * s], hh: A.sz.headHeight * s, face, vx: (p1.x - p_.x) / 0.3 };
    }
    const T = parseTarget(id);
    let x, y, s;
    if (T.kind === 'name' && S.anchorNames.includes(T.name)) { const a = S.anchor(T.name); x = a.x; y = a.y; s = a.s; }
    else if (T.kind === 'x' || T.kind === 'xy') { x = T.x; y = T.kind === 'xy' ? T.y : S.laneAt(T.x); s = S.scaleAt(x, y); }
    else return null;
    return { id, box: [x - 60 * s, y - 110 * s, x + 60 * s, y], head: [x, y - 75 * s], hh: 40 * s, face: 0, vx: 0 };
  }

  camera(rec, srec) {
    const spec = srec.def.camera || {}, ids = this.subjectIds(rec, srec);
    const size = spec.size || (ids.length ? 'wide' : 'establishing');
    const W = this.W, H = this.H;
    const cam = buildCamera({ spec, size, ids, subjectsAt: (t, list) => list.map(id => this.subject(rec, id, t)).filter(Boolean), t0: srec.t0, t1: srec.t1, S: rec.S, W, H, seed: hash32(srec.id) });
    // depth of field: true/false, a blur radius, or 'auto' (blur grows as the painted set gets enlarged)
    const dof = spec.dof !== undefined ? spec.dof : (size === 'close' || size === 'extreme-close') ? true : 'auto';
    const t0s = rec.t0, t1s = rec.t1, time = rec.time, story = rec.story, fallback = rec.S.defaultSky;
    srec.out = {
      id: srec.id, scene: rec.id, t0: srec.t0, t1: srec.t1, size, move: cam.move, angle: cam.angle, on: ids, set: rec.S, setId: rec.sc.set,
      cameraAt: cam.cameraAt, dof, frames: cam.frames,
      skyAt: t => skyList(time, t0s, t1s, t, fallback),
      gradeAt: t => ({ ...mixGrade(skyList(time, t0s, t1s, t, fallback)), story }),
      fadeIn: srec.def.fadeIn ?? 0, fadeOut: srec.def.fadeOut ?? 0,
    };
    this.shots.push(srec.out);
  }

  // ───────────── idle life: listeners glance at the speaker ─────────────
  glances(rec) {
    for (const L of this.lines) {
      if (L.scene !== rec.id || L.narrator) continue;
      const sp = rec.actors.get(L.who);
      if (!sp || !sp.place0 || !sp.visibleAt(L.t0)) continue;
      for (const [id, B] of rec.actors) {
        if (B === sp || !B.place0 || !B.visibleAt(L.t0) || B.asleep(L.t0) || B.speaking(L.t0 + 0.01)) continue;
        const delay = 0.05 + ((hash32(`${L.id}|${id}`) % 1000) / 1000) * 0.25;
        B.glances.push({ t0: L.t0 + delay, t1: L.t1 + 0.35, target: L.who });
      }
    }
  }

  // ───────────── automatic sounds and dust from movement ─────────────
  moveSounds(rec) {
    const S = rec.S;
    for (const [id, A] of rec.actors) {
      const rig = A.rig, weight = clamp(Math.sqrt(A.sz.height * A.sz.width) / 90 * A.k, 0.08, 1);
      const out = [];
      const contact = (t, x, y, s, kind, gait) => {
        if (!A.visibleAt(t)) return;
        const water = S.inWater(x, y) && !S.onStone(x, y), surf = water ? 'water' : S.surfaceAt(x, y);
        if (kind === 'step') {
          if (water) { out.push({ t, name: 'splash', gain: 0.35 + 0.4 * weight, params: { size: 0.3 + 0.4 * weight }, x, y, who: id }); this.fx.push({ name: 'splash', t0: t, t1: t + 1.2, x, y, s: s * 0.5, seed: hash32(`${id}${t}`), scene: rec.id }); return; }
          out.push({ t, name: FOOT[surf] || 'footstep-grass', gain: 0.3 + 0.45 * weight, params: { weight }, x, y, who: id });
          if (gait === 'run' && (surf === 'dirt' || surf === 'path' || surf === 'sand') && weight > 0.3) this.fx.push({ name: 'dust', t0: t, t1: t + 1.3, x, y, s: s * 0.6, dir: A.faceAt(t), seed: hash32(`${id}${t}`), scene: rec.id, n: 6 });
        } else if (kind === 'land') {
          if (water) { out.push({ t, name: 'splash', gain: 0.6 + 0.4 * weight, params: { size: 0.5 + 0.5 * weight }, x, y, who: id }); this.fx.push({ name: 'splash', t0: t, t1: t + 1.2, x, y, s: s * 0.8, seed: hash32(`${id}${t}`), scene: rec.id }); return; }
          out.push({ t, name: 'land', gain: 0.4 + 0.5 * weight, params: { weight, surface: surf === 'wood' ? 'wood' : surf === 'stone' ? 'stone' : surf === 'dirt' ? 'dirt' : 'grass' }, x, y, who: id });
          if (surf === 'dirt' && weight > 0.3) this.fx.push({ name: 'dust', t0: t, t1: t + 1.3, x, y, s: s * 0.5, dir: 1, seed: hash32(`${id}l${t}`), scene: rec.id, n: 5 });
        } else if (kind === 'hop') out.push({ t, name: 'hop', gain: 0.35 + 0.4 * weight, params: { weight }, x, y, who: id });
        else if (kind === 'flap') out.push({ t, name: 'wing-flap', gain: 0.25 + 0.3 * weight, params: {}, x, y, who: id });
      };
      for (const mv of A.moves) {
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
                const τ = L.timeOfPhase(ph), p = L.at(τ); contact(t0 + τ, p.x, p.y, p.s, 'step', L.gait);
              }
            }
          } else if (L.type === 'jump') {
            if (0.27 * L.T <= Tm) contact(t0 + 0.27 * L.T, L.A.x, L.A.y, L.A.s, 'hop');
            if (0.78 * L.T <= Tm) contact(t0 + 0.78 * L.T, L.B.x, L.B.y, L.B.s, 'land');
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
        if (e.m && e.m !== 'none' && e.m.mood && t1 > e.t + 1e-3) out.push({ t0: e.t, t1, mood: e.m.mood, intensity: e.m.intensity ?? 0.5, scene: rec.id });
      });
    }
    // merge touching cues with the same mood and intensity; title cards ride on the first and last cues
    const merged = [];
    for (const c of out) { const p = merged[merged.length - 1]; if (p && p.mood === c.mood && p.intensity === c.intensity && Math.abs(p.t1 - c.t0) < 1e-3) p.t1 = c.t1; else merged.push({ ...c }); }
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
    const fx = this.fx.map(e => ({ ...e, t1: e.t1 ?? scenes.find(s => s.id === e.scene)?.t1 }));
    for (const rec of scenes) for (const n of [...(rec.sc.fx || []), ...(rec.sc.overlays || [])]) if (FX_DUR[n] && !ONE_SHOT.has(n)) fx.push({ name: n, t0: rec.t0, t1: rec.t1, scene: rec.id, seed: hash32(`${rec.id}|${n}`), density: 1, fade: false });
    const sceneAt = t => scenes.find(s => t >= s.t0 && t < s.t1) ?? null;
    const shotAt = t => { let lo = 0, hi = shots.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (shots[m].t0 <= t) { r = shots[m]; lo = m + 1; } else hi = m - 1; } return r && t < r.t1 ? r : null; };
    const plan = {
      W: this.W, H: this.H, fps, duration: this.duration, title: this.film.title ?? '', captionMode: this.captionMode,
      scenes: scenes.map(s => ({ id: s.id, t0: s.t0, t1: s.t1, set: s.sc.set, time: s.time, grade: s.gradeName ?? null, transition: s.transition })),
      shots, lines: this.lines.sort((a, b) => a.t0 - b.t0), sfx: [], ambience: this.ambienceBeds(), music: this.musicCues(),
      captions: this.captions, cards: this.cards, fx: fx.sort((a, b) => a.t0 - b.t0), custom: this.custom, warnings: this.warnings,
      shotAt, sceneAt,
      actorsAt: t => {
        const rec = sceneAt(t); if (!rec) return [];
        const shot = shotAt(t), out = [];
        for (const A of rec.actors.values()) { if (!A.place0) continue; const st = A.state(t, fps); st.shot = shot?.id ?? null; out.push(st); }
        return out.sort((a, b) => a.key - b.key);
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
function insideCollider(S, x, y, gx, gy) {
  for (const c of S.colliders()) { const dx = (x - c.x) / (c.rx + gx), dy = (y - c.y) / (c.ry + gy); if (dx * dx + dy * dy < 1) return true; }
  return false;
}
function normMusic(v, b = {}) {
  if (v === undefined) return undefined;
  if (v === 'none' || v === null || v === false) return 'none';
  if (v === 'sting') return b.name || b.sting ? { sting: b.name ?? b.sting } : undefined;
  if (v === true || v === 'cue') return b.mood ? { mood: b.mood, intensity: b.intensity ?? 0.5 } : b.sting ? { sting: b.sting } : undefined;
  if (typeof v === 'string') return MOODS.includes(v) ? { mood: v, intensity: b.intensity ?? 0.5 } : STINGS.includes(v) ? { sting: v } : undefined;
  if (typeof v === 'object') return v.sting ? { sting: v.sting } : v.mood ? { mood: v.mood, intensity: v.intensity ?? 0.5 } : undefined;
  return undefined;
}
