# GAUGE — gauge history that survives a pause, a draggable inspector, CSV

Worker: GAUGE. Territory: `js/main.js`, `js/overlay.js`, `index.html` (no
solver, no `js/sim.js`, no `js/gl.js`, no `js/shaders.js`, no scene file).
Verified with `exercises/_runner/runner.py --id GAUGE` on hardware GL, plus a
second instance (`--id GAUGEPRE`) running the **pre-change build** from a
`git archive HEAD` copy for the before/after comparisons. Both runners closed.
**Not committed** — director QC first.

Maintainer's ask, in their words: *"a slightly better gauge UI, the fact that
things disappear is quite annoying — a little draggable window to inspect
current or historic gauged data would be grand. Also a little download to csv
button."*

## Evidence in this folder

| file | shows |
|---|---|
| `GAUGE-01-inspector-open.png` | one inspector over the running hammer scene, crosshair on the Joukowsky plateau |
| `GAUGE-02-two-inspectors.png` | two windows (gauge 1 on head, gauge 2 on depth), CSV buttons, ⤢ affordances on the corner cards |
| `GAUGE-03-panel-row.png` | the panel's new **Gauge inspector** row: one button per gauge + ⤓ CSV |
| `GAUGE-04-cornercard-after-30s-pause.png` | the corner cards after 30 real-s paused — the trace is still there |
| `GAUGE-05-deep-history.png` | 2 929 samples / 64.6 sim-s in the inspector while the corner card behind it shows only its recent window |
| `GAUGE-06-cornercard-pre.png`, `GAUGE-07-cornercard-post.png` | corner-card regression: **identical md5** (`ab17b0a5…`) |
| `GAUGE-hammer-squarewave.csv` | the exported square-wave run (607 rows × 7 columns), as downloaded by the button |

---

## 1 · Stop the disappearing

**WHERE** `js/main.js` — `sampleGauges()` (was one unconditional push per
rendered frame).

**WHAT** Sampling is gated on the sim clock: nothing is appended while
`state.paused`, and nothing is appended twice for the same `sim.t`.

```js
if (state.paused) return;
if (sim.t < state.gaugeT) clearGaugeHistory();   // clock restarted (R, rebuild)
if (!(sim.t > state.gaugeT)) return;
state.gaugeT = sim.t;
```

