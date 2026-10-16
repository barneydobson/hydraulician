# FF-2 · Spillway with a ski-jump

A reservoir spills over an ogee crest, races down the spillway face and is
thrown into the air by a flip bucket (a ski-jump) at the toe; the jet plunges
into a long, deep pool. One flow field, talked through for most of the Fluid
Motion lecture: the velocity field, steady against unsteady, streamlines,
separation and recirculation, fluxes and mean velocity, velocity profiles,
and turbulence as a mean plus a fluctuation.

This is a **lecturer demo**: no personalised parameter, nothing to pool;
students replay it afterwards.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FF-2**, or use the direct link
[`?ex=FF-2`](https://barneydobson.github.io/hydraulician/?ex=FF-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory, in one paragraph per slide

- **Velocity field.** u = (u, w) at every point; the Speed colouring shows
  |u|. Almost still in the reservoir, accelerating over the crest (the crest
  is the control: the flow passes through critical there), fastest on the
  face and in the bucket (~8 m/s), slowing in the pool.
- **Steady vs unsteady.** ∂u/∂t = 0 at a point. The reservoir, crest and face
  are steady; the pool around the plunge is not.
- **Streamlines.** Tangent to u everywhere. The spillway surface and the free
  surface are streamlines. Particles over the Average draw the mean flow's
  streamlines.
- **Separation and recirculation.** The jet enters the pool at a point; on
  both sides of it the pool recirculates (a roller trapped between the jet
  and the dam, and a surface roller downstream of the plunge).
- **Flux.** q = ∫u·n dz through a section, per metre width. The same q passes
  the crest (a 1.1 m deep layer at ~3 m/s) and the pool (a 2.7 m deep pool at
  ~1.3 m/s mean): q = V·d with V the mean velocity.
- **Velocity profile and no-slip.** u = 0 at the wall; downstream of the
  plunge the pool carries the jet along its floor as a wall jet, fastest just
  above the bed.
- **Turbulence.** u = ū + u′. Live, the pool profile and a pool gauge jitter;
  under Average they become a clean, steady mean. Engineers design for the
  mean. Dye released with the reservoir water is smeared through the pool:
  turbulence mixes.

## The bench

| item | where |
|---|---|
| domain | 44 m × 10 m, Resolution Medium: 647 × 147 cells, Δx = 68 mm |
| reservoir | x = 0 → 7 m, level held at **8.70 m** by the head-driven reservoir control (sponge 5 m) |
| ogee crest | WES shape for a design head of 1.5 m, apex at (7.42, 7.20) m |
| spillway face | 1 : 0.75, down to a circular bucket of radius 2 m, invert z = 3.30 m |
| bucket lip | at 40° (the slider: 20–45°), lip at (13.69, 3.77) m |
| plunge pool | floor z = 0.30 m, x = 13.7 → 44 m, held at **3.00 m** by the tailwater on the right edge (sponge 4 m) |

The right edge is the pool's outflow boundary. There is no hydraulic jump and
no stilling basin: the domain is simply long enough (26 m of pool past the
plunge) that the plunge turbulence has decayed into a slow drift before it
reaches the outflow edge.

**The slider.** Controls → *Bucket lip angle* (20–45°, default 40°) moves the
lip along the bucket's own arc, so the throw changes while the crest, the
face and q do not. It is the one design choice a ski-jump designer actually
makes, and it turns the "free jet in the air is a parabola" remark into
something to watch. The reservoir level is also on the panel (it sets q).

## What to do

1. **The velocity field.** Speed colouring (the card opens on it). Walk the
   class from left to right.
2. **Steady vs unsteady.** Pause (Space) twice, a few seconds apart.
3. **Fluxes.** Flux line over the crest (a vertical at x ≈ 7.4 m from the
   crest up through the surface) and one full-depth across the pool at
   x ≈ 30 m. Live, the crest reads a steady **3.46 m²/s**; the pool wanders
   about it.
4. **Profiles and turbulence.** Rakes at x ≈ 20 and 25 m and a Gauge at
   (20, 1.0) m. Live, the profiles jump about; press **A** and wait until T
   passes 30 s.
5. **Average.** The pool becomes a steady mean flow with a roller either side
   of the plunge, particles trace its streamlines, the rakes are clean
   curves, and the two fluxes agree.
6. **Optional.** Move the lip angle; turn Dye on with Dye timelines to mark
   the reservoir water (dye is live-only and stands down under Average).

The card's settle is about **40 s**: the crest flux is steady by ~5 s, but
the pool level sloshes once (its section read 2.5–4.7 m²/s between 7 and
35 s) before settling.

## For the instructor

Measured headless at Medium on this geometry (`rig.js` reproduces it):

| reading | live | averaged (T = 40 s) |
|---|---|---|
| q over the crest | 3.46 m²/s, steady to ±0.01 | 3.46 |
| q, pool at x = 25 m | 3.4–3.8 over three seconds | 3.36 |
| q, pool at x = 30 / 32 m | ±10–20% about 3.5 | 3.40 |
| q, pool at x = 38 m | ±10% | 3.40–3.41 |
| velocity leaving the lip (40°) | ~7.3 m/s at ~21° | — |
| pool rake x = 20 m, near the floor | 1.7–3.5 m/s between frames | 2.4–2.6 m/s |

The averaged pool fluxes sit 2–3% under the crest's: inside a 40 s window
the pool is still giving back a little of its spin-up slosh. Averaged in two
windows on separate runs the pool read 3.36–3.41 every time.

**Throw.** The jet leaves at roughly half the lip angle (lip 20 / 30 / 40 /
45° gave ~6 / 15 / 21 / 27°) at 7.3–8.3 m/s, against the 9.8 m/s of a
lossless fall from 8.70 m to the lip: the face's boundary layer and the
bucket's turn cost about a third of the energy at this resolution. It lands
4–5 m past the lip, about a metre above it at the apex. A "proper" prototype
ski-jump throws much further; this is a model-scale jet about seven cells
thick.

**The pool and the outflow edge.** The scene keeps the solver's open-channel
mixing length. Switched off (or weakened to κ = 0.1) the pool's eddies ran the
whole 30 m to the outflow edge and the tailwater sloshed with them — at 0.1
the pool rose to 6 m and drowned the bucket. With it on, the pool fluctuates
hard around the plunge (x ≈ 14–24 m) and is a calm drift with no visible
eddies by x ≈ 30 m. That is the honest limit of "turbulence" here: the
solver resolves the large eddies near the plunge and models the rest as an
eddy viscosity, so the far pool looks quieter than a real one would.

**Mean pool flow.** Averaged, the pool is a wall jet along its floor (fastest
~2.5 m/s just above the bed at x = 20 m, falling to ~0.5 m/s at the surface)
with a roller in the corner between the jet and the dam's downstream face.

### Discussion points

- The crest, the face and the jet look identical in Live and Average: a
  steady flow is its own mean. Only the pool changes when A is pressed.
- The same q at very different depths and speeds (crest, face, pool): V = q/d.
- Where is the flow fastest, and why is it not at the bottom of the face?
  (The bucket turns it; the pressure head field shows the bucket's
  centripetal pressure — switch to Pressure head.)
- Particles over the Average are streamlines of the mean flow; dye in the
  live flow is not — it is a streakline, smeared by the fluctuations.

`rig.js` is the console spot-check.
