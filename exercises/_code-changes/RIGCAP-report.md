# RIGCAP — the drawn rigs, captured once as data

Deliverable: **`js/exercises-rigs.js`** (new file, 28 342 bytes, 659 lines,
`node --check` clean). Nothing else was touched — `js/main.js`, `index.html`,
`js/exercises.js`, `js/sim.js` and every demo folder are untouched, and nothing
is committed.

The picker worker gets two bare lexical globals, exactly to the agreed contract:

```js
const EXERCISE_RIGS      = { "FR-1": { /* RIG snapshot */ }, … };   // 26 entries
const EXERCISE_RIG_NOTES = { "UN-1": {control, how}, … };           // 6 entries
```

Both are `const` at classic-script top level, i.e. script-scoped globals in the
same way `SCENES` / `CONTROLS` / `RIG` already are — readable from another
`<script>` tag, **not** properties of `window`. Load it with a plain
`<script src="js/exercises-rigs.js"></script>` before whatever consumes it.
Each entry is the snapshot **object** (not a deflated `#rig=` code), so it is
diffable in review and a future format v2 migrates it in place. Hand it
straight to `APP.RIG.apply()`.

---

## 1 · What was captured, and how it was verified

Harness: `exercises/_runner/runner.py`, `--id RIGCAP`, visible Chrome, hardware
GL, **one instance, closed at the end, zero orphans**. To be immune to the
concurrent picker worker editing `js/main.js` underneath me, the pages were
served from a **frozen `git archive HEAD` copy** of `js/` + `index.html` on a
private port, not from the live tree. The RIG module is committed
(`a25db85`), so that is the same code the picker will run against.

Per exercise: boot the scene its README specifies → evaluate that folder's
`rig.js` verbatim → call its documented build → `APP.RIG.snapshot()`.

