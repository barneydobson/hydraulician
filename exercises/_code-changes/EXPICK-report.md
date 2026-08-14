# EXPICK — an exercise picker: pick "HJ-1", get a set-up simulation

Maintainer's ask: *"I'm looking for a better way to select exercise scene … I am
not clear how to set up an exercise."* The forty demos in `exercises/` each need
a scene PLUS panel settings PLUS often a drawn rig, and until now all of that
lived in prose in a README. This turns an id into a running, personalised
simulation and a card that says what to read off it.

**Files touched:** `js/main.js` (the `EX` module, one panel section, a
`dragWindow` helper the gauge inspector now shares, five lines in `tickFrame`,
nine in `boot`), `index.html` (CSS, one bar button, the menu element, two script
tags, one key in the legend), and a NEW `js/exercises.js` (`const EXERCISES`,
40 entries). `js/exercises-rigs.js` is the rig worker's file and was **not**
created or edited here — it is consumed, defensively. No solver, `sim.js`,
`shaders.js`, `overlay.js` or scene-file contact of any kind, and no demo
folder was touched.

---

## 1 · Entry points

| gesture | where |
|---|---|
| **`Exercises ▾`** in the top bar | next to `Scenes ▾`, same look |
| **Controls → Exercise → `<current> ▾`** | new section under Scene; a second `card` button reopens a closed card |
| **`E`** | added to the key legend |
| **`?ex=HJ-1`** | the lecturer's slide link — boots straight into a set-up exercise |

The menu is the scene picker's twin (they share the `.gmenu` CSS block, which is
the old `#scenemenu` rules renamed — no visual change, verified below). Rows are
grouped by `topic`, each showing the id, the title and one line of *what you
measure · which scene · how long it settles*, plus a `RIG ✓` / `rig: draw it`
tag. A filter box at the top matches id, title, topic, scene and submit fields.
Esc closes, ↑/↓ move, Enter picks; while it is open it owns the keyboard, so
`C` cannot bin a rig behind it. Opening one menu closes the other.

**Picking one** loads the scene through `switchScene` — the same path the scene
menu takes, with the same inline amber "loading drops your drawing" warning and
the same second-click-confirms shortcut — then applies the rig (if the pack has
it), the panel settings, the digit, any gauges, and opens the card.

## 2 · The card

A small draggable window matching the gauge inspector (it now *is* the same drag
code: `dragWindow(el, handle, onPlace)`, factored out of `GINSP` and used by
both, same clamping). It carries: the id chip and title · the **student-number
digit field** · the personalised values it produced (`your q = 0.51 m²/s ·
tailwater = 0.538 m`) · a live settle line · the task · `submit: Fr₁, y₂/y₁` ·
the drawn-personalisation note where there is one · the staging steps where the
rig needs a sequence · the demo's single most load-bearing measurement caution ·
`↻ Reset to this exercise` · and `full brief: exercises/<folder>/README.md` as a
real link.

