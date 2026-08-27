# hydraulician

Interactive 2D hydraulics in the **vertical plane**: GPU (WebGL2), zero
dependencies, no build step. A teaching tool — draw a channel, a pipe or a
tank and free-surface Navier–Stokes runs through it, with the measurements
(depths, heads, profiles, jumps) done on screen.

**Run it:** serve statically (`python3 -m http.server 8124`) and open
`index.html` — or double-click it; classic scripts, so `file://` works.
`.claude/launch.json` has a preview config on port 8124. `?scene=<id>` boots a
scene, `?ex=<id>` an exercise. Sibling project: `hydraulics-fun` (plan-view
shallow water); this one resolves the depth.

## Where things live

| Path | What it is |
|---|---|
| `index.html` | markup + all CSS, classic script tags; the control panel is generated from a spec in `main.js` |
| `js/gl.js` | `GLH` — programs, float textures, FBOs, ping-pong, fullscreen draws |
| `js/shaders.js` | `Shaders` — the five passes: `vel`, `vof`, `col` (column reduction), `part` (particles), `disp` (display) |
| `js/sim.js` | `SIM` — grid, wall rasterisation, substep loop, control bands, probe/rake readbacks, `boxForce` |
| `js/scenes.js` | `SCENES` — scene definitions; `channel()` and `drop()` builders |
| `js/overlay.js` | `OVERLAY` — 2D canvas: d_c, d_n, EGL, profile classification, jump boxes, gauge charts, rake |
| `js/main.js` | boot, panel spec, pointer tools, view transform, `window.APP`, rig save/load (`RIG`) |
| `js/exercises.js` | the exercise register the picker reads (machine-readable source of the pack) |
| `js/exercises-rigs.js` | drawn rigs + applied settings per exercise, as rig-format JSON |
| `docs/numerics.md` | the full derivation: multiphase NS → heavy-fluid limit → Preissmann-slot EOS → discretisation |
| `docs/notation.md` | the symbol register and why it was chosen (the literatures disagree) |
| `docs/engineering-notes.md` | the measured lore: guard rails, conservation, geometry contracts, verified numbers, gotchas |
| `docs/hydrostatic-attractor.js` | standalone check that the solver finds hydrostatic balance |
| `exercises/` | one folder per exercise: `README.md` brief, `rig.js` headless script, `collect_plot.py` |
| `exercises/_runner/` | `runner.py` CDP harness (Linux-bound; see its HOWTO.md), `check_pack.py` consistency checker |
| `test/` | `ui-smoke.mjs` layout gate and `cdp.mjs`, its portable headless-Chrome client |
| `.github/workflows/pages.yml` | Jekyll over the repo — briefs and docs render as pages; underscore folders unpublished |

## The model, in one paragraph

Weakly-compressible Navier–Stokes on a MAC grid, with the VOF fill fraction
`f` doubling as the density and the EOS `P = c² max(f−1, 0)` acting as a 2D
Preissmann slot: an unfilled cell has `p = 0` (that *is* the free surface —
no interface reconstruction), an over-full cell is pressurised water with
celerity `c`. No Poisson solve; two fullscreen passes per substep. The whole
derivation, including what is deliberately not represented, is in
[docs/numerics.md](docs/numerics.md).

## Notation

Symbols are the register in [docs/notation.md](docs/notation.md) — depth `d`
(`d_c`, `d_n`, `d₁`, `d₂`), level `η`, piezometric head `h = z + p/ρg`,
energy head `H`, specific energy `E = H − z_b`, velocity `u = (u, w)`,
pressure head always spelled `p/ρg`. Two standing rules:

- **Code identifiers follow the notation too.** The whole stack — GLSL
  identifiers, runtime state, public API fields — uses `z` for the domain
  vertical, `w` for the vertical velocity, `d` for depth (`probe().w`,
  `boxForce().fz`, `analyse().d/.dc/.dn/.H`, `findJumps().d1/.d2`,
  `gauges[].z`, `source.z/.vz`). Two deliberate exceptions: GLSL *swizzles*
  (`.y` is component syntax, `U.g` still stores w) and screen-space pixel
  coordinates (canvas y-down) stay `y`; the view transform (`V.Y(z)`,
  `toDomain`) is the boundary between the two.
- **Serialized keys go through the version gate.** The rig wire format is v2
  (`z`, `vz`, gauge fields `"h"`/`"d"`/`"speed"`); `RIG.migrate` in `main.js`
  accepts exactly the current version and rejects anything else — prototype,
  no back-compat. Any future key change bumps `V`; old links just break.

## Rules that keep it alive

Each of these was bought with a measured failure; the stories and numbers are
in [docs/engineering-notes.md](docs/engineering-notes.md). Breaking one tends
to look fine for a minute and explode in an exercise.

- **VOF positivity is a donor-side flux cap, never an `f` clamp** — clamping
  invents water at machine speed. Both face neighbours must compute the
  identical flux. Read the Conservation section before touching the vof pass.
- **Gravity and `∇p` stay additive in the vel pass** — anything interposed
  breaks the discrete hydrostatic equilibrium.
