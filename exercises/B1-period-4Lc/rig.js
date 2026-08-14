/* B1 "T = 4L/c with your own valve" — paste into the dev console.
 *
 *   ?scene=hammer, Resolution: Medium (436 x 218, dx = 0.1376 m).
 *
 * Students do all of this with the mouse (README S3). This file is the
 * lecturer's spot-check: it draws the student's own valve, establishes flow
 * with the scene's own (unmodified) nozzle, slams BOTH valves at once (the
 * scene ships its own valve at x=55 and toggleValve() flips every valve
 * cell in the domain — see README S1 "valve mechanics" for why this is fine
 * to leave alone), records the gauge trace and extracts the period.
 *
 * Documented entry points (see UN-1's rig.js for the pattern this borrows):
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs()  = the C key      SIM.undoSeg() = the Z key
 *   toggleValve()    = the V key      SIM.resetWater() = the R key
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   OVERLAY.analyse(sim, SIM.columns(true)).V[i]  = the "V" line the hover
 *                                                   readout prints
 * Gauge history is filled by tickFrame, i.e. APP.frames(n) -- NOT by
 * APP.tick(n) / SIM.step(n). Spin up with step(), record with frames().
 */
window.B1 = {
  XE: 6.0,             // pipe entrance / reservoir face (UN-1/UN-2 convention)
  XVALVE0: 55.0,        // the scene's OWN valve station (never moved)
  YLO: 2.0, YHI: 5.0, YC: 3.5,     // bore floor / roof / axis
  XG: 9.0,              // fixed gauge station -- 3 m into the pipe, upstream
                         // of every digit's valve (shortest x_d = 12)

  /** draw the student's own valve at x metres. Same butt-end convention as
   *  the scene's own valve ([55,2.0,55,5.0,0.5]) so the seal is identical. */
  drawValve: function (x, th) {
    return APP.SIM.addSeg(x, B1.YLO, x, B1.YHI, th || 0.5, 128);
  },

  /** erase the scene's own valve at x=55 (option A -- see README S1). */
  eraseSceneValve: function () {
    return APP.SIM.addSeg(B1.XVALVE0, B1.YLO - 0.05, B1.XVALVE0, B1.YHI + 0.05, 0.60, 0);
  },

  gauge: function (x) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: x, y: B1.YC, hist: [], colour: "#7fd4ff" });
  },

  v0: function (x) {
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    return +A.V[Math.floor(x / APP.sim.dx)].toFixed(4);
  },

  /** advance `s` simulated seconds through the full frame so gauges log. */
  run: function (s, dt) {
    APP.state.paused = false;
    var t0 = APP.sim.t, n = 0, step = dt || 1 / 60;
    var cap = Math.ceil(s / step) + 400;
    while (APP.sim.t - t0 < s && n < cap) { APP.frames(1, step); n++; }
    return +APP.sim.t.toFixed(3);
  },

  /** extract the period from a recorded {t,head} trace: rising mean-crossings,
   *  linearly interpolated, median of consecutive intervals. */
  period: function (hist) {
    var xs = hist.map(function (p) { return p.t; });
    var ys = hist.map(function (p) { return p.head; });
    var mean = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
    var crossings = [];
    for (var i = 1; i < ys.length; i++) {
      if (ys[i - 1] < mean && ys[i] >= mean) {
        var t = xs[i - 1] + (mean - ys[i - 1]) * (xs[i] - xs[i - 1]) / (ys[i] - ys[i - 1]);
        crossings.push(t);
      }
    }
    var periods = [];
    for (var k = 1; k < crossings.length; k++) periods.push(+(crossings[k] - crossings[k - 1]).toFixed(4));
    var sorted = periods.slice().sort(function (a, b) { return a - b; });
    var med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return { nCrossings: crossings.length, periods: periods, median: med, mean: +mean.toFixed(4) };
  },

  /** one whole student run. Fresh scene load each call: deterministic,
   *  contamination-free between digits.
   *  opts: { erase: bool -- option A, remove the scene's own valve first
   *          th: valve thickness (default 0.5, matches the scene's own)
   *          gaugeX: station (default xd-3, i.e. 3 m upstream of the valve --
   *                  see README S1: near-valve reads are clean, near-reservoir
   *                  reads are smeared by the soft sponge boundary)
   *          spinS: spin-up seconds (default 13)
   *          recS: recording seconds after the slam (default 12)
   *          dt: frame sample interval (default 1/60) }
   *  Returns the RAW downsampled trace -- period extraction is done
   *  robustly offline (autocorrelation), not in-browser (see README S1). */
  student: function (xd, opts) {
    opts = opts || {};
    APP.loadScene('hammer', false);
    CONTROLS.find(function (c) { return c.id === 'budget'; }).set('Medium');
    syncPanel();
    if (opts.erase) B1.eraseSceneValve();
    B1.drawValve(xd, opts.th);
    if (APP.sim.p.valveClosed > 0.5) toggleValve();  // fresh load already boots open; be sure
    var spinS = opts.spinS || 13;
    APP.SIM.step(Math.ceil(spinS / APP.SIM.dt()));   // spin-up + settle, flat out (no gauge log needed)
    var gaugeX = opts.gaugeX != null ? opts.gaugeX : (xd - 3);
    var v0 = B1.v0(Math.min(gaugeX, xd - 1));
    B1.gauge(gaugeX);
    B1.run(0.6, opts.dt);                             // a little pre-slam baseline in the trace
    toggleValve();                                    // SLAM -- closes every valve cell at once
    var recS = opts.recS || 12;
    B1.run(recS, opts.dt);
    APP.state.paused = true; APP.frames(2);
    var hist = APP.state.gauges[0].hist.slice();
    return {
      xd: xd, L: +(xd - B1.XE).toFixed(3), v0: v0, c: APP.sim.p.c,
      erase: !!opts.erase, gaugeX: gaugeX,
      T4Lc: +((4 * (xd - B1.XE)) / APP.sim.p.c).toFixed(4),
      t: hist.map(function (p) { return +p.t.toFixed(4); }),
      h: hist.map(function (p) { return +p.head.toFixed(3); })
    };
  },
};
