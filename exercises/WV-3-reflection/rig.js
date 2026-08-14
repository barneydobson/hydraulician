// WV-3 "Reflection coefficient of a steep sea wall" -- rig.js
//
// No geometry to draw -- both flumes (`wavesurge`, `wave`) ship complete,
// same as WV-1/WV-2's wave flumes. This rig is measurement code: a
// many-station standing-wave envelope scanner, reused across this folder's
// dry-run and citable as the pattern for B5 (Iribarren jigsaw, both
// beaches) and B6 (Ursell number).
//
// Paste into the dev console after loading a wave scene, or use as the
// reference for the runner snippets used to build this folder. Two ways to
// drive it:
//   1) `WV3.setup(scene, T, amp)` then, OUTSIDE the page (shell), run
//      `runner.py pump --id X --sim-seconds <settleTotal>` (the settle can
//      be long -- 40-50 s of sim time -- and pump's heartbeat/resume beats
//      a single blocking eval call).
//   2) `WV3.record(scene, T, opts)` afterwards, in one eval call, to scan
//      the envelope and return the summary (station list stays small, so
//      the JSON payload back over CDP is cheap even at 30+ stations).
//
// Why not the on-screen Gauge tool for the envelope? Max 4 gauges at once
// (Appendix B, HJ-1), and we want 20-30 stations per run. SIM.patch(x0,x1)
// (js/sim.js) pulls back a whole rectangular strip of the U texture in ONE
// readPixels, so scanning many stations costs the same one sync per sample
// as scanning one station would -- the same trick sim.js itself uses for
// tracer advection. The per-station quantity extracted is EXACTLY what a
// gauge reads: head = y_probe + p/(rho g) (see js/main.js sampleGauges,
// `head: gg.y + pr.head`), just batched. Section 3 of the README separately
// validates this against the literal on-screen gauge/chart a student uses.
//
// IMPORTANT (from WV-2's own README, "the spin-up trap", generalising to
// any wave-flume recording on this codebase): `wave`/`wavesurge` both run
// FLAT OUT (ignoring dt/speed) until sim.t clears scene.spinup -- always
// clear spin-up with APP.tick or the runner's `pump` BEFORE recording, or
// timestamps come out non-uniform and every derived amplitude is garbage.
// This rig's `setup()` reports the settle budget; the CALLER must actually
// advance that much sim-time (via `pump`) before calling `record()`.

