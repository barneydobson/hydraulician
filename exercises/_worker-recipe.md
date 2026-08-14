# Worker recipe — demo verification & packaging (read fully before starting)

You are one of up to three agents packaging classroom demos for the hydraulician
app (the project's CLAUDE.md applies — read it if it is not already in your
context). Each demo from exercises/demo-programme.html becomes a folder under
exercises/ that the lecturer can pick up and run cold in a lecture hall.

## The teaching format (why these folders exist)

- 3rd/4th-year hydraulics; every student runs the app on their own laptop.
- Engagement metric: during the slot each student submits 1–3 NUMBERS from
  their own run via Blackboard. Marked on engagement, not accuracy.
- Personalised parameter: each submit-demo derives a parameter from the
  student number (e.g. q = 0.30 + 0.04·d where d = last digit, 0–9). The
  solver is deterministic, so a submission can be spot-checked by re-running;
  copying a neighbour mismatches your own digit.
- The pooled class plot (lecturer collects the Blackboard CSV) is the payoff —
  e.g. eleven (Fr₁, y₂/y₁) points tracing the Bélanger curve.
- Standing rules that go on every worksheet: everyone on Resolution: Medium;
  wait out the spin-up countdown; keep the tab visible (sim pauses hidden);
  after changing q, re-check any tailwater ≥ 1.3·y_c with y_c = (q²/g)^⅓
  (printed on the q slider).

## Hard rules

1. Do NOT edit any file outside your own exercise folder. Not js/, not
   index.html, not other demos' folders, not exercises/*.md at the top level.
   If the demo needs (or would clearly benefit from) a panel/UI/scene change,
   write a precise proposal in your Director-report appendix § PROPOSED
   CHANGES (see Deliverables) — what, where, why, and its impact on other
   scenes/demos — and demonstrate the best version possible without it.
   The director consolidates proposals.
2. Simulation/solver code is untouchable, full stop.
3. Concurrency etiquette: up to three workers share this machine. Use ONLY
   your own runner instance (--id = your demo id); never eval/shot/close
   another id. Do not touch the Claude browser-pane tools at all — they run
   the sim 37–240× too slow and cap scripts at 30 s (measured). Close your
   runner instance when done; zero orphan Chromes is checked.
4. All file writes go inside exercises/<your-folder>/ (plus scratch space).
5. Timebox ~45 minutes of effort. Not converging → stop, write an honest
   report.md (verdict NEEDS-CHANGE or BLOCKED, what exactly is missing).

## Driving the app headless — via the runner (mandatory)

Read exercises/_runner/HOWTO.md (40 lines) before your first command. The
runner drives a dedicated visible Chrome (hardware GL) over CDP; measured
~18.5k substeps/s solo, ~5–6k each when three workers pump at once (≈1×
realtime) — budget sim-seconds accordingly.

- Lifecycle:
  `python3 exercises/_runner/runner.py launch --id <DEMO-ID> --scene <id>`
  then `eval` / `pump` / `shot` / `bench` / `close` with the same --id.
  ALWAYS `close` at the end. Long pumps are fine in one call (no 30 s
  ceiling, heartbeat ETA, resumable).
- Parameters, exactly as the panel does it:
  `eval --id X 'CONTROLS.find(c=>c.id==="inQ").set(0.42); syncPanel()'`
  CONTROLS / OVERLAY / SIM / APP are bare lexical globals (not window.*);
  control ids are in the panel spec in js/main.js.
- `pump` leaves the sim PAUSED — run `APP.frames(2)` via eval before
  reading overlay-driven values or taking canvas shots, so the frame state
  is fresh.
- Steady state: honour the demo's stated settle time, then confirm the
  reading has flattened (two probes ~5 sim-seconds apart within ~1%).
- Column data for profile work: `SIM.columns(true)` → per-column bed,
  depth, unit discharge, surface. Overlay analysis:
  `OVERLAY.analyse(sim, SIM.columns(true))` carries a ~10%-per-call EMA —
  warm it (~60 frames + ~15 analyse calls) before trusting
  `OVERLAY.findJumps(...)` (→ {Fr1,y1,y2,y2p,dE}) or classifications.
