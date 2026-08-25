// rig.js — B6 (Ursell number) measurement harness.
// Paste into the dev console to rebuild the rig, or drive via
// `runner.py eval --id <ID> --file rig.js` (defines window.RIG6, does
// nothing else on load).
//
// Same runner gotcha as B4: `pump` bypasses tickFrame (paused=true, raw
// APP.SIM.step()), so it never samples gauges. Recording a gauge trace here
// goes through RIG6.run() (state.paused=false + a real-time await), not pump.
(function () {
  const C = (id) => CONTROLS.find((c) => c.id === id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setWave(T, A) {
    C("waveOn").set(true);
    C("waveT").set(T);
    C("waveA").set(A);
    syncPanel();
  }

  async function run(realMs) {
    state.paused = false;
    await sleep(realMs);
    state.paused = true;
  }

  function gaugesReset(stations) {
    // stations: [[x,y], ...]
    state.gauges.length = 0;
    stations.forEach(([x, y]) => state.gauges.push({ x, y, hist: [] }));
  }
  function gaugeHist(k) {
    return state.gauges[k].hist.map((r) => ({ t: r.t, d: r.d, h: r.h }));
  }

  function stillWater(x) {
    const col = SIM.columns(true);
    const i = Math.max(0, Math.min(sim.nx - 1, Math.round(x / sim.dx)));
    return { bed: col[i * 4], depth: col[i * 4 + 1], surf: col[i * 4] + col[i * 4 + 1] };
  }

  // Raise the gauge ring-buffer cap (default 900, js/main.js CONFIG.histMax)
  // for the duration of this recording session — a runtime tweak to OUR OWN
  // live tab, not a file edit, so a long-period recording window doesn't
  // silently lose its early samples.
  function raiseHistCap(n) { CONFIG.histMax = Math.max(CONFIG.histMax, n); return CONFIG.histMax; }

  // ---- synchronous driver, bypassing tickFrame/rAF entirely ----
  // Found the hard way: with two other workers sharing the GPU, tickFrame's
  // own AIMD frame-budget governor (CONFIG.frameBudgetMs=15) throttles
  // nsubMax down to keep the (headless-anyway) UI "responsive", so a
  // real-time await can end up advancing sim time at a few % of the
  // requested `speed` — observed rt=0.06 (not 2.5) under load. Driving
  // SIM.step() directly in a tight loop and sampling with SIM.probe() after
  // each chunk sidesteps the governor altogether and runs at whatever the
  // shared GPU actually delivers, without needing any wall-clock wait at
  // all. Elevation at a station = y + probe(x,y).phead (LL-1v: probe().phead
  // is pressure-only, so y+phead is full piezometric head = free-surface
  // elevation for a wet point, hydrostatic to a very good approximation on
  // this h/L~0.03-0.06 shallow flume) — cheap (1x1 readback), no column
  // reduction needed.
  function driveAndSample(simSeconds, stations, chunk) {
    chunk = chunk || 40;
    const t0 = sim.t;
    const targetT = t0 + simSeconds;
    const rec = stations.map(() => []);
    let guard = 0;
    while (sim.t < targetT && guard < 400000) {
      SIM.step(chunk);
      const t = sim.t;
      stations.forEach((s, k) => {
        const pr = SIM.probe(s[0], s[1]);
        rec[k].push({ t, elev: s[1] + pr.phead, u: pr.u, v: pr.v });
      });
      guard++;
    }
    return { t0, t1: sim.t, chunks: guard, rec };
  }

  window.RIG6 = { C, sleep, setWave, run, gaugesReset, gaugeHist, stillWater, raiseHistCap, driveAndSample };
})();
