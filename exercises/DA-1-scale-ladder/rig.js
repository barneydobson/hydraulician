/* ============================================================================
 * DA-1 · THE SCALE LADDER — RIG-B + a broad-crested weir block, at λ = 1, ½, ¼
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *     DA1.build(1, 0.72)        // λ = 1 rig at BASE q = 0.72  (sets q = 0.72)
 *     DA1.build(0.25, 0.72)     // λ = ¼ rig at BASE q = 0.72  (sets q = 0.09)
 *     DA1.student(2)            // one whole student run, digit d = 2
 *     DA1.sweep([0,1,2,3,4,5,6,7,8,9])
 *
 * The rig is WE-1's RIG-B with FB-2's crest-block-ends-at-the-brink pattern:
 *
 *  λ = 1        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~┌─────────────┐        crest 1.196
 *          pool  ↑H       ●gauge             │  broad crest│ ←brink
 *   z=0.50 ├─────────────────────────────────┴─────────────┤ bed top (PEDESTAL)
 *   z=0.00 └─────────────────────────────────────────────────────────┘ floor
 *          0        x_g=2.174           x_b=4.783      x_e=6.522     9.0
 *
 *  λ = ¼   ~~~~~~~┌──┐                            (the SAME weir, quarter size)
 *   z=0.50 ├──────┴──┤ ................................ nothing past the brink
 *
 * WHAT SCALES (the model) — P, crest length, approach length, weir station,
 *   gauge station, and q by λ^1.5.  Every base dimension is a multiple of
 *   4 CELLS so λ = 1, ½, ¼ rasterise to EXACT cell counts (DA-2's trick):
 *
 *      quantity        λ=1        λ=½        λ=¼
 *      P              32 cells   16 cells    8 cells
 *      crest length   80         40         20
 *      block u/s face 220        110        55
 *      gauge station  100         50        25
 *
 * WHAT DOES NOT SCALE (and is therefore where the scale effects live) —
 *   · the BED PEDESTAL (top face z = 0.50 m, 23 cells): the height of the
 *     flume floor above the domain floor is not part of the modelled weir,
 *     it is what the model stands on (DA-2's "why the plate does not scale").
 *     Keeping it fixed also keeps WE-1's 10-second bed self-check valid on
 *     all three rungs and keeps the free overfall free at every λ.
 *   · Δx (21.7 mm at Medium) — so H is resolved in 4× fewer cells at λ = ¼.
 *     THAT IS THE POINT OF THE DEMO; see the README's cell arithmetic.
 *   · the reservoir relaxation sponge (~10 cells, CLAUDE.md) — a fixed number
 *     of CELLS, so it eats a 4× larger fraction of the λ=¼ approach.
 *
 * Every call below is a documented app entry point — nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   SIM.columns(true) → Float32Array, 4 per column: bed, depth, q, surface
 * ==========================================================================*/
