/* ============================================================================
 * MO-1 · SLUICE GATE ON RIG-B — thrust and C_d from the control volume
 * ----------------------------------------------------------------------------
 * Paste into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *   MOGATE.build({a: 0.152, q: 0.33, level: 0.70})   // bare rig, one setting
 *   MO1.student(6)                                    // one whole MO-1 run, digit d = 6
 *
 * RIG-B's free-downstream pattern (WE-1's finding, CLAUDE.md "outfall
 * edges"): a bed slab carried across the WHOLE domain with an Open right
 * edge and no tailwater PONDS to ~1.46 m and drowns any structure on it. The
 * fix, reused here unchanged: carry the bed only as far as the gate needs
 * (a short apron so the vena contracta forms on solid ground and the jet is
 * confirmed free/supercritical), then let the bed END and the floor fall to
 * an Open bottom edge, so the plunge has somewhere to go and nothing ponds
 * back onto the jet.
 *
 *   y=5.0 ┌──────────────────────────────────────────────────────┐
 *         │  air (the two sandbox ledges are ERASED)             │
 *         │                          ┃ gate, top well clear       │
 *         │  reservoir pool ~~~~~~~~~┃                            │
 *         │                          ┃ opening a  ↓ vena contracta│  open floor
 *   y=0.5 ├──────────────────────────┸────╌╌╌╌╌─────┤            │  beyond the
 *   y=0.0 └──────────────────────────────────────────┘  (bed ends, apron)
 *         0                        5.5   5.5+a  ~7.0 (bx1)      9.0
 *
 * Every call below is a documented app entry point (same as WE-1's rig.js):
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = the C key       SIM.undoSeg() = the Z key
 *   CONTROLS.find(c => c.id === "…").set(v); syncPanel()   = moving a slider
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   SIM.columns(true) → Float32Array, 4 per column: bed, depth, q, surface
 *
 * MEASURED FACTS (Medium, 414×230, Δx 21.7391 mm, dt 3.494e-4 s, W×H = 9×5 m)
 *   · bed top face y = 0.50 m lands exactly on a cell boundary (23 cells) —
 *     same RIG-B convention as WE-1; keep every elevation a Δx multiple.
 *   · the gate opening a is READ OFF THE RASTERISED MASK, not the drawn
 *     value — addSeg quantises to whole cells and a "0.152 m" request can
 *     land a cell either side. MOGATE.build() self-checks this (see
 *     `check().gate.aCells`) exactly the way WE-1 self-checks the crest.
 *   · PANEL q IS FROZEN, NOT LIVE, under head-driven inflow. sim.p.inflow.q
 *     is a plain JS field set only by the slider (js/main.js:162); nothing
 *     writes it back from the solver. With "Head-driven inflow" ON the GPU
 *     ignores it (u_in.a carries the free-flag, not a value) and the panel
 *     note under "Inflow q" keeps showing whatever the slider was last set
 *     to — for the venturi scene that default is q:0, so the note reads
 *     "0.000 m²/s ... y_c = 0.000 m" while real water is plainly moving.
 *     MEASURED here: with the gate rig, free ON, level 0.70 m, run 45 s,
 *     `sim.p.inflow.q` stayed at its pre-toggle value (0.300) to 3 dp while
 *     the true column discharge (SIM.columns / the hover "q" row) settled
 *     at a DIFFERENT number entirely. See MO1_HEADDRIVEN_LOG below and the
 *     README §2. This is why MO-1 ships q-mode, not head-driven.
 *   · the sandbox's own two ledges (y ≈ 2.0–3.4) must be ERASED.
 *   · bottom edge must be OPEN once the bed is truncated (draws at the
 *     free-fall rate, CLAUDE.md "outfall edges" note) — Wall would pond the
 *     plunge against the truncated bed's cut face.
 *   · right edge OPEN (zero-gradient) — nothing reaches it at more than a
 *     trickle once the apron ends and the bottom opens.
 *   · the RESERVOIR pins the surface AT its level, so — exactly as WE-1 —
 *     the level must be set to what the gate's own backwater wants. See
 *     MO1.LEVEL and the README q→level-per-opening table.
 * ==========================================================================*/
