# Numerics

How the solver gets from the multiphase Navier–Stokes equations in the vertical
plane to the two GPU passes it actually integrates.

[Governing equations](#1-governing-equations) ·
[Physics → model](#2-from-physics-to-a-solvable-model) ·
[Closure](#3-closure-weak-compressibility-a-2d-preissmann-slot) ·
[Discretisation](#4-discretisation)
 — incl. [operator splitting](#from-the-equations-to-the-substep-operator-splitting) ·
[Walls](#5-wall-treatment) ·
[Boundaries](#6-boundaries) ·
[Limits](#7-what-is-not-represented) ·
[References](#references)

---

## 1. Governing equations

The domain is a vertical slice one metre wide: `x` horizontal and downstream,
`z` vertical and up, velocity `u = (u, w)`, gravity `g = (0, −g)`. Discharges
are therefore per metre of width throughout.

`g` is not required to be vertical. A scene with a mild uniform slope draws its
bed **flat and grid-aligned** — avoiding a rasterisation staircase that would
otherwise excite standing waves — and tilts gravity to `(S₀g, −g)` instead
(`u_gx` in the velocity pass). Nothing below depends on the orientation.

This is a **multiphase formulation**. Free-surface flow is water and air, and the
solver carries a volume fraction rather than tracking an interface, so the phase
indicator is present from the first equation.

In the one-fluid (mixture) formulation of two-phase flow (Hirt & Nichols, 1981)
both phases share a single velocity and pressure field, and the volume fraction
`f` — the fraction of a cell occupied by water — is advected with the flow:

```math
\frac{\partial f}{\partial t} + \nabla\cdot(f\mathbf{u}) = 0,
\qquad
\rho = f\rho_w + (1-f)\,\rho_a
```

with each phase incompressible, and momentum in conservative form:

```math
\frac{\partial (\rho\mathbf{u})}{\partial t}
+ \nabla\cdot(\rho\mathbf{u}\mathbf{u})
= -\nabla p + \rho\mathbf{g} + \nabla\cdot\boldsymbol{\tau},
\qquad \nabla\cdot\mathbf{u} = 0
```

### The heavy-fluid limit

Water against air is `ρ_w/ρ_a ≈ 800`, so the air carries a little over a tenth of
a percent of the mixture density wherever there is any water at all. Dropping it
makes this a *free-surface* solver rather than a two-phase one:

```math
\rho \;\longrightarrow\; f\rho_w
```

and the weight with it:

```math
\rho\,\mathbf{g} \;\longrightarrow\; f\rho_w\,\mathbf{g}
```

Three consequences follow, and between them they are the whole of what `f` does
in this solver:

- **Where there is water, `f ≈ 1`**, and the momentum equation is the water's
  alone — one phase, density `ρ_w`. Step 3 of §2 makes that exact, and it is why
  `f` does **not** survive as a weighting inside the momentum equation.
- **Where there is none, `ρ = 0`**: no mass, no weight, no pressure, and the
  momentum equation is vacuous. But one velocity field spans the whole domain
  and something must be stored in the void — step 4 of §2.
- **The interface needs no dynamic condition of its own.** With the air gone the
  surface condition is `p = 0`, and §3 delivers it algebraically rather than by
  tracking where the surface is.

Everything from here is a named modelling step (§2, §3). §4 discretises the
result. Every term in the solver is introduced by one of those steps.

## 2. From physics to a solvable model

The equations of §1 cannot be integrated on a millimetre grid at a few thousand
substeps a second. Five modelling steps stand between them and something that
can be, ordered here so each depends only on the ones before it. The second is
large enough to get its own section.

### Step 1 — Filter the equations: turbulence closure

The scenes run at Reynolds numbers of `10⁵–10⁶` while `Δx` is `10⁻³–10⁻²` m, so
the dissipative scales sit far below one cell. Spatially filtering §1 at the cell
scale gives the large-eddy equations, in which the unresolved motion appears as a
subgrid stress. Closing that stress with an eddy viscosity (Smagorinsky, 1963)
replaces the molecular viscosity by

```math
\nu_T = \nu + \left(C_s \Delta\right)^{2} |S|,
\qquad |S| = \sqrt{2 S_{ij}S_{ij}},
\qquad S_{ij} = \tfrac{1}{2}\left(\partial_j u_i + \partial_i u_j\right)
```

`C_s` is the Smagorinsky constant, set per scene (0.05–0.16; `C_s = 0` runs
laminar). Without this term the velocity–depth profile stays laminar-parabolic
instead of turbulent-flat.

The solver applies `ν_T ∇²u`, **not** `∇·(ν_T ∇u)`: the `∇ν_T·∇u` term is
dropped, a simplification exact only where `ν_T` is uniform. No wall damping is
applied to `C_s`, so the subgrid length does not vanish at a solid the way a van
Driest or dynamic model would; the near-wall stress is carried by step 5.

### Step 2 — Relax incompressibility

The constraint `∇·u = 0` makes pressure a global unknown and forces an elliptic
solve every step. Replacing it with a barotropic equation of state makes pressure
local and yields the free surface for nothing. It is the largest of the five
steps and §3 is devoted to it. Two of its results are needed here: `f` is no
longer pinned at 1 in water but carries the pressure as compression, and the
size of that compression is `(c₀/c)²` — 7% at the default settings.

### Step 3 — One density in the momentum equation

Water is incompressible. `f` departs from 1 only because step 2 stores pressure
as compression, and that is a device for obtaining the pressure rather than a
physical density variation. It is therefore confined to the equation of state
and kept out of the momentum equation, which carries the single constant
`ρ₀ = ρ_w`:

```math
\frac{D\mathbf{u}}{Dt} = -\nabla P + \mathbf{g}
+ \nu_T \nabla^{2}\mathbf{u},
\qquad P \equiv \frac{p}{\rho_0}
```

This is the step that removes `f` from the momentum equation: no `1/f` on the
pressure gradient or the viscous term, and no `f` on the weight. Continuity
meanwhile carries the full `f`, so the two are not formally consistent, and the
size of the inconsistency is the compression itself, `(c₀/c)²`.

It is deliberate. With `ρ₀` constant the discrete hydrostatic balance is exactly
linear and the equilibrium profile of §3 is reached exactly rather than
approximately; letting a compression that is a numerical device into the inertia
and the weight would bend that profile by an amount with no physical meaning.

One consequence to note for §4: with `ρ₀` constant, momentum is written in
advective rather than conservative form. The two differ by `u(∇·u)`, which §3
bounds at `O(M²)`.

### Step 4 — The void gate

Step 3 leaves gravity as `g` everywhere, but §1 established that a void has no
mass and no weight, and one velocity field spans both regions. The velocity
stored in a void is not a fluid velocity: it is an extension field, kept only so
the interface has something to be advected by, and so that a jet leaving a nozzle
does not run into a rigid wall of stationary air. Applying gravity to it would
make it fall, and the advection stencil would carry that spurious momentum back
into the water at the interface.

So gravity is switched off as the fluid runs out:

```math
\chi(f) = \operatorname{smoothstep}\left(0,\; 0.05,\; f\right)
```

`χ` is a **gate, not a factor of `f`**: it is exactly 1 for any cell more than 5%
full, so in water the term is `g`, and only the last 5% into a void is ramped. An
interface cell at `f ≈ 0.5` gets the full `g`, which is the right answer — the
water in it is in free fall. The pressure term needs no equivalent, because the
equation of state already returns `P = 0` below `f = 1`, so with `χ` in place a
void is force-free.

### Step 5 — Model the wall rather than resolve it

No-slip is a **boundary condition**, and the term it produces acts only at the
wall. Resolving it requires the viscous sublayer — `y⁺ ≈ 1`, which at these
Reynolds numbers is two to three orders of magnitude finer than `Δx`. Standard
practice is to leave the sublayer unresolved and impose the wall shear stress
instead:

```math
\tau_w = \rho\, C_f\, |\mathbf{u}|\,\mathbf{u}
```

A surface stress cannot enter a finite-volume momentum equation directly, so it
is applied to the cell touching the wall — the momentum that wall removes from a
slab of thickness `Δ`, per unit volume:

```math
\frac{\tau_w\,A}{\rho\,A\,\Delta}
= \frac{C_f\,|\mathbf{u}|\,\mathbf{u}}{\Delta}
```

Two consequences follow directly, and both show up in how the model behaves:

- The term exists **only in cells touching a solid**, gated transverse to the
  component it acts on: `u` keys on walls above and below (a bed), `v` on walls
  left and right. A wide pond has no friction on `v` at all.
- It carries an explicit `Δ`. The delivered resistance is therefore a property of
  the grid as much as of `C_f` — the origin of the emergent-roughness behaviour
  in §5, where at ~8 cells of depth the delivered Manning `n` is ~0.07 almost
  regardless of `C_f`.

### The resulting model

Steps 1–5 applied to §1:

```math
\frac{\partial f}{\partial t} + \nabla \cdot (f \mathbf{u}) = 0
```

```math
\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u}\cdot\nabla)\mathbf{u}
= -\nabla P + \chi(f)\,\mathbf{g} + \nu_T \nabla^{2}\mathbf{u}
- \mathbb{1}_{\text{wall}}\,\frac{C_f |\mathbf{u}|\mathbf{u}}{\Delta}
```

with `P = p/ρ₀` supplied by the equation of state of §3, and `𝟙_wall` the
indicator of cells adjacent to a solid.

One thing about this equation is easy to misread, and it matters when checking
it against the code: **`u` is advected, not `fu`.** Momentum is in advective
(non-conservative) form and the advection carries no `f` weighting at all; only
volume is in flux (conservative) form. A quasi-conservative formulation — dividing
`∂(ρu)/∂t + ∇·(ρuu) = −∇p + ρg + ∇·τ` by the constant `ρ₀` to get
`∂(fu)/∂t + ∇·(fuu) = −∇P + f g + …` — *would* carry `f g`, and the gravity
term here does not. That is not the form solved.

§4 discretises this system and nothing else.

## 3. Closure: weak compressibility, a 2D Preissmann slot

Incompressibility is what makes pressure expensive. `∇·u = 0` is a constraint,
not an evolution equation, so `p` becomes a global unknown requiring a Poisson
solve over the whole domain every step — and the free surface needs a separate
interface-tracking scheme so the solver knows where to impose `p = 0`.
hydraulician does neither. It relaxes incompressibility and takes pressure from
a local barotropic equation of state.

Let `f` be the fill fraction of a cell, doubling as the normalised density
`ρ/ρ₀`. Continuity becomes an exact flux-form conservation law, and pressure
follows algebraically:

```math
\frac{\partial f}{\partial t} + \nabla \cdot (f \mathbf{u}) = 0
\qquad\qquad
P \equiv \frac{p}{\rho_0} = c^{2}\max(f - 1,\, 0)
```

The one-sidedness is the whole trick. `f < 1` means the cell is not full, so
`P = 0` and the fluid falls freely — **that is the free-surface condition, with
no interface to track**. `f > 1` means the cell is over-full, so pressure builds
and travels at celerity `c`. Free-surface and pressurised flow are the same
equations, surcharge and drain-down need no special case, and the transition
happens by itself.

### Why this approximates incompressible flow

The equation of state does not enforce `∇·u = 0`. It **penalises** departures
from it with `c²` as the penalty stiffness, and the constraint is recovered only
as `c → ∞`. The mechanism decides how `c` has to be chosen, so it is worth
writing out.

In the pressurised branch `P = c²(f − 1)`, so

```math
\nabla P = c^{2}\,\nabla (f-1) = c^{2}\,\nabla f
```

and an arbitrarily small gradient in fill fraction produces a large force.
Linearise about a full, still state, `f = 1 + f′` with `|f′| ≪ 1`:

```math
\frac{\partial f'}{\partial t} + \nabla\cdot\mathbf{u} = 0,
\qquad
\frac{\partial \mathbf{u}}{\partial t} = -c^{2}\nabla f'
```

Eliminating `u` gives a wave equation:

```math
\frac{\partial^{2} f'}{\partial t^{2}} = c^{2}\nabla^{2} f'
```

A divergence error therefore does not sit there and accumulate — it radiates away
as an acoustic wave at speed `c`. That is the whole role of the equation of
state: it turns `∇·u` from a constraint that must be solved globally into a fast
variable that relaxes locally, which is why no Poisson solve appears anywhere.

What is left is a residual divergence rather than zero. Scaling momentum with a
velocity `U` gives a dynamic pressure `P ∼ U²`, hence `f′ ∼ U²/c²`, and
continuity then bounds

```math
\frac{\nabla\cdot\mathbf{u}}{U/L} = O\!\left(M^{2}\right),
\qquad M = \frac{U}{c}
```

This is Chorin's artificial compressibility.

### The compression scale in free-surface flow

Under a free surface the compression is set by the hydrostatic load. A still
column of depth `d` requires the equation of state to produce `P = gd` at the
bed, so

```math
f - 1 = \frac{g d}{c^{2}} = \left(\frac{c_0}{c}\right)^{2},
\qquad c_0 = \sqrt{g d}
```

The governing small parameter is the ratio of the **long-wave celerity**
`c₀ = √(gd)` to the slot celerity. At the default `c = 25` in a 4.5 m column it
stands an order of magnitude above the dynamic compression:

| source | scale | value |
|---|---|---|
| hydrostatic | `(c₀/c)² = gd/c²` | 7% |
| dynamic | `M² = (U/c)²`, `U ≈ 2 m/s` | 0.6% |

Their ratio is `gd/U² = 1/Fr²`, so in any subcritical reach the hydrostatic scale
is the larger of the two, and `c` is set against `√(gd)`.

### Why `P` becomes the hydrostatic pressure

Nothing in the formulation imposes `∂P/∂z = −g`. There is no hydrostatic
decomposition, no split into hydrostatic and dynamic parts, and `P` is only ever
an algebraic function of the local fill. That the solver nevertheless carries the
hydrostatic pressure is a result, and it has three parts.

**Rest requires hydrostatic balance.** A state of rest is `u = 0` with
`∂u/∂t = 0`, so the vertical momentum equation gives

```math
0 = -\frac{\partial P}{\partial z} - g
\qquad\Longrightarrow\qquad
\frac{\partial P}{\partial z} = -g
```

The hydrostatic equation is not assumed — it *is* the condition for the velocity
to stop changing. Any state that is not hydrostatically balanced has a net force
on it and is still accelerating.

**The free surface supplies the constant of integration.** Integrating downward
needs `P` at the top, and the equation of state provides it: above the surface
`f < 1`, so `P = 0` identically. Hence, for a surface at `η`,

```math
P(z) = g\left(\eta - z\right),
\qquad
f = 1 + \frac{P}{c^{2}} = 1 + \frac{g(\eta - z)}{c^{2}}
```

That last expression is the equilibrium fill fraction, and it is exactly the
`still()` used to initialise every scene in `scenes.js` — the scenes start from
the theoretical equilibrium rather than from a fitted profile.

**The equilibrium is an attractor.** The algebra above shows only that the
hydrostatic state is *consistent* with the equations, not that the solver reaches
it. That follows from the wave equation derived earlier: perturbations about the
equilibrium radiate as acoustics at speed `c` and are damped by the bulk
viscosity, so a column released out of balance oscillates and settles.

[`hydrostatic-attractor.js`](hydrostatic-attractor.js) tests it, starting a
column **uniform and uncompressed** — `f = 1` throughout, hence `P = 0`
everywhere, which is maximally wrong — and integrating with the same discrete
update. Over 200 s:

| | start | end |
|---|---|---|
| `\|∂P/∂z + g\|/g` | 1 | 2.3×10⁻⁶ |
| residual `max\|v\|` | 0 | 1.8×10⁻⁵ m/s |

falling monotonically. The strongest form of the check needs no predicted `η` at
all: if the profile is hydrostatic, the surface elevation implied by the pressure
at *every* depth, `z + P/g`, must be one number. It is — 4.36705 m at all five
probe depths, spread 6×10⁻⁶ m across the column.

Two riders. The column settles **3.3% lower** than it started, because the slot
storage has to be filled from the water already present; the final surface sits
15.65 mm above a sharp-interface mass balance, which is 0.78 cells of smeared VOF
interface at `Δx = 0.02`. And convergence is slow — around 100 s of simulated
time to reach `10⁻⁴`, longer than a scene runs for. That is why `still()` exists:
a scene initialised uniform would spend its entire run settling.

Two further consequences. A still column stores more `f` than its geometric
volume:

```math
\int_0^{d} f\,\mathrm{d}z
= d\left[1 + \tfrac{1}{2}\left(\frac{c_0}{c}\right)^{2}\right]
```

a 3.5% excess at `d = 4.5 m, c = 25`, and 0.45% at `c = 70`. This is the
classical Preissmann slot storage, and it is why the column reduction caps at
`min(f, 1)`: `APP.volume()` sums that reduction's depth, so the mass-balance
readout is geometric volume with the slot storage excluded.

### Why this is a slot

In 1D sewer modelling the same problem is solved geometrically. When a conduit
surcharges the free-surface width `B → 0`, the celerity `√(gA/B)` blows up and
the Saint-Venant equations degenerate. Preissmann's fix is a hairline slot along
the soffit: water rises into it, there is always a free surface, and the
piezometric head is the level in the slot. Slot width sets celerity through
`c² = gA/B_s`.

The correspondence here is exact rather than by analogy. Head above a point is
`h_p = P/g = c²(f−1)/g`, so the excess volume a cell stores is
`(f−1)Δx² = (g h_p/c²)Δx²`. Equating that to the classical slot's storage
`B_s·h_p·Δx` over the same cell:

```math
B_s = \frac{g\,\Delta x}{c^{2}} = \frac{gA}{c^{2}}
```

with `A = Δx` the cell's cross-section per metre of width. Every cell is its own
conduit carrying its own slot, and `c` **is** the slot width, inverted.

### The stiffness trade

This is the same dilemma the classical scheme faces, resolved the other way.
Choose `c` physically (≈1200 m/s in steel pipe) and the system is stiff:
1 m/s open-channel waves alongside 1000 m/s acoustics on one grid, which is why
the classical treatment is implicit. hydraulician stays explicit, so stiffness
is paid directly in wall-clock through `Δt ≈ 0.45Δx/(c + 6)`, and it therefore
makes the slot deliberately **wide**: `c = 8–400 m/s` across the scenes, exposed
as a user control.

So `c` is squeezed from both sides. Accuracy wants `c ≫ √(gd)`, to keep the
hydrostatic compression `(c₀/c)²` small; cost wants `c` small, because
`Δt ∝ 1/c`. At the default the ratio is only `c/c₀ ≈ 4`, and
7% compression is loose by weakly-compressible standards.

Concretely `B_s/A = g/c²` is about 1.6% at the default `c = 25`, against roughly
10 ppm for a real sewer at `c = 1000`. The water is genuinely compressible at
percent level — around 1.6% per metre of submergence. What survives the fiction
is that `ΔH = cΔv/g` and the period `4L/c` are exact *in* `c`, so a demonstration
is quantitatively right about the relationship while being wrong about the
absolute wave speed. Measured: water hammer peaks at 39.0 m against Joukowsky's
41.1 m, period 3.0 s against `4L/c` = 2.8 s.

## 4. Discretisation

Staggered MAC grid (Harlow & Welch, 1965): `u` on west faces, `w` on south
faces, `P` and `f` at cell centres, held in two `RGBA32F` ping-pong textures.
The domain is a fixed physical rectangle and the grid is sized to a cell budget,
so changing resolution changes `Δx` but not the physics.

What is discretised is the model assembled at the end of §2, with the equation of
state of §3. Nothing further is introduced here.

### From the equations to the substep: operator splitting

Nothing above is solved simultaneously. The substep is a **first-order
fractional step**: the right-hand side is cut into operators, each is applied
independently, and each hands its result to the next. This is the path from the
continuous system to the two GPU passes.

```math
\begin{aligned}
\mathcal{A}(\mathbf{u}) &= -(\mathbf{u}\cdot\nabla)\mathbf{u}
  &&\text{advection} \\
\mathcal{D}(\mathbf{u}) &= \nu_T \nabla^{2}\mathbf{u}
  &&\text{eddy-viscous diffusion} \\
\mathcal{G}(f) &= \chi(f)\,\mathbf{g}
  &&\text{gravity} \\
\mathcal{F}(\mathbf{u}) &= -C_f |\mathbf{u}|\mathbf{u}/\Delta
  &&\text{wall friction} \\
\mathcal{P}(f) &= -\nabla P(f)
  &&\text{pressure gradient}
\end{aligned}
```

The velocity pass advances `uⁿ → uⁿ⁺¹` in three stages:

```math
\mathbf{u}^{*} = \mathbf{u}^{n} + \Delta t\left[
  \mathcal{A}(\mathbf{u}^{n}) + \mathcal{D}(\mathbf{u}^{n})
  + \mathcal{G}(f^{n})\right]
```

```math
\mathbf{u}^{**} = \frac{\mathbf{u}^{*}}
  {1 + \Delta t\, C_f |\mathbf{u}^{*}| / \Delta}
```

```math
\mathbf{u}^{n+1} = \Pi\left[\mathbf{u}^{**}
  + \Delta t\,\mathcal{P}(f^{n})\right]
```

and the volume pass follows, using the velocity just produced:

```math
f^{n+1} = \Pi_f\left[f^{n}
  - \Delta t\, \nabla\cdot \mathbf{F}\!\left(f^{n},\, \mathbf{u}^{n+1}\right)\right]
```

Three things to read off this.

**Stages 1–3 are not a Lie composition.** `A`, `D` and `G` are all evaluated at
the *same* old state and summed — one forward Euler, not three sequential
sub-steps. That is why they share a single stencil fetch, and it costs nothing:
sequential composition would differ at `O(Δt²)`, the order of the splitting
error already present.

**Friction is the only implicit stage.** `u**` is the exact solution of
`du/dt = F(u)` over `Δt` with `|u|` frozen at `|u*|`. That is why arbitrarily
large roughness is stable — an explicit friction term would need
`Δt < Δ/(C_f|u|)` and would fail exactly where the flow is fastest.

**`Π` and `Π_f` are projections, not operators.** On velocity: the void bleed,
the transport-consistency cap, the ±80 rails, prescribed sources, the boundary
ring and the no-flux condition at solids. On volume: the relaxation sponges,
sources and the positivity clamp. They are applied after the split and are not
part of the PDE; each is documented where it appears below.

The ordering is load-bearing in two places, and they pull against each other:

- **Pressure last**, so `∇P` is not attenuated by the wall function.
- **Friction after gravity**, so the wall function acts on the velocity
  including this step's gravitational increment rather than lagging it a step.

Both cannot hold at once: putting `F` after `G` interposes it between `G` and
`P`, so the discrete hydrostatic balance of §3 is broken in wall-adjacent cells
by `O(C_f g Δt²/Δx)` — around 10⁻¹⁰ m/s per substep at default settings. The
friction gate is transverse to the component (`u` keys on the bed above and
below, `v` on side walls left and right), so a wide pond has no friction on
`v` at all.

**Volume second, with `uⁿ⁺¹`.** The flux that moves mass is the velocity the
pressure step has just acted on, so the EOS on the next substep sees the volume
its own pressure gradient produced. Advecting `f` with `uⁿ` would lag the
pressure–volume coupling — the slot's restoring mechanism — by a full step.

Splitting error is `O(Δt)`, consistent with the forward Euler inside each stage.
The scheme is first-order in time; with thousands of substeps a second this is
not the limiting error.

### Timestep

The minimum of an acoustic limit `0.45Δx/(c + 6)` and a viscous
limit `0.20Δx²/ν_max`. Both are heuristics rather than measurements: the
advective headroom is a fixed 6 m/s rather than the actual field maximum, and
the viscous limit estimates the Smagorinsky contribution from an assumed strain
rate. Fast-jet scenes therefore run at a higher effective CFL than the nominal
0.45, backstopped by explicit clamps — a transport-consistency cap holding
partial-fill cells to what the volume flux can follow, and ±80 m/s rails written
as range tests so a fast-math compiler cannot fold them away.

### Velocity pass

Third-order upwind advection (its `O(Δx³)` dissipation is
what lets jets and shear layers survive the thousands of substeps a hammer run
takes), Smagorinsky eddy viscosity `ν_T = ν + (C_sΔ)²|S|`, a wall-aware
Laplacian, gravity gated on fluid presence, implicit bed friction, then `∇P`
from the EOS. An artificial bulk viscosity term `−u_bulk·c·Δx·(∇·u)` damps
acoustics; it vanishes where `∇·u ≈ 0` but not across a transient front, where
it contributes of order 0.2 m of head on a 39 m hammer peak.

Velocity in void cells is advected and slowly bled away rather than hard-zeroed.
Zeroing it makes air behave as a rigid medium whose spurious shear layer shreds
any free jet within a metre of its nozzle; the slow bleed stands in for the
usual free-surface velocity extrapolation.

### Volume (VOF) pass

Flux-form advection of `f` with a van Leer limiter, plus an
interFoam-style compression flux `c_α|u|α(1−α)∇α/|∇α|` that holds the surface to
about two cells. Positivity comes from a **donor-cell limiter**: each outgoing
face flux is capped at a quarter of the donor cell's contents, so `f` can never
go negative *without* a clamp. Because both neighbours of a face pick the same
donor from the sign of the same flux, they agree on the same limit, and volume
is conserved to machine precision.

That distinction is load-bearing. An earlier version clamped negative `f` back
to zero, which invents water; at a few thousand substeps a second across every
surface and spray cell it invented enough to triple the discharge along a 14 m
flume while the depth sat perfectly steady. The signature is `q` rising
monotonically downstream at steady state with total volume constant.

Three cheaper passes handle the per-column reduction (bed, depth, unit
discharge, water level), particle advection, and display.

## 5. Wall treatment

Four separate mechanisms, not one.

**Geometry is a rasterised bitmask** — no cut cells, no immersed boundary
reconstruction. Solids live in an `R8` texture stamped CPU-side from a segment
list, so edits can be undone and re-rasterised at any resolution.

**The normal condition is exact**: `u = 0` on any face with a solid on either
side. With flux-form VOF, mass conservation at walls is exact too.

**The tangential condition is a mirror ghost**, applied only inside the
Laplacian: a solid neighbour's velocity is replaced by `−u₀` for no-slip
(putting zero half a cell out, at the face) or `+u₀` for free-slip. Advection
gets no explicit treatment — it reads the zeros left in solid cells by the
previous step, a zeroth-order no-slip that adds some near-wall dissipation.

**Drag is a quadratic wall function** applied only in wall-adjacent cells and
integrated implicitly as `u /= 1 + Δt·C_f|u|/Δx`, so any roughness is
unconditionally stable. Note the `Δ` is the *cell size*, not the depth.

**Resistance is therefore emergent, not prescribed.** The delivered roughness is
the sum of the wall function, the extra stress the no-slip ghost feeds through
the eddy viscosity, and the genuine form drag of a rasterised bed staircase. At
about 8 cells of depth the delivered Manning `n` is ~0.07 almost regardless of
`C_f`, dropping toward 0.02 at ~25 cells. **Cells per depth is the lever, not
the roughness slider.** Consequently normal depth and `n` are *measured* off the
computed energy grade line rather than derived from `C_f`:

```math
y_n = h\left(S_f/S_0\right)^{1/3} \qquad n = h^{2/3}\sqrt{S_f}\,/\,V
```

## 6. Boundaries

The outer ring is tri-state per edge: wall, open (zero-gradient ghost), or
outfall (ghost held empty, so the last column spills over the edge like a
brink). Level controls — upstream reservoir, downstream tailwater — ride on an
open edge and set a Dirichlet ghost in hydrostatic-slot form,
`f = 1 + g(L − z)/c²`, which is the equilibrium profile of §3 written in the
state variable.

A one-cell Dirichlet is a hard impedance step that pond slosh reflects off and
can pump against. Level-controlled edges therefore carry a **relaxation sponge**
some ten cells wide, nudging `f` toward the hydrostatic target so the boundary
behaves as a soft bath at the same level. Mass conservation is intentionally
given up inside the sponge — it *is* the reservoir.

Level-controlled edges also carry a physical exchange bound: nothing flows to or
from a pond of level `L` faster than `√(2gL)`.

A subcritical reach needs a real downstream control — tailwater, brink or
outfall edge. Zero-gradient outflow is correct for supercritical flow and simply
ponds a subcritical one.

## 7. What is not represented

No surface tension. Voids carry no pressure, so nothing pneumatic exists and
breakers spill rather than plunge. Pressure cannot fall below zero gauge when
gravity is on, so a cell that cannot stay full simply cavitates — which is
roughly what column separation does downstream of a slammed valve, though there
is no vapour-pressure model behind it. The domain is a vertical slice one metre
wide, so everything is per metre of width and nothing three-dimensional
(secondary currents, bend flow, spanwise structure) is available.

Resistance comes from the mesh rather than a roughness table, `c` is chosen
rather than physical, and depths are resolved at tens of cells rather than
hundreds. Use it to see the shape of a result, then use a real model to get a
number.

Verified numbers — water hammer against Joukowsky, Torricelli efflux, venturi
throat, conjugate depth against Bélanger, mass balance along a 14 m flume — are
summarised in the [Method section of the README](../README.md#method). The full
table and the headless procedure behind it live in `CLAUDE.md`, which is
repo-only and not published to the site.

## References

Pointers to the standard treatment of each step rather than a full
bibliography; titles are given without volume or page numbers.

- **Smagorinsky, J. (1963)** — "General circulation experiments with the
  primitive equations". The eddy-viscosity subgrid closure of §2 step 1.
- **Hirt, C. W. & Nichols, B. D. (1981)** — "Volume of fluid (VOF) method for
  the dynamics of free boundaries". The one-fluid free-surface formulation of
  §1, and the origin of the `ρ_a → 0` degeneracy the void gate of §2 step 4
  regularises.
- **Harlow, F. H. & Welch, J. E. (1965)** — "Numerical calculation of
  time-dependent viscous incompressible flow of fluid with free surface". The
  staggered MAC arrangement of §4.
- **Chorin, A. J. (1967)** — "A numerical method for solving incompressible
  viscous flow problems". Artificial compressibility, the ancestor of §3.
- **Chorin, A. J. (1968)** — "Numerical solution of the Navier–Stokes
  equations". The fractional-step integration of §4.
- **Monaghan, J. J. (1994)** — "Simulating free surface flows with SPH". The
  weakly-compressible barotropic equation of state in the form §3 uses.
- **van Leer, B. (1974)** — "Towards the ultimate conservative difference
  scheme II". The flux limiter of the volume pass.
- **Weller, H. G. (2008)** — OpenCFD technical report on interface capturing.
  The `α(1−α)` compression flux used by interFoam and by the volume pass.
- **Cunge, J. A., Holly, F. M. & Verwey, A. (1980)** — *Practical Aspects of
  Computational River Hydraulics*. The Preissmann slot as used in sewer and
  river models, of which §3 is the two-dimensional analogue.
