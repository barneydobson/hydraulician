/* PF-2 "The wall's shape doesn't matter" — paste into the dev console.
 *
 *   ?ex=PF-2 (or ?scene=wall-shape), Resolution: Medium.
 *
 * Nothing to draw: the scene's polygon IS the rig. This is the lecturer's
 * spot-check — it sets the Wall shape slider, lets the restarted still water
 * run a few seconds, and reads the wall through the same entry points the
 * strip uses:
 *   SIM.setParam("shape", s)          = the Wall shape slider (restarts the water)
 *   APP.faceForce("tank", "wall")     = the Pressure force tool's F, N per m
 *   APP.tick(n)                       = n solver steps, flat out
 *
 *   PF2.table()  ->  F_h and F_v at s = 0, 0.25, 0.5, 0.75, 1 against ½ρg·d²
 *                    and the weight of the water above the wall
 *   PF2.block()  ->  the net force on the submerged block against ρg × area
 */
window.PF2 = {
  ZB: 0.30, ETA: 1.90,                    // bed and still surface (js/scenes.js `wall-shape`)

  /** the wall's face vertices, foot first, from the live solid */
  face: function () {
    var so = APP.sim.solids.find(function (s) { return s.id === "tank"; });
    var es = GEOM.faceEdges(so, "wall"), pts = [];
    es.forEach(function (e) { pts.push(so.verts[e]); });
    pts.push(so.verts[(es[es.length - 1] + 1) % so.verts.length]);
    return pts.reverse();                 // the face is wound top-down; foot first
  },

  /** closed form, kN/m: F_h = ½ρg d², F_v = ρg ∫ (η − z) dx along the wetted
   *  face from the foot to the surface — the signed area between the wall and
   *  the surface, positive (down) where water stands on the wall, negative
   *  (up) under an overhang */
  theory: function () {
    var g = Math.abs(APP.sim.p.g), d = PF2.ETA - PF2.ZB, f = PF2.face(), A = 0;
    for (var i = 0; i + 1 < f.length; i++) {
      var x0 = f[i][0], z0 = f[i][1], x1 = f[i + 1][0], z1 = f[i + 1][1];
      if (z0 >= PF2.ETA) break;
      if (z1 > PF2.ETA) { x1 = x0 + (x1 - x0) * (PF2.ETA - z0) / (z1 - z0); z1 = PF2.ETA; }
      A += (x1 - x0) * (PF2.ETA - 0.5 * (z0 + z1));    // trapezium of water over this edge
    }
    return { Fh: +(0.5 * g * d * d).toFixed(2), Fv: +(g * A).toFixed(2), area: +A.toFixed(3) };
  },

  /** measured, kN/m: Fx (positive = pushes the wall right), Fz (positive = up) */
  measure: function (sid, fid) {
    var r = APP.faceForce(sid || "tank", fid || "wall");
    return { Fh: +(r.Fx / 1000).toFixed(2), Fv: +(-r.Fz / 1000).toFixed(2), wet: +r.wetLen.toFixed(2) };
  },

  /** set the slider, run `s` seconds of still water, read the wall */
  at: function (shape, s) {
    SIM.setParam("shape", shape);
    APP.tick(Math.round((s || 3) / APP.SIM.dt()));
    return { shape: shape, t: +APP.sim.t.toFixed(1), measured: PF2.measure(), theory: PF2.theory() };
  },

  table: function () {
    var rows = [0, 0.25, 0.5, 0.75, 0.875, 1].map(function (s) {
      var r = PF2.at(s, 3);
      return { shape: s, Fh: r.measured.Fh, Fh_theory: r.theory.Fh,
               Fv_down: r.measured.Fv, Fv_theory: r.theory.Fv };
    });
    console.table(rows);
    return rows;
  },

  block: function () {
    SIM.setParam("block", 1);
    APP.tick(Math.round(3 / APP.SIM.dt()));
    var r = APP.faceForce("block", "all"), g = Math.abs(APP.sim.p.g);
    return { Fx: +(r.Fx / 1000).toFixed(2), Fz_up: +(r.Fz / 1000).toFixed(2),
             theory_up: +(g * 0.25).toFixed(2) };
  },
};
/* Measured, Medium: see the table in README.md (For the instructor). */
