# HS-1 · Dike with a piezometer

A dike stands between two reservoirs: water at 3.50 m on the left, 2.60 m on
the right (heights above the datum, z = 0). A culvert runs under the dike
from one reservoir to the other, shut by a valve at its downstream end, and
a piezometer — an open vertical tube — is tapped into the culvert roof and
rises through the dike. With the valve shut the left reservoir, the culvert
and the piezometer are one connected body of still water, so their three
surfaces stand at one level and the right reservoir at another. Press **V**,
the culvert runs, the narrow right reservoir fills in seconds, and once the
water has come to rest all the surfaces stand at the level the volume
balance dictates.

The dike's upstream face is an embankment — a short vertical toe and then a
slope up to the crest — so the pressure force on it has a vertical part as
well as the ½ρg·d² horizontal one; the downstream face is vertical and has
only the latter.

An exercise students play with on their own (L3, Statics); the lecturer can
also show it in class. There is no personalised parameter and nothing to
pool. It is a good first scene before any of the flow exercises, because the
Pressure force tool's diagram and the field colourings are read here against
numbers the class can do on paper.

**Open it:** press **E** in the [app](../../../../)
and pick **HS-1**, or use the direct link
[`?ex=HS-1`](../../../../?ex=HS-1).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

In still water the pressure is hydrostatic: it increases with depth and
depends only on the depth below the free surface η,

    p = ρg·(η − z)            so the pressure head p/ρg = η − z

and in one connected body of still water the surface stands at the same η
everywhere — so a piezometer tapped anywhere into that body stands at the
free surface, however deep the tap and however narrow the tube. That is the
whole reason a piezometer measures pressure: its column is a free surface you
can see. (Pressure head is the pressure divided by ρg — the pressure expressed
as a height of water; wherever it is higher, the pressure is higher.)

**Piezometric head** h = z + p/ρg is the level a piezometer connected at that
point would stand at. In one connected body of still water it is the same
number everywhere (it is η), which is the whole statement of this exercise in
one colour. The lecturer teaches it in Statics (L3) with the piezometer, so
the card offers both **Pressure head** and **Piezometric head** — and not the
plain Pressure colouring the other early cards use (lecturer, 2026-10-17).

**Force on a face**, per metre width, for a face wetted from its foot z_f up
to the surface η, with d = η − z_f:

    F_h = ½ρg·d²                        the horizontal part — the same for a vertical
                                        or a sloped face of the same wetted height
    F_v = ρg × (area of water standing on the face)     downward on a face the water
                                        leans on; zero on a vertical face
    centre of pressure at d/3 above the foot of the wetted height

Both dike faces have their foot at the culvert roof, z_f = 1.10 m. The
upstream face is vertical from 1.10 to 1.90 m and then slopes 1.9 m up over
0.9 m across to the crest at 3.80 m; the downstream face is vertical
throughout. The underside of each dike block is also wetted — the culvert
runs beneath it — so the water pushes it **up** with ρg·(η − 1.10) per square
metre.

**The common level.** Nothing leaves the domain when the valve opens, so the
volume the left body loses equals the volume the right reservoir gains. The
left body is the 2.40 m reservoir plus the wedge of water standing on the
slope plus the 0.20 m piezometer; the right reservoir is 0.80 m wide.
Equating the two gives **η_∞ = 3.32 m**. Treating the left body as a plain
2.60 m reservoir gives 3.29 m — the slope is worth three centimetres, and a
class can be asked which answer to expect before the valve moves.

## The bench

| item | where |
|---|---|
| ground | solid below z = 0.50 m |
| left reservoir | x = 0 → 2.40 m, surface 3.50 m |
| culvert | z = 0.50 → 1.10 m, under the whole dike |
| upstream block | toe at x = 2.40 m, vertical to z = 1.90 m, slope to the crest at (3.30, 3.80) m, crest to x = 4.30 m |
| piezometer slot | x = 4.30 → 4.50 m, from the culvert roof to the crest |
| downstream block | x = 4.50 → 5.20 m, crest 3.80 m |
| valve | x = 5.00 m, across the culvert — downstream of the piezometer tap |
| right reservoir | x = 5.20 → 6.00 m, surface 2.60 m |

Particles are on when the card opens: they sit still until the valve moves.
The only instrument is the **Pressure force** tool; levels are read off the
scale at the left, or by hovering the water (the hover card prints the level
η, the pressure head and the piezometric head h). The fields are Water,
Pressure head and Piezometric head.

## What to do

The card carries these steps; this is the same sequence with the numbers.

1. **Look.** With the valve shut, the left reservoir, the culvert and the
   piezometer stand at one level, **3.50 m**; the right reservoir at
   **2.60 m**. Ask the class why the water in the piezometer, standing on a
   culvert under the dike, reaches the same level as the reservoir on the
   far left.
2. **Piezometric head, then pressure head.** Choose Piezometric head in
   Field & legend: one colour through the left reservoir, the culvert and the
   tube — they are one body at one level (the right reservoir is another
   colour). Then Pressure head, and hover: it is the depth below the surface,
   everywhere in the connected body.
