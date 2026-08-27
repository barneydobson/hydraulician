# UN-3 · Surge tank: fit k to the decay

A standpipe is teed into the penstock just upstream of the valve. Slam the
valve and the pipe's momentum has nowhere to go but up the shaft: a **mass
oscillation** with a period of about ten seconds, decaying over a couple of
minutes. Download the gauge trace, integrate the lectures' ODE in a
spreadsheet next to it, and turn its one unknown — the friction coefficient
**k** — until the two curves lie together. One number, and the whole class
should agree on it.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UN-3**, or use the direct link
[`?ex=UN-3`](https://barneydobson.github.io/hydraulician/?ex=UN-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Rigid column, free surface in the shaft, friction ∝ u². With z the shaft level
below the reservoir, this is the pair from lectures:

    (L/g)·du/dt = z − k·u|u|          dz/dt = −(A/A_s)·u

Every constant in it can be measured except k. The widths are on screen:
A/A_s = 2.9/0.96. L is the length of the **moving column** — switch friction
off and the pair is simple harmonic with T = 2π·√(L / (g·A/A_s)), so the
crest-to-crest period of your own trace fixes it. It comes out near 75 m, not
47: the shaft's water moves A/A_s times faster than the pipe's, so each of its
metres counts three times over, and the junction water rides along too.

That leaves k. Integrate the pair step by step from the **first crest** —
u = 0 there, so no starting velocity is needed and the slam transient is
skipped — and adjust k until the computed z falls on the measured one. One
trap: step z with the **same row's** u (the semi-implicit form below). Stepping
it with the previous row's u feeds energy into the oscillation, and the k you
fit then depends on the timestep.

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
   Open it in Excel: columns t, h, d, speed, data from row 2. The shaft level
   is **d + 2** (the pipe floor is 2 m above datum).
5. Constants in K1:K6, then a z and a dt column:

       K1  L      = =$K$4*$K$3*($K$6/(2*PI()))^2
       K2  k      = 1.5            ← the knob
       K3  A/A_s  = =2.9/0.96
       K4  g      = 9.81
       K5  R      = your reservoir level
       K6  T      = crest-to-crest period, read off the trace

       E2  z      = =$K$5-2-C2     fill down
       F3  dt     = =A3-A2         fill down

6. Find the row where z is deepest — that is the first crest, around row 180
   if you slammed soon after settling. Suppose it is row 183; the model is
   two columns started there and filled down:

       G183  z_model = =E183          H183  u_model = 0
       H184  = =H183+F184*$K$4/$K$1*(G183-$K$2*H183*ABS(H183))
       G184  = =G183-F184*$K$3*H184

7. Chart A against E and A against G on one scatter, and tune K2 until the
   model lies on the trace. Submit **T, L and k**.

Expect T ≈ 10 s, L ≈ 75–80 m and **k ≈ 2** — and your neighbour, on a
different reservoir level, should land on the same k.

## For the instructor — pooling the class

Collect one row per student (`student_id,digit,level_m,T_s,L_m,k_s2m`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

One point per student, k against digit. On the shipped dry-run class k runs
1.95–2.72 with mean 2.2, flat across a reservoir ladder spanning 3.6 m — the
digit sets the amplitude, k belongs to the rig. The one outlier (d = 7) is a
misread period: its L = 83 m stands out immediately, which is the check worth
showing.

### Discussion points

- **Why the measured decay is sharper than the model.** Quadratic drag loses
  Δc ∝ c² per cycle, so as the swing shrinks the model almost stops decaying —
  tune k to the first three crests and the model sits about 0.1 m above the
  measured fourth and fifth. The real water also carries small linear-in-u
  losses (boundary-layer viscosity; in the sim, the explicit viscosities),
  which do not fade with amplitude and take over below a metre of swing. The
  friction law is not one power for all amplitudes — u² owns the big swings.
- **k is not the penstock's friction.** Steady running draws the shaft down
  only about 0.1 m at about 1 m/s — a k of about 0.1, twenty times less than
  the surge measures. In steady running no water turns up the shaft; after the
  slam all of it does, through a tee that contracts to a third of the bore.
  k is that entry loss: a throttled surge tank by accident, which real ones
  are on purpose.
- **The tank did not abolish the water hammer.** Switch Gauges to the **h**
  channel and slam again: the roughly 3 s Joukowsky wave is still there,
  swinging about 6 m each way, because this tank's area is only 0.33 of the
  pipe's (a real one runs 10–50). Reading **d** filters it out — and it is why
  the model starts at the first crest, after the wave has taken its bite.

The full verification record is kept locally, out of version control, at
`exercises/UN-3-surge-tank/_archive/README-full.md`.
