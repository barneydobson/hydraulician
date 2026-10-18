# HJ-2 · Momentum balance: sluice gate and hydraulic jump

The flume lab at full scale: the first-year teaching flume, several times its
size. A deep pool stands behind a sluice gate open 0.30 m, and at t = 0 that
is the only water there is — the flume below the gate is empty and the flap
weir at its far end stands at 0.5 m. Released, the water shoots out under the gate
as a fast, thin sheet and runs off the end. The weir crest is the lab's
operating handle: raised, it makes the sheet jump up to a slow, deep flow,
moves that jump along the apron, and finally drowns the gate.

In the momentum lecture (L6, slide 11) it is a **momentum balance**, done
twice with the Control volume:

- **Round the gate.** Momentum flux in and out plus the hydrostatic pressure
  forces on the two faces give the force on the gate,
  F = ½ρg(d₁² − d₂²) − ρq(U₂ − U₁). The Pressure force tool reads the same
  force off the plate itself, slightly lower: the pressure right at the gate
  is not hydrostatic — it falls to zero at the lip, where the streamlines
  curve under the gate (slide 10).
- **Round the jump.** Nothing solid is inside the box (only the bed's
  friction), so momentum flux + pressure force in = out: the fast thin sheet
  and the slow deep flow carry the same total. The water jumps so the books
  balance. No Bélanger theory — it is not Year 1.

