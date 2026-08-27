# hydraulician

Interactive 2D hydraulics in the **vertical plane** (GPU, WebGL2, zero deps, no
build step). Serve statically (`python3 -m http.server`) and open `index.html`;
`.claude/launch.json` has a preview config named "hydraulician" on port 8124.
`?scene=<id>` boots straight into a scene.

Sibling project to `hydraulics-fun` (plan-view shallow water). This one resolves
the depth, so it can show what a depth-averaged model cannot: velocity profiles,
jets, rollers, pressurised pipes and water hammer.

## The model

Full derivation in `docs/numerics.md` — multiphase (one-fluid VOF) 2D
Navier–Stokes → heavy-fluid limit → piezometric head → weakly-compressible
closure → discretisation → walls. That file is the place to
put anything a reader needs to *understand* the scheme; keep this one for what a
contributor needs to *not break* it.

Barotropic **weakly-compressible Navier–Stokes** on a staggered (MAC) grid, with
the cell fill fraction `f` doubling as the density:

```
∂f/∂t + ∇·(f u) = 0                      exact, flux form
∂u/∂t + (u·∇)u  = −∇P + χ(f)·g + ν_T∇²u − 1_wall·C_f|u|u/Δ
P = p/ρ₀ = c² max(f − 1, 0)              equation of state
```

`χ = smoothstep(0, 0.05, f)`
is what survives of the multiphase weight `ρg → f·ρ_w·g` in the heavy-fluid limit
(`ρ_w/ρ_a ≈ 800`): no water in a cell, no weight. With the air phase dropped
`ρ → 0` in a void, the per-unit-mass momentum equation degenerates to `0/0`, and
the velocity stored there is an extension field that must not be accelerated. `1_wall` restricts the friction to cells touching a
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

Three guard rails, each bought with an explosion:

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
  the MEASURED weir backwater at the inlet, not y_n): pinned lower, the
  boundary chokes the backwater and shed ripples for ever. An adaptive
  "ride the backwater" inlet was tried and reverted — it hunts (visibly on
  M2) and can self-feed at steep crests; so was a pressure-feedback rating
  on the plug — it neither hurt nor helped.
- **A tailwater must stand clear of critical depth.** Re-check it every time
  `q` changes, because `y_c = (q²/g)^⅓` moves with it. A subcritical level
  control set AT y_c is degenerate: the outlet chokes at critical, the reach
  stops taking its depth from the control, and the one-cell Dirichlet argues
  with the flow it is supposed to be setting. h23 shipped with `tail` = 0.170
  against y_c = 0.170 and a23 with 0.160 against 0.170 — one exactly on the
  knife edge, one *below* a depth the outlet cannot hold. Lifting h23 to
  1.5 y_c alone halved its drift and took the flutter from 19% to 12%.
  1.3 y_c is a safe target, but it is a floor to clear, not a value to aim
  at: how far above y_c you can go is set by what the reach has to read.
  Raising m3 from 1.08 to 1.3 y_c lifted its apron above y_n and turned the
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

## Architecture

- `index.html` — markup, all CSS, classic script tags (no modules, so `file://`
  double-click works). The panel is generated from a spec in `main.js`.
- `js/gl.js` — `GLH`: programs, float textures, FBOs, ping-pong pairs, and
  bufferless fullscreen-triangle / rect / POINTS draws.
