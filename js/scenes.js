"use strict";
/**
 * scenes.js — teaching set-ups.
 *
 * A scene is geometry (wall segments, in metres) plus boundary controls. The
 * domain is a fixed physical rectangle W × H; the grid is sized to a cell
 * budget and the canvas letterboxes it, so a scene behaves identically
 * whatever shape the window is.
 *
 *   seg = [x0, y0, x1, y1, thickness]
 *
 * is a straight edge with BUTT ends — exactly what the left-drag tool
 * produces, so every scene here is something you could have drawn yourself.
 * x0,y0 → x1,y1 is the centreline, so a bed whose top face should sit at
 * z has its centreline at z − thickness/2.
 *
 * Two rules learned the hard way:
 *  · Ground must be solid all the way down. A thin slab leaves a sealed void
 *    underneath that fills through any opening and then drowns the outfall
 *    above it. Beds are drawn thick enough to reach below y = 0.
 *  · A Dirichlet level boundary applies over the whole ghost column below
 *    that level, so anything you do not want flooded needs a wall at x = 0.
 *  · A subcritical reach needs a real downstream control — a tailwater level
 *    or a brink. The open boundary is zero-gradient, which is correct for
 *    supercritical outflow but simply ponds a subcritical one.
 */
const SCENES = (() => {

  // Hydrostatic fill: the equilibrium f for still water standing at `lev`.
  // Starting here rather than at f = 1 avoids a spurious water-hammer
  // transient the moment a scene loads.
  const still = (lev, y, P) => (y < lev ? 1 + P.g * (lev - y) / (P.c * P.c) : 0);

  const base = {
    W: 8, H: 4.5, g: 9.81, c: 25, cf: 0.03, cs: 0.16, nu: 1e-5,
    slip: 0, bulk: 0.10, ca: 0.6, mode: 0, dyeLine: 0, chan: 0,
    group: "Other",
    open: [0, 0, 0, 0],                    // L R B T
    inflow: { level: 0, q: 0, on: 0, free: 0 },
    tailwater: { level: 0, on: 0 },
    wave: { amp: 0, period: 1.5, on: 0, x: 0.15 },
    source: { on: 0, x: 0.5, y: 4.0, r: 0.12, vx: 1.2, vy: -1.6 },
    walls: () => [],
    water: () => 0,
  };

  // ------------------------------------------------------- channel builder
  //
  // Every gradually-varied-flow scene is the same prismatic channel with
  // different controls bolted on, so they are all generated from one place.
  // The two numbers that decide everything:
  //
  //     y_c = (q²/g)^⅓                        critical depth
  //     y_n = [ C_f q² / (2.8 g S₀) ]^⅓        normal depth
  //
  // The 2.8 is the same wall-function-to-Manning factor the overlay uses
  // (OVERLAY.KN); it drops out of the ratio, which is all that matters:
  //
  //     y_n / y_c = [ C_f / (2.8 S₀) ]^⅓   →   mild if C_f > 2.8 S₀,
  //                                            steep if C_f < 2.8 S₀,
  //                                            critical if equal.
  //
  // So each profile below is produced by choosing S₀ and C_f either side of
  // that line, then adding the control (weir, gate, brink, tailwater) that
  // puts the depth in zone 1, 2 or 3.
  const TH = 1.4;                          // bed thickness — reaches below y=0

  function channel(o) {
    const W = o.W, H = o.H, S0 = o.S0, xEnd = o.xEnd === undefined ? W : o.xEnd;
    const xB = o.xBreak === undefined ? xEnd : o.xBreak;     // break in grade
    const S0b = o.S0b === undefined ? S0 : o.S0b;
    const bedTop = (x) => {
      const t = Math.min(Math.max(x, 0), xEnd);
      return t <= xB ? o.bed0 - S0 * t : o.bed0 - S0 * xB - S0b * (t - xB);
    };
    const off = (TH / 2) * Math.sqrt(1 + S0 * S0);
    const offB = (TH / 2) * Math.sqrt(1 + S0b * S0b);
    const outBed = bedTop(xEnd);
    const inLevel = o.bed0 + o.inletDepth;
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
        ? [[x0, o.bed0 - off - S0 * x0, xEnd + e, outBed - off - S0 * e, TH]]
        : [[x0, o.bed0 - off - S0 * x0, xB, bedTop(xB) - off, TH],
           [xB, bedTop(xB) - offB, xEnd + e, outBed - offB - S0b * e, TH]];
      if (o.gate) w.push([o.gate.x, bedTop(o.gate.x) + o.gate.a, o.gate.x, H, 0.05]);
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
    const ynE = S0 > 1e-5 ? Math.pow(o.cf * o.q * o.q / (2.8 * 9.81 * S0), 1 / 3) : ycE * 1.6;
    const d0 = o.start === undefined ? Math.min(Math.max(ycE, ynE), 0.6) : o.start;
    const crest = o.weir ? bedTop(o.weir.x) + o.weir.h : -1e9;
    const water = (x, y, P) => {
      if (x >= xEnd || y <= bedTop(x)) return 0;
      let lev;
      if (o.gate && x < o.gate.x) lev = inLevel;                 // pool behind the gate
      else if (o.weir && x < o.weir.x) lev = Math.max(crest, bedTop(x) + d0);
      else lev = Math.max(bedTop(x) + d0, twLevel);
      return still(lev, y, P);
    };

    return Object.assign({
      chan: 1, group: "Open channel — surface profiles",
      W, H, c: 22, cf: o.cf, cs: o.cs === undefined ? 0.16 : o.cs,
      mode: o.mode === undefined ? 3 : o.mode,
      hmax: o.hmax || 0.5, vmax: o.vmax || 2.5,
      spinup: o.spinup || 25, dyeLine: o.dyeLine || 0,
      open: [1, 1, xEnd < W - 1e-6 ? 1 : 0, 0],
      inflow: { level: inLevel, q: o.free ? 0 : o.q, on: 1, free: o.free ? 1 : 0 },
      tailwater: o.tail === undefined ? { level: 0, on: 0 } : { level: twLevel, on: 1 },
      walls, water,
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
    const W = o.W, H = o.H, S0 = o.S0 || 0;
    const apron = (x) => o.lo - S0 * (Math.min(Math.max(x, o.xb), W) - o.xb);
    const off = (TH / 2) * Math.sqrt(1 + S0 * S0);
    const sr = (o.hi - o.lo) / (o.xb - o.xa);                 // drop face slope
    const offR = (TH / 2) * Math.sqrt(1 + sr * sr);
    // The face is butt-cut perpendicular to its axis, so started AT the crest
    // its top corner surfaces ~half a thickness downstream, leaving a notch
    // in the bed right at the brink. Start it upstream by the corner
    // recession (overlapping the approach slab, which is harmless).
    const ext = (TH / 2) * sr / Math.sqrt(1 + sr * sr) * 1.3;
    const twLevel = apron(W) + o.tail;
    const inLevel = o.hi + o.inletDepth;
    return Object.assign({
      chan: 1, group: "Open channel — surface profiles",
      id: o.id, name: o.name, key: o.key, blurb: o.blurb, tips: o.tips,
      W, H, c: 22, cf: o.cf, cs: o.cs === undefined ? 0.10 : o.cs,
      mode: o.mode === undefined ? 3 : o.mode,
      hmax: o.hmax || 0.5, vmax: o.vmax || 4, spinup: o.spinup || 26,
      open: [1, 1, 0, 0],
      inflow: { level: inLevel, q: o.q, on: 1, free: 0 },
      tailwater: { level: twLevel, on: 1 },
      walls: () => [
        [-1.0, o.hi - TH / 2, o.xa, o.hi - TH / 2, TH],                       // approach
        [o.xa - ext, o.hi - offR + ext * sr, o.xb, o.lo - offR, TH],          // drop face
        [o.xb, o.lo - off, W + 1, apron(W + 1) - off, TH],                    // apron
      ],
      water: (x, y, P) => {
        const bed = x < o.xa ? o.hi : (x < o.xb ? o.hi - sr * (x - o.xa) : apron(x));
        if (y <= bed) return 0;
        const lev = x < o.xa ? inLevel : Math.max(bed + 0.10, twLevel);
        return still(lev, y, P);
      },
    }, o.extra || {});
  }

  const list = [

    { id: "sandbox", name: "Sandbox", key: "Draw the hydraulics", group: "Sandbox",
      blurb: "Water falls in at the top left. Left-drag to draw edges and route it; right-drag for a big flow.",
      W: 9, H: 5, c: 22, cf: 0.02, hmax: 1.2, vmax: 5,
      open: [0, 0, 0, 0],
      source: { on: 1, x: 0.55, y: 4.55, r: 0.14, vx: 1.1, vy: -1.4 },
      walls: () => [
        [0.9, 3.4, 3.2, 2.9, 0.08],
        [4.2, 2.6, 7.0, 2.1, 0.08],
      ],
      tips: ["Left-drag draws a straight edge — build chutes, weirs, pipes.",
             "Right-drag pours a much larger flow wherever you point.",
             "The <b>Spout</b> tool (4) drags the falling inflow anywhere; its velocity is in Controls.",
             "<b>Wheel</b> zooms, <b>middle-drag</b> pans, <b>0</b> resets the view.",
             "Hold <b>shift</b> while drawing to snap to 0° / 45° / 90°.",
             "Controls has everything the scenes use: reservoir, tailwater, open edges, the wave piston.",
             "Close a pipe off completely and the water pressurises: watch the gold sheen."] },

    // ------------------------------------------------- MILD  (C_f > 2.8 S₀)
    // S₀ = 1 in 68, C_f = 0.125  →  y_n ≈ 0.27 m against y_c ≈ 0.19 m.
    Object.assign(channel({
      W: 16, H: 1.05, bed0: 0.35, S0: 0.0147, cf: 0.125, q: 0.25,
      inletDepth: 0.26, weir: { x: 13.4, h: 0.42, w: 0.7 }, xEnd: 14.6,
      mode: 0, hmax: 0.55, vmax: 2.0, spinup: 30, dyeLine: 0.9,
    }), {
      id: "m1", name: "M1 · backwater behind a weir", key: "Mild, zone 1",
      blurb: "A weir on a mild slope holds the depth above normal depth all the way upstream — the M1 backwater curve.",
      tips: ["The weir is the control; the curve is computed <i>upstream</i> from it.",
             "The surface stays above y_n (green) everywhere — zone 1, so M<b>1</b>.",
             "Backwater length scales as y_n/S₀. Drop the roughness and it stretches.",
             "Erase the weir and the same channel relaxes towards M2."] }),

    Object.assign(channel({
      W: 16, H: 0.95, bed0: 0.35, S0: 0.0147, cf: 0.125, q: 0.25,
      inletDepth: 0.26, xEnd: 13.6,
      hmax: 0.45, vmax: 2.0, spinup: 25, dyeLine: 1.2,
    }), {
      id: "m2", name: "M2 · drawdown to a free overfall", key: "Mild, zone 2",
      blurb: "The same mild channel ending in a brink. The surface is drawn down through critical depth at the lip — the M2 curve.",
      tips: ["Colour is Froude number: blue subcritical, red supercritical.",
             "The brink forces critical depth, so the control is downstream.",
             "The surface sits between y_n and y_c — zone 2, so M<b>2</b>.",
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
      W: 16, H: 1.7, hi: 0.85, lo: 0.35, xa: 1.5, xb: 4.0, S0: 0.0147,
      cf: 0.010, cs: 0.06, q: 0.25, inletDepth: 0.30, tail: 0.20,
      hmax: 0.5, vmax: 4, spinup: 30,
      tips: ["Supercritical on the chute, subcritical on the apron — the jump is the only way across.",
             "The jump box compares the measured y₂ against ½y₁(√(1+8Fr₁²) − 1).",
             "Past the jump the depth sits between y_n and y_c: that reach is M<b>2</b>.",
             "Raise the tailwater and the jump marches upstream onto the chute."] }),

    // ------------------------------------------------ STEEP  (C_f < 2.8 S₀)
    // S₀ = 1 in 4, C_f = 0.010  →  y_n ≈ 0.08 m against y_c ≈ 0.114 m.
    Object.assign(channel({
      W: 7, H: 2.8, bed0: 1.90, S0: 0.25, cf: 0.010, cs: 0.08, q: 1.2,
      inletDepth: 0.52, tail: 0.90, start: 0.30,
      hmax: 0.9, vmax: 5, spinup: 26,
    }), {
      id: "s1", name: "S1 · steep bed, drowned outlet", key: "Steep, zone 1",
      blurb: "A steep channel with the tailwater held above critical. The supercritical sheet jumps, and above the jump the surface climbs to the control — an S1 curve.",
      tips: ["On a steep bed y_n sits <i>below</i> y_c, so zone 1 means above both.",
             "The reach downstream of the jump, backed up by the tailwater, is S<b>1</b>.",
             "Lower the tailwater and the jump runs downstream out of the domain.",
             "Upstream of the jump the same channel is running S2."] }),

    Object.assign(channel({
      W: 7, H: 2.4, bed0: 1.55, S0: 0.25, cf: 0.010, cs: 0.08, q: 1.2,
      inletDepth: 0.52, xEnd: 6.0, start: 0.30,
      hmax: 0.7, vmax: 5, spinup: 22,
    }), {
      id: "s2", name: "S2 · chute from a reservoir", key: "Steep, zone 2",
      blurb: "Water spilling from a reservoir onto a steep bed passes through critical at the crest and accelerates down towards normal depth — the S2 curve.",
      tips: ["The control is the crest at the top: critical depth sits at the entrance.",
             "The surface falls from y_c towards y_n from above — zone 2, so S<b>2</b>.",
             "Both y_c and y_n are drawn; note that y_n is the <i>lower</i> one here.",
             "Nothing downstream can influence this reach — it is supercritical throughout."] }),

    Object.assign(channel({
      W: 7, H: 3.0, bed0: 1.40, S0: 0.25, cf: 0.010, cs: 0.08, q: 1.2,
      inletDepth: 1.40, gate: { x: 1.2, a: 0.35 }, xEnd: 6.4, start: 0.28,
      hmax: 0.7, vmax: 6, spinup: 26,
    }), {
      id: "s3", name: "S3 · gate on a steep bed", key: "Steep, zone 3",
      blurb: "A gate opened tighter than normal depth. The flow leaves below y_n and climbs back up towards it — the S3 curve, with no jump anywhere.",
      tips: ["The opening is smaller than y_n, so the depth starts below <i>both</i> depths.",
             "The surface rises asymptotically towards y_n — zone 3, so S<b>3</b>.",
             "No jump anywhere: the flow is supercritical before and after, so none is needed.",
             "Erase the gate and redraw it wider than y_n and the same channel runs S2."] }),

    // ------------------------------------------ CRITICAL  (y_n = y_c)
    // Tuned against the DELIVERED resistance, not the nominal C_f: at this
    // depth-to-Δx the wall function + eddy viscosity + bed staircase deliver
    // far more drag than C_f suggests, so the slope that balances them is
    // 1 in 9.5 with C_f nearly zero. The weir is low (0.12 m) because a
    // broad-crested weir ponds ~1.5 y_c of head above its crest — the old
    // 0.30 m crest drowned the gate and turned the whole reach into one M1
    // pool.
    Object.assign(channel({
      W: 12, H: 2.0, bed0: 1.45, S0: 0.105, cf: 0.02, q: 0.25,
      inletDepth: 0.36, gate: { x: 2.0, a: 0.15 },
      weir: { x: 9.6, h: 0.12, w: 0.7 }, xEnd: 10.8,
      mode: 3, hmax: 0.45, vmax: 3.0, spinup: 28,
    }), {
      id: "c13", name: "C1 / C3 · critical slope", key: "y_n = y_c",
      labels: 0,
      blurb: "The knife edge: a slope where the measured normal depth equals critical depth. Zone 2 vanishes, and the depth hugs y_c along the whole reach.",
      tips: ["The slope is tuned so the <i>measured</i> y_n equals y_c — the dashed lines overlap.",
             "Below the gate is C<b>3</b>; behind the weir is C<b>1</b>. There is no zone 2.",
             "The middle of the reach rides Fr ≈ 1: the Froude colours sit right at the white break.",
             "Profile labels are off here by default: on a knife edge the class genuinely flickers between M, C and S. Turn them on in Controls to watch it.",
             "Nudge the roughness either way and watch it become decisively mild or steep."] }),

    // ------------------------------------------- HORIZONTAL  (S₀ = 0, y_n = ∞)
    drop({
      id: "h23", name: "Hydraulic jump on a level apron", key: "Chute → jump → H2",
      blurb: "A chute onto a flat apron: supercritical sheet, hydraulic jump, then an H2 drawdown to the tailwater. The clearest look at a jump in the set.",
      W: 7.5, H: 1.6, hi: 0.80, lo: 0.15, xa: 1.0, xb: 4.0, S0: 0,
      cf: 0.008, cs: 0.06, q: 0.22, inletDepth: 0.28, tail: 0.17,
      hmax: 0.45, vmax: 4, spinup: 26,
      tips: ["A horizontal bed has no normal depth — y_n is infinite, so there is no zone 1.",
             "The chute runs S2/S3; past the jump the level apron runs H<b>2</b>.",
             "The jump box reports y₁, y₂ and Fr₁ — check y₂/y₁ = ½(√(1+8Fr₁²) − 1).",
             "Energy loss across a jump is (y₂−y₁)³/(4y₁y₂); the EGL drops by exactly that.",
             "Raise the tailwater and the jump slides back up towards the drop."] }),

    // ------------------------------------------------ ADVERSE  (S₀ < 0)
    drop({
      id: "a23", name: "A2 · adverse apron", key: "Uphill",
      blurb: "The apron rises downstream. Gravity now opposes the flow, there is no normal depth, and only zones 2 and 3 exist.",
      W: 7.5, H: 1.7, hi: 0.85, lo: 0.12, xa: 1.0, xb: 4.0, S0: -0.03,
      cf: 0.008, cs: 0.06, q: 0.22, inletDepth: 0.28, tail: 0.16,
      hmax: 0.45, vmax: 4, spinup: 26,
      tips: ["The apron climbs, so S₀ is negative and uniform flow is impossible — no y_n.",
             "Past the jump, running uphill against gravity, the apron is A<b>2</b>.",
             "A2 steepens as it goes: an adverse bed cannot sustain the flow for long.",
             "Flatten the apron back to level and the same two profiles become H2 and H3."] }),

    // -------------------------------------------- pressure and transients
    // A real pipeline, not a lab flume: the static head has to exceed the
    // Joukowsky surge or the downsurge simply cavitates. 49 m of 3 m bore
    // under ~21 m of head, throttled by a nozzle to about 2.8 m/s.
    { id: "hammer", name: "Water hammer", key: "Joukowsky",
      group: "Pressure & transients",
      blurb: "A reservoir feeding a full pipe through a nozzle. Slam the valve and the pressure wave runs back and forth at the slot celerity.",
      W: 60, H: 30, c: 70, cf: 0.004, cs: 0.05, bulk: 0.03, nu: 1e-4,
      valveOpen: 1, spinup: 14,
      mode: 1, headMax: 42, hmax: 22, vmax: 6,
      open: [1, 1, 0, 0],
      spongeIn: 5.5,                           // hold the whole reservoir tank
      inflow: { level: 25.0, q: 0, on: 1, free: 1 },
      walls: () => [
        [0.0, 1.0, 58.5, 1.0, 2.0],              // invert — top face at y = 2.0
        [6.0, 5.35, 58.5, 5.35, 0.7],            // soffit — 3 m clear bore
        [6.0, 5.0, 6.0, 30.0, 0.7],              // reservoir wall above the pipe
        [56.5, 2.0, 56.5, 3.30, 0.5],            // nozzle plate, 0.4 m gap …
        [56.5, 3.70, 56.5, 5.0, 0.5],            // … which sets the pipe velocity
      ],
      valves: () => [[55.0, 2.0, 55.0, 5.0, 0.5]],
      water: (x, y, P) => (x < 5.6 || (y > 2.0 && y < 5.0) ? still(25.0, y, P) : 0),
      tips: ["Drop a <b>gauge</b> on the pipe, then press <b>V</b> to slam the valve.",
             "Upsurge is ΔH = c·Δv/g ≈ 20 m on top of 21 m static — read it off the trace.",
             "The trace is a square wave of period 4L/c ≈ 2.8 s. Halve c and it halves too.",
             "Push the celerity past ~90 m/s and the downsurge hits zero: column separation.",
             "Set wave damping to zero and the oscillation never dies."] },

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
      water: (x, y, P) => (x < 1.5 || (y > 0.72 && y < 1.41) ? still(2.05, y, P) : 0),
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
      water: (x, y, P) => (y > 0.23 ? (x < 2.56 ? still(1.85, y, P) : still(0.40, y, P)) : 0),
      tips: ["Press <b>V</b> to pull the dam out.",
             "The negative wave runs upstream at √(gh₀); the surge front steepens into a bore.",
             "The surge is a moving hydraulic jump — same momentum balance, different frame."] },

    // ------------------------------------------------------ jets and waves
    { id: "jet", name: "Orifice jet", key: "Torricelli", group: "Jets & waves",
      blurb: "A tank with a hole in its wall. Efflux velocity is √(2gh) and the free jet is a ballistic parabola — the vena contracta shows at the lip.",
      W: 6, H: 3.4, c: 26, cf: 0.004, cs: 0.10, mode: 2, vmax: 7, hmax: 2.6,
      open: [0, 1, 1, 0],
      walls: () => [
        [0.30, 0.30, 0.30, 2.70, 0.10],          // overflow lip holds the head steady
        [0.30, 0.25, 2.30, 0.25, 0.60],          // tank floor, solid to the ground
        [2.30, 0.30, 2.30, 1.30, 0.10],          // orifice, 1.30 → 1.42
        [2.30, 1.42, 2.30, 3.40, 0.10],
      ],
      source: { on: 1, x: 1.10, y: 3.15, r: 0.13, vx: 0.1, vy: -1.6 },
      water: (x, y, P) => (x > 0.38 && x < 2.25 && y > 0.55 ? still(2.70, y, P) : 0),
      tips: ["Jet speed should be √(2g·h) with h measured from the free surface.",
             "The spout keeps the head topped up and the lip spills the excess.",
             "Turn the spout off and watch the jet decay as the tank empties.",
             "Draw a short lip outside the hole to make a Borda mouthpiece."] },

    { id: "wave", name: "Wave flume", key: "Linear waves", group: "Jets & waves",
      blurb: "A piston wavemaker on still water with a beach. Watch celerity, shoaling and orbital motion — turn particles on for the orbits.",
      W: 12, H: 1.5, c: 26, cf: 0.010, cs: 0.08, bulk: 0.03, ca: 0.8,
      mode: 0, hmax: 1.1, vmax: 1.2,
      open: [0, 0, 0, 0],
      wave: { amp: 0.055, period: 1.5, on: 1, x: 0.30 },
      walls: () => [
        [0.0, -0.14, 8.2, -0.14, 0.80],          // flat bed, top at 0.26
        [8.2, -0.74, 11.9, 0.36, 2.00],          // beach, 1 : 3.4
      ],
      water: (x, y, P) => (y > 0.26 && y < 1.00 && x < 8.2 + (y - 0.26) * 3.36
                            ? still(1.00, y, P) : 0),
      tips: ["Turn <b>particles</b> on: circular orbits in deep water, flat ellipses at the bed.",
             "Celerity is c = √(g/k · tanh kh) — time a crest across the 1 m grid.",
             "Shorten the period until the orbits stop reaching the bed: deep water.",
             "Watch the waves shoal and steepen up the beach, then break."] },

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
