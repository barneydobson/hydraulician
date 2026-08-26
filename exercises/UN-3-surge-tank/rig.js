/* UN-3 · Surge tank — paste into the dev console on ?scene=hammer.
 *
 *   UN3.setup(1.10)          build the whole rig: nozzle, standpipe, gauge
 *   UN3.check()              audit the seal (must report ok:true)
 *   UN3.walls(1.10)          the two x-coordinates a student draws by hand
 *
 * The rig is three erase/draw strokes on top of the shipped hammer scene:
 *   1. a smaller nozzle (UN-1's rung 2, gap 0.28 m) so v0 ~ 0.95 m/s
 *   2. an erased hole in the pipe soffit at x = 53.0, b_s wide
 *   3. two vertical shaft walls flanking that hole, up to the domain roof
 * plus a gauge inside the shaft at (53.0, 6.0) read on the DEPTH field.
 *
 * Class constants: Resolution Medium, Reservoir level 12.0 m, celerity 70,
 * wave damping 0.03 (scene default). See _archive/README-full.md §1.
 */
(function () {
  var G = (typeof window !== "undefined") ? window : this;

  G.UN3 = {
    XT: 53.0,        // standpipe centreline — 1.8 m upstream of the valve face
    YG: 6.0,         // gauge elevation inside the shaft (always submerged)
    TH: 0.30,        // shaft wall thickness
    YB: 4.90,        // shaft walls start here: inside the soffit, above the bore
    YT: 29.60,       // ... and run to just under the domain roof
    GAP: 0.28,       // nozzle gap (UN-1 rung 2)
    LEVEL: 12.0,     // reservoir level, m above the domain floor
    L: 47.0,         // penstock datum: reservoir face x=6.0 -> tee x=53.0
    BP: 2.8899,      // delivered bore (21 cells at Medium)

    // --- the two wall centrelines a student draws -------------------------
    walls: function (bs) {
      return { left:  +(this.XT - bs / 2 - this.TH / 2).toFixed(3),
               right: +(this.XT + bs / 2 + this.TH / 2).toFixed(3),
               from: this.YB, to: this.YT, thickness: this.TH };
    },

    // --- nozzle (UN-1's ladder) ------------------------------------------
    nozzle: function (gap) {
      APP.SIM.addSeg(56.5, 2.05, 56.5, 4.95, 0.60, 0);              // erase the plate
      APP.SIM.addSeg(56.5, 2.00, 56.5, 3.50 - gap / 2, 0.50, 255);  // lower half
      APP.SIM.addSeg(56.5, 3.50 + gap / 2, 56.5, 5.00, 0.50, 255);  // upper half
    },

    // --- standpipe --------------------------------------------------------
    // Order matters: erase FIRST, then the walls. rasterise() re-stamps scene
    // walls, then user segs in order, so a later wall seg always wins over an
    // earlier erase — that is what seals the shaft against its own hole.
    pipe: function (bs) {
      var w = this.walls(bs);
      APP.SIM.addSeg(this.XT, this.YB, this.XT, 6.60, bs, 0);                    // open the soffit
      APP.SIM.addSeg(w.left,  this.YB, w.left,  this.YT, this.TH, 255);          // left  shaft wall
      APP.SIM.addSeg(w.right, this.YB, w.right, this.YT, this.TH, 255);          // right shaft wall
    },

    setup: function (bs, opts) {
      opts = opts || {};
      APP.loadScene('hammer', false);
      this.nozzle(opts.gap === undefined ? this.GAP : opts.gap);
      this.pipe(bs);
      CONTROLS.find(function (c) { return c.id === 'inLevel'; }).set(opts.level === undefined ? this.LEVEL : opts.level);
      CONTROLS.find(function (c) { return c.id === 'gaugeField'; }).set('d');
      if (opts.bulk != null) CONTROLS.find(function (c) { return c.id === 'bulk'; }).set(opts.bulk);
      // Pin the view speed. tickFrame() takes `state.speed * realDt / h`
      // substeps, so APP.frames(1, dt) advances speed*dt of sim time and the
      // gauge samples that much apart. reduce()'s peak detector compares a
      // FIXED 0.9 s neighbourhood, so at the card's speed = 2 that window is
      // only +/-4 samples, spurious wiggles on the rising limb qualify as
      // maxima, and the first "crest" reads 2.07 m against the true 2.57 m.
      // Measured both ways; at speed 1 the run reproduces the shipped CSV
      // exactly. Students are unaffected — they read the visible peak off the
      // chart, not a detector — so the card keeps speed 2.
      APP.state.speed = 1;
      syncPanel();
      APP.state.gauges.length = 0;
      APP.state.gauges.push({ x: this.XT, y: this.YG, hist: [], colour: "#7fd4ff" });
      APP.state.gaugeField = 'd';
      return this.check();
    },

    // --- the clear shaft width actually delivered by the raster ------------
    widthAt: function (y) {
      var s = APP.sim, dx = s.dx, j = Math.round(y / dx), i = Math.round(this.XT / dx);
      if (s.mask[j * s.nx + i] !== 0) return { n: 0, w: 0, lo: -1, hi: -1 };
      var lo = i, hi = i;
      while (lo > 0 && s.mask[j * s.nx + lo - 1] === 0) lo--;
      while (hi < s.nx - 1 && s.mask[j * s.nx + hi + 1] === 0) hi++;
      return { n: hi - lo + 1, w: +((hi - lo + 1) * dx).toFixed(4), lo: lo, hi: hi };
    },

    gapCells: function () {
      var s = APP.sim, i = Math.round(56.5 / s.dx), n = 0;
      for (var j = 15; j <= 35; j++) if (s.mask[j * s.nx + i] === 0) n++;
      return n;
    },

    // --- seal audit -------------------------------------------------------
    // The soffit must have exactly ONE hole, of exactly the shaft width, and
    // the shaft walls must be solid over their whole height. Butt ends abut
    // rather than interlock, so this is checked, never assumed (MO-2's rule).
    check: function () {
      var s = APP.sim, dx = s.dx, rows = [], bad = 0;
      // Scan by ELEVATION. j = 36..40 was Medium's dx baked in; at High those
      // rows land inside the bore, the soffit reads as one 500-cell hole and
      // every rig fails the seal it actually passes.
      for (var y = 4.95; y <= 5.50; y += dx) {
        var j = Math.round(y / dx);
        var holes = 0, x0 = null, x1 = null;
        for (var i = Math.round(6.6 / dx); i < Math.round(58.0 / dx); i++)
          if (s.mask[j * s.nx + i] === 0) { holes++; if (x0 === null) x0 = i * dx; x1 = i * dx; }
        rows.push({ y: +(j * dx).toFixed(3), holes: holes,
                    x0: x0 === null ? null : +x0.toFixed(2), x1: x1 === null ? null : +x1.toFixed(2) });
      }
      var w = this.widthAt(12.0);
      for (var j = Math.round(5.1 / dx); j < Math.round(29.4 / dx); j++)
        if (s.mask[j * s.nx + (w.lo - 1)] !== 255 || s.mask[j * s.nx + (w.hi + 1)] !== 255) bad++;
      var oneHole = rows.every(function (r) { return r.holes === w.n; });
      return { ok: oneHole && bad === 0 && w.n > 0,
               bs_delivered: w.w, cells: w.n, gapCells: this.gapCells(),
               leakyWallRows: bad, soffit: rows };
    },

    // --- measurement ------------------------------------------------------
    V: function (x) { var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true)); return A.V[Math.floor(x / APP.sim.dx)]; },
    settle: function (T) { APP.state.paused = false; var t0 = APP.sim.t; while (APP.sim.t - t0 < T) APP.tick(400); return APP.sim.t; },

    // Slam and record the gauge's DEPTH channel — the standpipe level.
    // Gauge history is filled by tickFrame only (APP.frames), never APP.tick,
    // and it is a 900-sample ring buffer: 45 sim-s at dt = 1/20.
    slam: function (rec, dt) {
      // 10 Hz, not 20: the gauge ring is 900 samples, so 20 Hz caps the record
      // at 45 s and the mass oscillation is ~10 s. 10 Hz buys 90 s = six crests,
      // and the crests are broad enough that 0.1 s costs nothing.
      dt = dt || 1 / 10; rec = rec || 70;
      APP.state.paused = false;
      var g = APP.state.gauges[0], bed = 2.0642, k;
      // The gauge's d channel is OVERLAY.analyse's 10 %/call EMA, and
      // settle() runs on APP.tick, which never calls analyse. So the first
      // frames after a settle replay the scene's stale 25 m initial fill: a
      // 3 s median taken across that relaxation reads ~0.5 m high, and on the
      // shipped dry-run class it put two of ten rest levels ABOVE the
      // reservoir. Warm the EMA first, then open the window — and make the
      // window 10 s, because the residual is a 0.12 m turbulent noise floor.
      for (k = 0; k < Math.round(10 / dt); k++) APP.frames(1, dt);
      g.hist.length = 0;
      for (k = 0; k < Math.round(10 / dt); k++) APP.frames(1, dt);
      var pre = g.hist.map(function (h) { return h.d; }).sort(function (a, b) { return a - b; });
      var rest = pre[pre.length >> 1], v0 = this.V(30.0), tslam = APP.sim.t;
      toggleValve();
      g.hist.length = 0;
      for (k = 0; k < Math.round(rec / dt); k++) APP.frames(1, dt);
      return this.reduce(g.hist.map(function (h) { return [h.t, h.d]; }), rest, v0, bed, tslam);
    },

    // first upsurge peak above the pre-slam level, and the median peak-to-peak
    reduce: function (tr, rest, v0, bed, tslam) {
      var pk = [], tk = [], W = 0.9, i, j;
      for (i = 0; i < tr.length; i++) {
        var t = tr[i][0], v = tr[i][1], hi = true, lo = true;
        for (j = Math.max(0, i - 40); j < Math.min(tr.length, i + 41); j++)
          if (Math.abs(tr[j][0] - t) <= W && j !== i) { if (tr[j][1] > v) hi = false; if (tr[j][1] < v) lo = false; }
        if (hi) pk.push([t, v]); if (lo) tk.push([t, v]);
      }
      var dedup = function (a) { var o = []; a.forEach(function (p) { if (!o.length || p[0] - o[o.length - 1][0] > 2.0) o.push(p); }); return o; };
      pk = dedup(pk); tk = dedup(tk);
      var per = [], k;
      for (k = 1; k < pk.length; k++) per.push(+(pk[k][0] - pk[k - 1][0]).toFixed(3));
      for (k = 1; k < tk.length; k++) per.push(+(tk[k][0] - tk[k - 1][0]).toFixed(3));
      per.sort(function (a, b) { return a - b; });
      return { v0: +v0.toFixed(4), rest_level: +(rest + bed).toFixed(3),
               zmax: pk.length ? +(pk[0][1] - rest).toFixed(3) : null,
               T: per.length ? per[per.length >> 1] : null, periods: per,
               peaks: pk.map(function (p) { return [+p[0].toFixed(2), +(p[1] - rest).toFixed(3)]; }) };
    },

    // One complete student run. The personalised parameter is the RESERVOIR
    // LEVEL (a slider) — the shaft is the same for everyone, because redrawing
    // it was the slowest step in the demo and the test does not need it.
    student: function (level, opts) {
      opts = opts || {};
      var c = this.setup(opts.bs || 0.98, { level: level });
      if (!c.ok) return { error: "rig not sealed", check: c };
      this.settle(opts.settle || 100);
      var r = this.slam(opts.rec);
      r.level = level;
      // Crest heights above the resting level — the five numbers the brief asks
      // for. 1/c linear in n is the u^2 law; c_{n+1}/c_n constant is the u law.
      r.crests = r.peaks.filter(function (p) { return p[1] > 0.25; })
                        .slice(0, 6).map(function (p) { return p[1]; });
      return r;
    }
  };
  return "UN3 rig loaded — UN3.setup(1.10) then UN3.check()";
})();