window.MOGATE = {
  BED: 0.50,          // top face of the bed slab (a multiple of Δx at Medium)
  X0: -0.30,           // slab runs PAST the left domain edge — extrapolate
  GATE_X: 5.50,        // gate position: ~5.5 m of approach, ~1.6 m of apron
  APRON: 1.60,         // bed continues this far past the gate before opening
  GATE_TOP: 3.00,      // gate plate top — clear of any pool this rig can make
  PLATE_TH: 0.05,      // drawn plate thickness: 2–3 cells at Medium, sealed
  GAUGE_DX: 2.00,       // upstream gauge station: gate x − this

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Build the rig. o = { a, q, level, free, gateX, apron, cf, cs, gaugeUX } */
  build: function (o) {
    o = o || {};
    var R = MOGATE, bed = R.BED;
    var gx = o.gateX === undefined ? R.GATE_X : o.gateX;
    var apron = o.apron === undefined ? R.APRON : o.apron;
    var bx1 = gx + apron;
    var gtop = o.gateTop === undefined ? R.GATE_TOP : o.gateTop;
    var th = o.th === undefined ? R.PLATE_TH : o.th;
    var a = o.a;

    // ---- panel: strip the sandbox back to a plain flume -------------------
    R.C("spoutOn").set(false);
    R.C("openL").set("1");              // reservoir edge
    R.C("openR").set("1");              // zero-gradient — nothing reaches it
    R.C("openB").set("1");              // bed truncated: floor must drain
    R.C("openT").set("0");
    R.C("waveOn").set(false);

    // ---- geometry -----------------------------------------------------------
    APP.SIM.clearSegs();
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.10, 0);   // erase the two sandbox
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.10, 0);   // ledges first
    // bed slab: past the left edge to the apron end (bx1) — NOT to the right
    // domain edge (that is the canonical-RIG-B ponding trap, CLAUDE.md).
    APP.SIM.addSeg(R.X0, bed / 2, bx1, bed / 2, bed, 255);
    // gate: a vertical plate hung from well above the pool DOWN to bed + a —
    // the butt end at (gx, bed+a) is the sill lip; opening a is the gap
    // between the bed's top face and that lip. Do not embed it in the bed
    // (unlike a weir, there must be a real gap for the flow to pass through).
    APP.SIM.addSeg(gx, gtop, gx, bed + a, th, 255);
    R.gate = { x: gx, a: a, th: th, bed: bed, top: gtop, apronEnd: bx1 };

    // ---- controls -------------------------------------------------------
    R.C("inflowOn").set(true);
    R.C("inFree").set(!!o.free);
    if (o.q !== undefined) R.C("inQ").set(o.q);
    if (o.level !== undefined) R.C("inLevel").set(o.level);
    R.C("twOn").set(false);
    if (o.cf !== undefined) R.C("cf").set(o.cf);
    if (o.cs !== undefined) R.C("cs").set(o.cs);
    R.C("mode").set("0");
    R.C("channel").set(false); R.C("labels").set(false); R.C("jumps").set(false);
    syncPanel();
    R.gauge(o.gaugeUX === undefined ? gx - R.GAUGE_DX : o.gaugeUX);
    return R.check();
  },

  gauge: function (x, y) {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: x, y: y === undefined ? MOGATE.BED + 0.15 : y,
                            hist: [], colour: "#7fd4ff" });
    APP.state.gaugeField = "depth";
    MOGATE.XG = x;
  },

  /** Rasterised opening — read off sim.mask at the gate column, not the
   *  drawn value (addSeg quantises to whole cells). */
  checkGate: function () {
    if (!MOGATE.gate) return { gate: false };
    var S = APP.sim, g = MOGATE.gate, i = Math.round(g.x / S.dx),
        jbed = Math.round(g.bed / S.dx), j = jbed, top = jbed;
    // walk up from the bed until solid (the gate) is hit
    while (j < S.ny && S.mask[j * S.nx + i] < 64) j++;
    var aCells = j - jbed;
    // confirm the bed itself is solid directly under the opening, and the
    // gate above the opening is solid up to (at least) its drawn top
    var bedSolid = S.mask[(jbed - 1) * S.nx + i] >= 64;
    var jtop = Math.round(g.top / S.dx);
    var plateSolid = true;
    for (var k = j; k < jtop; k++) if (S.mask[k * S.nx + i] < 64) plateSolid = false;
    return { gate: true, x: g.x, aDrawn: +g.a.toFixed(4),
             aRasterised: +(aCells * S.dx).toFixed(4), aCells: aCells,
             bedSolid: bedSolid, plateSolid: plateSolid };
  },

  cols: function () {
    var S = APP.sim, c = APP.SIM.columns(true), out = [];
    for (var i = 0; i < S.nx; i++)
      out.push({ x: +(i * S.dx).toFixed(3), bed: c[i * 4], h: c[i * 4 + 1],
                 q: c[i * 4 + 2], surf: c[i * 4 + 3] });
    return out;
  },

  /** Find the vena contracta downstream of the gate: the local MINIMUM raw
   *  depth in a window starting just past the plate's OWN footprint (its
   *  columns read the gap height, not the jet) and capped at +0.5 m so the
   *  mid-apron recovery undulation can never be mistaken for the true
   *  contraction. */
  findVena: function () {
    var S = APP.sim, g = MOGATE.gate, c = APP.SIM.columns(true);
    var i0 = Math.round((g.x + g.th / 2) / S.dx) + 1,
        i1 = Math.min(S.nx - 1, Math.round((g.x + 0.5) / S.dx), Math.round(g.apronEnd / S.dx) - 2);
    var best = -1, bh = Infinity;
    for (var i = i0; i <= i1; i++) {
      var h = c[i * 4 + 1];
      if (h > 0.003 && h < bh) { bh = h; best = i; }
    }
    if (best < 0) return null;
    return { i: best, x: +(best * S.dx).toFixed(4), h: +bh.toFixed(4),
             dxFromGate: +((best * S.dx) - g.x).toFixed(4) };
  },

  check: function () {
    var S = APP.sim;
    return { grid: S.nx + "x" + S.ny, dx: +S.dx.toFixed(5),
             dt: +APP.SIM.dt().toExponential(3), gate: MOGATE.checkGate(),
             q: S.p.inflow.q, level: S.p.inflow.level, free: S.p.inflow.free,
             open: S.p.open.join(","), c: S.p.c, cf: S.p.cf, cs: S.p.cs,
             gauge: MOGATE.XG };
  },
};

