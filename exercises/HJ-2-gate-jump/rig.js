/* HJ-2 "Sluice gate with the movable weir" (the flume lab at full scale) — paste
 * into the dev console.
 *
 *   ?ex=HJ-2 (or ?scene=gatejump), Resolution: Medium (592 x 161, dx = 0.0236 m).
 *
 * There is nothing to draw: the scene's gate and weir ARE the rig, and both
 * are Geometry sliders (gate_a, weir_h). This is the lecturer's spot-check —
 * it prints the depths at ten stations as the lab sheet lays them out, the
 * discharge, the jump the overlay finds, the head loss across it and the
 * force on the gate, through the same entry points the strip uses:
 *   APP.SIM.columns(true)             = the hover card's depth, per column
 *   APP.probe(x, z)                   = u, w, p/ρ, f at a point
 *   APP.faceForce("gate", "us")       = the Pressure force tool's F, N per m
 *   APP.OVERLAY.findJumps(...)        = the orange jump box
 *   APP.SIM.setParam("weir_h", h)     = the Weir crest height slider
 *   APP.tick(n)                       = n solver steps, flat out
 *
 *   HJ2.table()          -> the ten stations: d, V, Fr, E
 *   HJ2.jump()           -> d₁, d₂, Fr₁, Bélanger's d₂ and ΔE, from the box
 *   HJ2.gate()           -> F on the gate: diagram (face) and C_d
 *   HJ2.weir(h, t)       -> set the crest to h, run t s, print table + jump
 *   HJ2.demo()           -> settle, then everything above at the shipped crest (0.48 m)
 *   HJ2.phead()          -> p/ρg against the hydrostatic value, pool vs just upstream of the gate
 */
window.HJ2 = {
  GATE_X: 4.0, BED: 0.30, WEIR_X: 11.0, W: 14,   // the bench, in metres (js/scenes.js `gatejump`); the flap is hinged at WEIR_X
  // ten stations as distances from the gate: two in the pool, five on the
  // sheet and through the jump, three in the reach the weir holds
  STATIONS: [-2.5, -1.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0],

  cols: function () { return APP.SIM.columns(true); },
  /** depth at x from the column reduction */
  d: function (x, c) { c = c || HJ2.cols(); const s = APP.sim; const i = Math.min(s.nx - 1, Math.max(0, Math.round(x / s.dx - 0.5))); return c[i * 4 + 1]; },
  /** unit discharge, averaged over the reach 9–10.8 m between the jump and the flap hinge */
  q: function (c) { c = c || HJ2.cols(); const s = APP.sim; let q = 0, n = 0;
    for (let i = Math.round(9.0 / s.dx); i < Math.round(10.8 / s.dx); i++) { q += c[i * 4 + 2]; n++; } return q / n; },

  /** the lab's table: x from the gate, depth, V = q/d, Fr, E = d + V²/2g */
  table: function () {
    const c = HJ2.cols(), q = HJ2.q(c), g = 9.81, dc = Math.pow(q * q / g, 1 / 3);
    console.log("t = " + APP.sim.t.toFixed(0) + " s   q = " + q.toFixed(3) + " m²/s   d_c = " + dc.toFixed(3) + " m");
    const rows = HJ2.STATIONS.map(function (xr) {
      const d = HJ2.d(HJ2.GATE_X + xr, c), V = q / d;
      return { "x from gate (m)": xr, "d (m)": +d.toFixed(3), "V (m/s)": +V.toFixed(2),
               "Fr": +(V / Math.sqrt(g * d)).toFixed(2), "E (m)": +(d + V * V / (2 * g)).toFixed(3) };
    });
    console.table(rows);
    return rows;
  },

  /** the jump box, as the overlay finds it, with Bélanger beside it */
  jump: function () {
    const s = APP.sim, c = HJ2.cols();
    const A = APP.OVERLAY.analyse(s, c), J = APP.OVERLAY.findJumps(A, s);
    if (!J.length) { console.log("no jump box this frame — the box needs Fr₁ > 1.35 and a 1.6× rise; hover the reach instead"); return null; }
    const j = J[0];
    const out = { x0: +j.x0.toFixed(2), x1: +j.x1.toFixed(2), d1: +j.d1.toFixed(3), d2: +j.d2.toFixed(3), Fr1: +j.Fr1.toFixed(2),
                  d2_belanger: +j.d2p.toFixed(3), dE: +j.dE.toFixed(3) };
    console.log(JSON.stringify(out));
    return out;
  },

  /** force on the gate: the diagram off the upstream face, and C_d from the pool */
  gate: function () {
    const F = APP.faceForce("gate", "us"), c = HJ2.cols(), q = HJ2.q(c);
    const a = APP.SIM.params().values.gate_a, d0 = HJ2.d(2.5, c);
    const B = APP.boxForce(2.5, 0.10, 6.0, 3.70);   // the card's control volume
    const out = { F_kN_per_m: +(F.Fx / 1000).toFixed(2), F_cv_kN_per_m: +(B.fx / 1000).toFixed(2), cop_z: F.cop && +F.cop.z.toFixed(2), wet_m: +F.wetLen.toFixed(2),
                  d0: +d0.toFixed(3), a: a, Cd: +(q / (a * Math.sqrt(2 * 9.81 * d0))).toFixed(3),
                  hydrostatic_kN_per_m: +(0.5 * 9.81 * (d0 - a) * (d0 - a)).toFixed(2) };
    console.log(JSON.stringify(out));
    return out;
  },

  /** p/ρg at three heights over the bed: in the pool (x = 2.5) it is the
   *  depth below the surface; 0.1 m upstream of the plate it falls short */
  phead: function () {
    const c = HJ2.cols(), eta = HJ2.BED + HJ2.d(2.5, c);
    const rows = [];
    [2.5, HJ2.GATE_X - 0.1].forEach(function (x) {
      [0.05, 0.15, 0.25].forEach(function (h) {
        const z = HJ2.BED + h, p = APP.probe(x, z);
        rows.push({ "x (m)": x, "z (m)": +z.toFixed(2), "p/ρg (m)": +p.phead.toFixed(3), "η − z (m)": +(eta - z).toFixed(3) });
      });
    });
    console.table(rows);
    return rows;
  },

  /** set the weir crest and let the reach answer */
  weir: function (h, t) {
    APP.SIM.setParam("weir_h", h); syncPanel();
    APP.tick(Math.round((t || 60) / APP.SIM.dt()));
    console.log("weir crest " + h.toFixed(2) + " m, after " + (t || 60) + " s:");
    HJ2.table(); return HJ2.jump();
  },

  demo: function () {
    APP.tick(Math.round(Math.max(0, 60 - APP.sim.t) / APP.SIM.dt()));
    HJ2.table(); HJ2.jump(); HJ2.phead(); return HJ2.gate();
  },
};
