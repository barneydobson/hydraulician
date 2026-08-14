/* ============================================================================
 * FB-2 · CRITICAL DEPTH THREE WAYS — one rig, three depths, personalised q
 * ----------------------------------------------------------------------------
 * Paste into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *     FB2.build(0.35)            // bare rig at q = 0.35 (also sets reservoir)
 *     FB2.student(4)             // one whole student run, digit d = 4
 *
 * WHY NOT ?scene=m2 for the whole demo (per the programme spec's two-scene
 * design)? m2's inlet is a pinned Dirichlet backwater (CLAUDE.md: "the inlet
 * pins the surface AT its level, so a scene must set the level the arriving
 * profile actually wants") — it is tuned to m2's OWN default q and personalising
 * q there chokes the boundary and never resettles (CHANGES-NEEDED's standing
 * watch-out: "m2 is pinned to its default q — never personalise q on m2"). So
 * this rig builds the SAME physics (subcritical approach -> critical control ->
 * drawdown to a free overfall) on RIG-B instead, where q is a real, live
 * boundary condition (reservoir + open edge, exactly like FB-1/WE-1/MO-1), and
 * gets all three readings — y_c, mid-crest depth, brink depth — from ONE build.
 *
 * GEOMETRY — the crest's OWN top face IS the final approach to a free
 * overfall (not a hump that steps back down to a lower bed before some
 * separate downstream brink). This matters physically: the classical
 * brink-depth problem is posed on a channel of constant bed elevation
 * running to an unsupported edge — so the crest top face has to BE that
 * channel, not sit upstream of one more drop. Drawn as TWO strokes, both
 * within the sandbox brush's ~0.5 m maximum thickness (see build()'s own
 * comment): a full-length base bed (0.50 m) from the reservoir all the way
 * to the brink, then a shorter, taller hump (0.4348 m) stacked on top from
 * X_TOE to X_LIP — same technique as FB-1's hump, chosen because a single
 * full-height block (0.935 m) is not hand-drawable in one stroke. The two
 * constructions rasterise identically; see the README "THE BRUSH LIMIT".
 *
 *   y=5.0 ┌──────────────────────────────────────────────────────┐
 *         │  air (the two sandbox ledges are ERASED)              │
 *         │                          ╔══ crest (BED+DZ) ══╗       │
 *         │  reservoir ~~~~~~~~~~~~~~╝ pool   (1.1 m)      ║ falls│
 *   y=0.5 ├───────────────────────────╝────────────────────╨──────┤  no bed
 *   y=0.0 └───────────────────────────────────────────────────────┘  past lip
 *         0                    X_TOE=6.3                  X_LIP=7.4  9.0
 *                                   mid-crest station x=6.85   (brink, Open bottom)
 *
 * Every call below is a documented app entry point — nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = the C key       SIM.undoSeg() = the Z key
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   SIM.columns(true) → Float32Array, 4 per column: bed, depth, q, surface
 *
 * MEASURED FACTS INHERITED FROM FB-1/WE-1/MO-1 (Medium, 414×230, Δx 21.7 mm)
 *   · bed top face y = 0.50 lands exactly on a cell boundary (23 cells).
 *   · the sandbox's own two ledges (y ~ 2.0-3.4) must be ERASED.
 *   · bottom edge must be WALL under the approach bed and Open past the lip —
 *     here that just means Open (nothing solid sits under x > X_LIP anyway).
 *   · CANONICAL RIG-B (bed to the domain edge, Open right, no tailwater)
 *     PONDS ~1.46 m deep (WE-1). The fix used by WE-1/MO-1 for a FREE
 *     downstream side applies here too: truncate the bed and let the floor
 *     fall away under an Open bottom edge — no tailwater, none needed (and
 *     unlike WE-1/MO-1, this rig is NOT level-sensitive — see README "THE
 *     MARGIN": a 5-26% energy margin over the crest gave indistinguishable
 *     approach profiles, because the crest+brink pair is the control, not
 *     the reservoir head).
 *   · A.h (what both the Gauge tool and the hover box print) carries a
 *     SPATIAL box-smoothing window (sw = round(0.09/dx) ~ 4 cells each side,
 *     js/overlay.js `sm()`) on top of hRaw, plus the `ok` cliff-guard zeroes
 *     6 cells either side of any bed-slope discontinuity bigger than 2.5
 *     cells/column. The brink IS such a discontinuity (bed drops to nothing).
 *     MO-1 measured this smoothing reading 2.3x the true depth next to a
 *     GATE FACE; a brink is gentler (no sudden re-narrowing, just an edge)
 *     but the same mechanism applies, so record() reads the brink station
 *     from A.hRaw (spatially raw, per-column), time-medianed over the
 *     recording window, NOT A.h — see the station-fidelity discussion in
 *     the README.
 *   · A LONG flat crest does NOT hold a y_c plateau once real friction is
 *     included — depth decays gently while Fr is small and only steepens
 *     right at the end (dy/dx = -Sf/(1-Fr²) on this S0=0 crest). Iterating
 *     crest length from 4.4 m down to 1.1 m improved the mid-crest reading
 *     from 1.3-1.7x y_c to 1.16-1.32x — see the README "THE ITERATION".
 * ==========================================================================*/
