"use strict";
/**
 * fields.js — what the water is painted with (FIELDS) and what a gauge can record
 *   (GAUGE_QTY), the scene-scaled colour ranges, and the per-gauge
 *   quantity helpers.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by test/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: FIELDS, sceneNow, hmaxScene, pressureRange, momScene, fieldFor, fieldById,
 *          fieldBlurb, GAUGE_QTY, gaugeQty, gaugeFieldOf, setAllGaugeFields,
 *          rangeFor, vmaxFor
 *
 * Reads:   SIM, sim, state, UIMODE
 */
// ==========================================================================
//  The fields the water can be painted with.
// ==========================================================================
/** The colourings, as data.
 *
 *  A field used to be described in three disconnected places — a `u_mode`
 *  integer in the GLSL, an `opts` pair in the panel spec, and prose in an
 *  `info` string — so giving one a unit was three edits and a chance to
 *  disagree with itself. `mode` is the shader's own integer and stays the
 *  value a rig link already carries; the ORDER here is the order the picker
 *  lists them, which is the order a session wants them: what the water is
 *  doing, then the two heads, then the numbers derived from them.
 *
 *  `def()` is the range the ramp is painted over, in the field's own units.
 *  `mid`, where a field has one, is the value that must land on the pale band
 *  of a diverging ramp however lopsided the two ends are — Fr = 1 and ω = 0
 *  are physics, not the midpoint of whatever range happens to be set.
 *
 *  `mean` is what the field becomes under Average, and it belongs here for the
 *  same reason everything else does. The accumulator stores only (f̄, û, ŵ, p̄),
 *  so H, Fr, |u| and ρu|u| come out as fields OF the mean flow rather than
 *  means of the field, and the gap between the two is a real fluctuation term
 *  (docs/averaging.md §6). A reader who is not told reads H̃ as a time-averaged
 *  energy head, which it is not. */
const FIELDS = [
  { mode: 0, id: "water", name: "Water", sym: "", unit: "m",
    ramp: "water", def: () => [0, hmaxScene()],
    mean: "The pressure is a true average; the brightness on top is the speed OF the mean flow.",
    blurb: "Depth below the local free surface as hue, with speed added on top as brightness. Two variables at once — read the legend's two rows, not the colour alone." },
  { mode: 2, id: "speed", name: "Speed", sym: "|u|", unit: "m/s",
    ramp: "turbo", def: () => [0, sceneNow().vmax || 4],
    mean: "The speed OF the mean flow — never more than the averaged speed.",
    blurb: "The magnitude of the velocity, √(u² + w²) — the direction is not in it. Particles and dye are what show where the water is going." },
  // The three heads, in the order they nest: H contains h contains p/ρg. Read
  // down the list and each one is the previous with a term taken off.
  { mode: 7, id: "ehead", name: "Energy head", sym: "H", unit: "m",
    ramp: "turbo", def: () => [0, sim ? sim.H : 1],
    mean: "The energy head OF the mean flow — the kinetic energy of the fluctuations is not in it, and the difference is real, not rounding.",
    blurb: "H = z + p/ρg + |u|²/2g — the whole head a cell carries. It can only fall downstream, so a drop along a reach IS the loss — friction, a jump's roller, a diffuser's separation. Point values, so α is 1 by construction; the depth-averaged α belongs to a profile, not a cell." },
  { mode: 6, id: "head", name: "Piezometric head", sym: "h", unit: "m",
    ramp: "turbo", def: () => [0, sim ? sim.H : 1],
    mean: "Exact: h is linear in pressure, so the head of the mean flow IS the averaged head.",
    blurb: "h = z + p/ρg — the potential whose gradient drives the flow. Its bands stand vertical wherever the flow is hydrostatic and bend exactly where vertical accelerations matter — crests, brinks, a chute toe, a gate contraction, a jump roller." },
  { mode: 1, id: "phead", name: "Pressure head", sym: "p/ρg", unit: "m",
    ramp: "turbo", def: () => [0, sceneNow().headMax || 3],
    mean: "A true average of the pressure.",
    blurb: "The pressure alone. In still water it is simply the depth below the surface, so it climbs down every column and is not comparable between cells at different heights." },
  // The pressure itself, p = ρP in kPa (the solver carries the kinematic
  // P = p/ρ). Unlike the heads it does not divide by g, so it means the same
  // thing in a plan view (gravity ≈ 0), where a head is p/0.001. Next to
  // Pressure head because it is the same picture times ρg wherever g is real.
  { mode: 8, id: "p", name: "Pressure", sym: "p", unit: "kPa",
    ramp: "turbo", def: () => pressureRange(), floating: true,
    mean: "A true average of the pressure.",
    blurb: "The pressure above atmospheric, in kPa. In still water it grows with depth, p = ρg × depth; in moving water it is highest where the flow is stopped against something and lowest where it is fastest." },
  { mode: 4, id: "vort", name: "Vorticity", sym: "ω", unit: "1/s",
    ramp: "divg", mid: 0, def: () => { const v = sceneNow().vortMax || 40; return [-v, v]; },
    mean: "The spin OF the mean flow — it matches the averaged spin only where the fill holds steady.",
    blurb: "∂w/∂x − ∂u/∂z: the local spin. Shear layers, the roller of a jump and the separation off a step each show as sheets of one sign." },
  { mode: 3, id: "froude", name: "Froude number", sym: "Fr", unit: "",
    ramp: "divg", mid: 1, def: () => [0, 2],
    mean: "Built from the averaged velocity and depth: a Froude number OF the mean flow, not an averaged Froude number.",
    blurb: "Fr = u/√(gd), from the streamwise velocity and the column depth. Pale is critical; blue is subcritical and red supercritical." },
  // Last, and kept: MO-2's task and its README both say "Field → Momentum
  // flux" in so many words, so removing it would break a shipped brief.
  { mode: 5, id: "mom", name: "Momentum flux", sym: "ρu|u|", unit: "kg/m/s²",
    ramp: "divg", mid: 0, def: () => [-momScene(), momScene()],
    mean: "A momentum flux OF the mean flow — the Reynolds stress is not in it.",
    blurb: "Momentum per unit volume, signed by the streamwise direction, so a returning roller or an undertow reads opposite to the flow that drives it." },
];

