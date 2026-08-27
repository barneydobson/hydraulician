// rig.js — B4 (orbital decay) measurement harness.
// Paste into the dev console to rebuild the rig, or drive via
// `runner.py eval --id <ID> --file rig.js` (defines window.RIG, does nothing
// else on load).
//
// IMPORTANT, found while building this: `runner.py pump` bypasses tickFrame
// (it sets state.paused=true and calls APP.SIM.step() directly for speed),
// so it NEVER advances orbit tracers or samples gauges — same trap as
// APP.tick(), just less obvious because pump looks like it's "running the
// sim". Recording tracer trails or gauge history must go through
// APP.frames()/tickFrame, i.e. state.paused=false + wait real time (RIG.run
// below), not pump.
(function () {
  const C = (id) => CONTROLS.find((c) => c.id === id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setWave(T, A) {
    C("waveOn").set(true);
    C("waveT").set(T);
    C("waveA").set(A);
    syncPanel();
  }

  // Fresh column of orbit tracers (bed..surface) with a trail buffer long
  // enough (in SIM seconds) to hold the whole recording window — otherwise
  // advanceTracers() keeps trimming the head of the path to `trail` seconds
  // (default 2.5 periods) and a long recording silently only ever returns
  // the last few periods.
  function primeTracers(x, holdSimSeconds) {
    seedTracers(x);
    state.tracers.trail = holdSimSeconds + 4;
    return state.tracers.list.map((t) => ({ x0: t.x0, y0: t.y0 }));
  }

  // Let the LIVE tab run for realMs of wall clock (tickFrame fires every
  // rAF, so tracers/gauges/render all advance normally), then freeze so nothing
  // more changes while we read it back.
  async function run(realMs) {
    state.paused = false;
    await sleep(realMs);
    state.paused = true;
  }

  // ---- small linear-algebra: one-frequency harmonic regression ----
  // model(t) = a0 + a1*t + a2*cos(wt) + a3*sin(wt); amplitude = hypot(a2,a3).
  // The a1*t drift term matters: a closed flume returns near-bed water via a
  // slow mean current (the scene's own tip calls this out), and without a
  // drift term that mean current leaks into the fitted oscillation amplitude.
  function solve4(A, b) {
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < 4; col++) {
      let piv = col;
      for (let r = col + 1; r < 4; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < 4; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let c = col; c < 5; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => row[4] / row[i]);
  }
  function harmonicFit(t, y, omega) {
    const n = t.length;
    const AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const Aty = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const row = [1, t[i], Math.cos(omega * t[i]), Math.sin(omega * t[i])];
      for (let r = 0; r < 4; r++) {
        Aty[r] += row[r] * y[i];
        for (let c = 0; c < 4; c++) AtA[r][c] += row[r] * row[c];
      }
    }
    const beta = solve4(AtA, Aty);
    return { a0: beta[0], drift: beta[1], amp: Math.hypot(beta[2], beta[3]), phase: Math.atan2(beta[3], beta[2]) };
  }

  // Reduce ONE tracer's recorded path (triples x,y,t) to what we need:
  // harmonic-fit amplitude (the DFT-at-paddle-frequency "truth") on the
  // FULL window and on first/second half (stability check), plus the naive
  // peak-to-peak a student would read off screen — over the full window and
  // over just the last `naiveS` seconds (the app's own default trail length,
  // i.e. literally what is drawn on screen at any instant).
  function reduceTracer(tr, omega, naiveS) {
    const p = tr.path, n = p.length / 3;
    const t = new Array(n), x = new Array(n), y = new Array(n);
    for (let i = 0; i < n; i++) { x[i] = p[i * 3]; y[i] = p[i * 3 + 1]; t[i] = p[i * 3 + 2]; }
    const t0 = t[0];
    const trel = t.map((v) => v - t0);
    const fitX = harmonicFit(trel, x, omega);
    const fitY = harmonicFit(trel, y, omega);
    const half = n >> 1;
    const fitX1 = harmonicFit(trel.slice(0, half), x.slice(0, half), omega);
    const fitX2 = harmonicFit(trel.slice(half), x.slice(half), omega);
    const fitY1 = harmonicFit(trel.slice(0, half), y.slice(0, half), omega);
    const fitY2 = harmonicFit(trel.slice(half), y.slice(half), omega);
    const p2p = (arr) => Math.max(...arr) - Math.min(...arr);
    const tEnd = t[n - 1];
    let ns = n; for (let i = n - 1; i >= 0; i--) { if (tEnd - t[i] > naiveS) { ns = n - 1 - i; break; } }
    const tailX = x.slice(n - ns), tailY = y.slice(n - ns);
    return {
      n, x0: tr.x0, y0: tr.y0,
      ampX: fitX.amp, ampY: fitY.amp, driftX: fitX.drift, driftY: fitY.drift,
      ampX_half1: fitX1.amp, ampX_half2: fitX2.amp, ampY_half1: fitY1.amp, ampY_half2: fitY2.amp,
      p2pX_full: p2p(x), p2pY_full: p2p(y),
      p2pX_naive: p2p(tailX), p2pY_naive: p2p(tailY), naiveN: ns,
    };
  }

  function snapshotReduced(omega, naiveS) {
    return state.tracers.list.map((tr) => reduceTracer(tr, omega, naiveS));
  }
  function snapshotRaw() {
    return state.tracers.list.map((tr) => ({ x0: tr.x0, y0: tr.y0, path: tr.path.slice() }));
  }

  function gaugeAdd(x, z) { state.gauges.push({ x, z, hist: [] }); return state.gauges.length - 1; }
  function gaugeHist(k) { return state.gauges[k].hist.map((r) => ({ t: r.t, h: r.h, d: r.d })); }
  function gaugeClear() { state.gauges.length = 0; }

  function stillWater(x) {
    // mean bed/depth at column x over whatever is in the column buffer right now
    const col = SIM.columns(true);
    const i = Math.max(0, Math.min(sim.nx - 1, Math.round(x / sim.dx)));
    return { bed: col[i * 4], depth: col[i * 4 + 1], surf: col[i * 4] + col[i * 4 + 1] };
  }

  // ---- synchronous driver, bypassing tickFrame/rAF entirely ----
  // Found the hard way (see B6-ursell/rig.js for the full story): with two
  // other workers sharing the GPU, tickFrame's own AIMD frame-budget
  // governor throttles nsubMax to keep the (headless-anyway) UI
  // "responsive" — observed realtime factor 0.06 instead of the requested
  // speed under load, AND a `RIG.run()` window that runs right after a
  // parameter/station change can still be carrying residual transient
  // energy from whatever ran immediately before it (own repeat measurements
  // showed a 1.7-2.3x first-half-vs-second-half amplitude GROWTH at every
  // depth simultaneously — not noise, an unsettled mean state). Driving
  // SIM.step()+advanceTracers() directly in a tight loop sidesteps the
  // frame governor, and starting every digit from a values-only param
  // change on an already-long-settled tank (not chained mid-transient off
  // a just-finished different experiment) avoids the contamination.
  function driveTracersSync(simSeconds, chunk) {
    chunk = chunk || 40;
    const targetT = sim.t + simSeconds;
    let guard = 0;
    while (sim.t < targetT && guard < 400000) {
      const before = sim.t;
      SIM.step(chunk);
      advanceTracers(sim.t - before);
      guard++;
    }
    return { t: sim.t, chunks: guard };
  }

  window.RIG = { C, sleep, setWave, primeTracers, run, harmonicFit, reduceTracer,
                 snapshotReduced, snapshotRaw, gaugeAdd, gaugeHist, gaugeClear, stillWater,
                 driveTracersSync };
})();
