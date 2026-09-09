# HS-1 · Three surfaces, one level: a dyke and its piezometer

A dyke stands between two reservoirs: 4.00 m of water on the left, 3.10 m on
the right. A culvert runs under the dyke from one basin to the other, shut by
a valve at its downstream end, and a piezometer — an open vertical slot — is
tapped into the culvert roof and rises through the dyke. With the valve shut
the left basin, the culvert and the piezometer are one connected body of
still water, so their three surfaces stand at one level and the right basin
at another. Press **V**, the culvert runs, the narrow right basin fills in
seconds, and once the water has come to rest all four surfaces stand at the
level the volume balance dictates.

The dyke's upstream face is an embankment — a short vertical toe and then a
slope up to the crest — so the pressure force on it has a vertical part as
well as the ½ρg·d² horizontal one; the downstream face is vertical and has
only the latter.

This is a **lecturer demo**: there is no personalised parameter and nothing
to pool. It is the first thing to show a class before any of the flow demos,
because every instrument in the app — the gauge's `h`, the Pressure force
tool's diagram, the field colourings — is read here against numbers the
class can do on paper.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HS-1**, or use the direct link
[`?ex=HS-1`](https://barneydobson.github.io/hydraulician/?ex=HS-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

In still water pressure is hydrostatic and the piezometric head is the same
everywhere in one connected body:

    p/ρg = η − z            h = z + p/ρg = η

so a piezometer tapped anywhere into that body stands at the free surface η,
however deep the tap and however narrow the tube. That is the whole reason a
piezometer measures pressure: its column is a free surface you can see.

**Force on a face**, per metre width, for a face wetted from its foot z_f up
to the surface η, with d = η − z_f:

    F_h = ½ρg·d²                        the horizontal part — the same for a vertical
                                        or a sloped face of the same wetted height
    F_v = ρg × (area of water standing on the face)     downward on a face the water
                                        leans on; zero on a vertical face
    centre of pressure at d/3 above the foot of the wetted height

Both dyke faces have their foot at the culvert roof, z_f = 1.60 m. The
upstream face is vertical from 1.60 to 2.40 m and then slopes 1.9 m up over
0.9 m across to the crest at 4.30 m; the downstream face is vertical
throughout. The underside of each dyke block is also wetted — the culvert
runs beneath it — so it carries an **uplift** ρg·(η − 1.60) per square
metre, upward.

**The common level.** Nothing leaves the domain when the valve opens, so the
volume the left body loses equals the volume the right basin gains. The left
body is the 2.40 m basin plus the wedge of water standing on the slope plus
the 0.20 m piezometer; the right basin is 0.80 m wide. Equating the two gives
**η_∞ = 3.82 m**. Treating the left body as a plain 2.60 m basin gives
3.79 m — the slope is worth three centimetres, and a class can be asked which
answer to expect before the valve moves.

## The bench

| item | where |
|---|---|
| ground | solid below z = 1.00 m |
| left basin | x = 0 → 2.40 m, surface 4.00 m |
| culvert | z = 1.00 → 1.60 m, under the whole dyke |
| upstream block | toe at x = 2.40 m, vertical to z = 2.40 m, slope to the crest at (3.30, 4.30) m, crest to x = 4.30 m |
| piezometer slot | x = 4.30 → 4.50 m, from the culvert roof to the crest |
| downstream block | x = 4.50 → 5.20 m, crest 4.30 m |
| valve | x = 5.00 m, across the culvert — downstream of the piezometer tap |
| right basin | x = 5.20 → 6.00 m, surface 3.10 m |

Particles are on when the card opens: they sit still until the valve moves.

## What to do

1. **Read the three surfaces while the valve is shut.** Drop a Gauge (`5`)
   in the left basin, one inside the culvert under the piezometer (x ≈ 4.4,
   z ≈ 1.3) and one in the right basin. Each card prints `h`: the left basin,
   the culvert and the piezometer column all read **4.00 m**; the right basin
   reads **3.10 m**. Ask the class why the culvert gauge, two and a half
   metres under water at the foot of the dyke, reads the same number as the
   surface on the far left.
2. **Read the forces.** Pick the Pressure force tool on the strip and click
   the dyke's sloped upstream face. The diagram is drawn on the face and the
   chip at the centre of pressure prints the resultant and its components:
   about **28 kN/m** sideways, ½ρg·(4.00 − 1.60)², and about **6 kN/m**
   downward, the weight of the water on the slope. Click the same block
   again and the tool cycles to its culvert roof — about **45 kN/m** of
   uplift on a 1.9 m block. Click the other block's downstream face: about
   **11 kN/m**, sideways only, for a 1.50 m depth.
3. **Press V.** The culvert runs, the particles show the plug of water
   moving right, and the narrow basin comes up to level inside a couple of
   seconds. The basins then slosh through the culvert; the gauge traces
   (open the inspector with ⤢) show the two basins swinging in antiphase and
   the piezometer following the culvert pressure. It is still after about
   45 s.
4. **Read everything again once the water is still.** All four surfaces
   stand at **3.82 m**; both faces read about **24 kN/m** sideways and
   opposite in direction, so the net horizontal force on the dyke is zero.
   Switch the field to Piezometric head (`L`, or the legend) — still water
   is one colour from the surface to the culvert invert, on both sides.

## For the instructor

Measured on Resolution Medium (334 × 284 cells, Δx = 18 mm) with the
headless probe in `rig.js`:

| reading | closed form | measured |
|---|---|---|
| left / culvert / piezometer while shut | 4.00 m | 4.01 / 4.01 / 4.01 m |
| right while shut | 3.10 m | 3.11 m |
| upstream face, shut: F_h / F_v | 28.2 / 5.9 kN/m | 28.4 / 5.9 kN/m |
| downstream face, shut: F_h | 11.0 kN/m | 11.2 kN/m |
| culvert roof of the upstream block, shut: uplift | 44.7 kN/m | 45.1 kN/m |
| common level after V | 3.82 m | 3.82 m |
| either face after V: F_h | 24.2 kN/m | 24.1 / 24.2 kN/m |
| upstream face after V: F_v | 4.7 kN/m | 4.6 kN/m |
| water mass before → after V (Σf over the domain) | conserved | 3.800 → 3.800, to four figures |

The basin speeds are under 1 cm/s about 45 s after V and under 5 mm/s by 55 s; there is no boot
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
  at the left surface because the culvert pressure is ρg·(4.00 − z) — the
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
- **The uplift is real.** The culvert roof reads ρg·(η − 1.60) upward per
  metre of block — comparable to the horizontal thrust, and it is what
  drainage galleries under real dams are for.
- **The volume rule.** Have the class predict the common level before the
  valve moves, with and without the slope, and then read the gauge.
- **Where the mass went.** Nothing left the domain (the mass row above),
  so this is also the first check of the solver's conservation in front of a
  class.

`rig.js` is the console spot-check — it prints the table above from the
same entry points the strip uses.
