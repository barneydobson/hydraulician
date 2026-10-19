"use strict";
/**
 * panel.js — the Controls panel: the CONTROLS spec, its builder and sync, the focus
 *   profile, and the panel's open/close.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by test/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: UI, CONTROLS, ctl, buildPanel, syncPanel, focusedSections, applyPanelFocus,
 *          setPanel, togglePanel, refreshNote
 *
 * Reads:   bestTracerX, buildToolbar, clearAllGauges, computeView, CONFIG, EX,
 *          fieldBlurb, fieldFor, FIELDS, GAUGE_QTY, gaugeFieldOf, GINSP,
 *          LEGEND, OVERLAY, PICKER, RIG, seedTracers, setAllGaugeFields,
 *          setAverage, showToast, sim, SIM, state, syncToolbar, UIMODE, VEX_MAX
 */
// ------------------------------------------------------------------- batch
/** One user action often reaches syncPanel and buildToolbar from several
 *  places (a scene switch, a rig, a UI profile, the card). `UI.batch(fn)`
 *  runs fn with both held back and then calls each ONCE, in the order the old
 *  code ended in (strip, then panel) — and still does if fn throws. Batches
 *  nest: only the outermost flushes. `UI.hold()` is the same for work that
 *  finishes later (a rig decoding): it returns the function that releases it.
 *  `UI.count` is how many times each really ran, for the tests. */
const UI = (() => {
  let depth = 0, panel = false, bar = false;
  const count = { panel: 0, bar: 0 };
  /** Called first by syncPanel / buildToolbar: true means "held, I will run
   *  at the flush". */
  function defer(what) {
    if (!depth) return false;
    if (what === "panel") panel = true; else bar = true;
    return true;
  }
  function flush() {
    const b = bar, p = panel;
    bar = panel = false;
    if (b) buildToolbar();
    if (p) syncPanel();
  }
  function hold() {
    depth++;
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      if (--depth === 0) flush();
    };
  }
  function batch(fn) {
    const release = hold();
    try { return fn(); } finally { release(); }
  }
  return { batch, hold, defer, count };
})();

