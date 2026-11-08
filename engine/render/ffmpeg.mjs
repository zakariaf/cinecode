// Thin wrappers around the ffmpeg / ffprobe binaries: run, probe, and the shared x264 settings.
import { spawn, spawnSync } from 'node:child_process';

export const FFMPEG = process.env.CINECODE_FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.CINECODE_FFPROBE || 'ffprobe';

/** Encoder settings shared by every segment. Segments are joined with `-c copy`, so they must match exactly. */
export function x264Args(fps, { crf = 17, preset = 'slow', threads = 0 } = {}) {
  return [
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-g', String(Math.round(fps * 2)),
    '-threads', String(threads),
    // RGB → BT.709 limited range with accurate chroma; tag the stream so players don't guess BT.601.
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,'
      + 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    '-pix_fmt', 'yuv420p',
  ];
}

export class FfmpegError extends Error {
  constructor(bin, args, code, stderr) {
    const tail = stderr.trim().split('\n').slice(-12).join('\n');
    super(`${bin} exited with code ${code}\n  args: ${args.join(' ')}\n${tail}`);
    this.code = code; this.stderr = stderr;
  }
}

/** Run a binary to completion. Resolves with { stdout: Buffer, stderr: string }; rejects with FfmpegError. */
export function run(bin, args, { input = null, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', e => reject(e.code === 'ENOENT' ? new Error(`${bin} not found on PATH (install ffmpeg)`) : e));
    p.on('close', code => {
      const stderr = Buffer.concat(err).toString();
      code === 0 ? resolve({ stdout: Buffer.concat(out), stderr }) : reject(new FfmpegError(bin, args, code, stderr));
    });
    if (input) p.stdin.end(input);
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], opts);

export function hasFfmpeg() {
  const ok = b => { try { return spawnSync(b, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } };
  return ok(FFMPEG) && ok(FFPROBE);
}

/**
 * Probe a media file. Counts video packets (exact frame count for our CFR streams).
 * → { duration, video: { codec, width, height, fps, frames, duration } | null, audio: { codec, sampleRate, channels, duration } | null, subtitles: n }
 */
export async function probe(path) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-count_packets', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_packets,duration,sample_rate,channels,pix_fmt:format=duration',
    '-of', 'json', path]);
  const j = JSON.parse(stdout.toString()), S = j.streams || [];
  const v = S.find(s => s.codec_type === 'video'), a = S.find(s => s.codec_type === 'audio');
  const rate = r => { const [n, d] = String(r || '0/1').split('/').map(Number); return d ? n / d : 0; };
  return {
    duration: Number(j.format?.duration) || 0,
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps: rate(v.r_frame_rate), frames: Number(v.nb_read_packets), duration: Number(v.duration) || 0, pixFmt: v.pix_fmt } : null,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, duration: Number(a.duration) || 0 } : null,
    subtitles: S.filter(s => s.codec_type === 'subtitle').length,
  };
}
