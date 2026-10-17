# FF-4 · Boundary layers: at a wall, in a jet

A header drives water through a straight pipe that discharges a jet into a
large tank of still water. One scene, both kinds of boundary layer: inside
the pipe the layer grows against a wall (no slip); past the exit the jet
meets still water and two free shear layers form, roll up into eddies,
entrain the still water and spread. Live the jet flaps; averaged it is a
smooth spreading jet with a bell-shaped profile.

An exercise students play with on their own; the lecturer can also show it in class. No personalised parameter, nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FF-4**, or use the direct link
[`?ex=FF-4`](https://barneydobson.github.io/hydraulician/?ex=FF-4).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

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
| domain | 30 m × 6 m, Resolution Medium: 689 × 138 cells, Δx = 44 mm |
| header | x = 0 → 2.2 m, head held at **6.60 m** (head-driven control, whole compartment) |
| pipe | bore 0.5 m (z = 2.90–3.40 m, axis 3.15 m), x = 2.5 → 10.5 m (16 D), rounded (bellmouth) entrance |
| tank | full to its lid at z = 6 m, floor z = 0.3 m: 5.7 D clear of the jet axis above and below |
| outflow | the right edge, 19.5 m (39 D) past the exit, held at a head of **6.20 m** (a submerged tailwater, sponge 2 m) behind a 6 m absorbing layer that damps the eddies before they reach it |

The driving head is 0.40 m; the pipe carries **q ≈ 0.78–0.80 m²/s** (mean
velocity ~1.6 m/s, centreline 2.2–2.5 m/s). *Reservoir level* is
the header head and is the one value offered on the card: raise it and the jet runs
faster; it is on the card. There is no Geometry slider: nothing about the
pipe needs morphing to make the two points.

**Why the tank is full (no free surface).** Two free-surface versions were
built and measured first. With a tailwater on a free surface, this tank —
which carries almost no through-flow — grew an inflowing surface current at
the outflow edge (−1 m/s at 2.6 s, −8 m/s by 11 s) that filled the tank to
the lid and drove the pipe backwards; the tailwater's sponge keeps the
stress-free surface treatment, which runs away over still water. With an
overflow weir at the far end it was stable, but the jet hit the weir face
within ~10 s and the tank filled with one big eddy. A full tank with a
submerged outflow (as the venturi scene) lets the jet leave through the edge
instead of turning on a far wall.

## What to do

1. **The wall boundary layer.** Rakes at x ≈ 3.5 m and x ≈ 10 m, inside the
   pipe. Same q, different shape: the profile near the exit is rounder and
   faster on the axis.
2. **The edges of the jet.** On Speed, the jet's two edges — where fast
   water meets still water — leave the lips sharp and roll up into eddies a
   few metres past the exit. (Pressure head is the card's other colouring:
   in this full tank it mostly grows with depth.)
3. **Live against Average.** Place two more rakes across the jet at x ≈ 12 and
   14 m (each new rake replaces the oldest). Switch the colour bar from Live
   to **Average** and wait until T passes 30 s: two bells, the downstream one wider and lower.
4. **Entrainment.** Two short Flux lines across the jet only — z = 2.4–3.9 m
   at x = 12 m, z = 2.15–4.15 m at x = 14 m. Averaged, q through the jet
   grows downstream.

The card's settle is about **20 s**: the pipe flux is established by ~15 s.

## For the instructor

Measured headless at Medium (`rig.js` reproduces it); profiles are u in m/s
from the lower wall up, the pipe at 44 mm steps, the jet at 0.25 m steps
from z = 1.90 m (x = 12 m) and 1.40 m (x = 14 m):

| reading | live | averaged (T = 60 s) |
|---|---|---|
| pipe, x = 3.5 m | 0.51 1.37 1.92 2.13 2.17 2.17 2.17 2.13 1.93 1.40 0.52 | centreline 2.14 |
| pipe, x = 10 m | 0.42 1.17 1.76 2.18 2.42 2.51 2.43 2.18 1.77 1.18 0.43 | centreline 2.46 |
| jet, x = 12 m | a thin core, 2.3 peak, barely moving | bell, 1.37 peak on the axis |
| jet, x = 14 m | the core wanders ~0.25 m, its peak 1.7–2.0 m/s | wider bell, 0.78 peak |
| q, pipe at x = 10 m | 0.78–0.80 m²/s | 0.78 |
| q, jet only at x = 12 m | 0.88–0.92 | 1.07 (+37%) |
| q, jet only at x = 14 m | 0.8–2.0, as eddies cross it | 1.15 (+47%) |
| q out of the right edge | 0.79–0.82, never any inflow | 0.79, every cell outward |

**What does not work as well as the brief hoped.**

- **This is 2-D turbulence.** In a plane, eddies merge into ever larger ones
  instead of breaking down, so beyond ~x = 16 m the live tank is filled with
  a few tank-sized vortices and the averaged far field needs minutes, not
  seconds, to converge — after 60 s it is still lumpy. Use the near jet
  (x = 11–15 m) for the bells and the entrainment; the averaged x = 14 m bell
  is slightly lopsided after a 60 s window (its peak a quarter-metre under
  the axis, a long tail above it, and a slow return flow under it).
- **The viscosity is an eddy viscosity.** The scene sets ν = 2·10⁻³ m²/s
  (Re = VD/ν ≈ 400) and switches the open-channel mixing length off. At
  water's viscosity the jet broke up at the lip into eddies that throttled
  the pipe itself (q fell from 0.90 to 0.41 m²/s and recovered over ~20 s);
  at 5·10⁻³ it was laminar and steady (Live identical to Average). With the
  mixing length on, the jet left as a smooth laminar blob — its length scale
  is the distance to the nearest *wall*, metres from a free shear layer. So
  what the class sees is a moderate-Reynolds-number jet: a clean core that
  starts to flap ~4 m past the exit and breaks up by ~6 m, which is the
  laminar–turbulent picture of a real jet, not its Reynolds number.
- **The pipe flow is not fully developed.** 16 D of pipe at this viscosity
  takes the profile from a plug to a rounded one, not to the final shape;
  that is the point being made (development), but do not call the exit
  profile "fully developed".
- **The outflow edge has an absorbing layer.** The right edge is a fixed
  head (a pressure outlet), and a pressure outlet passes whatever velocity
  reaches it — inflow too. Without help, the tank-sized eddies parked on the
  edge: live it took water IN over part of its height in 12 of 16 samples
  (up to 0.45 m²/s in, against ~1.2 out), and a 60 s average went out by
  the floor (0.57 m/s) and the lid (0.44) and IN through the middle
  (from z ≈ 3 to 5 m, −0.22 m/s at its strongest), which is what the class saw. The net was
  always right (0.75 out against 0.75 down the pipe); it was the picture
  that was wrong. The scene now raises the viscosity smoothly over the last
  6 m before the edge (to +0.5 m²/s at the edge itself), which diffuses the
  eddies away before they arrive: the edge passes a smooth bell over its
  whole height (≈0.2 m/s in the middle, falling to 0 at floor and lid), and
  never once took water in, live or averaged. Over x ≈ 24–30 m the eddies
  therefore fade — that is the layer, not physics; read the jet upstream of
  it. The averaged jet bells (x = 12 and 14 m) are unchanged by it to within
  0.02 m/s; the averaged pipe q rose from 0.75 to 0.78 m²/s (the backflow at
  the edge had been costing the pipe some head), and it now holds at
  0.78–0.80 m²/s throughout instead of drifting down.

### Discussion points

- One scene, two boundary layers: against a wall the velocity goes to zero;
  against still water it goes to the water's (zero) velocity, but there is
  no wall to hold it — the layer is free to roll up.
- The flux through the jet grows: where does the extra water come from?
- The mean is smooth and symmetric(ish); no single frame looks like it.
  Engineers design for the mean, and for the fluctuation's size.

`rig.js` is the console spot-check.
