"use strict";
/**
 * popup.js — POPUP: the one behaviour every floating menu shares — the scene
 *   menu, the exercise menu, the keyboard sheet and the legend's field menu.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: POPUP
 *
 * Reads:   canvas, sim, state
 */
/** What the four menus had each written out by hand, and what drifted between
 *  the copies (the legend's menu and the keyboard sheet lacked one or the
 *  other of Esc and click-away at various times):
 *
 *   - open: close every OTHER popup, render, add `.open`, place under the
 *     anchor, light the opener (`active` / `open` class), scroll the current
 *     row into view;
 *   - close: remove `.open`, drop the opener's class;
 *   - click-away, in capture, so a dismissing click on the canvas dismisses
 *     ONLY — it does not also start drawing a wall;
 *   - Esc, and for a `modal` popup the arrow keys / Enter over its
 *     `[role=menuitem]` rows, with every other key swallowed so no shortcut
 *     fires behind it (C — clear drawing — with a menu open would be a
 *     spectacular way to lose a rig);
 *   - one `resize` listener re-placing whichever popup is open.
 *
 *  `POPUP.make(cfg)`:
 *    el        () => the menu element (looked up lazily)
 *    opener    id of the strip button that lights `active` while open, or an
 *              array of [id | () => element, className] pairs
 *    fallback  () => the anchor to use when the remembered one has left the DOM
 *              (a rebuilt strip); defaults to the first opener
 *    render    () => fill the menu; called on open
 *    place     (menuEl, anchorEl) => position it; default: under the anchor,
 *              right-aligned, clamped on screen
 *    modal     true: owns the keyboard while open (arrows, Enter, and every
 *              other key swallowed); false: only Esc is its own
 *    space     Space activates the highlighted row, like Enter
 *    enterFirst  Enter with no row highlighted activates the first
 *    onKey     (e) => true if the popup handled the key itself (modal only)
 *    onHighlight (rowEl) => called when an arrow key moves the highlight
 *    onOpen / shown / onClose   hooks: before render / after it is up / on close
 *
 *  The returned popup: { open(anchor), close(), toggle(anchor), isOpen(),
 *  place(), clickAway(e), key(e) }; `key` returns true when it took the key, as
 *  POPUP.key does. */
