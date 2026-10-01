/* ============================================================================
 * DA-3 · SLOSHING IN A TANK — the console spot-check
 * ----------------------------------------------------------------------------
 * Paste into the dev console with the slosh-tank scene loaded
 * (http://localhost:8124/?scene=slosh-tank or ?ex=DA-3), then:
 *
 *     DA3.run(4, 1.0)          // B = 4 m, d = 1.0 m, a/d = 0.2 → { T, Tstar, Tth, ... }
 *     DA3.run(2, 0.5, 0.1)     // a third argument sets a/d
 *     DA3.sheet()              // every row the tutorial sheet quotes
 *
 * It does what the student does by hand: set the three Geometry sliders
 * (each one restarts the slosh), place a Depth gauge at x = 0.5 m, run the
 * frame loop so the gauge records exactly what the student's gauge records,
 * and time the crests on its trace. T = (t₄ − t₁)/3, crest to crest.
 *
 * WHY THE GAUGE, NOT THE RAW COLUMN, AND WHY CREST TO CREST. A gauge's d is
 * the overlay's depth: smoothed over ±0.09 m in space and by a 10%-per-frame
 * running mean in time (OVERLAY.analyse). At x = 0.35 m the spatial window
 * reached into the wall's zero-depth columns and read 0.2–0.3 m shallow, so
 * the station sits at 0.5 m, clear of it. The running mean delays every crest
 * by about nine frames (0.15 s at 60 fps): a constant lag, which cancels
 * between crests but would not cancel against the release at t = 0.
 * A crest is a local maximum standing clear above the mean level (a steep
 * slosh wobbles in its troughs too), refined by a parabola through its
 * neighbours.
 *
 * Theory, for the comparison column:
 *     T = 2π / √(g k tanh kd),  k = π/B          (first standing mode)
 *     T = 2B / √(gd)                              (Merian, the shallow limit)
 * ==========================================================================*/
window.DA3 = {
  g: 9.81,
  XG: 0.5,                        // the gauge station, clear of the wall at x = 0.3

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Set B, d and a/d through the Geometry rows, as a student does, with one
   *  Depth gauge at the station, low in the water. */
  set: function (B, d, ad) {
    DA3.C("geom0").set(B); DA3.C("geom1").set(d); DA3.C("geom2").set(ad === undefined ? 0.2 : ad);
    syncPanel();
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: DA3.XG, z: 0.3, hist: [], log: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "d";
    APP.SIM.resetWater();                     // the slider already did; this pins t = 0 here
    APP.clearGaugeHistory();
    APP.state.paused = false;
    return APP.SIM.params().values;
  },

  theory: function (B, d) {
    var k = Math.PI / B;
    return { T: 2 * Math.PI / Math.sqrt(DA3.g * k * Math.tanh(k * d)), Tmerian: 2 * B / Math.sqrt(DA3.g * d) };
  },

  /** Release and run the frame loop (1/60 s of simulated time per frame, as
   *  at real time) for ~4.4 periods, then time the crests on the gauge's own
   *  log. start / step / finish so a headless driver can advance it in chunks
   *  (one CDP evaluate times out at 60 s); run() does all three at once. */
  start: function (B, d, ad) {
    var v = DA3.set(B, d, ad), th = DA3.theory(v.B, v.d);
    DA3.R = { v: v, th: th, tEnd: 4.4 * th.T };
    return DA3.R.tEnd;
  },
  step: function (secs) {
    var R = DA3.R, S = APP.sim, stop = S.t + (secs === undefined ? 1e9 : secs);
    while (S.t < R.tEnd && S.t < stop) APP.frames(1, 1 / 60);
    return S.t >= R.tEnd;
  },
  finish: function () {
    var R = DA3.R, v = R.v, th = R.th, S = APP.sim, peaks = [];
    var ts = APP.state.gauges[0].log.map(function (s) { return [s.t, s.d]; });
    // a crest, not a wobble in a trough: it must stand above the mean level
    // by 10% of the largest swing (trough wobbles always sit below the mean).
    // Both from half a period on: the gauge's running mean is carried over
    // from whatever the tank held before, so its first fraction of a second
    // is a slide from the old depth, not the slosh.
    var late = ts.filter(function (p) { return p[0] > 0.5 * th.T; });
    var m = late.reduce(function (s, p) { return s + p[1]; }, 0) / late.length;
    var top = Math.max.apply(null, late.map(function (p) { return p[1]; })), h = 0.1 * (top - m);
    for (var k = 1; k < ts.length - 1; k++) {
      var a = ts[k - 1][1], b = ts[k][1], c = ts[k + 1][1];
      if (b >= a && b > c && b - m > h && ts[k][0] > 0.5 * th.T) {
        var den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;
        var tp = ts[k][0] + off * (ts[k + 1][0] - ts[k][0]);
        if (!peaks.length || tp - peaks[peaks.length - 1] > 0.5 * th.T) peaks.push(tp);
      }
    }
    // crest to crest over up to three periods; a tank too small to ring that
    // long (too few cells: the grid's own scale effect) uses what it has
    var n = Math.min(4, peaks.length), T = n >= 2 ? (peaks[n - 1] - peaks[0]) / (n - 1) : null;
    return { B: +v.B.toFixed(3), d: v.d, Bd: +(v.B / v.d).toFixed(2), ad: v.ad, crests: peaks.length,
             peaks: peaks.slice(0, 4).map(function (p) { return +p.toFixed(3); }),
             T: T && +T.toFixed(3), Tstar: T && +(T * Math.sqrt(DA3.g / v.d)).toFixed(3),
             Tth: +th.T.toFixed(3), Tstar_th: +(th.T * Math.sqrt(DA3.g / v.d)).toFixed(3),
             Tmerian: +th.Tmerian.toFixed(3), err: T && +(100 * (T / th.T - 1)).toFixed(1),
             dCells: +(v.d / S.dx).toFixed(1), aCells: +(v.ad * v.d / S.dx).toFixed(1) };
  },
  run: function (B, d, ad) { DA3.start(B, d, ad); DA3.step(); return DA3.finish(); },

  /** The tutorial sheet's Question 3 runs, A to E: one per value of B/d. */
  SHEET: [[1, 1.0, 0.2], [2, 1.0, 0.2], [4, 1.0, 0.2], [8, 1.0, 0.2], [8, 0.5, 0.2]],
  sheet: function () {
    var out = DA3.SHEET.map(function (c) { return DA3.run(c[0], c[1], c[2]); });
    console.table(out);
    return out;
  },
};
