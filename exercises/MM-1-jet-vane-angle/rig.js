/* MM-1 "A jet turned through an angle" — paste into the dev console.
 *
 *   ?ex=MM-1 (or ?scene=vane), Resolution: Medium (345 x 276, dx = 0.0087 m).
 *
 * Nothing to draw: the vane is the scene's own polygon, its turning angle the
 * `theta` param (the Turning angle slider, geom0). The lecturer's spot-check
 * and the record of how the README's table was measured:
 *   APP.SIM.setParam("theta", deg)  = the slider
 *   APP.boxForce(...)               = the Control volume's F→, F↑ (raw integral)
 *   APP.probe(x, z)                 = hovering the jet
 *   APP.tick(n)                     = n solver steps, flat out
 *
 *   MM1.jet()            -> q, U and ρqU from a section across the free jet
 *   MM1.sweep()          -> F→, F↑ at 90/120/135/150/175° against
 *                           ρqU(1 − cos θ) and ρqU sin θ
 */
window.MM1 = {
  BOX: [0.95, 0.65, 1.90, 1.95],             // the card's Control volume

  adv: function (T) { var t1 = APP.sim.t + T, n = 0; while (APP.sim.t < t1 && n++ < 1e6) APP.tick(20); },

  /** q = ∫u dz and the momentum flux ∫u² dz across the jet at x = 0.85 m. */
  jet: function () {
    var q = 0, m = 0, dz = APP.sim.dx;
    for (var z = 1.35; z < 1.85; z += dz) {
      var p = APP.probe(0.85, z), f = Math.min(p.f, 1);
      if (p.u > 0) { q += f * p.u * dz; m += f * p.u * p.u * dz; }
    }
    return { q: q, U: m / q, rhoqU: 1000 * m };
  },

  /** Settle `settle` s at each angle, then average 3 s of raw box integrals. */
  sweep: function (angles, settle) {
    angles = angles || [90, 120, 135, 150, 175]; settle = settle || 4;
    var rows = [];
    angles.forEach(function (th) {
      APP.SIM.setParam("theta", th);
      MM1.adv(settle);
      var fx = 0, fz = 0, M = 0, n = 0;
      for (var k = 0; k < 30; k++) {
        MM1.adv(0.1);
        var f = APP.boxForce.apply(null, MM1.BOX);
        fx += f.fx; fz += f.fz; M += MM1.jet().rhoqU; n++;
      }
      fx /= n; fz /= n; M /= n;
      var c = Math.cos(th * Math.PI / 180), s = Math.sin(th * Math.PI / 180);
      rows.push({ theta: th, rhoqU: Math.round(M), Fx: Math.round(fx), Fx_pred: Math.round(M * (1 - c)),
                  Fz: Math.round(fz), Fz_pred: Math.round(M * s) });
    });
    console.table(rows);
    return rows;
  },
};
