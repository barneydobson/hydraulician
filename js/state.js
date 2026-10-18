"use strict";
/**
 * state.js — the app's configuration and mutable state: CONFIG (budgets and
 *   defaults), `state`, EMBED, and the view handles (canvas, over, octx,
 *   view, sim) the other files assign in boot.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: CONFIG, VEX_FIT_MAX, VEX_MAX, state, EMBED, canvas, over, octx, view, sim
 *
 * Reads:   none
 */
const CONFIG = {
  // Roughly ×2 a step. The top two are deliberately past the point where the
  // sim keeps up with real time — Δx is what buys you sharp jets, thin nappes
  // and waves that survive their own interface, and that is worth the wait.
  // Note the spin-up countdowns run flat out, so at Ultra a 90 s spin-up
  // (m2, c13) is a genuinely long wait before the scene settles.
  budgets: { Low: 45000, Medium: 95000, High: 175000, "Very high": 350000, Ultra: 700000 },
  defaultBudget: "Medium",
  // The frame-rate governor (see `governFrame` and the engineering notes,
  // "Frame pacing"). It regulates the SMOOTHED wall-clock frame interval, not
  // the CPU time of one frame: WebGL is asynchronous, so a frame's own timing
  // measures either the enqueue (~1 ms) or, on a readback frame, the whole
  // queue the previous frames left behind. Running: ~33 fps, the slowest the
  // interface still feels live, which buys the most substeps per frame.
  // Spin-up: ~5 fps, near flat out — nobody is reading the numbers yet, and
  // throughput only grows with the batch (the per-frame cost is amortised).
  frameTargetMs: 30,
  warmFrameTargetMs: 200,
  // ...but never steer slower than this outside spin-up, whatever the share
  // rule in governTarget asks for: much below ~7 fps a drag stops feeling
  // attached. (100 ms was tried: on hammer, whose particles make the render
  // heavy, it left the sim a third of the frame — 31% of flat out.)
  frameCeilMs: 150,
  histMax: 900,               // samples the CORNER card plots — its look is fixed
  // The deep store behind the inspector. Sampling is one point per rendered
  // frame, so ~60 per simulated second at speed 1: 20 000 is ~5.5 minutes of
  // sim time, and four gauges of it is a couple of megabytes. Oldest drops.
  logMax: 20000,
  tracerPath: 260,            // points of orbit history kept per tracer
  gaugeColours: ["#7fd4ff", "#ffb648", "#5fd08a", "#ff8fa3"],
  // Instrument ceilings: past these nobody can tell the marks apart, and the
  // questions they answer need two. The oldest gives way (one per gauge colour).
  maxGauges: 4, maxFlux: 4, maxRakes: 2,
};

// Vertical exaggeration has two ceilings: the FITTED one (autoVex never goes
// past it — beyond about ×8 the water stops looking like water) and the HAND
// one (the slider's max and the letterbox drag's clamp).
const VEX_FIT_MAX = 8, VEX_MAX = 12;

