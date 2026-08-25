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
 *                  says WHY (HJ-1's 1.3·y_c). The card prints the RULE and the
 *                  panel row it goes on — "q (m²/s): q = 0.42 + 0.03·d" — and
 *                  the student does the arithmetic; d is their student
 *                  number's last digit and the lecturer owns explaining it.
 *                  Nothing is computed or written for them.
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
 *            exercises. {tool, where, why}. The card prints `where`; `why` is
 *            for whoever maintains the entry.
 *   digitNote  the rule itself, printed where the personalised thing is drawn
 *            geometry or a station on screen — there is no control to set.
 *   setup    the ordered sequence a snapshot cannot hold ("fill it, THEN shut
 *            the valve"). Steps for the student to follow, never automated.
 *   start    ONE short line on what is on the bench when the card opens —
 *            "a chute onto a level apron, with a tailwater control".
 *   task     ONE or two short lines on what to do, INCLUDING what to read off
 *            the screen at the end of it.
 *   note     one sentence for the thing on screen that is NOT part of the
 *            exercise but will get asked about anyway (HP-1's scene valve).
 *            Rare on purpose.
 *   settle   sim-seconds to wait, from the demo's verification record. The
 *            picker runs the solver flat out for this long, exactly as a
 *            scene's own `spinup` does, so it is not a wall-clock wait.
 *
 * HOW SHORT `start` AND `task` ARE IS THE POINT. This pack is read in a lecture
 * theatre by somebody whose lecturer is already saying what to do, or at home
 * beside the README. The card carries no cautions, no reasons, no procedure for
 * a drawn personalisation and nothing about handing work in — a `submit` list
 * and a `notes` paragraph were both tried on the card and removed, because the
 * card that says everything is the card nobody reads. All of it is still in
 * `exercises/<folder>/README.md`, which every card links to.
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
    start: "a steep chute running uniform flow, with your own inflow to set",
    task: "Set your q, then hover mid-chute at x ≈ 3.5 m and read the MEASURED y_n off the hover box.",
    settle: 26,
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
    digitNote: "your station: x = 1 + d metres",
    start: "the settled backwater pool behind a weir — nothing to set",
    task: "Hover at your own station and read the surface elevation straight off the hover box (the \"surface … above datum\" row).",
    settle: 30,
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
    digitNote: "no digit: every rig is drawn by hand, and two identical screenshots count once",
    start: "an empty sandbox — you draw every rig yourself",
    task: "In pairs, draw beds, gates, weirs and tailwaters and collect as many distinct GVF chips as you can, screenshotting chip plus geometry each time.",
    settle: 0,
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
    secondScene: { scene: "s1", when: "optional coda - switch to s1 (Scenes menu) for the same jump on a 1-in-4 bed, tailwater 0.95 / 1.00 / 1.05 m, and expect y₂ well under Bélanger." },
    start: "a chute onto a level apron, with a tailwater control",
    task: "Set your q and its paired tailwater, let the jump settle on the apron, then read Fr₁ and y₂/y₁ off the jump box over ~10 s.",
    settle: 35,
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
    digitNote: "your window: x₀ = 5.0 + 0.5·(d mod 8) m, from x₀ to x₀ + 7, midpoint x₀ + 3.5",
    instruments: [
      { tool: "gauge", where: "x = x₀ (your own window's upstream end)", why: "head at the top of the reach" },
      { tool: "gauge", where: "x = x₀ + 7 m", why: "head at the bottom — F is the fall between the two" },
    ],
    start: "a natural-looking reach with the discharge hidden — keep the panel shut",
    task: "Gauge x₀ and x₀ + 7, read the head fall F between them and h and n at the midpoint, then Q̂ = K√(F/L) with K = h^(5/3)/n.",
    settle: 32,
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
    digitNote: "your station: x = 1.5 + 0.5·(d mod 8) metres",
    instruments: [
      { tool: "rake", where: "your own station x", why: "the velocity–depth profile α is integrated from" },
    ],
    start: "the steep flume at its own discharge; leave q alone",
    task: "Rake your station, watch 15–20 s, pause on a typical moment and read u_max/V, then integrate 4–5 points off the curve into α.",
    settle: 45,
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
    secondScene: { scene: "m2", when: "Part B - open m2 (Scenes menu), touch nothing, wait out the 90 s spin-up and compare at x ≈ 7 m." },
    start: "the steep flume, with your own inflow to set",
    task: "Hover at x ≈ 3.5 m and read h and S_f, then τ₀ = ρg·h·S_f and D_min = τ₀/[0.056(ρₛ−ρ)g].",
    settle: 26,
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
    rigWhy: { inLevel: "the reach is doubly controlled: the hump has nothing to choke against without both ends held.",
              twLevel: "the other half of that pair." },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "q = 0.15 + 0.05·d (d = 0…8; if your last digit is 9 use d = 8)",
             table: [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.55] },
    instruments: [
      { tool: "gauge", where: "x = 2.5 m, y = 0.75 m", why: "the upstream depth y₁ the prediction is built on" },
    ],
    start: "a level reach held at both ends, and a hump to grow at x = 4.5 m",
    task: "Read y₁ at the gauge and commit a prediction Δz = E₁ − 1.5·y_c. Then grow a 1 m flat-topped hump at x = 4.5 m in ~7 steps, jotting y₁ at each and re-settling, until the crest chokes — the y₁ from the LAST pre-choke step redoes the prediction as Δz_pred*.",
    settle: 60,
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
    instruments: [
      { tool: "gauge", where: "x = 6.85 m, y ≈ 1.13 m", why: "on the broad crest — reads y_crest" },
    ],
    start: "a reservoir feeding a broad crest that spills over a brink",
    task: "Set your q and its paired level, then read y_c off the q slider, y_crest at the gauge on the crest and y_brink at the last wet column on the lip, and order the three.",
    settle: 55,
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
      { tool: "cv", where: "Force box (9), optional: drag about (2.0, 0.3) → (6.7, 1.6) — bottom inside the bed, right face short of where the nappe lands", why: "F→ is the thrust the pool puts on the plate, against ρgP(h − P/2)" },
    ],
    start: "an approach pool behind a sharp-crested weir",
    task: "Set your q with its paired level, settle, then read the gauge card DEPTH h and take the head over the crest as H = h − 0.50. Optional: a Force box round the plate reads F→ a few percent above ρgP(h − P/2).",
    settle: 60,
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
    rigWhy: { inQ: "the same q for the whole class — your gate opening and its level are the personalisation." },
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "depth" },
    digit: { label: "reservoir", control: "inLevel", unit: "m",
             rule: "the fixed point for q = 0.330 at YOUR gate opening",
             table: [1.7565, 1.7565, 1.4181, 1.4181, 1.4181,
                     1.2103, 1.2103, 1.2103, 1.0791, 1.0791] },
    digitNote: "your gate opening is DRAWN: a = 5 + round(3d/9) cells, gate bottom y = 0.609 / 0.630 / 0.652 / 0.674 m",
    instruments: [
      { tool: "gauge", where: "x = 3.5 m, y ≈ 0.65 m", why: "the upstream pool — reads y₀" },
      { tool: "cv", where: "Force box (9): drag (3.50, 0.30) → (5.63, 3.20) — gauge station to vena station, bottom face inside the bed", why: "measures the thrust F_R predicts, on the same control volume and without its two assumptions" },
    ],
    start: "a pool behind a drawn sluice gate — its opening is yours to adjust",
    task: "Redraw the gate opening to your own row, set your reservoir level, then read y₀ at the gauge and y₁ by hovering the vena at x = 5.630 m, work out C_d and the gate thrust, and measure that thrust with the Force box on the same control volume.",
    settle: 70,
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
    digitNote: "no personalised parameter: everyone reads the same rig",
    instruments: [
      { tool: "cv", where: "Force box (9): drag (0.85, 1.55) → (2.05, 3.20) — it encloses all four shapes and clears the spout", why: "F→ is the force each turn actually delivers, to set against ρqv(1−cosθ)" },
      { tool: "gauge", where: "in the free jet, ~0.25 m clear of the plate (README uses 0.95, 2.50)", why: "the approach head" },
      { tool: "gauge", where: "on the stagnation point, ~0.03 m off the plate face (README uses 1.32, 2.46)", why: "the stagnation head — the ratio is the answer" },
    ],
    start: "a horizontal jet from a spout striking a flat plate",
    task: "Redraw the deflector four ways - flat plate, 45° ramp, 90° corner, deep-V (apex 1.90, 2.40) - settling 3–5 s each, watch the force follow the turn angle on Field > Momentum flux, and read F→ off the Force box for each. The deep-V under-delivers because it floods.",
    settle: 5,
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
    rigWhy: { inLevel: "the bench idles with no driving head — level = tailwater, so the duct sits charged and still. Supplying the head is your first move.",
              twLevel: "without a tailwater near 2.5 m the pipe empties and the run dies." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.30, step: 0.13, unit: "m",
             rule: "level = 3.30 + 0.13·d" },
    instruments: [
      { tool: "gauge", where: "x = 4.0 m, y = 2.20 m", why: "H₁, mid-height in the bore and clear of the entry region" },
      { tool: "gauge", where: "x = 8.5 m, y = 2.20 m", why: "H₂ — L = 4.5 m, not 6 (README §5)" },
    ],
    start: "a pressurised duct fed from a reservoir",
    task: "Raise the reservoir to your own level, place the two gauges for h_f = H₁ − H₂ and hover mid-pipe for the bore-mean V.",
    settle: 22,
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
    rigWhy: { inLevel: "the bench idles with no driving head — level = tailwater, so the duct sits charged and still.",
              twLevel: "holds the wide leg full, so the expansion has a pressure to recover into." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.45, step: 0.035, unit: "m",
             rule: "level = 3.45 + 0.035·d" },
    instruments: [
      { tool: "gauge", where: "x = 3.4 m, y = 2.20 m", why: "H₁, in the 0.40 m bore upstream of the step" },
      { tool: "gauge", where: "x = 7.6 m, y = 2.10 m", why: "H₂ — LOW in the wide pipe; a centreline tap sign-flips the recovery" },
    ],
    start: "a pressurised duct that steps 0.40 to 0.80 m at x = 3.80 m",
    task: "Set your reservoir level, hover either side of the step for V₁ and V₂ and read H₁ and H₂ off the gauges, then compare h_L with Borda–Carnot's (V₁−V₂)²/2g.",
    settle: 20,
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
    rigWhy: { inLevel: "one shared level for every pair — the personalisation is A's hidden stroke, not a slider.",
              twLevel: "without it the pipe empties." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digitNote: "personalised by partner A's hidden stroke, not a digit: 2–3 cells tall, somewhere between x = 4.6 and 7.0 m",
    instruments: [
      { tool: "gauge", where: "four gauges walked along the covered run, EVERY one at y = 2.35", why: "near the soffit — the HGL kink is what you are hunting" },
    ],
    start: "a covered pressurised pipe, the same head for every pair",
    task: "In pairs: A draws a hidden 2–3 cell obstruction in the covered run, B walks four gauges along it in three 20 s rounds to bracket the HGL kink and size k_L.",
    settle: 20,
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
    rigWhy: { spoutOn: "off, as step 1 says: the sandbox's own spout would otherwise rain into the sump before you are ready." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    studentParams: [
      { control: "spoutOn", value: true, rule: "step 2 — tick it to rain into the sump, then move it into the bore as the pump" },
    ],
    digit: { label: "spout velocity", control: "spoutVx", base: 1.5, step: 0.09, unit: "m/s",
             rule: "vx = 1.50 + 0.09·d — set it only AFTER the shared 2.2 m/s priming step" },
    setup: ["The rig loads with the spout OFF.",
            "Tick Top-left spout and rain into the sump for ~7 s.",
            "Move the spout to (2.0, 0.60) and set its velocity to 2.2 m/s; leave it ~55 s until the tank spills. This shared step is not optional.",
            "Now set your own spout velocity and let it re-settle."],
    instruments: [
      { tool: "gauge", where: "x = 3.0 m, y = 0.60 m", why: "the flange, 1.0 m downstream of the pump" },
      { tool: "gauge", where: "x = 0.9 m, y = 1.0 m", why: "the sump's open water — H is gauge 1 minus gauge 2" },
    ],
    start: "a sump, a drawn rising main and a delivery tank, spout off",
    task: "Prime the rising main as below, then set your own spout velocity and read Q by hovering the low-run bore and H as gauge 1 minus gauge 2.",
    settle: 10,
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
    rigWhy: { inLevel: "the bench idles with no driving head — level = tailwater, so the duct sits charged and still.",
              twLevel: "without it the pipe empties." },
    viewParams: { mode: "1", channel: false, labels: false, jumps: false },
    digit: { label: "reservoir level", control: "inLevel", base: 3.30, step: 0.13, mod: 6, unit: "m",
             rule: "level = 3.30 + 0.13·(d mod 6)" },
    instruments: [
      { tool: "gauge", where: "x = 3.7 m, y = 2.20 m", why: "upstream of the hump station" },
      { tool: "gauge", where: "x = 8.0 m, y = 2.20 m", why: "downstream — interpolate the HGL at the crest between the two" },
    ],
    start: "a flat pressurised duct with a crest you can lift mid-length",
    task: "Set your reservoir level, interpolate the HGL at the hump station from the two gauges, then walk the crest soffit up until the crown head drops below 0.02 m - that height is z_sep.",
    settle: 12,
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
    digitNote: "your nozzle gap is DRAWN: gap = 0.42 / 0.70 / 0.84 / 0.97 / 1.10 m by d mod 5",
    start: "a 49 m penstock from a high reservoir, throttled at x = 8 m, with a 0.84 m nozzle at x = 56.5 m",
    task: "Erase the nozzle plate at x = 56.5 m and redraw it at YOUR gap (two pieces about y = 3.5, ruler on), press R and wait out the 50 s, then hover mid-pipe for q and read the jet core speed in the Speed view at x ≈ 57 m.",
    note: "The green bar at x = 55 m is the scene's valve — it belongs to the water-hammer demos, not to this rig. Leave it open; if the pipe suddenly stops flowing you have pressed V and slammed it (press V again).",
    settle: 50,
  },
  {
    id: "HP-2",
    title: "Why turbine buckets are cups, not plates",
    topic: "Hydropower",
    folder: "HP-2-pelton",
    scene: "sandbox",
    rig: "HP-2",
    rigParams: { budget: "Medium", openL: "0", openR: "0", openB: "1", openT: "0",
                 spoutOn: true, spoutR: 0.09, spoutVx: 4.5, spoutVy: 0 },
    viewParams: { mode: "2", channel: false, labels: false, jumps: false, gaugeField: "head" },
    digitNote: "lecturer demo: no personalised parameter",
    instruments: [
      { tool: "cv", where: "Force box (9): drag (0.85, 1.55) → (2.05, 3.20), around the deflector and clear of the spout", why: "reads the momentum-theorem force on whatever it encloses — the number the demo is about" },
      { tool: "gauge", where: "optionally in the free jet and on the stagnation point (MO-2's two stations)", why: "head, if you want the ratio as well as the force" },
    ],
    start: "the jet-on-a-plate rig, as a lecturer demonstration",
    task: "Read F→ off the Force box: about 4 kN/m on the flat plate; redraw as the 6-stroke cup (README table) and the same box reads about 7 — close to the factor of two. The textbook deep-V reads only about 5 because it floods.",
    settle: 5,
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
    digitNote: "your nozzle gap is DRAWN: gap = 0.14 × (1 + (d mod 6)) m, in two pieces about y = 3.5",
    instruments: [
      { tool: "gauge", where: "x = 30 m, y = 3.5 m — expand its card (⤢) to read the trace", why: "mid-pipe, on the axis — reads H₀ then the plateau H₁" },
      { tool: "rake", where: "mid-pipe, x ≈ 30 m", why: "the rake chip's V is the bore-mean — that is v₀" },
    ],
    start: "a 60 m pipe from a reservoir to a valve, running steadily",
    task: "Redraw the plate to your own nozzle gap, read v₀ off a mid-pipe rake and H₀ off the expanded gauge trace, then press V to slam the valve and pause on the first flat top for H₁.",
    settle: 15,
  },
  {
    id: "UN-2",
    title: "Flow establishment: the asymptotic start",
    topic: "Water hammer",
    folder: "UN-2-establishment",
    scene: "estab",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { gaugeField: "speed" },
    digit: { label: "reservoir level", control: "inLevel", base: 3.4, step: 0.1, unit: "m",
             rule: "level = 3.4 + 0.1·d" },
    instruments: [
      { tool: "gauge", where: "mid-pipe, x = 14 m, y = 2.4 m — expand its card (⤢) to read the trace", why: "the speed trace u_max and t_75 are read on" },
    ],
    start: "a reservoir feeding a 23 m pipe, full and still behind a shut valve",
    task: "Set your level, press R, let it settle; open the valve (V) and read the settled band as u_max and the first crossing of 0.75·u_max as t_75, timed from where the trace leaves zero. Read the reservoir level off its marker while the pipe flows.",
    settle: 30,
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
    rigWhy: { inLevel: "the scene default of 25 m fails containment: 31.7 m of head at b_s ≈ 1 m.",
              bulk: "the shipped value: 0.30 throttles the nozzle by 33% and corrupts the decay.",
              view: "Depth, because the Head channel's ±6 m Joukowsky wave buries the 3 m mass oscillation." },
    viewParams: { gaugeField: "depth", speed: 2 },
    digitNote: "your standpipe width is DRAWN: b_s = 0.70 + 0.14·d m, and it is the DELIVERED width you record",
    instruments: [
      { tool: "gauge", where: "in the standpipe shaft, x ≈ 53 m, y ≈ 6 m", why: "the mass oscillation — y_max is its first crest minus h₀" },
    ],
    start: "the penstock with nozzle, tee and standpipe already built — the shaft width is yours",
    task: "Redraw the standpipe shaft to your own width and gauge it, then slam the valve and read y_max (first crest minus h₀) and the crest-to-crest period T off the Depth trace.",
    settle: 100,
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
    digitNote: "your valve station is DRAWN: x_d = 12 + 4·d m, so L = x_d − 6 and your gauge goes at x_d − 3",
    instruments: [
      { tool: "gauge", where: "x = x_d − 3 (three metres upstream of YOUR OWN valve), y ≈ 3.5 m", why: "read near the reservoir instead and the sponge smears the trace" },
    ],
    start: "the 60 m pipe — you add a valve at your own station and leave the shipped one alone",
    task: "Draw your own valve, check it seals, gauge 3 m upstream of it, then slam it and pause on four consecutive peaks: T is the median of the three gaps.",
    settle: 13,
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
    digitNote: "your nozzle gap is DRAWN: gap = 0.14 × (1 + (d mod 6)) m, exactly as UN-1. The celerity is not personalised",
    instruments: [
      { tool: "gauge", where: "x = 30 m, y = 3.5 m", why: "mid-pipe — the same station for both legs" },
    ],
    secondScene: { scene: null, when: "the second leg is the same scene, not another one - scale the post-slam wait and the read window by 70/c." },
    start: "the 60 m pipe at the shipped celerity c = 70 m/s",
    task: "Slam at c = 70 for ΔH₇₀, then reopen, set Slot celerity c = 140, press R, re-settle, re-read v₀ and slam again for ΔH₁₄₀. The ratio of the two surges is the pipe material.",
    settle: 13,
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
    digitNote: "your bore stations: x₁ = 3.0 + 0.5·d m and x₂ = x₁ + 1.5 m; the negative wave is read at x = 1.0 m by everyone",
    start: "a full reservoir behind a dam, a shallow STILL tailrace downstream — wet on purpose, the bore needs it",
    task: "Pull the dam and time the surface at x = 1.0 m dropping clearly below its still-water mark, then reset and time the bore front between your own x₁ and x₂.",
    settle: 0,
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
    digitNote: "your start level by digit: 1.98, 2.09, 2.20, 2.31, 2.62, 2.73, 2.84, 2.95, 3.04, 3.11 m. Stop at 1.80 m; depth h = level − 1.36 m",
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, y = 1.0 m", why: "low enough to stay submerged all the way down to η₂; on Head it reads the surface elevation directly" },
    ],
    start: "a tall tank draining through an orifice, in slow motion",
    task: "Predict the drain time on paper first, from t = (2A/(C_d·a·√2g))(√h₁ − √h₂) with A = 1.90 m, a = 0.12 m, C_d = 0.61 × 0.97. Then gauge low in the tank, switch the spout off and time the real fall on the status-bar clock.",
    settle: 55,
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
    rigWhy: { cs: "at the stock 0.16 the tanks equalise in 2–6 s and there is nothing to time.",
              inLevel: "the fill source for step 2; step 3 unticks it again." },
    viewParams: { gaugeField: "head", mode: "0" },
    digitNote: "your tank 2 width is DRAWN: A₂ = 0.50 + 0.25·d m, so its far wall goes at x = 3.60 + A₂. Your target level h* = (3.96 + 1.25·A₂)/(1.978 + A₂)",
    setup: ["Move tank 2's far wall to x = 3.60 + your own A₂ (erase the shipped one first).",
            "With the valve OPEN, fill tank 1 to 2.00 m from the reservoir; shut it (V) as tank 2 reaches 0.50 m.",
            "Untick Upstream reservoir AND set the Left edge back to Wall, or it leaks through the run.",
            "Let it stand, read both cards while the water is still, then press V and time the fall."],
    instruments: [
      { tool: "gauge", where: "x ≈ 0.9 m, y ≈ 0.30 m", why: "tank 1 — the fall you time" },
      { tool: "gauge", where: "x ≈ 4.6 m, y ≈ 0.30 m", why: "tank 2 — the level it is finding" },
    ],
    start: "twin tanks joined by a valved pipe, both empty",
    task: "Follow the steps to fill and isolate, then press V and time tank 1 falling from 2.00 m to your own h*.",
    settle: 5,
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
    rigWhy: { twLevel: "makes the duct run full under head-driven inflow." },
    viewParams: { mode: "1" },
    digit: { label: "reservoir level", control: "inLevel", base: 1.70, step: 0.06, unit: "m",
             rule: "level = 1.70 + 0.06·d" },
    instruments: [
      { tool: "gauge", where: "x = 2.4 m, y = 0.85 m", why: "the barrel" },
      { tool: "gauge", where: "x = 5.0 m, y = 0.85 m", why: "the throat — SAME height, or Δh is not a pressure difference" },
    ],
    start: "a venturi duct running full from a reservoir",
    task: "Set your reservoir level, put both gauges at the SAME height - barrel and throat - for the pressure difference, and hover the barrel for q.",
    settle: 15,
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
    digitNote: "your lip: d mod 3 gives 0 sharp edge (draw nothing), 1 bellmouth, 2 Borda re-entrant",
    start: "a tank draining through a sharp-edged orifice",
    task: "Your digit loads its lip already drawn — check it against your row, then zoom into the wall exit and read C_c as the narrowest jet core divided by the opening height (station x = 2.41 m, or 2.44 m for the Borda tube).",
    settle: 55,
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
    digitNote: "your middle tank's start level: z_B = 1.30 + 0.16·d m, POURED by right-drag, so read what it settles to",
    setup: ["The rig loads with the valve SHUT and both level controls off.",
            "Tick Upstream reservoir (3.20 m) and Tailwater control (0.60 m) to hold A and C.",
            "Right-drag to pour tank B up to your own level, then wait 10 s and read what it settles to.",
            "Press V — all three branches release together — and read the junction gauge 3 s later."],
    instruments: [
      { tool: "gauge", where: "x ≈ 0.75 m, y ≈ 0.20 m", why: "reservoir A" },
      { tool: "gauge", where: "x ≈ 2.78 m, just ABOVE y = 1.0", why: "tank B — lower than that is inside the shut valve's solid and reads a false dry" },
      { tool: "gauge", where: "x ≈ 5.05 m, y ≈ 0.20 m", why: "reservoir C" },
      { tool: "gauge", where: "x ≈ 2.78 m, y ≈ 0.50 m", why: "the junction head, 3 s after the release" },
    ],
    start: "three tanks on one junction, valve shut and both controls off",
    task: "Follow the steps to hold A and C and pour B to your own level, then press V and read B's direction and the junction head 3 s later.",
    settle: 20,
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
    rigWhy: { spoutVx: "the dry-weather flow the 45 s pre-charge runs at — the storm ramp up from it is yours." },
    viewParams: { gaugeField: "depth", dye: true, dyeDecay: 0 },
    digitNote: "your throttle is DRAWN: r = d mod 4 gives 2 / 4 / 6 / 8 cells erased straight down x = 4 m",
    setup: ["Press Z once — the rig ships with a 6-cell throttle already cut, and undo restores the whole floor so every rung starts equal (an erase stroke can widen a hole, never narrow it).",
            "Cut your own throttle: press [ twenty times to shrink the erase brush, then ] once / 3 / 5 / 6 times for r = 0 / 1 / 2 / 3, and erase down the x = 4 m line.",
            "Settle 45 s at dry-weather flow (spout velocity 0.50 m/s) — the chamber must be pre-charged or the first flush is invisible.",
            "Ramp the spout in 0.25 m/s steps held 10 s to bracket the spill, then 0.08 m/s steps held 20 s to pin it.",
            "First spill is the chamber gauge one cell over the crest with a continuous sheet; then hover the sewer at x ≈ 2 m for q."],
    instruments: [
      { tool: "gauge", where: "x ≈ 4.25 m, y ≈ 1.62 m", why: "the chamber at crest level — first spill is this gauge ≥ crest + 1 cell" },
    ],
    start: "a sewer feeding a CSO chamber with a spill crest",
    task: "Cut your own throttle, pre-charge at dry-weather flow, then ramp the storm inflow until the chamber first spills over the crest, and read q off the hover over the sewer.",
    settle: 20,
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
    secondScene: { scene: "waveshallow", when: "second half - switch to waveshallow (Scenes menu) and repeat on the shallow rows, T = 3.0 to 6.0 s." },
    start: "a deep wave flume with a paddle at the left end",
    task: "Set your period and stroke, zoom onto the paddle, then pause and read one crest-to-crest wavelength off the scale bar.",
    settle: 40,
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
    secondScene: { scene: "wavedeep", when: "even digits only - repeat on wavedeep (Scenes menu) with the same two gauges at x ≈ 1.2 m, where a bed trace of pure noise IS the answer." },
    start: "a wave flume with a beach, paddle at the left end",
    task: "Set your period and stroke, put two gauges on one vertical near the paddle - one low, one three-quarters up - then read each trace's peak-to-peak swing and divide bed by surface.",
    settle: 20,
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
    secondScene: { scene: "wave", when: "contrast run - repeat on wave (Scenes menu) with your d mod 3 row from the brief, submitted as series = spilling; its flat run is x = 0.65-1.15 m, stepped by 0.1 m." },
    start: "a steep sea wall at the end of a wave flume",
    task: "Set your period and stroke, slide one gauge along the flat run in 0.2 m steps, note the biggest swing and the smallest, and take K_refl = (a_max − a_min)/(a_max + a_min).",
    settle: 45,
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
    start: "the deep flume with a column of tracer particles",
    task: "Set your period and stroke, zoom on the tracer column (it arrives placed, at ×6 vertical exaggeration), then pause and read the VERTICAL extent of the surface trail against the bed trail.",
    settle: 40,
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
    digitNote: "assigned by CELL, not by digit - your row gives a scene, a period and an amplitude. wave: (0.70,0.035) (0.90,0.045) (1.10,0.055) (1.50,0.060) (2.10,0.070) (3.00,0.055) (4.00,0.045) (5.00,0.035) (6.00,0.030); wavesurge: (0.80,0.060) (1.40,0.130) (1.40,0.173) (1.80,0.080) (3.00,0.140) (4.20,0.199)",
    secondScene: { scene: "wavesurge", when: "half the cells live on the other beach - if your row is a wavesurge one, switch scene before setting the period." },
    start: "a wave flume with a beach; your cell decides which flume",
    task: "Set your cell's period and amplitude, wait out spin-up plus 15–20 s of transit, then classify what the wave does on the beach - spilling, surging or dies - and count scale-bar lengths of surf.",
    settle: 40,
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
    start: "a long shallow flume with a paddle and two gauge stations",
    task: "Set your period and stroke, then read H crest-to-trough and L from the lag between the two gauges over 20–30 s of cycles, and compute U_r = H·L²/h³ with h = 0.348 m. Read the crest/trough ratio — crest above the mean over trough below it — off the same trace.",
    settle: 42,
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
    digitNote: "your scale third is d mod 3: λ = 1, ½ or ¼, and the drawing loads with your digit",
    instruments: [
      { tool: "gauge", where: "the approach pool: x = 2.17 / 1.09 / 0.54 m for λ = 1 / ½ / ¼ (y ≈ 1.25 / 0.90 / 0.72)", why: "h, and H = h − P" },
    ],
    start: "a broad-crested weir, drawn at your own scale",
    task: "Set your scaled q and its paired reservoir level, then read the gauge depth h and report the head over the crest, H = h − P.",
    settle: 55,
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
    rigWhy: { twLevel: "the apron must drain actively: a bare open edge ponds and chokes the orifice within ~27 s." },
    viewParams: { gaugeField: "head", mode: "0" },
    studentParams: [
      { control: "inflowOn", value: true, rule: "step 2 — the fill source, then untick it again for step 3" },
      { control: "inLevel", unit: "m", rule: "your own h_start: 1.80 / 1.35 / 0.90 / 0.45 m for λ = 1 / ¾ / ½ / ¼" },
    ],
    digitNote: "your scale is r = d mod 4, λ = 1 − 0.25·r. Fill to h_start = 1.80 / 1.35 / 0.90 / 0.45 m and stop at 0.60 / 0.45 / 0.30 / 0.15 m",
    setup: ["The tank loads empty with the valve shut: the fill is part of the experiment.",
            "Fill from the reservoir to your own h_start.",
            "Untick Upstream reservoir AND set the Left edge back to Wall, then let it stand.",
            "Press V and time the fall to h_stop on the status-bar clock."],
    instruments: [
      { tool: "gauge", where: "in the tank, near the floor: x ≈ 2.25 / 1.69 / 1.13 / 0.56 m for λ = 1 / ¾ / ½ / ¼", why: "the falling level you time" },
      { tool: "gauge", where: "on the apron beyond the plate (x ≈ 5.5 / 4.4 / 3.3 / 2.1 m, y ≈ 0.02 m)", why: "confirms the apron is draining, not ponding" },
    ],
    start: "a tank and orifice at your own scale, loaded empty",
    task: "Follow the steps to fill and isolate, then press V and time the fall from h_start to h_stop on the status-bar clock.",
    settle: 5,
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
    digitNote: "even digit gives Low, odd gives High. Never Very high or Ultra - DA-1's weir will not settle there",
    instruments: [
      { tool: "gauge", where: "the same approach-pool station as DA-1: x = 2.17 / 1.09 / 0.54 m for λ = 1 / ½ / ¼", why: "h, and it must not move between the two resolutions" },
    ],
    start: "your own DA-1 weir, at the Resolution it was captured on",
    task: "Keep your own DA-1 weir, q and level exactly as they are and change ONLY the Resolution, then re-read H at the same station and recompute C_d.",
    settle: 55,
  },
];
