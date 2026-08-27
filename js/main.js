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
  ruler: true,                // metre ticks on the view edges — a workspace preference
  measure: null, measDrag: null,   // the tape measure: {x0,z0,x1,z1} in metres
  cv: null, cvDrag: null,          // the force control volume: box + EMA force

  paused: false, speed: 1.0, nsub: 24, nsubMax: 400,
  gauges: [], rakes: [], gaugeField: "h", tracers: null, tracerN: 9,
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
  const [dx0, dz0] = view.toDomain(px, py);
  const B = baseRect();
  state.zoom = z1;
  state.panC = [
    dx0 + (B.bx + B.w / 2 - px) * sim.W / (B.w * z1),
    dz0 + (py - B.by - B.h / 2) * sim.H / (B.h * z1),
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
  state.measure = null; state.measDrag = null;
  state.cv = null; state.cvDrag = null;
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
  GINSP.closeAll();
  if (state.paused) togglePause();    // via the toggle, so the button label follows
  // The valve button's highlight is only ever set by `toggleValve`, so a fresh
  // boot never has it lit whatever the scene's `valveOpen` says.
  document.getElementById("valveBtn").classList.remove("active");
  loadScene(id, false);
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

// ----------------------------------------------------------- scene picker
/** The menu behind the title box, the bar's "Scenes ▾" button, the panel's
 *  Scene row and the S key — one menu, four ways in.
 *
 *  It is generated from `SCENES.list` every time it opens and knows no scene
 *  id, name or grouping of its own: a scene added to js/scenes.js appears here
 *  with its registry name, its `key` subtitle and its `blurb`, filed under its
 *  own `group`. Groups are collected in first-seen (registry) order, so the
 *  menu reads in the order the teaching set was written.
 *
 *  Drawn work is protected INLINE rather than with `confirm()`: a native dialog
 *  cannot be screenshotted for a worksheet, cannot be styled, and on a touch
 *  board lands wherever the OS puts it. Clicking a scene while something is
 *  drawn expands a warning under that row instead — naming the count, pointing
 *  at Rig → Share link, and offering "Discard and load" / "Cancel". A second
 *  click on the same row is also a confirmation. */
const PICKER = (() => {
  let el = null, anchor = null, pending = null, hi = -1;

  const menu = () => (el || (el = document.getElementById("scenemenu")));
  const isOpen = () => !!(el && el.classList.contains("open"));
  const titleEl = () => document.getElementById("title");

  /** Registry order, grouped by the registry's own `group` field. */
  function grouped() {
    const order = [], by = new Map();
    SCENES.list.forEach((s) => {
      const g = s.group || "Other";
      if (!by.has(g)) { by.set(g, []); order.push(g); }
      by.get(g).push(s);
    });
    return order.map((g) => [g, by.get(g)]);
  }

  function render() {
    const m = menu();
    m.textContent = "";
    const head = document.createElement("div");
    head.className = "smh";
    const hb = document.createElement("b"); hb.textContent = "Scenes";
    const hi2 = document.createElement("i");
    hi2.textContent = SCENES.list.length + " · Esc closes";
    head.appendChild(hb); head.appendChild(hi2);
    m.appendChild(head);

    grouped().forEach(([g, list]) => {
      const h = document.createElement("div");
      h.className = "smg"; h.textContent = g;
      m.appendChild(h);
      list.forEach((s) => {
        const cur = !!(state.scene && s.id === state.scene.id);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "smi" + (cur ? " on" : "");
        b.dataset.id = s.id;
        b.setAttribute("role", "menuitem");
        b.title = "?scene=" + s.id;
        if (cur) {
          const tag = document.createElement("span");     // floated: first child
          tag.className = "tag"; tag.textContent = "current";
          b.appendChild(tag);
        }
        const nm = document.createElement("b"); nm.textContent = s.name;
        const ky = document.createElement("em"); ky.textContent = s.key || s.id;
        const bl = document.createElement("p"); bl.textContent = s.blurb || "";
        b.appendChild(nm); b.appendChild(ky); b.appendChild(bl);
        b.onclick = () => choose(s.id);
        m.appendChild(b);
        if (pending === s.id) m.appendChild(warning(s));
      });
    });
  }

  /** The inline "this drops your drawing" step. */
  function warning(s) {
    const n = sim && sim.segs ? sim.segs.length : 0, gn = state.gauges.length;
    const w = document.createElement("div");
    w.className = "smwarn";
    const p = document.createElement("div");
    const b1 = document.createElement("b"); b1.textContent = "Loading drops your drawing.";
    p.appendChild(b1);
    p.appendChild(document.createTextNode(
      " " + s.name + " starts clean, so the " + n + " segment" + (n === 1 ? "" : "s") +
      " you have drawn" + (gn ? " and " + gn + " gauge" + (gn === 1 ? "" : "s") : "") +
      " will be gone. Save it first with Controls → Rig → ⇪ Share link " +
      "(or ⤓ Export JSON): the link rebuilds this rig exactly."));
    const r = document.createElement("div"); r.className = "r";
    const go = document.createElement("button");
    go.className = "go"; go.textContent = "Discard and load";
    go.onclick = (e) => { e.stopPropagation(); load(s.id); };
    const no = document.createElement("button");
    no.className = "no"; no.textContent = "Cancel";
    no.onclick = (e) => { e.stopPropagation(); pending = null; render(); place(); };
    r.appendChild(go); r.appendChild(no);
    w.appendChild(p); w.appendChild(r);
    return w;
  }

  /** A row was clicked. The current scene is a no-op — nobody should be able to
   *  bin a settled run by clicking the thing they are already looking at. */
  function choose(id) {
    if (state.scene && id === state.scene.id) { close(); return; }
    if (sim && sim.segs && sim.segs.length && pending !== id) {
      pending = id; render(); place();
      const w = menu().querySelector(".smwarn");
      if (w && w.scrollIntoView) w.scrollIntoView({ block: "nearest" });
      return;
    }
    load(id);
  }
  function load(id) { pending = null; close(); switchScene(id); }

  /** Under the element that opened it, right-aligned to it, clamped on screen. */
  function place() {
    const m = menu();
    const a = anchor && anchor.isConnected ? anchor : titleEl();
    const r = a.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 8)) + "px";
  }

  function open(a) {
    EX.close();                 // the two menus are alternatives, not a stack
    anchor = a || titleEl();
    pending = null; hi = -1;
    render();
    menu().classList.add("open");
    place();
    titleEl().classList.add("open");
    const btn = document.getElementById("sceneBtn");
    if (btn) btn.classList.add("active");
    const on = menu().querySelector(".smi.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  function close() {
    if (el) el.classList.remove("open");
    pending = null; hi = -1;
    titleEl().classList.remove("open");
    const btn = document.getElementById("sceneBtn");
    if (btn) btn.classList.remove("active");
  }
  function toggle(a) { if (isOpen()) close(); else open(a); }
  /** Keep an open menu honest when the scene changes under it. */
  function refresh() { if (isOpen()) { render(); place(); } }

  /** Every key while the menu is open comes here, so none of them reach the
   *  global shortcuts — C (clear drawing) with a menu open would be a
   *  spectacular way to lose a rig. */
  function key(e) {
    const list = [...menu().querySelectorAll(".smi")];
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!list.length) return;
      const d = e.key === "ArrowDown" ? 1 : list.length - 1;
      hi = hi < 0 ? (e.key === "ArrowDown" ? 0 : list.length - 1) : (hi + d) % list.length;
      list.forEach((b, i) => b.classList.toggle("hi", i === hi));
      if (list[hi].scrollIntoView) list[hi].scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const act = document.activeElement;
      const b = (hi >= 0 && list[hi]) ||
        (act && act.classList && act.classList.contains("smi") ? act : null);
      if (b) { e.preventDefault(); choose(b.dataset.id); }
    }
  }

  /** Click-away. In capture, so a dismissing click on the canvas dismisses
   *  ONLY — it does not also start drawing a wall. */
  function onDown(e) {
    if (!isOpen()) return;
    if (menu().contains(e.target)) return;
    if (anchor && anchor.contains && anchor.contains(e.target)) return;  // its own toggle
    close();
    if (e.target === canvas) { e.preventDefault(); e.stopPropagation(); }
  }

  return { open, close, toggle, isOpen, refresh, key, onDown, render,
           choose, place, get pending() { return pending; } };
})();

