"use strict";
/**
 * exercises.js — the teaching pack as data.
 *
 * Forty verified demos live in `exercises/<folder>/README.md`, each with a
 * lecturer setup, a student worksheet and a verification record. This file is
 * the machine-readable half of that: enough to put a student in front of the
 * SAME correctly-plumbed rig as everybody else, and to tell them what their own
 * numbers are. The README stays authoritative for everything a human needs to
 * read, and every card links to it.
 *
 * Every number here is the SHIPPED value from the demo's own README —
 * remeasured constants, not the ones the original programme sheet promised.
 * Several rules changed during verification (HJ-1's q floor moved from 0.30 to
 * 0.42 because 0.30 drowned; B10's level rule was trimmed to `d mod 6`;
 * HP-1's whole rig became a drawn throttle) and it is the amended rule, cross
 * -checked against `exercises/CHANGES-NEEDED.md` §2b, that appears below.
 *
 * THE LINE THIS FILE DRAWS — read before adding a value
 * ----------------------------------------------------
 * The picker gives every student an identical STARTING POINT and the correct
 * INFORMATION for their exercise. It does not do the exercise. A student who
 * sets their tailwater below critical depth gets a drowned jump and learns
 * something; padding that away would be teaching nothing. So each value belongs
 * to exactly one of four fields, and the split is the whole point of the
 * schema:
 *
 *   rigParams      APPLIED. The plumbing without which the rig is not a
 *                  physically working rig: the resolution the geometry was
 *                  captured at, the open/closed edges, which supplies and
 *                  controls exist, and the levels/constants a README documents
 *                  as load-bearing (FR-1's 2.50 m tailwater, DA-2's 0.04 m
 *                  draining apron, QS-2's C_s = 0.40). CONTROLS ids → values;
 *                  key ORDER matters, because ticking a level control opens its
 *                  own edge, so edges come first.
 *   viewParams     APPLIED. Display and readout only — Field, Gauges plot,
 *                  the overlays, Speed, tracers, dye. These set no physics and
 *                  give nothing away; they are how the demo is meant to be
 *                  LOOKED at (UN-3 is unreadable on the Head channel).
 *   studentParams  DISPLAYED, NEVER APPLIED. Values the worksheet asks the
 *                  student to set, that no digit rule covers — a staged step
 *                  (B9's two level controls), a per-scale start level (DA-2's
 *                  h_start), an assigned cell (B5). Each is
 *                  {control, value?, unit?, rule?}.
 *   digit          DISPLAYED, NEVER APPLIED (with one exception, below). The
 *                  personalised parameter: `base` + `step`·d, or a per-digit
 *                  `table` where the measured rule is not linear, `mod: N` for
 *                  "d mod N" rules, `also: [...]` for the coupled values the
 *                  worksheet makes them derive, `rule` for the sentence that
 *                  says WHY (HJ-1's 1.3·y_c). The card prints "your q = 0.51 —
 *                  set it on the Inflow q slider"; the slider is not written.
 *
 * The exception: `rigTable` picks WHICH captured drawing loads, because DA-1's
 * λ = ¼ weir is a different rig, not a different number, and nobody is going to
 * hand-draw it. Geometry is part of the common starting point.
 *
 * OTHER FIELDS
 *   id       programme id, e.g. "HJ-1"           title    the README's own h1
 *   topic    grouping for the menu               folder   exercises/<folder>/
 *   scene    a SCENES key, or "sandbox"
 *   rig      null, or a key into EXERCISE_RIGS (js/exercises-rigs.js). A rig
 *            pointer with no pack loaded is not an error: the scene and the
 *            settings still apply and the card says to draw the rig from the
 *            README.
 *   instruments  where the gauges and rakes GO, as instructions — the picker
 *            places none of them (and clears any a rig payload carried),
 *            because choosing where to measure is part of every one of these
 *            exercises. {tool, where, why}.
 *   digitNote  printed verbatim where the personalised thing is drawn geometry
 *            or a station on screen — there is no control to set.
 *   setup    the ordered sequence a snapshot cannot hold ("fill it, THEN shut
 *            the valve"). Steps for the student to follow, never automated.
 *   task     what the student does and reads    submit   what goes on Blackboard
 *   settle   sim-seconds to wait, from the demo's verification record. The
 *            picker runs the solver flat out for this long, exactly as a
 *            scene's own `spinup` does, so it is not a wall-clock wait.
 *   notes    the one measurement caution that most often costs a wrong number.
 *
 * Standing rules every worksheet carries: Resolution Medium · wait out the
 * settle · median-of-the-wobble reads, never one frame · after changing q,
 * re-check any tailwater ≥ 1.3·y_c · keep the tab visible.
 */
