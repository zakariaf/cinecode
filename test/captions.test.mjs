// Burned-in captions over time: a caption chunk keeps one band (bottom or top) for as long as it is up, even when a
// head moves into its band mid-line; one caption per band (a newer caption replaces the one up there instead of
// stacking above it); lines come first (a line is placed by the picture alone and a sound caption never takes a line
// off while it is spoken: the sound goes to the other band, or waits for one); a caption carries over a cut only while
// what it captions is still heard (its line spoken, a sound for its dur) or until it has been up long enough to read,
// and fades out by a dissolve instead of popping off.
//   node --test test/captions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { frameInfo, captionLayouts } from '../engine/film/frame.mjs';
import { layoutCaption } from '../engine/film/text.mjs';

const FPS = 24;
const frames = (t0, t1) => { const out = []; for (let k = Math.ceil(t0 * FPS); k / FPS < t1; k++) out.push(k / FPS); return out; };
const shown = (plan, t, text) => frameInfo(plan, t).captions.filter(c => c.text === text);

// A night forest: Tilly speaks while Glim flies down past the bottom of the frame, through the bottom caption band.
function bandFilm() {
  return {
    title: 'Band', format: { width: 1920, height: 1080, fps: FPS, captions: 'dialogue' },
    voices: { tilly: { voice: 'Leda' }, glim: { voice: 'Puck' } },
    cast: { tilly: { rig: 'mouse', voice: 'tilly', scale: 1.15 }, glim: { rig: 'butterfly', voice: 'glim', scale: 0.6 } },
    sets: { f: { kit: 'forest' } },
    scenes: [{
      id: 's1', set: 'f', time: 'night',
      actors: { tilly: { at: 'x:1820', face: 'left' }, glim: { at: 'x:1760' } },
      shots: [{ id: 'a', camera: { size: 'full', on: ['tilly'] }, hold: 0.8, beats: [
        { do: 'fly', who: 'glim', to: 'x:1830,y:1100' },
        { say: 'tilly', text: 'The dark has lights in it.', with: 'prev', after: 0.6 },
      ] }],
    }],
  };
}

test('a caption keeps its band for the whole chunk while a head passes through the bottom band', async () => {
  const plan = compile(await loadFilm(bandFilm())), cap = plan.captions.find(c => c.text === 'The dark has lights in it.');
  assert.ok(cap?.burn, 'the line is captioned');
  const ts = frames(cap.t0, cap.t1), tops = new Set();
  // the scene exercises the problem: judged frame by frame, Glim's head in the bottom band would send the line up and
  // back down again
  const instant = new Set(ts.map(t => layoutCaption(cap, plan.W, plan.H, frameInfo(plan, t).actors.map(a => ({ box: a.headBox, w: a.id === 'tilly' ? 1 : 1 / 3 }))).top));
  assert.equal(instant.size, 2, 'Glim never reaches the bottom band: the scene no longer tests a band switch');
  for (const t of ts) {
    const c = shown(plan, t, cap.text);
    assert.equal(c.length, 1, `${t.toFixed(3)}: the line is up`);
    tops.add(c[0].top);
  }
  assert.equal(tops.size, 1, `the caption switches band mid-line (${[...tops].join(' / ')})`);
});

