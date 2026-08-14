#!/usr/bin/env python3
"""
HJ-1 "Belanger from a room full of flumes" — pooled class plot.

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, or data/simulated-class.csv):
    student,digit,q,tail,Fr1,y2_over_y1[,y1,y2,dE,source]

Only `Fr1` and `y2_over_y1` are needed for the payoff plot; every other
column is optional and is used for the side panels / colouring if present.

The plot: each student's single point against the Belanger curve
    y2/y1 = 0.5 * (sqrt(1 + 8*Fr1^2) - 1)
plus, if scene=s1 rows are present, the steep-bed coda points, which must
fall BELOW the curve (a 1-in-4 bed has a weight component that the
horizontal-bed momentum balance ignores).
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def belanger(fr):
    return 0.5 * (math.sqrt(1.0 + 8.0 * fr * fr) - 1.0)


def fnum(row, key):
    v = (row.get(key) or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_rows(path):
    rows = []
    with open(path, newline="") as fh:
        # tolerate a leading '#' banner line
        lines = [ln for ln in fh if not ln.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        row = { (k or "").strip(): (v if v is not None else "") for k, v in row.items() }
        fr = fnum(row, "Fr1")
        ratio = fnum(row, "y2_over_y1")
        if ratio is None:
            y1, y2 = fnum(row, "y1"), fnum(row, "y2")
            if y1 and y2:
                ratio = y2 / y1
        if fr is None or ratio is None:
            continue
        row["_Fr1"], row["_ratio"] = fr, ratio
        row["_scene"] = (row.get("scene") or "h23").strip() or "h23"
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvfile")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--title", default="HJ-1 · the class on the Belanger curve")
    args = ap.parse_args()

    rows = read_rows(args.csvfile)
    if not rows:
        sys.exit("no usable rows (need Fr1 and y2_over_y1, or y1 and y2)")

    flat = [r for r in rows if r["_scene"] != "s1"]
    steep = [r for r in rows if r["_scene"] == "s1"]

    frs = [r["_Fr1"] for r in rows]
    lo, hi = min(frs) - 0.25, max(frs) + 0.25
    lo = max(1.0, lo)
    xs = [lo + (hi - lo) * k / 400.0 for k in range(401)]

    fig, (ax, axr) = plt.subplots(
        2, 1, figsize=(7.6, 7.4), sharex=True,
        gridspec_kw={"height_ratios": [3, 1], "hspace": 0.08})

    ax.plot(xs, [belanger(x) for x in xs], "-", color="#3b6ea5", lw=2,
            label=r"Belanger  $y_2/y_1=\frac{1}{2}\left(\sqrt{1+8Fr_1^2}-1\right)$")
    ax.plot(xs, [0.95 * belanger(x) for x in xs], "--", color="#9bb7d4", lw=1,
            label="-5% reference (measured class mean is +3.2%)")

    if flat:
        qs = [fnum(r, "q") for r in flat]
        have_q = all(q is not None for q in qs)
        sc = ax.scatter([r["_Fr1"] for r in flat], [r["_ratio"] for r in flat],
                        c=qs if have_q else "#d1495b", cmap="viridis" if have_q else None,
                        s=90, zorder=5, edgecolor="white", linewidth=0.8,
                        label="class (scene h23, horizontal apron)")
        if have_q:
            cb = fig.colorbar(sc, ax=[ax, axr], pad=0.02, fraction=0.045)
            cb.set_label("personalised q  (m$^2$/s)")

    if steep:
        ax.scatter([r["_Fr1"] for r in steep], [r["_ratio"] for r in steep],
                   marker="v", s=120, color="#e07a1f", zorder=6,
                   edgecolor="white", linewidth=0.8,
                   label="coda (scene s1, 1-in-4 bed) — falls below")

    for r in rows:
        name = (r.get("student") or "").strip()
        if name:
            ax.annotate(name, (r["_Fr1"], r["_ratio"]), textcoords="offset points",
                        xytext=(7, -3), fontsize=7, color="#44546a")

    ax.set_ylabel(r"measured  $y_2/y_1$")
    ax.set_title(args.title)
    ax.grid(alpha=0.25)
    ax.legend(loc="upper left", fontsize=8, framealpha=0.95)

    # residual panel: how far each point sits from the momentum prediction
    for grp, style in ((flat, dict(color="#d1495b", marker="o")),
                       (steep, dict(color="#e07a1f", marker="v"))):
        if not grp:
            continue
        axr.scatter([r["_Fr1"] for r in grp],
                    [100.0 * (r["_ratio"] - belanger(r["_Fr1"])) / belanger(r["_Fr1"])
                     for r in grp], s=70, edgecolor="white", linewidth=0.7, **style)
    axr.axhline(0, color="#3b6ea5", lw=1.5)
    axr.axhspan(-10, 10, color="#3b6ea5", alpha=0.07)
    axr.set_xlabel(r"$Fr_1$")
    axr.set_ylabel("error vs\nmomentum  (%)")
    axr.grid(alpha=0.25)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    fig.savefig(args.out, dpi=150, bbox_inches="tight")

    errs = [100.0 * (r["_ratio"] - belanger(r["_Fr1"])) / belanger(r["_Fr1"]) for r in flat]
    print("wrote %s" % args.out)
    print("h23 points: %d   Fr1 %.2f-%.2f   mean error %+.1f%%   spread %.1f%%"
          % (len(flat), min(r["_Fr1"] for r in flat), max(r["_Fr1"] for r in flat),
             sum(errs) / len(errs), max(errs) - min(errs)) if flat else "no h23 points")
    if steep:
        serrs = [100.0 * (r["_ratio"] - belanger(r["_Fr1"])) / belanger(r["_Fr1"]) for r in steep]
        print("s1 coda:    %d points, mean error %+.1f%% (expected strongly negative)"
              % (len(steep), sum(serrs) / len(serrs)))


if __name__ == "__main__":
    main()
