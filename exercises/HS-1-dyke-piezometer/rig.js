/* HS-1 "Three surfaces, one level" — paste into the dev console.
 *
 *   ?ex=HS-1 (or ?scene=dyke), Resolution: Medium (334 x 284, dx = 0.018 m).
 *
 * There is nothing to draw: the scene's three polygons ARE the rig. This is
 * the lecturer's spot-check — it prints the levels and face forces the class
 * reads by hand, opens the valve, lets the slosh die and prints them again,
 * through the same entry points the strip uses:
 *   APP.probe(x, z).phead + z         = the gauge's h
 *   APP.faceForce(solidId, faceId)    = the Pressure force tool's F, N per m
 *   toggleValve()                     = the V key
 *   APP.tick(n)                       = n solver steps, flat out
 *
 *   HS1.demo()   ->  prints the shut readings, opens the valve, runs 60 s,
 *                    prints the still readings and the volume balance.
 */
window.HS1 = {
  // The bench, in metres (js/scenes.js `dyke`)
  ZG: 1.00, ZR: 1.60, ZC: 4.30,          // ground top, culvert roof, crest
  XT: 2.40, ZT: 2.40, XS: 3.30,          // toe, top of the toe, slope meets crest
  S0: 4.30, S1: 4.50, X1: 5.20, W: 6.0,  // piezometer slot, downstream face, domain

  /** h at four stations: left basin, culvert under the tap, piezometer, right basin */
  levels: function () {
    var h = function (x, z) { var p = APP.probe(x, z); return +(p.phead + z).toFixed(3); };
    return { t: +APP.sim.t.toFixed(1), left: h(1.2, 1.3), culvert: h(4.4, 1.3),
             piezo: h(4.40, 2.2), right: h(5.6, 1.3) };
  },

  /** closed-form forces per metre width at levels etaL (upstream) and etaR */
  theory: function (etaL, etaR) {
    var g = Math.abs(APP.sim.p.g), rg = 1000 * g / 1000;          // kN/m³
    var dL = etaL - HS1.ZR, dR = etaR - HS1.ZR;
    // water standing on the slope: a triangle from the top of the toe to eta
    var rise = Math.min(etaL, HS1.ZC) - HS1.ZT, run = rise * (HS1.XS - HS1.XT) / (HS1.ZC - HS1.ZT);
    return { usH: +(0.5 * rg * dL * dL).toFixed(2), usV: +(rg * 0.5 * run * rise).toFixed(2),
             dsH: +(0.5 * rg * dR * dR).toFixed(2),
             roofL: +(rg * dL * (HS1.S0 - HS1.XT)).toFixed(2) };
  },

  /** F in kN/m on the named faces — Fx sideways, Fz up (negative = down) */
  forces: function () {
    var lv = HS1.levels();
    var F = function (sid, fid) { var r = APP.faceForce(sid, fid);
      return r ? { Fx: +(r.Fx / 1000).toFixed(2), Fz: +(r.Fz / 1000).toFixed(2), wet: +r.wetLen.toFixed(2) } : null; };
    return { upstream: F("dykeL", "us"), downstream: F("dykeR", "ds"),
             roofL: F("dykeL", "roof"), roofR: F("dykeR", "roof"), valve: F("valve0", "side0"),
             theory: HS1.theory(lv.left, lv.right) };
  },

  /** plan width of the LEFT water body at height z: basin + wedge over the slope + piezometer */
  widthL: function (z) {
    var w = z < HS1.ZT ? HS1.XT : HS1.XT + (z - HS1.ZT) * (HS1.XS - HS1.XT) / (HS1.ZC - HS1.ZT);
    return w + (z > HS1.ZR ? HS1.S1 - HS1.S0 : 0);
  },
  widthR: function () { return HS1.W - HS1.X1; },

  /** the common level the volume balance dictates, from the CURRENT basin levels */
  commonLevel: function () {
    var lv = HS1.levels(), dz = 0.001;
    var vol = function (etaL, etaR) { var v = 0;
      for (var z = HS1.ZR; z < etaL; z += dz) v += HS1.widthL(z) * dz;
      for (z = HS1.ZR; z < etaR; z += dz) v += HS1.widthR() * dz; return v; };
    var target = vol(lv.left, lv.right), lo = HS1.ZR, hi = HS1.ZC;
    for (var k = 0; k < 40; k++) { var mid = 0.5 * (lo + hi); if (vol(mid, mid) < target) lo = mid; else hi = mid; }
    return +(0.5 * (lo + hi)).toFixed(3);
  },

  /** advance `s` simulated seconds, solver only (no frames: nothing to log) */
  run: function (s) { APP.tick(Math.round(s / APP.SIM.dt())); return +APP.sim.t.toFixed(1); },

  /** total water mass, Σf over the whole domain, in the Control volume's own units.
   *  NOT APP.volume(): the column reduction stops at the first solid above the
   *  bed, so it never sees the wedge standing on the slope and appears to GAIN
   *  0.13 m² as that wedge shrinks. This integral is constant to four figures. */
  mass: function () {
    var S = APP.sim, b = APP.boxForce(0.01, 0.01, S.scene.W - 0.01, S.scene.H - 0.01);
    return +(b.mass * S.dx * S.dx).toFixed(3);
  },

  /** RMS speed over a basin — the "is it still yet" number */
  stillness: function () {
    var rms = function (x0, x1, z0, z1) { var s = 0, n = 0;
      for (var x = x0; x <= x1; x += (x1 - x0) / 6) for (var z = z0; z <= z1; z += (z1 - z0) / 6) {
        var q = APP.probe(x, z); if (q.f > 0.5) { s += q.speed * q.speed; n++; } }
      return n ? +Math.sqrt(s / n).toFixed(4) : 0; };
    return { left: rms(0.3, 2.2, 1.2, 3.5), right: rms(5.3, 5.9, 1.2, 2.9), culvert: rms(2.6, 4.9, 1.05, 1.55) };
  },

  demo: function () {
    if (APP.sim.p.valveClosed < 0.5) { console.warn("valve is already open — press R first"); return; }
    var out = { shut: { levels: HS1.levels(), forces: HS1.forces(), mass: HS1.mass() },
                predictedCommonLevel: HS1.commonLevel() };
    toggleValve();                                   // V
    HS1.run(60);                                     // under 1 cm/s by ~45 s, 5 mm/s by ~55 s
    out.still = { levels: HS1.levels(), forces: HS1.forces(), mass: HS1.mass(),
                  stillness: HS1.stillness() };
    console.table(out.shut.levels); console.table(out.still.levels);
    return out;
  },
};
/* Measured, Medium:  shut  left 4.01 culvert 4.01 piezo 4.01 right 3.11
 *                          upstream Fx 28.4 Fz -5.9 (28.2 / 5.9)  downstream Fx -11.2 (11.0)
 *                          roof uplift, upstream block 45.1 (44.7)           kN/m
 *                    still all four 3.82 (3.82 predicted)
 *                          upstream Fx 24.1 Fz -4.6  downstream Fx -24.2 (24.2 / 4.7)
 *                    basin RMS speed < 0.01 m/s from ~45 s; mass 3.800 -> 3.800        */
