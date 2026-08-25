/* ============================================================================
 * LL-2 · FIND THE THROTTLE — RIG-A + a hidden partial obstruction (a "fault")
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/  or  ?scene=sandbox), then, e.g.:
 *
 *     LL2.build()                       // clean pipe, the shared level, no fault
 *     LL2.plate(6.2, LL2.cellsToBeta(3)) // partner A: draw a 3-cell fault at x=6.2
 *     LL2.setGauges([3.8,5.2,6.6,8.0])   // partner B: first (coarse) walk
 *     LL2.readWindow(20)                 // read the four heads, 20 s window
 *     LL2.locate(20)                     // the whole hunt, scripted end-to-end
 *     LL2.pair({xTrue:6.2, cells:3}, 20) // one full simulated pair, blind + reveal
 *
 * RIG-A is FR-1's card, UNCHANGED (X0, X1, INV, SOF, AXIS, TW, the erase-the-
 * ledges-first geometry, the tailwater band). The only new geometry is the
 * fault: a short VERTICAL wall segment rising from the invert, one grid cell
 * or so wide, to a height that blocks 2 or 3 of the bore's 18 cells:
 *
 *   z = 2.70 ┤            (air above the soffit)
 *   z = 2.40 ┼═══════════════════════●═══════════════════════════ soffit
 *          │           BORE        █  <- partner A's fault (2-3 cells tall,
 *          │       0.3913 m        █     ~1 cell wide, invisible at 0-zoom)
 *   z = 2.00 ┼═══════════════════════█═══════════════════════════ invert
 *          │                    x = x_fault (partner A's choice, 4.6-7.0 m)
 *
 * MEASURED FACTS THIS RIG ADDS ON TOP OF RIG-A (see README §5 for the numbers)
 *   · ONE shared reservoir level for every pair — 3.90 m, the middle of FR-1's
 *     own personalised band (3.30-4.47 m). Personalisation here comes from
 *     partner A's (x, severity) choice, not from a student digit.
 *   · the bore is 18 cells at Medium, so "severity" is really an INTEGER cell
 *     count, not a continuous fraction: 1 cell (5.6%) is INVISIBLE against the
 *     background friction slope, 2-3 cells (11-17%) give a clean, stable kink,
 *     4 cells (22%) intermittently DE-PRESSURISES the pipe downstream (measured
 *     column fill fraction f collapsing to ~0.6-0.7 a bore-height or so past
 *     the plate). The worksheet band is 2-3 cells, not the "30-60% of the
 *     bore" a first guess suggests — see README §5.1.
 *   · gauges tap NEAR THE SOFFIT (z = 2.35, not RIG-A's mid-bore 2.20 or
 *     LL-1's near-invert 2.10). The fault rises FROM the invert, so the
 *     invert side is the disturbed wake and the soffit side is the "far
 *     wall" — LL-1's rule ("tap near a wall, not the centreline, near a
 *     geometry change") generalised: near the wall FARTHEST from the
 *     obstruction, not always the same wall. Verified with a vertical head
 *     profile, README §5.3.
 *   · EVERY gauge in this rig sits at the SAME y (2.35), always. `SIM.probe`'s
 *     "phead" is p/(rho g) only — the PRESSURE head, not the full piezometric
 *     head z + p/(rho g) — confirmed by probing a vertical line in undisturbed
 *     RIG-A flow: z + phead is constant (~const across y) but "phead" alone
 *     falls off steeply with y. Comparing two gauges at *different* heights
 *     therefore folds a (y1 - y2) offset into the reading. Fixing y sidesteps
 *     the question entirely: a same-height difference is exactly the true
 *     head drop, with no assumption about hydrostatic cross-sections needed
 *     at all. See README §5.3 footnote — this is worth the rest of the
 *     RIG-A family checking, LL-1 included.
 *   · the background (no-fault) friction slope near a fault is NOT what a
 *     segment right next to the fault measures — the plate backs water up
 *     on its own approach (a miniature M1), so a slope measured 0.3-1.0 m
 *     upstream of the fault reads ~2x steeper than the clean pipe. Use
 *     FR-1's measured law (or a clean run with no fault at all) for the
 *     "distributed-friction share" correction, never a local segment near
 *     the thing you are trying to measure. README §5.2.
 * ==========================================================================*/
