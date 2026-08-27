// QS-1 · "paste into the dev console to rebuild this rig"
//
// No geometry is drawn for this demo — the stock ?scene=jet tank, orifice
// and spout are used exactly as shipped. This file only does the two things
// every student does by hand: switch the spout off and drop a gauge on the
// tank surface, low enough (z = 1.00, well below the orifice at 1.30-1.42)
// that its "h" reading stays valid (= free-surface elevation) for the
// whole drain down to the h2 = 1.80 m stop level.
//
// Usage: open ?scene=jet, wait out the spin-up (~55 s), then in the
// console:
//   QS1.armGauge()      // spout off, gauge dropped, gaugeField = h
//   QS1.report()         // current elevation + status-bar time, JSON

window.QS1 = {
  C: (id) => CONTROLS.find((c) => c.id === id),

  // Geometry constants, read off js/scenes.js's jet-scene wall list (not
  // rasterised — these are the DRAWN values students should use in Q3):
  A: 1.90,           // tank plan width (free-surface span), metres
  a: 0.12,           // orifice gap, metres
  orificeCentre: 1.36,   // elevation of the orifice centreline, metres

  armGauge() {
    const C = QS1.C;
    C("spoutOn").set(false);
    C("gaugeField").set("h");
    syncPanel();
    state.gauges.length = 0;
    state.gauges.push({ x: 1.00, z: 1.00, hist: [], colour: "#7fd4ff" });
    return { spoutOn: sim.p.source.on, gauges: state.gauges.length };
  },

  report() {
    const g = state.gauges[0];
    const last = g && g.hist.length ? g.hist[g.hist.length - 1] : null;
    return JSON.stringify({
      t: +sim.t.toFixed(2),
      eta: last ? +last.h.toFixed(3) : null,     // free-surface elevation, m
      h: last ? +(last.h - QS1.orificeCentre).toFixed(3) : null,  // head above orifice centre
    });
  },

  // t predicted by Q3 for a given (eta1, eta2) pair, using Cc=0.61, Cv=0.97.
  predict(eta1, eta2, Cc, Cv) {
    Cc = Cc || 0.61; Cv = Cv || 0.97;
    const Cd = Cc * Cv, g = 9.81;
    const h1 = eta1 - QS1.orificeCentre, h2 = eta2 - QS1.orificeCentre;
    const K = 2 * QS1.A / (Cd * QS1.a * Math.sqrt(2 * g));
    return K * (Math.sqrt(h1) - Math.sqrt(h2));
  },
};
