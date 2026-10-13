/* ============================================================================
 * B5 · IRIBARREN MAP JIGSAW — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await B5.run(4)           // one cell of the card's table
 *     await B5.sweep()          // all fifteen
 *
 * It does what the card asks, through the same entry points: picks B5, takes
 * a wavesurge cell's beach from the Scenes menu path (switchScene + EX.carry,
 * so the card's view comes along), sets the period and stroke, presses R
 * (SIM.resetWater, t = 0), waits out the 40 s settle, and then watches the
 * wave for WATCH seconds, recording the surface along the whole flume from
 * the column reduction once per 1/60 s of simulated time.
 *
 * What it reports, per cell:
 *   Hi_toe  the incident height arriving at the beach toe: an incident and a
 *           reflected wave, each decaying, fitted to the first harmonic of
 *           the surface along the flat (the grid fit the README describes).
 *   H0, xi0 Hi_toe taken back to deep water by linear shoaling,
 *           Ks = √(cg₀/cg), and ξ₀ = tanβ / √(H₀/L₀), L₀ = gT²/2π.
 *   x_step  where a step first stands in the surface on the beach: the
 *           surface, averaged over five columns, falling shoreward steeper
 *           than the beach by 0.4 (1 in 2 on the 1 : 10 beach; a terrace one
 *           cell high reads 1 in 5), in water at least 3 cm deep. Surf width
 *           is from there to the still shoreline.
 *   H10     the wave height (highest − lowest) where the still water is
 *           10 cm deep. Under 1.5 cm with no step: the wave has died.
 * ==========================================================================*/
