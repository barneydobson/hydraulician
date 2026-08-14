# EXFIX — the picker sets the bench, the student does the experiment

Maintainer's ask, verbatim: *"I want there to be variability, it shouldn't be
idiot proof, students will learn things when they get stuff wrong. I just want
to make sure everyone can have the same starting point and the correct
information for their exercise. I don't want you to automatically infill stuff
beyond that."*

The picker used to write the student's answers onto the sliders — their q, the
tailwater the y_c rule pairs with it, the WE-1 level pairing, and the gauge
stations. All of that is now **printed on the card and left for them to set**.
What is applied is the bench: scene, Resolution Medium, the captured rig, and
only the plumbing a README documents as load-bearing.

**Files touched:** `js/exercises.js` (schema + all 40 entries), `js/main.js`
(the `EX` module: apply / card / reset), `index.html` (CSS for two new card
blocks), and **one string** in `js/exercises-rigs.js` (the UN-1 note bug the
docs worker found — the agreed data exception). No solver, no scene file, no
demo folder. Nothing committed.

---

## 1 · The schema

`js/exercises.js` is still `const EXERCISES = [{…}]`, classic script, no build
step. `params` and `gauges` are **gone**; five fields replace them and the split
IS the policy.

```js
{
  id, title, topic, folder, scene,
  rig, rigTable,          // APPLIED — the captured drawing (rigTable: which one)

  rigParams: { … },       // APPLIED. CONTROLS ids → values. The plumbing without
                          // which the rig is not a physically working rig: edges,
                          // which supplies/controls exist, and the levels and
                          // constants a README calls load-bearing. KEY ORDER IS
                          // HONOURED — ticking a level control opens its own edge,
                          // so the edges are written first.

  viewParams: { … },      // APPLIED. Display and readout only — Field, Gauges plot,
                          // the overlays, Speed, tracers, dye. Sets no physics and
                          // gives nothing away.

  rigWhy: { <ctl>: "…" },  // one line on the receipt for an applied value nobody
                          // can guess the reason for (UN-2's wave damping).
                          // `view` keys the whole viewParams line.

  studentParams: [        // DISPLAYED, NEVER APPLIED. What the worksheet asks them
    { control, value?,    // to set that no digit rule covers: a staged step, a
      unit?, rule? } ],   // per-scale start level, an assigned cell.

  digit: { label, control, base, step, mod, table, unit,
           rule,          // NEW — the sentence that says why (HJ-1's 1.3·y_c)
           also: [ … ] }, // DISPLAYED, NEVER APPLIED (rigTable excepted)

  instruments: [          // DISPLAYED. Where the gauges/rakes GO. The picker places
    { tool, where, why } ],  // none and clears any the rig payload carried.

  secondScene: { scene, when },   // NEW — the six demos whose task spans two scenes
  digitNote, setup, task, submit, settle, notes   // unchanged
}
```

Four things follow from the split and are worth stating:

- **Every student-owned control is put back to the SCENE DEFAULT after the rig
  lands** (`resetStudentControls`, read on a fresh boot before the rig applies).
  Without it a rig payload hands three students in ten their own answer — see
  §3, call 6, which is the reason this exists.

- **`rigTable` is the one thing a digit still writes.** DA-1's λ = ¼ weir is a
  different *drawing*, not a different number, and nobody hand-draws it — so
  geometry stays in the common starting point even when the digit picks which.
- **A rig payload's own gauges are cleared after it applies.** `RIG.apply`
  restores them by design (that is right for a shared `#rig=` link) and the
  picker undoes it, because choosing where to measure is the exercise: B1's
  entire failure mode is a gauge at the wrong station.
- **Legacy `params`/`gauges` are not read at all.** A stale cached
  `exercises.js` therefore under-applies rather than silently doing the
  student's work.

### Card layout after the change

`id + title · digit field · "Your values — set these yourself" · collapsible
"Already set for you — N items (the same for everyone)" · task · second-scene
block (where there is one) · staged steps · submit · settle note · measurement
caution · Reset · full-brief link`. The values block prints, per value,
`name = value unit → the panel row it goes on` with the rule underneath. The
"already set" block is a receipt: every applied item itemised, collapsed by
default. `↻ Reset to this exercise` is now **`↻ Reset to the starting point`**,
tooltipped *"your own values are not restored — they were never set for you"*.

---