- `js/shaders.js` — `Shaders`. Five passes:
  - **vel** — 3rd-order upwind advection (low dissipation, so jets stay crisp
    over the thousands of substeps a hammer run needs), Smagorinsky eddy
    viscosity, wall-aware Laplacian (no-slip or free-slip), gravity gated on
    fluid presence, implicit bed friction, then `∇p` from the EOS. Velocity in
    voids is advected and slowly bled away rather than zeroed — hard-zeroing it
    makes the air a rigid medium whose fake shear layer shreds any free jet
    within a metre of its nozzle.
    **Keep gravity and `∇p` additive** and do not interpose anything new between
    them (`docs/numerics.md` §4), or the hydrostatic state stops being a discrete
    equilibrium. The implicit friction already sits between them, which is why
    the balance is broken in wall-adjacent cells — a ~10⁻¹⁰ m/s-per-substep
    defect at default settings, negligible but do not enlarge it.
  - **Hydrostatic balance is a result, not an assumption.** Nothing imposes
    `∂P/∂z = −g`; it is the condition for rest, and `P = 0` above `f = 1` fixes
    the constant, giving the equilibrium fill `f = 1 + g(η−y)/c²` — which is
    exactly `still()` in scenes.js. `docs/hydrostatic-attractor.js` verifies the
    solver reaches it from a uniform (uncompressed) start: `|∂P/∂z + g|/g` falls
    to 2×10⁻⁶ and the elevation implied by the pressure, `y + P/g`, is one number
    at every depth. It takes ~100 s of simulated time, which is why scenes are
    initialised with `still()` rather than uniform — a cold start would still be
    settling at the end of a run.
  - **vof** — van Leer-limited flux-form advection of `f` (+ two dye channels)
    with an interFoam-style compression flux, and a **donor-cell positivity
    limiter**. See "Conservation" below — this is the single most important
    thing in the file.
  - **col** — per-column reduction → bed, depth, unit discharge, surface. Walks
    the *connected* water body from the lowest wet cell, so a raised flume bed
    or a tank above a puddle is handled.
  - **part** — particle advection (bilinear on the MAC grid) + respawn.
  - **disp** — water / pressure head / speed / Froude / vorticity, letterboxed
    into an NDC rect (`VS_RECT`) so the domain is a fixed physical rectangle
    whatever the window shape.
- `js/scenes.js` — `SCENES`. `channel()` builds a prismatic GVF channel from
  (S₀, C_f, q) plus a control; `drop()` builds approach → chute → apron.
- `js/sim.js` — `SIM`: grid allocation, wall rasterisation, the substep loop,
  `columnBand` control bands, gauge/rake readbacks, and `boxForce` — the
  control-volume momentum integral behind the Force box tool (faces on grid
  lines, solid-adjacent segments skipped, F→ has no gravity in it; a box
  containing the spout encloses a source and is not a force). Live parameters
  (`S.p`, including the open-edge flags) survive a resolution rebuild.
- `js/overlay.js` — `OVERLAY`: the 2D canvas. y_c, y_n, energy grade line,
  surface-profile classification, jump detection, gauge charts, velocity rake.
  Screen-anchored furniture (frame, scale bar, legend, label clamps) follows
  `view.vis` — the visible part of the domain — so it stays on screen zoomed in.
- `js/main.js` — boot, panel spec, pointer tools (wall / erase / valve / spout /
  gauge / rake / tracers / measure / force box), view transform, frame loop,
  `window.APP` (incl. `boxForce` / `placeCV` for headless force reads). The view is the
  whole-domain letterbox rect scaled about a pan centre: wheel zooms about the
  cursor, middle-drag pans, pinch works on touch, `0` resets; the GPU just
  draws the bigger rect and the screen clips it. Every scenario control is live
  in the panel — reservoir, tailwater (with head-driven mode), spout position
  (drag with the tool) and velocity, wave piston (incl. position), open edges
  per side, interface compression, dye lines/fade — so the sandbox can
  reproduce any scene by hand.

## State textures

- `U` RGBA32F — `r` = u at the **west** face of this cell, `g` = v at the
  **south** face, `b` = p/ρ at the cell centre (diagnostic, also what the
  display uses for submergence), `a` = ∇·u.
- `F` RGBA32F — `r` = f, `g`/`b` = dye A/B.
- `S` R8 — 0 open, 128 valve, 255 wall. Rasterised CPU-side from a segment list
  so it can be undone and re-rasterised at any resolution.
- `C` RGBA32F, nx×1 — column reduction: bed, depth, unit discharge, surface.

## Notation

Displayed symbols follow free-surface convention. Three different quantities
get loosely called "head", so keep them apart:

- `d` — water depth of the column.
- `η` — water level: bed + `d`, above datum.
- `h` — **piezometric** head, `h = z + p/ρg`. Absorbing gravity into the
  pressure term turns the momentum equation into `Du/Dt = −g∇h + …`, so `h` is
  the potential whose gradient drives the flow. It is
  constant over the depth wherever the flow is hydrostatic, which is what makes
  its *departure* from constant a direct measure of non-hydrostatic behaviour
  (crests, brinks, gate vena contractas, chute toes, rollers, deep-water waves).
