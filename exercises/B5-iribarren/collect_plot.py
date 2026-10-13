#!/usr/bin/env python3
"""
collect_plot.py -- pool the B5 "Iribarren map jigsaw" class CSV and draw the
map: each pair's cell at its Iribarren number xi0 = tanβ / √(H0/L0), one lane
per beach, coloured by what the pair saw the wave do -- breaks (a step stands
up in the surface on the beach), surges (the water's edge rises and falls
with no step) or dies (nothing reaches the shore) -- over the classical bands
(spilling < 0.5, plunging 0.5-3.3, surging > 3.3), with each breaking cell's
surf width printed beside it.

Usage:
  python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
  python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Expected CSV columns (extra columns ignored):
  scene, xi0, behaviour [, surf_width_m]

`scene` is "wave" or "wavesurge"; `behaviour` is breaks, surges or dies
(case-insensitive, and "breaking", "surging", "died" are read the same).
"""
import csv
import sys
import math
import argparse

BAND_LO, BAND_HI = 0.5, 3.3

STYLE = {
    "breaks": dict(color="#2a78d6", marker="o", label="breaks: a step stands up and runs to the shore"),
    "surges": dict(color="#eb6834", marker="s", label="surges: the edge rises and falls, no step"),
    "dies":   dict(color="#8a8984", marker="x", label="dies: nothing reaches the shore"),
}
LANE = {"wave": 1.0, "wavesurge": 0.0}
LANE_LABEL = {"wave": "wave: 1 : 10 beach, tanβ = 0.10", "wavesurge": "wavesurge: 1 : 1.43 wall, tanβ = 0.70"}


def norm(s):
    s = (s or "").strip().lower()
    if s.startswith("break"):
        return "breaks"
    if s.startswith("surg"):
        return "surges"
    if s.startswith("die") or s.startswith("dead"):
        return "dies"
    return None


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                xi = float(r["xi0"])
            except (KeyError, ValueError, TypeError):
                continue
            b = norm(r.get("behaviour") or r.get("behavior"))
            scene = (r.get("scene") or "").strip().lower()
            if b is None or scene not in LANE:
                continue
            try:
                sw = float(r.get("surf_width_m"))
            except (TypeError, ValueError):
                sw = None
            rows.append({"scene": scene, "xi0": xi, "b": b, "surf": sw})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_rows(args.csv)
    if not rows:
        sys.exit("no usable rows in " + args.csv)
    for scene in LANE:
        rs = [r for r in rows if r["scene"] == scene]
        if not rs:
            continue
        parts = []
        for b in STYLE:
            xs = sorted(r["xi0"] for r in rs if r["b"] == b)
            if xs:
                parts.append(f"{b} {len(xs)} at ξ0 {xs[0]:.2f}-{xs[-1]:.2f}")
        print(f"{scene:>9}: " + "; ".join(parts))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 5.0))
    fig.patch.set_facecolor("#fcfcfb"); ax.set_facecolor("#fcfcfb")
    lo, hi = 0.2, 30
    ax.set_xscale("log"); ax.set_xlim(lo, hi); ax.set_ylim(-0.6, 1.7)
    for a, b, c in ((lo, BAND_LO, "#2a78d6"), (BAND_LO, BAND_HI, "#8a8984"), (BAND_HI, hi, "#eb6834")):
        ax.axvspan(a, b, color=c, alpha=0.07, zorder=0)
    for v in (BAND_LO, BAND_HI):
        ax.axvline(v, color="#8a8984", lw=1, ls="--", zorder=1)
    for x, t in ((math.sqrt(lo * BAND_LO), "spilling"), (math.sqrt(BAND_LO * BAND_HI), "plunging"),
                 (math.sqrt(BAND_HI * hi), "surging")):
        ax.text(x, 1.6, t + "\n(classical)", ha="center", va="top", fontsize=8.5, color="#52514e")
    for scene, y in LANE.items():
        ax.axhline(y, color="#52514e", lw=0.6, alpha=0.4, zorder=1)
        ax.text(lo * 1.1, y + 0.17, LANE_LABEL[scene], fontsize=8.5, color="#52514e")
    seen = {}
    for b, st in STYLE.items():
        rs = [r for r in rows if r["b"] == b]
        if not rs:
            continue
        ys = []
        for r in rs:
            k = (r["scene"], round(r["xi0"], 2))
            seen[k] = seen.get(k, 0) + 1
            ys.append(LANE[r["scene"]] + 0.07 * (seen[k] - 1))
        ax.scatter([r["xi0"] for r in rs], ys, s=80, color=st["color"], marker=st["marker"],
                   edgecolor="white" if st["marker"] != "x" else None, linewidths=1.8 if st["marker"] == "x" else 0.8,
                   zorder=5, label=f"{st['label']} (n={len(rs)})")
        for r, y in zip(rs, ys):
            if r["surf"] is not None:
                ax.annotate(f"{r['surf']:.2f} m", (r["xi0"], y), textcoords="offset points", xytext=(0, -15),
                            ha="center", fontsize=7.5, color=st["color"])
    ax.set_yticks([])
    ax.set_xlabel(r"Iribarren number $\xi_0 = \tan\beta / \sqrt{H_0/L_0}$")
    ax.set_title("B5 · what each cell's wave does on its beach (surf widths in metres)", fontsize=12)
    ax.legend(fontsize=8.5, loc="lower right", frameon=False)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    fig.savefig(args.out, dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
