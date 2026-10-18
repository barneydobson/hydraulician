"use strict";
/**
 * instruments.js — the instruments: gauges, rakes, flux sections, the control
 *    volume, force, orbit tracers, the streamline and inlet readbacks, and
 *    clearInstruments.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: sampleGauges, WHOLE_MAX, gaugeSeries, clearGaugeHistory, measuringAvg,
 *          sampleRakes, removeFluxAt, placeFlux, sampleFlux, placeCV, sampleCV,
 *          sampleForce, forceScale, FLUX_KEYS, CV_EDGES, emaFlux, refreshGrade,
 *          collectStream, requestStream, sampleInlet, bestTracerX, seedTracers,
 *          advanceTracers, placeGauge, freeGaugeColour, addGauge, removeGauge,
 *          clearAllGauges, clearInstruments, placeRake, CV_NEXT
 *
 * Reads:   CONFIG, gaugeFieldOf, GEOM, GINSP, grabPx, nearSegment, pxApart, sim, SIM,
 *          state, STREAM, syncPanel, view
 */
/**
 * instruments.js — the instruments: gauges, rakes, flux sections, the control volume,
 *   force, orbit tracers, the streamline and inlet readbacks, and
 *   clearInstruments.
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: sampleGauges, WHOLE_MAX, gaugeSeries, clearGaugeHistory, measuringAvg,
 *          sampleRakes, removeFluxAt, placeFlux, sampleFlux, placeCV, sampleCV,
 *          sampleForce, forceScale, FLUX_KEYS, CV_EDGES, emaFlux, refreshGrade,
 *          collectStream, requestStream, sampleInlet, bestTracerX, seedTracers,
 *          advanceTracers, placeGauge, freeGaugeColour, addGauge, removeGauge,
 *          clearAllGauges, clearInstruments, placeRake, CV_NEXT
 *
 * Reads:   CONFIG, gaugeFieldOf, GEOM, GINSP, grabPx, nearSegment, pxApart, SIM, sim,
 *          state, STREAM, syncPanel, view
 */
/** One sample per gauge per rendered frame — but ONLY when the clock has moved.
 *
 *  The render loop keeps running while the sim is paused, and it used to keep
 *  sampling: every sample carried the same `sim.t` and the same values, so a
 *  900-deep ring of them wiped a paused trace clean in about eight seconds
 *  (the "read the trace promptly" rule in every worksheet). Gating on the
 *  clock freezes the history instead, and because `sim.t` does not advance
 *  while paused there is no gap to bridge on resume — the series simply
 *  continues from the sample before the pause.
 *
 *  Two stores, deliberately: `hist` is the recent window the corner card
 *  plots (unchanged length, unchanged look) and `log` is the deep history the
 *  inspector and the CSV read. Both hold the SAME sample objects. */
