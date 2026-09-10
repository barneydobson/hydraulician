# QS-2 · Two tanks and two parallel ducts

## Lecturer notes

Students vary reservoir storage while the two identical ducts keep the same
resistance. They calculate their own widths from the final digit of their
student number, predict the two level changes, then compare at 120 s. The
smaller reservoir changes level faster because the transferred volume is the
same on both sides. The exercise card contains the complete student task,
including the number rule, equations, gauge stations and comparison tolerance.
These notes supply the derivation, worked answers and verification.

**Open it:** select **QS-2** with **E** in the [app](../../index.html), or
use [`?ex=QS-2`](../../index.html?ex=QS-2). General operation is described in
the [teaching pack index](../INDEX.md#running-an-exercise).
The [captured rig JSON](hydraulician-rig-QS-2.json) opens the default 9 m / 6 m
bench. Pressure head colouring and EGL/HGL grade lines are enabled.

![The adjustable two-tank rig](rig.png)

## Bench and student-number rule

Two full, parallel ducts are each 15 m long and 0.10 m clear height. They
remain at x = 9.5–24.5 m; the lower bore is z = 0.50–0.60 m and the upper
z = 0.94–1.04 m. The common tank floor is z = 0.20 m. Initial levels are
3.00 m left and 1.20 m right: only the left reservoir starts high, and the
shallow right charge covers both outlets.

Let **d** be the last digit of the student number:

    B₁ = 6.75 + 0.25d m    (left reservoir)
    B₂ = 3.75 + 0.25d m    (right reservoir)

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **B₁ (m)** | 6.75 | 7.00 | 7.25 | 7.50 | 7.75 | 8.00 | 8.25 | 8.50 | 8.75 | 9.00 |
| **B₂ (m)** | 3.75 | 4.00 | 4.25 | 4.50 | 4.75 | 5.00 | 5.25 | 5.50 | 5.75 | 6.00 |

The on-card number fields and **Controls → Geometry** sliders operate the
same parameters. Left width ranges from 6 to 9 m, right from 3 to 6 m,
with 0.25 m slider steps. A change restores the initial water and **t = 0**;
it is a new storage experiment, not a moving-wall simulation. Pressing R
keeps the chosen widths and resets the water again. Saved rigs retain both
widths. The digit rule is displayed, not automatically applied: the student
does the arithmetic and sets the two values.

The outer water faces move to x = 9.5 − B₁ and x = 24.5 + B₂. The duct
mouths and 32 m × 4 m domain stay fixed, so Medium retains Δx ≈ 0.0367 m
and two open rows in each duct for every student. Gauges at (5, 0.35) and
(26.5, 0.35) m remain inside the tanks over the entire slider range.

## Theory

All quantities are per metre out of the screen. Unit discharge is
q = C√Δη with **C = 0.036 m^(3/2)/s** and Δη = η₁ − η₂. Tank storage uses
widths B₁ and B₂ (m), not circular areas. Conservation gives:

    dη₁/dt = −q/B₁,   dη₂/dt = q/B₂
    √Δη(t) = max[0, √1.8 − 0.018(1/B₁ + 1/B₂)t]
    left fall = B₂(1.8 − Δη)/(B₁ + B₂)
    right rise = B₁(1.8 − Δη)/(B₁ + B₂)

At 120 s, the coefficient of the reciprocal-width sum is 2.16. All assigned
widths remain short of equalisation then, so the card can omit the maximum.
The final left level is 3.00 minus its fall; the final right level is 1.20
plus its rise. The ratio rise/fall is B₁/B₂.

Each duct sees the same head loss; discharges add, losses do not. With gap
b = 0.10 m, q = 2bu and Δη = K_eff u²/(2g), giving K_eff ≈ 606. This is an
**effective Medium-resolution coefficient**, calibrated from early drawdown,
not a circular-pipe friction factor or a grid-converged material property.
Changing resolution, duct dimensions or drag requires a new calibration.
The original circular-pipe friction factor 0.007 is not the solver's wall
roughness. Its separate calculation is retained in
[the original-problem comparison](../../docs/qs2-two-tank.md).

### Worked answers at 120 s

| d | B₁ (m) | B₂ (m) | Difference (m) | Left fall (m) | Right rise (m) |
|---|---:|---:|---:|---:|---:|
| 0 | 6.75 | 3.75 | 0.199 | 0.572 | 1.029 |
| 1 | 7.00 | 4.00 | 0.243 | 0.566 | 0.991 |
| 2 | 7.25 | 4.25 | 0.287 | 0.559 | 0.954 |
| 3 | 7.50 | 4.50 | 0.329 | 0.552 | 0.919 |
| 4 | 7.75 | 4.75 | 0.370 | 0.543 | 0.887 |
| 5 | 8.00 | 5.00 | 0.409 | 0.535 | 0.856 |
| 6 | 8.25 | 5.25 | 0.447 | 0.526 | 0.827 |
| 7 | 8.50 | 5.50 | 0.483 | 0.517 | 0.800 |
| 8 | 8.75 | 5.75 | 0.517 | 0.509 | 0.774 |
| 9 | 9.00 | 6.00 | 0.550 | 0.500 | 0.750 |

Digit 9 reproduces the original 9 m / 6 m bench: Δη = 0.550031 m,
fall = 0.499988 m, rise = 0.749981 m. Its predicted final levels are
2.500012 m and 1.949981 m.

## Teaching sequence

1. Have students calculate both widths and set the fields/sliders while
   paused. Keep **Medium**, wall roughness **0.250**, eddy viscosity **0.40**,
   celerity **35 m/s**, and boundary sources off (the scene defaults).
2. Ask for predictions before running. All required data and equations are
   on the card; students do not need these notes.
3. Place Head gauges (`5`) at (5, 0.35) and (26.5, 0.35) m, press **R**,
   resume, and pause at 120 s on the simulation clock. Compare the level
   changes with the predictions using a **0.05 m tolerance per level**.
4. Discuss how the result varies with storage. There is no class CSV
   submission requirement or collection script.
5. Optionally use **MEASURE → Flux line** (no digit shortcut) at x = 17 m,
   drawing upwards across each bore. The nearly equal branch discharges
   add. Use tank drawdown to calibrate C; thin-bore section quadrature is
   coarse at Medium.

## Verification and console spot-check

Paste [rig.js](rig.js) into the app console and run `await QS2.demo(d)` for
a digit 0–9 (default 9). It selects the exercise, sets both widths through
the same parameter setters as the sliders, resets, and prints 10 s readings
through 180 s, an early 10–40 s calibration and the 120 s prediction.
`QS2.sample()` reads the current gauges, flows and whole-domain mass;
`QS2.prediction(120)` uses the current widths.

Run `node exercises/QS-2-twin-tanks/verify.mjs` to verify the default bench
and regenerate its captured JSON and previews. Run
`node exercises/QS-2-twin-tanks/verify-widths.mjs` for all ten digits, dry
exterior checks, parameter reset behaviour and rig round-trip. Both use
Node 22+ and GPU-backed Chrome, with no application dependencies or build.
Results are in [verification.json](verification.json) and
[width-verification.json](width-verification.json).

The original C was calibrated only from 10–40 s; the 120 s prediction is
held out. The ten-digit sweep tests whether that coefficient transfers
across the assigned storage widths: all ten passed, with a maximum level
error of 0.046 m at 120 s. The grid and both ducts are fixed.
The comparison tolerance accounts for compressibility, rasterised storage,
free-surface fluctuations and the quasi-steady approximation.

Conservation uses `APP.boxForce(0,0,W,H).mass / 1000`, the whole-domain
water-equivalent area Σf Δx². The mass API already returns kg per metre
width. `APP.volume()` is recorded only as a diagnostic: it misses the upper
duct and is not a conservation test. Width changes intentionally alter
initial storage; mass is compared only within a run at fixed widths.

### Discussion points

- Why does the narrower reservoir change level faster? Why does rise/fall
  equal B₁/B₂ even though the discharge changes throughout the run?
- Why do parallel discharges add, while each branch sees the full head loss?
- Compare Pressure head colouring with the HGL in a still reservoir. Why
  does pressure head vary vertically while piezometric head stays constant?
- Why must calibration and prediction use different time intervals?
