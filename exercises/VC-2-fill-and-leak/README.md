# VC-2 · Storage = in − out

A tank is fed from the top by a spout and drained through a hole near its
floor. The outlet is open when the card opens: the outflow grows with the
depth of water over the hole, so the level climbs more and more slowly and
stops where outflow equals inflow. The students predict that level from the
mass balance, Q_in = Q_out, with the outflow law given to them, compare it
with what the tank does, and find the outlet's coefficient C. Pressing V
shuts the valve and shows the other half of storage = in − out: with nothing
going out the level climbs in a straight line, dh/dt = Q/S.

A small calculation exercise students play with on their own (L5, volume
conservation); the lecturer can also show it in class. No personalised
parameter, nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **VC-2**, or use the direct link
[`?ex=VC-2`](https://barneydobson.github.io/hydraulician/?ex=VC-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Per metre width, for a tank of plan width S:

    dV/dt = S dh/dt = Q_in − Q_out

The level stops changing where Q_out = Q_in. The outlet is a hole of height
a = 0.08 m with its centre at z_o = 0.59 m, and the water leaves it at a
speed of about √(2gh), h being the height of the surface above the centre of
the hole. That speed comes from Bernoulli (lecture 7), so the card **gives**
it rather than deriving it:

    Q_out = C · a · √(2gh)          C ≤ 1: the jet narrows just past the edge

and setting Q_out = Q_in gives the settled height

    h = (Q_in / (C·a))² / 2g        level η = z_o + h

With C = 1 (the ideal) the prediction is too low; the C that makes it match
is the outlet's effective discharge coefficient. Valve shut, Q_out = 0 and
the level rises linearly at Q_in/S.

**Sign convention.** The Control volume counts what LEAVES as positive on
every face (net = out − in), so for the tank `net = −dV/dt`. The slides count
inflow as positive (`S dh/dt = Q₁ − Q₂`). Same equation, opposite sign: say so
before reading the box.

## The bench

| item | where |
|---|---|
| tank | inside faces x = 0.40 → 2.40 m, so **S = 2.00 m** (per metre width); floor top z = 0.50 m; walls to z = 3.00 m |
| outlet | through the right wall, z = 0.55 → 0.63 m (a = 0.08 m, centre z_o = 0.59 m), behind a scene valve — **open** at boot |
| inflow | the spout at (1.40, 3.30), 0.16 m wide, firing straight down; **Inflow Q** (the slider on the card) sets its speed so it delivers Q |
| outflow | a free jet into open air; it leaves through the open right and bottom edges and cannot come back |
| start | still water at η = 0.70 m, Q = 0.25 m²/s (slider 0.10 → 0.30) |

## What to do

The card carries these steps.

1. **Predict with C = 1.** For Q = 0.25 m²/s: h = (0.25/0.08)²/19.62 =
   0.50 m, so a level of 1.09 m.
2. **Read the level.** The card arrives with a Gauge already placed at
   **(1.0, 0.6)**, plotting *Level η* (the card's `gauges` entry), so it
   records the free surface from t = 0: the tank boots at 0.70 m and the
   curve rises (in > out) and flattens (in = out). Wait until it is flat
   (about a minute): it settles near **1.73 m**, well above the C = 1
   prediction.
3. **Find C.** h = 1.73 − 0.59 = 1.14 m, so C = Q/(a√(2gh)) ≈ **0.66**.
4. **Check it.** Slide Inflow Q to 0.15: with C = 0.66 the prediction is
   1.00 m; the tank settles at **1.04 m**.
5. **Optional: the valve.** Press V to shut it: the level climbs in a
   straight line at **≈ 0.125 m/s** (Q/S = 0.25/2.00 at Q = 0.25). A Control
   volume from **(0.30, 0.40)** to **(2.70, 3.12)** reads in, out, net and
   dV/dt — "net + dV/dt" ≈ 0 at every instant. Press V again to reopen.

## For the instructor

**The calculation, as the card sets it (Oct 2026).** The outlet now starts
open and the students predict the settled level from Q_in = Q_out with the
outflow law given (√(2gh) is lecture 7). Measured headless at Medium
(325 × 293, Δx = 12.3 mm), outlet open from boot, level = the surface found
at x = 0.7 and 2.1 m, averaged over 10 s once settled:

| Q (m²/s) | C = 1 predicts η | tank settles at η | h = η − 0.59 | C that matches |
|---|---|---|---|---|
| 0.25 | 1.09 m | **1.73 m** (1.726) | 1.14 m | **0.66** |
| 0.15 | 0.77 m | **1.04 m** (1.036) | 0.45 m | **0.63** |

So the effective coefficient of this outlet is **C ≈ 0.63–0.66** (the first
draft measured 0.64–0.67 by the same route). With C = 0.66 from the first
inflow, the 0.15 prediction is 1.00 m against 1.04 m measured: the check the
card asks for lands within 4 cm. The jet contracting just past the sharp
edge is most of it (C_c ≈ 0.6–0.65 for a sharp-edged slot). From the boot
level of 0.70 m the tank needs about 80 s at Q = 0.25 to reach its level
within 1 cm (≈ 1.63 at 40 s, 1.69 at 60 s, 1.72 at 80 s).

Re-measured Oct 2026 off the card's own pre-placed gauge (one column,
x = 1.0 m, Level η, Medium): 0.70 → 1.03 m by 5 s (the spout's first
splash), 1.39 at 20 s, 1.52 at 30 s, 1.60 at 45 s, 1.65 at 60 s, 1.68 at
90 s, 1.69 at 120 s; **95% of the rise at ≈ 59 s**. The single column reads
2–4 cm under the two-station mean above — its surface sits in one-cell
terraces and the spout's disturbance reaches it — so a student's gauge
reading of 1.69–1.70 m gives C ≈ 0.67–0.68 rather than 0.66; well inside
what the exercise asks.

### In the lecture

- Before anything settles, have the class do the C = 1 prediction (1.09 m)
  and commit to it; the tank then goes well past it.
- The step from "it settles where in = out" to "how high" needs the outflow
  law; say plainly that √(2gh) is a promise for lecture 7.
- Press V to shut the valve for the linear rise, dh/dt = Q/S, and the
  Control volume's in / out / net / dV/dt — the original L5 demonstration.

### Earlier measurements (valve shut at boot, then opened)


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