- `H` — energy head, `h + αV²/2g`. Reserved; the overlay's energy grade line
  carries it as `E`.

`SIM.probe().head` is the **pressure** head `p/ρg` with no elevation term — in
hydrostatic water it is just the submergence, so it carries a unit vertical
gradient everywhere wet and is not comparable between cells at different
heights. Rig scripts build the piezometric head themselves as
`y + probe().head` (see `B6-ursell/rig.js`). The name is kept because
`APP.probe()` is a public surface.

The gauge `FIELDS` **keys** (`"head"`, `"depth"`) are serialised into permalinks
and into every `ui.field` in `exercises-rigs.js` — rename the displayed symbol,
never the key.

`y_c` / `y_n` keep the entrenched open-channel symbols for critical and normal
depth rather than `d_c` / `d_n`: they appear across 35 exercise briefs.

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

## Coordinate and geometry contracts

- Domain = a fixed physical rectangle (`scene.W × scene.H`). The grid is sized
  to a cell budget, so changing resolution changes Δx but not the physics, and
  resizing the window only moves the letterbox.
- Wall segments have **butt** ends, not round caps. `[x0,y0,x1,y1,th]` is the
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
- A scene's bed must stay above y = 0 for the whole modelled reach. s3 ran a
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
`S_f = −dE/dx`; any quadratic drag gives `S_f ∝ q²/h³`, so

