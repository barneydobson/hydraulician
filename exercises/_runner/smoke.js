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
    kills: "F1 transport residual",
    measured: "c 22 -> 11 gives a residual of 4.13e-1 against a 1.28e-3 bound, 323x over" },

  { id: "setvalve-no-reset", file: "/js/sim.js",
    why: "a valve toggle changes the solid set with no reset, so frozen cells resume mid-window",
    find: "    S.p.valveClosed = v;\n    if (S.avg) avgReset();",
    replace: "    S.p.valveClosed = v;",
    kills: "avg a valve toggle resets the window",
    measured: "T runs straight through the toggle instead of returning to zero" },
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
        const before = data.toString("utf8");
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
    "--headless=new", "--disable-gpu", "--window-size=1280,800",
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

  const csv = await B.evaluate(`(() => {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: 2.0, z: 0.40, hist: [], log: [], id: 1, colour: "#fff" });
    APP.frames(12);
    return APP.gaugeCSV().split("\\n")[0];
  })()`);
  ok("RIG gauge CSV header uses z and the h/d columns",
    /_z0\.40_h_m/.test(csv) && /_d_m/.test(csv) &&
    !/_head_m/.test(csv) && !/_depth_m/.test(csv), csv);
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
    const t = __settle(30, 150000);
    const A = __warm(20);
    const nx = A.d.length, lo = Math.floor(nx * 0.2), hi = Math.floor(nx * 0.8);
    const wet = [];
    for (let i = lo; i < hi; i++) if (A.ok[i] && A.d[i] > 3 * APP.sim.dx) wet.push(i);
    const q = wet.map((i) => A.q[i]).filter(Number.isFinite).sort((a, b) => a - b);
    const med = q[q.length >> 1];
    const third = Math.floor(wet.length / 3);
    const medOf = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
    const qUp = medOf(wet.slice(0, third).map((i) => A.q[i]));
    const qDn = medOf(wet.slice(-third).map((i) => A.q[i]));
    const mid = wet[Math.floor(wet.length / 2)];
    return { t, n: wet.length, qLo: q[0], qHi: q[q.length - 1], med, qUp, qDn,
             dMid: A.d[mid], dcMid: A.dc[mid],
             HFalls: A.H[wet[0]] > A.H[wet[wet.length - 1]] };
  })()`);
  ok("PHYSICS m1 has a wet reach to measure", flow.n > 50, flow.n + " columns");
  ok("PHYSICS discharge holds one value along the reach",
    flow.med > 0 && (flow.qHi - flow.qLo) / flow.med < 0.8,
    `q ${flow.qLo.toFixed(3)}–${flow.qHi.toFixed(3)}, median ${flow.med.toFixed(3)} m²/s` +
    ` (settled to ${flow.t.toFixed(1)} s)`);
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
  // loss is negative.
  ok("PHYSICS the reach loses energy through the box", cv.E < 0,
    cv.E.toFixed(1) + " W/m");
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
    ok("SCENE " + id + " boots and steps",
      r.t > 0 && r.finite && r.dOk && Number.isFinite(r.vol),
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
             max2: res2.max, Fmax2: res2.Fmax };
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
  // that forgets to divide by fbar. docs/averaging.md §8 A3/A4 exist for
  // exactly this ("alternating f = 1,0 with u = 10,0 gives 10, not 5").
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
    APP.SIM.avgStart();
    const mean = new Float64Array(nx), M2 = new Float64Array(nx);
    let T = 0;
    for (let s = 0; s < 80; s++) {
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
    const { sigma } = APP.SIM.avgColumns();
    const live = APP.SIM.columns(true);
    let n = 0, worst = -1, at = -1, ref0 = 0, got0 = 0, sMax = 0;
    for (let i = 2; i < nx - 2; i++) {
      if (!(live[i*4+1] > 0.02)) continue;          // wet columns only
      const ref = Math.sqrt(Math.max(0, M2[i] / T));
      if (ref > sMax) sMax = ref;
      if (ref < 1e-4) continue;                     // no signal to compare to
      n++;
      const rel = Math.abs(sigma[i] - ref) / ref;
      if (rel > worst) { worst = rel; at = i; ref0 = ref; got0 = sigma[i]; }
    }
    APP.SIM.avgStop();
    return { n, worst, at, ref: ref0, got: got0, sMax, T, nx };
  })()`);
  console.log(`    sigma_eta: ${cs.n} columns with signal (max sigma ${cs.sMax.toExponential(3)})` +
    ` over T=${cs.T.toFixed(4)}s; worst rel gap ${cs.worst.toExponential(3)} at i=${cs.at}` +
    ` (gpu ${cs.got.toExponential(4)} vs cpu ${cs.ref.toExponential(4)})`);
  ok("sigma_eta has something to measure", cs.n > 10, JSON.stringify(cs));
  ok("sigma_eta matches an independent float64 weighted Welford",
     cs.worst < 1e-3, JSON.stringify(cs));

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
