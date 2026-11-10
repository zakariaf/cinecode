// clouddive: a flight down into a planet's cloud deck. Soft, inked gouache billows and long streaks at many depths,
// from the planet's cloud tops to just short of the lens, so a dolly (`zTo`) passes through them in parallax. While the
// camera is far they lie within the globe's disc, in the colours of the bands under them and shaded like the globe,
// so they read as the planet's own cloud deck; as it nears they swell, resolve into lit billows and spread until cloud
// fills the frame. Their colours go from `col` toward `deep` as the beat goes on (`darken`), the globe under them with
// them; an optional glow from below (`glow`) rises from `glowAt`, lighting the billows' undersides and the bottom of the
// frame. Light from the upper left. A ringed planet's near rings stay in front of the clouds, untouched.
//
// A custom beat on the planet; give it the shot's length and "scope": "shot", "hold": false:
//   { "do": "custom", "name": "clouddive", "who": "venus", "darken": 1, "glow": [255, 112, 34], "glowAt": 0.45,
//     "at": 0, "dur": 9, "hold": false, "scope": "shot" }
// with a camera that flies in: Venus 3.3 { "size": "full", "on": ["venus"], "move": "push-in", "zoomTo": 4, "z": 0,
// "zTo": 1200 }; Saturn 8.4 { "size": "full", "on": ["saturn"], "focus": [0.38, 0.58], "zoom": 1.42, "z": 0, "zTo": 1500 }.
// The pieces at depth are laid out for the shot's camera from the beat's start to its end or the cut, whichever is
// first, and the beat's darkening and glow run over that span too (a beat longer than its shot finishes at the cut).
//
// Params: who (the planet actor, required); col, deep (the light and the dark cloud colour, "#rrggbb" or [r, g, b];
// default: from the planet's bands: col their mean, deep their darkest, darkened warm); darken (0..1, how far toward
// deep by the end, default 0.5); glow (the light from below, "#rrggbb" or [r, g, b]; default none); glowAt (0..1 of the
// beat, when it starts to rise, default 0.4); n (billows and streaks at depth, default 70; the deck is a field of its
// own); speed (their drift, default 1); dir (1: they drift left to right along the bands, default; -1: right to left).
// Layer `depth`: the deck (the globe darkening, a haze past the limb as the camera arrives, and billows from big to
// small) is one piece just in front of the globe; the glow from below another; every billow and streak at depth is a
// piece at its own depth; the near rings are laid back over them last.
import { rng, clamp, lerp, smooth, ink } from 'cinecode/lib';
import { globeOf } from 'cinecode/paint/planets';

const TAU = Math.PI * 2;
const L = [-Math.SQRT1_2, -Math.SQRT1_2];   // toward the light on screen, as the planet painter has it
const NEAR = 0.07;   // the nearest pieces lie this many lenses from the nearest camera (the lens pass starts at 0.04)
const NG = 25;       // camera samples over the beat
const DECK0 = 0.62, OCT = 9;   // the deck's biggest billows (globe radii) and its octaves, each half the last

