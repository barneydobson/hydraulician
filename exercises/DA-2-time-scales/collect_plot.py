#!/usr/bin/env python3
"""DA-2 · Time scales as √L_r — pool the class CSV.

    python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Input CSV (Blackboard export, header row required, extra columns ignored):

    student_id,digit,L_r,T_p_s,T_m_s,error_pct
    23140870,0,0.25,4.056,1.840,-9.3

`L_r`, `T_p_s` and `T_m_s` are required; `error_pct` is recomputed from them
(and a student's own value is printed beside it when the two disagree by more
than half a percent, which is a slip worth a word, not a reason to drop the row).

Two panels:

  left   T_m/T_p against L_r on log-log axes, with Froude's √L_r (slope ½) and the
         naive L_r (slope 1) drawn through (1, 1). The fitted slope is printed.
  right  the error against L_r: 100·(T_m − √L_r·T_p)/(√L_r·T_p). A straight-line fit
         is extrapolated to L_r = 1, where model and prototype are the same tank
         and the error has to vanish. The trend towards zero IS the scale effect.
"""
import argparse
import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter


def ols(x, y):
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    b = sxy / sxx
    return my - b * mx, b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                        "plots", "pooled-demo.png"))
    args = ap.parse_args()

    rows = []
    with open(args.csv, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            try:
                lam, tp, tm = float(r["L_r"]), float(r["T_p_s"]), float(r["T_m_s"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (0.2 <= lam <= 0.75 and 1.0 <= tp <= 10.0 and 0.3 <= tm <= 10.0):
                print("  dropped (out of range): %s" % dict(r))
                continue
            err = 100.0 * (tm - math.sqrt(lam) * tp) / (math.sqrt(lam) * tp)
            try:
                own = float(r.get("error_pct"))
                if abs(own - err) > 0.5:
                    print("  %s: submitted %.1f%%, recomputed %.1f%%" % (r.get("student_id", "?"), own, err))
            except (TypeError, ValueError):
                pass
            rows.append((lam, tp, tm, err))
    if len(rows) < 3:
        raise SystemExit("need at least 3 usable rows, got %d" % len(rows))

    lam = [r[0] for r in rows]
    ratio = [r[2] / r[1] for r in rows]
    err = [r[3] for r in rows]
    a, slope = ols([math.log(v) for v in lam], [math.log(v) for v in ratio])
    e0, e1 = ols(lam, err)
    print("%d rows; fitted T_m/T_p ∝ L_r^%.3f (Froude: 0.5); error at L_r = 1 by extrapolation %.1f%%"
          % (len(rows), slope, e0 + e1))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2), dpi=150)
    xs = [0.2 + 0.01 * k for k in range(81)]
    ax1.loglog(xs, [math.sqrt(v) for v in xs], "-", color="#17365D", lw=1.8, label=r"Froude: $\sqrt{L_r}$ (slope ½)")
    ax1.loglog(xs, xs, "--", color="#999999", lw=1.2, label=r"naive: $L_r$ (slope 1)")
    ax1.loglog(lam, ratio, "o", color="#B03A2E", ms=5, label=r"class: $T_m/T_p$")
    ax1.set_xlabel(r"length ratio $L_r$"); ax1.set_ylabel(r"$T_m/T_p$")
    ax1.set_title("fitted slope %.3f" % slope, fontsize=10)
    ax1.set_xticks([0.25, 0.35, 0.5, 0.7, 1.0]); ax1.set_xticklabels(["0.25", "0.35", "0.5", "0.7", "1"])
    ax1.set_yticks([0.25, 0.35, 0.5, 0.7, 1.0]); ax1.set_yticklabels(["0.25", "0.35", "0.5", "0.7", "1"])
    ax1.xaxis.set_minor_formatter(NullFormatter()); ax1.yaxis.set_minor_formatter(NullFormatter())
    ax1.legend(fontsize=8, frameon=False, loc="lower right")

    ax2.axhline(0, color="#999999", lw=1)
    ax2.plot(lam, err, "o", color="#B03A2E", ms=5, label="class")
    ax2.plot([0.2, 1.0], [e0 + e1 * 0.2, e0 + e1], "-", color="#17365D", lw=1.4,
             label="straight-line fit, extrapolated")
    ax2.plot([1.0], [e0 + e1], "s", color="#17365D", ms=5)
    ax2.set_xlim(0.2, 1.02)
    ax2.set_xlabel(r"length ratio $L_r$"); ax2.set_ylabel(r"error against $\sqrt{L_r}\,T_p$ (%)")
    ax2.set_title(r"error at $L_r$ = 1 by extrapolation: %.1f%%" % (e0 + e1), fontsize=10)
    ax2.legend(fontsize=8, frameon=False, loc="lower right")
    for ax in (ax1, ax2):
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    fig.tight_layout()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fig.savefig(args.out)
    print("wrote " + args.out)


if __name__ == "__main__":
    main()
