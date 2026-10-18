"use strict";
/**
 * strip.js — the top strip: the tool register (TOOLS), icons, tooltips (TIP), the
 *   TOOLBAR spec and its builder, the strip's scene/valve/sandbox helpers,
 *   and the Keyboard sheet (KEYS, which renders from KEYMAP at call time).
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by test/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: TOOLS, TOOL_KEYS, ICONS, iconEl, TIP, scenesOffered,
 *          trainOffered, fireTrain, valveWarned, hasValves, valvesShown, trainLit,
 *          syncValveBtn, newArmed, newSandbox, TOOLBAR, toolItems, familyOf,
 *          toolItem, aboutHref, OPENERS, buildToolbar, showAllGroup, fitBar, syncBarH,
 *          syncToolbar, KEYS
 *
 * Reads:   applyAutoVex, clearAllGauges, clearGaugeHistory, EMBED, EX, KEYMAP,
 *          LEGEND, over, PICKER, popOut, POPUP, setAverage, showToast, SIM, sim,
 *          START, state, switchScene, syncPanel, toggleFullscreen, togglePanel,
 *          togglePause, toggleValve, UI, UIMODE
 */
// ------------------------------------------------------------------ tools
const TOOLS = [
  ["wall", "Wall", "Left-drag a straight edge"],
  ["erase", "Erase", "Left-drag to remove"],
  ["valve", "Valve", "Draw a gate you can slam with V"],
  ["spout", "Spout", "Click or drag to move the falling inflow"],
  ["gauge", "Gauge", "Click to log a time series — click one again (or its ×) to remove it; press this button again to clear all gauges"],
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
  // THIRTEENTH, appended like Flux and Force so no digit moves. Its key is the
  // letter D (the KEYMAP row whose `for` names it), which used to toggle the Dye view button this
  // replaced: dye is no longer released automatically, the student puts it
  // where the question is.
  ["dye", "Dye", "Hold the pointer in the water to release black dye there — drag to move the release point, let go to stop"],
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
  // A wave train: three crests under a hump-shaped envelope.
  train:   '<path d="M2.5 12c1.6 0 2-1.2 3-1.2s1.6 2.6 3 2.6 1.8-6.4 3-6.4 1.6 6.4 3 6.4 1.8-2.6 3-2.6"/>' +
           '<path d="M2.5 16.5h15" opacity=".55"/>',
  reset:   '<path d="M4.5 10a5.5 5.5 0 1 1 1.7 4"/><path d="M4.5 15v-5h5"/>',
  undo:    '<path d="M7 5.5 3.5 9 7 12.5"/><path d="M3.5 9h8A4.5 4.5 0 0 1 16 13.5v1"/>',
  pour:    '<path d="M4.5 4.5h7l-1 4.5h-5z"/><path d="M11.5 6.2c1.6 0 2.2 1 2.2 2s-.8 1.9-2.2 1.9"/>' +
           '<path d="M7.2 12.4c1.1 1.4 1.8 2.3 1.8 3.2a1.9 1.9 0 1 1-3.8 0c0-.9.8-1.8 2-3.2z"/>',
  clear:   '<path d="M5 6h10"/><path d="M8 6V4.5h4V6"/><path d="M6.5 6l.8 9h5.4l.8-9"/>',
  sliders: '<path d="M4 6h12M4 10h12M4 14h12"/><circle cx="8" cy="6" r="1.9" fill="#070b0f"/>' +
           '<circle cx="13" cy="10" r="1.9" fill="#070b0f"/><circle cx="6.5" cy="14" r="1.9" fill="#070b0f"/>',
  keys:    '<rect x="2.5" y="6" width="15" height="8" rx="1.5"/><path d="M5.5 9h.01M8 9h.01M10.5 9h.01M13 9h.01M14.5 9h.01M6.5 11.6h7"/>',
  about:   '<path d="M10 3.5 17 7l-7 3.5L3 7Z"/><path d="M3 10.5 10 14l7-3.5M3 14l7 3.5 7-3.5" opacity=".55"/>',
  // Four corner brackets opening outward — the frame the window is about to
  // fill. `unfullscreen` is the same brackets turned to point back inward.
  fullscreen:   '<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/>',
  unfullscreen: '<path d="M7.5 3.5v4h-4M12.5 3.5v4h4M7.5 16.5v-4h-4M12.5 16.5v-4h4"/>',
  // A box with an arrow leaving its open corner — this exercise, elsewhere.
  popout: '<path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16h9a1.5 1.5 0 0 0 1.5-1.5V11"/>' +
          '<path d="M11 3h6v6M17 3l-7 7"/>',
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
  // The neutral tool: nothing in hand, a press reads the water there.
  read:    '<circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/>' +
           '<circle cx="10" cy="10" r="5.6" opacity=".6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2"/>',
  dye:     '<path d="M10 3.5c3 3.6 4.5 5.9 4.5 8a4.5 4.5 0 0 1-9 0c0-2.1 1.5-4.4 4.5-8Z"/>',
  // Streamlines squeezing past a body: three lines, closer over the bump.
  sline:   '<path d="M2.5 5c4 0 5 2.5 7.5 2.5S13.5 5 17.5 5"/>' +
           '<path d="M2.5 10c4 0 5 1.2 7.5 1.2s3.5-1.2 7.5-1.2"/>' +
           '<path d="M2.5 15.5h4.5a3 2.6 0 0 1 6 0h4.5"/>',
  // Average: a wobbling trace with the mean line drawn flat through it. The
  // glyph is the claim — the line is not the signal, it is what the signal
  // spent the window doing.
  average: '<path d="M2.5 12.5c2-5 3.2 3.5 5 0s2.5-8.5 4.5-5 3.5 6 5.5 2.5" opacity=".55"/>' +
           '<path d="M2.5 10h15"/>',
  // The two grade lines over a wavy surface: what the overlay actually draws.
  channel: '<path d="M3 6h14"/><path d="M3 9.5h14" stroke-dasharray="2.4 2"/>' +
           '<path d="M3 15c3.5 0 4.5-2.2 7-2.2s3.5 2.2 7 2.2"/>',
  // A corner card with a trace on it — what the gauge cards look like.
  readouts: '<rect x="2.5" y="5" width="15" height="10" rx="2"/>' +
            '<path d="M5 12l2.5-2.5 2 1.5 2.5-3.5 3 2.5"/>',
  // A pointer with its little card of numbers beside it.
  hover:   '<path d="M3.5 3.5l4.5 11 1.6-4.4 4.4-1.6z"/>' +
           '<path d="M11.5 12.5h6v5h-6z" opacity=".7"/><path d="M13 14.5h3M13 16h2" opacity=".7"/>',
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
  let flashT = 0;
  function hide() { clearTimeout(flashT); if (el) el.classList.remove("show"); }
  /** The touch screen's tooltip: shown by the tap that pressed the button,
   *  gone by itself after a moment (no key — a tablet has none). */
  function flash(anchor, label, hint) {
    show(anchor, label, hint, "");
    clearTimeout(flashT);
    flashT = setTimeout(() => { if (el) el.classList.remove("show"); }, 1800);
  }
  /** Whether this machine has a pointer that can hover at all. */
  function hoverable() {
    return !(window.matchMedia && matchMedia("(hover: none)").matches);
  }
  return { show, hide, flash, hoverable };
})();

