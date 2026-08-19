/* ============================================================================
 * UN-2 · FLOW ESTABLISHMENT — scene notes and headless recipe
 * ----------------------------------------------------------------------------
 * The exercise runs on the `estab` SCENE (js/scenes.js), not a drawn rig:
 * held reservoir compartments need scene-level sponge widths (spongeIn 3.0
 * covers the whole tank), which a sandbox rig cannot set. The scene is a
 * reservoir -> bellmouth -> 23 m x 0.8 m bore -> valve (boots CLOSED) ->
 * exit orifice (0.4 m gap, k ~ 4) -> free jet over the open bottom edge.
 *
 *   http://localhost:8124/?scene=estab      (or ?ex=UN-2 for the card)
 *
 * WHY EACH PIECE IS THERE (each bought with a measured failure, 2026-08-19):
 *   - LOW head + modest u_max: the rise must span several wave transits for
 *     the rigid-column derivation to hold: t75/T = ln7·u_max·c/(8gH) ~ 5
 *     here. On the hammer scene it is ~0.5 and the trace is Allievi's
 *     staircase — that is why the old hammer-based UN-2 fitted 64% of
 *     theory and was retired.
 *   - Bellmouth chamfer at the mouth: sharp-edged, the entry grows a
 *     flapping vena over ~one flush time (mid-pipe u noise ~10%, reversed
 *     flow at the crown 2 m in); chamfered, plateau noise is 1–3%.
 *   - Free-jet exit, open bottom edge: a tailwater reservoir drifts under
 *     the sponge's weak drain side (+0.25 m in 20 s at 2 m²/s), and a
 *     passive apron ponds 2 m deep and drowns the exit. The jet leaving
 *     the domain does neither.
 *   - bulk 0.30 (scene default): a level change on the shut pipe excites
 *     the closed-pipe organ mode (period 4l/c ~ 3 s); at bulk 0.03 it rings
 *     for minutes, at 0.30 it is still in ~30 s. That is the exercise's
 *     settle.
 *
 * MEASURED (Medium 597x159, dx 0.0503, c 30, shipped scenes.js, one run per
 * digit, 30 s settle then 40 s trace at 0.05 s; H = flowing level - 2.4):
 *
 *   level 3.4..4.3 -> u_max 2.05..2.86 m/s, plateau sd 1.1-2.3%,
 *   k = 2gH/u_max² = 4.18-4.31, t75/ (ln7·l·u_max/2gH) = 0.94-1.08,
 *   pooled through-origin slope 1.971 vs ln7 = 1.946 (+1.3%), R² 0.998.
 *   c = 60 control at level 3.8: t75 4.15 s vs 4.07 s at c = 30 (~2%).
 *   Worst-case settle (level change 3.3 -> 4.3 on the shut pipe): ring
 *   decays to ±0.1 m/s by ~35 s; the shipped prefill (still(3.8)) halves
 *   the kick, hence settle 30 in the exercise entry.
 *   data/simulated-class.csv IS this sweep, one row per digit.
 *
 * HEADLESS RECIPE (exercises/_runner/runner.py, HOWTO.md):
 *   launch --scene estab; then per digit:
 *     APP.sim.p.inflow.level = 3.4 + 0.1*d; APP.sim.p.valveClosed = 1;
 *     APP.SIM.resetWater();            // prefill + sponge adjust
 *     pump --sim-seconds 30
 *     APP.sim.p.valveClosed = 0;       // t = 0
 *     ...sample APP.probe(14, 2.4).u every 0.05 sim-s for 40 s; u_max =
 *     mean of the last 10 s, t75 = first crossing of 0.75*u_max; read the
 *     flowing level off OVERLAY.analyse's surf at x ~ 1.5.
 * ==========================================================================*/
