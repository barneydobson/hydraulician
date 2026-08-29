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
    // The same source with ACCUM defined — a separate program, not a uniform
    // branch: an MRT bound to a dummy target still writes a second
    // full-resolution RGBA32F every substep, and a session that never opens
    // Average must pay exactly what it paid before this existed.
    prog.vofA = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_VOF_ACC);
    prog.col  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_COL);
    prog.part = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_PART);
    // The Favre display accumulator (§4.1 of docs/averaging.md) — a separate
    // pass from prog.vofA's transport accumulator, and a separate program
    // because it runs once per FRAME, not once per substep.
    prog.acc  = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_ACC);
    // The column-reading accumulator (§4.3) — averages FS_COL's own output
    // (bed, d, q, top), not the raw fields, so connectivity is decided on the
    // sharp per-frame column and only the resulting scalars are smoothed.
    prog.acol = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_ACOL);
    prog.draw = GLH.createProgram(gl, Shaders.VS_RECT, Shaders.FS_DISP);
    prog.pdraw = GLH.createProgram(gl, Shaders.VS_PART, Shaders.FS_PART_DRAW);
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

    // Any change to the mask invalidates the window being averaged: the walls
    // the mean was accumulated through are no longer the walls on screen, and
    // §9 of docs/averaging.md lists a geometry edit as a reset condition. This
    // is the choke point for every path that moves a wall — the drawing tools
    // here, and the boundary-open toggles in main.js — so one reset covers
    // them all. A no-op during build(), which nulls S.avg before it calls
    // this, so it can neither double-start nor fight build()'s own wasAvg
    // restore.
    if (S.avg) avgReset();
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
    // The accumulator's framebuffers attach g.F's textures, so it has to go
    // before them. avgStop does NOT come through here: this is the grid
    // RETIREMENT path — it tears down U, F, P, the solid texture and the
    // column target, and the `g === S` guard above is what stops it doing
    // that to the live grid. Handing it a synthetic { avg } object to free
    // one accumulator would walk straight past that guard (a literal is never
    // === S) and tie the accumulator's lifetime to a rebuild. Both callers
    // share disposeAvg instead.
    if (g.avg) { disposeAvg(g.avg); g.avg = null; }
    for (const b of [g.U, g.F, g.P]) if (b && b.dispose) b.dispose();
    if (g.colFbo) gl.deleteFramebuffer(g.colFbo);
    if (g.solid) gl.deleteTexture(g.solid);
    if (g.colTex) gl.deleteTexture(g.colTex);
    g.U = null; g.F = null; g.P = null;
    g.solid = null; g.colTex = null; g.colFbo = null;
  }

  function build(scene, budget, keepSegs) {
    // docs/averaging.md §9 lists a scene change and a resolution rebuild as
    // RESET conditions, not stop conditions: the window restarts from zero,
    // but Average does not switch itself off under the caller. Captured
    // before release(old) frees the outgoing accumulator.
    const wasAvg = !!(S && S.avg);
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
    S.avg = null;                   // transport accumulator, allocated on demand

    rasterise();
    resetWater();
    if (wasAvg) avgStart();         // zeroed against the new grid, f(0) = the reset water
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
    // The accumulator's MRT framebuffers attach S.F.a.tex / S.F.b.tex, whose
    // storage the loop above just RESPECIFIED — the same hazard rescaleFill
    // sidesteps with texSubImage2D. Rebuild rather than gamble on those
    // attachments surviving. It also gives R the window reset the averaging
    // mode wants: a reloaded scene shares nothing with the run being averaged.
    if (S.avg) { avgStop(); avgStart(); }
  }

  // ------------------------------------------------------------- averaging
  // The transport accumulator of docs/averaging.md §4.2. The vof pass emits
  // its OWN limited face fluxes on a second render target, so the mass
  // balance is certified with the numbers the scheme actually advanced f by —
  // not with a cell-centred reconstruction of them. (For fills (0, 0.2, 0.8,
  // 1) the van-Leer face value is 0.35 against an upwind product of 0.20,
  // before the compression flux and the donor clamp, so the two are not
  // interchangeable.)
  //
  // Channel contract, per cell: r = <F^E>, g = <F^N>, b = <S>, a unused.
  // Each cell owns its EAST and NORTH face only; F^E(i,j) IS F^W(i+1,j) by
  // construction (one fluxX call, same arguments), so the two channels tile
  // every face exactly once. The left ghost column and the bottom ghost row
  // carry the two faces their interior neighbours cannot.
  //
  // Nothing in the solution ever reads this. It is a diagnostic.

  function disposeAvg(a) {
    if (!a) return;
    if (a.T) a.T.dispose();
    if (a.fboA) gl.deleteFramebuffer(a.fboA);
    if (a.fboB) gl.deleteFramebuffer(a.fboB);
    if (a.fld) a.fld.dispose();
    if (a.col) a.col.dispose();
    // The two CPU snapshots are plain arrays, so they go with the dropped
    // S.avg object either way — nulled here so this reads as the complete
    // teardown it is, and so a stale bed cannot outlive its window.
    a.f0buf = null; a.bedbuf = null;
  }

  /** Lazily allocated: a session that never opens Average pays nothing.
   *  `t` is the window in SIMULATED seconds and lives here, not in a texture —
   *  it is the same number in every cell, which is why four channels suffice. */
  function avgStart() {
    if (S.avg) return;
    const F = gl.RGBA32F, RGBA = gl.RGBA, FL = gl.FLOAT;
    const T = GLH.createDoubleBuffer(gl, S.nx, S.ny, F, RGBA, FL, null);
    // The vof pass writes f and the accumulator together, so both halves of
    // each ping-pong need a framebuffer that carries both attachments — and
    // the two ping-pongs must stay in phase, which is what `fA` is for.
    // Selecting on `S.F.write === S.F.b` would be a tautology (the double
    // buffer's `write` getter simply RETURNS `b`), so after the first swap it
    // would keep picking fboA and write f and the accumulator into mismatched
    // textures — silent corruption of exactly what this exists to detect.
    // Identity of the attached texture is the only honest test.
    const fboA = GLH.createFBO2(gl, S.F.b.tex, T.b.tex);
    const fboB = GLH.createFBO2(gl, S.F.a.tex, T.a.tex);
    // The Favre display accumulator (§4.1) — its own ping-pong, because it is
    // a plain single-attachment target updated once per FRAME by prog.acc,
    // not once per substep by the vof pass's MRT. `tf` is its own clock for
    // the same reason: `t` advances inside SIM.step (per substep, transport),
    // `tf` advances in avgStepField (per frame, display) — mixing them would
    // feed the running-mean weight a window that does not match the sample.
    const fld = GLH.createDoubleBuffer(gl, S.nx, S.ny, F, RGBA, FL, null);
    // The column-reading accumulator (§4.3) — nx × 1, its own ping-pong and
    // its own clock `tc`: it advances once per FRAME like `tf`, but it is a
    // separate sample (FS_COL's output, not the raw field), so it gets a
    // separate window. Do not fold it into `tf` — see the module note above.
    const col = GLH.createDoubleBuffer(gl, S.nx, 1, F, RGBA, FL, null);
    S.avg = { T, fboA, fboB, fA: S.F.b.tex, f0buf: null, t: 0, fld, tf: 0,
              col, tc: 0, bedbuf: null };
    snapshotF0();
    snapshotBed();
  }
  function avgStop() { if (S.avg) { disposeAvg(S.avg); S.avg = null; } }
  function avgReset() { if (S.avg) { avgStop(); avgStart(); } }
  const avgActive = () => !!(S && S.avg);
  const avgT = () => (S && S.avg ? S.avg.t : 0);

  /** f(0) for the endpoint term of the balance. One copy, taken when the
   *  window opens; f(T) is simply the live field. Kept on the CPU: it is only
   *  ever read back, so a texture for it would be write-only. If a later pass
   *  wants f(0) on the GPU it is one texSubImage2D from here. */
  function snapshotF0() {
    const buf = new Float32Array(S.nx * S.ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, buf);
    S.avg.f0buf = buf;
  }

  /** The bed as it stands when the window opens — one forced column readback,
   *  here rather than on every avgColumns() call.
   *
   *  Valid because the bed cannot move while a window is open: every path that
   *  moves a wall goes through `rasterise`, and `rasterise` calls `avgReset`,
   *  which closes this window and opens a new one. A live re-read could only
   *  ever return what is already in here. Do NOT "fix" this back into a
   *  `columns()` call inside avgColumns: `columns()` drives the shared
   *  `colTick` throttle in front of a synchronous readPixels that costs two
   *  thirds of a frame at 1200 columns (see its own comment), and the overlay
   *  calls avgColumns once per frame — a second call would halve the throttle
   *  period on exactly that path. */
  function snapshotBed() {
    const c = columns(true), bed = new Float32Array(S.nx);
    for (let i = 0; i < S.nx; i++) bed[i] = c[i * 4];
    S.avg.bedbuf = bed;
  }

  /** The discrete transport balance of docs/averaging.md §5, over interior
   *  cells with no source.
   *
   *      (f(T) − f(0))/T  +  [(⟨F^E⟩ − ⟨F^W⟩) + (⟨F^N⟩ − ⟨F^S⟩)]/Δx  −  ⟨S⟩  =  0
   *
   *  It is an IDENTITY of the scheme, not an approximation: every term is the
   *  running mean of a number the pass computed. What is left is the float32
   *  rounding drift of the running-mean recursion itself, and it is NOT
   *  bounded — it GROWS as √T.
   *
   *  Each substep does ⟨F⟩ ← ⟨F⟩ + k(F − ⟨F⟩) in float32, so each of the four
   *  face means carries a random walk of about ½·ulp⟨F⟩ per step. Over
   *  n = T/Δt steps that is ≈ ½·ulp⟨F⟩·√n, and the residual divides a face
   *  DIFFERENCE by Δx, so
   *
   *      R_max  ≈  C · ε · ‖⟨F⟩‖∞ · √(T/Δt) / Δx,        ε = 2⁻²³
   *
   *  Measured on h23 at Low (Δx = 16.3 mm, Δt = 2.626e-4 s) over a 256× range
   *  in substep count — log-log slope 0.472 for the max and 0.464 for the
   *  mean, so it is the whole field drifting, not a few outlier cells:
   *
   *      n =   200, T = 0.0525 s → 2.067e-4      C = 0.439
   *      n =   800, T = 0.2101 s → 4.633e-4      C = 0.538
   *      n =  3200, T = 0.8403 s → 7.830e-4      C = 0.472
   *      n = 12800, T = 3.3613 s → 1.297e-3      C = 0.399
   *      n = 51200, T = 13.445 s → 3.253e-3      C = 0.513
   *
   *  C stays inside 0.40–0.54 over that whole range (0.745 on an ANGLE/D3D11
   *  path), which is what makes the law usable as a gate: scale by √(T/Δt) and
   *  the margin stops moving. `Fmax` is returned so a caller can do exactly
   *  that — see `avgBound` in exercises/_runner/smoke.js.
   *
   *  A one-substep window is a DIFFERENT and smaller regime: there the storage
   *  term dominates, because f is stored in float32 and an update below half an
   *  ulp of f rounds to a no-op. The n = 1 maximum measures 2.2697448730469e-4
   *  against ½·ulp(1.007)/Δt = 2.2697448730469e-4 — thirteen significant
   *  figures. That is the FLOOR, not the ceiling; a constant tolerance drawn
   *  from it is right at one window length and wrong at every other. For scale,
   *  ∇ₕ·⟨F⟩ itself runs to 135 s⁻¹ here.
   *
   *  Cells where ⟨S⟩ is nonzero are the sponge, the Dirichlet bands, the point
   *  sources AND every positivity-clamp event — the invented-water signature
   *  the Conservation notes warn about — so `nSrc` is reported separately
   *  rather than silently folded into the exclusion. Solid cells are excluded
   *  too: they early-return in the shader and merely pass their accumulator
   *  through. */
  function transportResidual() {
    if (!S.avg || !(S.avg.t > 0)) return { max: 0, mean: 0, n: 0, nSrc: 0, Fmax: 0 };
    const n = S.nx * S.ny;
    const A = new Float32Array(n * 4), fT = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.T.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, A);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, fT);
    const f0 = S.avg.f0buf;
    // 255 = wall, 128 = valve (solid only while closed), 0 = open.
    const solidLo = S.p.valveClosed > 0.5 ? 64 : 192;
    const T = S.avg.t, nx = S.nx;
    let max = 0, sum = 0, cnt = 0, nSrc = 0, Fmax = 0;
    for (let j = 1; j < S.ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = (j * nx + i) * 4;
        if (S.mask[j * nx + i] >= solidLo) continue;
        // The scale of the drift, over every interior fluid cell — source
        // cells included, because their face means still feed a source-free
        // neighbour's divergence.
        const aE = Math.abs(A[k]), aN = Math.abs(A[k + 1]);
        if (aE > Fmax) Fmax = aE;
        if (aN > Fmax) Fmax = aN;
        if (Math.abs(A[k + 2]) > 1e-9) { nSrc++; continue; }   // source cell
        // West face = the west neighbour's stored east face; south face = the
        // south neighbour's stored north face. Both are the same number, not
        // a copy of it.
        const div = ((A[k] - A[k - 4]) + (A[k + 1] - A[((j - 1) * nx + i) * 4 + 1])) / S.dx;
        const r = (fT[k] - f0[k]) / T + div - A[k + 2];
        const a = Math.abs(r);
        if (a > max) max = a;
        sum += a; cnt++;
      }
    }
    return { max, mean: cnt ? sum / cnt : 0, n: cnt, nSrc, Fmax };
  }

  // ------------------------------------------------- averaging: display field
  // §4.1 of docs/averaging.md. This is a DIFFERENT object from the transport
  // accumulator above: that one stores the scheme's own limited face fluxes,
  // certified against the discrete mass balance; this one stores a physically
  // meaningful mean velocity for the picture the app will eventually paint.
  // One field cannot do both jobs — see docs/averaging.md §3.

  /** One frame's accumulation of the display field. Called BEFORE `S.avg.tf`
   *  is advanced, because the running-mean weight needs the window as it was. */
  function avgStepField(dtSim) {
    if (!S.avg || !(dtSim > 0)) return;
    gl.useProgram(prog.acc);
    GLH.bindTex(gl, prog.acc, [["u_A", S.avg.fld.read.tex],
                               ["u_U", S.U.read.tex], ["u_F", S.F.read.tex]]);
    gl.uniform2f(prog.acc.u("u_res"), S.nx, S.ny);
    gl.uniform1f(prog.acc.u("u_T"), S.avg.tf);
    gl.uniform1f(prog.acc.u("u_dt"), dtSim);
    GLH.bindTarget(gl, S.avg.fld.write.fbo, S.nx, S.ny);
    quad.draw();
    S.avg.fld.swap();
    S.avg.tf += dtSim;
  }

  /** The mean state, normalised. `ubar`/`wbar` are FAVRE velocities:
   *  <f u_c>/f-bar, not <u_c> — the density-weighted mean is the one that
   *  leaves the equations looking like themselves in the heavy-fluid limit. */
  function avgField() {
    const n = S.nx * S.ny, buf = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.fld.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, buf);
    const fbar = new Float32Array(n), pbar = new Float32Array(n);
    const ubar = new Float32Array(n), wbar = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const f = buf[k * 4 + 2];
      fbar[k] = f; pbar[k] = buf[k * 4 + 3];
      const d = Math.max(f, 1e-6);
      ubar[k] = buf[k * 4] / d; wbar[k] = buf[k * 4 + 1] / d;
    }
    return { fbar, pbar, ubar, wbar };
  }

  // ------------------------------------------------ averaging: column readings
  // §4.3 of docs/averaging.md — the authoritative readings (mean depth, mean
  // discharge, mean surface level, and the surface's standard deviation).
  //
  // This accumulator averages FS_COL's OWN OUTPUT, not the raw U/F fields it
  // was built from. FS_COL already walks the connected wet run correctly on
  // sharp data every frame; a nappe touching a pool for any fraction of the
  // window would leave mean fill all the way between them, so deciding
  // connectivity on the MEAN field would report a connected body that existed
  // at no instant. Averaging the scalars FS_COL already resolved keeps every
  // connectivity decision on data where it is well posed.

  /** One frame's accumulation of the column readings. Must run AFTER
   *  `SIM.columns()` has refreshed `S.colTex` for this frame — `columns()`
   *  runs its GPU pass every call regardless of the readback throttle, so
   *  this is safe to call once per frame right after it. */
  function avgStepColumns(dtSim) {
    if (!S.avg || !(dtSim > 0)) return;
    gl.useProgram(prog.acol);
    GLH.bindTex(gl, prog.acol, [["u_A", S.avg.col.read.tex], ["u_C", S.colTex]]);
    gl.uniform1f(prog.acol.u("u_T"), S.avg.tc);
    gl.uniform1f(prog.acol.u("u_dt"), dtSim);
    GLH.bindTarget(gl, S.avg.col.write.fbo, S.nx, 1);
    quad.draw();
    S.avg.col.swap();
    S.avg.tc += dtSim;
  }

  /** The mean columns, in SIM.columns' own layout so OVERLAY.analyse takes
   *  them unchanged: (bed, d, q, surface). The bed is static within a window
   *  (any geometry edit resets via avgReset), so it comes from the snapshot
   *  taken when the window opened rather than from an averaged channel — and
   *  this function makes no call into columns(); see snapshotBed. */
  function avgColumns() {
    const buf = new Float32Array(S.nx * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.col.read.fbo);
    gl.readPixels(0, 0, S.nx, 1, gl.RGBA, gl.FLOAT, buf);
    const bed = S.avg.bedbuf;
    const C = new Float32Array(S.nx * 4), sigma = new Float32Array(S.nx);
    for (let i = 0; i < S.nx; i++) {
      C[i * 4]     = bed[i];                   // bed, from the window snapshot
      C[i * 4 + 1] = buf[i * 4];               // d̄
      C[i * 4 + 2] = buf[i * 4 + 1];           // q̄
      C[i * 4 + 3] = buf[i * 4 + 2];           // η̄
      sigma[i] = RECON.sigma(buf[i * 4 + 3], S.avg.tc);
    }
    return { C, sigma };
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
      const useAcc = !!S.avg;
      const pv = useAcc ? prog.vofA : prog.vof;
      gl.useProgram(pv);
      GLH.bindTex(gl, pv, useAcc
        ? [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid],
           ["u_A", S.avg.T.read.tex]]
        : [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid]]);
      simUniforms(pv, h);
      gl.uniform1f(pv.u("u_ca"), p.ca);
      gl.uniform1f(pv.u("u_dyeDecay"), p.dyeDecay);
      gl.uniform2f(pv.u("u_dyeLine"), p.dyeLine, p.dyeLine > 0 ? 1 : 0);
      if (useAcc) {
        // T BEFORE this substep — the running-mean weight is h/(T+h).
        gl.uniform1f(pv.u("u_Tacc"), S.avg.t);
        // The MRT fbo whose attachments are the two WRITE halves. Compared by
        // texture identity, not by `S.F.write === S.F.b`: see avgStart.
        GLH.bindTarget(gl, S.F.write.tex === S.avg.fA ? S.avg.fboA : S.avg.fboB,
          S.nx, S.ny);
      } else {
        GLH.bindTarget(gl, S.F.write.fbo, S.nx, S.ny);
      }
      quad.draw();
      S.F.swap();
      // Both ping-pongs advance together or they fall out of phase.
      if (useAcc) { S.avg.T.swap(); S.avg.t += h; }

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
           boxForce, dt, get, inletVel, bands, rescaleFill,
           avgStart, avgStop, avgReset, avgActive, avgT, transportResidual,
           avgStepField, avgField, avgStepColumns, avgColumns,
           stamp: (seg, v) => { stampSeg(S.mask, seg, v); } };
})();
