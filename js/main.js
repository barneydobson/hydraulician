"use strict";
/**
 * main.js — boot, UI, pointer tools and the frame loop.
 */
const CONFIG = {
  // Roughly ×2 a step. The top two are deliberately past the point where the
  // sim keeps up with real time — Δx is what buys you sharp jets, thin nappes
  // and waves that survive their own interface, and that is worth the wait.
  // Note the spin-up countdowns run flat out, so at Ultra a 90 s spin-up
  // (m2, c13) is a genuinely long wait before the scene settles.
  budgets: { Low: 45000, Medium: 95000, High: 175000, "Very high": 350000, Ultra: 700000 },
  defaultBudget: "Medium",
  frameBudgetMs: 15,          // sim time we are willing to spend per frame
  histMax: 900,               // samples the CORNER card plots — its look is fixed
  // The deep store behind the inspector. Sampling is one point per rendered
  // frame, so ~60 per simulated second at speed 1: 20 000 is ~5.5 minutes of
  // sim time, and four gauges of it is a couple of megabytes. Oldest drops.
  logMax: 20000,
  tracerPath: 260,            // points of orbit history kept per tracer
  gaugeColours: ["#7fd4ff", "#ffb648", "#5fd08a", "#ff8fa3"],
};

const state = {
  scene: null, budget: CONFIG.defaultBudget,
  tool: "wall", brush: 0.055,
  mode: 0, range: {}, particles: false, dye: true, channel: true, labels: true, jumps: true,
  ui: null,                   // the resolved UI profile; UIMODE.full() when absent
  // The legend sits top right, immediately left of the Controls panel, until
  // somebody drags it; then the position is theirs for the session and stops
  // following the panel. Not stored anywhere on purpose: a `?ex=` link has to
  // look the same for every student who opens it.
  legendPlaced: false,
  // The two grade lines, on their own switch beside the channel overlay. Off
  // by default: they cost a full-field readback, and most scenes are
  // free-surface, where the HGL lies on the water line and adds nothing.
  grade: false, gradeBuf: null, gradeTick: 0,
  ruler: true,                // metre ticks on the view edges — a workspace preference
  measure: null, measDrag: null,   // the tape measure: {x0,z0,x1,z1} in metres
  cv: null, cvDrag: null,          // the control volume: box + EMA budget
  flux: [], fluxDrag: null,        // sections: what crosses each one, EMA'd
  cvShow: "Q",                     // which per-edge quantity the box labels
  force: null,                     // the pressure-force face: {solidId, faceId, data, t0}

  paused: false, speed: 1.0, nsub: 24, nsubMax: 400,
  // Average is a measurement mode, not a blur filter (docs/averaging.md
  // §4.3): while it is up, the field, the channel overlay and every number
  // derived from it must describe the SAME averaging window. `setAverage` is
  // the single writer — the strip's A, the panel checkbox and APP.avg.toggle
  // all go through it, because switching modes has to open or release the
  // accumulators and reset the overlay's EMAs in BOTH directions.
  avg: false,
  gauges: [], rakes: [], gaugeField: "h", tracers: null, tracerN: 9,
  gaugeT: -1,                 // sim time of the last gauge sample — see sampleGauges
  gaugeSeq: 0,                // ever-increasing gauge id, for inspector identity
  deliv: null,                // measured inlet discharge / level, for the panel
  cursor: [0, 0], inside: false, hover: null,
  drag: null, pour: null,
  zoom: 1, vex: 1, panC: null, panDrag: null, pinch: null, spoutDrag: false, vexDrag: null,
  // The exaggeration is fitted to the window until somebody sets it by hand —
  // then it is theirs, and a resize stops moving it (see autoVex).
  vexAuto: true,
  flashKey: null, flashT: 0,
  fps: 60, rt: 1, simDt: 0,
  tipIdx: 0, tipAt: 0,
};

let canvas, over, octx, view, sim;

// --------------------------------------------------------------- geometry
/** Letterbox rect of the whole domain at zoom 1 — the zoomed view scales
 *  this rect about the pan centre, so the GPU just draws a bigger rect and
 *  the screen clips it. */
/** `state.vex` is VERTICAL EXAGGERATION — the drawn rect is stretched
 *  vertically by this factor. A 12 m × 1.5 m flume has an aspect of 8, so in
 *  a normal window it letterboxes to a strip a couple of hundred pixels tall
 *  and a 0.1 m wave is a few pixels. Every hydraulics long-section is drawn
 *  exaggerated for exactly this reason; the scale bar and the ∇ markers stay
 *  honest because they follow the same rect. */
function baseRect() {
  const cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
  const ar = sim.W / (sim.H * state.vex);
  let w = cw, h = cw / ar;
  if (h > ch) { h = ch; w = ch * ar; }
  return { cw, ch, w, h, bx: (cw - w) / 2, by: (ch - h) / 2 };
}

function computeView() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const B = baseRect();
  const cw = B.cw, ch = B.ch;
  if (canvas.width !== Math.round(cw * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    over.width = canvas.width; over.height = canvas.height;
    over.style.width = cw + "px"; over.style.height = ch + "px";
  }
  const S = sim, z = state.zoom;
  const Wv = S.W / z, Hv = S.H / z;
  let cx = state.panC ? state.panC[0] : S.W / 2;
  let cy = state.panC ? state.panC[1] : S.H / 2;
  cx = Math.min(Math.max(cx, Wv / 2), S.W - Wv / 2);
  cy = Math.min(Math.max(cy, Hv / 2), S.H - Hv / 2);
  state.panC = z > 1.001 ? [cx, cy] : null;
  const w = B.w * z, h = B.h * z;
  const x = B.bx + B.w / 2 - cx / S.W * w;
  const y = B.by + B.h / 2 - (1 - cy / S.H) * h;
  view = {
    x, y, w, h, pxW: cw, pxH: ch, dpr, zoom: z,
    vis: { x: Math.max(x, B.bx), y: Math.max(y, B.by),
           w: Math.min(x + w, B.bx + B.w) - Math.max(x, B.bx),
           h: Math.min(y + h, B.by + B.h) - Math.max(y, B.by) },
    ndc: [(x / cw) * 2 - 1, (1 - (y + h) / ch) * 2 - 1,
          ((x + w) / cw) * 2 - 1, (1 - y / ch) * 2 - 1],
    X: (m) => x + m / S.W * w,
    Y: (m) => y + h - m / S.H * h,
    toDomain: (px, py) => [(px - x) / w * S.W, (y + h - py) / h * S.H],
  };
}

/** Zoom about a fixed screen point (px, py), keeping the domain point under
 *  it stationary. */
function zoomAt(px, py, factor) {
  const z1 = Math.min(16, Math.max(1, state.zoom * factor));
  if (Math.abs(z1 - state.zoom) < 1e-6) return;
  const [dx0, dz0] = view.toDomain(px, py);
  const B = baseRect();
  state.zoom = z1;
  state.panC = [
    dx0 + (B.bx + B.w / 2 - px) * sim.W / (B.w * z1),
    dz0 + (py - B.by - B.h / 2) * sim.H / (B.h * z1),
  ];
  computeView();
}

/** The vertical exaggeration that makes the domain fill `FILL` of the window.
 *
 *  A 14 m × 2 m flume at true scale is a strip: 23% of a desktop window's
 *  height, and 14% of a phone held upright, which is a 0.1 m wave a couple of
 *  pixels tall. Every long-section in hydraulics is drawn exaggerated for
 *  exactly this reason, and the ruler, the scale bar and the ∇ markers all
 *  follow the same rect, so nothing said on screen stops being true.
 *
 *  Never below 1 — the view is stretched, never squashed — and capped, because
 *  past about ×8 the water stops looking like water. The remaining margin is
 *  deliberate: the empty band above and below the domain is the drag handle
 *  for this very number. */
const VEX_FILL = 0.62, VEX_MAX = 8;
function autoVex() {
  if (!canvas || !sim || !(sim.W > 0) || !(sim.H > 0)) return 1;
  const cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
  // From baseRect: a width-limited rect is `cw · H · vex / W` tall.
  const v = VEX_FILL * ch * sim.W / (cw * sim.H);
  return Math.max(1, Math.min(VEX_MAX, v));
}

/** Apply it, unless the reader has taken the number over by hand. */
function applyAutoVex() {
  if (!state.vexAuto) return;
  const v = autoVex();
  if (Math.abs(v - state.vex) > 1e-3) { state.vex = v; computeView(); }
}

function resetZoom() {
  state.zoom = 1; state.panC = null;
  // "Reset the view" means the view you were given, which is the fitted one —
  // not 1:1, which is the thing that needed fixing.
  state.vexAuto = true; state.vex = autoVex();
}

/** Case- and accent-folded, for the two exercise filters. Nobody types the
 *  acute in "Bélanger", and a search box that only matches it is a search box
 *  that says the demo is not in the pack. Both filters go through this so they
 *  cannot drift apart. */