// ------------------------------------------------------- exercise picker
/** The teaching pack, in the UI. Forty demos live in `exercises/`, and each
 *  one is a scene PLUS a set of panel settings PLUS (often) a drawn rig, so
 *  far described only in prose in its README. In a lecture hall that is
 *  unusable: this turns "HJ-1" into a set-up simulation and a card telling you
 *  what to read off it.
 *
 *  WHAT IT DOES AND DOES NOT SET. It gives every student the same STARTING
 *  POINT — the scene, Resolution Medium, the captured rig, and only the
 *  plumbing a README documents as load-bearing (`rigParams`) plus the display
 *  settings the demo is meant to be read on (`viewParams`). It does NOT set the
 *  student's own work: the personalised parameter, the coupled value the
 *  worksheet makes them derive, where the gauges go, or the staged sequence.
 *  Those are PRINTED on the card and left for them to do — including getting
 *  them wrong, which is where the learning is. Everything that IS applied is
 *  listed on the card under "already set", so nothing is silently magic.
 *
 *  Two optional data files, both plain classic scripts:
 *    js/exercises.js       `const EXERCISES = [...]`      — the list
 *    js/exercises-rigs.js  `const EXERCISE_RIGS = {...}`  — the drawn geometry
 *  Either may be absent. Without the list the menu says so and nothing else
 *  changes; without the rig pack an exercise still loads its scene and its
 *  settings, and the card says to draw the rig from the README. Nothing here
 *  knows an exercise id.
 *
 *  Scene loading goes through `switchScene` — the same path the scene menu
 *  takes — so an exercise pick is exactly a fresh `?scene=` boot plus the
 *  settings, and the drawn-work warning is the same one, in the same words. */
