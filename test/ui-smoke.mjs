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
    groupsClipped: g.scrollWidth > g.clientWidth + 1,
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
      // The tools are reached by the number keys, which stop at 9.
      check("the tools fit the number keys", p.toolCount <= 9, p.toolCount + " tools");

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
        `return document.querySelector("#dock .exyours").textContent.includes("0.42");`));

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
