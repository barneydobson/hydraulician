# RIGSHARE — save / share a drawn rig (P13)

Authorised change: the feasibility sheet's shopping-list #1, re-voted as
**P13** in `CHANGES-NEEDED.md` — *"Save / share drawn rigs (segment list →
JSON or URL hash) … Small; pure CPU-side, no solver contact."*

**Files touched:** `js/main.js` (the `RIG` module, one panel section, one
`type: "custom"` panel-row kind, six lines in `boot`), `index.html` (CSS for
the section). **`js/sim.js` untouched** — the segment list is already reachable
as `sim.segs` and `SIM.rasterise()` is already a public entry point, so no
accessor was needed. No solver, shader or numerics contact of any kind.

---

## 1 · What shipped

A **Rig** section at the bottom of the Controls panel:

| control | does |
|---|---|
| `⇪ Share link` | builds `…#rig=<code>`, writes it to the clipboard **and** into the box, and puts it in the address bar (`history.replaceState`) |
| `⤓ Export JSON` | downloads `hydraulician-rig-<scene>-<n>seg.json` |
| the box | the copyable fallback when the clipboard is unavailable, and the paste target for loading |
| `⇧ Load box` | loads whatever is in the box: a share URL, a bare code, or raw JSON |
| `⇧ Open file` | file picker, `.json` |
| status line | `rig loaded: 14 segments · 2 gauges`, or `share link ready · 506 characters`, or the live `5 segments · 2 gauges drawn on sandbox` |

Programmatic entry points (`APP.RIG`, and the bare global `RIG` the way rig.js
scripts already use `CONTROLS` / `syncPanel`):

```js
RIG.snapshot()            // -> the rig object
RIG.toText(o, pretty)     // -> JSON string     RIG.encodeSync(o) -> "A…" code
RIG.encode(o)             // -> Promise<code>   RIG.decode(code)  -> Promise<obj>
RIG.link()                // -> Promise<url>    RIG.share()       -> Promise<url>
RIG.load(anything)        // -> Promise<status> : URL | code | JSON text
RIG.apply(obj)            // -> status (sync)   RIG.exportJSON()  -> {name, text}
```

Screenshots: `RIGSHARE-01-panel-section.png` (the section, empty state),
`RIGSHARE-02-share-box.png` (after Share — the link in the box, the
"clipboard blocked" fallback message, the char count),
`RIGSHARE-03-loaded-from-link.png` (a rig arriving from a link: toast, status
line, both gauges restored and already plotting),
`RIGSHARE-04-file-protocol.png` (the same rig loaded over `file://`).

---

## 2 · Format spec (v1)

```json
{
 "v": 1,
 "scene": "sandbox",
 "segs": [
  [0.6,2.5,7.2,2.5,1.1,0],
  [0.6,3.2,7.2,3.2,1.1,0],
  [1.5,1,9.3,1,2,255],
  [1.5,2.55,9.3,2.55,0.3,255],
  [1.5,2.4,1.5,5.2,0.12,255]
 ],
 "open": [1,1,0,0],
 "valveClosed": 1,
 "inflow": {"on":1,"free":1,"level":3.3,"q":0.25},
 "tailwater": {"on":1,"level":2.5},
 "source": {"on":0,"x":0.55,"y":4.55,"r":0.14,"vx":1.1,"vy":-1.4},
 "wave": {"on":0,"amp":0,"period":1.5,"x":0.15},
 "hyd": {"c":22,"cf":0.02,"cs":0.4,"bulk":0.1,"ca":0.6,"nu":0.00001,"slip":0,"g":9.81},
 "dye": {"line":0,"decay":0.02},
 "gauges": [[4,2.2],[8.5,2.2]],
 "rakes": [],
 "ui": {"mode":1,"field":"head","speed":1,"channel":0,"labels":0,"jumps":0,"particles":0,"dye":1}
}
```

That is RIG-A verbatim, as `⤓ Export JSON` writes it (693 characters). One line
per top-level key and **one line per drawn stroke**, deliberately: a rig file is
meant to be readable and hand-editable, and `JSON.stringify(o,null,1)` turns
five strokes into eighty lines of digits.

