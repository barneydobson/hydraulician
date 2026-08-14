# README — friendly landing page, plus 40 exercise thumbnails

Maintainer's ask: *"can you make the readme a bit more of a friendly landing
page"* — one sentence on what it is and that it is primarily Claude-made, a
TOC, and four sections: Summary, Exercises (picture collage linking to the
hosted demos), Method, Developer.

**Docs and assets only.** `README.md` rewritten; `docs/thumbs/*.jpg` (40 new
files) generated from screenshots already in the repo. Nothing under `js/`,
`index.html`, `exercises/*/` or `CLAUDE.md` was touched. Not committed.

---

## 1 · What shipped

| file | change |
|---|---|
| `README.md` | rewritten, 247 lines: title + one-sentence description, try-it block, TOC, **Summary**, **Exercises** (40-thumbnail collage), **Method**, **Developer**, and a short appendix holding the material that fitted none of the four |
| `docs/thumbs/<ID>.jpg` | **40 new** thumbnails, one per exercise, `ID` exactly as in `INDEX.md` |

**Total added asset size: 406.6 kB** for 40 files — largest 16.9 kB (`NC-3`),
smallest 6.3 kB (`B4`), mean 10.2 kB. The 100 kB per-file target was never in
danger. Sources are the existing PNGs in `exercises/*/shots/` (1.1 MB+ each
folder, 149 files); nothing was re-shot and no runner was launched.

## 2 · Thumbnail pipeline

One-off script (kept out of the repo, in the session scratchpad). For each
chosen shot: crop dead margin → resize to 480 px wide → JPEG q80, optimised,
progressive.

The crop is content-aware rather than a fixed letterbox: luma > 55 marks
content, a row/column counts as occupied if 0.4% of it is content, 2% padding
is added back, and the box is then clamped to an aspect band (never wider than
2.2:1, never taller than 1.4:1) by growing the short side. That band keeps the
collage tidy — at `width="220"` every thumbnail renders 100–157 px tall.

Two crops were hand-set after measuring the row/column brightness profile,
because the auto box kept a large empty domain:

- **FB-1** `(265, 430, 1015, 769)` — the water occupies the lower-left quarter
  of a mostly empty frame; the auto box centred on the emptiness.
- **HJ-1** `(120, 155, 1120, 610)` — drops the app's top bar and the key /
  caption block, leaving the jump and its measurement boxes.

## 3 · Shot chosen per exercise, and why

Selection rule: the most legible, most *watery* frame, preferring one that also
shows an overlay or measurement; `*-fullui-*` shots (panel chrome) excluded.
The naming convention (`01-` scene/rig, `02-` measurement, `03-fullui-`) picked
the candidates; **every one of the 40 was then checked visually** on six
contact sheets before the set was generated.

| ID | shot | why |
|---|---|---|
| DA-1 | `01-lambda1.png` | reservoir → weir → nappe at full scale; `04-gauge-read` has the panel open |
| DA-2 | `03-mid-drain-gauge.png` | draining tank with the jet and the trace; the "filled" shots are static |
| DA-3 | `02-da1-high.png` | the higher-flow nappe; `03-gauge-reload` is a panel shot |
| HP-1 | `02-jet-probe-readout.png` | vivid speed field in the penstock; `01` is mostly dark duct |
| HP-2 | `01-rig-ready-flat-plate.png` | dark frame, bright jet on the plate — and keeps HP-2 visually distinct from MO-2, which shares the rig |
| NC-1 | `05-m3-cursor-n-read.png` | the demo runs on **m3** (m1 was withdrawn), and this is the m3 frame with the profile card |
| NC-2 | `02-measurement-rake.png` | the rake readout on a supercritical chute — exactly what the demo measures |
| NC-3 | `01-s2-cursor-readout.png` | the s2 sweep with the S2 profile card; `02-m2-anchor` is the secondary scene |
| QS-1 | `02-draining-gauge-trace.png` | tank, arcing jet, falling-head trace; `01` is a heavily zoomed, blocky closeup |
| QS-2 | `02-gauges-mid-equalisation.png` | both tanks at different levels mid-equalisation |
| UN-1 | `01-nozzle-steady.png` | the head field through the nozzle is the most legible frame in the set |
| UN-2 | `02-establishment-rising.png` | flow rising in the pressurised duct, with the trace |
| UN-3 | `02-oscillation-trace.png` | standpipe plus the surge trace |
| WV-1 | `01-train-established-deep.png` | an established wave train |
| WV-2 | `01-two-gauges-vertical-wave.png` | wave over the beach with both gauges |
| WV-3 | `01-standing-wave-envelope.png` | the standing-wave envelope, which is the measurement |
| MO-1 | `02-vena-hover.png` | gate, jet and the H3 profile card |
| MO-2 | `04-45deg-momentum-flux.png` | the deflected jet on the 45° vane; light frame, distinct from HP-2 |
| FR-1 | `02-gauges-head.png` | head field down the duct; `01` is the same rig without the colour |
| LL-1 | `01-vorticity-wide.png` | vorticity through the expansion — the separation is the point |
| LL-2 | `02-hgl-kink-bracketed.png` | four gauge traces bracketing the hidden throttle |
| PU-1 | `02-gauges-flange-sump.png` | sump, riser and the head field |
| WE-1 | `02-gauge-read.png` | weir with the nappe and the head gauge |
| UF-1 | `02-cursor-readout.png` | S2 chute with the profile card |
| FB-1 | `01-subcritical-dip.png` | ambiguous: both frames sit in a mostly empty domain; `01` shows the surface dip over the hump more clearly than `02-choking-froude`, and the hand crop rescues it |
| FB-2 | `02-brink-closeup.png` | the brink itself, the best-looking frame in the pack |
| HJ-1 | `02-measurement-jumpbox.png` | the jump with its measurement boxes (hand-cropped to drop the top bar and key) |
| GV-1 | `02-hover-readout.png` | the M1 reach plus the profile card; `04-weir-face` is a thin detail |
| GV-2 | `02-S1-S2-S3.png` | ambiguous (7 frames): this one carries three labelled profiles *and* a jump box, so it advertises the safari best |
| CS-1 | `02-first-spill.png` | the moment the chamber spills, which is the exercise |
| B1 | `02-square-wave.png` | the pressure front mid-pipe with the trace; `01-valve-drawn` is a flat green duct |
| B2 | `02-trace-c70.png` | the surged duct with its trace; the c140 pair is the contrast, not the headline |
| B3 | `02-bore-y1-y2.png` | the bore with its conjugate depths |
| B4 | `01-trails-three-depths.png` | weakest of the 40 — the trails are faint against deep water — but `02` is a documented bad zoom and `03` is panel chrome |
| B5 | `01-spilling-wave-t2.1.png` | ambiguous (7 frames): the spilling wave on the beach beats the flat two-probe frame |
| B6 | `02-nonlinear-profile-peaked-crest-flat-trough.png` | peaked crest / flat trough is the whole demo |
| B7 | `02-measurement-gauges.png` | the contraction with the speed field |
| B8 | `01-sharp-edge.png` | tank vorticity plus the jet through the sharp lip |
| B9 | `02-junction-flowing.png` | all three tanks with the junction running |
| B10 | `intact-crest.png` | ambiguous, and the one judgement call to re-check: `separation-moment.png` is the phenomenon the demo is named for, but at thumbnail size the separated column reads as a pale smudge, while `intact-crest` shows the head field and the flow over the crest clearly. Legibility won. Non-standard filenames in this folder (no `01-`/`02-` prefixes). |

