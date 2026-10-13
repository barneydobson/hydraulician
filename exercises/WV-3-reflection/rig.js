/* ============================================================================
 * WV-3 · REFLECTION COEFFICIENT OF A STEEP SEA WALL — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await WV3.run(1.8, 0.08)                 // one row: period, stroke
 *     await WV3.run(1.8, 0.08, "waveshallow")  // the contrast run, gentle beach
 *     await WV3.sweep()                        // every row the card prints
 *
 * It does what the card asks, through the same entry points: picks WV-3 (the
 * sea-wall flume at Medium, gauges on Depth), takes the contrast beach the way
 * the Scenes menu does (switchScene + EX.carry, so the card's view comes
 * along), sets the period and stroke, presses R (SIM.resetWater, t = 0) and
 * waits out the 45 s settle.
 *
 * Then the scan. Twelve stations, from 0.1 m short of the beach toe back
 * towards the paddle in the card's step for the period (eleven steps cover
 * half a wavelength, so a node and an antinode are both inside), four Depth
 * gauges at a time, as the Gauge tool allows. Each round records three waves
 * exactly as the frame loop samples them (main.js sampleGauges, once per
 * 1/60 s of simulated time), and each gauge's amplitude at the paddle's
 * period is taken the way the card's spreadsheet does: subtract the mean,
 * C = mean of d′·cos(2πt/T), S = mean of d′·sin(2πt/T), a = 2√(C² + S²).
 * The swing, half of highest minus lowest, is reported beside it: at the
 * node it is mostly the wave's higher harmonics, and its smallest value can
 * sit a whole step from the node.
 *
 * The last round puts four gauges a quarter and a half step either side of
 * the station with the smallest a and records four waves. a_max is the
 * scan's largest a, a_min the smallest of the five near the node, and
 *
 *     K = (a_max − a_min) / (a_max + a_min)
 *
 * Node to antinode is a quarter wavelength; σ² = gk·tanh(kh), h = 0.348 m.
 * ==========================================================================*/
window.WV3 = {
  SETTLE: 45, WAVES: 3, H0: 0.348, N: 12,
  TOE: { wavesurge: 8.0, waveshallow: 4.0 },
  STEP: { 1.8: 0.15, 2.4: 0.20, 3.0: 0.25, 3.6: 0.30, 4.2: 0.40 },
  ROWS: [[1.8, 0.080], [2.4, 0.110], [3.0, 0.140], [3.6, 0.170], [4.2, 0.200]],
  CONTRAST: [[1.8, 0.080], [3.0, 0.140]],

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },
  advance: async function (secs, each) {
    var S = APP.SIM, t1 = APP.sim.t + secs, ly = performance.now();
    var k = Math.max(1, Math.round((1 / 60) / S.dt()));
    while (APP.sim.t < t1) {
      S.step(k);
      if (each) each();
      if (performance.now() - ly > 1000) { await WV3.yieldNow(); ly = performance.now(); }
    }
  },
  linL: function (T, h) {
    var w = 2 * Math.PI / T, k = w * w / 9.81;
    for (var i = 0; i < 100; i++) {
      var th = Math.tanh(k * h), f = 9.81 * k * th - w * w;
      k = Math.max(k - f / (9.81 * th + 9.81 * k * h * (1 - th * th)), k / 2);
    }
    return 2 * Math.PI / k;
  },

  /** One round: these gauges for `waves` waves; each one's swing and its
   *  amplitude at the paddle's period. */
  round: async function (xs, T, waves) {
    APP.state.gauges.length = 0;
    xs.forEach(function (x, i) {
      APP.state.gauges.push({ x: x, z: 0.42, hist: [], log: [], id: i + 1, colour: "#7fd4ff" });
    });
    await WV3.advance(waves * T, function () {
      APP.state.paused = false;                       // sampleGauges records only while running
      sampleGauges(OVERLAY.analyse(APP.sim, APP.SIM.columns(true)));
      APP.state.paused = true;
    });
    var w = 2 * Math.PI / T;
    return APP.state.gauges.map(function (g) {
      var d = g.log.map(function (s) { return s.d; }), n = d.length;
      var m = d.reduce(function (p, q) { return p + q; }, 0) / n, C = 0, S = 0;
      g.log.forEach(function (s) { C += (s.d - m) * Math.cos(w * s.t); S += (s.d - m) * Math.sin(w * s.t); });
      return { swing: (Math.max.apply(null, d) - Math.min.apply(null, d)) / 2, a: 2 * Math.hypot(C / n, S / n) };
    });
  },

  run: async function (T, A, scene) {
    scene = scene || "wavesurge";
    await APP.pickExercise("WV-3"); await APP.EX.ready;
    if (APP.state.scene.id !== scene) { switchScene(scene); APP.EX.carry(scene); }
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveT").set(T); C("waveA").set(A);
    APP.SIM.resetWater(); clearGaugeHistory();          // R
    await WV3.advance(WV3.SETTLE, null);

    var step = WV3.STEP[T], toe = WV3.TOE[scene], xs = [], sc = [], r, i;
    for (i = 0; i < WV3.N; i++) xs.push(+(toe - 0.1 - i * step).toFixed(3));
    for (r = 0; r < WV3.N; r += 4) sc = sc.concat(await WV3.round(xs.slice(r, r + 4), T, WV3.WAVES));
    var a = sc.map(function (g) { return g.a; }), sw = sc.map(function (g) { return g.swing; });
    var jmin = a.indexOf(Math.min.apply(null, a)), jmax = a.indexOf(Math.max.apply(null, a));
    var fin = [-0.5, -0.25, 0.25, 0.5].map(function (o) { return +(xs[jmin] + o * step).toFixed(3); })
      .filter(function (x) { return x < toe; });
    var g = await WV3.round(fin, T, 4);
    APP.state.paused = false;
    var amax = a[jmax], amin = a[jmin], xn = xs[jmin];
    g.forEach(function (q, k) { if (q.a < amin) { amin = q.a; xn = fin[k]; } });
    var smin = Math.min.apply(null, sw), smax = Math.max.apply(null, sw);
    var K = (amax - amin) / (amax + amin), L = WV3.linL(T, WV3.H0);
    var r3 = function (v) { return +v.toFixed(3); };
    return { scene: scene, T: T, A: A, step: step, x_max: xs[jmax], a_max: r3(amax), x_min: xn, a_min: r3(amin),
             K: +K.toFixed(2), K_swing: +((smax - smin) / (smax + smin)).toFixed(2),
             node_to_antinode: r3(Math.abs(xs[jmax] - xn)), quarter_L: r3(L / 4), a_scan: a.map(r3) };
  },

  sweep: async function () {
    var out = [], i;
    for (i = 0; i < WV3.ROWS.length; i++) out.push(await WV3.run(WV3.ROWS[i][0], WV3.ROWS[i][1]));
    for (i = 0; i < WV3.CONTRAST.length; i++) out.push(await WV3.run(WV3.CONTRAST[i][0], WV3.CONTRAST[i][1], "waveshallow"));
    console.table(out.map(function (o) { var c = Object.assign({}, o); delete c.a_scan; return c; }));
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(WV3) });
