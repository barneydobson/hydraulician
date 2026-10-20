# B5 · Iribarren map jigsaw

Each pair is handed one point on the Iribarren map: a beach, a period and a
stroke. They read off what the wave actually does — spills, surges, or dies
before it gets there — and how wide the surf zone is. Pooled on a log-ξ
axis, the class's own points reproduce the textbook spilling and surging
bands either side of a hole in the middle: nothing anyone runs, on either
beach, ever plunges.

**Open it:** press **E** in the [app](../../../../)
and pick **B5**, or use the direct link
[`?ex=B5`](../../../../?ex=B5).
How to run any exercise: see the [teaching pack index](../../INDEX.md#running-an-exercise).

## Theory

Breaker type is set by one number — the beach slope against the deep-water
steepness of the wave arriving at it:

    ξ₀ = tanβ / √(H₀/L₀)          L₀ = g·T²/2π
    spilling  ξ₀ < 0.5      plunging  0.5–3.3      surging  ξ₀ > 3.3

Two beaches carry the map between them: `wave` is 1-in-10 (**tanβ = 0.10**)
and `wavesurge` is the steep sea wall (**tanβ = 0.70**, the coded slope).
Both stand in **h = 0.348 m** of still water. Every cell's ξ₀ below was
measured on the flume — H₀ is the deep-water-equivalent height, with
shoaling taken back out — so you submit it rather than derive it.

*Cell 1 (T = 0.70 s) is a closure-on value, not re-measured: the short wave
is nearly standing near the paddle and the two-probe split does not give a
stable H₀ with the closure off (ξ₀ anywhere from 0.39 to 1.4).*

*Re-measured Oct 2026 with the mixing-length closure off and ν = 1e-4 m²/s in
the wave flumes (mvreeuwijk/hydraulician#2); closure-on values (ν = 1e-5)
were 0.92, 0.73, 0.73, 1.05, 2.11, 3.75, 6.53, 8.19 for cells 2–9 and 4.07,
3.81, 3.35, 5.52, 8.19, 12.73 for cells 10–15. The small waves (cells 2, 3, 8,
9, 10) moved most; cells 4, 5, 7, 11, 12 hardly at all.*

## Your cell

This one is assigned by **cell**, not by digit — your lecturer will explain
the assignment in class. Your row gives a scene, a period, a stroke and the
ξ₀ you submit with your observation.

**`wave` — the 1-in-10 beach**

| cell | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| **T (s)** | 0.70 | 0.90 | 1.10 | 1.50 | 2.10 | 3.00 | 4.00 | 5.00 | 6.00 |
| **stroke (m)** | 0.035 | 0.045 | 0.055 | 0.060 | 0.070 | 0.055 | 0.045 | 0.035 | 0.030 |
| **ξ₀** | 0.51* | 0.66 | 0.63 | 0.76 | 1.05 | 1.98 | 3.86 | 5.18 | 9.52 |

**`wavesurge` — the steep sea wall**

| cell | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|
| **T (s)** | 0.80 | 1.40 | 1.40 | 1.80 | 3.00 | 4.20 |
| **stroke (m)** | 0.060 | 0.130 | 0.173 | 0.080 | 0.140 | 0.199 |
| **ξ₀** | 5.11 | 3.83 | 3.36 | 6.05 | 8.21 | 11.36 |

## What to do

1. Cells 10–15 live on the other beach: switch to **wavesurge** (Scenes
   menu, `S`) before anything else. Cells 1–9 stay on the flume that loads.
2. Set **Period** and **Amplitude** to your cell under Controls →
   Wavemaker, press `R` and let it reach steady state — about **40 s**; the
   card counts it down — then watch 15–20 s more while the wave crosses to
   the beach.
3. Classify what happens at the beach: **spilling**, a foamy broken front
   migrating down the wave face · **surging**, no foam anywhere and the
   water's edge running smoothly up the slope and back · **dies**, nothing
   reaches the beach and the water there stays flat.
4. If it spilled, left-drag **Measure** (`8`) from where the foam first
   appears to the still shoreline for the **surf width**, and submit
   **cell, ξ₀, behaviour, surf width** (or "N/A").

## For the instructor — pooling the class

Collect one row per pair (`pair,scene,T_s,amp_m,xi0,behaviour,surf_width_m`;
only `scene`, `xi0` and `behaviour` are needed), export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script draws one lane per beach on a log-ξ₀ axis with the classical
bands shaded behind them, colours each cell by the behaviour actually
observed, and prints how many cells landed inside the plunging window — and
how many of those actually plunged.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Run cell 12 on the projector** (`wavesurge`, T = 1.40 s, stroke
  0.173 m). Its ξ₀ = 3.36 sits right on the classical plunging boundary and
  it still surges cleanly, no foam: an overturning tongue is thinner than a
  free surface two cells thick can hold, which is why the middle band comes
  out empty for the whole class rather than for one unlucky pair.
- **"Dies" is data — look at where it clusters.** On `wave` it lands at LOW
  ξ₀ (cells 2, 3, where the classical answer is "plunging") and at the
  small-wave end (cells 8, 9): steep enough by the ratio but too small in
  absolute height to break in the 0.9 m of flat water between paddle and beach
  toe. Cell 3 is marginal — its H₀ (48 mm) is close to cell 4's (61 mm), which
  spills — so expect some pairs there to report a weak front.

The full verification record — the 15-cell measurement table with the
observed behaviour of every row, the two-probe incident-wave method behind
each ξ₀, the breaking-onset detector's blind spots at both ends of the
domain and the paddle-safety ceiling — is kept locally, out of version control, at
`courses/original/exercises/B5-iribarren/_archive/README-full.md`.
