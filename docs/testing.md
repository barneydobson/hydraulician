# Testing

The manual behind the gate table in [AGENTS.md](../AGENTS.md): what each gate
guards, which run in CI and which cannot, how the browser gates pick a
browser, and why there is a mutation gate. Commands are written `python3`; on
Windows use `py -3`. Every gate is zero-dependency and exits non-zero on
failure.

## The gates

| Command | Guards | Cost |
| --- | --- | --- |
| `python3 exercises/_runner/check_pack.py` | the exercise pack agrees with itself: folders, ids, countdowns, digit ladders, UI profiles | instant |
| `python3 test/check_notation.py` | one notation everywhere: retired field names, gauge keys, wire keys, the y-family in briefs | instant |
| `python3 test/check_headers.py js/*.js` | every `js/*.js` header's `Defines:` / `Reads:` lists match the code | instant |
| `python3 test/check_docs.py` | the prose that names files and commands is true: every backticked path exists, every `smoke.mjs --only=` names a real suite, no assertion counts in AGENTS.md | instant |
| `node test/recon-test.mjs` | `RECON`'s closed-form answers (running mean, Welford, compaction, connected bodies, band level sets, inlet depth, column energy), no browser | instant |
| `node test/geom-test.mjs` | `GEOM`'s closed forms (winding, slab corners, arc lengths, the hydrostatic force), no browser | instant |
| `node test/mutation-test.mjs` | that `recon-test.mjs` and `geom-test.mjs` can actually FAIL: known bugs patched into `RECON` and `GEOM` one at a time, each required to kill the assertion it targets | seconds |
| `node test/smoke.mjs --check-catalogue` | the shader/sim mutant catalogue is sound: every entry still matches the file it patches and names a real assertion (no browser) | instant |
| `node test/smoke.mjs` | the app boots and its contracts are WIRED, in a real browser: the suites below | ~9 min |
| `node test/ui-smoke.mjs` | the interface keeps its layout agreements: boots (start screen, `?scene=`, `?ex=`, `file://`), the strip, the narrow-window overlay, the fitted view, the docked panel, an exercise's UI profile, an emulated tablet | ~10 min |

Assertion counts are deliberately not written down anywhere in the prose: they
drifted within a week every time, and `check_docs.py` fails an AGENTS.md that
carries one. The suites print their own totals.

### The suites of `smoke.mjs`

`node test/smoke.mjs --only=<suite,...>` runs a subset, in declaration order.
The suites are:

| Suite | What it asserts |
| --- | --- |
| `api` | probe / analyse / findJumps / boxForce / gauge records carry the notation's field names, and not the retired ones |
| `geom` | polygon rasterisation, face-force wiring and its closed forms, solid renumbering |
| `rig` | the wire format round-trips at the current version and an older one is refused |
| `physics` | volume is conserved, hydrostatic water stays put, no NaN reaches the field, a jump reads its conjugates, face forces bracket their closed forms |
| `profile` | uniform open-channel flow (sa1, Medium) has a channel's velocity profile: the maximum at the surface, the 0.6-depth and 0.2/0.8 rules, a log law with a von Karman constant in range, and the bed delivering the `n` |
| `scenes` | every scene boots and steps |
| `hydro` | the parametric hydropower scheme: params move the mask, the seeded start runs, the slam is a rigid-column surge |
| `docs` | the docs reader renders `docs/*.md` rather than handing over its source (about 3 s) |
| `pack` | every exercise applies its rig and lands on its scene |
| `avg` | the averaging engine on the GPU ([averaging.md](averaging.md)): transport residual against its bound, every reset condition, the Favre display field, mean columns, the overlay, the display pass and the legend's Fit (about 4 min) |

Subsets worth knowing:

- `--only=api,rig` is the fast subset (a couple of minutes).
- `--only=pack,scenes` boots every card and every scene.
- `--only=profile` (about a minute) is the gate for anything that touches the
  stress-free surface or the mixing length; its mutants are `surface-sink` and
  `no-mixing-length`, which put each half of issue #72 back.
