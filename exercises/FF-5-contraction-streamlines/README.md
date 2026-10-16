# FF-5 · The contraction rig: streamlines

Two reservoirs held at fixed levels are joined by a 1.00 m pipe that
contracts into a 0.50 m pipe discharging into the right-hand reservoir. One
slider, **Contraction length L**, takes the contraction from a long gentle
taper (L = 3 m) through ever shorter, steeper tapers to an abrupt step
(L = 0). With the taper the streamlines converge smoothly and the flow
follows the walls; with the step the flow cannot turn the corner: it
separates, leaves a slow eddy in each corner and necks down just past the
edge into a **vena contracta** before it spreads to fill the narrow pipe.

This is the first of three uses of the same scene: VC-1 asks it about
continuity and MM-2 about forces.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FF-5**, or use the direct link
[`?ex=FF-5`](https://barneydobson.github.io/hydraulician/?ex=FF-5).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A streamline is everywhere tangent to the velocity; in steady flow it is
also the path a particle takes. Where streamlines converge the flow speeds up
(continuity); where they are curved there is a pressure gradient across them
pushing the water round the bend. A fluid particle can follow a wall round a
gentle convergence, because the pressure rises only slightly ahead of it. At
a sharp corner it would need an infinite pressure gradient to turn, so the
flow separates: the streamline leaving the corner bounds a slow recirculating
eddy, and the through-flow keeps converging for a short distance past the
edge. The narrowest section of the jet is the vena contracta, area C_c·A₂
with C_c ≈ 0.6–0.7 for a sharp contraction; the jet then expands again to
fill the pipe, and that expansion is where an abrupt contraction loses its
energy.

## The bench

| item | where |
|---|---|
| left reservoir | x = 0 → 1.60 m, held at 2.80 m by a head-driven level control |
| wide pipe | bore z = 0.50 → 1.50 m (1.00 m), bellmouth entry at x = 1.60 m |
| contraction | ends at x = 5.60 m; starts at x = 5.60 − L |
| narrow pipe | bore z = 0.75 → 1.25 m (0.50 m), x = 5.60 → 9.00 m |
| right reservoir | x = 9.00 → 11.50 m, held at 2.40 m by a tailwater control |

The contraction is symmetric about the pipe axis (z = 1.00 m), so both
corners behave alike. Changing L restarts the water (it redraws the pipe)
and the scene's spin-up then runs flat out again, so each L is seen steady.

## What to do

1. Open the card. Particles are on, the field is **Speed**, L = 3 m. The
   particle tracks converge smoothly through the taper and lengthen as the
   water accelerates; the colour goes from blue in the wide pipe to green in
   the narrow one.
2. Switch to **Vorticity**: the only vorticity is in the thin boundary
   layers on the walls; nothing leaves the wall in the taper.
3. Drag **Contraction length L** (Controls → Geometry) to **0 m**. The run
   restarts and spins up.
4. On **Vorticity**, two shear layers now leave the two corners of the step
   and reattach a little way down the narrow pipe; on **Speed** the corner
   regions are dark (slow eddies) and the core just past the edge is faster
   than further down the pipe — the vena contracta.
5. Press **A** (Average): the particles then ride the mean flow and draw its
   streamlines; the corner eddies stand out as regions the through-flow
   never enters.

## For the instructor

Measured on Resolution Medium (614 × 155, Δx = 18.7 mm, so the narrow pipe
is 27 cells across) with `CR.profile(x)` in `rig.js`, 30 s after a restart.
The card waits about **25 s**, the scene's measured spin-up; each change of
L replays it.

u across the bore, bottom to top, with the step (L = 0):

| x | what the profile shows |
|---|---|
| 5.50 m, just before the step | reverse flow (−0.2 m/s) in the bottom and top 0.1 m: the corner eddies in front of the step |
| 5.65–6.00 m | the core at 2.3–2.5 m/s with ~0 or slightly reversed flow in the outer 2–3 cells each side |
| 6.30 m | core peak 3.0 m/s, reverse flow −1.0 m/s at the bottom wall and −0.2 m/s at the top: the vena contracta, effective width about Q/U_core ≈ 0.34 m, so C_c ≈ 0.68 |
| 7.50 m | reattached: 2.2 m/s across the core, ordinary wall layers |

With the taper (L = 3 m) the same profiles are full and monotonic all the
way through, with no reverse flow anywhere. The lowest pressure in the bore
with the step is 1.1 m of head, at the vena contracta (x ≈ 6.4 m), so
nothing voids.

Caveats. The separated regions are only a few cells thick at Medium, so the
vena contracta is a modest necking (C_c ≈ 0.7), not the crisp textbook
picture; the corner eddies and the two shear layers are clearest on
Vorticity. The shear layers shed small eddies, so the live picture flutters;
Average gives the clean mean streamlines. The jet into the right reservoir
rises and runs out along the surface at the right edge — that is the
outlet's tailwater control taking the water away, not part of the demo.
Dye is not offered: the app's dye timelines are injected at the left edge
of the left reservoir, and in a 2 s headless check nothing had reached the
pipe; whether they read well here (they would have to cross the reservoir
first) is untested. Particles carry the demo.

### Discussion points

- The streamlines converge in both cases — continuity does not care about
  the shape. What the shape decides is whether the flow follows the wall.
- A particle accelerates through the contraction although the flow is
  steady: the acceleration is convective (u·∇u), not ∂u/∂t. VC-1 picks this
  up.
- The vena contracta and the expansion after it are the source of the
  abrupt contraction's loss; MM-2 shows that the force on the contraction is
  nonetheless almost the same as for the taper.
