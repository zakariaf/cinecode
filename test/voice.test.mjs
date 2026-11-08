import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWav, readWav } from '../engine/audio/wav.mjs';
import {
  VOICES, estimateDuration, lineId, voicePrompt, joinTones, normalizeWords, wordErrorRate,
  trimSilence, mouthEnv, voiceLine, voiceLines, resolveLine, directionLevels, directionSpoken,
} from '../engine/audio/voice.mjs';

delete process.env.GEMINI_API_KEY;   // tests never touch the network or a real key
const KEY = 'test-key-SECRET-123';
const tmp = () => mkdtempSync(join(tmpdir(), 'cinecode-voice-'));

// Deterministic speech-like signal: harmonic "syllables" with gaps and one long pause, framed by silence.
function fakeSpeech(sr, { lead = 0.25, tail = 0.3, syll = 4, pause = 0.45, gain = 0.3 } = {}) {
  const parts = [[lead, 0]];
  for (let p = 0; p < 2; p++) {
    for (let s = 0; s < syll; s++) parts.push([0.18, gain], [0.07, 0]);
    if (!p) parts.push([pause, 0]);
  }
  parts.push([tail, 0]);
  const n = Math.round(parts.reduce((a, [d]) => a + d, 0) * sr), x = new Float32Array(n);
  let i = 0, seed = 7;
  for (const [d, g] of parts) {
    const m = Math.round(d * sr);
    for (let k = 0; k < m; k++, i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const noise = ((seed / 2 ** 32) - 0.5) * 2e-4, t = i / sr, w = Math.sin((Math.PI * k) / m) ** 2;
      x[i] = noise + (g ? g * w * (0.6 * Math.sin(2 * Math.PI * 140 * t) + 0.3 * Math.sin(2 * Math.PI * 280 * t) + 0.1 * Math.sin(2 * Math.PI * 560 * t)) : 0);
    }
  }
  return x;
}
const wavB64 = (x, sr = 24000) => encodeWav([x], sr, 16).toString('base64');

// Mock Gemini: queues of TTS audio and QA transcripts; records every request.
function mockGemini({ audio = [], transcripts = [], statuses = [], delay = 0 } = {}) {
  const calls = [], spoken = [];
  let inFlight = 0, maxInFlight = 0, a = 0, t = 0;
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (delay) await new Promise(r => setTimeout(r, delay));
      const st = statuses.shift();
      if (st) return new Response(JSON.stringify(st.body ?? { error: { code: st.status, message: st.message ?? 'busy' } }), { status: st.status, headers: st.headers ?? {} });
      if (url.includes('-tts:')) {
        spoken.push(body.contents[0].parts[0].text.replace(/^\[[^\]]*\]\s*/, ''));
        const x = audio[Math.min(a++, audio.length - 1)] ?? fakeSpeech(24000);
        const inlineData = x.raw ? { mimeType: 'audio/L16;codec=pcm;rate=24000', data: x.raw } : { mimeType: 'audio/wav', data: wavB64(x) };
        return Response.json({ candidates: [{ content: { parts: [{ inlineData }] }, finishReason: 'STOP' }] });
      }
      // 'echo': the transcript is exactly the text that was sent to the TTS (needs sequential calls)
      const text = transcripts === 'echo' ? spoken.shift() : transcripts[Math.min(t++, transcripts.length - 1)];
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    } finally { inFlight--; }
  };
  return { fetch, calls, get maxInFlight() { return maxInFlight; }, tts: () => calls.filter(c => c.url.includes('-tts:')), qa: () => calls.filter(c => !c.url.includes('-tts:')) };
}
const sleeps = [];
const sleep = async ms => { sleeps.push(ms); };

const film = {
  format: { fps: 24 },
  voices: { narrator: { voice: 'Sulafat', tone: 'warm, gentle storyteller' }, pip: { voice: 'Puck', tone: 'bright, curious child' } },
  cast: { pip: { rig: 'human', voice: 'pip' }, fox: { rig: 'fox', voice: 'Algenib' } },
};
const plan = {
  fps: 24,
  lines: [
    { id: 'l1', who: 'narrator', tone: 'softly', text: 'Once upon a time, in a quiet wood.', narrator: true },
    { id: 'l2', who: 'pip', tone: 'curious', text: 'Hello? Is anyone there?' },
  ],
};

