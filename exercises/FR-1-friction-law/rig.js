/* ============================================================================
 * RIG-A · THE DUCT   — the reusable rig card (FR-1, LL-1, LL-2, PU-1, B7, B10)
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/  or  ?scene=sandbox), then:
 *
 *     RIGA.build()            // geometry + panel, reservoir level 3.30 m
 *     RIGA.build({level: 4.08, gauges: [4.0, 8.5]})
 *     FR1.student(6)          // one whole FR-1 student run for digit d = 6
 *
 * A horizontal pressurised pipe fed by a reservoir:
 *
 *   y=5.0 ┌─────┬────────────────────────────────────────────┐
 *         │ res │            air                             │
 *         │ ~L~ ├════════════════════════════════════════════╡ soffit 2.40–2.70
 *         │     │  BORE  0.40 m  (18 cells at Medium)        │ ← tailwater 2.50
 *         │     ├════════════════════════════════════════════╡ invert top 2.00
 *   y=0.0 └─────┴────────────────────────────────────────────┘ solid to the floor
 *         0    1.5                                          9.0
 *
 * Every call below is a documented app entry point — nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = the C key       SIM.undoSeg() = the Z key
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   OVERLAY.analyse(sim, SIM.columns(true)).V[i]  = the "V" the readout prints
 *
 * MEASURED FACTS THE DEPENDENT DEMOS INHERIT  (Medium, 414 × 230, Δx 21.7 mm)
 *   · the nominal 0.40 m bore rasterises to 18 cells = 0.3913 m — use THAT as D
 *   · the sandbox's own two ledges cut straight through the bore: they must be
 *     ERASED first (RIGA.build does it; a student needs two fat erase strokes)
 *   · a zero-gradient right edge (open = 1) with NO tailwater is a dead end for
 *     pressure: the pipe fills to reservoir head, the gradient vanishes and the
 *     flow decays to nothing (V 3.0 → 0.28 m/s between t = 20 s and t = 41 s).
 *     An outfall right edge (open = 2) instead pulls the HGL below the soffit
 *     and the last third of the bore de-pressurises. RIG-A therefore needs a
 *     TAILWATER, and its level must land inside the bore's column band, i.e.
 *     between 2.40 and 2.69 m. 2.50 m is the value fixed here.
 *   · entry development: the HGL peaks ~1.1 m past the mouth and is straight
 *     from x ≈ 3.5 m onward at every head in FR-1's range. Never gauge upstream
 *     of x = 3.5 m; never downstream of x = 8.6 m (the tailwater sponge is the
 *     last 10 cells, x > 8.75).
 *   · C_f does almost nothing in an 18-cell bore (λ unchanged from C_f 0.02 to
 *     0.20). The resistance lever is the EDDY VISCOSITY C_s.
 * ==========================================================================*/
window.RIGA = {
  X0: 1.50,          // pipe mouth / reservoir wall
  X1: 9.30,          // slabs run PAST the domain edge (W = 9) — extrapolate,
                     // never clamp, or the last column is left open
  INV: 2.00,         // invert top face
  SOF: 2.40,         // soffit bottom face   → bore = SOF − INV = 0.40 m
  AXIS: 2.20,        // pipe axis: where gauges go
  TW: 2.50,          // receiving-tank level (must be 2.40 < TW < 2.69)

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Build the rig. o = {level, tw, cs, cf, gauges:[xA,xB]} — all optional. */
  build: function (o) {
    o = o || {};
    var R = RIGA;
    // ---- panel: strip the sandbox back to a plain box ---------------------
    R.C("spoutOn").set(false);         // no waterfall
    R.C("openB").set("0");             // FLOOR SOLID — else the reservoir drains
    R.C("openR").set("1");             // outlet edge (the tailwater rides on it)
    // ---- geometry ---------------------------------------------------------
    APP.SIM.clearSegs();               // C — drops user segs, keeps scene walls
    // the sandbox's two ledges cross the bore; erase them (kind 0) FIRST,
    // because rasterise() replays scene walls, then user segs in order.
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    // invert: centreline y = 1.0, thickness 2.0 → spans 0 … 2.0. Solid all the
    // way to the domain floor: a thin slab leaves a void that the reservoir
    // fills through its own open bottom and the pipe gets a parallel path.
    APP.SIM.addSeg(R.X0, R.INV / 2, R.X1, R.INV / 2, R.INV, 255);
    // soffit: bottom face at SOF, 0.30 m thick
    APP.SIM.addSeg(R.X0, R.SOF + 0.15, R.X1, R.SOF + 0.15, 0.30, 255);
    // reservoir wall from the top of the mouth to above the domain
    APP.SIM.addSeg(R.X0, R.SOF, R.X0, 5.20, 0.12, 255);
    // ---- controls ---------------------------------------------------------
    R.C("inflowOn").set(true);         // self-configuring: opens the left edge
    R.C("inFree").set(true);           // head-driven: level pinned, q follows
    R.C("inLevel").set(o.level === undefined ? 3.30 : o.level);
    R.C("twOn").set(true);             // receiving tank — NOT optional, see above
    R.C("twLevel").set(o.tw === undefined ? R.TW : o.tw);
    R.C("cs").set(o.cs === undefined ? 0.40 : o.cs);   // the roughness lever
    if (o.cf !== undefined) R.C("cf").set(o.cf);
    R.C("mode").set("1");              // head field — the HGL is the picture
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();
    R.gauges((o.gauges || [4.0, 8.5])[0], (o.gauges || [4.0, 8.5])[1]);
    return R.check();
  },

  /** Two gauges on the pipe axis. Same push the Gauge tool does. */
  gauges: function (xA, xB) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: xA, y: RIGA.AXIS, hist: [], colour: "#7fd4ff" });
    APP.state.gauges.push({ x: xB, y: RIGA.AXIS, hist: [], colour: "#ffb648" });
    RIGA.XA = xA; RIGA.XB = xB; RIGA.L = +(xB - xA).toFixed(3);
  },

  /** Open cells in the bore at a station — the honest D. Also the full-bore
   *  check every dependent demo should run before believing a head reading. */
  bore: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), j = Math.round(RIGA.AXIS / S.dx),
        a = j, b = j;
    if (S.mask[j * S.nx + i]) return { x: x, cells: 0 };
    while (a > 0 && !S.mask[(a - 1) * S.nx + i]) a--;
    while (b < S.ny - 1 && !S.mask[(b + 1) * S.nx + i]) b++;
    return { x: x, cells: b - a + 1, D: +((b - a + 1) * S.dx).toFixed(4),
             invert: +(a * S.dx).toFixed(4), soffit: +((b + 1) * S.dx).toFixed(4) };
  },

  check: function () {
    var S = APP.sim, b = RIGA.bore(6.0);
    return { dx: +S.dx.toFixed(5), grid: S.nx + "x" + S.ny, dt: +APP.SIM.dt().toExponential(3),
             D: b.D, boreCells: b.cells, invert: b.invert, soffit: b.soffit,
             level: S.p.inflow.level, tw: S.p.tailwater.level, cs: S.p.cs, cf: S.p.cf,
             c: S.p.c, open: S.p.open.join(","), band: APP.SIM.bands().twB.map(function (v) {
               return +v.toFixed(3); }),
             gauges: [RIGA.XA, RIGA.XB], L: RIGA.L };
  },
};

