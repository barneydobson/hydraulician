# VC-1 · The contraction rig, steady

The contraction rig of FF-5, asked about continuity. Water runs steadily
from a reservoir at 2.80 m through a 1.00 m pipe that contracts into a
0.50 m pipe and on into a reservoir at 2.40 m. Two ways of looking at the
same flow: follow a particle (**Lagrangian**) and it speeds up through the
contraction although nothing on screen changes in time; stand still and
count what crosses a line (**Eulerian**) and a Flux line in the wide pipe
and one in the narrow pipe read the same discharge Q. A control volume drawn
round the contraction closes the argument: what goes in on the left comes
out on the right, Σ Q = 0. Moving the contraction slider from a gentle taper
to an abrupt step changes the streamlines completely and Q only a little.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **VC-1**, or use the direct link
[`?ex=VC-1`](https://barneydobson.github.io/hydraulician/?ex=VC-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Per metre width (the simulator is two-dimensional, so an "area" is a bore
height and Q is in m²/s):

    Q = U₁A₁ = U₂A₂            steady, incompressible, one inlet and one outlet
    U₂/U₁ = A₁/A₂ = 1.00/0.50 = 2

For a control volume with fixed walls in steady flow the volume inside does
not change, so the net outflow through its faces is zero:

    Σ Q (outward positive) = Q_out − Q_in = 0

The Control volume tool counts **outflow as positive**; the slides count
inflow as positive. Same statement, opposite sign convention — say so.

A particle's acceleration in steady flow is the convective part of the
material derivative, Du/Dt = u ∂u/∂x + w ∂u/∂z: it comes from moving to
where the flow is faster, not from the flow changing in time.

## What to do

1. Open the card (L = 3 m, a gentle taper, already steady). Follow one
   particle through the contraction on **Speed**: its track lengthens as it
   goes — it accelerates.
2. Pick **Flux line** (`8`) and drag **upwards** across the wide pipe at
   x = 4.3 m (z = 0.4 → 1.6 m), then across the narrow pipe at x = 9.0 m.
   Each prints Q; the pair prints the difference, which should be 0.
3. Pick **Control volume** (`9`) and drag a box from (4.3, 0.3) to
   (9.0, 1.65): its left face cuts the wide pipe, its right face the narrow
   pipe, and its top and bottom run inside the pipe walls. The faces read Q
   in and Q out; Σ Q under the box is the closure.
4. Drag **Contraction length L** (Controls → Geometry) to **0 m**, the
   abrupt step. The run restarts and spins up; read the two Flux lines and
   the box again. The streamlines are now quite different (separation, a
   vena contracta); Q still matches in both pipes and has dropped by a few
   per cent, because the step loses more energy than the taper.

## For the instructor

Measured on Resolution Medium (746 × 127, Δx = 22.8 mm) with `CR` in
`rig.js` (each run restarted at its L, 35 s of spin-up, then the mean of 20
samples over 5 s). The card waits about **25 s**, the scene's measured
spin-up (Q is within 1% of steady by ~17 s); changing L restarts the run and
the same spin-up is replayed flat out.

| reading (per metre width) | taper, L = 3 m | step, L = 0 |
|---|---|---|
| Q₁, wide pipe (x = 4.3 m) | 1.345 m²/s | 1.283 m²/s (±0.04) |
| Q₂, narrow pipe (x = 9.0 m) | 1.345 m²/s | 1.285 m²/s |
| U₁ = Q/1.00, U₂ = Q/0.50 | 1.35, 2.69 m/s | 1.28, 2.57 m/s |
| Σ Q on the box (4.3, 0.3) → (9.0, 1.65) | 0.0059 m²/s (0.44% of Q) | 0.0069 m²/s (0.54%) |
| reservoir levels, left / right (probe at the floor, x = 3.0 / 14.0 m) | 2.77 / 2.38 m | 2.77 / 2.38 m |

The box's small positive Σ Q is the compression term, not a leak: Q uses
min(f, 1) while the water under pressure has f slightly above 1 (see
docs/engineering-notes.md, "Q and ṁ/ρ are not the same number"). With the
step the instantaneous readings flutter by about ±3% because the shear
layers off the corners shed eddies; read the median, or press **A**
(Average) and read the mean flow.

The step passes 5% less water than the taper between the same two
reservoirs: the slider changes the streamlines a great deal and Q a little,
by the step's extra loss. Particle tracks lengthen roughly twofold from the
wide to the narrow pipe, which is the factor U₂/U₁ = A₁/A₂ = 2.

The reservoirs. The left one is 3.6 m long and its level control holds
2.79–2.80 m over its far half; the surface then draws down smoothly to
2.70–2.75 m at the pipe entry, which is the water accelerating into the
pipe. The right one is 6 m long: the jet spreads over its whole depth and
leaves through the right edge, and the surface stands at 2.32 m by the
outlet wall (the jet's entrainment pulling it down a few centimetres) and
at 2.39 m from x ≈ 14 m to the edge. (Before the reservoirs were rebuilt the
right reservoir was 2.5 m long, the edge fed a 2 m/s current IN along the
surface, and the water piled up 0.17 m against the outlet wall: Q was 0.95
and the right probe read 2.48 m.)

### Discussion points

- Continuity says nothing about the shape between the two sections: Q₁ = Q₂
  holds for the taper and for the step alike. What the shape changes is the
  loss, and so the Q that a given level difference can drive.
- The box's top and bottom faces lie inside the pipe walls, so they carry
  nothing: every face integral skips solid cells. A face drawn through
  water parallel to the flow would read a small Q in and the same Q out.
- The velocity doubles, the particle accelerates, and yet nothing is
  unsteady: Lagrangian acceleration without Eulerian change.
