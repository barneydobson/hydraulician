/* ============================================================================
 * NC-2 · GAUGING A VERTICAL — console spot-check
 * ----------------------------------------------------------------------------
 * Paste this file into the dev console of the app (any scene), then:
 *
 *     await NC2.run(0.68, 20)     // shallow run, station x = 20 m
 *     await NC2.run(1.33, 20)     // deep run, same station
 *     await NC2.sweep()           // both runs, stations every 2 m
 *
 * It picks NC-2 (the gauging scene at Medium, as the card sets it up), sets
 * the reservoir level and presses R (SIM.resetWater, which restarts the
 * reach near its steady state for that level), waits out the card's settle,
 * and then reads the vertical at x exactly as a student does, twice: once
 * from the live field, once from a 20 s Average window.
 *
 *   d, η      the hover box's "depth d" and "level η" rows (OVERLAY.analyse,
 *             on the mean columns under Average)
 *   u₀.₂ …    a gauge on Speed at z = η − 0.2 d, η − 0.6 d and η − 0.8 d:
 *             SIM.probe's speed, the cell the gauge sits in. The
 *             `exact` set reads the rake's column at those heights,
 *             interpolated between cell centres, for what the cell costs
 *   V         the rake chip's V: the plain mean of u over the wet cells of the
 *             column (overlay.js drawRake), the "full integration"
 *
 * and returns the one-point V₁ = u₀.₆, the two-point V₂ = ½(u₀.₂ + u₀.₈) and
 * each one's error against V, in per cent.
 *
 * The solver is stepped flat out (APP.tick); the averaging accumulators are
 * advanced the way the frame loop does it, once per batch of substeps and
 * weighted by the simulated time that batch covered (main.js tickFrame).
 * ==========================================================================*/
window.NC2 = {
  SETTLE: 40, WINDOW: 20, LEVELS: [0.68, 1.33],
  STATIONS: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],

  // A MessageChannel yield, not setTimeout: a hidden tab throttles timers to
  // one a minute, which stalls a long run.
  yieldNow: function () {
    return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); });
  },

  /** Advance `secs` of simulated time; with `avg`, feed the window as well. */
  advance: async function (secs, avg) {
    var S = APP.SIM, t1 = APP.sim.t + secs, ly = performance.now();
    while (APP.sim.t < t1) {
      var a = S.step(avg ? 60 : 200);
      if (avg) { S.columns(); S.avgStepField(a); S.avgStepColumns(a); }
      if (performance.now() - ly > 1000) { await NC2.yieldNow(); ly = performance.now(); }
    }
  },

  /** What the student reads at station x, from the live field or the window. */
  read: function (x, avg) {
    var S = APP.sim, SIM = APP.SIM;
    var C = avg ? SIM.avgColumns(true).C : SIM.columns(true);
    var A = OVERLAY.analyse(S, C, avg ? { averaged: true } : undefined);
    var r = SIM.rake(x, null, avg), i = r.i;
    var bed = A.bed[i], surf = A.surf[i], d = A.dRaw[i], eta = bed + d;
    var sum = 0, n = 0, zs = [], us = [];
    for (var j = 0; j < S.ny; j++) {
      var z = (j + 0.5) * S.dx;
      if (z < bed || z > surf) continue;
      sum += r.buf[j * 4]; n++; zs.push(z); us.push(r.buf[j * 4]);
    }
    var V = sum / n;
    var at = function (z) {
      for (var k = 0; k + 1 < zs.length; k++) if (zs[k] <= z && zs[k + 1] >= z) {
        var a = (z - zs[k]) / (zs[k + 1] - zs[k]); return us[k] * (1 - a) + us[k + 1] * a;
      }
      return z < zs[0] ? us[0] : us[us.length - 1];
    };
    var u = {}, e = {};
    [0.2, 0.6, 0.8].forEach(function (k) { u[k] = SIM.probe(x, eta - k * d, avg).speed; e[k] = at(eta - k * d); });
    var r4 = function (v) { return +v.toFixed(4); };
    var pct = function (v) { return +(100 * (v / V - 1)).toFixed(2); };
    return { x: x, avg: !!avg, d: r4(d), eta: r4(eta), V: r4(V),
             u02: r4(u[0.2]), u06: r4(u[0.6]), u08: r4(u[0.8]),
             err1_pct: pct(u[0.6]), err2_pct: pct(0.5 * (u[0.2] + u[0.8])),
             exact: { u02: r4(e[0.2]), u06: r4(e[0.6]), u08: r4(e[0.8]),
                      err1_pct: pct(e[0.6]), err2_pct: pct(0.5 * (e[0.2] + e[0.8])) } };
  },

  /** One run: reservoir level, R, settle, live read, 20 s window, mean read. */
  run: async function (level, x, settle, win) {
    level = level === undefined ? NC2.LEVELS[0] : level; x = x === undefined ? 20 : x;
    settle = settle === undefined ? NC2.SETTLE : settle; win = win === undefined ? NC2.WINDOW : win;
    await APP.pickExercise("NC-2"); await APP.EX.ready;
    APP.state.paused = true;
    CONTROLS.find(function (c) { return c.id === "inLevel"; }).set(level);
    APP.SIM.resetWater();                      // R: restarts the reach, t = 0
    await NC2.advance(settle, false);
    var xs = Array.isArray(x) ? x : [x];
    var live = xs.map(function (s) { return NC2.read(s, false); });
    APP.SIM.avgStart();
    await NC2.advance(win, true);
    var mean = xs.map(function (s) { return NC2.read(s, true); });
    APP.SIM.avgStop();
    APP.state.paused = false;
    return { level: level, t: +APP.sim.t.toFixed(1), live: live, mean: mean };
  },

  /** Both runs, every station on the card; the table the README quotes. */
  sweep: async function () {
    var out = [];
    for (var f = 0; f < NC2.LEVELS.length; f++) {
      var r = await NC2.run(NC2.LEVELS[f], NC2.STATIONS);
      r.mean.forEach(function (m) { out.push(Object.assign({ level: r.level }, m)); });
    }
    console.table(out);
    return out;
  },
};
JSON.stringify({ loaded: true, keys: Object.keys(NC2) });