/* ============================================================================
 * A tiny fidelity check on the hover readout — calls the REAL
 * OVERLAY.drawCursorReadout with a recording fake canvas ctx, so what this
 * returns is exactly the text painted on screen, not a private
 * recomputation (CLAUDE.md / recipe rule).
 * ==========================================================================*/
window.MOHOVER = {
  read: function (x, y) {
    var rows = [], cls = null;
    var ctx = {
      save: function () {}, restore: function () {}, beginPath: function () {},
      fill: function () {}, stroke: function () {}, roundRect: function () {},
      measureText: function (t) { return { width: t.length * 6.2 }; },
      fillText: function (t, px, py) { rows.push(t); },
      set font(v) {}, set fillStyle(v) {}, set strokeStyle(v) {},
      set textAlign(v) {}, set textBaseline(v) {}, set lineWidth(v) {},
    };
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    var probe = APP.sim.probe ? APP.sim.probe(x, y) : APP.probe(x, y);
    OVERLAY.drawCursorReadout(ctx, APP.view, A, APP.sim, x, y, probe);
    var i = Math.max(0, Math.min(APP.sim.nx - 1, Math.floor(x / APP.sim.dx)));
    return { x: x, i: i, painted: rows, ok: !!A.ok[i], hAnalysed: +A.h[i].toFixed(4),
             hRaw: +A.hRaw[i].toFixed(4), Fr: +A.Fr[i].toFixed(3) };
  },
};

/* ============================================================================
 * MO-1 · one student run — sluice gate thrust and C_d
 *   gate at x = 5.50, apron to x = 7.10, gauge at x = 3.50 (2.0 m upstream)
 * ==========================================================================*/
