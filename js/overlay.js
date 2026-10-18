"use strict";
/**
 * overlay.js — the 2D canvas that sits on top of the field.
 *
 * Everything here is derived from the per-column reduction (bed, depth, unit
 * discharge) that the GPU hands back each frame: critical and normal depth,
 * the energy grade line, the surface-profile classification (M1, M2, S2 …),
 * gauge traces and the velocity rake. This is the part that turns a pretty
 * fluid into a hydraulics lesson.
 *
 * Defines: OVERLAY
 *
 * Reads:   CV_EDGES, FMT, GEOM, SIM, sim
 */
const OVERLAY = (() => {

  // Normal depth and Manning's n are MEASURED, not assumed.
  //
  // The solver's bed friction is a wall function acting over one near-bed
  // cell, and the no-slip wall adds stress through the eddy viscosity as
  // well, so the depth-averaged resistance you actually get depends on C_f,
  // on C_s and on Δx. Any fixed conversion factor is wrong somewhere.
  //
  // Instead, read the friction slope straight off the computed energy grade
  // line, S_f = −dH/dx. Any quadratic drag law gives S_f ∝ q²/d³ at fixed q,
  // so the depth at which S_f would equal the bed slope is
  //
  //     d_n = d · (S_f / S₀)^⅓
  //
  // and Manning's n follows from its own definition, n = d^⅔ √S_f / V. Both
  // are then guaranteed consistent with whatever the solver is really doing.
  const EMA = 0.06;                       // temporal smoothing of the estimate

  /** The one canvas type stack (the overlay used two: with and without
   *  SFMono-Regular; the first, more common, one won). `mono(px, weight)`
   *  is the whole font string. */
  const FONT = {
    stack: "ui-monospace, SFMono-Regular, monospace",
    mono: (px, weight) => (weight ? weight + " " : "") + px + "px " + FONT.stack,
  };
  const TAU = 2 * Math.PI;

  const C = {
    dc: "#ffb648", dn: "#5fd08a", egl: "#cfe3f5", hgl: "#ff9de2", surf: "#7fd4ff",
    sline: "rgba(245,250,255,0.9)", slineHalo: "rgba(8,14,22,0.55)",
    dim: "rgba(223,232,242,0.55)", grid: "rgba(223,232,242,0.13)",
    // the instrument glyphs main.js draws, named once beside the rest
    res: "#7fd4ff", tw: "#5fd08a", piston: "#ffb648", spout: "#7fd4ff",
  };

  /** A filled triangular arrowhead: apex at (x, y), pointing along `angle`
   *  (screen radians), `len` back to a base of half-width `half` (default
   *  len / 2). The caller has set fillStyle. */
  function arrowHead(ctx, x, y, angle, len, half) {
    const ux = Math.cos(angle), uy = Math.sin(angle), h = half === undefined ? len / 2 : half;
    const bx = x - ux * len, by = y - uy * len, px = -uy, py = ux;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx + px * h, by + py * h);
    ctx.lineTo(bx - px * h, by - py * h);
    ctx.closePath(); ctx.fill();
  }

  /** Manning n from its definition, given a measured friction slope. */
  function manning(d, V, Sf) {
    if (!(Sf > 0) || Math.abs(V) < 1e-4 || d < 1e-4) return NaN;
    return Math.pow(d, 2 / 3) * Math.sqrt(Sf) / Math.abs(V);
  }

  /** Surface-profile class at one column: letter (bed slope) + zone (1/2/3).
   *  The C band is ±5% — d_n is measured off the energy line, and a tighter
   *  band makes a genuinely critical reach flicker between M and S. */
  function classify(d, dn, dc, S0) {
    let letter;
    if (S0 > 2e-4) letter = dn > dc * 1.05 ? "M" : (dn < dc * 0.95 ? "S" : "C");
    else if (S0 < -2e-4) letter = "A";
    else letter = "H";
    let zone;
    if (letter === "H" || letter === "A") zone = d > dc ? 2 : 3;
    else {
      const hi = Math.max(dn, dc), lo = Math.min(dn, dc);
      zone = d > hi ? 1 : (d > lo ? 2 : 3);
    }
    return letter + zone;
  }

  /** Everything the open-channel overlay needs, per column.
   *
   *  Bed slope needs care. The bed is rasterised to whole cells, so a 1-in-70
   *  channel is a staircase of a handful of huge steps across the whole
   *  domain — differencing it directly reads S₀ = 0 almost everywhere and ∞
   *  at the steps. And a flume ends in a brink, which is a cliff.
   *
   *  So: take a running mean of the per-cell bed drops, but DROP the outliers
   *  rather than clipping them. A rasterisation step is exactly one cell, so
   *  it must be kept (throwing it away, or clipping it, is what makes the
   *  answer come out low). A cliff is tens of cells, and must be excluded
   *  entirely — clipping it still leaves it polluting the average.
   */
  const CLIFF = 2.5;                                 // cells per column

  // The running estimates analyse() carries between frames — the per-column
  // depth and discharge time averages (hA, qA) and the domain-wide normal-depth
  // constant (ynK) — live here, keyed by the grid they describe, rather than
  // on SIM's grid object. A rebuilt grid is a new key and starts clean.
  const ESTIMATES = new WeakMap();

  function analyse(sim, col, opts) {
    const S = sim, g = SIM.gMag(), nx = S.nx, dx = S.dx;
    // Average mode hands in mean columns. They have already been averaged over
    // the window, so the prefilters below must NOT run: sm() would smooth in
    // space and est.hA/qA/ynK would smooth in time a second time, which shows
    // up as a jump broadened by the filter rather than by the flow.
    const AVG = !!(opts && opts.averaged);
    let est = ESTIMATES.get(S);
    if (!est) ESTIMATES.set(S, est = { hA: null, qA: null, ynK: NaN });
    const out = { bed: [], d: [], q: [], surf: [], dc: [], dn: [], S0: [], V: [], Fr: [], hv: [] };

    const win = Math.max(5, Math.round(nx * 0.09));
    // Which columns stand on a solid — see the onBed note below. Only those
    // describe a bed, so only those enter the slope: past a brink the falling
    // sheet's lowest cell steps down a cell or two a column, which passes the
    // cliff test, and a window snapped out to those "steps" read the last
    // metre above m2's lip as S1.
    const standing = (i) => {
      const jb = Math.round(col[i * 4] / dx);
      return jb >= 1 && SIM.isSolid(S.mask[(jb - 1) * nx + i], true);
    };
    const bd = new Float32Array(nx), use = new Float32Array(nx);
    for (let i = 0; i < nx - 1; i++) {
      const drop = (col[i * 4] - col[(i + 1) * 4]) / dx;
      if (Math.abs(drop) <= CLIFF && standing(i) && standing(i + 1)) { bd[i] = drop; use[i] = 1; }
    }
    const pv = new Float32Array(nx + 1), pn = new Float32Array(nx + 1);
    for (let i = 0; i < nx; i++) { pv[i + 1] = pv[i] + bd[i]; pn[i + 1] = pn[i] + use[i]; }
    // The window's ends are SNAPPED OUT to the rasterisation steps either side
    // of them: rise over run between two steps is exactly the drawn slope,
    // wherever the window happens to fall. Unsnapped, a gentle bed — one step
    // every dx/S₀, three metres at 1 in 250 — reads 0 whenever the window
    // sits between two steps and 1/(window) when it holds one, so a mild
    // reach flickered "H" and "M" along its length. Steep beds, with a step
    // every few cells, read what they always did.
    const prevStep = new Int32Array(nx), nextStep = new Int32Array(nx);
    let ps = -1;
    for (let i = 0; i < nx; i++) { if (use[i] && bd[i] !== 0) ps = i; prevStep[i] = ps; }
    ps = -1;
    for (let i = nx - 1; i >= 0; i--) { if (use[i] && bd[i] !== 0) ps = i; nextStep[i] = ps; }
    // Where each reach of bed ends: the nearest pair at or after (at or
    // before) i that is not bed — a cliff, a brink, the domain's end.
    const gapAfter = new Int32Array(nx), gapBefore = new Int32Array(nx);
    let gp = nx - 1;                                // use[nx − 1] is always 0
    for (let i = nx - 1; i >= 0; i--) { if (!use[i]) gp = i; gapAfter[i] = gp; }
    gp = -1;
    for (let i = 0; i < nx; i++) { if (!use[i]) gp = i; gapBefore[i] = gp; }
    // Where there is no step beyond a window's end, snapping IN to the last
    // step inside it is only honest when the stepless stretch is the
    // PART-TREAD at the end of a reach — no longer than the tread beside it,
    // so the next step would have fallen past the reach's end. m1's inlet is
    // that: 1 in 250, its first step 2–3 m in, a tread of 3 m. A level apron
    // under a chute is not: metres of no step against the chute's tread of a
    // few cells. Snapped in there, every apron column within a window of the
    // toe read the chute's slope exactly — m3 at Low, 0.204 out to
    // x = 5.25 m and then the tilt's 0.004. These say whether the step at the
    // end of a run is followed (preceded) by a part-tread, the tread beside
    // it lying in the same reach.
    const partAfter = (a) => {
      const p = a >= 1 ? prevStep[a - 1] : -1;
      return p >= 0 && gapAfter[p] > a && gapAfter[a + 1] - 1 - a <= a - p;
    };
    const partBefore = (b) => {
      const q = b + 1 < nx ? nextStep[b + 1] : -1;
      return q >= 0 && gapAfter[b] > q && b - 1 - gapBefore[b] <= q - b;
    };
    // A tilted-gravity scene draws its bed flat and carries the slope in
    // gravity instead — add it back, it is the dynamic slope the GVF sees.
    const tilt = S.scene.tiltS0 || 0;
    const slope = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const lo0 = Math.max(0, i - win), hi0 = Math.min(nx - 1, i + win);
      // Out to the step beyond each end; where there is none and the stretch
      // is a reach's part-tread (above), IN to the nearest one, so the run
      // still starts and ends on a step. A one-sided snap counted the inlet's
      // step against half a window and read 1 in 130 for 1 in 250. Anywhere
      // else a missing step falls through to the plain-window mean below.
      let lo = prevStep[lo0], hi = nextStep[hi0], loIn = false, hiIn = false;
      if (lo < 0 && nextStep[lo0] >= 0 && partBefore(nextStep[lo0])) { lo = nextStep[lo0]; loIn = true; }
      if (hi < 0 && prevStep[hi0] >= 0 && partAfter(prevStep[hi0])) { hi = prevStep[hi0]; hiIn = true; }
      // A run snapped in, holding one step or none, reaches on to the next
      // step of the same reach: m1's inlet metre otherwise read level and
      // labelled the pool H2.
      if (!(lo >= 0 && hi > lo)) {
        if (loIn && nextStep[lo + 1] > lo) hi = nextStep[lo + 1];
        else if (hiIn && prevStep[hi - 1] >= 0) lo = prevStep[hi - 1];
      }
      let s;
      if (lo >= 0 && hi > lo) {
        // (lo, hi]: the step AT lo is the one before the run, the one at hi ends it
        const n = pn[hi + 1] - pn[lo + 1];
        s = n > 0 ? (pv[hi + 1] - pv[lo + 1]) / n : 0;
      } else {                                     // under two steps in reach
        const n = pn[hi0] - pn[lo0];
        s = n > 0 ? (pv[hi0] - pv[lo0]) / n : 0;
      }
      slope[i] = s + tilt;
    }

    // Columns beside a cliff — a brink, a weir face, a gate sill — have no
    // meaningful slope or depth, and left in they produce confident nonsense
    // (an "M1" hanging in mid-air over the overfall).
    const guard = Math.max(3, Math.round(0.12 / dx));
    const ok = new Uint8Array(nx).fill(1);
    for (let i = 0; i < nx - 1; i++) {
      if (!use[i]) {
        for (let k = Math.max(0, i - guard); k <= Math.min(nx - 1, i + guard); k++) ok[k] = 0;
      }
    }

    // A surface profile describes water standing ON A BED. Past a brink the
    // sheet is in free fall and the reduction's "bed" is merely wherever the
    // falling water happens to reach — so the guard band above, which only
    // clears a fixed distance either side of the lip, still left a confident
    // M3 hanging over the whole waterfall (and fed those columns into the d_n
    // median). The discriminator is the solid mask: a channel column has a
    // wall directly under its lowest wet cell, a falling nappe does not.
    // That test is also the honest answer to "is there water here at all?",
    // so it is kept separately: the guard band above must silence the profile
    // CLASS near a control, but depth and discharge are still measurable
    // there and the readout has no business hiding them.
    const onBed = new Uint8Array(nx);
    for (let i = 0; i < nx; i++) {
      onBed[i] = standing(i) ? 1 : 0;
      if (!onBed[i]) ok[i] = 0;
    }
    out.ok = ok;
    out.onBed = onBed;

    // Depth and discharge get a running mean before anything is derived from
    // them. Without it the free surface's own ripples — and the roll waves a
    // steep chute genuinely produces — flip the profile class back and forth
    // along a reach that is really uniform. Raw values are kept for the jump
    // finder, which needs the sharp front.
    const sw = Math.max(2, Math.round(0.09 / dx));
    const sm = (o) => {
      const a = new Float32Array(nx), p = new Float32Array(nx + 1);
      for (let i = 0; i < nx; i++) p[i + 1] = p[i] + col[i * 4 + o];
      for (let i = 0; i < nx; i++) {
        const lo = Math.max(0, i - sw), hi = Math.min(nx, i + sw + 1);
        a[i] = (p[hi] - p[lo]) / (hi - lo);
      }
      return a;
    };
    // Average mode's columns are already the mean over the whole window —
    // spatial smoothing and the temporal EMA below would filter that mean a
    // second time, which reads on screen as a jump broadened by the filter
    // rather than by the flow. Take the accumulated columns verbatim instead.
    let dS, qS;
    if (AVG) {
      dS = new Float32Array(nx); qS = new Float32Array(nx);
      for (let i = 0; i < nx; i++) { dS[i] = col[i * 4 + 1]; qS[i] = col[i * 4 + 2]; }
    } else {
      dS = sm(1); qS = sm(2);
      // Then average in TIME, per column. Roll waves and surface ripples
      // travel, so they average out; an M3 reach or a jump stands still, so
      // it survives. Doing this spatially instead needs a window wide enough
      // to swallow a roll wave, which is also wide enough to erase the short
      // reaches that matter most.
      if (!est.hA || est.hA.length !== nx) { est.hA = new Float32Array(dS); est.qA = new Float32Array(qS); }
      for (let i = 0; i < nx; i++) {
        est.hA[i] += 0.10 * (dS[i] - est.hA[i]);
        est.qA[i] += 0.10 * (qS[i] - est.qA[i]);
        dS[i] = est.hA[i]; qS[i] = est.qA[i];
      }
    }
    out.dRaw = []; out.qRaw = [];

    for (let i = 0; i < nx; i++) {
      const bed = col[i * 4], surf = col[i * 4 + 3];
      const d = dS[i], q = qS[i];
      out.dRaw.push(col[i * 4 + 1]); out.qRaw.push(col[i * 4 + 2]);
      const V = d > 1e-3 ? q / d : 0;
      out.bed.push(bed); out.d.push(d); out.q.push(q); out.surf.push(surf);
      out.dc.push(Math.pow(q * q / g, 1 / 3));
      out.S0.push(slope[i]); out.V.push(V);
      out.Fr.push(d > 1e-3 ? Math.abs(V) / Math.sqrt(g * d) : 0);
    }

    // --- friction slope from the energy grade line. The window has to be a
    //     decent fraction of the reach: in a backwater curve dE/dx is small and
    //     differencing it over a short window is mostly noise.
    //
    //     UNDER AVERAGING the velocity head is the TRUE kinetic energy the
    //     flow carries per unit weight of it (`opts.hv`, from
    //     SIM.hydraulicGrade), not the mean-velocity head V^2/2g. The two
    //     differ by the kinetic-energy correction coefficient alpha, and alpha
    //     is neither 1 nor constant: MEASURED on m2 off the Favre mean it runs
    //     1.58 at x = 2 down to 1.22 at x = 13.3. A CONSTANT alpha would only
    //     lift the line; a VARYING one tilts it, and because it falls towards a
    //     drawdown the old line sagged exactly there — the gap it was short by
    //     grows from 11 mm through the uniform reach to 16 mm at the lip.
    //
    //     LIVE, there is no alpha to have: the third moment of an instantaneous
    //     field is dominated by the fluctuation, not the profile (the same
    //     seven stations scatter 1.43-2.41 with no trend), so hv arrives null
    //     and this falls back to the mean-velocity head it always drew. The
    //     reasoning, and the measurements that settled it, are on
    //     SIM.hydraulicGrade. The same fallback covers a column the head walk
    //     found dry.
    //
    //     And the line is built on the HYDRAULIC GRADE LINE, the piezometric
    //     head z + p/ρg at the bed (`opts.hgl`, SIM.hydraulicGrade), not on
    //     the VOF surface. In a steady reach the VOF surface sits in whole-cell
    //     terraces — a partly full top row holds one fill along a tread and the
    //     depth changes a cell at a time — while the pressure carries the
    //     sub-cell slope continuously. MEASURED on m1 (1 in 250, deep pool):
    //     the surface was level to 0.2 mm over 10 m, so S_f read ~0.0002, while
    //     the HGL fell 5.4 mm and the energy line on it gives S_f = 0.00061,
    //     the Manning value for that pool. Without an HGL (a caller that does
    //     not pass one) the VOF surface is what there is.
    const hv = opts && opts.hv, hgl = opts && opts.hgl;
    const Efull = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const k = hv && isFinite(hv[i]) ? hv[i] : out.V[i] * out.V[i] / (2 * g);
      out.hv.push(k);
      Efull[i] = (hgl && isFinite(hgl[i]) ? hgl[i] : out.surf[i]) + k;
    }
    const ew = Math.max(3, Math.round(Math.min(1.5, S.W * 0.10) / dx));
    const pe = new Float32Array(nx + 1);
    for (let i = 0; i < nx; i++) pe[i + 1] = pe[i] + Efull[i];
    const Hsm = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const lo = Math.max(0, i - ew), hi = Math.min(nx, i + ew + 1);
      Hsm[i] = (pe[hi] - pe[lo]) / (hi - lo);
    }
    out.H = Hsm;
    out.Sf = new Float32Array(nx);
    out.n = new Array(nx).fill(NaN);
    for (let i = 0; i < nx; i++) {
      const lo = Math.max(0, i - ew), hi = Math.min(nx - 1, i + ew);
      // + tilt: in a tilted-gravity scene the flat-bed energy line misses the
      // S0 of work gravity does per metre of run
      const Sf = (Hsm[lo] - Hsm[hi]) / Math.max((hi - lo) * dx, 1e-9) + tilt;
      out.Sf[i] = Sf;
      if (ok[i] && out.d[i] > 4 * dx) out.n[i] = manning(out.d[i], out.V[i], Sf);
    }

    // --- normal depth from d_n = d·(S_f/S₀)^⅓.
    //
    //     Fitting that per column is far too noisy: in a backwater curve S_f is
    //     small and every wobble in the energy line moves the answer. But
    //     d_n·S₀^⅓ = d·S_f^⅓ contains no S₀ at all, so a robust median of THAT
    //     over the whole domain gives one well-determined constant, and
    //     dividing it back out by the local S₀^⅓ still gives each reach of a
    //     compound channel its own normal depth.
    const cand = [];
    for (let i = 0; i < nx; i++) {
      const S0 = out.S0[i], Sf = out.Sf[i];
      if (!ok[i] || out.d[i] <= 4 * dx || S0 <= 2e-4) continue;
      if (!(Sf > 0.02 * S0) || Sf > 40 * S0) continue;
      cand.push(out.d[i] * Math.pow(Sf, 1 / 3));
    }
    if (cand.length > 8) {
      cand.sort((a, b) => a - b);
      const k = cand[cand.length >> 1];
      // Average mode's candidates are already drawn from a mean field, so the
      // window's answer IS the estimate — EMA'ing it against whatever the
      // live path last left behind would blend two different flow states.
      if (AVG) est.ynK = k;
      else est.ynK = isFinite(est.ynK) ? est.ynK + EMA * (k - est.ynK) : k;
    }
    out.dn = new Array(nx).fill(NaN);
    let anyDn = 0, sumDn = 0;
    if (isFinite(est.ynK)) {
      for (let i = 0; i < nx; i++) {
        if (out.S0[i] <= 2e-4) continue;
        out.dn[i] = est.ynK / Math.pow(out.S0[i], 1 / 3);
        anyDn++; sumDn += out.dn[i];
      }
    }
    out.dnGlobal = anyDn ? sumDn / anyDn : NaN;

    return out;
  }

  /** Forget the running estimates — the per-column depth/discharge time
   *  averages and the domain-wide normal-depth constant.
   *
   *  `ynK` is ONE number for the whole domain, EMA'd over time and only fed
   *  by columns whose S_f sits in a sane band, so a redrawn rig inherits the
   *  old rig's normal depth for as long as the new one fails to produce
   *  candidates: a drowned gate on a 1-in-4 bed read "M1" that way, because
   *  the local d_c collapsed with the local q while the global d_n did not.
   *  Anything that re-rasterises the walls calls this. */
  function resetEstimates(sim) {
    if (!sim) return;
    ESTIMATES.delete(sim);
  }

  /** Read-only view of a grid's running estimates, for tests: `{ hA, qA, ynK }`
   *  — the two per-column time averages (or null) and the normal-depth
   *  constant (NaN when there is none). Never creates an entry. */
  function estimates(sim) {
    const e = sim && ESTIMATES.get(sim);
    return e ? { hA: e.hA, qA: e.qA, ynK: e.ynK } : { hA: null, qA: null, ynK: NaN };
  }

  /** Locate hydraulic jumps: Fr crosses 1 downwards and the depth jumps up.
   *  Reports the measured conjugate pair alongside the momentum prediction
   *  d₂/d₁ = ½(√(1+8Fr₁²) − 1), so the two can be compared on screen. */
  function findJumps(A, sim) {
    const nx = sim.nx, dx = sim.dx, g = SIM.gMag();
    const win = Math.max(3, Math.round(0.20 / dx));       // averaging half-window
    const reach = Math.round(Math.min(2.5, sim.W * 0.25) / dx);
    const mean = (arr, a, b) => {
      let s = 0, n = 0;
      for (let j = Math.max(0, a); j <= Math.min(nx - 1, b); j++) { s += arr[j]; n++; }
      return n ? s / n : 0;
    };
    const ext = (arr, a, b, wantMax) => {
      let v = wantMax ? -Infinity : Infinity;
      for (let j = Math.max(0, a); j <= Math.min(nx - 1, b); j++) {
        if (arr[j] <= 0) continue;
        v = wantMax ? Math.max(v, arr[j]) : Math.min(v, arr[j]);
      }
      return isFinite(v) ? v : 0;
    };
    const out = [];
    let i = win + 2;
    while (i < nx - win - 2) {
      if (A.ok[i] && A.Fr[i] > 1.2 && A.dRaw[i] > 3 * dx) {
        let k = i;
        const lim = Math.min(nx - win - 2, i + reach);
        while (k < lim && A.Fr[k] > 0.9) k++;
        if (k < lim && A.dRaw[k + win] > 1.6 * A.dRaw[i]) {
          // d₁ is the THINNEST section upstream: averaging there drags the
          // roller into d₁ and the conjugate-depth check reads 100% high.
          // d₂ is the MEAN depth behind the roller, not the deepest point:
          // the surface there flutters, and the maximum of a fluttering
          // signal is biased high by however far it flutters. Measured on
          // h23 (2026-09-10, t = 30–70 s): the deepest point read 31% over
          // Bélanger at Low and 14% at Medium, the mean over the same window
          // 11% and −5%.
          const d1 = ext(A.dRaw, i - 2 * win, i, false);
          const d2 = mean(A.dRaw, k + win, k + 4 * win);
          const q = Math.abs(mean(A.qRaw, i - 2 * win, i));
          const Fr1 = d1 > 1e-4 ? (q / d1) / Math.sqrt(g * d1) : 0;
          // 1.35: near-critical undulations (Fr₁ ≈ 1.1–1.3) are transitions,
          // not jumps — boxing every one buried the critical-slope scene.
          if (Fr1 > 1.35 && d2 > d1) {
            out.push({
              x0: (i + 0.5) * dx, x1: (k + 0.5) * dx, i, k, d1, d2, Fr1,
              bed: A.bed[i], surf: A.surf[k + win],
              d2p: 0.5 * d1 * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1),
              dE: Math.pow(d2 - d1, 3) / (4 * d1 * d2),
            });
            i = k + 3 * win; continue;
          }
        }
      }
      i++;
    }
    return out.slice(0, 3);
  }

  /** Contiguous runs of the same surface-profile class, long enough to name.
   *  Same-class runs separated by a short gap (a roll wave, a guard band) are
   *  merged — otherwise a single M2 apron sprouts a chip every metre. */
  function profileRuns(A, sim) {
    const nx = sim.nx, dx = sim.dx;
    const minRun = Math.max(8, Math.round(0.45 / dx));
    const runs = [];
    let start = -1, cls = "";
    for (let i = 0; i < nx; i++) {
      const ok = A.ok[i] && A.d[i] > 4 * dx && A.q[i] !== 0;
      const c = ok ? classify(A.d[i], A.dn[i], A.dc[i], A.S0[i]) : "";
      if (c !== cls) {
        if (cls && i - start >= minRun) runs.push({ cls, a: start, b: i - 1 });
        cls = c; start = i;
      }
    }
    if (cls && nx - start >= minRun) runs.push({ cls, a: start, b: nx - 1 });
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.cls === r.cls && r.a - last.b <= 2 * minRun) last.b = r.b;
      else merged.push({ cls: r.cls, a: r.a, b: r.b });
    }
    return merged;
  }

  // --------------------------------------------------------------- drawing
  /** What the overlay may PRINT, set by main.js once a frame (setPrint):
   *    readouts  the instruments' readout boxes — VIEW → Readouts. Off, the
   *              instruments draw their geometry (box, line, profile, arrows)
   *              and no numbers; they go on measuring either way.
   *    energy    the energy terms (CV energy row and Ė faces, ρgQH, the
   *              energy lost between two sections) — off under ui.hide
   *              "energy" for a card before the energy lecture.
   *    critical  the critical-flow vocabulary on the hover card (profile
   *              class, sub/supercritical) — off under ui.hide "critical". */
  const PRINT = { readouts: true, energy: true, critical: true };
  function setPrint(o) { Object.assign(PRINT, o || {}); }
  /** A chip that is an instrument READOUT, and so goes with the boxes. */
  function rchip(ctx, x, y, text, colour, align) {
    if (PRINT.readouts) chip(ctx, x, y, text, colour, align);
  }

  function line(ctx, pts, style, width, dash) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  function chip(ctx, x, y, text, colour, align) {
    ctx.save();
    ctx.font = FONT.mono(11, 600);
    const w = ctx.measureText(text).width + 12;
    const px = align === "right" ? x - w : x;
    ctx.fillStyle = "rgba(10,14,20,0.82)";
    ctx.beginPath(); ctx.roundRect(px, y - 9, w, 18, 5); ctx.fill();
    ctx.fillStyle = colour;
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 6, y + 1);
    ctx.restore();
  }

  /** The on-canvas key, top-left of the visible frame. Every drawer that owns
   *  a line adds a row with keyRow() while the frame is drawn; drawOverlay
   *  calls flushKeys() once at the end, so the rows stack in one column
   *  instead of each drawer painting at the same position. */
  let keyRows = [];
  function keyRow(text, colour, dash) { keyRows.push({ text, colour, dash: dash || [] }); }
  function flushKeys(ctx, V) {
    const rows = keyRows; keyRows = [];
    if (!rows.length) return;
    const B = V.vis || V;
    const ly = B.y + 16;
    ctx.save();
    ctx.font = FONT.mono(11);
    ctx.textBaseline = "middle";
    rows.forEach((r, k) => {
      ctx.strokeStyle = r.colour; ctx.lineWidth = 1.6; ctx.setLineDash(r.dash);
      ctx.beginPath(); ctx.moveTo(B.x + 12, ly + k * 15); ctx.lineTo(B.x + 40, ly + k * 15);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.dim;
      ctx.fillText(r.text, B.x + 46, ly + k * 15 + 1);
    });
    ctx.restore();
  }

  /** d_n, d_c and (unless `grade` is on) the energy line over the channel;
   *  their key rows go through keyRow. */
  function drawChannel(ctx, V, A, sim, grade) {
    const nx = sim.nx, step = Math.max(1, Math.round(nx / 900));
    const g = SIM.gMag();
    const pc = [], pn = [], pe = [];
    for (let i = 0; i < nx; i += step) {
      const x = V.X((i + 0.5) * sim.dx);
      if (A.ok[i] && A.d[i] > 3 * sim.dx) {
        pc.push([x, V.Y(A.bed[i] + A.dc[i])]);
        pe.push([x, V.Y(A.H[i])]);
      } else { pc.push(null); pe.push(null); }
      if (A.ok[i] && isFinite(A.dn[i]) && A.d[i] > 3 * sim.dx) pn.push([x, V.Y(A.bed[i] + A.dn[i])]);
      else pn.push(null);
    }
    // With the grade lines on, drawGradeLines owns the energy line (h + hv is
    // the better estimate) and its key row; drawing both put two lines
    // captioned "H" in one column.
    if (!grade) line(ctx, pe, C.egl, 1.0, [1, 3]);
    line(ctx, pn, C.dn, 1.4, [7, 5]);
    line(ctx, pc, C.dc, 1.4, [3, 4]);

    if (!grade) keyRow("energy grade line  H", C.egl, [1, 3]);
    keyRow("normal depth  dₙ", C.dn, [7, 5]);
    keyRow("critical depth  d_c", C.dc, [3, 4]);
  }

  /** Name each surface-profile reach in place: M1, S2, H3 … */
  function drawProfileLabels(ctx, V, A, sim) {
    const runs = profileRuns(A, sim);
    const B = V.vis || V;
    runs.forEach((r) => {
      const mid = ((r.a + r.b) >> 1);
      const x = V.X((mid + 0.5) * sim.dx);
      const y = Math.max(B.y + 14, V.Y(A.surf[mid]) - 26);
      ctx.save();
      ctx.font = FONT.mono(13, 700);
      const w = ctx.measureText(r.cls).width + 14;
      ctx.fillStyle = "rgba(10,14,20,0.85)";
      ctx.strokeStyle = "rgba(255,217,138,0.45)";
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 11, w, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd98a"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.fillText(r.cls, x, y + 1);
      ctx.restore();
    });
  }

  /** Bracket each hydraulic jump and show measured vs momentum-predicted d₂. */
  function drawJumps(ctx, V, jumps) {
    const B = V.vis || V;
    jumps.forEach((J) => {
      const xa = V.X(J.x0), xb = V.X(J.x1);
      const yTop = V.Y(J.surf), yBed = V.Y(J.bed);
      ctx.save();
      ctx.fillStyle = "rgba(255,138,90,0.10)";
      ctx.fillRect(xa, yTop - 4, Math.max(xb - xa, 3), yBed - yTop + 4);
      ctx.strokeStyle = "rgba(255,138,90,0.75)";
      ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xa, yTop - 4); ctx.lineTo(xa, yBed);
      ctx.moveTo(xb, yTop - 4); ctx.lineTo(xb, yBed);
      ctx.stroke(); ctx.restore();

      const err = 100 * (J.d2 - J.d2p) / Math.max(J.d2p, 1e-6);
      const rows = [
        "HYDRAULIC JUMP",
        "Fr₁ " + FMT.fix(J.Fr1, 2) + "   d₁ " + FMT.fix(J.d1, 3) + " m",
        "d₂ " + FMT.fix(J.d2, 3) + " m   (momentum: " + FMT.fix(J.d2p, 3) +
          ", " + (err >= 0 ? "+" : "") + FMT.fix(err, 0) + "%)",
        "ΔE " + FMT.fix(J.dE, 3) + " m lost in the roller",
      ];
      ctx.save();
      ctx.font = FONT.mono(11);
      let w = 0;
      rows.forEach((t) => { w = Math.max(w, ctx.measureText(t).width); });
      w += 20;
      const h = rows.length * 15 + 10;
      let px = Math.min(Math.max((xa + xb) / 2 - w / 2, B.x + 4), B.x + B.w - w - 4);
      let py = Math.max(B.y + 4, yTop - h - 34);
      ctx.fillStyle = "rgba(10,14,20,0.88)";
      ctx.strokeStyle = "rgba(255,138,90,0.5)";
      ctx.beginPath(); ctx.roundRect(px, py, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.textBaseline = "middle";
      rows.forEach((t, n) => {
        ctx.fillStyle = n === 0 ? "#ff9a63" : "#e8f0f8";
        ctx.font = FONT.mono(11, n === 0 ? 700 : undefined);
        ctx.fillText(t, px + 10, py + 13 + n * 15);
      });
      ctx.restore();
    });
  }

  /** THE HOVER CARD'S ROWS, as a register -- the one place they are named.
   *
   *  An exercise profile names these ids to choose what its student reads
   *  (js/legend.js, UIMODE.rows), and check_pack.py validates a profile's list
   *  against ROW_IDS so a typo fails the pack instead of quietly hiding a row.
   *  Adding a row means adding an id here and tagging the push below; the two
   *  are checked against each other by the layout gate.
   *
   *  `f` IS DELIBERATELY NOT IN THE DEFAULT. It is the VOF fill fraction, a
   *  solver internal rather than a hydraulics quantity: in free-surface flow it
   *  is 1.000 everywhere the card can be read, which teaches nothing, and the
   *  one thing it did say -- that a cell is pressurised -- is already printed
   *  on the head row and is the reason the level row disappears there. A pipe
   *  exercise that genuinely wants it back names it.
   *
   *  `profile` is the card's TITLE — the gradually-varied-flow class ("H2
   *  profile") — and it is a row id like any other so that a profile's
   *  `rows` list governs it too. In the default set, so a card without a
   *  list is unchanged.
   */
  const ROW_IDS = ["profile", "pos", "d", "eta", "q", "V", "Fr", "dc", "dn", "S0", "Sf",
                   "uw", "p", "phead", "h", "f"];
  // `p` (the pressure in kPa) is opt-in like `f`: the default card already
  // carries the pressure as p/ρg, and a Year 1 card that shows the Pressure
  // colouring names `p` instead of `phead`.
  const DEFAULT_ROWS = ROW_IDS.filter((r) => r !== "f" && r !== "p");

  /** THE TWO GRADE LINES, on their own switch.
   *
   *  The channel overlay already draws the energy line, but only across
   *  columns it considers open-channel: a pressurised run fails its `ok` test
   *  and the line simply stops, which is exactly where a pipe exercise needs
   *  it most. And the HYDRAULIC grade line was not drawn at all.
   *
   *  Both are drawn here for every column that has water in it, pressurised or
   *  not, and the pair is the point: the gap between them IS the kinetic
   *  energy, drawn to scale. In a steady free-surface reach the HGL lies on
   *  the water surface; in a pipe it leaves the crown and the picture stops
   *  being a cartoon.
   *
   *  `hgl` is SIM.hydraulicGrade()'s array (piezometric head per column, NaN
   *  where dry) and `hgl.hv` the true velocity head that rides with it. The
   *  energy line is the sum, so the two are consistent by construction rather
   *  than by two separate estimates that can disagree about where the water
   *  is — and it is the SAME hv OVERLAY.analyse drew its own energy line at.
   *
   *  UNDER AVERAGING that gap is a real kinetic energy rather than V^2/2g: it
   *  carries the profile's alpha and the vertical velocity, both of which
   *  matter most exactly where this line is most worth looking at — a brink, a
   *  chute toe, a contraction. Live it is the mean-velocity head, because an
   *  instantaneous profile has no alpha worth the name; SIM.hydraulicGrade
   *  carries the measurements behind that split. */
  function drawGradeLines(ctx, V, A, sim, hgl) {
    if (!hgl) return;
    const nx = sim.nx, step = Math.max(1, Math.round(nx / 900));
    const g = SIM.gMag();
    const ph = [], pe = [];
    for (let i = 0; i < nx; i += step) {
      const x = V.X((i + 0.5) * sim.dx), h = hgl[i];
      if (isFinite(h)) {
        const k = hgl.hv && isFinite(hgl.hv[i]) ? hgl.hv[i]
                : (A.V[i] || 0) * (A.V[i] || 0) / (2 * g);
        ph.push([x, V.Y(h)]);
        pe.push([x, V.Y(h + k)]);
      } else { ph.push(null); pe.push(null); }
    }
    line(ctx, pe, C.egl, 1.4, [6, 3]);
    line(ctx, ph, C.hgl, 1.4, [2, 3]);

    keyRow("energy grade line  H", C.egl, [6, 3]);
    keyRow("hydraulic grade line  h", C.hgl, [2, 3]);
  }

  /** Streamlines: contour segments of ψ (STREAM.contours), in metres, plus a
   *  one-line key quoting the discharge each tube carries. `L` is
   *  {seg, dpsi, avg} as js/instruments.js requestStream keeps it. */
  function drawStreamlines(ctx, V, L) {
    if (!L || !L.seg) return;
    const s = L.seg;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < s.length; k += 4) {
      ctx.moveTo(V.X(s[k]), V.Y(s[k + 1]));
      ctx.lineTo(V.X(s[k + 2]), V.Y(s[k + 3]));
    }
    // A dark halo under a light core, so the lines read over every ramp —
    // the pale middle of vorticity as much as the dark end of speed.
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = C.slineHalo; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = C.sline; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
    const B = V.vis || V;
    chip(ctx, B.x + 10, B.y + B.h - 34,
         "streamlines" + (L.avg ? " of the MEAN flow" : "") +
         " · Δψ = " + (+L.dpsi.toPrecision(2)) + " m²/s between lines",
         C.sline);
  }

  /** Where a pinned readout reads: a ring and a dot, so the card is visibly
   *  ABOUT a point rather than floating free once the finger has gone. */
  function drawPinMark(ctx, V, mx, mz) {
    const x = V.X(mx), y = V.Y(mz);
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = "#ffd98a";
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffd98a";
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
    ctx.restore();
  }

  /** Profile label + hydraulics numbers at the cursor column. `show` is the set of row ids the caller wants, or null for the default.
   *  Every row below carries a stable id as its third element, so an exercise
   *  can name exactly the quantities its student should be reading and no
   *  others -- a slope-area exercise wants d, S_f and n, and a card offering
   *  fourteen numbers is a card nobody reads carefully. The ids are the
   *  contract: they are validated against ROW_IDS by check_pack.py, so a typo
   *  in a profile fails the pack rather than silently hiding a row. */
  function drawCursorReadout(ctx, V, A, sim, mx, mz, probe, show) {
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(mx / sim.dx)));
    const d = A.d[i], dc = A.dc[i], dn = A.dn[i], S0 = A.S0[i];
    // Numbers wherever there is water standing on something; the CLASS only
    // where the classification is trustworthy (A.ok also clears a guard band
    // either side of every cliff, which used to blank the whole box at a
    // perfectly measurable station next to a weir).
    const wet = A.onBed[i] && d > 3 * sim.dx;
    // Inside a pressurised conduit there is no free surface to have a profile:
    // the column's "surface" is the soffit and d_c / d_n / S_f are fiction (a
    // full pipe read "H2 profile"). Fill fraction alone does not say so — any
    // submerged cell carries hydrostatic f > 1 — so the test is a water body
    // that reaches its lid AND a cell that is genuinely over-full.
    const js = Math.round(A.surf[i] / sim.dx);
    const capped = js > 0 && js < sim.ny && SIM.isSolid(sim.mask[js * sim.nx + i], true);
    const press = !!probe && probe.f > 1.002 && capped;
    const keep = show || DEFAULT_ROWS;
    // The class is a title, not a row, but it is governed like one (`profile`
    // in the list) and withheld with the rest of the critical-flow words.
    const cls = wet && A.ok[i] && !press && PRINT.critical && keep.indexOf("profile") >= 0
      ? classify(d, dn, dc, S0) : "";
    const rows = [];
    rows.push(["x, z", FMT.fix(mx, 2) + ", " + FMT.fix(mz, 2) + " m", "pos"]);
    if (wet) {
      rows.push(["depth d", FMT.fix(d, 3) + " m", "d"]);
      if (!press) rows.push(["level η", FMT.fix(A.bed[i] + d, 3) + " m above datum", "eta"]);
      rows.push(["q, whole depth", FMT.fix(A.q[i], 3) + " m²/s", "q"]);
      rows.push(["V = q/d, depth mean", FMT.fix(A.V[i], 2) + " m/s", "V"]);
    }
    if (wet && !press) {
      rows.push(["Fr", FMT.fix(A.Fr[i], 2) + (PRINT.critical
        ? (A.Fr[i] > 1 ? "  supercritical" : "  subcritical")
        : (A.Fr[i] > 1 ? "  fast, shallow" : "  slow, deep")), "Fr"]);
      rows.push(["d_c", FMT.fix(dc, 3) + " m", "dc"]);
      if (isFinite(dn)) rows.push(["d_n", FMT.fix(dn, 3) + " m  (measured)", "dn"]);
      rows.push(["S₀", (S0 >= 0 ? "1 : " + FMT.fix(1 / Math.max(S0, 1e-9), 0) : "adverse"), "S0"]);
      // n is only computed where the classification is trustworthy, so a
      // guard-band station prints the slope alone rather than "n = NaN".
      if (A.Sf[i] > 0) rows.push(["S_f", "1 : " + FMT.fix(1 / A.Sf[i], 0) +
        (isFinite(A.n[i]) ? "   n = " + FMT.fix(A.n[i], 3) : ""), "Sf"]);
    }
    if (probe) {
      rows.push(["u, w at cursor", FMT.fix(probe.u, 2) + ", " + FMT.fix(probe.w, 2) + " m/s", "uw"]);
      // probe.p is the kinematic pressure P = p/ρ; with ρ = 1000 kg/m³ its
      // value in m²/s² is p in kPa.
      rows.push(["pressure p", FMT.fix(probe.p, 2) + " kPa", "p"]);
      rows.push(["pressure head p/ρg", FMT.fix(probe.phead, 3) + " m", "phead"]);
      // h = z + p/ρg. Shown in BOTH regimes: in hydrostatic open-channel flow
      // it equals the level η above, but inside a pressurised conduit there is
      // no surface and the η row is suppressed, which is exactly where the
      // piezometric head is the only meaningful head to read.
      rows.push(["head h = z + p/ρg",
        FMT.fix(probe.zp - (sim.scene.tiltS0 || 0) * mx + probe.phead, 3) + " m", "h"]);
      rows.push(["fill f", FMT.fix(probe.f, 3) + (probe.f > 1.002 ? "  pressurised" : ""), "f"]);
    }
    // Filter to what was asked for. A row with no id is never hidden -- if a
    // future row forgets its tag it keeps showing, which is the safe way round.
    const shown = rows.filter((r) => !r[2] || keep.indexOf(r[2]) >= 0);
    rows.length = 0; Array.prototype.push.apply(rows, shown);
    if (!rows.length) return;

    const B = V.vis || V;
    ctx.save();
    ctx.font = FONT.mono(11);
    let w = 0;
    rows.forEach((r) => { w = Math.max(w, ctx.measureText(r[0] + "  " + r[1]).width); });
    w += 22;
    const hgt = rows.length * 15 + (cls ? 26 : 10);
    let px = V.X(mx) + 18, py = V.Y(mz) - hgt - 12;
    if (px + w > B.x + B.w) px = V.X(mx) - w - 18;
    if (py < B.y + 6) py = V.Y(mz) + 18;
    ctx.fillStyle = "rgba(10,14,20,0.86)";
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.roundRect(px, py, w, hgt, 8); ctx.fill(); ctx.stroke();
    ctx.textBaseline = "middle";
    let y = py + 12;
    if (cls) {
      ctx.fillStyle = "#ffd98a";
      ctx.font = FONT.mono(14, 700);
      ctx.fillText(cls + " profile", px + 11, y + 2);
      ctx.font = FONT.mono(11);
      y += 22;
    }
    rows.forEach((r) => {
      ctx.fillStyle = C.dim; ctx.fillText(r[0], px + 11, y);
      ctx.fillStyle = "#e8f0f8"; ctx.textAlign = "right";
      ctx.fillText(r[1], px + w - 11, y);
      ctx.textAlign = "left";
      y += 15;
    });
    ctx.restore();
  }

  /** Orbit tracers: each one's path, fading from its oldest point to its
   *  newest, with the live particle on the head. Drawn brightest at the
   *  surface and dimmest at the bed so the shrinking of the orbits with depth
   *  reads at a glance — that shrinkage is the whole of linear wave theory in
   *  one picture, and a bare dot cannot show it. */
  function drawTracers(ctx, V, T) {
    if (!T || !T.list.length) return;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    T.list.forEach((t, k) => {
      const p = t.path;
      if (p.length < 6) return;
      const warm = 1 - k / Math.max(T.list.length - 1, 1);   // 0 top … 1 bottom
      const hue = 190 + 30 * warm;
      // The trail is drawn in segments so it can fade along its length.
      const n = p.length / 3;                       // triples: x, y, t
      for (let i = 1; i < n; i++) {
        const a = i / n;
        ctx.strokeStyle = `hsla(${hue}, 95%, ${76 - 18 * warm}%, ${0.10 + 0.80 * a * a})`;
        ctx.lineWidth = 1.1 + 2.0 * a;
        ctx.beginPath();
        ctx.moveTo(V.X(p[(i - 1) * 3]), V.Y(p[(i - 1) * 3 + 1]));
        ctx.lineTo(V.X(p[i * 3]), V.Y(p[i * 3 + 1]));
        ctx.stroke();
      }
      // seed point: where this tracer started, so drift is visible too
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(V.X(t.x0), V.Y(t.z0), 1.6, 0, 7); ctx.fill();
      // WHERE IT IS NOW, in red. The trail says where it has been; at high
      // resolution the sim crawls and without a hard marker you cannot tell
      // which end of the loop is the live one.
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath(); ctx.arc(V.X(t.x), V.Y(t.z), 1.9, 0, 7); ctx.fill();
    });
    ctx.restore();
  }

  /** The span a rake reads, [lo, hi] in metres. Open water (the clicked point
   *  lies in the column the analysis measured, with no solid between bed and
   *  surface) is A.bed → A.surf, bit-for-bit the old rake, so every worksheet
   *  that reads one in a channel reads the same. Otherwise — a pipe, a culvert,
   *  a jet over a reservoir floor — it walks down from the click to the first
   *  solid and up to the first solid or the end of the water (fill f < ½,
   *  which needs the column's f: `rk.needF` asks sampleRakes for it). */
  function rakeSpan(sim, rk, A) {
    const i = rk.i, nx = sim.nx, ny = sim.ny, dx = sim.dx;
    const bed = A.bed[i], surf = A.surf[i];
    if (!Number.isFinite(rk.z)) { rk.needF = false; return [bed, surf]; }
    const solid = (j) => SIM.isSolid(sim.mask[j * nx + i], false);
    let jc = Math.max(0, Math.min(ny - 1, Math.floor(rk.z / dx)));
    if (solid(jc)) { rk.needF = false; return [bed, surf]; }   // clicked into a wall
    let jb = jc;
    while (jb > 0 && !solid(jb - 1)) jb--;
    const lo = jb * dx;
    // Open water: the same bed, and nothing solid from the click up to the
    // surface the analysis found (or the click above it, in the air).
    if (Math.abs(lo - bed) < 0.5 * dx && Number.isFinite(surf)) {
      let clear = true;
      for (let j = jc; j * dx < surf && j < ny; j++) if (solid(j)) { clear = false; break; }
      if (clear) { rk.needF = false; return [bed, surf]; }
    }
    rk.needF = true;
    let jt = jc;
    while (jt + 1 < ny && !solid(jt + 1)) jt++;
    let hi = (jt + 1) * dx;
    if (rk.f) {
      // the water in the span ends where f drops below ½ above the click
      for (let j = Math.max(jb, Math.min(jc, jt)); j <= jt; j++) {
        if (rk.f[j] < 0.5) { hi = j * dx; break; }
      }
    }
    return [lo, Math.max(hi, lo + dx)];
  }

  /** Screen px per m/s for the rakes: the scene's speed `uRef` maps to the
   *  rake's nominal length (13% of the view, at most 110 px). Passed in as
   *  px per m/s already (main.js), so every rake and the bar share it. */
  function rakePxPerMps(V, uRef) { return Math.min(V.w * 0.13, 110) / uRef; }
  function rakePx(V, pxPerMps) {
    return pxPerMps > 0 ? pxPerMps : rakePxPerMps(V, 4);
  }
  /** The rakes' one scale bar, bottom-left above the streamline key: a 1-2-5
   *  number of m/s that spans 30–80 px, drawn once whatever the rake count. */
  function drawRakeScale(ctx, V, pxPerMps) {
    const s = rakePx(V, pxPerMps);
    const want = 50 / s;
    const u = FMT.nice(want);
    const L = u * s, B = V.vis || V;
    const x = B.x + 12, y = B.y + B.h - 58;
    ctx.save();
    ctx.strokeStyle = "rgba(6,10,16,0.85)"; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y); ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 4); ctx.stroke();
    ctx.restore();
    chip(ctx, x + L + 8, y, "rake: " + String(+u.toPrecision(2)) + " m/s", "#e8f0f8");
  }

  /** Vertical velocity rake: u(y) drawn against the water column it sits in.
   *  The profile is also INTEGRATED over the column — q = ∫u dy — so the rake
   *  is a flow measurement, not just a shape: the discharge it reports can be
   *  checked against the hover readout's flux-based q at the same station. */
  function drawRake(ctx, V, sim, rk, A, pxPerMps) {
    const { i, buf } = rk;
    const x0 = V.X((i + 0.5) * sim.dx);
    const span = rakeSpan(sim, rk, A);
    const bed = span[0], surf = span[1];
    let umax = 1e-3, sum = 0, cnt = 0;
    for (let j = 0; j < sim.ny; j++) {
      const y = (j + 0.5) * sim.dx;
      if (y < bed || y > surf) continue;
      const u = buf[j * 4];   // SIM.rake already returns cell-centred u
      umax = Math.max(umax, Math.abs(u)); sum += u; cnt++;
    }
    const Vbar = cnt ? sum / cnt : 0;
    // ∫u dy over the wet column. Displayed through the same 0.10-per-frame
    // EMA the hover readout's q gets — on a roll-wave chute the instantaneous
    // integral swings ±50% and the worksheets' standing rule is a
    // median-of-the-wobble read, not a lucky frame. The drawn profile itself
    // stays live; pausing lets the EMA converge to the paused instant.
    const qNow = sum * sim.dx;
    rk.qE = rk.qE === undefined ? qNow : rk.qE + 0.10 * (qNow - rk.qE);
    const q = rk.qE;
    // ONE scale for every rake in the scene: `pxPerMps`, from the scene's
    // held speed range (main.js drawOverlay, from rangeFor("speed")), so two rakes compare side by side
    // and still water draws a nearly flat line; the scale bar (drawRakeScale)
    // says what a length means. A section faster than the range is clipped at
    // 1.6× the nominal length rather than run across the view.
    const scale = rakePx(V, pxPerMps);
    const clipPx = 1.6 * Math.min(V.w * 0.13, 110);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x0, V.Y(bed)); ctx.lineTo(x0, V.Y(surf)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    let pen = false;
    for (let j = 0; j < sim.ny; j++) {
      const y = (j + 0.5) * sim.dx;
      if (y < bed || y > surf) continue;
      const px = x0 + Math.max(-clipPx, Math.min(clipPx, buf[j * 4] * scale)), py = V.Y(y);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    // White over a dark halo: the old pale yellow vanished into the Speed
    // colouring's fast (yellow) band. A dark casing under a light line reads
    // on every ramp — the streamlines and the ruler solve it the same way.
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(6,10,16,0.85)"; ctx.lineWidth = 4.6; ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();

    // depth-average marker
    ctx.beginPath();
    const xb = x0 + Math.max(-clipPx, Math.min(clipPx, Vbar * scale));
    ctx.moveTo(xb, V.Y(bed)); ctx.lineTo(xb, V.Y(surf));
    ctx.strokeStyle = "rgba(6,10,16,0.55)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1; ctx.stroke();

    rchip(ctx, x0 + 6, V.Y(surf) - 32,
      "q = ∫u dy = " + FMT.fix(q, 3) + " m²/s", "#7fd4ff");
    rchip(ctx, x0 + 6, V.Y(surf) - 14,
      "u_max " + FMT.fix(umax, 2) + "  V " + FMT.fix(Vbar, 2) + "  ratio " + FMT.fix(umax / Math.max(Vbar, 1e-3), 2),
      "#ffd98a");
    ctx.restore();
  }

  /** Gauge markers on the field. */
  function drawGaugeMarks(ctx, V, gauges) {
    gauges.forEach((gg, k) => {
      const x = V.X(gg.x), y = V.Y(gg.z);
      ctx.save();
      ctx.strokeStyle = gg.colour; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = gg.colour;
      ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
      ctx.font = FONT.mono(10, 700);
      ctx.fillText(String(k + 1), x + 9, y - 6);
      ctx.restore();
    });
  }

  /** Stacked time-series cards, bottom right.
   *
   *  Returns the screen rect of every card it actually drew (bottom-up order
   *  is the loop's, each entry `{k, x, y, w, h}` with `k` the gauge index) so
   *  the DOM can hang an affordance on a card without duplicating the layout
   *  arithmetic. Drawing is unchanged — the stack breaks at the same place. */
  /*  `pick(gauge)` returns `{label, unit, get(sample)}` — what THIS gauge
   *  plots, since each gauge carries its own quantity. */
  function drawGaugeCharts(ctx, V, gauges, pick) {
    const rects = [];
    if (!gauges.length) return rects;
    const W = Math.min(330, V.pxW * 0.32), H = 82, pad = 10;
    let y = V.pxH - pad - H;
    for (let k = gauges.length - 1; k >= 0; k--) {
      const gg = gauges[k], x = V.pxW - pad - W;
      rects.push({ k, x, y, w: W, h: H });
      const Q = pick(gg), label = Q.label, unit = Q.unit, val = Q.get;
      // `series`: what to plot — the scrolling window, or the whole run from
      // t = 0 (js/instruments.js gaugeSeries); the card's look is the same either way.
      const hist = Q.series || gg.hist;
      ctx.save();
      ctx.fillStyle = "rgba(12,17,26,0.80)";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 10); ctx.fill(); ctx.stroke();

      if (hist.length > 1) {
        let lo = Infinity, hi = -Infinity;
        for (const s of hist) { const v = val(s); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo < 1e-6) { hi = lo + 1e-3; }
        const pad2 = (hi - lo) * 0.12; lo -= pad2; hi += pad2;
        const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
        const px = (t) => x + 10 + (t - t0) / Math.max(t1 - t0, 1e-6) * (W - 58);
        const py = (v) => y + H - 16 - (v - lo) / (hi - lo) * (H - 30);
        ctx.beginPath();
        hist.forEach((s, n) => { const a = px(s.t), b = py(val(s)); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        ctx.strokeStyle = gg.colour; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = FONT.mono(10);
        ctx.fillStyle = C.dim;
        // Below the card's × (a DOM button in the top-right corner).
        ctx.fillText(FMT.fix(hi, 2), x + W - 44, y + 32);
        ctx.fillText(FMT.fix(lo, 2), x + W - 44, y + H - 12);
        ctx.fillStyle = "#e8f0f8";
        ctx.font = FONT.mono(11, 700);
        ctx.fillText(String(k + 1) + "  " + label + " " + FMT.fix(val(hist[hist.length - 1]), 3) + " " + unit,
          x + 10, y + 14);
        // The whole run says so, with its time axis at the foot: "t = 0" at
        // the left edge and the clock at the right, so a student reads the
        // approach to steady state against time rather than a bare curve.
        if (Q.whole) {
          ctx.font = FONT.mono(9.5);
          ctx.fillStyle = C.dim;
          ctx.fillText("t = " + Math.round(t0) + " s", x + 10, y + H - 4);
          ctx.textAlign = "right";
          ctx.fillText(Math.round(t1) + " s", x + W - 52, y + H - 4);
          ctx.textAlign = "left";
        }
      }
      ctx.restore();
      y -= H + 8;
      if (y < V.pxH * 0.35) break;
    }
    return rects;
  }

  /** Wind over the water (FF-1): a row of arrows above the free surface,
   *  pointing the way τ blows, longer the stronger it is (|τ|/τmax of the
   *  scene's slider range), with τ printed beside the first one. Nothing at
   *  τ = 0. The row sits a fixed fraction of the way from the highest water
   *  surface to the top of the domain, over the wet columns only. */
  function drawWind(ctx, V, A, sim, tau, tauMax) {
    if (!tau || !(tauMax > 0)) return;
    const nx = sim.nx, dx = sim.dx;
    let i0 = -1, i1 = -1, zs = 0;
    for (let i = 0; i < nx; i++) {
      if (!A || !A.ok[i] || !(A.d[i] > 2 * dx)) continue;
      if (i0 < 0) i0 = i;
      i1 = i;
      zs = Math.max(zs, A.bed[i] + A.d[i]);
    }
    if (i0 < 0) { i0 = 1; i1 = nx - 2; zs = 0.5 * sim.H; }
    const zr = zs + 0.45 * (sim.H - zs);
    const xa = (i0 + 0.5) * dx, xb = (i1 + 0.5) * dx, span = xb - xa;
    const n = 5, pitch = V.w * (span / sim.W) / n;                // px between arrows
    const frac = Math.min(1, Math.abs(tau) / tauMax);
    const len = Math.max(10, 0.85 * pitch * frac), dir = Math.sign(tau);
    const y = V.Y(zr), head = Math.min(10, 0.4 * len + 4);
    ctx.save();
    ctx.strokeStyle = "rgba(235,245,255,0.9)"; ctx.fillStyle = "rgba(235,245,255,0.9)";
    ctx.lineWidth = 1.5 + 2.5 * frac; ctx.lineCap = "round";
    for (let k = 0; k < n; k++) {
      const xc = V.X(xa + (k + 0.5) * span / n);
      const xt = xc - dir * len / 2, xh = xc + dir * len / 2;
      ctx.beginPath(); ctx.moveTo(xt, y); ctx.lineTo(xh - dir * head * 0.6, y); ctx.stroke();
      arrowHead(ctx, xh, y, dir > 0 ? 0 : Math.PI, head, head * 0.55);
    }
    ctx.font = FONT.mono(12);
    ctx.textBaseline = "bottom"; ctx.textAlign = "center";
    ctx.fillText("wind  τ = " + tau.toFixed(Math.abs(tau) < 1 ? 2 : 1) + " N/m²",
                 V.X(0.5 * (xa + xb)), y - 10);
    ctx.restore();
  }

  /** Frame, axes and scale bar — anchored to the VISIBLE part of the domain
   *  so they stay on screen when the view is zoomed in. */
  function drawFrame(ctx, V, sim) {
    const B = V.vis || V;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
    ctx.strokeRect(B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1);
    ctx.font = FONT.mono(10);
    ctx.fillStyle = C.dim;
    // 1-2-5 rounding of roughly a sixth of the visible width
    const target = sim.W * (B.w / V.w) / 6;
    const bar = FMT.nice(target, undefined, 1e-3);
    const bw = bar * V.w / sim.W;
    const bx = B.x + B.w - bw - 14, by = B.y + B.h - 14;
    ctx.strokeStyle = "rgba(223,232,242,0.75)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by - 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(223,232,242,0.8)";
    ctx.fillText((bar < 1 ? bar.toFixed(bar < 0.1 ? 2 : 1) : bar) + " m", bx + bw / 2 - 10, by - 7);
    ctx.restore();
  }

  /** One measurement as text: length, the two legs, and the slope the way a
   *  drainage engineer says it (1 : n). Shared by the on-canvas chip and the
   *  panel row so the two can never disagree. */
  function measureText(m) {
    const dx = m.x1 - m.x0, dz = m.z1 - m.z0, L = Math.hypot(dx, dz);
    let s = L.toFixed(L < 0.1 ? 3 : 2) + " m · Δx " + Math.abs(dx).toFixed(2) +
            " · Δz " + Math.abs(dz).toFixed(2);
    if (Math.abs(dx) > 1e-3 && Math.abs(dz) > 1e-3) {
      const n = Math.abs(dx / dz);
      s += " · 1 : " + (n < 10 ? n.toFixed(2) : n.toFixed(0));
    }
    return s;
  }

  /** The tape measure: a line between the two dragged points, dotted Δx / Δz
   *  legs, and the numbers on a chip. Coordinates are in metres, so the tape
   *  survives zooming and a resolution rebuild. */
  function drawMeasure(ctx, V, m) {
    const ax = V.X(m.x0), ay = V.Y(m.z0), bx = V.X(m.x1), by = V.Y(m.z1);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(127,212,255,0.45)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();                              // the right-angle legs
    ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#7fd4ff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = "#7fd4ff";
    ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, 7); ctx.fill();
    chip(ctx, (ax + bx) / 2 + 8, Math.min(ay, by) - 12, measureText(m), "#7fd4ff");
    ctx.restore();
  }

  /** The force control volume: dashed box, the time-averaged horizontal force
   *  as an arrow through the box centre, and the numbers on a chip. The arrow
   *  is screen-fixed pixels per kN/m rather than domain-scaled, so plate →
   *  deep-V reads as "the arrow doubles" at any zoom. F→ is the honest
   *  headline: the x-budget has no gravity in it. F↑ is printed small — it
   *  carries the weight of whatever water happens to be inside the box and
   *  every splash that rains back in, so it flutters and it should. The ±
   *  is the standard deviation of the instantaneous integral over the last
   *  few seconds — the flutter is real (splash crossing the faces), not
   *  measurement noise, and hiding it would overstate the instrument. */
  function drawCV(ctx, V, cv, show) {
    const x0 = V.X(cv.x0), x1 = V.X(cv.x1);
    const y0 = V.Y(cv.z1), y1 = V.Y(cv.z0);          // screen y flips
    const col = "#ffd166";
    ctx.save();
    ctx.strokeStyle = "rgba(255,209,102,0.85)"; ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);
    const live = cv.ema && isFinite(cv.ema.fx);
    if (live) {
      let sd = 0;
      if (cv.hist && cv.hist.length > 8) {
        let s = 0, s2 = 0;
        for (const q of cv.hist) { s += q.fx; s2 += q.fx * q.fx; }
        const n = cv.hist.length;
        sd = Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)));
      }
      const fx = cv.ema.fx, fz = cv.ema.fz;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // The arrow is the FORCE, both components: on a weir crest or an apron
      // the vertical component is the whole point.
      //
      // The two components are scaled by the same number of newtons per pixel,
      // or the arrow would report an angle the force does not have. That one
      // scale is set by whichever component is larger, so the arrow always
      // fills a sensible fraction of the box whichever way it points. The
      // SCREEN is stretched vertically, though (vex), and the arrow is a force
      // rather than something in the water, so it is drawn in true proportion
      // and reads as an angle you can measure with the tape.
      const fMag = Math.hypot(fx, fz);
      const room = Math.min(x1 - x0, Math.abs(y1 - y0)) * 0.42;
      const L = Math.min(fMag * 0.018, room);
      if (L > 6) {
        const ux = fx / fMag, uz = fz / fMag;          // unit force, z up
        const hx = ux * L / 2, hy = -uz * L / 2;       // screen y is down
        const ax = cx - hx, ay = cy - hy, bx = cx + hx, by = cy + hy;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        // The head, built on the arrow's own axis rather than on x: apex 9 px
        // beyond the shaft's end, base 10 px across at the end.
        arrowHead(ctx, bx + hx / (L / 2) * 9, by + hy / (L / 2) * 9, Math.atan2(hy, hx), 9, 5);
      }
      drawCVBudget(ctx, cv, show, x0, y0, x1, y1, col, fx, fz, sd);
    } else {
      rchip(ctx, x0, y0 - 12, "control volume · settling…", col);
    }
    ctx.restore();
  }

  /** What a face can be labelled with.
   *
   *  `through` quantities (volume, energy) cross the face, so the honest way
   *  to show one is an ARROW and a magnitude: a first-year reading "in" and
   *  "out" off the picture never has to be told what an outward normal is,
   *  and the sign convention stops being a thing they can get wrong. The
   *  momentum column is not a through quantity — its sign is which way the
   *  face pushes — so it keeps a left/right arrow instead.
   *
   *  The energy column is deliberately not given a letter: `E` is specific
   *  energy in the register and stays that way (the E–d diagram is a named
   *  teaching object), and `ρgQH` says exactly what the quantity is. */
  const CV_Q = {
    Q: { label: "Q", through: true,
         at: (e) => e.Q, fmt: (v) => v.toFixed(3) },
    M: { label: "momentum + pressure", through: false,
         at: (e) => e.Mx + e.Fpx, fmt: (v) => FMT.big(v, "N/m") },
    E: { label: "ρgQH", through: true,
         at: (e) => e.E, fmt: (v) => FMT.big(v, "W/m") },
  };

  /** Which way a through-quantity actually crosses this face, as the reader
   *  sees it: the arrow points the way the water goes, so "into the box" and
   *  "out of the box" are read off the picture rather than off a sign. */
  const CV_ARROW = {
    left:  (v) => (v < 0 ? "▶" : "◀"),   // outward-positive: v < 0 is INTO the box
    right: (v) => (v < 0 ? "◀" : "▶"),
    bed:   (v) => (v < 0 ? "▲" : "▼"),
    top:   (v) => (v < 0 ? "▼" : "▲"),
  };

  /** dV/dt of the water inside the box, m²/s: the least-squares slope of the
   *  enclosed volume over the last 2 s of sim time. null until there are
   *  enough samples to fit a line through. */
  function storageRate(hist) {
    if (!hist || hist.length < 6) return null;
    const tEnd = hist[hist.length - 1].t;
    let n = 0, st = 0, sv = 0, stt = 0, stv = 0;
    for (const q of hist) {
      if (tEnd - q.t > 2 || !Number.isFinite(q.vol)) continue;
      n++; st += q.t; sv += q.vol; stt += q.t * q.t; stv += q.t * q.vol;
    }
    const den = n * stt - st * st;
    if (n < 6 || !(den > 1e-12)) return null;
    return (n * stv - st * sv) / den;
  }

  /** The per-edge budget, written ON the edges it crosses, and the three
   *  totals under the box.
   *
   *  Numbers at the edges rather than in a table because WHICH face a flux
   *  crosses is half of what a control-volume question is asking a student to
   *  see; a table of four rows makes them map it back onto the picture
   *  themselves. Outward-positive throughout, so a sign is a direction: what
   *  leaves is positive wherever it leaves from. */
  function drawCVBudget(ctx, cv, show, x0, y0, x1, y1, col, fx, fz, sd) {
    const F = cv.flux;
    // A card that withholds energy never labels the faces with it, whatever
    // B was last left on.
    const q = (show === "E" && !PRINT.energy) ? CV_Q.Q : (CV_Q[show] || CV_Q.Q);
    ctx.font = FONT.mono(10);
    if (F && PRINT.readouts) {
      const e = F.edges;
      const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const put = (key, x, y, ha, va) => {
        const v = q.at(e[key]);
        const txt = q.through
          ? CV_ARROW[key](v) + " " + q.fmt(Math.abs(v))
          : (v < 0 ? "◀ " : "▶ ") + q.fmt(Math.abs(v));
        // In is cool, out is warm — the same distinction the arrow makes,
        // said twice, because this is the thing that gets misread.
        const into = q.through ? v < 0 : false;
        ctx.fillStyle = into ? "rgba(127,212,255,0.95)" : "rgba(255,209,102,0.95)";
        ctx.textAlign = ha; ctx.textBaseline = va;
        ctx.fillText(txt, x, y);
      };
      put("left",  x0 - 6, mid.y, "right", "middle");
      put("right", x1 + 6, mid.y, "left", "middle");
      put("top",   mid.x, y0 - 4, "center", "bottom");
      put("bed",   mid.x, y1 + 4, "center", "top");
    }
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    rchip(ctx, x0, y0 - 12,
         "Control volume · " + q.label + " across each face  ·  B cycles", col);
    if (!F) return;

    // The three conservation laws, said as arithmetic a first-year can check:
    // what went in, what came out, and what the difference means. "Σ over the
    // outward normal" is the same statement and teaches nobody anything.
    const gross = (pick) => {
      let inn = 0, out = 0;
      CV_EDGES.forEach((k) => {
        const v = pick(F.edges[k]);
        if (v < 0) inn -= v; else out += v;
      });
      return { inn, out };
    };
    const Q = gross((e) => e.Q), E = gross((e) => e.E);
    // Continuity is in − out = dV/dt, not in = out: a box round a tank that
    // is filling has a net flux and that is the point (VC-2). The storage
    // rate is the slope of the enclosed water over the last ~2 s of the
    // history, so the closure printed is the unsteady one and reads 0 for a
    // steady box exactly as the old "should be 0" did.
    const dVdt = storageRate(cv.hist);
    const net = Q.out - Q.inn;
    const lines = [
      "water  in " + Q.inn.toFixed(3) + "  out " + Q.out.toFixed(3) +
        "  net " + net.toFixed(3) +
        (dVdt === null ? " m²/s"
          : "  dV/dt " + (dVdt >= 0 ? "+" : "") + dVdt.toFixed(3) + " m²/s" +
            (Q.inn > 1e-9 ? "  (net + dV/dt: " + (100 * Math.abs(net + dVdt) / Q.inn).toFixed(1) + "%, should be 0)" : "")),
      "force    on what is inside:  →  " + FMT.N(fx) + " ±" + FMT.N(sd) + " N/m    ↑ " + FMT.N(fz) + " N/m",
    ];
    if (PRINT.energy) lines.push(
      "energy   in " + FMT.big(E.inn, "W/m") + "   out " + FMT.big(E.out, "W/m") +
        "   lost " + FMT.big(E.inn - E.out, "W/m"));
    const tall = (y1 - y0) > 3 * 15 + 24;
    const top = tall ? y0 + 18 : y0 - 12 - lines.length * 15;
    lines.forEach((t, k) => rchip(ctx, x1 - 6, top + k * 15, t, col, "right"));
  }

  /** The flux sections: what crosses each line, and what happened between
   *  two of them.
   *
   *  A section is the instrument a textbook actually draws, and two of them
   *  answer most of what a control volume answers — continuity between them,
   *  the momentum they carry, the energy lost from one to the next — without
   *  asking a first-year to reason about four faces at once.
   *
   *  Direction is shown, never a sign: an arrow across the line points the way
   *  the water is going through it, and the number beside it is a magnitude.
   *  Which side of the line counts as positive is the tool's business, not the
   *  reader's. */
  function drawFlux(ctx, V, lines, drag) {
    const col = "#8ce1b0";
    ctx.save();
    if (drag) {
      ctx.strokeStyle = "rgba(140,225,176,0.75)"; ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(V.X(drag.x0), V.Y(drag.z0));
      ctx.lineTo(V.X(drag.x1), V.Y(drag.z1));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    lines.forEach((L, k) => {
      const ax = V.X(L.x0), ay = V.Y(L.z0), bx = V.X(L.x1), by = V.Y(L.z1);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      // End ticks, so a section reads as a measured extent rather than as a
      // stray line somebody drew.
      const ux = bx - ax, uy = by - ay, ln = Math.hypot(ux, uy) || 1;
      const px = -uy / ln, py = ux / ln;
      ctx.beginPath();
      ctx.moveTo(ax - px * 5, ay - py * 5); ctx.lineTo(ax + px * 5, ay + py * 5);
      ctx.moveTo(bx - px * 5, by - py * 5); ctx.lineTo(bx + px * 5, by + py * 5);
      ctx.stroke();

      const e = L.ema;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (!e) { rchip(ctx, mx + 8, my, "section " + (k + 1) + " · settling…", col); return; }

      // The arrow shows which way the water crosses, so no reading anywhere on
      // this tool is a bare sign.
      const dir = e.Q >= 0 ? 1 : -1;
      const hx = px * 14 * dir, hy = py * 14 * dir;
      const lx = ux / ln, ly = uy / ln;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(mx - hx, my - hy); ctx.lineTo(mx + hx, my + hy); ctx.stroke();
      ctx.fillStyle = col;
      arrowHead(ctx, mx + hx * 1.6, my + hy * 1.6, Math.atan2(hy, hx), Math.hypot(hx, hy) * 0.6, 5);

      // All four, together. A section is a whole reading, not one number at a
      // time: continuity, the momentum it carries, the pressure the water
      // either side puts on it, and the energy going through — and momentum
      // and pressure are separate columns because telling them apart IS the
      // control-volume question.
      const rows = [
        (k + 1) + "   Q      " + e.Q.toFixed(3) + " m²/s",
        "    M      " + vec(e.Mx, e.Mz, "N/m"),
        "    F      " + vec(e.Fpx, e.Fpz, "N/m"),
      ];
      if (PRINT.energy) rows.push("    ρgQH   " + FMT.big(e.E, "W/m"));
      const side = dir > 0 ? 1 : -1;
      const cx = mx + hx * 1.9 * 1 + side * 8, cy = my - 22;
      rows.forEach((t, i) => rchip(ctx, cx, cy + i * 15, t, col,
                                  side > 0 ? "left" : "right"));
      // One section is a reading; two are an ANSWER. Said here, next to the
      // one section that exists, because that is the moment it is useful —
      // and it goes away by itself the moment it has been acted on.
      if (lines.length === 1) {
        rchip(ctx, cx, cy + rows.length * 15 + 3,
             "draw a second section for the balance between them",
             "rgba(140,225,176,0.62)", side > 0 ? "left" : "right");
      }
    });

    // …and the momentum theorem between the last two, which is the whole
    // reason two sections are usually enough.
    if (lines.length >= 2) {
      const A = lines[lines.length - 2], B = lines[lines.length - 1];
      if (A.ema && B.ema) {
        const a = A.ema, b = B.ema;
        const inQ = Math.max(Math.abs(a.Q), 1e-9);
        // Both sections carry their OWN normal. Treating them as the two ends
        // of a control volume flips the upstream one, which is where each of
        // these differences comes from.
        const dQ = Math.abs(b.Q) - Math.abs(a.Q);
        const fx = (a.Mx - b.Mx) + (a.Fpx - b.Fpx);
        const fz = (a.Mz - b.Mz) + (a.Fpz - b.Fpz);
        const dE = Math.abs(a.E) - Math.abs(b.E);
        const rows = [
          "sections " + (lines.length - 1) + " → " + lines.length,
          "water     " + Math.abs(a.Q).toFixed(3) + " → " + Math.abs(b.Q).toFixed(3) +
            " m²/s   (" + (100 * dQ / inQ).toFixed(1) + "%, should be 0)",
          "momentum  " + FMT.big(a.Mx, "N/m") + " → " + FMT.big(b.Mx, "N/m"),
          "pressure  " + FMT.big(a.Fpx, "N/m") + " → " + FMT.big(b.Fpx, "N/m"),
          "force on what is between them:  " + vec(fx, fz, "N/m"),
        ];
        if (PRINT.energy) rows.push("energy    lost " + FMT.big(dE, "W/m"));
        const x = Math.min(V.X(A.x0), V.X(A.x1), V.X(B.x0), V.X(B.x1));
        const y = Math.max(V.Y(A.z0), V.Y(A.z1), V.Y(B.z0), V.Y(B.z1));
        rows.forEach((t, i) => rchip(ctx, x + 6, y - 12 - (rows.length - 1 - i) * 15, t, col));
      }
    }
    ctx.restore();
  }

  /** The pressure diagram on the face `force` (== `state.force`) has selected
   *  — `force.data` is a `SIM.faceForce` result, EMA'd by `sampleForce`.
   *
   *  Two different things are being drawn, and they are drawn two different
   *  ways on purpose. The DISTRIBUTION — the arrow at every station — is a
   *  geometric feature glued to the wall. Pressure has no tangential
   *  component, so the diagram MUST be perpendicular to the face as rendered,
   *  whatever the exaggeration — but the view transform is anisotropic under
   *  vex (`V.w/sim.W != V.h/sim.H`), so offsetting a sample by its DOMAIN
   *  normal and mapping the result through V.X/V.Y is only perpendicular on
   *  screen when the face is axis-aligned or vex = 1. Instead each arrow's
   *  direction is built from the SCREEN-SPACE tangent between neighbouring
   *  mapped samples (a quarter-turn gives the screen perpendicular); the
   *  domain normal is used only to pick which of the two screen
   *  perpendiculars points into the solid — the "pressing" picture the strip
   *  icon draws. The RESULTANT is a force vector, not a shape in the water —
   *  like drawCV's arrow, it is built in true screen proportion (no vex),
   *  because an angle on it is one a straightedge on the screen should be
   *  able to measure. */
  function drawForce(ctx, V, sim, force, size) {
    const D = force.data, samples = D.samples;
    const col = "#ff8fa3";
    ctx.save();

    // The face itself, always — the selection has to read even where there
    // is no water on it yet (or any longer).
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const px = V.X(s.x), py = V.Y(s.z);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    const g = SIM.gMag();
    let maxHead = 0;
    const heads = samples.map((s) => {
      const h = Math.max(0, Math.min(s.f, 1) * s.p) / g;
      if (h > maxHead) maxHead = h;
      return h;
    });
    if (maxHead > 1e-6) {
      // ONE scale for the whole face — the shape of the diagram is the
      // reading, and a per-station scale would draw a lie. This is the ONLY
      // scale in play — screen px per metre of head — because the arrow
      // direction and length are both built in screen space (see the
      // function comment).
      //
      // And it is HELD, not refitted: `force.scale` is the SCENE's scale
      // (js/instruments.js `forceScale`), {headMax} set from the largest head on any
      // wall at the first pick and shared by every face picked after it, so
      // the diagram neither breathes with the frame nor resizes as you click
      // from face to face — a bigger triangle is a bigger force, anywhere in
      // the scene. Refitting every frame made the diagram the same size
      // whatever the pressure did: on HS-1's piezometer wall the column swung
      // 2.75–3.52 m and the force 16–34 kN/m while the triangle on screen
      // never changed, with the whole reading pushed into the scale chip.
      // Same rule as the colour ranges (AGENTS.md): explicit and held, never
      // tracked. The one concession is a ratchet: should a head later exceed
      // headMax, the scale shrinks to keep the diagram on the canvas, and
      // stays there — it never grows back to flatter a fall. `headMax` maps
      // to `maxPx` screen pixels — 56 times the Controls row "Pressure
      // diagram size" (`size`, default 1), capped at a third of the view — so
      // a resize or the slider rescales the picture but never the comparison
      // between faces.
      const maxPx = Math.min(56 * (size > 0 ? size : 1), V.h / 3);
      const sc = force.scale || (force.scale = { headMax: 0 });
      if (maxHead > sc.headMax) sc.headMax = maxHead;
      const pxPerHead = maxPx / sc.headMax;          // screen px per metre of head

      const P = samples.map((s) => [V.X(s.x), V.Y(s.z)]);
      // Screen px -> domain metres, per axis (the inverse of V.X/V.Y's
      // scaling), just to test which screen perpendicular points into the
      // solid — never used to size or place anything.
      const invSx = sim.W / V.w, invSy = sim.H / V.h;
      const n = samples.length;
      const tips = samples.map((s, i) => {
        const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(n - 1, i + 1)];
        let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        let qx = -ty, qy = tx;                       // a screen perpendicular
        // Which one points into the solid? Convert it to a domain step
        // (screen y is down, so dz flips) and dot with -n (into the solid,
        // per SIM.faceForce's own convention).
        const ddx = qx * invSx, ddz = -qy * invSy;
        if (ddx * -s.nx + ddz * -s.nz < 0) { qx = -qx; qy = -qy; }
        const Lpx = heads[i] * pxPerHead;
        return [P[i][0] + qx * Lpx, P[i][1] + qy * Lpx];
      });

      // The filled prism: out along the face, back along the tips.
      ctx.beginPath();
      P.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      for (let i = tips.length - 1; i >= 0; i--) ctx.lineTo(tips[i][0], tips[i][1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,143,163,0.20)";
      ctx.fill();

      // A subset of arrows, not a hedgehog: a long face samples every couple
      // of centimetres, and an arrowhead at every one of them would be paint,
      // not a reading. The fill above already carries every sample.
      const step = Math.max(1, Math.ceil(n / 24));
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
      for (let i = 0; i < n; i += step) {
        const ax = P[i][0], ay = P[i][1];
        const [bx, by] = tips[i];
        const Lpx = Math.hypot(bx - ax, by - ay);
        if (Lpx < 3) continue;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        // The head, built on the arrow's OWN axis — same idiom as drawCV's.
        arrowHead(ctx, bx, by, Math.atan2(by - ay, bx - ax), Math.min(4.5, Lpx * 0.5));
      }

      // The scale in the units the scene can mean. In plan view (|g| < 0.1:
      // MM-1, FF-3) a "metre of head" is p/(ρ·1e-3 m/s²) — thousands of
      // metres — and the chip read "1 m head = 0 px". There the scale is
      // pressure: 1 m head is ρg·1 m Pa, so px per kPa = pxPerHead / g, and
      // the step is the 1-2-5 number of kPa that spans at least ~12 px. It
      // is a number about a reading, so it folds away with the readouts.
      let scaleTxt, at = [P[0][0] + 6, P[0][1] - 12];
      if (SIM.planView()) {
        // …and at the face's LOWER end on screen: at its top end it sat on
        // the Control volume's budget, which MM-1 draws round the same plate.
        const lo = P[0][1] >= P[n - 1][1] ? P[0] : P[n - 1];
        at = [lo[0] + 6, lo[1] + 14];
        const pxPerKPa = pxPerHead / g;
        const want = 12 / Math.max(pxPerKPa, 1e-12);
        const stepK = FMT.niceUp(want);
        scaleTxt = "scale: " + String(+stepK.toPrecision(1)) + " kPa = " + (stepK * pxPerKPa).toFixed(0) + " px";
      } else {
        scaleTxt = "scale: 1 m head = " + pxPerHead.toFixed(0) + " px";
      }
      rchip(ctx, at[0], at[1], scaleTxt, col);

      // The resultant, through the centre of pressure — heavier, and NOT
      // stretched by vex (see the function comment).
      if (D.cop && D.F > 1e-6) {
        const cx = V.X(D.cop.x), cy = V.Y(D.cop.z);
        const B = V.vis || V;
        const room = Math.min(B.w, B.h) * 0.22;
        const L = Math.min(D.F * 0.018, room);
        if (L > 6) {
          const ux = D.Fx / D.F, uz = D.Fz / D.F;    // unit force, z up
          const hx = ux * L, hy = -uz * L;           // screen y is down
          const bx = cx + hx, by = cy + hy;
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
          arrowHead(ctx, bx + hx / L * 9, by + hy / L * 9, Math.atan2(hy, hx), 9, 5);
        }
        rchip(ctx, cx + 8, cy - 18, "F = " + FMT.kN(D.F), col);
        const refs = (sim.scene && sim.scene.forceRef) || [];
        const ref = refs.indexOf(D.solidId + ":" + D.faceId) >= 0 ? faceDepth(sim, D, g) : null;
        if (!ref) rchip(ctx, cx + 8, cy, vec(D.Fx, D.Fz, "N/m", ["F_h ", "F_v "]), col);
        else {
          // A face the scene lists in `forceRef` (PF-2's wall) gets
          // the components on their own rows and ½ρg·d² beside F_h, d being
          // the wetted height of THIS face.
          const half = 0.5 * 1000 * g * ref * ref;
          rchip(ctx, cx + 8, cy, "F_h " + (D.Fx >= 0 ? "→ " : "← ") + FMT.kN(Math.abs(D.Fx)) +
               "   ½ρgd² = " + FMT.kN(half) + "  (d = " + ref.toFixed(2) + " m)", col);
          rchip(ctx, cx + 8, cy + 18, "F_v " + (D.Fz >= 0 ? "↑ " : "↓ ") + FMT.kN(Math.abs(D.Fz)), col);
        }
      }
    }
    ctx.restore();
  }

  /** The Force tool's hover pick — every wetted surface is a clickable
   *  pressure surface, and this is what says so BEFORE the click. Pure CPU:
   *  `hover` is `{solidId, faceId}` from main.js's screen-space `faceAtPx`,
   *  never a `SIM.faceForce` result, so there is no GPU readback here and no
   *  pressure diagram to draw — only the face's own polyline, in the same
   *  colour as the selected-face stroke (`drawForce`) but thinner and
   *  fainter, so a hover never reads as strong as an actual selection. The
   *  caller skips this entirely when the hover face IS the selected face —
   *  `drawForce`'s full-strength stroke already owns that case. */
  function drawForceHover(ctx, V, sim, hover) {
    const solid = (sim.solids || []).find((s) => s.id === hover.solidId);
    if (!solid) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,143,163,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of GEOM.faceEdges(solid, hover.faceId)) {
      const v0 = solid.verts[e], v1 = solid.verts[(e + 1) % solid.verts.length];
      ctx.moveTo(V.X(v0[0]), V.Y(v0[1]));
      ctx.lineTo(V.X(v1[0]), V.Y(v1[1]));
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The wetted height d of the face a Pressure force reading `D` was taken
   *  on: the free surface η (z + p/g at the lowest wet sample, evaluated at
   *  the point SIM.faceForce actually read — 0.75 Δx out along the normal)
   *  minus the lowest vertex of the face. Null when the face is dry or its
   *  solid is gone. Only drawn for the faces a scene lists in `forceRef`
   *  ("solid:face"). */
  function faceDepth(sim, D, g) {
    const so = (sim.solids || []).find((s) => s.id === D.solidId);
    if (!so) return null;
    let zf = Infinity;
    GEOM.faceEdges(so, D.faceId).forEach((e) => {
      zf = Math.min(zf, so.verts[e][1], so.verts[(e + 1) % so.verts.length][1]);
    });
    let low = null;
    for (const s of D.samples) {
      if (s.f > 0.5 && s.p > 0 && (!low || s.z < low.z)) low = s;
    }
    if (!low || !Number.isFinite(zf)) return null;
    // The elevation the pressure belongs to is its cell's lower face (contract
    // at the top of shaders.js): the cell the sample landed in, j·Δx.
    const zc = Math.floor((low.z + low.nz * 0.75 * sim.dx) / sim.dx) * sim.dx;
    const eta = zc + low.p / g;
    return eta > zf ? eta - zf : null;
  }

  /** A vector as two signed components with their directions spelled out, so
   *  nothing on this tool is read off a bare sign. */
  function vec(vx, vz, unit, labels) {
    // ONE scale for the pair, and the unit written once at the end. Scaling
    // each component on its own produced "1.51 k  0.0 N/m", where the k had
    // come adrift from the unit it belonged to. `labels` ([x, z] prefixes,
    // e.g. ["F_h ", "F_v "]) names the two components.
    const big = Math.max(Math.abs(vx), Math.abs(vz)) >= 1000;
    const L = labels || ["", ""];
    return L[0] + (vx >= 0 ? "→ " : "← ") + FMT.vecPart(vx, big) +
           "   " + L[1] + (vz >= 0 ? "↑ " : "↓ ") + FMT.vecPart(vz, big) +
           " " + (big ? "k" : "") + unit;
  }

  /** Edge rulers in metres: ticks along the bottom (x stations) and left
   *  (elevations above the datum) of the VISIBLE domain, with faint grid
   *  lines at the major ticks. They follow zoom and pan, so a drawn plate
   *  lands at a stated station — the worksheets say "x = 8.0 m", and counting
   *  scale bars is not a measurement. Vertical exaggeration is already inside
   *  V.Y, so the y ruler stays honest when the view is stretched. */
  function drawRuler(ctx, V, sim) {
    const B = V.vis || V;
    const x0 = V.toDomain(B.x, 0)[0], x1 = V.toDomain(B.x + B.w, 0)[0];
    const z0 = V.toDomain(0, B.y + B.h)[1], z1 = V.toDomain(0, B.y)[1];
    // 1-2-5 major step aiming at ~90 px between labels; minors at a fifth.
    const pick = (span, px) => {
      const t = span * 90 / Math.max(px, 1);
      return FMT.nice(t, undefined, 1e-4);
    };
    const sx = pick(x1 - x0, B.w), sy = pick(z1 - z0, B.h);
    const dec = (s) => (s < 0.995 ? (s < 0.0995 ? 2 : 1) : 0);
    ctx.save();
    ctx.font = FONT.mono(10);
    ctx.lineWidth = 1;

    // Bottom edge — x. Integer-stepped in minor units so the loop cannot
    // drift; a major is every fifth minor.
    const yb = B.y + B.h;
    for (let k = Math.ceil(x0 / (sx / 5) - 1e-6); k * sx / 5 <= x1 + 1e-6; k++) {
      const x = k * sx / 5, px = V.X(x);
      const major = ((k % 5) + 5) % 5 === 0;
      if (major) {
        ctx.strokeStyle = "rgba(223,232,242,0.07)";       // grid line
        ctx.beginPath(); ctx.moveTo(px, B.y); ctx.lineTo(px, yb); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(223,232,242," + (major ? "0.6" : "0.3") + ")";
      ctx.beginPath(); ctx.moveTo(px, yb); ctx.lineTo(px, yb - (major ? 9 : 5)); ctx.stroke();
      // Labels stay clear of the scale bar in the bottom-right corner.
      if (major && px < B.x + B.w - 120 && px > B.x + 4) {
        ctx.fillStyle = "rgba(223,232,242,0.6)";
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText(x.toFixed(dec(sx)), px, yb - 13);
      }
    }

    // Left edge — y, elevation above the domain floor (the datum the level
    // controls and the hover readout use).
    for (let k = Math.ceil(z0 / (sy / 5) - 1e-6); k * sy / 5 <= z1 + 1e-6; k++) {
      const y = k * sy / 5, py = V.Y(y);
      const major = ((k % 5) + 5) % 5 === 0;
      if (major) {
        ctx.strokeStyle = "rgba(223,232,242,0.07)";
        ctx.beginPath(); ctx.moveTo(B.x, py); ctx.lineTo(B.x + B.w, py); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(223,232,242," + (major ? "0.6" : "0.3") + ")";
      ctx.beginPath(); ctx.moveTo(B.x, py); ctx.lineTo(B.x + (major ? 9 : 5), py); ctx.stroke();
      if (major && py > B.y + 10 && py < yb - 18) {
        ctx.fillStyle = "rgba(223,232,242,0.6)";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(y.toFixed(dec(sy)), B.x + 12, py);
      }
    }
    ctx.restore();
  }

  return { analyse, resetEstimates, estimates, classify, manning, findJumps, profileRuns,
           keyRow, flushKeys, drawChannel, drawProfileLabels, drawJumps, drawCursorReadout, drawPinMark, drawRake,
           drawGradeLines, drawStreamlines, drawWind, drawRakeScale, arrowHead, rakePxPerMps, FONT, TAU, C,
           ROW_IDS, DEFAULT_ROWS, setPrint, PRINT,
           drawTracers, drawGaugeMarks, drawGaugeCharts, drawFrame, drawRuler,
           drawMeasure, drawCV, drawFlux, drawForce, drawForceHover, measureText, chip };
})();
