# The shelf and the readout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the strip say what its tools are for, and put the colour scale
on screen in units, as a card that is also the field picker.

**Architecture:** One `FIELDS` registry in `main.js` becomes the single
description of a field (mode integer, name, symbol, unit, ramp, default
range, blurb) and is read by the legend, the Controls panel, the `G` key and
the render call. The ramp control points move from GLSL literals to JS data
interpolated into the shader source, so the legend's bar and the water are
painted from one array. `u_vmax`/`u_hmax` become an explicit `u_lo`/`u_hi`
pair so every field — including the three with scales baked into the
shader — can be rescaled. The legend is a DOM card, because it has a menu, a
button and two editable numbers.

**Tech Stack:** Zero dependencies, classic scripts, WebGL2, no build step.
Tests are `test/ui-smoke.mjs` (headless Chrome over CDP) and
`exercises/_runner/smoke.js`.

**Spec:** [docs/superpowers/specs/2026-08-28-ui-shell-and-legend-design.md](../specs/2026-08-28-ui-shell-and-legend-design.md)

## Global Constraints

- **Zero dependencies, classic scripts.** No modules, no bundlers, no fetch,
  no YAML front matter in `index.html` or `js/*`.
- **Notation is law.** `z` for the domain vertical, `w` for vertical
  velocity, `d` for depth, `h = z + p/ρg` piezometric head, `p/ρg` always
  spelled that way. Screen-space pixel coordinates stay `y`. Registry
  symbols and units must match [docs/notation.md](../../notation.md);
  `check_notation.py` greps for the retired names.
- **The wire format does not change.** No new keys in the rig JSON, no bump
  of `V` in `RIG.migrate`. Ranges are session state only.
- **The panel stays self-configuring.** Anything the strip's VIEW group
  toggles must still be reachable from Controls — the sandbox must be able
  to reproduce any scene by hand.
- **All CSS lives in `index.html`.** No stylesheet files.
- **Every strip button keeps an icon and an `aria-label`.** The layout gate
  checks both.
- Run from the repo root; the app is served statically or opened as a file.

---

### Task 1: The field registry

**Files:**
- Modify: `js/main.js` — add `FIELDS` near the `TOOLS` block; rewrite the
  `mode` control in `CONTROLS`; the `g` key in the keydown handler; add
  `state.range`; rename `GINSP`'s local `FIELDS` to `SERIES`; export on `APP.ui`
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `FIELDS` — array of `{ mode, id, name, sym, unit, ramp, def, blurb }`,
    ordered as the picker lists them (Water, Pressure head, Piezometric
    head, Speed, Froude number, Vorticity, Momentum flux). `def` is
    `() => [lo, hi]`.
  - `fieldFor(mode)` → the registry entry for a mode integer.
  - `rangeFor(id)` → `[lo, hi]`, the live range, seeded from `def()`.
  - `state.range` — `{ [id]: [lo, hi] }`, reset by `loadScene`.
  - `APP.ui.FIELDS` for the layout gate.

- [ ] **Step 1: Write the failing test**

Add to `test/ui-smoke.mjs`, inside the "a bare visit" block after the strip
checks:

```js
      // ---- the field registry is the single description of a field
      const reg = await tab.evaluate(`
        const F = APP.ui.FIELDS;
        return { n: F.length,
                 modes: F.map((f) => f.mode),
                 ids: F.map((f) => f.id),
                 bare: F.filter((f) => !f.name || !f.unit || !f.ramp ||
                                       typeof f.def !== "function").length,
                 blurbless: F.filter((f) => !f.blurb || f.blurb.length < 20).length,
                 opts: [...document.getElementById("c_mode").options].map((o) => o.value) };
      `);
      eq("the registry has all seven fields", reg.n, 7);
      check("every mode 0-6 is described once",
            [...reg.modes].sort((a, b) => a - b).join(",") === "0,1,2,3,4,5,6", reg.modes.join(","));
      check("every field is fully described", reg.bare === 0, reg.bare + " incomplete");
      check("every field carries a blurb", reg.blurbless === 0, reg.blurbless + " unexplained");
      // The panel select is BUILT from the registry, so it cannot fall behind it.
      eq("the panel select lists the registry", reg.opts.join(","),
         reg.modes.map(String).join(","));

      // G walks the whole registry and comes back to where it started.
      const cycled = await tab.evaluate(`
        const seen = [];
        for (let k = 0; k < APP.ui.FIELDS.length; k++) {
          dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
          seen.push(APP.state.mode);
        }
        return { seen, back: APP.state.mode };
      `);
      eq("G visits every field", new Set(cycled.seen).size, reg.n);
      eq("and wraps to where it started", cycled.back, 0);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — `APP.ui.FIELDS` is undefined, so the evaluate throws.

- [ ] **Step 3: Add the registry**

In `js/main.js`, immediately after the `TOOL_KEYS` line:

```js
/** The seven field colourings, as data. A field used to be described in three
 *  disconnected places — a `u_mode` integer in the GLSL, an `opts` pair in the
 *  panel spec, and prose in an `info` string — so adding a unit to one of them
 *  was three edits and a chance to disagree with itself. `mode` is the shader's
 *  integer and stays the wire value the rig already stores; the ORDER here is
 *  the order the picker lists them, which is the order a session wants them
 *  (what the water is doing, then the two heads, then the derived numbers).
 *  `def()` returns the range the colour ramp is painted over, in the field's
 *  own units — see `rangeFor`. */
const FIELDS = [
  { mode: 0, id: "water", name: "Water", sym: "", unit: "m",
    ramp: "water", def: () => [0, hmaxScene(0)],
    blurb: "Depth below the local free surface as hue, with speed added as brightness. Two variables at once — read the legend's two rows, not the colour alone." },
  { mode: 1, id: "phead", name: "Pressure head", sym: "p/ρg", unit: "m",
    ramp: "turbo", def: () => [0, state.scene.headMax || 3],
    blurb: "The pressure alone, p/ρg. In still water it is simply the depth below the surface, so it climbs down every column and is not comparable between cells at different heights." },
  { mode: 6, id: "head", name: "Piezometric head", sym: "h = z + p/ρg", unit: "m",
    ramp: "turbo", def: () => [0, sim ? sim.H : 1],
    blurb: "The potential whose gradient drives the flow. Its bands stand vertical wherever the flow is hydrostatic and bend exactly where vertical accelerations matter — crests, brinks, a chute toe, a gate contraction, a jump roller." },
  { mode: 2, id: "speed", name: "Speed", sym: "|u|", unit: "m/s",
    ramp: "turbo", def: () => [0, state.scene.vmax || 4],
    blurb: "The magnitude of the velocity, √(u² + w²) — direction is not in it. Particles and dye show where it is going." },
  { mode: 3, id: "froude", name: "Froude number", sym: "Fr", unit: "",
    ramp: "divg", def: () => [0, 2], mid: 1,
    blurb: "Fr = u/√(gd), from the streamwise velocity and the column depth. Pale is critical; blue is subcritical, red supercritical." },
  { mode: 4, id: "vort", name: "Vorticity", sym: "ω", unit: "1/s",
    ramp: "divg", def: () => [-40, 40], mid: 0,
    blurb: "∂w/∂x − ∂u/∂z: the local spin. Shear layers, the roller of a jump and the separation off a step all show as sheets of one sign." },
  { mode: 5, id: "mom", name: "Momentum flux", sym: "ρu|u|", unit: "kg/m/s²",
    ramp: "divg", def: () => [-momScene(), momScene()], mid: 0,
    blurb: "Momentum per unit volume, signed by the streamwise direction, so a returning roller or an undertow reads opposite to the flow that drives it." },
];

/** The scene's own maximum for the Water view's depth hue. */
function hmaxScene() { return state.scene.hmax || (state.scene.g ? 2.0 : 1); }
/** The momentum-flux scale, as the display pass has always computed it. */
function momScene() { return 0.5 * Math.pow(state.scene.vmax || 4, 2); }

/** The registry entry for a shader mode integer. */
function fieldFor(mode) { return FIELDS.find((f) => f.mode === mode) || FIELDS[0]; }

/** The live colour range for a field, in its own units. Seeded from the
 *  registry default the first time it is asked for, then owned by whatever
 *  Fit or the typed boxes last set — colour that drifts by itself cannot be
 *  compared between two frames, let alone between two students' screenshots. */
function rangeFor(id) {
  const f = FIELDS.find((q) => q.id === id) || FIELDS[0];
  if (!state.range[id]) state.range[id] = f.def();
  return state.range[id];
}
```

Add `range: {}` to the `state` literal, next to `mode: 0`:

```js
  mode: 0, range: {}, particles: false, dye: true, channel: true, labels: true, jumps: true,
```

- [ ] **Step 4: Wire the panel and the G key to it**

Replace the `mode` control in `CONTROLS` (the `{ id: "mode", type: "select", … }`
row under the `{ h: "View" }` heading):

```js
  { id: "mode", type: "select", label: "Field",
    opts: FIELDS.map((f) => [String(f.mode), f.name]),
    get: () => String(state.mode),
    set: (v) => { state.mode = +v; if (typeof LEGEND !== "undefined") LEGEND.sync(); },
    fmt: () => fieldFor(state.mode).blurb },
```

Replace the `g` branch in the keydown handler:

```js
    else if (k === "g") {
      const i = FIELDS.findIndex((f) => f.mode === state.mode);
      state.mode = FIELDS[(i + 1) % FIELDS.length].mode;
      syncPanel();
    }
```

Seed the ranges when a scene loads. In `loadScene`, on the line that already
reads `state.mode = sc.mode;`, add underneath:

```js
  state.range = {};             // each scene sets its own colour scales
