"use strict";
/**
 * format.js — FMT: every number-to-text rule the interface shares, with no DOM
 *   and no canvas in it (FMT.put is the one DOM write, and only on change).
 *
 * Classic script: its top-level names are globals shared with every other file,
 * so the lists below (checked by exercises/_runner/check_headers.py) are the
 * dependency record. Load order is index.html's.
 *
 * Defines: FMT
 *
 * Reads:   none
 */
/** Each formatter here replaced a private copy and prints exactly what that
 *  copy printed for the values its call sites pass. Where two copies differed
 *  they stayed two functions (num vs fix, big vs kN vs N) rather than one with
 *  a changed output. */
const FMT = (() => {
  /** Three figures that read, without exponent soup on a 0.0004 range (the
   *  legend's range ends). */
  function num(v) {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(0)
         : a >= 1 ? v.toFixed(2)
         : a >= 0.01 ? v.toFixed(3)
         : v === 0 ? "0" : v.toExponential(1);
  }

  /** `d` decimals (default 2); exponent form for |v| >= 1000 and for a
   *  non-zero |v| < 0.01 — the overlay's readouts and chart ticks. */
  function fix(v, d) {
    return Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)
      ? v.toExponential(1) : v.toFixed(d === undefined ? 2 : d);
  }

  /** Watts (or newtons) per metre run, in thousands once the reach does any
   *  work at all. */
  function big(v, unit) {
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 2) + " k" + unit;
    return (a >= 100 ? v.toFixed(0) : v.toFixed(1)) + " " + unit;
  }

  /** A force per metre width: whole N/m, or kN/m with one decimal. */
  function kN(v) {
    return Math.abs(v) >= 1000
      ? (v / 1000).toFixed(1) + " kN/m" : v.toFixed(0) + " N/m";
  }

  /** The control-volume budget's bare force number (no unit): whole above 100. */
  function N(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1); }

  /** One component of a vector pair whose scale is shared (`big` = kilo). */
  function vecPart(v, big) {
    const a = Math.abs(v) / (big ? 1000 : 1);
    return big || a < 100 ? a.toFixed(a >= 10 ? 1 : 2) : a.toFixed(0);
  }

  /** A time in seconds: two decimals under 10 s, one above. */
  function t(s) { return (s < 10 ? s.toFixed(2) : s.toFixed(1)) + " s"; }

  /** Two decimals at least, so a rule that lands on 1.00 does not print "1"
   *  next to a slider reading 1.000; more where the value itself is finer. */
  function val(v) {
    if (typeof v !== "number") return String(v);
    const s = String(+v.toFixed(4));
    const dp = (s.split(".")[1] || "").length;
    return v.toFixed(Math.max(2, Math.min(4, dp)));
  }

  /** A number rounded to 4 decimals and printed without trailing zeros: the
   *  panel prints 3 decimals, and 0.4500000000000001 is a bug in a field. */
  function round4(v) {
    return typeof v === "number" ? String(Math.round(v * 1e4) / 1e4) : String(v);
  }

  /** The step in `steps` × 10^k (and 10 × 10^k) nearest `x` on a linear scale;
   *  `floor` keeps log10 off zero (the callers' own clamps differ, so it is a
   *  parameter, not a constant). 1-2-5 by default. */
  function nice(x, steps, floor) {
    const s = steps || [1, 2, 5];
    const mag = Math.pow(10, Math.floor(Math.log10(floor === undefined ? x : Math.max(x, floor))));
    return s.concat(10).map((m) => m * mag)
      .reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);
  }

  /** The smallest step in `steps` × 10^k (or 10 × 10^k) not below `x`. */
  function niceUp(x, steps) {
    const s = steps || [1, 2, 5];
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    return s.concat(10).map((m) => m * mag).find((v) => v >= x) || 10 * mag;
  }

  /** `raw`'s mantissa binned by explicit cut points: m < cuts[i] gives
   *  steps[i], else 10. STREAM's Δψ: 1, 2, 2.5 or 5 within a factor 0.7–1.43. */
  function niceBand(raw, steps, cuts) {
    const e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
    for (let i = 0; i < cuts.length; i++) if (m < cuts[i]) return steps[i] * e;
    return 10 * e;
  }

  /** Write text only when it differs from what the element holds: a
   *  per-frame write of the same string still invalidates layout. Compares
   *  against the DOM, not a cache, so another writer cannot leave it stale. */
  function put(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  /** As put, for markup (trusted strings only). When the browser serialises
   *  the markup differently the write simply happens, as it did before. */
  function putHTML(el, html) {
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  return { num, fix, big, kN, N, vecPart, t, val, round4, nice, niceUp, niceBand, put, putHTML };
})();
