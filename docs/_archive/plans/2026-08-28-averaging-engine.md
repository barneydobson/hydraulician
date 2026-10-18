# Averaging engine (phase C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Live/Average measurement mode whose mean field satisfies the
solver's own discrete mass balance, and whose free surface is reconstructed
rather than smeared.

**Architecture:** Three accumulators with three jobs, because the quantity this
solver conserves is not the quantity that makes a good picture. A per-frame
Favre field (`f`, `f u_c`, `f w_c`, `P`) drives the display; a per-substep
transport accumulator emitting `FS_VOF`'s own limited face fluxes certifies
mass; a per-frame `nx × 1` column accumulator carries the authoritative
readings and feeds the channel overlay. Surface reconstruction is a pure
function in its own file so it can be unit-tested against closed-form answers
with no GPU.

**Tech Stack:** WebGL2, classic scripts, zero dependencies, no build step.
Tests are Node 22+ with built-ins only (`node:vm`, `node:http`, global
`WebSocket`).

**Spec:** [docs/averaging.md](../../averaging.md) — read it before Task 1. The
plan implements it; where they disagree, the spec wins.

## Global Constraints

- **Zero dependencies, classic scripts.** No modules, no bundlers, no `fetch`
  in `index.html` or `js/*`. The app must boot from `file://`.
- **Notation is law.** `z` for the domain vertical, `w` for vertical velocity,
  `d` for depth, `η` for level, `h = z + p/ρg`, pressure head always spelled
  `p/ρg`. Screen-space pixel coordinates stay `y`. `check_notation.py` greps
  for retired names.
- **`U.b` is KINEMATIC pressure `p/ρ_w`, in m²/s².** Pressure head is `U.b/g`.
  Never divide it by density again.
- **The wire format does not change.** No new rig JSON keys, no bump of `V`.
  Averaging state is session-only.
- **The vof pass is the dangerous one.** Both face neighbours must compute the
  identical flux. Task 5 changes it; read `docs/engineering-notes.md`
  Conservation section first.
- **No simulation pass may read an accumulator.** Switching Average on must not
  change a single computed value.
- **All CSS lives in `index.html`.** No stylesheet files.
- Run from the repo root; branch is `averaging-engine`, cut from `main`.

## Branch note — read before Task 9

This branch is off `main`, which does **not** have PR #47 (phase A+B). `main`
has no `LEGEND`, no `UIMODE`, no `FIELDS` registry, no `u_lo`/`u_hi` (still
`u_vmax`/`u_hmax`), and no energy-head mode 7. Tasks 1–8 are the engine and are
conflict-free: they add new files, new shaders, new buffers, and touch overlay
internals (`_hA`, `_qA`, `_ynK`, `resetEstimates`, `analyse`, `sm`) that #47
does not modify at all.

**Task 9 is the only entangled one.** #47 rewrites 23 lines in exactly the
`FS_DISP` colouring branches Task 9 must also change. Task 9 is therefore
deliberately last and is written against whichever branch is current when it is
reached. Do not start it until Tasks 1–8 are green.

## File structure

| File | Responsibility |
|---|---|
| `js/reconstruct.js` *(new)* | `RECON` — the pure numerics: running-mean and Welford reference, geometric fill, connected-body segmentation, column compaction, band level sets. No GL, no globals beyond `RECON`. |
| `test/recon-test.mjs` *(new)* | Groups A–E and G. Loads `js/reconstruct.js` through `node:vm`; no browser. |
| `js/shaders.js` | `FS_ACC` (Favre field), `FS_ACOL` (column + Welford), `FS_VOF` refactored to a shared `fluxX`/`fluxZ` plus an `ACCUM` variant. |
| `js/gl.js` | `createFBO2` — two colour attachments plus `drawBuffers`, for the MRT target. |
| `js/sim.js` | Accumulator lifecycle (`avgStart`/`avgStop`/`avgReset`), per-frame and per-substep stepping, readbacks, `transportResidual`, `SIM.reconstruct` delegating to `RECON`. |
| `js/overlay.js` | `analyse(sim, col, opts)` gains an `averaged` path that bypasses `sm()`, `_hA`, `_qA` and `_ynK`. |
| `js/main.js` | `state.avg`, the frame-loop call, `APP.avg` for headless tests; Task 9 adds the toggle. |
| `exercises/_runner/smoke.js` | `SUITES.avg` — groups F and H, on the GPU. |

---

### Task 1: `RECON` scaffold, the averaging arithmetic, and its test harness

Groups A and G. This is the reference the GLSL mirrors, so it is written first
and in JS where it can be tested exactly.

**Files:**
- Create: `js/reconstruct.js`
- Create: `test/recon-test.mjs`
- Modify: `index.html:806-816` — add the script tag
- Modify: `AGENTS.md:27-31` — add the file-table row

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RECON.accumStep(mean, phi, T, dt)` → `number` — one running weighted-mean update.
  - `RECON.welford(M2, meanOld, meanNew, phi, dt)` → `number` — weighted Welford second moment.
  - `RECON.sigma(M2, T)` → `number` — `√(M₂/T)`, `0` when `T ≤ 0`.

- [ ] **Step 1: Write the failing test**

Create `test/recon-test.mjs`:

```js
// Zero-dependency unit tests for js/reconstruct.js — no browser, no GPU.
// The file is a classic script defining the global RECON, so it is loaded
// into a vm context rather than imported.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../js/reconstruct.js", import.meta.url), "utf8");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const RECON = ctx.RECON;

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; return true; }
  failures.push(name + (detail === undefined ? "" : "\n      " + detail));
  return false;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- Group A: accumulator arithmetic ------------------------------------
// A2: dt-weighted, NOT frame-count. Samples 0 (dt=1) and 4 (dt=3) -> 3.
{
  let m = 0, T = 0;
  for (const [phi, dt] of [[0, 1], [4, 3]]) { m = RECON.accumStep(m, phi, T, dt); T += dt; }
  ok("A2 dt-weighted mean is 3, not 2", near(m, 3, 1e-12), `got ${m}`);
}

// A6: a source RATE is h-weighted; an INCREMENT is not. dfS = 2h with h=1,3
// gives rate 2 everywhere. Weighting the increment by h would give 5.
{
  let m = 0, T = 0;
  for (const h of [1, 3]) { const rate = (2 * h) / h; m = RECON.accumStep(m, rate, T, h); T += h; }
  ok("A6 source rate averages to 2, not 5", near(m, 2, 1e-12), `got ${m}`);
}

