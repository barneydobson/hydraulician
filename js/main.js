"use strict";
/**
 * main.js — boot, the view transform, scenes, pointer tools, the frame loop,
 *    drawing the overlay and markers, the status bar, tips, Average,
 *    fullscreen, and window.APP.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: baseRect, computeView, zoomAt, VEX_FILL, VEX_MAX, autoVex, applyAutoVex,
 *          resetZoom, foldText, loadScene, syncTitle, switchScene, syncURL, POUR,
 *          dragTo, snap, pointerPx, pointerPos, pointers, stopDye, TOUCH_HOLD_MS,
 *          TOUCH_SLOP_PX, TAP_PX, cancelPending, commitPending, onDown, beginPress,
 *          tapRead, onMove, onUp, lastT, acc, probeTick, wasWarming, frame,
 *          tickFrame, drawOverlay, pxApart, GRAB_PX, grabPx, nearSegment, faceAtPx,
 *          flashOf, drawMarkers, drawSpout, updateStatus, exerciseTips, tipList,
 *          showTip, restartTips, cycleTips, boot, togglePause, setAverage,
 *          toggleValve, toggleFullscreen, stripEmbed, popOut
 *
 * Reads:   advanceTracers, buildPanel, buildToolbar, canvas, clearAllGauges,
 *          clearGaugeHistory, clearInstruments, collectStream, CONFIG, DOCK, EMBED,
 *          EX, familyOf, fieldFor, FIELDS, fitBar, forceScale, GAUGE_QTY,
 *          gaugeFieldOf, gaugeQty, gaugeSeries, GEOM, GINSP, gov, governFrame,
 *          governLearn, KEYMAP, KEYS, LEGEND, measuringAvg, MINI, octx, over,
 *          OVERLAY, PICKER, placeCV, placeFlux, placeGauge, placeRake, rangeFor,
 *          refreshGrade, refreshNote, removeFluxAt, removeGauge, requestStream, RIG,
 *          sampleCV, sampleFlux, sampleForce, sampleGauges, sampleInlet, sampleRakes,
 *          SCENES, scenesOffered, seedTracers, setPanel, Shaders, showToast, sim,
 *          SIM, START, state, statWin, syncPanel, syncToolbar, syncValveBtn,
 *          toastTimer, TOOL_KEYS, TOOLBAR, TOOLS, UIMODE, view, vmaxFor, wheelHint
 */
/**
 * main.js — boot, the view transform, scenes, pointer tools, the frame loop,
 *   drawing the overlay and markers, the status bar, tips, Average,
 *   fullscreen, and window.APP.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: baseRect, computeView, zoomAt, VEX_FILL, VEX_MAX, autoVex, applyAutoVex,
 *          resetZoom, foldText, loadScene, syncTitle, switchScene, syncURL, POUR,
 *          dragTo, snap, pointerPx, pointerPos, pointers, stopDye, TOUCH_HOLD_MS,
 *          TOUCH_SLOP_PX, TAP_PX, cancelPending, commitPending, onDown, beginPress,
 *          tapRead, onMove, onUp, lastT, acc, probeTick, wasWarming, frame,
 *          tickFrame, drawOverlay, pxApart, GRAB_PX, grabPx, nearSegment, faceAtPx,
 *          flashOf, drawMarkers, drawSpout, updateStatus, exerciseTips, tipList,
 *          showTip, restartTips, cycleTips, boot, togglePause, setAverage,
 *          toggleValve, toggleFullscreen, stripEmbed, popOut
 *
 * Reads:   advanceTracers, buildPanel, buildToolbar, canvas, clearAllGauges,
 *          clearGaugeHistory, clearInstruments, collectStream, CONFIG, DOCK, EMBED,
 *          EX, familyOf, fieldFor, FIELDS, fitBar, forceScale, GAUGE_QTY,
 *          gaugeFieldOf, gaugeQty, gaugeSeries, GEOM, GINSP, gov, governFrame,
 *          governLearn, KEYMAP, KEYS, LEGEND, measuringAvg, MINI, octx, over,
 *          OVERLAY, PICKER, placeCV, placeFlux, placeGauge, placeRake, rangeFor,
 *          refreshGrade, refreshNote, removeFluxAt, removeGauge, requestStream, RIG,
 *          sampleCV, sampleFlux, sampleForce, sampleGauges, sampleInlet, sampleRakes,
 *          SCENES, scenesOffered, seedTracers, setPanel, Shaders, showToast, SIM,
 *          sim, START, state, statWin, syncPanel, syncToolbar, syncValveBtn,
 *          toastTimer, TOOL_KEYS, TOOLBAR, TOOLS, UIMODE, view, vmaxFor, wheelHint
 */
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
  // A wrapped (two-row) touch strip claims the top of the canvas — fitBar.
  const top = Math.min(state.barTop || 0, ch * 0.4);
  const ar = sim.W / (sim.H * state.vex);
  let w = cw, h = cw / ar;
  if (h > ch - top) { h = ch - top; w = h * ar; }
  return { cw, ch, w, h, bx: (cw - w) / 2, by: top + (ch - top - h) / 2 };
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
  const cw = canvas.clientWidth || 900;
  const ch0 = canvas.clientHeight || 600, ch = ch0 - Math.min(state.barTop || 0, ch0 * 0.4);
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
  // Nothing is dyed until somebody releases it with the Dye tool. A scene's
  // FIXED sources (its `dye.seeds`, or the default inlet line) run only when
  // it asks — `dye.on`, or the pulsed timelines of `dyeLine` (m1/m2) — or a
  // card sets `dyeSeeds` in its viewParams.
  state.dyeSeeds = !!(sc.dye && sc.dye.on) || sc.dyeLine > 0;
  state.slineBuf = null; state.slineDpsi = 0; state.slineT = -1;
  clearInstruments({ all: true });
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
  syncTitle();
  PICKER.refresh();
}

/** The label at the top right: the loaded EXERCISE's title (what its menu
 *  calls it) while one is open, the scene's name otherwise. Several exercises
 *  share one scene, and a student who opened "Steady and unsteady flow" should
 *  not find "Plan view — flow past a body" named over it. Called when a scene
 *  loads and when an exercise is picked or cleared. */
