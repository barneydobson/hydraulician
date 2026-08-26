/* ============================================================================
 * LL-1 · BORDA-CARNOT AT A SUDDEN EXPANSION — extends FR-1's RIG-A card
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/  or  ?scene=sandbox), then:
 *
 *     LL1.build()                    // geometry + panel + gauges, default level
 *     LL1.build({level: 3.625})      // digit d = 5
 *     LL1.student(6)                 // one whole LL-1 student run for digit d = 6
 *
 * RIG-A's invert (full length, solid to the floor) and reservoir wall are
 * unchanged. The soffit is split into two strokes that meet at the step:
 *
 *   z=5.0 ┌─────┬──────────────────┬─────────────────────────────────┐
 *         │ res │       air        │              air                 │
 *         │     ├══════════════════╡soffit 2.40-2.70                  │
 *         │     │ BORE 0.40 m      ├───────────────────────────────────┤ soffit 2.80-3.10
 *         │     │ (18 cells)       │   BORE  0.80 m  (37 cells)        │ <- tailwater 2.95
 *         │     ├══════════════════╪═══════════════════════════════════╡ invert top 2.00
 *   z=0.0 └─────┴──────────────────┴───────────────────────────────────┘ solid to floor
 *         0    1.5               3.80                                 9.0
 *                                  ^ the step (STEP, not mid-length: see README §5.2)
 *
 * MEASURED FACTS THIS RIG ADDS ON TOP OF FR-1's RIG-A CARD
 *   · the programme's literal 0.40 -> 1.00 m step both starves the driving
 *     head under RIG-A's reservoir rule AND needs a redevelopment length the
 *     7.5 m pipe does not have room for (measured: head still rising, not
 *     plateaued, 3.9 m past a 0.60 m step). Shipped as 0.40 -> 0.80 m
 *     instead: k_L = (1 - 0.3913/0.8043)^2 = 0.264, not 0.36.
 *   · the tailwater band shifts with the new soffit: it must land in
 *     (2.80, 3.10), not FR-1's (2.40, 2.69). Check SIM.bands().twB after any
 *     geometry edit -- it must read [2, 2.804].
 *   · a downstream pressure gauge near bore-mid (z = 2.40, matching FR-1's
 *     convention for a UNIFORM pipe) reads the still-mixing jet core: the
 *     cross-section is not hydrostatic even 9-11 step-heights past the step
 *     (measured +/-0.28 m swing with height at x = 7.6-8.2). Gauge 2 is
 *     placed near the INVERT (z = 2.10) instead, where the near-wall reading
 *     is close to plateaued. See README section 5.3 -- load-bearing.
 *   · h_L = (V1^2-V2^2)/2g - (H2-H1) is a difference of two O(0.1 m) terms:
 *     noisier than FR-1's single h_f. Read >= 20 s, not ~12 s.
 *   · reservoir range capped at 3.45-3.765 m: below, h_L is a few mm
 *     (unreadable, same failure as FR-1's floor); above ~3.9 m the wide
 *     bore's top corner intermittently de-pressurises even though its
 *     MEDIAN depth stays near 100% full (the recirculation itself pulses).
 * ==========================================================================*/
window.RIGA = window.RIGA || {
  X0: 1.50, X1: 9.30, INV: 2.00,
  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },
};