function sampleGauges(A) {
  if (!state.gauges.length) return;
  if (state.paused) return;
  // The clock has restarted (R, or a resolution rebuild — both zero `sim.t`).
  // The old trace cannot be continued and must not be interleaved with the
  // new one, so it goes; this catches `SIM.resetWater()` called directly by a
  // rig script as well as the R key.
  if (sim.t < state.gaugeT) clearGaugeHistory();
  if (!(sim.t > state.gaugeT)) return;
  state.gaugeT = sim.t;
  const av = measuringAvg();
  // One batched read for all the gauges: each readPixels is a synchronous GPU
  // round trip of a few ms whatever its size, and one per gauge per texture
  // was most of the frame with three gauges up (SIM.probeMany). No sample
  // uses the fill f, so its texture is not read: one read per grid row.
  const prs = SIM.probeMany(state.gauges.map((gg) => [gg.x, gg.z]), av, true);
  state.gauges.forEach((gg, gk) => {
    const pr = prs[gk];
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(gg.x / sim.dx)));
    // Piezometric head h = z + p/ρg. For a scene whose bed is real geometry
    // z is just the gauge's own z, but a tilted-gravity scene (m2) draws a FLAT
    // bed and carries S₀ in gravity instead, so the elevation is z − S₀x. Without
    // that term m2's gauges read a flat grade line along a reach that loses
    // S₀·L = 0.20 m over 13.6 m, against a working depth of 0.35 m.
    const z = gg.z - (sim.scene.tiltS0 || 0) * gg.x;
    // η = z_b + d is the surface itself, so unlike h it carries no
    // non-hydrostatic bias under an accelerating column.
    // H = h + |u|²/2g is the total (energy) head: the EGL, which the HGL h
    // sits a velocity head below. Two gauges in the SAME moving reach differ
    // by the friction loss between them; a still column (reservoir, shaft) has
    // |u| ≈ 0, so there H = h = η.
    const g = Math.abs(sim.p.g) || 9.81;
    // EVERY quantity in GAUGE_QTY, on every sample, whatever the gauge is
    // plotting: the probe returns all of them from the one batched read, so
    // switching a gauge's quantity later shows its whole history, and the
    // CSV always has the lot. The solver's p is kinematic (p/ρ, m²/s²);
    // ×ρ = 1000 kg/m³ stores it in Pa — the unit the CSV writes.
    const s = { t: sim.t, h: z + pr.phead, H: z + pr.phead + pr.speed * pr.speed / (2 * g),
                d: A.d[i], eta: A.bed[i] + A.d[i], speed: pr.speed,
                u: pr.u, w: pr.w, p: 1000 * pr.p, phead: pr.phead };
    gg.hist.push(s);
    if (gg.hist.length > CONFIG.histMax) gg.hist.splice(0, gg.hist.length - CONFIG.histMax);
    // The WHOLE run, thinned: what the corner card plots under Gauge charts
    // = whole run (viewParams gaugeSpan: "all"). Every sample until it holds
    // WHOLE_MAX, then every other one is dropped and the spacing doubles, so
    // t = 0 stays on the chart however long the run goes, in bounded memory.
    // The log above stays the full-resolution record (inspector, CSV).
    if (!gg.whole) { gg.whole = []; gg.wdt = 0; }
    const Wh = gg.whole;
    if (!Wh.length || s.t - Wh[Wh.length - 1].t >= gg.wdt) {
      Wh.push(s);
      if (Wh.length > WHOLE_MAX) {
        gg.whole = Wh.filter((_, n) => n % 2 === 0);
        gg.wdt = 2 * (s.t - gg.whole[0].t) / gg.whole.length;
      }
    }
    if (!gg.log) gg.log = [];
    gg.log.push(s);
    if (gg.log.length > CONFIG.logMax) gg.log.splice(0, gg.log.length - CONFIG.logMax);
    gg.last = pr;
  });
}
/** Samples a gauge's whole-run series holds before it is thinned by half. */
const WHOLE_MAX = 1200;
/** What a corner card plots: the scrolling window, or the whole run with the
 *  newest sample on its end (the thinned series may lag it by one spacing). */
function gaugeSeries(gg) {
  if (state.gaugeSpan !== "all" || !gg.whole || !gg.whole.length) return gg.hist;
  const last = gg.hist[gg.hist.length - 1];
  return last && last !== gg.whole[gg.whole.length - 1] ? gg.whole.concat([last]) : gg.whole;
}

/** R (reset water) restarts the clock, so the traces cannot be continued —
 *  both stores are emptied and the inspectors go blank. Loading a scene drops
 *  the gauges entirely. Said out loud in the inspector's caption. */
function clearGaugeHistory() {
  state.gauges.forEach((g) => {
    g.hist.length = 0; if (g.log) g.log.length = 0;
    g.whole = null; g.wdt = 0;
  });
  state.gaugeT = -1;
}
/** True while measurements should come from the averaging window: Average is
 *  up AND a window is open. Every instrument asks this one question, so what
 *  "one window, one picture" means for the numbers is decided in one place. */
function measuringAvg() { return state.avg && SIM.avgActive(); }

function sampleRakes() {
  const av = measuringAvg();
  // The fill column only for a rake that drawRake found inside a conduit
  // (`needF`): an open-channel rake spans bed → surface off the column
  // analysis and costs no extra readback.
  state.rakes.forEach((rk) => {
    const r = SIM.rake(rk.x, rk.buf, av, rk.needF ? (rk.f || true) : null);
    rk.buf = r.buf; rk.i = r.i; rk.f = r.f;
  });
}

