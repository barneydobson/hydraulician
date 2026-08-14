/* ============================================================================
 * HP-2 / MO-2 · JET-ON-A-PLATE RIG — shared with exercises/MO-2-jet-vane/rig.js
 * (~80% identical; MO-2's adds the 45deg/90deg ramps for the full turning
 * series, HP-2 only needs the flat-plate/deep-V bookends). Both READMEs
 * document this rig; see MO-2's README Sec.1-2 for the fuller derivation.
 * ----------------------------------------------------------------------------
 * Paste into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/?scene=sandbox), then:
 *
 *   JETRIG.build()          // spout + erase the sandbox's own ledges
 *   JETRIG.flat()           // draw the flat plate (stagnation demo)
 *   JETRIG.deepV()          // swap to the deep-V splitter (theta ~165 deg)
 *   JETRIG.prime()          // settle ~5 sim-s -- call repeatedly (runner pump)
 *   JETRIG.stagnationGauges()   // drop the two gauges used for the head check
 *
 *   y=3.0 ┌─────────────────────────────────────────────┐
 *         │        (spout)                    │(plate)  │
 *   y=2.5 │        (P)---jet--->  droops ~0.1-0.5 m  ┃   │
 *         │                                    ┃         │
 *         │  air below -- no bed, floor is OPEN (drains  │
 *   y=0.0 └──at the free-fall rate, CLAUDE.md)───────────┘
 *         0    0.55  0.70          1.35 (flat)  1.60(V apex)  9.0
 *
 * Every call below is a documented app entry point (same style as PU-1/MO-1's
 * rig.js in sibling folders):
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)     kind 255 wall, 0 ERASE
 *   sim.p.source = {on,x,y,r,vx,vy}     THE SPOUT (Dirichlet velocity, and a
 *     volume TOP-UP inside its own footprint -- see "priming" note below)
 *   APP.probe(x,y) -> {u,v,p,head}      .head is p/(rho g) ONLY -- PRESSURE
 *     head, not full piezometric head (LL-1v's rule, CHANGES-NEEDED.md).
 *     Piezometric head = probe(x,y).head + y. The on-screen GAUGE tool adds
 *     the +y for you (js/main.js sampleGauges: head: gg.y + pr.head) -- read
 *     GAUGES for any head comparison, or add +y by hand if hovering raw.
 *
 * MEASURED FACTS (Medium, sandbox W=9 H=5, 414x230, dx=0.021739 m,
 * dt=3.494e-4 s -- this machine, via exercises/_runner/runner.py):
 *
 *   · PRIMING (PU-1's finding, confirmed here): shaders.js's VOF pass stamps
 *     `fNew = max(fNew, 1.0)` inside the spout's footprint every substep --
 *     a volume top-up, not a pure momentum source. For THIS rig (free jet in
 *     open air, no duct to fill) the effect is much shorter-lived than PU-1's
 *     pipe case: there is no large downstream volume to "prime", so the jet
 *     reaches a steady shape within about 1-2 sim-s of turning the spout on.
 *     Still: always run >=3 sim-s (JETRIG.prime() default) before reading
 *     ANYTHING, and re-settle >=3 sim-s after any geometry swap (flat -> V
 *     etc empties/refills the local splash pocket).
 *
 *   · JET QUALITY. Spout r=0.09 (0.18 m / ~8.3 cells wide), vx=4.5 m/s,
 *     vy=0, at (0.70, 2.50). Coherent core (f > 0.99) measured at a station
 *     0.35 m downstream (clear of the spout's own r=0.09 footprint, edge at
 *     x=0.79): speed 4.4-4.9 m/s, thickness ~0.18 m (matches 2r almost
 *     exactly) -> q(core) ~ 0.774 m^2/s against the nominal source value
 *     2r*vx = 0.81 m^2/s (5% low, i.e. the core is not quite the full
 *     footprint -- honest, not a bug). Robustness: f stayed 1.00-1.01 (no
 *     shredding/dropout) at a station 0.5 m downstream across the WHOLE
 *     tested spout-velocity range 2.0-5.0 m/s -- the jet survives its flight
 *     at every speed the panel allows, confirming CLAUDE.md's note that
 *     hard-zeroed air would shred a jet does NOT bite here.
 *
 *   · DROOP / "how horizontal is horizontal". vy=0 does not mean the jet
 *     stays level -- it is a real 2D-vertical-plane free jet and gravity
 *     acts on it like a fire hose stream. Measured centreline fall: ~0.05-
 *     0.15 m over the first 0.3-0.4 m of flight (near-horizontal, safe for
 *     a "horizontal jet" story), growing to ~0.3-0.5 m by 0.9-1.3 m of
 *     flight (visibly arcing -- fine for teaching a free jet's trajectory,
 *     wrong if you want a clean stagnation-vs-v^2/2g number). This is WHY
 *     the flat plate and 45/90 ramps sit close in (x=1.00-1.35, 0.3-0.65 m
 *     of flight) while the deep-V's APEX sits at x=1.60 (0.9 m) but its
 *     MOUTH -- where the return flow is actually read -- sits upstream at
 *     x=0.73, i.e. only 0.03 m of net extra flight beyond the plate case.
 *
 *   · STAGNATION HEAD is read from the RAW per-cell probe/gauge, not
 *     `OVERLAY.analyse`'s column reduction -- and that matters for the
 *     "hover near a structure lies" rule (MO-1, CHANGES-NEEDED.md). MO-1's
 *     ~3-cell corruption is specific to `OVERLAY.analyse`'s SPATIAL
 *     SMOOTHING WINDOW (built for open-channel depth), which straddles a
 *     solid/open discontinuity. `SIM.probe()` and the Gauge tool are a
 *     direct single-cell readPixels with NO cross-cell smoothing -- a
 *     streamline scan straight into the plate face here (04/05 in the
 *     worker's scratch log) is clean and MONOTONIC all the way to the last
 *     wet cell, no corruption artefact. So: for a stagnation POINT (not a
 *     channel depth), read the LAST WET CELL, not 6 cells back -- backing
 *     off would just read a partly-decelerated value and understate the
 *     stagnation pressure. The two rules are not in conflict; they apply to
 *     different fields (smoothed column depth vs raw point pressure).
 *
 *   · MEASURED RATIO (stagnation head / v^2/2g): gauge at the plate face
 *     (1.32, 2.46) read piezometric H=3.779 m; reference gauge in the free
 *     jet (0.95, 2.50) read H=2.521 m (elevation-adjusted per LL-1v, so the
 *     two subtract cleanly). Pressure-only stagnation head = 3.779-2.46 =
 *     1.319 m. Reference v (clear station, ~0.35 m upstream of the plate)
 *     = 4.46 m/s -> v^2/2g = 1.014 m. Ratio = 1.30 (30% HIGH). A second,
 *     independent raw-probe streamline scan gave 1.187/1.014 = 1.17 (17%
 *     high). BOTH READ HIGH, not low or scattered around 1 -- the gap is
 *     real, not solver noise: (a) the jet keeps ACCELERATING under gravity
 *     over its last stretch of flight, so the true local approach speed at
 *     the wall exceeds a reference speed measured a little further
 *     upstream, and (b) the EOS's compressible stagnation response scales
 *     with M=v/c (~4.5/22 = 0.20 here), both pushing the same direction.
 *     Expect ~1.15-1.30, not exactly 1 -- and say why on the day.
 *
 *   · DEEP-V GEOMETRY. A straight-sided V approximating theta -> 165 deg is
 *     `theta = 180 - gamma`, gamma = the half-angle each arm makes with the
 *     jet axis (gamma=90 deg degenerates to the flat plate; gamma=0 is a
 *     fully closed slot, theta=180). gamma=15 deg -> theta=165 deg exactly,
 *     which is why this rig uses it. THE APEX MUST BE CAPPED: two segments
 *     sharing a butt endpoint (CLAUDE.md) do not seal the point they meet
 *     at -- verified by mask query, mask=0 (leaky) at the bare apex, fixed
 *     with one short extra segment plugging it, mask=255 after. Arm length
 *     matters too: an oversized V (first attempt, arm 0.9 m at apex x=1.60)
 *     put the MOUTH at x=0.731, almost on top of the spout at x=0.70 --
 *     contaminated every downstream reading with the raw Dirichlet source
 *     value (u=4.5,v=0 exactly). Keep >=0.35 m clearance between the
 *     spout's own footprint edge and the V's mouth.
 *
 *   · ACHIEVED TURN ANGLE (deep-V, gamma=15, apex (1.60,2.45), arm 0.9 m).
 *     Measured at a clean station x=0.55 (upstream of the spout footprint
 *     [0.61,0.79], so genuinely clear of the source): returning stream
 *     u=-5.29..-5.85 m/s, v=-0.26..+0.12 m/s (three repeat reads, ~0.4 sim-s
 *     apart) -- fast (as fast as or faster than the incoming jet) and
 *     almost perfectly horizontal, direction 179-183 deg in the lab frame.
 *     Crediting the incoming jet's own arrival angle at the apex (drooped
 *     ~15-25 deg below horizontal after 0.9 m of flight, not the nominal
 *     0 deg launch angle), the CV turn is ~160-165 deg -- matching the
 *     geometric design (165 deg) well. Method: velocity VECTOR at a station
 *     clear of both the source and the V, not a color read off the display.
 * ==========================================================================*/
