# FB-2 · Critical depth three ways

One rig, three readings, no scene change and no tailwater: `y_c` from the
formula the q slider prints, the depth riding a broad crest, and the depth at
the very last wet column before the water plunges off the end. A reservoir
feeds a flat approach bed, the bed steps up onto a short flat-topped crest,
and the crest ends at a free overfall. Critical depth stops being something you
plug `q` into and becomes three numbers a laptop measured, all traceable to the
same discharge — and the three do not agree, which is the lesson.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FB-2**, or use the direct link
[`?ex=FB-2`](https://barneydobson.github.io/hydraulician/?ex=FB-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Critical depth is where the specific energy of a given discharge is least, and
where the Froude number passes through one:

    y_c = (q²/g)^⅓        E_c = 1.5·y_c        Fr = V/√(g y) = 1  at  y = y_c

A broad-crested weir is built to make that happen on purpose: the crest is a
control, so it should ride `y_c` — that is the assumption behind
`Q = 1.705·C_d·b·h^(3/2)`. A free overfall makes it happen too, but the
streamlines curve sharply downward at the lip, the pressure there is not
hydrostatic, and `y_c = (q²/g)^⅓` — which assumes it is — stops applying. The
classical figure for the brink depth is 0.715·y_c.

The rig is fixed: bed top face at **y = 0.50 m**, crest top at **y = 0.935 m**
and **1.1 m** long, ending exactly at the brink at **x = 7.40 m**, with the
gauge already sitting mid-crest at **x = 6.85 m**. The display comes up on
**Froude number**, so the critical transition is visible as a pale/white break
on the crest.

## Your discharge and reservoir level

**d** is the **last digit of your student number** — your lecturer will explain
the assignment in class. The level is paired to your `q`
(`level = 0.935 + 1.65·y_c + 0.03`); set both.

> **q = 0.15 + 0.05 · d**   (m²/s per m width, d = 0…8; if your last digit is
> 9, use d = 8)

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **q (m²/s)** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 | 0.40 | 0.45 | 0.50 | 0.55 | 0.55 |
| **level (m)** | 1.182 | 1.228 | 1.271 | 1.310 | 1.348 | 1.383 | 1.417 | 1.450 | 1.482 | 1.482 |

## What to do

1. Set **Inflow q** and **Reservoir level** to your row — they are paired, not
   independent. Write down the `y_c` the q slider prints: that is reading
   **(1)**.
2. Press `R` and let it reach steady state — about **55 s**; the card counts
   it down. The pool upstream of the crest should look flat and calm, with a
   clear pale band on the crest and orange just before its downstream end.
3. Reading **(2)**, on the crest: the gauge card at x = 6.85 m prints
   `1  h 0.xxx m`. Take a typical value over a few seconds.
4. Reading **(3)**, at the lip: zoom in (wheel) on the right-hand end of the
   crest and hover the **last wet column that still has solid crest under
   it** — not the falling sheet beyond — and read `depth h` from the hover
   box. Submit **q, y_c, y_crest, y_brink**.

## For the instructor — pooling the class

Collect one row per student (`student,digit,q,y_c,y_crest,y_brink`), export the
CSV and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script derives `y_c` from `q` where a student's slider arithmetic slipped,
then plots each student's `y_crest/y_c` and `y_brink/y_c` against their own `q`
with reference lines at 1.0 and 0.715, and the measured distance from the
Fr = 1 crossing back to the lip in `y_c` units against the textbook 3–4 `y_c`.

![pooled class plot: three bands (y_c/y_c, y_crest/y_c, y_brink/y_c) vs q, plus the critical-position panel](plots/pooled-demo.png)

### Discussion points

- **Find critical, live.** On the Froude view, zoom the crest and look for the
  pale break: it sits under one `y_c` back from the lip, not the 3–4 `y_c` the
  textbook quotes. That figure is derived for a channel arriving at normal
  depth on a real slope; a flat crest has no uniform-flow reach for a drawdown
  curve to depart from, so the whole crest *is* the drawdown curve.
- Hover across the last three or four columns on the lip — the depth falls
  away. That is curvature defeating the hydrostatic pressure assumption
  `y_c` is built on — visible, repeatable, and the reason `y_brink < y_c` is
  a result rather than solver noise.

The full verification record — the crest-length iteration, the level-margin
and no-tailwater checks, the measured per-digit table, safe bounds and
troubleshooting — is kept locally, out of version control, at
`exercises/FB-2-yc-three-ways/_archive/README-full.md`.