/** Place (or move) the force control volume. Corners are normalised and the
 *  running force estimate starts afresh — a moved box is a new measurement,
 *  and blending it with the old one would print a number no box ever read. */
/** Take away the section under the pointer, if there is one. Named rather
 *  than inlined because a click and a drag are different gestures on this
 *  tool: removal happens on the way DOWN, placement on the way up. */
function removeFluxAt(x, z) {
  const hit = state.flux.findIndex((L) => nearSegment(L, x, z) < grabPx());
  if (hit < 0) return false;
  state.flux.splice(hit, 1);
  syncPanel();
  return true;
}

/** Put a section down. Four is the ceiling for the same reason gauges stop at
 *  four: past that nobody can tell them apart, and the questions these answer
 *  need two. The oldest gives way, so the pair you are looking at is the pair
 *  you drew last. */
function placeFlux(x0, z0, x1, z1) {
  if (state.flux.length >= 4) state.flux.shift();
  state.flux.push({ x0, z0, x1, z1, ema: null, t0: sim.t });
  syncPanel();
}

/** Every section, smoothed the same way the control volume is. A raw section
 *  integral on a wobbling free surface is not a reading — it carries every
 *  wave that crosses it — which is the whole reason the box grew an EMA. */
function sampleFlux() {
  if (!state.flux.length || state.paused) return;
  const av = measuringAvg();
  state.flux.forEach((L) => {
    if (sim.t < L.t0) { L.ema = null; L.t0 = sim.t; }
    const r = SIM.lineFlux(L.x0, L.z0, L.x1, L.z1, av);
    // Under an open window the integral is over the WINDOW MEAN, which is its
    // own aggregate — smoothing it again would put a second filter on it.
    if (av) { L.ema = r; L.t0 = sim.t; return; }
    const a = 1 - Math.exp(-Math.min(Math.max(sim.t - L.t0, 0), 0.25) / 1.0);
    L.t0 = sim.t;
    if (!L.ema) { L.ema = r; return; }
    FLUX_KEYS.forEach((k) => { L.ema[k] += (r[k] - L.ema[k]) * a; });
    L.ema.nx = r.nx; L.ema.nz = r.nz; L.ema.len = r.len;
  });
}

function placeCV(x0, z0, x1, z1) {
  state.cv = {
    x0: Math.min(x0, x1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), z1: Math.max(z0, z1),
    ema: null, flux: null, hist: [], t0: sim.t,
  };
}

/** One force integral per rendered frame, like the gauges: gated on the sim
 *  clock actually moving, history dropped when the clock restarts. The EMA is
 *  a τ = 1 s first-order filter in SIM time, so a headless pump at hundreds
 *  of substeps a frame converges exactly as the live view does; `hist` keeps
 *  the raw integrals of the last ~8 s for the card's ± flutter readout. */
function sampleCV() {
  const cv = state.cv;
  if (!cv || state.paused) return;
  if (sim.t < cv.t0) { cv.ema = null; cv.hist.length = 0; cv.t0 = sim.t; }
  if (!(sim.t > cv.t0) && cv.ema) return;
  const av = measuringAvg();
  const r = SIM.boxForce(cv.x0, cv.z0, cv.x1, cv.z1, av);
  // The whole budget, from the same faces. One extra pair of readPixels per
  // frame, which is the same cost the force alone already pays — and every
  // number in it is smoothed by the SAME EMA, because a raw face integral on
  // a wobbling free surface is a reading nobody can take.
  const b = SIM.boxFlux(cv.x0, cv.z0, cv.x1, cv.z1, av);
  if (av) {
    // The window mean is the instrument's aggregate: no second filter. The
    // flutter history still fills, and its shrinking band is the visible
    // statement that the mean is converging.
    cv.ema = { fx: r.fx, fz: r.fz };
    cv.flux = b;
    cv.t0 = sim.t;
  } else {
    const a = 1 - Math.exp(-Math.min(sim.t - cv.t0, 0.25) / 1.0);
    cv.t0 = sim.t;
    cv.ema = cv.ema ? { fx: cv.ema.fx + (r.fx - cv.ema.fx) * a,
                        fz: cv.ema.fz + (r.fz - cv.ema.fz) * a }
                    : { fx: r.fx, fz: r.fz };
    cv.flux = emaFlux(cv.flux, b, a);
  }
  cv.hist.push({ t: sim.t, fx: r.fx, vol: r.vol });   // vol: the storage term dV/dt
  while (cv.hist.length > 2 && sim.t - cv.hist[0].t > 8) cv.hist.shift();
  cv.last = r;
}

