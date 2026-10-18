"use strict";
/**
 * governor.js — the frame-rate governor: how many substeps a frame may take,
 *    learned from the wall time they cost.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: statWin, gov, governFrame, governTarget, governLearn
 *
 * Reads:   CONFIG, state
 */
/**
 * governor.js — the frame-rate governor: how many substeps a frame may take, learned
 *   from the wall time they cost.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: statWin, gov, governFrame, governTarget, governLearn
 *
 * Reads:   CONFIG, state
 */
// The status line's window: frames, wall seconds and SIMULATED seconds over
// the last ~0.5 s, so ×RT is (sim advanced) / (wall elapsed) across the whole
// window rather than one frame's ratio — which alternated ×3 between a frame
// that queued work and the readback frame that waited for it.
const statWin = { wall: 0, sim: 0, n: 0, sub: 0 };
// The governor's state: when the previous tickFrame started (measured here, so
// APP.frames in a headless loop is governed by what it really costs too —
// see tickFrame for what a scripted frame is charged) and the time-windowed
// mean interval between frames (ms) — see governFrame.
const gov = { last: 0, W: 0, N: 0, ema: 0,
  win: { W: 0, N: 0, S: 0 },                     // this window's measured frames
  fit: { w: 0, n: 0, T: 0, nn: 0, nT: 0 },       // decayed sums for T = T0 + c n
  c: 0, T0: 0, T0floor: 0, warming: false,
  raf: false,                                    // inside frame(), not APP.frames
  end: 0 };                                      // when the last APP.frames frame returned
document.addEventListener("visibilitychange", () => { gov.last = 0; });
/** The frame-rate governor: sets `state.nsubMax`, the most substeps one frame
 *  may run, so that the SMOOTHED frame interval sits at the target
 *  (`governTarget`).
 *
 *  What it replaced timed the CPU around SIM.step and cut ×0.82 above 24 ms /
 *  crept ×1.05 below 11 ms. WebGL is asynchronous, so that clock read ~1 ms
 *  on two frames in three and the WHOLE queued GPU backlog on the third, when
 *  `columns()`'s readback forced a sync — the governor saw 3× the real cost,
 *  saw-toothed, and settled at a quarter of what the GPU could deliver
 *  (h23: ×0.1–0.2 RT interactive against ×0.42 flat out). The interval
 *  between frames is what the GPU's throughput actually sets, and over a few
 *  readback cycles it is not bimodal.
 *
 *  An integral controller on the log error, rate-limited and with a dead
 *  band: d ln(nsubMax)/dt = ln(target / mean) per second, limited to ±1 /s
 *  (±1.5 /s in spin-up), no move within ±6% of target; the mean interval is
 *  windowed over τ = 0.8 s, long enough to hold several frames even at
 *  5 fps. It may only RAISE the cap when the cap is what limits the frame —
 *  otherwise a scene running at ×0.25 speed would ratchet it to the ceiling
 *  and the first touch of the speed slider would queue seconds of work.
 *  Spin-up has its own, longer target, so it runs near flat out; the rate
 *  limit makes the hand-over a ramp of a second or two rather than a cliff,
 *  and halves a cap made absurd by a resolution change in under a second. */
function governFrame(wallMs, warming, binding) {
  const dt = wallMs / 1000;
  gov.warming = warming;
  // Frames per unit time, exponentially windowed in TIME: the mean interval
  // is (decayed wall time) / (decayed frame count). Not an EMA of the
  // interval with a time-based weight — that weights each interval by its own
  // length and so over-counts the readback frames (16, 16, 150 ms reads as
  // 126 ms against a true mean of 61) and starves the sim.
  const k = Math.exp(-dt / 0.8);
  gov.W = gov.W * k + wallMs; gov.N = gov.N * k + 1;
  gov.ema = gov.W / gov.N;
  const target = governTarget(warming);
  const err = Math.log(target / gov.ema);
  if (Math.abs(err) < 0.06) return;
  if (err > 0 && !binding) return;
  // Symmetric. An asymmetric limit (fast down, slow up) looked kinder to
  // the interface, but on a noisy interval it is a rectifier: every spike
  // above target cut harder than the dips below it restored, and the cap
  // settled well under the target (hammer spin-up, shared GPU: n 30–45 at
  // T ≈ 130 ms against a 220 ms target).
  const lim = warming ? 1.5 : 1;
  const rate = Math.max(-lim, Math.min(lim, err));
  state.nsubMax = Math.max(2, Math.min(4000, state.nsubMax * Math.exp(rate * dt)));
}

