/* ============================================================================
 * NC-2 · "Is alpha really 1?" -- rake placement, alpha/beta integration,
 *        free-slip contrast, and a trimmed gate-wake contrast rig.
 * ----------------------------------------------------------------------------
 * Paste into the dev console. No geometry to draw for the main sweep --
 * `?scene=s2` ships complete. The gate contrast (NC2.gate.*) rebuilds a
 * trimmed copy of MO-1's RIG-B sluice gate on the sandbox scene; see
 * exercises/MO-1-gate-cv/rig.js for the full, documented original (this file
 * borrows only what NC-2 needs -- build + a rake downstream -- and does not
 * modify that folder).
 *
 *   NC2.stationFor(6)          -> 4.5   (this digit's station, metres)
 *   NC2.student(6)             -> places the rake, returns everything the
 *                                  worksheet asks for (chip + student-5-point
 *                                  alpha), from the SAME instantaneous read
 *   NC2.windowStats(4.5, 20)   -> lecturer-side verification: median-window
 *                                  full-resolution alpha/beta + coarse bias
 *   NC2.freeSlip.run(3.5, 15)  -> toggles Free-slip walls ON, resettles,
 *                                  measures, restores no-slip
 *   NC2.gate.run(6)            -> rebuilds the MO-1-style gate (student digit
 *                                  d picks its own opening, same as MO-1),
 *                                  rakes the vena AND 0.5 m further into the
 *                                  wake, returns both
 *
 * MEASURED FACTS this rig depends on (Medium, s2: 526x180, dx 13.308 mm):
 *   · the rake tool is TOOLS[5] (key "6"); state.rakes holds up to 2, each
 *     {x, buf}. SIM.rake(x, buf) re-reads U raw every call -- NO temporal or
 *     spatial smoothing anywhere in the rake path: bed/surf come from
 *     A.bed[i]/A.surf[i] (OVERLAY.analyse's RAW per-column reduction, not the
 *     EMA'd A.d/A.q used by the hover box), and the velocity buffer is a
 *     fresh readPixels of U each call. The on-screen chip (u_max, V, ratio)
 *     is therefore INSTANTANEOUS, not a running average -- confirmed by
 *     reading js/main.js (sampleRakes() every frame) and js/overlay.js
 *     (drawRake()), and independently by measurement: a fixed station's
 *     alpha swings by a factor of 3-4x frame to frame on this scene (see
 *     README §5). Read the chip the way every other demo's "median of the
 *     wobble" habit says to -- watch it, do not trust one glance.
 *   · js/overlay.js's drawRake row loop computes
 *     `u = 0.5*(buf[j*4] + (j+1<ny ? buf[j*4] : 0))` -- both branches read
 *     the SAME buf[j*4] element (almost certainly a leftover/typo for
 *     buf[(j+1)*4]), so the expression algebraically collapses to exactly
 *     buf[j*4]: the chip and curve show u at the row's own MAC west-face
 *     value with NO vertical interpolation. Reading buf[j*4] directly (as
 *     this rig does) reproduces the screen exactly; this is a documentation
 *     note, not a bug report -- it has zero numerical effect.
 *   · "Free-slip walls" (CONTROLS id "slip") only flips the wall-aware
 *     LAPLACIAN's ghost condition (js/shaders.js:175-180,
 *     `ghost = mix(-1.0, 1.0, u_slip)`) -- i.e. it removes the
 *     Smagorinsky-diffused viscous boundary layer. It does NOT touch the
 *     separate, unconditional bed-friction drag (`u_cf`, js/shaders.js
 *     195-196, `un /= 1.0 + dt*u_cf*...`). A channel's near-bed shear
 *     therefore only partly collapses under free-slip -- see README §3(i).
 *   · The top 1-2 included rake rows sit inside the free-surface interface
 *     band (f transitions from ~1 to 0 over ~1 cell here) and can read a
 *     genuine, sometimes large, near-surface deceleration that is part
 *     numerical (partial-fill velocity handling) and part real (the passing
 *     roll wave's own near-surface kinematics) -- confirmed by probing f
 *     alongside u (README §5). Treat the very top of a hand-read profile as
 *     "just under the surface", not the literal last pixel.
 * ==========================================================================*/