/** Is the scene menu offered right now? Not while an exercise is on screen:
 *  its students reach everything through the exercise menu, and a second menu
 *  of bare geometry beside it only confuses. The strip's ⋯ (show everything)
 *  brings it back, and with no exercise loaded — the start screen, the
 *  sandbox, a `?scene=` boot — it is always there. `?scene=` links still boot.
 *  A card with a `secondScene` keeps it too: its "Also:" line sends the
 *  student to the Scenes menu for that second scene. */
function scenesOffered() {
  const ex = EX.current;
  return !ex || !!(ex.secondScene && ex.secondScene.scene) || !!(state.ui && state.ui.lifted);
}

/** Is there a wave train to fire? (wave.train > 0 on a running paddle.) The
 *  strip's Wave train button shows only then, and V fires it where there is
 *  no valve to work. */
function trainOffered() {
  return !!sim && !!sim.p && SIM.isOn(sim.p.wave.on) && sim.p.wave.train > 0;
}
function fireTrain() {
  if (SIM.fireTrain()) {
    const w = sim.p.wave;
    showToast("Wave train", w.train + " waves of period " + w.period.toFixed(2) + " s. Follow one crest, then follow the group.");
  } else if (trainOffered()) {
    showToast("Still making the last train", "Wait for the paddle to stop, then press again.");
  }
  syncToolbar();
}

