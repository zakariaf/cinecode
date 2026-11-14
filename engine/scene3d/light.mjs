// The light of a shot, as numbers. A row of LIGHTS is everything the picture needs to know about the hour:
// where the sun is, its colour and strength, the three fills that keep the shade alive (sky on what faces up,
// shade on what stands upright, ground on what faces down), how much of the sun that lands on the floor is
// thrown back into the room, how bright the world outside the window is, how thick the air is, and the grade.
// stage.setLight('golden') takes a row by name; stage.setLight({ ...LIGHTS.golden, bounce: 1.2 }) takes numbers.
//
//   sun      az: the way the light travels, in degrees round from +z toward +x; el: degrees above the horizon
//   power    the sun's strength (1 = a white wall in full sun is exactly white before the grade)
//   bounce   how much of the sun on the set's bounce patches is thrown back into the room (about 0.5 to 2)
//   outdoor  what is seen through an opening (the garden cards are multiplied by it)
//   air      density of the light in the air per metre of sunlit air
//   grade    exposure; contrast (an S-curve, 0 = none); saturation (1 = as lit); shadows and lights (the split
//            tone: what the darks and the lights are multiplied by); lift (the darkest colour the picture has,
//            so nothing is crushed to black); bloom (narrow glow of the hot spots); glow (wide glow: the window
//            floods the air round it)
//   lamp     a warm lamp where the set put one (stage.lamp); left out = off
import * as THREE from 'three/webgpu';
import { Fn, Loop, float, int, vec2, vec3, vec4, uniform, rtt, screenUV, max, min, dot, length, sqrt, floor, mix, clamp } from 'three/tsl';

export const LIGHTS = {
  morning: {
    sun: { az: 38, el: 30, color: 0xfff0dc, power: 2.6 },
    sky: { color: 0xb4cdf6, power: 0.5 }, shade: { color: 0xc6cdf0, power: 0.8 }, ground: { color: 0xf2dcc0, power: 0.3 },
    bounce: 0.85, outdoor: { color: 0xf2f8ff, power: 1.15 }, air: { color: 0xfff2dc, density: 0.03 },
    grade: { exposure: 0.84, contrast: 0.22, saturation: 1.05, shadows: [0.95, 0.98, 1.08], lights: [1.02, 1.0, 0.97], lift: 0x120f1c, bloom: 0.1, glow: 0.2 },
  },
  noon: {
    sun: { az: 22, el: 58, color: 0xfffaf0, power: 2.8 },
    sky: { color: 0xa9c8ff, power: 0.6 }, shade: { color: 0xc9d2f2, power: 0.9 }, ground: { color: 0xf4e6cf, power: 0.3 },
    bounce: 0.9, outdoor: { color: 0xffffff, power: 1.25 }, air: { color: 0xffffff, density: 0.015 },
    grade: { exposure: 0.9, contrast: 0.22, saturation: 1.05, shadows: [0.96, 0.98, 1.06], lights: [1.01, 1.0, 0.98], lift: 0x100f1a, bloom: 0.1, glow: 0.18 },
  },
  golden: {
    sun: { az: 125, el: 12, color: 0xffe8c8, power: 2.6 },
    sky: { color: 0xa8b0f0, power: 0.18 }, shade: { color: 0xa8acf4, power: 0.42 }, ground: { color: 0xf0cca8, power: 0.12 },
    bounce: 0.35, outdoor: { color: 0xfff0d2, power: 1.0 }, air: { color: 0xffe0b4, density: 0.025 },
    grade: { exposure: 0.95, contrast: 1.0, saturation: 1.1, shadows: [0.9, 0.93, 1.12], lights: [1.01, 1.0, 0.96], lift: 0x0e0a16, bloom: 0.04, glow: 0.02 },
  },
  twilight: {
    sun: { az: 70, el: 4, color: 0xff9a78, power: 0.45 },
    sky: { color: 0x6f78d8, power: 0.32 }, shade: { color: 0x8a80d0, power: 0.34 }, ground: { color: 0xb88090, power: 0.16 },
    bounce: 0.5, outdoor: { color: 0xf0a8b8, power: 0.75 }, air: { color: 0xff9a90, density: 0.02 },
    lamp: { color: 0xffb468, power: 0.85 },
    grade: { exposure: 0.95, contrast: 0.9, saturation: 1.08, shadows: [0.88, 0.92, 1.14], lights: [1.06, 0.99, 0.94], lift: 0x080612, bloom: 0.1, glow: 0.22 },
  },
  night: {
    sun: { az: 30, el: 38, color: 0x9bb4ff, power: 0.35 },       // the moon
    sky: { color: 0x3a4a9a, power: 0.3 }, shade: { color: 0x44509c, power: 0.32 }, ground: { color: 0x2c3060, power: 0.2 },
    bounce: 0.5, outdoor: { color: 0x2a3a78, power: 0.25 }, air: { color: 0x8fa8ff, density: 0.02 },
    lamp: { color: 0xffb468, power: 1.0 },
    grade: { exposure: 1.0, contrast: 0.2, saturation: 1.0, shadows: [0.9, 0.95, 1.16], lights: [1.06, 1.0, 0.9], lift: 0x0c0c1e, bloom: 0.1, glow: 0.22 },
  },
};

