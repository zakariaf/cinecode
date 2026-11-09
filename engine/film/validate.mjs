// Storyboard validation: walks a parsed film.json and lists every problem with its path (all of them, not just
// the first), plus warnings for things that are probably mistakes (unknown fields).
// ctx: { getRig(kind), kits: Set of kit names, sets: { setId: set instance }, custom: { name: def },
//        overlays: { name: def } and sounds: { name: fn } from custom.mjs }
// Sound, mood and sting names come from the audio modules (SFX_NAMES / SFX_ALIASES, MOOD_NAMES / STING_NAMES),
// read at validation time so there is one source of truth. Round 2 (DESIGN §9.1) adds: say tts / trimEnd, mark
// beats (unique names), riding ("on:<actor>" for hop / place, scene actors { on }), wade / depth, look to up / sky /
// down, camera to / toOn / zoomTo / moveAt / moveDur / offset, shot time / grade / gradeTo / music, scene overlays
// and rim, music motif / motifVoice / hold / downbeat / tempo, the film's score, touch / contact on any beat; title
// beats' place (a TITLE_PLACES name, "auto" or a fraction of the frame height). Hovering: "height" on a fly / enter /
// place of a rig that flies (not with "on:"), or on a scene actor's starting place; a hoverer takes no sit / lie /
// sleep / pose until a move without "height" lands it; "fly" (true / false) on an enter of a flier. A look may give "tilt" (a
// head pitch, -1..1); DO_KEYS lists the fields only one action takes.
import * as SFX from '../audio/sfx.mjs';
import * as MUSIC from '../audio/music.mjs';
import { parseTarget, rigPose, poseNames } from './util.mjs';
import { TITLE_PLACES } from './text.mjs';

