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
rule and formula on the card. Keep that concise — the short layout (`steps`
and a `background` fold, below) is the current form; or use `setup` for ordered
steps rather than making `task` one long paragraph. An optional lecturer
notes link is not a substitute for any student instruction.

An exercise is **one scene plus one card plus one folder**, and optionally a
captured rig payload. Nothing is generated: each piece is written by hand,
and `exercises/_runner/check_pack.py` asserts that the pieces agree.

| piece | file | job |
|---|---|---|
| scene | `js/scenes.js` | the geometry, water and controls the demo boots into — or `"sandbox"` |
| card | `courses/<id>/exercises.js` | the machine-readable entry the picker reads: what is applied, what is printed (schema: the header of `js/exercises.js`) |
| rig payload | `js/exercises-rigs.js` | drawn segments and panel state, **captured** from the app, never hand-edited |
| folder | `courses/<id>/exercises/<ID>-<slug>/` | `README.md` (lecturer notes), `rig.js` (console spot-check), `collect_plot.py` when a class submits |
| index row | `courses/<id>/INDEX.md` | one line of navigation |
| menu entry | `courses/<id>/course.js` | the id in one of the course's sections |
| syllabus row | `docs/syllabus.md` | one row under its topic — id, type badge and a one-liner; **only once the exercise has been checked** |

Every exercise belongs to a course — the original teaching pack is the
course `original` (`courses/original/`), CIVE40008's Year 1 is
`courses/cive40008/` — see "Courses" under §3. `js/exercises.js` declares the
register (empty) they are all appended to, and its header is the card schema;
`exercises/` keeps only the shared tooling (`_runner/`) and an index of the
courses.

Worked example throughout: **HS-1**, the dyke with a piezometer
(`courses/original/exercises/HS-1-dyke-piezometer/`), a lecturer demo on a
scene written for it.

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
RIG-C — see the foot of `courses/original/INDEX.md`). A demo that needs both a scene and a
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

An entry in a course's `exercises.js`, appended to `EXERCISES` (declared in
`js/exercises.js`, whose header defines every field and, more importantly,
**the line between applied and displayed**):

