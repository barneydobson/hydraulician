"use strict";
/**
 * gauge-inspector.js - GINSP, the per-gauge history window.
 *
 * Split out of js/main.js, which had grown to 5,100 lines holding thirteen
 * independent modules; the block below moved verbatim. What the module is and
 * why it is DOM rather than more canvas is documented on it.
 *
 * It reaches back into main.js for FIELDS, KEYS, canvas, dragWindow, frame,
 * showToast, state and syncPanel -- all from inside functions, which is what
 * makes the load order in index.html a free choice rather than a constraint.
 */

// -------------------------------------------------------- gauge inspector
/** A draggable DOM window per gauge: identity, live values, and the WHOLE
 *  stored history on a chart you can pan and zoom.
 *
 *  The corner cards are deliberately untouched — every shipped worksheet
 *  screenshot has one in it — so this reads the same samples from the deep
 *  `log` store and leaves `drawGaugeCharts` alone. It is DOM rather than more
 *  canvas because the things it needs (drag, wheel-zoom over a small target,
 *  a download button, text you can select) are what the DOM is for. */
const GINSP = (() => {
  // What a gauge records is GAUGE_QTY in main.js — the gauges' own register,
  // a different one from the FIELDS the water is painted with, and named apart
  // from it for that reason. Every sample carries every quantity in it; what
  // a gauge PLOTS is its own `field` (gaugeFieldOf), and what the window
  // OFFERS is the exercise's `ui.gaugeFields` (UIMODE.gaugeFields).
  //
  // Symbols follow free-surface convention: h is the piezometric head, d the
  // depth and η the water level (wire key "eta" — ASCII, the same pattern as
  // "speed" for |u|), leaving H free for the energy head (the full rationale,
  // texts included, is in docs/notation.md). Since rig format v2 the KEYS are
  // the symbols; older wire formats are rejected, not migrated — prototype,
  // no back-compat.
  const offered = () => UIMODE.gaugeFields();
  const shown = (q, s) => (s && Number.isFinite(s[q.id]) ? s[q.id] * q.k : undefined);
  const open = [];              // live inspector windows
  const posMemo = {};           // gauge id → [left, top], so reopening lands home
  let host = null, btnHost = null, btns = [], sels = [], xbtns = [];

  function hosts() {
    if (!host) {
      host = document.createElement("div"); host.id = "ginspHost";
      document.body.appendChild(host);
      btnHost = document.createElement("div"); btnHost.id = "gcardBtns";
      document.body.appendChild(btnHost);
    }
  }

  function fmtT(t) { return (t < 10 ? t.toFixed(2) : t.toFixed(1)) + " s"; }

  /** Stacking counter: every show / click takes the next value, so the most
   *  recently touched window is always on top. */
  let zTop = 21;

  /** Open (or front) the inspector for gauge index k. */
  function show(k) {
    const g = state.gauges[k];
    if (!g) return null;
    const was = open.find((o) => o.g === g);
    if (was) { was.el.style.zIndex = String(++zTop); return was; }
    if (!g.id) g.id = ++state.gaugeSeq;   // rig scripts push bare gauge objects
    hosts();
    const el = document.createElement("div");
    el.className = "ginsp glass";
    el.innerHTML =
      '<div class="ginsp-h">' +
        '<span class="ginsp-dot"></span><b class="ginsp-name"></b>' +
        '<span class="ginsp-pos"></span><span class="ginsp-grow"></span>' +
        '<button class="ginsp-rm" title="Remove this gauge — its history goes; the others keep theirs">× gauge</button>' +
        '<button class="ginsp-x" title="Close this window (the gauge stays)">×</button>' +
      '</div>' +
      '<div class="ginsp-vals"></div>' +
      '<div class="ginsp-tabs"></div>' +
      '<canvas class="ginsp-c"></canvas>' +
      '<div class="ginsp-foot">' +
        '<button class="ginsp-b" data-a="csv">⤓ CSV this gauge</button>' +
        '<button class="ginsp-b" data-a="csvall">⤓ CSV all gauges</button>' +
        '<span class="ginsp-span"></span>' +
      '</div>' +
      '<div class="ginsp-cap">Wheel zooms the time axis about the cursor · drag pans · ' +
        'double-click fits all. History freezes while paused; <b>R</b> (reset water) ' +
        'and loading a scene clear it.</div>';
    host.appendChild(el);
    const o = { g, el, t0: 0, t1: 1, fit: true,
                hover: null, drag: null, cv: el.querySelector(".ginsp-c") };
    open.push(o);

    const p = posMemo[g.id] ||
      [Math.max(8, innerWidth - 428), 76 + 26 * (open.length - 1)];
    el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
    el.style.zIndex = String(++zTop);
    el.addEventListener("pointerdown", () => {
      el.style.zIndex = String(++zTop);
    }, true);

    // ---- header drag (see `dragWindow`)
    dragWindow(el, el.querySelector(".ginsp-h"), (L, T) => { posMemo[g.id] = [L, T]; });
    el.querySelector(".ginsp-x").onclick = (e) => { e.currentTarget.blur(); hide(o); };
    el.querySelector(".ginsp-rm").onclick = (e) => { e.currentTarget.blur(); removeGauge(g); };

    // ---- value rows and field tabs: built from what this exercise offers,
    // and rebuilt by `draw` whenever that changes (a profile lifted by ⋯).
    buildRows(o);

    // ---- csv
    el.querySelectorAll(".ginsp-b").forEach((b) => {
      b.onclick = () => {
        b.blur();
        if (b.dataset.a === "csv") download([g], "g" + (state.gauges.indexOf(g) + 1));
        else download(state.gauges, "gauges");
      };
    });

    // ---- chart gestures: wheel zoom about the cursor, drag pan, dbl-click fit
    const cv = o.cv;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const tc = tAt(o, e.clientX - r.left, r.width);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
      let a = tc - (tc - o.t0) / f, b = tc + (o.t1 - tc) / f;
      if (b - a < 0.02) { const m = (a + b) / 2; a = m - 0.01; b = m + 0.01; }
      o.t0 = a; o.t1 = b; o.fit = false;
      clampT(o); draw(o);
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
      o.pan = { x: e.clientX, t0: o.t0, t1: o.t1, w: r.width };
    });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect();
      if (o.pan) {
        const d = (e.clientX - o.pan.x) / Math.max(r.width - 60, 1) * (o.pan.t1 - o.pan.t0);
        o.t0 = o.pan.t0 - d; o.t1 = o.pan.t1 - d; o.fit = false;
        clampT(o);
      }
      o.hover = [e.clientX - r.left, e.clientY - r.top];
      draw(o);
    });
    const endPan = () => { o.pan = null; };
    cv.addEventListener("pointerup", endPan);
    cv.addEventListener("pointercancel", endPan);
    cv.addEventListener("pointerleave", () => { o.hover = null; o.pan = null; draw(o); });
    cv.addEventListener("dblclick", () => { o.fit = true; draw(o); });

    draw(o);
    return o;
  }

  /** The value rows (one per offered quantity, live numbers) and the tabs
   *  that choose what the chart — and the gauge's corner card — plots. A tab
   *  sets the GAUGE's own field, so the card and the window always agree. */
  function buildRows(o) {
    const el = o.el, Q = offered();
    o.qkey = Q.map((q) => q.id).join(",");
    const vals = el.querySelector(".ginsp-vals"), tabs = el.querySelector(".ginsp-tabs");
    vals.textContent = ""; tabs.textContent = "";
    o.vb = {};
    Q.forEach((q) => {
      const d = document.createElement("div"); d.dataset.f = q.id;
      d.innerHTML = "<span></span><b>—</b><i></i>";
      d.querySelector("span").textContent = q.sym;
      d.querySelector("i").textContent = q.note;
      vals.appendChild(d);
      o.vb[q.id] = { row: d, b: d.querySelector("b"), q };
      const b = document.createElement("button");
      b.textContent = q.sym; b.dataset.f = q.id; b.title = q.name + " — " + q.note;
      b.onclick = () => { o.g.field = q.id; b.blur(); draw(o); };
      tabs.appendChild(b);
    });
  }

  function hide(o) {
    const i = open.indexOf(o);
    if (i < 0) return;
    open.splice(i, 1);
    o.el.remove();
  }
  function closeAll() { while (open.length) hide(open[0]); }
  /** Close the window belonging to a gauge that has just been removed —
   *  otherwise it hangs about plotting a series nothing is feeding. */
  function closeFor(g) {
    for (let k = open.length - 1; k >= 0; k--) if (open[k].g === g) hide(open[k]);
  }

  // ---- time-axis helpers
  function span(o) { return Math.max(o.t1 - o.t0, 1e-6); }
  function tAt(o, px, w) { return o.t0 + (px - 10) / Math.max(w - 60, 1) * span(o); }
  function clampT(o) {
    const L = o.g.log || [];
    if (!L.length) return;
    const a = L[0].t, b = L[L.length - 1].t, s = span(o);
    if (s > (b - a) + 1e-9) { o.t0 = a; o.t1 = a + Math.max(b - a, 0.02); return; }
    if (o.t0 < a) { o.t1 += a - o.t0; o.t0 = a; }
    if (o.t1 > b) { o.t0 -= o.t1 - b; o.t1 = b; }
  }
  /** First index with t >= tv. */
  function lower(L, tv) {
    let a = 0, b = L.length;
    while (a < b) { const m = (a + b) >> 1; if (L[m].t < tv) a = m + 1; else b = m; }
    return a;
  }

  /** Redraw one window: numbers, tab state, caption and the chart. */
  function draw(o) {
    const g = o.g, L = g.log || [], el = o.el;
    const k = state.gauges.indexOf(g);
    el.querySelector(".ginsp-dot").style.background = g.colour;
    el.querySelector(".ginsp-name").textContent = "Gauge " + (k + 1);
    el.querySelector(".ginsp-pos").textContent =
      "x " + g.x.toFixed(2) + " · z " + g.z.toFixed(2) + " m";
    const last = L.length ? L[L.length - 1] : null;
    if (o.qkey !== offered().map((q) => q.id).join(",")) buildRows(o);
    o.field = gaugeFieldOf(g);
    const F = gaugeQty(o.field);
    Object.keys(o.vb).forEach((f) => {
      const V = o.vb[f];
      // A sample logged before a quantity existed (stale main.js next to a
      // fresh this) has no such key; throwing here kills the frame loop.
      const v = shown(V.q, last);
      V.b.textContent = (Number.isFinite(v) ? v.toFixed(3) : "—") + " " + V.q.unit;
      V.row.classList.toggle("on", f === o.field);
    });
    [...el.querySelectorAll(".ginsp-tabs button")]
      .forEach((b) => b.classList.toggle("on", b.dataset.f === o.field));
    const sp = el.querySelector(".ginsp-span");
    sp.textContent = (L.length
      ? L.length.toLocaleString() + (L.length === 1 ? " sample · " : " samples · ") +
        fmtT(L[0].t) + " → " + fmtT(L[L.length - 1].t)
      : "no samples yet") + (state.paused ? "  · frozen" : "");
    sp.classList.toggle("frozen", state.paused);

    const cv = o.cv, dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 372, h = cv.clientHeight || 158;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(6,10,16,0.55)";
    c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill();
    if (L.length < 2) {
      c.fillStyle = "rgba(223,232,242,0.45)";
      c.font = "11px ui-monospace, monospace";
      c.fillText(L.length ? "one sample so far" : "no history yet — press ▶︎ Run", 12, h / 2);
      return;
    }
    if (o.fit) { o.t0 = L[0].t; o.t1 = Math.max(L[L.length - 1].t, L[0].t + 0.02); }
    clampT(o);

    const x0 = 10, x1 = w - 50, y0 = 10, y1 = h - 20;
    const i0 = Math.max(0, lower(L, o.t0) - 1), i1 = Math.min(L.length - 1, lower(L, o.t1));
    let lo = Infinity, hi = -Infinity;
    const val = (smp) => smp[F.id] * F.k;
    for (let i = i0; i <= i1; i++) { const v = val(L[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi > lo)) { hi = lo + 1e-3; }
    const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;
    const PX = (t) => x0 + (t - o.t0) / span(o) * (x1 - x0);
    const PY = (v) => y1 - (v - lo) / (hi - lo) * (y1 - y0);

    // gridlines + value labels
    c.font = "10px ui-monospace, monospace";
    c.strokeStyle = "rgba(255,255,255,0.07)"; c.lineWidth = 1;
    c.fillStyle = "rgba(223,232,242,0.45)";
    for (let n = 0; n <= 4; n++) {
      const v = lo + (hi - lo) * n / 4, y = PY(v);
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      c.fillText(OVERLAY.fmt(v, 3), x1 + 5, y + 3);
    }
    // time ticks on a 1-2-5 rounding of a quarter of the window
    const tgt = span(o) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(tgt, 1e-4))));
    const stp = [1, 2, 5, 10].map((m) => m * mag)
      .reduce((a, b) => Math.abs(b - tgt) < Math.abs(a - tgt) ? b : a);
    for (let t = Math.ceil(o.t0 / stp) * stp; t <= o.t1; t += stp) {
      const x = PX(t);
      c.strokeStyle = "rgba(255,255,255,0.07)";
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
      c.fillText(stp < 1 ? t.toFixed(1) : t.toFixed(0), x - 8, h - 7);
    }
    c.fillText("s", x1 + 5, h - 7);

    // the trace — one segment per sample, sub-pixel runs collapsed to a span
    c.beginPath();
    let px = -1e9, mn = 0, mx = 0, started = false;
    for (let i = i0; i <= i1; i++) {
      const X = Math.round(PX(L[i].t)), v = val(L[i]);
      if (X !== px) {
        if (started) { c.lineTo(px, PY(mn)); c.lineTo(px, PY(mx)); }
        else { c.moveTo(X, PY(v)); started = true; }
        px = X; mn = v; mx = v;
      } else { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (started) { c.lineTo(px, PY(mn)); c.lineTo(px, PY(mx)); }
    c.strokeStyle = g.colour; c.lineWidth = 1.4; c.stroke();

    // crosshair
    if (o.hover && o.hover[0] > x0 - 6 && o.hover[0] < x1 + 6) {
      const th = o.t0 + (o.hover[0] - x0) / (x1 - x0) * span(o);
      let i = lower(L, th);
      if (i > 0 && (i >= L.length || Math.abs(L[i - 1].t - th) < Math.abs(L[i].t - th))) i--;
      i = Math.max(0, Math.min(L.length - 1, i));
      const X = PX(L[i].t), Y = PY(val(L[i]));
      c.strokeStyle = "rgba(255,255,255,0.35)"; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(X, y0); c.lineTo(X, y1); c.stroke();
      c.beginPath(); c.moveTo(x0, Y); c.lineTo(x1, Y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = g.colour;
      c.beginPath(); c.arc(X, Y, 2.5, 0, 6.2832); c.fill();
      const v = val(L[i]);
      const txt = "t " + L[i].t.toFixed(3) + " s   " + F.sym + " " +
                  (Number.isFinite(v) ? v.toFixed(4) : "—") + " " + F.unit;
      c.font = "700 10.5px ui-monospace, monospace";
      const tw = c.measureText(txt).width;
      const bx = Math.min(Math.max(X + 7, x0), x1 - tw - 10);
      c.fillStyle = "rgba(6,10,16,0.88)";
      c.beginPath(); c.roundRect(bx - 4, y0 + 1, tw + 8, 15, 4); c.fill();
      c.fillStyle = "#e8f0f8";
      c.fillText(txt, bx, y0 + 12);
      o.read = { t: L[i].t, v, field: o.field };
    } else o.read = null;
  }

  /** Per-frame: drop windows whose gauge is gone, keep the numbers live, and
   *  park a small ⤢ affordance on each corner card. */
  let lastN = -1;
  function tick(rects) {
    for (let i = open.length - 1; i >= 0; i--) {
      if (state.gauges.indexOf(open[i].g) < 0) hide(open[i]); else draw(open[i]);
    }
    // The panel's inspector row lists the live gauges, so it has to follow them
    // however they arrived — a click with the Gauge tool syncs the panel, but a
    // rig script pushing onto `state.gauges` does not.
    if (state.gauges.length !== lastN) { lastN = state.gauges.length; syncPanel(); }
    if (!btnHost) { if (!rects || !rects.length) return; hosts(); }
    const n = rects ? rects.length : 0;
    while (btns.length < n) {
      const b = document.createElement("button");
      b.className = "gcardBtn"; b.textContent = "⤢";
      b.title = "Open the gauge inspector";
      b.onclick = () => { b.blur(); show(+b.dataset.k); };
      btnHost.appendChild(b); btns.push(b);
      // …and under it, what THIS gauge plots. A <select> rather than more
      // canvas for the same reason the inspector is DOM; its options are the
      // exercise's offered quantities, rebuilt when that set changes.
      const s = document.createElement("select");
      s.className = "gcardSel";
      s.title = "What this gauge plots — every quantity is recorded either way";
      s.onchange = () => {
        const g = state.gauges[+s.dataset.k];
        if (g) g.field = s.value;
        s.blur();
      };
      btnHost.appendChild(s); sels.push(s);
      // …and a × in the card's top-right corner that removes the gauge.
      const x = document.createElement("button");
      x.className = "gcardX"; x.textContent = "×";
      x.title = "Remove this gauge (its history goes; the others keep theirs)";
      x.onclick = () => { x.blur(); const g = state.gauges[+x.dataset.k]; if (g) removeGauge(g); };
      btnHost.appendChild(x); xbtns.push(x);
    }
    const Q = offered(), qkey = Q.map((q) => q.id).join(",");
    btns.forEach((b, i) => {
      const s = sels[i], x = xbtns[i];
      if (i >= n) { b.style.display = "none"; s.style.display = "none"; x.style.display = "none"; return; }
      const r = rects[i];
      b.dataset.k = String(r.k);
      x.dataset.k = String(r.k);
      x.style.display = "block";
      x.style.left = (r.x + r.w - 21) + "px";
      x.style.top = (r.y + 4) + "px";
      b.style.display = "block";
      // Just OUTSIDE the card's top-left corner: every worksheet screenshot in
      // the pack has one of these cards in it, so the card itself is left
      // pixel-for-pixel alone.
      b.style.left = Math.max(2, r.x - 23) + "px";
      b.style.top = (r.y + 5) + "px";
      if (s.dataset.q !== qkey) {
        s.dataset.q = qkey; s.textContent = "";
        Q.forEach((q) => {
          const o = document.createElement("option");
          o.value = q.id; o.textContent = q.sym; o.title = q.name;
          s.appendChild(o);
        });
      }
      s.dataset.k = String(r.k);
      // One quantity on offer is no choice at all.
      s.style.display = Q.length > 1 ? "block" : "none";
      s.style.left = Math.max(2, r.x - 4 - (s.offsetWidth || 48)) + "px";
      s.style.top = (r.y + 28) + "px";
      const want = gaugeFieldOf(state.gauges[r.k]);
      if (document.activeElement !== s && s.value !== want) s.value = want;
    });
  }

  // ---------------------------------------------------------------- export
  /** Wide CSV: one row per sample time, one column per gauge per GAUGE_QTY
   *  entry — ALL of them, whatever the exercise offers or the gauge plots, in
   *  stored units (pressure in Pa). Gauges are sampled in the same call, so their sample times are
   *  bit-identical and the rows line up; a gauge dropped later simply has
   *  empty cells before its first sample. Values are printed at full
   *  precision. */
  function csv(list) {
    const gs = (list && list.length ? list : state.gauges).filter((g) => g);
    const hdr = ["t_sim_s"];
    gs.forEach((g) => {
      const tag = "g" + (state.gauges.indexOf(g) + 1) +
                  "_x" + g.x.toFixed(2) + "_z" + g.z.toFixed(2);
      GAUGE_QTY.forEach((q) => hdr.push(tag + "_" + q.id + "_" + q.csv));
    });
    const NQ = GAUGE_QTY.length, cols = gs.length * NQ, rows = new Map();
    gs.forEach((g, gi) => (g.log || []).forEach((s) => {
      let r = rows.get(s.t);
      if (!r) { r = new Array(cols).fill(""); rows.set(s.t, r); }
      GAUGE_QTY.forEach((q, fi) => { if (s[q.id] !== undefined) r[gi * NQ + fi] = String(s[q.id]); });
    }));
    const ts = [...rows.keys()].sort((a, b) => a - b);
    const out = [hdr.join(",")];
    ts.forEach((t) => out.push(String(t) + "," + rows.get(t).join(",")));
    return out.join("\n") + "\n";
  }

  function download(list, tag) {
    const text = csv(list);
    const name = "hydraulician-" + (state.scene ? state.scene.id : "scene") +
                 "-" + (tag || "gauges") + ".csv";
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      // file:// with a paranoid policy, or a blocked download — never lose the
      // data over it; the text is still returned for the console.
      showToast("Could not save the CSV", String(err && err.message || err));
    }
    return { name, text };
  }

  return { show, hide, closeAll, closeFor, tick, csv, download, open, draw };
})();

