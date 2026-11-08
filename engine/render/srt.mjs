// Soft subtitles: cues from the compiled plan, formatted as SubRip (.srt).

/** Seconds → "HH:MM:SS,mmm". */
export function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}

/** Break text into at most `maxLines` lines of about `width` characters, balanced. */
export function wrapText(text, width = 42, maxLines = 2) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const total = words.join(' ').length;
  if (total <= width) return [words.join(' ')];
  const n = Math.min(maxLines, Math.ceil(total / width)), target = total / n, lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && lines.length < n - 1 && (next.length > width || Math.abs(next.length - target) > Math.abs(cur.length - target))) { lines.push(cur); cur = w; }
    else cur = next;
  }
  lines.push(cur);
  return lines;
}

/**
 * Subtitle cues for a plan: its captions if it has any, otherwise its dialogue lines.
 * Shifted by `offset` seconds and clipped to [0, duration) when given. → [{ t0, t1, text }] sorted by time.
 */
export function subtitleCues(plan, { offset = 0, duration = Infinity } = {}) {
  const src = plan.captions?.length ? plan.captions : (plan.lines || []);
  return src
    .filter(c => c && String(c.text || '').trim() && c.t1 > c.t0)
    .map(c => ({ t0: c.t0 - offset, t1: Math.min(c.t1 - offset, duration), text: String(c.text).trim() }))
    .filter(c => c.t1 > 0 && c.t0 < duration)
    .map(c => ({ ...c, t0: Math.max(0, c.t0) }))
    .sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
}

/** Cues → SubRip text (CRLF-free, blank line between cues, trailing newline). */
export function toSrt(cues, { width = 42 } = {}) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.t0)} --> ${srtTime(c.t1)}\n${wrapText(c.text, width).join('\n')}\n`).join('\n');
}
