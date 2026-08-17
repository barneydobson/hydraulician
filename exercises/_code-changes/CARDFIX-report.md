# CARDFIX — the card says what it is and what to do, and stops there

Maintainer's ask, verbatim: *"in the interface a lot of the exercises are
over-described, or at least it's too complicated. Please just a heading for the
exercise, a short description of what the students start with, and a short
description of what to do, none of these different colours etc. I don't mind the
dropdown of 'already set for you', but it shouldn't give the number of items and
it shouldn't reiterate '(the same for everyone)'. Try to think about someone
actually using this. Remember I will be running it in class, so I can tell them
what to do - it detail doesn't need to be added in the panel, just keeping it
brief for someone looking at it not in class is more what we're going for. Also
don't worry about automating submitting the numbers - I will handle that in class
- so remove any way for them to submit results."*

**Files touched:** `js/main.js` (the `EX` card renderer, the menu row, the
Exercise panel help text), `js/exercises.js` (schema docs + all 40 entries),
`index.html` (card CSS). No solver, no scene file, no rig pack, no demo folder,
nothing committed.

## 1 · The card, top to bottom

```
HJ-1  Bélanger from a room full of flumes                              ×   <- draggable, unchanged
student number ends in [3]     your q = 0.51 m²/s (Inflow q slider)
                                    ·  tailwater = 0.538 m
Start: a chute onto a level apron, with a tailwater control
Do:    Set your q and its paired tailwater, let the jump settle on the
       apron, then read Fr₁ and y₂/y₁ off the jump box over ~10 s.
Also:  optional coda - switch to s1 (Scenes menu) for the same jump on a
       1-in-4 bed, tailwater 0.95 / 1.00 / 1.05 m …
▸ Already set
settling — 17 s   [↻ Reset to the starting point]   exercises/HJ-1-belanger/README.md
```

One style throughout: the panel's own text colour on the panel's own glass.
Audited with `getComputedStyle` over every node of a full card (FR-1, receipt
expanded): **zero elements off the base text colour**, and the only remaining
backgrounds are the header id chip (unchanged, as asked), the digit input, the
Reset button and the neutral grey tint inside the collapsed receipt. No green,
amber, blue or violet block anywhere.

Ten to sixteen lines per card, 40/40 (was 20–30 with the coloured blocks).

### What each row is

| row | source | notes |
|---|---|---|
| header | `id`, `title` | unchanged — same drag, same close button, same remembered position |
| digit row | `digit` + `digit.also` | label is now **"student number ends in"**. Once typed: `your q = 0.51 m²/s (Inflow q slider) · tailwater = 0.538 m` — plain inline text, no box, no heading, no per-value `rule` sub-lines. Still **applies nothing**, still sticky per exercise and per session, still recomputes on the keystroke |
| rule line | `digitNote` | only where the personalised thing is a stroke or a station and there is no value to print. Shortened to the rule, with the procedure left to the brief |
| `Start:` | **new `start` field** | one short line on what is on the bench |
| `Do:` | rewritten `task` | one or two lines, with what to READ folded in — that is where the old `submit` list went |
| numbered steps | `setup` | kept for the 5 staged rigs, plain `<ol>`, each step shortened |
| `Gauges:` / `Rake:` | `instruments[].where` | the stations, joined. `why` is no longer printed (it is entry maintenance, and it is in the brief) |
| `Also:` | `secondScene.when` | the 6 two-scene demos, one plain line where a violet block used to be |
| `▸ Already set` | `rigParams`, `viewParams`, `rigWhy` | summary row is exactly **"Already set"** — no item count, no "(the same for everyone)". Contents unchanged and still collapsed by default; the `rigWhy` reasons stay, trimmed |
| footer | — | `settling — 17 s` while settling and **nothing at all afterwards**, the Reset button, the brief path |

## 2 · Removed

