# HJ-2 · Sluice gate with the movable weir

The flume lab at full scale: the first-year teaching flume, several times its
size. A deep pool stands behind a sluice gate open 0.30 m; a fast sheet shoots
out under it, supercritical, and jumps back to the depth a weir holds at the
far end of the flume. Subcritical, supercritical, subcritical, in one view —
and the weir crest is the lab's operating handle: it moves the jump along the
apron, sweeps it out altogether, or drowns the gate so that the pool climbs
and the sheet is gone.

In the momentum lecture (L6, slides 10–11) it is the demo for **pressure is
hydrostatic only where streamlines are straight**: the card opens on the
Pressure head colouring, which grows as ρgd in the pool and falls well short
of it under the gate, where the water curves and accelerates; and the force
on the gate is read two ways, off the pressure diagram and off a control
volume round the gate, against the "gate as a wall" estimate.

Everything the lab sheet asks for is on screen as well: depth at ten
stations (hover, or drop gauges), the discharge (a Flux section), the energy
head along the flume (the grade lines), the head loss across the jump (the
drop in the EGL and the jump box's ΔE), and — from the companion lab on the
gate itself — the pressure diagram on the gate and the force it integrates
to, read two ways.

This is a **lecturer demo**: there is no personalised parameter and nothing
to pool. (Ported from the 10 Sep build of the lab demo, which first carried
the title "Sluice gate and hydraulic jump: the flume lab at full scale".)

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HJ-2**, or use the direct link
[`?ex=HJ-2`](https://barneydobson.github.io/hydraulician/?ex=HJ-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Under the gate, energy is conserved from the pool to the vena contracta and
the discharge follows from the pool depth d₀ and the opening a:

    q = C_d · a · √(2·g·d₀)             C_d ≈ 0.55–0.6 for a sharp-edged vertical gate
    d_c = (q²/g)^⅓                      the same all along the flume, q being constant

Across the jump, momentum is conserved and energy is not:

    d₂/d₁ = ½·(√(1 + 8·Fr₁²) − 1)      ΔE = (d₂ − d₁)³ / (4·d₁·d₂)

The weir at the far end is a critical control: the reach it holds runs about
`crest + 1.5·d_c` deep, and that depth is what the jump has to reach. On the
gate, the pressure is hydrostatic from the surface down most of the plate and
falls to zero at the lip, where the water is already moving; integrated it is
close to ½ρg·(d₀ − a)², the "gate as a wall" estimate. The momentum theorem
on a box from the pool to the vena contracta gives the same force without
assuming anything about the pressure on the plate:

    F_gate = ½ρg·d₀² − ½ρg·d₁² − ρq·(V₁ − V₀)

The bed's top face is at **z = 0.30 m** above the datum; depths below are
depths over the bed, and the slider levels on the Controls panel are
elevations above the datum — the panel prints both.

## The bench

| item | where |
|---|---|
| bed | flat, top face z = 0.30 m, from the inlet to x = 12.5 m |
| pool | x = 0 → 4.0 m, starts 2.85 m deep and settles at 2.77 m, fed through the reservoir boundary at q ≈ 1.3 m²/s |
| gate | x = 4.0 m, opening a = 0.30 m (**Gate opening** slider, Controls → Geometry) |
| weir | the flume's flap: a 1.3 m plate hinged on its upstream foot at x = 11.0 m and leaning downstream, its tip 0.48 m above the bed as the card opens (**Weir crest height** — the slider on the card, and in Controls → Geometry — 0.10 → 1.00 m) |
| overfall | the bed ends at 12.5 m and the nappe leaves through the open floor |

Roughly the lab flume at ×7–10: the lab's 43 mm gate under a 0.275 m pool
passes 5.85 l/s down a 0.104 m flume (q = 0.056 m²/s) with the jump about
0.7 m downstream.

## What to do

1. Let it settle — about **60 s**; the card counts it down. The pool is
   still within 30 s; the jump is an aerated, breathing roller with air
   pockets riding on it, and one frame of it is not a reading. Before
   reading anything downstream of the gate press **A** (Average): the water
   you see is then the running mean and so is every readout — depths, grade
   lines, rakes. Press `A` twice to restart the window after moving the weir.
2. **Pressure head.** The card opens on Pressure head (p/ρg). In the pool the
   colour follows the depth below the surface; close to the gate and under
   it, it does not. Hover with the cursor card: 0.1 m upstream of the plate
   and 5 cm above the bed p/ρg is about **2.0 m** where the depth below the
   surface is 2.7 m; in the opening itself it is about 1.4 m in a jet 0.28 m
   deep. Streamlines curve there, so the pressure is not hydrostatic.
3. **The force on the gate.** Pick the Pressure force tool on the strip and
   click the gate's upstream face: the pressure diagram and its resultant,
   about **29 kN/m**. Compare ½ρg·(d₀ − a)² = 29.8 kN/m from the pool gauge.
   Then drag a Control volume (`9`) from (2.50, 0.10) to (6.00, 3.70) and
   read F→ from the momentum theorem: about 31 kN/m.
4. **Ten depths.** Hover the flume and read `depth d` off the cursor card at
   ten stations — two in the pool, four on the sheet and through the jump,
   four in the reach the weir holds. Or drop Gauges (`5`) at x = 2.5 m and
   x = 10 m and read their cards.
5. **The discharge.** Pick the Flux tool on the strip and drag a vertical
   section through the sheet at x ≈ 6 m; drag a second one through the reach
   at x ≈ 10 m. Both read q, and the depth and velocity that carry it.
6. **Energy.** Switch the field to Energy head (`L`, or the legend). The
   grade lines are on: the EGL rides over the pool, dips as the sheet gains
   speed, and drops through the jump. Read the drop against
   (d₂ − d₁)³/4d₁d₂ from your own two depths. (The open-channel overlay with
   its d_c line and jump box is off for this card; `N` brings it back.)
7. **The handle.** Move **Weir crest height** on the card in small steps,
   waiting about 40 s each. At 0.46 the jump leaves the gate and stands on
   the apron; at 0.44 it is at the far end; at 0.42 it is swept over the
   weir and the sheet runs the whole flume. Now raise it again: nothing
   happens until about 0.60, when the jump comes back all at once, runs up
   to the gate and drowns it — the pool climbs, the reservoir marker on the
   left edge is left behind, and the gate force grows. Ask the class which
   of the depths on the gate's two faces changed.

## For the instructor

Measured on Resolution Medium (592 × 161 cells, Δx = 24 mm) with the
headless probe behind `rig.js`, on the code after the stress-free surface
(#72), weir at its shipped 0.48 m, means of 1 s samples over t = 100–140 s:

| reading | value |
|---|---|
| pool depth at x = 2.5 m | 2.77 m (± 0.00) |
| q, read in the reach / on the sheet | 1.31 m²/s (± 0.03) / 1.32 (± 0.10) |
| d_c | 0.56 m |
| depth at x = 4.3 / 5.0 / 6.0 m (the jump at the gate's foot) | 0.28 / 0.41 / 0.88 m (± 0.09 / 0.20 / 0.11) |
| depth in the reach, x = 7 / 8 / 10 / 10.5 m | 1.05 / 1.12 / 1.16 / 1.17 m (± 0.02) |
| gate, upstream face, F→ (Pressure force tool) | 29.3 kN/m (± 0.3), centre of pressure z = 1.45 m |
| ½ρg·(d₀ − a)² | 29.8 kN/m |
| Control volume (2.50, 0.10) → (6.00, 3.70), F→ | 30.9 kN/m (± 1.5 live, the jump being inside the box's right face); 31.1 (± 0.05) with the sheet clear of it |
| C_d from the pool and the reach q | 0.59 |
| p/ρg 0.1 m upstream of the plate, 0.05 / 0.15 / 0.25 m above the bed | 2.03 / 1.93 / 1.93 m against 2.72 / 2.62 / 2.52 m hydrostatic |
| p/ρg in the pool at x = 2.5 m, same heights | 2.73 / 2.62 / 2.52 m — hydrostatic to 1 cm |

The box reads 5% above the diagram because it also carries the bed's shear
over 3.5 m and the momentum of the pool's approach flow; the diagram reads 2%
under ½ρg·(d₀ − a)² because the pressure has already started to fall near
the lip.

**The weir, step by step** (each held 40 s, then 20 s of means):

| crest (m) | state | d at 5 / 8 / 10 m | pool d₀ | gate F→ (kN/m) |
|---|---|---|---|---|
| 0.48 (boot) | jump at the gate's foot, flapping | 0.41 / 1.12 / 1.16 | 2.77 | 29.3 |
| 0.46 (down) | free jump on the apron, x ≈ 6–8 m | 0.21 / 1.02 / 1.13 | 2.74 | 29.0 |
| 0.44 (down) | jump at the far end, x ≈ 9 m | 0.20 / 0.29 / 1.03 | 2.74 | 28.9 |
| 0.42 and below | swept out: sheet at 0.20–0.24 m to the weir and over it | 0.20 / 0.22 / 0.24 | 2.74 | 28.9 |
| 0.40, 0.50 (up, from swept out) | still swept out | 0.21 / 0.23 / 0.24 | 2.72 | 28.0 |
| 0.60 | gate drowned, d = 0.72 m just past the lip | 0.95 / 1.21 / 1.25 | 2.82 | 30.7 |
| 0.70 | drowned | 1.05 / 1.32 / 1.36 | 2.93 | 33.5 |
| 0.80 | drowned | 1.16 / 1.42 / 1.46 | 3.02 | 35.7 |
| 1.00 | drowned | 1.40 / 1.63 / 1.66 | 3.19 | 40.6 |
| 0.50 (down, from drowned) | jump at the gate's foot, flapping | 0.51 / 1.14 / 1.18 | 2.78 | 29.5 |

**What changed since the 10 Sep build, and why the handle now has a
hysteresis.** On the 10 Sep code the jet left the gate with about 70% of its
ideal momentum and a slow, aerated layer rode on it; the column-mean Froude
number was 1.4–1.5 at the gate's foot and the weir at 0.20 m held a jump at
x ≈ 6–9 m. The stress-free surface (#72) removed the drag the void used to
put on the top of the sheet. The jet now keeps its momentum — 6.4–6.9 m/s,
d₁ ≈ 0.20 m, Fr₁ ≈ 4.5–4.7 on the column mean, the lab's number, and C_d comes
out at the textbook 0.59 instead of 0.48–0.54 — so its conjugate depth is
about 1.2 m and the weir has to hold that. At 0.20 m it held no jump at all:
the sheet ran supercritical up the flap, which leans downstream and acts as
a ramp, and over it. A supercritical sheet carrying E ≈ 2.4 m passes an
obstacle up to E − 1.5·d_c ≈ 1.5 m, so once swept out it stays swept out
until the reach is forced subcritical from downstream — about 0.60 m on this
flap — and then the jump has nowhere to stand but on the gate. That is real
hydraulics (the hysteresis of a jump between a gate and a weir), and worth
showing, but it makes the handle sensitive: the free-jump band is
0.44–0.48 m when coming down from the boot state. The default crest went from
0.20 to 0.48 and the reach now starts 1.2 m deep from x = 7 m so that the
jump is established at boot; everything else on the bench is the 10 Sep
build.

What the 10 Sep notes said about the live jump still holds in kind: it is a
violent, breathing roller with air pockets riding on it, the orange jump box
(with the overlay on, `N`) flickers, and the time-averaged flow is the
textbook picture, which is why the brief asks for Average before any reading
downstream of the gate.

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

The `settle` on the card is for the pool and the mean of the reach; the jump
region itself never meets the pack's 3% criterion, because it breathes.

### Discussion points

- **Where is the pressure hydrostatic?** In the pool and in the reach, to a
  centimetre. Upstream of the plate it falls 0.7 m short; in the opening the
  jet's pressure has nothing to do with its depth. What is the water doing
  in both places that it is not doing in the pool?
- **Three numbers for one force.** Diagram 29.3, ½ρg(d₀ − a)² 29.8, box
  30.9 kN/m. Which assumption does each one make, and what is the box
  counting that the plate does not feel?
- **Why does the jump not come back?** Lower the crest from 0.48 to 0.42 and
  back up to 0.50: the flume is not where it was. What does the sheet need
  from the weir before a jump can form, and why does it then go all the way
  to the gate?
- **Where did the energy go?** The EGL over the pool and the EGL in the reach
  differ by more than the jump's ΔE: the gate itself, the aerated roller and
  the bed all take some. Have the class apportion it from their ten depths.

`rig.js` is the console spot-check — it prints the ten-station table, the
jump box and the gate force from the same entry points the strip uses, and
`HJ2.weir(h)` walks the crest.
