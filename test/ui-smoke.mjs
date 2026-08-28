/**
 * ui-smoke.mjs — does the interface come up, and does it still hold the
 * agreements the layout depends on?
 *
 *     node test/ui-smoke.mjs            # from the repo root
 *     CHROME=/path/to/chrome node test/ui-smoke.mjs
 *
 * Every case here is a bug that was actually shipped into the working tree
 * while the strip and the side panel were being built, which is the only
 * reason any of them is worth a test:
 *
 *   - the canvases kept their intrinsic 300 × 150 instead of filling the
 *     viewport, because a fixed box with `width: auto` does not stretch;
 *   - the start screen's pack laid its overflow out SIDEWAYS (CSS `columns`
 *     under a max-height), so 27 of the 40 demos could not be reached;
 *   - the strip shrank the wrong element and scrolled a whole group of
 *     controls out of sight to make room for a long scene name;
 *   - the Valves icon lit on almost every boot, because a scene without an
 *     explicit `valveOpen` starts shut.
 *
 * The invariant behind most of it: the side panel is DOCKED, so the viewport
 * gives way to it. `--dock` and `canvas.clientWidth` must always agree, or
 * the simulation is being drawn underneath the panel.
 */
import { launch, findChrome } from "./cdp.mjs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INDEX = pathToFileURL(join(ROOT, "index.html")).href;
const DOCK_W = 348;      // must match #dock in index.html and W in the DOCK module

let passed = 0, failed = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; fails.push(name + (detail ? " — " + detail : "")); console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}
function eq(name, got, want) {
  check(name, got === want, "got " + JSON.stringify(got) + ", want " + JSON.stringify(want));
}
function near(name, got, want, tol) {
  check(name, Math.abs(got - want) <= tol, "got " + got + ", want " + want + " ±" + tol);
}

/** The measurements every case reads. Kept in one expression so a case is one
 *  round trip and the numbers are all from the same frame. */
const PROBE = `
  const cs = getComputedStyle(document.documentElement);
  const c = document.getElementById("view");
  const o = document.getElementById("over");
  const g = document.getElementById("groups");
  const dock = document.getElementById("dock");
  return {
    dockVar: parseFloat(cs.getPropertyValue("--dock")) || 0,
    dockOpen: dock.classList.contains("open"),
    dockOver: dock.classList.contains("over"),
    dockId: dock.querySelector(".dock-h .eid").textContent,
    foldShown: document.getElementById("dockfold").classList.contains("show"),
    tabShown: document.getElementById("docktab").classList.contains("show"),
    canvasW: c.clientWidth, canvasH: c.clientHeight,
    overW: o.clientWidth,
    innerW: window.innerWidth, innerH: window.innerHeight,
    buttons: [...document.querySelectorAll("#groups .tbtn")].length,
    emptyIcons: [...document.querySelectorAll("#groups .tbtn")]
                  .filter((b) => !b.querySelector("svg") ||
                                 !b.querySelector("svg").innerHTML.trim()).length,
    unlabelled: [...document.querySelectorAll("#groups .tbtn")]
                  .filter((b) => !b.getAttribute("aria-label")).length,
    // Not "is there overflow" — flex rounds, and a pixel or two of slack hides
    // nothing. What must not happen is a BUTTON falling outside the visible
    // box, which is how a whole group once vanished behind a long scene name.
    groupsClipped: (() => {
      const gr = g.getBoundingClientRect();
      return [...g.querySelectorAll(".tbtn")].some((b) => {
        const r = b.getBoundingClientRect();
        return r.left < gr.left - 1 || r.right > gr.right + 1;
      });
    })(),
    startOpen: document.getElementById("start").classList.contains("open"),
    startItems: document.querySelectorAll("#startlist .si").length,
    startSideways: (() => { const l = document.getElementById("startlist");
                            return l.scrollWidth > l.clientWidth + 1; })(),
    specCount: APP.ui.TOOLBAR.reduce((n, grp) => n + grp.length, 0),
    toolCount: APP.TOOLS.length,
    litTools: [...document.querySelectorAll("#groups .tbtn.on")].length,
    valveHot: document.getElementById("valveBtn").classList.contains("on") ||
              document.getElementById("valveBtn").classList.contains("hot"),
    exId: APP.EX.current ? APP.EX.current.id : null,
    sceneId: APP.state.scene ? APP.state.scene.id : null,
  };
`;