/** Is there a valve on the bench — one the scene declares, or a drawn one
 *  (segment kind 128)? The strip shows the Valves button only then. */
const valveWarned = new Set();           // scene ids already warned about, once each
function hasValves() {
  if (!sim || !sim.scene) return false;
  if (sim.segs && sim.segs.some((s) => (s[5] | 0) === SIM.MASK.VALVE)) return true;
  const sc = sim.scene;
  if (!sc.valves) return false;
  try { return sc.valves(sc.W, sc.H, SIM.params().values || {}).length > 0; }
  catch (err) {                            // a scene that cannot say keeps its button
    const id = sc.id || sc.name || "?";
    if (!valveWarned.has(id)) { valveWarned.add(id); console.warn("scene " + id + ": valves() threw", err); }
    return true;
  }
}
/** Rebuild the strip when the answer changes — cheap to ask, rare to change. */
let valvesShown = null, trainLit = false;
function syncValveBtn() {
  const v = hasValves() + ":" + trainOffered();
  if (v !== valvesShown) { valvesShown = v; buildToolbar(); }
  // The Wave train button is lit while the paddle is making one.
  const run = trainOffered() && SIM.paddle().running;
  if (run !== trainLit) { trainLit = run; syncToolbar(); }
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
  // The one door that is a choice to BUILD: Wall goes into the hand. Every
  // other way in leaves the neutral Read tool there (see state.tool).
  state.tool = "wall";
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
    { id: "homeBtn", icon: "home", label: "Start", key: KEYMAP.labelFor("homeBtn"),
      hint: "The exercise pack, the sandbox and the scenes",
      act: () => START.open() },
    { id: "sceneBtn", icon: "scenes", label: "Scenes", key: KEYMAP.labelFor("sceneBtn"),
      hint: "Ready-made flumes, tanks and pipe runs",
      when: () => scenesOffered(),
      act: (b) => PICKER.toggle(b) },
    { id: "exBtn", icon: "ex", label: "Exercises", key: KEYMAP.labelFor("exBtn"),
      hint: "Set up one of the teaching demos",
      act: (b) => EX.toggle(b) },
    { id: "newBtn", icon: "fresh", label: "New sandbox", key: "",
      hint: "A blank flume — clears what is drawn and starts over",
      act: () => newSandbox() },
  ] },
  // BUILD: the four drawing tools, Pour beside them, Undo (a button, so a
  // mis-drawn stroke can be taken back on a touch screen) and Clear (it edits
  // the rig rather than running it, so it lives here, not with the clock).
  { cap: "BUILD", family: "build", items:
    toolItems("wall", "erase", "valve", "spout", "pour").concat(
      [{ id: "undoBtn", icon: "undo", label: "Undo", key: KEYMAP.labelFor("undoBtn"),
         hint: "Take back the last thing you drew",
         act: () => SIM.undoSeg() },
       { id: "clearBtn", icon: "clear", label: "Clear drawing", key: KEYMAP.labelFor("clearBtn"),
         hint: "Remove every segment you have drawn — the scene stays",
         act: () => SIM.clearSegs() }]) },
  // MEASURE opens with READ: the empty hand. A press with it never draws or
  // places anything — it pins the readout card where it lands, which is the
  // touch screen's hover. It is not in TOOLS (no digit to renumber) and no
  // profile can hide it: it is offered wherever any pointer tool is, because
  // it is the way to put that tool down.
  { cap: "MEASURE", family: "measure",
    items: [{ id: "inspectBtn", icon: "read", label: "Read", key: "",
              always: true,
              hint: "Nothing in hand: tap or click the water to pin its numbers there — a press never draws. Tap dry ground to clear",
              on: () => !state.tool,
              act: () => { state.tool = null; state.forceHover = null; syncToolbar(); syncPanel(); } }]
      .concat(toolItems("gauge", "rake", "tracer", "dye", "measure", "cv", "flux", "force")) },
  // VIEW: how the water is DRAWN. The three toggles were reachable only from
  // the P / N keys or from a scroll of the Controls panel, which on a
  // touch screen meant not at all.
  { cap: "VIEW", family: "view", items: [
    { id: "legendBtn", icon: "legend", label: "Field & legend", key: KEYMAP.labelFor("legendBtn"),
      hint: "Which variable the colour shows, its range and its units",
      on: () => LEGEND.isOpen(), act: () => LEGEND.toggle() },
    { id: "partBtn", icon: "particles", label: "Particles", key: KEYMAP.labelFor("partBtn"),
      hint: "Massless tracers — the clearest way to see orbits and jets",
      on: () => state.particles,
      act: () => { state.particles = !state.particles; syncPanel(); } },
    { id: "slineBtn", icon: "sline", label: "Streamlines", key: KEYMAP.labelFor("slineBtn"),
      hint: "Streamlines — equal discharge between neighbouring lines; of the mean flow under Average",
      on: () => state.sline,
      act: () => { state.sline = !state.sline; syncPanel(); } },
    { id: "chanBtn", icon: "channel", label: "Open-channel overlay", key: KEYMAP.labelFor("chanBtn"),
      hint: "Critical depth, normal depth and the energy grade line",
      on: () => state.channel,
      act: () => { state.channel = !state.channel; syncPanel(); } },
    { id: "gradeBtn", icon: "channel", label: "Grade lines", key: "",
      hint: "Energy and hydraulic grade lines — the gap between them is the velocity head",
      on: () => state.grade,
      act: () => { state.grade = !state.grade; syncPanel(); } },
    // The two readout switches. Separate, because they answer different
    // wishes: the readout boxes are the instruments' numbers (fold them away to look
    // at the water, or to ask for a prediction first); the hover card is the
    // cursor's own probe, which a first lecture may not want at all.
    { id: "readBtn", icon: "readouts", label: "Readouts", key: KEYMAP.labelFor("readBtn"),
      hint: "The instruments' readout boxes — gauge cards, control volume, flux lines, rakes, force. They keep recording while hidden",
      on: () => state.instReadouts,
      act: () => { state.instReadouts = !state.instReadouts; syncPanel(); } },
    { id: "hoverBtn", icon: "hover", label: "Hover readout", key: "",
      hint: "The card of numbers that follows the cursor over the water",
      on: () => state.hoverCard,
      act: () => { state.hoverCard = !state.hoverCard; syncPanel(); } },
    // VIEW and not MEASURE, deliberately, although it is the one toggle here
    // that changes what the numbers say: it changes how the water is DRAWN,
    // and everything else follows the picture — the overlay, the instruments
    // and the particle tracers all read the averaged flow while the window is
    // open (docs/averaging.md §3), because a screenshot that mixed a mean
    // field with live markers would carry two flow states at once.
    { id: "avgBtn", icon: "average", label: "Average", key: KEYMAP.labelFor("avgBtn"),
      hint: "Time-average the flow — the field and every reading over one window",
      on: () => state.avg,
      act: () => setAverage(!state.avg) },
  ] },
  { cap: "RUN", family: "run", items: [
    { id: "playBtn", icon: () => (state.paused ? "play" : "pause"), key: KEYMAP.labelFor("playBtn"),
      label: () => (state.paused ? "Run" : "Pause"),
      hint: "Stop the clock — gauge histories freeze with it",
      hot: () => state.paused, act: () => togglePause() },
    { id: "resetBtn", icon: "reset", label: "Reset water", key: KEYMAP.labelFor("resetBtn"),
      hint: "Reload the scene's water and clear the gauge histories",
      act: () => { SIM.resetWater(); clearGaugeHistory(); } },
    // Lit when the valves are OPEN, which is what the worded button meant.
    // The other way round would light on almost every boot: a scene without an
    // explicit `valveOpen` starts shut, valve drawn or not.
    { id: "valveBtn", icon: "valve", label: "Valves", key: KEYMAP.labelFor("valveBtn"),
      hint: "Open or slam every valve you have drawn",
      // Only where there is a valve to work: the scene's own or one drawn.
      // Re-read every frame (tickFrame → syncValveBtn), so drawing the first
      // valve puts the button up and erasing the last takes it away.
      when: () => hasValves(),
      on: () => !!sim && !SIM.isOn(sim.p.valveClosed), act: () => toggleValve() },
    // Only where the paddle makes trains (wave.train > 0, WV-5): one press,
    // one train. Shares V with the valves — V fires the train where there is
    // no valve to work.
    { id: "trainBtn", icon: "train", label: "Wave train", key: KEYMAP.labelFor("trainBtn"),
      hint: "Fire one wave train: the paddle ramps up, holds and stops",
      when: () => trainOffered() && !hasValves(),
      on: () => !!sim && SIM.paddle().running && sim.p.wave.train > 0, act: () => fireTrain() },
  ] },
  // Chrome, not a family: captioning it would put it in the same taxonomy as
  // the four above, which is exactly what it is not.
  { cap: "", family: "meta", items: [
    { id: "panelBtn", icon: "sliders", label: "Controls",
      hint: "Every slider: flow, boundaries, hydraulics, view, rig",
      act: () => togglePanel() },
    { id: "fsBtn", icon: () => (document.fullscreenElement ? "unfullscreen" : "fullscreen"),
      label: () => (document.fullscreenElement ? "Exit full screen" : "Full screen"), key: KEYMAP.labelFor("fsBtn"),
      hint: "The whole screen for the flume — inside a module page, the way out of the frame",
      on: () => !!document.fullscreenElement,
      // A frame with no `allow="fullscreen"` reports the capability as false
      // rather than throwing, so the button is simply not offered there —
      // `when` is a boot-time read, and this is as close to boot-time as a
      // capability check gets.
      when: () => !!document.fullscreenEnabled,
      act: () => toggleFullscreen() },
    { id: "popBtn", icon: "popout", label: "Open in a new tab",
      hint: "This exercise, and what you have drawn, in a full window",
      when: () => EMBED,
      act: () => popOut() },
    { id: "keysBtn", icon: "keys", label: "Keyboard", key: KEYMAP.labelFor("keysBtn"),
      hint: "The shortcut sheet",
      act: (b) => KEYS.toggle(b) },
    { id: "aboutBtn", icon: "about", label: "About the solver",
      hint: "What is actually being computed — the numerics, and the rest of the documentation",
      act: () => window.open(aboutHref(), "_blank", "noopener") },
  ] },
];

