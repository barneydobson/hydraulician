# MM-1 · A jet turned through an angle

A free jet strikes a vane, and one slider sets how far the vane turns it: from
a flat plate that sends it off at right angles (θ = 90°) through curved vanes
to a cup that sends it almost straight back (θ = 175°). A Control volume round
the vane reads both components of the force on it. F_x climbs from ρqU to
nearly 2ρqU as the jet is turned back on itself; F_z peaks at the flat plate
and falls away to almost nothing at the cup. Direction matters as much as
speed — the same jet pushes nearly twice as hard when it is sent back, which
is why turbine buckets are cups, and is the jet-pack argument the other way
round.

This is a **lecturer demo** (L6, momentum): no personalised parameter,
nothing to pool. Students replay it.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **MM-1**, or use the direct link
[`?ex=MM-1`](https://barneydobson.github.io/hydraulician/?ex=MM-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Steady flow, a free jet at atmospheric pressure on every face of the control
volume, per metre width. The jet arrives at U along +x and leaves at the same
speed in the direction (cos θ, −sin θ). Momentum theorem on a box round the
vane:

    F_x = ρqU(1 − cos θ)          F_z = ρqU sin θ

(the force OF the water ON the vane: pushed downstream and, because the vane
sends the water down the screen, pushed up the screen). At 90° both are ρqU;
at 180° F_x = 2ρqU and F_z = 0.

## Why the jet is seen from above (gravity off)

The textbook vane is a horizontal jet in a horizontal plane, so this scene is
a **plan view**: gravity acts into the screen. That was chosen over a jet in
the vertical plane because there gravity contaminates exactly what the demo
is for:

- the jet sags over its flight and meets the vane off its axis;
- a sheet turned downward speeds up as it falls through the vane, one turned
  upward slows and rains back onto the incoming jet (MO-2 measures +20% from
  that rain-back on a flat plate);
- the box's F_z includes the weight of every drop inside it, so the vertical
  component — half of what this demo shows — would read gravity as much as
  momentum.

Unlike the `plan` scene the plane is not full of water: the jet is a free jet
in air at p = 0, as the textbook assumes. The shaders switch to a two-sided
(plan-view) equation of state at g exactly 0, which pulls a free surface
together, so the scene sets **g = 10⁻³ m/s²**: the free-surface path stays on
and the jet sags 0.03 mm over its 1 m flight. All four edges are outfalls
(spray that reaches them leaves; with no gravity, a plain open edge let it
pond against the boundary). Gauges and the head fields are meaningless at this
g and are not offered.

## The bench

| item | where |
|---|---|
| spout | centre (0.50, 1.60), 0.18 m wide, 4.5 m/s along +x |
| vane | a hood 0.12 m above the jet axis from x = 1.15 m, a 0.12 m fillet into a flat plate at x = 1.60 m, the plate down to z = 1.20 m, then a lip of radius 0.25 m turning a further θ − 90°, then a 0.20 m straight run-out along the exit direction; 0.06 m thick |
| slider | **Turning angle θ** (Controls → Geometry), 90° → 175°; the vane redraws, the water keeps running |
| Control volume | (0.95, 0.65) → (1.90, 1.95): clear of the spout, round the whole vane |

## What to do

1. Pick the **Control volume** (`9`) and drag it from **(0.95, 0.65)** to
   **(1.90, 1.95)**. Hover the jet just inside the box's left face: U ≈ 4.5
   m/s; the left-face Q at θ = 90° is the jet's q ≈ 0.79 m²/s. So
   ρqU ≈ 3.5 kN/m.
2. θ = 90° (the flat plate): read **F→** and **F↑** — both about ρqU.
3. Slide θ to 120°, 135°, 150°, 175°, letting each settle ~5 s, and read
   both components each time against ρqU(1 − cos θ) and ρqU sin θ.
4. Switch **Field → Momentum flux**: warm is water still heading +x, blue is
   water sent back. At 175° the returning sheet is as blue as the jet is red.

## For the instructor

Measured on Resolution Medium (345 × 276 cells over the 3.0 × 2.4 m
domain, Δx ≈ 8.7 mm), headless, 4 s settle after each slider move then 3 s of
raw box integrals averaged (`rig.js`, `MM1.sweep()`). The jet, from a section
across it at x = 0.85 m: **q = 0.79 m²/s, U = 4.46 m/s, ρqU = 3.53 kN/m**
(ρ∫u²dz).

| θ | F_x measured | ρqU(1 − cos θ) | ratio | F_z measured | ρqU sin θ | ratio |
|---|---|---|---|---|---|---|
| 90° | 3.50 kN/m | 3.53 | 0.99 | 3.32 | 3.53 | 0.94 |
| 120° | 4.95 | 5.31 | 0.93 | 2.89 | 3.06 | 0.94 |
| 135° | 5.61 | 6.03 | 0.93 | 2.47 | 2.50 | 0.99 |
| 150° | 6.10 | 6.59 | 0.93 | 1.87 | 1.77 | 1.06 |
| 175° | 6.58 | 7.04 | 0.93 | 0.78 | 0.31 | — |

F_x at 175° is **1.88×** the flat plate's: "nearly double". The steady 7%
shortfall on the curved vanes is the turned sheet leaving slower than it
arrived — friction and the corner eddy under the hood take ~10% of the jet's
energy, which the box's own energy line reports as "lost" (~1 kW/m of
7.8). At 90° the plate's loss does not show in F_x because the exit is
perpendicular to x. At 175° the sheet leaves a few degrees short of the vane
angle (≈ 167°), and sin of a small angle is very sensitive to it: 0.78 kN/m
against 0.31 predicted is that, not a broken balance.

Things the class will notice:

- **The Q line of the box at large θ.** The jet enters and the returning sheet
  leaves through the SAME (left) face, so that face's Q nets to nearly zero and
  the box prints "in 0.02 out 0.04". Volume is still conserved — it is the
  per-face sum that cancels. Momentum does not cancel: incoming and outgoing
  both carry −x momentum out of the box's point of view, and that is exactly
  why the force doubles. A good question to put to them.
- **A thin stream off the hood's leading edge.** Some of the jet's upper edge
  is driven back along the hood underside by the corner eddy and leaks round
  its upstream end. It is small (it crosses the box's top face and is counted)
  but visible.
- **Startup spray.** The first impact and every slider move throw filaments
  of water that, with no gravity, drift until they reach an edge. They are
  harmless to the reading once outside the box.

The `MO-2` and `HP-2` rigs show the same physics in the vertical plane, with
hand-drawn deflectors and gravity; this scene is the clean version with one
continuous slider.
