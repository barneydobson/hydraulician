// WV-2 "The buried wave gauge" -- rig.js
//
// This demo needs no drawn geometry (both flumes ship complete), only two
// instruments on one vertical, near the paddle, inside the coherent zone
// WV-1 mapped. Paste into the dev console after loading the scene, or use
// as a reference for the runner snippets used to build this folder.
//
// Gauge 1 = "bed" (near the floor, just clear of the wall).
// Gauge 2 = "surface" (near the free surface, always wet through the trough).
//
// IMPORTANT read this before trusting a wavedeep bed number -- see
// README.md "Why the bed gauge is worse than blind" for the evidence:
// a literal 2-cell-above-bed point probe in wavedeep is NOISE-DOMINATED
// (repeat runs of the identical T=0.90/amp=0.11 setup gave bed DFT
// amplitudes of 0.0084, 0.0249, 0.0339, 0.0429 and 0.0452 m -- a 5x spread
// with no sign of converging as the averaging window is lengthened to 38
// periods). The wave (intermediate) flume does not show this problem.

const WV2 = {
  C: (id) => CONTROLS.find(c => c.id === id),

  // Still-water depth and measured bed elevation, read live off each scene
  // (js/scenes.js gives lev/bed; the sim rasterises "bed" about half a cell
  // off the nominal value, so these are the MEASURED numbers this dry-run
  // used, not the nominal 0.35 / 0.74).
  flumes: {
    wave:     { h: 0.3528, bed: 0.2472, gaugeX: 0.6, bedY: 0.270, surfY: 0.517 },
    wavedeep: { h: 0.7385, bed: 0.2615, gaugeX: 1.2, bedY: 0.290, surfY: 0.780 },
  },

  // Place the two gauges for a flume. Clears any existing gauges first
  // (max 4 total; this demo only ever needs 2).
  place(flumeId) {
    const f = WV2.flumes[flumeId];
    APP.state.gauges = [
      { x: f.gaugeX, y: f.bedY,  hist: [], colour: '#7fd4ff' },  // gauge 1: bed
      { x: f.gaugeX, y: f.surfY, hist: [], colour: '#ffb37f' },  // gauge 2: surface
    ];
    APP.state.tool = 'gauge';
    if (window.syncTools) window.syncTools();
    return f;
  },

  // Full student-style setup: load scene, set piston, settle PAST the
  // scene's own spin-up (critical -- see README "The spin-up trap"),
  // place gauges, run the recording window, and return both DFT amplitudes
  // and the naive peak-to-peak/2 read for comparison.
  run(flumeId, T, amp, opts) {
    opts = opts || {};
    const settlePeriods = opts.settlePeriods || 6;
    const recordPeriods = opts.recordPeriods || 6;
    APP.loadScene(flumeId, false);
    WV2.C('speed').set(1);
    WV2.C('waveOn').set(true); WV2.C('waveT').set(T); WV2.C('waveA').set(amp);
    WV2.C('gaugeField').set('h');
    syncPanel();
    const spinup = APP.state.scene.spinup || 0;
    // The scene runs FLAT OUT (ignoring dt/speed) until sim.t clears
    // `spinup`; settling for fewer seconds than that leaves every
    // subsequent APP.frames() call still in "warming" mode, advancing by
    // an adaptive, uneven substep count instead of the nominal 1/60 s --
    // the gauge timestamps come out wildly non-uniform. Always clear
    // spin-up FIRST, in one tick() call, before placing gauges.
    const settleSteps = Math.round((spinup + settlePeriods * T) / APP.SIM.dt());
    APP.tick(settleSteps);
    const f = WV2.place(flumeId);
    APP.state.paused = false;
    const nFrames = Math.min(850, Math.round(recordPeriods * T * 60));
    APP.frames(nFrames, 1 / 60);
    APP.state.paused = true;
    const bed = APP.state.gauges[0].hist, surf = APP.state.gauges[1].hist;
    function dftAmp(hist, freq) {
      const t = hist.map(p => p.t), y = hist.map(p => p.h);
      const n = t.length, mean = y.reduce((a, b) => a + b, 0) / n;
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const ph = 2 * Math.PI * freq * t[i];
        re += (y[i] - mean) * Math.cos(ph);
        im -= (y[i] - mean) * Math.sin(ph);
      }
      return 2 * Math.sqrt(re * re + im * im) / n;
    }
    const freq = 1 / T;
    const ampBed = dftAmp(bed, freq), ampSurf = dftAmp(surf, freq);
    const yb = bed.map(p => p.h), ys = surf.map(p => p.h);
    const p2pBed = (Math.max(...yb) - Math.min(...yb)) / 2;
    const p2pSurf = (Math.max(...ys) - Math.min(...ys)) / 2;
    return {
      flume: flumeId, T, amp,
      ampBedDFT: ampBed, ampSurfDFT: ampSurf, ratioDFT: ampBed / ampSurf,
      p2pBed, p2pSurf, ratioP2P: p2pBed / p2pSurf,
      n: bed.length,
    };
  },
};

// Example: WV2.run('wave', 1.50, 0.060) -> {ratioDFT: 0.862, ...}
// Example: WV2.run('wavedeep', 0.90, 0.11) -> {ratioDFT: ~2-8, unstable -- see README}
