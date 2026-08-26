/* CS-1 · The CSO chamber — rig card.
 *
 * Paste into the dev console on ?scene=sandbox, then:
 *   CS1.build({presses: 0})            // 6-cell throttle (-4 -> 2, -2 -> 4, +1 -> 8)
 *   CS1.state()                        // delivered geometry, read off the mask
 *   CS1.win(6)                         // 6 s time-median: chamber level, sewer q, spill q
 *   CS1.storm(2.4)                     // set the storm (spout velocity ->, m/s)
 *   CS1.ramp({vx0:1.7, dvx:0.10, hold:14})   // the instrumented ramp
 *   CS1.qSpill(rows)                   // interpolate q at first spill
 *   CS1.precharge({x0:.4,x1:2.7,y:3.1})      // the foul load (right-drag pour)
 *
 * The storm is the SPOUT, not the reservoir: a pinned reservoir level cannot
 * follow a q ramp (0.15 m of level = +17 % of delivered q -- measured).
 *
 * Geometry (all elevations above the domain floor, Medium = 414x230, dx 21.739 mm):
 *   feed invert (incoming sewer)  z = 3.00      x = -0.3 .. 3.00
 *   chamber floor  (top face)     z = 1.50      x = 2.95 .. 4.60
 *   overflow crest (top of plate) z = 2.50      x = 4.50   -> head at spill 1.00 m
 *   throttle shaft (to treatment) x = 4.00, cut through the floor slab
 * Everything that leaves the chamber falls clear into open air and off the
 * draining bottom edge: nothing downstream can back up into the measurement.
 */