function foldText(s) {
  // The character class is the combining-marks block U+0300–U+036F, which NFD
  // has just split the accents out into.
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ------------------------------------------------------------------ scenes
function loadScene(id, keepDrawing) {
  const sc = SCENES.byId[id];
  state.scene = sc;
  sim = SIM.build(sc, CONFIG.budgets[state.budget], keepDrawing);
  state.mode = sc.mode;
  state.range = {};              // each scene sets its own colour scales
  state.channel = !!sc.chan;
  state.labels = sc.labels === undefined ? true : !!sc.labels;
  // A scene whose whole subject is the particle motion should not open with
  // the particles switched off and a tip asking you to find the key.
  if (sc.particles !== undefined) state.particles = !!sc.particles;
  state.gauges.length = 0; state.rakes.length = 0; state.tracers = null;
  state.measure = null; state.measDrag = null;
  state.cv = null; state.cvDrag = null;
  state.flux.length = 0; state.fluxDrag = null;
  state.force = null;
  state.gaugeT = -1;
  state.deliv = null;
  state.tipIdx = 0; state.tipAt = 0;
  state.nsub = 24;
  resetZoom();
  // A scene may open zoomed on the thing it is about. The wave flumes need
  // it: a 12 m flume letterboxes to a strip a couple of hundred pixels tall,
  // and a 100 mm orbit in that is about one pixel. `0` still resets.
  if (sc.view) {
    // A scene that states its own exaggeration has measured it against what it
    // is trying to show, so it wins and the automatic fit stands down.
    if (sc.view.vex) { state.vex = sc.view.vex; state.vexAuto = false; }
    if (sc.view.zoom) { state.zoom = sc.view.zoom; state.panC = [sc.view.cx, sc.view.cy]; }
  }
  computeView();
  syncPanel();
  // The scene chose the field and cleared the ranges, so the card has to be
  // repainted here — every path into a scene comes through this function, and
  // syncing at the callers instead is how one of them gets missed.
  LEGEND.sync();
  showToast(sc.name, sc.blurb);
  document.getElementById("sceneName").textContent = sc.name;
  document.getElementById("sceneKey").textContent = sc.key;
  PICKER.refresh();
}

/** Load a scene from the UI — the picker, the bar button, the panel row.
 *
 *  `loadScene` rebuilds everything the SCENE owns (grid, params, segments,
 *  gauges, view, mode/overlay flags). What it does not touch is the handful of
 *  session knobs that a fresh `?scene=<id>` boot would never have inherited,
 *  and those are reset here so that switching in place lands on exactly the
 *  state the URL would have produced. They are set BEFORE the load so a scene
 *  that pins one of them (`sc.particles`) still wins.
 *
 *  Deliberately NOT reset — these are workspace preferences with no scene
 *  meaning, and a fresh boot cannot preserve them only because it cannot know
 *  them: the resolution budget, the pointer tool and its brush size, and
 *  whether the Controls panel is open.
 *
 *  Why in place rather than `location.href = "?scene=" + id`: the WebGL
 *  context, the six compiled programs and the panel DOM all survive, so the
 *  switch is immediate; and `loadScene` is already the path `#rig=` links and
 *  every worksheet `rig.js` take, so it is the better-tested one. The address
 *  bar is rewritten to match anyway (and a stale `#rig=` dropped), so a reload
 *  lands where you are looking. */
function switchScene(id) {
  if (!SCENES.byId[id]) return false;
  state.speed = 1.0;
  state.dye = true;
  state.jumps = true;
  state.particles = false;            // scenes that want them set `sc.particles`
  state.gaugeField = "h";
  state.tracerN = 9;
  UIMODE.reset();                     // a new scene is a whole interface again
  GINSP.closeAll();
  if (state.paused) togglePause();    // via the toggle, so the glyph follows
  loadScene(id, false);
  // The strip reads the valve state off the new `sim`, so it has to be
  // repainted after the rebuild, not before it.
  syncToolbar();
  // `loadScene` resets the tip cycle but not the line itself, so without this
  // the previous scene's tip sits there for the first nine seconds.
  document.getElementById("hint").innerHTML = state.scene.tips[0] || "";
  syncURL(id);
  return true;
}

/** Keep the address bar honest: `?scene=<id>` for what is loaded, and NO
 *  `#rig=` — a rig that has been switched away from must not come back on a
 *  reload, which is the least surprising reading of "I left that scene".
 *  Share writes its own link back into the bar when you next press it.
 *  `replaceState` throws on `file://` (opaque origin); the picker works there
 *  regardless, the URL simply does not follow. */
function syncURL(id) {
  try {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.set("scene", id);
    history.replaceState(null, "", u.pathname + u.search);
  } catch (_) { /* file:// refuses — harmless */ }
}

// ==========================================================================
//  The fields the water can be painted with.
// ==========================================================================
/** The seven colourings, as data.
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
  { mode: 4, id: "vort", name: "Vorticity", sym: "ω", unit: "1/s",
    ramp: "divg", mid: 0, def: () => [-40, 40],
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
/** The momentum-flux scale, as the display pass has always computed it. */
function momScene() { return 0.5 * Math.pow(sceneNow().vmax || 4, 2); }

/** The registry entry for a shader mode integer. */
function fieldFor(mode) { return FIELDS.find((f) => f.mode === mode) || FIELDS[0]; }

/** The live colour range for a field, in its own units. Seeded from the
 *  registry default the first time it is asked for, then owned by whatever
 *  Fit or the legend's typed boxes last set. It does NOT track the flow:
 *  colour that drifts while you watch cannot be compared between two frames,
 *  let alone between two students' screenshots, which is the whole reason for
 *  printing a scale at all. */
function rangeFor(id) {
  const f = FIELDS.find((q) => q.id === id) || FIELDS[0];
  if (!state.range[id]) state.range[id] = f.def();
  return state.range[id];
}

// ------------------------------------------------------------------- panel
const CONTROLS = [
  { h: "Scene" },
  { id: "scene", type: "buttons", label: "Scene",
    // A "buttons" row rebuilds itself on every sync, which is exactly what a
    // label showing the live scene name needs.
    sync: (el) => {
      el.textContent = "";
      const b = document.createElement("button");
      b.className = "scenebtn";
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
      b.className = "scenebtn";
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
    info: "The forty verified teaching demos in <code>exercises/</code>. Picking one gives everybody the same STARTING POINT — its scene, Resolution Medium, its drawn rig if the rig pack is in this build, and only the settings a README documents as load-bearing — then opens a small card: what you are looking at, what to do, and where the gauges go. The card prints the RULE for your own parameter (d is your student number's last digit — your lecturer explains it); working it out and setting it is yours, because the picker never moves a slider or drops a gauge. Everything that was applied is itemised on the card under \"already set\", and the full brief is one link away. <b>E</b> opens the same menu, and <code>?ex=&lt;id&gt;</code> boots straight into one." },

  { h: "Flow" },
  { id: "speed", label: "Speed", min: 0.02, max: 10, step: 0.01, log: true,
    get: () => state.speed, set: (v) => state.speed = v,
    fmt: (v) => "×" + v.toFixed(2) + " real time",
    info: "How much simulated time passes per second of wall clock. Water hammer wants slow motion; backwater curves want fast. The scale is logarithmic — ×1 sits near two-thirds of the travel and the top decade (×3 to ×10) is for skipping waits, machine permitting: the note under the slider prints asked against achieved, and a heavy scene simply tops out at what the frame budget allows." },
  { id: "inflowOn", place: "res", type: "check", label: "Upstream reservoir",
    get: () => sim.p.inflow.on > 0.5,
    set: (v) => {
      sim.p.inflow.on = v ? 1 : 0;
      if (v) {           // make the control self-evident: open its edge, pick sane defaults
        if (sim.p.open[0] < 1) { sim.p.open[0] = 1; sim.p.autoL = 1; SIM.rasterise(); }
        if (sim.p.inflow.level <= 0.01) sim.p.inflow.level = 0.55 * sim.H;
        if (!(sim.p.inflow.q > 0) && !(sim.p.inflow.free > 0.5) && sim.p.inflow.v === undefined) {
          sim.p.inflow.q = 0.25;
        }
      } else if (sim.p.autoL) {
        // An edge this toggle opened, it closes again. Leaving it open is a
        // silent leak — a tank filled from the reservoir and then switched to
        // a drain test quietly bleeds out of the boundary it forgot about.
        sim.p.autoL = 0; sim.p.open[0] = 0; SIM.rasterise();
      }
    },
    info: "Holds a water level on the LEFT edge and feeds the set discharge through it. Ticking it opens the left edge automatically (and closes it again when unticked, unless you set that edge yourself); the ∇ marker shows the level." },
  { id: "inLevel", place: "res", label: "Reservoir level", min: 0, max: 1, step: 0.005, rel: "H",
    get: () => sim.p.inflow.level, set: (v) => sim.p.inflow.level = v,
    fmt: (v) => {
      const b = SIM.bands(), D = state.deliv;
      const d = Math.min(v, b.inB[1]) - b.inB[0];
      return v.toFixed(2) + " m above datum" +
        (d > 0 ? "  ·  " + d.toFixed(2) + " m deep at the inlet" : "  ·  below the inlet bed!") +
        (D ? "  ·  delivering " + D.level.toFixed(2) + " m" : "");
    },
    info: "Water level held on the left boundary, measured from the domain floor (the datum), NOT from the bed. Set it to the level the arriving flow actually wants — a level below a downstream control's backwater will choke the backwater at the inlet. The DELIVERED level is measured just clear of the relaxation sponge and sits below the slider by however much head the sponge is giving up." },
  { id: "inQ", place: "res", label: "Inflow q", min: 0, max: 2.0, step: 0.005,
    get: () => sim.p.inflow.q, set: (v) => sim.p.inflow.q = v,
    fmt: (v) => {
      // Under head-driven inflow the slider is not the discharge — nothing
      // writes it back from the solver — so print what the inlet is actually
      // delivering instead, and take d_c from that.
      const D = state.deliv;
      if (sim.p.inflow.free > 0.5) {
        return "head-driven  ·  q → " + (D ? D.q.toFixed(3) : "—") + " m²/s delivered" +
               (D ? "   d_c = " + Math.pow(D.q * D.q / 9.81, 1 / 3).toFixed(3) + " m" : "");
      }
      return v.toFixed(3) + " m²/s per m width  →  " + SIM.inletVel().toFixed(2) + " m/s" +
             "   d_c = " + Math.pow(v * v / 9.81, 1 / 3).toFixed(3) + " m";
    },
    info: "Unit discharge entering the domain, converted to an inlet velocity using the depth available over the bed. Critical depth d_c = (q²/g)^⅓ follows directly from it. Under head-driven inflow this slider is inert and the note prints the measured delivered discharge instead." },
  { id: "inFree", place: "res", type: "check", label: "Head-driven inflow",
    get: () => (sim.p.inflow.free || 0) > 0.5, set: (v) => sim.p.inflow.free = v ? 1 : 0,
    info: "Pins only the reservoir level and lets the head difference drive the discharge — how the water-hammer and venturi scenes feed themselves. Off = the inflow q is prescribed directly." },
  { id: "twOn", place: "tw", type: "check", label: "Tailwater control",
    get: () => sim.p.tailwater.on > 0.5,
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
    get: () => sim.p.source.on > 0.5, set: (v) => sim.p.source.on = v ? 1 : 0,
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
  ...[0, 1, 2, 3].map((k) => ({
    id: "geom" + k, label: "—",
    min: 0, max: 1, step: 0.01,
    // The row binds to the k-th declared param of whatever scene is up.
    par: () => (SIM.params().decl || [])[k],
    get: function () { const d = this.par(); return d ? SIM.params().values[d.key] : 0; },
    set: function (v) { const d = this.par(); if (d) SIM.setParam(d.key, v); },
    fmt: function (v) {
      const d = this.par();
      return d ? v.toFixed(3) + (d.unit ? " " + d.unit : "") : "";
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
    fmt: (v) => v.toFixed(0) + " m/s   (Δh from Δv: " + (v / 9.81).toFixed(1)
      + " m per m/s · ≤" + (100 * 9.81 * sim.H / (v * v)).toFixed(0) + "% compression)",
    info: "The Preissmann-slot stiffness. Pressure waves travel at this speed, so it sets the water-hammer surge ΔH = cΔv/g. Lower c = bigger time step = faster run, but the water is held up by compression f − 1 = gd/c², so it also makes the fluid squashier — keep c well above √(gd)." },
  { id: "cf", label: "Bed roughness C_f", min: 0, max: 0.25, step: 0.002,
    get: () => sim.p.cf, set: (v) => sim.p.cf = v,
    fmt: (v) => v.toFixed(3) + (v === 0 ? "   frictionless" : ""),
    info: "Wall-function drag in the cells touching a solid. Controls normal depth, and therefore whether a slope is mild or steep. Hover the channel to read the Manning n it is actually delivering." },
  { id: "cs", label: "Eddy viscosity C_s", min: 0, max: 0.4, step: 0.005,
    get: () => sim.p.cs, set: (v) => sim.p.cs = v,
    fmt: (v) => v === 0 ? "laminar" : "Smagorinsky " + v.toFixed(2),
    info: "Turbulent mixing. Raise it and the velocity–depth profile flattens from parabolic towards the log law." },
  { id: "bulk", label: "Wave damping", min: 0, max: 0.5, step: 0.005,
    get: () => sim.p.bulk, set: (v) => sim.p.bulk = v,
    fmt: (v) => v === 0 ? "none — surges ring forever" : v.toFixed(3),
    info: "Artificial bulk viscosity. Attenuates pressure waves; set it to zero to see an undamped water-hammer oscillation." },
  { id: "slip", type: "check", label: "Free-slip walls",
    get: () => sim.p.slip > 0.5, set: (v) => sim.p.slip = v ? 1 : 0,
    info: "Off = no-slip, which is what builds a boundary layer and a real velocity profile." },
  { id: "ca", label: "Interface sharpening", min: 0, max: 1.5, step: 0.05,
    get: () => sim.p.ca, set: (v) => sim.p.ca = v,
    fmt: (v) => v === 0 ? "off — the surface smears" : "cα " + v.toFixed(2),
    info: "The interFoam-style compression flux that keeps the free surface a couple of cells thick. Too high and thin jets bead up." },
  { id: "grav", type: "check", label: "Plan view (gravity off)",
    get: () => sim.p.g < 0.5, set: (v) => sim.p.g = v ? 0 : (state.scene.g || 9.81),
    info: "Switches between the vertical profile and looking down on a horizontal plane." },

  { h: "Wavemaker" },
  { id: "waveOn", place: "piston", type: "check", label: "Piston on",
    get: () => sim.p.wave.on > 0.5, set: (v) => sim.p.wave.on = v ? 1 : 0,
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
  { id: "vex", label: "Vertical exaggeration", min: 1, max: 12, step: 0.1,
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
    fmt: () => fieldFor(state.mode).blurb },
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
      b.onclick = () => { b.blur(); state.tool = "measure"; window.syncTools(); syncPanel(); };
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
        const b = document.createElement("button");
        b.textContent = txt; b.title = why;
        b.className = state.cvShow === id ? "on" : "";
        b.onclick = () => { b.blur(); state.cvShow = id; syncPanel(); };
        el.appendChild(b);
      });
    },
    fmt: () => !state.cv ? "left-drag a box on the water with the Control volume tool (9)"
      : !state.cv.flux ? "settling…"
      : "Σ Q " + state.cv.flux.total.Q.toFixed(4) + " m²/s  ·  " +
        "Σ Ė " + state.cv.flux.total.E.toFixed(1) + " W/m",
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
  { id: "channel", type: "check", label: "Open-channel overlay",
    get: () => state.channel, set: (v) => state.channel = v,
    info: "Critical depth d_c, normal depth d_n and the energy grade line, computed per column from the live depth and unit discharge." },
  { id: "grade", type: "check", label: "Grade lines (EGL / HGL)",
    get: () => state.grade, set: (v) => state.grade = v,
    info: "The energy grade line H and the hydraulic grade line h = z + p/ρg, drawn for every wet column whether it has a free surface or not. The gap between them is the velocity head V²/2g, to scale. In a free-surface reach the HGL sits on the water surface; in a pressurised conduit there is no surface and the HGL is the only meaningful head — it can run above the crown, which is what B10 is about. Costs one full-field readback, throttled to every third frame." },
  { id: "labels", type: "check", label: "Profile labels",
    get: () => state.labels, set: (v) => state.labels = v,
    info: "Names each reach by its gradually-varied-flow class. The letter is the bed (Mild, Steep, Critical, Horizontal, Adverse); the number is the zone — 1 above both d_n and d_c, 2 between them, 3 below both." },
  { id: "jumps", type: "check", label: "Jump analysis",
    get: () => state.jumps, set: (v) => state.jumps = v,
    info: "Brackets every hydraulic jump and compares the measured conjugate depth against the momentum prediction d₂/d₁ = ½(√(1+8Fr₁²) − 1)." },
  { id: "particles", type: "check", label: "Particles",
    get: () => state.particles, set: (v) => state.particles = v,
    info: "Massless tracers. The clearest way to see wave orbits and jet spreading." },
  { id: "dye", type: "check", label: "Dye",
    get: () => state.dye, set: (v) => state.dye = v },
  { id: "dyeLine", label: "Dye timelines", min: 0, max: 4, step: 0.1,
    get: () => sim.p.dyeLine, set: (v) => sim.p.dyeLine = v,
    fmt: (v) => v === 0 ? "off" : "every " + v.toFixed(1) + " s",
    info: "Injects a vertical line of dye at the inlet. It shears as it travels — that shape IS the velocity–depth distribution." },
  { id: "dyeDecay", label: "Dye fade", min: 0, max: 0.3, step: 0.005,
    get: () => sim.p.dyeDecay, set: (v) => sim.p.dyeDecay = v,
    fmt: (v) => v === 0 ? "permanent" : (1 / v).toFixed(0) + " s half-life-ish" },
  { id: "gaugeField", type: "select", label: "Gauges plot",
    opts: [["h", "Piezometric head"], ["d", "Depth"], ["speed", "Speed"]],
    get: () => state.gaugeField, set: (v) => state.gaugeField = v },
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
      x.onclick = () => {
        x.blur();
        GINSP.closeAll();
        state.gauges.length = 0;
        syncPanel();
      };
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
      infoEl.onclick = (e) => { e.preventDefault(); showToast(c.label, c.info); };
    }
    // A stacked row wraps its block onto the next line, so the ⓘ has to be
    // placed BEFORE it or it ends up stranded on a third line of its own.
    if (infoEl && c.type === "custom") row.appendChild(infoEl);
    row.appendChild(input);
    if (infoEl && c.type !== "custom") row.appendChild(infoEl);
    if (c.type === "custom") c.build(input);
    row.dataset.sec = section;
    p.appendChild(row);
    const note = document.createElement("div"); note.className = "notes"; note.id = "n_" + c.id;
    note.dataset.sec = section;
    p.appendChild(note);
  });
}

function syncPanel() {
  // The brief carries live controls of its own (the student's own values), so
  // they follow the same sync as the panel's rows — move the Inflow q slider
  // and the field in the brief moves with it.
  if (typeof EX !== "undefined" && EX.card) EX.card.syncValues();
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
    // A dynamic row (Geometry's geom0…geom3) binds to whatever param its
    // scene declares at that index — none for most scenes. Hide the row and
    // its note when there is nothing to bind to, and when there is, adopt
    // that param's own range and label before reading its value below.
    if (c.par) {
      const d = c.par();
      input.parentElement.classList.toggle("gone", !d);
      if (note) note.classList.toggle("gone", !d);
      if (d) {
        c.min = d.min; c.max = d.max; c.step = d.step;
        input.parentElement.querySelector(".lbl").textContent = d.label;
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
function focusedSections() {
  const ex = EX.current;
  const secs = ["View"];
  if (!ex) return secs;
  const ids = Object.keys(ex.rigParams || {})
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
  const keep = level === "full" ? null : focusedSections();
  document.querySelectorAll("#panel [data-sec]").forEach((el) => {
    el.classList.toggle("off", !!keep && keep.indexOf(el.dataset.sec) < 0);
  });
  const sw = document.getElementById("panelAll");
  if (sw) {
    sw.textContent = keep ? "⋯ Show every control" : "";
    sw.parentElement.classList.toggle("on", !!keep);
  }
}

// ------------------------------------------------------------------ toasts
let toastTimer = 0;
function showToast(title, sub) {
  const t = document.getElementById("toast");
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastSub").textContent = sub || "";
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 5200);
}

// -------------------------------------------------------- minimisable boxes
/** Collapse any fixed UI box to a small pill and back. Each box gets a "–" in
 *  a corner; the pill sits at the box's own anchor so nothing moves, it just
 *  gets out of the way of the water. Session state only — a reload restores
 *  the full chrome, which is the least surprising thing for a lecture
 *  machine. */
const MINI = (() => {
  const items = {};
  /** opts: { corner: "corner"|"cornerL"|"inline", pill: {css}, label }
   *  "inline" prepends the button as the box's FIRST flex child — the bar's
   *  right end wraps under the title box on a narrow window, so the left end
   *  is the only spot nothing can cover. */
  function add(id, el, opts) {
    const o = opts || {};
    const btn = document.createElement("button");
    btn.className = "minbtn" + (o.corner === "inline" ? "" : " " + (o.corner || "corner"));
    btn.title = "Minimise"; btn.textContent = "–";
    btn.onclick = (e) => { e.stopPropagation(); btn.blur(); set(id, true); };
    if (o.corner === "inline") el.insertBefore(btn, el.firstChild);
    else el.appendChild(btn);
    const pill = document.createElement("div");
    pill.className = "minpill glass";
    pill.textContent = o.label || "▸";
    pill.title = "Restore";
    Object.assign(pill.style, o.pill || {});
    pill.onclick = () => set(id, false);
    document.body.appendChild(pill);
    items[id] = { el, pill, btn, label: o.label || "▸", min: false };
  }
  function set(id, min) {
    const it = items[id];
    if (!it) return;
    it.min = min;
    it.el.style.display = min ? "none" : "";
    it.pill.classList.toggle("show", min);
  }
  function isMin(id) { return !!(items[id] && items[id].min); }
  /** A live element to anchor a menu on: the box, or its pill when minimised. */
  function anchor(id) {
    const it = items[id];
    return it && it.min ? it.pill : (it ? it.el : null);
  }
  /** Let a pill carry a live word or two (the settle countdown, mostly).
   *  Called per frame, so it only touches the DOM on an actual change. */
  function pillText(id, txt) {
    const it = items[id];
    if (!it) return;
    const t = txt || it.label;
    if (it.pill.textContent !== t) it.pill.textContent = t;
  }
  return { add, set, isMin, anchor, pillText };
})();

// ------------------------------------------------------------------ tools
const TOOLS = [
  ["wall", "Wall", "Left-drag a straight edge"],
  ["erase", "Erase", "Left-drag to remove"],
  ["valve", "Valve", "Draw a gate you can slam with V"],
  ["spout", "Spout", "Click or drag to move the falling inflow"],
  ["gauge", "Gauge", "Click to log head / depth — click one again to remove it"],
  ["rake", "Rake", "Click for a velocity–depth profile — click it again to remove it"],
  ["tracer", "Tracers", "Click to drop a column of orbit tracers"],
  ["measure", "Measure", "Left-drag a tape measure (Shift snaps) — click to clear"],
  ["cv", "Control volume", "Left-drag a control volume — the budget on every edge, and the force on what it encloses. Click to clear"],
  // Tenth, and deliberately last: the digits 1–9 already mean the nine above
  // them, in worksheets as well as in muscle memory. Pour has no digit; on a
  // desktop its shortcut is the right-drag that works in any tool.
  ["pour", "Pour", "Drag to pour water — or right-drag with any tool"],
  // ELEVENTH, and appended for the same reason: anything inserted above this
  // line renumbers a digit, and a worksheet that says "press 5" would start
  // arming the wrong tool. New tools go on the end, whatever group they
  // belong to on the strip.
  ["flux", "Flux line", "Left-drag a section — reads what crosses it. Draw TWO for the balance between them (Shift snaps; click a line to remove it)"],
  // TWELFTH, appended for the same reason as Flux: it needs a scene solid to
  // click on (Task 2 of the polygon-geometry work), which nothing draws yet,
  // so it has no digit of its own either.
  ["force", "Pressure force", "Click a wall or gate face for its pressure diagram — click the same solid again to cycle faces, click open water to clear"],
];

/** The tools the number keys can reach. */
const TOOL_KEYS = Math.min(9, TOOLS.length);

// ==========================================================================
//  The top strip: icons, their hover card, and the groups they sit in.
// ==========================================================================
/** One entry per glyph, as the INNER markup of a 20 × 20 `viewBox`. Stroke
 *  icons only, drawn on the same grid at the same weight, so the strip reads
 *  as one set rather than a ransom note. `currentColor` everywhere — the
 *  button's own state colours the glyph. */
const ICONS = {
  home:    '<path d="M3.5 9 10 3.5 16.5 9"/><path d="M5 8.2V16h10V8.2"/><path d="M8.4 16v-4h3.2v4"/>',
  scenes:  '<rect x="3" y="5" width="9" height="7" rx="1"/><path d="M8 15h9V8h-2"/>',
  ex:      '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H10v14H5.5A1.5 1.5 0 0 1 4 15.5Z"/>' +
           '<path d="M10 3h4.5A1.5 1.5 0 0 1 16 4.5v11a1.5 1.5 0 0 1-1.5 1.5H10"/>' +
           '<path d="M6.5 6.5H8M12 6.5h2"/>',
  fresh:   '<path d="M10 4v12M4 10h12"/>',
  wall:    '<path d="M3.5 16.5 16.5 3.5"/><circle cx="3.5" cy="16.5" r="1.4" fill="currentColor" stroke="none"/>' +
           '<circle cx="16.5" cy="3.5" r="1.4" fill="currentColor" stroke="none"/>',
  erase:   '<path d="M11.5 4.5 15.5 8.5 8.5 15.5H5.5L3.5 13.5Z"/><path d="M9 7l4 4"/>',
  valve:   '<path d="M4 4v5M16 4v5M4 9h12M10 9v8M7.5 17h5"/>',
  // The tool that DRAWS a gate and the button that OPERATES every gate are
  // different jobs, so they get different glyphs: a gate in a pipe run, and
  // the handwheel above it.
  gate:    '<path d="M3 7.5h4.5M12.5 7.5H17M3 12.5h4.5M12.5 12.5H17"/>' +
           '<rect x="7.5" y="4.5" width="5" height="11" rx="1"/><path d="M10 4.5V2.6"/>',
  spout:   '<path d="M4 4h6v3l-3 2"/><path d="M13 10c1.6 2 2.6 3.4 2.6 4.8a2.9 2.9 0 1 1-5.8 0C9.8 13.4 11.2 12 13 10z"/>',
  gauge:   '<path d="M4 14a6 6 0 1 1 12 0"/><path d="M10 14l3.2-4"/><path d="M4 14h1.5M14.5 14H16"/>',
  rake:    '<path d="M6 3v14"/><path d="M6 6h7M6 10h9M6 14h6"/><path d="M13 6l-1.5-1.2M13 6l-1.5 1.2"/>',
  tracer:  '<ellipse cx="10" cy="10" rx="6.5" ry="4.5" transform="rotate(-18 10 10)"/>' +
           '<circle cx="15.4" cy="7.6" r="1.7" fill="currentColor" stroke="none"/>',
  measure: '<rect x="3" y="7.5" width="14" height="5.5" rx="1"/><path d="M6.5 7.5v2.2M10 7.5v2.2M13.5 7.5v2.2"/>',
  // A section with the flow crossing it — the thing the tool measures.
  flux:    '<path d="M6.5 3.5v13"/><path d="M10.5 10h6"/><path d="M14.5 7.5 17 10l-2.5 2.5"/>' +
           '<path d="M2.5 10h2.2"/>',
  cv:      '<rect x="4" y="5" width="12" height="10" rx="1" stroke-dasharray="3 2.4"/>' +
           '<path d="M10 8v4M8.4 10.4 10 12l1.6-1.6"/>',
  pause:   '<rect x="5.2" y="4" width="3.2" height="12" rx="1" fill="currentColor" stroke="none"/>' +
           '<rect x="11.6" y="4" width="3.2" height="12" rx="1" fill="currentColor" stroke="none"/>',
  play:    '<path d="M6.5 4.2 15.5 10l-9 5.8Z" fill="currentColor" stroke="none"/>',
  reset:   '<path d="M4.5 10a5.5 5.5 0 1 1 1.7 4"/><path d="M4.5 15v-5h5"/>',
  undo:    '<path d="M7 5.5 3.5 9 7 12.5"/><path d="M3.5 9h8A4.5 4.5 0 0 1 16 13.5v1"/>',
  pour:    '<path d="M4.5 4.5h7l-1 4.5h-5z"/><path d="M11.5 6.2c1.6 0 2.2 1 2.2 2s-.8 1.9-2.2 1.9"/>' +
           '<path d="M7.2 12.4c1.1 1.4 1.8 2.3 1.8 3.2a1.9 1.9 0 1 1-3.8 0c0-.9.8-1.8 2-3.2z"/>',
  clear:   '<path d="M5 6h10"/><path d="M8 6V4.5h4V6"/><path d="M6.5 6l.8 9h5.4l.8-9"/>',
  sliders: '<path d="M4 6h12M4 10h12M4 14h12"/><circle cx="8" cy="6" r="1.9" fill="#070b0f"/>' +
           '<circle cx="13" cy="10" r="1.9" fill="#070b0f"/><circle cx="6.5" cy="14" r="1.9" fill="#070b0f"/>',
  keys:    '<rect x="2.5" y="6" width="15" height="8" rx="1.5"/><path d="M5.5 9h.01M8 9h.01M10.5 9h.01M13 9h.01M14.5 9h.01M6.5 11.6h7"/>',
  about:   '<path d="M10 3.5 17 7l-7 3.5L3 7Z"/><path d="M3 10.5 10 14l7-3.5M3 14l7 3.5 7-3.5" opacity=".55"/>',
  // ---- VIEW: what the water is painted with, and what is drawn over it.
  // A colour bar with its ticks; the dashes ARE the numbers under a legend.
  all:     '<circle cx="4.5" cy="10" r="1.45" fill="currentColor" stroke="none"/>' +
           '<circle cx="10" cy="10" r="1.45" fill="currentColor" stroke="none"/>' +
           '<circle cx="15.5" cy="10" r="1.45" fill="currentColor" stroke="none"/>',
  legend:  '<rect x="3" y="5.5" width="14" height="4.5" rx="1"/>' +
           '<path d="M3 13h3M8.5 13h3M14 13h3"/>',
  particles: '<circle cx="5" cy="7" r="1.3"/><circle cx="11" cy="5.5" r="1.3"/>' +
             '<circle cx="15" cy="9.5" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/>' +
             '<circle cx="13" cy="15" r="1.3"/>',
  dye:     '<path d="M10 3.5c3 3.6 4.5 5.9 4.5 8a4.5 4.5 0 0 1-9 0c0-2.1 1.5-4.4 4.5-8Z"/>',
  // Average: a wobbling trace with the mean line drawn flat through it. The
  // glyph is the claim — the line is not the signal, it is what the signal
  // spent the window doing.
  average: '<path d="M2.5 12.5c2-5 3.2 3.5 5 0s2.5-8.5 4.5-5 3.5 6 5.5 2.5" opacity=".55"/>' +
           '<path d="M2.5 10h15"/>',
  // The two grade lines over a wavy surface: what the overlay actually draws.
  channel: '<path d="M3 6h14"/><path d="M3 9.5h14" stroke-dasharray="2.4 2"/>' +
           '<path d="M3 15c3.5 0 4.5-2.2 7-2.2s3.5 2.2 7 2.2"/>',
  // A vertical face with three arrows of growing length pressing on it — the
  // textbook pressure diagram drawForce paints on the canvas.
  force:   '<path d="M13.5 3v14"/><path d="M4 6.5h5M6 10h3M8 13.5h1"/>' +
           '<path d="M9 6.5 7.5 5.4M9 6.5 7.5 7.6M9 10l-1.2-1M9 10l-1.2 1M9 13.5l-.9-.8M9 13.5l-.9.8"/>',
};

/** An `<svg>` for one icon id. */
function iconEl(id) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 20 20");
  s.setAttribute("width", "20"); s.setAttribute("height", "20");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.6");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[id] || "";
  return s;
}

/** The hover card. Every strip button would otherwise need a `title=`, which
 *  cannot carry the shortcut on its own line, waits half a second before it
 *  appears, and cannot be styled — and a bar of unlabelled glyphs lives or
 *  dies on how good its tooltip is. */
const TIP = (() => {
  let el = null;
  const box = () => (el || (el = document.getElementById("tip")));
  function show(anchor, label, hint, key) {
    const t = box();
    t.textContent = "";
    const b = document.createElement("b"); b.textContent = label; t.appendChild(b);
    if (hint) { const s = document.createElement("span"); s.textContent = hint; t.appendChild(s); }
    if (key) { const k = document.createElement("kbd"); k.textContent = key; t.appendChild(k); }
    t.classList.add("show");
    const r = anchor.getBoundingClientRect(), w = t.offsetWidth;
    t.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    t.style.top = (r.bottom + 8) + "px";
  }
  function hide() { if (el) el.classList.remove("show"); }
  /** Whether this machine has a pointer that can hover at all. */
  function hoverable() {
    return !(window.matchMedia && matchMedia("(hover: none)").matches);
  }
  return { show, hide, hoverable };
})();

/** The colour key — and the field picker, because they are the same question.
 *
 *  The seven colourings existed long before anything on screen said which one
 *  was up, over what range, or in what units; a screenshot pasted into a
 *  worksheet therefore carried no statement of what it showed. Worse, the
 *  default Water view is a TWO-variable encoding — hue from submergence,
 *  brightness added from speed — so "dark blue" was ambiguous between deep and
 *  fast and nothing said so.
 *
 *  The card is built from FIELDS, so a field cannot be added without its
 *  legend arriving with it, and its bar is painted from `Shaders.RAMPS` — the
 *  same five stops the water is painted with. */
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
    // Live / Average. Both go through setAverage, which is the single writer:
    // it has to open and release the accumulators, so the flag alone is not
    // the mode. Clicking the state you are already in does nothing rather
    // than restarting the window, which would silently throw the reading away.
    document.getElementById("legLive").onclick = (e) => {
      e.target.blur(); if (state.avg) setAverage(false);
    };
    document.getElementById("legAvgOn").onclick = (e) => {
      e.target.blur(); if (!state.avg) setAverage(true);
    };
    // The whole card is the handle, not its header: the header IS a button
    // (the field picker) and dragWindow correctly refuses to start a drag on
    // one, so using it as the handle meant nothing ever moved. Everything
    // interactive on the card -- the picker, Fit, scene, the mode buttons, the
    // editable range numbers -- is excluded by dragWindow's own guard.
    dragWindow(el(), el(), () => {
      // First drag takes the position over: .placed drops the `right` anchor
      // in the stylesheet so the inline left/top wins, and the card stops
      // following the Controls panel. Same bargain as the vertical
      // exaggeration -- fitted until somebody sets it by hand, then theirs.
      state.legendPlaced = true;
      el().classList.add("placed");
    });
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
        e.stopPropagation();      // the app's one-key shortcuts are not for a text box
      });
    });
    el().classList.toggle("open", open);
    sync();
  }

  /** A typed end of the range. A pair that is not strictly increasing divides
   *  by zero in the shader's mapping, so it is refused rather than clamped —
   *  the box simply goes back to what it was showing. */
  function commit(k, text) {
    const f = fieldFor(state.mode), r = rangeFor(f.id).slice();
    const v = parseFloat(String(text).replace(/[^\d.eE+-]/g, ""));
    if (isFinite(v)) { r[k] = v; if (r[1] > r[0]) state.range[f.id] = r; }
    sync();
  }

  /** Rescale to the frame this was clicked on, and then hold. */
  function fit() {
    const f = fieldFor(state.mode);
    // Fit to what is PAINTED: under Average that is the mean state, whose
    // range is the narrower of the two.
    const s = SIM.fieldStats(state.mode, measuringAvg());
    if (!s) {
      showToast("Nothing to fit",
                "No wet cells on screen yet — pour some water in first.");
      return;
    }
    if (f.mid !== undefined) {
      // A diverging ramp keeps its centre: Fr = 1 and ω = 0 are physics, not
      // the midpoint of whatever the reading happened to be.
      const m = Math.max(f.mid - s.lo, s.hi - f.mid, 1e-6);
      state.range[f.id] = [f.mid - m, f.mid + m];
    } else {
      state.range[f.id] = [Math.min(0, s.lo), Math.max(s.hi, s.lo + 1e-3)];
    }
    sync();
  }

  /** Repaint from live state. Cheap enough to call from the panel, the G key
   *  and every open or close. */
  function sync() {
    if (!el()) return;
    const live = document.getElementById("legLive");
    const avgb = document.getElementById("legAvgOn");
    if (live && avgb) {
      // aria-pressed is what the stylesheet paints from, so the button that is
      // lit and the mode that is running are the same fact.
      live.setAttribute("aria-pressed", String(!state.avg));
      avgb.setAttribute("aria-pressed", String(!!state.avg));
    }
    const f = fieldFor(state.mode), r = rangeFor(f.id);
    document.getElementById("legName").textContent = f.name;
    document.getElementById("legSym").textContent = f.sym;
    document.getElementById("legUnit").textContent = f.unit;
    document.getElementById("legLo").textContent = fmtNum(r[0]);
    document.getElementById("legHi").textContent = fmtNum(r[1]);
    const bars = document.getElementById("legBars");
    bars.textContent = "";
    if (f.id === "water") {
      // TWO variables, and the card has to say so: a reader told only "blue"
      // cannot tell deep water from fast water. The right-hand word is which
      // CHANNEL of the colour carries it, which is the part nothing said.
      bars.appendChild(row(RAMP_CSS.water(), "depth below surface", "hue"));
      bars.appendChild(row("linear-gradient(to right, rgba(255,255,255,0.05), rgba(255,255,255,0.55))",
                           "speed, 0 – " + fmtNum(vmaxFor()) + " m/s", "brightness"));
    } else {
      // The numbers are on the foot row, where they can be typed into; the
      // caption carries the symbol so the bar is not an anonymous smear.
      bars.appendChild(row(RAMP_CSS[f.ramp](), f.sym || f.name,
                           f.mid !== undefined ? "pale = " + f.sym + " " + f.mid : ""));
    }
    const b = document.getElementById("legendBtn");
    if (b) b.classList.toggle("on", open);
    // What THIS field becomes under Average. §6: only (f̄, û, ŵ, p̄) is stored,
    // so H, Fr, |u| and ρu|u| are fields OF the mean flow and the reader has
    // to be told, or H̃ gets read as a time-averaged energy head.
    el().classList.toggle("avg", !!state.avg);
    const what = document.getElementById("legAvgWhat");
    if (what) put(what, state.avg ? (f.mean || "") : "");
    if (menuOpen) renderMenu();
  }

  /** Only when it moved. At 60 fps an unconditional textContent write is a
   *  layout every frame for a number that changes in the second decimal. */
  function put(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  let probeTick2 = 0, hov = null;      // the cursor probe's own 1-in-3 throttle
  /** The Average block's live half: the elapsed window, and what the mean
   *  reads under the cursor. Called once per frame while Average is up and
   *  never otherwise, from `tickFrame`, which already holds the mean columns.
   *
   *  δ_a = η̄ − (z_b + d̄) is the reconciliation §7.3 asks for. The line is
   *  drawn at η̄ because that is where the visible surface stood on average;
   *  the depth reported is d̄, an integral. In an aerated or intermittently
   *  connected column those are not the same number, and printing the gap is
   *  what stops one of them reading as a fault in the other. σ_η comes from
   *  the column accumulator's Welford moment and is the excursion band's
   *  independent estimate (§7.3). */
  function avgTick(avgCols) {
    const t = document.getElementById("legAvgT");
    if (!t) return;
    put(t, "T = " + SIM.avgT().toFixed(2) + " s");
    const r = document.getElementById("legAvgRead");
    if (!state.inside || !avgCols) { put(r, "— hover the water for the averaged column"); return; }
    const C = avgCols.C;
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(state.cursor[0] / sim.dx)));
    const dBar = C[i * 4 + 1];
    const da = RECON.aerationGap(C[i * 4 + 3], C[i * 4], dBar);
    // One readPixels sync, on the same 1-in-3 throttle the live hover readout
    // uses and for the same reason: this is a number a reader looks at, not
    // one anything is computed from, and a sync every frame puts the loop on
    // the GPU's critical path for the third decimal of f̄.
    if (--probeTick2 <= 0) { probeTick2 = 3; hov = SIM.avgProbe(state.cursor[0], state.cursor[1]); }
    // Plain words, not decorated symbols: the card is the interface, and a
    // student should not need the notation register to read it. The doc keeps
    // the accurate names (docs/averaging.md §7.3).
    const p = hov;
    put(r, "fill " + (p ? p.fbar.toFixed(2) : "—") +
           "  depth " + dBar.toFixed(3) + " m" +
           "  gap " + (da < 0 ? "−" : "+") + (Math.abs(da) * 1000).toFixed(0) + " mm" +
           "  spread " + (avgCols.sigma[i] * 1000).toFixed(0) + " mm");
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

  /** Three figures that read, without exponent soup on a 0.0004 range. */
  function fmtNum(v) {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(0)
         : a >= 1 ? v.toFixed(2)
         : a >= 0.01 ? v.toFixed(3)
         : v === 0 ? "0" : v.toExponential(1);
  }

  function renderMenu() {
    const m = menu();
    m.textContent = "";
    UIMODE.fields().forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "legopt" + (f.mode === state.mode ? " on" : "");
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
    m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, a.bottom + 6)) + "px";
  }
  function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }
  function openMenu() {
    menuOpen = true; menu().classList.add("open");
    document.getElementById("legPick").classList.add("open");
    renderMenu();
  }
  function closeMenu() {
    menuOpen = false;
    if (menu()) menu().classList.remove("open");
    const p = document.getElementById("legPick");
    if (p) p.classList.remove("open");
  }
  function onDown(e) {
    if (!menuOpen) return;
    if (menu().contains(e.target)) return;
    if (document.getElementById("legPick").contains(e.target)) return;
    closeMenu();
  }

  function setOpen(v) {
    open = v;
    if (el()) el().classList.toggle("open", open);
    closeMenu();
    sync();
    syncToolbar();
  }
  return { build, sync, fit, onDown, avgTick,
           isOpen: () => open,
           open: () => setOpen(true),
           close: () => setOpen(false),
           toggle: () => setOpen(!open) };
})();

