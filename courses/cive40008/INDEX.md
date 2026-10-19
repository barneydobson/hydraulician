# CIVE40008 · Year 1 — course index

The exercises CIVE40008 (Fluid Mechanics, Year 1, Imperial College London)
owns: their cards are in [`exercises.js`](exercises.js), their lecturer
briefs in `exercises/`, one folder each (`README.md`, the
`rig.js` spot-check, a thumbnail where there is one). The menu students see — these, in
lecture order — is
[`course.js`](course.js); the plan behind it is
[docs/year1-programme.md](../../docs/year1-programme.md). Everything else in
the app's register is the original [teaching pack](../original/INDEX.md)
(every course: [exercises/INDEX.md](../../exercises/INDEX.md)).

## Running an exercise

Open the app with the course on: **`?course=cive40008`** (remembered for the
rest of the visit), or just open the lecturer's site,
`mvreeuwijk.github.io/hydraulician/`, where it is the default course
(`hosts` in `course.js`; `?course=none` shows the whole register for the
visit). The start screen and the Exercises menu (**`E`**) then list only this
course's exercises, in its lecture sections.

Direct link for a slide: **`?ex=<ID>`** — e.g. `?ex=FF-1`, or a tab:
`?ex=CR-1&tab=forces`. Every id in the ID column is its own `?ex=` id, with
or without the course. Picking one gives every student the same starting
point (the scene, Resolution Medium, the card's settings, labelled "already
set" on the card); none of these exercises has a personalised digit — they
are played with, and shown in class.

| ID (= `?ex=` id) | Demo | Folder | Runs on | Students submit |
|----|------|--------|---------|-----------------|
| FF-1 | A fluid deforms under any shear (wind over a lake) | FF-1-wind-lake/ | lake, wind stress τ slider | — (students play; class demo) |
| UP-1 | Pressure travels at the speed of sound | UP-1-water-hammer/ | pipeline, speed of sound c and overflow crest sliders | — (students play; class demo) |
| HS-1 | Dike with a piezometer | HS-1-dyke-piezometer/ | dyke | — (students play; class demo) |
| PF-2 | Pressure force: only the depth matters (wall shape) | PF-2-wall-shape/ | wall-shape, wall shape slider | — (students play; class demo) |
| FF-2 | The velocity field, and turbulence (spillway) | FF-2-spillway/ | spillway, bucket lip angle slider | — (students play; class demo) |
| FF-3 | Steady and unsteady flow (flow past a body) | FF-3-flow-past-body/ | body, body shape slider | — (students play; class demo) |
| FF-4 | Boundary layers: at a wall, in a jet (pipe jet) | FF-4-pipe-jet/ | pipejet | — (students play; class demo) |
| CR-1 | The contraction rig: tabs Streamlines (L4, was FF-5), Continuity (L5, was VC-1), Forces (L6, was MM-2), Energy (L7) | CR-1-contraction-rig/ | contraction, contraction length slider | — (students play; class demo) |
| VC-2 | Storage = in − out (tank that fills and leaks) | VC-2-fill-and-leak/ | fillleak, inflow Q slider | — (students play; class demo) |
| MM-1 | The force of a jet on an inclined plate | MM-1-jet-inclined-plate/ | vane, plate angle slider | — (students play; class demo) |
| HJ-2 | Momentum balance: sluice gate and hydraulic jump | HJ-2-gate-jump/ | gatejump, weir crest slider | — (students play; class demo) |
| WV-4 | How waves break on beaches | WV-4-breakers/ | beach (wall paddle), beach slope slider on the card | — (student-run preview) |
| WV-5 | Group velocity: waves travel slower than their crests | WV-5-group-velocity/ | wavetrain (hinged flap, one wave train per press of V), period and stroke on the card, two η gauges placed | — (showcase) |

Folders are relative to `exercises/` here. `check_pack.py` holds
this table to the cards: every card in `exercises.js` needs a row here and a
folder, and every row and folder needs a card.
