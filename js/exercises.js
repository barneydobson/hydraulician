"use strict";
/**
 * exercises.js — the teaching pack as data.
 *
 * The card is the complete student exercise: setup, assignment, actions and
 * readings, including any data/formulas needed to do it without another
 * document. Each folder's README is lecturer-only: derivation, worked
 * answers and verification. HS-1 is the model for a concise standalone card.
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
 *                  as load-bearing (FR-1's 2.50 m tailwater, DA-1's Very high
 *                  resolution). CONTROLS ids → values;
 *                  key ORDER matters, because ticking a level control opens its
 *                  own edge, so edges come first.
 *   viewParams     APPLIED. Display and readout only — Field, Gauges plot,
 *                  the overlays, Speed, tracers, dye. These set no physics and
 *                  give nothing away; they are how the demo is meant to be
 *                  LOOKED at (UN-3 is unreadable on the Head channel).
 *   studentParams  DISPLAYED, NEVER APPLIED. Values the worksheet asks the
 *                  student to set, that no digit rule covers — a staged step
 *                  (B9's two level controls), an assigned cell (B5). Each is
 *                  {control, value?, unit?, rule?, slider?, label?}. The card
 *                  draws the control as a field to set; a Geometry row is a
 *                  slider, and `slider: {min, max, step}` makes any other
 *                  numeric row one too, over the range worth playing in
 *                  (UP-1's c). `label` renames the row on the card only.
 *                  Slider rows sit under "Try it yourself" when the entry has no digit.
 *   digit          DISPLAYED, NEVER APPLIED (with one exception, below). The
 *                  personalised parameter: `base` + `step`·d, or a per-digit
 *                  `table` where the measured rule is not linear, `mod: N` for
 *                  "d mod N" rules, `also: [...]` for the coupled values the
 *                  worksheet makes them derive, `rule` for the sentence that
 *                  says WHY (HJ-1's 1.3·d_c). The card prints the RULE and the
 *                  panel row it goes on — "q (m²/s): q = 0.42 + 0.03·d" — and
 *                  the student does the arithmetic; d is their student
 *                  number's last digit and the lecturer owns explaining it.
 *                  Nothing is computed or written for them.
 *
 * The exception: `rigTable` picks WHICH captured drawing loads, because B8's
 * three orifice lips are different rigs, not different numbers, and nobody is
 * going to hand-draw them. Geometry is part of the common starting point.
 *
 * OTHER FIELDS
 *   id       programme id, e.g. "HJ-1"           title    the README's own h1
 *   aim      optional: one or two plain sentences on what the scene is and
 *            what the student does in it. When present the exercise menu
 *            prints it under the title (instead of the start · ?scene · settle
 *            line) and the start screen shows it on hover; it is NOT on the
 *            card. Written in the vocabulary of the lecture it is used in.
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
 *   aim      optional: ONE line on what the exercise is for; the exercise
 *            menu shows it in place of `start`.
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
 *   rigWhy   why a `rigParams` value is what it is, keyed by the same control
 *            id — "at the stock 0.16 the tanks equalise in 2–6 s and there is
 *            nothing to time". Maintenance prose, like `instruments[].why`:
 *            NOT printed on the card. It exists so the next person to touch a
 *            load-bearing constant knows what it is holding up.
 *   secondScene  an optional coda the card offers as a suggestion — {scene,
 *            when}. Nothing is applied; the student switches by hand from the
 *            Scenes menu, and `when` is the sentence that says why.
 *   ui       the UI PROFILE: what of the interface this exercise wants in
 *            front of a student (UIMODE in js/main.js). Families are `build`,
 *            `measure` and `view` — each `true`, `false`, or the list of tool
 *            ids that survive — plus `fields` (which colourings the legend
 *            offers), `panel` ("full" / "focused" / "shut"), `controls`
 *            (the individual Controls-panel row ids that survive) and
 *            `readouts` ({gauges, cursor, status}).
 *
 *            MOSTLY IT IS DERIVED, so most entries carry no `ui` at all.
 *            `instruments` narrows MEASURE to the tools it names; an entry
 *            naming no build tool loses BUILD, on the reasoning that an
 *            exercise arrives with its rig already built; and the panel opens
 *            focused on the sections its own controls live in. What you write
 *            here is merged ON TOP of that derivation.
 *
 *            SO: a card whose `task` or `setup` tells a student to draw, cut,
 *            erase or move something MUST say `ui: { build: true }` or name a
 *            build tool in `instruments`. Otherwise the derivation takes the
 *            tools away and the student is told "Erase is off for this
 *            exercise" by a card that just told them to erase. check_pack.py
 *            fails the pack over it, because the alternative is a tool that is
 *            silently not there.
 *
 *            A profile is never a cage — the `⋯` on the strip restores
 *            everything in one click, which is what keeps the standing
 *            acceptance test (the sandbox reproduces any scene by hand) true.
 *
 * A card must stand alone. `start` describes the bench, `instruments.where`
 * gives the stations and `task` says what to do and read afterwards. Use
 * `setup` for ordered steps and necessary calculation data. Do not send the
 * student to the README for an equation, a procedure or what to record.
 * Derivations, worked answers and verification remain in lecturer notes.
 *
 * Standing rules every worksheet carries: Resolution Medium · wait out the
 * settle · median-of-the-wobble reads, never one frame · after changing q,
 * re-check any tailwater ≥ 1.3·d_c · keep the tab visible.
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
    viewParams: { channel: true, jumps: false },
    digit: { label: "q", control: "inQ", base: 0.80, step: 0.04, unit: "m²/s",
             rule: "q = 0.80 + 0.04·d" },
    ui: {
      measure: false,
      view: ["legendBtn", "chanBtn"],
      controls: ["speed", "inQ"],
      readouts: { rows: ["pos", "d", "q", "dn"] },
    },
    start: "a steep chute running uniform flow, with your own inflow to set",
    task: "Set your q, then hover mid-chute at x ≈ 3.5 m and read the MEASURED d_n off the hover box.",
    settle: 15,
  },
  {
    id: "GV-1",
    title: "The class digitises the backwater curve",
    topic: "Gradually varied flow",
    folder: "GV-1-backwater",
    scene: "m1",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: true, labels: true, jumps: false },
    digitNote: "your station: x = 1 + d metres",
    ui: {
      measure: false,
      view: ["legendBtn", "chanBtn"],
      controls: ["speed"],
      readouts: { rows: ["pos", "d", "eta"] },
    },
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
    // Drawn by the student, so the BUILD family stays: without this the
    // derived profile hides the tools the task asks for.
    ui: {
      build: ["wall", "erase", "undoBtn", "clearBtn"],
      measure: ["measure"],
      view: ["legendBtn", "chanBtn"],
      controls: ["speed", "inflowOn", "inLevel", "inQ", "inFree", "twOn", "twLevel", "openL", "openR", "openB", "labels", "jumps"],
    },
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
    viewParams: { jumps: true, channel: true, labels: false },
    digit: { label: "q", control: "inQ", base: 0.42, step: 0.03, unit: "m²/s",
             rule: "q = 0.42 + 0.03·d",
             also: [{ label: "tailwater", control: "twLevel", unit: "m",
                      // 1.75·d_c above the apron (0.15 m), every digit: the
                      // conjugate of the sheet landing on the apron. MEASURED
                      // across the ladder (Medium): the jump stands on the
                      // apron with d₂ −2% to +5% of Bélanger; at 1.6·d_c it is
                      // against the outlet, at 1.9·d_c on the chute toe.
                      rule: "0.15 + 1.75 · d_c — check it yourself against the d_c the q slider prints",
                      table: [0.609, 0.630, 0.650, 0.671, 0.693,
                              0.712, 0.731, 0.750, 0.769, 0.789] }] },
    secondScene: { scene: "s1", when: "optional coda - switch to s1 (Scenes menu) for the same jump on a 1-in-4 bed, tailwater 1.15 / 1.25 / 1.35 m, and expect d₂ under Bélanger." },
    ui: { measure: false, view: ["legendBtn"], controls: ["speed", "inQ", "twLevel"] },
    start: "a chute onto a level apron, with a tailwater control",
    task: "Set your q and its paired tailwater, let the jump settle on the apron, then read Fr₁ and d₂/d₁ off the jump box over ~10 s.",
    settle: 20,
  },

  // ---------------------------------------------------- natural channels
  // A current-meter gauging, done twice on the `gauging` reach: once with the
  // reservoir level giving a vertical shallower than 0.75 m, where field
  // practice takes one point at 0.6 d, and once deeper, where it takes 0.2 d
  // and 0.8 d. The student reads all three points both times, on gauges set
  // to Speed, and judges each rule against the rake's full integral, in
  // Average mode, because a current meter's count is a time mean. The
  // station is the student's own choice; the README shows what a station
  // near the inlet or the lip does to the answer.
  {
    id: "NC-2",
    title: "Gauging a vertical: the 0.6-depth and two-point methods",
    topic: "Natural channels",
    folder: "NC-2-gauging-methods",
    scene: "gauging",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", gaugeField: "speed", channel: false, particles: false },
    digitNote: "no digit: choose your own station, clear of the inlet and the lip",
    studentParams: [
      { control: "inLevel", value: 0.68, unit: "m", rule: "shallow run (d ≈ 0.4 m all along the reach)" },
      { control: "inLevel", value: 1.33, unit: "m", rule: "deep run (d ≈ 0.8–1.0 m, shallower near the lip)" },
    ],
    instruments: [
      { tool: "gauge", where: "three at your station x: at z = η − 0.2 d, η − 0.6 d and η − 0.8 d", why: "on Speed, each reads the point velocity a current meter would at that depth" },
      { tool: "rake", where: "at the same x, through the whole depth", why: "the rake's V is the full depth-integral both rules are judged against" },
    ],
    ui: {
      view: ["legendBtn", "avgBtn"],
      fields: ["speed"],
      controls: ["speed", "inLevel"],
      readouts: { rows: ["pos", "d", "eta", "uw"] },
    },
    start: "a 35 m channel at 1 in 400 fed by a reservoir and ending in a free overfall; the reservoir level sets the flow",
    setup: [
      "Shallow run: set Controls → Reservoir level to 0.68 m and press R; the card counts the settle down. Choose a station x well clear of the inlet and the lip.",
      "Hover at x and read the depth d and the level η off the box. Place three Gauges (5) at x, at z = η − 0.2 d, η − 0.6 d and η − 0.8 d (the box's x, z row shows where the cursor is), and a Rake (6) at the same x.",
      "Press A (Average) and wait until the legend's T passes 15 s. Read u₀.₂, u₀.₆ and u₀.₈ off the three gauge cards and V off the rake's chip. One-point rule V₁ = u₀.₆; two-point rule V₂ = ½(u₀.₂ + u₀.₈); each rule's error is 100·(V_rule/V − 1) %.",
      "Deep run: set the level to 1.33 m and press R. After the settle, read d and η again at the same x, click each gauge with the Gauge tool to clear it, place three at the new depths, and repeat.",
    ],
    task: "Submit x, d, u₀.₂, u₀.₆, u₀.₈ and V for both runs. Field practice uses one point below 0.75 m and two above it: which rule lands closer to V on each run, by how much, and where does the rake put the fastest water?",
    settle: 40,
  },
  {
    id: "NC-3",
    title: "Bed shear and the riprap size",
    topic: "Natural channels",
    folder: "NC-3-bed-shear",
    scene: "s2",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { channel: false },
    digit: { label: "q", control: "inQ", base: 0.80, step: 0.04, unit: "m²/s",
             rule: "q = 0.80 + 0.04·d" },
    secondScene: { scene: "m2", when: "Part B - open m2 (Scenes menu), touch nothing, wait out the 30 s spin-up and compare at x ≈ 7 m." },
    ui: {
      measure: false,
      view: ["legendBtn"],
      controls: ["speed", "inQ"],
      readouts: { rows: ["pos", "d", "Sf"] },
    },
    start: "the steep flume, with your own inflow to set",
    task: "Hover at x ≈ 3.5 m and read h and S_f, then τ₀ = ρg·h·S_f and D_min = τ₀/[0.056(ρₛ−ρ)g].",
    settle: 15,
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
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "d" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "q = 0.15 + 0.05·d (d = 0…8; if your last digit is 9 use d = 8)",
             table: [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.55] },
    instruments: [
      { tool: "gauge", where: "x = 2.5 m, z = 0.75 m", why: "the upstream depth d₁ the prediction is built on" },
    ],
    ui: { build: ["wall", "undoBtn"], view: ["legendBtn"], controls: ["speed", "inQ"] },
    start: "a level reach held at both ends, and a hump to grow at x = 4.5 m",
    task: "Read d₁ at the gauge and commit a prediction Δz = E₁ − 1.5·d_c. Then grow a 1 m flat-topped hump at x = 4.5 m in steps (about 2 cm at a time near the end), jotting d₁ at each and re-settling, until the crest chokes — the d₁ from the LAST pre-choke step redoes the prediction as Δz_pred*.",
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
    viewParams: { mode: "3", channel: false, labels: false, jumps: false, gaugeField: "d" },
    digit: { label: "q", control: "inQ", unit: "m²/s",
             rule: "q = 0.15 + 0.05·d (d = 0…8; 9 → use 8)",
             table: [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.55],
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "level = 0.935 + 1.65·d_c + 0.03 — the pairing the pool needs at your q",
                      table: [1.182, 1.228, 1.271, 1.310, 1.348,
                              1.383, 1.417, 1.450, 1.482, 1.482] }] },
    instruments: [
      { tool: "gauge", where: "x = 6.85 m, z ≈ 1.13 m", why: "on the broad crest — reads d_crest" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inQ", "inLevel"] },
    start: "a reservoir feeding a broad crest that spills over a brink",
    task: "Set your q and its paired level, then read d_c off the q slider, d_crest at the gauge on the crest and d_brink at the last wet column on the lip, and order the three.",
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
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "d" },
    digit: { label: "q", control: "inQ", base: 0.10, step: 0.05, unit: "m²/s",
             rule: "q = 0.10 + 0.05·d",
             also: [{ label: "reservoir", control: "inLevel", unit: "m",
                      rule: "the level paired with YOUR q — load-bearing, not a convenience (±0.1 m moves C_d by ~25%)",
                      table: [1.152, 1.195, 1.233, 1.261, 1.304,
                              1.326, 1.362, 1.389, 1.412, 1.434] }] },
    instruments: [
      { tool: "gauge", where: "x = 4.5 m, z ≈ 0.75 m", why: "the approach pool — H = h − 0.50" },
      { tool: "cv", where: "Control volume (9), optional: drag about (2.0, 0.3) → (6.7, 1.6) — bottom inside the bed, right face short of where the nappe lands", why: "F→ is the thrust the pool puts on the plate, against ρgP(h − P/2)" },
      { tool: "force", where: "the plate itself — pick the Pressure force tool and click it", why: "the same thrust, read straight off the pressure diagram cut off at the crest — no box to place at all" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inQ", "inLevel"] },
    start: "an approach pool behind a sharp-crested weir",
    task: "Set your q with its paired level, settle, then read the gauge card DEPTH h and take the head over the crest as H = h − 0.50. Optional: a Control volume round the plate, or the Pressure force tool clicked on the plate itself, both read F→ a few percent above ρgP(h − P/2).",
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
    viewParams: { mode: "0", channel: false, labels: false, jumps: false, gaugeField: "d" },
    digit: { label: "reservoir", control: "inLevel", unit: "m",
             rule: "the fixed point for q = 0.330 at YOUR gate opening",
             table: [1.7565, 1.7565, 1.4181, 1.4181, 1.4181,
                     1.2103, 1.2103, 1.2103, 1.0791, 1.0791] },
    digitNote: "your gate opening is DRAWN: a = 5 + round(3d/9) cells, gate bottom z = 0.609 / 0.630 / 0.652 / 0.674 m",
    instruments: [
      { tool: "gauge", where: "x = 3.5 m, z ≈ 0.65 m", why: "the upstream pool — reads d₀" },
      { tool: "cv", where: "Control volume (9): drag (3.50, 0.30) → (5.63, 3.20) — gauge station to vena station, bottom face inside the bed", why: "measures the thrust F_R predicts, on the same control volume and without its two assumptions" },
      { tool: "force", where: "the gate face itself — pick the Pressure force tool on the strip and click it", why: "the pressure diagram and F→ straight off the gate, a third reading beside F_R and the box" },
    ],
    ui: {
      build: ["wall", "erase", "undoBtn"],
      view: ["legendBtn"],
      controls: ["speed", "inLevel"],
    },
    start: "a pool behind a drawn sluice gate — its opening is yours to adjust",
    task: "Redraw the gate opening to your own row, set your reservoir level, then read d₀ at the gauge and d₁ by hovering the vena at x = 5.630 m, work out C_d and the gate thrust, measure that thrust with the Control volume, and click the gate itself with the Pressure force tool for the diagram it is drawn from.",
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
    viewParams: { mode: "2", channel: false, labels: false, jumps: false, gaugeField: "h" },
    digitNote: "no personalised parameter: everyone reads the same rig",
    instruments: [
      { tool: "cv", where: "Control volume (9): drag (0.85, 1.55) → (2.05, 3.20) — it encloses all four shapes and clears the spout", why: "F→ is the force each turn actually delivers, to set against ρqv(1−cosθ)" },
      { tool: "gauge", where: "in the free jet, ~0.25 m clear of the plate (README uses 0.95, 2.50)", why: "the approach head" },
      { tool: "gauge", where: "on the stagnation point, ~0.03 m off the plate face (README uses 1.32, 2.46)", why: "the stagnation head — the ratio is the answer" },
      { tool: "force", where: "the flat plate only — pick the Pressure force tool and click it", why: "F→ off the pressure diagram directly, on the ONE drawn wall the plate is. The ramp's face is oblique enough that the same click reads a third under the box (measured), and the corner and deep-V are two and three strokes the tool cannot sum — so the Control volume is what the series is actually read on" },
    ],
    ui: { build: ["wall", "erase", "undoBtn"], view: ["legendBtn"], controls: ["speed"] },
    start: "a horizontal jet from a spout striking a flat plate",
    task: "Redraw the deflector four ways - flat plate, 45° ramp, 90° corner, deep-V (apex 1.90, 2.40) - settling 3–5 s each, watch the force follow the turn angle on Field > Momentum flux, and read F→ off the Control volume for each. On the flat plate only, the Pressure force tool clicked on the plate reads the same number with no box. The deep-V under-delivers because it floods.",
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
      { tool: "gauge", where: "x = 4.0 m, z = 2.20 m", why: "H₁, mid-height in the bore and clear of the entry region" },
      { tool: "gauge", where: "x = 8.5 m, z = 2.20 m", why: "H₂ — L = 4.5 m, not 6 (README §5)" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inLevel"] },
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
      { tool: "gauge", where: "x = 3.4 m, z = 2.20 m", why: "H₁, in the 0.40 m bore upstream of the step" },
      { tool: "gauge", where: "x = 7.6 m, z = 2.10 m", why: "H₂ — LOW in the wide pipe; a centreline tap sign-flips the recovery" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inLevel"] },
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
      { tool: "gauge", where: "four gauges walked along the covered run, EVERY one at z = 2.35", why: "near the soffit — the HGL kink is what you are hunting" },
    ],
    ui: { build: ["wall", "erase", "undoBtn"], view: ["legendBtn"], controls: ["speed"] },
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
      { tool: "gauge", where: "x = 3.0 m, z = 0.60 m", why: "the flange, 1.0 m downstream of the pump" },
      { tool: "gauge", where: "x = 0.9 m, z = 1.0 m", why: "the sump's open water — H is gauge 1 minus gauge 2" },
    ],
    // Step 3 MOVES the spout, and the panel cannot: spoutOn/R/Vx/Vy are all
    // there, but the spout's POSITION is set only by dragging with the Spout
    // tool. The two gauges above would otherwise derive a measure-only profile
    // and take the one tool the sequence depends on off the strip.
    ui: { build: ["spout"], view: ["legendBtn"], controls: ["speed", "spoutOn", "spoutVx"] },
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
      { tool: "gauge", where: "x = 3.7 m, z = 2.20 m", why: "upstream of the hump station" },
      { tool: "gauge", where: "x = 8.0 m, z = 2.20 m", why: "downstream — interpolate the HGL at the crest between the two" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inLevel"] },
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
    viewParams: { mode: "2", particles: false },
    digitNote: "your nozzle gap is DRAWN: gap = 0.42 / 0.70 / 0.84 / 0.97 / 1.10 m by d mod 5",
    ui: {
      build: ["wall", "erase", "undoBtn"],
      measure: false,
      view: ["legendBtn"],
      controls: ["speed", "ruler"],
    },
    start: "a 49 m penstock from a high reservoir, throttled at x = 8 m, with a 0.84 m nozzle at x = 56.5 m",
    task: "Erase the nozzle plate at x = 56.5 m and redraw it at YOUR gap (two pieces about z = 3.5, ruler on), press R and wait out the 50 s, then hover mid-pipe for q and read the jet core speed in the Speed view at x ≈ 57 m.",
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
    viewParams: { mode: "2", channel: false, labels: false, jumps: false, gaugeField: "h" },
    digitNote: "lecturer demo: no personalised parameter",
    instruments: [
      { tool: "cv", where: "Control volume (9): drag (0.85, 1.55) → (2.05, 3.20), around the deflector and clear of the spout", why: "reads the momentum-theorem force on whatever it encloses — the number the demo is about" },
      { tool: "gauge", where: "optionally in the free jet and on the stagnation point (MO-2's two stations)", why: "head, if you want the ratio as well as the force" },
      { tool: "force", where: "the flat plate only — pick the Pressure force tool and click it", why: "F→ off the pressure diagram directly, on the ONE drawn wall the plate is; the 6-stroke cup and the deep-V's three strokes are why the Control volume stays how the rest of the demo is read" },
    ],
    ui: { build: true },
    start: "the jet-on-a-plate rig, as a lecturer demonstration",
    task: "Read F→ off the Control volume — or, on the flat plate only, click the deflector with the Pressure force tool for the same number with no box: about 4 kN/m. Redraw as the 6-stroke cup (README table) and the box reads about 7 — close to the factor of two; the cup is six drawn walls, so only the box sums it. The textbook deep-V reads only about 5 because it floods.",
    settle: 5,
  },

  {
    id: "HP-3",
    title: "Hydropower and unsteady flow: test the tutorial predictions",
    topic: "Hydropower",
    folder: "HP-3-surge-tower",
    scene: "hydro",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", gaugeField: "eta" },
    instruments: [
      { tool: "rake", where: "through the headrace at x ≈ 27 m; read the rake's depth-averaged V as V₀", why: "the worksheet needs the conduit mean velocity q/D, not a point velocity from one cell" },
      { tool: "gauge", where: "in the reservoir strip by the wall, x ≈ 6.6 m, z ≈ 20 m", why: "the reservoir level used as the datum for η₀" },
      { tool: "gauge", where: "in the surge shaft, x ≈ 50 m, z ≈ 18 m — expand its card (⤢) for the trace", why: "the shaft level on η before shutdown and the crest rise on d afterwards" },
    ],
    ui: { build: false,
      measure: ["rake", "gauge", "cv"],
      view: ["legendBtn"],
      fields: ["speed"],
      controls: ["gaugeField", "cvShow"],
      readouts: { rows: ["pos", "eta", "V", "uw"] },
    },
    start: "the fixed tutorial scheme: a 24.9 m reservoir, 42.4 m headrace, 3.0 m surge shaft and 0.48 m nozzle, running steadily",
    task: "Complete the sheet's measured column: V₀, headrace h_f, V_jet, P, η₀, k and η_max. Use the rake for depth-averaged V₀ and hover the horizontal jet for V_jet; read the two gauges on Level η, then switch them to Depth d, press V and read the first crest.",
    setup: [
      "Before the session calculate the predicted column from q₀ = 7.6 m²/s, L = 42.4 m, D_h = 3.05 m, D_s = 3.0 m, D_p = 2.4 m and λ = 0.03.",
      "After the settle, use η₀ = η_shaft − η_reservoir, h_f = −η₀ − V₀²/(2g), k = −η₀/V₀² and P = ½ρq₀V_jet².",
      "For the shutdown use rise = d_max − d₀ and η_max = rise + η₀. Press R and let the 60 s settle finish before any repeat.",
    ],
    note: "The green bar at x = 63.5 m is the turbine valve; V closes it instantaneously. Leave the fixed sheet geometry alone — the hidden Geometry controls and the maximum-power flow sweep are not part of this comparison.",
    settle: 60,
  },

  // ------------------------------------------------------- unsteady flow
  {
    id: "UN-1",
    title: "Celerity and water-hammer reflections",
    topic: "Water hammer",
    folder: "UN-1-celerity",
    scene: "hammer",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { speed: 0.02, gaugeField: "h" },
    instruments: [
      { tool: "gauge", where: "on the pipe axis (z = 3.5 m) at x = 10 m, 30 m and 50 m", why: "the 20 m spacing makes the wave celerity readable from successive arrival times and shows the reflected high- and low-pressure fronts" },
      { tool: "rake", where: "x = 20 m and 40 m", why: "the two velocity sections measure ΔV and show the change in flow as each incident and reflected front passes" },
    ],
    ui: { build: false,
      view: ["legendBtn", "partBtn"],
      controls: ["speed", "cel", "geom0"],
    },
    start: "a 60 m pipe from a reservoir to a valve, running steadily",
    task: "Set the nozzle width, place gauges at x = 10, 30 and 50 m and rakes at x = 20 and 40 m, then press V. Measure c and ΔV, calculate ΔH = ΔV·c/g, and use the particles to follow the high- and low-pressure reflections.",
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
      { tool: "gauge", where: "mid-pipe, x = 14 m, z = 2.4 m — expand its card (⤢) to read the trace", why: "the speed trace u_max and t_75 are read on" },
    ],
    ui: { view: ["legendBtn", "avgBtn"],
      controls: ["speed", "inLevel"],
    },
    start: "a reservoir feeding a 23 m pipe, full and still behind a shut valve",
    task: "Set your level, press R, let it settle; open the valve (V) and read the settled band as u_max and the first crossing of 0.75·u_max as t_75, timed from where the trace leaves zero. Read the reservoir level off its marker while the pipe flows.",
    settle: 30,
  },
  {
    id: "UN-3",
    title: "Surge tank: fit k to the decay",
    topic: "Water hammer",
    folder: "UN-3-surge-tank",
    scene: "hammer",
    rig: "UN-3",
    // Wave damping 0.03 is the rig's own; the d channel and ×2 speed are how
    // the mass oscillation is readable at all. inLevel here is the d = 5 rung
    // of the digit ladder — the student sets their own.
    rigParams: { budget: "Medium", inLevel: 12.0, bulk: 0.03, cel: 70 },
    rigWhy: { inLevel: "the scene default of 25 m fails containment; the ladder runs 10.0–13.6 m.",
              bulk: "the shipped value: 0.30 throttles the nozzle by 33% and corrupts the decay.",
              view: "d, because the h channel's ±6 m Joukowsky wave buries the 3 m mass oscillation." },
    viewParams: { gaugeField: "d", speed: 2, particles: false },
    digit: { label: "reservoir level", control: "inLevel", base: 10.0, step: 0.4,
             unit: "m", rule: "level = 10.0 + 0.4·d" },
    digitNote: "your reservoir level is a SLIDER, not a drawing — level = 10.0 + 0.4·d metres",
    instruments: [
      { tool: "gauge", where: "in the standpipe shaft, x ≈ 53 m, z ≈ 6 m", why: "the mass oscillation — the whole decay downloads from this gauge (Controls → Gauges → ⤓ CSV)" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inLevel", "gaugeInspect"] },
    start: "the penstock with nozzle, tee and standpipe already built — only the reservoir level is yours",
    task: "Set your level, gauge the shaft, slam the valve and let it swing five times. Download the gauge CSV (Controls → Gauges → ⤓ CSV), integrate the surge ODE beside it in Excel — the equations are in the README — and adjust k until the model matches the trace. Submit k.",
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
    viewParams: { gaugeField: "h", speed: 0.3, particles: false },
    digitNote: "your valve station is DRAWN: x_d = 12 + 4·d m, so L = x_d − 6 and your gauge goes at x_d − 3",
    instruments: [
      { tool: "gauge", where: "x = x_d − 3 (three metres upstream of YOUR OWN valve), z ≈ 3.5 m", why: "read near the reservoir instead and the sponge smears the trace" },
    ],
    ui: { build: ["valve", "undoBtn"], view: ["legendBtn"], controls: ["speed"] },
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
    viewParams: { speed: 0.2, gaugeField: "h", particles: false },
    studentParams: [
      { control: "cel", unit: "m/s", rule: "leg 1 at the scene's own c = 70, then set c = 140 for leg 2 — the celerity is the experiment, not a personalisation" },
    ],
    digitNote: "your nozzle gap is DRAWN: gap = 0.14 × (1 + (d mod 6)) m, exactly as UN-1. The celerity is not personalised",
    instruments: [
      { tool: "gauge", where: "x = 30 m, z = 3.5 m", why: "mid-pipe — the same station for both legs" },
    ],
    secondScene: { scene: null, when: "the second leg is the same scene, not another one - scale the post-slam wait and the read window by 70/c." },
    ui: { view: ["legendBtn"], controls: ["speed", "cel", "geom0"] },
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
    ui: { measure: ["gauge"], view: ["legendBtn"], controls: ["speed"] },
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
    viewParams: { speed: 0.15, gaugeField: "h" },
    digitNote: "your start level by digit: 1.98, 2.09, 2.20, 2.31, 2.62, 2.73, 2.84, 2.95, 3.04, 3.11 m. Stop at 1.80 m; depth h = level − 1.36 m",
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, z = 1.0 m", why: "low enough to stay submerged all the way down to η₂; on Head it reads the surface elevation directly" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "spoutOn"] },
    start: "a tall tank draining through an orifice, in slow motion",
    task: "Predict the drain time on paper first, from t = (2A/(C_d·a·√2g))(√h₁ − √h₂) with A = 1.90 m, a = 0.12 m, C_d = 0.61 × 0.97. Then gauge low in the tank, switch the spout off and time the real fall on the status-bar clock.",
    settle: 55,
  },
  {
    id: "QS-2",
    title: "Two tanks and two parallel ducts",
    topic: "Quasi-steady flow",
    folder: "QS-2-twin-tanks",
    scene: "two-tank",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { gaugeField: "h", mode: "1", grade: true, channel: false, particles: false, speed: 1 },
    digit: { label: "Left reservoir width B₁", control: "geom0", base: 6.75, step: 0.25, unit: "m",
      rule: "B₁ = 6.75 + 0.25·d",
      also: [{ label: "Right reservoir width B₂", control: "geom1", base: 3.75, step: 0.25, unit: "m",
        rule: "B₂ = 3.75 + 0.25·d" }] },
    instruments: [
      { tool: "gauge", where: "Head gauges at (5, 0.35) and (26.5, 0.35) m", why: "the two water levels; subtract to get the driving head difference" },
      { tool: "flux", where: "optional Flux lines at x = 17 m, drawn upwards across each duct", why: "the two parallel discharges add; both branches see the same head difference" },
    ],
    // Nothing is drawn — the widths are sliders — so BUILD goes with the
    // derivation, and the panel keeps only the two widths and the speed.
    ui: { view: ["legendBtn", "gradeBtn"],
      controls: ["speed", "geom0", "geom1"],
    },
    start: "two reservoirs at 3.00 and 1.20 m, joined by two full, identical 15 m × 0.10 m ducts; all quantities are per metre width",
    setup: ["Set both widths from your digit using the fields above or Controls → Geometry. Changing a width restarts the water and clock; keep Medium resolution.",
      "Predict the difference at 120 s: Δ = [√1.8 − 2.16(1/B₁ + 1/B₂)]². The total discharge law is q = 0.036√Δ m²/s.",
      "Predicted left fall = B₂(1.8−Δ)/(B₁+B₂); right rise = B₁(1.8−Δ)/(B₁+B₂)."],
    task: "Place two Head gauges (5), press R and watch the left reservoir fall as the right rises. Pause at 120 s on the simulation clock; record both changes, compare with your predictions to within 0.05 m, and explain why the narrower reservoir changes level faster.",
    settle: 0,
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
    viewParams: { mode: "1", channel: false },
    digit: { label: "reservoir level", control: "inLevel", base: 1.70, step: 0.06, unit: "m",
             rule: "level = 1.70 + 0.06·d" },
    instruments: [
      { tool: "gauge", where: "x = 2.4 m, z = 0.85 m", why: "the barrel" },
      { tool: "gauge", where: "x = 5.0 m, z = 0.85 m", why: "the throat — SAME height, or Δh is not a pressure difference" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inLevel"] },
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
    ui: { measure: ["measure"], view: ["legendBtn"], controls: ["speed"] },
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
    viewParams: { gaugeField: "h", mode: "0" },
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
      { tool: "gauge", where: "x ≈ 0.75 m, z ≈ 0.20 m", why: "reservoir A" },
      { tool: "gauge", where: "x ≈ 2.78 m, just ABOVE z = 1.0", why: "tank B — lower than that is inside the shut valve's solid and reads a false dry" },
      { tool: "gauge", where: "x ≈ 5.05 m, z ≈ 0.20 m", why: "reservoir C" },
      { tool: "gauge", where: "x ≈ 2.78 m, z ≈ 0.50 m", why: "the junction head, 3 s after the release" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "inflowOn", "inLevel", "twOn", "twLevel"] },
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
    viewParams: { gaugeField: "d", dye: true, dyeDecay: 0 },
    digitNote: "your throttle is DRAWN: r = d mod 4 gives 2 / 4 / 6 / 8 cells erased straight down x = 4 m",
    setup: ["Press Z once — the rig ships with a 6-cell throttle already cut, and undo restores the whole floor so every rung starts equal (an erase stroke can widen a hole, never narrow it).",
            "Cut your own throttle: press [ twenty times to shrink the erase brush, then ] once / 3 / 5 / 6 times for r = 0 / 1 / 2 / 3, and erase down the x = 4 m line.",
            "Settle 45 s at dry-weather flow (spout velocity 0.50 m/s) — the chamber must be pre-charged or the first flush is invisible.",
            "Ramp the spout in 0.25 m/s steps held 10 s to bracket the spill, then 0.08 m/s steps held 20 s to pin it.",
            "First spill is the chamber gauge one cell over the crest with a continuous sheet; then hover the sewer at x ≈ 2 m for q."],
    instruments: [
      { tool: "gauge", where: "x ≈ 4.25 m, z ≈ 1.62 m", why: "the chamber at crest level — first spill is this gauge ≥ crest + 1 cell" },
    ],
    // The task says "cut your own throttle" and the setup spends two steps on
    // the erase brush, so BUILD stays. The single gauge above would otherwise
    // derive a measure-only profile and the Erase tool would not be there.
    ui: {
      build: ["erase", "undoBtn"],
      view: ["legendBtn", "dyeBtn"],
      controls: ["speed", "spoutVx"],
    },
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
    viewParams: { particles: false },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table (it plateaus at 1.60 s from d = 7)",
             table: [0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.60, 1.60, 1.60],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period — a short wave with a long stroke just breaks at the paddle",
                      table: [0.05, 0.08, 0.11, 0.15, 0.19, 0.23, 0.28, 0.30, 0.30, 0.30] }] },
    secondScene: { scene: "waveshallow", when: "second half - switch to waveshallow (Scenes menu) and repeat on the shallow rows, T = 3.0 to 6.0 s." },
    ui: { measure: ["measure"], view: ["legendBtn"], controls: ["speed", "waveT", "waveA"] },
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
    viewParams: { gaugeField: "h", particles: false },
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
    ui: { view: ["legendBtn"], controls: ["speed", "waveT", "waveA"] },
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
    viewParams: { gaugeField: "d", particles: false },
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
    ui: { view: ["legendBtn"], controls: ["speed", "waveT", "waveA"] },
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
    viewParams: { tracerOn: true, tracerX: 5.84, tracerN: 9, tracerTrail: 3, vex: 6, particles: false },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table (same rows as WV-1)",
             table: [0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.60, 1.60, 1.60],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period",
                      table: [0.05, 0.08, 0.11, 0.15, 0.19, 0.23, 0.28, 0.30, 0.30, 0.30] }] },
    ui: { measure: false, view: ["legendBtn"], controls: ["speed", "waveT", "waveA"] },
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
    ui: {
      measure: ["measure"],
      view: ["legendBtn", "partBtn"],
      controls: ["speed", "waveT", "waveA"],
    },
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
    viewParams: { gaugeField: "d", particles: false },
    digit: { label: "period", control: "waveT", unit: "s",
             rule: "your row of the period table",
             table: [3.0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8, 5.1, 5.5, 6.0],
             also: [{ label: "stroke", control: "waveA", unit: "m",
                      rule: "the amplitude paired with YOUR period (it saturates at 0.30 m)",
                      table: [0.25, 0.265, 0.28, 0.29, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30] }] },
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, z = 0.20 m", why: "H crest-to-trough" },
      { tool: "gauge", where: "x = 1.8 m, z = 0.20 m", why: "the second station — L comes from the lag between the two" },
    ],
    ui: { view: ["legendBtn"], controls: ["speed", "waveT", "waveA"] },
    start: "a long shallow flume with a paddle and two gauge stations",
    task: "Set your period and stroke, then read H crest-to-trough and L from the lag between the two gauges over 20–30 s of cycles, and compute U_r = H·L²/h³ with h = 0.348 m. Read the crest/trough ratio — crest above the mean over trough below it — off the same trace.",
    settle: 42,
  },

  // ------------------------------------------------------ dimensional analysis
  {
    id: "DA-1",
    title: "Empty a tank of honey",
    topic: "Similitude",
    folder: "DA-1-empty-a-tank-of-honey",
    scene: "fluid-tanks",
    rig: null,
    // A quick exercise: each student drains the same pair of tanks at their
    // own L_r, once in water and once in honey, and submits V_r for each.
    // Pooled, water follows Froude's √L_r and honey falls away from it as the
    // model shrinks. Very high is the resolution the README's numbers were
    // measured at (the scene comment says why).
    rigParams: { budget: "Very high" },
    viewParams: { mode: "0", gaugeField: "d", particles: false },
    digit: { label: "Length ratio L_r", control: "geom0", base: 0.25, step: 0.05, rule: "L_r = 0.25 + 0.05·d" },
    instruments: [
      { tool: "gauge", where: "prototype: x = 1.6 m, 1.4 m in from the tank's outer left edge at x = 0.2 m (any height below the water)", why: "prototype depth d" },
      { tool: "gauge", where: "model: the same station scaled by L_r from the model's outer left edge at x = 5.2 m, i.e. x = 5.2 + 1.4 L_r m", why: "model depth d" },
    ],
    ui: { measure: ["gauge", "measure"], view: ["legendBtn"], fields: ["water", "speed"], controls: ["speed", "geom0", "geom1"] },
    start: "a 4 m prototype tank and a scale copy of it at length ratio L_r, both full of water, slots shut; per metre width",
    setup: ["Set Length ratio L_r from your digit (the field above, or Controls → Geometry). Both tanks refill.",
            "Place both Depth gauges (5): prototype at x = 1.6 m, model at x = 5.2 + 1.4 L_r m. Press V to open both slots together and let the tanks empty.",
            "Expand each gauge (⤢) and hover its trace. T_p is the time the prototype takes to fall from d = 2.50 m to 1.00 m; T_m is the model's time from 2.50 L_r to 1.00 L_r.",
            "Work out the time ratio T_r = T_m / T_p and the velocity ratio V_r = L_r / T_r. Froude scaling predicts V_r = √L_r.",
            "Set Controls → Geometry → Fluid to honey (both tanks refill) and repeat at the same L_r. The honey drains more slowly: allow about 15 s."],
    task: "Measure V_r in water and in honey, then submit Lr_water, Vr_water, Lr_honey and Vr_honey. The class pools them into one plot against L_r.",
    settle: 0,
  },


  {
    id: "DA-3",
    title: "Sloshing in a tank",
    topic: "Similitude",
    folder: "DA-3-sloshing-tank",
    scene: "slosh-tank",
    rig: null,
    // The tutorial sheet's in-app part: dimensional analysis says the period
    // depends on B/d alone (a/d small), so one run per B/d draws the whole
    // design chart K = T√(g/d) = φ(B/d). Nothing personal — every student
    // runs the same five tanks. The scene releases the tilt at t = 0, so
    // there is nothing to settle.
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", gaugeField: "d", particles: false },
    digitNote: "tutorial sheet: every student runs the same five tanks",
    instruments: [
      { tool: "gauge", where: "near the left wall: x = 0.5 m, low in the water", why: "the depth d there rises and falls once per period. Not right against the wall: a gauge's depth is smoothed over ±0.09 m and would take in the wall's own columns" },
    ],
    ui: { measure: ["gauge", "measure"], view: ["legendBtn"], fields: ["water", "speed"], controls: ["speed", "geom0", "geom1", "geom2"] },
    start: "a closed tank, length B = 4 m, depth d = 1.0 m, its surface tilted by a = 0.2 d and released at t = 0; per metre width",
    setup: ["Place a Depth gauge (5) near the left wall: x = 0.5 m, low in the water.",
            "Set Tank length B, Water depth d and Initial tilt a/d in Controls → Geometry. Each change restarts the slosh from t = 0; R also restarts it.",
            "Expand the gauge (⤢) and hover its trace. Read the times t₁ and t₄ of the first and fourth crests after the release; the period is T = (t₄ − t₁) / 3.",
            "The sheet's five models, one per value of B/d, all at a/d = 0.2 (B, d in m): A 1, 1.0; B 2, 1.0; C 4, 1.0; D 8, 1.0; E 8, 0.5.",
            "For each, K = T√(g/d): the period with the tank's size divided out, so any two tanks can be compared."],
    task: "Time the five tanks, work out K = T√(g/d) for each and plot K against B/d on the sheet's chart: the design chart, from five models instead of 125.",
    settle: 0,
  },

  // ------------------------------------------------------- hydrostatics
  // An exercise students play with (L3 Statics) on the `dyke` scene: no rig
  // payload, because the scene's own polygons ARE the rig, and no digit,
  // because the point is watched, not pooled. `settle: 0` is deliberate —
  // the water boots at rest and there is nothing to wait out; the wait that
  // matters is the ~45 s after V, which the card says to watch, not to time.
  {
    id: "HS-1",
    title: "Dike with a piezometer",
    aim: "Two reservoirs either side of a dike, joined by a culvert with a piezometer tube — see connected still water stand at one level, and read the pressure force on the dike.",
    topic: "Hydrostatics",
    folder: "HS-1-dyke-piezometer",
    scene: "dyke",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: true },
    // L3 Statics. The Pressure force tool is the one instrument (lecturer,
    // Oct 2026: no gauges); levels are read off the scale or the hover card.
    instruments: [
      { tool: "force", where: "Pressure force tool: click the sloped upstream face of the dike; click the same block again for its culvert roof; then click the downstream face of the block past the piezometer", why: "½ρg·d² sideways on each face (28.2 and 11.0 kN/m shut), plus the weight of the water on the slope downward on the upstream one, and the push up on the roof; after V both faces read 24.2 kN/m sideways" },
    ],
    ui: { view: ["legendBtn", "partBtn"], fields: ["water", "phead"], panel: "shut",
          readouts: { rows: ["pos", "eta", "uw", "phead"] } },
    start: "two reservoirs either side of a dike — water at 3.50 m on the left, 2.60 m on the right — joined by a culvert under the dike, shut by a valve; a piezometer (an open tube) rises from the culvert roof",
    setup: [
      "Look first. With the valve shut, the left reservoir, the culvert and the piezometer tube are one connected body of still water — so the water stands at the same level in all three, 3.50 m, even though the culvert runs under the dike.",
      "In still water the pressure is hydrostatic: it increases with depth, p = ρg × (depth below the surface), and depends only on the depth, not on the shape of the container.",
      "Open Field & legend on the strip and choose Pressure head. Pressure head is the pressure divided by ρg — the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher. Hover the water: it is just the depth below the surface.",
      "Pick the Pressure force tool on the strip and click the sloped upstream face of the dike. The arrows show the pressure on the face, growing with depth; the label gives the force.",
      "Compare the sideways part of that force with ½ρg·d², with d = 3.50 − 1.10 = 2.40 m (ρ = 1000 kg/m³, g = 9.81 m/s²).",
      "Click the same block again to see its culvert roof: the water pushes it up. Then click the downstream face of the block past the piezometer (d = 2.60 − 1.10 = 1.50 m).",
      "Press V to open the valve. Watch the water flow through the culvert and the small right reservoir fill.",
      "Wait until everything is still again (about 45 s). Notice that both reservoirs and the piezometer now stand at one level.",
      "Click the two faces again: the sideways forces are now equal and opposite.",
    ],
    task: "With the valve shut, read the force on each face of the dike and compare it with ½ρg·d²; open the valve, wait until the water is still, and read them again: one level, equal forces.",
    settle: 0,
  },

  // ===== Year 1: UP-1 =====
  // L2 Fundamentals: the speed of sound in a pipe, on the `pipeline` scene
  // (reservoir → straight pipe → valve → overflowing tank), written for this
  // item because hammer's nozzle outlet muddied the picture. No digit; the
  // two card sliders are the experiment: c (the slot celerity, called the
  // speed of sound on the card) and the tank's overflow crest, which sets the
  // pipe speed v₀. c = 30 by default: with v₀ ≈ 2.25 m/s the jump c·v₀/g ≈ 7 m
  // stays under the ~9 m of water over the pipe's crown, so the return wave
  // does not empty it (measured in the brief: 2.3 m left at the default, 0.75
  // m at the lowest crest). The card slider stops at 35 (0.5 m left at the
  // default crest; at the lowest crest it separates) and at 20 below, where
  // the slot's compression already makes the wave ~9% faster than c. Speed
  // ×0.25 (was ×0.1, which made the run crawl once the settle ended) so the
  // wave crosses the 47 m pipe in ~6 s of wall clock. L2 vocabulary: no head
  // other than the Pressure head field, which the first step explains.
  {
    id: "UP-1",
    title: "Pressure travels at the speed of sound",
    aim: "Shut a valve at the end of a long pipe and watch the pressure jump run back up it at the speed of sound, reflect and return.",
    topic: "Unsteady pipe flow",
    folder: "UP-1-water-hammer",
    scene: "pipeline",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "1", particles: true, gaugeField: "speed", speed: 0.25 },
    studentParams: [
      { control: "cel", label: "Speed of sound c", unit: "m/s", slider: { min: 20, max: 35, step: 1 },
        rule: "the speed of sound in the pipe, 30 m/s as the card opens. A real water main is nearer 1200 m/s; here it is slow so you can watch the wave." },
      { control: "geom0", unit: "m",
        rule: "the overflow crest in the tank on the right, 10.6 m as the card opens. Lower it and the water in the pipe runs faster. Changing it restarts the water." },
    ],
    instruments: [
      { tool: "gauge", where: "on the pipe's centre line, z = 2.5 m, at x = 14, 30 and 46 m (16 m apart; the valve is at x = 52 m)", why: "three stations 16 m apart: the arrival delay 16/c is 0.53 s at c = 30 and 0.80 s at c = 20; the 46 m gauge sits near the valve and sees the full jump for 2L/c" },
    ],
    // The corner gauge cards are withheld: three of them stack over the
    // downstream end of the pipe and hide the valve and the 46 m gauge. The
    // inspector windows are the time series instead, and can be parked in
    // the empty space above the pipe. The gauges plot speed (L2 knows it;
    // piezometric head is L7), and the hover readout is cut to position,
    // velocity and pressure head.
    ui: { view: ["legendBtn", "partBtn"], fields: ["phead", "water", "speed"],
      controls: ["cel", "geom0", "speed", "gaugeInspect"],
      readouts: { gauges: false, rows: ["pos", "uw", "phead"] } },
    start: "a reservoir feeding a long straight pipe (2 m wide, 47 m long) that ends in an open valve and a small tank; the water flows steadily to the right",
    setup: [
      "The colour is Pressure head: the pressure divided by ρg, which is the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher.",
      "Place three Gauges (5) on the pipe's centre line, z = 2.5 m, at x = 14, 30 and 46 m.",
      "Open the three gauge windows from Controls → Gauge inspector and drag them into the empty space above the pipe. They plot the speed: read the pipe speed v₀.",
      "Press V (or Shift+V) to shut the valve suddenly. Watch the colour: a band of high pressure starts at the valve and runs up the pipe.",
      "Watch the gauge windows: the speed drops to zero at 46 m first, then at 30 m, then at 14 m — the moment the wave reaches each one.",
      "Pause (space). Hover each trace to read when its speed dropped. The time between two gauges 16 m apart is 16/c.",
      "Hover the cursor on the pipe either side of the wave front and read the pressure head: it jumps by about c·v₀/g (g = 9.81 m/s²).",
      "Run again: the wave bounces off the reservoir and comes back as low pressure, and keeps running up and down the pipe.",
      "Press V to open the valve, set the speed of sound c on the card to 20 m/s, press R and wait for the countdown, then press V again.",
    ],
    task: "Check that the wave takes 16/c to travel between gauges and that the pressure head jumps by about c·v₀/g. Lower c from 30 to 20: the wave takes about 1.5 times as long and the jump is smaller. Lower the overflow crest: the water runs faster and the jump grows.",
    settle: 25,
  },
  // ===== Year 1: contraction (FF-5, VC-1, MM-2) =====
  // Three questions asked of ONE scene, `contraction`: a 1.00 m pipe that
  // contracts into a 0.50 m pipe between two reservoirs held by head-driven
  // level controls. Geometry slider geom0 = contraction length L (3 m taper
  // → 0 m abrupt step); a change restarts the water (resetWater) and the
  // scene's measured spin-up runs flat out again, so every L is read steady.
  // Exercises students play with (the lecturer can show them in class): no
  // digit, nothing pooled; the slider is on the card through studentParams.
  {
    id: "FF-5",
    title: "Streamlines and separation",
    aim: "A pipe that narrows gently or suddenly — see the streamlines follow a taper but separate at a sharp step.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-5-contraction-streamlines",
    scene: "contraction",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true },
    studentParams: [
      { control: "geom0", unit: "m",
        rule: "3 m is a long, gentle taper; 0 m is an abrupt step. Each change restarts the flow — wait about 25 s." },
    ],
    // L4. Vorticity is never offered in Year 1: the separated corners are
    // read on Speed (slow eddies), with streamlines and the Average instead.
    ui: {
      measure: false,
      view: ["legendBtn", "partBtn", "slineBtn"],
      fields: ["water", "speed"],
      panel: "focused",
      controls: ["geom0"],
      readouts: { rows: ["pos", "uw"] },
    },
    start: "two reservoirs joined by a 1.00 m pipe that narrows into a 0.50 m pipe; the contraction is a gentle taper 3 m long",
    setup: [
      "Colour is Speed. Watch the particles: smooth paths that crowd together and speed up through the taper.",
      "Turn on Streamlines on the strip: they converge smoothly through the taper and never leave the walls.",
      "Slide Contraction length L on this card to 0 m — an abrupt step. The flow restarts.",
      "Look at the step: the flow cannot turn the sharp corners. It separates, slow eddies sit in the corners, and the jet narrows just past the edge (the vena contracta) before it fills the pipe.",
      "On the colour bar (the legend), switch from Live to Average and wait: the streamlines then show the mean flow past the step, steady even where the live flow flickers.",
    ],
    task: "Compare the taper (L = 3 m) with the step (L = 0): smooth converging streamlines against separation in the corners and a vena contracta past the edge.",
    settle: 25,
  },
  {
    id: "VC-1",
    title: "Continuity: Q in equals Q out",
    aim: "Water through a pipe that narrows — measure Q in the wide pipe, in the narrow pipe and round a control volume.",
    topic: "Volume conservation",
    folder: "VC-1-contraction-steady",
    scene: "contraction",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true },
    studentParams: [
      { control: "geom0", unit: "m",
        rule: "3 m is a gentle taper, 0 m an abrupt step. Each change restarts the flow — wait about 25 s before reading Q again." },
    ],
    instruments: [
      { tool: "flux", where: "Flux line: drag up across the wide pipe at x = 2.3 m, from z = 0.4 to 1.6 m", why: "Q₁ in the wide pipe" },
      { tool: "flux", where: "Flux line: drag up across the 0.50 m pipe at x = 7.0 m, from z = 0.4 to 1.6 m", why: "Q₂ in the 0.50 m pipe; equal to Q₁" },
      { tool: "cv", where: "Control volume: drag (2.3, 0.3) → (7.0, 1.65) — round the contraction, top and bottom inside the pipe walls", why: "Σ Q = 0: in on the left face, out on the right, nothing through the walls" },
    ],
    ui: {
      view: ["legendBtn", "partBtn", "slineBtn"],
      fields: ["water", "speed"],
      panel: "focused",
      controls: ["geom0", "cvShow", "fluxList"],
      readouts: { rows: ["pos", "uw"] },
    },
    start: "two reservoirs joined by a 1.00 m pipe that narrows into a 0.50 m pipe, running steadily; the contraction is a gentle taper 3 m long",
    setup: [
      "Lagrangian: follow one particle through the contraction — it speeds up, although the flow is steady and nothing on screen changes in time.",
      "Eulerian: pick the Flux line tool on the strip and drag one up across each pipe — the wide pipe at x = 2.3 m and the 0.50 m pipe at x = 7.0 m, from z = 0.4 to 1.6 m — and read Q in each.",
      "Pick the Control volume tool on the strip and drag a box from (2.3, 0.3) to (7.0, 1.65) round the contraction; read Q on each face and Σ Q under the box.",
      "Slide Contraction length L on this card to 0 m (an abrupt step): the flow restarts; after it settles read the three again.",
    ],
    task: "Check that Q₁ = Q₂ and Σ Q ≈ 0 for any contraction: the step changes the streamlines but lowers Q only a few per cent.",
    settle: 25,
  },
  {
    id: "MM-2",
    title: "Momentum: the force on a contraction",
    aim: "A pipe that narrows — find the force of the water on it from the momentum and the pressure at both ends, for a taper and a step.",
    topic: "Momentum conservation",
    folder: "MM-2-contraction-forces",
    scene: "contraction",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: false },
    studentParams: [
      { control: "geom0", unit: "m",
        rule: "3 m is a gentle taper, 0 m an abrupt step. Each change restarts the flow — wait about 25 s before reading the force." },
    ],
    instruments: [
      { tool: "flux", where: "Flux line: drag up across the wide pipe at x = 2.3 m, from z = 0.4 to 1.6 m", why: "section 1: Q, momentum flux M₁ = ρQU₁ and pressure force F₁ = p₁A₁" },
      { tool: "flux", where: "Flux line: drag up across the 0.50 m pipe at x = 7.0 m, from z = 0.4 to 1.6 m", why: "section 2; the card under the pair prints the force on what is between them" },
      { tool: "cv", where: "Control volume: drag (2.3, 0.3) → (7.0, 1.65), then press B until the faces read momentum + pressure; later move it to (7.0, 0.3) → (8.6, 1.65)", why: "F→ on the box is R, the force of the water on the contraction (plus the wall shear inside the box)" },
    ],
    ui: {
      view: ["legendBtn", "slineBtn"],
      fields: ["speed", "phead"],
      panel: "focused",
      controls: ["geom0", "cvShow", "fluxList"],
      readouts: { rows: ["pos", "uw", "phead"] },
    },
    start: "two reservoirs joined by a 1.00 m pipe that narrows into a 0.50 m pipe, running steadily; the contraction is a gentle taper 3 m long",
    setup: [
      "The Pressure head field shows the pressure. Pressure head is the pressure divided by ρg — the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher.",
      "With the Flux line tool on the strip drag one up across each pipe (x = 2.3 m and x = 7.0 m, z = 0.4 to 1.6 m: sections 1 and 2); with the Control volume tool drag a box between them, (2.3, 0.3) to (7.0, 1.65), and press B until its faces read momentum + pressure. Each section prints Q, M (momentum flux) and F (pressure force); the pair prints the force on what is between them.",
      "Check R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁) per metre width (A₁ = 1.00 m, A₂ = 0.50 m, U = Q/A) against the box's F→.",
      "Slide Contraction length L on this card to 0 m (an abrupt step), let it settle and read R again.",
      "Then put the box on the straight 0.50 m pipe instead, (7.0, 0.3) → (8.6, 1.65): momentum in = momentum out, so the pressure drop across it is balanced by the wall friction.",
    ],
    task: "R is set by the end sections: taper and step give nearly the same force; on a straight pipe the pressure drop is balanced by friction at the wall.",
    settle: 25,
  },
  // ===== Year 1: VC-2, MM-1 =====
  // Two exercises on scenes written for them (`fillleak`, `vane`). Each has
  // ONE slider, the scene's own param, on Controls → Geometry (geom0); MM-1
  // also puts it on the card (studentParams), since turning the plate is the
  // student's job.
  {
    id: "VC-2",
    title: "Storage = in − out",
    aim: "A tank filled from a spout and drained through a hole near the floor — predict the level at which the outflow balances the inflow, then check it.",
    topic: "Volume conservation",
    folder: "VC-2-fill-and-leak",
    scene: "fillleak",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: false, gaugeField: "eta" },
    studentParams: [
      { control: "geom0", unit: "m²/s",
        rule: "the flow into the tank from the spout, per metre width (0.25 as the card opens). Change it and the level finds a new balance." },
    ],
    // L5. The outlet starts OPEN (the scene's valveOpen, lecturer Oct 2026).
    // The orifice law is L7 (Bernoulli), so the card GIVES √(2gh) and keeps
    // storage = in − out central; C is what the students find.
    instruments: [
      { tool: "gauge", where: "x = 1.0 m, z = 0.6 m — low in the tank, clear of the falling inflow", why: "on Level η the gauge reads the free surface itself, and its chart is the level against time: a curve bending over to a plateau with the outlet open, a straight line with the valve shut" },
      { tool: "cv", where: "Control volume: drag (0.30, 0.40) → (2.70, 3.12) — round the whole tank, under the spout and across the outlet jet", why: "in through the top face, out through the right face, and the stored rate dV/dt — net + dV/dt = 0 at every instant" },
    ],
    ui: { view: ["legendBtn"], fields: ["water", "speed"], controls: ["speed", "geom0"],
          readouts: { rows: ["pos", "eta", "uw"] } },
    start: "a tank 2.00 m wide (S = 2.00 m² per metre width), filled from a spout at Inflow Q and draining through an open outlet in its right wall: a = 0.08 m tall, centred at z = 0.59 m",
    setup: [
      "Storage = in − out: S dh/dt = Q_in − Q_out. While more water comes in than goes out the level rises; it stops rising where Q_out = Q_in.",
      "The water leaves the outlet at a speed of about √(2gh), where h is the height of the water surface above the centre of the outlet (you will derive this in lecture 7). So Q_out = C·a·√(2gh) per metre width, with a = 0.08 m and C a number close to 1.",
      "Predict: set Q_out = Q_in and solve for h, h = (Q/(C·a))² / 2g. Work it out with C = 1 for Q = 0.25 m²/s (g = 9.81 m/s²); the level is then h + 0.59 m.",
      "Pick the Gauge tool on the strip and click at (1.0, 0.6): its chart is the water level in the tank. Wait until the level stops rising (about a minute) and read it; h = level − 0.59 m.",
      "Compare: the water settles higher than your C = 1 prediction. Find the C that makes the prediction match the level you read — the jet narrows just after it leaves the outlet, so less water gets out than C = 1 assumes.",
      "Slide Inflow Q on this card to another value, predict the new level with your C, and check it.",
      "Optional: press V to shut the valve. Now nothing goes out and the level climbs in a straight line, dh/dt = Q/S. Pick the Control volume tool on the strip and drag a box from (0.30, 0.40) to (2.70, 3.12) round the whole tank: it reads in, out and the rate the tank stores water. It counts outward as positive, net = out − in, so net = −S dh/dt. Press V again to reopen.",
    ],
    task: "Predict the level at which outflow equals inflow with C = 1, compare it with the level the tank settles to, find the C that matches, and check your C at a second inflow.",
    settle: 0,
  },
  {
    id: "MM-1",
    title: "The force of a jet on an inclined plate",
    topic: "Momentum conservation",
    folder: "MM-1-jet-inclined-plate",
    scene: "vane",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: false },
    aim: "Draw a control volume round a flat plate struck by a jet and find the force on it: it is at right angles to the plate, ρqU sin θ. Turning the plate also splits the jet unequally.",
    studentParams: [
      { control: "geom0", unit: "°",
        rule: "the angle between the jet and the plate: 90° (square to the jet) as the card opens; try 90, 75, 60, 45 and 30" },
    ],
    instruments: [
      { tool: "cv", where: "Control volume: drag (0.70, 0.30) → (2.50, 2.10) — round the whole plate at every angle, clear of the spout", why: "F→ and F↑ on what is inside the box (the plate), from the momentum and pressure on its four faces; at 90° the left face reads the jet's q alone" },
      { tool: "flux", where: "one across each sheet, about 0.1 m past each end of the plate, at right angles to it", why: "q₁ and q₂, the two sheets' discharges, against q(1 ± cos θ)/2" },
    ],
    ui: { view: ["legendBtn"], fields: ["speed", "mom"], controls: ["speed", "geom0"],
          readouts: { rows: ["pos", "uw"] } },
    start: "a free jet seen from above (gravity acts into the screen) striking a flat plate; the angle θ between the jet and the plate is the slider on this card",
    setup: [
      "Pick Control volume on the strip and drag a box from (0.70, 0.30) to (2.50, 2.10), round the whole plate. After every change wait about 5 s for the readings to settle.",
      "At θ = 90° the box's left face prints the discharge coming in, q ≈ 1.04 m²/s per metre; hover the jet and read u for its speed, U ≈ 4.45 m/s. So ρqU ≈ 4.6 kN/m. q and U stay the same when you turn the plate.",
      "Read the force on what is inside the box: → is F_x (along the jet), ↑ is F_z (across it). At 90° expect F_x = ρqU and F_z = 0.",
      "Set θ = 75°, 60°, 45° and 30°. At each, read F_x and F_z and work out the force normal to the plate, F_n = F_x sin θ + F_z cos θ. Compare with ρqU sin θ, i.e. F_x = ρqU sin²θ and F_z = ρqU sin θ cos θ. They agree to within about 5%. Check the force along the plate, F_x cos θ − F_z sin θ, is close to zero.",
      "Pick Flux line on the strip and drag one across each sheet, just past each end of the plate, at right angles to it — across the whole sheet but clear of the incoming jet. Their Q are q₁ (the sheet carried on along the plate) and q₂ (the sheet sent back): compare with q(1 + cos θ)/2 and q(1 − cos θ)/2.",
    ],
    task: "Show that the force on the plate is at right angles to it and equal to ρqU sin θ, and that the jet splits unequally, q₁ = q(1 + cos θ)/2 and q₂ = q(1 − cos θ)/2, because a smooth plate cannot push the water along itself.",
    settle: 5,
  },
  // ===== Year 1: PF-2 =====
  // The `wall-shape` scene, one slider morphing the wall. Every slider move
  // restarts still, hydrostatic water (resetWater), so there is nothing to
  // wait out: `settle: 0`. The scene's `forceRef` puts ½ρg·d² beside F_h on
  // the wall's label.
  {
    id: "PF-2",
    title: "Pressure force: only the depth matters",
    aim: "Still water against a wall whose shape you change — check that the sideways force stays ½ρgd², and find the up-or-down force.",
    topic: "Pressure, force and where it acts",
    folder: "PF-2-wall-shape",
    scene: "wall-shape",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: false },
    studentParams: [
      { control: "geom0", unit: "",
        rule: "0 overhang (30°), 0.25 vertical, 0.50 sloped 30°, 0.75 sloped 60°, 1 a staircase. Each change restarts the still water; the depth at the wall stays 1.60 m." },
      { control: "geom1", unit: "",
        rule: "optional: 1 puts a 0.50 × 0.50 m block under water, held still." },
    ],
    instruments: [
      { tool: "force", where: "the right-hand wall of the tank (and the submerged block, when it is on)", why: "F_h with ½ρg·d² beside it, and F_v — the weight of the water standing on the wall, or of the water that isn't there above an overhang" },
    ],
    ui: { view: ["legendBtn"], fields: ["water", "phead"], panel: "focused", controls: ["geom0", "geom1"],
          readouts: { rows: ["pos", "eta", "phead"] } },
    start: "still water 1.60 m deep against a right-hand wall whose shape is the Wall shape slider on this card; forces are per metre width",
    setup: ["Pick the Pressure force tool on the strip and click the right-hand wall. The arrows are the pressure on the wall; the label at the centre of pressure prints F, then F_h with ½ρg·d² beside it, then F_v.",
            "Slide Wall shape on this card through its five shapes: 0 overhang, 0.25 vertical, 0.50 sloped 30°, 0.75 sloped 60°, 1 a staircase.",
            "At each shape read F_h and F_v. Work out the weight of the water standing on the wall, ρg × (area between the wall and the surface), and compare it with F_v.",
            "Optional: set Submerged block to 1 and click the block. The pressure on its four sides adds up to one upward force — buoyancy; compare it with ρg × 0.25 m²."],
    task: "Show that F_h stays at ½ρg·d² = 12.6 kN/m whatever the wall's shape, and that F_v is the weight of the water above the wall — pointing up under the overhang, where the water above is water that isn't there.",
    settle: 0,
  },
  // ===== Year 1: FF-1 =====
  // The `lake` scene: a closed tank of still water with a wind shear stress τ
  // on its free surface, the scene's one param (geom0), on the card as a
  // slider. Boots at rest (settle 0): the first reading IS the still tank.
  // No measuring tools — the hover card and the field legend are the
  // instruments. L2: the hover card shows position, velocity and pressure
  // head only.
  {
    id: "FF-1",
    title: "A fluid deforms under any shear",
    aim: "Blow wind over a lake: the water keeps moving as long as the wind pushes, however gently — that is what makes it a fluid.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-1-wind-lake",
    scene: "lake",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: true },
    studentParams: [
      { control: "geom0", unit: "N/m²",
        rule: "the wind's shear stress on the water surface: positive blows to the right, negative to the left, 0 is calm." },
    ],
    ui: {
      measure: false,
      view: ["legendBtn", "partBtn"],
      fields: ["water", "speed", "phead"],
      panel: "focused",
      controls: ["geom0"],
      readouts: { rows: ["pos", "uw", "phead"] },
    },
    start: "a closed tank of still water, 6 m long and 0.30 m deep, with no wind",
    setup: [
      "At rest: hover the water and read the velocity (u, w) = 0 and the pressure head p/ρg. Pressure head is the pressure divided by ρg — the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher. At rest it is just the depth below the surface.",
      "Open Field & legend on the strip and choose Pressure head: flat horizontal bands — the water at rest carries pressure only.",
      "Set the Wind stress τ slider on this card to a small positive value: the water starts to flow, and keeps flowing for as long as the wind blows.",
      "Watch the surface rise against the right-hand wall and the particles near the bed run back to the left (Particles on the strip turns them on and off). Choose Speed in Field & legend to see where the water moves fastest.",
      "Reverse τ: everything reverses. Set τ = 0: the motion dies away and the pressure bands go flat again.",
    ],
    task: "Read the velocity and the pressure at rest, then blow on the surface with τ: any shear stress, however small, makes the water flow — it piles up at the downwind wall and flows back along the bed.",
    settle: 0,
  },
  // ===== Year 1: FF-3 =====
  // The `body` scene: plan view, a uniform stream past one body whose shape
  // is the single Geometry slider (0 = slender ellipse, 1 = square, frontal
  // width held at 0.40 m), on the card. Boots on the ellipse with its steady
  // wake; shedding starts near 0.4. `settle` is the time the boot transient
  // takes to wash past the body. L4 and no vorticity in Year 1: the card
  // boots on Speed and reads the wake with particles, dye and streamlines.
  {
    id: "FF-3",
    title: "Steady and unsteady flow",
    aim: "Morph a body from a slender ellipse to a square and watch the flow behind it switch from steady to unsteady.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-3-flow-past-body",
    scene: "body",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true, dye: false, gaugeField: "speed" },
    studentParams: [
      { control: "geom0", unit: "",
        rule: "0 is a slender ellipse lined up with the flow (streamlined), 1 a square of the same width (bluff). Go in small steps and give each 20–30 s." },
    ],
    instruments: [
      { tool: "gauge", where: "in the wake, about 0.6 m behind the body and 0.2 m off the centreline", why: "the speed trace is flat behind a streamlined body and a steady oscillation, one cycle per shed pair, behind a bluff one — the period is read off it" },
    ],
    ui: { measure: ["gauge"], view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn"],
          fields: ["speed", "phead"], panel: "focused", controls: ["speed", "geom0"],
          readouts: { rows: ["pos", "uw", "phead"] } },
    start: "looking down on a uniform 0.9 m/s stream past a slender ellipse lined up with the flow, 0.40 m wide; colour is speed",
    setup: ["Watch the wake behind the ellipse: a thin slow streak that runs straight downstream and stays put — steady flow round a streamlined body.",
            "Slide Body shape on this card slowly towards 1 (a square of the same width). Give each step 20–30 s: near the change the wake takes time to start swinging.",
            "Note where along the slider the wake starts to swing from side to side: the flow separates from the body and sheds eddies, first from one side, then the other. Pick the Gauge tool on the strip, click in the wake and read the period of the swing off its speed chart.",
            "Turn on Dye and Particles on the strip: compare the dye and the particle tracks in the steady wake and in the swinging one. In unsteady flow they no longer follow the streamlines.",
            "With the square shedding, turn on Streamlines on the strip and switch the colour bar (the legend) from Live to Average: the swinging wake becomes one steady, symmetric wake bubble — the mean flow is steady.",
            "Optional: open Field & legend on the strip and choose Pressure head. Pressure head is the pressure divided by ρg — the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher. Press Fit on the legend so the colours span what is there, and notice the higher pressure where the stream meets the front of the body."],
    task: "Find the slider position where the wake starts to swing, read its period, and compare the live wake of the square with its average.",
    settle: 10,
  },
  // ===== Year 1: FF-2, FF-4 =====
  // Two flow fields for the Fluid Motion lecture (L4), each one talked
  // through for several concepts at once: the velocity field, steady against
  // unsteady, streamlines, separation, fluxes, velocity profiles and
  // turbulence as mean + fluctuation. Nothing to draw and nothing personal.
  // Numbers in the `why`s are measured at Medium (the READMEs have the tables).
  {
    id: "FF-2",
    title: "The velocity field, and turbulence",
    aim: "Water speeds up over a spillway crest, flies off a ski-jump and churns in a plunge pool — read its speed everywhere, compare the live flow with its average, and measure its flow rate and velocity profiles.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-2-spillway",
    scene: "spillway",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true, gaugeField: "speed" },
    studentParams: [
      { control: "geom0", unit: "°",
        rule: "the angle of the bucket's lip at the foot of the spillway: a steeper lip throws the jet higher and further. Wait about 30 s after a change." },
      { control: "inLevel", unit: "m",
        rule: "the reservoir level (8.70 m as the card opens): higher means more water over the crest." },
    ],
    instruments: [
      { tool: "flux", where: "Flux lines, two sections: one over the crest (a vertical at x ≈ 7.4 m, from the crest up through the surface), one full-depth across the pool at x ≈ 22 m", why: "q = 3.52 m²/s over the crest (W = 29 m pool, Medium); live the pool section wanders 2.9–4.1, averaged (T = 40 s) it reads 3.33, within 6%" },
      { tool: "rake", where: "Rakes: one on the spillway face (x ≈ 9 m) and one in the pool at x ≈ 20 m", why: "the face: a thin fast sheet, slow at the floor (no slip); the pool: a jet hugging the floor after the plunge, swinging live and a smooth curve averaged" },
      { tool: "gauge", where: "a Gauge in the pool at x ≈ 20 m, z ≈ 1.0 m (on Speed)", why: "its trace is the fluctuation: a mean plus wild excursions" },
    ],
    ui: {
      view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn"],
      fields: ["water", "speed"],
      controls: ["speed", "geom0", "inLevel", "dye", "dyeLine"],
      readouts: { rows: ["pos", "d", "eta", "q", "V", "uw"] },
    },
    start: "a reservoir spilling over a curved crest, down the spillway face and off a bucket that throws the water into the air; the jet plunges into a deep pool held at a fixed level at the right edge",
    setup: [
      "The velocity field: colour is Speed. Read it from left to right: nearly still in the reservoir, faster over the crest, fastest on the face and in the bucket, slowing in the pool. Hover anywhere to read the velocity (u, w).",
      "Steady or unsteady: press Pause on the strip (or Space), look, run it again and pause a few seconds later. The reservoir, crest and face look the same both times (steady); the pool around the plunge does not (unsteady).",
      "Streamlines: turn them on on the strip. They crowd together where the water is fast and spread where it is slow.",
      "Flow rate: pick the Flux line tool on the strip and drag one up from the crest through the surface at x ≈ 7.4 m, and one from the floor to above the surface across the pool at x ≈ 22 m. The same q passes both, at very different depths and speeds: q = V × d.",
      "Velocity profiles: pick the Rake tool on the strip and click on the spillway face (x ≈ 9 m) and in the pool (x ≈ 20 m). On the face the water is slowest at the floor (no slip); in the pool the profile jumps about.",
      "Turbulence: pick the Gauge tool and click in the pool at x ≈ 20 m, z ≈ 1 m: its speed chart swings wildly about a mean.",
      "On the colour bar (the legend), switch from Live to Average and wait until its T passes 30 s: the pool becomes a steady mean flow with a slow eddy either side of the plunge, the rake shows a smooth curve, and the two flux lines agree. Turbulence = mean + fluctuation, and the mean is steady.",
      "Optional: slide Bucket lip angle on this card to change the throw; turn on Dye on the strip to mark the reservoir water and see turbulence mix it through the pool (dye pauses while Average is on).",
    ],
    task: "Read the velocity field, find where the flow is steady and where it is not, compare q over the crest and in the pool and the velocity profiles, live and averaged: turbulence is mean + fluctuation, and the mean is steady.",
    settle: 40,
  },
  {
    id: "FF-4",
    title: "Boundary layers: at a wall, in a jet",
    aim: "A pipe shoots a jet into still water — watch the slow layer grow along the pipe wall, and the jet swirl, spread and drag still water along.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-4-pipe-jet",
    scene: "pipejet",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true, gaugeField: "speed" },
    studentParams: [
      { control: "inLevel", unit: "m",
        rule: "the level that drives the pipe (6.60 m as the card opens): raise it and the jet runs faster." },
    ],
    instruments: [
      { tool: "rake", where: "Rakes, first in the pipe near the entrance (x ≈ 3.5 m) and near the exit (x ≈ 10 m)", why: "the wall boundary layers thicken along the pipe: centreline 2.17 → 2.51 m/s, the profile goes from a flat-topped plug to a rounded one" },
      { tool: "rake", where: "then Rakes across the jet at x ≈ 12 m and x ≈ 14 m", why: "live the x = 14 m profile jumps about; averaged (T = 60 s) both are bells, 1.43 m/s peak at 12 m and a wider, flatter 0.74 m/s at 14 m" },
      { tool: "flux", where: "Flux lines, two short sections across the jet only: z = 2.4–3.9 m at x = 12 m and z = 2.15–4.15 m at x = 14 m", why: "averaged q 0.76 m²/s in the pipe, 0.92 at 12 m, 1.03 at 14 m: the still water the jet has entrained" },
      { tool: "gauge", where: "a Gauge on the jet axis at x ≈ 15 m, z ≈ 3.15 m (on Speed)", why: "where the jet flaps: a trace of eddies passing" },
    ],
    ui: {
      view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn"],
      fields: ["speed", "phead"],
      controls: ["speed", "inLevel", "dye", "dyeLine"],
      readouts: { rows: ["pos", "uw", "phead"] },
    },
    start: "a tank held at a fixed level drives an 8 m pipe of 0.5 m bore, which shoots a jet into a large tank of still water, full to its lid, with an outflow at the far edge",
    setup: [
      "Colour is Speed. In the pipe, look at the slow layers along both walls and how they thicken downstream: no slip at the wall, a boundary layer growing.",
      "The other colouring, Pressure head (Field & legend on the strip), shows the pressure. Pressure head is the pressure divided by ρg — the pressure expressed as a height of water. It is the pressure up to a constant factor, so wherever it is higher, the pressure is higher. In this full tank it mostly grows with depth.",
      "Past the exit the jet keeps its fast core for a few metres, then starts to flap and breaks into eddies: at its edges fast water meets still water and drags it along.",
      "Pick the Rake tool on the strip and place Rakes in the pipe at x ≈ 3.5 and 10 m and compare the profiles; then place two more across the jet at x ≈ 12 and 14 m (each new Rake replaces the oldest).",
      "On the colour bar (the legend), switch from Live to Average and wait until its T passes 30 s: the jet becomes a smooth, spreading stream and the rakes across it bell-shaped curves, wider and lower downstream.",
      "Pick the Flux line tool on the strip and drag two short Flux lines across the jet only (z = 2.4–3.9 m at x = 12 m, z = 2.15–4.15 m at x = 14 m): the averaged q through the jet grows downstream as it drags in the still water.",
    ],
    task: "Compare the boundary layer on the pipe wall with the edges of the jet, live and averaged: turbulence is mean + fluctuation, and the mean is steady.",
    settle: 20,
  },
  // ===== Year 1: HJ-2, WV-4 =====
  // HJ-2: the flume lab (Lab 2, "The hydraulic jump") scaled up, ported from
  // the lecturer's 10 Sep copy and re-homed under momentum (L6), where it
  // shows that the pressure on and under a sluice gate is not hydrostatic and
  // reads the gate force two ways. The lecturer's sequence: water only in the
  // reservoir at t = 0, the weir flat (crest 0) so the released water shoots
  // under the gate as a fast sheet and off the end; then the class raises the
  // weir — the slider on the card — until a jump forms at the weir, walks up
  // the flume and finally drowns the gate. Vocabulary is L6's (docs: the
  // VOCAB rule): no heads, no grade lines, no jump box; Froude is kept on the
  // lecturer's own decision, in plain words. The jump itself is described,
  // not analysed — it is not Year 1 theory. The crest → jump map behind the
  // setup steps is measured (README, instructor section).
  {
    id: "HJ-2",
    title: "Pressure and force on a sluice gate",
    aim: "The pressure on a sluice gate is not hydrostatic near its lip; read the force on the gate two ways, then raise a weir until the downstream water drowns the gate.",
    topic: "Momentum conservation",
    folder: "HJ-2-gate-jump",
    scene: "gatejump",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: true, channel: false, grade: false, jumps: false, labels: false, gaugeField: "d" },
    studentParams: [
      { control: "geom1", unit: "m",
        rule: "0 m (flat) as the card opens. A push to 0.55 m makes a jump at the weir; 0.46 m then holds it where it is; 0.5 m lets it creep to the gate; 0.6 m or more drowns the gate" },
    ],
    instruments: [
      { tool: "force", where: "the gate's Upstream face: pick the Pressure force tool and click the plate", why: "the pressure diagram: growing with depth near the surface, falling to zero at the lip" },
      { tool: "gauge", where: "Gauge (5) in the reservoir at x = 2.5 m, z ≈ 0.6 m (it reads the depth d₀)", why: "d₀ behind the gate, for ½ρg(d₀ − a)²; it climbs when the gate drowns" },
      { tool: "cv", where: "Control volume (9): drag (2.50, 0.10) → (6.00, 3.70): reservoir to sheet, round the gate", why: "F→ on the gate from the momentum equation, to set against the pressure diagram" },
      { tool: "flux", where: "Flux line (8): drag UP through the sheet at x = 6 m, from the bed to z ≈ 1.5 m", why: "q, the discharge per metre width" },
    ],
    ui: { view: ["legendBtn", "partBtn"],
          fields: ["water", "speed", "froude"], panel: "focused",
          controls: ["speed", "geom1"],
          readouts: { rows: ["pos", "d", "eta", "q", "V", "Fr"] } },
    setup: [
      "Wait out the countdown. The water was all behind the gate at the start; now it shoots out under the gate as a fast, thin sheet (about 0.2 m deep, 6 m/s) and runs off the end of the flume. Switch the colour to Speed to see it.",
      "Place the Gauge in the reservoir, then click the gate's upstream face with the Pressure force tool. Near the surface the pressure on the plate grows with depth as in still water (ρgz); towards the lip it falls away to zero, because the water there is curving round under the gate and speeding up. Pressure is hydrostatic only where the streamlines are straight. Read F→ and compare it with ½ρg(d₀ − a)², with d₀ from the gauge and a = 0.30 m.",
      "Drag the Control volume round the gate and read its F→: the momentum equation's answer for the same force, without assuming anything about the pressure on the plate. Drag the Flux line through the sheet and read q.",
      "Froude number (the legend's field list): above 1 the flow is fast and shallow (red), below 1 slow and deep (blue). The sheet is red all the way down.",
      "Raise Weir crest height step by step to 0.4 m: nothing much changes, the fast sheet just runs up the weir and over it. It does not want to go back, so give it a push: 0.55 m. Within about 15 s the water piles up at the weir and the fast thin sheet suddenly jumps up to a slow, deep flow: a hydraulic jump. It starts to creep up the flume.",
      "When the jump is about halfway between the gate and the weir (x ≈ 7–8 m, some 30 s after the push), bring the crest back to 0.46 m: the jump stays about where it is, churning. At 0.45 m it is washed back over the weir and needs another push; at 0.47 m it creeps slowly on towards the gate.",
      "Now raise the crest again: at 0.5 m the jump creeps up to the foot of the gate within a few minutes; at 0.6 m or more it runs up to the gate in about half a minute and drowns it. The water below the gate covers the lip, the reservoir rises and the force on the gate grows. Read d₀ and F→ (both tools) again.",
    ],
    start: "a deep reservoir behind a sluice gate open 0.30 m, released into an empty flume; the weir at the far end lies flat (crest 0 m)",
    task: "Read the force on the gate with the Pressure force tool and with the Control volume and compare both with ½ρg(d₀ − a)²; then raise the weir until a jump forms, follow it up to the gate, and read the force again once the gate is drowned.",
    settle: 30,
  },

  // WV-4: a Year 2 preview, the show-piece. One slider (the beach slope,
  // geom0, on the card through studentParams) moves the Iribarren number
  // through the breaker types with the wave held fixed. Student-facing, so
  // no digit and no lecturer wording; the solver spills and surges honestly,
  // and a true plunging tongue is thinner than its interface (engineering
  // notes), so the card calls the middle band what it is on screen — the
  // front stands up and collapses — and the README says why. Low, not
  // Medium: the box was cropped to what the waves use, so Low is the old
  // Medium's Δx with half the cells (README, "Speed").
  {
    id: "WV-4",
    title: "How waves break on beaches",
    aim: "See the same wave spill on a gentle beach, collapse on a steeper one and surge up a steep one.",
    topic: "Waves",
    folder: "WV-4-breakers",
    scene: "beach",
    rig: null,
    rigParams: { budget: "Low", waveOn: true },
    viewParams: { mode: "0", particles: true },
    studentParams: [
      { control: "geom0", unit: "",
        rule: "tanβ, how steep the beach is: 0.06 (1 in 17) to start with. Each change starts the flume again from still water" },
    ],
    ui: { view: ["legendBtn", "partBtn"], fields: ["water", "speed"], measure: false,
          panel: "shut", controls: ["speed", "geom0"] },
    setup: [
      "The paddle at the left end pushes the water to and fro every 2 s and sends the same wave down the flume each time. The beach on the right is the only thing you change.",
      "Gentle beach, 0.06: as the water gets shallower the wave grows steeper, then its crest crumbles and tumbles down its own front. The broken wave carries on as a bore and shrinks all the way up a long surf zone. This is a SPILLING breaker.",
      "Set the beach slope to 0.15 and wait about 10 s: the wave runs almost to the shore unchanged, then its front stands up nearly vertical and collapses onto the beach in one go, over a much shorter surf zone. Try 0.3 as well. This is the PLUNGING range (here the front collapses rather than curling over).",
      "Set 0.7, a steep beach: nothing breaks. The water SURGES up the slope as a sheet, stops, and slides back down, and much of the wave reflects back towards the paddle.",
      "Pick Speed on the colour key: the breaking front shows up as the fastest water. The surf similarity number ξ = tanβ/√(H₀/L₀), with this wave's height H₀ and deep-water length L₀ = gT²/2π, sorts the three: spilling below about 0.5, surging above about 3.3. Here ξ ≈ 6·tanβ.",
    ],
    start: "a wave flume: a paddle at the left end, 0.40 m of still water, and a beach whose slope is the slider on this card",
    task: "Watch a few waves break on the gentle beach, then set the slope to 0.15, 0.3 and 0.7 in turn, waiting about 10 s after each, and say how the way the wave breaks changes. Which beach would you build to soak up wave energy, and which shape throws it back?",
    settle: 10,
  },
];
