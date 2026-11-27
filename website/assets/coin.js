// The hero coin: a copper penny struck with Penny's two-bar mark, drawn in plain WebGL (no 3D library, no
// textures, no models: the relief, the reeded edge and the studio lighting are all computed in the shader).
// One move: a close pass along the edge, a turn that shows the mark, then a pull-back that stands the coin
// in front of a real screen. The page works without any of this: see the static poster in the markup.
//
//   const coin = createCoin(canvas, { theme: "light", reduced: false, placement: () => ({ x, y, r }) })
//   coin.play() / coin.rest() / coin.setTheme("dark") / coin.destroy()

const VERT = `
attribute vec3 aPos; attribute vec3 aNrm; attribute float aKind;
uniform mat4 uVP; uniform mat3 uRot; uniform vec2 uShift;
varying vec3 vObj; varying vec3 vNrm; varying vec3 vWorld; varying float vKind;
void main() {
  vObj = aPos; vNrm = aNrm; vKind = aKind;
  vWorld = uRot * aPos;
  vec4 c = uVP * vec4(vWorld, 1.0);
  c.xy += uShift * c.w;               // lens shift: places the coin on the stage without bending its perspective
  gl_Position = c;
}`;

// Everything is lit by a small procedural studio: a sky-to-floor gradient, a broad key softbox, a narrow rim
// strip and one black flag. Rougher surfaces see a blurrier version of the same room.
const FRAG = `
precision highp float;
varying vec3 vObj; varying vec3 vNrm; varying vec3 vWorld; varying float vKind;
uniform mat3 uRot; uniform vec3 uEye;
uniform float uSweep;                 // turns the room around the coin during the reveal
uniform vec3 uSky, uHorizon, uFloor;  // room gradient
uniform vec3 uKey, uRim;              // softbox colours (pre-multiplied by intensity)
uniform float uFlag, uExposure, uKeySize;

float sdPill(vec2 p, vec2 c, vec2 hs) {       // rounded bar: the mark is two of these
  vec2 q = abs(p - c) - vec2(0.0, hs.y - hs.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - hs.x;
}
float relief(vec2 p) {
  float mark = min(sdPill(p, vec2(-0.165, 0.0), vec2(0.088, 0.245)), sdPill(p, vec2(0.165, 0.0), vec2(0.088, 0.245)));
  float h = smoothstep(0.022, -0.022, mark);                      // the two bars, raised with a soft shoulder
  float r = length(p), a = atan(p.y, p.x);
  float bead = smoothstep(0.02, 0.0, abs(r - 0.775)) * (0.5 + 0.5 * cos(a * 96.0));
  return h + 0.28 * bead;                                         // a ring of beads inside the rim
}
float band(float x, float hw, float soft) { return smoothstep(hw + soft, hw - soft, abs(x)); }
vec3 room(vec3 d, float rough) {
  float c = cos(uSweep), s = sin(uSweep);
  d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  float soft = 0.05 + rough * 0.9;
  vec3 col = mix(uHorizon, uSky, smoothstep(-0.1, 0.9, d.y));
  col = mix(col, uFloor, smoothstep(0.15, -0.5, d.y));
  // Key: a wide softbox above and in front. Rim: a tall strip behind the shoulder.
  vec3 k = normalize(vec3(-0.45, 0.62, 0.64));
  vec3 ku = normalize(cross(vec3(0.0, 1.0, 0.0), k)), kv = cross(k, ku);
  col += uKey * band(dot(d, ku), uKeySize, soft) * band(dot(d, kv), uKeySize * 0.62, soft) * step(0.0, dot(d, k));
  vec3 r = normalize(vec3(0.82, 0.18, -0.54));
  vec3 ru = normalize(cross(vec3(0.0, 1.0, 0.0), r)), rv = cross(r, ru);
  col += uRim * band(dot(d, ru), 0.07, soft * 0.6) * band(dot(d, rv), 0.75, soft) * step(0.0, dot(d, r));
  // A black flag low on the opposite side: gives the metal something dark to reflect, so it keeps its edge.
  vec3 f = normalize(vec3(0.7, -0.12, 0.7));
  col *= 1.0 - uFlag * smoothstep(0.55 - soft * 0.3, 0.92, dot(d, f));
  return col;
}
void main() {
  vec3 n = normalize(vNrm);
  float rough = 0.3;
  float raised = 0.0;
  if (vKind < 1.5) {                                              // a face: add the struck relief
    float side = vKind < 0.5 ? 1.0 : -1.0;
    vec2 p = vec2(vObj.x * side, vObj.y);
    float e = 0.004;
    float h = relief(p);
    vec2 g = vec2(relief(p + vec2(e, 0.0)) - relief(p - vec2(e, 0.0)), relief(p + vec2(0.0, e)) - relief(p - vec2(0.0, e))) / (2.0 * e);
    float field = smoothstep(0.84, 0.8, length(p));               // relief only inside the rim
    // A faint dome across the field, so the mirror shows a gradient of the room instead of one flat tone.
    n = normalize(vec3((-g.x * 0.03 * field + p.x * 0.2) * side, -g.y * 0.03 * field + p.y * 0.2, side));
    raised = h * field;
    rough = mix(0.16, 0.4, clamp(raised, 0.0, 1.0));              // mirror field, frosted relief: a proof strike
  } else if (vKind < 2.5) {                                       // the edge wall: reeding
    float a = atan(vObj.y, vObj.x);
    float reed = sin(a * 150.0);
    vec3 t = vec3(-sin(a), cos(a), 0.0);
    n = normalize(n + t * reed * 0.75 * smoothstep(0.062, 0.046, abs(vObj.z)));
    rough = 0.34;
  } else { rough = 0.26; }                                        // rim and bevels
  n = normalize(uRot * n);
  vec3 v = normalize(uEye - vWorld);
  float nv = max(dot(n, v), 0.0);
  vec3 copper = mix(vec3(0.95, 0.5, 0.31), vec3(0.98, 0.62, 0.42), raised);
  vec3 fres = copper + (1.0 - copper) * pow(1.0 - nv, 5.0);
  vec3 col = room(reflect(-v, n), rough) * fres;
  col += room(n, 1.0) * copper * 0.1;                            // a little body, so recesses never go dead black
  col = 1.0 - exp(-col * uExposure);                              // filmic shoulder
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// The ground under the standing coin: a tight contact shadow, a soft penumbra and (in the dark room) a pool of light.
const G_VERT = `
attribute vec2 aQ; uniform mat4 uVP; uniform vec2 uShift; varying vec2 vG;
void main() { vG = aQ * 3.2; vec4 c = uVP * vec4(vG.x, -1.0, vG.y, 1.0); c.xy += uShift * c.w; gl_Position = c; }`;
const G_FRAG = `
precision highp float;
varying vec2 vG; uniform vec2 uDir; uniform float uShadow, uPool, uGrounded;
void main() {
  float along = clamp(dot(vG, uDir), -0.93, 0.93);
  float d = length(vG - uDir * along);
  float contact = smoothstep(0.16, 0.0, d);
  vec2 q = vG - vec2(0.55, -0.25);                                // penumbra falls away from the key light
  float soft = exp(-dot(q, q) * 0.9) * 0.62;
  float a = clamp((contact * uGrounded + soft) * uShadow * uGrounded, 0.0, 1.0);
  float pool = uPool * exp(-dot(vG, vG) * 0.32) * uGrounded;
  vec3 lit = vec3(1.0, 0.96, 0.92) * pool * (1.0 - a);
  gl_FragColor = vec4(lit, a + pool * (1.0 - a) * 0.0);           // premultiplied: shadow darkens, pool adds
}`;

const THEMES = {
  // Daylight studio: bright room, one flag for edge definition, a shadow you can read on a pale page.
  light: { sky: [1.25, 1.25, 1.3], horizon: [0.5, 0.49, 0.53], floor: [0.3, 0.27, 0.28], key: [3.4, 3.2, 3.0], rim: [1.6, 1.6, 1.9], keySize: 0.46, flag: 0.92, exposure: 1.05, shadow: 0.6, pool: 0 },
  // Screening room: a broad key and a thin controlled rim. No glow; the floor only catches a little of the key.
  dark: { sky: [0.16, 0.16, 0.19], horizon: [0.05, 0.047, 0.055], floor: [0.06, 0.045, 0.04], key: [3.0, 2.85, 2.7], rim: [1.9, 1.8, 2.4], keySize: 0.66, flag: 0.5, exposure: 1.25, shadow: 0.75, pool: 0.06 },
};

// ---- Geometry: a lathe. Each segment of the profile gets its own normals, so bevels stay crisp.
function buildCoin(seg = 160) {
  const T = 0.07; // half thickness
  // (radius, z) around the rim, front face first.
  const prof = [
    [0, T - 0.012], [0.86, T - 0.012], // face field (front)
    [0.895, T], [0.965, T], // rim
    [1.0, T - 0.03], // bevel
    [1.0, -(T - 0.03)], // edge wall
    [0.965, -T], [0.895, -T], // rim (back)
    [0.86, -(T - 0.012)], [0, -(T - 0.012)], // face field (back)
  ];
  const EDGE = 4; // the segment from the bevel down the edge wall
  const pos = [], nrm = [], kind = [], idx = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, z0] = prof[i], [r1, z1] = prof[i + 1];
    // What the shader draws on this band: 0 front face, 1 back face, 2 reeded edge, 3 rim and bevels.
    let k = 3;
    if (i === 0) k = 0;
    else if (i === prof.length - 2) k = 1;
    else if (i === EDGE) k = 2;
    // Outward normal of the segment in the (r, z) plane.
    let nr = z0 - z1, nz = r1 - r0;
    const len = Math.hypot(nr, nz) || 1;
    nr /= len; nz /= len;
    const base = pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(r0 * c, r0 * sn, z0, r1 * c, r1 * sn, z1);
      nrm.push(nr * c, nr * sn, nz, nr * c, nr * sn, nz);
      kind.push(k, k);
      if (s < seg) { const b = base + s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), kind: new Float32Array(kind), idx: new Uint16Array(idx) };
}

// ---- Tiny math
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic
const out = (t) => 1 - Math.pow(1 - t, 4);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
function rotYX(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  // R = Rx(pitch) * Ry(yaw) * Rz(roll), column-major mat3
  const a = [cy * cz, -cy * sz, sy], b = [sz, cz, 0], c = [-sy * cz, sy * sz, cy]; // rows of Ry*Rz
  const r0 = a, r1 = [cx * b[0] - sx * c[0], cx * b[1] - sx * c[1], cx * b[2] - sx * c[2]], r2 = [sx * b[0] + cx * c[0], sx * b[1] + cx * c[1], sx * b[2] + cx * c[2]];
  return new Float32Array([r0[0], r1[0], r2[0], r0[1], r1[1], r2[1], r0[2], r1[2], r2[2]]);
}

const FOV = (28 * Math.PI) / 180, F = 1 / Math.tan(FOV / 2), CAM_PITCH = 0.14;

export function createCoin(canvas, opts) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const program = (v, f) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, v)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  };
  let coinP, groundP;
  try { coinP = program(VERT, FRAG); groundP = program(G_VERT, G_FRAG); } catch (e) { console.warn("coin:", e.message); return null; }

  const mesh = buildCoin();
  const buf = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const bPos = buf(mesh.pos), bNrm = buf(mesh.nrm), bKind = buf(mesh.kind), bIdx = buf(mesh.idx, gl.ELEMENT_ARRAY_BUFFER);
  const bQuad = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  const attr = (p, name, b, size) => { const l = gl.getAttribLocation(p, name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };

  // ---- State. `t` is the reveal's progress (0 opening, 1 resting); theme values ease on their own clock,
  // so switching theme mid-reveal changes the room and nothing else.
  let t = opts.reduced ? 1 : 0, playing = false, start = 0, raf = 0, visible = true, dead = false;
  let spin = 0, spinV = 0, dragging = false; // extra yaw from a drag or the arrow keys; springs back
  const cur = structuredClone(THEMES[opts.theme] ?? THEMES.light);
  let target = THEMES[opts.theme] ?? THEMES.light;
  const DURATION = 3400;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
  }

  function pose() {
    // Three frames, one continuous dolly-out. Sizes are the coin's radius as a fraction of the stage height.
    const rest = opts.placement(); // { x, y: centre in 0..1 of the stage, r: radius / stage height }
    const a = ease(clamp01(t / 0.62)); // edge pass → the turn that shows the mark
    const b = ease(clamp01((t - 0.5) / 0.5)); // pull back and stand it on the page
    const zoom = out(clamp01(t / 0.92));
    // The opening fits the whole coin, edge-on, inside the stage: a thin copper blade, never a cropped rectangle.
    const open = { x: 0.5, y: 0.5, r: 0.46 }, mid = { x: 0.5, y: 0.48, r: Math.max(rest.r * 1.9, 0.34) };
    const r = lerp(lerp(open.r, mid.r, zoom), rest.r, b);
    return {
      x: lerp(lerp(open.x, mid.x, a), rest.x, b),
      y: lerp(lerp(open.y, mid.y, a), rest.y, b),
      r,
      yaw: lerp(lerp(1.36, -0.16, a), -0.52, b) + spin, // 78° edge-on → facing → a three-quarter stand
      roll: lerp(0.5, 0, a),
      sweep: lerp(-1.1, 0, ease(clamp01(t / 0.85))), // the key light travels across the face as it turns
      grounded: clamp01((t - 0.72) / 0.28),
    };
  }

  function draw() {
    resize();
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    for (const k in cur) {
      if (Array.isArray(cur[k])) cur[k] = cur[k].map((v, i) => lerp(v, target[k][i], 0.14));
      else cur[k] = lerp(cur[k], target[k], 0.14);
    }
    const p = pose();
    const D = F / (2 * p.r); // camera distance that makes the coin's radius p.r of the stage height
    const aspect = W / H, near = 0.05, far = 60;
    // view: camera pitched slightly down at the coin's centre
    const cp = Math.cos(CAM_PITCH), sp = Math.sin(CAM_PITCH);
    const eye = [0, D * sp, D * cp];
    // VP = P * V, written out. V = translate(0,0,-D) * rotX(CAM_PITCH)
    const P = [F / aspect, 0, 0, 0, 0, F, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
    const V = [1, 0, 0, 0, 0, cp, -sp, 0, 0, sp, cp, 0, 0, 0, -D, 1];
    const VP = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) VP[c * 4 + r] = P[r] * V[c * 4] + P[4 + r] * V[c * 4 + 1] + P[8 + r] * V[c * 4 + 2] + P[12 + r] * V[c * 4 + 3];
    const shift = [(p.x - 0.5) * 2, (0.5 - p.y) * 2];

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ground first (no depth), then the coin
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(groundP.p);
    attr(groundP.p, "aQ", bQuad, 2);
    gl.uniformMatrix4fv(groundP.u.uVP, false, VP);
    gl.uniform2fv(groundP.u.uShift, shift);
    gl.uniform2f(groundP.u.uDir, Math.cos(p.yaw), -Math.sin(p.yaw));
    gl.uniform1f(groundP.u.uShadow, cur.shadow);
    gl.uniform1f(groundP.u.uPool, cur.pool);
    gl.uniform1f(groundP.u.uGrounded, p.grounded);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(coinP.p);
    attr(coinP.p, "aPos", bPos, 3); attr(coinP.p, "aNrm", bNrm, 3); attr(coinP.p, "aKind", bKind, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    gl.uniformMatrix4fv(coinP.u.uVP, false, VP);
    gl.uniformMatrix3fv(coinP.u.uRot, false, rotYX(p.yaw, 0, p.roll));
    gl.uniform2fv(coinP.u.uShift, shift);
    gl.uniform3fv(coinP.u.uEye, eye);
    gl.uniform1f(coinP.u.uSweep, p.sweep);
    gl.uniform3fv(coinP.u.uSky, cur.sky); gl.uniform3fv(coinP.u.uHorizon, cur.horizon); gl.uniform3fv(coinP.u.uFloor, cur.floor);
    gl.uniform3fv(coinP.u.uKey, cur.key); gl.uniform3fv(coinP.u.uRim, cur.rim);
    gl.uniform1f(coinP.u.uKeySize, cur.keySize); gl.uniform1f(coinP.u.uFlag, cur.flag); gl.uniform1f(coinP.u.uExposure, cur.exposure);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }

  const settledTheme = () => Object.keys(cur).every((k) => (Array.isArray(cur[k]) ? cur[k].every((v, i) => Math.abs(v - target[k][i]) < 0.004) : Math.abs(cur[k] - target[k]) < 0.004));

  // Renders only while something is changing: the reveal, a theme cross-fade, or a spin settling.
  function frame(now) {
    raf = 0;
    if (dead) return;
    if (playing) {
      t = clamp01((now - start) / DURATION);
      opts.onProgress?.(t);
      if (t >= 1) playing = false;
    }
    if (!dragging && (spin !== 0 || spinV !== 0)) {
      spinV += (-spin * 0.09 - spinV * 0.34); // a critically damped return to rest
      spin += spinV;
      if (Math.abs(spin) < 0.0015 && Math.abs(spinV) < 0.0015) spin = spinV = 0;
    }
    draw();
    if (visible && (playing || !settledTheme() || spin !== 0 || spinV !== 0 || dragging)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !dead && visible) raf = requestAnimationFrame(frame); };

  const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { if (playing) start = performance.now() - t * DURATION; kick(); } // resume where it stopped
  }) : null;
  io?.observe(canvas);
  const ro = "ResizeObserver" in window ? new ResizeObserver(kick) : null;
  ro?.observe(canvas);
  const onLost = (e) => { e.preventDefault(); dead = true; opts.onLost?.(); };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    /** First frame is drawn synchronously, so the caller can swap the poster out without a blank gap. */
    play() { if (opts.reduced) return this.rest(); t = 0; spin = spinV = 0; playing = true; start = performance.now(); opts.onProgress?.(0); draw(); kick(); },
    rest() { playing = false; t = 1; opts.onProgress?.(1); draw(); kick(); },
    setTheme(name) { target = THEMES[name] ?? THEMES.light; if (opts.reduced) Object.assign(cur, structuredClone(target)); kick(); },
    /** Seek, for poster capture and tests. */
    seek(v) { playing = false; t = clamp01(v); Object.assign(cur, structuredClone(target)); opts.onProgress?.(t); draw(); },
    get progress() { return t; },
    get playing() { return playing; },
    nudge(d) { spinV += d; kick(); },
    drag(on, dx = 0) { dragging = on; if (on) { spin = Math.max(-1.2, Math.min(1.2, spin + dx)); spinV = 0; } kick(); },
    destroy() { dead = true; cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); canvas.removeEventListener("webglcontextlost", onLost); },
  };
}
