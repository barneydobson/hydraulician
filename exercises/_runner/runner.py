#!/usr/bin/env python3
"""
runner.py — drive the hydraulician sim in a dedicated Chrome, unattended.

Zero dependencies: the Chrome DevTools Protocol is spoken over a ~120-line
stdlib WebSocket client (pip is PEP-668 locked on this box, and the project is
dependency-free by charter). If you would rather use `websocket-client`, it is
not needed and not used.

Why this exists: the Claude browser pane never composites the page, so every
WebGL draw costs 2-13 ms and any javascript_tool call is killed at 30 s. A
dedicated, VISIBLE Chrome on the real X display runs the same sim at driver
speed, and the `pump` subcommand moves the 30 s ceiling out of the way
entirely by running the substep loop page-side and polling it from here.

CLI
  runner.py launch --id A --scene h23 [--url URL] [--mode auto|visible|headless]
  runner.py eval   --id A 'expr'            (or --file snippet.js, or - for stdin)
  runner.py pump   --id A --sim-seconds 25  (or --substeps N)
  runner.py shot   --id A --out f.png [--mode fullui|canvas]
  runner.py bench  --id A [--seconds 10]
  runner.py status --id A
  runner.py close  --id A

Library
  from runner import Runner
  r = Runner("A"); r.launch(scene="h23"); r.pump(sim_seconds=25)
  print(r.ev("APP.sim.t")); r.shot("out.png"); r.close()

Safety: every instance gets its own --user-data-dir under the state dir and its
own --remote-debugging-port. Nothing here ever touches the user's own Chrome
profile or processes; `close` kills only PIDs whose /proc cmdline contains this
instance's unique user-data-dir path.
"""

import argparse
import base64
import json
import os
import re
import shutil
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.request
import zlib

STATE_DIR = os.environ.get("HYDRA_RUNNER_STATE") or (
    "/tmp/claude-1000/-home-barney-Documents-GitHub-hydraulician/"
    "8bfccd4e-e396-4491-8058-3d8106adf14a/scratchpad/runner")
DEFAULT_URL = "http://localhost:8124/index.html"
CHROME_CANDIDATES = ["google-chrome", "google-chrome-stable", "chromium",
                     "chromium-browser", "chrome"]


# --------------------------------------------------------------- websocket
class WS:
    """Minimal RFC-6455 client: text frames, fragmentation, ping/pong."""

    def __init__(self, url, timeout=120.0):
        m = re.match(r"ws://([^/:]+):(\d+)(/.*)$", url)
        if not m:
            raise ValueError("bad ws url: " + url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=15)
        self.sock.settimeout(timeout)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
               "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n" % (path, host, port, key))
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise IOError("ws handshake closed")
            buf += chunk
        head, _, rest = buf.partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise IOError("ws handshake failed: " + head.split(b"\r\n")[0].decode())
        self._buf = rest

    # -- raw io
    def _read(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self._buf)))
            if not chunk:
                raise IOError("ws closed by peer")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def _frame(self, opcode, payload):
        mask = os.urandom(4)
        n = len(payload)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(head + mask + masked)

    def send(self, text):
        self._frame(0x1, text.encode("utf-8"))

    def recv(self):
        data, op = b"", None
        while True:
            b0, b1 = self._read(2)
            fin, opcode = b0 & 0x80, b0 & 0x0F
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n) if n else b""
            if opcode == 0x9:                      # ping
                self._frame(0xA, payload)
                continue
            if opcode == 0xA:                      # pong
                continue
            if opcode == 0x8:
                raise IOError("ws close frame")
            if opcode in (0x1, 0x2):
                op, data = opcode, payload
            else:                                  # continuation
                data += payload
            if fin:
                return data.decode("utf-8", "replace")

    def close(self):
        try:
            self._frame(0x8, b"")
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass


class CDPError(RuntimeError):
    pass