window.MO1 = {
  XG_ELEV: 0.15,     // gauge marker height above bed (cosmetic only)

  /** Personalised opening: last digit of the student number, in CELLS so it
   *  is exact at Medium — see README for the measured band and why (y₀/a >=
   *  2.5 fails at 9 cells, the naive-vs-CV mismatch is too small to see at
   *  4 cells and the pool gets impractically deep below 5). */
  aCells: function (d) { return 5 + Math.round(3 * d / 9); },   // 5,5,6,6,6,7,7,7,8,8
  a: function (d) { return +(MO1.aCells(d) * APP.sim.dx).toFixed(4); },

  /** Class-wide fixed discharge (m²/s per m width) — see README §2 for why
   *  this ships q-mode (fixed q, personalised a) rather than head-driven. */
  Q: 0.33,

  /** MEASURED reservoir level for each opening (fixed-point pass, same
   *  method as WE-1: level ← measured pool surface, one correction settles
   *  it). Keyed on aCells so the digit table is a two-step lookup. */
  LEVEL: { 5: 1.7565, 6: 1.4181, 7: 1.2103, 8: 1.0791 },
  level: function (d) { return MO1.LEVEL[MO1.aCells(d)]; },

  /** The vena-contracta hover station: a FIXED distance downstream of the
   *  gate centreline, not a per-student search. MEASURED (station-fidelity
   *  scan, a = 7 cells): the hover box's "depth h" is corrupted by the
   *  spatial smoothing window straddling the gate for the first ~3 cells
   *  past the gate (h read 0.336 m vs a true 0.147 m at the gate itself —
   *  2.3×, and still +40% two cells further), settles onto the true value
   *  (within ~3%) from 4 cells past the gate and stays flat through at
   *  least cell 6; the mid-apron recovery undulation only begins after
   *  that. 6 cells (0.13 m) sits in the middle of that flat, honest window
   *  for every shipped opening. See README §2 "hover reliability". */
  VENA_DX: 6,     // cells downstream of the gate centreline
  venaX: function () { return +(MOGATE.GATE_X + MO1.VENA_DX * APP.sim.dx).toFixed(4); },

  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  record: function (secs) {
    var S = APP.sim, g = APP.state.gauges[0];
    g.hist.length = 0;
    APP.state.paused = false;
    var t0 = S.t, n = 0;
    while (APP.sim.t - t0 < (secs || 8) && n < 60 * (secs || 8) * 4 + 400) {
      APP.frames(1, 1 / 60); n++;
    }
    APP.state.paused = true; APP.frames(2);
    var a = g.hist.map(function (r) { return r.depth; }).sort(function (p, q) { return p - q; });
    var med = a[a.length >> 1], mean = a.reduce(function (p, q) { return p + q; }, 0) / a.length;
    return { t: +S.t.toFixed(2), n: a.length, y0: +med.toFixed(4), y0Mean: +mean.toFixed(4),
             y0Min: +a[0].toFixed(4), y0Max: +a[a.length - 1].toFixed(4) };
  },

  /** g = 9.81. C_d = q/(a*sqrt(2 g y0)); F_R = rho q (V0-V1) + 0.5 rho g (y0^2-y1^2);
   *  naive = 0.5 rho g (y0-a)^2 — the "why not hydrostatics?" comparator. */
  derive: function (a, q, y0, y1) {
    var g = 9.81, rho = 1000;
    var V0 = q / y0, V1 = q / y1;
    var Cd = q / (a * Math.sqrt(2 * g * y0));
    var FR = rho * q * (V0 - V1) + 0.5 * rho * g * (y0 * y0 - y1 * y1);
    var naive = 0.5 * rho * g * Math.pow(y0 - a, 2);
    return { a: a, q: q, y0: y0, y1: y1, V0: +V0.toFixed(3), V1: +V1.toFixed(3),
             y0_a: +(y0 / a).toFixed(3), y1_a: +(y1 / a).toFixed(3),
             Cd: +Cd.toFixed(4), FR: +FR.toFixed(1), naive: +naive.toFixed(1),
             diffPct: +(100 * (FR - naive) / naive).toFixed(1) };
  },

  /** One full seed->fixed-point->record run at a fixed (a, q), starting
   *  from a level GUESS. Mirrors WE-1's protocol: fresh scene -> build ->
   *  settle -> correct level to the measured pool surface -> settle again
   *  (shorter) -> record. Returns everything needed for one CSV row. */
  run: function (a, q, levelGuess, o) {
    o = o || {};
    var s1 = o.settle1 === undefined ? 35 : o.settle1;
    var s2 = o.settle2 === undefined ? 18 : o.settle2;
    var rec = o.rec === undefined ? 8 : o.rec;
    APP.loadScene('sandbox', false);
    MOGATE.build({ a: a, q: q, level: levelGuess, gaugeUX: MOGATE.GATE_X - MOGATE.GAUGE_DX });
    MO1.settle(s1);
    var r1 = MO1.record(6);
    var lvl2 = +(MOGATE.BED + r1.y0).toFixed(4);
    MOGATE.C('inLevel').set(lvl2); syncPanel();
    MO1.settle(s2);
    var r2 = MO1.record(rec);
    var vena = MOGATE.findVena();
    var d = MO1.derive(a, q, r2.y0, vena.h);
    return { a: a, aCells: Math.round(a / APP.sim.dx), q: q, levelSeed: levelGuess,
             levelFixed: lvl2, y0: r2.y0, y0Flutter: +(r2.y0Max - r2.y0Min).toFixed(4),
             venaX: vena.x, venaDxFromGate: vena.dxFromGate, y1: vena.h,
             derived: d, t: r2.t };
  },

  /** The whole thing, from a cold scene, using ONLY the fixed station rule
   *  a student is given (README §3) — NOT the findVena() search, so this
   *  reproduces exactly what gets submitted. MO1.student(6) -> digit 6. */
  student: function (d, settle1, settle2, rec) {
    var a = MO1.a(d), q = MO1.Q, lv = MO1.level(d);
    APP.loadScene('sandbox', false);
    MOGATE.build({ a: a, q: q, level: lv, gaugeUX: MOGATE.GATE_X - MOGATE.GAUGE_DX });
    MO1.settle(settle1 === undefined ? 40 : settle1);
    var r1 = MO1.record(6);
    var lvl2 = +(MOGATE.BED + r1.y0).toFixed(4);   // one fixed-point correction
    MOGATE.C('inLevel').set(lvl2); syncPanel();
    MO1.settle(settle2 === undefined ? 20 : settle2);
    var r2 = MO1.record(rec === undefined ? 10 : rec);
    var hv = MOHOVER.read(MO1.venaX(), MOGATE.BED + 0.10);
    var y1 = hv.hAnalysed;                         // exactly what the hover box prints
    var der = MO1.derive(a, q, r2.y0, y1);
    return { d: d, aCells: MO1.aCells(d), a: a, q: q, level: lv, levelFixed: lvl2,
             y0: r2.y0, y0Flutter: +(r2.y0Max - r2.y0Min).toFixed(4),
             venaX: MO1.venaX(), y1: y1, y1Raw: hv.hRaw, Fr1: hv.Fr,
             Cd: der.Cd, FR: der.FR, naive: der.naive, diffPct: der.diffPct, t: r2.t };
  },
};

