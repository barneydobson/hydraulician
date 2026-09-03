# Engineering notes

What a contributor needs to *not break* the solver: the guard rails and the
explosions that bought them, the conservation rule, the geometry contracts,
and the measured lore behind the scenes and exercises. The derivation itself
is in [numerics.md](numerics.md); the symbol register in
[notation.md](notation.md); the quick repo map in the repo root's AGENTS.md.

## The model, as a contributor meets it

Barotropic **weakly-compressible Navier–Stokes** on a staggered (MAC) grid,
with the cell fill fraction `f` doubling as the density:

```
∂f/∂t + ∇·(f u) = 0                      exact, flux form
∂u/∂t + (u·∇)u  = −∇P + χ(f)·g + ν_T∇²u − 1_wall·C_f|u|u/Δ
P = p/ρ₀ = c² max(f − 1, 0)              equation of state
```

`χ = smoothstep(0, 0.05, f)`
is what survives of the multiphase weight `ρg → f·ρ_w·g` in the heavy-fluid limit
(`ρ_w/ρ_a ≈ 800`): no water in a cell, no weight. With the air phase dropped
`ρ → 0` in a void, the per-unit-mass momentum equation degenerates to `0/0`, and
the velocity stored there is an extension field that must not be accelerated.
`1_wall` restricts the friction to cells touching a
solid: it is a **wall function** (a shear-stress BC divided by the cell height),
not a bulk drag, which is why the delivered roughness is grid-dependent. And it
is `ν_T∇²u`, *not* `∇·(ν_T∇u)` — the `∇ν_T·∇u` term is dropped.

The EOS is the whole trick, and it is a **2D Preissmann slot**:

- `f < 1` — cell not full ⇒ `p = 0` ⇒ the fluid falls freely. That IS the free
  surface. No interface reconstruction is needed for the pressure BC.
- `f > 1` — cell over-full ⇒ the water has been compressed ⇒ pressure, travelling
  at celerity `c`. Free-surface ↔ pressurised transitions happen inside the same
  equations, and `c` is the slot width: it sets the water-hammer surge `ΔH = cΔv/g`
  and the time step (`Δt ≈ 0.45Δx/(c+6)`).
- In plan view (`g = 0`) the EOS goes **two-sided** — `min(f−1, 0)` tension,
  faded out below `f ≈ 0.3` — because there is no free surface to excuse a
  rarefied cell: without tension every strong vortex core slowly cavitates
  into a hole.

**A free jet is only free in the vertical plane.** Plan view is fully wet by
construction (`water: () => 1`), so a jet there is *submerged*: it has no
interface, it is invisible in every display mode (a dye line disperses to a
uniform wash within a metre), and its deflected momentum ends up in the
confining walls rather than crossing any control-volume face — measured on a
plan-view Pelton splitter, the lateral force reads the same with one cup as
with two, and opening the side edges to let it out drains the domain instead.
So geometry that needs a free jet AND the horizontal plane — a Pelton
splitter is the example — is out of reach in the same sense as a plunging
breaker: the solver offers the right plane or the right jet, never both.
HP-2's record has the numbers.

No Poisson solve. Two fullscreen passes per substep: `vel` then `vof`.

### Inside the vel pass

3rd-order upwind advection (low dissipation, so jets stay crisp over the
thousands of substeps a hammer run needs), Smagorinsky eddy viscosity,
wall-aware Laplacian (no-slip or free-slip), gravity gated on fluid presence,
implicit bed friction, then `∇p` from the EOS. Velocity in voids is advected
and slowly bled away rather than zeroed — hard-zeroing it makes the air a
rigid medium whose fake shear layer shreds any free jet within a metre of its
nozzle.

**Keep gravity and `∇p` additive** and do not interpose anything new between
them ([numerics.md](numerics.md) §4), or the hydrostatic state stops being a
discrete equilibrium. The implicit friction already sits between them, which
is why the balance is broken in wall-adjacent cells — a ~10⁻¹⁰ m/s-per-substep
defect at default settings, negligible but do not enlarge it.

**Hydrostatic balance is a result, not an assumption.** Nothing imposes
`∂P/∂z = −g`; it is the condition for rest, and `P = 0` above `f = 1` fixes
the constant, giving the equilibrium fill `f = 1 + g(η−z)/c²` — which is
exactly `still()` in scenes.js. `docs/hydrostatic-attractor.js` verifies the
solver reaches it from a uniform (uncompressed) start: `|∂P/∂z + g|/g` falls
to 2×10⁻⁶ and the elevation implied by the pressure, `z + P/g`, is one number
at every depth. It takes ~100 s of simulated time, which is why scenes are
initialised with `still()` rather than uniform — a cold start would still be
settling at the end of a run.

## State textures

- `U` RGBA32F — `r` = u at the **west** face of this cell, `g` = w at the
  **south** face (a swizzle, not the notation: `U.g` stores `w`), `b` = p/ρ
  at the cell centre (diagnostic, also what the display uses for submergence),
  `a` = ∇·u.
- `F` RGBA32F — `r` = f, `g`/`b` = dye A/B.
- `S` R8 — 0 open, 128 valve, 255 wall. Rasterised CPU-side from a segment
  list so it can be undone and re-rasterised at any resolution.
- `C` RGBA32F, nx×1 — the column reduction: bed, depth, unit discharge,
  surface. The `col` pass walks the *connected* water body from the lowest
  wet cell, so a raised flume bed or a tank standing above a puddle is
  handled.

## Guard rails, each bought with an explosion

- **Transport-consistency cap.** The VOF donor limiter cannot move mass faster
  than `Δx/4Δt`, but nothing in the momentum equation knows that: spray cells
  (`f` small, gravity on, `p = 0`) integrate velocity past what the mass flux
  can follow, the fields decouple, and the runaway ends at the ±80 NaN rail —
  where it drags volume out of any pinned Dirichlet ghost it touches. So
  partial-fill cells clamp their velocity at `0.20 Δx/Δt`, fading to the wide
  rail as `f → 0.5`. Full (pressurised) cells never bind the donor cap.
- **Open-boundary ring.** The outermost cells see a clamped stencil and, under
  a level control, a pinned `f` — their momentum update is junk, and it leaks
  inward through the advection stencil of the last interior column. Ring cells
  take the interior neighbour's tangential velocity (zero gradient) and keep
  only the clamped momentum update on the exchange face.
