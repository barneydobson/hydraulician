# UN-3 · Surge tank: is the damping u²?

A standpipe is teed into the penstock just upstream of the valve. Slam the
valve and the pipe's momentum has nowhere to go but up the shaft: a **mass
oscillation** with a period of about ten seconds, decaying over a couple of
minutes. Read five crest heights off one gauge trace. How they decay says
which friction law the water is obeying, and that is the whole demo.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UN-3**, or use the direct link
[`?ex=UN-3`](https://barneydobson.github.io/hydraulician/?ex=UN-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Rigid column in the penstock, free surface in the shaft, friction ∝ u². z is
the shaft level below the reservoir, so this is the equation lectures write as
u²–y:

    (l/g)·du/dt = z − k·u|u|          dz/dt = −(A/A_s)·u

Write it for the successive crest heights c₁, c₂, c₃ … above the resting
level and one consequence falls out that you can check on a calculator:

| friction law | signature in the crests |
|---|---|
| ∝ u² (the lectures' k u²) | **1/c₁, 1/c₂, 1/c₃ … are equally spaced** |
| ∝ u (viscous) | **c₂/c₁, c₃/c₂ … are equal** |

Nothing else survives the algebra — not the penstock length, not the bore,
not the shaft width, not v₀. Two friction laws, five numbers, one trace.

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
4. Press `V` to slam the valve. Let it swing five times, then pause (**space**).
5. Read the five crest heights above h₀ as **c₁ … c₅** — about 2.5, 1.7, 1.2,
   1.0 and 0.8 m. Work out c₂/c₁, c₃/c₂ … and 1/c₁, 1/c₂ … Which one is
   constant? Submit the five crests.

Expect the ratios to climb from about 0.66 to about 0.83 — so the damping is
not ∝ u — while the gaps in 1/c stay near 0.2 all the way down.

## For the instructor — pooling the class

Collect one row per student (`student_id,digit,level_m,c1_m,c2_m,c3_m,c4_m,c5_m`),
export the CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The left panel plots 1/c against crest number, the right log c: the first is
straight and the second bends. On the shipped dry-run class every one of the
ten digits gives R² = 0.993–0.999 for 1/c against 0.964–0.986 for log c, so
no student gets the wrong verdict.

### Discussion points

- **What the friction actually is.** Steady running loses only about 0.1 m of
  head, so the k you would infer from h₀ is far too small to explain this
  decay. In steady running no water flows up the shaft; after the slam all of
  it does, through a tee that contracts to a third of the bore. The damping is
  that entry loss, not penstock friction — a throttled surge tank by accident.
- **The tank did not abolish the water hammer.** Switch Gauges to the **h**
  channel and slam again: the roughly 3 s Joukowsky wave is still there,
  swinging about 6 m each way, because this tank's area is only 0.33 of the
  pipe's (a real one runs 10–50). Reading **d** instead is what filters it out.
  It also costs you the first crest — c₁ comes in low, which is why the
  straight line is fitted through all five and not anchored on c₁.

The full verification record is kept locally, out of version control, at
`exercises/UN-3-surge-tank/_archive/README-full.md`.
