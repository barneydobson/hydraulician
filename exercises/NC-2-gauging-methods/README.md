# NC-2 · Gauging a vertical: the 0.6-depth and two-point methods

## Lecturer notes

A quick in-class exercise, 15–20 minutes, on current-meter gauging. A
velocity-area gauging measures the mean velocity V on each vertical of a
section from one or two point velocities, never the whole profile. Field
practice takes one point at 0.6 d below the surface on a vertical shallower
than 0.75 m, and two, at 0.2 d and 0.8 d, on a deeper one. Here each student
does what a hydrographer does at one vertical, twice — once with the reach
running shallower than 0.75 m and once deeper — reading all three points both
times, and judges both rules against the rake's full depth-integral, which a
field gauging never has.

Students choose their own station and submit **x, d, u₀.₂, u₀.₆, u₀.₈ and V**
for each run; the class pools them into one plot of each rule's error against
the station's distance from the inlet, and every student's points laid on the
log law the rules are built on.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **NC-2**, or use the direct link
[`?ex=NC-2`](https://barneydobson.github.io/hydraulician/?ex=NC-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
It runs on the `gauging` scene; the card sets everything up.

## The reach

The `gauging` scene is a 36 m × 1.5 m slice of a straight channel, per metre
width: a flat drawn bed at z = 0.20 m with gravity tilted to a slope of
1 in 400 (the bed does not staircase), C_f = 0.25. A reservoir feeds the left
edge and the bed ends in a free overfall at x = 35 m. The only knob is
Controls → **Reservoir level**: the scene works out the discharge that level
drives down this reach and sets the inflow to it, so a student never sees q.
The overfall is the downstream control, so the reach is a gentle M2
drawdown — the depth falls by a quarter to a third between the inlet and the
lip —
rather than a uniform flow held by a tailwater.

| Reservoir level (m) | q (m²/s) | d, x = 6 → 30 m | V (m/s) | d_c (m) |
|---|---:|---|---|---:|
| 0.68 — shallow run | 0.44 | 0.43 → 0.38 | 1.02 → 1.15 | 0.27 |
| 1.33 — deep run | 1.81 | 0.98 → 0.81 | 1.85 → 2.24 | 0.69 |

Pressing R after changing the level refills the reach near its new steady
state and restarts the clock; the card's settle then runs again, and the
reach is ready in about **40 s**. Cells are Δx = 23.8 mm at Medium: 16–18
across the shallow depth, 34–41 across the deep one. The depth reads in steps
of a cell along the reach (0.429, 0.405, 0.381 m …): a steady sloping surface
sits in one-cell terraces.

## The station

There is no student-number rule: each student picks their own station, so the
class covers the reach between them. The card asks only for a station clear
of the inlet and the lip; it does not say where the profile is developed,
because finding that out is the exercise. What a station does to the answer
is in the measured table below. In short:

- **x < 4 m** is in the inlet's entry flow: on the deep run the one-point rule
  reads 13–17% high there.
- **x > 32 m** is the drawdown to the lip: the deep run is only 0.69 m deep at
  34 m, shallower than the 0.75 m handover.
- Between them, the one-point rule's error on the deep run falls steadily with
  distance from the inlet, from +10% at 6 m to +2% at 28–30 m, while the
  two-point rule stays between +0.7% and +2.6%. A class spread along the reach shows
  both rules side by side, and why they differ.

## What the students do

1. Set the reservoir level to 0.68 m and press **R**. Choose a station x.
2. Hover at x and read **d** and **η** off the box. Place three Gauges (`5`)
   at x, at z = η − 0.2 d, η − 0.6 d and η − 0.8 d (the box's x, z row shows
   the cursor's height), and a Rake (`6`) at the same x. The gauges are
   already set to Speed.
3. Press **A** for Average and wait until the legend's T passes 15 s. Read
   u₀.₂, u₀.₆ and u₀.₈ off the gauge cards and **V** off the rake's chip.
   One-point V₁ = u₀.₆; two-point V₂ = ½(u₀.₂ + u₀.₈); each rule's error is
   100·(V_rule/V − 1) %.
4. Set the level to 1.33 m and press **R**. After the settle, read d and η
   again at the same x, clear the gauges (click each with the Gauge tool),
   place three at the new depths, and repeat.
5. Submit x, d, u₀.₂, u₀.₆, u₀.₈ and V for both runs, and say where the rake
   puts the fastest water on each.

## Why the rules work

The turbulent log law, with z − z_b the height above the bed, is

    u = (u*/κ) ln((z − z_b)/z₀),       κ = 0.41

and its depth average is V = (u*/κ)[ln(d/z₀) − 1]. The two are equal where
ln((z − z_b)/d) = −1, at d/e = 0.37 d above the bed — 0.63 d below the
surface: the **0.6-depth rule**. The **two-point** pair sits 0.8 d and 0.2 d
above the bed, and since √(0.2 × 0.8) = 0.4 its mean is exactly the velocity
0.4 d above the bed: on a pure log law the two rules are one rule, and both
read high by the same amount,

    u₀.₆ − V = ½(u₀.₂ + u₀.₈) − V = (u*/κ)(1 + ln 0.4) = 0.084 u*/κ ≈ 0.20 u*

which is 1.5–2.5% of V on this reach. What separates them in a river is
everything a log law leaves out — a profile still recovering from a bend, a
pier or a weir upstream, the wake of the outer flow, a velocity dip below the
surface, weed, wind, an uneven bed — and there the two-point mean, which
brackets the outer flow, is the more robust. The 0.75 m handover itself is
about the meter: on a shallower vertical 0.2 d is too close to the surface
and 0.8 d too close to the bed for a propeller to read dependably, so one
point is taken instead of two.

## Measured answers

Average mode, a 16 s window after the 40 s settle, Medium, read the way the
card says: the gauges in the cells at the three heights, V off the rake.
Errors in per cent of V:

| x (m) | shallow d (m) | one-point | two-point | deep d (m) | one-point | two-point | deep surface / max, over V |
|---:|---:|---:|---:|---:|---:|---:|---|
| 2 | 0.453 | +10.3 | −1.2 | 1.025 | +17.2 | +2.8 | 0.62 / 1.17 |
| 6 | 0.429 | +4.5 | +1.6 | 0.978 | +10.5 | +2.1 | 0.93 / 1.15 |
| 10 | 0.429 | +2.3 | +1.3 | 0.977 | +7.6 | +2.6 | 0.97 / 1.15 |
| 14 | 0.429 | +1.7 | +1.3 | 0.930 | +5.2 | +1.5 | 1.08 / 1.16 |
| 18 | 0.405 | −0.3 | +1.9 | 0.930 | +3.7 | +1.9 | 1.12 / 1.18 |
| 22 | 0.405 | −0.9 | +1.9 | 0.872 | +3.0 | +2.4 | 1.16 / 1.18 |
| 26 | 0.381 | +2.5 | +3.0 | 0.863 | +3.0 | +2.2 | 1.21, at the surface |
| 30 | 0.381 | +1.2 | +2.5 | 0.810 | +2.3 | +1.3 | 1.23, at the surface |
| 34 | 0.334 | +0.8 | +0.2 | 0.686 | +3.6 | +1.7 | 1.17, at the surface |

The full table, every 2 m, is what `rig.js` prints.

**What separates the rules here is the profile, not the 0.75 m line.** Just
inside the inflow face the reservoir's entry forms a small roller, and it
leaves a slow layer on the surface that the flow carries downstream while the
mixing works it out. On the deep run, from x = 2 m to about 22 m, the fastest
water is below the surface (the last column) and the profile is blunter than
a log law. The point 0.6 d down sits in the fast core and reads high, while
the slow water at the top and the bottom pulls V down. The two-point pair
takes one point from each half, their errors largely cancel, and it stays at
+1.5 to +2.8%. The one-point rule comes within about a per cent of the
two-point one after some 25 depths on both runs: 10 m on the shallow run,
22–24 m on the deep one. Beyond that, both rules on both runs land within
−1% to +3.5%, around the log law's prediction, and the one-point rule is as
good as the two-point one. At any station a student chooses, the deep run is
about half as many depths from the inlet as the shallow run, which is why the
class sees the one-point rule fail on the deep run and not on the shallow
one.

Present it as **a profile still recovering from a disturbance upstream**, not
as how a deep river looks. The roller is partly the solver's own: it comes
from the reservoir inlet at Medium, and it is an open problem in the
engineering notes ("Open: a deep, fast inlet still sheds a slow surface layer
at Medium"). The lesson it makes is the field one: where the fastest water
is not at the surface, do not trust one point.

**The gauge's size.** A gauge reads the whole cell it sits in, up to half a
cell (12 mm) from the height asked for. At 0.6 d on the shallow run, 0.16 m
above the bed, where u changes quickly with height, that is worth up to 1.5%
of V (the gauge and exact columns of `rig.js` differ by 1.4% there). It is
why the shallow run's one-point error wanders from −1.1% to +2.5%
between stations where the profile hardly changes. It is the app's version of
a meter too big for its vertical, and the reason the field rule drops the
two-point method on shallow verticals.

**Live against Average.** The shallow run is nearly steady: at most stations
a single live read differs from the window's by 0.2% or less. On the deep run the
roller's wake makes it ±0.2–0.9%, as large as the difference being measured
at the far stations. That is one reason Average is on the card; the other is
that a current meter's count IS a time mean.

**V to two decimals.** The rake's chip prints V to 0.01 m/s, worth ±0.5% of
V on the shallow run and ±0.25% on the deep one. That is small next to the
deep run's one-point errors but comparable to the developed reach's 2%, so
expect the shallow class to scatter by a percent or so around +1–2%.

## Pooling the class

Collect one row per student per run,
`student_id,run,x_m,d_m,u02,u06,u08,V` (`run` = `shallow` or `deep`; extra
columns ignored), export the CSV and run:

```bash
python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class
```

The left panel plots each rule's error against the station's distance from
the inlet in depths, x/d, both runs together, beside the log law's
prediction; the right lays every student's three points on the log law as u/V
against height above the bed. The dry-run class is thirteen students at
x = 6, 8, … 30 m, each at the same station on both runs. Each row holds the
measured readings at that station, rounded the way the app prints them:
three decimals on the gauges and the box, two on the chip. It pools to the
table below; the log law's prediction takes u* = √(g S₀ d), the uniform-flow
value, which slightly underestimates it on a drawdown, where the friction
slope is steeper than S₀.

| run | one-point | two-point | pure log law |
|---|---:|---:|---:|
| shallow (d = 0.38–0.43 m) | +1.1 ± 1.7% | +1.7 ± 0.6% | +1.9% |
| deep (d = 0.81–0.98 m) | +4.7 ± 2.7% | +1.8 ± 0.5% | +1.5% |

![pooled class plot](plots/pooled-demo.png)

## Discussion points

- **Why 0.6 d?** The log law crosses its own mean at d/e above the bed. Ask
  the class to find it on their profile before telling them.
- **Two points, one answer.** √(0.2 × 0.8) = 0.4, so on a log law the
  two-point mean IS the 0.6-depth reading. Where the two disagree, the
  profile is not a log law.
- **Where is the fastest water?** The rake's chip prints u_max and the ratio
  u_max/V. Wherever the fastest water is below the surface, the one-point
  rule is off and the two-point rule is not. A hydrographer cannot see the
  profile, so the two-point rule is the insurance.
- **How far downstream is "developed"?** The class's own plot answers it:
  about 25 depths from the inlet here. Ask why a deep river needs more metres
  than a shallow one to recover from the same disturbance.
- **The meter's size.** At 0.8 d on the shallow run the gauge's cell is more
  than a quarter of the height above the bed — where the field rule says not to put
  a second meter.

## Console spot-check

Paste [rig.js](rig.js) into the console and run `await NC2.run(0.68, 16)` for
the shallow run at x = 16 m (`1.33` for the deep one). It sets the level,
presses R, settles, reads live and over a 20 s window, and returns d, η,
u₀.₂, u₀.₆, u₀.₈, V and both errors, as the gauge reads them and at the exact
heights. `await NC2.sweep()` runs both levels at every station from 6 m to
32 m.
