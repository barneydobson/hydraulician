/* ============================================================================
 * RIG-B · THE CHANNEL  — the reusable rig card (WE-1, and for MO-1 / FB-1 / DA-1)
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *     RIGB.build()                       // bare RIG-B: flat bed, reservoir, no control
 *     RIGB.build({plate: {x: 6.5, P: 0.50}, q: 0.35, level: 1.40})   // WE-1
 *     WE1.student(6)                     // one whole WE-1 student run, digit d = 6
 *
 * RIG-B is the sandbox stripped to a rectangular flume:
 *
 *   z=5.0 ┌──────────────────────────────────────────────────────┐
 *         │  air (the two sandbox ledges are ERASED)             │
 *         │                                 ┃ plate crest 1.00   │  (WE-1 only)
 *         │  reservoir pool  ~~~~~~~~~~~~~~~┃ ← nappe            │→ open right edge
 *   z=0.5 ├─────────────────────────────────┸────────────────────┤  bed top face
 *   z=0.0 └──────────────────────────────────────────────────────┘  solid to floor
 *         0                              6.5                    9.0
 *
 * Every call below is a documented app entry point — nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = the C key       SIM.undoSeg() = the Z key
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   SIM.columns(true) → Float32Array, 4 per column: bed, depth, q, surface
 *
 * MEASURED FACTS THE DEPENDENT DEMOS INHERIT (Medium, 414 × 230, Δx 21.7 mm)
 *   · the bed top face z = 0.50 lands exactly on a cell boundary (23 cells);
 *     0.50 / 0.0217391 = 23.000, so the drawn and rasterised bed agree exactly.
 *     Keep every RIG-B elevation a multiple of Δx and nothing quantises.
 *   · the sandbox's own two ledges (z ≈ 2.0–3.4) must be ERASED — they sit above
 *     the water here, but they catch spray and ruin a screenshot. Two fat erase
 *     strokes; RIGB.build does it.
 *   · bottom edge must be WALL (the sandbox default drains) and the bed slab must
 *     be solid all the way to z = 0 — a thin slab leaves a sealed void.
 *   · right edge OPEN (= 1, zero-gradient) is correct here because everything
 *     leaving RIG-B past a weir/gate is a thin supercritical sheet. Do NOT use
 *     outfall (= 2) — CLAUDE.md's rule, and measured: it drags the last columns
 *     dry and reverses.  With a control in the middle of the domain the exit
 *     sheet is supercritical at every q tested (0.10–0.55), depth 0.05–0.13 m,
 *     and the downstream water NEVER reaches the crest (see WE-1 §5).
 *   · a drawn plate 0.05 m thick = 2–3 cells and is SEALED (verified by scanning
 *     sim.mask). 0.03 m (1.4 cells) also sealed at Medium but is one cell in
 *     places; 0.05 is the honest minimum for a hand-drawn plate.
 *   · the RESERVOIR pins the surface AT its level (CLAUDE.md "soft level
 *     boundaries"), so with a control in the domain the level must be set to
 *     what the control's backwater wants. For WE-1 that is a measured q→level
 *     table; see WE1.LEVEL and the README.
 * ==========================================================================*/