The card offers what the class has met by L6: the Water (default), Speed and
Froude number colourings (Froude in plain words — above 1 fast and shallow,
below 1 slow and deep; kept on the lecturer's decision), the Control volume,
the Pressure force tool, a Flux line for q and a Gauge reading depth. The
Momentum tab has no heads, no grade lines and no jump box; the Energy tab
(L7) adds the grade lines (EGL, HGL), the energy head and the box's energy
rows. (Ported from the 10 Sep build of the lab
demo; titled "Pressure and force on a sluice gate" until the lecturer agreed
the momentum-balance aim, Oct 2026.)

**Open it:** press **E** in the [app](../../../../)
and pick **HJ-2**, or use the direct link
[`?ex=HJ-2`](../../../../?ex=HJ-2).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

Steady momentum balance in x on a control volume, per metre width:

    Σ (momentum flux out) − Σ (momentum flux in) = Σ (pressure forces on the faces) − F_solid

with F_solid the force of the water on whatever solid is inside the box.

**Round the gate**, from the pool (depth d₁, U₁ = q/d₁) to the sheet just
past the lip (depth d₂, U₂ = q/d₂), both faces hydrostatic:

    F_gate = ½ρg·d₁² − ½ρg·d₂² − ρq·(U₂ − U₁)

On the plate the pressure is hydrostatic from the surface down most of the
way and falls to zero at the lip, where the water is already moving; the
"gate as a wall" estimate ½ρg(d₁ − a)² is close to the integral.

**Round the jump**, nothing solid inside (bar the bed's shear):

    ρq·U₁ + ½ρg·d₁² = ρq·U₂ + ½ρg·d₂²          (d₁, d₂ either side of the jump)

For the instructor only (not on the card): this with continuity is
Bélanger's d₂/d₁ = ½·(√(1 + 8·Fr₁²) − 1); with d₁ ≈ 0.20 m and Fr₁ ≈ 4.5
the conjugate depth is about 1.2 m, and the weir has to hold that. Energy is
not conserved across the jump.

On the card d₁ is the upstream depth and d₂ the downstream one in each box
(slide 11's labels). The bed's top face is at **z = 0.30 m**; depths are
over the bed.

## The bench

| item | where |
|---|---|
| bed | flat, top face z = 0.30 m, from the inlet to x = 12.5 m |
| pool | x = 0 → 4.0 m, starts 2.85 m deep and settles at 2.72 m, fed through the reservoir boundary at q ≈ 1.3 m²/s; the only water at t = 0 |
| gate | x = 4.0 m, opening a = 0.30 m |
| weir | the flume's flap: a 1.3 m plate hinged on its upstream foot at x = 11.0 m and leaning downstream; its tip is the crest (**Weir crest height** — the slider on the card, 0 → 0.60 m, starting at 0.50 m). At 0 m it lies flat, flush with the bed |
| overfall | the bed ends at 12.5 m and the water leaves through the open floor |

Roughly the lab flume at ×7–10: the lab's 43 mm gate under a 0.275 m pool
passes 5.85 l/s down a 0.104 m flume (q = 0.056 m²/s) with the jump about
0.7 m downstream.

## What to do

1. Let it settle — about **30 s**; the card counts it down. The water rushes
   under the gate as a sheet about 0.2 m deep at 6.4 m/s. Drop a Gauge in
   the pool at x = 2.5 m (d₁ ≈ 2.72 m) and drag a Flux line up through the
   sheet at x = 6 m (q ≈ 1.30 m²/s).
2. **The box round the gate.** Drag a Control volume from (2.50, 0.10) to
   (6.00, 3.70) and press **B** until its faces read momentum + pressure. F→
   is the force on the gate: about **30 kN/m**.
3. **The formula and the plate.** ½ρg(d₁² − d₂²) − ρq(U₂ − U₁) with
   d₂ ≈ 0.20 m gives about **28.3 kN/m**; the Pressure force tool on the
   gate's upstream face reads **28.1 kN/m** — its diagram falls to zero at
   the lip, where the pressure is not hydrostatic.
4. **The jump.** The weir starts at 0.5 m: by about 20 s the sheet jumps up
   near the weir (x ≈ 7.5 m) to a slow, deep flow, which then creeps up to the
   gate's foot (by about 40 s). Set 0.46 m while it is partway to hold it;
   0.6 m (the top of the slider) drowns the gate.
5. **The box round the jump.** Drag the Control volume from about 0.5 m
   before the jump's toe to 2 m past it, bed to z ≈ 2.6 m: in on the left
   (mostly momentum flux) ≈ out on the right (mostly pressure force), about
   **8.4–8.6 kN/m** each, and F→ ≈ 0.

Then raise the crest again: at 0.6 m and above the jump reaches the gate in
about half a minute and drowns it — the pool climbs, the reservoir marker on
the left edge is left behind, and the gate force grows (≈ 33.5 kN/m at
0.7 m). Ask the class which of the depths on the gate's two faces changed.

## For the instructor

Measured on Resolution Medium (592 × 161 cells, Δx = 24 mm) through
`?ex=HJ-2` with the headless driver (`test/cdp.mjs`), on the stress-free
surface code (#72), means of 1 s samples.

**The sheet, crest 0** (t = 31–60 s):

| reading | value |
|---|---|
| pool depth at x = 2.5 m | 2.72 m (± 0.00), settled from t ≈ 26 s |
| sheet depth at x = 4.3 m; along the flume | 0.20 m; 0.21 → 0.26 m at the weir |
| q, Flux line at x = 6 m / x = 10 m | 1.30 m²/s (± 0.01) / 1.31 (± 0.05) |
| gate, upstream face, F→ (Pressure force tool) | 28.1 kN/m (± 0.04), centre of pressure z = 1.44 m |
| ½ρg·(d₀ − a)² | 28.7 kN/m |
| Control volume (2.50, 0.10) → (6.00, 3.70), F→ | 30.2 kN/m (± 0.06) |
| C_d from the pool and q | 0.59 |
| p/ρg 0.1 m upstream of the plate, 0.05 / 0.15 / 0.25 m above the bed | 1.97 / 1.85 / 1.84 m against 2.67 / 2.57 / 2.47 m hydrostatic |
| p/ρg in the opening (x = 4.0 m), 0.05 / 0.15 m above the bed | 1.42 / 1.04 m |
| p/ρg in the pool at x = 2.5 m, same heights | 2.68 / 2.56 / 2.46 m — hydrostatic to 1 cm |

(d₀ in these older tables is the pool depth, d₁ on the card.) The diagram
reads 2% under ½ρg·(d₀ − a)² because the pressure has already started to fall
near the lip.

**The momentum balance, measured (Oct 2026).** Same build and driver, means
of 40 samples 0.5 s apart; `M.box` in the measuring script is `APP.boxFlux`,
the Control volume's own budget.

Round the gate, crest 0 (t = 30–50 s), box (2.50, 0.10) → (6.00, 3.70):

| reading | value |
|---|---|
| d₁, pool at x = 2.5 m | 2.718 m |
| d₂, the sheet at its thinnest (x ≈ 4.45 m) / at the box's right face (x = 6 m) | 0.202 m / 0.214 m |
| q, Flux line at x = 6 m | 1.300 m²/s |
| ½ρg(d₁² − d₂²) − ρq(U₂ − U₁), d₂ = 0.202 m | **28.3 kN/m** (36.0 hydrostatic − 7.75 momentum) |
| the same with d₂ = 0.214 m (the box's own face) | 28.7 kN/m |
| Pressure force tool, gate upstream face | **28.1 kN/m** |
| Control volume F→ | **30.2 kN/m** (± 0.07) |
| box faces: in, momentum flux / pressure force | 1.09 / 37.51 kN/m |
| box faces: out, momentum flux / pressure force | 8.17 / 0.25 kN/m |

The plate's diagram reads 0.7% under the formula: the pressure on the plate
falls short of hydrostatic towards the lip (the p/ρg rows in the table above).
The box reads 6.8% over it. Most of that is its upstream face: 37.5 kN/m of
pressure force against ½ρgd₁² = 36.2 kN/m from the gauge depth (+1.3 kN/m);
the rest is the momentum fluxes (in 1.09 against ρq²/d₁ = 0.62 — the pool's
approach flow is not uniform; out 8.17 against ρq²/d₂ = 7.90 at x = 6 m —
the sheet's profile is not flat) and the bed's friction under the sheet,
which is inside the box. Students see the box's two faces print exactly these
in/out terms, so the comparison is honest: the formula is the textbook's
idealisation of the same box.

Round the jump: from crest 0 pushed to 0.55 m at t = 30 s, the jump formed at
the weir at t ≈ 46 s, reached x = 7.75 m at t ≈ 65 s, and held at 0.46 m its
toe wandered between x = 7.0 and 7.9 m for the 30 s measured (t = 65–95 s).
Box (6.9, 0.10) → (9.9, 2.6), t = 95–115 s:

| reading | in (left face, x = 6.9 m) | out (right face, x = 9.9 m) |
|---|---|---|
| depth | 0.33 m (the toe's roller reaches it at times) | 1.11 m |
| Q | 1.309 m²/s | 1.304 m²/s |
| momentum flux | 7.18 kN/m | 2.26 kN/m |
| pressure force | 1.23 kN/m | 6.31 kN/m |
| **momentum flux + pressure force** | **8.41 kN/m** (± 0.54) | **8.58 kN/m** (± 0.87) |

F→ on the box = −0.16 kN/m (± 1.0 frame to frame): zero within the
fluctuation of the roller, i.e. under 2% of what crosses each face. The
momentum flux falls by 4.9 kN/m across the jump and the pressure force rises
by 5.1 kN/m to make up for it — the books balance, which is the whole point
of the box. Read the median of a few frames: the roller makes single frames
swing by ±1 kN/m.

**The gate drowned, crest 0.7 m** (after 80 s, then 20 s of means): d₀ =
2.93 m, depth just past the lip 0.96 m, q = 1.17–1.21 m²/s; diagram F→ =
33.5 kN/m, Control volume 33.6 kN/m, ½ρg·(d₀ − a)² = 34.0 kN/m. Drowned, the
½ρg(d₀ − a)² estimate is closer than with the sheet free, but the gate now
also carries a pressure on its downstream face, which the upstream-face
diagram does not include.

**The weir, from the sheet.** Each crest set directly from the established
crest-0 state (t = 30 s), and separately stepped up 0.2 → 1.0 m and back
down (60 s per step); the jump position is where the depth first passes
0.6 m downstream of the gate.

| crest (m) | from crest 0 | stepping up | stepping down (from drowned) |
|---|---|---|---|
| 0.2, 0.3, 0.4 | no jump: the sheet runs up the flap and over it (0.4 held 150 s) | no jump | 0.4: the jump is washed back to the weir and out within ~60 s |
| 0.45 | — | after a jump formed at 0.5 (x ≈ 6.1 m when set): washed out over the weir in ~60 s | — |
| 0.46 | — | after a push to 0.55 (jump at x ≈ 5.5 m when set): stays at x ≈ 5.2–5.9 m for 300 s | — |
| 0.47 | — | after a push to 0.55 (jump at x ≈ 9.2 m when set): x ≈ 8.8 → 7.0 m in 2 min, then on to 5.9 m in another 1.5 min | — |
| 0.48 | — | after a push to 0.55: creeps to x ≈ 5 m, flapping at the gate's foot | — |
| 0.5 | a jump forms at the weir after 10 s to 2 min (four runs: ~10, 25, 60, 120 s), creeps up past x ≈ 7.5 m about a minute later, and ends at the gate's foot (x ≈ 4.8–5.5 m) after ~3 min, d₀ 2.74 m, flickering over the lip | formed after ~25 s, x ≈ 7.7 m 30 s later | the jump at the gate's foot, flapping, d₀ 2.78–2.80 m |
| 0.55 | forms in ~13 s, at the gate in ~55 s, partly drowning it (d₀ 2.81 m) | — | — |
| 0.6 | forms in ~10 s, at the gate in ~35 s: drowned, d₀ 2.86 m, 0.75 m past the lip | from a jump at x ≈ 7.7 m: drowned within 15 s | drowned, d₀ 2.86 m |
| 0.7 | drowned within ~20 s, d₀ 2.93 m | d₀ 2.93 m | — |
| 0.8 | — | d₀ 3.03 m, 1.13 m past the lip | d₀ 3.02 m |
| 1.0 | — | d₀ 3.19 m, 1.45 m past the lip | — |

**What the handle does, and why it is touchy.** Two things are going on.
First, *forming* a jump from the sheet needs the weir to choke a fast flow:
the sheet arrives at the flap 0.26 m deep at 5 m/s, and up to 0.4 m it simply
rides up the ramp and over it. At 0.5 m it is marginal — the water piles up
at the flap, flickers, and sooner or later (10 s to 2 min in four runs) turns
into a jump; at 0.55 m it is quick. That is the lecturer's "once the sheet is
supercritical it doesn't want to go back". Second, once a jump exists, *where
it stands* is set by the depth the weir holds against the depth the sheet
needs to jump to (about 1.1–1.2 m, a little less the further the sheet has
run, because friction thickens and slows it). On this flat 7 m apron that
difference is small, so the jump is close to neutrally balanced and very
sensitive to the crest: 0.45 m washes it out, 0.46 m holds it wherever it
is, 0.47 m lets it creep slowly upstream, 0.48–0.50 m takes it to the gate's
foot, 0.55–0.6 m drowns the gate. Hence the card's recipe — a push to 0.55 m
to form the jump, then 0.46 m once it is halfway — rather than one number. Left at 0.5 m on its own the jump *passes* the halfway point
a minute or two after it forms, which is what one sees standing at the
bench, and then keeps creeping. The hysteresis between forming (≥ 0.5 m) and
washing out (≤ 0.45 m) is real hydraulics, and worth showing.

**Since the previous build.** The pre-filled reach (1.20 m deep from x = 7 m,
crest 0.48 m, so that the jump was established at boot) is gone: at t = 0
only the pool holds water and the crest is 0. The slider now runs down to
0 m: at 0 the flap lies flat, its tip flush with the bed, and the sheet
leaves cleanly (on the 10 Sep code crest 0.05 had flooded the flume and the
slider stopped at 0.10; it does not now). The settle went from 60 s to the
measured 30 s.

What the 10 Sep notes said about the live jump still holds in kind: it is a
violent, breathing roller with air pockets riding on it, and one frame of it
is not a reading.

Three things about the bench were measured into place on the 10 Sep code, not
chosen, and were kept:

- **A weir, not a tailwater level.** With the level pinned on the right edge
  every setting tried ended with the roller on the gate: the reach then
  carried a surface jet over a return flow for its whole length and the
  outlet could not drain it. A weir is a passive critical control and nothing
  argues with the flow.
- **14 m, not 24.** At ×10 the flume would be 24 m long. The reach lost head
  at a rate equivalent to C_f ≈ 0.03 whatever the friction sliders said, and
  over a 17 m reach that backwater alone drowned the gate at every crest.
  (Not re-measured after #72, which changed the reach's resistance.)
- **a = 0.30 m, not 0.43.** At the lab's opening ×10 the sheet was overrun
  within 2 m at every crest. (Not re-measured after #72.)

The on-canvas marker on the left edge reads "reservoir 3.16 m · energy
line": that label is the app's, not the card's, and "energy line" is L7
vocabulary. If a student asks, it is the level of the still reservoir that
feeds the pool.

### Discussion points

- **Where is the pressure hydrostatic?** In the pool, to a centimetre. Just
  upstream of the plate, near the bed, it falls 0.7 m of water short; in the
  opening it has nothing to do with the depth. What is the water doing in
  both places that it is not doing in the pool?
- **Three numbers for one force.** Diagram 28.1, ½ρg(d₀ − a)² 28.7, box
  30.2 kN/m. Which assumption does each one make, and what is the box
  counting that the plate does not feel?
- **Why does the jump not come back?** From the sheet, 0.4 m does nothing
  and 0.5 m only just works; once a jump stands on the apron, 0.45 m loses
  it. What does the sheet need from the weir before a jump can form, and why
  does a little more send it all the way to the gate?
- **What drowning does to the gate.** Raise the crest from 0.6 to 1.0 m: the
  pool climbs from 2.86 to 3.19 m and the force with it, although nothing at
  the gate has moved. Where does the extra force come from?

`rig.js` is the console spot-check — it prints the depth stations, q, the
gate force both ways and p/ρg against the hydrostatic value from the same
entry points the strip uses, and `HJ2.weir(h)` walks the crest.

**Weir default 0.5 m, slider 0–0.6 m (2026-10-17).** At the lecturer's
request the weir starts at 0.5 m and the slider stops at 0.6 m (drowned-ish),
for finer control in the useful range. Measured at Medium from t = 0: the
jump forms near the weir (x ≈ 7.5 m) by t ≈ 20 s and reaches the gate's foot
by t ≈ 40 s. The crest-0 numbers above (sheet, gate force) were measured with
the weir flat; set the slider to 0 to reproduce them.