- `--only=avg` after touching the averaging accumulators, the Favre field or a
  reset condition.
- `--keep` leaves the browser open on failure.

When to run what: `check_pack.py` and `check_notation.py` before printing
worksheets; `check_docs.py` after editing AGENTS.md or any doc that names a
file; the full `smoke.mjs` before pushing anything that touches `js/`;
`mutation-test.mjs` after touching `js/reconstruct.js`, `js/geom.js` or their
suites; `ui-smoke.mjs` after touching `index.html`, `css/app.css`,
`js/pickers.js`, the `TOOLBAR` spec, `FIELDS`, `LEGEND`, `UIMODE`, `DOCK`,
`START`, `setAverage`, `EMBED` or the boot wiring. Every case in `ui-smoke.mjs`
is a bug that reached the working tree while the strip was being built, so a
failure there is a real regression, not a tightened expectation. Its
invariant: the side panel is DOCKED, so `--dock` and `canvas.clientWidth` must
agree, or the simulation is being drawn underneath the panel.

## What runs in CI, and why not the rest

`.github/workflows/checks.yml` runs on every push to `main` and every pull
request. Its `instant` job runs the instant gates: `check_pack.py`,
`check_notation.py`, `check_headers.py`, `check_docs.py`, `recon-test.mjs`,
`geom-test.mjs`, `mutation-test.mjs` and `smoke.mjs --check-catalogue`. Its
`no-gpu` job runs the browser checks that need no GPU and no physics budget
(`smoke.mjs --only=docs`, `ui-smoke.mjs --only=file://`) under `SOFTWARE=1`;
it is unproven on hosted runners and `continue-on-error` until it has run
green there. `.github/workflows/pages.yml` deploys the Pages build only after
Checks has succeeded on `main`.

The full `smoke.mjs` and `ui-smoke.mjs` are not in the workflow at all, not
even as a manual `workflow_dispatch` job. Both need a real GPU-backed Chrome:
the software rasteriser is too slow to settle a scene inside `smoke.mjs`'s
physics budget, and standard GitHub-hosted runners have no GPU passthrough,
so ubuntu-latest's `gl` backend would very likely fall back to the same class
of software rasteriser and fail the same way. Run both locally, where a real
GPU is available, and one at a time: two GPU gates at once wreck each other's
benchmarks.

## Browser, ANGLE and environment

`test/cdp.mjs` is the portable headless-Chrome client both browser gates use
(Node 22+ for the global `WebSocket` and `fetch`); `smoke.mjs` loads it with a
dynamic `import()`. `exercises/_runner/runner.py` does the same job over CDP
for the exercise pack and is Linux-bound (macOS shims are in
`exercises/_runner/HOWTO.md`).