```
y_n = h·(S_f/S₀)^⅓        n = h^⅔ √S_f / V
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
  cells per depth. The critical-slope scene is the extreme case: y_n = y_c
  lands at S₀ ≈ 1 in 9.5 with C_f ≈ 0.02 — found by measuring `ynGlobal`
  against y_c and iterating, because no closed-form C_f relation survives the
  wall function + eddy viscosity + bed staircase. A broad-crested weir ponds
  ~1.5 y_c of head above its crest, so a weir meant to make zone 1 without
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
  y₁ = 0.162 m, y₂ = 0.416 m against ½y₁(√(1+8Fr₁²) − 1) = 0.438 m, −5%. At
  the old q = 0.22 the same measurement read +65% — the jump was submerged,
  not free, so the number the scene invites you to check was meaningless.
  On a STEEP bed expect the measured y₂ to sit well under the prediction
  (s1: −39%): the horizontal-bed momentum balance has no weight component,
  and s1's bed falls 1 in 4.

Every scene has been run headless to t = 120 s and measured for steadiness
(d h/dt), temporal flutter, surface waviness and discharge continuity. The
steady scenes hold their profile to <1%/s with volume flat to a fraction of
a percent; m1's median surface curvature is 0.003% of its mean depth. The
exceptions are honest physics, not drift: the 1-in-4 chutes (s1, s2, s3)
carry roll waves at Fr ≈ 2, and s1's roller sloshes because a 1.6 m pool is
far shorter than the ~6 y₂ a jump of that size wants.

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
   VERTICAL velocity, and |v| exceeds |u| in 30% of wet cells inside a
   breaking roller, so every plunging wave face rendered as a vertical warm
   streak. Fr is u/√(gh); use `abs(U.r)`. Measured on the apron, cells reading
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

Orbital motion itself is right, and worth trusting: at h/L = 0.23 the measured
horizontal amplitude at the bed is 0.37 of the surface value against 0.44 from
`cosh k(z+h)/sinh kh`, and the vertical component vanishes at the bed as it
should. In the deep flume the vertical falls 244× and the horizontal 3.2×.
When measuring this, fit the Fourier component AT THE PADDLE FREQUENCY — a
raw standard deviation picks up the flume's own seiche, which is depth-uniform
and made deep water look like it had no decay at all.

**Speed.** m2 is the heaviest scene in the set: 1265 × 75 cells at
Δt = 2.0e-4 needs ~4900 substeps per second of simulated time, ~0.23 ms each,
so it runs at roughly 0.9× real time and there is no bug to find. `analyse`
costs 0.5 ms per frame against that — well under a percent. If a scene feels
slow, check `state.rt` in the status bar before suspecting the overlay.

## Gotchas

- The render loop stops when the page is hidden. Headless testing goes through
  `APP.frames(n)` (drives the whole frame including render), `APP.tick(n)`
  (physics only), `APP.probe(x,y)`, `APP.volume()`, `APP.zoomAt(px,py,factor)`,
  `APP.resetZoom()`.
- `exercises/_runner/runner.py` is Linux-bound (`/proc`, X11 probe); the
  macOS shims and their two measured traps are in the runner's own HOWTO.md.
- **`node test/ui-smoke.mjs`** covers the interface, cross-platform and with
  no dependencies (Node 22+ for the global `WebSocket`; `$CHROME` overrides
  the browser it finds). It boots the page four ways and asserts the layout
  agreements — chiefly that the side panel is DOCKED, so `--dock` and
  `canvas.clientWidth` always agree and nothing is drawn underneath the
  panel. Every case in it is a bug that reached the working tree while the
  strip was being built, so a failure there is a real regression rather than
  a tightened expectation. Run it after touching `index.html`, the TOOLBAR
  spec, `DOCK`, `START` or the boot wiring. It needs the GPU-backed
  `--use-angle=d3d11`: the software rasteriser renders a full-window WebGL
  canvas so slowly that a spin-up scene times the run out.
- **The Force box is a momentum budget, not a dial.** A box enclosing a
  source (spout footprint, level-control sponge) is not measuring a force —
  `mdot` is the closure check and fails loudly there. Trust a number only
  once a second, differently-placed box agrees (~1% steady, 5–8% churning);
  worse means a face is cutting a pressurised cavity and reading its P term
  as force. Every box also carries its enclosed bed/duct-wall drag (~82 N/m
  per metre, measured on LL-1), so keep boxes short; and a face inside a
  pressurised bore reads ρ·f·g·h, not ρgh (`f = 1 + gh/c²` — +4% at 21 m of
  head at c = 70).
- A dev browser may serve stale cached JS from `python3 -m http.server`; force
  it with `fetch(url, {cache:"reload"})` then `location.reload()`.
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
  and s3 an H3. Those columns were also feeding the y_n median. The test that
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
- Keep dependency-free and classic-script; no modules, no bundlers, no fetch.
- The pack is described in four places with different jobs, and they do NOT
  collapse into one register: `js/exercises.js` is the machine-readable source
  (what the picker applies, plus the card's two lines), the folder's
  `README.md` is the human brief, `INDEX.md` is navigation whose titles are
  deliberately abbreviated to fit the table, and `demo-programme.html` is the
  dated rev-1 document the pack was built from — history. One shared data file
  is not available anyway: no modules, no fetch and no build step means the
  register has to BE a JS literal the browser runs from `file://`. So the
  DERIVABLE agreements get asserted instead —
  `python3 exercises/_runner/check_pack.py` (stdlib only, exits non-zero):
  folders exist, each README's H1 id and title match its card, every card has
  an INDEX row, a stated "about **N s**" countdown matches `settle`, and a
  printed ten-value digit ladder matches `base`/`step`. Programme-doc titles
  are warnings, never failures. Run it before printing worksheets.
- Briefs carry the minimum needed to RUN the demo, plainly: expected readings
  to ~1 significant figure, statistics and methodology in the folder's
  `_archive/`, hand-placed coordinates on a 5 cm grid (typed values stay
  exact — typing is free). Precision survives only where the point dies
  without it. Rounding a recipe's coordinates makes a NEW geometry —
  re-measure before shipping it.
- The Pages deploy (`.github/workflows/pages.yml`) runs Jekyll over the repo
  so the markdown briefs render as web pages — README.md serves as its
  folder's index, links to `.md` are rewritten to the rendered page, and
  underscore-prefixed folders (`exercises/_runner`, `_code-changes`) are not
  published. The per-exercise `_archive/` folders (each brief's long
  verification record) are not even committed — .gitignore keeps them local
  to this machine. The APP is only copied verbatim because
  `index.html` and `js/*` carry no YAML front matter; never add any. The
  exercise card links to the folder URL on `*.github.io` and to the raw
  `README.md` everywhere else. ```math fences render on github.com but reach
  the Jekyll site as plain code blocks, so README.md and docs/numerics.md end
  with a `<script>` tag loading `docs/math.js` — stripped by GitHub's
  sanitiser, live on the Pages build — which rewrites the blocks and pulls in
  MathJax. Any new published page that carries ```math needs the same tag.