window.NC2 = {
  C: (id) => CONTROLS.find((c) => c.id === id),

  // -------------------------------------------------------------- station rule
  /** Digit -> station, metres. 8 distinct half-metre stations inside s2's
   *  validated clean reach (1.0 m clear of the crest, >=6 cells (0.5 m,
   *  ~37 cells) clear of the brink guard band that starts ~x=5.9); d=8,9
   *  repeat d=0,1's station, same convention NC-1/HJ-1 use for classes over
   *  the distinct-station count -- a repeat cross-checks the reading instead
   *  of wasting a ninth/tenth position on marginal ground. */
  stationFor: (d) => +(1.5 + 0.5 * (((d % 10) + 10) % 10 % 8)).toFixed(2),

  // ------------------------------------------------------------- rake mechanics
  rakeAt(x) {
    APP.state.rakes.length = 0;
    APP.state.rakes.push({ x, buf: null });
    APP.state.tool = "rake";
    return NC2.sample(APP.state.rakes[0]);
  },

  addRake(x) {
    if (APP.state.rakes.length >= 2) APP.state.rakes.shift();
    APP.state.rakes.push({ x, buf: null });
    return NC2.sample(APP.state.rakes[APP.state.rakes.length - 1]);
  },

  /** Exactly what SIM.rake + drawRake read: raw instantaneous column, raw
   *  per-column bed/surf. Returns {x, i, bed, surf, h, dx, pts:[{y,u}], t}. */
  sample(rk) {
    const r = APP.SIM.rake(rk.x, rk.buf);
    rk.buf = r.buf; rk.i = r.i;
    const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    const dx = APP.sim.dx, ny = APP.sim.ny;
    const bed = A.bed[r.i], surf = A.surf[r.i];
    const pts = [];
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * dx;
      if (y < bed || y > surf) continue;
      pts.push({ y, u: r.buf[j * 4] });
    }
    return { x: rk.x, i: r.i, bed, surf, h: surf - bed, dx, pts, t: APP.sim.t };
  },

  /** The on-screen chip, reproduced exactly: u_max, depth-average V (plain
   *  arithmetic mean over included rows -- NOT mid-ordinate-weighted), ratio. */
  chip(samp) {
    let umax = 1e-3, sum = 0, cnt = 0;
    samp.pts.forEach((p) => { umax = Math.max(umax, Math.abs(p.u)); sum += p.u; cnt++; });
    const V = cnt ? sum / cnt : 0;
    return { umax, V, ratio: umax / Math.max(V, 1e-3), n: cnt };
  },

  /** Full-resolution mid-ordinate: alpha = sum(u^3)*dy/(V^3 h), same for
   *  beta. dy = h/N so N slices exactly tile the physical depth h, keeping
   *  full- and coarse-resolution integration on the same footing. */
  integrate(samp) {
    const n = samp.pts.length;
    if (n < 2) return null;
    const h = samp.h, dy = h / n;
    let sumU = 0, sumU2 = 0, sumU3 = 0, umax = 1e-3;
    samp.pts.forEach((p) => { const u = p.u; sumU += u; sumU2 += u * u; sumU3 += u * u * u; umax = Math.max(umax, Math.abs(u)); });
    const V = sumU / n;
    return { n, h, V, umax, ratio: umax / Math.max(V, 1e-3),
             alpha: (sumU3 * dy) / (Math.pow(V, 3) * h), beta: (sumU2 * dy) / (Math.pow(V, 2) * h) };
  },

  /** The "read n points off the drawn curve" method: split depth into n
   *  fractions (default: n EQUAL strips), nearest actual sample to each
   *  target, mid-ordinate with dy = h/n. MEASURED (README §4): equal-spacing
   *  is the safe default (a consistent ~5-12% LOW bias at n=5); grabbing a
   *  point hard against the bed (frac ~0.02-0.03) makes it WORSE, not
   *  better -- it overshoots and gets noisier, because one near-wall cell
   *  carries 20% of the weight on V at n=5 and that cell is itself noisy.
   *  `fracs: [0.08,0.25,0.5,0.75,0.92]` (moderate, pulled in from the very
   *  edges but not equal-spaced) recovered most of the gap in this rig's
   *  own tests -- see README for the numbers before recommending it further. */
  coarseN(samp, n, fracs) {
    if (samp.pts.length < 2) return null;
    const bed = samp.bed, h = samp.h;
    const targets = fracs || Array.from({ length: n }, (_, m) => (m + 0.5) / n);
    const picks = targets.map((fr) => {
      const yT = bed + fr * h;
      let best = samp.pts[0], bd = Infinity;
      samp.pts.forEach((p) => { const d = Math.abs(p.y - yT); if (d < bd) { bd = d; best = p; } });
      return best;
    });
    const k = picks.length, dy = h / k;
    let sumU = 0, sumU2 = 0, sumU3 = 0;
    picks.forEach((p) => { sumU += p.u; sumU2 += p.u * p.u; sumU3 += p.u * p.u * p.u; });
    const V = sumU / k;
    return { k, V, alpha: (sumU3 * dy) / (Math.pow(V, 3) * h), beta: (sumU2 * dy) / (Math.pow(V, 2) * h),
             picks: picks.map((p) => ({ frac: +((p.y - bed) / h).toFixed(3), u: +p.u.toFixed(4) })) };
  },

  /** ONE student's worksheet run, from the digit alone: place the rake at
   *  the digit's station, read the chip and the student's own 5-point
   *  mid-ordinate alpha from the SAME instant. This is the "watch it, then
   *  read" snapshot -- for the median-window ground truth used to grade /
   *  verify against, use NC2.windowStats(x, secs) instead (see README §5:
   *  the chip is instantaneous and a single glance can be a long way from
   *  typical on this scene). */
  student(d) {
    const x = NC2.stationFor(d);
    const s = NC2.rakeAt(x);
    const ch = NC2.chip(s);
    const c5 = NC2.coarseN(s, 5);
    return { d, x, n: s.pts.length, h: +s.h.toFixed(4), chip_umax: +ch.umax.toFixed(4),
             chip_V: +ch.V.toFixed(4), chip_ratio: +ch.ratio.toFixed(4),
             alpha_student5: c5 ? +c5.alpha.toFixed(4) : null, t: +s.t.toFixed(2) };
  },

  /** Lecturer-side verification: run un-paused for `secs`, sampling every
   *  ~`everyMs` ms, for rake index `idx` (default 0). Returns median/mean/
   *  min/max of the chip ratio, full-resolution alpha/beta, and the
   *  equal-5/4-strip coarse alpha -- the per-station spread the
   *  median-window discipline needs, and the ground truth the student's
   *  5-point number is checked against. */
  windowStats(x, secs, everyMs, idx) {
    NC2.rakeAt(x);
    APP.state.paused = false;
    const trace = [];
    const t0 = performance.now();
    let last = 0;
    while (performance.now() - t0 < secs * 1000) {
      APP.frames(1, 1 / 60);
      const now = performance.now();
      if (now - last >= (everyMs || 300)) {
        last = now;
        const s = NC2.sample(APP.state.rakes[idx || 0]);
        const full = NC2.integrate(s);
        const c5 = NC2.coarseN(s, 5);
        const c4 = NC2.coarseN(s, 4);
        const ch = NC2.chip(s);
        if (full) trace.push({ t: s.t, n: s.pts.length, h: s.h, chipRatio: ch.ratio, chipV: ch.V, chipUmax: ch.umax,
                                alphaFull: full.alpha, betaFull: full.beta,
                                alpha5: c5 ? c5.alpha : null, alpha4: c4 ? c4.alpha : null });
      }
    }
    APP.state.paused = true; APP.frames(2);
    const med = (k) => { const a = trace.map((r) => r[k]).filter((v) => v != null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
    const mean = (k) => { const a = trace.map((r) => r[k]).filter((v) => v != null); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : null; };
    const spread = (k) => { const a = trace.map((r) => r[k]).filter((v) => v != null); return a.length ? { min: Math.min(...a), max: Math.max(...a) } : null; };
    return { x, nSamples: trace.length, trace,
             alphaFull: { med: med("alphaFull"), mean: mean("alphaFull"), spread: spread("alphaFull") },
             betaFull: { med: med("betaFull"), mean: mean("betaFull") },
             alpha5: { med: med("alpha5"), mean: mean("alpha5"), spread: spread("alpha5") },
             alpha4: { med: med("alpha4"), mean: mean("alpha4"), spread: spread("alpha4") },
             chipRatio: { med: med("chipRatio"), mean: mean("chipRatio"), spread: spread("chipRatio") },
             n: med("n"), h: med("h") };
  },

  /** Quick single instantaneous read (no window) -- reconnaissance only. */
  quick(x) {
    const s = NC2.rakeAt(x);
    const full = NC2.integrate(s);
    const c5 = NC2.coarseN(s, 5);
    const ch = NC2.chip(s);
    return { x, n: s.pts.length, h: +s.h.toFixed(4), chip: ch,
             full: full ? { alpha: +full.alpha.toFixed(4), beta: +full.beta.toFixed(4) } : null,
             c5: c5 ? { alpha: +c5.alpha.toFixed(4) } : null };
  },

  // -------------------------------------------------------- contrast 1: free-slip
  freeSlip: {
    /** Toggle Free-slip walls ON, fast-settle `settleSecs` (physics only, no
     *  render), measure a window, then restore no-slip. Station x should be
     *  one already used for the no-slip sweep so the two are comparable. */
    run(x, secs, settleSecs) {
      NC2.C("slip").set(true); syncPanel();
      APP.tick(Math.ceil((settleSecs === undefined ? 18 : settleSecs) / APP.SIM.dt()));
      APP.SIM.columns(true);
      const w = NC2.windowStats(x, secs === undefined ? 10 : secs, 300);
      NC2.C("slip").set(false); syncPanel();   // always restore -- this is a GLOBAL flag
      return w;
    },
  },

  // ----------------------------------------------- contrast 2: downstream of a gate
  // Trimmed from exercises/MO-1-gate-cv/rig.js's MOGATE/MO1 (that folder's rig
  // is the fully-documented original; this is only the subset NC-2 needs).
  // RIG-B pattern (CLAUDE.md "outfall edges" + MO-1's own ponding-trap note):
  // bed carried only to a short apron past the gate, THEN TRUNCATED, floor
  // Open beyond it -- a bed run to the domain edge with no tailwater ponds to
  // ~1.5 m and drowns the jet outright.
  gate: {
    BED: 0.50, X0: -0.30, GATE_X: 5.50, APRON: 1.60, GATE_TOP: 3.00, PLATE_TH: 0.05,
    GAUGE_DX: 2.00, VENA_DX: 6,                // cells past the gate -- MO-1's validated station
    Q: 0.33,                                    // class-wide fixed discharge, same as MO-1
    LEVEL: { 5: 1.7565, 6: 1.4181, 7: 1.2103, 8: 1.0791 },   // MO-1's measured fixed points
    aCells: (d) => 5 + Math.round((3 * d) / 9),  // 5,5,6,6,6,7,7,7,8,8 -- MO-1's band

    build(o) {
      o = o || {};
      const R = NC2.gate, bed = R.BED, gx = R.GATE_X, apron = R.APRON, bx1 = gx + apron;
      const gtop = R.GATE_TOP, th = R.PLATE_TH, a = o.a;
      NC2.C("spoutOn").set(false);
      NC2.C("openL").set("1"); NC2.C("openR").set("1"); NC2.C("openB").set("1"); NC2.C("openT").set("0");
      NC2.C("waveOn").set(false);
      APP.SIM.clearSegs();
      APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);   // erase the sandbox's two ledges
      APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
      APP.SIM.addSeg(R.X0, bed / 2, bx1, bed / 2, bed, 255);        // bed: past left edge -> apron end (NOT domain edge)
      APP.SIM.addSeg(gx, gtop, gx, bed + a, th, 255);                // gate plate, opening = a
      R.gate = { x: gx, a, th, bed, top: gtop, apronEnd: bx1 };
      NC2.C("inflowOn").set(true); NC2.C("inFree").set(false);
      if (o.q !== undefined) NC2.C("inQ").set(o.q);
      if (o.level !== undefined) NC2.C("inLevel").set(o.level);
      NC2.C("twOn").set(false);
      NC2.C("mode").set("0"); NC2.C("channel").set(false); NC2.C("labels").set(false); NC2.C("jumps").set(false);
      syncPanel();
      APP.state.gauges.length = 0;
      APP.state.gauges.push({ x: gx - R.GAUGE_DX, z: bed + 0.15, hist: [], colour: "#7fd4ff" });
      return R.gate;
    },

    venaX() { return +(NC2.gate.GATE_X + NC2.gate.VENA_DX * APP.sim.dx).toFixed(4); },

    /** One digit's whole gate-contrast run: build at the digit's opening
     *  (same aCells/LEVEL table as MO-1, so results are cross-checkable
     *  against that folder), settle, one fixed-point level correction (same
     *  protocol as MO-1/WE-1 -- no iteration needed beyond this), then rake
     *  BOTH the validated vena station and 0.5 m further into the wake. */
    run(d, settleSecs) {
      const R = NC2.gate, a = +(R.aCells(d) * 0.021739).toFixed(4), lv = R.LEVEL[R.aCells(d)];
      APP.loadScene("sandbox", false);
      R.build({ a, q: R.Q, level: lv });
      APP.tick(Math.ceil((settleSecs === undefined ? 40 : settleSecs) / APP.SIM.dt()));
      APP.SIM.columns(true);
      // one fixed-point level correction, exactly MO-1's protocol
      const g0 = APP.state.gauges[0];
      g0.hist.length = 0; APP.state.paused = false;
      const t0 = APP.sim.t; while (APP.sim.t - t0 < 6) APP.frames(1, 1 / 60);
      APP.state.paused = true; APP.frames(2);
      const y0 = g0.hist.map((r) => r.d).sort((p, q) => p - q)[Math.floor(g0.hist.length / 2)];
      const lvl2 = +(R.BED + y0).toFixed(4);
      NC2.C("inLevel").set(lvl2); syncPanel();
      APP.tick(Math.ceil(20 / APP.SIM.dt()));
      APP.SIM.columns(true);
      const vena = NC2.windowStats(R.venaX(), 9, 300);
      const wake = NC2.windowStats(R.venaX() + 0.5, 9, 300);
      return { d, aCells: R.aCells(d), a, q: R.Q, level: lvl2, y0,
               venaX: R.venaX(), vena: { alphaFull: vena.alphaFull.med, chipRatio: vena.chipRatio.med },
               wakeX: +(R.venaX() + 0.5).toFixed(4), wake: { alphaFull: wake.alphaFull.med, chipRatio: wake.chipRatio.med } };
    },
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(NC2) });
