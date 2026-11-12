// Line art (format.style "lineart", engine/paint/lineart.mjs): the page is black ink on white with no colour or grey
// fill; a figure's own white hides the set's lines behind it; the converter keeps an inked mark and drops a speck.
//   node --test test/lineart.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { loadFilm } from '../engine/film/load.mjs';
import { compile } from '../engine/film/compile.mjs';
import { drawFrame, frameInfo } from '../engine/film/frame.mjs';
import { lineart } from '../engine/paint/lineart.mjs';

const W = 480, H = 270;
const film = style => ({
  title: 'Lines', format: { width: W, height: H, fps: 24, captions: 'none', ...(style ? { style } : {}) },
  voices: { hare: { voice: 'Puck' } }, cast: { hare: { rig: 'hare', voice: 'hare' } },
  sets: { m: { kit: 'meadow' } },
  scenes: [{ id: 's1', set: 'm', time: 'golden', actors: { hare: { at: 'x:1500' } }, shots: [{ id: 'a', camera: { size: 'full', on: ['hare'] }, dur: 3 }] }],
});
const pixels = (plan, t) => { const c = createCanvas(W, H), x = c.getContext('2d'); drawFrame(x, plan, t); return x.getImageData(0, 0, W, H).data; };

test('format.style must be painted or lineart', async () => {
  await assert.rejects(loadFilm(film('sketch')), /format\.style/);
  assert.equal(compile(await loadFilm(film())).style, 'painted');
  assert.equal(compile(await loadFilm(film('lineart'))).style, 'lineart');
});

test('a line-art frame is grey only (no colour), mostly white paper, with ink on it', async () => {
  const d = pixels(compile(await loadFilm(film('lineart'))), 1.5);
  let colour = 0, white = 0, ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.max(Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2])) > 2) colour++;
    if (d[i] > 240) white++; else if (d[i] < 60) ink++;
  }
  const n = W * H;
  assert.equal(colour, 0, 'no coloured pixel');
  assert.ok(white > 0.6 * n, `mostly paper (${(100 * white / n).toFixed(0)}% white)`);
  assert.ok(ink > 0.01 * n, `with lines on it (${(100 * ink / n).toFixed(1)}% ink)`);
  // the same frame painted is in colour
  const p = pixels(compile(await loadFilm(film())), 1.5);
  let pc = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - p[i + 2]) > 20) pc++;
  assert.ok(pc > 0.3 * n, 'the painted frame has colour');
});

test('the figure is white inside its outline: the set behind it does not show through', async () => {
  const plan = compile(await loadFilm(film('lineart'))), t = 1.5, d = pixels(plan, t);
  const b = frameInfo(plan, t).actors.find(a => a.id === 'hare').screenBox;
  // the middle of the hare's body (a box well inside its outline): paper, not the meadow's lines
  const cx = (b[0] + b[2]) / 2, cy = b[1] + 0.62 * (b[3] - b[1]), r = 0.08 * (b[2] - b[0]);
  let dark = 0, n = 0;
  for (let y = Math.round(cy - r); y <= cy + r; y++) for (let x = Math.round(cx - r); x <= cx + r; x++) { n++; if (d[(y * W + x) * 4] < 128) dark++; }
  assert.ok(dark / n < 0.1, `inside the figure is white (${(100 * dark / n).toFixed(0)}% dark)`);
});

test('the converter keeps an inked line and drops a speck', () => {
  const c = createCanvas(200, 100), x = c.getContext('2d');
  x.fillStyle = '#7fb069'; x.fillRect(0, 0, 200, 100);                 // a green field
  x.strokeStyle = '#2a2130'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 50); x.lineTo(180, 50); x.stroke();   // an ink line
  x.fillStyle = '#2a2130'; x.fillRect(100, 85, 2, 2);                   // a speck
  const o = lineart(c).getContext('2d').getImageData(0, 0, 200, 100).data, at = (px, py) => o[(py * 200 + px) * 4];
  assert.ok(Math.min(...[48, 49, 50, 51, 52].map(y => at(100, y))) < 60, 'the ink line is black (drawn again by the pen at its centre)');
  assert.ok(at(100, 20) > 240, 'the field is white paper');
  assert.ok(at(100, 86) > 200, 'the speck is gone');
});
