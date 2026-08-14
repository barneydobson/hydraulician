# DOCS — the READMEs learn about the exercise picker

Maintainer's complaint: *"I am not clear how to set up an exercise."* Every
folder's README opened with prose setup — load `?scene=x`, set these sliders,
paste `rig.js` — which is unusable in a lecture. Each README now opens with a
six-line **How to start (30 seconds)** block built on the picker, and the old
prose is kept, intact, as the labelled fallback.

Written against the **revised** picker contract (coordinator, mid-task): the
picker supplies the same starting point for everyone — scene, Resolution
Medium, the rig geometry and the few control values without which the rig is
not a working rig, each labelled on the card as already set. It **displays but
does not apply** the student's personalised parameter, any coupled value the
worksheet asks them to derive, instrument placements and staged sequences.
Every quick-start block says so: *the card prints your value, you set it*.

**No code was touched.** Markdown only.

---

## 1 · Files touched

| file(s) | change |
|---|---|
| `exercises/*/README.md` (**40**) | new first section **`## How to start (30 seconds)`**, inserted after the title/refs block |
| `exercises/*/README.md` (**39**) | `## N · Lecturer setup (before class)` → `## N · Manual setup (fallback, or for building it yourself)` + one italic line saying what the picker already did |
| `exercises/PU-1-system-curve/README.md` | same, on `## 1 · The rig` (it has no "Lecturer setup" heading) |
| `exercises/*/README.md` (**38**) | worksheet **first step** rewritten: press `E` → pick the id (or `?ex=<ID>`) instead of typing a `?scene=` URL |
| `exercises/*/README.md` (**38**) | standing rules keep Resolution Medium but now read `Resolution: Medium (the picker sets this)` — nothing deleted |
| 9 READMEs | `paste rig.js into the console` marked as the by-hand/fallback path |
| `exercises/INDEX.md` | new **Running an exercise** block; ID column headed `ID (= ?ex= id)` |
| `exercises/_code-changes/DOCS-report.md` | this file |

Section **numbers** were kept (`## 2 · Manual setup…`, not `### Manual setup…`)
because a dozen READMEs cross-reference their own sections as "§2", "skip to
§2", and NC-1's Appendix A carries a second, preserved `### A.2 · Lecturer
setup` that must not be confused with the live one. The heading text is the
one the brief asked for; only the level and number are unchanged.

The quick-start block sits after the title/refs paragraph and **before** the
front-matter prose (status blockquotes, "what this demo is", headline
findings). That makes it the first thing on the page, which was the point.

Every block carries, in order: open the app (`http://localhost:8124/`, or
double-click `index.html`) · press `E` / `Exercises ▾` and pick the id · type
your digit and set what the card prints · (five demos) work the card's
numbered steps · settle · task + submit. Then the `?ex=<ID>` link on its own
line, then one paragraph saying exactly what the picker does and does not do.

Verification records, Director-report appendices, collection/plot sections and
every measured number were left alone.

---

## 2 · Cross-check against `js/exercises.js`

Scripted, all 40, against the live file:

```
ids present in front matter                40/40
scene declared in code mentioned in README 40/40   (sandbox demos: "sandbox")
digit rule base+step found verbatim        12/12   (e.g. "0.42 + 0.03")
digit lookup tables found in README         9/10   (see DA-3 below)
digitNote rules (stations, drawn gaps,
  lip types, level pairs, λ thirds)        22/22 fragment-matched
submit field names present in README       40/40
INDEX ids vs code ids                      40/40, no extras, no missing
INDEX folders vs code folders              40/40
```

**No README-vs-code disagreement was found.** Nothing had to be harmonised in
either direction. Two things that look like disagreements and are not:

- **DA-3's q/reservoir tables** are not printed in DA-3's README. They are
  DA-1's tables, value-for-value (checked), because DA-3 deliberately reuses
  *your own* DA-1 third and only moves the Resolution. Its README says so.