function syncTitle() {
  const sc = state.scene || {};
  let ex = EX.current;
  // Only while the bench IS that exercise's scene: a scene picked from the
  // menu afterwards is named as itself.
  if (ex && ex.scene !== sc.id) ex = null;
  const n = document.getElementById("sceneName"), k = document.getElementById("sceneKey");
  if (n) n.textContent = ex ? ex.title : (sc.name || "");
  if (k) k.textContent = ex ? ex.id + " · " + (sc.name || "") : (sc.key || "");
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
  state.dyeSeeds = false;             // loadScene turns them on where the scene asks
  state.jumps = true;
  state.particles = false;            // scenes that want them set `sc.particles`
  state.grade = false;                // an exercise that wants them says so in viewParams
  state.sline = false; state.slineN = 12;   // likewise the streamlines
  state.gaugeField = "h";
  state.gaugeSpan = "window";         // an exercise that wants the whole run says gaugeSpan: "all"
  state.instReadouts = true;          // an exercise that wants them off says so in viewParams
  state.hoverCard = true;
  state.tracerN = 9;
  // Live, as a fresh boot is. Average used to survive a switch, so a class
  // that had averaged FF-5 opened VC-2 — an unsteady fill — on Average. An
  // exercise that wants it says `avg: true` in viewParams (none does).
  if (state.avg) setAverage(false);
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
  syncURL({ scene: id });
  return true;
}

/** Keep the address bar honest. `syncURL({ scene })` writes `?scene=<id>` for
 *  what is loaded; `syncURL({ ex, tab })` writes `?ex=<id>` (and `&tab=` when
 *  there is one) while an exercise is loaded, dropping `scene` because the
 *  exercise implies it. Either way there is NO `#rig=` — a rig that has been
 *  switched away from must not come back on a reload, which is the least
 *  surprising reading of "I left that scene". Share writes its own link back
 *  into the bar when you next press it. `replaceState` throws on `file://`
 *  (opaque origin); the picker works there regardless, the URL simply does
 *  not follow. */
function syncURL(p) {
  try {
    const u = new URL(location.href);
    u.hash = "";
    if (p.ex) {
      u.searchParams.delete("scene");
      u.searchParams.set("ex", p.ex);
      if (p.tab) u.searchParams.set("tab", p.tab); else u.searchParams.delete("tab");
    } else {
      u.searchParams.set("scene", p.scene);
    }
    history.replaceState(null, "", u.pathname + u.search);
  } catch (_) { /* file:// refuses — harmless */ }
}

/** Pour feel, in one place (behaviour of the right-drag / Pour tool). */
const POUR = {
  gain: 0.35,   // drag speed -> jet speed: a hand flick is a gentle jet, not a firehose
  vMax: 6,      // m/s cap on either component, so a fast flick cannot blow the CFL limit
  vDown: -2,    // m/s initial downward w under gravity, so the stream falls rather than hangs
  rBrush: 4,    // pour radius in brush units: wide enough to be a stream, not a pinprick
  dt: 1 / 60,   // assumed frame interval for the drag speed (pointer events carry no solver dt)
};

/** A drag end, 45-degree-snapped about its start when Shift is held. */
function dragTo(d, x, z, e) {
  if (e.shiftKey) { const s = snap(d.x0, d.z0, x, z); d.x1 = s[0]; d.z1 = s[1]; }
  else { d.x1 = x; d.z1 = z; }
}

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

/** Let go of the Dye tool: the release stops at once. */
function stopDye() {
  state.dyeInj = null;
  if (sim && sim.p) sim.p.dyeInj = null;
}

/** A FINGER's press is held back this long before it becomes a tool action.
 *  A pinch starts with one finger and the second follows a few tens of
 *  milliseconds later; acting on the first at once placed a gauge, pinned a
 *  readout or let a blot of dye go at the start of every zoom. A press that
 *  moves further than TOUCH_SLOP_PX first is committed at once (from where it
 *  landed, so a stroke still starts under the finger); a mouse or pen press
 *  is never held back. */
const TOUCH_HOLD_MS = 90, TOUCH_SLOP_PX = 6;
/** How far a press may wander and still count as a TAP (the Read tool). */
const TAP_PX = 10;

function cancelPending() {
  if (state.pending) { clearTimeout(state.pending.timer); state.pending = null; }
}
function commitPending(ev) {
  if (!ev || state.pending !== ev) return;
  clearTimeout(ev.timer);
  state.pending = null;
  beginPress(ev);
}

function onDown(e) {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  state.ptr = e.pointerType || "mouse";
  const px = pointerPx(e);
  pointers.set(e.pointerId, px);
  const [x, z] = view.toDomain(px[0], px[1]);
  state.cursor = [x, z];
  if (pointers.size >= 2) {          // second finger: abandon tools, pinch
    cancelPending();
    if (pointers.size > 2) return;
    state.drag = null; state.spoutDrag = false; state.measDrag = null;
    state.cvDrag = null; state.fluxDrag = null; state.press = null;
    state.vexDrag = null; state.panDrag = null;
    if (state.pour) { state.pour = null; sim.p.pour = null; }
    stopDye();
    const ps = [...pointers.values()];
    state.pinch = { d: Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]),
                    mid: [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2] };
    return;
  }
  if (e.button === 1) e.preventDefault();
  const ev = { pointerId: e.pointerId, button: e.button, px, x, z,
               // "" is a synthetic event (the tests); it behaves as a mouse.
               mouse: !e.pointerType || e.pointerType === "mouse" };
  if (e.pointerType === "touch") {
    state.pending = ev;
    ev.timer = setTimeout(() => commitPending(ev), TOUCH_HOLD_MS);
    return;
  }
  beginPress(ev);
}

/** What a press DOES — everything after the pinch bookkeeping. `ev` is the
 *  press as it landed: {button, px, x, z, mouse}. */
