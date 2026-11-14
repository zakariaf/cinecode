// check: misspelt and unsupported fields are warnings (with a "did you mean"), camera subjects and relative targets are
// checked against who is in the scene, a perch is an error for a rig that can neither perch nor fly, a beat can't start
// "with" itself, and messages name a place in a shot by ids (the index path stays in `path`).
//   node --test test/validate-keys.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm, ValidationError } from '../engine/film/load.mjs';

const check = async film => { try { return { problems: [], warnings: (await loadFilm(film)).warnings }; } catch (e) { if (!(e instanceof ValidationError)) throw e; return { problems: e.problems, warnings: e.warnings }; } };
const at = (list, path) => list.filter(p => p.path === path).map(p => p.message).join(' | ');
const where = (list, path) => list.find(p => p.path === path)?.where;
const base = (scenes, extra = {}) => ({
  title: 'Check', format: { width: 640, height: 360, fps: 24, captions: 'all' },
  voices: { narrator: { voice: 'Sulafat' }, hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' }, pip: { voice: 'Leda' }, fox: { voice: 'Algieba' } },
  cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' }, fox: { rig: 'fox', voice: 'fox' }, pip: { rig: 'human', voice: 'pip', params: { age: 'child' } }, owl: { rig: 'owl' } },
  sets: { meadow: { kit: 'meadow' } }, scenes, ...extra,
});

test('the shipped films, the 3D test film and the template get no warning and no problem', async () => {
  for (const f of ['_test', 'glim', 'kite', 'seventy-six-summers', 'solar-system', 'storm-shelter', 'strawberry-race', '_test3d']) {
    const r = await check(`films/${f}`);
    assert.deepEqual([...r.problems, ...r.warnings].map(p => p.message), [], f);
  }
  const r = await check('templates');
  assert.deepEqual([...r.problems, ...r.warnings].map(p => p.message), []);
});

test('a misspelt or unsupported field at any level is a warning, with the field it likely misspells', async () => {
  const film = base([{ id: 's1', set: 'meadow', musc: 'pastoral', actors: { hare: { at: 'meadow_centre', facing: 'left', pos: 'sit' } },
    shots: [{ id: 'a', camera: { sise: 'close', on: ['hare'], mov: 'pan' }, hlod: 3, note: 'free text', comment: 'free text',
      beats: [{ say: 'hare', text: 'Hello there.', dur: 4 }, { do: 'walk', who: 'hare', to: 'x:1700', dur: 6 }, { do: 'walk', who: 'hare', to: 'x:1500', run: true },
        { music: 'tension', key: 'C' }, { do: 'pose', who: 'hare', pose: 'sit', dur: 1, expr: 'happy' }, { do: 'gesture', who: 'hare', name: 'wave', to: 'tortoise' },
        { do: 'look', who: 'hare', to: 'left', tilt: 0.2 }, { do: 'turn', who: 'hare', face: 'right', speed: 2 }] }] }],
  { titels: {}, titles: { open: { title: 'T', sub: 'x' }, end: { lines: ['The End'], title: 'x' } }, format: { width: 640, height: 360, fps: 24, caption: 'all' }, seed: 3, slug: 'x', logline: 'x', note: 'x' });
  film.cast.hare.colour = 'red'; film.sets.meadow.parms = { seed: 2 }; film.voices.hare.tones = 'x';
  const { problems, warnings: w } = await check(film);
  assert.deepEqual(problems, []);
  const expect = {
    titels: 'unknown field "titels" at the top level; ignored (did you mean "titles"?)',
    'format.caption': 'unknown field "caption" in format; ignored (did you mean "captions"?)',
    'titles.open.sub': 'unknown field "sub" on the opening card; ignored (did you mean "subtitle"?)',
    'titles.end.title': 'unknown field "title" on the end card; ignored',
    'voices.hare.tones': 'unknown field "tones" on a voice; ignored (did you mean "tone"?)',
    'cast.hare.colour': 'unknown field "colour" on a cast member; ignored',
    'sets.meadow.parms': 'unknown field "parms" on a set; ignored (did you mean "params"?)',
    'scenes[0].musc': 'unknown field "musc" on a scene; ignored (did you mean "music"?)',
    'scenes[0].actors.hare.facing': 'unknown field "facing" on a scene actor; ignored (did you mean "face"?)',
    'scenes[0].actors.hare.pos': 'unknown field "pos" on a scene actor; ignored (did you mean "pose"?)',
    'scenes[0].shots[0].hlod': 'unknown field "hlod" on a shot; ignored (did you mean "hold"?)',
    'scenes[0].shots[0].camera.sise': 'unknown field "sise" on a camera; ignored (did you mean "size"?)',
    'scenes[0].shots[0].camera.mov': 'unknown field "mov" on a camera; ignored (did you mean "move"?)',
    'scenes[0].shots[0].beats[0].dur': 'unknown field "dur" for a say beat; ignored',
    'scenes[0].shots[0].beats[1].dur': 'unknown field "dur" for a "walk" beat; ignored',
    'scenes[0].shots[0].beats[2].run': 'unknown field "run" for a "walk" beat; ignored',
    'scenes[0].shots[0].beats[3].key': 'unknown field "key" for a music beat; ignored',
    'scenes[0].shots[0].beats[7].speed': 'unknown field "speed" for a "turn" beat; ignored',
  };
  for (const [path, m] of Object.entries(expect)) assert.ok(at(w, path).startsWith(`${path}: ${m}`), `${path}: ${at(w, path) || 'no warning'}`);
  assert.deepEqual(w.map(x => x.path).sort(), Object.keys(expect).sort(), 'nothing else (notes, comments, seed, slug, logline; a pose\'s dur and expr, a gesture\'s to, a look\'s tilt)');
});

test('a 3D film takes the camera\'s "area" and "turn" and a set\'s "area"; a 2D film does not', async () => {
  const film = engine => ({ title: 'Home', format: { width: 640, height: 360, fps: 24, ...(engine ? { engine } : {}) },
    cast: { milo: { rig: engine ? 'girl' : 'human' } }, sets: { home: { kit: engine ? 'home' : 'village', area: 'inside' } },
    scenes: [{ id: 's1', set: 'home', actors: { milo: { at: engine ? 'centre' : 'x:1500' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['milo'], area: 'inside', turn: 20 }, beats: [{ wait: 1 }] }] }] });
  const three = await check(film('3d'));
  assert.deepEqual([...three.problems, ...three.warnings].map(p => p.message), []);
  const flat = await check(film(null));
  assert.deepEqual(flat.warnings.map(p => p.path).sort(), ['scenes[0].shots[0].camera.area', 'scenes[0].shots[0].camera.turn', 'sets.home.area']);
});