window.DA1 = {
  /* ---- fixed constants (Medium: 414 × 230, Δx = 0.0217391 m) -------------- */
  BED: 0.50,            // bed pedestal top face — 23 cells, does NOT scale
  X0: -0.30,            // slabs run PAST the left edge — extrapolate, never
  BRUSH: 0.50,          // the sandbox brush maximum (js/main.js: min(0.5,…))
  SINK: 0.06,           // how far the crest block is sunk into the bed slab

  /* base (λ = 1) dimensions, in CELLS at Medium — all multiples of 4 */
  N_P: 32, N_LC: 80, N_XB: 220, N_XG: 100,

  /* base-q rule and the thirds rule (see README §2) */
  LAM: [1, 0.5, 0.25],
  lambda: function (d) { return DA1.LAM[d % 3]; },
  qbase:  function (d) { return +(0.60 + 0.06 * d).toFixed(3); },
  q:      function (d) { return +(DA1.qbase(d) * Math.pow(DA1.lambda(d), 1.5)).toFixed(4); },

  /* The q→reservoir-level rule (WE-1's fixed point: the reservoir PINS the
   * surface, so it must be set to what the weir's own backwater wants).
   * MEASURED at λ = 1 on this solver:   H = A₁·q^n,  A₁ = 0.799, n = 0.562.
   *
   * n is NOT 2/3, because C_d is not constant (it rises with H/P — the same
   * story as WE-1/Rehbock).  Exact Froude similarity (H_λ = λH₁ at
   * q_λ = q₁λ^1.5) then forces the coefficient — and ONLY the coefficient —
   * to carry a λ:
   *          A_λ = A₁ · λ^(1 − 1.5n) = A₁ · λ^0.157
   * so one closed form serves all three rungs.  That λ^0.157 is not a scale
   * effect: it is the price of writing a DIMENSIONAL rating.  Re-plot the
   * same data as C_d against H/P and it vanishes — which is the whole demo. */
  A1: 0.799, NEXP: 0.562,
  levelA: function (lam) { return DA1.A1 * Math.pow(lam, 1 - 1.5 * DA1.NEXP); },
  level: function (lam, q) {
    return +(DA1.crestOf(lam) + DA1.levelA(lam) * Math.pow(q, DA1.NEXP)).toFixed(3);
  },

  cell: function () { return APP.sim.dx; },
  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /* geometry of one rung, in metres, snapped to the grid it will rasterise on */
  geom: function (lam) {
    var dx = 9 / 414;                       // Medium cell, the design grid
    return { lam: lam, dx: dx,
             P:  DA1.N_P  * lam * dx,       // crest height above the bed
             Lc: DA1.N_LC * lam * dx,       // crest length
             xb: DA1.N_XB * lam * dx,       // block upstream face
             xe: DA1.N_XB * lam * dx + DA1.N_LC * lam * dx,   // brink
             xg: DA1.N_XG * lam * dx,       // gauge station
             crest: DA1.BED + DA1.N_P * lam * dx };
  },
  crestOf: function (lam) { return +DA1.geom(lam).crest.toFixed(5); },

  /* ---- build one rung ----------------------------------------------------
   * lam = 1 | 0.5 | 0.25 ; qb = the student's BASE q (q = qb·λ^1.5).
   * o.level overrides the level rule; o.q overrides the scaled q. */
  build: function (lam, qb, o) {
    o = o || {};
    var g = DA1.geom(lam), q = o.q !== undefined ? o.q : +(qb * Math.pow(lam, 1.5)).toFixed(4);

    /* panel — RIG-B stripped to a flume, WE-1's free-downstream pattern */
    DA1.C("spoutOn").set(false);
    DA1.C("waveOn").set(false);
    DA1.C("openL").set("1");        // reservoir edge
    DA1.C("openR").set("1");        // zero-gradient: the exit sheet is supercritical
    DA1.C("openB").set("1");        // the nappe has to leave — bed stops at the brink
    DA1.C("openT").set("0");
    DA1.C("twOn").set(false);       // NO tailwater: the brink IS the control (FB-2)

    /* geometry */
    APP.SIM.clearSegs();
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);   // erase the sandbox ledges
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);
    // bed pedestal: solid to the floor, past the left edge, ENDING AT THE BRINK
    APP.SIM.addSeg(DA1.X0, DA1.BED / 2, g.xe, DA1.BED / 2, DA1.BED, 255);
    // crest block, stacked in ≤0.5 m strokes exactly as a student draws it
    DA1.stack(g.xb, g.xe, DA1.BED - DA1.SINK, g.crest);

    /* controls */
    DA1.C("inflowOn").set(true);
    DA1.C("inFree").set(false);              // q-driven, never head-driven (P9)
    DA1.C("inQ").set(q);
    DA1.C("inLevel").set(o.level !== undefined ? o.level : DA1.level(lam, q));
    DA1.C("mode").set(o.mode === undefined ? "0" : String(o.mode));
    DA1.C("channel").set(false); DA1.C("labels").set(false); DA1.C("jumps").set(false);
    syncPanel();
    DA1.gauge(g.xg, g.crest + 0.05);
    DA1.G = g; DA1.Q = q;
    return DA1.check();
  },

  /** A horizontal slab from y0 to y1, drawn as N stacked strokes none of which
   *  exceeds the 0.5 m brush maximum — the union of overlapping strokes covers
   *  exactly the same rows as one thick stroke would. */
  stack: function (x0, x1, y0, y1, kind) {
    var n = Math.ceil((y1 - y0) / DA1.BRUSH), th = (y1 - y0) / n, i, yc;
    for (i = 0; i < n; i++) {
      yc = y0 + th * (i + 0.5);
      APP.SIM.addSeg(x0, yc, x1, yc, th * 1.001, kind === undefined ? 255 : kind);
    }
    return n;
  },

  /** One gauge in the approach pool — the same push the Gauge tool does. */
  gauge: function (x, y) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: x, y: y, hist: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "d";        // the card then prints "d 0.734 m"
    DA1.XG = x;
  },

  /** Rasterised crest elevation and block seal — scans sim.mask the way the
   *  solver sees it, with FB-2's stop-at-the-first-gap rule. */
  checkBlock: function () {
    var S = APP.sim, g = DA1.G, i = Math.round((g.xb + g.Lc * 0.5) / S.dx), j = 0, holes = 0;
    while (j < S.ny && S.mask[j * S.nx + i]) j++;
    var crest = j * S.dx;
    // seal: every cell from floor to crest in the block's mid column
    for (var k = 0; k < j; k++) if (!S.mask[k * S.nx + i]) holes++;
    // length in cells, measured one cell below the crest
    var jj = j - 1, a = i, b = i;
    while (a > 0 && S.mask[jj * S.nx + (a - 1)]) a--;
    while (b < S.nx - 1 && S.mask[jj * S.nx + (b + 1)]) b++;
    return { crestDrawn: +g.crest.toFixed(4), crestRasterised: +crest.toFixed(4),
             P: +(crest - DA1.BED).toFixed(4), Pcells: Math.round((crest - DA1.BED) / S.dx),
             LcCells: b - a + 1, holes: holes, sealed: holes === 0 };
  },

  /** Per-column [bed, depth, q, surface] — the buffer the display reads. */
  cols: function () {
    var S = APP.sim, c = APP.SIM.columns(true), out = [];
    for (var i = 0; i < S.nx; i++)
      out.push({ x: +(i * S.dx).toFixed(3), bed: c[i * 4], h: c[i * 4 + 1],
                 q: c[i * 4 + 2], surf: c[i * 4 + 3] });
    return out;
  },

  /** Advance `secs` of simulated time flat out (no render — no gauge history). */
  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);                  // sync point: force the readback
    return +APP.sim.t.toFixed(2);
  },

  /** Run `secs` through the FULL frame so the gauge card fills, then return
   *  what the student reads: the MEDIAN gauge depth, and H = depth − P. */
  record: function (secs) {
    var S = APP.sim, gg = APP.state.gauges[0], g = DA1.G;
    gg.hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0;
    while (APP.sim.t - t0 < (secs || 8) && n < 60 * (secs || 8) * 4 + 400) {
      APP.frames(1, 1 / 60); n++;
    }
    APP.state.paused = true; APP.frames(2);
    var a = gg.hist.map(function (r) { return r.d; }).sort(function (p, q) { return p - q; });
    var med = a[a.length >> 1];
    return { t: +S.t.toFixed(2), n: a.length,
             h: +med.toFixed(4), hMin: +a[0].toFixed(4), hMax: +a[a.length - 1].toFixed(4),
             H: +(med - g.P).toFixed(4), cells: +((med - g.P) / S.dx).toFixed(2) };
  },

  /** Mass balance ACROSS the weir — WE-1's junk detector, the test that
   *  separates an honest scale effect from an under-resolved one.  Column q
   *  is averaged over a band of columns (a single column near the brink
   *  swings ±20%): the approach band well upstream of the block, and the
   *  crest band from 4 cells past the upstream shoulder to 6 cells short of
   *  the brink (CHANGES-NEEDED's ≥6-cells-from-a-face rule). */
  massCheck: function () {
    var S = APP.sim, g = DA1.G, c = APP.SIM.columns(true),
        band = function (x0, x1) {
          var i0 = Math.round(x0 / S.dx), i1 = Math.round(x1 / S.dx), s = 0, n = 0;
          for (var i = i0; i <= i1; i++) { s += c[i * 4 + 2]; n++; }
          return n ? s / n : 0;
        },
        qa = band(g.xg - 0.3 * g.lam, g.xg + 0.3 * g.lam),
        qc = band(g.xb + 4 * S.dx, g.xe - 6 * S.dx), qs = S.p.inflow.q;
    return { qApproach: +qa.toFixed(4), qCrest: +qc.toFixed(4), qSlider: qs,
             errApproach: +(100 * (qa / qs - 1)).toFixed(2),
             errCrest: +(100 * (qc / qs - 1)).toFixed(2),
             imbalance: +(100 * (qc / qa - 1)).toFixed(2) };
  },

  /** Water depth on the DRAINING FLOOR well past the brink — the overfall is
   *  free only while this stays clear of the crest (WE-1's test).  Only
   *  columns whose bed is the domain floor count: the falling nappe itself
   *  reports a spurious "bed" (CLAUDE.md — classify only water standing on
   *  something), so a naive max over all downstream columns reads the sheet. */
  plunge: function () {
    var S = APP.sim, g = DA1.G, c = APP.SIM.columns(true), top = 0,
        i0 = Math.round((g.xe + 0.8) / S.dx), i1 = S.nx - 4;
    for (var i = i0; i < i1; i++)
      if (c[i * 4] < 3 * S.dx && c[i * 4 + 3] > top) top = c[i * 4 + 3];
    return { poolTop: +top.toFixed(3), crest: +g.crest.toFixed(3),
             freeboard: +(g.crest - top).toFixed(3) };
  },

  check: function () {
    var S = APP.sim, g = DA1.G || DA1.geom(1);
    return { grid: S.nx + "x" + S.ny, dx: +S.dx.toFixed(5),
             dt: +APP.SIM.dt().toExponential(3), lam: g.lam,
             geom: { P: +g.P.toFixed(4), Lc: +g.Lc.toFixed(4), xb: +g.xb.toFixed(4),
                     xe: +g.xe.toFixed(4), xg: +g.xg.toFixed(4) },
             block: DA1.checkBlock(), q: S.p.inflow.q, level: S.p.inflow.level,
             open: S.p.open.join(","), gauge: DA1.XG };
  },

  /* THE SHIPPED WORKSHEET TABLE.  Both panel sliders have step = 0.005, so a
   * student can only set multiples of 5 mm / 0.005 m²/s: the table is the
   * base-q rule and the level rule above, SNAPPED to that grid, and it is
   * what §5's verification runs actually used — so a submission can be
   * spot-checked by re-running exactly these numbers. */
  QTAB:  [0.600, 0.235, 0.090, 0.780, 0.295, 0.115, 0.960, 0.360, 0.135, 1.140],
  LVTAB: [1.795, 1.165, 0.840, 1.890, 1.210, 0.865, 1.975, 1.250, 0.880, 2.055],

  /** The whole thing: DA1.student(2) → what digit 2 submits. */
  student: function (d, settle, rec, o) {
    var lam = DA1.lambda(d), qb = DA1.qbase(d), q = DA1.QTAB[d];
    o = o || {}; if (o.q === undefined) o.q = q;
    if (o.level === undefined) o.level = DA1.LVTAB[d];
    APP.loadScene('sandbox', false);          // start from an empty box
    DA1.build(lam, qb, o);
    DA1.settle(settle === undefined ? DA1.settleFor(lam) : settle);
    var r = DA1.record(rec === undefined ? 10 : rec);
    r.d = d; r.lam = lam; r.qbase = qb; r.q = q; r.P = +DA1.G.P.toFixed(4);
    r.level = APP.sim.p.inflow.level;
    r.HP = +(r.H / r.P).toFixed(4);
    r.Cd = +(q / (Math.sqrt(9.81) * Math.pow(r.H, 1.5))).toFixed(4);
    r.mass = DA1.massCheck(); r.plunge = DA1.plunge();
    return r;
  },

  /** Settle time scales as √λ (DA-2's own result) — the λ=¼ rig fills 2× faster. */
  settleFor: function (lam) { return Math.max(18, Math.round(55 * Math.sqrt(lam))); },

  sweep: function (ds) {
    return (ds || [0,1,2,3,4,5,6,7,8,9]).map(function (d) { return DA1.student(d); });
  },
};
/* MEASURED, this machine, Medium — see README §5 for the full table.
   DA1.build(1, 0.72)  -> crestRasterised 1.1957, P 32 cells, Lc 80 cells, sealed
   DA1.build(0.25,0.72)-> crestRasterised 0.6739, P  8 cells, Lc 20 cells, sealed */
