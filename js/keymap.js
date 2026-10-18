/**
 * keymap.js — dependency record (checked by test/check_headers.py).
 *
 * Defines: KEYMAP
 *
 * Reads:   clearGaugeHistory, CV_NEXT, DOCK, EX, familyOf, fireTrain,
 *          hasValves, KEYS, LEGEND, PICKER, resetZoom, scenesOffered,
 *          setAverage, showToast, SIM, START, state, syncPanel, syncToolbar,
 *          toggleFullscreen, togglePause, toggleValve, trainOffered, UIMODE,
 *          view, zoomAt
 */
/* KEYMAP — every keyboard shortcut, described once.
 *
 * The keydown handler in main.js, the Keyboard sheet (KEYS.render) and the
 * ui-smoke cross-check against the TOOLBAR's hover-card `key:` strings all
 * read this array, so a binding cannot be added to one and forgotten in the
 * other two.
 *
 * Row: { key, label?, what?, when?, repeat?, run(e) }
 *   key     the lowercased KeyboardEvent.key (" " for space, "?" , "[" …)
 *   label   what the sheet prints in the <kbd>; no label = not on the sheet
 *           (an alias row, like "=" beside "+")
 *   what    the sheet's description
 *   when()  optional; the sheet and the handler skip the row while false
 *   repeat  true = auto-repeat is allowed (brush size, zoom); every other
 *           row ignores e.repeat, so a held key cannot flicker a toggle
 *   run(e)  the action
 *
 * Load order: this file is evaluated BEFORE state.js … main.js (the files
 * main.js was split into), so nothing here may touch one of their bindings at
 * parse time. The `run`/`when` closures name those functions and consts, which
 * is fine — they are only called from the keydown handler, long after they
 * have all loaded. The digit rows depend on TOOLS, which strip.js owns, so the
 * array carries one placeholder row and main.js calls
 * KEYMAP.useTools() once at boot to expand it in place (same sheet position).
 *
 * Modal behaviour (start screen, open menus own the keyboard) stays in the
 * handler: it decides WHETHER the map is consulted, not what is in it.
 */
