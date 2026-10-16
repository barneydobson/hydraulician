# VC-2 · The tank that fills and leaks

A tank is fed from the top by a spout and drained through a hole near its
floor, behind a valve. With the valve shut the level climbs in a straight
line, `dh/dt = Q/S`. Open it and the outflow grows with the depth over the
hole, so the level climbs more and more slowly and stops where outflow equals
inflow; change the inflow and it finds a new level. A Control volume round
the tank reports what goes in, what comes out, and the rate the tank is
storing water: the net flux is not zero while the level moves, and it is
once it has stopped.

This is a **lecturer demo** (L5, volume conservation): no personalised
parameter, nothing to pool. Students replay it.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **VC-2**, or use the direct link
[`?ex=VC-2`](https://barneydobson.github.io/hydraulician/?ex=VC-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Per metre width, for a tank of plan width S:

    dV/dt = S dh/dt = Q_in − Q_out

Valve shut, Q_out = 0, so the level rises linearly at `Q_in/S`.

Valve open, the hole is an orifice of height a with its centre at z_o:

    Q_out = C_d a √(2g(η − z_o))

which grows with the level η. The level stops where Q_out = Q_in:

    η∞ = z_o + (Q_in / C_d a)² / 2g

and approaches it roughly exponentially, with a time scale
`τ ≈ 2S(η∞ − z_o)/Q_in` (linearise the orifice law about η∞).

**Sign convention.** The Control volume counts what LEAVES as positive on
every face (net = out − in), so for the tank `net = −dV/dt`. The slides count
inflow as positive (`S dh/dt = Q₁ − Q₂`). Same equation, opposite sign: say so
before reading the box.

## The bench

| item | where |
|---|---|
| tank | inside faces x = 0.40 → 2.40 m, so **S = 2.00 m** (per metre width); floor top z = 0.50 m; walls to z = 3.00 m |
| outlet | through the right wall, z = 0.55 → 0.63 m (a = 0.08 m, centre z_o = 0.59 m), behind a scene valve — **shut** at boot |
| inflow | the spout at (1.40, 3.30), 0.16 m wide, firing straight down; **Inflow Q** (Controls → Geometry) sets its speed so it delivers Q |
| outflow | a free jet into open air; it leaves through the open right and bottom edges and cannot come back |
| start | still water at η = 0.70 m, Q = 0.25 m²/s (slider 0.10 → 0.30) |

## What to do

1. Place a **Gauge** (`5`) at **(1.0, 0.6)** — the card sets Gauges plot to
   *Level η*, so it reads the free surface itself (the column's top), not a
   pressure that the falling inflow keeps shaking. Drag a **Control volume**
   (`9`) from **(0.30, 0.40)** to **(2.70, 3.12)**: round the whole tank,
   below the spout, across the outlet jet.
2. **Valve shut.** The level climbs in a straight line. Read the slope off
   the gauge chart (or two readings a few seconds apart): **≈ 0.125 m/s**,
   Q/S = 0.25/2.00. The box: in ≈ 0.25 through the top face, out 0, net
   −0.25, dV/dt +0.25 — "net + dV/dt" ≈ 0.
3. **Press V** after a few seconds (before the level passes ~1.5 m). The
   jet leaps out of the hole; the level keeps rising, more and more slowly,
   and stops at **≈ 1.70 m** after about **40–50 s**. Out climbs to meet in;
   net and dV/dt both go to zero.
4. **Change Inflow Q** to 0.15. The level falls (out > in, dV/dt < 0) and
   settles at **≈ 1.03 m** in about 40 s.
5. Ask the class to predict each settled level from the orifice law before
   it arrives, with C_d ≈ 0.65.

## For the instructor

Measured headless on Resolution Medium (325 × 293 cells, Δx = 12.3 mm) with
`rig.js`. The level is the MEAN surface, floor + (water in the tank)/S, which
the gauge on Level η tracks to within a cell.

| reading | prediction | measured |
|---|---|---|
| spout delivery (box top face, mean) | slider Q | 0.15 → 0.157, 0.20 → 0.204, 0.25 → 0.248 m²/s (±3%) |
| valve shut, Q = 0.25: dh/dt | Q/S = 0.125 m/s | 0.123 m/s (0.96 → 1.50 m in 4.4 s) |
| valve shut, Q = 0.20: dh/dt | 0.100 m/s | 0.100 m/s (earlier geometry, a = 0.10 m) |
| open, Q = 0.25: settled η | C_d = 0.65 → 1.77 m | **1.70 m**, within 1 cm ~45 s after V (from 1.50 m) |
| open, Q = 0.15: settled η | C_d = 0.65 → 1.01 m | **1.03 m**, within 1 cm ~40 s after the change (from 1.70 m) |
| implied C_d = Q/(a√(2g(η − z_o))) | 0.6–0.65 | 0.67 at Q = 0.25, 0.64 at Q = 0.15 |

The instantaneous face fluxes flutter by ±0.03 m²/s (the inflow splashes,
the outlet jet pulses); the Control volume's readout is time-filtered
(τ = 1 s), and the stored rate dV/dt is a 2 s fit, so they read steadily.

**The storage term is new on the Control volume.** Until this exercise the
box printed "in, out, net (…%, should be 0)" — continuity for a steady box
only, which is exactly wrong for this demo. It now also prints the rate the
box's water volume is changing (Σ min(f, 1) over the box, slope of the last
2 s) and the closure "net + dV/dt (…%, should be 0)". For a steady box
dV/dt ≈ 0 and the line reads as it always did.

**How the inflow slider works.** A scene parameter cannot write the spout
directly, but the scene's `solids()` is handed the live parameters and is
re-run on every slider move, so it sets the spout's downward speed to
Q/(2r) there (r = 0.08 m). The spout is a disc of prescribed water and
velocity, and delivers within ±3% of 2r·|v| (measured above). If the panel's
spout rows are opened with ⋯ and changed by hand, the next move of Inflow Q
puts the speed back.

### Discussion points

- **Linear vs not.** Shut, nothing depends on h, so h(t) is a straight line;
  open, Q_out depends on h, so the approach to equilibrium is curved — the
  first differential equation they meet that is not trivially integrable.
- **The equilibrium is stable.** Above it out > in and the level falls; below
  it in > out and it rises. Step 4 shows the fall.
- **Sign conventions.** The box's net (out − in) is −dV/dt: in step 2 net
  reads −0.25 while the slides would write S dh/dt = +0.25.
- **Time scale.** τ ≈ 2S(η∞ − z_o)/Q ≈ 18 s at Q = 0.25: a few τ to settle,
  which is the 40–50 s seen.
