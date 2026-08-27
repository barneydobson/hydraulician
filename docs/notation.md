# Notation

The symbols the app displays — hover readout, gauge cards, overlay, exercise
briefs — and the docs use are one deliberate set. This page is the register:
what each symbol means, and why these letters and not others.

## Why it has to be chosen

The literatures this solver sits between do not agree, and the letter `h` in
particular carries three incompatible meanings across them:

| Community | depth | level / head | energy |
|---|---|---|---|
| Chow and the US open-channel canon ([Chow 1959](https://web.itu.edu.tr/~bulu/hydraulics_files/lecture_notes_05.pdf); Henderson, French; the open-channel chapters of White, Munson, Çengel) | `y`, `y_c`, `y_n` | datum `z`, total head `H` | `E` specific energy |
| Saint-Venant / [shallow-water equations](https://en.wikipedia.org/wiki/Shallow_water_equations) | `h` | — | — |
| Wave mechanics ([Dean & Dalrymple](https://books.google.com/books/about/Water_Wave_Mechanics_for_Engineers_and_S.html?id=7GUYAQAAIAAJ); the Coastal Engineering Manual uses `d`) | `h` or `d` | `η` surface elevation | `H` = **wave height** |
| Delft school ([Battjes & Labeur, *Unsteady Flow in Open Channels*](https://www.cambridge.org/core/books/unsteady-flow-in-open-channels/5CCE099F37BCC5AF4E67B35F15666E7B)) | `d` | `h` = free-surface elevation; `z_b` bed | `H` energy head |
| Groundwater (Darcy) and pipe practice | — | `h` = piezometric head; `h_f` losses, the HGL | `H` total head |
| Open-channel turbulence research (Nezu & Nakagawa) | `h` | — | — |

"`h` = depth" is the convention of the communities the solver simulates *with*
(the shallow-water equations, wave theory, turbulence papers); "`h` = head" is
the convention of the ones it teaches *from* (GVF classification, hydraulic
grade lines, Darcy). One letter cannot serve both, so the app follows the
**Battjes & Labeur** set — depth `d`, free-surface / piezometric head `h`,
bed `z_b`, energy head `H` — which is also, in the hydrostatic limit,
self-consistent: their surface elevation *is* the piezometric head, and this
solver merely extends `h` into the non-hydrostatic cells it resolves.

## The set

- `x`, `z` — streamwise and vertical coordinates. `z = 0` is the domain floor
  (the datum), so `z_b`, the bed elevation, is positive — never the
  wave-theory frame that puts `z = 0` on the free surface and the bed at `−d`.
- `u`, `w` — velocity components along `x` and `z`; `V` — depth-averaged
  streamwise velocity.
- `d` — water depth of the column; `d_c = (q²/g)^⅓` critical depth, `d_n`
  normal depth, `d₁`, `d₂` conjugate depths at a jump. (Chow's `y`-family
  would be internally consistent too, now that the coordinate is `z`; it is
  not better grounded than the Delft set the app already had.)
- `η` — water level, `η = z_b + d`, an elevation above the datum.
- `h` — piezometric head, `h = z + p/ρg`. Absorbing gravity into the pressure
  term turns the momentum equation into `Du/Dt = −g∇h + …`, so `h` is the
  potential whose gradient drives the flow. It is constant over the depth
  wherever the flow is hydrostatic (where it equals `η`), which is what makes
  its *departure* from constant a direct measure of non-hydrostatic behaviour
  (crests, brinks, gate vena contractas, chute toes, rollers, deep-water
  waves).
- `H` — energy head, `H = h + αV²/2g`; the overlay's energy grade line. In
  the wave scenes `H` is also the wave height, crest to trough — both uses
  are the unimpeachable standard of their own sub-domain, and context
  separates them.
- `E` — specific energy. Not a third concept: the same energy per unit weight
  re-datumed to the local bed, `E = H − z_b = d + αV²/2g` (hydrostatic). The
  hump relation `E₁ = E₂ + Δz` *is* `H₁ = H₂` with the bed rise moved across
  the equals sign; the symbol survives because the specific-energy diagram
  (`E`–`d`, `E_min` at critical) is a named teaching object.
- `p/ρg` — pressure head, always spelled out and never given a letter: many
  texts write it `h_p`, and keeping it letterless is what keeps bare `h`
  unambiguous.
- `q`, `Fr`, `S₀`, `S_f`, `n`, `f`, `c` — unit discharge, Froude number, bed
  and friction slopes, Manning n, fill fraction, slot celerity.

`y` survives only where it is genuinely something else: `y⁺` wall units, and
chart reference lines like `y = 2x`.

## Where code and display part company

Displayed symbols are the set above; code identifiers are not renamed to
match. The GLSL and the runtime state keep `y` for the vertical texture /
gauge / source fields and `v` for the vertical velocity component
(`probe().v`), because a rename there buys no reader anything and risks the
solver. Two consequences worth knowing:

- The rig **wire format** (permalinks, `.json` rigs) is v2: it writes `z` /
  `vz` for the spout and gauge-field keys `"h"` / `"d"` / `"speed"`. The v1
  names (`y`, `vy`, `"head"`, `"depth"`) are gone and v1 links are rejected —
  this is a prototype, and old wire formats are not migrated.
- `APP.probe().phead` is the **pressure** head `p/ρg` alone — no elevation
  term. Rig scripts build the piezometric head themselves as
  `z + probe().phead`. It was renamed from `head` at v2 precisely because the
  old name kept being read as piezometric.
