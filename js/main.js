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
  mode: 0, particles: false, dye: true, channel: true, labels: true, jumps: true,
  paused: false, speed: 1.0, nsub: 24, nsubMax: 400,
  gauges: [], rakes: [], gaugeField: "head", tracers: null, tracerN: 9,
  gaugeT: -1,                 // sim time of the last gauge sample — see sampleGauges
  gaugeSeq: 0,                // ever-increasing gauge id, for inspector identity
  deliv: null,                // measured inlet discharge / level, for the panel
  cursor: [0, 0], inside: false, hover: null,
  drag: null, pour: null,
  zoom: 1, vex: 1, panC: null, panDrag: null, pinch: null, spoutDrag: false, vexDrag: null,
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
  const [dx0, dy0] = view.toDomain(px, py);
  const B = baseRect();
  state.zoom = z1;
  state.panC = [
    dx0 + (B.bx + B.w / 2 - px) * sim.W / (B.w * z1),
    dy0 + (py - B.by - B.h / 2) * sim.H / (B.h * z1),
  ];
  computeView();
}

function resetZoom() { state.zoom = 1; state.panC = null; state.vex = 1; }

// ------------------------------------------------------------------ scenes
function loadScene(id, keepDrawing) {
  const sc = SCENES.byId[id];
  state.scene = sc;
  sim = SIM.build(sc, CONFIG.budgets[state.budget], keepDrawing);
  state.mode = sc.mode;
  state.channel = !!sc.chan;
  state.labels = sc.labels === undefined ? true : !!sc.labels;
  // A scene whose whole subject is the particle motion should not open with
  // the particles switched off and a tip asking you to find the key.
  if (sc.particles !== undefined) state.particles = !!sc.particles;
  state.gauges.length = 0; state.rakes.length = 0; state.tracers = null;
  state.gaugeT = -1;
  state.deliv = null;
  state.tipIdx = 0; state.tipAt = 0;
  state.nsub = 24;
  resetZoom();
  // A scene may open zoomed on the thing it is about. The wave flumes need
  // it: a 12 m flume letterboxes to a strip a couple of hundred pixels tall,
  // and a 100 mm orbit in that is about one pixel. `0` still resets.
  if (sc.view) {
    if (sc.view.vex) state.vex = sc.view.vex;
    if (sc.view.zoom) { state.zoom = sc.view.zoom; state.panC = [sc.view.cx, sc.view.cy]; }
  }
  computeView();
  syncPanel();
  showToast(sc.name, sc.blurb);
  document.getElementById("sceneName").textContent = sc.name;
  document.getElementById("sceneKey").textContent = sc.key;
  const sel = document.getElementById("sceneSel");
  if (sel && sel.value !== sc.id) sel.value = sc.id;
}

// ------------------------------------------------------------------- panel
const CONTROLS = [
  { h: "Flow" },
  { id: "speed", label: "Speed", min: 0.02, max: 3, step: 0.01, log: true,
    get: () => state.speed, set: (v) => state.speed = v,
    fmt: (v) => "×" + v.toFixed(2) + " real time",
    info: "How much simulated time passes per second of wall clock. Water hammer wants slow motion; backwater curves want fast." },
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
      // delivering instead, and take y_c from that.
      const D = state.deliv;
      if (sim.p.inflow.free > 0.5) {
        return "head-driven  ·  q → " + (D ? D.q.toFixed(3) : "—") + " m²/s delivered" +
               (D ? "   y_c = " + Math.pow(D.q * D.q / 9.81, 1 / 3).toFixed(3) + " m" : "");
      }
      return v.toFixed(3) + " m²/s per m width  →  " + SIM.inletVel().toFixed(2) + " m/s" +
             "   y_c = " + Math.pow(v * v / 9.81, 1 / 3).toFixed(3) + " m";
    },
    info: "Unit discharge entering the domain, converted to an inlet velocity using the depth available over the bed. Critical depth y_c = (q²/g)^⅓ follows directly from it. Under head-driven inflow this slider is inert and the note prints the measured delivered discharge instead." },
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
    get: () => sim.p.source.vy, set: (v) => sim.p.source.vy = v,
    fmt: (v) => v.toFixed(2) + " m/s" },

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
    get: () => sim.p.c, set: (v) => sim.p.c = v,
    fmt: (v) => v.toFixed(0) + " m/s   (Δh from Δv: " + (v / 9.81).toFixed(1) + " m per m/s)",
    info: "The Preissmann-slot stiffness. Pressure waves travel at this speed, so it sets the water-hammer surge ΔH = cΔv/g. Lower c = bigger time step = faster run." },
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
    get: () => state.vex, set: (v) => { state.vex = v; computeView(); },
    fmt: (v) => (v < 1.05 ? "true scale (1 : 1)" : "× " + v.toFixed(1) + " vertical"),
    info: "Stretches the view vertically. A 12 m × 1.5 m flume is a thin strip at true scale, so a 0.1 m wave is a few pixels — every long-section in hydraulics is drawn exaggerated for the same reason. You can also drag the empty band above or below the domain." },
  { id: "mode", type: "select", label: "Field",
    opts: [["0", "Water"], ["1", "Pressure head"], ["2", "Speed"], ["3", "Froude number"],
           ["4", "Vorticity"], ["5", "Momentum flux"]],
    get: () => String(state.mode), set: (v) => state.mode = +v },
  { id: "channel", type: "check", label: "Open-channel overlay",
    get: () => state.channel, set: (v) => state.channel = v,
    info: "Critical depth y_c, normal depth y_n and the energy grade line, computed per column from the live depth and unit discharge." },
  { id: "labels", type: "check", label: "Profile labels",
    get: () => state.labels, set: (v) => state.labels = v,
    info: "Names each reach by its gradually-varied-flow class. The letter is the bed (Mild, Steep, Critical, Horizontal, Adverse); the number is the zone — 1 above both y_n and y_c, 2 between them, 3 below both." },
  { id: "jumps", type: "check", label: "Jump analysis",
    get: () => state.jumps, set: (v) => state.jumps = v,
    info: "Brackets every hydraulic jump and compares the measured conjugate depth against the momentum prediction y₂/y₁ = ½(√(1+8Fr₁²) − 1)." },
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
    opts: [["head", "Piezometric head"], ["depth", "Depth"], ["speed", "Speed"]],
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
  CONTROLS.forEach((c) => {
    if (c.h) { const el = document.createElement("h3"); el.textContent = c.h; p.appendChild(el); return; }
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
    p.appendChild(row);
    const note = document.createElement("div"); note.className = "notes"; note.id = "n_" + c.id;
    p.appendChild(note);
  });
}