window.RIGB = {
  BED: 0.50,          // top face of the bed slab (a multiple of Δx at Medium)
  X0: -0.30,          // slabs run PAST both domain edges — extrapolate, never
  X1: 9.30,           // clamp, or the end columns are left open (CLAUDE.md)
  PLATE_TH: 0.05,     // drawn plate thickness: 2–3 cells at Medium, sealed

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Build the rig.
   *  o = { bedTop, plate:{x,P,th}, q, level, tw, gauge, cf, cs, mode }
   *  All optional. plate omitted → bare RIG-B (flat flume, no control), which
   *  is what MO-1 / FB-1 / DA-1 should start from before drawing their own. */
  build: function (o) {
    o = o || {};
    var R = RIGB, bed = o.bedTop === undefined ? R.BED : o.bedTop;
    R.BED = bed;
    // How far the bed runs. Default: past the right edge (canonical RIG-B).
    // WE-1 ENDS THE BED at the weir plate so the nappe falls to the draining
    // floor — see the "ponds" note below, this is not optional there.
    var bx1 = o.bedX1 === undefined ? R.X1 : o.bedX1;

    // ---- panel: strip the sandbox back to a plain flume ---------------------
    R.C("spoutOn").set(false);          // no waterfall — the reservoir feeds it
    R.C("openL").set("1");              // reservoir edge (inflowOn also does this)
    R.C("openR").set("1");              // zero-gradient outlet: supercritical exit
    // Bottom edge: WALL under a full-length bed (the slab seals it anyway), but
    // OPEN (= 1, drains at the free-fall rate) whenever the bed is truncated and
    // something has to fall to the floor.
    R.C("openB").set(o.openB !== undefined ? String(o.openB) : (bx1 < R.X1 ? "1" : "0"));
    R.C("openT").set("0");
    R.C("waveOn").set(false);

    // ---- geometry -----------------------------------------------------------
    APP.SIM.clearSegs();                // C — drops user segs, keeps scene walls
    // erase the sandbox's two ledges first (rasterise replays scene walls, then
    // user segs in order, so an erase stroke placed first still lands on them)
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    // bed slab: centreline bed/2, thickness bed → spans z = 0 … bed. Solid to
    // the domain floor, and run past the left edge so no end column is left open.
    APP.SIM.addSeg(R.X0, bed / 2, bx1, bed / 2, bed, 255);
    // the control, if this demo has one
    if (o.plate) {
      var p = o.plate, th = p.th === undefined ? R.PLATE_TH : p.th;
      // start the plate INSIDE the bed slab so the joint cannot leak, and butt
      // the top end exactly at the crest elevation (butt ends, not round caps)
      APP.SIM.addSeg(p.x, bed - 0.10, p.x, bed + p.P, th, 255);
      R.plate = { x: p.x, P: p.P, th: th, crest: bed + p.P };
    } else { R.plate = null; }

    // ---- controls -----------------------------------------------------------
    R.C("inflowOn").set(true);          // self-configuring: opens the left edge
    R.C("inFree").set(false);           // q-driven (NOT head-driven): we set q
    if (o.q !== undefined) R.C("inQ").set(o.q);
    if (o.level !== undefined) R.C("inLevel").set(o.level);
    R.C("twOn").set(o.tw !== undefined);
    if (o.tw !== undefined) R.C("twLevel").set(o.tw);
    if (o.cf !== undefined) R.C("cf").set(o.cf);
    if (o.cs !== undefined) R.C("cs").set(o.cs);
    R.C("mode").set(o.mode === undefined ? "0" : String(o.mode));  // 0 = water
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();
    if (o.gauge !== undefined) R.gauge(o.gauge);
    return R.check();
  },

  /** One gauge in the approach pool — the same push the Gauge tool does.
   *  y is only the marker height; the card's "d" is the COLUMN depth at x. */
  gauge: function (x, y) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: x, y: y === undefined ? RIGB.BED + 0.25 : y,
                            hist: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "d";     // the card then prints "d 0.734 m"
    RIGB.XG = x;
  },

  /** Rasterised bed top / crest at a station — the HONEST elevations. Scans
   *  sim.mask upward from the floor, exactly as the solver sees it. */
  probeSolid: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), top = 0, j;
    for (j = 0; j < S.ny; j++) if (S.mask[j * S.nx + i]) top = j + 1;
    // first open cell above the floor stack (a plate is a solid stack too)
    var k = 0; while (k < S.ny && S.mask[k * S.nx + i]) k++;
    return { x: x, i: i, solidTo: +(k * S.dx).toFixed(4),
             topSolid: +(top * S.dx).toFixed(4), sealed: k === top };
  },

  /** Is the plate watertight? Every cell from the bed up to the crest, in the
   *  plate's own column, must be solid. Returns the rasterised crest too. */
  checkPlate: function () {
    if (!RIGB.plate) return { plate: false };
    var S = APP.sim, p = RIGB.plate, i = Math.round(p.x / S.dx),
        j0 = Math.round(RIGB.BED / S.dx), j = j0, holes = 0, top = j0;
    for (; j < S.ny; j++) {
      if (S.mask[j * S.nx + i]) top = j + 1; else break;
    }
    for (var k = 0; k < top; k++) if (!S.mask[k * S.nx + i]) holes++;
    return { plate: true, x: p.x, crestDrawn: +p.crest.toFixed(4),
             crestRasterised: +(top * S.dx).toFixed(4),
             P: +(top * S.dx - RIGB.BED).toFixed(4),
             thicknessCells: RIGB.plateCells(), holes: holes, sealed: holes === 0 };
  },

  plateCells: function () {
    var S = APP.sim, p = RIGB.plate, j = Math.round((RIGB.BED + p.P * 0.5) / S.dx),
        i0 = Math.round(p.x / S.dx), a = i0, b = i0;
    if (!S.mask[j * S.nx + i0]) return 0;
    while (a > 0 && S.mask[j * S.nx + (a - 1)]) a--;
    while (b < S.nx - 1 && S.mask[j * S.nx + (b + 1)]) b++;
    return b - a + 1;
  },

  /** Per-column [bed, depth, q, surface] — the same buffer the display reads. */
  cols: function () {
    var S = APP.sim, c = APP.SIM.columns(true), out = [];
    for (var i = 0; i < S.nx; i++)
      out.push({ x: +(i * S.dx).toFixed(3), bed: c[i * 4], h: c[i * 4 + 1],
                 q: c[i * 4 + 2], surf: c[i * 4 + 3] });
    return out;
  },

  check: function () {
    var S = APP.sim;
    return { grid: S.nx + "x" + S.ny, dx: +S.dx.toFixed(5),
             dt: +APP.SIM.dt().toExponential(3), bed: RIGB.probeSolid(3.0),
             plate: RIGB.checkPlate(), q: S.p.inflow.q, level: S.p.inflow.level,
             open: S.p.open.join(","), c: S.p.c, cf: S.p.cf, cs: S.p.cs,
             gauge: RIGB.XG };
  },
};