/** What of the interface an exercise wants in front of a student.
 *
 *  The strip's families are what makes this expressible at all: "no build
 *  tools, these two instruments" is one line because there is now a name for
 *  each of those things. Most of the data was already in the pack — an entry's
 *  `instruments` list has always been a statement of the tools that exercise
 *  needs, and `studentControls` has always known which panel controls belong
 *  to the student — so a profile is largely a matter of reading what the pack
 *  already says.
 *
 *  A profile is NEVER a cage. `⋯ Show everything` puts the lot back in one
 *  click, and the standing acceptance test — the sandbox must be able to
 *  reproduce any scene by hand — is why it has to. */
const UIMODE = (() => {
  const BUILD_TOOLS = ["wall", "erase", "valve", "spout", "pour"];

  function full() {
    return { build: true, measure: true, view: true, fields: true,
             legend: true, panel: "full",
             readouts: { gauges: true, cursor: true, status: true },
             lifted: false };
  }

  /** The profile an exercise gets when it does not spell one out, plus
   *  whatever it does spell out on top. An exercise that lists no instruments
   *  keeps every instrument: one that does not say cannot be second-guessed. */
  function fromExercise(ex) {
    const p = full();
    if (!ex) return p;
    const tools = (ex.instruments || []).map((i) => i.tool).filter(Boolean);
    if (tools.length) {
      const measure = tools.filter((t) => BUILD_TOOLS.indexOf(t) < 0);
      const build = tools.filter((t) => BUILD_TOOLS.indexOf(t) >= 0);
      p.measure = measure.length ? measure : false;
      p.build = build.length ? build : false;
    } else {
      p.build = false;             // an exercise arrives with its rig already built
    }
    p.panel = "focused";
    return Object.assign(p, ex.ui || {});
  }

  /** Is this item allowed? A family's entry is `true` (everything), `false`
   *  (nothing) or the ids that survive. Tools are matched on the tool id, and
   *  anything else on its button id, so a profile can name `legendBtn` as
   *  readily as `gauge`. */
  function allows(family, it) {
    const u = state.ui || full();
    if (u.lifted) return true;
    const list = u[family];
    if (list === undefined || list === true) return true;
    if (list === false) return false;
    return list.indexOf(it.tool) >= 0 || list.indexOf(it.id) >= 0;
  }

  /** Whether anything at all is hidden — what puts ⋯ on the strip. */
  function narrowed() {
    const u = state.ui;
    if (!u || u.lifted) return false;
    return ["build", "measure", "view"].some((f) => u[f] !== true) ||
           u.fields !== true || u.panel !== "full" || u.legend !== true ||
           Object.keys(u.readouts || {}).some((k) => u.readouts[k] === false);
  }

  function apply(profile) {
    state.ui = Object.assign(full(), profile || {});
    if (state.ui.legend === false) LEGEND.close(); else LEGEND.open();
    // A profile that hides the live field would leave the legend naming
    // something its own picker cannot reach, so the field moves to the first
    // one the profile does offer.
    if (Array.isArray(state.ui.fields) && state.ui.fields.length &&
        state.ui.fields.indexOf(fieldFor(state.mode).id) < 0) {
      const f = FIELDS.find((q) => q.id === state.ui.fields[0]);
      if (f) state.mode = f.mode;
    }
    buildToolbar();
    LEGEND.sync();
    syncPanel();
  }
  function lift() {
    if (!state.ui) state.ui = full();
    state.ui.lifted = true;
    buildToolbar(); LEGEND.sync(); syncPanel();
  }
  function reset() { apply(full()); }

  /** The fields the picker offers — the whole registry unless narrowed. */
  function fields() {
    const u = state.ui;
    if (!u || u.lifted || !Array.isArray(u.fields)) return FIELDS;
    return FIELDS.filter((f) => u.fields.indexOf(f.id) >= 0);
  }

  /** Is this on-canvas readout wanted? Gauge cards, the hovering cursor
   *  readout and the status line have no toggle of their own; the profile
   *  labels, jump boxes and channel overlay stay with `viewParams`, which
   *  already sets them — two ways to say the same thing is how they come to
   *  disagree. */
  /** Which rows the hover card should print: the ids an exercise named, or
   *  null for OVERLAY's own default set. A profile writes them under readouts,
   *  beside the three whole-panel switches, because they answer the same
   *  question at a finer grain -- what of the numbers a student meets:
   *
   *      ui: { readouts: { rows: ["pos", "d", "q", "Sf"] } }
   *
   *  An unknown id is not silently dropped here; check_pack.py fails the pack
   *  over it, which is the only place that can catch a typo before a lecture. */
  function rows() {
    const u = state.ui;
    if (!u || u.lifted || !u.readouts || !Array.isArray(u.readouts.rows)) return null;
    return u.readouts.rows;
  }

  function shows(what) {
    const u = state.ui;
    if (!u || u.lifted || !u.readouts) return true;
    return u.readouts[what] !== false;
  }

  return { full, fromExercise, apply, lift, reset, allows, narrowed, fields, shows, rows };
})();

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

