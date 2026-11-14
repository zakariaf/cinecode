// The stage: one renderer, one scene (a tree of nodes), one camera, one sun, the
// fills that keep the shade alive, and the finishing pass (ink, glow, grade, vignette, grain).
// The light of a shot is a row of numbers (light.mjs); stage.setLight() takes it.
// stage.render() draws the scene as it stands and returns the pixels.
// Building a stage starts no GPU device: the host is loaded, and the device asked for,
// when the first frame is drawn. So a scene can be built, posed and checked anywhere.
import * as THREE from 'three/webgpu';
import { softShadowFilter, shadowUniforms, lookUniforms, hash12 } from './materials.mjs';
import {
  pass, mrt, uniform, vec2, vec3, vec4, float, screenUV, screenCoordinate, mix, smoothstep, dot, sin, max, min, saturate, luminance, pow,
  normalView, builtinAOContext, Fn, Loop, getViewPosition, lightShadowMatrix, texture, step, length, exp, abs, clamp,
  rtt, interleavedGradientNoise, vogelDiskSample, perspectiveDepthToViewZ, mx_noise_float, positionView,
  context, normalWorld, positionWorld, sRGBTransferOETF,
  If, floor, vertexStage, positionLocal, positionGeometry, attribute, buffer, modelViewMatrix, cameraProjectionMatrix,
} from 'three/tsl';
import { LIGHTS, sunDir, createField } from './light.mjs';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

// The light-ramp numbers (materials.mjs lookUniforms) are shared by every material in the process. Each new stage
// starts them from their defaults, so a scene's picture does not depend on which scene was opened before it.
const lookDefaults = Object.entries(lookUniforms).map(([name, u]) => [name, u.value]);

// How far each point of a surface moved on the screen since an earlier pose the stage was shown (`before`): the
// motion vector of the vector motion blur, in screen units (-1..1 across). Like three's VelocityNode, except that
// "earlier" is a pose at a fixed time before the frame, not whatever frame happened to be drawn last, so a frame
// stays a function of its time. A skinned body's earlier shape is skinned here from a copy of its earlier bones
// (three's own earlier bones are filled when a material is first built, so the first frame a process drew had
// none). A shape moved on the GPU by time alone (the curtain) counts as still.
class Motion extends THREE.Node {
  constructor(before) { super('vec2'); this.before = before; this.world = uniform(new THREE.Matrix4()); this.updateType = THREE.NodeUpdateType.OBJECT; }
  update({ object }) { this.world.value.copy(this.before.world.get(object) ?? object.matrixWorld); }
  setup({ object: o }) {
    const b = this.before;
    let was = positionLocal;
    if (o.isSkinnedMesh) {
      const m = buffer(b.bonesOf(o.skeleton), 'mat4', o.skeleton.bones.length), i = attribute('skinIndex', 'uvec4'), w = attribute('skinWeight', 'vec4');
      const p = uniform(o.bindMatrix).mul(vec4(positionGeometry, 1));
      was = uniform(o.bindMatrixInverse).mul(m.element(i.x).mul(p).mul(w.x).add(m.element(i.y).mul(p).mul(w.y)).add(m.element(i.z).mul(p).mul(w.z)).add(m.element(i.w).mul(p).mul(w.w))).xyz;
    }
    const now = vertexStage(cameraProjectionMatrix.mul(modelViewMatrix).mul(positionLocal)), then = vertexStage(b.proj.mul(b.view).mul(this.world).mul(was));
    return now.xy.div(now.w).sub(then.xy.div(then.w));
  }
}

