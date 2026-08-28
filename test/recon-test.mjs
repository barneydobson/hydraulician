// Zero-dependency unit tests for js/reconstruct.js — no browser, no GPU.
// The file is a classic script defining the global RECON, so it is loaded
// into a vm context rather than imported.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../js/reconstruct.js", import.meta.url), "utf8");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.RECON = RECON;", ctx);
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

// A6: a source RATE is h-weighted; an INCREMENT is not. Increments 2 and 18
// over h = 1 and 3 are rates 2 and 6, whose h-weighted mean is 5 — which is
// also sum(increments)/T. Weighting the INCREMENTS by h instead gives 14.
{
  let m = 0, T = 0;
  const H = [1, 3], INC = [2, 18];
  for (let n = 0; n < H.length; n++) {
    m = RECON.accumStep(m, INC[n] / H[n], T, H[n]); T += H[n];
  }
  ok("A6 source rate averages to 5, not 14 or 6", near(m, 5, 1e-12), `got ${m}`);
}

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
// D4: a flapping nappe smeared to fbar = 0.2 over 5x its thickness. The
// segmentation threshold drops it — which is the point. The mean THICKNESS
// is the integral over the jet's own region and survives the smear, even
// though the body walk correctly declines to call it a connected body.
{
  const ny = 40, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 20; j < 30; j++) g[j] = 0.2;
  ok("D4 smeared jet keeps its mean thickness",
     near(RECON.columnDepth(g, 20, 29, 0.01), 10 * 0.2 * 0.01, 1e-12));
  ok("D4 sub-threshold fill is not selected as a connected body",
     RECON.bodies(g, solid, ny).length === 0);
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
// ---- Group D continued: masking and the asymmetry -----------------------
// D6: a bridged gap holding sub-threshold fill. FS_COL bridges the gap but
// `continue`s past it without adding to d, so the masked body depth must too.
// The unmasked integral deliberately does credit it — that is the difference
// between the two functions.
{
  const ny = 12, g = new Float64Array(ny), solid = new Uint8Array(ny);
  for (let j = 0; j < 5; j++) g[j] = 1;
  g[5] = 0.1;                                   // bridged, below WET
  for (let j = 6; j < 10; j++) g[j] = 0.6;
  const b = RECON.bodies(g, solid, ny);
  ok("D6 the gap is bridged into one body",
     b.length === 1 && b[0].j0 === 0 && b[0].j1 === 9, JSON.stringify(b));
  ok("D6 bodyDepth masks the sub-threshold cell, as FS_COL does",
     near(RECON.bodyDepth(g, 0, 9, 0.01), (5 * 1 + 4 * 0.6) * 0.01, 1e-12));
  ok("D6 columnDepth deliberately does NOT mask it",
     near(RECON.columnDepth(g, 0, 9, 0.01), (5 * 1 + 0.1 + 4 * 0.6) * 0.01, 1e-12));
}
// D7: at exactly f = WET the shader's walk keeps the body whole (its dry test
// is strict `f < 0.25`). The bed-find is the other way round; that asymmetry
// is the shader's own and is deliberate.
{
  const g = new Float64Array([1, 1, 0.25, 0.25, 0.25, 1, 1]);
  ok("D7 a run at exactly WET does not split the body",
     RECON.bodies(g, new Uint8Array(7), 7).length === 1);
}

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

// The whole-grid entry point, on a deliberately RECTANGULAR grid (nx != ny),
// so an i/j transpose in the row-major index k = j*nx + i shows up as wrong
// columns rather than as no difference at all. The real grids reach nx ~ 3400
// against a few hundred rows, where a transpose would be catastrophic — and
// on a square fixture it would be invisible.
{
  const nx = 5, ny = 3, dx = 0.01, c = 25;
  const fbar = new Float64Array(nx * ny), pbar = new Float64Array(nx * ny);
  const mask = new Uint8Array(nx * ny);
  const at = (i, j) => j * nx + i;
  fbar[at(3, 0)] = 1; fbar[at(3, 1)] = 1; fbar[at(3, 2)] = 0.4;
  fbar[at(1, 0)] = 1;                        // a one-cell body in another column
  fbar[at(0, 0)] = 1; mask[at(0, 0)] = 255;   // WATER in a SOLID cell: the mask must win
  const R = RECON.reconstruct({ fbar, pbar, mask, nx, ny, dx, c });
  ok("C8 reconstruct returns one entry per column",
     R.d2d.length === nx && R.bed.length === nx && R.bodies.length === nx);
  ok("C8 depth lands in the column it was written to, not its transpose",
     near(R.d2d[3], (1 + 1 + 0.4) * dx, 1e-12) && near(R.d2d[1], 1 * dx, 1e-12),
     `d2d ${Array.from(R.d2d).join(",")}`);
  ok("C8 dry columns report zero depth and no NaN",
     R.d2d[2] === 0 && R.d2d[4] === 0 && Array.from(R.d2d).every(Number.isFinite));
  ok("C8 a cell with mask >= 192 is solid even when its fill says water",
     R.bodies[0].length === 0 && R.d2d[0] === 0,
     `bodies0 ${JSON.stringify(R.bodies[0])} d2d0 ${R.d2d[0]}`);
}
// crossing() takes the FIRST crossing walking upward. That is the outer
// surface for the monotone exceedance profile of a sharp interface, and it is
// deliberately NOT the outer envelope of a non-monotone column: spray above a
// gap reports the lower excursion. Pinned so the contract is a decision rather
// than an accident — callers pass a single body's bounds.
{
  const g = new Float64Array([1, 1, 1, 0.8, 0.3, 0.02, 0.5, 0.2, 0.01]);
  const L = RECON.bandLevels(g, 0, g.length - 1, 0.01);
  ok("C9 crossing takes the first threshold crossing, not the outer envelope",
     L.eta95 < 0.06, `eta95 ${L.eta95}`);
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
