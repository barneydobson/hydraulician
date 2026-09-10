# Making an exercise

How a teaching demo gets from an idea to a card in the picker, with every
file it touches and every rule the gates enforce. This is the how-to; the
*why* of the pack's shape is in the header of `js/exercises.js`, and the
model behind what the demo shows is in [numerics.md](numerics.md).

**Two audiences, two documents.** The in-app card is the complete student
exercise. The folder's README is for the lecturer: derivation, worked
answers, teaching notes and verification. A student must be able to perform
the task from the card alone, without opening the README or being referred
to it. HS-1's on-screen description is the model: state the starting setup,
where to measure, the action to take and the readings to compare afterwards.
For a calculation exercise, also put the necessary data, student-number
rule and formula on the card. Keep that concise; use `setup` for ordered
steps rather than making `task` one long paragraph. An optional lecturer
notes link is not a substitute for any student instruction.

An exercise is **one scene plus one card plus one folder**, and optionally a
captured rig payload. Nothing is generated: each piece is written by hand,
and `exercises/_runner/check_pack.py` asserts that the pieces agree.

| piece | file | job |
|---|---|---|
| scene | `js/scenes.js` | the geometry, water and controls the demo boots into — or `"sandbox"` |
| card | `js/exercises.js` | the machine-readable entry the picker reads: what is applied, what is printed |
| rig payload | `js/exercises-rigs.js` | drawn segments and panel state, **captured** from the app, never hand-edited |
| folder | `exercises/<ID>-<slug>/` | `README.md` (lecturer notes), `rig.js` (console spot-check), `collect_plot.py` when a class submits |
| index row | `exercises/INDEX.md` | one line of navigation |
| syllabus row | `syllabus.md` | one row under its topic — id, type badge and a one-liner; **only once the exercise has been checked** |

Worked example throughout: **HS-1**, the dyke with a piezometer
(`exercises/HS-1-dyke-piezometer/`), a lecturer demo on a scene written for
it.

## 1. Decide where the geometry lives

Two routes, and the choice is made by what the demo needs at boot:

- **A scene** (`js/scenes.js`) when the demo needs its own initial water
  (two basins at different levels, a full pipe, a still tank), named faces
  for the Pressure force tool, a scene valve, or a domain size the sandbox
  does not have. A scene's `solids()` polygons are rasterised and registered
  as pickable automatically; nothing else has to know about them.
- **A sandbox rig** (`rig: "<key>"` into `js/exercises-rigs.js`) when the
  demo is *drawn* — walls and valves a student could reproduce with the
  mouse — and the water arrives through the controls (a spout, an inflow
  level, a tailwater). A rig payload holds segments and panel state only; it
  cannot set an initial free surface or name a face.

Rigs for exercises that share a bench extend a family card (RIG-A, RIG-B,
RIG-C — see the foot of `INDEX.md`). A demo that needs both a scene and a
few drawn strokes is legal: the card names the scene and the rig.

## 2. The scene

A scene is an object merged over `base` in `js/scenes.js`; `SCENES.still(lev,
z, P)` is the hydrostatic fill helper. The fields a new scene usually sets:

```js
{ id: "dyke", name: "Dyke with a piezometer", key: "Hydrostatics",
  group: "Hydrostatics",                 // a new group name makes a new menu section
  blurb: "...", tips: ["...", "..."],    // the scene menu and the tip strip
  W: 6.0, H: 5.1,                        // metres; the grid is sized to a cell budget
  c: 25, cf: 0.01, cs: 0.16, nu: 2e-3,   // celerity, wall friction, Smagorinsky, eddy viscosity
  mode: 0,                               // the field it boots on
  hmax: 4.2, headMax: 3.3, vmax: 4,      // legend ranges for the water, p/ρg and speed fields
  valveOpen: 0, particles: 1,            // scene valves start shut; tracers on
  open: [0, 0, 0, 0],                    // L R B T — 1 opens an edge
  solids: () => [ /* GEOM polygons with named faces */ ],
  valves: () => [[5.00, 1.00, 5.00, 1.60, 0.08]],     // [x0,z0,x1,z1,th], kind 128
  water: (x, z, P) => (z <= 1.00 ? 0 : x < 5.00 ? still(4.00, z, P) : still(3.10, z, P)),
  spinup: 0 }                            // MEASURED settle time, or 0 when watching from t=0 is the point
```

