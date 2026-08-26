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

You do not have to solve that to test it. Follow the energy round one cycle,
writing c for the crest height above the resting level.

At a crest the water is momentarily still, so the surge holds all its energy
as height — it has lifted a column of area A_s through c/2:

    E ∝ c²

Friction spends that store at a rate (head loss) × (discharge) = k·u²·A·u, and
over one cycle both the speed of the water and the distance it travels scale
with c. So a cycle costs

    ΔE ∝ c³

Differentiating E ∝ c² gives ΔE ∝ c·Δc. Put the two together, c·Δc ∝ c³:

    Δc ∝ c²

**That is the result.** The height lost per cycle grows as the *square* of the
height, so a big surge is punished hard and a small one is barely touched —
which is why the tail of the trace lingers rather than dying away evenly.
Divide by c² and that becomes a constant step:

    Δ(1/c) = Δc / c² = constant

So 1/c₁, 1/c₂, 1/c₃ … climb by the same amount every cycle. Plot them against
crest number and k·u² friction is a **straight line**.

The reciprocal is worth recognising on sight: it is the coordinate that
straightens any quadratic drag — a coasting cyclist, a spun-down flywheel —
because "loss ∝ the square of what is left" is the same statement each time.
A friction ∝ u would take a fixed *fraction* per cycle instead, and want log c.

### The slope is Y

The shape is only half of it. Solving the ODE — the result quoted in lectures —
gives

    u² = C·e^(z/Y) + (1/k)(z + Y),        Y = l·A / (2g·k·A_s)

Put u = 0 at each end of a swing and C drops out, leaving the two heights
related in units of Y and nothing else; chain the upswing to the downswing
(friction reverses, so Y changes sign with it) and the crest-to-crest step is

    Δ(1/c) = 4 / (3Y)          so      Y = 4 / (3 × slope)

The straight line therefore *measures* the constant in that solution. The 4/3
is the gentle-surge limit, but it is worth 1% out to c₁ = 0.8·Y and this rig
runs at c₁ ≈ 0.4·Y, so take it as exact. Expect **Y ≈ 6 m**.

None of this asks you for the penstock length, the bore, the shaft width or
v₀. Five numbers off one trace measure Y, and Y carries all four.

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
   1.0 and 0.8 m. Work out 1/c for each, check the steps between them are
   equal, and take your **Y = 4 / (3 × step)**. Submit the five crests.

Expect steps of about 0.2 m⁻¹, the same all the way down, and Y ≈ 6 m.

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

Worth pointing out when the lines go up: they are close to **parallel** —
slopes 0.20 to 0.24 m⁻¹, so Y = 5.6 to 6.8 m across the whole ladder. The
digit sets how big a surge you start with; Y belongs to the rig, and the class
has just measured the same constant ten independent ways. What little trend
there is runs the other way from the guess — a higher reservoir stands a
longer column of water in the shaft, and that extra inertia slows the decay
per cycle slightly.

The follow-up, if you want one: Y = lA/(2gkA_s) inverts to k, and k is the
number the design example in lectures needs. It comes out several times larger
than the h₀ drawdown implies — see the first discussion point.

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
