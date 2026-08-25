/* ============================================================================
 * B10 · LIFT THE CREST UNTIL THE PIPE GIVES UP — extends FR-1's RIG-A card
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *     B10.build({level: 3.95})     // RIG-A base, no crest yet
 *     B10.crest(2.65)              // raise the crest so its SOFFIT sits at z=2.65
 *     B10.check()                  // bore band at 9 stations across the hump
 *     B10.record(6)                // gauges + crown pressure + void scan
 *     B10.climb(5)                 // one whole B10 student run for digit d = 5
 *
 * RIG-A's invert and reservoir wall are unchanged in the flat reaches. Over a
 * short mid-length band both invert AND soffit are raised by the SAME amount
 * (a pipe going over a hill, bore height held constant):
 *
 *   z=5.0 ┌─────┬───────────┬──╱▔▔▔▔▔╲───────────────────────────────────┐
 *         │ res │   air     │ ╱ crest  ╲          air                   │
 *         │     ├═══════════╡  (rises) ╞══════════════════════════════════╡ soffit 2.40 (+rise)
 *         │     │ BORE      │  0.3913 m constant gap, the whole way      │ <- tailwater 2.50
 *         │     │ 0.40 m    ╲__________╱                                 │ invert top 2.00 (+rise)
 *         │     ├══════════════════════════════════════════════════════════╡
 *   z=0.0 └─────┴──────────────────────────────────────────────────────────┘ solid to floor
 *         0    1.5      XC-1.45  XC-0.25  XC+0.25  XC+1.45            9.0
 *                              (ramp)  (crest top)  (ramp)     XC = 5.60
 *              gauge A 3.70 ^                             ^ gauge B 8.00
 *
 * WHY A STAIRCASE, NOT A TRUE DIAGONAL STROKE (the LL/MO capping lesson,
 * applied rather than re-learned the hard way):
 *   MO-2's rig.js found that two THICK segments meeting at an angle do NOT
 *   seal the point they meet at (mask=0 at the bare apex of its deep-V,
 *   verified by mask query) -- a genuinely sloped ramp stroke meeting a flat
 *   crest stroke is exactly that shape, and needs an explicit capping
 *   segment at every one of its 4 kinks (2 for invert, 2 for soffit), re-cut
 *   at every redraw. This rig instead builds each ramp as an N-step
 *   staircase of purely HORIZONTAL sub-segments -- the one join geometry
 *   proven leak-free without any cap, because it's exactly LL-1's step
 *   (two horizontal slabs at different y sharing an x endpoint; each
 *   independently seals the bore over ITS OWN x-range, so the two together
 *   cover every column with no gap). Zero caps, zero angle-dependent gap
 *   risk.
 *   INVERT rise is even simpler: it is ADDITIVE (a block stacked on top of
 *   the already-continuous, already-proven invert slab), which is solid
 *   either side of any seam by construction -- there is no "gap to close"
 *   on the invert side at all, staircase or not.
 *   BUT THE STAIRCASE IS NOT FREE, and an earlier draft of this file claimed
 *   it was ("B10's criterion is a pure elevation comparison, so the corner
 *   shape doesn't change what's being taught"). Measured, that is false: at
 *   0.45 m / 3 steps per ramp, raising the crest 0.20 m throttles q by 24%
 *   and the hump -- not the crest elevation -- becomes what sets the flow.
 *   The corner shape does not change the CRITERION, but it does destroy the
 *   thing the criterion is compared against, because a concentrated loss at
 *   the crest bends the HGL away from the straight line the two gauges
 *   interpolate. Hence WRAMP 1.20 / NSTEP 8 (-3.6%); see the NSTEP note.
 *
 * MEASURED FACTS (Medium, sandbox W=9 H=5, 414x230, dx=0.021739 m):
 *   · base RIG-A reproduced exactly: bore 18 cells = 0.3913 m, twBand
 *     [2, 2.391] -- see FR-1's rig.js for the unraised numbers.
 *   · because invert and soffit are raised by the IDENTICAL rise(x) at every
 *     x (same staircase x-boundaries, same per-substep height), the bore
 *     GAP is algebraically constant (0.40 m nominal) at every station along
 *     the ramp, not just at the crest top -- confirmed by check() below,
 *     which scans 9 stations, not just the crest centre. TWO bugs had to be
 *     killed before that was true, both of which read as "the pipe throttles
 *     as you lift it" rather than as geometry errors:
 *       (1) crest() never ERASED the flat soffit it was replacing, so the
 *           invert climbed under an unmoved soffit: bore 18 -> 13 -> 8 -> 0
 *           cells at the crest as zc went 2.40 -> 2.80. Fixed by the erase
 *           stroke; note it must be added BEFORE both redraws.
 *       (2) staircase boundaries landing exactly on a cell CENTRE are claimed
 *           by both neighbouring steps (stampSeg's px range is inclusive at
 *           both ends), and the union then takes the lower soffit and the
 *           higher invert -- a one-column pinch a whole step deep. xte = 5.25
 *           was exactly 241.5*dx: 18 -> 12 cells at that single column, which
 *           halved q and de-primed the downstream limb. Fixed by snapping
 *           every boundary to a cell EDGE (i*dx).
 *     Both were found by scanning the bore at EVERY column over the hump,
 *     not at a handful of stations -- check()'s 9 stations missed (2).
 *   · datum: z_c in this file is the SOFFIT (crown) elevation at the crest,
 *     not the invert and not the bore axis. README works through why: in a
 *     full pressurised cross-section the transverse pressure gradient is
 *     (locally) hydrostatic, so at a given station the SOFFIT is the lowest-
 *     pressure point in the cross-section -- it is where f first drops
 *     below 1 as the crest is raised. Quoting an invert or axis elevation
 *     would put the "onset" number 0.3913 m / 0.196 m off the quantity that
 *     actually triggers separation.
 *   · ONSET IS READ OFF THE CROWN PRESSURE, NOT OFF f. p/rho = c^2 (f-1)
 *     with c = 70, so a crown sitting at p = 0.03 m of head reads f = 1.0006
 *     -- six ten-thousandths from full, unreadable and unusable as a trigger.
 *     The crown PRESSURE HEAD, though, falls cleanly and monotonically as the
 *     crest is raised (measured, d = 4: 0.266 -> 0.207 -> 0.155 -> 0.111 ->
 *     0.086 -> 0.029 -> 0.017 m over k = 1..19), so the trigger is
 *     p_crown < 0.02 m = one cell of water. The void scan in record() is the
 *     corroborating, student-VISIBLE signal: an air pocket opens at the
 *     downstream toe and marches upstream to the crest as p_crown -> 0
 *     (nVoid 0 -> 5 -> 16 -> 20 over the same ladder).
 *   · q is NOT a usable trigger. It drifts down a few per cent per 0.1 m of
 *     rise from the corner loss and has no knee at onset (measured d = 4:
 *     qSep/q0 = 0.85, but 0.92 two cells earlier and 1.00 at the lowest
 *     head, where separation arrives with NO measurable q change at all).
 * ==========================================================================*/
