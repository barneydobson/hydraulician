/* ============================================================================
 * B6 · URSELL NUMBER — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await B6.run(0.15)          // one row of the card: the stroke
 *     await B6.sweep()            // every row the card prints
 *
 * It does what the card asks, through the same entry points: picks B6 (the
 * shallow flume at Medium, the period set to 2.0 s, gauges on Depth), sets the
 * stroke, presses R (SIM.resetWater, t = 0), waits out the 42 s settle, places
 * Depth gauges at x = 1.5 and 3.5 m (state.gauges, as the Gauge tool does), and
 * records RECORD seconds sampled once per 1/60 s of simulated time exactly as
 * the frame loop samples them (main.js sampleGauges).
 *
 * Then it reads the traces the way the card says, over exactly six periods:
 *   mean       the average d at x = 3.5 m, the reference level
 *   H          crest minus trough at x = 3.5 m, per period, the middle value
 *   asymmetry  crest above the mean over trough below it, middle values
 *   Δt         from the 1.5 m gauge crossing d = 0.348 m upward to the 3.5 m
 *              gauge doing the same next, median over the crossings
 *   L = T·2.0/Δt,  U_r = H·L²/h³  with h = 0.348 m
 * ==========================================================================*/
window.B6 = {
  SETTLE: 42, RECORD: 13, T: 2.0, XA: 1.5, XB: 3.5, Z: 0.40, H0: 0.348,
  ROWS: [0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25],

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },

  advance: async function (secs, sample) {
    var S = APP.SIM, t1 = APP.sim.t + secs, ly = performance.now();
    var k = Math.max(1, Math.round((1 / 60) / S.dt()));
    while (APP.sim.t < t1) {
      S.step(k);
      if (sample) {
        APP.state.paused = false;                  // sampleGauges records only while running
        sampleGauges(OVERLAY.analyse(APP.sim, S.columns(true)));
        APP.state.paused = true;
      }
      if (performance.now() - ly > 1000) { await B6.yieldNow(); ly = performance.now(); }
    }
  },

  median: function (a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; },

  /** Per-period crest and trough of one gauge's log. */
  periods: function (log, T) {
    var out = [], t0 = log[0].t, t1 = log[log.length - 1].t + T / 30;   // a frame's slack at the end
    for (var p = t0; p + T <= t1; p += T) {
      var seg = log.filter(function (s) { return s.t >= p && s.t < p + T; });
      if (seg.length > 5) out.push({ max: Math.max.apply(null, seg.map(function (s) { return s.d; })),
                                     min: Math.min.apply(null, seg.map(function (s) { return s.d; })) });
    }
    return out;
  },

  upcrossings: function (log, ref) {
    var out = [];
    for (var i = 1; i < log.length; i++) {
      var a = log[i - 1].d - ref, b = log[i].d - ref;
      if (a < 0 && b >= 0) out.push(log[i - 1].t + (log[i].t - log[i - 1].t) * (-a) / (b - a));
    }
    return out;
  },

  run: async function (A) {
    await APP.pickExercise("B6"); await APP.EX.ready;
    var T = B6.T;
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveA").set(A);          // the card has set the period
    APP.SIM.resetWater(); clearGaugeHistory();          // R
    await B6.advance(B6.SETTLE, false);
    APP.state.gauges.length = 0;
    [B6.XA, B6.XB].forEach(function (x, i) {
      APP.state.gauges.push({ x: x, z: B6.Z, hist: [], log: [], id: i + 1, colour: i ? "#ffb37f" : "#7fd4ff" });
    });
    await B6.advance(B6.RECORD, true);
    APP.state.paused = false;

    var la = APP.state.gauges[0].log, lb = APP.state.gauges[1].log;
    var t0 = lb[lb.length - 1].t - 6 * T;
    var six = lb.filter(function (s) { return s.t >= t0; });
    var mean = six.reduce(function (p, s) { return p + s.d; }, 0) / six.length;
    var pb = B6.periods(six, T);
    var H = B6.median(pb.map(function (p) { return p.max - p.min; }));
    var crest = B6.median(pb.map(function (p) { return p.max; })) - mean;
    var trough = mean - B6.median(pb.map(function (p) { return p.min; }));
    var ua = B6.upcrossings(la, B6.H0), ub = B6.upcrossings(lb, B6.H0), lags = [];
    ua.forEach(function (u) {
      var nxt = ub.filter(function (v) { return v > u && v < u + T; });
      if (nxt.length) lags.push(nxt[0] - u);
    });
    var dt = B6.median(lags), L = T * (B6.XB - B6.XA) / dt;
    var r3 = function (v) { return +v.toFixed(3); };
    return { T: T, A: A, H: r3(H), mean_minus_still: r3(mean - B6.H0), crest: r3(crest), trough: r3(trough),
             asymmetry: +(crest / trough).toFixed(2), dt: r3(dt), L: r3(L),
             Ur: +(H * L * L / Math.pow(B6.H0, 3)).toFixed(1), periods: pb.length };
  },

  sweep: async function () {
    var out = [];
    for (var r = 0; r < B6.ROWS.length; r++) out.push(await B6.run(B6.ROWS[r]));
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(B6) });