/* ============================================================================
 * WE-1 · one student run — sharp-crested weir rating
 *   crest P = 0.50 m above the bed, plate at x = 6.50, gauge at x = 4.50
 *   (2.0 m = 4.4 H upstream at the largest H, clear of the drawdown curve)
 * ==========================================================================*/
window.WE1 = {
  XP: 6.50, P: 0.50, XG: 4.50,

  /** Personalised discharge: last digit of the student number. */
  q: function (d) { return +(0.10 + 0.05 * d).toFixed(3); },

  /** MEASURED reservoir level for each digit — the q→level table in the README.
   *  The reservoir pins the surface AT its level, so this is the level at which
   *  the boundary agrees with the weir's own backwater: set it and the approach
   *  pool is dead flat back to the inlet, with no drawdown and no striations.
   *  The seed formula below (crest + 0.64 q^0.625) was within 8 mm of the
   *  fixed point at all ten digits — one correction pass moved nothing.
   *  It is NOT cosmetic: at q = 0.35 a level 0.10 m low reads C_d 0.647 and
   *  0.10 m high reads 0.483 (measured), against 0.641 at the fixed point. */
  LEVEL: { 0.10: 1.152, 0.15: 1.195, 0.20: 1.233, 0.25: 1.261, 0.30: 1.304,
           0.35: 1.326, 0.40: 1.362, 0.45: 1.389, 0.50: 1.412, 0.55: 1.434 },
  level: function (q) {
    if (WE1.LEVEL[q] !== undefined) return WE1.LEVEL[q];
    return +(1.00 + 0.64 * Math.pow(q, 0.625)).toFixed(3);   // crest + fitted head
  },

  /** Advance `secs` of simulated time as fast as the GPU will go (no render, so
   *  gauge history is NOT written — that is what record() is for). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);                        // sync point: force the readback
    return +APP.sim.t.toFixed(2);
  },

  /** Run `secs` through the FULL frame so the gauge card fills, then return what
   *  the student reads: the median gauge depth, and H = depth − P. */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges[0];
    g.hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0;
    while (APP.sim.t - t0 < (secs || 8) && n < 60 * (secs || 8) * 4 + 400) {
      APP.frames(1, 1 / 60); n++;
    }
    APP.state.paused = true; APP.frames(2);
    var a = g.hist.map(function (r) { return r.d; }).sort(function (p, q) { return p - q; });
    var med = a[a.length >> 1], mean = a.reduce(function (p, q) { return p + q; }, 0) / a.length;
    return { t: +S.t.toFixed(2), n: a.length,
             h: +med.toFixed(4), hMean: +mean.toFixed(4),
             hMin: +a[0].toFixed(4), hMax: +a[a.length - 1].toFixed(4),
             H: +(med - WE1.P).toFixed(4), cells: +((med - WE1.P) / S.dx).toFixed(1) };
  },

  /** The whole thing: WE1.student(6) → what digit 6 submits. */
  student: function (d, settle, rec) {
    var q = WE1.q(d), lv = WE1.level(q);
    APP.loadScene('sandbox', false);          // start from an empty box, as a student does
    RIGB.build({ plate: { x: WE1.XP, P: WE1.P }, bedX1: WE1.XP + 0.025,
                 q: q, level: lv, gauge: WE1.XG });
    WE1.settle(settle === undefined ? 45 : settle);
    var r = WE1.record(rec === undefined ? 8 : rec);
    r.d = d; r.q = q; r.level = lv;
    r.Cd = +(q / (0.6666667 * Math.sqrt(2 * 9.81) * Math.pow(r.H, 1.5))).toFixed(4);
    r.rehbock = +(0.602 + 0.083 * r.H / WE1.P).toFixed(4);
    return r;
  },
};
/* MEASURED, this machine, Medium:
   RIGB.build({plate:{x:6.5,P:0.5}, bedX1:6.525, q:0.35, level:1.326, gauge:4.5})
     -> {grid:"414x230", dx:0.02174, dt:3.494e-4,
         plate:{crestDrawn:1, crestRasterised:1, P:0.5, thicknessCells:2,
                holes:0, sealed:true}, open:"1,1,1,0"}
   WE1.student(5) -> {q:0.35, level:1.326, h:0.8245, H:0.3245, cells:14.9,
                      Cd:0.641, rehbock:0.656}                                */
