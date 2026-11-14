// The painted look. One lighting model for everything in a film:
//   - the sun gives a soft-edged warm light (a smooth ramp instead of a hard toon step),
//   - the sky/room ambient fills the shadows with cool colour (never black),
//   - a warm band sits on the terminator (the edge between light and shadow),
//   - a rim of sun catches edges that face the light.
// Surfaces also get a little painted value variation from procedural noise.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, color, uniform, mix, smoothstep, saturate, pow, dot, max, add, clamp, fract, sin,
  normalView, positionViewDirection, diffuseColor, attribute, positionLocal, normalWorld,
  mx_noise_float, mx_fractal_noise_float, screenCoordinate, texture, reference, renderGroup,
  vogelDiskSample, abs, textureLoad, ivec2, step, luminance,
} from 'three/tsl';

// A number from 0 to 1 for a pixel position: the same every run, with no visible pattern
// (the usual sin() hash draws diagonal stripes on a GPU once the numbers get large).
export const hash12 = Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

export const lookUniforms = {
  rampLo: uniform(0.0),      // N.L where the light starts
  rampHi: uniform(0.62),     // N.L where the light is full
  rim: uniform(0.55),
};

class PaintLightingModel extends THREE.LightingModel {
  constructor(opts) { super(); this.opts = opts; }
  direct({ lightDirection, lightColor, reflectedLight }) {
    const o = this.opts;
    // the edge of the light is nudged by paint noise so it breaks up like a brush stroke
    const ndl = normalView.dot(lightDirection).add(o.brush);
    const lit = smoothstep(lookUniforms.rampLo, lookUniforms.rampHi, ndl);
    const albedo = diffuseColor.rgb;
    // (sun < 1: the paint takes less of the direct light than its colour says, and the same fills; see paint())
    if (o.sun !== 1) lightColor = lightColor.mul(o.sun);
    reflectedLight.directDiffuse.addAssign(lightColor.mul(lit).mul(albedo));
    // warm terminator band (a cheap stand-in for light scattering in skin/cloth)
    if (o.scatter > 0) {
      const band = smoothstep(-0.05, 0.22, ndl).mul(smoothstep(0.75, 0.25, ndl));
      reflectedLight.directDiffuse.addAssign(lightColor.mul(band).mul(albedo).mul(o.scatterColor).mul(o.scatter));
    }
    // thin cloth lit from behind glows on the side we see (a curtain against a window)
    if (o.through > 0) {
      const back = smoothstep(-0.1, 0.6, ndl.negate());
      reflectedLight.directDiffuse.addAssign(lightColor.mul(back).mul(albedo).mul(o.throughColor).mul(o.through));
    }
    // rim: edges turned to the light catch it
    const fres = pow(saturate(float(1).sub(normalView.dot(positionViewDirection))), 3.0);
    const rim = fres.mul(smoothstep(-0.1, 0.5, ndl)).mul(lookUniforms.rim).mul(o.rim);
    reflectedLight.directDiffuse.addAssign(lightColor.mul(rim).mul(mix(albedo, vec3(1), 0.35)));
  }
  indirect(builder) {
    const { ambientOcclusion, irradiance, reflectedLight, fill } = builder.context;
    // sky from above and ground from below (the stage's hemisphere light), plus the stage's other fills when the
    // pass being drawn has them: the shade colour on uprights, the sun thrown back by the floor, sky through openings
    let light = fill ? irradiance.add(fill(this.opts.through)) : irradiance;
    // (keepHue: the fills light it as a neutral grey of their strength, so a saturated paint, a teal car, keeps its
    // own colour in shade instead of going navy under the cool fills or green under a warm one)
    if (this.opts.keepHue) light = vec3(1.0, 1.0, 0.97).mul(luminance(light));
    // in shade a surface keeps its hue (the fills make it cool) but dark things (hair, wood) go much darker, light
    // ones (a cream wall) hardly change; a keepHue paint is darkened by its own lightness far less (to the power
    // 0.2, not 0.6), so a mid teal in shade stays the same car as in the sun, only darker
    const albedo = diffuseColor.rgb;
    reflectedLight.indirectDiffuse.addAssign(light.mul(albedo).mul(pow(max(luminance(albedo), 1e-4), this.opts.keepHue ? 0.2 : 0.6)).mul(1.2));
    reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
  }
}