| Variable | Effect |
| --- | --- |
| `$CHROME` | the browser binary (else the platform's usual Chrome / Chromium / Edge path) |
| `$CHROME_PATH` | deprecated alias of `$CHROME`, still honoured |
| `$ANGLE` | overrides the ANGLE backend |
| `$SOFTWARE=1` | `--disable-gpu`, the old software behaviour, for a machine with no working GPU backend |

The launcher passes a GPU-backed `--use-angle` itself, chosen by platform
(`angleArgs()` in `test/cdp.mjs`): `d3d11` on Windows, `metal` on macOS and
`gl` on Linux. Software rendering draws a full-window WebGL canvas so slowly
that a spin-up scene times the run out: measured on scene m1 at Low, 828x64,
ANGLE reaches sim t = 30 s in 6.5 s of wall clock while SwiftShader reaches
only t of about 9.5 s in a 150 s budget, roughly 50 times slower. Linux gets
`gl`, not `vulkan`, because ANGLE's Vulkan backend needs a working Vulkan ICD
that a generic Linux box and most CI runners lack, whereas the GL backend
talks to Mesa; a maintainer who has confirmed Vulkan drivers can opt in with
`$ANGLE=vulkan`.

## Why there is a mutation gate

Eleven assertions written during the averaging work passed while asserting
nothing: a constant fed where a varying value was needed, a cell marked solid
with no water in it, a `Number.isFinite` check that survived a deliberately
broken variance, a bed compared against the very buffer it was copied from.
Every one was caught by breaking the code and watching the suite stay green;
none by reading it. `test/mutation-test.mjs` runs that practice on every
commit for the pure numerics (`RECON` against `recon-test.mjs`, `GEOM` against
`geom-test.mjs`). Each suite is first run unmutated, because a suite that is
already red would "kill" every mutant for free, and a mutant must kill the
assertion it names, not merely turn the suite red.

For the shader and sim code it cannot reach, `smoke.mjs --mutate=<id>` patches
one known bug into a served file in flight (never touching the working tree)
and runs the suite that owns it, so the same control can be run by hand:

```
node test/smoke.mjs --only=avg --mutate=favre-reynolds
```

It exits 0 only if an assertion named by the mutant's `kills` text failed. A
green run is MUTANT SURVIVED and a run red only elsewhere is MUTANT KILLED THE
WRONG ASSERTION; both exit 1, and `--only` must include the mutant's suite.
This is not a gate (each run costs a full boot, about 4 min for `avg`), which
is why `--check-catalogue` exists: it checks, with no browser, that every
catalogue entry still matches the file it patches exactly once and names an
assertion that exists, so the catalogue cannot go stale unnoticed. Each
catalogue entry carries what was measured when the control was performed.

## How the checkers read the repository

- `check_pack.py` runs `js/exercises.js` (the empty register), `js/courses.js`
  and every course's `course.js` / `exercises.js` in `node`, as script tags
  would (one shared global scope), and gets `EXERCISES` back as JSON, so a
  nested `ui` profile parses instead of being truncated at the first `}`.
- `check_notation.py` walks `git ls-files`, so an untracked scratch file
  cannot fail a commit gate. Under CI (`CI` set) a failing `git ls-files` is
  an error rather than a quiet fall back to a filesystem walk that would scan
  the wrong file set.
- `check_headers.py` is lexical: a name counts as used wherever it appears
  outside comments, strings and regex literals and not as a property or key,
  so a local variable that shares a global's name is simply listed.
- `check_docs.py` treats a backticked token as a path when it has no spaces
  and either contains a `/` or ends in a file extension the repo uses; it
  skips globs, placeholders (`<id>`), URLs and anything under an
  underscore-led folder (`_archive/` is unpublished or untracked), and reads
  the suite names from the `SUITES.<name> =` lines of `test/smoke.mjs`.
- None of them is a new dependency: Node is already required by the browser
  gates, and the checkers use the standard library only.

The checkers are complements: `check_notation.py` greps for *names*,
`smoke.mjs` proves the names are *connected*. A field renamed at the write
site but not the read site greps clean and returns `undefined` at runtime.

## Driving the app yourself

The render loop stops when the page is hidden, so headless work goes through
`APP.frames(n)`, `APP.tick(n)`, `APP.probe(x,z)` (returns `u, w, p, phead, f,
speed`; `phead` is pressure head only), `APP.volume()`, `APP.zoomAt(...)` and
`APP.boxForce` / `APP.placeCV`. `exercises/_runner/runner.py` wraps that over
CDP; `smoke.mjs` and `ui-smoke.mjs` carry the portable client. The measuring
recipe for a card is in [making-exercises.md](making-exercises.md) §7, and the
acceptance evidence for `runner.py` is `exercises/_runner/bench.md`.

Two sharp edges that have cost time, both commented in `smoke.mjs`:

- `APP.volume()` reads the **cached** column reduction, so straight after a
  rebuild or `resetWater()` it returns 0 until `SIM.columns(true)` forces the
  readback.
- `APP.pickExercise()` lands its rig a microtask later, so `await APP.EX.ready`
  before reading what it applied.

A dev browser may serve stale JS from `http.server`; force a reload with
`fetch(url, {cache:"reload"})` then `location.reload()`.