| field | meaning |
|---|---|
| `v` | format version. `migrate()` refuses a file whose `v` is newer than the build; a future v2 converts here so links printed on this year's worksheets keep working. |
| `scene` | base scene id. Applied with `loadScene(id, false)`, so a non-sandbox rig round-trips onto its own scene. An unknown id falls back to `sandbox` and says so in the status line. |
| `segs` | `[x0, y0, x1, y1, thickness, kind]` in **metres**, exactly `SIM.addSeg`'s arguments. `kind` = 255 wall, 128 valve, 0 erase. Order is preserved because it is load-bearing — an erase stroke only removes what was stamped before it. |
| `open` | the four edge modes, `[L, R, B, T]`, 0 wall / 1 open / 2 outfall. |
| `valveClosed` | the V-key state. |
| `inflow` / `tailwater` / `source` / `wave` | the level controls, the spout and the piston. **Merged onto the scene's own objects**, so a key the rig does not carry (a scene that pins an inlet velocity `v`, say) keeps the scene's value. `inflow.v` is written out when the live scene has one. |
| `hyd` | every Hydraulics slider plus `nu` and `g` (the plan-view toggle). |
| `dye` | `dyeLine` / `dyeDecay`. |
| `gauges` / `rakes` | instrument placements, `[x, y]` and `x`, metres. Capped at the tools' own limits (4 gauges, 2 rakes) on load. |
| `ui` | the display state that is genuinely part of a recipe — field, gauges-plot field, speed, and the four overlay toggles. FR-1's card sets `mode: 1` and turns the channel overlay off; that IS the rig. |
| `tracers` | optional `[x, n, trailSeconds]`, written only when a tracer column exists. |

**Numbers are rounded to 1 µm.** Not cosmetic: B10's staircase snaps its step
boundaries to cell centres on purpose (a boundary landing exactly on one is
claimed by both neighbouring steps and pinches the bore a whole step deep), and
at Ultra Δx is ~2.6 mm. At 0.1 mm the B10 round trip came back with an identical
mask but a *different* segment list; at 1 µm every stored coordinate is
bit-for-bit what was drawn, to 0.04 % of the finest cell, and
`JSON.stringify` still prints `1.5` as `1.5`.

### Deliberately NOT stored

- **The water.** A rig is a rig, not a snapshot. `apply()` ends with
  `SIM.resetWater()` — the R key — so the scene's initial water lands on the
  *new* geometry and any `spinup` countdown runs against the rig you just
  loaded rather than against the base scene. A stored velocity/fill field would
  be megabytes and would still need the same settle time to mean anything.
- **View / zoom / pan / vertical exaggeration.** The domain is a fixed physical
  rectangle; the letterbox is a pure function of the window (measured, §3.5).
- **Resolution.** It is a property of the machine you are viewing on, not of the
  rig — physical coordinates re-rasterise at any Δx (measured, §3.3), and
  baking `Ultra` into a link a lecturer hands to thirty laptops is a trap.
  A link always opens at the reader's own Resolution setting.
- **Gauge histories.** Placements only. The deep `log` store the inspector
  reads is up to 20 000 samples per gauge; loading a rig starts fresh traces.

### Wire format

`#rig=<tag><base64url>`, one tag character:

- `A` — plain UTF-8 JSON. Always available.
- `B` — raw deflate (`CompressionStream("deflate-raw")` — a platform API, not a
  dependency), then base64url. `RIG.encode` tries `B` and silently falls back
  to `A`; `RIG.decode` reads either, and tolerates a hand-trimmed code with the
  tag lost.

---

## 3 · Test evidence

Runner: `--id RIGSHARE`, visible Chrome, hardware GL, one instance
(`RIGSHARE2` was launched only for the `file://` and window-size tests and
closed immediately). The fidelity measure throughout is an **FNV-1a hash of
`sim.mask`** — the rasterised solid mask itself, the thing uploaded to the `S`
texture — plus wall/valve cell counts and 20 further state keys.

### 3.1 Round-trip fidelity, RIG-A → link → fresh page load

RIG-A built with `exercises/FR-1-friction-law/rig.js` (`RIGA.build()`), shared,
then loaded in a freshly booted document from the URL alone:

| | hand-built | loaded from `#rig=` |
|---|---|---|
| mask hash | `96a21bc5` | **`96a21bc5`** |
| wall cells | 37 725 | **37 725** |
| segments | 5 | 5 |
| `open` | `1,1,0,0` | `1,1,0,0` |
| inflow (on, head-driven, level, q) | `1,1,3.3,0.25` | same |
| tailwater | `1,2.5` | same |
| spout / piston / hyd / dye / valve | — | all identical |
| gauges | `4.00/2.20  8.50/2.20` | same |
| ui (mode, field, speed, overlays) | `1,head,1,0,0,0,0,1` | same |

All 24 fingerprint keys identical. Status line on arrival:
`rig loaded: 5 segments · 2 gauges · scene sandbox`.

**Physics spot check** on that URL-loaded rig (FR-1's own protocol: 22 s settle,
12 s of recorded gauge history, level 3.30 = digit d = 0):

| | FR-1 README | measured from the link |
|---|---|---|
| V (bore mean) | 2.35 m/s | **2.296 m/s (−2.3 %)** |
| h_f | 0.081 m | 0.0791 m (−2.3 %) |
| H₁ / H₂ | 2.580 / 2.499 m | 2.575 / 2.496 m |
| bore full? | yes | yes (0.3897 of 0.3913 m) |

