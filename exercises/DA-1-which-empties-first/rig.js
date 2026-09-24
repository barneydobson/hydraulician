/* ============================================================================
 * DA-1 · WHICH TANK EMPTIES FIRST? — console spot-check
 * ----------------------------------------------------------------------------
 * The demo is DA-2's rig at its default L_r = ¼, so the check is DA-2's. Paste
 * exercises/DA-2-time-scales/rig.js first, then this file, then:
 *
 *     await DA1.run()        // → { T_p: 4.056, T_m: 1.840, ratio: 0.454 }
 *
 * Measured at Medium, headless: the prototype falls from d = 2.50 to 1.00 m
 * in 4.06 s, the quarter-scale model from 0.625 to 0.25 m in 1.84 s. The
 * ratio 0.454 is √¼ = 0.5 less 9%: the small tank drains a little faster than
 * Froude alone predicts (DA-2 measures that scale effect across L_r).
 * ==========================================================================*/
window.DA1 = {
  run: async function () {
    var r = await DA2.run(0.25);
    await APP.pickExercise("DA-1"); await APP.EX.ready;   // back to the demo card, L_r = ¼
    return { T_p: r.T_p, T_m: r.T_m, ratio: +(r.T_m / r.T_p).toFixed(3), froude: 0.5 };
  },
};