// ------------------------------------------------------------------- panel
const CONTROLS = [
  { h: "Scene" },
  { id: "scene", type: "buttons", label: "Scene",
    // A "buttons" row rebuilds itself on every sync, which is exactly what a
    // label showing the live scene name needs.
    sync: (el) => {
      el.textContent = "";
      const b = document.createElement("button");
      b.textContent = (state.scene ? state.scene.name : "—") + "  ▾";
      b.title = "Choose a scene";
      b.onclick = () => { b.blur(); PICKER.toggle(b); };
      el.appendChild(b);
    },
    fmt: () => state.scene
      ? "?scene=" + state.scene.id + "  ·  " + state.scene.key
      : "",
    info: "Every scene in the set, with a line on what it shows. The title box in the corner opens the same menu, as does <b>S</b>. Loading one is exactly a fresh <code>?scene=</code> boot: fresh grid, scene defaults, gauges cleared, spin-up from t = 0 — so anything you have drawn goes, and the menu says so before it does. Your resolution and the tool in your hand are kept." },

  { id: "exercise", type: "buttons", label: "Exercise",
    // Like the Scene row above: rebuilt on every sync, so the button always
    // names whatever is loaded.
    sync: (el) => {
      el.textContent = "";
      const b = document.createElement("button");
      const c = EX.current;
      b.textContent = (c ? c.id + " · " + c.title : "Pick an exercise") + "  ▾";
      b.title = "Set up one of the teaching demos";
      b.onclick = () => { b.blur(); EX.toggle(b); };
      el.appendChild(b);
      if (c) {
        const k = document.createElement("button");
        k.textContent = "card";
        k.title = "Show the exercise card again";
        k.onclick = () => { k.blur(); EX.card.show(); };
        el.appendChild(k);
      }
    },
    fmt: () => EX.statusLine(),
    info: "The verified teaching demos, one folder per course in <code>courses/</code>. Picking one gives everybody the same STARTING POINT — its scene, Resolution Medium, its drawn rig if the rig pack is in this build, and only the settings a README documents as load-bearing — then opens a small card: what you are looking at, what to do, and where the gauges go. The card prints the RULE for your own parameter (d is your student number's last digit — your lecturer explains it); working it out and setting it is yours, because the picker never moves a slider or drops a gauge. Everything that was applied is itemised on the card under \"already set\", and the full brief is one link away. <b>E</b> opens the same menu, and <code>?ex=&lt;id&gt;</code> boots straight into one." },

  { h: "Flow" },
  { id: "speed", label: "Speed", min: 0.02, max: 10, step: 0.01, log: true,
    get: () => state.speed, set: (v) => state.speed = v,
    fmt: (v) => "×" + v.toFixed(2) + " real time",
    info: "How much simulated time passes per second of wall clock. Water hammer wants slow motion; backwater curves want fast. The scale is logarithmic — ×1 sits near two-thirds of the travel and the top decade (×3 to ×10) is for skipping waits, machine permitting: the note under the slider prints asked against achieved, and a heavy scene simply tops out at what the frame budget allows." },
  { id: "inflowOn", place: "res", type: "check", label: "Upstream reservoir",
    get: () => SIM.isOn(sim.p.inflow.on),
    set: (v) => {
      sim.p.inflow.on = v ? 1 : 0;
      if (v) {           // make the control self-evident: open its edge, pick sane defaults
        if (sim.p.open[0] < 1) { sim.p.open[0] = 1; sim.p.autoL = 1; SIM.rasterise(); }
        if (sim.p.inflow.level <= 0.01) sim.p.inflow.level = 0.55 * sim.H;
        if (!(sim.p.inflow.q > 0) && !SIM.isOn(sim.p.inflow.free) && sim.p.inflow.v === undefined) {
          sim.p.inflow.q = 0.25;
        }
      } else if (sim.p.autoL) {
        // An edge this toggle opened, it closes again. Leaving it open is a
        // silent leak — a tank filled from the reservoir and then switched to
        // a drain test quietly bleeds out of the boundary it forgot about.
        sim.p.autoL = 0; sim.p.open[0] = 0; SIM.rasterise();
      }
    },
    info: "Holds a reservoir on the LEFT edge and feeds the set discharge through it. The level is the reservoir's ENERGY line, so the water surface at the inlet sits a velocity head below it and draws down further as q rises. Ticking it opens the left edge automatically (and closes it again when unticked, unless you set that edge yourself); the ∇ marker shows the level." },
  { id: "inLevel", place: "res", label: "Reservoir level", min: 0, max: 1, step: 0.005, rel: "H",
    get: () => sim.p.inflow.level,
    // A scene that knows what its reservoir delivers to its own channel
    // (gauging: the M2 to its brink) writes that discharge into Inflow q, so
    // the level is the one knob. A rig carries both values, and setting q by
    // hand afterwards still holds until the level moves again.
    set: (v) => {
      sim.p.inflow.level = v;
      if (sim.scene.qOfLevel && !SIM.isOn(sim.p.inflow.free)) sim.p.inflow.q = sim.scene.qOfLevel(v);
    },
    fmt: (v) => {
      const b = SIM.bands(), D = state.deliv, st = SIM.inletStage();
      const d = Math.min(v, b.inB[1]) - b.inB[0];
      if (!(d > 0)) return v.toFixed(2) + " m above datum  ·  below the inlet bed!";
      // The level is the ENERGY line; the surface sits a velocity head under
      // it, and how far under is the number worth printing.
      const surf = st.stage - b.inB[0];
      const drawdown = d - surf;
      return v.toFixed(2) + " m above datum  ·  " + surf.toFixed(2) + " m deep at the inlet" +
        (drawdown > 0.005 ? "  (drawn down " + (drawdown * 1000).toFixed(0) + " mm)" : "") +
        (st.choked ? "  ·  OVER-DRAWN: cannot pass this q" : "") +
        (D ? "  ·  delivering " + D.level.toFixed(2) + " m" : "");
    },
    info: "The reservoir's ENERGY grade line, measured from the domain floor (the datum), NOT from the bed. The water in a reservoir is at rest, so its surface IS the total head, and what arrives in the channel is the depth that solves E = d + q²/2gd² — which falls as q rises. The velocity head between the two is printed as the drawdown. Raising q far enough exhausts the reservoir: past q_max = √(g(2E/3)³) there is no depth that satisfies the equation at all, and the inlet is held at critical depth and says so. The DELIVERED level is measured just clear of the relaxation sponge and sits below that by however much head the sponge is giving up." },
  { id: "inQ", place: "res", label: "Inflow q", min: 0, max: 2.0, step: 0.005,
    get: () => sim.p.inflow.q, set: (v) => sim.p.inflow.q = v,
    fmt: (v) => {
      // Under head-driven inflow the slider is not the discharge — nothing
      // writes it back from the solver — so print what the inlet is actually
      // delivering instead, and take d_c from that.
      const D = state.deliv;
      if (SIM.isOn(sim.p.inflow.free)) {
        return "head-driven  ·  q → " + (D ? D.q.toFixed(3) : "—") + " m²/s delivered" +
               (D ? "   d_c = " + Math.pow(D.q * D.q / SIM.gMag(), 1 / 3).toFixed(3) + " m" : "");
      }
      const st = SIM.inletStage();
      return v.toFixed(3) + " m²/s per m width  →  " + SIM.inletVel().toFixed(2) + " m/s" +
             "   d_c = " + Math.pow(v * v / SIM.gMag(), 1 / 3).toFixed(3) + " m" +
             (st.choked ? "  ·  MORE THAN THE RESERVOIR CAN PASS (q_max = "
                          + st.qmax.toFixed(3) + " m²/s) — held at critical" : "");
    },
    info: "Unit discharge entering the domain, converted to an inlet velocity using the depth the reservoir DELIVERS at that discharge. Critical depth d_c = (q²/g)^⅓ follows directly from it. A reservoir has a ceiling: q_max = √(g(2E/3)³) on the head E it stands above the inlet bed, and asking for more than that is asking for energy the reservoir does not have — the note says so and the inlet holds critical depth, which is what a real crest does. Raise the reservoir level to pass more. Under head-driven inflow this slider is inert and the note prints the measured delivered discharge instead." },
  { id: "inFree", place: "res", type: "check", label: "Head-driven inflow",
    get: () => SIM.isOn(sim.p.inflow.free || 0), set: (v) => sim.p.inflow.free = v ? 1 : 0,
    info: "Pins only the reservoir level and lets the head difference drive the discharge — how the water-hammer and venturi scenes feed themselves. Off = the inflow q is prescribed directly." },
  { id: "twOn", place: "tw", type: "check", label: "Tailwater control",
    get: () => SIM.isOn(sim.p.tailwater.on),
    set: (v) => {
      sim.p.tailwater.on = v ? 1 : 0;
      if (v) {
        if (sim.p.open[1] < 1) { sim.p.open[1] = 1; sim.p.autoR = 1; SIM.rasterise(); }
        if (sim.p.tailwater.level <= 0.01) sim.p.tailwater.level = 0.3 * sim.H;
      } else if (sim.p.autoR) {
        sim.p.autoR = 0; sim.p.open[1] = 0; SIM.rasterise();
      }
    },
    info: "Holds a fixed level on the RIGHT edge — the downstream control that decides M1 vs M2. Ticking it opens the right edge automatically (and closes it again when unticked, unless you set that edge yourself); the ∇ marker shows the level." },
  { id: "twLevel", place: "tw", label: "Tailwater level", min: 0, max: 1, step: 0.005, rel: "H",
    get: () => sim.p.tailwater.level, set: (v) => sim.p.tailwater.level = v,
    fmt: (v) => {
      const b = SIM.bands();
      const d = Math.min(v, b.twB[1]) - b.twB[0];
      return v.toFixed(2) + " m above datum" + (d > 0 ? "  ·  " + d.toFixed(2) + " m deep at the outlet" : "  ·  below the outlet bed!");
    },
    info: "Held level on the right boundary, measured from the domain floor (the datum), NOT from the local bed." },
  { id: "spoutOn", place: "spout", type: "check", label: "Top-left spout",
    get: () => SIM.isOn(sim.p.source.on), set: (v) => sim.p.source.on = v ? 1 : 0,
    info: "The free-falling inflow in the top-left corner." },
  { id: "spoutR", place: "spout", label: "Spout size", min: 0.02, max: 0.4, step: 0.005,
    get: () => sim.p.source.r, set: (v) => sim.p.source.r = v,
    fmt: (v) => (2 * v).toFixed(2) + " m wide" },
  { id: "spoutVx", place: "spout", label: "Spout velocity →", min: -5, max: 5, step: 0.05,
    get: () => sim.p.source.vx, set: (v) => sim.p.source.vx = v,
    fmt: (v) => v.toFixed(2) + " m/s",
    info: "Horizontal velocity of the water leaving the spout. Use the Spout tool (4) to drag the spout anywhere." },
  { id: "spoutVy", place: "spout", label: "Spout velocity ↑", min: -6, max: 3, step: 0.05,
    get: () => sim.p.source.vz, set: (v) => sim.p.source.vz = v,
    fmt: (v) => v.toFixed(2) + " m/s" },

  { h: "Geometry" },
  // Six rows: the hydro scene declares six params (knee x/z, three bores,
  // the nozzle gap). A scene declaring fewer hides the rest (syncPanel).
  ...[0, 1, 2, 3, 4, 5].map((k) => ({
    id: "geom" + k, label: "—",
    min: 0, max: 1, step: 0.01,
    // The row binds to the k-th declared param of whatever scene is up.
    par: () => (SIM.params().decl || [])[k],
    get: function () { const d = this.par(); return d ? SIM.params().values[d.key] : 0; },
    set: function (v) { const d = this.par(); if (d) SIM.setParam(d.key, v); },
    fmt: function (v) {
      const d = this.par();
      if (!d) return "";
      return d.fmt ? d.fmt(v) : v.toFixed(3) + (d.unit ? " " + d.unit : "");
    },
    info: "A dimension of the scene's own geometry. Moving it redraws the solid and re-rasterises the grid — and resets any averaging window, because the walls the mean was accumulated through are no longer the walls on screen.",
  })),

  { h: "Boundaries" },
  ...[["openL", 0, "Left edge", "carries the reservoir control when it is on"],
      ["openR", 1, "Right edge", "carries the tailwater control when it is on"],
      ["openB", 2, "Bottom edge", "an outfall bottom is a free overfall for anything that reaches it"],
      ["openT", 3, "Top edge", "rarely needs opening"]].map(([id, k, label, extra]) => ({
    id, place: id, type: "select", label,
    opts: [["0", "Wall"], ["1", "Open"], ["2", "Outfall"]],
    get: () => String(sim.p.open[k]),
    // Setting an edge by hand hands it back to you: the level control that
    // opened it no longer owns it and will not close it behind itself.
    set: (v) => { sim.p.open[k] = +v; if (k < 2) sim.p[k ? "autoR" : "autoL"] = 0; SIM.rasterise(); },
    info: "Wall reflects. Open is zero-gradient: through-flow passes, but a still pond will sit against it. Outfall holds the outside empty, so water reaching the edge pours over it like a brink. This edge " + extra + ".",
  })),

  { h: "Hydraulics" },
  { id: "cel", label: "Slot celerity c", min: 8, max: 400, step: 1, log: true,
    get: () => sim.p.c,
    // A column carries its hydrostatic load as compression, f − 1 = gd/c², so
    // lowering c needs MORE slot storage and draws it from the water present:
    // dragging 25 → 8 dropped a settled 4.5 m column by 861 mm. Rescaling f to
    // hold P = c²(f−1) fixed makes the slider change the celerity and nothing
    // else — the geometric volume min(f,1) is untouched.
    set: (v) => { const o = sim.p.c; if (v !== o && v > 0) SIM.rescaleFill((o * o) / (v * v)); sim.p.c = v; },
    fmt: (v) => v.toFixed(0) + " m/s   (Δh from Δv: " + (v / SIM.gMag()).toFixed(1)
      + " m per m/s · ≤" + (100 * SIM.gMag() * sim.H / (v * v)).toFixed(0) + "% compression)",
    info: "The Preissmann-slot stiffness. Pressure waves travel at this speed, so it sets the water-hammer surge ΔH = cΔv/g. Lower c = bigger time step = faster run, but the water is held up by compression f − 1 = gd/c², so it also makes the fluid squashier — keep c well above √(gd)." },
  { id: "cf", label: "Bed roughness C_f", min: 0, max: 0.25, step: 0.002,
    get: () => sim.p.cf, set: (v) => sim.p.cf = v,
    fmt: (v) => v.toFixed(3) + (v === 0 ? "   frictionless" : ""),
    info: "Wall-function drag in the cells touching a solid — the bed's roughness, and in an open channel the whole of its resistance: the mixing length carries the bed's drag up the column, and the free surface carries none. Controls normal depth, and therefore whether a slope is mild or steep. At Medium resolution 0.02 delivers a Manning n of about 0.024 and 0.25 about 0.031. Hover the channel to read the n it is actually delivering." },
  { id: "cs", label: "Eddy viscosity C_s", min: 0, max: 0.4, step: 0.005,
    get: () => sim.p.cs, set: (v) => sim.p.cs = v,
    fmt: (v) => v === 0 ? "laminar" : "Smagorinsky " + v.toFixed(2),
    info: "Subgrid mixing at the cell scale (Smagorinsky). In open-channel water the depth-scale mixing length does the work — it is what makes the velocity profile a log law, fastest at the surface — so this matters for jets, pipes and the plan view, and hardly at all in a channel." },
  { id: "bulk", label: "Wave damping", min: 0, max: 0.5, step: 0.005,
    get: () => sim.p.bulk, set: (v) => sim.p.bulk = v,
    fmt: (v) => v === 0 ? "none — surges ring forever" : v.toFixed(3),
    info: "Artificial bulk viscosity. Attenuates pressure waves; set it to zero to see an undamped water-hammer oscillation." },
  { id: "slip", type: "check", label: "Free-slip walls",
    get: () => SIM.isOn(sim.p.slip), set: (v) => sim.p.slip = v ? 1 : 0,
    info: "Off = no-slip, which is what builds a boundary layer and a real velocity profile." },
  { id: "ca", label: "Interface sharpening", min: 0, max: 1.5, step: 0.05,
    get: () => sim.p.ca, set: (v) => sim.p.ca = v,
    fmt: (v) => v === 0 ? "off — the surface smears" : "cα " + v.toFixed(2),
    info: "The interFoam-style compression flux that keeps the free surface a couple of cells thick. Too high and thin jets bead up." },
  { id: "grav", type: "check", label: "Plan view (gravity off)",
    get: () => SIM.planView(), set: (v) => sim.p.g = v ? 0 : (state.scene.g || SIM.gMag()),
    info: "Switches between the vertical profile and looking down on a horizontal plane." },

  { h: "Wavemaker" },
  { id: "waveOn", place: "piston", type: "check", label: "Piston on",
    get: () => SIM.isOn(sim.p.wave.on), set: (v) => sim.p.wave.on = v ? 1 : 0,
    info: "An oscillating column of prescribed velocity — the wave flume's paddle. Works in any scene with standing water." },
  { id: "waveA", place: "piston", label: "Amplitude", min: 0.005, max: 0.3, step: 0.005,
    get: () => sim.p.wave.amp, set: (v) => sim.p.wave.amp = v,
    fmt: (v) => v.toFixed(3) + " m stroke" },
  { id: "waveT", place: "piston", label: "Period", min: 0.4, max: 6, step: 0.05,
    get: () => sim.p.wave.period, set: (v) => sim.p.wave.period = v,
    fmt: (v) => v.toFixed(2) + " s" },
  { id: "waveX", place: "piston", label: "Piston position", min: 0, max: 1, step: 0.01, rel: "W",
    get: () => sim.p.wave.x, set: (v) => sim.p.wave.x = v,
    fmt: (v) => v.toFixed(2) + " m from the left" },
  // The flap and the train are the two opt-in halves of SIM.paddle; neither
  // is in the rig wire format (v2), so a saved rig carries the scene's own.
  { id: "waveFlap", place: "piston", type: "check", label: "Hinged flap",
    get: () => SIM.isOn(sim.p.wave.flap), set: (v) => sim.p.wave.flap = v ? 1 : 0,
    info: "A paddle hinged at the bed instead of a piston: it moves the water most at the surface and not at all at the hinge, which is how a deep-water wave moves. Needs a scene that declares its still depth (the wall paddles)." },
  { id: "waveN", place: "piston", label: "Wave train", min: 0, max: 20, step: 1,
    get: () => sim.p.wave.train || 0, set: (v) => { sim.p.wave.train = Math.round(v); sim.p.wave.t0 = undefined; },
    fmt: (v) => (v < 0.5 ? "off — the paddle runs continuously"
                          : Math.round(v) + " periods per train · press V or the strip's Wave train"),
    info: "A train of waves instead of an endless wave: the paddle ramps up over a period and a half, holds, ramps down and stops. Fire one with the strip's Wave train button or V." },

  { h: "Orbit tracers" },
  { id: "tracerOn", type: "check", label: "Show orbit tracers",
    get: () => !!state.tracers,
    set: (v) => { if (v) seedTracers(state.tracers ? state.tracers.x : bestTracerX());
                  else state.tracers = null; },
    info: "A column of massless tracers that remember where they have been. The PATH is the point — a bare dot going round a 30 mm circle is invisible. Pick the <b>Tracers</b> tool (7) and click anywhere in the water to move the column; click dry ground to clear it." },
  { id: "tracerX", label: "Column position", min: 0, max: 1, step: 0.005, rel: "W",
    get: () => (state.tracers ? state.tracers.x : bestTracerX()),
    set: (v) => seedTracers(v),
    fmt: (v) => v.toFixed(2) + " m from the left" },
  { id: "tracerN", label: "Tracers in the column", min: 3, max: 24, step: 1,
    get: () => state.tracerN,
    set: (v) => { state.tracerN = Math.round(v); if (state.tracers) seedTracers(state.tracers.x); },
    fmt: (v) => Math.round(v) + " from bed to surface" },
  { id: "tracerTrail", label: "Trail length", min: 0.5, max: 20, step: 0.1,
    get: () => (state.tracers ? state.tracers.trail : 3),
    set: (v) => { if (state.tracers) state.tracers.trail = v; },
    fmt: (v) => v.toFixed(1) + " s of history",
    info: "How much history each tracer keeps. About two or three wave periods shows the loops clearly; much longer and the mean drift smears them into streaks." },

  { h: "View" },
  { id: "vex", label: "Vertical exaggeration", min: 1, max: VEX_MAX, step: 0.1,
    get: () => state.vex, set: (v) => { state.vex = v; state.vexAuto = false; computeView(); },
    fmt: (v) => (v < 1.05 ? "true scale (1 : 1)" : "× " + v.toFixed(1) + " vertical") +
                (state.vexAuto ? "  ·  fitted to the window" : ""),
    info: "Stretches the view vertically. A 12 m × 1.5 m flume is a thin strip at true scale, so a 0.1 m wave is a few pixels — every long-section in hydraulics is drawn exaggerated for the same reason. You can also drag the empty band above or below the domain." },
  // Built from FIELDS, so the menu cannot fall behind the registry, and the
  // note under it is the field's own one-line explanation.
  { id: "mode", type: "select", label: "Field",
    opts: FIELDS.map((f) => [String(f.mode), f.name]),
    get: () => String(state.mode),
    set: (v) => { state.mode = +v; LEGEND.sync(); },
    fmt: () => fieldBlurb(fieldFor(state.mode)) },
  // The same toggle as the strip's A. The sandbox must be able to reproduce
  // any scene by hand, so every strip toggle needs a panel row as well.
  { id: "avg", type: "check", label: "Average the flow",
    get: () => state.avg, set: (v) => setAverage(v),
    fmt: () => state.avg
      ? "window " + SIM.avgT().toFixed(2) + " s — the legend carries T, f̄ and δ_a"
      : "off — the field and the overlay show the instant",
    info: "Time-averages the flow while the solver goes on running: the colour, the free-surface line, the channel overlay and every number it prints come from one averaging window. The velocity is the Favre (fill-weighted) mean, so H, Fr, |u| and ρu|u| are fields <b>of the mean flow</b> rather than means of the field — the legend says so per field. Nothing here touches the solution; the accumulators are diagnostics. The window restarts on R, a geometry edit, a valve, a celerity change, a boundary switch and the end of spin-up." },
  { id: "ruler", type: "check", label: "Ruler",
    get: () => state.ruler, set: (v) => state.ruler = v,
    info: "Metre ticks along the bottom and left edges of the view, with faint grid lines at the major ticks. They follow the zoom, so drawn geometry can be placed at a stated station — \"the plate goes at x = 8.0 m\" — without counting scale bars. M toggles it." },
  { id: "measure", type: "buttons", label: "Measure",
    // The same tool as the bar's Measure button (and the 8 key); this row is
    // where the last measurement stays readable as text.
    sync: (el) => {
      el.textContent = "";
      const b = document.createElement("button");
      b.textContent = state.tool === "measure" ? "✓ measuring — left-drag" : "✐ Measure with left-drag";
      b.title = "Pick the Measure tool: left-drag between two points (Shift snaps), click to clear";
      b.onclick = () => { b.blur(); state.tool = "measure"; syncToolbar(); syncPanel(); };
      el.appendChild(b);
    },
    fmt: () => state.measure ? OVERLAY.measureText(state.measure)
                             : "then left-drag between two points on the water",
    info: "A tape measure: left-drag between two points for the straight-line length, the horizontal and vertical legs, and the slope written as 1 : n. Shift snaps to horizontal / vertical / 45°; a click without a drag clears it. The 8 key picks the tool from the keyboard, and the numbers stay printed here." },
  { id: "cvShow", type: "buttons", label: "Control volume reads",
    // The box reports a whole control-volume budget now, which is four edges
    // times three quantities. One quantity at a time on the edges, chosen
    // here or with B — the panel has to be able to reach it, because the
    // sandbox must reproduce any scene by hand.
    sync: (el) => {
      el.textContent = "";
      [["Q", "Q", "volume flow rate through each face, m²/s"],
       ["M", "M→", "momentum flux plus pressure force on each face, N/m"],
       ["E", "Ė", "energy flow rate through each face, W/m"]].forEach(([id, txt, why]) => {
        if (id === "E" && UIMODE.hides("energy")) return;     // ui.hide "energy"
        const b = document.createElement("button");
        b.textContent = txt; b.title = why;
        b.className = state.cvShow === id ? "on" : "";
        b.onclick = () => { b.blur(); state.cvShow = id; syncPanel(); };
        el.appendChild(b);
      });
    },
    fmt: () => !state.cv ? "left-drag a box on the water with the Control volume tool (9)"
      : !state.cv.flux ? "settling…"
      : "Σ Q " + state.cv.flux.total.Q.toFixed(4) + " m²/s" +
        (UIMODE.hides("energy") ? "" : "  ·  Σ Ė " + state.cv.flux.total.E.toFixed(1) + " W/m"),
    info: "The box is a control volume, and every face of it carries a budget: the volume crossing it, the momentum it carries plus the pressure on it, and the energy going with them. Air contributes nothing — every term is weighted by the fill fraction, so an empty cell adds zero and a half-full one adds half. Read outward-positive: what leaves is positive wherever it leaves from, so Σ Q is continuity and Σ Ė is the loss." },
  { id: "fluxList", type: "buttons", label: "Flux sections",
    sync: (el) => {
      el.textContent = "";
      const x = document.createElement("button");
      x.textContent = "✕ Clear all";
      x.title = "Remove every section — or click one with the Flux line tool to remove just that one";
      x.disabled = !state.flux.length;
      x.onclick = () => { x.blur(); state.flux.length = 0; syncPanel(); };
      el.appendChild(x);
    },
    fmt: () => !state.flux.length
        ? "pick the Flux line tool and left-drag a section across the flow"
      : state.flux.length === 1
        ? "1 section · draw a SECOND one for the balance between them"
        : state.flux.length + " sections · the last two are compared",
    info: "A section reads what crosses it: the volume Q, the momentum flux M, the pressure force F and the energy ρgQH, all four at once and all normal to the line. M and F are kept apart because telling them apart is what a control-volume question asks. <b>Two sections are the point</b> — between them you get continuity, the energy lost, and the force on whatever lies in between, which is the momentum theorem without drawing a box. Drawn bottom-to-top puts the positive side downstream." },
  { id: "forceSize", label: "Pressure diagram size", min: 0.25, max: 3, step: 0.05,
    get: () => state.forceSize, set: (v) => state.forceSize = v,
    fmt: (v) => "×" + v.toFixed(2) + (v === 1 ? " — the largest head on any wall is 56 px" : ""),
    info: "How long the Pressure force tool draws its arrows. The scale itself is fixed per scene — the largest head standing on any wall, read at the first pick, maps to 56 px — so every face is drawn to the same pixels per metre and a bigger triangle is a bigger force; this only multiplies that length. Shrink it when a submerged face in a narrow passage hangs its diagram into the opposite wall's; enlarge it for a shallow face on a big window. An exercise sets it through viewParams." },
  { id: "channel", type: "check", label: "Open-channel overlay",
    get: () => state.channel, set: (v) => state.channel = v,
    info: "Critical depth d_c, normal depth d_n and the energy grade line, computed per column from the live depth and unit discharge." },
  { id: "grade", type: "check", label: "Grade lines (EGL / HGL)",
    get: () => state.grade, set: (v) => state.grade = v,
    info: "The energy grade line H and the hydraulic grade line h = z + p/ρg, drawn for every wet column whether it has a free surface or not. The gap between them is the velocity head V²/2g, to scale. In a free-surface reach the HGL sits on the water surface; in a pressurised conduit there is no surface and the HGL is the only meaningful head — it can run above the crown, which is what B10 is about. Refreshed every third frame; under Average it costs a full-field readback." },
  { id: "labels", type: "check", label: "Profile labels",
    get: () => state.labels, set: (v) => state.labels = v,
    info: "Names each reach by its gradually-varied-flow class. The letter is the bed (Mild, Steep, Critical, Horizontal, Adverse); the number is the zone — 1 above both d_n and d_c, 2 between them, 3 below both." },
  { id: "jumps", type: "check", label: "Jump analysis",
    get: () => state.jumps, set: (v) => state.jumps = v,
    info: "Brackets every hydraulic jump and compares the measured conjugate depth against the momentum prediction d₂/d₁ = ½(√(1+8Fr₁²) − 1)." },
  { id: "instReadouts", type: "check", label: "Instrument readouts",
    get: () => state.instReadouts, set: (v) => state.instReadouts = v,
    info: "The readout boxes the instruments draw on the water: the gauges' corner cards, the Control volume's budget and the numbers on its faces, each flux section's readings and the balance between two, the rakes' q and u_max, and the pressure-force values. Off folds them all away — the instruments stay where they are and keep measuring and recording, so the gauge histories, the inspector and the CSV are complete when they come back. I toggles it." },
  { id: "hoverCard", type: "check", label: "Hover readout",
    get: () => state.hoverCard, set: (v) => state.hoverCard = v,
    info: "The card of numbers that follows the cursor over the water — position, and whatever the exercise lists of depth, level, velocity and pressure there." },
  { id: "particles", type: "check", label: "Particles",
    get: () => state.particles, set: (v) => state.particles = v,
    info: "Massless tracers. The clearest way to see wave orbits and jet spreading." },
  { id: "partTrail", label: "Particle trail", min: 0.2, max: 10, step: 0.1,
    get: () => SIM.particleTrail(), set: (v) => SIM.particleTrail(v),
    fmt: (v) => v.toFixed(1) + " s of flow",
    info: "How much flow each particle's trail records. It starts at a length fitted to the scene — a typical particle draws about a seventh of the view — so slow flow still leaves a visible trace and a fast jet does not become a smear." },
  { id: "dyeSeeds", type: "check", label: "Dye sources",
    get: () => state.dyeSeeds, set: (v) => state.dyeSeeds = v,
    info: "The scene's own FIXED dye sources: short seed lines placed where the flow goes — ahead of the body, at the pipe entrance, in the jet — or, where a scene names none, a line just inside the inflow. Off unless the scene asks (the timeline flumes do). To release dye anywhere else, pick the <b>Dye</b> tool and hold the pointer in the water. Either way it is black ink, carried by the water and diffusing as it goes; it stands down under <b>Average</b>, which has no record of it." },
  { id: "sline", type: "check", label: "Streamlines",
    get: () => state.sline, set: (v) => state.sline = v,
    info: "Contours of the stream function ψ, drawn at equal steps Δψ, so every tube between two neighbouring lines carries the same discharge per unit width — where the lines crowd the water is fast, where they spread it is slow. Walls, the bed and (in steady flow) the free surface are streamlines themselves. Under <b>Average</b> they are the streamlines of the MEAN flow: compare them with the dye and the particles, which follow the unsteady flow, and they agree only where the flow is steady. Refreshed about four times a second; the key at the bottom left quotes Δψ." },
  { id: "slineN", label: "Streamline density", min: 6, max: 60, step: 1,
    get: () => state.slineN, set: (v) => { state.slineN = v; state.slineDpsi = 0; },
    fmt: (v) => "≈ " + v.toFixed(0) + " tubes across the flow",
    info: "Roughly how many equal-discharge tubes the whole range of ψ is cut into. The step is rounded to 1, 2, 2.5 or 5 × 10ⁿ m²/s so it can be quoted, and then held while the flow develops." },
  { id: "dyeLine", label: "Dye timelines", min: 0, max: 4, step: 0.1,
    get: () => sim.p.dyeLine, set: (v) => sim.p.dyeLine = v,
    fmt: (v) => v === 0 ? "off — continuous" : "pulsed every " + v.toFixed(1) + " s",
    info: "Pulses the fixed dye sources (<b>Dye sources</b>): on for half of each period, off for the other half. The front of each band leaves the seed line at one instant, so it is a timeline — it shears as it travels, and in a channel that shape IS the velocity–depth distribution." },
  { id: "dyeDecay", label: "Dye fade", min: 0, max: 0.3, step: 0.005,
    get: () => sim.p.dyeDecay, set: (v) => sim.p.dyeDecay = v,
    fmt: (v) => v === 0 ? "permanent" : (1 / v).toFixed(0) + " s half-life-ish" },
  // Sets what EVERY gauge plots and what the next one starts on; each gauge
  // can then be changed on its own corner card or in its inspector. The
  // options the panel shows follow `ui.gaugeFields` (`optsNow`, re-read by
  // syncPanel); `opts` stays the whole register for the card's own text.
  { id: "gaugeField", type: "select", label: "Gauges plot",
    opts: GAUGE_QTY.map((q) => [q.id, q.name]),
    optsNow: () => UIMODE.gaugeFields().map((q) => [q.id, q.name]),
    get: () => gaugeFieldOf(null), set: (v) => setAllGaugeFields(v),
    info: "What every gauge plots, and what a new gauge starts on. Each gauge can then be switched on its own: the small selector beside its card, or the tabs in its inspector window. Every quantity is recorded all the time whatever is plotted, and the CSV carries all of them." },
  // How much of the run the corner cards plot. "window" (the default) is the
  // scrolling recent window the cards always showed; "all" spans t = 0 → now,
  // compressing the time axis as the run grows, so an approach to steady state
  // (VC-2's level rising from its starting depth, the overshoot after a valve
  // is shut and opened) stays on the chart from its first sample.
  { id: "gaugeSpan", type: "select", label: "Gauge charts",
    opts: [["window", "recent (scrolling)"], ["all", "whole run, from t = 0"]],
    get: () => state.gaugeSpan, set: (v) => { state.gaugeSpan = v === "all" ? "all" : "window"; },
    info: "What each gauge's corner chart spans. Recent: the last few hundred samples, scrolling. Whole run: from t = 0 to now, the time axis compressing as the run grows (thinned for drawing — the inspector and the CSV keep every sample). R restarts it with the clock." },
  { id: "gaugeInspect", type: "buttons", label: "Gauge inspector",
    // One button per live gauge (the same window the ⤢ on a corner card
    // opens), plus a CSV of everything recorded.
    sync: (el) => {
      el.textContent = "";
      state.gauges.forEach((g, k) => {
        const b = document.createElement("button");
        b.textContent = String(k + 1);
        b.title = "Inspect gauge " + (k + 1) + " at x " + g.x.toFixed(2) + " m";
        b.style.borderColor = g.colour;
        b.onclick = () => { b.blur(); GINSP.show(k); };
        el.appendChild(b);
      });
      const c = document.createElement("button");
      c.textContent = "⤓ CSV";
      c.title = "Download every gauge's full recorded history";
      c.disabled = !state.gauges.length;
      c.onclick = () => { c.blur(); GINSP.download(state.gauges, "gauges"); };
      el.appendChild(c);
      // The gesture is to click a gauge with the Gauge tool, which nobody
      // knows until they are told. This is where they are told.
      const x = document.createElement("button");
      x.textContent = "✕ Clear all";
      x.title = "Remove every gauge — or click one with the Gauge tool to remove just that one";
      x.disabled = !state.gauges.length;
      x.onclick = () => { x.blur(); clearAllGauges(); };
      el.appendChild(x);
    },
    fmt: () => state.gauges.length
      ? state.gauges.length + " gauge" + (state.gauges.length > 1 ? "s" : "") +
        " · window per gauge, history freezes when paused"
      : "drop a gauge on the field with the Gauge tool first",
    info: "A draggable window per gauge: its position, its live head / depth / speed, and the whole stored history — wheel to zoom the time axis, drag to pan, double-click to fit, hover to read a value. The corner cards keep showing the recent window only. History is kept for about five minutes of simulated time, freezes while the sim is paused, and is cleared by R (reset water) or loading a scene." },
  { id: "budget", type: "select", label: "Resolution",
    opts: [["Low", "Low"], ["Medium", "Medium"], ["High", "High"],
           ["Very high", "Very high"], ["Ultra", "Ultra"]],
    get: () => state.budget,
    set: (v) => { state.budget = v; sim = SIM.build(state.scene, CONFIG.budgets[v], true); computeView(); } },

  { h: "Rig" },
  { id: "rig", type: "custom", label: "Save / share this rig",
    build: (el) => RIG.buildUI(el),
    sync: () => RIG.syncUI(),
    fmt: () => RIG.statusLine(),
    info: "Everything you have drawn plus the settings that make it work — segments, gauges, rakes, the spout, the piston, the open edges, both level controls and every hydraulics slider — written out as a link or a .json file. Coordinates are in METRES, so a rig re-rasterises at any resolution and letterboxes the same on any screen. The water is NOT stored: loading a rig ends with a reset (the R key), so the scene's own initial water lands on your geometry and any spin-up runs against it. Loading REPLACES what is drawn; the loaded strokes become the undo stack, so Z still works stroke by stroke." },
];

