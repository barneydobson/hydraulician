# UN-3 · Surge tank: fit k to the decay

A standpipe is teed into the penstock just upstream of the valve. Slam the
valve and the pipe's momentum has nowhere to go but up the shaft: a **mass
oscillation** with a period of about ten seconds, decaying over a couple of
minutes. The exercise is to download the gauge trace, integrate the surge
ODE beside it in a spreadsheet, and adjust the friction coefficient **k**
until the model matches the measurement.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UN-3**, or use the direct link
[`?ex=UN-3`](https://barneydobson.github.io/hydraulician/?ex=UN-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Rigid column, free surface in the shaft, friction ∝ u². With z the shaft
level below the reservoir:

    (L/g)·du/dt = z − k·u|u|          dz/dt = −(A/A_s)·u

A/A_s = 2.9/0.96, read off the screen. L = 75 m is the length of the moving
column — longer than the 47 m of pipe because the water in the shaft moves
A/A_s times faster than the water in the pipe, and counts accordingly.

k is the unknown. Integrate the pair from the first crest — u = 0 there, so
no starting velocity is needed and the slam transient is skipped — and
change k until the computed z matches the measured one.

One numerical point: update z with the current step's u, as written in the
equations below. Updating it with the previous step's u feeds energy into
the oscillation, and the fitted k then depends on the step size.

## Your reservoir level

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Your reservoir level is **10.0 + 0.4·d**
metres, set on the **Reservoir level** slider. Nothing is drawn.

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **level (m)** | 10.0 | 10.4 | 10.8 | 11.2 | 11.6 | 12.0 | 12.4 | 12.8 | 13.2 | 13.6 |

## What to do

1. Set **Reservoir level** to your own value, then press `R`. Let it reach
   steady state — about **100 s**; the card counts it down.
2. Place a Gauge (`5`) inside the shaft, a metre or so above the pipe.
3. Press `V` to slam the valve. Let it swing five times, then pause (**space**).
4. **Controls → Gauges → ⤓ CSV** downloads everything the gauge recorded.
   Open it in Excel: columns t, h, d, speed.
5. From the d column compute the measured **z = R − 2 − d** (the pipe floor
   is 2 m above datum), and **dt** between successive rows.
6. Start the model at the first crest — z equal to the measured value there,
   u = 0 — and step both forward:

       u_i = u_{i−1} + dt_i · (g/L) · (z_{i−1} − k·u_{i−1}·|u_{i−1}|)
       z_i = z_{i−1} − dt_i · (A/A_s) · u_i

7. Plot the measured and modelled z together and change k until they match.
   Submit **k**.

## For the instructor — pooling the class

Collect one row per student (`student_id,digit,level_m,k_s2m`), export the
CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

One point per student, k against digit. On the shipped dry-run class k runs
1.9–2.3 with mean 2.1: the digit sets the amplitude, k belongs to the rig.

### Discussion points

- **Why the measured decay is sharper than the model.** With k set to match
  the first three crests, the model sits about 0.1 m above the measured
  fourth and fifth. Quadratic drag removes Δc ∝ c² per cycle, so its decay
  almost stops as the swing shrinks; the water also has small losses that
  are linear in u (boundary-layer viscosity — in the sim, the explicit
  viscosities), and these do not fade with amplitude. The u² term dominates
  the large swings; the linear losses take over the tail.
- **k is not the penstock's friction.** Steady running draws the shaft down
  only about 0.1 m at about 1 m/s — a k of about 0.1, twenty times less than
  the surge measures. In steady running no water turns up the shaft; after
  the slam all of it does, through a tee that contracts to a third of the
  bore. k is that entry loss — in effect a throttled surge tank; real tanks
  are often throttled deliberately.
- **The tank did not abolish the water hammer.** Switch Gauges to the **h**
  channel and slam again: the roughly 3 s Joukowsky wave is still there,
  swinging about 6 m each way, because this tank's area is only 0.33 of the
  pipe's (a real one runs 10–50). Reading **d** filters it out, and it is
  one reason the model starts at the first crest.

The full verification record is kept locally, out of version control, at
`exercises/UN-3-surge-tank/_archive/README-full.md`.