function syncPanel() {
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

// ------------------------------------------------------------------ tools
const TOOLS = [
  ["wall", "Wall", "Left-drag a straight edge"],
  ["erase", "Erase", "Left-drag to remove"],
  ["valve", "Valve", "Draw a gate you can slam with V"],
  ["spout", "Spout", "Click or drag to move the falling inflow"],
  ["gauge", "Gauge", "Click to log head / depth"],
  ["rake", "Rake", "Click for a velocity–depth profile"],
  ["tracer", "Tracers", "Click to drop a column of orbit tracers"],
];

function snap(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const r = Math.hypot(dx, dy);
  return [x0 + r * Math.cos(a), y0 + r * Math.sin(a)];
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
  const [x, y] = pointerPos(e);
  state.cursor = [x, y];
  if (pointers.size === 2) {         // second finger: abandon tools, pinch
    state.drag = null; state.spoutDrag = false;
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
      return;
    }
  }
  if (e.button === 2 || e.pointerType === "touch" && e.shiftKey) {
    state.pour = { x, y, r: state.brush * 4, vx: 0, vy: sim.p.g > 0.5 ? -2.0 : 0, lx: x, ly: y };
    sim.p.pour = state.pour;
    return;
  }
  if (state.tool === "spout") {
    sim.p.source.x = x; sim.p.source.y = y; sim.p.source.on = 1;
    state.spoutDrag = true;
    syncPanel();
    return;
  }
  if (state.tool === "gauge") {
    if (state.gauges.length >= 4) state.gauges.shift();
    state.gauges.push({ x, y, hist: [], log: [], id: ++state.gaugeSeq,
                        colour: CONFIG.gaugeColours[state.gauges.length % 4] });
    syncPanel();                      // the inspector row lists the live gauges
    return;
  }
  if (state.tool === "rake") {
    if (state.rakes.length >= 2) state.rakes.shift();
    state.rakes.push({ x, buf: null });
    return;
  }
  if (state.tool === "tracer") {
    // Click anywhere in the water to hang a fresh column of tracers there;
    // click on dry ground to clear them.
    seedTracers(x);
    syncPanel();
    return;
  }
  state.drag = { x0: x, y0: y, x1: x, y1: y };
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
  const [x, y] = pointerPos(e);
  state.cursor = [x, y];
  state.inside = x >= 0 && y >= 0 && x <= sim.W && y <= sim.H;
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
    sim.p.source.x = x; sim.p.source.y = y;
    return;
  }
  if (state.pour) {
    const dt = 1 / 60;
    state.pour.vx = Math.max(-6, Math.min(6, (x - state.pour.lx) / dt * 0.35));
    state.pour.vy = Math.max(-6, Math.min(6, (y - state.pour.ly) / dt * 0.35 + (sim.p.g > 0.5 ? -2 : 0)));
    state.pour.x = x; state.pour.y = y;
    state.pour.lx = x; state.pour.ly = y;
    state.pour.r = state.brush * 4;
    return;
  }
  if (state.drag) {
    if (e.shiftKey) { const s = snap(state.drag.x0, state.drag.y0, x, y); state.drag.x1 = s[0]; state.drag.y1 = s[1]; }
    else { state.drag.x1 = x; state.drag.y1 = y; }
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) state.pinch = null;
  state.panDrag = null;
  state.spoutDrag = false;
  if (state.vexDrag) { state.vexDrag = null; syncPanel(); return; }
  if (state.pour) { state.pour = null; sim.p.pour = null; }
  if (state.drag) {
    const d = state.drag;
    const kind = state.tool === "erase" ? 0 : state.tool === "valve" ? 128 : 255;
    const th = state.tool === "erase" ? state.brush * 2.2 : state.brush;
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < sim.dx) {
      SIM.addSeg(d.x0, d.y0, d.x0 + sim.dx * 0.5, d.y0, th, kind);   // a dot
    } else {
      SIM.addSeg(d.x0, d.y0, d.x1, d.y1, th, kind);
    }
    state.drag = null;
  }
}

// -------------------------------------------------------------------- loop
let lastT = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, probeTick = 0;

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
    const warming = sim.t < (state.scene.spinup || 0);
    let want = warming ? state.nsubMax : Math.round(state.speed * realDt / h);
    want = Math.max(1, Math.min(state.nsubMax, want));
    simAdvanced = SIM.step(want);
    state.nsub = want;
    if (warming) {
      document.getElementById("hint").innerHTML =
        "establishing steady flow… <b>" + sim.t.toFixed(1) + " / " +
        state.scene.spinup.toFixed(0) + " s</b>";
      state.tipAt = 9.5;   // pop the first tip the moment spin-up finishes
    }
  }
  const col = SIM.columns();
  if (state.particles) SIM.advanceParticles(Math.min(realDt, 0.033) * Math.min(state.speed, 1.5));

  const simMs = performance.now() - t0;
  // AIMD governor: creep up while there is headroom, back off hard when not
  if (simMs > CONFIG.frameBudgetMs * 1.6) state.nsubMax = Math.max(2, state.nsubMax * 0.82);
  else if (simMs < CONFIG.frameBudgetMs * 0.75) state.nsubMax = Math.min(4000, state.nsubMax * 1.05 + 1);

  const analysis = OVERLAY.analyse(sim, col);
  sampleGauges(analysis);
  sampleRakes();
  sampleInlet(analysis);
  advanceTracers(simAdvanced);
  // Scenes whose subject is the orbital motion seed their own tracer rake as
  // soon as there is enough water to hang it in.
  if (!state.tracers && state.scene.tracerX && sim.t > 0.5) seedTracers(state.scene.tracerX);

  const cur = state.inside ? state.cursor : [-99, -99];
  SIM.render(view, {
    mode: state.mode, vmax: vmaxFor(), hmax: hmaxFor(analysis),
    dye: state.dye, particles: state.particles,
    cursor: [cur[0], cur[1], state.tool === "erase" ? state.brush * 1.1 : state.brush * 0.55],
    guide: state.drag ? [state.drag.x0, state.drag.y0, state.drag.x1, state.drag.y1] : [0, 0, 0, 0],
    guideOn: !!state.drag,
  });

  drawOverlay(analysis);

  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 0.5) {
    state.fps = fpsN / fpsAcc;
    state.rt = simAdvanced / Math.max(realDt, 1e-4);
    fpsAcc = 0; fpsN = 0;
    updateStatus();
  }
  cycleTips(realDt);
}

function vmaxFor() { return state.scene.vmax || 4; }
function hmaxFor() {
  return state.mode === 1 ? (state.scene.headMax || 3)
                         : (state.scene.hmax || (state.scene.g ? 2.0 : 1));
}

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
  state.gauges.forEach((gg) => {
    const pr = SIM.probe(gg.x, gg.y);
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(gg.x / sim.dx)));
    const s = { t: sim.t, head: gg.y + pr.head, depth: A.h[i], speed: pr.speed };
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
function sampleRakes() {
  state.rakes.forEach((rk) => { const r = SIM.rake(rk.x, rk.buf); rk.buf = r.buf; rk.i = r.i; });
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
    if (!(A.onBed[i] && A.h[i] > 3 * sim.dx)) continue;
    q += A.q[i]; s += A.bed[i] + A.h[i]; n++;
  }
  if (!n) { state.deliv = null; return; }
  q /= n; s /= n;
  const d = state.deliv || (state.deliv = { q, level: s });
  d.q += 0.05 * (q - d.q);              // A.q/A.h already carry a 10 %/frame
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
    const y = lo + (hi - lo) * (k / (n - 1));
    state.tracers.list.push({ x, y, x0: x, y0: y, path: [] });
  }
}