// ---- Group G: numerical robustness --------------------------------------
// G1: 5 mm wobble on a 1 m datum. The naive <eta^2>-<eta>^2 in float32 keeps
// about two digits of sigma^2; weighted Welford keeps it.
{
  const eta0 = 1.0, a = 0.005, N = 200000;
  let m = 0, M2 = 0, T = 0;
  let sum = Math.fround(0), sumSq = Math.fround(0);
  for (let n = 0; n < N; n++) {
    const e = eta0 + a * Math.sin(2 * Math.PI * n / 1000);
    const mNew = RECON.accumStep(m, e, T, 1);
    M2 = RECON.welford(M2, m, mNew, e, 1);
    m = mNew; T += 1;
    sum = Math.fround(sum + Math.fround(e));
    sumSq = Math.fround(sumSq + Math.fround(e * e));
  }
  const exact = a / Math.SQRT2;
  const naive = Math.sqrt(Math.max(0, Math.fround(sumSq / N) - Math.pow(Math.fround(sum / N), 2)));
  ok("G1 Welford sigma to 3 digits", near(RECON.sigma(M2, T), exact, exact * 1e-3),
     `welford ${RECON.sigma(M2, T)} exact ${exact}`);
  ok("G1 naive float32 sigma is demonstrably worse",
     Math.abs(naive - exact) > Math.abs(RECON.sigma(M2, T) - exact) * 10,
     `naive ${naive} welford ${RECON.sigma(M2, T)} exact ${exact}`);
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/recon-test.mjs`
Expected: FAIL — `Cannot read properties of undefined (reading 'accumStep')`, because `js/reconstruct.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `js/reconstruct.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/recon-test.mjs`
Expected: `3 passed, 0 failed`

- [ ] **Step 5: Wire the script tag and the file table**

In `index.html`, after line 806 (`js/gl.js`) and before `js/shaders.js`:

```html
<script src="js/reconstruct.js"></script>
```

In `AGENTS.md`, add to the file table after the `js/gl.js` row:

```markdown
| `js/reconstruct.js` | `RECON` — the averaging numerics with no WebGL in them: running mean, Welford, geometric fill, connected bodies, column compaction, band level sets |
```

- [ ] **Step 6: Commit**

```bash
git add js/reconstruct.js test/recon-test.mjs index.html AGENTS.md
git commit -m "RECON: the averaging arithmetic, in JS where it can be checked

A dt-weighted running mean and a weighted Welford moment, with the tests
that pin them: a frame-count average of samples 0 and 4 at dt 1 and 3 reads
2 where the time average reads 3, and treating a source increment as a rate
reads 5 where the rate reads 2. Welford rather than raw sums because the
variance of a 5 mm wobble on a 1 m datum is 2.5e-5 against float32 eps of
1.2e-7 — two surviving digits of the number the excursion band is drawn from.

The GLSL accumulators implement the same two formulae; this file is what
they are checked against.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Compaction — the closed-form geometric fill

Group B. `min(f,1) ≡ f − P/c²` on both EOS branches, so removing slot storage
needs no iteration. Getting this wrong costs 7.9 mm on a 1 m depth at `c = 25`
and 77 mm at `c = 8`.

**Files:**
- Modify: `js/reconstruct.js` — add `geomFill`, `columnDepth`
- Modify: `test/recon-test.mjs` — add group B

**Interfaces:**
- Consumes: Task 1's module.
- Produces:
  - `RECON.geomFill(fbar, pbar, c)` → `number` — `clamp(fbar − pbar/c², 0, 1)`.
  - `RECON.columnDepth(gcol, j0, j1, dx)` → `number` — `Δx · Σ g` over `[j0, j1]` inclusive.

- [ ] **Step 1: Write the failing test**

Append to `test/recon-test.mjs`, before the `console.log` summary:

```js
// ---- Group B: compaction and compressibility ----------------------------
// A hydrostatic column: f = 1 + g(eta-z)/c^2 below the surface, so the stored
// fill exceeds the geometric depth by the slot storage. B1/B2 build the fill
// and the BARE EOS pressure consistently, so there is no lag here.
function hydrostatic(eta, c, dx, ny, g = 9.81) {
  const f = new Float64Array(ny), P = new Float64Array(ny);
  for (let j = 0; j < ny; j++) {
    const z = (j + 0.5) * dx;
    if (z >= eta) { f[j] = 0; P[j] = 0; continue; }
    f[j] = 1 + g * (eta - z) / (c * c);
    P[j] = c * c * Math.max(f[j] - 1, 0);      // the bare one-sided EOS
  }
  return { f, P };
}
for (const [c, rawExpect] of [[25, 1.00785], [8, 1.07664]]) {
  const dx = 0.002, ny = 700, eta = 1.0;
  const { f, P } = hydrostatic(eta, c, dx, ny);
  const g = new Float64Array(ny);
  let raw = 0;
  for (let j = 0; j < ny; j++) { g[j] = RECON.geomFill(f[j], P[j], c); raw += f[j] * dx; }
  const d = RECON.columnDepth(g, 0, ny - 1, dx);
  ok(`B c=${c} compacted depth is 1.0`, near(d, eta, 1e-9), `got ${d}`);
  ok(`B c=${c} uncompacted would read ${rawExpect}`, near(raw, rawExpect, 5e-4), `got ${raw}`);
}
// B3: pressurised throughout — the identity on its f > 1 branch.
{
  const c = 25, dx = 0.01, ny = 50;
  let worst = 0;
  for (let j = 0; j < ny; j++) {
    const f = 1 + 0.03 * (ny - j) / ny;
    worst = Math.max(worst, Math.abs(RECON.geomFill(f, c * c * (f - 1), c) - 1));
  }
  ok("B3 pressurised cells compact to exactly 1", worst < 1e-12, `worst ${worst}`);
}
// B4: dry column.
ok("B4 dry column has zero depth and no NaN",
   RECON.columnDepth(new Float64Array(20), 0, 19, 0.01) === 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/recon-test.mjs`
Expected: FAIL — `RECON.geomFill is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `js/reconstruct.js`, inside the IIFE before the `return`:

```js
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

  /** Depth of one connected body: the geometric fill integrated over it. */
  function columnDepth(gcol, j0, j1, dx) {
    let d = 0;
    for (let j = j0; j <= j1; j++) d += gcol[j];
    return d * dx;
  }
```

and extend the return: `return { accumStep, welford, sigma, geomFill, columnDepth };`

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/recon-test.mjs`
Expected: `10 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add js/reconstruct.js test/recon-test.mjs
git commit -m "Compaction: remove slot storage with a subtraction, not a solve

min(f,1) is identically f - P/c^2 on both branches of the EOS, so the
geometric fill comes straight out of the two stored channels. The test builds
a hydrostatic column and checks the compacted depth is 1.000 where the raw
fill integral reads 1.00785 at c = 25 and 1.07664 at c = 8 — 7.9 mm and
77 mm of slot storage that would otherwise be reported as water.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Connected bodies — the segmentation rule, stated once

Groups D and E. The rule is `FS_COL`'s, transcribed exactly: start at the
lowest open cell with fill `> 0.25`, walk up, stop at solid or once **three**
successive cells are dry. One and two-cell gaps are bridged — this is the rule
I got backwards in an earlier draft, so D2 tests all four widths.

**Files:**
- Modify: `js/reconstruct.js` — add `bodies`
- Modify: `test/recon-test.mjs` — add groups D and E

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `RECON.WET = 0.25`, `RECON.DRY_BREAK = 3`, `RECON.SURF = 0.5` — the thresholds, exported so nothing restates them.
  - `RECON.bodies(gcol, solid, ny)` → `Array<{j0, j1}>` — connected runs, lowest first.

- [ ] **Step 1: Write the failing test**

Append to `test/recon-test.mjs`:

```js
// ---- Group D: falling jets and connectivity ------------------------------
// Build a column: pool 0..9, gap of `gap` dry cells, then a 6-cell nappe.
function poolAndNappe(gap, nappeFill) {
  const ny = 40, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < 10; j++) g[j] = 1;
  for (let j = 10 + gap; j < 16 + gap; j++) g[j] = nappeFill;
  return { g, solid, ny };
}
// D2: the shader breaks only after three successive dry cells.
for (const [gap, sep] of [[1, false], [2, false], [3, true], [4, true]]) {
  const { g, solid, ny } = poolAndNappe(gap, 0.6);
  const b = RECON.bodies(g, solid, ny);
  ok(`D2 gap of ${gap} dry cells ${sep ? "separates" : "is bridged"}`,
     (b.length > 1) === sep, `got ${b.length} bodies`);
}
// D1: with a clear gap the pool depth excludes the nappe entirely.
{
  const { g, solid, ny } = poolAndNappe(4, 0.6);
  const b = RECON.bodies(g, solid, ny);
  ok("D1 pool depth excludes the nappe",
     near(RECON.columnDepth(g, b[0].j0, b[0].j1, 0.01), 0.10, 1e-12));
  ok("D1 nappe thickness is its own integral",
     near(RECON.columnDepth(g, b[1].j0, b[1].j1, 0.01), 6 * 0.6 * 0.01, 1e-12));
}
// D4: a flapping nappe smeared to fbar = 0.2 over 5x its thickness still
// integrates to the true mean thickness — thresholding it away would not.
{
  const ny = 40, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 20; j < 30; j++) g[j] = 0.2;
  const b = RECON.bodies(g, solid, ny);
  ok("D4 smeared jet keeps its mean thickness",
     near(RECON.columnDepth(g, b[0].j0, b[0].j1, 0.01), 10 * 0.2 * 0.01, 1e-12));
}
// D5: isolated spray above the band is not part of the pool.
{
  const ny = 40, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < 10; j++) g[j] = 1;
  g[25] = 0.01; g[31] = 0.01;
  const b = RECON.bodies(g, solid, ny);
  ok("D5 sub-threshold spray does not join the pool", b[0].j1 === 9, `j1 ${b[0].j1}`);
}
// ---- Group E: geometry ---------------------------------------------------
// E1/E3: a perched pool above a lower one, split by solid, on a raised bed.
{
  const ny = 40, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < 4; j++) solid[j] = 1;              // bed raised off z=0
  for (let j = 4; j < 12; j++) g[j] = 1;
  for (let j = 12; j < 14; j++) solid[j] = 1;            // the shelf
  for (let j = 14; j < 18; j++) g[j] = 1;
  const b = RECON.bodies(g, solid, ny);
  ok("E1 solid splits the column into two bodies", b.length === 2, `got ${b.length}`);
  ok("E3 lower body starts at the lowest WET cell, not the lowest open one",
     b[0].j0 === 4, `j0 ${b[0].j0}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/recon-test.mjs`
Expected: FAIL — `RECON.bodies is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `js/reconstruct.js` before the `return`:

```js
  // FS_COL's own thresholds, exported so that nothing restates them. A second
  // definition of "wet" anywhere would put two different surfaces on one screen.
  const WET = 0.25;          // a cell counts as water above this fill
  const DRY_BREAK = 3;       // this many successive dry cells ends the body
  const SURF = 0.5;          // the fill that marks the top-cell surface

  /** Connected water bodies in one column, lowest first — the same walk
   *  FS_COL does, applied here to the MEAN fill. Gaps of one and two dry
   *  cells are BRIDGED; three ends the body. That asymmetry is the shader's
   *  and is load-bearing: see docs/averaging.md §7.2 and test D2. */
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
        if (gcol[j] <= WET) { if (++dry >= DRY_BREAK) break; continue; }
        dry = 0; last = j;
      }
      out.push({ j0, j1: last });
    }
    return out;
  }
```

Extend the return with `WET, DRY_BREAK, SURF, bodies`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/recon-test.mjs`
Expected: `20 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add js/reconstruct.js test/recon-test.mjs
git commit -m "Connected bodies: FS_COL's walk, transcribed and pinned

The segmentation rule is the shader's, so the thresholds are exported rather
than restated — a second definition of \"wet\" would put two different surfaces
on one screen. D2 tests all four gap widths because the asymmetry is easy to
get backwards: one and two dry cells are bridged, three ends the body.

A pool under a nappe keeps its own depth, a jet smeared to a fifth of its
fill still integrates to its true thickness, and spray does not join the pool.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Band level sets, `σ_η`, and the aeration gap `δ_a`

Group C's pure-function half. The level sets of the mean fill are the
percentiles of `η`, **inverted** — `f̄ = 0.05` is the *high* edge. Getting that
backwards draws an upside-down band that does not look wrong.

**Files:**
- Modify: `js/reconstruct.js` — add `bandLevels`, `aerationGap`, `reconstruct`
- Modify: `test/recon-test.mjs` — add group C

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `RECON.bandLevels(gcol, j0, j1, dx)` → `{eta05, eta95}` — `eta95` from the `f̄ = 0.05` crossing, linearly interpolated between cell centres.
  - `RECON.aerationGap(etaBar, bed, dBar)` → `number` — `η̄ − (z_b + d̄)`.
  - `RECON.reconstruct({fbar, pbar, mask, nx, ny, dx, c})` → `{bed, d2d, bodies}` — whole-grid entry point, one entry per column.

- [ ] **Step 1: Write the failing test**

Append to `test/recon-test.mjs`:

```js
// ---- Group C: a wobbling surface, known statistics ------------------------
// eta = eta0 + a sin(wt) over whole periods. The exceedance profile is the
// arcsine law: fbar(z) = 1/2 - asin((z-eta0)/a)/pi.
{
  const eta0 = 1.0, a = 0.05, dx = 0.0025, ny = 600;
  const g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < ny; j++) {
    const s = ((j + 0.5) * dx - eta0) / a;
    g[j] = s <= -1 ? 1 : s >= 1 ? 0 : 0.5 - Math.asin(s) / Math.PI;
  }
  const b = RECON.bodies(g, solid, ny)[0];
  // C1: integrating the exceedance profile returns the MEAN level. This is
  // the volume-preserving property, and it is exact.
  ok("C1 exceedance integral is the mean level",
     near(RECON.columnDepth(g, 0, ny - 1, dx), eta0, 1e-9));
  const { eta05, eta95 } = RECON.bandLevels(g, b.j0, ny - 1, dx);
  // C3: the arcsine percentiles, to the linear-interpolation error.
  ok("C3 eta95 = eta0 + 0.98769a", near(eta95, eta0 + 0.98769 * a, 5e-4), `got ${eta95}`);
  ok("C3 eta05 = eta0 - 0.98769a", near(eta05, eta0 - 0.98769 * a, 5e-4), `got ${eta05}`);
  // C4: the inversion. fbar = 0.05 is the HIGH edge.
  ok("C4 the fbar=0.05 crossing is the HIGH edge", eta95 > eta05);
  // C5: the band agrees with sigma. 2.7936 for a sinusoid, 3.2897 Gaussian.
  ok("C5 band/sigma is the sinusoid's 2.7936, not the Gaussian's 3.2897",
     near((eta95 - eta05) / (a / Math.SQRT2), 2.7936, 0.02));
}
// C6: a skewed surface. eta_hi for 30% of the window, eta_lo otherwise. The
// mean and the median differ, and only the mean conserves volume. Every
// symmetric case above passes either way; this one does not.
{
  const dx = 0.01, ny = 200, lo = 1.0, hi = 1.4, p = 0.3;
  const g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < ny; j++) {
    const z = (j + 0.5) * dx;
    g[j] = z < lo ? 1 : z < hi ? p : 0;          // exceedance of a two-state eta
  }
  const mean = p * hi + (1 - p) * lo, median = lo;
  ok("C6 the volume integral gives the MEAN, not the median",
     near(RECON.columnDepth(g, 0, ny - 1, dx), mean, 1e-9) &&
     !near(mean, median, 1e-6), `got ${RECON.columnDepth(g, 0, ny - 1, dx)}`);
}
// The aeration gap reconciles the drawn line with the reported depth.
ok("delta_a is eta_bar - (bed + d_bar)", near(RECON.aerationGap(1.4, 0.0, 1.12), 0.28, 1e-12));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/recon-test.mjs`
Expected: FAIL — `RECON.bandLevels is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `js/reconstruct.js` before the `return`:

```js
  /** The level where the mean fill crosses `th`, interpolated linearly
   *  between cell centres. Returns NaN if the profile never crosses. */
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
   *  matching SIM's rasterised mask. */
  function reconstruct(o) {
    const { fbar, pbar, mask, nx, ny, dx, c } = o;
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
      d2d[i] = b.length ? columnDepth(gcol, b[0].j0, b[0].j1, dx) : 0;
    }
    return { bed, d2d, bodies: all };
  }
```

Extend the return with `bandLevels, aerationGap, reconstruct`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/recon-test.mjs`
Expected: `27 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add js/reconstruct.js test/recon-test.mjs
git commit -m "The band is the level sets, and the line is the mean

Where the interface is sharp the mean fill IS the exceedance function, so its
level sets are the percentiles of the surface — inverted, because few frames
reached the top: fbar = 0.05 is the HIGH edge, and C4 asserts that directly
because reading it backwards draws an upside-down band that looks fine.

C6 is the case that matters. Every symmetric fixture passes whether the line
is drawn at the mean or the median; a surface that stands high 30% of the time
separates them, and only the mean conserves volume. Where the drawn line and
the reported depth disagree, delta_a publishes the difference instead of
leaving a student to find it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The exact transport accumulator — MRT in the vof pass

Group F. **This task changes the pass AGENTS.md flags as dangerous.** Read
`docs/engineering-notes.md` Conservation first. It has no dependency on Tasks
1–4 and is done early so its risk lands early.

The flux arithmetic does not change. It is *extracted* into `fluxX`/`fluxZ` so
that one expression serves both neighbours of a face — which is what makes
`F^E(i−1) ≡ F^W(i)` enforceable rather than merely true today — and then
emitted on a second render target.

**Files:**
- Modify: `js/gl.js` — add `createFBO2`
- Modify: `js/shaders.js:300-470` — extract `fluxX`/`fluxZ`, add the `ACCUM` variant
- Modify: `js/sim.js` — accumulator buffers, per-substep uniforms, `transportResidual`
- Modify: `exercises/_runner/smoke.js` — `SUITES.avg`, group F

**Interfaces:**
- Consumes: nothing from Tasks 1–4.
- Produces:
  - `GLH.createFBO2(gl, texA, texB)` → `WebGLFramebuffer` with `drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1])`.
  - `Shaders.FS_VOF_ACC` — the `ACCUM` variant.
  - `SIM.avgStart()` / `SIM.avgStop()` / `SIM.avgReset()` / `SIM.avgActive()` → `boolean` / `SIM.avgT()` → `number`.
  - `SIM.transportResidual()` → `{max, mean, n}` — interior, source-free cells only.

- [ ] **Step 1: Write the failing test**

Add to `exercises/_runner/smoke.js`, after `SUITES.pack`:

```js
SUITES.avg = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=h23`);
  const r = await B.evaluate(`(() => {
    __low(); APP.tick(600);                    // settle before the window opens
    APP.SIM.avgStart();
    APP.frames(120);
    const res = APP.SIM.transportResidual();
    const T   = APP.SIM.avgT();
    APP.frames(240);
    const res2 = APP.SIM.transportResidual();
    return { T, active: APP.SIM.avgActive(), max: res.max, max2: res2.max, n: res.n };
  })()`);
  ok("avg accumulator reports a positive window", r.T > 0, JSON.stringify(r));
  ok("avg residual has interior cells to report on", r.n > 100, JSON.stringify(r));
  // F1: the transport balance is an identity of the scheme, so the residual
  // is float32 accumulation noise and does NOT grow as the window lengthens.
  ok("F1 transport residual is at float32 level", r.max < 1e-5, `max ${r.max}`);
  ok("F1 residual does not grow with T", r.max2 < r.max * 4 + 1e-9,
     `max ${r.max} -> ${r.max2}`);
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: FAIL — `APP.SIM.avgStart is not a function`.

- [ ] **Step 3a: Add the MRT framebuffer helper**

In `js/gl.js`, after `createFBO`:

```js
  /** Two colour attachments, for a pass that emits a second texture. The
   *  drawBuffers call is the part that is easy to forget: without it the
   *  second output is silently discarded and everything still runs. */
  function createFBO2(gl, texA, texB) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("MRT framebuffer incomplete: 0x" + status.toString(16));
    }
    return fb;
  }
