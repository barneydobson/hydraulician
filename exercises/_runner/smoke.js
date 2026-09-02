#!/usr/bin/env node
/**
 * smoke.js — boot the real app in a real browser and assert its contracts.
 *
 * Zero dependencies (node >= 22: global fetch and WebSocket), so it runs the
 * same on the three platforms the project is used on. It is the counterpart
 * to check_notation.py: that one greps for names, this one proves the names
 * are WIRED — a field that was renamed at the write site but not the read
 * site greps clean and returns undefined here.
 *
 * What it asserts, in order of how loudly it fails:
 *
 *   API      probe/analyse/findJumps/boxForce/gauge records carry the
 *            notation's field names, and NOT the retired ones
 *   RIG      the wire format round-trips at the current version, and an
 *            older one is refused rather than silently half-loaded
 *   PHYSICS  volume is conserved, hydrostatic water stays put, no NaN
 *            reaches the field, and a jump still reads its conjugates
 *   SCENES   every scene boots and steps
 *   PACK     every exercise applies its rig and lands on its scene
 *
 * Usage:  node exercises/_runner/smoke.js [--keep] [--only=api,rig,...]
 *         --keep leaves the browser open on failure for a look.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 8731 + (process.pid % 200);          // out of the way of a dev server
const CDP_PORT = PORT + 1;
const KEEP = process.argv.includes("--keep");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .replace("--only=", "").split(",").filter(Boolean);

/** --mutate=<id> patches ONE known bug into a served file, in flight, so the
 *  suite can be watched going red. It is the GPU half of test/mutation-test.mjs:
 *  the same negative-control practice that caught eleven assertions which
 *  passed while asserting nothing, for the shader and sim code that harness
 *  cannot reach without a browser.
 *
 *  Never touches the working tree — `serve()` rewrites the bytes on their way
 *  out. The manual version of this required editing a file and restoring it,
 *  and one implementer had to restore from a byte-exact copy and diff to be
 *  sure nothing was left behind.
 *
 *  Not a gate: each run costs a full boot (~4 min for --only=avg), so this is
 *  run deliberately, one at a time. `measured` is what was actually observed
 *  when the control was performed by hand.
 *
 *      node exercises/_runner/smoke.js --only=avg --mutate=favre-reynolds
 *
 *  Expect the named assertion to FAIL. If it passes, that assertion is not
 *  guarding what it claims to guard. */
const GPU_MUTANTS = [
  { id: "favre-reynolds", file: "/js/shaders.js",
    why: "FS_ACC stores the plain velocity, so the mean is Reynolds, not Favre",
    find: "vec4 phi = vec4(f * uc, f * wc, f, U.b);",
    replace: "vec4 phi = vec4(uc, wc, f, U.b);",
    kills: "avg Favre mean, not Reynolds",
    measured: "dFavre 2e-7 -> 3.46e-2 against a 1.15e-3 bound. Note a NEARNESS "
            + "comparison does not catch this — ubar stayed nearer Favre in 25/25 "
            + "cells; the shipped gate asserts agreement" },

  { id: "collocation-west-face", file: "/js/shaders.js",
    why: "f weighted by the west-face velocity instead of the cell-centred one",
    find: "float uc = 0.5 * (U.r + texelFetch(u_U, CL(c + ivec2(1,0)), 0).r);",
    replace: "float uc = U.r;",
    kills: "avg collocation",
    measured: "run end to end: ubar lands ON the face value — dFace 3.3e-6 "
            + "against dCentred 3.35e-1. The Favre assertion fires too, as a "
            + "real consequence: dFavre 4.27e-2 against a 9.0e-4 bound" },

  { id: "welford-naive", file: "/js/shaders.js",
    why: "the column accumulator's second moment loses its time weight",
    find: "o = vec4(dN, qN, eN, A.w + u_dt * (C.w - eO) * (C.w - eN));",
    replace: "o = vec4(dN, qN, eN, A.w + (C.w - eO) * (C.w - eN));",
    kills: "avg sigma_eta",
    measured: "a finite-only check stayed GREEN against this; the shipped gate "
            + "compares against an independent float64 Welford, 4.8e-6 vs 1.6e-2" },

  { id: "ynk-ema-not-bypassed", file: "/js/overlay.js",
    why: "the averaged path re-runs the global normal-depth EMA, averaging an average",
    find: "      if (AVG) S._ynK = k;",
    replace: "      if (AVG) S._ynK = isFinite(S._ynK) ? S._ynK + EMA * (k - S._ynK) : k;",
    kills: "H2c",
    measured: "two successive 6% steps toward the clean value: k lands at "
            + "0.0696/0.0737 against a clean 0.1377" },

  { id: "rescale-no-reset", file: "/js/sim.js",
    why: "the celerity slider rewrites f under the window with no reset",
    find: "    // at the old one.\n    if (S.avg) avgReset();",
    replace: "    // at the old one.",
    // Names the assertion this actually breaks. It used to say "F1 transport
    // residual", which is a literal PREFIX of a different assertion that runs
    // before celerity is ever touched and is untouched by this mutant — so a
    // reader grepping the failures for the kills text found nothing and could
    // conclude the guard was dead.
    kills: "avg a celerity change resets the window",
    measured: "c 22 -> 11 gives a residual of 4.13e-1 against a 1.28e-3 bound, 323x over" },

  { id: "disp-tent-live", file: "/js/shaders.js",
    why: "the display pass's 3x3 tent average reads the LIVE fill under a mean field",
    find: "      fs += w * fAt(ivec2(g) + ivec2(dx, dy)).r;",
    replace: "      fs += w * texelFetch(u_F, CLg(ivec2(g) + ivec2(dx, dy)), 0).r;",
    kills: "avg the water is painted where the MEAN fill is",
    measured: "the luminance centroid stops moving between the two renders: "
            + "409.7 -> 408.6 rows, a gap of 1.1 against a clean 115.0, on a "
            + "705 px canvas. The 1.1 that survives is blF's own share, which "
            + "was already avg-aware -- so the tent drives 99% of the signal" },

  { id: "disp-vort-live", file: "/js/shaders.js",
    why: "the vorticity stencil reads the LIVE velocity under a mean field",
    find: "    float dwdx = uAt(gi + ivec2(1,0)).g - uAt(gi - ivec2(1,0)).g;\n"
        + "    float dudz = uAt(gi + ivec2(0,1)).r - uAt(gi - ivec2(0,1)).r;",
    replace: "    float dwdx = texelFetch(u_U, gi + ivec2(1,0), 0).g - texelFetch(u_U, gi - ivec2(1,0), 0).g;\n"
           + "    float dudz = texelFetch(u_U, gi + ivec2(0,1), 0).r - texelFetch(u_U, gi - ivec2(0,1), 0).r;",
    kills: "avg the vorticity view paints the spin OF the mean flow",
    measured: "R-B is 72.68 in BOTH renders -- bit-identical, not merely near "
            + "-- against a clean 72.68 -> -59.73" },

  { id: "disp-froude-live-depth", file: "/js/shaders.js",
    why: "the Froude view divides by the LIVE column depth instead of the mean <d>",
    find: "  float dep = u_avg > 0.5",
    replace: "  float dep = false",
    kills: "avg the Froude view divides by the MEAN depth",
    measured: "R-B is 72.68 in both renders against a clean 72.68 -> -72.97: "
            + "the mean render stays supercritical on the live 20 mm depth" },

  { id: "fieldstats-fits-live", file: "/js/sim.js",
    why: "the legend's Fit reads the live field while the mean is on screen",
    find: "    const A = avg && S.avg;",
    replace: "    const A = false;",
    kills: "avg Fit reads the MEAN field, not the instant behind it",
    measured: "Fit lands on the LIVE percentile: the relative gap to the CPU "
            + "mean reference goes from 0.00e0 to 1.69e-1, the whole separation "
            + "between the two distributions, and the wet-cell count with it "
            + "(11893 -> 11414)" },

  { id: "spinup-no-reset", file: "/js/main.js",
    why: "the averaging window runs straight through the end of spin-up",
    find: "    if (wasWarming && !warming) SIM.avgReset();",
    replace: "    if (false && wasWarming && !warming) SIM.avgReset();",
    kills: "avg the end of spin-up restarts the window",
    measured: "T climbs monotonically to 1.198 s across the crossing, 0 drops, "
            + "against a clean drop from 0.402 s at sim t = 0.407 s" },

  { id: "spinup-reset-every-frame", file: "/js/main.js",
    why: "the spin-up reset fires on the STATE rather than on the edge",
    find: "    if (wasWarming && !warming) SIM.avgReset();",
    replace: "    if (!warming) SIM.avgReset();",
    kills: "avg and does it once, not on every frame after",
    measured: "T is zeroed on every frame once spin-up ends, so no window ever "
            + "starts: 9 drops against 1, and endT 5.3e-4 s against a clean "
            + "0.79 s -- one frame's worth, not a window" },

  { id: "mode-switch-no-reset", file: "/js/main.js",
    why: "a Live/Average switch leaves the overlay's temporal estimates standing",
    find: "  OVERLAY.resetEstimates(sim);\n  LEGEND.sync(); syncPanel(); syncToolbar();",
    replace: "  LEGEND.sync(); syncPanel(); syncToolbar();",
    kills: "avg both Live/Average transitions drop the overlay's temporal estimates",
    measured: "_hA survives both directions, so each mode inherits the other's EMA" },

  { id: "setvalve-no-reset", file: "/js/sim.js",
    why: "a valve toggle changes the solid set with no reset, so frozen cells resume mid-window",
    find: "    S.p.valveClosed = v;\n    if (S.avg) avgReset();",
    replace: "    S.p.valveClosed = v;",
    kills: "avg a valve toggle resets the window",
    measured: "T runs straight through the toggle instead of returning to zero" },

  // -------- RECON-vs-GLSL differential mutants (closing the mirror gap) --------
  { id: "col-wet-threshold", file: "/js/shaders.js",
    why: "FS_COL's dry test is loosened, so interface cells RECON still counts as wet " +
         "(f in [0.25, 0.55)) get walked past as dry",
    find: "if (f < 0.25) { dry++; if (dry > 2) break; continue; }",
    replace: "if (f < 0.55) { dry++; if (dry > 2) break; continue; }",
    kills: "RECON vs FS_COL bed/depth",
    measured: "depth OK drops from 459/459 to 324/459; worst depth gap 1.66e-1 m against a " +
            "1e-5 m gate, four orders of magnitude over -- bed stays exact (7.2e-8 m) because " +
            "only the WET walk moved, not the bed search" },

  { id: "acol-weight-denominator", file: "/js/shaders.js",
    why: "FS_ACOL's running-mean weight drops dt from its own denominator (h/T instead of h/(T+h))",
    find: "vec4 C = texelFetch(u_C, c, 0);        // (bed, d, q, top)\n  float k = u_dt / max(u_T + u_dt, 1e-9);",
    replace: "vec4 C = texelFetch(u_C, c, 0);        // (bed, d, q, top)\n  float k = u_dt / max(u_T, 1e-9);",
    kills: "FS_ACOL's running mean matches RECON.accumStep",
    measured: "the recursion blows up (T never appears in its own denominator's history): " +
            "dD 1.17e4, dE 2.38e4 against a 5e-6 gate, and it collaterally breaks avgColumns() " +
            "everywhere downstream -- dbar/d ratio -1759 instead of ~1, sigma_eta reads 0" },

  { id: "acol-channel-swap", file: "/js/shaders.js",
    why: "FS_ACOL writes qbar and etabar into each other's channels",
    find: "o = vec4(dN, qN, eN, A.w + u_dt * (C.w - eO) * (C.w - eN));",
    replace: "o = vec4(dN, eN, qN, A.w + u_dt * (C.w - eO) * (C.w - eN));",
    // The assertion that actually fails names neither "aeration" nor "gap";
    // the one that does contain those words is a finiteness check, which a
    // wrong-but-finite number survives.
    kills: "the surface line and the mean depth agree to a few cells",
    measured: "worst |delta_a| 3.30e-1 m (20 cells) against an 8-cell gate, because the surface " +
            "channel now holds the discharge; it also collaterally kills the accumulator-weight " +
            "synthetic check (dE 1.00, dSigma 0.96 against 5e-6 gates) since that test reads the " +
            "same eta channel" },

  { id: "rig-no-flux", file: "/js/rig.js",
    why: "RIG.snapshot() drops the flux array — the actual gap this review closed",
    find: "      flux: state.flux.map((L) => [r4(L.x0), r4(L.z0), r4(L.x1), r4(L.z1)]),\n",
    replace: "",
    kills: "rig flux sections round-trip",
    measured: "before [[11.2,...],[13.6,...]] -> after [] (snapLen 0): both sections vanish outright, " +
            "not merely drift" },

  { id: "rig-no-cvshow", file: "/js/rig.js",
    why: "RIG.snapshot() drops ui.cvShow — the other half of the gap this review closed",
    find: "            cvShow: state.cvShow,\n",
    replace: "",
    kills: "rig cvShow round-trips",
    measured: "before M -> after Q: the scramble value survives the round trip untouched" },

  { id: "rig-no-gauges-restore", file: "/js/rig.js",
    why: "RIG.apply() stops restoring gauges from the snapshot",
    find: "    (o.gauges || []).slice(0, 4).forEach((g) => {",
    replace: "    ([]).slice(0, 4).forEach((g) => {",
    kills: "rig gauges round-trip",
    measured: "before [[4.8,...],[9.6,...]] -> after []: both gauges vanish outright" },

  { id: "rig-new-unmapped-placer", file: "/js/main.js",
    why: "a FIFTH place* API appears on APP with nobody having taught the rig " +
         "coverage test where it lives — the exact shape of gap the reflection check exists for",
    find: "  placeCV,                                 // the control volume, headless",
    replace: "  placeCV, placeFoo: () => {},             // the control volume, headless",
    kills: "rig's coverage test is not silently missing a placement API",
    measured: "placers: placeGauge,placeRake,placeCV,placeFoo,placeFlux -- unmapped: placeFoo. " +
            "The reflection genuinely notices a place* function nobody taught this test about, " +
            "and fails instead of silently skipping it." },
];

const MUTATE = (process.argv.find((a) => a.startsWith("--mutate=")) || "")
  .replace("--mutate=", "");
const MUTANT = MUTATE ? GPU_MUTANTS.find((m) => m.id === MUTATE) : null;
if (MUTATE && !MUTANT) {
  console.error("no such mutation: " + MUTATE + "\nknown: "
    + GPU_MUTANTS.map((m) => m.id).join(", "));
  process.exit(2);
}
if (MUTANT) console.log("MUTATION " + MUTANT.id + " — " + MUTANT.why
  + "\nexpect to fail: " + MUTANT.kills + "\nmeasured by hand: " + MUTANT.measured + "\n");

const CHROMES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".png": "image/png", ".json": "application/json", ".md": "text/plain" };

/**
 * ANGLE backend for headless Chrome's GPU-backed rasteriser, chosen by
 * platform: `d3d11` and `metal` are real GPU backends but exist only on
 * Windows and macOS respectively. Software (SwiftShader, `--disable-gpu`)
 * renders a full-window WebGL canvas so slowly that a spin-up scene times
 * the run out — measured on scene m1 at Low, 828x64: ANGLE reaches sim
 * t=30s in 6.5s of wall clock; SwiftShader reaches only t~9.5s in a 150s
 * budget, roughly 50x slower. That gap is what made `--only=physics` fail
 * here: the reach never settled, and the unsettled reading got misreported
 * as a discharge inconsistency below.
 *
 * Linux gets `gl`, not `vulkan`: ANGLE's Vulkan backend needs a working
 * Vulkan ICD on the host, which a generic Linux box (and most CI runners)
 * does not reliably have, whereas the GL backend talks to Mesa — present on
 * essentially every Linux desktop and server install, real GPU or not — and
 * is the path most headless-Chrome-on-Linux deployments already exercise.
 * `gl` is the safer default; a maintainer who has confirmed Vulkan drivers
 * can opt in with `$ANGLE=vulkan`.
 *
 * `$ANGLE` overrides the platform pick, the same way `$CHROME_PATH` above
 * overrides the browser binary. `$SOFTWARE=1` asks for the old
 * `--disable-gpu` behaviour, for a machine with no working GPU backend.
 *
 * Duplicated (not shared) from test/cdp.mjs's angleArgs(): that file is an
 * ES module and this one is CommonJS, and with no package.json in this
 * zero-dependency project neither can `import`/`require` a file written for
 * the other's module system without an extension trick or an async interop
 * shim — more moving parts than these ~10 lines are worth. Keep the two
 * copies in sync by hand if the policy ever changes.
 */
function angleArgs() {
  if (process.env.SOFTWARE) return ["--disable-gpu"];
  const byPlatform = { win32: "d3d11", darwin: "metal", linux: "gl" };
  const backend = process.env.ANGLE || byPlatform[process.platform] || "gl";
  return ["--use-angle=" + backend];
}

let passed = 0;
const failures = [];

/** Page-side helpers, injected once per navigation.
 *
 *  `__low()` drops to the smallest grid: this harness runs on SwiftShader in
 *  CI, where Medium is ~10× too slow to settle a scene inside a test. The
 *  physics being asserted (mass conservation, hydrostatic rest, a jump that
 *  obeys momentum) is resolution-independent — only the delivered roughness
 *  is not, and nothing here measures that.
 *
 *  `__settle(t, ms)` advances to `t` seconds of SIMULATED time but gives up
 *  after `ms` of wall clock, reporting what it reached. A test that reports
 *  "settled to 12 s of 25" is debuggable; one that hangs is not. */
const HELPERS = `
  window.__low = () => {
    const c = CONTROLS.find((x) => x.id === "budget");
    if (c && APP.state.budget !== "Low") { c.set("Low"); }
    return { nx: APP.sim.nx, ny: APP.sim.ny, dx: APP.sim.dx };
  };
  window.__settle = (target, ms) => {
    const t0 = Date.now();
    while (APP.sim.t < target && Date.now() - t0 < ms) APP.tick(200);
    return APP.sim.t;
  };
  window.__warm = (n) => {
    let A;
    for (let i = 0; i < (n || 20); i++) A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    return A;
  };
`;

