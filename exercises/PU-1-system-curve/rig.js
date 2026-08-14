/* ============================================================================
 * PU-1 · THE RISING MAIN  — sump -> spout-as-pump -> elbow riser -> delivery
 * tank with an overflow lip, built in the Sandbox (RIG-A's own home; this rig
 * does NOT reuse RIG-A's reservoir/tailwater pattern -- see notes below).
 * ----------------------------------------------------------------------------
 * Paste the whole file into the dev console with the SANDBOX scene loaded
 * (http://localhost:8124/  or  ?scene=sandbox), then:
 *
 *     PU1.build()                 // geometry + panel
 *     PU1.prime()                 // rain-fills the sump, then runs the spout
 *                                  // as a pump until the tank is spilling
 *                                  // (drives real sim time -- call repeatedly
 *                                  // from the console, or via the runner's
 *                                  // `pump`; see README Sec.2)
 *     PU1.setVx(6)                 // dial student digit d=6's spout velocity
 *     PU1.read(6)                  // {Q, H, ...} -- what that student submits
 *
 *   y=5.0 ┌────────────────────────────────────────┬───────────┬────────┐
 *         │                                        │  high run │  tank  │chute
 *         │                    ┌───────────────────┴═══════════╡ soffit 2.40-2.70
 *         │                    ║ riser (0.4 wide)   HIGH BORE   │ (open, ▲=lip)
 *         │  sump (open)       ║ x 3.6-4.0          0.40 m      │  2.90
 *   y=0.8 │  (open, no roof)   ╠════╗ low-run soffit ├──────────┤────────┤
 *         │  ~1.5-1.8 m deep   ║LOW ║ 0.80            │ tank    │ open   │
 *   y=0.4 │                    ║BORE║                 │ floor = │ bottom │
 *         │      (P)=pump      ║0.40║                 │ high    │ (drain)│
 *   y=0.0 └────────────────────╨────╨─────────────────┴invert───┴────────┘
 *         0   0.9   1.8   2.0(P) 3.0(gauge) 3.6  4.0  4.0-6.5   6.5-8.5 8.5-9.0
 *
 * Every call below is a documented app entry point -- nothing here is private:
 *   SIM.addSeg(x0,y0,x1,y1,th,kind)     kind 255 wall, 0 ERASE
 *   sim.p.source = {on,x,y,r,vx,vy}     THE SPOUT.  Position is set directly
 *     (no CONTROLS id for x/y -- the panel only exposes on/r/vx/vy; position
 *     is whatever the Spout tool's drag sets, i.e. sim.p.source.x/y).
 *   CONTROLS.find(c=>c.id==="...").set(v); syncPanel()
 *   APP.probe(x,y) -> {u,v,p,head}      NOTE: .head is p/(rho g) ONLY -- the
 *     PRESSURE head, not the full piezometric head. For a point at physical
 *     elevation y, piezometric head = probe(x,y).head + y. Get this wrong and
 *     a pressurised reading comes out LOWER than a free surface it is in fact
 *     holding up (see README Sec.2 "the probe.head trap").
 *   OVERLAY.analyse(sim, SIM.columns(true)).surf[i]  -- exact free-surface
 *     elevation for an OPEN column (sump, tank). Do NOT use .surf inside a
 *     pressurised column -- it reports bed+depth, i.e. the physical soffit
 *     once the bore reads full, not the true (higher) pressurised head.
 *
 * WHY NOT RIG-A's OWN reservoir/tailwater pattern (FR-1/LL-1's rig.js):
 *   RIG-A's head-driven reservoir is a constant-HEAD source (level pinned,
 *   q follows) -- exactly backwards from what a system-curve demo needs
 *   (impose Q, read the H it takes). PU-1's "pump" is the spout instead:
 *   sim.p.source imposes a velocity (-> Q) directly, Dirichlet-style, and H
 *   is measured as the response. No tailwater/level-control edge is used
 *   anywhere in this rig; the delivery tank's level is set by DRAWN geometry
 *   (an overflow lip, weir-fed, CLAUDE.md's jet-scene trick) rather than a
 *   panel level control.
 *
 * MEASURED FACTS THE NEXT RIG-A-FAMILY WORKER SHOULD INHERIT (Medium grid,
 * 414x230, dx 21.7mm -- same grid as RIG-A):
 *   · The spout is NOT a pure momentum source. shaders.js's vof pass stamps
 *     `fNew = max(fNew, 1.0)` inside the spout's footprint every substep --
 *     a volume TOP-UP, not just a velocity BC. Measured: while priming an
 *     EMPTY downstream section this manufactures water fast (~10% of the
 *     local q); once the main is fully primed and running quasi-steady, the
 *     manufactured fraction drops to ~1% of delivered Q and the sump DOES
 *     draw down as the tank fills. Consequence for any rig quoting a static
 *     lift from levels: prime the WHOLE main first, then measure -- reading
 *     levels mid-prime overstates how much the sump has "paid for" the tank.
 *   · A spout velocity that is too WEAK to clear the static lift does not
 *     drain or reverse -- it just stalls part-way up the riser (measured:
 *     vx=1.2 m/s parked at y~2.05, never reached the tank in 55 s). vx=1.5
 *     (this rig's personalised floor) DOES eventually reach the tank from a
 *     cold, empty start, but slowly (still climbing, not yet spilling, at
 *     t=87 s). Prime the shared class rig at a MID-HIGH setting first (this
 *     script uses vx=2.2 for ~50-60 s), THEN sweep down through the digit
 *     range -- do not cold-start every student at their own low digit.
 *   · A spout velocity that is too STRONG overwhelms the waste-chute drain
 *     (an open-bottom edge, mode 1) rather than the delivery tank itself:
 *     the chute backs up (measured 3.86 m deep at vx=4.0, r=0.19), submerges
 *     the overflow lip, and the tank and sump flood together as one body --
 *     total domain volume climbs without bound. vx=3.0 (r=0.15) begins to
 *     stress the chute (0.03 m deep, up from dry) without flooding; the
 *     shipped personalised range (vx 1.50-2.31) stays clear of both failure
 *     modes with margin.
 *   · The spout's footprint must be sealed close to the FULL bore height to
 *     avoid leaking flow backward around its own edges: r=0.15 (0.30 m
 *     footprint against a 0.40 m bore) is what this rig uses; a materially
 *     smaller r let too much slip past into recirculation instead of net
 *     forward transport.
 *   · A vertical riser left open above its own turn (no roof over its own
 *     x-span) becomes an unintended open "chimney" that water piles up in
 *     instead of turning the corner -- the high-run soffit stroke MUST start
 *     at the riser's own left edge (x=3.6), not at the riser's right edge
 *     (x=4.0), or the riser overfills independently of the high run/tank.
 *   · A riser's open interior, if not capped on the side facing the
 *     upstream run's roof-top air pocket, leaks sideways: water in the riser
 *     found a shortcut back into the open air above the low-run soffit and
 *     from there into the sump's own open top, raising the sump even while
 *     the pump ran. Fixed with one extra vertical "cap" stroke immediately
 *     upstream of the riser (x=3.525) sealing that pocket off.
 *   · probe(x,y).head is PRESSURE head only (p/(rho g)), not p/(rho g)+y.
 *     Piezometric head needs +y added by hand. Cross-checked against the
 *     open sump's own column-reduction surface (OVERLAY.analyse(...).surf):
 *     agreement to 5 mm once the +y term was added; without it, a
 *     pressurised reading can come out BELOW an open free surface it is
 *     actually holding up, which is the tell that something is missing.
 * ==========================================================================*/