test('VOICES: the 30 prebuilt voices with a casting note', () => {
  assert.equal(VOICES.length, 30);
  assert.equal(new Set(VOICES.map(v => v.name)).size, 30);
  for (const n of ['Zephyr', 'Puck', 'Sulafat', 'Algenib', 'Zubenelgenubi', 'Gacrux']) assert.ok(VOICES.find(v => v.name === n), n);
  for (const v of VOICES) { assert.ok(v.character.length > 4); assert.ok(['female', 'male'].includes(v.gender)); }
});

test('estimateDuration = words / 2.6 + 0.3', () => {
  assert.equal(estimateDuration('one two three'), 3 / 2.6 + 0.3);
  assert.equal(estimateDuration('  '), 0.3);
});

test('lineId is stable and depends on who, voice, text and tone', () => {
  const a = lineId('pip', 'Puck', 'Hi', 'curious');
  assert.equal(a, lineId('pip', 'Puck', 'Hi', 'curious'));
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.notEqual(a, lineId('pip', 'Kore', 'Hi', 'curious'));
  assert.notEqual(a, lineId('pip', 'Puck', 'Hi', 'sad'));
  assert.notEqual(a, lineId('fox', 'Puck', 'Hi', 'curious'));
});

test('prompt: bracketed direction, tones joined and de-duplicated', () => {
  assert.equal(voicePrompt('Once upon a time…', joinTones('warmly', 'softly')), '[warmly, softly] Once upon a time…');
  assert.equal(voicePrompt('  Hi  there ', ''), 'Hi there');
  assert.equal(joinTones('warm', ' Warm ', '[sad]'), 'warm, sad');
});

test('resolveLine: voice and tone from film.voices / film.cast', () => {
  assert.deepEqual(resolveLine(film, plan.lines[0]), { id: 'l1', who: 'narrator', voice: 'Sulafat', text: plan.lines[0].text, tone: 'warm, gentle storyteller, softly' });
  assert.equal(resolveLine(film, { id: 'x', who: 'pip', text: 'a' }).voice, 'Puck');
  assert.equal(resolveLine(film, { id: 'x', who: 'fox', text: 'a', tone: 'gruff' }).voice, 'Algenib');   // cast.voice may name a prebuilt voice
  assert.throws(() => resolveLine(film, { id: 'x', who: 'owl', text: 'a' }), /no voice/);
});

test('normalizeWords and WER, with leading insertions detected', () => {
  assert.deepEqual(normalizeWords("Don't stop — 3 BIG apples, naïve!"), ['dont', 'stop', 'three', 'big', 'apples', 'naive']);
  assert.equal(wordErrorRate('We did it!', 'we did it').wer, 0);
  const w = wordErrorRate('We did it!', 'Ah, we did it!');
  assert.equal(w.leading, 1); assert.equal(w.ins, 1); assert.ok(Math.abs(w.wer - 1 / 3) < 1e-9);
  const s = wordErrorRate('We did it!', 'He did it.');
  assert.equal(s.leading, 0); assert.equal(s.sub, 1);
  const d = wordErrorRate('one two three four five', 'one three four five');
  assert.equal(d.del, 1); assert.equal(d.wer, 0.2);
  assert.equal(wordErrorRate('hello', '').wer, 1);
  assert.equal(wordErrorRate('a b', 'a b c d').trailing, 2);
});

test('trimSilence keeps a 60 ms pad around speech', () => {
  const sr = 24000, x = new Float32Array(sr);   // 1 s: speech from 0.4 s to 0.6 s
  for (let i = 0.4 * sr; i < 0.6 * sr; i++) x[i] = 0.2 * Math.sin(i / 3);
  const y = trimSilence(x, sr);
  assert.ok(Math.abs(y.length / sr - 0.32) < 0.011, `trimmed ${y.length / sr}`);
  assert.equal(trimSilence(new Float32Array(1000), sr).length, 0);
});

