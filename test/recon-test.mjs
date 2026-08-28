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

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