/** A blank flume, from wherever you are. This is the sandbox's "new document":
 *  `switchScene` already rebuilds the grid, drops the drawing and resets every
 *  session knob, so the whole job here is refusing to do it silently. A drawn
 *  rig gets one press to think about it — the same bargain the scene menu's
 *  inline warning strikes, in the space a strip button has. */
let newArmed = 0;
function newSandbox() {
  const n = sim && sim.segs ? sim.segs.length : 0;
  const sandbox = state.scene && state.scene.id === "sandbox";
  if (n && performance.now() - newArmed > 4000) {
    newArmed = performance.now();
    showToast("Press again to start over",
      "That clears the " + n + " segment" + (n === 1 ? "" : "s") + " you have drawn" +
      (sandbox ? "" : " and leaves " + state.scene.name) +
      ". Save it first with Controls → Rig → ⇪ Share link.");
    return;
  }
  newArmed = 0;
  EX.clear();
  switchScene("sandbox");     // announces itself — `loadScene` toasts the blurb
}

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
 *  averaging toggle and streamlines will belong there rather than among the
 *  instruments.
 *
 *  `id` is set on the button where another module already looks one up by
 *  name (PICKER and EX light their own opener). */
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
    toolItems("wall", "erase", "valve", "spout", "pour").concat(
      [{ id: "undoBtn", icon: "undo", label: "Undo", key: "Z",
         hint: "Take back the last thing you drew",
         act: () => SIM.undoSeg() },
       { id: "clearBtn", icon: "clear", label: "Clear drawing", key: "C",
         hint: "Remove every segment you have drawn — the scene stays",
         act: () => SIM.clearSegs() }]) },
  { cap: "MEASURE", family: "measure",
    items: toolItems("gauge", "rake", "tracer", "measure", "cv", "flux", "force") },
  // VIEW: how the water is DRAWN. The three toggles were reachable only from
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
      hint: "Dye and the dye timelines injected at the inlet",
      on: () => state.dye,
      act: () => { state.dye = !state.dye; syncPanel(); } },
    { id: "chanBtn", icon: "channel", label: "Open-channel overlay", key: "N",
      hint: "Critical depth, normal depth and the energy grade line",
      on: () => state.channel,
      act: () => { state.channel = !state.channel; syncPanel(); } },
    { id: "gradeBtn", icon: "channel", label: "Grade lines", key: "",
      hint: "Energy and hydraulic grade lines — the gap between them is the velocity head",
      on: () => state.grade,
      act: () => { state.grade = !state.grade; syncPanel(); } },
    // VIEW and not MEASURE, deliberately, although it is the one toggle here
    // that changes what the numbers say: it changes how the water is DRAWN,
    // and everything else follows the picture — the overlay, the instruments
    // and the particle tracers all read the averaged flow while the window is
    // open (docs/averaging.md §3), because a screenshot that mixed a mean
    // field with live markers would carry two flow states at once.
    { id: "avgBtn", icon: "average", label: "Average", key: "A",
      hint: "Time-average the flow — the field and every reading over one window",
      on: () => state.avg,
      act: () => setAverage(!state.avg) },
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
    // The other way round would light on almost every boot: a scene without an
    // explicit `valveOpen` starts shut, valve drawn or not.
    { id: "valveBtn", icon: "valve", label: "Valves", key: "V",
      hint: "Open or slam every valve you have drawn",
      on: () => !!sim && sim.p.valveClosed < 0.5, act: () => toggleValve() },
  ] },
  // Chrome, not a family: captioning it would put it in the same taxonomy as
  // the four above, which is exactly what it is not.
  { cap: "", family: "meta", items: [
    { id: "panelBtn", icon: "sliders", label: "Controls",
      hint: "Every slider: flow, boundaries, hydraulics, view, rig",
      act: () => togglePanel() },
    { id: "keysBtn", icon: "keys", label: "Keyboard", key: "?",
      hint: "The shortcut sheet",
      act: (b) => KEYS.toggle(b) },
    { id: "aboutBtn", icon: "about", label: "About the solver",
      hint: "What is actually being computed — the numerics, and the rest of the documentation",
      act: () => window.open(aboutHref(), "_blank", "noopener") },
  ] },
];

/** A drawing / instrument tool as a strip item. Its shortcut is its position
 *  in TOOLS, which is exactly what the number keys do. */
/** Strip items for the named tools, in the order given. The strip's ORDER is
 *  not the TOOLS order: TOOLS is the digit order, which is fixed by every
 *  worksheet ever printed, so a new tool is appended there and placed here. */
function toolItems(...ids) {
  return ids.map((id) => toolItem(TOOLS.find((t) => t[0] === id)));
}

/** Which strip family a tool belongs to — asked by the digit keys, so that a
 *  hidden tool's key can say WHICH family is off.
 *
 *  The TOOLBAR spec above is the single authority, and this reads it. The key
 *  handler used to recompute the answer positionally — `TOOLS.slice(0, 4)`
 *  plus `TOOLS[TOOLS.length - 1]` — which meant "the four drawing tools, and
 *  Pour" on the day it was written. Then Flux was appended eleventh and the
 *  expression silently changed its mind: it began calling Flux a build tool
 *  and Pour a measuring one. Nothing broke, because neither has a digit
 *  (TOOL_KEYS caps at 9) — but a field is described once, and this is where. */
function familyOf(toolId) {
  const g = TOOLBAR.find((grp) => (grp.items || []).some((it) => it.tool === toolId));
  return g ? g.family : "measure";
}

function toolItem([id, label, tip]) {
  const n = TOOLS.findIndex((t) => t[0] === id) + 1;
  // `tool` is the item's own name for the thing it arms, and it is what a UI
  // profile names — an exercise says `measure: ["gauge"]`, not "Gauge".
  return { tool: id, icon: id === "valve" ? "gate" : id, label, hint: tip,
           key: n <= TOOL_KEYS ? String(n) : "",
           on: () => state.tool === id,
           act: () => { state.tool = id; syncToolbar(); syncPanel(); } };
}

/** On the Pages build Jekyll renders numerics.md to numerics.html (it is not
 *  README.md, so jekyll-readme-index does not make it a folder index) and does
 *  NOT publish the .md source, so the reader below has nothing to fetch there
 *  — the themed page is the right answer.
 *
 *  Everywhere else the browser used to be handed raw markdown, which is not a
 *  document so much as its source code. `docs/view.html` renders it in the
 *  app's own clothes instead. */
function aboutHref() {
  return /\.github\.io$/i.test(location.hostname)
    ? "docs/numerics.html"
    : "docs/view.html?doc=numerics.md";
}

function buildToolbar() {
  const host = document.getElementById("groups");
  host.textContent = "";
  TOOLBAR.forEach((group) => {
    // A profile can empty a family altogether. An empty captioned column would
    // read as a family with nothing in it, so the group goes with its last
    // button — and the rule keys off what has actually been appended, or a
    // hidden first group leaves a leading hairline.
    const items = group.items.filter((it) => UIMODE.allows(group.family, it));
    if (!items.length) return;
    if (host.children.length) {
      const s = document.createElement("div"); s.className = "tsep"; host.appendChild(s);
    }
    // A group is a captioned COLUMN: the caption names the family, the row
    // holds the glyphs. The caption is aria-hidden — every button already
    // carries its own label, and a screen reader does not need the heading
    // read out once per button.
    const g = document.createElement("div");
    g.className = "tgrp fam-" + group.family;
    const cap = document.createElement("div");
    cap.className = "tcap"; cap.textContent = group.cap;
    cap.setAttribute("aria-hidden", "true");
    g.appendChild(cap);
    const row = document.createElement("div"); row.className = "trow";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tbtn";
      if (it.id) b.id = it.id;
      b.dataset.icon = "";
      const label = typeof it.label === "function" ? it.label() : it.label;
      b.setAttribute("aria-label", label);
      b.appendChild(iconEl(typeof it.icon === "function" ? it.icon() : it.icon));
      const tip = () => TIP.show(b, typeof it.label === "function" ? it.label() : it.label,
                                 it.hint, it.key);
      b.onclick = () => { b.blur(); TIP.hide(); it.act(b); syncToolbar(); };
      // Only a pointer that can hover gets the card. On a touch screen there
      // is no hover to leave, so it would appear on the tap that presses the
      // button and then sit there over the water until something else was
      // tapped.
      b.onpointerenter = (e) => { if (e.pointerType !== "touch") tip(); };
      b.onpointerleave = () => TIP.hide();
      b.onfocus = () => { if (TIP.hoverable()) tip(); };
      b.onblur = () => TIP.hide();
      it.el = b;
      row.appendChild(b);
    });
    g.appendChild(row);
    host.appendChild(g);
  });
  if (UIMODE.narrowed()) host.appendChild(showAllGroup());
  syncToolbar();
  fitBar();
}

/** The way back out of a profile. It exists whenever anything is hidden, and
 *  it is the reason a profile is allowed to hide anything at all: the sandbox
 *  must be able to reproduce any scene by hand, and a narrowing that could not
 *  be lifted would break that outright. */
function showAllGroup() {
  const g = document.createElement("div"); g.className = "tgrp fam-meta";
  const cap = document.createElement("div");
  cap.className = "tcap"; cap.textContent = ""; cap.setAttribute("aria-hidden", "true");
  const row = document.createElement("div"); row.className = "trow";
  const b = document.createElement("button");
  b.type = "button"; b.className = "tbtn"; b.id = "showAllBtn";
  b.setAttribute("aria-label", "Show everything");
  b.appendChild(iconEl("all"));
  b.onclick = () => {
    b.blur(); TIP.hide(); UIMODE.lift();
    showToast("Every control is back",
              "This exercise had narrowed the interface. Pick it again to get its focus back.");
  };
  b.onpointerenter = (e) => {
    if (e.pointerType !== "touch") {
      TIP.show(b, "Show everything",
               "This exercise hides some controls — this brings them all back", "");
    }
  };
  b.onpointerleave = () => TIP.hide();
  row.appendChild(b); g.appendChild(cap); g.appendChild(row);
  return g;
}

/** Fit the strip to the width it actually has. A media query cannot do this:
 *  the side panel takes its width out of the bar as well, so a 1440 px window
 *  with the panel open has the room of an 1100 px one. Three steps — the
 *  family captions and the wordmark go, then the status line, then the icons
 *  shrink again and the group rules go with them — and if even that is not
 *  enough the groups scroll rather than losing a control. */
function fitBar() {
  const bar = document.getElementById("bar"), g = document.getElementById("groups");
  if (!bar || !g) return;
  // One pixel of slack, and no more: flex lays out in fractions, so an exactly
  // fitting strip can report a scrollWidth a pixel over its client width and
  // would otherwise shrink itself for nothing. Two pixels of slack is already
  // too much — it leaves the last button clipped along its edge.
  const over = () => g.scrollWidth > g.clientWidth + 1;
  bar.classList.remove("tight", "tighter", "tightest");
  if (over()) bar.classList.add("tight");
  if (over()) bar.classList.add("tighter");
  if (over()) bar.classList.add("tightest");
  // Still too many for the room: the groups scroll, and the last one visible
  // is faded so that it looks like it continues rather than like it ends.
  bar.classList.toggle("scrolls", over());
}

/** Repaint the strip from live state. Cheap enough to call from anywhere that
 *  changes a tool, the clock or a valve; the icon only touches the DOM when it
 *  actually differs, because the play/pause glyph swaps on every space bar. */
function syncToolbar() {
  TOOLBAR.forEach((group) => group.items.forEach((it) => {
    const b = it.el;
    if (!b || !b.isConnected) return;
    if (it.on) b.classList.toggle("on", !!it.on());
    if (it.hot) b.classList.toggle("hot", !!it.hot());
    if (typeof it.icon === "function") {
      const want = it.icon();
      if (b.dataset.icon !== want) {
        b.dataset.icon = want;
        b.textContent = ""; b.appendChild(iconEl(want));
        b.setAttribute("aria-label", typeof it.label === "function" ? it.label() : it.label);
      }
    }
  }));
}

// ========================================================== keyboard sheet
/** The old always-on key legend in the corner, folded into a popover. It was
 *  six lines of chrome sitting on the water for the 99% of a session that
 *  nobody is looking up a shortcut. */
const KEYS = (() => {
  let el = null, anchor = null;
  const LINES = [
    ["left-drag", "draw with the current tool"],
    ["right-drag", "pour water, whatever tool is in your hand"],
    ["shift", "snap to horizontal / vertical / 45°"],
    ["wheel", "zoom"],
    ["middle-drag", "pan"],
    ["0", "reset the view"],
    ["1 – 9", "pick a tool (Pour has no digit — right-drag instead)"],
    ["[ ]", "brush size"],
    ["Z", "undo a stroke"],
    ["C", "clear the drawing"],
    ["V", "valves"],
    ["space", "pause"],
    ["R", "reset the water"],
    ["G", "cycle the field (the legend names it)"],
    ["L", "the legend — which field, over what range, in what units"],
    ["B", "what the Control volume reads on each edge: Q / momentum / energy"],
    ["P", "particles"],
    ["D", "dye"],
    ["N", "open-channel overlay"],
    ["A", "average the flow — the mean field, over one window"],
    ["M", "ruler"],
    ["S", "scenes"],
    ["E", "exercises"],
    ["H", "the start screen"],
  ];
  const menu = () => (el || (el = document.getElementById("keysmenu")));
  const isOpen = () => !!(el && el.classList.contains("open"));
  function render() {
    const m = menu();
    m.textContent = "";
    const head = document.createElement("div");
    head.className = "smh";
    const b = document.createElement("b"); b.textContent = "Keyboard";
    const i = document.createElement("i"); i.textContent = "Esc closes";
    head.appendChild(b); head.appendChild(i);
    m.appendChild(head);
    LINES.forEach(([k, what]) => {
      const r = document.createElement("div"); r.className = "kline";
      const kb = document.createElement("kbd"); kb.textContent = k;
      const s = document.createElement("span"); s.textContent = what;
      r.appendChild(kb); r.appendChild(s);
      m.appendChild(r);
    });
  }
  function place() {
    const m = menu();
    const a = anchor && anchor.isConnected ? anchor : document.getElementById("keysBtn");
    if (!a) return;
    const r = a.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 8)) + "px";
  }
  function open(a) {
    PICKER.close(); EX.close();
    anchor = a || document.getElementById("keysBtn");
    render(); menu().classList.add("open"); place();
    const b = document.getElementById("keysBtn");
    if (b) b.classList.add("active");
  }
  function close() {
    if (el) el.classList.remove("open");
    const b = document.getElementById("keysBtn");
    if (b) b.classList.remove("active");
  }
  function toggle(a) { if (isOpen()) close(); else open(a); }
  function onDown(e) {
    if (!isOpen()) return;
    if (menu().contains(e.target)) return;
    if (anchor && anchor.contains && anchor.contains(e.target)) return;
    close();
    if (e.target === canvas) { e.preventDefault(); e.stopPropagation(); }
  }
  return { open, close, toggle, isOpen, place, onDown };
})();