function ok(name, cond, detail) {
  if (cond) { passed++; return true; }
  failures.push(name + (detail === undefined ? "" : "\n      " + detail));
  return false;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- harness
function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      if (MUTANT && p === MUTANT.file) {
        // Normalised to LF before matching, and served that way. A catalogue
        // entry spanning two lines is written with "\n" and git hands a
        // Windows checkout CRLF, so on Windows EVERY multi-line pattern
        // reported itself STALE and no negative control could be run at all.
        // The browser does not care which it gets.
        const before = data.toString("utf8").replace(/\r\n/g, "\n");
        // A pattern that no longer matches would serve untouched source and
        // let the suite pass, reporting success while testing nothing — the
        // exact failure this mechanism exists to catch. Never a silent skip.
        if (!before.includes(MUTANT.find)) {
          console.error("MUTATION " + MUTANT.id + " is STALE: its pattern is no "
            + "longer in " + MUTANT.file + ". Fix the catalogue entry.");
          process.exit(2);
        }
        data = Buffer.from(before.replace(MUTANT.find, MUTANT.replace), "utf8");
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((res, rej) => {
    srv.on("error", rej);
    srv.listen(PORT, () => res(srv));
  });
}

async function browser() {
  const exe = CHROMES.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } });
  if (!exe) throw new Error("no Chrome found — set CHROME_PATH");
  const proc = spawn(exe, [
    "--headless=new", ...angleArgs(), "--window-size=1280,800",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + CDP_PORT,
    "--user-data-dir=" + path.join(require("os").tmpdir(), "hydro-smoke-" + process.pid),
    "about:blank",
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch (_) { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error("Chrome never exposed a page target"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pend = new Map();
  const pageErrors = [];              // anything the page threw on its own
  let id = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails || {};
      pageErrors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      pageErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(" "));
      return;
    }
    const p = pend.get(m.id);
    if (p) { pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("CDP socket failed")); });
  const send = (method, params) => new Promise((res, rej) => {
    const m = ++id;
    pend.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params }));
  });
  await send("Page.enable", {});
  await send("Runtime.enable", {});

  /** Evaluate in the page and return the value. Throws on a page exception,
   *  so a broken rename surfaces as a failed step and not a silent null. */
  async function evaluate(expr) {
    const r = await send("Runtime.evaluate", {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception || {};
      throw new Error(ex.description || ex.value || "page exception");
    }
    return r.result.value;
  }

  /** `ready` is the expression that says the page has arrived. It defaults to
   *  the app booting, because almost every page here IS the app — the docs
   *  reader is the exception, and it has no APP to wait for. */
  async function goto(url, ready) {
    await send("Page.navigate", { url });
    const cond = ready || "!!(window.APP && window.APP.sim)";
    for (let i = 0; i < 160; i++) {                 // software GL boots slowly
      await new Promise((r) => setTimeout(r, 250));
      try {
        if (await evaluate(cond)) {
          if (!ready) await evaluate(HELPERS + "true");
          return;
        }
      } catch (_) { /* mid-navigation */ }
    }
    // Ask the page why. A missing WebGL2 context is the usual answer, and
    // "APP never appeared" on its own sends people hunting the wrong bug.
    let why = "no diagnosis";
    try {
      why = await evaluate(`(() => {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2");
        const banner = document.querySelector("#err, .err, #error");
        return JSON.stringify({
          app: typeof window.APP,
          webgl2: !!gl,
          floatRT: gl ? !!gl.getExtension("EXT_color_buffer_float") : null,
          renderer: gl ? gl.getParameter(gl.RENDERER) : null,
          banner: banner ? banner.textContent.slice(0, 160) : null,
        });
      })()`);
    } catch (_) { /* the page may be wedged */ }
    throw new Error("the page never became ready at " + url + " — " + why +
      (pageErrors.length
        ? "\n      page threw: " + pageErrors.slice(0, 3).join(" | ")
        : "\n      page threw nothing"));
  }

  return { evaluate, goto, close: () => { try { ws.close(); } catch (_) {} proc.kill(); } };
}

// ------------------------------------------------------------------ suites
const SUITES = {};

SUITES.api = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=h23`);
  const r = await B.evaluate(`(() => {
    __low(); APP.tick(400);
    const pr = APP.probe(3.0, 0.30);
    const A  = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    APP.placeCV(4.0, 0.10, 5.2, 0.60);
    const bf = APP.boxForce(4.0, 0.10, 5.2, 0.60);
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: 2.0, z: 0.30, hist: [], log: [], id: 99, colour: "#fff" });
    APP.frames(20);
    const g = APP.state.gauges[0];
    const rec = g.log[g.log.length - 1] || {};
    return {
      probeKeys: Object.keys(pr).sort(),
      probeFinite: [pr.u, pr.w, pr.phead, pr.f, pr.speed].every(Number.isFinite),
      analyseKeys: Object.keys(A).sort(),
      // Shape first: every per-column field is one entry per column, whether
      // it is a plain array or one of the Float32Arrays the smoothing returns.
      // A field lost to a rename is undefined and fails here.
      analyseShape: ["d", "dc", "dn", "H", "dRaw", "q", "V", "Fr", "S0", "ok", "onBed"]
        .filter((k) => {
          const a = A[k];
          return !(Array.isArray(a) || ArrayBuffer.isView(a)) || a.length !== A.d.length;
        }),
      // Values only for the fields that are defined everywhere. d_n is NOT
      // one of them: it is MEASURED off the energy line, so it is NaN where
      // the friction slope is unusable and Infinity on a level bed — which is
      // why the hover readout prints it behind an isFinite guard. Its health
      // is asserted through dnGlobal instead.
      analyseValues: ["d", "dc", "H", "dRaw", "q", "V", "Fr"].filter((k) => {
        const i = A.ok.findIndex((good, n) => good && A.d[n] > 3 * APP.sim.dx);
        return i < 0 || !Number.isFinite(A[k][i]);
      }),
      okColumns: A.ok.reduce((n, v) => n + (v ? 1 : 0), 0),
      boxKeys: Object.keys(bf).sort(),
      boxFinite: [bf.fx, bf.fz, bf.mdot].every(Number.isFinite),
      recKeys: Object.keys(rec).sort(),
      recFinite: [rec.h, rec.d, rec.speed].every(Number.isFinite),
      gaugeZ: g.z,
      dnGlobal: typeof A.dnGlobal,
    };
  })()`);

  ok("API probe() exposes u/w/phead, not v/head",
    r.probeKeys.includes("w") && r.probeKeys.includes("phead") &&
    !r.probeKeys.includes("v") && !r.probeKeys.includes("head"),
    "keys: " + r.probeKeys.join(","));
  ok("API probe() values are finite", r.probeFinite);
  ok("API analyse() exposes the d-family and H",
    ["d", "dc", "dn", "dRaw", "H"].every((k) => r.analyseKeys.includes(k)) &&
    !["h", "yc", "yn", "hRaw", "E"].some((k) => r.analyseKeys.includes(k)),
    "keys: " + r.analyseKeys.join(","));
  ok("API analyse() has trustworthy columns to read", r.okColumns > 20, r.okColumns + " ok columns");
  ok("API analyse() returns one entry per column for every field",
    r.analyseShape.length === 0, "wrong shape: " + r.analyseShape.join(","));
  ok("API analyse() values are finite where the overlay trusts them",
    r.analyseValues.length === 0, "not finite: " + r.analyseValues.join(","));
  ok("API analyse() still reports dnGlobal", r.dnGlobal === "number");
  ok("API boxForce() exposes fx/fz, not fy",
    r.boxKeys.includes("fz") && !r.boxKeys.includes("fy"),
    "keys: " + r.boxKeys.join(","));
  ok("API boxForce() values are finite", r.boxFinite);
  ok("API gauge records are {t,h,d,speed}",
    ["t", "h", "d", "speed"].every((k) => r.recKeys.includes(k)) &&
    !r.recKeys.includes("head") && !r.recKeys.includes("depth"),
    "keys: " + r.recKeys.join(","));
  ok("API gauge record values are finite", r.recFinite);
  ok("API gauge objects carry z", r.gaugeZ === 0.30);

  // The jump box is the one place the conjugate-depth fields are consumed.
  // h23 must be SETTLED first — its card allows 35 s, and the documented
  // verified read (docs/engineering-notes.md) is Fr1 2.24, d2 0.416 against
  // Belanger 0.438. Settle by simulated time so the count is independent of
  // Δt, then warm the analyse EMA the way the overlay does.
  const j = await B.evaluate(`(() => {
    __low();
    const t = __settle(30, 120000);
    const A = __warm(25);
    const J = OVERLAY.findJumps(A, APP.sim)[0];
    return J ? { t, keys: Object.keys(J).sort(),
                 d1: J.d1, d2: J.d2, d2p: J.d2p, Fr1: J.Fr1, dE: J.dE } : { t };
  })()`);
  if (ok("PHYSICS h23 still forms a hydraulic jump", j.keys !== undefined,
         "settled to t = " + (j.t || 0).toFixed(1) + " s with no free jump found")) {
    ok("API findJumps() exposes d1/d2/d2p",
      ["d1", "d2", "d2p"].every((k) => j.keys.includes(k)) &&
      !["y1", "y2", "y2p"].some((k) => j.keys.includes(k)),
      "keys: " + j.keys.join(","));
    ok("PHYSICS jump is supercritical entering (Fr1 > 1)", j.Fr1 > 1,
      "Fr1 = " + j.Fr1.toFixed(2));
    // The band is wide on purpose: the jump box flutters (its own README
    // says so) and a steep bed reads well under Belanger. This is a guard
    // against the momentum balance breaking, not a calibration.
    ok("PHYSICS conjugate depth is within 30% of Belanger",
      near(j.d2, j.d2p, 0.30 * j.d2p),
      `d2 ${j.d2.toFixed(3)} vs Belanger ${j.d2p.toFixed(3)} at t ${j.t.toFixed(1)} s`);
    ok("PHYSICS the jump dissipates energy", j.dE > 0, "dE = " + j.dE);
  }

  // GEOM/polygon rasterisation (Task 2 of the polygon-geometry work): a
  // scene's solids() must fill the mask the same way walls() always has.
  // Stamp the SAME 0.4 m wall two ways on the live grid — once as a segment
  // through the existing stampSeg capsule, once as a GEOM.slab polygon
  // through the new stampPoly fill+edge-stroke — and diff the two masks.
  //
  // The two are NOT pixel-identical, and should not be expected to be: the
  // edge stroke stampPoly re-stamps with is stampSeg's own dx*1.7 anti-leak
  // floor (th = 0 forces it), which is a fixed multiple of dx, run around the
  // WHOLE polygon perimeter — while this wall's 0.4 m thickness is fixed in
  // metres. At the sandbox's default (Medium) budget, dx ~ 0.0217 m, so the
  // stroke's rim is a real, measured ~8.5% of the wall's footprint (312 of
  // 3668 solid-or-poly cells) — geometry, not noise: the same comparison at
  // Low (dx ~ 0.0316 m) gives ~10.5%, at Ultra (dx ~ 0.0080 m) ~2.2%, falling
  // as dx does. A 20% gate is comfortably clear of that floor while still
  // catching what actually breaks stampPoly: a fill that never runs leaves
  // the polygon's whole 0.4 x 3 m interior unstamped, which is most of
  // `solid`, not a rim around it.
  //
  // 2026-09-01 addendum (stampPoly's stroke-skip, js/sim.js): those
  // percentages describe the PRE-stroke-skip stroke. Now that stampPoly
  // skips the edge stroke whenever every edge of the solid clears 2*dx, this
  // wall's edges (5 m and 0.4 m — the short end already 2 cells at every
  // budget the sandbox offers) clear the floor at Medium too, so the stroke
  // never runs and there is no rim left to measure: diff/solid measured 0 of
  // 3356 (0.00%) at Medium. The 20% gate still passes, now for a different
  // reason — an exact fill match, not a rim comfortably under budget.
  await B.goto(`http://localhost:${PORT}/?scene=sandbox`);
  const poly = await B.evaluate(`(() => {
    const S = APP.sim, orig = S.scene;
    S.scene = Object.assign({}, orig, {
      walls: () => [[2, 2, 5, 2, 0.4]], solids: undefined, valves: undefined,
    });
    APP.SIM.rasterise();
    const segMask = S.mask.slice();
    S.scene = Object.assign({}, orig, {
      walls: undefined, solids: () => [GEOM.slab(2, 2, 5, 2, 0.4)], valves: undefined,
    });
    APP.SIM.rasterise();
    const polyMask = S.mask.slice();
    S.scene = orig;                    // leave the live grid as it was found
    APP.SIM.rasterise();
    let diff = 0, solid = 0;
    for (let i = 0; i < segMask.length; i++) {
      const a = segMask[i] >= 192, b = polyMask[i] >= 192;
      if (a || b) solid++;
      if (a !== b) diff++;
    }
    return { diff, solid };
  })()`);
  ok("SIM a solids() polygon stamps the same wall walls() would",
    poly.solid > 20 && poly.diff / poly.solid < 0.20,
    `${poly.diff} of ${poly.solid} solid-or-poly cells disagree`);

  // faceForce (Task 4 of the polygon-geometry work): wiring only here.
  // sandbox — restored above — declares no solids, so every (solidId,
  // faceId) must come back null the same way an unknown solid id does on
  // any scene. The real closed-form check (a face force against its
  // hydrostatic integral) follows below, now that s3's gate is a solid.
  const ff = await B.evaluate(`(() => ({
    unknownSolid: APP.faceForce("nosuch", "x"),
    noSolids: (APP.sim.solids || []).length === 0,
    onEmptyScene: APP.faceForce("anything", "top"),
  }))()`);
  ok("SIM faceForce returns null for an unknown solid id",
    ff.unknownSolid === null, String(ff.unknownSolid));
  ok("SIM faceForce on a scene with no solids has none to find",
    ff.noSolids === true, "solids: " + ff.noSolids);
  ok("SIM faceForce returns null on a scene with no solids",
    ff.onEmptyScene === null, String(ff.onEmptyScene));

  // The closed form (Task 6): s3's gate blade is a GEOM.poly solid with an
  // "us" (upstream) face, so faceForce("gate", "us") should recover the
  // hydrostatic pressure diagram behind it. Settle to the scene's own
  // measured spin-up (26 s) before reading it.
  await B.goto(`http://localhost:${PORT}/?scene=s3`);
  const g = await B.evaluate(`(() => {
    __low();
    const t = __settle(26, 120000);
    const b = APP.sim.scene.bedTop(1.2);
    const a = APP.SIM.params().values.gate_a;
    const level = APP.sim.p.inflow.level;
    const ff = APP.faceForce("gate", "us");
    return { t, b, a, level,
      Fx: ff && ff.Fx, Fz: ff && ff.Fz, cop: ff && ff.cop,
      wetLen: ff && ff.wetLen, samples: ff ? ff.samples.length : 0 };
  })()`);
  ok("PHYSICS s3 gate settled before its face is read", g.t >= 25.5,
    "reached t = " + (g.t || 0).toFixed(1) + " s of 26");
  // z_s: the pool behind the gate is backed up by the LEVEL Dirichlet inflow
  // (p.inflow.level, 2.80 m) — a near-static reservoir standing at that
  // level, not at a constant DEPTH above the gate's own bed. The gate sits
  // 0.30 m below the inlet's bed (S0 = 0.25 over 1.2 m), so the depth THERE
  // is ~1.70 m, not the channel's inletDepth (1.40 m, the depth at the
  // INLET). lip: the opening the water passes under. Expected upstream
  // force is the hydrostatic integral over the wetted stretch [lip, z_s];
  // the flow accelerating under the gate depresses pressure near the lip,
  // and the pool itself carries a small approach/piling correction above
  // the nominal level, so this is a bracket, not an equality.
  const lip = g.b + g.a, zs = g.level;
  const expect = 0.5 * 1000 * 9.81 * (zs - lip) * (zs - lip);
  // MEASURED (ANGLE/D3D11, Low budget, dx = 0.0193 m): Fx = 9.61 kN/m
  // against expect = 8.94 kN/m — 7.5% high, and stable (9.5-10.1 kN/m,
  // wetLen 1.42-1.46 m) across a t = 5-70 s settle sweep, so this is the
  // pool's own steady piling above the nominal level, not a transient. A
  // regression in the RISK this task was written against (the polygon
  // lip's effective opening drifting by the ~0.85*dx edge-stroke floor)
  // would move Fx by several percent on top of that -- either the wetted
  // extent or the near-lip depression would visibly shift -- so 15% still
  // has margin to catch it while not being so loose it catches nothing.
  ok("PHYSICS s3 gate upstream face brackets the hydrostatic force",
    g.Fx !== undefined && g.Fx > 0 && near(g.Fx, expect, 0.15 * expect),
    `Fx = ${(g.Fx / 1000).toFixed(3)} kN/m vs ½ρg(zs−lip)² = ${(expect / 1000).toFixed(3)} kN/m` +
    ` (lip ${lip.toFixed(3)} m, zs ${zs.toFixed(3)} m, wetLen ${g.wetLen && g.wetLen.toFixed(3)} m,` +
    ` ${g.samples} samples, t ${g.t.toFixed(1)} s)`);
  const mid = lip + (zs - lip) / 2;
  ok("PHYSICS s3 gate cop sits between the lip and mid-depth",
    !!g.cop && g.cop.z >= lip - 1e-6 && g.cop.z <= mid + 1e-6,
    `cop.z = ${g.cop && g.cop.z.toFixed(3)} m, lip ${lip.toFixed(3)} m, mid ${mid.toFixed(3)} m`);

  // The slider proof (Task 6): gate_a is a live param, so SIM.setParam must
  // clamp, rasterise a new mask and — because docs/averaging.md §9 treats a
  // geometry edit as a reset condition — restart any open averaging window,
  // exactly like a drawn wall or a valve flip already do.
  //
  // LOWER the gate here (0.35 -> 0.20 m), not raise it: that is the risky
  // direction — cells that were open water become solid in one rasterise()
  // call, no different from a gate physically dropping into moving water —
  // and a finite-only check on volume() cannot tell a real conservation
  // failure from a bug that quietly invents water in the newly-solid cells'
  // place. volBefore/vol below bracket that directly.
  const slide = await B.evaluate(`(() => {
    const before = APP.sim.mask.slice();
    APP.SIM.avgStart();
    APP.tick(50);
    const T0 = APP.SIM.avgT();
    APP.SIM.columns(true);
    const volBefore = APP.volume();
    const v = APP.SIM.setParam("gate_a", 0.20);
    APP.SIM.columns(true);
    const vol = APP.volume();
    let maskDiff = 0;
    const after = APP.sim.mask;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) maskDiff++;
    const T1 = APP.SIM.avgT(), active1 = APP.SIM.avgActive();
    APP.SIM.avgStop();
    return { v, vol, volBefore, maskDiff, T0, T1, active1 };
  })()`);
  ok("SIM setParam(gate_a) clamps within range and applies the value",
    slide.v === 0.20, "applied = " + slide.v);
  ok("SIM setParam(gate_a) leaves volume() finite once columns(true) forces the readback",
    Number.isFinite(slide.vol), "volume = " + slide.vol);
  ok("SIM setParam(gate_a) rebuilds the mask — the blade actually moved",
    slide.maskDiff > 0, slide.maskDiff + " mask cells changed");
  // MEASURED (ANGLE/D3D11, Low, dx = 0.0193 m), three repeats landing on the
  // same six digits: lowering gate_a from 0.35 to 0.20 m flips 16 mask cells
  // from open water to solid, and volume falls from 3.19742 to 3.19190 m2 —
  // a real drop, because the water that had stood in those 16 cells simply
  // leaves the wet-cell accounting; nothing moves it elsewhere first. 0.01 m2
  // (~0.3% of volBefore, ~2x the measured 0.00552 m2 drop) is margin against
  // single-frame readback noise on a free surface that is never perfectly
  // flat — not slack for an invented-water bug, which would show as an
  // INCREASE past this floor, not a smaller decrease.
  ok("SIM setParam(gate_a) lowering the gate into flow does not invent water",
    slide.vol <= slide.volBefore + 0.01,
    `${slide.volBefore.toFixed(5)} -> ${slide.vol.toFixed(5)} m2 (` +
    `${(slide.vol - slide.volBefore) >= 0 ? "+" : ""}${(slide.vol - slide.volBefore).toFixed(5)})`);
  ok("SIM setParam(gate_a) resets the averaging window it invalidated",
    slide.active1 === true && slide.T1 < slide.T0,
    `T ${slide.T0.toFixed(3)} s -> ${slide.T1.toFixed(3)} s, still active ${slide.active1}`);

  // The thin-sliver stroke test (polygon-geometry Finding 1, the case the
  // original task deferred): a genuinely short edge — one a merged run
  // cannot absorb, because it turns 90 degrees at both ends against long
  // neighbours — must still force stampPoly's anti-leak stroke. Built so a
  // fill-only (point-in-polygon-at-cell-centres) test finds NOTHING: a
  // 5*dx x 0.3*dx rectangle straddling a cell BOUNDARY in z, thin enough
  // that no cell centre falls inside it. If the stroke's threshold ever
  // regressed to reading this as clear of the 2*dx floor (e.g., a future
  // edit that merges every edge regardless of turn angle), the sliver would
  // rasterise to nothing — a real solid the fill test cannot see and the
  // stroke was the only thing sealing.
  const sliver = await B.evaluate(`(() => {
    const S = APP.sim, orig = S.scene;
    const dx = S.dx;
    const jMid = 40;                       // an interior row, clear of the border
    const zMid = jMid * dx;                // exactly on a cell boundary
    const x0 = 2.0, x1 = x0 + 5 * dx;       // long sides clear 2*dx on their own
    const halfH = 0.15 * dx;                // short sides: 0.3*dx, well under 2*dx
    const solid = GEOM.rect(x0, zMid - halfH, x1, zMid + halfH, { id: "sliver" });
    let fillOnly = 0;
    for (let j = jMid - 2; j <= jMid + 2; j++) {
      for (let i = Math.floor(x0 / dx) - 1; i <= Math.floor(x1 / dx) + 1; i++) {
        if (GEOM.contains(solid, (i + 0.5) * dx, (j + 0.5) * dx)) fillOnly++;
      }
    }
    S.scene = Object.assign({}, orig, { walls: undefined, solids: () => [solid], valves: undefined });
    APP.SIM.rasterise();
    let stamped = 0;
    for (let j = jMid - 2; j <= jMid + 2; j++) {
      for (let i = Math.floor(x0 / dx) - 1; i <= Math.floor(x1 / dx) + 1; i++) {
        if (S.mask[j * S.nx + i] >= 192) stamped++;
      }
    }
    S.scene = orig;                        // leave the live grid as it was found
    APP.SIM.rasterise();
    return { fillOnly, stamped, dx };
  })()`);
  ok("SIM a fill-only test would miss the thin sliver entirely",
    sliver.fillOnly === 0, `fill-only found ${sliver.fillOnly} cells (dx=${sliver.dx})`);
  ok("SIM stampPoly's stroke seals a genuinely short edge's pinch",
    sliver.stamped > 0, `stroke stamped ${sliver.stamped} cells`);

  // The hump crest (polygon-geometry Finding 1): a single curved face
  // sampled at n=160 (~0.025 m chords, GEOM.humpPts) is exactly the case
  // stampPoly's merged-run threshold exists for — a fine polyline sampling
  // a smooth, chunky solid must not read as 160 separately-short edges.
  // Settled at the scene's DEFAULT budget (Medium, dx = 0.0148 m): this is
  // the resolution a student actually opens the scene at, and it is
  // exactly the budget the pre-merge threshold failed on (so did Low).
  //
  // The crest never "settles" by a single-instant read — the scene's own
  // comment (js/scenes.js) documents a persistent surface wobble that runs
  // 5-10x LARGER on the crest than on the approach pool it recommends
  // reading instead. MEASURED: two of three raw (non-averaged) faceForce
  // reads at t = 30 s landed on a momentary near-drained crest — all 320
  // samples reading dry — purely from the wobble's phase, nothing to do
  // with stampPoly. Average mode is the house answer to exactly this kind
  // of reading ("Under an averaging window the sample is the window mean:
  // one window, every instrument," AGENTS.md), so this opens a window AFTER
  // spin-up and reads faceForce(..., avg). avgStepField only runs from the
  // real frame loop (main.js's tickFrame), so time is driven through
  // APP.frames() here, not the raw APP.tick() the rest of this suite uses —
  // APP.tick() would leave the display accumulator at zero forever and
  // every avg reading below would silently read as zero (also MEASURED,
  // chasing this down).
  await B.goto(`http://localhost:${PORT}/?scene=hump`);
  const hump = await B.evaluate(`(() => {
    const t0 = Date.now();
    while (APP.sim.t < 15 && Date.now() - t0 < 150000) APP.frames(20, 2.0);
    APP.SIM.avgStart();
    while (APP.SIM.avgT() < 15 && Date.now() - t0 < 250000) APP.frames(20, 2.0);
    const ff = APP.faceForce("hump", "crest", true);
    let wet = 0;
    for (const s of ff.samples) if (s.f * s.p > 0) wet++;
    const dx = APP.sim.dx;
    // The classical vertical-force-on-a-submerged-surface identity: under a
    // hydrostatic pressure field, the force equals the weight of the water
    // standing directly above the surface. rho*g times the window-mean
    // depth integrated over the hump's own footprint (x in [6,10], the
    // crest's x0/x1 in js/scenes.js) gives that weight; the real flow's
    // departure from hydrostatic (it accelerates over the crest) is the gap
    // between this estimate and the measured Fz.
    const avgCols = APP.SIM.avgColumns(true);
    const iLo = Math.round(6.0 / dx), iHi = Math.round(10.0 / dx);
    let sumD = 0;
    for (let i = iLo; i < iHi; i++) sumD += avgCols.C[i * 4 + 1] * dx;
    const weight = 1000 * 9.81 * sumD;
    const out = { t: APP.sim.t, avgT: APP.SIM.avgT(), budget: APP.state.budget,
      Fx: ff.Fx, Fz: ff.Fz, wetLen: ff.wetLen, len: ff.len,
      samples: ff.samples.length, wet, weight };
    APP.SIM.avgStop();
    return out;
  })()`);
  ok("SIM hump crest faceForce is exercised at the scene's DEFAULT budget",
    hump.budget === "Medium", "budget: " + hump.budget);
  ok("PHYSICS hump crest averaging window opened", hump.avgT >= 14.5,
    "avgT = " + hump.avgT.toFixed(1) + " s of 15");
  // MEASURED (ANGLE/D3D11, Medium, dx = 0.0148 m, hump_h = 0.15, default —
  // the crest is fully submerged at this height): BEFORE the merged-run fix,
  // a raw read at this same budget came back with only 122 of 320 samples
  // wet (38.1%), Fz = -4473 N/m. AFTER, over a 15 s averaging window: 320 of
  // 320 wet (100%), every one of three independent windows landing within
  // 0.1% of Fz = -11922 N/m.
  ok("PHYSICS hump crest is entirely wet at h=0.15 (fully submerged)",
    hump.wet === hump.samples,
    `${hump.wet} of ${hump.samples} samples wet, wetLen ${hump.wetLen.toFixed(3)} of ${hump.len.toFixed(3)} m`);
  ok("PHYSICS hump crest carries a net downward pressure force",
    hump.Fz < 0, "Fz = " + hump.Fz.toFixed(1) + " N/m");
  // MEASURED (same three windows): Fz = -11914 to -11926 N/m against the
  // weight-of-water-above estimate of -12138 to -12143 N/m — 1.7-1.8% low.
  // 20% brackets that with ample margin while still catching the fix's own
  // failure mode: the pre-fix raw Fz (-4473 N/m) sits 63% below this
  // bracket's floor.
  ok("PHYSICS hump crest Fz brackets the weight of water standing over it",
    near(hump.Fz, -hump.weight, 0.20 * hump.weight),
    `Fz = ${hump.Fz.toFixed(0)} N/m vs weight-of-water estimate ${(-hump.weight).toFixed(0)} N/m`);
};