const EX = (() => {
  let el = null, anchor = null, pending = null, hi = -1, filter = "";
  let cur = null;              // the exercise the card is showing
  let digit = null;            // the digit applied to it (null = none entered)
  const memo = {};             // exercise id -> digit, sticky for the session
  let lastDigit = null;        // ...and the last digit entered anywhere
  const cardPos = {};          // "card" -> [left, top], so a re-pick lands home
  let settleTo = 0, settleWhat = "";
  let note = "";               // rig / unknown-control trouble, shown on the card
  let ready = Promise.resolve();  // resolves when the last pick has fully applied

  // ------------------------------------------------------------ the data
  function all() {
    return (typeof EXERCISES !== "undefined" && Array.isArray(EXERCISES)) ? EXERCISES : [];
  }
  function byId(id) { return all().find((e) => e.id === id) || null; }
  /** The rig pack is consumed defensively: absent file, absent key and a
   *  payload in any of the shapes RIG understands all end somewhere sane. */
  /** Some rigs come in variants the digit chooses between — DA-1 is the same
   *  weir at three scales, B8 three different orifice lips — so the key is a
   *  per-digit `rigTable` where one exists. With no digit yet, the d = 0 rig
   *  is the one that matches the d = 0 settings in `params`. */
  function rigKey(ex, d) {
    if (ex.rigTable && ex.rigTable.length) {
      const n = ex.rigTable.length;
      const dd = (d === null || d === undefined) ? 0 : ((d % n) + n) % n;
      return ex.rigTable[dd];
    }
    return ex.rig;
  }
  function rigFor(ex, d) {
    if (!ex || !ex.rig) return null;
    if (typeof EXERCISE_RIGS === "undefined" || !EXERCISE_RIGS) return null;
    // The pack is written by hand, so accept the obvious spellings of a key
    // rather than failing the whole exercise over a hyphen.
    const k = rigKey(ex, d === undefined ? digit : d);
    const keys = [k, ex.rig, ex.id, String(ex.id).replace(/-/g, ""), ex.folder];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] && EXERCISE_RIGS[keys[i]]) return EXERCISE_RIGS[keys[i]];
    }
    return null;
  }
  function needsRig(ex) { return !!(ex && ex.rig); }
  function hasRig(ex, d) { return !!rigFor(ex, d); }

  // ------------------------------------------------- the personalised digit
  /** `value = base + step·d`, or a per-digit `table` where the measured rule
   *  is not linear (HJ-1's tailwater steps to 1.5·d_c at d = 6 and 9), with an
   *  optional `mod` for "d mod N" rules. `also` carries the coupled values the
   *  worksheet makes the student derive.
   *
   *  These are DISPLAYED, never applied. The one thing a digit does write is
   *  `rigTable` — which captured drawing loads — because DA-1's λ = ¼ weir is a
   *  different rig, not a different number. */
  function rules(ex) {
    if (!ex || !ex.digit) return [];
    return [ex.digit].concat(ex.digit.also || []);
  }
  function ruleValue(r, d) {
    const n = r.mod || (r.table ? r.table.length : 0);
    const dd = n ? ((d % n) + n) % n : d;
    let v = (r.table && r.table.length) ? r.table[dd % r.table.length]
                                        : (r.base || 0) + (r.step || 0) * dd;
    if (typeof v === "number") {
      if (r.min !== undefined) v = Math.max(r.min, v);
      if (r.max !== undefined) v = Math.min(r.max, v);
      // 0.42 + 0.03·3 is 0.5100000000000001 in binary, and that is what the
      // panel would print. The rules are quoted to at most 3 decimals.
      v = Math.round(v * 1e4) / 1e4;
    }
    return v;
  }
  function ruleLabel(r) {
    if (r.label) return r.label;
    return ctlLabel(r.control) || r.control;
  }
  /** The name of the panel row a value has to be set on, so the card can say
   *  "set it on the Inflow q slider" rather than setting it. */
  function ctlLabel(id) {
    const c = CONTROLS.find((x) => x.id === id);
    return c ? c.label : id;
  }
  /** A control value as the panel would name it: an option's own text for a
   *  select, on/off for a checkbox, the number otherwise. */
  function ctlText(id, v) {
    const c = CONTROLS.find((x) => x.id === id);
    if (c && c.type === "select" && c.opts) {
      const o = c.opts.find((x) => String(x[0]) === String(v));
      if (o) return o[1];
    }
    if (c && c.type === "check") return v ? "on" : "off";
    return fmtVal(v);
  }
  /** Two decimals at least, so a rule that lands on 1.00 does not print "1"
   *  next to a slider reading 1.000; more where the rule itself is finer. */
  function fmtVal(v) {
    if (typeof v !== "number") return String(v);
    const s = String(+v.toFixed(4));
    const dp = (s.split(".")[1] || "").length;
    return v.toFixed(Math.max(2, Math.min(4, dp)));
  }
  /** The panel row a value has to be set on, named the way the panel looks:
   *  "Inflow q slider", "Tailwater control tickbox". Only the first value gets
   *  it — once you know the card is naming panel rows, the rest are findable. */
  function ctlWhere(id) {
    const c = CONTROLS.find((x) => x.id === id);
    if (!c) return "";
    if (c.type === "check") return c.label + " tickbox";
    if (c.type === "select") return c.label + " menu";
    return c.label + (c.min !== undefined ? " slider" : "");
  }
  /** "q = 0.51 m²/s (Inflow q slider) · tailwater 0.538 m" — the rules
   *  evaluated at a digit. No longer printed on the card (the card prints the
   *  RULES and the student does the arithmetic); kept for scripts and tests. */
  function digitSummary(ex, d) {
    return rules(ex).map((r, i) => {
      const w = (i === 0 && r.control) ? ctlWhere(r.control) : "";
      return ruleLabel(r) + " = " + fmtVal(ruleValue(r, d)) + (r.unit ? " " + r.unit : "") +
             (w ? " (" + w + ")" : "");
    }).join("  ·  ");
  }
  /** The card's personalised rules as sentences to act on, values NOT filled
   *  in: "q (m²/s): q = 0.42 + 0.03·d · Inflow q slider". The tables the
   *  longer rules lean on stay in the brief, where the lecturer put them. */
  function ruleLines(ex) {
    return rules(ex).map((r, i) => {
      const w = (i === 0 && r.control) ? ctlWhere(r.control) : "";
      return ruleLabel(r) + (r.unit ? " (" + r.unit + ")" : "") + ": " +
             (r.rule || "see the brief") + (w ? "  ·  " + w : "");
    });
  }

  // ------------------------------------------------------------- applying
  function setControl(id, v) {
    const c = CONTROLS.find((x) => x.id === id);
    if (!c || !c.set) return false;
    if (c.type === "check") c.set(!!v);
    else if (c.type === "select") c.set(String(v));
    else c.set(+v);
    return true;
  }
  /** The applied half of an exercise: `rigParams` (the plumbing that makes it
   *  a working rig) then `viewParams` (how it is meant to be looked at). Key
   *  ORDER inside each is honoured, because ticking a level control opens its
   *  own edge — which is why the edges are written first. Nothing else about an
   *  exercise is applied: `studentParams`, the digit's values and the
   *  instrument stations are the student's own work and are only printed. */
  function applyParams(ex) {
    const miss = [], p = (ex && ex.rigParams) || {}, v = (ex && ex.viewParams) || {};
    // Resolution first: it rebuilds the grid, and every other control is a
    // live parameter that survives the rebuild. Skipped when it is already
    // what the exercise wants — a rebuild for nothing costs the drawn rig a
    // re-rasterisation and the run its clock.
    if (p.budget !== undefined && p.budget !== state.budget &&
        !setControl("budget", p.budget)) miss.push("budget");
    Object.keys(p).forEach((k) => {
      if (k === "budget") return;
      if (!setControl(k, p[k])) miss.push(k);
    });
    Object.keys(v).forEach((k) => { if (!setControl(k, v[k])) miss.push(k); });
    syncPanel();
    return miss;
  }
  /** The controls the STUDENT owns: the digit's own rules and `studentParams`,
   *  minus anything the exercise also declares load-bearing (a value in
   *  `rigParams` is the bench's, whatever else names it). */
  function studentControls(ex) {
    const app = Object.assign({}, ex.rigParams || {}, ex.viewParams || {}), ids = [];
    rules(ex).forEach((r) => {
      if (r.control && app[r.control] === undefined) ids.push(r.control);
    });
    (ex.studentParams || []).forEach((p) => {
      if (p.control && app[p.control] === undefined) ids.push(p.control);
    });
    return ids.filter((v, i, a) => a.indexOf(v) === i);
  }
  /** THE SAME STARTING POINT FOR ALL TEN DIGITS. A rig payload carries whatever
   *  panel state the capture happened to have, and those captures were taken at
   *  a reference row — MO-1's snapshot sits on level 1.2103, which IS the
   *  d = 5/6/7 answer, and FR-1's 3.30 is d = 0's. Left alone, three students in
   *  ten would boot with their own parameter already dialled in and seven would
   *  not: not one starting point but two, and the picker silently doing one
   *  student's work. So every student-owned control is put back to the value it
   *  had on a fresh boot of this scene, read before the rig landed. Anything a
   *  rig genuinely needs to function belongs in `rigParams`, where it is applied
   *  after this and listed on the card. */
  function resetStudentControls(fresh) {
    Object.keys(fresh).forEach((id) => setControl(id, fresh[id]));
    syncPanel();
  }
  /** Instruments are NOT placed. Choosing where to measure is part of every one
   *  of these exercises — B1's entire failure mode is a gauge at the wrong
   *  station, and NC-1's window IS the personalisation — so the card prints the
   *  station rule and the picker clears whatever a rig payload carried. */
  function clearInstruments() {
    GINSP.closeAll();
    state.gauges.length = 0;
    state.rakes.length = 0;
    state.cv = null;
    state.gaugeT = -1;
  }
  /** A rig payload may be the rig object itself, an encoded `#rig=` code, a
   *  share URL, or raw JSON — RIG reads all of them. Async because the deflate
   *  branch is. */
  function applyRig(payload) {
    return Promise.resolve().then(() => {
      let p = payload;
      if (p && typeof p === "object" && !p.segs && (p.rig || p.data)) p = p.rig || p.data;
      if (typeof p === "string") return RIG.load(p);
      if (p && typeof p === "object") return RIG.apply(p);
      throw new Error("unrecognised rig payload");
    });
  }

  /** Load an exercise: scene, rig, settings, digit, countdown, card. */
  function pick(id, opts) {
    const ex = byId(id);
    if (!ex) return false;
    const o = opts || {};
    note = "";
    if (!switchScene(ex.scene)) {
      note = "scene \"" + ex.scene + "\" is not in this build — loaded the sandbox instead";
      switchScene("sandbox");
    }
    // Read the SCENE's own value for every student-owned control now, on a
    // fresh boot, before the rig or anything else can move it. See
    // `resetStudentControls`.
    const fresh = {};
    studentControls(ex).forEach((id) => {
      const c = CONTROLS.find((x) => x.id === id);
      if (c && c.get) fresh[id] = c.get();
    });
    // The digit is settled BEFORE the rig, because a variant rig (DA-1's three
    // scales, B8's three lips) is chosen by it.
    let d0 = o.digit;
    if (d0 === undefined) d0 = (memo[ex.id] !== undefined ? memo[ex.id] : lastDigit);
    const rig = rigFor(ex, (d0 === null || d0 === undefined || d0 === "") ? null : (+d0 | 0));
    // Resolution BEFORE the rig, never after. Several payloads are
    // cell-quantised (DA-1's weir dimensions are whole cells at Medium, LL-2's
    // fault is 2–3 cells of an 18-cell bore), so a rig rasterised at another
    // Δx is quietly a different rig. Every payload was captured at Medium and
    // the programme's standing rule is Medium anyway.
    const bud = ex.rigParams && ex.rigParams.budget;
    if (bud && bud !== state.budget) setControl("budget", bud);
    const done = () => {
      const miss = applyParams(ex);
      if (miss.length) note += (note ? " · " : "") + "unknown control" +
        (miss.length > 1 ? "s" : "") + ": " + miss.join(", ");
      // A rig payload carries the gauges and the panel state the capture
      // happened to have; the student places their own instruments and sets
      // their own values, from an identical bench whatever their digit.
      clearInstruments();
      resetStudentControls(fresh);
      const d = d0;
      digit = (d === null || d === undefined || d === "") ? null : (+d | 0);
      if (digit !== null) { memo[ex.id] = digit; lastDigit = digit; }
      cur = ex;
      arm(ex.settle || 0, ex.id);
      syncURLEx(ex.id);
      card.show();
      syncPanel();
      showToast(ex.id + " · " + ex.title,
        needsRig(ex) && !rig
          ? "Starting point set — the rig is not in this build, draw it from the README."
          : "Starting point set: scene, Resolution " + state.budget + (rig ? ", rig" : "") +
            ". Your own values are on the card.");
    };
    if (rig) {
      // Applying a rig may be asynchronous (RIG decodes deflated codes), so
      // the settings land a microtask later. `EX.ready` is the handle for
      // anything that must wait — headless tests, mostly.
      ready = applyRig(rig).then(done, (err) => {
        note = "rig did not load (" + (err && err.message || err) + ") — draw it from the README";
        done();
      });
      return true;
    }
    if (needsRig(ex)) note = "no rig pack in this build";
    done();
    ready = Promise.resolve();
    return true;
  }

  /** Back to the COMMON STARTING POINT — scene, Resolution, rig, the
   *  load-bearing settings — and nothing else. The recovery path when a rig has
   *  been drawn over. It deliberately does not restore the student's own
   *  settings: those were never applied, and re-applying them here would make
   *  the button a way to have the exercise done for you. The digit is kept,
   *  because it is who you are, not a setting. */
  function reset() { if (cur) pick(cur.id, { digit: digit }); }

  function setDigit(d) {
    if (!cur) return;
    if (d === null || d === "" || d === undefined || isNaN(+d)) {
      digit = null; delete memo[cur.id]; card.refresh(); return;
    }
    const nd = Math.max(0, Math.min(9, +d | 0));
    // A variant rig is chosen by the digit, so changing it is a re-setup, not
    // a slider move: DA-1's λ = ¼ weir is a different drawing, not a number.
    if (cur.rigTable && rigKey(cur, nd) !== rigKey(cur, digit)) { pick(cur.id, { digit: nd }); return; }
    digit = nd;
    memo[cur.id] = digit; lastDigit = digit;
    // Nothing on the panel moves: the card now shows YOUR numbers and you set
    // them. So there is nothing to re-settle either, until you do.
    card.refresh();
  }

  // ------------------------------------------------------------ countdown
  /** The settle wait runs the solver FLAT OUT, exactly as a scene's own
   *  `spinup` does — nobody in a lecture should sit through 50 s of real time
   *  before they are allowed to read a number. */
  function arm(secs, what) {
    settleTo = secs > 0 ? sim.t + secs : 0;
    settleWhat = what || "";
  }
  function settleTarget() { return (settleTo && sim.t < settleTo) ? settleTo : 0; }
  function settleHint() {
    return "settling " + settleWhat + "… <b>" + Math.max(0, settleTo - sim.t).toFixed(1) +
           " s</b> to go";
  }

  // ----------------------------------------------------------------- menu
  const menu = () => (el || (el = document.getElementById("exmenu")));
  const isOpen = () => !!(el && el.classList.contains("open"));

  function grouped() {
    const order = [], by = new Map(), f = filter.trim().toLowerCase();
    all().forEach((e) => {
      if (f && !((e.id + " " + e.title + " " + (e.topic || "") + " " + e.scene + " " +
                  (e.start || "")).toLowerCase().includes(f))) return;
      const g = e.topic || "Other";
      if (!by.has(g)) { by.set(g, []); order.push(g); }
      by.get(g).push(e);
    });
    return order.map((g) => [g, by.get(g)]);
  }

  function render() {
    const m = menu();
    m.textContent = "";
    const head = document.createElement("div");
    head.className = "smh";
    const hb = document.createElement("b"); hb.textContent = "Exercises";
    const hi2 = document.createElement("i");
    hi2.textContent = all().length ? all().length + " · Esc closes" : "none loaded";
    head.appendChild(hb); head.appendChild(hi2);
    m.appendChild(head);

    if (!all().length) {
      const n = document.createElement("div");
      n.className = "smnone";
      n.textContent = "js/exercises.js is not loaded — the teaching pack is optional data, " +
        "and everything else works without it.";
      m.appendChild(n);
      return;
    }

    const f = document.createElement("input");
    f.className = "smf"; f.type = "search"; f.value = filter;
    f.placeholder = "filter — id, title, topic, scene";
    f.oninput = () => { filter = f.value; hi = -1; const s = f.selectionStart; render(); place();
                        const g = menu().querySelector(".smf"); if (g) { g.focus(); g.setSelectionRange(s, s); } };
    f.onkeydown = (e) => key(e);
    m.appendChild(f);

    const groups = grouped();
    if (!groups.length) {
      const n = document.createElement("div");
      n.className = "smnone"; n.textContent = "nothing matches “" + filter + "”.";
      m.appendChild(n);
      return;
    }
    groups.forEach(([g, list]) => {
      const h = document.createElement("div");
      h.className = "smg"; h.textContent = g;
      m.appendChild(h);
      list.forEach((e) => {
        const on = !!(cur && cur.id === e.id);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "smi" + (on ? " on" : "");
        b.dataset.id = e.id;
        b.setAttribute("role", "menuitem");
        b.title = "exercises/" + e.folder + "/README.md";
        if (needsRig(e)) {
          const t = document.createElement("span");
          t.className = "rigtag";
          t.textContent = hasRig(e) ? "rig ✓" : "rig: draw it";
          t.style.color = hasRig(e) ? "#5fd08a" : "#ffb648";
          b.appendChild(t);
        }
        const idc = document.createElement("span"); idc.className = "eid"; idc.textContent = e.id;
        const nm = document.createElement("b"); nm.textContent = e.title;
        const bl = document.createElement("p");
        bl.textContent = (e.start ? e.start + "  ·  " : "") +
          "?scene=" + e.scene + (e.settle ? "  ·  settles in " + e.settle + " s" : "");
        b.appendChild(idc); b.appendChild(nm); b.appendChild(bl);
        b.onclick = () => choose(e.id);
        m.appendChild(b);
        if (pending === e.id) m.appendChild(warning(e));
      });
    });
  }

  /** The scene menu's warning, in the same words and the same amber block —
   *  an exercise pick reloads the scene, so it costs a drawing just the same. */
  function warning(e) {
    const n = sim && sim.segs ? sim.segs.length : 0, gn = state.gauges.length;
    const w = document.createElement("div");
    w.className = "smwarn";
    const p = document.createElement("div");
    const b1 = document.createElement("b"); b1.textContent = "Loading drops your drawing.";
    p.appendChild(b1);
    p.appendChild(document.createTextNode(
      " " + e.id + " sets up " + e.scene + " from scratch, so the " + n + " segment" +
      (n === 1 ? "" : "s") + " you have drawn" +
      (gn ? " and " + gn + " gauge" + (gn === 1 ? "" : "s") : "") +
      " will be gone. Save it first with Controls → Rig → ⇪ Share link."));
    const r = document.createElement("div"); r.className = "r";
    const go = document.createElement("button");
    go.className = "go"; go.textContent = "Discard and set up";
    go.onclick = (ev) => { ev.stopPropagation(); load(e.id); };
    const no = document.createElement("button");
    no.className = "no"; no.textContent = "Cancel";
    no.onclick = (ev) => { ev.stopPropagation(); pending = null; render(); place(); };
    r.appendChild(go); r.appendChild(no);
    w.appendChild(p); w.appendChild(r);
    return w;
  }

  function choose(id) {
    if (sim && sim.segs && sim.segs.length && pending !== id) {
      pending = id; render(); place();
      const w = menu().querySelector(".smwarn");
      if (w && w.scrollIntoView) w.scrollIntoView({ block: "nearest" });
      return;
    }
    load(id);
  }
  function load(id) { pending = null; close(); pick(id); }

  function place() {
    const m = menu();
    const a = anchor && anchor.isConnected ? anchor : document.getElementById("exBtn");
    const r = a.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 8)) + "px";
  }
  function open(a) {
    PICKER.close();
    anchor = a || document.getElementById("exBtn");
    pending = null; hi = -1;
    render();
    menu().classList.add("open");
    place();
    const btn = document.getElementById("exBtn");
    if (btn) btn.classList.add("active");
    const f = menu().querySelector(".smf");
    if (f) f.focus();
    const on = menu().querySelector(".smi.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  function close() {
    if (el) el.classList.remove("open");
    pending = null; hi = -1;
    const btn = document.getElementById("exBtn");
    if (btn) btn.classList.remove("active");
  }
  function toggle(a) { if (isOpen()) close(); else open(a); }
  function refresh() { if (isOpen()) { render(); place(); } }

  /** The menu owns the keyboard while it is open (the filter box has focus,
   *  so the global shortcuts would not fire anyway — but arrows and Enter
   *  have to work from inside it). */
  function key(e) {
    const list = [...menu().querySelectorAll(".smi")];
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!list.length) return;
      const d = e.key === "ArrowDown" ? 1 : list.length - 1;
      hi = hi < 0 ? (e.key === "ArrowDown" ? 0 : list.length - 1) : (hi + d) % list.length;
      list.forEach((b, i) => b.classList.toggle("hi", i === hi));
      if (list[hi].scrollIntoView) list[hi].scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      const act = document.activeElement;
      const b = (hi >= 0 && list[hi]) ||
        (act && act.classList && act.classList.contains("smi") ? act : null) || list[0];
      if (b) { e.preventDefault(); choose(b.dataset.id); }
    }
  }
  function onDown(e) {
    if (!isOpen()) return;
    if (menu().contains(e.target)) return;
    if (anchor && anchor.contains && anchor.contains(e.target)) return;
    close();
    if (e.target === canvas) { e.preventDefault(); e.stopPropagation(); }
  }

  // ----------------------------------------------------------------- card
  /** A small draggable panel, built to match the gauge inspector (same glass,
   *  same header drag through `dragWindow`).
   *
   *  DELIBERATELY TERSE, in one neutral style. Somebody reads this over a
   *  neighbour's shoulder in a lecture where the lecturer is already saying
   *  what to do: the id, your own numbers, one line on what is on the bench,
   *  one or two on what to do and what to read, a collapsed receipt of what was
   *  applied, and the link to the full brief. Everything else — why a rule is
   *  what it is, the flutter cautions, the procedure for a drawn
   *  personalisation, what gets handed in — lives in the README. Adding a
   *  coloured block here has been tried and was thrown out. */
  const card = (() => {
    let box = null, digitEl = null, pill = null;
    function build() {
      if (box) return box;
      box = document.createElement("div");
      box.className = "excard glass";
      box.innerHTML =
        '<div class="excard-h">' +
          '<span class="eid"></span><b></b><span class="grow"></span>' +
          '<button class="excard-x" data-a="min" title="Minimise">–</button>' +
          '<button class="excard-x" title="Close">×</button>' +
        '</div>' +
        '<div class="excard-body">' +
          '<div class="exline exyours"></div>' +
          '<div class="exd"><label>student number ends in</label>' +
            '<input type="number" min="0" max="9" step="1" inputmode="numeric" ' +
                   'title="The last digit of your student number">' +
            '<span class="exval"></span></div>' +
          '<div class="exline exrule"></div>' +
          '<div class="exline exstart"></div>' +
          '<div class="exline extask"></div>' +
          '<div class="exline exnote"></div>' +
          '<ol class="exsteps"></ol>' +
          '<div class="exline exstations"></div>' +
          '<div class="exline exalso"></div>' +
          '<div class="exline exmiss"></div>' +
          '<details class="exset"><summary>Already set</summary><div class="exsetl"></div></details>' +
          '<div class="exfoot">' +
            '<span class="exsettle"></span>' +
            '<button class="exb" data-a="reset" title="Scene, Resolution, the rig and the ' +
                   'load-bearing settings only. Your own values are not restored — they were ' +
                   'never set for you.">↻ Reset to the starting point</button>' +
            '<a class="exlink" target="_blank" rel="noopener"></a>' +
          '</div>' +
        '</div>';
      document.body.appendChild(box);
      digitEl = box.querySelector(".exd input");
      digitEl.oninput = () => setDigit(digitEl.value);
      // The card is a window, not the canvas: its keystrokes are its own.
      digitEl.onkeydown = (e) => e.stopPropagation();
      box.querySelector(".excard-x:not([data-a])").onclick = (e) => { e.currentTarget.blur(); hide(); };
      box.querySelector('[data-a="min"]').onclick = (e) => { e.currentTarget.blur(); mini(); };
      box.querySelector('[data-a="reset"]').onclick = (e) => { e.currentTarget.blur(); reset(); };
      dragWindow(box, box.querySelector(".excard-h"), (L, T) => { cardPos.card = [L, T]; });
      // Minimised, the card is a pill carrying the exercise id at the card's
      // own position — one click brings the brief back.
      pill = document.createElement("div");
      pill.className = "minpill glass";
      pill.title = "Restore the exercise card";
      pill.onclick = () => show();
      document.body.appendChild(pill);
      return box;
    }
    function show() {
      build();
      pill.classList.remove("show");
      const p = cardPos.card || [Math.max(8, innerWidth - 386), 100];
      box.style.left = p[0] + "px"; box.style.top = p[1] + "px";
      box.style.display = "block";
      refresh();
      // A digit already in hand applies to the new exercise too; an empty
      // field means "not yet personalised", which is a legitimate state.
      digitEl.value = digit === null ? "" : String(digit);
    }
    function mini() {
      if (!box || box.style.display === "none") return;
      pill.textContent = "▸ " + (cur ? cur.id : "exercise");
      pill.style.left = box.offsetLeft + "px";
      pill.style.top = box.offsetTop + "px";
      box.style.display = "none";
      pill.classList.add("show");
    }
    function hide() {
      if (box) box.style.display = "none";
      if (pill) pill.classList.remove("show");
    }
    function shown() { return !!(box && box.style.display !== "none"); }
    function refresh() {
      if (!box || !cur) return;
      box.querySelector(".eid").textContent = cur.id;
      const t = box.querySelector(".excard-h b");
      t.textContent = cur.title; t.title = cur.title;
      // The personalised rules are PRINTED, never computed: d is the last
      // digit of the student number, the lecturer owns explaining it, and
      // doing the arithmetic is the student's own first step. (An input that
      // computed "your numbers" here was removed on lecturer feedback.)
      line(box.querySelector(".exyours"), "Yours (d = last digit of your student number):",
           ruleLines(cur).join("\n"));
      // The one thing a digit still DOES is pick which captured drawing loads
      // (DA-1's λ = ¼ weir is a different rig, not a different number), so the
      // input survives only on those cards.
      box.querySelector(".exd").style.display = cur.rigTable ? "flex" : "none";
      box.querySelector(".exval").textContent =
        cur.rigTable ? "picks which captured drawing loads" : "";
      // Where the personalised thing is a stroke or a station there is no value
      // to print, so the rule itself is the instruction.
      line(box.querySelector(".exrule"), "", cur.digitNote || "");
      line(box.querySelector(".exstart"), "Start:", cur.start || "");
      line(box.querySelector(".extask"), "Do:", cur.task || "");
      line(box.querySelector(".exnote"), "Note:", cur.note || "");
      // Staged rigs: a snapshot cannot hold "fill it, THEN shut the valve".
      const st = box.querySelector(".exsteps");
      st.textContent = "";
      (cur.setup || []).forEach((s) => {
        const li = document.createElement("li"); li.textContent = s; st.appendChild(li);
      });
      st.style.display = (cur.setup && cur.setup.length) ? "block" : "none";
      line(box.querySelector(".exstations"), stationLabel(), stations());
      // Six demos SPAN two scenes (WV-1's second cohort, NC-3's m2 anchor,
      // HJ-1's s1 coda…). `?ex=` boots one of them, so the card has to say
      // which the other is and when to go there — it never switches by itself.
      line(box.querySelector(".exalso"), "Also:", cur.secondScene ? cur.secondScene.when : "");
      const missing = needsRig(cur) && !hasRig(cur);
      line(box.querySelector(".exmiss"), "",
           missing ? "The rig pack is not in this build — draw the rig from the brief." +
                     (note ? " (" + note + ")" : "")
                   : (note || ""));
      already();
      const a = box.querySelector(".exlink");
      // On the Pages build Jekyll renders README.md as the folder's page and
      // does not serve the raw .md; everywhere else the file itself is right.
      const brief = "exercises/" + cur.folder +
        (/\.github\.io$/i.test(location.hostname) ? "/" : "/README.md");
      a.href = brief;
      a.textContent = brief;
      tick();
    }
    /** One plain line: a bold lead-in and the sentence. No line has a colour, a
     *  border or a background of its own — that is the point of the card. */
    function line(el, label, text) {
      el.textContent = "";
      if (!text) { el.style.display = "none"; return; }
      if (label) {
        const b = document.createElement("b"); b.textContent = label + " ";
        el.appendChild(b);
      }
      el.appendChild(document.createTextNode(text));
      el.style.display = "block";
    }
    /** Where the instruments GO. The picker places none of them — choosing the
     *  station is part of every one of these demos — so this is the one thing
     *  from `instruments` the card still needs to say. The reason each station
     *  is where it is stays in the brief. */
    function stations() {
      const ins = cur.instruments || [];
      return ins.map((n) => n.where).filter(Boolean).join("  ·  ");
    }
    function stationLabel() {
      const ins = cur.instruments || [];
      if (!ins.length) return "";
      const rake = ins.some((n) => n.tool === "rake"), g = ins.some((n) => n.tool !== "rake");
      if (rake && !g) return ins.length > 1 ? "Rakes:" : "Rake:";
      if (rake && g) return "Instruments:";
      return ins.length > 1 ? "Gauges:" : "Gauge:";
    }
    /** ALREADY SET — the common starting point, itemised so that no applied
     *  value is invisible. Collapsed by default; it is a receipt, not an
     *  instruction, and it says neither how many items it holds nor that they
     *  are the same for everyone (they always are). */
    function already() {
      const det = box.querySelector(".exset"), sum = det.querySelector("summary");
      const list = det.querySelector(".exsetl");
      list.textContent = "";
      const items = [];
      items.push(["scene", (state.scene ? state.scene.name : cur.scene) + " (?scene=" + cur.scene + ")"]);
      items.push(["Resolution", state.budget]);
      if (needsRig(cur)) {
        items.push(["rig", hasRig(cur)
          ? "the captured drawing — " + (sim && sim.segs ? sim.segs.length : 0) + " stroke" +
            ((sim && sim.segs && sim.segs.length === 1) ? "" : "s")
          : "NOT in this build — draw it from the README"]);
      }
      const p = cur.rigParams || {}, why = cur.rigWhy || {};
      Object.keys(p).forEach((k) => {
        if (k === "budget") return;
        items.push([ctlLabel(k), ctlText(k, p[k]), why[k]]);
      });
      const v = cur.viewParams || {};
      const vs = Object.keys(v).map((k) => ctlLabel(k) + " " + ctlText(k, v[k]));
      if (vs.length) items.push(["view", vs.join(", "), why.view]);
      items.forEach(([k, val, w]) => {
        const d = document.createElement("div");
        const b = document.createElement("b"); b.textContent = k;
        d.appendChild(b);
        d.appendChild(document.createTextNode(" " + val));
        // A load-bearing value nobody can guess the reason for is mysterious,
        // and mysterious is how it gets "tidied up" by the next reader.
        if (w) { const i = document.createElement("i"); i.textContent = w; d.appendChild(i); }
        list.appendChild(d);
      });
      sum.textContent = "Already set";
      det.style.display = "block";
    }
    /** The countdown while it settles, and nothing at all once it has: a card
     *  that keeps announcing it is ready is a card nobody reads. */
    function tick() {
      if (!box || box.style.display === "none" || !cur) return;
      const s = box.querySelector(".exsettle");
      if (cur.settle && settleTo && sim.t < settleTo) {
        s.textContent = "settling — " + Math.max(0, settleTo - sim.t).toFixed(0) + " s";
        s.style.display = "inline";
      } else {
        s.textContent = ""; s.style.display = "none";
      }
    }
    return { show, hide, shown, refresh, tick, get el() { return box; } };
  })();

  function tick() { card.tick(); }
  function statusLine() {
    if (!all().length) return "js/exercises.js not loaded";
    if (!cur) return all().length + " demos from the teaching pack · " +
      all().filter((e) => needsRig(e)).length + " need a drawn rig";
    return cur.id +
      (cur.rigTable ? " · " + (digit === null ? "digit not set — the d = 0 drawing is loaded"
                                              : "digit " + digit) : "") +
      (needsRig(cur) && !hasRig(cur) ? " · rig NOT loaded" : "");
  }

  return { open, close, toggle, isOpen, refresh, key, onDown, render, place, choose,
           pick, reset, setDigit, all, byId, rules, ruleValue, digitSummary,
           settleTarget, settleHint, tick, statusLine, card,
           needsRig, hasRig, rigFor,
           get ready() { return ready; },
           get current() { return cur; }, get digit() { return digit; },
           get pending() { return pending; } };
})();

