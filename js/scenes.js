"use strict";
/**
 * scenes.js — teaching set-ups.
 *
 * A scene is geometry (wall segments, in metres) plus boundary controls. The
 * domain is a fixed physical rectangle W × H; the grid is sized to a cell
 * budget and the canvas letterboxes it, so a scene behaves identically
 * whatever shape the window is.
 *
 *   seg = [x0, z0, x1, z1, thickness]
 *
 * is a straight edge with BUTT ends — exactly what the left-drag tool
 * produces, so every scene here is something you could have drawn yourself.
 * x0,z0 → x1,z1 is the centreline, so a bed whose top face should sit at
 * z has its centreline at z − thickness/2.
 *
 * Two rules learned the hard way:
 *  · Ground must be solid all the way down. A thin slab leaves a sealed void
 *    underneath that fills through any opening and then drowns the outfall
 *    above it. Beds are drawn thick enough to reach below z = 0.
 *  · A Dirichlet level boundary applies over the whole ghost column below
 *    that level, so anything you do not want flooded needs a wall at x = 0.
 *  · A subcritical reach needs a real downstream control — a tailwater level
 *    or a brink. The open boundary is zero-gradient, which is correct for
 *    supercritical outflow but simply ponds a subcritical one.
 *  · A tailwater level must stand clear of critical depth — tail ≥ 1.3 d_c,
 *    rechecked whenever q moves, since d_c = (q²/g)^⅓. Set AT d_c the outlet
 *    chokes and the one-cell Dirichlet argues with the flow it should be
 *    setting; set below it, it is asking for a depth the outlet cannot hold.
 *
 * `spinup` is the MEASURED time for the depth profile to stop moving (the
 * last moment a 10 s running mean is still >3% of mean depth from its final
 * shape), taken from headless runs (120 s for most scenes; sa1 needed a
 * 260 s run to see past its own residual wobble — see its own comment). It
 * is not guessable:
 *
 *     venturi  7    hammer  7    h23 15    m3 17    s2 17    m1 25
 *     jet     54    m2     85    c13 91    sa1    120
 *
 * m1 and m2 are the same slope, roughness and discharge and differ by 3×,
 * because a drawdown has to propagate the length of the reach several times
 * over. Scenes whose unsteadiness is genuine — the 1-in-4 chutes' roll waves,
 * s1's roller — have no measurable transient at all: the mean profile is
 * there almost at once and only the fluctuation remains, so they keep a short
 * spin-up. The wave flume, dam break, plan view and sandbox have none by
 * design: watching them develop from t = 0 is the point.
 */
