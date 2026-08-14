#!/usr/bin/env python3
"""B10 · Lift the crest until the pipe gives up — pool a class CSV into one plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Expected CSV columns (Blackboard download; header names are matched
case-insensitively, extra columns ignored):

    student , digit , level , z_sep , hgl_crest

  digit      last digit of the student number, 0-9
  level      reservoir level they were told to set,
             3.30 + 0.13*(digit mod 6)  (m)   -- see README 6.6 for the mod 6
  z_sep      the crest SOFFIT elevation at which the pipe gave up      (m)
  hgl_crest  their HGL interpolated to the crest x from the two axis
             gauges at the LAST INTACT step                            (m)

The payoff: #42's criterion says the pipe separates when the crest soffit
reaches the hydraulic grade line, i.e. z_sep = hgl_crest — a 1:1 line the
class draws through its own points. The plot reports the fitted slope, the
mean offset (bias) and the scatter about 1:1, and marks the +-1 cell
quantisation the drawn crest can never beat.
"""
import argparse
import csv
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CELL = 0.021739          # Medium resolution, sandbox W = 9 m -> 414 columns
TAILWATER = 2.50         # RIG-A's receiving-tank level (flat soffit is 2.3913)


def read(path):
    rows = []
    with open(path, newline="") as fh:
        for raw in csv.DictReader(fh):
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            try:
                rows.append(dict(
                    student=r.get("student", "?"),
                    digit=int(float(r["digit"])),
                    level=float(r["level"]),
                    z_sep=float(r["z_sep"]),
                    hgl=float(r["hgl_crest"]),
                ))
            except (KeyError, ValueError):
                print("skipping unreadable row: %r" % raw, file=sys.stderr)
    if not rows:
        sys.exit("no usable rows in %s" % path)
    return sorted(rows, key=lambda r: r["digit"])


def fit(xs, ys):
    """Least squares y = a*x + b, no numpy."""
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    a = sxy / sxx if sxx else float("nan")
    b = my - a * mx
    ss_res = sum((y - (a * x + b)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
    return a, b, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = read(args.csv)
    x = [r["hgl"] for r in rows]           # prediction: HGL at the crest
    y = [r["z_sep"] for r in rows]         # measurement: separating crest soffit
    res = [yi - xi for xi, yi in zip(x, y)]
    n = len(rows)
    bias = sum(res) / n
    spread = (sum((d - bias) ** 2 for d in res) / (n - 1)) ** 0.5 if n > 1 else 0.0
    slope, intercept, r2 = fit(x, y)

    fig, (axL, axR) = plt.subplots(1, 2, figsize=(12.4, 5.4))

    # ---- left: the criterion, as a 1:1 line ------------------------------
    lo = min(min(x), min(y)) - 0.05
    hi = max(max(x), max(y)) + 0.05
    axL.plot([lo, hi], [lo, hi], "k--", lw=1.6, zorder=1,
             label="#42's criterion:  $z_{sep} = HGL$  (1:1)")
    axL.plot([lo, hi], [lo + bias, hi + bias], "-", color="#c0392b", lw=1.2,
             zorder=2, label="1:1 + class bias %+.3f m (%.1f cells)" % (bias, bias / CELL))
    sc = axL.scatter(x, y, c=[r["digit"] for r in rows], cmap="viridis",
                     s=110, zorder=4, edgecolor="k", linewidth=0.6)
    axL.errorbar(x, y, yerr=CELL, xerr=CELL, fmt="none", ecolor="#555",
                 elinewidth=0.9, capsize=3, zorder=3)
    for r in rows:
        axL.annotate(str(r["digit"]), (r["hgl"], r["z_sep"]),
                     textcoords="offset points", xytext=(9, -3), fontsize=8.5)
    axL.axhline(TAILWATER, color="#2980b9", lw=0.9, ls=":")
    axL.annotate("tailwater 2.50 m  (flat soffit 2.391)",
                 (hi - 0.01, TAILWATER + 0.008), ha="right",
                 fontsize=8, color="#2980b9")
    axL.set_xlabel("HGL interpolated to the crest, last intact step  (m)")
    axL.set_ylabel("$z_{sep}$ — crest soffit at separation  (m)")
    axL.set_title("Separation happens when the crest meets the HGL\n"
                  "slope %.3f, $R^2$ %.3f, bias %+.3f m, scatter %.3f m (n=%d)"
                  % (slope, r2, bias, spread, n), fontsize=10.5)
    axL.set_xlim(lo, hi)
    axL.set_ylim(lo, hi)
    axL.set_aspect("equal")
    axL.grid(alpha=0.25)
    axL.legend(loc="upper left", fontsize=8.5)
    cb = fig.colorbar(sc, ax=axL, fraction=0.045, pad=0.02)
    cb.set_label("student-number last digit", fontsize=8.5)

    # ---- right: residual vs driving head — is the bias a trend? ----------
    axR.axhline(0, color="k", ls="--", lw=1.4, label="exact criterion")
    axR.axhline(bias, color="#c0392b", lw=1.2,
                label="mean bias %+.3f m" % bias)
    axR.axhspan(bias - spread, bias + spread, color="#c0392b", alpha=0.12,
                label="$\\pm$1 s.d. %.3f m" % spread)
    axR.axhspan(-CELL, CELL, color="#7f8c8d", alpha=0.14,
                label="$\\pm$1 cell (%.1f mm), unbeatable" % (1000 * CELL))
    axR.scatter([r["level"] for r in rows], res, c=[r["digit"] for r in rows],
                cmap="viridis", s=110, edgecolor="k", linewidth=0.6, zorder=4)
    for r, d in zip(rows, res):
        axR.annotate(str(r["digit"]), (r["level"], d), textcoords="offset points",
                     xytext=(9, -3), fontsize=8.5)
    axR.set_xlabel("reservoir level (m)   —   level = 3.30 + 0.13$\\cdot$(digit mod 6)")
    axR.set_ylabel("$z_{sep}$ − HGL at crest  (m)")
    axR.set_title("Residual against driving head\n"
                  "flat = a constant offset, sloping = a head-dependent one",
                  fontsize=10.5)
    axR.grid(alpha=0.25)
    axR.legend(loc="best", fontsize=8)

    fig.suptitle("B10 · Lift the crest until the pipe gives up  —  "
                 "%d students, pooled" % n, fontsize=13, y=0.99)
    fig.tight_layout(rect=(0, 0, 1, 0.955))
    fig.savefig(args.out, dpi=135)
    print("wrote %s" % args.out)

    w = csv.writer(sys.stdout)
    w.writerow(["digit", "level", "hgl_crest", "z_sep", "residual_m", "residual_cells"])
    for r, d in zip(rows, res):
        w.writerow([r["digit"], "%.3f" % r["level"], "%.4f" % r["hgl"],
                    "%.4f" % r["z_sep"], "%+.4f" % d, "%+.1f" % (d / CELL)])
    print("n=%d  slope=%.3f  R2=%.3f  bias=%+.4f m (%+.1f cells)  sd=%.4f m"
          % (n, slope, r2, bias, bias / CELL, spread))


if __name__ == "__main__":
    main()
