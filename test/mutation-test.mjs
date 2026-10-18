// Mutation gate for js/reconstruct.js — proof that test/recon-test.mjs can fail.
//
// Eleven assertions written during the averaging work passed while asserting
// nothing: a constant fed where a varying value was needed, a cell marked
// solid with no water in it, a Number.isFinite check that survived a broken
// variance, a bed compared against the very buffer it was copied from. Every
// one was caught the same way — break the code, watch the suite stay green —
// and none by reading. This file is that practice, mechanised.
//
// Each entry patches ONE known bug into the module and requires the suite to
// fail, AND to fail on the named assertions. That second half is the point: a
// mutation that turns the suite red for some unrelated reason teaches nothing
// about the guard it was aimed at.
//
// Every mutation below is a bug that actually happened during the work, or one
// a review argued about. Cost is ~0.5 s each, so the whole gate is seconds.
//
// Two catalogues: RECON (js/reconstruct.js against test/recon-test.mjs) and
// GEOM (js/geom.js against test/geom-test.mjs). Each suite is first run
// UNMUTATED — a suite that is already red would "kill" every mutant for free.
// A `kills` entry is the FULL name on a `FAIL <name>` line, never any other
// text in the output (a name quoted in a failure's detail would also match,
// and a short prefix such as "A2" would also match "A20").

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = fileURLToPath(new URL("../js/reconstruct.js", import.meta.url));
const SUITE = fileURLToPath(new URL("./recon-test.mjs", import.meta.url));
const GEOM_FILE = fileURLToPath(new URL("../js/geom.js", import.meta.url));
const GEOM_SUITE = fileURLToPath(new URL("./geom-test.mjs", import.meta.url));
/** Read with the line endings NORMALISED to LF: each CRLF becomes LF.
 *
 *  The catalogue below is written with `\n`. A source file with CRLF endings
 *  (a Windows checkout) would not match the one multi-line pattern
 *  (`band-inverted`), so that mutant went STALE and test C4 stopped being
 *  proven killable on the platform this repo is developed on. The gate did
 *  fail loudly, but it blamed a refactor that had not happened.
 *
 *  Folding here rather than in each pattern keeps the catalogue readable: a
 *  `find` is written the way the source reads, once. The mutated copy is
 *  written back with LF endings too; the suite only parses it, so that does
 *  not matter. */
const source = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const geomSource = readFileSync(GEOM_FILE, "utf8").replace(/\r\n/g, "\n");

/** `find` → `replace` on js/reconstruct.js. `kills` are the full
 *  assertion names that MUST appear among the failures — naming them is what
 *  turns "the suite noticed something" into "this guard works". */