- **Digit stickiness.** Typing a digit applies it immediately (and re-arms a
  short re-settle, because every worksheet says "after changing q, let it
  re-settle"). It is remembered per exercise AND as the session's last digit, so
  the next exercise you pick pre-fills and applies it — a student uses the same
  digit all term. The field starts empty on a fresh session, and an exercise
  with no digit entered runs its d = 0 row, which is what `params` carries.
- **Settle.** `settle` is a sim-clock target from each demo's verification
  record, and the wait runs the solver **flat out**, exactly as a scene's own
  `spinup` does (`tickFrame` takes `max(scene.spinup, EX.settleTarget())`). So
  HP-1 gets its measured 50 s where its scene asks for 10, and a demo that runs
  in slow motion (QS-1 at ×0.15, UN-1 at ×0.2) does not multiply the wait —
  the speed slider is not in the loop. The status line shows the countdown, the
  card shows it too and then turns green: `settled at t = 35 s · reading now`.
- **Reset to this exercise** re-applies scene + rig + params + digit. It is the
  recovery path when a student has drawn over their rig.

## 3 · The data contract, as implemented

`js/exercises.js` is `const EXERCISES = [{…}]`, classic script, no build step.
The brief's contract is implemented as given, with four **additive** fields the
measured demos turned out to need. Nothing was removed or renamed.

```js
{
  id: "HJ-1", title: "…", topic: "Hydraulic jump",     // grouping
  folder: "HJ-1-belanger",                             // exercises/<folder>/README.md
  scene: "h23",                                        // SCENES key, or "sandbox"
  rig: null,                                           // or an EXERCISE_RIGS key
  params: { inQ: 0.42, twLevel: 0.49, jumps: true },   // CONTROLS ids → values
  digit: { label: "q", control: "inQ", base: 0.42, step: 0.03, unit: "m²/s",
           mod: 6,                                     // for "d mod N" rules
           table: [v0…v9],                             // ADDED — irregular rules
           also: [{ control: "twLevel", table: […] }] },
  digitNote: "your nozzle gap (DRAWN): gap = 0.14 × (1 + (d mod 6)) m …", // ADDED
  rigTable: ["DA-1@1", "DA-1@0.5", …],                 // ADDED — digit picks the rig
  gauges: [[30, 3.5]],  rakes: [x, …],                 // ADDED — instruments
  setup: ["1 …", "2 …"],                               // ADDED — staged rigs
  task: "…", submit: ["Fr₁", "y₂/y₁"], settle: 35, notes: "…"
}
```

Why each addition — every one is forced by a measured demo, not by taste:

- **`table`** — the brief's `base + step·d` cannot express HJ-1's tailwater,
  which steps to 1.5·y_c at d = 6 and d = 9 *because those two digits pumped* on
  the 1.3·y_c rule. Nine other demos ship a measured lookup rather than a
  formula (WE-1's q→level pairing, which moves C_d by 25% if it is 0.1 m out;
  QS-1's level pairs, which skip a band to dodge a seiche; the wave flumes'
  period/stroke tables; DA-1's λ-scaled q and level). `table` is a plain
  ten-entry array indexed by d, and it takes precedence over `base`/`step`.
- **`digitNote`** — thirteen demos personalise by something the panel cannot
  set: a station on screen (GV-1, NC-1, NC-2, B3), a drawn gap or width (UN-1,
  B1, B2, MO-1, HP-1, UN-3, QS-2, CS-1, B8), or a partner's hidden stroke
  (LL-2). Inventing a control for those would be a lie; the card prints the rule
  verbatim instead, and where the rig pack ships a "how" (`EXERCISE_RIG_NOTES`)
  the card prints that beside it in a blue *you draw this* block.
- **`rigTable`** — DA-1 is one weir at three scales, DA-2 one tank at four, B8
  three different orifice lips, and the rig worker keyed them `DA-1@0.25`,
  `B8-borda` and so on. For these the digit chooses **which drawing**, so
  changing the digit on the card re-picks rather than nudging a slider.
- **`gauges` / `setup`** — a gauge is a pointer tool with no panel control, so
  B6's two depth gauges and B7's barrel/throat pair had nowhere to live; and
  five rigs (PU-1, B9, QS-2, DA-2, CS-1) need an ordered sequence a static
  snapshot cannot hold ("fill it, THEN shut the valve"), which the card lists as
  numbered steps rather than trying to automate.

Rig lookup is deliberately forgiving: `rigTable[d]`, then `rig`, then the
exercise id, then the id without hyphens, then the folder name. All 26 keys in
the shipped pack resolve, and no pack key is unused.

**Resolution.** Every rig payload was captured at Medium and several are
cell-quantised, so `budget: "Medium"` is applied **before** the rig, never
after, and skipped when it is already Medium (a rebuild for nothing costs the
rig a re-rasterisation). The card says so under the notes. This is the one place
the exercise picker overrides a workspace preference the scene picker
deliberately keeps — the programme's standing rule is Medium, and a rig applied
at another Δx is quietly a different rig.

## 4 · What was populated

**All 40 entries are populated** — the brief asked for the twenty shipped-scene
demos plus scene/params/digit/task for the twenty rig-pointer ones, and the rig
worker's file landed mid-task, so the rig pointers are now live rather than
pending.

| | count | notes |
|---|---|---|
| ride a shipped scene (`rig: null`) | 20 | HJ-1 UF-1 NC-1 NC-2 NC-3 GV-1 GV-2 QS-1 WV-1 WV-2 WV-3 UN-1 UN-2 B1 B2 B3 B4 B5 B6 B7 |
| point at a rig payload | 20 | FR-1 LL-1 LL-2 PU-1 WE-1 MO-1 MO-2 HP-1 HP-2 FB-1 FB-2 DA-1 DA-2 DA-3 QS-2 UN-3 CS-1 B8 B9 B10 |
| carry a numeric digit rule | 24 | 12 by `base`+`step`, 12 by `table` |
| carry a `digitNote` only | 13 | drawn geometry or a station |
| no personalisation at all | 3 | GV-2 (geometric), MO-2, HP-2 (lecturer demo) |
| carry `gauges` | 6 | UN-1 UN-2 B1(n/a) B2 B6 B7 — plus every rig's own |
| carry `setup` steps | 5 | PU-1 B9 QS-2 DA-2 CS-1 |

Values come from each folder's README (lecturer setup + worksheet +
verification record), cross-checked against `CHANGES-NEEDED.md` §2b, so the
**amended** rules ship, not the programme sheet's originals: HJ-1's q floor at
0.42 (0.30 drowned), UF-1's trimmed 0.80 + 0.04·d, NC-1 on m3 rather than m1,
HP-1's drawn throttle ladder and 50 s settle, B10's `d mod 6`, DA-1's
`0.60 + 0.06·d` with λ thirds, WE-1's `0.10 + 0.05·d` with its load-bearing
level table, LL-1's 0.035 m step, FB-1/FB-2's "if your digit is 9 use 8", B3's
bore-only personalisation, DA-3's even→Low / odd→High.

Every `params` key was checked against the live `CONTROLS` spec and every
`scene` against `SCENES` — 0 unknown ids, 0 unknown scenes (script, §5.1).

Three judgement calls worth stating: **DA-3** has no rig of its own, so it
rebuilds *your* DA-1 λ third (`rigTable` → `DA-1@*`) and its digit carries
DA-1's q and level as well as the resolution — otherwise "change only the
Resolution" would start from an empty sandbox. **GV-2** and **B5** are assigned
by the lecturer, not by a digit, so they carry `digitNote` and their d = 0 row is
a working exemplar. **GV-2's** settle is 0: the sandbox starts dry and there is
nothing to settle.

## 5 · Test evidence

`exercises/_runner/runner.py --id EXPICK`, visible Chrome, hardware GL
(ANGLE / RTX 2060). Runner closed; zero orphans.

### 5.1 Static validation (`node`, against the live sources)

```
entries 40 · duplicate ids [] · missing from the brief's list [] · extra []
params keys not in CONTROLS: none   scenes not in SCENES: none
rig keys unresolved against the pack: none   pack keys used 26 of 26, unused []
draw-notes matched to exercise ids: 6/6
digit maths  HJ-1 d=3 → 0.51 / 0.538   HJ-1 d=6 → 0.60 / 0.648
             B10 d=7 (mod 6) → 3.43    B6 d=2 → 3.6 s / 0.28 m
```

### 5.2 HJ-1 with digit 3 — the README's row, then the physics

```
picked h23 · URL ?ex=HJ-1 · budget Medium · jumps on
inQ 0.51   twLevel 0.538   ← README table d = 3: q = 0.42+0.03·3, tail 1.3 y_c
card "HJ-1 · Bélanger from a room full of flumes", field "3",
     "your q = 0.51 m²/s · tailwater = 0.538 m", submit "Fr₁, y₂/y₁"
panel row "HJ-1 · Bélanger…", note "HJ-1 · digit 3"
```

Settled to t = 58 s (settle 35), then nine EMA-warmed reads, median:

```
Fr₁ 1.925   y₁ 0.1932   y₂ 0.4342   momentum y₂ 0.4228   y₂/y₁ 2.247
```

Fr₁ sits inside the 1.7–2.4 band this box is documented to hold, and the
measured conjugate depth is +2.7% on Bélanger — a **free** jump, which is the
whole point of the q floor. The card's settle line had turned green:
`settled at t = 35 s · reading now (t = 58 s)`.

### 5.3 UN-1 with digit 2 — a rule the panel cannot set, and says so

```
scene hammer · speed ×0.2 · gauges plot head · c 70 (scene default)
gauge placed at (30.00, 3.50) — the worksheet's mid-pipe station
digit 2 sticky in the field · settle target 15 s · panel rules touched: 0
card prints:  "your nozzle gap (DRAWN): gap = 0.14 × (1 + (d mod 6)) m — erase
               the shipped plate and redraw it in two pieces …"
              → d = 2 gives 0.42 m
and, from the rig pack, "you draw this: nozzle gap g = the personalised ladder
rung …" with the full erase/redraw procedure
```

UN-1's personalised parameter is a **drawn gap**, confirmed by its README, by
§2b ("gap ladders quantise to whole cells → 6 rungs") and by the rig pack's own
note — so there is no control value to set, and the card says which stroke to
make rather than pretending a slider does it. Everything else the exercise needs
(scene, slow motion, gauge field, gauge position) is applied.

### 5.4 Rig pointer with the pack ABSENT — and present

The pack was moved aside (`md5 7234ff0b…` before and after — restored
byte-identical) and the page reloaded:

```
EXERCISE_RIGS undefined · EXERCISE_RIG_NOTES undefined · EXERCISES 40
FR-1 picked: scene sandbox, segments 0,
  inLevel 3.82 (= 3.30 + 0.13·4), head-driven on, tailwater 2.50, C_s 0.40,
  edges 1,1,0,0, mode 1 (head), settle 22, digit 4
card: "Draw the rig from the card in the README. Everything else — scene,
       settings, your digit — is already applied. (no rig pack in this build)"
menu row tag: "rig: draw it"       JavaScript errors: []
```

`EXPICK-03-rig-fallback.png`. With the pack restored, the same pick gives
5 segments, both gauges at the worksheet's x = 4.0 / 8.5, y = 2.20, and the card
adds the resolution caveat instead of the amber block.

The only cost of an absent pack is a 404 on the optional `<script>` tag in the
network log — not a JavaScript error, and not present in a build that ships the
pack.

### 5.5 Card drag, digit stickiness, reset

```
HJ-1 d=7 → q 0.63, tail 0.596 (README row)      card at (850, 100)
drag the header −260 / +150                     card at (590, 250)  ✓
type "5" in the field → q 0.57, tail 0.567 (README row), 15 s re-settle armed
pick UF-1 with NO digit → inherits 5 → q = 0.80+0.04·5 = 1.00, field "5"
                                        card still at (590, 250)  ✓
back to HJ-1 with no digit → its own memo 5 → q 0.57, tail 0.567
wreck it (inQ := 1.4) → "↻ Reset to this exercise" → q 0.57, tail 0.567, t = 0
```

### 5.6 Variant rigs, and the E key

```
E opens the menu · C swallowed while open (segments unchanged) · Esc closes
DA-1 d=0 → rig DA-1@1    5 segments, gauge x 2.17, q 0.600, level 1.795
   setDigit(2)           → rig DA-1@0.25, 4 segments, gauge x 0.54,
                            q 0.090, level 0.840   (the README's λ = ¼ row)
B8  d=2 → scene jet, rig B8-borda, 2 strokes
DA-3 d=3 → rig DA-1@1 (5 segments), q 0.780, level 1.890, Resolution High
           card: "your q = 0.78 m²/s · reservoir = 1.89 m · resolution = High"
```

### 5.7 All forty, in one pass

Every exercise picked in sequence with digit 6, awaiting each `EX.ready`:

```
40/40 set up · scene as declared in all 40 · rig applied where declared
card identity correct in all 40 · unknown controls 0 · JavaScript errors 0
one flagged case, examined and correct: B8-sharp applies 0 segments because the
sharp lip IS the jet scene's own orifice — the payload is deliberately empty
```

### 5.8 Regression gate

```
?scene=m1                → m1, no exercise, scene title/tips as before
Scene menu               19 rows = SCENES.list, current highlighted,
                         click loads h23 and writes ?scene=h23, menu closes
menu exclusivity         opening either closes the other, both ways
gauge inspector          opens, "Gauge 1", 30 samples, header drag exact
                         (−200 / +120 through the SHARED dragWindow), CSV 31
                         rows, closes clean
Rig share                2 drawn strokes → link 450 chars with #rig=
                         → full reload → 2 segments back,
                         "rig loaded: 2 segments · scene sandbox"
#rig= boot               unchanged; still wins over ?scene= AND over ?ex=
?ex=…#rig=…              exercise sets up, then the rig lands on top (verified:
                         scene sandbox, 2 segments, card still HJ-1's twin GV-1)
bare index.html          sandbox, untouched
drawn-work warning       2 strokes + pick GV-1 → amber block, nothing loaded;
                         Cancel keeps both strokes; second click loads
file:// (no server)      ?ex=UF-1 boots s2 with q 0.80 and the card;
                         WE-1 d=8 applies its rig (4 segments), gauge (4.5,0.75),
                         q 0.50, level 1.412, and replaceState writes ?ex=WE-1
```

`EXPICK-04-file-protocol.png`.

**One boot-order bug found and fixed by this suite.** `?ex=` rewrites the
address bar, which dropped the `#rig=` hash before `RIG.hashCode()` read it, so
a combined link silently lost its rig. The code is now read **before** the
exercise runs and applied **after** `EX.ready`, so `#rig=` still wins over
everything — the rule RIGSHARE established.

---

## 6 · Screenshots

| file | shows |
|---|---|
| `EXPICK-01-menu-open.png` | the menu open from the bar button: 40 exercises, filter box, topic groups, id chips, "measure … · ?scene= … · settles in N s", `RIG ✓` tags, HJ-1 highlighted as current |
| `EXPICK-02-card-digit3.png` | HJ-1 at digit 3, settled: the card's personalised values, the green settled line, task, submit, caution, Reset and the README link — beside a live HYDRAULIC JUMP box |
| `EXPICK-03-rig-fallback.png` | FR-1 picked with the rig pack absent: settings and digit applied, the amber "draw the rig from the README" block |
| `EXPICK-04-file-protocol.png` | WE-1 with its rig over `file://`, no server |

## 7 · Notes for the next worker

- `EX` is a top-level `const` like `PICKER`, `CONTROLS` and `RIG` — reachable
  **bare** from a rig script but not on `window`. From a runner `eval` use
  `APP.EX` / `APP.pickExercise(id, digit)`.
- **`EX.pick` is synchronous for a scene-only exercise and asynchronous for a
  rig one** (RIG decodes on a promise). It returns `false` only for an unknown
  id; wait on **`EX.ready`** before reading state. Two test runs were lost to
  this before the handle existed.
- Navigating a test browser to the *same* URL differing only in the hash does
  **not** reload the document. One regression result was a false negative until
  the run went via a different URL first.
- The rig pack's note for UN-1 says "5 rungs, 0.28–0.84 m" where the README's
  rule is `0.14 × (1 + (d mod 6))`, i.e. six rungs from 0.14. The card shows
  both (the README rule as the rule, the pack note as the procedure); the
  README is authoritative and the discrepancy is worth one line in the pack.
- `settle` is a **sim-clock** target and the wait runs flat out. If a demo is
  later re-timed, that number is the only thing to change.
- Not done, deliberately: no demo folder was edited, so the READMEs do not yet
  say "or just pick it from the Exercises menu". That is the director's call and
  a separate pass — as is putting `?ex=<id>` on the worksheets in place of
  `?scene=<id>` plus a page of setup prose.
