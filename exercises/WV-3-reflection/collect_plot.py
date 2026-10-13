#!/usr/bin/env python3
"""
collect_plot.py -- pool the WV-3 "reflection coefficient" class CSV and plot
K = (a_max - a_min)/(a_max + a_min) against the period, the steep sea wall
(wavesurge, 1 : 1.4) beside the gentle beach (waveshallow, 1 : 20), over
the reflection of the wall itself: the envelope of every column of the flat.

Usage:
  python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
  python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Expected CSV columns (extra columns ignored):
  T_s, K                 (or a_max_m and a_min_m, from which K is taken)
  [, series]             "wall" (the default) or "beach", the contrast run
"""
import csv
import sys
import argparse

# The wall's own reflection: the first-harmonic amplitude of every column of
# the flat over six periods, its largest and smallest within half a
# wavelength of the wall (README, "Measured answers", envelope K): period -> K.
WALL_REF = {1.8: 0.59, 2.4: 0.83, 3.0: 0.97, 3.6: 0.89, 4.2: 0.84}

STYLE = {
    "wall": dict(color="#2a78d6", marker="o", label="sea wall, 1 : 1.4 (wavesurge)"),
    "beach": dict(color="#eb6834", marker="s", label="gentle beach, 1 : 20 (waveshallow)"),
}


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                T = float(r["T_s"])
                if r.get("K") not in (None, ""):
                    K = float(r["K"])
                else:
                    amax, amin = float(r["a_max_m"]), float(r["a_min_m"])
                    K = (amax - amin) / (amax + amin)
            except (KeyError, ValueError, TypeError, ZeroDivisionError):
                continue
            series = (r.get("series") or "wall").strip().lower()
            rows.append({"T": T, "K": K, "series": series if series in STYLE else "wall"})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_rows(args.csv)
    if not rows:
        sys.exit("no usable rows in " + args.csv)
    for name in STYLE:
        rs = [r for r in rows if r["series"] == name]
        if not rs:
            continue
        Ks = [r["K"] for r in rs]
        line = f"{name:>5}: {len(rs)} rows, K {min(Ks):.2f}-{max(Ks):.2f}, mean {sum(Ks) / len(Ks):.2f}"
        if name == "wall":
            d = [r["K"] - WALL_REF[round(r["T"], 1)] for r in rs if round(r["T"], 1) in WALL_REF]
            if d:
                line += f"; against the wall's envelope K: mean {sum(d) / len(d):+.2f}, range {min(d):+.2f} to {max(d):+.2f}"
        print(line)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 6.0))
    fig.patch.set_facecolor("#fcfcfb"); ax.set_facecolor("#fcfcfb")
    Ts = sorted(WALL_REF)
    ax.plot(Ts, [WALL_REF[t] for t in Ts], "-", color="#52514e", lw=1.6, zorder=2,
            label="the wall's K, envelope of every column")
    for name, st in STYLE.items():
        rs = [r for r in rows if r["series"] == name]
        if not rs:
            continue
        seen = {}
        xs = []
        for r in rs:
            k = (round(r["T"], 2), round(r["K"], 2))
            seen[k] = seen.get(k, 0) + 1
            xs.append(r["T"] + 0.03 * (seen[k] - 1))
        ax.scatter(xs, [r["K"] for r in rs], s=70, color=st["color"], marker=st["marker"],
                   edgecolor="white", zorder=5, label=f"{st['label']} (n={len(rs)})")
    ax.set_xlabel("period T (s)")
    ax.set_ylabel(r"$K = (a_{max} - a_{min}) / (a_{max} + a_{min})$")
    ax.set_title("WV-3 · reflection off a steep sea wall and a gentle beach, scanned on the flat", fontsize=12)
    ax.set_xlim(1.5, 4.5); ax.set_ylim(0, 1)
    ax.grid(alpha=0.3); ax.legend(fontsize=8.5, loc="upper left", frameon=False)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.savefig(args.out, dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