- **Control bands.** A level control (reservoir / tailwater) applies only over
  the contiguous open run of cells in its boundary column that contains the
  level (`columnBand` in sim.js) — not the whole column. Applied column-wide it
  floods the sealed cavity under a raised bed slab, and the prescribed inlet
  velocity then pressurises the pocket to the clamp with no feedback: that was
  the steep-scene explosion.
- **Soft level boundaries.** A one-cell Dirichlet is a hard impedance step:
  pond slosh reflects off it and, with the momentum update supplying the
  exchange velocity, the reflection pumps — the drowned-jump scenes tore
  themselves apart at t ≈ 40 s. Level-controlled edges therefore get a
  relaxation sponge (f nudged to the hydrostatic target) and a torricellian
  exchange clamp `sqrt(2gL)+1`. Sponge details that matter: the width is
  scene-tunable in METRES (`spongeIn` / `spongeTw`, default ~10 cells) —
  a reservoir compartment feeding a pipe needs the whole compartment held
  (venturi 1.35 m, hammer 5.5 m) or it draws down and the bore cavitates;
  and the nudge is asymmetric (fill 12·s, drain 2·s²) because deleting wave
  crests column-by-column against an incoming jet paints standing striations
  in the pond. The prescribed inlet plug is likewise feathered over its top
  three cells (`inletVel` repays the lost discharge) so its hard top edge
  stops waterfalling ripples into the drawn-down interior surface; submerged
  ducts (level above the whole run) keep the full plug. Levels are
  ELEVATIONS above the domain floor (the datum), not depths over the bed —
  the panel prints both. The inlet pins the surface AT its level, so a scene
  must set the level the arriving profile actually wants (m1's inletDepth is
  the MEASURED weir backwater at the inlet, not d_n): pinned lower, the
  boundary chokes the backwater and shed ripples for ever. An adaptive
  "ride the backwater" inlet was tried and reverted — it hunts (visibly on
  M2) and can self-feed at steep crests; so was a pressure-feedback rating
  on the plug — it neither hurt nor helped.
- **A tailwater must stand clear of critical depth.** Re-check it every time
  `q` changes, because `d_c = (q²/g)^⅓` moves with it. A subcritical level
  control set AT d_c is degenerate: the outlet chokes at critical, the reach
  stops taking its depth from the control, and the one-cell Dirichlet argues
  with the flow it is supposed to be setting. h23 shipped with `tail` = 0.170
  against d_c = 0.170 and a23 with 0.160 against 0.170 — one exactly on the
  knife edge, one *below* a depth the outlet cannot hold. Lifting h23 to
  1.5 d_c alone halved its drift and took the flutter from 19% to 12%.
  1.3 d_c is a safe target, but it is a floor to clear, not a value to aim
  at: how far above d_c you can go is set by what the reach has to read.
  Raising m3 from 1.08 to 1.3 d_c lifted its apron above d_n and turned the
  M2 the scene is about into M1, so m3 deliberately runs at the margin
  (measured steady there) while h23 and a23 sit at 1.3 and 1.5.
- **Outfall edges (`open` = 2) are for brinks, not for ponds.** The ghost is
  held permanently empty, so the exchange face sees the full hydrostatic
  `c²(f−1)` of the interior with nothing opposing it. Against a thin,
  near-critical sheet at a lip that is exactly right. Against standing water
  it is an unbounded gradient: measured, the face saturates at the transport
  cap (0.20 Δx/Δt ≈ 12 m/s), empties the last column faster than the donor
  limiter can refill it, and then reverses — the tail columns run dry and
  report NEGATIVE q while the reach behind them floods. m3 and a23 both
  ponded to ~1.1 m mean depth this way. No scene uses mode 2; the sandbox
  floor drains on mode 1 (zero-gradient), which mirrors the interior and so
  bleeds at the free-fall rate instead.
- **Tilted gravity for uniform mild slopes** (`tiltS0`, per scene; `channel`
  option `tilt`). A 1-in-68 bed rasterises to a one-cell step every ~0.9 m,
  and at M2's working depth (~20 steps per depth) that staircase excites
  standing waves over the whole reach that no boundary treatment damps —
  m1 hides them only by running deep. The m2 scene draws its bed FLAT
  (grid-aligned, no steps) and tilts gravity by S₀ instead: `u_gx` in the
  vel pass, and the overlay adds `tiltS0` back into both the bed slope and
  S_f (the flat-bed energy line misses the S₀ of work gravity does per
  metre). Only for small S₀ — the still-water surface visibly tilts at
  chute angles. The residual near-brink undulations on m2 are near-critical
  wave amplification, not the staircase.

## Conservation — read this before touching the VOF pass

The flux form conserves volume to machine precision **only** because both
neighbours of a face compute an identical flux (same limited face value, same
compression term, same donor). Positivity is enforced by capping each outgoing
flux at a quarter of the donor cell's contents, **not** by clamping `f` at zero.

That distinction is the whole ball game. An earlier version clamped, and at a
few thousand substeps a second across every surface and spray cell in the domain
it invented water fast enough to triple the discharge along a 14 m flume while
the depth sat perfectly steady. Symptoms to watch for: `q` rising monotonically
downstream in a steady state; total volume constant while inflow ≠ outflow.
`APP.volume()` plus a face-flux integral is how it was found.

## On a TILTED scene, raw `z` does not contain the slope

A scene with `tilt: true` (`m2`, `sa1`) draws its bed FLAT and tilts gravity
instead, via the `u_gx` uniform — the point being that a grid-aligned bed has
no rasterisation staircase to excite waves. The consequence is easy to forget
and expensive to rediscover:

> the elevation the solver reports does **not** include the `S₀·x` the bed no
> longer draws.

The app already puts it back where a reader meets it — the gauge readout and
`analyse`'s `S₀`/`S_f` both add `tiltS0 · x` — so nothing on screen is wrong.
But a headless script reading `analyse().surf` or `probe().z` directly gets
the untilted number, and is out by exactly `S₀·L` over a window of length `L`.

That is not a small error where it matters most. Working NC-1's 7 m window on
`sa1` (`S₀ = 0.0147`), the head fall came out as 6–27 mm instead of 111–130 mm
— off by 103 mm, which is `S₀ · 7 m` to the millimetre. It looks exactly like
a broken scene: the fall is far too small to read, which is the one thing that
exercise depends on. The fix is to add `sim.scene.tiltS0 * x` back to any
elevation you take from a tilted scene by hand.

## The column flux is conserved only IN THE MEAN

Integrate continuity over a column and the bed/surface fluxes drop out:

```
    d/dt ( integral f dz )  +  d/dx ( integral f u dz )  =  0
```