/** `?ex=<id>` for what is set up. The exercise owns the address bar while it
 *  is loaded (its scene is implied), and `#rig=` is dropped for the same
 *  reason `switchScene` drops it. */
function syncURLEx(id) {
  try {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.delete("scene");
    u.searchParams.set("ex", id);
    history.replaceState(null, "", u.pathname + u.search);
  } catch (_) { /* file:// refuses — harmless */ }
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
    get: () => state.vex, set: (v) => { state.vex = v; computeView(); },
    fmt: (v) => (v < 1.05 ? "true scale (1 : 1)" : "× " + v.toFixed(1) + " vertical"),
    info: "Stretches the view vertically. A 12 m × 1.5 m flume is a thin strip at true scale, so a 0.1 m wave is a few pixels — every long-section in hydraulics is drawn exaggerated for the same reason. You can also drag the empty band above or below the domain." },
  { id: "mode", type: "select", label: "Field",
    opts: [["0", "Water"], ["1", "Pressure head"], ["6", "Piezometric head"],
           ["2", "Speed"], ["3", "Froude number"],
           ["4", "Vorticity"], ["5", "Momentum flux"]],
    get: () => String(state.mode), set: (v) => state.mode = +v },
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
  { id: "channel", type: "check", label: "Open-channel overlay",
    get: () => state.channel, set: (v) => state.channel = v,
    info: "Critical depth d_c, normal depth d_n and the energy grade line, computed per column from the live depth and unit discharge." },
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
  ["gauge", "Gauge", "Click to log head / depth"],
  ["rake", "Rake", "Click for a velocity–depth profile"],
  ["tracer", "Tracers", "Click to drop a column of orbit tracers"],
  ["measure", "Measure", "Left-drag a tape measure (Shift snaps) — click to clear"],
  ["cv", "Force box", "Left-drag a control volume — reads the force on what it encloses. Click to clear"],
];

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
    state.drag = null; state.spoutDrag = false; state.measDrag = null; state.cvDrag = null;
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
  if (state.tool === "gauge") {
    if (state.gauges.length >= 4) state.gauges.shift();
    state.gauges.push({ x, z, hist: [], log: [], id: ++state.gaugeSeq,
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
  if (state.tool === "measure") {
    // A tape, not a wall: the drag never reaches SIM.addSeg. A bare click
    // (see onUp) clears the tape instead of leaving a zero-length one.
    state.measDrag = { x0: x, z0: z, x1: x, z1: z };
    return;
  }
  if (state.tool === "cv") {
    // Same contract as the tape: a drag places the box, a bare click clears it.
    state.cvDrag = { x0: x, z0: z, x1: x, z1: z };
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
  if (state.particles) SIM.advanceParticles(Math.min(realDt, 0.033) * Math.min(state.speed, 1.5));

  const simMs = performance.now() - t0;
  // AIMD governor: creep up while there is headroom, back off hard when not
  if (simMs > CONFIG.frameBudgetMs * 1.6) state.nsubMax = Math.max(2, state.nsubMax * 0.82);
  else if (simMs < CONFIG.frameBudgetMs * 0.75) state.nsubMax = Math.min(4000, state.nsubMax * 1.05 + 1);

  const analysis = OVERLAY.analyse(sim, col);
  sampleGauges(analysis);
  sampleRakes();
  sampleCV();
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
    const pr = SIM.probe(gg.x, gg.z);
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
function sampleRakes() {
  state.rakes.forEach((rk) => { const r = SIM.rake(rk.x, rk.buf); rk.buf = r.buf; rk.i = r.i; });
}

/** Place (or move) the force control volume. Corners are normalised and the
 *  running force estimate starts afresh — a moved box is a new measurement,
 *  and blending it with the old one would print a number no box ever read. */
function placeCV(x0, z0, x1, z1) {
  state.cv = {
    x0: Math.min(x0, x1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), z1: Math.max(z0, z1),
    ema: null, hist: [], t0: sim.t,
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
  const r = SIM.boxForce(cv.x0, cv.z0, cv.x1, cv.z1);
  const a = 1 - Math.exp(-Math.min(sim.t - cv.t0, 0.25) / 1.0);
  cv.t0 = sim.t;
  cv.ema = cv.ema ? { fx: cv.ema.fx + (r.fx - cv.ema.fx) * a,
                      fz: cv.ema.fz + (r.fz - cv.ema.fz) * a }
                  : { fx: r.fx, fz: r.fz };
  cv.hist.push({ t: sim.t, fx: r.fx });
  while (cv.hist.length > 2 && sim.t - cv.hist[0].t > 8) cv.hist.shift();
  cv.last = r;
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
  const P = SIM.patch(x0 - pad, x1 + pad, T.buf);
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
  } else if (state.cv) OVERLAY.drawCV(ctx, view, state.cv);
  drawMarkers(ctx);
  drawSpout(ctx);
  ctx.restore();
  OVERLAY.drawGaugeMarks(ctx, view, state.gauges);
  const fld = state.gaugeField;
  const cards = OVERLAY.drawGaugeCharts(ctx, view, state.gauges, fld,
    fld === "h" ? "h" : fld === "d" ? "d" : "|u|",
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

/** Header-drag for a floating window, shared by the gauge inspector and the
 *  exercise card so the two behave and clamp identically: never off the left
 *  or top, never further right than its own width, and never past the bottom
 *  by more than its header. `onPlace` gets the new position so the window can
 *  remember where it was put. */
function dragWindow(el, handle, onPlace) {
  let d = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest("button, input, a")) return;
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
  // Symbols follow free-surface convention: h is the piezometric head, d the
  // depth and η the water level, leaving H free for the energy head (the full
  // rationale, texts included, is in docs/notation.md). Since rig format v2
  // the KEYS are the symbols; older wire formats are rejected, not migrated —
  // prototype, no back-compat.
  const FIELDS = [
    ["h",     "h", "m",   "piezometric head, h = z + p/ρg"],
    ["d",     "d", "m",   "water depth of the column"],
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

    // ---- header drag (shared with the exercise card — see `dragWindow`)
    dragWindow(el, el.querySelector(".ginsp-h"), (L, T) => { posMemo[g.id] = [L, T]; });
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
      "x " + g.x.toFixed(2) + " · z " + g.z.toFixed(2) + " m";
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
                  "_x" + g.x.toFixed(2) + "_z" + g.z.toFixed(2);
      hdr.push(tag + "_h_m", tag + "_d_m", tag + "_speed_mps");
    });
    const cols = gs.length * 3, rows = new Map();
    gs.forEach((g, gi) => (g.log || []).forEach((s) => {
      let r = rows.get(s.t);
      if (!r) { r = new Array(cols).fill(""); rows.set(s.t, r); }
      r[gi * 3] = String(s.h); r[gi * 3 + 1] = String(s.d); r[gi * 3 + 2] = String(s.speed);
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
 *  - **Segments are physical**, `[x0,z0,x1,z1,thickness,kind]` in metres, and
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
  const V = 2;                                  // format version
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
      // Wire keys follow the display notation (z vertical, vz its velocity);
      // and match the runtime fields since the code-wide z/w rename.
      source: { on: b01(p.source.on), x: r4(p.source.x), z: r4(p.source.z),
                r: r4(p.source.r), vx: r4(p.source.vx), vz: r4(p.source.vz) },
      wave: { on: b01(p.wave.on), amp: r4(p.wave.amp),
              period: r4(p.wave.period), x: r4(p.wave.x) },
      hyd: { c: r4(p.c), cf: r4(p.cf), cs: r4(p.cs), bulk: r4(p.bulk),
             ca: r4(p.ca), nu: r4(p.nu), slip: b01(p.slip), g: r4(p.g) },
      dye: { line: r4(p.dyeLine), decay: r4(p.dyeDecay) },
      gauges: state.gauges.map((g) => [r4(g.x), r4(g.z)]),
      rakes: state.rakes.map((k) => r4(k.x)),
      ui: { mode: state.mode | 0, field: state.gaugeField, speed: r4(state.speed),
            channel: b01(state.channel), labels: b01(state.labels),
            jumps: b01(state.jumps), particles: b01(state.particles),
            dye: b01(state.dye) },
    };
    if (state.tracers) o.tracers = [r4(state.tracers.x), state.tracerN | 0,
                                    r4(state.tracers.trail)];
    if (state.cv) o.cv = [r4(state.cv.x0), r4(state.cv.z0), r4(state.cv.x1), r4(state.cv.z1)];
    return o;
  }

  /** Version gate. Exactly the current format loads — this is a prototype
   *  and old wire formats are NOT migrated (v2 renamed source y→z, vy→vz and
   *  the gauge field keys head→h, depth→d; a v1 link is simply stale).
   *  Wire keys and runtime keys agree since the code-wide z/w rename, so
   *  there is nothing to map — only the version to check. */
  function migrate(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.segs)) {
      throw new Error("not a hydraulician rig");
    }
    if ((o.v | 0) !== V) {
      throw new Error("rig format v" + (o.v | 0) + " — this build reads v" + V +
                      " only (prototype, no back-compat); re-save the rig");
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
      state.gauges.push( { x: +g[0], z: +g[1], hist: [], log: [], id: ++state.gaugeSeq,
                          colour: CONFIG.gaugeColours[state.gauges.length % 4] });
    });
    state.rakes.length = 0;
    (o.rakes || []).slice(0, 2).forEach((x) => state.rakes.push({ x: +x, buf: null }));
    state.cv = null;
    if (Array.isArray(o.cv) && o.cv.length === 4) placeCV(+o.cv[0], +o.cv[1], +o.cv[2], +o.cv[3]);
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
           (state.cv ? " · force box" : "") +
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
  // running estimates must not survive the redraw — a stale domain-wide d_n
  // is what made a drowned gate on a 1-in-4 bed read "M1". Every path that
  // re-rasterises the walls goes through one of these; a resolution change or
  // a scene load builds a fresh grid and starts clean anyway.
  ["rasterise", "addSeg", "undoSeg", "clearSegs"].forEach((k) => {
    const f = SIM[k];
    SIM[k] = (...a) => { const r = f(...a); OVERLAY.resetEstimates(sim); return r; };
  });

  // The scene menu (see PICKER). Four ways in: the title box in the corner,
  // the bar button, the panel's Scene row, and the S key below.
  const title = document.getElementById("title");
  title.onclick = (e) => PICKER.toggle(e.currentTarget);
  title.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();          // not the global Space = pause
    PICKER.toggle(title);
  });
  document.getElementById("sceneBtn").onclick = (e) => {
    const b = e.currentTarget; b.blur(); PICKER.toggle(b);
  };
  window.addEventListener("pointerdown", PICKER.onDown, true);
  addEventListener("resize", () => { if (PICKER.isOpen()) PICKER.place(); });

  // The exercise menu (see EX). Three ways in: the bar button, the panel's
  // Exercise row and the E key below; `?ex=<id>` boots straight into one.
  document.getElementById("exBtn").onclick = (e) => {
    const b = e.currentTarget; b.blur(); EX.toggle(b);
  };
  window.addEventListener("pointerdown", EX.onDown, true);
  addEventListener("resize", () => { if (EX.isOpen()) EX.place(); });

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
  syncTools();
  document.getElementById("hint").innerHTML = state.scene.tips[0] || "";

  const setPanel = (open) => {
    document.getElementById("panel").classList.toggle("open", open);
    document.getElementById("panelBtn").classList.toggle("active", open);
  };
  document.getElementById("panelBtn").onclick = () =>
    setPanel(!document.getElementById("panel").classList.contains("open"));
  // On the Pages build Jekyll renders numerics.md to numerics.html (it is not
  // README.md, so jekyll-readme-index does not make it a folder index);
  // everywhere else — file://, a plain static host — the .md itself is right.
  document.getElementById("aboutBtn").href = "docs/numerics" +
    (/\.github\.io$/i.test(location.hostname) ? ".html" : ".md");

  // Every floating box minimises (see MINI): the bar, the title/status box,
  // the tips line and the key list collapse to pills at their own anchors;
  // Controls just closes — its bar button is the way back in — and an
  // announcement toast dismisses on click.
  MINI.add("bar", document.getElementById("bar"),
    { corner: "inline", label: "☰", pill: { top: "14px", left: "14px" } });
  MINI.add("title", document.getElementById("title"),
    { corner: "cornerL", label: "▸ status", pill: { top: "14px", right: "14px" } });
  MINI.add("hint", document.getElementById("hint"),
    { label: "▸ tips", pill: { bottom: "18px", left: "50%", transform: "translateX(-50%)" } });
  MINI.add("keys", document.getElementById("keys"),
    { label: "▸ keys", pill: { bottom: "14px", left: "14px" } });
  [["panel", setPanel]].forEach(([id, close]) => {
    const b = document.createElement("button");
    b.className = "minbtn corner"; b.title = "Minimise"; b.textContent = "–";
    b.onclick = () => close(false);
    document.getElementById(id).appendChild(b);
  });
  document.getElementById("toast").onclick = () => {
    clearTimeout(toastTimer);
    document.getElementById("toast").classList.remove("show");
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
    // An open menu owns the keyboard: Esc/arrows/Enter are its own, and every
    // other shortcut is swallowed rather than fired behind it.
    if (PICKER.isOpen()) { PICKER.key(e); return; }
    if (EX.isOpen()) { EX.key(e); return; }
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); togglePause(); }
    else if (k === "s") PICKER.open(MINI.anchor("title") || document.getElementById("title"));
    else if (k === "e") EX.open(MINI.isMin("bar") ? MINI.anchor("bar")
                                                  : document.getElementById("exBtn"));
    else if (k === "v") toggleValve();
    else if (k === "z") SIM.undoSeg();
    else if (k === "c") SIM.clearSegs();
    else if (k === "r") { SIM.resetWater(); clearGaugeHistory(); }
    else if (k === "p") { state.particles = !state.particles; syncPanel(); }
    else if (k === "g") { state.mode = (state.mode + 1) % 7; syncPanel(); }
    else if (k === "d") { state.dye = !state.dye; syncPanel(); }
    else if (k === "n") { state.channel = !state.channel; syncPanel(); }
    else if (k === "m") { state.ruler = !state.ruler; syncPanel(); }
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
  switchScene,                             // load a scene as a fresh ?scene= boot would
  PICKER,                                  // the scene menu
  EX,                                      // the exercise picker (see ?ex=<id>)
  pickExercise: (id, d) => EX.pick(id, d === undefined ? undefined : { digit: d }),
  GINSP,                                   // gauge inspector windows
  RIG,                                     // rig save / share (see the Rig panel)
  inspect: (k) => GINSP.show(k || 0),
  gaugeCSV: (list) => GINSP.csv(list),     // the CSV text, without downloading
  clearGaugeHistory,
  tick: (n) => { for (let k = 0; k < (n || 1); k++) SIM.step(1); },
  frames: (n, dt) => { for (let k = 0; k < (n || 1); k++) tickFrame(dt || 1 / 60); },
  probe: (x, z) => SIM.probe(x, z),
  boxForce: (x0, z0, x1, z1) => SIM.boxForce(x0, z0, x1, z1),   // one raw integral
  placeCV,                                 // the Force box tool, headless
  /** Total water volume per unit width (m²) — the mass-balance check. */
  volume: () => {
    const c = SIM.columns(); let v = 0;
    for (let i = 0; i < sim.nx; i++) v += c[i * 4 + 1] * sim.dx;
    return v;
  },
};

addEventListener("DOMContentLoaded", boot);
