# HJ-2 · Pressure and force on a sluice gate

The flume lab at full scale: the first-year teaching flume, several times its
size. A deep pool stands behind a sluice gate open 0.30 m, and at t = 0 that
is the only water there is — the flume below the gate is empty and the flap
weir at its far end lies flat. Released, the water shoots out under the gate
as a fast, thin sheet and runs off the end. The weir crest is the lab's
operating handle: raised, it makes the sheet jump up to a slow, deep flow,
moves that jump along the apron, and finally drowns the gate so that the pool
climbs and the sheet is gone.

In the momentum lecture (L6, slides 10–11) it is the demo for **pressure is
hydrostatic only where streamlines are straight**: the Pressure force tool on
the gate draws the pressure diagram, which grows as ρgz near the surface and
falls to zero at the lip, where the water curves and accelerates under the
gate; and the force on the gate is read two ways, off the pressure diagram
and off a control volume round the gate, against the "gate as a wall"
estimate ½ρg(d₀ − a)².

The card offers what the class has met by L6: the Water, Speed and Froude
number colourings (Froude in plain words — above 1 fast and shallow, below 1
slow and deep; kept on the lecturer's decision), the Pressure force tool, a
Control volume, a Flux line for q and a Gauge reading depth. No heads, no
grade lines, no jump box: the hydraulic jump is described, not analysed — it
is not Year 1 theory. (Ported from the 10 Sep build of the lab demo, which
first carried the title "Sluice gate and hydraulic jump: the flume lab at full
scale", and later "Sluice gate with the movable weir".)

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HJ-2**, or use the direct link
[`?ex=HJ-2`](https://barneydobson.github.io/hydraulician/?ex=HJ-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Under the gate, energy is conserved from the pool to the vena contracta and
the discharge follows from the pool depth d₀ and the opening a:

    q = C_d · a · √(2·g·d₀)             C_d ≈ 0.55–0.6 for a sharp-edged vertical gate

On the gate, the pressure is hydrostatic from the surface down most of the
plate and falls to zero at the lip, where the water is already moving;
integrated it is close to ½ρg·(d₀ − a)², the "gate as a wall" estimate. The
momentum theorem on a box from the pool to the vena contracta gives the same
force without assuming anything about the pressure on the plate:

    F_gate = ½ρg·d₀² − ½ρg·d₁² − ρq·(V₁ − V₀)

For the instructor only (not on the card, not Year 1 theory): across the
jump, momentum is conserved and energy is not,
d₂/d₁ = ½·(√(1 + 8·Fr₁²) − 1). With d₁ ≈ 0.20 m and Fr₁ ≈ 4.5 the conjugate
depth is about 1.2 m, and the weir has to hold that.

The bed's top face is at **z = 0.30 m** above the datum; depths below are
depths over the bed.

## The bench

| item | where |
|---|---|
| bed | flat, top face z = 0.30 m, from the inlet to x = 12.5 m |
| pool | x = 0 → 4.0 m, starts 2.85 m deep and settles at 2.72 m, fed through the reservoir boundary at q ≈ 1.3 m²/s; the only water at t = 0 |
| gate | x = 4.0 m, opening a = 0.30 m |
| weir | the flume's flap: a 1.3 m plate hinged on its upstream foot at x = 11.0 m and leaning downstream; its tip is the crest (**Weir crest height** — the slider on the card, 0 → 1.00 m). At 0 m it lies flat, flush with the bed |
| overfall | the bed ends at 12.5 m and the water leaves through the open floor |

Roughly the lab flume at ×7–10: the lab's 43 mm gate under a 0.275 m pool
passes 5.85 l/s down a 0.104 m flume (q = 0.056 m²/s) with the jump about
0.7 m downstream.

## What to do

1. Let it settle — about **30 s**; the card counts it down. The water rushes
   under the gate and down the empty flume as a sheet about 0.2 m deep at
   6 m/s, and pours off the end; the pool has settled by then.
2. **The pressure on the gate.** Drop a Gauge (`5`) in the pool at x = 2.5 m:
   it reads d₀ ≈ 2.72 m. Pick the Pressure force tool on the strip and click
   the gate's upstream face: the pressure diagram grows with depth near the
   surface and falls away to zero at the lip. Its resultant is about
   **28 kN/m**; compare ½ρg·(d₀ − a)² = 28.7 kN/m. Streamlines curve under
   the gate, so the pressure there is not hydrostatic.
3. **The same force by momentum.** Drag a Control volume (`9`) from
   (2.50, 0.10) to (6.00, 3.70) and read F→: about 30 kN/m.
4. **The discharge.** Drag a Flux line (`8`) up through the sheet at x = 6 m:
   q ≈ 1.30 m²/s.
5. **The handle.** Raise **Weir crest height** on the card. Up to 0.4 m the
   sheet just runs up the flap and over it — it does not want to go back.
   Give it a push to 0.55 m: within about 15 s the water piles up at the weir
   and the fast thin sheet suddenly jumps up to a slow, deep flow, which then
   creeps up the flume. When it is about halfway (x ≈ 7–8 m, some 30 s after
   the push) bring the crest back to 0.46 m: the jump stays about where it
   is. Raise it again: at 0.5 m
   it creeps to the foot of the gate within a few minutes; at 0.6 m and
   above it reaches the gate in about half a minute and drowns it — the pool
   climbs, the reservoir marker on the left edge is left behind, and the gate
   force grows (≈ 33.5 kN/m at 0.7 m). Ask the class which of the depths on
   the gate's two faces changed.

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

The box reads 5% above the diagram because it also carries the bed's shear
over 3.5 m and the momentum of the pool's approach flow; the diagram reads 2%
under ½ρg·(d₀ − a)² because the pressure has already started to fall near
the lip.

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
