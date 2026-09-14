# Notation

The symbols the app displays — hover readout, gauge cards, overlay, exercise
briefs — and the docs use are one deliberate set. This page is the register:
what each symbol means, and why these letters and not others.

## Why it has to be chosen

The literatures this solver sits between do not agree, and the letter $h$ in
particular carries three incompatible meanings across them:

| Community | depth | level / head | energy |
| --- | --- | --- | --- |
| Chow and the US open-channel canon ([Chow 1959](https://web.itu.edu.tr/~bulu/hydraulics_files/lecture_notes_05.pdf); Henderson, French; the open-channel chapters of White, Munson, Çengel) | `y`, `y_c`, `y_n` | datum `z`, total head `H` | `E` specific energy |
| Saint-Venant / [shallow-water equations](https://en.wikipedia.org/wiki/Shallow_water_equations) | `h` | — | — |
| Wave mechanics ([Dean & Dalrymple](https://books.google.com/books/about/Water_Wave_Mechanics_for_Engineers_and_S.html?id=7GUYAQAAIAAJ); the Coastal Engineering Manual uses `d`) | `h` or `d` | `\eta` surface elevation | `H` = **wave height** |
| Delft school ([Battjes & Labeur, *Unsteady Flow in Open Channels*](https://www.cambridge.org/core/books/unsteady-flow-in-open-channels/5CCE099F37BCC5AF4E67B35F15666E7B)) | `d` | `h` = free-surface elevation; `z_b` bed | `H` energy head |
| Groundwater (Darcy) and pipe practice | — | `h` = piezometric head; `h_f` losses, the HGL | `H` total head |
| Open-channel turbulence research (Nezu & Nakagawa) | `h` | — | — |

"$h$ = depth" is the convention of the communities the solver simulates *with*
(the shallow-water equations, wave theory, turbulence papers); "$h$ = head" is
the convention of the ones it teaches *from* (GVF classification, hydraulic
grade lines, Darcy). One letter cannot serve both, so the app follows the
**Battjes & Labeur** set — depth $d$, free-surface / piezometric head $h$,
bed $z_b$, energy head $H$ — which is also, in the hydrostatic limit,
self-consistent: their surface elevation *is* the piezometric head, and this
solver merely extends $h$ into the non-hydrostatic cells it resolves.

## The set

- $x$, $z$ — streamwise and vertical coordinates. $z = 0$ is the domain floor
  (the datum), so $z_b$, the bed elevation, is positive — never the
  wave-theory frame that puts $z = 0$ on the free surface and the bed at $-d$.
- $u$, $w$ — velocity components along $x$ and $z$; $V$ — depth-averaged
  streamwise velocity.
- $d$ — water depth of the column; $d_c = (q^2/g)^{1/3}$ critical depth, $d_n$
  normal depth, $d_1$, $d_2$ conjugate depths at a jump.
- $\eta$ — water level, $\eta = z_b + d$, an elevation above the datum.
- $h$ — piezometric head, $h = z + p/\rho g$. Absorbing gravity into the
  pressure term turns the momentum equation into
  $D\mathbf{u}/Dt = -g\nabla h + \dots$, so $h$ is the potential whose
  gradient drives the flow. It is constant over the depth wherever the flow
  is hydrostatic (where it equals $\eta$), which is what makes its
  *departure* from constant a direct measure of non-hydrostatic behaviour
  (crests, brinks, gate vena contractas, chute toes, rollers, deep-water
  waves).
- $H$ — energy head, $H = h + kV^2/2g$; the overlay's energy grade line. In
  the wave scenes $H$ is also the wave height, crest to trough — both uses
  are the unimpeachable standard of their own sub-domain, and context
  separates them.
- $E$ — specific energy. Not a third concept: the same energy per unit weight
  re-datumed to the local bed, $E = H - z_b = d + kV^2/2g$ (hydrostatic). The
  hump relation $E_1 = E_2 + \Delta z$ *is* $H_1 = H_2$ with the bed rise
  moved across the equals sign; the symbol survives because the
  specific-energy diagram ($E$–$d$, $E_{\min}$ at critical) is a named
  teaching object.
- $p/\rho g$ — pressure head, always spelled out and never given a letter:
  many texts write it $h_p$, and keeping it letterless is what keeps bare
  $h$ unambiguous.
- $q$, $Fr$, $S_0$, $S_f$, $n$, $f$, $c$ — unit discharge, Froude number, bed
  and friction slopes, Manning n, fill fraction, slot celerity.
- $F$ — pressure force per metre width on a named face, N/m, with components
  $F_x$, $F_z$; centre of pressure — the point on the face through which the
  resultant acts.

$y$ survives only where it is genuinely something else: $y^+$ wall units, and
chart reference lines like $y = 2x$.

## Illustration

![Definition sketch: one column of uniform flow showing the datum z = 0 at the
domain floor, bed elevation z_b, depth d, water level η, a standpipe standing
at piezometric head h = z + p/ρg, one velocity head kV²/2g up to the energy
grade line H, and specific energy E measured from the bed.](notation-heads.svg)

*The heads of one column, in uniform flow. Every head is a length above the
datum: $z$ to the point, $p/\rho g$ from the point to where a standpipe
stands, $h = z + p/\rho g$; one velocity head $kV^2/2g$ more reaches the
energy line $H$. $E$ is the same climb re-datumed to the bed. $p/\rho g$
carries no letter — that is what leaves bare $h$ unambiguous.*

![Definition sketch: a channel reach with normal depth d_n in uniform flow, a
sluice gate backing the flow up, a supercritical jet where h dips below η at
the vena contracta, a hydraulic jump with conjugate depths d_1 and d_2 as the
energy grade line steps down, and a free overfall where the profile passes
through critical depth d_c.](notation-reach.svg)

*The same set along a reach. Where the flow is hydrostatic the HGL rides the
surface ($h = \eta$); it departs at the vena contracta and in the roller, and
that departure is the non-hydrostatic signal the register means. $H$ falls
only where energy is lost — at the gate and through the jump — while $d$
takes the special names: $d_n$ in uniform flow, $d_c$ at the critical
control, $d_1$, $d_2$ conjugate across the jump.*

## Code follows the register — with two exceptions

Code identifiers follow the display set too: the GLSL, the runtime state and
the public API say `z` for the domain vertical, `w` for the vertical velocity
and `d` for depth (`probe().w`, `boxForce().fz`, `analyse().d/.dc/.dn/.H`,
`findJumps().d1/.d2`, `gauges[].z`, `source.z/.vz`), so a reader meets one
notation everywhere. Two deliberate exceptions: GLSL *swizzles* (`.y` is
component syntax — `U.g` still stores `w`) and screen-space pixel coordinates
(canvas y-down) stay `y`; the view transform (`V.Y(z)`, `toDomain`) is the
boundary between the two. Two consequences worth knowing:

- The rig **wire format** (permalinks, `.json` rigs) is v2: it writes `z` /
  `vz` for the spout and gauge-field keys `"h"` / `"d"` / `"eta"` / `"speed"`
  (`"eta"` is the ASCII wire key for $\eta$, the same pattern `"speed"` uses
  for $|u|$). The v1 names (`y`, `vy`, `"head"`, `"depth"`) are gone and v1
  links are rejected — this is a prototype, and old wire formats are not
  migrated.
- `APP.probe().phead` is the **pressure** head $p/\rho g$ alone — no elevation
  term. Rig scripts build the piezometric head themselves as
  `z + probe().phead`. It was renamed from `head` at v2 precisely because the
  old name kept being read as piezometric.

<!-- Pages build only: github.com strips this tag and renders the maths
     natively; on the Jekyll site math.js rewrites it for MathJax. -->
<script src="math.js" defer></script>