window.PU1 = {
  // ---- geometry (metres) ----------------------------------------------
  FLOOR_TOP: 0.40,               // sump / low-run / riser floor top face
  LOW_SOF: 0.80,                 // low-run soffit bottom face (0.40 m bore)
  X_MOUTH: 1.8,                  // sump -> low-run transition
  X_RISER0: 3.6, X_RISER1: 4.0,  // riser x-span (0.4 m wide, matches the bore)
  HIGH_INV: 2.00, HIGH_SOF: 2.40,// high-run bore (0.40 m), invert/soffit faces
  X_TANK: 6.5,                   // high-run -> delivery-tank transition
  X_LIP: 8.5, TANK_LIP: 2.90,    // overflow lip position and crest elevation
  X_END: 9.0,                    // domain edge; 8.5-9.0 is the waste chute

  // ---- pump (spout) & gauge stations ------------------------------------
  PUMP_X: 2.0, PUMP_Y: 0.60, PUMP_R: 0.15,     // spout: inside the low-run
                                                 // bore, 0.2 m past the mouth
  FLANGE_X: 3.0, FLANGE_Y: 0.60,                // "pump flange" gauge station,
                                                 // 1.0 m downstream of the
                                                 // spout, 0.6 m clear of the
                                                 // riser corner (wall-tap rule)
  SUMP_X: 0.9, SUMP_Y: 0.70,                    // sump reference station

  C: function (id) { return CONTROLS.find(function (c) { return c.id === id; }); },

  /** Build the rig from a fresh Sandbox load. */
  build: function () {
    var P = PU1, C = P.C;
    APP.loadScene('sandbox', false);
    C('budget').set('Medium');
    C('spoutOn').set(false);
    C('openL').set('0'); C('openR').set('0'); C('openB').set('1'); C('openT').set('0');
    APP.SIM.clearSegs();
    // the sandbox's own two ledges cross this footprint; erase them first
    APP.SIM.addSeg(0, 2.7, 9, 2.7, 2.2, 0);
    // floor: sump + low run + riser base, solid to y=0
    APP.SIM.addSeg(0.0, P.FLOOR_TOP / 2, P.X_RISER1, P.FLOOR_TOP / 2, P.FLOOR_TOP, 255);
    // low-run soffit (roof over the pump/flange section only)
    APP.SIM.addSeg(P.X_MOUTH, P.LOW_SOF + 0.15, P.X_RISER0, P.LOW_SOF + 0.15, 0.30, 255);
    // high-run invert / tank floor, solid to ground, mouth of riser to the lip
    APP.SIM.addSeg(P.X_RISER1, P.HIGH_INV / 2, P.X_LIP, P.HIGH_INV / 2, P.HIGH_INV, 255);
    // high-run soffit -- MUST start at the riser's own left edge (X_RISER0),
    // not X_RISER1, or the riser is left open above its own turn (see notes)
    APP.SIM.addSeg(P.X_RISER0, P.HIGH_SOF + 0.15, P.X_TANK, P.HIGH_SOF + 0.15, 0.30, 255);
    // overflow lip / weir: crest at TANK_LIP, sitting on the tank floor
    APP.SIM.addSeg(P.X_LIP, P.HIGH_INV, P.X_LIP, P.TANK_LIP, 0.10, 255);
    // riser cap: seals the dead air pocket above the low-run soffit from the
    // riser's own interior (else the riser leaks sideways into the sump's
    // open top -- see notes)
    APP.SIM.addSeg(P.X_RISER0 - 0.075, P.LOW_SOF + 0.25, P.X_RISER0 - 0.075, P.HIGH_SOF + 0.35, 0.15, 255);
    C('mode').set('1');   // Head field -- the HGL is the picture
    C('channel').set(false); C('labels').set(false); C('jumps').set(false);
    syncPanel();
    APP.frames(2);
    return P.check();
  },

  ix: function (x) { return Math.round(x / APP.sim.dx); },

  openAt: function (x, y) {
    var S = APP.sim, i = Math.round(x / S.dx), j = Math.round(y / S.dx);
    return S.mask[j * S.nx + i] === 0;
  },

  check: function () {
    var P = PU1;
    return {
      dx: +APP.sim.dx.toFixed(5), grid: APP.sim.nx + 'x' + APP.sim.ny,
      sump_open: P.openAt(0.9, 1.0), low_bore_open: P.openAt(2.7, 0.6),
      riser_open: P.openAt(3.8, 1.5), riser_cap_solid: !P.openAt(3.55, 1.5),
      riser_top_capped: !P.openAt(3.8, 2.55),
      high_bore_open: P.openAt(5.0, 2.2), tank_open: P.openAt(7.5, 2.5),
      chute_open: P.openAt(8.8, 1.0),
    };
  },

  /** Fill the sump from the sandbox's own default (top-left, raining)
   *  spout, ~7 simulated seconds -> sump surface ~1.4-1.8 m. Advances real
   *  sim time -- call via the runner's `pump`, or repeatedly from a live
   *  console (APP.tick / APP.frames) if driving by hand. */
  fillSump: function () {
    PU1.C('spoutOn').set(true); syncPanel();
    APP.tick(Math.ceil(7 / APP.SIM.dt()));
    APP.SIM.columns(true);
  },

  /** Move the spout from "rain" to "pump": inside the low-run bore, aimed
   *  along the pipe axis. Call fillSump() first. */
  installPump: function (vx) {
    var s = APP.sim.p.source, P = PU1;
    s.x = P.PUMP_X; s.y = P.PUMP_Y; s.r = P.PUMP_R;
    s.vx = vx === undefined ? 2.2 : vx; s.vy = 0.0; s.on = 1;
    syncPanel();
    return s;
  },

  /** digit -> spout velocity. Spans "well below" to "well above" the
   *  operating point the paper pump curve is designed to land on
   *  (Q~0.10 m^2/s -- see README Sec.4). */
  vxOf: function (d) { return +(1.5 + 0.09 * d).toFixed(3); },

  setVx: function (d) {
    var s = APP.sim.p.source; s.vx = PU1.vxOf(d); s.on = 1; syncPanel();
    return s.vx;
  },

  /** Piezometric head = pressure head + elevation. probe().head is
   *  PRESSURE head only -- see the big warning above. */
  piezo: function (x, y) { return APP.probe(x, y).head + y; },

  /** What a student reads and submits: Q (delivered, at the flange column)
   *  and H (flange piezometric head above the CURRENT sump surface). Both
   *  gauged fresh each call -- never assume a fixed static lift (P3). */
  read: function (d) {
    APP.frames(2);
    var P = PU1;
    var A = OVERLAY.analyse(APP.sim, APP.SIM.columns(true));
    var iF = P.ix(P.FLANGE_X), iT = P.ix(P.X_TANK + 1.0), iS = P.ix(P.SUMP_X);
    var Hf = P.piezo(P.FLANGE_X, P.FLANGE_Y);
    var Hs = +A.surf[iS].toFixed(4);
    return {
      d: d, t: +APP.sim.t.toFixed(2), vxSet: APP.sim.p.source.vx,
      flangePiezo: +Hf.toFixed(4), flangeQ: +A.q[iF].toFixed(4),
      flangeDepth: +A.h[iF].toFixed(4),
      sumpSurf: Hs, tankSurf: +A.surf[iT].toFixed(4),
      vol: +APP.volume().toFixed(4), H: +(Hf - Hs).toFixed(4),
    };
  },

  /** Rig-card gauges, exactly what the Gauge tool would place: one at the
   *  flange, one on the sump surface. */
  gauges: function () {
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: PU1.FLANGE_X, y: PU1.FLANGE_Y, hist: [], colour: '#7fd4ff' });
    APP.state.gauges.push({ x: PU1.SUMP_X, y: 1.0, hist: [], colour: '#ffb648' });
  },
};
/* PU1.build() -> {dx:0.02174, grid:"414x230", sump_open:true, low_bore_open:true,
                  riser_open:true, riser_cap_solid:true, riser_top_capped:true,
                  high_bore_open:true, tank_open:true, chute_open:true}
   PU1.fillSump(); PU1.installPump(2.2);  // then run ~50-60 sim-s to prime
   PU1.setVx(6); /..settle 10s../ PU1.read(6)
     -> {d:6, flangePiezo:2.9552, flangeQ:0.1184, sumpSurf:1.6522,
         tankSurf:2.9348, H:1.303}                                          */
