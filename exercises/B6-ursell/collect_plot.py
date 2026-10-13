#!/usr/bin/env python3
"""collect_plot.py -- B6 Ursell number: pool a class CSV into the payoff plot.

Usage:
    python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Required columns: Ur, asymmetry [, T_s, which defaults to the card's 2.0 s].
Extra columns are ignored.

Crest/trough asymmetry at x = 3.5 m, measured from the trace's own mean
level, against the Ursell number U_r = H L^2/h^3 on a log axis, with the
classical U_r = 26 marker and second-order Stokes theory at the class's
period. The point of the picture: at small U_r the crest and the trough are
the same size; the crest stands up as U_r approaches the marker, and past
it the measured shape leaves second-order theory.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.ticker
import matplotlib.pyplot as plt
import numpy as np

TEXT = "#0b0b0b"
MUTED = "#52514e"
GRID = "#dedcd4"
COLOURS = ["#2a78d6", "#1baf7a", "#eb6834", "#8250df", "#d4a72c"]
UR_MARKER = 26.0
G = 9.81
H0 = 0.348


def k_of(T, h=H0):
    w = 2 * math.pi / T
    k = w * w / G
    for _ in range(100):
        t = math.tanh(k * h)
        k = max(k - (G * k * t - w * w) / (G * t + G * k * h * (1 - t * t)), k / 2)
    return k


def stokes2(T, Ur):
    """Second-order Stokes crest/trough for the H that gives this U_r at period T."""
    k = k_of(T); L = 2 * math.pi / k; kh = k * H0
    H = Ur * H0 ** 3 / L ** 2
    r = (k * H / 2 / 4) * math.cosh(kh) * (2 + math.cosh(2 * kh)) / math.sinh(kh) ** 3
    return (1 + r) / (1 - r) if r < 0.6 else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()
    rows = list(csv.DictReader(open(args.csv_path)))
    if not rows:
        sys.exit("no rows in " + args.csv_path)
    T = np.array([float(r.get("T_s") or 2.0) for r in rows])
    Ur = np.array([float(r["Ur"]) for r in rows])
    asym = np.array([float(r["asymmetry"]) for r in rows])
    lo, hi = Ur < UR_MARKER, Ur >= UR_MARKER
    print(f"B6 pooled: {len(rows)} students, U_r {Ur.min():.0f}-{Ur.max():.0f}")
    if lo.any():
        print(f"  below U_r = 26: asymmetry {asym[lo].min():.2f}-{asym[lo].max():.2f} (n={lo.sum()})")
    if hi.any():
        print(f"  at or above:    asymmetry {asym[hi].min():.2f}-{asym[hi].max():.2f} (n={hi.sum()})")

    fig, ax = plt.subplots(figsize=(9.2, 6.0), dpi=150)
    fig.patch.set_facecolor("#fcfcfb"); ax.set_facecolor("#fcfcfb")
    ax.axvline(UR_MARKER, color=MUTED, lw=1.2, ls="--", zorder=1)
    ax.text(UR_MARKER * 1.04, 0.97, "U_r ≈ 26", transform=ax.get_xaxis_transform(),
            va="top", fontsize=9, color=MUTED)
    ax.axhline(1.0, color=GRID, lw=1.0, zorder=1)
    urf = np.logspace(math.log10(max(2, Ur.min() * 0.6)), math.log10(Ur.max() * 1.6), 200)
    for i, t in enumerate(sorted(set(T))):
        c = COLOURS[i % len(COLOURS)]
        m = T == t
        ax.scatter(Ur[m], asym[m], s=64, color=c, edgecolor="white", linewidth=1.1, zorder=5, label=f"T = {t:.1f} s")
        ax.plot(urf, [stokes2(t, u) for u in urf], color=c, lw=1.0, alpha=0.6, zorder=2)
    ax.plot([], [], color=MUTED, lw=1.0, alpha=0.6, label="second-order Stokes at that period")
    ax.set_xscale("log")
    ticks = [t for t in (5, 10, 20, 30, 50, 100, 200, 500) if urf[0] <= t <= urf[-1]]
    ax.set_xticks(ticks)
    ax.set_xticklabels([str(t) for t in ticks])
    ax.xaxis.set_minor_formatter(matplotlib.ticker.NullFormatter())
    ax.set_xlabel("Ursell number U_r = H L² / h³", color=TEXT)
    ax.set_ylabel("crest above the mean level / trough below it", color=TEXT)
    ax.set_ylim(0.8, max(2.6, asym.max() * 1.1))
    ax.set_title("B6 · when Airy stops being enough — shallow flume, T = 2.0 s, gauge at x = 3.5 m",
                 color=TEXT, fontsize=11.5)
    ax.grid(True, which="both", color=GRID, linewidth=0.6, alpha=0.8)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.legend(loc="upper left", frameon=False, fontsize=8.5)
    plt.tight_layout()
    plt.savefig(args.out, facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