so `q = ∫ f u dz` is uniform along `x` **only where the column storage is
steady**. It never is instantaneously — the free surface wobbles, and that
wobble is a real `∂d/∂t`, not noise to be tolerated away. Two consequences
that have both cost time:

- **It is a MASS flux, not a discharge.** `f` doubles as the density, so the
  conserved integral is `∫ f u dz`. `FS_COL` computes that — but it used to
  feed it a fill clamped to 1, discarding the mass in over-full cells, which
  is exactly the compressible part. Depth wants the clamped fill; the flux
  wants the real one. They are different questions and now use different
  variables.
- **Averaging is not optional.** Measured on m1 at Low, settled, spread of the
  column flux over the middle 60% as a fraction of its median:

| window | one frame | 1 s | 2 s | 5 s | 10 s | 20 s |
| --- | --- | --- | --- | --- | --- | --- |
| spread | 0.1115 | 0.0585 | 0.0406 | 0.0308 | 0.0132 | **0.0022** |

  Monotone in `T`, converging on zero. The 0.2% left at 20 s is the scheme's
  real error, and it reproduces (0.0020 / 0.0019 / 0.0019 on three runs). A
  reading taken on one frame is not a worse measurement of the same thing — it
  is a measurement of a different thing, and no tolerance makes it right.

This is what issue #46 actually was. A 2.6x spread looked like a conservation
bug; it was an unsettled scene read on a single frame. `smoke.js --only=physics`
now settles, opens a 20 s averaging window, and gates the spread at 0.01 —
where the old gate was 0.8.

One trap when you measure this yourself: use `analyse().qRaw`, not
`analyse().q`. `analyse` carries its own 10% EMA over the column reduction to
steady the drawn profile against roll waves, so a single call on the mean
columns is still 90% full of the live frames before it — enough to report
0.03 where the mean columns give 0.002.

## Enclosed voids: holes inside the water are REAL, not a drawing artefact

Run `jet` or `h23` for twenty seconds and there are cells of pure air sitting
deep inside the body of the water. This is not the display thresholding a
nearly-full cell: read the fill field straight off the GPU, flood-fill air
inward from the domain edges, and what is left over is enclosed void.
Measured at Low, sim t = 20, as a fraction of the water in the domain:

| scene | enclosed cells | worst `f` | deepest below surface | % of water |
| --- | --- | --- | --- | --- |
| dambreak | 0 | — | — | 0.00 |
| wave | 0 | — | — | 0.00 |
| m3 | 18 | 0.007 | 6 cells | 0.18 |
| m1 | 129 | 0.000 | 14 cells | 0.52 |
| h23 | 149 | 0.000 | 25 cells | 1.11 |
| jet | 224 | 0.000 | 45 cells | 2.03 |

**Why they persist.** With gravity on, the EOS is one-sided:
`p = c² max(f − 1, 0)`. An under-full cell therefore has *zero* pressure, so
nothing pulls a rarefied cell shut — a void can only be filled by advection
wandering back into it. `press()` in `js/shaders.js` says this itself, in the
comment explaining why the plan view (`g = 0`) switches the two-sided branch
on: *"without that, every strong vortex core slowly cavitates into a hole."*
In the vertical plane that branch is off, because there `f < 1` **is** the free
surface. Representing the free surface and closing interior voids are the same
knob, which is why this is not a one-line fix.

**A fix was tried and it failed — do not retry it blind.** The obvious move is
to gate the two-sided branch on whether the cell is submerged, read off the one
cell above it: at a free surface that cell is air (no suction, nothing changes),
inside the fluid it is water (suction closes the void). It works on the calm
scenes — m1 129 → 0, h23 149 → 0, m3 18 → 0 — and then destroys `hammer`:
total water in the domain went from 320 m² to **1615 m²**, five times the mass
invented in twenty seconds, with 39% of the domain void. Pressurised flow is
exactly where suction runs away. Anything along these lines has to be measured
against `hammer` and against `docs/hydrostatic-attractor.js` before it is
believed.

So the voids stand, and `smoke.js --only=physics` **bounds** them instead:
enclosed void must stay under 4% of the water volume (about twice the worst
scene). It is a bound, not a zero — its job is to stop the number growing
silently when someone edits the advection, the flux cap or the EOS.

## Coordinate and geometry contracts

- Domain = a fixed physical rectangle (`scene.W × scene.H`). The grid is sized
  to a cell budget, so changing resolution changes Δx but not the physics, and
  resizing the window only moves the letterbox. Live parameters (`S.p`, the
  open-edge flags included) survive a resolution rebuild.
- Wall segments have **butt** ends, not round caps. `[x0,z0,x1,z1,th]` is the
  centreline; the endpoints are the true extent. Round caps quietly eat half a
  thickness off every gap, which is fatal when the gap is the demonstration.
  Consequence: a *sloping* slab is cut perpendicular to its axis, so it must be
  started from outside the domain or its upstream top corner is missing.
- A slab drawn PAST the domain edge must have its endpoint extrapolated, not
  clamped. `drop()`'s apron ran to `W + 1` while its elevation function
  clamped at `W`, which flattened the drawn slope by (W−xb)/(W+1−xb): a23's
  adverse apron came out at −0.0233 instead of −0.030 (22% shallow) and m3's
  at 0.0136 instead of 0.0147. It is not cosmetic — S₀ is what the whole GVF
  classification is measured against, and with the wrong bed a23's domain
  volume swung ±15% on a ~60 s cycle that never settled.
- A scene's bed must stay above z = 0 for the whole modelled reach. s3 ran a
  1-in-4 bed from 1.40 out to x = 6.4, where the slab is 0.2 m BELOW the
  domain floor — so the last 0.8 m was water sliding on the floor, draining
  out of the open bottom edge (q fell 1.20 → 0.98 along it) and being named
  H3 by the overlay. Shorten the domain instead (`W: 5.6` = 1.40/0.25).
- Ground must be solid all the way down. A thin slab leaves a sealed void that
  fills through any opening and then drowns the outfall above it.
- Outer ring: closed edges are stamped solid **last**, so no amount of erasing
  can spring a leak. Edges are tri-state (`open` values): 0 wall, 1 open
  (zero-gradient ghost), 2 outfall (ghost held empty, so the last column
  spills over the edge like a brink). Level controls (left reservoir, right
  tailwater) ride on an open edge and take precedence over outfall.
- A subcritical reach needs a real downstream control — tailwater, brink or an
  outfall edge. The zero-gradient outflow is right for supercritical flow and
  simply ponds a subcritical one: through-flow passes, a still pond sits.
