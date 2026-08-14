# Centralised list — demos that are not possible as specified, and proposed changes

Compiled by the director from worker reports. Two sections: (1) demos that
cannot run as written and why, with what would unblock them; (2) interface /
control-panel change proposals (allowed: UI only, never the solver), each
with its expected impact on other demos.

## 1 · Not possible as specified

- **NC-1 on ?scene=m1 — not possible; RESOLVED by moving to ?scene=m3.**
  On m1 the fall over any gauge window is 0.04–3.2 mm — under the 1 mm
  gauge display AND the solver's 0.5–1.2 mm pressure-noise floor (whole
  reach is backwater pool; a 4-decimal display would not help; N10
  correction +25…+43%, same size as the signal). On m3 the same windows
  read F = 78–158 mm and a 10-digit class lands 10/10 inside the promised
  ±20% (mean −2.5%). The demo now ships on m3; m1's full failure evidence
  is preserved in the folder as the teaching contrast ("Why not m1").
  m2 remains unsuitable for level-difference work: its flat-bed +
  tilted-gravity trick means raw gauge levels omit the S₀·L component.
  Programme text: change NC-1's rig line from ?scene=m1 to ?scene=m3 with
  window rule x₀ = 5.0 + 0.5·(d mod 8), windows 7 m.

## 2a · APPLIED (maintainer-authorised, 2026-08-14) — commits 018ca6a,
## acbe904, 25c2906, a25db85

P1 (pressurised hover gated on capped column + f), P3 display variant
(delivered level printed), P4 (q cap → 2.0), P5 (cursor coords + surface
elevation), P6 (numbers never gated by the ok-flag), P9 (delivered q in
head-driven mode), P10 (edge auto-restore), P11 reset variant (EMAs
cleared on re-rasterise), P12 (rebuild texture/FBO leak fixed, 125-cycle
soak), P13 (rig save/share: #rig= deflate links + JSON, panel Rig
section), plus the maintainer-requested GAUGE INSPECTOR (draggable
per-gauge history windows, pause-freeze, 20k-sample store behind
byte-identical corner cards, CSV export). Per-item evidence:
exercises/_code-changes/. Follow-up option now unlocked: the 40 demo
READMEs' recipe cards can each gain a one-click #rig= URL (not yet done —
would need a re-verification pass per rig).

Consequences worth noting: UF-1/DA-1 worksheets still use their trimmed
q ranges (valid, conservative) — widening them under the new 2.0 cap
needs re-measurement first. P11's reset lives in a main.js wrapper;
folding it into SIM.rasterise is a suggested tidy-up.

## 2 · Interface / panel change proposals (still open, deferred with
## reasons)

- **[P1, from UN-1] Suppress the free-surface hover block inside pressurised
  pipes.** The hover readout currently labels a full pipe "H2 profile" and
  prints y_c/S₀/S_f there, which is meaningless for pressurised flow and
  will confuse students in every duct demo (FR-1, LL-1, LL-2, PU-1, B10).
  Proposal: gate the profile/GVF part of the readout on fill fraction
  (suppress when f > ~1.002); keep p/ρg, u, v. UI-only (js/overlay.js
  display logic; no solver contact). Impact on other demos: none negative —
  channel scenes unaffected (f ≤ 1 at the surface); duct demos gain a
  correct readout. Until approved, worker READMEs carry a "ignore the
  profile chip inside the pipe" note.

- **[P2, from WV-1] wavedeep's default camera frames a station where the
  wave has already died.** Coherent signal decays 30–50× within ~2.5–3 m of
  the paddle at any usable stroke, and the shipped default view (mid-tank)
  shows near-flat water to a new visitor. Proposal: a paddle-framed default
  view (or a second stored view) for wave-watching work; UI/scene-view
  only. Impact: none on B4 (orbital decay) which uses the mid-tank station
  deliberately. Until then, worksheets tell students to zoom on the paddle
  (WV-1's already does).

- **[P3, from FR-1] Expose or auto-size `spongeIn` for sandbox reservoirs.**
  The head-driven reservoir's delivered level sits 0.16–0.30 m below the
  slider value (relaxation sponge). Harmless where only differences matter
  (FR-1), but PU-1 and B10 quote a static lift, so their numbers inherit
  the offset. Proposal: either print the delivered level next to the
  slider, or auto-trim the sponge target so slider = delivered. UI/scene
  plumbing only. Impact: none on shipped scenes if display-only; worksheet
  workaround meanwhile is "read the actual reservoir surface with a gauge,
  not the slider".

- **[P4, from UF-1] Raise the `Inflow q` slider cap.** js/main.js:161 caps
  the slider at max = 1.2 m²/s; the programme's UF-1 wants q up to 1.6 (and
  a wider spread helps every pooled sweep on the steep scenes). No shipped
  scene sets q > 1.2, so raising the max to ~2.0 changes no defaults;
  risk is only students dialling silly values (the standing tailwater rule
  already governs that). Until raised, UF-1's rule is trimmed to
  q = 0.80 + 0.04·d (0.80–1.16).

