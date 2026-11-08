// Sets (painted layers with parallax), shots (camera + grade + actors), and shared screen effects.
import { rng, clamp, lerp, smooth, easeInOut, pick, canvas, blob, ink } from '../core/lib.mjs';

export const FW = 1920, FH = 1080, FONT = 'Georgia';
export const TWOS = t => Math.floor(t * 12) / 12;

// ───────────── sets ─────────────
export function makeSet(def) {
  const S = { ...def, built: false, L: [], skies: {}, blurred: new Map() };
  S.sAt = y => def.baseS * (y - def.horizon) / (def.laneY - def.horizon);
  S.build = () => {
    if (S.built) return; S.built = true;
    for (const [i, ly] of def.layers.entries()) {
      const span = Math.max(Math.abs(def.pan[0] - def.refX), Math.abs(def.pan[1] - def.refX));
      const mx = Math.ceil(span * Math.abs(1 - ly.k)) + 200, my = 260;
      const [c, x] = canvas(def.W + 2 * mx, def.H + 2 * my); x.translate(mx, my);
      ly.paint(x, rng(1000 + i * 77 + (def.seed || 0)), S);
      S.L.push({ ...ly, c, mx, my });
    }
  };
  S.sky = v => { if (!S.skies[v]) { const [c, x] = canvas(2600, 1500); def.skies[v](x, rng(500 + v.length), 2600, 1500, S); S.skies[v] = c; } return S.skies[v]; };
  const img = (ly, dof) => {
    if (!dof) return ly.c;
    const key = ly.c, b = S.blurred.get(key); if (b) return b;
    const [c, x] = canvas(ly.c.width, ly.c.height); x.filter = `blur(${dof}px)`; x.drawImage(ly.c, 0, 0); S.blurred.set(key, c); return c;
  };
  const drawLayers = (ctx, cam, front, sh) => {
    for (const ly of S.L) {
      if (!!ly.front !== front) continue;
      const dx = (cam.cx - def.refX) * (1 - ly.k), dy = (cam.cy - def.refY) * (1 - ly.k) * 0.4;
      ctx.drawImage(img(ly, (sh.dof && (front || ly.k < 0.98)) ? sh.dof : 0), -ly.mx + dx, -ly.my + dy);
    }
  };
  S.drawSky = (ctx, cam, sh, lt) => {
    const v = (typeof sh.sky === 'function' ? sh.sky(lt) : sh.sky) || def.defaultSky, list = Array.isArray(v) ? v : [[v, 1]];
    const z = 1 + (cam.s - 1) * 0.08, drift = (cam.cx - def.refX) * 0.06 + lt * (sh.skySpeed ?? 3);
    for (const [name, a] of list) {
      if (a <= 0) continue; const c = S.sky(name);
      ctx.save(); ctx.globalAlpha = a; ctx.setTransform(z, 0, 0, z, FW / 2 - (c.width / 2 + drift) * z, FH / 2 - (c.height / 2 + (cam.cy - def.refY) * 0.08) * z);
      ctx.drawImage(c, 0, 0); ctx.restore();
    }
  };
  S.drawBack = (ctx, cam, sh) => drawLayers(ctx, cam, false, sh);
  S.drawFront = (ctx, cam, sh) => drawLayers(ctx, cam, true, sh);
  return S;
}

