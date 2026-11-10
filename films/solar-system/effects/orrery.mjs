// orrery: a map of the solar system seen from above, drawn over the space set's starfield. The Sun glows in the middle;
// the planets' orbits are faint warm dotted rings at their true relative sizes (Mercury 0.387, Venus 0.723, Earth 1,
// Mars 1.524, Jupiter 5.203, Saturn 9.537, Uranus 19.19, Neptune 30.07 AU); Pluto's tilted, off-centre oval (a 39.48
// AU, e 0.2488, tilted 17.16°: 29.7 AU, just inside Neptune's orbit, to 49.3 AU; its near end rides about 8 AU above
// the plane and its far end 13 AU below, so it crosses over Neptune's ring instead of running along it); the Kuiper
// Belt as a misty band of tiny icy specks from 30 to 50 AU. Each planet is a small painted world (drawBody, lit from
// the Sun, Saturn with its rings), its size exaggerated so it reads but in the order of the true sizes (on the far map
// a radius of 3 px at 1080p for Pluto up to 9.4 px for Jupiter; up to 3.2 times that when the map is close, au under
// 10; past au 60 the worlds, the Sun and the belt shrink and dim with the map, to a fifth by au 450, so the outer
// worlds fold into the Sun's knot and the belt fades instead of packing into a bright ring), going
// round counter-clockwise at its true period (87.97, 224.7, 365.25, 687, 4333, 10756, 30687, 60190 days; Pluto 90560
// days, faster near the Sun, by Kepler's equation). A fast world draws a short streak behind it (the way it went in
// the last frame), so a lap every few frames reads as speed, not as a flicker. As the zoom grows the inner orbits and
// planets shrink into one bright knot round the Sun.
//
// The map is seen from a little above (squash): a circle of the orbital plane is drawn as an oval as wide as the true
// orbit and squash × as tall, so the wide frame holds Earth's orbit at au 1.3 and the whole Kuiper Belt at au 60
// above the caption band. squash 1 is straight down. A height above the plane (Pluto's) is drawn up the frame by
// √(1 − squash²) of itself, as seen from that angle.
//
// Under the map lies a veil: the space set's sky colour (#0d1029) at up to 55%, a soft oval centred on the Sun out to
// 1.15 × the outermost ring (never past the frame), so the set's bright stars sink behind the worlds and rings and
// never read as extra planets. It fades with the map, so a fade-out ends on the bare starfield.
//
// Each body starts at a fixed angle (counter-clockwise from the right): Mercury and Earth side by side on the right
// (the race's start and finish line, where their lap counters stand), the others spread round the upper half and the
// sides, clear of the caption band; Pluto on its oval at the upper left, about 32 AU from the Sun.
//
// A custom beat: { "do": "custom", "name": "orrery", "at": 0, "dur": <the shot>, "hold": false, "scope": "shot", … }.
// Beat params:
//   bodies    which worlds to show: any of mercury, venus, earth, mars, jupiter, saturn, uranus, neptune, pluto
//             (default all nine). An orbit is drawn for each.
//   years     Earth years that pass over the motion (default 1). 0: still.
//   start     Earth years already gone by when the beat begins (default 0), so a later beat can carry on from an
//             earlier one: give it the earlier beat's start + years.
//   run       the fraction of the beat over which the motion runs (default 0.85), easing in and out; then everything
//             holds still so the numbers can be read.
//   counters  bodies (from bodies) that get an inked lap counter beside their orbit at their start and finish line
//             (default none): hand-lettered cream numbers about 56 px tall at 1080p, from 0, ticking up by one (with a
//             small pop) each time the world completes a lap. Mercury and Earth over 8 years: 33 and 8, and both stop
//             together when the motion stops.
//   au, auTo  half the frame width in AU at the start and at the end (default 1.6 and au: no zoom), eased
//             geometrically so the zoom feels even.
//   zoomFrom, zoomTo   the zoom's window, fractions of the beat (default 0.1 and 0.9).
//   zoomEase  how the zoom starts and ends (default 'both'): 'both' at rest at both ends; 'in' from rest, arriving
//             at speed (1 − cos(πx/2)); 'out' leaving at speed, coming to rest (sin(πx/2)); 'none' steady. One
//             pull-back carried across a cut: the earlier beat zoomTo 1 with 'in', the later one (au = the earlier
//             auTo) zoomFrom 0 with 'out', and the same speed on both sides of the cut: ln(auTo / au) / (the zoom
//             window in seconds) equal for both beats. E.g. 11.3, 10 s, au 1.6 → 60, window 0.1–1 (9 s): 0.403/s; so
//             11.4, 9 s, window 0–0.8 (7.2 s): auTo = 60 × e^(0.403 × 7.2) ≈ 1100.
//   squash    the map's height / width (default 0.42: seen from about 25° above the plane; 1: straight down).
//   cx, cy    the Sun's place, fractions of the frame (default 0.5, 0.5).
//   cxTo, cyTo   where the Sun has moved to by the zoom's end (default cx, cy: still), eased through the zoom's window
//             (at rest at both ends, whatever zoomEase),
//             so the map can carry the Sun to where the next shot has it (11.4: [0.045, 0.4], the place of Part 11's
//             sunglow, for 11.5).
//   belt      true: draw the Kuiper Belt (default false).
//   seed      the belt's speck and wash pattern (default 7). Not the beat's own seed, so two beats carrying one
//             pull-back across a cut (11.3 → 11.4) draw the same belt in the same place: give both the same seed.
//   fadeIn    the fraction of the beat over which the map fades in (default 0: there from the first frame).
//   fadeOut   the fraction at the beat's end over which the map fades out (default 0): the orbits, worlds, belt and
//             counters go, leaving only the space set's starfield, and the Sun shrinks to the far Sun of Part 11: by
//             the last frame it is drawn exactly as a sunglow of r 0.003 at the Sun's place (no glint), so a cut to
//             a shot with that sunglow at the same place shows the same point of light.
//   a         strength 0..1 (default 1).
// Layer `grade`: emitted light, in screen pixels, after the grade and under the captions. It draws only the map (no
// backdrop): use it in a space scene with no planet actor in frame.
import { rng, clamp, smooth, ink, wobble, canvas, INK } from 'cinecode/lib';
import { drawBody } from 'cinecode/paint/planets';