test('mouthEnv: syllables open the mouth 0.6–1, pauses close it, loudness-independent', () => {
  const sr = 48000, fps = 24, x = fakeSpeech(sr), env = mouthEnv(x, sr, fps);
  assert.equal(env.length, Math.ceil(x.length / (sr / fps)));
  assert.ok(env.every(v => v >= 0 && v <= 1));
  const at = t => env[Math.floor(t * fps)];
  assert.equal(at(0.05), 0, 'leading silence is closed');
  // syllable centres: 0.25 + 0.09 + k * 0.25
  for (let k = 0; k < 4; k++) assert.ok(at(0.25 + 0.09 + k * 0.25) >= 0.6, `syllable ${k}: ${at(0.25 + 0.09 + k * 0.25)}`);
  // the 0.45 s pause starts at 1.25 s; by ~200 ms in, the mouth is shut
  assert.equal(at(1.5), 0, `pause ${at(1.5)}`);
  assert.equal(env[env.length - 1], 0, 'closed at the end');
  // normal loudness differences (−8 dB) don't change the mouth; a whisper (−20 dB) opens it less but still moves it
  const softer = mouthEnv(fakeSpeech(sr, { gain: 0.12 }), sr, fps);
  assert.ok(softer.every((v, i) => Math.abs(v - env[i]) < 0.03), 'level-independent in the normal range');
  const whisper = mouthEnv(fakeSpeech(sr, { gain: 0.03 }), sr, fps);
  assert.ok(Math.max(...env) >= 0.95 && Math.max(...whisper) > 0.2 && Math.max(...whisper) < 0.6, `whisper peak ${Math.max(...whisper)}`);
  // consonant gaps between syllables dip (articulation), not a mouth held open
  assert.ok(at(0.25 + 0.25 - 0.02) < 0.5, `gap ${at(0.48)}`);
  // 30 fps works too
  assert.equal(mouthEnv(x, sr, 30).length, Math.ceil(x.length / (sr / 30)));
});

test('voiceLines: request format, cache files, map by plan line id, then cache-only with no key', async () => {
  const dir = tmp();
  const g = mockGemini({ transcripts: 'echo' }), fetch = g.fetch;
  const progress = [];
  const v = await voiceLines(film, plan, { cacheDir: dir, apiKey: KEY, fetch, sleep, concurrency: 1, onProgress: e => progress.push(e) });
  assert.deepEqual([...v.keys()], ['l1', 'l2']);

  const [tts1, tts2] = g.tts();
  assert.match(tts1.url, /\/models\/gemini-3\.8-flash-lite-tts:generateContent$/);
  assert.equal(tts1.headers['x-goog-api-key'], KEY);
  assert.ok(!tts1.url.includes(KEY));
  assert.equal(tts1.body.contents[0].parts[0].text, '[warm, gentle storyteller, softly] Once upon a time, in a quiet wood.');
  assert.deepEqual(tts1.body.generationConfig, { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } } });
  assert.equal(tts1.body.systemInstruction, undefined);
  assert.equal(tts2.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');

  const l1 = v.get('l1');
  assert.ok(l1.wav instanceof Float32Array);
  assert.equal(l1.sampleRate, 48000);
  // fake speech: 3.0 s, voiced 0.25–2.63 s → 2.38 s + two 60 ms pads, minus the sub −45 dB syllable onsets ≈ 2.48 s
  assert.ok(Math.abs(l1.dur - 2.48) < 0.02, `dur ${l1.dur}`);
  assert.equal(l1.env.length, Math.ceil(l1.dur * 24));
  assert.equal(l1.qa.wer, 0); assert.equal(l1.qa.pass, true);
  assert.equal(l1.qa.transcript, 'Once upon a time, in a quiet wood.');

  const w = readWav(join(dir, 'l1.wav'));
  assert.equal(w.sampleRate, 48000); assert.equal(w.channels[0].length, l1.wav.length);
  const meta = JSON.parse(readFileSync(join(dir, 'l1.json'), 'utf8'));
  for (const k of ['text', 'voice', 'tone', 'model', 'dur', 'env', 'qa']) assert.ok(k in meta, k);
  assert.equal(meta.voice, 'Sulafat'); assert.equal(meta.model, 'gemini-3.8-flash-lite-tts');
  assert.ok(!readFileSync(join(dir, 'l1.json'), 'utf8').includes(KEY));
  assert.ok(progress.some(e => e.status === 'generating') && progress.filter(e => e.status === 'done').length === 2);

  // Second run: no key, a fetch that explodes — everything comes from the cache, bit-identical.
  const boom = async () => { throw new Error('network used'); };
  const again = await voiceLines(film, plan, { cacheDir: dir, apiKey: null, fetch: boom });
  assert.equal(again.get('l1').cached, true);
  assert.deepEqual(again.get('l1').wav, l1.wav);
  assert.deepEqual(again.get('l1').env, l1.env);
  rmSync(dir, { recursive: true });
});