- **[P5, from GV-1] Print cursor coordinates (x, y) and surface ELEVATION in
  the hover readout.** Students assigned "station x = 7 m" currently have no
  on-screen way to find x = 7 m (scale-bar arithmetic only), and the readout
  gives depth but not elevation above datum — GV-1 works around both with a
  whole-metre station rule and a station→bed-elevation card. UI-only
  (overlay text). Impact: pure addition, helps GV-1, NC-1, NC-2 and every
  station-based exercise; no other demo harmed.
- **[P6, from GV-1] Do not gate the hover readout's numeric rows on the
  profile classification's ok-flag.** At x = 13 m (inside the weir's guard
  band) the entire depth block disappears with the classification — but
  depth/surface are still perfectly measurable there. Show numbers always;
  gate only the profile chip. UI-only. Impact: fixes the stranded-station
  problem for any exercise measuring near a control.

- **[P7, from WV-2] A time/spatially-averaged probe mode.** wavedeep's bed
  pressure oscillation is swamped by near-paddle turbulence (measured
  3–240× the true signal; bed/surface ratios read >1, physically
  impossible, across every station/height/window tried). A probe option
  that averages over a small box and/or a DFT window would make weak
  coherent signals readable. Display/readback side only. Impact: unlocks
  the quantitative half of WV-2's deep-flume cohort; also helps any
  mm-scale level read (NC-1 family). Until then WV-2's deep cohort submits
  "below noise" — which is itself the recorder-depth-limit lesson.

- **[P8, from QS-2] Per-valve toggling.** `toggleValve()` (and the V key)
  flips every valve cell in the domain at once, so multi-valve rigs cannot
  be staged (B9's three-reservoir junction wants one branch opened at a
  time; CS-1 storm sequencing may too). Proposal: number valves by drawn
  segment and let V cycle/target them (or a small panel list). UI/input
  only. Impact: pure addition; single-valve scenes unchanged.

- **[P9, from MO-1] The panel's "Inflow q" value freezes under head-driven
  inflow.** `sim.p.inflow.q` (js/main.js:162) is never updated when the
  reservoir runs head-driven: the panel showed 0.330 while the true
  discharge was 0.307–0.309. Any demo reading q off the panel in
  head-driven mode gets a stale number — PU-1 (system curve) is the big
  customer. Proposal: compute and print the DELIVERED q (from the column
  reduction at the inlet) whenever head-driven is on; display-only.
  Cross-ref P3: the delivered reservoir level also sits below the slider
  (measured 0.6125 vs 0.69 here). Until fixed: workers/students measure q
  from the hover/column readout, not the panel, in head-driven mode.

