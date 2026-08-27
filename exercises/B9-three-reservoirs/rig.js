// B9 · RIG-C EXTENDED "THREE RESERVOIRS, ONE JUNCTION" — paste into the dev
// console to rebuild this rig. Shipped as the DYNAMIC demo (see README):
// quasi-steady Q_B measurement was tried and its drift is too fast to trust
// (see README's Director report, Iterations) — B genuinely equalises with
// the junction over ~15-20 s, so what a student reports is an early-window
// transient reading, not a steady-state one, and the class's pooled crossing
// sits well above the settled junction head. Both numbers are real and both
// are reported; that gap IS part of the lesson.
//
//   Classic three-reservoir problem in a 2D vertical slice. Two of the three
//   branches (A, C) use the app's own edge level controls (reservoir left,
//   tailwater right) exactly like every GVF scene. The THIRD reservoir (B)
//   has nowhere to go — both level controls are taken — so it is built as a
//   genuine floating tank standing in a narrow vertical shaft directly above
//   the junction, its own pipe being that shaft's lower stretch. A and C's
//   pipes are horizontal (QS-2's floor-trim trick); B's pipe is the SAME
//   trick rotated 90 degrees: a valve column spanning the shaft's full width
//   from the bed up to `gateH`, aimed at z = 0 so the bottom-edge trim shaves
//   its lowest row exactly as it does for a horizontal pipe.
//
//   Because toggleValve()/V flips EVERY valve cell at once (P8 in
//   CHANGES-NEEDED.md), all three branch gaps are wired to the SAME valve so
//   there is only one thing to stage: closed while A, C fill from their edge
//   controls and B is rained in from a scripted pour; then opened ONCE, all
//   three branches connecting simultaneously — which is exactly the classic
//   problem's set-up (three pipes commissioned together), not a limitation.
//
//   Open ?scene=sandbox, then:
//     B9.build({zB: 2.0})
//     B9.fillAC()          // reservoir + tailwater, valve shut throughout
//     B9.fillB()           // scripted pour into the shaft, valve still shut
//     B9.settle(6)
//     B9.release(6)        // opens the valve, ticks to the window start
//     B9.measure(20, 0.5)  // quasi-steady read: 20 probe samples, 0.5 s apart
//
//   measure() reads everything with probe()/columns() inside one synchronous
//   call — never APP.frames()/gauge history, which the render loop keeps
//   appending to (frozen duplicates) the instant a separate eval call
//   returns control to the browser. See measure()'s own comment.
//
//   GEOMETRY (metres, domain 9 x 5; Medium = 414 x 230 cells, dx = 21.7 mm)
//     tank A     x 0 .. xA                     reservoir-controlled, level zA
//     block 1    x xA .. xA+L1                 A-J pipe length L1
//     shaft      x xJ0 .. xJ1 (width wJ)       junction + B's own tank
//     block 2    x xJ1 .. xJ1+L2               J-C pipe length L2
//     tank C     x xJ1+L2 .. 9                 tailwater-controlled, level zC
//   A-J, C-J pipes: horizontal valve bands aimed at z = 0 (floor-trim).
//   B-J "pipe": the shaft's own lower stretch, y 0..gateH, valve the FULL
//     shaft width — a vertical duct of length gateH, gap wJ.
window.B9 = {
  C: (id) => CONTROLS.find((c) => c.id === id),

  P: {
    xA: 1.5, L1: 1.0, wJ: 0.55, L2: 1.0,     // plan geometry
    pipeBrush: 0.20,                          // A-J, C-J gap (brush, floor-trimmed)
    gateH: 1.0,                               // B-J riser duct length
    blockTop: 4.2,                            // block1/block2 (and shaft) wall height
    cs: 0.40,                                 // Smagorinsky C_s — the pipe roughness knob
    zA: 3.2, zC: 0.6, zB: 2.0,                // levels (elevations above the datum)
    gJx: null, gJy: 0.5,                      // junction gauge (within the gate column)
    // B's own gauge MUST sit ABOVE the gate (gateH): below it, the point is
    // inside the closed-valve solid, so probe() always reads f=0/head=0
    // there regardless of how much water is stacked above — a dry read that
    // looks like "still low" and defeated the fillB() stop condition on the
    // first pass (found by inspection: the shaft read f > 1.06, head ~3.5 m
    // at z = 1.1 after a pour that never saw its own gauge move).
    gBy: null,                                // set from gateH in build(); see below
  },

  geomX() {
    const P = B9.P;
    const xJ0 = P.xA + P.L1, xJ1 = xJ0 + P.wJ, xC0 = xJ1 + P.L2;
    return { xA: P.xA, xJ0, xJ1, xC0, xJc: 0.5 * (xJ0 + xJ1) };
  },

  // ------------------------------------------------------------- build
  build(o) {
    o = o || {};
    // Only copy DEFINED keys onto the shared P object — `for...in` also
    // visits keys present with value `undefined` (e.g. a caller passing
    // {zA: opts.zA} where opts.zA was never set), which silently poisons
    // P.zA/P.zC for every build after it. Bit this once: a subsequent
    // build()'s own syncPanel() call crashed formatting sim.p.inflow.level
    // (undefined.toFixed), i.e. the corruption outlives the call that
    // caused it and breaks unrelated later runs.
    const P = B9.P, C = B9.C;
    for (const k in o) if (o[k] !== undefined) P[k] = o[k];
    C("budget").set("Medium");
    C("spoutOn").set(false);
    C("cs").set(P.cs);
    C("openL").set("1"); C("openR").set("1");
    C("openB").set("0"); C("openT").set("0");
    C("gaugeField").set("h");
    C("mode").set("0");
    // Defensive: guarantee valid numeric levels before the FIRST syncPanel()
    // call below, rather than relying on fillAC() (which runs later) to set
    // them — build() must never hand the panel an undefined level.
    C("inLevel").set(P.zA); C("twLevel").set(P.zC);
    state.paused = true;          // no stray drift between tool calls
    SIM.clearSegs();

    const X = B9.geomX();
    const xc1 = 0.5 * (P.xA + X.xJ0), xc2 = 0.5 * (X.xJ1 + X.xC0);
    const segs = [
      // block 1 (A | J), from below the floor so its lower end needs no aim
      [xc1, -0.20, xc1, P.blockTop, P.L1, 255],
      // block 2 (J | C)
      [xc2, -0.20, xc2, P.blockTop, P.L2, 255],
      // A-J pipe: valve band aimed at the floor, overshooting both faces of block 1
      [P.xA - 0.07, 0, X.xJ0 + 0.07, 0, P.pipeBrush, 128],
      // J-C pipe: symmetric through block 2
      [X.xJ1 - 0.07, 0, X.xC0 + 0.07, 0, P.pipeBrush, 128],
      // B-J riser: the shaft's own full width, valve, from the floor up to gateH.
      // Aimed at z = 0 so the same bottom-edge trim applies (removes its lowest
      // row); above gateH the shaft is left open — that IS tank B.
      [X.xJc, -0.20, X.xJc, P.gateH, P.wJ, 128],
    ];
    segs.forEach((s) => SIM.addSeg(s[0], s[1], s[2], s[3], s[4], s[5]));

    B9.valve(false);
    const gBy = P.gBy == null ? P.gateH + 0.08 : P.gBy;   // just clear of the gate, see P.gBy note
    state.gauges.length = 0;
    const gJx = P.gJx == null ? X.xJc : P.gJx;
    state.gauges.push({ x: gJx, z: P.gJy, hist: [], colour: "#7fd4ff" });      // 0: junction
    state.gauges.push({ x: X.xJc, z: gBy, hist: [], colour: "#ffd479" });      // 1: tank B
    state.gauges.push({ x: 0.5 * P.xA, z: 0.20, hist: [], colour: "#8effa1" }); // 2: tank A
    state.gauges.push({ x: X.xC0 + 1.0, z: 0.20, hist: [], colour: "#ff8ea1" });// 3: tank C
    syncPanel();
    return B9.geom();
  },

  /** What the rasteriser actually delivered. */
  geom() {
    const s = APP.sim, dx = s.dx, m = s.mask, nx = s.nx, ny = s.ny;
    const X = B9.geomX();
    const col = (x) => Math.floor(x / dx);
    const bandAt = (icol, jmax) => {
      let lo = -1, hi = -1;
      for (let j = 1; j < (jmax || 60); j++) {
        const v = m[j * nx + icol];
        if (v < 200) { if (lo < 0) lo = j; hi = j; }
      }
      return { lo, hi, cells: hi - lo + 1, h: (hi - lo + 1) * dx, invert: lo * dx };
    };
    const iAJ = col(0.5 * (B9.P.xA + X.xJ0));
    const iJC = col(0.5 * (X.xJ1 + X.xC0));
    const iShaft = col(X.xJc);
    return JSON.stringify({
      dx: +dx.toFixed(5), nx, ny,
      xJ0: +X.xJ0.toFixed(3), xJ1: +X.xJ1.toFixed(3), xC0: +X.xC0.toFixed(3),
      pipeAJ: bandAt(iAJ, 40),
      pipeJC: bandAt(iJC, 40),
      shaftLow: bandAt(iShaft, Math.round(B9.P.gateH / dx) + 5),
      segs: s.segs.length,
    });
  },

  // ------------------------------------------------------------- valve
  valve(open) {
    const want = open ? 0 : 1;
    if (APP.sim.p.valveClosed !== want) toggleValve();
    return APP.sim.p.valveClosed;
  },

  // ------------------------------------------------------------- filling
  /** A and C fill straight from their edge controls; independent of each
   *  other and of B, since the shared valve is shut the whole time. */
  fillAC(maxSec) {
    const P = B9.P, C = B9.C;
    state.paused = true;
    B9.valve(false);
    C("inflowOn").set(true); C("inQ").set(0); C("inLevel").set(P.zA);
    C("twOn").set(true); C("twLevel").set(P.zC);
    syncPanel();
    APP.tick(Math.round((maxSec || 40) / APP.SIM.dt()));
    return B9.levels();
  },

  /** B has no edge control, so it is rained in with a scripted pour (the
   *  same mechanism a right-drag "big flow" drives) aimed down the open
   *  shaft above the (still shut) gate. Stops the instant the shaft's own
   *  gauge crosses zB.
   *
   *  The pour height TRACKS the rising surface (current level + ~0.35 m)
   *  instead of being fixed at (or near) the final target. A fixed pour
   *  aimed far above a low starting surface stalls: found by inspection —
   *  aimed 1.3 m above the (still empty) shaft, 2 sim-seconds of pouring
   *  left everything below the pour point bone dry (f = 0 all the way from
   *  the gate up to just under the pour disc) while the disc itself read
   *  f ~ 1.0. The falling column disperses into the VOF's "spray" regime
   *  over a long fall and never coalesces into a rising pool; keeping the
   *  fall short throughout (re-aiming every poll) avoids it entirely. */
  fillB(maxSec) {
    const P = B9.P, X = B9.geomX();
    state.paused = true;
    const el = () => state.gauges[1].z + APP.probe(state.gauges[1].x, state.gauges[1].z).phead;
    const fine = Math.round(0.01 / APP.SIM.dt());
    // A narrow shaft (wJ ~ 0.5 m) fills MUCH faster per unit pour strength
    // than an open tank: measured 1.5-2 m/s of rise from r=0.12/vy=-0.6, so
    // even 0.05 s polling steps overshot a 2 m target by 45%. Weak pour,
    // checked every 0.01 s, trades fill time (still under 2 sim-s) for
    // control. HARD iteration cap so a stuck exit condition is a bounded
    // synchronous loop, not the multi-minute hang an earlier two-speed
    // version produced (recovered only by closing the tab).
    const nMax = 3000;
    let n = 0;
    while (n++ < nMax && el() < P.zB && el() < P.blockTop - 0.15) {
      const cur = Math.max(P.gateH + 0.05, el());     // dry gauge floors at gBy; fine as a start point
      sim.p.pour = { x: X.xJc, y: Math.min(P.blockTop - 0.2, P.zB, cur + 0.35), r: 0.05, vx: 0, vy: -0.10 };
      APP.tick(fine);
    }
    sim.p.pour = null;
    return B9.levels();
  },

  settle(sec) { APP.tick(Math.round((sec || 5) / APP.SIM.dt())); return B9.levels(); },

  levels() {
    const g = state.gauges;
    const el = (k) => +(g[k].y + APP.probe(g[k].x, g[k].y).phead).toFixed(4);
    return JSON.stringify({ t: +APP.sim.t.toFixed(2),
      junction: el(0), B: el(1), A: el(2), C: el(3) });
  },

  // ------------------------------------------------------------- the run
  /** Open the valve and advance `sec` of sim time via plain tick() (no
   *  rendering, no gauge history). Fast, and immune to the ring-buffer
   *  bug below. */
  release(sec) {
    B9.valve(true);
    APP.tick(Math.round((sec || 0) / APP.SIM.dt()));
    return B9.levels();
  },

  /** One complete student run: draw, fill, settle, release to the start of
   *  the measurement window. Call B9.measure() next. */
  cycle(o, relSec) {
    B9.build(o || {});
    B9.fillAC();
    B9.fillB();
    B9.settle(5);
    return B9.release(relSec == null ? 6 : relSec);
  },

  // ------------------------------------------------------- digit rule
  /** z_B(0) = 1.20 + 0.16 d  metres  (d = 0..9 -> 1.20 .. 2.64 m), bracketing
   *  the measured natural junction head (~1.65-1.75 m with A = 3.2, C = 0.6).
   *  fillB() targets a level that COLLAPSES by a measured, consistent ~17.5%
   *  once the fill's own turbulence settles (a vigorously poured column
   *  reads taller than its resting depth for the first few seconds — found
   *  by profiling f(y) through a fillB+settle: right after filling the
   *  column has a dry GAP mid-height, f = 1.02/0.00/0.86/0, that closes as
   *  the column consolidates; total volume barely moves, ~1.3% over 4 s, so
   *  it is genuinely a shape change, not a leak). Dividing by 0.825 in the
   *  fill call compensates; this is what B9.runStudent() uses. */
  digitZB0(d) { return 1.20 + 0.16 * (((d % 10) + 10) % 10); },
  digitFillTarget(d) { return B9.digitZB0(d) / 0.825; },

  /** One full student run: build -> fill A/C/B -> settle (consolidate) ->
   *  release -> early-window measure. Returns everything a student would
   *  read off their own screen: z_B(0) (post-settle, PRE-release — the
   *  number they'd write down before touching the valve), the early
   *  junction head, the three branch flows/signs, and the continuity
   *  closure. `student` is any label (digit or id) carried through to the
   *  output for convenience. */
  runStudent(d, opts) {
    opts = opts || {};
    const fillTarget = opts.fillTarget != null ? opts.fillTarget : B9.digitFillTarget(d);
    const bo = { zB: fillTarget };
    if (opts.zA != null) bo.zA = opts.zA;
    if (opts.zC != null) bo.zC = opts.zC;
    B9.build(bo);
    B9.fillAC(opts.fillACsec || 45);
    B9.fillB(opts.fillBsec || 90);
    B9.settle(opts.settleSec == null ? 10 : opts.settleSec);   // let the fill's own turbulence consolidate
    const z0 = JSON.parse(B9.levels());
    B9.release(opts.releaseSec == null ? 1.5 : opts.releaseSec);
    const early = JSON.parse(B9.measure(opts.n || 12, opts.dt || 0.3));
    return { student: d, fillTarget: +fillTarget.toFixed(4), zB0: z0.B, zA0: z0.A, zC0: z0.C, early };
  },

  // --------------------------------------------------------- measurement
  /** Quasi-steady read, taken as `nSamples` DIRECT probe/column reads spaced
   *  `dtSample` sim-seconds apart, advanced with plain tick() between each —
   *  never APP.frames()/gauge history. Found the hard way: state.paused is
   *  irrelevant to sampleGauges() (js/main.js tickFrame calls it
   *  unconditionally), so the VISIBLE tab's own render loop keeps appending
   *  frozen duplicate samples the instant a synchronous eval call returns —
   *  measured here as an entire 900-sample buffer overwritten with one
   *  frozen instant within the few seconds between two separate `eval`
   *  calls (QS-2/CHANGES-NEEDED's ring-buffer note, but it bites even
   *  harder mid-transient than for a single paused read). Reading
   *  everything with probe()/columns() inside ONE synchronous script sidesteps
   *  it completely — nothing is ever read back after the script returns. */
  measure(nSamples, dtSample) {
    const P = B9.P, X = B9.geomX();
    const dx = APP.sim.dx;
    const col = (x) => Math.floor(x / dx);
    const iAJ = col(0.5 * (P.xA + X.xJ0)), iJC = col(0.5 * (X.xJ1 + X.xC0));
    const gJ = state.gauges[0], gB = state.gauges[1];
    const n = nSamples || 20, dt = dtSample || 0.5;
    const steps = Math.max(1, Math.round(dt / APP.SIM.dt()));
    const t0 = APP.sim.t;
    const T = [], Hj = [], ZB = [], QA = [], QC = [];
    for (let k = 0; k < n; k++) {
      if (k > 0) APP.tick(steps);
      const c = SIM.columns(true);
      T.push(APP.sim.t - t0);
      Hj.push(gJ.y + APP.probe(gJ.x, gJ.y).phead);
      ZB.push(gB.y + APP.probe(gB.x, gB.y).phead);
      QA.push(c[iAJ * 4 + 2]);
      QC.push(c[iJC * 4 + 2]);
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    // dz_B/dt by linear regression on (T, ZB) — robust to sample noise.
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < n; k++) { sx += T[k]; sy += ZB[k]; sxx += T[k] * T[k]; sxy += T[k] * ZB[k]; }
    const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
    const qA = mean(QA), qC = mean(QC), qB = P.wJ * slope;

    // Signed INTO the junction: qA (A -> J, +x) is already the right sign;
    // qC as read is the J -> C direction (+x), so into-junction is -qC;
    // qB > 0 means B's level is RISING (net inflow to B), so into-junction is -qB.
    const continuity = qA + (-qC) + (-qB);
    const scale = Math.abs(qA) + Math.abs(qC) + Math.abs(qB);
    return JSON.stringify({
      n, dtSample: dt, span: +(T[n - 1]).toFixed(3),
      Hjunction: +mean(Hj).toFixed(4), HjunctionSD: +Math.sqrt(mean(Hj.map((h) => (h - mean(Hj)) ** 2))).toFixed(4),
      zB_mean: +mean(ZB).toFixed(4), zB_first: +ZB[0].toFixed(4), zB_last: +ZB[n - 1].toFixed(4),
      dzBdt: +slope.toFixed(5),
      qA: +qA.toFixed(4), qC: +(-qC).toFixed(4), qB: +qB.toFixed(4),
      continuity: +continuity.toFixed(4), scale: +scale.toFixed(4),
      continuityPct: +(100 * continuity / Math.max(scale, 1e-6)).toFixed(2),
    });
  },
};