SUITES.rig = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=m2`);
  const r = await B.evaluate(`(() => {
    const out = {};
    const snap = APP.RIG.snapshot();
    out.version = snap.v;
    out.srcKeys = Object.keys(snap.source).sort();
    out.field = snap.ui.field;
    // round-trip: a snapshot must load back into the same live state
    APP.sim.p.source.z = 3.25; APP.sim.p.source.vz = -2.5;
    const s2 = APP.RIG.snapshot();
    APP.sim.p.source.z = 0; APP.sim.p.source.vz = 0;
    APP.RIG.apply(s2);
    out.roundTripZ  = APP.sim.p.source.z;
    out.roundTripVz = APP.sim.p.source.vz;
    // a superseded wire format must be refused, not half-applied
    try {
      APP.RIG.apply({ v: 1, scene: "m2", segs: [], ui: { field: "head" } });
      out.v1 = "ACCEPTED";
    } catch (e) { out.v1 = "rejected"; out.v1msg = e.message; }
    out.fieldAfterV1 = APP.state.gaugeField;
    return out;
  })()`);

  ok("RIG snapshot is at the current wire version", r.version === 2, "v" + r.version);
  ok("RIG snapshot source carries z/vz, not y/vy",
    r.srcKeys.includes("z") && r.srcKeys.includes("vz") &&
    !r.srcKeys.includes("y") && !r.srcKeys.includes("vy"),
    "keys: " + r.srcKeys.join(","));
  ok("RIG snapshot gauge field is a live key",
    ["h", "d", "speed"].includes(r.field), "field: " + r.field);
  ok("RIG snapshot round-trips the spout elevation", near(r.roundTripZ, 3.25, 1e-6),
    "z = " + r.roundTripZ);
  ok("RIG snapshot round-trips the spout velocity", near(r.roundTripVz, -2.5, 1e-6),
    "vz = " + r.roundTripVz);
  ok("RIG a superseded format is refused", r.v1 === "rejected", r.v1msg);
  ok("RIG a refused load leaves the live field alone",
    ["h", "d", "speed"].includes(r.fieldAfterV1), "field: " + r.fieldAfterV1);

  // The `params` wire key (additive to v2, docs/engineering-notes.md) is
  // untouched by everything above — the m2 scene it runs against declares no
  // params at all, so `RIG.snapshot()` never even writes the key on that
  // path. s3's gate_a is a live param: set it away from its default,
  // snapshot, scramble the live value back off the snapshot, apply the
  // snapshot, and read the RECONSTRUCTED S.params off the reload — not the
  // snapshot JSON, so this catches total omission the way the instrument
  // coverage test below does for placed instruments.
  await B.goto(`http://localhost:${PORT}/?scene=s3`);
  const pr = await B.evaluate(`(() => {
    const applied = APP.SIM.setParam("gate_a", 0.90);   // s3's default is 0.35
    const snap = APP.RIG.snapshot();
    APP.SIM.setParam("gate_a", 0.35);                    // scramble away from it
    APP.RIG.apply(snap);
    return { applied, snapParam: snap.params && snap.params.gate_a,
      reloaded: APP.SIM.params().values.gate_a };
  })()`);
  ok("RIG snapshot carries the params wire key",
    typeof pr.snapParam === "number", "params.gate_a = " + pr.snapParam);
  ok("RIG round-trips a scene param end to end (gate_a)",
    near(pr.reloaded, pr.applied, 1e-6),
    `set ${pr.applied} -> snapshot ${pr.snapParam} -> reloaded ${pr.reloaded}`);
  await B.goto(`http://localhost:${PORT}/?scene=m2`);

  const csv = await B.evaluate(`(() => {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: 2.0, z: 0.40, hist: [], log: [], id: 1, colour: "#fff" });
    APP.frames(12);
    return APP.gaugeCSV().split("\\n")[0];
  })()`);
  ok("RIG gauge CSV header uses z and the h/d columns",
    /_z0\.40_h_m/.test(csv) && /_d_m/.test(csv) &&
    !/_head_m/.test(csv) && !/_depth_m/.test(csv), csv);

  // -------------------------------------------------------- instrument coverage
  //
  // Everything above asserts NOTATION (z/vz, h/d) and the VERSION gate, plus
  // one round-tripped scalar. None of it asserts COVERAGE — that every
  // DURABLE placed instrument actually survives a save/load. That gap is how
  // flux sections went unstored for a long time: RIG.snapshot()/apply() (in
  // js/rig.js) has just been fixed to carry a `flux` array and `ui.cvShow`,
  // and nothing here checked either one.
  //
  // Two things below. First, a reflection-based inventory: enumerate the
  // `place*` functions APP actually exposes, rather than hand-listing them,
  // so a FIFTH instrument type (a future placeX) is picked up by this
  // enumeration and — because it will not be in the KNOWN map below — makes
  // the coverage assertion fail LOUDLY, the same "silently not there" gate
  // check_pack.py already enforces for exercise UI profiles (AGENTS.md).
  // This is honestly only half-general: it discovers that a new placer
  // EXISTS, but a person still has to teach this test its arguments and
  // where it lands in `state` before it can be checked for real — it cannot
  // guess either. What it prevents is the silent version of that gap: an
  // unmapped placer fails the build instead of nobody noticing.
  //
  // Second, a real round trip: place a control volume, TWO flux sections and
  // TWO gauges (plus a rake, since placeRake is part of the same reflected
  // list) with distinct, known coordinates; snapshot; scramble the live
  // state; apply the snapshot back; and diff the LIVE STATE — not the
  // snapshot JSON — before against after. Diffing the live state is what
  // makes this catch total omission: a key RIG.snapshot() never writes at
  // all would still round-trip an internally-consistent (empty) JSON, but it
  // would not reproduce the live state that was actually placed.
  const cov = await B.evaluate(`(() => {
    APP.loadScene("m2", false);
    const W = APP.sim.W, H = APP.sim.H;
    const placers = Object.keys(APP).filter((k) => /^place[A-Z]/.test(k) && typeof APP[k] === "function");
    // Known instrument -> [the args this test places it with, how to read
    // its result back out of the LIVE state]. Extend this the day a new
    // place* lands, or the "fully catalogued" assertion below fails on purpose.
    const KNOWN = {
      placeGauge: { read: () => APP.state.gauges.map((g) => [g.x, g.z]) },
      placeRake:  { read: () => APP.state.rakes.map((k) => k.x) },
      placeCV:    { read: () => APP.state.cv
                      ? [APP.state.cv.x0, APP.state.cv.z0, APP.state.cv.x1, APP.state.cv.z1] : null },
      placeFlux:  { read: () => APP.state.flux.map((L) => [L.x0, L.z0, L.x1, L.z1]) },
    };
    const unmapped = placers.filter((p) => !KNOWN[p]);

    APP.state.gauges.length = 0; APP.state.rakes.length = 0;
    APP.state.cv = null; APP.state.flux.length = 0;
    APP.placeGauge(0.30 * W, 0.20 * H); APP.placeGauge(0.60 * W, 0.35 * H);
    APP.placeRake(0.45 * W);
    APP.placeCV(0.15 * W, 0.05 * H, 0.45 * W, 0.55 * H);
    APP.placeFlux(0.70 * W, 0.05 * H, 0.70 * W, 0.55 * H);
    APP.placeFlux(0.85 * W, 0.05 * H, 0.85 * W, 0.55 * H);
    APP.state.cvShow = "M";

    const before = {};
    for (const p of placers) if (KNOWN[p]) before[p] = KNOWN[p].read();
    before.cvShow = APP.state.cvShow;

    const snap = APP.RIG.snapshot();
    // Scramble every live location the round trip is supposed to restore.
    APP.state.gauges.length = 0; APP.state.rakes.length = 0;
    APP.state.cv = null; APP.state.flux.length = 0; APP.state.cvShow = "Q";
    APP.RIG.apply(snap);

    const after = {};
    for (const p of placers) if (KNOWN[p]) after[p] = KNOWN[p].read();
    after.cvShow = APP.state.cvShow;

    const maxDiff = (a, b) => {
      if (a === null || b === null) return a === b ? 0 : Infinity;
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return Infinity;
        let m = 0;
        for (let i = 0; i < a.length; i++) m = Math.max(m, maxDiff(a[i], b[i]));
        return m;
      }
      return Math.abs(a - b);
    };
    const diffs = {};
    for (const p of placers) if (KNOWN[p]) diffs[p] = maxDiff(before[p], after[p]);

    return { placers, unmapped, before, after, diffs,
             snapFluxLen: (snap.flux || []).length,
             snapCvShow: snap.ui && snap.ui.cvShow };
  })()`);
  ok("rig's coverage test is not silently missing a placement API",
     cov.unmapped.length === 0,
     "placers: " + cov.placers.join(",") + "  unmapped: " + cov.unmapped.join(","));
  ok("rig round-trips the control volume position",
     (cov.diffs.placeCV || 0) < 1e-4, JSON.stringify({ before: cov.before.placeCV, after: cov.after.placeCV }));
  ok("rig round-trips both flux sections, positions included",
     cov.before.placeFlux.length === 2 && cov.after.placeFlux.length === 2 &&
     (cov.diffs.placeFlux || 0) < 1e-4 && cov.snapFluxLen === 2,
     JSON.stringify({ before: cov.before.placeFlux, after: cov.after.placeFlux, snapLen: cov.snapFluxLen }));
  ok("rig round-trips both gauges, positions included",
     cov.before.placeGauge.length === 2 && cov.after.placeGauge.length === 2 &&
     (cov.diffs.placeGauge || 0) < 1e-4,
     JSON.stringify({ before: cov.before.placeGauge, after: cov.after.placeGauge }));
  ok("rig round-trips the rake station",
     cov.before.placeRake.length === 1 && cov.after.placeRake.length === 1 &&
     (cov.diffs.placeRake || 0) < 1e-4,
     JSON.stringify({ before: cov.before.placeRake, after: cov.after.placeRake }));
  ok("rig round-trips which quantity the control volume/sections read (cvShow)",
     cov.before.cvShow === "M" && cov.after.cvShow === "M" && cov.snapCvShow === "M",
     JSON.stringify({ before: cov.before.cvShow, after: cov.after.cvShow, snap: cov.snapCvShow }));
};