- **[P10, from DA-2, low priority] Reservoir-edge auto-restore.** Toggling
  the reservoir on opens its edge; toggling it off leaves the edge state
  needing an explicit close (a ~2% leak in DA-2's drains until closed).
  Proposal: restoring the edge to Wall when the reservoir control is
  switched off. Small UI/state change; no shipped scene toggles mid-run.

- **[P11, from GV-2] The profile chip's LETTER can flip wrongly on mixed
  rigs** — a drowned gate on a steep bed read "M1": the classification
  compares against `S._ynK`, a stale DOMAIN-WIDE EMA of normal depth,
  while the local y_c collapses with local q. Proposal: derive the
  mild/steep letter from a reach-local y_n (or at least reset the EMA on
  re-rasterisation). Overlay-only. Impact: fixes safari adjudication
  disputes and any sandbox rig mixing regimes; shipped single-regime
  scenes unaffected. Until then, GV-2's score card carries the
  adjudication rule for disputed chips.

- **[P12, from DA-3] `SIM.build` leaks GPU textures on repeated rebuilds** —
  "Framebuffer incomplete" after repeatedly flicking Resolution on large
  builds. A student toggling Resolution during DA-3's live moment could
  hit it. This is resource management in the build path, not solver
  numerics, but it lives in js/sim.js — flagged for the maintainer's call,
  not applied. Workaround in DA-3's worksheet: reload the page between
  resolution flips beyond the scripted two.

- **[P13, evidence-backed re-vote for the feasibility sheet's shopping-list
  #1: save/share drawn rigs.]** The programme ran without it, but the cost
  is now measured: B10's hump is 35 strokes per height step, DA-1 builds
  three scaled rigs per class, QS-2/CS-1/LL-2 all travel as recipe cards,
  and every rig.js in this pack is a workaround for the missing feature.
  A segment-list → JSON/URL-hash exporter (CPU-side only, per the sheet's
  own scoping) would collapse all build cards to links and remove the
  single largest per-demo time cost (drawing dominates most student
  paths).

## 2b · Programme-text amendments (measured reality vs the sheet)

The demo works, but demo-programme.html promises a different number — fix
the text before printing worksheets:

- **DA-1**: the base-q band is NOT free — the λ=¼ third's junk floor
  (H ≥ 7 cells, re-measured) forces q_base ≥ 0.61, so the rule is
  q_base = 0.60 + 0.06·d with thirds by d mod 3, and the full-scale rig
  presses against the 1.2 q slider cap (second customer for P4). Level
  rule ships as one closed form: crest + 0.799·λ^0.157·q^0.562 (within
  7 mm everywhere). Collapse delivered: 29.9% spread → RMS 2.16%.
- **FR-1**: "Pooled log h_f vs log V: slope 2.0 ±" → measured slope is
  **2.83 ± 0.05 (R² 0.998)**: the delivered λ is not constant (0.0250 →
  0.0381, ∝ V^0.87). Reword the payoff as "a razor-straight power law whose
  exponent is THIS pipe's, not the textbook's — forcing V² gives λ ≈ 0.033"
  (the calibration lesson survives, strengthened). Also "two gauges 6 m
  apart" → gauges at x = 4.0 and 8.5 (L = 4.5 m): the HGL is straight only
  over x ∈ [3.5, 8.6] (entry length upstream, tailwater sponge downstream).
- **HP-1**: the Rig line's "with C_f raised to a prescribed value so
  friction matters" CANNOT WORK — C_f is inert in the hammer penstock
  (raised 62×, h_f/H reaches only 0.034), and C_s at panel max reaches
  0.140 but as WALL loss, which the spec's jet-core probe cannot see (the
  core reads √(2gH) exactly while the HGL drops). Rewrite the rig as: all
  sliders at scene default + a drawn penstock throttle plate at x = 8.0 m,
  gap 0.70 m (form loss — the whole stream feels it). Ladder
  gap = {0.42, 0.70, 0.84, 0.97, 1.10} by d mod 5 (0.28 m under-resolved,
  0.56 m deterministically unsteady — both dropped on evidence). Peak lands
  on the middle rung; straddling rungs read h_f/H = 0.323 / 0.372 vs ⅓.
  Settle is 50 s, not the scene's nominal 10 (at 25 s, v reads 15% high).
  Drop HP-1's "choose C_f" DRY-RUN flag; the dry-run is done.
- **HJ-1**: "personalised q 0.3–0.7" → q = 0.42 + 0.03·d (0.42–0.69);
  q < 0.42 drowns the jump even with the tailwater rule applied.
- **LL-1**: "bore stepping 0.4 → 1.0 m at mid-length" → 0.40 → 0.80 m with
  the step at x = 3.80 m: the 1.0 m step starves the driving head under
  RIG-A's reservoir rule and needs more redevelopment length than the pipe
  has. Geometric k_L becomes 0.264 (not 0.36); measured class mean 0.239.
- **RIG-B card (programme callout)**: "A flat bed slab across the domain,
  reservoir left, tailwater or drawn control right" → as written it PONDS
  (open right edge floods to 1.46 m and drowns a 1.00 m crest; a tailwater
  held clear of critical sits ~0.9 m up). For structures needing a free
  downstream side (WE-1 nappe, MO-1 gate jet): carry the bed only TO the
  structure and let the floor fall to an Open bottom edge. For genuinely
  subcritical exercises (FB-1) the ponded form is the working state. The
  card should describe both variants. (From WE-1; verified numbers in its
  Director report.)
- **WE-1**: "Pooled log-log slope 1.5" → measured 1.599 ± 0.020 (R²
  0.9987), of which Rehbock's own C_d(H/P) growth predicts 1.569 — reword
  the payoff to "≈1.6, because C_d is not constant, and Rehbock says so
  too": a stronger claim than the original. C_d(forced 3/2) = 0.6226,
  −4.5% on Rehbock. Also q = 0.10 + 0.05·d (0.05 fails at 4.9 cells of
  head; 1.20 nearly drowns the nappe) and the q→level table is load-bearing
  (±0.1 m off → C_d ±0.08 and 95 mm gauge flutter).
- **B7**: works as a rating (C_d = 0.88, R² 0.90; level band 1.70–2.24 m,
  below 1.65 the Δh drowns in noise) — but TWO of the scene's own claims
  did not reproduce and look stale since the reservoir rework: CLAUDE.md's
  "throat jet 19.4 vs 20.3 m/s ideal" (measured peak ≈ 3.7 m/s even at the
  slider ceiling 2.40 m) and the in-scene tip that raising the reservoir
  drives the throat head to zero (never triggers within slider range).
  Worth reconciling in CLAUDE.md alongside the stale beach-slope note.
- **B8**: the promised C_c clusters 0.61 / ~1.0 / 0.5 measure as
  0.611 (sharp, spot-on) / 0.856 (corner-bevel "bellmouth" — a drawn
  chamfer cannot reach 1.0) / **0.611 for Borda** — the re-entrant tube
  reproducibly fails to detach (the passage hugs the wall's outer face),
  so the classical 0.5 does not materialise; the worksheet teaches the
  ORDER and the why-not, not the missing number. Eye-read C_c biases
  5–30% high vs the field read — worksheet caution included. (B8 also hit
  the P12 texture leak in practice — one more vote for that fix.)
- **B10**: the criterion demo works and the datum argument is closed —
  onset when the HGL meets the SOFFIT (axis reads 0.196 m low, invert
  0.391 m; V²/2g at 0.29–0.86 m dwarfs the class's 0.22 m spread, so the
  purely geometric criterion is the right teaching). Class 1:1: slope
  1.134, R² 0.990, +1.2 cells bias (measured cause: the hump's loss is
  concentrated, so straight-line HGL interpolation under-reads at the
  crown). Onset trigger = crown pressure head < 0.02 m (fill fraction is
  useless — reads 1.0006 near zero pressure; q has no knee). Read z_sep
  going UP (the air pocket persists 8 cells below onset coming down).
  Ramp length is physics not cosmetics (short ramps cost 24% q). Digit
  rule trimmed to level = 3.30 + 0.13·(d mod 6): d ≥ 8 needs 34+ steps.
  Re-settle 12 s per step is load-bearing (7–8 s trips the trigger on
  transients).
- **B9**: ships as the DYNAMIC three-reservoir demo, not the quasi-steady
  classic — with two level controls B must float, and it equalises with
  the junction in ~15–20 s (measured; no plateau exists to read). All
  three branches release together (P8's global valve, matching a
  commissioning scenario). The pooled Q_B zero-crossing reads +53–70%
  above the settled junction head (1.68 m, gauged to 6 mm) because every
  run carries an opening transient — the worksheet teaches that gap, and
  the sign flip lands inside the digit band (d = 8→9). Continuity closes
  to 7.9% mean (#81's node law as a check). A decoupled
  storage-vs-resistance branch lever (optional proposal, in the folder)
  would enable the true quasi-steady version later.
- **B4**: the bed-orbital ratio cannot be READ to 244× — direct
  measurement plateaus at the station's noise floor (repeat windows spread
  15.5×–82.4× at the scene default; the true bed signal sits below noise
  at all 8 digits). The pooled plot therefore shows theory diverging while
  measurements plateau — the recorder-limit lesson again (WV-2's family);
  the 244× and 0.442 anchors are reproduced via theory on measured tracer
  elevations (−14% and near-exact). The scene's mid-tank tracer station is
  RIGHT (near-paddle drift resets tracers out of the rake) — P2's scope
  unchanged.
- **B6**: the workable waveshallow band gives U_r = 174–356 — "Airy stops
  being enough" is far past the classical ~26 marker here, anchored
  toward 26 only by low-amplitude bonus points. Measurement method
  matters and is prescribed: median crest-to-trough per period (a
  harmonic fit halves H by construction — it strips the nonlinearity
  being measured; found and fixed).
- **B3**: the negative-wave half cannot be personalised — the 2.56 m
  reservoir is too short/deep (1.6×h₀) for a self-similar travelling
  drawdown (proved three ways in the folder), so it becomes a shared
  fixed-station measurement (x = 1.0 m; −0.8% vs √(gh₀)) while the BORE
  half carries the personalisation (station pairs x₁ = 3.0 + 0.5·d, clean
  zone x ∈ [3.0, 9.5] m; wet-bed surge formula, mean −11.3% vs
  frictionless with a clean friction deceleration). Speed slider ×0.15;
  replay is R alone once V has been pressed once.
- **B5**: the map ships with the gap MEASURED — 6 of 15 cells land inside
  the classical plunging window (ξ 0.5–3.3) and zero plunge (3 spill, 3
  die); observed spilling occupies ξ 0.73–2.11 (cells below that die from
  absolute height — the 2-cell floor — not steepness) and surging holds
  from ξ 3.35. Beach slopes measured from source: tanβ = 0.10 and 0.70.
  Dies-floor assignments (wave T = 5–6 s, wavesurge T = 0.8 s) stay in the
  grid with the worksheet's "dies is a data point" rule.
- **CS-1**: two structural changes to the rig line — (1) the inflow CANNOT
  be a level-controlled reservoir for a ramp (0.15 m of level error
  delivers +17% of q through the sponge, and the pairing moves as q^(2/3)
  during the ramp): the storm inflow is the SPOUT, and students read the
  delivered q off the hover; (2) "log the q at which the crest first
  spills" needs an operational criterion — the falling nappe reads ≈0 in
  the per-column q (horizontal flux), so first-spill = chamber level ≥
  crest + 1 cell on the chamber gauge. Throttle ladder is 2–8 cells
  (10 cells becomes a churning plunge pool, apparent C_d 0.94, excluded).
  Bonus fact for the worksheet: with the crest 1.00 m up, a throttle n
  cells wide sets the overflow at ≈ n × DWF (to 4%, up to 7 cells). First
  flush verifies but renders as a grey-brown tint, not vivid orange —
  pre-charge BOTH the chamber standing water and the sewer, and temper
  expectations (chamber turns over in ~4 s at storm flow).
- **DA-3**: "reload your rig at Low vs Ultra Resolution" → **Low vs High**:
  at Very high/Ultra the DA-1 weir reservoir fails to settle (measured —
  a finding no earlier demo hit), and a literal live reload is LUMPY
  (integer rasterisation jumps: the orifice floor-trims 0→5 cells across
  the ladder) rather than the smooth shift DA-2's held-cell-count rebuild
  shows — the lecturer script narrates both mechanisms. The headline
  measurement stands and is stronger than promised: λ-scale points and
  Δx-resolution points overlay on ONE C_d-vs-cells curve (1.2–1.5% gap vs
  3–4% scatter). Digit rule: even → Low, odd → High.
- **FB-1**: the prediction must be RE-TIMED — Δz_pred computed from E₁ read
  at the last hump step before choking, not from the pre-hump committed
  value (the pool rises as the hump grows in this doubly-controlled rig;
  committed-E₁ predictions run 1.87–1.94× low). With the re-timed
  protocol the class lands at 0.87–1.09× (mean 0.97). Keep the committed
  prediction as the opening wager, then the re-timed one as the honest
  test — the worksheet carries both. Streamlined humps are WORSE (need
  30–120% more height to choke) — keep the sharp block.
- **FB-2**: the three expected ratios move on this solver — depth ON the
  broad crest reads 1.230 ± 0.061 · y_c (not ≈1.0; and a SHORTER crest
  reads closer to theory: 1.1 m beat 4.4 m), the brink reads
  0.843 ± 0.018 · y_c (not the classical 0.715), and critical sits
  0.56–0.98 y_c upstream of the lip (not the ref list's 3–4 y_c — that
  figure presumes an established approach flow that a zero-slope crest
  never develops). The ordered-three-depths pedagogy survives; worksheets
  must quote the measured bands. The m2-brink shared anchor is dropped
  (85–90 s spin-up for one point); the whole demo runs on one
  RIG-B crest + free-overfall rig with FB-1's q rule.
- **GV-2**: the safari's achievable set in the sandbox is M1/M2/M3,
  S1/S2/S3, H2/H3, A2 (nine; A2 is genuinely gettable). A3 is NOT
  spawnable with a gate on a rising bed (drowns at every setting — needs
  an a23-style falling-chute entry); the C-family only flickers on the
  knife edge (like the shipped c13) and never meets a 10 s stability bar —
  score it as an open bounty, not a lie. Points re-priced from measured
  difficulty: M1/M2/H2 = 1, M3/S1/S2/S3/H3 = 2, A2 = 3, A3/C = 5 (H3
  measured as cheap as H2, contra the illustrative pricing). Pairs, 20
  min.
- **GV-1**: "agreement to a few cm except within ~0.5 m of the weir face" →
  agreement is sub-millimetre (RMS 0.1 mm) over x = 1–11 m, because the M1
  pool is deep enough that S_f ≪ S₀ and the direct step is barely bending;
  the weir-face failure reads −27 mm. The validation story is cleaner than
  promised; the "few cm" wording should go. Station rule: x = 1 + d (whole
  metres; x = 13 gets a special procedure since the hover's numeric block
  vanishes there — see P6).
- **WV-2**: "≈0.8 in the intermediate flume" → idealised 1/cosh(kh) is
  0.704 at wave's defaults (measured 0.862 with real gauge depths); and
  the deep-flume half cannot deliver "read ≈0.05 off the trace" — the bed
  gauge there is worse than blind (turbulence swamps the signal; see P7).
  Reframe the deep cohort's submission as "below noise", i.e. the class
  measures the recorder's depth limit by hitting it.
- **WV-3**: works on-spec on wavesurge (K_refl 0.66–0.90, node spacing
  within 1.7% of L/2), but (a) the period band is T = 1.8–4.2 s (outside
  it the signal dies before the beach or the measuring zone is too short),
  (b) the spilling-beach contrast needs the two-probe decomposition in the
  README (its flat run is shorter than L/2 — no envelope to slide along),
  and (c) a naive short-window read at a NODE overreads badly (−41%;
  antinodes are fine at +5%) — the worksheet's read protocol handles it.
  Side note: CLAUDE.md's "1:3.4 beach, ξ ≈ 1.3" line is stale — the
  shipped spilling beach measures 1:10, as the programme says.
- **MO-2 / HP-2**: "probe the stagnation point (head ≈ v²/2g)" → the
  measured stagnation ratio is 1.17–1.30 (mean +21%), not ≈1 — continued
  gravitational acceleration into the wall plus the compressible-EOS
  stagnation response at M ≈ 0.2. Teach the annotated bias, don't hunt a
  cleaner number. Deep-V deflectors deliver a genuine 160–165° turn; any
  hand-drawn V needs an explicit capping stroke at the apex (two
  butt-ended arms leave a leak — rig.js caps automatically).
- **NC-3**: "Pooled D_min vs q on the steep scene spans sand → boulders" →
  the s2 sweep alone spans only 512–915 mm (all boulders); the sand→
  boulders span appears in the m2-vs-s2 CONTRAST (×14.3 in τ₀), so the demo
  is restructured around mild-anchor + steep-sweep. Also the m2 anchor is
  station-sensitive (S_f triples 0.016→0.048 along the M2 drawdown from
  x = 5 → 11 m): worksheet fixes the anchor station at x = 7 m.
- **LL-2**: partner A's fault card must say "block 2–3 cells of the bore
  (11–17%)", not the programme's "30–60%": 1 cell is undetectable above
  the friction slope, 4+ cells de-pressurises the downstream pipe. The
  distributed-friction correction on the kink read is 11–28% and therefore
  a mandatory worksheet step (using FR-1's fitted law — a locally-measured
  slope next to the fault reads ~2× steep from its own backwater).
- **NC-2**: "α ≈ 1.05–1.2 in uniform reaches" → measured 1.27 ± 0.10 by
  the student 4–5-point method, 1.40 ± 0.10 at full resolution (the
  wall-function profile is blunter than a log-law river; the −9…−14%
  coarse-sampling bias is systematic and taught). And the feasibility
  sheet's "free-slip toggle gives the plug-flow contrast" is WRONG as a
  class moment: free-slip barely moves α (1.44 vs 1.46) because the slip
  flag only changes the wall Laplacian — bed friction stays on
  (js/shaders.js). The working contrast is the gate wake (α 1.78 at the
  vena → 2.30 in the wake), which clears N6's ">2" line from vertical
  shear alone. Scene: s2, stations x = 1.5 + 0.5·(d mod 8) (m3's apron
  measured 2× noisier).
- **QS-2**: "time the level difference halving" band is 8.8–22.9 s across
  the width rule, not a leisurely 15–60 s — arithmetically capped by the
  fixed 2 m tank and the smallest passage the grid holds (1 cell at
  C_d 0.71); the drawn 2-cell base pipe acts as a duct (effective C_d
  0.18), not an orifice. Worksheet paces accordingly; the speed slider
  makes the short drains readable.
- **QS-1**: the jet tank's full drain is 12.7 s, so prescribed level pairs
  give 1.5–8.0 s drains (readable via the speed slider), not a leisurely
  stopwatch exercise; the rule also skips a band to dodge a ~1 s
  post-shutoff seiche. Measured C_d ≈ 0.52 vs the composed 0.61×0.97 =
  0.59 (−12%, consistent across two methods) — worksheet teaches the gap,
  not a corrected constant.
- **UN-2**: the pooled line is exact (R² 0.9987) but its slope is 1.882 =
  64% of ln 19, and t_90 at defaults is 0.456 s not "≈1 s" — because at
  c = 70 the establishment constant τ (~0.25 s) is SHORTER than the wave
  transit l/c (0.70 s): the rigid-column model behind U1–U7 does not hold;
  the pipe rings. Worksheet constants that make it work: bulk damping
  0.30 (not the shipped 0.03 — a level jump on a shut pipe otherwise
  rings for 30+ s), speed ×0.20 (not ×0.05 — the chart's ring buffer
  holds only 0.75 sim-s at ×0.05), and the valve BOOTS OPEN (first
  worksheet step closes it). The c-slider second act was probed and NOT
  adopted: at c = 400 the slope overshoots to 4.10 (139% of ln 19) — the
  establishment stays ringy at every c, so do not improvise a live
  "raise c and match theory" moment; teach the 64% as U1–U7's validity
  limit (full table in the UN-2 README addendum).
- **UN-3**: three panel settings the sheet omits, all load-bearing —
  Reservoir at 12.0 m (the scene-default 25 m FAILS containment: 31.7 m
  head at b_s ≈ 1), gauges plot the DEPTH field (the head channel carries
  the ±6 m Joukowsky wave, which buries the 3 m mass oscillation), speed
  ×2 (slow event; the ring buffer bites upward here). Ship default bulk
  damping 0.03 (0.30 throttles the nozzle −33% and corrupts the decay).
  The sheet's period formula reads ~23% low until the standpipe's own
  water column is added: T = 2π√((l·b_s/b_p + l_s)/g) collapses all ten
  rungs to +6.8% — teach the corrected form (better problem sheet).
  Width ladder trimmed to b_s = 0.70 + 0.14·d (the 0.5 m rung gives
  >5 m/s shaft velocity); fixed 2-cell nozzle, v₀ ≈ 1.0 m/s.
- **UF-1**: "slope 3/5 — Manning's exponent" → measured slope 0.721
  (R² 0.964). The overlay's measured y_n uses a Chezy-type closure
  (idealised exponent ⅔) and the delivered roughness is depth-dependent,
  so the class's exponent lands ~0.67–0.72. Reword the payoff to "a power
  law close to Manning's ⅗ — and the gap IS the resistance lesson". Also
  the q range: 0.8–1.6 → 0.80–1.16 until P4 (slider cap) is applied.
- **UN-1**: gap ladders quantise to whole cells → 6 distinct rungs
  (`d mod 6`), not 10.

## 3 · Lecturer watch-outs discovered (no change recommended)

- **[from UN-1] The celerity slider's caption prints "Δh from Δv: 7.1 m per
  m/s" — i.e. UN-1's answer.** Keep the panel closed until the post-plot
  reveal; the worksheet says so. A UI change (hiding the caption) would
  hurt the other hammer demos that legitimately use it.
- **[from UN-1] Nozzle gaps quantise to whole cells** (0.1376 m at Medium
  in the hammer domain), so personalised gap ladders have ~6 usable rungs,
  not 10; digit rules use `d mod 6`. Ten distinct rungs would need Very
  high resolution (~17 s/run) — not worth it in a lecture hall.
- **[from WV-1] The wave scenes' shipped strokes are wrong for wave-watching**
  (0.20 m deep-flume default overtops the paddle at ~100% of wave celerity;
  small strokes are invisible). WV-1's worksheet fixes stroke per period
  (amp ≈ 0.087·L(T), capped 0.30 m). Check `amp·ω ≪ c` before trusting any
  flume default. waveshallow's flat bed is only 3.7 m paddle-to-beach-toe,
  short against L = 5.4–11 m at T = 3–6 s: expect −15…−20% L bias at the
  top of the range (documented in WV-1; affects WV-2/B6 planning).
- **[from UN-3] Instrument surge shafts on the gauge's DEPTH field, not
  head** — the piezometric head channel superposes the fast 4L/c Joukowsky
  wave (±6 m) on the slow mass oscillation (3 m) and buries it; depth
  reads the shaft level cleanly. Corollary to the ring-buffer rule: slow
  events need the speed slider UP (×2), not down.
- **[from CS-1] The per-column q is HORIZONTAL flux — falling water reads
  ≈ 0.** Never instrument a nappe/overfall with the column q; detect
  spills by level (gauge ≥ crest + 1 cell) and measure overfall discharge
  upstream of the brink. Also: level-controlled reservoirs deliver q
  errors through their sponge whenever the level is off the (q-dependent)
  fixed point — a reservoir cannot drive a discharge RAMP; use the spout
  for time-varying inflows and read delivered q from the hover/columns in
  a horizontal run.
- **[from LL-1v, definitive] Head has two conventions in this codebase and
  they disagree by z.** `SIM.probe(x,y).head` (and the on-screen hover
  readout, which prints it unmodified as "head p/ρg") is pressure head
  ONLY, p/ρg — confirmed in source (js/sim.js: `head: p / g`) and by a
  still-water test where two points 1.20 m apart in elevation read heads
  1.202 m apart, not equal. The Gauge tool is different: js/main.js's
  `sampleGauges()` adds each gauge's own y back before storing it
  (`head: gg.y + pr.head`), and the gauge chart plots that stored value,
  so a number read off a gauge's trace is already full piezometric head
  z + p/ρg — confirmed in the same test (two gauges 1.20 m apart in y
  agreed to 2.4 mm). Any rig comparing two pressures must either (a) use
  the Gauge tool for both taps and read the chart value, which needs no
  manual correction regardless of height, or (b) if reading probe/hover
  directly, add each point's own y by hand before differencing — never
  mix the two conventions or compare raw probe().head at different
  heights. (LL-1's shipped numbers were checked against this and stand.)
- **[from PU-1] The spout is not a pure momentum source while PRIMING** —
  `fNew = max(fNew, 1)` in the VOF pass manufactures water at ~10% of the
  local q until the spout's surroundings are full, falling to ~1% once
  primed (the sump then genuinely drains). Any spout-driven demo (PU-1,
  HP-2, MO-2) must include a shared priming minute and never read Q during
  priming. PU-1's waste chute also floods catastrophically at spout
  v = 4.0 m/s — respect the documented ceiling.
- **[from NC-2] The rake chip is UNSMOOTHED** — same-station u_max/V reads
  swing 3–4× within seconds on turbulent scenes (confirmed in source). The
  read habit is watch-then-pause (and pause-then-read-promptly per the
  ring-buffer rule). Rake yields 22–30 vertical points at Medium.
- **[from HP-1] A jet-core probe is blind to wall friction** — the core of
  a free jet reads √(2gH) even while the pipe's HGL is visibly dropping;
  only form losses (drawn plates) show up in a core velocity. Any demo
  inferring losses from a jet probe must make its losses form losses, or
  probe the HGL directly with gauges.
- **[from MO-1] The hover readout lies within ~3 cells of a structure** —
  measured 2.3× the true depth with a reversed Fr sign next to a gate (a
  smoothing-window artifact), plus a spurious "pressurised" tag on free
  jets. Every worksheet station rule should keep reads ≥6 cells from any
  wall/gate/plate face (MO-1's vena station does). Reinforces P1/P6.
- **[from QS-2, affects any paused read] The gauge chart's history is a
  900-sample ring buffer that the RENDER loop keeps filling while paused** —
  a paused trace is fully overwritten ~8 s after pausing. Read or
  screenshot a trace immediately on pausing, or read live; worksheets that
  say "pause and read the trace" must say "promptly". The buffer spans
  ~15 real-time seconds × the speed setting in sim time — at ×0.05 that is
  only 0.75 sim-s (UN-2 measured), so slow-motion reads must budget it.
- **[from WV-2, affects every gauge-trace demo] Scenes with a `spinup`
  value run flat-out ignoring dt/speed until sim.t clears it** — recording
  gauge history via APP.frames() before that gives wildly uneven sample
  spacing (0.17–0.52 s gaps vs 1/60 s) and meaningless amplitudes. Always
  clear scene.spinup with a plain APP.tick() call BEFORE any frames-loop
  recording. (Students are unaffected — they wait out the on-screen
  countdown, which is the same rule.)
- **[from NC-1] `SIM.columns().surf` is quantised to whole grid cells**
  (FS_COL reduction) — fine for profile shapes, useless for small level
  differences. The continuous path is `SIM.probe().head` (what gauges
  read). Any measurement of mm-scale falls must use probe/gauge, and even
  that carries a 0.5–1.2 mm noise floor after 20 s averaging.
- **[from GV-1] The cursor-printed delivered n is EGL-noise-prone**: single
  reads at one station ranged 0.009–0.069 (7×); two independent long
  windows still disagreed 0.0335 vs 0.0439. Any exercise that USES n
  (NC-1's conveyance, UF-1's back-calculation, GV-1's direct step) must
  median it over a long window — or, better, back-calculate it from stable
  quantities (UF-1's y_n route was 30× tighter). m1's surface itself is the
  calm counter-example: station reads repeat to 5 decimals, single frames
  jump at most one grid cell (13 mm quantisation).
- **[from LL-1] Near any geometry change, tap pressure near a WALL, never
  the centreline** — the section is non-hydrostatic for several
  step-heights (±0.28 m swing over height; a centreline tap sign-flipped
  the Borda–Carnot recovery). Difference measurements (h_L = small gap of
  two large heads) need 20–24 s read windows, roughly double the
  single-head habit. Applies to LL-2, PU-1, B10 and any drawn-fitting rig.
- **[from HJ-1 remeasure] The h23 jump box flutters** — single-frame reads
  of one settled run ranged Fr₁ 1.4–2.5, and it can show 2–3 simultaneous
  jump detections. Worksheets teach "median of the wobble over ~10 s";
  Blackboard spot-checks MUST use the same median-window protocol, and the
  generous (±15%-ish) engagement tolerance is load-bearing, not padding.
  Class scatter around Bélanger (±~17%) is honest physics and is itself
  the discussion material.