## 2 · Applied vs displayed, per exercise

`rigParams` and `viewParams` are applied; the last two columns are printed only.
`budget: "Medium"` is in every entry's `rigParams` and is omitted here.

| id | rig | rigParams (applied) | viewParams (applied) | student-set (displayed) | stations |
|---|---|---|---|---|---|
| `UF-1` | — | — | channel | inQ | — |
| `GV-1` | — | — | channel labels | — | — |
| `GV-2` | — | — | channel labels jumps | — | — |
| `HJ-1` | — | — | jumps | inQ twLevel | — |
| `NC-1` | — | — | channel gaugeField | — | 2 |
| `NC-2` | — | — | channel | — | 1 |
| `NC-3` | — | — | channel | inQ | — |
| `FB-1` | yes | edges·4 inflowOn inFree inLevel twOn twLevel spoutOn waveOn | mode channel labels jumps gaugeField | inQ | 1 |
| `FB-2` | yes | edges·4 inflowOn inFree twOn spoutOn waveOn | mode channel labels jumps gaugeField | inQ inLevel | 1 |
| `WE-1` | yes | edges·4 inflowOn inFree twOn spoutOn waveOn | mode channel labels jumps gaugeField | inQ inLevel | 1 |
| `MO-1` | yes | edges·4 inflowOn inFree **inQ** twOn spoutOn waveOn | mode channel labels jumps gaugeField | inLevel | 1 |
| `MO-2` | yes | edges·4 spoutOn spoutR spoutVx spoutVy | mode channel labels jumps gaugeField | — | 2 |
| `FR-1` | yes | spoutOn openB openR inflowOn inFree **inLevel**† twOn **twLevel** cs | mode channel labels jumps | inLevel | 2 |
| `LL-1` | yes | spoutOn openB openR inflowOn inFree **inLevel**† twOn twLevel cs | mode channel labels jumps | inLevel | 2 |
| `LL-2` | yes | spoutOn openB openR inflowOn inFree **inLevel** twOn twLevel cs | mode channel labels jumps | — | 1 |
| `PU-1` | yes | edges·4 **spoutOn**† spoutR spoutVy | mode channel labels jumps | spoutVx spoutOn‡ | 2 |
| `B10` | yes | spoutOn openB openR inflowOn inFree **inLevel**† twOn twLevel cs | mode channel labels jumps | inLevel | 2 |
| `HP-1` | yes | — | mode | — | — |
| `HP-2` | yes | edges·4 spoutOn spoutR spoutVx spoutVy | mode channel labels jumps gaugeField | — | 1 |
| `UN-1` | — | — | speed gaugeField | — | 1 |
| `UN-2` | — | **bulk** | speed gaugeField | inLevel | 1 |
| `UN-3` | yes | inLevel bulk cel | gaugeField speed | — | 1 |
| `B1` | — | — | gaugeField speed | — | 1 |
| `B2` | — | — | speed gaugeField | **cel** | 1 |
| `B3` | — | — | speed | — | — |
| `QS-1` | — | — | speed gaugeField | — | 1 |
| `QS-2` | yes | spoutOn cs edges·4 inflowOn inQ inLevel | gaugeField mode | — | 2 |
| `B7` | — | **twLevel** | mode | inLevel | 2 |
| `B8` | variant | — | — | — | — |
| `B9` | yes | spoutOn cs edges·4 inQ | gaugeField mode | **inflowOn inLevel twOn twLevel** | 4 |
| `CS-1` | yes | inflowOn twOn edges·4 spoutOn spoutR **spoutVx** spoutVy | gaugeField dye dyeDecay | — | 1 |
| `WV-1` | — | waveOn | — | waveT waveA | — |
| `WV-2` | — | waveOn | gaugeField | waveT waveA | 2 |
| `WV-3` | — | waveOn | gaugeField | waveT waveA | 1 |
| `B4` | — | waveOn | tracer·4 vex | waveT waveA | — |
| `B5` | — | waveOn | — | **waveT waveA** | — |
| `B6` | — | waveOn | gaugeField | waveT waveA | 2 |
| `DA-1` | variant | edges·4 inflowOn inFree twOn spoutOn waveOn | mode channel labels jumps gaugeField | inQ inLevel | 1 |
| `DA-2` | variant | spoutOn edges·4 twOn **twLevel** inQ | gaugeField mode | **inflowOn inLevel** | 2 |
| `DA-3` | variant | spoutOn edges·4 inflowOn inFree twOn | mode channel labels jumps gaugeField | inQ inLevel **budget** | 1 |

