#!/usr/bin/env python3
"""collect_plot.py -- B4 orbital decay: pool a class CSV into the payoff plot.

Usage:
    python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Required columns: T_s, loop2_mm, loop5_mm, loop8_mm (the height of one loop of
trails 2, 5 and 8, counted up from the bed). loop1_mm, the bed trail, is
optional. Extra columns are ignored.

Left: every student's three loops, each divided by their own trail 8, against
height above the bed, over linear theory sinh(kz)/sinh(k z8) at the class's
shortest and longest period. Right: trail 8 over trail 2 against kh, with the
theory curve. Tracer heights are the ones the column is seeded at in the deep
flume at Medium (main.js seedTracers): 1.65 cm above the bed, then every
8.80 cm, still depth h = 0.743 m at x = 5.84 m.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BLUE = "#2a78d6"
ORANGE = "#eb6834"
AQUA = "#1baf7a"
TEXT = "#0b0b0b"
MUTED = "#52514e"
GRID = "#dedcd4"

G = 9.81
H = 0.743                                   # still depth at the tracer column
Z = [0.0165 + 0.0880 * i for i in range(9)]  # tracer heights above the bed, trails 1..9


def k_of(T, h=H):
    w = 2 * math.pi / T
    k = w * w / G
    for _ in range(100):
        t = math.tanh(k * h)
        k = max(k - (G * k * t - w * w) / (G * t + G * k * h * (1 - t * t)), k / 2)
    return k


def ratio(k, za, zb):
    return math.sinh(k * za) / math.sinh(k * zb)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()
    rows = list(csv.DictReader(open(args.csv_path)))
    if not rows:
        sys.exit("no rows in " + args.csv_path)

    T = np.array([float(r["T_s"]) for r in rows])
    l2 = np.array([float(r["loop2_mm"]) for r in rows])
    l5 = np.array([float(r["loop5_mm"]) for r in rows])
    l8 = np.array([float(r["loop8_mm"]) for r in rows])
    k = np.array([k_of(t) for t in T])
    kh = k * H
    r82 = l8 / l2
    th82 = np.array([ratio(kk, Z[7], Z[1]) for kk in k])
    print(f"B4 pooled: {len(rows)} students, T {T.min():.2f}-{T.max():.2f} s, kh {kh.min():.2f}-{kh.max():.2f}")
    print(f"  trail 8 / trail 2: measured {r82.min():.2f}-{r82.max():.2f}, theory {th82.min():.2f}-{th82.max():.2f}")
    err = 100 * (r82 / th82 - 1)
    print(f"  error against theory: mean {err.mean():+.1f}%, spread {err.std():.1f}%")
    for name, l in (("trail 5", l5), ("trail 2", l2)):
        i = 4 if name == "trail 5" else 1
        th = np.array([ratio(kk, Z[i], Z[7]) for kk in k])
        e = 100 * ((l / l8) / th - 1)
        print(f"  {name} / trail 8 against theory: mean {e.mean():+.1f}%, spread {e.std():.1f}%")

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 5.2), dpi=150)
    fig.patch.set_facecolor("#fcfcfb")
    for ax in (a1, a2):
        ax.set_facecolor("#fcfcfb")
        ax.grid(True, which="both", color=GRID, linewidth=0.7, alpha=0.8)
        ax.set_axisbelow(True)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        for s in ("left", "bottom"):
            ax.spines[s].set_color(GRID)
        ax.tick_params(colors=MUTED)

    zf = np.linspace(0.0, Z[8], 200)
    for kk, c, lab in ((k.max(), ORANGE, f"theory, T = {T.min():.2f} s (kh = {kh.max():.2f})"),
                       (k.min(), BLUE, f"theory, T = {T.max():.2f} s (kh = {kh.min():.2f})")):
        a1.plot([math.sinh(kk * z) / math.sinh(kk * Z[7]) for z in zf], zf / H, color=c, lw=2, label=lab)
    for i in range(len(rows)):
        a1.plot([l2[i] / l8[i], l5[i] / l8[i], 1.0], [Z[1] / H, Z[4] / H, Z[7] / H],
                "o", color=AQUA, ms=5, alpha=0.75, zorder=4)
    a1.plot([], [], "o", color=AQUA, label="students: loops 2, 5, 8 over loop 8")
    a1.set_xlabel("vertical loop height / loop height of trail 8", color=TEXT)
    a1.set_ylabel("height above the bed, z / h", color=TEXT)
    a1.set_xlim(0, 1.1); a1.set_ylim(0, 1)
    a1.axhline(1.0, color=MUTED, lw=0.8, ls=":")
    a1.legend(loc="lower right", frameon=False, fontsize=8.5)
    a1.set_title("The vertical motion dies towards the bed", color=TEXT, fontsize=11.5)

    khf = np.linspace(kh.min() * 0.9, kh.max() * 1.1, 200)
    a2.plot(khf, [ratio(x / H, Z[7], Z[1]) for x in khf], color=BLUE, lw=2, label="linear theory, sinh(k z₈)/sinh(k z₂)")
    a2.scatter(kh, r82, s=48, color=AQUA, edgecolor="#fcfcfb", linewidth=1, zorder=5, label="students")
    a2.set_xlabel("kh", color=TEXT)
    a2.set_ylabel("trail 8 / trail 2 (loop heights)", color=TEXT)
    a2.set_ylim(0, max(r82.max(), th82.max()) * 1.25)
    a2.legend(loc="upper left", frameon=False, fontsize=8.5)
    a2.set_title("…faster the shorter the wave", color=TEXT, fontsize=11.5)
    fig.suptitle("B4 · orbital decay off the trails — deep flume, column at x = 5.84 m", color=TEXT, fontsize=12.5)
    plt.tight_layout()
    plt.savefig(args.out, facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