/** Advect the tracers by the sim time that just elapsed, RK2. */
function advanceTracers(dtSim) {
  const T = state.tracers;
  if (!T || !T.list.length || dtSim <= 0) return;
  let x0 = Infinity, x1 = -Infinity;
  T.list.forEach((t) => { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); });
  const pad = 6 * sim.dx;
  const P = SIM.patch(x0 - pad, x1 + pad, T.buf);
  T.buf = P.buf;
  // Sub-step: an orbit is a rotation, and one big explicit step spirals out.
  const nsub = Math.max(1, Math.min(8, Math.ceil(dtSim / 0.02)));
  const h = dtSim / nsub;
  for (const t of T.list) {
    for (let s = 0; s < nsub; s++) {
      const a = SIM.patchVel(P, t.x, t.y);
      const b = SIM.patchVel(P, t.x + a[0] * h, t.y + a[1] * h);
      t.x += 0.5 * (a[0] + b[0]) * h;
      t.y += 0.5 * (a[1] + b[1]) * h;
    }
    t.x = Math.max(sim.dx, Math.min(sim.W - sim.dx, t.x));
    t.y = Math.max(sim.dx, Math.min(sim.H - sim.dx, t.y));
    // A tracer that has drifted right out of its rake is no longer showing
    // the orbit at the station it was seeded at, so put it back.
    if (Math.abs(t.x - t.x0) > 0.9) { t.x = t.x0; t.y = t.y0; t.path.length = 0; }
    t.path.push(t.x, t.y, sim.t);
    while (t.path.length > 6 && sim.t - t.path[2] > T.trail) t.path.splice(0, 3);
  }
}

