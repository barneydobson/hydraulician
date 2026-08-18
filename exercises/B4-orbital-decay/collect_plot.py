#!/usr/bin/env python3
"""collect_plot.py -- B4 orbital decay: pool a class CSV into the payoff plot.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Required columns: digit, T_s, kh, vratio_submitted_naive (or vratio_dft).
Extra columns are ignored, so a Blackboard export with a few students missing
optional fields still plots.

What this draws: the vertical (surface/bed) orbital-amplitude decay ratio
against kh, alongside the linear-theory curve sinh(k(z+h))/sinh(k(z+h)) built
from THIS scene's own tracer elevations (bed ~1.5 cells off the floor, surface
~2 cells below the still surface -- see _archive/README-full.md S1/S5). Theory
keeps climbing
exponentially with kh; measured points plateau once the true bed signal drops
below the station's ambient noise floor -- see _archive/README-full.md S5 for
why, and why that
gap is itself the point of the demo, not a defect in it.
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

H_WAVEDEEP = 0.7385          # measured still-water depth (WV-2), used throughout
EPS_BED = 0.0165             # tracer height above the true bed, m (near-constant)
EPS_SURF = 0.0215            # tracer depth below the true still surface, m


def theory_curve(kh_vals, h=H_WAVEDEEP, eps_bed=EPS_BED, eps_surf=EPS_SURF):
    out = []
    for khv in kh_vals:
        k = khv / h
        zbed = -(h - eps_bed)
        zsurf = -eps_surf
        v_bed_over_surf = math.sinh(k * (zbed + h)) / math.sinh(k * (zsurf + h))
        out.append(1.0 / v_bed_over_surf)
    return np.array(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = list(csv.DictReader(open(args.csv_path)))
    if not rows:
        print("no rows in", args.csv_path)
        sys.exit(1)

    kh = np.array([float(r["kh"]) for r in rows])
    v_naive = np.array([float(r["vratio_submitted_naive"]) for r in rows])
    has_dft = "vratio_dft" in rows[0] and rows[0]["vratio_dft"] != ""
    v_dft = np.array([float(r["vratio_dft"]) for r in rows]) if has_dft else None

    kh_fine = np.linspace(max(0.5, kh.min() * 0.85), kh.max() * 1.08, 300)
    theory_fine = theory_curve(kh_fine)
    theory_pts = theory_curve(kh)

    print(f"B4 pooled: {len(rows)} points, kh {kh.min():.2f}-{kh.max():.2f}")
    print(f"  naive vratio range: {v_naive.min():.1f} - {v_naive.max():.1f}")
    if has_dft:
        print(f"  dft   vratio range: {v_dft.min():.1f} - {v_dft.max():.1f}")
    print(f"  theory (pure physics) range over same kh: {theory_pts.min():.1f} - {theory_pts.max():.1f}")
    print("  mean |naive/theory|: %.4f  (points plateau far below theory once bed signal < noise floor)"
          % float(np.mean(v_naive / theory_pts)))

    fig, ax = plt.subplots(figsize=(9.2, 6.0), dpi=150)
    fig.patch.set_facecolor("#fcfcfb")
    ax.set_facecolor("#fcfcfb")

    ax.plot(kh_fine, theory_fine, color=BLUE, lw=2, zorder=3,
            label="linear theory, sinh(k(z+h))  (surface/bed)")
    if has_dft:
        ax.scatter(kh, v_dft, s=62, color=ORANGE, edgecolor="#fcfcfb", linewidth=1.2, zorder=5,
                   label="measured -- paddle-frequency fit (“truth” attempt)")
    ax.scatter(kh, v_naive, s=62, color=AQUA, edgecolor="#fcfcfb", linewidth=1.2, zorder=4, marker="D",
               label="measured -- naive trail extent (what a student reads)")

    for r in rows:
        ax.annotate(f"d={r['digit']}", (float(r["kh"]), float(r["vratio_submitted_naive"])),
                    textcoords="offset points", xytext=(6, 6), fontsize=8, color=MUTED)

    ax.set_yscale("log")
    ax.set_xlabel("kh  (wavenumber × still-water depth)", color=TEXT, fontsize=11)
    ax.set_ylabel("vertical amplitude ratio, surface / bed  (log scale)", color=TEXT, fontsize=11)
    ax.set_title("B4 · orbital vertical decay vs kh — wavedeep, x = 5.84 m (scene's own station)",
                 color=TEXT, fontsize=12.5, pad=14)
    ax.grid(True, which="both", color=GRID, linewidth=0.7, alpha=0.8)
    ax.set_axisbelow(True)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    for spine in ["left", "bottom"]:
        ax.spines[spine].set_color(GRID)
    ax.tick_params(colors=MUTED)
    ax.legend(loc="upper left", frameon=False, fontsize=9.5, labelcolor=TEXT)

    ax.text(0.985, 0.03,
            "Theory keeps climbing with kh; the measurement plateaus around 15-150×\n"
            "because the true bed signal drops below this station's noise floor\n"
            "long before kh=8 — the gap IS the finding (see README §5).",
            transform=ax.transAxes, ha="right", va="bottom", fontsize=8.7, color=MUTED,
            style="italic")

    plt.tight_layout()
    plt.savefig(args.out, facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
