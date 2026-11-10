// Size by comparison: small worlds popping in one by one side by side across a planet's equator, to true scale (by
// default Earths, as many as fit across: 9 across Saturn, 11 across Jupiter). A custom beat; time it to the line
// ("with": "prev").
//
// Beat params: who (a planet actor, required), body (the small world, default 'earth'), ratio (its radius / the
// planet's, default from their true radii: radiusOf in engine/paint/planets.mjs, Earth / Saturn = 0.1058), n (how many,
// default as many as fit across: ⌊1 / ratio⌋), gap (seconds between pops, default 0.32; the first at 0.3 s), dy (the
// row's offset from the equator, globe radii, + = down, default 0).
// Sounds: a 'pop' for each of the first 9 at the default gap (a beat's sounds are fixed: for more, or another gap, add
// sfx beats).
// Layer `depth`: one piece just in front of the planet, so the row is drawn over it and under whatever is nearer.
import { clamp } from '../core/lib.mjs';
import { drawBody, globeOf, radiusOf } from '../paint/planets.mjs';

const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];

export const custom = {
  sizerow: {
    layer: 'depth',
    sfx: Array.from({ length: 9 }, (_, k) => ({ at: 0.3 + k * 0.32, name: 'pop', gain: 0.45 })),
    draw(ctx, u, api) {
      const p = api.params || {}, g = globeOf(api, p.who);
      if (!g) return;
      const body = p.body || 'earth', ratio = p.ratio ?? radiusOf(body) / radiusOf(g.B.body ?? 'saturn'), n = p.n ?? Math.max(1, Math.floor(1 / ratio));
      const r = ratio * g.R, d = 2 * r, bt = api.bt ?? u * (api.dur || 1), gap = p.gap ?? 0.32;
      api.item([g.c[0], g.a.key, g.z], c => {
        for (let k = 0; k < n; k++) {
          const q = clamp((bt - 0.3 - k * gap) / 0.22);
          if (q <= 0) continue;
          const pop = q < 1 ? Math.sin(q * Math.PI * 0.5) * (1 + 0.25 * Math.sin(q * Math.PI)) : 1;
          const [ox, oy] = rot(-n * r + d * (k + 0.5), (p.dy ?? 0) * g.R, g.roll);
          drawBody(c, body, g.c[0] + ox, g.c[1] + oy, r * pop, { t: api.t + k * 3 });
        }
      });
    },
  },
};