| gone | was |
|---|---|
| `submit` field, all 40 entries | the `submit: Fr₁, y₂/y₁` chip on the card, and "measure …" on the menu row |
| `notes` field, all 40 entries | the flutter/caution paragraph at the foot of every card |
| the "YOUR VALUES — SET THESE YOURSELF" box | a green bordered block with a row per value and its rule underneath |
| the "you draw this" block | a blue block carrying `EXERCISE_RIG_NOTES[id]` — the whole erase-and-redraw procedure. `EX.drawNote` and its only call site are deleted; the rig pack's own file is untouched |
| the second-scene block | violet; now the plain `Also:` line |
| "settled at t = 35 s · reading now (t = 58 s) — after you set your own values, give it that long again" | the green "ready" state |
| the rig-Resolution caveat sentence | appended to every rig card's notes; the receipt already says `Resolution Medium` and `rig — the captured drawing` |
| the amber missing-rig block | still there when the rig pack is absent, but as one plain sentence |

Nothing in the app now says "submit", "Blackboard" or "post": grepped over the
serialised entries (0 hits) and over the rendered DOM of all 40 cards (0 hits).

**Two consumers had to move, not just the card.** `submit` also fed the exercise
menu (the row blurb and the filter). Both now use `start`, which is strictly
better: the menu reads `a steep chute running uniform flow, with your own inflow
to set · ?scene=s2 · settles in 26 s`, and typing `duct` in the filter finds
FR-1, LL-1, B10 and B7. The Exercise row's `info` popup in Controls described
the old card and was rewritten.

**`studentParams` stays in the data and is deliberately not printed.** It is
load-bearing for behaviour, not display: `studentControls` / `resetStudentControls`
read it to put every student-owned control back to the scene default after a rig
lands (EXFIX §3a). Every value-bearing entry it holds is already spelled out in
that exercise's numbered steps, so printing it again was pure duplication.

## 3 · The 40 strings, to skim

