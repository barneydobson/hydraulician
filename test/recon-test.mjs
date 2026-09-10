// Zero-dependency unit tests for js/reconstruct.js — no browser, no GPU.
// The file is a classic script defining the global RECON, so it is loaded
// into a vm context rather than imported.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// RECON_SRC points this suite at a deliberately broken copy of the module —
// that is how test/mutation-test.mjs proves each assertion below can fail.
// Unset, it reads the real module, which is every other invocation.
const src = readFileSync(process.env.RECON_SRC
  || new URL("../js/reconstruct.js", import.meta.url), "utf8");
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
// B5: the compaction only differs from a plain clamp against the DIAGNOSTIC
// pressure. For an EOS-consistent pair the identity min(f,1) = f - P/c^2 IS
// clamp(f, 0, 1) — every pressurised cell lands on 1 either way — so B1-B3
// all pass with the subtraction deleted outright (measured: 41 passed, 0
// failed). U.b carries the bulk-damping term and lags the fill by a substep,
// so it can exceed the bare EOS value; that is the case the subtraction is
// actually for, and the only one that pins it.
{
  const c = 25, f = 1.02, P = c * c * 0.05;   // P above the bare EOS c^2*(f-1)
  ok("B5 compaction subtracts the diagnostic pressure, not just a clamp",
     near(RECON.geomFill(f, P, c), 0.97, 1e-12), `got ${RECON.geomFill(f, P, c)}`);
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
}
// C2 + C5: ONE synthetic surface, TWO independent routes to its width.
//
// eta(t) = eta0 + a sin(wt), sampled over four whole periods. The BAND route
// builds the exceedance profile fbar(z) = Pr(eta > z) by running
// RECON.accumStep on an indicator, then reads its 0.05 / 0.95 level sets. The
// WELFORD route runs RECON.welford / RECON.sigma over the SAME samples. The
// two share the surface and nothing else, which is what makes their ratio a
// cross-check rather than an identity.
//
// The earlier C5 divided the band by the ANALYTIC a/sqrt(2), three lines below
// two assertions that had already pinned eta95 and eta05 to the same analytic
// constants. It was implied by them and could not fail on its own; breaking
// the Welford update left it green. It now goes red with it (measured below).
{
  const eta0 = 1.0, a = 0.05, dx = 0.0025, ny = 600, N = 4000, PER = 4;
  // dt is deliberately NOT 1: with unit samples an unweighted Welford
  // (M2 += (phi-m0)(phi-m1), no dt) is numerically identical to the
  // weighted one, so the assertion below could not see the difference.
  // At dt = 0.01 it is 100x wrong in M2 and 10x wrong in sigma.
  const dt = 0.01;
  const g = new Float64Array(ny);
  let mean = 0, M2 = 0, T = 0;
  for (let n = 0; n < N; n++) {
    const eta = eta0 + a * Math.sin(2 * Math.PI * PER * n / N);
    for (let j = 0; j < ny; j++) {
      g[j] = RECON.accumStep(g[j], eta > (j + 0.5) * dx ? 1 : 0, T, dt);
    }
    const m1 = RECON.accumStep(mean, eta, T, dt);
    M2 = RECON.welford(M2, mean, m1, eta, dt);
    mean = m1; T += dt;
  }
  const sig = RECON.sigma(M2, T);
  const b = RECON.bodies(g, new Uint8Array(ny), ny)[0];
  const L = RECON.bandLevels(g, b.j0, ny - 1, dx);
  // C2: the Welford route alone. Exact for a whole number of periods.
  ok("C2 Welford sigma over the sampled surface is a/sqrt(2)",
     near(sig, a / Math.SQRT2, a * 1e-6), `got ${sig}`);
  // C5: band against Welford. 2.7936 for a sinusoid, 3.2897 for a Gaussian —
  // the two routes land at 2.7995 here, 0.006 from the sinusoid and 0.49 from
  // the Gaussian, so the tolerance separates them by 80x.
  ok("C5 the band and Welford routes agree at the sinusoid's 2.7936, not 3.2897",
     near((L.eta95 - L.eta05) / sig, 2.7936, 0.02),
     `got ${(L.eta95 - L.eta05) / sig} with sigma ${sig}`);
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
  const nx = 5, ny = 5, dx = 0.01, c = 25;
  const fbar = new Float64Array(nx * ny), pbar = new Float64Array(nx * ny);
  const mask = new Uint8Array(nx * ny);
  const at = (i, j) => j * nx + i;
  // j=2 is BELOW WET but bridged (one dry cell, DRY_BREAK = 3), so it is
  // inside the body while contributing no depth. That is what separates
  // bodyDepth from columnDepth — without it, swapping one for the other
  // in reconstruct() passes the whole suite (measured: 42 passed).
  fbar[at(3, 0)] = 1; fbar[at(3, 1)] = 1;
  fbar[at(3, 2)] = 0.1; fbar[at(3, 3)] = 0.6;
  fbar[at(1, 0)] = 1;                        // a one-cell body in another column
  fbar[at(0, 0)] = 1; mask[at(0, 0)] = 255;   // WATER in a SOLID cell: the mask must win
  const R = RECON.reconstruct({ fbar, pbar, mask, nx, ny, dx, c });
  ok("C8 reconstruct returns one entry per column",
     R.d2d.length === nx && R.bed.length === nx && R.bodies.length === nx);
  ok("C8 depth lands in the column it was written to, not its transpose",
     near(R.d2d[3], (1 + 1 + 0.6) * dx, 1e-12) && near(R.d2d[1], 1 * dx, 1e-12),
     `d2d ${Array.from(R.d2d).join(",")}`);
  ok("C8 dry columns report zero depth and no NaN",
     R.d2d[2] === 0 && R.d2d[4] === 0 && Array.from(R.d2d).every(Number.isFinite));
  ok("C8 a cell with mask >= 192 is solid even when its fill says water",
     R.bodies[0].length === 0 && R.d2d[0] === 0,
     `bodies0 ${JSON.stringify(R.bodies[0])} d2d0 ${R.d2d[0]}`);
  // d2d exists to cross-check the GPU's own column reduction, which `continue`s
  // past sub-threshold cells without accumulating depth. Built from the
  // unmasked integral it would disagree with FS_COL by construction — measuring
  // the shader's bridging rather than checking against it (ruling R8).
  ok("C8 d2d masks bridged sub-threshold cells, as FS_COL does",
     near(R.d2d[3], (1 + 1 + 0.6) * dx, 1e-12) &&
     !near(R.d2d[3], (1 + 1 + 0.1 + 0.6) * dx, 1e-12),
     `d2d[3] ${R.d2d[3]}`);
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

// E4: the g = 0 scene. Its EOS is two-sided, so P_diag can be negative and
// geomFill's clamp(g,0,1) would absorb it silently -- a plausible fill where
// the answer is "not defined". docs/averaging.md §7.1 excludes the scene by
// construction; the refusal is how that exclusion is enforced at the only
// entry point, and it must be a THROW rather than a quiet zero.
{
  const nx = 3, ny = 3, dx = 0.01, c = 25;
  const fbar = new Float64Array(nx * ny).fill(0.8);
  const pbar = new Float64Array(nx * ny).fill(-100);   // two-sided: p < 0
  const mask = new Uint8Array(nx * ny);
  let threw = false, why = "";
  try { RECON.reconstruct({ fbar, pbar, mask, nx, ny, dx, c, g: 0 }); }
  catch (e) { threw = true; why = e.message; }
  ok("E4 reconstruct refuses g = 0", threw, "it returned a result instead");
  ok("E4 the refusal says why", /two-sided|free surface/.test(why), why);
  // and it must NOT refuse the scenes it is for.
  let ran = true;
  try { RECON.reconstruct({ fbar, pbar, mask, nx, ny, dx, c, g: 9.81 }); }
  catch (e) { ran = false; why = e.message; }
  ok("E4 reconstruct still runs under gravity", ran, why);
}

// ---- Group H: the specific-energy inlet ---------------------------------
// A reservoir level is an ENERGY grade line, so the depth it delivers solves
// E = d + q^2/(2 g d^2). The old inlet pinned the SURFACE at the level and
// added the velocity head on top, which manufactures head: measured on s2 at
// the shipped q = 1.2, the inlet energy line stood 0.264 m above the 2.07 m
// reservoir it was supposed to come from.

// H1: the returned depth actually solves the specific-energy equation. This is
// the whole contract — everything else is which root and what happens when
// there is none.
{
  const g = 9.81, q = 0.5, E = 0.9;
  const r = RECON.inletDepth(E, q, g, "sub");
  const res = r.d + q * q / (2 * g * r.d * r.d) - E;
  ok("H1 subcritical root solves E = d + q^2/2gd^2", near(res, 0, 1e-10),
     `d ${r.d}, residual ${res}`);
}

// H2: both roots exist and they straddle critical depth. Picking the wrong one
// silently turns a mild reach supercritical at the inlet.
{
  const g = 9.81, q = 0.5, E = 0.9;
  const dc = Math.cbrt(q * q / g);
  const sub = RECON.inletDepth(E, q, g, "sub");
  const sup = RECON.inletDepth(E, q, g, "super");
  const rSup = sup.d + q * q / (2 * g * sup.d * sup.d) - E;
  ok("H2 supercritical root also solves it", near(rSup, 0, 1e-10), `residual ${rSup}`);
  ok("H2 the roots straddle d_c", sub.d > dc && sup.d < dc,
     `sub ${sub.d}, dc ${dc}, super ${sup.d}`);
}

// H3: the point of the whole change. At a FIXED reservoir level the delivered
// depth must FALL as q rises. The old boundary held it constant: measured on
// s2, the inlet surface moved 32 mm across a 3x change in discharge.
{
  const g = 9.81, E = 0.9;
  const ds = [0.1, 0.3, 0.5, 0.7].map((q) => RECON.inletDepth(E, q, g, "sub").d);
  let falling = true;
  for (let i = 1; i < ds.length; i++) if (!(ds[i] < ds[i - 1])) falling = false;
  ok("H3 the delivered depth falls as q rises", falling, ds.join(", "));
}

// H4: q = 0 is still water — the level IS the surface, and no root solve
// should wander off it.
{
  const r = RECON.inletDepth(0.9, 0, 9.81, "sub");
  ok("H4 q = 0 delivers the level itself", near(r.d, 0.9, 1e-12), `got ${r.d}`);
  ok("H4 and is not choked", r.choked === false, `choked ${r.choked}`);
}

// H5: a reservoir cannot pass more than its head allows. E < E_min = 1.5 d_c
// has NO root, and the honest answer is critical depth plus a flag — not a
// NaN, and not a silently-invented deeper section. s2 ships q = 1.2 against
// E = 0.526 m, where q_max is 0.651: the scene demands 1.8x what the
// reservoir can pass.
{
  const g = 9.81, q = 1.2, E = 0.526;
  const dc = Math.cbrt(q * q / g);
  const r = RECON.inletDepth(E, q, g, "sub");
  ok("H5 an over-drawn reservoir reports choked", r.choked === true, `choked ${r.choked}`);
  ok("H5 and falls back to critical depth", near(r.d, dc, 1e-12), `d ${r.d}, dc ${dc}`);
  ok("H5 and reports the E_min it needed", near(r.Emin, 1.5 * dc, 1e-12), `Emin ${r.Emin}`);
  ok("H5 and the capacity it actually has", near(r.qmax, Math.sqrt(g * Math.pow(2 * E / 3, 3)), 1e-12),
     `qmax ${r.qmax}`);
}

// H6: exactly at critical the two roots coincide, and the solve must not fall
// off the end of its bracket there.
{
  const g = 9.81, q = 0.5, dc = Math.cbrt(q * q / g), E = 1.5 * dc;
  const sub = RECON.inletDepth(E, q, g, "sub");
  ok("H6 at E = 1.5 d_c the root IS d_c", near(sub.d, dc, 1e-6), `d ${sub.d}, dc ${dc}`);
  ok("H6 and it is not reported choked", sub.choked === false, `choked ${sub.choked}`);
}

// H7: the choke test is E < 1.5 d_c, not E < d_c. Between those two a
// reservoir is deep enough to hold the water but not to accelerate it, and
// reporting a depth there is the failure that puts more through the inlet than
// the head can drive.
{
  const g = 9.81, q = 0.5, dc = Math.cbrt(q * q / g);
  const r = RECON.inletDepth(0.5 * (dc + 1.5 * dc), q, g, "sub");
  ok("H7 E between d_c and 1.5 d_c is choked", r.choked === true,
     `dc ${dc}, Emin ${r.Emin}, choked ${r.choked}`);
}

// ---- Group K: the energy line's velocity head ----------------------------
// The overlay drew surf + V^2/2g with V = q/d, so alpha was 1 by construction
// and w was not in it at all. Measured on m2 off the Favre mean, alpha runs
// 1.44 at x = 3 down to 1.21 at x = 13.3 — and because it VARIES, the drawn
// line sags where alpha falls. That sag is a free outfall's apparent energy
// loss, and it is not real.

// K1: a uniform profile has alpha = 1. If this ever fails the convention has
// drifted, because it is the one case where the old and new lines must agree.
{
  const n = 8, dx = 0.05, g = 9.81, U = 2;
  const f = new Float64Array(n).fill(1), u = new Float64Array(n).fill(U);
  const w = new Float64Array(n);
  const r = RECON.columnEnergy(f, u, w, dx, g);
  ok("K1 uniform profile has alpha = 1", near(r.alpha, 1, 1e-12), `alpha ${r.alpha}`);
  ok("K1 and the velocity head is U^2/2g", near(r.hv, U * U / (2 * g), 1e-12), `hv ${r.hv}`);
}

// K2: a two-layer profile, half at u = 1 and half at u = 3. V = 2, and the
// cube mean is (1 + 27)/2 = 14, so alpha = 14/2^3 = 1.75 exactly. Mean
// velocity alone cannot see this — it is the whole error being corrected.
{
  const n = 8, dx = 0.05, g = 9.81;
  const f = new Float64Array(n).fill(1), u = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) u[i] = i < n / 2 ? 1 : 3;
  const r = RECON.columnEnergy(f, u, w, dx, g);
  ok("K2 two-layer profile has alpha = 1.75", near(r.alpha, 1.75, 1e-12), `alpha ${r.alpha}`);
  ok("K2 V is still the mean, 2", near(r.V, 2, 1e-12), `V ${r.V}`);
}

