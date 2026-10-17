/**
 * ui-smoke.mjs — does the interface come up, and does it still hold the
 * agreements the layout depends on?
 *
 *     node test/ui-smoke.mjs            # from the repo root
 *     CHROME=/path/to/chrome node test/ui-smoke.mjs
 *
 * Four launches (1440, 760, 420 and 800 px wide), one tab per case. Each case
 * runs under runCase: a throw inside it is that case's failure, recorded by
 * name, and the run goes on to the next. After the case, every tab it opened
 * is checked for uncaught errors and closed.
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
// The docked panel's width, read from the computed width of #dock (css/app.css
// is the single place it is written; the DOCK module's W must agree). Set by
// the first case that has the dock open.
let DOCK_W = 0;
const DOCK_READY = { ready: "return !!window.APP && !!document.querySelector('#dock.open');" };

let passed = 0, failed = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; fails.push(name + (detail ? " — " + detail : "")); console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}
function eq(name, got, want, detail) {
  check(name, got === want,
        "got " + JSON.stringify(got) + ", want " + JSON.stringify(want) + (detail ? " (" + detail + ")" : ""));
}
function near(name, got, want, tol) {
  check(name, Math.abs(got - want) <= tol, "got " + got + ", want " + want + " ±" + tol);
}

// Tabs opened by the case now running; runCase checks and closes them.
let caseTabs = null;
/** launch() whose tabs are registered with the running case. */
async function launchTracked(opts) {
  const b = await launch(opts);
  const open = b.open;
  b.open = async (...a) => { const t = await open(...a); if (caseTabs) caseTabs.push(t); return t; };
  return b;
}
/** One case, isolated: a throw is recorded as FAIL <name>: <message> and the
 *  run continues. Then the shared check — no uncaught page errors in any tab
 *  the case opened — and every tab is closed, so a throw cannot leak one. */
async function runCase(name, fn) {
  console.log("\n" + name);
  const tabs = caseTabs = [];
  try { await fn(); }
  catch (e) {
    failed++;
    const msg = "FAIL " + name + ": " + ((e && e.stack) || e);
    fails.push(msg);
    console.log("  " + msg);
  }
  check("no uncaught errors", tabs.every((t) => t.errors.length === 0),
        tabs.flatMap((t) => t.errors)[0]);
  for (const t of tabs) { try { await t.close(); } catch (_) { /* already closed */ } }
  caseTabs = null;
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
    // A strip item can carry a boot-time \`when\` (full screen only where the
    // browser allows it, pop-out only embedded) that buildToolbar filters on
    // top of the UI profile — so the spec's raw item count overcounts by
    // however many of those are hidden on THIS boot; only the surviving ones
    // are ever rendered.
    specCount: APP.ui.TOOLBAR.reduce((n, grp) =>
      n + grp.items.filter((it) => !it.when || it.when()).length, 0),
    toolCount: APP.TOOLS.length,
    litTools: [...document.querySelectorAll("#groups .tbtn.on")].length,
    // The Valves button is only on the strip where there is a valve (hasValves).
    valveHot: ((b) => !!b && (b.classList.contains("on") || b.classList.contains("hot")))(
              document.getElementById("valveBtn")),
    valveShown: !!document.getElementById("valveBtn"),
    exId: APP.EX.current ? APP.EX.current.id : null,
    sceneId: APP.state.scene ? APP.state.scene.id : null,
  };
