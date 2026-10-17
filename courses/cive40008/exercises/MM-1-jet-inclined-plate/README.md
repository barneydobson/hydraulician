# MM-1 · The force of a jet on an inclined plate

A free jet strikes a flat plate, and one slider sets the angle θ between the
jet and the plate: from 90° (the plate square to the jet) down to 20°. The
plate is fixed in space at each setting and centred on the jet's axis. The jet
splits into two sheets that run along the plate and leave its ends. A Control
volume round the plate reads both components of the force on it; together
they make a force at right angles to the plate, F_n = ρqU sin θ, and the jet
splits unequally, q₁ = q(1 + cos θ)/2 carried on along the plate and
q₂ = q(1 − cos θ)/2 sent back up it. L6, momentum in 2D (slides 20–21).

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **MM-1**, or use the direct link
[`?ex=MM-1`](https://barneydobson.github.io/hydraulician/?ex=MM-1).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

Steady flow, a free jet at atmospheric pressure on every face of the control
volume, per metre width. The jet arrives along +x with discharge q and speed
U. The plate's direction (the way the larger sheet goes) is
t = (cos θ, −sin θ) and its normal, pointing away from the water, is
n = (sin θ, cos θ).

**Along the plate.** A smooth plate can push only at right angles to itself,
so momentum along t is conserved. Both sheets keep the speed U (Bernoulli
along each, at p = 0):

    ρqU cos θ = ρq₁U − ρq₂U,   q₁ + q₂ = q
    ⇒  q₁ = q(1 + cos θ)/2,    q₂ = q(1 − cos θ)/2

**Across the plate.** Neither sheet carries momentum along n, so the force
the water puts on the plate is all of the jet's momentum flux along n:

    F_n = ρqU sin θ
    F_x = F_n sin θ = ρqU sin²θ      (→, along the jet)
    F_z = F_n cos θ = ρqU sin θ cos θ (↑, across the jet)

At 90° it is the symmetric split and F = ρqU along the jet. As θ falls the
force drops and turns away from the jet: at 45° the two components are
equal.

## Why the jet is seen from above (gravity off)

The textbook plate is a horizontal jet in a horizontal plane, so this scene
is a **plan view**: gravity acts into the screen. In the vertical plane the
jet sags, a sheet sent up slows and rains back onto the jet (MO-2 measures
+20% from that on a flat plate), and the box's vertical force would include
the weight of every drop inside it.

Unlike the `plan` scene the plane is not full of water: the jet is a free jet
in air at p = 0, as the textbook assumes. The shaders switch to a two-sided
(plan-view) equation of state at g exactly 0, which pulls a free surface
together, so the scene sets **g = 10⁻³ m/s²**: the free-surface path stays on
and the jet does not measurably sag. All four edges are outfalls (spray that
reaches them leaves; with no gravity a plain open edge let it pond).

**The plane starts empty, and stray water falls out of it.** Only the spout
brings water in. With nothing pulling spray down, the filaments and droplets
thrown off by the first impact and by every slider move used to drift round
the plane for ever. The scene sets a **residue drain** (`residueDrain`, a
plan-view-only option in the solver, off in every other scene): water that is
slow (under 1 m/s) and has no pressurised water within two cells leaves the
plane at 2 s⁻¹, as if it fell through the floor. The jet and the sheets are
fast and the stagnation point is pressurised, so neither is touched.
Measured at Medium as the share of wet cells lying away from the jet and the
sheets:

| moment | without the drain | with it |
|---|---|---|
| jet running 20 s (90°) | 36% (0.083 m² of water) | 5% (0.009 m²) |
| 5 s after a move to 60° | 37% | 3% |
| 15 s after it | 42% | 3% |
| 10 s / 20 s after a move on to 30° | 46% / 48% | 13% / 10% |

What remains at 30° is moving (0.5–3.5 m/s): fragments of the thinning
sheets on their way out of the plane, not relics. F_n at 60° was
4.18 kN/m without the drain and 4.14–4.16 with it, inside the reading's
own wobble. At this g
the head fields (Pressure head and the others) are meaningless — p/ρg with
g = 10⁻³ is a thousand times the pressure in metres — so the card does not
offer them, nor Water (a depth colouring), nor gauges. The plain **Pressure**
(p, kPa) does not divide by g and is offered (lecturer, 2026-10-17): zero in
the still air round the jet, rising to the stagnation pressure ½ρU² ≈ 9.9 kPa
where the jet meets the plate (measured 9.2–9.9 kPa at the 99th percentile);
the scene fixes its key at 0–10 kPa (`pRange`).

**No friction along the plate.** The scene runs free-slip walls (`slip: 1`)
with the wall-friction function off (`cf: 0`) and the open-channel mixing
length off (`kappa: 0`): the teaching point is that the ideal plate takes no
tangential force, which is what makes the split.

## The bench

| item | where |
|---|---|
| spout | centre (0.40, 1.20), 0.24 m wide, 4.5 m/s along +x |
| plate | 1.60 m long, 0.06 m thick, its wet face through (1.60, 1.20) — the jet's axis — at angle θ to the jet; the larger sheet runs down the screen |
| slider | **Plate angle θ**, on the card and in Controls → Geometry, 90° → 20°; the plate turns, the water keeps running |
| Control volume | (0.70, 0.30) → (2.50, 2.10): round the plate at every angle, clear of the spout |
| Pressure force | the plate's wet face (solid `plate`, face `face`) |
| Flux lines | one across each sheet, ~0.1 m past each end of the plate, at right angles to it |

## What the students do (the card)

1. Drag the **Control volume** from (0.70, 0.30) to (2.50, 2.10). Wait ~5 s
   after every change.
2. At 90° read q off the box's left face (≈ 1.04 m²/s) and hover the jet for
   U (≈ 4.45 m/s): ρqU ≈ 4.6 kN/m.
3. Read → (F_x) and ↑ (F_z). At 90°: F_x = ρqU, F_z = 0.
4. **Pressure force** on the plate's wet face: the pressure diagram and its
   resultant F, at right angles to the plate (its F_h, F_v are → and ↑ in
   this plan view). At 90° compare F with the box's →.
5. θ = 75°, 60°, 45°, 30°: read F_x, F_z; form F_n = F_x sin θ + F_z cos θ
   and the along-plate force F_x cos θ − F_z sin θ (≈ 0); compare with the
   Pressure force F and with ρqU sin θ.
6. **Flux line** across each sheet: q₁, q₂ against q(1 ± cos θ)/2.

Pressure head is not offered (see above), so the card needs no pressure-head
sentence. The **Speed** field shows the stagnation point on the plate (blue)
moving off the jet's axis toward the sent-back sheet as θ falls; **Pressure**
is the second field offered (it replaced Momentum flux, Oct 2026), and shows
the same stagnation point as its peak — the pressure the Pressure force tool
integrates over the face.

## For the instructor

Measured on Resolution Medium (367 × 259 cells over the 3.4 × 2.4 m domain,
Δx ≈ 9.3 mm), headless from `?ex=MM-1` with the residue drain on, the slider
stepped 90 → 20° in one run with 8 s of settle after each move, then 3 s of
raw integrals averaged (`rig.js`, `MM1.sweep()`). The jet, from a section
across it at x = 0.62 m: **q = 1.034 m²/s, U = 4.45 m/s, ρqU = 4.61 kN/m**
(ρ∫u²dz); it does not change with θ, so the theory columns use this one value
(at 20° the sent-back sheet starts to cross that section). Forces in kN/m; ±
is the standard deviation of the raw box F_x over the 3 s (the card's reading
is smoothed over ~1 s and wobbles less). F_p is the Pressure force tool's
resultant on the plate's wet face (`APP.faceForce("plate", "face")`, raw,
averaged over the same 3 s).