- The reservoir / tailwater panel toggles are self-configuring: they open
  their edge and pick sane level/q defaults, so the sandbox can reproduce any
  scene by hand (that is the acceptance test for control changes).

## Measured, not assumed

Normal depth and Manning's n are read off the solver rather than derived from
`C_f`. The friction slope comes from the computed energy grade line,
`S_f = −dH/dx`; any quadratic drag gives `S_f ∝ q²/d³`, so

```
d_n = d·(S_f/S₀)^⅓        n = d^⅔ √S_f / V
```

This matters because the effective resistance is **not** just `C_f`: the no-slip
wall adds stress through the eddy viscosity, and a sloping bed rasterised onto a
Cartesian grid is a staircase whose steps are genuine form roughness. At ~8 cells
of depth the delivered `n` is ~0.07 almost regardless of `C_f`; at ~25 cells it
drops towards 0.02. **Deeper flows relative to Δx are the lever**, not the
roughness slider.

Consequences for scene design:
- Mild vs steep needs S₀ chosen against the *delivered* roughness, not the
  nominal one. The steep scenes run at 1 in 4 with q ≈ 1.2 m²/s to get enough
  cells per depth. The critical-slope scene is the extreme case: d_n = d_c
  lands at S₀ ≈ 1 in 9.5 with C_f ≈ 0.02 — found by measuring `dnGlobal`
  against d_c and iterating, because no closed-form C_f relation survives the
  wall function + eddy viscosity + bed staircase. A broad-crested weir ponds
  ~1.5 d_c of head above its crest, so a weir meant to make zone 1 without
  drowning an upstream gate must be LOW (the old 0.30 m crest turned the whole
  scene into one M1 pool).
- Zone-3 reaches on mild/horizontal/adverse beds are short, because the high
  delivered resistance pulls the jump close to the supercritical entry. A gate
  that is even slightly drowned puts a roller directly on its own jet, and the
  depth-averaged Froude number then never reads supercritical — physically
  correct, useless as a demonstration.

Depth and discharge are averaged in **time** per column before classification,
not space: roll waves travel and average out, while a jump or a short zone-3
reach stands still and survives. A spatial window wide enough to swallow a roll
wave is also wide enough to erase the reaches that matter.

## Verified numbers

- **Water hammer** (`hammer`): v₀ = 2.79 m/s, c = 70, static head 21.1 m. Peak
  39.0 m against Joukowsky 41.1 m (−5%, friction + wave damping); square wave
  with period 3.0 s against 4L/c = 2.8 s.
- **Torricelli** (`jet`): efflux 5.62 m/s against √(2gh) = 5.8 m/s (Cv ≈ 0.97).
- **Venturi**: nozzle jet 19.4 m/s against √(2gH) = 20.3 m/s.
- **Mass balance** (`m2`): q = 0.251 in, 0.215–0.261 out, total volume steady.
- **Flow establishment** (`estab`): t₇₅ vs ln 7·l·u_max/(2gH) over the ten-level
  ladder fits at 101% of theory (R² 0.998), k = 4.2–4.3 throughout, and t₇₅ is
  c-independent (30 vs 60: ~2%). The scene exists because hammer cannot host
  this: there the rise finishes inside one wave transit.
- **Conjugate depth** (`h23`, after the retune to q = 0.5): Fr₁ = 2.24,
  d₁ = 0.162 m, d₂ = 0.416 m against ½d₁(√(1+8Fr₁²) − 1) = 0.438 m, −5%. At
  the old q = 0.22 the same measurement read +65% — the jump was submerged,
  not free, so the number the scene invites you to check was meaningless.
  On a STEEP bed expect the measured d₂ to sit well under the prediction
  (s1: −39%): the horizontal-bed momentum balance has no weight component,
  and s1's bed falls 1 in 4.

Every scene has been run headless to t = 120 s and measured for steadiness
(d h/dt), temporal flutter, surface waviness and discharge continuity. The
steady scenes hold their profile to <1%/s with volume flat to a fraction of
a percent; m1's median surface curvature is 0.003% of its mean depth. The
exceptions are honest physics, not drift: the 1-in-4 chutes (s1, s2, s3)
carry roll waves at Fr ≈ 2, and s1's roller sloshes because a 1.6 m pool is
far shorter than the ~6 d₂ a jump of that size wants.

**Residual surface waves are not all the same problem — localise them before
tuning anything.** Record the per-column temporal standard deviation of the
surface elevation over a long window and read it as a function of x; where it
is largest tells you the source, and the two sources want opposite fixes:

- *Largest at the inlet, decaying downstream* → the reservoir level is pinned
  away from what the arriving profile wants. m2 stood 37 mm at x = 1.3 m with
  its level held 0.15 m under the depth the flow was actually running at;
  matching the level halved it to 17 mm.
- *Small at the inlet and GROWING downstream* → local amplification, and no
  boundary setting will touch it. c13 grows 18 mm → 48 mm along its reach
  because Fr ≈ 1 makes (1 − Fr²) vanish. m2 does the same, mildly, into its
  brink (22 → 31 mm) — near-critical amplification at the overfall.

So m2's waves were half boundary (fixed) and half brink (intrinsic); c13's
are entirely intrinsic. Neither is solver drift.

**The Froude view is the only display mode built from two different fields**,
so it is the only one that can show structure the flow does not have. Water,
head, speed and vorticity are per-cell; Froude divides a per-cell velocity by
the per-column depth from the reduction. When something looks banded there and
nowhere else, work through it in this order:

1. *Is the depth to blame?* Usually not — measure it. On a23's apron the
   column-to-column jitter is under 5% with no dropouts, and the display
   already lerps between columns.
2. *Is it the numerator?* This was the real one. `length(U.rg)` includes the
   VERTICAL velocity, and |w| exceeds |u| in 30% of wet cells inside a
   breaking roller, so every plunging wave face rendered as a vertical warm
   streak. Fr is u/√(gd); use `abs(U.r)`. Measured on the apron, cells reading
   supercritical fell from 1.5% to 0.1% and warm cells from 4.9% to 1.6%,
   while the genuinely supercritical chute was untouched (73% → 71%).
3. *Is it the ramp?* `divg` is diverging about Fr = 1 by design, so it is far
   more sensitive near critical than `turbo` is anywhere. Ordinary turbulent
   fluctuation therefore reads as banding in the Froude view and as nothing at
   all in the speed view — that contrast is a clue about the colour map, not
   evidence of a numerical artifact.

