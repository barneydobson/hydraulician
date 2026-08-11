"use strict";
/**
 * main.js — boot, UI, pointer tools and the frame loop.
 */
const CONFIG = {
  budgets: { Low: 45000, Medium: 95000, High: 175000 },
  defaultBudget: "Medium",
  frameBudgetMs: 15,          // sim time we are willing to spend per frame
  histMax: 900,
  gaugeColours: ["#7fd4ff", "#ffb648", "#5fd08a", "#ff8fa3"],
};

const state = {
  scene: null, budget: CONFIG.defaultBudget,
  tool: "wall", brush: 0.055,
  mode: 0, particles: false, dye: true, channel: true, labels: true, jumps: true,
  paused: false, speed: 1.0, nsub: 24, nsubMax: 400,
  gauges: [], rakes: [], gaugeField: "head",
  cursor: [0, 0], inside: false, hover: null,
  drag: null, pour: null,
  zoom: 1, panC: null, panDrag: null, pinch: null, spoutDrag: false,
  flashKey: null, flashT: 0,
  fps: 60, rt: 1, simDt: 0,
  tipIdx: 0, tipAt: 0,
};

let canvas, over, octx, view, sim;

// --------------------------------------------------------------- geometry
/** Letterbox rect of the whole domain at zoom 1 — the zoomed view scales
 *  this rect about the pan centre, so the GPU just draws a bigger rect and
 *  the screen clips it. */