class PaintMaterial extends THREE.NodeMaterial {
  static get type() { return 'PaintMaterial'; }
  constructor(opts) {
    super();
    this.lights = true;
    this.paint = opts;
  }
  setupLightingModel() { return new PaintLightingModel(this.paint); }
  // (three.js keys a program by the material's nodes, not its lighting model)
  customProgramCacheKey() { return super.customProgramCacheKey() + (this.paint.keepHue ? ':keepHue' : '') + (this.paint.sun !== 1 ? ':sun' + this.paint.sun : ''); }
}

// "Rest" position: where the point sits on the un-posed character or object. Patterns
// and paint noise are computed there so they stick to the surface as it moves.
const restPos = (useRest) => useRest ? attribute('rest', 'vec3') : positionLocal;

// paint({ color, vertexColors, mottle, scatter, rim, pattern })
//   color:        base colour (hex or THREE.Color)
//   vertexColors: multiply by the mesh's per-vertex colour (characters use this for tints)
//   mottle:       0..1 amount of soft painted value/hue variation
//   pattern:      optional (p, base) => colour node, p is the rest position
//   sun:          how much of the direct light (sun, lamp) the paint takes, 1 = all. Below 1 a light-coloured thing
//                 that must keep its colour in full sun (a ginger cat) stays under the picture's highlight shoulder,
//                 which bends anything brighter toward the paper's white; its shade (the fills) is as its colour says.
export function paint(o = {}) {
  const opts = {
    scatter: o.scatter ?? 0.25,
    scatterColor: color(o.scatterColor ?? 0xff8a50),
    rim: o.rim ?? 1,
    through: o.through ?? 0,
    throughColor: color(o.throughColor ?? 0xffd9a8),
    keepHue: o.keepHue ?? false,
    sun: o.sun ?? 1,
  };
  const p = restPos(o.rest ?? false);
  const bs = o.brushScale ?? 20;
  opts.brush = mx_noise_float(p.mul(bs)).mul(0.6).add(mx_noise_float(p.mul(bs * 3.3).add(3.1)).mul(0.4)).mul(o.brush ?? 0.045);
  const m = new PaintMaterial(opts);
  let c = color(o.color ?? 0xffffff);
  if (o.vertexColors) c = c.mul(attribute('color', 'vec3'));
  if (o.pattern) c = o.pattern(p, c);
  const mottle = o.mottle ?? 0.12;
  if (mottle > 0) {
    const s = o.mottleScale ?? 5.0;
    const n = mx_fractal_noise_float(p.mul(s), 3, 2.0, 0.5).mul(0.5).add(0.5); // about 0..1
    const n2 = mx_noise_float(p.mul(s * 3.1).add(7.3)).mul(0.5).add(0.5);
    const v = n.mul(0.75).add(n2.mul(0.25)).sub(0.5).mul(2 * mottle);
    // brighter patches go a touch warmer, darker a touch cooler
    c = c.mul(vec3(float(1).add(v.mul(1.1)), float(1).add(v), float(1).add(v.mul(0.8))));
    // dry-brush strokes: long soft-edged dabs a little lighter or darker, laid along the form (in its rest
    // position, so they stay put on a moving body); as strong as the mottle, so faces (little mottle) stay clean
    const st = smoothstep(0.3, 0.7, mx_noise_float(p.mul(vec3(s * 2.6, s * 0.7, s * 2.6)).add(5.3)).mul(0.5).add(0.5));
    c = c.mul(float(1).add(st.sub(0.5).mul(mottle * 1.4)));
  }
  m.colorNode = c;
  if (o.side) m.side = o.side;
  return m;
}

// A node that is `inColour` in the stage's colour pass and `other` in every other pass (the colour pass is the one
// whose context carries the fills: stage.mjs scenePass; the first pass, which feeds the ink line, the occlusion and
// the motion blur, the sun's shadow pass and the plain warm-up draw do not). An opacity of colourPassOnly(x) draws a
// see-through thing (glass, a soft shadow on the ground) in the colour only, so the line, the occlusion and the blur
// see what is behind it. (Its fields are not called a, b: TSL reads .a on a node as its alpha.)
class InColourPass extends THREE.Node {
  constructor(inColour, other) { super('float'); this.inColour = inColour; this.other = other; }
  setup(builder) { return builder.context.fill ? this.inColour : this.other; }
}
export const colourPassOnly = (node) => new InColourPass(node, float(0));