/* ============================================================================
 * FR-1 · one student run
 * ==========================================================================*/
window.FR1 = {
  /** Personalised reservoir level: last digit of the student number. */
  level: function (d) { return +(3.30 + 0.13 * d).toFixed(3); },

  /** Advance `secs` of simulated time as fast as the GPU will go (no render,
   *  so gauge history is NOT written — that is what record() is for). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);                       // sync point: force the readback
    return +APP.sim.t.toFixed(2);
  },

  /** Run `secs` through the FULL frame so the gauge charts fill, then return
   *  what the student reads: the centre of each trace, and the bore-mean V.
   *  NOTE gauge.hist is appended by tickFrame — APP.tick / SIM.step / the
   *  runner's `pump` advance the solver and record nothing. */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges;
    g[0].hist.length = 0; g[1].hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0, Vs = [], hmin = 9,
        iA = Math.floor(RIGA.XA / S.dx), iB = Math.floor(RIGA.XB / S.dx);
    while (APP.sim.t - t0 < (secs || 12) && n < 60 * (secs || 12) * 4 + 400) {
      APP.frames(1, 1 / 60); n++;
      if (n % 10 === 0) {
        var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true)), v = 0, m = 0;
        for (var i = iA; i <= iB; i++) { v += A.V[i]; m++; if (A.h[i] < hmin) hmin = A.h[i]; }
        Vs.push(v / m);
      }
    }
    APP.state.paused = true; APP.frames(2);
    var mean = function (a) { return a.reduce(function (p, q) { return p + q; }, 0) / a.length; };
    var sd = function (a) { var m = mean(a);
      return Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); }))); };
    var hA = g[0].hist.map(function (r) { return r.head; }),
        hB = g[1].hist.map(function (r) { return r.head; });
    return { t: +S.t.toFixed(2), level: S.p.inflow.level,
             H1: +mean(hA).toFixed(4), H2: +mean(hB).toFixed(4),
             sd1: +sd(hA).toFixed(4), sd2: +sd(hB).toFixed(4),
             hf: +(mean(hA) - mean(hB)).toFixed(4),
             V: +mean(Vs).toFixed(4), sdV: +sd(Vs).toFixed(4),
             boreMin: +hmin.toFixed(4), full: hmin > 0.98 * RIGA.bore(6.0).D };
  },

  /** The whole thing: FR1.student(6) → what digit 6 submits. */
  student: function (d, settle, rec) {
    RIGA.C("inLevel").set(FR1.level(d)); syncPanel();
    FR1.settle(settle === undefined ? 22 : settle);
    var r = FR1.record(rec === undefined ? 12 : rec);
    r.d = d; r.L = RIGA.L; r.D = RIGA.bore(6.0).D;
    r.lambda = +(r.hf * 2 * 9.81 * r.D / (r.L * r.V * r.V)).toFixed(4);
    return r;
  },
};
/* RIGA.build() -> {dx:0.02174, grid:"414x230", D:0.3913, boreCells:18,
                    invert:2, soffit:2.3913, tw:2.5, band:[2,2.391], L:4.5}
   FR1.student(6) -> {level:4.08, H1:2.7988, H2:2.5201, hf:0.2786, V:3.6298,
                      boreMin:0.3913, full:true, lambda:0.0361}              */