/** The Controls row with this id, or undefined. Ids are unique; the section
 *  headings (`{ h: ... }`) have none, so an undefined id finds a heading. */
function ctl(id) { return CONTROLS.find((x) => x.id === id); }

function buildPanel() {
  const p = document.getElementById("panel");
  // The way out of a focused panel, at its head where a reader meets it first.
  const head = document.createElement("div");
  head.className = "panelfocus";
  const sw = document.createElement("button");
  sw.type = "button"; sw.id = "panelAll";
  sw.onclick = () => { sw.blur(); UIMODE.lift(); };
  head.appendChild(sw);
  p.appendChild(head);
  // Every row remembers the section it is under, so a level can hide sections
  // without the panel being rebuilt — and without the rows themselves knowing
  // anything about exercises.
  let section = "";
  CONTROLS.forEach((c) => {
    if (c.h) {
      section = c.h;
      const el = document.createElement("h3");
      el.textContent = c.h; el.dataset.sec = section;
      p.appendChild(el); return;
    }
    // A custom row is a DIV, not a LABEL: a <label> forwards stray clicks to
    // its first labelable child, which would fire the file picker.
    const row = document.createElement(c.type === "custom" ? "div" : "label");
    row.className = c.type === "custom" ? "row stack" : "row";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = c.label;
    row.appendChild(lbl);
    const touched = () => {
      if (c.place) { state.flashKey = c.place; state.flashT = performance.now(); }
    };
    let input;
    if (c.type === "check") {
      input = document.createElement("input"); input.type = "checkbox";
      input.onchange = () => { c.set(input.checked); touched(); syncPanel(); };
    } else if (c.type === "buttons") {
      // A row of little buttons the control fills in itself on every sync —
      // the set depends on live state (how many gauges exist), not on a value.
      input = document.createElement("span"); input.className = "btnrow";
    } else if (c.type === "custom") {
      // The control owns its own markup entirely (see RIG.buildUI).
      input = document.createElement("div"); input.className = "rigui";
    } else if (c.type === "select") {
      input = document.createElement("select");
      c.opts.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; input.appendChild(o); });
      input.onchange = () => { c.set(input.value); touched(); syncPanel(); };
    } else {
      input = document.createElement("input"); input.type = "range";
      input.min = c.log ? 0 : c.min; input.max = c.log ? 1000 : c.max;
      input.step = c.log ? 1 : c.step;
      input.oninput = () => {
        let v;
        if (c.log) v = c.min * Math.pow(c.max / c.min, +input.value / 1000);
        else v = +input.value;
        c.set(v); touched(); syncPanel();
      };
    }
    input.id = "c_" + c.id;
    let infoEl = null;
    if (c.info) {
      infoEl = document.createElement("span"); infoEl.className = "info"; infoEl.textContent = "ⓘ";
      infoEl.onclick = (e) => { e.preventDefault(); showToast(c.label, c.info, { html: true, sticky: true }); };
    }
    // A stacked row wraps its block onto the next line, so the ⓘ has to be
    // placed BEFORE it or it ends up stranded on a third line of its own.
    if (infoEl && c.type === "custom") row.appendChild(infoEl);
    row.appendChild(input);
    if (infoEl && c.type !== "custom") row.appendChild(infoEl);
    if (c.type === "custom") c.build(input);
    row.dataset.sec = section;
    row.dataset.control = c.id;
    p.appendChild(row);
    const note = document.createElement("div"); note.className = "notes"; note.id = "n_" + c.id;
    note.dataset.sec = section;
    note.dataset.control = c.id;
    p.appendChild(note);
  });
}

