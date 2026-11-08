import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, parseWav, resample, rms } from '../engine/audio/wav.mjs';
test('wav round trip 16/24 bit, stereo', () => {
  const L = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 10) * 0.5), R = L.map(v => -v);
  for (const bits of [16, 24]) {
    const w = parseWav(encodeWav([L, R], 48000, bits));
    assert.equal(w.sampleRate, 48000); assert.equal(w.channels.length, 2);
    assert.ok(Math.abs(w.channels[0][100] - L[100]) < 1e-3 && Math.abs(w.channels[1][100] - R[100]) < 1e-3);
  }
});
test('resample keeps a sine sine-shaped and length scales', () => {
  const x = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 24000));
  const y = resample(x, 24000, 48000);
  assert.equal(y.length, 4800);
  const peak = Math.max(...y.slice(200, 4600).map(Math.abs)); assert.ok(peak > 0.95 && peak < 1.05, `peak ${peak}`);
});
test('rms per frame', () => {
  const x = new Float32Array(48000).fill(0.5); const e = rms(x, 48000, 24);
  assert.equal(e.length, 24); assert.ok(Math.abs(e[5] - 0.5) < 1e-6);
});