test('a camera subject not in the scene during the shot is a warning; one that enters in it is not', async () => {
  const film = base([{ id: 's1', set: 'meadow', actors: { hare: { at: 'meadow_centre' }, fox: { offstage: 'left' } },
    shots: [{ id: 'a', camera: { size: 'close', on: ['fox'] }, beats: [{ say: 'hare', text: 'Where is everybody today?' }] },
      { id: 'b', camera: { size: 'medium', on: ['tortoise'] }, beats: [{ say: 'hare', text: 'Nobody here.' }] },
      { id: 'c', camera: { size: 'medium', on: ['hare', 'fox'] }, beats: [{ wait: 1 }, { do: 'enter', who: 'fox', from: 'left', to: 'x:1300' }] },
      { id: 'd', camera: { size: 'full', on: ['fox'] }, beats: [{ do: 'exit', who: 'fox', to: 'left' }] },
      { id: 'e', camera: { size: 'full', on: 'hare', move: 'push-in', toOn: ['fox'] }, beats: [{ wait: 1 }] }] }]);
  const { problems, warnings: w } = await check(film);
  assert.deepEqual(problems, []);
  assert.match(at(w, 'scenes[0].shots[0].camera.on[0]'), /^scenes\[0\]\.shots\[0\]\.camera\.on\[0\]: "fox" is not in scene s1 during this shot .*the camera cannot frame it/);
  assert.equal(where(w, 'scenes[0].shots[0].camera.on[0]'), 'scene s1 › shot a');
  assert.match(at(w, 'scenes[0].shots[1].camera.on[0]'), /"tortoise" is not in scene s1 during this shot/);
  assert.match(at(w, 'scenes[0].shots[4].camera.toOn[0]'), /"fox" is not in scene s1 during this shot/);
  assert.deepEqual(w.map(x => x.path), ['scenes[0].shots[0].camera.on[0]', 'scenes[0].shots[1].camera.on[0]', 'scenes[0].shots[4].camera.toOn[0]'], 'it enters in c, and leaves in d');
});

test('near: and other relative places, and where an fx or sfx is, name an actor in the scene at that beat', async () => {
  const film = base([{ id: 's1', set: 'meadow', actors: { hare: { at: 'x:1500' }, pip: { at: 'x:900' }, fox: { offstage: 'right' } },
    shots: [{ id: 'a', beats: [{ do: 'walk', who: 'hare', to: 'near:fox' }, { do: 'exit', who: 'pip', to: 'left' }, { do: 'walk', who: 'hare', to: 'left-of:pip' },
      { fx: 'sparkle', on: 'owl' }, { sfx: 'chime', at: 'nowhere_at_all' }, { sfx: 'chime', on: 'pip' }, { sfx: 'chime', who: 'hare' }, { sfx: 'chime', at: 'stump_front' },
      { sfx: 'chime', who: 'fox' }, { sfx: 'chime', on: 'tortoise' },
      { do: 'enter', who: 'fox', from: 'right', to: 'near:hare' }, { fx: 'dust', on: 'fox' }, { do: 'walk', who: 'hare', to: 'right-of:fox' }] }] }]);
  const { problems: ps, warnings: w } = await check(film);
  const B = 'scenes[0].shots[0].beats';
  assert.match(at(ps, `${B}[0].to`), /^scenes\[0\]\.shots\[0\]\.beats\[0\]\.to: "fox" is not in this scene here/);
  assert.equal(where(ps, `${B}[0].to`), 'scene s1 › shot a › beat 1 (do: walk hare)');
  assert.match(at(ps, `${B}[2].to`), /"pip" is not in this scene here \(not on stage, or it has left\)/);
  assert.match(at(ps, `${B}[3].on`), /"owl" is not in this scene here/);
  assert.match(at(ps, `${B}[4].at`), /set "meadow" has no anchor "nowhere_at_all"/);
  assert.deepEqual(ps.map(p => p.path), [`${B}[0].to`, `${B}[2].to`, `${B}[3].on`, `${B}[4].at`], 'an actor in the scene, an anchor, and one brought in, are fine; a sound may come from one gone (pip) or waiting offstage (fox): it pans to that side');
  // a sound from a cast member the scene never placed: a warning (it plays at its pan)
  assert.match(at(w, `${B}[9].on`), /^scenes\[0\]\.shots\[0\]\.beats\[9\]\.on: "tortoise" is not in scene s1 here \(not one of its actors, and nothing has brought it in\), so nothing places the sound/);
  assert.deepEqual(w.map(p => p.path), [`${B}[9].on`]);
});