// The way the sun's light travels, as a vector.
export function sunDir(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), -Math.sin(e), Math.cos(a) * Math.cos(e)];
}

// Light that reaches a surface without coming straight from the sun: thrown back by sunlit patches of floor and
// wall, and sky through the openings. A set says which flat patches bounce and which openings let the sky in
// (field.set). Each is cut into cells about 0.3 m wide. A cell of a patch sends as much as the sun that reaches
// it right now (asked of the sun's shadow picture, so a figure standing in the patch dims what it throws back);
// a cell of an opening always sends. The room is filled with a grid of probes; every frame each probe adds up
// what reaches it from all cells and keeps the total and the direction most of it comes from. A surface then
// reads the probes round it (four texture reads) and takes what its facing lets in.
// Nothing is blocked on the way from a cell to a surface; the occlusion pass stands in for that.
//   sunLit(point) -> 0..1, the sun's shadow picture; sunAxis: uniform, the way the sun shines
export function createField(sunLit, sunAxis) {
  const G = [24, 12, 28], CELL = 0.3, NEAR = 0.3;      // probes across x, y, z; sender cell size; nothing counts as nearer than this
  const lo = uniform(new THREE.Vector3(-4, 0, -4)), size = uniform(new THREE.Vector3(8, 4, 8));
  let patches = [], portals = [];

  // one texel per probe; the slices of equal height lie side by side. rgb: sum of weight x direction, a: sum of weight
  const gather = (senders, lit) => rtt(Fn(() => {
    const px = screenUV.mul(vec2(G[0] * G[1], G[2])), ix = floor(px.x), iy = floor(ix.div(G[0]));
    const p = lo.add(vec3(ix.sub(iy.mul(G[0])).add(0.5).div(G[0]), iy.add(0.5).div(G[1]), floor(px.y).add(0.5).div(G[2])).mul(size));
    const acc = vec4(0).toVar();
    for (const s of senders()) {
      const nrm = new THREE.Vector3(...s.du).cross(new THREE.Vector3(...s.dv)), area = nrm.length();
      const nu = Math.max(1, Math.round(Math.hypot(...s.du) / CELL)), nv = Math.max(1, Math.round(Math.hypot(...s.dv) / CELL));
      const n = vec3(nrm.normalize());
      Loop(nu * nv, ({ i }) => {
        const a = float(i.mod(int(nu))).add(0.5).div(nu), b = float(i.div(int(nu))).add(0.5).div(nv);
        const q = vec3(...s.p0).add(vec3(...s.du).mul(a)).add(vec3(...s.dv).mul(b));
        const d = q.sub(p), d2 = dot(d, d), dir = d.div(sqrt(d2.add(1e-6)));
        const w = max(dot(n, dir).negate(), 0).mul(area / (nu * nv) / Math.PI).div(d2.add(NEAR * NEAR)).toVar();
        if (lit) {      // the sun on this cell: four spots across it, lifted off the surface
          let sun = float(0);
          for (const [oa, ob] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
            sun = sun.add(sunLit(q.add(vec3(...s.du).mul(oa / nu)).add(vec3(...s.dv).mul(ob / nv)).add(n.mul(0.03)).sub(sunAxis.mul(0.03))));
          }
          w.mulAssign(sun.mul(0.25).mul(max(dot(n, sunAxis).negate(), 0)));
        }
        acc.addAssign(vec4(dir.mul(w), w));
      });
    }
    return acc;
  })(), G[0] * G[1], G[2]);
  const bounceTex = gather(() => patches, true), skyTex = gather(() => portals, false);

  // what a surface at p facing n takes from a field
  const read = (tex, p, n) => {
    const g = p.sub(lo).div(size).mul(vec3(...G)).sub(0.5);
    const gx = clamp(g.x, 0, G[0] - 1), gy = clamp(g.y, 0, G[1] - 1), v = clamp(g.z, 0, G[2] - 1).add(0.5).div(G[2]);
    const y0 = floor(gy), y1 = min(y0.add(1), G[1] - 1);
    const f = mix(tex.sample(vec2(gx.add(0.5).add(y0.mul(G[0])).div(G[0] * G[1]), v)), tex.sample(vec2(gx.add(0.5).add(y1.mul(G[0])).div(G[0] * G[1]), v)), gy.sub(y0));
    // light from one spot falls off with the facing; light from all round does not
    const len = length(f.xyz), narrow = len.div(max(f.w, 1e-6));
    return f.w.mul(max(dot(n, f.xyz.div(max(len, 1e-6))).add(narrow.oneMinus()), 0).div(float(2).sub(narrow)));
  };

  return {
    // box: [[x0, y0, z0], [x1, y1, z1]] the room; patches and portals: [{ p0, du, dv }] rectangles whose du x dv points into the room
    set({ box, patches: pa = [], portals: po = [] }) {
      lo.value.set(...box[0]); size.value.set(box[1][0] - box[0][0], box[1][1] - box[0][1], box[1][2] - box[0][2]);
      patches = pa; portals = po;
    },
    bounce: (p, n) => read(bounceTex, p, n),
    sky: (p, n) => read(skyTex, p, n),
    bounceTex, skyTex,
  };
}
