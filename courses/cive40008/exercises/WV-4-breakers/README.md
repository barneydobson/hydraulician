# WV-4 · How waves break on beaches

A wave flume: a paddle at the left end makes the same wave over and over in
0.40 m of level water, and the wave runs onto a beach whose slope is the one
slider on the card. On a gentle beach the crest crumbles and the wave spills
its way up a long surf zone; on a steep one the front never breaks at all but
surges up the slope and slides back. The Iribarren number is the single
number that sorts the two, and the slider moves it with nothing else changed.

A Year 2 preview (tier: Preview), written for students to run themselves:
no personalised parameter and nothing to submit. The card is the whole
exercise; these notes are for the lecturer.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **WV-4**, or use the direct link
[`?ex=WV-4`](https://barneydobson.github.io/hydraulician/?ex=WV-4).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

The surf similarity (Iribarren) number compares the beach slope with the
deep-water steepness of the wave:

    ξ = tanβ / √(H₀/L₀)          L₀ = g·T²/2π

    ξ < 0.5        spilling     the crest crumbles; a long surf zone of bores
    0.5 < ξ < 3.3  plunging     the front overturns and throws a tongue (collapsing near 3)
    ξ > 3.3        surging      no breaking; run-up, run-down, strong reflection

The flume's wave is fixed: T = 2.0 s, L₀ = 6.2 m, and H₀ ≈ 0.17 m measured in
the level part, so √(H₀/L₀) ≈ 0.165 and **ξ ≈ 6·tanβ**. The slider runs from
tanβ = 0.06 (ξ ≈ 0.36) to 0.70 (ξ ≈ 4.2).

## The bench

| item | where |
|---|---|
| wave paddle | the left end wall, stroke amplitude 0.14 m (0.28 m peak to peak), period 2.0 s |
| level part | still water 0.40 m deep, bed at z = 0.10 m |
| beach | toe at x = 1.0 m while the slope is gentle; once tanβ > 0.10 the still-water shoreline is held at x = 5.0 m and the toe walks right — the flat run is kept short because these waves lose height to the grid the further they travel |
| slider | **Beach slope tanβ** (on the card, and Controls → Geometry), 0.06 → 0.70; each change restarts the flume from still water |
| grid | Low: 671 × 67 cells, Δx = 13 mm, over a 9.0 × 0.9 m box |

## What the class does

The card's steps, in short:

1. Open the card: the beach is at tanβ = 0.06 (1 : 17). The card runs the
   flume for about **10 s** before handing over; then watch two or three
   waves: each steepens as it shoals, its front turns into a bore and it
   loses height all the way in — **spilling**, a surf zone about 3 m long.
2. Set 0.15 (ξ ≈ 0.9), wait about 10 s: the wave travels almost unchanged to
   within about 0.7 m of the shoreline, then its front stands up and
   collapses onto the beach. Then 0.3 (ξ ≈ 1.8): the same, tighter still.
3. Set 0.7 (ξ ≈ 4.2): nothing breaks. The water runs up the slope as a
   sheet, stops and slides back; the reflected wave meets the next one and
   the flume turns choppy — **surging**.
4. Speed on the colour key shows the breaking front as the fastest water.
5. The question on the card: which beach dissipates wave energy and which
   shape reflects it? (Gentle beaches dissipate; steep walls reflect.)

## For the instructor

**The paddle.** The solver has no moving solids, so the wavemaker is the
standard small-stroke (linear) piston condition: the paddle's motion is
imposed at its mean position, the left end wall. That wall is an open edge
whose ghost column feeds the paddle face, and the solver imposes the paddle's
*volume* flux a·ω·D·cos ωt over the live depth at the wall, so a cycle puts
in exactly what it takes out (measured: the water volume holds to 0.2% over
12–16 s at every slope). On screen it is drawn as a solid plate whose face
moves through the displacement a·sin ωt; the view starts at the wall, so the
back half of each stroke is drawn squashed against it.

This replaces the earlier presentation, in which the generic `wave` piston —
a column of prescribed velocity 0.30 m inside the water — left a pocket of
water behind it that rose and fell in antiphase, drawn as a dashed line with
water on both sides. The other wave flumes (`wave`, `wavesurge`, `wavedeep`,
`waveshallow`) still use that piston; the wall paddle is opt-in per scene
(`wave.x = 0`, left edge open, `wave.d` = still depth).

**Piston, not flap (tried, Oct 2026).** WV-5 added a hinged-flap mode to the
same wall paddle. Here, at kd = 0.68, the flap needs nearly twice the
stroke for the same wave (Biésel: H/S = 0.35 against the piston's 0.68;
±0.27 m at the surface of 0.40 m of water), and with it the flume is the
same flume: H along it within about 0.01 m of the piston's at tanβ = 0.06,
0.15 and 0.7 (0.18 m at x = 1 m in both; in the surf zone the two trade
places by up to 0.012 m), the same spilling, collapsing and surging
fronts in screenshots side by side, and no less near-paddle disturbance.
Intermediate-depth water moves nearly uniformly over the depth, which is
what a piston does, so the card keeps it.

Measured headless at the card's resolution (Low, 671 × 67, Δx = 13 mm), the
wave height H as the crest-to-trough range of the surface over two periods,
after 12 s from still water:

| tanβ | ξ ≈ | H at x = 1 / 3 / 5 m | what the wave does |
|---|---|---|---|
| 0.06 | 0.36 | 0.17 / 0.14 / 0.11 m | steepens into a bore; H falls to 0.06 m by x = 6.3 m and 0.03 m at x = 7.8 m (shoreline 7.7): a ~3 m surf zone |
| 0.15 | 0.9 | 0.17 / 0.15 / — | travels nearly unchanged to x ≈ 4.3 m (H 0.12), the front goes vertical and collapses within ~0.7 m of the shoreline (x = 5.0) |
| 0.3 | 1.8 | 0.17 / 0.15 / — | the same, collapsing within ~0.3 m of the shoreline |
| 0.7 | 4.2 | 0.15–0.22 m (standing pattern) | surging: a sheet runs up to z ≈ 0.68 m (0.18 m above still water) and back, no break; the flume carries a strong partial standing wave |

**Spilling and surging work; plunging does not, and that is the solver, not
the slider.** In the plunging band (tanβ ≈ 0.1–0.5) the front goes vertical
and collapses onto the beach. It never throws a tongue forward over an air
pocket. The engineering notes ("Plunging breakers are out of reach — and
resolution is not the reason", re-diagnosed 2026-10-17) record why: the
mixing-length closure puts an eddy viscosity of ~10⁻³ m²/s through the crest
(independent of the grid, so refining does not help), and the stress-free
treatment above the surface makes a fast surface layer that, with the
closure off, breaks into cell-sized curls rather than a tongue. It is a
property of the open-channel closure this solver is tuned for, not of the
missing air pressure and not of resolution. Say so to the class: what they see in the middle band
is closest to the *collapsing* breaker of the classification, the transition
between plunging and surging — the card says "collapses rather than curling
over". A larger stroke (H/h → 0.6) only makes the wave break as a bore before
it reaches the beach.

The wave also loses height to the grid as it travels (0.17 → 0.11 m over 4 m
on the gentle beach), the documented resolution damping; this is why the
beach is placed so that the flat run before the toe stays short. The fronts
look steeper than they are because the view is vertically exaggerated
(≈ 5×); the VEX slider at 1 shows the true shape.

**Speed.** The cost of a run is cells × substeps per simulated second, and
neither the wave damping nor the beach's thin water costs anything in itself
(every cell costs the same, wet or dry). What changed:

| | old (12 × 1.2 m, Medium) | now (9 × 0.9 m, Low) |
|---|---|---|
| cells | 975 × 98 = 95 550 | 671 × 67 = 44 957 |
| Δx | 12.3 mm | 13.4 mm |
| Δt (acoustic, 0.45 Δx/(c + 6)) | 1.73e-4 s (c = 26) | 3.02e-4 s (c = 14) |
| cell-substeps per simulated second | 5.5e8 | 1.5e8 (3.7× less) |
| measured sim-s per wall-s (same headless session, shared GPU, interleaved) | 0.047 | 0.18 (3.8×) |

Half the old box was air above the waves and a sixth was ground under the
bed; cropping it lets the Low budget keep about the old Δx with half the
cells. The slot celerity c = 14 (was 26) gives the other 1.7×: the
hydrostatic compression gd/c² is 2% at the bed, and H along the flume and the
run-up moved by under 5 mm between c = 12, 16 and 26.

Spilling reads better with particles on (the default) or in the Speed field,
where the bore front lights up; the Water field shows the profile.

Wave numbers: T = 2.0 s in 0.40 m of water gives kd ≈ 0.68, L ≈ 3.7 m in the
flume. `rig.js` is the console spot-check: it measures H along the flume for
any slope and prints ξ.
