# WV-4 · How waves break on beaches

A wave flume: a paddle at the left end makes the same wave over and over in
0.40 m of level water, and the wave runs onto a beach whose slope is the one
slider on the card. On a gentle beach the crest crumbles and the wave spills
its way up a long surf zone; on a steep one the front never breaks at all but
surges up the slope and slides back. The Iribarren number is the single
number that sorts the two, and the slider moves it with nothing else changed.
Underneath the waves there is more to see: the particles' orbits, dye
released near the bed and near the surface, the undertow along the bed on
the colour key's Average, and the Froude number climbing towards 1 in the
surf zone's bores.

A Year 2 preview (tier: Preview), written for students to run themselves:
no personalised parameter and nothing to submit. The card is the whole
exercise; these notes are for the lecturer.

**Open it:** press **E** in the [app](../../../../)
and pick **WV-4**, or use the direct link
[`?ex=WV-4`](../../../../?ex=WV-4).
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
| beach | the still-water shoreline is held at x = 10.0 m for every slope and the toe walks: 3.3 m from the paddle at tanβ 0.06, 7.3 m at 0.15, 8.7 m at 0.3, 9.4 m at 0.7 (round 2: at least twice the old run; it was 1.0 / 2.3 / 3.7 / 4.4 m) |
| slider | **Beach slope tanβ** (on the card, and Controls → Geometry), 0.06 → 0.70; each change restarts the flume from still water |
| on the strip | Field & legend (Water, Speed, Froude number; Live / Average on the colour key), Particles, Streamlines, Hover readout, the Dye tool |
| grid | Medium: 1102 × 86 cells, Δx = 10.4 mm, over an 11.5 × 0.9 m box |

## What the class does

The card's steps, in short:

1. Open the card: the beach is at tanβ = 0.06 (1 : 17). The card runs the
   flume for about **15 s** before handing over, long enough for the first
   waves to reach the beach. Each wave steepens as it shoals from x ≈ 3 m,
   its front turns into a bore near x ≈ 8 m and it loses height all the way
   in — **spilling**, a surf zone about 2–3 m long.
2. Set 0.15 (ξ ≈ 0.9) and wait about 15 s: the wave runs the flat 7 m, then
   its front stands up and collapses onto the beach (0.3, ξ ≈ 1.8: the same,
   tighter). Set 0.7 (ξ ≈ 4.2): nothing breaks; the water runs up the slope
   as a sheet and slides back, and the reflection sets up a partial standing
   wave — **surging**.
3. Back at 0.06, the Dye tool held near the bed and then near the surface
   offshore of the breakers (x ≈ 5 m): the ink rocks to and fro with each
   wave and drifts slowly; the particles draw the orbits, flatter near the
   bed (kd ≈ 0.7: intermediate depth).
4. Live → Average on the colour key, Streamlines on: one circulation cell
   fills the flume — onshore near the surface, offshore along the bed.
   That return current is the **undertow** (measured below). Give the
   window about 30 s; dye is not drawn while Average is on.
5. Live again, Froude number: about 0.2–0.5 offshore, 0.6–0.9 under the
   breaking fronts near the shore — close to 1 but, measured from the bed,
   not past it (below, "Froude").

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

Measured headless at the card's resolution (Medium, 1102 × 86, Δx = 10.4
mm), the wave height H as the crest-to-trough range of the surface over two
periods, averaged over ±0.95 m about each station, after 16 s from still
water:

| tanβ | ξ ≈ | toe | H at x = 1 / 3 / 5 / 7 / 9 m | what the wave does |
|---|---|---|---|---|
| 0.06 | 0.36 | 3.3 m | 0.17 / 0.15 / 0.13 / 0.11 / 0.07 m | shoals from the toe, breaks as a bore from x ≈ 8 m; H 0.04 m at 10 m (the shoreline): spilling over ~2–3 m |
| 0.15 | 0.9 | 7.3 m | 0.17 / 0.15 / 0.13 / 0.11 / — | runs the flat 7 m, stands up and collapses within ~0.7 m of the shoreline |
| 0.3 | 1.8 | 8.7 m | 0.17 / 0.16 / 0.13 / 0.11 / 0.11 m | the same, collapsing within ~0.3 m of the shoreline |
| 0.7 | 4.2 | 9.4 m | 0.15 / 0.14 / 0.12 / 0.12 / 0.13 m (standing pattern) | surging: a sheet runs up and back, no break; a partial standing wave fills the flume |