Fidelity measure (RIGSHARE's own): an **FNV-1a hash of `sim.mask`** — the
rasterised solid mask itself — plus wall/valve cell counts, grid, Δx, segment
count and 18 further state keys (`open`, `valveClosed`, inflow, tailwater,
source, wave, all eight hydraulics values, dye, gauge and rake placements, and
the eight `ui` fields).

Two independent verification passes, both clean:

1. **Payload round-trip** — fresh page boot at the default URL (no `?scene=`),
   `APP.RIG.apply(payload)`, re-fingerprint. 26/26 identical on every key.
2. **The emitted file itself** — `js/exercises-rigs.js` evaluated in one page,
   then every `EXERCISE_RIGS[k]` applied in turn and compared against the
   rig.js-built fingerprint. 26/26 identical. This is the one that matters:
   it tests the file as shipped, including its number formatting.

| key | scene | build call | captured | mask (rig.js) | mask (applied) | mask (from the file) | segs / wall / valve cells | payload | verdict |
|---|---|---|---|---|---|---|---|---|---|
| `FR-1` | sandbox | `RIGA.build()` | yes | `31e77052` | `31e77052` | `31e77052` | 5 / 37725 / 0 | 630 B | identical |
| `LL-1` | sandbox | `LL1.build()` | yes | `292fee6e` | `292fee6e` | `292fee6e` | 6 / 37725 / 0 | 662 B | identical |
| `LL-2` | sandbox | `LL2.build()` | yes | `31e77052` | `31e77052` | `31e77052` | 5 / 37725 / 0 | 630 B | identical |
| `PU-1` | sandbox | `PU1.build()` | yes | `209c96a9` | `209c96a9` | `209c96a9` | 7 / 26930 / 0 | 657 B | identical |
| `WE-1` | sandbox | `RIGB.build({plate:{x:6.5,P:0.50}, bedX1:6.525, q:0.35, level:1.326, gauge:4.5})` | yes | `2f4b82f5` | `2f4b82f5` | `2f4b82f5` | 4 / 7360 / 0 | 606 B | identical |
| `MO-1` | sandbox | `MOGATE.build({a:0.1522, q:0.33, level:1.2103})` | yes | `b3a182ca` | `b3a182ca` | `b3a182ca` | 4 / 8151 / 0 | 608 B | identical |
| `MO-2` | sandbox | `JETRIG.build(); JETRIG.flat()` | yes | `8e720511` | `8e720511` | `8e720511` | 2 / 964 / 0 | 524 B | identical |
| `HP-1` | hammer | `HP1.build(0.84)` | yes | `c0ff11a6` | `c0ff11a6` | `c0ff11a6` | 5 / 9731 / 63 | 607 B | identical |
| `HP-2` | sandbox | `JETRIG.build(); JETRIG.flat()` | yes | `8e720511` | `8e720511` | `8e720511` | 2 / 964 / 0 | 524 B | identical |
| `FB-1` | sandbox | `FB1.buildBase(0.35, 1.00, 1.00)` | yes | `20104a65` | `20104a65` | `20104a65` | 3 / 9936 / 0 | 575 B | identical |
| `FB-2` | sandbox | `FB2.build(0.35)` | yes | `b224865b` | `b224865b` | `b224865b` | 4 / 9234 / 0 | 626 B | identical |
| `DA-1@1` | sandbox | `DA1.build(1, 0.72)` | yes | `5fd8e5db` | `5fd8e5db` | `5fd8e5db` | 5 / 9874 / 0 | 694 B | identical |
| `DA-1@0.5` | sandbox | `DA1.build(0.5, 0.72)` | yes | `94f62d1d` | `94f62d1d` | `94f62d1d` | 4 / 4504 / 0 | 643 B | identical |
| `DA-1@0.25` | sandbox | `DA1.build(0.25, 0.72)` | yes | `0b885076` | `0b885076` | `0b885076` | 4 / 2299 / 0 | 643 B | identical |
| `DA-2@1` | sandbox | `DA2.build(1)` | yes | `36415c59` | `36415c59` | `36415c59` | 4 / 1908 / 56 | 618 B | identical |
| `DA-2@0.75` | sandbox | `DA2.build(0.75)` | yes | `74a3355b` | `74a3355b` | `74a3355b` | 4 / 1914 / 42 | 630 B | identical |
| `DA-2@0.5` | sandbox | `DA2.build(0.5)` | yes | `9c47c709` | `9c47c709` | `9c47c709` | 4 / 1776 / 26 | 621 B | identical |
| `DA-2@0.25` | sandbox | `DA2.build(0.25)` | yes | `89e31f3f` | `89e31f3f` | `89e31f3f` | 4 / 1926 / 14 | 629 B | identical |
| `QS-2` | sandbox | `QS2.build()` | yes | `b867b2b9` | `b867b2b9` | `b867b2b9` | 5 / 12524 / 160 | 638 B | identical |
| `UN-3` | hammer | `UN3.setup(0.98)` | yes | `ca43083f` | `ca43083f` | `ca43083f` | 6 / 10514 / 63 | 657 B | identical |
| `CS-1` | sandbox | `CS1.build({presses: 0})` | yes | `4de96445` | `4de96445` | `4de96445` | 7 / 2852 / 0 | 670 B | identical |
| `B8-sharp` | jet | *(scene default, nothing drawn)* | yes | `1e56250f` | `1e56250f` | `1e56250f` | 0 / 8142 / 0 | 480 B | identical |
| `B8-bellmouth` | jet | the BELLMOUTH paste block | yes | `e246c3f3` | `e246c3f3` | `e246c3f3` | 2 / 8086 / 0 | 537 B | identical |
| `B8-borda` | jet | the BORDA paste block | yes | `785d201b` | `785d201b` | `785d201b` | 2 / 8162 / 0 | 545 B | identical |
| `B9` | sandbox | `B9.build()` | yes | `d05cfd24` | `d05cfd24` | `d05cfd24` | 5 / 18799 / 1521 | 659 B | identical |
| `B10` | sandbox | `B10.build({level: 3.95})` | yes | `31e77052` | `31e77052` | `31e77052` | 5 / 37725 / 0 | 631 B | identical |

**26 captured, 26 verified, 0 failed.** Total payload weight 15 944 bytes
compact; the largest single payload is DA-1@1 at 694 B. Nothing is remotely
near the 40 kB flag — the whole file is 28 kB only because it is pretty-printed
with a provenance comment above every key. Size is a non-issue here; the
`#rig=` URL case RIGSHARE worried about does not apply to a script tag.

**Cross-check against the existing record:** the `FR-1` entry is byte-identical
to the RIG-A example printed in `RIGSHARE-report.md` §2 (same five strokes,
`open`, `inflow`, `tailwater`, gauges, `ui`), and its 37 725 wall cells match
that report's §3.1 table. Independent confirmation that snapshot/apply and this
capture agree with what was measured when the format shipped.

### Three identical-mask pairs — expected, not a bug

- `FR-1` = `LL-2` = `B10` (`31e77052`). All three are the RIG-A duct with no
  local feature: LL-2's fault and B10's crest are the *student's* stroke, so
  the base geometry is literally the same drawing. They differ in
  `inflow.level` (3.30 / 3.90 / 3.95 m), which is where each demo's setting
  lives.
- `MO-2` = `HP-2` (`8e720511`). The two folders ship the **same `rig.js`**
  (13 051 bytes each, JETRIG), and both READMEs start on the flat plate. Kept
  as two keys per the brief; the picker may alias them if it prefers.

---

## 2 · Parameter choices — what "shipped default" meant for each

Where a `rig.js` takes parameters I used the value the README's own build card
or the rig card's header example ships, and every one is stated in the file
above its key.

| exercise | value captured | why |
|---|---|---|
| FR-1 | reservoir 3.30 m | `RIGA.build()`'s own default = digit d 0 |
| LL-1 | reservoir 3.45 m | `LL1.build()` default = d 0 |
| LL-2 | reservoir 3.90 m, **no fault** | the one shared level for every pair; the fault is partner A's, by design |
| WE-1 | plate x 6.5 / P 0.50, q 0.35, level 1.326 | README §1's build-card line verbatim |
| MO-1 | a 0.1522, q 0.33, level 1.2103 | README §1's card — the 7-cell opening (digits 5–7) |
| MO-2 / HP-2 | flat plate | both READMEs' step 2 (`JETRIG.flat()`), first rung of the turning series |
| HP-1 | nozzle gap 0.84 m | README §1: "`HP1.build(0.84)`" |
| FB-1 | q 0.35, level 1.00, tw 1.00, **no hump** | README §1's `FB1.buildBase(0.35, 1.00, 1.00)` |
| FB-2 | q 0.35 | README §1's `FB2.build(0.35)` |
| DA-1 | q_base **0.72** on all three rungs | the rig card header's own example. q and the reservoir level are ordinary sliders (`DA1.build` derives level from q), so the picker *can* express the per-digit value; only λ needs its own key |
| DA-2 | λ 1 / ¾ / ½ / ¼ → 4 / 3 / 2 / 1 orifice cells | the ladder the rig is designed around; verified in the valve-cell column above (56 / 42 / 26 / 14 cells) |
| QS-2 | A₂ = **2.00 m** | `QS2.build()`'s own default (= digit d 6). README §2's example call uses 1.5; A₂ is per-student geometry either way, hence the note |
| UN-3 | b_s = **0.98 m** (7 cells) | the width the README's seal audit and §5 tables are quoted at (digit d 2) |
| CS-1 | `presses: 0` | the 6-cell throttle, the README's reference rung |
| B8 | three lips | sharp = the untouched `jet` scene; bellmouth and borda = the two paste blocks, extracted from `rig.js` by their own header comments |
| B9 | z_B = 2.0 m | `B9.P.zB`'s default, the value the rig header calls |
| B10 | level 3.95 m, **flat pipe** | README §2 step 2's example (d 5); the crest is the student's ladder |

### DA-3 key mapping (no payload of its own)

`DA-3-scale-effects/rig.js` adds **no build logic** — its own header says so:
it drives the Resolution control around DA-1's and DA-2's rigs and reads back
their numbers. So DA-3 reuses:

| DA-3 exhibit | key to load |
|---|---|
| resolution sweep on the weir, λ = 1 | `DA-1@1` |
| … λ = ½ | `DA-1@0.5` |
| … λ = ¼ (the headline row) | `DA-1@0.25` |
| the orifice / C_d exhibit | `DA-2@0.25` |

No payload was duplicated for it. One caveat for the picker, from DA-3's own
header: `DA2.build()` forces Resolution back to Medium as its *first* panel
action, so for DA-3 the resolution must be set **after** the rig loads, never
before. The same is true of a loaded payload — see §4.

---

## 3 · Geometry notes — what and why

`EXERCISE_RIG_NOTES` has six entries. The rule I applied: a note exists where
the README documents a **per-student parameter that changes the rasterised
mask**, because that is precisely what a picker cannot offer as a slider — the
panel has no control for a wall stroke. Everything else per-student (FR-1's
level, DA-1's q, PU-1's spout velocity, HP-1's nozzle *is* geometry but is not
per-student in the picker sense — see below) is a live panel control and needs
no note.

| key | control | rationale |
|---|---|---|
| `UN-1` | nozzle gap g (5-rung ladder) | no payload of its own in this pass — UN-1 is a scene-default `hammer` demo whose *entire* rig is the redrawn nozzle, so a note is all there is to record |
| `LL-2` | partner A's hidden fault: x and height | deliberately excluded from `LL-2`'s payload, per the brief. A payload containing the fault would leak the answer |
| `FB-1` | hump height dz | the demo *is* raising it; a base rig with the hump already in it has no exercise left |
| `QS-2` | tank 2 width A₂ = 0.50 + 0.25·d | the far wall's x is the personalised dimension; the payload ships one instance (A₂ = 2.00) |
| `UN-3` | standpipe width b_s = 0.70 + 0.14·d | three strokes (erase + two walls) all move with b_s; the payload ships b_s = 0.98 |
| `B10` | crest soffit elevation z_c | the ladder the demo climbs. B10's staircase is 39 strokes redrawn by `B10.crest(z)` — hand-drawing it is not on, so the `how` names the console call, which is what the README's own worksheet step tells the student to use |

Each `how` is one sentence lifted from that README's worksheet (tool, brush,
coordinates), so it can be shown verbatim in a picker tooltip.