function drawOverlay(A) {
  const ctx = octx;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.pxW, view.pxH);
  OVERLAY.drawFrame(ctx, view, sim);
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
  drawMarkers(ctx);
  drawSpout(ctx);
  ctx.restore();
  OVERLAY.drawGaugeMarks(ctx, view, state.gauges);
  const fld = state.gaugeField;
  const cards = OVERLAY.drawGaugeCharts(ctx, view, state.gauges, fld,
    fld === "head" ? "H" : fld === "depth" ? "h" : "|u|",
    fld === "speed" ? "m/s" : "m");
  GINSP.tick(cards);
  if (state.inside && !state.drag) {
    // Another readPixels sync — once every few frames is plenty for a hover
    // readout, and it keeps the sim loop off the GPU's critical path.
    if (--probeTick <= 0) { probeTick = 3; state.hover = SIM.probe(state.cursor[0], state.cursor[1]); }
    OVERLAY.drawCursorReadout(ctx, view, A, sim, state.cursor[0], state.cursor[1], state.hover);
  }
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
  const level = (side, y, label, colour, key) => {
    const x0 = side === "L" ? V.X(0) : V.X(sim.W);
    const dir = side === "L" ? 1 : -1;
    const ypx = V.Y(y);
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
  const x = view.X(s.x), y = view.Y(s.y);
  const r = Math.max(5, s.r / sim.W * view.w);
  const fl = flashOf("spout");
  ctx.save();
  ctx.globalAlpha = Math.min(1, (s.on > 0.5 ? 0.9 : 0.35) + 0.4 * fl);
  ctx.strokeStyle = "#7fd4ff"; ctx.lineWidth = 1.6 + 2 * fl;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
  ctx.setLineDash([]);
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > 0.05) {
    const ax = s.vx / sp, ay = -s.vy / sp, L = r + 12;
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
  document.getElementById("status").textContent =
    sim.nx + "×" + sim.ny + " · Δx " + (sim.dx * 1000).toFixed(0) + " mm · " +
    "t " + sim.t.toFixed(1) + " s · ×" + state.rt.toFixed(2) + " RT · " +
    state.fps.toFixed(0) + " fps" +
    (state.zoom > 1.001 ? " · zoom ×" + state.zoom.toFixed(1) : "");
  document.getElementById("n_speed").textContent =
    "×" + state.speed.toFixed(2) + " asked, ×" + state.rt.toFixed(2) + " achieved  " +
    "(Δt " + (state.simDt * 1e3).toFixed(2) + " ms × " + state.nsub + ")";
  // The delivered numbers move on their own, so their notes are refreshed on
  // this cadence rather than only when a slider is touched.
  if (state.deliv) { refreshNote("inQ"); refreshNote("inLevel"); }
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

// -------------------------------------------------------- gauge inspector
/** A draggable DOM window per gauge: identity, live values, and the WHOLE
 *  stored history on a chart you can pan and zoom.
 *
 *  The corner cards are deliberately untouched — every shipped worksheet
 *  screenshot has one in it — so this reads the same samples from the deep
 *  `log` store and leaves `drawGaugeCharts` alone. It is DOM rather than more
 *  canvas because the things it needs (drag, wheel-zoom over a small target,
 *  a download button, text you can select) are what the DOM is for. */
const GINSP = (() => {
  const FIELDS = [
    ["head",  "H", "m",   "piezometric head, z + p/ρg"],
    ["depth", "h", "m",   "water depth of the column"],
    ["speed", "|u|", "m/s", "speed at the gauge cell"],
  ];
  const open = [];              // live inspector windows
  const posMemo = {};           // gauge id → [left, top], so reopening lands home
  let host = null, btnHost = null, btns = [];

  function hosts() {
    if (!host) {
      host = document.createElement("div"); host.id = "ginspHost";
      document.body.appendChild(host);
      btnHost = document.createElement("div"); btnHost.id = "gcardBtns";
      document.body.appendChild(btnHost);
    }
  }

  function fmtT(t) { return (t < 10 ? t.toFixed(2) : t.toFixed(1)) + " s"; }

  /** Open (or front) the inspector for gauge index k. */
  function show(k) {
    const g = state.gauges[k];
    if (!g) return null;
    const was = open.find((o) => o.g === g);
    if (was) { was.el.style.zIndex = String(21 + open.length); return was; }
    if (!g.id) g.id = ++state.gaugeSeq;   // rig scripts push bare gauge objects
    hosts();
    const el = document.createElement("div");
    el.className = "ginsp glass";
    el.innerHTML =
      '<div class="ginsp-h">' +
        '<span class="ginsp-dot"></span><b class="ginsp-name"></b>' +
        '<span class="ginsp-pos"></span><span class="ginsp-grow"></span>' +
        '<button class="ginsp-x" title="Close">×</button>' +
      '</div>' +
      '<div class="ginsp-vals"></div>' +
      '<div class="ginsp-tabs"></div>' +
      '<canvas class="ginsp-c"></canvas>' +
      '<div class="ginsp-foot">' +
        '<button class="ginsp-b" data-a="csv">⤓ CSV this gauge</button>' +
        '<button class="ginsp-b" data-a="csvall">⤓ CSV all gauges</button>' +
        '<span class="ginsp-span"></span>' +
      '</div>' +
      '<div class="ginsp-cap">Wheel zooms the time axis about the cursor · drag pans · ' +
        'double-click fits all. History freezes while paused; <b>R</b> (reset water) ' +
        'and loading a scene clear it.</div>';
    host.appendChild(el);
    const o = { g, el, field: state.gaugeField, t0: 0, t1: 1, fit: true,
                hover: null, drag: null, cv: el.querySelector(".ginsp-c") };
    open.push(o);

    const p = posMemo[g.id] ||
      [Math.max(8, innerWidth - 428), 76 + 26 * (open.length - 1)];
    el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
    el.style.zIndex = String(21 + open.length);
    el.addEventListener("pointerdown", () => {
      el.style.zIndex = String(22 + open.length);
    }, true);

    // ---- header drag
    const hd = el.querySelector(".ginsp-h");
    hd.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("ginsp-x")) return;
      e.preventDefault();
      try { hd.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
      o.drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    });
    hd.addEventListener("pointermove", (e) => {
      if (!o.drag) return;
      const L = Math.max(0, Math.min(innerWidth - el.offsetWidth, e.clientX - o.drag.dx));
      const T = Math.max(0, Math.min(innerHeight - 40, e.clientY - o.drag.dy));
      el.style.left = L + "px"; el.style.top = T + "px";
      posMemo[g.id] = [L, T];
    });
    const endDrag = () => { o.drag = null; };
    hd.addEventListener("pointerup", endDrag);
    hd.addEventListener("pointercancel", endDrag);
    el.querySelector(".ginsp-x").onclick = (e) => { e.currentTarget.blur(); hide(o); };

    // ---- value rows (built once; only the numbers are rewritten per frame)
    const vals = el.querySelector(".ginsp-vals");
    o.vb = {};
    FIELDS.forEach(([f, sym, unit, note]) => {
      const d = document.createElement("div"); d.dataset.f = f;
      d.innerHTML = "<span>" + sym + "</span><b>—</b><i>" + note + "</i>";
      vals.appendChild(d);
      o.vb[f] = { row: d, b: d.querySelector("b"), unit };
    });

    // ---- field tabs
    const tabs = el.querySelector(".ginsp-tabs");
    FIELDS.forEach(([f, sym]) => {
      const b = document.createElement("button");
      b.textContent = sym; b.dataset.f = f; b.title = FIELDS.find((q) => q[0] === f)[3];
      b.onclick = () => { o.field = f; b.blur(); draw(o); };
      tabs.appendChild(b);
    });

    // ---- csv
    el.querySelectorAll(".ginsp-b").forEach((b) => {
      b.onclick = () => {
        b.blur();
        if (b.dataset.a === "csv") download([g], "g" + (state.gauges.indexOf(g) + 1));
        else download(state.gauges, "gauges");
      };
    });

    // ---- chart gestures: wheel zoom about the cursor, drag pan, dbl-click fit
    const cv = o.cv;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const tc = tAt(o, e.clientX - r.left, r.width);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
      let a = tc - (tc - o.t0) / f, b = tc + (o.t1 - tc) / f;
      if (b - a < 0.02) { const m = (a + b) / 2; a = m - 0.01; b = m + 0.01; }
      o.t0 = a; o.t1 = b; o.fit = false;
      clampT(o); draw(o);
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
      o.pan = { x: e.clientX, t0: o.t0, t1: o.t1, w: r.width };
    });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect();
      if (o.pan) {
        const d = (e.clientX - o.pan.x) / Math.max(r.width - 60, 1) * (o.pan.t1 - o.pan.t0);
        o.t0 = o.pan.t0 - d; o.t1 = o.pan.t1 - d; o.fit = false;
        clampT(o);
      }
      o.hover = [e.clientX - r.left, e.clientY - r.top];
      draw(o);
    });
    const endPan = () => { o.pan = null; };
    cv.addEventListener("pointerup", endPan);
    cv.addEventListener("pointercancel", endPan);
    cv.addEventListener("pointerleave", () => { o.hover = null; o.pan = null; draw(o); });
    cv.addEventListener("dblclick", () => { o.fit = true; draw(o); });

    draw(o);
    return o;
  }

  function hide(o) {
    const i = open.indexOf(o);
    if (i < 0) return;
    open.splice(i, 1);
    o.el.remove();
  }
  function closeAll() { while (open.length) hide(open[0]); }

  // ---- time-axis helpers
  function span(o) { return Math.max(o.t1 - o.t0, 1e-6); }
  function tAt(o, px, w) { return o.t0 + (px - 10) / Math.max(w - 60, 1) * span(o); }
  function clampT(o) {
    const L = o.g.log || [];
    if (!L.length) return;
    const a = L[0].t, b = L[L.length - 1].t, s = span(o);
    if (s > (b - a) + 1e-9) { o.t0 = a; o.t1 = a + Math.max(b - a, 0.02); return; }
    if (o.t0 < a) { o.t1 += a - o.t0; o.t0 = a; }
    if (o.t1 > b) { o.t0 -= o.t1 - b; o.t1 = b; }
  }
  /** First index with t >= tv. */
  function lower(L, tv) {
    let a = 0, b = L.length;
    while (a < b) { const m = (a + b) >> 1; if (L[m].t < tv) a = m + 1; else b = m; }
    return a;
  }

  /** Redraw one window: numbers, tab state, caption and the chart. */
  function draw(o) {
    const g = o.g, L = g.log || [], el = o.el;
    const k = state.gauges.indexOf(g);
    el.querySelector(".ginsp-dot").style.background = g.colour;
    el.querySelector(".ginsp-name").textContent = "Gauge " + (k + 1);
    el.querySelector(".ginsp-pos").textContent =
      "x " + g.x.toFixed(2) + " · y " + g.y.toFixed(2) + " m";
    const last = L.length ? L[L.length - 1] : null;
    FIELDS.forEach(([f]) => {
      const V = o.vb[f];
      V.b.textContent = (last ? last[f].toFixed(3) : "—") + " " + V.unit;
      V.row.classList.toggle("on", f === o.field);
    });
    [...el.querySelectorAll(".ginsp-tabs button")]
      .forEach((b) => b.classList.toggle("on", b.dataset.f === o.field));
    const sp = el.querySelector(".ginsp-span");
    sp.textContent = (L.length
      ? L.length.toLocaleString() + (L.length === 1 ? " sample · " : " samples · ") +
        fmtT(L[0].t) + " → " + fmtT(L[L.length - 1].t)
      : "no samples yet") + (state.paused ? "  · frozen" : "");
    sp.classList.toggle("frozen", state.paused);

    const cv = o.cv, dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 372, h = cv.clientHeight || 158;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(6,10,16,0.55)";
    c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill();
    if (L.length < 2) {
      c.fillStyle = "rgba(223,232,242,0.45)";
      c.font = "11px ui-monospace, monospace";
      c.fillText(L.length ? "one sample so far" : "no history yet — press ▶︎ Run", 12, h / 2);
      return;
    }
    if (o.fit) { o.t0 = L[0].t; o.t1 = Math.max(L[L.length - 1].t, L[0].t + 0.02); }
    clampT(o);

    const x0 = 10, x1 = w - 50, y0 = 10, y1 = h - 20;
    const i0 = Math.max(0, lower(L, o.t0) - 1), i1 = Math.min(L.length - 1, lower(L, o.t1));
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { const v = L[i][o.field]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi > lo)) { hi = lo + 1e-3; }
    const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;
    const PX = (t) => x0 + (t - o.t0) / span(o) * (x1 - x0);
    const PY = (v) => y1 - (v - lo) / (hi - lo) * (y1 - y0);

    // gridlines + value labels
    c.font = "10px ui-monospace, monospace";
    c.strokeStyle = "rgba(255,255,255,0.07)"; c.lineWidth = 1;
    c.fillStyle = "rgba(223,232,242,0.45)";
    for (let n = 0; n <= 4; n++) {
      const v = lo + (hi - lo) * n / 4, y = PY(v);
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      c.fillText(OVERLAY.fmt(v, 3), x1 + 5, y + 3);
    }
    // time ticks on a 1-2-5 rounding of a quarter of the window
    const tgt = span(o) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(tgt, 1e-4))));
    const stp = [1, 2, 5, 10].map((m) => m * mag)
      .reduce((a, b) => Math.abs(b - tgt) < Math.abs(a - tgt) ? b : a);
    for (let t = Math.ceil(o.t0 / stp) * stp; t <= o.t1; t += stp) {
      const x = PX(t);
      c.strokeStyle = "rgba(255,255,255,0.07)";
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
      c.fillText(stp < 1 ? t.toFixed(1) : t.toFixed(0), x - 8, h - 7);
    }
    c.fillText("s", x1 + 5, h - 7);

    // the trace — one segment per sample, sub-pixel runs collapsed to a span
    c.beginPath();
    let px = -1e9, mn = 0, mx = 0, started = false;
    for (let i = i0; i <= i1; i++) {
      const X = Math.round(PX(L[i].t)), v = L[i][o.field];
      if (X !== px) {
        if (started) { c.lineTo(px, PY(mn)); c.lineTo(px, PY(mx)); }
        else { c.moveTo(X, PY(v)); started = true; }
        px = X; mn = v; mx = v;
      } else { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (started) { c.lineTo(px, PY(mn)); c.lineTo(px, PY(mx)); }
    c.strokeStyle = g.colour; c.lineWidth = 1.4; c.stroke();

    // crosshair
    if (o.hover && o.hover[0] > x0 - 6 && o.hover[0] < x1 + 6) {
      const th = o.t0 + (o.hover[0] - x0) / (x1 - x0) * span(o);
      let i = lower(L, th);
      if (i > 0 && (i >= L.length || Math.abs(L[i - 1].t - th) < Math.abs(L[i].t - th))) i--;
      i = Math.max(0, Math.min(L.length - 1, i));
      const X = PX(L[i].t), Y = PY(L[i][o.field]);
      c.strokeStyle = "rgba(255,255,255,0.35)"; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(X, y0); c.lineTo(X, y1); c.stroke();
      c.beginPath(); c.moveTo(x0, Y); c.lineTo(x1, Y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = g.colour;
      c.beginPath(); c.arc(X, Y, 2.5, 0, 6.2832); c.fill();
      const F = FIELDS.find((q) => q[0] === o.field);
      const txt = "t " + L[i].t.toFixed(3) + " s   " + F[1] + " " +
                  L[i][o.field].toFixed(4) + " " + F[2];
      c.font = "700 10.5px ui-monospace, monospace";
      const tw = c.measureText(txt).width;
      const bx = Math.min(Math.max(X + 7, x0), x1 - tw - 10);
      c.fillStyle = "rgba(6,10,16,0.88)";
      c.beginPath(); c.roundRect(bx - 4, y0 + 1, tw + 8, 15, 4); c.fill();
      c.fillStyle = "#e8f0f8";
      c.fillText(txt, bx, y0 + 12);
      o.read = { t: L[i].t, v: L[i][o.field], field: o.field };
    } else o.read = null;
  }

  /** Per-frame: drop windows whose gauge is gone, keep the numbers live, and
   *  park a small ⤢ affordance on each corner card. */
  let lastN = -1;
  function tick(rects) {
    for (let i = open.length - 1; i >= 0; i--) {
      if (state.gauges.indexOf(open[i].g) < 0) hide(open[i]); else draw(open[i]);
    }
    // The panel's inspector row lists the live gauges, so it has to follow them
    // however they arrived — a click with the Gauge tool syncs the panel, but a
    // rig script pushing onto `state.gauges` does not.
    if (state.gauges.length !== lastN) { lastN = state.gauges.length; syncPanel(); }
    if (!btnHost) { if (!rects || !rects.length) return; hosts(); }
    const n = rects ? rects.length : 0;
    while (btns.length < n) {
      const b = document.createElement("button");
      b.className = "gcardBtn"; b.textContent = "⤢";
      b.title = "Open the gauge inspector";
      b.onclick = () => { b.blur(); show(+b.dataset.k); };
      btnHost.appendChild(b); btns.push(b);
    }
    btns.forEach((b, i) => {
      if (i >= n) { b.style.display = "none"; return; }
      const r = rects[i];
      b.dataset.k = String(r.k);
      b.style.display = "block";
      // Just OUTSIDE the card's top-left corner: every worksheet screenshot in
      // the pack has one of these cards in it, so the card itself is left
      // pixel-for-pixel alone.
      b.style.left = Math.max(2, r.x - 23) + "px";
      b.style.top = (r.y + 5) + "px";
    });
  }

  // ---------------------------------------------------------------- export
  /** Wide CSV: one row per sample time, three columns per gauge. Gauges are
   *  sampled in the same call, so their sample times are bit-identical and
   *  the rows line up; a gauge dropped later simply has empty cells before
   *  its first sample. Values are printed at full precision. */
  function csv(list) {
    const gs = (list && list.length ? list : state.gauges).filter((g) => g);
    const hdr = ["t_sim_s"];
    gs.forEach((g) => {
      const tag = "g" + (state.gauges.indexOf(g) + 1) +
                  "_x" + g.x.toFixed(2) + "_y" + g.y.toFixed(2);
      hdr.push(tag + "_head_m", tag + "_depth_m", tag + "_speed_mps");
    });
    const cols = gs.length * 3, rows = new Map();
    gs.forEach((g, gi) => (g.log || []).forEach((s) => {
      let r = rows.get(s.t);
      if (!r) { r = new Array(cols).fill(""); rows.set(s.t, r); }
      r[gi * 3] = String(s.head); r[gi * 3 + 1] = String(s.depth); r[gi * 3 + 2] = String(s.speed);
    }));
    const ts = [...rows.keys()].sort((a, b) => a - b);
    const out = [hdr.join(",")];
    ts.forEach((t) => out.push(String(t) + "," + rows.get(t).join(",")));
    return out.join("\n") + "\n";
  }

  function download(list, tag) {
    const text = csv(list);
    const name = "hydraulician-" + (state.scene ? state.scene.id : "scene") +
                 "-" + (tag || "gauges") + ".csv";
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      // file:// with a paranoid policy, or a blocked download — never lose the
      // data over it; the text is still returned for the console.
      showToast("Could not save the CSV", String(err && err.message || err));
    }
    return { name, text };
  }

  return { show, hide, closeAll, tick, csv, download, open, draw };
})();