/* MEASURED, this machine, Medium — head-driven inflow, same gate (a = 7
 * cells) and the SAME level (1.19) that q-mode's fixed point uses at q =
 * 0.33: after 45 s settle, sim.p.inflow.q (and therefore the "Inflow q"
 * panel note) stayed frozen at its pre-toggle value, 0.330 — while the
 * ACTUAL column discharge settled at 0.307-0.309 (approach column 0.3094,
 * vena column 0.3073), a real ~7% away with NO on-panel number showing it.
 * The reservoir's own delivered level was also short of the slider: gauge
 * y0 read 0.6125 m against the "0.69 m deep at the inlet" the n_inLevel
 * note promised (FR-1's sponge-offset finding, P3, reproduced here). Two
 * independent reasons head-driven does not ship for this demo — see
 * README §2. */
window.MO1_HEADDRIVEN_LOG = {
  a: 0.1522, level: 1.19, panelInflowQField: 0.330,
  panel_n_inQ_text: "0.330 m²/s per m width  →  0.50 m/s   y_c = 0.223 m",
  panel_n_inLevel_text: "1.19 m above datum  ·  0.69 m deep at the inlet",
  gaugeY0: 0.6125, approachColumnQ: 0.3094, venaColumnQ: 0.3073, settleSecs: 45,
};