// ============================================================= side panel
/** The dock: a panel down the right-hand edge that the VIEWPORT gives way to,
 *  rather than one that sits on top of it. Opening it sets `--dock`, and both
 *  canvases are inset by that in the stylesheet, so nothing is ever drawn
 *  underneath the panel and `computeView` — which runs every frame off
 *  `canvas.clientWidth` — re-letterboxes the domain into what is left with no
 *  further help.
 *
 *  Under `MINW` there is no width to give away, so the panel goes back to
 *  overlaying and the water keeps the whole window. Folding parks it as a tab
 *  on the window edge: the exercise stays loaded, the screen goes back to
 *  being all water, and one click brings the brief back. */
const DOCK = (() => {
  // MINW: below this there is no width to give away, so the panel overlays.
  // PHONE: below THIS a 348 px panel would cover almost the whole screen, so
  // it becomes a bottom sheet instead — the water keeps the top of the screen,
  // which on a phone is the only part tall enough to read a flume in.
  const W = 348, MINW = 900, PHONE = 620;
  let shown = false, folded = false, kind = "Exercise", id = "";
  const el = () => document.getElementById("dock");
  const body = () => el().querySelector(".dock-body");
  const foot = () => el().querySelector(".dock-foot");

  function narrow() { return innerWidth < MINW; }
  function phone() { return innerWidth < PHONE; }
  /** Must agree with `--sheet-h` in the stylesheet. */
  function sheetH() { return Math.round(Math.min(0.58 * innerHeight, 520)); }
  function sync() {
    const open = shown && !folded;
    el().classList.toggle("open", open);
    el().classList.toggle("over", narrow());
    el().classList.toggle("sheet", phone());
    // A side panel takes WIDTH out of the viewport; the same panel as a bottom
    // sheet takes HEIGHT. Either way the water is drawn in what is left, never
    // behind the panel — otherwise the domain centres itself on a canvas whose
    // lower half nobody can see.
    const root = document.documentElement.style;
    root.setProperty("--dock", (open && !narrow() && !phone()) ? W + "px" : "0px");
    root.setProperty("--dockb", (open && phone()) ? sheetH() + "px" : "0px");
    fitBar();                    // the panel takes its width out of the strip
    applyAutoVex();              // …and out of what "fills the window" means
    el().querySelector(".dock-h .eid").textContent = id;
    el().querySelector(".dock-h .kind").textContent = kind;
    const fold = document.getElementById("dockfold");
    const tab = document.getElementById("docktab");
    fold.classList.toggle("show", open);
    tab.classList.toggle("show", shown && folded);
    tab.querySelector(".eid").textContent = id;
    tab.querySelector(".kind").textContent = kind.toLowerCase();
  }
  /** Show the panel with a header. `onClose` is what the × does — the caller
   *  owns what closing MEANS (an exercise stays loaded; only its brief goes). */
  function show(k, i) { kind = k || "Exercise"; id = i || ""; shown = true; folded = false; sync(); }
  /** Rename what is in the panel without touching whether it is open — a
   *  content refresh must not undo a fold. */
  function label(k, i) { kind = k || kind; id = i === undefined ? id : i; sync(); }
  function hide() { shown = false; folded = false; sync(); }
  function fold(v) { folded = v === undefined ? !folded : !!v; sync(); }
  function isShown() { return shown; }
  function isOpen() { return shown && !folded; }
  return { show, label, hide, fold, sync, isShown, isOpen,
           get body() { return body(); }, get foot() { return foot(); } };
})();

// ============================================================ start screen
/** What the app opens on. This is a teaching tool before it is a sandbox, so
 *  the teaching pack is the front door and the sandbox is a card beside it —
 *  not a blank flume you have to know to leave. The simulation keeps running
 *  dimmed behind the screen, so the thing is visibly alive before anything is
 *  chosen.
 *
 *  It is skipped entirely by `?scene=`, `?ex=` and `#rig=`, which is the whole
 *  contract with the lecture slides: a permalink lands where it always did. */
const START = (() => {
  let filter = "", built = false;
  const el = () => document.getElementById("start");
  const isOpen = () => el().classList.contains("open");

  const DOORS = [
    { cls: "primary", icon: "wall", title: "Open the sandbox",
      text: "A blank flume. Draw walls, pour water and plumb your own rig — " +
            "everything an exercise sets up, you can build by hand.",
      act: () => { close(); newSandbox(); } },
    { icon: "scenes", title: "Scenes",
      text: "Ready-made flumes, tanks and pipe runs — the geometry without the worksheet.",
      act: () => { close(); PICKER.open(document.getElementById("sceneBtn")); } },
    { icon: "sliders", title: "Controls",
      text: "Every slider behind the picture: flow, boundaries, hydraulics, and the rig " +
            "you can save or share as a link.",
      act: () => { close(); setPanel(true); } },
  ];

  function buildSide() {
    const host = document.getElementById("startside");
    host.textContent = "";
    DOORS.forEach((d) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "startcard glass" + (d.cls ? " " + d.cls : "");
      const r = document.createElement("div"); r.className = "r";
      const ic = iconEl(d.icon); ic.setAttribute("width", "20"); ic.setAttribute("height", "20");
      const t = document.createElement("b"); t.textContent = d.title;
      const go = document.createElement("span"); go.className = "go"; go.textContent = "›";
      r.appendChild(ic); r.appendChild(t); r.appendChild(go);
      const p = document.createElement("p"); p.textContent = d.text;
      b.appendChild(r); b.appendChild(p);
      b.onclick = () => { b.blur(); d.act(); };
      host.appendChild(b);
    });
  }

  /** The pack, grouped by the register's own `topic` in register order — the
   *  same grouping the exercise menu uses, so the two never disagree. */
  function grouped() {
    const order = [], by = new Map(), f = foldText(filter.trim());
    EX.all().forEach((e) => {
      if (f && !foldText(e.id + " " + e.title + " " + (e.topic || "") + " " + e.scene + " " +
                         (e.start || "")).includes(f)) return;
      const g = e.topic || "Other";
      if (!by.has(g)) { by.set(g, []); order.push(g); }
      by.get(g).push(e);
    });
    return order.map((g) => [g, by.get(g)]);
  }

  function renderList() {
    const host = document.getElementById("startlist");
    host.textContent = "";
    const n = EX.all().length;
    document.getElementById("startcount").textContent =
      n ? n + " verified demos" : "pack not loaded";
    if (!n) {
      const d = document.createElement("div");
      d.className = "none";
      d.textContent = "js/exercises.js is not loaded — the teaching pack is optional data, " +
        "and the sandbox and the scenes work without it.";
      host.appendChild(d);
      return;
    }
    const groups = grouped();
    if (!groups.length) {
      const d = document.createElement("div");
      d.className = "none"; d.textContent = "nothing matches “" + filter + "”.";
      host.appendChild(d);
      return;
    }
    // Balance the topics across two columns by their line count (a heading
    // plus its rows), filling whichever column is currently shorter. Register
    // order is preserved down each column, which is what someone scanning for
    // "the jump one" is reading against.
    const cols = [document.createElement("div"), document.createElement("div")];
    const h = [0, 0];
    cols.forEach((c) => { c.className = "col"; host.appendChild(c); });
    groups.forEach(([g, list]) => {
      const box = document.createElement("div"); box.className = "g";
      const hd = document.createElement("div"); hd.className = "gh"; hd.textContent = g;
      box.appendChild(hd);
      list.forEach((e) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "si"; b.dataset.id = e.id;
        const i = document.createElement("span"); i.className = "eid"; i.textContent = e.id;
        const t = document.createElement("span"); t.className = "t"; t.textContent = e.title;
        b.appendChild(i); b.appendChild(t);
        b.onclick = () => { close(); EX.pick(e.id); };
        box.appendChild(b);
      });
      const k = h[0] <= h[1] ? 0 : 1;
      cols[k].appendChild(box);
      h[k] += list.length + 1.6;      // the heading and its margin cost ~1.6 rows
    });
  }

  function build() {
    if (built) return;
    built = true;
    buildSide();
    const f = document.getElementById("startfilter");
    f.oninput = () => { filter = f.value; renderList(); };
    f.onkeydown = (e) => {
      e.stopPropagation();                    // not the global shortcuts
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Enter") {
        const first = document.querySelector("#startlist .si");
        if (first) { e.preventDefault(); first.click(); }
      }
    };
    document.getElementById("startabout").href = aboutHref();
  }

  function open() {
    build(); renderList();
    el().classList.add("open");
    PICKER.close(); EX.close(); KEYS.close();
    const b = document.getElementById("homeBtn");
    if (b) b.classList.add("active");
    const f = document.getElementById("startfilter");
    if (f) setTimeout(() => f.focus(), 0);
  }
  function close() {
    el().classList.remove("open");
    const b = document.getElementById("homeBtn");
    if (b) b.classList.remove("active");
  }
  function toggle() { if (isOpen()) close(); else open(); }
  return { open, close, toggle, isOpen, renderList };
})();

function snap(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const a = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const r = Math.hypot(dx, dz);
  return [x0 + r * Math.cos(a), z0 + r * Math.sin(a)];
}

function pointerPx(e) {
  // Rect-relative → canvas-client units. The ratio is 1 in a plain browser;
  // it corrects for any ancestor CSS transform (embedded previews, kiosks).
  const r = canvas.getBoundingClientRect();
  const s = r.width > 0 ? canvas.clientWidth / r.width : 1;
  return [(e.clientX - r.left) * s, (e.clientY - r.top) * s];
}
function pointerPos(e) {
  const p = pointerPx(e);
  return view.toDomain(p[0], p[1]);
}

const pointers = new Map();          // active pointers, for pinch zoom

function onDown(e) {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  pointers.set(e.pointerId, pointerPx(e));
  const [x, z] = pointerPos(e);
  state.cursor = [x, z];
  if (pointers.size === 2) {         // second finger: abandon tools, pinch
    state.drag = null; state.spoutDrag = false; state.measDrag = null;
    state.cvDrag = null; state.fluxDrag = null;
    if (state.pour) { state.pour = null; sim.p.pour = null; }
    const ps = [...pointers.values()];
    state.pinch = { d: Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) };
    return;
  }
  if (e.button === 1) {              // middle-drag pans
    e.preventDefault();
    const px = pointerPx(e);
    state.panDrag = { px, c: state.panC ? state.panC.slice() : [sim.W / 2, sim.H / 2] };
    return;
  }
  // Drag in the empty letterbox band above or below the domain to stretch it
  // vertically. That band is dead space — nothing to draw on — so grabbing it
  // is unambiguous, and it is the natural place to reach for when a long flat
  // flume is squashed into a strip.
  {
    const B = baseRect(), py = pointerPx(e)[1];
    if (state.zoom < 1.001 && (py < B.by - 2 || py > B.by + B.h + 2)) {
      state.vexDrag = { py, vex: state.vex, mid: B.by + B.h / 2 };
      state.vexAuto = false;          // dragging the band claims the number
      return;
    }
  }
  // Pouring: a right-drag anywhere, or the Pour tool. The tool exists because
  // a touch screen has no second button and no Shift — the old
  // `pointerType === "touch" && e.shiftKey` was unreachable on every device it
  // named, which made half of "draw an edge, pour water" impossible on a
  // phone. Right-drag still works regardless of the tool in your hand.
  if (e.button === 2 || state.tool === "pour") {
    state.pour = { x, z, r: state.brush * 4, vx: 0, vz: sim.p.g > 0.5 ? -2.0 : 0, lx: x, lz: z };
    sim.p.pour = state.pour;
    return;
  }
  if (state.tool === "spout") {
    sim.p.source.x = x; sim.p.source.z = z; sim.p.source.on = 1;
    state.spoutDrag = true;
    syncPanel();
    return;
  }
  if (state.tool === "gauge") { placeGauge(x, z); return; }
  if (state.tool === "rake") { placeRake(x); return; }
  if (state.tool === "tracer") {
    // Click anywhere in the water to hang a fresh column of tracers there;
    // click on dry ground to clear them.
    seedTracers(x);
    syncPanel();
    return;
  }
  if (state.tool === "measure") {
    // A tape, not a wall: the drag never reaches SIM.addSeg. A bare click
    // (see onUp) clears the tape instead of leaving a zero-length one.
    state.measDrag = { x0: x, z0: z, x1: x, z1: z };
    return;
  }
  if (state.tool === "flux") {
    // Same bargain as every other instrument: a click on one takes it away, a
    // drag places a new one.
    if (removeFluxAt(x, z)) return;
    state.fluxDrag = { x0: x, z0: z, x1: x, z1: z };
    return;
  }
  if (state.tool === "cv") {
    // Same contract as the tape: a drag places the box, a bare click clears it.
    state.cvDrag = { x0: x, z0: z, x1: x, z1: z };
    return;
  }
  if (state.tool === "force") {
    // GRAB_PX is a screen tolerance; GEOM.faceAt wants domain metres, so it is
    // converted the same way removeFluxAt's nearSegment does — through the
    // view's horizontal px-per-metre, the same conversion placeRake uses for
    // its own single-axis pick.
    const hit = GEOM.faceAt(sim.solids || [], x, z, GRAB_PX * sim.W / view.w);
    if (!hit) { state.force = null; return; }
    if (state.force && state.force.solidId === hit.solid.id) {
      // Same solid again: cycle to its next named face.
      const ids = hit.solid.faces.map((fc) => fc.id);
      const k = (ids.indexOf(state.force.faceId) + 1) % ids.length;
      state.force = { solidId: hit.solid.id, faceId: ids[k], data: null, t0: sim.t };
    } else {
      state.force = { solidId: hit.solid.id, faceId: hit.faceId, data: null, t0: sim.t };
    }
    return;
  }
  state.drag = { x0: x, z0: z, x1: x, z1: z };
}

function onMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pointerPx(e));
  if (state.pinch && pointers.size === 2) {
    const ps = [...pointers.values()];
    const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
    if (d > 8 && state.pinch.d > 8) {
      zoomAt((ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2, d / state.pinch.d);
    }
    state.pinch.d = d;
    return;
  }
  if (state.vexDrag) {
    // Pull away from the middle to stretch, toward it to squash.
    const d = state.vexDrag, py = pointerPx(e)[1];
    const r0 = Math.max(Math.abs(d.py - d.mid), 8);
    const r1 = Math.max(Math.abs(py - d.mid), 8);
    state.vex = Math.max(1, Math.min(12, d.vex * (r1 / r0)));
    computeView();
    return;
  }
  const [x, z] = pointerPos(e);
  state.cursor = [x, z];
  state.inside = x >= 0 && z >= 0 && x <= sim.W && z <= sim.H;
  if (state.panDrag) {
    const px = pointerPx(e), d = state.panDrag;
    state.panC = [
      d.c[0] - (px[0] - d.px[0]) * sim.W / view.w,
      d.c[1] + (px[1] - d.px[1]) * sim.H / view.h,
    ];
    computeView();
    return;
  }
  if (state.spoutDrag) {
    sim.p.source.x = x; sim.p.source.z = z;
    return;
  }
  if (state.pour) {
    const dt = 1 / 60;
    state.pour.vx = Math.max(-6, Math.min(6, (x - state.pour.lx) / dt * 0.35));
    state.pour.vz = Math.max(-6, Math.min(6, (z - state.pour.lz) / dt * 0.35 + (sim.p.g > 0.5 ? -2 : 0)));
    state.pour.x = x; state.pour.z = z;
    state.pour.lx = x; state.pour.lz = z;
    state.pour.r = state.brush * 4;
    return;
  }
  if (state.measDrag) {
    const d = state.measDrag;
    if (e.shiftKey) { const s = snap(d.x0, d.z0, x, z); d.x1 = s[0]; d.z1 = s[1]; }
    else { d.x1 = x; d.z1 = z; }
    return;
  }
  if (state.fluxDrag) {
    const d = state.fluxDrag;
    if (e.shiftKey) { const s = snap(d.x0, d.z0, x, z); d.x1 = s[0]; d.z1 = s[1]; }
    else { d.x1 = x; d.z1 = z; }
    return;
  }
  if (state.cvDrag) {
    state.cvDrag.x1 = x; state.cvDrag.z1 = z;
    return;
  }
  if (state.drag) {
    if (e.shiftKey) { const s = snap(state.drag.x0, state.drag.z0, x, z); state.drag.x1 = s[0]; state.drag.z1 = s[1]; }
    else { state.drag.x1 = x; state.drag.z1 = z; }
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) state.pinch = null;
  state.panDrag = null;
  state.spoutDrag = false;
  if (state.vexDrag) { state.vexDrag = null; syncPanel(); return; }
  if (state.pour) { state.pour = null; sim.p.pour = null; }
  if (state.measDrag) {
    const d = state.measDrag;
    // Shorter than a cell is a click: clear the tape rather than keep a dot.
    state.measure = Math.hypot(d.x1 - d.x0, d.z1 - d.z0) < sim.dx ? null : d;
    state.measDrag = null;
    syncPanel();                      // the panel's Measure row prints the numbers
    return;
  }
  if (state.fluxDrag) {
    const d = state.fluxDrag;
    state.fluxDrag = null;
    if (Math.hypot(d.x1 - d.x0, d.z1 - d.z0) >= 2 * sim.dx) placeFlux(d.x0, d.z0, d.x1, d.z1);
    syncPanel();
    return;
  }
  if (state.cvDrag) {
    const d = state.cvDrag;
    // Thinner than 3 cells in either direction is a click: clear the box —
    // a degenerate box has no interior for a momentum budget to close over.
    if (Math.abs(d.x1 - d.x0) < 3 * sim.dx || Math.abs(d.z1 - d.z0) < 3 * sim.dx) {
      state.cv = null;
    } else {
      placeCV(d.x0, d.z0, d.x1, d.z1);
    }
    state.cvDrag = null;
    return;
  }
  if (state.drag) {
    const d = state.drag;
    const kind = state.tool === "erase" ? 0 : state.tool === "valve" ? 128 : 255;
    const th = state.tool === "erase" ? state.brush * 2.2 : state.brush;
    if (Math.hypot(d.x1 - d.x0, d.z1 - d.z0) < sim.dx) {
      SIM.addSeg(d.x0, d.z0, d.x0 + sim.dx * 0.5, d.z0, th, kind);   // a dot
    } else {
      SIM.addSeg(d.x0, d.z0, d.x1, d.z1, th, kind);
    }
    state.drag = null;
  }
}