/** The pressure diagram on the selected face — same idiom as sampleCV, but
 *  the EMA runs per SAMPLE rather than on the two scalars: it is `p` AND `f`
 *  at each station that get the τ = 1 s filter, same `a`, same restart
 *  conditions for both. `f` has to be smoothed alongside `p` — not left
 *  raw — because `GEOM.faceForceFromSamples` gates every term AND `wetLen`
 *  on `min(f,1)` and `f·p`; an EMA'd `p` sitting on a raw, wobbling `f`
 *  would still make the integral jump at the waterline, which is the exact
 *  transition this filter exists to smooth. Fx/Fz/F/cop/wetLen are then
 *  re-integrated (GEOM.faceForceFromSamples) from the smoothed row, so the
 *  resultant arrow is always consistent with the diagram it is drawn from
 *  by construction — one filter, not `p` and `f` each smoothed and then a
 *  third, separate filter on Fx/Fz that could drift from either.
 *
 *  A geometry change changes the sample count (a resolution rebuild
 *  resamples every face at the new dx; a parameterised solid can change
 *  shape under a scene control) — that is the restart signal, the same way
 *  the clock going backwards is. */
function sampleForce() {
  const f = state.force;
  if (!f || state.paused) return;
  if (sim.t < f.t0) { f.data = null; f.t0 = sim.t; }
  if (!(sim.t > f.t0) && f.data) return;
  const av = measuringAvg();
  const r = SIM.faceForce(f.solidId, f.faceId, av);
  if (!r) { f.data = null; f.t0 = sim.t; return; }
  if (av || !f.data || f.data.samples.length !== r.samples.length) {
    // The window mean IS the instrument's aggregate (no second filter), a
    // fresh face has nothing to blend against, and a sample-count change is
    // a different station layout — averaging across it would be nonsense.
    f.data = r;
    f.t0 = sim.t;
    return;
  }
  const a = 1 - Math.exp(-Math.min(sim.t - f.t0, 0.25) / 1.0);
  f.t0 = sim.t;
  const prev = f.data.samples;
  const samples = r.samples.map((s, i) =>
    Object.assign({}, s, { p: prev[i].p + (s.p - prev[i].p) * a,
                            f: prev[i].f + (s.f - prev[i].f) * a }));
  const ds = samples.length > 1 ? samples[1].s - samples[0].s : sim.dx;
  const g = Math.abs(sim.p.g) || 9.81;
  f.data = Object.assign(GEOM.faceForceFromSamples(samples, ds, 1000, g),
                          { samples, solidId: r.solidId, faceId: r.faceId, len: r.len });
}

/** The pressure diagram's scale for THIS scene: {headMax}, the largest head
 *  (metres) standing on any named face of any solid, read once at the first
 *  pick and shared by every selection after it. One scale for the scene is
 *  what makes the diagram comparable between faces — the upstream face, the
 *  downstream face and the culvert roof of HS-1's dyke are drawn with the same
 *  pixels per metre, so a bigger triangle IS a bigger force — and what stops
 *  it resizing as you click from one face to the next. `drawForce` only
 *  ratchets `headMax` up if a later reading exceeds it, so the diagram can
 *  never run off the canvas; it never comes back down. A few dozen
 *  faceForce readbacks, once per scene, never on the frame path. */
