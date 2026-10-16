/* UP-1 "Pressure travels at the speed of sound" — paste into the dev console.
 *
 *   ?ex=UP-1 (or ?scene=pipeline), Resolution: Medium (563 x 169, dx = 0.107 m).
 *
 * Nothing to draw: the scene's two polygons and its valve ARE the rig. This
 * is the lecturer's spot-check — it places the three gauges the card lists,
 * reads the steady state, slams the valve and prints the arrival times, the
 * head rise and the period, through the same entry points the strip uses:
 *   APP.placeGauge(x, z)              = a click with the Gauge tool
 *   APP.probe(x, z).phead + z         = the gauge's h
 *   toggleValve()                     = the V key
 *   APP.tick(n)                       = n solver substeps, flat out
 *
 *   UP1.demo()        -> settle 20 s, slam, 6 s of record, print the table
 *   UP1.demo(35)      -> the same at c = 35 m/s (set through the Controls row)
 *
 * A headless driver calls the pieces instead (setup, run, slam, record,
 * report), each in chunks short enough for one CDP evaluate. The page's own
 * frame loop is paused while it runs, so sim time advances only through
 * APP.tick and the 5 ms record is uniform.
 */
window.UP1 = {
  XS: [14, 30, 46], Z: 3.0,            // gauge stations on the pipe axis
  XR: 5.0, XV: 51.75,                  // reservoir face, valve's upstream face
  ZI: 2.0,                             // invert; the bore is 2 m

  h: function (x) { return APP.probe(x, UP1.Z).phead + UP1.Z; },
  /** bore-mean u at station x: 19 points across the 2 m bore */
  U: function (x) { var s = 0; for (var k = 0; k < 19; k++) s += APP.probe(x, UP1.ZI + 0.05 + 0.1 * k).u; return s / 19; },
  run: function (T) { var t1 = APP.sim.t + T; while (APP.sim.t < t1) APP.tick(1); return APP.sim.t; },

  setup: function (c) {
    APP.state.paused = true;
    if (c) CONTROLS.find(function (r) { return r.id === "cel"; }).set(c);
    APP.state.gauges.length = 0;
    UP1.XS.forEach(function (x) { APP.placeGauge(x, UP1.Z); });
    return APP.sim.p.c;
  },
  slam: function () {
    UP1.h0 = UP1.XS.map(UP1.h);
    UP1.U0 = (UP1.U(22) + UP1.U(38)) / 2;
    var ax = APP.probe(46, UP1.Z); UP1.v46 = Math.hypot(ax.u, ax.w);
    toggleValve();
    UP1.ts = APP.sim.t; UP1.rec = [];
    return UP1.ts;
  },
  record: function (T) {
    var t1 = APP.sim.t + T;
    while (APP.sim.t < t1) { UP1.run(0.005); UP1.rec.push([APP.sim.t - UP1.ts].concat(UP1.XS.map(UP1.h))); }
    return APP.sim.t - UP1.ts;
  },
  report: function () {
    var c = APP.sim.p.c, g = Math.abs(APP.sim.p.g), L = UP1.XV - UP1.XR;
    var rec = UP1.rec, h0 = UP1.h0, U0 = UP1.U0;
    // arrival: the first sample half-way up the expected rise
    var arr = UP1.XS.map(function (x, k) {
      var r = rec.find(function (s) { return s[k + 1] - h0[k] > 0.5 * c * U0 / g; });
      return r ? r[0] : NaN;
    });
    // the 46 m gauge's first plateau: median over 0.25 … 2L/c − 0.1 s
    var pl = rec.filter(function (s) { return s[0] > 0.25 && s[0] < 2 * L / c - 0.1; })
                .map(function (s) { return s[3] - h0[2]; }).sort(function (a, b) { return a - b; });
    var dH = pl[pl.length >> 1], up = [];
    // period: successive up-crossings of h0 + ΔH/2 at the 46 m gauge
    for (var i = 1; i < rec.length; i++)
      if (rec[i - 1][3] - h0[2] < dH / 2 && rec[i][3] - h0[2] >= dH / 2) up.push(rec[i][0]);
    var f = function (v, n) { return +v.toFixed(n); };
    var out = {
      c: c, v0_bore: f(U0, 3), v0_gauge46: f(UP1.v46, 3), h0_46: f(h0[2], 2),
      arr_46: f(arr[2], 3), arr_30: f(arr[1], 3), arr_14: f(arr[0], 3),
      dt_46_30: f(arr[1] - arr[2], 3), dt_30_14: f(arr[0] - arr[1], 3), spacing_over_c: f(16 / c, 3),
      dH_46: f(dH, 2), cv0g_bore: f(c * U0 / g, 2), cv0g_gauge: f(c * UP1.v46 / g, 2),
      h_min_46: f(Math.min.apply(null, rec.map(function (s) { return s[3]; })), 2),
      period: up.length > 1 ? f(up[1] - up[0], 3) : null, fourL_c: f(4 * L / c, 3),
    };
    return out;
  },

  demo: function (c, settle) {
    UP1.setup(c);
    UP1.run(settle || 20);
    UP1.slam();
    UP1.record(6);
    var out = UP1.report();
    console.table(out);
    APP.state.paused = false;
    return out;
  },
};
