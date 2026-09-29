/* ============================================================================
 * DA-1 · WHICH TANK EMPTIES FIRST? — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await DA1.run(0)       // water  → { T_p: 4.105, T_m: 2.860, ratio: 0.697 }
 *     await DA1.run(1)       // syrup  → { T_p: 3.975, T_m: 3.281, ratio: 0.825 }
 *
 * It picks DA-1 (the fluid-tanks scene, as the card sets it up), sets the
 * Fluid slider with SIM.setParam (what Controls → Geometry calls), opens both
 * slots with SIM.setValve (what V calls) and times each tank between its
 * marks: the prototype's d = 2.50 → 1.00 m and the model's L_r × those. Depth
 * is read from the column reduction the gauge card reads (SIM.columns), every
 * 5 ms of simulated time, stepping the solver flat out.
 *
 * Froude predicts ratio = √L_r = 0.707 at L_r = ½ in either fluid.
 * ==========================================================================*/
window.DA1 = {
  MARKS: [2.5, 1.0], STATION: 1.4, XP: 0.2, XM: 5.2,
  // A MessageChannel yield, not setTimeout: a hidden tab throttles timers to
  // one a minute, which stalls a long run.
  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },
  cross: function (tr, col, level) {
    for (var k = 1; k < tr.length; k++)
      if (tr[k - 1][col] >= level && tr[k][col] < level) {
        var f = (tr[k - 1][col] - level) / (tr[k - 1][col] - tr[k][col]);
        return tr[k - 1][0] + f * (tr[k][0] - tr[k - 1][0]);
      }
    return null;
  },
  run: async function (fluid, lam, dur) {
    fluid = fluid ? 1 : 0; lam = lam || 0.5; dur = dur || 7;
    await APP.pickExercise("DA-1"); await APP.EX.ready;
    APP.SIM.setParam("fluid", fluid);          // restarts the water, full
    APP.SIM.setParam("lam", lam);
    APP.SIM.resetWater(); APP.SIM.setValve(true);
    var xp = DA1.XP + DA1.STATION, xm = DA1.XM + lam * DA1.STATION;
    var ip = Math.floor(xp / APP.sim.dx), im = Math.floor(xm / APP.sim.dx);
    APP.state.paused = true;
    APP.tick(50);
    APP.SIM.setValve(false);                   // V: both slots open together
    var t0 = APP.sim.t, next = t0, tr = [], ly = performance.now();
    while (APP.sim.t < t0 + dur) {
      APP.tick(10);
      if (APP.sim.t >= next) {
        var c = APP.SIM.columns(true);
        tr.push([APP.sim.t - t0, c[ip * 4 + 1], c[im * 4 + 1]]);
        next += 0.005;
      }
      if (performance.now() - ly > 1000) { await DA1.yieldNow(); ly = performance.now(); }
    }
    APP.state.paused = false;
    var tp = DA1.cross(tr, 1, DA1.MARKS[1]) - DA1.cross(tr, 1, DA1.MARKS[0]);
    var tm = DA1.cross(tr, 2, lam * DA1.MARKS[1]) - DA1.cross(tr, 2, lam * DA1.MARKS[0]);
    return { fluid: fluid ? "syrup" : "water", nu: APP.sim.p.nu, lambda: lam,
             T_p: +tp.toFixed(3), T_m: +tm.toFixed(3), ratio: +(tm / tp).toFixed(3),
             froude: +Math.sqrt(lam).toFixed(3), error_pct: +(100 * (tm / (Math.sqrt(lam) * tp) - 1)).toFixed(1) };
  },
};
