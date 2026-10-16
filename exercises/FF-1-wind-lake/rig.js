/* FF-1 "Wind over a lake" — paste into the dev console.
 *
 *   ?ex=FF-1 (or ?scene=lake), Resolution: Medium.
 *
 * There is nothing to draw: the scene's ground slab and the closed outer ring
 * ARE the rig, and the wind stress τ is the scene's one param ("tau", the
 * geom0 row). This is the lecturer's spot-check — it prints the readings the
 * class sees, through the same entry points the panel and the hover box use:
 *   APP.SIM.setParam("tau", v)        = the Wind stress τ slider (N/m²)
 *   APP.probe(x, z)                   = the hover box: u, w, phead (= p/ρg)
 *   0.115 + APP.probe(x, 0.115).phead = the piezometric level η over the bed
 *   APP.tick(n)                       = n solver steps, flat out
 *
 *   FF1.demo()   ->  rest readings, then τ = +20 for 40 s, −20 for 40 s,
 *                    0 for 60 s, printing surface / mid-depth / near-bed u at
 *                    mid-tank and the set-up η_right − η_left as it goes.
 *   FF1.small(1) ->  τ = 1 N/m² for 20 s from rest: the water moves anyway.
 *
 * At Medium a simulated second is ~5600 substeps; on a shared GPU the demo
 * takes minutes of wall clock. Run it in pieces (FF1.run(5)) if the tab
 * complains.
 */
window.FF1 = {
  ZB: 0.10, ETA: 0.40, W: 6.0,              // bed top, still level, length (js/scenes.js `lake`)

  /** what the hover box would read at mid-tank, and the set-up across the tank */
  read: function () {
    var P = APP.probe, eta = function (x) { return 0.115 + P(x, 0.115).phead; };
    var r = { t: +APP.sim.t.toFixed(1), tau: APP.SIM.windTau(),
              uSurf: +P(3.0, 0.385).u.toFixed(3),      // top 2 cells
              uMid: +P(3.0, 0.25).u.toFixed(3),
              uBed: +P(3.0, 0.13).u.toFixed(3),        // 3 cells above the bed
              etaL: +eta(0.2).toFixed(4), etaR: +eta(5.8).toFixed(4) };
    r.setup = +(r.etaR - r.etaL).toFixed(4);
    var vmax = 0;
    for (var x = 0.3; x < 5.8; x += 0.5) for (var z = 0.13; z < 0.39; z += 0.04) {
      var q = P(x, z); vmax = Math.max(vmax, Math.hypot(q.u, q.w)); }
    r.speedMax = +vmax.toFixed(4);
    return r;
  },

  /** rest check: u = 0 and p/ρg = η − z down a column */
  rest: function () {
    var rows = [];
    [0.38, 0.30, 0.20, 0.12].forEach(function (z) {
      var q = APP.probe(3.0, z);
      rows.push({ z: z, u: +q.u.toFixed(4), phead: +q.phead.toFixed(4), etaMinusZ: +(FF1.ETA - z).toFixed(4) });
    });
    return rows;
  },

  run: function (s) { APP.tick(Math.round(s / APP.SIM.dt())); return +APP.sim.t.toFixed(1); },

  /** hold τ for `secs`, printing every `every` seconds */
  hold: function (tau, secs, every) {
    APP.SIM.setParam("tau", tau);
    var out = [];
    for (var t = every; t <= secs + 1e-9; t += every) { FF1.run(every); out.push(FF1.read()); }
    console.table(out);
    return out;
  },

  demo: function () {
    console.table(FF1.rest());
    return { up: FF1.hold(20, 40, 5), back: FF1.hold(-20, 40, 5), calm: FF1.hold(0, 60, 10) };
  },

  small: function (tau) { return FF1.hold(tau === undefined ? 1 : tau, 20, 5); },
};
/* Measured, Medium (844 x 113, dx = 7.1 mm), u at x = 3 m:
 *   rest            speedMax < 0.5 mm/s, setup 0.0 mm
 *   tau +20, 5 s    uSurf +0.19 uMid -0.10 uBed -0.11  setup 6.2 cm (overshoot)
 *   tau +20, 40 s   uSurf +0.24 uBed -0.08              setup 4.9 cm
 *   tau -20, 40 s   uSurf -0.24 uBed +0.08              setup -4.9 cm
 *   tau 0, 60 s     uMid < 2 mm/s, speedMax 1.2 cm/s (residual seiche)
 *   tau +1, 15 s    uSurf +0.03 uBed -0.003             setup within +-5 mm slosh
 * Full table in the README's instructor section. */
