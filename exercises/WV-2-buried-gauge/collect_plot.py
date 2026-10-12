#!/usr/bin/env python3
"""
collect_plot.py -- pool the WV-2 "buried wave gauge" class CSV and plot the
bed/surface pressure-amplitude ratio against kh, on linear theory at the
card's gauge heights and on the idealised 1/cosh(kh).

Usage:
  python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
  python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Expected CSV columns (extra columns ignored):
  T_s, ratio            (or a_bed_m and a_surf_m, from which the ratio is taken)
  [, ratio_swing]       the half peak-to-peak ratio, drawn as a second series

kh is solved from T_s at the flume's still depth, h = 0.348 m. The gauge
heights are the card's: z = 0.27 and 0.52 m on a bed at z = 0.247 m.
"""
import csv
import math
import sys
import argparse

G = 9.81
H = 0.348
ZB = 0.27 - 0.247          # bed gauge, height above the bed
ZS = 0.52 - 0.247          # surface gauge


def solve_k(T, h=H, g=G):
    w = 2 * math.pi / T
    k = w * w / g
    for _ in range(200):
        t = math.tanh(k * h)
        k2 = k - (g * k * t - w * w) / (g * t + g * k * h * (1 - t * t))
        k = k2 if k2 > 0 else k / 2
    return k


def at_gauges(k):
    return math.cosh(k * ZB) / math.cosh(k * ZS)


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                T = float(r["T_s"])
                if r.get("ratio") not in (None, ""):
                    ratio = float(r["ratio"])
                else:
                    ratio = float(r["a_bed_m"]) / float(r["a_surf_m"])
            except (KeyError, ValueError, TypeError, ZeroDivisionError):
                continue
            try:
                swing = float(r.get("ratio_swing"))
            except (TypeError, ValueError):
                swing = None
            k = solve_k(T)
            rows.append({"T": T, "kh": k * H, "k": k, "ratio": ratio, "swing": swing})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_rows(args.csv)
    if not rows:
        sys.exit("no usable rows in " + args.csv)
    err = [100 * (r["ratio"] / at_gauges(r["k"]) - 1) for r in rows]
    print(f"{len(rows)} rows, kh {min(r['kh'] for r in rows):.2f}-{max(r['kh'] for r in rows):.2f}")
    print(f"  ratio against theory at the gauge heights: mean {sum(err)/len(err):+.1f}%, "
          f"range {min(err):+.1f}% to {max(err):+.1f}%")
    sw = [r for r in rows if r["swing"] is not None]
    if sw:
        e2 = [100 * (r["swing"] / at_gauges(r["k"]) - 1) for r in sw]
        print(f"  the half peak-to-peak swing instead: mean {sum(e2)/len(e2):+.1f}%, "
              f"range {min(e2):+.1f}% to {max(e2):+.1f}%")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 6.0))
    fig.patch.set_facecolor("#fcfcfb"); ax.set_facecolor("#fcfcfb")
    khs = [0.02 * i for i in range(10, 110)]
    ax.plot(khs, [at_gauges(k / H) for k in khs], "-", color="#2a78d6", lw=2.2, zorder=3,
            label=r"linear theory at the gauges, $\cosh(kz_b)/\cosh(kz_s)$")
    ax.plot(khs, [1 / math.cosh(k) for k in khs], "--", color="#52514e", lw=1.4, zorder=2,
            label=r"idealised, gauges at bed and surface: $1/\cosh(kh)$")
    ax.scatter([r["kh"] for r in rows], [r["ratio"] for r in rows], s=70, color="#eb6834",
               edgecolor="white", zorder=5, label=f"amplitude at the paddle's period (n={len(rows)})")
    if sw:
        ax.scatter([r["kh"] for r in sw], [r["swing"] for r in sw], marker="x", s=60,
                   color="#1baf7a", linewidths=1.8, zorder=4, label="half the peak-to-peak swing, for comparison")
    ax.set_xlabel(r"$kh$  (wavenumber $\times$ still-water depth, $h$ = 0.348 m)")
    ax.set_ylabel("bed / surface pressure-amplitude ratio")
    ax.set_title("WV-2 · the buried wave gauge — 1 : 10 beach flume, gauges at x = 0.60 m", fontsize=12)
    ax.set_xlim(0.2, 2.2); ax.set_ylim(0, 1.3)
    ax.grid(alpha=0.3); ax.legend(fontsize=8.5, loc="lower left", frameon=False)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.savefig(args.out, dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
