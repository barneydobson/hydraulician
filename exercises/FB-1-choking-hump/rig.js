/* ============================================================================
 * RIG-B · THE CHANNEL — reused verbatim from WE-1's card (exercises/WE-1-sharp-weir/rig.js)
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *     RIGB.build({tw: 1.00, level: 1.00, q: 0.30})   // bare RIG-B: flat bed,
 *                                                     // reservoir, tailwater
 *     FB1.build(6)                                   // one whole FB-1 student setup, digit d=6
 *
 * FB-1's variant of RIG-B: NO plate. The bed runs the FULL domain (canonical
 * RIG-B — CLAUDE.md/WE-1's "ponds to 1.46 m deep" trap) and a REAL tailwater
 * control on the right turns that pond into a level, subcritical pool instead
 * of an uncontrolled one. A hump is then drawn AS A SECOND STROKE stacked on
 * top of the bed slab at mid-reach — see FB1.hump() below.
 *
 *   z=5.0 ┌──────────────────────────────────────────────────────┐
 *         │  air (the two sandbox ledges are ERASED)             │
 *         │                     ▄▄▄▄▄  ← hump, raised in steps    │
 *         │  reservoir pool ~~~▄▄▄▄▄▄▄~~~~~~~~~~~~~~~~~ tailwater │→ level control
 *   z=0.5 ├──────────────────────────────────────────────────────┤  bed top face
 *   z=0.0 └──────────────────────────────────────────────────────┘  solid to floor
 *         0          2.5(gauge)  4.0–5.0 (hump)                9.0
 *
 * Every call below is a documented app entry point — nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = the C key       SIM.undoSeg() = the Z key
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,z,hist:[],colour})   = a click with the Gauge tool
 *   SIM.columns(true) → Float32Array, 4 per column: bed, depth, q, surface
 *
 * MEASURED FACTS THE DEPENDENT DEMOS INHERIT (Medium, 414 × 230, Δx 21.7 mm)
 *   · the bed top face z = 0.50 lands exactly on a cell boundary (23 cells);
 *     0.50 / 0.0217391 = 23.000, so the drawn and rasterised bed agree exactly.
 *     Keep every RIG-B elevation a multiple of Δx and nothing quantises.
 *   · the sandbox's own two ledges (z ≈ 2.0–3.4) must be ERASED — they sit above
 *     the water here, but they catch spray and ruin a screenshot.
 *   · bottom edge must be WALL (the sandbox default drains) and the bed slab must
 *     be solid all the way to z = 0 — a thin slab leaves a sealed void.
 *   · CANONICAL RIG-B PONDS. Bed across the domain + Open right edge + no
 *     tailwater settles to ~1.46 m deep, drowning everything (WE-1 Director
 *     report). FB-1 does NOT avoid this by truncating the bed at a brink (that
 *     was WE-1's fix, wrong here — a hump needs standing water on BOTH sides).
 *     Instead a real tailwater control on the right turns the same pond into a
 *     CONTROLLED level. Bottom edge stays Wall (bed seals the floor).
 *   · the RESERVOIR pins the surface AT its level (CLAUDE.md "soft level
 *     boundaries"). For a tailwater-controlled pool with NO structure between
 *     the two controls (unlike WE-1's weir), the two levels should very nearly
 *     agree — measure, don't assume (see FB1.LEVEL below).
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
    // floor. FB-1 does NOT — the bed runs the whole domain and a tailwater
    // control (not a brink) sets the downstream level.
    var bx1 = o.bedX1 === undefined ? R.X1 : o.bedX1;

    // ---- panel: strip the sandbox back to a plain flume ---------------------
    R.C("spoutOn").set(false);          // no waterfall — the reservoir feeds it
    R.C("openL").set("1");              // reservoir edge (inflowOn also does this)
    R.C("openR").set("1");              // tailwater rides an OPEN edge (CLAUDE.md)
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
    // the control, if this demo has one (FB-1 does not — see FB1.hump instead)
    if (o.plate) {
      var p = o.plate, th = p.th === undefined ? R.PLATE_TH : p.th;
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

  gauge: function (x, z) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: x, z: z === undefined ? RIGB.BED + 0.25 : z,
                            hist: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "d";
    RIGB.XG = x;
  },

  probeSolid: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), top = 0, j;
    for (j = 0; j < S.ny; j++) if (S.mask[j * S.nx + i]) top = j + 1;
    var k = 0; while (k < S.ny && S.mask[k * S.nx + i]) k++;
    return { x: x, i: i, solidTo: +(k * S.dx).toFixed(4),
             topSolid: +(top * S.dx).toFixed(4), sealed: k === top };
  },

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
             q: S.p.inflow.q, level: S.p.inflow.level,
             open: S.p.open.join(","), tw: S.p.tailwater.on, twLevel: S.p.tailwater.level,
             c: S.p.c, cf: S.p.cf, cs: S.p.cs, gauge: RIGB.XG };
  },
};

/* ============================================================================
 * FB-1 · one student run — "the hump that chokes"
 *   E_s1 = E_s2 + Δz;  choking when Δz > E1 − E_c,  E_c = 1.5·d_c
 *
 *   hump: a flat-topped rectangular block, width HUMPW, centred at XHUMP,
 *   drawn as ONE stroke stacked on the bed slab (so ONE Z-undo removes it and
 *   a redraw at a new height is exactly the worksheet's "undo Z, redraw
 *   taller"). The block's bottom face is sunk OVERLAP below the bed top so the
 *   joint cannot leak regardless of rasteriser edge cases (same trick as
 *   WE-1's plate).
 *   gauge: upstream at XG, clear of the hump's own drawdown curve.
 * ==========================================================================*/