const TAU = Math.PI * 2, YEAR = 365.25;

// a (AU), period (days), the starting angle (radians, counter-clockwise from the right), the body's paint (a preset
// name or params over it), its size on the far map (px at 1080p: exaggerated, ordered by true size), its light (rgb)
const BODIES = {
  mercury: { a: 0.387, P: 87.97, th: 0, paint: 'mercury', r: 3.4, rgb: '226,216,204' },
  venus: { a: 0.723, P: 224.7, th: 2.25, paint: 'venus', r: 4.5, rgb: '250,230,182' },
  earth: { a: 1, P: 365.25, th: 0, paint: 'earth', r: 4.7, rgb: '160,198,250' },
  mars: { a: 1.524, P: 687, th: 3.55, paint: 'mars', r: 3.8, rgb: '244,160,118' },
  jupiter: { a: 5.203, P: 4333, th: 2.45, paint: 'jupiter', r: 9.4, rgb: '240,214,176' },
  saturn: { a: 9.537, P: 10756, th: 0.45, paint: 'saturn', r: 8.6, rgb: '244,228,186' },
  // (its faint rings left out: at map size their ink is only a dark smudge)
  uranus: { a: 19.19, P: 30687, th: 2.0, paint: { body: 'uranus', rings: false }, r: 6.8, rgb: '196,236,238' },
  // Neptune in its true pale blue, as the film's cast paints it (facts #96), not the engine's Voyager blue
  neptune: { a: 30.07, P: 60190, th: 0.95, r: 6.6, rgb: '170,206,232',
    paint: { body: 'neptune', base: '#8cc0dc', bands: [[0.6, '#88bad8'], [0.3, '#92c4e0'], [-0.1, '#96c8e2'], [-0.45, '#8ec0de'], [-0.75, '#88bcd8']],
      spots: [{ lon: 0.4, lat: -0.34, w: 0.16, h: 0.08, col: '#5f8fbc' }, { lon: 0.44, lat: -0.43, w: 0.11, h: 0.025, col: '#e6ecf6' }] } },
  // th: the mean anomaly at the start; e, peri: the oval's eccentricity and the map angle of its perihelion (left, a
  // little toward us), so its near end comes just inside Neptune's orbit at the left; inc, w: its true tilt (17.16°)
  // and argument of perihelion (113.8°), so the near end rides about 8 AU above the plane and the far end 13 AU below
  pluto: { a: 39.48, P: 90560, th: -0.554, e: 0.2488, peri: Math.PI + 0.25, inc: 17.16 * Math.PI / 180, w: 113.8 * Math.PI / 180, paint: 'pluto', r: 3, rgb: '232,214,190' },
};
// the node (where the oval rises through the plane), turned so the perihelion lies at `peri` on the map
for (const B of Object.values(BODIES)) if (B.e) B.node = B.peri - Math.atan2(Math.sin(B.w) * Math.cos(B.inc), Math.cos(B.w));
const ORDER = ['pluto', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

// motion over 0..1: eased in and out over the first and last 12%, steady between
const RAMP = 0.12, V = 1 / (1 - RAMP);
const ramp = x => { x = clamp(x); return x < RAMP ? V * x * x / (2 * RAMP) : x > 1 - RAMP ? 1 - V * (1 - x) ** 2 / (2 * RAMP) : V * (x - RAMP / 2); };
const unramp = y => { const y1 = V * RAMP / 2; return y <= y1 ? Math.sqrt(2 * RAMP * y / V) : y >= 1 - y1 ? 1 - Math.sqrt(2 * RAMP * (1 - y) / V) : y / V + RAMP / 2; };
const easeIO = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
// the zoom's easing (zoomEase): both ends at rest, or leaving at speed / arriving at speed (to carry on across a cut)
const ZOOM_EASE = { both: easeIO, in: x => 1 - Math.cos(Math.PI / 2 * clamp(x)), out: x => Math.sin(Math.PI / 2 * clamp(x)), none: x => clamp(x) };

// a point of a tilted oval (AU) at eccentric anomaly E: [x, y, z], z above the plane
function onOval(B, E) {
  const xp = B.a * (Math.cos(E) - B.e), yp = B.a * Math.sqrt(1 - B.e * B.e) * Math.sin(E);
  const cw = Math.cos(B.w), sw = Math.sin(B.w), x1 = xp * cw - yp * sw, y1 = xp * sw + yp * cw;   // from the node, in its own plane
  const Y = y1 * Math.cos(B.inc), cn = Math.cos(B.node), sn = Math.sin(B.node);
  return [x1 * cn - Y * sn, x1 * sn + Y * cn, y1 * Math.sin(B.inc)];
}
// a body's place (AU) after `days`: [x, y, z], y toward the far side, z above the plane
function where(B, days) {
  if (!B.e) { const th = B.th + TAU * days / B.P; return [B.a * Math.cos(th), B.a * Math.sin(th), 0]; }
  const M = B.th + TAU * days / B.P;
  let E = M; for (let i = 0; i < 8; i++) E -= (E - B.e * Math.sin(E) - M) / (1 - B.e * Math.cos(E));
  return onOval(B, E);
}

// ── hand-lettered digits: strokes in a 0.6 × 1 em box (y down), inked twice (a dark edge, then cream) ──
const arc = (cx, cy, rx, ry, a0, a1, n = 22) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const bez = (p0, c, p1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]; });
const line = (p0, p1, n = 8) => bez(p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1, n);
const PI = Math.PI;
// each stroke: [points, closed]
const GLYPHS = {
  0: [[arc(0.3, 0.5, 0.27, 0.48, -PI / 2, 1.5 * PI, 40).slice(0, -1), true]],
  1: [[line([0.1, 0.24], [0.34, 0.02]), false], [line([0.34, 0.02], [0.34, 1]), false]],
  2: [[[...arc(0.3, 0.28, 0.25, 0.26, -2.75, 0.5, 20), ...line([0.52, 0.42], [0.04, 0.99]).slice(1)], false], [line([0.04, 0.99], [0.6, 0.97]), false]],
  3: [[arc(0.28, 0.27, 0.23, 0.24, -2.7, PI / 2, 20), false], [arc(0.28, 0.74, 0.27, 0.26, -PI / 2, 2.65, 22), false]],
  4: [[line([0.46, 0.02], [0.02, 0.7]), false], [line([0.0, 0.7], [0.6, 0.69]), false], [line([0.46, 0.02], [0.46, 1]), false]],
  5: [[line([0.56, 0.03], [0.13, 0.03]), false], [line([0.13, 0.03], [0.09, 0.46]), false], [arc(0.29, 0.69, 0.27, 0.29, -2.3, 2.45, 24), false]],
  6: [[bez([0.52, 0.06], [0.06, 0.08], [0.04, 0.7]), false], [arc(0.3, 0.71, 0.26, 0.28, PI, 3 * PI, 34).slice(0, -1), true]],
  7: [[line([0.02, 0.03], [0.6, 0.03]), false], [bez([0.6, 0.03], [0.34, 0.45], [0.22, 1]), false]],
  8: [[arc(0.3, 0.26, 0.21, 0.23, -PI / 2, 1.5 * PI, 30).slice(0, -1), true], [arc(0.3, 0.73, 0.26, 0.26, -PI / 2, 1.5 * PI, 32).slice(0, -1), true]],
  9: [[arc(0.29, 0.3, 0.25, 0.28, 0, TAU, 34).slice(0, -1), true], [bez([0.54, 0.3], [0.55, 0.78], [0.32, 1]), false]],
};
const ADV = 0.66;
// the number `str` with its left edge at x and its middle at y, h px tall
function lettering(ctx, str, x, y, h, alpha) {
  const strokes = [];
  [...str].forEach((ch, k) => (GLYPHS[ch] || []).forEach(([P, closed], j) => {
    const seed = ch.charCodeAt(0) * 37 + j * 11;            // the same digit is always lettered the same: no flicker
    const Q = wobble(P.map(([px, py]) => [x + (px + k * ADV + (0.5 - py) * 0.14) * h, y + (py - 0.5) * h]), seed, h * 0.012, closed);
    strokes.push([Q, closed, seed]);
  }));
  ctx.globalAlpha = alpha;
  for (const [Q, closed, seed] of strokes) ink(ctx, Q, h * 0.2, { closed, color: INK, seed });
  for (const [Q, closed, seed] of strokes) ink(ctx, Q, h * 0.12, { closed, color: '#f7ecd2', seed });
}