```

Add `createFBO2` to the returned object.

- [ ] **Step 3b: Extract the face flux in `FS_VOF`**

In `js/shaders.js`, replace the inline flux block (the `// --- limited upwind
face values` through the four `clamp` lines, currently `shaders.js:381-397`)
with calls to two new functions declared above `void main()`:

```glsl
// One face's limited flux, as ONE expression. Both neighbours of a face call
// this with the same arguments, so F^E(i,j) IS F^W(i+1,j) by construction
// rather than by coincidence — which is what lets the transport accumulator
// store each face once, and what AGENTS.md's identical-flux rule requires.
// Nothing here is new arithmetic; it is the same code, lifted.
float fluxX(int i, int j, float lim4){
  float fm = TF(ivec2(i,j)).r, fp = TF(ivec2(i+1,j)).r;
  float a  = TU(ivec2(i+1,j)).r;
  float ff = faceVal(TF(ivec2(i-1,j)).r, fm, fp, TF(ivec2(i+2,j)).r, a);
  float cf = 0.0;
  if (u_ca > 0.0) {
    float aC = min(fm,1.0), aE = min(fp,1.0);
    float aN  = min(TF(ivec2(i,  j+1)).r,1.0), aS  = min(TF(ivec2(i,  j-1)).r,1.0);
    float aNE = min(TF(ivec2(i+1,j+1)).r,1.0), aSE = min(TF(ivec2(i+1,j-1)).r,1.0);
    float gx = (aE - aC) / u_dx;
    float gz = ((aN + aNE) - (aS + aSE)) / (4.0*u_dx);
    float gm = sqrt(gx*gx + gz*gz) + 1e-8, am = 0.5*(aE + aC);
    cf = u_ca * abs(a) * am * (1.0 - am) * gx / gm;
  }
  return clamp(a*ff + cf, -lim4 * fp, lim4 * fm);
}
float fluxZ(int i, int j, float lim4){
  float fm = TF(ivec2(i,j)).r, fp = TF(ivec2(i,j+1)).r;
  float a  = TU(ivec2(i,j+1)).g;
  float ff = faceVal(TF(ivec2(i,j-1)).r, fm, fp, TF(ivec2(i,j+2)).r, a);
  float cf = 0.0;
  if (u_ca > 0.0) {
    float aC = min(fm,1.0), aN = min(fp,1.0);
    float aE  = min(TF(ivec2(i+1,j  )).r,1.0), aW  = min(TF(ivec2(i-1,j  )).r,1.0);
    float aNE = min(TF(ivec2(i+1,j+1)).r,1.0), aNW = min(TF(ivec2(i-1,j+1)).r,1.0);
    float gz = (aN - aC) / u_dx;
    float gx = ((aNE + aE) - (aNW + aW)) / (4.0*u_dx);
    float gm = sqrt(gx*gx + gz*gz) + 1e-8, am = 0.5*(aN + aC);
    cf = u_ca * abs(a) * am * (1.0 - am) * gz / gm;
  }
  return clamp(a*ff + cf, -lim4 * fp, lim4 * fm);
}
```

In `main()`, replace the removed block with:

```glsl
  float lim4 = 0.25 * dx / dt;
  float FW = fluxX(i-1, j, lim4), FE = fluxX(i, j, lim4);
  float FS = fluxZ(i, j-1, lim4), FN = fluxZ(i, j, lim4);
  float fCons = fC - dt * ((FE - FW) + (FN - FS)) / dx;   // UNCLAMPED candidate
  float fNew  = min(fCons, 8.0);
