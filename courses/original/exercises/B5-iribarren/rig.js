// B5 "Iribarren map jigsaw" -- rig.js
//
// Both flumes (`wave`, `wavesurge`) ship complete -- no geometry to draw.
// This is measurement code: near-paddle incident-wave extraction (reusing
// WV-3's two-probe Goda-Suzuki decomposition, needed because `wavesurge`
// reflects 66-96% -- a raw near-paddle read there is badly contaminated by
// the returning wave), linear-theory shoaling to deep-water equivalents,
// the Iribarren number, and a shoreward H/h profile scan to locate
// breaking onset and the still-water shoreline (surf-zone width).
//
// Paste into the dev console after loading a wave scene, or drive via the
// runner (exercises/_runner/runner.py). Usage:
//   B5.setup('wave', 1.50, 0.06)                 -> {settle:{total:...}}
//   ... pump `settle.total` sim-seconds ...
//   B5.incident('wave', 1.50)                    -> {ampI, xi0, ...}
//   B5.profile('wave', 1.50)                     -> per-station H/h(x)
//
// Geometry MEASURED off the running solver (SIM.columns(true) on the flat
// bed before the piston moves, Medium resolution) -- both flumes share one
// still water and paddle position (flume() in js/scenes.js); only the
// beach (toe x, slope) differs. Confirmed against js/scenes.js source:
// `wave` slope: 0.10 (tanbeta = 0.10 EXACTLY); `wavesurge` slope: 0.70
// (tanbeta = 0.70 EXACTLY -- NOT 1/1.4=0.714; the "1:1.4 sea wall" name in
// WV-3/CLAUDE.md is a description, the coded slope is 0.70).
window.B5 = {
  C: (id) => CONTROLS.find(c => c.id === id),
  g: 9.81,

  flumes: {
    wave:      { h: 0.3483, bed: 0.2472, lev: 0.5955, xPaddle: 0.30, xBeachToe: 1.2, slope: 0.10 },
    wavesurge: { h: 0.3483, bed: 0.2472, lev: 0.5955, xPaddle: 0.30, xBeachToe: 8.0, slope: 0.70 },
  },

  // Linear dispersion, Newton-solved: g k tanh(kh) = (2 pi / T)^2.
  dispersion(T, h) {
    const g = B5.g, sigma2 = (2 * Math.PI / T) ** 2;
    let k = sigma2 / g;
    if (!(k > 0)) k = 0.5;
    for (let n = 0; n < 80; n++) {
      const th = Math.tanh(k * h);
      const f = g * k * th - sigma2;
      const df = g * th + g * k * h * (1 - th * th);
      k -= f / df;
      if (!(k > 0)) k = 1e-6;
    }
    const L = 2 * Math.PI / k;
    return { k, L, c: L / T, kh: k * h };
  },

  // Deep-water equivalents from a LOCAL (near-paddle) measurement.
  //   L0   = g T^2 / (2 pi)                     -- from T alone
  //   Ks   = sqrt(Cg0 / Cg_local)                -- shoaling coefficient
  //   H0   = H_local / Ks                        -- deep-water-equivalent H
  //   xi0  = tanbeta / sqrt(H0 / L0)
  shoal(T, h, H_local, tanbeta) {
    const g = B5.g;
    const disp = B5.dispersion(T, h);
    const kh = disp.kh;
    const sinh2kh = Math.sinh(2 * kh);
    const n = sinh2kh > 1e-9 ? 0.5 * (1 + (2 * kh) / sinh2kh) : 1.0;
    const CgLocal = n * disp.c;
    const L0 = g * T * T / (2 * Math.PI);
    const Cg0 = g * T / (4 * Math.PI);
    const Ks = Math.sqrt(Cg0 / CgLocal);
    const H0 = H_local / Ks;
    const steepness0 = H0 / L0;
    const xi0 = tanbeta / Math.sqrt(steepness0);
    const steepnessLocal = H_local / disp.L;
    const xiLocal = tanbeta / Math.sqrt(steepnessLocal);
    return { T, h, H_local, L_local: disp.L, kh, n, C: disp.c, CgLocal, L0, Cg0, Ks, H0, xi0, xiLocal };
  },

  classify(xi) {
    if (xi < 0.5) return 'spilling';
    if (xi <= 3.3) return 'plunging (nominal)';
    return 'surging';
  },

  // How long to settle: clear scene spinup, then give the wave time to
  // reach the beach toe (one-way), plus a few periods of paddle start-up
  // margin. (Shorter than WV-3's reflection-round-trip budget -- B5 only
  // needs the ONE-WAY arrival to see how the wave meets the beach, not a
  // fully-developed standing pattern.)
  settleBudget(sceneId, T, opts) {
    opts = opts || {};
    const f = B5.flumes[sceneId];
    const disp = B5.dispersion(T, f.h);
    const oneWay = f.xBeachToe - f.xPaddle;
    const extra = Math.max(15, oneWay / disp.c + 3 * T);
    const spinup = opts.spinup != null ? opts.spinup : 25;
    return { spinup, extra, total: spinup + extra, c: disp.c, L: disp.L };
  },

  setup(sceneId, T, amp) {
    APP.loadScene(sceneId, false);
    B5.C('budget').set('Medium');
    B5.C('waveOn').set(true);
    B5.C('waveT').set(T);
    B5.C('waveA').set(amp);
    syncPanel();
    const budget = B5.settleBudget(sceneId, T);
    return { scene: sceneId, T, amp, dt: APP.SIM.dt(), settle: budget };
  },

  // Peak piston velocity vs local wave celerity -- WV-1's non-breaking
  // heuristic (amp*omega << c; violations overtop the paddle face).
  paddleSafety(sceneId, T, amp) {
    const f = B5.flumes[sceneId];
    const disp = B5.dispersion(T, f.h);
    const peakVel = amp * (2 * Math.PI / T);
    return { peakVel, c: disp.c, ratio: peakVel / disp.c };
  },

  dftComplex(t, y, freq) {
    const n = t.length, mean = y.reduce((a, b) => a + b, 0) / n;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const ph = 2 * Math.PI * freq * t[i];
      re += (y[i] - mean) * Math.cos(ph);
      im -= (y[i] - mean) * Math.sin(ph);
    }
    return { re: 2 * re / n, im: 2 * im / n };
  },

  dftAmp(t, y, freq) {
    const c = B5.dftComplex(t, y, freq);
    return Math.hypot(c.re, c.im);
  },

  // Two-probe (Goda & Suzuki 1976) linear decomposition -- separates the
  // INCIDENT wave from whatever has already reflected off the beach, using
  // two stations a known Δx apart in near-uniform depth. Needed near the
  // paddle on `wavesurge` (Krefl 0.66-0.96 there, WV-3) where a raw single
  // -station read is a mix of outgoing and returning wave, not a clean H.
  // Copied verbatim from WV-3-reflection/rig.js (see that folder for the
  // derivation/validation).
  twoProbeIncident(sceneId, T, opts) {
    opts = opts || {};
    const f = B5.flumes[sceneId];
    const dt = APP.SIM.dt();
    const g = Math.abs(APP.sim.p.g) || B5.g;
    const x1 = opts.x1 != null ? opts.x1 : f.xPaddle + 0.35;
    const x2 = opts.x2 != null ? opts.x2 : f.xPaddle + 0.75;
    const yFrac = opts.yFrac != null ? opts.yFrac : 0.5;
    const probeY = f.bed + yFrac * f.h;
    const recordPeriods = opts.recordPeriods || 10;
    const samplesPerPeriod = opts.samplesPerPeriod || 24;
    const dx = x2 - x1;

    const disp = B5.dispersion(T, f.h);
    const kdx = disp.k * dx;
    const degenerate = Math.abs(Math.sin(kdx)) < 0.15;

    const s1 = { t: [], head: [] }, s2 = { t: [], head: [] };
    const stepsPerSample = Math.max(1, Math.round((T / samplesPerPeriod) / dt));
    const totalSamples = Math.round(recordPeriods * samplesPerPeriod);
    let minMargin = Infinity;
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
        const head = probeY + p / g;
        s.t.push(t); s.head.push(head);
        const margin = head - probeY;
        if (margin < minMargin) minMargin = margin;
      });
    }
    const freq = 1 / T;
    const C1 = B5.dftComplex(s1.t, s1.head, freq), C2 = B5.dftComplex(s2.t, s2.head, freq);
    const cx = {
      sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
      mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
      div: (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; },
      abs: (a) => Math.hypot(a.re, a.im),
      exp_i: (th) => ({ re: Math.cos(th), im: Math.sin(th) }),
    };
    const eplus = cx.exp_i(kdx), eminus = cx.exp_i(-kdx);
    const D = cx.sub(eplus, eminus);
    const aI = cx.div(cx.sub(cx.mul(C1, eplus), C2), D);
    const aR = cx.div(cx.sub(C2, cx.mul(C1, eminus)), D);
    const AI = cx.abs(aI), AR = cx.abs(aR);
    return {
      scene: sceneId, T, x1, x2, dx, kdx, degenerate, minMargin,
      ampI: AI, ampR: AR, Krefl: AR / AI, dispersion: disp,
    };
  },

  // Full pipeline: measure near-paddle incident amplitude, convert to
  // deep-water equivalents, return xi0. Call AFTER pumping settleBudget().
  measure(sceneId, T, tanbeta, opts) {
    const r = B5.twoProbeIncident(sceneId, T, opts);
    const H_local = 2 * r.ampI;
    const sh = B5.shoal(T, B5.flumes[sceneId].h, H_local, tanbeta);
    return Object.assign({}, r, sh, { H_local, behaviour: B5.classify(sh.xi0) });
  },

  // Shoreward H/h(x) profile: DFT amplitude at the paddle frequency, many
  // stations from near the paddle out to (and a little past) the beach
  // toe, using SIM.patch (one readPixels per sample for the WHOLE strip --
  // same trick as WV-3's record()). h(x) at each station comes from ONE
  // SIM.columns(true) call on the settled state (bed/local still depth
  // computed geometrically from the flume's own bed/lev, since the beach
  // is a fixed rigid slope). Returns {stations, H, h, ratio} for plotting
  // and for finding breaking onset (first x where H/h crosses ~0.7).
  profile(sceneId, T, opts) {
    opts = opts || {};
    const f = B5.flumes[sceneId];
    const dt = APP.SIM.dt();
    const g = Math.abs(APP.sim.p.g) || B5.g;
    const x0 = opts.x0 != null ? opts.x0 : f.xPaddle + 0.2;
    const x1 = opts.x1 != null ? opts.x1 : Math.min(f.xBeachToe + (f.h / f.slope) + 0.3, 11.5);
    const stationDx = opts.stationDx || 0.10;
    // Near-BED probe (not mid-column): a fixed-elevation point probe goes
    // dry at the TROUGH once wave height is a large fraction of local
    // depth -- exactly the regime we're scanning INTO here. head=y+p/(rho
    // g) reads the true free-surface elevation from any wet point under
    // quasi-hydrostatic flow, so probing low (WV-2's "~1/10-1/15 of depth"
    // bed-gauge convention) keeps the probe wet through the deepest trough
    // and avoids clipping the DFT amplitude low right where it matters
    // most (cf. WV-3 iteration 3: a fixed-elevation probe silently reads
    // zero, not an error, once the bed is close enough to broach it).
    const yFrac = opts.yFrac != null ? opts.yFrac : 0.12;
    const recordPeriods = opts.recordPeriods || 8;
    const samplesPerPeriod = opts.samplesPerPeriod || 20;

    const stations = [];
    for (let x = x0; x <= x1 + 1e-9; x += stationDx) stations.push(+x.toFixed(3));
    const n = stations.length;
    const series = stations.map(() => ({ t: [], head: [] }));
    const stepsPerSample = Math.max(1, Math.round((T / samplesPerPeriod) / dt));
    const totalSamples = Math.round(recordPeriods * samplesPerPeriod);
    const padX0 = Math.max(0, x0 - 0.05), padX1 = x1 + 0.05;

    // local still depth at each station: bed(x) is the flat -0.40 slab out
    // to xBeachToe, then rises at `slope`; still water surface = f.lev.
    const bedAt = (x) => x <= f.xBeachToe ? f.bed : f.bed + f.slope * (x - f.xBeachToe);
    const hAt = (x) => Math.max(0, f.lev - bedAt(x));
    const probeYAt = (x) => bedAt(x) + yFrac * hAt(x);

    for (let s = 0; s < totalSamples; s++) {
      APP.SIM.step(stepsPerSample);
      const t = APP.sim.t;
      const patch = APP.SIM.patch(padX0, padX1);
      for (let si = 0; si < n; si++) {
        const x = stations[si];
        const py = probeYAt(x);
        const row = Math.max(0, Math.min(patch.ny - 1, Math.floor(py / patch.dx)));
        const i = Math.floor(x / patch.dx);
        const col = Math.max(0, Math.min(patch.w - 1, i - patch.i0));
        const idx = (row * patch.w + col) * 4;
        const p = patch.buf[idx + 2];
        series[si].t.push(t);
        series[si].head.push(py + p / g);
      }
    }
    const freq = 1 / T;
    const H = series.map((s) => 2 * B5.dftAmp(s.t, s.head, freq));
    const Hp2p = series.map((s) => Math.max(...s.head) - Math.min(...s.head));
    const minMargin = series.map((s, si) => Math.min(...s.head) - probeYAt(stations[si]));
    const h = stations.map(hAt);
    const ratio = H.map((Hi, i) => h[i] > 1e-6 ? Hi / h[i] : 0);
    const ratioP2P = Hp2p.map((Hi, i) => h[i] > 1e-6 ? Hi / h[i] : 0);

    // breaking onset: first station where the (more robust, clip-immune)
    // peak-to-peak ratio crosses 0.70 (approaching the 0.78 criterion
    // CLAUDE.md/scenes.js quote, called slightly early so the screenshot
    // lands ON the front rather than past it)
    let xBreakOnset = null;
    for (let i = 0; i < n; i++) { if (ratioP2P[i] >= 0.70) { xBreakOnset = stations[i]; break; } }
    const xShoreline = f.xBeachToe + f.h / f.slope;
    const surfWidth = xBreakOnset != null ? (xShoreline - xBreakOnset) : null;

    return { scene: sceneId, T, stations, H, Hp2p, h, ratio, ratioP2P, minMargin, xBreakOnset, xShoreline, surfWidth };
  },
};
