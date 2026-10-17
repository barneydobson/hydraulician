# Year 1 programme (CIVE40008)

What we want students to get out of the simulator in Year 1. Agreed with the
lecturer for L2–L6 (MvR). L7–L8 are taught by a colleague and carry rough
ideas only. Interface details (which buttons and instruments each exercise
shows) are worked out during implementation.

## How the pack is organised

Following the structure proposed in the pack review (linked from issue #29),
adjusted to the exercises we actually agreed:

- **IDs never collide with the existing pack** (the exercises travel
  upstream): momentum is MM, not MO; the beach is WV-4; HS-1 and HJ-2 keep
  their IDs.
- **Topics** in three parts: statics; flow fields and the three conservation
  laws; applications. The topic gives each exercise its ID and its place.
- **Ladder** within a topic: **L1** establish · **L2** apply · **L3**
  synthesise. Rungs order exercises inside one topic only.
- **Tier on each exercise, not on the topic:** Year 1 core · Extension ·
  Advanced · Preview. The same scene can be given to a different audience
  with richer controls and different things to measure.
  - Note: "Advanced" is really "other" for now. Fine for the moment, to be
    revisited.
- **Formats** (issue #54): **Demo** = lecturer at the front · **Play** =
  students in class, 5–10 min · **Lab** = students, personalised, submitted.
  In practice most Year 1 items are a Demo that students then replay.

Principles:

- **Few, rich scenes**, each showing several concepts.
- **Exercises never let students draw.** The scene is fixed; students change
  it only through the card's sliders and buttons and read it with the
  instruments. Building belongs to sandbox mode.
- **Sliders over presets.** One continuous slider morphs the scene (wall
  shape, contraction sharpness, body shape, vane angle).
- **Shared scenes.** The contraction rig is one scene asked different
  questions in different topics (VC-1, MM-2, and later energy).

## Year 1 course order

| Lecture | Exercises, in order |
|---|---|
| L2 Fundamentals | FF-1 Wind over a lake · UP-1 Water hammer |
| L3 Statics | HS-1 Dyke and piezometer · PF-2 Wall shape |
| L4 Fluid motion | FF-2 Spillway · FF-3 Flow past a body · FF-4 Pipe jet into a reservoir · (FF-5 contraction rig, idea) |
| L5 Mass conservation | VC-1 Contraction rig, steady · VC-2 Fill and leak |
| L6 Momentum | MM-1 Jet on an inclined plate · MM-2 Contraction rig, forces · HJ-2 Sluice gate |
| L7–L8 | taught by a colleague; rough ideas at the end |
| Year 2 preview | WV-4 How waves break on beaches |

The course menu (`js/menu.js`, fork-local) lists exactly these, in this order.

## First drafts: status and points for the lecturer (2026-10-16)

All fourteen are built as first drafts: scene, card, brief (`exercises/<ID>-…/README.md`)
and headless `rig.js`, with the numbers in each brief measured, not assumed. New shared
capability: a **wind shear stress** on the free surface (FF-1) and a **streamline display**
(VIEW → Streamlines, key T; contours of ψ, of the mean flow under Average). What each
draft does not yet do well, as measured:

| ID | Works | Needs a decision or more work |
|---|---|---|
| FF-1 | Set-up ≈ 4.9 cm at τ = 20 N/m², return flow, exact mirror for −τ, decays at τ = 0 | τ range is ~40× a real gale (scaled for visibility); set-up invisible below ~5 N/m²; last mm of seiche decays slowly; τ sits under the "Geometry" panel heading |
| UP-1 | New `pipeline` scene (reservoir → straight pipe → valve → overflowing tank), 14.5 m tall; card sliders c (20–35 m/s, default 30) and overflow crest (10.2–11.6 m, v₀ 2.7–1.1 m/s): Δt ≈ 16/c, ΔH ≈ c·v₀/g, T ≈ 4L/c | At c = 35 with the lowest crest the return wave reaches zero pressure; below c = 20 the slot's compression makes the wave visibly faster than c; corner gauge cards hidden in favour of inspector windows; Speed ×0.25 |
| HS-1 | Re-verified on current main: all brief numbers hold | — |
| PF-2 | F_h = ½ρgd² within 1.5% for overhang, vertical, 30°, 60°, staircase; F_v = weight of water above / "water that isn't there" | Optional submerged block reads 5% high; force chip now labels F_h / F_v on every face, with ½ρgd² on this card |
| FF-2 | Spillway, flip bucket, plunge pool; bucket lip angle slider; Average gives clean rollers | Throw is short (jet leaves at about half the lip angle, lands 4–5 m out) |
| FF-3 | Ellipse → square at fixed frontal width: steady wake → Kármán street (St ≈ 0.16); Average gives a symmetric bubble | Shedding onset (s ≈ 0.3) is slow to grow — jump from ellipse to s ≥ 0.6 in the lecture; dye fades before the wake; Re ≈ 180 (laminar street) |
| FF-4 | Pipe profile develops; jet flaps then breaks up ~4–6 m out; averaged bells; entrainment visible in the flux | Now a free-surface reservoir spilling over an end wall at x = 24 m (the lidded tank is history) (free-surface versions failed, documented); eddy viscosity, Re ≈ 400; far-field average still lumpy at 60 s |
| FF-5 / VC-1 / MM-2 | Contraction rig: Q equal in both pipes; ΣQ ≈ 0.2%; R from the CV matches the formula; taper vs step differ by ≈ the extra loss; vena contracta Cc ≈ 0.68 | Slider restarts the water (25 s warm-up); vena contracta is thin at Medium (best on Vorticity); straight-pipe friction is a tiny number; outlet jet runs along the right reservoir's surface; dye does not reach the pipe |
| VC-2 | dh/dt = Q/S to 2%; settled level matches C_d ≈ 0.65; CV now shows dV/dt and closes to < 1% | Inflow slider drives the spout through a workaround in the scene's `solids()` |
| MM-1 | Plan view (gravity ≈ 0), inclined flat plate 90°→20°, free-slip: CV F_n within 1–6% of ρqU sin θ (a few % high), along-plate force ≤ 6% of F_n; sheets q₁, q₂ within 0.01–0.04 m²/s of q(1 ± cos θ)/2 | Small sheet under two cells below 30°; start-up spray wobbles the box; CV chip still prints an energy line |
| HJ-2 | Reworked to the lecturer's sequence: only the pool full at t = 0, weir flat (crest 0); gate force two ways (28.1 diagram, 30.2 box vs ½ρg(d₀−a)² = 28.7 kN/m); non-hydrostatic pressure at the gate; raising the weir forms a jump, then drowns the gate | A jump forms from the sheet only at crest ≥ 0.5 m (0.55 reliably); once formed, 0.45 washes it out, 0.46 holds it where it is, ≥ 0.6 drowns the gate |
| WV-4 | Spilling (tanβ 0.06) and surging (tanβ 0.7) clear | Plunging does not curl over: the front goes vertical and collapses (also at High) |

---

## Shared scene: the contraction rig

Two reservoirs, both filled to the top, joined by a wide pipe that contracts
into a narrower second pipe discharging into the right reservoir. One slider
sets the contraction: from a long gentle taper over the whole wide pipe to a
wide pipe of constant width that converges faster and faster to the fixed
narrow pipe, ending as an abrupt step. Used by FF-5 (streamlines), VC-1
(continuity), MM-2 (forces) and, later, energy (contraction against
expansion).

---

## Part 1 · Statics

### Pressure, force and where it acts — PF

#### HS-1 · Three surfaces, one level: a dyke and its piezometer (existing) — Demo

- **Tier:** Year 1 core · **Rung:** L1 · **Used in:** L3
- **Slides:** 18–23, 31, 35–36, 46–49 (one level in a connected body; the
  piezometer; F_h = ½ρgd²; a sloped face; the valve equalises the levels).
- **Scene:** existing, `?ex=HS-1`. Keep as it is; re-verify on current main.
- **Interface:** as shipped (Gauge, Pressure force; Water, Pressure head,
  Piezometric head; Particles; panel shut).
- **New instrument:** Gauge, the valve, and Pressure force.

#### PF-2 · The wall's shape doesn't matter — Play

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L3
- **Slides:** 41–42, 46–51 (projection method, the staircase argument,
  "water that isn't there").
- **Scene:** new scene. A tank of fixed depth whose right-hand wall is a
  polygon set by a slider: overhanging, vertical, sloped at 30° or 60°, or
  stepped.
- **Student does:** at each setting, click the wall with Pressure force.
  F_h stays at ½ρgd² every time. F_v changes and equals the weight of
  water above the wall; for the overhang it points up.
- **Interface:** no build · tools: Pressure force · fields: Water, Pressure
  head · panel: focused, one row (wall shape).
- **New instrument:** a geometry slider on the card.
- **Readout:** the tool already prints the components, as a second chip
  under the resultant: `F = 15.7 kN/m` then `→ 12.3  ↓ 9.8 kN/m`. For this
  item, label them F_h and F_v, and print the ½ρgd² reference beside F_h.
- **Optional:** one more slider setting with a fixed block held underwater,
  for buoyancy as the net pressure force (slide 50).

## Part 2 · Flow fields and the conservation laws

### Flow fields, shear and turbulence — FF

New topic. It absorbs the review's "Shear layers and velocity profiles".

#### FF-1 · Wind over a lake — Demo

- **Tier:** Year 1 core · **Rung:** L1 · **Used in:** L2
- **Slides:** 3, 10–12 (a fluid at rest carries pressure only; it deforms
  under any shear).
- **Scene:** a rectangular tank of still water with a free surface, standing
  in for a lake.
- **Student does:** at rest, hover the water and read u = 0 and p = ρg·d.
  The Pressure head field shows flat horizontal bands: pressure only. Then
  move the wind slider: a shear stress τ on the free surface, positive
  (blowing right) or negative (blowing left). Arrows above the surface
  show the wind's direction and strength. The water starts to move and
  keeps moving for as long as the wind blows, however small τ is. The
  surface sets up against the downwind wall, and a return flow forms near
  the bed. Reverse τ and everything reverses; set it to zero and the motion
  dies away.
- **Point:** any shear makes a fluid flow; at rest there is pressure only.
- **Interface:** no build tools, no measuring tools (the hover probe only) ·
  fields: Water, Speed, Pressure head · strip: Play/Pause, Reset water,
  Field & legend, Particles · panel: focused, one row (wind stress τ,
  symmetric about zero).
- **New instrument:** the hover probe and the field legend.
- **Code needed:**
  - a wind shear stress on the free surface, with one signed slider for τ
    (not in the solver yet);
  - arrows drawn above the surface whose direction and length follow τ.

#### FF-2 · Spillway with a ski-jump (flip bucket) — Demo

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L4
- **Scene:** new. A reservoir on the left spills over an ogee crest and down
  the spillway face. At the toe a flip bucket (the ski-jump dissipator)
  throws the jet into the air, and it plunges into still water in a plunge
  pool on the right, held by a tailwater.
- **What it shows:**
  - **Velocity field** (slides 2, 9): the Speed colouring; almost still in
    the reservoir, accelerating over the crest, fastest at the toe, slowing
    in the pool.
  - **Steady vs unsteady** (7): the reservoir, the crest and the spillway
    face are steady (two pauses look the same); the plunge pool is not.
  - **Streamlines** (9–10, 19): converging towards the crest, crowded on the
    face, curving round the bucket, a free jet in the air, spreading in the
    pool. The spillway surface is a streamline.
  - **Separation and recirculation** (13): the rollers either side of where
    the jet enters the pool.
  - **Fluxes and mean velocity** (20–24): flux lines in the approach, on the
    face and in the pool; the same q at very different depths and speeds.
  - **Velocity profile and no-slip** (6, 29–30): a rake on the spillway face
    (the boundary layer growing from the floor) and in the approach flow.
  - **Turbulence** (36–43): the plunge pool fluctuates wildly live. Press
    Average and it becomes a calm mean flow with steady rollers. A velocity
    profile in the pool jitters live and is a clean curve when averaged.
    Turbulence = mean + fluctuation, and engineers design for the mean.
    Dye released in the reservoir is smeared in the pool: turbulence mixes.
- **Build note:** the right-hand edge is an outflow boundary. Make the
  domain wide enough that the turbulence from the plunge does not interact
  with it. No hydraulic jump and no stilling-basin fallback.

#### FF-3 · Flow past a body — Demo

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L4
- **Scene:** the existing `plan` scene (plan view, gravity off), with the
  body's shape on one continuous slider that morphs a slender ellipse
  aligned with the flow into a square of the same area. One way to do it is
  a superellipse |x/a|ⁿ + |y/b|ⁿ = 1: the slider takes n from 2 to about 10
  and the aspect ratio a/b from about 3 to 1, rescaling a and b to keep the
  area fixed. Students watch the wake go from steady to shedding as the
  shape gets bluffer.
- **To try out first:** where along the slider shedding starts, and whether
  it starts cleanly at this resolution. Also whether to hold the **area**
  fixed (the frontal width then grows as the body gets bluffer, which
  helps it shed) or the **frontal width** fixed (a fairer comparison of
  shape alone).
- **What it shows:**
  - **Steady vs unsteady at the turn of a slider** (7): the streamlined
    body gives a steady flow; bluff bodies shed vortices.
  - **Bluff vs streamlined, separation, wakes** (13, 15–18): the wake size
    and where the flow separates.
  - **Vorticity:** the shear layers and the shed vortices.
  - **Streamlines vs dye** (9, 16): in unsteady flow the dye no longer
    looks like streamlines.
  - **Turbulence and averaging:** the live wake alternates; the average is a
    symmetric, steady wake bubble. The flow is unsteady, its mean is steady.
- **To check:** a streamlined body really gives a steady wake at this
  resolution.

#### FF-4 · A pipe jet into a still reservoir — Demo / Play

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L4
- **Scene:** new. A pipe runs from a header into a large reservoir of still
  water and discharges a jet into it.
- **What it shows:**
  - **Wall boundary layer:** in the pipe, the profile grows from nearly
    uniform at the entrance towards a developed profile (rake at stations
    along the pipe; no-slip at the walls).
  - **Free boundary layer:** past the exit, the shear layer between the jet
    and the still water spreads and entrains; the jet widens and slows.
  - **Both at once:** one scene shows the boundary layer against a wall and
    the boundary layer against still fluid.
  - **Turbulence:** the live jet flaps and rolls up into eddies; Average
    gives a smooth, symmetric spreading jet. A profile across the jet
    jitters live and is a clean bell-shaped curve when averaged.
- **To check:** the reservoir is large enough that the jet does not
  recirculate back onto itself or feel the far wall within the demo time.

#### FF-5 · The contraction rig: streamlines — idea to develop

- **Tier:** Year 1 core · **Rung:** L1 · **Used in:** L4
- **Scene:** the shared contraction rig.
- **For L4:** streamlines. Gradual taper: smooth, converging streamlines.
  Abrupt step: separation in the corners and a vena contracta past the edge.
- **Status:** the rig is agreed for VC-1 (L5) and MM-2 (L6); its use in L4
  is an idea to develop alongside the scenes above.

Not shown in a scene (L4):

- The laminar–turbulent transition and Reynolds' experiment (36–37): the
  solver cannot show a true transition; use the photos and videos.
- Frame of reference (8): nothing in the simulator moves.
- Couette flow and the definition of μ (31–33): no moving plate.

### Volume conservation — VC

#### VC-1 · The contraction rig, steady — Demo / Play

- **Tier:** Year 1 core · **Rung:** L1 · **Used in:** L5
- **Slides:** 3–9 (Lagrangian/Eulerian; the control volume; Q₁ = Q₂).
- **Scene:** the contraction rig from L4.
- **What it shows:**
  - **Lagrangian:** particles speed up through the contraction; in steady
    flow each particle still accelerates.
  - **Eulerian:** flux lines in the wide and the narrow pipe read the same
    Q; a control-volume box round the contraction shows ΣQ = 0.
  - Moving the contraction slider changes the streamlines but not Q.

#### VC-2 · The tank that fills and leaks, unsteady — Demo / Play

- **Tier:** Year 1 core · **Rung:** L3 · **Used in:** L5
- **Slides:** 1, 10–17 (storage = in − out; dV/dt = Q_in − Q_out;
  S dh/dt = Q₁ − Q₂; the tank with several ports).
- **Scene:** new, kept really simple. A tank filled from the top, with one
  slider for the inflow rate, and an outlet near the bottom (a side outlet
  too, if it stays simple).
- **What it shows:**
  - Outlet shut: the level rises linearly, dh/dt = Q/S.
  - Outlet open: the outflow grows with depth, so the level slows and
    settles where inflow equals outflow. Move the inflow slider and it
    settles at a new level.
  - A control-volume box round the tank reports what goes in and what goes
    out. ΣQ ≠ 0 while the level changes, 0 once it has settled.
- **Note:** the CV counts outflow as positive; the slides count inflow as
  positive. Say so.

### Momentum conservation — MM

#### MM-1 · The force of a jet on an inclined plate — Demo / Play

- **Tier:** Year 1 core · **Rung:** L1 · **Used in:** L6
- **Slides:** 8, 20–21 (forces from solid surfaces; momentum in 2D, the
  inclined plate).
- **Scene:** `vane` (redesigned). A plan-view jet strikes a flat plate whose
  angle θ to the jet is one slider, 90° (square to the jet) down to 20°; the
  plate is fixed at each setting and centred on the jet's axis.
- **What it shows:**
  - Both components of momentum at once: the control-volume box gives F_x
    and F_z, and they combine into a force normal to the plate,
    F_n = ρqU sin θ.
  - The split q₁, q₂ = q(1 ± cos θ)/2: a smooth plate takes no force along
    itself, so the jet's momentum along the plate is shared out unequally.
- **Existing:** MO-2, HP-2 (separate rigs for the same idea).
- **To check:** the CV force readout shows both components clearly.

---

#### MM-2 · The contraction rig, forces — Demo / Play

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L6
- **Slides:** 3–6, 12–18.
- **Scene:** the shared contraction rig.
- **What it shows:**
  - A control-volume box round the contraction: the momentum flux in and
    out, the pressure force on each face, and the force on the wall,
    R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁).
  - With the contraction slider: the force depends mainly on the end
    conditions, not the shape in between. A gentle taper and an abrupt step
    give nearly the same R; the small difference is the loss (sets up L7).
  - The box moved onto a straight stretch of the narrow pipe: momentum flux
    in = out, so the whole pressure drop is wall friction (τ_w, slides
    16–18).

#### HJ-2 · Pressure and force on a sluice gate (ported from the OneDrive copy) — Demo

- **Tier:** Year 1 core · **Rung:** L2 · **Used in:** L6
- **Slides:** 10–11 (pressure is hydrostatic only where streamlines are
  straight).
- **Scene:** `gatejump`, to be ported from
  `OneDrive/…/2026_hydraulician-gate-jump` (built on 10 Sep code, never
  committed). Re-verify after #72.
- **What it shows:**
  - The Pressure force tool's diagram on the gate: hydrostatic near the
    surface, falling to zero at the lip where the streamlines curve.
  - The gate force from the Pressure force tool against the force from a
    control-volume box round the gate.
  - The weir slider pushes the downstream level up until the gate drowns.

### Energy conservation — EN

Taught by a colleague. See the rough ideas at the end.

## Part 3 · Applications

### Unsteady pipe flow — UP

#### UP-1 · Pressure travels at the speed of sound (water hammer) — Demo

- **Tier:** Year 1 core (used in L2, inside an Advanced topic) · **Rung:** L1 · **Used in:** L2
- **Slides:** Fundamentals 8 (compressibility, the speed of sound); Statics
  10 (transmission is fast but not instantaneous) can point back to it.
- **Scene:** existing `hammer`.
- **Lecturer does:** three gauges along the pipe. Slam the valve. The
  gauges respond one after the other. Lower c and repeat: the delay grows.
  The Gauge inspector shows the time series.
- **Interface:** no build · tools: Gauge · fields: Water, Pressure head ·
  strip: Play/Pause, Reset water, Valves, Field & legend · panel: focused,
  one row (Slot celerity c) · Gauge inspector on.
- **New instrument:** time series (the Gauge inspector).
- **Existing:** UN-1, B1, B2.
- **To redesign:** the `hammer` outlet is awkward and odd. Work out a
  cleaner rig before building this item.

### Waves — WV

#### WV-4 · How waves break on beaches — Demo

- **Tier:** Preview · **Rung:** L1 · **Used in:** Year 2 preview
- **Scene:** a wave flume, deep and of constant depth at the left with a
  paddle at the end wall making waves, running onto a beach whose slope is
  set by a slider on the card. Cropped and run at Low (c = 14) for speed:
  ~3.7× less work than the first draft (README, "Speed").
- **What it shows:** the breaker type changing with the slope — spilling on
  a gentle beach, plunging on a steeper one, surging on a steep one
  (the Iribarren number, for those who want it).
- **To check:** the solver's notes say breakers spill but do not plunge.
  Spilling and surging should work; getting a plunging breaker may need
  solver work, or more resolution than the class default.
- **Existing:** B5 (Iribarren map) has two beaches; `wave`, `wavesurge`.

Other Part 3 topics (pipe flow, hydraulic structures, gradually varied flow, similitude) hold the existing pack and are not part of this Year 1 list.

---

## L7–L8 · Rough ideas for the colleague teaching these lectures

Not discussed. Kept as a starting point only.

### L7 · Energy

#### Which jet goes furthest? — Play

- **Slides:** 14–16 (Torricelli, vena contracta).
- **Scene:** new rig. A constant-head tank with three holes at different
  heights.
- **Student does:** predict, run it, measure where each jet lands with
  Measure, and hover the jets to compare U with √(2gh).
- **Interface:** tools: Measure · fields: Water, Speed · panel: shut.
- **Existing:** QS-1, B8.

#### Bernoulli going in, not coming out — Demo

- **Slides:** 7–10, 13.
- **Scene:** new rig with two ducts: contraction then a gentle diffuser,
  and contraction then a sudden expansion.
- **Student does:** turn on Grade lines. The HGL dips at the throat and
  mostly recovers in the gentle diffuser, much less after the sudden
  expansion, where a recirculation bubble is visible.
- **Interface:** tools: Gauge · fields: Water, Energy head, Piezometric
  head · strip: Grade lines, Dye · panel: shut.
- **New instrument:** Grade lines (EGL/HGL) and the Energy head field.
- **Existing:** B7, LL-1.

#### Venturi rating — Lab

- **Slides:** 32–34.
- **Existing:** B7, re-skinned to this interface ladder.

#### The siphon's limit — Demo

- **Slides:** 23–28.
- **Content:** the model holds no negative pressure, so the crest fails
  where the HGL meets the pipe soffit. Present it as a limit of the model.
- **Existing:** B10.

### L8 · Pipes

#### The pipe's pressure is set downstream — Play

- **Slides:** 7–10.
- **Scene:** two reservoirs joined by a pipe through an embankment, with a
  piezometer on the pipe (the HS-1 dyke family).
- **Student does:** vary the downstream level: the piezometer follows h₃,
  and U follows √(h₁ − h₃).
- **Interface:** tools: Gauge · strip: Grade lines · panel: focused
  (tailwater level).

#### Losses you can see: entrance and exit — Demo

- **Slides:** 4–8.
- **Scene:** the rig above with sharp, rounded and re-entrant entrance
  inserts. The exit jet is visible.
- **Interface:** tools: Control volume (Q, Ė rows) · strip: Grade lines,
  Dye.
- **New instrument:** the energy row of the CV.
- **Existing:** LL-1.

#### Read the losses off the HGL — Lab

- **Slides:** 11–12, 18–19.
- **Existing:** LL-2 (find the throttle), re-skinned.

#### Power: h_f = H/3 — Lab

- **Slides:** 26–29.
- **Existing:** HP-1, re-skinned.

---

---

## Not possible in the solver (said once, in the lecture, not built)

- Two-fluid manometers.
- Floating bodies.
- The hydraulic press.
- The inverted cup / negative pressure.
- The Reynolds transition experiment.
- Rotating containers.

## What needs building

1. **FF-1** Wind shear stress on the free surface, one signed τ slider, and
   arrows above the surface showing its direction and strength.
2. **UP-1** Water hammer: redesign the `hammer` outlet.
3. **HS-1** re-verify on current main.
4. **PF-2** Tank with a wall-shape slider (overhang → vertical → slopes →
   steps); label the force components F_h and F_v, with ½ρgd² beside F_h.
5. **FF-2** Spillway with a flip bucket and plunge pool; the domain wide
   enough that the plunge turbulence does not reach the outflow boundary.
6. **FF-3** Body-shape slider in `plan` (ellipse → square); try equal area
   against equal frontal width; check the averaged wake is symmetric.
7. **FF-4** Pipe jet into a large still reservoir.
8. **Contraction rig** (FF-5, VC-1, MM-2): two full reservoirs, wide pipe
   into narrow pipe, contraction-sharpness slider.
9. **VC-2** The fill-and-leak tank with an inflow slider.
10. **MM-1** A jet on an inclined flat plate with a plate-angle slider; the
    CV force with both components shown clearly, and the unequal split.
11. **HJ-2** Port HJ-2 (`gatejump`) from the OneDrive copy onto main.
12. **WV-4** The beach with a slope slider.
13. **Everywhere:** a streamline display (FF-2, FF-3, FF-4, the contraction
    rig).
