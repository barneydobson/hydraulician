# QS-2 · Two tanks and two parallel ducts

An enlarged, two-dimensional version of the circular-tank question. The
rig spans 30 m between its outer water faces, with straight, equal ducts
and rectangular tanks. All storage and discharge are **per metre out of
the screen**.

![The enlarged two-tank rig](rig.png)

**Open it:** press **E** in the [app](../../index.html) and choose **QS-2**,
or use the direct link [`?ex=QS-2`](../../index.html?ex=QS-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
This scene requires a build containing the replacement exercise. The accompanying
[rig JSON](hydraulician-rig-QS-2.json) also loads into that build through
Controls → Rig → Open file. **R** restores the initial water every time.
The exercise and saved rig open with **Pressure head** colouring and
**Grade lines (EGL / HGL)** enabled.

This is a **lecturer demo** with no personalised parameter and nothing to
submit or pool. Students predict the two level changes before the run.

## Revised question

Two rectangular tanks are 9 m and 6 m wide in the vertical section and
have a common floor at z = 0.20 m. Two identical horizontal ducts connect
them in parallel. Each duct is **15 m long and 0.10 m clear height**.
Initially the left water level is **3.00 m** and the right is **1.20 m**.
Both ducts are full. There is no external inflow or outflow.

At the prescribed **Medium resolution**, the effective discharge law of
the pair, calibrated from the early drawdown, is approximately

    q = C√Δη,   C = 0.036 m^(3/2)/s,   Δη = η₁ − η₂

Here q is the **total** discharge per metre width (m²/s). Find the fall in
the left tank and the rise in the right tank after **120 s**. Predict first,
then measure. Treat the flow as quasi-steady and water as incompressible.

Only the left tank starts at the high level. The shallow right-hand charge
covers the outlets; a completely empty right tank would add a free-jet and
filling stage and would need a different question. Initial depth is 2.80 m
on the left and 1.00 m on the right.

## Theory

For a one-metre slice the storage areas are A₁ = 9 m² and A₂ = 6 m².
Equivalently use widths B₁ = 9 m and B₂ = 6 m with unit discharge q:

    dη₁/dt = −q/B₁,   dη₂/dt = q/B₂
    −dΔη/dt = C(1/B₁ + 1/B₂)√Δη
    √Δη(t) = √1.8 − [C(1/9 + 1/6)/2] t
            = √1.8 − 0.005t

At 120 s:

    Δη = (√1.8 − 0.600)² = 0.550031 m
    left fall = 6/(9 + 6) × (1.8 − Δη) = 0.499988 m
    right rise = 9/(9 + 6) × (1.8 − Δη) = 0.749981 m
    final levels: η₁ = 2.500012 m, η₂ = 1.949981 m

Each duct sees the full Δη, and q = 2bu for nominal gap b = 0.10 m.
The equivalent combined entrance, exit and duct resistance is
`Δη = K_eff u²/(2g)` with `K_eff ≈ 606`. This is an **effective calibrated
coefficient**, including the numerical representation at Medium, not a
circular-pipe friction factor or an independently specified material property.
The original 0.007 must not be entered as the solver's wall roughness.

## What to do

1. Pause while placing Head gauges (`5`) at (5, 0.35) and (27.5, 0.35) m.
2. Keep **Medium**, wall roughness **0.250**, eddy viscosity **0.40**, and
   celerity **35 m/s**. These are the scene defaults. Leave boundary sources off.
3. Press **R**, resume, and use the **simulation clock**, not a stopwatch.
4. Pause at 120 s. Compare the two gauge levels with 2.50 m and 1.95 m.
   A **0.05 m tolerance per level** is appropriate for this coarse teaching rig.
5. Optional: select **MEASURE → Flux line** (no digit shortcut) and draw one
   section upwards across each bore at x = 17 m. Their flows should
   be nearly equal and add, whereas their head losses are equal. Use tank
   drawdown for calibration; thin-bore section quadrature is coarse at Medium.

The nominal faces are exact: left tank x = 0.5–9.5 m, ducts x = 9.5–24.5 m,
right tank x = 24.5–30.5 m. Lower bore z = 0.50–0.60 m; upper bore
z = 0.94–1.04 m. The walls are clean rectangular blocks with no common
manifold, bends or unequal branch lengths. The view fits the larger domain.

## For the instructor

For a console spot-check, paste [rig.js](rig.js) into the app console and
run `await QS2.demo()`. It selects QS-2, resets the water, places the two
gauges, and prints the early calibration, the 120 s prediction and the
10 s observations through 180 s. It pauses the normal animation while
advancing the solver in short batches. `QS2.sample()` reads the current
levels, both section flows and whole-domain mass; `QS2.prediction(120)`
returns the worked answer. No collection script is needed for this demo.

Run `node exercises/QS-2-twin-tanks/verify.mjs` with Node 22+ and a GPU-backed
Chrome. It boots through `file://`, drives the solver, writes
[verification.json](verification.json), and checks the held-out prediction,
branch balance and conservation. No server, dependencies or build step.

The calibration uses only the **10–40 s** gauge observations, fitting the
slope of √Δη, then rounds C to 0.036. The **120 s** point is held out:
the measured levels were **2.524 m and 1.973 m**, against predictions of
2.500 m and 1.950 m. The measured head difference was **0.552 m** against
0.550 m. Branch section flows agreed within 1%. Conservation is checked
with **whole-domain Σf Δx²**, using `APP.boxForce(0,0,W,H).mass / 1000`:
the API already returns mass in kg per metre width. The cached
`APP.volume()` is retained only as a diagnostic; its column walk misses the
upper duct and must not be used as a conservation check. Measured whole-domain
water-equivalent area was 34.088491 m² initially and 34.088562 m² at 180 s,
a maximum relative drift of **0.00021%**. The solver's
compressibility, grid geometry and free-surface fluctuations explain why
this is an approximate comparison.

Medium has Δx ≈ 0.0367 m and represents both nominal 0.10 m bores with the
same two open rows. This is a calibrated classroom experiment, **not a
grid-converged prediction of a physical duct**. Changing resolution, duct
geometry or drag requires recalibrating C. In particular, do not interpret
the agreement as independent validation of a pipe-friction law.

### Discussion points

- Derive C from your own 10–40 s observations and predict a later time.
  Why must the calibration interval be separate from the prediction interval?
- Explain why the larger tank falls more slowly, even though the transferred
  volume is the same in both tanks.
- Explain why parallel discharges add but the head loss is shared.
- Compare Pressure head colouring with the HGL: pressure head varies with
  elevation even in a still tank, while piezometric head is approximately
  constant there. Why does the EGL lie above the HGL in the ducts?

The original circular-tank calculation and its corrected answer are retained
in [the comparison note](../../docs/qs2-two-tank.md).
