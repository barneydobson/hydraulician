# The shelf and the readout — tool taxonomy, field registry, legend

**Date:** 2026-08-28
**Status:** approved, ready to plan
**Scope:** phase A+B of the interface redesign in
[issue #29](https://github.com/barneydobson/hydraulician/issues/29) and the
Instrumentation section of the [exercise catalogue](https://claude.ai/code/artifact/77b7c5b5-55f3-4cee-8e22-8656eb463f01)
(proposal 1, "a legend — objective 3, and the cheapest fix here"). Three
items from #29: *legend for field visualisation (and possibly a way to fix
the heatmap?)*, the strip's build/measure distinction, and *simplify the UI
when we are in exercise mode*.

## The problem

Two complaints, one root.

**The strip does not say what its tools are for.** Drawing tools and
instruments sit in adjacent groups split by a hairline `.tsep` and nothing
else. A student meeting the bar for the first time cannot tell that Wall
changes the rig and Gauge does not, and the distinction is the whole
difference between setting an experiment up and taking a reading from it.

**The colour means nothing on screen.** Seven field colourings exist and
the range each is painted over — `u_vmax`, `u_hmax` — is a scene constant
printed nowhere, in no units, with no tick. Three fields (Froude, vorticity,
momentum flux) have their scales baked into the GLSL where nothing can reach
them. The default Water view is a *two-variable* encoding — hue from
submergence `p/ρg`, brightness added on top from speed — and nothing says so,
so a student reading "dark blue" cannot tell deep from fast.

A screenshot pasted into a worksheet therefore carries no statement of what
it shows, which the pooled-plot workflow already depends on and does not have.

## What this does not do

Deliberately deferred, each to its own spec:

- **the averaging engine** (conditional accumulation, γ = n_wet/N, surface
  reconstruction) — issue #29 "Averaging", catalogue proposal 4;
- **the wall pressure probe** (pick a wall, pick a side, p⊥ along it) —
  issue #29 "Add pressure box", catalogue proposal 2;
- **streamlines beside pathlines** — issue #29, catalogue proposal 3.

This spec **reserves the slots** all three land in and changes nothing about
the solver, the shaders' physics, or the wire format.

## The taxonomy

Three families, not two. "Scene edit versus experimentation" splits once the
deferred work arrives, because *Average* and *Streamlines* are neither: they
change how the water is drawn and nothing about what is being measured.
Putting them in the tool row would make them look like something you click
the water with.

| Group | Contents | Change from today |
|---|---|---|
| **SESSION** | Start, Scenes, Exercises, New sandbox | none |
| **BUILD** | Wall, Erase, Valve, Spout, Pour, Undo, **Clear drawing** | Clear moves here from the clock group: it edits the rig |
| **MEASURE** | Gauge, Rake, Tracers, Tape, Force box | none; the wall pressure probe lands here |
| **VIEW** | **Field ▾**, Particles, Dye, Channel overlay | new group; P / D / N stop being keyboard-only |
| **RUN** | Run/Pause, Reset water, Valves | Valves stays: it operates a running rig, it does not draw one |

Each group carries a caption — 9 px, uppercase, letterspaced, above the row —
and a family accent used for the caption and for the group's lit-button
colour. Captions are dropped at the existing `.tight` breakpoint alongside
the wordmark, so every narrow layout is unchanged and `fitBar`'s two-rung
ladder keeps working as it does.

The VIEW group's three toggles duplicate Controls-panel checkboxes on
purpose. The standing rule is that the panel must be able to reproduce any
scene by hand; the strip is a shortcut to the toggles a session reaches for
constantly, not a replacement for the panel.

## The field registry

Today a field is described in three disconnected places: a `u_mode` integer
in the GLSL, an `opts` pair like `["0", "Water"]` in the panel spec, and
prose in an `info` string. Adding a unit, a symbol or a range to that is
three edits and a chance to disagree with itself.

One registry in `main.js` replaces all three:

```js
{ mode: 2, id: "speed", name: "Speed", sym: "|u|", unit: "m/s",
  ramp: "turbo", def: () => state.scene.vmax || 4, blurb: "…" }
```

| mode | id | name | symbol | unit | ramp | default range |
|---|---|---|---|---|---|---|
| 0 | `water` | Water | — | m, m/s | water | `hmax`, `vmax` (two-variable) |
| 1 | `phead` | Pressure head | `p/ρg` | m | turbo | `scene.headMax \|\| 3` |
| 6 | `head` | Piezometric head | `h = z + p/ρg` | m | turbo | domain height |
| 2 | `speed` | Speed | `\|u\|` | m/s | turbo | `scene.vmax \|\| 4` |
| 3 | `froude` | Froude number | `Fr` | — | diverging about 1 | 0 – 2 |
| 4 | `vort` | Vorticity | `ω` | s⁻¹ | diverging about 0 | ±40 |
| 5 | `mom` | Momentum flux | `ρu\|u\|` | kg m⁻¹ s⁻² | diverging about 0 | ±½ vmax² |

Consumers: the legend card, the Controls panel's Field select, the `G` key,
and the `SIM.render` call. Symbols and units come from
[docs/notation.md](../../notation.md), so `check_notation.py` can police
them the way it polices everything else.

Two supporting changes fall out of it.

**Ramp control points move to JS.** `turbo` and `divg` are five `vec3`
literals each, inside the GLSL string. They become a JS array in
`shaders.js`, interpolated into the shader source at build time and read
directly by the legend when it paints its bar. One array, two consumers,
no drift.

**`u_vmax` / `u_hmax` become `u_lo` / `u_hi`.** Every mode maps its quantity
through the same explicit pair. This is what makes the Fit button meaningful
for Froude, vorticity and momentum flux, whose scales are currently
unreachable constants in the shader. `vmax` survives as its own uniform for
the particle colouring, which is a separate program and a separate decision.

Ranges live in `state.range[id] = [lo, hi]`, seeded from the registry's
default when a scene loads and when the scene changes. **They are not
serialized.** Adding a key to the rig format would bump `V` and break every
existing share link, per the standing rule in AGENTS.md; a session-only
range is the right trade until an exercise needs to ship a locked one.

## The legend card

DOM, not canvas. It carries a menu, a button and two editable numbers, and
the strip, the tip and the panel are already DOM glass — drawing it into the
overlay canvas would mean hand-rolling hit-testing and text entry for
nothing. A CDP or window screenshot captures DOM, so the self-documenting
screenshot still works.

Fixed to the top-left of the viewport, below the strip. The dock is on the
right, so `--dock` does not enter into it; the bottom-right is where gauge
cards stack and the edges are the ruler's.

```
┌──────────────────────────────────────┐
│  Pressure head   p/ρg            ▾   │  ▾ → the seven, each with its one-liner
│  ████████████████████████████████    │
│  0.00                        1.85 m  │  ← click either number to type one
│  ⟨Fit⟩   ⟲ scene default              │
└──────────────────────────────────────┘
```

- **The name is the picker.** `▾` opens a menu listing all seven with their
  `blurb`; the same text feeds the panel control's `info`.
- **Fit** takes one `readPixels` of the field on the click, computes the
  99th percentile over wet cells (`f ≥ 0.5`), and holds it. No per-frame
  reduction: a range that drifts while you watch destroys comparability
  between two frames and between two students' screenshots, which is the
  reason colour is worth printing at all.
- **⟲ scene default** restores the registry default for that field.
- Each field keeps its own pair for the session.

**Water mode** swaps the single bar for two keyed rows — a blue ramp
labelled *depth below surface, m*, a brightness wedge labelled *speed, m/s*,
and a note for the pressurised-cell sheen. The rendering is untouched; the
ambiguity was never in the picture, only in the fact that nobody was told
the rule.

Toggled from the VIEW group and by `L` (free — H S E N Z C V R G P D M ? are
taken). Visible by default, including in exercise mode. On the phone branch
(< 620 px, bottom sheet) the card sits above the sheet or hides with the
other chrome, whichever the layout gate proves.

## Exercise UI profiles

Issue #29 also asks to "simplify the UI when we are in exercise mode", and
the families above are what makes that expressible: an exercise can say
*build nothing, measure with these two, look at these fields* in one line,
because there is now a name for each of those things.

Most of the data already exists. `NC-1` declares
`instruments: [{ tool: "gauge", where: …, why: … }]` — a statement of the
instruments that exercise needs. `viewParams` already sets view state.
`studentControls(ex)` already knows which panel controls belong to the
student. The profile is mostly a matter of *reading what the pack already
says*.

### The profile

An optional `ui` key on an exercise entry in `js/exercises.js`:

```js
ui: {
  build:    false,                  // true | false | ["wall", "erase"]
  measure:  ["gauge", "rake"],      // true | false | list of tool ids
  view:     true,                   // true | false | list of item ids
  fields:   ["water", "head"],      // which of the seven the picker offers
  legend:   true,
  panel:    "focused",              // "full" | "focused" | "shut"
  readouts: { gauges: true, cursor: false, status: true },
}
```

`readouts` covers only what has no toggle already: the gauge corner cards,
the hovering cursor readout, and the status line. Profile labels, jump boxes
and the channel overlay stay with `viewParams`, which already sets them —
two ways to say the same thing is how they come to disagree.

### Resolution

A profile is **derived, then overridden**. `UIMODE.fromExercise(ex)` builds
the default:

- **`measure`** — the tools named in `ex.instruments`, if it declares any;
  otherwise every instrument, because an exercise that does not say cannot
  be second-guessed.
- **`build`** — hidden, unless `ex.instruments` names a build tool
  (`wall`, `erase`, `valve`, `spout`, `pour`), which is how an exercise that
  asks a student to draw says so.
- **`panel`** — `"focused"`: the sections carrying the student's own
  controls, the controls the exercise itself sets through `rigParams` and
  `viewParams`, and View. This is a deliberate change of behaviour for the
  whole pack, and it is safe because of the escape hatch below.
- **`view`, `fields`, `legend`, `readouts`** — everything, unchanged.

Anything the entry's own `ui` key states wins over the derived value. An
exercise that declares nothing and lists no instruments therefore keeps
today's interface exactly, except for the focused panel.

### Always liftable

A **⋯ Show everything** button sits at the end of the strip whenever a
profile is hiding something, and at the head of the Controls panel. One
click restores the full interface for the session; picking an exercise
re-applies its profile.

This is not decoration. The standing acceptance test is that the sandbox
must be able to reproduce any scene by hand, and a profile that could not
be lifted would break it. A profile is a considered default, never a cage.

Hidden tools **keep their digit**. Worksheets say "press 5", and renumbering
the tools under a profile would make the pack lie. Pressing a hidden tool's
digit says why it is off and points at ⋯ rather than silently doing nothing.

Leaving exercise mode — a new scene, `New sandbox`, closing the exercise —
restores everything.

### Not in the wire format

Profiles live in `js/exercises.js`, which is code, not the rig JSON. `V` is
not bumped and share links are unaffected. `check_pack.py` gains a
validation pass over any `ui` key it finds: tool ids must exist in `TOOLS`,
field ids in `FIELDS`, `panel` must be one of the three levels.

## Files

| File | What changes |
|---|---|
| [index.html](../../../index.html) | legend markup and CSS; group-caption CSS; the ⋯ button and the panel's focus switch |
| [js/main.js](../../../js/main.js) | `FIELDS` registry; `TOOLBAR` regrouped and captioned; `LEGEND` module; `UIMODE` module; `state.range`; `state.ui`; `L` key; panel Field select reads the registry; panel sections respect the profile |
| [js/shaders.js](../../../js/shaders.js) | ramp control points as JS data; `u_lo` / `u_hi` |
| [js/sim.js](../../../js/sim.js) | pass `lo` / `hi` through `render`; new `fieldStats(mode)` one-shot readback for Fit |
| [js/overlay.js](../../../js/overlay.js) | untouched |
| [js/exercises.js](../../../js/exercises.js) | optional `ui` key; no existing entry has to change |
| [exercises/_runner/check_pack.py](../../../exercises/_runner/check_pack.py) | validate any `ui` key it finds |
| [test/ui-smoke.mjs](../../../test/ui-smoke.mjs) | the cases below |

`GINSP`'s closure-local `FIELDS` (a list of gauge *series*, not view fields)
is renamed `SERIES` so the module-scope name is unambiguous.

## Testing

New cases in `test/ui-smoke.mjs`, in its existing style — each one a thing
that can silently break:

1. **Every group is captioned** and every caption names a family the spec
   knows about; the count of groups matches `TOOLBAR.length`.
2. **Captions drop at `.tight`** and the strip still shows every control —
   the caption must not be what pushes a button out of the bar.
3. **The legend is up by default**, inside the canvas area, and clear of the
   dock at 1440 px with an exercise open.
4. **The legend names the live field**, and picking another from its menu
   moves `state.mode` — the card and the panel `select` never disagree.
5. **`G` still cycles all seven** and the legend follows each step.
6. **Fit changes the range and holds it**: the printed pair changes on the
   click and does not move on the next frame.
7. **Typing a range takes it over** and survives a frame.
8. **Each field keeps its own range** across a switch away and back.
9. **Water mode shows two keyed rows**, not one bar.
10. **The phone branch** keeps the legend clear of the bottom sheet.
11. **A profile narrows the strip**: an exercise declaring
    `instruments: [gauge]` shows the gauge and hides the drawing tools, and
    the button count matches what the resolved profile allows.
12. **⋯ Show everything restores every control**, and the button goes away
    once it has.
13. **A hidden tool's digit still means that tool** — pressing it does not
    silently select a different one, and does not select the hidden one.
14. **Leaving the exercise restores the full interface** (new scene, New
    sandbox, closing the brief).
15. **A profile survives a re-pick**: picking the same exercise again
    re-applies it after a lift.
16. **An exercise that declares nothing keeps the full strip** — the pack
    cannot be narrowed by accident.

Existing gates that must stay green:

- `node exercises/_runner/smoke.js --only=api,rig` — every field reachable,
  rig round-trip unchanged (the format is deliberately untouched);
- `python3 exercises/_runner/check_notation.py` — registry symbols and units
  match the register;
- `python3 exercises/_runner/check_pack.py` — extended: any `ui` key names
  tools that exist, fields that exist and a valid panel level.

## Risks

- **The strip is already tight.** Four new VIEW buttons plus captions push
  `fitBar` harder. Mitigated by dropping captions at `.tight`; the layout
  gate's "no control is scrolled out of the strip" case is the proof.
- **`u_lo` / `u_hi` touches the display pass.** It is the one shader change
  here, it is arithmetic only, and no simulation pass is involved — but the
  Froude and momentum views are diverging ramps centred on a *meaningful*
  value (1 and 0), so the mapping must centre on that value rather than on
  the midpoint of the range.
- **Fit's `readPixels` stalls the pipeline** for one frame on a large grid.
  It happens on a click, never per frame, which is the same bargain
  `rescaleFill` and `boxForce` already make.
- **A profile can hide a control an exercise needs.** The derived `panel:
  "focused"` set is built from the controls the exercise itself touches, so
  it cannot omit one the rig sets — but a brief whose prose asks for a
  control nothing declares would send a student looking. ⋯ Show everything
  is the escape, and the fix is to declare the control, which is worth
  knowing about anyway.
- **The pack-wide focused panel is a behaviour change** for all forty
  exercises at once. It is the one change here that is not additive; the
  escape hatch and `smoke.js`'s per-exercise pass are what make it
  reversible in practice.