SUITES.physics = async (B) => {
  // Still water must STAY still: this is the discrete hydrostatic balance,
  // and it is the first thing a careless edit to the vel pass breaks.
  await B.goto(`http://localhost:${PORT}/?scene=venturi`);
  const rest = await B.evaluate(`(() => {
    __low();
    APP.sim.p.inflow.on = 0; APP.sim.p.tailwater.on = 0; APP.sim.p.source.on = 0;
    APP.SIM.resetWater();
    // volume() reads the column reduction through the CACHED readback, which
    // only refreshes every few frames — straight after a rebuild or a reset
    // that cache is still zeros. columns(true) forces the readback, and
    // volume() then reads the fresh buffer. Without this the baseline is 0.
    APP.tick(1); APP.SIM.columns(true);
    const v0 = APP.volume();
    __settle(APP.sim.t + 8, 90000);
    APP.SIM.columns(true);
    const v1 = APP.volume();
    let maxSpeed = 0, nan = 0;
    for (let x = 0.5; x < APP.sim.W; x += 0.75) {
      for (let z = 0.2; z < APP.sim.H; z += 0.5) {
        const p = APP.probe(x, z);
        if (!Number.isFinite(p.u) || !Number.isFinite(p.w) || !Number.isFinite(p.f)) nan++;
        if (p.f > 0.5) maxSpeed = Math.max(maxSpeed, Math.hypot(p.u, p.w));
      }
    }
    return { v0, v1, maxSpeed, nan };
  })()`);
  ok("PHYSICS no NaN in the field after a sealed run", rest.nan === 0, rest.nan + " probes");
  ok("PHYSICS a sealed domain conserves volume",
    rest.v0 > 0 && near(rest.v1, rest.v0, 0.01 * rest.v0),
    `${rest.v0.toFixed(4)} → ${rest.v1.toFixed(4)} m²`);
  ok("PHYSICS still water stays still", rest.maxSpeed < 0.35,
    "max speed " + rest.maxSpeed.toFixed(3) + " m/s");

  // A flowing reach. Measured over the middle 60% only: the inlet sponge and
  // the brink are boundary treatments, not the reach, and including them
  // measures those instead.
  await B.goto(`http://localhost:${PORT}/?scene=m1`);
  const flow = await B.evaluate(`(() => {
    __low();
    // Settle to 40 s, not 30. m1's volume is still climbing at 30 (8.75 m2
    // against 8.86) and only levels off around t = 45.
    const t = __settle(40, 150000);
    // qRaw / dRaw, NOT q / d. analyse() carries its own 10% EMA over the
    // column reduction (S._qA in js/overlay.js) to steady the on-screen
    // profile against roll waves. Called ONCE on the mean columns, that EMA is
    // still 90% full of the LIVE frames that came before it, so A.q would be a
    // blend of the average with the instant -- and would report a spread of
    // 0.03 where the mean columns themselves give 0.002. A.qRaw is the column
    // reduction's own output, which is what the window averaged.
    const stats = (A) => {
      const nx = A.dRaw.length, lo = Math.floor(nx * 0.2), hi = Math.floor(nx * 0.8);
      const wet = [];
      for (let i = lo; i < hi; i++) if (A.ok[i] && A.dRaw[i] > 3 * APP.sim.dx) wet.push(i);
      const q = wet.map((i) => A.qRaw[i]).filter(Number.isFinite).sort((a, b) => a - b);
      const med = q[q.length >> 1];
      const third = Math.floor(wet.length / 3);
      const medOf = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
      const mid = wet[Math.floor(wet.length / 2)];
      return { n: wet.length, qLo: q[0], qHi: q[q.length - 1], med,
               qUp: medOf(wet.slice(0, third).map((i) => A.qRaw[i])),
               qDn: medOf(wet.slice(-third).map((i) => A.qRaw[i])),
               dMid: A.dRaw[mid], dcMid: A.dc[mid],
               HFalls: A.H[wet[0]] > A.H[wet[wet.length - 1]] };
    };
    // One frame, for the contrast printed in the detail line.
    const inst = stats(OVERLAY.analyse(APP.sim, APP.SIM.columns(true)));
    // Then a real time average. SIM.avgColumns returns the mean columns in
    // SIM.columns' own layout, so analyse() takes them unchanged.
    APP.SIM.avgStart();
    const t1 = Date.now(), tgt = APP.sim.t + 20;
    while (APP.sim.t < tgt && Date.now() - t1 < 90000) APP.frames(1);
    const T = APP.SIM.avgT();
    const avg = stats(OVERLAY.analyse(APP.sim, APP.SIM.avgColumns(true).C));
    APP.SIM.avgStop();
    return Object.assign({ t, T, instSpread: (inst.qHi - inst.qLo) / inst.med }, avg);
  })()`);
  ok("PHYSICS m1 has a wet reach to measure", flow.n > 50, flow.n + " columns");
  // ASSERT THE SETTLE, before asserting anything measured on it.
  //
  // `__settle` gives up on wall clock and reports what it reached — deliberately,
  // because a test that says "settled to 12 s of 30" is debuggable and one that
  // hangs is not. But nothing used to CHECK the number it returned, so a machine
  // too slow to reach t = 30 did not fail here: it fell through to the discharge
  // assertion below and failed THAT, on a backwater curve still visibly filling.
  // The reading was blamed for the settle, which sent at least one reader
  // looking for a conservation bug that was not there.
  //
  // If this is the assertion that fails, the physics below is untested, not
  // wrong. The usual cause is the rasteriser: smoke.js runs Chrome with
  // `--disable-gpu` (SwiftShader), while test/cdp.mjs passes
  // `--use-angle=d3d11` and reaches t = 30 on this same scene in about 7 s of
  // wall clock. Measured on a Windows laptop, m1 at Low, 828 x 64: ANGLE gets
  // to t = 30 in 6.5 s; SwiftShader reaches roughly t = 9.5 in the full 150 s
  // budget, about 50x slower. Raise the budget, or give this harness the GPU.
  ok("PHYSICS m1 settled to the time its readings are taken at", flow.t >= 39.5,
    `reached t = ${flow.t.toFixed(1)} s of 40 — the wall-clock budget in ` +
    `__settle ran out first, so every reading below is of an unsettled reach`);
  ok("PHYSICS the averaging window actually opened", flow.T >= 19.5,
    `window T = ${flow.T.toFixed(2)} s of 20`);
  // MASS FLUX, IN THE MEAN. Both halves of that matter and the test used to
  // get both wrong.
  //
  // MASS, not discharge: this model is weakly compressible and the VOF fill f
  // doubles as the density, so the quantity continuity makes uniform is the
  // mass flux integral f*u dz, not the volumetric discharge. FS_COL computes
  // that integral, but it used to feed it a fill CLAMPED to 1, discarding the
  // mass in over-full (pressurised) cells -- precisely the compressible part.
  // It now uses the raw fill for the flux and the clamped one for the depth,
  // which are different questions. The clamp biased the flux 0.7% low even on
  // m1, where f only reaches 1.015.
  //
  // IN THE MEAN, not on one frame. Integrating continuity over a column,
  //
  //     d/dt (integral f dz)  +  d/dx (integral f*u dz)  =  0
  //
  // so q is uniform along x only where the column storage is steady. It never
  // is instantaneously: the free surface wobbles, and that wobble is a real
  // dd/dt, not noise to be tolerated. Only <q> over a window long enough for
  // <dd/dt> to vanish is uniform, and this reach is exactly what the averaging
  // engine (docs/averaging.md) is for. The old test averaged NOTHING -- it
  // called __warm(20), which runs analyse() twenty times over the SAME frame
  // without advancing the solver, warming an EMA on twenty copies of one
  // instant. So it measured the instantaneous spread and then needed a
  // tolerance loose enough to swallow it.
  //
  // MEASURED on m1 at Low, settled to t = 40, spread of the column flux over
  // the middle 60% as a fraction of its median:
  //     one frame  0.1115
  //     T =  1 s   0.0585      T =  5 s   0.0308
  //     T =  2 s   0.0406      T = 10 s   0.0132      T = 20 s   0.0022
  // Monotone in T, converging on zero: that IS the continuity statement, and
  // the residual at T = 20 s is the scheme's real error. Reproducible --
  // 0.0020, 0.0019, 0.0019 on three consecutive runs, with the domain volume
  // moving 8.8561 -> 8.861 across the window, i.e. genuinely steady.
  //
  // The gate is 0.01, five times the measured value. It replaces a 0.8 that
  // let the flux range over four fifths of its own median -- most of the way
  // to "any two numbers", and the reason issue #46 read as a conservation bug
  // when it was really an unsettled scene measured on a single frame. This is
  // now a real statement of mass conservation: 0.8 -> 0.01 is a factor of 80.
  ok("PHYSICS the column MASS flux holds one value along the reach, in the mean",
    flow.med > 0 && (flow.qHi - flow.qLo) / flow.med < 0.01,
    `<q> ${flow.qLo.toFixed(4)}–${flow.qHi.toFixed(4)}, median ` +
    `${flow.med.toFixed(4)} m²/s over T = ${flow.T.toFixed(1)} s ` +
    `(spread ${((flow.qHi - flow.qLo) / flow.med).toFixed(4)}; the same reach ` +
    `on one frame spreads ${flow.instSpread.toFixed(4)})`);
  // The signature of the conservation bug this project has already been bitten
  // by: a clamped VOF invents water, so q climbs monotonically downstream
  // while the depth sits perfectly steady. Guard the direction, not the noise.
  ok("PHYSICS discharge does not grow downstream (no invented water)",
    flow.qDn < 1.4 * flow.qUp,
    `upstream third ${flow.qUp.toFixed(3)} → downstream third ${flow.qDn.toFixed(3)} m²/s`);
  ok("PHYSICS m1 runs subcritical (mild backwater)", flow.dMid > flow.dcMid,
    `d ${flow.dMid.toFixed(3)} vs d_c ${flow.dcMid.toFixed(3)}`);
  ok("PHYSICS the energy line falls downstream", flow.HFalls);

  // The control-volume budget, on the same settled reach. These are the three
  // conservation laws the Control volume is FOR, so they are asserted where a scene
  // is actually steady — an instantaneous integral on a wobbling free surface
  // closes to only a few per cent, and one taken mid-spin-up does not close at
  // all, because the reach is still filling.
  const cv = await B.evaluate(`(() => {
    const W = APP.sim.W, H = APP.sim.H;
    const box = [0.35 * W, 0, 0.62 * W, H];
    let sE = 0, n = 0;
    for (let k = 0; k < 60; k++) { APP.frames(2); sE += APP.boxFlux.apply(null, box).total.E; n++; }
    const f = APP.boxFlux.apply(null, box);
    const g = APP.boxForce.apply(null, box);
    return { E: sE / n, fx: f.fx, gx: g.fx,
             // Both integrals walk the same faces: boxForce's mdot is the mass
             // flux, boxFlux's Q the volume flux, and with nothing pressurised
             // (f <= 1 everywhere on a free-surface reach) they are the same
             // number over rho.
             // Compared on the INFLOW face, not on the net: the net is a small
             // residual of two large opposite numbers, so the sign of its
             // difference says nothing. On one face every cell flows the same
             // way and the inequality is exact.
             Qin: f.edges.left.Q, mdotIn: f.edges.left.mdot / 1000,
             bed: Math.abs(f.edges.bed.Q), left: f.edges.left.Q, right: f.edges.right.Q };
  })()`);
  // NOT an absolute closure test. How nearly m1's discharge balances over a
  // window is a property of the SCENE — the neighbouring "discharge holds one
  // value along the reach" check is what measures that, and it is marginal on
  // this scene for the same reason. What must hold here is that the two face
  // integrals agree with each other, which is a property of the CODE.
  // They are NOT the same number, and the difference is the physics: Q is the
  // geometric volume flux (min(f, 1)) and mdot the mass flux (f), and in this
  // model f > 1 everywhere below the surface — that IS the pressure, via
  // p/rho = c^2 (f - 1). So the water carries more mass than volume, by the
  // compression p/(rho c^2), which is a fraction of a per cent at the usual
  // celerity. Same sign, same size, ordered the one way round physics allows.
  ok("PHYSICS volume flux and mass flux differ only by the compression",
    cv.Qin * cv.mdotIn > 0 && Math.abs(cv.Qin) <= Math.abs(cv.mdotIn) * 1.0001 &&
    Math.abs(cv.Qin - cv.mdotIn) < 0.05 * Math.abs(cv.mdotIn),
    `Q ${cv.Qin.toFixed(5)} m²/s vs mdot/rho ${cv.mdotIn.toFixed(5)}` +
    ` (${(100 * (cv.mdotIn - cv.Qin) / cv.mdotIn).toFixed(2)}% compressed)`);
  ok("PHYSICS water crosses the box in at one end and out at the other",
    cv.left < 0 && cv.right > 0,
    `left ${cv.left.toFixed(4)}, right ${cv.right.toFixed(4)} m²/s`);
  ok("PHYSICS the box's solid bed passes nothing", cv.bed < 1e-9, String(cv.bed));
  // A reach with friction in it cannot gain energy. Outward-positive, so a
  // loss is negative — but WHERE that is asserted decides whether it is a
  // test or a coin toss, and this used to be a coin toss.
  //
  // It ran on the m1 box, on a single instant, at sim t = 30. Three things
  // were wrong at once. m1 is a backwater POOL: it dissipates almost nothing,
  // so the quantity being signed is near zero. m1 is not settled at t = 30 —
  // its volume is still climbing (8.75 m² against 8.86 settled) and does not
  // level off until about t = 45. And a single instant carries the whole
  // surface wobble. MEASURED, m1 box, 40 samples over 8 s of sim time after a
  // genuine t = 60 settle (net Q then 1.4e-4 m²/s, i.e. actually steady):
  //     E = -6.5 W/m with a standard deviation of 37 W/m, range -91 to +73,
  //     NEGATIVE IN 50% OF SAMPLES.
  // The fluctuation is 5.7x the mean and the sign is a fair coin. It passed
  // for years only because the settle failure upstream kept the scene in a
  // draining transient, where E is strongly negative for the wrong reason.
  //
  // m3 — a jump onto a mild apron — is where this physics is actually large.
  // Same measurement, same box fractions, 40 samples: E = -910 W/m, sd 399,
  // and the LEAST negative sample is still -97 W/m, so 40 of 40 are negative.
  // (h23 dissipates more but surges: mean -2005, sd 2056, 7% of samples
  // positive. A jump that moves on its apron is the wrong place to sign an
  // instantaneous budget.) The gate is the mean over a window, not one frame,
  // and it asks for a real loss rather than a sign.
  const dis = await B.evaluate(`(() => {
    APP.loadScene("m3", false); __low();
    const t0 = Date.now();
    while (APP.sim.t < 30 && Date.now() - t0 < 90000) APP.tick(200);
    const W = APP.sim.W, H = APP.sim.H, Es = [];
    for (let k = 0; k < 24; k++) {
      const t1 = Date.now(), tgt = APP.sim.t + 0.2;
      while (APP.sim.t < tgt && Date.now() - t1 < 5000) APP.tick(20);
      Es.push(APP.SIM.boxFlux(0.20 * W, 0, 0.80 * W, H).total.E);
    }
    const mean = Es.reduce((a, b) => a + b, 0) / Es.length;
    return { mean, worst: Math.max.apply(null, Es), n: Es.length, t: APP.sim.t };
  })()`);
  ok("PHYSICS m3 settled before its energy budget is read", dis.t >= 29.5,
    "reached t = " + dis.t.toFixed(1) + " s of 30");
  ok("PHYSICS the reach loses energy through the box",
    dis.mean < -200 && dis.worst < 0,
    `mean ${dis.mean.toFixed(0)} W/m over ${dis.n} samples, ` +
    `least-negative sample ${dis.worst.toFixed(0)} W/m`);
  // The same face integral by two routes; if they drift, one has been edited
  // and the other has not.
  // A SECTION at the box's own left face is the same integral over the same
  // line, reached a different way — one walks grid faces, the other samples an
  // arbitrary line. If they disagree by more than the discretisation, one of
  // them is wrong.
  const sec = await B.evaluate(`(() => {
    const W = APP.sim.W, H = APP.sim.H;
    const x = 0.35 * W;
    const line = APP.SIM.lineFlux(x, 0, x, H);
    const box = APP.SIM.boxFlux(x, 0, 0.62 * W, H);
    return { lineQ: Math.abs(line.Q), faceQ: Math.abs(box.edges.left.Q),
             lineE: Math.abs(line.E), faceE: Math.abs(box.edges.left.E),
             n: line.n, len: line.len };
  })()`);
  ok("PHYSICS a section samples the water at all", sec.n > 10 && sec.lineQ > 0,
    sec.n + " samples over " + sec.len.toFixed(2) + " m");
  ok("PHYSICS a section agrees with the control-volume face it lies on",
    Math.abs(sec.lineQ - sec.faceQ) < 0.06 * Math.max(sec.faceQ, 1e-9),
    `line ${sec.lineQ.toFixed(4)} vs face ${sec.faceQ.toFixed(4)} m²/s`);
  ok("PHYSICS and carries the same energy across it",
    Math.abs(sec.lineE - sec.faceE) < 0.10 * Math.max(sec.faceE, 1e-9),
    `line ${sec.lineE.toFixed(1)} vs face ${sec.faceE.toFixed(1)} W/m`);

  // ---- ENCLOSED VOIDS (issue: "air gaps inside the fluid")
  //
  // A cell with f < 0.5 that is NOT reachable from the atmosphere is a hole
  // inside the water. It is not a display artefact: this reads the fill field
  // straight off the GPU and flood-fills air inward from the domain edges, so
  // what it counts is enclosed void, never the open air above a free surface
  // or the gap between a plunging jet and its pool (a per-column test counts
  // both of those and is why the first version of this check was wrong).
  //
  // These are REAL and this model makes them: the EOS is one-sided with
  // gravity on, p = c^2 max(f-1, 0), so an under-full cell has ZERO pressure
  // and nothing pulls a rarefied cell of a vortex core back shut. press() in
  // js/shaders.js says so itself, in the comment explaining why the plan view
  // (g = 0) turns the two-sided branch on: "without that, every strong vortex
  // core slowly cavitates into a hole." In the vertical plane that branch is
  // off, because there f < 1 IS the free surface.
  //
  // So this is a BOUND, not a zero. MEASURED at Low, driven to sim t = 20,
  // as a fraction of the water volume in the domain:
  //     dambreak 0.00%   wave 0.00%   m3 0.18%   m1 0.52%
  //     h23      1.11%   jet  2.03%
  // The gate is 4%, about twice the worst scene. It exists so the number
  // cannot grow silently: a change to the advection, the flux cap or the EOS
  // that starts shredding the interior will trip it here rather than in a
  // lecture. Tightening it is welcome; a rise means something got worse.
  const voidf = await B.evaluate(`(() => {
    APP.loadScene("h23", false); __low();
    const t0 = Date.now();
    while (APP.sim.t < 20 && Date.now() - t0 < 90000) APP.tick(200);
    const S = APP.sim, nx = S.nx, ny = S.ny, dx = S.dx;
    const gl = document.getElementById("view").getContext("webgl2");
    const F = new Float32Array(nx * ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, F);
    const sol = (i, j) => { const m = S.mask[j * nx + i];
      return m >= 192 ? 1 : (m >= 64 ? (S.p.valveClosed > 0.5 ? 1 : 0) : 0); };
    const f_ = (i, j) => F[(j * nx + i) * 4];
    const seen = new Uint8Array(nx * ny), st = [];
    const push = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      const k = j * nx + i;
      if (seen[k] || sol(i, j) || f_(i, j) >= 0.5) return; seen[k] = 1; st.push(k); };
    for (let i = 0; i < nx; i++) { push(i, ny - 1); push(i, ny - 2); }
    for (let j = 0; j < ny; j++) { push(0, j); push(1, j); push(nx - 1, j); push(nx - 2, j); }
    while (st.length) { const k = st.pop(), j = (k / nx) | 0, i = k - j * nx;
      push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
    let vol = 0, water = 0, cells = 0, worst = 1;
    for (let i = 0; i < nx; i++) for (let j = 1; j < ny - 1; j++) {
      if (sol(i, j)) continue;
      const f = f_(i, j); water += Math.min(f, 2) * dx * dx;
      if (f >= 0.5 || seen[j * nx + i]) continue;
      cells++; vol += (1 - f) * dx * dx; if (f < worst) worst = f;
    }
    return { cells, vol, water, frac: vol / Math.max(water, 1e-9), worst, t: APP.sim.t };
  })()`);
  ok("PHYSICS h23 settled far enough to judge its interior", voidf.t >= 19.5,
    "reached t = " + voidf.t.toFixed(1) + " s of 20");
  ok("PHYSICS enclosed voids stay a small fraction of the water",
    voidf.frac < 0.04,
    `${voidf.cells} enclosed cells, ${(100 * voidf.frac).toFixed(2)}% of ` +
    `${voidf.water.toFixed(2)} m² of water, emptiest f = ${voidf.worst.toFixed(3)}`);

  ok("PHYSICS boxFlux and boxForce report the same force",
    Math.abs(cv.fx - cv.gx) < 1e-6 * Math.max(1, Math.abs(cv.gx)),
    cv.fx + " vs " + cv.gx);
};

