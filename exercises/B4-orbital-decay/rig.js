/* ============================================================================
 * B4 · ORBITAL DECAY, MEASURED OFF THE TRAILS — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await B4.run(1.35, 0.23)     // one row of the card: period, stroke
 *     await B4.sweep()             // every row the card prints
 *
 * It does what the card asks, through the same entry points: picks B4 (the
 * deep flume at Medium, the tracer column at x = 5.84 m), sets the period and
 * stroke, presses R (SIM.resetWater, t = 0), waits out the 40 s settle, and
 * then follows the nine tracers for SPAN seconds exactly as the frame loop
 * does (main.js advanceTracers, once per ~1/60 s of simulated time).
 *
 * The number a student reads is the height of ONE loop: the vertical extent
 * of a trail over one period. A whole trail drifts sideways with the flume's
 * mean current (forward near the surface, back along the bed) and its overall
 * extent includes that drift; one loop does not. So each trail's positions
 * are cut into whole periods and the median single-period vertical extent is
 * reported. A tracer that drifts 0.9 m from the column is put back on it
 * (advanceTracers), and a period that straddles that jump is skipped.
 *
 * Theory: the vertical excursion at height z above the bed is
 *     2a · sinh(kz) / sinh(kh),   σ² = gk·tanh(kh),   σ = 2π/T,
 * so the ratio of two trails is sinh(k z₁)/sinh(k z₂), with z the tracer's
 * seeded height above the bed and h the still-water depth at the column.
 * ==========================================================================*/
window.B4 = {
  SETTLE: 40, SPAN: 12,
  ROWS: [[1.20, 0.19], [1.35, 0.23], [1.50, 0.28], [1.60, 0.30], [1.80, 0.30], [2.00, 0.30]],

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },

  /** Advance `secs` of simulated time in frame-sized chunks, moving the tracers
   *  as the frame loop does; with `rec`, sample every tracer once per chunk. */
  advance: async function (secs, rec) {
    var S = APP.SIM, sim = APP.sim, t1 = sim.t + secs, ly = performance.now();
    var k = Math.max(1, Math.round((1 / 60) / S.dt()));
    while (APP.sim.t < t1) {
      var a = S.step(k);
      if (!APP.state.tracers && APP.sim.t > 0.5) seedTracers(APP.state.scene.tracerX);
      advanceTracers(a);
      if (rec) rec.push({ t: APP.sim.t, p: APP.state.tracers.list.map(function (q) { return [q.x, q.z]; }) });
      if (performance.now() - ly > 1000) { await B4.yieldNow(); ly = performance.now(); }
    }
  },

  kh: function (T, h) {
    var w = 2 * Math.PI / T, k = w * w / 9.81;
    for (var i = 0; i < 100; i++) {
      var th = Math.tanh(k * h), f = 9.81 * k * th - w * w;
      k = Math.max(k - f / (9.81 * th + 9.81 * k * h * (1 - th * th)), k / 2);
    }
    return k;
  },

  run: async function (T, A, settle, span) {
    settle = settle === undefined ? B4.SETTLE : settle; span = span === undefined ? B4.SPAN : span;
    await APP.pickExercise("B4"); await APP.EX.ready;
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveT").set(T); C("waveA").set(A);
    APP.SIM.resetWater(); clearGaugeHistory();         // R
    APP.state.tracers = null;
    await B4.advance(settle, null);
    var rec = [];
    await B4.advance(span, rec);
    APP.state.paused = false;

    var col = APP.SIM.columns(true), x = APP.state.tracers.x;
    var i = Math.round(x / APP.sim.dx), bed = col[i * 4];
    var h = 0.743;                                    // still depth at the column, t = 0
    var k = B4.kh(T, h);
    var trails = APP.state.tracers.list.map(function (q, n) {
      var ext = [], p0 = rec[0].t, cur = [];
      for (var j = 0; j < rec.length; j++) {
        var s = rec[j], pt = s.p[n];
        if (j && Math.abs(pt[0] - rec[j - 1].p[n][0]) > 0.3) { cur = []; p0 = s.t; continue; }   // put back
        if (s.t >= p0 + T) {
          if (cur.length > 5) {
            var zs = cur.map(function (c) { return c[1]; });
            ext.push(Math.max.apply(null, zs) - Math.min.apply(null, zs));
          }
          cur = []; p0 += T;
        }
        cur.push(pt);
      }
      ext.sort(function (a, b) { return a - b; });
      var med = ext.length ? ext[Math.floor(ext.length / 2)] : NaN;
      var z = q.z0 - bed;
      return { trail: n + 1, z: +z.toFixed(3), loop_mm: +(1000 * med).toFixed(1), loops: ext.length,
               theory_rel: +(Math.sinh(k * z) / Math.sinh(k * h)).toFixed(4) };
    });
    var R = function (a, b) {
      return { measured: +(trails[a - 1].loop_mm / trails[b - 1].loop_mm).toFixed(2),
               theory: +(Math.sinh(k * trails[a - 1].z) / Math.sinh(k * trails[b - 1].z)).toFixed(2) };
    };
    return { T: T, A: A, kh: +(k * h).toFixed(3), x: x, trails: trails,
             R82: R(8, 2), R81: R(8, 1), R85: R(8, 5) };
  },

  sweep: async function () {
    var out = [];
    for (var r = 0; r < B4.ROWS.length; r++) {
      var o = await B4.run(B4.ROWS[r][0], B4.ROWS[r][1]);
      out.push({ T: o.T, kh: o.kh, R82: o.R82.measured, R82_theory: o.R82.theory,
                 R81: o.R81.measured, R81_theory: o.R81.theory });
    }
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(B4) });
