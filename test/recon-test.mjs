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

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
