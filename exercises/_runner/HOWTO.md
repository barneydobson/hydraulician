# runner.py — driving the sim unattended

Zero deps (stdlib CDP client); the static server on :8124 must be up.
**Concurrency:** one Chrome per `--id`, and `--id` is *your demo id*
(`HJ-1-belanger`). Never reuse another worker's id, never touch the user's own
Chrome, three instances max — the GPU saturates near 19 k substeps/s, shared.

```bash
R="python3 exercises/_runner/runner.py"
$R launch --id HJ1 --scene h23          # visible Chrome on :1, hardware GL
$R eval   --id HJ1 'CONTROLS.find(c=>c.id==="inQ").set(0.42); syncPanel(); APP.sim.p.inflow.q'
$R pump   --id HJ1 --sim-seconds 25     # ~1 Hz heartbeats, no 30 s ceiling, resumable
$R eval   --id HJ1 --file read.js       # long snippets live in a file
$R shot   --id HJ1 --out fig.png --mode canvas     # or --mode fullui [--panel]
$R bench  --id HJ1 ; $R status --id HJ1
$R close  --id HJ1                      # ALWAYS, even after a failure
```

## Worked example — h23 jump box (`read.js`, run with `eval --file`)
```js
(function(){
  APP.state.paused = false; APP.frames(60);          // physics + analyse EMA
  var A; for (var i=0;i<15;i++) A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
  APP.state.paused = true;
  var j = OVERLAY.findJumps(A, APP.sim)[0];          // undefined if no free jump
  return JSON.stringify({Fr1:j.Fr1, d1:j.d1, d2:j.d2, d2p:j.d2p, dE:j.dE});
})()
```
After `pump --sim-seconds 25`: q=0.50 → Fr₁ 2.24, d₁ 0.176, d₂ 0.415, d₂ᵖ 0.476
(the verified pair in docs/engineering-notes.md is 2.24 / 0.416 — the harness
reproduces it).
q=0.42 → Fr₁ 1.40, d₂/d₁ 1.84, +19 % over Bélanger: h23's tailwater is tuned for
q = 0.5, so a lower q drowns the jump. Physics, not harness.

## macOS

The runner is written for the Linux box it was made on: it scans `/proc` for
PIDs and probes `/tmp/.X11-unix`. `runner_mac.py` shims those two (`pgrep -f`,
and a constant true) rather than editing this file — same CLI, so
`python3 exercises/_runner/runner_mac.py launch --id UN3 --scene hammer`. Two traps, each measured
at about an hour: the `chrome` on PATH must be an **exec wrapper script**,
not a symlink — the .app resolves its framework relative to the executable
path, so a symlink dies in dlopen — and a pgrep needle must not begin with
`--`, or BSD pgrep swallows it as options, matches nothing, and reports
"killed 0" while the browser keeps running. If `launch` fails through all
four modes with "window.APP never appeared", the static server has died:
curl it before suspecting the runner or the GPU.

## Bites
- `pump` leaves the sim **paused**; `APP.state.paused=false` returns it to rAF.
- `OVERLAY.analyse` is a 10 %/call EMA — warm it as above or you read half an average.
- `eval` prints JSON — `JSON.stringify(...)` anything structured.
- A bare `fullui` shot has no slider panel (it lives behind the Controls button): `--panel`.
- Confirm a settle by re-pumping 10 s and re-reading: the numbers should barely move.
- ~1 substep/s means the GPU-vsync flags went missing from `BASE_FLAGS`; see bench.md.

| mode | substeps/s | h23: 20 sim-s wall |
|---|---|---|
| visible, hw GL, 1 instance | 18 400 – 20 300 | 5.5 – 6.1 s |
| 2 concurrent | 7 700 – 9 900 | 11 – 14 s |
| 3 concurrent | 5 000 – 5 700 | 19 – 22 s |
| Claude browser pane (do not use) | 77 – 500 | 4 – 24 min |
