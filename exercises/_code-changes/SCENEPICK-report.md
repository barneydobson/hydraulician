# SCENEPICK — an in-UI scene picker

Authorised change: *"the scene selection is too complicated — can you build
that into the UI"*. Worksheets hand out `?scene=<id>` links and students were
being asked to type URLs.

**Files touched:** `js/main.js` (the `PICKER` module, `switchScene`/`syncURL`,
one panel section, eleven lines in `boot`, two lines in `loadScene`),
`index.html` (menu + title-box CSS, one bar button, the menu element).
**`js/scenes.js` was NOT touched** — every scene in the registry already
carried `name`, `key`, `blurb` and `group`, which is exactly what the menu
needs, so no metadata field had to be added. No solver, shader, `sim.js` or
`overlay.js` contact of any kind.

**One correction to the brief.** Scenes did *not* load only via URLs: there
was already a native `<select id="sceneSel">` in the top bar (present since
the first commit), listing bare names in optgroups. That is almost certainly
what "too complicated" is about — `a23`, `C1 / C3`, `wavesurge` mean nothing
without the one-line description the title box only shows *after* you have
already loaded the scene. The select has been **replaced** by the menu below;
nothing in `exercises/` referenced `sceneSel`, so nothing else moved.

---

## 1 · What shipped

One menu, four ways in:

| gesture | where |
|---|---|
| **click the scene-title box** (top-right, now a button with a `▾`) | the primary affordance; hover lights it and the caret |
| **`Scenes ▾`** in the top bar | replaces the old `<select>`, same slot |
| **Controls → Scene → `<current scene> ▾`** | new first section of the panel, above Flow |
| **`S`** | added to the key legend |

The menu lists **every entry in `SCENES.list`**, in registry order, grouped
under the registry's own `group` field, each row showing `name`, the `key`
subtitle and the full `blurb`. The current scene is highlighted and tagged
`CURRENT`; the Sandbox is a first-class first row. Nothing in the picker knows
a scene id — see the enumeration test below, which invents a scene at runtime
and watches it appear.

- **Esc** closes, **↑/↓** move a highlight, **Enter** loads, click-away closes.
- While the menu is open it **owns the keyboard**: `C` (clear drawing), `R`,
  `Space`, `Z`, `G` and the tool digits are swallowed rather than fired behind
  it. `C` with a menu open would otherwise have been a spectacular way to lose
  a rig.
- A dismissing click on the canvas **dismisses only** — the `pointerdown`
  listener runs in capture and stops the event, so the click does not also
  start drawing a wall. The next click draws normally.
- Both the title box and the bar button light up while the menu is open.

## 2 · Switching semantics — in place, not navigation

**Shipped: in-place rebuild** (`switchScene` → the existing `loadScene`), with
the address bar rewritten to match.

Why not `location.href = "?scene=" + id`:

- `loadScene` is *already* the path every `#rig=` link and every worksheet
  `rig.js` takes (`APP.loadScene(...)`, 12 exercise scripts), and it was
  already what the old `<select>` did. It is the better-tested path.
- The WebGL context, six compiled programs and the whole panel DOM survive, so
  the switch is immediate rather than a white flash and a re-init.
- The fidelity requirement is *checkable*, and it checks out exactly (§4.2):
  mask hash, parameter hash, grid and UI state after an in-place switch are
  **identical** to a fresh `?scene=` boot.

`switchScene` resets the session knobs that `loadScene` does not touch and a
fresh boot would never have inherited — set *before* the load so a scene that
pins one of them (`sc.particles`) still wins:

```
speed → 1.0   dye → on   jumps → on   particles → off   gaugeField → head
tracerN → 9   paused → running (through togglePause, so the button follows)
the valve button's highlight → cleared (a fresh boot never lights it)
the hint line → the new scene's first tip (loadScene resets the tip CYCLE
                but not the line, so the old scene's tip used to sit there
                for nine seconds — this was a pre-existing bug on the old
                <select> path too)
open inspector windows → closed
```

**Deliberately kept** (workspace preferences with no scene meaning, which a
fresh boot loses only because it cannot know them): the **resolution budget**,
the **pointer tool** and its brush size, and whether the Controls/About panels
are open. Resetting a student's High-resolution choice because they changed
scene would be the worse surprise. This is the one documented departure from
"indistinguishable"; everything the scene or the solver owns is rebuilt.

**Clicking the current scene is a no-op** (it closes the menu). Nobody should
be able to bin a settled 90-second spin-up by clicking the row they are already
on. `R` and `Clear drawing` remain the ways to restart in place.

## 3 · Drawn work, and the URL

**Inline warning, not `confirm()`.** Clicking a scene while anything is drawn
expands an amber block under that row:

> **Loading drops your drawing.** *M2 · drawdown to a free overfall* starts
> clean, so the 3 segments you have drawn and 1 gauge will be gone. Save it
> first with Controls → Rig → ⇪ Share link (or ⤓ Export JSON): the link
> rebuilds this rig exactly.
> `[ Discard and load ] [ Cancel ]`