window.JETRIG = {
  SPOUT: { x: 0.70, y: 2.50, r: 0.09, vx: 4.5, vy: 0.0 },
  FLAT_X: 1.35,
  V_APEX: [1.60, 2.45], V_HALF_DEG: 15, V_ARM: 0.9,
  ERASE_SEGS: 1,

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Bare rig: sandbox, ledges erased, spout positioned. No deflector yet. */
  build: function () {
    var R = JETRIG, C = R.C;
    APP.loadScene('sandbox', false);
    C('budget').set('Medium');
    C('spoutOn').set(false);
    C('openL').set('0'); C('openR').set('0'); C('openB').set('1'); C('openT').set('0');
    APP.SIM.clearSegs();
    APP.SIM.addSeg(0, 2.7, 9, 2.7, 2.4, 0);   // erase the sandbox's own two ledges
    var s = APP.sim.p.source;
    s.x = R.SPOUT.x; s.y = R.SPOUT.y; s.r = R.SPOUT.r;
    s.vx = R.SPOUT.vx; s.vy = R.SPOUT.vy; s.on = 1;
    C('mode').set('2'); C('channel').set(false); C('labels').set(false); C('jumps').set(false);
    syncPanel(); APP.frames(2);
    return R.check();
  },

  clearDeflector: function () { while (APP.sim.segs.length > JETRIG.ERASE_SEGS) APP.SIM.undoSeg(); },

  flat: function () {
    JETRIG.clearDeflector();
    APP.SIM.addSeg(JETRIG.FLAT_X, 2.00, JETRIG.FLAT_X, 3.00, 0.06, 255);
    syncPanel(); APP.frames(2);
    return { kind: 'flat', x: JETRIG.FLAT_X };
  },

  d45: function () {
    JETRIG.clearDeflector();
    APP.SIM.addSeg(1.00, 2.90, 1.80, 2.10, 0.06, 255);   // ramp, tip well above the jet
    syncPanel(); APP.frames(2);
    return { kind: 'd45' };
  },

  d90: function () {
    JETRIG.clearDeflector();
    // ceiling + wall: jet flies under the ceiling, hits the wall, can only
    // turn down (the ceiling blocks the upward escape at the corner) --
    // a genuine single-direction 90 deg turn, unlike the flat plate's split.
    APP.SIM.addSeg(1.00, 2.60, 1.35, 2.60, 0.06, 255);
    APP.SIM.addSeg(1.35, 2.60, 1.35, 1.60, 0.06, 255);
    syncPanel(); APP.frames(2);
    return { kind: 'd90' };
  },

  deepV: function (halfAngleDeg, apex, armLen) {
    JETRIG.clearDeflector();
    var g = (halfAngleDeg === undefined ? JETRIG.V_HALF_DEG : halfAngleDeg) * Math.PI / 180;
    var a = apex || JETRIG.V_APEX, L = armLen === undefined ? JETRIG.V_ARM : armLen;
    var xa = a[0], yc = a[1];
    var mx = xa - L * Math.cos(g), myU = yc + L * Math.sin(g), myL = yc - L * Math.sin(g);
    APP.SIM.addSeg(mx, myU, xa, yc, 0.05, 255);            // upper arm
    APP.SIM.addSeg(mx, myL, xa, yc, 0.05, 255);            // lower arm
    APP.SIM.addSeg(xa, yc - 0.045, xa, yc + 0.045, 0.05, 255);  // apex cap -- SEE NOTE ABOVE
    syncPanel(); APP.frames(2);
    return { kind: 'deepV', halfAngleDeg: halfAngleDeg || JETRIG.V_HALF_DEG,
             turnDeg: 180 - (halfAngleDeg || JETRIG.V_HALF_DEG), apex: a, mouth: [mx, myU, myL] };
  },

  /** Settle after a build/swap. Call repeatedly (runner `pump`) -- this rig
   *  reaches a steady shape in ~1-2 sim-s (no duct to fill), but 3-5 s is
   *  the safe habit, matching PU-1/MO-1's "always re-settle after a change". */
  prime: function (secs) {
    APP.tick(Math.ceil((secs === undefined ? 4 : secs) / APP.SIM.dt()));
    APP.SIM.columns(true);
    return +APP.sim.t.toFixed(2);
  },

  /** The two gauges the stagnation-ratio measurement was taken from. */
  stagnationGauges: function () {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: JETRIG.FLAT_X - 0.03, y: 2.46, hist: [], colour: '#7fd4ff' }); // stagnation
    APP.state.gauges.push({ x: 0.95, y: 2.50, hist: [], colour: '#ffb648' });                 // reference
    JETRIG.C('gaugeField').set('head'); syncPanel();
  },

  /** Piezometric head = pressure head + elevation (LL-1v; probe().head is
   *  pressure-only). Use this for any raw-probe head comparison. */
  piezo: function (x, y) { return APP.probe(x, y).head + y; },

  check: function () {
    var s = APP.sim.p.source;
    return { dx: +APP.sim.dx.toFixed(5), grid: APP.sim.nx + 'x' + APP.sim.ny,
             dt: +APP.SIM.dt().toExponential(3), source: { x: s.x, y: s.y, r: s.r, vx: s.vx, vy: s.vy },
             open: APP.sim.p.open.join(',') };
  },
};
/* JETRIG.build() -> {dx:0.02174, grid:"414x230", dt:3.494e-4,
                       source:{x:0.7,y:2.5,r:0.09,vx:4.5,vy:0}, open:"0,0,1,0"}
   JETRIG.flat(); JETRIG.prime(5); JETRIG.stagnationGauges(); JETRIG.prime(3);
   JETRIG.deepV();  // theta -> 165 deg splitter
   JETRIG.d45(); JETRIG.d90();  // the other two turning-series shapes (MO-2) */