/** The live scene, or an empty stand-in. The legend is built before the first
 *  scene is loaded — it is what the start screen sits on top of — so every
 *  default here has to survive `state.scene` being null. */
function sceneNow() { return state.scene || {}; }
/** The scene's own maximum for the Water view's depth hue. */
function hmaxScene() { const s = sceneNow(); return s.hmax || (s.g ? 2.0 : 1); }
/** The Pressure field's default range, in kPa. A scene may state its own
 *  (`pRange: [lo, hi]`); otherwise under gravity it is the hydrostatic scale
 *  ρgH over the scene's pressure-head maximum, and in a plan view (|g| < 0.5,
 *  where hydrostatics is absent) the live field's own spread, fitted ONCE when
 *  the range is first asked for and held from then on like any other range.
 *  A plan view's pressure has no hydrostatic zero: a closed or level-fed
 *  domain carries an arbitrary reference (`body` sits near 37 kPa and creeps
 *  ~0.1 kPa a minute) under differences of ±½ρU² (~0.2 kPa there), so no
 *  fixed number would show them. Before there is water to fit, ±½ρ·vmax².
 *  ρ = 1000 kg/m³, so p in kPa is numerically ρ·P/1000. */
function pressureRange() {
  const s = sceneNow();
  if (Array.isArray(s.pRange)) return s.pRange.slice();
  const g = s.g === undefined ? 9.81 : Math.abs(s.g);
  if (g < 0.5) {
    const st = (sim && SIM.fieldStats) ? SIM.fieldStats(8, !!state.avg) : null;
    if (st && isFinite(st.lo) && isFinite(st.hi) && st.hi > st.lo) {
      const pad = 0.1 * (st.hi - st.lo);
      return [+(st.lo - pad).toFixed(3), +(st.hi + pad).toFixed(3)];
    }
    const v = s.vmax || 4, q = 0.5 * v * v;
    return [-q, q];
  }
  return [0, +(g * (s.headMax || 3)).toFixed(1)];
}
/** The momentum-flux scale, as the display pass has always computed it. */
function momScene() { return 1000 * 0.5 * Math.pow(sceneNow().vmax || 4, 2); }   // ρ = 1000: kg/m/s²

/** The registry entry for a shader mode integer. */
function fieldFor(mode) { return FIELDS.find((f) => f.mode === mode) || FIELDS[0]; }
/** The registry entry for a field id, or the first field when the id is unknown. */
function fieldById(id) { return FIELDS.find((f) => f.id === id) || FIELDS[0]; }

/** The field's one-line description, as THIS exercise wants it said. A card
 *  can replace a description that names concepts its lecture has not met
 *  (`ui.fieldText: { froude: "above 1: fast and shallow; …" }`); `⋯ Show
 *  everything` brings the registry's own words back with the rest. */
