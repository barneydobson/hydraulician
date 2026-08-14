#!/usr/bin/env python3
"""UN-3 · Surge tank — pool a class CSV into the two-panel demo plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]
    python3 collect_plot.py data/simulated-class.csv

Required CSV columns (header row; extra columns ignored):

    student_id,digit,bs_m,v0_ms,ymax_m,T_s

Optional, and used if present:

    rest_level_m   standpipe rest level, m above the domain floor.  Enables the
                   shaft-inertia correction (the open markers) — see README §4.
    l_m,bp_m       penstock length and bore.  Default to the class constants
                   L = 47.0 m and b_p = 2.890 m.

Left panel  — measured period against 2*pi*sqrt(l*b_s/(g*b_p)).
Right panel — measured y_max against the frictionless bound
              v0*sqrt(l*b_p/(g*b_s)); points must sit BELOW the 1:1 line, and
              the shortfall is the ku^2 friction term (U28/U29).
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
L_DEFAULT = 47.0     # reservoir face x=6.0 -> standpipe centreline x=53.0
BP_DEFAULT = 2.890   # delivered bore, 21 cells at Medium
Y_SHAFT_BASE = 5.57  # top face of the pipe soffit = foot of the shaft column


def read_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                bs = float(r["bs_m"])
                d = dict(
                    sid=r.get("student_id", ""),
                    digit=r.get("digit", ""),
                    bs=bs,
                    v0=float(r["v0_ms"]),
                    ymax=float(r["ymax_m"]),
                    T=float(r["T_s"]),
                    l=float(r.get("l_m") or L_DEFAULT),
                    bp=float(r.get("bp_m") or BP_DEFAULT),
                )
            except (KeyError, TypeError, ValueError):
                continue
            rest = r.get("rest_level_m")
            d["ls"] = (float(rest) - Y_SHAFT_BASE) if rest not in (None, "") else None
            rows.append(d)
    return rows


def theory(d):
    """Simple (massless-tank) surge-tank period and frictionless upsurge."""
    R = d["bs"] / d["bp"]
    T = 2 * math.pi * math.sqrt(d["l"] * R / G)
    Z = d["v0"] * math.sqrt(d["l"] * d["bp"] / (G * d["bs"]))
    return T, Z


def theory_corrected(d):
    """Same, with the standpipe's own water column added to the inertia.

    Equating kinetic and potential energy for the two-column oscillator gives
    an effective length l*R + l_s, where R = b_s/b_p and l_s is the depth of
    water standing in the shaft above the tee.
    """
    if d["ls"] is None:
        return None, None
    R = d["bs"] / d["bp"]
    le = d["l"] * R + d["ls"]
    return 2 * math.pi * math.sqrt(le / G), (d["v0"] / R) * math.sqrt(le / G)


def pct(a, b):
    return 100.0 * (a - b) / b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read_rows(a.csv)
    if not rows:
        sys.exit("no usable rows in %s" % a.csv)
    rows.sort(key=lambda d: d["bs"])

    print("%d submissions from %s\n" % (len(rows), a.csv))
    hdr = ("  d   b_s      v0     T_meas   T_simple   err     T_shaft   err"
           "     y_max   bound    gap")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    eT, eTc, gap, gapc = [], [], [], []
    for d in rows:
        Ts, Zs = theory(d)
        Tc, Zc = theory_corrected(d)
        eT.append(pct(d["T"], Ts))
        gap.append(100.0 * (1 - d["ymax"] / Zs))
        line = ("  %-3s %5.3f  %6.3f   %6.2f     %6.2f  %+6.1f%%"
                % (d["digit"], d["bs"], d["v0"], d["T"], Ts, eT[-1]))
        if Tc:
            eTc.append(pct(d["T"], Tc))
            gapc.append(100.0 * (1 - d["ymax"] / Zc))
            line += "    %6.2f  %+5.1f%%" % (Tc, eTc[-1])
        else:
            line += "         --      --"
        line += "    %6.3f  %6.3f  %4.0f%%" % (d["ymax"], Zs, gap[-1])
        if gapc:
            line += "  %6.3f %4.0f%%" % (Zc, gapc[-1])
        print(line)

    mean = lambda v: sum(v) / len(v)
    print("\n  period vs 2*pi*sqrt(l*b_s/(g*b_p)) : %+.1f%% mean  (%+.1f%% .. %+.1f%%)"
          % (mean(eT), min(eT), max(eT)))
    if eTc:
        print("  period vs shaft-corrected theory   : %+.1f%% mean  (%+.1f%% .. %+.1f%%)"
              % (mean(eTc), min(eTc), max(eTc)))
    print("  y_max shortfall below the simple bound       : %.0f%% mean  (%.0f%% .. %.0f%%)"
          % (mean(gap), min(gap), max(gap)))
    if gapc:
        print("  y_max shortfall below the corrected bound    : %.0f%% mean  (%.0f%% .. %.0f%%)"
              % (mean(gapc), min(gapc), max(gapc)))

    # ------------------------------------------------------------------ plot
    fig, (axT, axY) = plt.subplots(1, 2, figsize=(12.4, 5.6))
    fig.suptitle("UN-3 · Surge tank: the class measures the mass oscillation",
                 fontsize=13, weight="bold")

    xs = [theory(d)[0] for d in rows]
    ys = [d["T"] for d in rows]
    lim = [0, max(max(xs), max(ys)) * 1.12]
    axT.plot(lim, lim, "k--", lw=1, label="1:1")
    axT.scatter(xs, ys, s=64, c="#1f77b4", zorder=3,
                label=r"measured vs $2\pi\sqrt{l\,b_s/(g\,b_p)}$")
    xc = [theory_corrected(d)[0] for d in rows if theory_corrected(d)[0]]
    if xc:
        axT.scatter(xc, [d["T"] for d in rows if theory_corrected(d)[0]], s=64,
                    facecolors="none", edgecolors="#d62728", zorder=3,
                    label=r"... with the shaft column: $2\pi\sqrt{(l\,b_s/b_p+l_s)/g}$")
    for d, x in zip(rows, xs):
        axT.annotate("%.2f" % d["bs"], (x, d["T"]), fontsize=7,
                     xytext=(4, -9), textcoords="offset points", color="#1f77b4")
    axT.set_xlim(lim); axT.set_ylim(lim)
    axT.set_xlabel("predicted period  T  (s)")
    axT.set_ylabel("measured period  T  (s)")
    axT.set_title("Period — labels are $b_s$ in metres", fontsize=10)
    axT.grid(alpha=0.3); axT.legend(fontsize=8, loc="upper left")

    xb = [theory(d)[1] for d in rows]
    yb = [d["ymax"] for d in rows]
    xbc = [theory_corrected(d)[1] for d in rows if theory_corrected(d)[1]]
    lim2 = [0, max(xb + xbc) * 1.12]
    axY.plot(lim2, lim2, "k--", lw=1, label="frictionless bound (1:1)")
    if xbc:
        axY.scatter(xbc, [d["ymax"] for d in rows if theory_corrected(d)[1]], s=64,
                    facecolors="none", edgecolors="#d62728", zorder=3,
                    label="... against the shaft-corrected bound")
    axY.scatter(xb, yb, s=64, c="#2ca02c", zorder=3, label=r"measured $y_{max}$")
    for x, y, d in zip(xb, yb, rows):
        axY.plot([x, x], [y, x], color="#999", lw=0.8, zorder=2)
        axY.annotate("%.0f%%" % (100 * (1 - y / x)), (x, (y + x) / 2), fontsize=7,
                     xytext=(5, -3), textcoords="offset points", color="#777")
    axY.set_xlim(lim2); axY.set_ylim(lim2)
    axY.set_xlabel(r"frictionless bound  $v_0\sqrt{l\,b_p/(g\,b_s)}$  (m)")
    axY.set_ylabel(r"measured first upsurge  $y_{max}$  (m)")
    axY.set_title(r"Upsurge — the grey gap is the $ku^2$ term (U28/U29)", fontsize=10)
    axY.grid(alpha=0.3); axY.legend(fontsize=8, loc="upper left")

    fig.tight_layout(rect=(0, 0, 1, 0.95))
    out = a.out
    if os.path.dirname(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=130)
    print("\nwrote %s" % out)


if __name__ == "__main__":
    main()