function baseRect() {
  const cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
  const ar = sim.W / sim.H;
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

function resetZoom() { state.zoom = 1; state.panC = null; }

// ------------------------------------------------------------------ scenes
function loadScene(id, keepDrawing) {
  const sc = SCENES.byId[id];
  state.scene = sc;
  sim = SIM.build(sc, CONFIG.budgets[state.budget], keepDrawing);
  state.mode = sc.mode;
  state.channel = !!sc.chan;
  state.gauges.length = 0; state.rakes.length = 0;
  state.tipIdx = 0; state.tipAt = 0;
  state.nsub = 24;
  resetZoom();
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
    get: () => sim.p.inflow.on > 0.5, set: (v) => sim.p.inflow.on = v ? 1 : 0,
    info: "A Dirichlet level + discharge on the left edge — the upstream control." },
  { id: "inLevel", place: "res", label: "Reservoir level", min: 0, max: 1, step: 0.005, rel: "H",
    get: () => sim.p.inflow.level, set: (v) => sim.p.inflow.level = v,
    fmt: (v) => v.toFixed(2) + " m",
    info: "Water level held on the left boundary." },
  { id: "inQ", place: "res", label: "Inflow q", min: 0, max: 1.2, step: 0.005,
    get: () => sim.p.inflow.q, set: (v) => sim.p.inflow.q = v,
    fmt: (v) => v.toFixed(3) + " m²/s per m width  →  " + SIM.inletVel().toFixed(2) + " m/s" +
                "   y_c = " + Math.pow(v * v / 9.81, 1 / 3).toFixed(3) + " m",
    info: "Unit discharge entering the domain, converted to an inlet velocity using the depth available over the bed. Critical depth y_c = (q²/g)^⅓ follows directly from it." },
  { id: "inFree", place: "res", type: "check", label: "Head-driven inflow",
    get: () => (sim.p.inflow.free || 0) > 0.5, set: (v) => sim.p.inflow.free = v ? 1 : 0,
    info: "Pins only the reservoir level and lets the head difference drive the discharge — how the water-hammer and venturi scenes feed themselves. Off = the inflow q is prescribed directly." },
  { id: "twOn", place: "tw", type: "check", label: "Tailwater control",
    get: () => sim.p.tailwater.on > 0.5, set: (v) => sim.p.tailwater.on = v ? 1 : 0,
    info: "Holds a fixed level on the right edge — the downstream control that decides M1 vs M2." },
  { id: "twLevel", place: "tw", label: "Tailwater level", min: 0, max: 1, step: 0.005, rel: "H",
    get: () => sim.p.tailwater.level, set: (v) => sim.p.tailwater.level = v,
    fmt: (v) => v.toFixed(2) + " m" },
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
  { id: "openL", place: "openL", type: "check", label: "Open left edge",
    get: () => sim.p.open[0] > 0.5, set: (v) => { sim.p.open[0] = v ? 1 : 0; SIM.rasterise(); },
    info: "Open edges are zero-gradient outflows (water leaves freely); the left one also carries the reservoir control when it is on. Closed edges are walls." },
  { id: "openR", place: "openR", type: "check", label: "Open right edge",
    get: () => sim.p.open[1] > 0.5, set: (v) => { sim.p.open[1] = v ? 1 : 0; SIM.rasterise(); },
    info: "The right edge carries the tailwater control when it is on." },
  { id: "openB", place: "openB", type: "check", label: "Open bottom edge",
    get: () => sim.p.open[2] > 0.5, set: (v) => { sim.p.open[2] = v ? 1 : 0; SIM.rasterise(); },
    info: "An open bottom is a free overfall for anything that reaches it — brinks and outfalls drain here." },
  { id: "openT", place: "openT", type: "check", label: "Open top edge",
    get: () => sim.p.open[3] > 0.5, set: (v) => { sim.p.open[3] = v ? 1 : 0; SIM.rasterise(); } },

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

  { h: "View" },
  { id: "mode", type: "select", label: "Field",
    opts: [["0", "Water"], ["1", "Pressure head"], ["2", "Speed"], ["3", "Froude number"], ["4", "Vorticity"]],
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
  { id: "budget", type: "select", label: "Resolution",
    opts: [["Low", "Low"], ["Medium", "Medium"], ["High", "High"]],
    get: () => state.budget,
    set: (v) => { state.budget = v; sim = SIM.build(state.scene, CONFIG.budgets[v], true); computeView(); } },
];

function buildPanel() {
  const p = document.getElementById("panel");
  CONTROLS.forEach((c) => {
    if (c.h) { const el = document.createElement("h3"); el.textContent = c.h; p.appendChild(el); return; }
    const row = document.createElement("label"); row.className = "row";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = c.label;
    row.appendChild(lbl);
    const touched = () => {
      if (c.place) { state.flashKey = c.place; state.flashT = performance.now(); }
    };
    let input;
    if (c.type === "check") {
      input = document.createElement("input"); input.type = "checkbox";
      input.onchange = () => { c.set(input.checked); touched(); syncPanel(); };
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
    row.appendChild(input);
    if (c.info) {
      const i = document.createElement("span"); i.className = "info"; i.textContent = "ⓘ";
      i.onclick = (e) => { e.preventDefault(); showToast(c.label, c.info); };
      row.appendChild(i);
    }
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
    state.gauges.push({ x, y, hist: [], colour: CONFIG.gaugeColours[state.gauges.length % 4] });
    return;
  }
  if (state.tool === "rake") {
    if (state.rakes.length >= 2) state.rakes.shift();
    state.rakes.push({ x, buf: null });
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

function sampleGauges(A) {
  state.gauges.forEach((gg) => {
    const pr = SIM.probe(gg.x, gg.y);
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(gg.x / sim.dx)));
    gg.hist.push({ t: sim.t, head: gg.y + pr.head, depth: A.h[i], speed: pr.speed });
    if (gg.hist.length > CONFIG.histMax) gg.hist.splice(0, gg.hist.length - CONFIG.histMax);
    gg.last = pr;
  });
}
function sampleRakes() {
  state.rakes.forEach((rk) => { const r = SIM.rake(rk.x, rk.buf); rk.buf = r.buf; rk.i = r.i; });
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
  drawMarkers(ctx);
  drawSpout(ctx);
  ctx.restore();
  OVERLAY.drawGaugeMarks(ctx, view, state.gauges);
  const fld = state.gaugeField;
  OVERLAY.drawGaugeCharts(ctx, view, state.gauges, fld,
    fld === "head" ? "H" : fld === "depth" ? "h" : "|u|",
    fld === "speed" ? "m/s" : "m");
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
    ctx.globalAlpha = 0.30 + 0.6 * f;
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
  sel.value = state.scene.id;
  syncTools();
  document.getElementById("hint").innerHTML = state.scene.tips[0] || "";

  document.getElementById("panelBtn").onclick = (e) => {
    document.getElementById("panel").classList.toggle("open");
    e.currentTarget.classList.toggle("active");
  };
  document.getElementById("playBtn").onclick = () => togglePause();
  document.getElementById("valveBtn").onclick = () => toggleValve();
  document.getElementById("resetBtn").onclick = () => { SIM.resetWater(); state.gauges.forEach((g) => g.hist.length = 0); };
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
    else if (k === "r") { SIM.resetWater(); state.gauges.forEach((g) => g.hist.length = 0); }
    else if (k === "p") { state.particles = !state.particles; syncPanel(); }
    else if (k === "g") { state.mode = (state.mode + 1) % 5; syncPanel(); }
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