function beginPress(ev) {
  const x = ev.x, z = ev.z;
  if (ev.button === 1) {             // middle-drag pans
    state.panDrag = { px: ev.px, c: state.panC ? state.panC.slice() : [sim.W / 2, sim.H / 2] };
    return;
  }
  // Drag in the empty letterbox band above or below the domain to stretch it
  // vertically. That band is dead space — nothing to draw on — so grabbing it
  // is unambiguous, and it is the natural place to reach for when a long flat
  // flume is squashed into a strip. A TAP there is a tap on empty space: it
  // clears a pinned readout and claims nothing (onUp).
  {
    const B = baseRect(), py = ev.px[1];
    if (state.zoom < 1.001 && (py < B.by - 2 || py > B.by + B.h + 2)) {
      state.vexDrag = { py, vex: state.vex, mid: B.by + B.h / 2, moved: false };
      return;
    }
  }
  // Pouring: a right-drag with a MOUSE, or the Pour tool. The tool exists
  // because a touch screen has no second button and no Shift — the old
  // `pointerType === "touch" && e.shiftKey` was unreachable on every device it
  // named, which made half of "draw an edge, pour water" impossible on a
  // phone. Right-drag still works regardless of the tool in your hand; a pen's
  // barrel button also reports button 2 and must not pour.
  if ((ev.button === 2 && ev.mouse) || state.tool === "pour") {
    state.pour = { x, z, r: state.brush * POUR.rBrush, vx: 0, vz: sim.p.g > 0.5 ? POUR.vDown : 0, lx: x, lz: z };
    sim.p.pour = state.pour;
    return;
  }
  // The Dye tool: press and HOLD. While the pointer is down the solver
  // releases ink at it every substep (FS_VOF, u_dyeInj) — into water only, so
  // a press in the air releases nothing until the drag reaches the water.
  if (state.tool === "dye") {
    state.dyeInj = { x, z, r: SIM.dyeInjRadius() };
    sim.p.dyeInj = state.dyeInj;
    return;
  }
  if (state.tool === "spout") {
    sim.p.source.x = x; sim.p.source.z = z; sim.p.source.on = 1;
    state.spoutDrag = true;
    syncPanel();
    return;
  }
  if (state.tool === "gauge") { placeGauge(x, z); return; }
  if (state.tool === "rake") { placeRake(x, z); return; }
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
    // GEOM.faceAt's tolerance is domain-space and isotropic, so a single
    // horizontal-axis conversion of GRAB_PX (the old approach here) makes
    // the grab radius wrong under vex for sloped or horizontal faces — the
    // same anisotropy nearSegment's per-axis scaling exists to handle. Pick
    // in screen space instead, GRAB_PX applied directly as a screen radius.
    const hit = faceAtPx(sim.solids || [], x, z, grabPx());
    if (!hit) { state.force = null; return; }
    if (state.force && state.force.solidId === hit.solid.id) {
      // Same solid again: cycle to its next named face.
      const ids = hit.solid.faces.map((fc) => fc.id);
      const k = (ids.indexOf(state.force.faceId) + 1) % ids.length;
      state.force = { solidId: hit.solid.id, faceId: ids[k], data: null, t0: sim.t };
    } else {
      state.force = { solidId: hit.solid.id, faceId: hit.faceId, data: null, t0: sim.t };
    }
    state.force.scale = forceScale();
    return;
  }
  // Only a drawing tool draws. Anything else in hand — above all NO tool, the
  // Read tool — makes the press a reading: a tap pins the readout card there
  // (onUp → tapRead), and a drag pans the view when it is zoomed in.
  if (state.tool === "wall" || state.tool === "erase" || state.tool === "valve") {
    state.drag = { x0: x, z0: z, x1: x, z1: z };
    return;
  }
  state.press = { px: ev.px, x, z, moved: false,
                  c: state.panC ? state.panC.slice() : [sim.W / 2, sim.H / 2] };
}

/** A tap with the Read tool: pin the readout card where it landed — the touch
 *  screen's hover. A tap on the pin itself, on dry ground or a solid, or
 *  outside the domain takes it away. A card that withholds the cursor readout
 *  (`readouts.cursor: false`) withholds this too; the Hover readout switch
 *  does NOT — it governs the card that FOLLOWS a mouse, and reading the water
 *  by touching it is the one way a tablet has to read it at all. */
function tapRead(x, z) {
  if (!UIMODE.shows("cursor")) { state.pin = null; return; }
  if (state.pin && pxApart(state.pin.x, state.pin.z, x, z) < grabPx() + 8) {
    state.pin = null; return;
  }
  const inside = x >= 0 && z >= 0 && x <= sim.W && z <= sim.H;
  const p = inside ? SIM.probe(x, z, measuringAvg()) : null;
  if (!p || !(p.f > 0.02)) { state.pin = null; return; }
  state.pin = { x, z }; state.pinProbe = p; state.pinTick = 3;
}