Inside ±5 %. (An earlier identical run on the same link read V = 2.323, −1.1 %;
the spread is the run-to-run wobble FR-1 documents, not the link.)

### 3.2 JSON export → clear → import, hand-drawn rig

Drawn with `SIM.addSeg`: four walls, **a valve stroke**, **an erase stroke**, a
moved spout (0.09 m, +0.85 / −2.10 m/s), a tailwater at 1.85 m, an open top
edge, seven hydraulics sliders off their defaults, dye timelines, speed ×0.35,
speed/Froude display state, **three gauges and a rake**. Exported (741
characters compact), then the drawing cleared and every control moved, then the
exported text imported through the same path the paste box uses:

| | before | wrecked | after import |
|---|---|---|---|
| mask hash | `e08bf4fc` | `e2aca596` | **`e08bf4fc`** |
| wall cells | 6 236 | — | 6 236 |
| **valve cells** | 216 | — | **216** |
| segments | 6 | 0 | 6 |

`identical: true` across all 24 keys — the erase stroke, the valve, the spout
vector and the rake all came back.

### 3.3 Resolution survival

The RIG-A link loaded at Medium, then Resolution flipped Low → High. 20 s settle
on each grid, then 6 s more to check steadiness:

| Resolution | grid | Δx | segs | bore | full? | V | reservoir surface | volume drift |
|---|---|---|---|---|---|---|---|---|
| Medium (as loaded) | 414×230 | 21.7 mm | 5 | 18 cells = 0.391 m | yes | 2.11 m/s | 3.02 m | −0.03 %/s |
| **Low** | 285×158 | 31.6 mm | 5 | 13 cells = 0.411 m | **yes** | 2.28 m/s | 3.10 m | −0.006 %/s |
| **High** | 561×312 | 16.0 mm | 5 | 25 cells = 0.401 m | **yes** | 2.28 m/s | 3.05 m | +0.05 %/s |

