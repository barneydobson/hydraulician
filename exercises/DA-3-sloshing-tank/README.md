# DA-3 · Sloshing in a tank

## Lecturer notes

The tutorial-sheet exercise for dimensional analysis, in the style of the
network-model tutorial question: dimensional analysis used to *design* a set
of models. An analyst plans 125 models to chart the sloshing period T of
rectangular tanks; the Π groups cut that to one curve,
K = T√(g/d) = φ(B/d), and the app checks the claim.

1. Dimensional analysis to guide model building, (a)–(f), before the session: count the planned models (125); Buckingham
   with T, B, d, a, g, ρ; drop a/d for small tilts (5 models); then the
   dimensionless period K = T√(g/d), its shallow limit K = 2B/d (Merian), the
   deep tank where d cannot matter, and linear theory as K_theory(B/d).
2. In the session: five models, one per value of B/d (1, 2, 4, 8, 16),
   plotted on a chart of K against B/d that already shows K_theory and both
   limits. The five stand in for the analyst's 125; the chart then predicts a
   tank nobody modelled (20 m long, 2.5 m deep).

Every equation on the sheet is a native Word equation (OMML), so the sheet
can be edited in Word.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **DA-3**, or use the direct link
[`?ex=DA-3`](https://barneydobson.github.io/hydraulician/?ex=DA-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
The student handout is [`tutorial-sheet-questions.docx`](tutorial-sheet-questions.docx);
the tutor copy, [`tutorial-sheet.docx`](tutorial-sheet.docx), adds the
answers at the end, to 2 significant figures. `tutorial-sheet.py`
regenerates both and draws `tank.png`; it needs Word's own
`mathml2omml.xsl` (inside Microsoft Word.app) for the equations. Edit the
script, not the documents.

## Notation

As in the 4A15 register (`docs/notation.md`): B the tank length, d the
still-water depth, a the initial tilt (the surface's rise above d at the end
wall), T the period of the first sloshing mode, k = π/B its wavenumber.

## The scene

`slosh-tank`: a closed tank, 9.0 × 2.6 m domain, Δx = 15.7 mm at Medium. The
surface starts on the first mode, η = d + a·cos(πx/B), and is released at
t = 0; R releases it again. Controls → Geometry has Tank length B (1–8 m),
Water depth d (0.25–1.2 m) and Initial tilt a/d (0.05–0.3); each change
restarts the slosh. The tank's inner faces are snapped to the grid.

Students time the slosh with a Depth gauge at x = 0.5 m, crest to crest:
T = (t₄ − t₁)/3. Not closer to the wall: a gauge's depth is the overlay's,
smoothed over ±0.09 m, and at x = 0.35 m that window took in the wall's
zero-depth columns and read 0.2–0.3 m shallow. Not from the release: the
same depth has a 10%-per-frame running mean, which delays every crest by
about 0.15 s. Crest to crest the lag cancels; against t = 0 it would add up
to 3% to a short tank's period.

## Measured

Medium, timed by `rig.js` on the gauge's own trace exactly as the card says.
Theory: T = 2π/√(gk·tanh kd), k = π/B.

| B (m) | d (m) | B/d | a/d | d in cells | T (s) | T√(g/d) | theory | difference |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.0 | 1 | 0.2 | 64 | 1.198 | 3.75 | 3.552 | +5.6% |
| 2 | 1.0 | 2 | 0.2 | 64 | 1.713 | 5.37 | 5.235 | +2.5% |
| 4 | 1.0 | 4 | 0.2 | 64 | 2.857 | 8.95 | 8.755 | +2.2% |
| 8 | 1.0 | 8 | 0.2 | 64 | 5.372 | 16.8 | 16.40 | +2.6% |
| 2 | 0.5 | 4 | 0.2 | 32 | 2.077 | 9.20 | 8.755 | +5.1% |
| 8 | 0.5 | 16 | 0.2 | 32 | 7.477 | 33.1 | 32.20 | +2.8% |
| 4 | 1.0 | 4 | 0.1 | 64 | 2.908 | 9.11 | 8.755 | +4.0% |
| 4 | 1.0 | 4 | 0.3 | 64 | 2.844 | 8.91 | 8.755 | +1.8% |
| 1 | 0.25 | 4 | 0.2 | 16 | 1.646* | 10.3 | 8.755 | +18% |

The sheet's models A–E are B/d = 1, 2, 4, 8 at d = 1.0 m and B/d = 16 at
d = 0.5 m (the first four rows and the fifth). The rest are background for
the notes below. \* two crests only, T = t₂ − t₁.

- The two tanks of one shape agree to 2.8% in T√(g/d), the smaller one
  slower. That difference is the grid, not the analysis: at High
  (Δx = 11.6 mm) the pair reads 8.86 and 9.08 (+1.2% and +3.7%), and the
  16-cell tank +4.4% instead of +18%.
- Merian's shallow limit gives 7.22 s for the 8 m tank against 7.48 s
  measured and 7.27 s from the full theory.
- The deep tank (B/d = 1) is the most damped and reads furthest from theory
  among the well-resolved tanks.
- **Why a/d = 0.2, not small.** Surface waves in this solver are damped by
  resolution: a wave has to be several cells tall to survive an interface
  about two cells thick (engineering notes). At a/d = 0.05 on a 0.5 m tank
  the tilt is one cell and the slosh dies in two periods. Between 0.1 and 0.3
  the period moves by 2%, the smaller tilt slower, the same grid effect seen
  through the wave's height rather than its depth.
- **The grid as a missing variable.** The fewer cells span d, the slower the
  slosh: the app's counterpart of a model's Reynolds number. It is kept off
  the sheet, which is why every run but E is at d = 1 m.
- The first three crests from the RAW column (no gauge smoothing, x = 0.35 m)
  put the same-shape pair at 8.915 and 8.918: the grid's effect grows over
  the later, smaller cycles.

## Teaching sequence

1. Hand out the question sheet. Section 1 is on paper, before the session; the student copy ends with a short answer key (results only), the tutor copy with worked answers.
2. In the session each student runs the five models A–E of section 2 and plots
   K on the sheet's chart. Every run is a few seconds of simulated time; E,
   the longest, needs 30 s for its fourth crest.
3. Compare: the five points lie on one curve, 2–6% above linear theory, the
   deep tank (B/d = 1) furthest. The chart then gives the 20 m tank's period
   without a run: K ≈ 16, T ≈ 8.1 s.

## Console spot-check

Paste [rig.js](rig.js) into the console with the scene loaded and run
`DA3.sheet()`. It sets the Geometry sliders, places the gauge, runs the
frame loop so the gauge records what a student's does, and times the crests
for every row above.
`DA3.run(B, d, ad)` does one tank.
