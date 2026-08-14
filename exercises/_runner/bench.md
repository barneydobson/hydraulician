# Acceptance evidence — `runner.py`

Box: Linux, X display `:1`, NVIDIA RTX 2060, Chrome 
`/usr/bin/google-chrome`, server already on :8124. Measured 2026-08-13.

## Mode achieved

`visible` — a dedicated Chrome window on the real display, hardware GL:
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`,
WebGL2 confirmed live. Headless fallbacks are implemented and ordered behind it
(`--headless=new` with `gl-egl`, then vulkan, then SwiftShader) but were never
needed, so they are untested in anger — a worker who lands on one should re-run
`bench` before trusting a schedule.

Dependencies: none. `pip install --user websocket-client` is **blocked on this
box** (PEP 668, externally-managed env), so CDP is spoken over a ~120-line
stdlib WebSocket client inside `runner.py`. Nothing to install.

## The finding that decides whether any of this works

With the monitor DPMS-off — i.e. any unattended desktop after a few idle
minutes — Chrome paces the renderer's GL command buffer off a vsync source that
has dropped to ~1 Hz. Every synchronous readback then costs ~1 s:

| | substeps/s | ms/substep | h23, 20 sim-s |
|---|---|---|---|
| monitor off, no vsync flags | **1.07** | 996 | ~29 hours |
| monitor off, `--disable-gpu-vsync --disable-frame-rate-limit` | **18 549** | 0.054 | 6.0 s |

`document.hidden` was `false` and `visibilityState` `"visible"` throughout the
slow case, so page-visibility diagnostics do not see it; only the substep rate
does. It is intermittent when it bites (a first run went 195 s at 1 substep/s,
then recovered on its own), which is exactly the failure mode that would make a
worker think the sim, not the browser, was broken. Both flags are now in
`BASE_FLAGS`. **If you ever see ~1 substep/s, this is why.**

## Throughput (h23 at Medium: 667×142, Δt = 1.807e-4, 5534 substeps per sim-s)

| concurrent instances | substeps/s each | ×realtime | 20 sim-s wall |
|---|---|---|---|
| 1 | 18 400 – 20 300 | 3.3 – 3.7 | **5.5 – 6.1 s** |
| 2 | 7 700 – 9 900 | 1.4 – 1.8 | 11 – 14 s |
| 3 | 5 000 – 5 700 | 0.90 – 1.03 | 19 – 22 s |
| Claude browser pane (pilot) | 77 – 500 | 0.014 – 0.09 | 4 – 24 min |

Aggregate is flat at ~19 k substeps/s, so the GPU is the shared resource and
three workers each get roughly realtime. Against the pane: **37× to 240× faster**.

Stability soak: one instance pumped 1 762 002 substeps over 212 s of wall with
the monitor off, instantaneous rate min 4 870 / median 9 092 substeps/s (the
minimum is the window where all three instances were running). No stall.

## Acceptance run

1. `launch --id TEST --scene h23` → visible, hw GL, as above. `bench` → 18 549/s.
2. `eval` set `CONTROLS.find(c=>c.id==='inQ').set(0.42); syncPanel()` → q = 0.42.
3. `pump --sim-seconds 25` → t 101.84 → 127.36, 141 226 substeps, **8.2 s wall**.
4. Warm `OVERLAY.analyse` (60 frames + 15 direct calls), `findJumps`:

| q | Fr₁ | y₁ | y₂ | y₂ᵖ (Bélanger) | y₂/y₁ | ΔE | err |
|---|---|---|---|---|---|---|---|
| 0.42, +25 s | 1.438 | 0.211 | 0.550 | 0.336 | 2.61 | 0.084 | +64 % |
| 0.42, +45 s | 1.403 | 0.214 | 0.393 | 0.330 | 1.84 | 0.017 | +19 % |
| 0.50, +30 s | 2.236 | 0.176 | 0.415 | 0.476 | 2.35 | 0.046 | −13 % |

y₂/y₁ sits in the 1.8–3.5 band throughout. Fr₁ at q = 0.42 lands at 1.40, just
under the 1.5–3 sanity band, and the Bélanger error is positive — the documented
signature of a **drowned** jump. That is correct physics, not a harness fault:
h23's tailwater is tuned to 1.3 y_c at q = 0.5, and dropping q to 0.42 drops
y_c 0.294 → 0.257 while the tailwater stays put, so the jump submerges and
walks upstream (x₀ 1.95 → 1.41 m). The q = 0.50 row is the control: **Fr₁ 2.236
and y₂ 0.415 against CLAUDE.md's verified 2.24 and 0.416** — the harness
reproduces the project's own measured numbers, through the same code path a
student would read on screen.

5. **Resumability**: a second `pump --sim-seconds 20` continued from t = 128.36
   with no re-init, 111 282 substeps in 6.1 s. Row 2 above is its result.
6. **Screenshots** (both non-blank, both read back and eyeballed):
   - `--mode fullui` → 203 703 B, 1236×769. Shows toolbar, status readout, hint
     bar, overlay furniture, and the on-screen HYDRAULIC JUMP box reading
     Fr₁ 1.40 / y₁ 0.214 / y₂ 0.393 / +19 % — identical to the `eval` numbers,
     which cross-validates the readback path against the UI.
   - `--mode fullui --panel` → 244 239 B, with the Controls slider panel open
     ("Inflow q 0.500 m²/s → 1.54 m/s, y_c = 0.294"), confirming `CONTROLS.set`
     + `syncPanel()` reaches the DOM. The panel is behind the Controls button,
     so a bare `fullui` shot does **not** contain it — pass `--panel`.
   - `--mode canvas` → 323 319 B, 1236×769, 352 distinct colours sampled: GL
     water plus the overlay, no DOM chrome. Composited in one `evaluate` because
     `preserveDrawingBuffer` is false.
7. **Teardown**: `close` on all three ids killed 9 / 9 / 9 processes matched by
   unique `--user-data-dir`; zero orphans afterwards (`ps` count 0), profiles
   and state files removed. The user's own Chrome was never touched — there was
   none running to touch.

## Does it meet the bar?

A 10-student sweep on h23, 25 sim-s of settle each, with three workers running
concurrently: 25 sim-s ≈ 27 s wall per student per worker, plus ~10 s for the
analyse warm-up, readback and a screenshot. **~6 minutes per worker for ten
students**, ~10 with launch and slack. Solo it is ~2 minutes. The bar was "well
under an hour" — it clears by an order of magnitude, unattended, with no
contact with the Claude browser pane.