window.RIGA = window.RIGA || {
  X0: 1.50, X1: 9.30, INV: 2.00, SOF: 2.40, AXIS: 2.20, TW: 2.50,
  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },
};

window.B10 = {
  XC: 5.60,           // crest centre -- mid-length; hump toes 4.15 / 7.05 keep
                      // BOTH gauges inside FR-1's straight zone [3.5, 8.6]
  WTOP: 0.50,          // level crest-top width
  WRAMP: 1.20,         // each ramp's width -- LONG on purpose, see NSTEP
  NSTEP: 8,            // horizontal sub-steps per ramp (the "staircase ramp").
                       // 1.20 m / 8 steps is not cosmetic: MEASURED q loss on
                       // raising the crest 0.20 m is 24.2% at 0.45 m/3 steps,
                       // 13.3% at 1.20 m/3, 6.9% at 1.20 m/4, 3.6% at 1.20 m/8
                       // and 3.0% at 1.20 m/16. The demo's whole claim is that
                       // lifting the pipe costs NOTHING until the crest meets
                       // the HGL, so the corner loss has to be small enough to
                       // leave the HGL where it was (it is: H1 2.783 vs 2.788
                       // flat, H2 2.520 vs 2.543). 8 is where the curve flattens.
  BORE: 0.3913,        // RIG-A's own rasterised bore (18 cells at Medium)
  XA: 3.70, YA: 2.20,  // upstream gauge -- just inside the straight zone (x >= 3.5)
  XB: 8.00, YB: 2.20,  // downstream gauge -- straight zone, clear of the crest and the tailwater sponge
  TW: 2.50,            // RIG-A's own tailwater (must stay in (2.40,2.69))

  /** Personalised driving head: FR-1's own level rule, last digit of the
   *  student number. Identical formula, same reasons (FR-1 README S2). */
  level: function (d) { return +(3.30 + 0.13 * d).toFixed(3); },

  /** Build bare RIG-A (no crest). o = {level, tw, cs}. */
  build: function (o) {
    o = o || {};
    var R = RIGA, B = B10;
    R.C("spoutOn").set(false);
    R.C("openB").set("0");             // FLOOR SOLID
    R.C("openR").set("1");             // outlet edge -- tailwater rides on it
    APP.SIM.clearSegs();
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);   // erase sandbox's own ledges
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    APP.SIM.addSeg(R.X0, R.INV / 2, R.X1, R.INV / 2, R.INV, 255);      // invert, full length
    APP.SIM.addSeg(R.X0, R.SOF + 0.15, R.X1, R.SOF + 0.15, 0.30, 255); // soffit, full length (flat)
    APP.SIM.addSeg(R.X0, R.SOF, R.X0, 5.20, 0.12, 255);                // reservoir wall
    R.C("inflowOn").set(true);
    R.C("inFree").set(true);
    R.C("inLevel").set(o.level === undefined ? B.level(0) : o.level);
    R.C("twOn").set(true);
    R.C("twLevel").set(o.tw === undefined ? B.TW : o.tw);
    R.C("cs").set(o.cs === undefined ? 0.40 : o.cs);
    R.C("mode").set("1");
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();
    B10.baseSegCount = APP.sim.segs.length;   // key undo off the LIVE count (FB-1's Iteration 1)
    B10.curRise = 0;
    B10.gauges(B.XA, B.YA, B.XB, B.YB);
    return B10.check();
  },

  /** Two gauges, same push the Gauge tool does -- straight-zone stations
   *  either side of the crest, used to interpolate the HGL AT the crest. */
  gauges: function (xA, yA, xB, yB) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: xA, y: yA, hist: [], colour: "#7fd4ff" });
    APP.state.gauges.push({ x: xB, y: yB, hist: [], colour: "#ffb648" });
    B10.XA = xA; B10.YA = yA; B10.XB = xB; B10.YB = yB;
  },

  /** Redraw the crest so its SOFFIT (crown) sits at elevation zc. Undoes
   *  back to the base segment count first (safe against any number of
   *  redraws / rig.js reloads -- FB-1's Iteration 1). rise may be negative
   *  down to 0 (flat pipe again). */
  crest: function (zc) {
    var R = RIGA, B = B10;
    while (APP.sim.segs.length > B10.baseSegCount) APP.SIM.undoSeg();
    var rise = zc - R.SOF;
    B10.curRise = rise; B10.curZc = zc;
    if (rise <= 1e-6) { syncPanel(); return B10.check(); }   // flat -- nothing to draw
    // SNAP every staircase x-boundary to a CELL EDGE. stampSeg (js/sim.js:48)
    // covers a horizontal segment's cells by a strict cell-CENTRE test,
    // px in [x0,x1] INCLUSIVE at both ends -- so a centre landing exactly on a
    // shared boundary is claimed by BOTH neighbouring steps, and the union
    // then takes the LOWER soffit and the HIGHER invert: a one-column pinch
    // of a whole step height. It bit this rig for real (xte = 5.25 is exactly
    // 241.5*dx at Medium: bore 18 -> 12 cells at that one column, enough to
    // throttle q by 2x and de-prime the downstream limb). Cell centres sit at
    // (i+0.5)*dx, so a boundary on i*dx can never tie.
    var dxc = APP.sim.dx, snap = function (x) { return Math.round(x / dxc) * dxc; };
    var xa = snap(B.XC - B.WTOP / 2 - B.WRAMP), xts = snap(B.XC - B.WTOP / 2),
        xte = snap(B.XC + B.WTOP / 2), xe = snap(B.XC + B.WTOP / 2 + B.WRAMP),
        n = B.NSTEP, dxr = 0;
    // ---- ERASE the old flat soffit over the hump band, FIRST. Without this
    // the base full-length soffit stroke survives underneath every raised
    // one: the invert climbs, the soffit does not, and the bore is throttled
    // shut instead of lifted (measured before the fix: 18 -> 13 -> 8 -> 0
    // cells at the crest as zc went 2.40 -> 2.80). rasterise() replays scene
    // walls then user segs IN ORDER, so this erase must precede both redraws;
    // it spans SOF upward only, so the (later, additive) invert blocks are
    // untouched even when they climb past SOF.
    var eh = rise + 0.45;
    APP.SIM.addSeg(xa, R.SOF + eh / 2, xe, R.SOF + eh / 2, eh, 0);
    // Snapped step boundaries: the ramp-up runs xa -> xts in n steps, the
    // ramp-down xte -> xe. Both faces of a given step use the SAME pair, so
    // the bore gap is algebraically constant along the whole hump.
    var up = [], dn = [], k;
    for (k = 0; k <= n; k++) { up.push(snap(xa + k * (xts - xa) / n)); dn.push(snap(xte + k * (xe - xte) / n)); }
    // ---- SOFFIT over the erased band: ramp-up steps, crest top, ramp-down.
    for (k = 0; k < n; k++) {
      var h = R.SOF + rise * (k + 1) / n;
      APP.SIM.addSeg(up[k], h + 0.15, up[k + 1], h + 0.15, 0.30, 255);
    }
    APP.SIM.addSeg(xts, R.SOF + rise + 0.15, xte, R.SOF + rise + 0.15, 0.30, 255);   // crest top
    for (k = 0; k < n; k++) {
      var hb = R.SOF + rise * (n - 1 - k) / n;
      APP.SIM.addSeg(dn[k], hb + 0.15, dn[k + 1], hb + 0.15, 0.30, 255);
    }
    // (the flat wings outside [xa, xe] are the untouched base stroke)
    // ---- INVERT: purely additive blocks stacked on the existing invert --
    // no split needed (see header). Same x-boundaries, same height fractions.
    for (k = 0; k < n; k++) {
      var r3 = rise * (k + 1) / n;
      APP.SIM.addSeg(up[k], R.INV + r3 / 2, up[k + 1], R.INV + r3 / 2, r3 + 0.02, 255);
    }
    APP.SIM.addSeg(xts, R.INV + rise / 2, xte, R.INV + rise / 2, rise + 0.02, 255);
    for (k = 0; k < n; k++) {
      var r4 = rise * (n - 1 - k) / n;
      if (r4 > 1e-6) APP.SIM.addSeg(dn[k], R.INV + r4 / 2, dn[k + 1], R.INV + r4 / 2, r4 + 0.02, 255);
    }
    syncPanel();
    return B10.check();
  },

  /** Bore band at station x (cells + elevations), same convention as
   *  FR-1/LL-1's bore probes -- seeds from the pipe axis and walks out. */
  boreAt: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), a = -1, b = -1, j;
    // The ground is solid from the floor to the local invert, the bore is the
    // FIRST open run above it, then the soffit. So scanning up from j = 0 and
    // taking run #1 finds the bore at any crest height, with no seed guess to
    // get wrong (an axis-height seed lands inside the soffit once the ramp is
    // steep enough, and silently reports cells = 0).
    for (j = 0; j < S.ny; j++) {
      if (!S.mask[j * S.nx + i]) { if (a < 0) a = j; b = j; }
      else if (a >= 0) break;
    }
    if (a < 0) return { x: x, cells: 0 };
    return { x: x, cells: b - a + 1, D: +((b - a + 1) * S.dx).toFixed(4),
             invert: +(a * S.dx).toFixed(4), soffit: +((b + 1) * S.dx).toFixed(4) };
  },

  /** Sealed-duct check: bore band at 9 stations spanning the whole hump
   *  (both flat wings, both ramps, the top). Every one should read exactly
   *  RIG-A's 18-cell / 0.3913 m gap regardless of rise -- see header. */
  check: function () {
    var S = APP.sim, B = B10;
    var xs = [3.0, B.XC - B.WTOP / 2 - B.WRAMP, B.XC - B.WTOP / 2 - B.WRAMP / 2,
              B.XC - B.WTOP / 2, B.XC, B.XC + B.WTOP / 2,
              B.XC + B.WTOP / 2 + B.WRAMP / 2, B.XC + B.WTOP / 2 + B.WRAMP, 8.5];
    var bores = xs.map(B10.boreAt);
    // sealed = every station open, and no station more than ONE cell off the
    // flat-reach bore (a staircase corner can rasterise 1 cell narrow; the
    // duct is still closed, and B10's criterion is an elevation, not an area).
    var sealed = bores.every(function (b) { return b.cells > 0 && Math.abs(b.cells - bores[0].cells) <= 1; });
    return { dx: +S.dx.toFixed(5), grid: S.nx + "x" + S.ny, dt: +APP.SIM.dt().toExponential(3),
             zc: B10.curZc || RIGA.SOF, rise: +(B10.curRise || 0).toFixed(4),
             zcMeas: bores[4].soffit,   // RASTERISED crest soffit -- the honest z_c
             zinvMeas: bores[4].invert,
             level: S.p.inflow.level, tw: S.p.tailwater.level,
             band: APP.SIM.bands().twB.map(function (v) { return +v.toFixed(3); }),
             sealed: sealed, bores: bores, segs: S.segs.length };
  },

  /** Advance `secs` of simulated time fast -- no render, gauge history NOT
   *  written (matches FR-1/LL-1's settle()). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Run `secs` through the full frame loop: gauges fill, and per-frame we
   *  sample (a) the crest-soffit fill fraction f and (b) delivered q either
   *  side of the crest -- the two INSTRUMENTED separation signals. Returns
   *  medians/means a student's read (gauge chart centre) would agree with. */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges, B = B10;
    g[0].hist.length = 0; g[1].hist.length = 0;
    var iC = Math.round(B.XC / S.dx);
    // Sample f in the cell row DIRECTLY under the rasterised soffit, at three
    // stations across the flat top (the low-pressure point is not necessarily
    // the geometric centre -- FB-1's crest-Froude lesson) and keep the MINIMUM:
    // separation starts wherever the crown first goes sub-atmospheric.
    var zSof = B10.check().zcMeas, yTop = zSof - 0.5 * S.dx;
    var xTop = [B.XC - 0.2, B.XC, B.XC + 0.2];
    var iUp = Math.round(3.00 / S.dx);            // delivered q, flat reach upstream of the hump
    APP.state.paused = false;
    var t0 = S.t, n = 0, fCrest = [], qUp = [], qDn = [], pCrest = [], nVoid = [], xVoid = [];
    var win = secs || 15;
    while (APP.sim.t - t0 < win) {
      APP.frames(1, 1 / 60); n++;
      if (n % 6 === 0) {
        var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        var fm = 9, pm = 9;
        for (var s = 0; s < 3; s++) {
          var pr = APP.probe(xTop[s], yTop);
          if (pr.f < fm) fm = pr.f;
          if (pr.phead < pm) pm = pr.phead;
        }
        fCrest.push(fm); pCrest.push(pm);
        // Crown-VOID scan: walk the cell row directly under the soffit from the
        // crest to the downstream toe and count cells that have actually gone
        // to air (f < 0.5). f is a hopeless onset indicator while the pipe is
        // still pressurised -- p/rho = c^2 (f-1) with c = 70, so a crown at
        // p = 0.03 m of head reads f = 1.0006, six ten-thousandths off full --
        // but a genuine void reads f ~ 0.0-0.1, so the COUNT is a clean switch.
        var nv = 0, xv = 0;
        for (var xx = B.XC; xx <= B.XC + B.WRAMP + 0.4; xx += 2 * S.dx) {
          var bb = B10.boreAt(xx);
          if (bb.cells > 0 && APP.probe(xx, bb.soffit - 0.5 * S.dx).f < 0.5) { nv++; if (!xv) xv = xx; }
        }
        nVoid.push(nv); xVoid.push(xv || NaN);
        qUp.push(A.q[iUp]); qDn.push(A.q[iC]);
      }
    }
    APP.state.paused = true; APP.frames(2);
    var med = function (a) { var b = a.filter(function (v) { return v === v; }).slice().sort(function (p, q) { return p - q; }); return b.length ? b[b.length >> 1] : NaN; };
    var hA = g[0].hist.map(function (r) { return r.h; }), hB = g[1].hist.map(function (r) { return r.h; });
    var H1 = med(hA), H2 = med(hB);
    var Lx = B.XB - B.XA, frac = (B.XC - B.XA) / Lx;
    var Hc_pred = H1 + (H2 - H1) * frac;    // straight-line HGL interpolated to the crest x
    return { t: +S.t.toFixed(2), level: S.p.inflow.level,
             H1: +H1.toFixed(4), H2: +H2.toFixed(4), Hc_pred: +Hc_pred.toFixed(4),
             fCrest: +med(fCrest).toFixed(4), pCrest: +med(pCrest).toFixed(4),
             nVoid: med(nVoid), xVoid: +med(xVoid).toFixed(3),
             qUp: +med(qUp).toFixed(4), qDn: +med(qDn).toFixed(4),
             zc: B.curZc || RIGA.SOF, zcMeas: zSof,
             rise: +(B.curRise || 0).toFixed(4),
             intact: med(fCrest) > 0.995 };
  },

  /** ONE STUDENT'S WHOLE RUN.  B10.climb(4)  ->  that student's z_sep.
   *
   *  Protocol (this IS the worksheet, executed):
   *    1. flat pipe, settle, read the two gauges  -> baseline q0 and the HGL,
   *       which already brackets where separation will happen;
   *    2. jump the crest to 4 cells UNDER that HGL (nothing interesting
   *       happens below it -- the crown pressure there is still 0.08-0.21 m);
   *    3. raise the crest, re-settling 12 s each time, until the crown goes
   *       sub-atmospheric (p_crown < 0.02 m = one cell of water). With
   *       `coarse: 3` the ladder takes 3-cell steps while the crown is still
   *       above 0.06 m and 1-cell steps after that -- the shipped worksheet
   *       protocol, because a pure 1-cell ladder needs up to 34 steps at the
   *       top of the head band. o.coarse = 1 gives the pure 1-cell ladder
   *       that the verification table was measured with.
   *    4. report z_sep = the FIRST separated soffit elevation, and the HGL
   *       from the LAST INTACT step (FB-1's re-timing lesson: the HGL you
   *       compare against must be the one the pipe still had when it was
   *       full -- after separation both gauges are measuring something else).
   */
  climb: function (d, o) {
    o = o || {};
    var S, dx, rows = [], base, kk, r, sep = null, lastIntact = null;
    B10.build({ level: o.level === undefined ? B10.level(d) : o.level });
    B10.crest(RIGA.SOF);
    B10.settle(o.spin === undefined ? 30 : o.spin);
    base = B10.record(o.rec0 === undefined ? 7 : o.rec0);
    S = APP.sim; dx = S.dx;
    var kFlat = Math.round((base.Hc_pred - RIGA.SOF) / dx);   // the flat-pipe HGL, in cells
    // Start FOUR CELLS BELOW the flat-pipe HGL: the pipe is certainly still
    // primed there, and the walk-up has to be genuine (the ladder below is the
    // measurement -- a single cold jump to a height near onset is a DIFFERENT
    // experiment and gives a different number).
    // The other reason this bracket exists: 12 s is the measured re-settle for
    // a 1-cell step, and it matters. At 7-8 s the crown pressure has not
    // finished falling when record() reads it, the p < 0.02 test fires on a
    // transient, and the ladder terminates 1-3 cells early and irreproducibly
    // (d = 0 read 2.565 at 8 s and 2.500 at 12 s; d = 1 read 2.565 both ways).
    // Do not shorten `settle` below 12 without re-measuring.
    var k0 = o.k0 !== undefined ? o.k0 : Math.max(1, kFlat - 4);
    var kMax = o.kMax === undefined ? kFlat + 40 : o.kMax;
    var coarse = o.coarse === undefined ? 1 : o.coarse;   // 1 = pure 1-cell ladder
    for (kk = k0; kk <= kMax; ) {
      B10.crest(RIGA.SOF + kk * dx);
      B10.settle(o.settle === undefined ? 12 : o.settle);
      r = B10.record(o.rec === undefined ? 4 : o.rec);
      r.k = kk; r.qRel = +(r.qUp / base.qUp).toFixed(3);
      r.sep = r.pCrest < 0.02;   // crown pressure head under ONE CELL of water
      rows.push({ k: kk, zc: r.zcMeas, f: r.fCrest, p: r.pCrest, q: r.qUp,
                  qRel: r.qRel, nV: r.nVoid, xV: r.xVoid,
                  H1: r.H1, H2: r.H2, Hc: r.Hc_pred, sep: r.sep });
      if (r.sep) { sep = r; break; }
      lastIntact = r;
      // coarse while the crown still has room, 1 cell once it is close
      kk += (r.pCrest > 0.06) ? coarse : 1;
    }
    return { d: d, level: base.level, q0: base.qUp, HcFlat: base.Hc_pred, kFlat: kFlat,
             zSep: sep ? sep.zcMeas : null,
             HcLast: lastIntact ? lastIntact.Hc_pred : base.Hc_pred,
             H1Last: lastIntact ? lastIntact.H1 : base.H1,
             H2Last: lastIntact ? lastIntact.H2 : base.H2,
             qSep: sep ? sep.qUp : null, fSep: sep ? sep.fCrest : null,
             rows: rows };
  },

  /** Per-height primitive kept for spot checks. */
  student: function (d, level) {
    RIGA.C("inLevel").set(level === undefined ? B10.level(d) : level); syncPanel();
    B10.crest(RIGA.SOF);          // flat first
    B10.settle(25);
    return B10.record(15);
  },
};