3. **Read the forces.** Pick the Pressure force tool on the strip and click
   the dike's sloped upstream face. The diagram is drawn on the face and the
   label at the centre of pressure prints the resultant and its components:
   about **28 kN/m** sideways, ½ρg·(3.50 − 1.10)², and about **6 kN/m**
   downward, the weight of the water on the slope. Click the same block
   again and the tool cycles to its culvert roof — about **45 kN/m** pushing
   up on a 1.9 m block. Click the other block's downstream face: about
   **11 kN/m**, sideways only, for a 1.50 m depth.
4. **Press V.** The culvert runs, the particles show the water moving
   right, and the narrow reservoir comes up to level inside a couple of
   seconds. The reservoirs then slosh through the culvert; everything is
   still after about 45 s.
5. **Read again once the water is still.** All the surfaces stand at
   **3.32 m**; both faces read about **24 kN/m** sideways and opposite in
   direction, so the net horizontal force on the dike is zero.

## For the instructor

Measured on Resolution Medium (352 × 270 cells, Δx = 17 mm) with the
headless probe in `rig.js`, after the October 2026 trim (everything moved down
0.50 m, ground top at z = 0.50 m, domain 4.6 m tall instead of 5.1 m):

| reading | closed form | measured |
|---|---|---|
| left / culvert / piezometer while shut | 3.50 m | 3.50 / 3.50 / 3.50 m |
| right while shut | 2.60 m | 2.62 m |
| upstream face, shut: F_h / F_v | 28.2 / 5.9 kN/m | 28.2 / 5.9 kN/m |
| downstream face, shut: F_h | 11.0 kN/m | 11.5 kN/m |
| culvert roof of the upstream block, shut: push up | 44.7 kN/m | 45.1 kN/m |
| common level after V | 3.32 m | 3.32 m |
| either face after V: F_h | 24.2 kN/m | 24.1 / 24.3 kN/m |
| upstream face after V: F_v | 4.7 kN/m | 4.7 kN/m |
| water mass before → after V (Σf over the domain) | conserved | 3.441 → 3.441, to four figures |

The forces depend only on depths, which the trim did not change, so they are
the numbers of the earlier 1.00 m-ground build to within the cell size; the
levels are those numbers minus 0.50 m.

### In the lecture

- Before anything moves, ask why the piezometer stands at the left
  reservoir's level although it is tapped into a culvert under the dike.
- Have the class predict the common level (3.32 m; 3.29 m without the
  slope) before pressing V.
- The card no longer uses Gauges (lecturer's choice, Oct 2026): levels are
  read off the scale or the hover card, forces off the Pressure force tool.
  `⋯ Show everything` brings Gauges and Piezometric head back for a
  demonstration.

Earlier, in October 2026 (before the trim), after the polygon-geometry and stress-free
surface changes and with the Pressure force tool's surface check deepened for
sloped faces (see PF-2): every number above still holds; the face forces
moved by at most 0.2 kN/m. The basin speeds are under 1 cm/s about 45 s after V and under 5 mm/s by 55 s; there is no boot
transient to wait out, so the card's countdown is zero.

The mass row is the Control volume's enclosed-mass integral over the whole
domain, not `APP.volume()`. The column reduction that `volume()` sums stops
each column at the first solid above the bed, so under the dyke it counts the
culvert and never sees the wedge of water standing on the slope; as the left
level drops that unseen wedge shrinks and `volume()` *rises* by about 0.13 m²
with nothing created. Any scene with water above a soffit or
on a slope has the same blind spot.

The scene's `nu` is set to 2·10⁻³ m²/s, an eddy viscosity rather than
water's. At the stock value the jet that fills the small basin leaves a
trapped eddy that keeps 0.1–0.2 m/s going in both basins for minutes after
the levels have equalised, which is not a hydrostatics demo. The
Smagorinsky constant and the wall friction were tried first and barely
moved it; the background viscosity did.

### Discussion points

- **The piezometer is a pressure gauge you can see into.** Its column stands
  at the left surface because the culvert pressure is ρg·(3.50 − z) — the
  tube is not "connected to the reservoir", it is connected to the culvert,
  and the culvert is at reservoir pressure. After V it stands at the common
  level because the culvert pressure has changed, not because anything about
  the tube has.
- **The slope changes the vertical force, not the horizontal one.** Cover the
  slope with a vertical wall of the same wetted height and F_h is unchanged;
  what the slope adds is the weight of the water it carries. The resultant on
  the sloped stretch is normal to the face, so F_v / F_h on that stretch is
  the slope's run over its rise, 0.9 / 1.9.
- **Equal levels, equal forces, no thrust.** Before V the dyke is pushed
  right by 28 − 11 = 17 kN/m and held by whatever it is founded on. After V
  the push is gone. This is why an empty lock chamber is the dangerous case
  for a lock gate, not a full one.
- **The uplift is real.** The culvert roof reads ρg·(η − 1.10) upward per
  metre of block — comparable to the horizontal thrust, and it is what
  drainage galleries under real dams are for.
- **The volume rule.** Have the class predict the common level before the
  valve moves, with and without the slope, and then read the scale.
- **Where the mass went.** Nothing left the domain (the mass row above),
  so this is also the first check of the solver's conservation in front of a
  class.

`rig.js` is the console spot-check — it prints the table above from the
same entry points the strip uses.