const SCENES = (() => {

  // Hydrostatic fill: the equilibrium f for still water standing at `lev`.
  // Starting here rather than at f = 1 avoids a spurious water-hammer
  // transient the moment a scene loads.
  const still = (lev, z, P) => (z < lev ? 1 + P.g * (lev - z) / (P.c * P.c) : 0);

  const base = {
    W: 8, H: 4.5, g: 9.81, c: 25, cf: 0.03, cs: 0.16, nu: 1e-5,
    slip: 0, bulk: 0.10, ca: 0.6, mode: 0, dyeLine: 0, chan: 0,
    group: "Other",
    open: [0, 0, 0, 0],                    // L R B T
    inflow: { level: 0, q: 0, on: 0, free: 0 },
    tailwater: { level: 0, on: 0 },
    wave: { amp: 0, period: 1.5, on: 0, x: 0.15 },
    source: { on: 0, x: 0.5, z: 4.0, r: 0.12, vx: 1.2, vz: -1.6 },
    walls: () => [],
    water: () => 0,
  };

  // ------------------------------------------------------- channel builder
  //
  // Every gradually-varied-flow scene is the same prismatic channel with
  // different controls bolted on, so they are all generated from one place.
  // The two numbers that decide everything:
  //
  //     d_c = (q²/g)^⅓                        critical depth
  //     d_n = (n q / √S₀)^⅗                   normal depth (Manning, R = d)
  //
  // with n the roughness the solver DELIVERS for a given C_f. Since the
  // mixing-length closure (issue #72) the profile is a log law over the whole
  // depth and the bed's wall function sets the resistance, so n follows C_f
  // — measured on m2 at Medium (~20 cells of depth), Average mode:
  //
  //     C_f   0.02    0.125   0.25    0.5     3
  //     n     0.024   0.028   0.031   0.034   0.038
  //
  // close to n ≈ 0.022 + 0.017·√C_f, and capped near 0.04 whatever C_f is: a
  // log law cannot be rougher than its own outer layer. That cap is what sets
  // the slopes below. Mild needs S₀ under the critical slope
  // S_c = g n²/d_c^⅓ ≈ 0.016 at q = 0.25, C_f = 0.25 — the old 1 in 68 is now
  // a critical channel — and d_n/d_c = (S_c/S₀)^0.3.
  //
  // So each profile below is produced by choosing S₀ and C_f either side of
  // that line, then adding the control (weir, gate, brink, tailwater) that
  // puts the depth in zone 1, 2 or 3. Every number quoted in a scene's comment
  // is measured, not computed from this.
  /** The n the solver delivers at a given C_f, from the table above. Only the
   *  initial condition uses it — every on-screen d_n and n is measured. */
  const nOf = (cf) => 0.022 + 0.017 * Math.sqrt(Math.max(cf, 0));
  const TH = 1.4;                          // bed thickness — reaches below z=0

  /** A scene states the DEPTH its arriving profile wants (`inletDepth`, always
   *  a measured number — m1's is the weir backwater, m2's the measured d_n).
   *  The reservoir level that delivers it is that depth plus its velocity
   *  head, because the level is an ENERGY line: the boundary solves
   *  E = d + q²/2gd² for what it hands over (SIM.inletStage).
   *
   *  Doing the conversion HERE is what lets every `inletDepth` in this file go
   *  on meaning exactly what its comment says it means. Set the level to the
   *  bare depth instead and every scene is pinned a velocity head too shallow
   *  — 11 mm on m1, 26 mm on m2, 271 mm on the steep pair — which is the
   *  failure the engineering notes already describe: an inlet pinned under
   *  what the flow wants chokes the profile and sheds ripples for ever. It
   *  cost two physics gates when it was tried: m1's mean column flux spread
   *  0.0109 against a 0.01 limit (0.0022 settled), and m3 turned in a positive
   *  energy sample.
   *
   *  Head-driven inflow prescribes no discharge, so there is no velocity head
   *  to add: its level is a still-water head and stays one. */
  const inletLevel = (bed, depth, q, free) =>
    bed + depth + (free || !(q > 0) ? 0 : (q * q) / (2 * 9.81 * depth * depth));

  function channel(o) {
    const W = o.W, H = o.H, xEnd = o.xEnd === undefined ? W : o.xEnd;
    // tilt: draw the bed FLAT (grid-aligned, so there is no rasterisation
    // staircase to excite waves) and tilt gravity by S0 instead. Only for
    // uniform mild slopes — at 1:68 the still-water surface tilt (0.8°) is
    // invisible, and the GVF maths is identical in the tilted frame.
    const S0g = o.tilt ? 0 : o.S0;                           // geometric slope
    const S0 = o.S0;                                         // dynamic slope
    const xB = o.xBreak === undefined ? xEnd : o.xBreak;     // break in grade
    const S0b = o.S0b === undefined ? S0g : o.S0b;
    const bedTop = (x) => {
      const t = Math.min(Math.max(x, 0), xEnd);
      return t <= xB ? o.bed0 - S0g * t : o.bed0 - S0g * xB - S0b * (t - xB);
    };
    const off = (TH / 2) * Math.sqrt(1 + S0g * S0g);
    const offB = (TH / 2) * Math.sqrt(1 + S0b * S0b);
    const outBed = bedTop(xEnd);
    const inLevel = inletLevel(o.bed0, o.inletDepth, o.q, o.free);
    // The SURFACE that depth stands at. inLevel is an energy line and is a
    // velocity head above it, so it must never be handed to `still()` — filling
    // a gate pool to the energy line starts the scene with water it has to shed.
    const inSurf = o.bed0 + o.inletDepth;
    const twLevel = o.tail === undefined ? 0 : outBed + o.tail;

    // A butt-ended sloping slab is cut PERPENDICULAR to its axis, so its top
    // face starts half a thickness downstream of the centreline endpoint —
    // which leaves the upstream corner of the bed missing. Run the slab in
    // from outside the domain. The downstream end is only extended when the
    // bed reaches the boundary; where there is a brink, the square end is
    // exactly the lip we want.
    const x0 = -1.0, e = xEnd >= W - 1e-6 ? 1.0 : 0;
    const walls = () => {
      const w = xB >= xEnd
        ? [[x0, o.bed0 - off - S0g * x0, xEnd + e, outBed - off - S0g * e, TH]]
        : [[x0, o.bed0 - off - S0g * x0, xB, bedTop(xB) - off, TH],
           [xB, bedTop(xB) - offB, xEnd + e, outBed - offB - S0b * e, TH]];
      if (o.weir) {
        const b = bedTop(o.weir.x);
        w.push([o.weir.x, b - 0.25, o.weir.x, b + o.weir.h, o.weir.w || 0.7]);
      }
      return w;
    };

    // Start near the answer, at a constant DEPTH over the bed rather than a
    // constant level. A horizontal initial surface on a steep bed is metres
    // deep at the toe, and a zero-gradient outflow cannot shift that much
    // water — the chute drowns before it ever runs.
    const ycE = Math.pow(o.q * o.q / 9.81, 1 / 3);
    const ynE = S0 > 1e-5 ? Math.pow(nOf(o.cf) * o.q / Math.sqrt(S0), 3 / 5) : ycE * 1.6;
    const d0 = o.start === undefined ? Math.min(Math.max(ycE, ynE), 0.6) : o.start;
    const crest = o.weir ? bedTop(o.weir.x) + o.weir.h : -1e9;
    const water = (x, z, P) => {
      if (x >= xEnd || z <= bedTop(x)) return 0;
      let lev;
      if (o.gate && x < o.gate.x) lev = inSurf;                  // pool behind the gate
      else if (o.weir && x < o.weir.x) lev = Math.max(crest, bedTop(x) + d0);
      else lev = Math.max(bedTop(x) + d0, twLevel);
      return still(lev, z, P);
    };

    // The gate is a parametric solid, not a fixed wall segment: `gate_a`
    // (the opening) is a declared param, so the Geometry panel gets a slider
    // and a rig can carry a chosen opening. The bed slabs stay in walls()
    // (the shim) — this is the parametric proof for one piece of geometry,
    // not a wholesale migration.
    const params = o.gate
      ? [{ key: "gate_a", label: "Gate opening", min: 0.05,
           max: Math.min(o.inletDepth, H - bedTop(o.gate.x)),
           step: 0.005, value: o.gate.a, unit: "m" }]
      : undefined;
    const solids = o.gate ? (W_, H_, P_, par) => {
      const a = (par && par.gate_a !== undefined) ? par.gate_a : o.gate.a;
      const b = bedTop(o.gate.x);
      // The gate blade: 0.05 m thick, lip at bed + a, top out of the domain.
      // Faces: upstream (the pressure-diagram face), downstream, lip.
      const x = o.gate.x, t = 0.025;
      return [GEOM.poly(
        [[x - t, b + a], [x + t, b + a], [x + t, H_ + 0.5], [x - t, H_ + 0.5]],
        [{ id: "us", label: "Upstream face", e0: 3, e1: 3 },
         { id: "ds", label: "Downstream face", e0: 1, e1: 1 },
         { id: "lip", label: "Lip", e0: 0, e1: 0 }], "gate")];
    } : undefined;

    return Object.assign({
      chan: 1, group: "Open channel — surface profiles",
      W, H, c: 22, cf: o.cf, cs: o.cs === undefined ? 0.16 : o.cs,
      mode: o.mode === undefined ? 3 : o.mode,
      hmax: o.hmax || 0.5, vmax: o.vmax || 2.5,
      spinup: o.spinup || 25, dyeLine: o.dyeLine || 0,
      open: [1, 1, xEnd < W - 1e-6 ? 1 : 0, 0],
      tiltS0: o.tilt ? S0 : 0,
      inflow: { level: inLevel, q: o.free ? 0 : o.q, on: 1, free: o.free ? 1 : 0 },
      tailwater: o.tail === undefined ? { level: 0, on: 0 } : { level: twLevel, on: 1 },
      walls, water, params, solids,
      yc: ycE, yn: S0 > 1e-5 ? ynE : Infinity, bedTop,   // handy from APP.sim.scene
    }, o.extra || {});
  }

  /** Approach channel → chute → apron. The apron slope decides the letter
   *  (S₀ > 0 mild/steep, 0 horizontal, < 0 adverse); the chute guarantees the
   *  supercritical zone-3 reach, and the tailwater decides where it ends in a
   *  jump. A chute, not a sheer drop: a plunging nappe just digs a pool and
   *  drowns its own jet, whereas a 1-in-4 chute delivers a clean fast sheet
   *  with air above it. */
  function drop(o) {
    const W = o.W, H = o.H;
    // tilt: the apron is drawn FLAT and gravity tilted by S0, exactly as
    // channel() does it — a mild apron at 1 in 250 rasterises to one step
    // every three metres, which the overlay's slope window (±9% of the
    // domain) sees as level ground between the steps. The chute and the
    // approach take the same S0 on top of their own, which is a 2% change
    // to a 1-in-5 chute and makes the approach mild instead of level.
    const S0 = o.tilt ? 0 : (o.S0 || 0);
    // No upper clamp: the apron slab is drawn to W + 1 (a butt end inside the
    // domain would leave the last column short), and clamping the elevation at
    // W while extending the segment past it flattens the drawn slope by
    // (W − xb)/(W + 1 − xb) — 22% on a23's adverse apron. Inside the domain
    // this is the same function it always was.
    const apron = (x) => o.lo - S0 * (Math.max(x, o.xb) - o.xb);
    const off = (TH / 2) * Math.sqrt(1 + S0 * S0);
    const sr = (o.hi - o.lo) / (o.xb - o.xa);                 // drop face slope
    const offR = (TH / 2) * Math.sqrt(1 + sr * sr);
    // The face is butt-cut perpendicular to its axis, so started AT the crest
    // its top corner surfaces ~half a thickness downstream, leaving a notch
    // in the bed right at the brink. Start it upstream by the corner
    // recession (overlapping the approach slab, which is harmless).
    const ext = (TH / 2) * sr / Math.sqrt(1 + sr * sr) * 1.3;
    // xEnd: the apron ends in a free overfall there (open bottom beyond, no
    // tailwater), as channel()'s brinks do. A level control at the outlet has
    // two stable modes on an apron like this — a level, or a sharp-crested
    // weir at the level with the lower rows recirculating — and which one a
    // run lands in is history: measured on m3 at Low, it settled drowned
    // with the apron 0.6 m deep behind a 0.24 m tailwater, for good.
    const brink = o.xEnd !== undefined && o.xEnd < W - 1e-6;
    const twLevel = brink ? 0 : apron(W) + o.tail;
    const inLevel = inletLevel(o.hi, o.inletDepth, o.q, 0);
    const inSurf = o.hi + o.inletDepth;      // the surface, not the energy line
    return Object.assign({
      chan: 1, group: "Open channel — surface profiles",
      id: o.id, name: o.name, key: o.key, blurb: o.blurb, tips: o.tips,
      W, H, c: 22, cf: o.cf, cs: o.cs === undefined ? 0.10 : o.cs,
      mode: o.mode === undefined ? 3 : o.mode,
      hmax: o.hmax || 0.5, vmax: o.vmax || 4, spinup: o.spinup || 26,
      open: [1, 1, brink ? 1 : 0, 0],
      tiltS0: o.tilt ? o.S0 : 0,
      inflow: { level: inLevel, q: o.q, on: 1, free: 0 },
      tailwater: brink ? { level: 0, on: 0 } : { level: twLevel, on: 1 },
      walls: () => [
        [-1.0, o.hi - TH / 2, o.xa, o.hi - TH / 2, TH],                       // approach
        [o.xa - ext, o.hi - offR + ext * sr, o.xb, o.lo - offR, TH],          // drop face
        brink ? [o.xb, o.lo - off, o.xEnd, apron(o.xEnd) - off, TH]           // apron to its lip
              : [o.xb, o.lo - off, W + 1, apron(W + 1) - off, TH],            // apron
      ],
      water: (x, z, P) => {
        if (brink && x >= o.xEnd) return 0;
        const bed = x < o.xa ? o.hi : (x < o.xb ? o.hi - sr * (x - o.xa) : apron(x));
        if (z <= bed) return 0;
        const lev = x < o.xa ? inSurf : Math.max(bed + 0.10, twLevel);
        return still(lev, z, P);
      },
    }, o.extra || {});
  }

  /** Piston wavemaker over a flat bed and a 1 : 3.4 beach. One geometry,
   *  0.74 m of still water; the scenes below differ only in the paddle's
   *  stroke and period, because h/L is what decides the regime:
   *
   *    T = 0.9 s → L = 1.26 m, h/L = 0.59   deep         orbits die with depth
   *    T = 1.5 s → L = 3.16 m, h/L = 0.23   intermediate shoals and breaks
   *    T = 4.0 s → L = 10.4 m, h/L = 0.07   shallow      orbits reach the bed
   *
   *  STROKE IS NOT COSMETIC. These waves are damped numerically, not
   *  physically: measured, zeroing the bulk viscosity, the Smagorinsky term,
   *  the bed friction or the interface compression each moves the decay
   *  almost not at all (H at 6 m stays 0.02–0.03 m in every case), while
   *  tripling the stroke lifts the height ARRIVING AT THE BEACH from 0.014 m
   *  — one cell, i.e. no wave at all — to 0.065 m. A wave has to be tall
   *  enough in CELLS to survive an interface that is itself ~2 cells thick.
   *  The old 0.055 m stroke never got a measurable wave to the beach, so this
   *  scene's own "watch them shoal and break" never actually happened. */
  function flume(o) {
    // Still water of depth (lev − bed) over a flat bed, then a beach of slope
    // `slope` from `xb`. The beach must break the surface inside the domain:
    // slope · (W − xb) > lev − bed.
    //
    // BEACH SLOPE IS THE SURF ZONE. Breaking starts where H ≈ 0.78 h, so the
    // surf zone is about h_break/slope wide — on the old 1 : 3.4 beach that
    // was ~0.15 m, a couple of cells, which is why nothing appeared to happen
    // at the shoreline. At 1 : 20 the same wave breaks metres offshore and
    // spills the whole way in. Slope also sets the breaker TYPE through the
    // Iribarren number ξ = tanβ / √(H₀/L₀): ξ < 0.5 spilling, 0.5–3.3
    // plunging, > 3.3 surging.
    const W = o.W, H = o.H, lev = o.lev, bed = o.bed, xb = o.xb, S = o.slope;
    const TH = 2.0, off = (TH / 2) * Math.sqrt(1 + S * S);
    return {
      group: "Jets & waves",
      W, H, c: 26, cf: 0.010, cs: 0.08, bulk: 0.03, ca: 0.8,
      mode: 0, hmax: lev * 1.5, vmax: o.vmax || 1.4,
      open: [0, 0, 0, 0],
      wave: { amp: o.amp, period: o.period, on: 1, x: 0.30 },
      particles: o.particles,          // orbits are the subject in some of these
      plife: o.plife || 6,             // must outlast a period to draw one orbit
      tracerX: o.tracerX,              // seed an orbit rake here
      trailSeconds: o.trail,
      view: o.view,                    // open zoomed on what the scene is about
      spinup: o.spinup || 0,
      walls: () => [
        [0.0, bed - 0.40, xb, bed - 0.40, 0.80],                     // flat bed
        [xb, bed - off, W + 0.4, bed + S * (W + 0.4 - xb) - off, TH],  // beach
      ],
      water: (x, z, P) => (z > bed && z < lev && x < xb + (z - bed) / S
                            ? still(lev, z, P) : 0),
      id: o.id, name: o.name, key: o.key, blurb: o.blurb, tips: o.tips,
    };
  }

  const list = [

    { id: "two-tank", name: "Two tanks · parallel ducts", key: "QS-2 · per metre width", group: "Sandbox",
      blurb: "Two rectangular tanks exchange water through identical 15 m × 0.10 m ducts. Left starts high; the shallow right-hand charge keeps both outlets submerged.",
      W: 32, H: 4, c: 35, cf: 0.25, cs: 0.40, mode: 1, spinup: 0,
      hmax: 3.2, headMax: 3, vmax: 2,
      params: [
        { key: "tank_b1", label: "Left reservoir width", min: 6, max: 9,
          step: 0.25, value: 9, unit: "m", resetWater: true },
        { key: "tank_b2", label: "Right reservoir width", min: 3, max: 6,
          step: 0.25, value: 6, unit: "m", resetWater: true },
      ],
      // Default clear tank widths 9 m and 6 m. All dimensions describe water faces,
      // not wall centrelines. Thick blocks leave no hidden under-floor void.
      // Three connected solids: ground/tank walls, the separator, and roof.
      // The wet faces retain the original segment coordinates; the ground
      // extends below the domain. Faces are named for the Pressure force tool.
      solids: (W, H, P, par = {}) => {
        const left = 9.5 - (par.tank_b1 === undefined ? 9 : par.tank_b1);
        const right = 24.5 + (par.tank_b2 === undefined ? 6 : par.tank_b2);
        return [
        GEOM.poly([[-0.5,-0.5],[32.5,-0.5],[32.5,0.2],
          [right+0.1,0.2],[right+0.1,4],[right,4],[right,0.2],
          [24.5,0.2],[24.5,0.5],[9.5,0.5],[9.5,0.2],
          [left,0.2],[left,4],[left-0.1,4],[left-0.1,0.2],[-0.5,0.2]], [
          { id: "rightWall", label: "Right tank outer wall", e0: 5, e1: 5 },
          { id: "rightBed", label: "Right tank floor", e0: 6, e1: 6 },
          { id: "lowerFloor", label: "Lower duct floor", e0: 8, e1: 8 },
          { id: "leftBed", label: "Left tank floor", e0: 10, e1: 10 },
          { id: "leftWall", label: "Left tank outer wall", e0: 11, e1: 11 },
        ], "tankGround"),
        GEOM.rect(9.5, 0.60, 24.5, 0.94, { id: "ductSeparator", faces: [
          { id: "lowerRoof", label: "Lower duct roof", e0: 0, e1: 0 },
          { id: "right", label: "Separator: right tank face", e0: 1, e1: 1 },
          { id: "upperFloor", label: "Upper duct floor", e0: 2, e1: 2 },
          { id: "left", label: "Separator: left tank face", e0: 3, e1: 3 },
        ] }),
        GEOM.rect(9.5, 1.04, 24.5, 4, { id: "ductRoof", faces: [
          { id: "roof", label: "Upper duct roof", e0: 0, e1: 0 },
          { id: "right", label: "Roof block: right tank face", e0: 1, e1: 1 },
          { id: "left", label: "Roof block: left tank face", e0: 3, e1: 3 },
        ] }),
        ];
      },
      water: (x, z, P, par = {}) => {
        const left = 9.5 - (par.tank_b1 === undefined ? 9 : par.tank_b1);
        const right = 24.5 + (par.tank_b2 === undefined ? 6 : par.tank_b2);
        if (x < left || x > right || z < 0.2) return 0;
        if (x < 9.5) return still(3.0, z, P);
        if (x > 24.5) return still(1.2, z, P);
        return ((z > 0.5 && z < 0.60) || (z > 0.94 && z < 1.04))
          ? still(3.0 - 1.8 * (x - 9.5) / 15, z, P) : 0;
      },
      tips: ["Set both reservoir widths in Controls → Geometry. A width change restarts the water and clock.",
             "Each duct is 15 m long with a 0.10 m clear gap. Both branches see the same level difference.",
             "The left level starts at 3.00 m and the right at 1.20 m. R restores this initial condition.",
             "Both ducts share the same head loss; their discharges add. Storage and discharge are per metre out of the screen."] },

    // --------------------------------------------------------- similitude
    // DA-1: a tank and an exact scale copy of it, side by side,
    // each draining through a slot in its floor. V opens both slots at once.
    //
    // THE WHOLE RIG SCALES. The prototype (left) is fixed; the model (right)
    // is the same drawing multiplied by L_r about its own bottom-left corner
    // (x = 5.2 m, z = 0) — walls, floor, slot, the shaft under the slot, the
    // fill depth. So the model's depth d, gauge station and level marks are
    // the prototype's times L_r, and Froude similarity says its drain times are
    // the prototype's times √L_r.
    //
    // GRID-EXACT, OR IT IS NOT A SCALE MODEL. Every base dimension is a
    // multiple of 20 cells at Medium (Δx = 0.02 m exactly: 9.5 × 4.0 m on
    // the 95 000-cell budget gives 475 × 200), and L_r moves in steps of 0.05,
    // so every scaled edge lands on a cell face — the L_r = ¼ slot is exactly
    // 5 cells. Measured before snapping: an unsnapped slot rounds by up to
    // ±½ cell per edge and moved the drain time by 7% between two copies of
    // the SAME tank drawn at different x. Coordinates are still snapped to the
    // live Δx (SIM.get(), which build() assigns before rasterise() calls
    // this), so another Resolution gives the best similar drawing it can.
    //
    // WHY THE NUMBERS (measured headless, Medium, depth gauges at the
    // quarter-width, marks d = 2.5 → 1.0 m scaled by L_r): prototype window
    // T_p = 4.06 s; the model drains FASTER than √L_r·T_p by 9.3% at L_r = ¼,
    // falling steadily to 2.9% at L_r = 0.65. Not compressibility (c = 80
    // changes it by <0.5%), not Smagorinsky (cs = 0: <0.3%), not wall
    // friction (cf = 0: <0.2%), not the outfall under the shaft (a fixed-
    // height pedestal changes nothing). At High the L_r = ½ residual vanishes
    // (+1.2%) while L_r = ¼ stays near −9.7% — a resolution effect that the
    // smallest model has not grown out of: this solver's version of a scale
    // effect. (These tanks were DA-2, now retired; the numbers stay as the
    // record of the grid effect. The menu scene is fluid-tanks below.)
    //
    //  c = 40, not the default 25: at 25 the prototype's jet (≈ 7 m/s) runs
    //  at Mach 0.28 and adds ≈ 1% of its own; 40 halves that at 1.6× the
    //  cost. The shafts drain through an OUTFALL floor (open = 2): with the
    //  zero-gradient floor (1) the shafts filled and drowned both slots
    //  within 2 s, and the tanks then took minutes to empty.
    ...(() => {
      const TW = 0.4, B = 4.0, T = 0.4, ZF = 0.8, H0 = 2.8, FB = 0.4, A = 0.4, SH = 1.2;
      const XP = 0.2, XM = 5.2;
      const snap = (v) => {
        const S = typeof SIM !== "undefined" && SIM.get ? SIM.get() : null;
        const dx = S && S.dx ? S.dx : 0.02;
        return Math.round(v / dx) * dx;
      };
      const lamOf = (par) => (par && par.lam !== undefined ? par.lam : 0.25);
      // One tank, scale s, outer left wall at X. Two solids, because the slot
      // splits the U in two: each is a wall, its half of the floor, and a leg
      // down to z = −0.5 either side of the shaft under the slot.
      const tank = (X, s, tag, name) => {
        const u = (v) => snap(X + s * v);
        const xi0 = u(TW), xi1 = u(TW + B), xo1 = u(2 * TW + B);
        const s0 = u(TW + B / 2 - A / 2), s1 = u(TW + B / 2 + A / 2);
        const sh0 = u(TW + B / 2 - SH / 2), sh1 = u(TW + B / 2 + SH / 2);
        const zb = snap(s * (ZF - T)), zf = snap(s * ZF), zt = Math.min(snap(s * (ZF + H0 + FB)), 4.0);
        const Xs = snap(X);
        const L = GEOM.poly([[Xs, -0.5], [sh0, -0.5], [sh0, zb], [s0, zb], [s0, zf], [xi0, zf], [xi0, zt], [Xs, zt]],
          [{ id: "floor", label: name + ": floor (left of the slot)", e0: 4, e1: 4 },
           { id: "wall", label: name + ": left wall", e0: 5, e1: 5 }], tag + "L");
        const R = GEOM.poly([[sh1, -0.5], [xo1, -0.5], [xo1, zt], [xi1, zt], [xi1, zf], [s1, zf], [s1, zb], [sh1, zb]],
          [{ id: "wall", label: name + ": right wall", e0: 3, e1: 3 },
           { id: "floor", label: name + ": floor (right of the slot)", e0: 4, e1: 4 }], tag + "R");
        return { solids: [L, R], valve: [s0, (zb + zf) / 2, s1, (zb + zf) / 2, zf - zb],
                 inside: (x, z) => x > xi0 && x < xi1 && z > zf, level: zf + s * H0 };
      };
      const proto = () => tank(XP, 1, "proto", "Prototype");
      const model = (par) => tank(XM, lamOf(par), "model", "Model");
      const scaleTanks = {
        id: "scale-tanks", name: "Two tanks at two scales", key: "Froude time scale", group: "Similitude",
        blurb: "A 4 m tank and an exact scale copy, each draining through a slot in its floor. Press V to open both at once: which empties first, and by how much?",
        W: 9.5, H: 4.0, c: 40, cf: 0.01, cs: 0.12, mode: 0, hmax: 3.0, headMax: 3.6, vmax: 7,
        open: [0, 0, 2, 0], valveOpen: 0, particles: 0, spinup: 0,
        params: [
          { key: "lam", label: "Length ratio L_r", min: 0.25, max: 0.70, step: 0.05, value: 0.25, unit: "", resetWater: true },
        ],
        solids: (W, H, P, par) => [...proto().solids, ...model(par).solids],
        valves: (W, H, par) => [proto().valve, model(par).valve],
        water: (x, z, P, par) => {
          const p = proto(), m = model(par);
          if (p.inside(x, z)) return still(p.level, z, P);
          if (m.inside(x, z)) return still(m.level, z, P);
          return 0;
        },
        tips: ["Press <b>V</b> to open both slots at the same instant.",
               "The right-hand tank is the left one scaled by L_r: every length, the slot and the fill depth. Change L_r in Controls → Geometry (it restarts the water).",
               "Gauges on <b>Depth d</b> read the water depth above each tank's floor; expand a gauge card (⤢) and hover its trace to read times.",
               "Froude scaling: lengths × L_r, velocities × √L_r, times × √L_r, discharge per metre × L_r^1.5."] };

      // DA-1: the same pair of tanks, run once in water and once in honey
      // (ν = 0.03 m²/s). Froude scaling holds in water and fails in honey, because the
      // model's Reynolds number falls with L_r^1.5 while the prototype's
      // stays high: viscosity is the force the model does not scale.
      //
      // 8.75 m wide, not 9.5, so that Very high (350 000 cells) is Δx =
      // 0.01 m exactly and every scaled edge is a whole cell (the widest
      // model, L_r = 0.7, ends at x = 8.56 m). Measured headless at Very
      // high, L_r = ½, marks d = 2.5 → 1.0 m (× L_r in the model):
      //
      //   water  ν = 1e-6   T_p = 4.105 s  T_m = 2.860 s  ratio 0.697  (√½ = 0.707, −1.5%)
      //   honey  ν = 3e-2   T_p = 3.975 s  T_m = 3.281 s  ratio 0.825  (+16.7%)
      //
      // At ν = 1e-2 the ½ model still follows Froude (−0.8%); at 1e-1 the
      // prototype slows too and the model has not reached its lower mark
      // within 7 s. 3e-2 is the value where only the smaller tank breaks.
      //
      // The fluid is a Geometry slider because a scene param is the only
      // per-scene control that reaches the solver: solids() gets the live
      // hydraulic parameters P and sets P.nu from it on every rasterise
      // (load, resolution rebuild, and the resetWater a fluid change makes).
      const NU = [1e-6, 3e-2];
      const fluidTanks = {
        id: "fluid-tanks", name: "Two tanks, two fluids", key: "Froude and viscosity", group: "Similitude",
        blurb: "A 4 m tank and its half-scale copy, filled with water or with honey. In water the model drains in √½ of the prototype's time; in honey it does not.",
        W: 8.75, H: 4.0, c: 40, cf: 0.01, cs: 0.12, nu: NU[0], mode: 0, hmax: 3.0, headMax: 3.6, vmax: 7,
        open: [0, 0, 2, 0], valveOpen: 0, particles: 0, spinup: 0,
        params: [
          { key: "lam", label: "Length ratio L_r", min: 0.25, max: 0.70, step: 0.05, value: 0.5, unit: "", resetWater: true },
          { key: "fluid", label: "Fluid", min: 0, max: 1, step: 1, value: 0, unit: "", resetWater: true,
            fmt: (v) => (v > 0.5 ? "honey, ν = 0.03 m²/s" : "water, ν = 10⁻⁶ m²/s") },
        ],
        solids: (W, H, P, par) => {
          P.nu = par && par.fluid > 0.5 ? NU[1] : NU[0];
          return [...proto().solids, ...model(par).solids];
        },
        valves: scaleTanks.valves,
        water: scaleTanks.water,
        tips: ["Press <b>V</b> to open both slots at the same instant.",
               "Controls → Geometry: <b>Fluid</b> switches both tanks between water and honey (it restarts the water); <b>Length ratio L_r</b> resizes the model.",
               "Gauges on <b>Depth d</b> read the depth above each tank's floor; expand a gauge card (⤢) and hover its trace to read times.",
               "Froude predicts T_m = √L_r · T_p in any fluid. It holds only while viscosity is negligible in BOTH tanks."] };
      // scale-tanks itself left the menu with DA-2; fluid-tanks reuses its
      // valves and water and, with Fluid on water, is the same experiment.
      return [fluidTanks];
    })(),

    // DA-3: a closed rectangular tank released from a first-mode tilt,
    // η = d + a·cos(πx'/B). Dimensional analysis gives T√(g/d) = φ(B/d, a/d);
    // linear theory is T = 2π/√(gk·tanh kd), k = π/B, with Merian's
    // T = 2B/√(gd) as the shallow limit.
    //
    // a is a slider in units of d (the Π group itself), and it cannot go
    // small: surface waves here are damped by RESOLUTION (engineering notes,
    // "Surface waves are damped by RESOLUTION"), so a tilt of one cell dies
    // in two periods. a/d = 0.2 rings for five. Its own effect on the period
    // is a few per cent — see the DA-3 README for the measured table.
    //
    // The tank is one U polygon: inner faces snapped to the live Δx, so B
    // and d are whole cells at any Resolution. Closed on all four edges and
    // walled to the lid, so nothing leaves. 9 × 2.6 m gives Δx = 15.7 mm at
    // Medium. spinup 0: the slosh IS the experiment, and R releases it again.
    (() => {
      const XL = 0.3, FL = 0.2;
      const snap = (v) => {
        const S = typeof SIM !== "undefined" && SIM.get ? SIM.get() : null;
        const dx = S && S.dx ? S.dx : 0.02;
        return Math.round(v / dx) * dx;
      };
      const dims = (par) => {
        const B = par && par.B !== undefined ? par.B : 4, d = par && par.d !== undefined ? par.d : 1;
        const ad = par && par.ad !== undefined ? par.ad : 0.2;
        const xl = snap(XL), xr = snap(XL + B), fl = snap(FL);
        return { xl, xr, fl, B: xr - xl, d, a: ad * d };
      };
      return {
        id: "slosh-tank", name: "Sloshing tank", key: "Period of a standing wave", group: "Similitude",
        blurb: "A closed tank released from a tilted surface. How does the sloshing period depend on the tank's length and depth?",
        W: 9.0, H: 2.6, c: 25, cf: 0.01, mode: 0, hmax: 1.4, headMax: 1.6, vmax: 1.5,
        open: [0, 0, 0, 0], particles: 0, spinup: 0,
        params: [
          { key: "B", label: "Tank length B", min: 1, max: 8, step: 0.5, value: 4, unit: "m", resetWater: true },
          { key: "d", label: "Water depth d", min: 0.25, max: 1.2, step: 0.05, value: 1, unit: "m", resetWater: true },
          { key: "ad", label: "Initial tilt a/d", min: 0.05, max: 0.3, step: 0.05, value: 0.2, unit: "", resetWater: true },
        ],
        solids: (W, H, P, par) => {
          const t = dims(par), top = H + 0.5;
          return [GEOM.poly([[-0.5, -0.5], [W + 0.5, -0.5], [W + 0.5, top], [t.xr, top], [t.xr, t.fl],
                             [t.xl, t.fl], [t.xl, top], [-0.5, top]],
            [{ id: "right", label: "Right wall", e0: 3, e1: 3 },
             { id: "floor", label: "Floor", e0: 4, e1: 4 },
             { id: "left", label: "Left wall", e0: 5, e1: 5 }], "tank")];
        },
        water: (x, z, P, par) => {
          const t = dims(par);
          if (x <= t.xl || x >= t.xr || z <= t.fl) return 0;
          return still(t.fl + t.d + t.a * Math.cos(Math.PI * (x - t.xl) / t.B), z, P);
        },
        tips: ["The surface starts tilted and is released at t = 0; press <b>R</b> to release it again.",
               "Controls → Geometry sets the tank length B, the depth d and the tilt a/d; each change restarts the slosh.",
               "A <b>Depth d</b> gauge against the left wall records the slosh; expand it (⤢) and hover the trace to time the peaks.",
               "Long shallow tanks follow Merian's T = 2B/√(gd); in deep tanks the depth stops mattering."] };
    })(),

    { id: "sandbox", name: "Sandbox", key: "Draw the hydraulics", group: "Sandbox",
      blurb: "Water falls in at the top left. Left-drag to draw edges and route it; right-drag for a big flow.",
      W: 9, H: 5, c: 22, cf: 0.02, hmax: 1.2, vmax: 5,
      // The floor drains. Sealed, the box simply fills: the spout puts in
      // ~0.39 m²/s and after two minutes the water has risen to the spout
      // itself (72% full) and drowned both ledges, so the sandbox settles
      // into a still block instead of a flow you can route. Only water that
      // reaches the domain floor leaves — a tank you draw yourself still
      // holds, because you drew its bed.
      // Mode 1 (zero-gradient), not 2 (outfall): an outfall ghost is held
      // EMPTY, which under standing water is an unopposed hydrostatic
      // gradient — the exchange face saturates at the transport cap
      // (0.20 Δx/Δt) and drags a reverse flow in behind it. That is fine at
      // a brink, where the sheet is thin and already near critical, and
      // wrong under a pool. Mode 1 mirrors the interior, so the floor
      // bleeds at the free-fall rate instead.
      open: [0, 0, 1, 0],
      source: { on: 1, x: 0.55, z: 4.55, r: 0.14, vx: 1.1, vz: -1.4 },
      // The second ledge starts at 3.4, not 4.2. Water leaves the first at
      // (3.2, 2.9) doing ~2.3 m/s and lands 0.50 m on at x ≈ 3.70, so a ledge
      // beginning at 4.2 is never touched — with the floor draining, the
      // whole right-hand half of the box stayed bone dry. It only looked like
      // a cascade before because the sealed box flooded up to meet it. The
      // extra 0.3 m upstream of the landing point is there to catch the
      // backward splash, which otherwise spills off the leading edge.
      walls: () => [
        [0.9, 3.4, 3.2, 2.9, 0.08],
        [3.4, 2.55, 6.8, 2.0, 0.08],
      ],
      tips: ["Left-drag draws a straight edge — build chutes, weirs, pipes.",
             "Right-drag pours a much larger flow wherever you point.",
             "The <b>Spout</b> tool (4) drags the falling inflow anywhere; its velocity is in Controls.",
             "<b>Wheel</b> zooms, <b>middle-drag</b> pans, <b>0</b> resets the view.",
             "Hold <b>shift</b> while drawing to snap to 0° / 45° / 90°.",
             "Controls has everything the scenes use: reservoir, tailwater, open edges, the wave piston.",
             "Close a pipe off completely and the water pressurises: watch the gold sheen."] },

    // ------------------------------------------------- MILD  (S₀ < S_c)
    // THE mild channel, shared by m1, m2, m3's apron and sa1: S₀ = 1 in 250,
    // C_f = 0.25, q = 0.25. Measured (Medium, Average mode): delivered
    // n ≈ 0.031, d_n ≈ 0.25–0.27 against d_c = 0.185, so d_n/d_c ≈ 1.4. It
    // used to be 1 in 68 at C_f = 0.125, mild only because the old surface
    // drag delivered n ≈ 0.08; with a stress-free surface and the bed
    // carrying the resistance, 1 in 68 is a CRITICAL slope (c13 now runs at
    // 1 in 57), and no C_f on the panel gets a log-law bed past n ≈ 0.04.
    //
    // m1 keeps its bed DRAWN (one rasterised step every 3.2 m) rather than
    // tilted like m2: the pool behind the weir is level, and a level surface
    // on a drawn bed sits exactly on a cell boundary, so GV-1's surface
    // readings are not touched by the one-cell terracing a sloping steady
    // surface shows (docs/engineering-notes.md, "Steady surfaces terrace").
    // inletDepth is the MEASURED pool depth arriving at the inlet (the M1
    // does not decay to d_n within this reach): pinned lower, the boundary
    // chokes the backwater and sheds ripples. Measured: the pool deepens
    // 0.49 → 0.54 m from the inlet to the weir, M1 from x = 1.3 m to the
    // weir face, d_n 0.249, settled by 28 s.
    Object.assign(channel({
      W: 16, H: 1.05, bed0: 0.35, S0: 0.004, cf: 0.25, q: 0.25,
      inletDepth: 0.49, weir: { x: 13.4, h: 0.25, w: 0.7 }, xEnd: 14.6,
      mode: 0, hmax: 0.55, vmax: 2.0, spinup: 30, dyeLine: 0.9,
    }), {
      id: "m1", name: "M1 · backwater behind a weir", key: "Mild, zone 1",
      blurb: "A weir on a mild slope holds the depth above normal depth all the way upstream — the M1 backwater curve.",
      tips: ["The weir is the control; the curve is computed <i>upstream</i> from it.",
             "The surface stays above d_n (green) everywhere — zone 1, so M<b>1</b>.",
             "Backwater length scales as d_n/S₀. Drop the roughness and it stretches.",
             "Erase the weir and the same channel relaxes towards M2."] }),

    // tilt: flat bed + tilted gravity, because at M2's working depth the
    // rasterised bed staircase excites standing waves the demo cannot absorb,
    // and a 1 in 250 bed drawn would put a step only every 3.2 m.
    // inletDepth is the depth the arriving profile actually wants — the
    // depth measured just clear of the inlet, 0.265, since at 1 in 250 the
    // drawdown reaches back past it. Pin it lower and the inlet chokes and
    // sheds ripples for ever (with the old physics: 37 mm of surface
    // fluctuation at x = 1.3 m against 17 mm once the level matched).
    //   Measured (Medium, Average mode): one M2 run from the inlet to 12.2 m,
    // d_n 0.24–0.25 against d_c 0.184, n 0.030–0.032; the velocity profile is
    // fastest at the surface, u(0.6d)/V = 1.02–1.03, α = 1.17–1.19. Settled
    // by 30 s (it took 85 s when the surface carried the resistance).
    Object.assign(channel({
      W: 16, H: 0.95, bed0: 0.35, S0: 0.004, cf: 0.25, q: 0.25,
      inletDepth: 0.265, xEnd: 13.6, tilt: true,
      hmax: 0.45, vmax: 2.0, spinup: 30, dyeLine: 1.2,
    }), {
      id: "m2", name: "M2 · drawdown to a free overfall", key: "Mild, zone 2",
      blurb: "The same mild channel ending in a brink. The surface is drawn down through critical depth at the lip — the M2 curve.",
      tips: ["Colour is Froude number: blue subcritical, red supercritical.",
             "The brink forces critical depth, so the control is downstream.",
             "The surface sits between d_n and d_c — zone 2, so M<b>2</b>.",
             "Dye timelines are on: the shear in each line <i>is</i> the velocity profile."] }),

    // Zone 3 comes from a DROP, not from a gate. A sluice gate that is even
    // slightly drowned puts a recirculating roller straight on top of its own
    // jet, and then the depth-averaged Froude number never reads supercritical
    // — physically right, but useless as a demonstration. Water falling off a
    // drop lands as a free sheet with air above it, so the zone-3 reach is
    // real, visible and long enough to name.
    drop({
      id: "m3", name: "Jump onto a mild apron", key: "Chute → jump → M2",
      blurb: "A chute delivers a supercritical sheet onto a mild bed. It cannot stay there: a hydraulic jump takes it back to subcritical, and the apron beyond runs M2.",
      // The mild channel of m1/m2 on the apron (tilted, as m2), ending in a
      // free overfall like m2's rather than a tailwater: the brink draws the
      // apron down to d_c, so beyond the jump it is M2 by construction. With a
      // tailwater the window was 1.3 d_c ≤ tail < d_n — 0.24 to 0.255 m — and
      // the outlet could settle as a weir instead of a level (see drop()).
      //   MEASURED (Medium, Average mode): S2 on the chute, the sheet landing
      // at 0.10 m and running M3 to x ≈ 6.9 m, the jump there, then M2 at
      // 0.24 m to the lip; settled by 20 s at Low and at Medium. The jump box
      // reads d₂ ~20% under Bélanger: its d₁ is the THINNEST section, at the
      // start of that long M3, not the depth the roller actually takes in.
      W: 16, H: 1.7, hi: 0.85, lo: 0.35, xa: 1.5, xb: 4.0, S0: 0.004, tilt: true,
      cf: 0.25, cs: 0.06, q: 0.25, inletDepth: 0.30, xEnd: 14.6,
      hmax: 0.5, vmax: 4, spinup: 25,
      tips: ["Supercritical on the chute, subcritical on the apron — the jump is the only way across.",
             "The jump box compares the measured d₂ against ½d₁(√(1+8Fr₁²) − 1).",
             "Before the jump the sheet thickens along the apron below d_c: M<b>3</b>.",
             "Past the jump the depth sits between d_n and d_c: that reach is M<b>2</b>, drawn down to the brink.",
             "Turn on a tailwater in Controls and raise it: the jump marches upstream onto the chute."] }),

    // Same mild channel as m1/m2 (1 in 250, C_f = 0.25, q = 0.25), built for
    // a reach with NO slope break and NO close control: the inlet is pinned at
    // the measured normal depth so the profile starts flat and STAYS flat for
    // a long way before the brink pulls it down.
    // tilt: true for the same reason as m2 — but tilt has a consequence a
    // gauge-reading exercise has to respect: with the bed drawn flat, the
    // raw column/probe z does NOT carry the S₀·x the geometry represents —
    // main.js's gauge readout and OVERLAY's S₀/S_f already add tiltS0·x
    // back in, and any OTHER headless reader of `surf`/`z` on a tilted scene
    // must do the same or its "head fall" is off by S₀·L.
    //   MEASURED (Medium, Average mode): uniform at 0.268 m from x ≈ 4 to
    // 11 m, d_n 0.26–0.27 against d_c 0.184, n 0.031–0.033; the profile is a
    // log law (fitted κ 0.41–0.43) with u(0.6d)/V = 1.015–1.025 and α ≈ 1.18.
    // Settled by 37 s. NC-1's slope-area numbers were measured on the old
    // 1-in-68 channel and are not carried over (NC-1 is being retired).
    Object.assign(channel({
      W: 20, H: 0.95, bed0: 0.35, S0: 0.004, cf: 0.25, q: 0.25,
      inletDepth: 0.27, xEnd: 19, tilt: true,
      hmax: 0.45, vmax: 2.0, spinup: 40, dyeLine: 1.2,
    }), {
      id: "sa1", name: "Long mild reach", key: "Uniform, no break",
      blurb: "The same mild channel as M1/M2, run long and flat with the control pushed far downstream — a reach with no weir, no jump, and (nearly) no drawdown to measure against.",
      tips: ["Colour is Froude number: blue subcritical, red supercritical.",
             "The surface sits close to d_n almost everywhere — this is what uniform flow looks like.",
             "Only right at the far brink does the surface draw down through critical depth.",
             "Compare with M2: same channel, but here the drawdown is pushed out of sight."] }),

    // NC-2's gauging reach: a long, straight mild channel fed by a reservoir
    // whose LEVEL is the one knob, ending in a free overfall. Around 0.68 m
    // the reach runs ~0.4 m deep; around 1.33 m, ~0.9 m — either side of the
    // 0.75 m at which field practice changes from the 0.6-depth current-meter
    // rule to the 0.2/0.8 pair.
    //   The inflow stays PRESCRIBED-q: the head-driven reservoir boundary was
    // built to feed pipes, and feeding this channel it passed ~60% of the
    // discharge the level should deliver (0.25 of 0.38 m²/s, 0.93 of
    // 1.6) with a roller where the water left its sponge — measured at
    // Medium, with the sponge at 0.24 m and at 1.5 m. Instead `qOfLevel`
    // works out what a reservoir at that level delivers to THIS channel,
    // and the Reservoir level control writes it into Inflow q (main.js):
    // the brink holds critical depth at the lip, the M2 is integrated
    // upstream from it on the solver's own resistance (the log law, with the
    // wall function's z₀ ≈ Δx/4.5), and q is the discharge whose depth at the
    // inlet, plus its velocity head, is the level. The inlet then delivers
    // exactly the depth the drawdown wants there — pinned at normal depth
    // instead, it would stand above the M2 and spill into the reach.
    //   It is an M2 reach: the drawdown runs ~90 m upstream to 0.95 d_n, so the
    // depth falls gently all the way along, and a station reads d where it
    // stands. The start is that profile with a log-law u, so R after a level
    // change settles in seconds.
    (() => {
      const KAPPA = 0.41, BED = 0.20, S0 = 0.0025, G = 9.81, LEVEL = 0.68, XL = 35;
      const cell = () => {
        const S = typeof SIM !== "undefined" && SIM.get ? SIM.get() : null;
        return S && S.dx ? S.dx : 0.0238;
      };
      const Sf = (q, d, dx) => {
        const V = q / d, k = (Math.log(d / (dx / 4.5)) - 1) / KAPPA;
        return V * V / (G * d * k * k);
      };
      // The M2 from just upstream of the lip (1.02 d_c) back to the inlet,
      // as depths at 2 cm spacing from x = XL down to x = 0.
      const profile = (q, dx) => {
        const h = 0.02, n = Math.round(XL / h), out = new Float64Array(n + 1);
        const slope = (d) => (S0 - Sf(q, d, dx)) / (1 - q * q / (G * d * d * d));
        let d = 1.02 * Math.cbrt(q * q / G);
        out[n] = d;
        for (let k = n - 1; k >= 0; k--) {
          d -= h * slope(d - 0.5 * h * slope(d));
          out[k] = d;
        }
        return out;
      };
      const qOfLevel = (level, dx) => {
        dx = dx || cell();
        let lo = 0.01, hi = 4;
        for (let k = 0; k < 40; k++) {
          const q = 0.5 * (lo + hi), d = profile(q, dx)[0];
          if (BED + d + q * q / (2 * G * d * d) > level) hi = q; else lo = q;
        }
        return 0.5 * (lo + hi);
      };
      // One profile per level and grid, for the seed's hundred thousand calls.
      let memo = { key: "", q: 0, d: null };
      const seed = (P) => {
        const level = Number.isFinite(P.level) ? P.level : LEVEL, dx = cell();
        const key = level + ":" + dx;
        if (memo.key !== key) { const q = qOfLevel(level, dx); memo = { key, q, d: profile(q, dx) }; }
        return memo;
      };
      const depthAt = (m, x) => m.d[Math.max(0, Math.min(m.d.length - 1, Math.round(x / 0.02)))];
      const q0 = qOfLevel(LEVEL);
      const c = channel({ W: 36, H: 1.5, bed0: BED, S0, cf: 0.25, tilt: true, xEnd: XL,
                          q: q0, inletDepth: profile(q0, cell())[0], start: 0.43,
                          vmax: 2.4, dyeLine: 0 });
      return Object.assign({}, c, {
        id: "gauging", name: "Gauging reach", key: "Reservoir → channel → brink",
        mode: 2, hmax: 1.2, spinup: 40, qOfLevel,
        water: (x, z, P) => {
          if (x >= XL || z <= BED) return 0;
          return SCENES.still(BED + depthAt(seed(P), x), z, P);
        },
        flow: (x, z, P) => {
          if (x >= XL) return null;
          const m = seed(P), d = depthAt(m, x), h = z - BED;
          if (h <= 0 || h >= d) return null;
          const V = m.q / d, us = Math.sqrt(G * Sf(m.q, d, cell()) * d);
          return [Math.max(0, V + (us / KAPPA) * (1 + Math.log(h / d))), 0];
        },
        blurb: "A long, straight mild channel fed by a reservoir and ending in a free overfall. The reservoir level sets the flow: about 0.68 m runs the reach 0.4 m deep, about 1.33 m runs it 0.8–1.0 m deep — the place to try the current-meter rules against the whole profile.",
        tips: ["Colour is speed: where the reach has recovered from the inlet the water is fastest at the surface and slows towards the bed.",
               "Controls → Reservoir level sets the flow (Inflow q follows it). Press R after changing it: the reach restarts near its new steady state.",
               "A Rake (6) draws u against depth; its V is the full depth-integral of that curve.",
               "Gauges (5) on Speed read u at a point — put three at 0.2 d, 0.6 d and 0.8 d below the surface.",
               "Average (A) turns every reading into a time mean — what a current meter's count does."] });
    })(),

    // A dedicated entry, not through channel(): the hump IS the subject, and
    // channel() has no hump concept to bolt one onto. Approach bed at
    // z = 0.35, flat both sides of the crest (a mild reach, same bed level
    // m1/m2 use, but no slope — the point here is the crest, not the reach).
    //   d_c = (q²/g)^⅓ = 0.1854 m at q = 0.25. inletDepth 0.34 m is a
    // subcritical approach depth comfortably above d_c. The inflow level is
    // an ENERGY line, not the surface (see `inletLevel` above and
    // SIM.inletStage): the boundary solves E = d + q²/2gd² for the depth it
    // delivers, so the level that delivers d = 0.34 m is the surface plus its
    // velocity head — the same conversion channel() applies to every scene
    // built through it, written out here because this entry bypasses it:
    //   level = bed0 + d + q²/2gd² = 0.35 + 0.34 + 0.0276 = 0.7176 m.
    // (History: while this scene was built on the polygon-geometry branch the
    // inlet still pinned the SURFACE at `level`, so 0.69 was right then and
    // adding the velocity head measured 27 mm too deep. The energy-line inlet
    // landed with the reservoir-energy-line merge, and this is the revisit
    // that comment asked for: handing 0.69 to the new boundary would pin the
    // approach 28 mm under the depth it wants, which is the choked-inlet
    // ripple failure the engineering notes describe.)
    // Tailwater stands at bed0 + 0.30 = 0.65 m — a tail depth of 0.30 m
    // against d_c = 0.1854 m is 1.3 d_c ≈ 0.241 m clear, the AGENTS.md floor
    // for a subcritical downstream control.
    //   cf = 0.02, not m1/m2's 0.125: MEASURED headless that m1/m2's
    // roughness is tuned against their S₀ = 0.0147 slope, which carries most
    // of the friction loss on its own; on this hump's FLAT approach the same
    // 0.125 has nothing to balance it, and the reach backs up regardless of
    // the pinned level, eating the headroom this scene needs for the choke
    // and driving it past H at hump_h's top of range. At 0.02 the flat
    // approach (hump removed) settles right back on the pinned level — this
    // is the standard "flow over a bump" textbook problem, effectively
    // frictionless.
    { id: "hump", name: "Hump in a mild channel", key: "Specific energy",
      group: "Open channel — surface profiles", chan: 1,
      // H = 1.3, not 1.05: MEASURED at hump_h = 0.45 the choked approach
      // backs up to ~1.03-1.10 m (it oscillates — see the spin-up comment
      // below) — 1.05 m left as little as 15 mm of freeboard (water visibly
      // lapping the top wall). 1.3 m clears the worst of it by ~0.2 m. Not
      // sensitive to the inflow-level fix below: re-measured after that fix
      // at 1.094 m, same ballpark.
      W: 16, H: 1.3, c: 22, cf: 0.02, cs: 0.16, mode: 3,
      // hmax/vmax cover the choked case too: approach depth reaches ~0.74 m
      // and the crest sheet accelerates to Fr up to ~1.5 (~1.7 m/s at that
      // depth) — re-measured after the inflow-level fix below.
      hmax: 0.9, vmax: 3.0,
      // MEASURED headless (APP.tick, hump_h = 0.15, approach-pool probe at
      // x = 3 via OVERLAY.analyse — see task-7-report.md for the method):
      // sampled every 5 s of sim time to 120 s. The big move — the initial
      // still-water fill relaxing onto the arriving backwater — is over by
      // t = 10 s; what is left from there to 120 s is a persistent +-2-3%
      // surface wobble that never damps further, i.e. genuine unsteadiness
      // rather than a settling trend (the same distinction the channel()
      // comment above draws for venturi/hammer/h23's own short spin-ups) —
      // a probe ON the crest itself (near-critical by design) shows the same
      // wobble at 5-10x the relative amplitude and never reads "settled" by
      // this test, which is why the approach pool, not the crest, is the
      // station to read.
      //   Re-measured with the stress-free surface (issue #72), whole-reach
      // depth profile against its final shape (3% RMS): settled by 34 s, the
      // wobble gone. At the default 0.15 m the crest chokes — E₁ − E_c ≈
      // 0.09 m is less than the hump — so the approach backs up to 0.41 m,
      // the crest runs supercritical down its lee face and jumps back at
      // x ≈ 9 m before the tailwater.
      spinup: 35, dyeLine: 0.9,
      open: [1, 1, 0, 0],
      // 0.35 + 0.34 + 0.25²/(2·9.81·0.34²): the energy line that delivers d = 0.34.
      inflow: { level: 0.7176, q: 0.25, on: 1, free: 0 },
      tailwater: { level: 0.65, on: 1 },     // mild control downstream
      params: [{ key: "hump_h", label: "Hump height", min: 0, max: 0.45,
                 step: 0.005, value: 0.15, unit: "m" }],
      solids: (W, H, P, par) => {
        const h = par && par.hump_h !== undefined ? par.hump_h : 0.15;
        const zb = 0.35, x0 = 6.0, x1 = 10.0;
        // 0.005 m floor: a zero-height hump still has to close into a valid
        // polygon (two coincident crest runs would leave a zero-length face).
        const crest = GEOM.humpPts(x0, x1, Math.max(h, 0.005), zb, 160);
        // Close the solid down into the bed — below z = 0, where ground is
        // solid all the way down per AGENTS.md's geometry contract — left to
        // right along the crest, then straight down each end.
        //   bottom-left -> up -> over the crest LEFT TO RIGHT -> down ->
        // bottom-right -> close back to bottom-left is CLOCKWISE in this
        // z-up frame (shoelace area came out negative — checked by hand for
        // both this 163-vertex polygon and a 5-vertex toy version), so
        // reverse it to CCW. Reversing swaps the two vertical end edges
        // (index 0 <-> index n-2) but leaves the crest's own edge run sat at
        // [1, crest.length-1] either way — checked directly with
        // GEOM.edgeNormal after the reverse: every edge in that range comes
        // back with nz > 0 (min 0.993 across the 160 crest edges, dipping
        // only right at the two ends where the hump's slope is steepest),
        // i.e. genuinely outward and up, never into the water.
        const verts = [[x0, -0.5]].concat(crest).concat([[x1, -0.5]]).reverse();
        const e1 = crest.length - 1;
        return [GEOM.poly(verts, [{ id: "crest", label: "Hump crest",
                                     e0: 1, e1 }], "hump")];
      },
      walls: () => [[-1.0, 0.35 - 0.7, 17, 0.35 - 0.7, 1.4]],   // the flat bed, shim
      water: (x, z, P) => (z <= 0.35 ? 0 : SCENES.still(0.65, z, P)),
      blurb: "A mild channel with a smooth hump you can raise. The surface dips over the crest while E is to spare — and when the crest eats the margin, the flow chokes: upstream depth rises and the crest runs critical.",
      tips: ["Specific energy E = d + q²/2gd² is conserved along the bed until the crest takes more of it than the approach flow has to give.",
             "At a small hump the surface just DIPS — same E, shallower d, so higher speed over the crest.",
             "Raise the slider past h = E₁ − E_c and the crest can no longer pass the flow at the depth it arrived: the approach backs up instead.",
             "Watch the Froude colours at the crest — a choked hump runs Fr ≈ 1 right over the top.",
             "The Force tool on the crest face reads the pressure pushing back on the bed as the depth over it thins."] },

    // ------------------------------------------------ STEEP  (S₀ > S_c)
    // S₀ = 1 in 4 at q = 1.2 m²/s, C_f = 0.25. MEASURED (Medium, Average
    // mode): d_n ≈ 0.19–0.21 m under d_c = 0.53 m, n ≈ 0.03 — steep, and
    // steeper-running than it was (d_n 0.32, Fr 2.1) when the surface carried
    // most of the resistance; the chute still has not reached d_n by its
    // brink, so the measured d_n is the extrapolation d·(S_f/S₀)^⅓.
    // Every steep scene keeps its bed above z = 0 for the whole modelled
    // reach: where the slab sinks below the domain floor the water runs on
    // the floor instead, which is not the channel the scene is describing.
    Object.assign(channel({
      // tail 1.20 m (level 1.35), not the old 0.90: the sheet reaching the
      // foot of the chute runs d ≈ 0.26 m at Fr ≈ 3, whose conjugate is
      // ~0.96 m, and at 0.90 the jump washed out of the domain. (It only stood
      // at 0.90 while the tailwater edge ponded ~0.3 m above its own level —
      // the exchange-face bug fixed in FS_VEL with issue #72.)
      //   MEASURED: the jump at x ≈ 4.2–6.0 m, d₁ 0.26 at Fr₁ 2.9, d₂ 0.88
      // against Bélanger's 0.95 (−8%, the slope's weight component), then
      // S1 for the last 1.1 m. The roller keeps a 5–9% flutter in the mean
      // profile for good, so the spin-up is where the mean arrives (~15 s),
      // not where the flutter stops (never).
      W: 7, H: 2.8, bed0: 1.90, S0: 0.25, cf: 0.25, cs: 0.08, q: 1.2,
      inletDepth: 0.52, tail: 1.20, start: 0.30,
      hmax: 0.9, vmax: 5, spinup: 20,
    }), {
      id: "s1", name: "S1 · steep bed, drowned outlet", key: "Steep, zone 1",
      blurb: "A steep channel with the tailwater held above critical. The supercritical sheet jumps, and above the jump the surface climbs to the control — an S1 curve.",
      tips: ["On a steep bed d_n sits <i>below</i> d_c, so zone 1 means above both.",
             "The reach downstream of the jump, backed up by the tailwater, is S<b>1</b>.",
             "Lower the tailwater and the jump runs downstream out of the domain.",
             "Upstream of the jump the same channel is running S2."] }),

    Object.assign(channel({
      // MEASURED: S2 from the crest to the brink, d 0.47 → 0.23 m, settled by
      // 11 s; u(0.6d)/V = 1.01–1.07, α 1.11–1.26 (the reach is still
      // accelerating, so the log fit reads κ ≈ 0.3 rather than 0.41).
      W: 7, H: 2.4, bed0: 1.55, S0: 0.25, cf: 0.25, cs: 0.08, q: 1.2,
      inletDepth: 0.52, xEnd: 6.0, start: 0.30,
      hmax: 0.7, vmax: 5, spinup: 15,
    }), {
      id: "s2", name: "S2 · chute from a reservoir", key: "Steep, zone 2",
      blurb: "Water spilling from a reservoir onto a steep bed passes through critical at the crest and accelerates down towards normal depth — the S2 curve.",
      tips: ["The control is the crest at the top: critical depth sits at the entrance.",
             "The surface falls from d_c towards d_n from above — zone 2, so S<b>2</b>.",
             "Both d_c and d_n are drawn; note that d_n is the <i>lower</i> one here.",
             "Nothing downstream can influence this reach — it is supercritical throughout."] }),

    // 1 in 10, NOT the 1 in 4 of s1/s2. An S3 needs the jet from under the
    // gate thinner than d_n, and at 1 in 4 d_n is now ~0.2 m while a 0.35 m
    // gate's jet leaves at ~0.25 m (the reach read S2); a smaller gate cannot
    // pass q = 1.2 under the 1.4 m pool the domain has room for — at 0.14 m
    // the pool rose to the lid and pressurised. Easing the slope raises d_n
    // instead: MEASURED d_n 0.29, the jet leaving at 0.24 and climbing to 0.27
    // by the outlet, S3 from the gate to the end, settled by 11 s.
    //   The bed still has to stay above z = 0 for the whole reach (a bed that
    // sinks below the domain floor leaves water sliding on the floor and
    // draining out of the open bottom edge): 0.91 − 0.1 × 5.6 = 0.35.
    // inletDepth 1.60 is the pool the gate holds to pass q = 1.2, measured;
    // at the old 1.40 the pool piled 0.16 m above its own reservoir level and
    // reached the lid of a 2.5 m domain, hence H = 3.0.
    Object.assign(channel({
      W: 5.6, H: 3.0, bed0: 0.91, S0: 0.1, cf: 0.25, cs: 0.08, q: 1.2,
      inletDepth: 1.60, gate: { x: 1.2, a: 0.35 }, start: 0.28,
      hmax: 0.7, vmax: 6, spinup: 15,
    }), {
      id: "s3", name: "S3 · gate on a steep bed", key: "Steep, zone 3",
      blurb: "A gate opened tighter than normal depth. The flow leaves below d_n and climbs back up towards it — the S3 curve, with no jump anywhere.",
      tips: ["The opening is smaller than d_n, so the depth starts below <i>both</i> depths.",
             "The surface rises asymptotically towards d_n — zone 3, so S<b>3</b>.",
             "No jump anywhere: the flow is supercritical before and after, so none is needed.",
             "Erase the gate and redraw it wider than d_n and the same channel runs S2.",
             "This chute is 1 in 10, gentler than S1/S2's 1 in 4 — on the steeper bed d_n is too shallow for a gate to undercut it."] }),

    // ------------------------------------------ CRITICAL  (d_n = d_c)
    // The critical slope of THE channel (C_f = 0.25, q = 0.25), MEASURED on a
    // uniform tilted reach rather than computed: 1 in 83 runs d/d_c = 1.14
    // (M), 1 in 62 runs 1.04 (C), 1 in 50 runs 0.98 (C). 1 in 57 sits in the
    // middle of the ±5% C band; the old mild channel's 1 in 68 is next to it.
    //   A TAILWATER at 1.3 d_c ends the reach, not the old weir. On a critical
    // slope the C1 surface is horizontal, so the pool behind a control is
    // (its depth − d_c)/S₀ long: a broad-crested weir ponds ~1.5 d_c of head
    // above its own crest, which at 1 in 57 backed a C1 up the whole 11 m and
    // left nothing for the C3 (it worked at the old 1 in 8.5 only because the
    // slope was seven times steeper). The tailwater's 0.055 m above d_c is a
    // ~3 m C1.
    //   MEASURED (Medium, Average mode): C3 from the gate's jet (0.11 m) rising
    // to d_c by x ≈ 9.8 m, then C1 into the tailwater; d_n 0.185 against d_c
    // 0.183; steady and settled by 29 s. (The old scene was wavy, its
    // surface flutter growing 18 → 48 mm along the reach; that has not
    // reappeared, but a critical reach amplifies every disturbance — do not
    // count on it staying quiet under a changed setting.)
    Object.assign(channel({
      W: 12, H: 1.0, bed0: 0.56, S0: 0.0175, cf: 0.25, q: 0.25,
      inletDepth: 0.36, gate: { x: 1.5, a: 0.15 }, tail: 0.24,
      mode: 3, hmax: 0.45, vmax: 3.0, spinup: 30,
    }), {
      id: "c13", name: "C1 / C3 · critical slope", key: "d_n = d_c",
      labels: 0,
      blurb: "The knife edge: a slope where the measured normal depth equals critical depth. Zone 2 vanishes, and the depth hugs d_c along the whole reach.",
      tips: ["The slope is tuned so the <i>measured</i> d_n equals d_c — the dashed lines overlap.",
             "Below the gate is C<b>3</b>; backed up by the tailwater is C<b>1</b>. There is no zone 2.",
             "The middle of the reach rides Fr ≈ 1: the Froude colours sit right at the white break.",
             "Profile labels are off here by default: on a knife edge the class genuinely flickers between M, C and S. Turn them on in Controls to watch it.",
             "Drag the roughness down to 0.05 and the same reach turns steep — S3, S2, S1. A fifth of the roughness moves d_n only 9%: the knife edge."] }),

    // ------------------------------------------- HORIZONTAL  (S₀ = 0, d_n = ∞)
    drop({
      id: "h23", name: "Hydraulic jump on a level apron", key: "Chute → jump → H2",
      blurb: "A chute onto a flat apron: supercritical sheet, hydraulic jump, then an H2 drawdown to the tailwater. The clearest look at a jump in the set.",
      // q = 0.5, not 0.22, and the tailwater sits at 1.3 d_c rather than
      // exactly ON d_c. Two separate faults were being fixed:
      //  · tail 0.17 WAS d_c (0.170) to three figures. A subcritical level
      //    control cannot stand at critical depth — the outlet chokes and the
      //    one-cell Dirichlet fights the flow it is supposed to be setting.
      //    Just lifting it to 1.5 d_c cut the drift by half and the temporal
      //    flutter from 19% to 12%.
      //  · at q = 0.22 the apron ran ~12 cells deep, where the delivered
      //    roughness is enormous, so its backwater climbed 0.19 m over 3.5 m
      //    and drowned the jump back onto the chute: measured d₂ came out 65%
      //    ABOVE the conjugate depth, which is the one number this scene asks
      //    you to check. Deeper flow is the lever (not C_f — see s2, where
      //    15× the roughness moved d_n by 7%). At q = 0.5 the apron runs ~37
      //    cells deep, the jump stands free on the apron, and d₂ = 0.416 m
      //    against a predicted 0.438 — within 5%.
      //  · Since the surface stopped carrying the resistance (issue #72) the
      //    tailwater is the CONJUGATE depth, 1.75 d_c, not 1.3: the sheet
      //    lands on the apron at d₁ ≈ 0.155 m, Fr₁ ≈ 2.7, and a tailwater
      //    below its conjugate (~0.52 m) sweeps the jump out. MEASURED, the
      //    jump moves steadily with the tailwater — at 0.50 it stands at
      //    x ≈ 4.4–6.2 m with d₂ 2% under Bélanger, at 0.53 at 3.6–5.5 m 2.5%
      //    over, at 0.56 on the chute toe. At 0.52 it seats at x ≈ 5.5 m
      //    within 10 s and flutters ±0.1 m; the mean profile keeps a 3–5%
      //    flutter from the roller for good.
      //    (Before the tailwater edge's exchange-face fix, the outlet ponded
      //    up to ~0.3 m above its own level and the jump had no stable seat —
      //    swept out at 0.40, up the chute at 0.44 — which looked like a
      //    knife edge and was a boundary bug.)
      W: 7.5, H: 1.6, hi: 0.80, lo: 0.15, xa: 1.0, xb: 4.0, S0: 0,
      cf: 0.25, cs: 0.06, q: 0.5, inletDepth: 0.34, tail: 0.52,
      hmax: 0.65, vmax: 4, spinup: 20,
      tips: ["A horizontal bed has no normal depth — d_n is infinite, so there is no zone 1.",
             "The chute runs S2/S3; past the jump the level apron runs H<b>2</b>.",
             "The jump box reports d₁, d₂ and Fr₁ — check d₂/d₁ = ½(√(1+8Fr₁²) − 1).",
             "Energy loss across a jump is (d₂−d₁)³/(4d₁d₂); the EGL drops by exactly that.",
             "Raise the tailwater and the jump slides back up towards the drop."] }),

    // ------------------------------------------------ ADVERSE  (S₀ < 0)
    drop({
      id: "a23", name: "A2 · adverse apron", key: "Uphill",
      blurb: "The apron rises downstream. Gravity now opposes the flow, there is no normal depth, and only zones 2 and 3 exist.",
      // tail 0.16 was BELOW critical depth (d_c = 0.170) — a level control
      // asking for a depth the outlet cannot hold, so it choked at critical
      // and the Dirichlet argued with it. 1.53 d_c is a real control.
      // The other half of this scene's cure was the apron() slope bug above:
      // the drawn adverse slope was −0.0233 instead of −0.030, and with it
      // the domain volume swung ±15% on a ~60 s cycle that never settled.
      //   MEASURED (Medium, Average mode, tail 1.37 d_c): the jump stands on
      // the lower chute (x ≈ 2.2–4.0 m, d₁ 0.10 at Fr₁ 2.3) and the whole
      // apron runs A2, 0.36 m falling to the tailwater; the mean arrives by
      // ~20 s, with a 4–6% roller flutter for good. The A3 sheet the old scene
      // showed on the apron would need the jump pushed off the chute, and the
      // A2 that the adverse bed builds upstream of a 1.3 d_c tailwater is
      // already deeper (0.36 m) than the arriving sheet's conjugate (~0.30).
      W: 7.5, H: 1.7, hi: 0.85, lo: 0.12, xa: 1.0, xb: 4.0, S0: -0.03,
      cf: 0.25, cs: 0.06, q: 0.22, inletDepth: 0.28, tail: 0.24,
      hmax: 0.45, vmax: 4, spinup: 20,
      tips: ["The apron climbs, so S₀ is negative and uniform flow is impossible — no d_n.",
             "Past the jump, running uphill against gravity, the apron is A<b>2</b>.",
             "A2 steepens as it goes: an adverse bed cannot sustain the flow for long.",
             "The jump sits on the chute: the climbing apron backs the water up onto it. Lower the tailwater and watch it try to get out."] }),

    // ------------------------------------------------------- hydrostatics
    // A dyke between two reservoirs with a culvert under it, shut by a valve,
    // and a piezometer tapped into the culvert roof. The geometry is three
    // polygons and nothing else: in a vertical section any passage from one
    // basin to the other separates the solid above it from the solid below,
    // and the piezometer slot splits the upper part again — so a ground slab
    // and two dyke blocks standing on the culvert is the honest 2D section
    // through a bottom outlet, not a simplification of one.
    //
    // Shape from the lecturer's sketch: the upstream face is a short vertical
    // toe and then a slope up to the crest — an embankment, not a wall — so
    // the Pressure force tool reads a resultant with a real vertical part
    // (the weight of the water standing on the slope) as well as the ½ρg·d²
    // horizontal one. The culvert is tall enough to be a channel in its own
    // right rather than a pipe.
    //
    // Levels: 3.50 m left, 2.60 m right, both well above the culvert roof at
    // 1.10 m, so the culvert stays drowned throughout. The right basin is
    // narrow so it fills in seconds when the valve opens; the common level
    // follows from the volume the left body loses (its plan area shrinks as
    // it drops down the slope) — 3.32 m here, measured and closed-form.
    // The ground top sits at 0.50 m (the lecturer's trim, Oct 2026: it was
    // 1.00 m and the frame ran under the controls); everything above it kept
    // its own dimensions and moved down 0.50 m with it.
    //
    // nu is an EDDY viscosity, not water's. At the stock 1e-5 the jet that
    // fills the small basin leaves a trapped eddy that never dies: 0.2 m/s
    // RMS in both basins 60 s after V with the levels long since equal, and
    // still 0.1 m/s at 150 s — a hydrostatics demo whose water will not
    // stand still. Raising C_s to 0.4 or C_f to 0.05 barely moved it; 1e-3
    // took the basins to 4 mm/s by 60 s, 2e-3 to under 5 mm/s by 45 s with
    // the fill itself unchanged (culvert RMS 0.33 m/s at 12 s either way).
    { id: "dyke", name: "Dike with a piezometer", key: "Hydrostatics",
      group: "Hydrostatics",
      blurb: "Two reservoirs at different levels either side of a dike, joined by a culvert under it with a shut valve and a piezometer tube in its roof. Read the levels and the face forces, then press V and watch the water find one level.",
      W: 6.0, H: 4.6, c: 25, cf: 0.01, cs: 0.16, nu: 2e-3, mode: 0,
      hmax: 4.2, headMax: 3.3, vmax: 4,
      valveOpen: 0, particles: 1,
      open: [0, 0, 0, 0],
      solids: () => {
        const zg = 0.50, zr = 1.10, zc = 3.80;            // ground top, culvert roof, crest
        const xt = 2.40, zt = 1.90, xs = 3.30;            // toe, top of the toe, slope meets crest
        const s0 = 4.30, s1 = 4.50, x1 = 5.20;            // piezometer slot, downstream face
        return [
          GEOM.rect(-0.5, -0.5, 6.5, zg, { id: "ground",
            faces: [{ id: "top", label: "Ground", e0: 2, e1: 2 }] }),
          // CCW: along the culvert roof, up the piezometer wall, back along
          // the crest, down the slope, down the toe.
          GEOM.poly([[xt, zr], [s0, zr], [s0, zc], [xs, zc], [xt, zt]],
            [{ id: "roof", label: "Culvert roof (upstream block)", e0: 0, e1: 0 },
             { id: "piezo", label: "Piezometer wall", e0: 1, e1: 1 },
             { id: "crest", label: "Crest", e0: 2, e1: 2 },
             { id: "us", label: "Upstream face (slope and toe)", e0: 3, e1: 4 }], "dykeL"),
          GEOM.rect(s1, zr, x1, zc, { id: "dykeR",
            faces: [{ id: "ds", label: "Downstream face", e0: 1, e1: 1 },
                    { id: "roof", label: "Culvert roof (downstream block)", e0: 0, e1: 0 },
                    { id: "piezo", label: "Piezometer wall", e0: 3, e1: 3 },
                    { id: "crest", label: "Crest", e0: 2, e1: 2 }] }),
        ];
      },
      valves: () => [[5.00, 0.50, 5.00, 1.10, 0.08]],   // across the culvert, downstream of the tap
      water: (x, z, P) => (z <= 0.50 ? 0
                           : x < 5.00 ? still(3.50, z, P)   // left basin, culvert, piezometer
                           : still(2.60, z, P)),            // right basin
      tips: ["Three water surfaces, one level: the left reservoir, the culvert and the piezometer tube are one connected body of still water.",
             "Pick the <b>Pressure force</b> tool and click a face of the dike: the pressure grows with depth, and the sideways force is ½ρg·d².",
             "The sloped upstream face also carries the weight of the water standing on it, pushing down; the vertical downstream face does not.",
             "Press <b>V</b> to open the valve. The small right reservoir fills; once the water is still, every surface stands at one level.",
             "When all is still again — about 45 s — both faces carry the same sideways force: the dike feels no net push."] },

    // -------------------------------------------- pressure and transients
    // A real pipeline, not a lab flume: the static head has to exceed the
    // Joukowsky surge or the downsurge simply cavitates. 49 m of 3 m bore
    // under ~21 m of head, throttled by a nozzle to about 2.8 m/s.
    { id: "hammer", name: "Water hammer", key: "Joukowsky",
      group: "Pressure & transients",
      blurb: "A reservoir feeding a full pipe through a nozzle. Slam the valve and the pressure wave runs back and forth at the slot celerity.",
      W: 60, H: 30, c: 70, cf: 0.004, cs: 0.05, bulk: 0.03, nu: 1e-4,
      valveOpen: 1, particles: 1, spinup: 10,   // measured: bore established by 7 s
      mode: 1, headMax: 42, hmax: 22, vmax: 6,
      open: [1, 1, 0, 0],
      spongeIn: 5.5,                           // hold the whole reservoir tank
      inflow: { level: 25.0, q: 0, on: 1, free: 1 },
      params: [
        { key: "nozzle_gap", label: "Nozzle width", min: 0.14, max: 0.84,
          step: 0.02, value: 0.40, unit: "m", resetWater: true },
      ],
      walls: (W, H, par = {}) => {
        const gap = par.nozzle_gap === undefined ? 0.40 : par.nozzle_gap;
        return [
          [0.0, 1.0, 58.5, 1.0, 2.0],              // invert — top face at z = 2.0
          [6.0, 5.35, 58.5, 5.35, 0.7],            // soffit — 3 m clear bore
          [6.0, 5.0, 6.0, 30.0, 0.7],              // reservoir wall above the pipe
          [56.5, 2.0, 56.5, 3.5 - gap / 2, 0.5],   // nozzle plate around the …
          [56.5, 3.5 + gap / 2, 56.5, 5.0, 0.5],   // … adjustable clear width
        ];
      },
      valves: () => [[55.0, 2.0, 55.0, 5.0, 0.5]],
      water: (x, z, P) => (x < 5.6 || (z > 2.0 && z < 5.0) ? still(25.0, z, P) : 0),
      tips: ["Drop a <b>gauge</b> on the pipe, then press <b>V</b> to slam the valve.",
             "The nozzle width in Controls → Geometry sets the steady pipe velocity; changing it restarts the water.",
             "Upsurge is ΔH = c·Δv/g ≈ 20 m on top of 21 m static — read it off the trace.",
             "The trace is a square wave of period 4L/c ≈ 2.8 s. Halve c and it halves too.",
             "Push the celerity past ~90 m/s and the downsurge hits zero: column separation.",
             "Set wave damping to zero and the oscillation never dies."] },

    // ------------------------------------------------- hydropower scheme
    // Reservoir → level headrace → surge shaft at the knee → penstock down to
    // a power house, where a nozzle sets the discharge and a valve stands in
    // for the turbine's instantaneous shutdown (exercise HP-3). Slam the valve
    // and the headrace column has nowhere to go but up the shaft: the rigid-
    // column mass oscillation, with the shaft's steady drawdown y₀ = k·u₀²
    // measuring the headrace friction directly, as a piezometer would.
    //
    // EVERY SOLID IS BUILT FROM THE PARAMS. The knee (x, z), the three bores
    // and the nozzle gap are Geometry sliders and ride the rig, so the
    // penstock's two walls are mitred against the headrace invert, the
    // shaft's right wall and the level tailpipe (`geom` below), and the valve
    // and the initial water follow the same geometry — which is why
    // rasterise() and resetWater() hand `params` to valves() and water().
    //
    // Scale (measured — docs/engineering-notes.md, "Hydropower scheme"): a
    // 42 m headrace of 3 m bore under 25 m of reservoir, a 0.48 m nozzle, a
    // 35 m domain so that a 2 m shaft's upsurge still clears the roof. c = 70
    // as hammer: the Joukowsky surge in the penstock, c·u_p/g, has to stay
    // under the ~22 m of static head at the valve or the downsurge cavitates,
    // and that caps the penstock velocity — the reason the default penstock
    // bore is 2.4 m against a 3 m headrace rather than the figure's 3 : 7.7.
    (() => {
      const W = 70, H = 35;
      const XR = 8.0, TW = 0.7;     // reservoir wall centreline and thickness
      const XO = 60.0, ZO = 3.0;    // lower knee: the penstock meets the level tailpipe
      const XV = 63.5, XN = 65.0;   // valve station, nozzle station
      const LEVEL = 25.0;
      const DEF = { knee_x: 50, knee_z: 14, d_head: 3.0, d_pen: 2.4, d_shaft: 3.0, gap: 0.48 };
      const val = (par, k) => (par && par[k] !== undefined ? par[k] : DEF[k]);

      /** Everything the geometry needs, from the params. The penstock is a
       *  slab of bore Dp along the axis knee → (XO, ZO); its upper and lower
       *  wall lines are intersected with the surfaces they run into:
       *    A  lower wall meets the headrace invert     B  … the tailpipe invert
       *    C  upper wall leaves the shaft's right wall  D  … meets the tailpipe soffit
       *  Three big solids (ground, headrace roof, penstock roof) plus the two
       *  nozzle plates; the shaft is the gap between the two roofs. All CCW. */
      const geom = (par) => {
        const xk = val(par, "knee_x"), zk = val(par, "knee_z");
        const Dh = val(par, "d_head"), Dp = val(par, "d_pen"), Ds = val(par, "d_shaft");
        const gap = val(par, "gap");
        const zi = zk - Dh / 2, zs = zk + Dh / 2;              // headrace invert / soffit
        const xs0 = xk - Ds / 2, xs1 = xk + Ds / 2;            // shaft walls
        const len = Math.hypot(XO - xk, ZO - zk);
        const tx = (XO - xk) / len, tz = (ZO - zk) / len;      // penstock axis, down-right
        const nx = -tz, nz = tx;                               // its upper normal
        const h = Dp / 2;
        const up = (s) => [xk + s * tx + h * nx, zk + s * tz + h * nz];
        const lo = (s) => [xk + s * tx - h * nx, zk + s * tz - h * nz];
        const A = lo((zi - zk + h * nz) / tz);
        const B = lo((ZO - h - zk + h * nz) / tz);
        const C = up((xs1 - xk - h * nx) / tx);
        const D = up((ZO + h - zk - h * nz) / tz);
        const xw = XR - TW / 2;                                // the reservoir wall's wet face
        const ground = GEOM.poly(
          [[-1, -1], [W + 1, -1], [W + 1, ZO - h], B, A, [-1, zi]],
          [{ id: "invert", label: "Headrace invert", e0: 4, e1: 4 },
           { id: "pen_lo", label: "Penstock lower wall", e0: 3, e1: 3 },
           { id: "tail_lo", label: "Tailpipe invert", e0: 2, e1: 2 }], "ground");
        const roofL = GEOM.rect(xw, zs, xs0, H + 1, { id: "roof",
          faces: [{ id: "soffit", label: "Headrace soffit", e0: 0, e1: 0 },
                  { id: "shaft_l", label: "Shaft, left wall", e0: 1, e1: 1 },
                  { id: "res", label: "Reservoir wall", e0: 3, e1: 3 }] });
        const roofR = GEOM.poly(
          [C, D, [W + 1, ZO + h], [W + 1, H + 1], [xs1, H + 1]],
          [{ id: "pen_up", label: "Penstock upper wall", e0: 0, e1: 0 },
           { id: "tail_up", label: "Tailpipe soffit", e0: 1, e1: 1 },
           { id: "shaft_r", label: "Shaft, right wall", e0: 4, e1: 4 }], "penroof");
        // The nozzle: two plates 0.5 m thick (3 cells at Medium) leaving `gap`
        // centred on the tailpipe axis. Delivered in whole cells, like every
        // drawn plate in the set (UN-1's ladder is quantised the same way).
        const noz0 = GEOM.rect(XN - 0.25, ZO - h - 0.3, XN + 0.25, ZO - gap / 2, { id: "nozzle0" });
        const noz1 = GEOM.rect(XN - 0.25, ZO + gap / 2, XN + 0.25, ZO + h + 0.3, { id: "nozzle1" });
        return { xk, zk, Dh, Dp, Ds, gap, zi, zs, xs0, xs1, h, xw, A, B, C, D,
                 tx, tz, nx, nz, sD: (ZO + h - zk - h * nz) / tz,
                 walls: [ground, roofL, roofR], solids: [ground, roofL, roofR, noz0, noz1] };
      };
      // water() is called once per cell; the geometry is built once per
      // params object rather than per cell.
      let cache = { key: null, g: null };
      const geomFor = (par) => {
        const key = JSON.stringify(par || {});
        if (cache.key !== key) cache = { key, g: geom(par) };
        return cache.g;
      };

      // The steady flow, estimated: what the nozzle passes under the head it
      // has, q₀ = C_q·gap·√(2g·(level − z_nozzle)), and the shaft's steady
      // drawdown y₀ = K·u₀². Both constants are MEASURED at the defaults (see
      // the engineering notes) and only have to be close: they seed the
      // initial velocity field and the shaft's starting level so the scene
      // opens near its steady state instead of at rest. Move a slider the
      // estimate does not follow and the spin-up just takes longer.
      const Q_C = 0.76, K_EST = 0.07;
      const flowOf = (par, level) => {
        const g = geomFor(par);
        const q = Q_C * g.gap * Math.sqrt(2 * 9.81 * Math.max(level - ZO, 0.5));
        const u0 = q / g.Dh;
        return { q, u0, y0: K_EST * u0 * u0, up: q / g.Dp };
      };

      return {
        id: "hydro", name: "Hydropower scheme · surge shaft", key: "Rigid-column surge",
        group: "Pressure & transients",
        blurb: "A reservoir, a level headrace, a surge shaft at the knee and a penstock down to a nozzle. Slam the valve and the headrace column runs up the shaft — a mass oscillation the shaft has to be tall enough to hold.",
        // cf = 0.05, not hammer's 0.004: MEASURED, the headrace HGL falls 0.09 m
        // over 28 m at 2.5 m/s (Darcy f ≈ 0.06) against 0.045 m at 0.004, and
        // neither knob goes much further — a 19-cell bore's wall function only
        // slows the wall cells (cf = 0.3 gives 0.03 m and a 2.06 m/s bore-mean).
        // c = 60, not hammer's 70: the penstock runs ~3.1 m/s, and a wide
        // shaft reflects the Joukowsky wave in full, so the downsurge at the
        // valve reached 0.4 m of head at c = 70 (D_s = 8 m) — cavitation.
        W, H, c: 60, cf: 0.05, cs: 0.05, bulk: 0.03, nu: 1e-4,
        valveOpen: 1, spinup: 60,
        mode: 1, headMax: 45, hmax: 25, vmax: 6,
        open: [1, 1, 0, 0],
        // The sponge holds the left 5 m of an 8 m compartment: the 2.7 m of free
        // surface before the wall IS the reservoir a gauge reads — its level
        // is what the headrace actually sees — and it is where the panel's
        // delivered-level readout samples (sampleInlet takes the ten columns
        // just clear of the sponge; with the sponge reaching the wall that read
        // landed inside the headrace mouth and printed the soffit).
        spongeIn: 5.0,
        inflow: { level: LEVEL, q: 0, on: 1, free: 1 },
        // The Geometry panel binds its rows by index, so keep this in the same
        // physical order as the scheme: knee, conduits, shaft, nozzle.
        params: [
          { key: "knee_x", label: "Knee x", min: 30, max: 54, step: 0.5, value: DEF.knee_x, unit: "m" },
          { key: "knee_z", label: "Knee z", min: 8, max: 20, step: 0.5, value: DEF.knee_z, unit: "m" },
          { key: "d_head", label: "Headrace bore D_h", min: 2.0, max: 4.0, step: 0.1, value: DEF.d_head, unit: "m" },
          { key: "d_pen", label: "Penstock bore D_p", min: 1.5, max: 3.0, step: 0.1, value: DEF.d_pen, unit: "m" },
          { key: "d_shaft", label: "Surge shaft width D_s", min: 1.5, max: 8.0, step: 0.1, value: DEF.d_shaft, unit: "m" },
          // 0.9, not the 1.2 this used to say: swept from below, 1.1 already
          // pressurises the discharge and 1.2 — the old stop itself — reverses
          // the headrace. The ladder is in the engineering notes.
          { key: "gap", label: "Nozzle gap", min: 0.16, max: 0.9, step: 0.02, value: DEF.gap, unit: "m" },
        ],
        solids: (W_, H_, P_, par) => geomFor(par).solids,
        valves: (W_, H_, par) => { const g = geomFor(par); return [[XV, ZO - g.h, XV, ZO + g.h, 0.5]]; },
        // Still water at the reservoir level in the reservoir, the headrace,
        // the shaft and the penstock, up to the nozzle plate — and in no
        // solid cell, so a column read mid-headrace is the bore and nothing
        // else (V = q/d has to be the bore-mean velocity).
        water: (x, z, P, par) => {
          const level = Number.isFinite(P.level) ? P.level : LEVEL;
          if (z >= level || x > XN - 0.25) return 0;
          const g = geomFor(par);
          for (const so of g.walls) if (GEOM.contains(so, x, z)) return 0;
          // The head the water is filled to: the reservoir level, falling to
          // the shaft's estimated steady level along the headrace and held
          // there through the shaft and the penstock.
          const f = flowOf(par, level);
          const head = x < g.xw ? level
                     : x < g.xs0 ? level - f.y0 * (x - g.xw) / (g.xs0 - g.xw)
                     : level - f.y0;
          return still(head, z, P);
        },
        // The estimated steady velocity field (see flowOf): a plug along the
        // headrace, under the shaft, down the penstock axis and along the
        // tailpipe to the nozzle; a slow drift toward the mouth in the
        // reservoir; nothing in the shaft, the jet or the void.
        flow: (x, z, P, par) => {
          const level = Number.isFinite(P.level) ? P.level : LEVEL;
          const g = geomFor(par), f = flowOf(par, level);
          if (z >= level - f.y0 || x > XN - 0.25) return null;
          if (x < g.xw) return z > g.zi ? [f.q / (level - g.zi), 0] : null;
          if (x < g.xs1 && z > g.zi && z < g.zs) return [f.u0, 0];
          const s = (x - g.xk) * g.tx + (z - g.zk) * g.tz;
          const nn = (x - g.xk) * g.nx + (z - g.zk) * g.nz;
          if (s >= 0 && s <= g.sD && Math.abs(nn) <= g.h) return [f.up * g.tx, f.up * g.tz];
          if (x >= g.B[0] - 0.5 && Math.abs(z - ZO) < g.h) return [f.up, 0];
          return null;
        },
        geom: geomFor,                           // handy from APP.sim.scene, for rigs and tests
        tips: ["Drop a <b>gauge</b> in the shaft and one in the reservoir, then press <b>V</b> to slam the valve.",
               "The shaft stands below the reservoir by the headrace friction loss — a piezometer at the knee.",
               "After the slam the shaft rises about u₀·√(L·D_h/(g·D_s)) less the friction — read the crest off the gauge trace.",
               "Widen the shaft (Controls → Geometry) and the upsurge falls as 1/√D_s while the period grows as √D_s.",
               "The penstock still takes the Joukowsky pulse: gauge it near the valve on the h channel."] };
    })(),

    // Establishment: shaped so the rigid-column derivation is actually valid,
    // which the hammer scene cannot offer (there the rise is over inside one
    // wave transit and the trace is Allievi's staircase). The rise must span
    // several transits — t75/T = ln7·u_max·c/(8gH), so LOW head and a modest
    // u_max — the entry must not shed (a sharp tank-to-pipe mouth grows a
    // flapping vena over a flush time; the bellmouth chamfer takes the
    // mid-pipe plateau noise from ~10% to 0.4–3%), and the spent jet must
    // LEAVE (a tail reservoir drifts on the sponge's weak drain side, an
    // apron ponds and drowns the exit; a free jet over the open bottom edge
    // does neither). The exit orifice sets k ≈ 4 so u_max stays 2–2.8 m/s
    // over the level ladder, and bulk 0.30 is load-bearing: a level change
    // on the shut pipe excites the closed-pipe organ mode (period 4l/c ≈ 3 s)
    // and without the damping it rings for minutes.
    { id: "estab", name: "Flow establishment", key: "Rigid column",
      group: "Pressure & transients",
      blurb: "A reservoir, a 23 m full pipe, a shut valve. Open it and the column takes seconds to come up to speed: inertia against a loss that grows as u².",
      W: 30, H: 8, c: 30, cf: 0.004, cs: 0.05, bulk: 0.30, nu: 1e-4,
      valveOpen: 0, spinup: 12,
      mode: 2, headMax: 6, hmax: 5, vmax: 4,
      open: [1, 1, 1, 0],
      spongeIn: 3.0,
      inflow: { level: 3.8, q: 0, on: 1, free: 1 },
      walls: () => [
        [0.0, 1.0, 26.0, 1.0, 2.0],              // ground: solid to z = 2.0, the invert
        [3.0, 3.05, 26.0, 3.05, 0.5],            // soffit: bore is z 2.0–2.8, l = 23 m
        [3.0, 3.2, 3.0, 8.0, 0.3],               // tank wall above the soffit
        [2.3, 3.45, 3.7, 2.85, 0.28],            // bellmouth chamfer on the soffit nose
        [25.6, 1.95, 25.6, 2.20, 0.10],          // exit orifice …
        [25.6, 2.60, 25.6, 2.85, 0.10],          //   … 0.4 m gap, sets k ≈ 4
      ],
      valves: () => [[25.0, 1.9, 25.0, 2.9, 0.12]],
      // No floor past x = 26 and the bottom edge open: the jet free-falls out
      // of the domain, so nothing ponds however long it runs.
      water: (x, z, P) => (x < 3.0 ? (z < 3.8 ? still(3.8, z, P) : 0)
                                   : x < 25.0 && z < 2.85 ? still(3.8, z, P) : 0),
      tips: ["Press <b>V</b> to open the valve, then watch a mid-pipe gauge: the speed takes seconds to arrive — 23 m of water has inertia.",
             "The plateau is set by head and losses, u_max = √(2gH/k); the time to get there is set by inertia.",
             "Change the Slot celerity and the rise does not change: establishment is inertia, not elasticity.",
             "The reservoir concedes a few centimetres under draw — read the level off its ∇ marker while the pipe flows."] },

    { id: "venturi", name: "Venturi contraction", key: "Bernoulli",
      group: "Pressure & transients",
      blurb: "A pressurised pipe with a throat. Head converts to velocity and back — the head map shows the drop and the imperfect recovery.",
      W: 10, H: 2.4, c: 60, cf: 0.006, cs: 0.06, bulk: 0.05,
      mode: 1, headMax: 2.6, vmax: 5, spinup: 8,
      open: [1, 1, 0, 0],
      // The head-driven feed must hold the WHOLE reservoir compartment
      // (x < 1.5): a narrow sponge cannot supply the pipe's demand, the
      // reservoir draws down below the tailwater and the bore cavitates.
      // The outlet needs width too, or the pipe jet blows through it and
      // the bore never feels the tailwater pressure.
      spongeIn: 1.35, spongeTw: 1.5,
      inflow: { level: 2.05, q: 0, on: 1, free: 1 },
      tailwater: { level: 1.55, on: 1 },
      // The sloping segments are butt-cut perpendicular to their axes, so at
      // every soffit joint a corner recedes ~0.1 m and leaves a wedge-shaped
      // notch (a pocket above the pipe, a bump in the bore at the throat
      // lips). The horizontal neighbours are extended to tuck under/over the
      // slopes; their faces are collinear with the bore, so the bore itself
      // is unchanged.
      walls: () => [
        [0.0, 0.36, 10.0, 0.36, 0.72],           // invert, solid to the ground
        [1.5, 1.77, 3.5, 1.77, 0.72],            // soffit, bore 0.72 → 1.41
        [3.4, 1.77, 4.5, 1.47, 0.72],            // contraction
        [4.38, 1.47, 5.62, 1.47, 0.72],          // throat, bore 0.39 m
        [5.5, 1.47, 7.4, 1.77, 0.72],            // diffuser
        [7.3, 1.77, 10.0, 1.77, 0.72],
        [1.5, 1.41, 1.5, 2.4, 0.12],             // reservoir wall above the pipe
      ],
      water: (x, z, P) => (x < 1.5 || (z > 0.72 && z < 1.41) ? still(2.05, z, P) : 0),
      tips: ["Head falls through the throat and recovers — imperfectly. That gap is the loss.",
             "The diffuser is far gentler than the contraction, and for a good reason.",
             "Hover at the throat: p/ρg drops exactly as much as V²/2g rises.",
             "Raise the reservoir until the throat head reaches zero — incipient cavitation."] },

    { id: "dambreak", name: "Dam break", key: "Unsteady",
      group: "Pressure & transients",
      blurb: "A column of water released instantly. The classic unsteady test: a negative wave runs upstream, a surge runs down.",
      W: 10, H: 2.2, c: 24, cf: 0.012, mode: 2, hmax: 1.9, vmax: 5,
      open: [0, 1, 0, 0],
      walls: () => [[0.0, -0.02, 10.0, -0.02, 0.50]],   // bed top at 0.23
      valves: () => [[2.60, 0.23, 2.60, 2.6, 0.08]],
      water: (x, z, P) => (z > 0.23 ? (x < 2.56 ? still(1.85, z, P) : still(0.40, z, P)) : 0),
      tips: ["Press <b>V</b> to pull the dam out.",
             "The negative wave runs upstream at √(gh₀); the surge front steepens into a bore.",
             "The surge is a moving hydraulic jump — same momentum balance, different frame."] },

    // ------------------------------------------------------ jets and waves
    { id: "jet", name: "Orifice jet", key: "Torricelli", group: "Jets & waves",
      blurb: "A tank with a hole in its wall. Efflux velocity is √(2gh) and the free jet is a ballistic parabola — the vena contracta shows at the lip.",
      W: 6, H: 3.4, c: 26, cf: 0.004, cs: 0.10, mode: 2, vmax: 7, hmax: 2.6,
      // The tank starts brim-full at the lip but the orifice discharges faster
      // than the spout supplies, so it draws down for ~55 s before efflux and
      // inflow balance. With no countdown at all, the headline measurement —
      // is the jet doing √(2gh)? — was being read off a decaying head.
      spinup: 55,
      open: [0, 1, 1, 0],
      walls: () => [
        [0.30, 0.30, 0.30, 2.70, 0.10],          // overflow lip holds the head steady
        [0.30, 0.25, 2.30, 0.25, 0.60],          // tank floor, solid to the ground
        [2.30, 0.30, 2.30, 1.30, 0.10],          // orifice, 1.30 → 1.42
        [2.30, 1.42, 2.30, 3.40, 0.10],
      ],
      source: { on: 1, x: 1.10, z: 3.15, r: 0.13, vx: 0.1, vz: -1.6 },
      water: (x, z, P) => (x > 0.38 && x < 2.25 && z > 0.55 ? still(2.70, z, P) : 0),
      tips: ["Jet speed should be √(2g·h) with h measured from the free surface.",
             "The spout keeps the head topped up and the lip spills the excess.",
             "Turn the spout off and watch the jet decay as the tank empties.",
             "Draw a short lip outside the hole to make a Borda mouthpiece."] },

    // ------------------------------------------------------- wave flumes
    // One flume, three parameter sets — see `flume()` above for why the
    // stroke matters as much as the period.
    // Beach toe at 1.2, right off the paddle, at 1 : 10. Both numbers are
    // measured, not chosen for looks. These waves lose ~63% of their height
    // per wavelength to the discretisation, and shoaling on a beach only
    // amplifies as h^-¼, so on anything gentle the damping wins and the wave
    // dies BEFORE it can break: at 1 : 20 the ratio H/h sat at 0.35–0.45 the
    // whole way in and never reached the 0.78 that breaks it. Shortening the
    // beach (1 : 10 spans 3.5 m, not 7) lets shoaling get ahead — measured
    // H/h now climbs 0.46 → 0.49 → 0.60 → 0.81 → 1.49 and breaks at x = 4.0.
    // The surf zone is 0.7 m: small, but real, and five times what the
    // original 1 : 3.4 beach managed.
    flume({
      id: "wave", name: "Wave flume · shoaling & breaking", key: "Spilling, ξ ≈ 0.4",
      W: 12, H: 1.0, lev: 0.60, bed: 0.25, xb: 1.2, slope: 0.10,
      amp: 0.18, period: 1.5, particles: 1, spinup: 25,
      view: { zoom: 2.2, cx: 3.2, cy: 0.42, vex: 2.2 },
      blurb: "Waves running onto a 1-in-10 beach. They steepen as the water shallows until the height is comparable with the depth, and then they break.",
      tips: ["Watch H/h climb up the slope: measured 0.46 at the toe, 0.60, 0.81, then breaking at x ≈ 4.0 m.",
             "A wave breaks when its height reaches roughly 0.78 of the local depth. That is the whole of the breaking criterion.",
             "Iribarren ξ = tanβ/√(H₀/L₀) ≈ 0.4 — the <b>spilling</b> band, where the crest crumbles down the face.",
             "A GENTLER beach does not work here, and that is honest: these waves damp ~63% per wavelength, so over a 7 m beach they die before they can break.",
             "Load the <b>surging</b> flume for the other end of the Iribarren scale."] }),

    // The other end of the Iribarren scale: steep beach, long wave. Same
    // water, so the only thing that changed is the slope and the period.
    flume({
      id: "wavesurge", name: "Wave flume · surging breakers", key: "Steep beach, ξ ≈ 8",
      W: 12, H: 1.0, lev: 0.60, bed: 0.25, xb: 8.0, slope: 0.70,
      amp: 0.14, period: 3.0, particles: 1, spinup: 25,
      view: { zoom: 1.9, cx: 9.2, cy: 0.45, vex: 2.0 },
      blurb: "The same water against a steep 1-in-1.4 beach, driven by a long wave. It does not spill: the front surges up the slope as a whole and runs back down.",
      tips: ["Iribarren ξ ≈ 8, far into the <b>surging</b> band (> 3.3) — no whitewater, just run-up and run-down.",
             "The reflected wave runs back out and meets the next one; that is why a steep beach makes a choppy tank.",
             "Compare with the <b>spilling</b> flume — same depth, same stroke, only the slope and period differ.",
             "This is why sea walls are built steep to reflect and beaches are gentle to dissipate."] }),

    flume({
      id: "wavedeep", name: "Wave flume · deep-water orbits", key: "h/L = 0.59",
      W: 12, H: 1.5, lev: 1.00, bed: 0.26, xb: 8.2, slope: 0.297,
      tracerX: 5.84, spinup: 20, view: { zoom: 1.9, cx: 5.84, cy: 0.66, vex: 1.6 },
      // Full-length tank on purpose. Halving it to W = 6 (to fill the view,
      // since a 1.26 m wave dies within ~3 m) backfired: the same stroke in a
      // short tank with the beach only 3 m away builds a standing wave —
      // H reached 0.49 m at x = 1 — and the vertical profile stopped being
      // monotonic, so the orbit decay fell from 250× to 16×. The orbits are
      // read in the first few metres; the quiet water beyond is the price.
      amp: 0.20, period: 0.9, particles: 1, plife: 9,
      blurb: "A short, fast wave in water deeper than half its length. The orbits are circles at the surface that shrink to nothing well above the bed — the classic deep-water picture.",
      tips: ["The bright trails ARE the orbits — a bare dot moving 30 mm is invisible, the path is the whole point. The red dot is where each tracer is right now.",
             "Measured trail extents at this station: 58 × 1 mm at the bed against 58 × 67 mm at the surface — the VERTICAL motion dies out 67×.",
             "So the near-bed trail is a flat horizontal line: water there slides back and forth and never rises.",
             "The horizontal length stays ~58 mm all the way down because most of it is the return current, not orbit — a closed flume must send the water back somehow.",
             "h/L = 0.59. Deep water is h/L > 0.5, where the bed stops being felt at all. Press <b>0</b> to zoom out."] }),

    flume({
      id: "waveshallow", name: "Wave flume · shallow-water waves", key: "h/L = 0.05",
      W: 12, H: 1.0, lev: 0.60, bed: 0.25, xb: 4.0, slope: 0.05,
      amp: 0.10, period: 4.0, plife: 14, trail: 9,
      tracerX: 2.0, spinup: 30, view: { zoom: 1.9, cx: 2.0, cy: 0.44, vex: 2.2 },
      blurb: "A wave seven metres from crest to crest in 0.35 m of water. The whole depth moves together, the wave travels at √(gh), and it barely damps at all.",
      tips: ["The trails are flat back-and-forth ellipses, the SAME size top to bottom — that is what 'shallow water' means.",
             "Because every depth moves alike, one depth-averaged velocity describes the flow. That is the assumption every shallow-water model is built on.",
             "Contrast the <b>deep-water</b> flume, where the motion has died out entirely before you reach the bed.",
             "Long waves barely damp: measured 0.123 m at 2 m and 0.121 m at 7 m in the deeper tank.",
             "This is the tsunami and tidal end of the spectrum. Press <b>0</b> to zoom out."] }),

    { id: "plan", name: "Plan view — jet & wake", key: "Gravity off", group: "Jets & waves",
      blurb: "Looking down instead of side on: gravity acts out of the plane, so the whole box is water. A submerged jet, a bluff body, and a vortex street.",
      W: 6, H: 3.4, g: 0, c: 18, cf: 0.0, cs: 0.10, nu: 2e-5, slip: 1, bulk: 0.03,
      mode: 4, ca: 0, vmax: 1.6,
      // The left edge must be OPEN: a closed edge stamps the whole ring column
      // solid, which zeroes the prescribed duct velocity at i = 1 — the scene
      // walls below close everything except the mouth.
      open: [1, 1, 0, 0],
      inflow: { level: 99, v: 0.9, on: 1 },
      walls: () => [
        [0.0, 0.0, 0.0, 1.42, 0.10],             // left edge, closed except …
        [0.0, 1.98, 0.0, 3.4, 0.10],             // … the duct mouth
        [0.0, 1.42, 1.5, 1.42, 0.07],
        [0.0, 1.98, 1.5, 1.98, 0.07],
        [3.2, 1.45, 3.2, 1.95, 0.09],            // bluff body
      ],
      water: () => 1,
      tips: ["No gravity in the plane — this is the horizontal view of the same solver.",
             "Colour is vorticity: the two shear layers roll up into a Kármán street.",
             "Draw a splitter plate behind the body and the street stops shedding.",
             "Turn particles on to watch the jet entrain the surrounding water."] },

    // ===== Year 1: pipeline (UP-1) =====
    // The textbook water-hammer picture, without hammer's nozzle: a reservoir
    // at constant level, one long straight horizontal pipe, and a valve AT
    // THE PIPE'S END that discharges into a small tank. The tank overflows a
    // sharp crest onto a steep chute and the spill leaves through the right
    // edge, so nothing downstream ponds, drifts or reflects back into the
    // pipe. The steady pipe velocity is set by the level difference between
    // the reservoir and the tank — entry, friction and exit losses — and the
    // tank level by the weir, so the flow regulates itself: no throttle in
    // the pipe, and the valve, when shut, is a plain closed end.
    //
    // Why not a free discharge to air: an unthrottled pipe under h_s of head
    // would run at ~√(2g·h_s), and the Joukowsky surge c·v/g would exceed
    // h_s many times over (the downsurge cavitates for any h_s < 2c²/g, i.e.
    // a kilometre at c = 70). A drowned outlet into a tank standing just
    // below the reservoir keeps v small with nothing in the bore.
    //
    // Scale: L ≈ 47 m of 2 m bore (reservoir face x = 5.0 to the valve's
    // upstream face x = 51.75), axis z = 3, reservoir 16 m so the static head
    // at the axis is 13 m and the c·v₀/g surge at c = 70 stays under it.
    // c, cf, cs, bulk and nu are hammer's.
    (() => {
      const W = 60, H = 18;
      const LEVEL = 16.0;                  // reservoir surface
      const XR = 5.0, XV = 52.0;           // reservoir wall (pipe mouth), valve centreline
      const ZI = 2.0, ZS = 4.0, TS = 0.6;  // pipe invert, soffit, soffit wall thickness
      const RB = 1.0;                      // bellmouth radius at the pipe's mouth
      const ZC = 14.65;                    // overflow crest (tuned with LEVEL, see below)
      const XC = W - 1.6;                  // tank's right wall / crest block
      const ZTOP = 17.5;                   // top of the reservoir and tank walls
      return {
        id: "pipeline", name: "Water hammer: reservoir, pipe, valve", key: "Speed of sound",
        group: "Pressure & transients",
        blurb: "A reservoir at constant level feeds a long straight pipe that discharges through a valve into a small overflowing tank. Slam the valve and a pressure wave runs up the pipe at the celerity c, reflects at the reservoir and returns: period 4L/c, surge cΔv/g.",
        W, H, c: 70, cf: 0.004, cs: 0.05, bulk: 0.03, nu: 1e-4,
        valveOpen: 1, particles: 1, spinup: 20,
        mode: 1, headMax: 24, hmax: 17, vmax: 3,
        open: [1, 1, 0, 0],
        spongeIn: XR - 0.5,                // hold the whole reservoir compartment
        inflow: { level: LEVEL, q: 0, on: 1, free: 1 },
        solids: () => [
          // Ground, the tank's right wall, and the crest block whose steep
          // downstream face carries the spill out of the right edge. CCW.
          GEOM.poly([[-1, -0.5], [W + 1, -0.5], [W + 1, ZC - 5.0], [XC + 0.4, ZC],
                     [XC, ZC], [XC, ZI], [-1, ZI]],
            [{ id: "chute", label: "Overflow chute", e0: 2, e1: 2 },
             { id: "crest", label: "Overflow crest", e0: 3, e1: 3 },
             { id: "tankR", label: "Tank, right wall", e0: 4, e1: 4 },
             { id: "invert", label: "Pipe invert and beds", e0: 5, e1: 5 }], "ground"),
          // The pipe's soffit with the reservoir wall rising from its mouth
          // and the tank's left wall rising from its end: an inverted U. CCW.
          // The mouth's top corner is rounded (a bellmouth of radius RB):
          // MEASURED, a square corner sheds a vena-contracta jet that ran
          // the axis at 1.96 m/s against a 1.4 m/s bore 9 m in, and wandered
          // down the pipe for the whole settle.
          (() => {
            const mouth = GEOM.arcPts(XR + RB, ZS + RB, RB, Math.PI, 1.5 * Math.PI);
            const n = mouth.length;                       // edges 0 … n−2 are the bellmouth
            return GEOM.poly(mouth.concat([[XV + 0.25, ZS], [XV + 0.25, ZTOP], [XV - 0.25, ZTOP],
                       [XV - 0.25, ZS + TS], [XR + RB, ZS + TS], [XR + RB, ZTOP], [XR, ZTOP]]),
              [{ id: "mouth", label: "Bellmouth", e0: 0, e1: n - 2 },
               { id: "soffit", label: "Pipe soffit", e0: n - 1, e1: n - 1 },
               { id: "tankL", label: "Tank, left wall", e0: n, e1: n },
               { id: "res", label: "Reservoir wall", e0: n + 6, e1: n + 6 }], "pipe");
          })(),
        ],
        valves: () => [[XV, ZI, XV, ZS, 0.5]],      // the pipe's end, flush with the tank wall
        water: (x, z, P) => (z <= ZI ? 0
                             : x < XR + 0.5 ? still(LEVEL, z, P)                 // reservoir
                             : x < XV + 0.25 ? (z < ZS ? still(LEVEL, z, P) : 0) // pipe, full
                             : x < XC ? still(ZC, z, P)                          // tank, to the crest
                             : 0),
        tips: ["Drop three <b>gauges</b> on the pipe axis (z = 3 m), then press <b>V</b> to slam the valve.",
               "The gauge nearest the valve jumps first; the others follow one after another — the pressure wave travels at c, not instantly.",
               "Open the <b>Gauge inspector</b> to read the arrival times: Δt between two gauges is their spacing / c.",
               "The surge is ΔH = c·Δv/g. Lower the Slot celerity c and repeat: the delay grows and the surge shrinks.",
               "The wave reflects at the reservoir as a low-pressure wave: the trace is a square wave of period 4L/c."] };
    })(),
    // ===== Year 1: contraction (FF-5, VC-1, MM-2) =====
    // The shared contraction rig: two reservoirs held at fixed levels, a
    // 0.80 m pipe that contracts into a 0.40 m pipe discharging into the
    // right reservoir. ONE slider, the contraction length L: at L = 4 m the
    // wide pipe tapers the whole way from x = 3 to x = 7; shorter L keeps the
    // wide bore constant for longer and converges over a shorter, steeper
    // taper, always ending at the fixed narrow pipe at x = 7.0; L = 0 is the
    // abrupt step. The contraction is symmetric about the pipe axis
    // (z = 1.20), so both corners separate alike.
    //
    // Pressurised duct flow between two head-driven level controls, the
    // venturi pattern: the left sponge holds the WHOLE left compartment
    // (a narrow sponge cannot supply the pipe and the reservoir draws down),
    // the right one the whole right compartment (or the pipe jet blows
    // through the tailwater and the bore never feels its pressure). The
    // pipe sits deep — its crown 1.1 m under the tailwater — so the lowest
    // pressure in the rig, at the vena contracta past the step, stays well
    // above zero gauge (the EOS clips there and would void).
    //
    // Above the pipe is a sealed EMPTY pocket between the two reservoir
    // walls: the pipe is a casing with air over it, not a buried tunnel.
    ...(() => {
      const XL = 1.6, XS = 5.6, XR = 9.0;           // pipe entry, contraction end, pipe exit
      const ZC = 1.00, A1 = 0.50, A2 = 0.25;        // axis, wide and narrow half-bores
      const ZF = 0.20, ZTOP = 1.75, TW = 0.20;      // reservoir floors, casing top, wall thickness
      const L1 = 2.80, L2 = 2.40;                   // reservoir levels
      const RB = 0.30, NB = 8;                      // bellmouth radius, chords per lip
      const LMAX = 3.0;                             // longest taper: x = 2.6 → 5.6
      const Q0 = 0.95;                              // measured steady Q, m²/s (taper)
      const Lof = (par) => (par && par.taperL !== undefined ? par.taperL : LMAX);
      // Half-bore at x: wide, then a straight taper of length L, then narrow.
      const half = (x, L) => {
        if (x >= XS) return A2;
        if (L <= 1e-6 || x <= XS - L) return A1;
        return A1 + (A2 - A1) * (x - (XS - L)) / L;
      };
      return [{
        id: "contraction", name: "Contraction rig", key: "Taper ↔ step",
        group: "Pressure & transients",
        blurb: "Two reservoirs joined by a wide pipe that contracts into a narrow one. One slider takes the contraction from a long gentle taper to an abrupt step.",
        W: 11.5, H: 2.9, c: 30, cf: 0.02, cs: 0.10, bulk: 0.10,
        mode: 2, hmax: 3.0, headMax: 2.6, vmax: 4, particles: 1, plife: 6,
        spinup: 25,                               // measured: from a fresh start Q overshoots ~30% at 8 s and is back within a few per cent of steady by 25 s, at either end of the slider
        open: [1, 1, 0, 0],
        spongeIn: 1.4, spongeTw: 2.3,
        inflow: { level: L1, q: 0, on: 1, free: 1 },
        tailwater: { level: L2, on: 1 },
        params: [
          { key: "taperL", label: "Contraction length L", min: 0, max: LMAX, step: 0.05, value: LMAX, unit: "m", resetWater: true },
        ],
        // The pipe entry is a rounded bellmouth (radius RB, NB chords per
        // lip): a square-edged entry separates and leaves slow layers along
        // the first metre of the wide pipe, right where a control-volume
        // face has to stand.
        solids: (W, H, P, par) => {
          const L = Lof(par), xt = XS - L;
          const lo = GEOM.arcPts(XL + RB, ZC - A1 - RB, RB, Math.PI / 2, Math.PI, NB);
          const ground = GEOM.poly([
            [-0.5, -0.5], [W + 0.5, -0.5], [W + 0.5, ZF], [XR, ZF], [XR, ZC - A2],
            [XS, ZC - A2], [xt, ZC - A1], ...lo, [XL, ZF], [-0.5, ZF]], [
            { id: "rfloor", label: "Right reservoir floor", e0: 2, e1: 2 },
            { id: "rwall", label: "Right reservoir wall, below the pipe", e0: 3, e1: 3 },
            { id: "invert2", label: "Narrow pipe invert", e0: 4, e1: 4 },
            { id: "contr", label: "Contraction, lower face", e0: 5, e1: 5 },
            { id: "invert1", label: "Wide pipe invert", e0: 6, e1: 6 },
            { id: "lwall", label: "Bellmouth and left reservoir wall, below the pipe", e0: 7, e1: 7 + NB },
            { id: "lfloor", label: "Left reservoir floor", e0: 8 + NB, e1: 8 + NB },
          ], "ground");
          const up = GEOM.arcPts(XL + RB, ZC + A1 + RB, RB, Math.PI, 1.5 * Math.PI, NB);
          const casing = GEOM.poly([
            ...up, [xt, ZC + A1], [XS, ZC + A2], [XR, ZC + A2], [XR, H + 0.5],
            [XR - TW, H + 0.5], [XR - TW, ZTOP], [XL + TW, ZTOP], [XL + TW, H + 0.5], [XL, H + 0.5]], [
            { id: "soffit1", label: "Wide pipe soffit", e0: NB, e1: NB },
            { id: "contr", label: "Contraction, upper face", e0: NB + 1, e1: NB + 1 },
            { id: "soffit2", label: "Narrow pipe soffit", e0: NB + 2, e1: NB + 2 },
            { id: "rwall", label: "Right reservoir wall, above the pipe", e0: NB + 3, e1: NB + 3 },
            { id: "lwall", label: "Left reservoir wall and bellmouth, above the pipe", e0: NB + 9, e1: NB - 1 },
          ], "casing");
          return [ground, casing];
        },
        // Start the pipe near its steady discharge (Q0, measured) rather
        // than from rest: the column otherwise takes ~15 s to come up to
        // speed, a rigid-column establishment that is not this demo's point.
        flow: (x, z, P, par) => {
          if (x < XL + RB || x > XR) return null;
          const hf = half(x, Lof(par));
          return Math.abs(z - ZC) < hf ? [Q0 / (2 * hf), 0] : null;
        },
        // Hydrostatic in each reservoir; in the pipe a head falling linearly
        // from one level to the other — a charged pipe, at rest.
        water: (x, z, P, par) => {
          if (z < ZF) return 0;
          if (x < XL) return still(L1, z, P);
          if (x > XR) return still(L2, z, P);
          const hf = half(x, Lof(par));
          if (Math.abs(z - ZC) > hf) return 0;
          return still(L1 - (L1 - L2) * (x - XL) / (XR - XL), z, P);
        },
        tips: ["Slide <b>Contraction length L</b> on the card: 3 m is a gentle taper, 0 an abrupt step.",
               "Particles speed up through the contraction: in steady flow every particle still accelerates.",
               "Past the step the flow cannot turn the corner: it separates, and the jet narrows to a vena contracta.",
               "A Flux line in each pipe reads the same Q; a Control volume round the contraction gives the force on it."],
      }];
    })(),
    // ===== Year 1: fillleak, vane =====
    //
    // VC-2 · a tank filled from the top by the spout and emptied through a
    // valved orifice near its floor. Kept deliberately bare: one tank of
    // plan area S = 2.00 m per metre width (inside faces x = 0.40 → 2.40),
    // floor top at z = 0.50, an orifice 0.08 m tall (z 0.55 → 0.63) through
    // the right wall, shut by a scene valve (V). The jet leaves into open air
    // and falls out through the open right and bottom edges, so nothing the
    // outlet sheds can come back into the tank.
    //
    // The inflow slider is the SPOUT: a scene param cannot write sim.p by
    // itself, but solids() is handed the live sim.p (rasterise passes it) and
    // every param change goes through rasterise, so solids() sets the spout's
    // downward speed from the slider there. The spout is 2r = 0.16 m wide and
    // the speed asked of it is Q_nom / (2r·K), where K is the measured ratio of
    // what the disc actually delivers to 2r·|v| (see QIN_K).
    (() => {
      const S0 = 0.40, S1 = 2.40, ZF = 0.50;          // tank inside faces, floor top
      const O0 = 0.55, O1 = 0.63, ZW = 3.00;          // orifice, wall top
      const R = 0.08;                                 // spout radius
      const QIN_K = 1.0;                              // delivered Q / (2r|v|), measured
      const spoutV = (q) => -q / (2 * R * QIN_K);
      return {
        id: "fillleak", name: "Tank that fills and leaks", key: "S dh/dt = Q_in − Q_out",
        group: "Jets & waves",
        blurb: "A tank fed from the top and drained through a hole near the floor. The outflow grows with the depth of water over the hole, so the level settles where outflow equals inflow; shut the valve (V) and the level climbs at Q/S.",
        W: 4.0, H: 3.6, c: 26, cf: 0.004, cs: 0.10, nu: 1e-3,
        mode: 0, hmax: 2.6, headMax: 2.6, vmax: 5,
        valveOpen: 1, particles: 0, spinup: 0,      // VC-2 opens with the outlet OPEN (lecturer, Oct 2026)
        open: [0, 1, 1, 0],
        params: [
          { key: "q_in", label: "Inflow Q", min: 0.10, max: 0.30, step: 0.01,
            value: 0.25, unit: "m²/s",
            fmt: (v) => v.toFixed(2) + " m²/s  (per metre width)" },
        ],
        source: { on: 1, x: 1.40, z: 3.30, r: R, vx: 0, vz: spoutV(0.25) },
        solids: (W, H, P, par = {}) => {
          const q = par.q_in === undefined ? 0.25 : par.q_in;
          if (P && P.source) P.source.vz = spoutV(q);
          return [
            // Ground, floor, left wall and the right wall below the orifice:
            // one CCW polygon, solid down past z = 0 and out past x = 0.
            GEOM.poly([[-0.5, -0.5], [S1 + 0.10, -0.5], [S1 + 0.10, O0], [S1, O0],
                       [S1, ZF], [S0, ZF], [S0, ZW], [-0.5, ZW]],
              [{ id: "floor", label: "Tank floor", e0: 4, e1: 4 },
               { id: "left", label: "Left wall", e0: 5, e1: 5 }], "tank"),
            GEOM.rect(S1, O1, S1 + 0.10, ZW, { id: "rightWall",
              faces: [{ id: "inner", label: "Right wall (inside)", e0: 3, e1: 3 }] }),
          ];
        },
        valves: () => [[S1 + 0.05, O0 - 0.02, S1 + 0.05, O1 + 0.02, 0.08]],
        water: (x, z, P) => (x > S0 && x < S1 && z > ZF ? still(0.70, z, P) : 0),
        tips: ["The outlet starts OPEN: the outflow grows with the depth over it, and the level creeps up to where out = in.",
               "Press <b>V</b> to shut the valve: with nothing going out, the level climbs in a straight line at Q/S, S = 2.00 m.",
               "Slide <b>Inflow Q</b> on the card and the level finds a new balance — higher Q, higher level.",
               "Drag a Control volume (9) round the whole tank: in, out and net. Net is the rate the tank stores water; it is NOT zero while the level moves."] };
    })(),

    // MM-1 · a free jet striking a FLAT PLATE whose inclination θ (the angle
    // between the jet and the plate) is the one slider: 90° (plate square to
    // the jet, the symmetric split) down to 20°. The plate is fixed in space
    // at each setting and turns about the point where the jet's axis meets
    // its wet face, so the jet always strikes its middle and the split is set
    // by the angle alone. The jet leaves as two sheets along the plate:
    //     q₁ = q(1 + cos θ)/2  along t = (cos θ, −sin θ)  (down the screen)
    //     q₂ = q(1 − cos θ)/2  along −t                    (up and back)
    // and the force on the plate is normal to it, F_n = ρqU sin θ, with
    // components F_x = F_n sin θ (→) and F_z = F_n cos θ (↑).
    //
    // GRAVITY IS (ALMOST) OFF, and that is the design choice: the textbook
    // plate is a horizontal jet in a horizontal plane, so the picture is a
    // PLAN view with gravity into the screen. In the vertical plane the jet
    // sags, a sheet sent up slows and rains back onto the jet (MO-2's +20%
    // on a flat plate), and the box's vertical force carries the weight of
    // every drop inside it. Unlike `plan` the plane is NOT full of water:
    // the jet is free, in air at p = 0. That needs the free-surface EOS,
    // which the shaders swap for the two-sided plan-view EOS at g exactly 0
    // (it pulls an interface together), so g is 1e-3 m/s²: the free-surface
    // path stays on and the jet sags ~0.1 mm over its flight.
    //
    // NO FRICTION ALONG THE PLATE, because the teaching point is that an
    // ideal plate takes no tangential force — that is what makes the split
    // q(1 ± cos θ)/2. `slip: 1` mirrors the viscous stencil at a solid
    // (free-slip) and `cf: 0` switches off the wall function; `kappa: 0`
    // keeps the open-channel mixing length out of the sheets.
    //
    // Sizes. The jet is 0.24 m wide (2·RJ): at 30° the small sheet is
    // 0.067 × 0.24 = 16 mm, ~2 cells at Medium (Δx ≈ 8.7 mm). The plate is
    // 1.60 m long (0.80 m each side of the impact point): at 20° the jet's
    // footprint is 0.24/sin 20° = 0.70 m, and what remains past it lets each
    // sheet run parallel to the plate before it leaves the end. Every edge is
    // an OUTFALL (ghosts held empty): with no gravity to drain it, spray at a
    // plain open edge ponded against it.
    (() => {
      const XS = 0.40, ZJ = 1.20, RJ = 0.12, UJ = 4.5;  // spout centre, radius, speed
      const XC = 1.60;                                // impact point on the wet face
      const LH = 0.80;                                // half the plate's length
      const TH = 0.06;                                // plate thickness (dry side)
      const deg = Math.PI / 180;
      /** The plate at inclination θ (degrees): wet face from the upstream end
       *  A = C − LH·t to the downstream end B = C + LH·t, thickened along
       *  d = (sin θ, cos θ), the dry side. A → B → B+d → A+d is CCW. */
      function plate(theta) {
        const th = theta * deg, tx = Math.cos(th), tz = -Math.sin(th);
        const dx = Math.sin(th) * TH, dz = Math.cos(th) * TH;
        const A = [XC - LH * tx, ZJ - LH * tz], B = [XC + LH * tx, ZJ + LH * tz];
        return GEOM.poly([A, B, [B[0] + dx, B[1] + dz], [A[0] + dx, A[1] + dz]],
          [{ id: "face", label: "Plate (wet face)", e0: 0, e1: 0 },
           { id: "back", label: "Plate (back)", e0: 2, e1: 2 }], "plate");
      }
      return {
        id: "vane", name: "Jet on an inclined plate, plan view", key: "F_n = ρqU sin θ",
        group: "Jets & waves",
        blurb: "A free jet seen from above strikes a flat plate set at an angle θ to it. The jet splits into two unequal sheets along the plate; box the plate with a Control volume and read the force, which is at right angles to the plate.",
        W: 3.4, H: 2.4, g: 1e-3, c: 26, cf: 0, cs: 0.10, nu: 1e-5, slip: 1, kappa: 0,
        mode: 2, hmax: 1, headMax: 1, vmax: 5,
        particles: 0, spinup: 0,
        open: [2, 2, 2, 2],
        params: [
          { key: "theta", label: "Plate angle θ", min: 20, max: 90, step: 1,
            value: 90, unit: "°",
            fmt: (v) => v.toFixed(0) + "°  (90° square to the jet)" },
        ],
        source: { on: 1, x: XS, z: ZJ, r: RJ, vx: UJ, vz: 0 },
        solids: (W, H, P, par = {}) => [plate(par.theta === undefined ? 90 : par.theta)],
        water: () => 0,
        tips: ["This is the jet seen from ABOVE: it flies straight, and the sheets keep their speed along the plate.",
               "Drag a Control volume (9) round the plate, clear of the spout: it reads the force on what is inside — the plate.",
               "Turn the plate with <b>Plate angle θ</b>: the force stays at right angles to the plate, ρqU sin θ, and the jet splits unequally, q(1 ± cos θ)/2."] };
    })(),
    // ===== Year 1: wall-shape =====
    // PF-2: a still tank whose right-hand wall changes shape under ONE slider,
    // with the water depth over the wall's foot held at d = 1.60 m. The point
    // is the projection rule: the Pressure force tool reads F_h = ½ρg·d² on
    // every shape, while F_v is the weight of the water standing on the wall
    // (or, under an overhang, of the "water that isn't there" above it,
    // pointing up). The scene lists the wall in `forceRef`, which makes
    // drawForce print the ½ρg·d² reference beside F_h.
    //
    // The slider s ∈ [0, 1]: s ≤ 0.75 is a straight face whose angle from the
    // vertical runs linearly from −30° (overhang) through 0° (s = 0.25) and
    // 30° (s = 0.5) to 60° (s = 0.75); past 0.75 the 60° face blends vertex by
    // vertex into a four-step staircase whose outer corners lie on that 60°
    // line. The face always has the same nine vertices (collinear on a straight
    // face), each moving monotonically up and to the right, so every
    // intermediate polygon is simple and stays joined to the bed: the wall and
    // the ground are ONE polygon, so there is no seam for water to leak
    // through. The face runs 0.20 m above the water to a flat crest, so the
    // top step is dry and the free surface never meets a corner.
    //
    // nu is an eddy viscosity for the same reason as `dyke`: the point is
    // still water, and every slider move restarts it from the hydrostatic fill.
    (() => {
      const ZB = 0.30, D = 1.60, ETA = ZB + D, ZF = ETA + 0.20;   // bed, depth, surface, face top
      const XF = 2.00, NSTEP = 4, W = 5.6;                        // foot of the wall, steps, domain
      const deg = (s) => (s <= 0.75 ? -30 + 120 * s : 60);
      // The nine face vertices, foot first.
      const face = (s) => {
        const th = deg(s) * Math.PI / 180, hf = ZF - ZB, run = hf * Math.tan(th);
        const beta = s <= 0.75 ? 0 : (s - 0.75) / 0.25;
        const r = hf / NSTEP, t = run / NSTEP, pts = [];
        for (let k = 0; k <= 2 * NSTEP; k++) {
          const P = [XF + run * k / (2 * NSTEP), ZB + hf * k / (2 * NSTEP)];   // on the line
          const m = Math.ceil(k / 2), q = Math.floor(k / 2);                   // stairs: rise, then tread
          const Q = [XF + q * t, ZB + m * r];
          pts.push([P[0] + beta * (Q[0] - P[0]), P[1] + beta * (Q[1] - P[1])]);
        }
        return pts;
      };
      const shape = (s) => (s === undefined ? 0.25 : s);
      return {
        id: "wall-shape", name: "Wall shape and the pressure force", key: "F_h = ½ρgd², whatever the shape",
        group: "Hydrostatics",
        blurb: "Still water, 1.60 m deep, against a wall whose shape you set: overhanging, vertical, sloped at 30° or 60°, or stepped. Click the wall with the Pressure force tool and compare F_h and F_v as the shape changes.",
        W, H: 2.4, c: 25, cf: 0.01, cs: 0.16, nu: 2e-3, mode: 0,
        hmax: 2.0, headMax: 1.8, vmax: 1,
        open: [0, 0, 0, 0], particles: 0, spinup: 0,
        forceRef: ["tank:wall"],               // drawForce prints ½ρg·d² beside F_h on this face
        params: [
          { key: "shape", label: "Wall shape", min: 0, max: 1, step: 0.01, value: 0.25, unit: "",
            resetWater: true,
            fmt: (v) => {
              if (v > 0.75) return v >= 0.995 ? "staircase (4 steps, 60° overall)"
                : "60° slope → steps " + Math.round(400 * (v - 0.75)) + "%";
              const th = deg(v);
              return Math.abs(th) < 0.5 ? "vertical" : th < 0
                ? "overhang " + (-th).toFixed(0) + "° from vertical"
                : "sloped " + th.toFixed(0) + "° from vertical";
            } },
          { key: "block", label: "Submerged block", min: 0, max: 1, step: 1, value: 0, unit: "",
            resetWater: true, fmt: (v) => (v > 0.5 ? "on: 0.50 × 0.50 m, held still" : "off") },
        ],
        solids: (W_, H_, P_, par = {}) => {
          const f = face(shape(par.shape));
          const verts = [[-0.5, -0.5], [W + 0.5, -0.5], [W + 0.5, ZF]];
          for (let k = f.length - 1; k >= 0; k--) verts.push(f[k]);   // crest end down to the foot
          verts.push([-0.5, ZB]);
          // CCW edges: 0 underside, 1 right, 2 crest, 3..10 the face (top
          // down), 11 the bed, 12 left.
          const out = [GEOM.poly(verts, [
            { id: "wall", label: "Right-hand wall", e0: 3, e1: 2 + 2 * NSTEP },
            { id: "bed", label: "Tank floor", e0: 3 + 2 * NSTEP, e1: 3 + 2 * NSTEP },
            { id: "crest", label: "Crest", e0: 2, e1: 2 },
          ], "tank")];
          if (par.block > 0.5) out.push(GEOM.rect(0.20, 0.80, 0.70, 1.30, { id: "block",
            faces: [{ id: "all", label: "Submerged block (all four sides)", e0: 0, e1: 3 }] }));
          return out;
        },
        water: (x, z, P) => (z > ZB && z < ETA ? still(ETA, z, P) : 0),
        tips: ["Pick the <b>Pressure force</b> tool and click the right-hand wall. The chip prints F, then F_h with ½ρg·d² beside it, then F_v.",
               "Slide <b>Wall shape</b> on the card: overhang → vertical → 30° → 60° → steps. Each change restarts the still water; the depth at the wall stays 1.60 m.",
               "F_h never changes: only the wall's vertical projection, d, matters.",
               "F_v is the weight of the water standing on the wall. Under an overhang it is the weight of the water that ISN'T there above it, and it points up.",
               "Switch <b>Submerged block</b> on and click the block: the pressure all round it adds up to one upward force, its displaced weight."] };
    })(),
    // ===== Year 1: lake =====
    // FF-1 · Wind over a lake. A closed rectangular tank of still water, 6 m
    // long and 0.30 m deep, with a wind shear stress τ on its free surface
    // (the scene's one param, key "tau", which the vel pass reads — SIM.windTau).
    // At τ = 0 it is hydrostatic: u = 0, p = ρg·d, flat pressure-head bands.
    // Any τ ≠ 0 drives a surface drift downwind, sets the surface up against
    // the downwind wall and sends a return flow back along the bed. The range
    // is far beyond a real lake's (a gale is ~0.5 N/m²) so the set-up is
    // whole cells high in a 6 m tank: τ·L/(ρg·d) ≈ 4 cm at τ = 20 N/m².
    // nu = 2e-3 is an eddy viscosity, as on the dyke: a scene whose point is
    // rest has to be able to come back to rest once τ returns to zero.
    { id: "lake", name: "Wind over a lake", key: "Wind stress",
      group: "Year 1 · Flow fields",
      blurb: "A closed tank of still water. Blow on its surface with the wind-stress slider: the water flows however small τ is, piles up against the downwind wall and returns along the bed.",
      W: 6.0, H: 0.80, c: 12, cf: 0.01, cs: 0.16, nu: 2e-3, mode: 0,
      hmax: 0.45, headMax: 0.32, vmax: 0.25,
      particles: 1, spinup: 0,
      open: [0, 0, 0, 0],
      params: [
        { key: "tau", label: "Wind stress τ", min: -20, max: 20, step: 0.5, value: 0,
          unit: "N/m²", fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " N/m²" +
            (v > 0 ? "  → blowing right" : v < 0 ? "  ← blowing left" : "  calm") },
      ],
      solids: () => [
        GEOM.rect(-0.5, -0.5, 6.5, 0.10, { id: "ground",
          faces: [{ id: "top", label: "Lake bed", e0: 2, e1: 2 }] }),
      ],
      water: (x, z, P) => (z <= 0.10 ? 0 : still(0.40, z, P)),
      tips: ["At rest: hover the water — the velocity is zero and the pressure head p/ρg is just the depth below the surface. Pressure head shows flat bands: pressure only.",
             "Move the <b>Wind stress τ</b> slider: the surface water is dragged downwind at once, however small τ is.",
             "Watch the surface pile up against the downwind wall, and the particles near the bed run back upwind.",
             "Reverse τ and the whole circulation reverses. Set τ = 0 and the motion dies away."] },
    // ===== Year 1: body (FF-3) =====

    /** FF-3's scene: `plan` (gravity off, looking down) with the duct opened
     *  to the whole left edge, so the body sits in a uniform stream rather
     *  than in a jet whose own shear layers would shed regardless, and the
     *  body's shape on ONE slider.
     *
     *  The body is a superellipse |x/a|ⁿ + |z/b|ⁿ = 1. The slider s ∈ [0, 1]
     *  takes n from 2 (an ellipse) to 12 (a square with softened corners)
     *  geometrically, n = 2·6^s, and the aspect a/b from 3 (slender, aligned
     *  with the flow) to 1, a/b = 3^(1−s). HOLD says which size is held:
     *  "width" keeps the frontal width 2b fixed (shape alone changes);
     *  "area" keeps the plan area fixed (the body also gets wider as it gets
     *  bluffer). Both were tried at Medium (README, "For the instructor"):
     *  width hold sheds from s ≈ 0.3, area hold from s ≈ 0.6; width is kept
     *  because Re_D = U·2b/ν then stays 180 along the whole slider and the
     *  onset is down to shape alone. `shape(s, "area")` still builds the
     *  other family for anyone who wants to compare.
     *
     *  ν = 2e-3 is an eddy viscosity chosen to put the onset mid-slider: at
     *  `plan`'s 2e-5 even the 3 : 1 ellipse sheds (Re_D ~ 10⁴), at 1e-3 it
     *  is still weakly unstable, at 3e-3 the square sheds only slowly.
     *  Walls are free-slip as in `plan` (slip 1); measured with no-slip
     *  the ellipse is marginally unstable at this ν, so the streamlined end
     *  would not read as clearly steady. */
    (() => {
      const XC = 1.9, ZC = 1.7;                // body centre
      const B_W = 0.20;                        // half frontal width, "width" hold
      const AREA = 0.16;                       // plan area, "area" hold (= 0.4 m square)
      const HOLD = "width";
      const NPTS = 192;
      const shape = (s, hold) => {
        s = Math.min(1, Math.max(0, s));
        const n = 2 * Math.pow(6, s), r = Math.pow(3, 1 - s);
        const unit = [];
        for (let k = 0; k < NPTS; k++) {
          const t = (2 * Math.PI * k) / NPTS, c = Math.cos(t), sn = Math.sin(t);
          unit.push([r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
                     Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)]);
        }
        let A = 0;                               // shoelace, for the area hold
        for (let k = 0; k < NPTS; k++) {
          const p = unit[k], q = unit[(k + 1) % NPTS];
          A += p[0] * q[1] - q[0] * p[1];
        }
        A = Math.abs(A) / 2;
        const sc = hold === "area" ? Math.sqrt(AREA / A) : B_W;
        return { n, r, b: sc, a: r * sc,
                 verts: unit.map((p) => [XC + sc * p[0], ZC + sc * p[1]]) };
      };
      return {
        id: "body", name: "Plan view — flow past a body", key: "Streamlined → bluff",
        group: "Jets & waves",
        blurb: "Looking down on a uniform stream past one body whose shape you morph with a slider, from a slender ellipse lined up with the flow to a square. Streamlined: a thin steady wake. Bluff: the flow separates and the wake swings from side to side, shedding eddies.",
        W: 6, H: 3.4, g: 0, c: 18, cf: 0.0, cs: 0.10, nu: 2e-3, slip: 1, bulk: 0.03,
        mode: 2, ca: 0, vmax: 1.6, vortMax: 12, headMax: 3.2, dyeLine: 1.0,
        // Left edge open and NOT walled: the inflow prescribes the stream over
        // the whole of it (see `plan` for why the edge itself must be open).
        open: [1, 1, 0, 0],
        inflow: { level: 99, v: 0.9, on: 1 },
        params: [{ key: "shape", label: "Body shape (streamlined → bluff)",
                   min: 0, max: 1, step: 0.01, value: 0, unit: "" }],
        solids: (W, H, P, par) => {
          const s = par && par.shape !== undefined ? par.shape : 0;
          return [GEOM.poly(shape(s, HOLD).verts,
                            [{ id: "body", label: "Body", e0: 0, e1: NPTS - 1 }], "body")];
        },
        shape,
        water: () => 1,
        tips: ["Slide the shape from streamlined to bluff and watch the wake: steady and thin, then wider, then alternating.",
               "Colour is speed: behind a bluff body the flow separates from the surface, and the slow wake swings from side to side as eddies are shed.",
               "Particles (P) swing across the shedding wake: in unsteady flow a particle's path is not a streamline. Dye (D) sends lines of dye across the stream from the inlet.",
               "Switch the colour bar from Live to Average: the average of the alternating wake is a steady, symmetric wake bubble."] };
    })(),
    // ===== Year 1: spillway, pipejet (FF-2, FF-4) =====
    // Two demo scenes for the Fluid Motion lecture (L4): one flow field each
    // that the lecturer talks through — speed, steady against unsteady,
    // streamlines, separation, fluxes, velocity profiles, and turbulence
    // live against Average.

    // ------------------------------------------- FF-2 · spillway, flip bucket
    // A reservoir held by the head-driven level control spills over an ogee
    // crest (the WES shape, x^1.85 = 2 H_d^0.85 · y, for a design head
    // H_d = 1.5 m), runs down a 1 : 0.75 face into a circular flip bucket
    // and is thrown into the air; the jet plunges into a deep pool held by a
    // tailwater on the right edge. No hydraulic jump and no stilling basin:
    // the pool is simply long enough. It was 44 m of domain (~26 m of pool
    // past the plunge, a calm drift at the outflow edge); in Oct 2026 the
    // lecturer asked for the pool to be halved so the fitted view shows more
    // of the spillway: W = 29 m, ~11 m of pool past the plunge. MEASURED at
    // Medium (525 × 181, Δx 55 mm) over 105 s live + 40 s averaged: the
    // turbulence now reaches the outflow edge (its section reads 3.0–4.6
    // m²/s live) but the edge never flows back (min u > 0.45 m/s over the
    // column), the tailwater holds at 2.97–3.03 m, and averaged the edge
    // reads 3.51 and a pool section at x = 22 m 3.33 against 3.52 over the
    // crest.
    //   The bucket's lip angle is the one Geometry slider: it moves the lip
    // along the bucket's own arc, so the throw (where the jet lands, how high
    // it flies) changes while the crest, the face and q do not. MEASURED at
    // Medium: the jet leaves at roughly half the lip angle (lip 20/30/40/45°
    // -> ~6/15/21/27°) at 7.3-8.3 m/s and lands 4-5 m past the lip.
    //   The open-channel mixing length stays ON here (no `kappa`). Measured
    // with it off (kappa 0) or weak (0.1) the pool's eddies ran the whole
    // 30 m to the outflow edge and the tailwater sloshed with them (at 0.1
    // the pool rose to 6 m and drowned the bucket); at the default the pool
    // fluctuates hard around the plunge and is a calm drift by x = 30 m.
    // (Those kappa measurements were on the 44 m pool.) q = 3.52 m²/s over
    // the crest at the 8.7 m level on the 29 m domain (3.46 on the coarser
    // 44 m grid); settled by ~40 s.
    (() => {
      const W = 29, H = 10;
      const ZF = 0.3;                 // reservoir floor and pool floor
      const XU = 7.0;                 // the dam's upstream face
      const ZC = 7.2, HD = 1.5;       // crest apex, design head
      const LEVEL = ZC + HD;          // the reservoir level (a still-water head)
      const SF = 4 / 3;               // the spillway face, 1 : 0.75
      const R = 2.0, ZINV = 3.3;      // bucket radius and invert
      const TW = 3.0;                 // tailwater level: a 2.7 m deep pool
      const DEF = { lip: 40 };
      const val = (par, k) => (par && par[k] !== undefined ? par[k] : DEF[k]);

      const geom = (par) => {
        const th = val(par, "lip") * Math.PI / 180;
        const ea = 0.28 * HD, eb = 0.165 * HD;              // upstream quarter-ellipse
        const xc = XU + ea;                                 // crest apex x
        // WES downstream face to where its slope reaches the chute's SF.
        const k = 0.5 / Math.pow(HD, 0.85);                 // y = k·x^1.85
        const xw = Math.pow(SF / (1.85 * k), 1 / 0.85);
        const zw = ZC - k * Math.pow(xw, 1.85);
        // The bucket: a circle of radius R, invert at ZINV, tangent to the
        // chute; on a circle centred C the point at angle α has tangent
        // direction α + 90°.
        const a1 = -Math.atan(SF) - Math.PI / 2, a2 = th - Math.PI / 2;
        const cz = ZINV + R;
        const zT = cz + R * Math.sin(a1);
        const xT = xc + xw + (zw - zT) / SF;
        const cx = xT - R * Math.cos(a1);
        const xl = cx + R * Math.cos(a2), zl = cz + R * Math.sin(a2);
        const v = [[XU, -0.5], [xl, -0.5], [xl, zl]];
        const iBucket = v.length - 1;
        const arc = GEOM.arcPts(cx, cz, R, a2, a1);          // lip → chute, leftwards
        for (let n = 1; n < arc.length; n++) v.push(arc[n]);
        const iFace = v.length - 1;
        const nW = 40;                                      // WES face, tangent → apex
        for (let n = nW; n >= 0; n--) {
          const x = xw * n / nW;
          v.push([xc + x, ZC - k * Math.pow(x, 1.85)]);
        }
        const iUp = v.length - 1;
        for (let n = 1; n <= 16; n++) {                     // apex → upstream face
          const s = (n / 16) * Math.PI / 2;
          v.push([xc - ea * Math.sin(s), ZC - eb + eb * Math.cos(s)]);
        }
        const nv = v.length;
        const dam = GEOM.poly(v,
          [{ id: "ds", label: "Downstream face (under the lip)", e0: 1, e1: 1 },
           { id: "bucket", label: "Flip bucket", e0: iBucket, e1: iFace - 1 },
           { id: "face", label: "Spillway face and crest", e0: iFace, e1: iUp - 1 },
           { id: "us", label: "Upstream face", e0: iUp, e1: nv - 1 }], "dam");
        const ground = GEOM.rect(-1, -1, W + 1, ZF, { id: "ground",
          faces: [{ id: "top", label: "Reservoir and pool floor", e0: 2, e1: 2 }] });
        return { xc, xw, zw, xT, zT, cx, cz, xl, zl, th, dam, ground, solids: [ground, dam] };
      };
      let cache = { key: null, g: null };
      const geomFor = (par) => {
        const key = JSON.stringify(par || {});
        if (cache.key !== key) cache = { key, g: geom(par) };
        return cache.g;
      };

      return {
        id: "spillway", name: "Spillway with a flip bucket", key: "Ski-jump into a plunge pool",
        group: "Flow fields & turbulence",
        blurb: "A reservoir spills over a curved crest, races down the spillway face and is thrown into the air by a flip bucket. The jet plunges into a deep pool: steady above, wildly unsteady below — and its average is steady again.",
        W, H, c: 30, cf: 0.005, cs: 0.10, bulk: 0.05, nu: 1e-4,
        mode: 2, hmax: 9, headMax: 10, vmax: 10, particles: 1,
        view: { vex: 1 },
        spinup: 40,
        open: [1, 1, 0, 0],
        // The sponge holds the reservoir compartment up to 2 m short of
        // the dam: head-driven, that sponge IS the supply.
        spongeIn: 5.0, spongeTw: 4.0,
        inflow: { level: LEVEL, q: 0, on: 1, free: 1 },
        tailwater: { level: TW, on: 1 },
        params: [
          { key: "lip", label: "Bucket lip angle", min: 20, max: 45, step: 1, value: DEF.lip, unit: "°" },
        ],
        solids: (W_, H_, P_, par) => geomFor(par).solids,
        water: (x, z, P, par) => {
          if (z <= ZF) return 0;
          const g = geomFor(par);
          const level = Number.isFinite(P.level) ? P.level : LEVEL;
          if (x < XU) return still(level, z, P);
          if (x > g.xl) return still(TW, z, P);
          return 0;
        },
        geom: geomFor,
        tips: ["Colour is speed: nearly still in the reservoir, accelerating over the crest, fastest in the bucket, slowing in the pool.",
               "Pause twice: the reservoir, crest and face look the same both times — steady. The pool never does.",
               "Switch the colour bar from Live to <b>Average</b>: the pool becomes a calm mean flow with a steady eddy either side of the plunge.",
               "Two <b>Flux lines</b> — one on the face, one in the pool — read the same q at very different depths and speeds.",
               "A <b>Rake</b> in the pool jitters live and draws a clean profile once averaged: mean + fluctuation.",
               "The <b>Bucket lip angle</b> slider tilts the lip: a steeper lip throws higher and further."] };
    })(),

    // ------------------------------------------- FF-4 · pipe jet into a reservoir
    // A header (head-driven level control, its whole compartment held)
    // drives a 0.5 m pipe, 8 m long, that discharges a jet horizontally into
    // a large tank of still water. Inside the pipe the wall boundary layers
    // grow from the rounded entrance; past the exit the jet's two free shear
    // layers roll up, entrain the still water and spread. The pipe axis sits
    // mid-depth, 5.7 D from the floor and from the lid, and the tank runs
    // 19.5 m (39 D) past the exit to the outflow edge.
    //   The tank is FULL (lid on, no free surface) and its right edge is a
    // submerged tailwater (a piezometric head, as on venturi), so the jet
    // leaves through the edge instead of turning on a far wall. Two
    // free-surface versions were measured and dropped:
    //  * a tailwater on a free surface: this tank carries almost no
    //    through-flow (~0.1 m/s mean) and the tailwater sponge keeps the
    //    stress-free surface extension (boundary-conditions.md §3), so an
    //    inflowing surface current grew at the edge (-1 m/s at 2.6 s, -8 m/s
    //    by 11 s), filled the tank to the lid and drove the pipe backwards;
    //  * an overflow weir at the far end: stable, but the jet struck the weir
    //    face within ~10 s and the 14 m tank filled with one big eddy, so the
    //    averaged jet was neither straight nor symmetric.
    //   kappa: 0 switches the open-channel mixing length off. Its l = κy
    // takes y from the nearest wall, metres from a free shear layer, and
    // with it on (measured) the jet left the pipe as a smooth laminar blob
    // with no eddies at all; with it off the Smagorinsky term alone leaves
    // the shear layers free to roll up.
    //   nu = 2e-3 m²/s is an eddy viscosity, not water's (Re = VD/ν ≈ 400),
    // chosen by measurement between two failures: at 1e-4 and 1e-3 the 2-D
    // jet broke up at the lip into tank-sized eddies that throttled the pipe
    // (q fell 0.90 → 0.41 m²/s and recovered over ~20 s) and a 90 s Average
    // was still a blob; at 5e-3 the jet stayed laminar and steady (live =
    // Average, nothing to show). At 2e-3 the jet leaves as a clean core,
    // starts to flap ~4 m past the exit and breaks into eddies by ~6 m; the
    // pipe profile still develops visibly (centreline 2.17 → 2.51 m/s from
    // x = 3.5 to 10 m) and the averaged jet is a spreading bell.
    (() => {
      const W = 30, H = 6;
      const ZF = 0.3;                         // floor
      const XH = 2.2, TWALL = 0.3;            // header wall (left face) and thickness
      const ZA = 3.15, D = 0.5;               // pipe axis (mid-depth) and bore
      const XE = 10.5;                        // pipe exit
      const TP = 0.25;                        // pipe wall thickness
      const LEVEL = 6.6, TW = 6.2;            // header and tank heads (both above the lid)
      const RB = 0.35;                        // bellmouth radius at the entrance
      const z0 = ZA - D / 2, z1 = ZA + D / 2, x1 = XH + TWALL;
      // Two solids. Below: the header wall under the pipe and the pipe's
      // lower wall; above: the header wall over it and the upper wall. The
      // entrance corners are rounded (a bellmouth) so the flow enters the
      // pipe as a near-uniform plug rather than a separated vena contracta,
      // and the profile development along the pipe is the wall's doing.
      // Built lazily: geom.js loads after this file, so no GEOM call may run
      // while the registry is being assembled.
      let built = null;
      const build = () => {
        if (built) return built;
        const lower = GEOM.poly(
          [[XH, -0.5], [x1, -0.5], [x1, z0 - TP], [XE, z0 - TP], [XE, z0],
           ...GEOM.arcPts(XH + RB, z0 - RB, RB, Math.PI / 2, Math.PI)],
          [{ id: "invert", label: "Pipe invert", e0: 4, e1: 4 },
           { id: "exitLo", label: "Pipe exit, lower lip", e0: 3, e1: 3 }], "pipeLo");
        const upper = GEOM.poly(
          [[XH + RB, z1], [XE, z1], [XE, z1 + TP], [x1, z1 + TP], [x1, H + 1], [XH, H + 1],
           ...GEOM.arcPts(XH + RB, z1 + RB, RB, Math.PI, 1.5 * Math.PI).slice(0, -1)],
          [{ id: "soffit", label: "Pipe soffit", e0: 0, e1: 0 },
           { id: "exitUp", label: "Pipe exit, upper lip", e0: 1, e1: 1 }], "pipeUp");
        const ground = GEOM.rect(-1, -1, W + 1, ZF, { id: "ground",
          faces: [{ id: "top", label: "Floor", e0: 2, e1: 2 }] });
        built = { lower, upper, ground };
        return built;
      };

      return {
        id: "pipejet", name: "Pipe jet into a reservoir", key: "Boundary layers: wall and jet",
        group: "Flow fields & turbulence",
        blurb: "A header drives a pipe that discharges a jet into a large, full tank of still water. Boundary layers grow along the pipe walls; past the exit the edges of the jet roll up into eddies, drag the still water along and spread.",
        W, H, c: 30, cf: 0.02, cs: 0.10, bulk: 0.05, nu: 2e-3,
        kappa: 0,
        mode: 2, hmax: 6, headMax: 6.5, vmax: 3, particles: 1,
        spinup: 20,
        open: [1, 1, 0, 0],
        spongeIn: XH, spongeTw: 2.0,
        inflow: { level: LEVEL, q: 0, on: 1, free: 1 },
        tailwater: { level: TW, on: 1 },
        solids: () => { const g = build(); return [g.ground, g.lower, g.upper]; },
        water: (x, z, P) => {
          if (z <= ZF) return 0;
          const level = Number.isFinite(P.level) ? P.level : LEVEL;
          if (x < XH) return still(level, z, P);
          if (x < x1) return z > z0 && z < z1 ? still(level, z, P) : 0;
          if (x < XE && z > z0 && z < z1) return still(level, z, P);
          const g = build();
          if (GEOM.contains(g.lower, x, z) || GEOM.contains(g.upper, x, z)) return 0;
          return still(TW, z, P);
        },
        tips: ["Colour is speed. In the pipe the slow layers by the walls thicken downstream: the boundary layer, with no slip at the wall.",
               "Past the exit the jet meets still water: its edges roll up into eddies and drag the still water in.",
               "Drop a <b>Rake</b> in the pipe near the entrance and one near the exit: the profile goes from a flat plug towards a rounded one.",
               "A Rake across the jet jitters live. Switch the colour bar from Live to <b>Average</b>: a smooth bell-shaped profile that widens and flattens downstream.",
               "Two <b>Flux lines</b> across the jet: the averaged q GROWS downstream — that is the entrained water.",
               "The tank is full to its lid and its right edge is an outflow held at a fixed level; <b>Reservoir level</b> on the card drives the pipe: raise it and the jet runs faster."] };
    })(),
    // ===== Year 1: HJ-2, WV-4 =====
    // ------------------------------------------------ THE FLUME LAB, SCALED UP
    // HJ-2's scene, ported from the lecturer's unversioned 10 Sep copy
    // (2026_hydraulician-gate-jump). The first-year teaching flume (Lab 2,
    // "The hydraulic jump"): a sluice gate 43 mm open under a 0.275 m pool
    // passes 5.85 l/s down a 0.104 m wide flume — q = 0.056 m²/s, d_c =
    // 0.070 m — and a weir on an operating handle at the far end holds a jump
    // about 0.7 m downstream of the gate. Here the same flume at roughly seven
    // to ten times its size: a 0.30 m opening under a 2.85 m pool passing
    // q = 1.2 m²/s (d_c = 0.53 m), a flap weir hinged 7 m past the gate, the
    // bed flat throughout. The weir crest (the Geometry slider `weir_h`,
    // geom1 after the gate's geom0) is the lab's operating handle: raise it
    // and the jump walks back and the gate drowns.
    //
    // channel() builds the bed, the gate and its `gate_a` param; the flap
    // weir is added here rather than in channel() so the port stays one
    // block. Its param and polygon are appended to what channel() returns.
    //
    // Three decisions measured on the 10 Sep code (the README records them;
    // re-measured on the stress-free surface, see the README's instructor
    // section for what still holds):
    //  · The downstream control is a WEIR with a free overfall behind it, not
    //    a tailwater level: with the level pinned on the right edge the
    //    roller ended on the gate at every setting tried.
    //  · The flume is 14 m, not the 24 m a ×10 lab would be: over a 17 m
    //    reach the backwater alone drowned the gate at every crest.
    //  · a = 0.30 rather than the lab's 0.43 ×10: the wider opening's sheet
    //    was overrun within 2 m at every crest. Crest 0.05 flooded the flume
    //    (the two-cell weir stopped being one), hence the 0.10 floor.
    //
    // RE-MEASURED after the stress-free surface (#72), Medium: the jet no
    // longer carries a slow layer, so it keeps its momentum (Fr₁ ≈ 4.5 at
    // d₁ ≈ 0.20 m, conjugate ≈ 1.2 m) and the old 0.20 crest held no jump at
    // all — the sheet ran supercritical up the flap and over it. The jump now
    // lives in a narrow, hysteretic band: from boot at 0.48 it stands at the
    // gate's foot; 0.46 puts it on the apron (x ≈ 6–8), 0.44 at x ≈ 9, and
    // 0.42 sweeps it over the weir; from the swept state it does not return
    // until ~0.60, where it runs straight to the gate and drowns it. Hence
    // the 0.48 default, and a reach that starts 1.20 m deep from x = 7 m so
    // the jump is established at boot rather than swept out on the way in.
    (function () {
      const s = channel({
        W: 14, H: 3.8, bed0: 0.30, S0: 0, cf: 0.008, cs: 0.06, q: 1.2,
        inletDepth: 2.85, gate: { x: 4.0, a: 0.30 }, xEnd: 12.5,
        mode: 2, hmax: 3.2, vmax: 8, spinup: 60,
        extra: {
          headMax: 3.2,
          water: (x, z, P) => {
            // Pool, a DRY apron, and the reach the weir holds. The apron
            // starts dry because a jet shot into standing water starts
            // submerged and the roller is slow to leave the gate; over a dry
            // bed the sheet is free from the first second.
            const bed = 0.30;
            if (z <= bed || x >= 12.5) return 0;
            const lev = x < 4.0 ? bed + 2.85 : x < 7.0 ? 0 : bed + 1.20;
            return lev ? still(lev, z, P) : 0;
          },
        },
      });
      // The flume's flap weir: a plate hinged at its upstream foot (x = 11.0),
      // leaning downstream, the operating handle turning it about the hinge
      // so that its tip — the crest — stands at bed + h. The plate is 1.3 m
      // long and 0.10 m thick, rooted 0.15 m into the bed; the angle is solved
      // from  L sinθ + t cosθ = h + 0.15  (the tip's upper corner is the
      // crest). Faces: the water side (upstream), the tip, and the underside
      // the nappe falls past.
      const WX = 11.0, BED = 0.30, LP = 1.3, TP = 0.10, ROOT = 0.15;
      const flap = (h) => {
        let th = Math.asin(Math.min(0.98, (h + ROOT) / LP));
        for (let k = 0; k < 6; k++) th = Math.asin(Math.max(0.02, Math.min(0.98, (h + ROOT - TP * Math.cos(th)) / LP)));
        const cx = Math.cos(th), sx = Math.sin(th), z0 = BED - ROOT;
        return GEOM.poly(
          [[WX, z0], [WX + LP * cx, z0 + LP * sx], [WX + LP * cx - TP * sx, z0 + LP * sx + TP * cx], [WX - TP * sx, z0 + TP * cx]],
          [{ id: "us", label: "Upstream face (water side)", e0: 2, e1: 2 },
           { id: "crest", label: "Tip", e0: 1, e1: 1 },
           { id: "ds", label: "Underside", e0: 0, e1: 0 }], "weir");
      };
      const gateSolids = s.solids;
      s.params = s.params.concat([{ key: "weir_h", label: "Weir crest height", min: 0.10, max: 1.0,
                                    step: 0.01, value: 0.48, unit: "m" }]);
      s.solids = (W_, H_, P_, par) => gateSolids(W_, H_, P_, par)
        .concat([flap(par && par.weir_h !== undefined ? par.weir_h : 0.48)]);
      return Object.assign(s, {
        id: "gatejump", name: "Sluice gate → hydraulic jump", key: "The flume lab, scaled up",
        blurb: "The teaching flume at several times its size: a deep pool behind a sluice gate, a fast sheet under it, and a hydraulic jump back to the depth a weir holds at the far end — subcritical, supercritical, subcritical, in one view.",
        tips: ["Pressure head (P): hydrostatic in the pool, clearly not under the gate, where the streamlines curve and the water accelerates.",
               "The pool is subcritical, the sheet under the gate supercritical: the Froude field switches colour at the gate.",
               "The weir crest (Controls → Geometry) holds the jump: at 0.46 m it stands on the apron, at 0.42 m it is swept over the weir, and it only comes back near 0.60 m — straight up to the gate, which drowns.",
               "The grade lines show the head loss in the jump as a drop in the EGL — (d₂−d₁)³/(4d₁d₂).",
               "Click the gate with the Pressure force tool: hydrostatic near the surface, falling to zero at the lip."] });
    })(),

    // ------------------------------------------------ WV-4 · BREAKERS ON A BEACH
    // One flume, one wave, one slider: the beach slope tanβ. A paddle at the
    // left wall makes the same wave every time over a flat bed of constant
    // depth; the slider tilts the beach, and the Iribarren number
    // ξ = tanβ/√(H₀/L₀) moves through spilling (ξ < 0.5), plunging
    // (0.5–3.3) and surging (> 3.3) with nothing else changed.
    //
    // The paddle is AT THE WALL, not a column inside the water. The `wave`
    // piston elsewhere is a prescribed-velocity column at wave.x with a pocket
    // of water behind it that rises and falls in antiphase — on this card it
    // read as a discontinuity with water on both sides. Here wave.x = 0 puts
    // it in column 1, the left edge is open (so the ghost column feeds it) and
    // wave.d declares the still depth, which makes the solver impose the
    // paddle's VOLUME flux a·ω·D·cos ωt (shaders.js, FS_VEL; SIM.wallPaddle).
    // That is the linear piston condition — the paddle's motion imposed at its
    // mean position — and the overlay draws a solid plate whose face moves
    // through the displacement a·sin ωt (main.js, drawMarkers).
    // Measured over 12–16 s at every slope: the water volume holds to 0.2%.
    //
    // Where the beach goes. These waves lose height to the discretisation the
    // further they run (engineering notes, "Surface waves are damped by
    // RESOLUTION"), so the flat run is kept short: the toe sits 1.0 m off the
    // paddle until the beach is steep enough for its still-water shoreline to
    // come inside x = 5.0 m (SHORE), and from there the shoreline is held and the toe
    // walks right. Above the shoreline the beach runs on to the right edge, so
    // run-up always has somewhere to go. Changing the slope is a new
    // experiment (resetWater).
    //
    // The box is cropped to what the waves use, because the cost is cells ×
    // substeps: the gentlest slope (0.06) puts the shoreline at 7.7 m, so the
    // flume is 9 m long; the highest run-up (tanβ 0.7) reaches 0.18 m above
    // still water, so the lid is 0.40 m above it; the bed is 0.10 m off the
    // bottom. At Low that is Δx = 13 mm (the old 12 × 1.2 m box needed
    // Medium for 12 mm) with half the cells: 671 × 67.
    (function () {
      const BED = 0.10, LEV = 0.50, D = LEV - BED;
      const TOE0 = 1.0, SHORE = 5.0;
      const toeOf = (s) => Math.max(TOE0, SHORE - D / s);
      const slopeOf = (par) => (par && par.beach_s !== undefined ? par.beach_s : 0.06);
      return {
        id: "beach", name: "Wave flume · breakers on a beach", key: "Iribarren, one slider",
        group: "Jets & waves",
        blurb: "A paddle at the left end of a flume makes the same wave every time; the wave runs onto a beach whose slope is one slider. Gentle: the crest crumbles and spills all the way in. Steep: the front surges up the slope and runs back without breaking.",
        // c = 14, not the flumes' 26: the substep is acoustic, Δt ∝ Δx/(c + 6),
        // so this alone is 1.6× the speed. gd/c² = 2% compression at the bed;
        // measured, H along the flume and the run-up moved by under 5 mm
        // between c = 12, 16 and 26.
        W: 9.0, H: 0.90, c: 14, cf: 0.010, cs: 0.08, bulk: 0.03, ca: 0.8,
        mode: 0, hmax: 0.75, vmax: 1.6,
        open: [1, 0, 0, 0],
        // Stroke amplitude 0.14 m: the wall paddle loses nothing to a pocket
        // behind it, so it makes the old piston's 0.18 m wave with less.
        wave: { amp: 0.14, period: 2.0, on: 1, x: 0, d: 0.40 },
        particles: 1, plife: 6,
        spinup: 0,
        params: [{ key: "beach_s", label: "Beach slope tanβ", min: 0.06, max: 0.70, step: 0.01,
                   value: 0.06, unit: "", resetWater: true,
                   fmt: (v) => v.toFixed(2) + "  (1 : " + (1 / v).toFixed(1) + ")" }],
        solids: (W_, H_, P_, par) => {
          const s = slopeOf(par), xt = toeOf(s), zTop = H_ + 0.5;
          // One CCW polygon: the flat bed, the toe, and the beach rising to
          // the right edge (or leaving through the top first on a steep one).
          const xr = W_ + 0.5, zr = BED + s * (xr - xt);
          const top = zr <= zTop ? [[xr, zr]] : [[xr, zTop], [xt + (zTop - BED) / s, zTop]];
          return [GEOM.poly([[-0.5, -0.5], [xr, -0.5]].concat(top, [[xt, BED], [-0.5, BED]]),
            [{ id: "beach", label: "Beach face", e0: 2 + top.length - 1, e1: 2 + top.length - 1 },
             { id: "bed", label: "Flume bed", e0: 3 + top.length - 1, e1: 3 + top.length - 1 }], "beach")];
        },
        water: (x, z, P, par) => {
          const s = slopeOf(par), xt = toeOf(s);
          return z > BED && z < LEV && x < xt + (z - BED) / s ? still(LEV, z, P) : 0;
        },
        tips: ["One slider: the beach slope. The wave is the same every time — the paddle's stroke and period do not change.",
               "Iribarren ξ = tanβ/√(H₀/L₀): spilling below about 0.5, plunging 0.5–3.3, surging above 3.3.",
               "Gentle beach: the wave shoals, steepens, and its crest crumbles down the front — spilling, a long surf zone.",
               "Steep beach: the front never steepens enough to break; it surges up the slope and slides back, and much of the wave reflects.",
               "A real plunging breaker throws a tongue of water over a trapped air tube. That tongue is thinner than this model's interface, so here the front collapses instead of curling."] };
    })(),
  ];

  const byId = {};
  const scenes = list.map((s) => {
    const full = Object.assign({}, base, s);
    full.inflow    = Object.assign({}, base.inflow, s.inflow || {});
    full.tailwater = Object.assign({}, base.tailwater, s.tailwater || {});
    full.wave      = Object.assign({}, base.wave, s.wave || {});
    full.source    = Object.assign({}, base.source, s.source || {});
    full.tips      = s.tips || [];
    byId[full.id] = full;
    return full;
  });

  return { list: scenes, byId, still, channel };
})();