Neither the rasterised bed staircase nor any "column-wise" solver structure is
involved; the solver is fully 2D and its velocity field is smooth.

**Surface waves are damped by RESOLUTION, not by any parameter.** In the
flumes, zeroing the bulk viscosity, the Smagorinsky term, the bed friction or
the interface compression each moves the decay almost not at all (H at 6 m
stays 0.02–0.03 m in every case); tripling the paddle stroke takes the height
arriving at the beach from 0.014 m — exactly one cell, i.e. no wave — to
0.065 m. A wave has to be tall enough in CELLS to survive an interface that is
itself ~2 cells thick. Consequences:

- Short waves are the worst case, because steepness caps H at ~0.14 L. The
  deep-water flume (L = 1.26 m) loses H = 0.36 → 0.07 m over 3 m, so its
  orbits must be read near the paddle. Long waves are nearly free: the
  shallow-water flume holds 0.123 → 0.121 m over 5 m and then *shoals* to
  0.152 m on the beach.
- Do not "fix" that by shrinking the tank. Halving the deep flume to W = 6
  improved Δx but put the beach 3 m from the paddle: the reflection built a
  standing wave (H = 0.49 m at x = 1) and the orbit decay collapsed from 244×
  to 16×. Reverted.
- **Plunging breakers are out of reach.** The Iribarren number on the 1 : 3.4
  beach is ξ ≈ 1.3, squarely in the plunging band, so the *conditions* are
  right — but an overturning tongue is thinner than the interface can hold.
  Measured trapped air under the crest never exceeds 7 mm, i.e. half a cell:
  the breaks are spilling, and no parameter set changes that.

Orbital motion itself is right, and worth trusting: at d/L = 0.23 the measured
horizontal amplitude at the bed is 0.37 of the surface value against 0.44 from
`cosh k(z+d)/sinh kd`, and the vertical component vanishes at the bed as it
should. In the deep flume the vertical falls 244× and the horizontal 3.2×.
When measuring this, fit the Fourier component AT THE PADDLE FREQUENCY — a
raw standard deviation picks up the flume's own seiche, which is depth-uniform
and made deep water look like it had no decay at all.

**Speed.** m2 is the heaviest scene in the set: 1265 × 75 cells at
Δt = 2.0e-4 needs ~4900 substeps per second of simulated time, ~0.23 ms each,
so it runs at roughly 0.9× real time and there is no bug to find. `analyse`
costs 0.5 ms per frame against that — well under a percent. If a scene feels
slow, check `state.rt` in the status bar before suspecting the overlay.

## The view

### The colour range is held, not tracked

Every field is painted over an explicit `[lo, hi]` in its own units
(`u_lo` / `u_hi` in the display pass), seeded from the scene's own value and
printed on the legend. The range does **not** follow the flow: `Fit`
rescales once, from the frame it was clicked on, to the 1st–99th percentile
over wet cells, and then holds.

That is deliberate. A range that tracked the water would mean the same
colour was a different number from second to second, so two frames could not
be compared and neither could two students' screenshots — which is the
entire reason for printing a scale. Percentiles rather than min/max because
one cell at a jet's lip otherwise sets the scale for the whole picture and
everything else renders as a single flat colour; wet cells only (`f ≥ 0.5`)
because a dry cell is not water — its stored pressure is zero and averaging
it in drags every scale towards the floor.

The diverging fields keep their meaningful centre when they are rescaled:
`nrmMid` maps the two halves separately, so Fr = 1 and ω = 0 stay on the pale
band whatever the ends are. A midpoint taken from the range would move the
critical line, which is the one thing that view exists to show.

`SIM.fieldStats(mode)` does the readback, and its arithmetic has to agree
with the branch of `FS_DISP` that paints that mode. A `Fit` that leaves the
picture saturated or flat is the symptom of the two having drifted apart.

- **The vertical exaggeration is fitted to the window, not 1:1.** `autoVex()`
  picks the stretch that makes the domain fill `VEX_FILL` (62%) of the canvas,
  clamped to [1, 8]; `state.vexAuto` says nobody has taken the number over
  yet. A scene's own `view.vex` wins and clears the flag, as does the slider
  or a drag on the letterbox band; `resetZoom` (the `0` key) returns to the
  fitted value rather than to 1:1. It is recomputed on resize and whenever
  the side panel opens or closes, because both change what "fills the window"
  means. A 14 m × 2 m flume at true scale is 23% of a desktop window and 14%
  of an upright phone, which is a 0.1 m wave a couple of pixels tall — and
  the ruler, the scale bar and the ∇ markers all follow the same rect, so
  nothing on screen stops being true.
- **Screen-anchored overlay furniture follows `view.vis`** — the visible part
  of the domain — so the frame, the scale bar, the legend and the label
  clamps stay on screen zoomed in.

## Measurement gotchas

- **The Control volume is a momentum budget, not a dial.** The control-volume
  integral takes its faces on grid lines, skips solid-adjacent face segments,
  and carries no gravity term in F→. A box enclosing a
  source (spout footprint, level-control sponge) is not measuring a force —
  `mdot` is the closure check and fails loudly there. Trust a number only
  once a second, differently-placed box agrees (~1% steady, 5–8% churning);
  worse means a face is cutting a pressurised cavity and reading its P term
  as force. Every box also carries its enclosed bed/duct-wall drag (~82 N/m
  per metre, measured on LL-1), so keep boxes short; and a face inside a
  pressurised bore reads ρ·f·g·h, not ρgh (`f = 1 + gh/c²` — +4% at 21 m of
  head at c = 70).
- **The same box also reports the whole budget, edge by edge** (`SIM.boxFlux`,
  `B` cycles what the edges are labelled with). Everything is
  outward-positive and per metre of width: `Q` volume, `M` momentum flux,
  `Fp` pressure force, `Ė` energy. `M` and `Fp` are kept apart rather than
  summed — distinguishing them is the content of a control-volume question —
  and their sum is exactly what `boxForce` returns, which `smoke.js` asserts
  so the two integrals cannot drift.
- **`Q` and `ṁ/ρ` are not the same number, and the gap is the compression.**
  `Q` uses `min(f, 1)`, the geometric volume; the mass terms use `f`, which
  IS the density here. Below the surface `f > 1` — that is what the pressure
  is — so the water always carries more mass than volume, by `p/(ρc²)`:
  0.8% on m1 at the usual celerity, and more wherever a run is pressurised.
  Never "fix" one to match the other.
