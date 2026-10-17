#!/usr/bin/env python3
"""LL-1 · pool a class CSV into the Borda-Carnot loss plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (Blackboard export, header row required, order free):
    student, digit, level_m, V1_ms, V2_ms, H1_m, H2_m, hL_m, bordaCarnot_m

`hL_m` is the student's own measured head loss:
    hL = (V1^2 - V2^2)/2g - (H2 - H1)
i.e. the ideal (frictionless Bernoulli) pressure recovery minus what the
gauges actually show recovering. `bordaCarnot_m` is the textbook prediction
(V1-V2)^2/2g they compare it against. If a row omits hL_m/bordaCarnot_m but
carries V1/V2/H1/H2, this script derives them, so a raw Blackboard export
(V1, V2, H1, H2 only) still works.

The payoff plot is measured hL against the Borda-Carnot prediction, with the
1:1 line: if the theory holds, the class's cloud hugs that line. The fitted
loss coefficient k_L = hL / (V1^2/2g) is annotated and compared with the
geometric prediction (1 - A1/A2)^2 for this rig's step (b1 -> b2).

matplotlib only - no numpy, no pandas.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
B1 = 0.3913      # m, upstream (narrow) bore - 18 cells at Medium
B2 = 0.8043      # m, downstream (expanded) bore - 37 cells at Medium
KL_GEOM = (1 - B1 / B2) ** 2
LEVEL_BASE, LEVEL_STEP = 3.45, 0.035


def read(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
            try:
                V1 = float(r["V1_ms"]); V2 = float(r["V2_ms"])
            except (KeyError, ValueError):
                print("  skipped unreadable row (no V1/V2):", r, file=sys.stderr)
                continue
            borda = r.get("bordaCarnot_m")
            borda = float(borda) if borda not in (None, "") else (V1 - V2) ** 2 / (2 * G)
            hL = r.get("hL_m")
            if hL not in (None, ""):
                hL = float(hL)
            else:
                try:
                    H1 = float(r["H1_m"]); H2 = float(r["H2_m"])
                    hL = (V1 ** 2 - V2 ** 2) / (2 * G) - (H2 - H1)
                except (KeyError, ValueError):
                    print("  skipped row (no hL_m and no H1/H2 to derive it):", r, file=sys.stderr)
                    continue
            if hL <= 0 or borda <= 0:
                print("  skipped non-positive row:", r, file=sys.stderr)
                continue
            d = r.get("digit")
            lvl = r.get("level_m")
            rows.append(dict(student=r.get("student", "?"), V1=V1, V2=V2, hL=hL, borda=borda,
                             digit=int(d) if d not in (None, "") else None,
                             level=float(lvl) if lvl not in (None, "") else None))
    return rows


def ols_through_origin(xs, ys):
    sxy = sum(x * y for x, y in zip(xs, ys))
    sxx = sum(x * x for x in xs)
    m = sxy / sxx
    ss = sum((y - m * x) ** 2 for x, y in zip(xs, ys))
    st = sum(y * y for y in ys)          # about the origin, consistent with a forced-origin fit
    r2 = 1 - ss / st if st else float("nan")
    return m, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read(a.csv)
    if len(rows) < 3:
        sys.exit("need at least 3 usable rows, got %d" % len(rows))

    for r in rows:                      # spot-check the personalised parameter
        if r["digit"] is not None and r["level"] is not None:
            want = LEVEL_BASE + LEVEL_STEP * r["digit"]
            if abs(want - r["level"]) > 0.01:
                print("  ! %s: digit %d wants level %.3f, submitted %.3f"
                      % (r["student"], r["digit"], want, r["level"]), file=sys.stderr)

    X = [r["borda"] for r in rows]       # (V1-V2)^2/2g, the Borda-Carnot prediction
    Y = [r["hL"] for r in rows]          # measured hL

    # 1:1 line fit quality (does measured track predicted?)
    ss1 = sum((y - x) ** 2 for x, y in zip(X, Y))
    st = sum((y - sum(Y) / len(Y)) ** 2 for y in Y)
    r2_11 = 1 - ss1 / st if st else float("nan")
    ratio = sum(Y) / sum(X)              # mean(measured)/mean(predicted)

    kLs = [r["hL"] / (r["V1"] ** 2 / (2 * G)) for r in rows]
    kL_mean = sum(kLs) / len(kLs)
    m_fit, r2_fit = ols_through_origin(X, Y)

    print("n = %d" % len(rows))
    print("mean measured hL / mean Borda-Carnot prediction = %.3f  (1.00 = perfect agreement)" % ratio)
    print("hL = m * (V1-V2)^2/2g  through the origin: m = %.3f   R2 = %.4f" % (m_fit, r2_fit))
    print("k_L (= hL / (V1^2/2g)), class mean = %.4f  (range %.4f - %.4f)"
          % (kL_mean, min(kLs), max(kLs)))
    print("k_L geometric, (1 - b1/b2)^2 with b1=%.4f b2=%.4f : %.4f" % (B1, B2, KL_GEOM))

    fig, ax = plt.subplots(figsize=(7.4, 6.2))
    cs = [r["digit"] if r["digit"] is not None else 0 for r in rows]
    sc = ax.scatter(X, Y, c=cs, cmap="viridis", s=72, zorder=3, edgecolor="k", linewidth=.5)
    lim = max(max(X), max(Y)) * 1.18
    ax.plot([0, lim], [0, lim], "-", color="#555", lw=1.4, zorder=1, label="1:1 line (theory)")
    ax.plot([0, lim], [0, m_fit * lim], "--", color="#c1272d", lw=2, zorder=2,
            label="fit through origin: $h_L = %.2f \\times (V_1-V_2)^2/2g$" % m_fit)
    ax.set_xlim(0, lim); ax.set_ylim(0, lim)
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel(r"Borda-Carnot prediction   $(V_1-V_2)^2/2g$   (m)")
    ax.set_ylabel(r"measured head loss   $h_L$   (m)")
    ax.set_title("LL-1 · Borda-Carnot at a sudden expansion\n"
                 "RIG-A step %.3f m -> %.3f m, %d runs" % (B1, B2, len(rows)), fontsize=11)
    ax.grid(True, alpha=.25)
    ax.legend(loc="upper left", fontsize=9, framealpha=.95)
    cb = fig.colorbar(sc, ax=ax, pad=.02); cb.set_label("last digit of student number")
    ax.text(.97, .04,
            "$k_L$ (measured, class mean) = %.3f\n$k_L = (1-A_1/A_2)^2$ (geometric) = %.3f"
            % (kL_mean, KL_GEOM),
            transform=ax.transAxes, ha="right", va="bottom", fontsize=9,
            bbox=dict(fc="w", ec="#bbb", alpha=.9))
    fig.tight_layout()
    fig.savefig(a.out, dpi=140)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