/** Strip items for the named tools, in the order given. The strip's ORDER is
 *  not the TOOLS order: TOOLS is the digit order, which is fixed by every
 *  worksheet ever printed, so a new tool is appended there and placed here. */
function toolItems(...ids) {
  return ids.map((id) => toolItem(TOOLS.find((t) => t[0] === id)));
}

/** Which strip family a tool belongs to — asked by the digit keys, so that a
 *  hidden tool's key can say WHICH family is off.
 *
 *  The TOOLBAR spec above is the single authority, and this reads it: a
 *  field is described once (the story of the positional guess it replaced is
 *  in docs/engineering-notes.md, "Interface and instrument history"). */
function familyOf(toolId) {
  const g = TOOLBAR.find((grp) => (grp.items || []).some((it) => it.tool === toolId));
  return g ? g.family : "measure";
}

/** A drawing / instrument tool as a strip item. Its shortcut is its position
 *  in TOOLS, which is exactly what the number keys do. */
function toolItem([id, label, tip]) {
  const n = TOOLS.findIndex((t) => t[0] === id) + 1;
  // `tool` is the item's own name for the thing it arms, and it is what a UI
  // profile names — an exercise says `measure: ["gauge"]`, not "Gauge".
  return { tool: id, icon: id === "valve" ? "gate" : id, label, hint: tip,
           key: n <= TOOL_KEYS ? String(n) : KEYMAP.labelFor(id),
           on: () => state.tool === id,
           act: () => {
             // The Gauge button pressed while the Gauge tool is ALREADY in
             // hand clears every gauge (its hint says so); the first press
             // only arms the tool, as every other tool does. The digit key
             // never clears — a key pressed twice by habit must not cost a
             // run's histories.
             if (id === "gauge" && state.tool === "gauge") { clearAllGauges(); return; }
             state.tool = id; state.forceHover = null; syncToolbar(); syncPanel();
           } };
}