const state = {
  scene: null, budget: CONFIG.defaultBudget,
  // The pointer tool in hand. NULL is the neutral "Read" tool: a press never
  // draws, it pins the readout card where it lands (state.pin). Only the
  // sandbox door arms Wall (newSandbox, a `?scene=sandbox` boot): everywhere
  // else building waits until Wall, Erase, Valve or Pour is CHOSEN — a
  // lecturer on an iPad touched an exercise to read it and found blocks.
  tool: null, brush: 0.055,
  mode: 0, range: {}, particles: false, dyeSeeds: false, channel: true, labels: true, jumps: true,
  ui: null,                   // the resolved UI profile; UIMODE.full() when absent
  // The legend sits top right, immediately left of the Controls panel, until
  // somebody drags it; then the position is theirs for the session and stops
  // following the panel. Not stored anywhere on purpose: a `?ex=` link has to
  // look the same for every student who opens it.
  legendPlaced: false,
  // The two grade lines, on their own switch beside the channel overlay. Off
  // by default: most scenes are free-surface, where the HGL lies on the water
  // line and adds nothing.
  grade: false, gradeBuf: null, gradeTick: 0, gradeAvg: false,
  // Streamlines: contours of the stream function at equal Δψ (js/stream.js),
  // refreshed a few times a second off an ASYNC readback (collectStream / requestStream).
  // `slineN` is roughly how many tubes span the flow; `slineDpsi` is the
  // spacing actually in use, HELD between refreshes so the lines do not
  // breathe as the range jitters, and re-picked only when it drifts far off.
  sline: false, slineN: 12, slineBuf: null, slineGrid: null,
  slineDpsi: 0, slineAt: 0, slineT: -1,
  ruler: true,                // metre ticks on the view edges — a workspace preference
  // The instruments' on-canvas readout BOXES — gauge corner cards, the
  // Control volume's budget and face numbers, flux-section and rake chips,
  // the pressure-force values — folded away together (VIEW → Readouts, I).
  // The instruments keep measuring and recording while they are hidden.
  instReadouts: true,
  // The card that follows the cursor over the water (VIEW → Hover readout).
  // A profile's `readouts.cursor: false` still withholds it outright.
  hoverCard: true,
  measure: null, measDrag: null,   // the tape measure: {x0,z0,x1,z1} in metres
  cv: null, cvDrag: null,          // the control volume: box + EMA budget
  flux: [], fluxDrag: null,        // sections: what crosses each one, EMA'd
  cvShow: "Q",                     // which per-edge quantity the box labels
  force: null,                     // the pressure-force face: {solidId, faceId, data, t0}
  // The face the Force tool is hovering over, BEFORE a click selects it: pure
  // CPU pick (faceAtPx), never a faceForce readback — {solidId, faceId} or
  // null. Cleared on a tool change, a scene load, and the pointer leaving the
  // domain, so it never outlives the pick it was computed from.
  forceHover: null,
  // The pressure diagram's scale, ONE per scene: {headMax} in metres of
  // head, set from the largest pressure on any wall the first time a face is
  // picked and shared by every selection after it, so the diagram does not
  // resize as you move from face to face. Cleared on a scene load only.
  forceScale: null,
  // How big that diagram is drawn: a multiplier on the 56 px the largest
  // head maps to. A Controls row (and so a viewParams key), because a
  // submerged face in a narrow passage can have its diagram run into the
  // opposite wall's — the culvert roof of HS-1's dyke hangs its arrows into
  // a 0.6 m culvert — and the lecturer wants to shrink it, not the scale.
  forceSize: 1,

  paused: false, speed: 1.0, nsub: 24, nsubMax: 400,
  // Average is a measurement mode, not a blur filter (docs/averaging.md
  // §4.3): while it is up, the field, the channel overlay and every number
  // derived from it must describe the SAME averaging window. `setAverage` is
  // the single writer — the strip's A, the panel checkbox and APP.avg.toggle
  // all go through it, because switching modes has to open or release the
  // accumulators and reset the overlay's EMAs in BOTH directions.
  avg: false,
  gauges: [], rakes: [], gaugeField: "h", tracers: null, tracerN: 9,
  gaugeSpan: "window",        // the corner charts: "window" (scrolling) or "all" (t = 0 → now)
  gaugeT: -1,                 // sim time of the last gauge sample — see sampleGauges
  gaugeSeq: 0,                // ever-increasing gauge id, for inspector identity
  deliv: null,                // measured inlet discharge / level, for the panel
  cursor: [0, 0], inside: false, hover: null,
  // The pinned readout: the touch screen's hover. A tap (or a click) with no
  // tool in hand puts the readout card at {x, z} and leaves it there until
  // the next tap elsewhere, or a tap on dry ground / outside the domain.
  // `ptr` is the pointer type of the last canvas event — the floating hover
  // card follows a mouse or pen, never a finger (it would sit under it).
  pin: null, pinProbe: null, pinTick: 0, ptr: "mouse", pending: null, press: null,
  barTop: 0,                  // px a wrapped touch strip takes off the top of the view (fitBar)
  drag: null, pour: null, dyeInj: null,
  zoom: 1, vex: 1, panC: null, panDrag: null, pinch: null, spoutDrag: false, vexDrag: null,
  // The exaggeration is fitted to the window until somebody sets it by hand —
  // then it is theirs, and a resize stops moving it (see autoVex).
  vexAuto: true,
  flashKey: null, flashT: 0,
  fps: 60, rt: 1, simDt: 0,
  tipIdx: 0, tipAt: 0,
};

/** `?embed=1`: the app is sitting in an LMS iframe (docs/embedding.md). Read
 *  once — an opt-in by URL, not `window !== top`, so a plain tab can test it. */
// On for `?embed=1` and the bare `?embed` (empty value); off for `?embed=0`,
// `?embed=false` and any other explicit value.
const EMBED = (() => {
  const v = new URLSearchParams(location.search).get("embed");
  return v === "" || v === "1";
})();

let canvas, over, octx, view, sim;