export const SIZES = ['establishing', 'wide', 'full', 'medium', 'close', 'extreme-close'];
export const MOVES = ['static', 'push-in', 'pull-out', 'pan', 'track', 'tilt-up', 'tilt-down', 'handheld'];
export const ANGLES = ['eye', 'low', 'high'];
const FALLBACK_MOODS = ['wonder', 'pastoral', 'tender', 'playful', 'tension', 'chase', 'sad', 'triumph', 'night', 'mystery'];
const FALLBACK_STINGS = ['surprise', 'sad', 'triumph', 'magic'];
const FALLBACK_MOTIF_VOICES = ['bassoon', 'flute', 'cello', 'horn', 'celesta', 'violin', 'strings', 'music-box', 'tutti'];
export const moodNames = () => (Array.isArray(MUSIC.MOOD_NAMES) ? MUSIC.MOOD_NAMES : FALLBACK_MOODS);
export const stingNames = () => (Array.isArray(MUSIC.STING_NAMES) ? MUSIC.STING_NAMES : FALLBACK_STINGS);
export const motifVoices = () => (Array.isArray(MUSIC.MOTIF_VOICES) ? MUSIC.MOTIF_VOICES : FALLBACK_MOTIF_VOICES);
export const sfxNames = () => [...(SFX.SFX_NAMES || []), ...Object.keys(SFX.SFX_ALIASES || {})];
export const MUSIC_EXTRAS = ['motif', 'motifVoice', 'hold', 'downbeat', 'tempo'];
export const FX = ['dust', 'splash', 'leaves', 'sparkle', 'rain', 'fireflies', 'motes', 'mist'];
export const FIELD_FX = ['leaves', 'rain', 'fireflies', 'motes', 'mist'];        // built-in effects that work as overlays
export const OVERLAY_LAYERS = ['sky', 'back', 'world', 'front', 'grade', 'screen'];
export const RIM_DIRS = ['left', 'right', 'top', 'upper-left', 'upper-right'];
export const RIM_DEFAULTS = { dir: 'upper-left', color: '#fff1d6', strength: 0.8, rise: 0, width: 3 };
const LOOK_SPECIAL = ['none', 'left', 'right', 'camera', 'sky', 'up', 'down'];
export const AMBIENCES = ['meadow-day', 'meadow-night', 'forest-day', 'forest-night', 'stream', 'village-day', 'village-night', 'wind-hill'];
export const GRADES = ['memory', 'dream', 'none'];
export const CAPTION_MODES = ['dialogue', 'all', 'none'];
export const MOVE_DO = ['walk', 'run', 'hop', 'fly'];
export const POSTURE_DO = ['sit', 'stand', 'lie', 'sleep', 'wake'];
export const DO = [...MOVE_DO, 'enter', 'exit', 'pose', 'gesture', 'look', 'turn', 'emote', ...POSTURE_DO, 'custom', 'place', 'fade', 'set', 'blink'];
const KINDS = ['say', 'do', 'sfx', 'fx', 'music', 'wait', 'title', 'mark'];
const COMMON = ['id', 'with', 'after', 'at', 'note', 'comment', 'touch', 'contact'];
const BEAT_KEYS = {
  say: ['say', 'text', 'tone', 'expr', 'vo', 'voice', 'dur', 'caption', 'to', 'tts', 'trimEnd'],
  sfx: ['sfx', 'gain', 'pan', 'params', 'seed', 'caption', 'dur', 'who', 'on'],
  fx: ['fx', 'dur', 'on', 'who', 'size', 'n', 'dir', 'color'],
  music: ['music', 'mood', 'intensity', 'sting', 'name', 'key', ...MUSIC_EXTRAS],
  wait: ['wait'],
  title: ['title', 'sub', 'subtitle', 'dur', 'place'],
  mark: ['mark'],
  do: ['do', 'who', 'to', 'from', 'speed', 'gait', 'pose', 'dur', 'expr', 'name', 'face', 'params', 'run', 'look', 'end', 'over', 'height', 'alpha', 'wade', 'depth', 'fly'],
};
// fields only one action takes (on top of BEAT_KEYS.do)
const DO_KEYS = { look: ['tilt'] };
// a rig that flies (a fly gait): it can hover ("height")
const canFly = R => !!(R?.flies && R.gaits?.fly);
const HEIGHT_UNITS = 'must be a positive number of units above the place (at the set\'s scale: a mouse is about 18 tall, a human child 141)';
const noHover = R => `rig "${R.kind}" cannot fly, so it cannot hover; "height" is for rigs that fly (a fly gait)`;
const SCORE_TOKEN = /^[A-Ga-g][#b]?-?\d:\d+(\.\d+)?$/;
// Why music.mjs parseMotif could not play a note:beats token (beats must be > 0, the note one it knows), or null.
function scoreTokenProblem(tk) {
  if (!(Number(tk.split(':')[1]) > 0)) return 'beats must be more than 0';
  if (typeof MUSIC.parseMotif !== 'function') return null;
  try { return MUSIC.parseMotif(tk).every(n => Number.isFinite(n.midi)) ? null : 'unknown note name (use C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B)'; }
  catch (e) { return e.message; }
}
const isColor = v => typeof v === 'string' && /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(.+\)|hsla?\(.+\))$/i.test(v.trim());

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
  if (film.score !== undefined) {
    const sc = film.score;
    if (!isObj(sc)) P('score', 'must be an object { "key": "C", "motif": "G4:1 E4:0.5 …" }');
    else {
      if (sc.key !== undefined && !(typeof sc.key === 'string' && /^\s*[A-Ga-g][#b]?/.test(sc.key))) P('score.key', `must be a key name such as "C", "Eb" or "F#m" (got ${JSON.stringify(sc.key)})`);
      if (sc.motif !== undefined) {
        const toks = typeof sc.motif === 'string' ? sc.motif.trim().split(/\s+/).filter(Boolean) : null;
        if (!toks || !toks.length) P('score.motif', 'must be a string of note:beats tokens, e.g. "G4:1 E4:0.5 G4:0.5 A4:2 C5:3"');
        else toks.forEach((tk, i) => {
          if (!SCORE_TOKEN.test(tk)) P('score.motif', `token ${i + 1} "${tk}" is not note:beats (e.g. "G4:1", "Bb3:0.5")`);
          else { const why = scoreTokenProblem(tk); if (why) P('score.motif', `token ${i + 1} "${tk}": ${why}`); }
        });
      }
    }
  }
  const sounds = ctx.sounds || {}, overlayDefs = ctx.overlays || {};
  for (const [name, fn] of Object.entries(sounds)) if (typeof fn !== 'function') P(`custom.mjs sounds.${name}`, 'must be a function ({ seed, dur, params }) → Float32Array (48 kHz mono)');
  for (const [name, def] of Object.entries(overlayDefs)) {
    if (!isObj(def) || typeof def.draw !== 'function') P(`custom.mjs overlays.${name}`, 'must be { layer, draw(ctx, api) }');
    else if (def.layer !== undefined && !OVERLAY_LAYERS.includes(def.layer)) P(`custom.mjs overlays.${name}.layer`, `must be one of ${OVERLAY_LAYERS.join(', ')} (got ${JSON.stringify(def.layer)})`);
  }
  const SFX_OK = new Set([...sfxNames(), ...Object.keys(sounds)]);
  const sfxList = () => `${(SFX.SFX_NAMES || []).join(', ')}${Object.keys(sounds).length ? `; custom.mjs sounds: ${Object.keys(sounds).join(', ')}` : ''}`;
  for (const [name, def] of Object.entries(ctx.custom || {})) {
    if (def?.layer !== undefined && !OVERLAY_LAYERS.includes(def.layer)) P(`custom.mjs custom.${name}.layer`, `must be one of ${OVERLAY_LAYERS.join(', ')} (got ${JSON.stringify(def.layer)})`);
    (Array.isArray(def?.sfx) ? def.sfx : []).forEach((e, i) => { if (!SFX_OK.has(e?.name)) P(`custom.mjs custom.${name}.sfx[${i}].name`, `unknown sound ${JSON.stringify(e?.name)} (known: ${sfxList()})`); });
  }
  if (!Array.isArray(film.scenes) || !film.scenes.length) { P('scenes', 'at least one scene is required'); return { problems, warnings }; }

  const sceneIds = new Set(), shotIds = new Set(), marks = new Map();
  // every mark in the film (a rim may start on a mark set in any scene)
  const allMarks = new Set();
  for (const sc of film.scenes) for (const sh of (isObj(sc) && Array.isArray(sc.shots) ? sc.shots : [])) for (const b of (isObj(sh) && Array.isArray(sh.beats) ? sh.beats : [])) if (isObj(b) && isStr(b.mark)) allMarks.add(b.mark);
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
    const checkGrade = (g, p) => { if (!(GRADES.includes(g) || skyNames.includes(g))) P(p, `unknown grade ${JSON.stringify(g)} (one of ${[...GRADES, ...skyNames].join(', ')})`); };
    if (sc.grade !== undefined) checkGrade(sc.grade, `${sp}.grade`);
    if (sc.transition !== undefined && !['cut', 'fade', 'dissolve'].includes(sc.transition)) P(`${sp}.transition`, 'must be cut | fade | dissolve');
    checkMusic(sc.music, `${sp}.music`, P, true);
    if (sc.ambience !== undefined && !(typeof sc.ambience === 'string')) P(`${sp}.ambience`, 'must be "auto", "none" or an ambience name');
    else if (typeof sc.ambience === 'string' && !['auto', 'none', ...AMBIENCES].includes(sc.ambience)) Wn(`${sp}.ambience`, `unknown ambience "${sc.ambience}" (known: ${AMBIENCES.join(', ')})`);
    if (sc.fx !== undefined) {
      if (!Array.isArray(sc.fx)) P(`${sp}.fx`, 'must be an array of effect names');
      else sc.fx.forEach((n, i) => { if (!FX.includes(n)) Wn(`${sp}.fx[${i}]`, `unknown world effect "${n}" (known: ${FX.join(', ')}); ignored`); });
    }
    if (sc.overlays !== undefined) {
      if (!Array.isArray(sc.overlays)) P(`${sp}.overlays`, 'must be an array of overlay names or { "name", "params" }');
      else sc.overlays.forEach((o, i) => {
        const op = `${sp}.overlays[${i}]`, name = typeof o === 'string' ? o : isObj(o) ? o.name : undefined;
        if (!isStr(name)) { P(op, 'must be an overlay name or { "name": …, "params": { … } }'); return; }
        if (isObj(o) && o.params !== undefined && !isObj(o.params)) P(`${op}.params`, 'must be an object');
        if (!(overlayDefs[name] || FIELD_FX.includes(name))) P(op, `unknown overlay "${name}" (built in: ${FIELD_FX.join(', ')}; ${Object.keys(overlayDefs).length ? `custom.mjs overlays: ${Object.keys(overlayDefs).join(', ')}` : 'custom.mjs exports no overlays'})`);
      });
    }
    if (sc.rim !== undefined) {
      const r = sc.rim, rp = `${sp}.rim`;
      if (!isObj(r)) P(rp, 'must be an object { dir, color, strength, start, rise, width }');
      else {
        if (r.dir !== undefined && !RIM_DIRS.includes(r.dir)) P(`${rp}.dir`, `must be one of ${RIM_DIRS.join(', ')} (got ${JSON.stringify(r.dir)})`);
        if (r.color !== undefined && !isColor(r.color)) P(`${rp}.color`, `must be a colour such as "#fff1d6" (got ${JSON.stringify(r.color)})`);
        if (r.strength !== undefined && !(isNum(r.strength) && r.strength >= 0 && r.strength <= 1)) P(`${rp}.strength`, 'must be a number 0..1');
        if (r.rise !== undefined && !(isNum(r.rise) && r.rise >= 0)) P(`${rp}.rise`, 'must be a number of seconds ≥ 0');
        if (r.width !== undefined && !(isNum(r.width) && r.width > 0)) P(`${rp}.width`, 'must be a positive number of screen pixels (at least 2 is used)');
        if (r.start !== undefined && !(isNum(r.start) && r.start >= 0) && !(isStr(r.start) && allMarks.has(r.start))) P(`${rp}.start`, isStr(r.start) ? `no mark "${r.start}" in the film (marks: ${[...allMarks].join(', ') || 'none'})` : 'must be a mark name or seconds from the scene start');
        for (const k of Object.keys(r)) if (!['dir', 'color', 'strength', 'start', 'rise', 'width'].includes(k)) Wn(`${rp}.${k}`, `unknown rim field "${k}"; ignored`);
      }
    }

    // actors present in the scene (initial), then grown by enter beats; riders (rider → carrier) and hoverers (in the air,
    // "height"), tracked in beat order
    const present = new Set(), riding = new Map(), hovering = new Set();
    if (sc.actors !== undefined && !isObj(sc.actors)) P(`${sp}.actors`, 'must be an object { castId: { at, face, pose } }');
    const sceneActors = isObj(sc.actors) ? sc.actors : {};
    for (const [id, a] of Object.entries(sceneActors)) {
      const ap = `${sp}.actors.${id}`;
      if (!cast[id]) { P(ap, `"${id}" is not in the cast (have: ${Object.keys(cast).join(', ') || 'none'})`); continue; }
      if (!isObj(a)) { P(ap, 'must be an object { at, face, pose } or { offstage }'); continue; }
      if (a.offstage !== undefined) { if (!['left', 'right'].includes(a.offstage)) P(`${ap}.offstage`, 'must be "left" or "right"'); }
      else if (a.on !== undefined) {
        present.add(id);
        const c = sceneActors[a.on];
        if (a.at !== undefined) P(`${ap}.at`, 'give either "at" (a place) or "on" (riding another actor), not both');
        if (!isStr(a.on) || !cast[a.on]) P(`${ap}.on`, `"${a.on}" is not in the cast`);
        else if (a.on === id) P(`${ap}.on`, 'an actor cannot ride itself');
        else if (!isObj(c) || c.offstage !== undefined) P(`${ap}.on`, `"${a.on}" must start in the scene (not offstage) to carry ${id}`);
        else if (c.on !== undefined) P(`${ap}.on`, `"${a.on}" is itself riding "${c.on}"; riders cannot carry riders`);
        else riding.set(id, a.on);
      }
      else { present.add(id); if (a.at === undefined) P(`${ap}.at`, 'a starting place is required (an anchor, "x:1500", "x:1500,y:1060"), "on": "<actor>" to ride, or use { "offstage": "left" }'); }
      if (a.at !== undefined) checkTarget(a.at, `${ap}.at`, { anchors, cast, S, P, allowSide: false });
      if (a.face !== undefined && !faceOK(a.face)) P(`${ap}.face`, 'must be "left" or "right"');
      if (a.pose !== undefined && rigOf[id] && !rigPose(rigOf[id], a.pose)) P(`${ap}.pose`, `rig "${rigOf[id].kind}" has no pose "${a.pose}" (poses: ${poseNames(rigOf[id]).join(', ')})`);
      if (a.expr !== undefined && rigOf[id] && !(rigOf[id].expressions || []).includes(a.expr)) Wn(`${ap}.expr`, `rig "${rigOf[id].kind}" has no expression "${a.expr}"`);
      // starting in the air: "height" above its place ("at"), a flier only
      if (a.height !== undefined) {
        if (a.at === undefined) P(`${ap}.height`, 'only an actor starting at a place ("at") can start in the air');
        else if (!(isNum(a.height) && a.height > 0)) P(`${ap}.height`, HEIGHT_UNITS);
        else if (rigOf[id] && !canFly(rigOf[id])) P(`${ap}.height`, noHover(rigOf[id]));
        else if (a.pose !== undefined) P(`${ap}.pose`, 'a hovering flier keeps flapping, so it takes no pose; start it on the ground (drop "height") for a pose');
        else hovering.add(id);
      }
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
        const zoomMove = cam.move === 'push-in' || cam.move === 'pull-out';
        if (cam.to !== undefined) { if (!SIZES.includes(cam.to)) P(`${hp}.camera.to`, `must be one of ${SIZES.join(', ')} (got ${JSON.stringify(cam.to)})`); else if (!zoomMove) P(`${hp}.camera.to`, 'only a push-in or pull-out can end at another size'); }
        if (cam.toOn !== undefined) {
          const on = typeof cam.toOn === 'string' ? [cam.toOn] : cam.toOn;
          if (!Array.isArray(on) || !on.length) P(`${hp}.camera.toOn`, 'must be an array of actor ids and/or anchor names');
          else on.forEach((n, i) => { if (!(cast[n] || anchors.has(n))) P(`${hp}.camera.toOn[${i}]`, `"${n}" is neither a cast member nor an anchor of set "${sc.set}"`); });
          if (!zoomMove) P(`${hp}.camera.toOn`, 'only a push-in or pull-out can end on other subjects');
        }
        if (cam.zoomTo !== undefined) { if (!(isNum(cam.zoomTo) && cam.zoomTo > 0)) P(`${hp}.camera.zoomTo`, 'must be a positive multiplier of the starting zoom'); else if (!zoomMove) P(`${hp}.camera.zoomTo`, 'only for push-in / pull-out moves'); else if (cam.to !== undefined) Wn(`${hp}.camera.zoomTo`, 'ignored: "to" sets where the move ends'); }
        if (cam.moveAt !== undefined && !(isNum(cam.moveAt) && cam.moveAt >= 0)) P(`${hp}.camera.moveAt`, 'must be seconds from the shot start (≥ 0)');
        if (cam.moveDur !== undefined && !(isNum(cam.moveDur) && cam.moveDur > 0)) P(`${hp}.camera.moveDur`, 'must be a positive number of seconds');
        if (cam.offset !== undefined && !(Array.isArray(cam.offset) && cam.offset.length === 2 && cam.offset.every(isNum))) P(`${hp}.camera.offset`, 'must be [x, y]: frame fractions (|v| ≤ 2) or world pixels');
      }
      if (sh.time !== undefined) {
        if (typeof sh.time === 'string') checkTime(sh.time, `${hp}.time`);
        else if (isObj(sh.time) && sh.time.from && sh.time.to) { checkTime(sh.time.from, `${hp}.time.from`); checkTime(sh.time.to, `${hp}.time.to`); }
        else P(`${hp}.time`, 'must be a time name or { "from": …, "to": … }');
      }
      if (sh.grade !== undefined) checkGrade(sh.grade, `${hp}.grade`);
      if (sh.gradeTo !== undefined) checkGrade(sh.gradeTo, `${hp}.gradeTo`);
      checkMusic(sh.music, `${hp}.music`, P, true);
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
        for (const k of ['touch', 'contact']) if (b[k] !== undefined) {
          const list = Array.isArray(b[k]) ? b[k] : [b[k]];
          if (!list.every(isStr)) P(`${bp}.${k}`, 'must be an actor id or a list of actor ids');
          else list.forEach(n => { if (!cast[n]) Wn(`${bp}.${k}`, `"${n}" is not in the cast`); });
        }
        if (b.at !== undefined && atIsTime && !(isNum(b.at) && b.at >= 0)) P(`${bp}.at`, 'must be a time in seconds from the shot start');
        if (b.at !== undefined && !atIsTime && !(isStr(b.at) || (isNum(b.at) && b.at >= 0))) P(`${bp}.at`, 'must be a time in seconds, or a place (actor or anchor)');
        const known = new Set([...COMMON, ...BEAT_KEYS[kind], ...(kind === 'do' ? DO_KEYS[b.do] || [] : [])]);
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
          if (b.tts !== undefined && !isStr(b.tts)) P(`${bp}.tts`, 'must be the text the voice actually says (a non-empty string)');
          if (b.trimEnd !== undefined && !(isNum(b.trimEnd) && b.trimEnd >= 0 && b.trimEnd < 10)) P(`${bp}.trimEnd`, 'must be seconds (0..10) cut off the end of the spoken audio');
          if (b.expr !== undefined && b.say !== 'narrator' && rigOf[b.say] && !(rigOf[b.say].expressions || []).includes(b.expr)) Wn(`${bp}.expr`, `rig "${rigOf[b.say].kind}" has no expression "${b.expr}"`);
        } else if (kind === 'wait') {
          if (!(isNum(b.wait) && b.wait >= 0)) P(`${bp}.wait`, 'must be a number of seconds ≥ 0');
        } else if (kind === 'mark') {
          if (!isStr(b.mark)) P(`${bp}.mark`, 'must be a mark name');
          else if (marks.has(b.mark)) P(`${bp}.mark`, `duplicate mark "${b.mark}" (already set at ${marks.get(b.mark)}); mark names are unique per film`);
          else marks.set(b.mark, bp);
        } else if (kind === 'sfx') {
          if (!isStr(b.sfx)) P(`${bp}.sfx`, 'must be a sound effect name');
          else if (!SFX_OK.has(b.sfx)) P(`${bp}.sfx`, `unknown sound "${b.sfx}" (known: ${sfxList()})`);
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
          if (b.place !== undefined && b.place !== null && b.place !== 'auto' && !TITLE_PLACES[b.place] && !(isNum(b.place) && b.place > 0 && b.place < 1)) P(`${bp}.place`, `must be "auto", one of ${Object.keys(TITLE_PLACES).join(', ')}, or a fraction of the frame height (0..1) for the title line`);
        } else if (kind === 'do') {
          const d = b.do, R = rigOf[b.who];
          if (!DO.includes(d)) { P(`${bp}.do`, `unknown action "${d}" (one of ${DO.join(', ')})`); return; }
          if (d === 'custom') {
            if (!isStr(b.name)) P(`${bp}.name`, 'the name of a function exported by custom.mjs is required');
            else if (!ctx.custom[b.name]) Wn(`${bp}.name`, `custom.mjs has no "${b.name}" (have: ${Object.keys(ctx.custom).join(', ') || 'no custom.mjs'}); the beat only takes time`);
            if (b.dur !== undefined && !(isNum(b.dur) && b.dur >= 0)) P(`${bp}.dur`, 'must be a number of seconds ≥ 0');
            return;
          }
          if (b.who !== undefined && riding.has(b.who) && ['walk', 'run', 'exit'].includes(d)) P(`${bp}.do`, `"${b.who}" is riding "${riding.get(b.who)}": it can only hop off (a hop to a place) or be placed`);
          if (d === 'enter') {
            if (b.who === undefined) P(`${bp}.who`, 'who is required');
            else if (!cast[b.who]) P(`${bp}.who`, `"${b.who}" is not in the cast`);
            else if (present.has(b.who)) P(`${bp}.who`, `"${b.who}" is already in the scene; use walk, or start it with "offstage" in the scene's actors`);
            else { present.add(b.who); riding.delete(b.who); for (const [r, c] of riding) if (c === b.who) present.add(r); }   // a carrier brings its riders back
            if (b.from !== undefined) checkTarget(b.from, `${bp}.from`, { anchors, cast, S, P, allowSide: true });
            if (b.to !== undefined) checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: false, self: b.who });
          } else if (!whoOK(b.who, `${bp}.who`)) return;
          const ride = { present, riding, allowOn: d === 'hop' || d === 'place' };
          if (MOVE_DO.includes(d)) {
            if (b.to === undefined) P(`${bp}.to`, 'a destination is required');
            else checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: false, self: b.who, ride });
            if (d === 'fly' && R && !R.flies) P(`${bp}.do`, `rig "${R.kind}" cannot fly`);
          }
          // hovering: "height" ends a fly / enter / place in the air, that many units above the place (fliers only);
          // "fly": true makes a flier's enter a flight
          const flier = canFly(R);
          let hovers = false;
          if (b.height !== undefined) {
            if (!['fly', 'enter', 'place'].includes(d)) P(`${bp}.height`, `only a fly, enter or place can end in the air ("height"); a ${d} cannot`);
            else if (!(isNum(b.height) && b.height > 0)) P(`${bp}.height`, HEIGHT_UNITS);
            else if (R && !flier) P(`${bp}.height`, noHover(R));
            else if (parseTarget(b.to ?? (d === 'place' ? b.at : undefined)).kind === 'on') P(`${bp}.height`, 'cannot hover and ride at once: drop "height" or the "on:" target');
            else hovers = true;
            if (hovers && b.pose !== undefined) P(`${bp}.pose`, 'a hovering flier keeps flapping, so it takes no pose; drop "height" to land it for a pose');
          }
          // a hoverer flaps in the air: it cannot sit, lie, sleep or take a pose there (it would do it in mid-air)
          if (b.who !== undefined && hovering.has(b.who)) {
            if (['sit', 'lie', 'sleep', 'pose'].includes(d)) P(`${bp}.do`, `"${b.who}" is hovering (flapping in the air), so it cannot ${d === 'pose' ? 'take a pose' : d} there; land it first: a fly or walk to a place without "height"`);
            else if (d === 'set' && b.pose !== undefined) P(`${bp}.pose`, `"${b.who}" is hovering (flapping in the air), so it takes no pose; land it first: a fly or walk to a place without "height"`);
          }
          if (b.who !== undefined && (MOVE_DO.includes(d) || ['enter', 'exit', 'place'].includes(d))) { if (hovers) hovering.add(b.who); else hovering.delete(b.who); }
          if (b.fly !== undefined) {
            if (typeof b.fly !== 'boolean') P(`${bp}.fly`, 'must be true or false');
            else if (d !== 'enter') P(`${bp}.fly`, `only an enter takes "fly" (to fly a ${d}, use "do": "fly")`);
            else if (b.fly && R && !flier) P(`${bp}.fly`, `rig "${R.kind}" cannot fly`);
          }
          if (b.wade !== undefined) { if (typeof b.wade !== 'boolean') P(`${bp}.wade`, 'must be true or false'); else if (d !== 'walk' && d !== 'run') P(`${bp}.wade`, 'only a walk or run can wade'); }
          if (b.depth !== undefined) { if (!(isNum(b.depth) && b.depth > 0)) P(`${bp}.depth`, 'must be a positive number of rig units (how deep the actor sinks)'); else if (!b.wade) Wn(`${bp}.depth`, 'only used with "wade": true'); }
          if (d === 'exit') { if (b.to === undefined) P(`${bp}.to`, 'where to: "left", "right" or a place'); else checkTarget(b.to, `${bp}.to`, { anchors, cast, S, P, allowSide: true, self: b.who }); present.delete(b.who); for (const [r, c] of riding) if (c === b.who) present.delete(r); }   // riders leave with their carrier
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
            const at = b.to !== undefined ? b.to : typeof b.at === 'string' ? b.at : undefined, lp = `${bp}.${b.to !== undefined ? 'to' : 'at'}`;
            if (at === undefined) P(`${bp}.to`, 'what to look at is required: "to": an actor, an anchor, "left", "right", "up", "sky", "down" or "none"');
            else if (!LOOK_SPECIAL.includes(at)) checkTarget(at, lp, { anchors, cast, S, P, allowSide: true, actorsOK: true });
            if (b.tilt !== undefined && !(isNum(b.tilt) && b.tilt >= -1 && b.tilt <= 1)) P(`${bp}.tilt`, 'must be a head pitch from -1 (all the way down) to 1 (all the way up); 0.35 is a look about 16° up, "sky"\'s default');
          }
          if (d === 'turn' && !(faceOK(b.face) || b.face === 'around')) P(`${bp}.face`, 'must be "left", "right" or "around"');
          if ((d === 'emote' || b.expr !== undefined) && R) {
            if (d === 'emote' && !isStr(b.expr)) P(`${bp}.expr`, 'an expression name is required');
            else if (b.expr !== undefined && !(R.expressions || []).includes(b.expr)) P(`${bp}.expr`, `rig "${R.kind}" has no expression "${b.expr}" (expressions: ${(R.expressions || []).join(', ')})`);
          }
          if (d === 'place') { const at = b.to ?? (typeof b.at === 'string' ? b.at : undefined); if (at === undefined) P(`${bp}.to`, 'where to place the actor is required'); else checkTarget(at, `${bp}.${b.to !== undefined ? 'to' : 'at'}`, { anchors, cast, S, P, allowSide: false, self: b.who, ride }); }
          // riding state after this beat
          if (b.who !== undefined && (d === 'hop' || d === 'place' || d === 'fly')) { const T = parseTarget(b.to ?? b.at); if (T.kind === 'on' && d !== 'fly' && cast[T.who] && T.who !== b.who) riding.set(b.who, T.who); else riding.delete(b.who); }
          if (d === 'fade' && !(isNum(b.to) && b.to >= 0 && b.to <= 1)) P(`${bp}.to`, 'must be an opacity 0..1');
          if (d === 'set' && b.params !== undefined && !isObj(b.params)) P(`${bp}.params`, 'must be an object');
          if (b.face !== undefined && d !== 'turn' && !faceOK(b.face)) P(`${bp}.face`, 'must be "left" or "right"');
        }
      });
    });
  });
  return { problems, warnings };
}