**Damping (round 2).** The lecturer asked for waves that arrive at the beach
with almost no loss and lose their energy only where they break, with the
smallest viscosities that stay stable. On the flat run at tanβ 0.15 (toe at
7.3 m), Medium, H as above at x = 1 / 4 / 6 / 8 m:

| settings | x = 1 | 4 | 6 | 8 | ratio 6 m / 1 m | Average (mean flow) |
|---|---|---|---|---|---|---|
| old: kappa 0.41, ca 0.8 | 0.167 | 0.145 | 0.114 | 0.108 | 0.68 | one clean circulation cell |
| **card**: kappa 0.41, ca 0.2 | 0.173 | 0.147 | 0.115 | 0.106 | 0.66 | one clean circulation cell |
| kappa 0.2, ca 0.2 | 0.166 | 0.128 | 0.117 | 0.098 | 0.70 | one cell, undertow twice as fast (0.3 m/s) |
| kappa 0, ca 0.2, nu 1e-4 (WV-5's) | 0.211 | 0.170 | 0.135 | 0.141 | 0.64 | a row of small cells; the live surface full of chop |
| **card now** (Oct 2026, #77): closure off, ca 0.2, nu 1e-5 | 0.196 | 0.154 | 0.164 | 0.157 | 0.84 | not re-measured; surface grid noise 2.2× the closure-on run |
| closure off, ca 0.2, nu 1e-4 | 0.218 | 0.174 | 0.136 | 0.146 | 0.62 | not re-measured; noise 1.7× |

Every setting loses about a third of the height over the first 6 m, so for
this wave the loss is not the viscosity. It is a steep long wave
(H/d ≈ 0.4, Ursell number ≈ 35) made by a linear piston: its first harmonic
hands energy to higher ones as it goes (the crest sharpens, the trough
flattens, a secondary crest appears) — measured as the first-harmonic
amplitude, it falls the same way under every setting. The mixing length
does not damp it measurably; what it does set is the mean flow (right-hand
column), which is half of this card.

**The closure is now OFF here (Oct 2026, issue #77).** The mixing length is a
channel parameterisation — a log layer over a bed — and a wave has thin
boundary layers and no log layer, so the wave flumes no longer run it; the
bed keeps its wall-function friction (C_f 0.01) and the cells the Smagorinsky
term. Re-measured with the same harness (the closure-on row reproduces the
card's old one to 0.007 m): the waves now arrive at the beach with most of
their height (H at 6 m / 1 m 0.84 against 0.66), and the shoaling up the beach
is no longer flattened (a solitary wave on 1 : 15 now follows Green's law at
the finest grid, engineering notes). The price, measured as the mean
|∂²η/∂x²| of the surface over x = 1–7 m during t = 16–20 s, is 2.2× the
grid-scale surface noise, and the undertow picture below was measured with the
closure on and has not been re-measured: with it off the earlier run saw the
mean flow break into a row of small cells. Both are the surface treatment's
problem rather than the closure's (the void faces copy the water's u, which
makes a fast, noisy top layer — #77), and that is where the fix belongs.

**Undertow.** Average, window 60 s (t = 30 → 90 s), tanβ 0.06, the
Favre-mean horizontal velocity ū (negative = offshore):

| x (m) | mean depth d̄ (m) | ū 1–4 cm above the bed (m/s) | ū near the mean surface (m/s) |
|---|---|---|---|
| 4 | 0.37 | −0.12 to −0.17 | +0.34 |
| 5 | 0.30 | −0.15 to −0.18 | +0.07 |
| 6 | 0.24 | −0.15 | +0.18 |
| 7 | 0.18 | −0.11 | +0.14 |
| 8 | 0.13 | −0.14 | +0.04 |

The return current runs offshore along the whole bed from the surf zone
back to the paddle and turns up at the paddle wall; the onshore flow is
concentrated between trough and crest (the Favre mean of the cells the
crests fill). For a sense of scale, linear theory's mass flux gH²/8c ≈ 0.016
m²/s returned over 0.36 m is about 0.05 m/s depth-averaged; the bed current
here is stronger because the return is concentrated near the bed. With the
mixing length at 0.2 it ran at −0.2 to −0.37 m/s, and with it off the mean
flow broke into a row of small cells — the closure is what makes this
picture.

**Froude.** The Froude colouring is |u|/√(gd) from the horizontal velocity
and the column depth (engineering notes, "Is it the numerator?"). Sampled
40 times over 2 s at tanβ 0.06, the largest Fr in each column:

| x (m) | 3–7 | 7.5–8.5 | 9–10 (to the shoreline) |
|---|---|---|---|
| median / 90th percentile / max | 0.2 / 0.4–0.5 / ≤ 0.74 | 0.27 / 0.44–0.66 / 0.6–0.8 | 0.35 / 0.5–0.64 / 0.6–1.07 (once in 40, at 9.5 m) |

So the surf zone does approach 1 but, in the bed's frame, does not go past
it except in the thin run-up and backwash at the shoreline: that is the
physics of a bore, not the display. A bore running into still water of depth
d₁ travels faster than √(gd₁) (it is supercritical relative to itself, which
is why it is a jump), but the water behind it moves at only
u = c(1 − d₁/d₂), about 0.6 √(gd₂) for d₂ = 2d₁. The card says "climbs to
0.6–0.9, close to 1". Showing Fr > 1 at the fronts would need the Froude
number in the bore's frame, (c − u)/√(gd), which the app does not draw.

**Spilling and surging work; plunging does not, and that is the solver, not
the slider.** In the plunging band (tanβ ≈ 0.1–0.5) the front goes vertical
and collapses onto the beach. It never throws a tongue forward over an air
pocket. The engineering notes ("Plunging breakers are out of reach — and
resolution is not the reason", re-diagnosed 2026-10-17) record why: the
mixing-length closure put an eddy viscosity of ~10⁻³ m²/s through the crest
(it is now off in this flume), and the stress-free treatment above the
surface makes a fast surface layer that, with the closure off, breaks into
cell-sized curls rather than a tongue. It is the surface treatment, not the
missing air pressure and not resolution alone. Say so to the class: what they see in the middle band
is closest to the *collapsing* breaker of the classification, the transition
between plunging and surging — the card says "collapses rather than curling
over". A larger stroke (H/h → 0.6) only makes the wave break as a bore before
it reaches the beach.

The fronts look steeper than they are because the view is vertically
exaggerated (≈ 5×); the VEX slider at 1 shows the true shape.

**Speed.** The cost of a run is cells × substeps per simulated second, and
neither the wave damping nor the beach's thin water costs anything in itself
(every cell costs the same, wet or dry):

| | round 1 (9 × 0.9 m, Low) | now (11.5 × 0.9 m, Medium) |
|---|---|---|
| cells | 671 × 67 = 44 957 | 1102 × 86 = 94 772 |
| Δx | 13.4 mm | 10.4 mm |
| Δt (acoustic, 0.45 Δx/(c + 6)) | 3.02e-4 s | 2.35e-4 s |
| cell-substeps per simulated second | 1.5e8 | 4.0e8 |
| measured sim-s per wall-s, headless, this GPU | — | 1.0–1.1 stepping flat out, ~0.8 drawing every frame |

The longer flume at Low would have been Δx = 15 mm (a 0.17 m wave 11 cells
tall); Medium gives it 16. The slot celerity stays at c = 14
(gd/c² = 2% at the bed; H along the flume and the run-up moved by under
5 mm between c = 12, 16 and 26 in round 1).

Spilling reads better with particles on (the default) or in the Speed field,
where the bore front lights up; the Water field shows the profile.

Wave numbers: T = 2.0 s in 0.40 m of water gives kd ≈ 0.68, L ≈ 3.7 m in the
flume. `rig.js` is the console spot-check: it measures H along the flume for
any slope and prints ξ.
