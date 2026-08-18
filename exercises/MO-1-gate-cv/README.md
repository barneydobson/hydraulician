# MO-1 · Sluice gate: thrust and C_d from the control volume

Everyone runs the same vertical gate on the same flat bed at the **same
discharge**, and each student changes only **how far the gate is raised** —
the opening `a`. From two depths (a calm upstream pool, a hover reading in the
accelerating jet) and the panel's own discharge, each student computes two
numbers a first-year formula sheet already gives them: a discharge coefficient
and a control-volume thrust. Pooled, the C_d's land in a tight cluster around
0.6 across openings that differ by 60% — a constant nobody typed in anywhere.
The thrust does not track a naive hydrostatic guess at all, and closing that
gap *is* the momentum equation's job.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **MO-1**, or use the direct link
[`?ex=MO-1`](https://barneydobson.github.io/hydraulician/?ex=MO-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

With `y₀` the upstream pool depth, `y₁` the depth at the vena contracta just
past the gate and `V = q/y` at each:

    C_d   = q / (a·√(2·g·y₀))
    F_R   = ρ·q·(V₀ − V₁) + ½·ρ·g·(y₀² − y₁²)     per metre width
    naive = ½·ρ·g·(y₀ − a)²                       the gate as a static wall

with ρ = 1000 kg/m³ and g = 9.81 m/s². The discharge is **q = 0.330 m²/s for
the whole class** — your opening and its paired reservoir level are the
personalisation. The bed's top face is at **y = 0.50 m** above the datum and
the gate stands at **x = 5.50 m**, so your opening is `a` = (gate bottom
− 0.50). Compute `naive` as well as `F_R`: the gap between them is the point.

## Your gate opening

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Your opening is `a = 5 + round(3d/9)` cells,
which you draw; the reservoir level beside it is the settled fixed point for
q = 0.330 at that opening, so it needs no iteration.

| d | opening a | gate bottom, y (m) | Reservoir level (m) |
|---|---|---|---|
| 0, 1 | 5 cells (0.109 m) | **0.609** | **1.7565** |
| 2, 3, 4 | 6 cells (0.130 m) | **0.630** | **1.4181** |
| 5, 6, 7 | 7 cells (0.152 m) | **0.652** | **1.2103** |
| 8, 9 | 8 cells (0.174 m) | **0.674** | **1.0791** |

## What to do

1. The gate arrives drawn at the 7-cell opening (bottom at y = 0.652). Adjust
   it to your own row — Erase (`2`) to raise the bottom, Wall (`1`) to carry
   it down; zoom in first and set the height with Measure (`8`) against the
   bed's 0.50 m top face.
2. Set **Reservoir level** to your row. **Inflow q** stays at 0.330 for
   everyone.
3. Place a gauge — Gauge (`5`) — in the calm pool at **x = 3.5 m**, just above
   the bed (y ≈ 0.65 m).
4. Press `R` and let it reach steady state — about **70 s**; the card counts
   it down. The pool should look flat back to the left edge, with a clean jet
   springing out under the gate.
5. Read **y₀** off the gauge card's `h`, then hover at **x = 5.63 m** and read
   the box's *depth h* as **y₁** — do not hover closer to the gate, where the
   box smooths across the opening and reads far too deep. Submit **a, y₀, y₁,
   C_d, F_R** (with your `d`).

## For the instructor — pooling the class

Collect one row per student (`student,digit,a_m,q,y0_m,y1_m,Cd,FR_N_per_m`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script re-derives C_d, F_R and the naive comparator from (a, q, y₀, y₁)
rather than trusting anyone's calculator, plots C_d against opening with the
0.6 line and the pooled mean through it, and below that F_R against the naive
hydrostatic guess.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **What would make hydrostatics right?** Zero velocity — `naive` is the exact
  answer in the V → 0 limit. Switch Field → Speed and look at the jet
  springing out under the gate: that momentum flux is precisely what a static
  wall cannot feel, and it is why the gap grows from ~5% to ~28% as the gate
  opens.
- **Why does C_d drift down (0.611 → 0.560) rather than sit flat?** y₀/a falls
  from 11.6 to 3.4 across the class, and the "deep upstream, small opening"
  assumption behind the idealised orifice constant is best obeyed by the
  smallest openings. The coefficient is slowly varying, not constant, and a
  spread-out class measures the trend without being told to look for it.

The full verification record — the ponding trap and why the apron is
truncated, the boundary-strategy measurement, the hover-fidelity scan behind
the x = 5.63 m station, the safe opening band and troubleshooting — is
archived in the repository at
`exercises/MO-1-gate-cv/_archive/README-full.md`.
