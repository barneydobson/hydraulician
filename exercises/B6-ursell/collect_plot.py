#!/usr/bin/env python3
"""collect_plot.py -- B6 Ursell number: pool a class CSV into the payoff plot.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Required columns: Ur, asymmetry. `note` marks bonus/non-digit rows (plotted as
a separate low-amplitude calibration series, diamonds) versus the personalised
class digits (circles). Extra columns are ignored.

What this draws: crest/trough asymmetry against the Ursell number U_r =
H*L^2/h^3, with the classical Stokes-validity marker at U_r=26. The pooled
story is W26's whole point: asymmetry grows with U_r, i.e. the wave itself
tells you when linear (Airy) theory has stopped being an adequate
description -- see _archive/README-full.md S2 for the flat-trough/peaked-crest
screenshot this
number is standing in for.
"""
import argparse
import csv
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BLUE = "#2a78d6"
ORANGE = "#eb6834"
AQUA = "#1baf7a"
GREY = "#9a9890"
TEXT = "#0b0b0b"
MUTED = "#52514e"
GRID = "#dedcd4"

UR_MARKER = 26.0
# Points whose own amplitude sits at/below this station's ambient noise floor
# (verified in _archive/README-full.md §5 by inspecting the raw signal) are excluded
# from the trend fit but still plotted, circled, so the reader can see them.
NOISE_FLOOR_STUDENTS = {"low1"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = list(csv.DictReader(open(args.csv_path)))
    if not rows:
        print("no rows in", args.csv_path)
        sys.exit(1)

    main_rows = [r for r in rows if not r.get("note")]
    bonus_rows = [r for r in rows if r.get("note")]

    Ur_main = np.array([float(r["Ur"]) for r in main_rows])
    asym_main = np.array([float(r["asymmetry"]) for r in main_rows])
    Ur_bonus = np.array([float(r["Ur"]) for r in bonus_rows]) if bonus_rows else np.array([])
    asym_bonus = np.array([float(r["asymmetry"]) for r in bonus_rows]) if bonus_rows else np.array([])
    bonus_tags = [r["student"] for r in bonus_rows]

    n_below_marker = int((np.concatenate([Ur_main, Ur_bonus]) < UR_MARKER).sum())
    print(f"B6 pooled: {len(main_rows)} class points (Ur {Ur_main.min():.0f}-{Ur_main.max():.0f}, "
          f"asymmetry {asym_main.min():.3f}-{asym_main.max():.3f}), {len(bonus_rows)} bonus points")
    print(f"  points below the U_r~26 Stokes marker: {n_below_marker}")

    fig, ax = plt.subplots(figsize=(9.4, 6.2), dpi=150)
    fig.patch.set_facecolor("#fcfcfb")
    ax.set_facecolor("#fcfcfb")

    ax.axvline(UR_MARKER, color=MUTED, lw=1.4, linestyle=(0, (5, 3)), zorder=1)
    ax.axhline(1.0, color=GRID, lw=1.2, zorder=1)

    if len(bonus_rows):
        ax.scatter(Ur_bonus, asym_bonus, s=64, color=AQUA, edgecolor="#fcfcfb", linewidth=1.2,
                   marker="D", zorder=4, label="bonus low-amplitude points (calibration)")
        for tag, Ur, a in zip(bonus_tags, Ur_bonus, asym_bonus):
            ax.annotate(tag, (Ur, a), textcoords="offset points", xytext=(6, -3), fontsize=8, color=MUTED)
        for tag, Ur, a in zip(bonus_tags, Ur_bonus, asym_bonus):
            if tag in NOISE_FLOOR_STUDENTS:
                ax.scatter([Ur], [a], s=140, facecolor="none", edgecolor=GREY, linewidth=1.3, zorder=6)

    ax.scatter(Ur_main, asym_main, s=70, color=ORANGE, edgecolor="#fcfcfb", linewidth=1.2, zorder=5,
               label="simulated class (personalised T)")
    for r in main_rows:
        ax.annotate(f"d={r['digit']}", (float(r["Ur"]), float(r["asymmetry"])),
                    textcoords="offset points", xytext=(5, 5), fontsize=8, color=MUTED)

    keep = [i for i, t in enumerate(bonus_tags) if t not in NOISE_FLOOR_STUDENTS]
    keepUr = np.concatenate([Ur_main, Ur_bonus[keep] if len(keep) else np.array([])])
    keepA = np.concatenate([asym_main, asym_bonus[keep] if len(keep) else np.array([])])
    if len(keepUr) >= 2:
        order = np.argsort(keepUr)
        z = np.polyfit(np.log(keepUr[order]), keepA[order], 1)
        lo = min(Ur_bonus.min(), Ur_main.min()) * 0.8 if len(Ur_bonus) else Ur_main.min() * 0.8
        xs = np.linspace(lo, Ur_main.max() * 1.1, 100)
        ax.plot(xs, z[0] * np.log(xs) + z[1], color=BLUE, lw=2, zorder=3,
                label="trend, asymmetry ∝ log U$_r$")

    ax.set_xscale("log")
    ax.set_xlabel("Ursell number  U$_r$ = H·L² / h³   (log scale)", color=TEXT, fontsize=11)
    ax.set_ylabel("asymmetry  =  (crest above mean) / (trough below mean)", color=TEXT, fontsize=11)
    ax.set_title("B6 · wave asymmetry vs Ursell number — waveshallow, x = 1.0-1.8 m",
                 color=TEXT, fontsize=12.5, pad=32)
    ax.text(0.5, 1.045,
            "dashed line: classical Stokes-validity marker, U$_r$ ≈ 26  ·  circled point: below this station's noise floor (see README §5)",
            transform=ax.transAxes, ha="center", fontsize=8.8, color=MUTED)
    ax.grid(True, which="both", color=GRID, linewidth=0.7, alpha=0.7)
    ax.set_axisbelow(True)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    for spine in ["left", "bottom"]:
        ax.spines[spine].set_color(GRID)
    ax.tick_params(colors=MUTED)
    ax.legend(loc="lower right", frameon=False, fontsize=9.3, labelcolor=TEXT)
    ax.set_ylim(0.95, 1.55)

    plt.tight_layout()
    plt.savefig(args.out, facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