- **Geometry contracts:** wall segments have butt ends; slabs leaving the
  domain are extrapolated, not clamped; a scene's bed stays above `z = 0`;
  ground is solid all the way down; the closed outer ring is stamped last.
- **Controls:** a subcritical reach needs a real downstream control; a
  tailwater stands clear of critical (`≥ 1.3 d_c`, rechecked when `q`
  changes); outfall edges (`open` = 2) are for brinks, never ponds.
- **The panel toggles are self-configuring** — the sandbox must be able to
  reproduce any scene by hand; that is the acceptance test for control
  changes.
- **Zero dependencies, classic scripts** — no modules, no bundlers, no fetch,
  and no YAML front matter in `index.html` or `js/*` (the Pages build copies
  them verbatim only because there is none). Any published page carrying
  `math` code fences must end with a `<script>` tag loading `docs/math.js` —
  stripped on github.com, live on the Pages build, where it rewrites the
  fences for MathJax (README.md and docs/numerics.md show the pattern).

## Testing

Four gates, all zero-dependency and all non-zero on failure:

| Command | Guards | Cost |
|---|---|---|
| `python3 exercises/_runner/check_pack.py` | the pack agrees with itself (folders, ids, countdowns, digit ladders) | instant |
| `python3 exercises/_runner/check_notation.py` | one notation everywhere — retired field names, gauge keys, wire keys, the y-family in briefs | instant |
| `node exercises/_runner/smoke.js` | the app actually boots and its contracts are WIRED: API field names, rig round-trip, physics invariants, every scene, every exercise | ~9 min |
| `node test/ui-smoke.mjs` | the interface holds its layout agreements — start-screen / `?scene=` / `?ex=` boots, the strip, the narrow-window overlay, the fitted view; the side panel is DOCKED so `--dock` and `canvas.clientWidth` agree and nothing is drawn underneath it | 8 boots |

Run the first two before printing worksheets, and `smoke.js` before pushing
anything that touches `js/`. `smoke.js --only=api,rig` is the fast subset
(~2.5 min); `--keep` leaves the browser open on failure.

`ui-smoke.mjs` is the interface's own gate (Node 22+ for the global
`WebSocket`; `$CHROME` overrides the browser it finds): run it after touching
`index.html`, the TOOLBAR spec, `DOCK`, `START` or the boot wiring. Every
case in it is a bug that reached the working tree while the strip was being
built, so a failure there is a real regression rather than a tightened
expectation. Its `test/cdp.mjs` launcher passes the GPU-backed
`--use-angle=d3d11` itself, because the software rasteriser renders a
full-window WebGL canvas so slowly that a spin-up scene times the run out.

The two checkers are complements: `check_notation.py` greps for *names*,
`smoke.js` proves the names are *connected* — a field renamed at the write
site but not the read site greps clean and returns `undefined` at runtime.

Driving the app yourself: the render loop stops when the page is hidden, so
headless work goes through `APP.frames(n)`, `APP.tick(n)`, `APP.probe(x,z)`
(returns `u, w, p, phead, f, speed` — `phead` is pressure head only),
`APP.volume()`, `APP.zoomAt(...)`, `APP.boxForce` / `APP.placeCV`.
`exercises/_runner/runner.py` wraps that over CDP (Linux-bound — macOS shims
in its HOWTO.md); `smoke.js` carries its own portable CDP client.

Two sharp edges that have cost time, both now commented in `smoke.js`:
`APP.volume()` reads the **cached** column reduction, so straight after a
rebuild or `resetWater()` it returns 0 until `SIM.columns(true)` forces the
readback; and `APP.pickExercise()` lands its rig a microtask later, so
`await EX.ready` before reading what it applied.

## The exercise pack

Described in four places with different jobs that do **not** collapse into
one register: `js/exercises.js` is the machine-readable source, each folder's
`README.md` is the human brief, `INDEX.md` is abbreviated navigation, and
`demo-programme.html` is the dated rev-1 document the pack was built from —
history. Briefs carry the minimum needed to run the demo; statistics and
methodology live in each folder's uncommitted `_archive/`. Coordinates in a
recipe are exact — rounding them makes a new geometry; re-measure before
shipping. `spinup` values are measured settle times, not guesses.

## Gotchas worth knowing on day one

- A dev browser may serve stale JS from `http.server`; force with
  `fetch(url, {cache:"reload"})` then `location.reload()`.
- Resolution changes Δx, not the physics: the domain is a fixed physical
  rectangle and the grid is sized to a cell budget.
- `state.rt` in the status bar is the speed truth — m2 at ~0.9× real time is
  the design point, not a bug.
- The vertical exaggeration is fitted to the window (`autoVex` in main.js),
  not 1:1 — a scene's `view.vex`, the slider or a drag on the letterbox band
  takes the number over, and `0` resets to the fitted value, not to 1:1. The
  ruler, scale bar and ∇ markers follow the same rect, so nothing on screen
  stops being true; details in
  [docs/engineering-notes.md](docs/engineering-notes.md).
- The Force box, the Froude view, and surface-wave damping all have
  non-obvious failure modes — read their sections in
  [docs/engineering-notes.md](docs/engineering-notes.md) before "fixing"
  anything they show.