function syncPanel() {
  if (UI.defer("panel")) return;
  UI.count.panel++;
  // The brief carries live controls of its own (the student's own values), so
  // they follow the same sync as the panel's rows — move the Inflow q slider
  // and the field in the brief moves with it.
  if (EX.card) EX.card.syncValues();
  CONTROLS.forEach((c) => {
    if (c.h) return;
    const input = document.getElementById("c_" + c.id);
    const note = document.getElementById("n_" + c.id);
    if (!input) return;
    if (c.type === "buttons" || c.type === "custom") {
      c.sync(input);
      if (note) note.textContent = c.fmt ? c.fmt() : "";
      return;
    }
    // A dynamic row (Geometry's geom0…geom5) binds to whatever param its
    // scene declares at that index — none for most scenes. Hide the row and
    // its note when there is nothing to bind to, and when there is, adopt
    // that param's own range and label before reading its value below.
    if (c.par) {
      const d = c.par();
      input.parentElement.classList.toggle("gone", !d);
      if (note) note.classList.toggle("gone", !d);
      if (d) {
        c.label = d.label; c.min = d.min; c.max = d.max; c.step = d.step;
        input.step = d.step;           // the range input's own step, not just c's
        input.parentElement.querySelector(".lbl").textContent = d.label;
      }
    }
    // A select whose choices depend on the exercise (Gauges plot under
    // `ui.gaugeFields`) is rebuilt when the set changes, and only then.
    if (c.type === "select" && c.optsNow) {
      const opts = c.optsNow(), key = opts.map((o) => o[0]).join(",");
      if (input.dataset.opts !== key) {
        input.dataset.opts = key;
        input.textContent = "";
        opts.forEach(([ov, t]) => { const o = document.createElement("option"); o.value = ov; o.textContent = t; input.appendChild(o); });
      }
    }
    const v = c.get();
    if (c.type === "check") input.checked = !!v;
    else if (c.type === "select") input.value = v;
    else {
      if (c.rel === "H") { c.min = 0; c.max = sim.H; }
      if (c.rel === "W") { c.min = 0; c.max = sim.W; }
      if (c.log) input.value = Math.round(1000 * Math.log(v / c.min) / Math.log(c.max / c.min));
      else { input.min = c.min; input.max = c.max; input.value = v; }
    }
    if (note) note.textContent = c.fmt ? c.fmt(v) : "";
  });
  // The "Geometry" heading fronts geom0…geom5, which hide themselves row by
  // row above as the scene declares fewer than six params, down to none —
  // but a heading is not a row, so nothing in the loop hides IT. A scene
  // with no declared params (most of them) would otherwise leave the
  // heading standing over an empty section.
  const geomHeading = document.querySelector('#panel h3[data-sec="Geometry"]');
  if (geomHeading) geomHeading.classList.toggle("gone", !(SIM.params().decl || []).length);
  applyPanelFocus();
}