Because `sim.t` does not advance while paused there is **no gap to bridge** on
resume — the series continues from the sample before the pause, and the
`t < gaugeT` line covers the other way the clock can move: `SIM.resetWater()`
called straight from a rig script (UN-1's does), or a resolution rebuild, both
of which zero `sim.t`. Without it the guard would have deadlocked recording
until the new run passed the old run's clock.

**EVIDENCE** — hammer, UN-1 recipe, valve slammed, then paused and left for 30
real seconds (the exact condition that used to wipe a trace):

```
realWaitS 30.01   rafFramesDuringPause 12748   fps 466
before  {simT 19.888218252050805, log 484, first 12.017020762918023,
         last 19.888218252050805, sum 12196.55525221519}
after   {simT 19.888218252050805, log 484, first 12.017020762918023,
         last 19.888218252050805, sum 12196.55525221519}
identicalHistory true      identicalChart true (card crop hash equal)
```

12 748 render frames went by. On the old build that is the 900-sample ring
overwritten **fourteen times**; at this frame rate a paused trace died in 2.1 s
(the docs' "~8 s" is the 60 fps figure — the runner's Chrome runs vsync-free).

**Continuity across the pause** (unpause, run 2 more sim-s):

```
lastBefore 19.888218252050805   firstAfter 19.904514727183567
joinGap    0.01629647513276211  medianGap  0.01629647513276211  → joinIsNormal true
monotonic  true, duplicate times 0
```

The join is indistinguishable from any other sample interval.

## 2 · Longer memory (corner cards untouched)

**WHERE** `js/main.js` — `CONFIG.logMax = 20000` and a second store per gauge.

**WHAT** Each sample object is pushed into **both** `gg.hist` (still capped at
`CONFIG.histMax = 900`, still the same objects, still what `drawGaugeCharts`
plots) and `gg.log` (capped at 20 000, oldest dropped). The corner-card code
path is byte-for-byte the same data it saw before, which is why the cards are
provably unchanged (below). `gg.log` is created lazily, so a rig script that
pushes a bare `{x, y, hist: [], colour}` gauge gets a deep store anyway.

**MEASURED sampling rate** — one sample per rendered frame, i.e. per
`tickFrame`, so it is set by the frame rate and the speed slider, not by the
substep count. Measured, both runs bit-uniform:

| scene | Δt between samples | samples / sim-s | 20 000 samples = |
|---|---|---|---|
| hammer, speed ×1 | 0.016296475 s (**one distinct value** over 607 samples) | 61.4 | 5.43 min |
| h23, speed ×1 | 0.016625616 s (**one distinct value** over 8 121 samples) | 60.16 | **5.54 min** |

Target ≥ 5 minutes: met. Memory is ~1.3 MB for four full gauges.

**History-depth test** — h23, 135 sim-s recorded through `APP.frames`:

```
samples 8121   hist 900 (cap held)   t 25.0167 → 160.0167 (135.00 sim-s)
distinctDt 1   monotonic true   duplicates 0
```

and the inspector reaches all of it — a 4-second window parked at t = 30, 60,
90, 120 and 155 s, hover-read each time, value **exactly equal** to the stored
sample in all five (`exact: true` ×5); double-click restored the full
25.02 → 160.02 span.

**Corner-chart regression.** Both builds were fed a bit-identical synthetic
900-sample trace (square wave + decaying ripple, two gauges) and the card stack
was cropped out of `#over` through the real draw path:

```
pre  : dpr 1, rect [896, 587, 330, 172], png 15258 B, hash 1939808815
post : dpr 1, rect [896, 587, 330, 172], png 15258 B, hash 1939808815
IDENTICAL PNG BYTES: True     (md5 ab17b0a5f7b52475dced11802cabf297 both)
```

Same size, same position, same pixels. The only change in `js/overlay.js` is
that `drawGaugeCharts` now **returns** the rects it drew (`{k, x, y, w, h}`)
so the DOM affordance can be parked without duplicating the layout arithmetic;
no drawing statement was touched.

## 3 · The inspector window

**WHERE** `js/main.js` — the `GINSP` IIFE (`show / hide / closeAll / tick /
draw / csv / download`), called once per frame from `drawOverlay`; CSS in
`index.html` (`.ginsp*`, `.gcardBtn`, `#panel .btnrow`).

**Gestures — how a student opens one (both documented on screen):**
* a small **⤢ button parked just outside the top-left corner of each corner
  card** (so no pixel of the card is covered — worksheet screenshots keep their
  cards intact);
* the panel's new **Gauge inspector** row: one small numbered button per live
  gauge, coloured to match its trace, plus **⤓ CSV** for everything.

**Contents.** Identity (gauge number, x/y in metres, trace colour); the three
sampled fields as live tiles with the convention spelled out — **H piezometric
head, z + p/ρg** / **h water depth of the column** / **|u| speed at the gauge
cell** — the selected one highlighted; H/h/|u| tabs choosing what the chart
plots (independent of the panel's "Gauges plot" select, so one window can watch
depth while the cards show head — UN-3's rule); a 380 × 158 chart of the **full
`log`**, time axis in sim-seconds with 1-2-5 ticks; footer with the two CSV
buttons and `N samples · t0 → t1`, which turns amber and appends `· frozen`
while paused; and a caption stating the gestures and the reset rule.

**Chart gestures** mirror the app's own view: wheel = zoom about the cursor
(trackpad pinch gets the app's stronger `ctrlKey` response), drag = pan,
double-click = fit all; the window is dragged by its header and clamped to the
viewport; × closes. Up to four windows, one per gauge, each remembering its
position for the session (re-opening lands where you left it). Sub-pixel runs
are collapsed to min/max spans, so 20 000 samples cost one segment per column,
not per sample.

**EVIDENCE** (all through synthesized DOM events):

```
drag        from [120,90] → [320,210]   dx 200  dy 120        (viewport 1236×769)
posMemory   closed at [320,210] → reopened at [320,210]
zoom        span 9.8757 → 2.4689 s, factor 4.000,
            t under the cursor 14.50146 → 14.50146  (drift 0)
pan         drag 100 px left → window +0.776 s, still inside the data
dbl-click   t0/t1 12.0170/21.8927 == data first/last
hover peak  read {t 13.97259777885374, H 42.49643457628536} == store, exact
hover plateau  t 14.3148 → H 40.394 ;  40.394 − 24.595 static = ΔH 15.80 m
```

That plateau read is the number UN-1's worksheet asks for: its README has
ΔH = 15.65 (plateau median), 15.90 (a student's hand read) and cΔv/g = 15.26
for this 3-cell gap. The absolute values also reconcile the two head
conventions in CHANGES-NEEDED §3: the gauge reads 24.595 m static against the
README's "21.09 m at the pipe axis" — the difference is exactly the gauge's
own y = 3.5 m, as documented, and the inspector labels it "piezometric head,
z + p/ρg" so nobody has to remember which is which.

Edge cases: a gauge with no samples draws "no history yet — press ▶︎ Run"; one
sample reads "1 sample"; a window whose gauge is dropped (5th gauge shifts the
oldest out) closes itself; loading a scene closes every window and clears the
panel row. The panel row also follows gauges pushed by rig scripts (the frame
loop re-syncs it when the gauge count changes).

## 4 · CSV

**WHERE** `js/main.js` — `GINSP.csv()` / `GINSP.download()`, exposed as
`APP.gaugeCSV(list)` (returns the text, downloads nothing).

Wide format, one row per sample time, three columns per gauge, header naming
gauge index + position + field, full round-trip precision (`String(v)`):

```
t_sim_s,g1_x30.00_y3.50_head_m,g1_x30.00_y3.50_depth_m,g1_x30.00_y3.50_speed_mps,
        g2_x54.00_y3.50_head_m,g2_x54.00_y3.50_depth_m,g2_x54.00_y3.50_speed_mps
12.017020762918023,24.594779696061096,2.889892578125,2.2547462819497537,…
```

Gauges are sampled in the same call, so their times are bit-identical and the
rows line up; a gauge dropped later simply has empty cells before its first
sample. Three buttons: **⤓ CSV this gauge** and **⤓ CSV all gauges** in each
window, **⤓ CSV** (all) in the panel. Files are named
`hydraulician-<scene>-g<k>.csv` / `hydraulician-<scene>-gauges.csv`.

**EVIDENCE** — the square-wave run exported by clicking the buttons, parsed off
disk (`GAUGE-hammer-squarewave.csv`):

```
hydraulician-hammer-gauges.csv   607 rows × 7 cols   t 12.0170 → 21.8927
  dt min/med/max 0.016296475 / 0.016296475 / 0.016296475   distinct dt: 1
  duplicate t: 0   monotonic: true   17 sig figs (24.594779696061096)
hydraulician-hammer-g2.csv       607 rows × 4 cols, same time column
in-page cross-check against the store: 0 value mismatches over 1 821 cells
```

The sample spacing is uniform **across the 30-second pause** — one distinct Δt
in the whole file, and no duplicate timestamps, which is the thing the freeze
had to deliver.

**Browsers.** Verified in the runner's Chrome (`Blob` + `a[download]`, file
lands with no prompt). **`file://` needs nothing special**: a second runner was
pointed at `file:///…/hydraulician/index.html?scene=hammer` — the app boots
(classic scripts, no modules, unchanged), the inspector opens (400 × 386),
`URL.createObjectURL` returns a `blob:` URL from the opaque file origin and the
CSV lands on disk (8 508 B). One browser caveat worth a worksheet line: Chrome
counts repeated *scripted* downloads from one page as "multiple automatic
downloads" and can suppress the second one; a real click carries user
activation and is not affected — but a demo harness that clicks the button
several times should expect it. The text is always available without the
button via `APP.gaugeCSV()`.

## 5 · R / scene-change semantics — the decision

**R (reset water) clears every gauge's history; loading a scene drops the
gauges entirely.** R restarts the clock (`sim.t → 0`), so the old trace cannot
be continued and must not be interleaved with the new one — a fresh run gets a
fresh record. This is what R already did to the corner cards; it now covers the
deep store too, and it happens **however the reset was triggered** (R key,
Reset water button, or a rig calling `SIM.resetWater()` directly).

Stated on screen, in the caption at the bottom of every inspector:
> *Wheel zooms the time axis about the cursor · drag pans · double-click fits
> all. History freezes while paused; **R** (reset water) and loading a scene
> clear it.*

**EVIDENCE**

```
before        log 180, t 28.051
R key path    log 0, hist 0, sim.t 0, gaugeT −1  → refilled 90 samples, monotonic
bare SIM.resetWater()  90 old samples (last t 9.2831) dropped automatically,
                       90 fresh recorded from t 0.0551, monotonic, no interleave
scene change  windows 0, DOM 0, gauges 0, gaugeT −1, panel row back to "⤓ CSV"
```

## 6 · Physics / harness regression gate

**Gauges record identical values.** The same deterministic script was run on
the pre-change build (file://, `git archive HEAD`) and the post-change build:
load h23, `SIM.step(ceil(20/dt))`, drop two gauges, `APP.frames(300)`, then the
HOWTO's warmed jump-box read, hashing every sample:

```
                 PRE                                 POST
t                25.985295298740365                  25.985295298740365
volume           2.524853716960468                   2.524853716960468
g0 (360 samples) hash 2773450006 / 27317 chars       hash 2773450006 / 27317 chars
g1 (360 samples) hash 3333881992 / 27232 chars       hash 3333881992 / 27232 chars
first sample     {t 20.016699239638097, head 0.7463054299233034,
                  depth 0.3823089599609375, speed 1.6826107308039822}  — identical
jump box         Fr₁ 1.73, y₁ 0.221, y₂ 0.432, y₂ᵖ 0.442   — identical
```

Every t / head / depth / speed is bit-identical, and so is the domain volume.

*On the h23 jump-box absolutes:* this settle protocol reads Fr₁ 1.73–1.92 and
y₂/y₂ᵖ within 1%, not CLAUDE.md's headline Fr₁ 2.24 — but the **pre-change
build reads exactly the same numbers**, and HJ-1's own remeasure documents this
box fluttering over Fr₁ 1.4–2.5 on a settled run. Nothing here is attributable
to this change; the median over 128 reads across 135 sim-s was Fr₁ 1.79,
y₂/y₁ 2.45.

**Canary: UN-1's `rig.js`, unmodified.** Run three times (twice across a full
page reload) exactly as its header prescribes — spin up with `step()`, record
with `frames()`:

```
UN1.student(0.42) → {gap {cells 3, m 0.4128}, c 70, v0 2.139, dH 15.90, joukowsky 15.26}
rig.js's documented result → {cells 3, c 70, v0 2.138, dH 15.90, joukowsky 15.26}
gauge log: 484 samples, gaps min = med = max = 0.016296 s, 0 duplicates, monotonic
```

The rig pushes bare gauge objects, calls `SIM.resetWater()` mid-script and ends
with `APP.state.paused = true; APP.frames(2)` — that trailing pair of frames
now appends **nothing** instead of two duplicate samples at a frozen clock,
which is the fix, and it does not disturb the rig (it reads `hist.slice(-1)`
before pausing). No rig.js pattern in the pack needed a change.

## Deviations / notes for the director

* The ⤢ affordance sits **outside** the corner card rather than on it. On the
  card it would have overlapped the right-hand `hi` value label by ~4 px, and
  the cards are in every shipped worksheet screenshot.
* The inspector's field tabs are per-window and do **not** move the panel's
  "Gauges plot" select (which still drives the corner cards). Deliberate: UN-3
  wants depth in the window while the cards keep head.
* `drawGaugeCharts` gained a return value; every existing caller ignores it.
* `syncPanel()` is now called from the frame loop when the gauge **count**
  changes (and after a Gauge-tool click), so the panel's inspector row tracks
  gauges pushed by rig scripts. It is a no-op frame to frame.
* `window.APP` gains `GINSP`, `inspect(k)`, `gaugeCSV(list)`,
  `clearGaugeHistory()`. Nothing was removed or renamed.
* Not applied, but noticed while measuring: at ×0.05 speed the *deep* store now
  holds ~5.5 min of sim time regardless, so CHANGES-NEEDED §3's "slow events
  need the speed slider UP" note is now only about the corner cards. §3's
  ring-buffer bullet and the "read the trace promptly" wording in the affected
  worksheets are stale once this lands — that is a docs call for the director,
  and I have not touched CHANGES-NEEDED.md or any demo folder.