```

- [ ] **Step 3c: Emit the second target**

At the top of `FS_VOF`, replace `out vec4 o;` with:

```glsl
layout(location = 0) out vec4 o;
#ifdef ACCUM
layout(location = 1) out vec4 oA;      // (<F^E>, <F^N>, <S>, unused)
uniform sampler2D u_A;
uniform float u_Tacc;                  // window BEFORE this substep
#define ACC_KEEP  oA = texelFetch(u_A, c, 0);
#else
#define ACC_KEEP
#endif
```

The solid early return becomes `if (SO(c) > 0.5) { o = vec4(0.0); ACC_KEEP return; }`.

The ghost branch keeps its `o = m;` and adds the boundary faces — the left
ghost column owns the face between columns 0 and 1, the bottom ghost row the
face between rows 0 and 1:

```glsl
  if (gL || gR || gB || gT) {
    if (gB && u_openMode.z > 1.5) m = vec4(0.0);
    if (gT && u_openMode.w > 1.5) m = vec4(0.0);
#ifdef ACCUM
    // Ghost fill is boundary state, not conserved storage — but the flux
    // through its inner face is real, and interior column 1 / row 1 cannot
    // store it. Same fluxX/fluxZ call the interior neighbour makes, so it is
    // the same number, not an approximation of it.
    vec4 Ag = texelFetch(u_A, c, 0);
    float lim4g = 0.25 * dx / dt;
    float kg = dt / max(u_Tacc + dt, 1e-9);
    if (gL) Ag.r = Ag.r + kg * (fluxX(i, j, lim4g) - Ag.r);
    if (gB) Ag.g = Ag.g + kg * (fluxZ(i, j, lim4g) - Ag.g);
    oA = Ag;
#endif
    o = m; return;
  }