const KEYMAP = [
  { key: "0", label: "0", what: "reset the view", run: () => resetZoom() },
  { key: "+", label: "+ / −", what: "zoom in / out, about the centre", repeat: true,
    run: () => zoomAt(view.pxW / 2, view.pxH / 2, 1.3) },
  { key: "=", repeat: true, run: () => zoomAt(view.pxW / 2, view.pxH / 2, 1.3) },
  { key: "-", repeat: true, run: () => zoomAt(view.pxW / 2, view.pxH / 2, 1 / 1.3) },
  // Placeholder: KEYMAP.useTools() replaces this with the digit rows.
  { key: "digits", digits: true, run: () => {} },
  { key: "[", label: "[ ]", what: "brush size", repeat: true,
    run: () => { state.brush = Math.max(0.015, state.brush / 1.3); } },
  { key: "]", repeat: true,
    run: () => { state.brush = Math.min(0.5, state.brush * 1.3); } },
  { key: "z", label: "Z", what: "undo a stroke", run: () => SIM.undoSeg() },
  { key: "c", label: "C", what: "clear the drawing", run: () => SIM.clearSegs() },
  { key: "v", label: "V", what: "valves",
    run: () => { if (trainOffered() && !hasValves()) fireTrain(); else toggleValve(); } },
  { key: " ", label: "space", what: "pause", run: (e) => { e.preventDefault(); togglePause(); } },
  { key: "r", label: "R", what: "reset the water",
    run: () => { SIM.resetWater(); clearGaugeHistory(); } },
  { key: "g", label: "G", what: "cycle the field (the legend names it)",
    run: () => {
      // Over the fields this profile OFFERS, so the key and the card's menu
      // cannot disagree about what there is to cycle through.
      const F = UIMODE.fields();
      const i = F.findIndex((f) => f.mode === state.mode);
      state.mode = F[(i + 1) % F.length].mode;
      LEGEND.sync(); syncPanel();
    } },
  { key: "l", label: "L", what: "the legend — which field, over what range, in what units",
    run: () => LEGEND.toggle() },
  { key: "b", label: "B", what: "what the Control volume reads on each edge: Q / momentum / energy",
    run: () => {
      state.cvShow = CV_NEXT[state.cvShow] || "Q";
      // A card that withholds energy has two things to cycle, not three.
      if (state.cvShow === "E" && UIMODE.hides("energy")) state.cvShow = "Q";
      syncPanel();
    } },
  { key: "p", label: "P", what: "particles",
    run: () => { state.particles = !state.particles; syncPanel(); } },
  { key: "d", label: "D", what: "the Dye tool — hold the pointer in the water to release dye",
    run: () => {
      // The same gate as a digit: a hidden tool's key says why rather than
      // arming it.
      if (UIMODE.allows(familyOf("dye"), { tool: "dye", id: "dye" })) {
        state.tool = "dye"; state.forceHover = null; syncToolbar();
      } else {
        showToast("Dye is off for this exercise",
                  "The ⋯ button at the end of the strip brings every control back.");
      }
    } },
  { key: "t", label: "T", what: "streamlines",
    run: () => { state.sline = !state.sline; syncPanel(); } },
  { key: "n", label: "N", what: "open-channel overlay",
    run: () => { state.channel = !state.channel; syncPanel(); } },
  { key: "a", label: "A", what: "average the flow — the mean field, over one window",
    run: () => setAverage(!state.avg) },
  { key: "i", label: "I", what: "the instruments' readout boxes — they keep recording while hidden",
    run: () => { state.instReadouts = !state.instReadouts; syncPanel(); } },
  { key: "m", label: "M", what: "ruler",
    run: () => { state.ruler = !state.ruler; syncPanel(); } },
  // requestFullscreen needs a user gesture; a keypress is one. A frame with no
  // allow="fullscreen" simply rejects — toggleFullscreen already swallows that.
  { key: "f", label: "F", what: "full screen", run: () => toggleFullscreen() },
  { key: "s", label: "S", what: "scenes", when: () => scenesOffered(),
    run: () => PICKER.open(document.getElementById("sceneBtn")) },
  { key: "e", label: "E", what: "exercises", run: () => EX.open(document.getElementById("exBtn")) },
  { key: "h", label: "H", what: "the start screen", run: () => START.open() },
  { key: "?", label: "?", what: "this sheet",
    run: () => KEYS.toggle(document.getElementById("keysBtn")) },
  { key: "escape", label: "Esc", what: "close the open menu, then fold the side panel",
    run: () => { KEYS.close(); DOCK.fold(true); } },
];

/** True when a keystroke belongs to the user's typing or to the browser — an
 *  input, select, textarea or contenteditable (the legend's range numbers),
 *  or a Ctrl / Cmd / Alt chord (Ctrl+V is paste, not Valves) — but not AltGr or
 *  Option typing a character. */
KEYMAP.typing = function (e) {
  const t = e.target;
  const tag = t && t.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  if (t && t.isContentEditable) return true;
  // AltGr reports ctrl+alt on Windows and types [ ] + - on European layouts:
  // a character, not a chord.
  if (e.getModifierState && e.getModifierState("AltGraph")) return false;
  if (e.ctrlKey || e.metaKey) return true;
  // Alt alone: on macOS Option changes e.key ("[" becomes a curly quote), so a
  // printable key that is not a letter or digit is a typed character and
  // KEYMAP.match decides by e.key; Alt+letter stays the browser's (menus).
  if (e.altKey) return !(typeof e.key === "string" && e.key.length === 1 && !/[a-z0-9]/i.test(e.key));
  return false;
};

/** The row an event triggers, or null. Shift+/ is "?" on every layout the
 *  old handler accepted; rows whose `when()` is false are not found. */
KEYMAP.match = function (e) {
  let k = String(e.key).toLowerCase();
  if (k === "/" && e.shiftKey) k = "?";
  return KEYMAP.filter((r) => r.key === k && (!r.when || r.when()))[0] || null;
};

/** Expand the digit placeholder into rows "1".."n" (n = TOOL_KEYS). `pick(i)`
 *  arms TOOLS[i - 1] (or toasts why it is hidden). Called once by main.js. */
KEYMAP.useTools = function (n, pick) {
  const at = KEYMAP.findIndex((r) => r.digits);
  if (at < 0) return;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      key: String(i),
      label: i === 1 ? "1 – 9" : undefined,
      what: i === 1 ? "pick a tool (Pour has no digit — right-drag instead)" : undefined,
      run: () => pick(i),
    });
  }
  KEYMAP.splice(at, 1, ...rows);
};