- Walls/rigs: `SIM.addSeg(x0,y0,x1,y1,th,kind)` appends a segment and
  re-rasterises itself. Save your working build snippet as rig.js ("paste
  into the dev console to rebuild this rig") — until a save/share feature
  exists, rig.js IS the distributable rig. Students draw by hand, though:
  README must give human drawing steps (coordinates, which tool, snap),
  and the rig must be hand-drawable (no sliver gaps ≪ a cell).
- Instruments: gauges and rakes are pointer tools with a code path in
  js/main.js — place them programmatically the same way and read the same
  values the on-screen chart prints. Read numbers the way a STUDENT reads
  them (gauge value, hover/jump-box/overlay figures, panel q), from the
  same state the overlay prints — never a private recomputation.
- Worked snippets (panel set, jump box, screenshots, timings):
  exercises/HJ-1-belanger/README.md Appendix B. Read it before
  reinventing anything.
- Scene ids (verify against SCENES keys): hammer, jet, venturi, m1, m2,
  m3, h23, a23, s1, s2, s3, c13, dambreak, wave, wavedeep, waveshallow,
  wavesurge.
- Server: http://localhost:8124 is already running — never start another.
  Stale cache: `fetch(url,{cache:"reload"})` then reload (CLAUDE.md).

## What "demonstrating" means

Run the demo the way the CLASS will: N simulated students (N ≥ 6, spread
across the personalised-parameter range in the programme spec), each run
producing exactly the numbers that student would submit. Where the spec
leaves a value to be chosen (DRY-RUN flags: "choose C_f so the optimum sits
mid-range", crest heights, gauge positions…), finding the working value by
iteration IS part of the job; record it in README as a fixed setup constant.

Then verify like an examiner:
- Does the pooled data produce the promised payoff (slope/collapse/cluster)?
  Quote measured vs expected (e.g. "log-log slope 1.47 vs 1.5").
- Timing: measure spin-up and one full student run (sim-seconds needed and
  the realtime factor); the student path must fit ~10 min of laptop time.
- Robustness: run at least one edge-of-range "bad student" case. If a
  parameter choice explodes, drains, or misleads, find the safe bounds and
  put them in the README (and the q→tailwater table where relevant).

## Deliverables — folder exercises/<ID-slug>/ (e.g. exercises/HJ-1-belanger/)

- README.md — the brief, sections in this order:
  1. Title, demo id, refs line, one-paragraph purpose.
  2. Lecturer setup (before class): ?scene link, rig to draw (or rig.js),
     constants fixed by your dry-run, panel settings, timing budget.
  3. Student worksheet (copy-pasteable): numbered steps from "open this
     link" to "submit these numbers on Blackboard"; the personalised-
     parameter rule; exact submission fields; standing-rules footer.
  4. Collection & pooled plot (lecturer): expected CSV columns,
     `python3 collect_plot.py class.csv` usage, what the plot should show,
     2–3 discussion points, troubleshooting + safe parameter bounds.
  5. Verification record: simulated-class table, measured vs theory
     anchors, timing. Embed screenshots (![](shots/...)).
- collect_plot.py — pools a class CSV → PNG plot; matplotlib with the Agg
  backend; must run on your own data/simulated-class.csv and the resulting
  plots/pooled-demo.png ships in the folder.
- data/simulated-class.csv — your N simulated student runs.
- shots/ — ≥3 PNGs via the runner, taken AFTER the scene has settled:
  (a) rig/scene ready (`shot --mode canvas`), (b) a measurement being
  taken — gauge chart / jump box / rake visible, (c) full UI including the
  control panel (`shot --mode fullui`, `--panel` variant where useful).
  Confirm every PNG is non-trivial (>20 kB, visually checked with Read).
- rig.js — only if the demo draws geometry or places instruments.
- Director report — a hook on this machine refuses `report.md`-style
  files, so instead END README.md with a final section
  "## Appendix — Director report", terse:
  - VERDICT: READY | READY-WITH-CAVEATS | NEEDS-CHANGE | NOT-FEASIBLE
  - Evidence: key measured numbers vs expected, in one table.
  - Iterations: what you had to tune and why.
  - PROPOSED CHANGES (if any) + impact on other demos.
  - Timing: student-path minutes; your own wall-clock spent.
  - Handoff notes for workers on similar demos.

## Finishing

Final message to the director (≤8 lines): verdict, headline numbers, files
written, proposals if any, student-path timing, surprises. The director reads
this before opening any file — make it count.
