/* UN-1 "The class discovers the celerity" — paste into the dev console.
 *
 *   ?scene=hammer, Resolution: Medium (436 x 218, dx = 0.1376 m).
 *
 * Students do all of this with the mouse (README §3). This file is the
 * lecturer's spot-check: it redraws the nozzle, drops the gauges, slams the
 * valve and prints exactly the two numbers the student submits.
 *
 * Everything below is a documented app entry point:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)   kind 255 wall, 128 valve, 0 ERASE
 *   SIM.clearSegs()  = the C key      SIM.undoSeg() = the Z key
 *   toggleValve()    = the V key      SIM.resetWater() = the R key
 *   state.gauges.push({x,y,hist:[],colour})   = a click with the Gauge tool
 *   OVERLAY.analyse(sim, SIM.columns(true)).V[i]  = the "V" line the hover
 *                                                   readout prints
 * NOTE: gauge history is filled by tickFrame, i.e. by APP.frames(n) — NOT by
 * APP.tick(n) / SIM.step(n). Spin up with step(), record with frames().
 */
window.UN1 = {
  X: 56.5,            // nozzle plate station (the scene's own)
  YC: 3.5,            // pipe axis — the gap is centred on it
  XG: 30.0,           // mid-pipe gauge (the one the worksheet uses)
  XV: 54.0,           // second gauge, just upstream of the valve at x = 55

  /** open cells and effective gap at the nozzle — the flow area is quantised
   *  to ONE CELL (0.1376 m at Medium), which is why the personalised ladder
   *  has six rungs and not ten. */
  gap: function () {
    var S = APP.sim, i = Math.round(UN1.X / S.dx), open = 0, rows = "";
    for (var j = Math.floor(2.0 / S.dx); j < Math.ceil(5.0 / S.dx); j++) {
      var s = S.mask[j * S.nx + i] ? 1 : 0; rows += s; if (!s) open++;
    }
    return { cells: open, m: +(open * S.dx).toFixed(4), rows: rows };
  },

  /** erase the scene's nozzle plate and redraw it with a `g` metre gap.
   *  Drawing tolerance is +/- half a cell (0.07 m) — 0.41 and 0.42 rasterise
   *  identically — so this is comfortably hand-drawable at 8x zoom. */
  nozzle: function (g) {
    APP.SIM.clearSegs();                                        // C
    APP.SIM.addSeg(UN1.X, 2.05, UN1.X, 4.95, 0.60, 0);          // Erase tool
    APP.SIM.addSeg(UN1.X, 2.00, UN1.X, UN1.YC - g / 2, 0.50, 255);   // Wall
    APP.SIM.addSeg(UN1.X, UN1.YC + g / 2, UN1.X, 5.00, 0.50, 255);   // Wall
    return UN1.gap();
  },

  gauges: function () {
    APP.state.gauges.length = 0;
    [UN1.XG, UN1.XV].forEach(function (x, k) {
      APP.state.gauges.push({ x: x, y: UN1.YC, hist: [],
        colour: ["#7fd4ff", "#ffb648", "#5fd08a", "#ff8fa3"][k] });
    });
  },

  /** v0 = the "V" line of the hover readout at mid-pipe: the BORE-MEAN
   *  velocity from the column reduction, not the noisy centreline u. */
  v0: function (x) {
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    return +A.V[Math.floor((x || UN1.XG) / APP.sim.dx)].toFixed(3);
  },

  /** advance `s` simulated seconds through the full frame so the gauges log */
  run: function (s) {
    APP.state.paused = false;
    var t0 = APP.sim.t, n = 0;
    while (APP.sim.t - t0 < s && n < 60 * s * 4 + 200) { APP.frames(1, 1 / 60); n++; }
    return +APP.sim.t.toFixed(2);
  },

  /** one whole student run. UN1.student(0.42) -> {v0, dH}. */
  student: function (gap, cel) {
    var g = UN1.nozzle(gap);
    CONTROLS.find(function (c) { return c.id === "cel"; }).set(cel || 70);
    syncPanel();
    if (APP.sim.p.valveClosed > 0.5) toggleValve();     // make sure it is open
    APP.SIM.resetWater();                              // R — restarts spin-up
    APP.SIM.step(Math.ceil(12 / APP.SIM.dt()));        // 12 s spin-up, flat out
    UN1.gauges();
    UN1.run(1.6);                                      // steady baseline
    var v0 = UN1.v0(), H0 = APP.state.gauges[0].hist.slice(-1)[0].head;
    toggleValve();                                     // V — SLAM
    UN1.run(0.75);                                     // land on the 1st plateau
    var H1 = APP.state.gauges[0].hist.slice(-1)[0].head;
    UN1.run(5.5);                                      // let the square wave run
    APP.state.paused = true; APP.frames(2);
    return { gap: g, c: APP.sim.p.c, v0: v0, dH: +(H1 - H0).toFixed(2),
             joukowsky: +(APP.sim.p.c * v0 / 9.81).toFixed(2) };
  },
};
/* UN1.student(0.42)  ->  {gap:{cells:3,m:0.4128}, c:70, v0:2.138, dH:15.90,
                           joukowsky:15.26}                                   */