const MUTANTS = [
  { id: "accum-ignores-history",
    why: "the running mean returns the sample and discards the window",
    find: "return mean + k * (phi - mean);",
    replace: "return phi;",
    kills: ["A2 dt-weighted mean is 3, not 2", "A6 source rate averages to 5, not 14 or 6"] },

  { id: "accum-fixed-weight",
    why: "a constant weight instead of dt/(T+dt) — the frame-count average A2 exists for",
    find: "const k = dt / Math.max(T + dt, 1e-30);",
    replace: "const k = 0.5;",
    kills: ["A2 dt-weighted mean is 3, not 2", "A6 source rate averages to 5, not 14 or 6"] },

  { id: "welford-drops-dt",
    why: "the second moment stops being time-weighted. G1 uses dt = 1 throughout so it CANNOT see this; C2 and C5 use dt = 0.01 and can",
    find: "return M2 + dt * (phi - meanOld) * (phi - meanNew);",
    replace: "return M2 + (phi - meanOld) * (phi - meanNew);",
    kills: ["C2 Welford sigma over the sampled surface is a/sqrt(2)", "C5 the band and Welford routes agree at the sinusoid's 2.7936, not 3.2897"] },

  { id: "sigma-drops-window",
    why: "variance not divided by the window — the raw-sums bug Welford was chosen to avoid",
    find: "return T > 0 ? Math.sqrt(Math.max(0, M2 / T)) : 0;",
    replace: "return T > 0 ? Math.sqrt(Math.max(0, M2)) : 0;",
    kills: ["G1 Welford sigma to 3 digits", "C2 Welford sigma over the sampled surface is a/sqrt(2)"] },

  { id: "geomfill-no-compaction",
    why: "the slot-storage subtraction deleted — 7.9 mm on 1 m at c = 25, 77 mm at c = 8. This survived the entire B group until B5 was written for it",
    find: "const g = fbar - pbar / Math.max(c * c, 1e-12);",
    replace: "const g = fbar;",
    kills: ["B5 compaction subtracts the diagnostic pressure, not just a clamp"] },

  { id: "columndepth-exclusive-end",
    why: "the body's last cell dropped from the integral",
    find: "for (let j = j0; j <= j1; j++) d += gcol[j];",
    replace: "for (let j = j0; j < j1; j++) d += gcol[j];",
    // NOT C1: its exceedance profile is already zero at the top cell, so a
    // dropped end changes nothing there. The harness caught that claim.
    kills: ["D1 pool depth excludes the nappe", "D4 smeared jet keeps its mean thickness"] },

  { id: "bodydepth-unmasked",
    why: "bodyDepth stops masking sub-threshold cells, so it no longer matches FS_COL's `continue`",
    find: "for (let j = j0; j <= j1; j++) if (gcol[j] >= WET) d += gcol[j];",
    replace: "for (let j = j0; j <= j1; j++) d += gcol[j];",
    kills: ["D6 bodyDepth masks the sub-threshold cell, as FS_COL does"] },

  { id: "wet-threshold-drift",
    why: "WET diverges from FS_COL's 0.25 — the actual regression an implementer made, to force a broken test green",
    find: "const WET = 0.25;",
    replace: "const WET = 0.15;",
    kills: ["D4 sub-threshold fill is not selected as a connected body"] },

  { id: "dry-break-too-eager",
    why: "one dry cell ends a body, where FS_COL bridges two",
    find: "const DRY_BREAK = 3;",
    replace: "const DRY_BREAK = 1;",
    kills: ["D6 the gap is bridged into one body"] },

  { id: "walk-non-strict",
    why: "the walk's dry test loses its strictness, splitting a body FS_COL keeps whole at exactly WET",
    find: "if (gcol[j] < WET) { if (++dry >= DRY_BREAK) break; continue; }",
    replace: "if (gcol[j] <= WET) { if (++dry >= DRY_BREAK) break; continue; }",
    kills: ["D7 a run at exactly WET does not split the body"] },

  { id: "band-inverted",
    why: "eta05 and eta95 swapped — the upside-down excursion band that does not look wrong",
    find: "return { eta95: crossing(gcol, j0, j1, dx, 0.05),\n             eta05: crossing(gcol, j0, j1, dx, 0.95) };",
    replace: "return { eta95: crossing(gcol, j0, j1, dx, 0.95),\n             eta05: crossing(gcol, j0, j1, dx, 0.05) };",
    // C4 was removed as implied by C3; C3's signed offsets are what notice.
    kills: ["C3 eta95 = eta0 + 0.98769a", "C3 eta05 = eta0 - 0.98769a"] },

  { id: "reconstruct-transposed",
    why: "row-major index transposed — invisible on a square grid, catastrophic on the real 3400-column ones",
    find: "const k = j * nx + i;",
    replace: "const k = i * ny + j;",
    kills: ["C8 depth lands in the column it was written to, not its transpose"] },

  { id: "reconstruct-ignores-solid",
    why: "the solid mask stops being honoured, so a wall holds water",
    find: "solid[j] = mask[k] >= 192 ? 1 : 0;",
    replace: "solid[j] = 0;",
    kills: ["C8 a cell with mask >= 192 is solid even when its fill says water"] },

  { id: "reconstruct-unmasked-depth",
    why: "d2d built from the unmasked integral, so the 2D/1D cross-check would measure its own bug rather than check against it",
    find: "d2d[i] = b.length ? bodyDepth(gcol, b[0].j0, b[0].j1, dx) : 0;",
    replace: "d2d[i] = b.length ? columnDepth(gcol, b[0].j0, b[0].j1, dx) : 0;",
    kills: ["C8 depth lands in the column it was written to, not its transpose"] },

  { id: "reconstruct-bed-offset",
    why: "the bed reported one row too high — bed was never asserted beyond its length",
    find: "bed[i] = b.length ? b[0].j0 * dx : 0;",
    replace: "bed[i] = b.length ? (b[0].j0 + 1) * dx : 0;",
    kills: ["E bed is the first wet row of the lowest body"] },

  { id: "no-zero-gravity-refusal",
    why: "the g = 0 refusal removed, so a two-sided EOS gets a plausible answer instead of an error",
    find: "if (!(Math.abs(g) > 0)) {",
    replace: "if (false) {",
    kills: ["E4 reconstruct refuses g = 0"] },

  // --- the specific-energy inlet and the energy line's velocity head
  { id: "inlet-pins-the-surface",
    why: "the OLD boundary, restored: the level becomes the surface and the velocity head is added on top. This is the bug the whole change exists to remove, and it looks entirely reasonable in a diff",
    find: "    if (!(q > 0)) { out.d = E; return out; }",
    replace: "    out.d = E; return out;",
    kills: ["H1 subcritical root solves E = d + q^2/2gd^2", "H3 the delivered depth falls as q rises"] },

  { id: "inlet-wrong-root",
    why: "the branch argument ignored, so every caller is handed the subcritical root — a chute that silently enters on the wrong side of critical. Written first as a deleted `if`, which only made the module fail to parse: a mutant has to change BEHAVIOUR, and the gate said so",
    find: '    if (branch === "super") { lo = q / Math.sqrt(2 * g * E); hi = dc; }',
    replace: '    if (false) { lo = q / Math.sqrt(2 * g * E); hi = dc; }',
    kills: ["H2 supercritical root also solves it", "H2 the roots straddle d_c"] },

  { id: "inlet-choke-ignored",
    why: "a reservoir that cannot pass the demanded q reports a depth anyway. s2 ships q = 1.2 against a head that can pass 0.651, so this is the case that actually occurs",
    find: "    if (E < Emin - slack) { out.d = dc; out.choked = true; return out; }",
    replace: "    if (E < Emin - slack) { out.d = dc; return out; }",
    kills: ["H5 an over-drawn reservoir reports choked"] },

  { id: "inlet-emin-off-by-a-half",
    why: "E_min written as d_c rather than 1.5 d_c — the reservoir is then reported able to pass half again what it can",
    find: "    const Emin = 1.5 * dc;",
    replace: "    const Emin = dc;",
    // NOT H6: at E = 1.5 d_c the bracket's lower end IS the root, so bisection
    // still lands on d_c however E_min is written. H7 is the assertion that
    // actually depends on the 1.5, and it was written because this survived.
    kills: ["H5 and reports the E_min it needed", "H7 E between d_c and 1.5 d_c is choked"] },

  { id: "energy-head-drops-w",
    why: "the vertical velocity left out of the kinetic energy — invisible in a parallel reach and most of the head at a brink, which is exactly where the line was sagging",
    find: "      ke += fr * uk * (uk * uk + wk * wk) / 2 * dx;",
    replace: "      ke += fr * uk * (uk * uk) / 2 * dx;",
    kills: ["K3 w is in the kinetic energy"] },

  { id: "energy-head-assumes-alpha-one",
    why: "the OLD energy line, restored: the velocity head built from the mean velocity, so alpha is 1 by construction. It agrees with the new one on every uniform profile, which is why K2 has to exist",
    find: "    const hv = Math.abs(q) > 1e-30 ? ke / (g * q) : 0;",
    replace: "    const hv = V * V / (2 * g);",
    kills: ["K2 two-layer profile has alpha = 1.75", "K3 w is in the kinetic energy"] },

  { id: "energy-head-clamps-the-flux",
    why: "the mass flux takes the CLAMPED fill, discarding the compressible part in a pressurised cell — the same split FS_COL's comment warns about",
    find: "      q  += fr * uk * dx;",
    replace: "      q  += (fr < 1 ? fr : 1) * uk * dx;",
    kills: ["K6 the mass flux counts the pressurised part"] },
];