function forceScale() {
  if (state.forceScale) return state.forceScale;
  const g = Math.abs(sim.p.g) || 9.81;
  let headMax = 0;
  (sim.solids || []).forEach((so) => (so.faces || []).forEach((fc) => {
    const r = SIM.faceForce(so.id, fc.id, false);
    if (!r) return;
    for (const s of r.samples) {
      const h = Math.max(0, Math.min(s.f, 1) * s.p) / g;
      if (h > headMax) headMax = h;
    }
  }));
  state.forceScale = { headMax };
  return state.forceScale;
}

/** Smooth every scalar of a control-volume budget, edge by edge. Written as a
 *  walk over the keys rather than by hand so that adding a quantity to
 *  `boxFlux` cannot leave it unsmoothed and jittering while its neighbours
 *  sit still. */
const FLUX_KEYS = ["Q", "mdot", "Mx", "Mz", "Fpx", "Fpz", "E", "wet"];
const CV_EDGES = ["left", "right", "bed", "top"];
function emaFlux(prev, now, a) {
  if (!prev) return JSON.parse(JSON.stringify({ edges: now.edges, total: now.total, inQ: now.inQ }));
  const out = { edges: {}, total: {}, inQ: prev.inQ + (now.inQ - prev.inQ) * a };
  CV_EDGES.forEach((e) => {
    out.edges[e] = {};
    FLUX_KEYS.forEach((k) => {
      out.edges[e][k] = prev.edges[e][k] + (now.edges[e][k] - prev.edges[e][k]) * a;
    });
  });
  FLUX_KEYS.forEach((k) => { out.total[k] = prev.total[k] + (now.total[k] - prev.total[k]) * a; });
  return out;
}

/** The piezometric head per column, and with it the TRUE velocity head that
 *  the energy line is drawn at (`hv` on the returned array — RECON.columnEnergy
 *  through SIM.hydraulicGrade).
 *
 *  One buffer, one throttle, two consumers: the grade lines draw `h` and
 *  `h + hv` directly, and OVERLAY.analyse takes `hv` for its own energy line
 *  and for everything measured off that line's slope. They MUST be the same
 *  numbers — two estimates of the same head that disagree is how you get an
 *  overlay arguing with itself.
 *
 *  Throttled because every refresh is a pipeline sync. Live it is an nx×1
 *  readback off a column pass (SIM.hydraulicGrade) — MEASURED on m2 at Medium
 *  (1265 × 75), 1.5 ms median against the 4.6 ms of the two full-field
 *  readPixels it replaced, which every channel scene was paying with nothing
 *  on screen asking. Under Average it is still a full-field readback (alpha
 *  needs every cell of every column) — the 6.6 ms against a 12.6 ms frame this
 *  throttle was first sized for — so it never goes on the frame path
 *  undivided. Every 3rd frame while the grade lines are up (the rate that
 *  switch already shipped with); every 10th otherwise, because alpha is a
 *  smooth, slowly-varying field and a third of a second of lag in it is
 *  invisible in a steady reach — where it is NOT steady the velocity head is
 *  being smoothed over 1.5 m of reach anyway.
 *
 *  The window flag is part of the key, not just the throttle: a buffer built
 *  from the live field is the wrong flow state to hand an Average-mode
 *  overlay, so switching modes refreshes at once rather than showing one of
 *  each for three frames. */
function refreshGrade() {
  const avg = measuringAvg();
  // Nobody is asking: the grade lines are off and there is no mean for the
  // energy line's alpha to come from. Costs nothing and, more to the point,
  // a stale buffer never reaches analyse — `hv` goes with the window it was
  // measured in or it does not go at all.
  // A channel scene always wants it: the energy line the overlay measures S_f,
  // n and d_n off is built on the HGL (see OVERLAY.analyse), not on the VOF
  // surface, which in a steady reach sits in whole-cell terraces.
  const chan = state.channel && sim.p.g > 0.5;
  if (!state.grade && !avg && !chan) { state.gradeBuf = null; state.gradeTick = 0; return; }
  if (avg !== state.gradeAvg) { state.gradeAvg = avg; state.gradeTick = 0; }
  if (--state.gradeTick > 0 && state.gradeBuf) return;
  state.gradeTick = state.grade ? 3 : 10;
  state.gradeBuf = SIM.hydraulicGrade(state.gradeBuf, avg);
}