† promoted to `rigParams` by §3a because the scene default broke the rig — a
bench idle **off** the personalised ladder, printed on the receipt with its
reason. ‡ PU-1's spout is off on the bench and ticking it is still step 2 of the
student's own sequence.

**Totals.** 39 keys that used to be in `params` are now student-set, across 23
exercises; on top of that all **31 digit-driven control writes across 20
exercises** are gone (the old `applyDigit` wrote every rule and every `also`).
**31 gauge placements are no longer made** — 7 that were hard-coded in 5 entries
plus 24 that came in with the rig payloads of 15 exercises — and 43 stations are
documented instead, in 29 entries. 10 `studentParams` rows in 5 entries.

---

## 3 · Judgement calls — reviewed and settled

The rule I applied where a README was not explicit: **a value is the student's
if their own worksheet tells them to set, derive or stage it; otherwise it is
part of the bench.** All six calls below went to the coordinator. **Five were
upheld and ship as described (1–5, 7); call 6 was rejected and is fixed —
§3a.**

1. **`viewParams` is a second APPLIED bucket, and the brief did not name it.**
   *Upheld: display settings are part of "everyone sees the same thing", not
   part of the answer.*
   Field, Gauges plot, the overlays, Speed, tracers and dye set no physics and
   reveal no answer, but a demo read on the wrong channel is unreadable (UN-3's
   mass oscillation is buried under a ±6 m Joukowsky wave on Head; HJ-1's task
   names an orange box that does not exist with Jump analysis off). They are
   listed on the card like everything else.
2. **`MO-1` `inQ = 0.330` and `CS-1` `spoutVx = 0.50` applied.** *Upheld:
   shared-for-everyone constants.* MO-1's own digitNote says "q = 0.330 for
   everyone; each level is the fixed point for that q"; CS-1's 0.50 m/s is the
   dry-weather flow the 45 s pre-charge runs at, and the storm ramp up from it
   (0.25 then 0.08 m/s steps) is the student's.
3. **`FB-1` `inLevel = twLevel = 1.00` applied.** "for everyone" in its own
   digitNote, and the reach is doubly controlled — with either missing there is
   nothing for the hump to choke against.
4. **`UN-2` `bulk = 0.30` applied.** *Upheld, and it IS documented:*
   CHANGES-NEEDED.md §2b records that at the shipped 0.03 a level jump on a shut
   pipe rings for 30+ s and wrecks the read. That sentence is now on the card's
   receipt under the value (`rigWhy`), so it cannot look arbitrary to the next
   reader. Same treatment for the other non-obvious applied values —
   UN-3's 12.0 m / 0.03 / Depth / ×2, FR-1 & family's tailwater, FB-1's paired
   1.00 m, B7's 1.55 m, QS-2's C_s = 0.40, MO-1's q, CS-1's spout, PU-1's
   spout-off: 12 exercises now carry `rigWhy` lines.
5. **`B7` `twLevel = 1.55` applied.** *Upheld.* The downstream control that
   makes the venturi duct run full under head-driven inflow; the reservoir level
   is the personalised one.
6. **~~A captured rig legitimately pre-sets some students' answers.~~
   REJECTED — fixed, see §3a.**
