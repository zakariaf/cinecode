// A spacing chart: one dot per frame for the head, hands (fore paws), hips and feet of one actor over a stretch
// of a scene, so easing, arcs and hitches can be judged without playback. Three panels: from above; from the
// side, along the way it travels; and height against time. Every sixth frame (a quarter second) is ringed.
// Posing only: no GPU.
//   node engine/scene3d/tools/spacing.mjs engine/scene3d/scenes/zero.mjs man 0-3 FILE.png
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import { open } from './scene.mjs';

const [file, who, range, outFile] = process.argv.slice(2);
const src = await open(file, '64x36'), THREE = src.stage.THREE;
const [a, b] = range.split('-').map(Number), fps = src.fps;
const ch = src.built.cast[who].ch, four = ch.desc.kind === 'quadruped';
const J = four
  ? [['head', 'head', '#d0453a'], ['fore paw L', 'fPawL', '#2f8f4e'], ['fore paw R', 'fPawR', '#7cc47f'], ['hips', 'hips', '#7a4fb8'], ['hind foot L', 'hFootL', '#2667b8'], ['hind foot R', 'hFootR', '#79a8e0']]
  : [['head', 'head', '#d0453a'], ['hand L', 'handL', '#2f8f4e'], ['hand R', 'handR', '#7cc47f'], ['hips', 'pelvis', '#7a4fb8'], ['foot L', 'footL', '#2667b8'], ['foot R', 'footR', '#79a8e0']];
const frames = [];
for (let f = Math.round(a * fps); f <= Math.round(b * fps); f++) {
  const t = f / fps; src.built.update(t);
  frames.push({ t, f, p: J.map(([, bone]) => ch.bones[bone].getWorldPosition(new THREE.Vector3()).toArray()) });
}
// the way it travels: from where the hips start to where they end (or +x, if they hardly move)
const h0 = frames[0].p[3], h1 = frames[frames.length - 1].p[3];
let ux = h1[0] - h0[0], uz = h1[2] - h0[2]; const ul = Math.hypot(ux, uz);
if (ul < 0.2) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
const along = (p) => (p[0] - h0[0]) * ux + (p[2] - h0[2]) * uz;

const W = 1950, H = 680, M = 50, PW = (W - 4 * M) / 3, PH = H - 2 * M - 40;
const cv = createCanvas(W, H), g = cv.getContext('2d');
g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
g.font = '16px sans-serif'; g.fillStyle = '#333';
g.fillText(`${who}, ${a}-${b} s, one dot per frame (${fps} fps); ringed every 0.25 s`, M, 28);
J.forEach(([name, , col], i) => { g.fillStyle = col; g.fillRect(M + 520 + i * 150, 16, 14, 14); g.fillStyle = '#333'; g.fillText(name, M + 540 + i * 150, 28); });
const panels = [
  ['from above (x across, z down)', (p) => [p[0], p[2]], true],
  ['from the side, along the way it goes (height up)', (p) => [along(p), -p[1]], true],
  ['height (up) against time (across)', (p, t) => [t, -p[1]], false],
];
panels.forEach(([title, map, same], k) => {
  const x0 = M + k * (PW + M), y0 = M + 30;
  g.strokeStyle = '#ccc'; g.strokeRect(x0, y0, PW, PH);
  g.fillStyle = '#555'; g.fillText(title, x0, y0 - 8);
  const pts = frames.flatMap((fr) => fr.p.map((p) => map(p, fr.t)));
  let [xa, xb, ya, yb] = [Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[1]))];
  const pad = 0.05 * Math.max(xb - xa, yb - ya, 0.1); xa -= pad; xb += pad; ya -= pad; yb += pad;
  let sx = PW / (xb - xa), sy = PH / (yb - ya);
  if (same) { const s = Math.min(sx, sy); sx = sy = s; }
  const X = (v) => x0 + (v - xa) * sx, Y = (v) => y0 + (v - ya) * sy;
  // a 10 cm grid where the scale is the same both ways
  if (same) { g.strokeStyle = '#eee'; for (let v = Math.ceil(xa * 10) / 10; v < xb; v += 0.1) { g.beginPath(); g.moveTo(X(v), y0); g.lineTo(X(v), Math.min(y0 + PH, Y(yb))); g.stroke(); } for (let v = Math.ceil(ya * 10) / 10; v < yb; v += 0.1) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(Math.min(x0 + PW, X(xb)), Y(v)); g.stroke(); } }
  J.forEach(([, , col], j) => {
    g.strokeStyle = col + '55'; g.beginPath();
    frames.forEach((fr, i) => { const [u, v] = map(fr.p[j], fr.t); if (i) g.lineTo(X(u), Y(v)); else g.moveTo(X(u), Y(v)); }); g.stroke();
    frames.forEach((fr) => {
      const [u, v] = map(fr.p[j], fr.t);
      g.fillStyle = col; g.beginPath(); g.arc(X(u), Y(v), 2.6, 0, 7); g.fill();
      if (fr.f % 6 === 0) { g.strokeStyle = col; g.beginPath(); g.arc(X(u), Y(v), 5.5, 0, 7); g.stroke(); }
    });
  });
  if (same) { g.fillStyle = '#888'; g.fillText('grid: 10 cm', x0 + 6, y0 + PH - 8); }
  else { g.fillStyle = '#888'; for (let t = Math.ceil(a * 4) / 4; t <= b; t += 0.25) g.fillText(t.toFixed(2), X(t) - 14, y0 + PH + 18); }
});
fs.writeFileSync(outFile, cv.toBuffer(outFile.endsWith('.jpg') ? 'image/jpeg' : 'image/png'));
console.log('wrote', outFile);