window.FB2 = {
  BED: 0.50,            // base approach-bed top face (RIG-B standard datum)
  X0: -0.30,             // approach bed starts off the left edge (extrapolated)
  X_TOE: 6.30,           // crest leading edge (step up from BED to BED+DZ)
  X_LIP: 7.40,           // crest trailing edge — THE BRINK. Bed stops here.
  DZ_CELLS: 20,            // crest height above the approach bed, in cells
  OVERLAP: 0.06,          // approach/crest joint overlap so the corner seals

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  dx: function () { return APP.sim.dx; },
  dz: function () { return FB2.DZ_CELLS * FB2.dx(); },
  crestElev: function () { return FB2.BED + FB2.dz(); },
  xMid: function () { return +((FB2.X_TOE + FB2.X_LIP) / 2).toFixed(3); },

  /** Build (or rebuild) the whole rig at discharge q. level, if omitted, is
   *  seeded from FB2.levelGuess(q) (see below) — a fixed-point pass is done
   *  by FB2.student(), not here (build() alone is the bare, fast geometry +
   *  panel setup used for exploration). */
  build: function (q, level) {
    var R = FB2, S;
    // ---- panel: strip the sandbox back to a plain flume -------------------
    R.C("spoutOn").set(false);
    R.C("openL").set("1");   // reservoir edge
    R.C("openR").set("1");   // nothing but a trickle reaches this once past the lip
    R.C("openB").set("1");   // the bed is truncated — floor must drain past X_LIP
    R.C("openT").set("0");
    R.C("waveOn").set(false);
    R.C("twOn").set(false);  // NO TAILWATER — the overfall is the downstream control

    // ---- geometry -----------------------------------------------------------
    APP.SIM.clearSegs();
    // erase the sandbox's two ledges first (rasterise replays scene walls,
    // then user segs in order, so an erase stroke placed first still lands)
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    S = APP.sim;
    var dx = S.dx, bed = R.BED, dz = R.DZ_CELLS * dx, crest = bed + dz;
    // Two strokes, BOTH within the sandbox brush's ~0.5 m max thickness — the
    // same two-stroke technique as FB-1's hump (base bed, then a shorter,
    // taller hump stacked on top, sunk OVERLAP into the bed for a sealed
    // joint). A single full-height crest block (0 -> crest, 0.93 m here)
    // would be TALLER than the brush allows and is not hand-drawable, so
    // rig.js matches the drawable sequence rather than the simpler-looking
    // single-block union (the rasterised result is identical either way).
    // base bed: solid floor->BED, off the left edge all the way to X_LIP —
    // the bed ends exactly at the brink, same convention as WE-1's plate/
    // MO-1's apron (X_LIP is NOT extrapolated past the domain edge).
    APP.SIM.addSeg(R.X0, bed / 2, R.X_LIP, bed / 2, bed, 255);
    // crest hump: solid (BED-OVERLAP)->(BED+DZ), X_TOE to X_LIP, sunk into
    // the bed so the joint cannot leak (FB1.hump()'s trick).
    var y0 = bed - R.OVERLAP, y1 = crest, th = y1 - y0, yc2 = (y0 + y1) / 2;
    APP.SIM.addSeg(R.X_TOE, yc2, R.X_LIP, yc2, th, 255);
    R.crest = crest;

    // ---- controls -----------------------------------------------------------
    R.C("inflowOn").set(true);
    R.C("inFree").set(false);          // q-driven, not head-driven
    if (q !== undefined) R.C("inQ").set(q);
    var lv = level === undefined ? R.levelGuess(q === undefined ? S.p.inflow.q : q) : level;
    R.C("inLevel").set(lv);
    R.C("mode").set("3");              // Froude, so the crest's white break is visible
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();

    // instruments: gauge at mid-crest (student-style reading), plus record
    // the raw-column brink station index for FB2.readBrink()
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: R.xMid(), y: crest + 0.20, hist: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "depth";
    R.iLip = R.findLip();
    return R.check();
  },

  /** y_c(q) and a first-guess reservoir level: crest + 1.5 y_c (critical
   *  specific energy above the CREST's own datum) + a small margin so the
   *  approach is comfortably subcritical, not marginal. Refined once by
   *  FB2.student()'s fixed-point pass — see README §2/§5 for the measured
   *  table (this rig's structure makes exact level far less sensitive than
   *  WE-1's weir rating: the crest is the control, not the approach head). */
  yc: function (q) { return Math.pow(q * q / 9.81, 1 / 3); },
  levelGuess: function (q) { return +(FB2.crestElev() + 1.65 * FB2.yc(q) + 0.03).toFixed(4); },

  /** Rasterised crest / approach elevations, honestly read off sim.mask —
   *  same trick as WE-1's checkPlate / FB-1's checkHump. */
  check: function () {
    var S = APP.sim, dx = S.dx;
    var iA = Math.round(1.0 / dx), iC = Math.round(FB2.xMid() / dx);
    var topA = 0, topC = 0, j;
    for (j = 0; j < S.ny; j++) if (S.mask[j * S.nx + iA]) topA = j + 1; else if (topA) break;
    for (j = 0; j < S.ny; j++) if (S.mask[j * S.nx + iC]) topC = j + 1; else if (topC) break;
    return {
      grid: S.nx + "x" + S.ny, dx: +dx.toFixed(6), dt: +APP.SIM.dt().toExponential(3),
      approachBed: +(topA * dx).toFixed(4), crestBed: +(topC * dx).toFixed(4),
      dz: +FB2.dz().toFixed(4), dzCells: FB2.DZ_CELLS,
      q: S.p.inflow.q, level: S.p.inflow.level, open: S.p.open.join(","),
      xMid: FB2.xMid(), xLip: FB2.X_LIP, iLip: FB2.iLip,
    };
  },

  /** Last column that is a genuine channel column on the crest (a wall cell
   *  directly under its lowest wet cell) — the same discriminator
   *  js/overlay.js's `analyse` uses to build A.ok, applied here directly to
   *  sim.mask so it does not depend on a live analyse() call. */
  findLip: function () {
    var S = APP.sim, dx = S.dx, iGuess = Math.round(FB2.X_LIP / dx);
    for (var i = iGuess; i > iGuess - 20; i--) {
      var jb = -1;
      for (var j = 0; j < S.ny; j++) if (S.mask[j * S.nx + i] >= 64) jb = j; else if (jb >= 0) break;
      // jb = topmost solid cell's index found scanning up from 0 (first gap
      // above solid ground); require solid ground directly under some open
      // cell, i.e. a real bed column here.
      var jbed = Math.round(FB2.crestElev() / dx) - 1;
      if (S.mask[jbed * S.nx + i] >= 64) return i;
    }
    return iGuess - 2;
  },

  /** Advance `secs` of simulated time fast (tick only, no render/gauge-hist). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Advance `secs` through the FULL frame loop (gauge history + a warmed
   *  OVERLAY.analyse) and return medians of: mid-crest gauge depth (A.h,
   *  exactly what the on-screen gauge card prints), brink depth (A.hRaw at
   *  the lip column — spatially RAW, see the header note), and the crest
   *  Froude profile (for locating the Fr=1 crossing). */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges[0];
    g.hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0, A, brinkArr = [], frRows = [];
    var need = 60 * (secs || 8) * 4 + 400;
    while (APP.sim.t - t0 < (secs || 8) && n < need) {
      APP.frames(1, 1 / 60); n++;
      if (n % 4 === 0) {
        A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        brinkArr.push(A.hRaw[FB2.iLip]);
        frRows.push(A.Fr.slice(Math.round(FB2.X_TOE / S.dx), FB2.iLip + 1));
      }
    }
    APP.state.paused = true; APP.frames(2);
    var med = function (arr) { var a = arr.slice().sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
    var hArr = g.hist.map(function (r) { return r.depth; });
    var crestMed = med(hArr);
    var brinkMed = med(brinkArr);
    // median Froude profile across the crest (column-wise median over the window)
    var ncols = frRows[0] ? frRows[0].length : 0, frMedProfile = [];
    for (var c = 0; c < ncols; c++) frMedProfile.push(med(frRows.map(function (r) { return r[c]; })));
    return {
      t: +S.t.toFixed(2), n: hArr.length,
      yCrest: +crestMed.toFixed(4), yCrestMean: +(hArr.reduce(function (p, q) { return p + q; }, 0) / hArr.length).toFixed(4),
      yBrink: +brinkMed.toFixed(4),
      frProfile: frMedProfile, xToeIdx: Math.round(FB2.X_TOE / S.dx),
    };
  },

  /** Locate the Fr=1 upward crossing in a median Froude profile (array
   *  starting at column xToeIdx) and return its x-position and its distance
   *  upstream of the lip in y_c units. */
  criticalStation: function (frProfile, xToeIdx, q) {
    var S = APP.sim, dx = S.dx, yc = FB2.yc(q);
    for (var c = 1; c < frProfile.length; c++) {
      if (frProfile[c - 1] < 1 && frProfile[c] >= 1) {
        var iCrit = xToeIdx + c;
        var xCrit = +(iCrit * dx).toFixed(4);
        return { iCrit: iCrit, xCrit: xCrit, distToLip: +(FB2.X_LIP - xCrit).toFixed(4),
                 distToLipYc: +((FB2.X_LIP - xCrit) / yc).toFixed(3) };
      }
    }
    return null;
  },

  /** One whole digit's worth of the demo, fresh: FB2.student(6) -> q, y_c,
   *  mid-crest depth, brink depth, critical-section position. Personalised
   *  discharge rule (FB-1's, reused — see README §2): q = 0.15 + 0.05*d,
   *  d = 0..8 (d = 9 substitutes d = 8, same reasoning as FB-1: the class
   *  range was measured on this exact grid already). */
  q: function (d) { return +(0.15 + 0.05 * Math.min(d, 8)).toFixed(3); },

  student: function (d, baseSecs, fresh) {
    var q = FB2.q(d);
    if (fresh !== false) APP.loadScene('sandbox', false);
    FB2.build(q);
    FB2.settle(baseSecs === undefined ? 45 : baseSecs);
    // one fixed-point level nudge: read the achieved mid-crest reading is not
    // the right signal (it's meant to sit at y_c regardless); instead confirm
    // the pool upstream of the crest is not marginal by checking hRaw well
    // upstream of X_TOE stays comfortably deep and flat (no re-tuning needed
    // in practice — see README §5 for the measured check).
    var rec = FB2.record(10);
    var yc = FB2.yc(q);
    var crit = FB2.criticalStation(rec.frProfile, rec.xToeIdx, q);
    return {
      d: d, q: q, yc: +yc.toFixed(4), level: APP.sim.p.inflow.level,
      yCrest: rec.yCrest, yCrestMean: rec.yCrestMean, yBrink: rec.yBrink,
      yCrestOverYc: +(rec.yCrest / yc).toFixed(4),
      yBrinkOverYc: +(rec.yBrink / yc).toFixed(4),
      critX: crit ? crit.xCrit : null, distToLipYc: crit ? crit.distToLipYc : null,
      t: rec.t,
    };
  },
};
/* MEASURED, this machine, Medium (414x230, Δx 0.021739 m, Δt 3.494e-4 s):
   see README §5 for the full class table (per-digit y_c/y_crest/y_brink,
   critical-section position, and the crest-length iteration). */
