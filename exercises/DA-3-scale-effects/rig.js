/* ============================================================================
 * DA-3 · SCALE EFFECTS, LIVE — resolution-sweep harness
 * ----------------------------------------------------------------------------
 * This file adds NOTHING to DA-1's or DA-2's build logic — per the worker
 * brief, their rig.js files are used VERBATIM. All this does is drive the
 * Resolution control around their rigs, exactly the way the "reload your rig
 * at Low vs Ultra" programme line asks a student to, and read back the same
 * numbers the class already trusts (DA1.record/massCheck, DA2.drain/CdBack).
 *
 * Paste order, sandbox loaded (http://localhost:8124/?scene=sandbox):
 *   1. exercises/DA-1-scale-ladder/rig.js   (defines window.DA1)
 *   2. exercises/DA-2-time-scales/rig.js    (defines window.DA2)
 *   3. this file                            (defines window.DA3)
 *
 *   DA3.runDA1(1, "Low")           // DA-1 rig, lambda=1,   fixed q_base, at Low
 *   DA3.runDA1(0.25, "Ultra")      // same rig, lambda=1/4,             at Ultra
 *   DA3.runDA2("High")             // DA-2 orifice, lambda=1/4 (their own
 *                                  //   resolution exhibit),            at High
 *   DA3.ROWS                       // every row run so far, for CSV export
 *
 * WHY THIS IS A GENUINE SINGLE-VARIABLE EXPERIMENT (not a new rig). Both
 * DA1.build() and DA2.build() place geometry with SIM.addSeg() in METRES, off
 * a fixed design constant that does NOT read the live grid (DA1: dx = 9/414,
 * the Medium cell, baked into DA1.geom(); DA2: a brush thickness picked to
 * floor-trim the orifice to N cells AT MEDIUM, DA2.brushForN). Changing
 * Resolution re-rasterises the IDENTICAL stroke list onto a different grid
 * (SIM.build(scene, budget, true) keeps S.segs — js/sim.js) but always calls
 * resetWater(): the drawing survives, the water does not. So "reload at a new
 * resolution" is a real re-fill/re-settle, not a warm continuation — which is
 * also the honest, dramatic part of the live moment: the class watches the
 * SAME drawing refill from empty on a coarser or finer mesh and the reading
 * move on its own.
 *
 * DA2.build() hard-codes `C("budget").set("Medium")` as its own first panel
 * action (unedited here, per the brief), so putting DA-2's orifice on another
 * grid means setting the resolution AFTER DA2.build(), not before — build()
 * would otherwise stomp it straight back to Medium. runDA2() does exactly
 * that: build (forces Medium), THEN reload at the target resolution (same
 * segs, water reset), THEN fill/settle/drain on the reloaded grid.
 * ==========================================================================*/
