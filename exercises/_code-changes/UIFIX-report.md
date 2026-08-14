# UIFIX — panel/overlay changes from CHANGES-NEEDED.md §2

Worker: UIFIX. Territory: `js/overlay.js`, `js/main.js` only (no solver, no
`js/sim.js`, no `js/gl.js`, no `index.html` change needed — the two longer panel
notes wrap inside `#panel .notes` unchanged). All eight items applied. Verified
with `exercises/_runner/runner.py --id UIFIX` on hardware GL; runner closed at
the end. **Not committed** — director QC first.

Screenshots in this folder:

| file | shows |
|---|---|
| `UIFIX-01-m1-hover.png` | m1 at x = 7 m: new `x, y` + `surface` rows, M1 chip intact (P5) |
| `UIFIX-02-m1-x13-guardband.png` | m1 at x = 13 m: numbers present, no chip (P6) |
| `UIFIX-03-fr1-bore-hover.png` | FR-1 RIG-A mid-bore: no profile block at all (P1) |
| `UIFIX-04-fr1-panel-delivered.png` | panel: delivered level **and** delivered q (P3, P9) |

---

## Per item

### P1 · no free-surface/GVF block inside a pressurised conduit
**WHERE** `js/overlay.js:456–484` (`drawCursorReadout`).
**WHAT** The chip and the free-surface rows (`surface`, `Fr`, `y_c`, `y_n`, `S₀`,
`S_f`) are suppressed when the hovered cell is inside a pressurised conduit.
`depth h` (= the bore), `q`, `V`, `u, v`, `head p/ρg` and `fill f` stay.

The test is **not** `f > 1.002` alone, which was the proposal's wording: in this
EOS every submerged cell carries hydrostatic `f − 1 = g·d/c²`, so at m1's
`c = 22` a hover only 0.1 m under the free surface already reads `f = 1.002`
(measured, see the m1 rows below) and a bare fill test would have blanked the
GVF block over half of every channel scene. The condition used is *the water
body reaches its lid* (`mask` solid at the cell above `A.surf[i]`, i.e. FS_COL's
`soffit / obstruction` break) **and** `f > 1.002`.

**Evidence** — FR-1 RIG-A rebuilt from `exercises/FR-1-friction-law/rig.js`
(`RIGA.build()` → 414×230, D = 0.3913, 18 bore cells), settled 25 s, hover at
the pipe axis (6.00, 2.20):

```
x, y  6.00, 2.20 m | depth h 0.391 m | q 0.903 m²/s | V 2.31 m/s
u, v  3.58, -0.25 m/s | head p/ρg 0.376 m | fill f 1.008  pressurised
```
No chip, no `y_c`/`y_n`/`S₀`/`S_f`. `A.ok[i] = 1` there, so the old code drew a
chip (UN-1 reported "H2 profile") plus the whole GVF block.

m1 mid-reach unchanged, at two heights (t = 48.8 s, settled):
* (7.00, 0.80), `f = 1.002` → `M1 profile` + full block.
* (7.00, 0.40), deep, `f` well over the threshold → `M1 profile` + full block.
* (13.00, 0.72), `f = 1.003` tagged "pressurised" by the pre-existing fill row →
  block still shown, because the column is not capped. This is the case the
  naive fill test would have got wrong.