Two candidates I did **not** write notes for, deliberately:

- **DA-1 λ and DA-2 λ** — geometry, but already expressed as separate keys
  (three and four rungs), which is strictly better than a note.
- **HP-1's nozzle gap** — geometry and per-student, but HP-1's payload already
  carries one built nozzle and the demo's own personalisation is the *gap
  value*, redrawn by `HP1.build(g)` in the console rather than by hand. If the
  picker wants a note for it, the pattern is UN-1's.

---

## 4 · Gaps and caveats the picker worker must know

**1. Resolution is not in the format, and four rigs are cell-quantised.**
`RIG.apply` deliberately does not carry Resolution (RIGSHARE §2, "baking Ultra
into a link a lecturer hands to thirty laptops is a trap"). Every capture here
was taken and verified at **Medium**, which is the boot default — but several
`rig.js` files call `C("budget").set("Medium")` themselves precisely because
their demonstration is an integer cell count, and a payload cannot do that:

- `DA-2@*` — the orifice ladder is 4 / 3 / 2 / 1 **cells**; on another grid the
  ladder is not exact and the demo's whole point (DA-3's C_d drift) moves.
- `LL-2` — the fault is 2–3 cells of an 18-cell bore.
- `HP-1`, `UN-3` — the nozzle gap is quantised to one cell (0.1376 m at
  Medium on `hammer`).