## 4 · Content moved, not deleted

Everything in the old README that fitted none of the four sections was kept:

| old README material | where it went now |
|---|---|
| Controls table | **Appendix**, and corrected against `js/main.js`: the old table said `1`–`5` (wall · erase · valve · gauge · rake); `TOOLS` actually has **seven** (wall · erase · valve · spout · gauge · rake · tracers) and the key handler binds `1`–`7`. Zoom/pan keys (`wheel`, middle-drag, `0`, `+`/`−`) added from the same handler |
| "What it demonstrates" — the verified numbers (hammer 39.0 vs 41.1 m, period 3.0 vs 2.8 s; Torricelli 5.62 vs 5.8; venturi 19.4 vs 20.3; conjugate depth −5%; m2 mass balance) | **Method**, final paragraph, as the validation record |
| "What it demonstrates" — the tour of jets, jumps, profiles, rakes, dye, waves, plan view | condensed into the first two sentences of **Summary** (the scene list and its blurbs already live in `js/scenes.js`, and the `S` menu prints them) |
| "Honest limits" — grid-delivered roughness; celerity is not water's | **Summary** ("not for") and **Method** (assumptions), where they carry more weight |
| "Honest limits" — short zone-3 reaches; Smagorinsky closure; wave damping by resolution | **Appendix**, kept nearly verbatim; the pooled-classwork corollary (pin the resolution) was added from the feasibility sheet |
| "Credit" — hydraulics-fun and Pavel Dobryakov's WebGL-Fluid-Simulation | **Appendix**, last line. This exists nowhere else in the repo — `CLAUDE.md` names the sibling project but not the WebGL-Fluid-Simulation lineage |
| Pages set-up steps (make the repo public; Settings → Pages → Source = GitHub Actions) | **Developer**, "Deploying" |

New material in Developer that was not in the old README: the file map, the
"classic scripts on purpose" rule, the pointer to `CLAUDE.md` as the
contributor briefing, how to add a scene and an exercise, the `_runner`
harness and the `APP.*` debug handles, and where the teaching pack, the
director status and `CHANGES-NEEDED.md` live.

## 5 · Verification

- **All 40 `?ex=` ids resolve** against `js/exercises.js` (40 unique links in
  the README, 40 ids in the file, no id in either that is missing from the
  other). Ids were cross-checked against `exercises/INDEX.md` as well.
- **All 40 `docs/thumbs/*.jpg` paths exist**; all 45 relative links in the
  README (exercise folders, `INDEX.md`, `CHANGES-NEEDED.md`, `CLAUDE.md`,
  `_runner/HOWTO.md`) resolve to real paths.
- **Table syntax:** four tables, every row in each with an identical pipe
  count (collage 10 rows × 4 cols, backups 5 rows × 4 cols including headers,
  file map, controls). The collage cells are `<img>` inside a link, which
  GitHub renders inside table cells.
- **TOC anchors** match the generated heading slugs, including the em dash in
  the appendix heading (`#appendix--controls-limits-and-credit`).

## 6 · For the maintainer to check

1. **B10's thumbnail** — `intact-crest` over `separation-moment`; swap the two
   filenames in the script if you would rather advertise the failure moment.
2. **B4's thumbnail** is legitimately dull (faint orbit trails on flat blue).
   A fresh screenshot with the trails better established would lift it.
3. **The in-app key legend in `index.html` says `1`–`6` tools**, but `TOOLS`
   in `js/main.js` has seven and the handler binds `1`–`7`. The README now
   says seven. `index.html` was out of scope here, so the legend is unchanged.
4. The Pages URL is quoted as live-once-public, per the old README.
