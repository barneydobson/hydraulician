"use strict";
/**
 * reconstruct.js — RECON: the averaging numerics that must be exactly right,
 * kept free of WebGL so they can be unit-tested against closed-form answers.
 *
 * Two jobs. First, the running weighted-mean and Welford updates: the GLSL
 * accumulators implement the SAME formulae, and `test/recon-test.mjs` is what
 * pins them down. Raw sums were rejected because <eta^2> - <eta>^2 for a 5 mm
 * wobble on a 1 m datum is a ratio of 2.5e-5 against float32's 1.2e-7 eps —
 * about two surviving digits of the variance the excursion band is drawn from.
 *
 * Second, the surface reconstruction (Tasks 2-4). See docs/averaging.md.
 */
const RECON = (() => {

  /** One running weighted-mean update. `T` is the window BEFORE this sample.
   *  docs/averaging.md §4.4. */
  function accumStep(mean, phi, T, dt) {
    // Guard against division by zero: T + dt can be exactly zero on the first call
    // with dt = 0 (though it should not happen in practice).
    const k = dt / Math.max(T + dt, 1e-30);
    return mean + k * (phi - mean);
  }

  /** Weighted Welford second moment. `meanOld`/`meanNew` bracket this sample. */
  function welford(M2, meanOld, meanNew, phi, dt) {
    return M2 + dt * (phi - meanOld) * (phi - meanNew);
  }

  const sigma = (M2, T) => {
    // Guard against float round-off producing a tiny negative variance from
    // the accumulated second moment, which can happen when the signal is near
    // the rounding limit.
    return T > 0 ? Math.sqrt(Math.max(0, M2 / T)) : 0;
  };

  /** Geometric fill from the stored channels — the compaction of
   *  docs/averaging.md §7.1. `min(f,1) = f - P/c^2` holds identically on both
   *  EOS branches, so removing slot storage is a subtraction, not an
   *  iteration. Clamped because the stored P is the DIAGNOSTIC pressure (it
   *  carries the bulk-damping term and lags the fill by one substep), so the
   *  difference can stray a little outside [0,1].
   *
   *  Skipping it is not a rounding error: the slot excess is g*d/2c^2 of the
   *  depth — 7.9 mm on 1 m at c = 25, and 77 mm at c = 8. */
  function geomFill(fbar, pbar, c) {
    const g = fbar - pbar / Math.max(c * c, 1e-12);
    return g < 0 ? 0 : (g > 1 ? 1 : g);
  }

  /** Depth of one connected body: the geometric fill integrated over it.
   *  This is the UNMASKED integral — it credits all cells, including those
   *  below WET that are bridged but not accumulated by the shader. See
   *  `bodyDepth` for the masked version that matches `FS_COL`. */
  function columnDepth(gcol, j0, j1, dx) {
    let d = 0;
    for (let j = j0; j <= j1; j++) d += gcol[j];
    return d * dx;
  }

  /** Depth of one connected body, masked exactly as `FS_COL` masks it: a cell
   *  below WET is bridged by the walk but `continue`s past the accumulation,
   *  so it contributes no depth. `columnDepth` is the UNMASKED integral and
   *  stays that way — the exceedance profiles in C1/C6 run continuously below
   *  WET, and masking them would cost the volume-preserving property that
   *  makes the mean fill integrate to the mean level. Two different questions,
   *  two functions. */
  function bodyDepth(gcol, j0, j1, dx) {
    let d = 0;
    for (let j = j0; j <= j1; j++) if (gcol[j] >= WET) d += gcol[j];
    return d * dx;
  }

  // FS_COL's own thresholds, exported so that nothing restates them. A second
  // definition of "wet" anywhere would put two different surfaces on one screen.
  const WET = 0.25;         // a cell counts as water above this fill
  const DRY_BREAK = 3;       // this many successive dry cells ends the body
  const SURF = 0.5;          // the fill that marks the top-cell surface

  /** Connected water bodies in one column, lowest first — the same walk
   *  FS_COL does, applied here to the MEAN fill. Gaps of one and two dry
   *  cells are BRIDGED; three ends the body. That asymmetry is the shader's
   *  and is load-bearing: see docs/averaging.md §7.2 and test D2. Ghost rows
   *  (solid or out-of-domain cells) arrive as solid[j]=1 — the function scans
   *  the full column where FS_COL walks only [1, NY-2). */
  function bodies(gcol, solid, ny) {
    const out = [];
    let j = 0;
    while (j < ny) {
      while (j < ny && (solid[j] || gcol[j] <= WET)) j++;   // find the next wet cell
      if (j >= ny) break;
      const j0 = j;
      let last = j, dry = 0;
      for (; j < ny; j++) {
        if (solid[j]) break;
        // Dry test is strict `f < WET` to match FS_COL's `if (f < 0.25)`.
        // This asymmetry (bed-find uses `>`, walk uses `<`) is the shader's own.
        if (gcol[j] < WET) { if (++dry >= DRY_BREAK) break; continue; }
        dry = 0; last = j;
      }
      out.push({ j0, j1: last });
    }
    return out;
  }

  return { accumStep, welford, sigma, geomFill, columnDepth, bodyDepth, WET, DRY_BREAK, SURF, bodies };
})();