async function main() {
  if (!findChrome()) {
    console.error("no Chrome or Edge found. Set $CHROME to a binary and re-run.");
    process.exit(2);
  }
  const browser = await launch({ width: 1440, height: 900 });
  try {
    // ---------------------------------------------------------- bare visit
    console.log("\na bare visit opens the start screen");
    {
      const tab = await browser.open(INDEX);
      const p = await tab.evaluate(PROBE);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("start screen is up", p.startOpen);
      eq("the whole pack is listed", p.startItems, await tab.evaluate("return APP.EX.all().length;"));
      check("the pack does not overflow sideways", !p.startSideways);
      check("every strip button has an icon", p.emptyIcons === 0, p.emptyIcons + " empty");
      check("every strip button is labelled", p.unlabelled === 0, p.unlabelled + " bare");
      eq("the strip renders the whole spec", p.buttons, p.specCount);
      check("no control is scrolled out of the strip", !p.groupsClipped);
      // How the digits map to the tools is checked under "touch parity".
      check("the pack has tools at all", p.toolCount > 0);

      // ---- the field registry is the single description of a field. Before
      // it, a field was described in three disconnected places — a u_mode
      // integer in the GLSL, an opts pair in the panel spec, and prose in an
      // info string — so a unit could be added to one and not the others.
      const reg = await tab.evaluate(`
        const F = APP.ui.FIELDS;
        return { n: F.length,
                 modes: F.map((f) => f.mode),
                 bare: F.filter((f) => !f.name || f.unit === undefined || !f.ramp ||
                                       typeof f.def !== "function").length,
                 blurbless: F.filter((f) => !f.blurb || f.blurb.length < 20).length,
                 opts: [...document.getElementById("c_mode").options].map((o) => o.value) };
      `);
      eq("the registry has all seven fields", reg.n, 7);
      check("every mode 0-6 is described once",
            [...reg.modes].sort((a, b) => a - b).join(",") === "0,1,2,3,4,5,6", reg.modes.join(","));
      check("every field is fully described", reg.bare === 0, reg.bare + " incomplete");
      check("every field carries a blurb", reg.blurbless === 0, reg.blurbless + " unexplained");
      // The panel select is BUILT from the registry, so it cannot fall behind it.
      eq("the panel select lists the registry", reg.opts.join(","),
         reg.modes.map(String).join(","));


      // Filtering the pack, and the side door out of it.
      const filtered = await tab.evaluate(`
        const f = document.getElementById("startfilter");
        f.value = "belanger"; f.dispatchEvent(new Event("input"));
        return document.querySelectorAll("#startlist .si").length;
      `);
      check("the filter narrows the pack", filtered >= 1 && filtered < p.startItems,
            "matched " + filtered);
      const sandbox = await tab.evaluate(`
        const f = document.getElementById("startfilter");
        f.value = ""; f.dispatchEvent(new Event("input"));
        document.querySelectorAll("#startside .startcard")[0].click();
        return { open: document.getElementById("start").classList.contains("open"),
                 scene: APP.state.scene.id };
      `);
      check("the sandbox door closes the start screen", !sandbox.open);
      eq("the sandbox door loads the sandbox", sandbox.scene, "sandbox");

      // G walks the whole registry and comes back to where it started. Only
      // once the start screen is down: it is modal, and swallows the key.
      const cycled = await tab.evaluate(`
        APP.state.mode = APP.ui.FIELDS[0].mode;
        const seen = [];
        for (let k = 0; k < APP.ui.FIELDS.length; k++) {
          dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
          seen.push(APP.state.mode);
        }
        return { seen, back: APP.state.mode };
      `);
      eq("G visits every field", new Set(cycled.seen).size, reg.n);
      eq("and wraps to where it started", cycled.back, reg.modes[0]);
      await tab.close();
    }

    // ------------------------------------------------------- a scene link
    console.log("\n?scene= skips the start screen and fills the window");
    {
      const tab = await browser.open(INDEX + "?scene=m3");
      const p = await tab.evaluate(PROBE);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("start screen stays down", !p.startOpen);
      eq("the scene loaded", p.sceneId, "m3");
      eq("no panel, no inset", p.dockVar, 0);
      // The bug this catches: a <canvas> keeps its intrinsic 300 × 150 unless
      // it is given a width, however many edges it is pinned to.
      eq("the canvas fills the width", p.canvasW, p.innerW);
      eq("the canvas fills the height", p.canvasH, p.innerH);
      eq("the overlay tracks the canvas", p.overW, p.canvasW);
      check("the canvas is not at its intrinsic size", p.canvasW > 300);
      // A scene with no `valveOpen` starts shut, so an "is it closed?" light
      // would be on here — and on nearly every other boot too.
      check("the valve light is off on a scene with no valve", !p.valveHot);
      await tab.close();
    }

    // ---------------------------------------------------- an exercise link
    console.log("\n?ex= docks the brief and the viewport gives way to it");
    {
      const tab = await browser.open(INDEX + "?ex=HJ-1",
        { ready: "return !!window.APP && !!document.querySelector('#dock.open');" });
      const p = await tab.evaluate(PROBE);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("start screen stays down", !p.startOpen);
      eq("the exercise is loaded", p.exId, "HJ-1");
      check("the panel is open", p.dockOpen);
      eq("the panel names the exercise", p.dockId, "HJ-1");
      check("the panel is docked, not overlaying", !p.dockOver);
      eq("the viewport is inset by the panel", p.dockVar, DOCK_W);
      // THE invariant: the water stops where the panel starts.
      eq("the canvas stops at the panel", p.canvasW, p.innerW - DOCK_W);
      eq("the overlay stops there too", p.overW, p.canvasW);
      check("the strip still shows every control", !p.groupsClipped);
      check("the fold handle is on the seam", p.foldShown);
      check("the reopen tab is put away", !p.tabShown);
      check("the brief carries the task", await tab.evaluate(
        `return document.querySelector("#dock .extask").textContent.length > 20;`));
      check("the brief carries the personalised rule", await tab.evaluate(
        `return document.querySelector("#dock .exrules").textContent.includes("0.42");`));

      // "Where do I put q?" — in the brief, on the row that states the rule.
      // The field must BE the Controls panel's control, not a copy of it.
      const q = await tab.evaluate(`
        // Matched on the RULE, which is stable; the row's own label is the
        // register's ("q"), not the panel control's ("Inflow q").
        const rows = [...document.querySelectorAll("#dock .exrow")];
        const row = rows.find((r) => r.textContent.includes("0.42 + 0.03"));
        if (!row) return { found: false };
        const el = row.querySelector(".exrowf input");
        if (!el) return { found: true, field: false };
        el.value = "0.45";
        el.dispatchEvent(new Event("input"));
        return { found: true, field: true,
                 sim: +APP.sim.p.inflow.q.toFixed(4),
                 panel: +document.getElementById("c_inQ").value };
      `);
      check("the rule row for q is in the brief", q.found);
      check("and it carries a field", q.field);
      eq("typing in it sets the discharge", q.sim, 0.45);
      eq("and the Controls slider follows", q.panel, 0.45);

      // …and the other way round, so the two can never disagree.
      const echoed = await tab.evaluate(`
        APP.EX.card.syncValues();       // as syncPanel does
        const s = document.getElementById("c_inQ");
        s.value = "0.6"; s.dispatchEvent(new Event("input"));
        const row = [...document.querySelectorAll("#dock .exrow")]
                      .find((r) => r.textContent.includes("0.42 + 0.03"));
        return +row.querySelector(".exrowf input").value;
      `);
      eq("moving the slider moves the field", echoed, 0.6);

      // The line the pack draws: the rule is printed, the answer is not.
      check("nothing pre-fills the answer", await tab.evaluate(`
        return !document.querySelector("#dock .exrules").textContent.match(/=\\s*0\\.45\\b/);
      `));

      // Folding: the exercise stays loaded, the water takes the width back.
      const folded = await tab.evaluate(`
        document.getElementById("dockfold").click();
        return { dock: parseFloat(getComputedStyle(document.documentElement)
                          .getPropertyValue("--dock")) || 0,
                 canvas: document.getElementById("view").clientWidth,
                 inner: window.innerWidth,
                 tab: document.getElementById("docktab").classList.contains("show"),
                 ex: APP.EX.current ? APP.EX.current.id : null };
      `);
      eq("folding gives the width back", folded.dock, 0);
      eq("the canvas takes it", folded.canvas, folded.inner);
      check("the reopen tab appears", folded.tab);
      eq("the exercise is still loaded", folded.ex, "HJ-1");

      const back = await tab.evaluate(`
        document.getElementById("docktab").click();
        return { dock: parseFloat(getComputedStyle(document.documentElement)
                          .getPropertyValue("--dock")) || 0,
                 canvas: document.getElementById("view").clientWidth,
                 inner: window.innerWidth };
      `);
      eq("unfolding takes it back", back.dock, DOCK_W);
      eq("the canvas gives way again", back.canvas, back.inner - DOCK_W);

      // Closing the brief must not unload the rig it set up.
      const closed = await tab.evaluate(`
        document.querySelector('#dock [data-a="close"]').click();
        return { dock: parseFloat(getComputedStyle(document.documentElement)
                          .getPropertyValue("--dock")) || 0,
                 ex: APP.EX.current ? APP.EX.current.id : null,
                 scene: APP.state.scene.id };
      `);
      eq("closing the brief frees the width", closed.dock, 0);
      eq("closing the brief keeps the exercise", closed.ex, "HJ-1");
      await tab.close();
    }

    // ------------------------------------------------------- tools & clock
    console.log("\nthe strip drives the tools and the clock");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const before = APP.state.tool;
        // Pick the last tool from the strip and confirm the strip agrees.
        const id = APP.TOOLS[APP.TOOLS.length - 1][0];
        const spec = APP.ui.TOOLBAR.flat().find((it) => it.label === APP.TOOLS[APP.TOOLS.length - 1][1]);
        spec.el.click();
        const lit = [...document.querySelectorAll("#groups .tbtn.on")].length;
        const play = document.getElementById("playBtn");
        const wasPaused = APP.state.paused;
        play.click();
        const icon = play.dataset.icon;
        play.click();
        return { before, after: APP.state.tool, want: id, lit,
                 wasPaused, pausedIcon: icon, backTo: APP.state.paused };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("clicking a tool picks it", r.after, r.want);
      check("the tool moved", r.before !== r.after);
      // Exactly one tool is in your hand, plus whatever non-tool toggles are
      // lit; the tools themselves must not double up.
      check("only one tool is lit", r.lit >= 1 && r.lit <= 2, "lit " + r.lit);
      eq("pausing swaps the glyph", r.pausedIcon, r.wasPaused ? "pause" : "play");
      eq("pausing is a toggle", r.backTo, r.wasPaused);
      await tab.close();
    }

    // ------------------------------------------------- the narrow fallback
    console.log("\na narrow window overlays the panel instead of insetting it");
    {
      const narrow = await launch({ width: 760, height: 720 });
      try {
        const tab = await narrow.open(INDEX + "?ex=HJ-1",
          { ready: "return !!window.APP && !!document.querySelector('#dock.open');" });
        const p = await tab.evaluate(PROBE);
        check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
        check("the panel is still open", p.dockOpen);
        check("it overlays", p.dockOver);
        eq("nothing is taken out of the viewport", p.dockVar, 0);
        eq("the canvas keeps the whole window", p.canvasW, p.innerW);
        // At this width twenty controls genuinely do not fit, and the strip is
        // built to SCROLL rather than to drop one. What must hold is that
        // every control is still reachable.
        check("the strip compacted itself", await tab.evaluate(
          `return document.getElementById("bar").classList.contains("tighter");`));
        check("the last control can still be scrolled to", await tab.evaluate(`
          const g = document.getElementById("groups");
          if (getComputedStyle(g).overflowX !== "auto") return false;
          const last = [...g.querySelectorAll(".tbtn")].pop();
          g.scrollLeft = g.scrollWidth;
          const r = last.getBoundingClientRect(), gr = g.getBoundingClientRect();
          return r.right <= gr.right + 1 && r.left >= gr.left - 1;
        `));
        await tab.close();
      } finally { await narrow.close(); }
    }
    // ------------------------------------------------------- the fitted view
    console.log("\nthe view is fitted to the window, not left at 1:1");
    {
      const tab = await browser.open(INDEX + "?scene=m3");
      const v = await tab.evaluate(`
        const fill = () => Math.round(100 * APP.view.h / APP.view.pxH);
        return { vex: APP.state.vex, auto: APP.state.vexAuto, fill: fill() };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("a wide flat flume is exaggerated", v.vex > 1, "vex " + v.vex);
      check("the fit is marked automatic", v.auto);
      // The point of the whole thing: the domain is worth looking at.
      check("the domain fills the window", v.fill >= 50, "fills " + v.fill + "%");
      // Setting it by hand takes it over, and a resize must not steal it back.
      const owned = await tab.evaluate(`
        APP.state.vex = 3; APP.state.vexAuto = false;
        dispatchEvent(new Event("resize"));
        return { vex: APP.state.vex, auto: APP.state.vexAuto };
      `);
      eq("a hand-set exaggeration is kept", owned.vex, 3);
      check("and stays hand-set", !owned.auto);
      // …and "reset the view" gives back the fitted one, not 1:1.
      const reset = await tab.evaluate(`
        APP.resetZoom();
        return { vex: APP.state.vex, auto: APP.state.vexAuto };
      `);
      check("reset returns to the fitted view", reset.vex > 1 && reset.auto, "vex " + reset.vex);
      await tab.close();
    }

    console.log("\na scene that states its own exaggeration keeps it");
    {
      // The wave flumes measured theirs against what they are trying to show.
      const scene = await (async () => {
        const t = await browser.open(INDEX + "?scene=sandbox");
        const id = await t.evaluate(`
          const s = APP.SCENES.list.find((s) => s.view && s.view.vex);
          return s ? { id: s.id, vex: s.view.vex } : null;
        `);
        await t.close();
        return id;
      })();
      if (!scene) { console.log("  --   no scene pins a vex; nothing to check"); }
      else {
        const tab = await browser.open(INDEX + "?scene=" + scene.id);
        const r = await tab.evaluate("return { vex: APP.state.vex, auto: APP.state.vexAuto };");
        eq("the scene's own vex is used (" + scene.id + ")", r.vex, scene.vex);
        check("the automatic fit stands down", !r.auto);
        await tab.close();
      }
    }

    // ------------------------------------------------------- touch parity
    console.log("\neverything reachable without a keyboard or a second button");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const ids = APP.TOOLS.map((t) => t[0]);
        const strip = APP.ui.TOOLBAR.flat();
        const labels = strip.map((it) => typeof it.label === "function" ? it.label() : it.label);
        // Pour must be a TOOL, so a finger can select it; the old path was
        // right-click, or touch + a Shift key no phone has.
        const pour = strip.find((it) => it.label === "Pour");
        pour.el.click();
        const armed = APP.state.tool;
        return { hasPour: ids.includes("pour"), armed,
                 hasUndo: !!document.getElementById("undoBtn"),
                 digits: strip.filter((it) => /^[0-9]$/.test(it.key || "")).length,
                 labels };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("Pour is a tool", r.hasPour);
      eq("and the strip arms it", r.armed, "pour");
      check("Undo is a button, not only the Z key", r.hasUndo);
      // The digits address at most nine tools; a tenth must not shadow one.
      check("at most nine tools carry a digit", r.digits <= 9, r.digits + " digits");
      await tab.close();
    }

    // --------------------------------------------------------- phone sizes
    console.log("\na phone gets a bottom sheet, not a side panel");
    {
      // Chrome will not open a window narrower than ~500 css px, which is
      // still inside the phone branch (< 620).
      const phone = await launch({ width: 420, height: 880 });
      try {
        const tab = await phone.open(INDEX + "?ex=HJ-1",
          { ready: "return !!window.APP && !!document.querySelector('#dock.open');" });
        const r = await tab.evaluate(`
          const d = document.getElementById("dock");
          const dr = d.getBoundingClientRect();
          const c = document.getElementById("view");
          return { sheet: d.classList.contains("sheet"), open: d.classList.contains("open"),
                   left: Math.round(dr.left), bottom: Math.round(dr.bottom),
                   width: Math.round(dr.width), height: Math.round(dr.height),
                   inner: [innerWidth, innerHeight],
                   canvasW: c.clientWidth, canvasH: c.clientHeight,
                   foldHidden: getComputedStyle(document.getElementById("dockfold")).display === "none",
                   fill: Math.round(100 * APP.view.h / APP.view.pxH),
                   vex: APP.state.vex };
        `);
        check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
        check("the panel is a sheet", r.sheet);
        eq("it spans the width", r.width, r.inner[0]);
        eq("it sits on the bottom", r.bottom, r.inner[1]);
        check("it leaves the water the top half", r.height < r.inner[1] * 0.62,
              r.height + " of " + r.inner[1]);
        check("the seam handle is put away", r.foldHidden);
        eq("the canvas keeps the whole width", r.canvasW, r.inner[0]);
        // The sheet takes HEIGHT the way the side panel takes width: without
        // this the domain centres itself on a full-height canvas whose lower
        // half is behind the sheet.
        eq("the canvas stops at the sheet", r.canvasH, r.inner[1] - r.height);
        // Without the fitted view this is the 14%-of-the-screen sliver.
        check("the flume is still worth looking at", r.fill >= 45,
              "fills " + r.fill + "% at vex " + r.vex.toFixed(1));
        await tab.close();
      } finally { await phone.close(); }
    }
  } finally {
    await browser.close();
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed) {
    console.log("\nfailures:");
    fails.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error("\n" + e.stack || e); process.exit(1); });
