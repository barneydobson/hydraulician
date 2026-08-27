# UN-3 · Surge tank: is the damping u²?

A standpipe is teed into the penstock just upstream of the valve. Slam the
valve and the pipe's momentum has nowhere to go but up the shaft: a **mass
oscillation** with a period of about ten seconds, decaying over a couple of
minutes. Read five crest heights off one gauge trace. How they decay says
which friction law the water is obeying, and how fast says what the friction
coefficient is. That is the whole demo.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UN-3**, or use the direct link
[`?ex=UN-3`](https://barneydobson.github.io/hydraulician/?ex=UN-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Rigid column in the penstock, free surface in the shaft, friction ∝ u². z is
the shaft level below the reservoir, so this is the u²–y equation from
lectures, and the solution lectures quote for it:

    (l/g)·du/dt = z − k·u|u|          dz/dt = −(A/A_s)·u

    u² = C·e^(z/Y) + (1/k)(z + Y),        Y = l·A / (2g·k·A_s)

Put u = 0 at each end of a swing and C drops out, leaving the two ends related
in units of Y alone. Chain the upswing to the downswing — friction reverses, so
Y changes sign with it — and the successive crest heights c₁, c₂, c₃ … above
the resting level come out obeying

    Δ(1/c) = 4 / (3Y)

So **1/c climbs in equal steps**, a straight line against crest number, and
**the slope is Y**: Y = 4 / (3 × step). The 4/3 is the gentle-surge limit,
worth 1% out to c₁ = 0.8·Y; this rig runs at c₁ ≈ 0.4·Y.

The constant step is quadratic drag showing its hand — the height lost per
cycle goes as c², so a big surge is punished hard and a small one barely
touched, which is why the tail of the trace lingers rather than dying away
evenly. A friction ∝ u would take a fixed *fraction* each cycle instead, and
want log c.

Y bundles four things. Three you can measure off the screen, so invert it for
the fourth:

    k = L·(A/A_s) / (2g·Y)

A is the pipe bore and A_s the shaft width; **L = 65 m** is the length of the
column actually moving — the 47 m penstock plus the shaft's own water, which
has to be pushed up and down too. **k is a property of the rig, not of your
digit**, so everyone in the room should land on the same number.

## Your reservoir level

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Your reservoir level is **10.0 + 0.4·d**
metres, set on the **Reservoir level** slider. Nothing is drawn.

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **level (m)** | 10.0 | 10.4 | 10.8 | 11.2 | 11.6 | 12.0 | 12.4 | 12.8 | 13.2 | 13.6 |

## What to do

1. Set **Reservoir level** to your own value, then press `R`.
2. Let it reach steady state — about **100 s**; the card counts it down. The
   tank has to drain from its 25 m fill and the shaft has to fill. It is not
   settled at 60 s.
3. Place a Gauge (`5`) inside the shaft, a metre or so above the pipe. Note the
   steady value of its **d** trace as **h₀**.
4. Press `V` to slam the valve. Let it swing five times, then pause (**space**)
   and read the five crest heights **above h₀** as **c₁ … c₅** — about 2.5,
   1.7, 1.2, 1.0 and 0.8 m.
5. Into the sheet go your reservoir level, **h₀** and the five crests. It works
   out 1/c, the mean step, **Y = 4/(3 × step)** and **k = L(A/A_s)/(2gY)**.
   Submit **k**.

Expect steps of about 0.2 m⁻¹, the same all the way down, Y ≈ 6 m and
**k ≈ 1.6 s²/m** — and your neighbour, on a different reservoir level, should
get the same k.

Heights above h₀ is the whole of it: the gauge's **d** trace is a depth, not
an elevation, but every c is a *difference* of two readings on that trace, so
the datum cancels and you never need it.

## For the instructor — pooling the class

Collect one row per student (`student_id,digit,level_m,c1_m,c2_m,c3_m,c4_m,c5_m`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

One line per student, 1/c against crest number. On the shipped dry-run class
every one of the ten digits comes out straight to R² = 0.993–0.999, so no
student gets the wrong verdict.

Worth pointing out when the lines go up: they are close to **parallel**, and
that is the result. Slopes run 0.20 to 0.24 m⁻¹, so Y = 5.6 to 6.8 m and
**k = 1.5 to 1.8 s²/m, mean 1.6**, across a reservoir ladder spanning 3.6 m.
The digit sets how big a surge you start with; k belongs to the rig, and the
class has just measured it ten independent ways.

### Discussion points

- **k is not the penstock's friction.** Steady running draws the shaft down
  only about 0.1 m below the reservoir, which at v₀ ≈ 1 m/s is a k of about
  **0.13** — a twelfth of the 1.6 the surge just measured. In steady running no
  water flows up the shaft; after the slam all of it does, through a tee that
  contracts to a third of the bore. What k measures is that entry loss, and
  this is a throttled surge tank by accident. Real ones are throttled on
  purpose, for exactly the effect the class has just plotted.
- **The tank did not abolish the water hammer.** Switch Gauges to the **h**
  channel and slam again: the roughly 3 s Joukowsky wave is still there,
  swinging about 6 m each way, because this tank's area is only 0.33 of the
  pipe's (a real one runs 10–50). Reading **d** instead is what filters it out.
  It also costs you the first crest — c₁ comes in low, which is why the
  straight line is fitted through all five and not anchored on c₁.

The full verification record is kept locally, out of version control, at
`exercises/UN-3-surge-tank/_archive/README-full.md`.
