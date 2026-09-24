/* ============================================================================
 * DA-2 · TIME SCALES AS √L_r — console spot-check on the scale-tanks scene
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console of the app (any scene), then:
 *
 *     await DA2.run(0.5)          // one student run at L_r = 0.5: T_p, T_m, error
 *     await DA2.sweep()           // all ten digits, L_r = 0.25 … 0.70
 *
 * It does what the card asks, through the same entry points: picks DA-2,
 * sets Model scale L_r with SIM.setParam (what the Geometry slider calls),
 * places the two Depth gauges at the prototype station and its L_r-scaled
 * twin, opens both slots with SIM.setValve (what V calls) and times each
 * tank between its marks. Depth is read from the column reduction the gauge
 * card reads (SIM.columns: bed, depth, q, surface per column), stepping the
 * solver flat out and sampling every 5 ms of simulated time, so the times are
 * the ones a patient student hovering the traces would read.
 *
 * The marks are the prototype's d = 2.50 → 1.00 m and the model's L_r× those.
 * Measured at Medium (Δx = 0.02 m), headless, on this rig:
 *
 *     L_r     0.25  0.30  0.35  0.40  0.45  0.50  0.55  0.60  0.65  0.70
 *     T_m   1.840 2.030 2.244 2.415 2.587 2.738 2.885 3.031 3.176 3.300 s
 *     err   −9.3  −8.6  −6.5  −5.9  −4.9  −4.5  −4.1  −3.5  −2.9  −2.8 %
 *
 * with T_p = 4.056 s throughout (the prototype does not change with L_r).
 * ==========================================================================*/
window.DA2 = {
  XP: 0.2, XM: 5.2, STATION: 1.4,        // gauge 1.4 m in from each tank's outer left edge (× L_r)
  MARKS: [2.5, 1.0],                     // prototype depth marks, m; the model's are L_r×

  cross: function (tr, col, level) {
    for (var k = 1; k < tr.length; k++)
      if (tr[k - 1][col] >= level && tr[k][col] < level) {
        var f = (tr[k - 1][col] - level) / (tr[k - 1][col] - tr[k][col]);
        return tr[k - 1][0] + f * (tr[k][0] - tr[k - 1][0]);
      }
    return null;
  },

  run: async function (lam, dur) {
    dur = dur || 6.5;
    await APP.pickExercise("DA-2"); await APP.EX.ready;
    APP.SIM.setParam("lam", lam);           // resets the water: a fresh, full pair of tanks
    APP.SIM.resetWater(); APP.SIM.setValve(true);
    var xp = DA2.XP + DA2.STATION, xm = DA2.XM + lam * DA2.STATION;
    APP.state.gauges.length = 0;
    APP.placeGauge(xp, 1.2); APP.placeGauge(xm, 1.2 * lam);
    APP.state.gaugeField = "d";
    var ip = Math.floor(xp / APP.sim.dx), im = Math.floor(xm / APP.sim.dx);
    APP.state.paused = true;
    APP.tick(50);
    APP.SIM.setValve(false);                // V: both slots open together
    var t0 = APP.sim.t, next = t0, tr = [];
    while (APP.sim.t < t0 + dur) {
      APP.tick(10);
      if (APP.sim.t >= next) {
        var c = APP.SIM.columns(true);
        tr.push([APP.sim.t - t0, c[ip * 4 + 1], c[im * 4 + 1]]);
        next += 0.005;
      }
      if (tr.length % 50 === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
    APP.state.paused = false;
    var tp = DA2.cross(tr, 1, DA2.MARKS[1]) - DA2.cross(tr, 1, DA2.MARKS[0]);
    var tm = DA2.cross(tr, 2, lam * DA2.MARKS[1]) - DA2.cross(tr, 2, lam * DA2.MARKS[0]);
    var pred = Math.sqrt(lam) * tp;
    return { lambda: lam, T_p: +tp.toFixed(3), T_m: +tm.toFixed(3),
             predicted: +pred.toFixed(3), error_pct: +(100 * (tm - pred) / pred).toFixed(2) };
  },

  sweep: async function () {
    var out = [];
    for (var d = 0; d < 10; d++) out.push(await DA2.run(+(0.25 + 0.05 * d).toFixed(2)));
    console.table(out);
    return out;
  },
};
