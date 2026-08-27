// QS-2 · RIG-C "TWIN TANKS" — paste into the dev console to rebuild this rig.
//
//   Two open tanks standing on the closed bottom edge, joined by a 1.6 m pipe
//   at the base. The pipe IS a valve band cut through the dividing block, so
//   `V` (or the Valve button) releases it. Not a SHORT pipe: a short one
//   equalises two 2 m tanks in 2-6 s, which is unreadable — the length and
//   C_s = 0.40 are the two levers that put t_1/2 in a 9-23 s band.
//
//   Open ?scene=sandbox, then:
//     QS2.build({A2: 1.5})   // draw the rig (Medium, ledges erased, edges Wall)
//     QS2.fill()             // level tank 2 to 0.50, isolate, fill tank 1 to 2.00
//     QS2.settle(4)          // let the filling seiche die
//     QS2.run(30)            // open the valve and record both gauges
//     QS2.thalf()            // → {dh0, thalf, ...}
//
//   Everything a student does by hand is done here by the same code path:
//   CONTROLS setters, SIM.addSeg, state.gauges.push, toggleValve().
//
//   GEOMETRY (metres, domain 9 x 5; Medium = 414 x 230 cells, dx = 21.7 mm)
//     floor           the CLOSED bottom edge (all four edges Wall)
//     tank 1          x 0.00 .. 2.00        (A1 = 2.00 drawn, 1.978 delivered)
//     divider block   x 2.00 .. 2.00+L      (L = 1.60 m = the pipe length)
//     tank 2          x 2.00+L .. 2.00+L+A2 (A2 personalised, 0.50 + 0.25 d)
//     pipe            a VALVE stroke drawn ALONG the bottom edge through the
//                     block. rasterise() stamps the closed ring last, so it
//                     trims the band's lowest row: the pipe height is the
//                     BRUSH width (0.1208 -> 2 cells -> a = 0.0435 m), not
//                     where the stroke was aimed. That is what makes it
//                     reproducible by hand.
//     C_s = 0.40      set before building — with the stock 0.16 the tanks
//                     equalise in 2-6 s instead of 9-23 s.
window.QS2 = {
  C: (id) => CONTROLS.find((c) => c.id === id),

  P: {
    A1: 2.00,          // tank 1 width, m — fixed by the exercise
    A2: 2.00,          // tank 2 width, m — personalised, 0.5 .. 3.0
    L: 1.60,           // divider thickness = pipe length, m
    cs: 0.40,          // Smagorinsky C_s — the pipe's roughness knob (FR-1)
    brush: 0.1208,     // valve-stroke thickness -> 2-cell pipe (] x3 from default)
    floorTop: 0.00,    // the tanks stand on the closed bottom edge
    wallTop: 3.20,     // how high the walls are drawn
    pipeY: 0.00,       // pipe stroke aimed AT the domain floor
    hi: 2.00,          // tank 1 start level (elevation above the datum)
    lo: 0.50,          // tank 2 start level  -> initial difference 1.50 m
    gy: 0.30,          // gauge elevation (always submerged)
  },

  // ------------------------------------------------------------- build
  build(o) {
    o = o || {};
    const P = QS2.P, C = QS2.C;
    for (const k in o) P[k] = o[k];
    C("budget").set("Medium");            // rebuilds the sim; do it first
    C("spoutOn").set(false);
    C("cs").set(P.cs);                    // pipe roughness — see the header
    C("openL").set("0"); C("openR").set("0");
    C("openB").set("0"); C("openT").set("0");
    C("gaugeField").set("h");
    C("mode").set("0");
    SIM.clearSegs();

    const x0 = P.A1, x1 = P.A1 + P.L, xc = 0.5 * (x0 + x1);
    const xw = x1 + P.A2 + 0.05;          // tank-2 far wall centreline
    const segs = [
      // the sandbox ships two ledges — erase them (fat strokes, kind 0)
      [0.50, 3.45, 3.40, 2.85, 0.55, 0],
      [3.20, 2.60, 7.10, 1.95, 0.55, 0],
      // dividing wall (thickness = pipe length) and tank-2 far wall. Both
      // are drawn from BELOW the floor, so their lower ends need no aim.
      [xc, -0.20, xc, P.wallTop, P.L, 255],
      [xw, -0.20, xw, P.wallTop, 0.10, 255],
      // The pipe: a VALVE band along the domain's bottom edge, cutting clean
      // through the divider. Overshoot both faces so no solid plug survives.
      // The closed bottom edge is stamped LAST by rasterise(), so it trims the
      // band's lowest row: the pipe height is then set by the BRUSH alone
      // (0.1208 -> 2 cells), not by where the stroke was aimed. That is what
      // makes a 2-cell pipe hand-drawable.
      [x0 - 0.07, P.pipeY, x1 + 0.07, P.pipeY, P.brush, 128],
    ];
    segs.forEach((s) => SIM.addSeg(s[0], s[1], s[2], s[3], s[4], s[5]));

    state.gauges.length = 0;
    state.gauges.push({ x: 0.90, z: P.gy, hist: [], colour: "#7fd4ff" });   // tank 1
    state.gauges.push({ x: x1 + 0.5 * P.A2, z: P.gy, hist: [], colour: "#ffd479" }); // tank 2
    QS2.valve(false);
    syncPanel();
    return QS2.geom();
  },

  /** What the rasteriser actually delivered (cells are 21.7 mm). */
  geom() {
    const s = APP.sim, dx = s.dx, m = s.mask, nx = s.nx, ny = s.ny;
    const P = QS2.P, x1 = P.A1 + P.L;
    const col = (x) => Math.floor(x / dx);
    // pipe: the run of non-wall cells in the middle of the divider
    const i = col(P.A1 + 0.5 * P.L);
    let lo = -1, hi = -1;
    for (let j = 1; j < 60; j++) {
      const v = m[j * nx + i];
      if (v < 200) { if (lo < 0) lo = j; hi = j; }
    }
    // tank widths: open runs on the row through the gauges
    const j0 = Math.floor(1.0 / dx);
    const runs = []; let a = -1;
    for (let k = 0; k < nx; k++) {
      const solid = m[j0 * nx + k] > 200;
      if (!solid && a < 0) a = k;
      if ((solid || k === nx - 1) && a >= 0) { runs.push([a, k - 1]); a = -1; }
    }
    return JSON.stringify({
      dx: +dx.toFixed(5), nx, ny,
      pipeCells: hi - lo + 1, pipeH: +((hi - lo + 1) * dx).toFixed(4),
      pipeInvert: +(lo * dx).toFixed(4),
      tanks: runs.filter((r) => r[1] - r[0] > 3)
                 .map((r) => [+((r[0]) * dx).toFixed(3), +((r[1] + 1) * dx).toFixed(3),
                              +((r[1] - r[0] + 1) * dx).toFixed(4)]),
      segs: s.segs.length,
    });
  },

  // ------------------------------------------------------------- valve
  /** open === true -> valve open. Goes through toggleValve() so the button,
   *  the toast and sim.p.valveClosed all agree — exactly what `V` does. */
  valve(open) {
    const want = open ? 0 : 1;
    if (APP.sim.p.valveClosed !== want) toggleValve();
    return APP.sim.p.valveClosed;
  },

  // ------------------------------------------------------------- filling
  /** Phase 1: valve OPEN, reservoir holds BOTH tanks at `lo` (communicating
   *  vessels do the levelling for you). Phase 2: valve SHUT, reservoir up to
   *  `hi`, so only tank 1 rises. Phase 3: reservoir off, left edge back to
   *  Wall. Nothing here needs the spout or a hand-judged level. */
  fill(maxSec) {
    const P = QS2.P, C = QS2.C;
    const el = (k) => state.gauges[k].z + APP.probe(state.gauges[k].x, state.gauges[k].z).phead;
    const small = Math.round(0.25 / APP.SIM.dt()), chunk = Math.round(4 / APP.SIM.dt());
    // ONE reservoir setting does the whole fill. Valve open, level at `hi`:
    // tank 1 fills straight from the boundary and is then HELD at hi, while
    // tank 2 fills through the pipe under a big (1.5-2 m) driving head — 6x
    // faster than levelling the two tanks at `lo` first.
    QS2.valve(true);
    C("inflowOn").set(true); C("inQ").set(0); C("inLevel").set(P.hi);
    syncPanel();
    let n = 0;
    while (n++ < 4 * (maxSec || 120) && el(1) < P.lo) APP.tick(small);
    QS2.valve(false);                       // shut it the moment tank 2 hits `lo`
    const t1 = APP.sim.t;
    let hit = 0, m = 0;
    while (m++ < 20) {                      // let tank 1 top out at `hi`
      APP.tick(chunk);
      hit = Math.abs(el(0) - P.hi) < 0.02 ? hit + 1 : 0;
      if (hit >= 2) break;
    }
    C("inflowOn").set(false); C("openL").set("0"); syncPanel();
    QS2.fillT = [+t1.toFixed(1), +APP.sim.t.toFixed(1)];
    return QS2.levels();
  },

  /** Quiet time after the fill so the filling seiche decays. */
  settle(sec) { APP.tick(Math.round((sec || 4) / APP.SIM.dt())); return QS2.levels(); },

  /** Free-surface elevation in each tank, read the way a gauge reads it. */
  levels() {
    const P = QS2.P, g = state.gauges;
    const el = (k) => +(g[k].y + APP.probe(g[k].x, g[k].y).phead).toFixed(4);
    return JSON.stringify({ t: +APP.sim.t.toFixed(2), h1: el(0), h2: el(1),
                            dh: +(el(0) - el(1)).toFixed(4) });
  },

  // ------------------------------------------------------------- the run
  /** Open the valve and record both gauge traces. Gauge history is only
   *  appended by tickFrame, so this MUST be an APP.frames loop. */
  //  The gauge history is capped at CONFIG.histMax = 900 samples, so a long
  //  record has to be sampled COARSER, not longer: APP.frames(n, fdt) advances
  //  `fdt` of sim time per sample. fdt = 1/20 gives 45 s inside the cap.
  run(sec, fdt) {
    fdt = fdt || 1 / 20;
    state.gauges.forEach((g) => (g.hist.length = 0));
    state.paused = false;
    QS2.pre = JSON.parse(QS2.levels());        // the difference at release
    QS2.t0 = APP.sim.t;
    QS2.valve(true);
    const n = Math.min(890, Math.round((sec || 30) / fdt));
    for (let k = 0; k < n; k += 20) APP.frames(Math.min(20, n - k), fdt);
    state.paused = true;
    return QS2.thalf();
  },

  /** One complete student run, end to end: draw, fill, settle, release. */
  cycle(o, recSec) {
    QS2.build(o || {});
    QS2.fill();
    QS2.settle(4);
    return QS2.run(recSec || 30);
  },

  /** t_1/2 = time for the level DIFFERENCE to fall to half its release value,
   *  by linear interpolation on the recorded traces. */
  thalf() {
    const g1 = state.gauges[0].hist, g2 = state.gauges[1].hist;
    const n = Math.min(g1.length, g2.length);
    const T = [], D = [];
    for (let k = 0; k < n; k++) { T.push(g1[k].t - QS2.t0); D.push(g1[k].h - g2[k].h); }
    // Release value: the STILL difference read just before the valve opened.
    // The first tenth of a second after it opens carries a pressure transient
    // (the gauge cards spike) that depresses the difference by ~1%, which is
    // 5% on t_1/2 — and the student reads the still value off the two cards,
    // so this is also the honest match to the worksheet.
    let s = 0, c = 0;
    for (let k = 0; k < n && T[k] < 0.25; k++) { s += D[k]; c++; }
    const d0 = QS2.pre ? QS2.pre.dh : s / Math.max(1, c), half = 0.5 * d0;
    let th = null;
    for (let k = 1; k < n; k++) {
      if (D[k] <= half) {
        th = T[k - 1] + (D[k - 1] - half) / (D[k - 1] - D[k]) * (T[k] - T[k - 1]);
        break;
      }
    }
    return JSON.stringify({
      A2: QS2.P.A2, brush: QS2.P.brush,
      dh0: +d0.toFixed(4), thalf: th == null ? null : +th.toFixed(3),
      tEnd: +T[n - 1].toFixed(2), dhEnd: +D[n - 1].toFixed(4), n,
    });
  },

  /** The recorded traces, thinned, for plotting / screenshots. */
  trace(every) {
    const g1 = state.gauges[0].hist, g2 = state.gauges[1].hist;
    const n = Math.min(g1.length, g2.length), out = [];
    for (let k = 0; k < n; k += (every || 15))
      out.push([+(g1[k].t - QS2.t0).toFixed(3), +g1[k].h.toFixed(4), +g2[k].h.toFixed(4)]);
    return JSON.stringify(out);
  },

  // --------------------------------------------------------- Q8 theory
  //   A1 dh1/dt = -Q,  A2 dh2/dt = +Q,  Q = Cd a sqrt(2 g dh)
  //   => d(dh)/dt = -(Cd a sqrt(2g) / A*) sqrt(dh),  A* = A1 A2/(A1+A2)
  //   => t_1/2 = 2 A* sqrt(dh0) (1 - 1/sqrt2) / (Cd a sqrt(2g))
  //   so t_1/2 is LINEAR in A* with slope  0.5858 sqrt(dh0) / (Cd a sqrt(2g)).
  Cda(thalf, A2, dh0) {
    const A1 = QS2.P.A1, As = A1 * A2 / (A1 + A2);
    return 2 * As * Math.sqrt(dh0 || 1.5) * (1 - Math.SQRT1_2) / (thalf * Math.sqrt(2 * 9.81));
  },
};