// The scene is drawn twice as large each way (SS) and averaged down: 4 samples per pixel, resolved with a tent one
// pixel wide each side (at 1080p it looked the same as 9 samples and costs about 20 ms a frame less; see PERF.md).
// No multisampling: on this GPU it is not bit-for-bit repeatable when several processes share the GPU (see API.md,
// "Keeping the picture repeatable").
// rays: draw the sun's light in the air (a visible shaft where it comes through an opening).
const SS = 2;
export async function createStage({ width = 1280, height = 720, rays = false } = {}) {
  for (const [name, value] of lookDefaults) lookUniforms[name].value = value;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2f45);
  const air = new THREE.Scene();      // additive, glowing things in the air (see below); starts empty
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);

  // One sun for everything. Warm. Its shadow is a depth picture taken from the sun's
  // side over a box around the action; softShadowFilter blurs the edge.
  const sun = new THREE.DirectionalLight(0xffe6c4, 0.92);
  // (scenes may change sun.intensity / sun.color and fill.* to suit the hour)
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.012;
  sun.shadow.filterNode = softShadowFilter;
  scene.add(sun, sun.target);
  // Cool fill from above, warm fill from below (their strengths are in the colours).
  const fill = new THREE.HemisphereLight(0x8c9cff, 0xc0a0a8, 1);
  scene.add(fill);
  // One lamp, off until the light has a `lamp`; a set moves it to where its lamp stands.
  const lamp = new THREE.PointLight(0xffb468, 0, 0, 2);
  lamp.position.set(0, 2, 0);
  scene.add(lamp);

  // The sun shines along `dir`. Its shadow picture must cover everything the camera can
  // see: give either a centre and half-size (extent) or `box: [[x0,y0,z0],[x1,y1,z1]]`,
  // the part of the world that must be lit and shadowed, and the fit is worked out. `air`: the part of the box
  // whose sunlit air glows (default: all of it; a room keeps the air between the camera and the set clear).
  // What is left out keeps the value it was last given.
  let sunFit = { dir: [-0.55, -0.62, -0.35], center: [0, 1, 0], extent: 5, depth: 20, box: null, air: null };
  function setSun(fit = {}) {
    const { dir, center, extent, depth, box, air } = sunFit = { ...sunFit, ...fit };
    const d = new THREE.Vector3(...dir).normalize();
    const sc = sun.shadow.camera;
    if (box) {
      const c = new THREE.Vector3((box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2);
      // the shadow camera's own axes (it looks along d with "up" = world up)
      const z = d.clone().negate(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
      let ex = 0, ey = 0, ez = 0;
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(box[i & 1][0], box[(i >> 1) & 1][1], box[(i >> 2) & 1][2]).sub(c);
        ex = Math.max(ex, Math.abs(p.dot(x))); ey = Math.max(ey, Math.abs(p.dot(y))); ez = Math.max(ez, Math.abs(p.dot(z)));
      }
      const back = ez + (depth ?? 0);   // start well behind the box so anything up-sun still casts into it
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(d, -back);
      look.airMin.value.set(...(air ?? box)[0]); look.airMax.value.set(...(air ?? box)[1]);
      sc.left = -ex; sc.right = ex; sc.top = ey; sc.bottom = -ey; sc.near = 0.1; sc.far = back + ez + 0.1;
    } else {
      const c = new THREE.Vector3(...center);
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(d, -depth / 2);
      sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent;
      sc.near = 0.1; sc.far = depth;
    }
    sc.updateProjectionMatrix();
    shadowUniforms.range.value = sc.far - sc.near;
    shadowUniforms.texel.value = (sc.right - sc.left) / sun.shadow.mapSize.x;
    // the widest soft edge, and so how far round a point the search for what shades it reaches: 32 pixels of the
    // shadow picture, but never more than 12 cm. Over a garden (a picture 40 m wide, 1 cm a pixel) the search reached
    // 32 cm and mixed a near caster (a beard over a shirt) with far ones (a tree's crown); the estimate then jumped from
    // pixel to pixel and drew ragged, stippled blotches. In a room (about 2.5 mm a pixel) it stays 32.
    shadowUniforms.maxRadius.value = Math.min(32, 0.12 / shadowUniforms.texel.value);
    const az = d.clone().negate(), ax = new THREE.Vector3(0, 1, 0).cross(az).normalize(), ay = az.clone().cross(ax);
    shadowUniforms.axisX.value.copy(ax); shadowUniforms.axisY.value.copy(ay); shadowUniforms.axisD.value.copy(d);
    shadowUniforms.spanX.value = sc.right - sc.left; shadowUniforms.spanY.value = sc.top - sc.bottom;
  }

  function setCamera({ pos, target, fov, roll = 0 }) {
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(...pos);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(...target);
  }

  // Finishing. The first group is the scene's to change (stage.look.<name>.value = ...).
  const look = {
    vignette: uniform(0.2), grain: uniform(0.008), frame: uniform(0), occlusion: uniform(2.2), contact: uniform(0.3),
    rays: uniform(1.0),
    airMin: uniform(new THREE.Vector3(-1e3, -1e3, -1e3)), airMax: uniform(new THREE.Vector3(1e3, 1e3, 1e3)),   // only air inside this box glows (set by setSun's box)
    focus: uniform(8.0),        // metres from the camera to what is sharp
    blur: uniform(0.0),         // depth of field: how many pixels (at 720 lines) things far behind the focus are spread over; 0 = off
    paint: uniform(0.0),        // 0..1: how much of the brush filter (flat dabs with kept edges) is mixed in
    paper: uniform(0.0),        // strength of the still paper tooth over the whole picture
    shoulder: uniform(0.7),    // highlights above this roll off toward white instead of clipping
    ink: uniform(0.9),        // 0..1: the drawn line where one form stops in front of another and along creases
    inkColor: uniform(new THREE.Color(0.34, 0.2, 0.3)),   // what the picture is multiplied by under the line
    // The rest belong to the light (stage.light) and are written from it before every frame.
    bloom: uniform(0.1), glow: uniform(0.2), exposure: uniform(1.0), contrast: uniform(0.25), saturation: uniform(1.0),
    shadowTint: uniform(new THREE.Color(1, 1, 1)), lightTint: uniform(new THREE.Color(1, 1, 1)), lift: uniform(new THREE.Color(0)),
    rayDensity: uniform(0.05), rayColor: uniform(new THREE.Color(0xffd2a0)),
    shade: uniform(new THREE.Color(0)), bounce: uniform(new THREE.Color(0)), skyOpen: uniform(new THREE.Color(0)), outdoor: uniform(new THREE.Color(1, 1, 1)), dust: uniform(new THREE.Color(0)),
  };
  setSun();

  // The light of the shot: a row of LIGHTS by name, or the same numbers as an object (light.mjs). It aims the
  // sun at once (a setSun({ dir }) after it still wins); the colours and strengths are written to the lights
  // and the grade before every frame, so stage.light is the one place they are set.
  // bounceColor: the colour of the surfaces that throw the sun back (the set knows it).
  const stage = { bounceColor: new THREE.Color(0xd8b08c) };
  function setLight(light) {
    stage.light = typeof light === 'string' ? LIGHTS[light] : light;
    setSun({ dir: sunDir(stage.light.sun.az, stage.light.sun.el) });
  }
  setLight('noon');
  const scaled = (target, hex, k) => target.set(hex).multiplyScalar(k);
  function applyLight() {
    const L = stage.light, g = L.grade;
    sun.color.set(L.sun.color); sun.intensity = L.sun.power;
    scaled(fill.color, L.sky.color, L.sky.power); scaled(fill.groundColor, L.ground.color, L.ground.power);
    scaled(look.shade.value, L.shade.color, L.shade.power);
    look.bounce.value.set(L.sun.color).multiply(stage.bounceColor).multiplyScalar(L.sun.power * L.bounce);
    scaled(look.skyOpen.value, L.sky.color, L.sky.power * 3);        // the sky seen through an opening is far brighter than what it leaves in the room
    scaled(look.outdoor.value, L.outdoor.color, L.outdoor.power); scaled(look.dust.value, L.sun.color, L.sun.power * 0.45);
    look.rayColor.value.set(L.air.color); look.rayDensity.value = L.air.density;
    lamp.color.set(L.lamp?.color ?? 0); lamp.intensity = L.lamp?.power ?? 0;
    look.exposure.value = g.exposure; look.contrast.value = g.contrast; look.saturation.value = g.saturation;
    look.shadowTint.value.setRGB(...g.shadows); look.lightTint.value.setRGB(...g.lights); look.lift.value.setHex(g.lift, THREE.LinearSRGBColorSpace);
    look.bloom.value = g.bloom; look.glow.value = g.glow;
  }
  const scenePass = pass(scene, camera, { samples: 1 });
  scenePass.setResolutionScale(SS);
  // Is this point of the world in the sun? (the sun's shadow picture; it exists once the scene has been drawn)
  const sunLit = (p) => {
    const sp = lightShadowMatrix(sun).mul(vec4(p, 1)), sc = sp.xyz.div(sp.w);
    const inside = step(0, sc.x).mul(step(sc.x, 1)).mul(step(0, sc.y)).mul(step(sc.y, 1)).mul(step(0, sc.z)).mul(step(sc.z, 1));
    return texture(sun.shadow.map.depthTexture, vec2(sc.x, sc.y.oneMinus())).compare(sc.z).mul(inside);
  };
  // The fills every painted surface adds to the sky and ground light (materials.mjs reads `fill` from the pass):
  // the colour of the shade on what stands upright, the sun thrown back by the floor, the sky through the openings.
  // through: thin cloth also lets through what falls on its far side.
  const field = createField(sunLit, shadowUniforms.axisD);
  const fillLight = (through) => {
    const e = look.shade.mul(normalWorld.y.mul(normalWorld.y).oneMinus())
      .add(look.bounce.mul(field.bounce(positionWorld, normalWorld))).add(look.skyOpen.mul(field.sky(positionWorld, normalWorld)));
    return through > 0 ? e.add(look.skyOpen.mul(field.sky(positionWorld, normalWorld.negate())).mul(through)) : e;
  };
  const passContext = { fill: fillLight };
  // Soft darkening where surfaces crowd together (under the arm, between the legs,
  // where a foot meets the floor). A first pass records depth and surface direction;
  // the darkening is then applied to the fill light only, never to the sun.
  // (the first pass also records how far each point moved since the pose in `before`: the vector motion blur's input)
  const bones = new WeakMap();
  const before = { world: new WeakMap(), bonesOf: (sk) => bones.get(sk) ?? bones.set(sk, new Float32Array(sk.boneMatrices)).get(sk), view: uniform(new THREE.Matrix4()), proj: uniform(new THREE.Matrix4()) };
  const prePass = pass(scene, camera);
  prePass.setMRT(mrt({ output: normalView, motion: new Motion(before) }));
  const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode('output'), camera);
  aoPass.radius.value = 0.32; aoPass.thickness.value = 1.2; aoPass.samples.value = 32; aoPass.scale.value = 1.25;
  aoPass.distanceFallOff.value = 1; aoPass.distanceExponent.value = 1.4;
  // the raw result is speckled; average a small neighbourhood
  const aoTex = aoPass.getTextureNode();
  const px = vec2(1.6 / width, 1.6 / height);
  let aoSum = float(0);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) aoSum = aoSum.add(aoTex.sample(screenUV.add(vec2(i, j).mul(px))).r);
  // open, flat surfaces come out a little under 1 with a faint pattern; lift those to exactly 1
  const aoSoft = smoothstep(0.1, 0.9, aoSum.div(25));
  passContext.getAO = builtinAOContext(max(pow(aoSoft, look.occlusion), 0.4)).value.getAO;   // (never below 0.4: where arms crowd a chest in shade, the fill alone lights it, and it went near black)
  scenePass.contextNode = context(null, passContext);
  const full = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const near = uniform(camera.near), far = uniform(camera.far);
  // 0 where a point is at (or behind) the surface the camera sees there, rising to 1 once it is `range` metres in front
  const softDepth = (range = 0.05) => smoothstep(0, range, positionView.z.sub(perspectiveDepthToViewZ(sceneDepth.sample(screenUV).r, near, far)));
  const K = height / 720;                       // pixel sizes below are given for 720 lines and scaled to the picture
  const texel = vec2(1 / width, 1 / height);
  // the samples behind each output pixel: a tent one pixel wide each side over the 4 x 4 samples round the pixel
  // (weights 1 3 3 1), as 4 bilinear taps
  let col = vec4(0);
  for (const j of [-1, 1]) for (const i of [-1, 1]) col = col.add(full.sample(screenUV.add(vec2(i * 0.375 / width, j * 0.375 / height))));
  let c = col.div(4).rgb;
  c = c.mul(mix(float(1), pow(aoSoft, 2.0), look.contact));
  // The drawn line. Where one form stops in front of another the depth jumps, and along a crease the surface
  // turns sharply; both are read off the first pass. Only the pixels on the near side of a jump are drawn (the
  // far side as well drew every outline twice). Under the line the picture is multiplied by a dark plum, so the
  // line takes the colour of what it is drawn on. Its weight varies as a painter's does: one pixel where the
  // light is strong (and it is lost on a lit edge), two in shade and where a form stands far in front of what
  // is behind it, thinning as the jump dies away along the edge. Far things (the garden through a window, past
  // 12 m) get no line: an alpha-cut card drawn without supersampling broke into steps there.
  {
    const d0 = prePass.getTextureNode('depth'), n0 = prePass.getTextureNode('output');
    const dc = d0.sample(screenUV).r, z = perspectiveDepthToViewZ(dc, near, far).negate(), n = n0.sample(screenUV).xyz;
    const toMetres = z.mul(z).mul(far.sub(near)).div(far.mul(near));      // a step in stored depth here, in metres
    const jumpAt = (r) => {
      let jump = float(0);
      for (const [i, j] of [[1, 0], [0, 1]]) {
        const o = vec2(i, j).mul(texel).mul(K * r);
        // on a flat surface the stored depth runs straight across the screen, so this is zero there at any slant
        jump = max(jump, d0.sample(screenUV.add(o)).r.add(d0.sample(screenUV.sub(o)).r).sub(dc.mul(2)));
      }
      return jump.mul(toMetres);
    };
    let turn = float(0);
    for (const [i, j] of [[1, 0], [0, 1]]) {
      const o = vec2(i, j).mul(texel).mul(K);
      turn = max(turn, float(1).sub(min(dot(n, n0.sample(screenUV.add(o)).xyz), dot(n, n0.sample(screenUV.sub(o)).xyz))));
    }
    const m1 = jumpAt(1), m2 = jumpAt(2), dark = smoothstep(0.9, 0.25, luminance(c));
    const thin = max(smoothstep(0.02, 0.08, m1), smoothstep(0.25, 0.7, turn).mul(0.5));
    const thick = smoothstep(0.04, 0.3, m2).mul(dark);
    const line = max(thin, thick).mul(smoothstep(13, 11, z));
    c = c.mul(mix(vec3(1), look.inkColor, line.mul(look.ink).mul(smoothstep(1.1, 0.25, luminance(c)))));
  }
  // Light in the air (the shaft of sun through a window). For every pixel, walk from the
  // camera to the surface it sees and measure how much of that walk is in sunlight; the
  // sun's own shadow picture answers "is this point lit". The more lit air, the more glow.
  // It is drawn into a picture of its own and smoothed a little before it is added.
  const camPos = uniform(new THREE.Vector3());
  const projInv = uniform(camera.projectionMatrixInverse), camWorld = uniform(camera.matrixWorld);
  if (rays) {
    const air = Fn(() => {
      const depth = sceneDepth.sample(screenUV).r;
      const vp = getViewPosition(screenUV, depth, projInv);
      const end = camWorld.mul(vec4(vp, 1)).xyz;
      const span = end.sub(camPos);
      const N = 64;
      // each pixel starts its walk at a slightly different offset: a fixed pattern of the pixel alone, the same
      // in every frame, so still air does not shimmer
      const jitter = interleavedGradientNoise(screenCoordinate.xy);
      const sum = float(0).toVar();
      Loop(N, ({ i }) => {
        const p = camPos.add(span.mul(float(i).add(jitter).div(N)));
        const inAir = step(look.airMin.x, p.x).mul(step(p.x, look.airMax.x)).mul(step(look.airMin.y, p.y)).mul(step(p.y, look.airMax.y)).mul(step(look.airMin.z, p.z)).mul(step(p.z, look.airMax.z));
        sum.addAssign(sunLit(p).mul(inAir));
      });
      return sum.div(N).mul(length(span));     // metres of sunlit air along the line of sight
    });
    const airTex = rtt(vec4(air(), 0, 0, 1), width, height);
    let lit = float(0);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) lit = lit.add(airTex.sample(screenUV.add(vec2(i, j).mul(texel))).r);      // exactly one pixel apart: the walk offsets are a pattern that averages out over any 3 x 3 block
    const glowAir = float(1).sub(exp(lit.div(9).mul(look.rayDensity).negate()));
    c = c.add(look.rayColor.mul(glowAir).mul(look.rays));
  }
  // Things that float in the air and only add light (dust in a sunbeam) are drawn on
  // their own, without writing or testing depth. Instead each one fades out smoothly as
  // it nears the surface behind it (stage.softDepth). A hard in-front/behind test on
  // something a third of a pixel wide flips on the last bit of a depth value, and on this
  // GPU that last bit was not the same in every run when the machine was busy.
  const airPass = pass(air, camera);
  airPass.setResolutionScale(SS);
  c = c.add(airPass.getTextureNode('output').sample(screenUV).rgb);   // (one bilinear tap: the mean of the 2 x 2 samples)
  // --- the picture so far is added into `sum`, once per moment of the shutter with its share of the weight
  // (one moment: weight 1). The finishing below reads the sum, so moments are summed before it, not after.
  const sum = new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
  const share = uniform(1);
  const adder = new THREE.QuadMesh(new THREE.NodeMaterial());
  Object.assign(adder.material, { fragmentNode: vec4(c.mul(share), 1), blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false });
  const summed = texture(sum.texture);
  // Vector motion blur (McGuire et al. 2012, "A reconstruction filter for plausible motion blur"). Each pixel is
  // spread along the motion of the fastest thing near it (the largest vector in its tile and the 8 tiles round it),
  // so a moving thing smears over the still background as well as over itself; a sample counts when it is in front
  // and its own motion reaches this pixel, or when it is behind and this pixel's motion reaches it.
  const vectorOn = uniform(0);
  let beauty;
  {
    const T = Math.max(8, Math.round(16 * K)), tw = Math.ceil(width / T), th = Math.ceil(height / T), tiles = vec2(tw, th);
    const vel = prePass.getTextureNode('motion'), d0 = prePass.getTextureNode('depth');
    // pixels the shutter carries the point over, at most twice a tile (y down, like the picture)
    const motionAt = (uvn) => { const v = vel.sample(uvn).xy.mul(vec2(width / 2, -height / 2)); return v.mul(min(float(1), float(2 * T).div(max(length(v), 1e-4)))); };
    const longest = (src, n) => Fn(() => {
      const best = vec2(0).toVar();
      Loop(n, n, ({ i, j }) => {
        const v = src(vec2(i, j)).toVar();
        If(dot(v, v).greaterThan(dot(best, best)), () => { best.assign(v); });
      });
      return vec4(best, 0, 1);
    })();
    const tileMax = rtt(longest((ij) => motionAt(floor(screenUV.mul(tiles)).mul(T).add(ij).add(0.5).mul(texel)), T), tw, th);
    const near9 = rtt(longest((ij) => tileMax.sample(floor(screenUV.mul(tiles)).add(ij).sub(0.5).div(tiles)).xy, 3), tw, th);
    const zAt = (uvn) => perspectiveDepthToViewZ(d0.sample(uvn).r, near, far).negate();
    const blurNode = Fn(() => {
      const out = summed.sample(screenUV).rgb.toVar();
      const vn = near9.sample(floor(screenUV.mul(tiles)).add(0.5).div(tiles)).xy;
      If(vectorOn.greaterThan(0).and(length(vn).greaterThan(1)), () => {
        const S = 15, E = 0.1;          // samples along the motion; metres over which "in front" fades into "behind"
        const front = (za, zb) => saturate(float(1).sub(za.sub(zb).div(E)));       // a is not behind b
        const cone = (d, r) => saturate(float(1).sub(d.div(r)));
        const cylinder = (d, r) => float(1).sub(smoothstep(r.mul(0.95), r.mul(1.05), d));
        const rx = max(length(motionAt(screenUV)).mul(0.5), 0.5), zx = zAt(screenUV);
        const wsum = float(1).div(rx).toVar(), acc = out.mul(wsum).toVar();
        // a pattern of the pixel alone, the same in every frame, over half the gap between two samples: over the whole
        // gap the neighbouring pixels' samples differed so much that a smeared edge (a moving chin's shadow, an arm)
        // came out as a stipple of dots; over half, they agree enough and still leave no visible steps
        const jit = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(0.5);
        Loop(S, ({ i }) => {
          const s = float(i).add(0.5).add(jit).div(S).sub(0.5), off = vn.mul(s), d = length(off);
          const uy = screenUV.add(off.mul(texel));
          const ry = max(length(motionAt(uy)).mul(0.5), 0.5), zy = zAt(uy);
          const w = front(zy, zx).mul(cone(d, ry)).add(front(zx, zy).mul(cone(d, rx))).add(cylinder(d, ry).mul(cylinder(d, rx)).mul(2));
          acc.addAssign(summed.sample(uy).rgb.mul(w)); wsum.addAssign(w);
        });
        out.assign(acc.div(wsum));
      });
      return vec4(out, 1);
    });
    beauty = rtt(blurNode(), width, height);
  }
  // Two glows from the bright parts: a narrow one from what is hot (the sun on a rug, a rim), and a wide one
  // from everything light, so a window floods the air round it.
  const hot = bloom(beauty, 1, 0.3, 1.1), wide = bloom(beauty, 1, 1.0, 0.85);

  // Depth of field. Each pixel has a blur size from its distance to the focus (in front
  // or behind). A pixel gathers from its neighbours those whose own blur is wide enough
  // to reach it, so a blurred thing in front spreads over what is sharp behind it, and a
  // sharp thing keeps its edge against a blurred background.
  const blurAt = (uvn) => {
    const z = perspectiveDepthToViewZ(sceneDepth.sample(uvn).r, near, far).negate();     // metres in front of the camera
    return clamp(abs(z.sub(look.focus)).div(z).mul(look.blur), 0, 12).mul(K);
  };
  const dofNode = Fn(() => {
    const R = 12 * K, N = 40, unit = R * R / N;
    const phi = float(0);       // the same ring of neighbours for every pixel: no grain (the blur is small enough not to band)
    const c0 = blurAt(screenUV);
    const w0 = float(unit).div(max(c0.mul(c0), unit));
    const acc = beauty.sample(screenUV).rgb.mul(w0).toVar(), wsum = w0.toVar();
    for (let i = 0; i < N; i++) {
      const off = vogelDiskSample(i, N, phi).mul(R);
      const uvn = screenUV.add(off.mul(texel));
      const ci = blurAt(uvn), di = float(R * Math.sqrt((i + 0.5) / N));
      const w = smoothstep(di.sub(1), di.add(1), ci).mul(float(unit).div(max(ci.mul(ci), unit)));
      acc.addAssign(beauty.sample(uvn).rgb.mul(w)); wsum.addAssign(w);
    }
    return vec4(acc.div(wsum), 1);
  });
  const sharp = rtt(dofNode(), width, height);

  // The brush filter. Round each pixel look at eight overlapping fans of neighbours
  // (one per compass direction); the fans that are calm (little variation) win, so areas
  // go flat like dabs of paint while edges stay where they are.
  const brush = Fn(() => {
    const R = 3, taps = [];
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      if (i * i + j * j > R * R + 1) continue;
      taps.push({ i, j, v: sharp.sample(screenUV.add(vec2(i, j).mul(texel).mul(K))).rgb });
    }
    let out = vec3(0), wsum = float(0);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a);
      let m = vec3(0), m2 = float(0), n = 0;
      for (const t of taps) {
        const r = Math.hypot(t.i, t.j);
        let w = 1;
        if (r > 0) { const cs = (t.i * dx + t.j * dy) / r; w = Math.max(0, Math.min(1, (cs - 0.55) / 0.3)); }   // inside a fan about 100 degrees wide, soft-edged
        w *= Math.exp(-r * r / (2 * 2.2 * 2.2));
        if (w < 0.01) continue;
        m = m.add(t.v.mul(w)); m2 = m2.add(dot(t.v, t.v).mul(w)); n += w;
      }
      m = m.div(n);
      const variance = max(m2.div(n).sub(dot(m, m)), 0);
      const w = float(1).div(float(1).add(pow(variance.mul(2600).div(dot(m, m).add(0.02)), 4.0)));   // calm fans count, busy ones do not
      out = out.add(m.mul(w)); wsum = wsum.add(w);
    }
    const centre = sharp.sample(screenUV).rgb;
    return mix(centre, out.div(max(wsum, 1e-4)), look.paint.mul(smoothstep(0.0, 0.02, wsum)));
  });
  c = brush();
  const q = screenUV.sub(0.5);
  c = c.add(hot.rgb.mul(look.bloom)).add(wide.rgb.mul(look.glow)).mul(float(1).sub(dot(q, q).mul(look.vignette).mul(2.2)));
  // the grade, in light: gentle saturation, then the split tone (the darks lean one way, the lights another)
  const l = luminance(c);
  c = mix(vec3(l), c, look.saturation);
  const darks = saturate(l.div(0.3)).oneMinus(), lights = saturate(l.sub(0.25).div(0.9));
  c = c.mul(mix(vec3(1), look.shadowTint, darks.mul(darks))).mul(mix(vec3(1), look.lightTint, lights)).mul(look.exposure);
  // highlights roll off: below the shoulder the picture is untouched, above it the brightest channel bends toward
  // the white of the paper (0.92, a little under full white, so a sunlit wall keeps its texture instead of clipping)
  // and only reaches it far away, and the other two are scaled with it, so a sunlit orange stays orange (bending
  // each channel alone turned it yellow) and the lightest parts of the picture still have steps in them; the
  // hottest pale parts lean toward white (a sunlit cream wall reads cream, not peach; an orange dress stays orange)
  c = max(c, 0);
  const top = max(max(c.r, c.g), c.b), hi = max(top.sub(look.shoulder), 0), room = float(0.92).sub(look.shoulder), over = hi.div(hi.add(room));
  const bent = min(top, look.shoulder).add(room.mul(over));
  const pale = luminance(c).div(max(top, 1e-5));
  c = mix(c.mul(bent.div(max(top, 1e-5))), vec3(bent), over.mul(over).mul(pale).mul(pale).mul(0.6));
  // From here on the numbers are what the screen shows (the picture is no longer converted on the way out), so
  // the curve, the lift and the grain act evenly on darks and lights. Grain added in light instead boils in
  // the darks: one step there is many steps on screen.
  c = sRGBTransferOETF(c);
  // an S-curve, full strength in the darks and gentler in the lights (the shoulder has already bent those)
  c = c.add(c.mul(c).mul(c.mul(-2).add(3)).sub(c).mul(look.contrast.mul(mix(float(1), float(0.4), smoothstep(0.3, 0.7, c)))));
  c = look.lift.add(look.lift.oneMinus().mul(c));                            // nothing is darker than the lift
  // paper: a still tooth (the same in every frame), plus fine grain that changes per frame
  const pp = screenCoordinate.xy.div(K);
  const tooth = mx_noise_float(vec3(pp.mul(0.11), 3.7)).mul(0.55).add(mx_noise_float(vec3(pp.mul(0.035), 9.1)).mul(0.45));
  c = c.mul(float(1).add(tooth.mul(look.paper)));
  // (the frame's offset is kept under 4096: the hash is in 32-bit floats, and at frame 43200 (30 minutes) an offset of
  // 1.6 million left it so few bits that the grain became a tile 97 px wide; it now repeats every 4096 frames)
  const g = hash12(screenCoordinate.xy.add(vec2(look.frame.mul(37.0).mod(4096.0), look.frame.mul(17.0).mod(4096.0)))).sub(0.5);
  c = c.add(g.mul(look.grain));
  const outputNode = vec4(max(c, 0), 1);

  // The GPU side, made at the first render(): the host's surface, three.js's renderer on it, the pipeline of passes.
  let surface = null, renderer = null, pipeline = null, fault = null;
  async function start() {
    const { createSurface } = await import('./host-node.mjs');
    surface = await createSurface(width, height);
    renderer = new THREE.WebGPURenderer({ canvas: surface.canvas, device: surface.device, antialias: false });
    // (three.js only logs a GPU's errors and a lost device, and the frame comes back wrong: render() throws them)
    renderer.onError = (e) => { fault ??= new Error(`the GPU reported an error (${e.type}): ${e.message}`); };
    renderer.onDeviceLost = (e) => { fault ??= new Error(`the GPU device was lost: ${e.message}`); };
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.NoToneMapping;
    pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;      // the grade above already ends in screen values
    pipeline.outputNode = outputNode;
  }

  // Draws the scene as it stands, or, given pose(dt) (poses the scene dt seconds from the frame's time), with
  // motion blur over a shutter open for `shutter` seconds round the frame:
  //   'none'       one moment, pose(0)
  //   'vector'     pose(-shutter) is remembered, then pose(0) is drawn and smeared along how far each point moved
  //   'moments:N'  N moments spread over the shutter, each with its own sub-pixel shift of the camera, summed
  // Resolves to the picture as RGBA bytes, top row first: a new Buffer, or `into` written over.
  async function render(frame = 0, { blur = 'none', pose, shutter = 0.5 / 24, into } = {}) {
    if (!renderer) await start();
    look.frame.value = frame;
    const n = pose && blur.startsWith('moments:') ? Number(blur.slice(8)) : 1;
    vectorOn.value = blur === 'vector' && pose ? 1 : 0;
    if (vectorOn.value) { pose(-shutter); remember(); }
    for (let i = 0; i < n; i++) {
      if (n === 1) pose?.(0);
      else {
        pose(((i + 0.5) / n - 0.5) * shutter);
        // a rotated grid of shifts inside one of the SS x SS samples of a pixel
        camera.setViewOffset(width, height, ((i + 0.5) / n - 0.5) / SS, (((i * 2 + 1) % n + 0.5) / n - 0.5) / SS, width, height);
      }
      draw(i === 0, 1 / n);
    }
    if (n > 1) camera.clearViewOffset();
    pipeline.render();
    const px = await surface.read(into);
    if (fault) throw fault;
    return px;
  }
  // One moment: everything up to the finishing, added into `sum` with the given weight.
  function draw(first, weight) {
    applyLight();
    // three.js normally advances its frame counter from a browser animation loop;
    // there is none here, so advance it by hand (and keep its clock off the wall clock).
    const nf = renderer._nodes.nodeFrame;
    nf.frameId++; nf.time = look.frame.value / 24; nf.deltaTime = 1 / 24;
    renderer.info.frame = nf.frameId;
    scene.updateMatrixWorld(true);
    // the light in the air and the bounced light read the sun's shadow picture, which only exists
    // once the scene has been drawn; so the very first time, draw the scene once plainly
    if (!sun.shadow.map) renderer.render(scene, camera);
    camera.updateMatrixWorld(true);
    camPos.value.copy(camera.position);
    near.value = camera.near; far.value = camera.far;
    share.value = weight;
    renderer.setRenderTarget(sum);
    renderer.autoClear = first;
    adder.render(renderer);
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
  }
  // The earlier pose for the motion vectors: where every object and bone is now, and the camera.
  function remember() {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      let m = before.world.get(o);
      if (!m) before.world.set(o, m = new THREE.Matrix4());
      m.copy(o.matrixWorld);
      if (o.skeleton) { o.skeleton.update(); before.bonesOf(o.skeleton).set(o.skeleton.boneMatrices); }
    });
    before.view.value.copy(camera.matrixWorldInverse); before.proj.value.copy(camera.projectionMatrix);
  }

  // Lets go of the GPU. A stage that never rendered has nothing to let go of.
  function close() { if (renderer) { renderer.dispose(); surface.close(); } }

  return Object.assign(stage, { THREE, scene, air, softDepth, camera, sun, fill, lamp, look, setSun, setLight, setBounce: field.set, setCamera, render, close, width, height });
}
