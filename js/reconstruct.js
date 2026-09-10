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

  /** The level where the mean fill crosses `th`, interpolated linearly
   *  between cell centres. Returns NaN if the profile never crosses.
   *
   *  Takes the FIRST crossing walking upward from j0. For the monotone
   *  exceedance profile of a sharp interface — what this is for — that is
   *  the only crossing, and it is the outer surface. It is deliberately NOT
   *  the outer envelope of a non-monotone column: spray sitting above a gap
   *  (fill dips then rises again before falling for good) reports the LOWER
   *  excursion, understating the band's high edge with no error and no NaN
   *  (measured: 54% low on [1,1,1,0.8,0.3,0.02,0.5,0.2,0.01], test C9). No
   *  caller needs the outer envelope: `reconstruct()` never calls
   *  `bandLevels`, and its own caller passes one body's bounds, where the
   *  profile is close to monotone by construction. */
  function crossing(gcol, j0, j1, dx, th) {
    for (let j = j0; j < j1; j++) {
      if (gcol[j] >= th && gcol[j + 1] < th) {
        const t = (gcol[j] - th) / (gcol[j] - gcol[j + 1]);
        return (j + 0.5 + t) * dx;
      }
    }
    return NaN;
  }

  /** The excursion band, from the level sets of the mean fill.
   *
   *  Where the interface is sharp, fbar(z) = Pr(eta > z), so the level sets
   *  ARE the percentiles of the surface — and they are INVERTED: few frames
   *  reached the top of the band, so `fbar = 0.05` is the HIGH edge. Reading
   *  it the other way draws a band upside down without looking wrong, which
   *  is why test C4 asserts the orientation directly. */
  function bandLevels(gcol, j0, j1, dx) {
    return { eta95: crossing(gcol, j0, j1, dx, 0.05),
             eta05: crossing(gcol, j0, j1, dx, 0.95) };
  }

  /** The aeration / partial-fill gap: how far the visible mean surface stands
   *  above the level the same water would reach compacted. Positive is void
   *  inside the connected envelope; negative is sub-threshold fill above the
   *  top cell FS_COL selected. Published rather than hidden, because the line
   *  is drawn at eta_bar while the depth reading is d_bar and the two are not
   *  the same number — docs/averaging.md §7.3. */
  const aerationGap = (etaBar, bed, dBar) => etaBar - (bed + dBar);

  /** Whole-grid reconstruction. One entry per column; `mask >= 192` is solid,
   *  matching SIM's rasterised mask. `d2d` uses `bodyDepth`, NOT `columnDepth`:
   *  it exists to cross-check the GPU's own column reduction (`FS_COL` in
   *  js/shaders.js), which `continue`s past sub-threshold cells without
   *  accumulating depth. Using the unmasked integral here would make d2d
   *  disagree with the shader by construction — measuring the shader's own
   *  bridging bug instead of checking against it. */
  function reconstruct(o) {
    const { fbar, pbar, mask, nx, ny, dx, c } = o;
    // Gravity, because compaction only means anything where the EOS is
    // one-sided. `g` is optional and defaults to the scene default; a caller
    // reading it off a live sim should pass `g: sim.p.g` so a zero-gravity
    // scene lands in the refusal below rather than in a plausible answer.
    const g = o.g === undefined ? 9.81 : o.g;
    // docs/averaging.md §7.1 / test E4: the g = 0 scene is excluded by
    // construction. Its EOS is TWO-SIDED, so P_diag goes negative, and
    // geomFill's clamp(g, 0, 1) would silently absorb that and hand back a
    // fill that looks like water — the failure mode with no symptom. There is
    // also no free surface there to reconstruct. Refuse loudly instead.
    if (!(Math.abs(g) > 0)) {
      throw new Error(
        "RECON.reconstruct: refusing g = " + g + " — the zero-gravity scene has "
        + "a two-sided EOS (p may be negative) and no free surface, so the "
        + "min(f,1) = f - P/c^2 compaction of docs/averaging.md §7.1 does not "
        + "hold. Reconstruction is not defined there.");
    }
    const bed = new Float64Array(nx), d2d = new Float64Array(nx), all = [];
    const gcol = new Float64Array(ny), solid = new Uint8Array(ny);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = j * nx + i;
        solid[j] = mask[k] >= 192 ? 1 : 0;
        gcol[j] = solid[j] ? 0 : geomFill(fbar[k], pbar[k], c);
      }
      const b = bodies(gcol, solid, ny);
      all.push(b);
      bed[i] = b.length ? b[0].j0 * dx : 0;
      d2d[i] = b.length ? bodyDepth(gcol, b[0].j0, b[0].j1, dx) : 0;
    }
    return { bed, d2d, bodies: all };
  }

  /** The depth a reservoir of specific energy `E` delivers at discharge `q`.
   *
   *  A reservoir level is an ENERGY grade line: the water in it is at rest, so
   *  its surface IS the total head. What arrives in the channel is therefore
   *  the depth that solves
   *
   *      E  =  d  +  q^2 / (2 g d^2),        E = level - bed,
   *
   *  and the delivered depth FALLS as q rises. Pinning the surface at the
   *  level instead adds the velocity head on top of it, which manufactures
   *  head out of nothing: measured on s2 at the shipped q = 1.2, the inlet
   *  energy line stood 0.264 m above the 2.07 m reservoir feeding it, and at
   *  q = 1.8 it stood 0.655 m above.
   *
   *  Two roots straddle critical depth and the caller says which it wants,
   *  because the choice is the reach's, not the boundary's: a mild reach
   *  enters subcritical, a chute passes through critical at the crest and runs
   *  supercritical below it.
   *
   *  Below E_min = 1.5 d_c there is NO root — the reservoir cannot pass that
   *  discharge at that level. The honest answer is critical depth with
   *  `choked` set and `qmax` saying what it could actually deliver, so the
   *  caller can say so rather than quietly inventing a section.
   *
   *  Bisection, not Newton: F is convex with its minimum exactly at d_c, so
   *  both brackets below are guaranteed and 100 halvings reach float64's
   *  precision for a few dozen flops, once a frame. A Newton step from a bad
   *  start walks straight through the minimum into the other root.
   */
  function inletDepth(E, q, g, branch) {
    const dc = Math.pow(q * q / g, 1 / 3);
    const Emin = 1.5 * dc;
    // The most a reservoir of this energy can pass, at critical: d = 2E/3.
    const qmax = E > 0 ? Math.sqrt(g * Math.pow(2 * E / 3, 3)) : 0;
    const out = { d: 0, dc, Emin, qmax, choked: false };
    if (!(E > 0)) { out.choked = true; return out; }
    if (!(q > 0)) { out.d = E; return out; }          // still water: level = surface

    // At E = E_min the two roots coincide AT d_c, and float64 rounding on
    // 1.5 * dc must not tip that case into "choked". Treat the band as
    // critical and hand back d_c from either branch.
    const slack = 1e-9 * Math.max(1, Emin);
    if (E < Emin - slack) { out.d = dc; out.choked = true; return out; }
    if (E <= Emin + slack) { out.d = dc; return out; }

    const F = (d) => d + q * q / (2 * g * d * d) - E;
    // Subcritical: F(d_c) = 1.5 d_c - E < 0 and F(E) = q^2/2gE^2 > 0.
    // Supercritical: at d = q/sqrt(2gE) the velocity head is exactly E, so
    // F = d > 0, and F(d_c) < 0 — a bracket that needs no search.
    let lo, hi;
    if (branch === "super") { lo = q / Math.sqrt(2 * g * E); hi = dc; }
    else                    { lo = dc; hi = E; }
    // F is negative at the d_c end of both brackets, positive at the other.
    const negAtLo = branch === "super" ? false : true;
    for (let k = 0; k < 100; k++) {
      const mid = 0.5 * (lo + hi);
      const neg = F(mid) < 0;
      if (neg === negAtLo) lo = mid; else hi = mid;
    }
    out.d = 0.5 * (lo + hi);
    return out;
  }

  /** One column's depth, discharge and TRUE velocity head.
   *
   *  The energy grade line is drawn at h + hv, and hv was the mean-velocity
   *  head V^2/2g — which sets the kinetic-energy correction coefficient alpha
   *  to 1 by construction and leaves w out altogether. The honest quantity is
   *  the kinetic energy the flow actually carries per unit weight of it,
   *
   *      hv  =  ( int f u (u^2 + w^2)/2 dz )  /  ( g int f u dz )  =  a V^2/2g,
   *
   *  with alpha falling out of the same integrals rather than being assumed.
   *  Measured on m2 off the Favre mean, alpha runs 1.44 at x = 3 down to 1.21
   *  at x = 13.3; because it VARIES the drawn line has a slope error, and
   *  because it falls towards the drawdown the line sags exactly there — about
   *  25 mm of head "lost" over the last 0.3 m before the brink that is not
   *  lost at all.
   *
   *  `f` is the DENSITY as well as the fill, so the two integrals that are
   *  fluxes take it raw (an over-full cell really does carry that mass) while
   *  the depth takes it clamped — the same split FS_COL makes, for the same
   *  reason. alpha is 1 where there is no flow to correct, so a still or dry
   *  column returns a finite number instead of poisoning a polyline. */
  function columnEnergy(f, u, w, dx, g) {
    let d = 0, q = 0, ke = 0;
    for (let k = 0; k < f.length; k++) {
      const fr = f[k];
      if (!(fr > 0)) continue;
      const uk = u[k], wk = w[k];
      d  += (fr < 1 ? fr : 1) * dx;
      q  += fr * uk * dx;
      ke += fr * uk * (uk * uk + wk * wk) / 2 * dx;
    }
    const V = d > 0 ? q / d : 0;
    const hv = Math.abs(q) > 1e-30 ? ke / (g * q) : 0;
    const vh = V * V / (2 * g);
    return { d, q, V, hv, alpha: vh > 1e-30 ? hv / vh : 1 };
  }

  return { accumStep, welford, sigma, geomFill, columnDepth, bodyDepth, WET, DRY_BREAK, SURF, bodies, inletDepth, columnEnergy,
           bandLevels, aerationGap, reconstruct };
})();