// K3: the vertical velocity carries kinetic energy too. With w = u the speed
// squared doubles, so the head doubles — and at a brink w is most of it.
{
  const n = 6, dx = 0.05, g = 9.81, U = 2;
  const f = new Float64Array(n).fill(1), u = new Float64Array(n).fill(U);
  const w = new Float64Array(n).fill(U);
  const r = RECON.columnEnergy(f, u, w, dx, g);
  ok("K3 w is in the kinetic energy", near(r.alpha, 2, 1e-12), `alpha ${r.alpha}`);
}

// K4: alpha >= 1 always (power means), so the correction can only ever RAISE
// the energy line. A profile that reported alpha < 1 would be drawing energy
// the flow does not have.
{
  const n = 10, dx = 0.05, g = 9.81;
  const f = new Float64Array(n).fill(1), u = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) { u[i] = 0.4 + 1.6 * Math.sqrt((i + 0.5) / n); w[i] = 0.1 * i; }
  const r = RECON.columnEnergy(f, u, w, dx, g);
  ok("K4 alpha is never below 1", r.alpha >= 1, `alpha ${r.alpha}`);
}

// K5: no NaN from a zero mass flux. The grade lines are drawn for every wet
// column and one NaN poisons a whole polyline. STILL WATER is the case that
// bites — d is real, but the flux in the denominator of ke/(g*m) is zero — so
// the depth is asserted too, which is what stops this passing on a function
// that returns zero for everything.
{
  const n = 5, dx = 0.05, g = 9.81;
  const f = new Float64Array(n).fill(1), z = new Float64Array(n);
  const still = RECON.columnEnergy(f, z, z, dx, g);
  ok("K5 still water has a real depth", near(still.d, n * dx, 1e-12), `d ${still.d}`);
  ok("K5 and no velocity head, without dividing by zero",
     still.hv === 0 && Number.isFinite(still.alpha), JSON.stringify(still));
  const dry = RECON.columnEnergy(z, z, z, dx, g);
  ok("K5 a dry column is zero throughout",
     dry.d === 0 && dry.hv === 0 && Number.isFinite(dry.alpha), JSON.stringify(dry));
}

// K6: f is the DENSITY as well as the fill, so a pressurised cell carries mass
// that a clamped fill throws away. The depth is geometric and takes min(f,1);
// the two FLUXES take f raw — the same split FS_COL makes. The velocities have
// to differ between the full and the over-full cells or clamping scales the
// numerator and denominator of hv alike and cancels itself out.
{
  const dx = 0.05, g = 9.81;
  const f = new Float64Array([1, 1, 1.5, 1.5]);
  const u = new Float64Array([1, 1, 3, 3]);
  const w = new Float64Array(4);
  const r = RECON.columnEnergy(f, u, w, dx, g);
  ok("K6 depth is geometric — the slot storage is not extra depth",
     near(r.d, 4 * dx, 1e-12), `d ${r.d}`);
  ok("K6 the mass flux counts the pressurised part",
     near(r.q, (1 + 1 + 4.5 + 4.5) * dx, 1e-12), `q ${r.q}`);
  ok("K6 and so does the kinetic energy flux",
     near(r.hv, ((1 + 1 + 40.5 + 40.5) / 2 * dx) / (g * r.q), 1e-12), `hv ${r.hv}`);
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
