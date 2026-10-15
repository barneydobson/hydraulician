/* ============================================================================
 * WV-1 · DISPERSION, ONE PERIOD EACH — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await WV1.run(2.0, 0.06)      // one row of the card: period, stroke
 *     await WV1.sweep()             // every row the card prints
 *
 * It does what the card asks, through the same entry points: picks WV-1 (the
 * shallow flume at Medium, gauges on Depth), sets the period and stroke,
 * presses R (SIM.resetWater, t = 0), waits out the 30 s settle, places the
 * two Depth gauges (state.gauges, as the Gauge tool does) and records them
 * once per 1/60 s of simulated time exactly as the frame loop samples them
 * (main.js sampleGauges). The gauges are the card's: x = 0.6 and 1.0 m for
 * 0.9 and 1.0 s, 1.0 and 2.0 m for 1.2 s, 1.0 and 3.0 m from 1.5 s. The pair
 * is always closer than a wavelength, so the farther gauge's next up-crossing
 * belongs to the same wave.
 *
 * Δt is the time from the first gauge's trace crossing the still depth
 * (0.348 m) upward to the second gauge's doing the same. The card has the
 * student time three successive waves and keep the middle Δt: `dt` is that,
 * from the first three waves of the record; `dt_record` is the median over
 * every wave in it. c = Δx/Δt, L = cT. Theory: σ² = gk·tanh(kh), L = 2π/k;
 * deep water L₀ = gT²/2π, shallow water L = T√(gh).
 * ==========================================================================*/
window.WV1 = {
  SETTLE: 30, H0: 0.348,
  ROWS: [[0.9, 0.025], [1.0, 0.030], [1.2, 0.030], [1.5, 0.035], [1.8, 0.045],
         [2.0, 0.060], [2.2, 0.060], [2.5, 0.060], [2.8, 0.080], [3.0, 0.100]],
  gaugesFor: function (T) { return T <= 1.0 ? [0.6, 1.0] : T <= 1.2 ? [1.0, 2.0] : [1.0, 3.0]; },

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },
  advance: async function (secs, each) {
    var S = APP.SIM, t1 = APP.sim.t + secs, ly = performance.now();
    var k = Math.max(1, Math.round((1 / 60) / S.dt()));
    while (APP.sim.t < t1) {
      S.step(k);
      if (each) each();
      if (performance.now() - ly > 1000) { await WV1.yieldNow(); ly = performance.now(); }
    }
  },
  median: function (a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; },
  linL: function (T, h) {
    var w = 2 * Math.PI / T, k = w * w / 9.81;
    for (var i = 0; i < 100; i++) {
      var th = Math.tanh(k * h), f = 9.81 * k * th - w * w;
      k = Math.max(k - f / (9.81 * th + 9.81 * k * h * (1 - th * th)), k / 2);
    }
    return 2 * Math.PI / k;
  },
  upcrossings: function (log, ref) {
    var out = [];
    for (var i = 1; i < log.length; i++) {
      var a = log[i - 1].d - ref, b = log[i].d - ref;
      if (a < 0 && b >= 0) out.push(log[i - 1].t + (log[i].t - log[i - 1].t) * (-a) / (b - a));
    }
    return out;
  },

  run: async function (T, A) {
    await APP.pickExercise("WV-1"); await APP.EX.ready;
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveT").set(T); C("waveA").set(A);
    APP.SIM.resetWater(); clearGaugeHistory();          // R
    await WV1.advance(WV1.SETTLE, null);
    var xs = WV1.gaugesFor(T);
    APP.state.gauges.length = 0;
    xs.forEach(function (x, i) {
      APP.state.gauges.push({ x: x, z: 0.40, hist: [], log: [], id: i + 1, colour: i ? "#ffb37f" : "#7fd4ff" });
    });
    await WV1.advance(Math.max(12, 5 * T), function () {
      APP.state.paused = false;                       // sampleGauges records only while running
      sampleGauges(OVERLAY.analyse(APP.sim, APP.SIM.columns(true)));
      APP.state.paused = true;
    });
    APP.state.paused = false;
    var ua = WV1.upcrossings(APP.state.gauges[0].log, WV1.H0), ub = WV1.upcrossings(APP.state.gauges[1].log, WV1.H0), lags = [];
    ua.forEach(function (u) { var n = ub.filter(function (v) { return v > u && v < u + T; }); if (n.length) lags.push(n[0] - u); });
    var dt = WV1.median(lags.slice(0, 3)), dtR = WV1.median(lags), Lt = WV1.linL(T, WV1.H0);
    var L = T * (xs[1] - xs[0]) / dt, LR = T * (xs[1] - xs[0]) / dtR;
    return { T: T, A: A, gauges: xs, dt: +dt.toFixed(3), L: +L.toFixed(3), L_theory: +Lt.toFixed(3),
             err_pct: +(100 * (L / Lt - 1)).toFixed(1), dt_record: +dtR.toFixed(3),
             err_record_pct: +(100 * (LR / Lt - 1)).toFixed(1), L0: +(9.81 * T * T / (2 * Math.PI)).toFixed(2),
             L_shallow: +(T * Math.sqrt(9.81 * WV1.H0)).toFixed(2), crossings: lags.length };
  },

  sweep: async function () {
    var out = [];
    for (var r = 0; r < WV1.ROWS.length; r++) out.push(await WV1.run(WV1.ROWS[r][0], WV1.ROWS[r][1]));
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(WV1) });
