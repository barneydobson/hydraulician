# hydraulician

**Interactive 2D hydraulics in the vertical plane, in your browser** — draw a
channel with the mouse and watch free-surface Navier–Stokes run through it —
written almost entirely by Claude (the solver, the scenes, the 40-demo teaching
pack and the tooling), with the maintainer directing and reviewing.

**Try it:** <https://barneydobson.github.io/hydraulician/> — the hosted copy
goes live once the repository is public. Locally, serve the folder and open
`index.html`; there is nothing to build:

```bash
python3 -m http.server 8124     # then open http://localhost:8124
```

`?scene=hammer` boots straight into a scene, `?ex=HJ-1` boots straight into a
set-up teaching exercise, and in the app `S` opens the scene list and `E` the
exercises.

**Contents** — [Summary](#summary) · [Exercises](#exercises) ·
[Method](#method) · [Developer](#developer) ·
[Appendix: controls, limits, credit](#appendix--controls-limits-and-credit)

---

## Summary

hydraulician solves the water, rather than animating it: a jet, a hydraulic
jump, a backwater curve or a water-hammer surge all come out of the same
equations, and the app measures them live — depth, unit discharge, critical
and normal depth, the energy grade line, jump conjugate depths, velocity
profiles under a rake. It is built for **teaching and outreach**: a lecture
demonstration you can interrupt and argue with, a lab you can run without a
lab, a thing to show at an open day. It is **not** for research or engineering
design, and the reasons are structural, not modesty. It is a vertical
slice one metre wide, so every discharge is a unit discharge (m²/s) and
nothing lateral exists — no V-notches, no compound channels, no circular pipe
sections. Its resistance is *delivered* by the grid, the wall function and the
eddy viscosity rather than dialled in, so `h_f ∝ V²` is clean but the absolute
Manning `n` or Colebrook λ you measure belongs to the mesh, not to a table.
Gauge pressure cannot fall below zero, so there are no true siphons, no
suction lift and no NPSH — column separation happens, at the wrong absolute
pressure. And it is a single-event demonstrator with no calibration,
statistics or design tables: use it to see why a formula is the shape it is,
then use a real model to answer a real question.

## Exercises

Click a picture and that exercise opens in the hosted app, already set up:
right scene, right resolution, the drawn rig where a demo needs one, and a card
that says what to read off it. Click the **id** for the full brief in
`exercises/<folder>/README.md` — lecturer setup, student worksheet, the
Blackboard collection script and the verification record. The whole programme,
with the standing rules every worksheet carries, is in
[`exercises/INDEX.md`](exercises/INDEX.md).

|  |  |  |  |
|---|---|---|---|
| [<img src="docs/thumbs/DA-1.jpg" alt="DA-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=DA-1)<br>**[DA-1](exercises/DA-1-scale-ladder/)** · The scale ladder<br><sub>submit λ, q, head H</sub> | [<img src="docs/thumbs/DA-2.jpg" alt="DA-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=DA-2)<br>**[DA-2](exercises/DA-2-time-scales/)** · Time scales as √λ<br><sub>submit λ, time between marks</sub> | [<img src="docs/thumbs/DA-3.jpg" alt="DA-3" width="220">](https://barneydobson.github.io/hydraulician/?ex=DA-3)<br>**[DA-3](exercises/DA-3-scale-effects/)** · Scale effects, live<br><sub>optional: C_d against resolution</sub> | [<img src="docs/thumbs/HP-1.jpg" alt="HP-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=HP-1)<br>**[HP-1](exercises/HP-1-penstock-power/)** · Max power transmission h_f = H/3<br><sub>submit gap, q, jet speed</sub> |
| [<img src="docs/thumbs/HP-2.jpg" alt="HP-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=HP-2)<br>**[HP-2](exercises/HP-2-pelton/)** · Pelton principle<br><sub>lecturer demo, nothing submitted</sub> | [<img src="docs/thumbs/NC-1.jpg" alt="NC-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=NC-1)<br>**[NC-1](exercises/NC-1-slope-area/)** · Slope-area mystery discharge<br><sub>submit window, estimated discharge</sub> | [<img src="docs/thumbs/NC-2.jpg" alt="NC-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=NC-2)<br>**[NC-2](exercises/NC-2-alpha/)** · Is α really 1?<br><sub>submit station, energy coefficient α</sub> | [<img src="docs/thumbs/NC-3.jpg" alt="NC-3" width="220">](https://barneydobson.github.io/hydraulician/?ex=NC-3)<br>**[NC-3](exercises/NC-3-bed-shear/)** · Bed shear and riprap<br><sub>submit bed shear, riprap size</sub> |
| [<img src="docs/thumbs/QS-1.jpg" alt="QS-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=QS-1)<br>**[QS-1](exercises/QS-1-drain-predict/)** · Predict the drain<br><sub>submit predicted, measured drain time</sub> | [<img src="docs/thumbs/QS-2.jpg" alt="QS-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=QS-2)<br>**[QS-2](exercises/QS-2-twin-tanks/)** · Two reservoirs find a level<br><sub>submit tank area, half-time</sub> | [<img src="docs/thumbs/UN-1.jpg" alt="UN-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=UN-1)<br>**[UN-1](exercises/UN-1-celerity/)** · The class discovers c<br><sub>submit v₀ and surge ΔH</sub> | [<img src="docs/thumbs/UN-2.jpg" alt="UN-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=UN-2)<br>**[UN-2](exercises/UN-2-establishment/)** · Flow establishment<br><sub>submit u_max, time to 90%</sub> |
| [<img src="docs/thumbs/UN-3.jpg" alt="UN-3" width="220">](https://barneydobson.github.io/hydraulician/?ex=UN-3)<br>**[UN-3](exercises/UN-3-surge-tank/)** · Surge tank vs the ODE<br><sub>submit tank width, upsurge, period</sub> | [<img src="docs/thumbs/WV-1.jpg" alt="WV-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=WV-1)<br>**[WV-1](exercises/WV-1-dispersion/)** · Dispersion, one period each<br><sub>submit period, wavelength, flume</sub> | [<img src="docs/thumbs/WV-2.jpg" alt="WV-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=WV-2)<br>**[WV-2](exercises/WV-2-buried-gauge/)** · The buried wave gauge<br><sub>submit period, pressure ratio</sub> | [<img src="docs/thumbs/WV-3.jpg" alt="WV-3" width="220">](https://barneydobson.github.io/hydraulician/?ex=WV-3)<br>**[WV-3](exercises/WV-3-reflection/)** · Reflection coefficient<br><sub>submit period, reflection coefficient</sub> |
| [<img src="docs/thumbs/MO-1.jpg" alt="MO-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=MO-1)<br>**[MO-1](exercises/MO-1-gate-cv/)** · Sluice gate C_d and thrust<br><sub>submit C_d and gate thrust</sub> | [<img src="docs/thumbs/MO-2.jpg" alt="MO-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=MO-2)<br>**[MO-2](exercises/MO-2-jet-vane/)** · Jet on a plate, jet on a vane<br><sub>optional: stagnation force ratio</sub> | [<img src="docs/thumbs/FR-1.jpg" alt="FR-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=FR-1)<br>**[FR-1](exercises/FR-1-friction-law/)** · The friction law<br><sub>submit velocity, friction head loss</sub> | [<img src="docs/thumbs/LL-1.jpg" alt="LL-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=LL-1)<br>**[LL-1](exercises/LL-1-borda-carnot/)** · Borda–Carnot expansion<br><sub>submit measured, ideal loss</sub> |
| [<img src="docs/thumbs/LL-2.jpg" alt="LL-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=LL-2)<br>**[LL-2](exercises/LL-2-find-throttle/)** · Find the throttle<br><sub>submit throttle position, k_L</sub> | [<img src="docs/thumbs/PU-1.jpg" alt="PU-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=PU-1)<br>**[PU-1](exercises/PU-1-system-curve/)** · System curve, honest operating point<br><sub>submit discharge and head</sub> | [<img src="docs/thumbs/WE-1.jpg" alt="WE-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=WE-1)<br>**[WE-1](exercises/WE-1-sharp-weir/)** · Rating a sharp-crested weir<br><sub>submit q, head over crest</sub> | [<img src="docs/thumbs/UF-1.jpg" alt="UF-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=UF-1)<br>**[UF-1](exercises/UF-1-normal-depth/)** · Normal depth ∝ q^0.6-ish<br><sub>submit q and normal depth</sub> |
| [<img src="docs/thumbs/FB-1.jpg" alt="FB-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=FB-1)<br>**[FB-1](exercises/FB-1-choking-hump/)** · The hump that chokes<br><sub>submit measured, predicted step height</sub> | [<img src="docs/thumbs/FB-2.jpg" alt="FB-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=FB-2)<br>**[FB-2](exercises/FB-2-yc-three-ways/)** · Critical depth three ways<br><sub>submit three critical-depth readings</sub> | [<img src="docs/thumbs/HJ-1.jpg" alt="HJ-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=HJ-1)<br>**[HJ-1](exercises/HJ-1-belanger/)** · Bélanger from a room of flumes<br><sub>submit Fr₁, y₂/y₁</sub> | [<img src="docs/thumbs/GV-1.jpg" alt="GV-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=GV-1)<br>**[GV-1](exercises/GV-1-backwater/)** · The class digitises the backwater<br><sub>submit station, surface elevation</sub> |
| [<img src="docs/thumbs/GV-2.jpg" alt="GV-2" width="220">](https://barneydobson.github.io/hydraulician/?ex=GV-2)<br>**[GV-2](exercises/GV-2-profile-safari/)** · Profile safari<br><sub>submit score and screenshots</sub> | [<img src="docs/thumbs/CS-1.jpg" alt="CS-1" width="220">](https://barneydobson.github.io/hydraulician/?ex=CS-1)<br>**[CS-1](exercises/CS-1-cso-spill/)** · When does your chamber spill?<br><sub>submit throttle gap, spill discharge</sub> |   |   |

**Backups and enrichment (B1–B10).** Same format; these are the spares for a
session that runs short, a rig that will not behave, or a keener class.

|  |  |  |  |
|---|---|---|---|
| [<img src="docs/thumbs/B1.jpg" alt="B1" width="220">](https://barneydobson.github.io/hydraulician/?ex=B1)<br>**[B1](exercises/B1-period-4Lc/)** · T = 4L/c with your own valve<br><sub>submit pipe length, period</sub> | [<img src="docs/thumbs/B2.jpg" alt="B2" width="220">](https://barneydobson.github.io/hydraulician/?ex=B2)<br>**[B2](exercises/B2-flexible-pipe/)** · The flexible pipe (c slider)<br><sub>submit surge at two celerities</sub> | [<img src="docs/thumbs/B3.jpg" alt="B3" width="220">](https://barneydobson.github.io/hydraulician/?ex=B3)<br>**[B3](exercises/B3-dambreak/)** · Dam break: the moving jump<br><sub>submit bore speed, station pair</sub> | [<img src="docs/thumbs/B4.jpg" alt="B4" width="220">](https://barneydobson.github.io/hydraulician/?ex=B4)<br>**[B4](exercises/B4-orbital-decay/)** · Orbital decay off the trails<br><sub>submit period, surface/bed ratio</sub> |
| [<img src="docs/thumbs/B5.jpg" alt="B5" width="220">](https://barneydobson.github.io/hydraulician/?ex=B5)<br>**[B5](exercises/B5-iribarren/)** · Iribarren map jigsaw<br><sub>submit ξ, breaker type, surf width</sub> | [<img src="docs/thumbs/B6.jpg" alt="B6" width="220">](https://barneydobson.github.io/hydraulician/?ex=B6)<br>**[B6](exercises/B6-ursell/)** · Ursell number<br><sub>submit period, Ursell number</sub> | [<img src="docs/thumbs/B7.jpg" alt="B7" width="220">](https://barneydobson.github.io/hydraulician/?ex=B7)<br>**[B7](exercises/B7-venturi-rating/)** · Venturi meter rating<br><sub>submit q and throat Δh</sub> | [<img src="docs/thumbs/B8.jpg" alt="B8" width="220">](https://barneydobson.github.io/hydraulician/?ex=B8)<br>**[B8](exercises/B8-three-orifices/)** · Three orifices, three coefficients<br><sub>submit lip type, C_c</sub> |
| [<img src="docs/thumbs/B9.jpg" alt="B9" width="220">](https://barneydobson.github.io/hydraulician/?ex=B9)<br>**[B9](exercises/B9-three-reservoirs/)** · Three reservoirs, one junction<br><sub>submit level, Q_B, junction head</sub> | [<img src="docs/thumbs/B10.jpg" alt="B10" width="220">](https://barneydobson.github.io/hydraulician/?ex=B10)<br>**[B10](exercises/B10-crest-vs-hgl/)** · Lift the crest until the pipe gives up<br><sub>submit level, separation elevation</sub> |   |   |

## Method

The solver is **barotropic weakly-compressible Navier–Stokes in the vertical
plane**, on a staggered (MAC) grid, with the cell fill fraction `f` doing
double duty as the density:

```
∂f/∂t + ∇·(f u) = 0                    exact, flux form
∂u/∂t + (u·∇)u  = −∇p/ρ + g + ∇·(ν∇u) − C_f|u|u/Δ
p/ρ = c² max(f − 1, 0)                 equation of state
```

That equation of state is the whole trick, and it is a **2D Preissmann slot**.
Where a cell is not full, `f < 1`, the pressure is zero and the water falls
freely — that *is* the free surface, and no interface has to be reconstructed
to get the boundary condition right. Where a cell is over-full, `f > 1`, the
water has been compressed and pressure propagates at celerity `c`. So
free-surface flow and pressurised pipe flow are the same equations, a channel
that surcharges into a pipe (or a pipe that drains back into a channel) needs
no special case, and `c` — the slot width — is a slider.

The assumptions are worth knowing before you trust a number. It is a **2D
slice**: discharges are per metre of width, and "areas" are gap heights.
Compressibility is **weak but chosen** — real water hammer travels at
~1200 m/s, the slider runs 8–400 m/s, because the time step scales as
`Δt ≈ 0.45Δx/(c + 6)`; the scaling (`ΔH = cΔv/g`, period `4L/c`) is exact and
the absolute celerity is yours to pick. Resistance is **delivered, not
dialled**: a sloping bed rasterised onto a Cartesian grid is a staircase whose
steps are genuine form roughness, the no-slip wall adds stress through the
eddy viscosity, and the result is that normal depth and Manning's `n` are
*measured* off the computed energy grade line (`S_f = −dE/dx`) rather than
derived from the friction slider. There is **no surface tension**, and air is
a **passive void** with no pressure of its own — nothing pneumatic works, and
breakers spill rather than plunge because an overturning tongue is thinner
than the ~2-cell interface can hold. Numerically there is **no pressure
Poisson solve**: two fullscreen GPU passes per substep, `vel` (3rd-order
upwind advection, Smagorinsky eddy viscosity, wall-aware Laplacian, implicit
bed friction, then `∇p` from the EOS) and `vof` (van Leer-limited flux-form
advection of `f` with an interFoam-style compression flux and a donor-cell
positivity limiter, which conserves volume to machine precision), plus three
cheap passes for the per-column reduction, the particles and the display.
WebGL2, zero dependencies, no build step, a few thousand substeps a second,
real time on a laptop.

Measured headless, for calibration of trust: water hammer peaks at 39.0 m
against Joukowsky's 41.1 m (−5%) with a period of 3.0 s against `4L/c` = 2.8 s;
orifice efflux is 5.62 m/s against √(2gh) = 5.8 m/s (C_v ≈ 0.97); the venturi
nozzle reaches 19.4 m/s against 20.3; the conjugate depth downstream of a free
jump comes out 5% under Bélanger; and a 14 m flume carries q = 0.251 m²/s in
against 0.215–0.261 out with total volume flat. Every scene has been run to
t = 120 s and checked for steadiness, flutter and discharge continuity.

## Developer

Clone it, serve it, open it — that is the whole setup:

```bash
git clone https://github.com/barneydobson/hydraulician
cd hydraulician
python3 -m http.server 8124
```

The file map:

| file | what lives there |
|---|---|
| `index.html` | markup, all the CSS, the classic `<script>` tags |
| `js/gl.js` | `GLH` — programs, float textures, FBOs, ping-pong pairs, bufferless draws |
| `js/shaders.js` | `Shaders` — the five passes: `vel`, `vof`, `col`, `part`, `disp` |
| `js/scenes.js` | `SCENES` — `channel()` builds a prismatic GVF reach, `drop()` an approach → chute → apron |
| `js/sim.js` | `SIM` — grid allocation, wall rasterisation, the substep loop, control bands, readbacks |
| `js/overlay.js` | `OVERLAY` — the 2D canvas: y_c, y_n, EGL, profile classification, jump detection, gauges, rake |
| `js/main.js` | boot, the panel spec, pointer tools, view transform, frame loop, `window.APP` |
| `js/exercises.js` | `EXERCISES` — the 40 teaching demos the `E` menu and `?ex=` read |
| `js/exercises-rigs.js` | the drawn rigs (RIG-A duct, RIG-B channel, RIG-C tanks, RIG-D chamber) those demos load |

**No build step, no bundler, no module system — on purpose.** Everything is a
classic script so that double-clicking `index.html` on a `file://` URL still
works, which is what a lecturer with no terminal will do. Keep it that way, and
keep it dependency-free.

**Read [`CLAUDE.md`](CLAUDE.md) before touching the solver.** It is the
contributor briefing: the model, the state textures, the coordinate and
geometry contracts, and — most valuable — the guard rails, each of which was
bought with an explosion (the transport-consistency cap, the open-boundary
ring, the control bands, the soft level boundaries, the conservation rule in
the VOF pass). The section on conservation in particular is not optional
reading: an earlier positivity clamp invented enough water to triple the
discharge along a flume while the depth sat perfectly steady.

**Adding a scene.** Scenes are plain data in `js/scenes.js` — a physical
domain `W × H`, a wall segment list (`[x0,y0,x1,y1,th]` centrelines with butt
ends), boundary flags, and live parameters. `channel(...)` builds a prismatic
reach from (S₀, C_f, q) plus a control and `drop(...)` builds an approach →
chute → apron, so most new scenes are a call to one of those plus a few drawn
segments. Copy the nearest neighbour and read its comments; the ones about
tailwater ≥ 1.3·y_c and about beds staying above the domain floor are load
bearing.

**Adding an exercise.** Append an entry to `EXERCISES` in `js/exercises.js`.
Each is an object with an `id` (that is the `?ex=` id), `title`, `topic`,
`folder`, `scene`, optional `rig` + `rigParams`, `viewParams`, a `digit` block
that turns the student's last digit into a personalised parameter, `task`,
`submit`, `settle` and `notes`. `HJ-1` is a good template. Then write the
brief in `exercises/<folder>/README.md` and add the row to `exercises/INDEX.md`
— the id must match in all three.

**Testing headless.** `exercises/_runner/runner.py` (stdlib only) drives a
real Chrome over CDP: `launch`, `eval`, `pump --sim-seconds`, `shot`, `bench`,
`status`, `close`. See [`exercises/_runner/HOWTO.md`](exercises/_runner/HOWTO.md)
for the worked example and the concurrency rules. Inside the page, `APP.frames(n)`,
`APP.tick(n)`, `APP.probe(x,y)`, `APP.volume()` and `APP.zoomAt(...)` exist for
scripted runs — the render loop stops when the tab is hidden, so drive it
through those rather than waiting on wall-clock time.

**Where things live.** The teaching pack and its standing rules are in
[`exercises/INDEX.md`](exercises/INDEX.md); per-demo status and measured
caveats in `exercises/_director-status.md`; open proposals — demos that need a
change, and UI changes that have been costed but not made — in
[`exercises/CHANGES-NEEDED.md`](exercises/CHANGES-NEEDED.md); and the reports
for changes already made (the exercise picker, the gauge inspector and CSV,
rig save/share) in `exercises/_code-changes/`.

**Deploying.** `.github/workflows/pages.yml` publishes the repository as-is to
GitHub Pages on every push to `main` — no build, and `.nojekyll` stops Jekyll
touching the folders. It turns Pages on by itself the first time it can run, so
making the repository public is the only manual step; if the first run has not
done it for you, set **Settings → Pages → Source = GitHub Actions**.

---

## Appendix — controls, limits and credit

Water enters at the top left by default. Everything else you build:

| | |
|---|---|
| **left-drag** | draw a straight edge (hold **shift** to snap to 0°/45°/90°) |
| **right-drag** | pour a much larger flow wherever you point |
| **wheel** / **middle-drag** | zoom about the cursor · pan (**0** resets, **+** / **−** step) |
| **1**–**7** | wall · erase · valve · spout · gauge · rake · tracers |
| **[** **]** | brush size |
| **Z** / **C** | undo edge / clear everything you drew |
| **V** | open / slam every valve |
| **space** / **R** | pause / reload the scene's water |
| **G** / **P** / **D** / **N** | cycle the field · particles · dye · channel overlay |
| **S** / **E** | scene list · exercise list |

Honest limits, beyond the ones in [Summary](#summary):

- **Zone-3 reaches are short** on mild, horizontal and adverse beds, because
  the high delivered resistance drags the hydraulic jump close to wherever the
  supercritical flow enters. S3 (steep bed) is clean; M3, H3 and A3 appear only
  briefly. A gate that is even slightly drowned puts a roller straight on top
  of its own jet, and the depth-averaged Froude number then never reads
  supercritical — correct physics, poor demonstration.
- **Turbulence is a Smagorinsky closure at metre-ish resolution.** Good enough
  for the shape of a velocity profile and the existence of a roller; not a
  substitute for a boundary-layer calculation.
- **Waves are damped by resolution, not by any parameter.** A wave has to be
  a few cells tall to survive an interface that is itself about two cells
  thick, so short waves decay fast and long waves travel nearly free.
- **Pooled classwork must pin the resolution.** Because the delivered
  roughness depends on cells per depth, everyone in a class has to be on the
  same Resolution setting for their numbers to be comparable — which is why
  the exercise picker sets it.

Credit: inspired by [hydraulics-fun](https://github.com/barneydobson/hydraulics-fun)
(plan-view shallow water, the sibling project) and by Pavel Dobryakov's
[WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation),
which is where the "one fullscreen pass per physics step" style comes from.
