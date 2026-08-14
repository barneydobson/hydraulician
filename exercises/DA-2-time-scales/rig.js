// DA-2 · "Time scales as sqrt(lambda)" — paste into the dev console to
// rebuild this rig. Inherits RIG-C's build knowledge from QS-2
// (exercises/QS-2-twin-tanks/rig.js): Sandbox at Medium (414x230, dx 21.7mm),
// the two default ledges erased, and the floor-trim orifice trick (a VALVE
// stroke drawn ALONG the domain's closed bottom edge; rasterise() stamps the
// closed ring LAST, so it trims the stroke's lowest row and the surviving
// passage height is set by the BRUSH alone, not by where the stroke was
// aimed).
//
// DA-2 is ONE tank (not twin tanks): a tank against the domain's own closed
// left edge, standing on the closed bottom edge, with a THIN end-wall
// ("plate", 0.12 m — deliberately NOT scaled with lambda, see below) whose
// base is cut by the same floor-trim trick. Water that passes the orifice
// lands on an open apron and leaves through the right edge.
//
//   QS2.build({A2:1.5})                  // twin tanks, for comparison
//   DA2.build(0.5)                       // this rig at lambda = 1/2
//   DA2.fill(DA2.P.startFrac*DA2.P.h0*0.5)   // fill to the start mark
//   DA2.settle(4)
//   DA2.drain(0.9,0.3)                   // release and time the fall
//   DA2.cycle(0.25)                      // build+fill+settle+drain in one call
//
// GEOMETRY (metres, domain 9 x 5; Medium = 414 x 230 cells, dx = 21.7 mm)
//   floor            the CLOSED bottom edge (Left/Top/Bottom = Wall)
//   tank             x 0 .. W1*lambda            (W1 = 4.5 m at lambda = 1)
//   end-wall / plate x W1*lambda +/- 0.06         (0.12 m thick, EVERY lambda)
//   apron            x (plate's right face) .. 9  (open; Right edge = Open
//                    with a LOW pinned tailwater, see "Apron drainage" below)
//   orifice          a VALVE stroke drawn ALONG y = 0 through the plate,
//                    floor-trimmed to N cells: N = round(4*lambda), i.e.
//                    4/3/2/1 cells for lambda = 1, 3/4, 1/2, 1/4 — EXACT
//                    quarters of the lambda=1 gap (4 cells = 86.96 mm).
//
// THE QUANTISATION PROBLEM. A "real" 1:4 model would cut the orifice gap to
// exactly 1/4 of the full-scale gap. On a fixed grid that is only possible
// at whole cells, so the base (lambda=1) gap was chosen at 4 cells
// specifically so the ladder 4/3/2/1 survives lambda = 1, 3/4, 1/2, 1/4
// exactly — see CLAUDE.md/README Appendix for the measured consequence
// (Cd drift with passage size, DA-3's opening exhibit).
//
// WHY THE PLATE DOES NOT SCALE. Tank width, head and orifice gap all scale
// with lambda (that's the physical model). The plate is a CONSTRUCTION
// DETAIL — how the orifice is cut, not a modelled dimension — so it is held
// at a fixed 0.12 m across every rung, exactly as QS-2's divider thickness
// (1.60 m) was a fixed rig constant independent of its personalised A2. One
// consequence is deliberate: L/a grows from 1.4 (lambda=1) to 5.5
// (lambda=1/4), so the smallest rung is the MOST duct-like — a second,
// honest scale effect on top of the cell-quantised gap.
//
// APRON DRAINAGE. A plain zero-gradient right edge PONDS: measured, the
// apron backs up until it nearly matches the tank level and the throat
// velocity decays to zero by t ~ 27 s (verified via SIM.columns() — the
// point gauge alone hid this, see README Appendix, Iteration 2). CLAUDE.md's
// prescribed fix for a subcritical reach against a zero-gradient edge is a
// real downstream control, so the apron carries a LOW pinned tailwater
// (0.04 m) rather than bare Open. With the fix, throat velocity decays
// smoothly with head instead of choking, and total domain volume keeps
// falling instead of plateauing.
window.DA2 = {
  C: (id) => CONTROLS.find((c) => c.id === id),

  // Brush thicknesses (] pressed 2/3/4/5 times from the 0.055 m default,
  // factor 1.3/press) that floor-trim to exactly 1/2/3/4 surviving cells at
  // Medium (dx = 9/414 m). Valid range per N is [(2N+1)dx, (2N+3)dx); these
  // sit centred-to-comfortable within it — see README worked derivation.
  brushForN: { 1: 0.09295, 2: 0.120835, 3: 0.1570855, 4: 0.20421115 },

  P: {
    W1: 4.5,        // lambda=1 tank width, m (the timescale lever, QS-1's lesson)
    h0: 2.0,         // lambda=1 fill head, m
    startFrac: 0.9,  // marked start depth = startFrac * h0 * lambda
    stopFrac: 0.3,   // marked stop depth  = stopFrac  * h0 * lambda
    plateTh: 0.12,   // thin end-wall thickness, CONSTANT across lambda (see header)
    wallTop: 3.2,
    twLevel: 0.04,   // low pinned tailwater on the apron's open right edge
    lambda: 1,
  },

  // ------------------------------------------------------------- build
  build(lambda) {
    const P = DA2.P, C = DA2.C;
    P.lambda = lambda;
    const W = P.W1 * lambda;
    const N = Math.round(lambda * 4);
    const brush = DA2.brushForN[N];
    C("budget").set("Medium");
    C("spoutOn").set(false);
    C("openL").set("0"); C("openT").set("0"); C("openB").set("0"); C("openR").set("1");
    C("gaugeField").set("head");
    C("mode").set("0");
    SIM.clearSegs();
    const xc = W;
    const segs = [
      // the sandbox ships two ledges — erase them (QS-2's strokes)
      [0.50, 3.45, 3.40, 2.85, 0.55, 0],
      [3.20, 2.60, 7.10, 1.95, 0.55, 0],
      // the thin end-wall / plate, drawn from below the floor to well above
      // the deepest fill so no aim precision is needed at either end
      [xc, -0.20, xc, P.wallTop, P.plateTh, 255],
      // the orifice: a VALVE band along the domain's bottom edge, overshooting
      // the plate on both sides. The closed bottom edge trims its lowest row
      // (rasterise() stamps the closed ring LAST), so the surviving passage
      // is set by the brush alone: N cells, exactly.
      [xc - 0.15, 0.0, xc + 0.15, 0.0, brush, 128],
    ];
    segs.forEach((s) => SIM.addSeg(s[0], s[1], s[2], s[3], s[4], s[5]));
    C("twOn").set(true); C("twLevel").set(P.twLevel);
    const gy = 0.05 * P.h0 * lambda;
    state.gauges.length = 0;
    state.gauges.push({ x: 0.5 * W, y: gy, hist: [], colour: "#7fd4ff" });       // tank (student gauge)
    state.gauges.push({ x: Math.min(xc + 1.0, 8.8), y: 0.02, hist: [], colour: "#ffd479" }); // apron check
    DA2.valve(false);
    syncPanel();
    return DA2.geom();
  },

  /** What the rasteriser actually delivered (cells are 21.7 mm at Medium). */
  geom() {
    const s = APP.sim, dx = s.dx, m = s.mask, nx = s.nx;
    const P = DA2.P, W = P.W1 * P.lambda;
    const col = (x) => Math.floor(x / dx);
    const i = col(W);
    let lo = -1, hi = -1;
    for (let j = 0; j < 30; j++) {
      const v = m[j * nx + i];
      if (v < 200) { if (lo < 0) lo = j; hi = j; }
    }
    const j0 = Math.floor(0.3 / dx);
    let a = -1, tankRun = null;
    for (let k = 0; k < nx; k++) {
      const solid = m[j0 * nx + k] > 200;
      if (!solid && a < 0) a = k;
      if (solid && a >= 0) { tankRun = [a, k - 1]; a = -1; break; }
    }
    return JSON.stringify({
      lambda: P.lambda, Wdrawn: +W.toFixed(4), dx: +dx.toFixed(6),
      pipeCells: hi - lo + 1, pipeLoRow: lo,
      tankDelivered: tankRun ? +((tankRun[1] - tankRun[0] + 1) * dx).toFixed(4) : null,
    });
  },

  // ------------------------------------------------------------- valve
  /** open === true -> valve open. Goes through toggleValve() so the button,
   *  the toast and sim.p.valveClosed all agree — exactly what `V` does. The
   *  orifice has no valve if it's an open hole, so this drawn valve plug
   *  released with V IS the release mechanism (there is nothing else to
   *  design: fill with it shut, release by opening it). */
  valve(open) {
    const want = open ? 0 : 1;
    if (APP.sim.p.valveClosed !== want) toggleValve();
    return APP.sim.p.valveClosed;
  },

  /** Free-surface elevation at a gauge, read the way a gauge card reads it. */
  level(k) {
    const g = state.gauges[k];
    return g.y + APP.probe(g.x, g.y).head;
  },

  /** Spatially-averaged tank surface (verification only — NOT what a student
   *  reads). A single point gauge is fine once settled, but is dominated by
   *  a short-period seiche for about the first second after release; this
   *  average is how that was told apart from a real choke (README Appendix,
   *  Iteration 1). */
  meanLevel() {
    const P = DA2.P, W = P.W1 * P.lambda, s = APP.sim, dx = s.dx;
    const i0 = 2, i1 = Math.floor((W - 0.10) / dx);
    const C = APP.SIM.columns(true);
    let sum = 0, n = 0;
    for (let i = i0; i <= i1; i++) {
      const depth = C[i * 4 + 1], surf = C[i * 4 + 3];
      if (depth > 0.02) { sum += surf; n++; }
    }
    return n ? sum / n : null;
  },

  // ------------------------------------------------------------- filling
  /** Fill via the left-edge reservoir with the orifice SHUT, to `startLevel`.
   *  Resets Left edge back to Wall afterwards (QS-2's own pattern) — the
   *  reservoir control self-opens its edge while active (CLAUDE.md), and
   *  leaving it open after fill quietly changes the boundary condition for
   *  the whole drain (measured effect here: about 2% on t_fall — small, but
   *  worth getting right; see README Appendix, Iteration 4). */
  fill(startLevel, maxSec) {
    const C = DA2.C, dt = APP.SIM.dt();
    DA2.valve(false);
    C("inflowOn").set(true); C("inQ").set(0); C("inLevel").set(startLevel);
    syncPanel();
    const chunk = Math.max(1, Math.round(0.25 / dt));
    let n = 0;
    while (n++ < 4 * (maxSec || 90) && DA2.level(0) < startLevel) APP.tick(chunk);
    let hit = 0, m = 0;
    const bigChunk = Math.max(1, Math.round(2 / dt));
    while (m++ < 20) {
      APP.tick(bigChunk);
      hit = Math.abs(DA2.level(0) - startLevel) < 0.01 ? hit + 1 : 0;
      if (hit >= 2) break;
    }
    C("inflowOn").set(false); C("openL").set("0"); syncPanel();
    return { t: +APP.sim.t.toFixed(2), h: +DA2.level(0).toFixed(4) };
  },

  settle(sec) {
    APP.tick(Math.round((sec || 5) / APP.SIM.dt()));
    return { t: +APP.sim.t.toFixed(2), h: +DA2.level(0).toFixed(4) };
  },

  // ------------------------------------------------------------- the run
  /** Release the valve and time hStart -> hStop, reading the point gauge —
   *  the same number the student's gauge card prints. Interpolated crossing. */
  drain(hStart, hStop, maxSec) {
    const dt = APP.SIM.dt();
    const poll = Math.max(1, Math.round(0.05 / dt));
    DA2.valve(true);
    const t0 = APP.sim.t;
    let hPrev = DA2.level(0), tPrev = APP.sim.t;
    let apronMax = DA2.level(1);
    let tStop = null;
    const capSteps = Math.round((maxSec || 90) / 0.05);
    for (let steps = 0; steps < capSteps; steps++) {
      APP.tick(poll);
      const h = DA2.level(0), t = APP.sim.t;
      apronMax = Math.max(apronMax, DA2.level(1));
      if (h <= hStop) {
        tStop = tPrev + (hPrev - hStop) / (hPrev - h) * (t - tPrev);
        break;
      }
      hPrev = h; tPrev = t;
    }
    return {
      lambda: DA2.P.lambda, hStart, hStop,
      tFall: tStop == null ? null : +(tStop - t0).toFixed(3),
      apronMax: +apronMax.toFixed(4), reachedCap: tStop == null,
      finalH: +DA2.level(0).toFixed(4), simEnd: +APP.sim.t.toFixed(2),
    };
  },

  /** One complete student run, end to end: draw, fill, settle, release, time. */
  cycle(lambda, opt) {
    opt = opt || {};
    const P = DA2.P;
    DA2.build(lambda);
    const hStart = opt.hStart != null ? opt.hStart : P.startFrac * P.h0 * lambda;
    const hStop = opt.hStop != null ? opt.hStop : P.stopFrac * P.h0 * lambda;
    const f = DA2.fill(hStart, opt.fillSec);
    const s = DA2.settle(opt.settleSec || 4);
    const d = DA2.drain(hStart, hStop, opt.drainSec);
    return { lambda, hStart, hStop, fill: f, settle: s, drain: d };
  },

  // --------------------------------------------------------- Q3 theory
  //   t = 2A/(Cd a sqrt(2g)) * (sqrt(h1) - sqrt(h2))   (QS-1's falling-head Q3)
  //   With A, a AND h all proportional to lambda (kinematic similarity):
  //     t(lambda) = [2 A1 (sqrt(h1)-sqrt(h2)) / (a1 sqrt(2g) Cd(lambda))] * sqrt(lambda)
  //   i.e. t/sqrt(lambda) is CONSTANT iff Cd is — that's D2/D23 (lambda_t = sqrt(lambda)),
  //   and any departure from a clean sqrt(lambda) line is entirely a Cd(lambda) effect.
  CdBack(tFall, lambda, Adelivered, aDelivered, hStartActual, hStop) {
    return (2 * Adelivered * (Math.sqrt(hStartActual) - Math.sqrt(hStop))) /
           (aDelivered * Math.sqrt(2 * 9.81) * tFall);
  },
};
