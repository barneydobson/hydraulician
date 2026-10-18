"use strict";
/**
 * dock.js — floating furniture: toasts, the minimisable boxes (MINI), the docked
 *   dock (DOCK), the start screen (START), and window dragging.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by test/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: toastTimer, showToast, hinted, wheelHint, MINI, DOCK, START, dragWindow
 *
 * Reads:   aboutHref, applyAutoVex, EX, fitBar, iconEl, newSandbox, PICKER, POPUP,
 *          setPanel, TIP
 */
// ------------------------------------------------------------------ toasts
let toastTimer = 0;
/** opt.html: `sub` is markup (innerHTML) -- TRUSTED constant strings only,
 *  i.e. the Controls `info` text; never anything typed or loaded.
 *  opt.sticky: no 5.2 s auto-hide; stays up until clicked or replaced. */
function showToast(title, sub, opt) {
  const t = document.getElementById("toast");
  const o = opt || {};
  document.getElementById("toastTitle").textContent = title;
  const s = document.getElementById("toastSub");
  if (o.html) s.innerHTML = sub || ""; else s.textContent = sub || "";
  t.classList.add("show");
  clearTimeout(toastTimer);
  // a click already dismisses any toast (the handler wired at boot)
  if (!o.sticky) toastTimer = setTimeout(() => t.classList.remove("show"), 5200);
}
/** The first plain wheel over the canvas, embedded, is a surprise — nothing
 *  seemed to happen because the page scrolled instead. Said once per page,
 *  not once per wheel: `hinted` is a closure, not state, on purpose. */
let hinted = false;
function wheelHint() {
  if (hinted) return;
  hinted = true;
  showToast("Ctrl + scroll zooms the flume", "Open in a new tab for the full window.");
}

// -------------------------------------------------------- minimisable boxes
/** Collapse any fixed UI box to a small pill and back. Each box gets a "–" in
 *  a corner; the pill sits at the box's own anchor so nothing moves, it just
 *  gets out of the way of the water. Session state only — a reload restores
 *  the full chrome, which is the least surprising thing for a lecture
 *  machine. */
