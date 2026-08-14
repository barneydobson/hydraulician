// UN-2 - Flow establishment: console-paste rig.
//
// No geometry is drawn for this demo (the scene's own nozzle is used
// unmodified) - this file only reaches "still water, valve shut, gauge in
// speed mode" the same way the worksheet does by hand, and runs one
// establishment trace so a lecturer/TA can sanity-check a digit before
// class. Paste into the console on ?scene=hammer, then e.g.:
//
//   UN2.setup(23.80);                 // reach rest at your level (m, elevation)
//   UN2.open();                       // opens the valve, run starts
//   // ... wait, or just watch the gauge chart (Gauges plot: Speed) ...
//   UN2.read()                        // -> {t, V (bore mean), gauge speed}
//
window.UN2 = {
  BULK: 0.30,          // dry-run constant: tames the closed-pipe "ring" that
                        // an instant reservoir-level change otherwise excites
                        // (see README Appendix - Director report, Iterations).
  L: 49.0,              // penstock length: entrance (x=6) to valve (x=55)
  C: (id) => CONTROLS.find(c => c.id === id),

  /** Reach "still water, valve shut, at your personalised level." */
  setup(level) {
    const C = UN2.C;
    APP.loadScene('hammer', false);           // fresh: t=0, valve OPEN, level=25
    C('bulk').set(UN2.BULK); syncPanel();
    if (APP.sim.p.valveClosed < 0.5) toggleValve();   // boots open -> close it
    C('inLevel').set(level); syncPanel();
    state.gaugeField = 'speed';
    APP.state.paused = false;
    APP.frames(600, 1 / 60);                  // 10 simulated seconds settle
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: 30, y: 3.5, hist: [], colour: '#7fd4ff' });
    APP.state.paused = true;
    return UN2.read();
  },

  /** Open the valve - the run starts. */
  open() {
    if (APP.sim.p.valveClosed > 0.5) toggleValve();
    APP.state.paused = false;
  },

  /** Bore-mean V (the truth channel) and the gauge's own point speed. */
  read() {
    const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    const iMid = Math.round(30 / APP.sim.dx);
    const iTank = Math.round(3.0 / APP.sim.dx);
    const g = APP.state.gauges[0];
    return {
      t: +APP.sim.t.toFixed(3),
      V_boreMean: +A.V[iMid].toFixed(4),
      gaugeSpeed: g && g.hist.length ? +g.hist[g.hist.length - 1].speed.toFixed(4) : null,
      Hrest: +(A.surf[iTank] - 3.5).toFixed(4),   // head above the pipe axis
      valveClosed: APP.sim.p.valveClosed,
    };
  },

  /** Run one full trace (fresh setup -> open -> ~8s recorded) and extract
   *  u_max / t90 / k exactly as the verification record did. */
  student(level) {
    UN2.setup(level);
    const A0 = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    const iTank = Math.round(3.0 / APP.sim.dx);
    const Hrest = A0.surf[iTank] - 3.5;
    UN2.open();
    const iMid = Math.round(30 / APP.sim.dx);
    const t0 = APP.sim.t, series = [];
    for (let k = 0; k < 480; k++) {
      APP.frames(1, 1 / 60);
      series.push({ t: APP.sim.t - t0, V: OVERLAY.analyse(APP.sim, APP.SIM.columns(true)).V[iMid] });
    }
    APP.state.paused = true;
    const tail = series.filter(s => s.t > series[series.length - 1].t - 2.0).map(s => s.V).sort((a, b) => a - b);
    const umax = tail[Math.floor(tail.length / 2)];
    let t90 = null;
    for (const s of series) { if (s.V >= 0.9 * umax) { t90 = s.t; break; } }
    const k = 2 * 9.81 * Hrest / (umax * umax);
    return { level, Hrest: +Hrest.toFixed(3), umax: +umax.toFixed(4), t90: +t90.toFixed(4), k: +k.toFixed(2) };
  },
};
