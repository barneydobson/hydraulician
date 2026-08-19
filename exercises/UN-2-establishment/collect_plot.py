#!/usr/bin/env python3
"""UN-2 - Flow establishment: pool a class CSV and plot t75 vs l*umax/(2gH).

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Expected CSV columns (header row required, extra columns ignored):
    student_id, digit, level_m, H_m, l_m, umax_ms, t75_s[, k]

H_m is the reservoir level read off its marker WHILE THE PIPE FLOWS, minus
the pipe axis at 2.4 m (the sponge concedes a few centimetres under draw, so
the flowing level is the head the column actually sees). l_m is the pipe
length, mouth to orifice: 23.0 m for the estab scene at its shipped geometry.

The theory (inertia-head derivation):
    u_max = sqrt(2 g H / k)
    t75   = (l * u_max / (2 g H)) * ln(7)       [ln7 = 1.9459, 75% of u_max]

so plotting t75 against x = l*umax/(2gH) should trace a line through the
origin of slope ln(7), regardless of what k turns out to be per row - this
tests the ODE's functional form, not any particular loss coefficient. t75 is
read on the steep flank of the rise, where the crossing is sharp; t90 sits in
the slow tail and reads late (measured - see _archive/README-full.md).
"""
import csv
import math
import sys
import argparse

G = 9.81
LN7 = math.log(7)


def load(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                d = int(r["digit"])
                H = float(r["H_m"])
                l = float(r["l_m"])
                umax = float(r["umax_ms"])
                t75 = float(r["t75_s"])
            except (KeyError, ValueError):
                continue
            if H <= 0 or umax <= 0 or t75 <= 0:
                continue
            k = float(r["k"]) if r.get("k") not in (None, "") else 2 * G * H / umax ** 2
            rows.append({"digit": d, "H": H, "l": l, "umax": umax, "t75": t75, "k": k,
                         "source": r.get("source", "")})
    return rows


def fit_through_origin(xs, ys):
    sxy = sum(x * y for x, y in zip(xs, ys))
    sxx = sum(x * x for x in xs)
    slope = sxy / sxx
    ss_res = sum((y - slope * x) ** 2 for x, y in zip(xs, ys))
    ss_yy = sum(y * y for y in ys)
    r2 = 1 - ss_res / ss_yy if ss_yy > 0 else float("nan")
    n = len(xs)
    se = math.sqrt((ss_res / max(n - 1, 1)) / sxx) if sxx > 0 else float("nan")
    return slope, se, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = load(a.csv)
    if not rows:
        print("no usable rows in %s" % a.csv)
        sys.exit(1)
    rows.sort(key=lambda r: r["digit"])

    xs = [r["l"] * r["umax"] / (2 * G * r["H"]) for r in rows]
    ys = [r["t75"] for r in rows]
    slope, se, r2 = fit_through_origin(xs, ys)
    ks = [r["k"] for r in rows]
    kmean = sum(ks) / len(ks)
    kspread = (max(ks) - min(ks)) / kmean * 100

    print("n = %d" % len(rows))
    print("fitted   t75 = %.4f * [l*umax/(2gH)]   (forced through the origin)" % slope)
    print("         slope s.e. %.4f    R2 = %.4f" % (se, r2))
    print("theory   t75 = ln(7) * [l*umax/(2gH)] = %.4f * [...]" % LN7)
    print("         measured/theory = %.3f  (%.0f%% of ln7)" % (slope / LN7, 100 * slope / LN7))
    print()
    print("k = 2gH/umax^2 :  min %.1f  max %.1f  mean %.1f  spread %.1f%% of mean" %
          (min(ks), max(ks), kmean, kspread))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6.4, 7.2), height_ratios=[2.6, 1],
                                    sharex=False)

    ax1.scatter(xs, ys, c="#2e86de", s=46, zorder=3, label="class (measured)")
    for r, x in zip(rows, xs):
        ax1.annotate(str(r["digit"]), (x, r["t75"]), textcoords="offset points",
                     xytext=(5, 4), fontsize=8, color="#555")
    xmax = max(xs) * 1.15
    xx = [0, xmax]
    ax1.plot(xx, [slope * x for x in xx], "-", c="#2e86de", lw=1.6,
              label="fitted slope %.3f (R2=%.3f)" % (slope, r2))
    ax1.plot(xx, [LN7 * x for x in xx], "--", c="#c0392b", lw=1.4,
              label="theory: ln7 = %.3f" % LN7)
    ax1.set_xlabel(r"$l \cdot u_{max} / (2gH)$  (s)")
    ax1.set_ylabel(r"$t_{75}$  (s)")
    ax1.set_title("UN-2 - flow establishment: t75 vs l*umax/(2gH)")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(alpha=0.25)

    ax2.scatter([r["digit"] for r in rows], ks, c="#27ae60", s=40)
    ax2.axhline(kmean, color="#27ae60", ls="--", lw=1, alpha=0.7)
    ax2.set_xlabel("digit d")
    ax2.set_ylabel(r"$k = 2gH/u_{max}^2$")
    ax2.set_title("loss coefficient k per digit (mean %.1f, spread %.0f%%)" % (kmean, kspread))
    ax2.grid(alpha=0.25)

    fig.tight_layout()
    fig.savefig(a.out, dpi=150)
    print("\nwrote", a.out)


if __name__ == "__main__":
    main()
