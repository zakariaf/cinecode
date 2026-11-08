// Time formats, human-friendly durations, and a progress line for long renders (redrawn in place on a TTY, sparse lines otherwise).

/** Seconds → "0.4 s", "12.3 s", "5m 12s", "1h 02m". */
export function fmtDur(s) {
  if (!Number.isFinite(s)) return '–';
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  if (m < 60) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "m:ss.s" (or "h:mm:ss.s"). */
export function clock(t) {
  const s = Math.round(Math.max(0, t) * 10) / 10, h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s - 60 * Math.floor(s / 60);
  const ss = r.toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "12", "1:05", "1:05.5" or "01:02:03" → seconds. */
export function parseTime(v) {
  const parts = String(v).trim().split(':').map(Number);
  if (!parts.length || parts.some(p => !Number.isFinite(p))) throw new Error(`bad time "${v}"`);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const PHASES = { join: 'joining segments', mux: 'muxing audio and subtitles', verify: 'verifying with ffprobe' };

/** A progress reporter for renderVideo's onProgress. */
export function progressLine(label, { stream = process.stderr, width = 24 } = {}) {
  const tty = !!stream.isTTY;
  let lastPct = -10, lastPhase = 'frames', lastDraw = -Infinity, open = false;
  const clear = () => { if (open) { stream.write('\r\x1b[2K'); open = false; } };
  return {
    update(p) {
      if (p.phase !== 'frames') {
        if (p.phase !== lastPhase) { clear(); stream.write(`${label.padEnd(8)} ${PHASES[p.phase] || p.phase}…\n`); lastPhase = p.phase; }
        return;
      }
      const pct = p.total ? (100 * p.done) / p.total : 0, now = performance.now();
      if (tty) {
        if (now - lastDraw < 100 && p.done < p.total) return;
        lastDraw = now;
        const fill = Math.round((width * pct) / 100);
        const eta = p.done > 0 && p.done < p.total ? `  ETA ${fmtDur(p.eta)}` : '';
        stream.write(`\r\x1b[2K${label.padEnd(8)} [${'█'.repeat(fill)}${'░'.repeat(width - fill)}] ${pct.toFixed(0).padStart(3)}%  ${p.done}/${p.total} frames  ${p.fps.toFixed(1)} fps${eta}  ${p.jobs} job${p.jobs > 1 ? 's' : ''}`);
        open = true;
      } else if (pct - lastPct >= 10 || (p.done === p.total && lastPct < 100)) {
        lastPct = p.done === p.total ? 100 : Math.floor(pct / 10) * 10;
        stream.write(`${label.padEnd(8)} ${pct.toFixed(0).padStart(3)}%  ${p.done}/${p.total} frames  ${p.fps.toFixed(1)} fps\n`);
      }
    },
    done() { clear(); },
  };
}
