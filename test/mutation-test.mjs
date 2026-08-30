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

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = fileURLToPath(new URL("../js/reconstruct.js", import.meta.url));
const SUITE = fileURLToPath(new URL("./recon-test.mjs", import.meta.url));
/** Read with the line endings NORMALISED to LF.
 *
 *  `.gitattributes` sets `* text=auto`, so the repo stores LF and a Windows
 *  checkout gets CRLF. The catalogue below is written with `\n`, so on Windows
 *  the one multi-line pattern (`band-inverted`) stopped matching and the mutant
 *  went STALE — the excursion-band orientation, test C4, was no longer being
 *  proven killable, on exactly the platform this repo is developed on. The
 *  gate did fail loudly, which is the design working; it just blamed a
 *  refactor that had not happened.
 *
 *  Normalising here rather than in each pattern keeps the catalogue readable
 *  and platform-blind: a `find` is written the way the source reads, once. The
 *  mutant is written back out as LF too, which the suite does not care about —
 *  it only ever parses the file. */
const source = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");

/** `find` → `replace` on js/reconstruct.js. `kills` are substrings of the
 *  assertion names that MUST appear among the failures — naming them is what
 *  turns "the suite noticed something" into "this guard works". */
const MUTANTS = [
  { id: "accum-ignores-history",
    why: "the running mean returns the sample and discards the window",
    find: "return mean + k * (phi - mean);",
    replace: "return phi;",
    kills: ["A2", "A6"] },

  { id: "accum-fixed-weight",
    why: "a constant weight instead of dt/(T+dt) — the frame-count average A2 exists for",
    find: "const k = dt / Math.max(T + dt, 1e-30);",
    replace: "const k = 0.5;",
    kills: ["A2", "A6"] },

  { id: "welford-drops-dt",
    why: "the second moment stops being time-weighted. G1 uses dt = 1 throughout so it CANNOT see this; C2 and C5 use dt = 0.01 and can",
    find: "return M2 + dt * (phi - meanOld) * (phi - meanNew);",
    replace: "return M2 + (phi - meanOld) * (phi - meanNew);",
    kills: ["C2", "C5"] },

  { id: "sigma-drops-window",
    why: "variance not divided by the window — the raw-sums bug Welford was chosen to avoid",
    find: "return T > 0 ? Math.sqrt(Math.max(0, M2 / T)) : 0;",
    replace: "return T > 0 ? Math.sqrt(Math.max(0, M2)) : 0;",
    kills: ["G1 Welford sigma", "C2"] },

  { id: "geomfill-no-compaction",
    why: "the slot-storage subtraction deleted — 7.9 mm on 1 m at c = 25, 77 mm at c = 8. This survived the entire B group until B5 was written for it",
    find: "const g = fbar - pbar / Math.max(c * c, 1e-12);",
    replace: "const g = fbar;",
    kills: ["B5"] },

  { id: "columndepth-exclusive-end",
    why: "the body's last cell dropped from the integral",
    find: "for (let j = j0; j <= j1; j++) d += gcol[j];",
    replace: "for (let j = j0; j < j1; j++) d += gcol[j];",
    // NOT C1: its exceedance profile is already zero at the top cell, so a
    // dropped end changes nothing there. The harness caught that claim.
    kills: ["D1 pool depth", "D4 smeared jet"] },

  { id: "bodydepth-unmasked",
    why: "bodyDepth stops masking sub-threshold cells, so it no longer matches FS_COL's `continue`",
    find: "for (let j = j0; j <= j1; j++) if (gcol[j] >= WET) d += gcol[j];",
    replace: "for (let j = j0; j <= j1; j++) d += gcol[j];",
    kills: ["D6 bodyDepth masks"] },

  { id: "wet-threshold-drift",
    why: "WET diverges from FS_COL's 0.25 — the actual regression an implementer made, to force a broken test green",
    find: "const WET = 0.25;",
    replace: "const WET = 0.15;",
    kills: ["D4 sub-threshold fill"] },

  { id: "dry-break-too-eager",
    why: "one dry cell ends a body, where FS_COL bridges two",
    find: "const DRY_BREAK = 3;",
    replace: "const DRY_BREAK = 1;",
    kills: ["D6 the gap is bridged"] },

  { id: "walk-non-strict",
    why: "the walk's dry test loses its strictness, splitting a body FS_COL keeps whole at exactly WET",
    find: "if (gcol[j] < WET) { if (++dry >= DRY_BREAK) break; continue; }",
    replace: "if (gcol[j] <= WET) { if (++dry >= DRY_BREAK) break; continue; }",
    kills: ["D7"] },

  { id: "band-inverted",
    why: "eta05 and eta95 swapped — the upside-down excursion band that does not look wrong",
    find: "return { eta95: crossing(gcol, j0, j1, dx, 0.05),\n             eta05: crossing(gcol, j0, j1, dx, 0.95) };",
    replace: "return { eta95: crossing(gcol, j0, j1, dx, 0.95),\n             eta05: crossing(gcol, j0, j1, dx, 0.05) };",
    kills: ["C4"] },

  { id: "reconstruct-transposed",
    why: "row-major index transposed — invisible on a square grid, catastrophic on the real 3400-column ones",
    find: "const k = j * nx + i;",
    replace: "const k = i * ny + j;",
    kills: ["C8 depth lands in the column"] },

  { id: "reconstruct-ignores-solid",
    why: "the solid mask stops being honoured, so a wall holds water",
    find: "solid[j] = mask[k] >= 192 ? 1 : 0;",
    replace: "solid[j] = 0;",
    kills: ["C8 a cell with mask >= 192"] },

  { id: "reconstruct-unmasked-depth",
    why: "d2d built from the unmasked integral, so the 2D/1D cross-check would measure its own bug rather than check against it",
    find: "d2d[i] = b.length ? bodyDepth(gcol, b[0].j0, b[0].j1, dx) : 0;",
    replace: "d2d[i] = b.length ? columnDepth(gcol, b[0].j0, b[0].j1, dx) : 0;",
    kills: ["C8"] },

  { id: "no-zero-gravity-refusal",
    why: "the g = 0 refusal removed, so a two-sided EOS gets a plausible answer instead of an error",
    find: "if (!(Math.abs(g) > 0)) {",
    replace: "if (false) {",
    kills: ["E4 reconstruct refuses"] },
];