| id | Start: | Do: |
|---|---|---|
| `UF-1` | a steep chute running uniform flow, with your own inflow to set | Set your q, then hover mid-chute at x ≈ 3.5 m and read the MEASURED y_n off the hover box. |
| `GV-1` | the settled backwater pool behind a weir — nothing to set | Hover at your own station and read the depth off the profile box; the worksheet card turns it into a surface elevation. |
| `GV-2` | an empty sandbox — you draw every rig yourself | In pairs, draw beds, gates, weirs and tailwaters and collect as many distinct GVF chips as you can, screenshotting chip plus geometry each time. |
| `HJ-1` | a chute onto a level apron, with a tailwater control | Set your q and its paired tailwater, let the jump settle on the apron, then read Fr₁ and y₂/y₁ off the jump box over ~10 s. |
| `NC-1` | a natural-looking reach with the discharge hidden — keep the panel shut | Gauge x₀ and x₀ + 7, read the head fall F between them and h and n at the midpoint, then Q̂ = K√(F/L) with K = h^(5/3)/n. |
| `NC-2` | the steep flume at its own discharge; leave q alone | Rake your station, watch 15–20 s, pause on a typical moment and read u_max/V, then integrate 4–5 points off the curve into α. |
| `NC-3` | the steep flume, with your own inflow to set | Hover at x ≈ 3.5 m and read h and S_f, then τ₀ = ρg·h·S_f and D_min = τ₀/[0.056(ρₛ−ρ)g]. |
| `FB-1` | a level reach held at both ends, and a hump to grow at x = 4.5 m | Read y₁ at the gauge and commit a prediction Δz = E₁ − 1.5·y_c. Then grow a 1 m flat-topped hump at x = 4.5 m in ~7 steps, re-settling each time, until the crest chokes. |
| `FB-2` | a reservoir feeding a broad crest that spills over a brink | Set your q and its paired level, then read y_c off the q slider, y_crest at the gauge on the crest and y_brink at the last wet column on the lip, and order the three. |
| `WE-1` | an approach pool behind a sharp-crested weir | Set your q with its paired level, settle, then read the gauge card DEPTH h and take the head over the crest as H = h − 0.50. |
| `MO-1` | a pool behind a vertical sluice gate you draw yourself | Draw your own gate opening, set your reservoir level, then read y₀ at the gauge and y₁ by hovering the vena at x = 5.630 m, and work out C_d and the gate thrust. |
| `MO-2` | a horizontal jet from a spout striking a flat plate | Redraw the deflector four ways - flat plate, 45° ramp, 90° corner, deep-V - settling 3–5 s each, and watch the force follow the turn angle on Field > Momentum flux. |
| `FR-1` | a pressurised duct fed from a reservoir | Raise the reservoir to your own level, place the two gauges for h_f = H₁ − H₂ and hover mid-pipe for the bore-mean V. |
| `LL-1` | a pressurised duct that steps 0.40 to 0.80 m at x = 3.80 m | Set your reservoir level, hover either side of the step for V₁ and V₂ and read H₁ and H₂ off the gauges, then compare h_L with Borda–Carnot's (V₁−V₂)²/2g. |
| `LL-2` | a covered pressurised pipe, the same head for every pair | In pairs: A draws a hidden 2–3 cell obstruction in the covered run, B walks four gauges along it in three 20 s rounds to bracket the HGL kink and size k_L. |
| `PU-1` | a sump, a drawn rising main and a delivery tank, spout off | Prime the rising main as below, then set your own spout velocity and read Q by hovering the low-run bore and H as gauge 1 minus gauge 2. |
| `B10` | a flat pressurised duct with a crest you can lift mid-length | Set your reservoir level, interpolate the HGL at the hump station from the two gauges, then walk the crest soffit up until the crown head drops below 0.02 m - that height is z_sep. |
| `HP-1` | a 60 m penstock from a high reservoir, nozzle not yet cut | Draw the fixed 0.70 m throttle at x = 8.0 m and your own nozzle at x = 56.5 m, then hover mid-pipe for q and read the jet core speed in the Speed view at x ≈ 57 m. |
| `HP-2` | the jet-on-a-plate rig, as a lecturer demonstration | Run the two bookends of the jet rig - flat plate, then the capped deep-V - and compute F = ρqv(1 − cos θ) on the board: ≈3 480 against ≈6 840 N/m, the factor of two a Pelton bucket collects. |
| `UN-1` | a 60 m pipe from a reservoir to a valve, running steadily | Redraw the plate to your own nozzle gap, read the bore-mean V and the gauge head H₀, then press V to slam the valve and pause on the first flat top for H₁. |
| `UN-2` | the same 60 m pipe, running, with a valve to shut | Shut the valve, set your level, press R and let the tank settle; then open the valve and read the settled speed band as u_max and the first crossing of 0.9·u_max as t_90. |
| `UN-3` | the penstock, with a nozzle, tee and standpipe to build | Fit the nozzle, punch the tee, build your standpipe and gauge the shaft, then slam the valve and read y_max (first crest minus h₀) and the crest-to-crest period T off the Depth trace. |
| `B1` | the 60 m pipe with the shipped valve for you to replace | Draw your own valve, check it seals, gauge 3 m upstream of it, then slam it and pause on four consecutive peaks: T is the median of the three gaps. |
| `B2` | the 60 m pipe at the shipped celerity c = 70 m/s | Slam at c = 70 for ΔH₇₀, then reopen, set Slot celerity c = 140, press R, re-settle, re-read v₀ and slam again for ΔH₁₄₀. The ratio of the two surges is the pipe material. |
| `B3` | a full reservoir behind a dam, dry bed downstream | Pull the dam and time the surface at x = 1.0 m dropping clearly below its still-water mark, then reset and time the bore front between your own x₁ and x₂. |
| `QS-1` | a tall tank draining through an orifice, in slow motion | Predict the drain time on paper first, from t = (2A/(C_d·a·√2g))(√h₁ − √h₂) with A = 1.90 m, a = 0.12 m, C_d = 0.61 × 0.97. Then gauge low in the tank, switch the spout off and time the real fall on the status-bar clock. |
| `QS-2` | twin tanks joined by a valved pipe, both empty | Follow the steps to fill and isolate, then press V and time tank 1 falling from 2.00 m to your own h*. |
| `B7` | a venturi duct running full from a reservoir | Set your reservoir level, put both gauges at the SAME height - barrel and throat - for the pressure difference, and hover the barrel for q. |
| `B8` | a tank draining through a sharp-edged orifice | Draw your assigned lip, then zoom into the wall exit and read C_c as the narrowest jet core divided by the opening height (station x = 2.41 m, or 2.44 m for the Borda tube). |
| `B9` | three tanks on one junction, valve shut and both controls off | Follow the steps to hold A and C and pour B to your own level, then press V and read B's direction and the junction head 3 s later. |
| `CS-1` | a sewer feeding a CSO chamber with a spill crest | Cut your own throttle, pre-charge at dry-weather flow, then ramp the storm inflow until the chamber first spills over the crest, and read q off the hover over the sewer. |
| `WV-1` | a deep wave flume with a paddle at the left end | Set your period and stroke, zoom onto the paddle, then pause and read one crest-to-crest wavelength off the scale bar. |
| `WV-2` | a wave flume with a beach, paddle at the left end | Set your period and stroke, put two gauges on one vertical near the paddle - one low, one three-quarters up - then read each trace's peak-to-peak swing and divide bed by surface. |
| `WV-3` | a steep sea wall at the end of a wave flume | Set your period and stroke, slide one gauge along the flat run in 0.2 m steps, note the biggest swing and the smallest, and take K_refl = (a_max − a_min)/(a_max + a_min). |
| `B4` | the deep flume with a column of tracer particles | Set your period and stroke, zoom on the tracer column and raise the vertical exaggeration, then pause and read the VERTICAL extent of the surface trail against the bed trail. |
| `B5` | a wave flume with a beach; your cell decides which flume | Set your cell's period and amplitude, wait out spin-up plus 15–20 s of transit, then classify what the wave does on the beach - spilling, surging or dies - and count scale-bar lengths of surf. |
| `B6` | a long shallow flume with a paddle and two gauge stations | Set your period and stroke, then read H crest-to-trough and L from the lag between the two gauges over 20–30 s of cycles, and compute U_r = H·L²/h³ with h = 0.348 m. |
| `DA-1` | a broad-crested weir, drawn at your own scale | Set your scaled q and its paired reservoir level, then read the gauge depth h and report the head over the crest, H = h − P. |
| `DA-2` | a tank and orifice at your own scale, loaded empty | Follow the steps to fill and isolate, then press V and time the fall from h_start to h_stop on the status-bar clock. |
| `DA-3` | your own DA-1 weir, at the Resolution it was captured on | Keep your own DA-1 weir, q and level exactly as they are and change ONLY the Resolution, then re-read H at the same station and recompute C_d. |