/** The GEOM catalogue — the same shape, against js/geom.js. */
const GEOM_MUTANTS = [
  { id: "edge-normal-flipped",
    why: "the outward normal turned inward — every force changes sign and nothing looks broken until a free body diagram is drawn",
    find: "return [tz, -tx];",
    replace: "return [-tz, tx];",
    kills: ["GA2 every edge normal on rect(0,0,2,1) points away from its centre"] },

  { id: "force-fill-uncapped",
    why: "fc = min(f, 1) written as the raw fill, so an over-full (pressurised) sample counts its compressible excess in the force; at f < 1 it also loses nothing, which is why only a case with f > 1 or a weighted partial sum sees it",
    find: "const fc = Math.min(s.f, 1);",
    replace: "const fc = s.f;",
    kills: ["GA11 an over-full sample is capped at fc = 1"] },

  { id: "sample-count-no-floor",
    why: "the at-least-2-samples floor dropped, so a short edge is reduced to its midpoint",
    find: "const nk = Math.max(2, Math.ceil(L / ds));",
    replace: "const nk = Math.ceil(L / ds);",
    kills: ["GA6 faceSamples count is floored at 2 when ds exceeds the edge length"] },
];

// ------------------------------------------------------------------ harness
const dir = mkdtempSync(join(tmpdir(), "recon-mut-"));
const survived = [], stale = [];
let killed = 0, total = 0;