`;

async function main() {
  if (!findChrome()) {
    console.error("no Chrome or Edge found. Set $CHROME to a binary and re-run.");
    process.exit(2);
  }
  const browser = await launchTracked({ width: 1440, height: 900 });
  try {
    await runCase("QS-2 width fields and sliders describe and restart the same experiment", async () => {
      const tab = await browser.open(INDEX + "?ex=QS-2");
      await tab.evaluate("return APP.EX.ready;");
      const r = await tab.evaluate(`
        APP.state.paused=true; APP.tick(10);
        const left=document.querySelector('#dock input[aria-label="Left reservoir width"]');
        const right=document.querySelector('#dock input[aria-label="Right reservoir width"]');
        const sliders=[document.getElementById('c_geom0'),document.getElementById('c_geom1')];
        const bounds=[left.min,left.max,left.step,right.min,right.max,right.step];
        left.value='7.5'; left.dispatchEvent(new Event('input'));
        const leftTime=APP.sim.t, leftWidth=APP.SIM.params().values.tank_b1;
        APP.tick(10); sliders[1].value='4.5'; sliders[1].dispatchEvent(new Event('input'));
        return {bounds,leftTime,leftWidth,rightTime:APP.sim.t,rightWidth:APP.SIM.params().values.tank_b2,
          rightField:+right.value,leftSlider:+sliders[0].value,types:sliders.map(s=>s.type),
          lecturerLink:document.querySelector('#dock .exlink').textContent,
          linkShown:getComputedStyle(document.querySelector('#dock .exlink')).display!=='none',
          scenesOnCard:!!document.getElementById('sceneBtn')};
      `);
      eq("both Geometry controls are sliders",r.types.join(','),'range,range');
      eq("card fields use the scene's own bounds",r.bounds.join(','),'6,9,0.25,3,6,0.25');
      eq("left field changes physical width",r.leftWidth,7.5);
      eq("left field updates its slider",r.leftSlider,7.5);
      eq("right slider changes physical width",r.rightWidth,4.5);
      eq("right slider updates its card field",r.rightField,4.5);
      eq("left width restarts the clock",r.leftTime,0);
      eq("right width restarts the clock",r.rightTime,0);
      eq("README link identifies its lecturer audience",r.lecturerLink,'Lecturer notes');
      check("the brief link is hidden unless a deployment asks for it",!r.linkShown);
      check("no Scenes button while an exercise is on screen",!r.scenesOnCard);
      await tab.close();
    });
    // ---------------------------------------------------------- bare visit
    await runCase("a bare visit opens the start screen", async () => {
      const tab = await browser.open(INDEX);
      const p = await tab.evaluate(PROBE);
      check("start screen is up", p.startOpen);
      // What the start screen lists is the exercise menu: the course menu when
      // this deployment ships one (js/menu.js), otherwise the whole register.
      eq("the menu's exercises are listed", p.startItems, await tab.evaluate("return APP.EX.groupsFor('').reduce((n, g) => n + g[1].length, 0);"));
      check("start screen lists > 0 exercises", p.startItems > 0, p.startItems + " listed");
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
      eq("the registry has every field", reg.n, 9);
      check("every mode 0-8 is described once",
            [...reg.modes].sort((a, b) => a - b).join(",") === "0,1,2,3,4,5,6,7,8", reg.modes.join(","));
      // The ORDER is a decision, not an accident: Water first because it is
      // the default, then speed, then the three heads in the order they nest
      // (H contains h contains p/rho.g), the plain Pressure (p = rho.g times
      // the pressure head where g is real) beside the last of them, then the
      // derived numbers.
      eq("the picker lists them in the agreed order", reg.ids.join(","),
         "water,speed,ehead,head,phead,p,vort,froude,mom");
      check("every field is fully described", reg.bare === 0, reg.bare + " incomplete");
      check("every field carries a blurb", reg.blurbless === 0, reg.blurbless + " unexplained");
      // The panel select is BUILT from the registry, so it cannot fall behind it.
      eq("the panel select lists the registry", reg.opts.join(","),
         reg.modes.map(String).join(","));


      // Filtering the pack, and the side door out of it.
      const filtered = await tab.evaluate(`
        const f = document.getElementById("startfilter");
        f.value = APP.EX.listed()[0].id; f.dispatchEvent(new Event("input"));
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
    });

    // ------------------------------------------------------- a scene link
    await runCase("?scene= skips the start screen and fills the window", async () => {
      const tab = await browser.open(INDEX + "?scene=m3");
      const p = await tab.evaluate(PROBE);
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
    });

    // ---------------------------------------------------- an exercise link
    await runCase("?ex= docks the brief and the viewport gives way to it", async () => {
      const tab = await browser.open(INDEX + "?ex=HJ-1",
        DOCK_READY);
      const p = await tab.evaluate(PROBE);
      DOCK_W = await tab.evaluate('return parseFloat(getComputedStyle(document.getElementById("dock")).width);');
      check("the docked panel has a width", DOCK_W > 0, "width " + DOCK_W);
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
      // Fold-on-land is an EMBEDDED behaviour (docs/design/2026-09-10-embed-design.md §1);
      // a plain `?ex=` boot must not pick it up by accident.
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
    });

    // ------------------------------------------------------- tools & clock
    await runCase("the strip drives the tools and the clock", async () => {
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
      eq("clicking a tool picks it", r.after, r.want);
      check("the tool moved", r.before !== r.after);
      // Exactly one tool is in your hand. Counted over the TOOLS only: the
      // VIEW family's toggles are lit whenever they are on, which is most of
      // the time, and they are not tools.
      eq("exactly one tool is lit", r.lit, 1);
      eq("pausing swaps the glyph", r.pausedIcon, r.wasPaused ? "pause" : "play");
      eq("pausing is a toggle", r.backTo, r.wasPaused);
      await tab.close();
    });

    // -------------------------------------------------- the strip's families
    await runCase("the strip says which family a tool belongs to", async () => {
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
          // See PROBE's specCount: a \`when\`-hidden item (full screen, pop-out)
          // is not in the spec's UNCONDITIONAL count either.
          specCount: spec.reduce((n, g) =>
            n + g.items.filter((it) => !it.when || it.when()).length, 0),
          viewGroup: spec.find((g) => g.cap === "VIEW").items.map((i) =>
            typeof i.label === "function" ? i.label() : i.label),
          buildGroup: spec.find((g) => g.cap === "BUILD").items.map((i) =>
            typeof i.label === "function" ? i.label() : i.label),
        };
      `);
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
    });

    // ------------------------------------------------------- the grade lines
    await runCase("the grade lines follow the head, in both regimes", async () => {
      const tab = await browser.open(INDEX + "?scene=m1");
      const p = await tab.evaluate(`
        const c = CONTROLS.find((x) => x.id === "budget"); if (c) c.set("Low");
        // Settled, at the scene's own measured spin-up — not part-way through
        // it. m1 starts 0.28 m deep and its inlet holds 0.49 m, so for the
        // first ~12 s the pool is filling and the surface runs 0.1-0.7 dx off
        // the head (median, Low); settled it sits within 0.05 dx. Bounded on
        // wall clock, so a software-rasterised Chrome fails with a reading
        // here instead of hanging the run.
        const t0 = Date.now(), spinup = APP.sim.scene.spinup;
        while (APP.sim.t < spinup && Date.now() - t0 < 120000) APP.tick(400);
        const settled = APP.sim.t >= spinup, tReached = APP.sim.t;
        APP.frames(3);
        const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        const h = APP.SIM.hydraulicGrade(null, false);
        const dx = APP.sim.dx;
        // In a hydrostatic free-surface column the piezometric head IS the
        // water surface. That is the check with teeth: it caught a half-cell
        // elevation bias (the median sat at exactly dx/2) that looked entirely
        // plausible on screen.
        const dev = [];
        for (let i = 2; i < APP.sim.nx - 2; i++) {
          if (!isFinite(h[i])) continue;
          dev.push(Math.abs(h[i] - (A.bed[i] + A.dRaw[i])));
        }
        dev.sort((a, b) => a - b);
        const median = dev[dev.length >> 1];
        // The live line comes off a GPU column pass (FS_HGL); it must be the
        // CPU walk it replaced, column for column: lowest non-solid cell with
        // f >= 0.25, z = j·dx + p/g. Read off the same state, no tick between.
        const S = APP.sim, nx = S.nx, ny = S.ny, g = Math.abs(S.p.g) || 9.81;
        const gl = document.querySelector("canvas").getContext("webgl2");
        const U = new Float32Array(nx * ny * 4), F = new Float32Array(nx * ny * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.U.read.fbo); gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, U);
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo); gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, F);
        let walkOff = 0, walkWorst = 0;
        for (let i = 0; i < nx; i++) {
          let ref = NaN;
          for (let j = 1; j < ny - 1; j++) {
            const k = j * nx + i;
            if (S.mask[k] >= 192 || F[k * 4] < 0.25) continue;
            ref = j * dx + U[k * 4 + 2] / g; break;
          }
          if (isFinite(ref) !== isFinite(h[i])) walkOff++;
          else if (isFinite(ref)) walkWorst = Math.max(walkWorst, Math.abs(ref - h[i]));
        }
        // and the draw path must actually run and label both lines
        let labels = [];
        const cx = document.createElement("canvas").getContext("2d");
        const real = cx.fillText.bind(cx);
        cx.fillText = (t, x, y) => { labels.push(String(t)); return real(t, x, y); };
        OVERLAY.drawGradeLines(cx, APP.view, A, APP.sim, h);
        const before = APP.state.grade;
        document.getElementById("gradeBtn").click();
        return { settled, tReached, spinup, n: dev.length, median, dx, ratio: median / dx, labels,
                 walkOff, walkWorst,
                 toggled: APP.state.grade !== before,
                 panelHasIt: !!CONTROLS.find((x) => x.id === "grade") };
      `, { timeout: 130000 });   // the in-page spin-up is bounded at 120 s; leave room to report
      check("m1 settled to its spin-up inside the budget", p.settled,
            "reached t = " + p.tReached.toFixed(1) + " s of " + p.spinup + " s in 120 s of wall clock");
      check("the grade line covers the reach", p.n > 200, p.n + " columns");
      check("and lies on the water surface where the column is hydrostatic",
            p.ratio < 0.25,
            "median |HGL - surface| " + (p.n ? p.median.toFixed(5) : "n/a") + " m = " +
            (p.n ? p.ratio.toFixed(3) : "n/a") + " dx");
      check("the GPU column pass is the CPU walk, column for column",
            p.walkOff === 0 && p.walkWorst < 1e-5,
            p.walkOff + " wet/dry mismatches, worst |Δh| " + p.walkWorst.toExponential(2) + " m");
      check("both lines are labelled", p.labels.length === 2, JSON.stringify(p.labels));
      check("the strip button toggles it", p.toggled);
      // The panel must be able to reproduce anything the strip does — the
      // standing acceptance test for control changes.
      check("and the panel can set it too", p.panelHasIt);
      await tab.close();
    });

    // A pressurised run is the case the HGL exists for: there is no free
    // surface, the column reduction reports the soffit, and the head runs
    // above the crown.
    await runCase("a pressurised run puts the HGL above the conduit", async () => {
      const tab = await browser.open(INDEX + "?scene=hammer");
      const p = await tab.evaluate(`
        const c = CONTROLS.find((x) => x.id === "budget"); if (c) c.set("Low");
        APP.tick(1200); APP.frames(3);
        const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        const h = APP.SIM.hydraulicGrade(null, false);
        let n = 0, above = 0, worst = 0;
        for (let i = 2; i < APP.sim.nx - 2; i++) {
          if (!isFinite(h[i])) continue;
          n++;
          const d = h[i] - (A.bed[i] + A.dRaw[i]);
          if (d > 0.02) above++;
          if (d > worst) worst = d;
        }
        return { n, above, worst };
      `);
      check("in a pressurised conduit the HGL leaves the conduit",
            p.above > 0.8 * p.n && p.worst > 1,
            p.above + " of " + p.n + " columns, up to " + p.worst.toFixed(1) + " m above");
      await tab.close();
    });

    // ------------------------------------------- what the hover card prints
    await runCase("the hover card prints the rows an exercise asked for", async () => {
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
        // The class title ("M1 profile") is governed by the list too — it
        // used to be drawn whatever the list said — and by ui.hide "critical".
        const title = (seen) => seen.some((t) => / profile$/.test(t));
        const crit = (seen) => seen.some((t) => /critical/.test(t));
        OVERLAY.setPrint({ critical: false });
        const plain = cap(null);
        OVERLAY.setPrint({ critical: true });
        const idsCovered = OVERLAY.ROW_IDS.every((id) => typeof id === "string" && id.length);
        return {
          nIds: OVERLAY.ROW_IDS.length,
          defaultOmitsF: OVERLAY.DEFAULT_ROWS.indexOf("f") < 0,
          defaultDrawsNoF: !def.some((t) => /fill f/.test(t)),
          defaultDrawsDepth: def.some((t) => /depth d/.test(t)),
          narrowDropsQ: !narrow.some((t) => t === "q"),
          narrowKeepsSf: narrow.some((t) => /S_f/.test(t)),
          fReturnsWhenNamed: withF.some((t) => /fill f/.test(t)),
          defTitle: title(def), defCrit: crit(def),
          narrowTitle: title(narrow), plainTitle: title(plain), plainCrit: crit(plain),
          plainFr: plain.some((t) => /fast, shallow|slow, deep/.test(t)),
          idsCovered,
        };
      `);
      check("the row register is populated", p.nIds >= 14 && p.idsCovered, p.nIds + " ids");
      // f is the VOF fill fraction: a solver internal, 1.000 everywhere a
      // free-surface card can be read. It is off by default and nameable back.
      check("fill f is not in the default set", p.defaultOmitsF);
      check("and the default card does not draw it", p.defaultDrawsNoF);
      check("while the ordinary rows still draw", p.defaultDrawsDepth);
      check("a profile's row list drops what it omits", p.narrowDropsQ);
      check("and keeps what it names", p.narrowKeepsSf);
      check("naming f puts it back", p.fReturnsWhenNamed);
      check("the default card carries the profile class and the regime word",
            p.defTitle && p.defCrit, JSON.stringify(p));
      check("a row list without `profile` drops the class title", !p.narrowTitle);
      check("ui.hide critical drops the class and the regime words",
            !p.plainTitle && !p.plainCrit && p.plainFr, JSON.stringify(p));
      await tab.close();
    });

    // ------------------------- per-gauge quantities and the readout switches
    await runCase("each gauge plots its own quantity; readouts and hover switch independently", async () => {
      const tab = await browser.open(INDEX + "?ex=HJ-2",
        DOCK_READY);
      const r = await tab.evaluate(`
        return APP.EX.ready.then(() => {
          APP.placeGauge(2.5, 0.6); APP.placeGauge(8.0, 0.3);
          const G = APP.state.gauges;
          const startOn = G.map((g) => g.field).join(",");
          G[1].field = "speed";
          APP.frames(20);
          const s = G[0].log[G[0].log.length - 1] || {};
          const keys = ["p", "phead", "u", "w", "speed", "eta", "d", "h", "H"]
            .filter((k) => Number.isFinite(s[k]));
          const hdr = APP.gaugeCSV().split("\\n")[0].split(",").length;
          const sels = [...document.querySelectorAll(".gcardSel")]
            .filter((e) => e.style.display !== "none").map((e) => e.value + ":" +
              [...e.options].map((o) => o.value).join("|"));
          const panelOpts = [...document.querySelectorAll("#c_gaugeField option")].map((o) => o.value).join(",");
          const n0 = G[0].log.length, hover0 = APP.state.hoverCard;
          document.getElementById("readBtn").click();
          APP.frames(10);
          const hidden = { inst: APP.state.instReadouts, hover: APP.state.hoverCard, hover0,
                           recorded: G[0].log.length - n0,
                           sels: [...document.querySelectorAll(".gcardSel")].filter((e) => e.style.display !== "none").length };
          document.getElementById("readBtn").click();
          document.getElementById("hoverBtn").click();
          const hov = { inst: APP.state.instReadouts, hover: APP.state.hoverCard, hover0 };
          const hj = { energyHidden: APP.UIMODE.hides("energy"), title: document.getElementById("sceneName").textContent };
          return { startOn, keys, hdr, sels, panelOpts, hidden, hov, hj };
        });
      `);
      eq("new gauges start on the card's Gauges plot", r.startOn, "d,d");
      eq("every sample records all nine quantities", r.keys.length, 9);
      eq("the CSV carries every quantity of every gauge", r.hdr, 1 + 2 * 9);
      eq("each card's selector shows its own gauge, from the offered set",
         r.sels.join(" "), "speed:u|speed|eta|d d:u|speed|eta|d");
      eq("Gauges plot offers the card's quantities only", r.panelOpts, "u,speed,eta,d");
      check("Readouts off hides the boxes, keeps recording, leaves the hover card",
            r.hidden.inst === false && r.hidden.recorded > 0 && r.hidden.sels === 0 && r.hidden.hover === r.hidden.hover0,
            JSON.stringify(r.hidden));
      check("Hover readout switches on its own", r.hov.inst === true && r.hov.hover === !r.hov.hover0,
            JSON.stringify(r.hov));
      check("a Year 1 card withholds the energy terms", r.hj.energyHidden);
      check("the strip names the exercise, not its scene (a tabbed card adds its tab)", r.hj.title.indexOf("Momentum balance: sluice gate and hydraulic jump") === 0, r.hj.title);
      await tab.close();
      const ff1 = await browser.open(INDEX + "?ex=FF-1",
        DOCK_READY);
      const h = await ff1.evaluate("return APP.EX.ready.then(() => APP.state.hoverCard);");
      eq("FF-1 opens with the hover card off", h, false);
      await ff1.close();
    });
    // ------------------------------------- tabs, the short layout, inline icons
    await runCase("a tabbed card swaps its steps and interface, not the bench; steps draw the strip's own icons", async () => {
      // ?ex=MM-2 is an ALIAS: the id the Forces question had before the
      // contraction rig became one exercise with three tabs.
      const tab = await browser.open(INDEX + "?ex=MM-2",
        DOCK_READY);
      const r = await tab.evaluate(`
        return APP.EX.ready.then(() => {
          const c0 = APP.EX.current.ref, url0 = location.search, mode0 = APP.state.mode;
          APP.tick(60);
          const t0 = APP.sim.t;
          document.querySelector('#dock .extab[data-tab="streamlines"]').click();
          const ico = [...document.querySelectorAll('#dock .exsteps .exico')];
          return { c0, url0, mode0, c1: APP.EX.current.ref, url1: location.search,
            t0, t1: APP.sim.t, scene: APP.sim.scene.id,
            fields: APP.UIMODE.fields().map((f) => f.id).join(","),
            measure: APP.state.ui.measure,
            tabs: [...document.querySelectorAll('#dock .extab')]
              .map((b) => b.textContent + (b.classList.contains("on") ? "*" : "")).join(","),
            steps: document.querySelectorAll('#dock .exsteps li').length,
            icons: ico.map((e) => e.textContent).join("|"),
            svgs: ico.filter((e) => e.querySelector("svg")).length,
            bad: document.querySelectorAll('#dock .exico.bad').length,
            bgShown: getComputedStyle(document.querySelector('#dock .exbg')).display !== "none",
            bgOpen: document.querySelector('#dock .exbg').open,
            start: getComputedStyle(document.querySelector('#dock .exstart')).display,
            task: getComputedStyle(document.querySelector('#dock .extask')).display };
        });
      `);
      eq("an old id opens its tab", r.c0, "CR-1#forces");
      check("and the address bar names the entry and the tab",
            /ex=CR-1/.test(r.url0) && /tab=forces/.test(r.url0), r.url0);
      eq("the Forces tab opens on Pressure", r.mode0, 8);
      eq("a tab click switches the card", r.c1, "CR-1#streamlines");
      check("without reloading the scene or restarting the flow",
            r.scene === "contraction" && r.t1 >= r.t0 && r.t0 > 0, JSON.stringify([r.t0, r.t1]));
      check("the address bar follows the tab", /tab=streamlines/.test(r.url1), r.url1);
      eq("the tab's own fields", r.fields, "water,speed");
      eq("the tab's own tools — only the Dye tool", JSON.stringify(r.measure), '["dye"]');
      eq("the tab bar marks the open tab", r.tabs, "Streamlines*,Continuity,Forces,Energy");
      eq("five steps", r.steps, 5);
      eq("the steps name strip buttons by their own labels", r.icons, "Particles|Streamlines|Dye");
      eq("each with the strip's own icon", r.svgs, 3);
      eq("no unknown markup", r.bad, 0);
      check("Background is there, and closed", r.bgShown && !r.bgOpen, JSON.stringify(r));
      check("the short layout drops Start and Do", r.start === "none" && r.task === "none",
            r.start + " " + r.task);
      await tab.close();
    });
    await runCase("a gauge can be removed one by one or all at once; the strip shows only what the bench can use", async () => {
      const tab = await browser.open(INDEX + "?scene=m2");
      const r = await tab.evaluate(`
        const G = APP.state.gauges;
        APP.placeGauge(3, 0.3); APP.placeGauge(6, 0.3); APP.placeGauge(9, 0.3);
        APP.frames(5);
        const xs = [...document.querySelectorAll(".gcardX")].filter((e) => e.style.display !== "none");
        const nX = xs.length;
        xs[0].click();                                   // the × on one corner card
        const afterX = G.length;
        APP.inspect(0);
        document.querySelector(".ginsp .ginsp-rm").click();   // Remove in the inspector
        const afterRm = G.length, wins = document.querySelectorAll(".ginsp").length;
        APP.placeGauge(4, 0.3);
        const gb = () => [...document.querySelectorAll("#groups .tbtn")].find((b) => b.getAttribute("aria-label") === "Gauge");
        gb().click();                                    // arms the tool: nothing removed
        const armed = APP.state.tool, keptOnArm = G.length;
        gb().click();                                    // again: clears every gauge
        const cleared = G.length;
        // Valves: none on m2, one drawn puts the button up, undo takes it away.
        const v0 = !!document.getElementById("valveBtn");
        APP.SIM.addSeg(5, 0.1, 5, 0.6, 0.05, 128); APP.frames(1);
        const v1 = !!document.getElementById("valveBtn");
        APP.SIM.undoSeg(); APP.frames(1);
        const v2 = !!document.getElementById("valveBtn");
        // No exercise on screen (a ?scene= boot): the Scenes button is offered.
        const s1 = !!document.getElementById("sceneBtn");
        return { nX, afterX, afterRm, wins, armed, keptOnArm, cleared, v0, v1, v2, s1,
                 sceneTool: APP.state.scene.id };
      `);
      eq("every corner card carries a ×", r.nX, 3);
      eq("its × removes that gauge", r.afterX, 2);
      check("the inspector's Remove removes its gauge and closes its window",
            r.afterRm === 1 && r.wins === 0, JSON.stringify(r));
      check("a first press on Gauge arms the tool and removes nothing",
            r.armed === "gauge" && r.keptOnArm === 2, JSON.stringify(r));
      eq("a second press on Gauge clears every gauge", r.cleared, 0);
      check("Valves is off the strip until a valve is drawn, and goes with it",
            !r.v0 && r.v1 && !r.v2, JSON.stringify(r));
      check("with no exercise loaded the Scenes button is offered", r.s1 === true, JSON.stringify(r));
      await tab.close();
    });

    // ------------------------------- the legend's place, and the mode switch
    await runCase("the legend sits top right, moves when dragged, carries the mode", async () => {
      // ?ex= so the brief dock is OPEN: the default position is expressed as
      // right: calc(var(--dock) + 12px), and a dock of zero width would prove
      // nothing about whether it clears one.
      const tab = await browser.open(INDEX + "?ex=HJ-1",
        DOCK_READY);
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
        const avgChars = document.getElementById("legAvg").innerText.replace(/\\s+/g, " ").trim().length;
        APP.avg.set(false);                     // the path the A key takes
        const offPressed = liveB.getAttribute("aria-pressed") === "true" &&
                           avgB.getAttribute("aria-pressed") === "false";
        return { dockGap: Math.round(dock.left - L.right), overDock: L.right > dock.left + 0.5,
                 overPanel, heldStill, from: Math.round(L.left), movedTo: Math.round(after.left),
                 placed: leg.classList.contains("placed"), flag: APP.state.legendPlaced,
                 inView: after.left >= 0 && after.right <= innerWidth,
                 onState, onPressed, offPressed, avgChars };
      `);
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
    });

    // ------------------------------------------------------------ the legend
    await runCase("the legend says what the colour means, and changes it", async () => {
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
        const open = APP.LEGEND.isOpen();
        dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
        return { open, reopened: APP.LEGEND.isOpen() };
      `);
      check("L puts the legend away", !keyed.open);
      check("and brings it back", keyed.reopened);

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
    });

    // ------------------------------------------------- the control-volume budget
    // The BALANCES — continuity, the energy loss — are asserted in smoke.js,
    // on a scene that has actually settled. This gate boots a tab per case
    // and cannot afford a 90 s spin-up, and an unsettled reach is still filling,
    // so it genuinely does not close. What belongs here is the wiring.
    await runCase("the control volume reports every edge, and agrees with the force box", async () => {
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
          fz: flux.fz, forceFzNoWeight: force.fz + Math.abs(APP.sim.p.g) * force.mass,
        };
      `);
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
    });

    // ------------------------------------------------------------ the docs
    await runCase("the docs reader says what it needs when it cannot read", async () => {
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
                 // On a Pages site the repository is linked (derived from the
                 // host); from file:// there is no repository to name, so the
                 // note points at GitHub in words.
                 github: /GitHub/.test(note ? note.textContent : ""),
                 back: !!document.querySelector('a.back') };
      `);
      check("it explains itself instead of showing nothing", r.note);
      check("it names the server that would work", /http\.server/.test(r.text), r.text.slice(0, 90));
      check("and offers GitHub, which renders the same file", r.github);
      check("the way back to the app is there either way", r.back);
      await tab.close();
    });

    // ---------------------------------------------------------- flux sections
    await runCase("a section reads what crosses it, and two of them compare", async () => {
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
        const e0 = L[0].ema || {}, e1 = L[1].ema || {};   // null until read: fail the check, not the case
        return { n: L.length,
                 read: !!(L[0].ema && L[1].ema),
                 q1: e0.Q, q2: e1.Q,
                 e1: e0.E,
                 // A section drawn bottom-to-top has its normal downstream, so
                 // a reach flowing left to right reads positive on both.
                 sameSign: e0.Q * e1.Q > 0,
                 keys: ["Q", "Mx", "Mz", "Fpx", "Fpz", "E"]
                         .map((k) => [k, e0[k]]),
                 allFour: ["Q", "Mx", "Mz", "Fpx", "Fpz", "E"]
                            .every((k) => Number.isFinite(e0[k])) &&
                          Math.abs(e0.Fpx) > 0 && Math.abs(e0.Mx) > 0,
                 oneNote, twoNote,
                 inMeasure: APP.ui.TOOLBAR.find((g) => g.cap === "MEASURE").items
                              .some((i) => i.tool === "flux") };
      `);
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
    });

    // ------------------------------------------------- the pressure-force tool
    await runCase("the Force tool is on the strip and arms without breaking the layout", async () => {
      // No scene declares solids yet (that lands with the s3 conversion), so
      // this is wiring-only: the tool exists, sits in MEASURE beside its
      // fellow instruments, carries no digit (twelfth, appended, same as
      // Flux), and arming it disturbs nothing the layout gate watches.
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const strip = APP.ui.TOOLBAR.flatMap((g) => g.items);
        const inMeasure = APP.ui.TOOLBAR.find((g) => g.cap === "MEASURE").items
                             .some((i) => i.tool === "force");
        const item = strip.find((i) => i.tool === "force");
        item.el.click();
        return { hasForce: APP.TOOLS.map((t) => t[0]).includes("force"),
                 inMeasure, key: item.key, armed: APP.state.tool };
      `);
      check("Force is a tool", r.hasForce);
      check("it lives in MEASURE", r.inMeasure);
      eq("and carries no digit — 1-9 are already taken", r.key, "");
      eq("the strip arms it", r.armed, "force");
      const p = await tab.evaluate(PROBE);
      check("every strip button still has an icon", p.emptyIcons === 0, p.emptyIcons + " empty");
      check("every strip button is still labelled", p.unlabelled === 0, p.unlabelled + " bare");
      eq("the strip still renders the whole spec", p.buttons, p.specCount);
      check("no control fell out of the strip", !p.groupsClipped);
      await tab.close();
    });

    // ------------------------------------------------- the Dye tool
    await runCase("the Dye tool releases ink only while it is held", async () => {
      // Nothing is dyed on boot (a scene's fixed sources are off unless it
      // asks); press-and-hold releases at the pointer, a drag moves the
      // release point, letting go stops it. Plan view (`body`), so every cell
      // is water. Driven through real pointer events on the canvas.
      const tab = await browser.open(INDEX + "?scene=body");
      const r = await tab.evaluate(`
        const S = APP.sim, cv = document.querySelector("canvas");
        const strip = APP.ui.TOOLBAR.flatMap((g) => g.items);
        const item = strip.find((i) => i.tool === "dye");
        const inMeasure = APP.ui.TOOLBAR.find((g) => g.cap === "MEASURE").items
                             .some((i) => i.tool === "dye");
        const oldBtn = strip.some((i) => i.id === "dyeBtn");
        APP.frames(20);
        const x0 = 0.2 * S.W, z0 = 0.5 * S.H, x1 = 0.3 * S.W;
        const before = APP.probe(x0, z0).dye;
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
        const byKey = APP.state.tool;
        const R = cv.getBoundingClientRect(), sc = R.width / cv.clientWidth;
        const at = (x, z) => ({ clientX: R.left + APP.view.X(x) * sc,
                                clientY: R.top + APP.view.Y(z) * sc,
                                pointerId: 7, button: 0, buttons: 1, bubbles: true });
        cv.dispatchEvent(new PointerEvent("pointerdown", at(x0, z0)));
        const held = !!S.p.dyeInj;
        APP.frames(30);
        const dyed = APP.probe(x0, z0).dye;
        cv.dispatchEvent(new PointerEvent("pointermove", at(x1, z0)));
        const moved = S.p.dyeInj ? S.p.dyeInj.x : -1;
        APP.frames(10);
        cv.dispatchEvent(new PointerEvent("pointerup", at(x1, z0)));
        return { inMeasure, oldBtn, key: item && item.key, byKey, before, held, dyed,
                 moved, x1, released: S.p.dyeInj == null, seeds: APP.state.dyeSeeds };
      `);
      check("Dye is a tool in MEASURE", r.inMeasure);
      check("the old Dye view toggle is gone", !r.oldBtn);
      eq("its key is D", r.key, "D");
      eq("D arms it", r.byKey, "dye");
      check("nothing is dyed before a release", r.before === 0 && !r.seeds, JSON.stringify(r));
      check("pressing starts the release", r.held);
      check("holding dyes the water under the pointer", r.dyed > 0.5, String(r.dyed));
      check("dragging moves the release point", Math.abs(r.moved - r.x1) < 1e-6, String(r.moved));
      check("letting go stops it", r.released);
      await tab.close();
    });

    // ------------------------------------------------- the Geometry section
    await runCase("the Geometry panel binds to whatever the scene actually declares", async () => {
      // hump declares one param (hump_h); the panel's six geom rows are a
      // fixed pool that binds to a scene's params by INDEX (main.js's
      // syncPanel), so exactly one of the six should be showing, and it
      // should carry the scene's own label rather than a placeholder.
      const tab = await browser.open(INDEX + "?scene=hump");
      const r = await tab.evaluate(`
        const rows = [0, 1, 2, 3, 4, 5].map((k) => {
          const input = document.getElementById("c_geom" + k);
          return !input.parentElement.classList.contains("gone");
        });
        return { rows, visible: rows.filter(Boolean).length,
                 label: document.querySelector("#c_geom0").parentElement
                          .querySelector(".lbl").textContent,
                 headingShown: !document.querySelector('#panel h3[data-sec="Geometry"]')
                                  .classList.contains("gone") };
      `);
      eq("exactly one geometry row shows", r.visible, 1, JSON.stringify(r.rows));
      eq("it is named after the scene's own param", r.label, "Hump height");
      check("the Geometry heading shows when a row does", r.headingShown);
      await tab.close();
    });
    await runCase("the Geometry panel hides every row for a scene with no params", async () => {
      // m1 has no declared params at all — a wall-segment scene, not a
      // polygon one — so every one of the six rows should stay hidden, and
      // the section's own heading should not be left fronting an empty list.
      const tab = await browser.open(INDEX + "?scene=m1");
      const r = await tab.evaluate(`
        const rows = [0, 1, 2, 3, 4, 5].map((k) => {
          const input = document.getElementById("c_geom" + k);
          return !input.parentElement.classList.contains("gone");
        });
        return { visible: rows.filter(Boolean).length,
                 headingShown: !document.querySelector('#panel h3[data-sec="Geometry"]')
                                  .classList.contains("gone") };
      `);
      eq("a scene with no params hides every geometry row", r.visible, 0);
      check("a scene with no params hides the Geometry heading too", !r.headingShown);
      await tab.close();
    });
    await runCase("the Geometry panel shows all six rows, and HP-3 narrows it", async () => {
      // hydro declares six params — the whole pool. Every row must show under
      // the scene's own label on the unrestricted scene, while HP-3 narrows
      // that generic scene to the fixed geometry on its revised tutorial
      // sheet and leaves only the gauge-channel selector in Controls.
      const tab = await browser.open(INDEX + "?scene=hydro");
      const r = await tab.evaluate(`
        const rows = [0, 1, 2, 3, 4, 5].map((k) => {
          const el = document.getElementById("c_geom" + k).parentElement;
          return { shown: !el.classList.contains("gone"), label: el.querySelector(".lbl").textContent };
        });
        return { visible: rows.filter((r) => r.shown).length, labels: rows.map((r) => r.label) };
      `);
      eq("a six-param scene shows all six geometry rows", r.visible, 6);
      eq("the fifth row is the shaft width", r.labels[4], "Surge shaft width D_s");
      await tab.close();
      const ex = await browser.open(INDEX + "?ex=HP-3",
        DOCK_READY);
      const c = await ex.evaluate(`
        const f = document.querySelector('#dock input[aria-label="Surge shaft width D_s"]');
        const h = document.querySelector('#panel h3[data-sec="Geometry"]');
        const rows = [...document.querySelectorAll('#panel .row[data-control]')]
          .filter((el) => !el.classList.contains('off') && !el.classList.contains('gone'))
          .map((el) => el.dataset.control);
        return { field: !!f,
                 title: document.querySelector('#dock .extitle').textContent,
                 geomKept: !!h && !h.classList.contains("off") && !h.classList.contains("gone"),
                 rows, gaugeField: APP.state.gaugeField, mode: APP.state.mode,
                 measure: APP.state.ui.measure, fields: APP.state.ui.fields };
      `);
      check("the fixed tutorial has no personalised shaft field", !c.field);
      eq("the revised tutorial title reaches the card", c.title,
         "Hydropower and unsteady flow: test the tutorial predictions");
      check("the fixed tutorial hides Geometry", !c.geomKept);
      eq("only the card's own rows survive in Controls (HP-3 lists Gauges plot and the CV readout)", c.rows.join(","), "cvShow,gaugeField");
      eq("the gauges open on Level eta", c.gaugeField, "eta");
      eq("the field opens on Speed", c.mode, 2);
      eq("the measurement strip keeps the card's tools (rake, gauge, control volume)", c.measure.join(","), "rake,gauge,cv");
      eq("the legend offers only Speed", c.fields.join(","), "speed");
      await ex.close();
    });

    // ------------------------------------------------- placing and removing
    await runCase("an instrument you can place is an instrument you can remove", async () => {
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
    });

    // ------------------------------------------------------------ particles
    await runCase("particles travel at the water's speed, not the wall clock's", async () => {
      const tab = await browser.open(INDEX + "?scene=m2");
      // THE bug: particles were advanced by real elapsed time, while the
      // solver advances by whatever it managed in the frame budget (0.3x real
      // time on m2). They ran about three times too fast — and kept moving
      // with the clock stopped, which is the same fault stated plainly.
      // The control for "frozen": the same measurement while running must show
      // motion, or "moved === 0" below would pass with particles that never move.
      const running = await tab.evaluate(`
        APP.state.particles = true;
        if (APP.state.paused) APP.ui.TOOLBAR.find((g) => g.cap === "RUN")
          .items.find((i) => i.id === "playBtn").el.click();
        APP.frames(30);
        const before = APP.particlePos();
        APP.frames(30);
        const after = APP.particlePos();
        let moved = 0;
        for (let k = 0; k < before.length; k++) {
          if (Math.abs(before[k] - after[k]) > 1e-9) moved++;
        }
        return { moved, n: before.length, paused: APP.state.paused };
      `);
      check("particles are seeded", running.n > 0, running.n + " values");
      check("the clock is running", !running.paused);
      check("particles move when running", running.moved > 0, running.moved + " of " + running.n + " moved");
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
      check("the clock is actually stopped", paused.paused);
      check("there are particles to freeze", paused.n > 0, paused.n + " values");
      eq("a paused clock freezes the particles", paused.moved, 0);
      await tab.close();
    });

    // -------------------------------------------------------- the UI profile
    await runCase("an exercise can narrow the interface, and never lock it", async () => {
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
      eq("a hidden tool's digit selects nothing else", digit, "gauge");   // paired with the toast check below

      // Press 5 under a profile that hides Gauge: the tool must not arm AND the
      // key must say why. A toast naming the tool is the only user-visible
      // difference between "hidden" and "the digit does nothing".
      await tab.evaluate(`APP.UIMODE.apply({ build: false, measure: ["rake"], panel: "focused" });`);
      const hidden = await tab.evaluate(`
        APP.state.tool = "rake";
        document.getElementById("toastTitle").textContent = "";
        dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));   // Gauge, hidden here
        return { tool: APP.state.tool,
                 gaugeOnStrip: [...document.querySelectorAll("#groups .tbtn")]
                                 .some((b) => b.getAttribute("aria-label") === "Gauge"),
                 toast: document.getElementById("toastTitle").textContent };
      `);
      check("Gauge is off the strip under this profile", !hidden.gaugeOnStrip);
      eq("a hidden tool's digit does not arm it", hidden.tool, "rake");
      check("a hidden tool's digit toasts its name", /Gauge/.test(hidden.toast), JSON.stringify(hidden.toast));

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

      // UN-2 starts live, keeps Average available, removes the four
      // irrelevant VIEW toggles, and pares the Controls panel down below the
      // section level: Flow ordinarily contains the whole inlet setup and
      // View contains every overlay, but this card needs only two rows.
      const un2 = await tab.evaluate(`
        APP.pickExercise("UN-2");
        return APP.EX.ready.then(() => {
          const labels = [...document.querySelectorAll("#groups .tbtn")]
                           .map((b) => b.getAttribute("aria-label"));
          const controls = [...document.querySelectorAll("#panel .row[data-control]")]
            .filter((e) => !e.classList.contains("off") && !e.classList.contains("gone"))
            .map((e) => e.dataset.control);
          return { labels, controls, avg: APP.state.avg,
                   active: APP.SIM.avgActive(), narrowed: APP.UIMODE.narrowed() };
        });
      `);
      check("UN-2 starts live", !un2.avg && !un2.active, JSON.stringify(un2));
      check("UN-2 keeps Average in VIEW", un2.labels.includes("Average"));
      check("UN-2 hides the unused VIEW toggles",
            !un2.labels.includes("Particles") && !un2.labels.includes("Dye") &&
            !un2.labels.includes("Open-channel overlay") &&
            !un2.labels.includes("Grade lines"), un2.labels.join(","));
      eq("UN-2 keeps only its two panel controls", un2.controls.sort().join(","),
         "inLevel,speed");
      check("the two-row panel remains liftable", un2.narrowed);

      // UN-1 is a fixed lecturer demo: only gauges, rakes, the field key,
      // particles and the three controls used during the demonstration should
      // be in front of the class. The rake scale is a running maximum, so a
      // slower frame cannot make the profile swell back out.
      const un1 = await tab.evaluate(`
        APP.pickExercise("UN-1");
        return APP.EX.ready.then(() => {
          const labels = [...document.querySelectorAll("#groups .tbtn")]
                           .map((b) => b.getAttribute("aria-label"));
          const controls = [...document.querySelectorAll("#panel .row[data-control]")]
            .filter((e) => !e.classList.contains("off") && !e.classList.contains("gone"))
            .map((e) => e.dataset.control);
          const particlesButtonOn = document.getElementById("partBtn")
            .classList.contains("on");

          const ctx = document.createElement("canvas").getContext("2d");
          const V = { w: 800, X: (x) => x, Y: (z) => 100 - z };
          const sim = { dx: 1, ny: 3 };
          const A = { bed: [0], surf: [3] };
          const rk = { i: 0, buf: new Float32Array(12) };
          // Every rake on ONE scale (px per m/s handed in): the profile's
          // reach is proportional to u, never renormalised to the rake's own
          // maximum — so a slow section draws short and still water flat.
          const paint = (u) => {
            for (let j = 0; j < 3; j++) rk.buf[j * 4] = u;
            let reach = 0;
            const mt = ctx.moveTo.bind(ctx), lt = ctx.lineTo.bind(ctx);
            ctx.moveTo = (x, y) => { reach = Math.max(reach, x); return mt(x, y); };
            ctx.lineTo = (x, y) => { reach = Math.max(reach, x); return lt(x, y); };
            APP.OVERLAY.drawRake(ctx, V, sim, rk, A, 20);
            ctx.moveTo = mt; ctx.lineTo = lt;
            return Math.round(reach - 0.5);       // x0 = 0.5 (cell centre)
          };
          const scale = [paint(2), paint(0.5), paint(3)];

          const gap = APP.SIM.params().decl[0];
          const gapInput = document.getElementById("c_geom0");
          const openRows = () => {
            const i = Math.round(56.5 / APP.sim.dx);
            let n = 0;
            for (let j = Math.floor(2 / APP.sim.dx); j < Math.ceil(5 / APP.sim.dx); j++) {
              if (!APP.sim.mask[j * APP.sim.nx + i]) n++;
            }
            return n;
          };
          const before = openRows();
          gapInput.value = "0.8";
          gapInput.dispatchEvent(new Event("input"));
          const after = openRows();
          return { labels, controls, scale, speed: APP.state.speed,
                   particles: APP.state.particles, particlesButtonOn,
                   sceneParticles: APP.state.scene.particles,
                   gap: { key: gap.key, label: gap.label, value: APP.SIM.params().values[gap.key],
                          before, after } };
        });
      `);
      check("UN-1 has no BUILD family", !un1.labels.includes("Wall") &&
            !un1.labels.includes("Erase"), un1.labels.join(","));
      check("UN-1 keeps gauges and rakes", un1.labels.includes("Gauge") &&
            un1.labels.includes("Rake"), un1.labels.join(","));
      check("UN-1 keeps only the field key and particles in VIEW",
            un1.labels.includes("Field & legend") &&
            un1.labels.includes("Particles") && !un1.labels.includes("Dye") &&
            !un1.labels.includes("Open-channel overlay") &&
            !un1.labels.includes("Grade lines") && !un1.labels.includes("Average"),
            un1.labels.join(","));
      check("UN-1 inherits the hammer scene's particle default",
            un1.sceneParticles === 1 && un1.particles, JSON.stringify(un1));
      check("UN-1 visibly lights the Particles button", un1.particlesButtonOn);
      eq("UN-1 keeps only speed, celerity and nozzle controls",
         un1.controls.sort().join(","), "cel,geom0,speed");
      eq("UN-1 starts at two-hundredths speed", un1.speed, 0.02);
      eq("the hammer geometry declares the nozzle slider", un1.gap.key,
         "nozzle_gap");
      eq("the nozzle slider is plainly labelled", un1.gap.label, "Nozzle width");
      check("widening the nozzle opens more cells", un1.gap.after > un1.gap.before,
            JSON.stringify(un1.gap));
      eq("every rake shares one velocity scale (reach ∝ u at 20 px per m/s)", un1.scale.join(","),
         "40,10,60");
      await tab.close();
    });

    // ------------------------------------------------- the narrow fallback
    await runCase("a narrow window overlays the panel instead of insetting it", async () => {
      const narrow = await launchTracked({ width: 760, height: 720 });
      try {
        const tab = await narrow.open(INDEX + "?ex=HJ-1",
          DOCK_READY);
        const p = await tab.evaluate(PROBE);
        check("the panel is still open", p.dockOpen);
        check("it overlays", p.dockOver);
        eq("nothing is taken out of the viewport", p.dockVar, 0);
        eq("the canvas keeps the whole window", p.canvasW, p.innerW);
        // At this width twenty controls genuinely do not fit, and the strip is
        // built to SCROLL rather than to drop one. What must hold is that
        // every control is still reachable. HJ-1's own profile is short enough
        // to fit, so ⋯ first: the whole strip is what has to cope.
        check("the strip compacted itself", await tab.evaluate(
          `APP.UIMODE.lift();
           return document.getElementById("bar").classList.contains("tighter");`));
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
    });
    // ------------------------------------------------------- the fitted view
    await runCase("the view is fitted to the window, not left at 1:1", async () => {
      const tab = await browser.open(INDEX + "?scene=m3");
      const v = await tab.evaluate(`
        const fill = () => Math.round(100 * APP.view.h / APP.view.pxH);
        return { vex: APP.state.vex, auto: APP.state.vexAuto, fill: fill() };
      `);
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
    });

    await runCase("a scene that states its own exaggeration keeps it", async () => {
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
      // No scene pinning a vex is a failure, not a skip: the scenes that do
      // are what this case exists to protect.
      check("some scene declares view.vex", !!scene);
      if (scene) {
        const tab = await browser.open(INDEX + "?scene=" + scene.id);
        const r = await tab.evaluate("return { vex: APP.state.vex, auto: APP.state.vexAuto };");
        eq("the scene's own vex is used (" + scene.id + ")", r.vex, scene.vex);
        check("the automatic fit stands down", !r.auto);
        await tab.close();
      }
    });

    // ----------------------------------------------------------- the digits
    // Through the real keydown path, not by setting state: worksheets say
    // "press 5", so the key itself is the contract.
    await runCase("a digit arms the tool it numbers", async () => {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        APP.state.tool = "wall";
        dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
        return { tool: APP.state.tool, want: APP.TOOLS[4][0] };
      `);
      eq("the fifth tool is Gauge", r.want, "gauge");
      eq("digit 5 arms the Gauge tool", r.tool, "gauge");
      await tab.close();
    });

    // --------------------------------------------------------- the keymap
    // One KEYMAP describes every key (js/keymap.js); typing, chords and
    // auto-repeat never fire a shortcut.
    await runCase("typing in the rig box fires no shortcut", async () => {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const S = APP.sim;
        S.segs.push([1, 1, 2, 1, 0.05, 0]);
        const before = S.segs.length, paused = APP.state.paused;
        const box = document.querySelector(".rigtx");
        if (!box) return { noBox: true };
        box.focus();
        for (const key of ["c", "r", " ", "5", "a"]) {
          box.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        }
        return { before, after: S.segs.length, paused: APP.state.paused,
                 wasPaused: paused, tool: APP.state.tool, avg: APP.state.avg };
      `);
      check("the rig textarea exists", !r.noBox);
      eq("C in the rig box does not clear the drawing", r.after, r.before);
      eq("space in the rig box does not pause", r.paused, r.wasPaused);
      check("a digit or A in the rig box arms nothing", r.tool !== "gauge" && !r.avg, JSON.stringify(r));
      await tab.close();
    });

    await runCase("Ctrl+V does not toggle the valves", async () => {
      const tab = await browser.open(INDEX + "?scene=dyke");
      const r = await tab.evaluate(`
        const before = APP.sim.p.valveClosed;
        dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
        dispatchEvent(new KeyboardEvent("keydown", { key: "v", metaKey: true, bubbles: true }));
        const chord = APP.sim.p.valveClosed;
        dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
        return { before, chord, plain: APP.sim.p.valveClosed };
      `);
      eq("Ctrl/Cmd+V leaves the valve alone", r.chord, r.before);
      check("a plain V still toggles it", r.plain !== r.before, JSON.stringify(r));
      await tab.close();
    });

    await runCase("held A does not flicker Average", async () => {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
        dispatchEvent(new KeyboardEvent("keydown", { key: "a", repeat: true, bubbles: true }));
        return { avg: APP.state.avg };
      `);
      eq("the auto-repeat of A is ignored", r.avg, true);
      await tab.close();
    });

    await runCase("every TOOLBAR key is in KEYMAP and no key is claimed twice", async () => {
      const tab = await browser.open(INDEX + "?scene=sandbox");
      const r = await tab.evaluate(`
        const norm = (k) => (k === "space" ? " " : String(k).toLowerCase());
        const rows = KEYMAP.map((x) => x.key);
        const strip = APP.ui.TOOLBAR.flatMap((g) => g.items).map((i) => i.key).filter(Boolean);
        return { missing: strip.filter((k) => !rows.includes(norm(k))),
                 dup: rows.filter((k, i) => rows.indexOf(k) !== i),
                 digits: rows.filter((k) => /^[1-9]$/.test(k)).length, want: APP.TOOLS.length };
      `);
      eq("every strip key has a KEYMAP row", JSON.stringify(r.missing), "[]");
      eq("no key is claimed twice", JSON.stringify(r.dup), "[]");
      eq("one digit row per reachable tool", r.digits, Math.min(9, r.want));
      await tab.close();
    });

    await runCase("the keyboard sheet lists S only when scenes are offered", async () => {
      const tab = await browser.open(INDEX + "?ex=HJ-1");
      const r = await tab.evaluate(`
        const kbds = () => [...document.querySelectorAll("#keysmenu kbd")].map((k) => k.textContent);
        return APP.EX.ready.then(() => {
          APP.ui.KEYS.open();
          const locked = kbds();
          APP.ui.KEYS.close();
          APP.UIMODE.lift();
          APP.ui.KEYS.open();
          return { locked, lifted: kbds() };
        });
      `);
      check("S is absent while the card owns the scene", !r.locked.includes("S"), r.locked.join(" "));
      check("S appears once the interface is lifted", r.lifted.includes("S"), r.lifted.join(" "));
      check("the sheet lists the zoom and Esc keys it used to omit",
            r.lifted.includes("+ / −") && r.lifted.includes("Esc"), r.lifted.join(" "));
      await tab.close();
    });

    // ------------------------------------------------------- touch parity
    await runCase("everything reachable without a keyboard or a second button", async () => {
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
                 want: Math.min(9, ids.length),
                 labels };
      `);
      check("Pour is a tool", r.hasPour);
      eq("and the strip arms it", r.armed, "pour");
      check("Undo is a button, not only the Z key", r.hasUndo);
      // The digits address at most nine tools; a tenth must not shadow one.
      eq("exactly min(9, tools) strip buttons carry a digit", r.digits, r.want);
      await tab.close();
    });

    // --------------------------------------------------------- phone sizes
    await runCase("a phone gets a bottom sheet, not a side panel", async () => {
      // Chrome will not open a window narrower than ~500 css px, which is
      // still inside the phone branch (< 620).
      const phone = await launchTracked({ width: 420, height: 880 });
      try {
        const tab = await phone.open(INDEX + "?ex=HJ-1",
          DOCK_READY);
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
    });

    // ----------------------------------------------------------------- tablets
    // An iPad, emulated: a mobile viewport at devicePixelRatio 2 with touch
    // input, driven by real touch events (Input.dispatchTouchEvent). The
    // lecturer touched an exercise to read it and it drew a block: the default
    // tool was Wall even where the card hides BUILD.
    await runCase("a tablet reads the water by touch and never draws by accident", async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      async function tablet(url, w, h) {
        const tab = await browser.open(url);
        await tab.send("Emulation.setDeviceMetricsOverride",
                       { width: w, height: h, deviceScaleFactor: 2, mobile: true });
        await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        await tab.send("Page.reload", { ignoreCache: true });
        await sleep(300);
        for (let i = 0; ; i++) {
          let ok = false;
          try { ok = await tab.evaluate("return !!window.APP && !!document.querySelector('#groups .tbtn');"); }
          catch (_) { /* still navigating */ }
          if (ok) break;
          if (i > 200) throw new Error("tablet tab did not boot: " + url);
          await sleep(150);
        }
        await tab.evaluate("return APP.EX.ready ? APP.EX.ready.then(() => true) : true;");
        await tab.evaluate("APP.frames(5); return true;");
        return tab;
      }
      const touch = (tab, type, pts) => tab.send("Input.dispatchTouchEvent",
        { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      async function tap(tab, x, y) {
        await touch(tab, "touchStart", [[x, y]]);
        await sleep(40);
        await touch(tab, "touchEnd", []);
        await sleep(200);                 // past the touch hold (TOUCH_HOLD_MS)
      }
      // A point in the water, in CSS pixels: scan a column for a full cell.
      const WET = `
        const W = APP.sim.W, H = APP.sim.H;
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) for (let k = 1; k < 40; k++) {
          const x = W * fx, z = H * k / 40, p = APP.probe(x, z);
          if (p && p.f > 0.9 && p.f < 1.05) {
            const cv = document.getElementById("view"), r = cv.getBoundingClientRect();
            const px = [r.left + APP.view.X(x), r.top + APP.view.Y(z)];
            if (document.elementFromPoint(px[0], px[1]) === cv) return px;
          }
        }
        return null;`;

      const tab = await tablet(INDEX + "?ex=FF-1", 768, 1024);
      const before = await tab.evaluate(`return { tool: APP.state.tool,
        segs: (APP.sim.segs || []).length, build: !!document.getElementById("undoBtn") };`);
      eq("an exercise opens with nothing in hand", before.tool, null);
      check("FF-1 offers no BUILD (the case that drew)", !before.build);
      const at = await tab.evaluate(WET);
      check("found the water on screen", !!at);
      await tap(tab, at[0], at[1]);
      await tab.evaluate("APP.frames(4); return true;");
      const after = await tab.evaluate(`return { segs: (APP.sim.segs || []).length,
        pin: APP.state.pin, ptr: APP.state.ptr };`);
      eq("a touch tap creates no geometry", after.segs, before.segs);
      eq("the tap was a touch", after.ptr, "touch");
      check("a tap pins the readout where it landed", !!after.pin);
      // A second tap on the pin takes it away; so does a tap on dry ground.
      await tap(tab, at[0], at[1]);
      const gone = await tab.evaluate("return APP.state.pin;");
      eq("a tap on the pin clears it", gone, null);
      await tap(tab, at[0], at[1]);
      // Dry ground: air over the water, at a point the canvas itself is under
      // (not the strip or the legend, which float over the top of the view).
      const dry = await tab.evaluate(`
        const cv = document.getElementById("view"), r = cv.getBoundingClientRect();
        for (const fx of [0.3, 0.5, 0.15, 0.7]) for (let k = 39; k > 0; k--) {
          const x = APP.sim.W * fx, z = APP.sim.H * k / 40, p = APP.probe(x, z);
          const px = [r.left + APP.view.X(x), r.top + APP.view.Y(z)];
          if (p && p.f < 0.01 && document.elementFromPoint(px[0], px[1]) === cv) return px;
        }
        return null;`);
      check("found dry ground on screen", !!dry);
      await tap(tab, dry[0], dry[1]);
      eq("a tap on dry ground clears it", await tab.evaluate("return APP.state.pin;"), null);
      // The card fits a portrait iPad: a bottom sheet inside the viewport,
      // the strip's every button a finger's width and on screen.
      const fit = await tab.evaluate(`
        const d = document.getElementById("dock"), r = d.getBoundingClientRect();
        const body = d.querySelector(".dock-body");
        const btns = [...document.querySelectorAll("#groups .tbtn")].map((b) => b.getBoundingClientRect());
        return { sheet: d.classList.contains("sheet"), open: d.classList.contains("open"),
                 inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
                 scrolls: getComputedStyle(body).overflowY,
                 small: btns.filter((b) => b.width > 0 && (b.width < 40 || b.height < 40)).length,
                 off: btns.filter((b) => b.left < 0 || b.right > innerWidth || b.top < 0).length,
                 pageW: document.documentElement.scrollWidth, iw: innerWidth };`);
      check("the card is open as a bottom sheet at 768 × 1024", fit.open && fit.sheet);
      check("and sits inside the viewport", fit.inside);
      eq("its body scrolls", fit.scrolls, "auto");
      eq("every strip button is at least 40 px", fit.small, 0);
      eq("and on screen", fit.off, 0);
      eq("nothing overflows sideways", fit.pageW, fit.iw);
      await tab.close();

      // A pinch is not a tool action: with the Gauge tool in hand, two
      // fingers zoom and place nothing.
      const t2 = await tablet(INDEX + "?ex=VC-2", 1024, 768);
      const g0 = await t2.evaluate(`APP.state.tool = "gauge"; return { n: APP.state.gauges.length, z: APP.state.zoom };`);
      const c = await t2.evaluate(WET);
      // Both fingers in one event: the first finger's pointerdown is still
      // held (TOUCH_HOLD_MS) when the second arrives, which is the case that
      // used to place a gauge. Two separate CDP calls can take longer than
      // the hold in a loaded headless browser, which is not a pinch.
      await touch(t2, "touchStart", [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
      for (let k = 1; k <= 6; k++) {
        await touch(t2, "touchMove", [[c[0] - 30 - 12 * k, c[1]], [c[0] + 30 + 12 * k, c[1]]]);
        await sleep(20);
      }
      await touch(t2, "touchEnd", []);
      await sleep(200);
      const g1 = await t2.evaluate("return { n: APP.state.gauges.length, z: APP.state.zoom };");
      eq("a pinch places no gauge", g1.n, g0.n);
      check("and zooms", g1.z > g0.z * 1.2, "zoom " + g0.z + " → " + g1.z);
      await t2.close();
    });

    // ------------------------------------------------------- embedded in an LMS
    await runCase("an embedded exercise keeps the water", async () => {
      // 800 x 600 is inside the 700-1000 px band a module page's content
      // column actually offers (docs/design/2026-09-10-embed-design.md).
      const embed = await launchTracked({ width: 800, height: 600 });
      try {
        const tab = await embed.open(INDEX + "?ex=HJ-1&embed=1");
        // `pickExercise` lands its rig a microtask later, so wait for the
        // pick before asking anything about the card or the water.
        await tab.evaluate("return APP.EX.ready.then(() => true);");
        await tab.evaluate("APP.frames(10); return true;");
        const p = await tab.evaluate(`
          const dock = document.getElementById("dock");
          const dockTab = document.getElementById("docktab");
          const c = document.getElementById("view");
          const cs = getComputedStyle(document.documentElement);
          return {
            embed: APP.embed,
            dockOpen: dock.classList.contains("open"),
            tabShown: dockTab.classList.contains("show"),
            tabKind: dockTab.querySelector(".kind").textContent,
            canvasW: c.clientWidth, innerW: window.innerWidth,
            dockVar: parseFloat(cs.getPropertyValue("--dock")) || 0,
            popBtn: !!document.getElementById("popBtn"),
            fsBtn: !!document.getElementById("fsBtn"),
            fsEnabled: !!document.fullscreenEnabled,
          };
        `);
        check("APP.embed is true", p.embed === true);
        // Fold on land (docs/design/2026-09-10-embed-design.md §1): the brief lives on the page around the
        // frame, so the card starts parked on its edge tab.
        check("the dock is not open", !p.dockOpen);
        check("the reopen tab is shown", p.tabShown);
        eq("the tab says what it opens, not what it is", p.tabKind, "open instructions");
        // THE invariant this whole case exists to guard: folded, the water
        // takes the full frame rather than sitting behind an inset panel.
        eq("the canvas keeps the whole frame", p.canvasW, p.innerW);
        eq("no width is given away to the panel", p.dockVar, 0);
        check("the pop-out button is on the strip", p.popBtn);
        eq("the full-screen button follows what the browser allows", p.fsBtn, p.fsEnabled);

        // The wheel yields to the page (spec's "wheel policy"): a plain wheel
        // over the water must not zoom and must not be default-prevented, or
        // an iframe would eat the scroll gesture the parent page needs.
        // Ctrl + wheel (and a trackpad pinch, which reports the same flag)
        // still zooms — that is the way out of the small frame.
        const wheel = await tab.evaluate(`
          const c = document.getElementById("view");
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const before = JSON.stringify(APP.view);
          const plain = new WheelEvent("wheel", { deltaY: -120, bubbles: true,
            cancelable: true, clientX: cx, clientY: cy });
          c.dispatchEvent(plain);
          const afterPlain = JSON.stringify(APP.view);
          const ctrl = new WheelEvent("wheel", { deltaY: -120, bubbles: true,
            cancelable: true, clientX: cx, clientY: cy, ctrlKey: true });
          c.dispatchEvent(ctrl);
          const afterCtrl = JSON.stringify(APP.view);
          return { before, afterPlain, afterCtrl,
                   plainPrevented: plain.defaultPrevented, ctrlPrevented: ctrl.defaultPrevented };
        `);
        eq("a plain wheel leaves the view untouched", wheel.afterPlain, wheel.before);
        check("and is left to the page", !wheel.plainPrevented);
        check("ctrl + wheel zooms", wheel.afterCtrl !== wheel.afterPlain);
        check("and is handled here, not the page", wheel.ctrlPrevented);

        // The x on the opened card folds it instead of hiding it — embedded,
        // there is no strip Exercises button to bring the brief back from.
        const closed = await tab.evaluate(`
          APP.ui.DOCK.fold(false);
          document.querySelector('#dock [data-a="close"]').click();
          return { dockOpen: document.getElementById("dock").classList.contains("open"),
                   tabShown: document.getElementById("docktab").classList.contains("show") };
        `);
        check("the x folds the card rather than hiding it",
              !closed.dockOpen && closed.tabShown, JSON.stringify(closed));
        await tab.close();
      } finally { await embed.close(); }
    });
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

main().catch((e) => { console.error("\n" + (e.stack || e)); process.exit(1); });
