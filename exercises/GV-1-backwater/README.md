# GV-1 · The class digitises the backwater curve

Every student hovers at their own assigned chainage on the same settled M1
backwater — a mild channel ponded behind a weir — and reads one number: the
surface elevation. Nobody changes a parameter, so the personalisation is the
station rather than the discharge. Pooled, the class's own points trace the
whole backwater curve; laid over a direct-step integration they collapse onto
it to a fraction of a millimetre, everywhere except the last half-metre
against the weir face, where the 1D hydrostatic assumption visibly, honestly,
gives up. A validation study, run by the room.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **GV-1**, or use the direct link
[`?ex=GV-1`](https://barneydobson.github.io/hydraulician/?ex=GV-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A gradually varied profile is a first-order ODE you could integrate by hand,
marching upstream from a known control:

    dy/dx = (S₀ − S_f)/(1 − Fr²)        S_f = n²V²/R^(4/3),  R = h

`R = h` exactly here — a 2D vertical-plane slice has no side walls, so the
wetted perimeter is just the surface width. The scene is fixed and shared by
the whole class: **S₀ = 0.0147** (1 in 68), **q = 0.250 m²/s**, a weir at
x = 13.4 m whose crest stands 0.42 m above the local bed and whose upstream
face is at **x = 13.05 m**, and a reservoir level pinned at 0.89 m. The
delivered roughness, measured off the solver mid-reach, is **n ≈ 0.035**.
Do **not** touch **Inflow q** or the **Reservoir level** — everyone has to be
reading the same backwater.

## Your station

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class.

    x = 1 + d   (metres from the left/inflow edge)

So `d = 0` → x = 1 m and `d = 9` → x = 10 m. In a class of more than ten, the
next three students take **x = 11, 12 and 13 m**, in that order.

## What to do

1. Press `R` and let it reach steady state — about **30 s**; the card counts
   it down. There is nothing to set.
2. Hover over the water at your station: the top row of the box prints the
   cursor's own **x, y**, so you can put it exactly on your chainage.
3. Read the **surface** row ("… m above datum") off the **M1 profile** box,
   watch it for a few seconds, take the typical value, and submit **x,
   surface elevation**.

At x = 13 m you are inside the guard band at the weir face, so the box drops
its "M1 profile" title and keeps the numbers. Read it anyway — that station
is the one the pooled plot is most interested in.

## For the instructor — pooling the class

Collect one row per student (`student,digit,x,elevation`), export the CSV and
run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script seeds a direct-step march from the class's own best point clear of
the weir — not from a textbook weir rating, which underpredicts this pool by
~130 mm — integrates upstream at n = 0.035, and plots the class's points
against that curve over a true-scale geometry panel, with the weir-face zone
shaded.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Why is the agreement this good?** The pool is deep relative to normal
  depth (`h/y_n` ≈ 2–2.7), so the friction slope measures ~0.0004 against
  `S₀ = 0.0147` — under 3% of it. The GVF equation nearly degenerates to
  `dy/dx ≈ S₀`: the depth grows at exactly the rate the bed falls, and the
  surface comes out flat almost by construction. That is why an M1 pool
  behind a badly-placed weir can drown a reach for a long way upstream.
- **Why does the weir-face point miss?** Hover the last half-metre with
  **Field → Speed**: `u` climbs from ≈0.4 m/s out in the pool to ≈0.95 m/s at
  the face, and a vertical component appears. Hydrostatic pressure and
  gently-varying streamlines — the two assumptions the ODE is built on —
  both fail there, so the −27 mm gap is physics the 1D model was never asked
  to carry, not solver error.

The full verification record — the settle and flutter measurements, the
delivered-`n` windows, the end-station checks and the direct-step RMS gaps —
is archived in the repository at
`exercises/GV-1-backwater/_archive/README-full.md`.