// -------------------------------------------------------------------- loop
let lastT = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, probeTick = 0;
// Whether the previous frame was still warming up, so the end of spin-up can
// be caught as an edge rather than as a state — see tickFrame.
let wasWarming = false;

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tickFrame(realDt);
}

function tickFrame(realDt) {
  computeView();

  const t0 = performance.now();
  let simAdvanced = 0;
  if (!state.paused) {
    const h = SIM.dt();
    state.simDt = h;
    // Scenes with a `spinup` run flat out until the flow has established —
    // nobody should have to sit through fifteen seconds of a pipe filling
    // before they are allowed to slam the valve.
    // An exercise's settle time is the scene's spin-up rule applied to a
    // measured number from that demo's verification record — HP-1 needs 50 s
    // where its scene asks for 10 — so it warms flat out in exactly the same
    // way. It is a sim-clock target, so the speed slider does not lengthen it.
    const exWarm = EX.settleTarget();
    const warmTo = Math.max(state.scene.spinup || 0, exWarm);
    const warming = sim.t < warmTo;
    // The last of §9's reset conditions. Spin-up is an initialisation
    // interval, not part of the reported flow state — a pipe filling, a
    // channel finding its depth — and a window opened across it carries the
    // fill in every mean it reports. On the EDGE only: resetting while
    // `!warming` holds would zero T on every frame afterwards and there would
    // be no window at all. A no-op when no window is open.
    if (wasWarming && !warming) SIM.avgReset();
    wasWarming = warming;
    let want = warming ? state.nsubMax : Math.round(state.speed * realDt / h);
    // nsubMax is fractional (the AIMD governor creeps it), so round at the
    // point of use — a substep count is an integer, and the panel prints it.
    want = Math.max(1, Math.round(Math.min(state.nsubMax, want)));
    simAdvanced = SIM.step(want);
    state.nsub = want;
    if (warming) {
      document.getElementById("hint").innerHTML = exWarm > 0
        ? EX.settleHint()
        : "establishing steady flow… <b>" + sim.t.toFixed(1) + " / " +
          state.scene.spinup.toFixed(0) + " s</b>";
      // A minimised tips pill still shows the countdown — reading a number
      // before the flow has settled is the classic worksheet mistake.
      MINI.pillText("hint", "▸ " + Math.max(0, warmTo - sim.t).toFixed(0) + " s");
      state.tipAt = 9.5;   // pop the first tip the moment spin-up finishes
    } else {
      MINI.pillText("hint", "");
    }
  }
  const col = SIM.columns();
  // Averaging samples the frame the solver just advanced, weighted by the
  // simulated time it advanced — not by the frame, which is not a unit of
  // anything physical. Both must follow `columns()` above: the column
  // accumulator reads the texture that call refreshes. See docs/averaging.md §4.4.
  SIM.avgStepField(simAdvanced);
  SIM.avgStepColumns(simAdvanced);
  // SIMULATED seconds, not wall-clock ones. Advancing by `realDt` made the
  // particles a lie about the flow: the solver advances by whatever it fitted
  // into the frame budget, which on m2 is about 0.3 × real time, so they
  // travelled roughly three times faster than the water they were drawn in.
  // The same fault the other way up: the clock stopped and they carried on.
  // `advanceTracers` below has always taken `simAdvanced`, which is what the
  // orbit tracers close their loops correctly and the particles did not.
  //
  // Capped because this is one explicit Euler step: during spin-up the solver
  // runs flat out and a frame can advance half a second, which would teleport
  // a particle through a wall rather than round it.
  if (state.particles) SIM.advanceParticles(Math.min(simAdvanced, 0.05), measuringAvg());

  const simMs = performance.now() - t0;
  // AIMD governor: creep up while there is headroom, back off hard when not
  if (simMs > CONFIG.frameBudgetMs * 1.6) state.nsubMax = Math.max(2, state.nsubMax * 0.82);
  else if (simMs < CONFIG.frameBudgetMs * 0.75) state.nsubMax = Math.min(4000, state.nsubMax * 1.05 + 1);

  // Average mode must describe ONE window: the field, the overlay and every
  // number derived from it. Mixing a mean field with live markers would put
  // two flow states in one screenshot.
  const avgCols = state.avg && SIM.avgActive() ? SIM.avgColumns() : null;
  const analysis = avgCols
    ? OVERLAY.analyse(sim, avgCols.C, { averaged: true })
    : OVERLAY.analyse(sim, col);
  // T and the cursor readouts, which move every frame. Behind the same flag,
  // so a session with Average off pays one boolean for all of it.
  if (avgCols) LEGEND.avgTick(avgCols);
  sampleGauges(analysis);
  sampleRakes();
  sampleCV();
  sampleFlux();
  sampleForce();
  sampleInlet(analysis);
  advanceTracers(simAdvanced);
  // Scenes whose subject is the orbital motion seed their own tracer rake as
  // soon as there is enough water to hang it in.
  if (!state.tracers && state.scene.tracerX && sim.t > 0.5) seedTracers(state.scene.tracerX);

  const cur = state.inside ? state.cursor : [-99, -99];
  const rg = rangeFor(fieldFor(state.mode).id);
  SIM.render(view, {
    mode: state.mode, vmax: vmaxFor(), lo: rg[0], hi: rg[1],
    // The same simulated step the particles were advanced by, so the trail
    // fades over a fixed span of FLOW rather than of wall clock.
    pdt: Math.min(simAdvanced, 0.05),
    // Dye has no accumulator, so a live tracer over a mean picture would put
    // two flow states in one screenshot: under an open window it stands down.
    dye: state.dye && !measuringAvg(), particles: state.particles,
    // One window, one picture: the same flag the overlay above was built with.
    avg: state.avg,
    cursor: [cur[0], cur[1], state.tool === "erase" ? state.brush * 1.1 : state.brush * 0.55],
    guide: state.drag ? [state.drag.x0, state.drag.z0, state.drag.x1, state.drag.z1] : [0, 0, 0, 0],
    guideOn: !!state.drag,
  });

  drawOverlay(analysis);
  EX.tick();                    // the card's settle countdown, when one is open

  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 0.5) {
    state.fps = fpsN / fpsAcc;
    state.rt = simAdvanced / Math.max(realDt, 1e-4);
    fpsAcc = 0; fpsN = 0;
    updateStatus();
  }
  cycleTips(realDt);
}

/** The speed scale — the particle colouring and the Water view's brightness
 *  term, both of which are speed whatever field is up. The FIELD's own range
 *  is `rangeFor`, and the two are deliberately separate. */
function vmaxFor() { return sceneNow().vmax || 4; }

/** One sample per gauge per rendered frame — but ONLY when the clock has moved.
 *
 *  The render loop keeps running while the sim is paused, and it used to keep
 *  sampling: every sample carried the same `sim.t` and the same values, so a
 *  900-deep ring of them wiped a paused trace clean in about eight seconds
 *  (the "read the trace promptly" rule in every worksheet). Gating on the
 *  clock freezes the history instead, and because `sim.t` does not advance
 *  while paused there is no gap to bridge on resume — the series simply
 *  continues from the sample before the pause.
 *
 *  Two stores, deliberately: `hist` is the recent window the corner card
 *  plots (unchanged length, unchanged look) and `log` is the deep history the
 *  inspector and the CSV read. Both hold the SAME sample objects. */
function sampleGauges(A) {
  if (!state.gauges.length) return;
  if (state.paused) return;
  // The clock has restarted (R, or a resolution rebuild — both zero `sim.t`).
  // The old trace cannot be continued and must not be interleaved with the
  // new one, so it goes; this catches `SIM.resetWater()` called directly by a
  // rig script as well as the R key.
  if (sim.t < state.gaugeT) clearGaugeHistory();
  if (!(sim.t > state.gaugeT)) return;
  state.gaugeT = sim.t;
  const av = measuringAvg();
  state.gauges.forEach((gg) => {
    const pr = SIM.probe(gg.x, gg.z, av);
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(gg.x / sim.dx)));
    // Piezometric head h = z + p/ρg. For a scene whose bed is real geometry
    // z is just the gauge's own z, but a tilted-gravity scene (m2) draws a FLAT
    // bed and carries S₀ in gravity instead, so the elevation is z − S₀x. Without
    // that term m2's gauges read a flat grade line along a reach that loses
    // S₀·L = 0.20 m over 13.6 m, against a working depth of 0.35 m.
    const z = gg.z - (sim.scene.tiltS0 || 0) * gg.x;
    const s = { t: sim.t, h: z + pr.phead, d: A.d[i], speed: pr.speed };
    gg.hist.push(s);
    if (gg.hist.length > CONFIG.histMax) gg.hist.splice(0, gg.hist.length - CONFIG.histMax);
    if (!gg.log) gg.log = [];
    gg.log.push(s);
    if (gg.log.length > CONFIG.logMax) gg.log.splice(0, gg.log.length - CONFIG.logMax);
    gg.last = pr;
  });
}

/** R (reset water) restarts the clock, so the traces cannot be continued —
 *  both stores are emptied and the inspectors go blank. Loading a scene drops
 *  the gauges entirely. Said out loud in the inspector's caption. */
function clearGaugeHistory() {
  state.gauges.forEach((g) => { g.hist.length = 0; if (g.log) g.log.length = 0; });
  state.gaugeT = -1;
}
/** True while measurements should come from the averaging window: Average is
 *  up AND a window is open. Every instrument asks this one question, so what
 *  "one window, one picture" means for the numbers is decided in one place. */
function measuringAvg() { return state.avg && SIM.avgActive(); }

function sampleRakes() {
  const av = measuringAvg();
  state.rakes.forEach((rk) => { const r = SIM.rake(rk.x, rk.buf, av); rk.buf = r.buf; rk.i = r.i; });
}

/** Place (or move) the force control volume. Corners are normalised and the
 *  running force estimate starts afresh — a moved box is a new measurement,
 *  and blending it with the old one would print a number no box ever read. */
/** Take away the section under the pointer, if there is one. Named rather
 *  than inlined because a click and a drag are different gestures on this
 *  tool: removal happens on the way DOWN, placement on the way up. */
function removeFluxAt(x, z) {
  const hit = state.flux.findIndex((L) => nearSegment(L, x, z) < GRAB_PX);
  if (hit < 0) return false;
  state.flux.splice(hit, 1);
  syncPanel();
  return true;
}

/** Put a section down. Four is the ceiling for the same reason gauges stop at
 *  four: past that nobody can tell them apart, and the questions these answer
 *  need two. The oldest gives way, so the pair you are looking at is the pair
 *  you drew last. */
function placeFlux(x0, z0, x1, z1) {
  if (state.flux.length >= 4) state.flux.shift();
  state.flux.push({ x0, z0, x1, z1, ema: null, t0: sim.t });
  syncPanel();
}

/** Every section, smoothed the same way the control volume is. A raw section
 *  integral on a wobbling free surface is not a reading — it carries every
 *  wave that crosses it — which is the whole reason the box grew an EMA. */
function sampleFlux() {
  if (!state.flux.length || state.paused) return;
  const av = measuringAvg();
  state.flux.forEach((L) => {
    if (sim.t < L.t0) { L.ema = null; L.t0 = sim.t; }
    const r = SIM.lineFlux(L.x0, L.z0, L.x1, L.z1, av);
    // Under an open window the integral is over the WINDOW MEAN, which is its
    // own aggregate — smoothing it again would put a second filter on it.
    if (av) { L.ema = r; L.t0 = sim.t; return; }
    const a = 1 - Math.exp(-Math.min(Math.max(sim.t - L.t0, 0), 0.25) / 1.0);
    L.t0 = sim.t;
    if (!L.ema) { L.ema = r; return; }
    FLUX_KEYS.forEach((k) => { L.ema[k] += (r[k] - L.ema[k]) * a; });
    L.ema.nx = r.nx; L.ema.nz = r.nz; L.ema.len = r.len;
  });
}

function placeCV(x0, z0, x1, z1) {
  state.cv = {
    x0: Math.min(x0, x1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), z1: Math.max(z0, z1),
    ema: null, flux: null, hist: [], t0: sim.t,
  };
}

/** One force integral per rendered frame, like the gauges: gated on the sim
 *  clock actually moving, history dropped when the clock restarts. The EMA is
 *  a τ = 1 s first-order filter in SIM time, so a headless pump at hundreds
 *  of substeps a frame converges exactly as the live view does; `hist` keeps
 *  the raw integrals of the last ~8 s for the card's ± flutter readout. */
function sampleCV() {
  const cv = state.cv;
  if (!cv || state.paused) return;
  if (sim.t < cv.t0) { cv.ema = null; cv.hist.length = 0; cv.t0 = sim.t; }
  if (!(sim.t > cv.t0) && cv.ema) return;
  const av = measuringAvg();
  const r = SIM.boxForce(cv.x0, cv.z0, cv.x1, cv.z1, av);
  // The whole budget, from the same faces. One extra pair of readPixels per
  // frame, which is the same cost the force alone already pays — and every
  // number in it is smoothed by the SAME EMA, because a raw face integral on
  // a wobbling free surface is a reading nobody can take.
  const b = SIM.boxFlux(cv.x0, cv.z0, cv.x1, cv.z1, av);
  if (av) {
    // The window mean is the instrument's aggregate: no second filter. The
    // flutter history still fills, and its shrinking band is the visible
    // statement that the mean is converging.
    cv.ema = { fx: r.fx, fz: r.fz };
    cv.flux = b;
    cv.t0 = sim.t;
  } else {
    const a = 1 - Math.exp(-Math.min(sim.t - cv.t0, 0.25) / 1.0);
    cv.t0 = sim.t;
    cv.ema = cv.ema ? { fx: cv.ema.fx + (r.fx - cv.ema.fx) * a,
                        fz: cv.ema.fz + (r.fz - cv.ema.fz) * a }
                    : { fx: r.fx, fz: r.fz };
    cv.flux = emaFlux(cv.flux, b, a);
  }
  cv.hist.push({ t: sim.t, fx: r.fx });
  while (cv.hist.length > 2 && sim.t - cv.hist[0].t > 8) cv.hist.shift();
  cv.last = r;
}

/** The pressure diagram on the selected face — same idiom as sampleCV, but
 *  the EMA runs per SAMPLE rather than on the two scalars: it is `p` at each
 *  station that gets the τ = 1 s filter, and Fx/Fz/F/cop/wetLen are then
 *  re-integrated (GEOM.faceForceFromSamples) from the smoothed row. Because
 *  that integral is linear in p and the geometry weights (nx, nz, f, ds) are
 *  unchanged between frames, the result is exactly the number a direct EMA
 *  of Fx/Fz would have given — so the resultant arrow is always consistent
 *  with the diagram it is drawn from, by construction rather than by two
 *  separate filters that could drift apart.
 *
 *  A geometry change changes the sample count (a resolution rebuild
 *  resamples every face at the new dx; a parameterised solid can change
 *  shape under a scene control) — that is the restart signal, the same way
 *  the clock going backwards is. */
function sampleForce() {
  const f = state.force;
  if (!f || state.paused) return;
  if (sim.t < f.t0) { f.data = null; f.t0 = sim.t; }
  if (!(sim.t > f.t0) && f.data) return;
  const av = measuringAvg();
  const r = SIM.faceForce(f.solidId, f.faceId, av);
  if (!r) { f.data = null; f.t0 = sim.t; return; }
  if (av || !f.data || f.data.samples.length !== r.samples.length) {
    // The window mean IS the instrument's aggregate (no second filter), a
    // fresh face has nothing to blend against, and a sample-count change is
    // a different station layout — averaging across it would be nonsense.
    f.data = r;
    f.t0 = sim.t;
    return;
  }
  const a = 1 - Math.exp(-Math.min(sim.t - f.t0, 0.25) / 1.0);
  f.t0 = sim.t;
  const prev = f.data.samples;
  const samples = r.samples.map((s, i) =>
    Object.assign({}, s, { p: prev[i].p + (s.p - prev[i].p) * a }));
  const ds = samples.length > 1 ? samples[1].s - samples[0].s : sim.dx;
  const g = Math.abs(sim.p.g) || 9.81;
  f.data = Object.assign(GEOM.faceForceFromSamples(samples, ds, 1000, g),
                          { samples, solidId: r.solidId, faceId: r.faceId, len: r.len });
}

/** Smooth every scalar of a control-volume budget, edge by edge. Written as a
 *  walk over the keys rather than by hand so that adding a quantity to
 *  `boxFlux` cannot leave it unsmoothed and jittering while its neighbours
 *  sit still. */
const FLUX_KEYS = ["Q", "mdot", "Mx", "Mz", "Fpx", "Fpz", "E", "wet"];
const CV_EDGES = ["left", "right", "bed", "top"];
function emaFlux(prev, now, a) {
  if (!prev) return JSON.parse(JSON.stringify({ edges: now.edges, total: now.total, inQ: now.inQ }));
  const out = { edges: {}, total: {}, inQ: prev.inQ + (now.inQ - prev.inQ) * a };
  CV_EDGES.forEach((e) => {
    out.edges[e] = {};
    FLUX_KEYS.forEach((k) => {
      out.edges[e][k] = prev.edges[e][k] + (now.edges[e][k] - prev.edges[e][k]) * a;
    });
  });
  FLUX_KEYS.forEach((k) => { out.total[k] = prev.total[k] + (now.total[k] - prev.total[k]) * a; });
  return out;
}

