# NC-1 · Slope-area method: estimate the mystery discharge

The classic river-gauger's problem: no flow meter, just a tape measure and a
levelling staff. Two surface levels a known distance apart give the energy
slope; a wetted cross-section and a roughness estimate give the conveyance;
multiply and you have a discharge nobody measured directly — the same
technique that puts a number on a flood nobody could stand next to. The class
does it here on a chute–jump–apron reach with the discharge concealed, one
7 m window each, and the argument afterwards is about *where* along a reach
the method works, not whether it works at all.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **NC-1**, or use the direct link
[`?ex=NC-1`](https://barneydobson.github.io/hydraulician/?ex=NC-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Over a window of length L, the fall F in the water surface gives the energy
slope and the depth and roughness at the middle give the conveyance:

    K = h^(5/3) / n              Q̂₁ = K·√(F / L)

Then one velocity-head iteration, because the two ends are not running at the
same speed:

    V₀ = Q̂₁/h₀    V₁ = Q̂₁/h₁    h_v = V²/2g
    F_e = F + (h_v0 − h_v1)      Q̂₂ = K·√(F_e / L)

`Q̂₂` is the number you submit. Everything is per metre of width, **L = 7 m**,
and `n` is the *delivered* Manning's n the app prints beside `S_f` — about
0.07 on this reach, not the 0.03 a textbook table would offer. Depth falls
downstream here (it is an M2 drawdown), so `h_v1 > h_v0` and the correction
always subtracts a little; on a backwater it would add.

## Your gauge window

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class.

> **x₀ = 5.0 + 0.5 · (d mod 8)** metres — your window is **[x₀, x₀ + 7] m**,
> its midpoint **x₀ + 3.5**.

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **x₀ (m)** | 5.0 | 5.5 | 6.0 | 6.5 | 7.0 | 7.5 | 8.0 | 8.5 | 5.0 | 5.5 |

## What to do

1. Place two gauges — Gauge (`5`) — at **x₀** and **x₀ + 7**, anywhere inside
   the water; the scale bar and Measure (`8`) find the stations. Keep the
   Controls panel shut: it holds the answer.
2. Press `R` and let it reach steady state — about **32 s**; the card counts
   it down.
3. Watch both gauge cards for 20–30 s. Each prints **`H`**, the surface
   elevation; **F** is the fall between the middles of the two traces, in mm
   — tens to well over a hundred, and clearly positive.
4. Hover the midpoint **x₀ + 3.5** for **h** and **n**, and each window end
   for **h₀** and **h₁** (middle of the wobble, never one glance); compute
   Q̂₂ and submit **x₀, F, Q̂₂**.

## For the instructor — pooling the class

Collect one row per student (`student,digit,x0,x1,F_mm,h0,h1,n_mid,Qhat`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script recomputes K, Q̂₁ and the velocity-head pass from each row's raw
readings rather than trusting the submitted number, then plots Q̂ against
window position with the concealed true q as a dashed line and a ±20% band,
over a bar chart of the raw fall F.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Walk the bank.** Put a second gauge pair at x₀ ≈ 4.0–4.5 m, in the jump's
  wake, and take the same reading live: identical arithmetic, 22–63% low.
  Where you set your staff *is* the measurement.
- **The same method on `m1`.** Open m1 (Scenes menu) and gauge two points 8 m
  apart on that backwater pool: the fall is about a millimetre, under the
  solver's own read noise, and half the windows come back with the
  downstream gauge sitting *higher* than the upstream one. Slope-area was
  never the broken part — the reach was.

The full verification record — why m1 was abandoned for m3, the measured fall
at every candidate window, the delivered-n spread, settle evidence and safe
bounds — is archived in the repository at
`exercises/NC-1-slope-area/_archive/README-full.md`.
