# CR-1 · The contraction rig

One scene asked three questions, one per lecture. Two reservoirs held at
fixed levels (2.80 m and 2.40 m) are joined by a 1.00 m pipe that contracts
into a 0.50 m pipe discharging into the right-hand reservoir. One slider,
**Contraction length L**, takes the contraction from a long gentle taper
(L = 3 m) through ever shorter, steeper tapers to an abrupt step (L = 0).

The card has three **tabs**; switching tabs swaps the steps and the
interface (fields, strip buttons, tools) and leaves the flow running:

| tab | lecture | the question | was |
|---|---|---|---|
| **Streamlines** | L4 Fluid motion | the taper's streamlines follow the walls; the step separates, with a vena contracta | FF-5 |
| **Continuity** | L5 Mass conservation | Lagrangian and Eulerian; Q₁ = Q₂ and Σ Q = 0 round a control volume, for any shape | VC-1 |
| **Forces** | L6 Momentum | the force on the contraction from a momentum balance, R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁); a straight pipe's friction | MM-2 |

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **CR-1**, or link straight to a tab:
[`?ex=CR-1&tab=streamlines`](https://barneydobson.github.io/hydraulician/?ex=CR-1&tab=streamlines),
[`&tab=continuity`](https://barneydobson.github.io/hydraulician/?ex=CR-1&tab=continuity),
[`&tab=forces`](https://barneydobson.github.io/hydraulician/?ex=CR-1&tab=forces).
The old links `?ex=FF-5`, `?ex=VC-1` and `?ex=MM-2` still work and open the
matching tab. A course menu lists a tab as `"CR-1#forces"`.
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## The bench

| item | where |
|---|---|
| left reservoir | x = 0 → 3.60 m, held at 2.80 m by a head-driven level control |
| wide pipe | bore z = 0.50 → 1.50 m (1.00 m), bellmouth entry at x = 3.60 m |
| contraction | ends at x = 7.60 m; starts at x = 7.60 − L |
| narrow pipe | bore z = 0.75 → 1.25 m (0.50 m), x = 7.60 → 11.00 m |
| right reservoir | x = 11.00 → 17.00 m, held at 2.40 m by a tailwater control that only lets water out |

The contraction is symmetric about the pipe axis (z = 1.00 m). Changing L
restarts the water (it redraws the pipe) and the scene's spin-up then runs
flat out again, so each L is seen steady. The card waits about **25 s**, the
scene's measured spin-up (Q is within 1% of steady by ~17 s).

Instruments, all per metre width (the simulator is 2D, so an area is a bore
height and Q is in m²/s): Flux lines dragged **upwards** across the wide
pipe at x = 4.3 m and the narrow pipe at x = 9.0 m (z = 0.4 → 1.6 m), and a
Control volume from (4.3, 0.3) to (9.0, 1.65) whose top and bottom lie
inside the pipe walls.

## Streamlines (L4)

A streamline is everywhere tangent to the velocity; in steady flow it is
also the path a particle takes. Where streamlines converge the flow speeds
up; where they curve there is a pressure gradient across them pushing the
water round the bend. A particle can follow a wall round a gentle
convergence, but at a sharp corner it would need an infinite pressure
gradient to turn, so the flow separates: the streamline leaving the corner
bounds a slow eddy, and the through-flow keeps converging past the edge. The
narrowest section is the **vena contracta**, C_c·A₂ with C_c ≈ 0.6–0.7; the
jet then expands to fill the pipe, which is where an abrupt contraction loses
its energy.

The tab offers Water and Speed (Vorticity is not taught in Year 1;
`⋯ Show everything` brings it back for a lecturer — it shows the separated
layers most clearly), Particles, Streamlines and the hover card.

Measured (Medium, 746 × 127, Δx = 22.8 mm, the narrow pipe 22 cells across;
`CR.profile(x)` in `rig.js`, 35–40 s after a restart), u across the bore with
the step (L = 0):

| x | what the profile shows |
|---|---|
| 7.50 m, just before the step | reverse flow (−0.2 to −0.5 m/s) in the bottom and top 0.1 m most of the time: the corner eddies in front of the step |
| 7.65–8.00 m | the core at 2.8–3.5 m/s with ~0 or slightly reversed flow in the outer 1–2 cells each side |
| 8.15–8.45 m | core peak 3.6–3.8 m/s, reverse flow down to −0.7 to −1.5 m/s at the walls: the vena contracta, effective width ≈ Q/U_core ≈ 1.28/3.7 ≈ 0.35 m, so C_c ≈ 0.69 |
| 9.50 m | reattached: 3.0–3.5 m/s across the core, ordinary wall layers |

With the taper the profiles are full and monotonic all the way through. The
separated regions are only a few cells thick at Medium, so the vena contracta
is a modest necking, not the crisp textbook picture; the shear layers shed
small eddies, so the live picture flutters and Average gives the clean mean
streamlines. Dye works here: nothing is dyed until the student picks the
**Dye** tool and holds the pointer in the water — in the wide pipe, or in the
left reservoir ahead of the entrance — and the ink is drawn through the
bellmouth and along the pipe, thinning where the flow accelerates. (The
scene still declares six fixed streaks 0.5 m ahead of the entrance; they run
only with Controls → Dye sources.)

## Continuity (L5)

    Q = U₁A₁ = U₂A₂            steady, incompressible, one inlet and one outlet
    U₂/U₁ = A₁/A₂ = 1.00/0.50 = 2
    Σ Q (outward positive) = Q_out − Q_in = 0

The Control volume counts **outflow as positive**; the slides count inflow as
positive — say so. A particle's acceleration in steady flow is convective,
u ∂u/∂x + w ∂u/∂z: it comes from moving to where the flow is faster, not from
the flow changing in time (Lagrangian acceleration without Eulerian change).

| reading (per metre width) | taper, L = 3 m | step, L = 0 |
|---|---|---|
| Q₁, wide pipe (x = 4.3 m) | 1.345 m²/s | 1.283 m²/s (±0.04) |
| Q₂, narrow pipe (x = 9.0 m) | 1.345 m²/s | 1.285 m²/s |
| U₁ = Q/1.00, U₂ = Q/0.50 | 1.35, 2.69 m/s | 1.28, 2.57 m/s |
| Σ Q on the box (4.3, 0.3) → (9.0, 1.65) | 0.0059 m²/s (0.44% of Q) | 0.0069 m²/s (0.54%) |
| reservoir levels, left / right (probe at the floor, x = 3.0 / 14.0 m) | 2.77 / 2.38 m | 2.77 / 2.38 m |

The box's small positive Σ Q is the compression term, not a leak: Q uses
min(f, 1) while water under pressure has f slightly above 1
(docs/engineering-notes.md, "Q and ṁ/ρ are not the same number"). With the
step the readings flutter by about ±3%; read the median, or the Average. The
step passes 5% less water than the taper between the same reservoirs: the
slider changes the streamlines a great deal and Q a little, by the step's
extra loss.

## Forces (L6)

Steady momentum balance in x for the water between face 1 and face 2:

    ρQU₂ − ρQU₁ = p₁A₁ − p₂A₂ − R      so      R = p₁A₁ − p₂A₂ − ρQ(U₂ − U₁)

R is the force of the water on the solid inside the box (the pipe walls and
the contraction faces), positive downstream; gravity has no x component. The
box integrates the momentum flux ρu² ("M") and the pressure ("F") on each
face from the real profiles, and its F→ is the force on what is inside —
including the wall shear, which the textbook formula silently includes too.
Between two sections of one straight pipe U₁ = U₂, so
(p₁ − p₂)A = τ_w × (wetted length 2ΔL) = R: the pressure drop is friction.

The tab opens on the **Pressure** colouring (p, kPa: high in the wide pipe,
falling through the contraction) with Speed beside it, and the hover card
reads the pressure in kPa.

| reading (per metre width) | taper, L = 3 m | step, L = 0 |
|---|---|---|
| mean p on face 1 / face 2 | 16.05 / 11.79 kPa (1.636 / 1.202 m of water) | 16.14 / 11.42 kPa (1.645 / 1.164 m) |
| p₁A₁ / p₂A₂ (sections' F) | 16.05 / 5.90 kN/m | 16.14 / 5.71 kN/m |
| momentum flux M₁ / M₂ | 2.14 / 4.15 kN/m | 1.94 / 4.01 kN/m |
| **R from the box (F→)** | **8.13 kN/m** | **8.36 kN/m** (±0.1) |
| R from the formula, U = Q/A | 8.34 kN/m | 8.79 kN/m |
| straight box 9.0 → 10.6 m: M in / out | 4.18 / 4.26 kN/m | 4.04 / 4.05 kN/m |
| straight box: p drop (F in − F out) | 123 N/m | 56 N/m |
| straight box: F→ (= friction) | 51 N/m, τ_w ≈ 16 Pa | 42 N/m, τ_w ≈ 13 Pa |
| lowest pressure in the bore | 10.0 kPa (narrow pipe soffit, x ≈ 10.0–10.5) | 5.4–7.4 kPa (vena contracta, x ≈ 8.4–8.5) |

- **Box against formula.** Within 3% (taper) and 5% (step): the box uses the
  real profiles (∫ρu² exceeds ρQU by the momentum coefficient β, most just
  past the step) and includes the wall shear.
- **Taper against step.** R moves by +0.23 kN/m (box) or +0.45 kN/m
  (formula), 3–5%; the step loses 0.072 m more head between the faces, and
  ρg·0.072·A₂ ≈ 0.35 kN/m is the same size (energy is L7 — for the lecturer).
- **Straight pipe.** Friction is small at this Reynolds number and
  resolution, so read the box's F→ (it prints in N/m under 1 kN) or the
  "force on what is between them" line of the two Flux sections. With the
  step the momentum in and out agree to 0.3%; with the taper the profile is
  still developing at x = 9 m and the momentum flux rises 2% across the box —
  use the step for this part.
- The box's vertical force is the weight of the water in it plus the pressure
  difference across the pipe (its top and bottom lie in the walls); only the
  → component is R.

The level controls concede a few centimetres under draw (2.77 m against
2.80 m, 2.38 m against 2.40 m), so quote the levels the probe reads.

## For the instructor

Measured with `CR` in `rig.js` (each run restarted at its L, 35 s of
spin-up, then the mean of 20 samples over 5 s). Past the pipe exit the jet
spreads through the 6 m right reservoir and leaves through the right edge; a
slow roller runs back along the surface (about 1 m/s at the outlet wall, gone
by x ≈ 15 m) and pulls the surface there a few centimetres under the
tailwater — the jet's entrainment. The left reservoir draws down smoothly
from 2.79–2.80 m to 2.70–2.75 m at the pipe entry, the water accelerating
into the pipe.

### Discussion points

- The streamlines converge in both cases — continuity does not care about the
  shape. What the shape decides is whether the flow follows the wall, and so
  the loss and the Q a given level difference can drive.
- The velocity doubles and the particle accelerates, yet nothing is unsteady.
- R depends on the END conditions — p, U and A at the two faces — not on the
  shape in between: that is why a momentum balance can be done on a
  contraction nobody has drawn in detail.
- A box drawn round a straight pipe measures friction directly: the same
  instrument, with the momentum terms cancelling.

`rig.js` is the console spot-check: `CR.demo()`, `CR.read(5)`,
`CR.friction(5)`, `CR.profile(x)`.

**Domain made taller (2026-10-17).** H 2.9 → 3.4 m with the top edge open, so the reservoirs no longer sit under a closed lid. Re-measured at Medium (689 × 138): Q 1.374 m²/s (taper) and 1.318 (step), 2–3% above the figures above; reservoir levels 2.73 / 2.38 m.
