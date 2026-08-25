# PU-1 · System curve measured, operating point kept honest

Every student turns their own rising main's pump up or down, reads the head it
takes at the discharge flange, and submits `(Q, H)`. Pooled, the class's points
trace the system's own resistance curve. Then the lecturer hands out a
manufacturer-style pump curve on paper, the class finds the intersection
graphically, and one student imposes that exact `Q` live: the flange gauge
should land on the head the graph predicted.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **PU-1**, or use the direct link
[`?ex=PU-1`](https://barneydobson.github.io/hydraulician/?ex=PU-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A pump has to lift the water and then pay the pipe for carrying it, so the head
the *system* demands rises as the square of the flow, while a real pump's own
curve falls. They meet at one point, and that is where the machine will sit:

    H_system = H_s + K·Q²            the duct's demand
    H_pump   = H₀ − a·Q²             the manufacturer's curve
    operating point:  H_pump(Q) = H_system(Q)

`H_s` is the static lift, which the rig fixes by geometry: at the lowest flow
the delivery tank stands **1.00 m** above the sump, so the fitted intercept is
a check on the drawing rather than a free parameter (measured: about 1.1 m
fitted against 1.0 m). The paper pump curve to hand out is
**H_pump = 1.539 − 33.72·Q²**, which crosses the class's fitted system curve at
about **Q = 0.10 m²/s, H = 1.2 m**.

`H` is a *difference* of two gauges, flange minus sump. Gauge cards print
piezometric head (elevation + pressure) above the domain floor, so the
difference is the head the pump adds above the sump's own surface. Read gauges,
not the hover box's `pressure head p/ρg` row — that one carries no elevation.

## Your pump speed

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. The pump is the spout parked inside the pipe,
and your setting is

    spout velocity → = 1.50 + 0.09 · d   m/s

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **v (m/s)** | 1.50 | 1.59 | 1.68 | 1.77 | 1.86 | 1.95 | 2.04 | 2.13 | 2.22 | 2.31 |

That is the pump's nominal setting, not the flow it delivers: `Q` is measured,
never assumed from `v`, and the gap between the two is exactly what the class's
resistance curve records.

## What to do

The sump, rising main and delivery tank arrive drawn, dry, with the spout off.
Priming is shared by the whole class and comes before anybody's own digit.

1. Tick **Top-left spout** and let it rain into the sump for about **7 s** of
   sim time — watch `t` in the status bar.
2. Spout (`4`) — drag the spout to **(2.0, 0.60)**, just inside the low-run
   bore, and set **Spout velocity → = 2.2 m/s**. Leave it about **55 s**, until
   the delivery tank is spilling over its lip. This step is not optional.
3. Set **Spout velocity →** to your own value and let the main re-settle —
   about **10 s**.
4. Drop two gauges (Gauge, `5`): the flange at **(3.0, 0.60)**, inside the pipe
   just downstream of the pump, and the sump's open water at **(0.9, 1.0)**.
5. Hover the low-run bore (x ≈ 2.7 m) and read the **`q`** row — that is your
   **Q** — take **H** as gauge 1's **h** minus gauge 2's **h**, and submit
   **Q, H**.

## For the instructor — pooling the class

Collect one row per student (`student,digit,spout_vx_ms,Q_m2s,H_m`), export
the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script fits `H = H_s + K·Q²` by least squares against `Q²`, plots it
against the paper pump curve, and marks their intersection — the operating
point.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Hand the pump curve out only once the class's own points are up.** The
  discovery order is the lesson: they measure their system first, and only then
  get a "manufacturer" curve to intersect it with. Nominate one student to dial
  their spout until the hover `q` reads ≈ 0.10 and read the flange gauge live —
  it lands on the graph's crossing to within a few percent.
- **NPSH and the affinity laws stay on slides, and *why* is the two minutes
  worth spending.** The solver's equation of state floors pressure at zero, so
  there is no suction side that can fall below vapour pressure and nothing to
  cavitate; and this "pump" is a velocity source planted in the duct, not a
  rotating machine with a speed or a diameter to scale.

The full verification record — the rig geometry and why the pump is a spout
inside the bore, the priming evidence, the ten-student sweep, the volume audit,
safe bounds and troubleshooting — is kept locally, out of version control, at
`exercises/PU-1-system-curve/_archive/README-full.md`.
