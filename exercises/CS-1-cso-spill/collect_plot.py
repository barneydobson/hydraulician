#!/usr/bin/env python3
"""CS-1 · pool a class CSV into the CSO design chart.

    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Required CSV columns (extra columns ignored, header row required):
    gap_cells    throttle width, in grid cells (2 / 4 / 6 / 8)
    q_spill      the sewer discharge, m2/s, at first sustained spill
Optional:
    gap_m        delivered width in metres (derived from gap_cells if absent)
    digit, student, source   ('lecturer' rows are drawn differently)

The chart is q_spill against the throttle gap, with the orifice law
    q = C_d * a * sqrt(2 g H),   H = 1.00 m (crest above the chamber floor)
fitted through the origin, and each rung's own C_d annotated.
"""
import argparse, csv, math, sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DX = 0.0217391          # Medium resolution cell, m
H_CREST = 1.00          # crest above the chamber floor, m -- the fixed head
G = 9.81
DWF = 0.070             # 1 x dry-weather flow in this rig, m2/s


def load(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                cells = float(r.get("gap_cells") or 0)
                q = float(r["q_spill"])
            except (TypeError, ValueError, KeyError):
                continue
            if not (cells > 0 and q > 0):
                continue
            a = float(r["gap_m"]) if r.get("gap_m") else cells * DX
            rows.append({"cells": cells, "a": a, "q": q,
                         "src": (r.get("source") or "student").strip(),
                         "who": (r.get("student") or "").strip()})
    if not rows:
        sys.exit("no usable rows: need gap_cells and q_spill")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load(args.csv)
    root2gh = math.sqrt(2 * G * H_CREST)
    for r in rows:
        r["cd"] = r["q"] / (r["a"] * root2gh)
        r["n"] = r["q"] / DWF

    # slope through the origin:  q = m a   ->  m = sum(aq)/sum(aa)
    saq = sum(r["a"] * r["q"] for r in rows)
    saa = sum(r["a"] * r["a"] for r in rows)
    m = saq / saa
    cd_pool = m / root2gh
    ss_res = sum((r["q"] - m * r["a"]) ** 2 for r in rows)
    qbar = sum(r["q"] for r in rows) / len(rows)
    ss_tot = sum((r["q"] - qbar) ** 2 for r in rows)
    r2 = 1 - ss_res / ss_tot

    # free straight line, for the "does it go through the origin?" argument
    n = len(rows)
    sa = sum(r["a"] for r in rows); sq = sum(r["q"] for r in rows)
    den = n * saa - sa * sa
    m_free = (n * saq - sa * sq) / den
    c_free = (sq - m_free * sa) / n

    cds = sorted(r["cd"] for r in rows)
    print("CS-1 pooled CSO design chart -- %d points, gap %.1f-%.1f cells" %
          (n, min(r["cells"] for r in rows), max(r["cells"] for r in rows)))
    print("  slope through origin   %.3f  m2/s per m of gap" % m)
    print("  -> C_d (H = %.2f m)    %.4f" % (H_CREST, cd_pool))
    print("  R^2 (origin fit)       %.5f" % r2)
    print("  free fit               q = %.3f a %+.4f   (intercept %.1f %% of range)"
          % (m_free, c_free, 100 * abs(c_free) / max(r["q"] for r in rows)))
    print("  C_d per rung           %.3f - %.3f, mean %.4f"
          % (cds[0], cds[-1], sum(cds) / n))
    print("  setting delivered      %.1f - %.1f x DWF (DWF = %.3f m2/s)"
          % (min(r["n"] for r in rows), max(r["n"] for r in rows), DWF))

    fig, (ax, bx) = plt.subplots(2, 1, figsize=(7.6, 8.4),
                                 gridspec_kw={"height_ratios": [2.05, 1]})

    xs = [0, max(r["a"] for r in rows) * 1.12]
    ax.plot(xs, [m * x for x in xs], "-", color="#c8553d", lw=1.6, zorder=1,
            label="orifice law  q = $C_d\\,a\\,\\sqrt{2gH}$   with  $C_d$ = %.3f" % cd_pool)
    for src, mk, col, lab in (("student", "o", "#2b6cb0", "class submissions"),
                              ("lecturer", "s", "#7a8b99", "lecturer sweep (odd cells)")):
        sel = [r for r in rows if r["src"] == src]
        if sel:
            ax.plot([r["a"] for r in sel], [r["q"] for r in sel], mk, ms=7,
                    color=col, mec="white", mew=0.8, zorder=3, label=lab)
    for r in rows:
        ax.annotate("%.3f" % r["cd"], (r["a"], r["q"]), textcoords="offset points",
                    xytext=(7, -11), fontsize=7.5, color="#444")
    ax.set_xlim(0, xs[1]); ax.set_ylim(0, max(r["q"] for r in rows) * 1.15)
    ax.set_xlabel("throttle gap  a  (m)")
    ax.set_ylabel("$q_{spill}$  —  sewer discharge at first spill  (m²/s)")
    ax.set_title("CS-1 · the class design chart: when does the chamber spill?\n"
                 "crest 1.00 m above the chamber floor, so the head at spill is fixed",
                 fontsize=11)
    ax.grid(alpha=0.25); ax.legend(loc="upper left", fontsize=8.5)

    sec = ax.secondary_yaxis("right", functions=(lambda q: q / DWF, lambda k: k * DWF))
    sec.set_ylabel("setting, in multiples of DWF (1 × DWF = %.3f m²/s)" % DWF, fontsize=9)
    secx = ax.secondary_xaxis("top", functions=(lambda a: a / DX, lambda c: c * DX))
    secx.set_xlabel("throttle gap (grid cells at Medium)", fontsize=9)

    bx.axhline(cd_pool, color="#c8553d", lw=1.4,
               label="pooled $C_d$ = %.3f" % cd_pool)
    bx.axhspan(cd_pool * 0.97, cd_pool * 1.03, color="#c8553d", alpha=0.10)
    for src, mk, col in (("student", "o", "#2b6cb0"), ("lecturer", "s", "#7a8b99")):
        sel = [r for r in rows if r["src"] == src]
        if sel:
            bx.plot([r["cells"] for r in sel], [r["cd"] for r in sel], mk, ms=7,
                    color=col, mec="white", mew=0.8)
    bx.set_xlabel("throttle gap (grid cells)")
    bx.set_ylabel("$C_d$ delivered by that rung")
    bx.set_title("the deviation: the narrowest throttle is NOT the same orifice",
                 fontsize=10)
    bx.grid(alpha=0.25); bx.legend(fontsize=8.5, loc="lower left")

    fig.tight_layout()
    fig.savefig(args.out, dpi=132)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
