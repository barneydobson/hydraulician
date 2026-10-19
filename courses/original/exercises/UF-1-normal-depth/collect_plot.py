#!/usr/bin/env python3
"""
UF-1 "Normal depth scales as q^3/5" — pooled class plot.

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, or data/simulated-class.csv):
    student,digit,scene,q,dn[,n_back,S0,source]

Only `q` and `dn` (the cursor-read, measured normal depth in m) are needed
for the payoff plot. If `n_back` is missing it is computed here from
n = dn^(5/3) * sqrt(S0) / q (S0 defaults to 0.25, the scene's 1-in-4 slope,
per js/scenes.js — override with --s0 if a future cohort uses a different
scene).

The plot: log(dn) vs log(q), least-squares slope compared against the
Manning-theory reference of 3/5 = 0.6 (#115-118, N2). A second panel
histograms each student's back-calculated Manning n (#117) — the "channel
whose n nobody typed in".
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def fnum(row, key):
    v = (row.get(key) or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_rows(path, s0_default):
    rows = []
    with open(path, newline="") as fh:
        lines = [ln for ln in fh if not ln.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        row = {(k or "").strip(): (v if v is not None else "") for k, v in row.items()}
        q = fnum(row, "q")
        dn = fnum(row, "dn") if fnum(row, "dn") is not None else fnum(row, "d_n")
        if q is None or dn is None or q <= 0 or dn <= 0:
            continue
        s0 = fnum(row, "S0") or s0_default
        nback = fnum(row, "n_back")
        if nback is None:
            nback = (dn ** (5.0 / 3.0)) * math.sqrt(s0) / q
        row["_q"], row["_yn"], row["_S0"], row["_n"] = q, dn, s0, nback
        rows.append(row)
    return rows


def loglog_fit(xs, ys):
    """Least-squares slope/intercept of ln(y) on ln(x), plus R^2."""
    lx = [math.log(x) for x in xs]
    ly = [math.log(y) for y in ys]
    n = len(lx)
    mx, my = sum(lx) / n, sum(ly) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(lx, ly))
    sxx = sum((x - mx) ** 2 for x in lx)
    slope = sxy / sxx
    intercept = my - slope * mx
    yhat = [intercept + slope * x for x in lx]
    ss_res = sum((y - h) ** 2 for y, h in zip(ly, yhat))
    ss_tot = sum((y - my) ** 2 for y in ly)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return slope, intercept, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvfile")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--s0", type=float, default=0.25, help="scene bed slope (default 0.25, s2's 1-in-4)")
    ap.add_argument("--title", default="UF-1 · the class measures Manning's exponent")
    args = ap.parse_args()

    rows = read_rows(args.csvfile, args.s0)
    if not rows:
        sys.exit("no usable rows (need q and dn)")

    qs = [r["_q"] for r in rows]
    yns = [r["_yn"] for r in rows]
    ns = [r["_n"] for r in rows]

    slope, intercept, r2 = loglog_fit(qs, yns)
    coef = math.exp(intercept)

    fig, (axl, axn) = plt.subplots(1, 2, figsize=(11.5, 5.0),
                                    gridspec_kw={"width_ratios": [2.1, 1]})

    # -------------------------------------------------- left: log-log payoff
    lo, hi = min(qs) * 0.9, max(qs) * 1.1
    xs_line = [lo + (hi - lo) * k / 200.0 for k in range(201)]

    axl.plot(xs_line, [coef * x ** slope for x in xs_line], "-", color="#3b6ea5", lw=2,
              label=r"fitted  $d_n = %.3f\, q^{%.3f}$  ($R^2$=%.3f)" % (coef, slope, r2))
    # 0.6-slope Manning reference, anchored through the data centroid so the
    # two lines are visually comparable rather than arbitrarily offset.
    gx = math.exp(sum(math.log(x) for x in qs) / len(qs))
    gy = math.exp(sum(math.log(y) for y in yns) / len(yns))
    cref = gy / gx ** 0.6
    axl.plot(xs_line, [cref * x ** 0.6 for x in xs_line], "--", color="#e07a1f", lw=1.6,
              label=r"Manning reference, slope $3/5$ (#115-118, N2)")

    have_digit = all(fnum(r, "digit") is not None for r in rows)
    sc = axl.scatter(qs, yns, c=[fnum(r, "digit") for r in rows] if have_digit else "#d1495b",
                      cmap="viridis" if have_digit else None, s=90, zorder=5,
                      edgecolor="white", linewidth=0.8, label="class (scene s2)")
    if have_digit:
        cb = fig.colorbar(sc, ax=axl, pad=0.02, fraction=0.045)
        cb.set_label("digit d")

    for r in rows:
        name = (r.get("student") or "").strip()
        if name:
            axl.annotate(name, (r["_q"], r["_yn"]), textcoords="offset points",
                         xytext=(6, -3), fontsize=7, color="#44546a")

    axl.set_xscale("log")
    axl.set_yscale("log")
    axl.set_xlabel(r"inflow  $q$  (m$^2$/s)")
    axl.set_ylabel(r"measured normal depth  $d_n$  (m)  — overlay cursor read")
    axl.set_title(args.title)
    axl.grid(alpha=0.25, which="both")
    axl.legend(loc="upper left", fontsize=8, framealpha=0.95)

    # -------------------------------------------------------- right: n histogram
    axn.hist(ns, bins=max(5, len(ns) // 2), color="#5fa8d3", edgecolor="white")
    axn.axvspan(0.02, 0.07, color="#999", alpha=0.12, label="CLAUDE.md's general 0.02–0.07 envelope")
    axn.axvline(sum(ns) / len(ns), color="#d1495b", lw=1.6, label="class mean n = %.4f" % (sum(ns) / len(ns)))
    axn.set_xlabel(r"back-calculated Manning $n$  (#117)")
    axn.set_ylabel("students")
    axn.set_title("the channel's own n,\nread off nobody's input")
    axn.legend(loc="upper right", fontsize=7, framealpha=0.95)
    axn.grid(alpha=0.2)

    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    fig.savefig(args.out, dpi=150, bbox_inches="tight")

    print("wrote %s" % args.out)
    print("UF-1 points: %d   q %.2f-%.2f   dn %.3f-%.3f m"
          % (len(rows), min(qs), max(qs), min(yns), max(yns)))
    print("fitted slope %.3f vs Manning 3/5 = 0.600   (R^2 = %.4f)" % (slope, r2))
    print("back-calculated n: %.4f - %.4f   mean %.4f   stdev %.4f"
          % (min(ns), max(ns), sum(ns) / len(ns),
             (sum((x - sum(ns) / len(ns)) ** 2 for x in ns) / len(ns)) ** 0.5))


if __name__ == "__main__":
    main()