```

At the end of `main()`, after the final range clamp:

```glsl
#ifdef ACCUM
  // S is a RATE, not an increment: the balance in docs/averaging.md §5 has
  // units of fill per second. Weighting an increment by h would introduce an
  // extra factor of time — test A6.
  vec4 A = texelFetch(u_A, c, 0);
  float k = dt / max(u_Tacc + dt, 1e-9);
  float Srate = (fNew - fCons) / dt;
  oA = vec4(A.r + k * (FE - A.r),
            A.g + k * (FN - A.g),
            A.b + k * (Srate - A.b), 0.0);
#endif
```

Add the variant to the module's return:

```js
  // The #define must follow #version, which has to be the first line.
  const withAccum = (src) => src.replace(/^(#version[^\n]*\n)/, "$1#define ACCUM 1\n");
```

and export `FS_VOF_ACC: withAccum(FS_VOF)`.

- [ ] **Step 3d: Wire it in `sim.js`**

In `init`, add `prog.vofA = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_VOF_ACC);`

In `build`, after `S.colBuf`/`S.pxBuf`, add `S.avg = null;` and in `release`,
add `if (g.avg) { g.avg.T.dispose(); gl.deleteFramebuffer(g.avg.fboA); gl.deleteFramebuffer(g.avg.fboB); gl.deleteTexture(g.avg.f0); g.avg = null; }`.

Add the lifecycle and the residual:

```js
  // ------------------------------------------------------------- averaging
  /** Lazily allocated: a session that never opens Average pays nothing.
   *  `T` is the window in SIMULATED seconds and lives here, not in a texture —
   *  it is the same number in every cell, which is why four channels suffice. */
  function avgStart() {
    if (S.avg) return;
    const F = gl.RGBA32F, RGBA = gl.RGBA, FL = gl.FLOAT;
    const T = GLH.createDoubleBuffer(gl, S.nx, S.ny, F, RGBA, FL, null);
    // The vof pass writes f and the accumulator together, so both halves of
    // each ping-pong need a framebuffer that carries both attachments.
    const fboA = GLH.createFBO2(gl, S.F.b.tex, T.b.tex);
    const fboB = GLH.createFBO2(gl, S.F.a.tex, T.a.tex);
    const f0 = GLH.createTexture(gl, S.nx, S.ny, F, RGBA, FL, null);
    S.avg = { T, fboA, fboB, f0, t: 0 };
    snapshotF0();
  }
  function avgStop() { if (S.avg) { release({ avg: S.avg }); S.avg = null; } }
  function avgReset() { if (S.avg) { avgStop(); avgStart(); } }
  const avgActive = () => !!S.avg;
  const avgT = () => (S.avg ? S.avg.t : 0);

  /** f(0) for the endpoint term of the balance. One copy, taken when the
   *  window opens; f(T) is simply the live field. */
  function snapshotF0() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.bindTexture(gl.TEXTURE_2D, S.avg.f0);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, S.nx, S.ny);
  }

  /** The residual of docs/averaging.md §5, over interior cells with no source.
   *  Cells where <S> is nonzero are the sponge, the Dirichlet bands and the
   *  point sources; they are reported separately by group F4, not here. */
  function transportResidual() {
    if (!S.avg || !(S.avg.t > 0)) return { max: 0, mean: 0, n: 0 };
    const n = S.nx * S.ny;
    const A = new Float32Array(n * 4), fT = new Float32Array(n * 4), f0 = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.T.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, A);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, fT);
    const fb = GLH.createFBO(gl, S.avg.f0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, f0);
    gl.deleteFramebuffer(fb);
    const T = S.avg.t;
    let max = 0, sum = 0, cnt = 0;
    for (let j = 1; j < S.ny - 1; j++) {
      for (let i = 1; i < S.nx - 1; i++) {
        const k = (j * S.nx + i) * 4;
        if (S.mask[j * S.nx + i] >= 192) continue;
        if (Math.abs(A[k + 2]) > 1e-9) continue;              // source cell
        const div = (A[k] - A[k - 4] + A[k + 1] - A[(j - 1) * S.nx * 4 + i * 4 + 1]) / S.dx;
        const r = (fT[k] - f0[k]) / T + div - A[k + 2];
        const a = Math.abs(r);
        if (a > max) max = a;
        sum += a; cnt++;
      }
    }
    return { max, mean: cnt ? sum / cnt : 0, n: cnt };
  }
```

In `step`, select the variant and set the per-substep window uniform:

```js
      // --- volume: conservative limited advection of f (+ dye)
      const useAcc = !!S.avg;
      const pv = useAcc ? prog.vofA : prog.vof;
      gl.useProgram(pv);
      GLH.bindTex(gl, pv, useAcc
        ? [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid], ["u_A", S.avg.T.read.tex]]
        : [["u_U", S.U.read.tex], ["u_F", S.F.read.tex], ["u_S", S.solid]]);
      simUniforms(pv, h);
      gl.uniform1f(pv.u("u_ca"), p.ca);
      gl.uniform1f(pv.u("u_dyeDecay"), p.dyeDecay);
      gl.uniform2f(pv.u("u_dyeLine"), p.dyeLine, p.dyeLine > 0 ? 1 : 0);
      if (useAcc) {
        // T BEFORE this substep — the running-mean weight is h/(T+h).
        gl.uniform1f(pv.u("u_Tacc"), S.avg.t);
        // Both ping-pongs advance together: the MRT fbo whose attachments are
        // the two WRITE halves.
        GLH.bindTarget(gl, S.F.write === S.F.b ? S.avg.fboA : S.avg.fboB, S.nx, S.ny);
      } else {
        GLH.bindTarget(gl, S.F.write.fbo, S.nx, S.ny);
      }
      quad.draw();
      S.F.swap();
      if (useAcc) { S.avg.T.swap(); S.avg.t += h; }
```

Export `avgStart, avgStop, avgReset, avgActive, avgT, transportResidual` from `SIM`.

- [ ] **Step 4: Run the tests**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: PASS — 4 assertions.

Run: `node exercises/_runner/smoke.js --only=physics,api`
Expected: unchanged from before this task. The flux extraction must not move a
single number; if `physics` regresses, the extraction is not faithful.

- [ ] **Step 5: Commit**

```bash
git add js/gl.js js/shaders.js js/sim.js exercises/_runner/smoke.js
git commit -m "The transport accumulator: the scheme's own flux, not a picture of it

<f u_c> at cell centres is not what the vof pass advances — for fills
(0, 0.2, 0.8, 1) the van-Leer face value is 0.35 against an upwind product of
0.20, before the compression flux and the donor clamp. So the mass balance is
certified with the fluxes the pass already computes, emitted on a second
render target.

The flux arithmetic is lifted into fluxX/fluxZ rather than rewritten: one
expression called from both sides of a face, so F^E(i) IS F^W(i+1) by
construction. That is what lets each face be stored once, and it is why the
left ghost column and the bottom ghost row carry the two boundary faces their
interior neighbours cannot.

S is stored as a RATE. Weighting an increment by h would put an extra factor
of time in the balance; A6 fails loudly if it ever does.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The Favre display accumulator

§4.1. Per frame, cell-centred, `RGBA32F` ping-pong.

**Files:**
- Modify: `js/shaders.js` — add `FS_ACC`
- Modify: `js/sim.js` — buffers, `avgStepField`, `avgField`
- Modify: `js/main.js` — call it from `tickFrame`; `APP.avg`
- Modify: `exercises/_runner/smoke.js` — extend `SUITES.avg`

**Interfaces:**
- Consumes: Task 5's `avgStart`/`avgStop`/`S.avg`.
- Produces:
  - `SIM.avgStepField(dt)` — one accumulation, called once per frame before `S.avg.t` advances.
  - `SIM.avgField()` → `{fbar, pbar, ubar, wbar}` — four `Float32Array(nx*ny)`, already normalised (`û = ⟨f u_c⟩/f̄`).

- [ ] **Step 1: Write the failing test**

Extend `SUITES.avg` in `exercises/_runner/smoke.js`:

```js
  const g = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(180);
    const A = APP.SIM.avgField();
    const S = APP.sim, nx = S.nx, ny = S.ny;
    let wet = 0, finite = true, fmax = 0;
    for (let k = 0; k < nx*ny; k++) {
      if (!Number.isFinite(A.fbar[k]) || !Number.isFinite(A.ubar[k])) { finite = false; break; }
      if (A.fbar[k] > 0.5) wet++;
      if (A.fbar[k] > fmax) fmax = A.fbar[k];
    }
    return { keys: Object.keys(A).sort(), wet, finite, fmax, n: nx*ny };
  })()`);
  ok("avgField returns the four mean-state arrays",
     g.keys.join(",") === "fbar,pbar,ubar,wbar", g.keys.join(","));
  ok("avgField is finite everywhere", g.finite);
  ok("avgField finds the water", g.wet > 0.05 * g.n, `wet ${g.wet}/${g.n}`);
  ok("mean fill is a fill (slot storage excepted)", g.fmax < 1.5, `fmax ${g.fmax}`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: FAIL — `APP.SIM.avgField is not a function`.

- [ ] **Step 3a: The shader**

Add to `js/shaders.js` before `RAMPS`:

```js
  // ------------------------------------------------ averaging: Favre field
  /** One running weighted-mean update of (f u_c, f w_c, f, P).
   *
   *  Collocation is the trap here: u lives on the west face and w on the
   *  south face, so both are averaged to the CENTRE before being weighted by
   *  f — exactly as FS_COL does it. Weighting f by the west-face velocity
   *  alone puts a directional bias in every mean.
   *
   *  The weight is h/(T+h) with T held on the CPU, so this is the same
   *  formula as RECON.accumStep and is tested there. */
  const FS_ACC = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_A, u_U, u_F;
uniform vec2  u_res;
uniform float u_T, u_dt;

ivec2 CL(ivec2 c){ return clamp(c, ivec2(0), ivec2(u_res) - ivec2(1)); }

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(u_A, c, 0);
  vec4 U = texelFetch(u_U, c, 0);
  float f  = texelFetch(u_F, c, 0).r;
  float uc = 0.5 * (U.r + texelFetch(u_U, CL(c + ivec2(1,0)), 0).r);
  float wc = 0.5 * (U.g + texelFetch(u_U, CL(c + ivec2(0,1)), 0).g);
  vec4 phi = vec4(f * uc, f * wc, f, U.b);
  float k = u_dt / max(u_T + u_dt, 1e-9);
  o = A + k * (phi - A);
}`;
```

Export `FS_ACC`.

- [ ] **Step 3b: `sim.js`**

Add `prog.acc = GLH.createProgram(gl, Shaders.VS_QUAD, Shaders.FS_ACC);` in `init`.

In `avgStart`, add the field buffer: `const Fld = GLH.createDoubleBuffer(gl, S.nx, S.ny, F, RGBA, FL, null);` and store it as `S.avg.fld`; dispose it in `release`.

```js
  /** One frame's accumulation of the display field. Called BEFORE `S.avg.t`
   *  is advanced, because the running-mean weight needs the window as it was. */
  function avgStepField(dtSim) {
    if (!S.avg || !(dtSim > 0)) return;
    gl.useProgram(prog.acc);
    GLH.bindTex(gl, prog.acc, [["u_A", S.avg.fld.read.tex],
                               ["u_U", S.U.read.tex], ["u_F", S.F.read.tex]]);
    gl.uniform2f(prog.acc.u("u_res"), S.nx, S.ny);
    gl.uniform1f(prog.acc.u("u_T"), S.avg.tf);
    gl.uniform1f(prog.acc.u("u_dt"), dtSim);
    GLH.bindTarget(gl, S.avg.fld.write.fbo, S.nx, S.ny);
    quad.draw();
    S.avg.fld.swap();
    S.avg.tf += dtSim;
  }

  /** The mean state, normalised. `ubar`/`wbar` are FAVRE velocities. */
  function avgField() {
    const n = S.nx * S.ny, buf = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.fld.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, buf);
    const fbar = new Float32Array(n), pbar = new Float32Array(n);
    const ubar = new Float32Array(n), wbar = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const f = buf[k * 4 + 2];
      fbar[k] = f; pbar[k] = buf[k * 4 + 3];
      const d = Math.max(f, 1e-6);
      ubar[k] = buf[k * 4] / d; wbar[k] = buf[k * 4 + 1] / d;
    }
    return { fbar, pbar, ubar, wbar };
  }
```

Initialise `tf: 0` alongside `t: 0` in `avgStart`. Export both functions.

- [ ] **Step 3c: `main.js`**

In `tickFrame`, immediately after `const col = SIM.columns();`:

```js
  // Averaging samples the frame the solver just advanced, weighted by the
  // simulated time it advanced — not by the frame, which is not a unit of
  // anything physical. See docs/averaging.md §4.4.
  SIM.avgStepField(simAdvanced);
```

Add to the `APP` object: `avg: { start: SIM.avgStart, stop: SIM.avgStop, field: SIM.avgField, T: SIM.avgT }`.

- [ ] **Step 4: Run the tests**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: PASS — 8 assertions.

- [ ] **Step 5: Commit**

```bash
git add js/shaders.js js/sim.js js/main.js exercises/_runner/smoke.js
git commit -m "The Favre display field: f-weighted, and collocated at the centre

f is the density in the heavy-fluid limit, so the mean that leaves the
equations looking like themselves is the density-weighted one — and it does
continuously what a wet-cell threshold does with a step, without putting a
discontinuity through the middle of the excursion band.

u lives on the west face and w on the south face, so both are averaged to the
cell centre before being weighted, exactly as FS_COL does it. Weighting by the
west face alone would have put a directional bias in every mean.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The column accumulator

§4.3, the authoritative readings. `nx × 1`, with weighted Welford for `η`.

**Files:**
- Modify: `js/shaders.js` — add `FS_ACOL`
- Modify: `js/sim.js` — buffer, `avgStepColumns`, `avgColumns`
- Modify: `js/main.js` — call it in `tickFrame`
- Modify: `exercises/_runner/smoke.js` — extend `SUITES.avg`

**Interfaces:**
- Consumes: Tasks 5–6.
- Produces:
  - `SIM.avgStepColumns(dt)` — one accumulation from the live column texture.
  - `SIM.avgColumns()` → `{C, sigma}` — `C` is a `Float32Array(nx*4)` laid out **exactly** as `SIM.columns()` returns (`bed, d, q, top`) so `OVERLAY.analyse` can take it unchanged; `sigma` is `Float32Array(nx)`.

- [ ] **Step 1: Write the failing test**

Extend `SUITES.avg`:

```js
  const cc = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(300);
    const { C, sigma } = APP.SIM.avgColumns();
    const live = APP.SIM.columns(true);
    const S = APP.sim, nx = S.nx;
    let dOK = 0, bedOK = 0, sigOK = 0;
    for (let i = 0; i < nx; i++) {
      if (C[i*4+1] >= 0 && Number.isFinite(C[i*4+1])) dOK++;
      if (Math.abs(C[i*4] - live[i*4]) < S.dx * 2) bedOK++;   // bed is static
      if (sigma[i] >= 0 && Number.isFinite(sigma[i])) sigOK++;
    }
    return { nx, len: C.length, dOK, bedOK, sigOK };
  })()`);
  ok("avgColumns is laid out like SIM.columns", cc.len === cc.nx * 4);
  ok("mean depth is finite and non-negative in every column", cc.dOK === cc.nx);
  ok("the bed does not move within a window", cc.bedOK === cc.nx);
  ok("sigma_eta is finite everywhere", cc.sigOK === cc.nx);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: FAIL — `APP.SIM.avgColumns is not a function`.

- [ ] **Step 3a: The shader**

Add to `js/shaders.js`:

```js
  // ---------------------------------------------- averaging: column readings
  /** Running means of FS_COL's own output, plus a weighted Welford moment for
   *  the surface. Connectivity is decided per frame on the SHARP field, where
   *  it is well posed; only the resulting scalars are averaged. Deciding it on
   *  the mean fill instead would let a nappe that touches a pool 30% of the
   *  time report a connected column that existed at no instant.
   *
   *  Welford rather than <eta^2> - <eta>^2: for a 5 mm wobble on a 1 m datum
   *  that subtraction keeps about two digits in float32. */
  const FS_ACOL = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_A, u_C;
uniform float u_T, u_dt;

void main(){
  ivec2 c = ivec2(int(gl_FragCoord.x), 0);
  vec4 A = texelFetch(u_A, c, 0);        // (dbar, qbar, etabar, M2)
  vec4 C = texelFetch(u_C, c, 0);        // (bed, d, q, top)
  float k = u_dt / max(u_T + u_dt, 1e-9);
  float dN = A.x + k * (C.y - A.x);
  float qN = A.y + k * (C.z - A.y);
  float eO = A.z;
  float eN = eO + k * (C.w - eO);
  o = vec4(dN, qN, eN, A.w + u_dt * (C.w - eO) * (C.w - eN));
}`;
```

Export `FS_ACOL`; add `prog.acol` in `init`.

- [ ] **Step 3b: `sim.js`**

In `avgStart`, add `const Col = GLH.createDoubleBuffer(gl, S.nx, 1, F, RGBA, FL, null);` as `S.avg.col`, and `tc: 0`. Dispose in `release`.

```js
  function avgStepColumns(dtSim) {
    if (!S.avg || !(dtSim > 0)) return;
    gl.useProgram(prog.acol);
    GLH.bindTex(gl, prog.acol, [["u_A", S.avg.col.read.tex], ["u_C", S.colTex]]);
    gl.uniform1f(prog.acol.u("u_T"), S.avg.tc);
    gl.uniform1f(prog.acol.u("u_dt"), dtSim);
    GLH.bindTarget(gl, S.avg.col.write.fbo, S.nx, 1);
    quad.draw();
    S.avg.col.swap();
    S.avg.tc += dtSim;
  }

  /** The mean columns, in SIM.columns' own layout so OVERLAY.analyse takes
   *  them unchanged: (bed, d, q, surface). The bed is static within a window,
   *  so it is copied from the live buffer rather than averaged. */
  function avgColumns() {
    const buf = new Float32Array(S.nx * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.avg.col.read.fbo);
    gl.readPixels(0, 0, S.nx, 1, gl.RGBA, gl.FLOAT, buf);
    const live = columns();
    const C = new Float32Array(S.nx * 4), sigma = new Float32Array(S.nx);
    for (let i = 0; i < S.nx; i++) {
      C[i * 4]     = live[i * 4];              // bed
      C[i * 4 + 1] = buf[i * 4];               // d̄
      C[i * 4 + 2] = buf[i * 4 + 1];           // q̄
      C[i * 4 + 3] = buf[i * 4 + 2];           // η̄
      sigma[i] = RECON.sigma(buf[i * 4 + 3], S.avg.tc);
    }
    return { C, sigma };
  }
```

Export both.

- [ ] **Step 3c: `main.js`**

Below the `avgStepField` call in `tickFrame`:

```js
  SIM.avgStepColumns(simAdvanced);
```

- [ ] **Step 4: Run the tests**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: PASS — 12 assertions.

- [ ] **Step 5: Commit**

```bash
git add js/shaders.js js/sim.js js/main.js exercises/_runner/smoke.js
git commit -m "Column readings: average the numbers, not the connectivity

A nappe that touches a pool for any fraction of the window leaves mean fill
all the way between them, so a connectivity test on the mean field reports one
body where there was never one. FS_COL already resolves nappes, spray, soffits
and perched pools on sharp data every frame — so its OUTPUT is what is
averaged, and every connectivity decision is made where it is well posed.

The buffer is laid out exactly as SIM.columns returns, so the overlay can take
it unchanged. Welford for the surface moment, because subtracting <eta>^2 from
<eta^2> for a 5 mm wobble on a 1 m datum keeps about two digits in float32.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The channel overlay reads the mean columns

Group H. While Average is up, `d`, `d_c`, `d_n`, `V`, `Fr`, the EGL, the
profile class and the jump boxes all come from `C̄` — and the overlay's own
prefilters are bypassed, because averaging an already-averaged field twice
would broaden every jump.

**Files:**
- Modify: `js/overlay.js:76` and `:144-156` — the `averaged` path
- Modify: `js/main.js` — pass the mean columns and the option; reset on transitions
- Modify: `exercises/_runner/smoke.js` — group H

**Interfaces:**
- Consumes: Task 7's `SIM.avgColumns`.
- Produces: `OVERLAY.analyse(sim, col, opts)` — `opts.averaged === true` skips `sm()`, `_hA`, `_qA` and the `_ynK` EMA.

- [ ] **Step 1: Write the failing test**

Add to `SUITES.avg`:

```js
  // H2: with an averaged column buffer, analyse must not filter again. Feeding
  // the same C twice in different orders must give identical output.
  const h = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(240);
    const { C } = APP.SIM.avgColumns();
    OVERLAY.resetEstimates(APP.sim);
    const A1 = OVERLAY.analyse(APP.sim, C, { averaged: true });
    const d1 = Array.from(A1.d);
    // A second call with no reset: a temporal EMA would move the answer.
    const A2 = OVERLAY.analyse(APP.sim, C, { averaged: true });
    let same = true;
    for (let i = 0; i < d1.length; i++) if (Math.abs(d1[i] - A2.d[i]) > 1e-9) { same = false; break; }
    // And the live path must still filter, or the bypass is doing nothing.
    OVERLAY.resetEstimates(APP.sim);
    const L1 = OVERLAY.analyse(APP.sim, C);
    const L2 = OVERLAY.analyse(APP.sim, C);
    let moved = false;
    for (let i = 0; i < L1.d.length; i++) if (Math.abs(L1.d[i] - L2.d[i]) > 1e-9) { moved = true; break; }
    return { same, moved, n: d1.length };
  })()`);
  ok("H2 averaged analyse is idempotent — no second filter", h.same);
  ok("H2 the live path still filters, so the bypass is real", h.moved);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: FAIL — `H2 averaged analyse is idempotent` (the EMA still runs).

- [ ] **Step 3: Write minimal implementation**

In `js/overlay.js`, change the signature at line 76 to
`function analyse(sim, col, opts) {` and add below it:

```js
    // Average mode hands in mean columns. They have already been averaged over
    // the window, so the prefilters below must NOT run: sm() would smooth in
    // space and _hA/_qA/_ynK would smooth in time a second time, which shows
    // up as a jump broadened by the filter rather than by the flow.
    const AVG = !!(opts && opts.averaged);
```

Replace the prefilter block (currently `const dS = sm(1), qS = sm(2);` and the
`_hA`/`_qA` loop) with:

```js
    let dS, qS;
    if (AVG) {
      dS = new Float32Array(nx); qS = new Float32Array(nx);
      for (let i = 0; i < nx; i++) { dS[i] = col[i * 4 + 1]; qS[i] = col[i * 4 + 2]; }
    } else {
      dS = sm(1); qS = sm(2);
      if (!S._hA || S._hA.length !== nx) { S._hA = new Float32Array(dS); S._qA = new Float32Array(qS); }
      for (let i = 0; i < nx; i++) {
        S._hA[i] += 0.10 * (dS[i] - S._hA[i]);
        S._qA[i] += 0.10 * (qS[i] - S._qA[i]);
        dS[i] = S._hA[i]; qS[i] = S._qA[i];
      }
    }
```

At the `_ynK` EMA (line 213), guard it:

```js
      if (AVG) { S._ynK = k; }                    // no second time-average
      else S._ynK = isFinite(S._ynK) ? S._ynK + EMA * (k - S._ynK) : k;
```

In `js/main.js`'s `tickFrame`, replace the analyse call:

```js
  // Average mode must describe ONE window: the field, the overlay and every
  // number derived from it. Mixing a mean field with live markers would put
  // two flow states in one screenshot.
  const avgCols = state.avg && SIM.avgActive() ? SIM.avgColumns() : null;
  const analysis = avgCols
    ? OVERLAY.analyse(sim, avgCols.C, { averaged: true })
    : OVERLAY.analyse(sim, col);
```

Add `avg: false` to `state`, and wherever Average is toggled (Task 9) call
`OVERLAY.resetEstimates(sim)` on **both** transitions.

- [ ] **Step 4: Run the tests**

Run: `node exercises/_runner/smoke.js --only=avg`
Expected: PASS — 14 assertions.

