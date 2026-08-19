# LL-2 · Find the throttle

Partner A draws a short obstruction somewhere inside a covered pipe —
invisible once you zoom back out to the whole box. Partner B never sees where
it went. B's only tool is four pressure gauges: walk them along the pipe, read
the piezometric head, and the fault announces itself as a kink in an otherwise
straight line. Locate it, size its loss coefficient from the kink, submit both
numbers. Every pair hides a different fault, so every pair's answer is
different — exactly how a utility finds a half-shut valve in a buried main.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **LL-2**, or use the direct link
[`?ex=LL-2`](https://barneydobson.github.io/hydraulician/?ex=LL-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A local loss is a step in the hydraulic grade line on top of the steady
friction fall:

    h_L = k_L·V²/2g

so a kink is only a kink *relative to* the clean-pipe rate, and that rate has
to be subtracted before k_L means anything. Every pair runs the same head —
the reservoir is set at **3.90 m** for everyone — and at that head the clean
pipe drops about **0.050 m per metre** of bore, so over the final 0.6 m
bracket either side of the fault:

    background ≈ 0.050 × 0.6 = 0.030 m
    ΔH_excess  = ΔH − 0.030
    k_L        = ΔH_excess / (V²/2g)        g = 9.81

The readout's **V** is already the bore mean, and the correction is 10–30% of
the raw reading — skipping it is not an option.

## Your fault

There is no digit on this one. The personalised parameter is **partner A's own
hidden stroke**, and it is unique to each pair:

- **Severity — 2 or 3 of the bore's 18 cells** (11–17%): a vertical stroke
  from the pipe invert (y ≈ 2.00 m) up to a top *you* choose between
  **y = 2.04 and 2.07 m**. One cell is undetectable; four de-pressurises the
  pipe downstream.
- **Position — any x from 4.6 to 7.0 m.** Nearer the mouth the entry length
  contaminates the reading; nearer the outlet the tailwater does.

Write your own (x, height) down privately — you need it for the reveal.

## What to do

1. **Partner A, screen turned away:** Wall (`1`), brush narrowed to about one
   cell (press `[` two or three times), **shift** held — one short *vertical*
   stroke from the invert up to your chosen height, at your chosen x. Press
   `0` to zoom back out before B looks.
2. Press `R` and let it reach steady state — about **20 s**; the card counts
   it down.
3. **Partner B, round 1 (coarse):** four gauges — Gauge (`5`) — at
   **x = 3.80, 5.20, 6.60, 8.00**, every one at **y = 2.35 m** (near the
   soffit, always, no exceptions). Read the centred heads after 20 s: a clean
   1.40 m gap drops ≈ 0.07 m, so the gap that drops far more brackets your
   fault. A fifth click bumps the oldest gauge off — that is how you walk them.
4. **Rounds 2 and 3:** re-place the four across the winning gap only, evenly
   spaced, and read again after 20 s; then place them symmetrically about your
   best estimate at **−1.0, −0.3, +0.3, +1.0 m** and read once more. The
   −0.3/+0.3 pair is your answer pair.
5. Take **ΔH** from that pair, hover well clear of the fault for **V**, do the
   arithmetic above, and submit your **x_found** (the midpoint of your final
   bracket) and your **k_L**.

## For the instructor — pooling the class

Collect one row per pair (`pair, x_found_m, kL_found`), then after the reveal
— each pair discloses what they actually drew — append `x_true_m` and
`blockage_frac` (cells blocked / 18, i.e. 0.111 or 0.167), export the CSV and
run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run pairs
```

The script prints the locate-error summary and draws two panels — k_L against
blockage fraction, with a sharp-orifice curve alongside for shape only, and a
histogram of locate errors against the ±0.3 m target band. Only two blockage
fractions exist at this resolution, so treat the fitted exponent as
illustrative rather than a measured power law.

![pooled class plot](plots/pooled-demo.png)

### Discussion points

- **A pressure gauge is a metal detector.** Nobody looked at the pipe to find
  the fault. Do it live: at the `0`-reset zoom the plate is a couple of pixels
  and gives nothing away; zoom in on the located station and there it is. The
  HGL kink was the only evidence there was, exactly as for a buried main.
- **The correction is not optional.** Ask what k_L would have been if nobody
  subtracted the background share: for the smaller (2-cell) faults it is a
  25–30% error, bigger than the pair-to-pair spread in k_L itself.

The full verification record — how the 2–3 cell severity band and the
4.6–7.0 m x-band were measured, why the background slope cannot be taken from
the pipe next to the fault, why every gauge sits at y = 2.35 m, the blind
six-pair location trial and its accuracy, safe bounds and troubleshooting —
is kept locally, out of version control, at
`exercises/LL-2-find-throttle/_archive/README-full.md`.
