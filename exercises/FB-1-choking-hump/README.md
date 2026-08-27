# FB-1 · The hump that chokes

Everyone runs the same flat-bed channel, held comfortably subcritical at both
ends, at their own discharge — and draws a bed hump at mid-reach. Each student
commits a **prediction** for the height that will choke it, computed from a
depth and a discharge they measured themselves, *before* touching the hump.
Then they raise it in steps: the dip over the crest deepens, the
Froude view's white break creeps toward the hump, and at some height the whole
upstream pool steps up while the crest snaps supercritical. Raising a physical
sill in 22 mm steps and re-settling a flume after each one is an afternoon, not
a slot.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FB-1**, or use the direct link
[`?ex=FB-1`](https://barneydobson.github.io/hydraulician/?ex=FB-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A bed rise spends **specific** energy, not total energy. Across the hump

    E₁ = E₂ + Δz        E = y + q²/(2g y²)

and the least a section can carry `q` on is the critical energy

    E_c = 1.5·d_c        d_c = (q²/g)^⅓

so the crest can pay for the rise until `Δz` exceeds what `E₁` has to spare:

    Δz_pred = E₁ − 1.5·d_c

Past that, the only thing left that can rise is the *upstream* depth — the
crest, not the reservoir, is now in charge of the depth everywhere behind it.
That is choking, and the height at which it starts is what the class measures.

The rig is fixed and the same for everyone: bed top face at **z = 0.50 m**,
reservoir **and** tailwater both held at **1.00 m** (the reach has nothing to
choke against unless both ends are held), gauge at **x = 2.5 m**, and the hump
1 m long centred on **x = 4.5 m**.

## Your discharge

**d** is the **last digit of your student number** — your lecturer will explain
the assignment in class.

> **q = 0.15 + 0.05 · d**   (m²/s per m width, d = 0…8; if your last digit is
> 9, use d = 8)

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **q (m²/s)** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 | 0.40 | 0.45 | 0.50 | 0.55 | 0.55 |

## What to do

1. Set **Inflow q** to your value — the reservoir and tailwater are already
   held at 1.00 m and stay there.
2. Press `R` and let it reach steady state — about **60 s**; the card counts
   it down.
3. Read `d₁` on the gauge card at x = 2.5 m and commit your prediction:
   `E₁ = d₁ + (q/d₁)²/2g`, `d_c` off the q slider,
   **`Δz_pred = E₁ − 1.5·d_c`**. Write it down *before* you touch the hump.
4. Draw the hump — Wall (`1`), brush shrunk with `[` to about 0.04 m, one
   shift-held horizontal stroke ~1 m long centred on **x = 4.5 m**, started
   inside the bed slab (z ≈ 0.45) and dragged up to a first height of ~0.05 m.
5. Raise it in about seven steps toward `2·Δz_pred` — `Z` to undo, redraw
   taller, re-settle 15–30 s each time (the fine steps near the top need the
   longer wait), and **jot `d₁` at every step**.
6. It has choked when the gauge climbs step after step *and* **Field → Froude
   number** goes pale, then orange, on the crest: that height is `Δz_c`. From
   the `d₁` you jotted at the LAST step before it choked, recompute the
   prediction the same way to get `Δz_pred*`, and submit **q, d₁, E₁, d_c,
   Δz_pred, Δz_c** together with the re-timed pair `d₁*` and `Δz_pred*`.

## For the instructor — pooling the class

Collect one row per student
(`student,digit,q,d1,E1,dc,dzpred,dzc,d1_prechoke,dzpred_star`), export the CSV
and run:

```bash
python3 collect_plot.py class.csv                # -> plots/pooled-demo.png
python3 collect_plot.py data/simulated-class.csv # the shipped dry-run class
```

The script derives `E₁`, `d_c` and both predictions wherever a student left
them out, then plots `Δz_c` against `Δz_pred` with the 1:1 line and
cell-quantisation error bars — and the same `Δz_c` against the re-timed
`Δz_pred*` beside it; the right panel is both ratios against `q`.

![pooled class plot: Δz_c vs Δz_pred, 1:1 line, and the ratio vs q](plots/pooled-demo.png)

### Discussion points

- With Field → Froude number, take one more step past `Δz_c`: the crest stays
  pale/orange however much taller the hump goes, while the upstream pool
  keeps climbing. That is the crest taking charge of the depth everywhere
  upstream of it.
- **Why is everyone's `Δz_c` about 1.9× their committed `Δz_pred`?** Not the
  sharp edge: a streamlined, ramped, broad-crested hump was built and tested
  and does *not* close the gap, while re-reading `E₁` at the last pre-choke
  step collapses it to ~1.0. The pool rises as the hump rises, so `E₁` was
  never the fixed quantity the derivation assumes it to be.

The full verification record — the measured baseline and choking-height
ladder, the crest-Froude evidence, the re-timing refinement, safe bounds and
troubleshooting — is kept locally, out of version control, at
`exercises/FB-1-choking-hump/_archive/README-full.md`.