/** The interval the governor steers to. The configured frame time when the
 *  machine can meet it with the sim taking a real share of the frame — and
 *  otherwise long enough that it does: at least half the frame (¾ in
 *  spin-up) goes to substeps, up to CONFIG.frameCeilMs (400 ms in spin-up).
 *  Without that floor a machine whose render alone takes 30 ms (an integrated GPU on a 4K panel; measured here: Iris Xe at
 *  1440×900 shared with other headless Chromes paused at 27 fps) would cut
 *  the sim to two substeps a frame chasing a frame rate that substeps were
 *  not costing — ×0.01 RT for no visible gain in smoothness. */
function governTarget(warming) {
  // A scripted APP.frames(n) loop is not being watched: there is no frame
  // rate to keep, and the caller sized n for frames of the plain running
  // cost. Giving it the spin-up target made ui-smoke's APP.frames(600) on m2
  // (still warming) take minutes — 600 frames of 200–400 ms. It gets the
  // running target without the share rule.
  if (!gov.raf) return CONFIG.frameTargetMs;
  const base = warming ? CONFIG.warmFrameTargetMs : CONFIG.frameTargetMs;
  const share = warming ? 0.75 : 0.5;
  return Math.max(base, Math.min(warming ? 400 : CONFIG.frameCeilMs, gov.T0 / (1 - share)));
}

/** Learns the frame's cost model T = T0 + c·n from each status window (mean
 *  substeps per frame against mean interval): least squares with a ~15 s
 *  memory (×0.97 a window). T0 is the cost of a frame that runs no substeps
 *  — render, overlay, instruments — and c the cost of one substep, readback
 *  stalls and all. The slope is refitted only when the windows in memory
 *  span a spread of n (it is otherwise undetermined); T0 follows the
 *  windows' mean through the held slope, so a heavier overlay or a resized
 *  window is picked up as the memory turns over. Paused windows (n = 0)
 *  measure T0 directly. */
function governLearn() {
  const w = gov.win, F = gov.fit;
  if (w.N >= 3) {
    const n = w.S / w.N, T = w.W / w.N;
    const k = 0.97;
    F.w = F.w * k + 1; F.n = F.n * k + n; F.T = F.T * k + T;
    F.nn = F.nn * k + n * n; F.nT = F.nT * k + n * T;
    const mn = F.n / F.w, mT = F.T / F.w;
    const vn = F.nn / F.w - mn * mn, cv = F.nT / F.w - mn * mT;
    if (vn > Math.max(1, 0.01 * mn * mn) && cv > 0) gov.c = cv / vn;
    // No slope learned yet: assume the frame is all substeps (T0 = 0), which
    // is the plain frame-rate target and moves n enough to learn one. The
    // intercept comes from the fit's own means, not from this window: taken
    // per window it followed T up whenever the slope was underestimated, the
    // target followed T0, and the frame rate walked away.
    // A fit needs n to MOVE, and a governor pinned at its floor never moves
    // it: measured on hammer straight after spin-up, the backlog draining
    // made T rise as n fell, no slope was accepted, T0 stayed 0, the 30 ms
    // target was out of reach and n sat at 2 for good (×0.03 RT). Pinned at
    // the floor with the frame still too slow, the frame IS its overhead, so
    // that is taken as a lower bound on T0 — which raises the target, lets n
    // climb, and gives the fit its spread back. It fades over ~15 s.
    // Not in spin-up: the first frames of a scene (shader compiles, the
    // initial fill) are pinned and slow for reasons that pass, and latching
    // one of those read a 650 ms "overhead" off hammer's boot.
    const pinned = !gov.warming && state.nsubMax <= 4 && T > CONFIG.frameTargetMs;
    gov.T0floor = pinned ? Math.max(gov.T0floor, T) : gov.T0floor * k;
    const T0fit = gov.c > 0 ? Math.max(0, Math.min(mT, mT - gov.c * mn)) : 0;
    gov.T0 = Math.max(T0fit, gov.T0floor);
  }
  w.W = w.N = w.S = 0;
}

