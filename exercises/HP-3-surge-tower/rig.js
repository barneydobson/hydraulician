/* HP-3 · Design the surge shaft — paste into the dev console on ?scene=hydro.
 *
 *   HP3.setup(3.0)            the class rig at a shaft width (Resolution Medium)
 *   HP3.steady()              u₀, the two levels and y₀ — the pre-slam readings
 *   HP3.slam(50)              slam the valve, record 50 s of the shaft trace,
 *                             reduce it to y_max and T
 *   HP3.student(3.0)          one whole run → the row a student submits
 *   HP3.predict(r)            the rigid-column prediction from those readings
 *
 * The rig is the scene itself: nothing is drawn. The shaft width is a
 * Geometry slider (d_shaft), so a student's personalisation is a number, not
 * a redraw. Everything below is a documented app entry point:
 *   SIM.setParam(key, v)      the Geometry sliders      SIM.columns(true)  bed/d/q/surface per column
 *   OVERLAY.analyse(...)      the hover readout's V     toggleValve()      the V key
 *   APP.frames(1, dt)         advance speed·dt seconds and fill the gauge logs
 */
(function () {
  var G = (typeof window !== "undefined") ? window : this;

  G.HP3 = {
    XRES: 6.6,       // reservoir gauge station: the free strip between the sponge and the wall
    ZRES: 20.0,
    XH1: 22.0,       // two headrace stations for the Darcy loss, h₁ − h₂ over 22 m —
    XH2: 44.0,       // past the entry vena's recovery (x ≈ 22) and short of the shaft
    XMID: 27.0,      // mid-headrace: u₀ is hovered here
    ZSH: 18.0,       // shaft gauge elevation — below the deepest downsurge, above the soffit
    XVALVE: 62.5,    // a probe just upstream of the valve, for the Joukowsky pulse
    GEOM: null,      // the delivered geometry, filled by setup()

    // --- build ------------------------------------------------------------
    setup: function (Ds, opts) {
      opts = opts || {};
      if (!APP.sim || APP.sim.scene.id !== "hydro") APP.loadScene("hydro", false);
      var bud = CONTROLS.find(function (c) { return c.id === "budget"; });
      if (APP.state.budget !== (opts.budget || "Medium")) bud.set(opts.budget || "Medium");
      var par = Object.assign({ d_shaft: Ds }, opts.params || {});
      Object.keys(par).forEach(function (k) { APP.SIM.setParam(k, par[k]); });
      if (opts.cf !== undefined) CONTROLS.find(function (c) { return c.id === "cf"; }).set(opts.cf);
      if (opts.cs !== undefined) CONTROLS.find(function (c) { return c.id === "cs"; }).set(opts.cs);
      if (opts.level !== undefined) CONTROLS.find(function (c) { return c.id === "inLevel"; }).set(opts.level);
      APP.SIM.setValve(0);                          // open, as the scene boots
      APP.SIM.resetWater();                         // R
      APP.state.speed = 1;
      APP.state.gaugeField = "h";
      APP.state.gauges.length = 0;
      var g = APP.sim.scene.geom(APP.SIM.params().values);
      APP.state.gauges.push({ x: this.XRES, z: this.ZRES, hist: [], log: [], id: 1, colour: "#7fd4ff" });
      APP.state.gauges.push({ x: g.xk, z: this.ZSH, hist: [], log: [], id: 2, colour: "#ffd27f" });
      syncPanel();
      this.GEOM = g;
      return this.check();
    },

    // --- the delivered geometry in cells --------------------------------
    // The shaft's clear width at ZSH, the headrace bore mid-length, the
    // nozzle's open cells: what the raster actually built, not what was asked.
    widthAt: function (x, z) {
      var s = APP.sim, dx = s.dx, j = Math.round(z / dx - 0.5), i = Math.round(x / dx - 0.5);
      if (s.mask[j * s.nx + i] !== 0) return { n: 0, w: 0 };
      var lo = i, hi = i;
      while (lo > 0 && s.mask[j * s.nx + lo - 1] === 0) lo--;
      while (hi < s.nx - 1 && s.mask[j * s.nx + hi + 1] === 0) hi++;
      return { n: hi - lo + 1, w: +((hi - lo + 1) * dx).toFixed(4), x0: +(lo * dx).toFixed(3), x1: +((hi + 1) * dx).toFixed(3) };
    },
    heightAt: function (x, z) {
      var s = APP.sim, dx = s.dx, j = Math.round(z / dx - 0.5), i = Math.round(x / dx - 0.5);
      if (s.mask[j * s.nx + i] !== 0) return { n: 0, h: 0 };
      var lo = j, hi = j;
      while (lo > 0 && s.mask[(lo - 1) * s.nx + i] === 0) lo--;
      while (hi < s.ny - 1 && s.mask[(hi + 1) * s.nx + i] === 0) hi++;
      return { n: hi - lo + 1, h: +((hi - lo + 1) * dx).toFixed(4), z0: +(lo * dx).toFixed(3), z1: +((hi + 1) * dx).toFixed(3) };
    },
    check: function () {
      var g = this.GEOM;
      return { dx: +APP.sim.dx.toFixed(4), Ds: g.Ds, shaft: this.widthAt(g.xk, this.ZSH),
               headrace: this.heightAt(this.XMID, g.zk), penstock: this.heightAt(62.0, 3.0),
               nozzle: this.heightAt(65.0, 3.0) };
    },

    // --- readings ---------------------------------------------------------
    /** The free surface in a column, to sub-cell accuracy: the fill summed up
     *  the column from a cell well under the surface (min(f,1)·dx per cell),
     *  which is the mass-conserving surface the column reduction quantises
     *  to whole cells (its `top` is the last cell with f > 0.5). Used for the
     *  slam trace; a student reads the same thing off the d trace, in steps
     *  of one cell. */
    surfaceAt: function (x, zFrom) {
      var s = APP.sim, dx = s.dx, i = Math.floor(x / dx), j0 = Math.floor(zFrom / dx), z = j0 * dx;
      for (var j = j0; j < s.ny - 1; j++) {
        var p = APP.probe((i + 0.5) * dx, (j + 0.5) * dx);
        if (p.solid) break;
        if (p.f <= 0.02) break;
        z += Math.min(p.f, 1) * dx;
      }
      return z;
    },
    /** Piezometric heads, z + p/ρg — what a gauge on h reads: exact in still
     *  water (the reservoir strip, the shaft before the slam, the headrace
     *  axis), biased by a·D/g under an accelerating column (the shaft mid-
     *  surge, see the README). `shaft` is the sub-cell free surface. */
    levels: function () {
      var s = APP.sim, g = this.GEOM, z = 20.0;
      var hr = APP.probe(this.XRES, z).phead + z, hs = APP.probe(g.xk, z).phead + z;
      var h1 = APP.probe(this.XH1, g.zk).phead + g.zk, h2 = APP.probe(this.XH2, g.zk).phead + g.zk;
      return { res: hr, shaftH: hs, shaft: this.surfaceAt(g.xk, 16.0), h1: h1, h2: h2, t: s.t };
    },
    /** Warm the analyse EMA exactly as the overlay does, then read the
     *  bore-mean velocity mid-headrace — the hover readout's V. */
    // analyse() carries a 10 %/call EMA that PERSISTS between calls — after a
    // tick-only settle it still remembers the previous run's slam (a reversed
    // flow read 1.5 m/s low here). 40 calls leave 1.5 % of that memory.
    A: function () {
      var A; APP.state.paused = false; APP.frames(20);
      for (var i = 0; i < 40; i++) A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
      return A;
    },
    /** The pre-slam readings, each a 10 s time-mean at 10 Hz — what a student
     *  reads as the centre of a gauge trace (or off the gauges with Average
     *  on): the shaft wobbles ±0.1 m and the headrace heads ±0.3 m frame to
     *  frame, against a 0.3 m drawdown and a 0.04 m friction drop. */
    steady: function (secs) {
      var s = APP.sim, i = Math.floor(this.XMID / s.dx), n = Math.round((secs || 10) * 10);
      var acc = { u0: 0, q: 0, res: 0, shaft: 0, shaftH: 0, h1: 0, h2: 0, pv: 0 }, k;
      APP.state.paused = false; this.A();
      for (k = 0; k < n; k++) {
        APP.frames(1, 0.1);
        var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true)), L = this.levels();
        acc.u0 += A.V[i]; acc.q += A.q[i]; acc.res += L.res; acc.shaft += L.shaft; acc.shaftH += L.shaftH;
        acc.h1 += L.h1; acc.h2 += L.h2; acc.pv += APP.probe(this.XVALVE, 3.0).phead;
      }
      for (k in acc) acc[k] = acc[k] / n;
      return { t: +s.t.toFixed(1), u0: +acc.u0.toFixed(3), q: +acc.q.toFixed(3), d: +A.d[i].toFixed(3),
               res: +acc.res.toFixed(3), shaft: +acc.shaft.toFixed(3), shaftH: +acc.shaftH.toFixed(3),
               y0: +(acc.res - acc.shaftH).toFixed(3),
               h1: +acc.h1.toFixed(3), h2: +acc.h2.toFixed(3), hf: +(acc.h1 - acc.h2).toFixed(3),
               pheadValve: +acc.pv.toFixed(2) };
    },

    /** The shaft and reservoir levels every `step` seconds up to T — the
     *  envelope of the spin-up transient, for measuring the settle time. */
    trace: function (T, step, ms) {
      var t0 = Date.now(), out = []; APP.state.paused = false;
      while (APP.sim.t < T && Date.now() - t0 < (ms || 45000)) {
        var tt = APP.sim.t + (step || 0.5);
        while (APP.sim.t < tt) APP.tick(40);
        var L = this.levels(); out.push([+L.t.toFixed(2), +L.shaft.toFixed(3), +L.res.toFixed(3)]);
      }
      return out;
    },
    /** Piezometric head across the reservoir compartment and at the mouth,
     *  against the slider and the panel's delivered level. */
    resProfile: function () {
      var xs = [0.5, 2.0, 4.0, 5.5, 6.6, 7.5, 9.0, 12.0], out = {};
      xs.forEach(function (x) { var p = APP.probe(x, 14.0); out["h@" + x] = +(p.phead + 14.0).toFixed(3); });
      out.slider = APP.sim.p.inflow.level; out.deliv = APP.state.deliv ? +APP.state.deliv.level.toFixed(3) : null;
      var C = APP.SIM.columns(true), s = APP.sim;
      out.colSurf6_6 = +C[Math.floor(6.6 / s.dx) * 4 + 3].toFixed(3);
      out.surf6_6 = +this.surfaceAt(6.6, 16.0).toFixed(3);
      return out;
    },

    settle: function (T, ms) {
      var t0 = Date.now(); APP.state.paused = false;
      while (APP.sim.t < T && Date.now() - t0 < (ms || 40000)) APP.tick(300);
      return APP.sim.t;
    },

    // --- the slam ---------------------------------------------------------
    /** Shut the valve and record the two surfaces (and the valve pressure
     *  head) at `hz` samples per second for `rec` seconds. The trace is
     *  reduced to the first crest above the pre-slam reservoir level and the
     *  period from the first two crests. */
    slam: function (rec, hz) {
      rec = rec || 50; hz = hz || 10;
      var dt = 1 / hz, k, tr = [];
      APP.state.paused = false; APP.state.speed = 1;
      // a short pre-roll so the trace shows the level it starts from
      for (k = 0; k < 3 * hz; k++) { APP.frames(1, dt); var L0 = this.levels(); tr.push([+L0.t.toFixed(2), +L0.shaft.toFixed(4), +L0.res.toFixed(4), +APP.probe(this.XVALVE, 3.0).phead.toFixed(2)]); }
      var pre = tr.map(function (r) { return r[1]; }).sort(function (a, b) { return a - b; });
      var shaft0 = pre[pre.length >> 1], res0 = tr[tr.length - 1][2], tslam = APP.sim.t;
      toggleValve();
      for (k = 0; k < rec * hz; k++) { APP.frames(1, dt); var L1 = this.levels(); tr.push([+L1.t.toFixed(2), +L1.shaft.toFixed(4), +L1.res.toFixed(4), +APP.probe(this.XVALVE, 3.0).phead.toFixed(2)]); }
      return this.reduce(tr, shaft0, res0, tslam);
    },
    reduce: function (tr, shaft0, res0, tslam) {
      var post = tr.filter(function (r) { return r[0] > tslam; });
      var crests = [], troughs = [], i, W = 1.5;
      for (i = 0; i < post.length; i++) {
        var t = post[i][0], v = post[i][1], hi = true, lo = true, j;
        for (j = 0; j < post.length; j++) {
          if (j === i || Math.abs(post[j][0] - t) > W) continue;
          if (post[j][1] > v) hi = false; if (post[j][1] < v) lo = false;
        }
        if (hi) crests.push([t, v]); if (lo) troughs.push([t, v]);
      }
      var dedup = function (a) { var o = []; a.forEach(function (p) { if (!o.length || p[0] - o[o.length - 1][0] > 3.0) o.push(p); }); return o; };
      crests = dedup(crests); troughs = dedup(troughs);
      var T = null;
      if (crests.length >= 2) T = +(crests[1][0] - crests[0][0]).toFixed(2);
      else if (crests.length && troughs.length) T = +(2 * Math.abs(troughs[0][0] - crests[0][0])).toFixed(2);
      var peakValve = Math.max.apply(null, post.map(function (r) { return r[3]; }));
      var minValve = Math.min.apply(null, post.map(function (r) { return r[3]; }));
      return { tslam: +tslam.toFixed(2), shaft0: +shaft0.toFixed(3), res0: +res0.toFixed(3),
               y0: +(res0 - shaft0).toFixed(3),
               ymax: crests.length ? +(crests[0][1] - res0).toFixed(3) : null,          // above the reservoir
               rise: crests.length ? +(crests[0][1] - shaft0).toFixed(3) : null,        // above the pre-slam shaft level
               tcrest: crests.length ? +(crests[0][0] - tslam).toFixed(2) : null,
               T: T,
               crests: crests.map(function (p) { return [+(p[0] - tslam).toFixed(2), +(p[1] - res0).toFixed(3)]; }),
               troughs: troughs.map(function (p) { return [+(p[0] - tslam).toFixed(2), +(p[1] - res0).toFixed(3)]; }),
               valveHead: { peak: peakValve, min: minValve },
               trace: tr };
    },

    // --- theory -----------------------------------------------------------
    /** Rigid column, friction ∝ u². L to the shaft centre, per unit width:
     *  A/A_s = D_h/D_s. Frictionless: y = u₀√(L·D_h/(g·D_s)), T = 2π√(L·D_s/(g·D_h)).
     *  With k = y₀/u₀²: Y = L·D_h/(2·g·k·D_s), C = −(Y/k)·e^(−y₀/Y), and the
     *  crest y (positive DOWN from the reservoir) solves C·e^(y/Y) + (y+Y)/k = 0. */
    predict: function (r, Lc) {
      var g = this.GEOM, G9 = 9.81, L = Lc || (g.xk - g.xw), r_ = g.Dh / g.Ds;
      var yf = r.u0 * Math.sqrt(L * r_ / G9), T = 2 * Math.PI * Math.sqrt(L / (G9 * r_));
      var k = r.y0 / (r.u0 * r.u0), Y = L * r_ / (2 * G9 * k), C = -(Y / k) * Math.exp(-r.y0 / Y);
      var f = function (y) { return C * Math.exp(y / Y) + (y + Y) / k; };
      var a = -yf * 1.5, b = 0, y;                  // bracket the root between the frictionless crest and the reservoir
      for (var i = 0; i < 80; i++) { y = 0.5 * (a + b); if (f(a) * f(y) <= 0) b = y; else a = y; }
      return { L: +L.toFixed(2), ratio: +r_.toFixed(3), k: +k.toFixed(4), Y: +Y.toFixed(2),
               yFrictionless: +yf.toFixed(3), yFriction: +(-y).toFixed(3), T: +T.toFixed(2),
               fDarcy: +(2 * G9 * (2 * g.Dh) * k / L).toFixed(4) };   // D_H = 2·D_h for a slot of unit width
    },

    // --- one whole student run --------------------------------------------
    student: function (Ds, opts) {
      opts = opts || {};
      var c = this.setup(Ds, opts);
      this.settle(opts.settle || 60, 120000);
      var st = this.steady();
      var sl = this.slam(opts.rec || 50);
      var pr = this.predict({ u0: st.u0, y0: sl.y0 });
      return { Ds: Ds, cells: c.shaft.n, steady: st, slam: sl, predict: pr };
    }
  };
  return "HP3 rig loaded — HP3.setup(3.0), HP3.settle(60), HP3.steady(), HP3.slam(50)";
})();