// ───────────── grading and screen effects ─────────────
const GR = {
  dawn: { sl: [255, 196, 160, 0.38], mul: [246, 234, 240], vig: 0.36 },
  morning: { sl: [255, 232, 190, 0.22], mul: [255, 255, 255], vig: 0.3 },
  noon: { sl: [255, 246, 220, 0.12], mul: [255, 255, 252], vig: 0.28 },
  afternoon: { sl: [255, 214, 150, 0.32], mul: [255, 246, 232], vig: 0.32 },
  golden: { sl: [255, 168, 90, 0.46], mul: [255, 228, 198], vig: 0.36 },
  sunset: { sl: [255, 128, 80, 0.5], mul: [246, 198, 186], vig: 0.42 },
  twilight: { sl: [150, 120, 210, 0.4], mul: [178, 168, 212], vig: 0.48 },
  night: { sl: [90, 110, 210, 0.45], mul: [92, 102, 156], vig: 0.56 },
};
const mixG = (a, b, u) => ({ sl: a.sl.map((v, i) => lerp(v, b.sl[i], u)), mul: a.mul.map((v, i) => lerp(v, b.mul[i], u)), vig: lerp(a.vig, b.vig, u) });
let GRAIN;
export function grade(ctx, g, t) {
  if (!GRAIN) GRAIN = Array.from({ length: 4 }, (_, k) => {
    const [c, x] = canvas(960, 540), im = x.createImageData(960, 540), r = rng(800 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  });
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(${g.sl.slice(0, 3).map(Math.round).join(',')},${g.sl[3]})`; ctx.fillRect(0, 0, FW, FH);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${g.mul.map(Math.round).join(',')})`; ctx.fillRect(0, 0, FW, FH);
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(FW / 2, FH / 2, 420, FW / 2, FH / 2, 1300); v.addColorStop(0, 'rgba(30,25,45,0)'); v.addColorStop(1, `rgba(30,25,45,${g.vig})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, FW, FH);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.055; ctx.drawImage(GRAIN[Math.floor(t * 12) % 4], 0, 0, FW, FH);
  ctx.restore();
}
function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
export function caption(ctx, text, a) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.font = `italic 44px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, 1560), y0 = 1000 - (lines.length - 1) * 54;
  lines.forEach((l, i) => { ctx.shadowColor = 'rgba(15,10,8,.9)'; ctx.shadowBlur = 16; ctx.fillStyle = '#fff8e6'; ctx.fillText(l, FW / 2, y0 + i * 54); ctx.shadowBlur = 4; ctx.fillText(l, FW / 2, y0 + i * 54); });
  ctx.restore();
}
export function parchment(ctx, a) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(FW / 2, FH / 2, 200, FW / 2, FH / 2, 1150); g.addColorStop(0, '#f6ecd2'); g.addColorStop(1, '#d6bd8e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, FW, FH); ctx.restore();
}
export function cardText(ctx, a, lines) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [txt, size, y, col, style, glow] of lines) {
    ctx.font = `${style || ''} ${size}px ${FONT}`; ctx.fillStyle = col;
    if (glow) { ctx.shadowColor = 'rgba(15,10,8,.85)'; ctx.shadowBlur = 20; } else ctx.shadowBlur = 0;
    ctx.fillText(txt, FW / 2, y);
  }
  ctx.restore();
}
export function black(ctx, a) { if (a <= 0) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, FW, FH); ctx.restore(); }

// ───────────── world effects (drawn in world coordinates) ─────────────
export function motes(ctx, seed, n, x0, y0, w, h, t, a = 0.6) {
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#fff1cc';
  for (let i = 0; i < n; i++) { const r = rng(seed + i), sp = 0.3 + r() * 0.7, ph = r() * 6; ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(t * 2 * sp + ph)) ** 2; ctx.beginPath(); ctx.arc(x0 + r() * w + Math.sin(t * sp + ph) * 14, y0 + r() * h + Math.cos(t * sp * 0.8 + ph) * 10, 0.8 + r() * 1.8, 0, 7); ctx.fill(); }
  ctx.restore();
}
export function dust(ctx, t, t0, x0, yAt, dir = 1, n = 12, size = 1) {
  ctx.save();
  for (let k = 0; k < n; k++) {
    const age = t - t0 - k * 0.035; if (age <= 0 || age > 1.3) continue;
    const r = rng(k + Math.round(t0 * 10)), px = x0 - dir * k * 16 * size + (r() - 0.5) * 20, py = yAt(px) - 4 - age * 30 * size - r() * 10;
    ctx.globalAlpha = 0.7 * (1 - age / 1.3); ctx.fillStyle = pick(r, ['#e8d9b2', '#dccb9f', '#f1e6c8']);
    blob(ctx, px, py, (10 + 46 * age) * size, (10 + 46 * age) * 0.7 * size, 0, r, 8);
  }
  ctx.restore();
}
export function splash(ctx, t, t0, x, y, s = 1) {
  const age = t - t0; if (age < 0 || age > 1.2) return;
  ctx.save(); ctx.strokeStyle = `rgba(235,248,250,${0.8 * (1 - age / 1.2)})`; ctx.lineWidth = 2.2;
  for (let k = 0; k < 3; k++) { const a2 = age - k * 0.18; if (a2 <= 0) continue; const rx = (10 + 70 * a2) * s; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, 7); ctx.stroke(); }
  ctx.fillStyle = 'rgba(235,248,252,.9)';
  for (let i = 0; i < 16; i++) { const r = rng(900 + i), vx = (r() - 0.5) * 160 * s, vy = -(90 + r() * 150) * s, px = x + vx * age, py = y + vy * age + 380 * s * age * age; if (py > y + 2) continue; ctx.globalAlpha = 1 - age / 1.2; ctx.beginPath(); ctx.arc(px, py, 2.4 * s, 0, 7); ctx.fill(); }
  ctx.restore();
}
export function zzz(ctx, head, t, s = 1) {
  ctx.save(); ctx.font = `italic bold ${Math.round(28 * s)}px ${FONT}`; ctx.lineWidth = 3 * s; ctx.strokeStyle = 'rgba(60,50,80,.8)'; ctx.fillStyle = '#fbf6ea';
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.5 + k / 3) % 1, sc = 0.6 + ph * 0.9;
    ctx.globalAlpha = Math.sin(Math.PI * ph); ctx.save(); ctx.translate(head[0] + (14 + ph * 50) * s, head[1] - (24 + ph * 80) * s); ctx.scale(sc, sc);
    ctx.strokeText('z', 0, 0); ctx.fillText('z', 0, 0); ctx.restore();
  }
  ctx.restore();
}
export function speedLines(ctx, x, y, face, t, s = 1) {
  const r = rng(Math.floor(t * 12) + 5); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5 * s;
  for (let i = 0; i < 9; i++) { const yy = y - (10 + r() * 90) * s, x0 = x - face * (50 + r() * 40) * s, len = (80 + r() * 180) * s; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - face * len, yy); ctx.stroke(); }
  ctx.restore();
}
export function fireflies(ctx, seed, n, x0, y0, w, h, t, a = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r = rng(seed + i), ph = r() * 6, x = x0 + r() * w + Math.sin(t * 0.7 + ph) * 30, y = y0 + r() * h + Math.cos(t * 0.5 + ph) * 18;
    const g = a * Math.max(0, Math.sin(t * (1 + r()) + ph)) ** 2; if (g < 0.02) continue;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, `rgba(230,255,150,${g})`); gr.addColorStop(1, 'rgba(180,255,100,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - 14, y - 14, 28, 28);
  }
  ctx.restore();
}
export function leaves(ctx, seed, n, x0, y0, w, t, cols = ['#9aa64f', '#c2b45a', '#7f9446', '#d0a85a'], fall = 55) {
  const tq = TWOS(t);
  for (let i = 0; i < n; i++) {
    const r = rng(seed + i), s = 6 + r() * 7, ph = r() * 6, life = 6 + r() * 4, age = (tq + r() * life) % life;
    const x = x0 + r() * w - 30 * age + 36 * Math.sin(age * 1.2 + ph), y = y0 + fall * age;
    const flip = Math.cos(age * 2.4 + ph) > 0 ? 1 : -1, rt = Math.sin(age * 1.6 + ph) * 1.2;
    ctx.save(); ctx.globalAlpha = Math.min(1, age, life - age); ctx.translate(x, y); ctx.rotate(rt); ctx.scale(s * flip, s);
    ctx.fillStyle = pick(r, cols); ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(0, -0.42, 1, 0); ctx.quadraticCurveTo(0, 0.42, -1, 0); ctx.fill();
    ctx.restore();
  }
}