/** What the reservoir is actually DELIVERING.
 *
 *  Neither reservoir number on the panel is a measurement: `inflow.q` is a
 *  set-point the solver ignores entirely under head-driven inflow (nothing
 *  writes it back), and the level is a target the relaxation sponge gives up
 *  a decimetre or three of. Both are read back here from the column reduction
 *  just clear of the sponge — the first columns the boundary treatment is no
 *  longer nudging — so the panel can print them alongside the settings. */
function sampleInlet(A) {
  if (!(sim.p.inflow.on > 0.5)) { state.deliv = null; return; }
  const sp = state.scene.spongeIn ? Math.round(state.scene.spongeIn / sim.dx) : 10;
  const i0 = Math.max(2, Math.min(sim.nx - 12, sp + 2)), i1 = Math.min(sim.nx - 2, i0 + 9);
  let q = 0, s = 0, n = 0;
  for (let i = i0; i <= i1; i++) {
    if (!(A.onBed[i] && A.d[i] > 3 * sim.dx)) continue;
    q += A.q[i]; s += A.bed[i] + A.d[i]; n++;
  }
  if (!n) { state.deliv = null; return; }
  q /= n; s /= n;
  const d = state.deliv || (state.deliv = { q, level: s });
  d.q += 0.05 * (q - d.q);              // A.q/A.d already carry a 10 %/frame
  d.level += 0.05 * (s - d.level);      // EMA; this is the display's own settle
}

// ------------------------------------------------------------- orbit tracers
/** A column of massless tracers that remember where they have been.
 *
 *  A single dot going round a 30 mm circle is invisible; the PATH is the whole
 *  point, which is why the GPU particle cloud never showed orbital motion no
 *  matter how long you stared at it. These are deliberately few (one vertical
 *  rake), advected on the CPU from a single strip readback — probing them one
 *  at a time would be a pipeline stall each — and drawn as fading polylines.
 *
 *  Seeded from just under the trough down to just above the bed, so the
 *  shrinking of the orbits with depth is read straight off the picture. */
/** Deepest wet column — a sane default place to hang a tracer rake, since
 *  a fixed fraction of the domain lands on dry ground in half the scenes. */
function bestTracerX() {
  const col = SIM.columns(true);
  let bi = -1, bd = 0;
  for (let i = 2; i < sim.nx - 2; i++) {
    if (col[i * 4 + 1] > bd) { bd = col[i * 4 + 1]; bi = i; }
  }
  return bi < 0 ? sim.W * 0.5 : (bi + 0.5) * sim.dx;
}

function seedTracers(x) {
  const col = SIM.columns(true);
  const i = Math.max(0, Math.min(sim.nx - 1, Math.round(x / sim.dx)));
  const bed = col[i * 4], surf = bed + col[i * 4 + 1];
  // Too little water to hang a column in — treat the click as "clear".
  if (surf - bed < 6 * sim.dx) { state.tracers = null; return; }
  // Span the FULL depth, bed to surface. The insets are a cell and a half,
  // not a fraction of the depth: at the bed the no-slip wall makes the very
  // first cell useless, and a tracer seeded right at the still surface spends
  // half of every wave period in a dry cell, where the velocity is bled away.
  const n = state.tracerN, d = surf - bed;
  const lo = bed + Math.max(1.2 * sim.dx, 0.015 * d);
  const hi = surf - Math.max(1.5 * sim.dx, 0.03 * d);
  state.tracers = { x, buf: null, list: [],
    // Trail length in SECONDS, not points: about two and a half orbits, so
    // each loop is legible and the small failure of the loops to close —
    // Stokes drift — is visible rather than smeared into a long streak. Over
    // seven periods the near-bed undertow alone drew a 280 mm horizontal
    // smudge that hid a 17 mm orbit completely.
    trail: state.scene.trailSeconds || 2.5 * (sim.p.wave.period || 1.2) };
  for (let k = 0; k < n; k++) {
    const z = lo + (hi - lo) * (k / (n - 1));
    state.tracers.list.push({ x, z, x0: x, z0: z, path: [] });
  }
}

/** Advect the tracers by the sim time that just elapsed, RK2. */
function advanceTracers(dtSim) {
  const T = state.tracers;
  if (!T || !T.list.length || dtSim <= 0) return;
  let x0 = Infinity, x1 = -Infinity;
  T.list.forEach((t) => { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); });
  const pad = 6 * sim.dx;
  const P = SIM.patch(x0 - pad, x1 + pad, T.buf, measuringAvg());
  T.buf = P.buf;
  // Sub-step: an orbit is a rotation, and one big explicit step spirals out.
  const nsub = Math.max(1, Math.min(8, Math.ceil(dtSim / 0.02)));
  const h = dtSim / nsub;
  for (const t of T.list) {
    for (let s = 0; s < nsub; s++) {
      const a = SIM.patchVel(P, t.x, t.z);
      const b = SIM.patchVel(P, t.x + a[0] * h, t.z + a[1] * h);
      t.x += 0.5 * (a[0] + b[0]) * h;
      t.z += 0.5 * (a[1] + b[1]) * h;
    }
    t.x = Math.max(sim.dx, Math.min(sim.W - sim.dx, t.x));
    t.z = Math.max(sim.dx, Math.min(sim.H - sim.dx, t.z));
    // A tracer that has drifted right out of its rake is no longer showing
    // the orbit at the station it was seeded at, so put it back.
    if (Math.abs(t.x - t.x0) > 0.9) { t.x = t.x0; t.z = t.z0; t.path.length = 0; }
    t.path.push(t.x, t.z, sim.t);
    while (t.path.length > 6 && sim.t - t.path[2] > T.trail) t.path.splice(0, 3);
  }
}

function drawOverlay(A) {
  const ctx = octx;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.pxW, view.pxH);
  OVERLAY.drawFrame(ctx, view, sim);
  if (state.ruler) OVERLAY.drawRuler(ctx, view, sim);
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.vis.x, view.vis.y, view.vis.w, view.vis.h);
  ctx.clip();
  if (state.channel && sim.p.g > 0.5) {
    OVERLAY.drawChannel(ctx, view, A, sim);
    if (state.labels) OVERLAY.drawProfileLabels(ctx, view, A, sim);
    if (state.jumps) OVERLAY.drawJumps(ctx, view, OVERLAY.findJumps(A, sim));
  }
  state.rakes.forEach((rk) => { if (rk.buf) OVERLAY.drawRake(ctx, view, sim, rk, A); });
  if (state.tracers) OVERLAY.drawTracers(ctx, view, state.tracers);
  const meas = state.measDrag || state.measure;
  if (meas) OVERLAY.drawMeasure(ctx, view, meas);
  if (state.cvDrag) {
    OVERLAY.drawCV(ctx, view, { x0: Math.min(state.cvDrag.x0, state.cvDrag.x1),
                                z0: Math.min(state.cvDrag.z0, state.cvDrag.z1),
                                x1: Math.max(state.cvDrag.x0, state.cvDrag.x1),
                                z1: Math.max(state.cvDrag.z0, state.cvDrag.z1) });
  } else if (state.cv) OVERLAY.drawCV(ctx, view, state.cv, state.cvShow);
  if (state.flux.length || state.fluxDrag) {
    OVERLAY.drawFlux(ctx, view, state.flux, state.cvShow, state.fluxDrag);
  }
  if (state.force && state.force.data) OVERLAY.drawForce(ctx, view, sim, state.force);
  drawMarkers(ctx);
  drawSpout(ctx);
  ctx.restore();
  OVERLAY.drawGaugeMarks(ctx, view, state.gauges);
  const fld = state.gaugeField;
  // The MARKS always stay — a gauge you cannot see is a gauge you place twice.
  // What a profile can withhold is the card that reads it out, for an exercise
  // that wants a prediction before a number.
  const cards = UIMODE.shows("gauges")
    ? OVERLAY.drawGaugeCharts(ctx, view, state.gauges, fld,
        fld === "h" ? "h" : fld === "d" ? "d" : "|u|",
        fld === "speed" ? "m/s" : "m")
    : [];
  GINSP.tick(cards);
  if (state.grade) {
    // Throttled for the same reason the hover probe is: this is a full-field
    // readPixels, and a line a reader looks at does not need one every frame.
    if (--state.gradeTick <= 0) {
      state.gradeTick = 3;
      state.gradeBuf = SIM.hydraulicGrade(state.gradeBuf, measuringAvg());
    }
    OVERLAY.drawGradeLines(ctx, view, A, sim, state.gradeBuf);
  }
  if (state.inside && !state.drag && UIMODE.shows("cursor")) {
    // Another readPixels sync — once every few frames is plenty for a hover
    // readout, and it keeps the sim loop off the GPU's critical path.
    if (--probeTick <= 0) { probeTick = 3; state.hover = SIM.probe(state.cursor[0], state.cursor[1], measuringAvg()); }
    OVERLAY.drawCursorReadout(ctx, view, A, sim, state.cursor[0], state.cursor[1],
                              state.hover, UIMODE.rows());
  }
}

/** Screen distance, in CSS pixels, between a domain point and a place on the
 *  view. Hit-testing an instrument has to happen in PIXELS: the vertical
 *  exaggeration is up to 8×, so a radius in metres is a tall thin ellipse on
 *  screen and a gauge you are plainly pointing at is a miss. */
function pxApart(x0, z0, x1, z1) {
  const dx = (x1 - x0) * view.w / sim.W;
  const dz = (z1 - z0) * view.h / sim.H;
  return Math.hypot(dx, dz);
}
const GRAB_PX = 16;      // a finger is 44 px; this is for a pointed-at marker

/** Screen distance from a point to a drawn section, in pixels. */
function nearSegment(L, x, z) {
  const ax = (L.x1 - L.x0) * view.w / sim.W, az = (L.z1 - L.z0) * view.h / sim.H;
  const px = (x - L.x0) * view.w / sim.W, pz = (z - L.z0) * view.h / sim.H;
  const len2 = ax * ax + az * az;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, (px * ax + pz * az) / len2));
  return Math.hypot(px - ax * t, pz - az * t);
}

/** Place a gauge — or take away the one you just pointed at.
 *
 *  Gauges and rakes were the only instruments with no way back: every click
 *  pushed another one, and the only way to lose one was to place four more.
 *  The tape, the Control volume and the orbit tracers all already clear on a click,
 *  so this is the convention the rest of the toolbox was using. */
function placeGauge(x, z) {
  const hit = state.gauges.findIndex((g) => pxApart(g.x, g.z, x, z) < GRAB_PX);
  if (hit >= 0) {
    const gone = state.gauges.splice(hit, 1)[0];
    GINSP.closeFor(gone);
    syncPanel();
    return;
  }
  if (state.gauges.length >= 4) state.gauges.shift();
  state.gauges.push({ x, z, hist: [], log: [], id: ++state.gaugeSeq,
                      colour: CONFIG.gaugeColours[state.gauges.length % 4] });
  syncPanel();                      // the inspector row lists the live gauges
}

/** Place a rake — or take away the one at that station. A rake is a whole
 *  column, so only the station is compared. */
function placeRake(x) {
  const hit = state.rakes.findIndex((r) => Math.abs(r.x - x) * view.w / sim.W < GRAB_PX);
  if (hit >= 0) { state.rakes.splice(hit, 1); syncPanel(); return; }
  if (state.rakes.length >= 2) state.rakes.shift();
  state.rakes.push({ x, buf: null });
  syncPanel();
}

/** The order the Control volume's per-edge quantity cycles in: what crosses the
 *  face, then what force it carries, then what energy goes with it. */
const CV_NEXT = { Q: "M", M: "E", E: "Q" };

/** How recently a panel control with a placement was touched → 0..1 pulse. */
function flashOf(key) {
  if (state.flashKey !== key) return 0;
  return Math.max(0, 1 - (performance.now() - state.flashT) / 1600);
}

/** Markers that anchor the panel's abstractions to places on the field:
 *  the ∇ waterline symbol at each level control, the wave piston column,
 *  outward chevrons on open edges. Touching the matching slider flashes
 *  its marker so "which thing is this?" answers itself. */