with the counts filled in live. Reasons for not using a native dialog: it
cannot be screenshotted for a worksheet (`Page.captureScreenshot` does not
capture browser dialogs — the "confirm moment" shot below would not exist), it
cannot be styled, and on a lecture-theatre touch board it lands wherever the OS
decides. A **second click on the same row** also confirms, so the flow is one
extra click for the deliberate case. Cancel and Esc both keep everything.

The gate is on `sim.segs.length`, i.e. user-drawn geometry only (scene walls
live in `scene.walls()` and are never at risk). Gauges are named in the text
when present but do not by themselves raise the warning.

**URL policy.** `?scene=` and `#rig=` boot exactly as before — neither boot
path was touched. On a switch the bar is rewritten to `?scene=<new id>`
**with the hash dropped**:

- a reload then lands on what you are looking at, which is the least
  surprising reading of "reload";
- a stale `#rig=` cannot resurrect a rig you have explicitly left (verified,
  §4.5). `⇪ Share link` writes its own `#rig=` back whenever you next press it.
- `history.replaceState` is wrapped in `try` — on `file://` (opaque origin) it
  may refuse, and the picker must not care. Measured: this Chrome accepts it on
  `file://` too, and the whole feature works there (§4.7).

---

## 4 · Test evidence

`exercises/_runner/runner.py --id SCENEPICK`, visible Chrome, hardware GL
(ANGLE / RTX 2060). Runner closed at the end; zero orphan processes.

### 4.1 Enumeration — no hard-coding

Menu rows read back from the DOM and compared field-by-field with
`SCENES.list`:

```
rows 19 · registry 19 · mismatches [] · extras []
groups  Sandbox | Open channel — surface profiles | Pressure & transients | Jets & waves
ids     sandbox m1 m2 m3 s1 s2 s3 c13 h23 a23 hammer venturi dambreak jet
        wave wavesurge wavedeep waveshallow plan
highlighted ["m1"] (booted ?scene=m1)   first row: sandbox
```

Every `name`, `key` and `blurb` matches the registry string for string.

**Throwaway proof (not committed):** a scene object pushed onto `SCENES.list`
at runtime with a new `group`:

```
rows 20 · last "zztest" · name "ZZ · runtime test scene"
groups … + "Test rig"   header "20 · Esc closes"
after popping it again: rows 19, row absent
```

The menu is rebuilt from the registry on every open; nothing was added to
`js/scenes.js`.

### 4.2 Switch fidelity — in-place vs a fresh boot

Booted `?scene=m1`, clicked the **h23 row in the menu DOM**, then navigated to
a fresh `?scene=h23` and hashed both (FNV-1a over `sim.mask`; canonical
key-sorted JSON of `sim.p` minus the transient `pour`):

| | in-place switch | fresh `?scene=h23` |
|---|---|---|
| mask hash | `eac63e9c` | `eac63e9c` |
| solid cells | 22 301 | 22 301 |
| param hash | `49f68b06` | `49f68b06` |
| grid | 667×142, Δx 11.244 mm, 7.5000×1.5967 m | identical |
| drawn segments | 0 | 0 |
| UI state hash (mode, channel, labels, jumps, particles, dye, speed, gaugeField, tracerN, paused, gauges, rakes, tracers, zoom, vex, budget, spin-up) | equal | equal |
| valve button lit | false | false |
| title box | "Hydraulic jump on a level apron" | identical |
| URL after | `?scene=h23`, no hash | `?scene=h23` |

**All nine compared fields equal.** Jump box after `pump 25` on each, median of
9 EMA-warmed reads:

```
in-place    Fr₁ 1.949   y₁ 0.190   y₂ 0.437   y₂ᵖ 0.438   (−0.2 % on Bélanger)
fresh boot  Fr₁ 1.891   y₁ 0.194   y₂ 0.461   y₂ᵖ 0.447   (+3.1 %)
```

Both medians sit inside the required 1.7–2.4 band, and the spread between the
two runs (Fr₁ 1.53–2.76 across individual reads) is h23's own documented
turbulent flutter, not a difference between the two load paths — which the
identical hashes settle independently.

### 4.3 Reverse switch h23 → m1 (through the **panel row** this time)

```
opened from the panel row: yes      menu closed after the click: yes
paused BEFORE the switch: true  ("▶︎ Run")  →  after: false ("❚❚ Pause")
hint line: "The weir is the control; the curve is computed ups…"  (m1's own tip)
panel row: "M1 · backwater behind a weir  ▾"   note: "?scene=m1 · Mild, zone 1"
URL: ?scene=m1
```

