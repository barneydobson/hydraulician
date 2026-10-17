"use strict";
// CIVE40008's own exercise cards (Fluid Mechanics, Year 1; Imperial College
// London, Civil Engineering; lecturer M. van Reeuwijk).
//
// The card schema is the shared register's — read the header of
// js/exercises.js before adding a value. COURSES.exercises (js/courses.js)
// stamps every card here with `course: "cive40008"` and
// `home: "courses/cive40008/exercises"`, so `folder` names a folder under
// courses/cive40008/exercises/ and the card's brief link, check_pack.py and
// courses/cive40008/INDEX.md all look there. Ids are global: none of these
// may repeat an id (or tab alias) of the shared register or another course.
//
// HS-1, the dike (Statics, L3), is this course's too but lives in the shared
// register: it went upstream first. course.js lists it like the rest.
//
// The fourteen Year 1 questions, on twelve entries here plus HS-1 (the
// contraction rig's three are one entry with three tabs). Every one uses the
// SHORT card layout (lecturer, Oct 2026: the cards were verbose and ran off
// the page): the sliders on top, `steps` — at most five, one line each, the
// action and what to notice — and a closed `background` fold for
// definitions, formulas and remarks. No `start`/`task`/`setup`: they
// repeated the steps. Strip buttons and tools are named with the inline
// markup ({tool:force}, {btn:legendBtn}, {key:V}), so the card draws the
// strip's own icon.
//
// Vocabulary follows the lecture each is used in (VOCAB rulings, Oct 2026):
// up to L6 the pressure is shown as the plain Pressure colouring (p, kPa),
// not as pressure head. Every card before L7 carries hide: ["energy",
// "critical"]. The plan behind the order is docs/year1-programme.md.
COURSES.exercises("cive40008", [
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
  // WV-5: a showcase (lecturer, Oct 2026). One wave TRAIN in deep water, so
  // the group and its crests visibly part company: c_g = c_p/2. The flap
  // (wave.flap) and the train envelope (wave.train) are the scene's; the
  // strip's Wave train button and V fire one train. The two sliders are the
  // Wavemaker panel's own Period and Amplitude rows (waveT, waveA). Two η
  // gauges arrive placed, 3 m apart, so the class can time the group and a
  // crest over the same distance. Medium: the deep-water wave needs the
  // cells (README, "Why these numbers"). The legend opens folded: in its
  // corner it sat on the surface just where the group runs out of flume.
  {
    id: "WV-5",
    title: "Group velocity: waves travel slower than their crests",
    aim: "Send a short train of waves down a deep flume and watch the crests run through it: each is born at the back of the group and dies at its front, because the group moves at half their speed.",
    topic: "Waves",
    folder: "WV-5-group-velocity",
    scene: "wavetrain",
    rig: null,
    rigParams: { budget: "Medium", waveOn: true },
    viewParams: { mode: "0", particles: false, gaugeField: "eta" },
    gauges: [{ x: 2.0, z: 0.5, field: "eta" }, { x: 5.0, z: 0.5, field: "eta" }],
    studentParams: [
      { control: "waveT", label: "Wave period", unit: "s" },
      { control: "waveA", label: "Stroke", unit: "m" },
    ],
    instruments: [
      { tool: "gauge", where: "already placed at x = 2 m and x = 5 m, plotting the level η", why: "the tallest waves of the group pass the second gauge about 3 s after the first; one crest covers the same 3 m in about 1.6 s" },
    ],
    ui: { view: ["legendBtn", "partBtn", "readBtn", "hoverBtn"], fields: ["water", "speed"],
          panel: "shut", legend: false, controls: ["speed", "waveT", "waveA"], gaugeFields: ["eta"],
          readouts: { rows: ["pos", "eta", "uw"] } },
    steps: [
      "Press {btn:trainBtn} (or {key:V}): the flap at the left end rocks six times — gently up, steady, gently down — and stops.",
      "Follow ONE crest: it appears at the back of the group, runs forward through it and fades away at the front.",
      "Now follow the GROUP, where the waves are tallest: it moves at about half the speed of a crest.",
      "Time both on the two {tool:gauge}s, 3 m apart: when do the tallest waves pass each one? How long does one crest take?",
      "Change the Wave period and fire again. Pick Speed in {btn:legendBtn}: the water moves only under the group.",
    ],
    background: [
      "The flume holds 0.80 m of still water; the flap is hinged on the bed and swings most at the surface, as the water does in a deep-water wave. Each train is six waves of period 1.13 s, about 2 m long.",
      "A crest moves at the phase speed c_p = L/T. In deep water (depth more than about half a wavelength) c_p = gT/2π, about 1.8 m/s here, and the group moves at the group velocity c_g = c_p/2, about 0.9 m/s.",
      "The wave energy travels with the group, not with the crests: a crest that runs ahead of the group has nothing to carry it and dies away.",
      "The waves shrink as they travel: the grid damps short waves, so the group fades towards the far end, where the flume absorbs what is left.",
    ],
    settle: 0,
  },
]);