SUITES.scenes = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=sandbox`);
  const ids = await B.evaluate("SCENES.list.map(s => s.id)");
  for (const id of ids) {
    let r;
    try {
      r = await B.evaluate(`(() => {
        APP.loadScene(${JSON.stringify(id)}, false);
        __low(); APP.tick(300);
        APP.frames(2);
        const A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
        const p = APP.probe(APP.sim.W * 0.5, APP.sim.H * 0.5);
        return { vol: APP.volume(), t: APP.sim.t,
                 finite: Number.isFinite(p.u) && Number.isFinite(p.w) && Number.isFinite(p.f),
                 dOk: A.d.every(Number.isFinite) };
      })()`);
    } catch (e) {
      ok("SCENE " + id + " boots and steps", false, e.message);
      continue;
    }
    // `> 0`, not `Number.isFinite`. APP.volume() sums the CACHED column
    // reduction (AGENTS.md's own sharp edge: it returns 0 until
    // SIM.columns(true) forces a readback), and 0 is perfectly finite — so a
    // finiteness check here would keep passing across all forty scenes if an
    // ordering change ever left the cache stale. The analyse() call above
    // forces the readback; this is the assertion that notices when it stops.
    ok("SCENE " + id + " boots and steps",
      r.t > 0 && r.finite && r.dOk && r.vol > 0,
      JSON.stringify(r));
  }
};

SUITES.docs = async (B) => {
  // The About button opens docs/view.html off the Pages build, and a page that
  // renders markdown either renders it or hands the reader its source code.
  await B.goto(`http://localhost:${PORT}/docs/view.html?doc=numerics.md`,
    "!!document.querySelector('#doc h1, #doc .note')");
  const d = await B.evaluate(`(() => new Promise((done) => {
    const check = () => {
      if (document.querySelector("#doc h1") || document.querySelector("#doc .note")) {
        done({
          h1: (document.querySelector("#doc h1") || {}).textContent || null,
          h2: document.querySelectorAll("#doc h2").length,
          tables: document.querySelectorAll("#doc table").length,
          math: document.querySelectorAll("#doc .mathblock").length,
          note: !!document.querySelector("#doc .note"),
          // A link to a sibling document comes back through the reader, or the
          // second hop dumps raw markdown after the first one rendered.
          hops: [...document.querySelectorAll("#doc a")]
                  .filter((a) => /view[.]html[?]doc=/.test(a.getAttribute("href") || "")).length,
          raw: [...document.querySelectorAll("#doc a")]
                  .filter((a) => /^[a-z0-9-]+[.]md$/i.test(a.getAttribute("href") || "")).length,
          title: document.title,
        });
      } else setTimeout(check, 100);
    };
    check();
  }))()`);
  ok("DOCS the reader renders numerics.md rather than showing its source",
    !d.note && d.h1 === "Numerics", d.note ? "fell back to the note" : "h1 = " + d.h1);
  ok("DOCS its sections, tables and equations all come through",
    d.h2 > 5 && d.tables > 0 && d.math > 10,
    `${d.h2} sections, ${d.tables} tables, ${d.math} equations`);
  ok("DOCS a link to a sibling document stays inside the reader",
    d.hops > 0 && d.raw === 0, `${d.hops} through the reader, ${d.raw} raw`);
  ok("DOCS the page takes the document's own title", /Numerics/.test(d.title), d.title);
};