`digitNote` (23 entries) carries the rules a slider cannot hold and was
shortened the same way — e.g. UN-1 went from a 3-line erase-and-redraw
procedure to *"your nozzle gap is DRAWN: gap = 0.14 × (1 + (d mod 6)) m, in two
pieces about y = 3.5"*. FB-1's and FB-2's were deleted outright: they restated
the rule the digit row now prints. The `secondScene.when` lines and the 20
`setup` steps were shortened in place.

---

## 4 · Test evidence

`exercises/_runner/runner.py --id CARDFIX` (plus `--id CARDFIXF` for the
`file://` pass), visible Chrome, hardware GL (ANGLE / RTX 2060). Both closed;
**zero orphans** (`status` reports `alive_pids: []`, no Chrome holds a debugging
port).

### 4.1 The five cards

| shot | what it shows |
|---|---|
| `CARDFIX-01-hj1-digit3.png` | HJ-1 with `3` typed in the field: the inline `your q = 0.51 m²/s (Inflow q slider) · tailwater = 0.538 m`, Start, Do, Also, collapsed `▸ Already set`, `settling — 2 s` in the footer — beside a panel still on the h23 scene defaults (q 0.500, tailwater 0.530) and a live HYDRAULIC JUMP box |
| `CARDFIX-02-fr1-already-set.png` | FR-1 at digit 4 with the receipt EXPANDED: 13 plain items, the two `rigWhy` reasons, the `Gauges:` station line — and `Reservoir level 2.50` on the panel while the card asks for 3.82 |
| `CARDFIX-03-wv1-second-scene.png` | WV-1: the `Also:` second-scene line as plain text |
| `CARDFIX-04-qs2-steps.png` | QS-2: four numbered staged steps, plain, under one `Do:` line |
| `CARDFIX-05-gv2-no-digit.png` | GV-2, the no-personalisation case: the rule line says so, and the card is 10 lines total |
| `CARDFIX-06-file-protocol-we1.png` | WE-1 over `file://` with no server: rig applied (4 strokes), 0 gauges, card complete |