/** Streamlines, in two halves around the frame's GPU work.
 *
 *  `collectStream` runs at the TOP of the frame, before this frame's substeps
 *  are queued: it polls the async readback (SIM.streamPoll), and when one has
 *  landed rebuilds psi and its contours (STREAM.psi / STREAM.contours) — one
 *  pass over the grid for each, skipping every cell no level crosses.
 *  Polling before the substeps matters: the copy-out is a round trip to the
 *  GPU process, which is cheap while its queue is empty and waits behind
 *  every substep once it is not.
 *
 *  `requestStream` runs after the substeps and the averaging step, so the
 *  field it asks for is this frame's, and asks at most every 250 ms of wall
 *  clock (~4 Hz). Never a stall: SIM.streamRequest packs the fluxes on the
 *  GPU, reads them into a pixel-pack buffer behind a fence, and returns.
 *
 *  Off costs one boolean. Paused, nothing new is requested: the field is not
 *  changing. A result read in the other window mode (Live vs Average) is
 *  dropped, and the drawn buffer carries its mode, so a mean picture never
 *  carries live streamlines or the other way round. */
function collectStream() {
  if (!state.sline) { state.slineBuf = null; return; }
  const avg = measuringAvg();
  const R = SIM.streamPoll();
  if (!R || R.avg !== avg) return;
  const G = STREAM.psi(R, state.slineGrid);
  state.slineGrid = G;
  const rg = STREAM.range(G);
  if (!rg) { state.slineBuf = null; return; }
  const N = state.slineN, span = rg[1] - rg[0];
  let d = state.slineDpsi;
  if (state.slineBuf && state.slineBuf.avg !== avg) d = 0;
  if (!(d > 0) || span / d < 0.6 * N || span / d > 1.7 * N) d = STREAM.nice(span / N);
  state.slineDpsi = d;
  state.slineBuf = { seg: STREAM.contours(G, d), dpsi: d, avg, t: R.t };
}
function requestStream() {
  if (!state.sline) return;
  const avg = measuringAvg(), now = performance.now();
  const stale = !state.slineBuf || state.slineBuf.avg !== avg || sim.t !== state.slineT;
  if (stale && now - state.slineAt > 250 && !SIM.streamPending()) {
    SIM.streamRequest(avg);
    state.slineAt = now; state.slineT = sim.t;
  }
}

/** What the reservoir is actually DELIVERING.
 *
 *  Neither reservoir number on the panel is a measurement: `inflow.q` is a
 *  set-point the solver ignores entirely under head-driven inflow (nothing
 *  writes it back), and the level is a target the relaxation sponge gives up
 *  a decimetre or three of. Both are read back here from the column reduction
 *  just clear of the sponge — the first columns the boundary treatment is no
 *  longer nudging — so the panel can print them alongside the settings. */
function sampleInlet(A) {
  if (!(sim.p.inflow.on > 0.5)) { state.deliv = null; return; }
  const sp = state.scene.spongeIn ? Math.round(state.scene.spongeIn / sim.dx) : 10;
  const i0 = Math.max(2, Math.min(sim.nx - 12, sp + 2)), i1 = Math.min(sim.nx - 2, i0 + 9);
  let q = 0, s = 0, n = 0;
  for (let i = i0; i <= i1; i++) {
    if (!(A.onBed[i] && A.d[i] > 3 * sim.dx)) continue;
    q += A.q[i]; s += A.bed[i] + A.d[i]; n++;
  }
  if (!n) { state.deliv = null; return; }
  q /= n; s /= n;
  const d = state.deliv || (state.deliv = { q, level: s });
  d.q += 0.05 * (q - d.q);              // A.q/A.d already carry a 10 %/frame
  d.level += 0.05 * (s - d.level);      // EMA; this is the display's own settle
}

