# hydraulician

**2D hydraulics in the vertical plane, in your browser.** Draw a channel with the
mouse and watch real free-surface Navier–Stokes run through it — jets, hydraulic
jumps, backwater curves, water hammer, wave orbits.

WebGL2, zero dependencies, no build step. Serve the folder and open `index.html`:

```bash
python3 -m http.server 8124
```

Then <http://localhost:8124>. `?scene=hammer` boots straight into a scene.

---

## What it is

Most interactive water toys are either plan-view shallow water (no depth, so no
velocity profile and no pressure) or pretty-but-fictional smoke solvers. This one
resolves the vertical, so the things hydraulics courses actually care about are
in the picture rather than assumed away.

The solver is barotropic weakly-compressible Navier–Stokes on a staggered grid,
with the cell fill fraction `f` doing double duty as the density:

```
∂f/∂t + ∇·(f u) = 0
∂u/∂t + (u·∇)u  = −∇p/ρ + g + ∇·(ν∇u) − C_f|u|u/Δ
p/ρ = c² max(f − 1, 0)
```

That equation of state is a **2D Preissmann slot**. Where a cell is not full,
`p = 0` and the water falls freely — that *is* the free surface, with no interface
reconstruction needed. Where a cell is over-full the water is compressed and
pressure propagates at celerity `c`. So free-surface flow and pressurised pipe
flow are the same equations, the transition between them is automatic, and `c` —
the slot width — is the slider that sets your water-hammer surge.

There is no pressure Poisson solve. Two GPU passes per substep, a few thousand
substeps a second, real time on a laptop.

## Controls

| | |
|---|---|
| **left-drag** | draw a straight edge (hold **shift** to snap to 0°/45°/90°) |
| **right-drag** | pour a much larger flow wherever you point |
| **1**–**5** | wall · erase · valve · gauge · rake |
| **[** **]** | brush size |
| **Z** / **C** | undo edge / clear everything you drew |
| **V** | open / slam every valve |
| **space** / **R** | pause / reload the scene's water |
| **G** / **P** / **D** / **N** | field · particles · dye · channel overlay |

Water enters at the top left by default. Everything else you build.

## What it demonstrates

**Jets.** An orifice discharges at √(2gh) with a visible vena contracta, and the
free jet is a ballistic parabola. Measured 5.62 m/s against a theoretical 5.8.

**Water hammer.** A reservoir feeds a 49 m pipe through a nozzle at 2.8 m/s under
21 m of static head. Press **V** and the gauge draws the textbook square wave:
peak 39.0 m against Joukowsky `ΔH = cΔv/g` = 41.1 m, period 3.0 s against
`4L/c` = 2.8 s. Turn wave damping to zero and it rings forever; push the celerity
past ~90 m/s and the downsurge hits zero — column separation.

**Quasi-steady flow.** The venturi converts head to velocity and back, and the
head map shows the recovery is imperfect. Hover the throat: `p/ρg` falls by
exactly what `V²/2g` gains.

**Open-channel surface profiles.** The overlay computes critical depth, normal
depth and the energy grade line per column from the live depth and unit
discharge, then names each reach: **M1** backwater behind a weir, **M2** drawdown
to a free overfall, **S1** on a drowned steep bed, **S2** down a chute, **S3**
below a tight gate, **C1/C3** on a critical slope, **H2** on a level apron,
**A2** on an adverse one. Letters are the bed (Mild, Steep, Critical, Horizontal,
Adverse), numbers are the zone.

**Hydraulic jumps.** Detected automatically, bracketed, and measured: `Fr₁`, the
conjugate pair `y₁ → y₂`, the momentum prediction `y₂/y₁ = ½(√(1+8Fr₁²) − 1)`,
and the energy `(y₂−y₁)³/(4y₁y₂)` lost in the roller.

**Velocity–depth distribution.** Drop a **rake** for a live `u(y)` profile with
`u_max`, depth-averaged `V` and their ratio. Or turn on dye timelines: a vertical
line of dye injected at the inlet shears as it travels, and that shape *is* the
velocity profile.

**Linear wave theory.** A piston wavemaker on a beach. Turn particles on for the
orbits — circular in deep water, flattening to ellipses at the bed. Shoaling and
breaking come out of the solver, not out of a wave model.

**Plan view.** Gravity off, and the same solver looks down on a horizontal plane
instead: a submerged jet, a bluff body, and a Kármán vortex street.

## Honest limits

- **Roughness is partly the grid.** A sloping bed rasterised onto a Cartesian
  grid is a staircase, and those steps are real form roughness. At ~8 cells of
  depth the delivered Manning `n` is ~0.07 nearly regardless of the `C_f` slider;
  at ~25 cells it falls towards 0.02. That is why `y_n` and `n` are *measured*
  from the computed energy grade line rather than derived from `C_f` — what you
  read is what the solver is actually doing. Deeper flow relative to Δx is the
  lever, not the slider.
- **Zone-3 reaches are short** on mild, horizontal and adverse beds, because that
  high delivered resistance drags the hydraulic jump close to wherever the
  supercritical flow enters. S3 (on a steep bed) is clean; M3, H3 and A3 appear
  only briefly. A gate that is even slightly drowned puts a recirculating roller
  straight on top of its own jet, and a depth-averaged Froude number then never
  reads supercritical — correct physics, poor demonstration.
- **The celerity is not water's.** Real water hammer runs at ~1200 m/s. The slot
  celerity is a slider (8–400 m/s) because the time step scales with it. The
  *scaling* — `ΔH = cΔv/g`, period `4L/c` — is exact; the absolute number is
  yours to choose.
- **Turbulence is a Smagorinsky closure at metre-ish resolution.** Good enough
  for the shape of a velocity profile and the existence of a roller; not a
  substitute for a boundary-layer calculation.

## Credit

Inspired by [hydraulics-fun](https://github.com/barneydobson/hydraulics-fun)
(plan-view shallow water, same family) and by Pavel Dobryakov's
[WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation),
which is where the "one fullscreen pass per physics step" style comes from.