window.FB1 = {
  XHUMP: 4.5, HUMPW: 1.0, XG: 2.5, OVERLAP: 0.05,
  humpDz: 0,           // 0 = no hump segment currently on the stack

  /** Personalised discharge: last digit of the student number.
   *  q = 0.15 + 0.05·d  (0.15 – 0.55 m²/s) — MEASURED range, see README §2.
   *  q = 0.10 was tried and dropped: the hump needed to choke it is >0.9 m
   *  (>40 cells) and the crest response is genuinely noisy/slow to settle
   *  there (low-momentum flow over a big obstruction) — a robustness
   *  finding, not a bug; see README §5. */
  q: function (d) { return +(0.15 + 0.05 * d).toFixed(3); },

  /** Reservoir level: PAIRED TO THE TAILWATER, not to q. MEASURED (see
   *  README §2): with a flat, doubly-level-controlled RIG-B and no
   *  structure between the two controls, level = tailwater for every class
   *  q gives a clean, non-rippling fill — the small friction-driven rise
   *  with q (≈2–7 cm) that a truly independent upstream reservoir would
   *  need is instead absorbed by the reservoir's own soft relaxation
   *  sponge, which is exactly why "measure, don't assume" matters here:
   *  the achieved d1 (baseline, no hump) is what the class actually reads
   *  and uses for E1 — see data/simulated-class.csv. */
  LEVEL: {},
  TW: 1.00,             // fixed tailwater level (elevation, m) — see README
  level: function (q) {
    if (FB1.LEVEL[q] !== undefined) return FB1.LEVEL[q];
    return FB1.TW;       // pairing rule: reservoir = tailwater, unadjusted
  },

  /** MEASURED choking-height bias: Δz_c ≈ 1.90 × Δz_pred, tight across the
   *  whole class range (ratio 1.87–1.94, see data/simulated-class.csv and
   *  README §4 for why — the short, flat, doubly-level-controlled reach
   *  stays subcritical/hydraulically-connected end to end for any hump
   *  height, so the tailwater backpropagates through the WHOLE pool well
   *  before the crest itself reaches critical, unlike the textbook's
   *  isolated-uniform-approach assumption). Use this to jump straight near
   *  the true Δz_c instead of bisecting from zero. */
  K_BIAS: 1.90,
  dzTarget: function (q, d1) { return FB1.K_BIAS * FB1.dzPred(q, d1); },

  /** Build (or rebuild) the bare channel + tailwater, no hump yet. Records
   *  sim.segs.length AFTER the base build as the floor for hump()'s undo —
   *  robust to a mid-session rig.js reload, which resets FB1's own JS state
   *  (humpDz/_hasHump) but NOT the live sim.segs stack. Tracking a stale JS
   *  flag instead of the real seg count silently stacked a NEW hump segment
   *  on top of an un-undone old one (union = the taller of the two) after a
   *  reload — caught by checkHump() disagreeing with the requested height;
   *  fixed by keying off sim.segs.length directly, which reload cannot stale. */
  buildBase: function (q, level, tw) {
    var r = RIGB.build({ q: q, level: level, tw: tw, gauge: FB1.XG });
    FB1.baseSegCount = APP.sim.segs.length;
    FB1.humpDz = 0;
    return r;
  },

  /** Draw/redraw the hump at height dz (metres above the bed). dz = 0 removes
   *  it. Always undoes any previous hump stroke(s) first — "undo Z, redraw
   *  taller" as a function call — by popping segs back down to the recorded
   *  base count, NOT by trusting a JS flag (see buildBase's note). */
  hump: function (dz) {
    if (FB1.baseSegCount === undefined) FB1.baseSegCount = APP.sim.segs.length - (FB1._hasHump ? 1 : 0);
    var guard = 0;
    while (APP.sim.segs.length > FB1.baseSegCount && guard++ < 20) APP.SIM.undoSeg();
    FB1.humpDz = dz; FB1._hasHump = false;
    if (dz > 1e-6) {
      var bed = RIGB.BED, hw = FB1.HUMPW / 2, ov = FB1.OVERLAP;
      var y0 = bed - ov, y1 = bed + dz, th = y1 - y0, yc = (y0 + y1) / 2;
      APP.SIM.addSeg(FB1.XHUMP - hw, yc, FB1.XHUMP + hw, yc, th, 255);
      FB1._hasHump = true;
    }
    return FB1.checkHump();
  },

  /** Rasterised hump crest height above the bed, honestly read off sim.mask —
   *  same trick as WE-1's checkPlate. */
  checkHump: function () {
    var S = APP.sim, i = Math.round(FB1.XHUMP / S.dx), top = 0;
    for (var j = 0; j < S.ny; j++) if (S.mask[j * S.nx + i]) top = j + 1; else if (top) break;
    var crest = +(top * S.dx).toFixed(4);
    return { dzRequested: +FB1.humpDz.toFixed(4), crestElev: crest,
             dzRasterised: +(crest - RIGB.BED).toFixed(4),
             cells: +((crest - RIGB.BED) / S.dx).toFixed(2) };
  },

  /** Advance `secs` of simulated time fast (tick only, no render/gauge-hist). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Advance `secs` through the FULL frame loop so the gauge history fills,
   *  and warm OVERLAY.analyse for a crest Froude reading. Returns what a
   *  student/instrumented reading would see. */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges[0];
    g.hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0, A, frMax = [];
    var need = 60 * (secs || 8) * 4 + 400;
    while (APP.sim.t - t0 < (secs || 8) && n < need) {
      APP.frames(1, 1 / 60); n++;
      if (n % 4 === 0) {
        A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        frMax.push(FB1.crestFr(A));
      }
    }
    APP.state.paused = true; APP.frames(2);
    var hArr = g.hist.map(function (r) { return r.d; }).sort(function (p, q) { return p - q; });
    var hMed = hArr[hArr.length >> 1];
    var hMean = hArr.reduce(function (p, q) { return p + q; }, 0) / hArr.length;
    frMax.sort(function (p, q) { return p - q; });
    var frMed = frMax[frMax.length >> 1];
    return { t: +S.t.toFixed(2), n: hArr.length,
             d1: +hMed.toFixed(4), d1Mean: +hMean.toFixed(4),
             d1Min: +hArr[0].toFixed(4), d1Max: +hArr[hArr.length - 1].toFixed(4),
             frCrestMed: +frMed.toFixed(3), frCrestMax: +frMax[frMax.length - 1].toFixed(3) };
  },

  /** Max Froude number anywhere across the hump's flat top (the full ~1 m,
   *  x in [XHUMP-0.48, XHUMP+0.48] — just inside the vertical shoulders).
   *  MEASURED: the critical section on a sharp-edged block sits near the
   *  DOWNSTREAM third of the crest, not the centre — the flow keeps
   *  accelerating across the whole flat top, so a narrow centre-only window
   *  under-reads the true peak. Works with no hump too (flat-bed reading). */
  crestFr: function (A) {
    var S = APP.sim, i0 = Math.round((FB1.XHUMP - 0.48) / S.dx),
        i1 = Math.round((FB1.XHUMP + 0.48) / S.dx), m = 0, iMax = i0;
    for (var i = i0; i <= i1; i++) if (A.Fr[i] > m) { m = A.Fr[i]; iMax = i; }
    FB1._lastFrX = +(iMax * S.dx).toFixed(3);
    return m;
  },

  /** d_c and E1 from a measured baseline (q, d1) — the class's own protocol. */
  dc: function (q) { return Math.pow(q * q / 9.81, 1 / 3); },
  E1: function (q, d1) { return d1 + (q * q) / (2 * 9.81 * d1 * d1); },
  dzPred: function (q, d1) { return FB1.E1(q, d1) - 1.5 * FB1.dc(q); },

  /** One whole digit's worth of the demo, fresh: FB1.student(6) → baseline
   *  E1/d_c/Δz_pred, then jumps the hump straight to the measured K_BIAS
   *  target (skipping the worksheet's own step-by-step climb, which is what
   *  the WORKSHEET protocol is for — this is the fast "measure the class"
   *  path used to build data/simulated-class.csv) and reports the choke
   *  read. baseSecs/humpSecs let a caller shorten settle for exploration. */
  student: function (d, baseSecs, humpSecs) {
    var q = FB1.q(d), lv = FB1.level(FB1.TW);
    APP.loadScene('sandbox', false);
    FB1.buildBase(q, lv, FB1.TW);
    FB1.settle(baseSecs === undefined ? 45 : baseSecs);
    var base = FB1.record(6);
    var dzPred = FB1.dzPred(q, base.d1);
    var dzTarget = FB1.dzTarget(q, base.d1);
    var cells = Math.round(dzTarget / APP.sim.dx);
    var hc = FB1.hump(+(cells * APP.sim.dx).toFixed(4));
    FB1.settle(humpSecs === undefined ? 30 : humpSecs);
    var choked = FB1.record(7);
    return { d: d, q: q, level: lv, tw: FB1.TW,
             d1: base.d1, dc: +FB1.dc(q).toFixed(4), E1: +FB1.E1(q, base.d1).toFixed(4),
             dzPred: +dzPred.toFixed(4), dzc: hc.dzRasterised, dzcCells: hc.cells,
             frCrestMed: choked.frCrestMed, frCrestMax: choked.frCrestMax,
             d1Choked: choked.d1 };
  },
};
/* MEASURED, this machine, Medium (414 × 230, Δx 0.02174 m, Δt 3.494e-4 s):
   q = 0.15 + 0.05·d, reservoir level = tailwater level = 1.00 m (fixed).
   Baseline (no hump) d1 ranges 0.499 (d=0) to 0.532 m (d=8); margin over
   critical (d1/d_c) 3.78 → 1.70, comfortably above the 1.3–1.5·d_c rule
   at every digit. Δz_c ≈ 1.90 × Δz_pred, tight (ratio 1.87–1.94) across
   the whole class — see data/simulated-class.csv and README §4/§5 for the
   full table, the physical reason for the bias, and the d=0 (q=0.10)
   robustness failure that set the range's floor. Example:
   FB1.student(4) -> q=0.35, d1≈0.517, dc=0.232, E1≈0.540, dzPred≈0.193,
                     dzc measured ≈17 cells (0.370 m), crest Fr ≈1.0 there. */
