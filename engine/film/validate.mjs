// Storyboard validation: walks a parsed film.json and lists every problem with its path (all of them, not just
// the first), plus warnings for things that are probably mistakes (unknown fields, unknown sound names).
// ctx: { getRig(kind), kits: Set of kit names, sets: { setId: set instance }, custom: { name: fn } }
import { parseTarget, rigPose, poseNames } from './util.mjs';

export const SIZES = ['establishing', 'wide', 'full', 'medium', 'close', 'extreme-close'];
export const MOVES = ['static', 'push-in', 'pull-out', 'pan', 'track', 'tilt-up', 'tilt-down', 'handheld'];
export const ANGLES = ['eye', 'low', 'high'];
export const MOODS = ['wonder', 'pastoral', 'tender', 'playful', 'tension', 'chase', 'sad', 'triumph', 'night', 'mystery'];
export const STINGS = ['surprise', 'sad', 'triumph', 'magic'];
export const FX = ['dust', 'splash', 'leaves', 'sparkle', 'rain', 'fireflies', 'motes', 'mist'];
export const AMBIENCES = ['meadow-day', 'meadow-night', 'forest-day', 'forest-night', 'stream', 'village-day', 'village-night', 'wind-hill'];
export const GRADES = ['memory', 'dream', 'none'];
export const CAPTION_MODES = ['dialogue', 'all', 'none'];
export const MOVE_DO = ['walk', 'run', 'hop', 'fly'];
export const POSTURE_DO = ['sit', 'stand', 'lie', 'sleep', 'wake'];
export const DO = [...MOVE_DO, 'enter', 'exit', 'pose', 'gesture', 'look', 'turn', 'emote', ...POSTURE_DO, 'custom', 'place', 'fade', 'set', 'blink'];
const KINDS = ['say', 'do', 'sfx', 'fx', 'music', 'wait', 'title'];
const COMMON = ['id', 'with', 'after', 'at', 'note', 'comment'];
const BEAT_KEYS = {
  say: ['say', 'text', 'tone', 'expr', 'vo', 'voice', 'dur', 'caption', 'to'],
  sfx: ['sfx', 'gain', 'pan', 'params', 'seed', 'caption', 'dur', 'who', 'on'],
  fx: ['fx', 'dur', 'on', 'who', 'size', 'n', 'dir', 'color'],
  music: ['music', 'mood', 'intensity', 'sting', 'name', 'key'],
  wait: ['wait'],
  title: ['title', 'sub', 'subtitle', 'dur'],
  do: ['do', 'who', 'to', 'from', 'speed', 'gait', 'pose', 'dur', 'expr', 'name', 'face', 'params', 'run', 'look', 'end', 'over', 'height', 'alpha'],
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = v => typeof v === 'string' && v.trim().length > 0;
const faceOK = v => v === 'left' || v === 'right' || v === 1 || v === -1;

export function validateFilm(film, ctx) {
  const problems = [], warnings = [];
  const P = (path, message) => problems.push({ path, message: `${path}: ${message}` });
  const Wn = (path, message) => warnings.push({ path, message: `${path}: ${message}` });
  if (!isObj(film)) { P('film', 'must be a JSON object'); return { problems, warnings }; }

  // ── top level ──
  if (!isStr(film.title)) Wn('title', 'missing title (used on the opening card and sheets)');
  const fmt = film.format ?? {};
  if (film.format !== undefined && !isObj(film.format)) P('format', 'must be an object { width, height, fps, captions }');
  else {
    for (const k of ['width', 'height']) if (fmt[k] !== undefined && !(Number.isInteger(fmt[k]) && fmt[k] >= 16 && fmt[k] <= 8192 && fmt[k] % 2 === 0)) P(`format.${k}`, `must be an even integer between 16 and 8192 (got ${JSON.stringify(fmt[k])})`);
    if (fmt.fps !== undefined && !(Number.isInteger(fmt.fps) && fmt.fps >= 1 && fmt.fps <= 120)) P('format.fps', `must be an integer 1..120 (got ${JSON.stringify(fmt.fps)})`);
    if (fmt.captions !== undefined && !CAPTION_MODES.includes(fmt.captions)) P('format.captions', `must be one of ${CAPTION_MODES.join(' | ')} (got ${JSON.stringify(fmt.captions)})`);
  }
  if (film.titles !== undefined) {
    if (!isObj(film.titles)) P('titles', 'must be an object { open, end }');
    else {
      const o = film.titles.open, e = film.titles.end;
      if (o !== undefined && o !== null) {
        if (!isObj(o)) P('titles.open', 'must be an object { title, subtitle, dur }');
        else { if (o.dur !== undefined && !(isNum(o.dur) && o.dur > 0)) P('titles.open.dur', 'must be a positive number of seconds'); if (o.title !== undefined && typeof o.title !== 'string') P('titles.open.title', 'must be a string'); }
      }
      if (e !== undefined && e !== null) {
        if (!isObj(e)) P('titles.end', 'must be an object { lines, dur }');
        else { if (e.dur !== undefined && !(isNum(e.dur) && e.dur > 0)) P('titles.end.dur', 'must be a positive number of seconds'); if (e.lines !== undefined && !(Array.isArray(e.lines) && e.lines.every(l => typeof l === 'string'))) P('titles.end.lines', 'must be an array of strings'); }
      }
    }
  }
  const voices = isObj(film.voices) ? film.voices : {};
  if (film.voices !== undefined && !isObj(film.voices)) P('voices', 'must be an object { id: { voice, tone } }');
  for (const [id, v] of Object.entries(voices)) {
    if (!isObj(v)) { P(`voices.${id}`, 'must be an object { voice, tone }'); continue; }
    if (!isStr(v.voice)) P(`voices.${id}.voice`, 'a prebuilt voice name is required (e.g. "Puck", "Sulafat")');
    if (v.tone !== undefined && typeof v.tone !== 'string') P(`voices.${id}.tone`, 'must be a string');
  }
  const cast = isObj(film.cast) ? film.cast : {};
  if (film.cast !== undefined && !isObj(film.cast)) P('cast', 'must be an object { id: { rig, name, voice, params } }');
  const rigOf = {};
  for (const [id, c] of Object.entries(cast)) {
    if (id === 'narrator') P(`cast.${id}`, '"narrator" is reserved for the narrator voice');
    if (!isObj(c)) { P(`cast.${id}`, 'must be an object { rig, name, voice, params }'); continue; }
    if (!isStr(c.rig)) P(`cast.${id}.rig`, 'a rig kind is required');
    else { const r = ctx.getRig(c.rig); if (!r) P(`cast.${id}.rig`, `unknown rig "${c.rig}" (known: ${ctx.rigKinds.join(', ')})`); else rigOf[id] = r; }
    if (c.voice !== undefined && !(isStr(c.voice) && voices[c.voice])) P(`cast.${id}.voice`, `"${c.voice}" is not defined in voices (have: ${Object.keys(voices).join(', ') || 'none'})`);
    if (c.params !== undefined && !isObj(c.params)) P(`cast.${id}.params`, 'must be an object');
    if (c.scale !== undefined && !(isNum(c.scale) && c.scale > 0.1 && c.scale < 10)) P(`cast.${id}.scale`, 'must be a number between 0.1 and 10');
  }
  const sets = isObj(film.sets) ? film.sets : {};
  if (!isObj(film.sets) || !Object.keys(sets).length) P('sets', 'at least one set is required: { id: { kit, params } }');
  for (const [id, s] of Object.entries(sets)) {
    if (!isObj(s)) { P(`sets.${id}`, 'must be an object { kit, params }'); continue; }
    if (!isStr(s.kit)) P(`sets.${id}.kit`, 'a kit name is required');
    else if (!ctx.kits.has(s.kit)) P(`sets.${id}.kit`, `unknown set kit "${s.kit}" (have: ${[...ctx.kits].sort().join(', ')})`);
    if (s.params !== undefined && !isObj(s.params)) P(`sets.${id}.params`, 'must be an object');
  }
  if (!Array.isArray(film.scenes) || !film.scenes.length) { P('scenes', 'at least one scene is required'); return { problems, warnings }; }

  const sceneIds = new Set(), shotIds = new Set();
  const speakerOK = who => who === 'narrator' ? !!voices.narrator : !!(cast[who] && ((cast[who].voice && voices[cast[who].voice]) || voices[who]));

  film.scenes.forEach((sc, si) => {
    const sp = `scenes[${si}]`;
    if (!isObj(sc)) { P(sp, 'must be an object'); return; }
    if (!isStr(sc.id)) P(`${sp}.id`, 'a scene id is required');
    else if (sceneIds.has(sc.id)) P(`${sp}.id`, `duplicate scene id "${sc.id}"`); else sceneIds.add(sc.id);
    const S = ctx.sets[sc.set];
    if (!isStr(sc.set) || !sets[sc.set]) P(`${sp}.set`, `"${sc.set}" is not one of the film's sets (have: ${Object.keys(sets).join(', ')})`);
    const skyNames = S?.skyNames || ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'sunset', 'twilight', 'night'];
    const anchors = new Set(S?.anchorNames || []);
    const checkTime = (v, p) => { if (!skyNames.includes(v)) P(p, `unknown time "${v}" (one of ${skyNames.join(', ')})`); };
    if (sc.time !== undefined) {
      if (typeof sc.time === 'string') checkTime(sc.time, `${sp}.time`);
      else if (isObj(sc.time) && sc.time.from && sc.time.to) { checkTime(sc.time.from, `${sp}.time.from`); checkTime(sc.time.to, `${sp}.time.to`); }
      else P(`${sp}.time`, 'must be a time name or { "from": …, "to": … }');
    }
    if (sc.grade !== undefined && !(GRADES.includes(sc.grade) || skyNames.includes(sc.grade))) P(`${sp}.grade`, `unknown grade "${sc.grade}" (one of ${[...GRADES, ...skyNames].join(', ')})`);
    if (sc.transition !== undefined && !['cut', 'fade', 'dissolve'].includes(sc.transition)) P(`${sp}.transition`, 'must be cut | fade | dissolve');
    checkMusic(sc.music, `${sp}.music`, P, true);
    if (sc.ambience !== undefined && !(typeof sc.ambience === 'string')) P(`${sp}.ambience`, 'must be "auto", "none" or an ambience name');
    else if (typeof sc.ambience === 'string' && !['auto', 'none', ...AMBIENCES].includes(sc.ambience)) Wn(`${sp}.ambience`, `unknown ambience "${sc.ambience}" (known: ${AMBIENCES.join(', ')})`);
    for (const key of ['fx', 'overlays']) if (sc[key] !== undefined) {
      if (!Array.isArray(sc[key])) P(`${sp}.${key}`, 'must be an array of effect names');
      else sc[key].forEach((n, i) => { if (!FX.includes(n)) Wn(`${sp}.${key}[${i}]`, `unknown world effect "${n}" (known: ${FX.join(', ')}); ignored`); });
    }

    // actors present in the scene (initial), then grown by enter beats
    const present = new Set();
    if (sc.actors !== undefined && !isObj(sc.actors)) P(`${sp}.actors`, 'must be an object { castId: { at, face, pose } }');
    for (const [id, a] of Object.entries(isObj(sc.actors) ? sc.actors : {})) {
      const ap = `${sp}.actors.${id}`;
      if (!cast[id]) { P(ap, `"${id}" is not in the cast (have: ${Object.keys(cast).join(', ') || 'none'})`); continue; }
      if (!isObj(a)) { P(ap, 'must be an object { at, face, pose } or { offstage }'); continue; }
      if (a.offstage !== undefined) { if (!['left', 'right'].includes(a.offstage)) P(`${ap}.offstage`, 'must be "left" or "right"'); }
      else { present.add(id); if (a.at === undefined) P(`${ap}.at`, 'a starting place is required (an anchor, "x:1500", "x:1500,y:1060") or use { "offstage": "left" }'); }
      if (a.at !== undefined) checkTarget(a.at, `${ap}.at`, { anchors, cast, S, P, allowSide: false });
      if (a.face !== undefined && !faceOK(a.face)) P(`${ap}.face`, 'must be "left" or "right"');
      if (a.pose !== undefined && rigOf[id] && !rigPose(rigOf[id], a.pose)) P(`${ap}.pose`, `rig "${rigOf[id].kind}" has no pose "${a.pose}" (poses: ${poseNames(rigOf[id]).join(', ')})`);
      if (a.expr !== undefined && rigOf[id] && !(rigOf[id].expressions || []).includes(a.expr)) Wn(`${ap}.expr`, `rig "${rigOf[id].kind}" has no expression "${a.expr}"`);
    }

    if (!Array.isArray(sc.shots) || !sc.shots.length) { P(`${sp}.shots`, 'at least one shot is required'); return; }
    sc.shots.forEach((sh, hi) => {
      const hp = `${sp}.shots[${hi}]`;
      if (!isObj(sh)) { P(hp, 'must be an object'); return; }
      if (!isStr(sh.id)) P(`${hp}.id`, 'a shot id is required');
      else if (shotIds.has(sh.id)) P(`${hp}.id`, `duplicate shot id "${sh.id}"`); else shotIds.add(sh.id);
      const cam = sh.camera;
      if (cam !== undefined && !isObj(cam)) P(`${hp}.camera`, 'must be an object { size, on, move, angle }');
      else if (cam) {
        if (cam.size !== undefined && !SIZES.includes(cam.size)) P(`${hp}.camera.size`, `must be one of ${SIZES.join(', ')} (got ${JSON.stringify(cam.size)})`);
        if (cam.move !== undefined && !MOVES.includes(cam.move)) P(`${hp}.camera.move`, `must be one of ${MOVES.join(', ')} (got ${JSON.stringify(cam.move)})`);
        if (cam.angle !== undefined && !ANGLES.includes(cam.angle)) P(`${hp}.camera.angle`, `must be one of ${ANGLES.join(', ')}`);
        if (cam.on !== undefined) {
          const on = typeof cam.on === 'string' ? [cam.on] : cam.on;
          if (!Array.isArray(on)) P(`${hp}.camera.on`, 'must be an array of actor ids and/or anchor names');
          else on.forEach((n, i) => { if (!(cast[n] || anchors.has(n))) P(`${hp}.camera.on[${i}]`, `"${n}" is neither a cast member nor an anchor of set "${sc.set}"`); });
          if (cam.move === 'pan' && (!Array.isArray(on) || on.length < 2)) P(`${hp}.camera.on`, 'a pan needs two subjects: "on": [from, to]');
        }
        if (cam.dof !== undefined && !(typeof cam.dof === 'boolean' || isNum(cam.dof))) P(`${hp}.camera.dof`, 'must be true/false or a blur radius');
        if (cam.zoom !== undefined && !(isNum(cam.zoom) && cam.zoom > 0)) P(`${hp}.camera.zoom`, 'must be a positive multiplier');
      }
      for (const k of ['hold', 'fadeIn', 'fadeOut']) if (sh[k] !== undefined && !(isNum(sh[k]) && sh[k] >= 0)) P(`${hp}.${k}`, 'must be a number of seconds ≥ 0');
      if (sh.dur !== undefined && !(isNum(sh.dur) && sh.dur > 0)) P(`${hp}.dur`, 'must be a positive number of seconds');
      if (sh.beats !== undefined && !Array.isArray(sh.beats)) { P(`${hp}.beats`, 'must be an array'); return; }
      if (!(sh.beats || []).length && sh.dur === undefined) Wn(`${hp}.beats`, 'no beats and no dur: the shot lasts only its hold');
      const ids = new Set();
      (sh.beats || []).forEach((b, bi) => {
        const bp = `${hp}.beats[${bi}]`;
        if (!isObj(b)) { P(bp, 'must be an object'); return; }
        const kinds = KINDS.filter(k => b[k] !== undefined);
        if (kinds.length !== 1) { P(bp, kinds.length ? `has several beat kinds (${kinds.join(', ')}); use one per beat` : `unknown beat: expected one of ${KINDS.map(k => `"${k}"`).join(', ')}`); return; }
        const kind = kinds[0];
        if (b.id !== undefined) { if (!isStr(b.id)) P(`${bp}.id`, 'must be a string'); else ids.add(b.id); }
        if (b.with !== undefined && !(b.with === 'prev' || (isStr(b.with) && ids.has(b.with)))) P(`${bp}.with`, `must be "prev" or the id of an earlier beat in this shot (got ${JSON.stringify(b.with)})`);
        if (b.after !== undefined && !(isNum(b.after) && b.after >= 0)) P(`${bp}.after`, 'must be a number of seconds ≥ 0');
        const atIsTime = !(kind === 'fx' || (kind === 'do' && ['look', 'place'].includes(b.do)) || kind === 'sfx');
        if (b.at !== undefined && atIsTime && !(isNum(b.at) && b.at >= 0)) P(`${bp}.at`, 'must be a time in seconds from the shot start');
        if (b.at !== undefined && !atIsTime && !(isStr(b.at) || (isNum(b.at) && b.at >= 0))) P(`${bp}.at`, 'must be a time in seconds, or a place (actor or anchor)');
        const known = new Set([...COMMON, ...BEAT_KEYS[kind]]);
        for (const k of Object.keys(b)) if (!known.has(k) && !(kind === 'do' && b.do === 'custom')) Wn(`${bp}.${k}`, `unknown field "${k}" for a ${kind === 'do' ? `"${b.do}"` : kind} beat; ignored`);
        const whoOK = (who, p, need = true) => {
          if (who === undefined) { if (need) P(p, 'who is required'); return false; }
          if (!cast[who]) { P(p, `"${who}" is not in the cast`); return false; }
          if (!present.has(who)) { P(p, `"${who}" is not in this scene yet (add it to the scene's actors, or bring it in with an "enter" beat first)`); return false; }
          return true;
        };
        if (kind === 'say') {
          if (!isStr(b.say)) P(`${bp}.say`, 'must be "narrator" or a cast id');
          else if (b.say !== 'narrator' && !cast[b.say]) P(`${bp}.say`, `"${b.say}" is neither "narrator" nor in the cast`);
          else if (!speakerOK(b.say)) P(`${bp}.say`, `"${b.say}" has no voice: add voices.${b.say} or give cast.${b.say}.voice`);
          else if (b.say !== 'narrator' && !present.has(b.say) && !b.vo) Wn(`${bp}.say`, `"${b.say}" speaks but is not in the scene; add "vo": true for a voice-over`);
          if (!isStr(b.text)) P(`${bp}.text`, 'the line text is required');
          if (b.tone !== undefined && typeof b.tone !== 'string') P(`${bp}.tone`, 'must be a string');
          if (b.expr !== undefined && b.say !== 'narrator' && rigOf[b.say] && !(rigOf[b.say].expressions || []).includes(b.expr)) Wn(`${bp}.expr`, `rig "${rigOf[b.say].kind}" has no expression "${b.expr}"`);
        } else if (kind === 'wait') {
          if (!(isNum(b.wait) && b.wait >= 0)) P(`${bp}.wait`, 'must be a number of seconds ≥ 0');
        } else if (kind === 'sfx') {
          if (!isStr(b.sfx)) P(`${bp}.sfx`, 'must be a sound effect name');
          if (b.gain !== undefined && !(isNum(b.gain) && b.gain >= 0)) P(`${bp}.gain`, 'must be a number ≥ 0');
          if (b.pan !== undefined && !(isNum(b.pan) && b.pan >= -1 && b.pan <= 1)) P(`${bp}.pan`, 'must be a number in -1..1');
        } else if (kind === 'fx') {
          if (!FX.includes(b.fx)) P(`${bp}.fx`, `unknown effect "${b.fx}" (one of ${FX.join(', ')})`);
          const where = b.on ?? b.who ?? (typeof b.at === 'string' ? b.at : undefined);
          if (where !== undefined) checkTarget(where, `${bp}.${b.on !== undefined ? 'on' : b.who !== undefined ? 'who' : 'at'}`, { anchors, cast, S, P, allowSide: false, actorsOK: true });
          if (b.dur !== undefined && !(isNum(b.dur) && b.dur > 0)) P(`${bp}.dur`, 'must be a positive number of seconds');
        } else if (kind === 'music') {
          checkMusic(['sting', 'cue', true].includes(b.music) ? undefined : b.music, `${bp}.music`, P, false, b);
        } else if (kind === 'title') {
          if (typeof b.title !== 'string') P(`${bp}.title`, 'must be a string');
          if (b.dur !== undefined && !(isNum(b.dur) && b.dur > 0)) P(`${bp}.dur`, 'must be a positive number of seconds');
        } else if (kind === 'do') {
          const d = b.do, R = rigOf[b.who];
          if (!DO.includes(d)) { P(`${bp}.do`, `unknown action "${d}" (one of ${DO.join(', ')})`); return; }
          if (d === 'custom') {
            if (!isStr(b.name)) P(`${bp}.name`, 'the name of a function exported by custom.mjs is required');
            else if (!ctx.custom[b.name]) Wn(`${bp}.name`, `custom.mjs has no "${b.name}" (have: ${Object.keys(ctx.custom).join(', ') || 'no custom.mjs'}); the beat only takes time`);
            if (b.dur !== undefined && !(isNum(b.dur) && b.dur >= 0)) P(`${bp}.dur`, 'must be a number of seconds ≥ 0');
            return;
          }
          if (d === 'enter') {
            if (b.who === undefined) P(`${bp}.who`, 'who is required');
            else if (!cast[b.who]) P(`${bp}.who`, `"${b.who}" is not in the cast`);
            else if (present.has(b.who)) P(`${bp}.who`, `"${b.who}" is already in the scene; use walk, or start it with "offstage" in the scene's actors`);
            else present.add(b.who);
            if (b.from !== undefined) checkTarget(b.from, `${bp}.from`, { anchors, cast, S, P, allowSide: true });
            if (b.to !== undefined) checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: false, self: b.who });
          } else if (!whoOK(b.who, `${bp}.who`)) return;
          if (MOVE_DO.includes(d)) {
            if (b.to === undefined) P(`${bp}.to`, 'a destination is required');
            else checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: false, self: b.who });
            if (d === 'fly' && R && !R.flies) P(`${bp}.do`, `rig "${R.kind}" cannot fly`);
          }
          if (d === 'exit') { if (b.to === undefined) P(`${bp}.to`, 'where to: "left", "right" or a place'); else checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: true, self: b.who }); present.delete(b.who); }
          if (b.speed !== undefined && !(isNum(b.speed) && b.speed > 0 && b.speed <= 8)) P(`${bp}.speed`, 'must be a speed multiplier between 0 and 8 (1 = the rig\'s natural pace)');
          if (b.gait !== undefined && R && !R.gaits?.[b.gait]) P(`${bp}.gait`, `rig "${R.kind}" has no gait "${b.gait}" (gaits: ${Object.keys(R.gaits || {}).join(', ')})`);
          if ((d === 'pose' || ((MOVE_DO.includes(d) || d === 'place' || d === 'set' || d === 'enter') && b.pose !== undefined)) && R) {
            if (d === 'pose' && b.pose === undefined) P(`${bp}.pose`, 'a pose name is required');
            else if (b.pose !== undefined && !rigPose(R, b.pose)) P(`${bp}.pose`, `rig "${R.kind}" has no pose "${b.pose}" (poses: ${poseNames(R).join(', ')})`);
          }
          if (d === 'pose' && b.dur !== undefined && !(isNum(b.dur) && b.dur >= 0)) P(`${bp}.dur`, 'must be a number of seconds ≥ 0');
          if (POSTURE_DO.includes(d) && R) {
            const want = d === 'wake' ? 'stand' : d;
            if (!rigPose(R, want)) P(`${bp}.do`, `rig "${R.kind}" has no pose for "${d}" (poses: ${poseNames(R).join(', ')})`);
          }
          if (d === 'gesture' && R) {
            if (!isStr(b.name)) P(`${bp}.name`, 'a gesture name is required');
            else if (!R.gestures?.[b.name]) P(`${bp}.name`, `rig "${R.kind}" has no gesture "${b.name}" (gestures: ${Object.keys(R.gestures || {}).join(', ')})`);
          }
          if (d === 'look') {
            const at = typeof b.at === 'string' ? b.at : b.to;
            if (at === undefined) P(`${bp}.at`, 'what to look at is required (an actor, an anchor, "left", "right" or "none")');
            else if (!['none', 'left', 'right', 'camera', 'sky', 'up'].includes(at)) checkTarget(at, `${bp}.at`, { anchors, cast, S, P, allowSide: true, actorsOK: true });
          }
          if (d === 'turn' && !(faceOK(b.face) || b.face === 'around')) P(`${bp}.face`, 'must be "left", "right" or "around"');
          if ((d === 'emote' || b.expr !== undefined) && R) {
            if (d === 'emote' && !isStr(b.expr)) P(`${bp}.expr`, 'an expression name is required');
            else if (b.expr !== undefined && !(R.expressions || []).includes(b.expr)) P(`${bp}.expr`, `rig "${R.kind}" has no expression "${b.expr}" (expressions: ${(R.expressions || []).join(', ')})`);
          }
          if (d === 'place') { const at = b.to ?? (typeof b.at === 'string' ? b.at : undefined); if (at === undefined) P(`${bp}.to`, 'where to place the actor is required'); else checkTarget(at, `${bp}.${b.to !== undefined ? 'to' : 'at'}`, { anchors, cast, S, P, allowSide: false, self: b.who }); }
          if (d === 'fade' && !(isNum(b.to) && b.to >= 0 && b.to <= 1)) P(`${bp}.to`, 'must be an opacity 0..1');
          if (d === 'set' && b.params !== undefined && !isObj(b.params)) P(`${bp}.params`, 'must be an object');
          if (b.face !== undefined && d !== 'turn' && !faceOK(b.face)) P(`${bp}.face`, 'must be "left" or "right"');
        }
      });
    });
  });
  return { problems, warnings };
}