- `DA-1@*` — every base dimension is a multiple of 4 cells at the *design* Δx.

If a picker user is sitting on High/Ultra when they load one of these, the
geometry re-rasterises legally but the cell counts change. Either force Medium
around a load for these keys, or say so in the UI. (This is a known,
documented limitation of the format, not something introduced here — the
optional `res` field is listed as a v2 follow-up in RIGSHARE §5.)

**2. Five rigs need a staging sequence that a rig payload cannot hold.** A rig
is a rig, not a snapshot: `apply()` ends with `resetWater()`, so anything about
filling, priming or valve staging is procedure, not payload. Loading these
gives the correct drawing and panel, and then:

- `PU-1` — the spout is **off** at its sandbox-default (top-left, raining)
  position, exactly as `PU1.build()` leaves it. README §2's priming is: turn it
  on for 7 s to fill the sump, then move it into the bore as the pump
  (`installPump(2.2)`, ~55 s), then set the digit's own vx. The pump *position*
  (x 2.0, y 0.60, r 0.15) is not panel-expressible — worth surfacing.
- `B9` — the valve is shut and **both level controls are still off** with the
  left and right edges open; `B9.fillAC()` turns them on, `fillB()` pours
  reservoir B, `release()` opens the valve. Loading it alone and pressing Run
  will not reproduce the demo.
- `QS-2`, `DA-2` — the tanks start empty; `QS2.fill()` / `DA2.fill()` set the
  start levels, and the run begins on `V`.
- `CS-1` — the storm is the spout, and the payload carries `build()`'s own
  vx = 0.5, not the README's ramp start (~1.7 m/s). `CS1.storm(vx)` is a
  panel-expressible slider, so this one is only a default worth mentioning.

**3. HP-1 keeps the `hammer` scene's own 25.0 m reservoir**, unlike UN-3 which
drops it to 12.0 m. That is correct — `HP1.build` never touches the level —
but it means the two `hammer` rigs look inconsistent side by side in a picker.

**4. Nothing was invented.** Every payload came from running the folder's own
`rig.js` unmodified. The only source-slicing done was B8, whose `rig.js` is
three paste *blocks* rather than functions: the bellmouth and borda IIFEs were
extracted at their own banner comments and evaluated one per fresh page, so no
variant is ever contaminated by another.

**5. One harness bug, found and fixed, worth recording**: my first pass wrapped
each build call as `var r = (<call>)`, which is a syntax error for the two
multi-statement builds (`JETRIG.build(); JETRIG.flat()`). MO-2 and HP-2 failed
with `SyntaxError: Unexpected token ';'` and were re-run after the wrapper was
changed to a plain statement. Nothing to do with the rigs or with RIG.

---

## 5 · Regenerating

The rigs are data now, but they are *derived* data: if a demo folder's `rig.js`
changes, re-capture rather than hand-editing coordinates. The procedure is the
one above — `runner.py launch --id RIGCAP`, evaluate the folder's `rig.js`,
call the build quoted above its key in `js/exercises-rigs.js`, take
`APP.RIG.snapshot()`, then verify by applying it on a fresh page and comparing
the mask hash. The build call for every entry is recorded in the file itself,
so nothing has to be rediscovered.

Runner state: launched once as `RIGCAP`, closed at the end. No orphan Chrome,
no orphan server. Nothing committed.