| θ | F_x | ρqU sin²θ | F_z | ρqU sin θ cos θ | F_n | F_p | ρqU sin θ | F_n ratio | F_t | q₁ | q(1+cos θ)/2 | q₂ | q(1−cos θ)/2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 90° | 4.67 ± 0.02 | 4.61 | −0.01 | 0 | 4.67 | 4.51 | 4.61 | 1.01 | +0.01 | 0.510 | 0.517 | 0.507 | 0.517 |
| 75° | 4.47 ± 0.04 | 4.30 | 1.00 | 1.15 | 4.57 | 4.54 | 4.45 | 1.03 | +0.19 | 0.628 | 0.651 | 0.394 | 0.383 |
| 60° | 3.69 ± 0.13 | 3.45 | 1.91 | 1.99 | 4.15 | 4.18 | 3.99 | 1.04 | +0.20 | 0.756 | 0.776 | 0.261 | 0.258 |
| 45° | 2.49 ± 0.20 | 2.30 | 2.25 | 2.30 | 3.35 | 3.40 | 3.26 | 1.03 | +0.17 | 0.865 | 0.883 | 0.156 | 0.151 |
| 30° | 1.34 ± 0.18 | 1.15 | 2.01 | 1.99 | 2.41 | 2.50 | 2.30 | 1.05 | +0.16 | 0.951 | 0.965 | 0.077 | 0.069 |
| 20° | 0.66 ± 0.25 | 0.54 | 1.48 | 1.48 | 1.62 | 1.69 | 1.58 | 1.03 | +0.11 | 0.960 | 1.003 | 0.051 | 0.031 |