function checkMusic(m, p, P, sceneLevel, beat = {}) {
  if (m === undefined) {
    if (sceneLevel) return;
    const mood = beat.mood, sting = beat.sting ?? (beat.music === 'sting' ? beat.name : undefined);
    if (sting !== undefined) { if (!STINGS.includes(sting)) P(p, `unknown sting "${sting}" (one of ${STINGS.join(', ')})`); return; }
    if (mood === undefined) { P(p, 'a music beat needs a mood, "none", or a sting'); return; }
    if (!MOODS.includes(mood)) P(p, `unknown mood "${mood}" (one of ${MOODS.join(', ')})`);
    return;
  }
  if (m === 'none' || m === null) return;
  if (typeof m === 'string') { if (!MOODS.includes(m)) P(p, `unknown mood "${m}" (one of ${MOODS.join(', ')}, or "none")`); return; }
  if (!isObj(m)) { P(p, 'must be { mood, intensity }, a mood name or "none"'); return; }
  if (m.sting !== undefined) { if (!STINGS.includes(m.sting)) P(`${p}.sting`, `unknown sting "${m.sting}" (one of ${STINGS.join(', ')})`); return; }
  if (!MOODS.includes(m.mood)) P(`${p}.mood`, `unknown mood ${JSON.stringify(m.mood)} (one of ${MOODS.join(', ')})`);
  if (m.intensity !== undefined && !(isNum(m.intensity) && m.intensity >= 0 && m.intensity <= 1)) P(`${p}.intensity`, 'must be a number 0..1');
}

