/* CR-1 "The contraction rig" — paste into the dev console.
 *
 *   ?ex=CR-1 (&tab=streamlines / continuity / forces; or ?scene=contraction), Resolution: Medium (746 x 127, dx = 0.0228 m).
 *
 * Nothing to draw: the scene's two polygons ARE the rig, and the one slider
 * (geom0, `taperL`) redraws them. This is the lecturer's spot-check: it reads
 * what the class reads by hand — Flux lines, the Control volume — through the
 * same integrals the tools call, averaged over a few seconds because a single
 * frame of a turbulent pipe wobbles by a few per cent.
 *
 *   APP.SIM.lineFlux(x0,z0,x1,z1)  = a Flux line drawn from (x0,z0) to (x1,z1)
 *   APP.boxFlux(x0,z0,x1,z1)       = the Control volume's budget; .fx = F→
 *   APP.SIM.setParam("taperL", L)  = the Contraction length slider (restarts the water)
 *
 *   CR.demo()          -> L = 3 m and L = 0, each settled, prints the table
 *   CR.read(5)         -> one 5 s averaged reading at the current L
 *   CR.friction(5)     -> the box on the straight narrow pipe
 */
window.CR = {
  X1: 4.3, X2: 9.0, X3: 10.6,            // section 1 (wide), section 2 (narrow), end of the straight box
  ZB: 0.3, ZT: 1.65,                     // box bottom / top: inside the pipe walls
  A1: 1.00, A2: 0.50, RHO: 1000,         // bore heights (m), per metre width

  run: function (s) { APP.tick(Math.round(s / APP.SIM.dt())); return +APP.sim.t.toFixed(2); },
  setL: function (L) { return APP.SIM.setParam("taperL", L); },

  /** reservoir levels from the hydrostatic pressure near each floor */
  levels: function () {
    var a = APP.probe(3.0, 0.3), b = APP.probe(14.0, 0.3);
    return { left: a.phead + 0.3, right: b.phead + 0.3 };
  },
  /** a section drawn UP across the bore at x: Q, momentum flux M, pressure force F */
  section: function (x) { return APP.SIM.lineFlux(x, 0.4, x, 1.6); },

  /** one instantaneous reading of everything */
  sample: function () {
    var s1 = CR.section(CR.X1), s2 = CR.section(CR.X2);
    var box = APP.boxFlux(CR.X1, CR.ZB, CR.X2, CR.ZT);
    var str = APP.boxFlux(CR.X2, CR.ZB, CR.X3, CR.ZT);
    var lv = CR.levels();
    return { Q1: s1.Q, Q2: s2.Q, M1: s1.Mx, M2: s2.Mx, F1: s1.Fpx, F2: s2.Fpx,
             sumQ: box.total.Q, inQ: box.inQ, R: box.fx,
             Rs: str.fx, Ms_in: -str.edges.left.Mx, Ms_out: str.edges.right.Mx,
             Fs_in: -str.edges.left.Fpx, Fs_out: str.edges.right.Fpx,
             hL: lv.left, hR: lv.right };
  },

  /** average `T` s of samples, one every 0.25 s */
  read: function (T) {
    var n = 0, acc = {};
    for (var t = 0; t < T; t += 0.25) {
      CR.run(0.25);
      var s = CR.sample();
      for (var k in s) acc[k] = (acc[k] || 0) + s[k];
      n++;
    }
    for (var k2 in acc) acc[k2] /= n;
    var r = acc, Q = r.Q1, U1 = Q / CR.A1, U2 = Q / CR.A2;
    // The formula, from the mean pressures on the two faces and U = Q/A
    // (Fp is the outward pressure force: −p₁A₁ on an upward-drawn section at
    // the inlet reads +, so p₁A₁ = F1 and p₂A₂ = F2 as both normals point +x).
    r.Rformula = r.F1 - r.F2 - CR.RHO * Q * (U2 - U1);
    r.p1 = r.F1 / CR.A1 / 9810; r.p2 = r.F2 / CR.A2 / 9810;     // mean pressure heads, m
    r.t = +APP.sim.t.toFixed(1); r.L = APP.SIM.params().values.taperL;
    var out = {};
    for (var k3 in r) out[k3] = +(+r[k3]).toFixed(4);
    return out;
  },

  /** the friction box: momentum in = out, so R_s = (p_in − p_out)A₂ = τ_w·2ΔL */
  friction: function (T) {
    var r = CR.read(T || 5), dL = CR.X3 - CR.X2;
    return { Min: r.Ms_in, Mout: r.Ms_out, Fin: r.Fs_in, Fout: r.Fs_out,
             R: r.Rs, tau_w: +(r.Rs / (2 * dL)).toFixed(2) };
  },

  /** u across the bore at x, one value per cell, bottom to top (one readback) —
   *  past the step the corner cells read ~0 or negative: the separation */
  profile: function (x) {
    var S = APP.SIM.get(), dx = S.dx, r = APP.SIM.rake(x), out = [];
    for (var j = Math.floor(0.45 / dx); j < Math.ceil(1.55 / dx); j++) {
      if (S.mask[j * S.nx + r.i] > 192) continue;
      out.push(+r.buf[j * 4].toFixed(2));
    }
    return out.join(" ");
  },

  /** the lowest pressure head anywhere in the bore, and where (one readback) */
  minP: function () {
    var S = APP.SIM.get(), dx = S.dx, m = 1e9, at = null, P = APP.SIM.patch(3.7, 11.0);
    for (var ii = 0; ii < P.w; ii++) {
      var i = P.i0 + ii;
      for (var j = Math.floor(0.45 / dx); j < Math.ceil(1.55 / dx); j++) {
        if (S.mask[j * S.nx + i] > 192) continue;
        var ph = P.buf[(j * P.w + ii) * 4 + 2] / 9.81;
        if (ph < m) { m = ph; at = [+((i + 0.5) * dx).toFixed(2), +((j + 0.5) * dx).toFixed(2)]; }
      }
    }
    return { phead: +m.toFixed(3), at: at };
  },

  demo: function () {
    var rows = [];
    [3, 0].forEach(function (L) {
      CR.setL(L);                       // restarts the water at t = 0
      CR.run(30);                       // the scene's spin-up, and then some
      var r = CR.read(5);
      r.minP = CR.minP().phead;
      r.fric = CR.friction(5);
      rows.push(r);
    });
    console.table(rows);
    return rows;
  },
};