window.DA3 = {
  ROWS: [],
  RES: ["Low", "Medium", "High", "Very high", "Ultra"],

  // DA-1's own d=2 grid-refinement-twin base q (README §5.3b, reused here so
  // this table is a direct extension of their exhibit, not a new arbitrary
  // choice). q at lambda=1 is q_base itself; at lambda=1/4 it is q_base*0.125.
  QBASE: 0.72,
  // DA-2's own resolution-shift exhibit (README Discussion point 2) — same lambda.
  LAM_DA2: 0.25,

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },
  setRes: function (res) { DA3.C("budget").set(res); syncPanel(); },

  /** DA-1 rig (RIG-B broad-crested weir) at `lam`, base q = qbase (default
   *  DA3.QBASE), built fresh at `res`. No separate APP.loadScene() call:
   *  DA3.setRes() already runs a full SIM.build (new grid, water reset,
   *  t = 0 — js/sim.js), and DA1.build() clears and redraws every segment
   *  itself, so a loadScene first is a second, pointless GPU allocation —
   *  measured to matter: SIM.build()/createDoubleBuffer() never disposes the
   *  PREVIOUS grid's textures/FBOs (js/gl.js), so every extra build spent on
   *  a resolution sweep is pure leak, and enough of them (a 5-resolution x
   *  3-case sweep with a redundant loadScene each time) reliably hit
   *  "Framebuffer incomplete: 0x8cdd" partway through Very high/Ultra on this
   *  machine — see README §5 robustness. Halving the build count per case
   *  (this fix) was enough to clear it here; a still-heavier sweep would not
   *  have headroom, which is itself worth a PROPOSED CHANGE line. */
  runDA1: function (lam, res, qbase) {
    qbase = qbase === undefined ? DA3.QBASE : qbase;
    DA3.setRes(res);
    DA1.build(lam, qbase);
    var settleT = DA1.settleFor(lam);
    DA1.settle(settleT);
    var rec = DA1.record(10);
    var mass = DA1.massCheck();
    var row = {
      rig: "DA1", lam: lam, res: res, grid: APP.sim.nx + "x" + APP.sim.ny,
      dxMm: +(APP.sim.dx * 1000).toFixed(4),
      qbase: qbase, q: DA1.Q, P: DA1.G.P, Pcells: +(DA1.G.P / APP.sim.dx).toFixed(2),
      H: rec.H, Hcells: rec.cells, HP: +(rec.H / DA1.G.P).toFixed(4),
      Cd: +(DA1.Q / (Math.sqrt(9.81) * Math.pow(rec.H, 1.5))).toFixed(4),
      imbalance: mass.imbalance, sealed: DA1.checkBlock().sealed,
      settleT: settleT, t: rec.t,
    };
    DA3.ROWS.push(row);
    return JSON.stringify(row);
  },

  /** DA-2 rig (RIG-C one tank + thin-plate orifice) at lambda = DA3.LAM_DA2
   *  (their own headline resolution exhibit), reloaded at `res`.
   *
   *  ROBUSTNESS FINDING (Low resolution): DA-2's student gauge sits at
   *  gy = 0.05*h0*lambda = 0.025 m for lambda=1/4 — comfortably >1 cell at
   *  Medium (21.7 mm) and High, but 0.025/0.0316 = 0.79 CELLS at Low
   *  (31.6 mm dx). The point probe then samples the floor, not the water,
   *  and DA2.level(0) sticks at exactly the gauge's own y — which also
   *  divides-by-zero inside DA2.drain()'s interpolated crossing (hPrev===h)
   *  and reports tFall as NaN (JSON-null). This is verbatim DA-2 behaviour,
   *  not a bug introduced here — so it is left to fail exactly that way, and
   *  `gaugeOk` below flags it against DA2's own meanLevel() (already shipped
   *  in DA-2's rig.js as its verification cross-check, not a new mechanism)
   *  rather than silently patching over it. */
  runDA2: function (res, lam) {
    lam = lam === undefined ? DA3.LAM_DA2 : lam;
    DA2.build(lam);               // draws at Medium — build()'s own first panel action
                                   // (no separate loadScene: see runDA1's comment — every
                                   // extra SIM.build is an undisposed-texture leak)
    DA3.setRes(res);             // reload at the target grid: same segs, water reset
    DA2.valve(false);
    var P = DA2.P;
    var hStart = P.startFrac * P.h0 * lam, hStop = P.stopFrac * P.h0 * lam;

    // Geometry check BEFORE spending any sim-time: DA2.geom()'s own scan (30
    // rows up from the floor at the plate's column) leaves lo=hi=-1 when NO
    // row survives the floor-trim, but its own pipeCells = hi-lo+1 then reads
    // -1-(-1)+1 = 1 -- a false "1 cell" for what is actually a SEALED plate.
    // Root cause: brushForN[1] = 0.09295 m was picked to floor-trim to
    // exactly 1 cell's worth of rows at MEDIUM's dx (falls in [3dx,5dx) per
    // DA-2's own comment). At Low's coarser dx=31.58mm the SAME metre width
    // is only 2.94 Low-cells -- just under the 3dx a single row needs to
    // survive the trim -- so the orifice rasterises fully shut. This is
    // reported here, not patched (DA-2's rig.js is unedited).
    var g0 = JSON.parse(DA2.geom());
    if (g0.pipeLoRow === -1) {
      var row0 = {
        rig: "DA2", lam: lam, res: res, grid: APP.sim.nx + "x" + APP.sim.ny,
        dxMm: +(g0.dx * 1000).toFixed(4), gapCells: 0, gapMm: 0, W: g0.tankDelivered,
        hStart: null, meanAtFill: null, gaugeOk: null,
        gaugeCells: +(DA2.P.h0 * 0.05 * lam / g0.dx).toFixed(2), hStop: hStop,
        tFall: null, Cd: null, apronMax: null, reachedCap: null,
        via: "BLOCKED — orifice floor-trims to 0 cells at this resolution",
      };
      DA3.ROWS.push(row0);
      return JSON.stringify(row0);
    }

    // maxSec capped: fill()'s own exit test is the point gauge, which (see
    // above) can be stuck under-floor and never satisfy it — an explicit cap
    // stops that costing the full 90 s default on every affected build.
    var f = DA2.fill(hStart, 16);
    var s = DA2.settle(4);
    var meanAtFill = DA2.meanLevel();
    var gaugeOk = meanAtFill != null && Math.abs(f.h - meanAtFill) < 0.15 * hStart;
    var g = JSON.parse(DA2.geom());
    var a = g.pipeCells * g.dx;
    var row = {
      rig: "DA2", lam: lam, res: res, grid: APP.sim.nx + "x" + APP.sim.ny,
      dxMm: +(g.dx * 1000).toFixed(4), gapCells: g.pipeCells, gapMm: +(a * 1000).toFixed(4),
      W: g.tankDelivered, hStart: f.h, meanAtFill: meanAtFill === null ? null : +meanAtFill.toFixed(4),
      gaugeOk: gaugeOk, gaugeCells: +(DA2.P.h0 * 0.05 * lam / g.dx).toFixed(2), hStop: hStop,
    };
    if (gaugeOk) {
      // verbatim DA-2 protocol: point gauge drives both fill-detection and drain timing.
      var d = DA2.drain(hStart, hStop);
      var Cd = d.tFall ? DA2.CdBack(d.tFall, lam, g.tankDelivered, a, f.h, hStop) : null;
      Object.assign(row, { tFall: d.tFall, Cd: Cd === null ? null : +Cd.toFixed(4),
                            apronMax: d.apronMax, reachedCap: d.reachedCap, via: "point-gauge" });
    } else {
      // Point gauge is under-resolved here (verbatim DA-2 behaviour, not patched) —
      // cross-check with DA2.meanLevel(), already shipped in DA-2's own rig.js.
      var dm = DA3.drainMean(hStart, hStop);
      var Cdm = dm.tFall ? DA2.CdBack(dm.tFall, lam, g.tankDelivered, a, meanAtFill || hStart, hStop) : null;
      Object.assign(row, { tFall: dm.tFall, Cd: Cdm === null ? null : +Cdm.toFixed(4),
                            apronMax: null, reachedCap: dm.reachedCap, via: "mean-level-fallback" });
    }
    DA3.ROWS.push(row);
    return JSON.stringify(row);
  },

  /** Fallback drain timer using the spatial mean level (DA2.meanLevel(),
   *  already shipped in DA2's rig.js) instead of the point gauge — for
   *  resolutions where the point gauge itself is under-resolved. Same
   *  interpolated-crossing logic as DA2.drain(), different probe; DA-2's own
   *  file is untouched. */
  drainMean: function (hStart, hStop, maxSec) {
    var dt = APP.SIM.dt(), poll = Math.max(1, Math.round(0.05 / dt));
    DA2.valve(true);
    var t0 = APP.sim.t, hPrev = DA2.meanLevel(), tPrev = APP.sim.t, tStop = null;
    var capSteps = Math.round((maxSec || 90) / 0.05);
    for (var steps = 0; steps < capSteps; steps++) {
      APP.tick(poll);
      var h = DA2.meanLevel(), t = APP.sim.t;
      if (h !== null && h <= hStop) {
        tStop = tPrev + (hPrev - hStop) / (hPrev - h) * (t - tPrev);
        break;
      }
      hPrev = h; tPrev = t;
    }
    return { tFall: tStop == null ? null : +(tStop - t0).toFixed(3), reachedCap: tStop == null };
  },

  /** Run all three cases (DA1 lambda=1, DA1 lambda=1/4, DA2) at one resolution
   *  in a single call — used to keep the resolution sweep to five round trips. */
  runRes: function (res) {
    var a = JSON.parse(DA3.runDA1(1, res));
    var b = JSON.parse(DA3.runDA1(0.25, res));
    var c = JSON.parse(DA3.runDA2(res));
    return JSON.stringify([a, b, c]);
  },

  toCSV: function () {
    var head = "rig,lambda,resolution,grid,dx_mm,q_or_gapcells,H_or_gapmm,Hcells_or_tfall,Cd,imbalance_or_apron";
    var lines = [head];
    DA3.ROWS.forEach(function (r) {
      if (r.rig === "DA1") {
        lines.push([r.rig, r.lam, r.res, r.grid, r.dxMm, r.q, r.H, r.Hcells, r.Cd, r.imbalance].join(","));
      } else {
        lines.push([r.rig, r.lam, r.res, r.grid, r.dxMm, r.gapCells, r.gapMm, r.tFall, r.Cd, r.apronMax].join(","));
      }
    });
    return lines.join("\n");
  },
};