**Geometry as polygons.** Prefer `solids()` returning `GEOM.rect` /
`GEOM.slab` / `GEOM.poly` over `walls()` segments: a polygon carries named
faces (`{id, label, e0, e1}` over consecutive CCW edges) so the Pressure
force tool shows "Upstream face" rather than "Face A". `GEOM.rect` numbers
its edges bottom 0, right 1, top 2, left 3. Wind CCW — the outward normal is
derived from the winding, and a clockwise polygon reports every force into
the water. `walls()` still works as a shim for flat beds.

**Topology, once.** In a vertical section any passage from one water body to
another separates the solid above it from the solid below. A culvert under a
dyke therefore makes the dyke a separate polygon from the ground, and a
piezometer slot from the culvert roof to the crest splits the dyke again —
HS-1 is exactly three polygons (a ground slab, an embankment-shaped upstream
block, a rectangular downstream block), and no single simple polygon could
draw it.

**The contracts** from AGENTS.md still bind: ground solid below `z = 0`
(start polygons at `z = −0.5`), butt-ended segments, a bed above `z = 0`, a
subcritical reach with a real downstream control, tailwater ≥ 1.3 d_c.
`docs/boundary-conditions.md` has every boundary mechanism.

**Adjustable storage dimensions.** Declare sliders in `params` (key, label,
min/max/step/value and unit). `solids(W,H,P,params)` draws the chosen widths;
`water(x,z,P,params)` seeds water inside those same bounds. Set
`resetWater: true` on a storage dimension when changing it defines a new
experiment: `SIM.setParam` then restores initial water and t = 0. State that
behaviour on the card. Ordinary geometry controls such as gates can keep
water moving and omit this flag. Parameters travel with saved rigs. A
student-number rule names the matching `geom0`…`geom3` control in `digit`
and `digit.also`; it prints the assignment, and the student sets the widths.
Keep duct dimensions and the numerical grid fixed when comparing storage.
Measure the prediction error across all ten assigned values.

**Measure, do not guess.** `spinup` is the time for the profile to stop
moving, from a headless run (§7). HS-1 boots at rest, so its `spinup` is 0
and the number that matters — about 45 s for the slosh to die after V — is
stated in the brief instead.

**Still water has to be able to become still.** A basin filled by a jet
keeps a trapped eddy for minutes at water's own viscosity: on HS-1 the
levels were equal from 40 s but both basins still carried 0.1–0.2 m/s RMS at
150 s. The Smagorinsky constant (`cs`) and the wall friction (`cf`) barely
touched it; the background viscosity did — `nu: 2e-3` took the basins under
5 mm/s by 45 s with the fill itself unchanged. A scene whose point is rest
sets `nu` to an eddy viscosity and says so in its comment, because `nu` is
not on the Controls panel and nobody will find it by hand.

## 3. The card

An entry in `EXERCISES` (`js/exercises.js`); the file header defines every
field and, more importantly, **the line between applied and displayed**:

| field | applied? | holds |
|---|---|---|
| `rigParams` | yes | the plumbing without which the rig is not a rig: `budget` (Resolution) first, then the edges (`openL..openT`), then supplies and levels — *edges before level controls*, because ticking a level opens its own edge |
| `viewParams` | yes | how it is looked at: `mode` (a `FIELDS` mode as a string), `particles`, `gaugeField`, `speed`, `channel`, `labels`, `jumps`, `forceSize` (the Pressure force diagram's length multiplier, for a submerged face whose arrows would run into the opposite wall) |
| `digit`, `digitNote` | **no** | the personalised rule the card prints; `base`+`step`·d, a `table`, `mod`, `also` |
| `studentParams` | **no** | values the worksheet asks the student to set |
| `instruments` | **no** | `{tool, where, why}` — where the gauges go; the picker places none and clears any a payload carried |
| `setup`, `start`, `task`, `note` | printed | the staged steps, one line on the bench, one or two on what to do and read |
| `settle` | yes | sim-seconds the picker runs flat out before the card counts down; `0` is meaningful |
| `rigWhy`, `instruments[].why` | neither | maintenance prose: why a constant is what it is |
| `ui` | yes | the interface profile, below |

`scene` is a `SCENES` id or `"sandbox"`; `rig` is a key into
`EXERCISE_RIGS` or `null`; `folder` is the folder name; `title` must equal
the README's H1 text. Tool ids for `instruments`: `wall erase valve spout
pour` (build) and `gauge rake tracer measure cv flux force` (measure).

HS-1's card applies nothing but `budget: "Medium"` and the view (`mode: "0"`,
`particles: true`, `gaugeField: "h"`), and says `digitNote: "lecturer demo:
no personalised parameter"`.

### The `ui` profile

`UIMODE` (`js/main.js`) derives a profile from the card and merges `ui` on
top:

- `instruments` narrows MEASURE to the tools it names; a card naming no
  build tool loses BUILD ("an exercise arrives with its rig built"); the
  Controls panel opens `"focused"`.
- `ui.build` / `ui.measure` / `ui.view`: `true`, `false`, or a list of ids.
  BUILD and MEASURE lists take tool ids; the VIEW list takes **button ids**
  (`legendBtn partBtn dyeBtn chanBtn gradeBtn avgBtn`), because VIEW is a
  family of toggles. The `V` valve button lives in RUN and is never hidden.
- `ui.fields`: the `FIELDS` ids the legend offers (`water speed ehead head
  phead vort froude mom`); if the live field is not among them, the first one
  is applied.
- `ui.panel`: `"full"`, `"focused"` or `"shut"`. `ui.legend: false` closes
  the legend. `ui.readouts`: `{gauges, cursor, status}` booleans and `rows:
  [...]`, validated against `OVERLAY`'s row register.

**The rule that fails the pack:** a card whose `task`, `start` or `setup`
tells the student to draw, cut, erase or move something must declare a build
tool — `ui: { build: true }` or a build tool in `instruments` — or the tool
is silently absent. A profile is never a cage: the `⋯` on the strip restores
everything.

HS-1: `ui: { view: ["legendBtn", "partBtn"], fields: ["water", "phead",
"head"], panel: "shut" }` — gauges and force from `instruments`, the field
key and the particle toggle, nothing else on screen.

## 4. The rig payload, when there is one

The rig wire format is version 2 (`js/rig.js`): `segs` as
`[x0, z0, x1, z1, thickness, kind]` in metres (kind `255` wall, `128` valve,
`0` eraser, stamped in order so a later wall wins over an earlier erase), the
four `open` flags, `valveClosed`, the panel groups (`inflow`, `tailwater`,
`source`, `wave`, `hyd`, `dye`), `gauges`, `rakes`, `ui`, and optionally
`flux`, `cv`, `tracers`, `params`.

Never type one. Build the rig in the app (or with the folder's `rig.js`
through `SIM.addSeg`), then **Rig → Save** and paste the JSON into
`js/exercises-rigs.js` under the card's `rig` key, with the comment line
saying which `rig.js` function produced it. Coordinates in a recipe are
exact: rounding one makes a new geometry. Any key rename bumps `V` in
`js/rig.js` and breaks old links on purpose; the version gate accepts exactly
the current version.

## 5. The folder

`exercises/<ID>-<slug>/`, and `check_pack.py` insists on the first two:

- **`README.md`** — lecturer notes. H1 exactly `# <ID> · <title>`, followed
  by what the exercise teaches and an **Open it** link for the lecturer.
  Include theory and worked answers, the student-number rule and ten-value
  table when applicable, the teaching sequence, measured results and limits,
  and discussion points. The card carries every student-facing datum and
  step; the README explains and validates them rather than filling gaps in
  the on-screen instructions. If the notes say the class waits
  "about **N s**" in exactly that bold form, N must be the card's `settle`.
- **`rig.js`** — a paste-into-the-console object that does what the student
  does by hand through the same entry points (`SIM.addSeg`, `toggleValve`,
  `APP.probe`, `APP.faceForce`, `state.gauges.push`), and prints the numbers
  the brief quotes. It is the lecturer's spot-check and the record of how
  the numbers were measured.
- **`collect_plot.py`** — only when students submit something: pools the
  class CSV into `plots/pooled-demo.png`. A lecturer demo (HP-2, HS-1) has
  none.
- **`_archive/`** — untracked, local: the long verification record.

Then one row in `exercises/INDEX.md` (`| ID | short title | folder/ | what it
runs on | what students submit |`).

**The syllabus row is earned, not written with the card.** `syllabus.md`
(root — the GitHub Pages page the README links) carries only the exercises
that have been **checked**: run headless, measured, and read once more against
what the brief claims to teach. When an exercise passes that, add one row to
its topic's table — `**<ID>** · <title>` linking `[open it]` to
`…/?ex=<ID>` and `[brief]` to the folder, the type badge (demo = interactive
lecturer demo, quick = quick in-class exercise, tutorial = written tutorial
with simulation comparison; copy the `<span>` from an existing row), and a
one-line description. If its topic's section still says *Nothing here yet*,
replace that with the table. Topics and their order live in the syllabus's
Contents list — place the row where the topic teaches, not where the app's
menu files it.

## 6. What the gates check

`python exercises/_runner/check_pack.py` fails the pack when: a folder or
README is missing; the H1 id or title differs from the card; the INDEX row
is missing; a bold "about **N s**" disagrees with `settle`; a base/step
ladder disagrees with the rule; the `ui` profile names a tool, button, field,
panel or readout row that does not exist; a drawing task hides BUILD; or a
folder or INDEX row has no card. `check_notation.py` then greps the brief for
retired names (the y-family, old gauge keys). Both are instant and run in CI.

Then, locally with a GPU: `node exercises/_runner/smoke.js --only=api,rig`
boots every card and every scene (the PACK section), and `node
test/ui-smoke.mjs` proves the profile leaves the strip and legend as agreed.

## 7. Measuring before shipping

The render loop stops on a hidden tab, so headless work drives the solver
directly: `APP.tick(n)` steps, `APP.frames(n)` also fills gauge history,
`APP.probe(x, z)` returns `u, w, p, phead, f, speed` (so `h = phead + z`),
`APP.faceForce(solidId, faceId)` returns `{F, Fx, Fz, cop, wetLen}` in N per
metre, `APP.volume()` the water area the column reduction can see, and
`toggleValve()` the V key.

**`APP.volume()` is not a mass check** wherever water stands above a solid.
The column reduction walks each column up from the bed and stops at the first
solid it meets, so water over a soffit, on the far side of a slope or in a
pocket above a block is never counted. On HS-1 it rose by 0.13 m² across a
run in which nothing was created, because the wedge on the slope it cannot
see was shrinking. For a real conservation check integrate Σf directly:
`APP.boxForce(x0, z0, x1, z1).mass` over a box spanning the whole domain is
constant to four figures across the same run.

`test/cdp.mjs` is the portable driver (Node 22+, Windows/mac/Linux): serve
the repo, `launch()`, `open(url)`, `evaluate(expr)`. Two edges it has cost
time to learn: `APP.volume()` reads a cached column reduction, so call
`SIM.columns(true)` first after a rebuild or reset; and after
`APP.pickExercise(id)` await `APP.EX.ready` before reading anything. A single
`evaluate` times out at 60 s of wall clock, so run a long settle as a loop of
short calls from the Node side. On Linux, `exercises/_runner/runner.py` does
the same over CDP from Python.

For HS-1 the probe read the four levels, the RMS speed in each basin and
every face force with the valve shut and then for 90 s open, once per
candidate viscosity — the table in its README is that run.

## 8. Checklist

1. Scene written (or rig captured), booted with `?scene=`, geometry and
   water as intended, `spinup` measured.
2. Card written: self-contained like HS-1, with the start state, station
   locations, action and final readings; data/formulas and digit rule where
   needed. No student instruction refers to the README. Applied versus
   displayed values use the right fields, tool ids are real, and `ui`
   restores anything the derived profile would otherwise hide.
3. Folder: lecturer README with the exact H1 and measured numbers, `rig.js` that
   reproduces them, `collect_plot.py` if the class submits.
4. INDEX row; thumbnail in `docs/thumbs/` and the README gallery cell.
5. `check_pack.py`, `check_notation.py` clean; `smoke.js --only=api,rig`
   and `ui-smoke.mjs` run locally when `js/` changed.