| field | applied? | holds |
|---|---|---|
| `rigParams` | yes | the plumbing without which the rig is not a rig: `budget` (Resolution) first, then the edges (`openL..openT`), then supplies and levels — *edges before level controls*, because ticking a level opens its own edge |
| `viewParams` | yes | how it is looked at: `mode` (a `FIELDS` mode as a string), `particles`, `gaugeField` (what every gauge starts on — see *Gauges* below), `speed`, `channel`, `labels`, `jumps`, `grade`, `sline` (streamlines) and `slineN` (their density, ≈ tubes across the flow), `forceSize` (the Pressure force diagram's length multiplier, for a submerged face whose arrows would run into the opposite wall), `instReadouts` (the instruments' number boxes, default on) and `hoverCard` (the cursor's hover card, default on — FF-1 opens with it off), `avg` (every scene switch lands on Live; none of the pack asks for Average) |
| `gauges` | yes | `[{x, z, field}]`, at most four: gauges the card arrives with ALREADY PLACED, each on its own quantity. The exception to "the picker places no instruments", for a card whose subject is a time series from t = 0 (VC-2's level curve). The card lists them under *Already set* |
| `digit`, `digitNote` | **no** | the personalised rule the card prints; `base`+`step`·d, a `table`, `mod`, `also` |
| `studentParams` | **no** | values the worksheet asks the student to set — and the way a scene's own slider (a Geometry row `geomN`) gets onto the card: listed here, it is drawn on the card as a slider beside its `rule`. For a slider give a short `label` ("Speed of sound in water, c", "Wall shape", "Inflow Q") and **no** `rule`: a sentence under every slider made the Year 1 cards mostly slider, so what it does and its starting value go in `setup` |
| `instruments` | **no** | `{tool, where, why}` — where the gauges go; the picker places none and clears any a payload carried |
| `steps`, `background` | printed | **the short layout** (below): at most five one-line numbered steps, and a closed Background fold for definitions, formulas and remarks |
| `setup`, `start`, `task`, `note` | printed | the older layout: the staged steps, one line on the bench, one or two on what to do and read. A card with `steps` prints neither `start` nor `task` |
| `tabs` | — | one scene asked several questions: a list of tabs, each with its own steps and interface (below) |
| `aim` | printed in the menu | optional: one or two plain sentences on what the scene is and what the student does in it; the exercise menu prints it under the title instead of the `start · ?scene · settle` line, the start screen shows it on hover, the card does not |
| `settle` | yes | sim-seconds the picker runs flat out before the card counts down; `0` is meaningful |
| `rigWhy`, `instruments[].why` | neither | maintenance prose: why a constant is what it is |
| `ui` | yes | the interface profile, below |

`scene` is a `SCENES` id or `"sandbox"`; `rig` is a key into
`EXERCISE_RIGS` or `null`; `folder` is the folder name; `title` must equal
the README's H1 text. Tool ids for `instruments`: `wall erase valve spout
pour` (build) and `gauge rake tracer measure cv flux force` (measure).

HS-1's card applies nothing but `budget: "Medium"` and the view (`mode: "0"`,
`particles: true`), and carries no `digitNote`: it has no personalised
parameter, and the line is simply left out.

### The `ui` profile

`UIMODE` (`js/main.js`) derives a profile from the card and merges `ui` on
top:

- `instruments` narrows MEASURE to the tools it names; a card naming no
  build tool loses BUILD ("an exercise arrives with its rig built"); the
  Controls panel opens `"focused"`.
- `ui.build` / `ui.measure` / `ui.view`: `true`, `false`, or a list of ids.
  BUILD and MEASURE lists take tool ids; the VIEW list takes **button ids**
  (`legendBtn partBtn slineBtn chanBtn gradeBtn readBtn hoverBtn
  avgBtn`), because VIEW is a family of toggles. Dye is a MEASURE **tool**,
  `dye` (key **D**): press and hold in the water to release ink there. A card
  that offers it names it — `ui.measure: [..., "dye"]` — and a step says
  `{tool:dye}`. Nothing is dyed until a student releases it; a scene's fixed
  `dye.seeds` run only if the scene says `dye: { on: true }` or the card sets
  viewParams `dyeSeeds: true` (Controls → Dye sources). The `V` valve button lives
  in RUN and is never hidden. `readBtn` (**Readouts**, key **I**) folds away
  every instrument's number boxes — the gauges' corner cards, the Control
  volume's budget and face numbers, the flux sections' readings and their
  balance, the rakes' q / u_max chips and the Pressure force values — while
  the instruments stay placed and keep recording; `hoverBtn` (**Hover
  readout**) switches the cursor's card. Both are also Controls → View
  checks (`instReadouts`, `hoverCard`) and so `viewParams` keys. A card that
  lists VIEW should name them where it has instruments or a hover card.
- `ui.fields`: the `FIELDS` ids the legend offers (`water speed ehead head
  phead p vort froude mom`); if the live field is not among them, the first one
  is applied. `p` is the plain **Pressure** (kPa) — see *The Pressure field*
  below.
- `ui.panel`: `"full"`, `"focused"` or `"shut"`. `ui.controls` is a list of
  individual `CONTROLS` row ids when even a focused section contains more than
  the exercise needs; the section headings are retained automatically.
  `ui.legend: false` closes the legend. `ui.readouts`:
  `{gauges, cursor, status}` booleans and `rows: [...]` (the pressure in kPa
  is the row `p`, off by default; pressure head is `phead`), validated against
  `OVERLAY`'s row register. The hover card's TITLE — the open-channel
  profile class, "H2 profile" — is the row `profile`: a card with a `rows`
  list that does not name it never shows it (it used to appear whatever the
  list said).
- `ui.gaugeFields`: the quantities a gauge may plot here, by id (below).
  Narrows the corner card's selector, the inspector's rows and tabs and the
  Gauges plot select; it never narrows what is recorded or the CSV.
  `viewParams.gaugeField` must be one of them (`check_pack.py`).
- `ui.hide`: concepts withheld from the words on the canvas, for a card
  before the lecture that introduces them —
  `"energy"`: the Control volume's energy row and its Ė face labels (B
  cycles Q and M only), ρgQH on a flux section and the energy lost between
  two, and the reservoir marker's "· energy line" / "· head-driven" — it
  reads "reservoir level 3.16 m";
  `"critical"`: the profile class and the words critical / subcritical /
  supercritical on the hover card — an `Fr` row a card keeps reads "fast,
  shallow" / "slow, deep".
  Every Year 1 card before L7 carries `hide: ["energy", "critical"]`.
- `ui.fieldText`: `{fieldId: "text"}` replaces a field's one-line
  description in the legend's menu and the Controls Field note — HJ-2 says
  Froude is "above 1: fast and shallow; below 1: slow and deep" instead of
  naming critical flow.

All of these are labels, not locks: `⋯ Show everything` brings back the
full registry's words and quantities.

**Gauges.** Each gauge plots its OWN quantity: a small selector hangs beside
its corner card (under the ⤢), and the tabs in its Gauge inspector set the
same thing. A gauge goes three ways — a click on its mark with the Gauge
tool, the × in its corner card's top-right corner, or **× gauge** in its
inspector's header (the plain × there only closes the window) — taking its
own history with it; pressing the strip's Gauge button while the Gauge tool
is already in hand clears every gauge (the first press only arms the tool,
and the 5 key never clears). Every sample records every quantity — `p` (pressure, stored in
Pa, shown in kPa), `phead` (p/ρg), `u`, `w`, `speed` (|u|), `eta` (η),
`d`, `h` (piezometric head) and `H` (total head) — from the one batched
probe, so switching shows the whole history and the CSV (`⤓ CSV`) always has
every column at full precision. The register is `GAUGE_QTY` in `js/main.js`.
Controls → **Gauges plot** (`viewParams.gaugeField`) sets every gauge at
once and the quantity new gauges start on, which is what old worksheets
("set Gauges plot to Depth") and rigs mean by it. A gauge's own choice is
**not** in the rig wire format (no version bump): a rig carries the one
`ui.field`, applied to all its gauges.

**Rakes.** A rake reads the water around the point CLICKED: down to the
first solid, up to the first solid or the end of the water. In open water
that is bed → surface exactly as before; inside a pipe it is wall → wall.
A rake loaded from a rig (stored as x only) spans bed → surface. Every rake
in the scene is drawn on ONE velocity scale — the Speed field's held range
(the scene's `vmax` until the Speed legend is Fitted) maps to the rake's
nominal length — so rakes compare side by side and still water draws a
nearly flat line; a scale bar ("rake: 5 m/s") sits at the bottom left, and
a section faster than the range is clipped at 1.6× the length. The profile
is white over a dark casing, readable on every colouring.

Keep the profile as small as the exercise can manage: expose only the tools,
view toggles, fields and Controls rows that the student or demonstrator will
actually use. The `⋯ Show everything` escape remains available whenever an
unplanned control is needed.

**The rule that fails the pack:** a card whose `task`, `start` or `setup`
tells the student to draw, cut, erase or move something must declare a build
tool — `ui: { build: true }` or a build tool in `instruments` — or the tool
is silently absent. A profile is never a cage: the `⋯` on the strip restores
everything.

HS-1: `ui: { view: ["legendBtn", "partBtn", "readBtn", "hoverBtn"],
fields: ["water", "phead", "head"], panel: "shut", hide: ["energy",
"critical"], readouts: { rows: ["pos", "eta", "uw", "phead", "h"] } }` — the
Pressure force tool from `instruments`, the field key, the particle toggle
and the two readout switches, and a hover card limited to what an L3 student
has met (pressure head and piezometric head are taught in Statics).

### The short card layout: `steps`, `background` and inline icons

The Year 1 lecturer's verdict on the first cards was that they were verbose
and ran off the page. A card that carries `steps` is drawn in the short
layout:

1. the sliders on top (`studentParams`, short labels, no `rule`);
2. the tab bar, if the entry has tabs;
3. `steps`: **at most five**, one line each — the action and what to notice
   (`check_pack.py` fails a card with more);
4. `background`: a string or a list of paragraphs in a **Background** fold at
   the foot, closed whenever a card or tab is shown, open with one click — a
   definition (pressure head…), a formula, the data, a remark;
5. the collapsed *Already set* receipt.

There is no Start / Do paragraph (they repeated the steps) and no
Instruments line (the stations are in the steps). The dock body scrolls
inside itself, so a long Background never pushes the card off the page. A
card without `steps` (the upstream pack) is drawn as before from `setup`,
`start` and `task`.

**Inline icons.** A step or a Background paragraph names the strip items a
student must press, and the card draws that item's own icon and label in
line, read from the same `TOOLBAR` / `ICONS` spec the strip is built from, so
the two cannot drift:

| markup | draws |
|---|---|
| `{tool:force}` | a tool by its `TOOLS` id → [icon] **Pressure force** |
| `{btn:legendBtn}` | a strip button by its id → [icon] **Field & legend** |
| `{key:V}` | a key cap — **V** (the valve is just "press {key:V}") |

`"Pick {tool:force} and click the gate"` renders as "Pick [icon] Pressure
force and click the gate". An unknown id prints in amber on the card and
fails `check_pack.py`. `EX.plain(text)` spells the markup out in words.

### Tabs: one scene, several questions

The contraction rig is one scene asked about streamlines in L4, continuity
in L5 and forces in L6, so it is ONE entry, CR-1, with three tabs:

```js
{ id: "CR-1", title: "The contraction rig", scene: "contraction",
  rigParams: { budget: "Medium" }, settle: 25, studentParams: [...],
  ui: { panel: "focused", hide: ["energy", "critical"] },
  tabs: [
    { key: "streamlines", label: "Streamlines", alias: "FF-5", topic: "…",
      title: "…", aim: "…", viewParams: {...}, ui: {...}, steps: [...], background: [...] },
    { key: "continuity", label: "Continuity", alias: "VC-1", instruments: [...], … },
    { key: "forces", label: "Forces", alias: "MM-2", … } ] }
```

A tab's own fields replace the entry's (`viewParams` and `ui` are merged over
the entry's, shallowly) — `title`, `aim`, `topic`, `steps`, `background`,
`instruments`, `studentParams`, `note`, `ui`, `viewParams`. The scene, the rig,
`rigParams` and `settle` are the entry's alone: **switching tabs does not
reload the scene or restart the flow**. It swaps the steps and the interface
profile (fields, strip buttons, tools, gauges, `hide`, …) and applies the
tab's view; placed instruments, the clock and the student's slider values
carry on. The card shows a tab bar under its title.

Addressing: `?ex=CR-1&tab=forces` opens a tab directly (the address bar
follows the tab), `"CR-1#forces"` is the same in a course menu or
`APP.pickExercise`, and a tab's `alias` — the id the question had before it
became a tab — still works as `?ex=MM-2`. A tab without `title` is called
"<entry title> · <label>" in menus; one with `topic` is listed under that
topic in the register view. `check_pack.py` checks the tab keys and labels,
that an alias collides with no id, and runs every per-card check on each
tab's merged view (reported as `CR-1#forces`).

### The Pressure field

`FIELDS` has a plain **Pressure** colouring: id `p`, mode 8, p in kPa above
atmospheric. The solver carries the kinematic pressure P = p/ρ, so
p = ρP (kPa = P numerically, ρ = 1000 kg/m³). Unlike every head it does not
divide by g, so it means the same in a plan view (gravity ≈ 0), where pressure
head is p/0.001. Its default range is the hydrostatic scale ρg·`headMax`
under gravity, a scene's own `pRange: [lo, hi]` (kPa) where it gives one
(`vane`: 0–10), and otherwise in a plan view the live field's spread, fitted
the first time Pressure is shown and then held — a plan view's pressure sits
on an arbitrary, slowly creeping reference (`body`: ~37 kPa), so no fixed
number would show its ±0.2 kPa. The hover card's row id is `p`
("pressure p … kPa"); the gauge quantity `p` already existed.

Up to L6 the Year 1 cards show **Pressure**, not pressure head (lecturer,
Oct 2026) — except HS-1, which offers Pressure head and Piezometric head,
because the piezometer's one level is what piezometric head shows.

### The menu: `aim`, courses, tabs

The exercise menu (Exercises / `E`) lists the whole register by `topic`,
unless a **course** is active. A course is a file `courses/<id>/course.js`
that registers its menu, loaded by one script tag in `index.html`;
`?course=<id>` selects it, as does a course's `hosts` on that hostname (see
"Courses" below):

```js
COURSES.add({ id: "cive40008", title: "CIVE40008 · Year 1",
  sections: [{ title: "Fundamentals", ids: ["FF-1", "UP-1"] }, …] });
```

A menu id may name a **tab**: `"CR-1#forces"` lists that tab under its
section (its own `title` and `aim`) and opens the card on it; choosing another
tab of the exercise already on the bench switches tabs in place.

The menu is **compact** (one line per item, id and title; the entry's `aim`,
or for entries without one the `start · ?scene · settles in N s` line, in a
small floating box beside the item on hover or arrow-key highlight) and
**collapsible** (section headings only; one opens at a time; the current
exercise's section opens by itself; a filter opens every section with a
match). Its height is capped to the viewport. A course may switch these off
(`compact: false`, `collapsible: false`), offer a link to the whole register
(`showAllLink: true`) or show the card's link to the brief (`briefLink:
true`); by default neither link shows. The start screen's list shows id and
title, with the `aim` as a hover tooltip.

The **Scenes** button and the `S` key are offered only while no exercise is
on screen (start screen, sandbox, a `?scene=` boot) or after ⋯ (show
everything): a student working an exercise needs only the exercise menu.
`?scene=` links always boot. The title chip names the loaded exercise by its
title, and the scene only when no exercise is loaded.

The strip's **Valves** button likewise appears
only where the bench has a valve — the scene's own, or one drawn — and goes
when the last drawn one is undone or the drawing cleared (a valve stroke
painted over with the eraser still counts — it is still in the stroke list).

A card whose only "Yours" rows are `studentParams` (no digit rule) heads
them "Try it yourself" rather than with the student-number line.

### Courses

A course is a folder, `courses/<id>/`, and everything in it is optional
except `course.js`:

| file | job |
|---|---|
| `course.js` | `COURSES.add({ id, title, sections, hosts? })` — the menu, in lecture order |
| `exercises.js` | `COURSES.exercises(id, [ …cards ])` — the course's **own** cards, in the card schema of `js/exercises.js` |
| `exercises/<ID>-<slug>/` | one folder per own card: `README.md` (lecturer notes, same rules as §5), `rig.js`, thumbnails |
| `INDEX.md` | one row per own card, in the columns §5 gives |

`index.html` loads each course with one tag per file, after `js/courses.js`:

```html
<script src="courses/original/course.js"></script>
<script src="courses/original/exercises.js"></script>
<script src="courses/cive40008/course.js"></script>
<script src="courses/cive40008/exercises.js"></script>
```

The original teaching pack (`courses/original/`, forty cards, HS-1 among
them) is a course like any other: its menu is the cards grouped by `topic`
— the sections the whole-register menu draws — and `hosts:
["barneydobson.github.io"]` makes it the main site's default, so that site
opens as it did before the pack moved. It is due to be retired; deleting the
folder and its two script tags is the whole job (CIVE40008's menu then skips
HS-1 until it has a new home). Its history documents
(`demo-programme.html`, `feasibility-sheet.html`, `CHANGES-NEEDED.md`,
`_director-status.md`, `_worker-recipe.md`) moved with it; the drawn-rig
payloads stay shared in `js/exercises-rigs.js`, keyed by exercise id.

**Own cards are still the register.** `COURSES.exercises` appends each card to
the one `EXERCISES` list, stamped with `course: "<id>"` and
`home: "courses/<id>/exercises"` (the directory its `folder` sits in), so
`?ex=<ID>`, `?menu=all`, the whole-register menu and the card's brief link
reach it wherever it is registered — the brief link is
`<home>/<folder>/README.md`, or `<home>/<folder>/` on the Pages build, where
Jekyll renders the README as the folder's page (`courses/` is not
underscore-prefixed, so it is published). **Ids are
global**: a card whose id or tab alias is already in the register is refused
with a console warning and `check_pack.py` fails the pack. A course's menu may
list another course's cards (CIVE40008 lists HS-1, which is the original
pack's) beside its own. Scenes stay in `js/scenes.js`, shared. Moving a card
between courses is `git mv` of its folder, its entry into the other course's
`exercises.js` and its INDEX row into that course's `INDEX.md`; a brief's
relative links do not change, because every brief sits at
`courses/<id>/exercises/<folder>/` (the app is `../../../../`, the course
index `../../INDEX.md`, `docs/` is `../../../../docs/`).

**Which course is active**, first match wins: `?course=<id>` (remembered for
the visit; `?course=none` clears it for the visit, and that is remembered
too); what the visit remembered; else the course whose `hosts` lists the
page's hostname. So a lecturer's own deployment opens on their course with no
parameter — CIVE40008 declares `hosts: ["mvreeuwijk.github.io"]` — while the
same build on any other host, or from `file://` (empty hostname), behaves as
before. Hostnames are bare and lower-case (no scheme, port or path); two
courses may not claim the same one. With a course active the start screen
and the Exercises menu list only its sections; the register is a
`showAllLink: true` (menu foot) or `?menu=all` away.

`check_pack.py` gives every card the same guarantees — folder
and README under `home`, an H1 that matches, a row in the course's
`INDEX.md`, no orphan rows or folders — and adds the course ones: every
`course.js` and `exercises.js` is loaded by `index.html`, ids are unique
across the register and every course, a course's `exercises.js` registers
only under its own id, `hosts` is well-formed, and every id a menu lists
exists.

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

`courses/<id>/exercises/<ID>-<slug>/`, and `check_pack.py` insists on the first two:

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

Then one row in the course's `INDEX.md` (`| ID | short title | folder/ |
what it runs on | what students submit |`), and the id in a section of its
`course.js`.

**The syllabus row is earned, not written with the card.** `docs/syllabus.md`
(the GitHub Pages page the README links) carries only the exercises
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
panel or readout row that does not exist, a gauge quantity outside
`GAUGE_QTY` (or a `viewParams.gaugeField` it does not offer), a `hide`
concept other than `energy` / `critical`, or a `fieldText` key that is not a
field; a card's `gauges` entry is malformed; a drawing task hides BUILD; a
card has more than five `steps`, or its inline markup names a tool or button
that does not exist; a tab has no key or label, repeats a key, or its alias
collides with an id (every check above runs on each tab's merged view); or a
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