// ------------------------------------------------------------------ harness
const dir = mkdtempSync(join(tmpdir(), "recon-mut-"));
const survived = [], stale = [];
let killed = 0;

for (const m of MUTANTS) {
  // A mutation whose `find` no longer matches after a refactor is a SILENT
  // PASS: the suite would run against untouched source, go green, and the gate
  // would report success while testing nothing. That is precisely the failure
  // mode this file exists to prevent, so it is an error, never a skip.
  if (!source.includes(m.find)) {
    stale.push(`${m.id}: pattern not found in js/reconstruct.js —\n      ${m.find.split("\n")[0]}`);
    continue;
  }
  const mutated = source.replace(m.find, m.replace);
  if (mutated === source) { stale.push(`${m.id}: substitution changed nothing`); continue; }

  const file = join(dir, m.id + ".js");
  writeFileSync(file, mutated);
  const r = spawnSync(process.execPath, [SUITE],
                      { env: { ...process.env, RECON_SRC: file }, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");

  if (r.status === 0) {
    survived.push(`${m.id} — ${m.why}\n      the suite stayed GREEN: ${out.trim().split("\n")[0]}`);
    continue;
  }
  const missed = m.kills.filter((k) => !out.includes(k));
  if (missed.length) {
    survived.push(`${m.id} — the suite failed, but not on the guard this targets.\n`
                + `      expected among the failures: ${missed.join(", ")}`);
    continue;
  }
  killed++;
}

rmSync(dir, { recursive: true, force: true });

for (const s of stale) console.error("  STALE     " + s);
for (const s of survived) console.error("  SURVIVED  " + s);
console.log(`${killed}/${MUTANTS.length} mutations killed, `
          + `${survived.length} survived, ${stale.length} stale`);
if (survived.length || stale.length) process.exit(1);
