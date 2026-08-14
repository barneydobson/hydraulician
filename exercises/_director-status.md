# Director status — demo-programme verification

Working through exercises/demo-programme.html: 30 core demos + 10 backups.
Max 3 workers concurrently. Models chosen per difficulty; recipe in
_worker-recipe.md. Centralised issues/proposals: CHANGES-NEEDED.md.

**COMPLETE (2026-08-14): all 40 demos resolved.** 8 READY, 31
READY-WITH-CAVEATS (every caveat a measured worksheet constant or honest
physics, none a blocker), 1 relocated (NC-1: m1 → m3, impossibility on m1
proven and preserved), 0 infeasible. Lecturer front door: INDEX.md.
Decision items for the maintainer: CHANGES-NEEDED.md (P1–P13 + programme
amendments + stale-doc notes). Polish backlog: cleared.

States: pending / RUNNING / done-READY / done-CAVEATS / done-NEEDS-CHANGE /
done-NOT-FEASIBLE / redo.

| ID | Slug | Scene / rig | Model | State | Notes |
|----|------|-------------|-------|-------|-------|
| INFRA | _runner | CDP runner harness | opus | done-READY | visible Chrome + HW GL; 18.5k substeps/s solo, ~5–6k ×3; reproduces h23 verified numbers; vsync flags essential |
| HJ-1 | HJ-1-belanger | h23 | opus+sonnet | done-READY-CAVEATS | MEASURED: rule q=0.42+0.03·d (lower q drowns); Fr₁ 1.76–2.40, mean +3.2% vs Bélanger, spread ±~17%; s1 coda −26%; d=6,9 need 1.5·y_c tail. Caveat: jump box flutters (median-window read protocol in README) |
| UN-1 | UN-1-celerity | hammer + nozzle redraw | opus | done-READY | c fit 71.9 vs 70 (+2.7%), coda 139.8 vs 140; gap rule d mod 6 (cell quantisation); handoffs in README appendix |
| WV-1 | WV-1-dispersion | wavedeep/waveshallow | sonnet | done-READY-CAVEATS | deep +9.5% vs tanh (stragglers real); shallow −3.6% degrading past T=4.5 s (short flat bed, documented); stroke table + zoom-on-paddle fixed in worksheet |
| UF-1 | UF-1-normal-depth | s2 | sonnet | done-READY-CAVEATS | slope 0.721 vs 3/5 (closure+roughness, taught); n = 0.0589±0.0021; q rule 0.80+0.04·d (slider caps 1.2 → P4); y_n steady ≤1% |
| NC-3 | NC-3-bed-shear | s2 sweep + m2 anchor | sonnet | done-READY-CAVEATS | anchor 57.9 N/m²/63.8 mm vs 50/55 (+16%); span=mild/steep contrast not s2 alone; anchor station x=7 m (S_f triples along drawdown) |
| GV-1 | GV-1-backwater | m1 | sonnet | done-READY-CAVEATS | RMS 0.1 mm vs direct step; weir face −27 mm as designed; rule x=1+d; x=13 special; UI proposals P5/P6; n noisy (watch-out) |
| NC-1 | NC-1-slope-area | m3 (m1 failed, preserved) | sonnet ×2 | done-READY | m3: F 78–158 mm, 10/10 in ±20% (mean −2.5%); window rule x₀=5.0+0.5·(d mod 8); m1 evidence kept as contrast |
| QS-1 | QS-1-drain-predict | jet | sonnet | done-READY-CAVEATS | wager plot 1:1 (mean err 9.1%, +3.6% signed); drains 1.5–8 s not 20–90; C_d 0.52 measured vs 0.59 composed; seiche band dodged |
| WV-2 | WV-2-buried-gauge | wave + wavedeep | sonnet | done-READY-CAVEATS | wave flume +8.0% vs theory, kh 0.6–8.3; wavedeep bed "worse than blind" (turbulence ≫ signal → P7); spinup recording trap found+fixed |
| WV-3 | WV-3-reflection | wavesurge + wave contrast | sonnet | done-READY-CAVEATS | K 0.66–0.90 vs 0.6–0.9; contrast 0.04–0.34 (two-probe); node eyeball −41% → read protocol; T band 1.8–4.2 s; CLAUDE.md beach-slope note stale |
| NC-2 | NC-2-alpha | s2 stations + gate-wake contrast | sonnet | done-READY | α 1.27±0.10 (student) / 1.40 (full); free-slip NOT plug flow (bed friction stays on); gate wake α→2.30; rake chip unsmoothed → watch-then-pause |
| UN-2 | UN-2-establishment | hammer | sonnet | done-READY-CAVEATS | slope 1.882 (64% of ln19; τ < l/c — elastic not rigid-column); bulk 0.30, speed ×0.20, valve boots open; → UN-2b c-slider probe |
| UN-2b | UN-2 c-slider probe | same folder | sonnet | done-NOT-ADOPTED | c=400 slope 4.10 (139% — overshoots, ringy at all c); addendum transcribed by director after a spurious API-filter kill (2×) ate the agent; runner closed clean |
| HP-1 | HP-1-penstock-power | hammer + drawn throttle + nozzle | opus | done-READY-CAVEATS | no knob works (C_f inert; C_s wall-loss invisible to jet probe) → drawn plate x=8.0 gap 0.70; peak mid-rung, h_f/H 0.323/0.372 vs ⅓; settle 50 s; d mod 5 ladder |
| HP-2 | HP-2-pelton | spout + splitter (shared JET rig) | sonnet | done-READY | momentum-flux display exists; deep-V 160–165°; stagnation ratio 1.17–1.30 taught as bias |
| MO-2 | MO-2-jet-vane | spout + deflectors (shared JET rig) | sonnet | done-READY | flux-turning shots flat/45/90/deep-V; optional pooled stagnation histogram (n=12, +21% annotated); V-apex capping trap |
| FR-1 | FR-1-friction-law | RIG-A (built) | opus | done-READY-CAVEATS | slope 2.83 not 2.0 (λ∝V^0.87; programme text amended); level rule 3.30+0.13·d; RIG-A needs tailwater 2.50 m, Cs is the roughness knob, gauges 4.0/8.5 |
| LL-1 | LL-1-borda-carnot | RIG-A + 0.4→0.8 step | sonnet | done-READY-CAVEATS | 1:1 slope 1.025 R²0.906; k_L 0.239 vs 0.264; step at 3.80 m; tap near invert (centreline sign-flips); tail 2.95 m |
| LL-2 | LL-2-find-throttle | RIG-A + hidden fault | sonnet | done-READY-CAVEATS | blind 6/6 ±0.3 m, k_L ±10%; severity band 2–3 cells (not 30–60%); friction correction mandatory; probe-head convention flag → LL-1v |
| LL-1v | LL-1 head-convention probe | LL-1 folder | sonnet | done-CONFIRMED | gauges = piezometric (z added back), probe/hover = pressure-only; LL-1 numbers stand; definitive watch-out lifted to central list |
| PU-1 | PU-1-system-curve | sump + spout riser + overflow tank | sonnet | done-READY-CAVEATS | H=1.089+11.28Q² (R²0.846), H_s vs lift 8.9%; operating point live miss +3.1%; spout primes fake volume ~10%→1% (watch-out); survived session-limit resume |
| WE-1 | WE-1-sharp-weir | RIG-B (built) | opus | done-READY | slope 1.599±0.020 (Rehbock predicts 1.569); C_d 0.6226 −4.5%; q→level closed form (no iteration); RIG-B ponding trap documented |
| MO-1 | MO-1-gate-cv | RIG-B free-downstream + gate | sonnet | done-READY-CAVEATS | C_d 0.586±0.022; thrust-vs-naive +5→+28%; q-mode shipped (head-driven q display frozen → P9); openings 5–8 cells; vena station ≥6 cells |
| FB-1 | FB-1-choking-hump | RIG-B ponded + hump | sonnet ×2 | done-READY | re-timed E₁ protocol adopted: ratio 0.87–1.09 (mean 0.97) vs 1.90 committed; sharp hump kept (streamlined worse); q=0.15+0.05·d |
| FB-2 | FB-2-yc-three-ways | RIG-B crest + free overfall | sonnet | done-READY-CAVEATS | crest 1.23·y_c, brink 0.843·y_c, critical 0.8·y_c upstream — measured bands taught; shorter crest better; m2 anchor dropped; survived session-limit resume |
| DA-1 | DA-1-scale-ladder | RIG-B + broad crest ×3 scales | opus | done-READY | collapse 29.9%→RMS 2.16%; ¼ rung at 7.9–9.8 cells vs 7-cell floor; refinement twin proves droop=model not mesh; level closed form λ^0.157 |
| DA-2 | DA-2-time-scales | RIG-C single tank ×λ | sonnet | done-READY | slope 0.555±0.009 (R²0.998) vs 0.5; 4 exact-cell rungs; C_d flat in-ladder 0.603 but +4.5% Medium→High = DA-3's exhibit; apron needs low pinned tailwater |
| DA-3 | DA-3-scale-effects | DA-1/DA-2 rigs × resolutions | sonnet | done-READY-CAVEATS | λ-points and Δx-points overlay (1.2–1.5% vs 3–4% scatter); live moment Low↔High (Ultra breaks weir reservoir); SIM.build texture leak → P12 |
| QS-2 | QS-2-twin-tanks | RIG-C (built) | opus | done-READY-CAVEATS | t½=20.4·A* R²0.989; C_d·a measured (2-cell pipe = duct, C_d 0.18); band 8.8–22.9 s; pipe-on-bottom-edge trick; ring-buffer + toggleValve traps |
| UN-3 | UN-3-surge-tank | hammer + standpipe | opus | done-READY-CAVEATS | shaft-inertia-corrected T +6.8% (sheet formula +23%); y_max gap 34→3% ordered (ku²); reservoir 12.0 m, Depth field, ×2, bulk 0.03; ladder 0.70+0.14·d |
| GV-2 | GV-2-profile-safari | sandbox game | sonnet | done-READY-CAVEATS | 9 classes bagged incl. A2; A3 impossible (gate drowns), C = bounty; chip letter-flip defect → P11; score card re-priced from measured difficulty |
| CS-1 | CS-1-cso-spill | bespoke long-section, spout-fed | opus | done-READY-CAVEATS | q_spill=3.166·a R²0.998, C_d 0.715 (=QS-2's 0.71); n cells ≈ n×DWF (4%); spout-not-reservoir for ramps; spill=level criterion; first flush weak-but-real |
| B1 | B1-period-4Lc | hammer + valve at x | sonnet | done-READY | c=71.7 (+2.5%, cross-validates UN-1); datum offset 3.44 m (sponge reflection); closed valve ≡ wall (no erase); gauge near own valve |
| B2 | B2-flexible-pipe | hammer, c slider | sonnet | done-READY | ratio 1.963±0.024 vs 2.0; v₀ re-measure explicit; read window must scale 1/c (bug found+fixed); all 6 gaps survive both c |
| B3 | B3-dambreak | dambreak | sonnet | done-READY-CAVEATS | neg wave −0.8% (shared station; not personalisable, proved); bore personalised, −11.3% vs frictionless (friction); ×0.15; clean zone 3.0–9.5 m |
| B4 | B4-orbital-decay | wavedeep tracers | sonnet | done-READY-CAVEATS | anchors reproduced via theory-on-elevations (−14%, near-exact); direct bed read noise-plateaus 15–150× (the lesson); mid-tank station vindicated |
| B5 | B5-iribarren | both beaches, 15-cell grid | sonnet | done-READY-CAVEATS | ξ 0.51–12.73; 6 in-window cells, zero plunging (gap measured); spilling 0.73–2.11 observed; survived session-limit resume |
| B6 | B6-ursell | waveshallow | sonnet | done-READY-CAVEATS | U_r 174–356 + bonus toward 26; asymmetry 1.20–1.38 rising; two methodology bugs found+fixed (harmonic fit halves H) |
| B7 | B7-venturi-rating | venturi | sonnet | done-READY-CAVEATS | C_d 0.88 R²0.90; level band 1.70–2.24; CLAUDE.md 19.4 m/s anchor + cavitation tip STALE (flagged); survived limit resume |
| B8 | B8-three-orifices | jet + drawn lips | sonnet | done-READY-CAVEATS | sharp 0.611 spot-on; bellmouth 0.856; Borda 0.611 NOT 0.5 (no detachment — taught); eye-read bias 5–30% high; hit P12 leak live |
| B9 | B9-three-reservoirs | RIG-C ×3, dynamic version | sonnet | done-READY-CAVEATS | quasi-steady ruled out on evidence; junction head 1.68 m ±6 mm; zero-crossing +53–70% (opening transient, taught); continuity 7.9%; sign flip in-band |
| B10 | B10-crest-vs-hgl | RIG-A + raised crest | opus (redo) | done-READY-CAVEATS | 1:1 slope 1.134 R²0.990 +1.2 cells (cause measured); soffit datum closed; pocket hysteresis (read going up); d mod 6 rule; inherited-rig bugs fixed |

## Code-change campaign (maintainer-authorised, 2026-08-14)

Applying the low-risk P-list + the maintainer's new gauge-UI request.
Serialised where main.js is shared; solver numerics untouchable throughout.

| Wave | Worker | Scope | Files | State |
|------|--------|-------|-------|-------|
| 1 | UIFIX (opus) | P1, P3-display, P4, P5, P6, P9, P10, P11-reset | overlay.js, main.js | done → acbe904 |
| 1 | LEAKFIX (opus) | P12 texture leak (resources only) | sim.js, gl.js | done → 018ca6a |
| 2 | GAUGE (opus) | draggable gauge inspector + pause-freeze + CSV (maintainer request) | main.js, overlay.js, index.html | done → 25c2906 |
| 3 | RIGSHARE (opus) | P13 save/share rigs (JSON + deflate URL hash) | main.js, index.html | done → a25db85 |

All four waves verified against shipped-demo regression gates; campaign
complete 2026-08-14.

Deferred with reasons (stay proposals): P2 (default-view change collides
with WV-1/B4 worksheet assumptions), P7 (averaged probe mode — not small),
P8 (V-key semantics would break shipped hammer worksheets).

## Decisions log

- 2026-08-13: pilot = HJ-1 on Opus (existing validated scene; exercises the
  full pipeline: param sweep, jump-box readout, screenshots, CSV, plot).
  Recipe corrections from pilot get folded in before wave 2.
- 2026-08-13 pilot findings: (a) agent browser pane runs the sim at 2–13 ms
  per substep (never composites; not fixable by resolution/fresh tab/audio
  keepalive) and javascript_tool caps calls at 30 s → measured sweeps
  infeasible in the pane. STUDENT machines unaffected (visible tab ≈ full
  speed; HJ-1 student path ≈ 4 min). (b) Full-UI screenshots impossible in
  the pane. (c) A hook refuses `report.md`-style files — director report now
  ships as a README appendix + rich final message. (d) API corrections
  captured (CONTROLS + syncPanel; OVERLAY.analyse→findJumps with EMA
  warm-up; SIM.addSeg; composite #view+#over screenshot) — to be folded into
  recipe v2 together with runner HOWTO.
- 2026-08-13: commissioned exercises/_runner/ (Opus): own Chrome over CDP,
  page-side tick pump (no 30 s cap), Page.captureScreenshot for full UI,
  bench subcommand; prefer real DISPLAY, else headless+GPU, else accept slow
  but unattended. Wave 2 starts when runner lands: HJ-1r (sonnet),
  UN-1 (opus), WV-1 (sonnet).
- HJ-1 worksheet refinement, final (measured): q = 0.42 + 0.03·d. Both
  0.30+0.04·d and the 0.38 fallback drowned at their low ends; 0.42 is the
  measured floor for a reliably free jump; d = 6, 9 rows need tail at
  1.5·y_c.
- Cross-worker tension worth remembering: infra's control read at q = 0.5
  gave Fr₁ 2.236 (matches CLAUDE.md's 2.24) but HJ-1r's two long median
  windows on the same untouched default gave 1.68/1.82, with single frames
  ranging 1.4–2.5. The jump box flutters more than any single quoted number
  shows; all class-facing protocols now use median-of-window reads, and
  submission spot-checks must too (generous tolerance is load-bearing).

- Director process note (THRICE bitten: WE-1, LL-2, UN-3 — all detected by
  the transcript-marker grep, all launched late with no data loss): a
  status row may only say RUNNING if the same turn's tool results include
  the Agent-launch confirmation. Structural fix now in force: the Agent
  call goes FIRST in any mixed block, edits after — a dropped trailing
  call then loses bookkeeping, not work.

## Polish backlog (batch at end)

- HJ-1 plot legend still says "-5% (the solver's measured bias at q=0.5)"
  dashed line — stale against the measured mean of +3.2%; relabel to a
  neutral "±10% band" or drop the dashed line.
- Rig-builder demos (FR-1, WE-1, QS-2) run on Opus and ship rig.js for
  dependants; dependants may run Sonnet using the existing rig.js.
- Workers never edit shared files; UI/scene proposals flow through
  report.md → CHANGES-NEEDED.md (director-compiled).
