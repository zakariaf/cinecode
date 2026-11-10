// A planet's many moons: small moons appear around it, slowly at first, then faster and faster (each popping up to its
// size), and go round on orbits close to its ring plane, the inner ones faster. Each is a small lit world, not a star: a
// grey or tan ball shaded like the planet (its sunward side lit, a dark crescent away from the light), no glow, of
// varied sizes (3.4–7.5 px at 1080p, most near the smallest). One bigger moon can be a world of its own (big: a body, e.g. 'titan', Saturn's orange moon), appearing
// early, drawn at least twice the biggest small moon so it reads as the biggest. A custom beat; time it to the line
// ("with": "prev").
//
// Beat params: who (a planet actor, required), n (moons, default 90), big (a body name for the big moon, default none),
// bigAt (when it appears, 0..1 of the beat, default 0.1), bigX, bigY (where, globe radii from the centre along and
// across the equator, default 3.4, 0.75), bigR (its radius, globe radii, default 0.09; true Titan / Saturn: 0.044, drawn
// larger when that is under two small moons).
// Layer `depth`: each moon is a piece at the planet's depth, set behind or in front of it by its side of the orbit, so
// the far ones pass behind the globe and the rings and the near ones in front; drawn flat, like the planet's rings
// (the orbits keep the rings' ellipse at any depth). The big moon is in front.
import { rng, clamp, INK } from '../core/lib.mjs';
import { drawBody, globeOf, lightIn } from '../paint/planets.mjs';

const TAU = Math.PI * 2;
const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
// the lit and the night side of each kind of small moon: icy grey-white, grey, tan
const SHADES = [['#e6e2da', '#4a4560'], ['#d8d4cc', '#444058'], ['#c9c2b6', '#403a52'], ['#b8b0a4', '#3a3448'], ['#d6c6a6', '#463c4c']];
const SMALL = 3.4, LARGE = 7.5;   // the small moons' radii, screen px at 1080p

// A small moon at (x, y), radius r (ctx units), lit from `L` (unit, toward the light): its night side, the lit part (the
// disc toward the light, a dark crescent left away from it), a soft highlight, and an ink rim when there is room for one.
function moon(c, x, y, r, [lit, night], L, px) {
  const TAU2 = Math.PI * 2;
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU2); c.fillStyle = night; c.fill(); c.clip();
  c.fillStyle = lit; c.beginPath(); c.arc(x + L[0] * r * 0.62, y + L[1] * r * 0.62, r * 1.02, 0, TAU2); c.fill();
  const hx = x + L[0] * r * 0.45, hy = y + L[1] * r * 0.45, h = c.createRadialGradient(hx, hy, 0, hx, hy, r * 0.8);
  h.addColorStop(0, 'rgba(255,252,242,0.55)'); h.addColorStop(1, 'rgba(255,252,242,0)'); c.fillStyle = h; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  c.restore();
  if (r >= 3.2 * px) { c.strokeStyle = INK; c.globalAlpha *= 0.8; c.lineWidth = 0.9 * px; c.beginPath(); c.arc(x, y, r, 0, TAU2); c.stroke(); c.globalAlpha /= 0.8; }
}

export const custom = {
  moonlets: {
    layer: 'depth',
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g) return;
      const n = p.n ?? 90, r = rng(api.seed || 11), st = Math.abs(Math.sin(g.tilt)) || 0.2, ct = Math.cos(g.tilt);
      const end = 0.8, bt = api.bt ?? u * (api.dur || 1), px = (api.H / 1080) / g.s;   // px: a screen pixel at its depth
      for (let i = 0; i < n; i++) {
        // every random number first, so each moon is the same on every frame; most orbits are near the rings
        const rad = g.R * (2.3 + 2.9 * Math.pow(r(), 1.6)), ph0 = r() * TAU, incl = (r() - 0.5) * 0.08, k = r(), size = (SMALL + (LARGE - SMALL) * k * k * k) * px;
        const col = SHADES[Math.floor(r() * SHADES.length)];
        const t0 = end * Math.sqrt(i / n), q = clamp((u - t0) / 0.05);
        if (q <= 0) continue;
        const th = ph0 + bt * 0.6 * Math.pow(g.R * 3 / rad, 1.5);
        const lx = Math.cos(th) * rad, ly = Math.sin(th) * rad * st + Math.sin(th + 1) * rad * incl;
        const sz = size * (q < 1 ? Math.sin(q * Math.PI * 0.5) * (1 + 0.3 * Math.sin(q * Math.PI)) : 1);   // it pops up to its size
        const [x, y] = rot(lx, ly, g.roll), X = g.c[0] + x, Y = g.c[1] + y;
        // its side of the orbit (sin th < 0: the far half, seen higher up) puts it behind or in front of the planet; the
        // nudge is a thousandth of the true depth offset, so it sorts but is drawn at the planet's scale
        api.item([X, g.a.key, g.z - Math.sin(th) * rad * ct * 1e-3], c => moon(c, X, Y, sz, col, lightIn(c), px));
      }
      if (p.big) {
        const q = clamp((u - (p.bigAt ?? 0.1)) / 0.06);
        if (q > 0) {
          const R1 = Math.max(g.R * (p.bigR ?? 0.09), 2 * LARGE * px);
          const [x, y] = rot(g.R * (p.bigX ?? 3.4), g.R * (p.bigY ?? 0.75), g.roll), rr = R1 * (q < 1 ? Math.sin(q * Math.PI * 0.5) : 1);
          api.item([g.c[0] + x, g.a.key, g.z - 1e-3], c => drawBody(c, p.big, g.c[0] + x, g.c[1] + y, rr, { t: api.t }));
        }
      }
    },
  },
};
