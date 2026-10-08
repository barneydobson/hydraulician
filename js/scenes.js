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

    // NC-2's gauging reach: one prismatic channel run at two discharges, so a
    // current-meter rule can be tried on a vertical shallower than 0.75 m and
    // on one deeper — the depth at which the 0.6-depth method hands over to
    // the 0.2/0.8 pair. Both flows share the bed, the slope and the roughness;
    // the Geometry switch `flow` changes only q and the two level controls,
    // and refills the reach (resetWater), exactly as DA-1's Fluid switch does.
    //   Held uniform at BOTH ends, not by a brink: the backwater length
    // d(1 − Fr²)/(10/3 · S₀) is ~45 m shallow and ~90 m deep, so a brink's M2
    // would reach the inlet. The inlet is pinned at the measured normal depth
    // (channel() adds the velocity head) and the tailwater stands at it too,
    // which is how a laboratory flume is set to uniform flow with its tailgate.
    //   The switch writes q and the two levels into the live params only when
    // it MOVES (`P.gaugeFlow` remembers which set is in force). A rasterise
    // from anything else — an edge toggled, a resolution change — leaves a
    // hand-set q or level alone, so the sandbox rule still holds.
    //   The start is the answer: uniform depth and a log-law u, from
    // u* = √(g S₀ d) and κ = 0.41 about the reach's own mean V = q/d. From
    // rest the deep reach takes a whole flow-through to establish.
    (() => {
      const KAPPA = 0.41;
      const reach = { W: 24, H: 1.6, bed0: 0.20, S0: 0.0025, cf: 0.25, tilt: true,
                      vmax: 2.2, dyeLine: 0 };
      const FLOWS = [
        { q: 0.40, d: 0.44 },               // shallow: under the 0.75 m line
        { q: 1.70, d: 1.00 },               // deep: over it
      ];
      // The reservoir has to supply the energy a DEVELOPED profile carries,
      // d + αV²/2g, not a plug's d + V²/2g. channel()'s level assumes α = 1;
      // short of the α head the inlet chokes (the failure the engineering
      // notes describe) — on the deep run a drawdown to Fr ≈ 1 a few
      // decimetres in, then a roller whose slow surface the flow carries the
      // whole length of the reach. α here is the log law's own,
      // 1 + 3a² − 2a³ with a = u*/(κV): 1.13 deep, 1.19 shallow.
      const alphaOf = (F) => {
        const a = Math.sqrt(9.81 * reach.S0 * F.d) / (KAPPA * F.q / F.d);
        return 1 + 3 * a * a - 2 * a * a * a;
      };
      const make = (F) => {
        const c = channel(Object.assign({}, reach,
          { q: F.q, inletDepth: F.d, tail: F.d, start: F.d }));
        const head = (alphaOf(F) - 1) * F.q * F.q / (2 * 9.81 * F.d * F.d);
        c.inflow = Object.assign({}, c.inflow, { level: c.inflow.level + head });
        return c;
      };
      const C = FLOWS.map(make);
      const which = (par) => (par && par.flow > 0.5 ? 1 : 0);
      return Object.assign({}, C[0], {
        id: "gauging", name: "Gauging reach", key: "Uniform, 1 in 400",
        mode: 2, hmax: 1.2, spinup: 30,
        params: [{ key: "flow", label: "Flow", min: 0, max: 1, step: 1, value: 0, unit: "",
                   resetWater: true,
                   fmt: (v) => (v > 0.5 ? "deep: q = 1.70 m²/s, d ≈ 1.0 m"
                                        : "shallow: q = 0.40 m²/s, d ≈ 0.44 m") }],
        solids: (W, H, P, par) => {
          const k = which(par);
          if (P.gaugeFlow !== k) {
            P.gaugeFlow = k;
            Object.assign(P.inflow, C[k].inflow);
            Object.assign(P.tailwater, C[k].tailwater);
          }
          return [];
        },
        water: (x, z, P, par) => C[which(par)].water(x, z, P),
        flow: (x, z, P, par) => {
          const F = FLOWS[which(par)], h = z - reach.bed0;
          if (h <= 0 || h >= F.d) return null;
          const V = F.q / F.d, us = Math.sqrt(9.81 * reach.S0 * F.d);
          return [Math.max(0, V + (us / KAPPA) * (1 + Math.log(h / F.d))), 0];
        },
        blurb: "A long, straight mild channel held at uniform flow, with a switch for a shallow run (0.44 m) and a deep one (1.0 m) — the place to try the current-meter rules against the whole profile.",
        tips: ["Colour is speed: the water is fastest at the surface and slows towards the bed.",
               "Controls → Geometry → Flow switches between the shallow and the deep run, and refills the reach.",
               "A Rake (6) draws u against depth; its V is the full depth-integral of that curve.",
               "Hover anywhere in the water: the box prints u at the cursor, the depth d and the level η.",
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
    // Levels: 4.00 m left, 3.10 m right, both well above the culvert roof at
    // 1.60 m, so the culvert stays drowned throughout. The right basin is
    // narrow so it fills in seconds when the valve opens; the common level
    // follows from the volume the left body loses (its plan area shrinks as
    // it drops down the slope) — 3.82 m here, measured and closed-form.
    // The ground top sits at 1.0 m, not near the floor, so the pressure
    // diagram the Force tool hangs under the culvert roof has room to draw.
    //
    // nu is an EDDY viscosity, not water's. At the stock 1e-5 the jet that
    // fills the small basin leaves a trapped eddy that never dies: 0.2 m/s
    // RMS in both basins 60 s after V with the levels long since equal, and
    // still 0.1 m/s at 150 s — a hydrostatics demo whose water will not
    // stand still. Raising C_s to 0.4 or C_f to 0.05 barely moved it; 1e-3
    // took the basins to 4 mm/s by 60 s, 2e-3 to under 5 mm/s by 45 s with
    // the fill itself unchanged (culvert RMS 0.33 m/s at 12 s either way).
    { id: "dyke", name: "Dyke with a piezometer", key: "Hydrostatics",
      group: "Hydrostatics",
      blurb: "Two reservoirs at different levels either side of a dyke, joined by a shut culvert with a piezometer tapped into its roof. Read the three levels and the face forces, then press V and watch them find one level.",
      W: 6.0, H: 5.1, c: 25, cf: 0.01, cs: 0.16, nu: 2e-3, mode: 0,
      hmax: 4.2, headMax: 3.3, vmax: 4,
      valveOpen: 0, particles: 1,
      open: [0, 0, 0, 0],
      solids: () => {
        const zg = 1.00, zr = 1.60, zc = 4.30;            // ground top, culvert roof, crest
        const xt = 2.40, zt = 2.40, xs = 3.30;            // toe, top of the toe, slope meets crest
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
      valves: () => [[5.00, 1.00, 5.00, 1.60, 0.08]],   // across the culvert, downstream of the tap
      water: (x, z, P) => (z <= 1.00 ? 0
                           : x < 5.00 ? still(4.00, z, P)   // left basin, culvert, piezometer
                           : still(3.10, z, P)),            // right basin
      tips: ["Three water surfaces, one level: the left basin, the culvert and the piezometer are the same connected body.",
             "Hover the dyke's faces with the <b>Pressure force</b> tool — the sloped upstream face carries ½ρg·d² sideways AND the weight of the water standing on the slope downward; the vertical downstream face only the first.",
             "Press <b>V</b> to open the culvert. The narrow right basin fills in seconds; the common level is where the volume the left body loses equals what the right one gains.",
             "Once still again — about 45 s — both faces carry the same horizontal force: the dyke feels no net thrust.",
             "Switch the field to Piezometric head — still water is one colour everywhere, however deep."] },

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