function drawMarkers(ctx) {
  const p = sim.p, V = view;
  const level = (side, z, label, colour, key) => {
    const x0 = side === "L" ? V.X(0) : V.X(sim.W);
    const dir = side === "L" ? 1 : -1;
    const ypx = V.Y(z);
    const f = flashOf(key);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * f;
    ctx.strokeStyle = colour; ctx.lineWidth = 1.4 + 2 * f;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x0, ypx); ctx.lineTo(x0 + dir * 74, ypx); ctx.stroke();
    ctx.setLineDash([]);
    const tx = x0 + dir * 20;
    ctx.beginPath();                                   // ∇ — the waterline symbol
    ctx.moveTo(tx - 6, ypx - 10); ctx.lineTo(tx + 6, ypx - 10); ctx.lineTo(tx, ypx - 1);
    ctx.closePath(); ctx.fillStyle = colour; ctx.fill();
    OVERLAY.chip(ctx, side === "L" ? x0 + dir * 32 : x0 - 32, ypx - 18,
      label, colour, side === "R" ? "right" : undefined);
    ctx.restore();
  };
  if (p.inflow.on > 0.5) {
    level("L", p.inflow.level,
      "reservoir " + p.inflow.level.toFixed(2) + " m" + (p.inflow.free > 0.5 ? " · head-driven" : ""),
      "#7fd4ff", "res");
  }
  if (p.tailwater.on > 0.5) {
    level("R", p.tailwater.level, "tailwater " + p.tailwater.level.toFixed(2) + " m", "#5fd08a", "tw");
  }
  if (p.wave.on > 0.5) {
    const x = V.X(p.wave.x), f = flashOf("piston");
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * f;
    ctx.strokeStyle = "#ffb648"; ctx.lineWidth = 1.4 + 2 * f;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x, V.Y(0)); ctx.lineTo(x, V.Y(sim.H)); ctx.stroke();
    ctx.setLineDash([]);
    const ym = V.Y(sim.H * 0.55);
    ctx.beginPath();                                   // ↔ stroke arrows
    ctx.moveTo(x - 14, ym); ctx.lineTo(x + 14, ym);
    ctx.moveTo(x - 14, ym); ctx.lineTo(x - 8, ym - 4);
    ctx.moveTo(x - 14, ym); ctx.lineTo(x - 8, ym + 4);
    ctx.moveTo(x + 14, ym); ctx.lineTo(x + 8, ym - 4);
    ctx.moveTo(x + 14, ym); ctx.lineTo(x + 8, ym + 4);
    ctx.stroke();
    OVERLAY.chip(ctx, x + 8, ym - 16, "piston", "#ffb648");
    ctx.restore();
  }
  // open edges: outward chevrons
  const sides = [
    ["openL", p.open[0], (t) => [V.X(0) + 8, V.Y(sim.H * t)], -1, 0],
    ["openR", p.open[1], (t) => [V.X(sim.W) - 8, V.Y(sim.H * t)], 1, 0],
    ["openB", p.open[2], (t) => [V.X(sim.W * t), V.Y(0) - 8], 0, 1],
    ["openT", p.open[3], (t) => [V.X(sim.W * t), V.Y(sim.H) + 8], 0, -1],
  ];
  ctx.save();
  ctx.strokeStyle = "#dfe8f2"; ctx.lineCap = "round";
  for (const [key, on, pos, dx, dy] of sides) {
    if (!(on > 0.5)) continue;
    const f = flashOf(key);
    ctx.globalAlpha = (on > 1.5 ? 0.55 : 0.30) + 0.5 * f;   // outfalls read stronger
    ctx.lineWidth = 1.3 + 1.5 * f;
    for (const t of [0.3, 0.5, 0.7]) {
      const [cx, cy] = pos(t);
      ctx.beginPath();                                 // chevron pointing out
      ctx.moveTo(cx - dx * 4 - dy * 5, cy - dy * 4 - dx * 5);
      ctx.lineTo(cx + dx * 4, cy + dy * 4);
      ctx.lineTo(cx - dx * 4 + dy * 5, cy - dy * 4 + dx * 5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Nozzle marker for the movable source. */
function drawSpout(ctx) {
  const s = sim.p.source;
  if (!(s.on > 0.5) && state.tool !== "spout") return;
  const x = view.X(s.x), y = view.Y(s.z);
  const r = Math.max(5, s.r / sim.W * view.w);
  const fl = flashOf("spout");
  ctx.save();
  ctx.globalAlpha = Math.min(1, (s.on > 0.5 ? 0.9 : 0.35) + 0.4 * fl);
  ctx.strokeStyle = "#7fd4ff"; ctx.lineWidth = 1.6 + 2 * fl;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
  ctx.setLineDash([]);
  const sp = Math.hypot(s.vx, s.vz);
  if (sp > 0.05) {
    const ax = s.vx / sp, ay = -s.vz / sp, L = r + 12;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + ax * L, y + ay * L);
    ctx.moveTo(x + ax * L, y + ay * L);
    ctx.lineTo(x + ax * L - (ax * 6 - ay * 4), y + ay * L - (ay * 6 + ax * 4));
    ctx.moveTo(x + ax * L, y + ay * L);
    ctx.lineTo(x + ax * L - (ax * 6 + ay * 4), y + ay * L - (ay * 6 - ax * 4));
    ctx.stroke();
  }
  if (state.tool === "spout") OVERLAY.chip(ctx, x + r + 6, y - r - 6, "spout", "#7fd4ff");
  ctx.restore();
}

function updateStatus() {
  document.getElementById("status").style.display = UIMODE.shows("status") ? "" : "none";
  document.getElementById("status").textContent =
    sim.nx + "×" + sim.ny + " · Δx " + (sim.dx * 1000).toFixed(0) + " mm · " +
    "t " + sim.t.toFixed(1) + " s · ×" + state.rt.toFixed(2) + " RT · " +
    state.fps.toFixed(0) + " fps" +
    (state.zoom > 1.001 ? " · zoom ×" + state.zoom.toFixed(1) : "");
  // Guarded like refreshNote below, and for the same reason: the note element
  // is BUILT from the CONTROLS row `speed` (buildPanel names it "n_" + id), so
  // this is a cross-file-scope contract, not a fixture in index.html. Boot
  // orders buildPanel before the first updateStatus, so it is never null
  // today — but this runs on the frame path, and an unguarded null here would
  // throw sixty times a second rather than once.
  const nSpeed = document.getElementById("n_speed");
  if (nSpeed) nSpeed.textContent =
    "×" + state.speed.toFixed(2) + " asked, ×" + state.rt.toFixed(2) + " achieved  " +
    "(Δt " + (state.simDt * 1e3).toFixed(2) + " ms × " + state.nsub + ")";
  // The delivered numbers move on their own, so their notes are refreshed on
  // this cadence rather than only when a slider is touched.
  if (state.deliv) { refreshNote("inQ"); refreshNote("inLevel"); }
  // AFTER the text, never before. The chip shares the strip with the icons and
  // is allowed to shrink them, so the fit has to be rechecked whenever what it
  // says changes — and measuring first measures the PREVIOUS string. The clock
  // crossing t = 10 s widens the chip by a digit, which squeezed the groups two
  // pixels past their content and clipped the last button until something else
  // happened to re-measure: the strip was chronically one update behind.
  fitBar();
}

function refreshNote(id) {
  const c = CONTROLS.find((k) => k.id === id), n = document.getElementById("n_" + id);
  if (c && n && c.fmt) n.textContent = c.fmt(c.get());
}

function cycleTips(dt) {
  const tips = state.scene.tips;
  if (!tips.length || sim.t < (state.scene.spinup || 0)) return;
  state.tipAt += dt;
  if (state.tipAt > 9) {
    state.tipAt = 0;
    state.tipIdx = (state.tipIdx + 1) % tips.length;
    document.getElementById("hint").innerHTML = tips[state.tipIdx];
  }
}

/** Header-drag for a floating window, shared by the gauge inspector and the
 *  exercise card so the two behave and clamp identically: never off the left
 *  or top, never further right than its own width, and never past the bottom
 *  by more than its header. `onPlace` gets the new position so the window can
 *  remember where it was put. */
function dragWindow(el, handle, onPlace) {
  let d = null;
  handle.addEventListener("pointerdown", (e) => {
    // Anything you can click, type in or drag a caret through is NOT a drag
    // handle. [contenteditable] joined this list when the legend became
    // draggable: its colour-range numbers are editable SPANS, so `input` did
    // not cover them and a drag would start on top of the text caret.
    if (e.target.closest && e.target.closest("button, input, a, [contenteditable], select, textarea")) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    d = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
  });
  handle.addEventListener("pointermove", (e) => {
    if (!d) return;
    const L = Math.max(0, Math.min(innerWidth - el.offsetWidth, e.clientX - d.dx));
    const T = Math.max(0, Math.min(innerHeight - 40, e.clientY - d.dy));
    el.style.left = L + "px"; el.style.top = T + "px";
    if (onPlace) onPlace(L, T);
  });
  const end = () => { d = null; };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// -------------------------------------------------------------------- boot
function boot() {
  canvas = document.getElementById("view");
  over = document.getElementById("over");
  octx = over.getContext("2d");
  try { SIM.init(canvas); }
  catch (err) {
    document.getElementById("hint").innerHTML =
      "<b>" + err.message + "</b> — try a desktop browser with WebGL2.";
    return;
  }

  // A rig that is redrawn is a different domain, so the classification's
  // running estimates must not survive the redraw — a stale domain-wide d_n
  // is what made a drowned gate on a 1-in-4 bed read "M1". Every path that
  // re-rasterises the walls goes through one of these; a resolution change or
  // a scene load builds a fresh grid and starts clean anyway.
  ["rasterise", "addSeg", "undoSeg", "clearSegs"].forEach((k) => {
    const f = SIM[k];
    SIM[k] = (...a) => { const r = f(...a); OVERLAY.resetEstimates(sim); return r; };
  });

  // The strip first: PICKER, EX and KEYS all light their own opener by id, so
  // the buttons have to exist before anything asks for one.
  buildToolbar();
  // …then the legend, which lights the strip's own Field button.
  LEGEND.build();
  // `syncTools` is the name the rest of the file (and the number keys) already
  // uses for "repaint whatever shows the current tool".
  window.syncTools = syncToolbar;

  // The scene menu (see PICKER). Four ways in: the scene chip at the end of
  // the strip, the strip's Scenes icon, the panel's Scene row, and the S key.
  const title = document.getElementById("title");
  title.onclick = (e) => PICKER.toggle(e.currentTarget);
  title.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();          // not the global Space = pause
    PICKER.toggle(title);
  });
  window.addEventListener("pointerdown", PICKER.onDown, true);
  addEventListener("resize", () => { if (PICKER.isOpen()) PICKER.place(); });

  // The exercise menu (see EX). Three ways in: the strip's Exercises icon, the
  // panel's Exercise row and the E key; `?ex=<id>` boots straight into one,
  // and the start screen's list is a fourth door onto the same `pick`.
  window.addEventListener("pointerdown", EX.onDown, true);
  addEventListener("resize", () => { if (EX.isOpen()) EX.place(); });

  window.addEventListener("pointerdown", KEYS.onDown, true);
  window.addEventListener("pointerdown", LEGEND.onDown, true);
  addEventListener("resize", () => { if (KEYS.isOpen()) KEYS.place(); });

  // The side panel's two handles. Wired here rather than when a brief is first
  // built, so folding works whatever ends up in the panel.
  document.getElementById("dockfold").onclick = (e) => { e.currentTarget.blur(); DOCK.fold(true); };
  document.getElementById("docktab").onclick = (e) => { e.currentTarget.blur(); DOCK.fold(false); };
  // The panel is inset by --dock, so a window resize can cross the width where
  // docking stops being affordable and it has to go back to overlaying.
  // A resize (or a rotated phone) changes what "fills the window" means, and
  // the panel opening or closing changes it too — DOCK.sync calls this as well.
  addEventListener("resize", () => { DOCK.sync(); fitBar(); applyAutoVex(); });

  buildPanel();
  const q = new URLSearchParams(location.search);
  loadScene(q.get("scene") || "sandbox", false);
  // Read the rig code BEFORE the exercise rewrites the address bar — setting
  // one up drops the hash exactly as a scene switch does.
  const rigCode = RIG.hashCode();
  // `?ex=<id>` is the lecturer's slide link: it sets the whole demo up, scene
  // included, so it runs INSTEAD of `?scene=` (which has already loaded, and
  // is what you are left on if the id is unknown to this build).
  const exId = q.get("ex");
  if (exId && !EX.pick(exId)) showToast("Unknown exercise", "\"" + exId +
    "\" is not in this build's teaching pack — loaded the scene instead.");
  // A `#rig=` link carries its own base scene, so it wins over `?scene=` —
  // but `?scene=` is loaded first anyway, so a link that fails to decode
  // leaves you on the scene you asked for rather than on a blank page.
  // Decoding may be asynchronous (deflate), hence the promise: the rig lands
  // within a frame or two, and `apply` ends with a reset, so the spin-up
  // countdown runs against the RIG's geometry and not the base scene's.
  // …and apply it LAST, after the exercise has finished landing (a rig-bearing
  // exercise applies asynchronously). `#rig=` still wins over everything: an
  // `?ex=…#rig=…` link is "this exercise, with my own rig on it".
  if (rigCode) {
    EX.ready.then(() => RIG.load(rigCode))
            .catch(() => { /* reported in the panel + a toast */ });
  }
  syncToolbar();
  // The status line is otherwise written on the half-second cadence in
  // `tickFrame`, which leaves the chip half-empty for the first frames.
  updateStatus();
  document.getElementById("hint").innerHTML = state.scene.tips[0] || "";

  // A BARE visit lands on the start screen: this is a teaching tool, so the
  // pack is the front door and the sandbox is a card on it. Any address that
  // already says what to show — `?scene=`, `?ex=`, `#rig=` — skips it, which
  // is the whole contract with the lecture slides and the worksheet links.
  if (!q.get("scene") && !exId && !rigCode) START.open();

  // The tips line is the one box left that sits on the water, so it is the one
  // box that still minimises (see MINI). Controls just closes — its strip icon
  // is the way back in — and an announcement toast dismisses on click.
  MINI.add("hint", document.getElementById("hint"),
    { label: "▸ tips", pill: { bottom: "18px", left: "50%", transform: "translateX(-50%)" } });
  const pmin = document.createElement("button");
  pmin.className = "minbtn corner"; pmin.title = "Close"; pmin.textContent = "–";
  pmin.onclick = () => setPanel(false);
  document.getElementById("panel").appendChild(pmin);
  document.getElementById("toast").onclick = () => {
    clearTimeout(toastTimer);
    document.getElementById("toast").classList.remove("show");
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerleave", () => state.inside = false);
  canvas.addEventListener("pointerenter", () => state.inside = true);
  canvas.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = pointerPx(e);
    // pinch-to-zoom trackpads report ctrlKey; give them a stronger response
    zoomAt(px, py, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    // The start screen is modal: Esc leaves it, and nothing behind it is
    // reachable from the keyboard while it is up.
    if (START.isOpen()) {
      if (e.key === "Escape") { e.preventDefault(); START.close(); }
      return;
    }
    // An open menu owns the keyboard: Esc/arrows/Enter are its own, and every
    // other shortcut is swallowed rather than fired behind it.
    if (PICKER.isOpen()) { PICKER.key(e); return; }
    if (EX.isOpen()) { EX.key(e); return; }
    if (KEYS.isOpen() && e.key === "Escape") { e.preventDefault(); KEYS.close(); return; }
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); togglePause(); }
    else if (k === "escape") { KEYS.close(); DOCK.fold(true); }
    else if (k === "?" || (k === "/" && e.shiftKey)) KEYS.toggle(document.getElementById("keysBtn"));
    else if (k === "h") START.open();
    else if (k === "s") PICKER.open(document.getElementById("sceneBtn"));
    else if (k === "e") EX.open(document.getElementById("exBtn"));
    else if (k === "v") toggleValve();
    else if (k === "z") SIM.undoSeg();
    else if (k === "c") SIM.clearSegs();
    else if (k === "r") { SIM.resetWater(); clearGaugeHistory(); }
    else if (k === "p") { state.particles = !state.particles; syncPanel(); }
    else if (k === "g") {
      // Over the fields this profile OFFERS, so the key and the card's menu
      // cannot disagree about what there is to cycle through.
      const F = UIMODE.fields();
      const i = F.findIndex((f) => f.mode === state.mode);
      state.mode = F[(i + 1) % F.length].mode;
      LEGEND.sync(); syncPanel();
    }
    else if (k === "l") LEGEND.toggle();
    else if (k === "b") { state.cvShow = CV_NEXT[state.cvShow] || "Q"; syncPanel(); }
    else if (k === "d") { state.dye = !state.dye; syncPanel(); }
    else if (k === "n") { state.channel = !state.channel; syncPanel(); }
    else if (k === "a") setAverage(!state.avg);
    else if (k === "m") { state.ruler = !state.ruler; syncPanel(); }
    // Compared as a NUMBER: `k <= String(TOOLS.length)` was a string compare,
    // so a tenth tool would have made "9" fail ("9" > "10" lexically).
    //
    // A hidden tool keeps its digit. Worksheets say "press 5", and renumbering
    // the tools under a profile would make the pack lie — so the key says why
    // the tool is not there rather than silently arming a different one.
    else if (+k >= 1 && +k <= TOOL_KEYS) {
      const t = TOOLS[+k - 1];
      const fam = familyOf(t[0]);
      if (UIMODE.allows(fam, { tool: t[0], id: t[0] })) {
        state.tool = t[0]; window.syncTools();
      } else {
        showToast(t[1] + " is off for this exercise",
                  "The ⋯ button at the end of the strip brings every control back.");
      }
    }
    else if (k === "[") state.brush = Math.max(0.015, state.brush / 1.3);
    else if (k === "]") state.brush = Math.min(0.5, state.brush * 1.3);
    else if (k === "0") resetZoom();
    else if (k === "+" || k === "=") zoomAt(view.pxW / 2, view.pxH / 2, 1.3);
    else if (k === "-") zoomAt(view.pxW / 2, view.pxH / 2, 1 / 1.3);
  });

  requestAnimationFrame(frame);
}

function togglePause() {
  state.paused = !state.paused;
  syncToolbar();               // the glyph itself is the play/pause state
}

/** Live ↔ Average. The single writer of `state.avg`, because the flag alone
 *  is not the mode: the accumulators have to be opened or released with it,
 *  and the overlay's temporal estimates have to be dropped in BOTH directions
 *  (docs/averaging.md §4.3). Average bypasses the live depth/discharge
 *  prefilters and the `_ynK` EMA, so a mode that inherited the other's state
 *  would be reading one window through the other's filter.
 *
 *  Nothing here is serialised: the rig wire format is v2 and stays v2. A
 *  shared link restores the rig, not what the person sharing it was watching. */
function setAverage(on) {
  const want = !!on;
  if (want === state.avg) return;
  state.avg = want;
  if (want) SIM.avgStart(); else SIM.avgStop();
  // Average is the measuring mode, and the particle tracers are part of the
  // reading: over a mean picture they draw the mean flow's streamlines. On,
  // not toggled — a student who already has them keeps them, and switching
  // back to Live never takes a tool away.
  if (want && !state.particles) state.particles = true;
  // A mode switch is a new measurement. The instruments' running estimates
  // belong to the mode that made them: an Average window must not open on a
  // live EMA, and Live must not resume from a window mean.
  if (state.cv) { state.cv.ema = null; state.cv.flux = null; state.cv.hist.length = 0; state.cv.t0 = sim.t; }
  state.flux.forEach((L) => { L.ema = null; L.t0 = sim.t; });
  if (state.force) { state.force.data = null; state.force.t0 = sim.t; }
  OVERLAY.resetEstimates(sim);
  LEGEND.sync(); syncPanel(); syncToolbar();
}
function toggleValve() {
  // SIM.setValve is the choke point: flipping the flag reclassifies every
  // valve texel as solid or open, which is a geometry edit as far as the
  // averaging window is concerned. Writing sim.p.valveClosed here directly
  // would skip that reset — see the comment on setValve.
  SIM.setValve(sim.p.valveClosed <= 0.5);
  syncToolbar();
  showToast(sim.p.valveClosed > 0.5 ? "Valve closed" : "Valve open",
    sim.p.valveClosed > 0.5
      ? "Watch the gauge: the surge should be ΔH = c·Δv/g."
      : "Flow re-established.");
}

// Debug handle. `frames` drives the loop by hand — the render loop stops when
// the page is hidden, so headless testing goes through here.
window.APP = {
  get sim() { return sim; }, get view() { return view; },
  state, loadScene, SIM, OVERLAY, SCENES, showToast, zoomAt, resetZoom,
  switchScene,                             // load a scene as a fresh ?scene= boot would
  PICKER,                                  // the scene menu
  EX,                                      // the exercise picker (see ?ex=<id>)
  TOOLS,                                   // the pointer tools, in number-key order
  // The chrome, for headless work: test/ui-smoke.mjs drives the strip, the
  // side panel and the start screen through here rather than by synthesising
  // clicks at pixel positions.
  ui: { TOOLBAR, DOCK, START, KEYS, fitBar, syncToolbar, FIELDS, rangeFor,
        RAMPS: Shaders.RAMPS },
  pickExercise: (id, d) => EX.pick(id, d === undefined ? undefined : { digit: d }),
  LEGEND,                                  // the colour key and field picker
  UIMODE,                                  // the exercise UI profile
  GINSP,                                   // gauge inspector windows
  RIG,                                     // rig save / share (see the Rig panel)
  inspect: (k) => GINSP.show(k || 0),
  gaugeCSV: (list) => GINSP.csv(list),     // the CSV text, without downloading
  clearGaugeHistory,
  tick: (n) => { for (let k = 0; k < (n || 1); k++) SIM.step(1); },
  frames: (n, dt) => { for (let k = 0; k < (n || 1); k++) tickFrame(dt || 1 / 60); },
  probe: (x, z) => SIM.probe(x, z),
  particlePos: (n) => SIM.particlePos(n),  // x, z pairs — headless only
  placeGauge, placeRake,                   // place, or remove one already there
  boxForce: (x0, z0, x1, z1) => SIM.boxForce(x0, z0, x1, z1),   // one raw integral
  boxFlux: (x0, z0, x1, z1) => SIM.boxFlux(x0, z0, x1, z1),     // the whole budget
  faceForce: (sid, fid, avg) => SIM.faceForce(sid, fid, avg),   // the pressure diagram on one named face
  placeCV,                                 // the control volume, headless
  placeFlux, removeFluxAt,                 // a flux section, headless
  // The averaging mode's public surface.
  avg: { start: SIM.avgStart, stop: SIM.avgStop, field: SIM.avgField, T: SIM.avgT,
         // The MODE, as the strip's A sets it — start/stop above are the bare
         // accumulators, which headless tests drive without touching the view.
         toggle: () => { setAverage(!state.avg); return state.avg; },
         set: setAverage, on: () => state.avg,
         columns: () => (SIM.avgActive() ? SIM.avgColumns(true) : null),
         probe: (x, z) => SIM.avgProbe(x, z),
         // Two full-field readbacks, ~1.2 s. Never on the frame path.
         residual: () => SIM.transportResidual() },
  /** Total water volume per unit width (m²) — the mass-balance check. */
  volume: () => {
    const c = SIM.columns(); let v = 0;
    for (let i = 0; i < sim.nx; i++) v += c[i * 4 + 1] * sim.dx;
    return v;
  },
};

addEventListener("DOMContentLoaded", boot);