/** The names of the assertions that failed, from a suite's `  FAIL <name>` lines. */
const failedNames = (out) => out.split("\n")
  .map((l) => l.match(/^\s*FAIL (.*)$/)).filter(Boolean).map((m) => m[1]);

function runSuite(suite, envVar, file) {
  const env = { ...process.env };
  if (file) env[envVar] = file; else delete env[envVar];
  const r = spawnSync(process.execPath, [suite], { env, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function run(label, suite, envVar, src, srcName, mutants) {
  // Baseline: the unmutated suite must be green, or every kill below is bogus.
  const base = runSuite(suite, envVar, null);
  if (base.status !== 0) {
    console.error(`${label}: the UNMUTATED suite is red — fix it before mutating.\n${base.out}`);
    process.exit(1);
  }
  for (const m of mutants) {
    total++;
    // A mutation whose `find` no longer matches after a refactor is a SILENT
    // PASS: the suite would run against untouched source, go green, and the gate
    // would report success while testing nothing. That is precisely the failure
    // mode this file exists to prevent, so it is an error, never a skip.
    if (!src.includes(m.find)) {
      stale.push(`${m.id}: pattern not found in ${srcName} —\n      ${m.find.split("\n")[0]}`);
      continue;
    }
    const mutated = src.replace(m.find, m.replace);
    if (mutated === src) { stale.push(`${m.id}: substitution changed nothing`); continue; }

    const file = join(dir, label + "-" + m.id + ".js");
    writeFileSync(file, mutated);
    const r = runSuite(suite, envVar, file);

    if (r.status === 0) {
      survived.push(`${m.id} — ${m.why}\n      the suite stayed GREEN: ${r.out.trim().split("\n")[0]}`);
      continue;
    }
    const names = failedNames(r.out);
    const missed = m.kills.filter((k) => !names.includes(k));
    if (missed.length) {
      survived.push(`${m.id} — the suite failed, but not on the guard this targets.\n`
                  + `      expected among the failures: ${missed.join(", ")}\n`
                  + `      failed: ${names.join(" | ") || "(no FAIL lines — crashed?)"}`);
      continue;
    }
    killed++;
  }
}

run("recon", SUITE, "RECON_SRC", source, "js/reconstruct.js", MUTANTS);
run("geom", GEOM_SUITE, "GEOM_SRC", geomSource, "js/geom.js", GEOM_MUTANTS);

rmSync(dir, { recursive: true, force: true });

for (const s of stale) console.error("  STALE     " + s);
for (const s of survived) console.error("  SURVIVED  " + s);
console.log(`${killed}/${total} mutations killed, `
          + `${survived.length} survived, ${stale.length} stale`);
if (survived.length || stale.length) process.exit(1);
