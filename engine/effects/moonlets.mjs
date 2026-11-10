// A planet's many moons: small moons appear around it, slowly at first, then faster and faster (each with a pop of
// light), and go round on orbits in its ring plane, the inner ones faster. One bigger moon can be a world of its own
// (big: a body, e.g. 'titan'), appearing early. A custom beat; time it to the line ("with": "prev").
//
// Beat params: who (a planet actor, required), n (moons, default 90), big (a body name for the big moon, default none),
// bigAt (when it appears, 0..1 of the beat, default 0.1), bigX, bigY (where, globe radii from the centre along and
// across the equator, default 3.4, 0.75), bigR (its radius, globe radii, default 0.09).
// Layer `depth`: each moon is a piece at the planet's depth, set behind or in front of it by its side of the orbit, so
// the far ones pass behind the globe and the rings and the near ones in front; drawn flat, like the planet's rings
// (the orbits keep the rings' ellipse at any depth). The big moon is in front.
import { rng, clamp } from '../core/lib.mjs';
import { drawBody, globeOf } from '../paint/planets.mjs';

const TAU = Math.PI * 2;
const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
const SHADES = ['#d8d4cc', '#c9c2b6', '#e6e2da', '#b8b0a4'];

export const custom = {
  moonlets: {
    layer: 'depth',
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g) return;
      const n = p.n ?? 90, r = rng(api.seed || 11), st = Math.sin(g.tilt) || 0.2, ct = Math.cos(g.tilt);
      const end = 0.8, bt = api.bt ?? u * (api.dur || 1), px = (api.H / 1080) / g.s;   // px: a screen pixel at its depth
      for (let i = 0; i < n; i++) {
        // every random number first, so each moon is the same on every frame
        const rad = g.R * (2.2 + 6.5 * Math.pow(r(), 0.8)), ph0 = r() * TAU, incl = (r() - 0.5) * 0.25, size = (3.2 + 5 * r() * r()) * px;
        const shade = SHADES[Math.floor(r() * 4)];
        const t0 = end * Math.sqrt(i / n), q = clamp((u - t0) / 0.04);
        if (q <= 0) continue;
        const th = ph0 + bt * 0.6 * Math.pow(g.R * 3 / rad, 1.5);
        const lx = Math.cos(th) * rad, ly = Math.sin(th) * rad * st + Math.sin(th + 1) * rad * incl;
        const sz = size * (q < 1 ? 1 + 0.6 * Math.sin(q * Math.PI) : 1), flash = clamp((u - t0) / 0.07);
        const [x, y] = rot(lx, ly, g.roll), X = g.c[0] + x, Y = g.c[1] + y;
        // its side of the orbit (sin th < 0: the far half, seen higher up) puts it behind or in front of the planet; the
        // nudge is a thousandth of the true depth offset, so it sorts but is drawn at the planet's scale
        api.item([X, g.a.key, g.z - Math.sin(th) * rad * ct * 1e-3], c => {
          // a pop of light as it appears, then a small lit sphere: lit from the upper left, an inked rim
          if (flash < 1) { const fr = sz * (2 + 4 * flash), gl = c.createRadialGradient(X, Y, 0, X, Y, fr); gl.addColorStop(0, `rgba(255,248,226,${(0.7 * (1 - flash)).toFixed(3)})`); gl.addColorStop(1, 'rgba(255,248,226,0)'); c.fillStyle = gl; c.fillRect(X - fr, Y - fr, fr * 2, fr * 2); }
          c.fillStyle = shade; c.beginPath(); c.arc(X, Y, sz, 0, TAU); c.fill();
          c.save(); c.beginPath(); c.arc(X, Y, sz, 0, TAU); c.clip();
          c.fillStyle = 'rgba(60,50,96,0.55)'; c.beginPath(); c.arc(X + sz * 0.5, Y + sz * 0.45, sz * 0.95, 0, TAU); c.fill(); c.restore();
          c.strokeStyle = 'rgba(42,33,48,0.7)'; c.lineWidth = 0.9 * px; c.beginPath(); c.arc(X, Y, sz, 0, TAU); c.stroke();
        });
      }
      if (p.big) {
        const q = clamp((u - (p.bigAt ?? 0.1)) / 0.06);
        if (q > 0) {
          const [x, y] = rot(g.R * (p.bigX ?? 3.4), g.R * (p.bigY ?? 0.75), g.roll), rr = g.R * (p.bigR ?? 0.09) * (q < 1 ? Math.sin(q * Math.PI * 0.5) : 1);
          api.item([g.c[0] + x, g.a.key, g.z - 1e-3], c => drawBody(c, p.big, g.c[0] + x, g.c[1] + y, rr, { t: api.t }));
        }
      }
    },
  },
};
