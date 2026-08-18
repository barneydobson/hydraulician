# DA-2 · Time scales as √λ

One open tank stands on the domain floor with an orifice cut through a thin
plate at its base. Each student gets it at **their own scale** λ — tank
width, fill head and orifice gap all shrunk together — fills it, releases the
orifice and times the fall between two marked, scale-appropriate levels.
Pooled on log-log axes, t against λ is a straight line of slope **½**: the
λ = ¼ tank drains in almost exactly half the time of the λ = 1 tank, not a
quarter and not the same — kinematic similarity measured with a stopwatch
rather than asserted from a slide.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **DA-2**, or use the direct link
[`?ex=DA-2`](https://barneydobson.github.io/hydraulician/?ex=DA-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A tank of plan area A draining through an orifice of area a takes

    t = 2A / (C_d · a · √(2g)) · (√h₁ − √h₂)

to fall from h₁ to h₂. Scale the model by λ: A and a shrink together and
cancel, and the √h that is left over carries the half —

    t(λ) = K · √λ / C_d(λ)

Time therefore scales as **√λ**, not as λ. If `C_d` were exactly constant
every rung would sit on a slope-½ line whatever that constant was; measuring
how nearly true that is, is the exercise.

The base tank is `h₀` = 2.0 m of fill head and 4.5 m wide, and the marked
window is `h_start` = 0.9 h₀λ down to `h_stop` = 0.3 h₀λ — mid-drain, clear
of the filling transient at the top and of the last few cells over the
orifice at the bottom. Both are **elevations above the domain floor**, which
is where the orifice sits, so they are heads over the orifice directly. The
gauge card prints them as **H**.

## Your scale

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. With `r = d mod 4`:

> **λ = 1 − 0.25·r**

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **λ** | 1 | ¾ | ½ | ¼ | 1 | ¾ | ½ | ¼ | 1 | ¾ |

The tank at your λ loads with your digit; these are the numbers you set and
read:

| λ | h_start (m) | h_stop (m) | tank gauge x (m) | apron gauge x (m) |
|---|---|---|---|---|
| 1 | 1.80 | 0.60 | 2.25 | 5.5 |
| ¾ | 1.35 | 0.45 | 1.69 | 4.4 |
| ½ | 0.90 | 0.30 | 1.13 | 3.3 |
| ¼ | 0.45 | 0.15 | 0.56 | 2.1 |

## What to do

1. Drop a Gauge (`5`) in the tank at your station, low down near the floor,
   and a second on the apron beyond the plate (y ≈ 0.02 m) — that one just
   confirms the apron is draining rather than ponding.
2. The tank loads **empty** with the valve shut: filling it is part of the
   experiment. Tick **Upstream reservoir** and set **Reservoir level** to
   your h_start.
3. When the tank gauge settles at your h_start, untick **Upstream reservoir**
   *and* set the **Left edge** back to **Wall**, then let it stand — about
   **5 s**; the card counts it down.
4. Press `V` to open the orifice and start on the status-bar clock `t` as the
   card passes your h_start; read the clock again as it reaches your h_stop.
5. Submit **λ** and **t_fall** — the difference between the two clock
   readings, in seconds.

## For the instructor — pooling the class

Collect one row per student (`student_id,digit,lambda,t_fall_s`), export the
CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script fits ln t against ln λ for the headline log-log panel and inverts
the falling-head formula on each row for the `C_d`-against-λ inset; the
shipped class gives slope 0.555 ± 0.009 with R² = 0.998.

![the pooled plot](plots/pooled-demo.png)

### Discussion points

- **Watch the rate fall while they wait.** The gauge trace flattens as the
  tank empties, because discharge follows √h and not h — the same √h that put
  the ½ into the time scale. It is also why the marked window stops at 0.3 h₀
  instead of running to empty.
- **The measured slope is 0.555, not 0.500, and that residual is the
  lesson.** `C_d` is not quite constant across the ladder — mean 0.603, ±3–4%
  scatter, no monotone trend — so a thin plate stays close to Froude-similar
  even at a one-cell gap. Now change the *grid* instead of the model: rebuild
  the λ = ¼ rung at High resolution with the gap held at one cell and `C_d`
  shifts +4.5% with nothing physical altered. That is DA-3's opening exhibit.

The full verification record — the exact-cell orifice ladder, why the plate
thickness does not scale, the apron-choke failure this rig is built around,
timings, safe bounds and troubleshooting — is kept locally, out of version control, at
`exercises/DA-2-time-scales/_archive/README-full.md`.
