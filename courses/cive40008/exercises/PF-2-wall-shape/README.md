# PF-2 · Pressure force: only the depth matters

Still water 1.60 m deep stands against a right-hand wall whose shape is set by
one slider: overhanging, vertical, sloped at 30° or 60° from the vertical, or
a staircase. The class clicks the wall with the Pressure force tool at each
setting. The horizontal component never moves off ½ρg·d²; the vertical one
changes with the shape and is always the weight of the water standing on the
wall, or, under the overhang, the weight of the water that isn't there above
it, pointing up.

An exercise students play with on their own; the lecturer can also show it in class. There is no personalised parameter and nothing to pool.

**Open it:** press **E** in the [app](../../../../)
and pick **PF-2**, or use the direct link
[`?ex=PF-2`](../../../../?ex=PF-2).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

Per metre width, for a wall wetted from its foot at the bed up to the surface,
d = 1.60 m:

    F_h = ½ρg·d²  = 12.56 kN/m        only the wall's vertical projection matters
    F_v = ρg × A                       A = area between the wall and the surface,
                                       measured straight up from the wall

F_h is the force on the vertical projection of the wall: a horizontal slice
of water at depth z pushes on the wall with ρg(η − z) per unit of HEIGHT,
whatever angle the wall makes there. On a staircase the treads are horizontal
and carry no horizontal force; the risers add up to the full height d. F_v is
the weight of the column of water directly above each bit of wall. Under an
overhang the water is below the wall and pushes it up with the weight of the
"water that isn't there", the column from the wall up to the free-surface
level, inside the solid.

The slider, `Wall shape` (0 to 1, on the card, beside the optional
Submerged block):

| setting | shape | A (m²) | F_v closed form |
|---|---|---|---|
| 0 | overhang, 30° from vertical | ½d²·tan 30° = 0.739 | 7.25 kN/m **up** |
| 0.25 | vertical | 0 | 0 |
| 0.50 | sloped, 30° from vertical | 0.739 | 7.25 kN/m down |
| 0.75 | sloped, 60° from vertical | ½d²·tan 60° = 2.217 | 21.75 kN/m down |
| 1 | staircase, four steps on the 60° line | 1.637 | 16.06 kN/m down |

Between 0 and 0.75 the face turns continuously; between 0.75 and 1 the 60°
face folds into the staircase vertex by vertex. The staircase's outer corners
sit on the 60° line, so it holds less water than the slope: F_v drops and F_h
does not.

## The bench

| item | where |
|---|---|
| domain | 5.6 m × 2.4 m, every edge closed |
| bed | z = 0.30 m, from the left edge to the foot of the wall at x = 2.00 m |
| free surface | η = 1.90 m, so d = 1.60 m at the wall |
| wall face | from the foot at (2.00, 0.30) up to z = 2.10 m (0.20 m above the water), then a flat crest |
| submerged block (optional) | x = 0.20 to 0.70 m, z = 0.80 to 1.30 m, held still |

The wall and the bed are one polygon, so no shape can leak. Each slider move
restarts the water at rest and hydrostatic, so it is still at once. The card
offers the Water and **Pressure** colourings (p in kPa, 0 to ρg·1.8 m = 17.7
kPa; the hover card reads p too): the pressure depends on depth only, which is
the exercise in one picture (up to L6 the cards show the plain pressure, not
the pressure head — lecturer, Oct 2026).

## What to do

1. Pick the **Pressure force** tool on the strip and click the right-hand wall. The chip at
   the centre of pressure prints F, then `F_h` with `½ρgd²` and the wetted
   height d beside it, then `F_v` with its direction.
2. Slide **Wall shape** on the card through 0, 0.25, 0.5, 0.75 and 1.
   The selection stays on the wall while the slider moves. Read F_h and F_v at
   each setting.
3. Ask the class to predict F_v at each setting before it is read, as the
   weight of the water above the wall. Sketch the area; for the overhang,
   sketch the column of water that isn't there.
4. Optional: set **Submerged block** (on the card) to 1 and click the block. Its one face
   runs all the way round it: the horizontal parts cancel and what is left is
   one upward force, the weight of the water it displaces.

## For the instructor

Measured on Resolution Medium (471 × 202 cells, Δx = 11.9 mm) with
`rig.js`'s probe, 3 s after each slider move (the water starts at rest; the
peak speed anywhere in the tank is under 3 mm/s throughout):

| setting | F_h measured | ½ρgd² | F_v measured | weight of water above |
|---|---|---|---|---|
| 0 overhang 30° | 12.74 | 12.56 | 7.36 up | 7.25 up |
| 0.25 vertical | 12.68 | 12.56 | 0 | 0 |
| 0.50 sloped 30° | 12.62 | 12.56 | 7.29 down | 7.25 down |
| 0.75 sloped 60° | 12.59 | 12.56 | 21.80 down | 21.75 down |
| 1 staircase | 12.65 | 12.56 | 16.09 down | 16.06 down |
| submerged block, net | 0.00 | — | 2.58 up | ρg × 0.25 m² = 2.45 up |

All kN/m. F_h is within 1.5% of ½ρg·d² on every shape and F_v within 1.5% of
the weight of water above the wall. The water mass (Σf over the domain) is
constant to six figures over each run.

Caveats:

- The readings creep up by about 1% in the first seconds after a slider
  move: the water is seeded slightly compressed (the solver is weakly
  compressible) and the surface settles about 1 cm high. That is also why the
  chip prints d = 1.61 m rather than 1.60 m: d on the chip is read off the
  pressure at the wall, not off the drawing.
- The block reads 5% high. The Pressure force tool reads the pressure 0.75 Δx
  out from each face, so the top face is read slightly shallower and the
  bottom slightly deeper than they are: an effective block about 1.5 Δx
  taller.
- To make the sloped faces read correctly the Pressure force tool's
  surface-existence check (`SIM.faceForce` in `js/sim.js`) now looks 0.5, 1.0
  and 1.5 Δx into the solid rather than only 0.5 Δx. A sloped wall rasterises
  as a cell staircase, and half a cell in could be a water cell between two
  stair-steps; on the 30° wall that dropped 6 samples in 154 and read F_h 4%
  low (12.0 against 12.56 kN/m).

### Discussion points

- **Projection.** F_h depends only on d, the height of the wall's vertical
  projection; the shape adds or removes nothing sideways. The stairs make the
  point concretely: the treads carry nothing sideways and the risers stack up
  to d.
- **Water that isn't there.** Under the overhang the water pushes the wall up
  with the weight of the water that would fill the space between the wall and
  the surface level. The same argument gives the uplift under a dam and the
  buoyancy of the block.
- **Buoyancy is a pressure force.** With the block on, the four sides of one
  object add up to ρg × its volume, upward, with no sideways part:
  Archimedes from the same tool.
- **Same F_h, different resultant.** The resultant F tilts as F_v changes, so
  the line of action, and with it the moment about the wall's foot, depends
  on the shape even though F_h does not.

`rig.js` is the console spot-check: `PF2.table()` prints the table above,
`PF2.block()` the block row.
