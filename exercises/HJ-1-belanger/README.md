# HJ-1 · Bélanger from a room full of flumes

Every student runs the same hydraulic jump at their own discharge, reads three
numbers off the jump box, and posts (Fr₁, d₂/d₁). Pooled on one axis the
class's points trace the Bélanger curve — a momentum balance that none of them
solved individually, drawn by twenty laptops at once. A few volunteers then
take the same jump onto a 1-in-4 bed, where their points fall visibly below
the curve: the horizontal-bed assumption failing in public, discovered rather
than announced.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HJ-1**, or use the direct link
[`?ex=HJ-1`](https://barneydobson.github.io/hydraulician/?ex=HJ-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A jump is a *momentum* balance across the roller, not an energy one, so the
depth ratio across it depends on nothing but the Froude number arriving:

    d₂/d₁ = ½·(√(1 + 8·Fr₁²) − 1)        ΔE = (d₂ − d₁)³ / 4·d₁·d₂

That is why d₂/d₁ needs only Fr₁, and why ΔE is a leftover rather than an
input. The scene is a chute onto a flat apron; the apron's bed sits at
**0.15 m** above the domain floor, and the tailwater levels below are
**elevations above that floor**, not depths over the bed — the panel prints
both.

## Your discharge

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Set **Inflow q** to `q = 0.42 + 0.03·d`, and
the **Tailwater level** to the row that goes with it. The tailwater is
1.3·d_c above the apron, except at d = 6 and d = 9 where it is 1.5·d_c; the q
slider prints your own d_c, so the pairing is yours to check.

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **q (m²/s)** | 0.42 | 0.45 | 0.48 | 0.51 | 0.54 | 0.57 | 0.60 | 0.63 | 0.66 | 0.69 |
| **d_c (m)** | 0.262 | 0.274 | 0.286 | 0.298 | 0.310 | 0.321 | 0.332 | 0.343 | 0.354 | 0.365 |
| **tailwater (m)** | 0.490 | 0.507 | 0.522 | 0.538 | 0.553 | 0.567 | 0.648 | 0.596 | 0.610 | 0.700 |

## What to do

1. Set **Inflow q** and **Tailwater level** to your own row.
2. Press `R` and let it reach steady state — about **35 s**; the card counts
   it down.
3. Watch the orange **HYDRAULIC JUMP** box on the apron for ~10 s and take a
   typical middle reading rather than a peak, then submit **Fr₁** and
   **d₂/d₁** (with your `d` and `q`).

Also, for the coda volunteers: switch to scene **s1** (Scenes menu) for the
same jump on a 1-in-4 bed at tailwater 0.95 / 1.00 / 1.05 m, and submit that
point too — expect d₂ well under Bélanger.

## For the instructor — pooling the class

Collect one row per student (`student,digit,scene,q,tail,Fr1,d2_over_d1`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script draws every point against the Bélanger curve coloured by that
student's own q, plots any `scene=s1` rows as a second series, and puts the
residual — percent away from the momentum prediction — in the panel below.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Why do the coda points sit below the curve?** Ask before telling: the
  horizontal-bed momentum balance has no weight component, and on a 1-in-4
  bed the streamwise weight of the roller is not small.
- **Where did the energy go?** Switch Field → Froude and watch the
  supercritical sheet turn white as it crosses Fr = 1 in the roller. ΔE
  climbs steeply with Fr₁, so the low-`d` students — running the thinnest,
  fastest sheet — are destroying several times more energy per metre than the
  high-`d` ones, which is the whole design case for a stilling basin.

The full verification record — the measured class sweep, why the q floor
moved to 0.42, the tailwater margins, safe bounds and troubleshooting — is kept locally, out of version control, at
`exercises/HJ-1-belanger/_archive/README-full.md`.
