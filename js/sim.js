"use strict";
/**
 * sim.js — grid allocation, wall rasterisation, the substep loop, and the
 * readbacks the overlay needs.
 *
 * The domain is a fixed physical rectangle (scene.W × scene.H). The grid is
 * sized to a cell budget, so changing resolution changes Δx but never the
 * physics you are looking at, and resizing the window only moves the
 * letterbox — the simulation carries on untouched.
 */
const SIM = (() => {

  const CFL = 0.45;          // acoustic Courant number for the staggered update
  const UREF = 6.0;          // headroom for advective velocity in the dt estimate
  // How long a particle's trail lives, in SIMULATED seconds. About a second of
  // flow: long enough to read a path, short enough that a jet does not fill
  // the screen with a solid wash.
  // Long enough that a streak reads as a PATH — thin and drawn out, tapering
  // behind the head — rather than as a dot with a smudge after it.
  const TRAIL_TAU = 1.5;
  // How many of the 128 × 128 particles are actually DRAWN. All of them are
  // advected — the update is one fullscreen pass either way — but drawing all
  // 16384 with a trail each fills a flume with white and shows nothing at all.
  // A few thousand distinct paths is what reads as flow visualisation; the
  // count follows the width so a big window gets more of them, not fatter ones.
  const TRAIL_N = (pxW) => Math.round(Math.max(500, Math.min(2200, pxW * 1.1)));

  let gl, quad, rect, points, prog = {};
  let S = null;              // the live grid

  function init(canvas) {
    gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 is required.");
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float is required (float render targets).");
    }
    quad = GLH.makeQuad(gl);
    rect = GLH.makeRect(gl);
    points = GLH.makePoints(gl);
    prog.vel  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_VEL);
    prog.vof  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_VOF);
    prog.col  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_COL);
    prog.part = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_PART);
    prog.draw = GLH.createProgram(gl, Shaders.VS_RECT, Shaders.FS_DISP);
    prog.pdraw = GLH.createProgram(gl, Shaders.VS_PART, Shaders.FS_PART_DRAW);
    prog.fill = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_FILL);
    prog.tex  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_TEX);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return gl;
  }

  // ------------------------------------------------------------- geometry
  /** Stamp a thick straight segment (metres) into the solid mask.
   *  Ends are BUTT, not round: the endpoints are the true extent of the edge,
   *  so a gate drawn to z = 0.39 leaves an opening that starts at 0.39. Round
   *  caps quietly eat half a thickness off every gap, which is fatal when the
   *  gap is the thing being demonstrated. */
  function stampSeg(mask, seg, value) {
    const [x0, z0, x1, z1, th] = seg;
    const r = Math.max(th, S.dx * 1.7) * 0.5;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r) / S.dx));
    const i1 = Math.min(S.nx - 1, Math.ceil((Math.max(x0, x1) + r) / S.dx));
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - r) / S.dx));
    const j1 = Math.min(S.ny - 1, Math.ceil((Math.max(z0, z1) + r) / S.dx));
    const ax = x1 - x0, az = z1 - z0;
    const len2 = ax * ax + az * az;
    const dot = len2 < 1e-9;                       // degenerate = a disc
    for (let j = j0; j <= j1; j++) {
      const pz = (j + 0.5) * S.dx;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * S.dx;
        let t = dot ? 0 : ((px - x0) * ax + (pz - z0) * az) / len2;
        if (!dot && (t < 0 || t > 1)) continue;
        const dx = px - (x0 + t * ax), dz = pz - (z0 + t * az);
        if (dx * dx + dz * dz <= r * r) mask[j * S.nx + i] = value;
      }
    }
  }

  /** Rebuild the solid mask from scratch: scene walls, then user edits, then
   *  the closed edges of the domain. Order matters — the border always wins,
   *  so no amount of erasing can spring a leak. */
  function rasterise() {
    const m = S.mask;
    m.fill(0);
    const sc = S.scene;
    (sc.walls(sc.W, sc.H) || []).forEach((s) => stampSeg(m, s, 255));
    (sc.valves ? sc.valves(sc.W, sc.H) : []).forEach((s) => stampSeg(m, s, 128));
    S.segs.forEach((s) => stampSeg(m, s, s[5]));
    const [oL, oR, oB, oT] = S.p ? S.p.open : sc.open;
    for (let j = 0; j < S.ny; j++) {
      if (!oL) m[j * S.nx] = 255;
      if (!oR) m[j * S.nx + S.nx - 1] = 255;
    }
    for (let i = 0; i < S.nx; i++) {
      if (!oB) m[i] = 255;
      if (!oT) m[(S.ny - 1) * S.nx + i] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, S.solid);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, S.nx, S.ny, 0, gl.RED, gl.UNSIGNED_BYTE, m);

    S.bandKey = null;                  // invalidate the cached control bands
  }

  /** Add a drawn edge. kind: 255 wall, 128 valve, 0 eraser. */
  function addSeg(x0, z0, x1, z1, th, kind) {
    S.segs.push([x0, z0, x1, z1, th, kind]);
    rasterise();
  }
  function undoSeg() { if (S.segs.length) { S.segs.pop(); rasterise(); } }
  function clearSegs() { S.segs.length = 0; rasterise(); }

  // ------------------------------------------------------------ allocation
  /** Hand a superseded grid's GL objects back to the driver.
   *  `build` allocates a complete new set every time it is called — 8 textures
   *  and 7 framebuffers, four of them full nx×ny RGBA32F — and nothing else
   *  ever frees them, so before this a resolution flick stranded the whole
   *  outgoing grid (~45 MB of VRAM per rebuild on m2 at Ultra, measured). A
   *  few flicks exhausted the driver and the next createFBO threw
   *  "Framebuffer incomplete: 0x8cdd" — with the tab, not the sim, at fault.
   *  Only GL handles go: `segs` and the live parameters `S.p` are plain JS and
   *  `build` has already copied them across by the time this runs. */
  function release(g) {
    if (!g || g === S) return;                 // never free the live grid
    for (const b of [g.U, g.F, g.P]) if (b && b.dispose) b.dispose();
    if (g.colFbo) gl.deleteFramebuffer(g.colFbo);
    if (g.solid) gl.deleteTexture(g.solid);
    if (g.colTex) gl.deleteTexture(g.colTex);
    g.U = null; g.F = null; g.P = null;
    g.solid = null; g.colTex = null; g.colFbo = null;
    // The trail belongs to the CANVAS, not to the grid, so it survives a
    // rebuild — but what is drawn in it does not: those pixels are the old
    // geometry's particles. Marking it undrawn clears it on the next frame.
    trail.drawn = false;
  }

  function build(scene, budget, keepSegs) {
    const aspect = scene.W / scene.H;
    // The hard cap is the driver's texture limit, not a number picked here.
    // A fixed 1400 silently swallowed the top resolutions on exactly the
    // scenes that need them: m2 is 16 m × 0.95 m, so at Ultra it asks for
    // nx ≈ 3400 and used to get 1400 — the flumes would have ignored two
    // whole steps of the slider.
    const lim = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096);
    let nx = Math.round(Math.sqrt(budget * aspect));
    nx = Math.max(96, Math.min(lim, nx));
    const dx = scene.W / nx;
    let ny = Math.max(64, Math.min(lim, Math.round(scene.H / dx)));

    const segs = keepSegs && S ? S.segs : [];
    // A rebuild that keeps the drawing (a resolution change) keeps the live
    // parameters too — losing your boundary toggles or valve state because
    // you asked for more cells would be maddening.
    const prev = keepSegs && S && S.scene === scene ? S.p : null;
    const p = prev ? Object.assign({}, prev) : {
      g: scene.g, c: scene.c, cf: scene.cf, cs: scene.cs, nu: scene.nu,
      slip: scene.slip, bulk: scene.bulk, ca: scene.ca,
      open: scene.open.slice(),
      inflow: Object.assign({}, scene.inflow),
      tailwater: Object.assign({}, scene.tailwater),
      wave: Object.assign({}, scene.wave),
      source: Object.assign({}, scene.source),
      dyeLine: scene.dyeLine, dyeDecay: 0.02,
      valveClosed: scene.valveOpen ? 0 : 1,
    };
    if (prev) {
      p.open = prev.open.slice();
      for (const k of ["inflow", "tailwater", "wave", "source"]) p[k] = Object.assign({}, prev[k]);
      p.pour = null;
    }
    const old = S;                  // everything CPU-side has been read off it
    S = {
      scene, nx, ny, dx, segs,
      W: nx * dx, H: ny * dx,
      mask: new Uint8Array(nx * ny),
      t: 0, frames: 0,
      p,
    };
    release(old);                   // free BEFORE allocating: lower peak VRAM

    const F = gl.RGBA32F, RGBA = gl.RGBA, FL = gl.FLOAT;
    S.U = GLH.createDoubleBuffer(gl, nx, ny, F, RGBA, FL, null);
    S.F = GLH.createDoubleBuffer(gl, nx, ny, F, RGBA, FL, null);
    S.solid = GLH.createTexture(gl, nx, ny, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null);
    S.colTex = GLH.createTexture(gl, nx, 1, F, RGBA, FL, null);
    S.colFbo = GLH.createFBO(gl, S.colTex);

    const pn = 128;
    S.pn = pn;
    const pd = new Float32Array(pn * pn * 4);
    for (let k = 0; k < pn * pn; k++) {
      pd[k * 4] = Math.random() * S.W;
      pd[k * 4 + 1] = Math.random() * S.H;
      pd[k * 4 + 2] = -Math.random() * 6;
      pd[k * 4 + 3] = Math.random();
    }
    S.P = GLH.createDoubleBuffer(gl, pn, pn, F, RGBA, FL, pd);

    S.colBuf = new Float32Array(nx * 4);
    S.pxBuf = new Float32Array(4);

    rasterise();
    resetWater();
    return S;
  }

  /** Reload the scene's initial water (and clear all momentum). */
  function resetWater() {
    const n = S.nx * S.ny, d = new Float32Array(n * 4);
    const P = { g: Math.abs(S.p.g), c: S.p.c };
    const water = S.scene.water;
    for (let j = 0; j < S.ny; j++) {
      for (let i = 0; i < S.nx; i++) {
        const k = (j * S.nx + i) * 4;
        d[k] = Math.max(0, water((i + 0.5) * S.dx, (j + 0.5) * S.dx, P) || 0);
      }
    }
    for (const b of [S.F.a, S.F.b]) {
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S.nx, S.ny, 0, gl.RGBA, gl.FLOAT, d);
    }
    const zero = new Float32Array(n * 4);
    for (const b of [S.U.a, S.U.b]) {
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S.nx, S.ny, 0, gl.RGBA, gl.FLOAT, zero);
    }
    S.t = 0;
  }

  // ------------------------------------------------------------------ step
  function dt() {
    const p = S.p;
    const acoustic = CFL * S.dx / (p.c + UREF);
    const nuMax = p.nu + (p.cs * S.dx) * (p.cs * S.dx) * 400;
    const viscous = 0.20 * S.dx * S.dx / Math.max(nuMax, 1e-9);
    return Math.min(acoustic, viscous);
  }

  /** The z-range a level control (inflow / tailwater) is allowed to touch:
   *  the contiguous run of open cells in that grid column which contains the
   *  control level — or, if the level sits above every run (a plan-view duct
   *  fed at "level 99"), the topmost run below it. Applying the control to
   *  the whole column instead floods any cavity under a raised bed slab, and
   *  a prescribed inlet velocity then pressurises the sealed pocket to the
   *  clamp — which is exactly how the steep scenes used to explode. */
  function columnBand(i, level) {
    const runs = [];
    let a = -1;
    for (let j = 1; j < S.ny - 1; j++) {
      const open = S.mask[j * S.nx + i] < 64;
      if (open && a < 0) a = j;
      if (a >= 0 && (!open || j === S.ny - 2)) {
        runs.push([a, open ? j : j - 1]);
        a = -1;
      }
    }
    if (!runs.length) return [0, 0];
    const lj = level / S.dx;
    let best = null;
    for (const r of runs) {
      if (lj >= r[0] && lj <= r[1] + 1) { best = r; break; }
      if (r[1] + 1 <= lj) best = r;               // runs ascend: keep the topmost below
    }
    if (!best) best = runs[0];
    return [best[0] * S.dx, (best[1] + 1) * S.dx];
  }

  function bands() {
    const p = S.p;
    const key = p.inflow.level + ":" + p.tailwater.level;
    if (S.bandKey !== key) {
      S.bandKey = key;
      S.inBand = columnBand(1, p.inflow.level);
      S.twBand = columnBand(S.nx - 2, p.tailwater.level);
    }
    return { inB: S.inBand, twB: S.twBand };
  }

  /** Inlet velocity implied by the prescribed unit discharge and the depth
   *  actually available between the inlet run's bed and the reservoir level.
   *  The 1.5 Δx offset repays the discharge lost to the shader's 3-cell
   *  surface taper on the prescribed plug. */
  function inletVel() {
    const inf = S.p.inflow;
    const b = bands().inB;
    if (inf.v !== undefined) return inf.v;          // scenes may pin velocity
    const feather = b[1] < inf.level ? 0 : 1.5 * S.dx;   // none for a submerged duct
    return (inf.q || 0) / Math.max(Math.min(inf.level, b[1]) - b[0] - feather, S.dx);
  }

  /** Uniforms shared by the two simulation passes. */
  function simUniforms(pr, h) {
    const p = S.p;
    gl.uniform2f(pr.u("u_res"), S.nx, S.ny);
    gl.uniform1f(pr.u("u_dx"), S.dx);
    gl.uniform1f(pr.u("u_dt"), h);
    gl.uniform1f(pr.u("u_g"), -Math.abs(p.g));
    gl.uniform1f(pr.u("u_gx"), (S.scene.tiltS0 || 0) * Math.abs(p.g));
    gl.uniform1f(pr.u("u_c"), p.c);
    gl.uniform1f(pr.u("u_c2"), p.c * p.c);
    gl.uniform1f(pr.u("u_valve"), p.valveClosed);
    const { inB, twB } = bands();
    gl.uniform4f(pr.u("u_in"), p.inflow.level, inletVel(), p.inflow.on, p.inflow.free || 0);
    gl.uniform2f(pr.u("u_tw"), p.tailwater.level, p.tailwater.on);
    gl.uniform2f(pr.u("u_inBand"), inB[0], Math.min(p.inflow.level, inB[1]));
    gl.uniform2f(pr.u("u_twBand"), twB[0], Math.min(p.tailwater.level, twB[1]));
    // Sponge widths are physical (metres) so resolution changes keep the
    // same reservoir; default is ~10 cells.
    const sc = S.scene;
    gl.uniform2f(pr.u("u_spongeN"),
      sc.spongeIn ? Math.round(sc.spongeIn / S.dx) : 10,
      sc.spongeTw ? Math.round(sc.spongeTw / S.dx) : 10);
    gl.uniform4f(pr.u("u_openMode"), p.open[0], p.open[1], p.open[2], p.open[3]);
    gl.uniform1f(pr.u("u_time"), S.t);
    const s0 = p.source, s1 = p.pour;
    gl.uniform4f(pr.u("u_src0"), s0.x, s0.z, s0.r, s0.on);
    gl.uniform4f(pr.u("u_sv0"), s0.vx, s0.vz, 0, 0);   // spout runs clear
    if (s1) {
      gl.uniform4f(pr.u("u_src1"), s1.x, s1.z, s1.r, 1);
      gl.uniform4f(pr.u("u_sv1"), s1.vx, s1.vz, 0, 0.85);
    } else {
      gl.uniform4f(pr.u("u_src1"), 0, 0, 0, 0);
      gl.uniform4f(pr.u("u_sv1"), 0, 0, 0, 0);
    }
  }

  function step(nsub) {
    const p = S.p, h = dt();
    for (let n = 0; n < nsub; n++) {
      // --- velocity: advection, viscosity, gravity, friction, ∇p
      gl.useProgram(prog.vel);
      GLH.bindTex(gl, prog.vel, [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid]]);
      simUniforms(prog.vel, h);
      gl.uniform1f(prog.vel.u("u_nu"), p.nu);
      gl.uniform1f(prog.vel.u("u_cs"), p.cs);
      gl.uniform1f(prog.vel.u("u_cf"), p.cf);
      gl.uniform1f(prog.vel.u("u_slip"), p.slip);
      gl.uniform1f(prog.vel.u("u_bulk"), p.bulk);
      gl.uniform4f(prog.vel.u("u_wave"), p.wave.amp, 2 * Math.PI / Math.max(p.wave.period, 0.05),
        p.wave.on, Math.max(1, Math.round(p.wave.x / S.dx)));
      GLH.bindTarget(gl, S.U.write.fbo, S.nx, S.ny);
      quad.draw();
      S.U.swap();

      // --- volume: conservative limited advection of f (+ dye)
      gl.useProgram(prog.vof);
      GLH.bindTex(gl, prog.vof, [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid]]);
      simUniforms(prog.vof, h);
      gl.uniform1f(prog.vof.u("u_ca"), p.ca);
      gl.uniform1f(prog.vof.u("u_dyeDecay"), p.dyeDecay);
      gl.uniform2f(prog.vof.u("u_dyeLine"), p.dyeLine, p.dyeLine > 0 ? 1 : 0);
      GLH.bindTarget(gl, S.F.write.fbo, S.nx, S.ny);
      quad.draw();
      S.F.swap();

      S.t += h;
    }
    S.frames++;
    return h * nsub;
  }

  /** Per-column depth / discharge / bed. The GPU pass is cheap and has to run
   *  every frame (the display samples it), but the readback is a full pipeline
   *  sync — at 1200 columns that alone was costing two thirds of the frame.
   *  Pull it back every `readEvery` frames and reuse the buffer in between. */
  let readEvery = 3, colTick = 0;
  function columns(force) {
    gl.useProgram(prog.col);
    GLH.bindTex(gl, prog.col, [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid]]);
    gl.uniform2f(prog.col.u("u_res"), S.nx, S.ny);
    gl.uniform1f(prog.col.u("u_dx"), S.dx);
    gl.uniform1f(prog.col.u("u_valve"), S.p.valveClosed);
    GLH.bindTarget(gl, S.colFbo, S.nx, 1);
    quad.draw();
    if (force || colTick-- <= 0) {
      colTick = readEvery - 1;
      gl.readPixels(0, 0, S.nx, 1, gl.RGBA, gl.FLOAT, S.colBuf);
    }
    return S.colBuf;
  }

  function advanceParticles(realDt) {
    gl.useProgram(prog.part);
    GLH.bindTex(gl, prog.part, [["u_P", S.P.read.tex], ["u_U", S.U.read.tex],
      ["u_F", S.F.read.tex], ["u_S", S.solid]]);
    gl.uniform2f(prog.part.u("u_res"), S.nx, S.ny);
    gl.uniform2f(prog.part.u("u_pres"), S.pn, S.pn);
    gl.uniform1f(prog.part.u("u_dx"), S.dx);
    gl.uniform1f(prog.part.u("u_pdt"), realDt);
    // Particle lifetime is per scene: a tracer has to outlive a wave period
    // or it respawns before it has drawn a single orbit, which is the whole
    // point of the long-wave flume (T = 4 s against the 6 s default).
    gl.uniform1f(prog.part.u("u_plife"), S.scene.plife || 6.0);
    gl.uniform1f(prog.part.u("u_time"), S.t);
    gl.uniform1f(prog.part.u("u_valve"), S.p.valveClosed);
    GLH.bindTarget(gl, S.P.write.fbo, S.pn, S.pn);
    quad.draw();
    S.P.swap();
  }

  /** Draw the field into the letterbox rect (NDC), then the particles. */
  function render(view, opts) {
    const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
    GLH.bindTarget(gl, null, cw, ch);
    gl.clearColor(0.027, 0.035, 0.047, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog.draw);
    GLH.bindTex(gl, prog.draw, [["u_F", S.F.read.tex], ["u_U", S.U.read.tex],
      ["u_S", S.solid], ["u_C", S.colTex]]);
    gl.uniform4f(prog.draw.u("u_rect"), view.ndc[0], view.ndc[1], view.ndc[2], view.ndc[3]);
    gl.uniform2f(prog.draw.u("u_res"), S.nx, S.ny);
    gl.uniform2f(prog.draw.u("u_canvas"), view.w, view.h);   // drawn rect, so zoom keeps px/m honest
    gl.uniform1f(prog.draw.u("u_dx"), S.dx);
    gl.uniform1f(prog.draw.u("u_g"), -Math.abs(S.p.g));
    gl.uniform1f(prog.draw.u("u_tilt"), S.scene.tiltS0 || 0);
    gl.uniform1f(prog.draw.u("u_c2"), S.p.c * S.p.c);
    gl.uniform1f(prog.draw.u("u_valve"), S.p.valveClosed);
    gl.uniform1f(prog.draw.u("u_time"), S.t);
    gl.uniform1i(prog.draw.u("u_mode"), opts.mode);
    gl.uniform1f(prog.draw.u("u_vmax"), opts.vmax);
    gl.uniform1f(prog.draw.u("u_lo"), opts.lo);
    gl.uniform1f(prog.draw.u("u_hi"), opts.hi);
    gl.uniform1f(prog.draw.u("u_dyeOn"), opts.dye ? 1 : 0);
    gl.uniform4f(prog.draw.u("u_cursor"), opts.cursor[0], opts.cursor[1], opts.cursor[2], 0);
    gl.uniform4f(prog.draw.u("u_guide"), opts.guide[0], opts.guide[1], opts.guide[2], opts.guide[3]);
    gl.uniform1f(prog.draw.u("u_guideOn"), opts.guideOn ? 1 : 0);
    rect.draw();

    if (opts.particles) drawParticles(view, opts, cw, ch);
    else trail.drawn = false;
  }

  // ------------------------------------------------------- particle trails
  /** A screen-sized buffer the particles accumulate into, faded a little every
   *  frame. The tail cannot be drawn as a per-frame streak: at 1 m/s a
   *  particle moves about two pixels between frames, so what makes a visible
   *  trail is HISTORY, and one faded buffer is far cheaper than a ring of past
   *  positions per particle.
   *
   *  Screen space, not domain space: the domain is up to 8× exaggerated
   *  vertically, so a domain-aligned buffer would be smeared to nothing in z.
   *  The price is that the trails belong to one view — pan, zoom or resize and
   *  they are cleared, which reads as the trace starting again from where the
   *  water is now. */
  const trail = { tex: null, fbo: null, w: 0, h: 0, ndc: null, drawn: false };

  function trailFor(cw, ch, view) {
    if (trail.w !== cw || trail.h !== ch) {
      if (trail.fbo) gl.deleteFramebuffer(trail.fbo);
      if (trail.tex) gl.deleteTexture(trail.tex);
      trail.tex = GLH.createTexture(gl, cw, ch, gl.RGBA8, gl.RGBA,
                                    gl.UNSIGNED_BYTE, null, gl.LINEAR);
      trail.fbo = GLH.createFBO(gl, trail.tex);
      trail.w = cw; trail.h = ch; trail.ndc = null;
    }
    // A view change invalidates every pixel in there, and so does a frame in
    // which the particles were not drawn at all — otherwise switching them
    // back on resumes a trace from wherever the water used to be.
    const n = view.ndc, o = trail.ndc;
    const moved = !o || !trail.drawn ||
      n[0] !== o[0] || n[1] !== o[1] || n[2] !== o[2] || n[3] !== o[3];
    trail.ndc = [n[0], n[1], n[2], n[3]];
    return moved;
  }

  function drawParticles(view, opts, cw, ch) {
    const clear = trailFor(cw, ch, view);
    GLH.bindTarget(gl, trail.fbo, cw, ch);
    if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }

    gl.enable(gl.BLEND);
    if (!clear) {
      // Fade what is already there: dst *= k, in one draw and with no second
      // buffer to ping-pong through. `k` is set from SIMULATED time, so the
      // tail is a fixed span of FLOW — about a second of it — however fast or
      // slow the frame rate happens to be.
      const k = Math.exp(-Math.max(opts.pdt, 0) / TRAIL_TAU);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.useProgram(prog.fill);
      gl.uniform4f(prog.fill.u("u_col"), k, k, k, k);
      quad.draw();
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(prog.pdraw);
    GLH.bindTex(gl, prog.pdraw, [["u_P", S.P.read.tex]]);
    gl.uniform2f(prog.pdraw.u("u_res"), S.nx, S.ny);
    gl.uniform2f(prog.pdraw.u("u_pres"), S.pn, S.pn);
    gl.uniform4f(prog.pdraw.u("u_rect"), view.ndc[0], view.ndc[1], view.ndc[2], view.ndc[3]);
    gl.uniform1f(prog.pdraw.u("u_dx"), S.dx);
    // Big enough to see. The old 1.5-3 px dot disappeared over a pale field
    // and read as sensor noise over a dark one.
    // Fine. The streak's LENGTH is the reading; its width is only noise.
    const n = Math.min(S.pn * S.pn, TRAIL_N(view.pxW));
    const tail = Math.max(2.0, view.pxW / 620);
    gl.uniform1f(prog.pdraw.u("u_psize"), tail);
    gl.uniform1f(prog.pdraw.u("u_amp"), 0.30);
    points.draw(n);

    // The tail, composited under everything that follows.
    GLH.bindTarget(gl, null, cw, ch);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // it is premultiplied
    gl.useProgram(prog.tex);
    GLH.bindTex(gl, prog.tex, [["u_T", trail.tex]]);
    quad.draw();

    // …then the heads, once, straight to the screen at full strength. Drawn
    // outside the trail buffer on purpose: inside it they would fade with
    // everything else and there would be no particle, only a smear.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(prog.pdraw);
    // Re-bind: the composite above pointed texture unit 0 at the trail, and
    // `u_P` still names unit 0 — without this the heads read the trail as
    // their own positions and land nowhere.
    GLH.bindTex(gl, prog.pdraw, [["u_P", S.P.read.tex]]);
    gl.uniform1f(prog.pdraw.u("u_psize"), tail + 1.6);
    gl.uniform1f(prog.pdraw.u("u_amp"), 1.0);
    points.draw(n);
    gl.disable(gl.BLEND);
    trail.drawn = true;
  }

  // -------------------------------------------------------------- readback
  /** Rescale the stored fill so the EOS pressure P = c²(f−1) is unchanged when
   *  c changes: f → 1 + (f−1)·k with k = (c_old/c_new)². Only over-full cells
   *  carry pressure, so cells below f = 1 are left alone and the geometric
   *  volume min(f,1) is untouched. Without this, lowering c leaves the column
   *  under-supported and it settles lower — 861 mm on a 4.5 m column for
   *  25 → 8. One readback per slider change, not per frame. */
  function rescaleFill(k) {
    if (!(k > 0) || k === 1) return;
    const n = S.nx * S.ny;
    const buf = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, buf);
    for (let i = 0; i < n; i++) {
      const f = buf[i * 4];
      if (f > 1) buf[i * 4] = 1 + (f - 1) * k;
    }
    // texSubImage2D, not texImage2D: this texture is an FBO colour attachment
    // and respecifying its storage would invalidate it.
    gl.bindTexture(gl.TEXTURE_2D, S.F.read.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, buf);
  }

  /** One cell: {f, dye, u, w, p, phead}. Used by gauges and the hover readout.
   *  `phead` is the PRESSURE head p/ρg alone — no elevation term. In
   *  hydrostatic water that is simply the submergence below the local free
   *  surface, so it carries a unit vertical gradient everywhere wet and is not
   *  comparable between cells at different heights. The piezometric head is
   *  h = z + p/ρg; add the elevation yourself (see the gauge sampler in
   *  main.js). Renamed from `head` with rig format v2 — the old name kept
   *  being read as piezometric, which it never was. */
  function probe(x, z) {
    const i = Math.max(0, Math.min(S.nx - 1, Math.floor(x / S.dx)));
    const j = Math.max(0, Math.min(S.ny - 1, Math.floor(z / S.dx)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(i, j, 1, 1, gl.RGBA, gl.FLOAT, S.pxBuf);
    const u = S.pxBuf[0], w = S.pxBuf[1], p = S.pxBuf[2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(i, j, 1, 1, gl.RGBA, gl.FLOAT, S.pxBuf);
    const g = Math.abs(S.p.g) || 9.81;
    return { i, j, f: S.pxBuf[0], u, w, p, phead: p / g, speed: Math.hypot(u, w),
             solid: S.mask[j * S.nx + i] };
  }

  /** The 1st and 99th percentile of a display field over WET cells, for the
   *  legend's Fit button. One readPixels of each state texture — the same
   *  bargain `rescaleFill` and `boxForce` already make, and it happens on a
   *  click, never per frame.
   *
   *  Percentiles rather than min/max because one cell at a jet's lip, or one
   *  cell of a bad column, otherwise sets the scale for the whole picture and
   *  everything else renders as a single flat colour. Wet cells only, because
   *  a dry cell is not water: its stored pressure is zero and averaging it in
   *  drags every scale towards the floor.
   *
   *  `mode` is the display mode, so the arithmetic here has to agree with the
   *  branch of FS_DISP that paints it. The two are checked against each other
   *  by eye and by the legend: a Fit that leaves the picture saturated or flat
   *  means they have drifted apart. */
  function fieldStats(mode) {
    const n = S.nx * S.ny;
    const U = new Float32Array(n * 4), F = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, U);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, F);
    const g = Math.abs(S.p.g) || 9.81, tilt = S.scene.tiltS0 || 0;
    const col = columns();                  // per-column depth, for the Froude number
    const v = [];
    const wet = (i, j) => F[(j * S.nx + i) * 4] >= 0.5 && S.mask[j * S.nx + i] < 192;
    for (let j = 0; j < S.ny; j++) {
      for (let i = 0; i < S.nx; i++) {
        if (!wet(i, j)) continue;
        const k = (j * S.nx + i) * 4;
        const u = U[k], w = U[k + 1], P = U[k + 2];
        const x = (i + 0.5) * S.dx, z = (j + 0.5) * S.dx;
        let q = null;
        if (mode === 0 || mode === 1) q = P / g;
        else if (mode === 6) q = z - tilt * x + P / g;
        else if (mode === 7) q = z - tilt * x + P / g + (u * u + w * w) / (2 * g);
        else if (mode === 2) q = Math.hypot(u, w);
        else if (mode === 3) q = Math.abs(u) / Math.sqrt(Math.max(g * col[i * 4 + 1], 1e-4));
        else if (mode === 5) q = F[k] * u * Math.hypot(u, w);
        else if (mode === 4 && i > 0 && j > 0 && i < S.nx - 1 && j < S.ny - 1) {
          // Vorticity is a stencil, not a cell: ∂w/∂x − ∂u/∂z, as FS_DISP does it.
          const dwdx = U[(j * S.nx + i + 1) * 4 + 1] - U[(j * S.nx + i - 1) * 4 + 1];
          const dudz = U[((j + 1) * S.nx + i) * 4] - U[((j - 1) * S.nx + i) * 4];
          q = (dwdx - dudz) / (2 * S.dx);
        }
        if (q !== null && isFinite(q)) v.push(q);
      }
    }
    if (!v.length) return null;
    v.sort((a, b) => a - b);
    const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    return { lo: at(0.01), hi: at(0.99), n: v.length };
  }

  /** The first `n` particle positions, as x, z pairs in metres. For headless
   *  work only — the particles are a GPU-side buffer with no CPU copy, so
   *  there is otherwise no way to ask where they are. */
  function particlePos(n) {
    const w = Math.max(1, Math.min(S.pn, n || 16));
    const buf = new Float32Array(w * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.P.read.fbo);
    gl.readPixels(0, 0, w, 1, gl.RGBA, gl.FLOAT, buf);
    const out = [];
    for (let k = 0; k < w; k++) out.push(buf[k * 4], buf[k * 4 + 1]);
    return out;
  }

  /** A whole column of velocity — the vertical rake. Returns u(z) at cell centres. */
  function rake(x, out) {
    const i = Math.max(1, Math.min(S.nx - 2, Math.floor(x / S.dx)));
    const buf = out && out.length >= S.ny * 4 ? out : new Float32Array(S.ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(i, 0, 1, S.ny, gl.RGBA, gl.FLOAT, buf);
    return { i, buf };
  }

  /** A rectangular strip of the velocity field, pulled back in ONE readPixels
   *  so a handful of CPU-side tracers can be advected without a sync each.
   *  Probing them individually would be one pipeline stall per tracer. */
  function patch(x0, x1, out) {
    const a = Math.max(0, Math.min(S.nx - 1, Math.floor(x0 / S.dx)));
    const b = Math.max(a + 1, Math.min(S.nx, Math.ceil(x1 / S.dx)));
    const w = b - a;
    const buf = out && out.length >= w * S.ny * 4 ? out : new Float32Array(w * S.ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(a, 0, w, S.ny, gl.RGBA, gl.FLOAT, buf);
    return { i0: a, w, ny: S.ny, dx: S.dx, buf };
  }

  /** Bilinear (u, w) at a point, from a patch. u lives on x-faces, w on
   *  z-faces, so each is offset half a cell from the centre. */
  function patchVel(p, x, z) {
    const gx = x / p.dx - p.i0, gz = z / p.dx;
    const sx = Math.max(0, Math.min(p.w - 1.001, gx));
    const sz = Math.max(0, Math.min(p.ny - 1.001, gz - 0.5));
    const i = Math.floor(sx), j = Math.floor(sz), fx = sx - i, fz = sz - j;
    const at = (ii, jj, c) => p.buf[((jj * p.w) + Math.min(ii, p.w - 1)) * 4 + c];
    const u = (at(i, j, 0) * (1 - fx) + at(i + 1, j, 0) * fx) * (1 - fz)
            + (at(i, j + 1, 0) * (1 - fx) + at(i + 1, j + 1, 0) * fx) * fz;
    const tx = Math.max(0, Math.min(p.w - 1.001, gx - 0.5));
    const tz = Math.max(0, Math.min(p.ny - 1.001, gz));
    const i2 = Math.floor(tx), j2 = Math.floor(tz), gxf = tx - i2, gzf = tz - j2;
    const w = (at(i2, j2, 1) * (1 - gxf) + at(i2 + 1, j2, 1) * gxf) * (1 - gzf)
            + (at(i2, j2 + 1, 1) * (1 - gxf) + at(i2 + 1, j2 + 1, 1) * gxf) * gzf;
    return [u, w];
  }

  /** Momentum-theorem force on whatever solid a box encloses, in N per metre
   *  of width: F = −∮ ρf·[u(u·n) + P·n] dA over the four faces, minus the
   *  weight of the enclosed water in z. The faces sit ON grid lines, so the
   *  MAC staggering hands over the exact normal velocity (u on x-faces, w on
   *  z-faces); f and P (= p/ρ, in U.b — hydrostatic P = g·depth, so ρ·f·P is
   *  the physical pressure) are averaged across the face. A face segment with
   *  a solid on either side is skipped: the fluid boundary continues along
   *  the solid surface there, and the traction on that surface is exactly
   *  the force being solved for. The whole box comes back in one readPixels
   *  per texture; the caller owns any time-averaging — the instantaneous
   *  integral carries every splash that crosses a face. `mdot` (net outflow,
   *  kg/s per m) is the closure check: it should time-average to ~0, and a
   *  box that includes the spout's footprint fails it loudly, because the
   *  spout is a source — mass and momentum appear inside the box and the
   *  budget is not a force any more. */
  /** The full control-volume budget, edge by edge, in ONE readback.
   *
   *  `boxForce` answers "what force does this box feel"; this answers the
   *  three questions a control-volume analysis actually asks — does mass
   *  balance, where does the momentum go, and how much energy is lost — with
   *  the answer split across the four faces, because which face a flux
   *  crosses is half of what a student is being asked to see.
   *
   *  Everything is OUTWARD-positive and per metre of width. Air contributes
   *  nothing, and not by a threshold: every term carries the fill fraction, so
   *  an empty cell adds zero and a half-full one adds half. `Q` uses
   *  min(f, 1) — the geometric water volume — because f > 1 is water that has
   *  been compressed, not extra volume of it; the mass-carrying terms use f
   *  itself, which IS the density in this model.
   *
   *  `M` (the momentum the fluid carries through the face) and `Fp` (the
   *  pressure the surroundings apply to it) are kept apart rather than summed.
   *  Distinguishing them is the whole content of a control-volume question,
   *  and their sum is `boxForce`'s answer — which the layout gate checks, so
   *  the two can never quietly disagree.
   *
   *  Energy is per unit time: ρ f uₙ (gz + P + ½|u|²) — the Bernoulli sum, so
   *  the total over the four faces is the rate of energy LOSS through the box.
   *  A tilted-gravity scene carries its slope in gravity rather than in the
   *  bed, so the elevation term is z − S₀x there, exactly as the head views
   *  and the overlay compute it. */
  /** What crosses one SECTION: the same integrand as a control-volume face,
   *  over a line you drew rather than over a box.
   *
   *  Two sections answer most of what a control volume answers — continuity
   *  between them, the momentum they carry, the energy lost between one and
   *  the next — without asking a student to reason about four faces at once,
   *  and a section is what a textbook draws anyway.
   *
   *  The normal is the drawing direction turned a quarter-turn clockwise, so a
   *  line drawn UP has its positive side downstream: draw across the flow the
   *  way you would draw a section on paper and the sign comes out the way you
   *  expect. Nothing is shown as a bare sign regardless — the overlay says
   *  which way the water actually goes.
   *
   *  Exact on the grid only for a section along a cell face; anything at an
   *  angle interpolates the staggered velocities, which is the same thing the
   *  rake and the orbit tracers already do. Air contributes nothing: every
   *  term carries the fill fraction, and `Q` uses min(f, 1) because f > 1 is
   *  water that has been compressed rather than more of it. */
  function lineFlux(x0, z0, x1, z1) {
    const gAbs = Math.abs(S.p.g), RHO = 1000, tilt = S.scene.tiltS0 || 0;
    const closed = S.p.valveClosed > 0.5;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const out = { Q: 0, mdot: 0, Mx: 0, Mz: 0, Fpx: 0, Fpz: 0, E: 0,
                  wet: 0, len, nx: 0, nz: 0, n: 0 };
    if (!(len > 1e-6)) return out;
    const tx = dx / len, tz = dz / len;
    const nx = tz, nz = -tx;                    // a quarter-turn clockwise
    out.nx = nx; out.nz = nz;

    // One sample per cell along the section, and never fewer than a handful:
    // a section shorter than a cell is still a section.
    const ns = Math.max(8, Math.min(4096, Math.ceil(len / S.dx) * 2));
    const ds = len / ns;

    // The whole bounding rect in one readback, with a cell of margin for the
    // staggered interpolation.
    const iL = Math.max(0, Math.floor(Math.min(x0, x1) / S.dx) - 2);
    const iR = Math.min(S.nx - 1, Math.ceil(Math.max(x0, x1) / S.dx) + 2);
    const jB = Math.max(0, Math.floor(Math.min(z0, z1) / S.dx) - 2);
    const jT = Math.min(S.ny - 1, Math.ceil(Math.max(z0, z1) / S.dx) + 2);
    const w = iR - iL + 1, h = jT - jB + 1;
    const need = w * h * 4;
    if (!S.lnU || S.lnU.length < need) { S.lnU = new Float32Array(need); S.lnF = new Float32Array(need); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(iL, jB, w, h, gl.RGBA, gl.FLOAT, S.lnU);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(iL, jB, w, h, gl.RGBA, gl.FLOAT, S.lnF);
    const U = S.lnU, F = S.lnF;
    const at = (buf, i, j, c) =>
      buf[((Math.min(Math.max(j, jB), jT) - jB) * w +
           (Math.min(Math.max(i, iL), iR) - iL)) * 4 + c];
    /** Bilinear over cell CENTRES, which is where f and P live. */
    const centre = (buf, x, z, c) => {
      const gx = x / S.dx - 0.5, gz = z / S.dx - 0.5;
      const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
      return (at(buf, i, j, c) * (1 - fx) + at(buf, i + 1, j, c) * fx) * (1 - fz)
           + (at(buf, i, j + 1, c) * (1 - fx) + at(buf, i + 1, j + 1, c) * fx) * fz;
    };

    for (let k = 0; k < ns; k++) {
      const s = (k + 0.5) * ds;
      const x = x0 + tx * s, z = z0 + tz * s;
      const ci = Math.min(S.nx - 1, Math.max(0, Math.floor(x / S.dx)));
      const cj = Math.min(S.ny - 1, Math.max(0, Math.floor(z / S.dx)));
      const m = S.mask[cj * S.nx + ci];
      if (m > 192 || (closed && m > 64)) continue;      // a section through rock
      // u lives on x-faces and w on z-faces, so each is offset half a cell.
      const gx = x / S.dx, gz = z / S.dx;
      const ui = Math.floor(gx), uj = Math.floor(gz - 0.5);
      const ax = gx - ui, az = gz - 0.5 - uj;
      const u = (at(U, ui, uj, 0) * (1 - ax) + at(U, ui + 1, uj, 0) * ax) * (1 - az)
              + (at(U, ui, uj + 1, 0) * (1 - ax) + at(U, ui + 1, uj + 1, 0) * ax) * az;
      const wi = Math.floor(gx - 0.5), wj = Math.floor(gz);
      const bx = gx - 0.5 - wi, bz = gz - wj;
      const wv = (at(U, wi, wj, 1) * (1 - bx) + at(U, wi + 1, wj, 1) * bx) * (1 - bz)
               + (at(U, wi, wj + 1, 1) * (1 - bx) + at(U, wi + 1, wj + 1, 1) * bx) * bz;
      const f = centre(F, x, z, 0);
      const P = centre(U, x, z, 2);
      const un = u * nx + wv * nz;
      out.Q += Math.min(f, 1) * un * ds;
      out.mdot += RHO * f * un * ds;
      out.Mx += RHO * f * u * un * ds;
      out.Mz += RHO * f * wv * un * ds;
      out.Fpx += RHO * f * P * nx * ds;
      out.Fpz += RHO * f * P * nz * ds;
      out.E += RHO * f * un * (gAbs * (z - tilt * x) + P + 0.5 * (u * u + wv * wv)) * ds;
      out.wet += Math.min(f, 1) * ds;
      out.n++;
    }
    return out;
  }

  function boxFlux(x0, z0, x1, z1) {
    const gAbs = Math.abs(S.p.g), RHO = 1000, tilt = S.scene.tiltS0 || 0;
    const closed = S.p.valveClosed > 0.5;
    let iL = Math.round(Math.min(x0, x1) / S.dx), iR = Math.round(Math.max(x0, x1) / S.dx);
    let jB = Math.round(Math.min(z0, z1) / S.dx), jT = Math.round(Math.max(z0, z1) / S.dx);
    iL = Math.max(1, Math.min(S.nx - 2, iL)); iR = Math.max(iL + 1, Math.min(S.nx - 1, iR));
    jB = Math.max(1, Math.min(S.ny - 2, jB)); jT = Math.max(jB + 1, Math.min(S.ny - 1, jT));
    const w = iR - iL + 2, h = jT - jB + 2;
    const need = w * h * 4;
    if (!S.cvU || S.cvU.length < need) { S.cvU = new Float32Array(need); S.cvF = new Float32Array(need); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(iL - 1, jB - 1, w, h, gl.RGBA, gl.FLOAT, S.cvU);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(iL - 1, jB - 1, w, h, gl.RGBA, gl.FLOAT, S.cvF);
    const U = S.cvU, F = S.cvF;
    const k = (i, j) => ((j - jB + 1) * w + (i - iL + 1)) * 4;
    const sol = (i, j) => { const m = S.mask[j * S.nx + i]; return m > 192 || (closed && m > 64); };
    const edge = () => ({ Q: 0, mdot: 0, Mx: 0, Mz: 0, Fpx: 0, Fpz: 0, E: 0, wet: 0 });
    const out = { left: edge(), right: edge(), bed: edge(), top: edge() };

    // x-faces: u lives ON the face, so the normal velocity needs no averaging.
    for (const [i, n, key] of [[iL, -1, "left"], [iR, 1, "right"]]) {
      const e = out[key];
      for (let j = jB; j < jT; j++) {
        if (sol(i - 1, j) || sol(i, j)) continue;
        const a = k(i - 1, j), b = k(i, j);
        const u = U[b];
        const f = 0.5 * (F[a] + F[b]);
        const P = 0.5 * (U[a + 2] + U[b + 2]);
        const wv = 0.25 * (U[a + 1] + U[b + 1] + U[k(i - 1, j + 1) + 1] + U[k(i, j + 1) + 1]);
        const un = u * n, z = (j + 0.5) * S.dx, x = i * S.dx;
        e.Q += Math.min(f, 1) * un;
        e.mdot += f * un;
        e.Mx += f * u * un;   e.Mz += f * wv * un;
        e.Fpx += f * P * n;
        e.E += f * un * (gAbs * (z - tilt * x) + P + 0.5 * (u * u + wv * wv));
        e.wet += Math.min(f, 1);
      }
    }
    // z-faces: w lives ON the face.
    for (const [j, n, key] of [[jB, -1, "bed"], [jT, 1, "top"]]) {
      const e = out[key];
      for (let i = iL; i < iR; i++) {
        if (sol(i, j - 1) || sol(i, j)) continue;
        const a = k(i, j - 1), b = k(i, j);
        const wv = U[b + 1];
        const f = 0.5 * (F[a] + F[b]);
        const P = 0.5 * (U[a + 2] + U[b + 2]);
        const u = 0.25 * (U[a] + U[b] + U[k(i + 1, j - 1)] + U[k(i + 1, j)]);
        const un = wv * n, z = j * S.dx, x = (i + 0.5) * S.dx;
        e.Q += Math.min(f, 1) * un;
        e.mdot += f * un;
        e.Mx += f * u * un;   e.Mz += f * wv * un;
        e.Fpz += f * P * n;
        e.E += f * un * (gAbs * (z - tilt * x) + P + 0.5 * (u * u + wv * wv));
        e.wet += Math.min(f, 1);
      }
    }

    // …to physical units, and the totals.
    const tot = edge();
    let inQ = 0;
    for (const key of ["left", "right", "bed", "top"]) {
      const e = out[key];
      e.Q *= S.dx;               e.wet *= S.dx;
      e.mdot *= RHO * S.dx;
      e.Mx *= RHO * S.dx;        e.Mz *= RHO * S.dx;
      e.Fpx *= RHO * S.dx;       e.Fpz *= RHO * S.dx;
      e.E *= RHO * S.dx;
      for (const q of ["Q", "mdot", "Mx", "Mz", "Fpx", "Fpz", "E", "wet"]) tot[q] += e[q];
      if (e.Q < 0) inQ -= e.Q;   // what came IN, for a relative closure error
    }
    // The force on what is inside is minus the flux of momentum out plus the
    // pressure on the faces — the same sum `boxForce` reports, less the weight
    // term, which is not a face quantity and is added by the caller if wanted.
    return { edges: out, total: tot, inQ,
             fx: -(tot.Mx + tot.Fpx), fz: -(tot.Mz + tot.Fpz),
             iL, iR, jB, jT };
  }

  function boxForce(x0, z0, x1, z1) {
    const gAbs = Math.abs(S.p.g), RHO = 1000;
    const closed = S.p.valveClosed > 0.5;
    let iL = Math.round(Math.min(x0, x1) / S.dx), iR = Math.round(Math.max(x0, x1) / S.dx);
    let jB = Math.round(Math.min(z0, z1) / S.dx), jT = Math.round(Math.max(z0, z1) / S.dx);
    iL = Math.max(1, Math.min(S.nx - 2, iL)); iR = Math.max(iL + 1, Math.min(S.nx - 1, iR));
    jB = Math.max(1, Math.min(S.ny - 2, jB)); jT = Math.max(jB + 1, Math.min(S.ny - 1, jT));
    const w = iR - iL + 2, h = jT - jB + 2;          // rect [iL−1..iR] × [jB−1..jT]
    const need = w * h * 4;
    if (!S.cvU || S.cvU.length < need) { S.cvU = new Float32Array(need); S.cvF = new Float32Array(need); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(iL - 1, jB - 1, w, h, gl.RGBA, gl.FLOAT, S.cvU);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(iL - 1, jB - 1, w, h, gl.RGBA, gl.FLOAT, S.cvF);
    const U = S.cvU, F = S.cvF;
    const k = (i, j) => ((j - jB + 1) * w + (i - iL + 1)) * 4;
    const sol = (i, j) => { const m = S.mask[j * S.nx + i]; return m > 192 || (closed && m > 64); };

    let dFx = 0, dFz = 0, mdot = 0;                  // Σ f[u(u·n) + P n]·ds, Σ f(u·n)·ds
    for (const [i, nx_] of [[iL, -1], [iR, 1]]) {    // x-faces: u is ON the face
      for (let j = jB; j < jT; j++) {
        if (sol(i - 1, j) || sol(i, j)) continue;
        const a = k(i - 1, j), b = k(i, j);
        const u = U[b];                              // u at the west face of cell i
        const f = 0.5 * (F[a] + F[b]);
        const P = 0.5 * (U[a + 2] + U[b + 2]);
        const w = 0.25 * (U[a + 1] + U[b + 1] + U[k(i - 1, j + 1) + 1] + U[k(i, j + 1) + 1]);
        const un = u * nx_;
        dFx += f * (u * un + P * nx_);
        dFz += f * (w * un);
        mdot += f * un;
      }
    }
    for (const [j, nz_] of [[jB, -1], [jT, 1]]) {    // z-faces: w is ON the face
      for (let i = iL; i < iR; i++) {
        if (sol(i, j - 1) || sol(i, j)) continue;
        const a = k(i, j - 1), b = k(i, j);
        const w = U[b + 1];                          // w at the south face of cell j
        const f = 0.5 * (F[a] + F[b]);
        const P = 0.5 * (U[a + 2] + U[b + 2]);
        const u = 0.25 * (U[a] + U[b] + U[k(i + 1, j - 1)] + U[k(i + 1, j)]);
        const wn = w * nz_;
        dFx += f * (u * wn);
        dFz += f * (w * wn + P * nz_);
        mdot += f * wn;
      }
    }
    let m = 0;                                       // enclosed water, for the z-budget
    for (let j = jB; j < jT; j++) {
      for (let i = iL; i < iR; i++) if (!sol(i, j)) m += F[k(i, j)];
    }
    m *= RHO * S.dx * S.dx;
    return { fx: -RHO * dFx * S.dx, fz: -RHO * dFz * S.dx - gAbs * m,
             mdot: RHO * mdot * S.dx, mass: m, iL, iR, jB, jT };
  }

  const get = () => S;
  return { init, build, rasterise, addSeg, undoSeg, clearSegs, resetWater,
           step, columns, advanceParticles, render, probe, rake, patch, patchVel,
           fieldStats, particlePos,
           boxForce, boxFlux, lineFlux, dt, get, inletVel, bands, rescaleFill,
           stamp: (seg, v) => { stampSeg(S.mask, seg, v); } };
})();