/** The Controls sections a focused panel keeps: the ones carrying the
 *  student's own controls, the ones the exercise itself sets through
 *  `rigParams` / `viewParams`, and View — which holds the field, the legend
 *  and the overlays, and is wanted in every exercise there is.
 *
 *  Derived from what the entry declares rather than from its prose: a brief
 *  that asks for a control nothing declares would send a student looking, and
 *  the fix for that is to declare the control, which is worth knowing anyway. */
function focusedSections(explicitControls) {
  const ex = EX.current;
  const secs = explicitControls ? [] : ["View"];
  if (!ex) return secs;
  const ids = explicitControls || Object.keys(ex.rigParams || {})
    .concat(Object.keys(ex.viewParams || {}))
    .concat(EX.studentControls ? EX.studentControls(ex) : []);
  let section = "";
  CONTROLS.forEach((c) => {
    if (c.h) { section = c.h; return; }
    if (ids.indexOf(c.id) >= 0 && secs.indexOf(section) < 0) secs.push(section);
  });
  return secs;
}

/** Hide the sections a focused profile does not want. A first-year hunting
 *  one slider through eleven sections is being asked the wrong question — and
 *  everything is one click away, always. */
function applyPanelFocus() {
  const u = state.ui || UIMODE.full();
  const level = u.lifted ? "full" : u.panel;
  const controls = level === "full" || !Array.isArray(u.controls) ? null : u.controls;
  const keep = level === "full" ? null : focusedSections(controls);
  document.querySelectorAll("#panel [data-sec]").forEach((el) => {
    const sectionOff = !!keep && keep.indexOf(el.dataset.sec) < 0;
    const controlOff = !!controls && !!el.dataset.control &&
                       controls.indexOf(el.dataset.control) < 0;
    el.classList.toggle("off", sectionOff || controlOff);
  });
  const sw = document.getElementById("panelAll");
  if (sw) {
    sw.textContent = keep ? "⋯ Show every control" : "";
    sw.parentElement.classList.toggle("on", !!keep);
  }
}

/** Open or close the Controls panel. Hoisted out of `boot` because the strip,
 *  the keyboard and the panel's own – all need it. */
function setPanel(open) {
  document.getElementById("panel").classList.toggle("open", open);
  const b = document.getElementById("panelBtn");
  if (b) b.classList.toggle("active", open);
}
function togglePanel() {
  setPanel(!document.getElementById("panel").classList.contains("open"));
}

function refreshNote(id) {
  const c = ctl(id), n = document.getElementById("n_" + id);
  if (c && n && c.fmt) n.textContent = c.fmt(c.get());
}