### P4 · Inflow q slider cap 1.2 → 2.0
**WHERE** `js/main.js:170`.
**EVIDENCE** DOM `c_inQ.max` = `"2"`; no scene default touched (m2 0.250, s1
1.200, s2 0.800 after UF-1's rule, h23 0.500 — all read back unchanged).
Sandbox sanity at q = 1.50 (flat bed y = 0.50, reservoir level 1.40, right edge
Open), 20 sim-s: 0 non-finite values in the 414-column reduction, 0 in 105
probes, max |u|,|v| = 2.57 m/s (rail is ±80), mid-reach h = 1.627 m, q = 1.354,
Fr = 0.21, class H2, volume 14.378 m². Runs sane.

### P5 · cursor position and surface elevation in the hover readout
**WHERE** `js/overlay.js:469` (`x, y` row) and `:472` (`surface` row, `bed + h`,
datum = domain floor, as GV-1 asked).
**EVIDENCE** m1, settled, hover at x = 7.00 m prints `x, y  7.00, 0.80 m` and
`surface  0.892 m above datum`. GV-1's recorded station value is **0.89111 m**
(median of 8 `SIM.columns(true)` samples). Re-measured here in the same protocol:
samples `[0.87781, 0.89111 ×5, 0.90441 ×2]`, median **0.89111**, printed row
**0.8918** — 0.7 mm, i.e. 0.05 cell. Bed elevation is deliberately not a second
row (it is `surface − depth`, both printed).

### P6 · numeric rows no longer gated on the classification ok-flag
**WHERE** `js/overlay.js:120–127` (`analyse` now also exports `out.onBed`, the
standing-on-solid test, separately from `ok`) and `:458–484` (numbers gated on
`onBed`, chip on `ok`).
**EVIDENCE** m1 at x = 13.0 m (inside the weir guard band): `A.ok = 0`,
`A.onBed = 1` → every number shows, no chip:
```
x, y 13.00, 0.72 m | depth h 0.597 | surface 0.757 | q 0.262 | V 0.44 | Fr 0.18
y_c 0.191 | y_n 0.326 | S₀ 1 : 71 | S_f 1 : 6 | u,v 1.00, 0.04 | head 0.136
```
One deviation from a literal reading of the item, `js/overlay.js:482–484`: the
`S_f` row prints the slope alone where `A.n[i]` is not finite. `analyse` only
computes `n` where `ok`, so an ungated row printed a literal `n = NaN` at exactly
the stranded stations this item is meant to serve.

### P9 · delivered q under head-driven inflow
**WHERE** `js/main.js:170–184` (note), `:664–685` (`sampleInlet`), `:617` (called
per frame), `:917–925` (`refreshNote`, on the 0.5 s status cadence).
**WHAT** `state.deliv` holds an EMA (0.05/frame on top of `analyse`'s own
10%/frame) of `A.q` and `A.bed + A.h` over ten columns starting two cells clear
of the relaxation sponge (`scene.spongeIn`, else the shader's 10-cell default).
Under head-driven inflow the note becomes
`head-driven · q → 0.317 m²/s delivered  y_c = 0.209 m` — y_c from the measured
q, not from the inert slider.
**EVIDENCE** MO-1's rejected head-driven configuration, rebuilt from
`exercises/MO-1-gate-cv/rig.js`: `MOGATE.build({a:0.1522, q:0.33, level:1.19})`
(7-cell opening, confirmed `aCells: 7`), 20 s in q-mode, `inFree` on, then
settled. Panel note tracked **0.345 → 0.317 → 0.300** as it settled (t = 20 →
68 → 116 s) while `sim.p.inflow.q` stayed frozen at **0.330** throughout. MO-1's
recorded truth for this rig is **0.309 / 0.307** (approach / vena column).
Caveat worth recording: at t = 116 s this rig's own column q still spans
0.270 (x = 3.5) to 0.360 (x = 5.0), so the inlet-window read sits ~3% under
MO-1's approach-column number and the residual gap is the rig's non-uniformity,
not the readout. It is unambiguously a measurement, not the 0.330 set-point.
Cross-check on FR-1 RIG-A: note reads 0.873–0.892 m²/s delivered against
`V·D = 2.31 × 0.3913 = 0.904` from the bore itself (−2%).
**Not done:** the delivered q is NOT appended in q-mode. `inflow.q` *is* what the
solver uses there, MO-1's shipped worksheet instructs students to read that note
as authoritative, and a second number beside it would only invite the wrong one
to be copied.

### P3 (display variant) · delivered reservoir level beside the slider
**WHERE** `js/main.js:161–169`.
**WHAT** The level note gains `· delivering 3.08 m` whenever a measurement
exists (same window as P9). Slider = target, note = what the sponge actually
holds.
**EVIDENCE** FR-1 RIG-A at the default level: `3.30 m above datum · 3.28 m deep
at the inlet · delivering 3.08 m` → **0.22 m** short, inside P3's documented
0.16–0.30 m band (`UIFIX-04`). MO-1's head-driven rig: `1.19 … · delivering
1.06 m` (0.13 m short; MO-1 gauged 1.1125 m at x = 3.5 m — the extra 0.05 m is
the near-inlet drawdown between the two stations).

### P10 · reservoir / tailwater edge auto-restore
**WHERE** `js/main.js:140–158` (reservoir), `:186–199` (tailwater), `:230–232`
(edge selects clear the ownership flag). Flags `p.autoL` / `p.autoR` live on
`sim.p`, so they survive a resolution rebuild like every other live parameter.
**EVIDENCE** sandbox, all edges Wall:

| step | `p.open` | flag |
|---|---|---|
| start | 0,0,0,0 | autoL 0 |
| reservoir ON | **1**,0,0,0 | autoL 1 |
| reservoir OFF | **0**,0,0,0 | autoL 0 — left mask column solid **230/230** |
| tailwater ON | 0,**1**,0,0 | autoR 1 |
| tailwater OFF | 0,**0**,0,0 | autoR 0 |
| reservoir ON, then Left edge → Open **by hand**, reservoir OFF | **1**,0,0,0 | autoL 0 — scene/user setting is not overridden |

Volume hold (DA-2's papercut): sandbox filled from the reservoir, reservoir
switched off (edge auto-restored), settled 25 s, then 20 sim-s measured —
**−0.005%** (9.7481 → 9.7476 m²). The same still tank with the edge left Open
reads −0.015%: a still pond does mostly just sit against a zero-gradient edge,
so DA-2's ~2% is a *through-flow* bias (their drain), which this removes at
source. I did not re-run DA-2's drain ladder to re-measure the 2% itself.

### P11 (reset variant) · stale normal-depth EMA cleared on re-rasterisation
**WHERE** `js/overlay.js:230–241` (`resetEstimates`, exported at `:683`) and
`js/main.js:951–958` (wraps `SIM.rasterise / addSeg / undoSeg / clearSegs`).
Clears `_ynK`, `_hA`, `_qA`. Wrapped in main.js rather than added to
`rasterise()` because `js/sim.js` is another worker's territory this pass; the
proper long-term home is one line in `SIM.rasterise`. A resolution change or a
scene load already starts clean (`SIM.build` makes a fresh `S`).
**EVIDENCE** GV-2's steep rig rebuilt in the sandbox (1-in-4 slab, ends
extrapolated past both edges, gate at x = 1.2, reservoir q = 1.20):

* clean 0.15 m opening, settled 26 s → `_ynK` 0.16498, chips `S1 / S3 / S3 / S2`.
* re-cut the gate (`addSeg` ×2 = a re-rasterisation) → `_ynK` **NaN**
  immediately; one frame later re-derived to **0.16505** (+0.04%): the reset
  costs nothing where the domain has not really changed.
* the mechanism, isolated: with a stale constant forced back in
  (`_ynK = 0.55`, the kind of value a different rig leaves behind) the same
  settled steep reach relabels **M1 / M3**, y_n 0.613 against y_c 0.482 — GV-2's
  exact complaint, on a bed that is visibly 1-in-4. Freshly derived
  (`_ynK = 0.1869`) the same frame reads `S1 / S3 / S3 / S2`, y_n 0.299 < y_c
  0.482. The EMA is 0.06/call, so a bad constant needs ~30 calls to decay —
  which is why resetting beats waiting.
* no chip churn on settled scenes: m1 at t = 43 s, `SIM.rasterise()` called by
  hand → `_ynK` 0.09093 → NaN → 0.08858 (−2.6%), y_n at x = 7 m 0.3783 → 0.3685
  (−2.6%), chips `M1, M2` before and after.

GV-2's cold-start drowning was not reproduced literally (re-gating a running rig
to 0.35 m stayed S3 rather than drowning) — the A/B above isolates the same
mechanism deterministically instead.

---

## Regression gate

| check | result | reference |
|---|---|---|
| h23 at defaults, warmed jump box, median of 20 reads over ~7 s | **Fr₁ 2.019** (single frames 1.59–2.74), y₁ 0.190, y₂ 0.454 | band 1.7–2.4 ✔ (CLAUDE.md 2.24 / 0.416; HJ-1 documents 1.4–2.5 single-frame flutter) |
| m1 M1 chip | `profileRuns` → `M1 0.0–12.9` (t = 55 s) and `M1, M2` (t = 43 s) | present ✔ |
| m1 surface at x = 7 m | printed 0.8918, 8-sample median of raw `surf` 0.89111 | GV-1's 0.89111, within 0.05 cell ✔ |
| s2 y_n at x = 3.5 m, q = 0.80, settled 26 s, median of 15 | **0.2384** (0.2300–0.2512) | UF-1 d = 0 row 0.2359 → **+1.06%**, inside ±2% ✔ |
| 7-scene smoke test (hammer, venturi, jet, m2, s1, wavedeep, c13) | 0 exceptions, notes render | — |

## Not done / deliberate choices

1. **q-mode keeps its set-point note only** (P9 scope) — reasons above.
2. **`bed` elevation row** not added (P5) — `surface − depth`, both printed.
3. **P11 reset lives in a main.js wrapper**, not in `SIM.rasterise`, purely to
   stay out of `js/sim.js` this pass. Recommend the maintainer fold it into
   `rasterise()` and drop the wrapper when the two edits meet.
4. **P11's reach-local y_n** (the fuller half of GV-2's proposal) not attempted —
   that changes what the classification means, well past a display fix.
5. **DA-2's 2% drain bias not re-measured** — the still-tank hold and the
   restored mask are the evidence offered.
6. `exercises/_director-status.md` shows as modified in `git status`; that is not
   mine.
