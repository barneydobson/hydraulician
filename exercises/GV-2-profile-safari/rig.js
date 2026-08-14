/* ============================================================================
 * GV-2 · PROFILE SAFARI — rig.js
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then either drive CHAN.build()
 * yourself or call one of the RECIPES.* functions to rebuild any bagged
 * class exactly as this safari found it (lecturer rehearsal / spot-check).
 *
 *     RECIPES.mild123()        // gate + brink on a mild bed -> M1, M2, M3
 *     RECIPES.steepTail()      // reservoir + tailwater on a steep bed -> S1, S2 (+S3 bands)
 *     RECIPES.steepGate()      // small gate on a steep bed -> S1 (pool), S3
 *     RECIPES.flatGate()       // gate on a flat bed, truncated+open -> H2, H3
 *     RECIPES.adverseTail()    // gate + tailwater on a rising bed -> A2
 *     RECIPES.criticalKnife()  // gate + weir at S0=1:8.5 -> C1/C3 (FLICKERS, see README)
 *
 * All of these are addSeg-drawn geometry + panel-slider settings, exactly
 * what a student does by hand — nothing here is private. Every number was
 * reached by iterating from the shipped scenes' own tuned parameters
 * (m1/m2/m3/s1/s2/s3/c13 in js/scenes.js) and re-measuring on THIS domain
 * (sandbox is a fixed 9m x 5m rectangle, most shipped scenes are longer, so
 * every recipe below is the shipped physics compressed to fit).
 * ==========================================================================*/

