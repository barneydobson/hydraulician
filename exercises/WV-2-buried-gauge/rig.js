/* ============================================================================
 * WV-2 · THE BURIED WAVE GAUGE — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await WV2.run(1.50, 0.060)    // one row of the card: period, stroke
 *     await WV2.sweep()             // every distinct row
 *
 * It does what the card asks, through the same entry points: picks WV-2 (the
 * 1 : 10 beach flume at Medium, gauges on h), sets the period and stroke,
 * presses R (SIM.resetWater, t = 0), waits out the 20 s settle, places the two
 * gauges on the card's vertical (state.gauges, as the Gauge tool does),
 * records RECORD seconds sampled once per 1/60 s of simulated time exactly as
 * the frame loop samples them (main.js sampleGauges), and then takes the CSV
 * the inspector's ⤓ CSV all gauges button downloads (APP.gaugeCSV).
 *
 * The ratio is worked from that CSV the way the card tells a student to work
 * it in a spreadsheet: keep a whole number of periods, subtract each column's
 * mean, average h'·cos(σt) and h'·sin(σt), and a = 2·√(C² + S²). That is the
 * amplitude AT THE PADDLE FREQUENCY. It also reports the half peak-to-peak
 * swing of the same traces, the read the card used to ask for, to show what
 * it does to the ratio.
 *
 * Theory at the gauges' own heights: bed / surface = cosh(k z_b)/cosh(k z_s),
 * z measured up from the bed, σ² = gk·tanh(kh). The idealised 1/cosh(kh) is
 * the limit with the gauges at the bed and at the still surface.
 * ==========================================================================*/
window.WV2 = {
  SETTLE: 20, RECORD: 15, X: 0.60, ZB: 0.27, ZS: 0.52,
  ROWS: [[1.10, 0.055], [1.20, 0.055], [1.30, 0.060], [1.40, 0.060], [1.50, 0.060],
         [1.65, 0.060], [1.85, 0.065], [2.10, 0.070]],

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },

  /** Advance `secs` of simulated time in 1/60 s chunks; with `sample`, record
   *  the gauges after each chunk as the frame loop would. */
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
      if (performance.now() - ly > 1000) { await WV2.yieldNow(); ly = performance.now(); }
    }
  },

  kh: function (T, h) {
    var w = 2 * Math.PI / T, k = w * w / 9.81;
    for (var i = 0; i < 100; i++) {
      var th = Math.tanh(k * h), f = 9.81 * k * th - w * w;
      k = Math.max(k - f / (9.81 * th + 9.81 * k * h * (1 - th * th)), k / 2);
    }
    return k * h;
  },

  /** The spreadsheet's amplitude at period T over the first whole number of
   *  periods of one CSV column. */
  amp: function (t, y, T) {
    var n = 0, t0 = t[0], tEnd = t0 + Math.floor((t[t.length - 1] - t0) / T) * T;
    var mean = 0, i;
    for (i = 0; i < t.length && t[i] < tEnd; i++) { mean += y[i]; n++; }
    mean /= n;
    var C = 0, S = 0, w = 2 * Math.PI / T;
    for (i = 0; i < n; i++) { C += (y[i] - mean) * Math.cos(w * t[i]); S += (y[i] - mean) * Math.sin(w * t[i]); }
    C /= n; S /= n;
    return 2 * Math.sqrt(C * C + S * S);
  },

  run: async function (T, A) {
    await APP.pickExercise("WV-2"); await APP.EX.ready;
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveT").set(T); C("waveA").set(A);
    APP.SIM.resetWater(); clearGaugeHistory();          // R
    await WV2.advance(WV2.SETTLE, false);
    APP.state.gauges.length = 0;
    [WV2.ZB, WV2.ZS].forEach(function (z, i) {
      APP.state.gauges.push({ x: WV2.X, z: z, hist: [], log: [], id: i + 1, colour: i ? "#ffb37f" : "#7fd4ff" });
    });
    await WV2.advance(WV2.RECORD, true);
    APP.state.paused = false;

    var lines = APP.gaugeCSV().trim().split("\n"), hdr = lines[0].split(",");
    var cb = hdr.findIndex(function (h) { return /^g1_.*_h_m$/.test(h); });
    var cs = hdr.findIndex(function (h) { return /^g2_.*_h_m$/.test(h); });
    var t = [], hb = [], hs = [];
    lines.slice(1).forEach(function (l) { var c = l.split(","); t.push(+c[0]); hb.push(+c[cb]); hs.push(+c[cs]); });
    var ab = WV2.amp(t, hb, T), as = WV2.amp(t, hs, T);
    var pp = function (y) { return (Math.max.apply(null, y) - Math.min.apply(null, y)) / 2; };

    var col = APP.SIM.columns(true), i = Math.floor(WV2.X / APP.sim.dx), bed = col[i * 4];
    var h = 0.348, kh = WV2.kh(T, h), k = kh / h;
    var r3 = function (v) { return +v.toFixed(3); };
    return { T: T, A: A, kh: r3(kh), samples: t.length,
             a_bed_mm: +(1000 * ab).toFixed(1), a_surf_mm: +(1000 * as).toFixed(1),
             ratio: r3(ab / as),
             theory: r3(Math.cosh(k * (WV2.ZB - bed)) / Math.cosh(k * (WV2.ZS - bed))),
             ideal: r3(1 / Math.cosh(kh)),
             ratio_peak_to_peak: r3(pp(hb) / pp(hs)) };
  },

  sweep: async function () {
    var out = [];
    for (var r = 0; r < WV2.ROWS.length; r++) out.push(await WV2.run(WV2.ROWS[r][0], WV2.ROWS[r][1]));
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(WV2) });
