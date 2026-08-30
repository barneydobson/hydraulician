/**
 * cdp.mjs — a minimum Chrome DevTools Protocol client, with no dependencies.
 *
 * Node 22+ ships a global WebSocket and a global fetch, which is the whole
 * reason this file can exist inside a project whose first rule is that it has
 * no build step and no package.json. It launches a headless Chrome, opens one
 * tab per test case, and evaluates expressions in it.
 *
 * `exercises/_runner/runner.py` does the same job for the exercise pack and is
 * Linux-bound; this is the cross-platform half, and it only has to be good
 * enough to drive the user interface.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where Chrome tends to be. `$CHROME` wins, so a bespoke install still runs. */
const CANDIDATES = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ],
};

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const p of CANDIDATES[process.platform] || []) if (existsSync(p)) return p;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ANGLE backend for headless Chrome's GPU-backed rasteriser, chosen by
 * platform: `d3d11` and `metal` are real GPU backends but exist only on
 * Windows and macOS respectively. Software (SwiftShader, `--disable-gpu`)
 * renders a full-window WebGL canvas so slowly that a spin-up scene times
 * the run out — measured on scene m1 at Low, 828x64: ANGLE reaches sim
 * t=30s in 6.5s of wall clock; SwiftShader reaches only t~9.5s in a 150s
 * budget, roughly 50x slower.
 *
 * Linux gets `gl`, not `vulkan`: ANGLE's Vulkan backend needs a working
 * Vulkan ICD on the host, which a generic Linux box (and most CI runners)
 * does not reliably have, whereas the GL backend talks to Mesa — present on
 * essentially every Linux desktop and server install, real GPU or not — and
 * is the path most headless-Chrome-on-Linux deployments already exercise.
 * `gl` is the safer default; a maintainer who has confirmed Vulkan drivers
 * can opt in with `$ANGLE=vulkan`.
 *
 * `$ANGLE` overrides the platform pick, the same way `$CHROME` above
 * overrides the browser binary. `$SOFTWARE=1` asks for the old
 * `--disable-gpu` behaviour, for a machine with no working GPU backend.
 *
 * Duplicated (not shared) in exercises/_runner/smoke.js's browser(): this
 * file is an ES module and smoke.js is CommonJS, and with no package.json
 * in this zero-dependency project neither can `import`/`require` a file
 * written for the other's module system without an extension trick or an
 * async interop shim — more moving parts than these ~10 lines are worth.
 * Keep the two copies in sync by hand if the policy ever changes.
 */
export function angleArgs() {
  if (process.env.SOFTWARE) return ["--disable-gpu"];
  const byPlatform = { win32: "d3d11", darwin: "metal", linux: "gl" };
  const backend = process.env.ANGLE || byPlatform[process.platform] || "gl";
  return ["--use-angle=" + backend];
}

/** Launch headless Chrome and connect to its browser endpoint. */
export async function launch({ port = 0, width = 1440, height = 900 } = {}) {
  const bin = findChrome();
  if (!bin) throw new Error("no Chrome found — set $CHROME to a Chrome or Edge binary");
  const profile = mkdtempSync(join(tmpdir(), "hydra-ui-"));
  const args = [
    "--headless=new", ...angleArgs(), "--disable-extensions",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--user-data-dir=" + profile,
    "--window-size=" + width + "," + height,
    "--remote-debugging-port=" + port,
    "about:blank",
  ];
  const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  // Chrome prints the endpoint on stderr; with port 0 that is the only way to
  // learn which port it actually took.
  const url = await new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error("Chrome did not report a DevTools endpoint")), 30000);
    proc.stderr.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(t); resolve(m[0]); }
    });
    proc.on("exit", (c) => { clearTimeout(t); reject(new Error("Chrome exited with " + c)); });
  });

  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP connect failed")); });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    listeners.forEach((fn) => fn(msg));
  };
  function send(method, params, sessionId) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(method + " timed out")); }
      }, 60000);
    });
  }

  /** One tab, already navigated, with its uncaught exceptions collected. */
  async function open(pageUrl, { ready, settleMs = 400 } = {}) {
    // No width/height here: headless Chrome refuses a target position unless
    // the target is a new window, and `--window-size` has already set it.
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const errors = [];
    const onEvent = (m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        errors.push(m.params.args.map((a) => a.description || a.value).join(" "));
      }
    };
    listeners.add(onEvent);
    await send("Runtime.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: pageUrl }, sessionId);

    async function evaluate(expr) {
      const r = await send("Runtime.evaluate", {
        expression: "(() => { " + expr + " })()",
        returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error("evaluate threw: " +
          ((d.exception && (d.exception.description || d.exception.value)) || d.text));
      }
      return r.result.value;
    }

    // Wait for the app to have booted rather than for a fixed delay: a WebGL
    // context and six compiled programs is not a load event.
    const cond = ready || "return !!window.APP && !!document.querySelector('#groups .tbtn');";
    const until = Date.now() + 30000;
    for (;;) {
      let ok = false;
      try { ok = await evaluate(cond); } catch (_) { /* still navigating */ }
      if (ok) break;
      if (Date.now() > until) throw new Error("app did not boot: " + pageUrl);
      await sleep(120);
    }
    await sleep(settleMs);       // a few frames, so the first sync has run

    return {
      evaluate, errors,
      /** Raw protocol, bound to this tab — device emulation and screenshots.
       *  Chrome will not open a window narrower than about 500 css px, so a
       *  true phone viewport can only be had through Emulation. */
      send: (method, params) => send(method, params, sessionId),
      close: async () => {
        listeners.delete(onEvent);
        await send("Target.closeTarget", { targetId });
      },
    };
  }

  return {
    open,
    close: async () => {
      try { ws.close(); } catch (_) { /* already gone */ }
      proc.kill();
      await sleep(150);
      try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* Windows holds it briefly */ }
    },
  };
}