window.CS1 = (function () {
  const C  = (id) => CONTROLS.find(c => c.id === id);
  const DX = () => APP.sim.dx;

  // The ERASE tool draws with thickness = brush * 2.2 (js/main.js:540). This is
  // the keyboard ladder the student uses: presses of [ (negative) or ] (positive)
  // from the default brush of 0.055 m.
  const BRUSH0 = 0.055;
  const brushAt = (presses) => BRUSH0 * Math.pow(1.3, presses);
  const eraseTh = (presses) => brushAt(presses) * 2.2;

  const GEO = {
    feedY:  3.00,   // top face of the incoming sewer invert
    feedX1: 3.00,   // brink: the sewer discharges into the chamber here
    floorY: 1.50,   // chamber floor, top face
    floorT: 0.20,   // floor slab thickness  (= the throttle's barrel length)
    floorX0: 2.95, floorX1: 4.60,
    crestX: 4.50, crestY: 2.50, crestT: 0.05,   // overflow weir plate
    shaftX: 4.00,                                // throttle, on the 4 m grid line
    gaugeX: 4.25, gaugeY: 1.62,
    spoutX: 0.75, spoutY: 3.16, spoutR: 0.10,    // the storm inflow, INSIDE the sewer
    readX: 2.00,                                 // where q is read off the sewer
  };

  function build(o) {
    o = o || {};
    const g = Object.assign({}, GEO, o);
    const presses = (o.presses !== undefined) ? o.presses : 0;
    const th = (o.th !== undefined) ? o.th : eraseTh(presses);

    if (o.budget !== false) C('budget').set(o.budget || 'Medium');
    APP.loadScene('sandbox', false);
    if (o.budget !== false) C('budget').set(o.budget || 'Medium');
    const S = APP.SIM;
    S.clearSegs();

    // 1 · erase the sandbox's two ledges (Clear does not remove scene walls)
    S.addSeg(0.6, 3.5, 3.5, 2.85, 0.45, 0);
    S.addSeg(3.2, 2.62, 7.1, 1.95, 0.45, 0);

    // 2 · the incoming sewer: a slab from off the left edge to the brink
    S.addSeg(-0.4, g.feedY - 0.10, g.feedX1, g.feedY - 0.10, 0.20, 255);
    // 3 · the chamber's upstream wall, hanging from the sewer invert
    S.addSeg(g.feedX1, g.floorY - g.floorT + 0.05, g.feedX1, g.feedY - 0.05, 0.10, 255);
    // 4 · the chamber floor
    S.addSeg(g.floorX0, g.floorY - g.floorT / 2, g.floorX1, g.floorY - g.floorT / 2, g.floorT, 255);
    // 5 · the overflow weir plate (thin, sharp-crested)
    S.addSeg(g.crestX, g.floorY - g.floorT + 0.05, g.crestX, g.crestY, g.crestT, 255);
    // 6 · THE THROTTLE — a vertical erase stroke through the floor slab.
    //     Its WIDTH is the brush, not the aim: that is the whole reason it is
    //     cut this way (cf. QS-2's valve-stroke-on-the-bottom-edge trick).
    S.addSeg(g.shaftX, g.floorY + 0.06, g.shaftX, g.floorY - g.floorT - 0.06, th, 0);

    // 7 · panel
    const P = APP.sim.p;
    P.open[0] = 0; P.open[1] = 1; P.open[2] = 1; P.open[3] = 0;   // L,T wall; R,B open
    S.rasterise();
    C('twOn').set(false);
    C('inflowOn').set(false);
    // The storm arrives as a prescribed jet in the incoming sewer, NOT as a
    // level-controlled reservoir: a pinned level cannot follow a q ramp (0.15 m
    // of level error delivers +17 % of q through the relaxation sponge —
    // measured; see the README's verification record).
    const S2 = APP.sim.p.source;
    S2.on = 1; S2.x = g.spoutX; S2.y = g.spoutY; S2.r = g.spoutR;
    S2.vx = (o.vx !== undefined ? o.vx : 0.5); S2.vy = 0;
    C('gaugeField').set('d');
    C('dye').set(true);
    C('dyeDecay').set(0);
    APP.state.gauges.length = 0;
    APP.state.gauges.push({ x: g.gaugeX, y: g.gaugeY, hist: [], colour: "#7fd4ff" });
    syncPanel();
    return state();
  }

  /* Delivered geometry, read off the rasterised mask — never assumed. */
  function state() {
    const s = APP.sim, dx = s.dx, m = s.mask, nx = s.nx;
    const jf = Math.round((GEO.floorY - GEO.floorT / 2) / dx);   // mid-slab row
    let cells = 0, x0 = null, x1 = null;
    for (let i = Math.round(3.15 / dx); i < Math.round(4.42 / dx); i++) {
      if (!m[jf * nx + i]) { cells++; if (x0 === null) x0 = i; x1 = i; }
    }
    // crest: highest solid row in the plate column, ignoring the domain's own top
    const ic = Math.round(GEO.crestX / dx);
    let jc = 0; for (let j = 0; j < s.ny; j++) if (m[j * nx + ic] && j * dx < 3.2) jc = j;
    // floor: highest solid row in a column left of the shaft
    const ifl = Math.round(3.4 / dx);
    let jfl = 0; for (let j = 0; j < s.ny; j++) if (m[j * nx + ifl] && j * dx < 2.4) jfl = j;
    return {
      gapCells: cells, gap: +(cells * dx).toFixed(4),
      shaftX0: x0 === null ? null : +(x0 * dx).toFixed(3),
      crest: +((jc + 1) * dx).toFixed(4), floor: +((jfl + 1) * dx).toFixed(4),
      head: +(((jc + 1) - (jfl + 1)) * dx).toFixed(4), dx: +dx.toFixed(6),
    };
  }

  /* Time-median over a window of SIM-SECONDS. Reading a single frame is
   * meaningless here: the plunging inflow slops the chamber +/- 60 mm. */
  function window_(secs, samples) {
    secs = secs || 6; samples = samples || 30;
    const dx = APP.sim.dx, n = Math.max(1, Math.round((secs / samples) / APP.SIM.dt()));
    const iG = Math.round(GEO.gaugeX / dx), iQ = Math.round(GEO.readX / dx),
          iS = Math.round((GEO.crestX + 0.09) / dx);
    const L = [], Q = [], S = [];
    for (let k = 0; k < samples; k++) {
      APP.tick(n);
      const c = APP.SIM.columns(true);
      L.push(c[iG * 4] + c[iG * 4 + 1]);      // chamber surface elevation
      Q.push(c[iQ * 4 + 2]);                   // q in the incoming sewer
      S.push(Math.abs(c[iS * 4 + 2]));         // q over the crest, to the river
    }
    const med = (a) => { a = a.slice().sort((p, q) => p - q); return a[a.length >> 1]; };
    return { h: +med(L).toFixed(4), qin: +med(Q).toFixed(4), qspill: +med(S).toFixed(5),
             hlo: +Math.min.apply(null, L).toFixed(3), hhi: +Math.max.apply(null, L).toFixed(3),
             t: +APP.sim.t.toFixed(1) };
  }

  const storm = (vx) => { APP.sim.p.source.vx = vx; syncPanel(); return vx; };

  /* One student ramp step: set the storm, hold, then read the window. */
  function step(vx, hold, win) {
    storm(vx);
    APP.tick(Math.round((hold || 14) / APP.SIM.dt()));
    const r = window_(win || 6); r.vx = +vx.toFixed(3);
    return r;
  }

  /* The instrumented ramp.
   * SPILL CRITERION: the 6 s MEDIAN chamber level stands at least one cell
   * (21.7 mm) above the crest. The crest-column discharge is NOT usable as the
   * instrument — the nappe there is falling, so its horizontal flux reads ~0.002
   * while a 60 mm head is pouring over. The level is also what the student's own
   * gauge card shows, so instrument and eye agree by construction. */
  const SPILL = () => GEO.crestY + APP.sim.dx;                 // 2.5217 m
  function ramp(o) {
    o = o || {};
    let vx = o.vx0 === undefined ? 0.5 : o.vx0;
    const dvx = o.dvx || 0.05, hold = o.hold || 14;
    const rows = [], lim = o.thr === undefined ? SPILL() : o.thr;
    for (let n = 0; n < (o.max || 16); n++) {
      const r = step(vx, hold, o.win); rows.push(r);
      if (r.h > lim && rows.length > 1 && rows[rows.length - 2].h > GEO.crestY) break;
      vx += dvx;
    }
    return rows;
  }

  /* Linear interpolation of the crossing: q at which h reaches crest + 1 cell. */
  function qSpill(rows) {
    const lim = SPILL();
    for (let k = 1; k < rows.length; k++) {
      if (rows[k].h >= lim && rows[k - 1].h < lim) {
        const f = (lim - rows[k - 1].h) / (rows[k].h - rows[k - 1].h);
        return +(rows[k - 1].qin + f * (rows[k].qin - rows[k - 1].qin)).toFixed(4);
      }
    }
    return null;
  }

  /* The overnight foul load: the right-drag pour, called the way main.js does.
   * Students do it by RIGHT-DRAGGING along the incoming sewer. */
  function precharge(o) {
    o = o || {};
    const x0 = o.x0 === undefined ? 0.35 : o.x0, x1 = o.x1 === undefined ? 2.6 : o.x1;
    const y = o.y === undefined ? 3.14 : o.y, r = o.r === undefined ? 0.22 : o.r;
    const steps = o.steps || 26, per = o.per || 0.06;   // sim-seconds per step
    for (let k = 0; k <= steps; k++) {
      const x = x0 + (x1 - x0) * k / steps;
      APP.sim.p.pour = { x: x, y: y, r: r, vx: 1.2, vy: 0 };
      APP.tick(Math.round(per / APP.SIM.dt()));
    }
    APP.sim.p.pour = null;
    return { dyed: [x0, x1], y: y };
  }

  return { C, GEO, build, state, win: window_, storm, step, ramp, qSpill, SPILL, precharge,
           brushAt, eraseTh };
})();