// ───────────── acts ─────────────
// shot: { d, set, sky, cam: [[cx,cy,s],[cx,cy,s]], grade: 'name' | ['a','b'], dof, draw(ctx, lt, sh), front(ctx, lt, sh), screen(ctx, lt, sh) }
export function makeAct(shots, captions = []) {
  let t0 = 0; for (const s of shots) { s.t0 = t0; t0 += s.d; }
  const duration = t0;
  return {
    duration,
    build() { for (const s of shots) s.set?.build(); },
    frame(ctx, t) {
      let i = 0; while (i + 1 < shots.length && shots[i + 1].t0 <= t) i++;
      const sh = shots[i], lt = t - sh.t0, u = clamp(lt / sh.d), e = (sh.ease || easeInOut)(u);
      const cam = { cx: lerp(sh.cam[0][0], sh.cam[1][0], e), cy: lerp(sh.cam[0][1], sh.cam[1][1], e), s: lerp(sh.cam[0][2], sh.cam[1][2], e) };
      if (sh.camFn) Object.assign(cam, sh.camFn(lt, cam));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, FW, FH);
      if (sh.set) {
        sh.set.drawSky(ctx, cam, sh, lt);
        ctx.setTransform(cam.s, 0, 0, cam.s, FW / 2 - cam.cx * cam.s, FH / 2 - cam.cy * cam.s);
        sh.set.drawBack(ctx, cam, sh);
        sh.draw?.(ctx, lt, sh, cam);
        ctx.setTransform(cam.s, 0, 0, cam.s, FW / 2 - cam.cx * cam.s, FH / 2 - cam.cy * cam.s);
        sh.set.drawFront(ctx, cam, sh);
        sh.front?.(ctx, lt, sh, cam);
        const g = typeof sh.grade === 'function' ? sh.grade(lt, u) : sh.grade;
        const G = Array.isArray(g) ? mixG(GR[g[0]], GR[g[1]], g[2] ?? u) : GR[g || 'morning'];
        grade(ctx, G, t);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      sh.screen?.(ctx, lt, sh);
      for (const [a, b, text] of captions) if (t > a && t < b) caption(ctx, text, Math.min(smooth(a, a + 0.4, t), 1 - smooth(b - 0.4, b, t)));
      if (sh.fadeIn) black(ctx, 1 - smooth(0, sh.fadeIn, lt));
      if (sh.fadeOut) black(ctx, smooth(sh.d - sh.fadeOut, sh.d, lt));
    },
  };
}