window.RIGA = window.RIGA || {
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
    // invert: centreline z = 1.0, thickness 2.0 → spans 0 … 2.0. Solid all the
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
   *  check every dependent demo should run before believing a head reading.
   *  NOTE (LL-2): this uses Math.round for the column index, which is the
   *  nearest GRID LINE, not the cell that geometrically contains x — off by
   *  up to half a cell. Harmless for a slowly-varying bore height (FR-1,
   *  LL-1), but it can miss a THIN feature entirely if x lands near a
   *  half-cell boundary. LL-2's own openRun() below uses Math.floor instead
   *  for exactly this reason — see README §5 footnote / handoff note. Left
   *  UNCHANGED here because the brief is to carry RIG-A verbatim. */
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
 * LL-2 · the fault, the gauge walk, and the blind-hunt protocol
 * ==========================================================================*/
window.LL2 = {
  LEVEL: 3.90,          // ONE level for every pair (mid FR-1's 3.30-4.47 band)
  Y: 2.35,              // every gauge sits at THIS height, always (see header)
  BORE: 0.3913,         // m, 18 cells at Medium (RIG-A's own bore)
  FAULT_XLO: 4.60, FAULT_XHI: 7.00,     // partner A's allowed x-band
  SCAN_X: [3.80, 5.20, 6.60, 8.00],     // partner B's round-1 (coarse) 4 gauges
  BG_A: 0.007127, BG_M: 2.832,          // FR-1's fitted h_f = BG_A * V^BG_M  (L=4.5 m)

  /** Base pipe, no fault, the shared level. */
  build: function (o) {
    o = o || {};
    return RIGA.build({ level: o.level === undefined ? LL2.LEVEL : o.level, gauges: [4.0, 8.5] });
  },

  /** cells (0..17 open, i.e. 1..18 blocked) -> blockage fraction beta. */
  cellsToBeta: function (cells) { return cells * APP.sim.dx / LL2.BORE; },

  /** Draw the fault: a vertical plate rising from the invert. beta = fraction
   *  of the bore height blocked (0..1); th = plate thickness, m (default
   *  ~1.3 cells -> rasterises to a 1-2 cell sliver, "one cell wide" by eye). */
  plate: function (x, beta, th) {
    var top = RIGA.INV + beta * LL2.BORE;
    th = th === undefined ? 0.028 : th;
    APP.SIM.addSeg(x, RIGA.INV, x, top, th, 255);
    return { x: x, beta: beta, top: +top.toFixed(4), th: th, cells: LL2.openRun(x)[0] ?
             18 - LL2.openRun(x)[0].cells : null };
  },
  clearFault: function () { APP.SIM.undoSeg(); },

  /** Open cells in the bore's column at station x (works ON TOP OF the plate
   *  too, unlike RIGA.bore which seeds from the fixed AXIS). */
  openRun: function (x) {
    var S = APP.sim, i = Math.floor(x / S.dx);
    var j = Math.round(RIGA.INV / S.dx) + 1, runs = [], a = null;
    for (; j < Math.round(RIGA.SOF / S.dx); j++) {
      var solid = S.mask[j * S.nx + i] >= 64;
      if (!solid && a === null) a = j;
      if (solid && a !== null) { runs.push([a, j - 1]); a = null; }
    }
    if (a !== null) runs.push([a, j - 1]);
    return runs.map(function (r) {
      return { lo: +(r[0] * S.dx).toFixed(4), hi: +((r[1] + 1) * S.dx).toFixed(4), cells: r[1] - r[0] + 1 };
    });
  },

  /** Place up to 4 gauges — the exact push/shift the Gauge tool does when a
   *  student clicks (state.gauges.length>=4 -> shift, then push). Passing
   *  the WHOLE set of x's you want visible is the harness equivalent of a
   *  student clicking each one in turn, left to right. */
  setGauges: function (xs, y) {
    y = y === undefined ? LL2.Y : y;
    APP.state.gauges.length = 0;
    var cols = ["#7fd4ff", "#ffb648", "#5fd08a", "#ff8fa3"];
    xs.forEach(function (x, k) { APP.state.gauges.push({ x: x, y: y, hist: [], colour: cols[k] }); });
  },

  /** Fast settle: physics only, no render (matches FR1.settle/LL1.settle). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Read the CURRENT gauges (whatever setGauges last placed) through the
   *  full frame loop so gauge.hist fills exactly like a student watching the
   *  on-screen chart, then return the centred head at each + the bore-mean V
   *  at each gauge's column. NOTE gauge.hist is written by tickFrame only —
   *  APP.tick/SIM.step/the runner's `pump` record nothing (FR-1/LL-1's trap). */
  readWindow: function (secs) {
    var S = APP.sim, g = APP.state.gauges;
    g.forEach(function (gg) { gg.hist.length = 0; });
    APP.state.paused = false;
    var t0 = S.t, win = secs || 20, Vsum = g.map(function () { return 0; }), n = 0;
    var idx = g.map(function (gg) { return Math.floor(gg.x / S.dx); });
    while (APP.sim.t - t0 < win) {
      APP.frames(1, 1 / 60); n++;
      if (n % 10 === 0) {
        var A = OVERLAY.analyse(S, APP.SIM.columns(true));
        idx.forEach(function (ii, k) { Vsum[k] += A.V[ii]; });
      }
    }
    APP.state.paused = true; APP.frames(2);
    var nV = Math.floor(n / 10) || 1;
    function mean(a) { return a.reduce(function (p, q) { return p + q; }, 0) / a.length; }
    function sd(a) { var m = mean(a); return Math.sqrt(mean(a.map(function (v) { return (v - m) * (v - m); }))); }
    return { t: +S.t.toFixed(2),
             x: g.map(function (gg) { return gg.x; }),
             H: g.map(function (gg) { return +mean(gg.hist.map(function (r) { return r.h; })).toFixed(5); }),
             Hsd: g.map(function (gg) { return +sd(gg.hist.map(function (r) { return r.h; })).toFixed(5); }),
             V: Vsum.map(function (v) { return +(v / nV).toFixed(4); }) };
  },

  /** FR-1's measured background law, converted to a friction SLOPE at V
   *  (m per m of pipe) — this is "the distributed-friction share" any kink
   *  reading has to be corrected for. */
  bgSlope: function (V) { return LL2.BG_A * Math.pow(V, LL2.BG_M) / 4.5; },

  /** One bisection round: given 4 gauge x's (already read), find the ONE gap
   *  whose measured drop most exceeds its expected friction share, and
   *  return that bracket plus the corrected k_L if the gap is already
   *  "tight" (<= tightGap). */
  scoreGaps: function (read, tightGap) {
    var best = null;
    for (var k = 0; k < read.x.length - 1; k++) {
      var gap = +(read.x[k + 1] - read.x[k]).toFixed(4);
      var dH = read.H[k] - read.H[k + 1];
      var V = (read.V[k] + read.V[k + 1]) / 2;
      var bg = LL2.bgSlope(V) * gap;
      var excess = dH - bg;
      var row = { lo: read.x[k], hi: read.x[k + 1], gap: gap, dH: +dH.toFixed(5),
                  bg: +bg.toFixed(5), excess: +excess.toFixed(5), V: +V.toFixed(4) };
      if (!best || row.excess > best.excess) best = row;
    }
    best.kL = +(best.excess / (best.V * best.V / (2 * 9.81))).toFixed(4);
    best.tight = best.gap <= (tightGap || 0.65) + 1e-6;
    return best;
  },

  /** The whole blind hunt: coarse scan, then bisect until the bracket is
   *  <= 0.65 m, reading `secs` seconds each round, THEN ONE FINAL SYMMETRIC
   *  read at +-0.3 m about the bracket's own midpoint (exactly LL1's
   *  "walk the gauges in" gesture, done one last time once you have a good
   *  guess) — the trisection rounds narrow the bracket but leave it
   *  off-centre on the true fault about as often as not, and an off-centre
   *  window biases k_L low (the closer tap sits inside the still-recovering
   *  wake). Centring on the best estimate removes that bias; see README
   *  §5.4 — first cut without this step measured a systematic -25% k_L
   *  bias across 6 test pairs, this fixes it to a few percent.
   *  Returns the found x (bracket midpoint), k_L, the round-by-round trail,
   *  and how many rounds/how many sim-seconds it took (the timing budget
   *  check). Does NOT know x_true or beta_true — this is the blind
   *  protocol. */
  locate: function (secs, maxRounds) {
    var trail = [], xs = LL2.SCAN_X.slice(), t0 = APP.sim.t;
    for (var round = 0; round < (maxRounds || 5); round++) {
      LL2.setGauges(xs);
      var read = LL2.readWindow(secs || 20);
      var best = LL2.scoreGaps(read);
      trail.push({ round: round + 1, xs: xs.slice(), best: best });
      if (best.tight) {
        var mid = (best.lo + best.hi) / 2;
        LL2.setGauges([mid - 1.0, mid - 0.3, mid + 0.3, mid + 1.0]);
        var centred = LL2.scoreGaps(LL2.readWindow(secs || 20), 0.65);
        trail.push({ round: round + 2, centring: true, xs: [mid - 1.0, mid - 0.3, mid + 0.3, mid + 1.0], best: centred });
        return { xFound: +mid.toFixed(3), bracket: [best.lo, best.hi],
                 kL: centred.kL, V: centred.V, rounds: round + 2,
                 simSeconds: +(APP.sim.t - t0).toFixed(2), trail: trail };
      }
      var third = (best.hi - best.lo) / 3;
      xs = [best.lo, +(best.lo + third).toFixed(4), +(best.hi - third).toFixed(4), best.hi];
    }
    var last = trail[trail.length - 1].best;
    return { xFound: +((last.lo + last.hi) / 2).toFixed(3), bracket: [last.lo, last.hi],
             kL: last.kL, V: last.V, rounds: trail.length,
             simSeconds: +(APP.sim.t - t0).toFixed(2), trail: trail, gaveUp: true };
  },

  /** Direct calibration of a KNOWN plate: tight gauges +-0.3 m either side,
   *  same correction as locate() uses. This is the "ground truth" k_L a
   *  blind locate() result gets checked against. */
  calibrate: function (xTrue, secs) {
    LL2.setGauges([xTrue - 1.0, xTrue - 0.3, xTrue + 0.3, xTrue + 1.0]);
    var read = LL2.readWindow(secs || 20);
    return LL2.scoreGaps(read, 0.65);
  },

  /** One simulated pair, end to end: partner A hides a fault at (xTrue,
   *  cells); partner B hunts it blind; then the reveal compares. Matches
   *  what a real pair would produce, plus the ground truth a lecturer could
   *  only get by re-running with the answer key. */
  pair: function (xTrue, cells, secs) {
    LL2.build({ level: LL2.LEVEL });
    var beta = LL2.cellsToBeta(cells);
    var plate = LL2.plate(xTrue, beta, 0.028);
    LL2.settle(20);
    var found = LL2.locate(secs || 20);
    var truth = LL2.calibrate(xTrue, secs || 20);
    return {
      xTrue: xTrue, cells: cells, beta: +beta.toFixed(4),
      xFound: found.xFound, kL_found: found.kL, V_found: found.V,
      rounds: found.rounds, simSeconds: found.simSeconds,
      posError: +(found.xFound - xTrue).toFixed(3),
      kL_true: truth.kL, V_true: truth.V,
      kL_pctError: +(100 * (found.kL - truth.kL) / truth.kL).toFixed(1),
      trail: found.trail,
    };
  },
};
/* LL2.build() -> {dx:0.02174, grid:"414x230", D:0.3913, boreCells:18,
                   level:3.9, tw:2.5, band:[2,2.391]}
   LL2.pair(6.20, 3, 20) -> one full blind hunt + reveal for a 3-cell fault at
   x = 6.20; see README section 5 for the measured table across the class. */
