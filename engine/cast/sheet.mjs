// Cast sheet: for each rig, every pose, 4 phases of each gait, gesture key frames, each expression (head close-up),
// talk 0 / 0.5 / 1 and blink, labelled on light paper. castSheet(kinds, outPath, { debug }) → { path, width, height }.
import fs from 'node:fs';
import nodePath from 'node:path';
import { canvas, rng } from '../core/lib.mjs';
import { getRig, listRigs } from './index.mjs';

const CW = 168, CH = 158, COLS = 11, PAD = 24, HEAD = 34;

function paper(ctx, w, h) {
  ctx.fillStyle = '#f4eee0'; ctx.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < (w * h) / 900; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '120,100,70' : '255,255,255'},${0.03 + r() * 0.05})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
}

function cells(rig) {
  const C = [];
  for (const name of Object.keys(rig.poses)) C.push({ label: name, st: { pose: rig.poses[name] } });
  for (const [g, fn] of Object.entries(rig.gaits || {})) for (const ph of [0, 0.25, 0.5, 0.75]) C.push({ label: `${g} ${ph}`, st: { pose: fn(ph) }, tag: 'gait' });
  for (const [n, G] of Object.entries(rig.gestures || {})) {
    const keys = G.keys && G.keys.length ? G.keys.slice(0, 4) : [0.2, 0.4, 0.6, 0.8];
    for (const u of keys) C.push({ label: `${n} ${u}`, st: { pose: G.at(u, rig.poses.stand) }, tag: 'gesture' });
  }
  for (const e of rig.expressions) C.push({ label: e, st: { expr: e }, head: true });
  for (const k of [0, 0.5, 1]) C.push({ label: `talk ${k}`, st: { talk: k }, head: true });
  C.push({ label: 'blink 0.5', st: { blink: 0.5 }, head: true }, { label: 'blink 1', st: { blink: 1 }, head: true });
  return C;
}

export async function castSheet(kinds, outPath, opt = {}) {
  kinds = kinds && kinds.length ? kinds : listRigs();
  const rigs = kinds.map(k => { const r = getRig(k); if (!r) throw new Error(`castSheet: unknown rig "${k}"`); return r; });
  const blocks = rigs.map(r => ({ r, C: cells(r) }));
  const W = COLS * CW + PAD * 2;
  const H = blocks.reduce((h, b) => h + HEAD + Math.ceil(b.C.length / COLS) * CH + 18, PAD * 2);
  const [cv, ctx] = canvas(W, H), [, scratch] = canvas(4, 4);   // scratch: probe anchors without painting the sheet
  paper(ctx, W, H);
  let y0 = PAD;
  for (const { r, C } of blocks) {
    ctx.fillStyle = '#2a2130'; ctx.font = 'bold 22px Georgia, serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`${r.label}  ·  ${r.kind}`, PAD, y0 + HEAD / 2);
    ctx.font = '12px Georgia, serif'; ctx.fillStyle = '#6a5a60';
    ctx.fillText(`height ${r.height}  head ${r.headHeight}  width ${r.width}  ·  speeds ${JSON.stringify(r.speeds)}  stride ${JSON.stringify(r.stride)}`, PAD + 330, y0 + HEAD / 2);
    y0 += HEAD;
    const U = [Infinity, Infinity, -Infinity, -Infinity];
    for (const c of C) if (!c.head) { const b = r.bbox(c.st.pose, 1); U[0] = Math.min(U[0], b[0]); U[1] = Math.min(U[1], b[1]); U[2] = Math.max(U[2], b[2]); U[3] = Math.max(U[3], b[3]); }
    const sBody = Math.min((CH - 40) / Math.max(-U[1], 1), (CW - 16) / Math.max(U[2] - U[0], 1)), uMid = (U[0] + U[2]) / 2;
    C.forEach((c, i) => {
      const cx = PAD + (i % COLS) * CW, cy = y0 + Math.floor(i / COLS) * CH;
      ctx.save(); ctx.beginPath(); ctx.rect(cx + 2, cy + 2, CW - 4, CH - 4); ctx.clip();
      ctx.fillStyle = c.head ? 'rgba(255,250,240,.7)' : c.tag === 'gait' ? 'rgba(232,240,226,.55)' : c.tag === 'gesture' ? 'rgba(240,232,244,.5)' : 'rgba(255,255,255,.35)';
      ctx.fillRect(cx + 2, cy + 2, CW - 4, CH - 4);
      const st = { t: 0.4, ...c.st };
      if (c.head) {
        const s = (CH * 0.5) / Math.max(r.headHeight, 1), probe = r.draw(scratch, 0, 0, s, 1, { ...st, shadow: false });
        r.draw(ctx, cx + CW / 2 - probe.head[0], cy + CH / 2 - probe.head[1] + 4, s, 1, { ...st, shadow: false });
      } else {
        const gx = cx + CW / 2, gy = cy + CH - 24 - Math.max(0, U[3]) * sBody;
        const dx = -uMid * sBody;
        ctx.strokeStyle = 'rgba(120,100,80,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + 8, gy + 0.5); ctx.lineTo(cx + CW - 8, gy + 0.5); ctx.stroke();
        const res = r.draw(ctx, gx + dx, gy, sBody, 1, st);
        if (opt.debug) {
          ctx.strokeStyle = 'rgba(60,120,220,.5)'; ctx.setLineDash([3, 3]); const B = res.bounds; ctx.strokeRect(B[0], B[1], B[2] - B[0], B[3] - B[1]); ctx.setLineDash([]);
          ctx.fillStyle = '#d03030'; ctx.fillRect(res.head[0] - 1.5, res.head[1] - 1.5, 3, 3); ctx.fillStyle = '#2060d0'; ctx.fillRect(res.mouth[0] - 1.5, res.mouth[1] - 1.5, 3, 3);
          if (r.feet) for (const [fx, fy] of r.feet(st.pose)) { ctx.fillStyle = Math.abs(fy) < 0.5 ? '#20a040' : '#e0a020'; ctx.fillRect(gx + dx + fx * sBody - 2, gy + fy * sBody - 2, 4, 4); }
        }
      }
      ctx.restore();
      ctx.fillStyle = '#4a3a44'; ctx.font = '11px Georgia, serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(c.label, cx + 7, cy + CH - 7);
    });
    y0 += Math.ceil(C.length / COLS) * CH + 18;
  }
  fs.mkdirSync(nodePath.dirname(outPath), { recursive: true });
  const buf = /\.png$/i.test(outPath) ? await cv.encode('png') : await cv.encode('jpeg', 88);
  fs.writeFileSync(outPath, buf);
  return { path: outPath, width: W, height: H };
}
