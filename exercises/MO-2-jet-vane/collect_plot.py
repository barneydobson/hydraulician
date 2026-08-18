#!/usr/bin/env python3
"""
MO-2 - Jet on a plate, jet on a vane
Pools the OPTIONAL submission (stagnation-head ratio = measured stagnation
head / v^2/2g) and plots a histogram against the ideal value of 1.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Required column: ratio  (ratio = stagnation_head_m / v2_2g_m)
If `ratio` is absent but `stagnation_head_m` and `v2_2g_m` are both present,
the ratio is derived. Extra columns are ignored.

There is no personalised parameter for this demo (HP-2/MO-2 spec) -- every
"student" reads the SAME jet-on-flat-plate rig, so the spread in the pooled
plot is read-to-read wobble (turbulence + station choice), not a swept
variable. The data shipped in data/simulated-class.csv is SIMULATED (see its
own header comment / the README) around the Director's own measured ratio
(1.17-1.30 across two independent methods on this rig) -- it is deliberately
NOT centred on 1.0, because centring simulated data on the answer you expect
would misrepresent what this rig actually reads. The known bias is annotated
on the plot rather than hidden.
"""
import csv
import sys
import argparse
import statistics as st

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def load_rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def get_ratio(row):
    if row.get("ratio") not in (None, ""):
        return float(row["ratio"])
    h = row.get("stagnation_head_m")
    v2 = row.get("v2_2g_m")
    if h not in (None, "") and v2 not in (None, "") and float(v2) != 0:
        return float(h) / float(v2)
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv", help="class CSV (see data/simulated-class.csv)")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_rows(args.csv)
    ratios = [get_ratio(r) for r in rows]
    ratios = [r for r in ratios if r is not None]
    if not ratios:
        sys.exit("No usable 'ratio' (or stagnation_head_m/v2_2g_m pair) found in " + args.csv)

    n = len(ratios)
    mean = st.mean(ratios)
    sd = st.pstdev(ratios) if n > 1 else 0.0
    lo, hi = min(ratios), max(ratios)
    bias_pct = 100.0 * (mean - 1.0)

    print(f"MO-2 stagnation-ratio points: {n}")
    print(f"ratio range: {lo:.3f} - {hi:.3f}")
    print(f"mean {mean:.3f}  (bias {bias_pct:+.1f}% vs the ideal 1.00)  sd {sd:.3f}")

    fig, ax = plt.subplots(figsize=(7.2, 5.4), dpi=140)
    bins = max(5, min(10, n))
    ax.hist(ratios, bins=bins, range=(0.9, 1.5), color="#5aa9e6", edgecolor="#1b2733",
             alpha=0.9, label=f"class reads (n={n})")
    ax.axvline(1.0, color="#888888", linestyle="--", linewidth=1.5,
                label="ideal: stagnation head = v²/2g")
    ax.axvline(mean, color="#e67e22", linestyle="-", linewidth=2,
                label=f"class mean {mean:.2f} ({bias_pct:+.0f}%)")

    ax.set_xlabel("stagnation head ÷ v²/2g")
    ax.set_ylabel("number of reads")
    ax.set_title("MO-2 · stagnation-head ratio (optional submission)")
    ax.legend(loc="upper left", fontsize=9)
    fig.subplots_adjust(bottom=0.30)
    fig.text(0.5, 0.03,
             "Known bias: reads HIGH, not scattered around 1 — the jet keeps accelerating under gravity\n"
             "over its last ~0.3 m of flight, and the solver's compressible EOS adds a small M²-ish term\n"
             "at v/c ≈ 0.2 near the wall. Both push the same way. See the exercise README for the recipe.",
             ha="center", va="bottom", fontsize=8.5, color="#444444")
    fig.savefig(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