// ------------------------------------------------------- rig save / share
/** A drawn rig is a segment list plus the panel settings that make it work.
 *  Both are plain CPU-side state, so a rig can be written out as JSON and
 *  read back at any resolution or window size — the solver is never touched.
 *
 *  Two things make that true and they are worth stating:
 *
 *  - **Segments are physical**, `[x0,y0,x1,y1,thickness,kind]` in metres, and
 *    `SIM.rasterise()` re-stamps them into whatever grid is current. So a rig
 *    saved at Medium loads sealed at Low or High; the cell COUNT of a gap
 *    changes (it always does — see UN-1's quantised nozzle), the geometry
 *    does not.
 *  - **The domain is a fixed physical rectangle**, so the window size only
 *    moves the letterbox. Nothing about the view is stored, and a rig opened
 *    on a phone frames the same metres as one opened on a projector.
 *
 *  Transient water state is deliberately NOT stored. A rig is a rig, not a
 *  snapshot: applying one ends with `SIM.resetWater()` — the R key — so the
 *  scene's initial water lands on the NEW geometry and the scene's spin-up
 *  countdown runs from t = 0 against the rig you just loaded. Storing a
 *  velocity/fill field would be megabytes and would still need the same
 *  settle time to mean anything.
 *
 *  Wire format: `#rig=<tag><base64url>` where the tag is one character —
 *  `A` = plain UTF-8 JSON, `B` = raw-deflate JSON (CompressionStream, no
 *  dependency; falls back to `A` where it is missing). Deflate is worth it:
 *  a 35-stroke staircase rig is 4.4 kB of JSON and mostly repeated digits. */
