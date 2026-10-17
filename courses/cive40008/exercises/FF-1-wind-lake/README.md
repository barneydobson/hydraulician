# FF-1 · A fluid deforms under any shear

A closed rectangular tank of still water, 6 m long and 0.30 m deep, stands in
for a lake. At rest the water carries pressure only: u = 0 everywhere and
p = ρg·d, with d the depth below the surface. A wind shear stress τ on the
free surface (one signed slider) sets it moving at once, however small τ is:
the surface water drifts downwind, piles up against the downwind wall (engineers
call it the **set-up**), and the excess returns upwind along the bed. Reverse τ and the
circulation reverses; set τ = 0 and it dies away.

**Point:** a fluid at rest can carry no shear stress. Any shear, however
small, makes it flow, and it keeps flowing for as long as the shear acts.

An exercise students play with on their own; the lecturer can also show it in class. (L2, slides 3 and 10–12.) There is no
personalised parameter and nothing to pool.

**Open it:** press **E** in the [app](../../../../)
and pick **FF-1**, or use the direct link
[`?ex=FF-1`](../../../../?ex=FF-1).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

**At rest.** With u = 0 the momentum equation leaves only the vertical
balance ∂p/∂z = −ρg, so p = ρg·(η − z) = ρg·d: the pressure grows with the
depth below the surface, 2.9 kPa at the bed 0.30 m down — flat horizontal
bands on the Pressure field (p, kPa; the card shows the plain pressure, not
the pressure head, lecturer 2026-10-17). A shear stress needs a velocity gradient, and there is none.

**The wind.** A stress τ (N/m²) on the surface is a force τ per square metre
on the top layer of water. Nothing at rest can balance it, so the water
accelerates. Once a steady circulation has formed, the depth-integrated
momentum balance is between the wind and a surface slope:

    ρg·d·dη/dx ≈ τ_s + τ_b        →    Δη ≈ n·τ·L / (ρg·d),   n ≈ 1 to 1.5

where τ_b is the bed stress of the return flow (it acts in the same sense as
the wind on the column, hence n > 1). Here L = 6 m and d = 0.30 m, so at
τ = 20 N/m², τL/(ρgd) = 4.1 cm.

The slider's range is far beyond a real lake's: a gale over open water is
τ ≈ 0.5 N/m², which would set up a few millimetres here. The scene is scaled
so the set-up is several cells high and visible.

**Closed tank.** No water leaves, so the depth-averaged flux through any
section is zero: what the surface layer carries downwind, the lower layer
carries back. That is the return flow near the bed.

## What to do

The card carries these steps; the Wind stress τ slider is on the card.

1. **At rest.** Hover the water anywhere: the velocity is zero, and the
   pressure p = ρg × depth (2.9 kPa at the bed). Choose Pressure in Field &
   legend: flat horizontal bands. Pressure only.
2. **Turn on the wind.** Set τ to a small positive value (the arrows above
   the water point right). The water starts to move at once and keeps moving.
   Particles in the top layer run right; those near the bed run back left.
3. **Watch the water pile up.** The surface rises against the right wall and
   falls at the left; on Pressure the bands tilt. Choose Speed to see the
   fast surface layer and the slower return flow.
4. **Reverse τ.** Everything reverses: the water piles up at the left wall,
   the return flow runs to the right.
5. **τ = 0.** The circulation decays; the surface slops back level and the
   bands go flat again.

## For the instructor

Measured on Resolution Medium (844 × 113 cells, Δx = 7.1 mm) with the
headless probe in `rig.js`; u at mid-tank (x = 3 m), the set-up is the
piezometric level η = z + p/ρg read just above the bed at x = 0.2 and 5.8 m.

| reading | expected | measured |
|---|---|---|
| at rest, 10 s: largest speed in the tank | 0 | 0.2–0.5 mm/s |
| at rest: η at either end | 0.40 m | 0.399 m both, set-up 0.0 mm |
| τ = +1 N/m², 5–15 s: surface u / near-bed u | flows, however small | +0.02 to +0.03 / −0.003 to −0.006 m/s |
| τ = +1 N/m²: set-up | τL/(ρgd) = 2 mm | ±3–5 mm slosh about zero: under one cell, not visible |
| τ = +10 N/m², 10 s after switching on: set-up | 2.0–3.1 cm | 2.3–2.9 cm |
| τ = +20 N/m², 5 s after switching on | | surface +0.19, mid −0.10, bed −0.11 m/s; set-up 6.2 cm (overshoot) |
| τ = +20 N/m², 15–40 s (steady, ± seiche) | 4.1–6.1 cm | set-up 4.2–5.3 cm, settling at 4.9 cm; surface +0.23 to +0.28, near bed −0.07 to −0.09 m/s |
| τ = −20 N/m², 20–40 s after reversing | mirror image | set-up −4.6 to −5.4 cm (left wall high); surface −0.22 to −0.27, near bed +0.08 m/s |
| τ = 0 after −20, 10 / 20 / 40 / 60 s later: largest speed | decays | 4.8 / 2.2 / 1.0–1.2 / 1.2 cm/s |
| τ = 0, 30–60 s later: u at mid-tank | 0 | under 2 mm/s; a slow seiche of a few mm remains at the ends |

**Response time.** The surface layer moves within the first second, and the
two-layer circulation (drift on top, return along the bed) is fully formed
within 5 s; the set-up overshoots and rings as a seiche (period
2L/√(gd) ≈ 7 s) for 10–15 s before it settles. After τ returns to zero the
circulation is under 1 cm/s within about 30–40 s; a residual seiche of a few
millimetres at the end walls takes minutes to die. That is the honest limit
of "the motion dies away": it does, but the last millimetres are slow.

**Small τ.** At 1 N/m² the water visibly drifts (particles, Speed field) but
the set-up is a fifth of a cell and does not show; the set-up needs
τ ≳ 5 N/m² to be several cells high. The slider runs ±20 N/m² in steps of
0.5. ±20 was stable over 80 s of driving in both directions, with peak
speeds about 0.35 m/s.

### How the stress is applied

The solver adds τ/(ρΔz) to the u-face that holds the free surface, in the
vel pass, after gravity and ∇p (`FS_VEL` in `js/shaders.js`, "wind shear
stress"). The surface is located by the drop in water fraction going up a
column, max(f − f_above, 0), which sums to one up any column, so the whole
τ is delivered however the surface sits in its cells. The dry faces above
still take the water's u (the stress-free surface extension), so the wind
drives the water and not the void. τ comes from the scene's `tau` param
(`SIM.windTau()`); every scene without one runs at τ = 0 and skips the term.

The scene's `nu` is 2·10⁻³ m²/s, an eddy viscosity, as on HS-1: it is what
lets the tank come back to rest once τ returns to zero. The slot celerity is
12 m/s (still seven times √(gd)) so that a simulated second costs fewer
substeps.

### Discussion points

- **No yield stress.** A solid resists a small shear by deforming a little
  and stopping; water does not stop. The arrows can be made as short as the
  slider allows and the particles still drift.
- **Pressure only at rest.** Before the wind, the probe reads p = ρg·d at
  every point and u = 0. After the wind stops, the same.
- **Set-up.** The tilted surface is how the tank pushes back on the wind:
  the pressure gradient it makes balances τ over the depth. Storm surge on a
  shallow coast is the same balance, with L in kilometres.
- **Return flow.** Continuity in a closed tank forces it; the particles near
  the bed make it visible.
