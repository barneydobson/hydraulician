/* VC-2 "The tank that fills and leaks" — paste into the dev console.
 *
 *   ?ex=VC-2 (or ?scene=fillleak), Resolution: Medium (325 x 293, dx = 0.0123 m).
 *
 * Nothing to draw: the scene IS the rig. This is the lecturer's spot-check
 * and the record of how the README's numbers were measured, through the
 * same entry points the strip uses:
 *   APP.SIM.setParam("q_in", Q)        = the Inflow Q slider (geom0)
 *   APP.SIM.setValve(false)            = V, opening the outlet (open at boot since Oct 2026; V shuts it)
 *   APP.boxFlux(...) / APP.boxForce(...) = the Control volume's faces and contents
 *   APP.tick(n)                        = n solver steps, flat out
 *
 * The level is read as floor + (water in the tank) / S — the mean surface,
 * not one point on it, so the falling inflow's splash does not enter it.
 *
 *   VC2.fill(0.25)          -> valve shut: dh/dt against Q/S over 8 s
 *   VC2.settle(0.20, 60)    -> valve open: level, in, out every 2 s
 */
window.VC2 = {
  S: 2.00, ZF: 0.50, ZO: 0.59, A: 0.08,       // plan width, floor, orifice centre, orifice height
  BOX: [0.30, 0.40, 2.70, 3.12],              // the card's Control volume

  adv: function (T) { var t1 = APP.sim.t + T, n = 0; while (APP.sim.t < t1 && n++ < 1e6) APP.tick(20); },
  read: function () {
    var b = APP.boxFlux.apply(null, VC2.BOX), f = APP.boxForce(0.40, 0.50, 2.40, 3.00);
    return { t: +APP.sim.t.toFixed(1), level: +(VC2.ZF + f.vol / VC2.S).toFixed(3),
             qin: +(-b.edges.top.Q).toFixed(3), qout: +b.edges.right.Q.toFixed(3) };
  },

  fill: function (q) {
    APP.SIM.setParam("q_in", q); APP.SIM.resetWater(); APP.SIM.setValve(true);
    VC2.adv(2);
    var a = VC2.read(); VC2.adv(8); var b = VC2.read();
    var dhdt = (b.level - a.level) / (b.t - a.t);
    console.log("Q", q, " dh/dt", dhdt.toFixed(4), " Q/S", (q / VC2.S).toFixed(4),
                " measured inflow", b.qin);
    return dhdt;
  },

  settle: function (q, T) {
    APP.SIM.setParam("q_in", q); APP.SIM.setValve(false);
    var rows = [];
    for (var k = 0; k < T / 2; k++) { VC2.adv(2); rows.push(VC2.read()); }
    console.table(rows);
    var last = rows[rows.length - 1], h = last.level - VC2.ZO;
    console.log("settled level", last.level, " C_d = Q/(a√(2gh)) =",
                (q / (VC2.A * Math.sqrt(2 * 9.81 * h))).toFixed(3));
    return rows;
  },
};