function onMove(e) {
  state.ptr = e.pointerType || "mouse";
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pointerPx(e));
  // A held-back finger (TOUCH_HOLD_MS) that starts to travel is a stroke, not
  // the start of a pinch: commit it from where it landed, then carry on.
  const pend = state.pending;
  if (pend && pend.pointerId === e.pointerId) {
    const px = pointerPx(e);
    if (Math.hypot(px[0] - pend.px[0], px[1] - pend.px[1]) < TOUCH_SLOP_PX) return;
    commitPending(pend);
  }
  if (state.pinch && pointers.size === 2) {
    // Two fingers zoom about their midpoint AND carry the view with it, so a
    // pinch can pan as well — the one-finger drag is the tool's.
    const ps = [...pointers.values()];
    const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
    const mid = [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2];
    if (d > 8 && state.pinch.d > 8) zoomAt(mid[0], mid[1], d / state.pinch.d);
    if (state.zoom > 1.001 && state.pinch.mid) {
      const c = state.panC || [sim.W / 2, sim.H / 2];
      state.panC = [c[0] - (mid[0] - state.pinch.mid[0]) * sim.W / view.w,
                    c[1] + (mid[1] - state.pinch.mid[1]) * sim.H / view.h];
      computeView();
    }
    state.pinch.d = d; state.pinch.mid = mid;
    return;
  }
  if (state.vexDrag) {
    // Pull away from the middle to stretch, toward it to squash.
    const d = state.vexDrag, py = pointerPx(e)[1];
    if (!d.moved && Math.abs(py - d.py) < TAP_PX) return;
    d.moved = true;
    state.vexAuto = false;            // dragging the band claims the number
    const r0 = Math.max(Math.abs(d.py - d.mid), 8);
    const r1 = Math.max(Math.abs(py - d.mid), 8);
    state.vex = Math.max(1, Math.min(12, d.vex * (r1 / r0)));
    computeView();
    return;
  }
  const [x, z] = pointerPos(e);
  state.cursor = [x, z];
  state.inside = x >= 0 && z >= 0 && x <= sim.W && z <= sim.H;
  // The Read tool's press: still a tap until it travels; then, zoomed in, a
  // one-finger (or left-button) drag pans the view. Never draws.
  if (state.press) {
    const p = state.press, px = pointerPx(e);
    if (!p.moved && Math.hypot(px[0] - p.px[0], px[1] - p.px[1]) >= TAP_PX) p.moved = true;
    if (p.moved && state.zoom > 1.001) {
      state.panC = [p.c[0] - (px[0] - p.px[0]) * sim.W / view.w,
                    p.c[1] + (px[1] - p.px[1]) * sim.H / view.h];
      computeView();
    }
    return;
  }
  // The Force tool's own hover pick: pure CPU (faceAtPx, screen-space),
  // recomputed on every move so the surface under the cursor lights up
  // BEFORE a click selects it — no SIM.faceForce call, so no GPU readback.
  // Never live mid-drag or mid-pinch: both of those `return` above this
  // point, and the Force tool itself never sets state.drag (onDown handles
  // its click and returns), so there is no drag state to guard against here.
  if (state.tool === "force") {
    const hit = state.inside ? faceAtPx(sim.solids || [], x, z, GRAB_PX) : null;
    state.forceHover = hit ? { solidId: hit.solid.id, faceId: hit.faceId } : null;
  } else if (state.forceHover) {
    state.forceHover = null;
  }
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
  if (state.dyeInj) {
    state.dyeInj.x = x; state.dyeInj.z = z;
    return;
  }
  if (state.pour) {
    const dt = POUR.dt, cl = (v) => Math.max(-POUR.vMax, Math.min(POUR.vMax, v));
    state.pour.vx = cl((x - state.pour.lx) / dt * POUR.gain);
    state.pour.vz = cl((z - state.pour.lz) / dt * POUR.gain + (sim.p.g > 0.5 ? POUR.vDown : 0));
    state.pour.x = x; state.pour.z = z;
    state.pour.lx = x; state.pour.lz = z;
    state.pour.r = state.brush * POUR.rBrush;
    return;
  }
  if (state.measDrag) {
    dragTo(state.measDrag, x, z, e);
    return;
  }
  if (state.fluxDrag) {
    dragTo(state.fluxDrag, x, z, e);
    return;
  }
  if (state.cvDrag) {
    dragTo(state.cvDrag, x, z, e);
    return;
  }
  if (state.drag) {
    dragTo(state.drag, x, z, e);
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  // A cancelled touch (the browser took the gesture) does nothing at all; a
  // finger lifted before its hold ran out was a tap, and acts now.
  if (e.type === "pointercancel") { cancelPending(); state.press = null; }
  else if (state.pending && state.pending.pointerId === e.pointerId) commitPending(state.pending);
  if (pointers.size < 2) state.pinch = null;
  state.panDrag = null;
  state.spoutDrag = false;
  if (state.press) {
    const p = state.press;
    state.press = null;
    if (!p.moved) tapRead(p.x, p.z);
    return;
  }
  if (state.vexDrag) {
    const moved = state.vexDrag.moved;
    state.vexDrag = null;
    if (!moved) state.pin = null;     // a tap on the empty band: empty space
    else syncPanel();
    return;
  }
  if (state.pour) { state.pour = null; sim.p.pour = null; }
  stopDye();
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
let lastT = performance.now(), acc = 0, probeTick = 0;
// Whether the previous frame was still warming up, so the end of spin-up can
// be caught as an edge rather than as a state — see tickFrame.
let wasWarming = false;

function frame(now) {
  requestAnimationFrame(frame);
  // 100 ms, not less: the governor may run as slow as CONFIG.frameCeilMs,
  // and a frame must be able to ask for the sim time its wall time covers or
  // ×1 is unreachable below 20 fps however fast the GPU is.
  const realDt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  gov.raf = true;
  tickFrame(realDt);
  gov.raf = false;
}

function tickFrame(realDt) {
  // The real interval since the previous frame started, unclamped: `realDt`
  // is capped at 100 ms for the sim's sake and is fixed at 1/60 under
  // APP.frames, and neither is what a frame actually cost. A gap longer than
  // A hidden tab stops requestAnimationFrame, so the gap across one is not a
  // frame: `visibilitychange` zeroes `gov.last` and that frame goes
  // unmeasured. Long frames are otherwise REAL and must be counted — under a
  // heavy load a spin-up readback frame can take more than a second, and a
  // governor that ignored those frames saw only the fast ones and ran away.
  // A scripted frame (APP.frames) is charged only what the previous scripted
  // frame took, start to return. The gap since then is the caller's own work
  // (smoke's hydro slam probes the surface between frames), and the gap since
  // a rAF frame or boot is whatever the script did before — APP.tick, a
  // settle — so the first scripted frame goes unmeasured. Charged with the
  // seconds of its __settle, the slam's first frame cut nsubMax from ~400 to
  // 2.7 and 150 frames meant to cover 15 s covered 0.7 s.
  const tNow = performance.now();
  const wallMs = !gov.raf ? (gov.end > gov.last ? gov.end - gov.last : 0)
               : gov.last ? tNow - gov.last : 0;
  gov.last = tNow;
  const measured = wallMs > 0 && wallMs < 10000;
  computeView();
  syncValveBtn();                // a valve drawn or erased shows / hides V on the strip
  collectStream();               // before this frame's substeps: see requestStream

  let simAdvanced = 0, warming = false, binding = false;
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
    warming = sim.t < warmTo;
    // The last of §9's reset conditions. Spin-up is an initialisation
    // interval, not part of the reported flow state — a pipe filling, a
    // channel finding its depth — and a window opened across it carries the
    // fill in every mean it reports. On the EDGE only: resetting while
    // `!warming` holds would zero T on every frame afterwards and there would
    // be no window at all. A no-op when no window is open.
    if (wasWarming && !warming) SIM.avgReset();
    wasWarming = warming;
    let want = warming ? state.nsubMax : Math.round(state.speed * realDt / h);
    // The cap is what holds this frame back — the only case in which the
    // governor may RAISE it (see governFrame).
    binding = want >= state.nsubMax;
    // nsubMax is fractional (the governor moves it continuously), so round at
    // the point of use — a substep count is an integer, and the panel prints it.
    want = Math.max(1, Math.round(Math.min(state.nsubMax, want)));
    simAdvanced = SIM.step(want);
    state.nsub = want;
    if (warming) {
      document.getElementById("hint").innerHTML = exWarm > 0
        ? EX.settleHint()
        : "establishing steady flow… <b>" + sim.t.toFixed(1) + " / " +
          state.scene.spinup.toFixed(0) + " s</b>";
      MINI.keep("hint");
      // A minimised tips pill still shows the countdown — reading a number
      // before the flow has settled is the classic worksheet mistake.
      MINI.pillText("hint", "▸ " + Math.max(0, warmTo - sim.t).toFixed(0) + " s");
      state.tipAt = 9.5;   // pop the first tip the moment spin-up finishes
      // …and for a card's own tips that is the FIRST one, not the second (a
      // scene's keeps its old order: it showed tips[0] before the countdown).
      if (exerciseTips()) state.tipIdx = -1;
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

  if (measured && !state.paused) governFrame(wallMs, warming, binding);

  // Average mode must describe ONE window: the field, the overlay and every
  // number derived from it. Mixing a mean field with live markers would put
  // two flow states in one screenshot.
  const avgCols = state.avg && SIM.avgActive() ? SIM.avgColumns() : null;
  refreshGrade();
  requestStream();
  // hv is the MEAN flow's velocity head or nothing (SIM.hydraulicGrade), so
  // it only ever reaches analyse alongside the mean columns it belongs to.
  const hv = avgCols && state.gradeBuf ? state.gradeBuf.hv : null;
  // The HGL rides the same buffer and goes with it whichever window it is:
  // the energy line analyse measures S_f off is h + hv, the line drawn.
  const hgl = state.gradeBuf && state.gradeAvg === !!avgCols ? state.gradeBuf : null;
  const analysis = avgCols
    ? OVERLAY.analyse(sim, avgCols.C, { averaged: true, hv, hgl })
    : OVERLAY.analyse(sim, col, { hv, hgl });
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

  // The brush ring is a TOOL's footprint: none with the Read tool in hand, and
  // none under a finger, which hides it anyway.
  const cur = state.inside && state.tool && state.ptr !== "touch" ? state.cursor : [-99, -99];
  const rg = rangeFor(fieldFor(state.mode).id);
  SIM.render(view, {
    mode: state.mode, vmax: vmaxFor(), lo: rg[0], hi: rg[1],
    // The same simulated step the particles were advanced by, so the trail
    // fades over a fixed span of FLOW rather than of wall clock.
    pdt: Math.min(simAdvanced, 0.05),
    // Dye is drawn whenever there is any (the Dye tool, or a scene's fixed
    // sources). It has no accumulator, so a live tracer over a mean picture
    // would put two flow states in one screenshot: under an open window it
    // stands down, and nothing is released either.
    dye: !measuringAvg(), dyeSeeds: state.dyeSeeds, particles: state.particles,
    // One window, one picture: the same flag the overlay above was built with.
    avg: state.avg,
    // The Dye tool's ring is its release radius, so the student sees where
    // the ink will go in before pressing.
    cursor: [cur[0], cur[1], state.tool === "erase" ? state.brush * 1.1
             : state.tool === "dye" ? SIM.dyeInjRadius() : state.brush * 0.55],
    guide: state.drag ? [state.drag.x0, state.drag.z0, state.drag.x1, state.drag.z1] : [0, 0, 0, 0],
    guideOn: !!state.drag,
  });

  drawOverlay(analysis);
  EX.tick();                    // the card's settle countdown, when one is open

  // The status line reads the whole window: simulated over wall seconds, and
  // frames over wall seconds. A frame with no measurable interval (the first,
  // or one after a hidden tab) still counts its sim time against `realDt`.
  statWin.wall += measured ? wallMs / 1000 : realDt;
  statWin.sim += simAdvanced; statWin.n++; statWin.sub += state.paused ? 0 : state.nsub;
  if (measured) { gov.win.W += wallMs; gov.win.N++; gov.win.S += state.paused ? 0 : state.nsub; }
  if (statWin.wall > 0.5) {
    governLearn();
    // Each window's own ratio, then blended half-and-half with the previous
    // reading (~1 s effective): a 0.5 s window holds only a handful of
    // frames when the GPU is busy, and one readback more or less moved it
    // ±30%. A paused window is taken as it stands, so a pause reads ×0 at once.
    const fps = statWin.n / statWin.wall, rt = statWin.sim / statWin.wall;
    const fresh = state.paused;
    state.fps = fresh ? fps : 0.5 * (state.fps + fps);
    state.rt = fresh ? rt : 0.5 * (state.rt + rt);
    state.nsubAvg = statWin.sub / statWin.n;
    statWin.wall = statWin.sim = statWin.n = statWin.sub = 0;
    updateStatus();
  }
  cycleTips(realDt);
}

function drawOverlay(A) {
  const ctx = octx;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.pxW, view.pxH);
  // What the overlay may print this frame: the instruments' boxes (VIEW →
  // Readouts) and the concepts this card's `ui.hide` withholds.
  OVERLAY.setPrint({ boxes: state.instReadouts,
                     energy: !UIMODE.hides("energy"),
                     critical: !UIMODE.hides("critical") });
  OVERLAY.drawFrame(ctx, view, sim);
  if (state.ruler) OVERLAY.drawRuler(ctx, view, sim);
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.vis.x, view.vis.y, view.vis.w, view.vis.h);
  ctx.clip();
  if (state.channel && sim.p.g > 0.5) {
    OVERLAY.drawChannel(ctx, view, A, sim, state.grade);
    if (state.labels) OVERLAY.drawProfileLabels(ctx, view, A, sim);
    if (state.jumps) OVERLAY.drawJumps(ctx, view, OVERLAY.findJumps(A, sim));
  }
  if (state.sline && state.slineBuf && state.slineBuf.avg === measuringAvg()) {
    OVERLAY.drawStreamlines(ctx, view, state.slineBuf);
  }
  // ONE velocity scale for every rake: the Speed field's held range (the
  // scene's `vmax` until someone Fits the Speed legend), so rakes compare side
  // by side and still water draws flat. Held, not tracked — the same rule as
  // the colour ranges; the bar at the bottom left says what it is.
  if (state.rakes.some((rk) => rk.buf)) {
    const uRef = Math.max(0.05, rangeFor("speed")[1]);
    const pxPerMps = Math.min(view.w * 0.13, 110) / uRef;
    state.rakes.forEach((rk) => { if (rk.buf) OVERLAY.drawRake(ctx, view, sim, rk, A, pxPerMps); });
    OVERLAY.drawRakeScale(ctx, view, pxPerMps);
  }
  // Wind over the water (FF-1): only a scene declaring a "tau" param has one.
  const tau = SIM.windTau();
  if (tau) {
    const td = (SIM.params().decl || []).find((d) => d.key === "tau");
    OVERLAY.drawWind(ctx, view, A, sim, tau, td ? Math.max(Math.abs(td.min), Math.abs(td.max)) : Math.abs(tau));
  }
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
  if (state.force && state.force.data) OVERLAY.drawForce(ctx, view, sim, state.force, state.forceSize);
  // The hover pick, faint — drawn UNDER the selected face's full-strength
  // stroke conceptually, but skipped entirely when it IS the selected face:
  // drawForce above already owns that stroke, and a second one under it
  // would only ever be redundant paint, never a visible style.
  if (state.forceHover && !(state.force &&
      state.forceHover.solidId === state.force.solidId &&
      state.forceHover.faceId === state.force.faceId)) {
    OVERLAY.drawForceHover(ctx, view, sim, state.forceHover);
  }
  drawMarkers(ctx);
  drawSpout(ctx);
  ctx.restore();
  OVERLAY.drawGaugeMarks(ctx, view, state.gauges);
  // The MARKS always stay — a gauge you cannot see is a gauge you place twice.
  // What a profile can withhold is the card that reads it out, for an exercise
  // that wants a prediction before a number; and the Readouts view toggle
  // (state.instReadouts) folds every instrument's boxes away — the gauges go
  // on recording either way. Each card plots its own gauge's quantity.
  const cards = UIMODE.shows("gauges") && state.instReadouts
    ? OVERLAY.drawGaugeCharts(ctx, view, state.gauges, (gg) => {
        const q = gaugeQty(gaugeFieldOf(gg));
        return { label: q.sym, unit: q.unit, get: (s) => s[q.id] * q.k,
                 series: gaugeSeries(gg), whole: state.gaugeSpan === "all" };
      })
    : [];
  GINSP.tick(cards);
  // The tips line centres on the width the corner cards leave (#hint, --gcw):
  // on an iPad it used to sit right on top of VC-2's pre-placed gauge chart.
  // The width counts the selector and ⤢ that hang off the card's left edge.
  const gcw = cards.length ? Math.round(cards[0].w + 76) : 0;
  if (gcw !== state.gcw) {
    state.gcw = gcw;
    document.documentElement.style.setProperty("--gcw", gcw + "px");
  }
  if (state.grade) OVERLAY.drawGradeLines(ctx, view, A, sim, state.gradeBuf);
  OVERLAY.flushKeys(ctx, view);       // one key column for every line drawn above
  // The pinned readout (a tap with the Read tool): the same card and the same
  // rows as the hover readout, held at the point that was touched and kept
  // live. It answers to the card's `readouts.cursor`, not to the Hover
  // readout switch — see tapRead.
  const pin = state.pin;
  if (pin && UIMODE.shows("cursor")) {
    if (--state.pinTick <= 0) { state.pinTick = 3; state.pinProbe = SIM.probe(pin.x, pin.z, measuringAvg()); }
    OVERLAY.drawPinMark(ctx, view, pin.x, pin.z);
    OVERLAY.drawCursorReadout(ctx, view, A, sim, pin.x, pin.z, state.pinProbe, UIMODE.rows());
  }
  // The hover card follows a mouse or a pen — never a finger, which would sit
  // on top of it — and stands down over the pin, which already says it.
  if (state.inside && !state.drag && UIMODE.shows("cursor") && state.hoverCard &&
      state.ptr !== "touch" &&
      !(pin && pxApart(pin.x, pin.z, state.cursor[0], state.cursor[1]) < 24)) {
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
/** The hit radius for the pointer that is pressing: a fingertip covers a
 *  dozen pixels on its own and lands a few off where its owner aimed, so a
 *  touch gets the 44 px target the guidelines ask for (a 22 px radius). */
function grabPx() { return state.ptr === "touch" ? 22 : GRAB_PX; }

/** Screen distance from a point to a drawn section, in pixels. */
function nearSegment(L, x, z) {
  const ax = (L.x1 - L.x0) * view.w / sim.W, az = (L.z1 - L.z0) * view.h / sim.H;
  const px = (x - L.x0) * view.w / sim.W, pz = (z - L.z0) * view.h / sim.H;
  const len2 = ax * ax + az * az;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, (px * ax + pz * az) / len2));
  return Math.hypot(px - ax * t, pz - az * t);
}

