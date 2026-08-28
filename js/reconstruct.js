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
var RECON = (() => {

  /** One running weighted-mean update. `T` is the window BEFORE this sample.
   *  docs/averaging.md §4.4. */
  function accumStep(mean, phi, T, dt) {
    const k = dt / Math.max(T + dt, 1e-30);
    return mean + k * (phi - mean);
  }

  /** Weighted Welford second moment. `meanOld`/`meanNew` bracket this sample. */
  function welford(M2, meanOld, meanNew, phi, dt) {
    return M2 + dt * (phi - meanOld) * (phi - meanNew);
  }

  const sigma = (M2, T) => (T > 0 ? Math.sqrt(Math.max(0, M2 / T)) : 0);

  return { accumStep, welford, sigma };
})();