7. **`B9`, `DA-2`, `PU-1` reclassified in the opposite direction.** *Upheld.*
   B9's `params` used to tick both level controls on — contradicting its own
   setup step 1 ("the rig loads with the valve SHUT and both level controls off
   — that is the pre-commissioning state"). They are now `studentParams`,
   matching the steps. The *levels* (3.20 / 0.60) are pre-dialled by the rig
   payload and shared by everyone; only the ticking is theirs. Same for DA-2
   (fill from the reservoir, then untick it) and PU-1's spout.
8. **`DA-3`'s resolution.** Medium is applied as the capture resolution — moving
   *off* it is the whole exercise, so the digit's Low/High is displayed with the
   rule "set it AFTER the rig has loaded", per RIGCAP §2.
9. **`rigTable` still writes.** DA-1 (3 rigs), DA-2 (4), B8 (3), DA-3 (3): the
   digit picks the drawing. Geometry is bench, not answer.

### 3a · The rejected call, and the fix

The coordinator's ruling, and it is the right one: a bench that hands d = 5/6/7
their own MO-1 level while everyone else starts at the scene default **is not
one starting point, it is two** — and it silently does one student's work.

**Fix.** `EX.pick` now reads the scene's own value for every student-owned
control on a fresh boot — *before* the rig lands — and writes it back after
`RIG.apply` and after `rigParams`/`viewParams`. The bench is therefore identical
for all ten digits whatever the snapshot happened to capture. Controls named in
`rigParams`/`viewParams` are excluded from the reset (a value the bench declares
is the bench's), which is also the promotion route below.

**Four values promoted to `rigParams` because the scene default genuinely broke
the rig** — each measured, not assumed:

| exercise | promoted | why the scene default was broken |
|---|---|---|
| `FR-1` | `inLevel: 2.50` | head-driven inflow with the sandbox's level 0 pins the left edge at the domain floor: **the duct runs BACKWARDS** off the tailwater at −3.99 m/s with the inlet cell bone dry and the domain draining (vol 7.48 → 3.01). 2.50 m = the tailwater it discharges into, so the bench idles **charged and still** with no driving head, and 2.50 is nowhere on the 3.30-and-up ladder. |
| `LL-1` | `inLevel: 2.95` | same failure, −1.95 m/s. Same remedy (= its own 2.95 m tailwater). |
| `B10` | `inLevel: 2.50` | same failure, −4.00 m/s. Same remedy. |
| `PU-1` | `spoutOn: false` | the **sandbox's own spout is ON by default** and would rain into the sump immediately, contradicting PU-1's setup step 1 ("the rig loads with the spout OFF"). Its velocity stays the student's. |

The reset was *not* backed out anywhere else. Five exercises (`MO-1`, `WE-1`,
`FB-2`, `DA-1`, `DA-3`) now idle **dry** — the sandbox has no water of its own
and their supply is the student's q and level — and that was deliberately left
alone: a bench that does nothing until you set your value is the exercise
waiting, not a rig broken, and all five were run flat out and stay finite and
still. `MO-1` keeps its shared q = 0.33 with the inlet at level 0, which is
inert (measured: no fill, no motion, no instability over its full settle).

**No value that is any student's answer is applied anywhere.** The bench idles
for FR-1/LL-1/B10 are deliberately below the first rung of their ladders and are
labelled as such on the card receipt.

---

## 4 · The two items from the docs worker

1. **`EXERCISE_RIG_NOTES["UN-1"].control` corrected** in
   `js/exercises-rigs.js` — was *"5 rungs, 0.28-0.84 m"*, now the verified
   six-rung rule `gap = 0.14 × (1 + (d mod 6))`, 0.14–0.84 m, matching UN-1's
   README, `js/exercises.js` and CHANGES-NEEDED.md. One string; nothing else in
   that file was touched. **The other five notes were re-checked against their
   READMEs and agree** (LL-2 x 4.6–7.0 / y 2.04–2.07; FB-1 hump; QS-2
   A₂ = 0.50 + 0.25·d, payload d = 6; UN-3 b_s = 0.70 + 0.14·d, payload d = 2;
   B10 crest ladder on a flat shipped pipe).
2. **`secondScene` added to the six multi-scene demos**, wording from each
   worksheet, rendered as its own violet block under the task. It states the
   scene and when to switch, and switches nothing:
   `HJ-1 → s1` (optional coda, q at the scene default, tw 0.95/1.00/1.05),
   `NC-3 → m2` (Part B, touch nothing, 90 s spin-up, hover x ≈ 7 m),
   `WV-1 → waveshallow` (second cohort, same digit, the shallow rows),
   `WV-2 → wavedeep` (even last digits only), `B5 → wavesurge` (the cell
   carries its scene), and `B2 → same scene, c = 140` — spelled out precisely so
   nobody goes hunting for a second scene that does not exist.

---

## 5 · Test evidence

`exercises/_runner/runner.py --id EXFIX`, visible Chrome, hardware GL (ANGLE /
RTX 2060). Runner closed; **zero orphans** (`pgrep` clean on the debug port and
the profile dir).

### 5.1 HJ-1 at digit 3 — the headline case

```
APP.pickExercise("HJ-1", 3)
card  "your q = 0.51 m²/s · tailwater = 0.538 m"
      YOUR VALUES: q = 0.51 m²/s → Inflow q          (q = 0.42 + 0.03·d)
                   tailwater = 0.538 m → Tailwater level
                     "1.3 · y_c (1.5 · y_c at d = 6 and 9) — check it yourself
                      against the y_c the q slider prints"
ALREADY SET: 3 items — scene h23 · Resolution Medium · view Jump analysis on
panel  inQ 0.500   twLevel 0.530     ← the h23 SCENE defaults, NOT 0.51/0.538
gauges 0   rakes 0                    ← nothing placed
```

`EXFIX-01-hj1-card-digit3.png`. Then the student's own path — the two sliders
the card names, set by hand, settle 45 s, median of nine EMA-warmed reads:

```
Fr₁ 1.915   y₁ 0.1905   y₂ 0.4385   momentum y₂ 0.4281   y₂/y₁ 2.264   (+2.4%)
```

A **free** jump, inside the 1.7–2.4 band the box is documented to hold, and
within noise of EXPICK's auto-applied run (1.925 / 0.4342 / 0.4228). The
displayed numbers are the right numbers. `EXFIX-02-hj1-handset-inband.png`.

### 5.2 The student error — not padded away

Same run, tailwater dropped to **0.40 m** (0.25 m deep at the outlet against
`y_c = 0.298 m` printed on the q slider — below critical), 40 s to re-settle:

```
Fr₁ 1.739   y₁ 0.2136   y₂ 0.4889   momentum y₂ 0.4269   →  +14.5%
(single frames on the box: "momentum: 0.366, +87%")
```

That is exactly the diagnosis HJ-1's own trouble table names — *"y₂ reads far
ABOVE the momentum prediction ⇒ the jump is drowned, the roller is sitting on
the chute"*. Against +2.4% at the correct pairing. The panel shows the student
both halves of the mistake in plain text ("0.25 m deep at the outlet" beside
"y_c = 0.298 m"), and nothing in the picker prevented, corrected or hid it.
`EXFIX-03-hj1-student-error-drowned.png`. **This is the pedagogy the change was
for.**

### 5.3 FR-1 — rig applied and flowing, answers not

```
scene sandbox · Medium · 5 segments · open 1,1,0,0
inflowOn 1 · inFree 1 · twOn 1 · twLevel 2.50 · C_s 0.40 · Field Pressure head
inLevel 3.30   ← the RIG's captured level; digit 4 wants 3.82 and it is NOT set
gauges 0   rakes 0
card YOUR VALUES: reservoir level = 3.82 m → Reservoir level (level = 3.30+0.13·d)
                  gauge (tool 5) → x = 4.0 m, y = 2.20 m  — H₁, mid-height in the
                                    bore and clear of the entry region
                  gauge (tool 5) → x = 8.5 m, y = 2.20 m  — H₂, L = 4.5 m not 6
ALREADY SET: 12 items, itemised
after 24 s: probe(6.0, 2.20) f = 1.009, u = 3.67 m/s — full-bore and flowing
```

`EXFIX-04-fr1-rig-no-gauges.png`.

### 5.4 Reset

On FR-1 at digit 4, after the student had done real work and then wrecked it
(their own level 3.82, a mistaken tailwater 1.00, Field → Vorticity, junk
strokes, a hand-placed gauge) — re-run after the §3a fix:

```
start   inLevel 2.50  twLevel 2.50  segs 5  gauges 0
wreck   inLevel 3.82  twLevel 1.00  segs 6  gauges 1  (mode 4 in the first run)
reset → inLevel 2.50  twLevel 2.50  segs 5  gauges 0  rakes 0  mode 1  t ≈ 0
        digit still 4, card still reads "your reservoir level = 3.82 m"
```

The bench came back; **their 3.82 did not**. That is the required behaviour.

### 5.5 The scene-default reset (§3a) — FR-1 and MO-1

```
FR-1 d = 0   inLevel 2.50 = twLevel 2.50 · 5 segs · 0 gauges
             60 s flat out: full bore (f = 1.006), vol 6.643 → 6.643 (0.00%),
             u mid-pipe −0.51 → −0.16 m/s and still decaying — charged and STILL
             (before the fix: u = −3.99 m/s BACKWARDS, inlet dry, vol 7.48→3.01)
  then the student sets their own 3.30 on the panel, 25 s:
             u = +3.80 m/s forward, vol 7.476 — identical to the old
             auto-applied state (7.4795). The bench works the moment they act.
MO-1 d = 6   inLevel 0.00 — the SCENE default. Its own answer, 1.2103, is no
             longer dialled in for d = 5/6/7. inQ 0.33 (shared) still applied.
PU-1         source off — setup step 1's state, not the sandbox's raining spout.
UN-2 d = 6   bulk 0.30 applied, receipt reads "not the shipped 0.03: a level jump
             on a shut pipe otherwise rings for 30+ s and wrecks the read
             (CHANGES-NEEDED §2b)"; panel level 25.0 = the hammer default while
             the card says "your reservoir level = 25.60 m".
```

`EXFIX-06-fr1-bench-idle-receipt.png` — the receipt expanded, all 13 items with
the two reasons, beside a panel reading 2.50 / 2.50.

### 5.6 All forty, in one pass (re-run after the §3a fix)

Every exercise picked in sequence at digit 6, awaiting `EX.ready`, each then run
~14 s of sim time flat out. Assertions: card identity, scene, Medium, rig
present, no instrument placed, **no student-owned control sitting on that
digit's value**, and volume/velocity finite and bounded.

```
40/40 set up · 0 failures of any assertion · JavaScript errors 0
values written that should not have been: 0   (was 2 before the §3a fix)
instruments placed: 0 in all 40
unstable benches: 0
```

### 5.7 Regression gate

```
?scene=m1            m1, no exercise, no card, title "M1 · backwater behind a weir"
Scene menu           19 rows, opens/closes, exercise menu closed by it
Exercise menu        40 rows, opens/closes, scene menu closed by it
Gauge inspector      GINSP.show(0) → window "Gauge 1", 900 samples, closes clean
Rig share            RIG.link() → 510-char link carrying #rig=
?ex=UF-1             s2, card up, channel overlay on, inQ 1.20 = the SCENE
                     default (rule shown, nothing applied), 0 gauges, ?ex=UF-1
?ex=HJ-1#rig=…       exercise sets up, then the shared rig lands on top:
                     scene sandbox, 5 segs, its own 1 gauge kept, card still HJ-1
                     (a shared rig keeps its instruments — that contract is
                      RIGSHARE's and is deliberately untouched)
file:// ?ex=WE-1     no server: rig applied (4 segs), gauges cleared, panel
                     q 0.35 / level 1.326 (the capture), card "your q = 0.50
                     m²/s · reservoir = 1.412 m", 0 JS errors
```

`EXFIX-05-file-protocol-we1.png`.

---

## 6 · Screenshots

| file | shows |
|---|---|
| `EXFIX-01-hj1-card-digit3.png` | HJ-1 at digit 3: the green "your values" block with both rules, the collapsed "already set for you", the second-scene block — beside a panel still on the scene defaults |
| `EXFIX-02-hj1-handset-inband.png` | the same exercise after the student set q and tailwater by hand: a free jump, in band |
| `EXFIX-03-hj1-student-error-drowned.png` | tailwater below y_c: the drowned jump, `+87%` on the box, `0.25 m deep` against `y_c = 0.298` on the panel |
| `EXFIX-04-fr1-rig-no-gauges.png` | FR-1: rig drawn and flowing, no gauges on screen, both stations printed on the card, level still 3.30 |
| `EXFIX-05-file-protocol-we1.png` | WE-1 over `file://`, no server |
| `EXFIX-06-fr1-bench-idle-receipt.png` | the fix of §3a: FR-1's receipt expanded, reservoir level 2.50 = tailwater 2.50 on the panel with its reason printed, the card still asking for 3.82 |

## 7 · Notes for the next worker

- **`viewParams` is the seam to pull** if the maintainer wants the line drawn
  even harder: one loop in `applyParams` (`js/main.js`), and the card block that
  prints it already exists.
- `EX.pick` is still synchronous for a scene-only exercise and asynchronous for
  a rig one; wait on **`EX.ready`**. The runner's `eval` does not await, so a
  rig-bearing check needs two round trips (or `--awaitp`).
- `GINSP.show` takes an **index**, not a gauge object.
- Nothing reads `params` or `gauges` any more. If an old third-party
  `exercises.js` turns up, it will under-apply silently — deliberately the safe
  direction.
- The READMEs were being rewritten concurrently by the docs worker; no markdown
  under `exercises/` was touched here except this report.