const MINI = (() => {
  const items = {};
  /** opts: { pill: {css}, label } — the button sits in the box's top-right
   *  corner. */
  function add(id, el, opts) {
    const o = opts || {};
    const btn = document.createElement("button");
    btn.className = "minbtn corner";
    btn.title = "Minimise"; btn.textContent = "–";
    btn.onclick = (e) => { e.stopPropagation(); btn.blur(); set(id, true); };
    el.appendChild(btn);
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
  /** Let a pill carry a live word or two (the settle countdown, mostly).
   *  Called per frame, so it only touches the DOM on an actual change. */
  function pillText(id, txt) {
    const it = items[id];
    if (!it) return;
    const t = txt || it.label;
    if (it.pill.textContent !== t) it.pill.textContent = t;
  }
  /** Put a box's own minimise button back after its content was rewritten
   *  (the tips line is rewritten wholesale on every tip and every frame of a
   *  countdown, which used to take the button with it). */
  function keep(id) {
    const it = items[id];
    if (it && it.btn.parentNode !== it.el) it.el.appendChild(it.btn);
  }
  return { add, pillText, keep };
})();

// ============================================================= dock
/** The dock: a panel down the right-hand edge that the VIEWPORT gives way to,
 *  rather than one that sits on top of it. Opening it sets `--dock`, and both
 *  canvases are inset by that in the stylesheet, so nothing is ever drawn
 *  underneath the dock and `computeView` — which runs every frame off
 *  `canvas.clientWidth` — re-letterboxes the domain into what is left with no
 *  further help.
 *
 *  Under `MINW` there is no width to give away, so the panel goes back to
 *  overlaying and the water keeps the whole window. Folding parks it as a tab
 *  on the window edge: the exercise stays loaded, the screen goes back to
 *  being all water, and one click brings the brief back. */
const DOCK = (() => {
  // MINW: below this there is no width to give away, so the panel overlays.
  // The panel's own width (--dock-w), the width below which it becomes a
  // bottom sheet (--phone-max: a 348 px panel would cover almost the whole
  // screen, so the water keeps the top, which on a phone is the only part tall
  // enough to read a flume in) and the sheet's height (--sheet-h) are written
  // once, in css/app.css, and read back by sync() — never restated here.
  const MINW = 900;
  let shown = false, folded = false, id = "";
  const el = () => document.getElementById("dock");
  const body = () => el().querySelector(".dock-body");
  const foot = () => el().querySelector(".dock-foot");

  function narrow() { return innerWidth < MINW; }
  // A tablet held upright (768 × 1024, 820 × 1180) is under MINW too, and an
  // overlaid 348 px panel hid the right half of the flume AND of the strip
  // (whose buttons ran on behind it). Upright there is height to spare and
  // never width, so it gets the bottom sheet as a phone does: the water keeps
  // the full width, the strip its full length.
  function phone(phoneMax) {
    return innerWidth < phoneMax || (innerWidth < MINW && innerHeight > innerWidth * 1.1);
  }
  function sync() {
    // Read once per sync (a resize or an open/close), never per frame.
    const cs = getComputedStyle(document.documentElement);
    const dockW = parseFloat(cs.getPropertyValue("--dock-w"));
    const sheeted = phone(parseFloat(cs.getPropertyValue("--phone-max")));
    const open = shown && !folded;
    el().classList.toggle("open", open);
    el().classList.toggle("over", narrow());
    el().classList.toggle("sheet", sheeted);
    // The dock takes WIDTH out of the viewport; the same dock as a bottom
    // sheet takes HEIGHT. Either way the water is drawn in what is left, never
    // behind the dock — otherwise the domain centres itself on a canvas whose
    // lower half nobody can see.
    const root = document.documentElement.style;
    root.setProperty("--dock", (open && !narrow() && !sheeted) ? dockW + "px" : "0px");
    // The sheet's height is `--sheet-h` evaluated by the stylesheet (a calc on
    // vh); the open sheet IS that height, so measure it rather than redo the sum.
    root.setProperty("--dockb", (open && sheeted)
      ? Math.round(el().getBoundingClientRect().height) + "px" : "0px");
    fitBar();                    // the dock takes its width out of the strip
    applyAutoVex();              // …and out of what "fills the window" means
    el().querySelector(".dock-h .eid").textContent = id;
    const fold = document.getElementById("dockfold");
    const tab = document.getElementById("docktab");
    fold.classList.toggle("show", open);
    tab.classList.toggle("show", shown && folded);
    tab.querySelector(".eid").textContent = id;
    // The tab is the only thing a folded student sees: "Exercise" doesn't
    // say there is a brief behind it, so name the action instead.
    tab.querySelector(".kind").textContent = "open instructions";
  }
  /** Show the panel, headed "Exercise" and the card's id. */
  function show(i) { id = i || ""; shown = true; folded = false; sync(); }
  /** Rename what is in the panel without touching whether it is open — a
   *  content refresh must not undo a fold. */
  function label(i) { id = i === undefined ? id : i; sync(); }
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

  /** The pack as the exercise menu groups it — the course menu when this
   *  deployment ships one (js/courses.js), otherwise the register by `topic` —
   *  so the two never disagree. */
  function grouped() { return EX.groupsFor(filter); }

  function renderList() {
    const host = document.getElementById("startlist");
    host.textContent = "";
    const n = EX.all().length;
    document.getElementById("startcount").textContent =
      n ? (EX.course() ? EX.listed().length + (EX.listed().length === 1 ? " exercise" : " exercises")
             : n + " verified demos") : "pack not loaded";
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
        b.type = "button"; b.className = "si"; b.dataset.id = e.ref || e.id;
        const i = document.createElement("span"); i.className = "eid"; i.textContent = e.id;
        const t = document.createElement("span"); t.className = "t"; t.textContent = e.title;
        b.appendChild(i); b.appendChild(t);
        if (e.aim) b.title = e.aim;   // the exercise's `aim`, on hover
        // …which a touch screen never shows: print it under the title there.
        if (e.aim && !TIP.hoverable()) {
          const a = document.createElement("span"); a.className = "aim"; a.textContent = e.aim;
          b.appendChild(a);
        }
        b.onclick = () => { close(); EX.pick(e.ref || e.id); };   // e.ref: a tab ("CR-1#forces")
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
    POPUP.closeAll();
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

/** Header-drag for a floating window, shared by the gauge inspector, the
 *  exercise card and the legend so they behave and clamp identically: never
 *  off the left or top, never further right than its own width, and never past the bottom
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