SUITES.pack = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=sandbox`);
  const ids = await B.evaluate("EX.all().map(c => c.id)");
  ok("PACK the register is populated", ids.length > 30, ids.length + " cards");
  for (const id of ids) {
    let r;
    try {
      // The picker applies its rig a microtask later — EX.ready is the handle
      // for that, and without awaiting it every read is one exercise behind.
      r = await B.evaluate(`(async () => {
        APP.pickExercise(${JSON.stringify(id)});
        await EX.ready;
        APP.frames(3);
        return { ex: EX.current && EX.current.id, scene: APP.sim.scene.id,
                 field: APP.state.gaugeField, segs: APP.sim.segs.length };
      })()`);
    } catch (e) {
      ok("PACK " + id + " applies", false, e.message);
      continue;
    }
    ok("PACK " + id + " applies onto its scene",
      r.ex === id && !!r.scene && ["h", "d", "speed"].includes(r.field),
      JSON.stringify(r));
  }
};

// Group F — the transport accumulator. The vof pass emits its own limited face
// fluxes on a second render target, so the discrete mass balance can be
// certified with the numbers the scheme actually used rather than with a
// cell-centred reconstruction of them.
//
// The residual is NOT bounded by a constant: it is the running-mean
// recursion's own float32 drift and GROWS as √T. Each substep does
// ⟨F⟩ ← ⟨F⟩ + k(F − ⟨F⟩) in float32, so each face mean carries a random walk
// of about ½·ulp⟨F⟩ per step; over n = T/Δt steps that is ≈ ½·ulp⟨F⟩·√n, and
// the residual divides a face DIFFERENCE by Δx:
//
//     R_max  ≈  C · ε · ‖⟨F⟩‖∞ · √(T/Δt) / Δx,        ε = 2⁻²³
//
// Measured on h23 at Low (Δx = 16.3 mm, Δt = 2.626e-4 s) over a 256× range in
// substep count — log-log slope 0.472 for the max and 0.464 for the mean, so
// it is the whole field drifting, not a few outlier cells:
//
//        n      T (s)      max         C
//      200     0.0525   2.067e-4    0.439
//      800     0.2101   4.633e-4    0.538
//     3200     0.8403   7.830e-4    0.472
//    12800     3.3613   1.297e-3    0.399
//    51200    13.4454   3.253e-3    0.513
//
// C sits in 0.40–0.54 here and reaches 0.745 on an ANGLE/D3D11 ladder, so the
// gate uses C = 3.0 — 4× the worst measured. The margin is scale-invariant
// because both sides grow as √T, which is the whole point: a constant
// tolerance is only ever right at one window length. For contrast, a mis-tiled
// face would put the residual at the scale of the divergence itself, which
// runs to 135 s⁻¹ here — five orders of magnitude clear.
//
// Below n ≈ 100 a different and smaller regime takes over, the storage term's
// ½·ulp(f)/Δt quantisation floor (2.2697448730469e-4 measured against
// 2.2697448730469e-4 predicted at n = 1). The windows below are well past it.
const AVG_C = 3.0;
const avgBound = (Fmax, T, dt, dx) =>
  AVG_C * 1.1920929e-7 * Fmax * Math.sqrt(T / dt) / dx;

SUITES.avg = async (B) => {
  await B.goto(`http://localhost:${PORT}/?scene=h23`);
  const r = await B.evaluate(`(() => {
    __low();
    APP.tick(600);                       // settle a little before the window opens
    APP.SIM.avgStart();
    // APP.tick(n) is EXACTLY n substeps, so T = n*dt is reproducible on every
    // machine. APP.frames() is NOT: the substep governor picks a
    // machine-dependent count per frame, so T — and with it the √T
    // residual -- would scale with how fast the box is, and the gate would sit
    // wherever that left it.
    APP.tick(1200);
    const res = APP.SIM.transportResidual(), T = APP.SIM.avgT();
    APP.tick(2400);                      // 3x the window
    const res2 = APP.SIM.transportResidual(), T2 = APP.SIM.avgT();
    const active = APP.SIM.avgActive();
    APP.SIM.avgStop();
    return { T, T2, active, dt: APP.SIM.dt(), dx: APP.sim.dx,
             max: res.max, mean: res.mean, n: res.n, nSrc: res.nSrc, Fmax: res.Fmax,
             maxSrc: res.maxSrc, Smax: res.Smax,
             max2: res2.max, Fmax2: res2.Fmax,
             maxSrc2: res2.maxSrc, Smax2: res2.Smax };
  })()`);
  const b1 = avgBound(r.Fmax, r.T, r.dt, r.dx);
  const b2 = avgBound(r.Fmax2, r.T2, r.dt, r.dx);
  console.log(`\n    T=${r.T.toFixed(4)}s->${r.T2.toFixed(4)}s dt=${r.dt.toExponential(3)}s` +
    ` Fmax=${r.Fmax.toFixed(3)} max=${r.max.toExponential(3)}->${r.max2.toExponential(3)}` +
    ` bound=${b1.toExponential(3)}->${b2.toExponential(3)}` +
    ` margin=${(b1 / r.max).toFixed(1)}x/${(b2 / r.max2).toFixed(1)}x` +
    ` cells=${r.n} src=${r.nSrc}`);
  ok("avg accumulator reports a positive window", r.T > 0 && r.active, JSON.stringify(r));
  ok("avg residual has interior cells to report on", r.n > 100, JSON.stringify(r));
  // F1: the transport balance is an IDENTITY of the scheme, so all that is
  // left is the recursion's own drift — which the bound tracks as √T.
  ok("F1 transport residual is at the sqrt(T) drift bound",
     r.max < b1 && r.max2 < b2,
     `max ${r.max} / bound ${b1}   max2 ${r.max2} / bound2 ${b2}`);
  // Growth must be SUB-LINEAR in T. Over the 3× window below √T predicts
  // 1.73×; the old factor of 4 was larger than 3, so pure linear growth — the
  // thing this is here to forbid — passed it. The window is pinned to a fixed
  // substep count, so the ratio is reproducible: 1.995 on this ANGLE/D3D11
  // path, identical to four decimal places across five runs, about 1.15x the
  // √T prediction. 2.6 is 1.30x that measurement and
  // 1.50x the prediction, with linear growth (3.0) still outside it.
  ok("F1 residual grows no faster than sqrt(T)", r.max2 < r.max * 2.6 + 1e-9,
     `max ${r.max} -> ${r.max2} (ratio ${(r.max2 / r.max).toFixed(3)})` +
     ` over T ${r.T} -> ${r.T2}`);

  // F4: the sponge, the Dirichlet bands and every positivity-clamp event live
  // in the ⟨S⟩ ≠ 0 population — counted, never silently excluded — and the §5
  // identity holds there too, because ⟨S⟩ carries the whole non-conservative
  // difference.
  //
  // This population does NOT follow F1's √T drift law cleanly: measured
  // 9.466e-4 → 2.987e-3 over the 3× window below (ratio 3.16 — nearer linear
  // than the 1.73 √T predicts). The per-substep rate is a DIFFERENCE of two
  // O(1) fills over h, so each sample carries an absolute rounding of about
  // ½·ulp(f)/h ≈ 2.3e-4 s⁻¹ here, and the max over a 305-cell heavy-tailed
  // population is a noisier statistic than F1's 34k-cell one. So the gate is
  // a SEPARATION, not a drift law: a broken source accounting — an h-weighted
  // increment (the A6 bug class), a missed clamp event, a dropped sponge term
  // — errs at the scale of ⟨S⟩ itself (Smax = 1.44 s⁻¹ here), three orders
  // above the measured drift. Gate at 1% of that scale; measured margin
  // 15.2x / 4.8x at n = 1200 / 3600 on this ANGLE/D3D11 path.
  const s1 = 0.01 * Math.max(r.Smax, 1);
  const s2 = 0.01 * Math.max(r.Smax2, 1);
  console.log(`    F4: src=${r.nSrc} Smax=${r.Smax.toFixed(3)}` +
    ` maxSrc=${r.maxSrc.toExponential(3)}->${r.maxSrc2.toExponential(3)}` +
    ` gate=${s1.toExponential(3)}->${s2.toExponential(3)}` +
    ` margin=${(s1 / r.maxSrc).toFixed(1)}x/${(s2 / r.maxSrc2).toFixed(1)}x`);
  ok("F4 source cells are counted, not lost", r.nSrc > 100, `nSrc ${r.nSrc}`);
  ok("F4 balance including <S> holds in sponge and source cells",
     r.maxSrc < s1 && r.maxSrc2 < s2,
     `maxSrc ${r.maxSrc} / gate ${s1}   maxSrc2 ${r.maxSrc2} / gate2 ${s2}`);

  // What this does and does NOT prove: prog.vof is built from FS_VOF and
  // prog.vofA from withAccum(FS_VOF) — the SAME source, both already using the
  // extracted fluxX/fluxZ. An unfaithful extraction would move both fields
  // identically and `bad` would still be 0, so this is NOT a guard on the
  // extraction. It guards the property it names: adding the second render
  // target does not perturb the solution. The extraction itself is guarded by
  // the physics suite and by the offline float32 replay of both revisions.
  const s = await B.evaluate(`(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const snap = () => {
      const n = APP.sim.nx * APP.sim.ny, b = new Float32Array(n * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, APP.sim.F.read.fbo);
      gl.readPixels(0, 0, APP.sim.nx, APP.sim.ny, gl.RGBA, gl.FLOAT, b);
      return b;
    };
    APP.SIM.avgStop();
    APP.SIM.resetWater(); APP.tick(60); const plain = snap();
    APP.SIM.resetWater(); APP.SIM.avgStart(); APP.tick(60); const acc = snap();
    APP.SIM.avgStop();
    let diff = 0, bad = 0;
    for (let i = 0; i < plain.length; i += 4) {
      const d = Math.abs(plain[i] - acc[i]);
      if (d !== 0) { bad++; if (d > diff) diff = d; }
    }
    return { diff, bad, n: plain.length / 4 };
  })()`);
  ok("F1 the ACCUM variant does not perturb the solution",
     s.bad === 0, JSON.stringify(s));

  // The MRT selector must compare TEXTURE IDENTITY, not `S.F.write === S.F.b`
  // — that is a tautology (the double buffer's getter returns b), so a wrong
  // selector keeps picking the same framebuffer and, after the first swap,
  // writes f and the accumulator into mismatched textures. It only shows up
  // once the ping-pong has flipped, so read back after an ODD substep count.
  const p = await B.evaluate(`(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    APP.SIM.avgStart();
    APP.tick(1201);                               // odd: the two buffers end flipped
    const res = APP.SIM.transportResidual(), T = APP.SIM.avgT();
    const act = APP.SIM.avgActive();
    // Every GL object the accumulator owns, by handle, taken BEFORE the stop:
    // three ping-pongs (transport, Favre field, columns) and the two MRT
    // framebuffers. avgActive() alone is just !!S.avg, so a disposeAvg that
    // deleted nothing would pass it while stranding ~44 MB of RGBA32F at
    // Ultra — exactly the leak release() was written for.
    const A = APP.sim.avg;
    const tex = [A.T.a.tex, A.T.b.tex, A.fld.a.tex, A.fld.b.tex,
                 A.col.a.tex, A.col.b.tex];
    const fbo = [A.T.a.fbo, A.T.b.fbo, A.fld.a.fbo, A.fld.b.fbo,
                 A.col.a.fbo, A.col.b.fbo, A.fboA, A.fboB];
    const live = () => tex.filter((t) => gl.isTexture(t)).length
                     + fbo.filter((f) => gl.isFramebuffer(f)).length;
    const nObj = tex.length + fbo.length, liveBefore = live();
    APP.SIM.avgStop();
    const liveAfter = live();
    // and the accumulator is genuinely gone, not merely flagged off.
    let reachable = true;
    try { APP.SIM.avgColumns(); } catch (e) { reachable = false; }
    return { T, max: res.max, n: res.n, Fmax: res.Fmax, dt: APP.SIM.dt(),
             dx: APP.sim.dx, act, actAfter: APP.SIM.avgActive(),
             nObj, liveBefore, liveAfter, reachable, err: gl.getError() };
  })()`);
  ok("avg ping-pongs stay in phase across an odd substep count",
     p.T > 0 && p.n > 100 && p.max < avgBound(p.Fmax, p.T, p.dt, p.dx),
     JSON.stringify(p));
  ok("avgStop releases the accumulator", p.act === true && p.actAfter === false,
     JSON.stringify(p));
  ok("avgStop deletes every GL object the accumulator owns",
     p.liveBefore === p.nObj && p.liveAfter === 0 && p.err === 0,
     JSON.stringify(p));
  ok("avgColumns is unreachable once the window is closed",
     p.reachable === false, JSON.stringify(p));

  // R must restart the window — and it also respecifies the f textures the MRT
  // framebuffers attach, so this is the invalid-framebuffer case too.
  const q = await B.evaluate(`(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    APP.SIM.avgStart();
    APP.tick(300);
    const before = APP.SIM.avgT();
    APP.SIM.resetWater();
    const after = APP.SIM.avgT();
    APP.tick(300);
    const res = APP.SIM.transportResidual();
    const err = gl.getError();
    const stillOn = APP.SIM.avgActive();
    APP.SIM.avgStop();
    return { before, after, stillOn, max: res.max, n: res.n, Fmax: res.Fmax,
             err, dt: APP.SIM.dt(), dx: APP.sim.dx };
  })()`);
  ok("avg resetWater restarts the window and rebuilds the MRT targets",
     q.before > 0 && q.after === 0 && q.stillOn && q.err === 0 && q.n > 100 &&
     q.max < avgBound(q.Fmax, 300 * q.dt, q.dt, q.dx),
     JSON.stringify(q));

  // A rebuild is a RESET condition, not a stop condition (docs/averaging.md
  // section 9): averaging must survive a resolution change, zeroed.
  const g = await B.evaluate(`(() => {
    APP.SIM.avgStart();
    APP.tick(300);
    const before = APP.SIM.avgT();
    const c = CONTROLS.find((x) => x.id === "budget");
    c.set("Medium"); c.set("Low");                 // two rebuilds
    const after = APP.SIM.avgT(), on = APP.SIM.avgActive();
    APP.tick(300);
    const res = APP.SIM.transportResidual();
    APP.SIM.avgStop();
    return { before, after, on, max: res.max, n: res.n };
  })()`);
  ok("avg survives a resolution rebuild, zeroed",
     g.before > 0 && g.on === true && g.after === 0 && g.n > 100,
     JSON.stringify(g));

  // A geometry edit is a RESET condition too (docs/averaging.md §9): the
  // walls the mean was accumulated through are no longer the walls on
  // screen. The reset lives in rasterise(), which is the choke point for
  // every mask-changing path — the drawing tools and the boundary-open
  // toggles in main.js — so drawing one wall exercises all of them.
  const e = await B.evaluate(`(() => {
    APP.SIM.avgStart();
    APP.tick(300);
    const before = APP.SIM.avgT(), segs0 = APP.sim.segs.length;
    const S = APP.sim;                       // a short wall, clear of the water
    APP.SIM.addSeg(0.35 * S.W, 0.85 * S.H, 0.35 * S.W, 0.95 * S.H, 0.02, 255);
    const after = APP.SIM.avgT(), on = APP.SIM.avgActive();
    APP.tick(300);
    const res = APP.SIM.transportResidual();
    const r = { before, after, on, segs0, segs1: APP.sim.segs.length,
                max: res.max, n: res.n, Fmax: res.Fmax,
                dt: APP.SIM.dt(), dx: APP.sim.dx };
    APP.SIM.clearSegs(); APP.SIM.avgStop();
    return r;
  })()`);
  ok("avg a geometry edit resets the window",
     e.before > 0 && e.after === 0 && e.on === true &&
     e.segs1 === e.segs0 + 1 && e.n > 100 &&
     e.max < avgBound(e.Fmax, 300 * e.dt, e.dt, e.dx),
     JSON.stringify(e));

  // A VALVE TOGGLE is a geometry edit in everything but name (§9): it leaves
  // the rasterised mask alone, but every shader's SO() and the residual's own
  // solidLo read p.valveClosed, so flipping it moves every valve texel between
  // solid and open. Cells that were solid had their accumulator frozen by
  // ACC_KEEP while T ran on, so reopening them would leave ⟨F⟩ weighted by a
  // window they were absent for — the residual around the valve rises with no
  // physical cause, on h23 where the valve IS the exercise. SIM.setValve is
  // the single writer; the toolbar, the V key and the rig-apply path all go
  // through it.
  const v = await B.evaluate(`(() => {
    APP.SIM.avgStart();
    APP.tick(300);
    const before = APP.SIM.avgT(), v0 = APP.sim.p.valveClosed;
    APP.SIM.setValve(v0 <= 0.5);                  // flip it
    const after = APP.SIM.avgT(), on = APP.SIM.avgActive(), v1 = APP.sim.p.valveClosed;
    APP.tick(300);
    const mid = APP.SIM.avgT();
    APP.SIM.setValve(v1 > 0.5);                   // write the SAME value again
    const noop = APP.SIM.avgT();
    APP.SIM.setValve(v0 > 0.5);                   // put the scene back
    APP.SIM.avgStop();
    return { before, after, on, v0, v1, mid, noop };
  })()`);
  ok("avg a valve toggle resets the window",
     v.before > 0 && v.after === 0 && v.on === true && v.v1 !== v.v0,
     JSON.stringify(v));
  // ...but only when it actually moves. The rig-apply path writes the flag on
  // every load whether or not it changed, and pressing V twice must not cost
  // two windows.
  ok("avg an unchanged valve write does not reset the window",
     v.mid > 0 && v.noop === v.mid, JSON.stringify(v));

  // The CELERITY slider rewrites f in place (rescaleFill holds P = c²(f−1)
  // fixed), and f(0) was snapshotted before it. The endpoint term
  // (f(T)−f(0))/T would swallow the whole injected step — order 7% of f in
  // every pressurised cell, ~7e-2 s⁻¹ at T = 1 s against an F1 bound near
  // 1e-3 — with nothing in ⟨F⟩ or ⟨S⟩ to answer it. Driven through the panel
  // control, which is how a user reaches it.
  const cw = await B.evaluate(`(() => {
    APP.SIM.avgStart();
    APP.tick(300);
    const before = APP.SIM.avgT(), c0 = APP.sim.p.c;
    const ctl = CONTROLS.find((x) => x.id === "cel");
    ctl.set(Math.round(c0 * 0.5));
    const after = APP.SIM.avgT(), on = APP.SIM.avgActive(), c1 = APP.sim.p.c;
    // Run the NEW window at the NEW celerity and close the balance in it. Do
    // NOT restore c first: setting it back is the exact inverse of the
    // rescale, so f(T) would return to a value consistent with the stale
    // f(0) and the storage term would hide the injection it is here to catch.
    APP.tick(300);
    const res = APP.SIM.transportResidual();
    const dt = APP.SIM.dt();                      // at the NEW c, as the bound needs
    ctl.set(c0);                                  // and put the scene back
    APP.SIM.avgStop();
    return { before, after, on, c0, c1, max: res.max, n: res.n, Fmax: res.Fmax,
             dt, dx: APP.sim.dx };
  })()`);
  ok("avg a celerity change resets the window",
     cw.before > 0 && cw.after === 0 && cw.on === true && cw.c1 !== cw.c0,
     JSON.stringify(cw));
  // The consequence, measured rather than assumed: with a stale f(0) the
  // endpoint term carries the whole injected step and the balance opens up.
  ok("avg the transport balance closes across a celerity change",
     cw.n > 100 && cw.max < avgBound(cw.Fmax, 300 * cw.dt, cw.dt, cw.dx),
     JSON.stringify({ ...cw, bound: avgBound(cw.Fmax, 300 * cw.dt, cw.dt, cw.dx) }));

  // The Favre display field (Task 6): a per-FRAME accumulator, distinct from
  // the transport accumulator exercised above — APP.frames() drives tickFrame
  // (and with it SIM.avgStepField), where APP.tick() drives SIM.step alone.
  const g2 = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(180);
    const A = APP.SIM.avgField();
    const S = APP.sim, nx = S.nx, ny = S.ny;
    let wet = 0, finite = true, fmax = 0;
    for (let k = 0; k < nx*ny; k++) {
      if (!Number.isFinite(A.fbar[k]) || !Number.isFinite(A.ubar[k])) { finite = false; break; }
      if (A.fbar[k] > 0.5) wet++;
      if (A.fbar[k] > fmax) fmax = A.fbar[k];
    }
    APP.SIM.avgStop();
    return { keys: Object.keys(A).sort(), wet, finite, fmax, n: nx*ny };
  })()`);
  ok("avgField returns the four mean-state arrays",
     g2.keys.join(",") === "fbar,pbar,ubar,wbar", g2.keys.join(","));
  ok("avgField is finite everywhere", g2.finite);
  ok("avgField finds the water", g2.wet > 0.05 * g2.n, `wet ${g2.wet}/${g2.n}`);
  ok("mean fill is a fill (slot storage excepted)", g2.fmax < 1.5, `fmax ${g2.fmax}`);

  // The collocation trap the shader was built around (Task 6 brief): u lives
  // on the west face, so a shader that weighted f by the face value alone —
  // instead of centring first — would put a directional bias into every
  // mean. avgField()'s wet/finite/fmax checks above do not exercise this at
  // all (they only touch the f/P channels), so this is a dedicated check
  // that ubar sits on the CENTRED velocity, not the west face.
  //
  // Comparison, not an absolute, so it survives the flow's own unsteadiness.
  // A single instantaneous patch turned out to be the wrong reference: the
  // strongest instantaneous |faceE - face| in a settled channel is a
  // transient eddy (a momentary sign flip), not a steady spatial gradient —
  // measured once at a cell where face=0.416, faceE=-0.886, and the window
  // mean sat nowhere near either. So the reference here is an INDEPENDENT
  // time-weighted mean, hand-rolled in JS from the same `patch()` readback
  // FS_ACC itself reads from — not a second call into avgField() — sampled
  // over the SAME window the accumulator is open for, weighted by each
  // frame's actual simulated-time advance (`S.t` before/after), which is
  // the same weighting rule docs/averaging.md §4.4 gives the GPU accumulator.
  // Agreement between two independently-computed means, one CPU one GPU,
  // discriminates the collocation bug without being a single noisy sample.
  const cl = await B.evaluate(`(() => {
    __low(); APP.tick(600);                // settle before the window opens
    const S = APP.sim, nx = S.nx, ny = S.ny;
    APP.SIM.avgStart();
    const nSamp = 40;
    let sum = null, w = 0, i0 = 0, totalT = 0;
    for (let s = 0; s < nSamp; s++) {
      const t0 = S.t;
      APP.frames(1);
      const dtAdv = S.t - t0;
      const P = APP.SIM.patch(0, S.W);
      if (!sum) { sum = new Float64Array(P.buf.length); w = P.w; i0 = P.i0; }
      if (dtAdv > 0) {
        for (let k = 0; k < P.buf.length; k++) sum[k] += P.buf[k] * dtAdv;
        totalT += dtAdv;
      }
    }
    const A = APP.SIM.avgField();
    const uAt = (i, j) => sum[((j * w) + (i - i0)) * 4] / totalT;
    let best = null, bestGap = -1;
    for (let j = 2; j < ny - 2; j++) {
      for (let i = 2; i < nx - 2; i++) {
        const k = j * nx + i;
        if (A.fbar[k] <= 0.9) continue;               // reliably wet in the mean
        const face = uAt(i, j), faceE = uAt(i + 1, j);
        const gap = Math.abs(faceE - face);           // 2x |centred - face|
        if (gap > bestGap) { bestGap = gap; best = { i, j, k, face, faceE }; }
      }
    }
    APP.SIM.avgStop();
    if (!best) return { found: false, totalT };
    const centred = 0.5 * (best.face + best.faceE);
    const ubar = A.ubar[best.k];
    return { found: true, i: best.i, j: best.j, face: best.face, faceE: best.faceE,
             centred, ubar, dCentred: Math.abs(ubar - centred), dFace: Math.abs(ubar - best.face),
             totalT };
  })()`);
  console.log(`\n    collocation: cell (${cl.i},${cl.j}) over T=${cl.totalT.toFixed(4)}s` +
    ` face=${cl.face.toFixed(4)} faceE=${cl.faceE.toFixed(4)} centred=${cl.centred.toFixed(4)}` +
    ` ubar=${cl.ubar.toFixed(4)} |ubar-centred|=${cl.dCentred.toExponential(3)}` +
    ` |ubar-face|=${cl.dFace.toExponential(3)}`);
  ok("collocation probe found a wet cell with a meaningful gradient",
     cl.found && Math.abs(cl.centred - cl.face) > 1e-4,
     JSON.stringify(cl));
  ok("avgField's ubar sits on the CENTRED velocity, not the bare west face",
     cl.dCentred < cl.dFace, JSON.stringify(cl));

  // FAVRE, not Reynolds. The collocation probe above skips every cell with
  // fbar <= 0.9, and its CPU reference is a plain time-weighted mean of u_c —
  // which is the REYNOLDS mean. Where fbar > 0.9 the Favre and Reynolds means
  // coincide to within the noise, so a shader storing vec4(uc, wc, f, U.b)
  // instead of vec4(f*uc, f*wc, f, U.b) passes it, and so does an avgField()
  // that forgets to divide by fbar. The Favre mean of averaging.md §3 is the
  // thing at stake: alternating f = 1,0 with u = 10,0 must average to 10,
  // not 5.
  //
  // So: run the same idea on PARTIALLY FILLED cells, 0.3 < fbar < 0.7, where
  // <f u_c>/fbar and <u_c> genuinely differ, and compute BOTH references on
  // the CPU from the SAME per-frame readbacks the shader samples (patch() for
  // U, the F texture for f, weighted by each frame's own simulated advance —
  // §4.4's rule). Then ask which one ubar landed on. A comparison, so it
  // survives the flow's unsteadiness; taken over a POPULATION of the most
  // separated cells rather than one, so a single noisy cell cannot decide it.
  const fr = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    const gl = document.querySelector("canvas").getContext("webgl2");
    const S = APP.sim, nx = S.nx, ny = S.ny, n = nx * ny;
    const F = new Float32Array(n * 4);
    const sFu = new Float64Array(n), sF = new Float64Array(n), sU = new Float64Array(n);
    let T = 0, frames = 0;
    APP.SIM.avgStart();
    for (let s = 0; s < 60; s++) {
      const t0 = S.t;
      APP.frames(1);                       // tickFrame samples U/F AFTER the
      const dt = S.t - t0;                 // substeps, so this reads the same
      if (!(dt > 0)) continue;             // state avgStepField just consumed
      const P = APP.SIM.patch(0, S.W);
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
      gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, F);
      for (let j = 0; j < ny; j++) {
        for (let i = 1; i < nx - 2; i++) {
          const k = j * nx + i, b = ((j * P.w) + i - P.i0) * 4;
          const uc = 0.5 * (P.buf[b] + P.buf[b + 4]);   // centred, as FS_ACC does
          const f = F[k * 4];
          sFu[k] += dt * f * uc; sF[k] += dt * f; sU[k] += dt * uc;
        }
      }
      T += dt; frames++;
    }
    const A = APP.SIM.avgField();
    const cand = [];
    for (let j = 2; j < ny - 2; j++) {
      for (let i = 2; i < nx - 3; i++) {
        const k = j * nx + i, fb = A.fbar[k];
        if (!(fb > 0.3 && fb < 0.7)) continue;          // partially filled
        if (!(sF[k] > 1e-9)) continue;
        const favre = sFu[k] / sF[k], reyn = sU[k] / T;
        if (!Number.isFinite(favre) || !Number.isFinite(reyn)) continue;
        cand.push({ i, j, fb, favre, reyn, sep: Math.abs(favre - reyn),
                    ubar: A.ubar[k] });
      }
    }
    APP.SIM.avgStop();
    cand.sort((a, b) => b.sep - a.sep);
    const top = cand.slice(0, 25);
    let dF = 0, dR = 0, nearFavre = 0;
    for (const c of top) {
      const a = Math.abs(c.ubar - c.favre), b = Math.abs(c.ubar - c.reyn);
      dF += a; dR += b; if (a < b) nearFavre++;
    }
    const m = top.length || 1;
    return { frames, T, nCand: cand.length, nTop: top.length, nearFavre,
             dFavre: dF / m, dReyn: dR / m,
             sepMax: top.length ? top[0].sep : 0,
             sepMin: top.length ? top[top.length - 1].sep : 0,
             best: top[0] || null };
  })()`);
  console.log(`
    Favre vs Reynolds: ${fr.nCand} cells with 0.3<fbar<0.7 over T=${fr.T.toFixed(4)}s` +
    ` (${fr.frames} frames); top ${fr.nTop} by separation ${fr.sepMin.toFixed(4)}-${fr.sepMax.toFixed(4)} m/s;` +
    ` mean |ubar-Favre|=${fr.dFavre.toExponential(3)} vs |ubar-Reynolds|=${fr.dReyn.toExponential(3)};` +
    ` nearer Favre in ${fr.nearFavre}/${fr.nTop}` +
    (fr.best ? ` | best cell (${fr.best.i},${fr.best.j}) fbar=${fr.best.fb.toFixed(3)}` +
      ` Favre=${fr.best.favre.toFixed(4)} Reynolds=${fr.best.reyn.toFixed(4)} ubar=${fr.best.ubar.toFixed(4)}` : ""));
  // The probe is worthless unless the two references actually separate — a
  // green assertion on cells where they coincide proves nothing, which is the
  // failure this test was written to end.
  ok("Favre/Reynolds probe found partially filled cells that separate the two",
     fr.nTop >= 10 && fr.sepMin > 0.02, JSON.stringify({ ...fr, best: undefined }));
  // "Nearer Favre than Reynolds" is NOT enough on its own, and the negative
  // control is what showed it: storing uc instead of f*uc leaves avgField
  // dividing by fbar anyway, so ubar becomes <u_c>/fbar — at fbar = 0.3 that
  // is 4.2x the Reynolds mean, further from Reynolds than from Favre, and a
  // nearness test passes it. The gate is therefore AGREEMENT with the Favre
  // reference relative to the Favre/Reynolds separation. Measured on this
  // scene: 1.3e-7 against 6.9e-1, a ratio of 2e-7. The negative control (the
  // uc store) measured 3.98e-2 against 1.15e0, a ratio of 3.46e-2 — and it
  // was still "nearer Favre" in 25 cells out of 25, which is precisely why
  // the nearness clause cannot carry this on its own. The gate at 1e-3 sits
  // between them with 5000x of clean headroom and 35x of separation from the
  // bug. The other half of the trap, an avgField that forgets to divide by
  // fbar, lands nearer Reynolds outright and the nearness clause catches it.
  ok("avgField's ubar is the FAVRE mean <f u_c>/fbar, not the Reynolds mean <u_c>",
     fr.dFavre < 1e-3 * fr.dReyn && fr.nearFavre >= 0.9 * fr.nTop,
     JSON.stringify({ ...fr, best: undefined }));

  // The column-reading accumulator (Task 7): averages FS_COL's OWN OUTPUT
  // (bed, d, q, top), not the raw field — connectivity stays decided on the
  // sharp per-frame column. Laid out exactly as SIM.columns() so the overlay
  // can take it unchanged.
  const cc = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    // The bed as it stood when the window OPENED, kept as an independent copy.
    // Comparing C's bed channel against the LIVE buffer would be a tautology --
    // avgColumns assigns it verbatim, so |C[0] - live[0]| is exactly 0 whatever
    // avgColumns does. Against a snapshot taken BEFORE the window it is a real
    // check: of the claim that the bed does not move while a window is open,
    // and of channel 0 carrying the bed rather than a neighbouring channel.
    const bed0 = Float32Array.from(APP.SIM.columns(true));
    APP.SIM.avgStart(); APP.frames(300);
    const { C, sigma } = APP.SIM.avgColumns();
    const S = APP.sim, nx = S.nx;
    let dOK = 0, bedOK = 0, sigOK = 0;
    for (let i = 0; i < nx; i++) {
      if (C[i*4+1] >= 0 && Number.isFinite(C[i*4+1])) dOK++;
      if (Math.abs(C[i*4] - bed0[i*4]) < S.dx * 2) bedOK++;   // bed is static
      if (sigma[i] >= 0 && Number.isFinite(sigma[i])) sigOK++;
    }
    APP.SIM.avgStop();
    return { nx, len: C.length, dOK, bedOK, sigOK };
  })()`);
  ok("avgColumns is laid out like SIM.columns", cc.len === cc.nx * 4);
  ok("mean depth is finite and non-negative in every column", cc.dOK === cc.nx);
  ok("the bed does not move within a window", cc.bedOK === cc.nx);
  ok("sigma_eta is finite everywhere", cc.sigOK === cc.nx);

  // The three checks above only prove the array LENGTH matches SIM.columns()
  // and that each channel is finite/non-negative -- they do not prove which
  // channel is which, and Task 8 depends on that order being EXACT. This
  // compares the accumulated mean depth against the live instantaneous depth,
  // averaged over every reliably-wet column: close to 1 in a settled reach
  // (measured 0.99-1.09 over six independent runs), and sharply violated by a
  // d/q channel swap (measured 1.62 -- q and d differ enough in scale here
  // that the ratio jumps outside the band).
  //
  // What this ratio does NOT catch is a clock swap: wiring avgStepColumns to
  // `tf` or to the transport `t` left it at 1.02 / 0.99 / 1.03, well inside
  // the band. The clocks are pinned apart by the sigma_eta check below
  // instead. Every negative control is recorded in task-7-report.md.
  const cd = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(300);
    const { C } = APP.SIM.avgColumns();
    const live = APP.SIM.columns(true);
    const S = APP.sim, nx = S.nx;
    let wet = 0, sum = 0;
    for (let i = 0; i < nx; i++) {
      if (live[i*4+1] > 0.02) { wet++; sum += C[i*4+1] / live[i*4+1]; }
    }
    APP.SIM.avgStop();
    return { wet, ratio: wet ? sum / wet : -1 };
  })()`);
  console.log(`\n    columns: dbar/d = ${cd.ratio.toFixed(4)} over ${cd.wet} wet columns`);
  ok("mean depth tracks the live depth in a settled reach",
     cd.ratio > 0.7 && cd.ratio < 1.5, `ratio ${cd.ratio.toFixed(4)} over ${cd.wet} wet columns`);

  // sigma_eta: "finite and non-negative" cannot tell a weighted Welford moment
  // from the naive <eta^2> - <eta>^2 -- swapping the shader for the naive form
  // passes every assertion above unchanged (negative control, task-7-report.md).
  // Naive is what the design rejected: for a small wobble on a metre datum the
  // subtraction is a ratio near float32 eps, so it keeps about two digits.
  //
  // So this compares the GPU sigma against an INDEPENDENT float64 Welford,
  // hand-rolled here from the SAME per-frame column readback the accumulator
  // samples (columns(true) straight after frames(1) re-runs the pass on the
  // unchanged U/F, so it is the very same sample), over the SAME window and
  // with the same dt weights. Two independently-computed sigmas agreeing to
  // a tight relative tolerance is what discriminates the formula. Measured:
  // 5.3e-6 with the Welford moment, 1.6e-2 with the naive one -- three orders
  // of magnitude apart, and the bound below sits between them.
  const cs = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    const S = APP.sim, nx = S.nx;
    // STOP FIRST. avgStart() opens with an early return when S.avg is
    // already set -- a no-op when a window is open, and earlier blocks open
    // them. Inheriting one leaves the GPU dividing its moment by a window
    // that started before this loop did, while the float64 reference below
    // divides by the T it accumulated itself. The two sigmas then differ by
    // sqrt(tc/T) -- measured at up to 14%, mid-domain, on columns with plenty
    // of signal. That is far larger than the 1.6e-2 signature of the naive
    // moment this assertion exists to catch, so it was not just noise: it
    // destroyed the discrimination the test is for.
    APP.SIM.avgStop();
    APP.SIM.avgStart();
    const mean = new Float64Array(nx), M2 = new Float64Array(nx);
    let T = 0;
    // Run to a WINDOW LENGTH, not a frame count. A fixed 80 frames makes T
    // whatever the machine happened to manage: measured here it came out
    // anywhere from 4.8 s to 17 s depending on load, and that is the one
    // variable this assertion cannot tolerate. sigma is sqrt(max(0, M2/T)),
    // and on a short window M2 is a sum of tiny products against an eta datum
    // of ~1.14 m; in float32 it can cancel slightly NEGATIVE, which max(0, .)
    // clamps to exactly zero. The GPU then reported sigma = 0 where float64
    // said 5e-3, the assertion failed with a relative gap of 1, and it looked
    // like a formula bug rather than a window too short to have a variance.
    //
    // MEASURED at T ~ 15 s: worst relative gap 2.9e-6 to 6.4e-6 over all 455
    // columns with signal, zero clamped, three runs out of three. At T ~ 5 s,
    // columns near the inlet -- where the level is held and eta barely moves,
    // so the variance is smallest -- clamp out. 12 s is the target, with a
    // frame cap so a stalled machine fails the length check below rather than
    // spinning. Same rule as the jump test: settle by SIMULATED time, so the
    // count is independent of dt.
    for (let s = 0; s < 4000 && T < 12; s++) {
      const t0 = S.t;
      APP.frames(1);
      const dt = S.t - t0;
      if (!(dt > 0)) continue;
      const C = APP.SIM.columns(true);
      const k = dt / (T + dt);
      for (let i = 0; i < nx; i++) {
        const phi = C[i*4+3], m0 = mean[i], m1 = m0 + k * (phi - m0);
        M2[i] += dt * (phi - m0) * (phi - m1);
        mean[i] = m1;
      }
      T += dt;
    }
    // FORCED. avgColumns only re-reads when force, or !A.out, or S.colFresh,
    // and the frame loop above populates A.out on the FIRST frame of the
    // window -- where T is ~0, M2 is ~0 and sigma is legitimately zero. An
    // unforced call here handed back that opening snapshot whenever the
    // throttle did not happen to land on the last frame, so this assertion
    // compared 80 frames of CPU Welford against one frame of GPU and failed
    // with gpu = 0 exactly. Flaky, not wrong -- which is worse, because it
    // passed often enough to look like noise. js/sim.js states the rule: the
    // frame path never forces, a caller that wants THIS frame's numbers and
    // is not inside the loop always must.
    const A = APP.SIM.avgColumns(true), sigma = A.sigma;
    const live = APP.SIM.columns(true);
    let n = 0, worst = -1, at = -1, ref0 = 0, got0 = 0, sMax = 0;
    for (let i = 2; i < nx - 2; i++) {
      if (!(live[i*4+1] > 0.02)) continue;          // wet columns only
      const ref = Math.sqrt(Math.max(0, M2[i] / T));
      if (ref > sMax) sMax = ref;
      // SIGNAL FLOOR, RELATIVE TO THE DATUM -- not an absolute 1e-4.
      //
      // sigma is sqrt(max(0, M2/T)), and M2 is a sum of products of
      // (eta - mean): differences of order 1e-3 m taken between numbers of
      // order 1.14 m. In float32 that difference keeps about four digits, its
      // square about two, and the running sum can cancel slightly NEGATIVE --
      // which max(0, .) then clamps to exactly zero. This is the same
      // arithmetic js/reconstruct.js's header describes as leaving 'about two
      // surviving digits of the variance', which is why Welford is used at
      // all; Welford raises the floor, it does not abolish it.
      //
      // The columns that hit the floor are the ones nearest the inlet, where
      // the level is held and eta barely moves, so their variance is smallest.
      // An absolute cutoff cannot express that, because what matters is sigma
      // AGAINST ITS OWN DATUM. MEASURED over three runs at T = 12 s, binned
      // by sigma/eta:
      //     1e-2 .. 1e-1   609 columns   worst relative gap 6.7e-6
      //     1e-1 .. 1e0    756 columns   worst relative gap 9.9e-7
      // i.e. everything at or above 1% of its datum agrees to parts in 1e5,
      // which is 150x inside the 1e-3 gate below. Beneath that the float32
      // moment has no digits left and the comparison measures the storage
      // format, not the formula this assertion exists to discriminate.
      const eta = A.C[i * 4 + 3];
      if (!(eta > 0) || ref / eta < 1e-2) continue;
      n++;
      const rel = Math.abs(sigma[i] - ref) / ref;
      if (rel > worst) { worst = rel; at = i; ref0 = ref; got0 = sigma[i]; }
    }
    // Read the window BEFORE closing it -- avgStop() nulls S.avg.
    // sigma divides by the COLUMN accumulator's own clock (tc), which is a
    // different counter from the field accumulator's (t, what avgT() reports
    // and what only advances while the display is averaging).
    const tc = S.avg ? S.avg.tc : 0;
    APP.SIM.avgStop();
    return { n, worst, at, ref: ref0, got: got0, sMax, T, nx, tc };
  })()`);
  console.log(`    sigma_eta: ${cs.n} columns with signal (max sigma ${cs.sMax.toExponential(3)})` +
    ` over T=${cs.T.toFixed(4)}s; worst rel gap ${cs.worst.toExponential(3)} at i=${cs.at}` +
    ` (gpu ${cs.got.toExponential(4)} vs cpu ${cs.ref.toExponential(4)})`);
  ok("sigma_eta had a long enough window to have a variance", cs.T >= 11.5,
     "T = " + cs.T.toFixed(2) + " s of 12 - below this the float32 moment "
     + "clamps to zero near the inlet and the comparison is meaningless");
  // The two windows must BE the same window, or the sigmas are of
  // different things and any agreement is luck.
  ok("sigma_eta compares one window against itself",
     Math.abs(cs.tc - cs.T) < 0.02 * cs.T,
     "gpu window " + cs.tc.toFixed(3) + " s vs cpu " + cs.T.toFixed(3) + " s");
  ok("sigma_eta has something to measure", cs.n > 10, JSON.stringify(cs));
  ok("sigma_eta matches an independent float64 weighted Welford",
     cs.worst < 1e-3, JSON.stringify(cs));

  // ============================================== RECON vs GLSL: closing the mirror gap
  //
  // js/reconstruct.js's own header says "the GLSL accumulators implement the
  // SAME formulae, and test/recon-test.mjs is what pins them down" — but
  // nothing before this compared RECON's output to the GPU's. Production
  // code calls only RECON.sigma (above, in avgColumns) and RECON.aerationGap
  // (the legend's cursor readout); the other nine functions and the WET /
  // DRY_BREAK / SURF constants were exercised only by the CPU-only test
  // suite. The three blocks below run RECON on the SAME data the GPU pass
  // consumed and compare outputs directly, so a drifted threshold or a
  // mis-weighted recursion in the shader shows up here even though every
  // gate above it stays green.

  // ---- (a) column compaction: RECON.bodies / RECON.bodyDepth vs FS_COL ----
  //
  // Compared against the INSTANTANEOUS columns (SIM.columns()), not the
  // averaged ones. avgColumns() accumulates FS_COL's OWN OUTPUT (js/sim.js's
  // avgStepColumns comment; docs/averaging.md §4.3/§7.2) precisely because
  // connectivity on a time-averaged fill is ill-posed — a nappe touching a
  // pool for part of a window leaves mean fill joining bodies that were
  // never joined at any instant. So running RECON's connectivity walk on a
  // raw MEAN fill and comparing to avgColumns() would check two different
  // questions and could fail for reasons that have nothing to do with
  // RECON/FS_COL agreement. The honest comparison is RECON's walk against
  // FS_COL's per-frame reduction on the SAME instantaneous F/mask snapshot.
  //
  // FS_COL does not call anything like RECON.geomFill: it walks raw
  // min(f,1), with no pressure compaction (that correction — §7.1 — only
  // means something for the time-averaged fill). So the CPU mirror here
  // feeds RECON.bodies / RECON.bodyDepth gcol = min(f,1) directly, with the
  // same WET=0.25 / DRY_BREAK=3 thresholds RECON exports specifically so
  // nothing else has to restate them.
  const rc = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    const S = APP.sim, nx = S.nx, ny = S.ny, dx = S.dx;
    const gl = document.querySelector("canvas").getContext("webgl2");
    const live = Float32Array.from(APP.SIM.columns(true));   // (bed, d, q, top); colBuf is reused, so copy it
    const F = new Float32Array(nx * ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.F.read.fbo);
    gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, F);
    // FS_COL's SO(), in the CPU idiom this file already uses elsewhere for
    // the same test (js/sim.js's own boxForce/lineFlux helpers): a fully
    // solid mask texel, or a valve texel while the valve is shut.
    const closed = S.p.valveClosed > 0.5;
    const gcol = new Float64Array(ny), solid = new Uint8Array(ny);
    let nWet = 0, bedOK = 0, depthOK = 0, worstBed = 0, worstDepth = 0, atI = -1;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const m = S.mask[j * nx + i];
        solid[j] = (m > 192 || (closed && m > 64)) ? 1 : 0;
        gcol[j] = solid[j] ? 0 : Math.min(F[(j * nx + i) * 4], 1.0);
      }
      const bodies = RECON.bodies(gcol, solid, ny);
      const gpuBed = live[i * 4], gpuD = live[i * 4 + 1];
      if (!bodies.length) { if (gpuD === 0) depthOK++; continue; }         // both agree: dry
      nWet++;
      const b0 = bodies[0];                    // FS_COL only ever walks the FIRST body from the bed
      const cpuBed = b0.j0 * dx, cpuD = RECON.bodyDepth(gcol, b0.j0, b0.j1, dx);
      const dBed = Math.abs(cpuBed - gpuBed), dDepth = Math.abs(cpuD - gpuD);
      if (dBed > worstBed) worstBed = dBed;
      if (dDepth > worstDepth) { worstDepth = dDepth; atI = i; }
      // Tolerances: the bed is one integer cell index times dx, read back
      // through a float32 texture on both sides, so the only source of
      // disagreement is a single ULP of dx — measured 7.2e-8 m on h23/Low
      // (dx there is a few cm). Depth is a float32 SUM of up to ny wet
      // terms (ny ~ 100 here) each O(dx), so its rounding floor is ~ny
      // times dx's ULP — measured 7.1e-7 m, against a ~3e-7 m back-of-
      // envelope (ny * dx * 2^-23). Both gates sit at ~10x the measured
      // worst case: a real threshold/DRY_BREAK drift (the col-wet-threshold
      // mutant) misses by orders of magnitude, not a factor of a few.
      if (dBed < 1e-6) bedOK++;
      if (dDepth < 1e-5) depthOK++;
    }
    return { nx, ny, nWet, bedOK, depthOK, worstBed, worstDepth, atI };
  })()`);
  console.log(`\n    RECON vs FS_COL: ${rc.nWet}/${rc.nx} wet columns, bed OK ${rc.bedOK}, ` +
    `depth OK ${rc.depthOK}, worst bed gap ${rc.worstBed.toExponential(3)} m, ` +
    `worst depth gap ${rc.worstDepth.toExponential(3)} m (column ${rc.atI}, ny=${rc.ny})`);
  ok("RECON.bodies finds a wet column wherever FS_COL does", rc.nWet > 100, JSON.stringify(rc));
  ok("RECON's bed matches FS_COL's bed exactly (same integer cell)",
     rc.bedOK === rc.nx, JSON.stringify(rc));
  ok("RECON.bodyDepth matches FS_COL's own depth reduction",
     rc.depthOK === rc.nx, JSON.stringify(rc));

  // ---- (b)/(c) the accumulator weight and Welford moment, RECON vs GPU ----
  //
  // §4.4's running-mean weight h/(T+h) and the Welford second moment are
  // exercised in production only through avgColumns()'s call to RECON.sigma
  // — nothing drives RECON.accumStep or RECON.welford themselves against the
  // GPU. The natural substep/frame loop cannot pin this down honestly:
  // APP.frames() — the column accumulator's own cadence — advances by a
  // machine-dependent dt each frame, so a sequence driven that way is not
  // reproducible and could not be replayed sample-for-sample on the CPU.
  //
  // Instead this drives SIM.avgStepColumns(dt) DIRECTLY, off the frame loop
  // entirely: a synthetic column buffer is written straight into S.colTex
  // with texSubImage2D (the same technique the display-path test above
  // uses), paired with an EXPLICIT, hand-chosen dt sequence that is
  // deliberately NOT constant — so this is not the degenerate case where
  // h/(T+h) collapses to the plain arithmetic-mean weight 1/n and would
  // pass a broken denominator by accident. Every phi and every dt is a
  // number this test chose, so the CPU replay via RECON.accumStep /
  // RECON.welford / RECON.sigma is comparing against a fully known target.
  const aw = await B.evaluate(`(() => {
    const S = APP.sim, nx = S.nx, gl = document.querySelector("canvas").getContext("webgl2");
    APP.SIM.avgStart();                      // also (re)builds S.colTex, via snapshotBed's columns(true)
    const N = 80;
    const buf = new Float32Array(nx * 4);
    let T = 0, meanD = 0, meanE = 0, M2 = 0;
    for (let k = 0; k < N; k++) {
      const dtK  = 0.0015 * (1 + 0.6 * Math.sin(1.7 * k + 0.3));   // 0.6-2.4 ms, chosen, not simulated
      const phiD = 1.0 + 0.4 * Math.sin(0.9 * k);
      const phiE = 2.0 + 0.05 * Math.sin(1.3 * k + 1.1);
      for (let i = 0; i < nx; i++) { buf[i*4] = 0; buf[i*4+1] = phiD; buf[i*4+2] = 0; buf[i*4+3] = phiE; }
      gl.bindTexture(gl.TEXTURE_2D, S.colTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, 1, gl.RGBA, gl.FLOAT, buf);
      APP.SIM.avgStepColumns(dtK);
      const meanEnew = RECON.accumStep(meanE, phiE, T, dtK);
      M2 = RECON.welford(M2, meanE, meanEnew, phiE, dtK);
      meanD = RECON.accumStep(meanD, phiD, T, dtK);
      meanE = meanEnew;
      T += dtK;
    }
    const { C, sigma } = APP.SIM.avgColumns(true);
    const sigmaRef = RECON.sigma(M2, T);
    const mid = nx >> 1;                     // any column: the synthetic signal is uniform in i
    const gotD = C[mid*4+1], gotE = C[mid*4+3], gotSigma = sigma[mid];
    const err = gl.getError();
    APP.SIM.avgStop();
    return { T, meanD, meanE, sigmaRef, gotD, gotE, gotSigma, err,
             dD: Math.abs(gotD - meanD), dE: Math.abs(gotE - meanE),
             dSigma: Math.abs(gotSigma - sigmaRef) };
  })()`);
  console.log(`    accumulator weight: T=${aw.T.toFixed(4)}s dD=${aw.dD.toExponential(3)} ` +
    `dE=${aw.dE.toExponential(3)} dSigma=${aw.dSigma.toExponential(3)} ` +
    `(cpu mean ${aw.meanD.toFixed(6)}/${aw.meanE.toFixed(6)}, sigma ${aw.sigmaRef.toExponential(4)})`);
  ok("the synthetic drive left no GL error", aw.err === 0, JSON.stringify(aw));
  // Measured on this run: dD 4.46e-7, dE 1.98e-7 over 80 steps of float32
  // GPU recursion vs a float64 CPU replay of the identical formula — the gap
  // is pure float32-vs-float64 rounding, not model error, so it should stay
  // near a few ULPs of the O(1-2) magnitude values involved (~2.4e-7 each).
  // Gated at 5e-6, about 10x-25x the measured value: the acol-weight-
  // denominator mutant (dropping dt from the weight's denominator) misses by
  // several ORDERS of magnitude, not a small multiple, because it injects a
  // genuinely different recursion rather than a rounding difference.
  ok("FS_ACOL's running mean matches RECON.accumStep for a fully known, non-constant dt sequence",
     aw.dD < 5e-6 && aw.dE < 5e-6, JSON.stringify(aw));
  // Measured dSigma 1.91e-8 against a sigma of ~3.5e-2 -- six orders of
  // magnitude of headroom before the 5e-6 gate, because M2 is a SUM (not a
  // recursion with cancellation) so float32/float64 rounding barely
  // accumulates over 80 terms. The welford-naive mutant (which drops the
  // dt weight from the M2 update entirely) is the documented kill for this
  // shape of bug and misses by 3+ orders of magnitude (see its own entry).
  ok("FS_ACOL's Welford moment matches RECON.welford/RECON.sigma on the same sequence",
     aw.dSigma < 5e-6, JSON.stringify(aw));

  // ---- (d) the aeration-gap identity, across the whole column array -------
  //
  // RECON.aerationGap(etaBar, bed, dBar) = etaBar - (bed + dBar) IS the
  // identity docs/averaging.md §7.3 states (η̄ − z_b = d̄ + δ_a) by
  // construction, so calling it back on the numbers it was given proves
  // nothing about the numbers themselves — that would be circular. What is
  // worth pinning is that avgColumns()'s three channels — an independently
  // accumulated depth and an independently accumulated surface level — agree
  // with EACH OTHER: in an ordinary (non-aerated, singly-connected) column
  // the surface line has to sit within a cell or two of bed + mean depth.
  // Production only ever evaluates this at the cursor cell (js/main.js's
  // legend readout); this checks it over the whole array.
  const ag = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(240);
    const { C } = APP.SIM.avgColumns();
    const live = APP.SIM.columns(true);
    const S = APP.sim, nx = S.nx, dx = S.dx;
    let nWet = 0, worst = 0, atI = -1;
    const gaps = [];
    for (let i = 2; i < nx - 2; i++) {
      if (!(live[i*4+1] > 5 * dx)) continue;         // a clear single body, well clear of the bed
      const bed = C[i*4], dBar = C[i*4+1], etaBar = C[i*4+3];
      const da = RECON.aerationGap(etaBar, bed, dBar);
      gaps.push(da);
      nWet++;
      if (Math.abs(da) > worst) { worst = Math.abs(da); atI = i; }
    }
    APP.SIM.avgStop();
    return { nWet, worst, atI, dx, finite: gaps.every(Number.isFinite) };
  })()`);
  console.log(`    aeration gap: ${ag.nWet} columns, worst |delta_a| = ${ag.worst.toExponential(3)} m ` +
    `(${(ag.worst/ag.dx).toFixed(2)} cells) at i=${ag.atI}`);
  ok("aeration gap is finite everywhere it is evaluated", ag.finite && ag.nWet > 50, JSON.stringify(ag));
  // Measured on h23/Low across several runs: worst |delta_a| 1.4-2.4 cell
  // widths (2.3e-2 - 3.9e-2 m), always near the downstream sponge/outfall
  // reach where the surface is least settled and the run-to-run water state
  // varies most (this block runs late in a long shared session, after many
  // earlier blocks have nudged the flow). Gated at 8 cells, ~3x the worst
  // measured value: a channel swap between the q-bar and eta-bar channels
  // (the acol-channel-swap mutant) puts the DISCHARGE where the surface
  // elevation belongs, which is METRES away from bed + depth on this scene
  // -- two more orders of magnitude than the gate, not a small multiple.
  ok("the surface line and the mean depth agree to a few cells in a simple settled reach",
     ag.worst < 8 * ag.dx, JSON.stringify(ag));

  // The channel overlay (Task 8): OVERLAY.analyse() already filters three
  // ways — a spatial prefilter, a temporal EMA (_hA/_qA) and an EMA on the
  // global normal-depth estimate (_ynK). Handing it mean columns and letting
  // those run would average an already-averaged field a second time, which
  // shows up as a jump broadened by the filter rather than by the flow.
  //
  // Feeding the SAME column buffer to the SAME call twice, with a reset
  // right before both calls, does NOT distinguish "bypassed" from "filtered\n// but converged": resetEstimates() nulls _hA, so the first call
  // initialises _hA to a bit-exact copy of the smoothed input, and that same
  // call's own EMA step is then `x += 0.10*(x-x) = 0` — the filter reaches
  // its fixed point in ONE call whenever the input never changes. A second
  // call with the identical input can never move, whether or not the EMA is
  // even running — measured directly: re-enabling the EMA on the averaged
  // path still left a same-input-twice check reading identical output on
  // both calls, so that shape of test cannot tell a bypass from a filter
  // that already converged (docs/averaging.md §4.3 documents the bypass
  // this suite is pinning).
  //
  // So instead: seed the shared _hA/_qA state with a column buffer D that
  // is CLEARLY different from the averaged buffer C (a just-reset, still
  // near-empty channel vs. the settled averaged profile), then check —
  //   H2a: the averaged path on C ignores that seed entirely. Both calls
  //        must read C verbatim; if the EMA still ran, call 1 would sit
  //        10% of the way from the seed toward C and call 2 would sit
  //        further still — two different numbers, neither equal to C.
  //   H2b: the LIVE path does NOT ignore history. The same current input D,
  //        reached via two different histories (no history vs. seeded with
  //        C), must give two DIFFERENT outputs — proof the live EMA is
  //        actually carrying state between calls, which is what "the\n//        bypass is real" requires the live path to keep doing.
  //   H2c: the fourth filter — the global d_n estimate `_ynK` — gets the
  //        same treatment. Seed it via a live call on D (D's median
  //        candidate measured at 0.0653 m against C's 0.1544 m — a factor
  //        of 2.4, comfortably outside anything a single 6% EMA step could
  //        produce), then call the averaged path on C twice. Both calls
  //        must land on the SAME k an unseeded, freshly-reset averaged call
  //        on C also lands on — proof the seed was ignored outright, not
  //        just diluted below the 1e-9 tolerance by one blend step.
  const h = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.SIM.avgStart(); APP.frames(240);
    const { C } = APP.SIM.avgColumns();
    APP.SIM.avgStop();
    const S = APP.sim, nx = S.nx;

    APP.SIM.resetWater(); APP.tick(30);          // near-empty, nothing like C
    const D = APP.SIM.columns(true);

    // H2a — averaged path must ignore stale filter state.
    OVERLAY.resetEstimates(APP.sim);
    OVERLAY.analyse(APP.sim, D);                  // live call seeds _hA/_qA from D
    const A1 = OVERLAY.analyse(APP.sim, C, { averaged: true });
    const A2 = OVERLAY.analyse(APP.sim, C, { averaged: true });
    let same = true, atC = true;
    for (let i = 0; i < nx; i++) {
      if (Math.abs(A1.d[i] - A2.d[i]) > 1e-9) same = false;
      if (Math.abs(A1.d[i] - C[i * 4 + 1]) > 1e-9) atC = false;
    }

    // H2b — live path must carry state: same D, different prior history.
    OVERLAY.resetEstimates(APP.sim);
    const isolated = OVERLAY.analyse(APP.sim, D).d.slice();
    OVERLAY.resetEstimates(APP.sim);
    OVERLAY.analyse(APP.sim, C);                  // seed history with C
    const withHistory = OVERLAY.analyse(APP.sim, D).d;
    let moved = false;
    for (let i = 0; i < nx; i++) if (Math.abs(isolated[i] - withHistory[i]) > 1e-9) { moved = true; break; }

    // H2c — the _ynK global normal-depth estimate must ignore the seed too.
    OVERLAY.resetEstimates(APP.sim);
    OVERLAY.analyse(APP.sim, D);                  // live call seeds _ynK from D
    const kSeed = S._ynK;
    OVERLAY.analyse(APP.sim, C, { averaged: true });
    const k1 = S._ynK;
    OVERLAY.analyse(APP.sim, C, { averaged: true });
    const k2 = S._ynK;
    OVERLAY.resetEstimates(APP.sim);
    OVERLAY.analyse(APP.sim, C, { averaged: true }); // clean reference, no seed
    const kClean = S._ynK;
    const ynAtClean = Math.abs(k1 - kClean) < 1e-9 && Math.abs(k2 - kClean) < 1e-9;
    // The seed must actually differ from kClean by more than an EMA step
    // could close, or a false pass here would mean the test has no power.
    const seedDistinct = isFinite(kSeed) && isFinite(kClean) &&
      Math.abs(kSeed - kClean) > 0.20 * kClean;

    return { same, atC, moved, ynAtClean, kSeed, k1, k2, kClean, seedDistinct, n: nx };
  })()`);
  ok("H2 averaged analyse ignores stale filter state — both calls read C verbatim",
     h.same && h.atC, JSON.stringify(h));
  ok("H2 the live path carries state between calls, so the bypass is real",
     h.moved, JSON.stringify(h));
  ok("H2c the seed differs enough from kClean for the check below to have power",
     h.seedDistinct, JSON.stringify(h));
  ok("H2c the averaged _ynK estimate ignores stale filter state too",
     h.ynAtClean, JSON.stringify(h));

  // ================================================== the display path (Task 9)
  //
  // Everything above proves the accumulators hold the right numbers. These
  // prove the PICTURE is painted from them — and specifically that it is
  // painted from them EVERYWHERE, which is the part a "does the canvas
  // change?" check cannot reach. FS_DISP reads the state in four places (the
  // two bilinear samplers, a 3x3 tent average, a vorticity stencil) and two
  // of those used to texelFetch the live textures directly. A half-applied
  // Average is worse than none: the tent drives the opacity AND the
  // free-surface line, so the surface would have wobbled over a still mean.
  //
  // Method: hand the accumulator and the live field DELIBERATELY OPPOSITE
  // states and ask which one the pixels came from. A render is not stepped
  // between the two grabs, so nothing but u_avg differs.
  const paint = await B.evaluate(`(() => {
    __low();
    const cv = document.querySelector("canvas"), gl = cv.getContext("webgl2");
    const S = APP.sim, nx = S.nx, ny = S.ny, mid = Math.floor(ny / 2);
    APP.SIM.avgStart(); APP.frames(4);           // allocate, then overwrite

    const put = (tex, buf) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);        // texSubImage2D: these are FBO
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,   // attachments, so respecifying
                       nx, ny, gl.RGBA, gl.FLOAT, buf);   // storage would kill them
    };
    const grab = (avg, mode, lo, hi) => {
      APP.SIM.render(APP.view, { mode, vmax: 4, lo, hi, pdt: 0, dye: false,
        particles: false, cursor: [-99, -99, 0], guide: [0,0,0,0],
        guideOn: false, avg });
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const b = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return { b, w, h };
    };
    // Luminance centroid, in canvas rows. readPixels is y-up, so a LOW
    // centroid means the bright band sits at the bottom of the view.
    const centroid = (g) => {
      let num = 0, den = 0;
      for (let y = 0; y < g.h; y++) {
        let row = 0;
        for (let x = 0; x < g.w; x++) {
          const k = (y * g.w + x) * 4;
          row += g.b[k] + g.b[k+1] + g.b[k+2];
        }
        num += row * y; den += row;
      }
      return den ? num / den : -1;
    };
    // Mean (red - blue) over the canvas: which END of the diverging ramp the
    // water was painted from. Sign is the whole assertion.
    const warmth = (g) => {
      let sum = 0;
      for (let k = 0; k < g.b.length; k += 4) sum += g.b[k] - g.b[k+2];
      return sum / (g.b.length / 4);
    };

    // ---- 1. the FILL. Live water in the TOP half, mean water in the BOTTOM.
    const F = new Float32Array(nx*ny*4), A = new Float32Array(nx*ny*4);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j*nx+i)*4;
      F[k]   = j >= mid ? 1 : 0;                 // live f
      A[k+2] = j <  mid ? 1 : 0;                 // f-bar
      A[k+3] = 1.0;                              // P-bar, so the hue is not 0/0
    }
    put(S.F.read.tex, F); put(S.avg.fld.read.tex, A);
    const cLive = centroid(grab(false, 0, 0, 2));
    const cMean = centroid(grab(true,  0, 0, 2));

    // ---- 2. the VELOCITY, through the vorticity stencil. Both fields wet
    // everywhere, so only the stencil can move the colour. Live du/dz < 0
    // (omega > 0, warm); mean du/dz > 0 (omega < 0, cool).
    const V = 100 * S.H;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j*nx+i)*4, z = (j + 0.5) / ny;
      F[k] = 1; A[k+2] = 1; A[k+3] = 1.0;
      A[k]   = +V * z;                            // <f u_c> with f-bar = 1
      A[k+1] = 0;
    }
    const U = new Float32Array(nx*ny*4);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j*nx+i)*4, z = (j + 0.5) / ny;
      U[k] = -V * z; U[k+1] = 0; U[k+2] = 1.0;
    }
    put(S.F.read.tex, F); put(S.avg.fld.read.tex, A); put(S.U.read.tex, U);
    const wLive = warmth(grab(false, 4, -40, 40));
    const wMean = warmth(grab(true,  4, -40, 40));

    // ---- 3. the DEPTH, through the Froude view. Identical velocity in both,
    // so only the column source can move the colour: the live reduction says
    // 20 mm (supercritical at 2 m/s, warm), the mean column says 2 m (deeply
    // subcritical, cool).
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j*nx+i)*4;
      A[k] = 2.0; A[k+1] = 0; A[k+2] = 1; A[k+3] = 1.0;
      U[k] = 2.0; U[k+1] = 0; U[k+2] = 1.0;
    }
    put(S.F.read.tex, F); put(S.avg.fld.read.tex, A); put(S.U.read.tex, U);
    const cl = new Float32Array(nx*4), ca = new Float32Array(nx*4);
    for (let i = 0; i < nx; i++) {
      cl[i*4+1] = 0.02;                           // live layout: (bed, d, q, top)
      ca[i*4]   = 2.00;                           // mean layout: (<d>, <q>, <eta>, M2)
    }
    gl.bindTexture(gl.TEXTURE_2D, S.colTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, 1, gl.RGBA, gl.FLOAT, cl);
    gl.bindTexture(gl.TEXTURE_2D, S.avg.col.read.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, 1, gl.RGBA, gl.FLOAT, ca);
    const fLive = warmth(grab(false, 3, 0, 2));
    const fMean = warmth(grab(true,  3, 0, 2));

    APP.SIM.avgStop(); APP.SIM.resetWater();      // the synthetic state goes
    return { ny, h: gl.drawingBufferHeight, cLive, cMean, wLive, wMean,
             fLive, fMean, err: gl.getError() };
  })()`);
  console.log("\n    display: fill centroid live " + paint.cLive.toFixed(1) +
    " -> mean " + paint.cMean.toFixed(1) + " rows of " + paint.h +
    " | vorticity R-B live " + paint.wLive.toFixed(2) + " -> mean " + paint.wMean.toFixed(2) +
    " | Froude R-B live " + paint.fLive.toFixed(2) + " -> mean " + paint.fMean.toFixed(2));
  // The opacity, the water body AND the free-surface line all come off the
  // 3x3 tent average, which used to texelFetch u_F directly. If it still did,
  // both renders would paint the live band and the centroid would not move.
  ok("avg the water is painted where the MEAN fill is",
     paint.cLive - paint.cMean > 0.10 * paint.h,
     JSON.stringify(paint));
  // Mode 4 is a four-tap stencil on u_U, the second direct read. Sign, not
  // magnitude: the two prescribed shears are exact opposites.
  ok("avg the vorticity view paints the spin OF the mean flow",
     paint.wLive > 5 && paint.wMean < -5, JSON.stringify(paint));
  // Section 6: Fr~ = |u^| / sqrt(g <d>). Same velocity in both renders, so
  // only the column source can flip it.
  ok("avg the Froude view divides by the MEAN depth",
     paint.fLive > 5 && paint.fMean < -5, JSON.stringify(paint));
  ok("the display readbacks left no GL error", paint.err === 0, JSON.stringify(paint));

  // §9's last reset condition. Spin-up is an initialisation interval, not the
  // flow being reported: a window opened across a filling pipe carries the
  // fill in every mean it prints. `spinup` is a plain scene field, so it is
  // set short here rather than sitting through the scene's own.
  const sp = await B.evaluate(`(() => {
    __low();
    APP.SIM.resetWater();
    APP.state.scene.spinup = 0.4;                 // short, but a real crossing
    APP.avg.set(true);
    let prev = 0, drops = 0, dropAtSim = -1, dropFrom = 0, peak = 0;
    for (let k = 0; k < 400 && APP.sim.t < 1.2; k++) {
      APP.frames(1);
      const T = APP.SIM.avgT();
      if (T < prev - 1e-12) { drops++; dropAtSim = APP.sim.t; dropFrom = prev; }
      if (prev > peak) peak = prev;
      prev = T;
    }
    const endT = APP.SIM.avgT(), still = APP.SIM.avgActive();
    APP.avg.set(false);
    return { drops, dropAtSim, dropFrom, peak, endT, still,
             spin: APP.state.scene.spinup, simT: APP.sim.t };
  })()`);
  console.log("    spin-up: T reached " + sp.dropFrom.toFixed(3) + " s, dropped at sim t = " +
    sp.dropAtSim.toFixed(3) + " s (spin-up " + sp.spin + " s), " + sp.drops +
    " drop(s), window since = " + sp.endT.toFixed(3) + " s");
  // Power first, and on `peak` rather than on the drop: a check that only
  // holds when the reset fired would fail WITH the assertion it is meant to
  // give power to, and prove nothing about either.
  ok("the spin-up window had something to lose", sp.peak > 0.02, JSON.stringify(sp));
  ok("avg the end of spin-up restarts the window",
     sp.drops === 1 && sp.dropAtSim >= sp.spin, JSON.stringify(sp));
  // ...and exactly once. Resetting on the STATE rather than the EDGE would
  // zero T every frame after, leaving no window at all.
  ok("and does it once, not on every frame after",
     sp.endT > 0.05 && sp.still, JSON.stringify(sp));

  // H5. Average bypasses the live depth/discharge prefilters and the global
  // d_n EMA, so state crossing the mode boundary would be one window read
  // through the other's filter. Both directions, because only one of them is
  // obvious.
  const sw = await B.evaluate(`(() => {
    __low(); APP.tick(300);
    const S = APP.sim;
    OVERLAY.analyse(S, APP.SIM.columns(true));    // seed the live EMAs
    const seed1 = S._hA !== null && S._qA !== null;
    APP.avg.set(true);                            // Live -> Average
    const clearedOn = S._hA === null && S._qA === null && !isFinite(S._ynK);
    OVERLAY.analyse(S, APP.SIM.columns(true));    // seed them again, under Average
    const seed2 = S._hA !== null;
    APP.avg.set(false);                           // Average -> Live
    const clearedOff = S._hA === null && S._qA === null && !isFinite(S._ynK);
    return { seed1, clearedOn, seed2, clearedOff, on: APP.state.avg };
  })()`);
  ok("H5 the transition probe actually had estimates to clear",
     sw.seed1 && sw.seed2, JSON.stringify(sw));
  ok("avg both Live/Average transitions drop the overlay's temporal estimates",
     sw.clearedOn && sw.clearedOff, JSON.stringify(sw));

  // The legend's Fit has to fit what is PAINTED. The live 99th percentile is
  // drawn from excursions the mean does not contain, so fitting to it under a
  // mean picture sets a scale nothing on screen reaches and every colour reads
  // low.
  //
  // "The mean range is narrower" is TRUE but is not the assertion: it is
  // physics, and it varies — measured over two runs the pressure head came in
  // at 0.82x and then 0.95x of the live percentile, so any threshold drawn
  // across it is a threshold across the weather. So this compares the number
  // Fit returns against an INDEPENDENT CPU percentile computed from
  // avgField() with the same wet test and the same order statistic. Same
  // arithmetic on the same data: agreement is exact, and reading the live
  // field instead misses by the whole gap between the two distributions.
  const ft = await B.evaluate(`(() => {
    __low(); APP.tick(600);
    APP.avg.set(true); APP.frames(300);
    const S = APP.sim, nx = S.nx, ny = S.ny;
    const A = APP.SIM.avgField();
    const v = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!(A.fbar[k] >= 0.5) || S.mask[k] >= 192) continue;   // fieldStats' own wet test
        v.push(Math.hypot(A.ubar[k], A.wbar[k]));                // mode 2 = |u|
      }
    }
    v.sort((a, b) => a - b);
    const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    const ref = { lo: at(0.01), hi: at(0.99), n: v.length };
    const got = APP.SIM.fieldStats(2, true);
    const live = APP.SIM.fieldStats(2, false);
    APP.avg.set(false);
    return { refHi: ref.hi, refN: ref.n, gotHi: got.hi, gotN: got.n,
             liveHi: live.hi, liveN: live.n,
             relRef: Math.abs(got.hi - ref.hi) / Math.max(ref.hi, 1e-9),
             relLive: Math.abs(live.hi - ref.hi) / Math.max(ref.hi, 1e-9) };
  })()`);
  console.log("    Fit: mean hi " + ft.gotHi.toFixed(4) + " against a CPU mean percentile of " +
    ft.refHi.toFixed(4) + " (rel " + ft.relRef.toExponential(2) + ") and a live " +
    ft.liveHi.toFixed(4) + " (rel " + ft.relLive.toExponential(2) + ")");
  // Power: the two distributions must actually separate, or landing on either
  // would look the same.
  ok("the Fit probe's two references separate",
     ft.refN > 100 && ft.relLive > 0.02, JSON.stringify(ft));
  ok("avg Fit reads the MEAN field, not the instant behind it",
     ft.relRef < 1e-5 && ft.gotN === ft.refN, JSON.stringify(ft));
};


// -------------------------------------------------------------------- main
(async () => {
  let srv, B;
  const t0 = Date.now();
  try {
    srv = await serve();
    B = await browser();
    const names = ONLY.length ? ONLY : Object.keys(SUITES);
    for (const n of names) {
      if (!SUITES[n]) { failures.push("no such suite: " + n); continue; }
      process.stdout.write("  " + n + " …");
      const before = failures.length;
      try { await SUITES[n](B); } catch (e) { failures.push(n + " suite threw: " + e.message); }
      console.log(failures.length === before ? " ok" : " FAILED");
    }
  } catch (e) {
    failures.push("harness: " + e.message);
  } finally {
    if (srv) srv.close();
    if (B && !(KEEP && failures.length)) B.close();
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (failures.length) {
    console.log(`\nsmoke FAILED — ${failures.length} problem(s), ${passed} passed, ${secs}s\n`);
    failures.forEach((f) => console.log("  ✗ " + f));
    process.exit(1);
  }
  console.log(`\n${passed} assertions passed in ${secs}s`);
  process.exit(0);
})();
