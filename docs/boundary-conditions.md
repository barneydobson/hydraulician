# Boundary conditions

Every boundary the solver has, in one place: the solid mask and the four
mechanisms that act at a wall, the tri-state outer ring, the level controls
with their sponges and clamps, and the sources that bypass the ring entirely.
This consolidates §5–§6 of [numerics.md](numerics.md) with the implementation
detail in `js/shaders.js` / `js/sim.js` and the measured lore in
[engineering-notes.md](engineering-notes.md); where a number was bought with a
blow-up, the story is there, not here.

[Solid mask](#1-the-solid-mask) ·
[Walls](#2-conditions-at-a-solid) ·
[Outer ring](#3-the-outer-ring) ·
[Level controls](#4-level-controls) ·
[Sponges & clamps](#5-what-keeps-a-level-control-stable) ·
[Interior sources](#6-sources-that-bypass-the-ring) ·
[Edge ownership](#7-who-owns-an-edge) ·
[Uniform map](#8-uniform-map)

---

## 1. The solid mask

Geometry is a **rasterised bitmask** — no cut cells, no immersed-boundary
reconstruction. Solids live in an `R8` texture (`S.solid`) stamped CPU-side
from a segment list by `rasterise()` in `js/sim.js`, so edits can be undone
and re-stamped at any resolution. Three texel values:

| value | meaning |
| --- | --- |
| 0 | open |
| 128 | valve — solid only while `valveClosed` is set |
| 255 | wall |

The shaders never read the texel directly; `SO()` in the shared shader prelude
folds the valve state in (`s > 0.75` is wall, `0.25 < s ≤ 0.75` is solid iff
`u_valve` = 1). Flipping the valve therefore changes the *solid set without
touching the mask* — which is a geometry edit in everything but name, and
`setValve` treats it as one (see §7).

Stamping order matters and is a contract: scene walls, then user-drawn
segments (wall / valve / eraser), then the **closed edges of the outer ring
last** — so no amount of erasing can spring a leak. The other geometry
contracts (butt segment ends, slabs extrapolated past the domain edge, bed
above `z = 0`, ground solid all the way down) live in the
[Coordinate and geometry contracts](engineering-notes.md#coordinate-and-geometry-contracts)
section of the engineering notes; each was bought with a measured failure.

## 2. Conditions at a solid

Four separate mechanisms, not one (numerics.md §5, vel pass in
`js/shaders.js`):

**Normal condition — exact.** At the end of the vel pass, `u = 0` on any face
with a solid on either side. Because the VOF pass is flux-form and both
neighbours of a face compute the identical flux, mass conservation at walls is
exact too. The outermost faces of the grid (`i = 0`, `j = 0`) are outside the
domain and are always zeroed.

**Tangential condition — a mirror ghost, in the Laplacian only.** A solid
neighbour's velocity is replaced by `−u₀` for no-slip (`u_slip` = 0, putting
the zero half a cell out, at the face) or `+u₀` for free-slip (`u_slip` = 1).
Advection gets no explicit treatment: it reads the zeros the previous step
left in solid cells, a zeroth-order no-slip that adds some near-wall
dissipation.

**Drag — a quadratic wall function**, applied only in wall-adjacent cells and
integrated implicitly,

```math
u \;\mathrel{/}=\; 1 + \Delta t\, C_f\, |\mathbf{u}| / \Delta x,
```

so any roughness is unconditionally stable. The length scale is the *cell
size*, not the depth. The gating is transverse to the component it acts on:
`u` keys on solids above and below (a bed), `w` on solids left and right — so
a wide pond feels no friction on its vertical motion.

**Resistance is emergent, not prescribed.** The delivered roughness is the sum
of the wall function, the stress the no-slip ghost feeds through the eddy
viscosity, and the form drag of the rasterised staircase. Cells per depth is
the lever, not `C_f`; normal depth and Manning's `n` are *measured* off the
computed energy grade line. Numbers in numerics.md §5 and the
[Measured, not assumed](engineering-notes.md#measured-not-assumed) section.

## 3. The outer ring

The outermost cell ring is **tri-state per edge**, `open = [L, R, B, T]` with
values:

| `open` | mode | behaviour |
| --- | --- | --- |
| 0 | wall | edge stamped solid (last, so it always wins) |
| 1 | open | zero-gradient ghost: transparent to through-flow, but a still pond will happily sit against it |
| 2 | outfall | ghost held **empty**, so `∇p` spills the last interior column over the edge like a brink |

The ghost ring is written by the VOF pass: a ghost cell copies its interior
neighbour (zero-gradient), is overwritten by a level control if one rides that
edge (§4), or is held at `vec4(0)` for an outfall. Ghost fill is boundary
state, not conserved storage — the averaging engine's accounting of the real
flux through the ring's inner faces is [averaging.md](averaging.md) §4's
business, not this document's.

The velocity ring needs its own care: the outermost cells see a clamped
stencil and, under a level control, a pinned `f`, so their momentum update is
junk that leaks inward through the advection stencil. Ring cells therefore
take the interior neighbour's **tangential** velocity (zero-gradient copy) and
keep only the **exchange-face** momentum update — that is what lets a level
control drive flow through the edge — clamped to the transport limit and, on
level-controlled edges, to the torricellian bound of §5.

Two standing rules, both measured:

- **A subcritical reach needs a real downstream control** — tailwater, brink,
  or outfall edge. Zero-gradient outflow is correct for supercritical flow and
  simply ponds a subcritical one.
- **Outfall edges are for brinks, never ponds.** Against standing water the
  permanently-empty ghost is an unbounded gradient: the exchange face
  saturates at the transport cap, the last column empties faster than the
  donor limiter refills it, then reverses — tail columns run dry and report
  *negative* `q` while the reach behind them floods. The full post-mortem is
  in [engineering-notes.md](engineering-notes.md#guard-rails-each-bought-with-an-explosion).
  No shipped scene uses mode 2; the sandbox floor drains fine on mode 1.

## 4. Level controls

Level controls — upstream reservoir on the left edge, tailwater on the right —
ride on an **open** edge and take precedence over outfall there. Each sets a
Dirichlet ghost in **hydrostatic-slot form**, the equilibrium profile of the
EOS written in the state variable:

```math
f \;=\; 1 + \frac{g\,(L - z)}{c^2} \quad (z < L), \qquad f = 0 \ \text{above},
```

with `L` the **surface the control is pinning**. For the tailwater that is its
level directly. For the upstream reservoir it is the *delivered stage*, which
is a velocity head below the level — see "The reservoir level is an energy
grade line" below. Levels are **elevations above the domain floor (the datum),
not depths over the bed** — the panel prints both.

**The control band.** The Dirichlet is applied only over the contiguous open
run of cells in the boundary column that contains the level (`columnBand` in
`js/sim.js`), never the whole column. Applied column-wide it floods any sealed
cavity under a raised bed slab, and a prescribed inlet velocity then
pressurises the pocket to the clamp with no feedback — the steep-scene
explosion. If the level sits above every run (a plan-view duct fed at
"level 99"), the topmost run below it is used.

**The reservoir level is an energy grade line, not a surface.** The water in a
reservoir is at rest, so its surface *is* the total head, and the depth that
arrives in the channel is the one that satisfies

```math
L - z_b \;=\; E \;=\; d \;+\; \frac{q^2}{2 g d^2},
```

solved CPU-side by `RECON.inletDepth` through `SIM.inletStage`. The delivered
depth therefore **falls as `q` rises**, which is the whole point: pinning the
surface *at* the level instead — what this boundary used to do — adds the
velocity head on top of the reservoir rather than taking it out of it.
Measured on s2, the inlet energy line stood 0.26 m above its own 2.07 m
reservoir at the shipped `q` = 1.2 and 0.66 m above it at `q` = 1.8, while the
surface itself moved 32 mm across that entire range.

The equation has two roots straddling `d_c` and the caller picks
(`inflow.branch`, default the subcritical one), because the choice belongs to
the reach and not to the boundary. Below `E_min = 1.5 d_c` it has **no** root:
the reservoir cannot pass that discharge at that level, `q_max = √(g(2E/3)³)`
is what it can, and the inlet holds `d_c` and says so on the panel rather than
inventing a section. That is not a failure mode — it is what a crest does.

`u_in.x` therefore carries the **delivered stage**, not the level; the level
stays on the CPU and on the ∇ marker, which is labelled "energy line" so
nobody reads it as a promised surface.

**The inflow edge** has two modes, per the `free` flag:

- *Prescribed-q* (`free` = 0): the interior column `i = 1` carries a velocity
  plug over the control band, at the velocity `inletVel()` derives from `q`
  and the depth the reservoir **delivers**. The plug's top three cells taper
  to zero — a hard velocity step at the waterline waterfalls into the slightly
  drawn-down interior surface and sheds ripples forever — and `inletVel()`
  repays the lost discharge with a `1.5 Δx` offset (mass before energy: a
  reach fed the wrong discharge is wrong everywhere). A submerged duct (band
  top below the nominal level) keeps the full plug and the level goes back to
  being a piezometric head; there is no free surface there to draw down.
  Scenes may pin the velocity directly (`inflow.v`), which likewise bypasses
  the solve.
- *Head-driven* (`free` = 1): only the level is pinned and the head difference
  drives the discharge — how the water-hammer and venturi scenes feed
  themselves. Nothing is prescribed, so there is no energy equation to solve
  and the level stays a still-water head; the drawdown happens *inside* the
  domain, in the reservoir compartment the scene builds for it. Measured on
  estab, `H` holds at 3.80–3.83 m against a 3.80 m level the whole length of
  the pipe. The `q` slider is inert; the panel prints the measured delivered
  discharge instead.

A scene still states the **depth its arriving profile wants** (m1's
`inletDepth` is the measured weir backwater, not `d_n`); `inletLevel()` in
`js/scenes.js` converts that to the energy line the boundary needs, so every
measured `inletDepth` goes on meaning what its comment says. Set the level to
the bare depth instead and every scene is pinned a velocity head too shallow —
11 mm on m1, 26 mm on m2, 271 mm on the steep pair — which is the old failure
under a new name: an inlet pinned below what the flow wants chokes the profile
and sheds ripples for ever. The adaptive alternatives were tried and reverted —
see [Soft level boundaries](engineering-notes.md#guard-rails-each-bought-with-an-explosion).

The energy line is a head, never a water surface: `inLevel` feeds the boundary
and `inSurf` (the bare `bed + inletDepth`) initialises the water. Filling a
gate pool or a drop's approach to the energy line starts the scene with water
it has to shed — it cost h23 its hydraulic jump and pushed m1's mean column
flux outside its conservation gate.

**The tailwater edge** pins the level only. It must stand clear of critical
depth — `≥ 1.3 d_c` is the floor to clear, rechecked whenever `q` changes,
because a control set at `d_c` is degenerate: the outlet chokes at critical
and the Dirichlet argues with the flow it is supposed to set. The h23/a23/m3
case histories, including why m3 deliberately runs at the margin, are in the
engineering notes.

## 5. What keeps a level control stable

A one-cell Dirichlet is a hard impedance step: pond slosh reflects off it,
and with the momentum update supplying the exchange velocity the reflection
can pump — the drowned-jump scenes tore themselves apart at t ≈ 40 s. Two
guards, both scene-visible:

**Relaxation sponges.** Level-controlled edges nudge `f` toward the
hydrostatic target over a band of columns, making the boundary a soft bath at
the same level. Mass conservation is intentionally given up inside the sponge
— it *is* the reservoir (the averaging engine books the nudge as a source
term, averaging.md §5). Widths are scene-tunable **in metres** (`spongeIn` /
`spongeTw`, default ~10 cells) so a resolution change keeps the same
reservoir; a compartment feeding a pipe needs the whole compartment held
(venturi 1.35 m, hammer 5.5 m) or it draws down and the bore cavitates. The
nudge is asymmetric — deficits fill hard, crests drain gently — and the ramp
shapes differ per side and mode (tailwater quadratic, de-resonance only;
head-driven inflow linear, because that sponge *is* the supply); the reasons
each shape survived are commented at the sponge code in `js/shaders.js` and
in the engineering notes.

**The torricellian exchange clamp.** Nothing flows to or from a pond of level
`L` faster than

```math
u_{\max} \;=\; \sqrt{2gL} + 1,
```

applied on the exchange face of a level-controlled edge. The transport cap
alone leaves ~12 m/s of headroom, and the Dirichlet can resonate with pond
slosh right up to it.

The panel's "delivered level" readout is measured just clear of the sponge —
the first columns the boundary treatment no longer touches — and sits below
the slider by however much head the sponge is giving up.

## 6. Sources that bypass the ring

Two mechanisms add water inside the domain rather than through an edge; both
are source terms the averaging balance accounts for, not boundary exchange:

- **Point sources** (`u_src0` the spout, `u_src1` the pour tool): inside the
  source radius the vel pass prescribes the velocity and the VOF pass tops the
  fill up to `f = 1` (and dyes it). The spout runs clear; the pour carries
  dye B.
- **The piston wavemaker** (`u_wave`): at its column, in wet cells, the vel
  pass prescribes `u = a\,\omega\cos(\omega t)`. It is a paddle standing in
  the water, not an edge condition — the wave scenes run with all four edges
  closed.

## 7. Who owns an edge

The Controls panel exposes each edge as a Wall / Open / Outfall select, and
the level-control toggles are **self-configuring**: ticking "Upstream
reservoir" or "Tailwater control" opens its edge automatically (recorded in
`autoL` / `autoR`) and picks sane defaults, so the sandbox can reproduce any
scene by hand — that is the acceptance test for control changes. Unticking
closes the edge again *only if the toggle opened it*: leaving it open is a
silent leak, but an edge you set by hand is yours, and the control will not
close it behind itself (setting an edge select clears the auto flag).

Two consequences worth knowing:

- Every edge change funnels through `rasterise()`, and any change to the mask
  — drawn walls, edge changes, and (via `setValve`) the valve flag — **resets
  an open averaging window** ([averaging.md](averaging.md) §9). Anything that
  opens or closes an edge counts, the level-control toggles included: an edge
  is a wall of the control volume, however much the control that moved it
  reads as a setting.
- The live parameters (`S.p`, open-edge flags included) survive a resolution
  rebuild — asking for more cells never costs your boundary configuration.

Serialized, the edge states and control settings travel in the rig wire
format (v2) through `RIG.migrate` in `js/main.js`; keys change only with a
version bump.

## 8. Uniform map

Where each piece of the above enters the GPU passes; all are set in
`simUniforms()` in `js/sim.js`.

| uniform | carries | consumed by |
| --- | --- | --- |
| `u_S` (texture) | the solid mask (0 / 128 / 255, as 0 / 0.5 / 1) | both passes via `SO()` |
| `u_valve` | 1 = valves solid | `SO()` |
| `u_openMode` | `[L, R, B, T]`, 0 wall / 1 open / 2 outfall | vof ghost ring |
| `u_in` | inflow: **delivered stage** (not the level — see §4), `inletVel()`, on, free | vel plug, vof ghost + sponge |
| `u_tw` | tailwater: level, on | vel clamp, vof ghost + sponge |
| `u_inBand`, `u_twBand` | the control band z-range from `columnBand` | vel plug, vof ghost + sponge |
| `u_spongeN` | sponge widths in columns (from metres per scene) | vof sponges |
| `u_slip` | 0 no-slip / 1 free-slip | vel mirror ghost |
| `u_cf` | wall-function coefficient | vel drag |
| `u_wave` | amplitude, ω, on, piston column | vel wavemaker |
| `u_src0`, `u_src1`, `u_sv0`, `u_sv1` | point sources: position, radius, on; velocity + dye | both passes |

<!-- Pages build only: github.com strips this tag and renders the math fences
     natively; on the Jekyll site math.js rewrites them for MathJax. -->
<script src="math.js" defer></script>
