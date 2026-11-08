// WAV I/O and small signal helpers. Mono or multi-channel Float32Array buffers in the range [-1, 1].
import { readFileSync, writeFileSync } from 'node:fs';

/** Parse a RIFF/WAVE buffer (PCM 8/16/24/32-bit or IEEE float 32). */
export function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4); let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === 'data') { if (size === 0xffffffff || body + size > buf.length) size = buf.length - body; data = { body, size }; }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data chunk');
  const { format, channels: nc, sampleRate, bits } = fmt, bps = bits / 8, n = Math.floor(data.size / (bps * nc));
  const ch = Array.from({ length: nc }, () => new Float32Array(n));
  const isFloat = format === 3 || (format === 0xfffe && bits === 32 && false);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const p = data.body + (i * nc + c) * bps; let v;
    if (isFloat) v = buf.readFloatLE(p);
    else if (bits === 16) v = buf.readInt16LE(p) / 32768;
    else if (bits === 24) v = buf.readIntLE(p, 3) / 8388608;
    else if (bits === 32) v = buf.readInt32LE(p) / 2147483648;
    else if (bits === 8) v = (buf.readUInt8(p) - 128) / 128;
    else throw new Error(`unsupported WAV bit depth ${bits}`);
    ch[c][i] = v;
  }
  return { sampleRate, channels: ch };
}
export const readWav = path => parseWav(readFileSync(path));

/** Encode channels (array of Float32Array, equal length) as PCM WAV. bits: 16 or 24. */
export function encodeWav(channels, sampleRate, bits = 16) {
  const nc = channels.length, n = channels[0].length, bps = bits / 8, dataSize = n * nc * bps;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * nc * bps, 28); buf.writeUInt16LE(nc * bps, 32); buf.writeUInt16LE(bits, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataSize, 40);
  let p = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = Math.max(-1, Math.min(1, channels[c][i] || 0));
    if (bits === 16) { buf.writeInt16LE(Math.round(v * 32767), p); p += 2; }
    else if (bits === 24) { buf.writeIntLE(Math.round(v * 8388607), p, 3); p += 3; }
    else throw new Error(`unsupported bit depth ${bits}`);
  }
  return buf;
}
export const writeWav = (path, channels, sampleRate, bits = 16) => writeFileSync(path, encodeWav(Array.isArray(channels) ? channels : [channels], sampleRate, bits));

/** Band-limited resampling (windowed sinc, 16 taps each side). Deterministic. */
export function resample(x, from, to) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from, n = Math.round(x.length * ratio), y = new Float32Array(n), cutoff = Math.min(1, ratio), A = 16;
  for (let i = 0; i < n; i++) {
    const t = i / ratio, c = Math.floor(t); let acc = 0, wsum = 0;
    for (let k = c - A + 1; k <= c + A; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k, s = d === 0 ? 1 : Math.sin(Math.PI * d * cutoff) / (Math.PI * d * cutoff), w = 0.5 + 0.5 * Math.cos(Math.PI * d / A);
      const g = s * w; acc += x[k] * g; wsum += g;
    }
    y[i] = wsum ? acc / wsum : 0;
  }
  return y;
}

/** RMS per video frame (fps), for lip-sync envelopes and ducking. */
export function rms(x, sampleRate, fps) {
  const hop = sampleRate / fps, n = Math.ceil(x.length / hop), out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * hop), b = Math.min(x.length, Math.floor((i + 1) * hop)); let s = 0;
    for (let j = a; j < b; j++) s += x[j] * x[j];
    out[i] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  return out;
}
export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(1e-9, g));
export const SAMPLE_RATE = 48000;
