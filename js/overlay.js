"use strict";
/**
 * overlay.js — the 2D canvas that sits on top of the field.
 *
 * Everything here is derived from the per-column reduction (bed, depth, unit
 * discharge) that the GPU hands back each frame: critical and normal depth,
 * the energy grade line, the surface-profile classification (M1, M2, S2 …),
 * gauge traces and the velocity rake. This is the part that turns a pretty
 * fluid into a hydraulics lesson.
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

  const C = {
    dc: "#ffb648", dn: "#5fd08a", egl: "#cfe3f5", hgl: "#ff9de2", surf: "#7fd4ff",
    dim: "rgba(223,232,242,0.55)", grid: "rgba(223,232,242,0.13)",
  };

  const fmt = (v, d) => (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)
    ? v.toExponential(1) : v.toFixed(d === undefined ? 2 : d));

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

  function analyse(sim, col, opts) {
    const S = sim, g = Math.abs(S.p.g) || 9.81, nx = S.nx, dx = S.dx;
    // Average mode hands in mean columns. They have already been averaged over
    // the window, so the prefilters below must NOT run: sm() would smooth in
    // space and _hA/_qA/_ynK would smooth in time a second time, which shows
    // up as a jump broadened by the filter rather than by the flow.
    const AVG = !!(opts && opts.averaged);
    const out = { bed: [], d: [], q: [], surf: [], dc: [], dn: [], S0: [], V: [], Fr: [] };

    const win = Math.max(5, Math.round(nx * 0.09));
    const bd = new Float32Array(nx), use = new Float32Array(nx);
    for (let i = 0; i < nx - 1; i++) {
      const drop = (col[i * 4] - col[(i + 1) * 4]) / dx;
      if (Math.abs(drop) <= CLIFF) { bd[i] = drop; use[i] = 1; }
    }
    const pv = new Float32Array(nx + 1), pn = new Float32Array(nx + 1);
    for (let i = 0; i < nx; i++) { pv[i + 1] = pv[i] + bd[i]; pn[i + 1] = pn[i] + use[i]; }
    // A tilted-gravity scene draws its bed flat and carries the slope in
    // gravity instead — add it back, it is the dynamic slope the GVF sees.
    const tilt = S.scene.tiltS0 || 0;
    const slope = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const lo = Math.max(0, i - win), hi = Math.min(nx - 1, i + win);
      const n = pn[hi] - pn[lo];
      slope[i] = (n > 0 ? (pv[hi] - pv[lo]) / n : 0) + tilt;
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
      const jb = Math.round(col[i * 4] / dx);
      onBed[i] = jb >= 1 && S.mask[(jb - 1) * nx + i] >= 64 ? 1 : 0;
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
      if (!S._hA || S._hA.length !== nx) { S._hA = new Float32Array(dS); S._qA = new Float32Array(qS); }
      for (let i = 0; i < nx; i++) {
        S._hA[i] += 0.10 * (dS[i] - S._hA[i]);
        S._qA[i] += 0.10 * (qS[i] - S._qA[i]);
        dS[i] = S._hA[i]; qS[i] = S._qA[i];
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
    const Efull = new Float32Array(nx);
    for (let i = 0; i < nx; i++) Efull[i] = out.surf[i] + out.V[i] * out.V[i] / (2 * g);
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
      if (AVG) S._ynK = k;
      else S._ynK = isFinite(S._ynK) ? S._ynK + EMA * (k - S._ynK) : k;
    }
    out.dn = new Array(nx).fill(NaN);
    let anyDn = 0, sumDn = 0;
    if (isFinite(S._ynK)) {
      for (let i = 0; i < nx; i++) {
        if (out.S0[i] <= 2e-4) continue;
        out.dn[i] = S._ynK / Math.pow(out.S0[i], 1 / 3);
        anyDn++; sumDn += out.dn[i];
      }
    }
    out.dnGlobal = anyDn ? sumDn / anyDn : NaN;

    return out;
  }

  /** Forget the running estimates — the per-column depth/discharge time
   *  averages and the domain-wide normal-depth constant.
   *
   *  `_ynK` is ONE number for the whole domain, EMA'd over time and only fed
   *  by columns whose S_f sits in a sane band, so a redrawn rig inherits the
   *  old rig's normal depth for as long as the new one fails to produce
   *  candidates: a drowned gate on a 1-in-4 bed read "M1" that way, because
   *  the local d_c collapsed with the local q while the global d_n did not.
   *  Anything that re-rasterises the walls calls this. */
  function resetEstimates(sim) {
    if (!sim) return;
    sim._ynK = NaN; sim._hA = null; sim._qA = null;
  }

  /** Locate hydraulic jumps: Fr crosses 1 downwards and the depth jumps up.
   *  Reports the measured conjugate pair alongside the momentum prediction
   *  d₂/d₁ = ½(√(1+8Fr₁²) − 1), so the two can be compared on screen. */
  function findJumps(A, sim) {
    const nx = sim.nx, dx = sim.dx, g = Math.abs(sim.p.g) || 9.81;
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
          // d₁ is the THINNEST section upstream, d₂ the deepest downstream.
          // Averaging instead drags the roller into d₁ and the conjugate-depth
          // check then reads 100% high.
          const d1 = ext(A.dRaw, i - 2 * win, i, false);
          const d2 = ext(A.dRaw, k + win, k + 4 * win, true);
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
    ctx.font = "600 11px ui-monospace, SFMono-Regular, monospace";
    const w = ctx.measureText(text).width + 12;
    const px = align === "right" ? x - w : x;
    ctx.fillStyle = "rgba(10,14,20,0.82)";
    ctx.beginPath(); ctx.roundRect(px, y - 9, w, 18, 5); ctx.fill();
    ctx.fillStyle = colour;
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 6, y + 1);
    ctx.restore();
  }

  /** Grade lines + profile classification over the channel. */
  function drawChannel(ctx, V, A, sim) {
    const nx = sim.nx, step = Math.max(1, Math.round(nx / 900));
    const g = Math.abs(sim.p.g) || 9.81;
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
    line(ctx, pe, C.egl, 1.0, [1, 3]);
    line(ctx, pn, C.dn, 1.4, [7, 5]);
    line(ctx, pc, C.dc, 1.4, [3, 4]);

    // legend
    const B = V.vis || V;
    let ly = B.y + 16;
    [["energy grade line  H", C.egl], ["normal depth  dₙ", C.dn], ["critical depth  d𝆑", C.dc]]
      .forEach(([t, c], k) => {
        ctx.save();
        ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        ctx.setLineDash(k === 0 ? [1, 3] : k === 1 ? [7, 5] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(B.x + 12, ly + k * 15); ctx.lineTo(B.x + 40, ly + k * 15);
        ctx.stroke(); ctx.restore();
        ctx.fillStyle = C.dim;
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(t.replace("d𝆑", "d_c"), B.x + 46, ly + k * 15 + 1);
      });
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
      ctx.font = "700 13px ui-monospace, SFMono-Regular, monospace";
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
        "Fr₁ " + fmt(J.Fr1, 2) + "   d₁ " + fmt(J.d1, 3) + " m",
        "d₂ " + fmt(J.d2, 3) + " m   (momentum: " + fmt(J.d2p, 3) +
          ", " + (err >= 0 ? "+" : "") + fmt(err, 0) + "%)",
        "ΔE " + fmt(J.dE, 3) + " m lost in the roller",
      ];
      ctx.save();
      ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
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
        ctx.font = (n === 0 ? "700 " : "") + "11px ui-monospace, SFMono-Regular, monospace";
        ctx.fillText(t, px + 10, py + 13 + n * 15);
      });
      ctx.restore();
    });
  }

  /** Profile label + hydraulics numbers at the cursor column. */
  /** THE HOVER CARD'S ROWS, as a register -- the one place they are named.
   *
   *  An exercise profile names these ids to choose what its student reads
   *  (js/main.js, UIMODE.rows), and check_pack.py validates a profile's list
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
   */
  const ROW_IDS = ["pos", "d", "eta", "q", "V", "Fr", "dc", "dn", "S0", "Sf",
                   "uw", "phead", "h", "f"];
  const DEFAULT_ROWS = ROW_IDS.filter((r) => r !== "f");

  /** `show` is the set of row ids the caller wants, or null for the default.
   *  Every row below carries a stable id as its third element, so an exercise
   *  can name exactly the quantities its student should be reading and no
   *  others -- a slope-area exercise wants d, S_f and n, and a card offering
   *  fourteen numbers is a card nobody reads carefully. The ids are the
   *  contract: they are validated against ROW_IDS by check_pack.py, so a typo
   *  in a profile fails the pack rather than silently hiding a row. */
  /** THE TWO GRADE LINES, on their own switch.
   *
   *  The channel overlay already draws the energy line, but only across
   *  columns it considers open-channel: a pressurised run fails its `ok` test
   *  and the line simply stops, which is exactly where a pipe exercise needs
   *  it most. And the HYDRAULIC grade line was not drawn at all.
   *
   *  Both are drawn here for every column that has water in it, pressurised or
   *  not, and the pair is the point: they are separated by the velocity head
   *  V^2/2g, so the gap between them IS the kinetic energy, drawn to scale. In
   *  a steady free-surface reach the HGL lies on the water surface; in a pipe
   *  it leaves the crown and the picture stops being a cartoon.
   *
   *  `hgl` is SIM.hydraulicGrade()'s array (piezometric head per column, NaN
   *  where dry). The energy line is that plus the velocity head, so the two
   *  are consistent by construction rather than by two separate estimates that
   *  can disagree about where the water is. */
  function drawGradeLines(ctx, V, A, sim, hgl) {
    if (!hgl) return;
    const nx = sim.nx, step = Math.max(1, Math.round(nx / 900));
    const g = Math.abs(sim.p.g) || 9.81;
    const ph = [], pe = [];
    for (let i = 0; i < nx; i += step) {
      const x = V.X((i + 0.5) * sim.dx), h = hgl[i];
      if (isFinite(h)) {
        const v = A.V[i] || 0;
        ph.push([x, V.Y(h)]);
        pe.push([x, V.Y(h + v * v / (2 * g))]);
      } else { ph.push(null); pe.push(null); }
    }
    line(ctx, pe, C.egl, 1.4, [6, 3]);
    line(ctx, ph, C.hgl, 1.4, [2, 3]);

    const B = V.vis || V;
    let ly = B.y + 16;
    [["energy grade line  H", C.egl, [6, 3]],
     ["hydraulic grade line  h", C.hgl, [2, 3]]].forEach(([t, c, d], k) => {
      ctx.save();
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.setLineDash(d);
      ctx.beginPath(); ctx.moveTo(B.x + 12, ly + k * 15); ctx.lineTo(B.x + 40, ly + k * 15);
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.dim;
      ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(t, B.x + 46, ly + k * 15 + 1);
    });
  }

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
    const capped = js > 0 && js < sim.ny && sim.mask[js * sim.nx + i] >= 64;
    const press = !!probe && probe.f > 1.002 && capped;
    const cls = wet && A.ok[i] && !press ? classify(d, dn, dc, S0) : "";
    const rows = [];
    rows.push(["x, z", fmt(mx, 2) + ", " + fmt(mz, 2) + " m", "pos"]);
    if (wet) {
      rows.push(["depth d", fmt(d, 3) + " m", "d"]);
      if (!press) rows.push(["level η", fmt(A.bed[i] + d, 3) + " m above datum", "eta"]);
      rows.push(["q", fmt(A.q[i], 3) + " m²/s", "q"]);
      rows.push(["V", fmt(A.V[i], 2) + " m/s", "V"]);
    }
    if (wet && !press) {
      rows.push(["Fr", fmt(A.Fr[i], 2) + (A.Fr[i] > 1 ? "  supercritical" : "  subcritical"), "Fr"]);
      rows.push(["d_c", fmt(dc, 3) + " m", "dc"]);
      if (isFinite(dn)) rows.push(["d_n", fmt(dn, 3) + " m  (measured)", "dn"]);
      rows.push(["S₀", (S0 >= 0 ? "1 : " + fmt(1 / Math.max(S0, 1e-9), 0) : "adverse"), "S0"]);
      // n is only computed where the classification is trustworthy, so a
      // guard-band station prints the slope alone rather than "n = NaN".
      if (A.Sf[i] > 0) rows.push(["S_f", "1 : " + fmt(1 / A.Sf[i], 0) +
        (isFinite(A.n[i]) ? "   n = " + fmt(A.n[i], 3) : ""), "Sf"]);
    }
    if (probe) {
      rows.push(["u, w", fmt(probe.u, 2) + ", " + fmt(probe.w, 2) + " m/s", "uw"]);
      rows.push(["pressure head p/ρg", fmt(probe.phead, 3) + " m", "phead"]);
      // h = z + p/ρg. Shown in BOTH regimes: in hydrostatic open-channel flow
      // it equals the level η above, but inside a pressurised conduit there is
      // no surface and the η row is suppressed, which is exactly where the
      // piezometric head is the only meaningful head to read.
      rows.push(["head h = z + p/ρg",
        fmt(mz - (sim.scene.tiltS0 || 0) * mx + probe.phead, 3) + " m", "h"]);
      rows.push(["fill f", fmt(probe.f, 3) + (probe.f > 1.002 ? "  pressurised" : ""), "f"]);
    }
    // Filter to what was asked for. A row with no id is never hidden -- if a
    // future row forgets its tag it keeps showing, which is the safe way round.
    const keep = show || DEFAULT_ROWS;
    const shown = rows.filter((r) => !r[2] || keep.indexOf(r[2]) >= 0);
    rows.length = 0; Array.prototype.push.apply(rows, shown);
    if (!rows.length) return;

    const B = V.vis || V;
    ctx.save();
    ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
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
      ctx.font = "700 14px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(cls + " profile", px + 11, y + 2);
      ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
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

  /** Vertical velocity rake: u(y) drawn against the water column it sits in.
   *  The profile is also INTEGRATED over the column — q = ∫u dy — so the rake
   *  is a flow measurement, not just a shape: the discharge it reports can be
   *  checked against the hover readout's flux-based q at the same station. */
  function drawRake(ctx, V, sim, rk, A) {
    const { i, buf } = rk;
    const x0 = V.X((i + 0.5) * sim.dx);
    const bed = A.bed[i], surf = A.surf[i];
    let umax = 1e-3, sum = 0, cnt = 0;
    for (let j = 0; j < sim.ny; j++) {
      const y = (j + 0.5) * sim.dx;
      if (y < bed || y > surf) continue;
      const u = 0.5 * (buf[j * 4] + (j + 1 < sim.ny ? buf[j * 4] : 0)) || buf[j * 4];
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
    const scale = Math.min(V.w * 0.13, 110) / umax;

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
      const px = x0 + buf[j * 4] * scale, py = V.Y(y);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "#ffd98a"; ctx.lineWidth = 1.8; ctx.stroke();

    // depth-average marker
    ctx.beginPath();
    ctx.moveTo(x0 + Vbar * scale, V.Y(bed)); ctx.lineTo(x0 + Vbar * scale, V.Y(surf));
    ctx.strokeStyle = "rgba(255,217,138,0.35)"; ctx.lineWidth = 1; ctx.stroke();

    chip(ctx, x0 + 6, V.Y(surf) - 32,
      "q = ∫u dy = " + fmt(q, 3) + " m²/s", "#7fd4ff");
    chip(ctx, x0 + 6, V.Y(surf) - 14,
      "u_max " + fmt(umax, 2) + "  V " + fmt(Vbar, 2) + "  ratio " + fmt(umax / Math.max(Vbar, 1e-3), 2),
      "#ffd98a");
    ctx.restore();
  }

  /** Gauge markers on the field. */
  function drawGaugeMarks(ctx, V, gauges) {
    gauges.forEach((gg, k) => {
      const x = V.X(gg.x), y = V.Y(gg.z);
      ctx.save();
      ctx.strokeStyle = gg.colour; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = gg.colour;
      ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.2832); ctx.fill();
      ctx.font = "700 10px ui-monospace, monospace";
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
  function drawGaugeCharts(ctx, V, gauges, field, label, unit) {
    const rects = [];
    if (!gauges.length) return rects;
    const W = Math.min(330, V.pxW * 0.32), H = 82, pad = 10;
    let y = V.pxH - pad - H;
    for (let k = gauges.length - 1; k >= 0; k--) {
      const gg = gauges[k], x = V.pxW - pad - W;
      rects.push({ k, x, y, w: W, h: H });
      const hist = gg.hist;
      ctx.save();
      ctx.fillStyle = "rgba(12,17,26,0.80)";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 10); ctx.fill(); ctx.stroke();

      if (hist.length > 1) {
        let lo = Infinity, hi = -Infinity;
        for (const s of hist) { const v = s[field]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo < 1e-6) { hi = lo + 1e-3; }
        const pad2 = (hi - lo) * 0.12; lo -= pad2; hi += pad2;
        const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
        const px = (t) => x + 10 + (t - t0) / Math.max(t1 - t0, 1e-6) * (W - 58);
        const py = (v) => y + H - 16 - (v - lo) / (hi - lo) * (H - 30);
        ctx.beginPath();
        hist.forEach((s, n) => { const a = px(s.t), b = py(s[field]); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        ctx.strokeStyle = gg.colour; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = C.dim;
        ctx.fillText(fmt(hi, 2), x + W - 44, y + 16);
        ctx.fillText(fmt(lo, 2), x + W - 44, y + H - 12);
        ctx.fillStyle = "#e8f0f8";
        ctx.font = "700 11px ui-monospace, monospace";
        ctx.fillText(String(k + 1) + "  " + label + " " + fmt(hist[hist.length - 1][field], 3) + " " + unit,
          x + 10, y + 14);
      }
      ctx.restore();
      y -= H + 8;
      if (y < V.pxH * 0.35) break;
    }
    return rects;
  }

  /** Frame, axes and scale bar — anchored to the VISIBLE part of the domain
   *  so they stay on screen when the view is zoomed in. */
  function drawFrame(ctx, V, sim) {
    const B = V.vis || V;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
    ctx.strokeRect(B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = C.dim;
    // 1-2-5 rounding of roughly a sixth of the visible width
    const target = sim.W * (B.w / V.w) / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-3))));
    const bar = [1, 2, 5, 10].map((m) => m * mag)
      .reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
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
      // The arrow is the FORCE, both components. It used to be drawn from fx
      // alone, so a box on a weir crest or an apron — where the vertical
      // component is the whole point — showed an arrow that flatly ignored it.
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
        // The head, built on the arrow's own axis rather than on x.
        const px = -hy / (L / 2), py = hx / (L / 2);   // unit perpendicular
        ctx.beginPath();
        ctx.moveTo(bx + hx / (L / 2) * 9, by + hy / (L / 2) * 9);
        ctx.lineTo(bx + px * 5, by + py * 5);
        ctx.lineTo(bx - px * 5, by - py * 5);
        ctx.closePath(); ctx.fill();
      }
      const fN = (v) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
      drawCVBudget(ctx, cv, show, x0, y0, x1, y1, col, fx, fz, sd, fN);
    } else {
      chip(ctx, x0, y0 - 12, "control volume · settling…", col);
    }
    ctx.restore();
  }

  /** The per-edge budget, written ON the edges it crosses, and the three
   *  totals under the box.
   *
   *  Numbers at the edges rather than in a table because WHICH face a flux
   *  crosses is half of what a control-volume question is asking a student to
   *  see; a table of four rows makes them map it back onto the picture
   *  themselves. Outward-positive throughout, so a sign is a direction: what
   *  leaves is positive wherever it leaves from. */
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
    Q: { label: "Q", unit: "m²/s", through: true, dp: 3,
         at: (e) => e.Q, fmt: (v) => v.toFixed(3) },
    M: { label: "momentum + pressure", unit: "N/m", through: false, dp: 1,
         at: (e) => e.Mx + e.Fpx, fmt: (v) => fmtBig(v, "N/m") },
    E: { label: "ρgQH", unit: "W/m", through: true, dp: 0,
         at: (e) => e.E, fmt: (v) => fmtBig(v, "W/m") },
  };
  /** Watts per metre run to thousands once a reach is doing any work at all. */
  function fmtBig(v, unit) {
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 2) + " k" + unit;
    return (a >= 100 ? v.toFixed(0) : v.toFixed(1)) + " " + unit;
  }

  /** Which way a through-quantity actually crosses this face, as the reader
   *  sees it: the arrow points the way the water goes, so "into the box" and
   *  "out of the box" are read off the picture rather than off a sign. */
  const CV_ARROW = {
    left:  (v) => (v < 0 ? "▶" : "◀"),   // outward-positive: v < 0 is INTO the box
    right: (v) => (v < 0 ? "◀" : "▶"),
    bed:   (v) => (v < 0 ? "▲" : "▼"),
    top:   (v) => (v < 0 ? "▼" : "▲"),
  };

  function drawCVBudget(ctx, cv, show, x0, y0, x1, y1, col, fx, fz, sd, fN) {
    const F = cv.flux;
    const q = CV_Q[show] || CV_Q.Q;
    ctx.font = "10px ui-monospace, monospace";
    if (F) {
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
    chip(ctx, x0, y0 - 12,
         "Control volume · " + q.label + " across each face  ·  B cycles", col);
    if (!F) return;

    // The three conservation laws, said as arithmetic a first-year can check:
    // what went in, what came out, and what the difference means. "Σ over the
    // outward normal" is the same statement and teaches nobody anything.
    const gross = (pick) => {
      let inn = 0, out = 0;
      ["left", "right", "bed", "top"].forEach((k) => {
        const v = pick(F.edges[k]);
        if (v < 0) inn -= v; else out += v;
      });
      return { inn, out };
    };
    const Q = gross((e) => e.Q), E = gross((e) => e.E);
    const lines = [
      "water    in " + Q.inn.toFixed(3) + "   out " + Q.out.toFixed(3) +
        "   net " + (Q.out - Q.inn).toFixed(3) + " m²/s" +
        (Q.inn > 1e-9 ? "  (" + (100 * Math.abs(Q.out - Q.inn) / Q.inn).toFixed(1) + "%, should be 0)" : ""),
      "force    on what is inside:  →  " + fN(fx) + " ±" + fN(sd) + " N/m    ↑ " + fN(fz) + " N/m",
      "energy   in " + fmtBig(E.inn, "W/m") + "   out " + fmtBig(E.out, "W/m") +
        "   lost " + fmtBig(E.inn - E.out, "W/m"),
    ];
    const tall = (y1 - y0) > 3 * 15 + 24;
    const top = tall ? y0 + 18 : y0 - 12 - lines.length * 15;
    lines.forEach((t, k) => chip(ctx, x1 - 6, top + k * 15, t, col, "right"));
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
  function drawFlux(ctx, V, lines, show, drag) {
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
      if (!e) { chip(ctx, mx + 8, my, "section " + (k + 1) + " · settling…", col); return; }

      // The arrow shows which way the water crosses, so no reading anywhere on
      // this tool is a bare sign.
      const dir = e.Q >= 0 ? 1 : -1;
      const hx = px * 14 * dir, hy = py * 14 * dir;
      const lx = ux / ln, ly = uy / ln;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(mx - hx, my - hy); ctx.lineTo(mx + hx, my + hy); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(mx + hx * 1.6, my + hy * 1.6);
      ctx.lineTo(mx + hx + lx * 5, my + hy + ly * 5);
      ctx.lineTo(mx + hx - lx * 5, my + hy - ly * 5);
      ctx.closePath(); ctx.fill();

      // All four, together. A section is a whole reading, not one number at a
      // time: continuity, the momentum it carries, the pressure the water
      // either side puts on it, and the energy going through — and momentum
      // and pressure are separate columns because telling them apart IS the
      // control-volume question.
      const rows = [
        (k + 1) + "   Q      " + e.Q.toFixed(3) + " m²/s",
        "    M      " + vec(e.Mx, e.Mz, "N/m"),
        "    F      " + vec(e.Fpx, e.Fpz, "N/m"),
        "    ρgQH   " + fmtBig(e.E, "W/m"),
      ];
      const side = dir > 0 ? 1 : -1;
      const cx = mx + hx * 1.9 * 1 + side * 8, cy = my - 22;
      rows.forEach((t, i) => chip(ctx, cx, cy + i * 15, t, col,
                                  side > 0 ? "left" : "right"));
      // One section is a reading; two are an ANSWER. Said here, next to the
      // one section that exists, because that is the moment it is useful —
      // and it goes away by itself the moment it has been acted on.
      if (lines.length === 1) {
        chip(ctx, cx, cy + rows.length * 15 + 3,
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
          "momentum  " + fmtBig(a.Mx, "N/m") + " → " + fmtBig(b.Mx, "N/m"),
          "pressure  " + fmtBig(a.Fpx, "N/m") + " → " + fmtBig(b.Fpx, "N/m"),
          "force on what is between them:  " + vec(fx, fz, "N/m"),
          "energy    lost " + fmtBig(dE, "W/m"),
        ];
        const x = Math.min(V.X(A.x0), V.X(A.x1), V.X(B.x0), V.X(B.x1));
        const y = Math.max(V.Y(A.z0), V.Y(A.z1), V.Y(B.z0), V.Y(B.z1));
        rows.forEach((t, i) => chip(ctx, x + 6, y - 12 - (rows.length - 1 - i) * 15, t, col));
      }
    }
    ctx.restore();
  }

  /** A vector as two signed components with their directions spelled out, so
   *  nothing on this tool is read off a bare sign. */
  function vec(vx, vz, unit) {
    // ONE scale for the pair, and the unit written once at the end. Scaling
    // each component on its own produced "1.51 k  0.0 N/m", where the k had
    // come adrift from the unit it belonged to.
    const big = Math.max(Math.abs(vx), Math.abs(vz)) >= 1000;
    const d = (v) => {
      const a = Math.abs(v) / (big ? 1000 : 1);
      return big || a < 100 ? a.toFixed(a >= 10 ? 1 : 2) : a.toFixed(0);
    };
    return (vx >= 0 ? "→ " : "← ") + d(vx) +
           "   " + (vz >= 0 ? "↑ " : "↓ ") + d(vz) +
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
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(t, 1e-4))));
      return [1, 2, 5, 10].map((m) => m * mag)
        .reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
    };
    const sx = pick(x1 - x0, B.w), sy = pick(z1 - z0, B.h);
    const dec = (s) => (s < 0.995 ? (s < 0.0995 ? 2 : 1) : 0);
    ctx.save();
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
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

  return { analyse, resetEstimates, classify, manning, findJumps, profileRuns,
           drawChannel, drawProfileLabels, drawJumps, drawCursorReadout, drawRake,
           drawGradeLines,
           ROW_IDS, DEFAULT_ROWS,
           drawTracers, drawGaugeMarks, drawGaugeCharts, drawFrame, drawRuler,
           drawMeasure, drawCV, drawFlux, measureText, chip, fmt };
})();
