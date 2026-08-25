# CS-1 · Setting the overflow: when does your chamber spill?

A combined sewer arrives from the left and drops into a chamber. At the base of
the chamber a small throttle passes flow **to treatment**; a metre above it a
weir crest spills **to the river**. In dry weather the throttle takes
everything and the chamber is a puddle. As the storm grows, the chamber has to
stand deeper and deeper to push flow through the throttle — the orifice law —
until the water reaches the crest and the overflow starts. Everyone cuts a
different throttle, ramps their own storm, and logs the discharge at which the
crest first spills. Pooled, that is the design chart that sets a CSO at
n × DWF.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **CS-1**, or use the direct link
[`?ex=CS-1`](https://barneydobson.github.io/hydraulician/?ex=CS-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

The throttle is an orifice, and the crest fixes the head over it — at the
moment of first spill every chamber in the room is standing at exactly the same
depth above its own throttle:

    q_spill = C_d · a · √(2gH)        H = 1.00 m,  √(2gH) = 4.43 m/s

with `a` the throttle gap. √(2gH) is therefore a constant and q_spill is
straight in `a`: double the throttle and you double the storm the works has to
take before the river gets anything.

Measured here: the chamber floor's top face sits at **y = 1.50 m** and the
crest at **y = 2.50 m**, so H is exactly **1.00 m** and the chamber gauge —
plotting depth, `d` — reads the head over the throttle directly. `d` past
1.00 m *is* spilling. Dry-weather flow is **1 × DWF = 0.070 m²/s**, which the
spout delivers at a velocity of 0.50 m/s.

## Your throttle

**d** is the **last digit of your student number** — your lecturer will explain
the assignment in class. Your throttle width is **r = d mod 4**, and it is set
by counting brush presses, never by aim: press `[` twenty times (the brush
stops at its minimum, so extra presses do nothing), then press `]` the number
of times your row gives.

| r = d mod 4 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **`]` presses** | 1 | 3 | 5 | 6 |
| **throttle gap** | 2 cells · 0.044 m | 4 cells · 0.087 m | 6 cells · 0.130 m | 8 cells · 0.174 m |

## What to do

1. Press `Z` once: it undoes the throttle the rig ships with (6 cells) and
   leaves the chamber floor whole again.
2. Cut your own — Erase (`2`), brush set by the presses in your row, then one
   short vertical stroke straight **down the x = 4 m grid line** through the
   floor slab. The stroke's width is the brush; the aim only decides where. Cut
   it yourself even if your row is the 6 cells that shipped.
3. Press `R` and let the chamber pre-charge at dry weather (**Spout velocity →**
   0.50 m/s) — 45 s on the clock. It should end as a puddle, everything running
   down the shaft to treatment: that is your check that the throttle is open.
4. Place a gauge — Gauge (`5`) — in the weir bay at **x ≈ 4.25 m,
   y ≈ 1.60 m**; its card plots depth, `d`.
5. Ramp **Spout velocity →** in 0.25 m/s steps held 10 s until the water
   reaches the crest, then drop back one step and creep up in 0.08 m/s steps
   held 20 s (the card's countdown times that hold). **First spill** is a
   continuous sheet over the crest for a full 10 s with `d` ≥ 1.02 m.
6. Hover the sewer at **x ≈ 2 m** (the readout's top row prints x, y) and read
   `q` as a typical value over several seconds, never off a slider. Submit
   **gap_cells** and **q_spill**.

**Also, with nothing to submit:** drop the storm back, right-drag dye into the
sewer and into the standing chamber water, then raise the storm past your spill
point. The first water over the crest is the dirty water the chamber was
holding — that is first flush, and it is why a CSO's first spill is its worst.

## For the instructor — pooling the class

Collect one row per student
(`student,digit,presses,gap_cells,gap_m,q_spill,source`), export the CSV and
run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script fits q = C_d·a·√(2gH) through the origin at H = 1.00 m, prints the
pooled C_d, its R² and each rung's own C_d, and plots q_spill against the gap
with a second axis reading the same points as multiples of DWF.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **Watch the treatment jet while the storm doubles.** It barely widens:
  q ∝ √h, so quadrupling the depth in the chamber only doubles what reaches
  treatment. The rest has to go somewhere, and the somewhere is a river.
- **Move the crest.** Draw the weir plate half a metre taller on one machine
  and re-run a rung: the whole line pivots as √H. That is the design knob a CSO
  engineer actually turns, and the chart cannot show it while H is held fixed.

The full verification record — why the inflow cannot be the reservoir, the
delivered brush ladder, the per-rung C_d, hold times, safe bounds and
troubleshooting — is kept locally, out of version control, at
`exercises/CS-1-cso-spill/_archive/README-full.md`.