/** On the Pages build Jekyll renders numerics.md to numerics.html (it is not
 *  README.md, so jekyll-readme-index does not make it a folder index) and does
 *  NOT publish the .md source, so the reader below has nothing to fetch there
 *  — the themed page is the right answer.
 *
 *  Everywhere else `docs/view.html` renders the markdown in the app's own
 *  clothes rather than handing the browser its raw source. */
function aboutHref() {
  return /\.github\.io$/i.test(location.hostname)
    ? "docs/numerics.html"
    : "docs/view.html?doc=numerics.md";
}

/** Strip buttons whose press opens a menu, a screen or a page. */
const OPENERS = /^(homeBtn|sceneBtn|exBtn|panelBtn|fsBtn|popBtn|keysBtn|aboutBtn)$/;

function buildToolbar() {
  if (UI.defer("bar")) return;
  UI.count.bar++;
  const host = document.getElementById("groups");
  host.textContent = "";
  TOOLBAR.forEach((group) => {
    // A profile can empty a family altogether. An empty captioned column would
    // read as a family with nothing in it, so the group goes with its last
    // button — and the rule keys off what has actually been appended, or a
    // hidden first group leaves a leading hairline.
    // The profile decides what an exercise WANTS shown; `when` decides what
    // the boot CAN show (embedded, fullscreen-capable) — profile first, since
    // narrowing is the thing a lecturer chose, then the capability check,
    // which is fixed at boot and so is never re-read by `syncToolbar`.
    const items = group.items.filter((it) =>
      (it.always ? UIMODE.anyTool() : UIMODE.allows(group.family, it)) &&
      (!it.when || it.when()));
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
      b.onpointerdown = (e) => { b._touch = e.pointerType === "touch"; };
      b.onclick = () => {
        b.blur(); TIP.hide(); it.act(b); syncToolbar();
        // A finger has no hover, so a glyph on its own would never be named.
        // The tap that presses it shows its card briefly instead — long
        // enough to read the name, gone before it sits on the water.
        // Not for a button that opens something: what it opens names itself,
        // and a card on top of a menu would cover its first rows.
        if (b._touch && b.isConnected && !OPENERS.test(b.id)) TIP.flash(b, typeof it.label === "function" ? it.label() : it.label, it.hint);
      };
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
 *  the dock takes its width out of the bar as well, so a 1440 px window
 *  with the dock open has the room of an 1100 px one. Three steps — the
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
  bar.classList.remove("tight", "tighter", "tightest", "wraps", "notitle");
  bar.classList.remove("scrolls");
  if (over()) bar.classList.add("tight");
  if (over()) bar.classList.add("tighter");
  // A FINGER needs its 40 px more than the strip needs one row: on a touch
  // screen the last rungs (26 px glyphs, then a sideways scroll nobody finds)
  // would leave half of an iPad's strip out of sight or out of reach, so the
  // groups wrap onto a second row instead, and whatever hangs under the strip
  // moves down with it (--bar-h).
  // Before a second row, the title chip goes — the brief beside the water
  // already names the exercise — if that alone makes one row enough.
  const coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  if (coarse && over()) {
    bar.classList.add("notitle");
    if (over()) { bar.classList.remove("notitle"); bar.classList.add("wraps"); }
  } else if (over()) bar.classList.add("tightest");
  const barb = bar.classList.contains("wraps") ? Math.round(bar.getBoundingClientRect().bottom) : 0;
  syncBarH();
  // A two-row strip is tall enough to hide the top of the flume, so the
  // fitted view starts under it (baseRect); one row sits in the letterbox
  // band as it always has.
  const top = barb ? barb + 4 : 0;
  if (top !== state.barTop) { state.barTop = top; if (sim) applyAutoVex(); }
  // Still too many for the room: the groups scroll, and the last one visible
  // is faded so that it looks like it continues rather than like it ends.
  bar.classList.toggle("scrolls", over());
}

/** Publish the strip's height as `--bar-h`, which the panel, the toast and the
 *  legend hang from (css/app.css). The heights themselves are the stylesheet's
 *  — one per compaction step, and a wrapped touch strip's is its natural
 *  height — so this reads whichever the current classes give. */
function syncBarH() {
  const h = document.getElementById("bar").getBoundingClientRect().height;
  document.documentElement.style.setProperty("--bar-h", Math.round(h) + "px");
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
  let el = null;
  // The pointer lines are not keys; the keys come from KEYMAP at open time.
  const POINTER = [
    ["left-drag", "draw with the current tool"],
    ["right-drag", "pour water, whatever tool is in your hand"],
    ["shift", "snap to horizontal / vertical / 45°"],
    // Embedded, a plain wheel is left to the page (see the canvas wheel
    // listener) — the sheet has to say what actually zooms in a frame.
    [EMBED ? "ctrl + wheel" : "wheel", "zoom"],
    ["middle-drag", "pan"],
  ];
  const lines = () => POINTER.concat(
    KEYMAP.filter((r) => r.label && (!r.when || r.when())).map((r) => [r.label, r.what]));
  const menu = () => (el || (el = document.getElementById("keysmenu")));
  function render() {
    const m = menu();
    m.textContent = "";
    const head = document.createElement("div");
    head.className = "smh";
    const b = document.createElement("b"); b.textContent = "Keyboard";
    const i = document.createElement("i"); i.textContent = "Esc closes";
    head.appendChild(b); head.appendChild(i);
    m.appendChild(head);
    lines().forEach(([k, what]) => {
      const r = document.createElement("div"); r.className = "kline";
      const kb = document.createElement("kbd"); kb.textContent = k;
      const s = document.createElement("span"); s.textContent = what;
      r.appendChild(kb); r.appendChild(s);
      m.appendChild(r);
    });
  }
  // Open / close / Esc / click-away are POPUP's (js/popup.js); only Esc is
  // this sheet's own key, so every other shortcut still fires behind it.
  const { open, close, toggle, isOpen, place, clickAway } =
    POPUP.make({ el: menu, render, opener: "keysBtn" });
  return { open, close, toggle, isOpen, place, clickAway };
})();