const EXERCISES = [

  // ------------------------------------------------------- open channel
  {
    id: "UF-1",
    title: "Normal depth scales as q^(3/5)",
    topic: "Uniform flow",
    folder: "UF-1-normal-depth",
    scene: "s2",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true },
    digit: { label: "q", control: "inQ", base: 0.80, step: 0.04, unit: "m²/s",
             rule: "q = 0.80 + 0.04·d" },
    task: "Set your q, then hover mid-chute at x ≈ 3.5 m and read the MEASURED normal depth y_n off the hover box (the green dashed line). Post q and y_n; pooled, the class draws y_n ∝ q^0.6.",
    submit: ["q", "y_n"],
    settle: 26,
    notes: "Read the y_n (measured) row, not the raw depth h — a roll wave sitting on your column swings raw depth 26% peak-to-trough while y_n holds within 1%.",
  },
  {
    id: "GV-1",
    title: "The class digitises the backwater curve",
    topic: "Gradually varied flow",
    folder: "GV-1-backwater",
    scene: "m1",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true, labels: true },
    digitNote: "your station: x = 1 + d metres (d = 0 → 1 m … d = 9 → 10 m; a class over ten takes x = 11, 12, 13 m)",
    task: "Hover at your own chainage on the settled M1 pool and read the depth off the profile box, then add that station's bed elevation from the worksheet card and post the SURFACE elevation. Touch nothing on the panel — q and the reservoir level are the experiment.",
    submit: ["x (m)", "surface elevation (m, 3 d.p.)"],
    settle: 30,
    notes: "The box prints depth, not elevation — the bed-elevation card is the whole conversion; at x = 13 m you are inside the weir's guard band and step 7a applies.",
  },
  {
    id: "GV-2",
    title: "Profile safari",
    topic: "Gradually varied flow",
    folder: "GV-2-profile-safari",
    scene: "sandbox",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true, labels: true, jumps: true },
    digitNote: "no digit — personalisation is geometric: every rig is drawn by hand, and two identical screenshots count once",
    task: "Twenty minutes in pairs: draw beds, gates, weirs and tailwaters and bag as many distinct, correctly-labelled GVF chips as you can, screenshotting chip plus geometry each time. Score M1/M2/H2 = 1, M3/S1/S2/S3/H3 = 2, A2 = 3, A3 and the C-family = 5.",
    submit: ["score", "classes claimed", "one screenshot each"],
    settle: 0,
    notes: "A chip only counts if it holds ~10 s, and any chip within ~0.3 m of a gate, weir or truncation is suspect — a fully drowned control can flip the LETTER (a drowned gate on a 1-in-4 bed read M1 end to end).",
  },
  {
    id: "HJ-1",
    title: "Bélanger from a room full of flumes",
    topic: "Hydraulic jump",
    folder: "HJ-1-belanger",
    scene: "h23",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { jumps: true },
    digit: { label: "q", control: "inQ", base: 0.42, step: 0.03, unit: "m²/s",
             rule: "q = 0.42 + 0.03·d",
             also: [{ label: "tailwater", control: "twLevel", unit: "m",
                      // 1.3·y_c everywhere except d = 6 and d = 9, which need
                      // 1.5·y_c to stop the reading pumping (measured).
                      rule: "1.3 · y_c (1.5 · y_c at d = 6 and 9) — check it yourself against the y_c the q slider prints",
                      table: [0.490, 0.507, 0.522, 0.538, 0.553,
                              0.567, 0.648, 0.596, 0.610, 0.700] }] },
    secondScene: { scene: "s1", when: "Optional coda, three volunteers (last ten minutes): switch to ?scene=s1 with Scenes ▾ — the same jump on a 1-in-4 bed, q left at the scene default 1.20 m²/s and tailwater 0.95 / 1.00 / 1.05 m. Expect the measured y₂ well UNDER Bélanger: the horizontal-bed momentum balance has no weight component." },
    task: "Set your q and pair it with the tailwater the y_c rule gives, let the jump settle on the apron, then read the orange HYDRAULIC JUMP box: post the incoming Froude number and the conjugate-depth ratio y₂/y₁. Pooled, the class traces the Bélanger curve nobody solved.",
    submit: ["Fr₁", "y₂/y₁"],
    settle: 35,
    notes: "The box genuinely flutters — single frames of the same settled flow swing Fr₁ by ±25%, so take the median of a ~10 s window, never one reading. A tailwater below y_c drowns the jump: y₂ then reads far above the momentum prediction, which is the diagnosis, not a bug.",
  },

  // ---------------------------------------------------- natural channels
  {
    id: "NC-1",
    title: "Slope-area method: estimate the mystery discharge",
    topic: "Natural channels",
    folder: "NC-1-slope-area",
    scene: "m3",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true, gaugeField: "head" },
    digitNote: "your window: x₀ = 5.0 + 0.5·(d mod 8) metres, window [x₀, x₀+7] m, midpoint x₀+3.5",
    instruments: [
      { tool: "gauge", where: "x = x₀ (your own window's upstream end)", why: "head at the top of the reach" },
      { tool: "gauge", where: "x = x₀ + 7 m", why: "head at the bottom — F is the fall between the two" },
    ],
    task: "With the Controls panel CLOSED (q is the mystery), drop gauges at x₀ and x₀+7, read the head fall F between them and h and n at the midpoint, then compute K = h^(5/3)/n and Q̂ = K√(F/L) — plus one velocity-head pass.",
    submit: ["Q̂ (m²/s)", "window x₀", "F (mm)"],
    settle: 32,
    notes: "Watch both traces for 20–30 s and take the middle: single hovers span n = 0.036–0.092 where the 20–30 s median narrows to ≈0.07. Keep the panel shut — it holds the answer.",
  },
  {
    id: "NC-2",
    title: "Is α really 1?",
    topic: "Natural channels",
    folder: "NC-2-alpha",
    scene: "s2",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true },
    digitNote: "your station: x = 1.5 + 0.5·(d mod 8) metres (d = 8, 9 repeat d = 0, 1)",
    instruments: [
      { tool: "rake", where: "your own station x", why: "the velocity–depth profile α is integrated from" },
    ],
    task: "Drop a velocity rake (tool 6) at your station, watch 15–20 s, pause on a typical moment and read u_max/V off the chip; then hand-integrate 4–5 points off the curve into α = Σu³Δy/(V³h). Leave q at the scene default.",
    submit: ["u_max/V", "α"],
    settle: 45,
    notes: "The rake chip carries no smoothing at all — α swings 3–4× within a few seconds at a fixed station, so watch-then-pause is mandatory; do not deliberately grab a near-bed point.",
  },
  {
    id: "NC-3",
    title: "Bed shear and the riprap size",
    topic: "Natural channels",
    folder: "NC-3-bed-shear",
    scene: "s2",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true },
    digit: { label: "q", control: "inQ", base: 0.80, step: 0.04, unit: "m²/s",
             rule: "q = 0.80 + 0.04·d" },
    secondScene: { scene: "m2", when: "Part B — read and compare, not submitted: open ?scene=m2 in a fresh tab (Scenes ▾ → m2), touch NOTHING on the panel, wait out the 90 s spin-up and hover at x ≈ 7 m. Expect τ₀ ≈ 50 N/m², D_min ≈ 55 mm." },
    task: "Hover at x ≈ 3.5 m, read h and S_f (printed as 1/N), then τ₀ = ρg·h·S_f and D_min = τ₀/[0.056(ρₛ−ρ)g]. Part B, not submitted: repeat on ?scene=m2 at x ≈ 7 m and compare (τ₀ ≈ 50 N/m², D_min ≈ 55 mm).",
    submit: ["τ₀ (N/m²)", "D_min (mm)"],
    settle: 26,
    notes: "h and S_f are raw single-station reads (0.9–11.7% flutter over 10 s) — take the median; on m2 the station is load-bearing, S_f triples from x = 5 to x = 11 m, so hover at x ≈ 7 m and not near the brink.",
  },

  // -------------------------------------------------- specific energy etc.
  {
    id: "FB-1",
    title: "The hump that chokes",
    topic: "Specific energy",
    folder: "FB-1-choking-hump",
    scene: "sandbox",
    rig: "FB-1",
    // The reach is doubly controlled: reservoir AND tailwater both at 1.00 m,
    // the same for everyone (the digitNote says so). Without both the hump has
    // nothing to choke against.
    rigParams: { budget: "Medium", openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, inLevel: 1.00,
                 twOn: true, twLevel: 1.00, spoutOn: false, waveOn: false },
    rigWhy: { inLevel: "1.00 m for everyone — the reach is doubly controlled and the hump has nothing to choke against without both ends held.",
              twLevel: "1.00 m for everyone, the other half of that pair." },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "q = 0.15 + 0.05·d (d = 0…8; if your last digit is 9 use d = 8)",
             table: [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.55] },
    digitNote: "q = 0.15 + 0.05·d (d = 0…8; if your last digit is 9 use d = 8). Reservoir level = tailwater level = 1.00 m for everyone.",
    instruments: [
      { tool: "gauge", where: "x = 2.5 m, y = 0.75 m", why: "the upstream depth y₁ the prediction is built on" },
    ],
    task: "Measure y₁ at the gauge and commit a prediction Δz_pred = E₁ − 1.5·y_c. Then grow a 1 m flat-topped hump at x = 4.5 m in ~7 steps, re-settling 15–30 s each, until the upstream level climbs and the crest whitens in the Froude view — that height is Δz_c.",
    submit: ["q", "y₁", "Δz_pred", "Δz_c", "Δz_pred* (re-timed)"],
    settle: 60,
    notes: "Jot y₁ at EVERY hump step: E₁ is not held fixed in this doubly-controlled reach, so the committed prediction runs ~1.9× low, while re-reading E₁ at the last step before the choke lands at 0.87–1.09×.",
  },
  {
    id: "FB-2",
    title: "Critical depth three ways",
    topic: "Specific energy",
    folder: "FB-2-yc-three-ways",
    scene: "sandbox",
    rig: "FB-2",
    rigParams: { budget: "Medium", openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, twOn: false, spoutOn: false, waveOn: false },
    viewParams: { mode: "3", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "q = 0.15 + 0.05·d (d = 0…8; 9 → use 8)",
             table: [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.55],
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "level = 0.935 + 1.65·y_c + 0.03 — the pairing the pool needs at your q",
                      table: [1.182, 1.228, 1.271, 1.310, 1.348,
                              1.383, 1.417, 1.450, 1.482, 1.482] }] },
    digitNote: "q = 0.15 + 0.05·d (d = 0…8; 9 → use 8); level = 0.935 + 1.65·y_c + 0.03, tabulated above",
    instruments: [
      { tool: "gauge", where: "x = 6.85 m, y ≈ 1.13 m", why: "on the broad crest — reads y_crest" },
    ],
    task: "Read three depths on one rig: y_c off the q slider, y_crest off the gauge on the broad crest, and y_brink by hovering the last wet column on the lip. Order them.",
    submit: ["q", "y_c", "y_crest", "y_brink"],
    settle: 55,
    notes: "At the brink hover the last column that still has solid crest under it, not the falling sheet. Expect y_crest ≈ 1.23·y_c and y_brink ≈ 0.84·y_c — not 1.00 and not the classical 0.715.",
  },
  {
    id: "WE-1",
    title: "Rating a sharp-crested weir, one point each",
    topic: "Weirs & controls",
    folder: "WE-1-sharp-weir",
    scene: "sandbox",
    rig: "WE-1",
    rigParams: { budget: "Medium", openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, twOn: false, spoutOn: false, waveOn: false },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q", control: "inQ", base: 0.10, step: 0.05, unit: "m²/s",
             rule: "q = 0.10 + 0.05·d",
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "the level paired with YOUR q — load-bearing, not a convenience (±0.1 m moves C_d by ~25%)",
                      table: [1.152, 1.195, 1.233, 1.261, 1.304,
                              1.326, 1.362, 1.389, 1.412, 1.434] }] },
    instruments: [
      { tool: "gauge", where: "x = 4.5 m, y ≈ 0.75 m", why: "the approach pool — H = h − 0.50" },
    ],
    task: "One point each on the rating curve: set your q with its paired level, settle, read the gauge card's DEPTH h at x = 4.5 m and post H = h − 0.50 with your q. Pooled log-log, the class measures the exponent (≈1.6, because C_d is not constant).",
    submit: ["q", "H"],
    settle: 60,
    notes: "The q→level pairing is load-bearing, not a convenience: ±0.1 m of level moves C_d by ~25% and makes the gauge flutter 95 mm instead of 1 mm. Read the card's depth, never the cell-quantised surface elevation.",
  },

  // ------------------------------------------------------------ momentum
  {
    id: "MO-1",
    title: "Sluice gate: thrust and C_d from the control volume",
    topic: "Momentum",
    folder: "MO-1-gate-cv",
    scene: "sandbox",
    rig: "MO-1",
    // q = 0.330 is the same for every student (the digitNote says so) and the
    // gate has nothing to meter without it; the LEVEL is the personalised
    // fixed point for that q, so it is the student's to set.
    rigParams: { budget: "Medium", openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, inQ: 0.33,
                 twOn: false, spoutOn: false, waveOn: false },
    rigWhy: { inQ: "q = 0.330 for the whole class — your gate opening and the level that pairs with it are the personalisation." },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "reservoir", control: "inLevel", unit: "m",
             rule: "the fixed point for q = 0.330 at YOUR gate opening",
             table: [1.7565, 1.7565, 1.4181, 1.4181, 1.4181,
                     1.2103, 1.2103, 1.2103, 1.0791, 1.0791] },
    digitNote: "your gate opening is DRAWN: a_cells = 5 + round(3d/9) → d 0,1 → 5 cells (gate bottom y = 0.609) · 2,3,4 → 6 cells (0.630) · 5,6,7 → 7 cells (0.652) · 8,9 → 8 cells (0.674). q = 0.330 for everyone; each level is the fixed point for that q.",
    instruments: [
      { tool: "gauge", where: "x = 3.5 m, y ≈ 0.65 m", why: "the upstream pool — reads y₀" },
    ],
    task: "Read y₀ off the upstream gauge and y₁ by hovering the vena at x = 5.630 m, then C_d = q/(a√(2gy₀)) and F_R = ρq(V₀−V₁) + ½ρg(y₀²−y₁²).",
    submit: ["a", "y₀", "y₁", "C_d", "F_R"],
    settle: 70,
    notes: "Hover ONLY at x = 5.630 m (6 cells past the gate): on or within ~3 cells of it the box reads 2.3× the true depth and even calls the accelerating jet subcritical. Ignore the profile chip near a control.",
  },
  {
    id: "MO-2",
    title: "Jet on a plate, jet on a vane",
    topic: "Momentum",
    folder: "MO-2-jet-vane",
    scene: "sandbox",
    rig: "MO-2",
    // The jet IS the rig, and nothing here is personalised — everyone reads the
    // same one — so the spout is part of the common starting point.
    rigParams: { budget: "Medium", openL: "0", openR: "0", openB: "1", openT: "0",
                 spoutOn: true, spoutR: 0.09, spoutVx: 4.5, spoutVy: 0 },
    viewParams: { mode: "2", channel: false, labels: false, jumps: false, gaugeField: "head" },
    digitNote: "no personalised parameter — everyone reads the same rig, and the pooled plot is a histogram of read-to-read wobble",
    instruments: [
      { tool: "gauge", where: "in the free jet, ~0.25 m clear of the plate (README uses 0.95, 2.50)", why: "the approach head" },
      { tool: "gauge", where: "on the stagnation point, ~0.03 m off the plate face (README uses 1.32, 2.46)", why: "the stagnation head — the ratio is the answer" },
    ],
    task: "Redraw the deflector four ways — flat plate, 45° ramp, 90° corner, deep-V — settling 3–5 s each, and watch the force change with the turn angle. Switch Field → Momentum flux to see red → white → blue as θ grows.",
    submit: ["stagnation ratio (optional)"],
    settle: 5,
    notes: "Read head from a GAUGE, not the hover line: the probe's head is pressure-only and omits elevation. Expect a stagnation ratio of 1.17–1.30, not 1 — teach the annotated bias.",
  },

  // ------------------------------------------------------- pipes & losses
  {
    id: "FR-1",
    title: "The friction law without the Moody chart",
    topic: "Pipe flow & losses",
    folder: "FR-1-friction-law",
    scene: "sandbox",
    rig: "FR-1",
    // The 2.50 m tailwater is the one addition RIG-A needs to be a working
    // rig at all (README §5: without it the pipe empties and the run dies).
    rigParams: { budget: "Medium", spoutOn: false, openB: "0", openR: "1",
                 inflowOn: true, inFree: true, inLevel: 2.50,
                 twOn: true, twLevel: 2.50, cs: 0.40 },
    rigWhy: { inLevel: "the bench idles with NO driving head — reservoir level = tailwater, so the duct sits charged and still. Deliberately off the personalised ladder (3.30 m up): supplying the head is your first move.",
              twLevel: "RIG-A's one addition: without a tailwater in (2.40, 2.69) the pipe empties and the run dies (README §5)." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.30, step: 0.13, unit: "m",
             rule: "level = 3.30 + 0.13·d" },
    instruments: [
      { tool: "gauge", where: "x = 4.0 m, y = 2.20 m", why: "H₁, mid-height in the bore and clear of the entry region" },
      { tool: "gauge", where: "x = 8.5 m, y = 2.20 m", why: "H₂ — L = 4.5 m, not 6 (README §5)" },
    ],
    task: "One (V, h_f) point each on a 0.40 m pressurised duct: set your own reservoir level, place the two gauges (x = 4.0 and 8.5, L = 4.5 m) for h_f = H₁ − H₂ and hover mid-pipe for the bore-mean V. Pooled log-log, the class fits THIS pipe's friction law.",
    submit: ["level", "H₁", "H₂", "V"],
    settle: 22,
    notes: "V must come from the hover readout's bore-mean V line — never a point speed, which swings ±40%. H₁/H₂ are the value the trace is CENTRED on, not the instantaneous header.",
  },
  {
    id: "LL-1",
    title: "Borda–Carnot at a sudden expansion",
    topic: "Pipe flow & losses",
    folder: "LL-1-borda-carnot",
    scene: "sandbox",
    rig: "LL-1",
    rigParams: { budget: "Medium", spoutOn: false, openB: "0", openR: "1",
                 inflowOn: true, inFree: true, inLevel: 2.95,
                 twOn: true, twLevel: 2.95, cs: 0.40 },
    rigWhy: { inLevel: "the bench idles with NO driving head — reservoir level = tailwater, so the duct sits charged and still, off the personalised ladder (3.45 m up).",
              twLevel: "holds the wide leg full — without it the expansion has no downstream pressure to recover into." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.45, step: 0.035, unit: "m",
             rule: "level = 3.45 + 0.035·d" },
    instruments: [
      { tool: "gauge", where: "x = 3.4 m, y = 2.20 m", why: "H₁, in the 0.40 m bore upstream of the step" },
      { tool: "gauge", where: "x = 7.6 m, y = 2.10 m", why: "H₂ — LOW in the wide pipe; a centreline tap sign-flips the recovery" },
    ],
    task: "On a pipe that steps 0.40 → 0.80 m at x = 3.80 m, hover either side for V₁ and V₂ and read H₁/H₂ off the two gauges, then h_L = (V₁²−V₂²)/2g − (H₂−H₁) against Borda–Carnot's (V₁−V₂)²/2g.",
    submit: ["h_L", "Borda–Carnot", "V₁", "V₂", "H₁", "H₂"],
    settle: 20,
    notes: "Gauge 2 must sit LOW in the pipe (y = 2.10): the section is still non-hydrostatic 9–11 step-heights past the expansion, and a centreline tap sign-flips the pressure recovery. h_L is a difference of differences — read ≥ 20 s.",
  },
  {
    id: "LL-2",
    title: "Find the throttle",
    topic: "Pipe flow & losses",
    folder: "LL-2-find-throttle",
    scene: "sandbox",
    rig: "LL-2",
    // 3.90 m is the one shared level for every pair — the personalisation is
    // partner A's hidden stroke, not a slider.
    rigParams: { budget: "Medium", spoutOn: false, openB: "0", openR: "1",
                 inflowOn: true, inFree: true, inLevel: 3.90,
                 twOn: true, twLevel: 2.50, cs: 0.40 },
    rigWhy: { inLevel: "3.90 m is the one shared level for every pair — the personalisation is A's hidden stroke, not a slider.",
              twLevel: "without it the pipe empties (RIG-A, FR-1 README §5)." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digitNote: "personalised by partner A's own hidden stroke, not a digit: one short vertical wall from the invert (y ≈ 2.00) up to a height A chooses between y = 2.04 and 2.07, at an x A chooses between 4.6 and 7.0 m. Reservoir level is 3.90 m for every pair.",
    instruments: [
      { tool: "gauge", where: "four gauges walked along the covered run, EVERY one at y = 2.35", why: "near the soffit — the HGL kink is what you are hunting" },
    ],
    task: "In pairs. A draws a hidden 2–3 cell obstruction in the covered pipe; B walks four gauges along it in three 20 s rounds — coarse scan, one bisection, then a symmetric ±0.3 m centring read — to bracket the HGL kink and size it.",
    submit: ["x_found", "k_L"],
    settle: 20,
    notes: "Every gauge at y = 2.35 (near the soffit), no exceptions, and subtract the background friction (0.050 m/m × your gap): it is 11–28% of the raw reading, and a slope measured next to the fault reads ~2× steep from the fault's own backwater.",
  },
  {
    id: "PU-1",
    title: "System curve measured, operating point kept honest",
    topic: "Pumps & systems",
    folder: "PU-1-system-curve",
    scene: "sandbox",
    rig: "PU-1",
    // The spout is deliberately NOT ticked on: the rig loads in its
    // pre-priming state and the sequence below is the experiment.
    rigParams: { budget: "Medium", openL: "0", openR: "0", openB: "1", openT: "0",
                 spoutOn: false, spoutR: 0.15, spoutVy: 0 },
    rigWhy: { spoutOn: "off, as setup step 1 says — the sandbox's own spout is ON by default and would rain into the sump before you are ready. Ticking it is step 2." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    studentParams: [
      { control: "spoutOn", value: true, rule: "step 2 — tick it to rain into the sump, then move it into the bore as the pump" },
    ],
    digit: { label: "spout velocity", control: "spoutVx", base: 1.5, step: 0.09, unit: "m/s",
             rule: "vx = 1.50 + 0.09·d — set it only AFTER the shared 2.2 m/s priming step" },
    setup: ["The rig loads with the spout OFF — a snapshot cannot hold a priming sequence.",
            "Tick Top-left spout and rain into the sump for ~7 s.",
            "Move the spout to (2.0, 0.60) with the Spout tool and set its velocity → to 2.2 m/s; leave it ~55 s until the tank spills. This shared priming step is not optional.",
            "Now set YOUR digit's spout velocity and let it re-settle."],
    instruments: [
      { tool: "gauge", where: "x = 3.0 m, y = 0.60 m", why: "the flange, 1.0 m downstream of the pump" },
      { tool: "gauge", where: "x = 0.9 m, y = 1.0 m", why: "the sump's open water — H is gauge 1 minus gauge 2" },
    ],
    task: "Prime the drawn rising main (the shared 2.2 m/s step until the tank spills), then set your own spout velocity and read Q by hovering the low-run bore and H as gauge 1 minus gauge 2. One point each on the system curve.",
    submit: ["Q", "H"],
    settle: 10,
    notes: "Read GAUGES, never the hover head line — probe head is pressure-only and omits elevation. The shared priming step is not optional: cold-starting at your own low digit is still climbing after 87 s.",
  },
  {
    id: "B10",
    title: "Lift the crest until the pipe gives up",
    topic: "Pipe flow & losses",
    folder: "B10-crest-vs-hgl",
    scene: "sandbox",
    rig: "B10",
    rigParams: { budget: "Medium", spoutOn: false, openB: "0", openR: "1",
                 inflowOn: true, inFree: true, inLevel: 2.50,
                 twOn: true, twLevel: 2.50, cs: 0.40 },
    rigWhy: { inLevel: "the bench idles with NO driving head — reservoir level = tailwater, so the duct sits charged and still, off the personalised ladder (3.30 m up).",
              twLevel: "without it the pipe empties (RIG-A, FR-1 README §5)." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.30, step: 0.13, mod: 6, unit: "m",
             rule: "level = 3.30 + 0.13·(d mod 6)" },
    instruments: [
      { tool: "gauge", where: "x = 3.7 m, y = 2.20 m", why: "upstream of the hump station" },
      { tool: "gauge", where: "x = 8.0 m, y = 2.20 m", why: "downstream — interpolate the HGL at the crest between the two" },
    ],
    task: "Settle the flat pipe and interpolate the HGL at the hump station from the two gauges, then walk the crest soffit up — 3-cell steps, then 1-cell — until the crown pressure head drops below 0.02 m. That height is z_sep.",
    submit: ["level", "z_sep", "hgl_crest"],
    settle: 12,
    notes: "12 s re-settle per step is load-bearing — at 7–8 s the trigger fires on a transient and the ladder ends 1–3 cells early. Read z_sep going UP only; the air pocket persists 8 cells below onset coming down.",
  },

  // ---------------------------------------------------------- hydropower
  {
    id: "HP-1",
    title: "Maximum power transmission — the class finds h_f = H/3",
    topic: "Hydropower",
    folder: "HP-1-penstock-power",
    scene: "hammer",
    rig: "HP-1",
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2" },
    digitNote: "your nozzle gap (DRAWN): gap = {0.42, 0.70, 0.84, 0.97, 1.10} m by d mod 5. Every physics slider stays at the scene default — this demo dials nothing.",
    task: "Draw the fixed 0.70 m penstock throttle at x = 8.0 m and your own nozzle at x = 56.5 m, then hover mid-pipe for q and read the jet core speed in the Speed view at x ≈ 57 m. Pooled, the power peak lands where h_f = H/3.",
    submit: ["gap", "q", "v"],
    settle: 50,
    notes: "Do not read before t = 50 s: the bore settles in ~15 s but the JET does not, and reading at 25 s gives v ≈ 15% high — which puts your point on the wrong side of the peak.",
  },
  {
    id: "HP-2",
    title: "The Pelton principle without the wheel",
    topic: "Hydropower",
    folder: "HP-2-pelton",
    scene: "sandbox",
    rig: "HP-2",
    rigParams: { budget: "Medium", openL: "0", openR: "0", openB: "1", openT: "0",
                 spoutOn: true, spoutR: 0.09, spoutVx: 4.5, spoutVy: 0 },
    viewParams: { mode: "2", channel: false, labels: false, jumps: false, gaugeField: "head" },
    digitNote: "lecturer demo on the shared MO-2 jet rig — no personalised parameter and no mandatory submission",
    instruments: [
      { tool: "gauge", where: "in the free jet and again on the stagnation point (MO-2's two stations)", why: "head, if you want the ratio as well as the force" },
    ],
    task: "Run the two bookends of the jet rig — flat plate, then the capped deep-V — and compute F = ρqv(1 − cos θ) on the board: ≈3 480 N/m flat against ≈6 840 N/m for the deep-V, the factor ~2 a Pelton bucket is built to collect.",
    submit: [],
    settle: 5,
    notes: "The momentum-flux colour is normalised against vmax: it is an honest SIGN, not a speedometer. The 160–165° turn was measured as a velocity vector, not read off the colour.",
  },

  // ------------------------------------------------------- unsteady flow
  {
    id: "UN-1",
    title: "The class discovers the celerity",
    topic: "Water hammer",
    folder: "UN-1-celerity",
    scene: "hammer",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { speed: 0.2, gaugeField: "head" },
    digitNote: "your nozzle gap (DRAWN): gap = 0.14 × (1 + (d mod 6)) m — erase the shipped plate and redraw it in two pieces, y = 2.0 → 3.5 − gap/2 and y = 3.5 + gap/2 → 5.0. c = 70 m/s for the whole class.",
    instruments: [
      { tool: "gauge", where: "x = 30 m, y = 3.5 m", why: "mid-pipe, on the axis — reads H₀ then the plateau H₁" },
    ],
    task: "Read the bore-mean V mid-pipe as v₀ and the gauge head as H₀, then press V to slam the valve and pause on the first flat top for H₁. ΔH = H₁ − H₀; pooled, the class's slope IS the celerity.",
    submit: ["v₀", "ΔH"],
    settle: 15,
    notes: "Read the PLATEAU, not the ringing spike on the wave front (10% high at the smallest gap, 41% at the largest), and take v₀ from the hover's bore-mean V, never a point speed.",
  },
  {
    id: "UN-2",
    title: "Flow establishment: the asymptotic start",
    topic: "Water hammer",
    folder: "UN-2-establishment",
    scene: "hammer",
    rig: null,
    rigParams: { budget: "Medium", bulk: 0.30 },
    rigWhy: { bulk: "not the shipped 0.03: a level jump on a shut pipe otherwise rings for 30+ s and wrecks the read (CHANGES-NEEDED §2b)." },
    viewParams: { speed: 0.20, gaugeField: "speed" },
    digit: { label: "reservoir level", control: "inLevel", base: 22.0, step: 0.6, unit: "m",
             rule: "level = 22.0 + 0.6·d" },
    instruments: [
      { tool: "gauge", where: "x = 30 m, y = 3.5 m", why: "mid-pipe — the speed trace you time t_90 on" },
    ],
    task: "Shut the valve (V), set your level, press R and let the tank settle, then open the valve and watch the speed trace climb: read the settled band as u_max and the first crossing of 0.9·u_max as t_90.",
    submit: ["u_max", "t_90"],
    settle: 10,
    notes: "Do not trust the first spike — the point gauge over-reads the bore mean by +36 to +120% during the rise (a wave-front arrival at t ≈ 0.36 s). Read the settled band, not any single instant.",
  },
  {
    id: "UN-3",
    title: "Surge tank: measure y_max against the ODE",
    topic: "Water hammer",
    folder: "UN-3-surge-tank",
    scene: "hammer",
    rig: "UN-3",
    // Wave damping 0.03 and the 12.0 m reservoir are the rig's own; the Depth
    // channel and ×2 speed are how the mass oscillation is readable at all.
    rigParams: { budget: "Medium", inLevel: 12.0, bulk: 0.03, cel: 70 },
    rigWhy: { inLevel: "the scene-default 25 m fails containment — 31.7 m of head at b_s ≈ 1 m.",
              bulk: "0.03, the shipped value: 0.30 throttles the nozzle by 33% and corrupts the decay.",
              view: "Depth, because the Head channel's ±6 m Joukowsky wave buries the 3 m mass oscillation; ×2 or the chart buffer holds only one crest." },
    viewParams: { gaugeField: "depth", speed: 2 },
    digitNote: "your standpipe width (DRAWN): b_s = 0.70 + 0.14·d metres (delivered 0.688 … 1.927 m = 5 … 14 cells). Submit the DELIVERED width, not the target.",
    instruments: [
      { tool: "gauge", where: "in the standpipe shaft, x ≈ 53 m, y ≈ 6 m", why: "the mass oscillation — y_max is its first crest minus h₀" },
    ],
    task: "Fit the nozzle, punch the tee and build your standpipe, drop a gauge in the shaft, then slam the valve and read y_max (first crest minus h₀) and the crest-to-crest period T off the Depth trace.",
    submit: ["b_s", "y_max", "T"],
    settle: 60,
    notes: "Gauges plot MUST be Depth — the Head channel carries a ±6 m, 2.1 s Joukowsky wave that buries the 3 m mass oscillation. Leave wave damping at 0.03 and run at Speed ×2 or the buffer holds only one crest.",
  },
  {
    id: "B1",
    title: "T = 4L/c with your own valve",
    topic: "Water hammer",
    folder: "B1-period-4Lc",
    scene: "hammer",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { gaugeField: "head", speed: 0.3 },
    digitNote: "your valve station (DRAWN): x_d = 12 + 4·d metres, one shift-drag from y ≈ 1.8 to 5.2; L = x_d − 6, and your gauge always goes at x_d − 3.",
    instruments: [
      { tool: "gauge", where: "x = x_d − 3 (three metres upstream of YOUR OWN valve), y ≈ 3.5 m", why: "read near the reservoir instead and the sponge smears the trace" },
    ],
    task: "Draw your own valve, check it seals, gauge 3 m upstream of it, then slam it and pause on four consecutive peaks: T is the median of the three gaps. Pooled against L, the slope is 4/c.",
    submit: ["x_d", "T"],
    settle: 13,
    notes: "The gauge must be 3 m upstream of YOUR OWN valve — read near the reservoir and the sponge smears the trace into a double hump that mis-times the period by up to 50%.",
  },
  {
    id: "B2",
    title: "The flexible pipe, via the c slider",
    topic: "Water hammer",
    folder: "B2-flexible-pipe",
    scene: "hammer",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { speed: 0.2, gaugeField: "head" },
    studentParams: [
      { control: "cel", unit: "m/s", rule: "leg 1 at the scene's own c = 70, then set c = 140 for leg 2 — the celerity is the experiment, not a personalisation" },
    ],
    digitNote: "your nozzle gap (DRAWN): gap = 0.14 × (1 + (d mod 6)) m, exactly as UN-1. The celerity is NOT personalised — everyone runs both legs, c = 70 then c = 140.",
    instruments: [
      { tool: "gauge", where: "x = 30 m, y = 3.5 m", why: "mid-pipe — the same station for both legs" },
    ],
    secondScene: { scene: null, when: "The second leg is the SAME scene, not another one: reopen the valve, set Slot celerity c = 140, press R, re-settle, re-read v₀ and slam again. Scale the post-slam wait and the read window by 70/c." },
    task: "Slam at c = 70 and read ΔH₇₀; reopen, set Slot celerity c to 140, reset, re-settle, re-read v₀ and slam again for ΔH₁₄₀. The ratio is the pipe material.",
    submit: ["ΔH₇₀", "ΔH₁₄₀"],
    settle: 13,
    notes: "Scale the post-slam wait AND the read window by 70/c — at c = 140 the plateau is only ≈0.3–0.4 s wide and arrives sooner, so a c = 70 wait lands past it and returns nonsense.",
  },
  {
    id: "B3",
    title: "Dam break: the moving jump",
    topic: "Unsteady flow",
    folder: "B3-dambreak",
    scene: "dambreak",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { speed: 0.15 },
    digitNote: "your bore station pair: x₁ = 3.0 + 0.5·d m and x₂ = x₁ + 1.5 m. The negative wave is deliberately NOT personalised — everyone uses the fixed station x = 1.0 m.",
    task: "Pull the dam (V) and time the surface at x = 1.0 m dropping clearly below its still-water mark for the negative wave, then reset and time the bore front between your own x₁ and x₂.",
    submit: ["x₁", "x₂", "v_negwave", "v_bore"],
    settle: 0,
    notes: "Do not pause on the first flicker at x = 1.0 m — a small-threshold read locks onto the sub-millimetre ≈24 m/s acoustic precursor, not √(gh₀). Wait for an unambiguous ≈0.15 m gap.",
  },

  // -------------------------------------------------------- quasi-steady
  {
    id: "QS-1",
    title: "Predict the drain, then run it",
    topic: "Quasi-steady flow",
    folder: "QS-1-drain-predict",
    scene: "jet",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { speed: 0.15, gaugeField: "head" },
    digitNote: "your level pair: η₁ = [1.98, 2.09, 2.20, 2.31, 2.62, 2.73, 2.84, 2.95, 3.04, 3.11] m by digit, η₂ = 1.80 m for everyone (the gap at d = 3→4 dodges a post-shutoff seiche). h = η − 1.36 m.",
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, y = 1.0 m", why: "low enough to stay submerged all the way down to η₂; on Head it reads the surface elevation directly" },
    ],
    task: "Predict FIRST on paper: t = (2A/(C_d·a·√2g))(√h₁−√h₂) with A = 1.90 m, a = 0.12 m, C_d = 0.61×0.97. Then drop a gauge low in the tank, switch the spout OFF and time the fall from η₁ to η₂ on the status-bar clock.",
    submit: ["t_pred", "t_meas"],
    settle: 55,
    notes: "Never time off the gauge chart's scrolling window — it only holds 15×speed sim-seconds. Pause on the live gauge number and read the status-bar clock.",
  },
  {
    id: "QS-2",
    title: "Two reservoirs finding a level",
    topic: "Quasi-steady flow",
    folder: "QS-2-twin-tanks",
    scene: "sandbox",
    rig: "QS-2",
    // C_s = 0.40 is load-bearing (at the stock 0.16 the tanks equalise in
    // 2–6 s); the reservoir is on so the fill in step 2 has a source.
    rigParams: { budget: "Medium", spoutOn: false, cs: 0.40,
                 openL: "0", openR: "0", openB: "0", openT: "0",
                 inflowOn: true, inQ: 0, inLevel: 2.00 },
    rigWhy: { cs: "load-bearing, not cosmetic: at the stock 0.16 the tanks equalise in 2-6 s and there is nothing to time.",
              inLevel: "the fill source for step 2, the same 2.00 m for everyone; step 3 unticks it again." },
    viewParams: { gaugeField: "head", mode: "0" },
    digitNote: "your second tank's width (DRAWN): A₂ = 0.50 + 0.25·d metres — tank 2's far wall at x = 3.60 + A₂ (the shipped payload is A₂ = 2.00, i.e. d = 6). Your target level h* = (3.96 + 1.25·A₂)/(1.978 + A₂), i.e. 1.849 m at d = 0 down to 1.564 m at d = 9.",
    setup: ["Move tank 2's far wall to x = 3.60 + your own A₂ (erase the shipped one first).",
            "With the valve OPEN, fill tank 1 to 2.00 m from the reservoir; shut the valve (V) the moment tank 2 reads 0.50 m.",
            "Untick Upstream reservoir AND set the Left edge back to Wall, or it leaks through the run.",
            "Let it stand, read Δh₀ off both cards while the water is still, then press V and time the fall."],
    instruments: [
      { tool: "gauge", where: "x ≈ 0.9 m, y ≈ 0.30 m", why: "tank 1 — the fall you time" },
      { tool: "gauge", where: "x ≈ 4.6 m, y ≈ 0.30 m", why: "tank 2 — the level it is finding" },
    ],
    task: "Fill tank 1 to 2.00 m with the valve open, shut the valve as tank 2 reaches 0.50 m, close the reservoir, settle, then press V and time tank 1's fall from 2.00 m to your h*.",
    submit: ["A₂", "t_½"],
    settle: 5,
    notes: "C_s = 0.40 is load-bearing, not cosmetic — at the stock 0.16 the tanks equalise in 2–6 s. Read Δh₀ off both cards while the water is still, BEFORE pressing V.",
  },

  // ------------------------------------------------------------- metering
  {
    id: "B7",
    title: "Venturi meter rating",
    topic: "Metering",
    folder: "B7-venturi-rating",
    scene: "venturi",
    rig: null,
    // The 1.55 m tailwater is what makes the duct flow full under head-driven
    // inflow; the reservoir level is the personalised parameter.
    rigParams: { budget: "Medium", twLevel: 1.55 },
    rigWhy: { twLevel: "the downstream control that makes the duct run full under head-driven inflow." },
    viewParams: { mode: "1" },
    digit: { label: "reservoir level", control: "inLevel", base: 1.70, step: 0.06, unit: "m",
             rule: "level = 1.70 + 0.06·d" },
    instruments: [
      { tool: "gauge", where: "x = 2.4 m, y = 0.85 m", why: "the barrel" },
      { tool: "gauge", where: "x = 5.0 m, y = 0.85 m", why: "the throat — SAME height, or Δh is not a pressure difference" },
    ],
    task: "Two gauges at the same height — barrel and throat — give Δh; hover the barrel for q. One (q, Δh) point each, and the pooled log-log slope is the ½ in q ∝ √Δh.",
    submit: ["q", "Δh"],
    settle: 15,
    notes: "Inside a pressurised duct only q, head and fill mean anything in the hover box — the profile chip is an open-channel classifier misapplied. The panel's Inflow q reads 0 under head-driven inflow; never take Q from it.",
  },
  {
    id: "B8",
    title: "Three orifices, three coefficients",
    topic: "Orifices & jets",
    folder: "B8-three-orifices",
    scene: "jet",
    rig: "B8-sharp",
    rigTable: ["B8-sharp", "B8-bellmouth", "B8-borda", "B8-sharp", "B8-bellmouth",
               "B8-borda", "B8-sharp", "B8-bellmouth", "B8-borda", "B8-sharp"],
    rigParams: { budget: "Medium" },
    digitNote: "your lip type: d mod 3 → 0 sharp edge (the scene default — draw nothing) · 1 bellmouth (two 45° erase bevels on the upstream corners) · 2 Borda re-entrant (two parallel wall strokes projecting into the tank).",
    task: "Draw your assigned lip on the orifice, then zoom into the wall exit and read C_c as the narrowest jet core divided by the opening's own height (station x = 2.41 m; 2.44 m for the Borda tube).",
    submit: ["lip type", "C_c"],
    settle: 55,
    notes: "The eye-read is biased 5–30% HIGH against the field read — zoom until the jet is ≥ 40 px across and read the bright core, not the paler aerated fringe. The Borda tube reproducibly fails to detach: 0.5 does not materialise, and why not is the lesson.",
  },
  {
    id: "B9",
    title: "Three reservoirs, one junction",
    topic: "Pipe networks",
    folder: "B9-three-reservoirs",
    scene: "sandbox",
    rig: "B9",
    // The rig loads pre-commissioning: valve shut, BOTH level controls off.
    // Turning them on is step 2 of the student's own sequence.
    rigParams: { budget: "Medium", spoutOn: false, cs: 0.40,
                 openL: "1", openR: "1", openB: "0", openT: "0", inQ: 0 },
    viewParams: { gaugeField: "head", mode: "0" },
    studentParams: [
      { control: "inflowOn", value: true, rule: "step 2 — reservoir A" },
      { control: "inLevel", value: 3.20, unit: "m", rule: "A's head, the same for everyone" },
      { control: "twOn", value: true, rule: "step 2 — reservoir C" },
      { control: "twLevel", value: 0.60, unit: "m", rule: "C's head, the same for everyone" },
    ],
    digitNote: "your middle reservoir: z_B(0) = 1.30 + 0.16·d metres — a POURED fill level in the drawn shaft (right-drag with the valve shut), so submit the settled reading after 10 s, not the number you poured to.",
    setup: ["The rig loads with the valve SHUT and both level controls off — that is the pre-commissioning state.",
            "Tick Upstream reservoir (level 3.20 m) and Tailwater control (0.60 m) to hold A and C.",
            "Right-drag to pour tank B up to your own z_B(0), then wait 10 s for it to settle and read it.",
            "Press V — all three branches release together — and read B's direction and the junction gauge 3 s later."],
    instruments: [
      { tool: "gauge", where: "x ≈ 0.75 m, y ≈ 0.20 m", why: "reservoir A" },
      { tool: "gauge", where: "x ≈ 2.78 m, just ABOVE y = 1.0", why: "tank B — lower than that is inside the shut valve's solid and reads a false dry" },
      { tool: "gauge", where: "x ≈ 5.05 m, y ≈ 0.20 m", why: "reservoir C" },
      { tool: "gauge", where: "x ≈ 2.78 m, y ≈ 0.50 m", why: "the junction head, 3 s after the release" },
    ],
    task: "Hold A at 3.20 m and C at 0.60 m, pour tank B to your own level with the valve shut, settle 10 s, then press V — all three branches release together — and read B's direction and the junction head 3 s later.",
    submit: ["z_B(0)", "sign of Q_B", "junction head"],
    settle: 20,
    notes: "Tank B's gauge must sit just ABOVE y = 1.0 or it is inside the closed valve's solid and reads a permanent false dry. These are early-transient numbers by design: B equalises fully in ~15–20 s.",
  },
  {
    id: "CS-1",
    title: "Setting the overflow: when does your chamber spill?",
    topic: "Urban drainage",
    folder: "CS-1-cso-spill",
    scene: "sandbox",
    rig: "CS-1",
    // The arrangement IS the rig: storm inlet on, chamber outfall open, no
    // reservoir and no tailwater. 0.50 m/s is the dry-weather flow the ramp
    // starts from, not a personalised value.
    rigParams: { budget: "Medium", inflowOn: false, twOn: false,
                 openL: "0", openR: "1", openB: "1", openT: "0",
                 spoutOn: true, spoutR: 0.10, spoutVx: 0.50, spoutVy: 0 },
    rigWhy: { spoutVx: "0.50 m/s is the dry-weather flow the 45 s pre-charge runs at — the storm ramp up from it is yours." },
    viewParams: { gaugeField: "depth", dye: true, dyeDecay: 0 },
    digitNote: "your throttle (DRAWN, by erase-brush width): r = d mod 4 → 2 / 4 / 6 / 8 cells (0.044 / 0.087 / 0.130 / 0.174 m), one vertical erase stroke down x = 4 m through the chamber floor.",
    setup: ["Cut your own throttle: press [ twenty times to shrink the erase brush, then ] exactly 1 / 3 / 5 / 6 times for r = 0 / 1 / 2 / 3, and erase straight down the x = 4 m line through the chamber floor.",
            "Settle 45 s at dry-weather flow (spout velocity → 0.50 m/s) — the chamber and sewer must be pre-charged or the first flush is invisible.",
            "Ramp the spout in 0.25 m/s steps held 10 s to bracket the spill, then 0.08 m/s steps held 20 s to pin it.",
            "First spill = chamber gauge ≥ crest + 1 cell with a continuous sheet over the crest; then hover the sewer at x ≈ 2 m for q."],
    instruments: [
      { tool: "gauge", where: "x ≈ 4.25 m, y ≈ 1.62 m", why: "the chamber at crest level — first spill is this gauge ≥ crest + 1 cell" },
    ],
    task: "Cut your own throttle, settle at dry-weather flow, then ramp the storm inflow — 0.25 steps held 10 s to bracket, 0.08 steps held 20 s to pin — until the chamber first spills over the crest, and read q off the hover over the sewer.",
    submit: ["gap (cells)", "q_spill"],
    settle: 20,
    notes: "Read q off the hover over the sewer, never a slider — the spout delivers 0.66–0.88 of nominal. Every read is a ~6 s median, and 20 s per fine step is required or the apparent C_d drifts across the ramp.",
  },

  // --------------------------------------------------------------- waves
  {
    id: "WV-1",
    title: "Dispersion, one period each",
    topic: "Waves",
    folder: "WV-1-dispersion",
    scene: "wavedeep",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table (it plateaus at 1.60 s from d = 7)",
             table: [0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.60, 1.60, 1.60],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period — a short wave with a long stroke just breaks at the paddle",
                      table: [0.05, 0.08, 0.11, 0.15, 0.19, 0.23, 0.28, 0.30, 0.30, 0.30] }] },
    secondScene: { scene: "waveshallow", when: "Second cohort — same digit, shallow flume: switch to ?scene=waveshallow with Scenes ▾ and use the shallow rows, T = 3.0–6.0 s (d 0 → 3.0 s / 0.25 m · d 2–3 → 3.6 s / 0.28 m · d 5 → 4.5 s / 0.30 m · d 9 → 6.0 s / 0.30 m). Post (T, L, flume) for each flume you run." },
    task: "Zoom onto the paddle, let your train run, then pause and read one crest-to-crest wavelength off the scale bar. Pooled (T, L) from both flumes lands on the two branches of the dispersion relation.",
    submit: ["T", "L", "flume"],
    settle: 40,
    notes: "Measure within the first one or two wavelengths of the paddle — the coherent wave decays 30–50× within ~2.5–3 m, so the scene's default camera frames genuinely dead-flat water.",
  },
  {
    id: "WV-2",
    title: "The buried wave gauge",
    topic: "Waves",
    folder: "WV-2-buried-gauge",
    scene: "wave",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    viewParams: { gaugeField: "head" },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table",
             table: [1.10, 1.10, 1.20, 1.30, 1.40, 1.50, 1.65, 1.85, 2.10, 2.10],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period",
                      table: [0.055, 0.055, 0.055, 0.060, 0.060, 0.060, 0.060, 0.065, 0.070, 0.070] }] },
    instruments: [
      { tool: "gauge", where: "near the paddle, LOW — about a tenth of the depth above the floor", why: "the bed gauge" },
      { tool: "gauge", where: "the same vertical, about three-quarters of the way up", why: "the surface gauge — leave a visible band of water above it or it flat-lines at a trough" },
    ],
    secondScene: { scene: "wavedeep", when: "Second submission, EVEN last digits only: switch to ?scene=wavedeep with Scenes ▾ and repeat with the same two gauges (station x ≈ 1.2 m there). The bed trace comes out as pure noise — \"below noise\" is the intended answer, not a failure." },
    task: "Two gauges on one vertical near the paddle — one a tenth of the depth off the floor, one three-quarters up — then read each trace's peak-to-peak swing and divide bed by surface. That ratio is 1/cosh kh, and it is why a buried recorder under-reads.",
    submit: ["T", "bed/surface ratio"],
    settle: 20,
    notes: "If the upper gauge ever flat-lines it has left the water at a trough — nudge it down and re-settle. On the deep flume the bed trace is pure noise, and \"below noise\" is the intended answer, not a failure.",
  },
  {
    id: "WV-3",
    title: "Reflection coefficient of a steep sea wall",
    topic: "Waves",
    folder: "WV-3-reflection",
    scene: "wavesurge",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    viewParams: { gaugeField: "depth" },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table (digits pair up: 0,1 → 1.80 s and so on)",
             table: [1.80, 1.80, 2.40, 2.40, 3.00, 3.00, 3.60, 3.60, 4.20, 4.20],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period",
                      table: [0.080, 0.080, 0.110, 0.110, 0.140, 0.140, 0.170, 0.170, 0.200, 0.200] }] },
    instruments: [
      { tool: "gauge", where: "ONE gauge, moved along the flat run from x = 1.3 to 7.5 m in 0.2 m steps", why: "you are hunting the antinode and the node — the swing at each stop is the measurement" },
    ],
    task: "Slide one gauge along the flat run from x = 1.3 to 7.5 m in 0.2 m steps, note the biggest swing (antinode) and the smallest (node), and compute K_refl = (a_max − a_min)/(a_max + a_min).",
    submit: ["T", "K_refl"],
    settle: 45,
    notes: "The spin-up ending is NOT the cue — wait until the clock reads t ≈ 45 s so the reflection has crossed the whole zone. A short window read AT a node over-reads badly; antinodes are forgiving.",
  },
  {
    id: "B4",
    title: "Orbital decay, measured off the trails",
    topic: "Waves",
    folder: "B4-orbital-decay",
    scene: "wavedeep",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    viewParams: { tracerOn: true, tracerX: 5.84, tracerN: 9, tracerTrail: 3, vex: 6 },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table (same rows as WV-1)",
             table: [0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.60, 1.60, 1.60],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period",
                      table: [0.05, 0.08, 0.11, 0.15, 0.19, 0.23, 0.28, 0.30, 0.30, 0.30] }] },
    task: "Zoom on the tracer column, raise the vertical exaggeration, then pause and read the VERTICAL extent of the surface trail against the bed trail. Their ratio should be exp(−kz) — deep water forgets the bed.",
    submit: ["T", "surface/bed ratio"],
    settle: 40,
    notes: "Read the vertical extent, not the horizontal — the near-bed smear is mostly return current. A flat, motionless bed trail is a valid answer: the true bed signal sits below this station's noise floor at every digit.",
  },
  {
    id: "B5",
    title: "Iribarren map jigsaw",
    topic: "Waves",
    folder: "B5-iribarren",
    scene: "wave",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    studentParams: [
      { control: "waveT", unit: "s", rule: "your CELL's period — from the table below, not from a digit" },
      { control: "waveA", unit: "m", rule: "your cell's amplitude; a wavesurge cell also needs ?scene=wavesurge" },
    ],
    digitNote: "assigned by CELL, not by digit — your pair's row gives a scene (wave or wavesurge), a period and an amplitude. wave: (0.70,0.035) (0.90,0.045) (1.10,0.055) (1.50,0.060) (2.10,0.070) (3.00,0.055) (4.00,0.045) (5.00,0.035) (6.00,0.030); wavesurge: (0.80,0.060) (1.40,0.130) (1.40,0.173) (1.80,0.080) (3.00,0.140) (4.20,0.199).",
    secondScene: { scene: "wavesurge", when: "Half the cells live on the other beach: if your pair's row is in the wavesurge list, switch to ?scene=wavesurge with Scenes ▾ BEFORE setting the period and amplitude. The scene is part of the cell, not a variation on it." },
    task: "Set your cell's period and amplitude, wait out spin-up plus 15–20 s of transit, then classify what the wave does on the beach — spilling, surging or dies — and count scale-bar lengths of surf if it spilled. The class fills in the Iribarren map.",
    submit: ["cell", "ξ", "behaviour", "surf width"],
    settle: 40,
    notes: "Judge only after the full 15–20 s past spin-up, and treat \"dies\" as a legitimate third answer: cells below ξ ≈ 0.73 die from absolute height (the two-cell floor), not from steepness.",
  },
  {
    id: "B6",
    title: "Ursell number: when Airy stops being enough",
    topic: "Waves",
    folder: "B6-ursell",
    scene: "waveshallow",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    viewParams: { gaugeField: "depth" },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table",
             table: [3.0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8, 5.1, 5.5, 6.0],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period (it saturates at 0.30 m)",
                      table: [0.25, 0.265, 0.28, 0.29, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30] }] },
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, y = 0.20 m", why: "H crest-to-trough" },
      { tool: "gauge", where: "x = 1.8 m, y = 0.20 m", why: "the second station — L comes from the lag between the two" },
    ],
    task: "With the two depth gauges, read H crest-to-trough and L crest-to-crest over 20–30 s of cycles and compute U_r = H·L²/h³ with h = 0.348 m. Then say whether your crests look sharper than your troughs.",
    submit: ["T", "H", "L", "U_r", "crest vs trough"],
    settle: 42,
    notes: "H is the RAW crest-to-trough range, a typical swing over several cycles — never a harmonic fit, which halves H by construction and strips out the exact nonlinearity being measured.",
  },

  // ------------------------------------------------------ dimensional analysis
  {
    id: "DA-1",
    title: "The scale ladder",
    topic: "Similitude",
    folder: "DA-1-scale-ladder",
    scene: "sandbox",
    rig: "DA-1@1",
    // The λ third is d mod 3, and each third is a different DRAWING — so the
    // digit picks which captured rig loads. Nobody hand-draws a λ = ¼ weir.
    rigTable: ["DA-1@1", "DA-1@0.5", "DA-1@0.25", "DA-1@1", "DA-1@0.5",
               "DA-1@0.25", "DA-1@1", "DA-1@0.5", "DA-1@0.25", "DA-1@1"],
    rigParams: { budget: "Medium", openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, twOn: false,
                 spoutOn: false, waveOn: false },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q (already scaled by λ^1.5)", control: "inQ", unit: "m²/s",
             rule: "q_base = 0.60 + 0.06·d, then scaled by λ^1.5 for your third",
             table: [0.600, 0.235, 0.090, 0.780, 0.295, 0.115, 0.960, 0.360, 0.135, 1.140],
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "the level paired with your scaled q",
                      table: [1.795, 1.165, 0.840, 1.890, 1.210, 0.865,
                              1.975, 1.250, 0.880, 2.055] }] },
    digitNote: "q_base = 0.60 + 0.06·d, and your λ third is d mod 3 → λ = 1 / ½ / ¼ (DRAWN: bed ends at 6.52 / 3.26 / 1.63 m, crest top y = 1.196 / 0.848 / 0.674 m, gauge at 2.17 / 1.09 / 0.54 m, settle 55 / 40 / 28 s). q and level above are the closed-form rule snapped to the sliders.",
    instruments: [
      { tool: "gauge", where: "the approach pool: x = 2.17 / 1.09 / 0.54 m for λ = 1 / ½ / ¼ (y ≈ 1.25 / 0.90 / 0.72)", why: "h, and H = h − P" },
    ],
    task: "Build your third's weir, set q and the paired reservoir level, read the gauge depth h and report H = h − P. Non-dimensionalised as C_d, three different-sized weirs collapse onto one curve.",
    submit: ["λ", "q", "H"],
    settle: 55,
    notes: "Read the PRINTED h on the gauge card, not the shape of its auto-scaled trace — at λ = ¼ the line looks violent while the axis shows the fourth decimal. H/P must land in 0.85–1.25 on every rung.",
  },
  {
    id: "DA-2",
    title: "Time scales as √λ",
    topic: "Similitude",
    folder: "DA-2-time-scales",
    scene: "sandbox",
    rig: "DA-2@1",
    rigTable: ["DA-2@1", "DA-2@0.75", "DA-2@0.5", "DA-2@0.25", "DA-2@1",
               "DA-2@0.75", "DA-2@0.5", "DA-2@0.25", "DA-2@1", "DA-2@0.75"],
    // The 0.04 m tailwater on an open right edge is load-bearing: a bare open
    // edge ponds and chokes the orifice within ~27 s. The tank loads EMPTY —
    // filling it is the experiment.
    rigParams: { budget: "Medium", spoutOn: false,
                 openL: "0", openR: "1", openB: "0", openT: "0",
                 twOn: true, twLevel: 0.04, inQ: 0 },
    rigWhy: { twLevel: "the apron beyond the plate must drain actively — a bare open edge ponds and chokes the orifice within ~27 s." },
    viewParams: { gaugeField: "head", mode: "0" },
    studentParams: [
      { control: "inflowOn", value: true, rule: "step 2 — the fill source, then untick it again for step 3" },
      { control: "inLevel", unit: "m", rule: "your own h_start: 1.80 / 1.35 / 0.90 / 0.45 m for λ = 1 / ¾ / ½ / ¼" },
    ],
    digitNote: "your scale: r = d mod 4, λ = 1 − 0.25·r (λ = 1, ¾, ½, ¼). DRAWN: tank width x = 4.50 / 3.375 / 2.25 / 1.125 m and a 4 / 3 / 2 / 1-cell orifice; fill to h_start = 1.80 / 1.35 / 0.90 / 0.45 m and stop at h_stop = 0.60 / 0.45 / 0.30 / 0.15 m.",
    setup: ["The tank loads empty with the valve shut — the fill is part of the experiment.",
            "Fill from the reservoir to your h_start (1.80 / 1.35 / 0.90 / 0.45 m for λ = 1 / ¾ / ½ / ¼).",
            "Untick Upstream reservoir AND set the Left edge back to Wall, then let it stand.",
            "Press V and time the fall from h_start to h_stop on the status-bar clock."],
    instruments: [
      { tool: "gauge", where: "in the tank, near the floor: x ≈ 2.25 / 1.69 / 1.13 / 0.56 m for λ = 1 / ¾ / ½ / ¼", why: "the falling level you time" },
      { tool: "gauge", where: "on the apron beyond the plate (x ≈ 5.5 / 4.4 / 3.3 / 2.1 m, y ≈ 0.02 m)", why: "confirms the apron is draining, not ponding" },
    ],
    task: "Build the tank at your own λ, fill to h_start, close the reservoir, then press V and time the fall to h_stop on the status-bar clock. Pooled, t ∝ √λ — the model empties faster than the prototype.",
    submit: ["λ", "t_fall"],
    settle: 5,
    notes: "The apron beyond the plate must drain actively (tailwater ON at 0.04 m on an open right edge); a bare open edge ponds and chokes the orifice within ~27 s.",
  },
  {
    id: "DA-3",
    title: "Scale effects, live",
    topic: "Similitude",
    folder: "DA-3-scale-effects",
    scene: "sandbox",
    // DA-3 has no rig of its own: it drives DA-1's weir around the Resolution
    // control, so it rebuilds YOUR λ third and then changes only Δx.
    rig: "DA-1@1",
    rigTable: ["DA-1@1", "DA-1@0.5", "DA-1@0.25", "DA-1@1", "DA-1@0.5",
               "DA-1@0.25", "DA-1@1", "DA-1@0.5", "DA-1@0.25", "DA-1@1"],
    // Medium is the capture resolution and therefore the common starting
    // point; moving OFF it is the whole exercise, so the digit's resolution is
    // the student's to set — after the rig has loaded, never before.
    rigParams: { budget: "Medium", spoutOn: false,
                 openL: "1", openR: "1", openB: "1", openT: "0",
                 inflowOn: true, inFree: false, twOn: false },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "your own DA-1 row — q must not move when the resolution does",
             table: [0.600, 0.235, 0.090, 0.780, 0.295, 0.115, 0.960, 0.360, 0.135, 1.140],
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "your own DA-1 level, unchanged between the two runs",
                      table: [1.795, 1.165, 0.840, 1.890, 1.210, 0.865,
                              1.975, 1.250, 0.880, 2.055] },
                    { label: "resolution", control: "budget",
                      rule: "even digit → Low, odd → High. Set it AFTER the rig has loaded, and never Very high or Ultra",
                      table: ["Low", "High", "Low", "High", "Low",
                              "High", "Low", "High", "Low", "High"] }] },
    digitNote: "even digit → Low, odd digit → High, on your own DA-1 λ third and q. Never Very high or Ultra: DA-1's weir reservoir fails to settle there.",
    instruments: [
      { tool: "gauge", where: "the same approach-pool station as DA-1: x = 2.17 / 1.09 / 0.54 m for λ = 1 / ½ / ¼", why: "h, and it must not move between the two resolutions" },
    ],
    task: "Keep your own DA-1 weir, q and level exactly as they were and change ONLY the Resolution, then re-read H and recompute C_d. The λ-points and the Δx-points fall on one curve — scale effect and mesh effect are the same story.",
    submit: ["λ", "q", "resolution", "C_d"],
    settle: 55,
    notes: "Only the Resolution may move — if q or level shifts, C_d moves for the wrong reason. Reload the page between resolution flips beyond the scripted two.",
  },
];