window.CHAN = {
  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },
  TH: 0.45,   // bed thickness: sandbox brush max (hand-drawable)

  /* The sandbox ships two decorative grey ledges (splash catchers for the
   * default spout demo) — every rig below erases them first, same coordinates
   * WE-1/FB-1/FB-2/MO-1 all use. */
  clearLedges: function () {
    APP.SIM.clearSegs();
    APP.SIM.addSeg(0.60, 2.50, 7.20, 2.50, 1.20, 0);
    APP.SIM.addSeg(0.60, 3.20, 7.20, 3.20, 1.20, 0);
  },

  /** o = {S0, cf, cs, q, bed0, xEnd, gate:{x,a}, weir:{x,h,w}, tail, inletDepth, mode}
   *  A single-slope prismatic channel (mirrors js/scenes.js's channel()) built
   *  by hand-drawable addSeg strokes: bed, optional vertical gate, optional
   *  weir plate. xEnd < 9 truncates the bed short of the right edge (a real
   *  physical brink, open bottom to drain — the WE-1/MO-1/FB-2 pattern);
   *  xEnd = 9 runs the bed to the domain edge instead (needs `tail` for a
   *  real downstream control, or it ponds — CLAUDE.md's "not possible"
   *  warning). */
  build: function (o) {
    var R = CHAN, S0 = o.S0 || 0, TH = o.TH || R.TH;
    var xEnd = o.xEnd === undefined ? 9.0 : o.xEnd;
    var bedTop = function (x) { var t = Math.max(0, Math.min(x, xEnd)); return o.bed0 - S0 * t; };
    R.bedTop = bedTop; R.o = o;
    var brink = xEnd < 9.0 - 1e-6;
    var off = (TH / 2) * Math.sqrt(1 + S0 * S0);
    var x0 = -1.0, e = brink ? 0 : 1.0;
    var xSegEnd = xEnd + e;

    R.clearLedges();
    APP.SIM.addSeg(x0, bedTop(x0) - off, xSegEnd, bedTop(xSegEnd) - off, TH, 255);
    if (o.gate) APP.SIM.addSeg(o.gate.x, bedTop(o.gate.x) + o.gate.a, o.gate.x, 5.0, 0.05, 255);
    if (o.weir) {
      var b = bedTop(o.weir.x);
      APP.SIM.addSeg(o.weir.x, b - 0.10, o.weir.x, b + o.weir.h, o.weir.w || 0.06, 255);
    }

    R.C("spoutOn").set(false);
    R.C("openL").set("1");
    R.C("openR").set("1");
    R.C("openB").set(brink ? "1" : "0");
    R.C("openT").set("0");
    R.C("waveOn").set(false);
    R.C("inflowOn").set(true);
    R.C("inFree").set(false);
    R.C("inQ").set(o.q);
    R.C("inLevel").set(o.bed0 + (o.inletDepth === undefined ? 0.3 : o.inletDepth));
    var outBed = bedTop(xEnd);
    if (o.tail !== undefined) { R.C("twOn").set(true); R.C("twLevel").set(outBed + o.tail); }
    else R.C("twOn").set(false);
    R.C("cf").set(o.cf);
    if (o.cs !== undefined) R.C("cs").set(o.cs);
    R.C("channel").set(true);          // MUST be on: sandbox.chan is unset, so
    R.C("labels").set(true);           // the profile-label overlay defaults off
    R.C("jumps").set(true);            // (main.js: state.channel = !!sc.chan)
    R.C("mode").set(String(o.mode === undefined ? 3 : o.mode));
    syncPanel();
    return R.check();
  },

  check: function () {
    var S = APP.sim;
    return { grid: S.nx + "x" + S.ny, dx: +S.dx.toFixed(5), dt: +APP.SIM.dt().toExponential(3),
             q: S.p.inflow.q, inLevel: S.p.inflow.level,
             twOn: !!S.p.tailwater.on, twLevel: S.p.tailwater.level,
             open: S.p.open.join(","), cf: S.p.cf };
  },

  settle: function (secs) {
    APP.tick(Math.ceil(secs / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** Warm the analyse EMA then take `sampleN` reads, ~1s of SIM TIME apart
   *  (APP.frames(60) per sample) — this is the same ~10s persistence window
   *  the score card's stability rule asks a player to honour. Returns which
   *  classes were present in EVERY sample ("stableClasses"). */
  read: function (warmFrames, sampleN) {
    APP.state.paused = false;
    APP.frames(warmFrames || 60);
    var A;
    for (var i = 0; i < 15; i++) A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    var samples = [];
    for (var k = 0; k < (sampleN || 10); k++) {
      APP.frames(60);   // ~1 sim-second between samples
      A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
      samples.push(OVERLAY.profileRuns(A, APP.sim).map(function (r) {
        return { cls: r.cls, x0: +(r.a * APP.sim.dx).toFixed(2), x1: +(r.b * APP.sim.dx).toFixed(2) };
      }));
    }
    APP.state.paused = true; APP.frames(2);
    var counts = {};
    samples.forEach(function (s) { var seen = {}; s.forEach(function (r) { seen[r.cls] = 1; });
      Object.keys(seen).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var stable = Object.keys(counts).filter(function (c) { return counts[c] === samples.length; });
    var J = OVERLAY.findJumps(A, APP.sim);
    return { t: +APP.sim.t.toFixed(2), lastRuns: samples[samples.length - 1],
             stableClasses: stable, counts: counts, nSamples: samples.length,
             jumps: J.map(function (j) { return { x0: +j.x0.toFixed(2), Fr1: +j.Fr1.toFixed(2) }; }) };
  },

  probe: function (x) {
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    var i = Math.round(x / APP.sim.dx);
    return { x: x, i: i, ok: !!A.ok[i], h: +A.h[i].toFixed(4), S0: +A.S0[i].toFixed(5),
             yn: +A.yn[i].toFixed(4), yc: +A.yc[i].toFixed(4), Fr: +A.Fr[i].toFixed(3),
             cls: A.ok[i] ? OVERLAY.classify(A.h[i], A.yn[i], A.yc[i], A.S0[i]) : "" };
  },
};

/* ---------------------------------------------------------------------------
 * RECIPES — one function per bagged rig. Each does loadScene -> build ->
 * settle -> a stability read, and returns what it found. Numbers are exactly
 * what this safari measured (see README §5 verification record). */
window.RECIPES = {

  /** Gate + brink on a gentle mild bed -> M1 (pool), M3 (short jet), M2
   *  (drawdown to the brink). ~32s settle. All three stable 10/10 samples. */
  mild123: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: 0.02, bed0: 0.5, xEnd: 8.0, gate: { x: 1.0, a: 0.06 },
                 q: 0.25, inletDepth: 1.3, cf: 0.125, cs: 0.08, mode: 3 });
    CHAN.settle(32);
    return CHAN.read(30, 10);
  },

  /** TRIED AND DROPPED: a plain weir (no gate) near the end of this same
   *  mild bed, meant as a "pure backwater" M1 in the spirit of the shipped
   *  m1 scene. Two heights tested (0.35 m and 0.55 m above the bed) both
   *  read M2 the whole reach (8-10/10 samples), M1 only flickering 2-4/10 —
   *  on this short a reach the measured y_n already sits close to what the
   *  weir pool delivers, so the +5% M1 margin isn't reliably cleared. Not
   *  shipped as a recipe; mild123's gate-pool M1 below is the verified one.
   *  Left here as a documented dead end, not deleted from history — see
   *  README §5 "not fully explored" notes. */

  /** Reservoir straight onto a steep bed, real tailwater far downstream ->
   *  a jump forms; below it S1 (backed up), above it S2/S3 roll-wave bands
   *  (both letters appear as standing bands, not a single monotone S2 —
   *  see README "chip traps"). Needs a LONG settle (~110s) from a dry start —
   *  the shipped s1/s2 start pre-filled near equilibrium, the sandbox can't. */
  steepTail: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: 0.25, bed0: 1.90, xEnd: 7.0, q: 1.2, inletDepth: 0.52,
                 tail: 0.90, cf: 0.010, cs: 0.08, mode: 3 });
    CHAN.settle(110);
    return CHAN.read(60, 10);
  },

  /** Small gate on a steep bed, NO tailwater -> S1 (still pool behind the
   *  gate), S3 (the whole apron, asymptoting toward y_n, no jump anywhere).
   *  Clean and fast (~35s) — this is the better S3 demo than the roll-wave
   *  bands above. a = 0.35 (the shipped s3 value) DROWNS from a dry start;
   *  0.15 is the safe sandbox opening. */
  steepGate: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: 0.25, bed0: 1.40, xEnd: 5.6, gate: { x: 1.2, a: 0.15 },
                 q: 1.2, inletDepth: 1.40, cf: 0.010, cs: 0.08, mode: 3 });
    CHAN.settle(35);
    return CHAN.read(30, 10);
  },

  /** Gate on a FLAT bed, truncated + open bottom (MO-1's own RIG-B pattern)
   *  -> H2 (the calm pool behind the gate), H3 (the thin supercritical sheet
   *  on the apron). First-try success, ~22s settle. */
  flatGate: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: 0, bed0: 0.50, xEnd: 3.6, gate: { x: 2.0, a: 0.1304 },
                 q: 0.33, inletDepth: 0.9181, cf: 0.010, cs: 0.08, mode: 3 });
    CHAN.settle(20);
    return CHAN.read(30, 10);
  },

  /** Gate + real tailwater on a RISING (adverse) bed -> A2 the whole reach
   *  (the rare-spawn class). First-try success at these numbers, ~25s. See
   *  README for why the matching A3 (a free jet before the jump) could NOT
   *  be produced from a vertical gate on this bed — the gate drowns the
   *  instant it opens, at every opening/head/q tried. */
  adverseTail: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: -0.03, bed0: 1.0, xEnd: 9.0, gate: { x: 1.0, a: 0.09 },
                 q: 0.22, inletDepth: 0.88, tail: 0.26, cf: 0.008, cs: 0.06, mode: 3 });
    CHAN.settle(30);
    return CHAN.read(30, 10);
  },

  /** Gate + weir at S0 = 1-in-8.5 (c13's own slope), scaled to fit the
   *  sandbox — the knife edge. C1 and C3 BOTH appear (confirmed by direct
   *  probe: y_n ~ 0.23-0.24 m sits within the classifier's +-5% band of the
   *  local y_c much of the time) but FLICKER between C1/C3/M1/M3/S1 sample
   *  to sample, exactly like the shipped c13 scene (which ships with labels
   *  OFF by default for this reason — CLAUDE.md/js/scenes.js). Needed the
   *  longest settle of anything in this safari (~110s) and never reached
   *  the 10/10-stable bar. Kept here so a lecturer can show the FLICKER
   *  itself as the lesson (see README verification record). */
  criticalKnife: function () {
    APP.loadScene("sandbox", false); CHAN.C("budget").set("Medium"); syncPanel();
    CHAN.build({ S0: 0.118, bed0: 1.3, xEnd: 7.5, gate: { x: 1.0, a: 0.15 },
                 weir: { x: 7.0, h: 0.12, w: 0.5 }, q: 0.25, inletDepth: 0.45,
                 cf: 0.02, cs: 0.08, mode: 3 });
    CHAN.settle(110);
    return CHAN.read(60, 14);
  },
};
"RECIPES ready — try RECIPES.mild123() first, it is the fastest multi-class win.";
