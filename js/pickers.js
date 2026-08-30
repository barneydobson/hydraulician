"use strict";
/**
 * pickers.js - the two menus that choose what is on the bench.
 *
 * PICKER is the scene menu; EX is the exercise picker, which turns "HJ-1" into
 * a set-up simulation and a card. Both blocks moved verbatim out of js/main.js,
 * and each documents itself below -- EX at length, because the line it draws
 * between what it applies and what it leaves for the student IS the design.
 *
 * They reach back into main.js for state, sim, showToast, syncPanel,
 * switchScene, loadScene, CONFIG, UIMODE, DOCK, TIP, CONTROLS, GINSP and RIG --
 * all from inside functions, so index.html may load this before main.js (and
 * must: main.js puts PICKER and EX on window.APP at parse time).
 */

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
    // …and how much of the interface this exercise wants in front of a
    // student. Applied here rather than in `pick` so it lands with everything
    // else the entry declares, including on a re-pick.
    UIMODE.apply(UIMODE.fromExercise(ex));
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
  /** The "Yours" rows: one per value the worksheet asks the student to set,
   *  in the order the register writes them — the digit's own rule first, then
   *  its coupled `also` values, then `studentParams`.
   *
   *  `control` is filled in only when the value goes on a control the STUDENT
   *  owns (see `studentControls`), which is what lets the brief carry the field
   *  it goes in. A rule whose personalised thing is a drawn stroke or a station
   *  on screen has no control and is printed as a sentence, exactly as before.
   *
   *  This does NOT move the line the pack draws. The RULE is printed and the
   *  arithmetic is the student's; nothing is computed, pre-filled or applied.
   *  What changes is only that the answer now has somewhere to go that is not
   *  a different panel on the other side of the screen. */
  function yourRows(ex) {
    if (!ex) return [];
    const owned = studentControls(ex), rows = [], seen = new Set();
    const usable = (id) => id && owned.indexOf(id) >= 0 &&
                           !!CONTROLS.find((c) => c.id === id && c.set);
    rules(ex).forEach((r) => {
      rows.push({ label: ruleLabel(r), unit: r.unit,
                  text: r.rule || "see the brief",
                  control: usable(r.control) ? r.control : null,
                  where: r.control && !usable(r.control) ? ctlWhere(r.control) : "" });
      if (r.control) seen.add(r.control);
    });
    (ex.studentParams || []).forEach((p) => {
      if (!p.control || seen.has(p.control)) return;
      seen.add(p.control);
      rows.push({ label: ctlLabel(p.control), unit: p.unit,
                  text: p.rule || (p.value !== undefined
                          ? "set it to " + ctlText(p.control, p.value) : ""),
                  control: usable(p.control) ? p.control : null,
                  where: usable(p.control) ? "" : ctlWhere(p.control) });
    });
    return rows;
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
    const order = [], by = new Map(), f = foldText(filter.trim());
    all().forEach((e) => {
      if (f && !foldText(e.id + " " + e.title + " " + (e.topic || "") + " " + e.scene + " " +
                         (e.start || "")).includes(f)) return;
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
  /** The brief, rendered into the DOCK (see the DOCK module) rather than into
   *  a window floating over the water. Everything the old card carried is
   *  still here in the same order; what changed is that the viewport gives way
   *  to it, so nothing a student is trying to read is ever underneath it, and
   *  a panel the height of the screen has room for the whole brief without a
   *  scrollbar in a lecture.
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
    let box = null, digitEl = null;
    const fields = [];        // {id, el} — the live controls in the brief
    function build() {
      if (box) return box;
      box = document.getElementById("dock");
      DOCK.body.innerHTML =
        '<div class="extitle"></div>' +
        '<div class="exrules"></div>' +
        '<div class="exline exyours"></div>' +
        '<div class="exd"><label>student number ends in</label>' +
          '<input type="number" min="0" max="9" step="1" inputmode="numeric" ' +
                 'aria-label="The last digit of your student number">' +
          '<span class="exval"></span></div>' +
        '<div class="exline exrule"></div>' +
        '<div class="exline exstart"></div>' +
        '<div class="exline extask"></div>' +
        '<div class="exline exnote"></div>' +
        '<ol class="exsteps"></ol>' +
        '<div class="exline exstations"></div>' +
        '<div class="exline exalso"></div>' +
        '<div class="exline exmiss"></div>' +
        '<details class="exset"><summary>Already set</summary><div class="exsetl"></div></details>';
      DOCK.foot.innerHTML =
        '<span class="exsettle"></span>' +
        '<button class="exb" data-a="reset">↻ Reset to the starting point</button>' +
        '<a class="exlink" target="_blank" rel="noopener"></a>';
      digitEl = box.querySelector(".exd input");
      digitEl.oninput = () => setDigit(digitEl.value);
      // The panel is a form, not the canvas: its keystrokes are its own.
      digitEl.onkeydown = (e) => e.stopPropagation();
      const rb = box.querySelector('[data-a="reset"]');
      rb.onclick = (e) => { e.currentTarget.blur(); reset(); };
      rb.onpointerenter = () => TIP.show(rb, "Reset to the starting point",
        "Scene, Resolution, the rig and the load-bearing settings only — your own " +
        "values are not restored, because they were never set for you.");
      rb.onpointerleave = () => TIP.hide();
      // The × closes the BRIEF, not the exercise: the rig it set up is still on
      // the bench, and the strip's Exercises icon brings the brief back.
      box.querySelector('[data-a="close"]').onclick = (e) => { e.currentTarget.blur(); hide(); };
      return box;
    }
    function show() {
      build();
      DOCK.show("Exercise", cur ? cur.id : "");
      refresh();
      // A digit already in hand applies to the new exercise too; an empty
      // field means "not yet personalised", which is a legitimate state.
      digitEl.value = digit === null ? "" : String(digit);
    }
    function hide() { DOCK.hide(); }
    function shown() { return DOCK.isShown(); }
    function refresh() {
      if (!box || !cur) return;
      // Relabel only — a refresh must not unfold a panel somebody folded away.
      DOCK.label("Exercise", cur.id);
      const t = box.querySelector(".extitle");
      t.textContent = cur.title;
      // The personalised rules are PRINTED, never computed: d is the last
      // digit of the student number, the lecturer owns explaining it, and
      // doing the arithmetic is the student's own first step. (An input that
      // computed "your numbers" here was removed on lecturer feedback.)
      buildYours();
      // The sentence form is kept only for a pack with no rules at all to
      // show; anything with rules now renders them as rows above.
      line(box.querySelector(".exyours"), "Yours (d = last digit of your student number):",
           yourRows(cur).length ? "" : ruleLines(cur).join("\n"));
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
    /** The "Yours" block: the printed rule, and beside it the control the
     *  answer goes on.
     *
     *  The field IS the panel's control, relocated — it reads and writes the
     *  same CONTROLS entry the Controls panel does, so the two can never
     *  disagree. What it is NOT is a calculator: the rule is printed, the
     *  arithmetic is the student's, and the field starts on whatever the rig
     *  is actually set to, which is the same number the slider was already
     *  showing. Nothing here is pre-filled with an answer.
     *
     *  Before this, the only thing telling a student where q went was the
     *  words "· Inflow q slider" at the end of a run-on line, and the slider
     *  itself was in a floating panel on the other side of the screen. */
    function buildYours() {
      const host = box.querySelector(".exrules");
      host.textContent = "";
      fields.length = 0;
      const rows = yourRows(cur);
      if (!rows.length) { host.style.display = "none"; return; }
      host.style.display = "flex";

      const h = document.createElement("div");
      h.className = "exhead";
      h.textContent = "Yours — d is the last digit of your student number";
      host.appendChild(h);

      rows.forEach((row) => {
        const r = document.createElement("div");
        r.className = "exrow";
        const t = document.createElement("div");
        t.className = "exrowt";
        const b = document.createElement("b");
        b.textContent = row.label + (row.unit ? " (" + row.unit + ")" : "");
        t.appendChild(b);
        if (row.text) t.appendChild(document.createTextNode(" " + row.text));
        // A rule with no control of its own — a drawn stroke, a station — says
        // where it goes in words, because there is nothing to put a field on.
        if (row.where) {
          const w = document.createElement("i");
          w.textContent = "set it on the " + row.where;
          t.appendChild(w);
        }
        r.appendChild(t);
        const f = row.control ? fieldFor(row.control) : null;
        if (f) r.appendChild(f);
        host.appendChild(r);
      });
      syncValues();               // the fields open on what the rig is set to
    }

    /** The control, as a field. Numeric rows get a number box carrying the
     *  panel's own min/max/step, so a value typed here is a value the slider
     *  could have reached; a tickbox stays a tickbox and a menu a menu. */
    function fieldFor(id) {
      const c = CONTROLS.find((x) => x.id === id);
      if (!c || !c.set) return null;
      const wrap = document.createElement("div");
      wrap.className = "exrowf";
      let el;
      if (c.type === "check") {
        el = document.createElement("input");
        el.type = "checkbox";
        el.onchange = () => { c.set(el.checked); syncPanel(); };
      } else if (c.type === "select") {
        el = document.createElement("select");
        (c.opts || []).forEach(([v, txt]) => {
          const o = document.createElement("option");
          o.value = v; o.textContent = txt; el.appendChild(o);
        });
        el.onchange = () => { c.set(el.value); syncPanel(); };
      } else {
        el = document.createElement("input");
        el.type = "number";
        el.inputMode = "decimal";
        if (c.min !== undefined && !c.rel) el.min = c.min;
        if (c.max !== undefined && !c.rel) el.max = c.max;
        if (c.step !== undefined) el.step = c.step;
        el.oninput = () => {
          if (el.value === "") return;         // mid-edit, not a value yet
          const v = +el.value;
          if (isFinite(v)) { c.set(v); syncPanel(); }
        };
      }
      // The brief is a form, not the canvas: its keystrokes are its own, or
      // typing 0.45 would pick the Erase tool and reset the view on the way.
      el.onkeydown = (e) => e.stopPropagation();
      el.setAttribute("aria-label", c.label);
      wrap.appendChild(el);
      if (c.type !== "check" && c.type !== "select") {
        const u = document.createElement("span");
        u.className = "exunit";
        u.textContent = unitOf(c);
        wrap.appendChild(u);
      }
      fields.push({ id, el, type: c.type });
      return wrap;
    }

    /** A short unit for the field, taken from the rule where the register
     *  gives one and otherwise left blank — a guessed unit is worse than none. */
    function unitOf(c) {
      const r = rules(cur).find((x) => x.control === c.id);
      if (r && r.unit) return r.unit;
      const p = (cur.studentParams || []).find((x) => x.control === c.id);
      return (p && p.unit) || "";
    }

    /** Keep the fields honest when the same control is moved from the Controls
     *  panel. Never while it has focus — that would rewrite what is being
     *  typed, and "0.4" on the way to "0.45" is a legitimate half-typed value. */
    function syncValues() {
      if (!box || !cur) return;
      fields.forEach(({ id, el, type }) => {
        if (!el.isConnected || el === document.activeElement) return;
        const c = CONTROLS.find((x) => x.id === id);
        if (!c || !c.get) return;
        const v = c.get();
        if (type === "check") el.checked = !!v;
        else if (type === "select") el.value = v;
        else {
          const shown = el.value === "" ? NaN : +el.value;
          if (!(Math.abs(shown - v) < 1e-9)) el.value = round4(v);
        }
      });
    }
    /** The panel prints 3 decimals; a field showing 0.4500000000000001 is the
     *  same bug the rule values were rounded for. */
    function round4(v) {
      return typeof v === "number" ? String(Math.round(v * 1e4) / 1e4) : String(v);
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
      if (!box || !DOCK.isOpen() || !cur) return;
      const s = box.querySelector(".exsettle");
      if (cur.settle && settleTo && sim.t < settleTo) {
        s.textContent = "settling — " + Math.max(0, settleTo - sim.t).toFixed(0) + " s";
        s.style.display = "inline";
      } else {
        s.textContent = ""; s.style.display = "none";
      }
    }
    return { show, hide, shown, refresh, tick, syncValues, get el() { return box; } };
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

  /** Forget the loaded exercise entirely — the brief goes, the settle target
   *  goes, and `?ex=` stops claiming the address bar. The rig on the bench is
   *  NOT touched: whoever is clearing it (a new sandbox, a scene switch) owns
   *  that, and each of them rebuilds the domain anyway. */
  function clear() {
    if (!cur) return;
    cur = null; settleTo = 0; settleWhat = "";
    card.hide();
    UIMODE.reset();          // the exercise's focus goes with the exercise
    refresh();
    syncPanel();
  }

  return { open, close, toggle, isOpen, refresh, key, onDown, render, place, choose,
           pick, reset, clear, setDigit, all, byId, rules, ruleValue, digitSummary,
           studentControls,
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

