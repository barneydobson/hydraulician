# MM-2 · The contraction rig, forces

The contraction rig of FF-5 and VC-1, asked about momentum. A control volume
round the contraction balances the momentum carried in and out against the
pressure on its two end faces; what is left over is the force the water puts
on the contraction,

    R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁)          per metre width, positive downstream

The contraction slider then shows that R is fixed by the end sections, not
by the shape in between: a gentle taper and an abrupt step give nearly the
same force, and the small difference is the extra loss of the step. Moved
onto a straight length of the narrow pipe, the same box has the same
momentum flux in and out, so the whole pressure drop across it is wall
friction.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **MM-2**, or use the direct link
[`?ex=MM-2`](https://barneydobson.github.io/hydraulician/?ex=MM-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Steady momentum balance in x for the water inside a control volume with an
inlet face 1 and an outlet face 2 (per metre width, A = bore height):

    ρQU₂ − ρQU₁ = p₁A₁ − p₂A₂ − R

R is the force the water exerts on the solid inside the box (the pipe walls
and the contraction faces), so the walls push the water with −R. Gravity
has no x component. Rearranged,

    R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁)

With U = Q/A and the mean pressure on each face this is the slide formula.
The simulator's box does the same sum with the full velocity and pressure
profiles: on each face it integrates the momentum flux ρu² (the "M") and the
pressure p (the "F") separately, and F→ under the box is minus their total —
the force on what is inside. The box's R also contains the wall shear on the
pipe walls inside it, which the textbook formula silently includes too (it
is the force on everything between the two faces).

**Straight pipe.** Between two sections of the same pipe U₁ = U₂, so the
momentum fluxes cancel and

    (p₁ − p₂)A = τ_w × (wetted length) = R

— the pressure drop is the wall friction (both walls, per metre width:
wetted length 2ΔL).

## What to do

1. Open the card (L = 3 m, steady). Pick **Flux line** (`8`) and drag
   **upwards** across the wide pipe at x = 2.3 m (z = 0.4 → 1.6 m): section
   1 prints Q, M (momentum flux ρQU₁, roughly) and F (pressure force p₁A₁).
   Drag a second one upwards across the narrow pipe at x = 7.0 m: section 2.
   The card under the pair prints the momentum and pressure at each and the
   **force on what is between them** — that is R.
2. Pick **Control volume** (`9`) and drag a box from (2.3, 0.3) to
   (7.0, 1.65), top and bottom inside the pipe walls. Press **B** until the
   faces read *momentum + pressure*. F→ under the box is the same R.
3. Work R out from the formula: U₁ = Q/1.00, U₂ = Q/0.50, and p₁A₁, p₂A₂
   from the sections' F. It matches the box.
4. Drag **Contraction length L** (Controls → Geometry) to **0 m**, the
   abrupt step. The run restarts; once settled read R again. Nearly the
   same as for the taper.
5. Move the box onto the straight narrow pipe: (7.0, 0.3) → (8.6, 1.65).
   The two faces carry the same momentum flux; the pressure forces differ,
   and the difference is the friction on the 1.6 m of pipe wall inside.

## For the instructor

Measured on Resolution Medium (614 × 155, Δx = 18.7 mm) with `CR` in
`rig.js`: each run restarted at its L, 30 s of spin-up, then the mean of 20
samples over 5 s. The card waits about **25 s** (the scene's measured
spin-up: from rest Q overshoots by ~30% at 8 s and is back within a few per
cent by 25 s).

| reading (per metre width) | taper, L = 3 m | step, L = 0 |
|---|---|---|
| reservoir levels, left / right | 2.77 / 2.48 m | 2.77 / 2.48 m |
| Q at x = 2.3 and 7.0 m | 0.954 / 0.954 m²/s | 0.923 / 0.923 m²/s |
| mean p/ρg on face 1 / face 2 | 1.674 / 1.483 m | 1.677 / 1.455 m |
| p₁A₁ / p₂A₂ (sections' F) | 16.42 / 7.28 kN/m | 16.45 / 7.14 kN/m |
| momentum flux M₁ / M₂ | 1.08 / 2.04 kN/m | 1.01 / 2.02 kN/m |
| **R from the box (F→)** | **8.17 kN/m** (±0.04) | **8.29 kN/m** (±0.10) |
| R from the formula, U = Q/A | 8.24 kN/m | 8.47 kN/m |
| H₁ − H₂ from the mean p and U = Q/A | 0.052 m | 0.092 m |
| straight box 7.0 → 8.6 m: M in / out | 2.05 / 2.10 kN/m | 2.03 / 2.03 kN/m |
| straight box: p drop (F in − F out) | 67 N/m | 14 N/m |
| straight box: F→ (= friction) | 19 N/m, τ_w ≈ 6 Pa | 15 N/m, τ_w ≈ 4.6 Pa |
| lowest p/ρg in the bore | 1.16 m (bellmouth lip) | 1.10 m (vena contracta, x ≈ 6.4) |

- **Box against formula.** The formula with U = Q/A and the mean face
  pressure lands within 1% (taper) and 2% (step) of the box. The box uses
  the real profiles (∫ρu² is larger than ρQU by the momentum coefficient β,
  a few per cent past the step) and includes the wall shear inside it.
- **Taper against step.** R moves by +0.12 kN/m (box) or +0.23 kN/m
  (formula), 1.5–3%. The step loses 0.040 m more head between the two
  faces; ρg·0.040·A₂ ≈ 0.20 kN/m, the same size. Q is 3% lower with the
  step for the same reservoirs.
- **Straight pipe.** The friction is small at this Reynolds number and
  resolution: the pressure drop over 1.6 m is 15–70 N/m on faces carrying
  7.2 kN/m, so the box's faces (printed to 0.01 kN) hardly differ — read
  the box's F→ (it prints in N/m when under 1 kN) or the "force on what is
  between them" line of two Flux sections. With the step the momentum in and
  out agree to 0.01%; with the taper the profile is still developing at
  x = 7 m and the momentum flux rises 2% across the box, which is of the
  same size as the friction — use the step for this part of the demo.
- The box's "force on what is inside" also prints a large vertical
  component (about −32 kN/m on the contraction box): that is the weight of
  the water in the box plus the pressure difference across the pipe — the
  box's top and bottom lie in the walls. Only the → component is R.
- Pressures stay positive everywhere: the lowest reading, at the vena
  contracta, is 1.1 m of head.

The R values are per metre of width (the simulator is 2D). The level
controls concede a few centimetres under draw (2.77 m against a 2.80 m
setting, 2.48 m against 2.40 m), so quote the levels the probe reads, not
the settings.

### Discussion points

- R depends on the END conditions — p, U and A at the two faces — not on
  the shape in between. That is why a momentum balance can be done on a
  contraction nobody has drawn in detail.
- For the same reservoirs the step passes a little less water and loses a
  little more head; the force changes by about that loss times the narrow
  area, which sets up the loss coefficients of L7.
- A box drawn round a straight pipe measures friction directly: it is the
  same instrument, with the momentum terms cancelling.
