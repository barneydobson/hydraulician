/* ============================================================================
 * DA-1 · EMPTY A TANK OF HONEY — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await DA1.run(0, 0.5)       // water → T_p 4.105 s, T_m 2.860 s, V_r 0.718
 *     await DA1.run(1, 0.5, 15)   // honey → T_p 3.975 s, T_m 3.281 s, V_r 0.606
 *     await DA1.sweep()           // all ten digits, both fluids
 *
 * It picks DA-1 (the fluid-tanks scene, as the card sets it up), sets the
 * Fluid and Length ratio sliders with SIM.setParam (what Controls → Geometry
 * calls), opens both slots with SIM.setValve (what V calls) and times each
 * tank between its marks: the prototype's d = 2.50 → 1.00 m and the model's
 * L_r × those. Depth is read from the column reduction the gauge card reads
 * (SIM.columns), every 5 ms of simulated time, stepping the solver flat out.
 * The third argument is the simulated window in seconds: honey at small L_r
 * needs about 15.
 *
 * Froude predicts V_r = L_r · T_p / T_m = √L_r in either fluid.
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
    return { fluid: fluid ? "honey" : "water", nu: APP.sim.p.nu, lambda: lam,
             T_p: +tp.toFixed(3), T_m: +tm.toFixed(3), ratio: +(tm / tp).toFixed(3),
             V_r: +(lam * tp / tm).toFixed(3), froude: +Math.sqrt(lam).toFixed(3),
             departure_pct: +(100 * (lam * tp / tm / Math.sqrt(lam) - 1)).toFixed(1) };
  },

  sweep: async function () {
    var out = [];
    for (var f = 0; f < 2; f++)
      for (var d = 0; d < 10; d++) out.push(await DA1.run(f, +(0.25 + 0.05 * d).toFixed(2), f ? 15 : 8));
    console.table(out);
    return out;
  },
};