// Flat, unlit colour (eye highlights, sky behind a window).
export function flat(hex) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = color(hex);
  return m;
}

// Soft shadow whose edge widens with distance from what casts it (as the sun's does):
// sharp where a foot meets the floor, soft where the same shadow lands metres away on
// a wall. First a small search of the sun's depth picture finds how far in front the
// casters are; that sets the size of the disc the shadow is then averaged over.
//   radius on the light is the smallest disc, in shadow-picture pixels.
export const shadowUniforms = {
  range: uniform(20.0),         // metres between the shadow picture's near and far planes (set by stage.setSun)
  texel: uniform(0.003),        // metres per pixel of the shadow picture
  spread: uniform(0.009),        // tangent of the sun's apparent half-width: blur grows this many metres per metre of distance
  maxRadius: uniform(32.0),     // largest disc, in pixels
  // the shadow picture's own axes in the world (right, up, and the way the sun shines) and its width and height in metres
  axisX: uniform(new THREE.Vector3(1, 0, 0)), axisY: uniform(new THREE.Vector3(0, 1, 0)), axisD: uniform(new THREE.Vector3(0, 0, -1)),
  spanX: uniform(10.0), spanY: uniform(10.0),
};
export const softShadowFilter = Fn(({ depthTexture, shadowCoord, shadow }) => {
  const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
  const radius = reference('radius', 'float', shadow).setGroup(renderGroup);
  // the disc is turned a quarter turn more at each of the 2 x 2 samples the stage averages into one pixel, so
  // every pixel's shadow is an average over 4 x 32 directions: smooth, with none of the stipple a per-sample
  // random turn left in soft edges
  const q = screenCoordinate.xy.mul(0.5).fract().mul(2).floor();
  const phi = q.x.add(q.y.mul(2)).mul(Math.PI / 2).add(0.3);
  // Follow the slope of the surface being shaded: each sample compares against the depth
  // the surface itself would have at that spot. Without this a floor lit by a low sun
  // shadows itself. The slope is worked out from the surface's own direction (its normal)
  // seen from the sun. (An earlier version took it from how the shadow coordinate changes
  // between neighbouring pixels; in creases that is a division by almost nothing, and
  // its result was not the same in every run when several programs shared the GPU.)
  const nW = normalWorld, nd = dot(nW, shadowUniforms.axisD);
  const k = float(1).div(max(abs(nd), 0.04)).mul(nd.greaterThan(0).select(float(1), float(-1)));
  const gx = dot(nW, shadowUniforms.axisX).mul(k).negate().mul(shadowUniforms.spanX.div(shadowUniforms.range));
  const gy = dot(nW, shadowUniforms.axisY).mul(k).mul(shadowUniforms.spanY.div(shadowUniforms.range));
  const rMax = shadowUniforms.maxRadius.div(mapSize.x);
  const lim = float(0.03).div(rMax);                    // never shift the depth by more than this over the largest disc
  const grad = vec2(clamp(gx, lim.negate(), lim), clamp(gy, lim.negate(), lim));
  // 1. how far in front of this point are the things that shade it?
  const NB = 14;
  let bsum = float(0), bcount = float(0);
  for (let i = 0; i < NB; i++) {
    const off = vogelDiskSample(i, NB, phi.add(1.7)).mul(rMax);
    const d = textureLoad(depthTexture, ivec2(shadowCoord.xy.add(off).mul(mapSize))).r;
    const isBlocker = step(d, shadowCoord.z.add(dot(off, grad)).sub(0.0012));
    bsum = bsum.add(d.mul(isBlocker)); bcount = bcount.add(isBlocker);
  }
  const gap = shadowCoord.z.sub(bsum.div(max(bcount, 1))).mul(shadowUniforms.range);      // metres from caster to here
  const rPix = clamp(gap.mul(shadowUniforms.spread).div(shadowUniforms.texel), radius, shadowUniforms.maxRadius);
  const r = rPix.div(mapSize.x);
  // 2. average the shadow over a disc of that size
  const N = 32;
  let sum = float(0);
  for (let i = 0; i < N; i++) {
    const off = vogelDiskSample(i, N, phi).mul(r);
    sum = sum.add(texture(depthTexture, shadowCoord.xy.add(off)).compare(shadowCoord.z.add(dot(off, grad))));
  }
  return sum.mul(1 / N);
});
