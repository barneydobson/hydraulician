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

No Poisson solve. Two fullscreen passes per substep: `vel` then `vof`.

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
  gauge/rake readbacks.
- `js/overlay.js` — `OVERLAY`: the 2D canvas. y_c, y_n, energy grade line,
  surface-profile classification, jump detection, gauge charts, velocity rake.
- `js/main.js` — boot, panel spec, pointer tools, frame loop, `window.APP`.

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
  cells per depth.
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
  (physics only), `APP.probe(x,y)`, `APP.volume()`.
- A fast-math shader compiler is entitled to fold away `isnan()` and `x != x`.
  The NaN guards are written as explicit range tests for that reason.
- `readPixels` from a float FBO must use `RGBA`/`FLOAT`, which is why `U` and `F`
  are RGBA32F rather than RG32F.
- Bed slope is estimated by a running mean of per-cell bed drops with outliers
  **dropped**, not clipped: a rasterisation step is exactly one cell and must be
  kept (clipping it reads the slope ~40% low), while a brink is tens of cells
  and must be excluded entirely.
- Keep dependency-free and classic-script; no modules, no bundlers, no fetch.