const POPUP = (() => {
  const popups = [];
  const ITEM = "[role=\"menuitem\"]";
  let wired = false;

  function make(cfg) {
    let anchor = null;
    const menu = () => cfg.el();
    const isOpen = () => { const m = menu(); return !!(m && m.classList.contains("open")); };
    /** [element, class] for everything the open state lights. */
    const lights = () => {
      const o = typeof cfg.opener === "string" ? [[cfg.opener, "active"]] : (cfg.opener || []);
      return o.map(([w, cls]) => [typeof w === "function" ? w() : document.getElementById(w), cls])
              .filter(([e]) => e);
    };
    const fallbackAnchor = () => cfg.fallback ? cfg.fallback()
      : (lights().length ? lights()[0][0] : null);

    function place() {
      const m = menu();
      if (!m) return;
      const a = anchor && anchor.isConnected ? anchor : fallbackAnchor();
      if (!a) return;
      if (cfg.place) { cfg.place(m, a); return; }
      const r = a.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
      m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
      m.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 8)) + "px";
    }
    function open(a) {
      closeAll(self);                       // the menus are alternatives, not a stack
      anchor = a || fallbackAnchor();
      if (cfg.onOpen) cfg.onOpen();
      cfg.render();
      menu().classList.add("open");
      place();
      lights().forEach(([e, cls]) => e.classList.add(cls));
      if (cfg.shown) cfg.shown();
      const on = menu().querySelector(ITEM + ".on");
      if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
    }
    function close() {
      const m = menu();
      if (m) m.classList.remove("open");
      if (cfg.onClose) cfg.onClose();
      lights().forEach(([e, cls]) => e.classList.remove(cls));
    }
    function toggle(a) { if (isOpen()) close(); else open(a); }

    /** Esc for every popup; for a modal one also the arrows and Enter, and
     *  true for every key (swallowed). */
    function key(e) {
      if (!isOpen()) return false;
      if (e.key === "Escape") { e.preventDefault(); close(); return true; }
      if (!cfg.modal) return false;
      if (cfg.onKey && cfg.onKey(e)) return true;
      const list = [...menu().querySelectorAll(ITEM)];
      let hi = list.findIndex((b) => b.classList.contains("hi"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!list.length) return true;
        const down = e.key === "ArrowDown";
        hi = hi < 0 ? (down ? 0 : list.length - 1) : (hi + (down ? 1 : list.length - 1)) % list.length;
        list.forEach((b, i) => b.classList.toggle("hi", i === hi));
        if (list[hi].scrollIntoView) list[hi].scrollIntoView({ block: "nearest" });
        if (cfg.onHighlight) cfg.onHighlight(list[hi]);
        return true;
      }
      if (e.key === "Enter" || (cfg.space && e.key === " ")) {
        const act = document.activeElement;
        const b = (hi >= 0 && list[hi]) ||
          (act && act.getAttribute && act.getAttribute("role") === "menuitem" &&
           menu().contains(act) ? act : null) ||
          (cfg.enterFirst ? list[0] : null);
        if (b) { e.preventDefault(); b.click(); }
      }
      return true;
    }
    /** Click-away. Registered in capture (POPUP.init), so a dismissing click on
     *  the canvas dismisses ONLY. */
    function clickAway(e) {
      if (!isOpen()) return;
      if (menu().contains(e.target)) return;
      if (anchor && anchor.contains && anchor.contains(e.target)) return;  // its own toggle
      close();
      if (e.target === canvas) { e.preventDefault(); e.stopPropagation(); }
    }

    const self = { open, close, toggle, isOpen, place, clickAway, key };
    popups.push(self);
    return self;
  }

  function closeAll(except) { popups.forEach((p) => { if (p !== except && p.isOpen()) p.close(); }); }

  /** The page-level wiring, once: click-away in capture and the one resize
   *  listener. Called from boot, not at parse, so the order among the page's
   *  capture listeners stays where main.js puts it. */
  function init() {
    if (wired) return;
    wired = true;
    window.addEventListener("pointerdown", (e) => popups.forEach((p) => p.clickAway(e)), true);
    addEventListener("resize", () => popups.forEach((p) => { if (p.isOpen()) p.place(); }));
  }

  /** The modal checks at the top of the keyboard handler: true when an open
   *  popup took the key. Popups are asked in the order they were made. */
  function key(e) { return popups.some((p) => p.key(e)); }

  /** "the 3 segments you have drawn and 1 gauge" — the count both menus'
   *  warnings quote. */
  function drawnWork() {
    const n = sim && sim.segs ? sim.segs.length : 0, gn = state.gauges.length;
    return "the " + n + " segment" + (n === 1 ? "" : "s") + " you have drawn" +
      (gn ? " and " + gn + " gauge" + (gn === 1 ? "" : "s") : "");
  }

  /** The inline "this drops your drawing" step, appended to `host`: `text`
   *  follows the bold lead; `actions` are [{label, cls, run}] buttons. */
  function warning(host, text, actions) {
    const w = document.createElement("div");
    w.className = "smwarn";
    const p = document.createElement("div");
    const b1 = document.createElement("b"); b1.textContent = "Loading drops your drawing.";
    p.appendChild(b1);
    p.appendChild(document.createTextNode(text));
    const r = document.createElement("div"); r.className = "r";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn-sm " + a.cls; b.textContent = a.label;
      b.onclick = (e) => { e.stopPropagation(); a.run(); };
      r.appendChild(b);
    });
    w.appendChild(p); w.appendChild(r);
    host.appendChild(w);
    return w;
  }

  return { make, closeAll, init, key, drawnWork, warning, get all() { return popups; } };
})();