class CDP:
    def __init__(self, ws_url, timeout=180.0):
        self.ws = WS(ws_url, timeout=timeout)
        self.mid = 0

    def call(self, method, params=None, timeout=180.0):
        self.mid += 1
        mid = self.mid
        self.ws.sock.settimeout(timeout)
        self.ws.send(json.dumps({"id": mid, "method": method,
                                 "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise CDPError("%s: %s" % (method, msg["error"]))
                return msg.get("result", {})

    def evaluate(self, expr, await_promise=False, timeout=180.0):
        r = self.call("Runtime.evaluate", {
            "expression": expr, "returnByValue": True,
            "awaitPromise": bool(await_promise), "userGesture": True,
        }, timeout=timeout)
        if "exceptionDetails" in r:
            ex = r["exceptionDetails"]
            desc = (ex.get("exception") or {}).get("description") or ex.get("text")
            raise CDPError("page exception: %s" % desc)
        return (r.get("result") or {}).get("value")

    def close(self):
        self.ws.close()


# ------------------------------------------------------------ page scripts
PUMP_JS = r"""
(function(opts){
  if (!window.APP) return {err:"no APP"};
  var P = window.__pump = {
    targetT: opts.targetT, targetN: opts.targetN,
    n: 0, tsim: APP.sim.t, t0: APP.sim.t,
    running: true, done: false, err: null,
    chunk: 4, wall0: performance.now(), wall: 0, rate: 0, msPer: 0,
    chunkMs: opts.chunkMs || 150
  };
  APP.state.paused = true;                 // the rAF loop must not double-step
  var stepFn = (APP.SIM && APP.SIM.step) ? function(n){ APP.SIM.step(n); }
                                         : function(n){ APP.tick(n); };
  function beat(){
    if (!P.running) { P.done = true; return; }
    try {
      var c = Math.max(1, Math.round(P.chunk));
      if (P.targetN != null) c = Math.min(c, Math.max(1, P.targetN - P.n));
      var a = performance.now();
      stepFn(c);
      try { APP.SIM.columns(true); } catch(e) {}   // readPixels = real GPU sync
      var ms = performance.now() - a;
      P.n += c; P.tsim = APP.sim.t;
      P.wall = (performance.now() - P.wall0) / 1000;
      P.rate = P.n / Math.max(P.wall, 1e-6);
      P.msPer = ms / c;
      P.chunk = Math.max(1, Math.min(20000, P.chunkMs / Math.max(P.msPer, 1e-4)));
      if ((P.targetT != null && P.tsim >= P.targetT) ||
          (P.targetN != null && P.n >= P.targetN)) {
        P.running = false; P.done = true; return;
      }
    } catch (e) {
      P.err = String((e && e.stack) || e); P.running = false; P.done = true; return;
    }
    setTimeout(beat, 0);
  }
  setTimeout(beat, 0);
  return {ok: true, dt: APP.SIM.dt(), t: APP.sim.t};
})(%s)
"""

CANVAS_SHOT_JS = r"""
(function(){
  var was = APP.state.paused;
  APP.state.paused = true;
  APP.frames(2);                       // render into a buffer we then read NOW
  var v = document.getElementById('view'), o = document.getElementById('over');
  var c = document.createElement('canvas');
  c.width = v.width; c.height = v.height;
  var x = c.getContext('2d');
  x.fillStyle = '#0b0f14'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(v, 0, 0, c.width, c.height);
  if (o) x.drawImage(o, 0, 0, c.width, c.height);
  APP.state.paused = was;
  // blankness metric: distinct colours in a 64x64 sample
  var d = x.getImageData(0, 0, c.width, c.height).data, seen = {}, k = 0;
  for (var j = 0; j < 64; j++) for (var i = 0; i < 64; i++) {
    var px = ((Math.floor(j * c.height / 64) * c.width) +
              Math.floor(i * c.width / 64)) * 4;
    var key = d[px] + ',' + d[px+1] + ',' + d[px+2];
    if (!seen[key]) { seen[key] = 1; k++; }
  }
  return {url: c.toDataURL('image/png'), colours: k, w: c.width, h: c.height};
})()
"""

RENDERER_JS = r"""
(function(){
  var c = document.createElement('canvas');
  var g = c.getContext('webgl2');
  if (!g) return {webgl2:false};
  var d = g.getExtension('WEBGL_debug_renderer_info');
  return {webgl2:true,
          renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
          vendor:   d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL)   : g.getParameter(g.VENDOR)};
})()
"""


# ------------------------------------------------------------------ runner
def _free_port(start):
    for p in range(start, start + 400):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise RuntimeError("no free debugging port")


def _pids_for(user_data_dir):
    """PIDs whose cmdline contains this instance's unique --user-data-dir."""
    needle = ("--user-data-dir=" + user_data_dir).encode()
    out = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open("/proc/%s/cmdline" % name, "rb") as fh:
                if needle in fh.read():
                    out.append(int(name))
        except (IOError, OSError):
            continue
    return out


def _have_display():
    d = os.environ.get("DISPLAY")
    if not d:
        return False
    try:
        return bool(os.listdir("/tmp/.X11-unix"))
    except OSError:
        return False


BASE_FLAGS = [
    "--no-first-run", "--no-default-browser-check", "--no-service-autorun",
    "--disable-background-timer-throttling",       # the whole point
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion,BackForwardCache,"
    "IntensiveWakeUpThrottling,MediaRouter,Translate",
    "--disable-ipc-flooding-protection",
    # THE ONE THAT MATTERS. With the monitor DPMS-off (any unattended desktop
    # after a few minutes) the GPU process paces the renderer's command buffer
    # off a vsync source that has gone to ~1 Hz: every synchronous readback
    # then costs ~1 s and the sim runs at 1 substep/s with document.hidden
    # still false. Measured, on this box: 1.07 substeps/s without these flags,
    # ~20 000 with them.
    "--disable-gpu-vsync", "--disable-frame-rate-limit",
    "--disable-hang-monitor", "--disable-popup-blocking",
    "--disable-sync", "--disable-extensions", "--mute-audio",
    "--metrics-recording-only", "--password-store=basic", "--use-mock-keychain",
    "--autoplay-policy=no-user-gesture-required",
]

MODES = [
    # (name, needs_display, extra flags)
    ("visible", True, []),
    ("headless-gl-egl", False, ["--headless=new", "--use-angle=gl-egl",
                                "--enable-gpu", "--use-gl=angle"]),
    ("headless-vulkan", False, ["--headless=new", "--use-angle=vulkan",
                                "--enable-features=Vulkan"]),
    ("headless-swiftshader", False, ["--headless=new",
                                     "--use-gl=angle", "--use-angle=swiftshader"]),
]


class Runner:
    def __init__(self, ident, state_dir=STATE_DIR):
        self.id = ident
        self.dir = state_dir
        os.makedirs(self.dir, exist_ok=True)
        self.state_path = os.path.join(self.dir, "%s.json" % ident)
        self.state = {}
        self._cdp = None
        if os.path.exists(self.state_path):
            with open(self.state_path) as fh:
                self.state = json.load(fh)

    # -- plumbing
    def _save(self):
        with open(self.state_path, "w") as fh:
            json.dump(self.state, fh, indent=1)

    def _chrome(self):
        for c in CHROME_CANDIDATES:
            p = shutil.which(c)
            if p:
                return p
        raise RuntimeError("no chrome/chromium on PATH")

    def _port(self):
        base = 9310 + (zlib.crc32(self.id.encode()) % 300)
        return _free_port(base)

    def _targets(self, port):
        with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port,
                                    timeout=5) as r:
            return json.load(r)

    def _page_ws(self, port):
        for t in self._targets(port):
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                return t["webSocketDebuggerUrl"]
        return None

    @property
    def cdp(self):
        if self._cdp is None:
            if not self.state:
                raise RuntimeError("no state for id %r — launch first" % self.id)
            url = self._page_ws(self.state["port"])
            if not url:
                raise RuntimeError("no page target on port %d (dead browser?)"
                                   % self.state["port"])
            self._cdp = CDP(url)
            self._cdp.call("Runtime.enable")
            self._cdp.call("Page.enable")
        return self._cdp

    def ev(self, expr, timeout=180.0, await_promise=False):
        return self.cdp.evaluate(expr, await_promise=await_promise, timeout=timeout)

    # -- launch
    def launch(self, scene=None, url=DEFAULT_URL, mode="auto", window=(1280, 900),
               verbose=True):
        if self.state and _pids_for(self.state.get("udd", "\0")):
            if verbose:
                print("[%s] already running (%s, pid %s) — reusing"
                      % (self.id, self.state.get("mode"), self.state.get("pid")))
            return self.state
        full = url + (("?scene=" + scene) if scene else "")
        disp = _have_display()
        cands = [m for m in MODES if (mode == "auto") or (m[0] == mode)]
        if mode == "auto":
            cands = [m for m in cands if disp or not m[1]]
        if not cands:
            raise RuntimeError("mode %r unavailable here" % mode)
        errors = []
        for name, _needs, extra in cands:
            if verbose:
                print("[%s] trying mode %s ..." % (self.id, name))
            try:
                st = self._start(name, extra, full, window, verbose)
                if verbose:
                    print("[%s] mode=%s renderer=%s webgl2=%s"
                          % (self.id, name, st["renderer"], st["webgl2"]))
                return st
            except Exception as exc:               # noqa: BLE001 — try next mode
                errors.append("%s: %s" % (name, exc))
                self._kill(quiet=True)
                if verbose:
                    print("[%s]   failed: %s" % (self.id, exc))
        raise RuntimeError("all modes failed:\n  " + "\n  ".join(errors))

    def _start(self, mode_name, extra, full_url, window, verbose):
        port = self._port()
        udd = os.path.join(self.dir, "chrome-%s" % self.id)
        os.makedirs(udd, exist_ok=True)
        # stagger windows so three concurrent workers do not fully occlude
        k = zlib.crc32(self.id.encode()) % 4
        pos = (40 + 60 * k, 30 + 50 * k)
        argv = [self._chrome(),
                "--user-data-dir=" + udd,
                "--remote-debugging-port=%d" % port,
                "--window-size=%d,%d" % window,
                "--window-position=%d,%d" % pos] + BASE_FLAGS + extra + [full_url]
        log = open(os.path.join(self.dir, "%s-chrome.log" % self.id), "ab")
        proc = subprocess.Popen(argv, stdout=log, stderr=log,
                                start_new_session=True)
        self.state = {"id": self.id, "pid": proc.pid, "port": port, "udd": udd,
                      "mode": mode_name, "url": full_url,
                      "started": time.time()}
        self._save()
        # wait for a page target
        ws = None
        for _ in range(160):
            if proc.poll() is not None:
                raise RuntimeError("chrome exited rc=%s" % proc.returncode)
            try:
                ws = self._page_ws(port)
            except Exception:
                ws = None
            if ws:
                break
            time.sleep(0.25)
        if not ws:
            raise RuntimeError("no devtools page target after 40 s")
        self._cdp = CDP(ws)
        self._cdp.call("Runtime.enable")
        self._cdp.call("Page.enable")
        # wait for the app: window.APP plus a built grid
        ok = False
        for _ in range(160):
            try:
                ok = self._cdp.evaluate(
                    "!!(window.APP && APP.sim && APP.sim.nx > 0)", timeout=20)
            except Exception:
                ok = False
            if ok:
                break
            time.sleep(0.25)
        if not ok:
            raise RuntimeError("window.APP never appeared (server down? bad url?)")
        info = self._cdp.evaluate(RENDERER_JS) or {}
        if not info.get("webgl2"):
            raise RuntimeError("no WebGL2 context in this mode")
        # the app must actually be drawing: advance a few frames, demand water
        self._cdp.evaluate("APP.frames(4)", timeout=60)
        vol = self._cdp.evaluate("APP.volume()", timeout=60)
        self.state.update({"renderer": info.get("renderer"),
                           "vendor": info.get("vendor"),
                           "webgl2": True, "volume0": vol})
        self._save()
        return self.state

    # -- pump
    def pump(self, sim_seconds=None, substeps=None, chunk_ms=150,
             poll=1.0, timeout=7200.0, verbose=True):
        if (sim_seconds is None) == (substeps is None):
            raise ValueError("give exactly one of sim_seconds / substeps")
        dt = self.ev("APP.SIM.dt()")
        t0 = self.ev("APP.sim.t")
        opts = {"chunkMs": chunk_ms, "targetT": None, "targetN": None}
        if sim_seconds is not None:
            opts["targetT"] = t0 + float(sim_seconds)
            want_n = float(sim_seconds) / max(dt, 1e-12)
        else:
            opts["targetN"] = int(substeps)
            want_n = float(substeps)
        start = self.ev(PUMP_JS % json.dumps(opts), timeout=120)
        if isinstance(start, dict) and start.get("err"):
            raise RuntimeError(start["err"])
        if verbose:
            tgt = ("t=%.2f s" % opts["targetT"]) if opts["targetT"] else \
                  ("%d substeps" % opts["targetN"])
            print("[%s] pump: dt=%.3g s, from t=%.2f to %s (~%.0f substeps)"
                  % (self.id, dt, t0, tgt, want_n))
        wall0 = time.time()
        last = None
        while True:
            time.sleep(poll)
            snap = self.ev("window.__pump && JSON.parse(JSON.stringify(window.__pump))",
                           timeout=120)
            if not snap:
                raise RuntimeError("pump vanished (page reloaded?)")
            last = snap
            wall = time.time() - wall0
            done = snap["n"] / max(want_n, 1e-9)
            eta = (wall / max(done, 1e-6)) - wall if done > 0 else float("inf")
            if verbose:
                print("[%s] t=%.2f s  (+%.2f/%.2f sim-s)  %d substeps  "
                      "%.0f steps/s  %.1f ms/step  wall %.0f s  ETA %.0f s"
                      % (self.id, snap["tsim"], snap["tsim"] - snap["t0"],
                         (sim_seconds if sim_seconds is not None
                          else want_n * dt),
                         snap["n"], snap["rate"], snap["msPer"],
                         wall, eta if eta < 1e6 else -1))
                sys.stdout.flush()
            if snap.get("err"):
                raise RuntimeError("page-side pump error: " + snap["err"])
            if snap.get("done"):
                break
            if wall > timeout:
                self.ev("window.__pump.running=false")
                raise RuntimeError("pump timeout after %.0f s" % wall)
        last["wallTotal"] = time.time() - wall0
        return last

    def bench(self, seconds=10.0, verbose=True):
        """Free-run the pump for `seconds` of wall clock; report substeps/s."""
        self.ev(PUMP_JS % json.dumps({"chunkMs": 150, "targetT": None,
                                      "targetN": 10 ** 9}), timeout=120)
        time.sleep(seconds)
        self.ev("window.__pump.running=false")
        time.sleep(0.5)
        snap = self.ev("JSON.parse(JSON.stringify(window.__pump))")
        dt = self.ev("APP.SIM.dt()")
        res = {"mode": self.state.get("mode"),
               "renderer": self.state.get("renderer"),
               "substepsPerSec": snap["rate"], "msPerSubstep": snap["msPer"],
               "dt": dt, "substepsPerSimSec": 1.0 / dt,
               "realtimeFactor": snap["rate"] * dt,
               "wallPerSimSec": 1.0 / max(snap["rate"] * dt, 1e-9),
               "nx": self.ev("APP.sim.nx"), "ny": self.ev("APP.sim.ny")}
        if verbose:
            print(json.dumps(res, indent=1))
        return res

    # -- screenshots
    def shot(self, out, mode="fullui", panel=False, verbose=True):
        if mode == "fullui":
            if panel:      # the slider panel is behind the "Controls" button
                self.ev("document.getElementById('panel').classList.add('open');"
                        " syncPanel(); 1")
            self.ev("APP.state.paused=true; APP.frames(2); 1", timeout=120)
            r = self.cdp.call("Page.captureScreenshot",
                              {"format": "png", "captureBeyondViewport": False},
                              timeout=180)
            data = base64.b64decode(r["data"])
            meta = self.ev("({panelOpen: document.getElementById('panel')"
                           ".classList.contains('open'),"
                           " vol: APP.volume(), t: APP.sim.t})")
        elif mode == "canvas":
            r = self.ev(CANVAS_SHOT_JS, timeout=180)
            data = base64.b64decode(r["url"].split(",", 1)[1])
            meta = {"colours": r["colours"], "w": r["w"], "h": r["h"],
                    "vol": self.ev("APP.volume()")}
        else:
            raise ValueError("mode must be fullui or canvas")
        with open(out, "wb") as fh:
            fh.write(data)
        meta["bytes"] = len(data)
        meta["path"] = os.path.abspath(out)
        if len(data) < 3000:
            meta["WARNING"] = "suspiciously small — probably blank"
        if verbose:
            print(json.dumps(meta))
        return meta

    # -- teardown
    def _kill(self, quiet=False):
        udd = self.state.get("udd")
        if not udd:
            return 0
        pids = _pids_for(udd)
        for p in pids:
            try:
                os.kill(p, signal.SIGTERM)
            except OSError:
                pass
        for _ in range(40):
            if not _pids_for(udd):
                break
            time.sleep(0.25)
        left = _pids_for(udd)
        for p in left:
            try:
                os.kill(p, signal.SIGKILL)
            except OSError:
                pass
        if not quiet:
            print("[%s] killed %d process(es) under %s" % (self.id, len(pids), udd))
        return len(pids)

    def close(self, wipe_profile=True):
        try:
            if self._cdp:
                self._cdp.close()
        except Exception:
            pass
        self._cdp = None
        n = self._kill()
        if wipe_profile and self.state.get("udd", "").startswith(self.dir):
            shutil.rmtree(self.state["udd"], ignore_errors=True)
        if os.path.exists(self.state_path):
            os.remove(self.state_path)
        return n

    def status(self):
        st = dict(self.state)
        st["alive_pids"] = _pids_for(st.get("udd", "\0")) if st else []
        if st.get("alive_pids"):
            try:
                st["t"] = self.ev("APP.sim.t", timeout=20)
                st["scene"] = self.ev("APP.state.scene && APP.state.scene.id")
                st["pump"] = self.ev(
                    "window.__pump && {n:__pump.n,t:__pump.tsim,"
                    "rate:__pump.rate,done:__pump.done}")
            except Exception as exc:
                st["error"] = str(exc)
        return st


# --------------------------------------------------------------------- CLI
def main(argv=None):
    ap = argparse.ArgumentParser(prog="runner.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state-dir", default=STATE_DIR)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("launch")
    p.add_argument("--id", required=True)
    p.add_argument("--scene", default=None)
    p.add_argument("--url", default=DEFAULT_URL)
    p.add_argument("--mode", default="auto",
                   choices=["auto"] + [m[0] for m in MODES])
    p.add_argument("--window", default="1280,900")

    p = sub.add_parser("eval")
    p.add_argument("--id", required=True)
    p.add_argument("expr", nargs="?", default="-")
    p.add_argument("--file", default=None)
    p.add_argument("--await", dest="awaitp", action="store_true")
    p.add_argument("--timeout", type=float, default=180.0)

    p = sub.add_parser("pump")
    p.add_argument("--id", required=True)
    p.add_argument("--sim-seconds", type=float, default=None)
    p.add_argument("--substeps", type=int, default=None)
    p.add_argument("--chunk-ms", type=float, default=150.0)
    p.add_argument("--poll", type=float, default=1.0)
    p.add_argument("--timeout", type=float, default=7200.0)

    p = sub.add_parser("shot")
    p.add_argument("--id", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--mode", default="fullui", choices=["fullui", "canvas"])
    p.add_argument("--panel", action="store_true",
                   help="open the Controls slider panel before a fullui shot")

    p = sub.add_parser("bench")
    p.add_argument("--id", required=True)
    p.add_argument("--seconds", type=float, default=10.0)

    for name in ("close", "status"):
        p = sub.add_parser(name)
        p.add_argument("--id", required=True)

    a = ap.parse_args(argv)
    r = Runner(a.id, state_dir=a.state_dir)

    if a.cmd == "launch":
        w = tuple(int(v) for v in a.window.split(","))
        st = r.launch(scene=a.scene, url=a.url, mode=a.mode, window=w)
        print(json.dumps({k: st[k] for k in
                          ("id", "mode", "port", "pid", "renderer", "url")}))
    elif a.cmd == "eval":
        expr = (open(a.file).read() if a.file else
                (sys.stdin.read() if a.expr == "-" else a.expr))
        print(json.dumps(r.ev(expr, timeout=a.timeout, await_promise=a.awaitp)))
    elif a.cmd == "pump":
        snap = r.pump(sim_seconds=a.sim_seconds, substeps=a.substeps,
                      chunk_ms=a.chunk_ms, poll=a.poll, timeout=a.timeout)
        print(json.dumps({"t": snap["tsim"], "substeps": snap["n"],
                          "rate": snap["rate"], "wall": snap["wallTotal"]}))
    elif a.cmd == "shot":
        r.shot(a.out, mode=a.mode, panel=a.panel)
    elif a.cmd == "bench":
        r.bench(seconds=a.seconds)
    elif a.cmd == "close":
        r.close()
        print(json.dumps({"closed": a.id}))
    elif a.cmd == "status":
        print(json.dumps(r.status(), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
