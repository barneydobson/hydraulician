#!/usr/bin/env python3
"""DA-1 · Empty a tank of honey — pool the class CSV.

    python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Input CSV (Blackboard export, header row required, extra columns ignored):

    student_id,digit,Lr_water,Vr_water,Lr_honey,Vr_honey
    23140870,0,0.25,0.531,0.25,0.210

Each student runs the same pair of tanks at their own L_r, once in water and
once in honey, and submits the velocity ratio V_r = L_r / T_r, where
T_r = T_m / T_p is their measured time ratio. A row may carry only one fluid.

Two panels:

  left   V_r against L_r for both fluids, with Froude's V_r = √L_r. Water sits
         on the line; honey falls away from it as the model shrinks.
  right  the departure from Froude, 100·(V_r/√L_r − 1) %, against L_r.
"""
import argparse
import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

NAVY, AMBER, GREY = "#17365D", "#C27C0E", "#6B6B6B"
FLUIDS = (("water", NAVY, "o"), ("honey", AMBER, "s"))


def read(path):
    pts = {fl: [] for fl, _, _ in FLUIDS}
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            for fl in pts:
                try:
                    lr, vr = float(r["Lr_" + fl]), float(r["Vr_" + fl])
                except (KeyError, ValueError, TypeError):
                    continue
                if not (0.2 <= lr <= 0.75 and 0.05 <= vr <= 1.5):
                    print("  dropped %s (out of range): %s" % (fl, dict(r)))
                    continue
                pts[fl].append((lr, vr))
    return pts


def slope(pts):
    x = [math.log(a) for a, _ in pts]
    y = [math.log(b) for _, b in pts]
    mx, my = sum(x) / len(x), sum(y) / len(y)
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / sum((a - mx) ** 2 for a in x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                        "plots", "pooled-demo.png"))
    args = ap.parse_args()
    pts = read(args.csv)
    if sum(len(v) for v in pts.values()) < 3:
        raise SystemExit("need at least 3 usable points")
    for fl, p in pts.items():
        if len(set(a for a, _ in p)) >= 2:
            print("%s: %d points, V_r ∝ L_r^%.2f (Froude: 0.50)" % (fl, len(p), slope(p)))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2), dpi=150)
    lr = [0.22 + 0.005 * k for k in range(110)]
    ax1.plot(lr, [math.sqrt(v) for v in lr], color=GREY, lw=1.2, ls="--", label=r"Froude: $V_r = \sqrt{L_r}$")
    ax2.axhline(0, color=GREY, lw=1.2, ls="--", label="Froude")
    for fl, col, mk in FLUIDS:
        p = pts[fl]
        if not p:
            continue
        ax1.plot([a for a, _ in p], [b for _, b in p], mk, color=col, ms=5, alpha=0.8, label=fl)
        ax2.plot([a for a, _ in p], [100 * (b / math.sqrt(a) - 1) for a, b in p], mk, color=col, ms=5,
                 alpha=0.8, label=fl)
    ax1.set_xlabel("length ratio $L_r$")
    ax1.set_ylabel("velocity ratio $V_r = L_r / T_r$")
    ax1.set_xlim(0.2, 0.75)
    ax1.set_ylim(0, 1.0)
    ax2.set_xlabel("length ratio $L_r$")
    ax2.set_ylabel(r"departure from Froude, $100\,(V_r/\sqrt{L_r} - 1)$ %")
    ax2.set_xlim(0.2, 0.75)
    for ax in (ax1, ax2):
        ax.legend(frameon=False)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    n = max(len(v) for v in pts.values())
    fig.suptitle("DA-1 · empty a tank of honey: %d submissions per fluid" % n)
    fig.tight_layout()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fig.savefig(args.out, facecolor="white")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