Settled to t = 66 s (m1's spin-up is 30 s; GV-1 measured at t ≈ 56 s), then
GV-1's own protocol — 8 samples over ~6 sim-s, median:

```
profile chips: ["M1@0.0-12.9m"]        one clean M1 run, as GV-1 reports
surface at x = 6.996 m: 0.89193 m      GV-1 verification record: 0.89111 m
difference 0.82 mm = 0.06 Δx           (Δx = 13.3 mm) — well inside one cell
```

### 4.4 Sandbox protection

Sandbox + 3 drawn strokes + 1 gauge, 6 s of flow, then a click on the M2 row:

```
warning shown: yes   pending: "m2"   buttons: ["Discard and load", "Cancel"]
scene still sandbox · segments still 3 · menu still open
text: "Loading drops your drawing. M2 · drawdown to a free overfall starts
       clean, so the 3 segments you have drawn and 1 gauge will be gone. Save
       it first with Controls → Rig → ⇪ Share link (or ⤓ Export JSON): the
       link rebuilds this rig exactly."
Cancel  → warning gone, menu open, scene sandbox, 3 segments, 1 gauge,
          3281 solid mask cells (unchanged)
Esc     → menu closed, scene sandbox, 3 segments
2nd click on the same row / "Discard and load"
        → scene m2, 0 segments, 0 gauges, t = 0, URL ?scene=m2
```

### 4.5 Routes

```
A  ?scene=venturi          → venturi booted, menu highlights venturi (CURRENT), 19 rows
B  bare #rig=<425 chars>   → boots sandbox then the rig moves it: scene venturi,
   (no ?scene= at all)       menu highlights VENTURI (the rig's base scene),
                             2 rig segments restored,
                             "rig loaded: 2 segments · scene venturi"
C  switch away to m3       → warned first (the rig has segments), then loaded:
                             URL "?scene=m3", location.hash "" 
   location.reload()       → m3, 0 segments — the rig does NOT come back,
                             menu highlights m3
```

### 4.6 Regression gate

```
gauge inspector after a switch   window opens, "Gauge 1", 93 samples,
                                 span 10.9 s → 22.6 s, head 0.5433 m live,
                                 panel inspector row: 2 buttons (gauge + CSV)
rig share round-trip on sandbox  before: 2 segments, 1 gauge, 3311 solid cells
  → switch away (jet) → back     away: 0 segments (as designed)
  → RIG.load(link)               after: 2 segments, 1 gauge, 3311 solid cells
                                 "rig loaded: 2 segments · 1 gauge · scene sandbox"
```

Mask cell count identical before and after — the rig rebuilds bit-for-bit
across a scene switch.

### 4.7 Keyboard, click-away, `file://`

```
S opens · Esc closes
with the menu open: C R Space 3 G Z all swallowed
  segments 2 → 2 · mode 0 → 0 · paused false → false · tool wall → wall
↓↓ highlights the second row (m1)
click-away on the canvas: menu closed, APP.state.drag null, segments 2 → 2;
  the NEXT click draws normally (2 → 3)
title box: click opens (box + bar button both lit), click closes; bar button opens
file:///…/index.html?scene=m3 → protocol "file:", 19 rows, picked "Orifice jet"
  → loaded, menu closed, title "Orifice jet", URL followed to ?scene=jet
```

---

## 5 · Screenshots

| file | shows |
|---|---|
| `SCENEPICK-01-menu-open.png` | the menu open from the title box on m1, 1236×769 (the ordinary case: it scrolls) |
| `SCENEPICK-02-drawn-warning.png` | **the confirm moment** — sandbox with 3 strokes and a gauge, the amber inline warning under the M2 row, Discard/Cancel; the panel's new Scene row visible on the left |
| `SCENEPICK-03-menu-full-list.png` | all 19 scenes and all 4 group headers in one frame (tall viewport, no scrolling) |
| `SCENEPICK-04-after-switch-fullui.png` | h23 settled at t = 27 s **after an in-place switch from m1**: jump box, S3/H2 chips, title box and panel Scene row both showing the new scene |
| `SCENEPICK-05-file-protocol.png` | the same menu over `file://`, having just loaded the Orifice jet |

---

## 6 · Notes for the next worker

- `PICKER` is a top-level `const`, so like `CONTROLS` and `syncPanel` it is
  reachable **bare** from a rig script but is *not* on `window`. Use
  `APP.PICKER` / `APP.switchScene(id)` from a runner `eval`
  (`window.PICKER` is `undefined` — this cost one test run).
- `APP.switchScene(id)` is the scripted equivalent of picking from the menu and
  returns `false` for an unknown id. `APP.loadScene(id, keep)` is unchanged and
  still does exactly what it did, so the twelve `rig.js` scripts that call it
  are untouched.
- The title box is now a click target. It sits over the top-right corner of the
  canvas, so drags starting inside it no longer draw — deliberate, and the box
  is small. Gauge corner cards stack from the **bottom** right, so nothing is
  covered.
- Pre-existing and *improved*, not introduced: at narrow widths the top bar can
  run under the title box (at 1236 px the Controls/About buttons sit beneath
  it). Replacing the wide `<select>` with the `Scenes ▾` button pulled the bar
  ~156 px in, so the overlap now starts at a much narrower window than before.
  A real fix wants the bar to know the title box's width; out of scope here.
- The panel's Scene button truncates long names with an ellipsis at 190 px; the
  note underneath always prints `?scene=<id> · <key>`, which is also the string
  a worksheet wants to quote.
