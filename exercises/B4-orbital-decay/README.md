# B4 · Orbital decay, measured off the trails

Every student drops a column of orbit tracers into the deep-water flume,
zooms in until the trails stop being invisible, and reads off how much
smaller the loop is near the bed than at the surface. The vertical motion
dies out almost completely well above the bed — the verified figure for this
flume is 244× — while the horizontal motion never fully vanishes, because a
particle sitting on the floor can still slide sideways but cannot sink into
it.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **B4**, or use the direct link
[`?ex=B4`](https://barneydobson.github.io/hydraulician/?ex=B4).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A linear wave moves the water in orbits that shrink with depth, and the two
components shrink differently:

    horizontal ∝ cosh k(z+h)/sinh kh     vertical ∝ sinh k(z+h)/sinh kh
    σ² = g·k·tanh kh,   σ = 2π/T     ⇒   kh follows from your period

so the surface-to-bed ratio of the **vertical** swing is
sinh k(z_s+h)/sinh k(z_b+h). That climbs exponentially with kh — tens at
kh ≈ 1.5, thousands by kh ≈ 8 — which is why the short periods in the table
below look so different from the long ones. Here the deep flume's
still-water depth is **h = 0.7385 m** and the tracer column stands at
**x = 5.84 m**, mid-tank.

## Your period

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Take your column:

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **T (s)** | 0.60 | 0.75 | 0.90 | 1.05 | 1.20 | 1.35 | 1.50 | 1.60 | 1.60 | 1.60 |
| **stroke (m)** | 0.05 | 0.08 | 0.11 | 0.15 | 0.19 | 0.23 | 0.28 | 0.30 | 0.30 | 0.30 |

## What to do

1. Set **Period** and **Amplitude** to your column under Controls →
   Wavemaker.
2. Press `R` and let it reach steady state — about **40 s**; the card counts
   it down.
3. Scroll-zoom onto the tracer column at x = 5.84 m until the loops are
   clearly bigger than a few pixels — the column and ×6 vertical
   exaggeration arrive already set — then watch 15–20 s and press `space` to
   pause.
4. Read the **vertical** extent of the topmost (surface) trail and of the
   bottom-most (bed) trail against the scale bar, and submit **T** and
   **ratio = surface / bed**. A bed trail with no visible vertical extent at
   all is a real reading at the short-period end — say so alongside your
   number.

## For the instructor — pooling the class

Collect one row per student (`student,digit,T_s,vratio_submitted_naive`) and
add `kh`, the one piece of instructor arithmetic — solve σ² = g·k·tanh kh at
h = 0.7385 m for each period. Then export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script plots every submitted surface/bed ratio against kh on a log axis,
with the linear-theory curve — built from this flume's own tracer elevations,
no fitting — climbing away above the data.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Where does the bed's horizontal motion come from?** Drag Controls →
  Trail length from 3 s out to 15 s: the bed trail smears into a long
  horizontal streak while the surface trails stay loops. Most of that length
  is the return current a closed flume needs, not orbit — which is exactly
  why the ratio the class submits is the vertical one.
- **Watch kh do the work.** Run T = 0.60 s, then T = 1.60 s, without moving
  the view: at the short period the loops have collapsed by mid-depth —
  theory gives about 2% of the surface swing there — while at the long one
  the middle tracer is still turning at some 40% of it.

The full verification record — the digit-by-digit sweep, the
paddle-frequency fitting method, the noise-floor comparison that explains
why the pooled points plateau far below the theory curve, and the runner
notes behind all of it — is kept locally, out of version control, at
`exercises/B4-orbital-decay/_archive/README-full.md`.