const RIG = (() => {
  const V = 1;                                  // format version
  /** Micrometres. Not cosmetic: B10's staircase snaps its step boundaries to
   *  cell centres on purpose (a boundary landing exactly on one is claimed by
   *  both neighbouring steps and pinches the bore a whole step deep), and at
   *  Ultra Δx is ~2.6 mm — so the stored coordinate has to sit far closer to
   *  the drawn one than any rasterisation decision. 1 µm is 0.04% of the
   *  finest cell, and JSON.stringify still prints 1.5 as "1.5". */
  const r4 = (v) => Math.round((+v || 0) * 1e6) / 1e6;
  const b01 = (v) => (v > 0.5 ? 1 : 0);
  let note = "", msg = "", ui = null;

  // ------------------------------------------------------------- snapshot
  /** Everything needed to rebuild the current rig, and nothing else. */
  function snapshot() {
    const p = sim.p, sc = state.scene;
    const inflow = { on: b01(p.inflow.on), free: b01(p.inflow.free),
                     level: r4(p.inflow.level), q: r4(p.inflow.q) };
    if (p.inflow.v !== undefined) inflow.v = r4(p.inflow.v);
    const o = {
      v: V,
      scene: sc.id,
      segs: (sim.segs || []).map((s) =>
        [r4(s[0]), r4(s[1]), r4(s[2]), r4(s[3]), r4(s[4]), s[5] | 0]),
      open: p.open.map((k) => k | 0),
      valveClosed: b01(p.valveClosed),
      inflow,
      tailwater: { on: b01(p.tailwater.on), level: r4(p.tailwater.level) },
      source: { on: b01(p.source.on), x: r4(p.source.x), y: r4(p.source.y),
                r: r4(p.source.r), vx: r4(p.source.vx), vy: r4(p.source.vy) },
      wave: { on: b01(p.wave.on), amp: r4(p.wave.amp),
              period: r4(p.wave.period), x: r4(p.wave.x) },
      hyd: { c: r4(p.c), cf: r4(p.cf), cs: r4(p.cs), bulk: r4(p.bulk),
             ca: r4(p.ca), nu: r4(p.nu), slip: b01(p.slip), g: r4(p.g) },
      dye: { line: r4(p.dyeLine), decay: r4(p.dyeDecay) },
      gauges: state.gauges.map((g) => [r4(g.x), r4(g.y)]),
      rakes: state.rakes.map((k) => r4(k.x)),
      ui: { mode: state.mode | 0, field: state.gaugeField, speed: r4(state.speed),
            channel: b01(state.channel), labels: b01(state.labels),
            jumps: b01(state.jumps), particles: b01(state.particles),
            dye: b01(state.dye) },
    };
    if (state.tracers) o.tracers = [r4(state.tracers.x), state.tracerN | 0,
                                    r4(state.tracers.trail)];
    return o;
  }

  /** Version gate. v1 is the only format so far; a future v2 migrates here so
   *  that links printed on this year's worksheets keep working. */
  function migrate(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.segs)) {
      throw new Error("not a hydraulician rig");
    }
    if ((o.v | 0) > V) {
      throw new Error("rig format v" + o.v + " is newer than this build (v" + V + ")");
    }
    return o;
  }

  // ---------------------------------------------------------------- apply
  /** Replace the current rig with `obj`. Returns a short summary string.
   *
   *  The drawn segments are REPLACED, not merged — the loaded strokes become
   *  the undo stack, so Z pops the last loaded stroke exactly as if you had
   *  drawn them yourself, and C clears them. */
  function apply(obj) {
    const o = migrate(obj);
    const id = SCENES.byId[o.scene] ? o.scene : "sandbox";
    const swapped = id !== o.scene;
    loadScene(id, false);                    // fresh grid, fresh params, no drawing
    const p = sim.p;

    sim.segs.length = 0;
    o.segs.forEach((s) => sim.segs.push([+s[0], +s[1], +s[2], +s[3], +s[4], s[5] | 0]));

    if (Array.isArray(o.open)) for (let k = 0; k < 4; k++) p.open[k] = o.open[k] | 0;
    p.autoL = 0; p.autoR = 0;                // the rig owns its edges outright
    if (o.valveClosed !== undefined) p.valveClosed = b01(o.valveClosed);
    // Merge onto the scene's own objects: a key the rig does not carry (a
    // scene that pins an inlet velocity, say) keeps the scene's value.
    ["inflow", "tailwater", "source", "wave"].forEach((k) => {
      if (o[k]) Object.assign(p[k], o[k]);
    });
    if (o.hyd) {
      ["c", "cf", "cs", "bulk", "ca", "nu", "slip", "g"].forEach((k) => {
        if (o.hyd[k] !== undefined) p[k] = +o.hyd[k];
      });
    }
    if (o.dye) {
      if (o.dye.line !== undefined) p.dyeLine = +o.dye.line;
      if (o.dye.decay !== undefined) p.dyeDecay = +o.dye.decay;
    }
    p.pour = null;
    SIM.rasterise();                         // one stamp for the whole rig

    // ---- instruments. Same objects the Gauge / Rake tools push.
    GINSP.closeAll();
    state.gauges.length = 0;
    (o.gauges || []).slice(0, 4).forEach((g) => {
      state.gauges.push({ x: +g[0], y: +g[1], hist: [], log: [], id: ++state.gaugeSeq,
                          colour: CONFIG.gaugeColours[state.gauges.length % 4] });
    });
    state.rakes.length = 0;
    (o.rakes || []).slice(0, 2).forEach((x) => state.rakes.push({ x: +x, buf: null }));
    state.gaugeT = -1;

    const U = o.ui || {};
    if (U.mode !== undefined) state.mode = U.mode | 0;
    if (U.field) state.gaugeField = U.field;
    if (U.speed !== undefined) state.speed = +U.speed;
    ["channel", "labels", "jumps", "particles", "dye"].forEach((k) => {
      if (U[k] !== undefined) state[k] = !!(+U[k]);
    });

    SIM.resetWater();                        // R — a clean start on the new bed
    state.deliv = null;
    if (o.tracers) { state.tracerN = o.tracers[1] || state.tracerN; seedTracers(+o.tracers[0]);
                     if (state.tracers && o.tracers[2]) state.tracers.trail = +o.tracers[2]; }
    syncPanel();

    const n = sim.segs.length;
    note = "rig loaded: " + n + " segment" + (n === 1 ? "" : "s") +
           (state.gauges.length ? " · " + state.gauges.length + " gauge" +
             (state.gauges.length === 1 ? "" : "s") : "") +
           (state.rakes.length ? " · " + state.rakes.length + " rake" +
             (state.rakes.length === 1 ? "" : "s") : "") +
           " · scene " + id + (swapped ? " (unknown scene “" + o.scene + "”)" : "");
    return note;
  }

  // ------------------------------------------------------------- transport
  /** Compact for a link; for a FILE, one line per top-level key and one line
   *  per drawn segment. A rig file is meant to be read and hand-edited — the
   *  default pretty-printer puts every coordinate on a line of its own, which
   *  turns a five-stroke rig into eighty lines of digits. */
  function toText(obj, pretty) {
    const o = obj || snapshot();
    if (!pretty) return JSON.stringify(o);
    const parts = Object.keys(o).map((k) => {
      if (k === "segs") {
        return ' "segs": [\n' + o.segs.map((s) => "  " + JSON.stringify(s)).join(",\n") + "\n ]";
      }
      return " " + JSON.stringify(k) + ": " + JSON.stringify(o[k]);
    });
    return "{\n" + parts.join(",\n") + "\n}\n";
  }

  function b64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(str) {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const unutf8 = (b) => new TextDecoder().decode(b);

  /** Raw deflate through the platform's own streams — no dependency, and the
   *  fallback below means a browser without it still shares, just longer. */
  function zip(bytes, dir) {
    const C = dir === "d" ? self.DecompressionStream : self.CompressionStream;
    if (!C) return Promise.reject(new Error("no CompressionStream"));
    const st = new C("deflate-raw");
    const w = st.writable.getWriter();
    w.write(bytes); w.close();
    const rd = st.readable.getReader(), parts = [];
    const pump = () => rd.read().then((r) => {
      if (r.done) {
        let n = 0; parts.forEach((c) => n += c.length);
        const out = new Uint8Array(n); let k = 0;
        parts.forEach((c) => { out.set(c, k); k += c.length; });
        return out;
      }
      parts.push(r.value); return pump();
    });
    return pump();
  }

  /** Always-available encoder: plain base64url JSON. */
  function encodeSync(o) { return "A" + b64url(utf8(toText(o))); }
  /** Preferred encoder: deflate when the platform has it. */
  function encode(o) {
    const t = toText(o);
    return zip(utf8(t), "c").then((b) => "B" + b64url(b)).catch(() => "A" + b64url(utf8(t)));
  }
  function decode(code) {
    const s = String(code || "").trim(), tag = s.charAt(0), body = s.slice(1);
    if (tag === "A") return Promise.resolve(JSON.parse(unutf8(unb64url(body))));
    if (tag === "B") return zip(unb64url(body), "d").then((b) => JSON.parse(unutf8(b)));
    // Tolerate a hand-trimmed code with the tag lost.
    return Promise.resolve(JSON.parse(unutf8(unb64url(s))));
  }

  const baseUrl = () => location.href.split("#")[0];
  function link(o) { return encode(o).then((c) => baseUrl() + "#rig=" + c); }
  function hashCode() {
    const m = /(?:^|[#&])rig=([^&\s]+)/.exec(location.hash || "");
    return m ? decodeURIComponent(m[1]) : null;
  }

  // -------------------------------------------------------------- loading
  /** Accept anything a student might paste: a full share URL, a bare code, or
   *  the exported JSON. */
  function parseAny(txt) {
    const t = String(txt == null ? "" : txt).trim();
    if (!t) throw new Error("nothing to load — paste a rig link or its JSON");
    const m = /rig=([A-Za-z0-9_\-%]+)/.exec(t);
    if (m) return decode(decodeURIComponent(m[1]));
    if (t.charAt(0) === "{") return JSON.parse(t);
    return decode(t);
  }
  /** The one entry point every load path goes through. Returns a promise so
   *  the deflate branch can be awaited; resolves to the status line. */
  function load(txt) {
    return Promise.resolve()
      .then(() => parseAny(txt))
      .then((o) => {
        const s = apply(o);
        flash("loaded"); showToast("Rig loaded", s.replace(/^rig loaded: /, ""));
        return s;
      })
      .catch((err) => {
        note = "rig NOT loaded — " + (err && err.message || err);
        flash("failed"); showToast("Could not load that rig", String(err && err.message || err));
        syncPanel();
        throw err;
      });
  }

  // ------------------------------------------------------------------- UI
  function el(sel) { return ui ? ui.querySelector(sel) : null; }
  function flash(m) { msg = m || ""; syncPanel(); }
  function box(text) { const t = el(".rigtx"); if (t) { t.value = text; t.scrollTop = 0; } }

  function share() {
    return link().then((url) => {
      box(url);
      try { history.replaceState(null, "", url); } catch (_) { /* file:// may refuse */ }
      const done = (how) => { note = "share link ready · " + url.length + " characters";
                              flash(how); return url; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(url)
          .then(() => done("copied to the clipboard"))
          .catch(() => done("clipboard blocked — copy it from the box"));
      }
      const t = el(".rigtx");
      if (t) { t.focus(); t.select(); }
      return done("select-all done — press ⌘/Ctrl-C");
    });
  }

  function exportJSON() {
    const o = snapshot(), text = toText(o, true);
    const name = "hydraulician-rig-" + o.scene + "-" + o.segs.length + "seg.json";
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      note = "exported " + name + " · " + text.length + " characters";
      flash("saved");
    } catch (err) {
      // A blocked download must never lose the rig: it goes in the box.
      box(text);
      note = "download blocked — the JSON is in the box, copy it out";
      flash("blocked");
    }
    return { name, text };
  }

  function buildUI(host) {
    ui = host;
    host.innerHTML =
      '<div class="rigrow">' +
        '<button data-a="share" title="Copy a link that rebuilds this rig">⇪ Share link</button>' +
        '<button data-a="json" title="Download the rig as a .json file">⤓ Export JSON</button>' +
      '</div>' +
      '<textarea class="rigtx" spellcheck="false" placeholder="Share puts the link here to copy — ' +
        'or paste a rig link (or its JSON) and press Load."></textarea>' +
      '<div class="rigrow">' +
        '<button data-a="load" title="Rebuild the rig in the box above">⇧ Load box</button>' +
        '<label class="rigfile" title="Open a .json rig file">⇧ Open file' +
          '<input type="file" accept=".json,.txt,application/json" hidden></label>' +
        '<span class="rigmsg"></span></div>';
    host.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        b.blur();
        const a = b.dataset.a;
        if (a === "share") share();
        else if (a === "json") exportJSON();
        else if (a === "load") load(el(".rigtx").value).catch(() => {});
      };
    });
    const f = host.querySelector('input[type="file"]');
    f.onchange = () => {
      const file = f.files && f.files[0];
      f.value = "";
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => load(rd.result).catch(() => {});
      rd.onerror = () => { note = "could not read that file"; flash("failed"); };
      rd.readAsText(file);
    };
    syncUI();
  }

  /** The one-line status under the row: what just happened, or what is here. */
  function statusLine() {
    if (note) return note;
    const n = sim && sim.segs ? sim.segs.length : 0;
    return n || state.gauges.length
      ? n + " segment" + (n === 1 ? "" : "s") + " · " + state.gauges.length + " gauge" +
        (state.gauges.length === 1 ? "" : "s") + " drawn on " + state.scene.id
      : "nothing drawn yet — Share still captures the panel settings";
  }
  function syncUI() { const m = el(".rigmsg"); if (m) m.textContent = msg; }

  return { snapshot, apply, toText, encode, encodeSync, decode, link, load,
           hashCode, share, exportJSON, buildUI, syncUI, statusLine,
           get note() { return note; } };
})();

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
  // running estimates must not survive the redraw — a stale domain-wide y_n
  // is what made a drowned gate on a 1-in-4 bed read "M1". Every path that
  // re-rasterises the walls goes through one of these; a resolution change or
  // a scene load builds a fresh grid and starts clean anyway.
  ["rasterise", "addSeg", "undoSeg", "clearSegs"].forEach((k) => {
    const f = SIM[k];
    SIM[k] = (...a) => { const r = f(...a); OVERLAY.resetEstimates(sim); return r; };
  });

  const sel = document.getElementById("sceneSel");
  const groups = {};
  SCENES.list.forEach((s) => {
    if (!groups[s.group]) {
      groups[s.group] = document.createElement("optgroup");
      groups[s.group].label = s.group;
      sel.appendChild(groups[s.group]);
    }
    const o = document.createElement("option"); o.value = s.id; o.textContent = s.name;
    groups[s.group].appendChild(o);
  });
  sel.onchange = () => loadScene(sel.value, false);

  const tb = document.getElementById("tools");
  TOOLS.forEach(([id, label, tip]) => {
    const b = document.createElement("button");
    b.textContent = label; b.title = tip; b.dataset.tool = id;
    b.onclick = () => { state.tool = id; syncTools(); };
    tb.appendChild(b);
  });
  function syncTools() {
    [...tb.children].forEach((b) => b.classList.toggle("active", b.dataset.tool === state.tool));
  }
  window.syncTools = syncTools;

  buildPanel();
  loadScene(new URLSearchParams(location.search).get("scene") || "sandbox", false);
  // A `#rig=` link carries its own base scene, so it wins over `?scene=` —
  // but `?scene=` is loaded first anyway, so a link that fails to decode
  // leaves you on the scene you asked for rather than on a blank page.
  // Decoding may be asynchronous (deflate), hence the promise: the rig lands
  // within a frame or two, and `apply` ends with a reset, so the spin-up
  // countdown runs against the RIG's geometry and not the base scene's.
  const rigCode = RIG.hashCode();
  if (rigCode) RIG.load(rigCode).catch(() => { /* reported in the panel + a toast */ });
  sel.value = state.scene.id;
  syncTools();
  document.getElementById("hint").innerHTML = state.scene.tips[0] || "";

  document.getElementById("panelBtn").onclick = (e) => {
    document.getElementById("panel").classList.toggle("open");
    e.currentTarget.classList.toggle("active");
    document.getElementById("about").classList.remove("open");   // they overlap
    document.getElementById("aboutBtn").classList.remove("active");
  };
  document.getElementById("aboutBtn").onclick = (e) => {
    document.getElementById("about").classList.toggle("open");
    e.currentTarget.classList.toggle("active");
    document.getElementById("panel").classList.remove("open");
    document.getElementById("panelBtn").classList.remove("active");
  };
  document.getElementById("playBtn").onclick = () => togglePause();
  document.getElementById("valveBtn").onclick = () => toggleValve();
  document.getElementById("resetBtn").onclick = () => { SIM.resetWater(); clearGaugeHistory(); };
  document.getElementById("clearBtn").onclick = () => SIM.clearSegs();

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
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); togglePause(); }
    else if (k === "v") toggleValve();
    else if (k === "z") SIM.undoSeg();
    else if (k === "c") SIM.clearSegs();
    else if (k === "r") { SIM.resetWater(); clearGaugeHistory(); }
    else if (k === "p") { state.particles = !state.particles; syncPanel(); }
    else if (k === "g") { state.mode = (state.mode + 1) % 6; syncPanel(); }
    else if (k === "d") { state.dye = !state.dye; syncPanel(); }
    else if (k === "n") { state.channel = !state.channel; syncPanel(); }
    else if (k >= "1" && k <= String(TOOLS.length)) { state.tool = TOOLS[+k - 1][0]; window.syncTools(); }
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
  document.getElementById("playBtn").textContent = state.paused ? "▶︎ Run" : "❚❚ Pause";
}
function toggleValve() {
  sim.p.valveClosed = sim.p.valveClosed > 0.5 ? 0 : 1;
  document.getElementById("valveBtn").classList.toggle("active", sim.p.valveClosed < 0.5);
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
  GINSP,                                   // gauge inspector windows
  RIG,                                     // rig save / share (see the Rig panel)
  inspect: (k) => GINSP.show(k || 0),
  gaugeCSV: (list) => GINSP.csv(list),     // the CSV text, without downloading
  clearGaugeHistory,
  tick: (n) => { for (let k = 0; k < (n || 1); k++) SIM.step(1); },
  frames: (n, dt) => { for (let k = 0; k < (n || 1); k++) tickFrame(dt || 1 / 60); },
  probe: (x, y) => SIM.probe(x, y),
  /** Total water volume per unit width (m²) — the mass-balance check. */
  volume: () => {
    const c = SIM.columns(); let v = 0;
    for (let i = 0; i < sim.nx; i++) v += c[i * 4 + 1] * sim.dx;
    return v;
  },
};

addEventListener("DOMContentLoaded", boot);
