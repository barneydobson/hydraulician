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
    specCount: APP.ui.TOOLBAR.reduce((n, grp) => n + grp.items.length, 0),
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

      // ---- one array of colours, two consumers. The stops used to be vec3
      // literals inside FS_DISP, so a matching key could only be drawn by
      // typing the numbers out again somewhere else.
      const ramp = await tab.evaluate(`
        const R = APP.ui.RAMPS;
        const bad = Object.values(R).filter((r) =>
          r.length !== 5 || r.some((c) => c.length !== 3 ||
                                          c.some((v) => !(v >= 0 && v <= 1))));
        return { keys: Object.keys(R).sort().join(","), bad: bad.length };
      `);
      eq("both ramps are published", ramp.keys, "divg,turbo");
      eq("as five rgb stops in 0-1", ramp.bad, 0);

      // Every field must actually render: a shader that fails to compile
      // throws on the draw, and a mode with no mapping paints nothing.
      const modes = await tab.evaluate(`
        const out = [];
        for (const f of APP.ui.FIELDS) {
          APP.state.mode = f.mode;
          APP.frames(1);
          const r = APP.ui.rangeFor(f.id);
          out.push([f.id, r[0], r[1]]);
        }
        APP.state.mode = 0;
        return out;
      `);
      check("every field renders without error", tab.errors.length === 0, tab.errors[0]);
      check("every field has a finite range",
            modes.every(([, lo, hi]) => isFinite(lo) && isFinite(hi) && hi > lo),
            JSON.stringify(modes));
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
        const spec = APP.ui.TOOLBAR.flatMap((g) => g.items)
                      .find((it) => it.label === APP.TOOLS[APP.TOOLS.length - 1][1]);
        spec.el.click();
        const toolLabels = APP.TOOLS.map((t) => t[1]);
        const lit = [...document.querySelectorAll("#groups .tbtn.on")]
                      .filter((b) => toolLabels.includes(b.getAttribute("aria-label"))).length;
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
      // Exactly one tool is in your hand. Counted over the TOOLS only: the
      // VIEW family's toggles are lit whenever they are on, which is most of
      // the time, and they are not tools.
      eq("exactly one tool is lit", r.lit, 1);
      eq("pausing swaps the glyph", r.pausedIcon, r.wasPaused ? "pause" : "play");
      eq("pausing is a toggle", r.backTo, r.wasPaused);
      await tab.close();
    }

    // -------------------------------------------------- the strip's families
    console.log("\nthe strip says which family a tool belongs to");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const caps = [...document.querySelectorAll("#groups .tcap")].map((c) => c.textContent);
        const spec = APP.ui.TOOLBAR;
        return {
          caps, specCaps: spec.map((g) => g.cap),
          groups: document.querySelectorAll("#groups .tgrp").length,
          orphans: [...document.querySelectorAll("#groups .tbtn")]
                     .filter((b) => !b.closest(".tgrp")).length,
          buttons: document.querySelectorAll("#groups .tbtn").length,
          specCount: spec.reduce((n, g) => n + g.items.length, 0),
          viewGroup: spec.find((g) => g.cap === "VIEW").items.map((i) =>
            typeof i.label === "function" ? i.label() : i.label),
          buildGroup: spec.find((g) => g.cap === "BUILD").items.map((i) =>
            typeof i.label === "function" ? i.label() : i.label),
        };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("every group is captioned", r.caps.length, r.groups);
      eq("the captions are the spec's", r.caps.join(","), r.specCaps.join(","));
      eq("no button is outside a group", r.orphans, 0);
      eq("the strip still renders the whole spec", r.buttons, r.specCount);
      check("VIEW carries the field picker",
            r.viewGroup.some((l) => /field/i.test(l)), r.viewGroup.join(","));
      // Clear edits the rig, so it belongs with the tools that draw one — it
      // used to sit with the clock.
      check("BUILD owns Clear drawing",
            r.buildGroup.includes("Clear drawing"), r.buildGroup.join(","));

      // The panel is still the authority: the strip's toggle moves the state
      // the panel's checkbox reads, and the other way round.
      const parity = await tab.evaluate(`
        const it = APP.ui.TOOLBAR.find((g) => g.cap === "VIEW").items
                     .find((i) => /particles/i.test(
                       typeof i.label === "function" ? i.label() : i.label));
        const before = APP.state.particles;
        it.el.click();
        const after = APP.state.particles;
        const box = document.getElementById("c_particles").checked;
        it.el.click();
        return { before, after, box };
      `);
      check("the strip toggle moves the state", parity.before !== parity.after);
      eq("and the panel checkbox agrees", parity.box, parity.after);

      // Captions are decoration before they are information: they are the
      // first thing to go when the strip runs out of room, never a control.
      const tight = await tab.evaluate(`
        document.getElementById("bar").classList.add("tight");
        return getComputedStyle(document.querySelector("#groups .tcap")).display === "none";
      `);
      check("captions drop at .tight", tight);
      await tab.close();
    }

    // ------------------------------------------------------------ the legend
    console.log("\nthe legend says what the colour means, and changes it");
    {
      const tab = await browser.open(INDEX + "?scene=m3");
      const p = await tab.evaluate(`
        const el = document.getElementById("legend");
        const r = el.getBoundingClientRect();
        const bar = document.getElementById("bar").getBoundingClientRect();
        return { open: el.classList.contains("open"),
                 name: document.getElementById("legName").textContent,
                 left: r.left, top: r.top, right: r.right, barBottom: bar.bottom,
                 inner: window.innerWidth,
                 rows: el.querySelectorAll(".legrow").length };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("the legend is up by default", p.open);
      check("it clears the strip", p.top >= p.barBottom - 1,
            "legend top " + p.top + " vs bar bottom " + p.barBottom);
      check("it is inside the viewport", p.left >= 0 && p.right <= p.inner);
      check("it names the live field", /water/i.test(p.name), p.name);
      // Water is a TWO-variable encoding — hue from depth, brightness from
      // speed — and a card that showed one bar would be lying about it.
      eq("water shows two keyed rows", p.rows, 2);

      // Picking from the card moves the field, and the panel agrees.
      const picked = await tab.evaluate(`
        APP.LEGEND.open();
        document.getElementById("legPick").click();      // …and open its menu
        [...document.querySelectorAll("#legmenu .legopt")]
          .find((b) => b.dataset.mode === "2").click();
        return { mode: APP.state.mode,
                 name: document.getElementById("legName").textContent,
                 panel: document.getElementById("c_mode").value,
                 unit: document.getElementById("legUnit").textContent,
                 rows: document.querySelectorAll("#legend .legrow").length };
      `);
      eq("the card picks the field", picked.mode, 2);
      eq("and the panel follows", picked.panel, "2");
      check("the card renames itself", /speed/i.test(picked.name), picked.name);
      eq("and prints the unit", picked.unit, "m/s");
      eq("a single-variable field shows one row", picked.rows, 1);

      // Fit rescales once, from the frame it was clicked on, and then HOLDS.
      // A range that tracked the flow would mean the same colour was a
      // different number from second to second.
      const fit = await tab.evaluate(`
        APP.frames(40);
        const before = APP.ui.rangeFor("speed").slice();
        APP.LEGEND.fit();
        const after = APP.ui.rangeFor("speed").slice();
        APP.frames(40);
        const later = APP.ui.rangeFor("speed").slice();
        return { before, after, later,
                 printed: document.getElementById("legHi").textContent };
      `);
      check("Fit moves the range", fit.after[1] !== fit.before[1],
            JSON.stringify(fit.before) + " -> " + JSON.stringify(fit.after));
      eq("and then holds it", fit.later.join(","), fit.after.join(","));
      check("the printed number is the range",
            Math.abs(parseFloat(fit.printed) - fit.after[1]) < 0.01,
            fit.printed + " vs " + fit.after[1]);

      // A typed range takes it over and survives a frame.
      const typed = await tab.evaluate(`
        const box = document.getElementById("legHi");
        box.textContent = "1.25";
        box.dispatchEvent(new Event("blur"));
        APP.frames(5);
        return APP.ui.rangeFor("speed")[1];
      `);
      near("typing a range takes it over", typed, 1.25, 1e-6);

      // Each field keeps its own pair across a switch away and back.
      const kept = await tab.evaluate(`
        APP.state.mode = 1; APP.LEGEND.sync();
        APP.state.mode = 2; APP.LEGEND.sync();
        return APP.ui.rangeFor("speed")[1];
      `);
      near("each field keeps its own range", kept, 1.25, 1e-6);

      // L puts it away and brings it back.
      const keyed = await tab.evaluate(`
        dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
        const shut = APP.LEGEND.isOpen();
        dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
        return { shut, open: APP.LEGEND.isOpen() };
      `);
      check("L puts the legend away", !keyed.shut);
      check("and brings it back", keyed.open);
      await tab.close();
    }

    // -------------------------------------------------------- the UI profile
    console.log("\nan exercise can narrow the interface, and never lock it");
    {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const base = await tab.evaluate(`
        return { buttons: document.querySelectorAll("#groups .tbtn").length,
                 narrowed: APP.UIMODE.narrowed() };
      `);
      check("the sandbox is not narrowed", !base.narrowed);

      const narrow = await tab.evaluate(`
        APP.UIMODE.apply({ build: false, measure: ["gauge"], panel: "focused" });
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { labels, n: labels.length,
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn"),
                 wall: labels.includes("Wall"), gauge: labels.includes("Gauge"),
                 rake: labels.includes("Rake"),
                 stillRuns: labels.includes("Reset water") };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("the drawing tools go", !narrow.wall, narrow.labels.join(","));
      check("the declared instrument stays", narrow.gauge);
      check("the undeclared instrument goes", !narrow.rake);
      check("the clock is untouched", narrow.stillRuns);
      check("fewer buttons than before", narrow.n < base.buttons,
            narrow.n + " vs " + base.buttons);
      check("the profile knows it is narrowing", narrow.narrowed);
      check("and offers a way out", narrow.showAll);

      // A hidden tool's DIGIT still means that tool: worksheets say "press 5",
      // and renumbering the tools under a profile would make the pack lie.
      const digit = await tab.evaluate(`
        APP.state.tool = "gauge";
        dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));   // Wall, hidden
        return APP.state.tool;
      `);
      eq("a hidden tool's digit selects nothing else", digit, "gauge");

      const lifted = await tab.evaluate(`
        document.getElementById("showAllBtn").click();
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { n: labels.length, wall: labels.includes("Wall"),
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn") };
      `);
      check("Show everything brings the tools back", lifted.wall);
      eq("every control is back", lifted.n, base.buttons);
      check("and the way out goes away", !lifted.showAll && !lifted.narrowed);
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
        const strip = APP.ui.TOOLBAR.flatMap((g) => g.items);
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
        // The sheet owns the lower half and the strip the top, so there is no
        // room for a floating card as well: the legend stands down and the
        // field stays reachable from Controls.
        const leg = await tab.evaluate(`
          const el = document.getElementById("legend");
          const shown = getComputedStyle(el).display !== "none";
          const r = el.getBoundingClientRect();
          const d = document.getElementById("dock").getBoundingClientRect();
          return { shown, bottom: r.bottom, sheetTop: d.top, right: r.right,
                   inner: window.innerWidth };
        `);
        check("the legend clears the bottom sheet",
              !leg.shown || leg.bottom <= leg.sheetTop + 1,
              "legend bottom " + leg.bottom + " vs sheet top " + leg.sheetTop);
        check("and stays inside the width", !leg.shown || leg.right <= leg.inner);
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
