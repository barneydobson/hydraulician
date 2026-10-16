# WV-4 · Breaking waves on a beach

A wave flume: a piston at the left end makes the same wave over and over in
0.40 m of level water, and the wave runs onto a beach whose slope is the one
slider on the card. On a gentle beach the crest crumbles and the wave spills
its way up a long surf zone; on a steep one the front never breaks at all but
surges up the slope and slides back. The Iribarren number is the single
number that sorts the two, and the slider moves it with nothing else changed.

This is a **lecturer demo** and a Year 2 preview (tier: Preview): there is no
personalised parameter and nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **WV-4**, or use the direct link
[`?ex=WV-4`](https://barneydobson.github.io/hydraulician/?ex=WV-4).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

The surf similarity (Iribarren) number compares the beach slope with the
deep-water steepness of the wave:

    ξ = tanβ / √(H₀/L₀)          L₀ = g·T²/2π

    ξ < 0.5        spilling     the crest crumbles; a long surf zone of bores
    0.5 < ξ < 3.3  plunging     the front overturns and throws a tongue (collapsing near 3)
    ξ > 3.3        surging      no breaking; run-up, run-down, strong reflection

The flume's wave is fixed: T = 2.0 s, L₀ = 6.2 m, and H₀ ≈ 0.16 m measured in
the level part, so √(H₀/L₀) ≈ 0.16 and **ξ ≈ 6·tanβ**. The slider runs from
tanβ = 0.04 (ξ ≈ 0.25) to 0.70 (ξ ≈ 4.4).

## The bench

| item | where |
|---|---|
| piston | x = 0.30 m, stroke amplitude 0.18 m, period 2.0 s (Controls → piston, should anyone want to change the wave) |
| level part | still water 0.40 m deep, bed at z = 0.20 m |
| beach | toe at x = 1.2 m while the slope is gentle; once tanβ > 0.083 the still-water shoreline is held at x = 6.0 m and the toe walks right — the flat run is kept short because these waves lose height to the grid the further they travel |
| slider | **Beach slope tanβ** (Controls → Geometry, and on the card), 0.04 → 0.70; moving it restarts the flume from still water |

## What to do

1. Open the card: the beach is at tanβ = 0.06 (1 : 17). Wait out the
   **15 s** settle and watch two or three waves: each steepens over the last
   two metres, its front turns into a bore and it loses height all the way in
   — **spilling**, a long surf zone.
2. Set the slope to 0.15 (ξ ≈ 1). Wait about 15 s. The wave now travels
   almost unchanged to within half a metre of the shoreline and then its
   front goes vertical and collapses onto the beach: the surf zone has shrunk
   to a few tenths of a metre.
3. Set 0.3 (ξ ≈ 2): the same, tighter still.
4. Set 0.7 (ξ ≈ 4.4): nothing breaks. The water runs up the slope as a sheet,
   stops, and slides back; the reflected wave meets the next one and the
   flume turns choppy — **surging**.
5. Ask: which beach would you build to dissipate wave energy, and which shape
   reflects it? (Gentle beaches dissipate; steep walls reflect — WV-3.)

## For the instructor

Measured headless (Medium, 975 × 98 cells, Δx = 12 mm unless stated), the
wave height H as the crest-to-trough range of the surface over two periods,
after 12 s from still water:

| tanβ | ξ ≈ | H at x = 1 / 3 / 5 m | what the wave does |
|---|---|---|---|
| 0.06 | 0.4 | 0.17 / 0.14 / 0.11 m | steepens, front becomes a bore from x ≈ 6.5 m, H falls to 0.06 m by x = 7 m and 0.02 m at x = 8.6 m: a ~3 m surf zone |
| 0.15 | 0.9 | 0.18 / 0.14 / 0.14 m | travels nearly unchanged to x ≈ 5.6 m, front goes vertical and collapses within ~0.4 m of the shoreline (x = 6.0) |
| 0.25 (High, Δx = 9 mm) | 1.6 | 0.19 / 0.16 / 0.14 m | the same, a vertical wall of water collapsing at the shoreline |
| 0.5 | 3.1 | 0.20 / 0.17 / 0.13 m | run-up with a short collapsing front; strong partial standing wave in the flume |
| 0.7 | 4.4 | 0.19 / 0.17 / 0.14 m | surging: a sheet runs up to z ≈ 0.78 m (0.18 m above still water) and back, no break; the flume carries a standing-wave pattern (H 0.12–0.23 m from node to antinode) |

**Spilling and surging work; plunging does not, and that is the solver, not
the slider.** In the plunging band (tanβ ≈ 0.1–0.5) the front goes vertical —
at 1 : 1 vertical scale (VEX = 1) and High resolution it is a straight wall
0.15 m tall — and collapses onto the beach. It never throws a tongue forward
over an air pocket. This is the limit the engineering notes record ("Plunging
breakers are out of reach"): an overturning tongue is thinner than the
interface can hold, and the voids carry no pressure, so nothing holds an air
tube open. Going from Medium (Δx = 12 mm) to High (9 mm) did not change it.
Say so to the class: what they see in the middle band is closest to the
*collapsing* breaker of the classification, the transition between plunging
and surging. A larger stroke (H/h → 0.6) only makes the wave break as a bore
before it reaches the beach.

The wave also loses height to the grid as it travels (~0.17 → 0.11 m over
4 m on the gentle beach), the documented resolution damping; this is why the
beach is placed so that the flat run before the toe stays short.

Spilling reads better with particles on (the default) or in the Vorticity
field, where the bore front lights up; the Water field shows the profile.

Wave numbers: T = 2.0 s in 0.40 m of water gives kd ≈ 0.68, L ≈ 3.7 m in the
flume. `rig.js` is the console spot-check: it measures H along the flume for
any slope and prints ξ.
