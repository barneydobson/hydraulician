# hydraulician

Interactive 2D hydraulics in the **vertical plane** (GPU, WebGL2, zero deps, no
build step). Serve statically (`python3 -m http.server`) and open `index.html`;
`.claude/launch.json` has a preview config named "hydraulician" on port 8124.
`?scene=<id>` boots straight into a scene.

Sibling project to `hydraulics-fun` (plan-view shallow water). This one resolves
the depth, so it can show what a depth-averaged model cannot: velocity profiles,
jets, rollers, pressurised pipes and water hammer.

## The model

Barotropic **weakly-compressible Navier–Stokes** on a staggered (MAC) grid, with
the cell fill fraction `f` doubling as the density:

```
∂f/∂t + ∇·(f u) = 0                    exact, flux form
∂u/∂t + (u·∇)u  = −∇p/ρ + g + ∇·(ν∇u) − C_f|u|u/Δ
p/ρ = c² max(f − 1, 0)                 equation of state
```

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
  ten-column relaxation sponge (f nudged to the hydrostatic target, ramped
  quadratically toward the edge) and a torricellian exchange clamp
  `sqrt(2gL)+1`. The prescribed inlet plug is likewise feathered over its top
  three cells (`inletVel` repays the lost discharge) so its hard top edge
  stops waterfalling ripples into the drawn-down interior surface; submerged
  ducts (level above the whole run) keep the full plug.

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
  `columnBand` control bands, gauge/rake readbacks. Live parameters (`S.p`,
  including the open-edge flags) survive a resolution rebuild.
- `js/overlay.js` — `OVERLAY`: the 2D canvas. y_c, y_n, energy grade line,
  surface-profile classification, jump detection, gauge charts, velocity rake.
  Screen-anchored furniture (frame, scale bar, legend, label clamps) follows
  `view.vis` — the visible part of the domain — so it stays on screen zoomed in.
- `js/main.js` — boot, panel spec, pointer tools (wall / erase / valve / spout /
  gauge / rake), view transform, frame loop, `window.APP`. The view is the
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
- Ground must be solid all the way down. A thin slab leaves a sealed void that
  fills through any opening and then drowns the outfall above it.
- Outer ring: closed edges are stamped solid **last**, so no amount of erasing
  can spring a leak. Open edges are zero-gradient ghosts, with optional
  Dirichlet controls (left reservoir level, right tailwater).
- A subcritical reach needs a real downstream control — tailwater or brink. The
  zero-gradient outflow is right for supercritical flow and simply ponds a
  subcritical one.

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

## Gotchas

- The render loop stops when the page is hidden. Headless testing goes through
  `APP.frames(n)` (drives the whole frame including render), `APP.tick(n)`
  (physics only), `APP.probe(x,y)`, `APP.volume()`, `APP.zoomAt(px,py,factor)`,
  `APP.resetZoom()`.
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
- Keep dependency-free and classic-script; no modules, no bundlers, no fetch.
