# WV-2 · The buried wave gauge

Every student drops two pressure gauges on one vertical near the paddle — one
just off the floor, one just under the surface — and reads the ratio of their
oscillation amplitudes. Linear theory says that ratio collapses onto a single
curve, `1/cosh(kh)`, whatever the wave. Personalising the period spreads the
pooled class along the whole of it, from a bed gauge that barely notices the
depth to one that is genuinely buried.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **WV-2**, or use the direct link
[`?ex=WV-2`](https://barneydobson.github.io/hydraulician/?ex=WV-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Wave pressure does not reach the bed intact — depth filters it:

    p/(ρg) at height z above the bed  ∝  cosh(k·z)
    bed swing / surface swing  →  1 / cosh(k·h)      σ² = g·k·tanh(k·h)

So a seabed recorder reads a smoothed, shrunken copy of the surface above it,
and how much it loses is set by `kh` alone — short waves in deep water vanish
long before they reach the instrument. Still-water depths measured off the
solver: **wave h = 0.353 m**, **wavedeep h = 0.739 m**.

## Your period and stroke

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Take your period from the table, and with it
the paired stroke.

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **T (s)** | 1.10 | 1.10 | 1.20 | 1.30 | 1.40 | 1.50 | 1.65 | 1.85 | 2.10 | 2.10 |
| **stroke (m)** | 0.055 | 0.055 | 0.055 | 0.060 | 0.060 | 0.060 | 0.060 | 0.065 | 0.070 | 0.070 |

Even digits also run the deep flume, on its own rows:

| d | 0 | 2 | 4 | 6 | 8 |
|---|---|---|---|---|---|
| **T (s)** | 0.60 | 0.75 | 0.90 | 1.05 | 1.20 |
| **stroke (m)** | 0.05 | 0.08 | 0.11 | 0.15 | 0.19 |

## What to do

1. Under **Controls → Wavemaker**, set **Period** and **Amplitude** to your
   row.
2. Press `R` and let it reach steady state — about **20 s**; the card counts
   it down.
3. Zoom on the paddle and, with **Gauge** (`5`), click twice on one vertical
   near it — **x ≈ 0.6 m** — once low, roughly a tenth of the depth above the
   floor (your **bed** gauge), then once about three-quarters of the way up
   with a visible band of water still above it (your **surface** gauge).
4. Read the peak-to-peak swing of **H** on each card — half of (highest −
   lowest) is that gauge's amplitude — and submit **T**, **bed amplitude**,
   **surface amplitude** and **ratio = bed / surface**. A surface trace that
   goes flat and stops moving has left the water: place it lower and re-settle.

**Also:** even digits repeat on **wavedeep** (Scenes menu), same two gauges at
x ≈ 1.2 m. If the bed trace never settles into a clean repeating wiggle — as
jagged as the surface one, or bigger — submit `NOISY` instead of a ratio. That
is the honest answer there, and half the point of the second run.

## For the instructor — pooling the class

Collect one row per student (`student,digit,flume,T_s,ratio_dft`, with `NOISY`
rows entered as an empty ratio and `NOISE` in a `note` column), export the CSV
and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script solves `kh` from each row's period and depth, plots the submitted
ratio against it on the `1/cosh(kh)` curve, and draws the noise-flagged rows
as their own series with a `+` marking where their true ratio sits.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Show the class why the deep flume goes blind.** Load `wavedeep`, place the
  same two gauges and watch: the bed trace is as jagged as the surface one and
  often larger. Nothing is broken — the true bed signal there is 0.2–16 mm
  against a 35–49 mm floor of real paddle-driven unsteadiness, so a raw point
  probe cannot see it. "This instrument cannot resolve that" is a different
  failure from "the theory is wrong", and only one of them can be engineered
  away.
- **The whole `wave` series sits a little above the curve — a bias, not
  scatter.** The idealised `1/cosh(kh)` assumes gauges exactly at the bed and
  exactly at the surface; real ones are inset at both ends, and pressure
  attenuates less between two inset points. Scoring each gauge at its own
  measured height drops the bias from +29% to +8%.

The full verification record — the calibrated stroke tables and why the
scene's own defaults are unsafe, the spin-up recording trap, the gauge-station
and clearance measurements, the repeatability evidence behind the noise-floor
finding, safe bounds and troubleshooting — is archived in the repository at
`exercises/WV-2-buried-gauge/_archive/README-full.md`.
