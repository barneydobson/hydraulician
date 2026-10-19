/* FF-4 "A pipe jet into a still reservoir" — paste into the dev console.
 *
 *   ?ex=FF-4 (or ?scene=pipejet), Resolution: Medium (605 x 157, dx = 0.045 m).
 *
 * Nothing to draw: the scene's polygons (the ground, the header wall with
 * the pipe's lower and upper walls, and the end wall whose top is the crest)
 * ARE the rig. The lecturer's spot-check of the numbers the brief quotes:
 *   APP.SIM.lineFlux(x0,z0,x1,z1,avg) = the Flux line tool's integral (Q, m²/s)
 *   APP.probe(x, z) / APP.avg.probe   = the cursor readout, live / averaged
 *   APP.avg.set(true)                 = the A key
 *
 *   FF4.profiles()       ->  u(z) at the four rake stations, live
 *   FF4.q()              ->  q in the pipe, through the two jet-only sections and over the crest, live
 *   FF4.surface()        ->  the reservoir level and the velocity just under the surface along the tank
 *   FF4.average(60)      ->  opens an Average window, runs 60 s, returns all of it from the mean
 */
window.FF4 = {
  // [x, z0, z1, dz] — the pipe bore is z = 2.90–3.40 m, the axis z = 3.15 m
  STATIONS: [[3.5, 2.92, 3.38, 0.045], [10, 2.92, 3.38, 0.045],
             [12, 1.90, 4.40, 0.25], [14, 1.40, 4.90, 0.25]],
  SECTIONS: {
    pipe10: [10, 2.91, 10, 3.39],       // across the bore near the exit
    jet12: [12, 2.40, 12, 3.90],        // across the jet only, 1.5 m tall
    jet14: [14, 2.15, 14, 4.15],        // across the jet only, 2.0 m tall
    crest: [25, 5.56, 25, 7.00],        // over the end wall's crest: what leaves
  },
  SURFACE_X: [6, 9, 12, 14, 16, 18, 20, 22, 23.5],

  profiles: function (avg) {
    var out = {};
    FF4.STATIONS.forEach(function (s) {
      var r = [];
      for (var z = s[1]; z <= s[2] + 1e-6; z += s[3]) {
        var p = avg ? APP.avg.probe(s[0], z) : APP.probe(s[0], z);
        r.push(+(avg ? p.ubar : p.u).toFixed(2));
      }
      out["x" + s[0]] = r.join(" ");
    });
    return out;
  },

  q: function (avg) {
    var out = { t: +APP.sim.t.toFixed(1) };
    for (var k in FF4.SECTIONS) {
      var s = FF4.SECTIONS[k];
      out[k] = +APP.SIM.lineFlux(s[0], s[1], s[2], s[3], !!avg).Q.toFixed(3);
    }
    return out;
  },

  // The water surface at x (live fill > 0.5, scanned down from the lid), and
  // u 0.15 m under it: positive runs towards the end wall, negative back
  // towards the pipe.
  level: function (x) {
    for (var z = 6.95; z > 0.3; z -= 0.01) if (APP.probe(x, z).f > 0.5) return z;
    return 0;
  },
  surface: function (avg) {
    var lev = {}, u = {};
    FF4.SURFACE_X.forEach(function (x) {
      var l = FF4.level(x);
      lev[x] = +l.toFixed(2);
      var p = avg ? APP.avg.probe(x, l - 0.15) : APP.probe(x, l - 0.15);
      u[x] = +(avg ? p.ubar : p.u).toFixed(2);
    });
    return { level: lev, uSurface: u };
  },

  average: function (sec) {
    APP.avg.set(true);
    var t0 = APP.sim.t;
    while (APP.sim.t - t0 < sec) APP.frames(30, 0.05);
    return { T: +APP.avg.T().toFixed(1), q: FF4.q(true), profiles: FF4.profiles(true),
             surface: FF4.surface(true) };
  },
};