window.LL1 = {
  XSTEP: 3.80,        // the step -- NOT mid-length (5.25); see README 5.2
  SOF1: 2.40,          // upstream soffit bottom face -> 0.40 m bore
  SOF2: 2.80,          // downstream soffit bottom face -> 0.80 m bore (the step)
  TW: 2.95,            // must sit in (2.80, 3.10) -- the wide bore's column band
  XA: 3.40, YA: 2.20,  // gauge 1: just before the step, narrow-bore mid-height
  XB: 7.60, YB: 2.10,  // gauge 2: past reattachment, NEAR THE INVERT (see header)

  /** Personalised reservoir level: last digit of the student number. */
  level: function (d) { return +(3.45 + 0.035 * d).toFixed(3); },

  /** Build the rig. o = {xstep, sof1, sof2, level, tw, cs, gaugeUp:[x,y], gaugeDown:[x,y]} */
  build: function (o) {
    o = o || {};
    var R = RIGA, L = LL1;
    if (o.xstep !== undefined) L.XSTEP = o.xstep;
    if (o.sof1 !== undefined) L.SOF1 = o.sof1;
    if (o.sof2 !== undefined) L.SOF2 = o.sof2;
    if (o.tw !== undefined) L.TW = o.tw;
    // ---- panel: strip the sandbox back to a plain box ---------------------
    R.C("spoutOn").set(false);
    R.C("openB").set("0");             // FLOOR SOLID -- else the reservoir drains
    R.C("openR").set("1");             // outlet edge (the tailwater rides on it)
    // ---- geometry -----------------------------------------------------------
    APP.SIM.clearSegs();               // C -- drops user segs, keeps scene walls
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);   // erase the sandbox's own ledges
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    // invert: FULL LENGTH, solid to the domain floor
    APP.SIM.addSeg(R.X0, R.INV / 2, R.X1, R.INV / 2, R.INV, 255);
    // upstream soffit: X0 -> XSTEP, bottom face SOF1 (the narrow bore)
    APP.SIM.addSeg(R.X0, L.SOF1 + 0.15, L.XSTEP, L.SOF1 + 0.15, 0.30, 255);
    // downstream soffit: XSTEP -> X1, bottom face SOF2 (the wide bore -- the step).
    // The two soffit strokes share the x = XSTEP endpoint; their BUTT ends
    // (CLAUDE.md: wall segments have butt ends, not round caps) form the
    // riser automatically -- no separate wall stroke needed for the step face.
    APP.SIM.addSeg(L.XSTEP, L.SOF2 + 0.15, R.X1, L.SOF2 + 0.15, 0.30, 255);
    // reservoir wall above the mouth
    APP.SIM.addSeg(R.X0, L.SOF1, R.X0, 5.20, 0.12, 255);
    // ---- controls -----------------------------------------------------------
    R.C("inflowOn").set(true);
    R.C("inFree").set(true);
    R.C("inLevel").set(o.level === undefined ? L.level(0) : o.level);
    R.C("twOn").set(true);
    R.C("twLevel").set(L.TW);
    R.C("cs").set(o.cs === undefined ? 0.40 : o.cs);
    R.C("mode").set(o.mode === undefined ? "1" : o.mode);   // 1 head, 4 vorticity
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();
    var gu = o.gaugeUp || [L.XA, L.YA], gd = o.gaugeDown || [L.XB, L.YB];
    L.gauges(gu[0], gu[1], gd[0], gd[1]);
    return L.check();
  },

  /** Two gauges -- same push the Gauge tool does. Second one LOW in the pipe. */
  gauges: function (xA, yA, xB, yB) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: xA, y: yA, hist: [], colour: "#7fd4ff" });
    APP.state.gauges.push({ x: xB, y: yB, hist: [], colour: "#ffb648" });
    LL1.XA = xA; LL1.YA = yA; LL1.XB = xB; LL1.YB = yB;
  },

  /** Bore extent at station x -- seeds just above the invert (works either
   *  side of the step, unlike FR-1's bore() which seeds from one fixed axis). */
  boreAt: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), j0 = Math.round(RIGA.INV / S.dx) + 1,
        a = j0, b = j0;
    if (S.mask[j0 * S.nx + i] >= 64) return { x: x, cells: 0 };
    while (a > 0 && S.mask[(a - 1) * S.nx + i] < 64) a--;
    while (b < S.ny - 1 && S.mask[(b + 1) * S.nx + i] < 64) b++;
    return { x: x, cells: b - a + 1, D: +((b - a + 1) * S.dx).toFixed(4),
             invert: +(a * S.dx).toFixed(4), soffit: +((b + 1) * S.dx).toFixed(4) };
  },

  check: function () {
    var S = APP.sim, up = LL1.boreAt(LL1.XSTEP - 0.5), dn = LL1.boreAt(LL1.XSTEP + 0.5),
        band = APP.SIM.bands().twB;
    return { dx: +S.dx.toFixed(5), grid: S.nx + "x" + S.ny, dt: +APP.SIM.dt().toExponential(3),
             xstep: LL1.XSTEP, up: up, dn: dn,
             level: S.p.inflow.level, tw: S.p.tailwater.level,
             twBand: band.map(function (v) { return +v.toFixed(3); }),
             gauges: [[LL1.XA, LL1.YA], [LL1.XB, LL1.YB]] };
  },

  /** Advance `secs` of simulated time fast (no render -- gauge history is NOT
   *  written, matching FR-1's settle()). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Run `secs` through the full frame loop so gauges fill and OVERLAY.analyse
   *  can be sampled; returns everything a student (and the CSV) needs.
   *  NOTE gauge.hist is appended by tickFrame only -- APP.tick/SIM.step/the
   *  runner's `pump` record nothing (same trap as FR-1). Default 24 s, not
   *  FR-1's 12 s: h_L is a difference of two O(0.1 m) terms and needs the
   *  longer window (README 5.4). */
  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges;
    g[0].hist.length = 0; g[1].hist.length = 0;
    var iUp = Math.round(LL1.XA / S.dx), iDn = Math.round(LL1.XB / S.dx);
    var boreUp = LL1.boreAt(LL1.XA), boreDn = LL1.boreAt(LL1.XB);
    APP.state.paused = false;
    var t0 = S.t, n = 0, Vs1 = [], Vs2 = [], hsDn = [];
    var win = secs || 24;
    while (APP.sim.t - t0 < win) {
      APP.frames(1, 1 / 60); n++;
      if (n % 6 === 0) {
        var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        Vs1.push(A.V[iUp]); Vs2.push(A.V[iDn]); hsDn.push(A.h[iDn]);
      }
    }
    APP.state.paused = true; APP.frames(2);
    var med = function (a) { var b = a.slice().sort(function (p, q) { return p - q; }); return b[b.length >> 1]; };
    var hA = g[0].hist.map(function (r) { return r.h; }), hB = g[1].hist.map(function (r) { return r.h; });
    var V1 = med(Vs1), V2 = med(Vs2), H1 = med(hA), H2 = med(hB);
    var idealRecovery = (V1 * V1 - V2 * V2) / (2 * 9.81);
    var measuredRecovery = H2 - H1;
    var hL = idealRecovery - measuredRecovery;
    var borda = (V1 - V2) * (V1 - V2) / (2 * 9.81);
    return { t: +S.t.toFixed(2), level: S.p.inflow.level, tw: S.p.tailwater.level,
             H1: +H1.toFixed(4), H2: +H2.toFixed(4), V1: +V1.toFixed(4), V2: +V2.toFixed(4),
             idealRecovery: +idealRecovery.toFixed(4), measuredRecovery: +measuredRecovery.toFixed(4),
             hL: +hL.toFixed(4), borda: +borda.toFixed(4),
             kL_meas: +(hL / (V1 * V1 / (2 * 9.81))).toFixed(4),
             kL_geom: +Math.pow(1 - boreUp.D / boreDn.D, 2).toFixed(4),
             b1: boreUp.D, b2: boreDn.D,
             continuityV1b1: +(V1 * boreUp.D).toFixed(4), continuityV2b2: +(V2 * boreDn.D).toFixed(4),
             hmedDn: +med(hsDn).toFixed(4),
             fracFullDn: +(hsDn.filter(function (v) { return v > 0.98 * boreDn.D; }).length / hsDn.length).toFixed(3) };
  },

  /** The whole thing: LL1.student(6) -> what digit 6 submits. */
  student: function (d, settle, rec) {
    RIGA.C("inLevel").set(LL1.level(d)); syncPanel();
    LL1.settle(settle === undefined ? 20 : settle);
    var r = LL1.record(rec === undefined ? 24 : rec);
    r.d = d;
    return r;
  },
};
/* LL1.build() -> {dx:0.02174, grid:"414x230", xstep:3.8, up:{D:0.3913,cells:18},
                   dn:{D:0.8043,cells:37}, tw:2.95, twBand:[2,2.804],
                   gauges:[[3.4,2.2],[7.6,2.1]]}
   LL1.student(5) from a COLD start (verified by pasting this exact file and
   running it fresh, not carried over from a long warm-up) ->
   {level:3.625, H1:2.8386, H2:3.0222, V1:2.7006, V2:1.3363, hL:0.0971,
    borda:0.0949, kL_meas:0.2612, kL_geom:0.2637, fracFullDn:0.874}
   against the README's verification-table row for d = 5 (H1 2.8332, H2
   3.0213, V1 2.6933, V2 1.3222, hL 0.0925, borda 0.0958) -- 3-5% on hL
   (expected, see README 5.4: h_L is noise-sensitive), <1% on H1/H2/V1/V2. */
