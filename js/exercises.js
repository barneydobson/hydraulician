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
 *            (the individual Controls-panel row ids that survive),
 *            `readouts` ({gauges, cursor, status, rows}), `gaugeFields` (the
 *            GAUGE_QTY ids a gauge may plot), `hide` (concepts withheld from
 *            the canvas words: "energy", "critical") and `fieldText` (a
 *            field's description, reworded for the card's lecture).
 *            docs/making-exercises.md has each of them.
 *   gauges   optional [{x, z, field}]: gauges the card arrives with already
 *            PLACED — the one exception to "the picker places none", for a
 *            card whose subject is a time series from t = 0 (VC-2).
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

  // ===================================================== Year 1 (CIVE40008)
  // The fourteen Year 1 questions, on twelve entries (the contraction rig's
  // three are one entry with three tabs). Every one uses the SHORT card
  // layout (lecturer, Oct 2026: the cards were verbose and ran off the page):
  // the sliders on top, `steps` — at most five, one line each, the action and
  // what to notice — and a closed `background` fold for definitions, formulas
  // and remarks. No `start`/`task`/`setup`: they repeated the steps. Strip
  // buttons and tools are named with the inline markup ({tool:force},
  // {btn:legendBtn}, {key:V}), so the card draws the strip's own icon.
  //
  // Vocabulary follows the lecture each is used in (VOCAB rulings, Oct 2026):
  // up to L6 the pressure is shown as the plain Pressure colouring (p, kPa),
  // not as pressure head — except HS-1, the dike, which shows Pressure head
  // and Piezometric head because the piezometer's one level is exactly what
  // piezometric head shows (taught in Statics, L3). Every card before L7
  // carries hide: ["energy", "critical"].

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
      { tool: "force", where: "the sloped upstream face of the dike; the same block again for its culvert roof; then the downstream face of the block past the piezometer", why: "½ρg·d² sideways on each face (28.2 and 11.0 kN/m shut), plus the weight of the water on the slope downward on the upstream one, and the push up on the roof; after V both faces read 24.2 kN/m sideways" },
    ],
    // Pressure head AND piezometric head, not the plain Pressure (lecturer,
    // 2026-10-17): the piezometer standing at one level across connected
    // still water is what the piezometric-head colouring shows in one colour.
    ui: { view: ["legendBtn", "partBtn", "readBtn", "hoverBtn"], fields: ["water", "phead", "head"], panel: "shut",
          hide: ["energy", "critical"],
          readouts: { rows: ["pos", "eta", "uw", "phead", "h"] } },
    steps: [
      "The valve is shut. The left reservoir, the culvert and the piezometer tube are one body of still water: all three stand at 3.50 m.",
      "In {btn:legendBtn} pick Piezometric head: one colour through all that connected water. Then Pressure head: it grows with depth.",
      "Pick {tool:force} and click the dike's sloped upstream face: compare the sideways force with ½ρgd², d = 3.50 − 1.10 = 2.40 m.",
      "Click the same block again for the culvert roof (pushed up), then the downstream face of the block past the tube (d = 1.50 m).",
      "Press {key:V}: water flows through the culvert. When all is still (about 45 s) everything stands at one level and the two sideways forces are equal.",
    ],
    background: [
      "In still water the pressure grows with depth: p = ρg × (depth below the surface), whatever the shape of the container. ρ = 1000 kg/m³, g = 9.81 m/s².",
      "Pressure head p/ρg is the pressure divided by ρg — the pressure as a height of water. In still water it is the depth below the surface.",
      "Piezometric head h = z + p/ρg is the height plus the pressure head: the level a piezometer tube connected at that point would stand at. In connected still water it is the same everywhere, so it shows as one colour.",
    ],
    settle: 0,
  },

  // ===== Year 1: UP-1 =====
  // L2 Fundamentals: the speed of sound in a pipe, on the `pipeline` scene
  // (reservoir → straight pipe → valve → overflowing tank), written for this
  // item because hammer's nozzle outlet muddied the picture. No digit; the
  // two card sliders are the experiment: c (the slot celerity, called the
  // speed of sound on the card) and the tank's overflow crest, which sets the
  // pipe speed v₀. c = 30 by default: with v₀ ≈ 2.25 m/s the jump ρcv₀ ≈ 67
  // kPa (≈ 7 m of water) stays under the ~9 m of water over the pipe's crown,
  // so the return wave does not empty it (measured in the brief: 2.3 m left
  // at the default, 0.75 m at the lowest crest). The card slider stops at 35
  // (0.5 m left at the default crest; at the lowest crest it separates) and
  // at 20 below, where the slot's compression already makes the wave ~9%
  // faster than c. Speed ×0.25 (was ×0.1, which made the run crawl once the
  // settle ended) so the wave crosses the 47 m pipe in ~6 s of wall clock.
  // L2 vocabulary, and the plain Pressure colouring in kPa (Δp ≈ ρcΔv).
  {
    id: "UP-1",
    title: "Pressure travels at the speed of sound",
    aim: "Shut a valve at the end of a long pipe and watch the pressure jump run back up it at the speed of sound, reflect and return.",
    topic: "Unsteady pipe flow",
    folder: "UP-1-water-hammer",
    scene: "pipeline",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "8", particles: true, gaugeField: "speed", speed: 0.25 },
    // Slider rows carry a short label only (lecturer, Oct 2026: the long
    // `rule` sentences made the card mostly slider); what each does is in
    // the background.
    studentParams: [
      { control: "cel", label: "Speed of sound in water, c", unit: "m/s", slider: { min: 20, max: 35, step: 1 } },
      { control: "geom0", label: "Overflow crest height (right)", unit: "m" },
    ],
    instruments: [
      { tool: "gauge", where: "on the pipe's centre line, z = 2.5 m, at x = 14, 30 and 46 m (16 m apart; the valve is at x = 52 m)", why: "three stations 16 m apart: the arrival delay 16/c is 0.53 s at c = 30 and 0.80 s at c = 20; the 46 m gauge sits near the valve and sees the full jump for 2L/c" },
    ],
    // The corner gauge cards are withheld: three of them stack over the
    // downstream end of the pipe and hide the valve and the 46 m gauge. The
    // inspector windows are the time series instead, and can be parked in
    // the empty space above the pipe. Gauges offer what L2 has met: the
    // pressure p, u and the speed — no head of any kind.
    ui: { view: ["legendBtn", "partBtn", "hoverBtn"], fields: ["p", "water", "speed"],
      controls: ["cel", "geom0", "speed", "gaugeInspect"],
      gaugeFields: ["p", "u", "speed"], hide: ["energy", "critical"],
      readouts: { gauges: false, rows: ["pos", "uw", "p"] } },
    steps: [
      "Place three {tool:gauge} on the pipe's centre line, z = 2.5 m, at x = 14, 30 and 46 m; open their windows ({btn:panelBtn} → Gauge inspector).",
      "Press {key:V} to shut the valve: a band of high pressure runs up the pipe from the valve.",
      "The speed drops to zero at 46, 30, then 14 m as the wave arrives. Pause ({key:space}) and read the times: 16 m takes 16/c.",
      "Hover either side of the wave front: the pressure jumps by about Δp = ρcv₀.",
      "Press {key:V}, set c = 20 m/s, press {btn:resetBtn}, wait, then {key:V} again: the wave is slower and the jump smaller.",
    ],
    background: [
      "The colour is the pressure p, in kPa above atmospheric. Stopping water moving at v₀ makes a pressure jump Δp = ρ·c·v₀: with c = 30 m/s and v₀ ≈ 2.25 m/s that is about 67 kPa (ρ = 1000 kg/m³).",
      "The speed of sound c is 30 m/s as the card opens — a real water main is nearer 1200 m/s; here it is slow so you can watch the wave.",
      "The gauge windows plot the speed; their tabs switch to the pressure p. Read the pipe speed v₀ there before you shut the valve.",
      "The wave reflects at the reservoir, comes back as low pressure and keeps running up and down the pipe.",
      "The overflow crest (10.6 m as the card opens) sets how fast the water runs: lower it and the water runs faster and the jump grows. Changing it restarts the water.",
    ],
    settle: 25,
  },

  // ===== Year 1: the contraction rig (CR-1: was FF-5, VC-1, MM-2) =====
  // Three questions asked of ONE scene, `contraction`: a 1.00 m pipe that
  // contracts into a 0.50 m pipe between two reservoirs held by head-driven
  // level controls. Geometry slider geom0 = contraction length L (3 m taper
  // → 0 m abrupt step); a change restarts the water (resetWater) and the
  // scene's measured spin-up runs flat out again, so every L is read steady.
  // One entry with three TABS (lecturer, Oct 2026), one per lecture:
  // Streamlines (L4), Continuity (L5), Forces (L6). Switching tabs swaps the
  // steps and the interface and leaves the flow running. The old ids are the
  // tabs' aliases, so ?ex=FF-5 / VC-1 / MM-2 still open the right tab.
  // Students play with it (the lecturer can show it in class): no digit,
  // nothing pooled; the slider is on the card through studentParams.
  {
    id: "CR-1",
    title: "The contraction rig",
    aim: "Two reservoirs joined by a pipe that narrows gently or suddenly — its streamlines, its continuity and the force on it.",
    topic: "Volume conservation",
    folder: "CR-1-contraction-rig",
    scene: "contraction",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "2", particles: true },
    studentParams: [
      { control: "geom0", label: "Contraction length L", unit: "m" },
    ],
    ui: { panel: "focused", hide: ["energy", "critical"] },
    settle: 25,
    tabs: [
      // L4. Vorticity is never offered in Year 1: the separated corners are
      // read on Speed (slow eddies), with streamlines and the Average instead.
      { key: "streamlines", label: "Streamlines", alias: "FF-5",
        title: "Contraction rig: streamlines and separation",
        topic: "Flow fields, shear and turbulence",
        aim: "A pipe that narrows gently or suddenly — see the streamlines follow a taper but separate at a sharp step.",
        viewParams: { dye: true, mode: "2", particles: true },
        ui: { measure: false, view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn", "hoverBtn"],
              fields: ["water", "speed"], controls: ["geom0"],
              readouts: { rows: ["pos", "uw"] } },
        steps: [
          "Colour is Speed: the {btn:partBtn} crowd together and speed up through the taper.",
          "Turn on {btn:slineBtn}: they converge smoothly through the taper and follow the walls.",
          "Slide Contraction length L to 0 m, an abrupt step. The flow restarts: wait about 25 s.",
          "At the step the flow cannot turn the corners: it separates, slow eddies sit in the corners, and the jet narrows just past the edge.",
          "On the colour key switch Live to Average: the streamlines of the mean flow, steady where the live flow flickers.",
        ],
        background: [
          "L = 3 m is a long, gentle taper; L = 0 is an abrupt step. Changing L restarts the water, and the card waits about 25 s for it to settle.",
          "The narrowest section of the jet just past the step is the vena contracta; the jet then spreads to fill the narrow pipe.",
          "Where streamlines crowd together the water is fast, where they spread it is slow.",
        ] },
      { key: "continuity", label: "Continuity", alias: "VC-1",
        title: "Contraction rig: Q in equals Q out",
        topic: "Volume conservation",
        aim: "Water through a pipe that narrows — measure Q in the wide pipe, in the narrow pipe and round a control volume.",
        viewParams: { mode: "2", particles: true },
        instruments: [
          { tool: "flux", where: "up across the wide pipe at x = 4.3 m, from z = 0.4 to 1.6 m", why: "Q₁ in the wide pipe" },
          { tool: "flux", where: "up across the 0.50 m pipe at x = 9.0 m, from z = 0.4 to 1.6 m", why: "Q₂ in the 0.50 m pipe; equal to Q₁" },
          { tool: "cv", where: "(4.3, 0.3) → (9.0, 1.65) — round the contraction, top and bottom inside the pipe walls", why: "Σ Q = 0: in on the left face, out on the right, nothing through the walls" },
        ],
        ui: { view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn", "readBtn", "hoverBtn"],
              fields: ["water", "speed"], controls: ["geom0", "cvShow", "fluxList"],
              readouts: { rows: ["pos", "uw"] } },
        steps: [
          "Follow one particle through the contraction: it speeds up, although the flow is steady (Lagrangian).",
          "Drag a {tool:flux} up across each pipe — x = 4.3 m and x = 9.0 m, z = 0.4 to 1.6 m — and read Q in each (Eulerian).",
          "Drag a {tool:cv} from (4.3, 0.3) to (9.0, 1.65) round the contraction: Q on each face, Σ Q under the box.",
          "Slide Contraction length L to 0 m (a step), wait about 25 s and read the three again.",
          "Q₁ = Q₂ and Σ Q ≈ 0 for any contraction: the step changes the streamlines but lowers Q only a few per cent.",
        ],
        background: [
          "Continuity, per metre width: Q = U₁A₁ = U₂A₂, so U₂/U₁ = A₁/A₂ = 1.00/0.50 = 2.",
          "The Control volume counts outflow as positive: Σ Q = Q_out − Q_in, which is zero when nothing is stored.",
          "L = 3 m is a gentle taper, L = 0 an abrupt step; changing L restarts the water.",
        ] },
      { key: "forces", label: "Forces", alias: "MM-2",
        title: "Contraction rig: the force on a contraction",
        topic: "Momentum conservation",
        aim: "A pipe that narrows — find the force of the water on it from the momentum and the pressure at both ends, for a taper and a step.",
        viewParams: { mode: "8", particles: false },
        instruments: [
          { tool: "flux", where: "up across the wide pipe at x = 4.3 m, from z = 0.4 to 1.6 m", why: "section 1: Q, momentum flux M₁ = ρQU₁ and pressure force F₁ = p₁A₁" },
          { tool: "flux", where: "up across the 0.50 m pipe at x = 9.0 m, from z = 0.4 to 1.6 m", why: "section 2; the card under the pair prints the force on what is between them" },
          { tool: "cv", where: "(4.3, 0.3) → (9.0, 1.65), then B until the faces read momentum + pressure; later (9.0, 0.3) → (10.6, 1.65)", why: "F→ on the box is R, the force of the water on the contraction (plus the wall shear inside the box)" },
        ],
        ui: { view: ["legendBtn", "slineBtn", "readBtn", "hoverBtn"],
              fields: ["speed", "p"], controls: ["geom0", "cvShow", "fluxList"],
              readouts: { rows: ["pos", "uw", "p"] } },
        steps: [
          "Drag a {tool:flux} up across each pipe (x = 4.3 and 9.0 m, z = 0.4 to 1.6 m): each prints Q, the momentum flux M and the pressure force F.",
          "Drag a {tool:cv} from (4.3, 0.3) to (9.0, 1.65) and press {key:B} until its faces read momentum + pressure: F→ is R.",
          "Check R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁) against the box's F→ (A₁ = 1.00 m, A₂ = 0.50 m, U = Q/A).",
          "Slide Contraction length L to 0 m (a step) and wait about 25 s: R is nearly the same.",
          "Drag the box again on the straight pipe, (9.0, 0.3) → (10.6, 1.65): momentum in = out, so the pressure drop is the wall friction.",
        ],
        background: [
          "R is the force of the water on the contraction, per metre width, positive downstream. p₁A₁ and p₂A₂ are the two sections' F; the pair of flux lines also prints the force on what is between them.",
          "The colour is the pressure p in kPa: high in the wide pipe, falling through the contraction as the water speeds up.",
          "R is set by the end sections, not by the shape in between: a taper and a step give nearly the same force.",
        ] },
    ],
  },

  // ===== Year 1: VC-2, MM-1 =====
  // Two exercises on scenes written for them (`fillleak`, `vane`). Each has
  // ONE slider, the scene's own param, on Controls → Geometry (geom0), and on
  // the card (studentParams).
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
      { control: "geom0", label: "Inflow Q", unit: "m²/s" },
    ],
    // The one card that arrives with a gauge already in the tank (lecturer,
    // Oct 2026): the level curve IS the exercise — in > out while it rises,
    // in = out where it flattens — and it has to be recording from t = 0.
    gauges: [{ x: 1.0, z: 0.6, field: "eta" }],
    // L5. The outlet starts OPEN (the scene's valveOpen, lecturer Oct 2026).
    // The orifice law is L7 (Bernoulli), so the card GIVES √(2gh) and keeps
    // storage = in − out central; C is what the students find.
    instruments: [
      { tool: "gauge", where: "already in the tank at x = 1.0 m, z = 0.6 m, plotting the level η — low, clear of the falling inflow", why: "on Level η the gauge reads the free surface itself, and its chart is the level against time: a curve bending over to a plateau with the outlet open, a straight line with the valve shut" },
      { tool: "cv", where: "(0.30, 0.40) → (2.70, 3.12) — round the whole tank, under the spout and across the outlet jet", why: "in through the top face, out through the right face, and the stored rate dV/dt — net + dV/dt = 0 at every instant" },
    ],
    ui: { view: ["legendBtn", "slineBtn", "readBtn", "hoverBtn"], fields: ["water", "speed"], controls: ["speed", "geom0"],
          gaugeFields: ["eta", "d", "p", "speed", "u", "w"], hide: ["energy", "critical"],
          readouts: { rows: ["pos", "eta", "uw"] } },
    steps: [
      "The {tool:gauge} already in the tank plots the level η: it rises (in > out), then flattens (in = out). Wait until flat (about a minute) and read it.",
      "Predict with C = 1: h = (Q/(C·a))²/2g for Q = 0.25 m²/s and a = 0.08 m; the level is then h + 0.59 m.",
      "The water settles higher: find the C that makes your prediction match the level you read (h = level − 0.59 m).",
      "Set Inflow Q to another value, predict the new level with your C, and check it on the gauge.",
      "Optional: press {key:V} to shut the outlet — the level climbs in a straight line, dh/dt = Q/S. A {tool:cv} round the tank reads in, out and storage.",
    ],
    background: [
      "Storage = in − out: S dh/dt = Q_in − Q_out. The tank is 2.00 m wide, so S = 2.00 m² per metre width. It starts low, at 0.70 m.",
      "The water leaves the outlet at about √(2gh), h the height of the water surface above the outlet's centre (you derive this in lecture 7). So Q_out = C·a·√(2gh) per metre width: a = 0.08 m, centred at z = 0.59 m, g = 9.81 m/s², C close to 1.",
      "The jet narrows just after it leaves the outlet, so less water gets out than C = 1 assumes.",
      "The Control volume box goes from (0.30, 0.40) to (2.70, 3.12), round the whole tank. It counts outward as positive, net = out − in, so net = −S dh/dt. Press V again to reopen the outlet.",
    ],
    settle: 0,
  },
  // MM-1: plan view, gravity ≈ 0 (g = 1e-3 in the scene). The plain
  // Pressure colouring works here — it does not divide by g, unlike every
  // head — so the card offers Speed and Pressure (lecturer, 2026-10-17); the
  // Momentum flux colouring it used to offer is gone with it.
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
      { control: "geom0", label: "Plate angle θ", unit: "°" },
    ],
    instruments: [
      { tool: "cv", where: "(0.70, 0.30) → (2.50, 2.10) — round the whole plate at every angle, clear of the spout", why: "F→ and F↑ on what is inside the box (the plate), from the momentum and pressure on its four faces; at 90° the left face reads the jet's q alone" },
      { tool: "force", where: "the plate's wet face — the side the jet strikes", why: "the pressure diagram on the plate and its resultant F, at right angles to the plate: on a smooth plate the whole force is pressure, so F matches the box's F_n" },
      { tool: "flux", where: "one across each sheet, about 0.1 m past each end of the plate, at right angles to it", why: "q₁ and q₂, the two sheets' discharges, against q(1 ± cos θ)/2" },
    ],
    ui: { view: ["legendBtn", "dyeBtn", "slineBtn", "readBtn", "hoverBtn"], hide: ["energy", "critical"], fields: ["speed", "p"], controls: ["speed", "geom0"],
          readouts: { rows: ["pos", "uw", "p"] } },
    steps: [
      "Drag a {tool:cv} from (0.70, 0.30) to (2.50, 2.10), round the whole plate. After every change wait about 5 s.",
      "At θ = 90° read q on the box's left face (≈ 1.04 m²/s) and hover the jet for U (≈ 4.45 m/s): ρqU ≈ 4.6 kN/m. Expect F→ = ρqU, F↑ = 0.",
      "Pick {tool:force} and click the plate's wet face: the pressure is largest where the jet hits, and F is at right angles to the plate.",
      "Set θ = 75°, 60°, 45°, 30°: from the box F_n = F_x sin θ + F_z cos θ; compare it with the Pressure force F and with ρqU sin θ.",
      "Drag a {tool:flux} across each sheet just past each end of the plate: compare q₁ and q₂ with q(1 + cos θ)/2 and q(1 − cos θ)/2.",
    ],
    background: [
      "Seen from above: gravity acts into the screen, so the Pressure colouring shows only what the moving water does — highest where the jet is stopped on the plate, about ½ρU² ≈ 10 kPa.",
      "On the box, → is F_x (along the jet) and ↑ is F_z (across it); on the Pressure force label F_h is → and F_v is ↑ in this view. q and U do not change when you turn the plate.",
      "The box's F_n and the Pressure force F agree to within a few per cent, and both sit 5–10% above ρqU sin θ, i.e. F_x = ρqU sin²θ and F_z = ρqU sin θ cos θ.",
      "The force along the plate, F_x cos θ − F_z sin θ, is close to zero: a smooth plate can only push at right angles to itself, so all of its force is pressure — and the jet splits unequally, q₁ carrying on along the plate and q₂ sent back.",
    ],
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
      { control: "geom0", label: "Wall shape", unit: "" },
      { control: "geom1", label: "Submerged block", unit: "" },
    ],
    instruments: [
      { tool: "force", where: "the right-hand wall of the tank (and the submerged block, when it is on)", why: "F_h with ½ρg·d² beside it, and F_v — the weight of the water standing on the wall, or of the water that isn't there above an overhang" },
    ],
    ui: { view: ["legendBtn", "readBtn", "hoverBtn"], fields: ["water", "p"], panel: "focused", controls: ["geom0", "geom1"],
          hide: ["energy", "critical"],
          readouts: { rows: ["pos", "eta", "p"] } },
    steps: [
      "Pick {tool:force} and click the right-hand wall: the label prints F, then F_h with ½ρgd² beside it, then F_v.",
      "Slide Wall shape through its five shapes; each restarts the still water, 1.60 m deep at the wall.",
      "At each shape compare F_h with ½ρgd² = 12.6 kN/m: the shape does not matter.",
      "Compare F_v with the weight of the water above the wall, ρg × (area between the wall and the surface): under the overhang it points up.",
      "Optional: set Submerged block to 1 and click the block: its four sides add up to one upward force — compare it with ρg × 0.25 m².",
    ],
    background: [
      "Wall shape: 0 overhang (30°), 0.25 vertical, 0.50 sloped 30°, 0.75 sloped 60°, 1 a staircase. Forces are per metre width; ρ = 1000 kg/m³, g = 9.81 m/s².",
      "The Pressure colouring (kPa) depends on depth only: p = ρg × (depth below the surface).",
      "Under the overhang F_v is the weight of the water that isn't there — the water that would fill the space between the wall and the surface. The block is 0.50 × 0.50 m, held still under water: the net upward force is its buoyancy.",
    ],
    settle: 0,
  },
  // ===== Year 1: FF-1 =====
  // The `lake` scene: a closed tank of still water with a wind shear stress τ
  // on its free surface, the scene's one param (geom0), on the card as a
  // slider. Boots at rest (settle 0): the first reading IS the still tank.
  // No measuring tools — the hover card and the field legend are the
  // instruments. L2: the hover card shows position, velocity and pressure,
  // and the pressure is the plain Pressure colouring (lecturer, 2026-10-17:
  // up to L6, Pressure rather than pressure head).
  {
    id: "FF-1",
    title: "A fluid deforms under any shear",
    aim: "Blow wind over a lake: the water keeps moving as long as the wind pushes, however gently — that is what makes it a fluid.",
    topic: "Flow fields, shear and turbulence",
    folder: "FF-1-wind-lake",
    scene: "lake",
    rig: null,
    rigParams: { budget: "Medium" },
    // The hover card opens OFF (lecturer, Oct 2026): the first exercise is
    // looked at, not read; Hover readout on the strip brings it back for
    // step 1.
    viewParams: { mode: "0", particles: true, hoverCard: false },
    studentParams: [
      { control: "geom0", label: "Wind stress τ", unit: "N/m²" },
    ],
    ui: {
      measure: false,
      view: ["legendBtn", "partBtn", "hoverBtn"],
      fields: ["water", "speed", "p"],
      panel: "focused",
      controls: ["geom0"],
      hide: ["energy", "critical"],
      readouts: { rows: ["pos", "uw", "p"] },
    },
    steps: [
      "Turn on {btn:hoverBtn} and hover the water: at rest u = w = 0, and the pressure p grows with depth.",
      "In {btn:legendBtn} pick Pressure: flat horizontal bands — water at rest carries pressure only.",
      "Set Wind stress τ to a small positive value: the water starts to flow, and keeps flowing for as long as the wind blows.",
      "The surface rises at the right-hand wall and the {btn:partBtn} near the bed run back to the left. Pick Speed to see where it is fastest.",
      "Reverse τ: everything reverses. Set τ = 0: the motion dies away and the pressure bands go flat again.",
    ],
    background: [
      "τ is the wind's shear stress on the surface: positive blows to the right, negative to the left, 0 is calm.",
      "The pressure p is in kPa above atmospheric. At rest p = ρg × (depth below the surface): about 2.9 kPa at the bed, 0.30 m down (ρ = 1000 kg/m³, g = 9.81 m/s²).",
      "Any shear stress, however small, makes the water flow — that is what makes it a fluid. At rest there is pressure only.",
    ],
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
    viewParams: { mode: "2", particles: true, dye: true, gaugeField: "speed" },
    studentParams: [
      { control: "geom0", label: "Body shape", unit: "" },
    ],
    instruments: [
      { tool: "gauge", where: "in the wake, about 0.6 m behind the body and 0.2 m off the centreline", why: "the speed trace is flat behind a streamlined body and a steady oscillation, one cycle per shed pair, behind a bluff one — the period is read off it" },
    ],
    // Speed and Pressure (lecturer, 2026-10-17). Pressure head was withdrawn
    // here (Oct 2026) because in this plan view p/ρg divides by g = 0 and
    // shows nothing worth reading; the plain Pressure does not divide by g.
    // Its level is arbitrary in a plan view (~37 kPa, creeping), so its
    // range is fitted the first time it is shown (pressureRange in main.js).
    ui: { measure: ["gauge"], view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn", "readBtn", "hoverBtn"],
          fields: ["speed", "p"], panel: "focused", controls: ["speed", "geom0"],
          gaugeFields: ["speed", "u", "w", "p"], hide: ["energy", "critical"],
          readouts: { rows: ["pos", "uw", "p"] } },
    steps: [
      "Behind the ellipse the wake is a thin slow streak that runs straight downstream and stays put: steady flow round a streamlined body.",
      "Slide Body shape slowly towards 1 (a square), 20–30 s per step, and note where the wake starts to swing from side to side.",
      "Click a {tool:gauge} in the wake (0.6 m behind the body, 0.2 m off the centreline) and read the period of the swing off its chart.",
      "Turn on {btn:dyeBtn} and {btn:partBtn}: in the swinging wake they no longer follow the streamlines.",
      "With the square shedding, turn on {btn:slineBtn} and switch the colour key from Live to Average: one steady, symmetric wake bubble.",
    ],
    background: [
      "Body shape 0 is a slender ellipse lined up with the flow (streamlined); 1 is a square of the same width, 0.40 m (bluff). The stream runs at 0.9 m/s; we look down on it from above.",
      "Near the change the wake takes time to start swinging, so go in small steps. Behind a bluff body the flow separates and sheds eddies, first from one side, then the other.",
      "The Pressure colouring: highest at the front of the body, where the flow is stopped, lowest at its sides, where it is fastest; the shed eddies carry low pressure downstream. Seen from above only the differences matter (a few tenths of a kPa).",
      "The flow behind the square is unsteady, but its average is steady.",
    ],
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
    viewParams: { dye: true, mode: "2", particles: true, gaugeField: "speed" },
    studentParams: [
      { control: "geom0", label: "Bucket lip angle", unit: "°" },
      { control: "inLevel", label: "Reservoir level", unit: "m" },
    ],
    instruments: [
      { tool: "flux", where: "two sections: one over the crest (a vertical at x ≈ 7.4 m, from the crest up through the surface), one full-depth across the pool at x ≈ 22 m", why: "q = 3.52 m²/s over the crest (W = 29 m pool, Medium); live the pool section wanders 2.9–4.1, averaged (T = 40 s) it reads 3.33, within 6%" },
      { tool: "rake", where: "one on the spillway face (x ≈ 9 m) and one in the pool at x ≈ 20 m", why: "the face: a thin fast sheet, slow at the floor (no slip); the pool: a jet hugging the floor after the plunge, swinging live and a smooth curve averaged" },
      { tool: "gauge", where: "in the pool at x ≈ 20 m, z ≈ 1.0 m (on Speed)", why: "its trace is the fluctuation: a mean plus wild excursions" },
    ],
    ui: {
      view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn", "readBtn", "hoverBtn"],
      fields: ["water", "speed"],
      controls: ["speed", "geom0", "inLevel", "dye", "dyeLine"],
      // No pressure colouring: nothing on this card reads the pressure.
      gaugeFields: ["speed", "u", "w", "p", "eta", "d"], hide: ["energy", "critical"],
      readouts: { rows: ["pos", "d", "eta", "q", "V", "uw"] },
    },
    steps: [
      "Colour is Speed: nearly still in the reservoir, faster over the crest, fastest on the face and in the bucket, slowing in the pool.",
      "Pause ({key:space}), look, run, pause again: reservoir, crest and face look the same (steady), the pool does not. {btn:slineBtn} crowd where it is fast.",
      "Drag a {tool:flux} up from the crest at x ≈ 7.4 m and one across the pool at x ≈ 22 m: the same q, at very different depths and speeds.",
      "Click a {tool:rake} on the face (x ≈ 9 m) and in the pool (x ≈ 20 m), and a {tool:gauge} in the pool at z ≈ 1 m: slow at the floor; the pool swings wildly.",
      "On the colour key switch Live to Average and wait until T passes 30 s: steady eddies, a smooth profile, the two flux lines agree.",
    ],
    background: [
      "Hover anywhere to read the velocity (u, w). q = V × d per metre width.",
      "Turbulence = mean + fluctuation, and the mean is steady; engineers design for the mean.",
      "Optional: a steeper Bucket lip angle throws the jet higher and further (wait about 30 s after a change); a higher Reservoir level (8.70 m as the card opens) puts more water over the crest; {btn:dyeBtn} marks the reservoir water and shows turbulence mixing it through the pool (dye pauses while Average is on).",
    ],
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
    viewParams: { dye: true, mode: "2", particles: true, gaugeField: "speed" },
    studentParams: [
      { control: "inLevel", unit: "m", label: "Reservoir level", slider: { min: 6.3, max: 8.0, step: 0.05 } },
    ],
    instruments: [
      { tool: "rake", where: "first in the pipe near the entrance (x ≈ 3.5 m) and near the exit (x ≈ 10 m)", why: "the wall boundary layers thicken along the pipe: centreline 2.17 → 2.47 m/s, the profile goes from a flat-topped plug to a rounded one" },
      { tool: "rake", where: "then across the jet at x ≈ 12 m and x ≈ 14 m", why: "live the x = 14 m profile jumps about; averaged (T = 60 s) both are bells, 1.28 m/s peak at 12 m and a wider, flatter 0.78 m/s at 14 m" },
      { tool: "flux", where: "two short sections across the jet only: z = 2.4–3.9 m at x = 12 m and z = 2.15–4.15 m at x = 14 m", why: "averaged q 0.80 m²/s in the pipe, 1.07 at 12 m, 1.19 at 14 m: the still water the jet has entrained" },
      { tool: "gauge", where: "on the jet axis at x ≈ 15 m, z ≈ 3.15 m (on Speed)", why: "where the jet flaps: a trace of eddies passing" },
    ],
    ui: {
      view: ["legendBtn", "partBtn", "dyeBtn", "slineBtn", "readBtn", "hoverBtn"],
      fields: ["speed", "p"],
      controls: ["speed", "inLevel", "dye", "dyeLine"],
      gaugeFields: ["speed", "u", "w", "p"], hide: ["energy", "critical"],
      readouts: { rows: ["pos", "uw", "p"] },
    },
    steps: [
      "Colour is Speed: in the pipe the slow layers along both walls thicken downstream — no slip at the wall, a boundary layer growing.",
      "Past the exit the jet keeps its fast core for a metre or two, then flaps and breaks into eddies that drag the still water along.",
      "Click {tool:rake}s inside the pipe at x ≈ 3.5 and 10 m and across the jet at x ≈ 12 and 14 m (each new one replaces the oldest).",
      "On the colour key switch Live to Average and wait until T passes 30 s: a smooth, spreading jet; the rakes across it become bells.",
      "Drag two {tool:flux}s across the jet only (z = 2.4–3.9 m at x = 12 m, z = 2.15–4.15 m at x = 14 m): q grows downstream.",
    ],
    background: [
      "A tank held at a fixed level drives an 8 m pipe of 0.5 m bore into a large reservoir of still water. The Reservoir level slider drives the jet: higher, faster.",
      "The other colouring, Pressure (kPa), shows the pressure: below the reservoir's free surface it mostly grows with depth.",
      "The jet's q grows downstream because it drags in the still water at its edges: the boundary layer against still water. Turbulence = mean + fluctuation, and the mean is steady.",
      "Optional: a {tool:gauge} on the jet axis at x ≈ 15 m, z ≈ 3.15 m shows the eddies passing.",
    ],
    settle: 20,
  },
  // ===== Year 1: HJ-2, WV-4 =====
  // HJ-2: the flume lab (Lab 2, "The hydraulic jump") scaled up, ported from
  // the lecturer's 10 Sep copy and re-homed under momentum (L6). Its aim is
  // a MOMENTUM BALANCE (lecturer, 2026-10-17; L6 slide 11): a control volume
  // round the gate gives the force on it from the momentum flux and the
  // hydrostatic pressure on the faces, ½ρg(d₁² − d₂²) − ρq(U₂ − U₁), which
  // the Pressure force tool on the plate reads slightly differently because
  // the pressure at the lip is not hydrostatic; a control volume round the
  // jump has nothing solid inside, so momentum flux + pressure force in =
  // out — the water jumps so the books balance (no Bélanger: not Year 1).
  // The lecturer's sequence is kept: water only in the reservoir at t = 0,
  // the weir flat (crest 0); a push to 0.55 m forms the jump, 0.46 m holds
  // it, ≥ 0.6 m drowns the gate. Vocabulary is L6's: no heads, no grade
  // lines, no jump box; Froude is kept on the lecturer's own decision, in
  // plain words. The crest → jump map and the balance numbers are measured
  // (README, instructor section).
  {
    id: "HJ-2",
    title: "Momentum balance: sluice gate and hydraulic jump",
    aim: "Draw a control volume round a sluice gate and find the force on it from momentum and pressure; then round a hydraulic jump, where momentum in equals momentum out.",
    topic: "Momentum conservation",
    folder: "HJ-2-gate-jump",
    scene: "gatejump",
    rig: null,
    rigParams: { budget: "Medium" },
    viewParams: { mode: "0", particles: true, channel: false, grade: false, jumps: false, labels: false, gaugeField: "d" },
    studentParams: [
      { control: "geom1", label: "Weir crest height", unit: "m" },
    ],
    instruments: [
      { tool: "gauge", where: "in the reservoir at x = 2.5 m, z ≈ 0.6 m (it reads the depth d₁)", why: "d₁ behind the gate, for the momentum balance; it climbs when the gate drowns" },
      { tool: "flux", where: "UP through the sheet at x = 6 m, from the bed to z ≈ 1.5 m", why: "q, the discharge per metre width" },
      { tool: "cv", where: "(2.50, 0.10) → (6.00, 3.70) round the gate; later round the jump, from ~0.5 m before its toe to ~2 m past it, bed to z ≈ 2.6 m", why: "gate: F→ = the force on the gate; jump: in = out, F→ ≈ 0 (bed shear only)" },
      { tool: "force", where: "the gate's upstream face", why: "the pressure diagram: hydrostatic near the surface, falling to zero at the lip — a little below the momentum balance's number" },
    ],
    // Froude in plain words: `fieldText` replaces the legend's
    // critical/subcritical description, and hide "critical" turns the hover
    // card's Fr row into "fast, shallow" / "slow, deep". The reservoir marker
    // reads "reservoir level" (hide "energy"), and the gauges offer depth,
    // level, speed and u.
    ui: { view: ["legendBtn", "partBtn", "slineBtn", "readBtn", "hoverBtn"],
          fields: ["water", "speed", "froude"], panel: "focused",
          controls: ["speed", "geom1"],
          gaugeFields: ["d", "eta", "speed", "u"], hide: ["energy", "critical"],
          fieldText: { froude: "Fr = u/√(gd), from the speed and the depth. Above 1: fast and shallow (red); below 1: slow and deep (blue)." },
          readouts: { rows: ["pos", "d", "eta", "q", "V", "Fr"] } },
    steps: [
      "The water shoots under the gate as a fast, thin sheet. Read the pool depth d₁ with a {tool:gauge} at x = 2.5 m, and q with a {tool:flux} up through the sheet at x = 6 m.",
      "Drag a {tool:cv} round the gate, (2.50, 0.10) → (6.00, 3.70), and press {key:B} until its faces read momentum + pressure: F→ is the force on the gate.",
      "Work out ½ρg(d₁² − d₂²) − ρq(U₂ − U₁), d₂ the sheet's depth; compare it, and F→, with {tool:force} on the gate's upstream face.",
      "Raise Weir crest height to 0.55 m: within about 15 s the sheet jumps up to a slow, deep flow. When the jump is halfway (x ≈ 7–8 m) set 0.46 m to hold it.",
      "Drag the box round the jump: momentum flux + pressure force in on the left = out on the right, and F→ ≈ 0 — the water jumps so the books balance.",
    ],
    background: [
      "Momentum balance on a control volume, per metre width: (momentum flux out − momentum flux in) = the pressure forces on its faces + the force from anything solid inside. The box prints the momentum flux and the pressure force on each face.",
      "Round the gate the faces are hydrostatic: ½ρgd² each. So the force on the gate is F = ½ρg(d₁² − d₂²) − ρq(U₂ − U₁), with U = q/d, d₁ the pool's depth and d₂ the sheet's (about 0.20 m). Depths are above the bed, which is at z = 0.30 m; the gate is open a = 0.30 m.",
      "On the gate itself the pressure is hydrostatic near the surface but falls to zero at the lip, where the water curves round under the gate and speeds up: pressure is hydrostatic only where the streamlines are straight. That is why the Pressure force tool reads a little less than the balance. The box reads a few per cent more: its upstream face is not exactly hydrostatic either, and it also carries the bed's friction inside it.",
      "Round the jump there is nothing solid inside the box (only the bed's friction), so what goes in must come out: the fast thin sheet and the slow deep flow carry the same momentum flux + pressure force.",
      "Above 0.6 m the jump runs up to the gate and drowns it: the pool rises and the force on the gate grows. At 0.45 m a held jump is washed back over the weir; at 0.4 m or less the sheet just runs over the weir. Water is the default colouring; Speed and Froude number are in {btn:legendBtn}.",
    ],
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
      { control: "geom0", label: "Beach slope tanβ", unit: "" },
    ],
    // Hover rows kept plain: without a list the card printed the open-channel
    // profile class ("H2 profile"), d_c, d_n and slopes over a wave flume.
    ui: { view: ["legendBtn", "partBtn", "hoverBtn"], fields: ["water", "speed"], measure: false,
          panel: "shut", controls: ["speed", "geom0"],
          readouts: { rows: ["pos", "d", "eta", "uw"] } },
    steps: [
      "The paddle sends the same wave down the flume every 2 s; the beach slope on this card is the only thing you change.",
      "Gentle beach, 0.06: the wave steepens, its crest crumbles down its own front, and a bore runs up a long surf zone — SPILLING.",
      "Set 0.15 and wait about 10 s: the front stands up nearly vertical and collapses in one go — the PLUNGING range. Try 0.3 too.",
      "Set 0.7: nothing breaks. The water SURGES up the slope as a sheet and slides back, and much of the wave reflects.",
      "Pick Speed in {btn:legendBtn}: the breaking front is the fastest water. Which beach soaks up wave energy, and which throws it back?",
    ],
    background: [
      "The flume holds 0.40 m of still water; each change of slope starts it again from still water. tanβ = 0.06 is 1 in 17.",
      "The surf similarity number ξ = tanβ/√(H₀/L₀), with the wave's height H₀ and deep-water length L₀ = gT²/2π, sorts the three: spilling below about 0.5, surging above about 3.3. Here ξ ≈ 6·tanβ.",
      "Here a plunging breaker's front collapses rather than curling right over.",
    ],
    settle: 10,
  },
];
