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
