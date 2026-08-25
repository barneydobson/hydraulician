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
  // line, S_f = −dE/dx. Any quadratic drag law gives S_f ∝ q²/h³ at fixed q,
  // so the depth at which S_f would equal the bed slope is
  //
  //     y_n = h · (S_f / S₀)^⅓
  //
  // and Manning's n follows from its own definition, n = h^⅔ √S_f / V. Both
  // are then guaranteed consistent with whatever the solver is really doing.
  const EMA = 0.06;                       // temporal smoothing of the estimate

  const C = {
    yc: "#ffb648", yn: "#5fd08a", egl: "#cfe3f5", surf: "#7fd4ff",
    dim: "rgba(223,232,242,0.55)", grid: "rgba(223,232,242,0.13)",
  };

  const fmt = (v, d) => (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)
    ? v.toExponential(1) : v.toFixed(d === undefined ? 2 : d));

  /** Manning n from its definition, given a measured friction slope. */
  function manning(h, V, Sf) {
    if (!(Sf > 0) || Math.abs(V) < 1e-4 || h < 1e-4) return NaN;
    return Math.pow(h, 2 / 3) * Math.sqrt(Sf) / Math.abs(V);
  }

  /** Surface-profile class at one column: letter (bed slope) + zone (1/2/3).
   *  The C band is ±5% — y_n is measured off the energy line, and a tighter
   *  band makes a genuinely critical reach flicker between M and S. */
  function classify(h, yn, yc, S0) {
    let letter;
    if (S0 > 2e-4) letter = yn > yc * 1.05 ? "M" : (yn < yc * 0.95 ? "S" : "C");
    else if (S0 < -2e-4) letter = "A";
    else letter = "H";
    let zone;
    if (letter === "H" || letter === "A") zone = h > yc ? 2 : 3;
    else {
      const hi = Math.max(yn, yc), lo = Math.min(yn, yc);
      zone = h > hi ? 1 : (h > lo ? 2 : 3);
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

  function analyse(sim, col) {
    const S = sim, g = Math.abs(S.p.g) || 9.81, nx = S.nx, dx = S.dx;
    const out = { bed: [], h: [], q: [], surf: [], yc: [], yn: [], S0: [], V: [], Fr: [] };

    const win = Math.max(5, Math.round(nx * 0.09));
    const d = new Float32Array(nx), use = new Float32Array(nx);
    for (let i = 0; i < nx - 1; i++) {
      const drop = (col[i * 4] - col[(i + 1) * 4]) / dx;
      if (Math.abs(drop) <= CLIFF) { d[i] = drop; use[i] = 1; }
    }
    const pv = new Float32Array(nx + 1), pn = new Float32Array(nx + 1);
    for (let i = 0; i < nx; i++) { pv[i + 1] = pv[i] + d[i]; pn[i + 1] = pn[i] + use[i]; }
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
    // M3 hanging over the whole waterfall (and fed those columns into the y_n
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
    const hS = sm(1), qS = sm(2);

    // Then average in TIME, per column. Roll waves and surface ripples travel,
    // so they average out; an M3 reach or a jump stands still, so it survives.
    // Doing this spatially instead needs a window wide enough to swallow a
    // roll wave, which is also wide enough to erase the short reaches that
    // matter most.
    if (!S._hA || S._hA.length !== nx) { S._hA = new Float32Array(hS); S._qA = new Float32Array(qS); }
    for (let i = 0; i < nx; i++) {
      S._hA[i] += 0.10 * (hS[i] - S._hA[i]);
      S._qA[i] += 0.10 * (qS[i] - S._qA[i]);
      hS[i] = S._hA[i]; qS[i] = S._qA[i];
    }
    out.hRaw = []; out.qRaw = [];

    for (let i = 0; i < nx; i++) {
      const bed = col[i * 4], surf = col[i * 4 + 3];
      const h = hS[i], q = qS[i];
      out.hRaw.push(col[i * 4 + 1]); out.qRaw.push(col[i * 4 + 2]);
      const V = h > 1e-3 ? q / h : 0;
      out.bed.push(bed); out.h.push(h); out.q.push(q); out.surf.push(surf);
      out.yc.push(Math.pow(q * q / g, 1 / 3));
      out.S0.push(slope[i]); out.V.push(V);
      out.Fr.push(h > 1e-3 ? Math.abs(V) / Math.sqrt(g * h) : 0);
    }

    // --- friction slope from the energy grade line. The window has to be a
    //     decent fraction of the reach: in a backwater curve dE/dx is small and
    //     differencing it over a short window is mostly noise.
    const Efull = new Float32Array(nx);
    for (let i = 0; i < nx; i++) Efull[i] = out.surf[i] + out.V[i] * out.V[i] / (2 * g);
    const ew = Math.max(3, Math.round(Math.min(1.5, S.W * 0.10) / dx));
    const pe = new Float32Array(nx + 1);
    for (let i = 0; i < nx; i++) pe[i + 1] = pe[i] + Efull[i];
    const Esm = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const lo = Math.max(0, i - ew), hi = Math.min(nx, i + ew + 1);
      Esm[i] = (pe[hi] - pe[lo]) / (hi - lo);
    }
    out.E = Esm;
    out.Sf = new Float32Array(nx);
    out.n = new Array(nx).fill(NaN);
    for (let i = 0; i < nx; i++) {
      const lo = Math.max(0, i - ew), hi = Math.min(nx - 1, i + ew);
      // + tilt: in a tilted-gravity scene the flat-bed energy line misses the
      // S0 of work gravity does per metre of run
      const Sf = (Esm[lo] - Esm[hi]) / Math.max((hi - lo) * dx, 1e-9) + tilt;
      out.Sf[i] = Sf;
      if (ok[i] && out.h[i] > 4 * dx) out.n[i] = manning(out.h[i], out.V[i], Sf);
    }

    // --- normal depth from y_n = h·(S_f/S₀)^⅓.
    //
    //     Fitting that per column is far too noisy: in a backwater curve S_f is
    //     small and every wobble in the energy line moves the answer. But
    //     y_n·S₀^⅓ = h·S_f^⅓ contains no S₀ at all, so a robust median of THAT
    //     over the whole domain gives one well-determined constant, and
    //     dividing it back out by the local S₀^⅓ still gives each reach of a
    //     compound channel its own normal depth.
    const cand = [];
    for (let i = 0; i < nx; i++) {
      const S0 = out.S0[i], Sf = out.Sf[i];
      if (!ok[i] || out.h[i] <= 4 * dx || S0 <= 2e-4) continue;
      if (!(Sf > 0.02 * S0) || Sf > 40 * S0) continue;
      cand.push(out.h[i] * Math.pow(Sf, 1 / 3));
    }
    if (cand.length > 8) {
      cand.sort((a, b) => a - b);
      const k = cand[cand.length >> 1];
      S._ynK = isFinite(S._ynK) ? S._ynK + EMA * (k - S._ynK) : k;
    }
    out.yn = new Array(nx).fill(NaN);
    let anyYn = 0, sumYn = 0;
    if (isFinite(S._ynK)) {
      for (let i = 0; i < nx; i++) {
        if (out.S0[i] <= 2e-4) continue;
        out.yn[i] = S._ynK / Math.pow(out.S0[i], 1 / 3);
        anyYn++; sumYn += out.yn[i];
      }
    }
    out.ynGlobal = anyYn ? sumYn / anyYn : NaN;

    return out;
  }

  /** Forget the running estimates — the per-column depth/discharge time
   *  averages and the domain-wide normal-depth constant.
   *
   *  `_ynK` is ONE number for the whole domain, EMA'd over time and only fed
   *  by columns whose S_f sits in a sane band, so a redrawn rig inherits the
   *  old rig's normal depth for as long as the new one fails to produce
   *  candidates: a drowned gate on a 1-in-4 bed read "M1" that way, because
   *  the local y_c collapsed with the local q while the global y_n did not.
   *  Anything that re-rasterises the walls calls this. */
  function resetEstimates(sim) {
    if (!sim) return;
    sim._ynK = NaN; sim._hA = null; sim._qA = null;
  }

  /** Locate hydraulic jumps: Fr crosses 1 downwards and the depth jumps up.
   *  Reports the measured conjugate pair alongside the momentum prediction
   *  y₂/y₁ = ½(√(1+8Fr₁²) − 1), so the two can be compared on screen. */
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
      if (A.ok[i] && A.Fr[i] > 1.2 && A.hRaw[i] > 3 * dx) {
        let k = i;
        const lim = Math.min(nx - win - 2, i + reach);
        while (k < lim && A.Fr[k] > 0.9) k++;
        if (k < lim && A.hRaw[k + win] > 1.6 * A.hRaw[i]) {
          // y₁ is the THINNEST section upstream, y₂ the deepest downstream.
          // Averaging instead drags the roller into y₁ and the conjugate-depth
          // check then reads 100% high.
          const y1 = ext(A.hRaw, i - 2 * win, i, false);
          const y2 = ext(A.hRaw, k + win, k + 4 * win, true);
          const q = Math.abs(mean(A.qRaw, i - 2 * win, i));
          const Fr1 = y1 > 1e-4 ? (q / y1) / Math.sqrt(g * y1) : 0;
          // 1.35: near-critical undulations (Fr₁ ≈ 1.1–1.3) are transitions,
          // not jumps — boxing every one buried the critical-slope scene.
          if (Fr1 > 1.35 && y2 > y1) {
            out.push({
              x0: (i + 0.5) * dx, x1: (k + 0.5) * dx, i, k, y1, y2, Fr1,
              bed: A.bed[i], surf: A.surf[k + win],
              y2p: 0.5 * y1 * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1),
              dE: Math.pow(y2 - y1, 3) / (4 * y1 * y2),
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
      const ok = A.ok[i] && A.h[i] > 4 * dx && A.q[i] !== 0;
      const c = ok ? classify(A.h[i], A.yn[i], A.yc[i], A.S0[i]) : "";
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
      if (A.ok[i] && A.h[i] > 3 * sim.dx) {
        pc.push([x, V.Y(A.bed[i] + A.yc[i])]);
        pe.push([x, V.Y(A.E[i])]);
      } else { pc.push(null); pe.push(null); }
      if (A.ok[i] && isFinite(A.yn[i]) && A.h[i] > 3 * sim.dx) pn.push([x, V.Y(A.bed[i] + A.yn[i])]);
      else pn.push(null);
    }
    line(ctx, pe, C.egl, 1.0, [1, 3]);
    line(ctx, pn, C.yn, 1.4, [7, 5]);
    line(ctx, pc, C.yc, 1.4, [3, 4]);

    // legend
    const B = V.vis || V;
    let ly = B.y + 16;
    [["energy grade line", C.egl], ["normal depth  yₙ", C.yn], ["critical depth  y𝆑", C.yc]]
      .forEach(([t, c], k) => {
        ctx.save();
        ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        ctx.setLineDash(k === 0 ? [1, 3] : k === 1 ? [7, 5] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(B.x + 12, ly + k * 15); ctx.lineTo(B.x + 40, ly + k * 15);
        ctx.stroke(); ctx.restore();
        ctx.fillStyle = C.dim;
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(t.replace("y𝆑", "y_c"), B.x + 46, ly + k * 15 + 1);
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

  /** Bracket each hydraulic jump and show measured vs momentum-predicted y₂. */
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

      const err = 100 * (J.y2 - J.y2p) / Math.max(J.y2p, 1e-6);
      const rows = [
        "HYDRAULIC JUMP",
        "Fr₁ " + fmt(J.Fr1, 2) + "   y₁ " + fmt(J.y1, 3) + " m",
        "y₂ " + fmt(J.y2, 3) + " m   (momentum: " + fmt(J.y2p, 3) +
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
  function drawCursorReadout(ctx, V, A, sim, mx, my, probe) {
    const i = Math.max(0, Math.min(sim.nx - 1, Math.floor(mx / sim.dx)));
    const h = A.h[i], yc = A.yc[i], yn = A.yn[i], S0 = A.S0[i];
    // Numbers wherever there is water standing on something; the CLASS only
    // where the classification is trustworthy (A.ok also clears a guard band
    // either side of every cliff, which used to blank the whole box at a
    // perfectly measurable station next to a weir).
    const wet = A.onBed[i] && h > 3 * sim.dx;
    // Inside a pressurised conduit there is no free surface to have a profile:
    // the column's "surface" is the soffit and y_c / y_n / S_f are fiction (a
    // full pipe read "H2 profile"). Fill fraction alone does not say so — any
    // submerged cell carries hydrostatic f > 1 — so the test is a water body
    // that reaches its lid AND a cell that is genuinely over-full.
    const js = Math.round(A.surf[i] / sim.dx);
    const capped = js > 0 && js < sim.ny && sim.mask[js * sim.nx + i] >= 64;
    const press = !!probe && probe.f > 1.002 && capped;
    const cls = wet && A.ok[i] && !press ? classify(h, yn, yc, S0) : "";
    const rows = [];
    rows.push(["x, y", fmt(mx, 2) + ", " + fmt(my, 2) + " m"]);
    if (wet) {
      rows.push(["depth d", fmt(h, 3) + " m"]);
      if (!press) rows.push(["level η", fmt(A.bed[i] + h, 3) + " m above datum"]);
      rows.push(["q", fmt(A.q[i], 3) + " m²/s"]);
      rows.push(["V", fmt(A.V[i], 2) + " m/s"]);
    }
    if (wet && !press) {
      rows.push(["Fr", fmt(A.Fr[i], 2) + (A.Fr[i] > 1 ? "  supercritical" : "  subcritical")]);
      rows.push(["y_c", fmt(yc, 3) + " m"]);
      if (isFinite(yn)) rows.push(["y_n", fmt(yn, 3) + " m  (measured)"]);
      rows.push(["S₀", (S0 >= 0 ? "1 : " + fmt(1 / Math.max(S0, 1e-9), 0) : "adverse")]);
      // n is only computed where the classification is trustworthy, so a
      // guard-band station prints the slope alone rather than "n = NaN".
      if (A.Sf[i] > 0) rows.push(["S_f", "1 : " + fmt(1 / A.Sf[i], 0) +
        (isFinite(A.n[i]) ? "   n = " + fmt(A.n[i], 3) : "")]);
    }
    if (probe) {
      rows.push(["u, v", fmt(probe.u, 2) + ", " + fmt(probe.v, 2) + " m/s"]);
      rows.push(["pressure head p/ρg", fmt(probe.head, 3) + " m"]);
      // h = z + p/ρg. Shown in BOTH regimes: in hydrostatic open-channel flow
      // it equals the level η above, but inside a pressurised conduit there is
      // no surface and the η row is suppressed, which is exactly where the
      // piezometric head is the only meaningful head to read.
      rows.push(["head h = z + p/ρg",
        fmt(my - (sim.scene.tiltS0 || 0) * mx + probe.head, 3) + " m"]);
      rows.push(["fill f", fmt(probe.f, 3) + (probe.f > 1.002 ? "  pressurised" : "")]);
    }
    if (!rows.length) return;

    const B = V.vis || V;
    ctx.save();
    ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
    let w = 0;
    rows.forEach((r) => { w = Math.max(w, ctx.measureText(r[0] + "  " + r[1]).width); });
    w += 22;
    const hgt = rows.length * 15 + (cls ? 26 : 10);
    let px = V.X(mx) + 18, py = V.Y(my) - hgt - 12;
    if (px + w > B.x + B.w) px = V.X(mx) - w - 18;
    if (py < B.y + 6) py = V.Y(my) + 18;
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
      ctx.beginPath(); ctx.arc(V.X(t.x0), V.Y(t.y0), 1.6, 0, 7); ctx.fill();
      // WHERE IT IS NOW, in red. The trail says where it has been; at high
      // resolution the sim crawls and without a hard marker you cannot tell
      // which end of the loop is the live one.
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath(); ctx.arc(V.X(t.x), V.Y(t.y), 1.9, 0, 7); ctx.fill();
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
      const x = V.X(gg.x), y = V.Y(gg.y);
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
    const dx = m.x1 - m.x0, dy = m.y1 - m.y0, L = Math.hypot(dx, dy);
    let s = L.toFixed(L < 0.1 ? 3 : 2) + " m · Δx " + Math.abs(dx).toFixed(2) +
            " · Δy " + Math.abs(dy).toFixed(2);
    if (Math.abs(dx) > 1e-3 && Math.abs(dy) > 1e-3) {
      const n = Math.abs(dx / dy);
      s += " · 1 : " + (n < 10 ? n.toFixed(2) : n.toFixed(0));
    }
    return s;
  }

  /** The tape measure: a line between the two dragged points, dotted Δx / Δy
   *  legs, and the numbers on a chip. Coordinates are in metres, so the tape
   *  survives zooming and a resolution rebuild. */
  function drawMeasure(ctx, V, m) {
    const ax = V.X(m.x0), ay = V.Y(m.y0), bx = V.X(m.x1), by = V.Y(m.y1);
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
  function drawCV(ctx, V, cv) {
    const x0 = V.X(cv.x0), x1 = V.X(cv.x1);
    const y0 = V.Y(cv.y1), y1 = V.Y(cv.y0);          // screen y flips
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
      const fx = cv.ema.fx, fy = cv.ema.fy;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const L = Math.min(Math.abs(fx) * 0.018, (x1 - x0) * 0.44);
      if (L > 6) {                                   // the force arrow, x only
        const s = Math.sign(fx), ax = cx - s * L / 2, bx = cx + s * L / 2;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ax, cy); ctx.lineTo(bx, cy); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + s * 9, cy); ctx.lineTo(bx, cy - 5); ctx.lineTo(bx, cy + 5);
        ctx.closePath(); ctx.fill();
      }
      const fN = (v) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
      chip(ctx, x0, y0 - 12, "F→ " + fN(fx) + " ±" + fN(sd) +
        " N/m · F↑ " + fN(fy), col);
    } else {
      chip(ctx, x0, y0 - 12, "force box · settling…", col);
    }
    ctx.restore();
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
    const y0 = V.toDomain(0, B.y + B.h)[1], y1 = V.toDomain(0, B.y)[1];
    // 1-2-5 major step aiming at ~90 px between labels; minors at a fifth.
    const pick = (span, px) => {
      const t = span * 90 / Math.max(px, 1);
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(t, 1e-4))));
      return [1, 2, 5, 10].map((m) => m * mag)
        .reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
    };
    const sx = pick(x1 - x0, B.w), sy = pick(y1 - y0, B.h);
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
    for (let k = Math.ceil(y0 / (sy / 5) - 1e-6); k * sy / 5 <= y1 + 1e-6; k++) {
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
           drawTracers, drawGaugeMarks, drawGaugeCharts, drawFrame, drawRuler,
           drawMeasure, drawCV, measureText, chip, fmt };
})();
