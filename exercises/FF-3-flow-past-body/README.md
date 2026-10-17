# FF-3 · Steady and unsteady flow

Looking down on a uniform stream (plan view, gravity out of the plane) past
one body whose shape is a single slider: a slender ellipse lined up with the
flow at one end, a square of the same frontal width at the other. Slide it
and the wake goes from a thin, steady streak to one that swings from side to
side, shedding eddies; switch the colour bar from Live to Average and the
swinging wake averages into one steady, symmetric wake bubble. The headline
is steady against unsteady flow; the same scene also carries streamlined
against bluff bodies, separation and wake width, dye against streamlines,
and the difference between a turbulent flow and its mean.

An exercise students play with on their own; the lecturer can also show it in class. No personalised parameter and nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **FF-3**, or use the direct link
[`?ex=FF-3`](https://barneydobson.github.io/hydraulician/?ex=FF-3).
The scene alone is `?scene=body`.

## Theory

- **Streamlined vs bluff.** Behind a slender body the pressure recovers
  gently and the flow follows the surface to the trailing edge: the wake is
  as wide as the two thin shear layers that leave it. A bluff body makes the
  flow turn sharply; it separates (at the front corners of the square), and
  the wake is about as wide as the body.
- **Steady vs unsteady.** The two separated layers spin in opposite
  senses. Behind a bluff body they are unstable and roll up
  alternately: eddy shedding, one eddy from each side per period T.
  The boundary conditions do not change in time; the flow does.
- **Strouhal number (for the instructor; not Year 1).** St = D/(U·T), with D the frontal width and U the
  free-stream speed, is close to 0.13–0.2 for bluff bodies — an order of
  magnitude a class can check off the gauge.
- **Dye vs streamlines.** In steady flow a dye streak, a particle path and a
  streamline coincide. In the shedding wake they do not: the dye records
  where the water has been, wrapped into the vortices.
- **Averaging.** The live wake alternates; its time average is steady and
  symmetric. The flow is unsteady, its mean is steady. This is exactly how a
  turbulent flow is described: a mean plus fluctuations.

## The bench

| item | value |
|---|---|
| domain | 6.0 m long × 3.4 m across, plan view, g = 0 |
| stream | 0.9 m/s prescribed over the whole left edge, outflow on the right; side walls free-slip |
| body | superellipse \|x/a\|ⁿ + \|z/b\|ⁿ = 1 centred at (1.9, 1.7) m |
| slider `Body shape`, s = 0 → 1 | n = 2·6^s (2 → 12), aspect a/b = 3^(1−s) (3 → 1), frontal width 2b = 0.40 m held |
| s = 0 | ellipse 1.20 m long, 0.40 m wide |
| s = 1 | square, 0.40 m, slightly rounded corners (n = 12) |
| viscosity | ν = 2·10⁻³ m²/s (an eddy viscosity): Re = U·2b/ν ≈ 180 at every slider position |
| dye | timelines injected across the whole inlet every 1.0 s |

Changing the slider re-rasterises the body and keeps the flow running; it
does not restart the water. Each change also restarts an Average window.

## What to do

1. **The streamlined body.** The card boots on the ellipse with Speed
   showing and particles on. A thin slow streak runs straight downstream
   behind the body. Nothing moves: steady flow.
2. **Make it bluffer.** Slide Body shape on the card up in steps,
   giving each 20–30 s. Below about 0.3 the wake stays steady. From about
   0.3–0.4 it starts to swing, slowly at first; by 0.6 it sheds eddies clearly
   within about 20 s of the change. At 1 (the square) the flow separates
   at the front corners and the wake swings strongly, shedding an eddy from each side in turn.
3. **Read the period.** Put a Gauge (the Gauge tool on the strip) in the wake (0.6 m behind the body,
   0.2 m off the centreline) and read the period from its Speed trace (⤢
   opens the inspector). About **2.9 s** for the square: St ≈ 0.4/(0.9 × 2.9)
   ≈ 0.16.
4. **Dye and particles.** Turn on Dye and Particles on the strip. The dye
   timelines arrive straight across the stream and bend round the body; in
   the shedding wake the particles swing from side to side across the
   centreline while the mean flow (step 5) has them going straight through.
   At Medium the timelines are faint by the time they reach the wake (see
   the caveats) — the particles carry this point better than the dye.
5. **Average.** Switch the colour bar from Live to Average with the square shedding. Within a few shedding
   periods the street becomes one steady bubble, symmetric about the
   centreline, with a closed recirculation behind the body; the particles
   now follow the mean flow's streamlines. Switch back to Live to return to
   the live street.
6. **Pressure (optional).** Choose Pressure head in Field & legend and press
   Fit on the legend: the pressure is highest where the stream meets the
   front of the body. In this plan view the pressure head also carries a
   large, slowly drifting constant (about 2–4 m), so Fit is needed to see
   the few centimetres that matter.

## For the instructor

All numbers measured headless at Resolution Medium (409 × 232 cells,
Δx = 14.7 mm), the body started from the boot flow, the cross-stream velocity
w sampled every 0.1 s at the centreline 0.6 m behind the trailing edge.
"RMS w" is over the last 40 % of a 40 s run (60 s for 0.35 and 0.42);
"growth" is the RMS in each fifth of the run, showing whether the
oscillation is growing, saturated or dying.

**Width held (shipped).** 2b = 0.40 m throughout.

| s | n | a/b | RMS w (m/s) | growth by fifths | period (s) | St |
|---|---|---|---|---|---|---|
| 0 | 2.0 | 3.0 | 0.000 | 0.004 → 0 | — | — |
| 0.25 | 3.1 | 2.3 | 0.001 | 0.006 → 0.001 (dying) | — | — |
| 0.35 | 3.7 | 2.0 | 0.062 | 0.012 → 0.068 (growing at 60 s) | 2.4 | 0.19 |
| 0.42 | 4.2 | 1.9 | 0.092 | 0.008 → 0.101 (growing at 60 s) | 2.4 | 0.19 |
| 0.5 | 4.9 | 1.7 | 0.134 | 0.03 → 0.14 (still growing) | 2.4 | 0.19 |
| 0.75 | 7.7 | 1.3 | 0.218 | 0.10 → 0.22 (saturated) | 2.5 | 0.18 |
| 1 | 12 | 1.0 | 0.346 | 0.12 → 0.34 (saturated) | 2.9 | 0.16 |

**Area held (tried, not shipped).** Plan area 0.16 m², so the ellipse is
0.26 m wide and 0.78 m long and the square 0.40 m.

| s | 2b (m) | RMS w (m/s) | growth | period (s) | St |
|---|---|---|---|---|---|
| 0 | 0.26 | 0.000 | dying | — | — |
| 0.25 | 0.28 | 0.000 | dying | — | — |
| 0.5 | 0.31 | 0.024 | flat at ~0.025 (marginal) | 2.1 | 0.16 |
| 0.75 | 0.35 | 0.205 | saturated | 2.4 | 0.17 |
| 1 | 0.40 | 0.346 | saturated | 2.8 | 0.16 |

**Why width.** Both families work: steady at the ellipse, a strong street at
the square. With the area held the onset is later (≈ 0.5–0.6) and the
change looks more abrupt, but part of it is just the body getting wider —
Re_D climbs from 120 to 180 along the slider. With the width held Re_D is
180 everywhere, so the onset is down to shape alone, which is the point of
the demo. The other family is one argument away: `shape(s, "area")` in the
scene (set `HOLD` in `js/scenes.js`).

**Does shedding start cleanly?** Not as a switch. Close to onset
(s ≈ 0.3–0.5) the oscillation grows slowly — e-folding times of 10–20 s,
still growing after 60 s — which is what a supercritical (Hopf) onset looks
like. For the lecture, show the ellipse, then jump to ≈ 0.6 or higher, where
the street is established within about 20 s; come back into the 0.3–0.5
band only to make the point that the onset is gradual.

**Averaged wake symmetry** (square, 40 s window ≈ 14 shedding periods,
mean streamwise velocity ū at mirror points either side of the centreline):

| behind trailing edge | ±0.1 m | ±0.2 m | ±0.3 m |
|---|---|---|---|
| 0.2 m | −0.065 / −0.047 | 0.133 / 0.163 | 0.675 / 0.727 |
| 0.5 m | −0.031 / −0.005 | 0.305 / 0.344 | 0.723 / 0.758 |
| 1.0 m | 0.399 / 0.399 | 0.492 / 0.494 | 0.634 / 0.640 |

Mean cross-stream velocity is antisymmetric to within 0.015 m/s at every
station. The mean recirculation (ū < 0) reaches about 0.5 m behind the
square; the residual asymmetry, a few cm/s, is the finite window and shrinks
as the window grows. Behind the ellipse (30 s window) the mean is symmetric
to 0.02 m/s and has no recirculation: ū = 0.13 m/s at the centreline 0.2 m
behind the tail.

**Choices and caveats.**

- `plan`'s duct is opened to the whole left edge, so the body sits in a
  uniform stream. In the original jet the body sat inside the jet's own
  shear layers, which shed whatever the body.
- ν = 2·10⁻³ m²/s is an eddy viscosity chosen to put the onset mid-slider.
  At `plan`'s 2·10⁻⁵ the ellipse sheds too (RMS w 0.55 m/s); at 10⁻³ the
  ellipse is weakly unstable; at 3·10⁻³ the square sheds only slowly
  (still growing at 30 s). The Reynolds number of the demo is therefore
  ~180, a laminar-street Reynolds number, not a river's.
- The walls are free-slip (as in `plan`): the separation off the square is
  pressure-driven at its corners. With no-slip walls at the same ν the
  ellipse was marginally unstable (RMS w 0.009 m/s and growing at 40 s), so
  the streamlined end would not read as clearly steady; the square shed with
  St = 0.17.
- The shedding Strouhal number of the square, 0.16, sits just above the
  ≈ 0.14–0.15 measured for square cylinders at this Re; the 12 % blockage of
  the 3.4 m channel pushes it up a little.
- **Dye is weak here.** The inlet timelines (every 1.0 s, the default fade)
  are crisp upstream but diffuse into a faint wash by the time they reach
  the wake, so "dye no longer looks like streamlines" is not convincing from
  the dye alone in the screenshots taken; particles live against particles
  under A carry it. A longer timeline period or `Dye fade` → permanent is
  worth trying live.
- The card's `settle` (10 s) only lets the start-up transient pass the
  ellipse; the shedding wait after each slider move is the lecturer's.

`rig.js` is the console spot-check: `FF3.wake(s, T)` reproduces a row of
the width table, `FF3.mean(T)` the symmetry table.