function fieldBlurb(f) {
  const u = state.ui;
  const t = u && !u.lifted && u.fieldText && u.fieldText[f.id];
  return t || f.blurb;
}

/** What a GAUGE can record — the gauges' own register, kept apart from FIELDS
 *  (what the water is painted with) for the reason GINSP's header gives.
 *  Described once, like FIELDS: the sampler writes every one of these keys on
 *  every sample, the corner card, the inspector, the panel's "Gauges plot"
 *  select and the CSV all read this list, and `ui.gaugeFields` narrows what is
 *  OFFERED by id — never what is recorded.
 *
 *  A row here is a **gauge quantity**. `g.field`, `state.gaugeField`,
 *  `ui.gaugeFields` and the `gaugeField` control id keep the word "field":
 *  they are wire and worksheet names, and renaming them would break rigs and
 *  worksheets.
 *
 *  `id` is the sample key and the wire key (rig `ui.field`, `viewParams
 *  .gaugeField`, `ui.gaugeFields`): ASCII, notation-register symbols
 *  (docs/notation.md) — `eta` for η and `speed` for |u|, as before; `phead`
 *  is p/ρg, the same name `probe()` uses. `k` converts the STORED value to the
 *  displayed one: pressure is stored in Pa and shown in kPa; the CSV writes
 *  the stored value in `csv` units at full precision. Order is the order a
 *  student meets them in the course (pressure first, heads last). */
const GAUGE_QTY = [
  { id: "p",     sym: "p",    unit: "kPa", csv: "Pa",  k: 1e-3, name: "Pressure p",
    note: "pressure at the gauge, above atmospheric" },
  { id: "phead", sym: "p/ρg", unit: "m",   csv: "m",   k: 1, name: "Pressure head p/ρg",
    note: "the pressure as a height of water" },
  { id: "u",     sym: "u",    unit: "m/s", csv: "mps", k: 1, name: "Velocity u (horizontal)",
    note: "horizontal velocity, + to the right" },
  { id: "w",     sym: "w",    unit: "m/s", csv: "mps", k: 1, name: "Velocity w (vertical)",
    note: "vertical velocity, + upwards" },
  { id: "speed", sym: "|u|",  unit: "m/s", csv: "mps", k: 1, name: "Speed |u|",
    note: "speed at the gauge cell" },
  { id: "eta",   sym: "η",    unit: "m",   csv: "m",   k: 1, name: "Level η",
    note: "water level, η = z_b + d" },
  { id: "d",     sym: "d",    unit: "m",   csv: "m",   k: 1, name: "Depth d",
    note: "water depth of the column" },
  { id: "h",     sym: "h",    unit: "m",   csv: "m",   k: 1, name: "Piezometric head h",
    note: "piezometric head, h = z + p/ρg" },
  { id: "H",     sym: "H",    unit: "m",   csv: "m",   k: 1, name: "Total head H",
    note: "total head, H = z + p/ρg + |u|²/2g" },
];
function gaugeQty(id) { return GAUGE_QTY.find((q) => q.id === id) || null; }
/** The quantity a gauge plots: its own choice, else the session default
 *  (`state.gaugeField`), moved to the first one offered when the profile does
 *  not offer it. Rig scripts push bare `{x, z}` gauges, so `field` is optional. */
function gaugeFieldOf(g) {
  const offer = UIMODE.gaugeFields();
  const want = (g && g.field) || state.gaugeField;
  if (offer.some((q) => q.id === want)) return want;
  return offer.length ? offer[0].id : "h";
}
/** Set what EVERY gauge plots, and the default for the next one — what the
 *  old global "Gauges plot" select meant, which old rigs and printed
 *  worksheets ("set Gauges plot to Depth") still rely on. */
function setAllGaugeFields(id) {
  if (!gaugeQty(id)) return;
  state.gaugeField = id;
  state.gauges.forEach((g) => { g.field = id; });
}

/** The live colour range for a field, in its own units. Seeded from the
 *  registry default the first time it is asked for, then owned by whatever
 *  Fit or the legend's typed boxes last set. It does NOT track the flow:
 *  colour that drifts while you watch cannot be compared between two frames,
 *  let alone between two students' screenshots, which is the whole reason for
 *  printing a scale at all. */
function rangeFor(id) {
  const f = fieldById(id);
  if (!state.range[id]) state.range[id] = f.def();
  return state.range[id];
}

/** The speed scale — the particle colouring and the Water view's brightness
 *  term, both of which are speed whatever field is up. The FIELD's own range
 *  is `rangeFor`, and the two are deliberately separate. */
function vmaxFor() { return sceneNow().vmax || 4; }

