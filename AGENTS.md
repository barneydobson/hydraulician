# hydraulician

Interactive 2D hydraulics in the **vertical plane**: GPU (WebGL2), zero
dependencies, no build step. A teaching tool — draw a channel, a pipe or a
tank and free-surface Navier–Stokes runs through it, with the measurements
(depths, heads, profiles, jumps) done on screen.

**Run it:** serve statically (`python3 -m http.server 8124`; Windows: `py -3`)
and open `index.html` — or double-click it; classic scripts, so `file://` works.
`.claude/launch.json` has a preview config on port 8124. `?scene=<id>` boots a
scene, `?ex=<id>` an exercise. Agent worktrees live in `.claude/worktrees/`
(`.gitignore` already says so). Sibling project: `hydraulics-fun`.

## Where things live

| Path | What it is |
| --- | --- |
| `index.html`, `css/app.css` | markup and the classic script tags, under 200 lines, the panel generated from `panel.js`; every CSS rule |
| `js/gl.js`, `js/shaders.js` | `GLH` — programs, float textures, FBOs, ping-pong; `Shaders` — the GPU programs: per-substep `vel`, `vof`; per-frame columns, display, particles, averaging, streamlines |
| `js/sim.js` | `SIM` — grid, wall rasterisation, substep loop, control bands, probe/rake readbacks, `boxForce` / `boxFlux` / `lineFlux` |
| `js/reconstruct.js`, `js/overlay.js`, `js/stream.js` | `RECON` — numerics with no WebGL: running mean, Welford, surface reconstruction, inlet depth, column energy, compaction; `OVERLAY` — d_c, d_n, EGL, profile classes, jump boxes, gauge charts, rake; `STREAM` — streamlines as contours of ψ from a fenced face-flux readback |
| `js/geom.js`, `js/scenes.js` | `GEOM` — polygon solids with named faces, point-in-polygon, face forces, no WebGL; `SCENES` — scene definitions, `channel()` and `drop()` |
| `js/state.js`, `js/fields.js`, `js/format.js`, `js/panel.js`, `js/strip.js`, `js/keymap.js` | `CONFIG`, `state`, `EMBED`, the view handles; `FIELDS` (nine colourings) and `GAUGE_QTY`; `FMT`, every number-to-text rule; `CONTROLS` spec, `buildPanel`, `syncPanel`, `UI.batch`; `TOOLS`, `TOOLBAR`, `TIP`, `KEYS`; `KEYMAP`, every shortcut described once |
| `js/legend.js`, `js/dock.js`, `js/popup.js`, `js/instruments.js`, `js/gauge-inspector.js`, `js/governor.js` | `LEGEND`, `UIMODE` (the exercise interface profile); toasts, `MINI`, `DOCK`, `START`, `dragWindow`; `POPUP`, the one popup behaviour behind every menu; gauges, rakes, flux sections, control volume, force, tracers; `GINSP`, a window per gauge; the frame-rate governor |
| `js/rig.js`, `js/pickers.js`, `js/exercises.js`, `js/exercises-rigs.js`, `js/courses.js` | `RIG` — save / load / share, the wire format and its version gate; `PICKER` (scene menu) and `EX` (exercise picker, digit rules, what a pick applies); `EXERCISES`, the empty register (its header is the card schema and the definition of a README brief); rig payloads per exercise; `COURSES`, `?course=<id>` or by `hosts` |
| `js/main.js` | boot, the view transform, `loadScene`, pointer tools, the frame loop, overlay drawing, status bar, Average (`setAverage`), `window.APP` |
| `courses/<id>/` | one course each: `course.js`, cards in `exercises.js`, briefs in `exercises/<ID>-<slug>/`, `INDEX.md`; `original` (default on `barneydobson.github.io`, due to be [retired](docs/making-exercises.md#retiring-the-original-pack)) and `cive40008` (default on `mvreeuwijk.github.io`, owns HS-1) |
| `test/` | every gate: `smoke.mjs`, `ui-smoke.mjs` (browser); `recon-test.mjs`, `geom-test.mjs`, `mutation-test.mjs`; `check_notation.py`, `check_headers.py`, `check_docs.py`; `cdp.mjs`, the headless-Chrome client |
| `exercises/_runner/` | `check_pack.py`, `runner.py` (CDP harness, Linux-bound), `HOWTO.md`, `bench.md`, `fixtures/`; `exercises/` also holds `INDEX.md` and `_code-changes/` |
| `docs/numerics.md`, `docs/boundary-conditions.md`, `docs/averaging.md` | the derivation (multiphase NS → Preissmann-slot EOS → discretisation); every boundary in one place; time averaging (section numbers are load-bearing: code and tests cite them) |
| `docs/notation.md`, `docs/engineering-notes.md` | the symbol register; the measured lore: guard rails, conservation, geometry contracts, verified numbers, the zero-dependency rule |
| `docs/making-exercises.md`, `docs/testing.md`, `docs/embedding.md` | demo to card; the gates in full; one exercise in Blackboard or Canvas |
| `docs/syllabus.md`, `docs/year1-programme.md`, `docs/design/` | the original pack by topic; the agreed CIVE40008 plan; dated design notes. `docs/_archive/` holds old plans, unpublished |
| `.github/workflows/` | `checks.yml` (instant gates, no-GPU browser job), `pages.yml` (Jekyll deploy after Checks; underscore folders unpublished); `docs/view.html` is the docs reader ("About the solver"), `docs/math.js` the MathJax rewrite for `math` fences (Pages only), `docs/hydrostatic-attractor.js` a float64 CPU re-implementation of the closure, not a solver check, not a gate |

Each `js/*.js` header lists the globals it defines and reads (`test/check_headers.py`); load order is `index.html`'s.

## The model, in one paragraph

Weakly-compressible Navier–Stokes on a MAC grid, with the VOF fill fraction
`f` doubling as the density and the EOS `P = c² max(f−1, 0)` acting as a 2D
Preissmann slot: an unfilled cell has `p = 0` (that *is* the free surface —
no interface reconstruction), an over-full cell is pressurised water with
celerity `c`. No Poisson solve; two fullscreen passes per substep. In an
open channel the free surface is stress-free (the void over it carries the
water's `u`) and a depth-scale mixing length carries the bed's stress up the
column, so the profile is a log law and the bed sets the resistance. The
derivation, including what is not represented: [docs/numerics.md](docs/numerics.md).

## Notation

The register is [docs/notation.md](docs/notation.md): depth `d`, level `η`,
head `h = z + p/ρg`, energy head `H`, velocity `u = (u, w)`. **Code follows it** (`z` vertical, `w` vertical velocity, `d` depth;
exceptions: GLSL swizzles, screen-pixel `y`). **Serialized keys go through the
version gate**: `RIG.migrate` in `js/rig.js` accepts exactly the current wire
version; a key change bumps `V`, old links break.

## Rules that keep it alive

Each was bought with a measured failure (stories: [docs/engineering-notes.md](docs/engineering-notes.md)).

- **VOF positivity is a donor-side flux cap, never an `f` clamp** — clamping
  invents water; both face neighbours compute the identical flux
  ("Conservation" before touching `vof`).
- **Gravity and `∇p` stay additive in the vel pass** — anything interposed
  breaks hydrostatic equilibrium.
- **The free surface is stress-free and the bed carries the resistance.** Do
  not bleed `u` over the water, extrapolate `w`, feather the inflow plug or let
  the extension into the reservoir sponge; the mixing length acts on the
  vorticity in conservative form. `smoke.mjs --only=profile` is the gate.
- **Geometry contracts:** butt-ended wall segments; slabs leaving the domain are
  extrapolated, not clamped; a scene's bed stays above `z = 0`; ground is solid
  all the way down; the closed outer ring is stamped last.
- **Controls:** a subcritical reach needs a real downstream control; a tailwater
  stands `≥ 1.3 d_c` (rechecked when `q` changes) and, holding a jump, near its
  conjugate; outfall edges (`open` = 2) are for brinks, never ponds; an open
  edge no level control owns passes outflow only.
- **The panel toggles are self-configuring** — the sandbox must reproduce any
  scene by hand (the acceptance test for control changes). An exercise may
  narrow the interface (`UIMODE`), never lock it: `⋯` puts everything back.
- **A field is described once:** a row of `FIELDS`; legend, Controls select, `G`
  key and `Shaders.RAMPS` read it. Colour ranges are **held**, never tracked.
- **Zero dependencies, classic scripts** — no modules, bundlers, `fetch` or YAML
  front matter in `index.html`, `js/*`, `css/*`: **the app boots with no
  server**. More than one file is fine; only those three are not (essay in the
  engineering notes). A page with `math` fences ends with a `<script>` loading `docs/math.js`.

## Testing

Gates exit non-zero on failure; the manual (suites, CI, ANGLE, `$CHROME`, mutation gate) is [docs/testing.md](docs/testing.md).

| Command | Guards | Cost |
| --- | --- | --- |
| `python3 exercises/_runner/check_pack.py` | the exercise pack agrees with itself | instant |
| `python3 test/check_notation.py`, `python3 test/check_headers.py js/*.js` | one notation (retired names, gauge and wire keys); each header's `Defines:` / `Reads:` match the code | instant |
| `python3 test/check_docs.py` | paths and `--only` suites these docs name exist; no assertion counts | instant |
| `node test/recon-test.mjs`, `node test/geom-test.mjs` | `RECON`'s and `GEOM`'s closed-form answers, no browser | instant |
| `node test/mutation-test.mjs` | that those two suites can fail: known bugs patched in one at a time | seconds |
| `node test/smoke.mjs --check-catalogue` | the shader/sim mutant catalogue still matches the code, no browser | instant |
| `node test/smoke.mjs` | the app boots and its contracts are WIRED | ~9 min |
| `node test/ui-smoke.mjs` | layout agreements, the docked panel, the UI profile | ~10 min |

`smoke.mjs --only=<suite,...>` takes `api`, `geom`, `rig`, `physics`, `profile`,
`scenes`, `hydro`, `docs`, `pack`, `avg`: `api,rig` is the fast subset,
`pack,scenes` boots every card and scene. Run the instant gates before printing
worksheets, `smoke.mjs` before pushing anything that touches `js/`,
`mutation-test.mjs` after touching `js/reconstruct.js` or `js/geom.js`,
`ui-smoke.mjs` after touching strip, panel, legend, dock or boot wiring. Browser
gates need a real GPU, so CI runs only the instant ones; run GPU gates one at a time.

Headless driving: the render loop stops on a hidden page, so use `APP.frames(n)`,
`APP.tick(n)`, `APP.probe(x,z)` (`phead` is pressure head only). `APP.volume()`
reads a **cached** column reduction (0 after a rebuild until `SIM.columns(true)`);
`APP.pickExercise()` lands its rig a microtask later: `await APP.EX.ready` first.

## Gotchas worth knowing on day one

- **Exercises:** every one belongs to a course; ids are unique across courses
  and `?ex=` reaches any card. A card whose task has a student draw must say
  `ui: { build: true }` or name a build tool. The README brief is defined in the
  header of `js/exercises.js`; the recipe is [docs/making-exercises.md](docs/making-exercises.md).
- **Tablets are a first-class target** (a lecturer runs exercises on an iPad):
  the neutral tool is **Read** (`state.tool === null`), a finger's press is held
  ~90 ms so a pinch never places anything. See *Reading the water by touch* in
  [docs/making-exercises.md](docs/making-exercises.md).
- A dev browser may serve stale JS from `http.server`; force with
  `fetch(url, {cache:"reload"})` then `location.reload()`. Resolution changes
  Δx, not the physics: the domain is a fixed rectangle.
- A scene's `params` (six Geometry rows, bound by index) reach `solids()`,
  `walls()`, `valves()`, `water()`; an optional `flow()` seeds the velocity
  (lore: "Hydropower scheme" in the engineering notes).
- `state.rt` is the speed truth — m2 at ~0.8–0.9× real time is the design point.
  Steady sloping surfaces sit in one-cell terraces, so the energy line is built
  on the HGL ("Steady surfaces terrace"). Vertical exaggeration is fitted to the
  window (`autoVex`); `0` resets to the fit. The Control volume, the Froude view
  and wave damping have non-obvious failure modes: read their notes first.
- **Average** (VIEW → A) is a measurement mode, not a blur: the picture and every
  instrument reading come from ONE window, restarted on each condition of
  [docs/averaging.md](docs/averaging.md) §9, including the boundary-open switches.
  `setAverage` is its single writer.