test('a perch is an error for a rig that can neither perch nor fly; a beat cannot start "with" itself', async () => {
  const film = base([{ id: 's1', set: 'meadow', actors: { hare: { at: 'low_branch' }, owl: { at: 'branch_tip' }, pip: { at: 'x:900' } },
    shots: [{ id: 'a', beats: [{ do: 'hop', who: 'hare', to: 'meadow_centre' }, { do: 'walk', who: 'pip', to: 'branch_tip' }, { do: 'fly', who: 'owl', to: 'low_branch' },
      { do: 'gesture', who: 'hare', name: 'wave', id: 'g' }, { id: 'x', with: 'x', do: 'look', who: 'hare', to: 'left' }, { do: 'look', who: 'pip', to: 'hare', with: 'g' }] }] }]);
  const { problems: ps } = await check(film);
  assert.match(at(ps, 'scenes[0].actors.hare.at'), /^scenes\[0\]\.actors\.hare\.at: "low_branch" is a perch, and rig "hare" can neither perch nor fly/);
  assert.match(at(ps, 'scenes[0].shots[0].beats[1].to'), /^scenes\[0\]\.shots\[0\]\.beats\[1\]\.to: "branch_tip" is a perch, and rig "human" can neither perch nor fly/);
  assert.equal(where(ps, 'scenes[0].shots[0].beats[1].to'), 'scene s1 › shot a › beat 2 (do: walk pip)');
  assert.match(at(ps, 'scenes[0].shots[0].beats[4].with'), /^scenes\[0\]\.shots\[0\]\.beats\[4\]\.with: must be "prev" or the id of an earlier beat in this shot \(got "x"\)$/);
  assert.equal(where(ps, 'scenes[0].shots[0].beats[4].with'), 'scene s1 › shot a › beat 5 (do: look hare)');
  assert.deepEqual(ps.map(p => p.path), ['scenes[0].actors.hare.at', 'scenes[0].shots[0].beats[1].to', 'scenes[0].shots[0].beats[4].with'], 'the owl perches; with an earlier beat\'s id is fine');
});

test('a problem or warning in a shot names where it is by ids ("where"); its message still starts with its path', async () => {
  const film = base([{ id: 'meet', set: 'meadow', actors: { hare: { at: 'x:1500' } },
    shots: [{ id: '1.1', beats: [{ wait: 1 }] }, { camera: { size: 'mid' }, beats: [{ say: 'narrator', text: 'Hi.' }, { title: 'A long title here' }, { do: 'walk', who: 'pip', to: 'x:1000' }, { wait: -1 }] }] }]);
  const { problems: ps } = await check(film);
  const one = path => ps.find(p => p.path === path);
  assert.deepEqual(one('scenes[0].shots[1].id'), { path: 'scenes[0].shots[1].id', message: 'scenes[0].shots[1].id: a shot id is required', where: 'scene meet › shot shots[1]' });
  assert.equal(one('scenes[0].shots[1].camera.size').where, 'scene meet › shot shots[1]');
  assert.equal(one('scenes[0].shots[1].beats[2].who').where, 'scene meet › shot shots[1] › beat 3 (do: walk pip)');
  assert.equal(one('scenes[0].shots[1].beats[3].wait').where, 'scene meet › shot shots[1] › beat 4 (wait: -1)');
  for (const p of ps) assert.ok(p.message.startsWith(`${p.path}: `), p.message);
  const titled = await check(base([{ id: 'meet', set: 'meadow', shots: [{ id: '1.1', beats: [{ title: 'Hello', place: 'nowhere' }] }] }], { sets: { meadow: { kit: 'nope' } } }));
  assert.equal(titled.problems.find(p => p.path === 'sets.meadow.kit').where, undefined, 'outside a shot: the path says it');
  assert.equal(titled.problems.find(p => p.path === 'scenes[0].shots[0].beats[0].place').where, 'scene meet › shot 1.1 › beat 1 (title)');
});
