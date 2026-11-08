// Voices: Gemini TTS → QA transcription → trim → 48 kHz → lip-sync envelope, cached on disk.
//
// The only part of a cinecode film that comes from a model. Every line is cached as
// <cacheDir>/<id>.wav (48 kHz mono, trimmed) + <id>.json (meta, QA, envelope), so once a
// film is voiced it re-renders identically with no network and no API key.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav, parseWav, resample, dbToGain, gainToDb, SAMPLE_RATE } from './wav.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
export const QA_MODEL = 'gemini-3.8-flash';
/** Bump when mouthEnv changes: cached envelopes are re-derived from the cached audio (no network). */
export const ENV_VERSION = 1;

/** The 30 prebuilt Gemini voices. `character` is a casting note (official style word first). */
export const VOICES = [
  ['Zephyr', 'female', 'bright, airy, light-hearted young woman'],
  ['Puck', 'male', 'upbeat, playful, boyish energy'],
  ['Charon', 'male', 'informative, deep, calm documentary voice'],
  ['Kore', 'female', 'firm, confident, clear-spoken woman'],
  ['Fenrir', 'male', 'excitable, quick, eager'],
  ['Leda', 'female', 'youthful, light, girlish'],
  ['Orus', 'male', 'firm, steady, grounded adult'],
  ['Aoede', 'female', 'breezy, relaxed, natural'],
  ['Callirrhoe', 'female', 'easy-going, friendly, unhurried'],
  ['Autonoe', 'female', 'bright, articulate, cheerful'],
  ['Enceladus', 'male', 'breathy, soft-spoken, intimate'],
  ['Iapetus', 'male', 'clear, plain, trustworthy'],
  ['Umbriel', 'male', 'easy-going, mellow, warm'],
  ['Algieba', 'male', 'smooth, polished, gentle'],
  ['Despina', 'female', 'smooth, warm, poised'],
  ['Erinome', 'female', 'clear, precise, composed'],
  ['Algenib', 'male', 'gravelly, rough, gruff old character'],
  ['Rasalgethi', 'male', 'informative, measured, professorial'],
  ['Laomedeia', 'female', 'upbeat, lively, curious'],
  ['Achernar', 'female', 'soft, tender, quiet'],
  ['Alnilam', 'male', 'firm, strong, authoritative'],
  ['Schedar', 'male', 'even, level, dependable'],
  ['Gacrux', 'female', 'mature, grandmotherly, rich'],
  ['Pulcherrima', 'female', 'forward, bold, expressive'],
  ['Achird', 'male', 'friendly, kind, approachable'],
  ['Zubenelgenubi', 'male', 'casual, laid-back, conversational'],
  ['Vindemiatrix', 'female', 'gentle, calm, soothing'],
  ['Sadachbia', 'male', 'lively, animated, spirited'],
  ['Sadaltager', 'male', 'knowledgeable, wise, thoughtful'],
  ['Sulafat', 'female', 'warm, rich, a natural storyteller'],
].map(([name, gender, character]) => ({ name, gender, character }));

const VOICE_BY_LC = new Map(VOICES.map(v => [v.name.toLowerCase(), v.name]));
const isVoiceName = n => typeof n === 'string' && VOICE_BY_LC.has(n.toLowerCase());

/** Duration estimate in seconds before a line is voiced (DESIGN §4). */
export function estimateDuration(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return words / 2.6 + 0.3;
}

/** Stable id of a voiced line: hash of who + voice + text + tone. */
export function lineId(who, voice, text, tone) {
  return createHash('sha1').update(JSON.stringify([who ?? '', voice ?? '', text ?? '', tone ?? ''])).digest('hex').slice(0, 12);
}

/** Direction for the TTS: `[tone, tone] text`. The bracket is not spoken; a plain prefix would be. */
export function voicePrompt(text, tone) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return tone ? `[${tone}] ${t}` : t;
}