// A meadow: a bell rings (a sound caption, 1.2 s) and Hare speaks 0.5 s later; a cut 0.1 s after Hare's line ends
// (inside the caption's 0.25 s tail; Tortoise answers 0.6 s into the next shot) and his long line runs across the next cut into a shot of Hare; a bell rung
// just before a cut; a long bell (dur 2 s) rung just before another; a bell rung as Hare speaks again.
function cutFilm() {
  return {
    title: 'Cuts', format: { width: 1920, height: 1080, fps: FPS, captions: 'all' },
    voices: { hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' } },
    cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' } },
    sets: { m: { kit: 'meadow' } },
    scenes: [{
      id: 's1', set: 'm', time: 'morning',
      actors: { hare: { at: 'x:1000' }, tortoise: { at: 'x:1300', face: 'left' } },
      shots: [
        { id: 'a', camera: { size: 'medium', on: ['hare', 'tortoise'] }, hold: 0.1, beats: [
          { sfx: 'chime', caption: '[a bell]' },
          { say: 'hare', text: 'Who rang that?', after: 0.5 },
        ] },
        { id: 'b', dur: 1.6, camera: { size: 'close', on: ['tortoise'] }, beats: [{ say: 'tortoise', text: 'Nobody rang anything, my friend. Nobody at all.', at: 0.6 }] },
        { id: 'c', dur: 3, camera: { size: 'close', on: ['hare'] }, beats: [{ wait: 1 }] },
        { id: 'd', dur: 0.8, camera: { size: 'wide', on: ['hare', 'tortoise'] }, beats: [{ sfx: 'chime', at: 0.1, caption: '[ding]' }] },
        { id: 'e', dur: 0.8, camera: { size: 'full', on: ['tortoise'] }, beats: [{ sfx: 'chime', at: 0.2, caption: '[a long bell]', params: { dur: 2 } }] },
        { id: 'f', camera: { size: 'full', on: ['hare'] }, beats: [{ wait: 2 }, { say: 'hare', text: 'There it is again!' }, { sfx: 'chime', caption: '[ding ding]', with: 'prev' }] },
      ],
    }],
  };
}

test('one caption per band: a new caption replaces the one up there instead of stacking', async () => {
  const plan = compile(await loadFilm(cutFilm()));
  const bell = plan.captions.find(c => c.text === '[a bell]'), line = plan.captions.find(c => c.text === 'Who rang that?');
  assert.ok(bell.burn && line.burn && line.t0 < bell.t1, 'the line starts while the sound caption is still up');
  for (const t of frames(0, plan.duration)) {
    const caps = frameInfo(plan, t).captions;
    for (const band of [true, false]) {
      const here = caps.filter(c => c.top === band);
      assert.ok(here.length <= 1, `${t.toFixed(3)}: ${here.map(c => `"${c.text}"`).join(' and ')} on screen at once in the ${band ? 'top' : 'bottom'} band`);
    }
  }
  // the line is up from its first frame on, alone in its band
  for (const t of frames(line.t0, line.t0 + 0.5)) assert.equal(shown(plan, t, line.text).length, 1, `${t.toFixed(3)}: the line is up`);
  // a line and a sound caption that start together both stay up, one in each band (neither is dropped)
  const again = plan.captions.find(c => c.text === 'There it is again!'), ding = plan.captions.find(c => c.text === '[ding ding]');
  assert.ok(Math.abs(again.t0 - ding.t0) < 1e-6, 'they start together');
  for (const t of frames(ding.t0 + 0.2, ding.t1 - 0.2)) {
    const [a] = shown(plan, t, again.text), [d] = shown(plan, t, ding.text);
    assert.ok(a && d && a.top !== d.top, `${t.toFixed(3)}: the line and the sound caption are both up, in different bands`);
  }
});

test('a caption crosses a cut only while its line (or its sound) is still heard', async () => {
  const plan = compile(await loadFilm(cutFilm())), shot = id => plan.shots.find(s => s.id === id);
  const line = id => plan.lines.find(l => l.id === plan.captions.find(c => c.text === id).line);
  // Hare's line has ended when the shot cuts to Tortoise: its caption leaves with the cut
  const who = line('Who rang that?'), b = shot('b');
  assert.ok(who.t1 <= b.t0 && plan.captions.find(c => c.text === who.text).t1 > b.t0, 'the caption tail runs past the cut');
  for (const t of frames(b.t0, b.t0 + 0.4)) assert.equal(shown(plan, t, who.text).length, 0, `${t.toFixed(3)}: "${who.text}" carried onto shot b`);
  assert.equal(shown(plan, b.t0 - 1 / FPS, who.text).length, 1, 'up until the cut');
  // Tortoise is still speaking at the cut to Hare: the caption stays
  const nob = line('Nobody rang anything, my friend. Nobody at all.'), c = shot('c');
  assert.ok(nob.t1 > c.t0 + 0.3, 'the line runs across the cut');
  for (const t of frames(c.t0, Math.min(nob.t1, c.t0 + 1))) assert.equal(shown(plan, t, nob.text).length, 1, `${t.toFixed(3)}: the spoken line's caption is up`);
  // a short sound before a cut: its caption leaves with the cut; a long sound (dur) keeps it
  const e = shot('e'), f = shot('f');
  for (const t of frames(e.t0, e.t0 + 0.4)) assert.equal(shown(plan, t, '[ding]').length, 0, `${t.toFixed(3)}: "[ding]" carried onto shot e`);
  for (const t of frames(f.t0, f.t0 + 0.4)) assert.equal(shown(plan, t, '[a long bell]').length, 1, `${t.toFixed(3)}: "[a long bell]" (still ringing) left at the cut`);
});

// A meadow (captions: all): Hare speaks one long line, and a bell is rung 1 s into it.
const meadowFilm = (title, shots, scenes = []) => ({
  title, format: { width: 1920, height: 1080, fps: FPS, captions: 'all' },
  voices: { hare: { voice: 'Puck' }, tortoise: { voice: 'Algenib' } },
  cast: { hare: { rig: 'hare', voice: 'hare' }, tortoise: { rig: 'tortoise', voice: 'tortoise' } },
  sets: { m: { kit: 'meadow' }, f: { kit: 'forest' } },
  scenes: [{ id: 's1', set: 'm', time: 'morning', actors: { hare: { at: 'x:1000' }, tortoise: { at: 'x:1300', face: 'left' } }, shots }, ...scenes],
});
const LONG = 'I could run to the pond and back before you even reach that old gate.';

test('a sound caption during a line never takes the line off: it goes to the other band', async () => {
  const plan = compile(await loadFilm(meadowFilm('Midline', [{ id: 'a', camera: { size: 'medium', on: ['hare', 'tortoise'] }, hold: 0.3, beats: [
    { say: 'hare', text: LONG },
    { sfx: 'chime', caption: '[a bell rings]', with: 'prev', after: 1 },
    { wait: 1.5 },
  ] }])));
  const line = plan.lines.find(l => l.text === LONG), bell = plan.captions.find(c => c.text === '[a bell rings]');
  assert.ok(bell.burn && bell.t0 > line.t0 + 0.5 && bell.t1 < line.t1 - 1, 'the bell rings in the middle of the line');
  for (const t of frames(line.t0, line.t1)) assert.equal(shown(plan, t, LONG).length, 1, `${t.toFixed(3)}: Hare is still speaking but his line is not captioned`);
  for (const t of frames(bell.t0 + 0.05, bell.t1 - 0.05)) {
    const [a] = shown(plan, t, LONG), [b] = shown(plan, t, bell.text);
    assert.ok(a && b && a.top !== b.top, `${t.toFixed(3)}: the line and the bell are both up, in different bands`);
  }
});

// A close shot of Hare: a bell, and Hare's line starts 0.25 s later (or the same line with no bell).
const quickFilm = bell => meadowFilm('Quick', [{ id: 'a', camera: { size: 'close', on: ['hare'] }, hold: 1, beats: [
  ...(bell ? [{ sfx: 'chime', caption: '[a bell rings]' }] : []),
  { say: 'hare', text: 'Who is ringing that bell at this hour of the morning?', at: 0.25 },
] }]);

test('a line is placed by the picture alone: a sound caption just before it never pushes it to the other band', async () => {
  const plan = compile(await loadFilm(quickFilm(true))), alone = compile(await loadFilm(quickFilm(false)));
  const text = 'Who is ringing that bell at this hour of the morning?', line = plan.captions.find(c => c.text === text);
  const bell = plan.captions.find(c => c.text === '[a bell rings]');
  assert.ok(line.t0 - bell.t0 < 0.3, 'the line starts right after the bell');
  for (const t of frames(line.t0, line.t1)) {
    const [a] = shown(plan, t, text), [b] = shown(alone, t, text);
    assert.ok(a && b, `${t.toFixed(3)}: the line is up`);
    assert.equal(a.top, b.top, `${t.toFixed(3)}: the bell moved the line to the ${a.top ? 'top' : 'bottom'}`);
  }
  // the bell is read whole (in the other band) instead of flashing up for 0.25 s
  for (const t of frames(bell.t0 + 0.05, bell.t1 - 0.05)) assert.equal(shown(plan, t, bell.text).length, 1, `${t.toFixed(3)}: the bell's caption is gone`);
});

test('a caption shown just before a cut stays up long enough to read; it fades out at a dissolve, cuts at a cut', async () => {
  // a bell struck 0.15 s before a cut
  const flash = compile(await loadFilm(meadowFilm('Flash', [
    { id: 'a', dur: 2, camera: { size: 'medium', on: ['hare', 'tortoise'] }, beats: [{ wait: 1.85 }, { sfx: 'chime', caption: '[a bell rings]' }] },
    { id: 'b', dur: 2.5, camera: { size: 'close', on: ['tortoise'] }, beats: [{ wait: 2.5 }] },
  ])));
  const bell = flash.captions.find(c => c.text === '[a bell rings]');
  for (const t of frames(bell.t0 + 0.05, bell.t0 + 0.55)) assert.equal(shown(flash, t, bell.text).length, 1, `${t.toFixed(3)}: the bell's caption is gone ${(t - bell.t0).toFixed(2)} s after it came up`);
  assert.ok(captionLayouts(flash, bell.t0 + 0.3).some(c => c.c === bell && c.alpha === 1), 'it is shown at full strength');
  // a line that has ended when the scene dissolves into the next: its caption fades out by the dissolve, not popping off
  const diss = compile(await loadFilm(meadowFilm('Dissolve', [{ id: 'a', camera: { size: 'medium', on: ['hare', 'tortoise'] }, hold: 0.1, beats: [{ say: 'hare', text: 'Hello there, old friend.' }] }],
    [{ id: 's2', set: 'f', time: 'sunset', transition: 'dissolve', actors: { hare: { at: 'x:1000' } }, shots: [{ id: 'b', camera: { size: 'full', on: ['hare'] }, beats: [{ wait: 2 }] }] }])));
  const cap = diss.captions.find(c => c.text === 'Hello there, old friend.'), x = diss.shots.find(s => s.id === 'b').t0;
  assert.ok(cap.t0 < x - 1 && cap.t1 > x, 'the caption runs into the dissolve');
  const alpha = (plan, c, t) => captionLayouts(plan, t).find(e => e.c === c)?.alpha ?? 0;
  assert.equal(alpha(diss, cap, x - 0.3), 1, 'up before the dissolve');
  assert.ok(alpha(diss, cap, x - 1 / FPS) < 0.5, `still at ${alpha(diss, cap, x - 1 / FPS).toFixed(2)} on the last frame before the dissolve (it pops off)`);
  // at a hard cut it stays at full strength up to the cut
  const plan = compile(await loadFilm(cutFilm())), who = plan.captions.find(c => c.text === 'Who rang that?'), b = plan.shots.find(s => s.id === 'b').t0;
  assert.equal(alpha(plan, who, b - 1 / FPS), 1, 'faded before a hard cut');
});

test('a line said twice: the second time its caption crosses a cut while it is spoken', async () => {
  const say = 'Wait for me, please, wait for me!';
  const plan = compile(await loadFilm(meadowFilm('Twice', [
    { id: 'a', camera: { size: 'medium', on: ['hare', 'tortoise'] }, hold: 0.5, beats: [{ say: 'hare', text: say }] },
    { id: 'b', dur: 2, camera: { size: 'close', on: ['hare'] }, beats: [{ say: 'hare', text: say, at: 1.2 }] },
    { id: 'c', dur: 3, camera: { size: 'close', on: ['tortoise'] }, beats: [{ wait: 3 }] },
  ])));
  const [, second] = plan.lines.filter(l => l.text === say), c = plan.shots.find(s => s.id === 'c').t0;
  assert.ok(second && second.t0 < c - 0.7 && second.t1 > c + 0.5, 'the second line runs across the cut');
  for (const t of frames(c, second.t1)) assert.equal(shown(plan, t, say).length, 1, `${t.toFixed(3)}: the line is still spoken but its caption left at the cut`);
});

test('when both bands are held, a sound caption waits for one and is still up long enough to read', async () => {
  // a dog barks, thunder and a bell, all within a second of each other, during one long line of Hare's
  const plan = compile(await loadFilm(meadowFilm('Busy', [{ id: 'a', camera: { size: 'medium', on: ['hare', 'tortoise'] }, hold: 1, beats: [
    { say: 'hare', text: LONG },
    { sfx: 'chime', caption: '[a bell rings]', with: 'prev', after: 1 },
    { sfx: 'chime', caption: '[a dog barks]', with: 'prev', after: 0.2 },
    { sfx: 'chime', caption: '[thunder]', with: 'prev', after: 0.3 },
  ] }])));
  const line = plan.lines.find(l => l.text === LONG), up = new Map();
  for (const t of frames(0, plan.duration)) {
    const caps = frameInfo(plan, t).captions;
    for (const band of [true, false]) assert.ok(caps.filter(c => c.top === band).length <= 1, `${t.toFixed(3)}: two captions in the ${band ? 'top' : 'bottom'} band`);
    if (t >= line.t0 && t < line.t1) assert.ok(caps.some(c => c.text === LONG), `${t.toFixed(3)}: Hare's line is not captioned`);
    for (const c of caps) up.set(c.text, (up.get(c.text) || 0) + 1 / FPS);
  }
  for (const s of ['[a dog barks]', '[thunder]', '[a bell rings]']) assert.ok((up.get(s) || 0) >= 0.55, `"${s}" is up only ${(up.get(s) || 0).toFixed(2)} s`);
});
