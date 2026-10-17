/* MM-1 "The force of a jet on an inclined plate" — paste into the dev console.
 *
 *   ?ex=MM-1 (or ?scene=vane), Resolution: Medium (367 x 259, dx = 0.0093 m).
 *
 * Nothing to draw: the plate is the scene's own polygon (solid "plate", wet
 * face "face"), its angle to the jet the `theta` param (Plate angle θ, geom0,
 * also on the card). The lecturer's spot-check and the record of how the
 * README's table was measured:
 *   APP.SIM.setParam("theta", deg)  = the slider
 *   APP.boxForce(...)               = the Control volume's F→, F↑ (raw integral)
 *   APP.SIM.lineFlux(...)           = a Flux line's Q and momentum flux
 *   APP.faceForce("plate", "face")  = the Pressure force tool on the wet face
 *   APP.tick(n)                     = n solver steps, flat out
 *
 *   MM1.jet()           -> q, U and ρqU from a section across the free jet
 *   MM1.sheets(th)      -> q₁, q₂ from a section across each sheet, 0.1 m past
 *                          each end of the plate, at right angles to it
 *   MM1.sweep()         -> F_x, F_z, F_n, F_t and q₁, q₂ at 90/75/60/45/30/20°
 *                          against ρqU sin θ and q(1 ± cos θ)/2
 */
window.MM1 = {
  BOX: [0.70, 0.30, 2.50, 2.10],             // the card's Control volume
  C: [1.60, 1.20], L: 0.80,                  // impact point, half the plate's length

  adv: function (T) { var t1 = APP.sim.t + T, n = 0; while (APP.sim.t < t1 && n++ < 1e6) APP.tick(20); },

  /** q = ∫u dz and the momentum flux ρ∫u² dz across the jet at x = 0.62 m. */
  jet: function () {
    var r = APP.SIM.lineFlux(0.62, 0.90, 0.62, 1.50);
    return { q: r.Q, U: r.Mx / (1000 * r.Q), rhoqU: r.Mx };
  },

  /** A section across each sheet, D = 0.1 m past each end, normal to the plate,
   *  from 0.03 m on the dry side to 0.16 m out on the wet side. */
  sheets: function (th) {
    var a = th * Math.PI / 180, tx = Math.cos(a), tz = -Math.sin(a), dx = Math.sin(a), dz = Math.cos(a);
    var one = function (s) {
      var px = MM1.C[0] + s * (MM1.L + 0.10) * tx, pz = MM1.C[1] + s * (MM1.L + 0.10) * tz;
      return Math.abs(APP.SIM.lineFlux(px + 0.03 * dx, pz + 0.03 * dz, px - 0.16 * dx, pz - 0.16 * dz).Q);
    };
    return { q1: one(1), q2: one(-1) };
  },

  /** Settle `settle` s at each angle, then average 3 s of raw integrals. */
  sweep: function (angles, settle) {
    angles = angles || [90, 75, 60, 45, 30, 20]; settle = settle || 8;
    var rows = [];
    angles.forEach(function (th) {
      APP.SIM.setParam("theta", th);
      MM1.adv(settle);
      var fx = 0, fz = 0, M = 0, q = 0, q1 = 0, q2 = 0, n = 0;
      for (var k = 0; k < 15; k++) {
        MM1.adv(0.2);
        var f = APP.boxForce.apply(null, MM1.BOX), j = MM1.jet(), s = MM1.sheets(th);
        fx += f.fx; fz += f.fz; M += j.rhoqU; q += j.q; q1 += s.q1; q2 += s.q2; n++;
      }
      fx /= n; fz /= n; M /= n; q /= n; q1 /= n; q2 /= n;
      var c = Math.cos(th * Math.PI / 180), sn = Math.sin(th * Math.PI / 180);
      rows.push({ theta: th, rhoqU: Math.round(M),
                  Fx: Math.round(fx), Fx_th: Math.round(M * sn * sn),
                  Fz: Math.round(fz), Fz_th: Math.round(M * sn * c),
                  Fn: Math.round(fx * sn + fz * c), Fn_th: Math.round(M * sn),
                  Ft: Math.round(fx * c - fz * sn),
                  q1: +q1.toFixed(3), q1_th: +(q * (1 + c) / 2).toFixed(3),
                  q2: +q2.toFixed(3), q2_th: +(q * (1 - c) / 2).toFixed(3) });
    });
    console.table(rows);
    return rows;
  },
};