/** Combine cast tone and line tone into one direction (brackets stripped, duplicates removed). */
export function joinTones(...tones) {
  const parts = tones.flat().filter(Boolean).map(s => String(s).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of parts) if (!out.some(o => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out.join(', ');
}

/**
 * Directions to try, in order, when the model reads the bracket aloud (seen live with
 * "[gravelly, grumpy old badger, grumbling]"): the full direction, then only its last clause
 * (usually the line's own delivery, e.g. "grumbling"), then none (the voice alone carries it).
 */
export function directionLevels(tone) {
  const parts = String(tone ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([parts.join(', '), parts.at(-1) ?? '', ''])];
}
/** True when the words inserted before the line are (mostly) the direction itself. */
export function directionSpoken(direction, leadingWords) {
  const dir = new Set(normalizeWords(direction));
  return dir.size > 0 && leadingWords.filter(w => dir.has(w)).length >= Math.min(2, dir.size);
}

// ---------------------------------------------------------------------------------- QA (WER)

const NUM = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');

/** Lowercase words without punctuation or diacritics; `don't` → `dont`, digits 0–20 → words. */
export function normalizeWords(s) {
  return String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/['’‘`ʼ]/g, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/).filter(Boolean).map(w => (/^\d+$/.test(w) && +w <= 20 ? NUM[+w] : w));
}

/**
 * Word error rate of `hyp` against `ref` (strings or word arrays), with the alignment counts.
 * `leading` = words inserted before the first reference word ("Ah, we did it!" for "We did it!").
 */
export function wordErrorRate(ref, hyp) {
  const r = Array.isArray(ref) ? ref : normalizeWords(ref), h = Array.isArray(hyp) ? hyp : normalizeWords(hyp);
  const n = r.length, m = h.length, D = Array.from({ length: n + 1 }, (_, i) => new Int32Array(m + 1).fill(0).map((_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    D[i][j] = Math.min(D[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const ops = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i && j && D[i][j] === D[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)) { ops.push(r[i - 1] === h[j - 1] ? 'ok' : 'sub'); i--; j--; }
    else if (i && D[i][j] === D[i - 1][j] + 1) { ops.push('del'); i--; }
    else { ops.push('ins'); j--; }
  }
  ops.reverse();
  const count = k => ops.filter(o => o === k).length;
  let leading = 0; while (leading < ops.length && ops[leading] === 'ins') leading++;
  let trailing = 0; while (trailing < ops.length - leading && ops[ops.length - 1 - trailing] === 'ins') trailing++;
  if (!n) return { wer: m ? 1 : 0, sub: 0, del: 0, ins: m, leading: m, trailing: 0 };
  return { wer: D[n][m] / n, sub: count('sub'), del: count('del'), ins: count('ins'), leading, trailing };
}

// ---------------------------------------------------------------------------------- signal

/** Cut leading/trailing silence below `thresholdDb` (10 ms RMS windows), keeping `padMs` around speech. */
export function trimSilence(x, sr, { thresholdDb = -45, padMs = 60, winMs = 10 } = {}) {
  const thr = dbToGain(thresholdDb), win = Math.max(1, Math.round((sr * winMs) / 1000));
  let first = -1, last = -1;
  for (let a = 0; a < x.length; a += win) {
    const b = Math.min(x.length, a + win); let s = 0;
    for (let j = a; j < b; j++) s += x[j] * x[j];
    if (Math.sqrt(s / (b - a)) > thr) { if (first < 0) first = a; last = b; }
  }
  if (first < 0) return new Float32Array(0);
  const pad = Math.round((sr * padMs) / 1000);
  return x.slice(Math.max(0, first - pad), Math.min(x.length, last + pad));
}

function fadeEdges(x, sr, ms = 4) {
  const n = Math.min(Math.floor(x.length / 2), Math.round((sr * ms) / 1000));
  for (let i = 0; i < n; i++) { const g = Math.sin((0.5 * Math.PI * i) / n) ** 2; x[i] *= g; x[x.length - 1 - i] *= g; }
  return x;
}

/** RBJ biquad low/high-pass (Q 0.707), used to isolate the vowel band for the lip envelope. */
function biquad(x, sr, type, f0) {
  const w = (2 * Math.PI * f0) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const b0 = type === 'lp' ? (1 - c) / 2 : (1 + c) / 2, b1 = type === 'lp' ? 1 - c : -(1 + c), b2 = b0, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

/**
 * Mouth openness per video frame (0..1) from the speech signal.
 * Vowel band only (200–1200 Hz, where F1 tracks jaw opening, so hissy consonants don't open the mouth)
 * → mean square over 8 ms → envelope follower (fast attack, `release` ~60 ms) → frame average (read
 * `lead` s ahead to cancel the follower lag) → dB relative to the speaking level (the line's 90th
 * percentile, lowered by up to `adapt` dB around a quieter phrase, floored at −30 dBFS so whispers
 * stay small) → soft knee (smoothstep over `knee` dB).
 * Vowels land at 0.6–1, consonants dip, pauses fall to 0. An isolated one-frame dip is softened (it
 * reads as flicker at 24 fps; two-frame closures such as m/b/p stay), and the last frame is closed.
 * Measured on real Gemini takes: ~2.4 articulation dips per second, ~30–40% of speech frames fully open.
 */
export function mouthEnv(x0, sr, fps, { band = [200, 1200], attack = 0.01, release = 0.06, lead = 0.015, range = 20, knee = 20, floorDb = -30, adapt = 8, adaptWin = 0.4 } = {}) {
  const x = band ? biquad(biquad(x0, sr, 'hp', band[0]), sr, 'lp', band[1]) : x0;
  const n = x.length, kP = 1 - Math.exp(-1 / (0.008 * sr)), kA = 1 - Math.exp(-1 / (attack * sr)), kR = 1 - Math.exp(-1 / (release * sr));
  const e = new Float32Array(n);
  let p = 0, f = 0;
  for (let i = 0; i < n; i++) { p += (x[i] * x[i] - p) * kP; const a = Math.sqrt(p); f += (a - f) * (a > f ? kA : kR); e[i] = f; }
  const hop = sr / fps, frames = Math.ceil(n / hop), sh = Math.round(lead * sr), db = new Array(frames);
  for (let i = 0; i < frames; i++) {
    const a = Math.min(n, Math.floor(i * hop) + sh), b = Math.min(n, Math.floor((i + 1) * hop) + sh);
    let s = 0; for (let j = a; j < b; j++) s += e[j];
    db[i] = b > a ? gainToDb(s / (b - a)) : -180;
  }
  const active = db.filter(d => d > -60).sort((a, b) => a - b);
  const p90 = active.length ? active[Math.floor(0.9 * (active.length - 1))] : -20, w = Math.round(adaptWin * fps);
  const o = db.map((d, i) => {
    if (d < -52) return 0;
    let loc = -180; for (let j = Math.max(0, i - w); j <= Math.min(frames - 1, i + w); j++) loc = Math.max(loc, db[j]);
    // reference: the line's level, lowered up to `adapt` dB for a quieter phrase, never below the whisper floor
    const r = Math.max(floorDb, Math.min(p90, Math.max(p90 - adapt, loc))), u = Math.max(0, Math.min(1, (d - r + range) / knee));
    return u * u * (3 - 2 * u);
  });
  const env = o.map((v, i) => (i > 0 && i < o.length - 1 && v < o[i - 1] && v < o[i + 1] ? Math.max(v, 0.4 * Math.min(o[i - 1], o[i + 1])) : v));
  if (env.length) env[env.length - 1] = 0;
  if (env.length > 1) env[env.length - 2] = Math.min(env[env.length - 2], 0.5);
  return env.map(v => (v < 0.04 ? 0 : Math.round(v * 1000) / 1000));
}

// ---------------------------------------------------------------------------------- HTTP

const scrub = (s, key) => (key ? String(s).split(key).join('***') : String(s));
const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

function retryDelayMs(res, body) {
  const ra = res.headers?.get?.('retry-after');
  if (ra && Number.isFinite(+ra)) return +ra * 1000;
  const m = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body || '');
  return m ? Math.ceil(+m[1] * 1000) : null;
}

/** POST generateContent with retries on 429/5xx/network errors (exponential backoff, honours RetryInfo). */
async function generate(model, body, ctx) {
  const { apiKey, fetch: f, sleep, retries = 6, timeoutMs = 120000 } = ctx;
  for (let attempt = 0; ; attempt++) {
    let res = null, text = '', why;
    try {
      res = await f(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
      text = await res.text().catch(() => '');
      let msg = text; try { msg = JSON.parse(text)?.error?.message ?? text; } catch {}
      why = `HTTP ${res.status}: ${String(msg).slice(0, 300)}`;
    } catch (e) { why = `network error: ${e?.message ?? e}`; }
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new Error(scrub(`Gemini ${model} failed after ${attempt + 1} request(s) — ${why}`, apiKey));
    const wait = (res && retryDelayMs(res, text)) ?? 1000 * 2 ** attempt;
    ctx.onRetry?.({ model, attempt: attempt + 1, wait, why: scrub(why, apiKey) });
    await sleep(Math.min(90000, wait));
  }
}

function audioFromResponse(json) {
  const cand = json?.candidates?.[0], part = cand?.content?.parts?.find(p => p?.inlineData?.data);
  if (!part) return { error: `no audio in response (finishReason ${cand?.finishReason ?? json?.promptFeedback?.blockReason ?? 'unknown'})` };
  const { data, mimeType = '' } = part.inlineData, buf = Buffer.from(data, 'base64');
  if (buf.toString('ascii', 0, 4) === 'RIFF') {
    const w = parseWav(buf), ch = w.channels, x = new Float32Array(ch[0].length);
    for (const c of ch) for (let i = 0; i < x.length; i++) x[i] += c[i] / ch.length;
    return { x, sr: w.sampleRate };
  }
  // Raw 16-bit little-endian PCM (older TTS responses: audio/L16;codec=pcm;rate=24000).
  const sr = +(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000), x = new Float32Array(buf.length >> 1);
  for (let i = 0; i < x.length; i++) x[i] = buf.readInt16LE(2 * i) / 32768;
  return { x, sr };
}

const QA_PROMPT = 'Transcribe the speech in this audio clip verbatim. Write every word exactly as it is spoken, including filler words, interjections, false starts and repetitions. Output only the spoken words: no quotes, labels, timestamps, descriptions or commentary. If there is no speech, output nothing.';

async function transcribe(x, sr, ctx) {
  const json = await generate(ctx.qaModel, { contents: [{ parts: [
    { inlineData: { mimeType: 'audio/wav', data: encodeWav([x], sr, 16).toString('base64') } },
    { text: QA_PROMPT },
  ] }] }, ctx);
  return (json?.candidates?.[0]?.content?.parts ?? []).filter(p => typeof p?.text === 'string' && !p.thought).map(p => p.text).join(' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------------- cache

const safeId = id => String(id).replace(/[^\w.-]/g, '_');
const cachePaths = (dir, id) => ({ wav: join(dir, `${safeId(id)}.wav`), json: join(dir, `${safeId(id)}.json`) });

function writeAtomic(path, data) { const tmp = `${path}.tmp`; writeFileSync(tmp, data); renameSync(tmp, path); }
/** Indented meta JSON with the envelope kept on one line (cache files are committed; keep diffs readable). */
const metaJson = m => JSON.stringify({ ...m, env: '\u0000env' }, null, 1).replace('"\\u0000env"', JSON.stringify(m.env)) + '\n';

function readMeta(dir, id) {
  const p = cachePaths(dir, id);
  if (!existsSync(p.wav) || !existsSync(p.json)) return null;
  try { return JSON.parse(readFileSync(p.json, 'utf8')); } catch { return null; }
}

/** A cache entry is valid when it exists and was voiced from the same text, voice and direction. */
const metaMatches = (meta, L) => !!meta && meta.text === L.text && meta.voice === L.voice && (meta.tone ?? '') === (L.tone ?? '');

function loadCached(dir, L, fps) {
  const p = cachePaths(dir, L.id), meta = JSON.parse(readFileSync(p.json, 'utf8')), w = parseWav(readFileSync(p.wav));
  const wav = w.sampleRate === SAMPLE_RATE ? w.channels[0] : resample(w.channels[0], w.sampleRate, SAMPLE_RATE);
  let env = meta.env;
  if (meta.fps !== fps || meta.envVersion !== ENV_VERSION || !Array.isArray(env)) {   // re-derive from the cached audio, no network
    env = mouthEnv(wav, SAMPLE_RATE, fps);
    writeAtomic(p.json, metaJson({ ...meta, fps, envVersion: ENV_VERSION, env }));
  }
  return { id: L.id, who: meta.who ?? L.who, text: meta.text, voice: meta.voice, tone: meta.tone, wav, sampleRate: SAMPLE_RATE, dur: wav.length / SAMPLE_RATE, env, fps, qa: meta.qa, path: p.wav, cached: true };
}

// ---------------------------------------------------------------------------------- voicing

function context(opts) {
  return {
    cacheDir: opts.cacheDir,
    model: opts.model ?? TTS_MODEL,
    qaModel: opts.qaModel ?? QA_MODEL,
    apiKey: opts.apiKey === undefined ? process.env.GEMINI_API_KEY : opts.apiKey,
    fps: opts.fps ?? 24,
    fetch: opts.fetch ?? globalThis.fetch,
    sleep: opts.sleep ?? defaultSleep,
    attempts: opts.attempts ?? 3,
    maxWer: opts.maxWer ?? 0.2,
    qa: opts.qa ?? true,
    retries: opts.retries,
    timeoutMs: opts.timeoutMs,
    onProgress: opts.onProgress,
    onRetry: opts.onRetry,
  };
}

function normalizeLine(line) {
  const voice = VOICE_BY_LC.get(String(line.voice ?? '').toLowerCase());
  if (!voice) throw new Error(`unknown voice "${line.voice}" for "${line.who ?? 'line'}"; prebuilt voices: ${VOICES.map(v => v.name).join(', ')}`);
  const who = line.who ?? 'narrator', text = String(line.text ?? '').replace(/\s+/g, ' ').trim(), tone = joinTones(line.tone);
  if (!text) throw new Error(`empty line text for "${who}"`);
  return { id: line.id ?? lineId(who, voice, text, tone), who, voice, text, tone };
}

const missingKeyError = (missing, total, dir) => new Error(
  `${missing.length} of ${total} voice line(s) are not in the cache (${dir}) and GEMINI_API_KEY is not set. ` +
  `Export GEMINI_API_KEY (or pass apiKey) to generate them. Missing: ` +
  missing.slice(0, 5).map(L => `${L.id} ${L.who}: "${L.text.slice(0, 40)}"`).join('; ') + (missing.length > 5 ? '; …' : ''));

/** Generate one line (TTS → trim → QA, up to `attempts` takes, best kept) and write it to the cache. */
async function synthesize(L, ctx) {
  const ref = normalizeWords(L.text), takes = [], directions = directionLevels(L.tone);
  let best = null, level = 0;
  for (let attempt = 1; attempt <= ctx.attempts; attempt++) {
    ctx.onProgress?.({ id: L.id, who: L.who, text: L.text, status: attempt === 1 ? 'generating' : 'retry', attempt });
    const direction = directions[level], prompt = voicePrompt(L.text, direction);
    const json = await generate(ctx.model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: L.voice } } } },
    }, ctx);
    const a = audioFromResponse(json);
    const x = a.error ? null : trimSilence(a.x, a.sr);
    if (!x || x.length < a.sr * 0.1) { takes.push({ attempt, direction, error: a.error ?? 'silent audio' }); continue; }
    let qa = { wer: null, transcript: null };
    if (ctx.qa) {
      try {
        const transcript = await transcribe(x, a.sr, ctx), hyp = normalizeWords(transcript), w = wordErrorRate(ref, hyp);
        qa = { wer: Math.round(w.wer * 1000) / 1000, transcript, leading: w.leading, trailing: w.trailing };
        if (directionSpoken(direction, hyp.slice(0, w.leading))) qa.directionSpoken = true;
      } catch (e) { qa = { wer: null, transcript: null, error: e.message }; }   // QA service down: keep the take unchecked
    }
    const checked = ctx.qa && qa.wer !== null, score = checked ? qa.wer + (qa.leading ? 0.25 : 0) : 1;
    takes.push({ attempt, direction, ...qa, dur: Math.round((x.length / a.sr) * 1000) / 1000 });
    if (!best || score < best.score) best = { x, sr: a.sr, qa, score, attempt, prompt };
    if (!checked || (qa.wer <= ctx.maxWer && !qa.leading)) break;
    // The model read the bracket aloud: the same prompt tends to fail the same way, so simplify it.
    if (qa.directionSpoken) level = Math.min(level + 1, directions.length - 1);
  }
  if (!best) throw new Error(`no usable audio for ${L.id} (${L.who}: "${L.text.slice(0, 40)}") after ${takes.length} take(s): ${takes.map(t => t.error).join('; ')}`);

  const wav = fadeEdges(resample(best.x, best.sr, SAMPLE_RATE), SAMPLE_RATE);
  const dur = wav.length / SAMPLE_RATE, env = mouthEnv(wav, SAMPLE_RATE, ctx.fps);
  const qa = { ...best.qa, pass: best.qa.wer === null ? null : best.qa.wer <= ctx.maxWer && !best.qa.leading, take: best.attempt, takes };
  const p = cachePaths(ctx.cacheDir, L.id);
  mkdirSync(ctx.cacheDir, { recursive: true });
  writeAtomic(p.wav, encodeWav([wav], SAMPLE_RATE, 16));
  writeAtomic(p.json, metaJson({ id: L.id, who: L.who, text: L.text, voice: L.voice, tone: L.tone, prompt: best.prompt, model: ctx.model, qaModel: ctx.qa ? ctx.qaModel : null, sampleRate: SAMPLE_RATE, dur: Math.round(dur * 10000) / 10000, fps: ctx.fps, envVersion: ENV_VERSION, env, qa }));
  // Return exactly what a later cache hit returns (the 16-bit file), so renders are identical either way.
  return { ...loadCached(ctx.cacheDir, L, ctx.fps), cached: false };
}

async function voiceOne(L, ctx) {
  if (metaMatches(readMeta(ctx.cacheDir, L.id), L)) return loadCached(ctx.cacheDir, L, ctx.fps);
  if (!ctx.apiKey) throw missingKeyError([L], 1, ctx.cacheDir);
  return synthesize(L, ctx);
}

/**
 * Voice a single line. `line`: { who?, voice (prebuilt name), text, tone?, id? }.
 * Returns { id, who, text, voice, tone, wav: Float32Array (48 kHz mono), sampleRate, dur, env, fps, qa, path, cached }.
 */
export async function voiceLine(line, opts = {}) {
  if (!opts.cacheDir) throw new Error('voiceLine: opts.cacheDir is required');
  return voiceOne(normalizeLine(line), context(opts));
}

/** Resolve a plan line's prebuilt voice and full direction from film.voices / film.cast. */
export function resolveLine(film, line) {
  const voices = film?.voices ?? {}, cast = film?.cast?.[line.who];
  const key = [line.voice, cast?.voice, line.who, line.narrator ? 'narrator' : null].find(k => typeof k === 'string' && voices[k]);
  const cfg = key ? voices[key] : {};
  const voice = cfg.voice ?? [line.voice, cast?.voice].find(isVoiceName);
  if (!voice) throw new Error(`line ${line.id ?? ''} (${line.who}: "${String(line.text).slice(0, 40)}"): no voice — add film.voices.${line.who} = { "voice": "<prebuilt name>", "tone": "…" }`);
  return { id: line.id, who: line.who ?? 'narrator', voice, text: line.text, tone: joinTones(cfg.tone, line.tone) };
}

/**
 * Voice every line of a compiled plan. Returns Map lineId → { wav, dur, env, qa, … } (see voiceLine).
 * Cached lines need no network and no key. Lines are voiced `concurrency` at a time; a line that
 * fails does not stop the others (they stay cached) and the error lists every failure.
 */
export async function voiceLines(film, plan, opts = {}) {
  const ctx = context({ ...opts, fps: opts.fps ?? plan?.fps ?? film?.format?.fps ?? 24 });
  ctx.cacheDir = opts.cacheDir ?? (film?.dir ? join(film.dir, 'voices') : null);
  if (!ctx.cacheDir) throw new Error('voiceLines: opts.cacheDir is required (or film.dir)');
  const seen = new Set(), lines = [];
  for (const line of plan?.lines ?? []) {
    const L = normalizeLine(resolveLine(film, line));
    if (!seen.has(L.id)) { seen.add(L.id); lines.push(L); }
  }
  const missing = lines.filter(L => !metaMatches(readMeta(ctx.cacheDir, L.id), L));
  if (missing.length && !ctx.apiKey) throw missingKeyError(missing, lines.length, ctx.cacheDir);

  const out = new Map(), failed = [], total = lines.length, onProgress = ctx.onProgress;
  let done = 0, next = 0;
  const worker = async () => {
    while (next < lines.length) {
      const L = lines[next++];
      const lctx = { ...ctx, onProgress: onProgress && (ev => onProgress({ ...ev, done, total })) };
      try {
        const v = await voiceOne(L, lctx);
        out.set(L.id, v); done++;
        onProgress?.({ id: L.id, who: L.who, text: L.text, status: v.cached ? 'cached' : 'done', qa: v.qa, dur: v.dur, done, total });
      } catch (e) {
        failed.push({ id: L.id, who: L.who, error: e.message }); done++;
        onProgress?.({ id: L.id, who: L.who, text: L.text, status: 'failed', error: e.message, done, total });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 2, lines.length)) }, worker));
  const voices = new Map(lines.filter(L => out.has(L.id)).map(L => [L.id, out.get(L.id)]));   // plan order, not completion order
  if (failed.length) {
    const err = new Error(`${failed.length} of ${total} voice line(s) failed:\n` + failed.map(f => `  ${f.id} ${f.who}: ${f.error}`).join('\n'));
    err.failed = failed; err.voices = voices;
    throw err;
  }
  return voices;
}