// ------------------------------------------------------------- orbit tracers
/** A column of massless tracers that remember where they have been.
 *
 *  A single dot going round a 30 mm circle is invisible; the PATH is the whole
 *  point, which is why the GPU particle cloud never showed orbital motion no
 *  matter how long you stared at it. These are deliberately few (one vertical
 *  rake), advected on the CPU from a single strip readback — probing them one
 *  at a time would be a pipeline stall each — and drawn as fading polylines.
 *
 *  Seeded from just under the trough down to just above the bed, so the
 *  shrinking of the orbits with depth is read straight off the picture. */
/** Deepest wet column — a sane default place to hang a tracer rake, since
 *  a fixed fraction of the domain lands on dry ground in half the scenes. */
function bestTracerX() {
  const col = SIM.columns(true);
  let bi = -1, bd = 0;
  for (let i = 2; i < sim.nx - 2; i++) {
    if (col[i * 4 + 1] > bd) { bd = col[i * 4 + 1]; bi = i; }
  }
  return bi < 0 ? sim.W * 0.5 : (bi + 0.5) * sim.dx;
}

function seedTracers(x) {
  const col = SIM.columns(true);
  const i = Math.max(0, Math.min(sim.nx - 1, Math.round(x / sim.dx)));
  const bed = col[i * 4], surf = bed + col[i * 4 + 1];
  // Too little water to hang a column in — treat the click as "clear".
  if (surf - bed < 6 * sim.dx) { state.tracers = null; return; }
  // Span the FULL depth, bed to surface. The insets are a cell and a half,
  // not a fraction of the depth: at the bed the no-slip wall makes the very
  // first cell useless, and a tracer seeded right at the still surface spends
  // half of every wave period in a dry cell, where the velocity is bled away.
  const n = state.tracerN, d = surf - bed;
  const lo = bed + Math.max(1.2 * sim.dx, 0.015 * d);
  const hi = surf - Math.max(1.5 * sim.dx, 0.03 * d);
  state.tracers = { x, buf: null, list: [],
    // Trail length in SECONDS, not points: about two and a half orbits, so
    // each loop is legible and the small failure of the loops to close —
    // Stokes drift — is visible rather than smeared into a long streak. Over
    // seven periods the near-bed undertow alone drew a 280 mm horizontal
    // smudge that hid a 17 mm orbit completely.
    trail: state.scene.trailSeconds || 2.5 * (sim.p.wave.period || 1.2) };
  for (let k = 0; k < n; k++) {
    const z = lo + (hi - lo) * (k / (n - 1));
    state.tracers.list.push({ x, z, x0: x, z0: z, path: [] });
  }
}

/** Advect the tracers by the sim time that just elapsed, RK2. */
function advanceTracers(dtSim) {
  const T = state.tracers;
  if (!T || !T.list.length || dtSim <= 0) return;
  let x0 = Infinity, x1 = -Infinity;
  T.list.forEach((t) => { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); });
  const pad = 6 * sim.dx;
  const P = SIM.patch(x0 - pad, x1 + pad, T.buf, measuringAvg());
  T.buf = P.buf;
  // Sub-step: an orbit is a rotation, and one big explicit step spirals out.
  const nsub = Math.max(1, Math.min(8, Math.ceil(dtSim / 0.02)));
  const h = dtSim / nsub;
  for (const t of T.list) {
    for (let s = 0; s < nsub; s++) {
      const a = SIM.patchVel(P, t.x, t.z);
      const b = SIM.patchVel(P, t.x + a[0] * h, t.z + a[1] * h);
      t.x += 0.5 * (a[0] + b[0]) * h;
      t.z += 0.5 * (a[1] + b[1]) * h;
    }
    t.x = Math.max(sim.dx, Math.min(sim.W - sim.dx, t.x));
    t.z = Math.max(sim.dx, Math.min(sim.H - sim.dx, t.z));
    // A tracer that has drifted right out of its rake is no longer showing
    // the orbit at the station it was seeded at, so put it back.
    if (Math.abs(t.x - t.x0) > 0.9) { t.x = t.x0; t.z = t.z0; t.path.length = 0; }
    t.path.push(t.x, t.z, sim.t);
    while (t.path.length > 6 && sim.t - t.path[2] > T.trail) t.path.splice(0, 3);
  }
}