```

Export it for the layout gate — in `window.APP`, extend the `ui` object:

```js
  ui: { TOOLBAR, DOCK, START, KEYS, fitBar, syncToolbar, FIELDS },
```

- [ ] **Step 5: Rename GINSP's local `FIELDS` to `SERIES`**

Inside the `GINSP` module (`const FIELDS = [` around line 3113) the name means
a list of gauge *series*, not view fields, and it now shadows the module-scope
registry. Rename the declaration and its five uses (`FIELDS.forEach`,
`FIELDS.find` ×2, and the two inside `draw`) to `SERIES`. No behaviour changes.

- [ ] **Step 6: Run the tests**

Run: `node test/ui-smoke.mjs`
Expected: PASS, including the six new cases. The `fmt` on the Field row now
prints the blurb under the select, which is a visible improvement to check by
eye at least once.

- [ ] **Step 7: Commit**

```bash
git add js/main.js test/ui-smoke.mjs
git commit -m "One registry describes a field: mode, symbol, unit, ramp, range"
```

---

### Task 2: Ramps as data, and an explicit lo/hi

**Files:**
- Modify: `js/shaders.js` — `RAMPS` constant, interpolated into `FS_DISP`;
  `u_vmax`/`u_hmax` → `u_lo`/`u_hi` in the field mapping
- Modify: `js/sim.js:388-436` — `render` passes the new uniforms
- Modify: `js/main.js` — the `SIM.render` call site; `APP.ui.RAMPS`
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `FIELDS`, `rangeFor(id)`, `fieldFor(mode)` from Task 1.
- Produces:
  - `Shaders.RAMPS` — `{ turbo: [[r,g,b] × 5], divg: [[r,g,b] × 5] }`, floats
    in 0–1, the same five stops the shader interpolates.
  - `SIM.render(view, opts)` now reads `opts.lo` and `opts.hi` (numbers, the
    field's own units) alongside the existing `opts.vmax`, which survives for
    the particle colouring and the Water view's brightness term.

- [ ] **Step 1: Write the failing test**

Add to `test/ui-smoke.mjs`, in the "?scene=" block:

```js
      // ---- one array of colours, two consumers
      const ramp = await tab.evaluate(`
        const R = APP.ui.RAMPS;
        const bad = Object.values(R).filter((r) =>
          r.length !== 5 || r.some((c) => c.length !== 3 ||
                                          c.some((v) => !(v >= 0 && v <= 1))));
        return { keys: Object.keys(R).sort().join(","), bad: bad.length };
      `);
      eq("both ramps are published", ramp.keys, "divg,turbo");
      eq("as five rgb stops in 0-1", ramp.bad, 0);

      // Every field must actually render. A shader that fails to compile
      // throws on the draw, and a mode with no mapping paints nothing.
      const modes = await tab.evaluate(`
        const out = [];
        for (const f of APP.ui.FIELDS) {
          APP.state.mode = f.mode;
          APP.frames(1);
          const r = APP.ui.rangeFor(f.id);
          out.push([f.id, r[0], r[1]]);
        }
        APP.state.mode = 0;
        return out;
      `);
      check("every field renders without error", tab.errors.length === 0, tab.errors[0]);
      check("every field has a finite range",
            modes.every(([, lo, hi]) => isFinite(lo) && isFinite(hi) && hi > lo),
            JSON.stringify(modes));
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — `APP.ui.RAMPS` is undefined.

- [ ] **Step 3: Lift the ramp stops out of the GLSL**

In `js/shaders.js`, above the `FS_DISP` template literal:

```js
  // ------------------------------------------------------------------ ramps
  /** The colour stops, in JS, because the legend has to paint the SAME bar the
   *  water is painted with. They used to be `vec3` literals inside FS_DISP,
   *  which meant the only way to draw a matching key was to type the numbers
   *  out again somewhere else and hope. Interpolated into the shader source
   *  below, so there is one array and two consumers.
   *
   *  `turbo` is a sequential ramp for quantities with a floor (heads, speed);
   *  `divg` is diverging, pale in the middle, for quantities with a
   *  meaningful centre (Fr = 1, ω = 0, momentum = 0). */
  const RAMPS = {
    turbo: [[0.19, 0.07, 0.23], [0.13, 0.56, 0.82], [0.20, 0.83, 0.48],
            [0.95, 0.78, 0.15], [0.85, 0.14, 0.10]],
    divg:  [[0.06, 0.24, 0.52], [0.25, 0.61, 0.85], [0.94, 0.95, 0.92],
            [0.97, 0.63, 0.25], [0.72, 0.10, 0.09]],
  };
  const glsl3 = (c) => "vec3(" + c.map((v) => v.toFixed(4)).join(",") + ")";
  const rampFn = (name, stops) =>
    "vec3 " + name + "(float t){ return ramp(t," +
    stops.map(glsl3).join(",") + "); }";
```

In `FS_DISP`, delete the hand-written `turbo` and `divg` function bodies and
interpolate them instead (the `ramp` helper above them stays as it is):

```glsl
${rampFn("turbo", RAMPS.turbo)}
${rampFn("divg", RAMPS.divg)}
```

Add `RAMPS` to the object `Shaders` returns:

```js
  return { VS_QUAD, VS_RECT, FS_VEL, FS_VOF, FS_COL, FS_PART, VS_PART,
           FS_PART_DRAW, FS_DISP, RAMPS };
```

- [ ] **Step 4: Give the display pass an explicit lo/hi**

In `FS_DISP`, replace the `u_vmax, u_hmax` declaration with:

```glsl
uniform float u_vmax;         // speed scale: particle colouring and the Water sheen
uniform float u_lo, u_hi;     // the CURRENT field's colour range, in its own units
```

and map every field through it. `nrm` is the shared 0–1 mapping; the two
centred fields keep their meaningful midpoint by mapping the halves
separately, so a lopsided range still puts Fr = 1 and ω = 0 at the pale band:

```glsl
float nrm(float v){ return clamp((v - u_lo) / max(u_hi - u_lo, 1e-6), 0.0, 1.0); }
/** Centred mapping: `mid` lands on 0.5 whatever the two ends are. */
float nrmMid(float v, float mid){
  return v < mid ? 0.5 * clamp((v - u_lo) / max(mid - u_lo, 1e-6), 0.0, 1.0)
                 : 0.5 + 0.5 * clamp((v - mid) / max(u_hi - mid, 1e-6), 0.0, 1.0);
}
```

Then, inside `main()`, the six branches become:

```glsl
  if (u_mode == 0) {
    vec3 shallow = vec3(0.24, 0.56, 0.78);
    vec3 deep    = vec3(0.05, 0.20, 0.42);
    water = mix(shallow, deep, nrm(sub));
    water += vec3(0.10, 0.14, 0.16) * clamp(length(U.rg) / max(u_vmax, 0.01), 0.0, 1.0);
  } else if (u_mode == 1) {
    float head = U.b / max(abs(u_g), 1e-3);   // pressure head p/ρg (m)
    water = turbo(nrm(head));
  } else if (u_mode == 2) {
    water = turbo(nrm(length(U.rg)));
  } else if (u_mode == 3) {
    float fr = abs(U.r) / sqrt(max(abs(u_g) * dep, 1e-4));
    water = divg(nrmMid(fr, 1.0));
  } else if (u_mode == 4) {
    ivec2 gi = ivec2(clamp(g, vec2(1.0), u_res - vec2(2.0)));
    float dwdx = texelFetch(u_U, gi + ivec2(1,0), 0).g - texelFetch(u_U, gi - ivec2(1,0), 0).g;
    float dudz = texelFetch(u_U, gi + ivec2(0,1), 0).r - texelFetch(u_U, gi - ivec2(0,1), 0).r;
    float vort = (dwdx - dudz) / (2.0 * u_dx);
    water = divg(nrmMid(vort, 0.0));
  } else if (u_mode == 6) {
    float hp = pm.y - u_tilt * pm.x + U.b / max(abs(u_g), 1e-3);
    water = turbo(nrm(hp));
  } else {
    float sp = length(U.rg);
    float mom = f * U.r * sp;
    water = divg(nrmMid(mom, 0.0));
  }
```

Keep every explanatory comment that is on those branches today — the Froude
note about streamwise velocity and the piezometric-head note are measured
lore, not decoration.

- [ ] **Step 5: Pass it through `sim.js` and the call site**

In `js/sim.js`, inside `render`, replace the two `u_vmax`/`u_hmax` uniform
calls with:

```js
    gl.uniform1f(prog.draw.u("u_vmax"), opts.vmax);
    gl.uniform1f(prog.draw.u("u_lo"), opts.lo);
    gl.uniform1f(prog.draw.u("u_hi"), opts.hi);
```

In `js/main.js`, at the `SIM.render` call in `tickFrame`:

```js
  const fr = fieldFor(state.mode), rg = rangeFor(fr.id);
  SIM.render(view, {
    mode: state.mode, vmax: vmaxFor(), lo: rg[0], hi: rg[1],
```

Delete `hmaxFor`; it has no callers left. `vmaxFor` stays.

Export the ramps and the range accessor for the gate — in `window.APP`:

```js
  ui: { TOOLBAR, DOCK, START, KEYS, fitBar, syncToolbar, FIELDS,
        RAMPS: Shaders.RAMPS, rangeFor },
```

- [ ] **Step 6: Run the tests**

Run: `node test/ui-smoke.mjs`
Expected: PASS. A GLSL compile error surfaces as an uncaught error on the
first frame, which the "no uncaught errors" case in every block already
catches.

- [ ] **Step 7: Commit**

```bash
git add js/shaders.js js/sim.js js/main.js test/ui-smoke.mjs
git commit -m "Colour ramps become data, and every field gets a reachable range"
```

---

### Task 3: The strip, captioned and regrouped

**Files:**
- Modify: `index.html` — `.tcap` CSS, `.tgrp` becomes a column, `.tight`
  hides captions, `#bar` height
- Modify: `js/main.js:1971-2044` — `TOOLBAR` becomes captioned groups;
  `buildToolbar` renders the caption; four new `ICONS`
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `FIELDS` (Task 1) only for the VIEW group's Field button, which
  calls `LEGEND.toggle()` — stubbed here, built in Task 4.
- Produces: `TOOLBAR` — array of `{ cap, family, items: [...] }`. Every
  consumer that flattens it (`buildToolbar`, `syncToolbar`, the layout gate's
  `TOOLBAR.flat()`) must be updated to walk `.items`.

- [ ] **Step 1: Write the failing test**

Add a block to `test/ui-smoke.mjs` after "the strip drives the tools and the
clock":

```js
    // -------------------------------------------------- the strip's families
    console.log("\nthe strip says which family a tool belongs to");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const caps = [...document.querySelectorAll("#groups .tcap")].map((c) => c.textContent);
        const spec = APP.ui.TOOLBAR;
        return {
          caps, specCaps: spec.map((g) => g.cap),
          groups: document.querySelectorAll("#groups .tgrp").length,
          // Every button still belongs to exactly one captioned group.
          orphans: [...document.querySelectorAll("#groups .tbtn")]
                     .filter((b) => !b.closest(".tgrp")).length,
          buttons: document.querySelectorAll("#groups .tbtn").length,
          specCount: spec.reduce((n, g) => n + g.items.length, 0),
          // The VIEW group's toggles must reach the same state the panel does.
          viewGroup: spec.find((g) => g.cap === "VIEW").items.map((i) =>
            typeof i.label === "function" ? i.label() : i.label),
        };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("every group is captioned", r.caps.length, r.groups);
      eq("the captions are the spec's", r.caps.join(","), r.specCaps.join(","));
      eq("no button is outside a group", r.orphans, 0);
      eq("the strip still renders the whole spec", r.buttons, r.specCount);
      check("VIEW carries the field picker",
            r.viewGroup.some((l) => /field/i.test(l)), r.viewGroup.join(","));

      // The panel is still the authority: the strip's toggle moves the state
      // the panel's checkbox reads, and vice versa.
      const parity = await tab.evaluate(`
        const it = APP.ui.TOOLBAR.find((g) => g.cap === "VIEW").items
                     .find((i) => /particles/i.test(
                       typeof i.label === "function" ? i.label() : i.label));
        const before = APP.state.particles;
        it.el.click();
        const after = APP.state.particles;
        const box = document.getElementById("c_particles").checked;
        it.el.click();
        return { before, after, box, lit: it.el.classList.contains("on") };
      `);
      check("the strip toggle moves the state", parity.before !== parity.after);
      eq("and the panel checkbox agrees", parity.box, parity.after);

      // Captions are the first thing to go when the strip runs out of room —
      // never a control.
      const tight = await tab.evaluate(`
        document.getElementById("bar").classList.add("tight");
        const cap = document.querySelector("#groups .tcap");
        return { hidden: getComputedStyle(cap).display === "none" };
      `);
      check("captions drop at .tight", tight.hidden);
      await tab.close();
    }
```

Also update the two places the existing gate flattens the toolbar — in the
"tools & clock" block and the "touch parity" block, `APP.ui.TOOLBAR.flat()`
becomes:

```js
        const strip = APP.ui.TOOLBAR.flatMap((g) => g.items);
```

and in the tools block, `APP.ui.TOOLBAR.flat().find(...)` likewise. The
`specCount` line in `PROBE` becomes:

```js
    specCount: APP.ui.TOOLBAR.reduce((n, grp) => n + grp.items.length, 0),
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — `.tcap` elements do not exist, and `TOOLBAR` has no `.cap`.

- [ ] **Step 3: Restructure the TOOLBAR spec**

In `js/main.js`, replace the `TOOLBAR` literal. The comment above it is
rewritten because the grouping rule changes:

```js
/** The strip, as data. Five captioned families, in the order a session uses
 *  them: what to LOAD, what to BUILD the rig with, what to MEASURE it with,
 *  how to VIEW the water, and what the clock is doing.
 *
 *  The caption is the point of the regrouping. Build and Measure used to be
 *  adjacent groups separated by a hairline, and nothing on screen said that
 *  Wall changes the rig and Gauge does not — which is the whole difference
 *  between setting an experiment up and taking a reading from it. VIEW is a
 *  third family rather than part of Measure: it changes how the water is
 *  DRAWN and nothing about what is being measured, which is also why the
 *  averaging toggle and streamlines will belong here rather than among the
 *  instruments.
 *
 *  `id` is set where another module looks the button up by name. */
const TOOLBAR = [
  { cap: "SESSION", family: "session", items: [
    { id: "homeBtn", icon: "home", label: "Start", key: "H",
      hint: "The exercise pack, the sandbox and the scenes",
      act: () => START.open() },
    { id: "sceneBtn", icon: "scenes", label: "Scenes", key: "S",
      hint: "Ready-made flumes, tanks and pipe runs",
      act: (b) => PICKER.toggle(b) },
    { id: "exBtn", icon: "ex", label: "Exercises", key: "E",
      hint: "Set up one of the teaching demos",
      act: (b) => EX.toggle(b) },
    { id: "newBtn", icon: "fresh", label: "New sandbox", key: "N",
      hint: "A blank flume — clears what is drawn and starts over",
      act: () => newSandbox() },
  ] },
  // BUILD: the four drawing tools, Pour beside them, Undo — which was the Z
  // key and nothing else, so on a touch screen a mis-drawn stroke could not be
  // taken back at all — and Clear, which used to sit with the clock although
  // it edits the rig rather than running it.
  { cap: "BUILD", family: "build", items:
    TOOLS.slice(0, 4).map(toolItem).concat(
      [toolItem(TOOLS[TOOLS.length - 1])],
      [{ id: "undoBtn", icon: "undo", label: "Undo", key: "Z",
         hint: "Take back the last thing you drew",
         act: () => SIM.undoSeg() },
       { id: "clearBtn", icon: "clear", label: "Clear drawing", key: "C",
         hint: "Remove every segment you have drawn — the scene stays",
         act: () => SIM.clearSegs() }]) },
  { cap: "MEASURE", family: "measure", items: TOOLS.slice(4, TOOLS.length - 1).map(toolItem) },
  // VIEW: how the water is drawn. The three toggles were reachable only from
  // the P / D / N keys or from a scroll of the Controls panel, which on a
  // touch screen meant not at all.
  { cap: "VIEW", family: "view", items: [
    { id: "legendBtn", icon: "legend", label: "Field & legend", key: "L",
      hint: "Which variable the colour shows, its range and its units",
      on: () => LEGEND.isOpen(), act: () => LEGEND.toggle() },
    { id: "partBtn", icon: "particles", label: "Particles", key: "P",
      hint: "Massless tracers — the clearest way to see orbits and jets",
      on: () => state.particles,
      act: () => { state.particles = !state.particles; syncPanel(); } },
    { id: "dyeBtn", icon: "dye", label: "Dye", key: "D",
      hint: "Dye and dye timelines",
      on: () => state.dye, act: () => { state.dye = !state.dye; syncPanel(); } },
    { id: "chanBtn", icon: "channel", label: "Open-channel overlay", key: "N",
      hint: "Critical depth, normal depth and the energy grade line",
      on: () => state.channel, act: () => { state.channel = !state.channel; syncPanel(); } },
  ] },
  { cap: "RUN", family: "run", items: [
    { id: "playBtn", icon: () => (state.paused ? "play" : "pause"), key: "space",
      label: () => (state.paused ? "Run" : "Pause"),
      hint: "Stop the clock — gauge histories freeze with it",
      hot: () => state.paused, act: () => togglePause() },
    { id: "resetBtn", icon: "reset", label: "Reset water", key: "R",
      hint: "Reload the scene's water and clear the gauge histories",
      act: () => { SIM.resetWater(); clearGaugeHistory(); } },
    // Lit when the valves are OPEN, which is what the worded button meant.
    { id: "valveBtn", icon: "valve", label: "Valves", key: "V",
      hint: "Open or slam every valve you have drawn",
      on: () => !!sim && sim.p.valveClosed < 0.5, act: () => toggleValve() },
  ] },
  { cap: "", family: "meta", items: [
    { id: "panelBtn", icon: "sliders", label: "Controls",
      hint: "Every slider: flow, boundaries, hydraulics, view, rig",
      act: () => togglePanel() },
    { id: "keysBtn", icon: "keys", label: "Keyboard", key: "?",
      hint: "The shortcut sheet",
      act: (b) => KEYS.toggle(b) },
    { id: "aboutBtn", icon: "about", label: "About the solver",
      hint: "What is actually being computed — the numerics derivation",
      act: () => window.open(aboutHref(), "_blank", "noopener") },
  ] },
];
```

Note the last group keeps an empty caption: it is chrome, not a family, and
labelling it would imply it belongs to the same taxonomy as the other four.
The test compares captions against the spec's own list, so an empty string is
consistent by construction.

- [ ] **Step 4: Render the caption**

In `buildToolbar`, replace the two `forEach` bodies:

```js
  TOOLBAR.forEach((group, gi) => {
    if (gi) { const s = document.createElement("div"); s.className = "tsep"; host.appendChild(s); }
    const g = document.createElement("div");
    g.className = "tgrp fam-" + group.family;
    const cap = document.createElement("div");
    cap.className = "tcap"; cap.textContent = group.cap;
    cap.setAttribute("aria-hidden", "true");     // the buttons carry the labels
    g.appendChild(cap);
    const row = document.createElement("div"); row.className = "trow";
    group.items.forEach((it) => {
      // …unchanged button construction, appended to `row` instead of `g`
      row.appendChild(b);
    });
    g.appendChild(row);
    host.appendChild(g);
  });
```

and in `syncToolbar`:

```js
  TOOLBAR.forEach((group) => group.items.forEach((it) => {
```

- [ ] **Step 5: Add the four icons**

In `ICONS`, in the same stroke-only 20 × 20 idiom as the rest:

```js
  legend:  '<rect x="3" y="6.5" width="14" height="4" rx="1"/>' +
           '<path d="M3 13.5h3.5M8.2 13.5h3.5M13.5 13.5H17"/>',
  particles: '<circle cx="5" cy="7" r="1.3"/><circle cx="11" cy="5.5" r="1.3"/>' +
             '<circle cx="15" cy="9.5" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/>' +
             '<circle cx="13" cy="15" r="1.3"/>',
  dye:     '<path d="M10 3.5c3 3.6 4.5 5.9 4.5 8a4.5 4.5 0 0 1-9 0c0-2.1 1.5-4.4 4.5-8Z"/>',
  channel: '<path d="M3 6.5h14"/><path d="M3 10h14" stroke-dasharray="2.4 2"/>' +
           '<path d="M3 15.5c3.5 0 4.5-2 7-2s3.5 2 7 2"/>',
```

- [ ] **Step 6: Style the caption**

In `index.html`, replace the `.tgrp` rule and add the caption, keeping the
comment about why `fitBar` measures rather than using a media query:

```css
  /* A group is now a captioned column: the caption names the FAMILY (build the
     rig / measure it / look at it), which is the distinction the strip could
     not make when the families were adjacent rows split by a hairline. */
  .tgrp { display: flex; flex-direction: column; align-items: stretch; gap: 1px; }
  .trow { display: flex; align-items: center; gap: 2px; }
  .tcap {
    font: 600 8.5px ui-monospace, SFMono-Regular, monospace;
    letter-spacing: .13em; text-align: center; opacity: .40;
    line-height: 10px; height: 10px; user-select: none;
    color: rgba(223,232,242,0.85);
  }
  .fam-build   .tcap { color: #ffcf94; }
  .fam-measure .tcap { color: #7fd4ff; }
  .fam-view    .tcap { color: #a9e6c0; }
```

Raise the bar and lengthen the separator to match the taller group:

```css
  #bar { … height: 60px; … }
  .tsep { width: 1px; height: 32px; background: rgba(255,255,255,0.13); margin: 0 4px; flex: 0 0 auto; }
```

and add to the compaction ladder, immediately after the existing
`#bar.tight` rules:

```css
  /* The caption is decoration before it is information: it is the first thing
     dropped when the strip runs out of room, never a control. */
  #bar.tight .tcap { display: none; }
  #bar.tight { height: 52px; }
  #bar.tight .tsep { height: 22px; }
```

- [ ] **Step 7: Run the tests**

Run: `node test/ui-smoke.mjs`
Expected: PASS — including the pre-existing "no control is scrolled out of the
strip" and narrow-window cases, which are the ones that would catch a bar that
has grown past its room.

- [ ] **Step 8: Commit**

```bash
git add index.html js/main.js test/ui-smoke.mjs
git commit -m "The strip names its families: session, build, measure, view, run"
```

---

### Task 4: The legend card

**Files:**
- Modify: `index.html` — `#legend` markup before `#tip`, and its CSS
- Modify: `js/main.js` — the `LEGEND` module after `TIP`; `KEYS.LINES`; the
  `l` key; `boot` calls `LEGEND.build()`
- Modify: `js/sim.js` — new `fieldStats(mode)` readback
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `FIELDS`, `fieldFor`, `rangeFor`, `state.range` (Task 1);
  `Shaders.RAMPS` (Task 2); the `legendBtn` strip item (Task 3).
- Produces:
  - `LEGEND.build()`, `LEGEND.sync()`, `LEGEND.toggle()`, `LEGEND.open()`,
    `LEGEND.close()`, `LEGEND.isOpen()`, `LEGEND.fit()`.
  - `SIM.fieldStats(mode)` → `{ lo, hi, n }` — the 1st and 99th percentile of
    the field over wet cells (`f ≥ 0.5`), and how many cells were counted.
    Returns `null` when nothing is wet.
  - `APP.LEGEND` for the layout gate.

- [ ] **Step 1: Write the failing test**

Add a block to `test/ui-smoke.mjs` after the strip-families block:

```js
    // ------------------------------------------------------------ the legend
    console.log("\nthe legend says what the colour means, and changes it");
    {
      const tab = await browser.open(INDEX + "?scene=m3");
      const p = await tab.evaluate(`
        const el = document.getElementById("legend");
        const r = el.getBoundingClientRect();
        const bar = document.getElementById("bar").getBoundingClientRect();
        return { open: el.classList.contains("open"),
                 name: document.getElementById("legName").textContent,
                 unit: document.getElementById("legHi").textContent,
                 left: r.left, top: r.top, right: r.right, barBottom: bar.bottom,
                 inner: window.innerWidth, rows: el.querySelectorAll(".legrow").length };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("the legend is up by default", p.open);
      check("it clears the strip", p.top >= p.barBottom - 1,
            "legend top " + p.top + " vs bar bottom " + p.barBottom);
      check("it is inside the viewport", p.left >= 0 && p.right <= p.inner);
      check("it names the live field", /water/i.test(p.name), p.name);
      // Water is a TWO-variable encoding and the card has to say so.
      check("water shows two keyed rows", p.rows === 2, p.rows + " rows");

      // Picking from the card moves the field, and the panel agrees.
      const picked = await tab.evaluate(`
        APP.LEGEND.open();
        const item = [...document.querySelectorAll("#legmenu .legopt")]
                       .find((b) => b.dataset.mode === "2");
        item.click();
        return { mode: APP.state.mode,
                 name: document.getElementById("legName").textContent,
                 panel: document.getElementById("c_mode").value,
                 unit: document.getElementById("legUnit").textContent,
                 rows: document.querySelectorAll("#legend .legrow").length };
      `);
      eq("the card picks the field", picked.mode, 2);
      eq("and the panel follows", picked.panel, "2");
      check("the card renames itself", /speed/i.test(picked.name), picked.name);
      eq("and prints the unit", picked.unit, "m/s");
      eq("a single-variable field shows one row", picked.rows, 1);

      // Fit rescales once, from the frame it was clicked on, and then HOLDS.
      const fit = await tab.evaluate(`
        APP.frames(30);
        const before = APP.ui.rangeFor("speed").slice();
        APP.LEGEND.fit();
        const after = APP.ui.rangeFor("speed").slice();
        APP.frames(30);
        const later = APP.ui.rangeFor("speed").slice();
        return { before, after, later,
                 printed: document.getElementById("legHi").textContent };
      `);
      check("Fit moves the range", fit.after[1] !== fit.before[1],
            JSON.stringify(fit.before) + " -> " + JSON.stringify(fit.after));
      eq("and then holds it", fit.later.join(","), fit.after.join(","));
      check("the printed number is the range", fit.printed.startsWith(fit.after[1].toFixed(2)),
            fit.printed);

      // A typed range takes it over and survives a frame.
      const typed = await tab.evaluate(`
        const box = document.getElementById("legHi");
        box.textContent = "1.25";
        box.dispatchEvent(new Event("blur"));
        APP.frames(5);
        return APP.ui.rangeFor("speed")[1];
      `);
      near("typing a range takes it over", typed, 1.25, 1e-6);

      // Each field keeps its own pair across a switch away and back.
      const kept = await tab.evaluate(`
        APP.state.mode = 1; APP.LEGEND.sync();
        APP.state.mode = 2; APP.LEGEND.sync();
        return APP.ui.rangeFor("speed")[1];
      `);
      near("each field keeps its own range", kept, 1.25, 1e-6);

      // L closes and opens it.
      const keyed = await tab.evaluate(`
        dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
        const shut = APP.LEGEND.isOpen();
        dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
        return { shut, open: APP.LEGEND.isOpen() };
      `);
      check("L puts the legend away", !keyed.shut);
      check("and brings it back", keyed.open);
      await tab.close();
    }
```

And in the phone block, after the existing checks:

```js
        const leg = await tab.evaluate(`
          const el = document.getElementById("legend");
          const r = el.getBoundingClientRect();
          const d = document.getElementById("dock").getBoundingClientRect();
          return { open: el.classList.contains("open"), bottom: r.bottom, sheetTop: d.top,
                   right: r.right, inner: window.innerWidth };
        `);
        check("the legend clears the bottom sheet", !leg.open || leg.bottom <= leg.sheetTop + 1,
              "legend bottom " + leg.bottom + " vs sheet top " + leg.sheetTop);
        check("and stays inside the width", leg.right <= leg.inner);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — there is no `#legend`.

- [ ] **Step 3: Add the readback**

In `js/sim.js`, after `probe`:

```js
  /** The 1st and 99th percentile of a display field over WET cells, for the
   *  legend's Fit button. One readPixels of each state texture — the same
   *  bargain `rescaleFill` and `boxForce` already make, and it happens on a
   *  click, never per frame.
   *
   *  Percentiles rather than min/max because a single cell at a jet's lip, or
   *  one cell of a bad column, otherwise sets the scale for the whole picture
   *  and everything else renders as one flat colour. Dry cells are excluded
   *  because they are not water: an empty cell's stored pressure is zero and
   *  averaging it into the range drags every scale toward the floor. */
  function fieldStats(mode) {
    const n = S.nx * S.ny;
    const U = new Float32Array(n * 4), F = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, U);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, S.nx, S.ny, gl.RGBA, gl.FLOAT, F);
    const g = Math.abs(S.p.g) || 9.81, tilt = S.scene.tiltS0 || 0;
    const col = columns();                       // per-column depth, for Froude
    const v = [];
    for (let j = 0; j < S.ny; j++) {
      for (let i = 0; i < S.nx; i++) {
        const k = (j * S.nx + i) * 4;
        if (F[k] < 0.5) continue;                // dry, or the thin edge of a jet
        if (S.mask[j * S.nx + i] > 192) continue;
        const u = U[k], w = U[k + 1], P = U[k + 2];
        const x = (i + 0.5) * S.dx, z = (j + 0.5) * S.dx;
        let q;
        if (mode === 0 || mode === 1) q = P / g;
        else if (mode === 6) q = z - tilt * x + P / g;
        else if (mode === 2) q = Math.hypot(u, w);
        else if (mode === 3) q = Math.abs(u) / Math.sqrt(Math.max(g * col[i * 4 + 1], 1e-4));
        else if (mode === 4) q = null;           // needs neighbours; see below
        else q = F[k] * u * Math.hypot(u, w);
        if (q !== null && isFinite(q)) v.push(q);
      }
    }
    if (mode === 4) {                            // vorticity: a stencil, not a cell
      for (let j = 1; j < S.ny - 1; j++) {
        for (let i = 1; i < S.nx - 1; i++) {
          const k = (j * S.nx + i) * 4;
          if (F[k] < 0.5 || S.mask[j * S.nx + i] > 192) continue;
          const dwdx = U[(j * S.nx + i + 1) * 4 + 1] - U[(j * S.nx + i - 1) * 4 + 1];
          const dudz = U[((j + 1) * S.nx + i) * 4] - U[((j - 1) * S.nx + i) * 4];
          const q = (dwdx - dudz) / (2 * S.dx);
          if (isFinite(q)) v.push(q);
        }
      }
    }
    if (!v.length) return null;
    v.sort((a, b) => a - b);
    const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    return { lo: at(0.01), hi: at(0.99), n: v.length };
  }
```

Add `fieldStats` to the returned object.

- [ ] **Step 4: Add the markup**

In `index.html`, immediately before `<div id="tip" class="glass"></div>`:

```html
<!-- The colour key, and the field picker. It is DOM rather than part of the
     overlay canvas because it carries a menu, a button and two editable
     numbers — hit-testing and text entry the 2D context would have to be
     taught from scratch. A window or CDP screenshot captures it either way,
     which is the point: a screenshot in a worksheet should say what it is
     showing. -->
<div id="legend" class="glass">
  <button id="legPick" type="button">
    <b id="legName">Water</b><i id="legSym"></i><span class="caret">▾</span>
  </button>
  <div id="legBars"></div>
  <div id="legFoot">
    <span id="legLo" class="legnum" contenteditable="true" spellcheck="false">0</span>
    <span class="grow"></span>
    <span id="legHi" class="legnum" contenteditable="true" spellcheck="false">1</span>
    <span id="legUnit"></span>
  </div>
  <div id="legActs">
    <button id="legFit" type="button" title="Rescale to this frame (99th percentile over wet cells)">Fit</button>
    <button id="legDef" type="button" title="Back to the scene's own scale">⟲ scene</button>
  </div>
  <button class="minbtn corner" id="legX" title="Put the legend away (L)">–</button>
</div>
<div id="legmenu" class="glass"></div>
```

- [ ] **Step 5: Style it**

In `index.html`, after the hover-card block:

```css
  /* ------------------------------------------------------------- the legend */
  #legend {
    position: fixed; z-index: 12; left: 12px; top: 78px; width: 232px;
    display: none; padding: 9px 11px 8px; gap: 5px; flex-direction: column;
    font: 11.5px system-ui, sans-serif;
  }
  #legend.open { display: flex; }
  #legPick {
    appearance: none; background: transparent; border: 1px solid transparent;
    border-radius: 8px; color: inherit; cursor: pointer; text-align: left;
    padding: 2px 22px 2px 4px; margin: -2px -4px 0; display: flex;
    align-items: baseline; gap: 6px;
  }
  #legPick:hover, #legPick.open { background: rgba(255,255,255,0.08); border-color: rgba(77,195,255,0.40); }
  #legPick b { font-size: 12.5px; font-weight: 600; }
  #legPick i { font: 11px ui-monospace, monospace; opacity: .60; font-style: normal; }
  #legPick .caret { font-size: 9px; opacity: .5; margin-left: auto; }
  .legrow { display: flex; flex-direction: column; gap: 2px; margin-top: 3px; }
  .legbar { height: 10px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.10); }
  .legcap {
    font: 10px ui-monospace, monospace; opacity: .58; display: flex;
    justify-content: space-between; gap: 8px;
  }
  #legFoot, #legActs { display: flex; align-items: center; gap: 6px; }
  #legFoot { font: 10.5px ui-monospace, monospace; opacity: .78; }
  #legFoot .grow { flex: 1 1 auto; }
  .legnum {
    padding: 1px 4px; border-radius: 5px; cursor: text; outline: none;
    border: 1px solid transparent; font-variant-numeric: tabular-nums;
  }
  .legnum:hover { background: rgba(255,255,255,0.08); }
  .legnum:focus { background: rgba(12,17,26,0.9); border-color: rgba(77,195,255,0.55); }
  #legActs button {
    appearance: none; background: rgba(255,255,255,0.07); color: inherit;
    border: 1px solid rgba(255,255,255,0.12); border-radius: 7px;
    padding: 2px 9px; font: 10.5px system-ui, sans-serif; cursor: pointer;
  }
  #legActs button:hover { background: rgba(77,195,255,0.22); }
  #legmenu {
    position: fixed; z-index: 40; display: none; padding: 6px; width: 300px;
    max-height: 70vh; overflow: auto;
  }
  #legmenu.open { display: block; }
  .legopt {
    display: block; width: 100%; text-align: left; appearance: none;
    background: transparent; border: 0; border-radius: 8px; color: inherit;
    padding: 6px 9px; cursor: pointer;
  }
  .legopt:hover { background: rgba(255,255,255,0.09); }
  .legopt.on { background: rgba(77,195,255,0.18); }
  .legopt b { font: 600 12px system-ui, sans-serif; }
  .legopt i { font: 10.5px ui-monospace, monospace; opacity: .6; font-style: normal; margin-left: 6px; }
  .legopt span { display: block; font-size: 11px; opacity: .62; margin-top: 2px; }
  /* On the phone the bottom sheet owns the lower half and the strip the top,
     so there is no room for a second floating box: the legend is put away and
     the field stays reachable from Controls. */
  @media (max-width: 620px) { #legend.open { display: none; } }
```

- [ ] **Step 6: Build the module**

In `js/main.js`, after the `TIP` module:

```js
/** The colour key — and the field picker, because they are the same question.
 *  The seven colourings existed long before anything on screen said which one
 *  was up, what its range was, or in what units; a screenshot pasted into a
 *  worksheet therefore carried no statement of what it showed. The card is
 *  built from the FIELDS registry, so a field cannot be added without its
 *  legend coming with it. */
const LEGEND = (() => {
  let open = true, menuOpen = false;
  const el = () => document.getElementById("legend");
  const menu = () => document.getElementById("legmenu");

  /** A CSS gradient from the ramp the shader itself uses. */
  function css(stops) {
    return "linear-gradient(to right," + stops.map((c, k) =>
      "rgb(" + c.map((v) => Math.round(v * 255)).join(",") + ") " +
      (100 * k / (stops.length - 1)).toFixed(0) + "%").join(",") + ")";
  }
  const RAMP_CSS = {
    turbo: () => css(Shaders.RAMPS.turbo),
    divg:  () => css(Shaders.RAMPS.divg),
    // The Water view's own hue ramp, shallow → deep, as FS_DISP mixes it.
    water: () => css([[0.24, 0.56, 0.78], [0.05, 0.20, 0.42]]),
  };

  function build() {
    document.getElementById("legPick").onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    document.getElementById("legX").onclick = () => close();
    document.getElementById("legFit").onclick = (e) => { e.target.blur(); fit(); };
    document.getElementById("legDef").onclick = (e) => {
      e.target.blur();
      const f = fieldFor(state.mode);
      state.range[f.id] = f.def();
      sync();
    };
    ["legLo", "legHi"].forEach((id, k) => {
      const box = document.getElementById(id);
      box.addEventListener("blur", () => commit(k, box.textContent));
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); box.blur(); }
        if (e.key === "Escape") { e.preventDefault(); sync(); box.blur(); }
        e.stopPropagation();          // the app's shortcuts are not for a text box
      });
    });
    el().classList.toggle("open", open);
    sync();
  }

  /** A typed end of the range. A pair that is not strictly increasing is a
   *  division by zero in the shader's mapping, so it is refused rather than
   *  clamped — the box simply reverts to what it was showing. */
  function commit(k, text) {
    const f = fieldFor(state.mode), r = rangeFor(f.id).slice();
    const v = parseFloat(String(text).replace(/[^\d.eE+-]/g, ""));
    if (isFinite(v)) { r[k] = v; if (r[1] > r[0]) state.range[f.id] = r; }
    sync();
  }

  /** Rescale to the frame this was clicked on, and then hold. */
  function fit() {
    const f = fieldFor(state.mode);
    const s = SIM.fieldStats(state.mode);
    if (!s) { showToast("Nothing to fit", "No wet cells on screen yet — pour some water first."); return; }
    // A sequential ramp starts at its floor; a diverging one keeps its centre
    // by taking the larger half, or the reading either side of Fr = 1.
    if (f.ramp === "divg" && f.mid === 0) {
      const m = Math.max(Math.abs(s.lo), Math.abs(s.hi), 1e-6);
      state.range[f.id] = [-m, m];
    } else if (f.mid !== undefined) {
      const m = Math.max(f.mid - s.lo, s.hi - f.mid, 1e-6);
      state.range[f.id] = [f.mid - m, f.mid + m];
    } else {
      state.range[f.id] = [Math.min(0, s.lo), Math.max(s.hi, s.lo + 1e-3)];
    }
    sync();
  }

  /** Repaint from live state. Cheap; called from the panel, the G key and
   *  every open/close. */
  function sync() {
    const f = fieldFor(state.mode), r = rangeFor(f.id);
    document.getElementById("legName").textContent = f.name;
    document.getElementById("legSym").textContent = f.sym;
    document.getElementById("legUnit").textContent = f.unit;
    document.getElementById("legLo").textContent = fmtNum(r[0]);
    document.getElementById("legHi").textContent = fmtNum(r[1]);
    const bars = document.getElementById("legBars");
    bars.textContent = "";
    if (f.id === "water") {
      // TWO variables, and the card has to say so: a reader who is told only
      // "blue" cannot tell deep from fast.
      bars.appendChild(row(RAMP_CSS.water(), "depth below surface",
                           fmtNum(r[0]) + " – " + fmtNum(r[1]) + " m"));
      bars.appendChild(row("linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.55))",
                           "speed, added as brightness",
                           "0 – " + fmtNum(vmaxFor()) + " m/s"));
    } else {
      bars.appendChild(row(RAMP_CSS[f.ramp](), f.sym || f.name, f.unit));
    }
    const b = document.getElementById("legendBtn");
    if (b) b.classList.toggle("on", open);
    if (menuOpen) renderMenu();
  }

  function row(gradient, left, right) {
    const d = document.createElement("div"); d.className = "legrow";
    const bar = document.createElement("div"); bar.className = "legbar";
    bar.style.background = gradient;
    const cap = document.createElement("div"); cap.className = "legcap";
    const a = document.createElement("span"); a.textContent = left;
    const c = document.createElement("span"); c.textContent = right;
    cap.appendChild(a); cap.appendChild(c);
    d.appendChild(bar); d.appendChild(cap);
    return d;
  }

  /** Three significant figures, without exponent soup on a 0.0004 range. */
  function fmtNum(v) {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(2) : a >= 0.01 ? v.toFixed(3) : v.toExponential(1);
  }

  function renderMenu() {
    const m = menu();
    m.textContent = "";
    FIELDS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "legopt" + (f.mode === state.mode ? " on" : "");
      b.dataset.mode = String(f.mode);
      const t = document.createElement("b"); t.textContent = f.name;
      const s = document.createElement("i"); s.textContent = f.sym;
      const w = document.createElement("span"); w.textContent = f.blurb;
      b.appendChild(t); b.appendChild(s); b.appendChild(w);
      b.onclick = () => { state.mode = f.mode; closeMenu(); sync(); syncPanel(); };
      m.appendChild(b);
    });
    const a = document.getElementById("legPick").getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, a.left)) + "px";
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, a.bottom + 6) + "px";
  }
  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
  function openMenu() {
    menuOpen = true; menu().classList.add("open");
    document.getElementById("legPick").classList.add("open");
    renderMenu();
  }
  function closeMenu() {
    menuOpen = false; menu().classList.remove("open");
    document.getElementById("legPick").classList.remove("open");
  }
  function onDown(e) {
    if (!menuOpen) return;
    if (menu().contains(e.target)) return;
    if (document.getElementById("legPick").contains(e.target)) return;
    closeMenu();
  }

  function setOpen(v) {
    open = v;
    el().classList.toggle("open", open);
    closeMenu();
    sync();
    syncToolbar();
  }
  return { build, sync, fit, isOpen: () => open, open: () => setOpen(true),
           close: () => setOpen(false), toggle: () => setOpen(!open), onDown };
})();
```

- [ ] **Step 7: Wire it into boot, the keyboard and the dismiss handler**

In `boot`, after `buildToolbar()`:

```js
  LEGEND.build();
```

In the `pointerdown` handler that already calls `KEYS.onDown(e)`, add
alongside it:

```js
    LEGEND.onDown(e);
```

In the keydown handler, beside the other view toggles:

```js
    else if (k === "l") LEGEND.toggle();
```

In `KEYS.LINES`, after the `"G"` line:

```js
    ["L", "the legend — which field, its range, its units"],
```

and change the `G` line's text to `"cycle the field (the legend names it)"`.

Export for the gate — in `window.APP`:

```js
  LEGEND,                                  // the colour key and field picker
```

- [ ] **Step 8: Run the tests**

Run: `node test/ui-smoke.mjs`
Expected: PASS, including the phone case.

- [ ] **Step 9: Commit**

```bash
git add index.html js/main.js js/sim.js test/ui-smoke.mjs
git commit -m "A legend that is also the field picker, with a range in units"
```

---

### Task 5: The UI profile engine

**Files:**
- Modify: `js/main.js` — `UIMODE` module after `LEGEND`; `state.ui`;
  `buildToolbar` filters by the profile; the digit branch of the keydown
  handler; `buildPanel` / `syncPanel` honour the panel level
- Modify: `index.html` — the ⋯ button's CSS and the panel's focus switch
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `TOOLBAR` groups `{ cap, family, items }` (Task 3), `FIELDS` and
  `fieldFor` (Task 1), `LEGEND.open/close` (Task 4).
- Produces:
  - `state.ui` — the resolved profile:
    `{ build, measure, view, fields, legend, panel, readouts, lifted }`,
    where `build`/`measure`/`view` are `true` or an array of item ids,
    `fields` is `true` or an array of field ids, `panel` is
    `"full" | "focused" | "shut"`, and `readouts` is
    `{ gauges, cursor, status }`.
  - `UIMODE.full()` → the everything profile.
  - `UIMODE.apply(profile)` — resolve, store on `state.ui`, rebuild the
    strip, re-sync the panel and the legend.
  - `UIMODE.lift()` — restore everything for the session.
  - `UIMODE.narrowed()` → boolean, whether anything is currently hidden.
  - `UIMODE.allows(family, id)` → boolean, used by `buildToolbar` and the
    digit keys.
  - `APP.UIMODE` for the layout gate.

- [ ] **Step 1: Write the failing test**

Add to `test/ui-smoke.mjs`, after the legend block:

```js
    // ------------------------------------------------------- the UI profile
    console.log("\nan exercise can narrow the interface, and never lock it");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const base = await tab.evaluate(`
        return { buttons: document.querySelectorAll("#groups .tbtn").length,
                 narrowed: APP.UIMODE.narrowed() };
      `);
      check("the sandbox is not narrowed", !base.narrowed);

      const narrow = await tab.evaluate(`
        APP.UIMODE.apply({ build: false, measure: ["gauge"], panel: "focused" });
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { labels, n: labels.length,
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn"),
                 wall: labels.includes("Wall"), gauge: labels.includes("Gauge"),
                 rake: labels.includes("Rake") };
      `);
      check("the drawing tools go", !narrow.wall, narrow.labels.join(","));
      check("the declared instrument stays", narrow.gauge);
      check("the undeclared instrument goes", !narrow.rake);
      check("fewer buttons than before", narrow.n < base.buttons,
            narrow.n + " vs " + base.buttons);
      check("the profile knows it is narrowing", narrow.narrowed);
      check("and offers a way out", narrow.showAll);

      // A hidden tool's DIGIT still means that tool: worksheets say "press 5".
      const digit = await tab.evaluate(`
        APP.state.tool = "gauge";
        dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));  // Wall, hidden
        return APP.state.tool;
      `);
      eq("a hidden tool's digit selects nothing else", digit, "gauge");

      const lifted = await tab.evaluate(`
        document.getElementById("showAllBtn").click();
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { n: labels.length, wall: labels.includes("Wall"),
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn") };
      `);
      check("Show everything brings the tools back", lifted.wall);
      eq("every control is back", lifted.n, base.buttons);
      check("and the way out goes away", !lifted.showAll && !lifted.narrowed);
      await tab.close();
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — `APP.UIMODE` is undefined.

- [ ] **Step 3: Add `state.ui` and the module**

In the `state` literal, beside `range: {}`:

```js
  ui: null,                   // the resolved UI profile; UIMODE.full() when absent
```

In `js/main.js`, after the `LEGEND` module:

```js
/** What of the interface an exercise wants in front of a student.
 *
 *  The strip's families are what makes this expressible at all: "no build
 *  tools, these two instruments" is one line because there is now a name for
 *  each of those things. Most of the data was already in the pack — an entry's
 *  `instruments` list has always been a statement of the tools that exercise
 *  needs, and `studentControls` has always known which panel controls belong
 *  to the student — so a profile is mostly a matter of reading what the pack
 *  already says.
 *
 *  A profile is NEVER a cage. `⋯ Show everything` restores the lot in one
 *  click, and the standing acceptance test — the sandbox must be able to
 *  reproduce any scene by hand — is why. */
const UIMODE = (() => {
  const BUILD_TOOLS = ["wall", "erase", "valve", "spout", "pour"];

  function full() {
    return { build: true, measure: true, view: true, fields: true,
             legend: true, panel: "full",
             readouts: { gauges: true, cursor: true, status: true },
             lifted: false };
  }

  /** The profile an exercise gets when it does not spell one out, plus
   *  whatever it does spell out on top. An exercise that declares nothing and
   *  lists no instruments keeps today's interface, except for the panel. */
  function fromExercise(ex) {
    const p = full();
    if (!ex) return p;
    const tools = (ex.instruments || []).map((i) => i.tool).filter(Boolean);
    if (tools.length) {
      p.measure = tools.filter((t) => BUILD_TOOLS.indexOf(t) < 0);
      const wanted = tools.filter((t) => BUILD_TOOLS.indexOf(t) >= 0);
      p.build = wanted.length ? wanted : false;
      if (!p.measure.length) p.measure = false;
    } else {
      p.build = false;                 // an exercise arrives with its rig built
    }
    p.panel = "focused";
    return Object.assign(p, ex.ui || {});
  }

  /** Is this item allowed? `list` is `true` (everything), `false` (nothing) or
   *  the ids that survive. Non-tool items in a family are matched on the
   *  button id so a profile can name `legendBtn` as readily as `gauge`. */
  function allows(family, it) {
    const u = state.ui || full();
    if (u.lifted) return true;
    const list = u[family];
    if (list === undefined || list === true) return true;
    if (list === false) return false;
    const id = it.tool || it.id || "";
    return list.indexOf(id) >= 0 || list.indexOf(it.id) >= 0;
  }

  /** True when anything at all is currently hidden — what puts ⋯ on the strip. */
  function narrowed() {
    const u = state.ui;
    if (!u || u.lifted) return false;
    return ["build", "measure", "view"].some((f) => u[f] !== true) ||
           u.fields !== true || u.panel !== "full" ||
           Object.values(u.readouts || {}).some((v) => v === false);
  }

  function apply(profile) {
    state.ui = Object.assign(full(), profile || {});
    if (state.ui.legend === false) LEGEND.close(); else LEGEND.open();
    // A profile that hides the live field would leave the legend naming
    // something the picker cannot reach, so the field moves to the first one
    // the profile does offer.
    if (Array.isArray(state.ui.fields) && state.ui.fields.length &&
        state.ui.fields.indexOf(fieldFor(state.mode).id) < 0) {
      const f = FIELDS.find((q) => q.id === state.ui.fields[0]);
      if (f) state.mode = f.mode;
    }
    buildToolbar();
    LEGEND.sync();
    syncPanel();
  }
  function lift() { state.ui.lifted = true; buildToolbar(); LEGEND.sync(); syncPanel(); }
  function reset() { apply(full()); }

  return { full, fromExercise, apply, lift, reset, allows, narrowed };
})();
```

- [ ] **Step 4: Filter the strip and add the ⋯ button**

In `buildToolbar`, skip disallowed items and drop a group that ends up empty
(an empty captioned column would read as a family with nothing in it):

```js
  TOOLBAR.forEach((group) => {
    const items = group.items.filter((it) => UIMODE.allows(group.family, it));
    if (!items.length) return;
    if (host.children.length) { const s = document.createElement("div"); s.className = "tsep"; host.appendChild(s); }
    // …build the group from `items` rather than group.items
  });
```

(the separator now keys off whether anything has been appended, not the group
index, or a hidden first group leaves a leading hairline).

After the groups are appended, the escape hatch:

```js
  // The way back. It exists whenever anything is hidden, and it is the reason
  // a profile is allowed to hide anything at all.
  if (UIMODE.narrowed()) {
    const g = document.createElement("div"); g.className = "tgrp fam-meta";
    const cap = document.createElement("div"); cap.className = "tcap"; cap.textContent = "";
    const row = document.createElement("div"); row.className = "trow";
    const b = document.createElement("button");
    b.type = "button"; b.className = "tbtn"; b.id = "showAllBtn";
    b.setAttribute("aria-label", "Show everything");
    b.appendChild(iconEl("all"));
    b.onclick = () => { b.blur(); TIP.hide(); UIMODE.lift();
                        showToast("Every control is back",
                          "The exercise had narrowed the interface. Pick it again to get its focus back."); };
    b.onpointerenter = (e) => { if (e.pointerType !== "touch")
      TIP.show(b, "Show everything", "This exercise hides some controls — this brings them all back", ""); };
    b.onpointerleave = () => TIP.hide();
    row.appendChild(b); g.appendChild(cap); g.appendChild(row);
    host.appendChild(g);
  }
```

with one more icon in `ICONS`:

```js
  all:     '<circle cx="4.5" cy="10" r="1.4" fill="currentColor" stroke="none"/>' +
           '<circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/>' +
           '<circle cx="15.5" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
```

- [ ] **Step 5: Gate the digit keys and the fields**

In the keydown handler, replace the digit branch:

```js
    // A hidden tool keeps its digit: worksheets say "press 5", and renumbering
    // under a profile would make the pack lie. The key says why instead.
    else if (+k >= 1 && +k <= TOOL_KEYS) {
      const t = TOOLS[+k - 1];
      const fam = TOOLS.slice(0, 4).concat([TOOLS[TOOLS.length - 1]]).indexOf(t) >= 0
                    ? "build" : "measure";
      if (UIMODE.allows(fam, { tool: t[0], id: t[0] })) {
        state.tool = t[0]; window.syncTools();
      } else {
        showToast(t[1] + " is off for this exercise",
                  "Press ⋯ Show everything on the strip to bring every control back.");
      }
    }
```

In `LEGEND.renderMenu` and the panel's `mode` options, filter by the profile:

```js
    fieldsOffered().forEach((f) => {         // in renderMenu, in place of FIELDS.forEach
```

with, in the `LEGEND` closure:

```js
  /** The fields this profile offers — the whole registry unless an exercise
   *  has narrowed it. */
  function fieldsOffered() {
    const u = state.ui;
    if (!u || u.lifted || u.fields === true || !Array.isArray(u.fields)) return FIELDS;
    return FIELDS.filter((f) => u.fields.indexOf(f.id) >= 0);
  }
```

and the `g` key cycles `fieldsOffered()` rather than `FIELDS` — export it on
the module's returned object so the key handler can reach it.

- [ ] **Step 6: Honour the panel level**

In `buildPanel`, give every row and heading a stable hook so a level can hide
sections without rebuilding the panel. Track the current heading as the rows
are created:

```js
  let section = "";
  CONTROLS.forEach((c) => {
    if (c.h) { section = c.h; const el = document.createElement("h3");
               el.textContent = c.h; el.dataset.sec = section; p.appendChild(el); return; }
    …
    row.dataset.sec = section;
    …
    note.dataset.sec = section;
```

and at the head of the panel, the switch (built once, in `buildPanel`, before
the loop):

```js
  const head = document.createElement("div");
  head.className = "panelfocus";
  const sw = document.createElement("button");
  sw.type = "button"; sw.id = "panelAll";
  sw.onclick = () => { sw.blur(); UIMODE.lift(); };
  head.appendChild(sw);
  p.appendChild(head);
```

In `syncPanel`, after the existing loop, apply the level:

```js
  // The panel's focus. "focused" shows the sections this exercise actually
  // touches — the student's own controls, whatever its rig sets, and View —
  // because a first-year hunting for one slider in eleven sections is being
  // asked the wrong question. Everything is one click away, always.
  const u = state.ui || UIMODE.full();
  const level = u.lifted ? "full" : u.panel;
  const keep = focusedSections();
  document.querySelectorAll("#panel [data-sec]").forEach((el) => {
    el.classList.toggle("off", level !== "full" && keep.indexOf(el.dataset.sec) < 0);
  });
  const sw = document.getElementById("panelAll");
  if (sw) {
    sw.textContent = level === "full" ? "" : "⋯ Show every control";
    sw.parentElement.classList.toggle("on", level !== "full");
  }
```

with the section set derived from the exercise, next to `syncPanel`:

```js
/** The Controls sections a focused panel keeps: the ones carrying the
 *  student's own controls, the ones the exercise itself sets through
 *  `rigParams` / `viewParams`, and View — which is where the field, the
 *  legend and the overlays live and is wanted in every exercise. */
function focusedSections() {
  const ex = EX.current;
  const ids = [];
  if (ex) {
    Object.keys(ex.rigParams || {}).forEach((k) => ids.push(k));
    Object.keys(ex.viewParams || {}).forEach((k) => ids.push(k));
    (EX.studentControls ? EX.studentControls(ex) : []).forEach((k) => ids.push(k));
  }
  const secs = ["View"];
  let section = "";
  CONTROLS.forEach((c) => {
    if (c.h) { section = c.h; return; }
    if (ids.indexOf(c.id) >= 0 && secs.indexOf(section) < 0) secs.push(section);
  });
  return secs;
}
```

`studentControls` currently lives inside the `EX` closure; export it on the
module's returned object so `focusedSections` can call it.

In `index.html`, the two rules this needs:

```css
  #panel [data-sec].off { display: none; }
  .panelfocus { display: none; padding: 0 0 6px; }
  .panelfocus.on { display: block; }
  #panelAll {
    appearance: none; width: 100%; text-align: left; cursor: pointer;
    background: rgba(77,195,255,0.10); color: #bfe6ff;
    border: 1px solid rgba(77,195,255,0.30); border-radius: 8px;
    padding: 5px 9px; font: 11px system-ui, sans-serif;
  }
  #panelAll:hover { background: rgba(77,195,255,0.20); }
```

- [ ] **Step 7: Run the tests**

Run: `node test/ui-smoke.mjs`
Expected: PASS. The pre-existing "the strip renders the whole spec" case
compares against the spec count, so it must be run in the sandbox (unnarrowed)
context it already uses — check it still is.

- [ ] **Step 8: Commit**

```bash
git add index.html js/main.js test/ui-smoke.mjs
git commit -m "UI profiles: an exercise can narrow the interface, never lock it"
```

---

### Task 6: Wire profiles to the exercise pack

**Files:**
- Modify: `js/main.js` — `EX.pick` applies the profile; `switchScene`,
  `newSandbox` and `EX.clear` reset it
- Modify: `js/exercises.js` — an explicit `ui` on the two exercises whose
  derived profile is wrong
- Modify: `exercises/_runner/check_pack.py` — validate any `ui` key
- Test: `test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `UIMODE.fromExercise(ex)`, `UIMODE.reset()` (Task 5).
- Produces: nothing new; this is the wiring.

- [ ] **Step 1: Write the failing test**

Add to the `?ex=HJ-1` block in `test/ui-smoke.mjs`, before the folding cases:

```js
      // The brief narrows the strip, and says so with a way out.
      const prof = await tab.evaluate(`
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { labels, wall: labels.includes("Wall"),
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn"),
                 panelHidden: [...document.querySelectorAll("#panel [data-sec]")]
                                .filter((e) => e.classList.contains("off")).length };
      `);
      check("an exercise puts the drawing tools away", !prof.wall, prof.labels.join(","));
      check("and offers the way back", prof.showAll && prof.narrowed);
      check("the panel is focused", prof.panelHidden > 0, prof.panelHidden + " hidden");

      // Leaving the exercise restores everything.
      const left = await tab.evaluate(`
        APP.switchScene("sandbox");
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { wall: labels.includes("Wall"), narrowed: APP.UIMODE.narrowed() };
      `);
      check("a new scene gives the interface back", left.wall && !left.narrowed);

      // …and coming back re-applies it, even after a lift.
      const again = await tab.evaluate(`
        await APP.pickExercise("HJ-1");
        await APP.EX.ready;
        APP.UIMODE.lift();
        await APP.pickExercise("HJ-1");
        await APP.EX.ready;
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { wall: labels.includes("Wall"), narrowed: APP.UIMODE.narrowed() };
      `, { awaitPromise: true });
      check("re-picking re-applies the profile", !again.wall && again.narrowed);
```

Note `APP.EX.ready` — `AGENTS.md` records that `pickExercise` lands its rig a
microtask later, so the profile is not observable until it resolves.

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/ui-smoke.mjs`
Expected: FAIL — nothing applies a profile yet, so `Wall` is still on the strip.

- [ ] **Step 3: Apply on pick, reset on leave**

In `EX.pick`, after the rig and the view params have been applied (the same
place `viewParams` is applied), add:

```js
    UIMODE.apply(UIMODE.fromExercise(ex));
```

In `switchScene`, in `newSandbox` (before `switchScene`), and in `EX.clear`:

```js
  UIMODE.reset();
```

Export for the gate — in `window.APP`:

```js
  UIMODE,                                  // the exercise UI profile
```

- [ ] **Step 4: Give the two drawing exercises their build tools back**

The derived rule hides BUILD unless an exercise's `instruments` names a build
tool. Two entries in `js/exercises.js` are drawing exercises whose
`instruments` list does not say so — the GVF chip hunt, whose task is "draw
beds, gates, weirs and tailwaters", and any entry whose `start` says the rig
is drawn by hand. Find them:

```bash
grep -n "drawn by hand\|draw beds\|draw a" js/exercises.js
```

and give each an explicit profile:

```js
    ui: { build: true },
```

Run `node exercises/_runner/smoke.js --only=api` afterwards: it boots every
exercise, so an entry that needs a tool it cannot reach shows up there.

- [ ] **Step 5: Validate profiles in the pack checker**

In `exercises/_runner/check_pack.py`, alongside the existing per-entry checks:

```python
    # A `ui` profile names tools and fields that must exist, or a brief will
    # quietly hide a control the task asks for.
    TOOLS = {"wall", "erase", "valve", "spout", "gauge", "rake", "tracer",
             "measure", "cv", "pour"}
    FIELDS = {"water", "phead", "head", "speed", "froude", "vort", "mom"}
    PANEL = {"full", "focused", "shut"}
    ui = ex.get("ui")
    if ui is not None:
        for fam in ("build", "measure", "view"):
            v = ui.get(fam)
            if isinstance(v, list):
                bad = [t for t in v if t not in TOOLS]
                if bad:
                    fail(eid, "ui.%s names tools that do not exist: %s" % (fam, ", ".join(bad)))
        if isinstance(ui.get("fields"), list):
            bad = [f for f in ui["fields"] if f not in FIELDS]
            if bad:
                fail(eid, "ui.fields names fields that do not exist: %s" % ", ".join(bad))
        if ui.get("panel") is not None and ui["panel"] not in PANEL:
            fail(eid, "ui.panel is %r, not one of %s" % (ui["panel"], sorted(PANEL)))
```

Match the file's own `fail(...)` / reporting idiom rather than this sketch —
read the surrounding checks first and follow them exactly.

- [ ] **Step 6: Run the tests**

```bash
node test/ui-smoke.mjs
python3 exercises/_runner/check_pack.py
node exercises/_runner/smoke.js --only=api,rig
```

Expected: all three exit 0.

- [ ] **Step 7: Commit**

```bash
git add js/main.js js/exercises.js exercises/_runner/check_pack.py test/ui-smoke.mjs
git commit -m "Exercises carry a UI profile: their instruments, their sections"
```

---

### Task 7: Documentation and the full gate

**Files:**
- Modify: `AGENTS.md` — the "Where things live" row for `main.js`, and a line
  in the interface section about the registry
- Modify: `docs/engineering-notes.md` — a short section under "The view"
- Test: the four existing gates

**Interfaces:**
- Consumes: everything above. Produces: nothing code-facing.

- [ ] **Step 1: Note the registry in AGENTS.md**

Under **Rules that keep it alive**, after the panel-toggles bullet:

```markdown
- **A field is described once.** The seven colourings live in `FIELDS` in
  `main.js` — mode integer, name, symbol, unit, ramp and default range — and
  the legend, the Controls select and the `G` key all read it. The ramp
  colours themselves are `Shaders.RAMPS`, interpolated into the display
  shader, so the key on screen and the water cannot drift apart. Adding a
  field means adding a row, not editing three places.
```

- [ ] **Step 2: Note the range rule in the engineering notes**

Under `## The view`:

```markdown
### The colour range

Every field is painted over an explicit `[lo, hi]` in its own units
(`u_lo` / `u_hi` in the display pass), seeded from the scene and shown on
the legend. The range does **not** track the flow: Fit rescales once, from
the frame it was clicked on, to the 1st–99th percentile over wet cells.

That is deliberate. A range that follows the water means the same colour is
a different number from second to second, so two frames cannot be compared,
and neither can two students' screenshots — which is the entire reason for
printing the scale. Percentiles rather than min/max because one cell at a
jet's lip otherwise sets the scale for the whole picture; wet cells only
(`f ≥ 0.5`) because a dry cell's stored pressure is zero and averaging it in
drags every scale toward the floor.

The diverging fields keep their meaningful centre when they are rescaled:
Fr = 1 and ω = 0 stay on the pale band whatever the two ends are, because a
midpoint taken from the range would move the critical line.
```

- [ ] **Step 2a: Document the profile in AGENTS.md**

Under **The exercise pack**, after the paragraph on the four descriptions:

```markdown
An entry may also carry a `ui` profile — which strip families and instruments
it wants in front of a student, how focused the Controls panel opens, and
which fields the legend offers. What it does not say is derived from what it
already declares: `instruments` narrows MEASURE, an entry that names no build
tool loses BUILD, and the panel opens on the sections its own controls live
in. `⋯ Show everything` on the strip lifts any of it in one click, which is
what keeps "the sandbox must reproduce any scene by hand" true.
```

- [ ] **Step 3: Run the whole gate**

```bash
python3 exercises/_runner/check_pack.py
python3 exercises/_runner/check_notation.py
node test/ui-smoke.mjs
node exercises/_runner/smoke.js --only=api,rig
```

Expected: all four exit 0. `smoke.js --only=api,rig` is the ~2.5 minute
subset; the full `smoke.js` (~9 min) is the pre-push gate and should be run
before the PR.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/engineering-notes.md
git commit -m "Docs: the field registry and why the colour range is held, not tracked"
```

---

## Self-review

**Spec coverage.** Taxonomy → Task 3. Field registry → Task 1. Ramps as one
source and `u_lo`/`u_hi` → Task 2. Legend card, Fit, manual range, per-field
ranges, Water's two rows, `L` → Task 4. `GINSP` rename → Task 1 Step 5. UI
profiles — the four gated surfaces, derivation from `instruments`, the
always-liftable ⋯, digits that keep their meaning, `check_pack.py`
validation → Tasks 5 and 6. No wire-format change → nothing in any task
touches `RIG`; profiles live in `exercises.js`, which is code. Sixteen test
cases in the spec → Tasks 1–6 carry all sixteen plus the phone case. Docs →
Task 7.

**Placeholders.** None: every step carries the code or the exact command.

**Type consistency.** `FIELDS` entries use `{ mode, id, name, sym, unit, ramp,
def, blurb }` with optional `mid`, and every consumer (`fieldFor`, `rangeFor`,
`LEGEND.sync`, `LEGEND.fit`, the panel `opts`) reads those names. `rangeFor`
returns the live array; `state.range[id]` is assigned that same `[lo, hi]`
shape everywhere. `SIM.fieldStats` returns `{ lo, hi, n }` or `null`, and
`LEGEND.fit` handles both. `TOOLBAR` groups are `{ cap, family, items }` and
all three flattening sites are updated in Task 3 Step 1.