function checkTarget(v, p, { anchors, cast, S, P, allowSide, actorsOK = false, self }) {
  const T = parseTarget(v);
  if (T.kind === 'bad') { P(p, `not a place: ${JSON.stringify(v)} (use an anchor name, "x:1500", "x:1500,y:1060", "near:<actor>", "left-of:<actor>" or "right-of:<actor>")`); return; }
  if (T.kind === 'side' && !allowSide) { P(p, `"${v}" is only valid for enter/exit; use an anchor or "x:…" here`); return; }
  if (['near', 'left-of', 'right-of', 'behind', 'front-of'].includes(T.kind)) {
    if (!cast[T.who]) P(p, `"${T.who}" is not in the cast`);
    else if (T.who === self) P(p, 'an actor cannot move relative to itself');
    return;
  }
  if (T.kind === 'name') {
    if (anchors.has(T.name)) return;
    if (actorsOK && cast[T.name]) return;
    P(p, `set "${S?.id ?? '?'}" has no anchor "${T.name}" (anchors: ${[...anchors].join(', ')})`);
    return;
  }
  if (S && (T.kind === 'x' || T.kind === 'xy')) {
    const A = S.area;
    if (T.x < A.x0 - 2000 || T.x > A.x1 + 2000 || (T.kind === 'xy' && (T.y < A.y0 || T.y > A.y1))) P(p, `${JSON.stringify(v)} is far outside set "${S.id}" (x ${A.x0}..${A.x1}, y ${A.y0}..${A.y1})`);
  }
}
