# Code-review remediation Implementation Plan

> EXECUTED (archived 2026-10-18). Checkboxes were not maintained; the git history is the record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding of the 2026-10-17 critical review — the confirmed bugs, the interface and duplication problems in `js/`, the weak and unchecked tests, and the documentation drift — without changing anything a student, a worksheet or a shared link can observe except where the finding is itself a bug.

**Architecture:** Tests are tightened FIRST (waves 1), so the refactors that follow (waves 3–4) run under gates that can actually fail. Bugs are fixed in wave 2, each with its own regression check. Large files are split by responsibility into further classic scripts (the zero-deps rule permits this; it forbids only fetch, ES modules and a build step). Docs come last, once the code they describe has stopped moving.

**Tech Stack:** WebGL2 + GLSL ES 3.00, classic browser scripts, Node 22 (`.mjs` test suites, CDP over the global `WebSocket`), Python 3 stdlib checkers. No dependencies, now or after.

**Spec:** Issue mvreeuwijk/hydraulician#1 — the review delivered in the session of 2026-10-17. It was not saved separately: every finding is restated inside the task that fixes it, with its location. **Line numbers are as of commit `f8a34d7` and will drift as tasks land — locate each by the quoted text, not the number.**

## Global Constraints

- Zero dependencies. No `fetch` in the app, no `type="module"`, no `import`, no build step, no YAML front matter in `index.html`, `js/*`, `css/*`. New code is new `<script src>` / `<link>` files.
- `index.html` stays under 200 lines. It is 192 now; Task 4.4 frees space before Task 3.4 adds script tags.
- Rig wire format stays v2, byte-for-byte: no key renamed, removed or redefined. `node exercises/_runner/smoke.js --only=rig` must stay green and every payload in `js/exercises-rigs.js` must still apply.
- Worksheet-facing identifiers do not change: tool digit order (`TOOLS`), single-letter keys, Controls row ids (`spoutVy`, `instReadouts`, `gaugeField`, …), field `mode` integers, field ids, gauge quantity ids, scene ids, exercise ids.
- Notation: `z` vertical, `w` vertical velocity, `d` depth in all new identifiers (`docs/notation.md`). GLSL swizzles and screen pixel coordinates excepted.
- The physics must not move. `smoke.js --only=profile` (7 assertions) and `--only=avg` stay green after every task that touches `js/shaders.js` or `js/sim.js`.
- GPU gates (`smoke.js`, `ui-smoke.mjs`) run ONE AT A TIME on this machine, never two agents at once — parallel runs wreck the timing budgets.
- On this Windows machine the Python gates are `py -3 exercises/_runner/check_pack.py` (docs say `python3`; both forms must keep working).
- `main` keeps receiving commits while this runs. Before each task the orchestrator rebases `review-remediation` onto the local `main` (`git rebase main` in the worktree) and re-runs the instant gates; a task whose findings a new commit has already fixed or moved is re-checked against the new code before dispatch. Commit messages reference `#1`.
- Work on branch `review-remediation`, never on `main`. One commit per task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Double-click `index.html` (file://) after new script files are added** — the app must still boot with no server. Task 3.4 adds a ui-smoke assertion: a `file://` boot reports no uncaught errors and `APP.ui.FIELDS.length === 9`.
2. **Shared `#rig=` links and every packaged rig still load identically** after the sim refactor. Task 3.1 adds a smoke assertion: every `EXERCISE_RIGS` payload applies and `RIG.snapshot()` of it round-trips equal to the payload (keys and values to 1 µm).
3. **"Press 5" still means Gauge, and every documented key still does what the sheet says**, after KEYMAP replaces three hand lists (Task 2.3). The test asserts digit 5 arms `gauge`, every KEYMAP row has a handler, and every TOOLBAR `key` appears in KEYMAP.
4. **Average-mode numbers do not move** when the Favre unpack and face loops are de-duplicated (Task 3.1). The test: `boxFlux`, `boxForce`, `lineFlux`, `probeMany` and `rake` on a fixed h23 state, live and averaged, before and after, equal to 1e-6 relative — captured as a golden in the task's first step.
5. **Typing anywhere** — rig box, legend range numbers, start filter, a card slider's number — never fires a shortcut, and Ctrl/Cmd chords never do (Task 2.1).

---

## Execution map

| Wave | Tasks | Parallel? | Agent model |
| --- | --- | --- | --- |
| 0 | 0.1 | — | haiku |
| 1 tests | 1.1, 1.2, 1.3, 1.4 | 1.2 and 1.3 in parallel with anything (no GPU); 1.1 and 1.4 one at a time (GPU) | sonnet |
| 2 bugs | 2.1 – 2.6 | sequential (all touch `js/main.js` or its neighbours) | sonnet |
| 3 core refactor | 3.1 – 3.5 | sequential | sonnet |
| 4 UI cleanliness | 4.1 – 4.5 | sequential | sonnet; 4.4 haiku |
| 5 docs | 5.1 – 5.6 | all six in parallel (disjoint files, no GPU) | haiku; 5.1 sonnet |
| 6 tests home + CI | 6.1, 6.2 | sequential | sonnet |
| 7 | 7.1 final gates + whole-branch review | — | sonnet reviewer, then the session model |

Each task gets a fresh implementer and a fresh spec reviewer (sonnet) before the next starts.

---

## Wave 0

### Task 0.1: Branch and baseline

**Files:** none modified.

- [ ] **Step 1:** (Done by the orchestrator.) Worktree `.claude/worktrees/review-remediation` on branch `review-remediation` from `main` at `f8a34d7`. Every task runs inside that worktree; the main checkout is never edited.
- [ ] **Step 2:** Run the instant gates and record the output in the task report: `py -3 exercises/_runner/check_pack.py`, `py -3 exercises/_runner/check_notation.py`, `node test/recon-test.mjs`, `node test/geom-test.mjs`, `node test/mutation-test.mjs`. Expected: all exit 0 (52 exercises / 68 passed / 25 passed).
- [ ] **Step 3:** Run `node exercises/_runner/smoke.js` then `node test/ui-smoke.mjs` (one after the other). Record pass/fail per suite. A gate already red here is noted as pre-existing, not fixed in this task.
- [ ] **Step 4:** List `.claude/worktrees/*` with `git worktree list` and `git -C <path> status --short` for each. Report them; do NOT remove any (Task 5.6 decides).

---

## Wave 1 — make the gates able to fail

### Task 1.1: smoke.js — mutants must kill their target; page errors fail; suites mean what they say

**Files:**
- Modify: `exercises/_runner/smoke.js`
- Modify: `test/cdp.mjs`

**Interfaces:**
- Produces: `MUTANTS[k] = { id, suite, file, find, replace, kills, measured }` — `suite` is a SUITES key, `kills` a string (prefix of an `ok()` name).
- Produces: `test/cdp.mjs` exports `launch({ chrome?, angle?, headless?, args? })`, `send(method, params, { timeout })`, `evaluate(expr, { timeout })`. smoke.js uses it via `await import("../../test/cdp.mjs")` inside its async `main`.
- Produces: `APP.ui.GAUGE_QTY` (added to `window.APP.ui` in `js/main.js`) for tests to read the live register.

Findings fixed here:
- 8 of 24 `kills` strings match no `ok()` name: `"avg Favre mean, not Reynolds"`, `"avg collocation"`, `"avg sigma_eta"`, `"avg and does it once, not on every frame after"`, `"RECON vs FS_COL bed/depth"`, `"rig flux sections round-trip"`, `"rig cvShow round-trips"`, `"rig gauges round-trip"`. `main` exits 1 on any failure and never compares with `MUTANT.kills`.
- `--mutate=X --only=<wrong suite>` runs green against a live mutant.
- `pageErrors` are collected but only reported on boot failure.
- `SUITES.api` (≈615 lines) contains physics and geometry cases (h23 jump, polygon rasterisation, s3 gate force, hump crest, m1 bed, hammer, renumbering) — so `--only=api,rig` is not the fast subset.
- Hard-coded gauge lists `["h","d","speed"]` (two places near the RIG refused-load case); "a refused load leaves the live field alone" only checks the field is *some* valid key.
- Redundant/vacuous asserts: `qDn < 1.4 * qUp` (implied by the <1% spread assert before it); `volume() finite` + one-sided `vol <= volBefore + 0.01` (pass at 0); finiteness-only asserts in avg near "proves nothing"; the assert pinning "a raw solidId is not a stable identity".
- Stale comments: `__low()` "runs on SwiftShader in CI"; "smoke.js runs Chrome with --disable-gpu"; "software GL boots slowly"; header suite list omits `docs`, `avg`, `--mutate`; "js/main.js, ~line 3161".
- Second CDP client: own Chrome discovery, `$CHROME_PATH` (vs `$CHROME`), port `8731 + pid%200` (collides), no send timeout, leaks `hydro-smoke-<pid>` profile.
- cdp.mjs times out `send` at 60 s while ui-smoke spins up to 120 s in-page.

- [ ] **Step 1: Write the failing checks.** Add `checkCatalogue()` run at startup: for every mutant, `SUITES[m.suite]` exists and the source of that suite function contains `ok("` + `m.kills` (string search on `SUITES[m.suite].toString()`). Exit 2 with the list of offenders.
- [ ] **Step 2:** `node exercises/_runner/smoke.js --only=docs`. Expected: exit 2 naming the 8 stale `kills` and every mutant (no `suite` field yet).
- [ ] **Step 3: Implement.**
  - Add `suite` to every catalogue entry; fix the 8 `kills` to the real `ok()` name prefixes. Under `--mutate`, default `--only` to the mutant's suite and refuse (exit 2) an `--only` that excludes it.
  - Under `--mutate`, exit 0 only when at least one failure name starts with `kills`; print `MUTANT SURVIVED` (exit 1) if green, `MUTANT KILLED THE WRONG ASSERTION` (exit 1) if red elsewhere only.
  - After every suite, `ok("<suite> no uncaught page errors", pageErrors.length === 0, pageErrors.join("\n"))`, then clear.
  - Split `SUITES.api`: keep naming/wiring cases in `api`; move h23 jump, m1 bed, hammer valve/wall, hump crest into `physics`; polygon rasterisation, s3 gate force, solid renumbering into a new `geom` suite. Update the `--only` help and the AGENTS.md row is done in Task 5.1.
  - Read gauge ids from `APP.ui.GAUGE_QTY.map(q => q.id)`; the refused-load assert compares with the value read before the load.
  - Delete the `qDn < 1.4*qUp` assert; change the volume asserts to `vol > 0 && vol <= volBefore + 0.01`; delete the two finiteness-only avg asserts; delete the solidId-instability assert.
  - Replace smoke.js's own Chrome/CDP code with `test/cdp.mjs`. cdp.mjs: honour `$CHROME` first, then `$CHROME_PATH` (deprecated alias, documented), port 0 read from stderr, remove the profile dir on close, `send(..., { timeout })` default 60 s and overridable. Keep smoke.js's static server and mutant-patching server — they are smoke's job, not the client's.
  - Fix the stale comments listed above; header lists every suite and `--mutate`.
- [ ] **Step 4:** Run `node exercises/_runner/smoke.js --only=docs` → exit 0. Then `--only=api,rig` → green and under ~3 min. Then for three mutants, one per suite (`favre-reynolds`, `rig-no-flux`, `surface-sink`): `node exercises/_runner/smoke.js --mutate=<id>` → exit 0 with "killed <kills>". Then `node exercises/_runner/smoke.js` (full) → green.
- [ ] **Step 5:** Commit `test(smoke): mutants must kill their named assertion; page errors fail; shared CDP client`.

### Task 1.2: check_pack.py and check_notation.py — parse, never copy; validate what reaches students

**Files:**
- Modify: `exercises/_runner/check_pack.py`, `exercises/_runner/check_notation.py`
- Modify: `js/exercises.js` (add the machine-readable key list only)
- Modify: `js/main.js` (export `HIDE_IDS` on `UIMODE` only)

**Interfaces:**
- Produces: `const CARD_KEYS = [...]` at the end of `js/exercises.js` — every top-level card key the schema allows (`id title aim topic folder scene rig rigParams viewParams studentParams digit rigTable instruments digitNote setup start task steps background note settle rigWhy secondScene ui gauges tabs`), plus `CARD_KEYS_STAMPED = ["course","home"]`.
- Produces: `UIMODE.HIDE_IDS = ["energy", "critical"]` in `js/main.js`; check_pack parses it instead of its own `HIDE_IDS`.

Findings fixed: check_pack never validates `scene` against SCENES, `rig` against EXERCISE_RIGS, `secondScene.scene`, the keys of `rigParams`/`viewParams`/`studentParams[].control` against the Controls ids it already parses, non-geom `digit.control`, nor rejects unknown card keys; `TOOL_IDS`/`FIELD_IDS`/`BUILD_TOOLS` and `HIDE_IDS` are hand copies; `view_button_ids()` matches every `…Btn` id (so `ui.view: ["playBtn"]` passes) and is unioned with itself; main.js read four times; docstring numbers checks 1–7, 9, 10, 8, 11 and check 0 is undocumented; ~420-line `main()`. check_notation hard-codes `LIVE_FIELDS = {h,H,d,eta,speed}` (a legal `gaugeField: "u"` would fail); its git fallback silently scans the wrong set in CI; it has no zero-deps rule; it misses `[x0,y0,x1,y1` in README; its rig-version regex needs the exact trailing comment.

- [ ] **Step 1: Failing fixtures.** Create `exercises/_runner/fixtures/bad-cards.js` (a course file calling `COURSES.exercises("zz-test", [...])`) with one card each: unknown scene `"nope"`, unknown rig key, `rigParams: { inflowQ: 1 }` (not a control id), `instrument: []` (unknown key), `ui: { view: ["playBtn"] }`, `viewParams: { gaugeField: "u" }` (legal — must pass). Add `--extra <file>` to check_pack that loads one extra course file after the real ones.
- [ ] **Step 2:** `py -3 exercises/_runner/check_pack.py --extra exercises/_runner/fixtures/bad-cards.js`. Expected now: exit 0 (nothing caught). Record.
- [ ] **Step 3: Implement.** Parse `TOOLS`, `FIELDS` ids, `GAUGE_QTY` ids, the VIEW family's button ids (from the `TOOLBAR` group with `family: "view"` only), `UIMODE.HIDE_IDS` and `CARD_KEYS` by evaluating the scripts in node (the existing JSON-dump approach) — read main.js once. Add the five validations above; unknown keys fail. Renumber the docstring checks 0–N in code order, one line each; split `main()` into one function per check. check_notation: read gauge ids from `GAUGE_QTY`; when `CI` is set and `git ls-files` fails, exit 1; add rule "zero-deps": in `index.html`, `js/*.js`, `css/*.css` fail on `fetch(`, `type="module"`, a line starting `import `, a first line `---`; every tracked `.md` containing a ```` ```math ```` fence must end with a `<script` tag loading `docs/math.js`; add `[x0,y0` / `[x0, y0` to the y-family rule for `README.md` and `docs/*.md`; match the rig version with `const V = (\d+);` anywhere in `js/rig.js`.
- [ ] **Step 4:** Fixture run → exit 1 naming exactly the five bad cards (the `gaugeField: "u"` card passes). Real run `py -3 exercises/_runner/check_pack.py` and `py -3 exercises/_runner/check_notation.py` → exit 0 (fix any real card the new checks catch, citing it in the report; README `[x0,y0` is fixed in Task 5.2, so add it to a temporary allowlist with a `TODO(5.2)` and remove it there).
- [ ] **Step 5:** Commit `test(checkers): validate scene/rig/control keys, reject unknown card keys, parse registers, zero-deps rule`.

### Task 1.3: recon-test, geom-test, mutation-test — remove what cannot fail, cover what is unguarded

**Files:** Modify `test/recon-test.mjs`, `test/geom-test.mjs`, `test/mutation-test.mjs`.

Findings fixed: recon-test B asserts on `raw` built only from the fixture; C4 `eta95 > eta05` is implied by C3; C8 first clause duplicates the earlier d2d assert and its second follows from the first; C6's `!near(mean, median)` is a fixture fact; G1 "naive float32 sigma is worse" tests `Math.fround`; `R.bed` is never asserted beyond its length. mutation-test: no baseline run; `kills` matched against all stdout/stderr instead of `FAIL <name>` lines; target `"C8"` matches every C8. geom-test: no `GEOM_SRC` hook (cannot be mutation-tested); `poly()` untested; `faceForceFromSamples` partial fill (`fc = min(f,1)`) and `wetLen` untested; G6 passes any over-sampler; G3 only positive containment; "G1" label collides with recon-test.

- [ ] **Step 1: Write the new assertions.** recon-test: `"E bed is the first wet row of the lowest body"` — `R.bed[i] === b[0].j0 * dx` for a 3-column fixture with beds at rows 2, 5, 0. geom-test (relabel groups `GA…`): `poly` fills a missing label from id; `faceForceFromSamples` on 4 samples with `f = [1,1,0.5,0]`, `p = 9.81·depth` gives `wetLen = 2.5·ds` and `Fx` equal to the closed form with the half-weighted third sample; G6 asserts the sample count is exactly `max(2, ceil(L/ds))` per edge; G3 adds `contains(slab, x, z) === false` 1 mm outside each long side.
- [ ] **Step 2:** Run both suites. Expected: the new geom asserts pass (they pin current behaviour); the recon `bed` assert passes.
- [ ] **Step 3: Implement.** Delete the five vacuous recon asserts (B-raw, C4, C8's duplicate clauses, C6's fixture clause, G1-fround) — fold any explanatory comment into the surviving neighbour. geom-test: load from `process.env.GEOM_SRC || "js/geom.js"`. mutation-test: run the suite once unmutated first and abort if red; match `kills` only against lines starting `FAIL `; give C8's mutant the full assertion name; add a `geom` catalogue (3 mutants: `edgeNormal` sign flip → GA2; `fc = s.f` (no min) → the new partial-fill assert; `nk = Math.ceil(L/ds)` (drop the max 2) → G6) and run both catalogues; add a `bed-offset` RECON mutant (`b[0].j0 + 1`) killing the new bed assert.
- [ ] **Step 4:** `node test/recon-test.mjs`, `node test/geom-test.mjs`, `node test/mutation-test.mjs` → all exit 0; mutation-test reports every mutant killed by its named assertion.
- [ ] **Step 5:** Commit `test(unit): drop assertions that cannot fail; cover bed, partial fill, poly; mutation-test geom`.

### Task 1.4: ui-smoke.mjs — tests that fail when the feature is gone; one failure no longer ends the run

**Files:** Modify `test/ui-smoke.mjs`; move the two pack-content checks to `exercises/_runner/check_pack.py`.

Findings fixed: hidden-tool digits case presses `1` and asserts nothing changed (passes if digits do nothing); "touch parity" asserts `digits <= 9` (passes at 0); paused-particles passes if particles never move or `particlePos()` is `[]`; start-screen count compares a source with itself; the vex case passes vacuously when no scene pins `vex`; one try/finally around all of `main()` so any throw ends the run (and `L[0].ema.Q` throws on a null `ema`); `/\ss+/g` inside a template literal at the legend-characters budget (must be `\\s+`); `eq(name, got, want, detail)` drops `detail`; `"\n" + e.stack || e`; dead `const had = true, … s2 = null`; `shut` names `isOpen()`; QS-2 README regex and HJ-1 digit constants (6.75/0.25/3.75) are pack checks; `{ ready: "…#dock.open" }` repeated 7×; "no uncaught errors" copy-pasted per case; header says "boots eight tabs"; `DOCK_W` "must match #dock in index.html"; `9.81 * force.mass` hard-codes g.

- [ ] **Step 1: Write the positive checks.** `"digit 5 arms the Gauge tool"`: from `wall`, press `5` → `state.tool === "gauge"`. `"a hidden tool's digit toasts and does not arm"`: under a profile hiding gauge, press `5` → tool unchanged AND toast title contains "Gauge". `"particles move when running"` before the paused case, with `n > 0`. `"start screen lists > 0 exercises"`. The vex case picks a scene that declares `view.vex` from `APP.SCENES.list` and fails if none does.
- [ ] **Step 2:** Run `node test/ui-smoke.mjs`. Expected: new checks pass on the current app (they pin existing behaviour).
- [ ] **Step 3: Implement.** Wrap each case in `runCase(name, fn)` that catches, records `FAIL <name>: <message>` and continues, then runs the shared "no uncaught errors" check; replace the 7 duplicated ready options with a `DOCK_READY` constant; fix the regex, `eq` arity, `(e.stack || e)`, the dead vars, `shut` → `open`, `sim.p.g` for g; read `DOCK_W` from `getComputedStyle(document.documentElement).getPropertyValue("--dock-w")` once Task 4.3 adds the variable (until then from `#dock` computed width) and fix its comment; header says "4 launches, one tab per case"; move the QS-2 regex and HJ-1 digit constants into check_pack as `check_card_constants()`. Pass `{ timeout: 130000 }` to the in-page settle evaluate so the 120 s budget can report.
- [ ] **Step 4:** `node test/ui-smoke.mjs` → green; `py -3 exercises/_runner/check_pack.py` → green. Temporarily break digit handling (comment out the digit branch in `js/main.js` keydown) and confirm `"digit 5 arms the Gauge tool"` FAILS and later cases still run; restore.
- [ ] **Step 5:** Commit `test(ui-smoke): positive checks, per-case isolation, fixes`.

---

## Wave 2 — confirmed bugs

### Task 2.1: Keyboard — typing never fires shortcuts; one KEYMAP describes every key

**Files:** Create `js/keymap.js`. Modify `js/main.js` (keydown handler, `KEYS`, `TOOLBAR` `key:` fields), `index.html` (one script tag before `main.js`), `test/ui-smoke.mjs`.

**Interfaces:**
- Produces: `const KEYMAP = [{ key, label, what, when?, run }]` in `js/keymap.js`. `key` is the lowercased `KeyboardEvent.key` (`" "`, `"?"`, `"["`, …); digits are generated from `TOOLS` (`1`…`TOOL_KEYS`). `run(e)` receives the event. `when()` optional (S only while `scenesOffered()`).
- Produces: `KEYMAP.typing(e) → boolean` — true when `e.target` is INPUT, SELECT, TEXTAREA or `isContentEditable`, or any of `ctrlKey`/`metaKey`/`altKey` is held.

Findings fixed: handler skips only INPUT/SELECT (rig textarea fires C, R, space, digits); no Ctrl/Cmd guard (Ctrl+V toggles valves, Ctrl+C clears, Ctrl+A averages, Ctrl+F full screen); no `e.repeat` guard on toggles; N advertised by both New sandbox and Open-channel overlay; `KEYS.LINES` built at parse time (its `scenesOffered()` line frozen) and missing `+`/`=`/`-` and Esc-folds-dock; three hand-kept copies of the bindings.

- [ ] **Step 1: Failing ui-smoke cases.** `"typing in the rig box fires no shortcut"`: focus `.rigtx`, dispatch keydown `c` with a drawn segment present → `sim.segs.length` unchanged. `"Ctrl+V does not toggle the valves"`. `"held A does not flicker Average"`: two keydowns `a`, second with `repeat: true` → `state.avg === true`. `"every TOOLBAR key is in KEYMAP and no key is claimed twice"`. `"the keyboard sheet lists S only when scenes are offered"`.
- [ ] **Step 2:** Run ui-smoke → those five FAIL.
- [ ] **Step 3: Implement.** Move every binding of the keydown handler into `KEYMAP` rows, in the sheet's current order; the handler becomes: modal checks (start screen, open menus) unchanged, then `if (KEYMAP.typing(e)) return;`, then the matching row's `run`, ignoring `e.repeat` for every row except `[`, `]`, `+`, `-`. `KEYS.render()` builds its lines from `KEYMAP` at open time (filtering `when`). Remove `key: "N"` from `newBtn` (New sandbox gets no shortcut). `TOOLBAR` keeps its `key` strings for the hover card; the ui-smoke case cross-checks them. Delete `window.syncTools` (Task 3.3 also removes its other callers; here replace the main.js call sites with `syncToolbar()` and keep a `window.syncTools = syncToolbar` line ONLY if `grep -r syncTools courses/` finds rig scripts using it — those are worksheet files, so keep and comment it as their API).
- [ ] **Step 4:** ui-smoke green; manual check in the preview: type `crv` in the rig box, nothing happens.
- [ ] **Step 5:** Commit `fix(keys): never fire shortcuts while typing or on chords; KEYMAP drives handler and sheet`.

### Task 2.2: Geometry hook replaces the boot monkey-patch

**Files:** Modify `js/sim.js` (rasterise, exports), `js/main.js` (boot wrapper block), `exercises/_runner/smoke.js` (geom suite).

**Interfaces:**
- Produces: `SIM.onGeometry(fn)` — registers `fn(S)`, called at the end of every `rasterise()` (therefore also through `addSeg`, `undoSeg`, `clearSegs`, `setParam`, the boundary toggles) and at the end of `setValve` when it changes. Returns an unsubscribe function.

Finding fixed: `main.js` boot wraps `SIM.rasterise/addSeg/undoSeg/clearSegs` from outside to call `OVERLAY.resetEstimates(sim)` and clear `state.force`/`state.forceHover`; `setParam` calls the module-local `rasterise`, so Geometry sliders and rig `params` skip the reset (stale normal-depth estimate, stale Force selection).

- [ ] **Step 1: Failing smoke case** (geom suite): on `hydro`, select a face with `state.force = {...}` via the Force pick, then `SIM.setParam("gap", 0.5)` → `ok("geom setParam drops the Force selection", APP.state.force === null)`.
- [ ] **Step 2:** `node exercises/_runner/smoke.js --only=geom` → FAIL.
- [ ] **Step 3: Implement** the hook; delete the boot wrapper; boot registers one listener doing the same three things.
- [ ] **Step 4:** `--only=geom,api,rig` green.
- [ ] **Step 5:** Commit `fix(sim): SIM.onGeometry hook — every geometry edit resets overlay estimates and the Force pick`.

### Task 2.3: Panel help, gauges, rakes, overlay keys

**Files:** Modify `js/main.js`, `js/overlay.js`, `js/pickers.js`, `js/gauge-inspector.js`, `css/app.css`, `test/ui-smoke.mjs`.

**Interfaces:**
- Produces: `showToast(title, sub, { html?: boolean, sticky?: boolean })`. `html` sets `innerHTML` (trusted constant strings only); `sticky` keeps it up until clicked or replaced.
- Produces: `addGauge(x, z, field?) → gauge` — always adds (oldest dropped at the cap); `placeGauge(x, z)` keeps its click toggle and calls `addGauge`.
- Produces: `freeGaugeColour() → string` — first `CONFIG.gaugeColours` entry no live gauge uses.

Findings fixed:
- ⓘ help shows literal `<b>`, `<code>`, `&lt;` because `showToast` writes `textContent`; 100-word help auto-hides after 5.2 s. → info uses `{ html: true, sticky: true }`.
- Gauge colour `gaugeColours[length % 4]` collides after a shift or a removal (main.js placeGauge and rig.js apply). → `freeGaugeColour()` in both.
- `placeCardGauges` calls the toggling `placeGauge`, so two card gauges within 16 px delete each other and `field` lands on the wrong gauge. → `addGauge(x, z, g.field)`.
- `drawRake`: `0.5 * (buf[j*4] + (j+1 < ny ? buf[j*4] : 0)) || buf[j*4]` averages a cell with itself and halves the top row. → `buf[j * 4]` (rake values are already cell-centred per SIM.rake; no averaging intended).
- `drawChannel` and `drawGradeLines` draw their keys at the same position; two lines both captioned "H". → OVERLAY collects key rows per frame in `OVERLAY.keyRow(text, colour, dash)` and draws them once, stacked, at the end of `drawOverlay`; when `state.grade` is on, `drawChannel` skips its own energy line and key row (the grade lines' `h + hv` is the better estimate).
- Inspector raise: `zIndex = 22 + open.length` gives every clicked window the same value. → module counter `zTop++`.
- Inspector value row: 9 cells in 400 px with `flex: 1 1 0` and no wrap. → `flex-wrap: wrap; flex: 1 1 88px`.

- [ ] **Step 1: Failing ui-smoke cases:** `"info help renders markup"` (click the Scene row's ⓘ → `#toastSub` contains a `<b>` element, no literal `<b>` text); `"five gauges have four distinct colours"` (place 4, place a 5th → colours unique); `"card gauges never cancel"` (`EX.pick` a card with two `gauges` 1 cm apart → 2 gauges); `"inspector raise"` (open 2, click first → its zIndex > second's).
- [ ] **Step 2:** ui-smoke → those FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4:** ui-smoke green; `smoke.js --only=rig` green; in the preview turn on channel overlay and grade lines on m2: one key column, one "H".
- [ ] **Step 5:** Commit `fix(ui): readable help, distinct gauge colours, card gauges, rake mean, one overlay key`.

### Task 2.4: Display pass — staggered velocity, momentum-flux units, out-of-range fetch

**Files:** Modify `js/shaders.js`, `js/main.js` (`FIELDS` mom entry, `momScene`), `js/sim.js` (`fieldStats` mode 5), `exercises/_runner/smoke.js` (avg suite).

Findings fixed:
- `blU` in FS_DISP subtracts 0.5 and interpolates all four U channels as cell-centred, but live `U.r` is on the west face and `U.g` on the south face (contract at the `u_U` channel comment). The live picture is half a cell off the mean picture in u and w. Under Average `uAt` returns the collocated field, so `blU` is right there. → live branch: sample `u` at `g - vec2(0.0, 0.5)` and `w` at `g - vec2(0.5, 0.0)`, p/divergence at `g - 0.5` (FS_PART's `velAt` is the reference).
- Momentum flux: FS_DISP computes kinematic `f * U.r * sp` (m²/s²) but `FIELDS` says `ρu|u|`, `kg/m/s²`. → multiply by `1000.0` in the shader, in `momScene()` and in `fieldStats` mode 5, so the label is true.
- FS_COL fetches `ivec2(i+1, j)` at `i = nx-1`; FS_COL and FS_TCOL `SO()` unclamped. → clamp to `u_res - 1` (the `CL` helper).

- [ ] **Step 1: Failing smoke check** (avg suite): `"display Fit of Momentum flux is in kg/m/s²"` — on sa1 settled, `SIM.fieldStats(5).hi` ≥ 100 (it is ~0.5 kinematic now). And `"live and mean Speed agree on a steady reach"`: after a 20 s window on sa1, `fieldStats(2,false).hi` and `fieldStats(2,true).hi` within 10% (pins the CPU path; the GPU offset is verified in Step 4).
- [ ] **Step 2:** `smoke.js --only=avg` → the first FAILS.
- [ ] **Step 3: Implement** the three shader fixes and the ×1000 in all three places.
- [ ] **Step 4:** `--only=avg,profile` green. Visual check in the preview: sa1, Speed field, toggle Live/Average after 30 s — no half-cell shift of the near-bed gradient. Record a screenshot pair in `exercises/_code-changes/REVIEW-2.4-*.png`.
- [ ] **Step 5:** Commit `fix(disp): sample staggered u/w at their faces; momentum flux in kg/m/s²; clamp FS_COL fetches`.

### Task 2.5: Pressure reference elevation — decide, then make all consumers agree

**Files:** Modify `js/shaders.js` (contract comment, FS_DISP modes 6/7, FS_HGL), `js/sim.js` (`hydraulicGrade` averaged branch, `fieldStats` modes 6/7), `docs/numerics.md`.

Finding: the channel contract says `b = p/ρ at the cell centre`; FS_HGL and `hydraulicGrade` say the stored pressure references the cell's LOWER face (`z = j·Δx`, measured half-cell bias on m1); FS_DISP modes 6/7 and `fieldStats` use the centre. The coloured `h` field and the drawn HGL differ by Δx/2.

- [ ] **Step 1: Measure.** Write `exercises/_runner/probe-pref.js` (CDP via `test/cdp.mjs`): boot `?scene=sandbox`, fill a still tank to η = 1.000 m, settle 20 s, read `U.b` down one column; fit `p/g = η - z_ref(j)` for `z_ref = j·Δx` vs `(j+0.5)·Δx`. Report the residual of each.
- [ ] **Step 2:** The convention with the smaller residual wins. Write the decision and the numbers into `docs/numerics.md` next to the EOS section.
- [ ] **Step 3: Implement** the winner in every consumer listed above, and correct the contract comment.
- [ ] **Step 4:** `smoke.js --only=avg,profile,physics` green; in a still tank the Piezometric head field and the HGL line agree to < 0.1 Δx (add this as `ok("physics still-water h field equals HGL", …)` to the physics suite, reading `fieldStats(6)` lo/hi against `hydraulicGrade()`).
- [ ] **Step 5:** Commit `fix(head): one reference elevation for the stored pressure`.

### Task 2.6: Small UI bugs and constants

**Files:** Modify `js/main.js`, `js/gauge-inspector.js`, `js/pickers.js`.

Findings fixed: `d_c` notes use literal `9.81` (`Math.pow(D.q*D.q/9.81, 1/3)` ×2, `v / 9.81` in the celerity note) → `SIM.gMag()` (Task 3.1 adds it; until then `Math.abs(sim.p.g) || 9.81`). `EMBED` true for `?embed=0` → `=== "1"` or empty value. Pour magic numbers (`1/60`, `0.35`, `±6`, `-2.0`, `brush*4`) → named constants `POUR = { gain, vMax, vDown, rBrush }` with a one-line why. Shift-snap copy-pasted ×3 in `onMove` and missing from the CV drag → `dragTo(d, x, z, e)`. `hasValves` swallows a throwing `sc.valves()` → `console.warn` once per scene, keep returning true. Escape doesn't close the legend's field menu and it has no resize re-placement → both. `EX.render` calls `hasRig(e)` twice per row. `rangeFor`/`UIMODE.apply` repeat `FIELDS.find(q => q.id === id)` → `fieldById(id)` beside `fieldFor(mode)`.

- [ ] **Step 1:** ui-smoke case `"Escape closes the field menu"` and `"?embed=0 is not embedded"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** ui-smoke green.
- [ ] **Step 5:** Commit `fix(ui): small bugs — g in notes, embed=0, legend menu Esc, pour constants, snap`.

---

## Wave 3 — the core refactor (behaviour-preserving)

### Task 3.1: sim.js — one mask vocabulary, one Favre unpack, one face loop, a declared grid

**Files:** Modify `js/sim.js`, `js/overlay.js`, `js/reconstruct.js`, `js/main.js`, `exercises/_runner/smoke.js`.

**Interfaces:**
- Produces: `SIM.MASK = { OPEN: 0, VALVE: 128, WALL: 255, VALVE_MIN: 64, SOLID_MIN: 192 }` and `SIM.isSolid(m, valveClosed) → boolean` (`m >= SOLID_MIN || (valveClosed && m >= VALVE_MIN)`). Segment kinds use `MASK.WALL/VALVE/OPEN` (eraser = OPEN).
- Produces: `RECON.reconstruct(o)` accepts `o.solidMin` (default 192); smoke asserts `SIM.MASK.SOLID_MIN === 192` so the default cannot drift silently.
- Produces: internal `favre(buf, k) → [u, w, f, p]` and `faceLoops(box, U, F, cen, visit)` shared by `boxFlux` and `boxForce` (`boxForce` = `boxFlux` totals + weight term; `boxFlux` keeps its return shape exactly).
- Produces: `SIM.gMag() → number` (|g| or 9.81 in plan view) replacing the 17 `|| 9.81` sites in sim, main and overlay; `SIM.planView() → boolean` (`Math.abs(S.p.g) < 0.1`) replacing `< 0.1` and `< 0.5` tests in JS.
- Produces: `SIM.isOn(v) → boolean` (`v > 0.5`) used for the ≈60 `> 0.5` / `< 0.5` flag reads outside sim.js. Storage in `S.p` stays 0/1 numbers (they are uniforms and wire values).

Findings fixed: mask thresholds in sim (4 `sol()` copies with `>` vs `>=`), overlay (3), reconstruct, and segment kinds 0/128/255 in main; 8 copies of the Favre unpack (`readState`, `probe`, `probeMany`, `avgProbe`, `rake`, `patch`, `avgField`, `hydraulicGrade`); `boxFlux`/`boxForce` share ~60 identical lines; `S` gains ~50 undeclared properties (`wdG wdF wdD wdZ wdV wallD ceF ceU ceW lnU lnF cvU cvF seeds seedT stageKey stage bandKey inBand twBand dyeOn dyeDraw dyeUsed wetT wetFr trailSet gradeBuf …`) and `S.gradeBuf` collides in name with `state.gradeBuf`; `|| 9.81` ×17; plan view tested three ways.

- [ ] **Step 1: Golden capture.** Add smoke case `"refactor golden: instruments unchanged"` (api suite): boot h23 at Low, `APP.tick(4000)`, open Average, `APP.tick(800)`, then record `boxFlux`, `boxForce`, `lineFlux(2,0.2,2,1.5)`, `probeMany` of 5 points, `rake(3)`, live and averaged, into `exercises/_runner/golden/instruments-h23.json` on first run (`--write-golden`), compare at 1e-6 relative afterwards. Also add Review Focus #2: every `EXERCISE_RIGS` payload applies and `RIG.snapshot()` equals the payload to 1 µm (`ok("rig every packaged payload round-trips")`).
- [ ] **Step 2:** Run with `--write-golden`, then without → green (golden equals itself; the rig round-trip passes today).
- [ ] **Step 3: Implement.** Declare every `S` field with its initial value in `build()` in one object literal, grouped (grid, live textures, closure scratch, readback scratch, caches, dye, averaging) with a one-line comment per group; rename `S.gradeBuf` → `S.avgFieldScratch`. Then the helpers above, replacing every site. No numeric change: same operation order inside the loops.
- [ ] **Step 4:** `smoke.js --only=api,rig,physics,geom,avg,profile` green including the golden; `node test/recon-test.mjs` green.
- [ ] **Step 5:** Commit `refactor(sim): MASK vocabulary, one Favre unpack, shared face loops, declared grid object`.

### Task 3.2: Shaders — one prelude, fields described once, uniforms checked

**Files:** Modify `js/shaders.js`, `js/gl.js`, `js/sim.js`, `js/main.js` (`FIELDS`, `LEGEND` ramp CSS).

**Interfaces:**
- Produces: `Shaders.COMMON` — `#version 300 es`, precisions (incl. `sampler2D` highp), `ivec2 CL(ivec2)`, `float SO(ivec2)` (valve-aware, clamped), `float runMean(float A, float x, float T, float dt)`, `float hydroTarget(float gMag, float L, float z, float c2)`, `vec4 bilin(sampler2D, vec2 g)`, `const float RAIL = 80.0`, `const float FILL_EPS = 1e-6`. Every program is `COMMON + body`.
- Produces: `Shaders.RAMPS.water` (the two Water stops). FS_DISP takes `uniform int u_ramp` (0 turbo, 1 divg, 2 water) and `uniform float u_mid` (NaN-free: `u_hasMid` flag) from the active `FIELDS` row; `FIELDS` rows keep `ramp`/`mid` as the single source. An unknown `u_mode` paints magenta (`vec3(1,0,1)`).
- Produces: `LEGEND` bar CSS applies the same `pow(c, 0.95)` the shader does.
- Produces: `GLH.createProgram` warns once per name on a null uniform lookup (`console.warn("uniform not found: " + name)`), uses `Object.create(null)` for the cache, and detaches/deletes its shaders after linking.

Findings fixed: Water ramp typed twice; ramp/mid per mode hard-coded in the FS_DISP if-chain and again in `FIELDS`; unknown mode paints momentum flux; legend lacks the final `pow 0.95`; `SO()` ×3 plus five inline solid tests with different meanings (FS_DISP `solAt`'s `s > 0.75 ? 1 : (s > 0.25 ? 1 : 0)` is just `s > 0.25`; FS_PART's respawn treats an OPEN valve as solid — keep that one deliberate and comment why); `CL` ×3; hydrostatic target ×4; running mean ×4; bilinear ×5; version/precision header ×14; FS_TRAIL_SHADOW lacks a `sampler2D` precision; ±80 rail literal ×6; `lim4` spelled twice (interior and ghost accumulator) → one function both call; fill epsilons `1e-3`, `1e-6`, `1.0` → `FILL_EPS` (keep `1.0` in FS_SFLUX only if its comment says why — it is a different guard); dead uniforms FS_DISP `u_c2`, `u_time`, FS_PART `u_pres`, VS_PART `u_U`, `u_cursor.w`; `u_dyeSeed.w` unused; `u_g` signed in vel/vof/disp but positive in FS_HGL → rename FS_HGL's to `u_gMag`; FS_DISP divides by `9.81` in mode 1 and `max(|g|, 1e-3)` in 0/6/7 → one `gEff()` (9.81 when plan view); FS_PART and FS_SFLUX overload `u_U` with the Favre field under `u_avg` while FS_DISP uses `u_AF` → all three take `u_AF`; sampler `u_T` vs float `u_T` → trail sampler `u_Trail`; notation `sxy` → `sxz`; FS_DISP loop variable `dx` → `di`; VS_RECT six-way if-chain → bit arithmetic on `gl_VertexID`.

- [ ] **Step 1:** Add smoke case (api suite) `"every program links and every uniform sim.js sets exists"` — boot, run 10 frames with Average on and off, particles on, streamlines on; assert the console-warning collector saw no `uniform not found`.
- [ ] **Step 2:** Run after the GLH warning is added but before the clean-up → FAILS naming the dead uniforms.
- [ ] **Step 3:** Implement the prelude and every item above. FS_VEL, FS_VOF and FS_DISP `main()`s are split into named functions (void bleed/extension, boundary ring, wavemaker, sources, per-mode colouring) with no arithmetic change.
- [ ] **Step 4:** Full `node exercises/_runner/smoke.js` green including the Task 3.1 golden; `--mutate=surface-sink` and `--mutate=favre-reynolds` still killed (update their `find` strings if the code they patch moved, keeping the same bug). ui-smoke green (legend checks).
- [ ] **Step 5:** Commit `refactor(shaders): COMMON prelude; ramps and midpoints from FIELDS; uniform lookups checked`.

### Task 3.3: GL layer and the substep loop's uniforms

**Files:** Modify `js/gl.js`, `js/sim.js`.

**Interfaces:**
- Produces: `GLH.makeDraw(gl, mode, count)` replacing `makeQuad`/`makeRect`/`makePoints` (callers: `quad = makeDraw(gl, TRIANGLES, 3)`, …).
- Produces: double buffer gains `parity` (0/1, flips on `swap`) and `prev` (alias of `write`, for the particle tail). New `GLH.createCoupled(gl, dbA, dbB)` → `{ fbo() , swap() }` — one MRT FBO per phase, chosen by `dbA.parity`, swapping both buffers; replaces `fboA/fboB/fA` and the texture-identity test in `avgStart`/`step`.
- Produces: `GLH.read(gl, fbo, x, y, w, h, buf)` (binds, reads, unbinds) used by every readback; `GLH.upload(gl, tex, w, h, fmt, type, data, align)` restoring `UNPACK_ALIGNMENT` to 4.

Findings fixed: ping-pong halves `S.F.a/b` used directly; MRT phase via texture identity; particle tail reads `write` as "previous"; `resetWater` respecifies attached textures with `texImage2D` while `rescaleFill`'s comment says that invalidates them → `texSubImage2D` in both, comment corrected (same-size respecification keeps the attachment; sub-image is used to avoid relying on it); ~25 raw `bindFramebuffer`+`readPixels`; `pixelStorei` left at 1 or 4; `bindTex` assigns units by position and the particle-head re-bind exists because of it → `bindTex(gl, prog, list, firstUnit = 0)` and comment; uniforms set every substep that change only per step: split `simUniforms` into `stepUniforms(pr)` (once per `step()` call: res, dx, dt, g, gx, c, c2, valve, bands, inlet, sponge, fill, openMode, source/pour) and `substepUniforms(pr)` (time, waveU, Tacc, dye); cache keys built from strings twice per substep → compare the numeric tuple; `windTau()` scans params every substep → cached, invalidated by `onGeometry`/`setParam`; `paddleBed()` scans a column every substep with the flap on → cached per rasterise; transport cap comment says `dx/4dt` but code uses `0.20*dx/dt` → comment states the code's value and why.

- [ ] **Step 1:** Add to smoke api suite `"substep throughput did not regress"`: h23 at Medium, `APP.tick(2000)` wall time recorded before (Step 1 run on the pre-task commit) and after; after ≤ before × 1.05.
- [ ] **Step 2:** Run on the current commit to record the baseline.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full smoke green including golden and throughput; ui-smoke green.
- [ ] **Step 5:** Commit `refactor(gl): coupled double buffers, read/upload helpers, per-step uniforms`.

### Task 3.4: Split main.js by responsibility

**Files:** Create `js/state.js`, `js/fields.js`, `js/panel.js`, `js/strip.js`, `js/legend.js`, `js/dock.js`, `js/instruments.js`, `js/governor.js`. Modify `js/main.js`, `index.html`.

**Interfaces (load order in `index.html`, all before `main.js`, after `stream.js`):**
1. `state.js` — `CONFIG`, `state`, `EMBED`, and the mutable view handles (`canvas`, `over`, `octx`, `view`, `sim`) declared with `let`.
2. `fields.js` — `FIELDS`, `fieldFor`, `fieldById`, `fieldBlurb`, `GAUGE_QTY`, `gaugeQty`, `gaugeFieldOf`, `setAllGaugeFields`, `rangeFor`, `sceneNow`, `hmaxScene`, `pressureRange`, `momScene`, `vmaxFor`.
3. `panel.js` — `CONTROLS`, `ctl(id)` (replaces the 9 `CONTROLS.find(x => x.id === id)`), `buildPanel`, `syncPanel`, `focusedSections`, `applyPanelFocus`, `setPanel`, `togglePanel`, `refreshNote`.
4. `strip.js` — `TOOLS`, `TOOL_LETTER`, `TOOL_KEYS`, `ICONS`, `iconEl`, `TIP`, `TOOLBAR`, `toolItems`, `toolItem`, `familyOf`, `buildToolbar`, `showAllGroup`, `fitBar`, `syncToolbar`, `KEYS` (renders from `KEYMAP`, which `keymap.js` defines and loads after `strip.js`).
5. `legend.js` — `LEGEND`, `UIMODE`.
6. `dock.js` — `MINI`, `DOCK`, `START`, `showToast`, `wheelHint`, `dragWindow`.
7. `instruments.js` — gauges (`addGauge`, `placeGauge`, `removeGauge`, `clearAllGauges`, `sampleGauges`, `clearGaugeHistory`, `freeGaugeColour`), rakes, flux sections, control volume, force, tracers, `emaFlux`, `FLUX_KEYS`, `CV_EDGES`, `CV_NEXT`, `measuringAvg`, `refreshGrade`, `collectStream`, `requestStream`, `sampleInlet`, and one `clearInstruments({ all })` used by both `loadScene` and `EX.clearInstruments` (they disagree today: EX leaves flux, force, measure and tracers — keep EX's narrower behaviour as `{ all: false }` and say why in a comment).
8. `governor.js` — `gov`, `statWin`, `governFrame`, `governTarget`, `governLearn`.
9. `main.js` — view transform, scenes (`loadScene`, `switchScene`, `syncTitle`, `syncURL(params)` — absorbs `syncURLEx` from pickers.js), pointer tools, `tickFrame`/`frame`, `drawOverlay`/markers/spout, `updateStatus`, `cycleTips`, `setAverage`, `toggleValve`, fullscreen/pop-out, `boot`, `window.APP`.

Every file opens with a header listing exactly the globals it defines and the globals it reads (verified by the grep in Step 4). Move code verbatim; the only edits are the `ctl()` replacement, `clearInstruments`, `syncURL` merge, and deleting `typeof X !== "undefined"` guards for globals that the load order guarantees (`EX`, `TOOLBAR`, `iconEl`, `EXERCISES`, `EXERCISE_MENU` — keep the guard only for `EXERCISE_RIGS`, which is optional data; collapse the five `EXERCISE_MENU` checks into one `menuFlag(name)` in pickers.js). `index.html`'s script block gains nine tags; Task 4.4 must have landed first to keep it under 200 lines — **run 4.4 before this task.**

- [ ] **Step 1:** Add ui-smoke case (Review Focus #1) `"file:// boot has no errors and the registers are populated"`: open `file:///…/index.html?scene=sandbox`, wait for `APP.sim`, assert no uncaught errors, `APP.ui.FIELDS.length === 9`, `APP.TOOLS.length === 13`.
- [ ] **Step 2:** Run → passes (pins today's behaviour).
- [ ] **Step 3:** Move the code. Verification of "verbatim": `git show HEAD:js/main.js | sort > /tmp/a; cat js/{state,fields,panel,strip,legend,dock,instruments,governor,main}.js | sort > /tmp/b; diff /tmp/a /tmp/b` shows only the listed edits and the new headers.
- [ ] **Step 4:** `wc -l index.html` < 200; ui-smoke green; full smoke green; for each new file, every global named in its header's "reads" list is grep-found in it and every global it reads is in the list (script: `exercises/_runner/check_headers.py`, run in CI from Task 6.2).
- [ ] **Step 5:** Commit `refactor(main): split main.js into nine files by responsibility`.

### Task 3.5: OVERLAY owns its state; no module reaches into another's internals

**Files:** Modify `js/overlay.js`, `js/main.js`, `js/pickers.js`, `js/gauge-inspector.js`, `js/rig.js`.

Findings fixed: `OVERLAY.analyse` stores its filters on SIM's grid (`S._hA`, `S._qA`, `S._ynK`) → a `WeakMap` keyed by the grid object inside OVERLAY; `resetEstimates(sim)` keeps its signature. Header dependency lists wrong in pickers.js (lists unused `loadScene`, `CONFIG`; omits `TOOLBAR`, `iconEl`, `foldText`, `placeGauge`, `gaugeQty`, `syncTitle`, `canvas`, `sim`, `EXERCISES`, `EXERCISE_RIGS`, `EXERCISE_MENU`) and gauge-inspector.js (lists unused `FIELDS`, `KEYS`, `canvas`, `frame`; omits `UIMODE`, `GAUGE_QTY`, `gaugeQty`, `gaugeFieldOf`, `removeGauge`, `OVERLAY.fmt`) and rig.js → regenerate with `check_headers.py`. Name collisions: pickers' inner `fieldFor(id)` (a control-row builder) → `controlRow(id)`.

- [ ] **Step 1:** `py -3 exercises/_runner/check_headers.py js/pickers.js js/gauge-inspector.js js/rig.js js/overlay.js` → FAILS listing the mismatches.
- [ ] **Step 2:** Confirm the failure list matches the findings.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `check_headers.py` over all `js/*.js` green; smoke `--only=physics,avg,profile` green (analyse filters unchanged).
- [ ] **Step 5:** Commit `refactor(overlay): estimates in a WeakMap; accurate dependency headers everywhere`.

---

## Wave 4 — UI cleanliness

### Task 4.1: Shared popup, formatters and canvas helpers

**Files:** Create `js/popup.js`, `js/format.js`. Modify `js/pickers.js`, `js/strip.js`, `js/legend.js`, `js/overlay.js`, `js/gauge-inspector.js`, `js/stream.js`, `js/main.js`, `index.html`.

**Interfaces:**
- Produces: `POPUP.make({ el, opener, render, onKey?, place? }) → { open(anchor), close(), toggle(anchor), isOpen(), place(), onDown(e), key(e) }` — click-away, Esc, arrow/Enter navigation over `[role=menuitem]`, the opener's `active` class, one shared `resize` listener re-placing whichever popup is open. PICKER, EX, KEYS and the legend field menu all use it; `PICKER.key`/`EX.key` and `PICKER.warning`/`EX.warning` collapse to one each (`POPUP.warning(host, text, actions)`).
- Produces: `FMT.num(v)` (LEGEND's three-figure rule), `FMT.big(v)`, `FMT.kN(v)`, `FMT.t(s)`, `FMT.val(v, step)` (EX's), `FMT.nice(x, steps = [1, 2, 5])` — replacing `OVERLAY.fmt/fmtBig/fN/fKN`, `vec`'s inner `d`, `LEGEND.fmtNum`, `EX.fmtVal`, `card.round4`, `ruleValue`'s rounding, `GINSP.fmtT`, and the six nice-step pickers (STREAM uses `steps = [1, 2, 2.5, 5]`). Also `FMT.put(el, text)` (write only on change), used by GINSP.draw, EX.card.tick, the spin-up hint and LEGEND.
- Produces: `OVERLAY.arrowHead(ctx, x, y, angle, len)`, `OVERLAY.FONT = { mono11, mono12, sans11 }` (one font stack), `OVERLAY.TAU`; `OVERLAY.C` gains `res`, `tw`, `piston`, `spout` used by `drawMarkers`/`drawSpout` and pickers' `.rigtag`; `OVERLAY.rakePxPerMps(view, uRef)` used by main and overlay.

Also: GINSP.tick reads `offsetWidth` after writing positions every frame → measure once per open and on resize; `tickFrame` writes `#hint.innerHTML` every spin-up frame → `FMT.put`; C10 redundant work in one `EX.pick`: add `UI.batch(fn)` in `panel.js` that defers `syncPanel` and `buildToolbar` to one call each at the end of `fn`; `EX.pick` and `UIMODE.apply` run inside it.

- [ ] **Step 1:** ui-smoke case `"an exercise pick builds the toolbar once and syncs the panel once"` (count calls via wrapped `APP.ui.syncToolbar`/a counter `APP.ui.syncCount`), and `"every menu closes on Escape and on click-away"` for scenes, exercises, keys, field menu.
- [ ] **Step 2:** Run → the first FAILS (2 builds, ≥5 syncs).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** ui-smoke green; full smoke green.
- [ ] **Step 5:** Commit `refactor(ui): one popup, one formatter set, shared canvas helpers, batched syncs`.

### Task 4.2: Dead code, stale and orphaned comments, duplicated constants

**Files:** Modify `js/*.js` as listed. (Sonnet; mechanical but needs judgement.)

Remove: `EX.digitSummary`, `EX.ruleValue` (grep the repo incl. `courses/` first — keep any with a caller); the `.exyours` line, `ruleLines`, and its CSS; `drawGaugeCharts`' string-signature branch; `drawFlux`'s unused `show` param; `CV_Q.*.unit/.dp`; the `"d𝆑"` literal replace (write `d_c`); MINI's `cornerL`/`inline` options and unused `set`/`isMin`/`anchor`; DOCK's always-`"Exercise"` `kind` param; GINSP's unused `o.drag`.

Re-home or delete orphaned doc comments (each is stacked above the wrong function): overlay `show` doc above `drawGradeLines`, the doc above `rakeSpan`, and the three others in overlay.js; pickers.js one; main.js `baseRect` duplicate doc, the stacked `rows`/`shows` docs in UIMODE, the `toolItem` doc pair, `placeCV`'s doc above `removeFluxAt`, the tracer doc above `bestTracerX`.

Fix stale comments: "seven colourings" (main, css) → nine; "js/menu.js" → `js/courses.js`; "`scenes: false`" course option (no such option) → delete; `dragWindow` "shared by the gauge inspector and the exercise card" → and the legend; `DOCK.show` `onClose` param; the garbled sentence at the top of `tickFrame` ("A gap longer than / A hidden tab…"); "forty demos in `exercises/`" (pickers.js and the `exercise` Controls `info`) → "the exercises of the active course"; `index.html` "built in main.js (see EX.card)" → pickers.js; shaders.js header "superbee-limited" → van Leer, "PASSES per substep: vel then vof" → list the per-substep passes and the per-frame passes; "Average does not add seven more colourings… the same seven branches" (shaders, sim) → nine; "Nothing forces a void (gravity and ∇p are both gated on f)" → true only under gravity, say so; `RECON` header "Two jobs" → four (averaging, reconstruction, inlet depth, column energy); the `APP.volume()` comment "the mass-balance check" → "total water volume; NOT a mass check where water stands over a solid (docs/making-exercises.md)"; the vof `fNew = (fNew > 0 && fNew < 8) ? …` line gets a comment: a NaN/rounding guard behind the donor cap, never active in a conserving run, and why it is not the forbidden `f` clamp.

Duplicated constants: `VEX_MAX = 8` vs slider/drag 12 → `VEX_FIT_MAX = 8` (the fitted ceiling) and `VEX_MAX = 12` (the hand ceiling) used by the slider and the drag; instrument caps → `CONFIG.maxGauges = 4`, `maxFlux = 4`, `maxRakes = 2`; `CV_EDGES` exported from `instruments.js` and used by overlay; history comments ("used to", "was tried", measured story) longer than three lines in `js/*.js` move to `docs/engineering-notes.md` under the section they belong to, leaving one line and a link.

- [ ] **Step 1:** `grep -nE "seven colour|js/menu.js|superbee|scenes: false|forty|Two jobs" js/*.js css/*.css index.html` → hits.
- [ ] **Step 2:** Record the count.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same grep → 0 hits; ui-smoke and smoke `--only=api,rig,avg` green; `node test/recon-test.mjs` green.
- [ ] **Step 5:** Commit `chore: remove dead code, fix stale and orphaned comments, name duplicated constants`.

### Task 4.3: CSS

**Files:** Modify `css/app.css`, `js/dock.js`, `js/pickers.js`, `js/main.js`.

Findings fixed: `.tsep` is `display:none` on desktop though comments say it "comes back"; `#bar.tight .tsep` styles a never-shown element; header says "two steps of compaction" (three); dead selectors `.minbtn.cornerL`, `#startlist .si.hi`, `#startlist .g { break-inside }`, `#sceneKey { display:none }` (and `syncTitle` still writes it — stop writing it), `.scenebtn` has no rule (give it one or drop the class); two stacked `:root` comments; legend block says "Top left" then "Top right"; `#legend` declared twice; specificity hack `#legPick, #legend #legMode button, #legend #legActs button { cursor: pointer }` → `#legend button { cursor: pointer }` with the editable spans set to `text`; CSS vs inline-style fights (`#exmenu.compact max-height` vs `style.maxHeight`; `#bar.tighter #status` vs `updateStatus`'s `style.display`; `.exd/.exrules/.exsteps` display inline; `.rigtag` colour inline) → classes toggled from JS; magic offsets `#panel top: 72px`, `#toast top: 76px`, `#legend top: 84px` → `calc(var(--bar-h) + Npx)` with `--bar-h` set per compaction step; dock geometry in JS and CSS → `--dock-w: 348px`, `--phone-max: 620px`, `--sheet-h` defined once in `:root`, JS reads them with `getComputedStyle` (DOCK's `W`, `PHONE`, `sheetH()` deleted); six near-identical small-button styles → one `.btn-sm` class.

- [ ] **Step 1:** ui-smoke already covers layout; add `"the dock width JS uses equals the CSS width"` and `"panel top clears the bar at every compaction step"`.
- [ ] **Step 2:** Run → the second may FAIL at `.tight`.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** ui-smoke green; visual check of the strip at 1440, 1100, 800 and 400 px widths in the preview.
- [ ] **Step 5:** Commit `style(css): variables for bar and dock geometry, one small-button class, dead rules removed`.

### Task 4.4: index.html — markup only (run BEFORE Task 3.4)

**Files:** Modify `index.html`, `docs/engineering-notes.md`. (Haiku.)

Move the design-history prose comments (the legend-placement paragraph, the "DELIBERATELY SHORT… used to carry two further paragraphs" block, the mode-switch paragraph) to `docs/engineering-notes.md` under a "Legend" heading, leaving at most one line each. Define the brand drop once as `<svg style="display:none"><symbol id="drop" viewBox="0 0 20 20">…</symbol></svg>` and use `<svg class="brandmark"><use href="#drop"/></svg>` twice, stroke colour in CSS. Add `type="button"` to `#legX` and `.dock-x`. Viewport meta → `width=device-width, initial-scale=1` (drop `maximum-scale`/`user-scalable=no`; the canvas's own touch handling keeps pinch on the flume).

- [ ] **Step 1:** `wc -l index.html` → 192.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `wc -l index.html` ≤ 165; ui-smoke green; double-click `index.html` → brand marks render.
- [ ] **Step 5:** Commit `chore(html): markup only — prose to the notes, one brand symbol, button types, zoomable`.

### Task 4.5: Naming consistency

**Files:** Modify comments and internal identifiers in `js/*.js`, `css/app.css`. No worksheet-facing id changes.

Glossary, applied to comments, CSS comments and internal (non-wire, non-control-id) names: **Controls panel** = `#panel`; **dock** = `#dock` (never "side panel"); **readout boxes** = the instruments' on-canvas numbers (`OVERLAY.PRINT.boxes` → `OVERLAY.PRINT.readouts`); **hover card** = the cursor readout; **gauge quantity** = a `GAUGE_QTY` row (comments stop calling it a field; `g.field`, `state.gaugeField`, `ui.gaugeFields` and the `gaugeField` control id stay, as wire/worksheet names, with one comment at `GAUGE_QTY` saying so). Add the glossary to `docs/notation.md` under "Interface words".

- [ ] **Step 1:** `grep -nE "side panel" js/*.js css/app.css` → hits.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** grep → 0; check_notation green; ui-smoke green.
- [ ] **Step 5:** Commit `chore: one word per interface concept`.

---

## Wave 5 — documentation (parallel; no GPU)

### Task 5.1: AGENTS.md becomes a brief; docs/testing.md holds the manual (sonnet)

**Files:** Modify `AGENTS.md`. Create `docs/testing.md`.

AGENTS.md keeps: one-paragraph intro and run command; the "Where things live" table (updated for every file this plan created, plus `docs/syllabus.md`, `docs/year1-programme.md`, `docs/math.js`, `docs/design/`, `.github/workflows/checks.yml`, `exercises/_runner/HOWTO.md`, `bench.md`; `test/` row lists every gate; `shaders.js` row: "the GPU programs — per-substep vel, vof; per-frame columns, display, particles, averaging, streamlines"; `reconstruct.js` row names inlet depth and column energy; `docs/hydrostatic-attractor.js` described as "a float64 CPU re-implementation of the closure, not a solver check; not a gate"); the model paragraph; the rules as one-liners with a link each; the gate table with commands and cost but **no assertion counts** (they drifted every week: "43" is 68, "fifteen" is 22, "46" is 60, "10 boots" is 4 launches) — each row says what it guards; the day-one gotchas. Move to `docs/testing.md`: CI/GPU rationale, ANGLE flags, the mutation-gate story, checker internals, `--only` subsets (corrected: `api,rig` is the fast subset after Task 1.1; `pack,scenes` boots every card and scene), `$CHROME`. Move the Notation section's body to a pointer to `docs/notation.md`, the exercise-pack section to a pointer to `docs/making-exercises.md`, the Average gotcha to a pointer to `docs/averaging.md`, the zero-deps essay to `docs/engineering-notes.md`. Fix: `RIG.migrate` is in `js/rig.js`; gauge wire keys are any `GAUGE_QTY` id; "a dozen classic scripts" → "about twenty"; Python command `python3` (Windows: `py -3`); add worktrees line (`.claude/worktrees/` for agent worktrees, which `.gitignore` already says).

- [ ] **Step 1:** Write `exercises/_runner/check_docs.py`: every path in backticks in `AGENTS.md` and `docs/testing.md` exists; every `smoke.js --only=X` names a real suite; no `\d+ assertions` in AGENTS.md. Run → FAILS on today's text.
- [ ] **Step 3:** Rewrite.
- [ ] **Step 4:** `check_docs.py` green; `wc -l AGENTS.md` ≤ 140.
- [ ] **Step 5:** Commit `docs(agents): a brief, not a manual; testing moves to docs/testing.md`.

### Task 5.2: README (haiku)

**Files:** Modify `README.md`.

Replace the Developer section's file table with one line pointing at `AGENTS.md`. Fix: card fields (drop `submit`, `notes`; list `steps`, `background`, `tabs`, `ui`, `aim`, `studentParams`, `instruments`, and point at the `js/exercises.js` header); segments `[x0,z0,x1,z1,th]` and say new scenes prefer `solids()` polygons with `walls()` as a shim (remove the Task 1.2 allowlist entry); the scene-building paragraph; "RIG-D chamber" (RIG-C is historical, no RIG-D); the CHANGES-NEEDED pointer (history, not open proposals); the double syllabus link; the default-course sentence (per host: `original` on barneydobson.github.io, `cive40008` on mvreeuwijk.github.io); "live once the repository is public"; the controls table gains L, B, A, I, F, T, D, M; runner.py is Linux-bound.

- [ ] **Step 1:** `py -3 exercises/_runner/check_notation.py` with the allowlist removed → FAILS on `[x0,y0`.
- [ ] **Step 3:** Edit.
- [ ] **Step 4:** check_notation green; `check_docs.py README.md` green.
- [ ] **Step 5:** Commit `docs(readme): current schema, notation, pointers`.

### Task 5.3: Card schema header, rig pack header, making-exercises (haiku)

**Files:** Modify `js/exercises.js` (comments only, plus `CARD_KEYS` already added), `js/exercises-rigs.js` (header comment), `docs/making-exercises.md`, `js/courses.js` (comment), `courses/original/course.js` (comment).

Fix: `aim` documented twice differently → one entry (menu: under the title, start screen: on hover; not on the card); add `steps`, `background`, `tabs`/`alias`, `ui.legend`; "MOSTLY IT IS DERIVED, so most entries carry no `ui`" → every current card declares `ui`; the derivation still fills what it omits; move the `gauges` entry after the `ui` paragraph it interrupts; "draw, cut, erase or move" matches check_pack's verb list exactly (copy the list from the regex); the README-definition sentence (single definition: "lecturer notes — derivation, worked answers, verification; a student is never sent there for an equation or a procedure; the one exception is the draw-it-yourself fallback when the rig pack is absent") and make the other four places (`AGENTS.md`, `making-exercises.md`, `courses/original/INDEX.md`, `js/courses.js`) point to it; standing worksheet rules identical in exercises.js and `courses/original/INDEX.md`. `exercises-rigs.js`: `APP.RIG.apply()` is in `js/rig.js`; format is v2 and never migrated; payload count is 18; cite `RIGSHARE-report.md` without "§2 v1"; "every entry belongs to the original pack". making-exercises: `--only=pack,scenes` boots every card and scene; check_pack's course guarantees include "every owned card is listed in a section"; thumbnails go in the card's own folder; `python3` (Windows `py -3`). `courses/original/course.js`: check_pack does check that every card is listed. `js/courses.js`: the shared register holds no cards of its own.

- [ ] **Step 1:** `check_docs.py docs/making-exercises.md` → FAILS on `--only=api,rig` claim.
- [ ] **Step 3:** Edit.
- [ ] **Step 4:** `check_docs.py` green; `check_pack.py` green.
- [ ] **Step 5:** Commit `docs(schema): one card schema, one README definition, rig header corrected`.

### Task 5.4: Averaging, embedding, numerics, notes (haiku)

**Files:** Modify `docs/averaging.md`, `docs/embedding.md`, `docs/numerics.md`, `test/mutation-test.mjs` (comment), `js/main.js`-or-split-file (embed spec reference), `test/ui-smoke.mjs` (comment).

Fix: averaging.md §8 group letters collide with recon-test (H is the inlet there; K exists) → §8 lists recon-test's actual groups A–K and names the GPU groups differently (GPU-F, GPU-H…; update smoke.js names in the same commit if it cites them); §9 "the legend card names them among the reset conditions" → the Controls panel's Average `info`; embedding.md "stores nothing" → "no cookies; the chosen course is kept in sessionStorage for the visit"; numerics.md "the positivity clamp" → "the NaN/rounding guard behind the donor cap" and `v` → `w` for the vertical velocity; mutation-test's `.gitattributes` comment → describes the actual CRLF normalisation it does; "spec §1.1" → full path `docs/design/2026-09-10-embed-design.md` §1; ui-smoke `DOCK_W` comment (done in 1.4 — verify).

- [ ] **Step 4:** `check_docs.py` green; `node test/mutation-test.mjs` green; `py -3 exercises/_runner/check_notation.py` green.
- [ ] **Step 5:** Commit `docs: averaging groups, embedding storage, numerics wording`.

### Task 5.5: Course docs — HJ-2, CIVE40008 menu, syllabus, original-pack history (haiku)

**Files:** Modify `courses/cive40008/exercises.js` (HJ-2 comment), `courses/cive40008/exercises/HJ-2-gate-jump/README.md`, `courses/cive40008/INDEX.md`, `courses/cive40008/course.js`, `docs/year1-programme.md`, `docs/syllabus.md`, `courses/original/CHANGES-NEEDED.md`, `courses/original/_director-status.md`, `courses/original/_worker-recipe.md`, `js/exercises.js` (§2b dependency sentence).

Fix: HJ-2 comment and brief still say "No heads, no grade lines" though the Energy tab adds them → describe both tabs; INDEX row mentions the Momentum/Energy tabs; course.js "Energy conservation" section lists `HJ-2#energy`; year1-programme HJ-2 row: weir starts at 0.5 m (remove "crest 0"). syllabus.md: title it "Syllabus — the original exercise pack" and add a line pointing to `courses/cive40008/INDEX.md` for CIVE40008. CHANGES-NEEDED §2: mark P1 and P4 done with the commit that did them (find via `git log -S`), drop line-number citations; `_director-status.md`, `_worker-recipe.md`: add a first line "Historical; paths are as of <date>, before the move to courses/original/"; js/exercises.js: state the rule itself instead of depending on CHANGES-NEEDED §2b.

- [ ] **Step 4:** `py -3 exercises/_runner/check_pack.py` green (HJ-2 now listed — check_pack's every-card-listed check passes).
- [ ] **Step 5:** Commit `docs(courses): HJ-2 tabs everywhere, syllabus scoped, history labelled`.

### Task 5.6: Archive executed plans; re-home orphans; retirement checklist (haiku)

**Files:** Move `docs/superpowers/specs/*` → `docs/design/`; move `docs/superpowers/plans/*` except this plan → `docs/_archive/plans/` (underscore: unpublished by Pages); move `docs/thumbs/*` → `courses/original/thumbs/`; move `docs/qs2-two-tank.md` → `courses/original/exercises/QS-2-*/two-tank.md` and fix its one inbound link. Modify `courses/original/course.js`, `docs/making-exercises.md` (retirement section), `.gitignore` comment.

The "delete the folder and its two script tags" claim (AGENTS.md, making-exercises.md, course.js) is false. Replace with a checklist: remove the folder and its two script tags; repoint ui-smoke's `?ex=HJ-1` (6 places) and `?ex=QS-2` to CIVE40008 cards; remove `js/exercises-rigs.js` payloads (all 18 are original-pack); `docs/syllabus.md`; README links; `check_notation.py`'s `HISTORICAL` entries; `_config.yml` comments; move HS-1 into `courses/cive40008/` first. Add an ui-smoke-independent check to `check_pack.py`: `check_retirement_refs()` prints (not fails) every reference outside `courses/original/` to an original-pack id, so the checklist is generated, not remembered.

Worktrees: for each `.claude/worktrees/*` from Task 0.1's report that is clean and whose branch is merged or deleted, list it in the task report as removable. **Do not remove** — that is the user's call.

- [ ] **Step 4:** `grep -rn "docs/superpowers\|docs/thumbs\|qs2-two-tank" --include=*.md --include=*.js --include=*.mjs --include=*.py --include=*.yml .` → only this plan and `docs/_archive/`; Pages build config still excludes underscore dirs; check_pack green.
- [ ] **Step 5:** Commit `docs: archive executed plans, re-home orphans, a generated retirement checklist`.

---

## Wave 6 — tests have one home; CI gates the deploy

### Task 6.1: Gates move to test/; one Chrome client

**Files:** Move `exercises/_runner/smoke.js` → `test/smoke.mjs` (ESM; static `import` of `./cdp.mjs`), `exercises/_runner/check_notation.py` → `test/check_notation.py`, `exercises/_runner/check_headers.py`, `check_docs.py` → `test/`. `check_pack.py` stays in `exercises/_runner/` (a pack-authoring tool CI also runs). `runner.py` stays; it reads `$CHROME` too. Update every reference (`grep -rn "_runner/smoke.js\|_runner/check_notation\|_runner/check_headers\|_runner/check_docs"`).

- [ ] **Step 1:** grep → list of references.
- [ ] **Step 3:** Move with `git mv`; convert smoke to ESM (`require` → `import`, `__dirname` → `fileURLToPath`).
- [ ] **Step 4:** grep → only `docs/_archive/` and this plan; `node test/smoke.mjs --only=docs` green; `node test/smoke.mjs --mutate=rig-no-flux` killed; full `node test/smoke.mjs` green.
- [ ] **Step 5:** Commit `test: every gate lives in test/`.

### Task 6.2: CI

**Files:** Modify `.github/workflows/checks.yml`, `.github/workflows/pages.yml`.

checks.yml: `push: branches: [main]` + `pull_request` (no double run); add steps `py -3`-free `python3 test/check_headers.py`, `python3 test/check_docs.py`; set `CI=1` for check_notation; add a second job `no-gpu` (ubuntu-latest, Chrome preinstalled) running `node test/smoke.mjs --only=docs` and a new `node test/ui-smoke.mjs --only=file-boot` (add `--only` to ui-smoke with that one case — it needs no physics budget), `SOFTWARE=1`. pages.yml: trigger on `workflow_run: workflows: [Checks], types: [completed], branches: [main]` with `if: github.event.workflow_run.conclusion == 'success'`, checking out `github.event.workflow_run.head_sha`. Trim the long rationale comment to three lines and a link to `docs/testing.md`.

- [ ] **Step 4:** No local Actions runner exists and pushing is the user's call. Run every command each workflow step contains, locally, and report the output; check both files parse with `py -3 -c "import yaml"` only if PyYAML is already installed, otherwise by eye. The first real run happens when the user pushes.
- [ ] **Step 5:** Commit `ci: deploy only after Checks; no-GPU browser job; no double runs`.

---

## Wave 7

### Task 7.1: Final gates and whole-branch review

- [ ] **Step 1:** Run, one at a time: `py -3 exercises/_runner/check_pack.py`, `py -3 test/check_notation.py`, `py -3 test/check_headers.py`, `py -3 test/check_docs.py`, `node test/recon-test.mjs`, `node test/geom-test.mjs`, `node test/mutation-test.mjs`, `node test/smoke.mjs`, `node test/ui-smoke.mjs`. All exit 0.
- [ ] **Step 2:** Run every GPU mutant: `node test/smoke.mjs --mutate=<id>` for each catalogue id → each reports killed by its named assertion.
- [ ] **Step 3:** Fresh reviewer (sonnet) over `git diff main...review-remediation` against this plan: every finding addressed or explicitly deferred with a reason; no wire-format or worksheet-facing id change (`git diff main -- js/rig.js` shows no key change; `TOOLS` order unchanged; control ids unchanged).
- [ ] **Step 4:** Manual: double-click `index.html`; open `?ex=UP-1`, `?ex=HJ-2&tab=energy`, a `#rig=` link made on `main` before the branch; type in the rig box; press 5.
- [ ] **Step 5:** Report to the user. Do not merge or push.
