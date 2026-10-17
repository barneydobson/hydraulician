# FF-4 · Boundary layers: at a wall, in a jet

A header drives water through a straight pipe that discharges a jet into a
large reservoir of still water with a free surface; the reservoir spills over
a wall at its far end. One scene, both kinds of boundary layer: inside the
pipe the layer grows against a wall (no slip); past the exit the jet meets
still water and two free shear layers form, roll up into eddies, entrain the
still water and spread. Live the jet flaps; averaged it is a smooth spreading
jet with a bell-shaped profile.

An exercise students play with on their own; the lecturer can also show it in class. No personalised parameter, nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FF-4**, or use the direct link
[`?ex=FF-4`](https://barneydobson.github.io/hydraulician/?ex=FF-4).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

- **Wall boundary layer.** At a wall u = 0 (no slip). Near the entrance the
  pipe carries a nearly uniform plug with thin slow layers at both walls;
  downstream the layers thicken, the wall slows more of the flow and, since
  q is the same at every section, the centreline speeds up. A rake shows the
  profile going from flat-topped to rounded.
- **Free shear layer.** Past the exit there is no wall: the fast jet slides
  past still water. The velocity jump is smoothed out over a layer that
  grows downstream; it is unstable, rolls up into eddies, and those eddies
  drag still water into the jet (**entrainment**). The jet widens and its
  centreline slows, while the flux through the jet grows.
- **Turbulence.** u = ū + u′. Live, the jet flaps and a rake across it
  jumps about; under Average the mean jet is smooth and the profile a bell,
  wider and lower downstream.

## The bench

| item | where |
|---|---|
| domain | 27 m × 7 m, Resolution Medium: 605 × 157 cells, Δx = 45 mm |
| header | x = 0 → 2.2 m, head held at **6.60 m** (head-driven control, whole compartment; its surface shows at the left) |
| pipe | bore 0.5 m (z = 2.90–3.40 m, axis 3.15 m), x = 2.5 → 10.5 m (16 D), rounded (bellmouth) entrance |
| reservoir | floor z = 0.3 m, free surface at **6.15–6.25 m**: 2.85 m under the jet axis, ~3 m over it |
| end wall | at x = 24 m, 13.5 m (27 D) past the exit; its top is a 3 m broad crest at z = 5.55 m, and the water leaves over it through a brink at the right edge |

The driving head is the header level less the reservoir's, about 0.40 m; the
pipe carries **q ≈ 0.80–0.82 m²/s** (mean velocity ~1.6 m/s, centreline
2.2–2.5 m/s), and the same q leaves over the crest. Nothing holds the
reservoir level but the crest: more water in raises it until the crest
passes it. *Reservoir level* is the header head and is the one value
offered on the card: raise it and the jet runs faster (at 7.0 m the pipe
carries 1.10 m²/s and the reservoir stands at 6.35 m). There is no Geometry
slider: nothing about the pipe needs morphing to make the two points.

## What to do

1. **The wall boundary layer.** Rakes at x ≈ 3.5 m and x ≈ 10 m, inside the
   pipe. Same q, different shape: the profile near the exit is rounder and
   faster on the axis.
2. **The edges of the jet.** On Speed, the jet's two edges — where fast
   water meets still water — leave the lips sharp, start to flap a metre or
   two past the exit and roll up into eddies by x ≈ 14–15 m; the eddies
   reach the free surface and dimple it. (Pressure, in kPa, is the card's other
   colouring: under the free surface it mostly grows with depth.)
3. **Live against Average.** Place two more rakes across the jet at x ≈ 12 and
   14 m (each new rake replaces the oldest). Switch the colour bar from Live
   to **Average** and wait until T passes 30 s: two bells, the downstream one wider and lower.
4. **Entrainment.** Two short Flux lines across the jet only — z = 2.4–3.9 m
   at x = 12 m, z = 2.15–4.15 m at x = 14 m. Averaged, q through the jet
   grows downstream. A third over the crest (x ≈ 25 m, from the crest up
   through the surface) reads what the pipe delivers: the extra water in the
   jet is the reservoir's own, going round.

The card's settle is about **20 s**: the pipe flux is established by ~10 s,
and the reservoir level never leaves 6.15–6.25 m.

## For the instructor

Measured headless at Medium (`rig.js` reproduces it); profiles are u in m/s
from the lower wall up, the pipe at 45 mm steps from z = 2.92 m, the jet at
0.25 m steps from z = 1.90 m (x = 12 m) and 1.40 m (x = 14 m):

| reading | live (t = 10–40 s) | averaged (T = 60 s, from t = 41 s) |
|---|---|---|
| pipe, x = 3.5 m | 0.51 1.37 1.94 2.17 2.20 2.17 2.15 2.10 1.91 1.37 0.51 | centreline 2.17 |
| pipe, x = 10 m | 0.43 1.19 1.78 2.19 2.43 2.50 2.42 2.17 1.76 1.17 0.42 | centreline 2.47 |
| jet, x = 12 m | a thin core, 2.3 peak, 0.25 m wide, flapping | bell, 1.28 peak on the axis |
| jet, x = 14 m | the core is gone: eddies, peaks ~1 m/s up to 0.5 m off the axis | wider bell, 0.78 peak on the axis |
| q, pipe at x = 10 m | 0.79–0.83 m²/s | 0.80 |
| q, jet only at x = 12 m | 0.72–1.24 | 1.07 (+33%) |
| q, jet only at x = 14 m | 1.0–2.7, as eddies cross it | 1.19 (+48%; 1.0–1.2 as T runs from 30 to 60 s) |
| q, over the crest at x = 25 m | 0.77–0.90 | 0.82 |
| reservoir level | 6.15–6.25 m everywhere, dimpled over the eddies | — |
| u just under the surface | ±0.3–1.6 m/s as eddies pass | −0.2 to −0.3 over x = 12–16 m (back towards the pipe), +0.2–0.3 at 18–20 m, +0.55 at the crest |

The averaged bells, in full: x = 12 m −0.18 −0.18 −0.09 0.16 0.62 **1.28**
1.23 0.74 0.36 0.30 0.18; x = 14 m −0.37 −0.33 −0.19 0.06 0.31 0.58 0.73
**0.78** 0.73 0.68 0.62 0.52 0.32 0.09 −0.05. The x = 14 m bell carries a
longer tail above the axis than below, and a slow return flow under it.

**Why an end wall and an outfall, and what it cost.** The first version
was a lidded full tank whose right edge was a submerged outflow behind an
absorbing layer. The free surface was tried several ways, all measured:

- *A tailwater on a free surface, inflow allowed:* a surface current ran in
  from the edge (−1 m/s at 2.6 s, −8 m/s by 11 s), filled the tank and drove
  the pipe backwards. With the tailwater set to pass outflow only it holds
  (level 6.14–6.23 m, q 0.77–0.81), but it has no end wall to see, and the
  eddies still circulate inside its sponge at up to 0.9 m/s.
- *This end wall with a plain open edge behind the crest:* the crest passed
  too little water, the reservoir rose to 6.39 m, the pipe fell to
  0.50 m²/s and took ~45 s to recover. An **outfall** edge — the brink at
  the end of the crest — passes the flow at once: that is what ships.
- *An early overflow weir in a 14 m tank:* the jet struck its face within
  ~10 s and one eddy filled the tank. At 27 D the end wall is far enough
  away that the jet has broken up into eddies before it gets there.

The cost: everything the jet drives now stays in a closed reservoir — only
q leaves over the crest — so the far field is livelier than the lidded
tank's, and its eddies come back and nudge the jet. The clean core is
~1.5 m long (it was ~4 m in the lidded tank) and the break-up comes ~2 m
earlier. Averaged, the surface drifts slowly back towards the pipe over the
near jet (the entrained water's return) and on to the crest beyond. That is
the reservoir's own circulation, not a current from a boundary: nothing
flows in anywhere on the right, and the pipe q does not move.

**What does not work as well as the brief hoped.**

- **This is 2-D turbulence.** In a plane, eddies merge into ever larger ones
  instead of breaking down (there is no vortex stretching), so beyond
  ~x = 16 m the live reservoir is filled with a few reservoir-sized vortices
  and the averaged far field needs minutes, not seconds, to converge — after
  60 s it is still lumpy. Use the near jet (x = 11–15 m) for the bells and
  the entrainment; the x = 14 m jet flux still moves by ±10% between T = 30
  and 60 s.
- **The viscosity is an eddy viscosity, and lowering it does not help.** The
  scene sets ν = 2·10⁻³ m²/s (Re = VD/ν ≈ 400) and switches the
  open-channel mixing length off (its length scale is the distance to the
  nearest *wall*, metres from a free shear layer; with it on the jet left
  as a smooth laminar blob). Swept again, all runs stable:

  | ν (m²/s) | Re | pipe q (m²/s) | lidded tank: clean core, then | this reservoir |
  |---|---|---|---|---|
  | 2·10⁻³ | ~400 | 0.79–0.81 | ~4 m, flaps, eddies by ~6 m | ~1.5 m, eddies by ~4 m; 60 s bells clean |
  | 1·10⁻³ | ~900 | 0.83–0.89 | ~1.5 m, eddies by ~4.5 m | flaps at the lip; the reservoir a churn; 60 s bells lopsided |
  | 5·10⁻⁴ | ~1900 | 0.95 | ~1.5 m, eddies by ~3.5 m | — |
  | 2·10⁻⁴ | ~5000 | 0.99 | flaps from the lip | — |
  | 10⁻⁶ (water) | ~10⁶ | 1.02 | flaps from the lip, like 2·10⁻⁴ | — |

  The throttling recorded on an earlier version (q falling from 0.90 to
  0.41 m²/s at low ν) did not recur in any of these runs: q *rises* as the
  wall friction falls. But below ~5·10⁻⁴ the
  model's own sub-grid viscosity (Smagorinsky, (c_s Δx)²|S|) is the larger
  one in the shear layers, so 2·10⁻⁴ and water look alike; and a lower ν
  in 2-D gives fewer, bigger vortices, not finer turbulence. 2·10⁻³ is the
  lowest value at which the class still sees all three stages — a clean
  core, its roll-up, the break-up — and a bell after a one-minute average.
  What the class sees is a moderate-Reynolds-number jet: the laminar–
  turbulent picture of a real jet, not its Reynolds number.
- **The pipe flow is not fully developed.** 16 D of pipe at this viscosity
  takes the profile from a plug to a rounded one, not to the final shape;
  that is the point being made (development), but do not call the exit
  profile "fully developed".

### Discussion points

- One scene, two boundary layers: against a wall the velocity goes to zero;
  against still water it goes to the water's (zero) velocity, but there is
  no wall to hold it — the layer is free to roll up.
- The flux through the jet grows: where does the extra water come from?
  The crest passes only what the pipe delivers, so it is the reservoir's
  own water, going round.
- The mean is smooth and symmetric(ish); no single frame looks like it.
  Engineers design for the mean, and for the fluctuation's size.

`rig.js` is the console spot-check.