window.WV3 = {
  C: (id) => CONTROLS.find(c => c.id === id),

  // Both flumes share one physical geometry (flume() in js/scenes.js):
  // same still water, same paddle position. Only the beach differs.
  // h/bed/lev here are MEASURED off the running solver at Medium
  // resolution (SIM.columns(true) on the flat bed before the piston
  // moves), not the nominal lev-bed from scenes.js -- see README S2.
  flumes: {
    wavesurge: { h: 0.3483, bed: 0.2472, lev: 0.5955, xPaddle: 0.30, xBeachToe: 8.0, slope: 0.70 },
    wave:      { h: 0.3483, bed: 0.2472, lev: 0.5955, xPaddle: 0.30, xBeachToe: 1.2,  slope: 0.10 },
  },

  // Linear dispersion, Newton-solved: g k tanh(kh) = (2 pi / T)^2.
  dispersion(T, h) {
    const g = 9.81, sigma2 = (2 * Math.PI / T) ** 2;
    let k = sigma2 / g;
    if (!(k > 0)) k = 0.5;
    for (let n = 0; n < 80; n++) {
      const th = Math.tanh(k * h);
      const f = g * k * th - sigma2;
      const df = g * th + g * k * h * (1 - th * th);
      const step = f / df;
      k -= step;
      if (!(k > 0)) k = 1e-6;
    }
    const L = 2 * Math.PI / k;
    return { k, L, c: L / T, kh: k * h };
  },

  // How long to settle before the standing pattern is established
  // everywhere in the measuring zone: clear the scene's own spin-up, THEN
  // give the wave time to reach the beach and its reflection time to
  // travel back across the WHOLE zone (round trip from the paddle-side
  // edge of the zone to the beach and back), plus a few periods of margin
  // for the piston's own start-up transient to radiate through.
  settleBudget(sceneId, T, opts) {
    opts = opts || {};
    const f = WV3.flumes[sceneId];
    const disp = WV3.dispersion(T, f.h);
    const x0 = opts.x0 != null ? opts.x0 : 1.0;
    const roundTrip = 2 * (f.xBeachToe - x0);
    const extra = Math.max(15, roundTrip / disp.c + 3 * T);
    const spinup = opts.spinup != null ? opts.spinup : 25;
    return { spinup, extra, total: spinup + extra, c: disp.c, L: disp.L };
  },

  // Load the scene, set the piston, and report the settle budget. Does NOT
  // itself advance time -- the caller pumps `total` sim-seconds (from
  // t=0) via the shell runner, THEN calls record().
  setup(sceneId, T, amp) {
    APP.loadScene(sceneId, false);
    WV3.C('budget').set('Medium');
    WV3.C('waveOn').set(true);
    WV3.C('waveT').set(T);
    WV3.C('waveA').set(amp);
    syncPanel();
    const budget = WV3.settleBudget(sceneId, T);
    return { scene: sceneId, T, amp, dt: APP.SIM.dt(), settle: budget };
  },

  // Scan the envelope. Assumes the sim has ALREADY been pumped to
  // `settleBudget(...).total` sim-seconds. Reads a strip of the pressure
  // field at (stationDx-spaced x, a fixed fraction up the water column)
  // once per sample via SIM.patch, computes the DFT amplitude at the
  // paddle frequency per station, and reports the envelope + antinode/
  // node + a node-spacing cross-check against linear dispersion.
  record(sceneId, T, opts) {
    opts = opts || {};
    const f = WV3.flumes[sceneId];
    const dt = APP.SIM.dt();
    const g = Math.abs(APP.sim.p.g) || 9.81;
    const x0 = opts.x0 != null ? opts.x0 : 1.0;
    const x1 = opts.x1 != null ? opts.x1 : Math.min(f.xBeachToe - 0.5, 7.5);
    const stationDx = opts.stationDx || 0.20;
    const yFrac = opts.yFrac != null ? opts.yFrac : 0.75;
    const probeY = f.bed + yFrac * f.h;
    const recordPeriods = opts.recordPeriods || 10;
    const samplesPerPeriod = opts.samplesPerPeriod || 20;

    const stations = [];
    for (let x = x0; x <= x1 + 1e-9; x += stationDx) stations.push(+x.toFixed(3));
    const n = stations.length;
    const series = stations.map(() => ({ t: [], head: [] }));

    const stepsPerSample = Math.max(1, Math.round((T / samplesPerPeriod) / dt));
    const totalSamples = Math.round(recordPeriods * samplesPerPeriod);
    const padX0 = Math.max(0, x0 - 0.05), padX1 = x1 + 0.05;

    let minWetMargin = Infinity;   // smallest (head - probeY) seen -> clearance check
    const minMarginPerStation = stations.map(() => Infinity);
    for (let s = 0; s < totalSamples; s++) {
      APP.SIM.step(stepsPerSample);
      const t = APP.sim.t;
      const patch = APP.SIM.patch(padX0, padX1);
      const row = Math.max(0, Math.min(patch.ny - 1, Math.floor(probeY / patch.dx)));
      for (let si = 0; si < n; si++) {
        const i = Math.floor(stations[si] / patch.dx);
        const col = Math.max(0, Math.min(patch.w - 1, i - patch.i0));
        const idx = (row * patch.w + col) * 4;
        const p = patch.buf[idx + 2];
        const head = probeY + p / g;
        series[si].t.push(t);
        series[si].head.push(head);
        const margin = head - probeY;
        if (margin < minWetMargin) minWetMargin = margin;
        if (margin < minMarginPerStation[si]) minMarginPerStation[si] = margin;
      }
    }

    const freq = 1 / T;
    const amp = series.map((s) => WV3.dftAmp(s.t, s.head, freq));
    const naive = series.map((s) => (Math.max(...s.head) - Math.min(...s.head)) / 2);

    let iMax = 0, iMin = 0;
    for (let i = 1; i < amp.length; i++) {
      if (amp[i] > amp[iMax]) iMax = i;
      if (amp[i] < amp[iMin]) iMin = i;
    }
    const aMax = amp[iMax], aMin = amp[iMin];
    const Krefl = (aMax - aMin) / (aMax + aMin);

    // Node-spacing cross-check: local minima of the envelope, spacing
    // between consecutive ones compared against L/2 from dispersion.
    const disp = WV3.dispersion(T, f.h);
    const localMinima = [];
    for (let i = 1; i < amp.length - 1; i++) {
      if (amp[i] < amp[i - 1] && amp[i] <= amp[i + 1]) localMinima.push(stations[i]);
    }
    const spacings = [];
    for (let i = 1; i < localMinima.length; i++) spacings.push(localMinima[i] - localMinima[i - 1]);

    return {
      scene: sceneId, T, amp: opts.ampPiston, n, dt,
      stations, envelope: amp, naiveP2P: naive,
      aMax, xAtMax: stations[iMax], aMin, xAtMin: stations[iMin], Krefl,
      minWetMargin, minMarginPerStation, probeY,
      dispersion: disp, localMinima, nodeSpacings: spacings,
      recordSeconds: totalSamples * stepsPerSample * dt,
    };
  },

  // Two-probe (Goda & Suzuki 1976) linear decomposition. Needed on the
  // `wave` (spilling) flume: its flat run is only ~0.9 m (paddle to beach
  // toe at x=1.2), shorter than L/2 for every period in this folder's
  // band, so no node/antinode PAIR ever fits and the envelope max/min
  // method cannot be applied honestly there (see README S2). Two probes a
  // known Δx apart, both still in water of near-uniform depth, are enough:
  // write the total surface as incident + reflected travelling waves,
  //   C(x) = a_I exp(-ik x) + a_R exp(+ik x)     (complex DFT coefficient)
  // and solve the resulting 2x2 complex linear system for a_I, a_R from
  // the two stations' complex Fourier coefficients at the paddle frequency.
  // Standard method; does not need multiple wavelengths of uniform bed,
  // only Δx not a multiple of L/2 (checked below).
  twoProbeKrefl(sceneId, T, opts) {
    opts = opts || {};
    const f = WV3.flumes[sceneId];
    const dt = APP.SIM.dt();
    const g = Math.abs(APP.sim.p.g) || 9.81;
    const x1 = opts.x1 != null ? opts.x1 : 0.70;
    const x2 = opts.x2 != null ? opts.x2 : 1.10;
    const yFrac = opts.yFrac != null ? opts.yFrac : 0.5;
    const probeY = f.bed + yFrac * f.h;
    const recordPeriods = opts.recordPeriods || 12;
    const samplesPerPeriod = opts.samplesPerPeriod || 24;
    const dx = x2 - x1;

    const disp = WV3.dispersion(T, f.h);
    const kdx = disp.k * dx;
    const degenerate = Math.abs(Math.sin(kdx)) < 0.15;   // near a multiple of pi/2's danger zone for pi

    const s1 = { t: [], head: [] }, s2 = { t: [], head: [] };
    const stepsPerSample = Math.max(1, Math.round((T / samplesPerPeriod) / dt));
    const totalSamples = Math.round(recordPeriods * samplesPerPeriod);
    for (let s = 0; s < totalSamples; s++) {
      APP.SIM.step(stepsPerSample);
      const t = APP.sim.t;
      const patch = APP.SIM.patch(x1 - 0.05, x2 + 0.05);
      const row = Math.max(0, Math.min(patch.ny - 1, Math.floor(probeY / patch.dx)));
      [[x1, s1], [x2, s2]].forEach(([x, s]) => {
        const i = Math.floor(x / patch.dx);
        const col = Math.max(0, Math.min(patch.w - 1, i - patch.i0));
        const idx = (row * patch.w + col) * 4;
        const p = patch.buf[idx + 2];
        s.t.push(t); s.head.push(probeY + p / g);
      });
    }
    // complex DFT coefficient at the paddle frequency (re, im), same
    // convention as dftAmp but keeping the raw components.
    function dftComplex(t, y, freq) {
      const n = t.length, mean = y.reduce((a, b) => a + b, 0) / n;
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const ph = 2 * Math.PI * freq * t[i];
        re += (y[i] - mean) * Math.cos(ph);
        im -= (y[i] - mean) * Math.sin(ph);
      }
      return { re: 2 * re / n, im: 2 * im / n };
    }
    const freq = 1 / T;
    const C1 = dftComplex(s1.t, s1.head, freq), C2 = dftComplex(s2.t, s2.head, freq);
    // complex helpers (plain {re,im} objects)
    const cx = {
      add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
      sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
      mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
      div: (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; },
      abs: (a) => Math.hypot(a.re, a.im),
      exp_i: (th) => ({ re: Math.cos(th), im: Math.sin(th) }),
    };
    const eplus = cx.exp_i(kdx), eminus = cx.exp_i(-kdx);
    const D = cx.sub(eplus, eminus);                          // 2i sin(kdx)
    const aI = cx.div(cx.sub(cx.mul(C1, eplus), C2), D);
    const aR = cx.div(cx.sub(C2, cx.mul(C1, eminus)), D);
    const AI = cx.abs(aI), AR = cx.abs(aR);
    return {
      scene: sceneId, T, x1, x2, dx, kdx, degenerate,
      ampI: AI, ampR: AR, Krefl: AR / AI,
      probeAmp1: WV3.dftAmp(s1.t, s1.head, freq), probeAmp2: WV3.dftAmp(s2.t, s2.head, freq),
      dispersion: disp, n: s1.t.length,
    };
  },

  // DFT amplitude at a given frequency from an unevenly-or-evenly sampled
  // {t[], head[]} series -- same formula as WV-2's rig.js (2/n * |sum|).
  dftAmp(t, y, freq) {
    const nSamp = t.length;
    const mean = y.reduce((a, b) => a + b, 0) / nSamp;
    let re = 0, im = 0;
    for (let i = 0; i < nSamp; i++) {
      const ph = 2 * Math.PI * freq * t[i];
      re += (y[i] - mean) * Math.cos(ph);
      im -= (y[i] - mean) * Math.sin(ph);
    }
    return 2 * Math.sqrt(re * re + im * im) / nSamp;
  },

  // Student-style single-gauge read: place ONE gauge (the Gauge tool's own
  // code path, max 4 gauges, state.gauges + APP.frames -- the same
  // rendering/analyse/sampleGauges pipeline a real browser tab runs), let
  // it run for a few seconds, and report BOTH fields the gauge card can
  // show: "head" (y + p/(rho g), a raw point-pressure proxy for surface
  // elevation) and "depth" (A.h[i], the per-COLUMN reduced depth -- what
  // the programme text's "depth oscillation amplitude" literally names,
  // and immune to gauge-y placement since it ignores gg.y entirely). Both
  // are always recorded in gg.hist regardless of the panel's gaugeField
  // display setting, so one run gives both. For each field: the naive
  // peak-to-peak/2 (== half the difference of the two numbers the on-
  // screen chart card PRINTS at top-right/bottom-right, js/overlay.js
  // drawGaugeCharts) and the DFT amplitude from the identical samples --
  // used to validate the worksheet's "read the printed hi/lo" instruction
  // against the automated envelope (README S3).
  studentGauge(x, T, seconds) {
    const f = WV3.flumes[APP.state.scene.id];
    const probeY = f.bed + 0.5 * f.h;   // depth field ignores y; head just needs to stay wet
    APP.state.gauges = [{ x, y: probeY, hist: [], colour: '#7fd4ff' }];
    APP.state.tool = 'gauge';
    if (window.syncTools) window.syncTools();
    APP.state.paused = false;
    const nFrames = Math.min(850, Math.round(seconds * 60));
    APP.frames(nFrames, 1 / 60);
    APP.state.paused = true;
    const hist = APP.state.gauges[0].hist;
    const t = hist.map((p) => p.t);
    const head = hist.map((p) => p.head), depth = hist.map((p) => p.depth);
    const p2p = (arr) => (Math.max(...arr) - Math.min(...arr)) / 2;
    return {
      x, T, n: hist.length, spanSeconds: t.length ? t[t.length - 1] - t[0] : 0,
      head: { p2p: p2p(head), dft: WV3.dftAmp(t, head, 1 / T) },
      depth: { p2p: p2p(depth), dft: WV3.dftAmp(t, depth, 1 / T) },
    };
  },
};

// Example (after `pump --sim-seconds <settle.total>`):
//   WV3.setup('wavesurge', 3.00, 0.14)                 -> {settle:{total:~44,...}}
//   WV3.record('wavesurge', 3.00, {ampPiston: 0.14})   -> {Krefl: ..., aMax, aMin, ...}
