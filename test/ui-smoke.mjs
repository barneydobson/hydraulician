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
                 ids: F.map((f) => f.id),
                 bare: F.filter((f) => !f.name || f.unit === undefined || !f.ramp ||
                                       typeof f.def !== "function").length,
                 blurbless: F.filter((f) => !f.blurb || f.blurb.length < 20).length,
                 opts: [...document.getElementById("c_mode").options].map((o) => o.value) };
      `);
      eq("the registry has every field", reg.n, 8);
      check("every mode 0-7 is described once",
            [...reg.modes].sort((a, b) => a - b).join(",") === "0,1,2,3,4,5,6,7", reg.modes.join(","));
      // The ORDER is a decision, not an accident: Water first because it is
      // the default, then speed, then the three heads in the order they nest
      // (H contains h contains p/rho.g), then the two derived numbers.
      eq("the picker lists them in the agreed order", reg.ids.join(","),
         "water,speed,ehead,head,phead,vort,froude,mom");
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

      // The brief narrows the strip, and says so with a way out.
      const prof = await tab.evaluate(`
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { labels, wall: labels.includes("Wall"),
                 narrowed: APP.UIMODE.narrowed(),
                 showAll: !!document.getElementById("showAllBtn"),
                 panelHidden: [...document.querySelectorAll("#panel [data-sec]")]
                                .filter((e) => e.classList.contains("off")).length,
                 panelKept: [...document.querySelectorAll("#panel [data-sec]")]
                                .filter((e) => !e.classList.contains("off")).length };
      `);
      check("an exercise puts the drawing tools away", !prof.wall, prof.labels.join(","));
      check("and offers the way back", prof.showAll && prof.narrowed);
      check("the panel is focused", prof.panelHidden > 0, prof.panelHidden + " hidden");
      check("but not emptied", prof.panelKept > 0, prof.panelKept + " kept");

      // Leaving the exercise gives the whole interface back.
      const left = await tab.evaluate(`
        APP.switchScene("sandbox");
        const labels = [...document.querySelectorAll("#groups .tbtn")]
                         .map((b) => b.getAttribute("aria-label"));
        return { wall: labels.includes("Wall"), narrowed: APP.UIMODE.narrowed() };
      `);
      check("a new scene gives the interface back", left.wall && !left.narrowed);

      // …and coming back re-applies it, even after a lift. `EX.ready` because
      // pickExercise lands its rig a microtask later.
      const again = await tab.evaluate(`
        APP.pickExercise("HJ-1");
        return APP.EX.ready
          .then(() => { APP.UIMODE.lift(); APP.pickExercise("HJ-1"); return APP.EX.ready; })
          .then(() => {
            const labels = [...document.querySelectorAll("#groups .tbtn")]
                             .map((b) => b.getAttribute("aria-label"));
            return { wall: labels.includes("Wall"), narrowed: APP.UIMODE.narrowed() };
          });
      `);
      check("re-picking re-applies the profile", !again.wall && again.narrowed);

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

      // Average is a VIEW control: it changes how the water is DRAWN and
      // nothing about what is measured. It is also the one strip button whose
      // state costs memory, so "lit" and "a window is open" have to be the
      // same fact — a toggle that set the flag without opening the
      // accumulators would paint live data under an Average legend.
      const avg = await tab.evaluate(`
        const btns = [...document.querySelectorAll("#groups .tbtn")].map((b) => ({
          label: b.getAttribute("aria-label"),
          aria: !!b.getAttribute("aria-label"),
          icon: !!(b.querySelector("svg") && b.querySelector("svg").innerHTML.trim()),
        }));
        const a = btns.find((b) => /average/i.test(b.label || ""));
        // A missing button must REPORT, not throw: a thrown evaluate takes the
        // whole gate down with a stack trace instead of a named failure, and
        // the point of a layout gate is to say which agreement broke.
        const btn = document.getElementById("avgBtn");
        if (!btn) return { labels: btns.map((b) => b.label).join(","), a,
                           on: {}, off: {} };
        const box = () => document.getElementById("c_avg");
        APP.state.mode = 7; APP.LEGEND.sync();      // energy head: a NONLINEAR field
        APP.frames(20);
        btn.click();
        APP.frames(20);
        const card = document.getElementById("legend");
        const r = card.getBoundingClientRect();
        const txt = (id) => { const e = document.getElementById(id);
                              return e ? e.textContent : null; };
        const on = { flag: APP.state.avg, open: APP.SIM.avgActive(),
                     lit: btn.classList.contains("on"),
                     box: !!(box() && box().checked),
                     block: card.classList.contains("avg"),
                     T: txt("legAvgT"), what: txt("legAvgWhat"),
                     bottom: r.bottom, inner: window.innerHeight };
        dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
        const off = { flag: APP.state.avg, open: APP.SIM.avgActive(),
                      box: !!(box() && box().checked),
                      block: card.classList.contains("avg") };
        APP.state.mode = 0; APP.LEGEND.sync();
        return { labels: btns.map((b) => b.label).join(","), a, on, off };
      `);
      check("the strip carries an Average toggle", !!avg.a, avg.labels);
      check("it is labelled and has an icon", !!avg.a && avg.a.aria && avg.a.icon,
            JSON.stringify(avg.a));
      check("turning it on opens an averaging window",
            avg.on.flag && avg.on.open, JSON.stringify(avg.on));
      check("the strip lights and the panel agrees",
            avg.on.lit && avg.on.box, JSON.stringify(avg.on));
      // The card is where T, f-bar and the aeration gap are reported, and
      // where the reader is told that H, Fr and the momentum flux are fields
      // OF the mean flow rather than means of the field (docs/averaging.md §6).
      check("the legend grows its Average block", avg.on.block, JSON.stringify(avg.on));
      // A NON-ZERO window, not merely a well-formed one: "T = 0.00 s" is what
      // the markup ships, so a card that is never ticked would read correctly
      // and say nothing.
      check("and prints the elapsed window",
            /^T = \d+\.\d\d s$/.test(avg.on.T || "") &&
            parseFloat(String(avg.on.T).slice(4)) > 0.001, String(avg.on.T));
      check("and says the nonlinear field is of the MEAN FLOW",
            /mean flow/i.test(avg.on.what || ""), String(avg.on.what));
      // A card that grew past the bottom of the window would take its numbers
      // with it.
      check("the card still fits the viewport",
            avg.on.bottom > 0 && avg.on.bottom <= avg.on.inner,
            avg.on.bottom + " vs " + avg.on.inner);
      // A releases it, and the window goes with the mode - the accumulators
      // are ~22 MB a piece at Ultra and a flag left set would hold them.
      check("A releases it again",
            avg.off.flag === false && avg.off.open === false &&
            !avg.off.box && !avg.off.block,
            JSON.stringify(avg.off));

      // Captions are decoration before they are information: they are the
      // first thing to go when the strip runs out of room, never a control.
      const tight = await tab.evaluate(`
        document.getElementById("bar").classList.add("tight");
        return getComputedStyle(document.querySelector("#groups .tcap")).display === "none";
      `);
      check("captions drop at .tight", tight);
      await tab.close();
    }

    // ------------------------------------------- what the hover card prints
    console.log("\nthe hover card prints the rows an exercise asked for");
    {
      const tab = await browser.open(INDEX + "?scene=m3");
      const p = await tab.evaluate(`
        APP.tick(400); APP.frames(2);
        const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        const probe = APP.probe(APP.sim.W * 0.5, 0.5);
        // Spy on the 2d context rather than reading pixels: what this asserts
        // is WHICH rows were drawn, and the text is the only honest record of
        // that. A screenshot diff would pass on a card that drew the right
        // number of wrong rows.
        const cap = (show) => {
          const seen = [];
          const c = document.createElement("canvas").getContext("2d");
          const real = c.fillText.bind(c);
          c.fillText = (t, x, y) => { seen.push(String(t)); return real(t, x, y); };
          OVERLAY.drawCursorReadout(c, APP.view, A, APP.sim,
                                    APP.sim.W * 0.5, 0.5, probe, show);
          return seen;
        };
        const def = cap(null);
        const narrow = cap(["pos", "d", "Sf"]);
        const withF = cap(["pos", "f"]);
        const idsCovered = OVERLAY.ROW_IDS.every((id) => typeof id === "string" && id.length);
        return {
          nIds: OVERLAY.ROW_IDS.length,
          defaultOmitsF: OVERLAY.DEFAULT_ROWS.indexOf("f") < 0,
          defaultDrawsNoF: !def.some((t) => /fill f/.test(t)),
          defaultDrawsDepth: def.some((t) => /depth d/.test(t)),
          narrowDropsQ: !narrow.some((t) => t === "q"),
          narrowKeepsSf: narrow.some((t) => /S_f/.test(t)),
          fReturnsWhenNamed: withF.some((t) => /fill f/.test(t)),
          idsCovered,
        };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("the row register is populated", p.nIds >= 14 && p.idsCovered, p.nIds + " ids");
      // f is the VOF fill fraction: a solver internal, 1.000 everywhere a
      // free-surface card can be read. It is off by default and nameable back.
      check("fill f is not in the default set", p.defaultOmitsF);
      check("and the default card does not draw it", p.defaultDrawsNoF);
      check("while the ordinary rows still draw", p.defaultDrawsDepth);
      check("a profile's row list drops what it omits", p.narrowDropsQ);
      check("and keeps what it names", p.narrowKeepsSf);
      check("naming f puts it back", p.fReturnsWhenNamed);
      await tab.close();
    }

    // ------------------------------- the legend's place, and the mode switch
    console.log("\nthe legend sits top right, moves when dragged, carries the mode");
    {
      // ?ex= so the brief dock is OPEN: the default position is expressed as
      // right: calc(var(--dock) + 12px), and a dock of zero width would prove
      // nothing about whether it clears one.
      const tab = await browser.open(INDEX + "?ex=HJ-1",
        { ready: "return !!window.APP && !!document.querySelector('#dock.open');" });
      const p = await tab.evaluate(`
        const leg = document.getElementById("legend");
        APP.LEGEND.open();
        const L = leg.getBoundingClientRect();
        const dock = document.getElementById("dock").getBoundingClientRect();
        const panel = document.getElementById("panel");
        const pr = panel.getBoundingClientRect();
        const overPanel = panel.classList.contains("open") &&
          L.left < pr.right - 0.5 && L.top < pr.bottom && L.bottom > pr.top;

        // A drag must NOT start on a control. Fit is a button; pulling on it
        // has to leave the card exactly where it was.
        const fit = document.getElementById("legFit");
        const pd = (el, t, x, y, id) => el.dispatchEvent(
          new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: id }));
        pd(fit, "pointerdown", 0, 0, 9);
        pd(fit, "pointermove", 300, 300, 9);
        const heldStill = leg.getBoundingClientRect().left === L.left;
        pd(fit, "pointerup", 300, 300, 9);

        // ...but a drag on the card body must move it, and take the position over.
        const bars = document.getElementById("legBars");
        pd(bars, "pointerdown", L.left + 40, L.top + 60, 1);
        pd(bars, "pointermove", 460, 300, 1);
        pd(bars, "pointerup", 460, 300, 1);
        const after = leg.getBoundingClientRect();

        // The mode switch, and whether it agrees with the single writer.
        const liveB = document.getElementById("legLive"), avgB = document.getElementById("legAvgOn");
        avgB.click();
        const onState = APP.state.avg;
        const onPressed = avgB.getAttribute("aria-pressed") === "true" &&
                          liveB.getAttribute("aria-pressed") === "false";
        const avgChars = document.getElementById("legAvg").innerText.replace(/\ss+/g, " ").trim().length;
        APP.avg.set(false);                     // the path the A key takes
        const offPressed = liveB.getAttribute("aria-pressed") === "true" &&
                           avgB.getAttribute("aria-pressed") === "false";
        return { dockGap: Math.round(dock.left - L.right), overDock: L.right > dock.left + 0.5,
                 overPanel, heldStill, from: Math.round(L.left), movedTo: Math.round(after.left),
                 placed: leg.classList.contains("placed"), flag: APP.state.legendPlaced,
                 inView: after.left >= 0 && after.right <= innerWidth,
                 onState, onPressed, offPressed, avgChars };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("it sits immediately left of the dock", p.dockGap === 12, "gap " + p.dockGap + "px");
      check("and never under it", !p.overDock);
      check("nor under the Controls panel", !p.overPanel);
      check("a drag on a control does not move the card", p.heldStill);
      check("a drag on the card body does", p.movedTo !== p.from, p.from + " -> " + p.movedTo);
      check("and that takes the position over", p.placed && p.flag);
      check("a dragged card stays on screen", p.inView);
      check("the legend's Average button turns averaging on", p.onState);
      check("the buttons show which mode is running", p.onPressed);
      check("and follow setAverage when something else writes it", p.offPressed);
      // The block used to carry two static paragraphs that never changed and
      // are still in the panel's own info and docs/averaging.md section 9. If
      // it grows back past a few hundred characters, the prose has crept in.
      check("the Average block stays short", p.avgChars < 320, p.avgChars + " chars");
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
        const live = APP.ui.FIELDS.find((f) => f.mode === APP.state.mode);
        // m3 opens on the Froude view, so this also proves the card follows
        // the SCENE's choice — it used to say "Water" whatever was painted.
        const nameOk = document.getElementById("legName").textContent === live.name;
        APP.state.mode = 0; APP.LEGEND.sync();
        return { open: el.classList.contains("open"), nameOk, live: live.name,
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
      check("it names the field the scene chose", p.nameOk, p.live);
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

      // A scene chooses its own field and clears the ranges, so the card has
      // to follow it. It did not: every caller synced except the scene load.
      const scened = await tab.evaluate(`
        APP.switchScene("wave");
        return { name: document.getElementById("legName").textContent,
                 want: APP.ui.FIELDS.find((f) => f.mode === APP.state.mode).name };
      `);
      eq("a new scene repaints the card", scened.name, scened.want);

      // A profile can narrow the fields on offer, and the menu and the G key
      // are the two places that offer them — they must not disagree.
      const narrowFields = await tab.evaluate(`
        APP.UIMODE.apply({ fields: ["water", "head"] });
        document.getElementById("legPick").click();
        const listed = [...document.querySelectorAll("#legmenu .legopt")].length;
        document.getElementById("legPick").click();
        const seen = [];
        for (let k = 0; k < 4; k++) {
          dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
          seen.push(APP.ui.FIELDS.find((f) => f.mode === APP.state.mode).id);
        }
        APP.UIMODE.reset();
        return { listed, seen: [...new Set(seen)].sort().join(",") };
      `);
      eq("the menu offers only the profile's fields", narrowFields.listed, 2);
      eq("and G cycles the same two", narrowFields.seen, "head,water");
      await tab.close();
    }

    // ------------------------------------------------- the control-volume budget
    // The BALANCES — continuity, the energy loss — are asserted in smoke.js,
    // on a scene that has actually settled. This gate boots eight tabs and
    // cannot afford a 90 s spin-up, and an unsettled reach is still filling,
    // so it genuinely does not close. What belongs here is the wiring.
    console.log("\nthe control volume reports every edge, and agrees with the force box");
    {
      const tab = await browser.open(INDEX + "?scene=m2");
      const r = await tab.evaluate(`
        APP.frames(600);                        // let the reach establish itself
        const box = [3.0, 0.0, 8.0, 0.95];
        const flux = APP.boxFlux.apply(null, box);
        const force = APP.boxForce.apply(null, box);
        const e = flux.edges;
        return {
          keys: Object.keys(e).sort().join(","),
          // Water enters on the left and leaves on the right, so the two have
          // opposite signs under an outward-positive convention.
          inLeft: e.left.Q, outRight: e.right.Q,
          // The bed is solid, so no face of it is open: nothing crosses.
          bedQ: e.bed.Q,
          // M + Fp IS what boxForce reports. If these drift apart, one of the
          // two integrals has been changed without the other.
          fx: flux.fx, forceFx: force.fx,
          fz: flux.fz, forceFzNoWeight: force.fz + 9.81 * force.mass,
        };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("every edge is reported", r.keys, "bed,left,right,top");
      check("water enters on the left", r.inLeft < 0, String(r.inLeft));
      check("and leaves on the right", r.outRight > 0, String(r.outRight));
      check("a solid bed passes nothing", Math.abs(r.bedQ) < 1e-9, String(r.bedQ));
      // The same face integral, so this is exact bar floating-point order.
      check("momentum + pressure is the force boxForce reports",
            Math.abs(r.fx - r.forceFx) < 1e-6 * Math.max(1, Math.abs(r.forceFx)),
            r.fx + " vs " + r.forceFx);
      check("and the same vertically",
            Math.abs(r.fz - r.forceFzNoWeight) < 1e-3 * Math.max(1, Math.abs(r.fz)),
            r.fz + " vs " + r.forceFzNoWeight);
      await tab.close();
    }

    // ------------------------------------------------------------ the docs
    console.log("\nthe docs reader says what it needs when it cannot read");
    {
      // file:// refuses a page's request for the file beside it, and there is
      // nothing docs/view.html can do about that. What it must not do is show
      // a broken screen: the app is DOUBLE-CLICKABLE by design, so this is a
      // path real readers take. Whether it renders is checked in smoke.js,
      // which has a server.
      const url = pathToFileURL(join(ROOT, "docs", "view.html")).href + "?doc=numerics.md";
      const tab = await browser.open(url,
        { ready: "return !!document.querySelector('#doc h1, #doc .note');" });
      const r = await tab.evaluate(`
        const note = document.querySelector("#doc .note");
        return { note: !!note,
                 text: note ? note.textContent : "",
                 // Both ways out are offered, and both actually work.
                 github: !!document.querySelector('#doc .note a[href*="github.com"]'),
                 back: !!document.querySelector('a.back') };
      `);
      check("it explains itself instead of showing nothing", r.note);
      check("it names the server that would work", /http\.server/.test(r.text), r.text.slice(0, 90));
      check("and offers GitHub, which renders the same file", r.github);
      check("the way back to the app is there either way", r.back);
      await tab.close();
    }

    // ---------------------------------------------------------- flux sections
    console.log("\na section reads what crosses it, and two of them compare");
    {
      const tab = await browser.open(INDEX + "?scene=m1");
      const r = await tab.evaluate(`
        APP.frames(400);
        APP.state.tool = "flux";
        APP.placeFlux(4.0, 0.0, 4.0, 1.0);
        // One section is a reading; two are an answer. The interface has to
        // say so at the point where there is one.
        const oneNote = document.getElementById("n_fluxList").textContent;
        APP.placeFlux(9.0, 0.0, 9.0, 1.0);
        const twoNote = document.getElementById("n_fluxList").textContent;
        APP.frames(120);
        const L = APP.state.flux;
        return { n: L.length,
                 read: !!(L[0].ema && L[1].ema),
                 q1: L[0].ema.Q, q2: L[1].ema.Q,
                 e1: L[0].ema.E,
                 // A section drawn bottom-to-top has its normal downstream, so
                 // a reach flowing left to right reads positive on both.
                 sameSign: L[0].ema.Q * L[1].ema.Q > 0,
                 keys: ["Q", "Mx", "Mz", "Fpx", "Fpz", "E"]
                         .map((k) => [k, L[0].ema[k]]),
                 allFour: ["Q", "Mx", "Mz", "Fpx", "Fpz", "E"]
                            .every((k) => Number.isFinite(L[0].ema[k])) &&
                          Math.abs(L[0].ema.Fpx) > 0 && Math.abs(L[0].ema.Mx) > 0,
                 oneNote, twoNote,
                 inMeasure: APP.ui.TOOLBAR.find((g) => g.cap === "MEASURE").items
                              .some((i) => i.tool === "flux") };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("two sections go down", r.n, 2);
      check("each one reads", r.read);
      check("water crosses both the same way", r.sameSign,
            r.q1 + " and " + r.q2);
      check("a section carries energy too", Math.abs(r.e1) > 0, String(r.e1));
      // All four, not one at a time: continuity, the momentum it carries, the
      // pressure either side puts on it, and the energy going through. M and F
      // stay apart because telling them apart is the whole question.
      check("every section reports all four quantities", r.allFour,
            JSON.stringify(r.keys));
      check("the tool is in MEASURE", r.inMeasure);
      check("one section asks for a second", /second/i.test(r.oneNote), r.oneNote);
      check("two sections say they are compared", /compare/i.test(r.twoNote), r.twoNote);

      // Same bargain as every other instrument: click it to take it away.
      const gone = await tab.evaluate(`
        // The gesture the tool uses: a click ON a section takes it away.
        const took = APP.removeFluxAt(4.02, 0.5);   // within the grab radius of #1
        return { took, n: APP.state.flux.length };
      `);
      check("clicking a section removes it", gone.took && gone.n === 1,
            "took " + gone.took + ", " + gone.n + " left");

      // THE promise the digits make. A tool appended to TOOLS must not
      // renumber the nine a worksheet already refers to by digit.
      const digits = await tab.evaluate(`
        return APP.TOOLS.slice(0, 9).map((t) => t[0]).join(",");
      `);
      eq("the nine digits still mean what the worksheets say", digits,
         "wall,erase,valve,spout,gauge,rake,tracer,measure,cv");
      await tab.close();
    }

    // ------------------------------------------------- placing and removing
    console.log("\nan instrument you can place is an instrument you can remove");
    {
      const tab = await browser.open(INDEX + "?scene=m2");
      // Gauges and rakes were the only instruments with no way back: every
      // click pushed another, and the only way to lose one was to place four
      // more. The tape, the Force box and the tracers all clear on a click.
      const g = await tab.evaluate(`
        APP.state.tool = "gauge";
        APP.placeGauge(3.0, 0.5);
        APP.placeGauge(6.0, 0.5);
        const placed = APP.state.gauges.length;
        APP.placeGauge(6.0, 0.5);          // the same place again = remove it
        const after = APP.state.gauges.length;
        const left = APP.state.gauges.map((q) => +q.x.toFixed(2));
        return { placed, after, left };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      eq("two gauges go down", g.placed, 2);
      eq("clicking one takes it away", g.after, 1);
      eq("and it is the one that was clicked", g.left.join(","), "3");

      const r = await tab.evaluate(`
        APP.state.tool = "rake";
        APP.placeRake(4.0);
        const placed = APP.state.rakes.length;
        APP.placeRake(4.02);               // within the grab radius = remove it
        return { placed, after: APP.state.rakes.length };
      `);
      eq("a rake goes down", r.placed, 1);
      eq("clicking it takes it away", r.after, 0);

      // …and the panel says so too, for anyone who does not know the gesture.
      const cleared = await tab.evaluate(`
        APP.placeGauge(2.0, 0.5);
        APP.placeGauge(8.0, 0.5);
        const before = APP.state.gauges.length;
        const btn = [...document.querySelectorAll("#c_gaugeInspect button")]
                      .find((b) => /clear|✕/i.test(b.textContent));
        if (!btn) return { before, found: false };
        btn.click();
        return { before, found: true, after: APP.state.gauges.length };
      `);
      check("the panel offers a clear-all", cleared.found);
      check("and it empties them", cleared.found && cleared.after === 0,
            "was " + cleared.before + ", now " + cleared.after);
      await tab.close();
    }

    // ------------------------------------------------------------ particles
    console.log("\nparticles travel at the water's speed, not the wall clock's");
    {
      const tab = await browser.open(INDEX + "?scene=m2");
      // THE bug: particles were advanced by real elapsed time, while the
      // solver advances by whatever it managed in the frame budget (0.3x real
      // time on m2). They ran about three times too fast — and kept moving
      // with the clock stopped, which is the same fault stated plainly.
      const paused = await tab.evaluate(`
        APP.state.particles = true;
        APP.frames(30);
        if (!APP.state.paused) APP.ui.TOOLBAR.find((g) => g.cap === "RUN")
          .items.find((i) => i.id === "playBtn").el.click();
        const before = APP.particlePos();
        APP.frames(30);
        const after = APP.particlePos();
        let moved = 0;
        for (let k = 0; k < before.length; k++) {
          if (Math.abs(before[k] - after[k]) > 1e-9) moved++;
        }
        return { moved, n: before.length, paused: APP.state.paused };
      `);
      check("no uncaught errors", tab.errors.length === 0, tab.errors[0]);
      check("the clock is actually stopped", paused.paused);
      eq("a paused clock freezes the particles", paused.moved, 0);
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
