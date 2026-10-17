/* FF-2 "Spillway with a ski-jump" — paste into the dev console.
 *
 *   ?ex=FF-2 (or ?scene=spillway), Resolution: Medium (647 x 147, dx = 0.068 m).
 *
 * Nothing to draw: the scene's two polygons (the ground, and the dam with
 * its ogee crest, face and flip bucket) ARE the rig. This is the lecturer's
 * spot-check of the numbers the brief quotes, through the same entry points
 * the strip uses:
 *   APP.SIM.lineFlux(x0,z0,x1,z1,avg) = the Flux line tool's integral (Q, m²/s)
 *   APP.probe(x, z) / APP.avg.probe   = the cursor readout, live / averaged
 *   APP.avg.set(true)                 = the A key
 *   APP.frames(n, dt)                 = n rendered frames (instruments and Average advance)
 *
 *   FF2.q()              ->  q through the crest and three pool sections, live
 *   FF2.profile(x)       ->  u(z) through the pool at x, live
 *   FF2.average(40)      ->  opens an Average window, runs 40 s, returns the
 *                            same sections and the x = 20 m profile from the mean
 */
window.FF2 = {
  SECTIONS: {
    crest: [7.42, 7.25, 7.42, 9.9],     // a vertical through the crest apex, up through the surface
    pool22: [22, 0.35, 22, 6],          // full-depth pool sections (the pool ends at x = 29 m since Oct 2026)
    pool25: [25, 0.35, 25, 6],
    pool28: [28.4, 0.35, 28.4, 6],      // 0.6 m short of the outflow edge
  },

  q: function (avg) {
    var out = { t: +APP.sim.t.toFixed(1) };
    for (var k in FF2.SECTIONS) {
      var s = FF2.SECTIONS[k];
      out[k] = +APP.SIM.lineFlux(s[0], s[1], s[2], s[3], !!avg).Q.toFixed(3);
    }
    return out;
  },

  /** u at 0.25 m steps from the pool floor (z = 0.4) to just under the surface */
  profile: function (x, avg) {
    var r = [];
    for (var z = 0.4; z <= 2.9; z += 0.25) {
      var p = avg ? APP.avg.probe(x, z) : APP.probe(x, z);
      r.push(+(avg ? p.ubar : p.u).toFixed(2));
    }
    return r.join(" ");
  },

  average: function (sec) {
    APP.avg.set(true);
    var t0 = APP.sim.t;
    while (APP.sim.t - t0 < sec) APP.frames(30, 0.05);
    var r = FF2.q(true);
    r.T = +APP.avg.T().toFixed(1);
    r.profile20 = FF2.profile(20, true);
    return r;
  },
};
