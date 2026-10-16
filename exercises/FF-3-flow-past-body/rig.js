/* FF-3 "Flow past a body" — paste into the dev console.
 *
 *   ?ex=FF-3 (or ?scene=body), Resolution: Medium (dx = 14.7 mm).
 *
 * Nothing to draw: the scene's one polygon IS the rig, and its shape is the
 * Geometry slider `shape` (0 = slender ellipse, 1 = square). This is the
 * lecturer's spot-check of the numbers in the README, through the same entry
 * points the panel uses:
 *   APP.SIM.setParam("shape", s)   = the Geometry slider
 *   APP.probe(x, z).w              = the cross-stream velocity (plan view: z is across)
 *   APP.avg.set(true) / APP.avg.probe(x, z)  = the A key and its mean
 *
 *   FF3.wake(s, T)   ->  restarts the stream past shape s, runs T s of sim
 *                        time and prints the RMS cross-stream velocity 0.6 m
 *                        behind the body and the shedding period from its
 *                        zero crossings (over the last 40 % of the run).
 *   FF3.mean(T)      ->  switches Average on, runs T s more and prints the
 *                        mean streamwise velocity at mirror points either
 *                        side of the centreline — a symmetric mean wake
 *                        reads the same pair twice.
 *
 * Each FF3.wake(…, 40) costs a few minutes of wall clock at Medium.
 */
window.FF3 = {
  XC: 1.9, ZC: 1.7, U: 0.9,              // body centre, free-stream speed (js/scenes.js `body`)

  geom: function (s) { return APP.state.scene.shape(s, "width"); },

  wake: function (s, T) {
    T = T || 40;
    APP.SIM.setParam("shape", s);
    APP.SIM.resetWater();
    var g = FF3.geom(s), xp = FF3.XC + g.a + 0.6, ts = [], ws = [];
    while (APP.sim.t < T) {
      var t1 = APP.sim.t;
      while (APP.sim.t < t1 + 0.1) APP.tick(20);
      ts.push(APP.sim.t); ws.push(APP.probe(xp, FF3.ZC).w);
    }
    var k0 = Math.floor(ws.length * 0.6), seg = ws.slice(k0), tt = ts.slice(k0);
    var m = seg.reduce(function (a, b) { return a + b; }, 0) / seg.length;
    var rms = Math.sqrt(seg.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / seg.length);
    var cr = [];
    for (var i = 1; i < seg.length; i++) if (seg[i - 1] - m < 0 && seg[i] - m >= 0) cr.push(tt[i]);
    var P = cr.length > 1 ? (cr[cr.length - 1] - cr[0]) / (cr.length - 1) : NaN;
    var out = { s: s, n: +g.n.toFixed(2), aspect: +(g.a / g.b).toFixed(2), D: +(2 * g.b).toFixed(3),
                rms_w: +rms.toFixed(3), period: rms > 0.02 ? +P.toFixed(2) : null,
                St: rms > 0.02 ? +(2 * g.b / (FF3.U * P)).toFixed(3) : null };
    console.log(out);
    return out;
  },

  mean: function (T) {
    T = T || 30;
    APP.avg.set(true);
    var t0 = APP.sim.t;
    while (APP.sim.t < t0 + T) APP.frames(1, 0.25);
    var g = FF3.geom(APP.SIM.params().values.shape), rows = [];
    [0.2, 0.5, 1.0].forEach(function (dx) {
      [0.1, 0.2, 0.3].forEach(function (dz) {
        var a = APP.avg.probe(FF3.XC + g.a + dx, FF3.ZC + dz), b = APP.avg.probe(FF3.XC + g.a + dx, FF3.ZC - dz);
        rows.push({ dx: dx, dz: dz, u_left: +a.ubar.toFixed(3), u_right: +b.ubar.toFixed(3),
                    w_left: +a.wbar.toFixed(3), w_right: +b.wbar.toFixed(3) });
      });
    });
    console.table(rows);
    return { T: APP.avg.T(), rows: rows };
  },
};