- **UN-1's nozzle-gap ladder.** The README's rule `gap = 0.14 × (1 + (d mod
  6))` gives six rungs, 0.14–0.84 m, and its own table prints exactly those
  six. `exercises.js` carries the same rule. The **rig pack's** note (`5 rungs,
  0.28–0.84`) is the odd one out — already flagged in EXPICK §7. The READMEs
  were written to the README/`exercises.js` rule; the pack note is the thing to
  fix.

---

## 3 · Demos whose setup does not reduce to "pick it and go"

Not failures — each one is called out on its own card and now in its own
quick-start block.

| demo(s) | why the picker cannot finish the job |
|---|---|
| **PU-1, B9, QS-2, DA-2, CS-1** | the rig needs an ordered sequence a snapshot cannot hold (prime the main, then throttle it; fill tank 1, *then* shut the valve; cut your own throttle, then pre-charge). The card lists them as numbered steps; the quick-start block adds a step pointing at them. |
| **15 drawn / poured / station demos** (GV-1, NC-1, NC-2, B3, QS-1, B1, B2, UN-1, UN-3, HP-1, MO-1, B8, CS-1, QS-2, B9) | the personalised parameter is a stroke you draw, a level you pour or a station you stand at — no slider exists for it. Their step 3 says the card *prints* it and you draw/place it. |
| **LL-2** | personalised by partner A's hidden stroke — there is no digit at all. |
| **B5** | assigned by pair-cell, not by digit, **and** half the cells run on `wavesurge` while `?ex=B5` boots `wave`. Those pairs must switch scene themselves; the worksheet already told them to and still does. |
| **WV-1, WV-2, NC-3, HJ-1** | second-cohort / Part-B / coda runs on a *different* scene (`waveshallow`, `wavedeep`, `m2`, `s1`) from the one `?ex=` boots. The quick start covers the main run; the extra run stays a worksheet step. |
| **B2** | two legs in one sitting (c = 70, then c = 140). The picker gives leg one. |
| **DA-3** | it is a *second* reading on the rig you already built in DA-1, and its whole point is leaving Medium behind. `?ex=DA-3` rebuilds your λ third for a cold start; its worksheet now says so, and its standing rules were left alone (they deliberately do not say "Medium"). |
| **GV-2** | nothing to set up: an empty sandbox is the exercise. Settle is 0 and the quick start says "start drawing". |
| **MO-2, HP-2** | lecturer demos with no student worksheet to rewire. Their build sections now name the picker; MO-2's "or paste `rig.js`" is labelled as the by-hand path. |

---

## 4 · Re-checked against the rewritten `js/exercises.js`

The picker worker's schema change (`rigParams` / `viewParams` /
`studentParams` / `digit`, plus `instruments`) landed while this pass was
running. Every fact these READMEs assert was re-verified against the **new**
file, and against the old one for drift:

```
ids · folders · scenes · settle seconds · submit fields   identical, 40/40
digit control / base / step / also-labels                 identical
digit lookup tables, digitNotes, rigTables                byte-identical
staged demos still exactly 5                              PU-1 B9 QS-2 DA-2 CS-1
```

So nothing written here needs re-cutting, and the three things this report was
going to raise are already resolved by that rewrite:

- personalised values have moved out of the applied set into `digit` /
  `studentParams` — the quick starts' "the card prints it, you set it" is now
  literally what the code does;
- `gauges` has become `instruments`, i.e. instructions, on 29 demos — the
  quick starts already say the student places them;
- `rigTable` still chooses the drawing (DA-1, DA-2, DA-3, B8), which is what
  the DA/B8 quick starts assume ("your λ third **with the geometry that goes
  with it**").

## 5 · Left for the maintainer

1. **`?ex=` boots one scene.** Six demos need a second one at some point in
   the sheet — B5 (half the cells are `wavesurge`), WV-1 (`waveshallow`),
   WV-2 (`wavedeep`), NC-3 (`m2` for part B), HJ-1 (`s1` coda), B2 (second
   leg at c = 140, though that is a slider not a scene). The worksheets still
   carry those steps; nothing is lost, but if a "second leg" affordance ever
   appears, that is the list.
2. **The rig pack's UN-1 note** still says 5 rungs, 0.28–0.84 m against the
   README's six rungs from 0.14 m (§2). One line to fix in the pack.
3. **Line wrapping.** New prose is wrapped at 78 columns like the rest of the
   pack, except a handful of standing-rules lines that now run a few columns
   long because `(the picker sets this)` was inserted mid-line rather than
   re-flowing a sentence carrying measured values.
4. Worth one read-through by the maintainer: **HJ-1**, **UN-1** (drawn digit),
   **PU-1** (staged) and **DA-3** (leaves Medium on purpose) are the four
   quick starts that carry the most judgement.