test('QA: an added leading word ("Ah, we did it!") triggers a retake; the clean take is kept', async () => {
  const dir = tmp();
  const g = mockGemini({ audio: [fakeSpeech(24000, { syll: 3 }), fakeSpeech(24000, { syll: 2 })], transcripts: ['Ah, we did it!', 'We did it!'] });
  const r = await voiceLine({ who: 'pip', voice: 'puck', text: 'We did it!', tone: 'triumphant' }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.equal(g.tts().length, 2);
  assert.equal(r.voice, 'Puck');
  assert.equal(r.qa.take, 2); assert.equal(r.qa.wer, 0); assert.equal(r.qa.pass, true);
  assert.equal(r.qa.takes[0].leading, 1);
  assert.ok(!r.qa.takes[0].directionSpoken);
  const [p1, p2] = g.tts().map(c => c.body.contents[0].parts[0].text);
  assert.equal(p1, '[triumphant] We did it!'); assert.equal(p2, p1, 'a filler word alone keeps the same direction');
  // second take had 2 + 2 syllables → shorter than the first (3 + 3)
  assert.ok(r.dur < r.qa.takes[0].dur, `${r.dur} vs ${r.qa.takes[0].dur}`);
  assert.equal(r.id, lineId('pip', 'Puck', 'We did it!', 'triumphant'));
  assert.ok(existsSync(join(dir, `${r.id}.wav`)));
  rmSync(dir, { recursive: true });
});

test('QA: when the bracketed direction is read aloud, retakes simplify it (full → last clause → none)', async () => {
  assert.deepEqual(directionLevels('gravelly, grumpy old badger, grumbling'), ['gravelly, grumpy old badger, grumbling', 'grumbling', '']);
  assert.deepEqual(directionLevels('warmly'), ['warmly', '']);
  assert.deepEqual(directionLevels(''), ['']);
  assert.equal(directionSpoken('gravelly, grumpy old badger', ['ugh', 'gravelly', 'grumpy']), true);
  assert.equal(directionSpoken('gravelly, grumpy old badger', ['ah']), false);
  const dir = tmp(), tone = 'gravelly, grumpy old badger, grumbling';
  const g = mockGemini({ transcripts: ['Ugh gravelly grumpy old badger grumbling. Nobody knocks before breakfast.', 'Grumbling. Nobody knocks before breakfast.', 'Nobody knocks before breakfast.'] });
  const r = await voiceLine({ who: 'badger', voice: 'Algenib', text: 'Nobody knocks before breakfast.', tone }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.deepEqual(g.tts().map(c => c.body.contents[0].parts[0].text), [
    '[gravelly, grumpy old badger, grumbling] Nobody knocks before breakfast.',
    '[grumbling] Nobody knocks before breakfast.',
    'Nobody knocks before breakfast.',
  ]);
  assert.equal(r.qa.take, 3); assert.equal(r.qa.pass, true);
  assert.ok(r.qa.takes[0].directionSpoken && r.qa.takes[1].directionSpoken);
  const meta = JSON.parse(readFileSync(join(dir, `${r.id}.json`), 'utf8'));
  assert.equal(meta.tone, tone, 'cache key keeps the requested direction');
  assert.equal(meta.prompt, 'Nobody knocks before breakfast.', 'meta records the prompt of the kept take');
  rmSync(dir, { recursive: true });
});

test('QA: max 3 takes, the best is kept and marked as not passing', async () => {
  const dir = tmp();
  const g = mockGemini({ audio: [fakeSpeech(24000, { syll: 1 }), fakeSpeech(24000, { syll: 2 }), fakeSpeech(24000, { syll: 3 })], transcripts: ['one two', 'one two three four five six', 'two three'] });
  const r = await voiceLine({ voice: 'Kore', text: 'one two three four five six seven eight nine ten' }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.equal(g.tts().length, 3); assert.equal(g.qa().length, 3);
  assert.equal(r.qa.take, 2); assert.equal(r.qa.wer, 0.4); assert.equal(r.qa.pass, false);
  assert.equal(r.qa.takes.length, 3);
  rmSync(dir, { recursive: true });
});

test('429 / 503 / network errors retry with exponential backoff; RetryInfo is honoured', async () => {
  const dir = tmp();
  sleeps.length = 0;
  const g = mockGemini({ transcripts: ['Hello there.'], statuses: [
    { status: 429, body: { error: { code: 429, message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] } } },
    { status: 503 }, { status: 500 },
  ] });
  const r = await voiceLine({ voice: 'Zephyr', text: 'Hello there.' }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.equal(r.qa.wer, 0);
  assert.deepEqual(sleeps, [7000, 2000, 4000]);
  rmSync(dir, { recursive: true });
});

test('400 is not retried and the error never contains the key', async () => {
  const dir = tmp();
  const g = mockGemini({ statuses: [{ status: 400, message: `Developer instruction is not enabled for this model (key ${KEY})` }] });
  await assert.rejects(
    voiceLine({ voice: 'Zephyr', text: 'Hi.' }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep }),
    e => { assert.match(e.message, /HTTP 400/); assert.match(e.message, /Developer instruction/); assert.ok(!e.message.includes(KEY)); return true; });
  assert.equal(g.calls.length, 1);
  rmSync(dir, { recursive: true });
});

test('missing GEMINI_API_KEY with an incomplete cache is a clear error, before any request', async () => {
  const dir = tmp(), g = mockGemini();
  await assert.rejects(voiceLines(film, plan, { cacheDir: dir, fetch: g.fetch }), /2 of 2 voice line\(s\) are not in the cache .*GEMINI_API_KEY/s);
  assert.equal(g.calls.length, 0);
  rmSync(dir, { recursive: true });
});

test('changing a voice invalidates the cached take; a new fps re-derives env without network', async () => {
  const dir = tmp();
  const g = mockGemini({ transcripts: ['Once upon a time, in a quiet wood.'] });
  const one = { ...plan, lines: [plan.lines[0]] };
  await voiceLines(film, one, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.equal(g.tts().length, 1);
  const film2 = { ...film, voices: { ...film.voices, narrator: { voice: 'Gacrux', tone: 'warm, gentle storyteller' } } };
  await voiceLines(film2, one, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep });
  assert.equal(g.tts().length, 2);
  assert.equal(JSON.parse(readFileSync(join(dir, 'l1.json'), 'utf8')).voice, 'Gacrux');
  const v30 = await voiceLines(film2, { ...one, fps: 30 }, { cacheDir: dir, apiKey: null, fetch: async () => { throw new Error('net'); } });
  const l = v30.get('l1');
  assert.equal(l.env.length, Math.ceil(l.dur * 30));
  assert.equal(JSON.parse(readFileSync(join(dir, 'l1.json'), 'utf8')).fps, 30);
  rmSync(dir, { recursive: true });
});

test('concurrency limit, de-duplicated lines, raw PCM responses, failures do not stop other lines', async () => {
  const dir = tmp();
  const lines = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, who: 'pip', text: `Line number ${i}.` }));
  lines.push({ ...lines[0] });   // same id twice → voiced once
  const g = mockGemini({ delay: 5 });
  const v = await voiceLines(film, { fps: 24, lines }, { cacheDir: dir, apiKey: KEY, fetch: g.fetch, sleep, qa: false, concurrency: 2 });
  assert.ok(g.maxInFlight <= 2 && g.maxInFlight >= 1, `in flight ${g.maxInFlight}`);
  assert.equal(g.tts().length, 5); assert.equal(g.qa().length, 0);
  assert.deepEqual([...v.keys()], ['c0', 'c1', 'c2', 'c3', 'c4'], 'map follows plan order, not completion order');

  // raw L16 PCM body (older API shape)
  const x = fakeSpeech(24000), pcm = Buffer.alloc(x.length * 2);
  x.forEach((v, i) => pcm.writeInt16LE(Math.round(v * 32767), 2 * i));
  const raw = mockGemini({ audio: [{ raw: pcm.toString('base64') }], transcripts: ['Raw audio.'] });
  const r = await voiceLine({ voice: 'Leda', text: 'Raw audio.' }, { cacheDir: dir, apiKey: KEY, fetch: raw.fetch, sleep });
  assert.ok(Math.abs(r.dur - 2.48) < 0.02, `dur ${r.dur}`);

  // one line gets a 400, the other still lands in the cache
  const bad = mockGemini({ statuses: [{ status: 400, message: 'bad' }], transcripts: ['ok then'] });
  await assert.rejects(
    voiceLines(film, { lines: [{ id: 'f1', who: 'pip', text: 'Bad.' }, { id: 'f2', who: 'pip', text: 'Ok then.' }] }, { cacheDir: dir, apiKey: KEY, fetch: bad.fetch, sleep, concurrency: 1 }),
    e => e.failed.length === 1 && e.failed[0].id === 'f1' && e.voices.has('f2'));
  assert.ok(existsSync(join(dir, 'f2.wav')));
  rmSync(dir, { recursive: true });
});