- **Air contributes nothing, by weighting rather than by a threshold.** Every
  term in the budget carries `f`, so an empty cell adds zero and a half-full
  one adds half. A cut-off would put a step in every reading taken across a
  wavy surface, which is exactly where these boxes get drawn.
- **The flux tool is the same integrand over a line you drew** (`SIM.lineFlux`).
  Its normal is the drawing direction turned a quarter-turn clockwise, so a
  section drawn UP has its positive side downstream — draw across the flow the
  way you would draw a section on paper and the sign comes out as expected.
  It is exact only along a cell face; at an angle it interpolates the
  staggered velocities, the same thing the rake and the orbit tracers do.
  `smoke.js` checks a vertical section against the control-volume face it lies
  on, which is the only way to know the two integrals still agree.
- **A section reports all four at once** — Q, the momentum flux M, the
  pressure force F and ρgQH — with M and F kept apart, because telling them
  apart is the control-volume question. Two sections then give the momentum
  theorem directly: the force on whatever lies between them is
  `(M₁ − M₂) + (F₁ − F₂)`, both sections carrying their own normal, so the
  upstream one flips when they are read as the two ends of a control volume.
  That is the same number `boxForce` reports for a box drawn between them.
- **New tools are APPENDED to `TOOLS`, whatever group they belong to.** The
  digit a tool answers to is its index, and every worksheet in the pack refers
  to tools by digit — inserting one renumbers the rest and makes the printed
  sheets wrong. The strip's groups name their tools explicitly (`toolItems`)
  precisely so the two orders can differ.
- **The budget's own closure is a property of the SCENE, not of the integral.**
  Σ Q over the four faces is continuity, and it only vanishes once the reach
  is steady — mid-spin-up a box is still filling and closes to tens of per
  cent. The card prints the residual as a percentage of what came in for that
  reason. Do not gate on an absolute closure; gate on the two integrals
  agreeing with each other, which is what the physics suite does.
- A fast-math shader compiler is entitled to fold away `isnan()` and `x != x`.
  The NaN guards are written as explicit range tests for that reason.
- `readPixels` from a float FBO must use `RGBA`/`FLOAT`, which is why `U` and `F`
  are RGBA32F rather than RG32F.
- Bed slope is estimated by a running mean of per-cell bed drops with outliers
  **dropped**, not clipped: a rasterisation step is exactly one cell and must be
  kept (clipping it reads the slope ~40% low), while a brink is tens of cells
  and must be excluded entirely.
- Only classify water that is **standing on something**. The ±0.12 m guard
  either side of a cliff is not enough on its own: past a brink the falling
  sheet keeps producing a "bed" (wherever the water happens to reach) and a
  depth, so m2 grew a confident M3 label over 2 m of waterfall, c13 the same
  and s3 an H3. Those columns were also feeding the d_n median. The test that
  works is the solid mask — a channel column has a wall directly under its
  lowest wet cell, a nappe does not (`analyse` checks `mask[jb−1]`).
- `spinup` is a MEASURED settle time, not a guess: the last moment the 10 s
  running-mean depth profile is still more than ~3% of mean depth away from
  its final shape. Measure it over a long run, because the answer is not
  intuitive — m1 arrives in 25 s but m2, at the same slope and discharge,
  takes 85 s (a drawdown has to propagate the length of the reach several
  times). Scenes whose flutter is genuine — the steep chutes' roll waves,
  s1's roller — never fall below tolerance at all; for those the mean profile
  is there almost at once and only the fluctuation remains, so a short
  spin-up is the honest setting.

## Hydropower scheme (`hydro`): the surge shaft

The first scene built entirely from `params` (six of them: the knee's x and
z, the headrace, penstock and shaft bores, the nozzle gap) and the reason the
Geometry panel grew from four rows to six. Every solid is derived from the
params in one place (`geom` in js/scenes.js): the penstock is a slab along
the axis knee → (60, 3) whose two wall lines are intersected with the
headrace invert, the shaft's right wall and the level tailpipe, so moving a
slider re-mitres the corners rather than leaving a notch. Three big solids
(ground, headrace roof, penstock roof) and two nozzle plates; the shaft is the
gap between the two roofs. Three small hooks were needed and all are
additive — a scene taking the old arguments never sees them:

- `walls(W, H, par)` and `valves(W, H, par)` get the live params, so the
  valve seg can span exactly the penstock bore its solids() drew (a valve
  seg reaching into the roof turns roof cells into valve texels, which are
  OPEN while the valve is open — a notch in the rock).
- `water(x, z, P, par)` gets them too, plus `P.level` (the live reservoir
  slider, NaN when the control is off), so the fill follows both the
  geometry and the slider. It fills no solid cell, on purpose: a column read
  mid-headrace has to be the bore alone or V = q/d is not the bore-mean.
- `flow(x, z, P, par)` — an initial velocity field, written by
  `resetWater()` onto the staggered faces. From rest the establishment IS a
  load-acceptance surge: the shaft swung ±4 m and was still ±1 m at 60 s
  (measured), because quadratic friction damps a mass oscillation
  algebraically. Seeded with the estimated steady plug
  (q₀ = 0.76·gap·√(2g(level − 3)), the shaft started k·u₀² down, both
  constants measured at the defaults) the residual is ±0.3 m for the first
  20 s and ±0.1 m after. A slider the estimate does not follow just costs
  settle time.

