/* B2 "The flexible pipe, via the c slider" -- paste into the dev console.
 *
 *   ?scene=hammer, Resolution: Medium (436 x 218, dx = 0.1376 m).
 *
 * Reuses UN-1's own nozzle ladder (same six gaps, same d mod 6 rule) so
 * B2 pairs cleanly with UN-1 in the same slot. For each digit: establish
 * at c=70, slam, read dH70; reopen, reset, retune to c=140, re-establish
 * (same nozzle, no redraw), slam again, read dH140.
 *
 * Documented entry points (see UN-1's rig.js -- this borrows its pattern
 * almost verbatim):
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   toggleValve()    = the V key      SIM.resetWater() = the R key
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   OVERLAY.analyse(sim, SIM.columns(true)).V[i]  = the "V" line the hover
 *                                                   readout prints
 * Gauge history is filled by tickFrame (APP.frames(n)), NOT by
 * APP.tick(n) / SIM.step(n). Spin up with step(), record with frames().
 */
window.B2 = {
  X: 56.5,             // nozzle plate station (the scene's own)
  YC: 3.5,              // pipe axis -- the gap is centred on it
  XG: 30.0,              // mid-pipe gauge -- UN-1's own station, validated clean

  /** open cells at the nozzle (UN-1's quantisation check, unchanged). */
  gapCells: function () {
    var S = APP.sim, i = Math.round(B2.X / S.dx), open = 0;
    for (var j = Math.floor(2.0 / S.dx); j < Math.ceil(5.0 / S.dx); j++) {
      if (!(S.mask[j * S.nx + i])) open++;
    }
    return open;
  },

  /** erase the scene's nozzle plate and redraw it with a `g` metre gap
   *  (identical to UN-1's UN1.nozzle -- same rig, same tolerance). */
  nozzle: function (g) {
    APP.SIM.clearSegs();
    APP.SIM.addSeg(B2.X, 2.05, B2.X, 4.95, 0.60, 0);               // erase
    APP.SIM.addSeg(B2.X, 2.00, B2.X, B2.YC - g / 2, 0.50, 255);    // wall
    APP.SIM.addSeg(B2.X, B2.YC + g / 2, B2.X, 5.00, 0.50, 255);    // wall
    return B2.gapCells();
  },

  gauge: function () {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: B2.XG, y: B2.YC, hist: [], colour: "#7fd4ff" });
  },

  v0: function (x) {
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    return +A.V[Math.floor((x == null ? B2.XG : x) / APP.sim.dx)].toFixed(4);
  },

  run: function (s) {
    APP.state.paused = false;
    var t0 = APP.sim.t, n = 0;
    while (APP.sim.t - t0 < s && n < 60 * s * 4 + 200) { APP.frames(1, 1 / 60); n++; }
    return +APP.sim.t.toFixed(3);
  },

  /** median head over the last `w` seconds of the current gauge history --
   *  more robust than UN-1's single-frame read, at negligible extra cost. */
  medianTail: function (w) {
    var hist = APP.state.gauges[0].hist;
    var tEnd = hist[hist.length - 1].t;
    var vals = hist.filter(function (p) { return p.t >= tEnd - w; })
                   .map(function (p) { return p.head; })
                   .sort(function (a, b) { return a - b; });
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  },

  /** one closure at a given celerity. `freshNozzle` redraws the plate
   *  (leg 1); leg 2 reuses the SAME drawn geometry -- only c changes,
   *  mirroring the worksheet's "R, set c, re-establish" (README S1).
   *
   *  Timing note (found the hard way -- see README S1): the gauge sits at
   *  x=30, 25 m from the valve at x=55, so the front does not even ARRIVE
   *  until ~25/cel seconds after the slam, and the plateau itself is only
   *  ~0.8 s wide at c=70 and scales down with it. UN-1 validated run(0.75)
   *  + an immediate read at c=70; both the wait and the read window are
   *  scaled by 70/cel here so the SAME relative point on the plateau is
   *  read at any celerity. */
  leg: function (gap, cel, freshNozzle) {
    if (freshNozzle) B2.nozzle(gap);
    CONTROLS.find(function (c) { return c.id === 'cel'; }).set(cel);
    syncPanel();
    if (APP.sim.p.valveClosed > 0.5) toggleValve();      // make sure it is open
    APP.SIM.resetWater();                                 // R -- restarts spin-up, uses the NEW c's EOS
    APP.SIM.step(Math.ceil(13 / APP.SIM.dt()));           // 13 s spin-up, flat out
    B2.gauge();
    B2.run(1.6);                                           // steady baseline
    var v0 = B2.v0(), H0 = B2.medianTail(0.6);
    toggleValve();                                         // V -- SLAM
    var scale = 70 / cel;                                   // transit + plateau both scale as 1/cel
    B2.run(0.75 * scale);                                   // clear the front, land mid-plateau
    var H1 = B2.medianTail(0.20 * scale);
    return { c: cel, v0: v0, H0: +H0.toFixed(3), H1: +H1.toFixed(3),
             dH: +(H1 - H0).toFixed(3),
             joukowsky: +(cel * v0 / 9.81).toFixed(3) };
  },

  /** one whole student run: (dH70, dH140) at a fixed nozzle gap. */
  student: function (gap) {
    var cells = B2.nozzle(gap);
    var r70 = B2.leg(gap, 70, false);     // nozzle already drawn just above
    var r140 = B2.leg(gap, 140, false);   // SAME geometry, no redraw -- per README S1
    return {
      gap: gap, cells: cells,
      v0_70: r70.v0, dH70: r70.dH, jouk70: r70.joukowsky,
      v0_140: r140.v0, dH140: r140.dH, jouk140: r140.joukowsky,
      v0_drift_pct: +(100 * (r140.v0 - r70.v0) / r70.v0).toFixed(2),
      ratio: +(r140.dH / r70.dH).toFixed(4)
    };
  },
};
