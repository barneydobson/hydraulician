/* WV-5 "Group velocity" — paste into the dev console.
 *
 *   ?ex=WV-5 (or ?scene=wavetrain), Resolution: High (1762 x 99, dx = 6.2 mm).
 *
 * Nothing to draw: the flume, the hinged flap and the absorbing far end are
 * the scene's. This is the lecturer's spot-check and the record of how the
 * README's numbers were measured. It fires one train (what V does), steps
 * the solver flat out, and reads the free surface η(x, t) at 0.1 m stations
 * from the fill fraction itself — Σ f·Δx up each column — because the
 * column reduction's depth (what the gauges read) steps by whole cells and
 * hides most of a 0.14 m wave's shape.
 *
 *   WV5.theory()      -> linear theory: L, kh, c_p, c_g, and Biésel's H/S
 *   WV5.run(t)        -> fire a train, run t s (default 16), then print
 *                        H(x), c_p, c_g and c_g/c_p
 *   WV5.run(t, {flap: 0, amp: 0.03})    the same with a piston of equal H
 *
 * c_g: the time the envelope (the one-period Fourier amplitude at the paddle
 * frequency) peaks at each station 1.5–7 m, fitted against x. c_p: the
 * phase of that amplitude along x at fixed times, unwrapped and fitted; ω/k.
 * A run is ~90 000 solver steps at High: allow a few minutes.
 */
window.WV5 = {
  theory: function () {
    const w = APP.sim.p.wave;
    const r = APP.SIM.wavemakerHS(w.period, w.d, w.flap > 0.5, w.hinge);
    console.log("T = " + w.period + " s, depth " + w.d + " m: L = " + r.L.toFixed(3) + " m, kh = " +
      r.kh.toFixed(2) + ", c_p = " + r.cp.toFixed(3) + " m/s, c_g = " + r.cg.toFixed(3) +
      " m/s, c_g/c_p = " + (r.cg / r.cp).toFixed(3) + ", H/S = " + r.H_S.toFixed(3) +
      " -> H = " + (2 * w.amp * r.H_S).toFixed(3) + " m (" + (w.flap > 0.5 ? "flap" : "piston") + ")");
    return r;
  },

  eta: function () {
    const s = APP.sim, gl = document.querySelector("canvas").getContext("webgl2");
    const A = new Float32Array(s.nx * s.ny * 4), e = new Float64Array(s.nx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.F.read.fbo);
    gl.readPixels(0, 0, s.nx, s.ny, gl.RGBA, gl.FLOAT, A);
    for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
      const k = j * s.nx + i;
      if (s.mask[k] < 192) e[i] += A[4 * k] * s.dx;
    }
    return e;
  },

  run: function (t, wave) {
    const s = APP.sim;
    if (wave) Object.assign(s.p.wave, wave);
    APP.SIM.resetWater(); clearGaugeHistory();
    const r = WV5.theory(), T = s.p.wave.period, om = 2 * Math.PI / T;
    APP.SIM.fireTrain();
    const xs = []; for (let x = 0.3; x < 10.05; x += 0.1) xs.push(+x.toFixed(2));
    const ix = xs.map((x) => Math.round(x / s.dx - 0.5));
    const dtS = T / 20, per = Math.max(1, Math.round(dtS / APP.SIM.dt()));
    const ts = [], E = [];
    const e0 = WV5.eta();
    for (let k = 0; k < Math.round((t || 16) / dtS); k++) {
      APP.tick(per);
      const e = WV5.eta(); ts.push(s.t); E.push(ix.map((i) => e[i] - e0[i]));
    }
    const n = ts.length, w = 20, re = [], im = [];
    xs.forEach((x, m) => {
      re[m] = new Float64Array(n); im[m] = new Float64Array(n);
      for (let i = 0; i + w <= n; i++) {
        let a = 0, b = 0;
        for (let j = i; j < i + w; j++) { a += E[j][m] * Math.cos(om * ts[j]); b += E[j][m] * Math.sin(om * ts[j]); }
        re[m][i + w / 2] = 2 * a / w; im[m][i + w / 2] = 2 * b / w;
      }
    });
    const A = (m, i) => Math.hypot(re[m][i], im[m][i]);
    const fit = (X, Y) => { const N = X.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < N; i++) { sx += X[i]; sy += Y[i]; sxx += X[i] * X[i]; sxy += X[i] * Y[i]; }
      return (N * sxy - sx * sy) / (N * sxx - sx * sx); };
    const sel = xs.map((x, m) => m).filter((m) => xs[m] >= 1.5 && xs[m] <= 7);
    const tp = sel.map((m) => { let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, A(m, i));
      let a = 0, b = 0; for (let i = 0; i < n; i++) { const v = A(m, i) - 0.6 * mx; if (v > 0) { a += v; b += v * ts[i]; } }
      return b / a; });
    const cg = 1 / fit(sel.map((m) => xs[m]), tp);
    const ks = [];
    for (let i = 0; i < n; i += 2) {
      const mx = Math.max(...sel.map((m) => A(m, i)));
      const ok = sel.filter((m) => A(m, i) > 0.01 && A(m, i) > 0.5 * mx);
      if (ok.length < 8) continue;
      let prev = null; const ph = [], X = [];
      ok.forEach((m) => { let p = Math.atan2(im[m][i], re[m][i]);
        if (prev !== null) { while (p - prev > Math.PI) p -= 2 * Math.PI; while (p - prev < -Math.PI) p += 2 * Math.PI; }
        ph.push(p); X.push(xs[m]); prev = p; });
      ks.push(Math.abs(fit(X, ph)));
    }
    ks.sort((a, b) => a - b);
    const cp = om / ks[ks.length >> 1];
    console.table([0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => {
      const m = xs.indexOf(x); let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, A(m, i));
      return { "x (m)": x, "H (m)": +(2 * mx).toFixed(3) };
    }));
    console.log("measured: c_p = " + cp.toFixed(3) + " m/s, c_g = " + cg.toFixed(3) + " m/s, c_g/c_p = " +
      (cg / cp).toFixed(3) + "   (linear theory " + (r.cg / r.cp).toFixed(3) + ")");
    return { cp, cg, ratio: cg / cp };
  },
};