/** The nearest named face across `solids`, within `tolPx` SCREEN pixels —
 *  the Force tool's own pick, walking the same per-edge run GEOM.faceAt
 *  does but testing distance in screen space via `nearSegment`'s per-axis
 *  convention (dx and dz each scaled by their own view-w-over-sim-W /
 *  view-h-over-sim-H factor before the hypot) rather than GEOM.faceAt's
 *  single domain-space tolerance. GEOM.faceAt's distance is isotropic in
 *  domain space, so one domain-space radius cannot represent a round screen
 *  radius once vex makes the two axes' px-per-metre differ — a sloped or
 *  horizontal face would grab too wide or too narrow depending on its angle
 *  to the stretch. */
function faceAtPx(solids, x, z, tolPx) {
  let best = null;
  for (const solid of solids) {
    for (const face of solid.faces) {
      for (const e of GEOM.faceEdges(solid, face.id)) {
        const v0 = solid.verts[e], v1 = solid.verts[(e + 1) % solid.verts.length];
        const dist = nearSegment({ x0: v0[0], z0: v0[1], x1: v1[0], z1: v1[1] }, x, z);
        if (dist <= tolPx && (!best || dist < best.dist)) best = { solid, faceId: face.id, dist };
      }
    }
  }
  return best;
}

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
    // The marker rides the reservoir level, which is its ENERGY line — so
    // under prescribed q it stands a velocity head ABOVE the water arriving
    // at the inlet, and that gap is the point rather than a mismatch. It is
    // named on the chip so nobody reads the marker as a promised surface.
    const st = SIM.inletStage();
    const drawn = p.inflow.level - st.stage;
    // A card before the energy lecture (ui.hide "energy") gets the plain
    // reading — "reservoir level 3.16 m" — with neither the energy line nor
    // "head-driven" (a head, also L7) attached.
    level("L", p.inflow.level,
      UIMODE.hides("energy")
        ? "reservoir level " + p.inflow.level.toFixed(2) + " m"
        : "reservoir " + p.inflow.level.toFixed(2) + " m"
          + (p.inflow.free > 0.5 ? " · head-driven"
             : st.choked ? " · energy line · over-drawn"
             : drawn > 0.005 ? " · energy line" : ""),
      "#7fd4ff", "res");
  }
  if (p.tailwater.on > 0.5) {
    level("R", p.tailwater.level, "tailwater " + p.tailwater.level.toFixed(2) + " m", "#5fd08a", "tw");
  }
  const wall = SIM.wallPaddle();
  if (wall) {
    // The paddle at the left wall (WV-4). The solver imposes its velocity
    // a·ω·cos ωt at the mean position; it is drawn as a solid plate whose
    // face moves through the displacement a·sin ωt to scale, about a mean
    // 10 px off the wall, so it reads as the thing a wave flume has. The view
    // starts at x = 0, so the back half of the stroke is drawn squashed
    // against the wall (4 px) rather than off-screen.
    // The displacement and velocity are SIM.paddle's — the same numbers the
    // solver imposes, train envelope included. A flap (SIM.flapOn) is drawn
    // as a plate hinged at its hinge: the face leans, moving the full stroke
    // at the still-water level and nothing at the hinge.
    const f = flashOf("piston");
    const om = 2 * Math.PI / Math.max(p.wave.period, 0.05);
    const pd = SIM.paddle();
    const pxm = V.w / sim.W;
    const yTop = V.Y(sim.H * 0.95), yBot = V.Y(0);
    const flap = SIM.flapOn();
    const zh = flap ? SIM.paddleBed() - Math.max(0, p.wave.hinge || 0) : 0;
    const z0 = flap ? SIM.paddleBed() + p.wave.d : 1;
    const faceAt = (z) => V.X(0) + Math.max(4, 10 + pd.X * (flap ? (z - zh) / (z0 - zh) : 1) * pxm);
    const face = faceAt(sim.H * 0.95), faceBot = faceAt(flap ? zh : 0);
    ctx.save();
    ctx.fillStyle = "#c98a2e"; ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(V.X(0) - 2, yTop); ctx.lineTo(face, yTop);
    if (flap) { ctx.lineTo(faceBot, V.Y(zh)); ctx.lineTo(faceBot, yBot); }
    else ctx.lineTo(face, yBot);
    ctx.lineTo(V.X(0) - 2, yBot); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffcf7a"; ctx.lineWidth = 2 + 2 * f;
    ctx.beginPath(); ctx.moveTo(face, yTop);
    if (flap) {
      ctx.lineTo(faceBot, V.Y(zh)); ctx.stroke();
      ctx.beginPath(); ctx.arc(faceBot, V.Y(zh), 3.5, 0, 2 * Math.PI); ctx.stroke();   // the hinge
    } else { ctx.lineTo(face, yBot); ctx.stroke(); }
    // the push/pull arrow: its length is the paddle's speed now
    const u = pd.U / Math.max(p.wave.amp * om, 1e-6), ym = yTop + 34, L = 24 * u;
    if (Math.abs(L) > 3) {
      const tip = face + 6 + Math.max(0, L), tail = face + 6 + Math.max(0, -L);
      const [a, b] = L > 0 ? [tail, tip] : [tip, tail];
      const s = L > 0 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(a, ym); ctx.lineTo(b, ym);
      ctx.moveTo(b, ym); ctx.lineTo(b + s * 5, ym - 4);
      ctx.moveTo(b, ym); ctx.lineTo(b + s * 5, ym + 4);
      ctx.stroke();
    }
    OVERLAY.chip(ctx, face + 6, yTop + 12, flap ? "hinged flap" : "wave paddle", "#ffb648");
    ctx.restore();
  } else if (p.wave.on > 0.5) {
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
    if (key === "openL" && wall) continue;             // that edge IS the paddle
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
    "(Δt " + (state.simDt * 1e3).toFixed(2) + " ms × " + Math.round(state.nsubAvg || state.nsub) + ")";
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

/** THE TIPS LINE at the foot of the screen. A scene's `tips` are shared by
 *  every exercise built on it, so they cannot keep pace with a course: a
 *  scene used in the momentum lecture may not talk about a quantity taught
 *  later. An exercise card (or one of its tabs — EX.view merges it) may
 *  therefore carry its own `tips: [...]`, which replace the scene's while
 *  that exercise is on screen ON ITS OWN SCENE. A card's tips are plain text
 *  with the card's inline markup ({tool:…}, {btn:…}, {key:…}) drawn as the
 *  strip's own chips; a scene's tips stay HTML, exactly as before. With no
 *  card tips nothing changes — every scene and every card without `tips`
 *  behaves as it always did. */
function exerciseTips() {
  const ex = EX.current;
  return (ex && ex.scene === state.scene.id && Array.isArray(ex.tips) && ex.tips.length)
    ? ex.tips : null;
}
function tipList() { return exerciseTips() || state.scene.tips || []; }
function showTip(i) {
  const el = document.getElementById("hint"), own = exerciseTips();
  if (own) EX.rich(el, own[((i % own.length) + own.length) % own.length]);
  else el.innerHTML = state.scene.tips[i] || "";
  MINI.keep("hint");
}
/** Start the line again from the first tip — a card or a tab was just put
 *  on screen (or taken off it). While a settle countdown is running the
 *  frame loop owns the line, and the first tip follows it. */
function restartTips() {
  state.tipIdx = 0; state.tipAt = 0;
  showTip(0);
}

function cycleTips(dt) {
  const tips = tipList();
  if (!tips.length || sim.t < (state.scene.spinup || 0)) return;
  state.tipAt += dt;
  if (state.tipAt > 9) {
    state.tipAt = 0;
    state.tipIdx = (state.tipIdx + 1) % tips.length;
    showTip(state.tipIdx);
  }
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
  //
  // The Force selection has to drop here too: a drawn wrapper's id is its
  // POSITION in S.segs at the moment rasterise() runs ("drawn0", "drawn1",
  // …), not a stable identity, so an edit can renumber what a selection
  // points at — draw A ("drawn0"), draw B ("drawn1"), select B's face, Undo,
  // draw C, and without this C becomes "drawn1" and quietly inherits B's
  // selection. A scene's own solids() carry fixed ids and never have this
  // problem, but a drawn one always can — dropping the selection on every
  // edit (the same choke point averaging already resets through) is the
  // one answer that is right regardless of which id moved.
  // One listener on SIM.onGeometry, fired at the end of every rasterise()
  // (draw, undo, clear, a Geometry param, the boundary toggles) — so no edit
  // can skip it, which the old outside wrapper of SIM.rasterise/addSeg/
  // undoSeg/clearSegs could not promise (setParam called the module-local
  // rasterise). Not fired by build() or a valve flip: the Force pick survives
  // a resolution change and a V press (water-hammer cards).
  SIM.onGeometry((S) => {
    OVERLAY.resetEstimates(S);
    state.force = null;
    state.forceHover = null;
  });

  // The strip first: PICKER, EX and KEYS all light their own opener by id, so
  // the buttons have to exist before anything asks for one.
  buildToolbar();
  // …then the legend, which lights the strip's own Field button.
  LEGEND.build();
  // Public alias: worksheet rig scripts (WV-2, WV-3) call `window.syncTools()`
  // after arming a tool. main.js itself calls syncToolbar() directly.
  window.syncTools = syncToolbar;

  // The scene menu (see PICKER). Four ways in: the scene chip at the end of
  // the strip, the strip's Scenes icon, the panel's Scene row, and the S key.
  // Under a course menu with `scenes: false` the chip names the exercise and
  // opens the EXERCISE menu instead.
  const title = document.getElementById("title");
  const chipMenu = (el) => (scenesOffered() ? PICKER.toggle(el) : EX.toggle(el));
  title.onclick = (e) => chipMenu(e.currentTarget);
  title.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();          // not the global Space = pause
    chipMenu(title);
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
  addEventListener("resize", () => { if (LEGEND.menuIsOpen()) LEGEND.place(); });

  // The side panel's two handles. Wired here rather than when a brief is first
  // built, so folding works whatever ends up in the panel.
  document.getElementById("dockfold").onclick = (e) => { e.currentTarget.blur(); DOCK.fold(true); };
  document.getElementById("docktab").onclick = (e) => { e.currentTarget.blur(); DOCK.fold(false); };
  // The panel is inset by --dock, so a window resize can cross the width where
  // docking stops being affordable and it has to go back to overlaying.
  // A resize (or a rotated phone) changes what "fills the window" means, and
  // the panel opening or closing changes it too — DOCK.sync calls this as well.
  addEventListener("resize", () => { DOCK.sync(); fitBar(); applyAutoVex(); });
  // The fullscreen request/exit is asynchronous, so the button's icon and
  // label (both read `document.fullscreenElement` live) are repainted off
  // the browser's own event rather than off the click that asked for it.
  document.addEventListener("fullscreenchange", () => syncToolbar());

  buildPanel();
  const q = new URLSearchParams(location.search);
  loadScene(q.get("scene") || "sandbox", false);
  // `?scene=sandbox` is the sandbox door by address: building is what it is
  // for, so Wall is in hand. Any other boot opens on the neutral Read tool.
  if (q.get("scene") === "sandbox" && !q.get("ex")) state.tool = "wall";
  // Read the rig code BEFORE the exercise rewrites the address bar — setting
  // one up drops the hash exactly as a scene switch does.
  const rigCode = RIG.hashCode();
  // `?ex=<id>` is the lecturer's slide link: it sets the whole demo up, scene
  // included, so it runs INSTEAD of `?scene=` (which has already loaded, and
  // is what you are left on if the id is unknown to this build).
  const exId = q.get("ex");
  // `&tab=<key>` opens a tabbed card on that tab (CR-1's "forces"); an old
  // id that became a tab (`?ex=MM-2`) is resolved by EX itself.
  if (exId && !EX.pick(exId, q.get("tab") ? { tab: q.get("tab") } : undefined)) showToast("Unknown exercise", "\"" + exId +
    "\" is not in this build's teaching pack — loaded the scene instead.");
  // Embedded, the brief lives on the page around the frame; the card starts
  // folded to its tab so the water keeps the width (docs/design/2026-09-10-embed-design.md §1).
  if (EMBED && exId) EX.ready.then(() => DOCK.fold(true));
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
  showTip(0);

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
  canvas.addEventListener("pointerleave", () => { state.inside = false; state.forceHover = null; });
  canvas.addEventListener("pointerenter", () => state.inside = true);
  canvas.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener("wheel", (e) => {
    // Embedded, a plain wheel is the LMS page scrolling past; the frame is
    // not scrollable, so leaving the event alone (no preventDefault) chains
    // it to the parent page. Ctrl + wheel zooms — the same key a trackpad
    // pinch already reports.
    if (EMBED && !e.ctrlKey) { wheelHint(); return; }
    e.preventDefault();
    const [px, py] = pointerPx(e);
    // pinch-to-zoom trackpads report ctrlKey; give them a stronger response
    zoomAt(px, py, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });

  // Typing and chords belong to the user and the browser, never to a shortcut
  // (KEYMAP.typing) — checked before the modal cases, as an INPUT always was.
  KEYMAP.useTools(TOOL_KEYS, (n) => {
    const t = TOOLS[n - 1];
    const fam = familyOf(t[0]);
    // A hidden tool keeps its digit. Worksheets say "press 5", and renumbering
    // the tools under a profile would make the pack lie — so the key says why
    // the tool is not there rather than silently arming a different one.
    if (UIMODE.allows(fam, { tool: t[0], id: t[0] })) {
      state.tool = t[0]; state.forceHover = null; syncToolbar();
    } else {
      showToast(t[1] + " is off for this exercise",
                "The ⋯ button at the end of the strip brings every control back.");
    }
  });
  addEventListener("keydown", (e) => {
    if (KEYMAP.typing(e)) return;
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
    if (LEGEND.menuIsOpen() && e.key === "Escape") { e.preventDefault(); LEGEND.closeMenu(); return; }
    const row = KEYMAP.match(e);
    if (!row) return;
    // A held key must not flicker a toggle; only brush size and zoom repeat.
    if (e.repeat && !row.repeat) { if (e.key === " ") e.preventDefault(); return; }
    row.run(e);
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
      ? "Watch the gauges: a pressure wave runs up the pipe at c, and the pressure head jumps by c·Δv/g."
      : "Flow re-established.");
}

/** The strip's full-screen button, and the F key. `.catch(() => {})` because
 *  both calls reject when the browser refuses — no `allow="fullscreen"` on
 *  an enclosing iframe, or no user gesture — and the button (hidden via
 *  `when` when `document.fullscreenEnabled` is false) is the only feedback
 *  needed; there is nothing else to roll back. `syncToolbar` runs off the
 *  `fullscreenchange` event, not here, since the request is asynchronous. */
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

/** `url` with `embed` dropped from the query string — what the pop-out and
 *  the lecturer's snippet both hand a plain tab. `URL` keeps a `#rig=`
 *  fragment intact, which is the whole point: the pop-out carries the
 *  student's own drawing, just not the framing. */
function stripEmbed(url) {
  const u = new URL(url);
  u.searchParams.delete("embed");
  return u.toString();
}

/** Open in a new tab, embedded boots only: the pop-out is the way OUT of a
 *  700–1000 px frame to do the actual measuring. `RIG.link()` may be
 *  asynchronous (deflate), so the window opens synchronously inside the
 *  click — a popup blocker only tolerates that — and is navigated once the
 *  link resolves. */
function popOut() {
  const w = window.open("", "_blank");
  if (!w) return;                        // blocked: nothing else to do
  w.opener = null;
  RIG.link().then((u) => { w.location = stripEmbed(u); })
            .catch(() => { w.location = stripEmbed(location.href.split("#")[0]); });
}

// Debug handle. `frames` drives the loop by hand — the render loop stops when
// the page is hidden, so headless testing goes through here.
window.APP = {
  get sim() { return sim; }, get view() { return view; },
  embed: EMBED,                            // `?embed=1` — see docs/embedding.md
  state, loadScene, SIM, OVERLAY, SCENES, showToast, zoomAt, resetZoom,
  switchScene,                             // load a scene as a fresh ?scene= boot would
  PICKER,                                  // the scene menu
  EX,                                      // the exercise picker (see ?ex=<id>)
  TOOLS,                                   // the pointer tools, in number-key order
  // The chrome, for headless work: test/ui-smoke.mjs drives the strip, the
  // side panel and the start screen through here rather than by synthesising
  // clicks at pixel positions.
  ui: { TOOLBAR, DOCK, START, KEYS, fitBar, syncToolbar, FIELDS, rangeFor,
        RAMPS: Shaders.RAMPS, GAUGE_QTY },
  pickExercise: (id, d) => EX.pick(id, d === undefined ? undefined : { digit: d }),
  LEGEND,                                  // the colour key and field picker
  UIMODE,                                  // the exercise UI profile
  GINSP,                                   // gauge inspector windows
  RIG,                                     // rig save / share (see the Rig panel)
  inspect: (k) => GINSP.show(k || 0),
  gaugeCSV: (list) => GINSP.csv(list),     // the CSV text, without downloading
  clearGaugeHistory,
  tick: (n) => { for (let k = 0; k < (n || 1); k++) SIM.step(1); },
  frames: (n, dt) => {
    for (let k = 0; k < (n || 1); k++) { tickFrame(dt || 1 / 60); gov.end = performance.now(); }
  },
  probe: (x, z) => SIM.probe(x, z),
  particlePos: (n) => SIM.particlePos(n),  // x, z pairs — headless only
  placeGauge, placeRake,                   // place, or remove one already there
  removeGauge, clearAllGauges,             // what the ×s and the second Gauge press do
  boxForce: (x0, z0, x1, z1) => SIM.boxForce(x0, z0, x1, z1),   // one raw integral
  boxFlux: (x0, z0, x1, z1) => SIM.boxFlux(x0, z0, x1, z1),     // the whole budget
  faceForce: (sid, fid, avg) => SIM.faceForce(sid, fid, avg),   // the pressure diagram on one named face
  forceScale,                              // the scene's held diagram scale, {headMax} — headless tests pick with it
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