Run: `node exercises/_runner/smoke.js`
Expected: no new failures. `PHYSICS discharge holds one value along the reach`
is a pre-existing intermittent failure ([#46](https://github.com/barneydobson/hydraulician/issues/46)) — verify it fails identically on `main` before blaming this branch.

- [ ] **Step 5: Commit**

```bash
git add js/overlay.js js/main.js exercises/_runner/smoke.js
git commit -m "The overlay follows the averaging window, and is not filtered twice

Average is a measurement mode, not a blur: while it is up, the field and every
number derived from the channel overlay must describe the same window, or one
screenshot carries two flow states.

analyse() already smooths — sm() in space, _hA/_qA in time, an EMA on the
global d_n. Handing it mean columns and letting those run would average an
average, which reads on screen as a jump broadened by the filter rather than
by the flow. The averaged path bypasses all four; H2 pins it by checking the
averaged call is idempotent while the live call still moves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The display path and the Live/Average toggle

**Do not start until Tasks 1–8 are green, and check which branch you are on.**
This is the one task that collides with PR #47: it rewrites the `FS_DISP`
colouring branches, which #47 also changes in 23 lines.

- **If #47 has merged:** the branches read `u_lo`/`u_hi`, there are seven
  fields including energy head, and the toggle belongs in the **VIEW** family
  of `TOOLBAR` beside Particles and Dye, with `T`, `f̄`, `δ_a` and the
  residuals reported on the legend card.
- **If it has not:** the branches read `u_vmax`/`u_hmax`, there are six modes
  plus the momentum `else`, and the toggle goes in `main`'s ungrouped
  `TOOLBAR` after `Particles`. Report `T` in the status line; the legend
  readouts wait.

**Files:**
- Modify: `js/shaders.js` — `FS_DISP` reads the accumulator when `u_avg > 0.5`
- Modify: `js/sim.js` — pass the accumulator textures and `u_avg` through `render`
- Modify: `js/main.js` — `TOOLBAR` entry, the `A` key, `state.avg`, reset wiring
- Modify: `test/ui-smoke.mjs` — the toggle exists, is labelled, and survives compaction

**Interfaces:**
- Consumes: Tasks 5–8.
- Produces: `state.avg` (boolean), `APP.avg.toggle()`.

- [ ] **Step 1: Write the failing test**

In `test/ui-smoke.mjs`, in the strip section:

```js
  // The averaging toggle is a VIEW control: it changes how the water is drawn
  // and nothing about what is measured.
  ok("strip carries an Average toggle",
     btns.some((b) => /average/i.test(b.label)), btns.map((b) => b.label).join(","));
  ok("the Average toggle has an aria-label",
     btns.filter((b) => /average/i.test(b.label)).every((b) => b.aria));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — `strip carries an Average toggle`.

- [ ] **Step 3a: The shader**

In `FS_DISP`, add uniforms and swap the sampled state:

```glsl
uniform sampler2D u_AF;      // the Favre field accumulator
uniform float u_avg;         // 1 = draw the mean state
```

Immediately after `vec4 F = blF(g); vec4 U = blU(g);`:

```glsl
  // Average mode paints the SAME branches from the mean state, so a field is
  // described once. u is the FAVRE mean; the nonlinear fields below are
  // therefore fields OF the mean flow, not means of the field — which is what
  // "from the mean flow" on the legend is telling the reader.
  if (u_avg > 0.5) {
    vec4 A = texelFetch(u_AF, ivec2(clamp(g, vec2(0.0), u_res - vec2(1.0))), 0);
    float fb = A.b;
    F.r = fb;
    U = vec4(A.r / max(fb, 1e-6), A.g / max(fb, 1e-6), A.a, 0.0);
  }
```

Replace the `fs` tent average's `texelFetch(u_F, ...)` reads with a helper that
honours `u_avg`, so the surface line and opacity follow the mean fill too.

- [ ] **Step 3b: `sim.js`**

In `render`, bind the extra texture and set the flag:

```js
  gl.uniform1f(prog.draw.u("u_avg"), opts.avg && S.avg ? 1 : 0);
```

and add `["u_AF", S.avg ? S.avg.fld.read.tex : S.F.read.tex]` to the `bindTex`
list (binding `F` when there is no accumulator keeps the sampler valid).

- [ ] **Step 3c: `main.js`**

Add to `TOOLBAR` (VIEW family if it exists, else after `partBtn`):

```js
    { id: "avgBtn", icon: "average", label: "Average", key: "A",
      hint: "Time-average the flow — the mean field, with the surface band",
      on: () => state.avg,
      act: () => {
        state.avg = !state.avg;
        if (state.avg) SIM.avgStart(); else SIM.avgStop();
        OVERLAY.resetEstimates(sim);   // neither mode inherits the other's EMAs
        syncPanel();
      } },
```

Pass `avg: state.avg` in the `SIM.render` options. Call `SIM.avgReset()` from
`resetWater`, `addSeg`, `undoSeg`, `clearSegs`, `switchScene` and at the end of
spin-up in `tickFrame`.

- [ ] **Step 4: Run the tests**

Run: `node test/ui-smoke.mjs` → PASS
Run: `node exercises/_runner/smoke.js` → no new failures
Run: `node test/recon-test.mjs` → `27 passed, 0 failed`
Run: `python3 exercises/_runner/check_notation.py` and `check_pack.py` → clean

- [ ] **Step 5: Commit**

```bash
git add js/shaders.js js/sim.js js/main.js test/ui-smoke.mjs
git commit -m "Live / Average: the same branches, painted from the mean state

A field is described once, so Average does not add seven new colourings — it
redirects the inputs of the seven that exist. The velocity is the Favre mean,
so the nonlinear fields are fields OF the mean flow rather than means of the
field, which is what \"from the mean flow\" on the card is telling the reader.

Switching modes resets the overlay's temporal estimates in both directions:
neither mode should inherit the other's EMAs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §1 → Task 5 (flux extraction). §2–3 → Tasks 6 (Favre) and 5
(why the transport accumulator is separate). §4.1 → Task 6. §4.2 → Task 5.
§4.3 → Tasks 7–8. §4.4 → Task 1 (the reference) and Tasks 5–7 (the GLSL). §5 →
Task 5 (`transportResidual`, group F). §6 → Task 9. §7.1 → Task 2. §7.2 →
Tasks 3 and 7. §7.3 → Task 4. §8 groups A/G → Task 1; B → 2; D/E → 3; C → 4;
F → 5; H → 8. §9 reset conditions → Task 9. §10 cost → measured in Task 5.

**Two spec items deliberately deferred, and they must not be forgotten:**
- **Group F4** (sponge/source cells: residual closes *with* `⟨S⟩`, and equals
  `⟨S⟩` when `S` is zeroed) is not yet a step. Add it to Task 5 if the
  implementer has appetite, or file it as follow-up — `transportResidual`
  already skips source cells, so the machinery is there.
- **`δ_a` reaching the screen** — `RECON.aerationGap` exists after Task 4 and
  is tested, but nothing displays it until Task 9's readouts, which depend on
  the legend and therefore on #47.

**Type consistency.** `RECON.geomFill(fbar, pbar, c)`, `RECON.columnDepth(gcol,
j0, j1, dx)`, `RECON.bodies(gcol, solid, ny)`, `RECON.bandLevels(gcol, j0, j1,
dx)`, `RECON.sigma(M2, T)` are used with those exact signatures in Tasks 2–4
and 7. `SIM.avgColumns()` returns `{C, sigma}` in Task 7 and is destructured
that way in Task 8. `OVERLAY.analyse(sim, col, opts)` gains its third argument
in Task 8 and is called with two arguments everywhere else, which stays valid.

**Gate commands, for every task:**

| Command | When |
|---|---|
| `node test/recon-test.mjs` | Tasks 1–4 |
| `node exercises/_runner/smoke.js --only=avg` | Tasks 5–8 |
| `node exercises/_runner/smoke.js --only=physics,api` | Task 5 — the flux extraction must move no number |
| `node test/ui-smoke.mjs` | Task 9 |
| `python3 exercises/_runner/check_notation.py` | every task |