Measured on 4.1: HJ-1's digit row printed `0.51 / 0.538` (the README's d = 3 row)
while `sim.p.inflow.q` stayed 0.500 and `tailwater.level` 0.530 — the display /
apply split EXFIX established is intact.

### 4.2 All forty, one pass

Every exercise picked in sequence at digit 6, awaiting `EX.ready`, card DOM read
each time:

```
40/40 rendered · JavaScript errors 0
"submit" anywhere in the rendered card text: 0 of 40
Already-set summary text: exactly "Already set" in all 40 (no count, no parenthetical)
elements with a non-transparent background beyond input/button/id-chip/receipt: 0
Start: line present 40/40    Do: line present 40/40
removed fields (submit, notes) still on an entry: 0
instruments placed by the picker: 0 in all 40      Resolution: Medium in all 40
card length 10-16 lines
```

### 4.3 Regression gate

```
digit stickiness   HJ-1 d7 -> 0.63 / 0.596 (README row); type 5 -> 0.57 / 0.567
                   instantly; pick UF-1 with no digit -> inherits 5 -> q 1.00;
                   back to HJ-1 -> its own memo 5. Panel untouched throughout
                   (inQ 0.500, twLevel 0.530)
reset              FR-1 d4: bench 2.50 / 2.50 / 5 segs / 0 gauges -> student
                   wrecks it (3.82, tailwater 1.00, extra stroke, a gauge) ->
                   Reset -> 2.50 / 2.50 / 5 segs / 0 gauges, digit still 4, card
                   still asking for 3.82. Their value is NOT restored (correct)
gauge inspector    GINSP.show(0) -> "Gauge 1", 900 samples, closeAll clean
exercise menu      40 rows; blurb now "<start> · ?scene=s2 · settles in 26 s"
scene menu         19 rows; opening either still closes the other
filter             "duct" -> FR-1, LL-1, B10, B7 (matches `start`, not `submit`)
?ex=WV-2           cold boot: scene wave, card up, Also: line present, 0 gauges,
                   ?ex=WV-2 in the address bar, 0 JS errors
file:// ?ex=WE-1   no server: WE-1, rig 4 strokes, 0 gauges, Medium, card complete
```

## 5 · Notes for whoever is next

- **The card is now the short form and the README is the long form.** If
  something has to be said, ask first whether the lecturer will say it or the
  brief already does. `js/exercises.js`'s header block spells this out so the
  next pass does not quietly re-grow the card.
- `instruments[].why` and `studentParams[].rule` are no longer rendered
  anywhere. They are kept because they document the entry (and `studentParams`
  drives the student-control reset), not because anything displays them.
- The digit `<input>` is still only written on `card.show()`, so a programmatic
  `EX.setDigit(3)` updates the printed value but not the field. Left as it was —
  writing the field on every refresh fights a user mid-keystroke.
- One string in the shipped screenshots was fixed after the first pass
  (GV-2's `start` had a second colon in it, which read badly under `Start:`);
  `CARDFIX-05` was re-taken.
