/* HP-1 "Maximum power transmission: h_f = H/3" — paste into the dev console.
 *
 *   ?scene=hammer, Resolution: Medium (436 x 218, dx = 0.1376 m).
 *
 * THE RIG IS TWO PLATES, NOT ONE.
 *
 *   - the PENSTOCK PLATE at x = 8.0 m, gap 0.70 m — fixed, the same for the
 *     whole class. It is the penstock's resistance: a genuine kQ^2 loss that
 *     the jet feels. See the Director report: neither C_f nor C_s can put
 *     h_f/H anywhere near 1/3, and the loss they DO make is a wall-shear loss
 *     that a jet-core probe cannot see at all.
 *   - the NOZZLE PLATE at x = 56.5 m (the scene's own station), gap
 *     personalised per student.
 *
 * Everything below is a documented app entry point:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs() = C     SIM.resetWater() = R
 *   APP.probe(x,y).u        = the "u" the hover readout prints
 *   OVERLAY.analyse(sim, SIM.columns(true)).q[i] = the "q" it prints
 */
window.HP1 = {
  XT: 8.0,            // penstock plate — 2 m inside the pipe entrance
  GT: 0.70,           // its gap: FIXED for the class (5 cells at Medium)
  X: 56.5,            // nozzle plate — the scene's own station
  YC: 3.5,            // pipe axis; both gaps are centred on it
  XM: 30.0,           // where q is read (mid-pipe, hover readout)
  XJ: 57.0,           // where the jet is probed (0.25 m past the plate face)

  /** open cells in the bore at station x — the gap is quantised to ONE cell */
  cellsAt: function (x) {
    var S = APP.sim, i = Math.round(x / S.dx), open = 0;
    for (var j = Math.floor(2.0 / S.dx); j < Math.ceil(5.0 / S.dx); j++)
      if (!S.mask[j * S.nx + i]) open++;
    return { cells: open, m: +(open * S.dx).toFixed(4) };
  },

  plate: function (x, g) {
    APP.SIM.addSeg(x, 2.00, x, HP1.YC - g / 2, 0.50, 255);
    APP.SIM.addSeg(x, HP1.YC + g / 2, x, 5.00, 0.50, 255);
  },

  /** the whole rig. HP1.build(0.84) -> both plates, nozzle gap 0.84 m. */
  build: function (nozGap) {
    APP.SIM.clearSegs();                                    // C
    APP.SIM.addSeg(HP1.X, 2.05, HP1.X, 4.95, 0.60, 0);      // erase scene plate
    HP1.plate(HP1.XT, HP1.GT);
    HP1.plate(HP1.X, nozGap);
    return { penstock: HP1.cellsAt(HP1.XT), nozzle: HP1.cellsAt(HP1.X) };
  },

  /** reservoir surface elevation — the DELIVERED level, not the slider */
  res: function () {
    var C = APP.SIM.columns(true), S = APP.sim, s = 0, n = 0;
    for (var i = Math.floor(1 / S.dx); i <= Math.floor(5 / S.dx); i++) { s += C[i * 4 + 3]; n++; }
    return +(s / n).toFixed(3);
  },

  /** warm the analyse EMA exactly as the overlay does */
  A: function () {
    APP.state.paused = false; APP.frames(60);
    var A; for (var i = 0; i < 15; i++) A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    APP.state.paused = true; APP.frames(2);
    return A;
  },

  /** jet velocity: the largest |u| over the wet cells of the column at XJ.
   *  This is the number the hover readout prints when the cursor is in the
   *  jet core. It FLUCTUATES (+/-5%, see the Director report) — sample it. */
  jetU: function () {
    var S = APP.sim, best = 0;
    for (var y = 2.1; y < 4.9; y += S.dx) {
      var p = APP.probe(HP1.XJ, y);
      if (p.f > 0.5 && Math.abs(p.u) > Math.abs(best)) best = p.u;
    }
    return best;
  },

  /** one whole student run. HP1.student(0.84) -> {gap, q, v, ...}
   *  50 s of spin-up, then 20 readings 0.8 s apart (the student's eyeball
   *  average of a wobbling readout). */
  student: function (nozGap) {
    var r = HP1.build(nozGap);
    APP.SIM.resetWater();                                   // R
    APP.SIM.step(Math.ceil(50 / APP.SIM.dt()));             // 50 s spin-up
    var qs = [], vs = [], i = Math.floor(HP1.XM / APP.sim.dx);
    for (var k = 0; k < 20; k++) {
      qs.push(HP1.A().q[i]); vs.push(HP1.jetU());
      APP.SIM.step(Math.ceil(0.8 / APP.SIM.dt()));
    }
    var mn = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
    var q = mn(qs), v = mn(vs), H = +(HP1.res() - HP1.YC).toFixed(3);
    return { gap: nozGap, cells: r.nozzle.cells, gapm: r.nozzle.m,
             H: H, q: +q.toFixed(3), v: +v.toFixed(3),
             hf: +(H - v * v / 19.62).toFixed(3),
             hfH: +((H - v * v / 19.62) / H).toFixed(3),
             P_MW_per_m: +(0.5 * q * v * v / 1000).toFixed(3) };
  },
};
/* HP1.student(0.84) -> {cells:6, q:8.83, v:16.21, hf:7.94, hfH:0.372,
                         P_MW_per_m:1.160}   — the peak of the pooled curve  */
