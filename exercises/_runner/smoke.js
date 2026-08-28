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

  async function goto(url) {
    await send("Page.navigate", { url });
    for (let i = 0; i < 160; i++) {                 // software GL boots slowly
      await new Promise((r) => setTimeout(r, 250));
      try {
        if (await evaluate("!!(window.APP && window.APP.sim)")) {
          await evaluate(HELPERS + "true");
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
    throw new Error("window.APP never appeared at " + url + " — " + why +
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
  // conservation laws the Force box is FOR, so they are asserted where a scene
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