function checkExtras(o, p, P) {
  if (o.motif !== undefined && !(Number.isInteger(o.motif) && o.motif >= 1)) P(`${p}.motif`, 'must be how many notes of the score motif to state (an integer ≥ 1)');
  if (o.motifVoice !== undefined && !motifVoices().includes(o.motifVoice)) P(`${p}.motifVoice`, `must be one of ${motifVoices().join(', ')} (got ${JSON.stringify(o.motifVoice)})`);
  for (const k of ['hold', 'downbeat']) if (o[k] !== undefined && typeof o[k] !== 'boolean') P(`${p}.${k}`, 'must be true or false');
  if (o.tempo !== undefined && !(isNum(o.tempo) && o.tempo >= 20 && o.tempo <= 300)) P(`${p}.tempo`, 'must be beats per minute (20..300)');
}
function checkMusic(m, p, P, sceneLevel, beat = {}) {
  const MOODS = moodNames(), STINGS = stingNames();
  if (m === undefined) {
    if (sceneLevel) return;
    const mood = beat.mood, sting = beat.sting ?? (beat.music === 'sting' ? beat.name : undefined);
    if (sting !== undefined) { if (!STINGS.includes(sting)) P(p, `unknown sting "${sting}" (one of ${STINGS.join(', ')})`); return; }
    if (mood === undefined) { P(p, 'a music beat needs a mood, "none", or a sting'); return; }
    if (!MOODS.includes(mood)) P(p, `unknown mood "${mood}" (one of ${MOODS.join(', ')})`);
    checkExtras(beat, p.replace(/\.music$/, ''), P);
    return;
  }
  if (m === 'none' || m === null) return;
  if (typeof m === 'string') {
    if (!MOODS.includes(m)) P(p, `unknown mood "${m}" (one of ${MOODS.join(', ')}, or "none")`);
    else if (!sceneLevel) checkExtras(beat, p.replace(/\.music$/, ''), P);
    return;
  }
  if (!isObj(m)) { P(p, 'must be { mood, intensity }, a mood name or "none"'); return; }
  if (m.sting !== undefined) { if (!STINGS.includes(m.sting)) P(`${p}.sting`, `unknown sting "${m.sting}" (one of ${STINGS.join(', ')})`); return; }
  if (!MOODS.includes(m.mood)) P(`${p}.mood`, `unknown mood ${JSON.stringify(m.mood)} (one of ${MOODS.join(', ')})`);
  if (m.intensity !== undefined && !(isNum(m.intensity) && m.intensity >= 0 && m.intensity <= 1)) P(`${p}.intensity`, 'must be a number 0..1');
  checkExtras(m, p, P);
  if (!sceneLevel) checkExtras(beat, p.replace(/\.music$/, ''), P);   // extras may also sit on the beat itself
}

function checkTarget(v, p, { anchors, cast, S, P, allowSide, actorsOK = false, self, ride = null }) {
  const T = parseTarget(v);
  if (T.kind === 'bad') { P(p, `not a place: ${JSON.stringify(v)} (use an anchor name, "x:1500", "x:1500,y:1060", "near:<actor>", "left-of:<actor>", "right-of:<actor>" or, for hop / place, "on:<actor>")`); return; }
  if (T.kind === 'on') {
    if (!ride?.allowOn) { P(p, `"${v}" (riding) is only valid as the target of a hop or a place`); return; }
    if (!cast[T.who]) P(p, `"${T.who}" is not in the cast`);
    else if (T.who === self) P(p, 'an actor cannot ride itself');
    else if (!ride.present.has(T.who)) P(p, `"${T.who}" is not in this scene`);
    else if (ride.riding.has(T.who)) P(p, `"${T.who}" is itself riding "${ride.riding.get(T.who)}"; riders cannot carry riders`);
    else { const r = [...ride.riding].find(([, c]) => c === self); if (r) P(p, `"${self}" is carrying "${r[0]}"; carriers cannot ride`); }
    return;
  }
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
