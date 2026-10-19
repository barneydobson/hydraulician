/* WV-4 "Breaking waves on a beach" — paste into the dev console.
 *
 *   ?ex=WV-4 (or ?scene=beach), Resolution: Medium (1102 x 86, dx = 10.4 mm).
 *
 * Nothing to draw: the beach is the scene's polygon and its slope is the
 * Geometry slider `beach_s` (geom0). This is the lecturer's spot-check — it
 * sets a slope (which restarts the flume from still water), runs the paddle
 * for t seconds, then reads the surface range over two periods along the
 * flume through the same column reduction the gauges use:
 *   APP.SIM.setParam("beach_s", s)  = the Beach slope slider (resetWater)
 *   APP.SIM.columns(true)           = per column (bed, d, q, top)
 *   APP.tick(n)                     = n solver steps, flat out
 *
 *   WV4.xi(s)        -> the Iribarren number for the flume's wave
 *   WV4.run(s, t)    -> set slope s, run t s (default 12), print H(x) and ξ
 *   WV4.undertow(t)  -> Average on, run t s more (default 60), print the
 *                       mean velocity ū up the column at x = 4…8 m
 *
 * APP.tick queues GPU work without waiting for it; a long tick on a busy
 * GPU can trip the driver's timeout and lose the WebGL context. Break very
 * long runs into a few calls if that happens.
 *
 * Each call is a few hundred thousand solver steps: on a shared GPU run one
 * slope per call.
 */
window.WV4 = {
  T: 2.0, H0: 0.17,                       // the paddle's period; H measured in the level part
  L0: function () { return 9.81 * WV4.T * WV4.T / (2 * Math.PI); },
  xi: function (s) { return s / Math.sqrt(WV4.H0 / WV4.L0()); },

  run: function (s, t) {
    APP.SIM.setParam("beach_s", s); syncPanel();
    const sim = APP.sim, dt = APP.SIM.dt();
    APP.tick(Math.round((t || 12) / dt));
    const xs = []; for (let x = 0.6; x < sim.W - 0.1; x += 0.4) xs.push(+x.toFixed(1));
    const lo = xs.map(() => 1e9), hi = xs.map(() => -1e9);
    const steps = Math.max(1, Math.round(0.05 / dt));
    for (let k = 0; k < Math.ceil(2 * WV4.T / 0.05); k++) {
      APP.tick(steps);
      const c = APP.SIM.columns(true);
      xs.forEach((x, m) => {
        const i = Math.round(x / sim.dx - 0.5), d = c[i * 4 + 1], eta = c[i * 4] + d;
        if (d > 0.002) { lo[m] = Math.min(lo[m], eta); hi[m] = Math.max(hi[m], eta); }
      });
    }
    console.log("tanβ = " + s + "   ξ ≈ " + WV4.xi(s).toFixed(2) +
                "   (spilling < 0.5 < plunging < 3.3 < surging)");
    const rows = xs.map((x, m) => ({ "x (m)": x, "H (m)": hi[m] > -1e8 ? +(hi[m] - lo[m]).toFixed(3) : "dry",
                                     "η max (m)": hi[m] > -1e8 ? +hi[m].toFixed(3) : "" }));
    console.table(rows);
    return rows;
  },

  // The undertow: switch the colour key to Average (the strip's A does the
  // same), run t s more (default 60) and print the Favre-mean horizontal
  // velocity up the water column at a few stations: negative = offshore.
  // The first ~20 s of waves should have arrived before it is called.
  undertow: function (t) {
    const sim = APP.sim, dt = APP.SIM.dt();
    APP.avg.set(true);
    APP.tick(Math.round((t || 60) / dt));
    const C = APP.avg.columns().C, out = [];
    [4, 5, 6, 7, 8].forEach((x) => {
      const i = Math.floor(x / sim.dx), zb = C[i * 4], d = C[i * 4 + 1], row = { "x (m)": x, "d̄ (m)": +d.toFixed(3) };
      [0.02, 0.05, 0.1, 0.15, 0.2].forEach((h) => {
        const p = h < d ? APP.avg.probe(x, zb + h) : null;
        row["ū at " + h + " m"] = p && p.fbar > 0.5 ? +p.ubar.toFixed(3) : "";
      });
      out.push(row);
    });
    console.table(out);
    return out;
  },
};