export const custom = {
  orrery: {
    layer: 'grade',
    draw(ctx, u, api) {
      const p = api.params || {}, W = api.W, H = api.H, k1 = H / 1080, A = clamp(p.a ?? 1);
      if (!(A > 0)) return;
      const names = (Array.isArray(p.bodies) ? p.bodies : ORDER).filter(n => BODIES[n]);
      const counters = new Set((Array.isArray(p.counters) ? p.counters : []).filter(n => names.includes(n)));
      const years = p.years ?? 1, run = clamp(p.run ?? 0.85, 0.01, 1), dur = api.dur || 1, fps = api.plan?.fps || 24;
      const squash = clamp(p.squash ?? 0.42, 0.05, 1), lift = Math.sqrt(1 - squash * squash);
      // the zoom: half the frame width in AU, eased geometrically through its window (zoomEase)
      const au0 = p.au ?? 1.6, au1 = p.auTo ?? au0, zf = p.zoomFrom ?? 0.1, zt = p.zoomTo ?? 0.9;
      const zk = clamp((u - zf) / Math.max(1e-6, zt - zf));
      const au = au0 * Math.pow(au1 / au0, (ZOOM_EASE[p.zoomEase] || easeIO)(zk)), K = W / 2 / au;   // screen px per AU (across)
      // the Sun's place, moving from cx, cy to cxTo, cyTo through the zoom's window (always at rest at both ends)
      const cx = p.cx ?? 0.5, cy = p.cy ?? 0.5, ck = easeIO(zk), CX = (cx + ((p.cxTo ?? cx) - cx) * ck) * W, CY = (cy + ((p.cyTo ?? cy) - cy) * ck) * H;
      const S = ([x, y, z = 0]) => [CX + x * K, CY - (y * squash + z * lift) * K];
      // time: days gone by at a point of the beat
      const daysAt = v => (p.start ?? 0) * YEAR + years * YEAR * ramp(v / run);
      const days = daysAt(u), dPrev = daysAt(u - 1 / (fps * dur));     // one frame earlier: the streak
      // fades: the map in and out; out, the Sun shrinks to a star
      const fin = (p.fadeIn ?? 0) > 0 ? smooth(0, p.fadeIn, u) : 1, fo = (p.fadeOut ?? 0) > 0 ? smooth(1 - p.fadeOut, 1, u) : 0;
      const mapA = A * fin * (1 - fo);
      // worlds and the Sun are drawn bigger when the map is close (au under 10); past au 60 they shrink with the map
      // (far), so the outer worlds fold into the Sun's knot instead of piling onto it
      const grow = clamp(Math.pow(10 / au, 0.55), 1, 3.2), far = clamp(Math.pow(60 / au, 0.8), 0.2, 1);
      // the Sun: never under the star it ends as (out: Part 11's sunglow, r 0.003)
      const STAR = 0.003 * H, sun0 = Math.max(9 * grow * far * k1, STAR), sunR = sun0 + (STAR - sun0) * fo;
      ctx.globalCompositeOperation = 'source-over';

      // ── the veil: the set's sky laid thinly over the map, so its bright stars sink behind the worlds and rings (out
      // to 1.15 × the outermost ring, never past the frame; it goes with the map, so a fade-out ends on bare sky) ──
      if (mapA > 0) {
        const aMax = Math.max(p.belt ? 50 : 0, ...names.map(n => BODIES[n].a * (1 + (BODIES[n].e || 0))));
        const rv = Math.min(1.15 * aMax * K, 0.6 * W), g = ctx.createRadialGradient(0, 0, 0, 0, 0, rv);
        [[0, 1], [0.72, 1], [0.87, 0.6], [1, 0]].forEach(([s, v]) => g.addColorStop(s, `rgba(13,16,41,${(0.55 * v * mapA).toFixed(3)})`));
        ctx.save(); ctx.translate(CX, CY); ctx.scale(1, squash); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rv, 0, TAU); ctx.fill(); ctx.restore();
      }

      // ── the Kuiper Belt: a misty band and many icy specks, 30–50 AU; seeded by the param, not the beat, so two
      // beats carrying one pull-back across a cut draw the same belt ──
      const r = rng(p.seed ?? 7);
      const SPECKS = Array.from({ length: 1400 }, () => {
        const q = r(), ra = q < 0.6 ? 38 + 10 * r() : 30 + 20 * r();   // denser in the classical belt (38–48 AU)
        return [ra, r() * TAU, (0.65 + 0.9 * r() * r()) * k1, 0.3 + 0.6 * r(), r() < 0.3 ? '200,222,248' : '236,242,252'];
      });
      const CLOUDS = Array.from({ length: 70 }, () => [33 + 15 * r(), r() * TAU, 2.5 + 4 * r(), 0.5 + 0.5 * r()]);
      if (p.belt && mapA > 0) {
        const turn = ra => TAU * days / (YEAR * Math.pow(ra, 1.5));     // Kepler: a period of a^1.5 years
        // past au 60 the belt dims as it shrinks: fewer specks (the last ones fading out one by one), each fainter
        const nS = SPECKS.length * far * far, spA = mapA * Math.sqrt(far);
        ctx.save(); ctx.translate(CX, CY); ctx.scale(K, -K * squash);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 52);
        [[0, 0], [28 / 52, 0], [31 / 52, 0.35], [40 / 52, 0.85], [45 / 52, 1], [48 / 52, 0.7], [1, 0]].forEach(([s, v]) => g.addColorStop(s, `rgba(150,180,220,${(0.075 * v * mapA * far).toFixed(4)})`));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
        for (const [ra, th0, size, al] of CLOUDS) {                     // soft gouache washes along the band
          const th = th0 + turn(ra), x = ra * Math.cos(th), y = ra * Math.sin(th), cg = ctx.createRadialGradient(x, y, 0, x, y, size);
          cg.addColorStop(0, `rgba(170,196,230,${(0.05 * al * mapA * far).toFixed(4)})`); cg.addColorStop(1, 'rgba(170,196,230,0)');
          ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        SPECKS.forEach(([ra, th0, size, al, col], i) => {
          const th = th0 + turn(ra), [x, y] = S([ra * Math.cos(th), ra * Math.sin(th)]), a = al * spA * clamp(nS - i);
          if (!(a > 0.004) || x < -4 || x > W + 4 || y < -4 || y > H + 4) return;
          ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
        });
        ctx.restore();
      }

      // ── the orbits: faint warm dotted rings (Pluto's an oval), dots ~9 px apart whatever the zoom: as a ring grows,
      // new dots fade in halfway between the old ones, so nothing pops ──
      const hash = x => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
      const ring = (B, alpha) => {
        const rho = B.a * K, per = TAU * rho * (1 + squash) / 2, fade = alpha * smooth(sunR * 1.2, sunR * 2.6, rho * squash);
        if (!(fade > 0.01) || rho * squash > 4 * W) return;
        const lev = clamp(Math.log2(Math.max(per / (9 * k1), 8)), 3, 13), L = Math.floor(lev), n = 2 ** L, f = lev - L;
        const at = q => S(B.e ? onOval(B, q * TAU) : [B.a * Math.cos(q * TAU), B.a * Math.sin(q * TAU)]);
        const dot = (q, w) => {
          const [x, y] = at(q); if (x < -3 || x > W + 3 || y < -3 || y > H + 3) return;
          ctx.globalAlpha = fade * w * (0.75 + 0.25 * hash(Math.round(q * 8192)));
          ctx.beginPath(); ctx.arc(x, y, 1.5 * k1, 0, TAU); ctx.fill();
        };
        ctx.fillStyle = B.e ? '#e9e2d6' : '#fff0d8';
        for (let i = 0; i < n; i++) dot(i / n, 1);
        if (f > 0.01) for (let i = 0; i < n; i++) dot((i + 0.5) / n, f);
      };
      if (mapA > 0) for (const n of names) ring(BODIES[n], (n === 'pluto' ? 0.55 : 0.66) * mapA);
      ctx.globalAlpha = 1;

      // ── the worlds, far side first; the Sun between ──
      const W8 = names.map(n => {
        const B = BODIES[n], P = where(B, days), [x, y] = S(P), [x0, y0] = S(where(B, dPrev));
        return { n, B, x, y, x0, y0, far: P[1] > 0, rho: Math.hypot(x - CX, y - CY), R: B.r * grow * far * k1 };
      });
      const world = w => {
        if (!(mapA > 0) || w.x < -60 || w.x > W + 60 || w.y < -60 || w.y > H + 60) return;
        const { B, x, y, R } = w, knot = smooth(sunR * 1.6, sunR * 3.6, w.rho);   // 0: lost in the Sun's glow
        // the streak: where it went in the last frame, brightest at the world
        const moved = Math.hypot(x - w.x0, y - w.y0), sA = mapA * smooth(R * 0.5, R * 2, moved);   // grows in with speed: no pop
        if (sA > 0) {
          // a ribbon along the orbit, as wide as the world at its head and tapering to nothing, fading toward its tail
          const n = 32, C = Array.from({ length: n + 1 }, (_, i) => S(where(B, days - (days - dPrev) * i / n))), Lf = [], Rt = [];
          C.forEach(([cx, cy], i) => {
            const a = C[Math.max(0, i - 1)], b = C[Math.min(n, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
            const hw = R * 0.85 * Math.pow(1 - i / n, 0.8);
            Lf.push([cx - dy / d * hw, cy + dx / d * hw]); Rt.push([cx + dy / d * hw, cy - dx / d * hw]);
          });
          const [tx, ty] = C[n], g = ctx.createLinearGradient(x, y, tx, ty);
          g.addColorStop(0, `rgba(${B.rgb},${(0.55 * sA).toFixed(3)})`); g.addColorStop(0.5, `rgba(${B.rgb},${(0.16 * sA).toFixed(3)})`); g.addColorStop(1, `rgba(${B.rgb},0)`);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath();
          [...Lf, ...Rt.reverse()].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        // a soft light round it; in the knot it turns the Sun's warm white and the painted world gives way to it
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rgb = B.rgb.split(',').map((c, i) => Math.round(+c + ([255, 240, 214][i] - c) * (1 - knot))).join(',');
        const gr = R * (2.6 + 0.6 * (1 - knot)), g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, `rgba(${rgb},${((0.32 + 0.22 * (1 - knot)) * mapA).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - gr, y - gr, gr * 2, gr * 2);
        ctx.restore();
        if (knot > 0) {
          // painted on a canvas of its own and laid on at the fade (drawBody's rings set their own alpha)
          const L = [CX - x, CY - y], d = Math.hypot(L[0], L[1]) || 1, m = Math.ceil(R * 2.6 + 6), ix = Math.floor(x), iy = Math.floor(y);   // lit from the Sun
          const [cv, c] = canvas(2 * m, 2 * m);
          drawBody(c, B.paint, m + x - ix, m + y - iy, R, { t: 0, light: [L[0] / d, L[1] / d], lw: Math.min(1.1, R * 0.12) * k1 });
          ctx.save(); ctx.globalAlpha = mapA * knot * knot; ctx.drawImage(cv, ix - m, iy - m); ctx.restore();
        }
      };
      for (const w of W8) if (w.far) world(w);

      // the Sun: a glowing disc in warm halos, sunglow's own; as the map fades out it shrinks to the far Sun of Part 11
      // (sunglow r 0.003), the same point of light the next shot's sunglow draws
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sa = A * fin, halo = (r0, r1, rgb, al) => { const g = ctx.createRadialGradient(CX, CY, r0, CX, CY, r1); g.addColorStop(0, `rgba(${rgb},${(al * sa).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(CX - r1, CY - r1, r1 * 2, r1 * 2); };
      halo(sunR * 0.9, sunR * 4.5, '255,190,110', 0.28);
      halo(sunR * 0.6, sunR * 2.0, '255,226,160', 0.5);
      ctx.restore();
      if (sunR > 3.5 * k1) { ctx.save(); ctx.globalAlpha = sa * smooth(3.5 * k1, 6 * k1, sunR); drawBody(ctx, 'sun', CX, CY, sunR, { t: 0 }); ctx.restore(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; halo(0, sunR * 1.15, '255,250,232', 0.95);
      ctx.restore();

      for (const w of W8) if (!w.far) world(w);

      // ── the lap counters: at each counted world's start line, just outside its orbit ──
      if (counters.size && mapA > 0) {
        const h = 56 * k1;
        for (const n of names) {
          if (!counters.has(n)) continue;
          const B = BODIES[n], laps = Math.max(0, (days - (p.start ?? 0) * YEAR) / B.P), c = Math.floor(laps + 1e-9);
          // the moment of the last lap (in beat time), for a small pop as the number ticks up
          let pop = 0;
          if (c > 0 && years > 0) { const ut = run * unramp(clamp(c * B.P / (years * YEAR))), ago = (u - ut) * dur; pop = ago >= 0 ? Math.exp(-ago / 0.12) : 0; }
          const [ox, oy] = S(where(B, (p.start ?? 0) * YEAR)), dx = ox - CX, dy = oy - CY, d = Math.hypot(dx, dy) || 1;
          const gap = B.r * grow * far * k1 + 18 * k1, str = String(c), wpx = (str.length * ADV - 0.06) * h;
          const lx = ox + (dx / d) * gap - (dx < -1 ? wpx : 0), ly = oy + (dy / d) * gap;
          const hh = h * (1 + 0.22 * pop);
          lettering(ctx, str, lx - (hh - h) * str.length * ADV * 0.5, ly, hh, mapA);
        }
      }
    },
  },
};
