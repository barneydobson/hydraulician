# HP-1 · Maximum power transmission

A hydro scheme feeds a 49 m penstock from a reservoir about 21 m above it and
throws the water out of a nozzle. A big nozzle passes lots of water slowly; a
small nozzle throws a fast, thin jet. Somewhere in between the jet carries the
most power — and the class finds where, one nozzle each.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HP-1**, or use the direct link
[`?ex=HP-1`](https://barneydobson.github.io/hydraulician/?ex=HP-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

The penstock loses head to friction as the square of the discharge, and what
is left arrives as jet velocity:

    h_f = k·q²        v = √(2g(H − h_f))   ⇒   h_f = H − v²/2g

so the jet's power per metre of width is

    P = ρ·g·q·(H − k·q²)  =  ½·ρ·q·v²

Set dP/dq = 0 and the maximum lands at **h_f = H/3**, *whatever* k is: at
peak power, one third of the head is burned in the pipe. That design rule is
what the class measures. Here the static head is **H = 21.35 m** (measured:
reservoir surface above the pipe axis).

## Your nozzle gap

**d** is the **last digit of your student number** — your lecturer will
explain the assignment in class. Look up **d mod 5**:

| d mod 5 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **gap (m)** | 0.42 | 0.70 | 0.84 | 0.97 | 1.10 |

Two digits share each gap. Paired submissions should agree to about ±5% — the
jet reading wobbles that much — not to the last decimal.

## What to do

1. **Open HP-1** (above). The rig loads drawn: a throttle plate at x = 8 m
   (that is the penstock's friction — leave it) and a **0.84 m** nozzle at
   x = 56.5 m.
2. **Resize the nozzle to your own gap.** Zoom in on it (wheel; `0` resets),
   erase the nozzle plate (`2` for Erase, press `]` four times for a wide
   brush, drag down it), then redraw it with Wall (`1`, hold Shift to snap
   vertical): one piece from the pipe floor y = 2.0 up to **y = 3.5 − gap/2**,
   one from **y = 3.5 + gap/2** up to the roof y = 5.0. Read x and y off the
   ruler at the view edges.
3. **Leave the green valve alone** (the bar at x = 55 m — it belongs to the
   water-hammer demos). If the pipe suddenly stops flowing you pressed `V`
   and slammed it: press `V` again.
4. **Wait for steady state.** Press `R` (reset water), then wait until
   **t ≥ 50 s** on the status clock — the card counts it down. Reading
   earlier gives a systematically wrong v.
5. **Measure q:** hover mid-pipe (x ≈ 30 m) and write down the `q` line of
   the hover box (m²/s).
6. **Measure v:** switch **Field → Speed**, zoom on the jet leaving the
   nozzle and hover in its brightest core (x ≈ 57 m). The first number of
   the `u, v` line is v. It wobbles a few percent: watch for ~10 s and write
   down the middle of the range.
7. **Submit** your three numbers: **gap (m), q (m²/s), v (m/s)**.
8. If you have time: compute h_f = H − v²/2g. How much of the 21.35 m did
   your penstock eat — and is your nozzle too big or too small?

*If the card says the rig pack is missing, draw both plates yourself, centred
on the pipe axis y = 3.5: the throttle at x = 8.0 m with a fixed 0.70 m gap
(pieces y 2.0–3.15 and 3.85–5.0), and your nozzle at x = 56.5 m as in step 2
(erase the scene's own plate there first).*

## For the instructor — pooling and interpreting

Collect one row per student (`student_id,digit,gap_m,q,v`), export the CSV
and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script computes h_f = H − v²/2g and P = ½ρqv² per point (H = 21.35 m),
fits h_f = k·q² through the origin, and plots P against q with the
frictionless ρgqH line running away above; the lower panel plots h_f/H
against q with the ⅓ line across it.

![pooled class plot](plots/pooled-demo.png)

On the board:

- Differentiate P = ρgq(H − kq²): the peak is at h_f = H/3 *whatever* k is —
  which is why a class that never chose k still lands on it.
- The pooled curve rises, peaks at the middle gap and falls; the two gaps
  straddling the peak read **h_f/H ≈ 0.32 and 0.37** against ⅓. Nobody
  optimised anything — the maximum belongs to the class, not to any student.
- The top is flat: P moves ~3% between those gaps while h_f/H moves 15%.
  Real penstocks are sized well left of the peak (h_f/H ≈ 0.1–0.15), because
  friction is paid for the plant's whole life. Ask who is nearest to a real
  design.
- Where did the head go? Switch Field → Pressure head: the drop is
  concentrated at the throttle plate at x = 8 m — the stand-in for 49 m of
  distributed pipe friction.

The full verification record — why the friction must be a drawn plate, the
measured five-gap ladder, settle-time evidence, safe bounds and
troubleshooting — is archived in the repository at
`exercises/HP-1-penstock-power/_archive/README-full.md`.