const rgb = c => {
  if (Array.isArray(c)) return c.slice(0, 3).map(Number);
  let s = String(c).trim().replace('#', '');
  if (s.length === 3) s = [...s].map(x => x + x).join('');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) || 0);
};
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const times = (a, f) => [a[0] * f[0], a[1] * f[1], a[2] * f[2]];
const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${clamp(a).toFixed(3)})`;
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const path = (c, P) => { c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const hash = (...v) => { let h = 0x9e3779b1; for (const x of v) { h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13; } return h >>> 0; };

// The globe's shading (planets.mjs drawBody: a soft fall-off from the upper-left light, the hard lavender crescent, a
// soft highlight) as a colour factor at a point of the screen, so a billow on the globe takes the shade under it.
const STOPS = [[0, [255, 255, 255]], [0.5, [246, 240, 236]], [0.82, [150, 132, 170]], [1, [70, 58, 104]]];
function shadeAt(g, x, y) {
  const d = Math.hypot(x - (g.sc[0] + L[0] * g.sR * 0.55), y - (g.sc[1] + L[1] * g.sR * 0.55)) / g.sR, t = clamp((d - 0.1) / 1.45);
  let i = 1; while (i < STOPS.length - 1 && t > STOPS[i][0]) i++;
  const [ta, ca] = STOPS[i - 1], [tb, cb] = STOPS[i], f = mix(ca, cb, clamp((t - ta) / (tb - ta)));
  const [u, v] = rot([x - g.sc[0], y - g.sc[1]], -g.roll), nu = u / g.sR, nv = v / (g.sR * g.ob);
  if (nu * nu + nv * nv < 1 && Math.hypot(nu - L[0] * 0.2, nv - L[1] * 0.2) > 1) { f[0] *= 195 / 255; f[1] *= 184 / 255; f[2] *= 220 / 255; }
  const h = 0.22 * clamp(1 - Math.hypot(nu - L[0] * 0.5, nv - L[1] * 0.5) / 0.7);
  return f.map(v2 => v2 / 255 + (1 - v2 / 255) * h);
}

// A billow as one path: its lumps [x, y, r] and its base ellipse [x, y, rx, ry], all wound the same way, so a fill or a
// clip (nonzero) is their union; the lumps moved by sh and scaled by k; toS maps unit coordinates to the screen.
function unionPath(c, lumps, base, toS, px, flat, roll, sh = [0, 0], k = 1) {
  c.beginPath();
  for (const [x, y, r] of lumps) { const [qx, qy] = toS([x + sh[0], y + sh[1]]); c.moveTo(qx + Math.cos(roll) * r * k * px, qy + Math.sin(roll) * r * k * px); c.ellipse(qx, qy, r * k * px, r * k * px * flat, roll, 0, TAU); }
  const [ex, ey, rx, ry] = base, [qx, qy] = toS([ex + sh[0], ey + sh[1]]);
  c.moveTo(qx + Math.cos(roll) * rx * k * px, qy + Math.sin(roll) * rx * k * px); c.ellipse(qx, qy, rx * k * px, ry * k * px * flat, roll, 0, TAU);
}
// The billowed top of a billow, for its ink: each lump's edge where nothing else covers it and above the base, as runs
// of points in order along it (unit coordinates).
function topRuns(lumps, base) {
  const [ex, ey, rx, ry] = base, runs = [];
  const covered = (x, y, skip) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 < 1.02 || lumps.some(([cx, cy, r], i) => i !== skip && (x - cx) ** 2 + (y - cy) ** 2 < r * r * 0.995);
  lumps.forEach(([cx, cy, r], i) => {
    const m = Math.max(12, Math.round(r * 260)), keep = [];
    for (let j = 0; j < m; j++) { const a = Math.PI + (j / m) * Math.PI, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; keep.push(!covered(x, y, i) && y < -0.03 ? [x, y] : null); }
    let run = [];
    for (const q of [...keep, null]) { if (q) run.push(q); else { if (run.length >= 3) runs.push(run); run = []; } }
  });
  return runs;
}

// A bank of billows, 1 wide and about 0.3 high: a row of lumps of every size along its base and a crown of a few
// bigger ones heaped up here and there.
function bank(r) {
  const nl = 6 + Math.floor(r() * 5), nt = 2 + Math.floor(r() * 4), lumps = [], peak = (r() - 0.5) * 0.5, wide = 0.25 + 0.35 * r();
  for (let i = 0; i < nl; i++) {
    const x = lerp(-0.42, 0.42, i / (nl - 1)) + (r() - 0.5) * 0.06, rad = 0.05 + 0.07 * r() + 0.03 * Math.exp(-(((x - peak) / wide) ** 2));
    lumps.push([x, -rad * 0.35, rad]);
  }
  for (let j = 0; j < nt; j++) {
    const x = peak + (r() - 0.5) * 2 * wide, h = Math.exp(-(((x - peak) / wide) ** 2)), rad = (0.06 + 0.06 * r()) * (0.7 + 0.5 * h);
    if (Math.abs(x) < 0.38) lumps.push([x, -0.05 - rad * 0.5 - 0.06 * h, rad]);
  }
  return { lumps, base: [0, 0, 0.45, 0.05], fade: 0.45 + 0.25 * r() };
}

// One billow bank on screen: centre (cx, cy), px wide, turned by roll, `flat` its height factor; c0 its colour in full
// light, sh the globe's shade over it, con 0..1 how much its modelling shows (a far one is a flat patch of the band it
// lies in), a its opacity; glow { col, k } light from below; soft 0..1: out of focus (near the lens). Gouache: lit tops
// toward the upper left, a warm shade at the lower right, the underside darker and then fading out into what lies below;
// the billowed top inked. Out of focus it is soft lumps of shade and light with no line, crossfaded in as it nears.
function drawBank(c, shape, cx, cy, px, roll, flat, c0, sh, con, a, glow, soft01, seed, W, H) {
  const toS = ([x, y]) => { const [rx, ry] = rot([x * px, y * px * flat], roll); return [cx + rx, cy + ry]; };
  const base = times(c0, sh), lit = times(mix(c0, [255, 246, 226], 0.3 * con), sh), dark = times(times(c0, [1 - 0.17 * con, 1 - 0.25 * con, 1 - 0.28 * con]), sh);
  const [ax, ay] = toS([0, -0.26]), [bx, by] = toS([0, 0.055]), Lu = rot(L, -roll);
  // a fill down the bank's axis: whole over its billows, fading out under its base
  const soft = (col, k = 1) => { const gr = c.createLinearGradient(ax, ay, bx, by); gr.addColorStop(0, css(col, k)); gr.addColorStop(shape.fade, css(col, k)); gr.addColorStop(1, css(col, 0)); return gr; };
  // the belly: a darker band above the fade, warm where the glow from below reaches it
  const belly = (col, k) => { const gr = c.createLinearGradient(ax, ay, bx, by); gr.addColorStop(shape.fade - 0.2, css(col, 0)); gr.addColorStop(shape.fade + 0.14, css(col, k)); gr.addColorStop(1, css(col, 0)); return gr; };
  if (soft01 > 0.01) {
    // out of focus: every lump a soft disc of shade, then of light moved toward the light, then the glow under it
    c.save(); c.globalAlpha *= a * soft01;
    const lumps = [...shape.lumps, [-0.3, 0, 0.09], [0, 0.01, 0.1], [0.3, 0, 0.09]];
    const disc = (x, y, R, col, k0) => { const gr = c.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, css(col, k0)); gr.addColorStop(0.5, css(col, k0 * 0.8)); gr.addColorStop(1, css(col, 0)); c.fillStyle = gr; c.fillRect(x - R, y - R, 2 * R, 2 * R); };
    for (const [x, y, rad] of lumps) { const [qx, qy] = toS([x, y]); disc(qx, qy, rad * px * 1.4, dark, 0.85); }
    for (const [x, y, rad] of shape.lumps) { const [qx, qy] = toS([x + Lu[0] * rad * 0.3, y + Lu[1] * rad * 0.3]); disc(qx, qy, rad * px * 1.15, base, 0.8); }
    if (glow && glow.k > 0.002) { c.globalCompositeOperation = 'screen'; for (const [x, y, rad] of lumps) { const [qx, qy] = toS([x, y + rad * 0.6]); disc(qx, qy, rad * px * 1.1, glow.col, glow.k * 0.6); } }
    c.restore();
    if (soft01 > 0.99) return;
  }
  const union = (shift, k) => unionPath(c, shape.lumps, shape.base, toS, px, flat, roll, shift, k);
  c.save(); c.globalAlpha *= a * Math.pow(1 - soft01, 0.7);
  c.fillStyle = soft(dark); union(); c.fill();
  c.save(); union(); c.clip();
  // the lit side: the lumps moved toward the light (the shade is the rim they leave at the lower right)
  c.fillStyle = soft(base); union([Lu[0] * 0.035, Lu[1] * 0.045], 0.95); c.fill();
  if (con > 0.1 && px > 60) for (const [x, y, rad] of shape.lumps) {
    const [hx, hy] = toS([x + Lu[0] * rad * 0.3, y + Lu[1] * rad * 0.45]), R = rad * px * 0.9, hg = c.createRadialGradient(hx, hy, 0, hx, hy, R);
    hg.addColorStop(0, css(lit, 0.85 * con * smooth(0.1, 0.3, con))); hg.addColorStop(1, css(lit, 0));
    c.fillStyle = hg; c.fillRect(hx - R, hy - R, 2 * R, 2 * R);
  }
  c.fillStyle = belly(times(dark, [0.84, 0.78, 0.76]), 0.55 * con); c.fillRect(0, 0, W, H);
  if (glow && glow.k > 0.002) { c.globalCompositeOperation = 'screen'; c.fillStyle = belly(glow.col, glow.k); c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
  c.restore();
  // ink along the billowed top only, each lump's open arc tapering at both ends
  if (con > 0.2 && px > 100) {
    const w = clamp(px * 0.0045, 1, 3) * H / 1080, col = `rgba(66,44,40,${(0.5 * smooth(0.2, 0.75, con)).toFixed(3)})`;
    (shape.runs ||= topRuns(shape.lumps, shape.base)).forEach((run, i) => ink(c, run.map(toS), w, { closed: false, seed: (seed + i) % 97, color: col }));
  }
  c.restore();
}

// A long streak along the bands: px long, a lens a tenth as thick, tapering at both ends, soft across it.
function drawStreak(c, cx, cy, px, roll, col, a, seed) {
  const m = 30, top = [], bot = [], ph = (seed % 100) / 10;
  for (let j = 0; j <= m; j++) { const x = -0.5 + j / m, th = Math.pow(Math.sin((Math.PI * j) / m), 0.8); top.push([x, -0.05 * th * (1 + 0.3 * Math.sin(9 * x + ph))]); bot.push([x, 0.028 * th * (1 + 0.25 * Math.sin(7 * x - ph))]); }
  const pts = [...top, ...bot.reverse()].map(([x, y]) => { const [rx, ry] = rot([x * px, y * px], roll); return [cx + rx, cy + ry]; });
  const [ax, ay] = rot([0, -0.05 * px], roll), [bx, by] = rot([0, 0.03 * px], roll), gr = c.createLinearGradient(cx + ax, cy + ay, cx + bx, cy + by);
  gr.addColorStop(0, css(col, 0)); gr.addColorStop(0.45, css(col, 1)); gr.addColorStop(1, css(col, 0));
  c.save(); c.globalAlpha *= a;
  c.fillStyle = gr; path(c, pts); c.fill(); c.restore();
}

export const custom = {
  clouddive: {
    layer: 'depth',
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g) return;
      const W = api.W, H = api.H, sh = api.shot, D = api.cam.lens ?? api.set.lens;
      // the beat's span in this shot: its progress runs to its end or to the cut, whichever is first
      const b0 = api.t - (api.bt ?? 0), tA = Math.max(sh.t0, b0), tB = Math.max(tA + 1e-3, Math.min(sh.t1, b0 + (api.dur || 1)) - 1e-3);
      const ue = clamp((api.t - tA) / (tB - tA)), bt = api.t - tA;
      const env = smooth(0, 0.05, ue);
      if (env <= 0.001) return;

      // colours: col (light) → deep (dark). The bands give each billow its own light colour; the darkening is the ratio
      // deep / col laid over every colour (the globe's too), so the bands darken with the clouds.
      const B = g.B, bands = [...(B.bands || [])].sort((a, b) => a[0] - b[0]);
      const pal = [B.base, ...bands.map(b => b[1])].map(rgb);
      const mean = pal.reduce((s, c) => [s[0] + c[0] / pal.length, s[1] + c[1] / pal.length, s[2] + c[2] / pal.length], [0, 0, 0]);
      const darkest = pal.reduce((a, c) => (lum(c) < lum(a) ? c : a));
      const col = p.col ? rgb(p.col) : mean.map(v => lum(mean) + (v - lum(mean)) * 1.25), deep = p.deep ? rgb(p.deep) : [darkest[0] * 0.6, darkest[1] * 0.48, darkest[2] * 0.3];
      const ratio = [0, 1, 2].map(i => clamp(deep[i] / Math.max(1, col[i]), 0, 1.2));
      const kd = clamp(p.darken ?? 0.5) * smooth(0.04, 0.96, ue);
      const darkBy = k => [lerp(1, ratio[0], k), lerp(1, ratio[1], k), lerp(1, ratio[2], k)];
      const bandAt = sp => { let c = B.base; for (const [s, cc] of bands) if (sp >= s) c = cc; return rgb(c); };
      const Bo = B.rings ? (B.tilt || 0) : (B.axis || 0);
      // a point of the globe (globe radii, its rolled frame) → its band, toward col as its billow resolves
      const colourAt = (nu, nv, con) => { const Z = Math.sqrt(Math.max(0, 1 - nu * nu - nv * nv)); return mix(bandAt(-nv * Math.cos(Bo) + Z * Math.sin(Bo)), col, 0.3 * con); };
      const glowCol = p.glow ? rgb(p.glow) : null, ga = p.glowAt ?? 0.4, kg = glowCol ? smooth(ga, Math.min(1, ga + 0.5), ue) : 0;
      const glowAt = (y, f) => (kg > 0 ? { col: glowCol, k: 0.8 * kg * lerp(0.08, 1.1, Math.pow(clamp(y / H), 1.6)) * (1.05 - 0.45 * f) } : null);
      const dir = (p.dir ?? 1) < 0 ? -1 : 1, speed = p.speed ?? 1, n = Math.round(p.n ?? 70);
      // how a billow shows at a size on screen: its modelling (con) and its opacity
      const conOf = px => Math.pow(smooth(0.1 * H, 0.65 * H, px), 0.8);

      // the shot's camera over the beat, and the scale of a depth z as a camera sees it
      const cams = Array.from({ length: NG }, (_, i) => sh.cameraAt(tA + (i / (NG - 1)) * (tB - tA)));
      const scale = (c, z) => c.zoom * ((D - (c.z || 0)) / (D + z - (c.z || 0)));
      const cam0 = cams[0], cNear = Math.max(...cams.map(c => c.z || 0));
      const zDeck = g.z - 0.5, dDeck = D + zDeck - cNear, dNear = Math.min(NEAR * D, dDeck * 0.9);
      const zAt = f => cNear - D + Math.exp(lerp(Math.log(dDeck), Math.log(dNear), f));
      const zMin = zAt(1);
      const sg0 = scale(cam0, g.z), g0 = [(g.c[0] - cam0.cx) * sg0 + W / 2, (g.c[1] - cam0.cy) * sg0 + H / 2], sR0 = g.R * sg0;
      const toGlobe = ([x, y], c, R) => { const [a, b] = rot([x - c[0], y - c[1]], -g.roll); return [a / R, b / (R * g.ob)]; };
      // as the camera arrives the deck reaches past the limb, a haze swallowing it (none while the globe is in frame)
      const reach = 0.6 * smooth(1, 1.5, g.sR / H);
      // the globe's shading over the clouds, while it is a globe; once inside its deck, the light of the frame
      const flatten = 0.75 * smooth(0.6, 1.4, g.sR / H), shade = (x, y, k = 0) => mix(shadeAt(g, x, y), [1, 1, 1], Math.max(flatten, k));
      // while it is a globe, a cloud fades out where the globe's own shade falls off toward its night side (a flat-shaded
      // patch there would show its edge)
      const limbFade = (x, y) => lerp(1, 1 - smooth(0.75, 1.25, Math.hypot(x - (g.sc[0] + L[0] * g.sR * 0.55), y - (g.sc[1] + L[1] * g.sR * 0.55)) / g.sR), 1 - flatten / 0.75);

      // 1. the deck, just in front of the globe: the globe darkens, the haze past the limb, then billows from the
      // biggest to the smallest, each octave laid in rows along the bands, top row first
      api.item([g.c[0], g.c[1], zDeck], (c, P) => {
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = env;
        const R = g.sR, sd = P.s, Rw = g.R;
        if (kd > 0.002) {
          c.save(); c.beginPath(); c.ellipse(g.sc[0], g.sc[1], R * 1.004, R * g.ob * 1.004, g.roll, 0, TAU); c.clip();
          c.globalCompositeOperation = 'multiply'; c.fillStyle = css(darkBy(kd).map(k => 255 * k)); c.fillRect(0, 0, W, H); c.restore();
        }
        if (reach > 0.01) {
          c.save(); c.translate(g.sc[0], g.sc[1]); c.rotate(g.roll); c.scale(1, g.ob);
          const hz = c.createRadialGradient(0, 0, R * 0.96, 0, 0, R * (1 + reach)), dc = Math.hypot(W / 2 - g.sc[0], H / 2 - g.sc[1]) || 1, hc = times(times(col, darkBy(kd)), shade(g.sc[0] + ((W / 2 - g.sc[0]) / dc) * R * 0.97, g.sc[1] + ((H / 2 - g.sc[1]) / dc) * R * 0.97));
          hz.addColorStop(0, css(hc, 0.95)); hz.addColorStop(0.5, css(hc, 0.75)); hz.addColorStop(1, css(hc, 0));
          c.fillStyle = hz; c.beginPath(); c.arc(0, 0, R * (1 + reach), 0, TAU); c.arc(0, 0, R * 0.95, 0, TAU, true); c.fill(); c.restore();
        }
        // the view at the deck's depth in the globe's rolled frame (world px from its centre)
        const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => rot([(x - g.sc[0]) / sd, (y - g.sc[1]) / sd], -g.roll));
        const va = [Math.min(...corners.map(q => q[0])), Math.max(...corners.map(q => q[0]))], vb = [Math.min(...corners.map(q => q[1])), Math.max(...corners.map(q => q[1]))];
        const rmax = 0.93 + reach;
        for (let k = 0; k < OCT; k++) {
          const w = Rw * DECK0 * Math.pow(0.5, k), px = w * sd;
          if (px > 3.2 * H) continue;
          if (px < 0.12 * H) break;
          const con = conOf(px), aK = smooth(0.12 * H, 0.24 * H, px) * (1 - smooth(2.4 * H, 3.2 * H, px)), colS = w * 0.7, rowS = w * 0.2, drift = dir * speed * 0.012 * w * bt * (1 + 0.15 * k);
          const j0 = Math.max(Math.floor((vb[0] - 0.3 * w) / rowS), Math.floor((-rmax * Rw * g.ob) / rowS) - 1), j1 = Math.min(Math.ceil((vb[1] + 0.3 * w) / rowS), Math.ceil((rmax * Rw * g.ob) / rowS) + 1);
          for (let j = j0; j <= j1; j++) {
            const i0 = Math.max(Math.floor((va[0] - 0.6 * w - drift) / colS) - 1, Math.floor((-rmax * Rw - drift) / colS) - 2), i1 = Math.min(Math.ceil((va[1] + 0.6 * w - drift) / colS) + 1, Math.ceil((rmax * Rw - drift) / colS) + 2);
            for (let i = i0; i <= i1; i++) {
              const r = rng(hash(api.seed || 29, k, i, j));
              const ja = (r() - 0.5) * 0.45, jb = (r() - 0.5) * 0.8, sz = 0.75 + 0.6 * r(), flat = 0.8 + 0.5 * r(), seed = Math.floor(r() * 1e6), skip = r() < 0.12;
              const a = (i + (j & 1 ? 0.5 : 0) + ja) * colS + drift, b = (j + jb) * rowS, ww = w * sz;
              const nu = a / Rw, nv = b / (Rw * g.ob), rho = Math.hypot(nu, nv) + (0.5 * ww) / Rw;
              if (skip || rho > rmax) continue;
              const [ox, oy] = rot([a * sd, b * sd], g.roll), cx = g.sc[0] + ox, cy = g.sc[1] + oy, wpx = ww * sd;
              if (cx + wpx * 0.6 < 0 || cx - wpx * 0.6 > W || cy + wpx * 0.35 < 0 || cy - wpx * 0.25 > H) continue;
              const edge = rmax > 0.94 ? clamp((rmax - rho) / 0.12) : 1;
              const c0 = times(colourAt(clamp(nu, -1, 1), clamp(nv, -1, 1), con), darkBy(clamp(kd * 1.08)));
              drawBank(c, bank(rng(seed)), cx, cy, wpx, g.roll, flat * 0.9, c0, shade(cx, cy), con, aK * edge * limbFade(cx, cy), glowAt(cy, 0), 0, seed, W, H);
            }
          }
        }
      });

      // 2. the glow from below: the bottom of the frame, over the deck, behind the nearer billows
      if (kg > 0.001) api.item([g.c[0], g.c[1], zAt(0.06)], c => {
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = env;
        c.beginPath(); c.ellipse(g.sc[0], g.sc[1], g.sR * (1 + reach), g.sR * g.ob * (1 + reach), g.roll, 0, TAU); c.clip();
        c.globalCompositeOperation = 'screen';
        const cy = H * (1.5 - 0.3 * kg), R = H * (0.95 + 0.2 * kg), gg = c.createRadialGradient(W / 2, cy, 0, W / 2, cy, R);
        gg.addColorStop(0, css(glowCol, 0.8 * kg)); gg.addColorStop(0.5, css(glowCol, 0.4 * kg)); gg.addColorStop(1, css(glowCol, 0));
        c.fillStyle = gg; c.fillRect(0, 0, W, H);
      });

      // 3. billows and streaks at depth: every random number first; each is placed where it is seen at its own moment
      // of the beat (inside the frame) so that at the beat's start it lies within the globe's disc
      const r = rng(api.seed || 31);
      for (let i = 0; i < n; i++) {
        const f0 = r(), streak = r() < 0.22, f = streak ? 0.12 + 0.4 * f0 : 0.12 + 0.88 * f0, tau = Math.min(NG - 1, Math.floor(Math.sqrt(r()) * NG)), sz = r(), seed = Math.floor(r() * 1e6), flat = 0.8 + 0.4 * r(), vel = 0.5 + r(), tone = r();
        const z = zAt(f), cT = cams[tau], sT = scale(cT, z), s0 = scale(cam0, z), k0 = s0 / sT, discT = sR0 / k0;
        const S = Math.min(H * (streak ? 0.45 + 0.7 * sz : 0.28 + 0.5 * sz * sz), discT * (streak ? 0.8 : 0.35));
        const wS = S / sT, v = dir * speed * vel * (streak ? 0.05 : 0.025) * wS, half = (streak ? 0.5 : 0.48) * S * k0 + Math.abs(v) * (tB - tA) * s0;
        const at0 = ([x, y]) => [(x - W / 2) / s0 + cam0.cx, (y - H / 2) / s0 + cam0.cy], onT = ([X, Y]) => [(X - cT.cx) * sT + W / 2, (Y - cT.cy) * sT + H / 2];
        const [ax, ay] = onT(at0([g0[0] - sR0, g0[1] - sR0])), [bx, by] = onT(at0([g0[0] + sR0, g0[1] + sR0]));
        const x0 = Math.max(ax, 0.02 * W), x1 = Math.min(bx, 0.98 * W), y0 = Math.max(ay, 0.02 * H), y1 = Math.min(by, 0.98 * H);
        const rr = rng(seed);
        let X = null, Y = null, gp = null;
        if (x1 > x0 && y1 > y0) for (let tries = 0; tries < 14; tries++) {
          const sx = lerp(x0, x1, rr()), sy = lerp(y0, y1, rr());
          const Xw = (sx - W / 2) / sT + cT.cx, Yw = (sy - H / 2) / sT + cT.cy, q = toGlobe([(Xw - cam0.cx) * s0 + W / 2, (Yw - cam0.cy) * s0 + H / 2], g0, sR0);
          if (Math.hypot(q[0], q[1]) + half / sR0 <= 0.92) { X = Xw; Y = Yw; gp = q; break; }
        }
        if (X === null) continue;
        const shape = streak ? null : bank(rng(seed + 7));
        api.item([X + v * bt * Math.cos(g.roll), Y + v * bt * Math.sin(g.roll), z], (c, P) => {
          const px = wS * P.s;
          if (px < 2) return;
          // off the frame (a piece the dolly has carried past its edge): nothing to draw
          const hx = px * 0.56 + 40, up = px * (streak ? 0.08 : 0.36 * flat) + 40, dn = px * (streak ? 0.06 : 0.1 * flat) + 40;
          if (P.x + hx < 0 || P.x - hx > W || P.y + dn < 0 || P.y - up > H) return;
          c.setTransform(1, 0, 0, 1, 0, 0);
          // kept to the globe and the haze past its limb: on the deck while far, spreading only as the camera arrives
          c.beginPath(); c.ellipse(g.sc[0], g.sc[1], g.sR * (1 + 2 * reach), g.sR * g.ob * (1 + 2 * reach), g.roll, 0, TAU); c.clip();
          const con = conOf(px), sh2 = shade(P.x, P.y, 0.6 * smooth(0.6 * H, 2 * H, px)), c0 = times(colourAt(gp[0], gp[1], con), darkBy(clamp(kd * (0.88 + 0.14 * (1 - f)))));
          // far and small: a faint patch of its band; near and passing the lens: thinning, out of focus
          const a = env * limbFade(P.x, P.y) * lerp(0.2, 0.96, smooth(0.08 * H, 0.35 * H, px)) * lerp(1, 0.5, smooth(1 * H, 3 * H, px));
          if (streak) {
            const tc = times(tone < 0.55 ? mix(c0, [255, 249, 236], 0.25 * con) : mix(c0, [86, 66, 104], 0.3 * con), sh2);
            drawStreak(c, P.x, P.y, px, g.roll, tc, a * 0.4 * (1 - smooth(1.2 * H, 2.4 * H, px)), seed);
          } else {
            drawBank(c, shape, P.x, P.y, px, g.roll, flat, c0, sh2, con, a, glowAt(P.y, f), smooth(0.85 * H, 1.6 * H, px), seed, W, H);
          }
        });
      }

      // 4. a ringed planet's near rings stay in front: from its innermost opaque ring out they are laid back over the
      // clouds as the planet draws them; a see-through ring inside that (Saturn's C ring) is laid over the clouds as a veil,
      // as thick as the clouds under it are (where they are still faint the planet's own ring shows through them)
      const st = Math.abs(Math.sin(g.tilt)), rings = B.rings || [];
      if (rings.length && st * g.sR > 1) {
        const opaque = rings.filter(q => q.a > 0.6), ri = opaque.length ? Math.min(...opaque.map(q => q.r0)) : Infinity, ro = Math.max(...rings.map(q => q.r1));
        const half = (c, r0, r1, m = 0) => {
          c.beginPath(); c.ellipse(0, 0, r1 * g.sR + m, r1 * g.sR * st + m, 0, 0, Math.PI, false);
          c.ellipse(0, 0, r0 * g.sR, r0 * g.sR * st, 0, Math.PI, 0, true); c.closePath();
        };
        api.item([g.c[0], g.c[1], zMin - 2], c => {
          c.setTransform(1, 0, 0, 1, 0, 0); c.translate(g.sc[0], g.sc[1]); c.rotate(g.roll);
          const cover = env * lerp(0.35, 1, flatten / 0.75);
          for (const q of rings) if (q.r1 <= ri + 1e-6) { c.globalAlpha = q.a * cover; c.fillStyle = q.col; half(c, q.r0, q.r1); c.fill(); }
          c.globalAlpha = 1;
          if (ri < ro) {
            half(c, ri, ro, 1.5 + 0.004 * g.sR); c.clip();
            c.setTransform(1, 0, 0, 1, 0, 0);
            api.silhouette(c, p.who);
          }
        });
      }
    },
  },
};