window.B5 = {
  SETTLE: 40, WATCH: 12, H: 0.348,
  BEACH: { wave: { toe: 1.2, slope: 0.10, x0: 0.45 }, wavesurge: { toe: 8.0, slope: 0.70, x0: 1.0 } },
  CELLS: [null,
    ["wave", 0.70, 0.035], ["wave", 0.90, 0.045], ["wave", 1.10, 0.055], ["wave", 1.50, 0.060],
    ["wave", 2.10, 0.070], ["wave", 3.00, 0.055], ["wave", 4.00, 0.045], ["wave", 5.00, 0.035],
    ["wave", 6.00, 0.030],
    ["wavesurge", 0.80, 0.060], ["wavesurge", 1.40, 0.130], ["wavesurge", 1.40, 0.173],
    ["wavesurge", 1.80, 0.080], ["wavesurge", 3.00, 0.140], ["wavesurge", 4.20, 0.200]],

  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },
  advance: async function (secs, each) {
    var S = APP.SIM, t1 = APP.sim.t + secs, ly = performance.now();
    var k = Math.max(1, Math.round((1 / 60) / S.dt()));
    while (APP.sim.t < t1) {
      S.step(k);
      if (each) each();
      if (performance.now() - ly > 1000) { await B5.yieldNow(); ly = performance.now(); }
    }
  },
  disp: function (T, h) {
    var w = 2 * Math.PI / T, k = w * w / 9.81;
    for (var i = 0; i < 100; i++) {
      var th = Math.tanh(k * h), f = 9.81 * k * th - w * w;
      k = Math.max(k - f / (9.81 * th + 9.81 * k * h * (1 - th * th)), k / 2);
    }
    var kh = k * h, c = w / k, n = 0.5 * (1 + 2 * kh / Math.sinh(2 * kh));
    return { k: k, L: 2 * Math.PI / k, cg: n * c };
  },

  /** A(x) = ai·e^{−(α+ik)x} + ar·e^{(α+ik)x}, least squares in (ai, ar) for
   *  each (k, α) on a grid; returns the incident height at x = xt. */
  twoWave: function (xs, re, im, k0, xt) {
    var best = null;
    for (var a = 0; a <= 40; a++) for (var b = 0; b <= 60; b++) {
      var al = 0.01 * a, k = k0 * (0.7 + 0.01 * b);
      // normal equations of a 2-column complex least squares
      var s11 = 0, s22 = 0, s12r = 0, s12i = 0, r1r = 0, r1i = 0, r2r = 0, r2i = 0, n = xs.length, j;
      var m1r = new Float64Array(n), m1i = new Float64Array(n), m2r = new Float64Array(n), m2i = new Float64Array(n);
      for (j = 0; j < n; j++) {
        var x = xs[j], e1 = Math.exp(-al * x), e2 = Math.exp(al * x);
        m1r[j] = e1 * Math.cos(k * x); m1i[j] = -e1 * Math.sin(k * x);
        m2r[j] = e2 * Math.cos(k * x); m2i[j] = e2 * Math.sin(k * x);
        s11 += m1r[j] * m1r[j] + m1i[j] * m1i[j]; s22 += m2r[j] * m2r[j] + m2i[j] * m2i[j];
        s12r += m1r[j] * m2r[j] + m1i[j] * m2i[j]; s12i += m1r[j] * m2i[j] - m1i[j] * m2r[j];
        r1r += m1r[j] * re[j] + m1i[j] * im[j]; r1i += m1r[j] * im[j] - m1i[j] * re[j];
        r2r += m2r[j] * re[j] + m2i[j] * im[j]; r2i += m2r[j] * im[j] - m2i[j] * re[j];
      }
      var det = s11 * s22 - (s12r * s12r + s12i * s12i);
      if (!(Math.abs(det) > 1e-12)) continue;
      // [ai ar] = inv([[s11, s12],[conj s12, s22]]) [r1 r2]
      var air = (s22 * r1r - (s12r * r2r - s12i * r2i)) / det, aii = (s22 * r1i - (s12r * r2i + s12i * r2r)) / det;
      var arr = (s11 * r2r - (s12r * r1r + s12i * r1i)) / det, ari = (s11 * r2i - (s12r * r1i - s12i * r1r)) / det;
      var res = 0;
      for (j = 0; j < n; j++) {
        var fr = air * m1r[j] - aii * m1i[j] + arr * m2r[j] - ari * m2i[j];
        var fi = air * m1i[j] + aii * m1r[j] + arr * m2i[j] + ari * m2r[j];
        res += (fr - re[j]) * (fr - re[j]) + (fi - im[j]) * (fi - im[j]);
      }
      if (!best || res < best.res) best = { res: res, al: al, k: k, ai: Math.hypot(air, aii) };
    }
    return 2 * best.ai * Math.exp(-best.al * xt);
  },

  run: async function (cell) {
    var row = B5.CELLS[cell], scene = row[0], T = row[1], A = row[2];
    await APP.pickExercise("B5"); await APP.EX.ready;
    if (APP.state.scene.id !== scene) { switchScene(scene); APP.EX.carry(scene); }
    APP.state.paused = true;
    var C = function (id) { return CONTROLS.find(function (c) { return c.id === id; }); };
    C("waveOn").set(true); C("waveT").set(T); C("waveA").set(A);
    APP.SIM.resetWater(); clearGaugeHistory();          // R
    await B5.advance(B5.SETTLE, null);

    var nx = APP.sim.nx, dx = APP.sim.dx, w = 2 * Math.PI / T, b = B5.BEACH[scene], i, j;
    var col0 = APP.SIM.columns(true), bed = new Float64Array(nx), d0 = new Float64Array(nx);
    for (i = 0; i < nx; i++) bed[i] = col0[i * 4];
    var still = bed[Math.round((b.toe - 0.3) / dx)] + B5.H;
    for (i = 0; i < nx; i++) d0[i] = Math.max(0, still - bed[i]);
    var n = 0, s1 = new Float64Array(nx), sc = new Float64Array(nx), ss = new Float64Array(nx), sC = 0, sS = 0,
        mx = new Float64Array(nx).fill(-1e9), mn = new Float64Array(nx).fill(1e9), face = new Float64Array(nx),
        e = new Float64Array(nx), em = new Float64Array(nx), t0 = APP.sim.t;
    await B5.advance(B5.WATCH, function () {
      var col = APP.SIM.columns(true), t = APP.sim.t - t0, c = Math.cos(w * t), s = Math.sin(w * t);
      for (j = 0; j < nx; j++) e[j] = col[j * 4] + col[j * 4 + 1];
      for (j = 0; j < nx; j++) {
        s1[j] += e[j]; sc[j] += e[j] * c; ss[j] += e[j] * s;
        if (e[j] > mx[j]) mx[j] = e[j]; if (e[j] < mn[j]) mn[j] = e[j];
        var lo = Math.max(0, j - 2), hi = Math.min(nx - 1, j + 2), acc = 0;
        for (var q = lo; q <= hi; q++) acc += e[q];
        em[j] = acc / (hi - lo + 1);
      }
      for (j = 1; j < nx - 1; j++) face[j] = Math.max(face[j], -(em[j + 1] - em[j - 1]) / (2 * dx));
      sC += c; sS += s; n++;
    });
    APP.state.paused = false;

    // the first harmonic, complex, along the flat
    var xs = [], re = [], im = [];
    for (i = Math.round(b.x0 / dx); i <= Math.round((b.toe - 0.1) / dx); i++) {
      var m = s1[i] / n, C1 = 2 * (sc[i] / n - m * sC / n), S1 = 2 * (ss[i] / n - m * sS / n);
      xs.push((i + 0.5) * dx); re.push(C1); im.push(-S1);
    }
    var d = B5.disp(T, B5.H), Hi = B5.twoWave(xs, re, im, d.k, b.toe);
    var L0 = 9.81 * T * T / (2 * Math.PI), cg0 = 9.81 * T / (4 * Math.PI);
    var H0 = Hi / Math.sqrt(cg0 / d.cg), xi0 = b.slope / Math.sqrt(H0 / L0);
    var xShore = b.toe + B5.H / b.slope, xs1 = null, i10 = null;
    for (i = Math.round(b.toe / dx); i < nx && d0[i] > 0; i++) {
      if (i10 === null && d0[i] <= 0.10) i10 = i;
      if (xs1 === null && d0[i] >= 0.03 && face[i] >= b.slope + 0.4) xs1 = (i + 0.5) * dx;
    }
    var H10 = mx[i10] - mn[i10];
    var what = xs1 !== null ? "breaks" : (H10 < 0.015 ? "dies" : "surges");
    var r3 = function (v) { return v === null ? null : +v.toFixed(3); };
    return { cell: cell, scene: scene, T: T, A: A, Hi_toe: r3(Hi), H0: r3(H0), L0: +L0.toFixed(2),
             xi0: +xi0.toFixed(2), behaviour: what, x_step: r3(xs1),
             surf_width: xs1 === null ? null : r3(xShore - xs1), H10: r3(H10) };
  },

  sweep: async function () {
    var out = [];
    for (var c = 1; c < B5.CELLS.length; c++) out.push(await B5.run(c));
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(B5) });