/** Place a gauge — or take away the one you just pointed at.
 *
 *  Gauges and rakes were the only instruments with no way back: every click
 *  pushed another one, and the only way to lose one was to place four more.
 *  The tape, the Control volume and the orbit tracers all already clear on a click,
 *  so this is the convention the rest of the toolbox was using. */
function placeGauge(x, z) {
  const hit = state.gauges.findIndex((g) => pxApart(g.x, g.z, x, z) < grabPx());
  if (hit >= 0) { removeGauge(state.gauges[hit]); return; }
  addGauge(x, z);
}

/** First gauge colour no live gauge is using (the old length % 4 collided
 *  after a shift or a removal). */
function freeGaugeColour() {
  const used = state.gauges.map((g) => g.colour);
  return CONFIG.gaugeColours.find((c) => used.indexOf(c) < 0) || CONFIG.gaugeColours[0];
}

/** Always add a gauge (the oldest goes at the cap of four); `field` defaults
 *  to the session's. placeGauge is the click, which toggles. */
function addGauge(x, z, field) {
  if (state.gauges.length >= 4) state.gauges.shift();
  const g = { x, z, hist: [], log: [], id: ++state.gaugeSeq,
              field: field || gaugeFieldOf(null),     // starts on the session default
              colour: freeGaugeColour() };
  state.gauges.push(g);
  syncPanel();                      // the inspector row lists the live gauges
  return g;
}

/** Take one gauge away — the click on its mark, the × on its corner card and
 *  the Remove in its inspector all come here. Its history goes with it; the
 *  others' (and so their CSV columns) are untouched. */
function removeGauge(g) {
  const k = state.gauges.indexOf(g);
  if (k < 0) return;
  state.gauges.splice(k, 1);
  GINSP.closeFor(g);
  syncPanel();
}
/** Every gauge at once: the panel's ✕ Clear all, and the strip's Gauge button
 *  pressed while the Gauge tool is already in hand. */
function clearAllGauges() {
  GINSP.closeAll();
  state.gauges.length = 0;
  syncPanel();
}

/** Take every instrument off the water. `{ all: true }` is a scene change
 *  (`loadScene`): gauges, rakes, tracers, the measure tool, the control volume,
 *  flux sections, the force probe and the pin all belong to the scene that has
 *  just gone. `{ all: false }` is an exercise landing (`EX`): it clears only
 *  what a rig payload may have carried in — gauges, rakes, the control volume
 *  and the gauge clock — and leaves flux sections, force, measure and tracers
 *  alone, because the card's own settings (and the student's next click) own
 *  those, and a rig does not place them. Choosing where to measure is the
 *  student's job, so the picker clears whatever the payload brought. */
function clearInstruments({ all } = {}) {
  state.gauges.length = 0;
  state.rakes.length = 0;
  state.cv = null;
  state.gaugeT = -1;
  if (!all) return;
  state.tracers = null;
  state.measure = null; state.measDrag = null;
  state.cvDrag = null;
  state.flux.length = 0; state.fluxDrag = null;
  state.force = null;
  state.forceHover = null;
  state.forceScale = null;
  state.pin = null; state.pinProbe = null;
}

/** Place a rake — or take away the one at that station. A rake spans the
 *  water around the CLICKED point: from the first solid below it up to the
 *  first solid above it or the free surface, whichever comes first. In an
 *  open channel that is bed → surface, exactly as before; inside a pipe it is
 *  wall → wall (drawRake works the span out each frame). `z` is optional — a
 *  rake from a rig or a script without one spans the column's bed → surface.
 *  Removal compares the station only. */
function placeRake(x, z) {
  const hit = state.rakes.findIndex((r) => Math.abs(r.x - x) * view.w / sim.W < grabPx());
  if (hit >= 0) { state.rakes.splice(hit, 1); syncPanel(); return; }
  if (state.rakes.length >= 2) state.rakes.shift();
  state.rakes.push({ x, z: Number.isFinite(z) ? z : undefined, buf: null });
  syncPanel();
}

/** The order the Control volume's per-edge quantity cycles in: what crosses the
 *  face, then what force it carries, then what energy goes with it. */
const CV_NEXT = { Q: "M", M: "E", E: "Q" };