Measured, at Medium (dx = 0.161 m; the ladder is HP-3's, D_s = 2.5–7.0 m):

| quantity | value |
| --- | --- |
| headrace bore-mean u₀, mid-length | 2.50 ± 0.02 m/s, identical across the ladder |
| reservoir free surface by the wall | 24.87–24.92 m against the 25.0 slider |
| shaft drawdown z₀ | 0.31–0.43 m, of which u₀²/2g is 0.32 |
| headrace HGL drop, x = 22 → 44 m, 30 s mean | 0.02–0.05 m → Darcy f ≈ 0.03 with D_H = 2D_h |
| first crest above the reservoir | 5.16 → 3.22 m; 0.91–0.98 of u₀√(L·D_h/(g·D_s)); within ±5% of the rigid-column crest with the measured k |
| period, first two crests | 14.9 → 23.7 s; 1.17–1.26 × 2π√(L·D_s/(g·D_h)) |
| valve head after the slam | peak ≈ 42 m, minimum 1.8–9 m (no cavitation) |

Things that were tried and what they taught:

- **The friction knobs barely move a 19-cell bore's loss.** cf 0.004 → 0.3
  and cs 0.05 → 0.3 changed the 22 m HGL drop between 0.02 and 0.05 m; what
  they change is the bore-mean velocity (2.5 → 2.06 m/s at cf = 0.3),
  because a strong wall function stalls the wall cells and the core runs
  through a narrower pipe. The delivered f ≈ 0.03 is a realistic rough-pipe
  number; it is simply that 14 bores of pipe lose a tenth of a velocity
  head. The scene ships cf = 0.05 (twice the HGL drop of hammer's 0.004).
- **Instantaneous heads in the bore wobble ±0.3 m** at the slot's organ
  mode, against a 0.04 m friction drop: the friction-factor measurement
  needs Average (a 30 s window reproduces the 30 s probe means to 0.01 m).
  The entry vena contracta depresses the head to x ≈ 15 m and it recovers
  by x ≈ 22; gauges in that stretch read a NEGATIVE friction slope.
- **The column surface is quantised to whole cells** here (the top cell is
  either over-full or empty under the slot EOS), so the d channel moves in
  0.16 m steps; the h channel is continuous — and under the accelerating
  column at the crest it reads a·D/g low, about a metre for a gauge 12 m
  under the crest at D_s = 3 (a = (D_h/D_s)(g/L)·z_max ≈ 0.9 m/s²). Hence
  the brief's protocol: h for the still levels, d for the crest.
- **Narrow shafts throttle themselves**: at D_s = 2.0 the crest is 16%
  under the curve, at 1.5 m 21% under (the entry loss into the shaft), so
  the ladder starts at 2.5. **Wide shafts reflect the water hammer in
  full**: at c = 70 the valve's downsurge reached 0.4 m of head at D_s = 8
  (the slider's top), so the scene runs c = 60 (1.8 m at 7, 0.8 at 8).
- **The nozzle gap stops at 0.9 m — and the cap has to be found from
  BELOW.** It first read 1.2 m, set by measuring 1.44 m (9 cells) fail and
  stepping back a guess. That guess was wrong: swept in 0.1 m steps at
  Medium, with no slam at all, the steady run is clean to 0.9 (q₂₀ = +12.2,
  and the discharge past the nozzle stays dry: p/ρg = 0, f = 0 at (67, 2)),
  marginal at 1.0 (f = 0.08, 9.4 m/s down the penstock — the same 9 m/s the
  1.44 m note already blamed), pressurising at 1.1 (p/ρg = 2.5 m, f = 1.01)
  and fully collapsed at 1.2, the old stop itself: **q₂₀ = −17.6 m²/s,
  reversed, with 36 m of head standing in what should be atmosphere.** The
  tell on screen is a saturated block past the nozzle and a chaotic bore.
  Part C of the tutorial sheet asks the student to sweep this slider to its
  top, so the broken rung was on the worksheet's own path. 0.9 holds 7.0 m/s
  in the penstock and survives a slam (p/ρg = 0 in the discharge, no
  cavitation, 7.7 m minimum at the valve).
- **The jet stays at √(2gH)** over the whole gap range (20.6–21 m/s against
  20.7), so the maximum-power coda (h_f = H/3) cannot be reached on this rig
  any more than on hammer's — HP-1's throttle plate is the answer there too.
- **The period's excess** is mostly the shaft's own inertia
  (L + h_s·D_h/D_s closes half of it, h_s ≈ 9 m) and the slot's elastic
  storage (a 42 × 3 m headrace at c = 60 stores 0.34 m² per metre of head
  — 14% of a 2.5 m shaft's area).

## Polygon geometry

`js/geom.js` (`GEOM`) is the RECON pattern applied to shapes: pure numerics,
no WebGL, no DOM, pinned against closed-form answers in
`test/geom-test.mjs`. A later polygon rasteriser (`js/sim.js`) and a
pressure-force instrument are built on it, so its conventions are worth
having settled before anything calls into it.

- **CCW winding fixes what "outward" means, and nothing checks it for you.**
  A solid's verts run counter-clockwise; `edgeNormal` takes an edge's
  tangent and turns it a quarter-turn clockwise to get the outward normal.
  Wind a polygon the other way and every normal silently points into the
  water instead of out of it — no exception, no NaN, just a pressure force
  pushing the wrong way. `test/geom-test.mjs`'s G2 pins the convention down
  directly: every edge normal of a rectangle must point away from its own
  centre.
- **Faces are runs of consecutive edges, not index lists**, because that is
  the only shape a stretch of polygon boundary can take, and it lets a run
  that wraps past the last vertex (`e0 > e1`) be written as two numbers
  instead of an array. `faceEdges` resolves the wrap; `faceSamples` walks
  it to produce the points a pressure-force integral consumes, each carrying
  its outward normal and an arc-length coordinate `s`.
- **Curves are polyline-sampled, not kept as true arcs**, at a spacing fine
  enough that the chord's sagitta sits far below the finest cell the app
  runs at (Δx ~ 2.6 mm at Ultra) — `arcPts` bounds each segment's own arc
  length to 0.02 m by default, `humpPts` the same in x. Once sampled,
  everything downstream (a rasteriser, `contains`, `faceSamples`) only ever
  has to reason about straight edges, which is what keeps the geometry
  layer small.
- `test/geom-test.mjs` holds the closed forms that would otherwise have to
  be trusted by eye: a slab's exact butt-end corners, the winding/normal
  convention, point-in-polygon on an axis box and a slanted slab, an arc's
  endpoints and length, a hump's symmetry and zero end slope, and the
  textbook hydrostatic force and centre of pressure (`rho*g*H^2/2` and
  `H/3`) on a vertical face — the same closed form a lab manual would use
  to check a submerged gate by hand.
- **The anti-leak edge stroke is skipped when every MERGED run of
  near-collinear edges is at least 2 cells long** — `stampPoly`'s comment in
  `js/sim.js` has the full reasoning; the short version is that a pinch a
  scan-fill test alone can miss needs either a genuinely short stretch of
  boundary (a capsule's own butt end is one) or a shallow-angle long stretch
  sitting close enough to a neighbour to leave a cell-centre gap, and
  neither can happen once nothing on the solid is that short — so the fill
  test alone is exact and the stroke has nothing left to protect.
  `stampPoly` merges consecutive edges whose turn is under ~20° into one run
  before measuring length, because a smoothly curved face is
  polyline-sampled fine enough (the hump crest, `GEOM.humpPts` at n=160,
  ~0.025 m chords) that its individual edges are far shorter than a cell
  while the STRETCH of boundary they trace needs no seal at all; a real
  corner still starts a new run, so a genuinely short edge (a gate blade's
  0.05 m end) is never merged away and still triggers the stroke on its own.
  The guard holds for any solid, convex or not, PROVIDED no two stretches of
  its own boundary pass within a cell of each other while every merged run
  along the way clears 2·dx — a folded strip whose two long near-parallel
  sides are pulled that close together could still pinch with every run
  long, and would need its own check. Nothing shipped does that:
  `GEOM.poly`/`slab`/`rect` are convex, and the hump crest (one non-convex
  curve with two corners, at its butt ends, each its own run) does not
  fold back on itself. Skipping the stroke matters because the stroke
  itself has a cost: it overshoots by painting solid up to ~0.85·dx OUTSIDE
  the true edge, on the water side too, and MEASURED on s3's gate blade
  (5 cm wide, faces stroked before this fix) that overshoot at Low
  (dx = 0.0193 m) reached past `faceForce`'s own 0.75·dx sampling offset, so
  every upstream-face sample read solid and Fx measured 0 N/m regardless of
  pool depth. Skipping the stroke on a solid that clears the 2-cell floor
  restored a real pressure diagram: **Fx = 9.61 kN/m against a ~8.94 kN/m
  hydrostatic estimate** (`exercises/_runner/smoke.js`'s closed-form case
  has the derivation and the run-to-run spread — the two are not expected to
  match exactly because the diagram integrates the actual flow field, not
  still water).

  Before the merge existed, the per-edge version of this same threshold read
  the hump's 160 crest chords as 160 separately-short edges and ran the
  stroke around the WHOLE hump at both Low (dx = 0.0215 m) and Medium
  (dx = 0.0148 m, the default) — its rim swallowed `faceForce`'s sampling
  offset there too: at Medium, `APP.faceForce("hump","crest")` on the
  settled hump (hump_h = 0.15, t = 30 s) read only 122 of 320 samples wet
  (38.1%) against a crest that is fully submerged at this height, so the
  flagship curved-face pressure demo was reading well under half its true
  integral. Merging near-collinear edges makes the crest one ~4.0 m run
  (its two vertical butt ends stay their own ~0.85 m runs), the stroke is
  skipped again, and the same read comes back 320 of 320 wet (100%). The
  threshold reads the LIVE `S.dx`, so a coarser future budget that thins a
  merged run below 2 cells gets the stroke back automatically.
- **The shim (a scene still declaring `walls()` instead of `solids()`)
  rasterises byte-for-byte identically to the old path** — same `stampSeg`,
  same capsule, same measured geometry — which is the promise that lets 20
  pre-existing scenes go untouched by this branch. `smoke.js` measures the
  diff directly on the sandbox's drawn segments: at Medium the segments
  clear the same 2-cell floor as s3's gate, so the stroke never runs on
  either the reference or the polygon path and there is no rim left to
  produce a difference — diff/solid measured **0 of 3356 cells, 0.00%**.
  The 20% gate this check runs under still passes, but for a different
  reason than before the stroke-skip landed: an exact fill match, not a rim
  comfortably inside budget.
- **`params` is additive to the rig wire format and does not bump `V`** — the
  same reasoning `js/rig.js`'s own comment on `V` gives for `flux` and
  `ui.cvShow` at v2 applies again: the version bump exists to catch a
  RENAMED or REDEFINED key silently misloading, and neither hazard applies
  to a purely additive optional key. An old rig with no `params` reads as a
  scene's own defaults (nothing to apply); a rig carrying `params` read back
  by code that predates this branch simply ignores a key it does not know.
  Both directions degrade to the truth, so `V` stays 2 — bumping would
  reject all the v2 captures in `js/exercises-rigs.js` for zero benefit, the
  same trade the comment already made once.
- **The pressure-diagram arrow is built in screen space, not domain space,
  and that is not optional.** Pressure has no tangential component, so the
  per-station arrows in the Force tool's diagram (drawn in `overlay.js`'s
  `drawForce`) MUST render perpendicular to the face — but the view
  transform is anisotropic under vertical exaggeration (`V.w/sim.W !=
  V.h/sim.H`), so offsetting a sample along its DOMAIN normal and only then
  mapping it through `V.X`/`V.Y` is perpendicular on screen only when the
  face happens to be axis-aligned or vex = 1. `drawForce` instead builds
  each arrow's direction from the SCREEN-SPACE tangent between neighbouring
  already-mapped samples (a quarter-turn gives the screen perpendicular),
  and uses the domain normal only to choose which of the two screen
  perpendiculars points into the solid. The resultant arrow is drawn
  differently again — in true screen proportion, no vex — because it is a
  force vector, not a shape glued to the water, and an angle on it is one a
  straightedge on the screen should be able to measure.
- **Every wetted surface is clickable, and the wrappers that make it so are
  REGISTRATION-only — they never touch the mask.** `rasterise()` stamps the
  mask exactly as it always did, and only once that is done does it extend
  `S.solids` with a `GEOM.slab` wrapper for every scene `walls()`/`valves()`
  seg and every user-drawn wall/valve stroke, built from the SAME seg the
  mask was stamped from. A wrapper therefore cannot move a cell the mask
  did not already move — the acceptance test is that the mask stays
  byte-identical to before this existed, which is exactly what the ordering
  (wrap after stamp, never instead of or interleaved with it) guarantees.
  Each wrapper names all four edges — `side0`/`side1` (the long faces
  `GEOM.slab` already knew) and `end0`/`end1` (the butt ends it did not),
  because a drawn gate's lip is a butt end and has to be pickable exactly
  like its long faces are. Scene `solids()` entries are untouched: they
  carry their own faces and were already pickable.
- **A wrapper says where a surface WOULD be; the mask says where it IS, and
  `faceForce` trusts the mask.** A wrapper is built once per `rasterise()`
  from a seg, whether or not an eraser stroke later punches a hole through
  the middle of it or a valve later opens — the wrapper has no way to know.
  So every sample `faceForce` takes is checked twice: once at its usual
  0.75·dx offset OUT into the water (the valve-aware test `boxForce`'s own
  `sol()` uses, `m > 192` or, while the valve is shut, `m > 64`), and once
  0.5·dx the OTHER way, IN along `−n` — a second, independent point inside
  where the wrapper claims the solid is. If that texel is not solid under
  the same test, there is no surface there regardless of what the wrapper
  says, and the sample zeroes exactly as it would off the end of a wall that
  was never drawn. The consequence students actually see: an OPEN valve's
  faces both read zero force (there is no surface to press on), a CLOSED
  valve reads the real diagram — the water-hammer teaching number — and an
  erased hole in a wall contributes nothing to the integral either side of
  it.