Sealed at all three: the reservoir holds ~3.0–3.1 m of surface (it would drain
to the floor through a leaking invert) and the pipe runs full at 2.1–2.3 m/s.
The bore's **cell count** changes 13 → 18 → 25 while the physical bore stays
0.40 ± 0.01 m — the documented quantisation (UN-1's nozzle rungs), not a loss.

### 3.4 URL size — and the deflate decision

Measured on the three biggest rigs in the pack, each built by its own `rig.js`:

| rig | strokes | JSON | plain b64 (`A`) | **deflate b64 (`B`)** | saving | full URL |
|---|---|---|---|---|---|---|
| RIG-A duct (FR-1/LL/PU/B7) | 5 | 645 | 861 | **484** | 44 % | **521** |
| B10 hump, crest 2.65 | **39** | 2 114 | **2 820** | **951** | 66 % | **988** |
| B10 hump, crest 3.05 | 39 | 2 114 | 2 820 | 960 | 66 % | 997 |
| CS-1 CSO chamber | 7 | 675 | 901 | **500** | 45 % | 537 |

**The deflate path is load-bearing and was implemented.** B10's 39-stroke
staircase is 2 820 characters as plain base64 — past the ~2 000 the brief set as
the line, and past what several mail clients and LMS text fields will keep on
one line. Deflated it is 951, and the whole URL 988. A staircase rig is mostly
repeated digits, which is exactly what deflate eats: 66 % off.

Honest limits: the `A` fallback (a browser without `CompressionStream`, i.e.
pre-2022 Chrome / pre-113 Firefox / pre-16.4 Safari) would put B10 at 2 820
characters. Browsers themselves cope with that (Chrome's practical URL ceiling
is ~2 MB, Firefox's ~64 k); the risk is intermediaries that wrap or truncate.
For those, `⤓ Export JSON` is the escape hatch. On this build every browser
tested produced tag `B`, including over `file://`.

### 3.5 Window size — letterbox unchanged

The same `file://` rig link opened in two window sizes:

| viewport | domain | grid | Δx | mask hash | drawn rect | m/px |
|---|---|---|---|---|---|---|
| 1236 × 769 | 9 × 5 m | 414×230 | 21.739 mm | `96a21bc5` | 1236 × 686.7 px | 0.00728 |
| **576 × 869** | 9 × 5 m | 414×230 | 21.739 mm | **`96a21bc5`** | 576 × 320 px | 0.01563 |

Automatic, as expected: the domain is a fixed physical rectangle and only the
letterbox moves. Nothing about the view is in the format.

### 3.6 `file://` (no server)

`file:///…/index.html#rig=<code>` opened directly in a fresh Chrome:

- rig loaded — mask hash `96a21bc5`, identical to the `http://` and hand-built
  versions; status line and toast as normal.
- `CompressionStream` present, so the `B` (deflate) code decoded on `file://`.
- `⇪ Share link` produced a `file:///…#rig=` link, 534 characters, into the box.
- **the clipboard is unavailable** (`file://` is not a secure context), the
  fallback fired, and the message reads
  `clipboard blocked — copy it from the box`. The box holds the exact URL
  (verified byte-equal to the returned link) and is selectable.
  `RIGSHARE-04-file-protocol.png`.

Worth noting: the same message appears on `http://localhost` when the tab is
not focused (Chrome requires document focus for a clipboard write). The box is
therefore not an exotic fallback — it is the normal path in a lecture theatre
where the click landed on a projector-mirrored window.

### 3.7 Regression gate

**`?scene=h23` boot unchanged.** Same 25 s pump, same 90-window median protocol,
run on the pristine build (files reverted with `git checkout`) and on the new
build:

| build | samples | Fr₁ | y₁ | y₂ | y₂ᵖ | y₂/y₂ᵖ |
|---|---|---|---|---|---|---|
| pristine | 88/90 | 1.910 | 0.196 | 0.457 | 0.437 | 1.046 |
| with RIG | 88/90 | 1.855 | 0.198 | 0.457 | 0.437 | **1.046** |

y₂, y₂ᵖ and the Bélanger ratio are identical to three decimals; Fr₁ and y₁ move
by 2.9 % and 1 %, inside the flutter CLAUDE.md documents for this box
(single-frame reads range 1.4–2.5). Boot state also checked: scene `h23`,
0 segments, `RIG.note` empty, no hash.

**Sandbox boot unchanged.** `index.html` with no query and no hash: scene
`sandbox`, 0 segments, spout on at (0.55, 4.55), `open = 0,0,1,0`, mode 0,
7 tips, 2 scene walls, status line
`nothing drawn yet — Share still captures the panel settings`.

**Z-undo after a load, and after load-then-clear:**

| step | segs | mask |
|---|---|---|
| rig loaded from a link | 5 | — |
| `Z` once | 4 | changed (the last loaded stroke really went) |
| `C` (clear) | 0 | — |
| draw 3 fresh strokes | 3 | — |
| `Z` | 2 | back to the 2-stroke mask exactly |
| `Z` | 1 | back to the 1-stroke mask exactly |
| `Z` | 0 | back to the empty mask exactly |
| `Z` again | 0 | no-op |

---

## 4 · Semantics decisions, stated plainly

1. **Loading REPLACES the drawn segments.** `sim.segs` is emptied and refilled
   in one go, then `SIM.rasterise()` runs once (not once per stroke). Scene
   walls are untouched — they are not in `segs` and never were, which is why a
   rig that must cut through them carries its own erase strokes, exactly as
   `RIGA.build()` does today.
2. **The undo stack is NOT fresh — the loaded strokes become it.** `Z` pops the
   last loaded stroke, then the one before it, and `C` clears the lot. That is
   the same stack a hand-drawn rig leaves, so nothing new has to be explained
   in a worksheet; measured in §3.7. (A fresh stack was the other option and
   was rejected: it would make `Z` silently do nothing after a load, which
   reads as a bug.)
3. **Level controls hand their edges to the rig.** `apply` clears `autoL` /
   `autoR`, so an edge that arrives Open in the rig stays Open even if the
   reservoir toggle is later switched off. The rig's `open` array is the truth;
   the self-configuring toggles only apply to edges *you* have not set.
4. **`?scene=` is untouched, `#rig=` wins.** Boot loads `?scene=` (or the
   sandbox) first and *then* applies the rig, so a link whose code is corrupt
   leaves you on the scene you asked for with
   `rig NOT loaded — …` in the status line and a toast, rather than on a blank
   page. Decoding is asynchronous (deflate), so the rig lands a frame or two
   after boot.
5. **`Share` also rewrites the address bar** (`history.replaceState`, wrapped —
   `file://` may refuse). A reload then reproduces the rig, which is what
   "share" implies. There is no `hashchange` listener: editing the hash by hand
   requires a reload, deliberately, so that a load can never fire mid-drag.
6. **A rig applied over itself is idempotent** — the same JSON always produces
   the same mask, because `apply` starts from a clean `loadScene`.

## 5 · Follow-ups (not done here, by scope)

- The 40 demo READMEs can now carry a build LINK instead of (or beside) a
  build card, and `rig.js` files can be reduced to their measurement helpers.
  That is the director's call and a separate pass — no demo folder was touched.
- P8 (per-valve toggling) would want a `valves: [...]` state block in v2; the
  version gate is already there for it.
- If a future rig ever needs to pin Resolution (a demo whose gap is 1 cell at
  Medium and 2 at High), add `res` as an OPTIONAL v2 field applied only on an
  explicit import, never on a link. Deliberately not done now.
