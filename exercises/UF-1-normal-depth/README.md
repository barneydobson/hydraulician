# UF-1 · Normal depth scales as q^(3/5)

Every student runs the same steep chute at their own discharge, reads one
number — the overlay's **measured** normal depth `y_n` — and posts `(q, y_n)`.
Pooled on log-log axes the class's points trace a straight line: the Manning
exponent, extracted from a channel whose roughness nobody typed in. `C_f` was
set once, in the scene file; the `n` the class reads back out is a measured
property of the solver's delivered resistance, not an input.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UF-1**, or use the direct link
[`?ex=UF-1`](https://barneydobson.github.io/hydraulician/?ex=UF-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Uniform flow is where the bed slope and the friction slope balance, and
Manning puts the depth that does it at

    y_n = (q·n / √S₀)^(3/5)        n = y_n^(5/3)·√S₀ / q

The app assumes none of that. It reads the friction slope off the computed
energy grade line and reports

    y_n = h·(S_f/S₀)^⅓             n = h^⅔·√S_f / V

so the `n` in the hover box is whatever the wall function, the eddy viscosity
and the rasterised bed actually deliver. This chute is **1 in 4**
(`S₀ = 0.25`, printed as "1 : 4" in the box) and supercritical end to end, so
nothing downstream controls it — there is no tailwater step in this exercise.

## Your discharge

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class.

    q = 0.80 + 0.04·d   (m²/s)

## What to do

1. Set **Controls → Inflow q** to your own `q` — the note under the slider
   prints your `y_c`.
2. Press `R` and let it reach steady state — about **26 s**; the card counts
   it down.
3. Hover mid-chute at **x ≈ 3.5 m**, clear of the crest (x < 1 m) and of the
   brink (x > 5.5 m), and read the **y_n … (measured)** row off the box — the
   same number the green dashed line draws.
4. Watch it for ~10 s, take the typical value, and submit **q, y_n**.

## For the instructor — pooling the class

Collect one row per student (`student,digit,scene,q,yn`), export the CSV and
run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script fits log `y_n` against log `q` and prints the slope against
Manning's 3/5, then histograms every student's back-calculated
`n = y_n^(5/3)·√S₀/q` in a second panel.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Do not present the fit as "confirms 0.6".** The dry-run class fitted
  0.72, and the gap is explainable rather than sloppy: the measured `y_n`
  comes from `y_n = h·(S_f/S₀)^⅓`, a quadratic-drag closure whose own
  idealised exponent is 2/3, not Manning's 3/5; and this solver's delivered
  roughness falls as the flow deepens, so `n` is not quite constant across
  the class's range. Ten independent runs collapsing onto one straight line
  is the finding; the exact exponent is the discussion.
- **Why is there no tailwater to set?** Switch **Field → Froude**: the whole
  chute reads supercritical (1.3–2.5 measured). Nothing downstream can
  influence this reach, which is why this worksheet — unlike the jump demos —
  never asks anyone to re-check a level against `y_c` after changing `q`.

The full verification record — the ten-run measured class, endpoint
robustness out to t = 100 s, the flutter measurement and the safe `q` bounds
— is archived in the repository at
`exercises/UF-1-normal-depth/_archive/README-full.md`.
