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
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return gl;
  }

  // ------------------------------------------------------------- geometry
  /** Stamp a thick straight segment (metres) into the solid mask.
   *  Ends are BUTT, not round: the endpoints are the true extent of the edge,
   *  so a gate drawn to y = 0.39 leaves an opening that starts at 0.39. Round
   *  caps quietly eat half a thickness off every gap, which is fatal when the
   *  gap is the thing being demonstrated. */
  function stampSeg(mask, seg, value) {
    const [x0, y0, x1, y1, th] = seg;
    const r = Math.max(th, S.dx * 1.7) * 0.5;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r) / S.dx));
    const i1 = Math.min(S.nx - 1, Math.ceil((Math.max(x0, x1) + r) / S.dx));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - r) / S.dx));
    const j1 = Math.min(S.ny - 1, Math.ceil((Math.max(y0, y1) + r) / S.dx));
    const ax = x1 - x0, ay = y1 - y0;
    const len2 = ax * ax + ay * ay;
    const dot = len2 < 1e-9;                       // degenerate = a disc
    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) * S.dx;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * S.dx;
        let t = dot ? 0 : ((px - x0) * ax + (py - y0) * ay) / len2;
        if (!dot && (t < 0 || t > 1)) continue;
        const dx = px - (x0 + t * ax), dy = py - (y0 + t * ay);
        if (dx * dx + dy * dy <= r * r) mask[j * S.nx + i] = value;
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
  function addSeg(x0, y0, x1, y1, th, kind) {
    S.segs.push([x0, y0, x1, y1, th, kind]);
    rasterise();
  }
  function undoSeg() { if (S.segs.length) { S.segs.pop(); rasterise(); } }
  function clearSegs() { S.segs.length = 0; rasterise(); }

  // ------------------------------------------------------------ allocation
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
    S = {
      scene, nx, ny, dx, segs,
      W: nx * dx, H: ny * dx,
      mask: new Uint8Array(nx * ny),
      t: 0, frames: 0,
      p,
    };

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
    const w = S.scene.water;
    for (let j = 0; j < S.ny; j++) {
      for (let i = 0; i < S.nx; i++) {
        const k = (j * S.nx + i) * 4;
        d[k] = Math.max(0, w((i + 0.5) * S.dx, (j + 0.5) * S.dx, P) || 0);
      }
    }
    for (const b of [S.F.a, S.F.b]) {
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S.nx, S.ny, 0, gl.RGBA, gl.FLOAT, d);
    }
    const z = new Float32Array(n * 4);
    for (const b of [S.U.a, S.U.b]) {
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S.nx, S.ny, 0, gl.RGBA, gl.FLOAT, z);
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

  /** The y-range a level control (inflow / tailwater) is allowed to touch:
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
    gl.uniform4f(pr.u("u_src0"), s0.x, s0.y, s0.r, s0.on);
    gl.uniform4f(pr.u("u_sv0"), s0.vx, s0.vy, 0, 0);   // spout runs clear
    if (s1) {
      gl.uniform4f(pr.u("u_src1"), s1.x, s1.y, s1.r, 1);
      gl.uniform4f(pr.u("u_sv1"), s1.vx, s1.vy, 0, 0.85);
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
    gl.uniform1f(prog.draw.u("u_c2"), S.p.c * S.p.c);
    gl.uniform1f(prog.draw.u("u_valve"), S.p.valveClosed);
    gl.uniform1f(prog.draw.u("u_time"), S.t);
    gl.uniform1i(prog.draw.u("u_mode"), opts.mode);
    gl.uniform1f(prog.draw.u("u_vmax"), opts.vmax);
    gl.uniform1f(prog.draw.u("u_hmax"), opts.hmax);
    gl.uniform1f(prog.draw.u("u_dyeOn"), opts.dye ? 1 : 0);
    gl.uniform4f(prog.draw.u("u_cursor"), opts.cursor[0], opts.cursor[1], opts.cursor[2], 0);
    gl.uniform4f(prog.draw.u("u_guide"), opts.guide[0], opts.guide[1], opts.guide[2], opts.guide[3]);
    gl.uniform1f(prog.draw.u("u_guideOn"), opts.guideOn ? 1 : 0);
    rect.draw();

    if (opts.particles) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(prog.pdraw);
      GLH.bindTex(gl, prog.pdraw, [["u_P", S.P.read.tex], ["u_U", S.U.read.tex]]);
      gl.uniform2f(prog.pdraw.u("u_res"), S.nx, S.ny);
      gl.uniform2f(prog.pdraw.u("u_pres"), S.pn, S.pn);
      gl.uniform4f(prog.pdraw.u("u_rect"), view.ndc[0], view.ndc[1], view.ndc[2], view.ndc[3]);
      gl.uniform1f(prog.pdraw.u("u_dx"), S.dx);
      gl.uniform1f(prog.pdraw.u("u_psize"), Math.max(1.5, view.pxW / 420));
      gl.uniform1f(prog.pdraw.u("u_vmax"), opts.vmax);
      points.draw(S.pn * S.pn);
      gl.disable(gl.BLEND);
    }
  }

  // -------------------------------------------------------------- readback
  /** One cell: {f, dye, u, v, p, head}. Used by gauges and the hover readout. */
  function probe(x, y) {
    const i = Math.max(0, Math.min(S.nx - 1, Math.floor(x / S.dx)));
    const j = Math.max(0, Math.min(S.ny - 1, Math.floor(y / S.dx)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(i, j, 1, 1, gl.RGBA, gl.FLOAT, S.pxBuf);
    const u = S.pxBuf[0], v = S.pxBuf[1], p = S.pxBuf[2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(i, j, 1, 1, gl.RGBA, gl.FLOAT, S.pxBuf);
    const g = Math.abs(S.p.g) || 9.81;
    return { i, j, f: S.pxBuf[0], u, v, p, head: p / g, speed: Math.hypot(u, v),
             solid: S.mask[j * S.nx + i] };
  }

  /** A whole column of velocity — the vertical rake. Returns u(y) at cell centres. */
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

  /** Bilinear (u, v) at a point, from a patch. u lives on x-faces, v on
   *  y-faces, so each is offset half a cell from the centre. */
  function patchVel(p, x, y) {
    const gx = x / p.dx - p.i0, gy = y / p.dx;
    const sx = Math.max(0, Math.min(p.w - 1.001, gx));
    const sy = Math.max(0, Math.min(p.ny - 1.001, gy - 0.5));
    const i = Math.floor(sx), j = Math.floor(sy), fx = sx - i, fy = sy - j;
    const at = (ii, jj, c) => p.buf[((jj * p.w) + Math.min(ii, p.w - 1)) * 4 + c];
    const u = (at(i, j, 0) * (1 - fx) + at(i + 1, j, 0) * fx) * (1 - fy)
            + (at(i, j + 1, 0) * (1 - fx) + at(i + 1, j + 1, 0) * fx) * fy;
    const tx = Math.max(0, Math.min(p.w - 1.001, gx - 0.5));
    const ty = Math.max(0, Math.min(p.ny - 1.001, gy));
    const i2 = Math.floor(tx), j2 = Math.floor(ty), gxf = tx - i2, gyf = ty - j2;
    const v = (at(i2, j2, 1) * (1 - gxf) + at(i2 + 1, j2, 1) * gxf) * (1 - gyf)
            + (at(i2, j2 + 1, 1) * (1 - gxf) + at(i2 + 1, j2 + 1, 1) * gxf) * gyf;
    return [u, v];
  }

  const get = () => S;
  return { init, build, rasterise, addSeg, undoSeg, clearSegs, resetWater,
           step, columns, advanceParticles, render, probe, rake, patch, patchVel,
           dt, get, inletVel, bands,
           stamp: (seg, v) => { stampSeg(S.mask, seg, v); } };
})();
