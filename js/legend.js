"use strict";
/**
 * legend.js — the legend card (LEGEND) and the interface profile (UIMODE): what an
 *   exercise shows a student.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: LEGEND, UIMODE
 *
 * Reads:   buildToolbar, dragWindow, familyOf, fieldBlurb, fieldById, fieldFor,
 *          FIELDS, FMT, GAUGE_QTY, measuringAvg, POPUP, rangeFor, RECON,
 *          setAverage, Shaders, showToast, SIM, sim, state, syncPanel,
 *          syncToolbar, TOOLS, UI, vmaxFor
 */
/** The colour key — and the field picker, because they are the same question.
 *
 *  The nine colourings existed long before anything on screen said which one
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
  let open = true;
  const el = () => document.getElementById("legend");
  const menu = () => document.getElementById("legmenu");
  // The field menu: Esc and click-away are POPUP's, like the other three
  // (js/popup.js). It lights the picker button itself and hangs left-aligned
  // under it; only Esc is its own key, as before.
  const menuPopup = POPUP.make({
    el: menu, render: renderMenu,
    opener: [["legPick", "open"]],
    place: (m, a) => {
      const r = a.getBoundingClientRect();
      m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + "px";
      m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6)) + "px";
    },
  });
  const menuIsOpen = menuPopup.isOpen, closeMenu = menuPopup.close, place = menuPopup.place;

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
    } else if (f.floating && sim && Math.abs(sim.p.g) < 0.5) {
      // No zero worth anchoring to (a plan view's pressure sits on an
      // arbitrary reference): fit the spread itself.
      state.range[f.id] = [s.lo, Math.max(s.hi, s.lo + 1e-3)];
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
    document.getElementById("legLo").textContent = FMT.num(r[0]);
    document.getElementById("legHi").textContent = FMT.num(r[1]);
    const bars = document.getElementById("legBars");
    bars.textContent = "";
    if (f.id === "water") {
      // TWO variables, and the card has to say so: a reader told only "blue"
      // cannot tell deep water from fast water. The right-hand word is which
      // CHANNEL of the colour carries it, which is the part nothing said.
      bars.appendChild(row(RAMP_CSS.water(), "depth below surface", "hue"));
      bars.appendChild(row("linear-gradient(to right, rgba(255,255,255,0.05), rgba(255,255,255,0.55))",
                           "speed, 0 – " + FMT.num(vmaxFor()) + " m/s", "brightness"));
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
    if (what) FMT.put(what, state.avg ? (f.mean || "") : "");
    if (menuIsOpen()) renderMenu();
  }

  /** Only when it moved. At 60 fps an unconditional textContent write is a
   *  layout every frame for a number that changes in the second decimal. */

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
    FMT.put(t, "T = " + SIM.avgT().toFixed(2) + " s");
    const r = document.getElementById("legAvgRead");
    if (!state.inside || !avgCols) { FMT.put(r, "— hover the water for the averaged column"); return; }
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
    FMT.put(r, "fill " + (p ? p.fbar.toFixed(2) : "—") +
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
      const w = document.createElement("span"); w.textContent = fieldBlurb(f);
      b.appendChild(t); b.appendChild(s); b.appendChild(w);
      b.onclick = () => { state.mode = f.mode; closeMenu(); sync(); syncPanel(); };
      m.appendChild(b);
    });
    place();
  }
  function toggleMenu() { menuPopup.toggle(document.getElementById("legPick")); }

  function setOpen(v) {
    open = v;
    if (el()) el().classList.toggle("open", open);
    closeMenu();
    sync();
    syncToolbar();
  }
  return { build, sync, fit, avgTick, place, closeMenu,
           isOpen: () => open,
           menuIsOpen,
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
  // The concepts `ui.hide` can withhold (see hides() for where each is
  // honoured). Exported so check_pack.py reads it rather than keeping a copy.
  const HIDE_IDS = ["energy", "critical"];

  function full() {
    return { build: true, measure: true, view: true, fields: true,
             legend: true, panel: "full", controls: true,
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

  /** Does the strip offer this tool under the live profile? */
  function offers(tool) {
    return allows(familyOf(tool), { tool, id: tool });
  }
  /** Is ANY pointer tool offered? Only then does the strip carry the Read
   *  button that puts the tool down again. */
  function anyTool() {
    return TOOLS.some((t) => offers(t[0]));
  }

  /** Whether anything at all is hidden — what puts ⋯ on the strip. */
  function narrowed() {
    const u = state.ui;
    if (!u || u.lifted) return false;
    return ["build", "measure", "view"].some((f) => u[f] !== true) ||
           u.fields !== true || u.panel !== "full" || u.controls !== true ||
           u.legend !== true ||
           Array.isArray(u.gaugeFields) || (Array.isArray(u.hide) && u.hide.length > 0) ||
           Object.keys(u.readouts || {}).some((k) => u.readouts[k] === false);
  }

  function apply(profile) { UI.batch(() => applyNow(profile)); }
  function applyNow(profile) {
    state.ui = Object.assign(full(), profile || {});
    // The tool in hand must be one the strip offers. Before this the default
    // Wall stayed armed under a card that hides BUILD, so the first touch on
    // an iPad drew a block the student had no button to take back. A tool the
    // profile hides goes down, and the hand is empty: the Read tool.
    if (state.tool && !offers(state.tool)) state.tool = null;
    if (state.ui.legend === false) LEGEND.close(); else LEGEND.open();
    // A profile that hides the live field would leave the legend naming
    // something its own picker cannot reach, so the field moves to the first
    // one the profile does offer.
    if (Array.isArray(state.ui.fields) && state.ui.fields.length &&
        state.ui.fields.indexOf(fieldFor(state.mode).id) < 0) {
      state.mode = fieldById(state.ui.fields[0]).mode;
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

  /** Is this on-canvas readout wanted? Gauge cards, the hovering cursor
   *  readout and the status line have no toggle of their own; the profile
   *  labels, jump boxes and channel overlay stay with `viewParams`, which
   *  already sets them — two ways to say the same thing is how they come to
   *  disagree. */
  function shows(what) {
    const u = state.ui;
    if (!u || u.lifted || !u.readouts) return true;
    return u.readouts[what] !== false;
  }

  /** The quantities a gauge may plot here — GAUGE_QTY unless `ui.gaugeFields`
   *  narrows it (ids, in the register's order). Narrows what is OFFERED on
   *  the corner card, the inspector and the Gauges plot select; every
   *  quantity is still recorded and still in the CSV. */
  function gaugeFields() {
    const u = state.ui;
    if (!u || u.lifted || !Array.isArray(u.gaugeFields) || !u.gaugeFields.length) return GAUGE_QTY;
    const L = GAUGE_QTY.filter((q) => u.gaugeFields.indexOf(q.id) >= 0);
    return L.length ? L : GAUGE_QTY;
  }

  /** Is a CONCEPT withheld from this card's on-canvas words? `ui.hide` lists
   *  them (see HIDE_IDS); each id is honoured where that concept is printed:
   *
   *    "energy"    the energy row of the Control volume budget, its Ė face
   *                labels (B skips them), ρgQH on a flux section and the
   *                energy line between two, and the reservoir marker's
   *                "· energy line" — it reads "reservoir level 3.16 m".
   *    "critical"  the words critical / subcritical / supercritical and the
   *                profile class (H2, M1 …) on the hover card; the Fr row,
   *                where a card keeps it, says "fast, shallow" / "slow, deep".
   *
   *  A label, not a cage: ⋯ Show everything brings the words back. */
  function hides(concept) {
    const u = state.ui;
    if (!u || u.lifted || !Array.isArray(u.hide)) return false;
    return u.hide.indexOf(concept) >= 0;
  }

  return { full, fromExercise, apply, lift, reset, allows, offers, anyTool, narrowed,
           fields, shows, rows, gaugeFields, hides, HIDE_IDS };
})();

