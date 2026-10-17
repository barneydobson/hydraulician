#!/usr/bin/env python3
"""
collect_plot.py — pool a B8 "three orifices, three coefficients" class CSV
into a plot.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns ignored):
    student,digit,lip,Cc,Cv,Cd,jet_thickness_m,opening_height_m,source

Only `lip` (sharp / bellmouth / borda) and `Cc` are required. Each student's
`Cc` is the vena-contracta jet thickness (read off the fill-fraction field,
or by eye against the drawn opening) divided by the orifice opening height.

Reference lines: 0.611 (sharp, textbook), ~1.0 (well-rounded/bellmouth,
ideal), 0.5 (Borda re-entrant, exact from momentum with no assumed
coefficient at all).
"""
import csv
import math
import sys

REF = {"sharp": 0.611, "bellmouth": 1.0, "borda": 0.5}
ORDER = ["sharp", "bellmouth", "borda"]
COLOURS = {"sharp": "#0d76ad", "bellmouth": "#1f7a4d", "borda": "#b23a52"}


def load_rows(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            lip = (r.get("lip") or "").strip().lower()
            try:
                cc = float(r["Cc"])
            except (KeyError, ValueError):
                continue
            if lip not in REF:
                continue
            rows.append({**r, "lip": lip, "Cc": cc})
    return rows


def stats(vals):
    n = len(vals)
    mean = sum(vals) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / n) if n > 1 else 0.0
    return mean, sd, n


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    out = "plots/pooled-demo.png"
    if "-o" in sys.argv:
        out = sys.argv[sys.argv.index("-o") + 1]

    rows = load_rows(path)
    if not rows:
        print("No usable (lip, Cc) rows found in %s" % path)
        sys.exit(1)

    print("B8 three orifices, three coefficients — pooled result")
    print("  n = %d rows" % len(rows))
    by_lip = {}
    for r in rows:
        by_lip.setdefault(r["lip"], []).append(r["Cc"])
    for lip in ORDER:
        if lip not in by_lip:
            continue
        mean, sd, n = stats(by_lip[lip])
        ref = REF[lip]
        print("  %-9s n=%d  Cc = %.3f +/- %.3f   (reference %.3f, gap %+.1f%%)" %
              (lip, n, mean, sd, ref, 100 * (mean - ref) / ref))

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not available; skipping plot")
        sys.exit(0)

    fig, ax = plt.subplots(figsize=(6.6, 5.2))

    xpos = {lip: i for i, lip in enumerate(ORDER)}
    for lip in ORDER:
        if lip not in by_lip:
            continue
        x0 = xpos[lip]
        vals = by_lip[lip]
        jitter = [(-0.09 + 0.18 * (i / max(len(vals) - 1, 1))) for i in range(len(vals))]
        ax.scatter([x0 + j for j in jitter], vals, s=60, color=COLOURS[lip],
                   zorder=3, edgecolor="white", linewidth=0.6,
                   label="%s (n=%d)" % (lip, len(vals)))
        mean, sd, n = stats(vals)
        ax.errorbar([x0], [mean], yerr=[sd], fmt="D", color="black", ms=7,
                    capsize=5, zorder=4, elinewidth=1.4)
        ax.hlines(REF[lip], x0 - 0.35, x0 + 0.35, colors="#55697a",
                  linestyles="--", linewidth=1.4, zorder=2)
        ax.annotate("ref %.2f" % REF[lip], (x0 + 0.37, REF[lip]),
                    fontsize=8.5, color="#55697a", va="center")

    ax.set_xticks([xpos[l] for l in ORDER if l in by_lip])
    ax.set_xticklabels([l for l in ORDER if l in by_lip])
    ax.set_xlim(-0.6, len(by_lip) - 0.4)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel(r"$C_c$ = vena-contracta thickness / opening height")
    ax.set_title("B8 — three orifices: $C_c$ by lip type")
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(axis="y", alpha=0.25)

    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