F_n = F_x sin θ + F_z cos θ is the force normal to the plate and
F_t = F_x cos θ − F_z sin θ the force along it (positive in the direction the
larger sheet goes). q₁, q₂ are Flux lines 0.1 m past each end, at right
angles to the plate, from 0.03 m behind the face to 0.30 m (q₁) or 0.16 m
(q₂) in front of it — the big sheet is up to 0.2 m thick, so a shorter line
cuts it. The scatter is in the components, not in F_n: the raw σ of F_n is
only 0.02–0.04 kN/m at every angle, against 0.02–0.25 for F_x — the box's
wobble runs along the plate.

**The Pressure force tool against the box.** F_p and F_n agree to within
−3% (90°), +1% (60°) and +4% (30°): the same normal force read once from
the momentum crossing the box's faces and once from the pressure on the
plate. That is the point of putting the two side by side — on a smooth
plate the force is all pressure. The tool's own reading is noisier than the
box's (raw ±0.1–0.2 kN/m; its label is smoothed over ~1 s) and at 30° it sits
9% over ρqU sin θ.

What to make of it:

- **F_n follows ρqU sin θ to within 1–5%**, reading a steady few per cent
  high. The pressure on the face agrees with the box, so it is not the box's
  bookkeeping; the excess is the plate genuinely being pushed harder than the
  ideal theory says (sheets leaving its ends slightly thickened and spread,
  numerical loss at the stagnation point). Not pinned down further. The
  direction is right at every angle — the force arrow on the box turns with
  the plate and stays at right angles to it, which is visible on screen.
- **F_t is 0.01–0.20 kN/m, 0–7% of F_n**, with free-slip walls and no wall
  friction. It is the residual of two large components and wobbles by about
  as much as it reads, so "close to zero" is the honest statement.
- **q₁ and q₂ follow q(1 ± cos θ)/2 to ~0.01–0.04 m²/s.** The small sheet is
  thin: q₂/U is 16 mm at 30° (under two cells) and 7 mm at 20°, so its
  reading there is a few cells' worth of fill and only the trend is
  meaningful. That is why the card stops the students at 30°; the slider goes
  to 20° for the lecturer.
- q₁ + q₂ comes out 1–3% below q: the drain takes the slow spray, and the
  odd fragment shed from a sheet's edge misses the section.

Things the class will notice:

- **The box's left face at small θ.** The sent-back sheet leaves through the
  same face the jet enters by, so below ~60° that face's Q is the jet minus
  q₂ (0.96 at 30°). That is why q is read at 90°.
- **Start-up spray.** The first impact and every slider move throw filaments
  of water. With no gravity they would drift for ever; the residue drain
  (above) lets them fade out of the plane within a second or two once they
  slow down, and the fast ones leave through the outfall edges. Those
  crossing the box's faces make F_x wobble (± above) but leave the mean
  alone.
- **Holes in the outgoing sheet.** Downstream of the plate, past the box, the
  big sheet's outer edge opens small dry pockets as it thins and spreads.
  Outside the box, so harmless to the reading.
- **The energy line on the box** (in / out / "lost") reads ~1–2 kW/m lost
  out of 10 at the shallow angles: numerical dissipation at the stagnation
  point and in the spray. Not part of this exercise; worth not dwelling on.

The `MO-2` and `HP-2` rigs show related physics in the vertical plane, with
hand-drawn deflectors and gravity; this scene is the clean plan-view version
with one continuous slider.
