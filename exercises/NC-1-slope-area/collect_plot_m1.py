#!/usr/bin/env python3
"""collect_plot_m1.py -- NC-1 "Slope-area method: estimate the mystery discharge"
(ORIGINAL m1 rig, preserved for the teaching contrast -- see README Appendix A
"Why not m1". The live demo now runs on m3; see collect_plot.py.)

Pools a class CSV of two-gauge + cursor slope-area readings on the m1 scene
(the same M1 backwater weir pool GV-1 digitises) and plots the class's
estimated discharge Q-hat against where their 8 m gauge window sat along the
reach, against the true (concealed) q. Matplotlib only (Agg backend), no
numpy/pandas -- matches the other exercises/*/collect_plot.py scripts in
this repo.

Usage:
    python3 collect_plot_m1.py data/simulated-class-m1.csv -o plots/pooled-demo-m1.png

CSV columns (extra columns ignored): student,digit,x0,x1,xmid,L,z0,z1,F_mm,
h0,hm,h1,n_mid,n_lo,n_hi,K,Qhat1,hv0_mm,hv1_mm,Fe_mm,Qhat2,trueQ,source

Only x0, x1 (or xmid), F_mm (or z0/z1), h0, h1 (or hm), n_mid and trueQ are
required -- Qhat1/Qhat2 are recomputed here from first principles (K = h^(5/3)/n,
Q1 = K*sqrt(F/L), one N10 velocity-head iteration) rather than trusted
blindly, exactly as a lecturer spot-checking a submission would do.
A blank Qhat1/Qhat2 (F_mm <= 0) is plotted as an explicit "undefined" marker,
not dropped -- that IS one of the two things this demo has to say.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
READABLE_MM = 5.0   # the crux's own "readable fall" floor for an 8 m window


def recompute(row):
    """Recompute Qhat1/Qhat2 from the raw readings, the way a lecturer
    spot-checking a submission would -- never trust the submitted derived
    number blindly."""
    F = row["F_mm"] / 1000.0
    L = row["L"]
    h0, hm, h1 = row["h0"], row["hm"], row["h1"]
    n = row["n_mid"]
    K = (hm ** (5.0 / 3.0)) / n
    if F <= 0:
        return K, None, None, None
    Q1 = K * math.sqrt(F / L)
    V0, V1 = Q1 / h0, Q1 / h1
    hv0, hv1 = V0 * V0 / (2 * G), V1 * V1 / (2 * G)
    Fe = F + (hv0 - hv1)
    Q2 = K * math.sqrt(Fe / L) if Fe > 0 else None
    return K, Q1, Fe * 1000.0, Q2


def load_class(path):
    rows = []
    with open(path, newline="") as fh:
        r = csv.DictReader(fh)
        for row in r:
            def f(key, default=None):
                v = row.get(key, "")
                return float(v) if v not in (None, "") else default
            x0, x1 = f("x0"), f("x1")
            xmid = f("xmid", (x0 + x1) / 2.0 if x0 is not None and x1 is not None else None)
            L = f("L", (x1 - x0) if x0 is not None and x1 is not None else None)
            F_mm = f("F_mm")
            if F_mm is None and f("z0") is not None and f("z1") is not None:
                F_mm = (f("z0") - f("z1")) * 1000.0
            rows.append({
                "student": row.get("student", "?"), "digit": row.get("digit", "?"),
                "x0": x0, "x1": x1, "xmid": xmid, "L": L, "F_mm": F_mm,
                "h0": f("h0"), "hm": f("hm"), "h1": f("h1"),
                "n_mid": f("n_mid"), "n_lo": f("n_lo"), "n_hi": f("n_hi"),
                "trueQ": f("trueQ"), "source": row.get("source", "?"),
            })
    rows.sort(key=lambda r: r["xmid"])
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path", nargs="?", default="data/simulated-class-m1.csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo-m1.png")
    args = ap.parse_args()

    rows = load_class(args.csv_path)
    if not rows:
        print("no rows in %s" % args.csv_path, file=sys.stderr)
        sys.exit(1)
    trueQ = rows[0]["trueQ"]

    valid, invalid = [], []
    for r in rows:
        K, Q1, Fe_mm, Q2 = recompute(r)
        r["K"], r["Qhat1"], r["Fe_mm"], r["Qhat2"] = K, Q1, Fe_mm, Q2
        (valid if Q2 is not None else invalid).append(r)

    print("NC-1 pooled class: %d windows (8 m, digit -> window position along the reach)"
          % len(rows))
    print("true q (concealed until reveal) = %.3f m^2/s" % trueQ)
    print("fall F over the window: range %.2f to %.2f mm (readability floor ~%.0f-%.0f mm)"
          % (min(r["F_mm"] for r in rows), max(r["F_mm"] for r in rows), READABLE_MM, 2 * READABLE_MM))
    print("%d/%d windows (%.0f%%) returned an UNPHYSICAL fall (F <= 0, downstream gauge reads"
          " higher than upstream) -- no Qhat is computable for those" % (
              len(invalid), len(rows), 100.0 * len(invalid) / len(rows)))
    if valid:
        errs1 = [(r["Qhat1"] - trueQ) / trueQ * 100 for r in valid]
        errs2 = [(r["Qhat2"] - trueQ) / trueQ * 100 for r in valid]
        mean1, mean2 = sum(errs1) / len(errs1), sum(errs2) / len(errs2)
        print("of the %d valid windows:" % len(valid))
        print("  Qhat1 (raw fall, no correction):    mean error %+.1f%%  range %+.1f%% .. %+.1f%%"
              % (mean1, min(errs1), max(errs1)))
        print("  Qhat2 (one N10 velocity-head pass):  mean error %+.1f%%  range %+.1f%% .. %+.1f%%"
              % (mean2, min(errs2), max(errs2)))
        shift = [(r["Qhat2"] - r["Qhat1"]) / r["Qhat1"] * 100 for r in valid]
        print("  N10 correction moved Qhat by %+.0f%% to %+.0f%% (mean %+.0f%%) -- NOT small here,"
              " because the velocity-head term is comparable in size to F itself"
              % (min(shift), max(shift), sum(shift) / len(shift)))
        print("  every valid Qhat2, corrected or not, UNDERESTIMATES true q -- a consistent bias,"
              " not scatter around it")
    for r in rows:
        tag = "Qhat2=%.4f (%+.0f%%)" % (r["Qhat2"], (r["Qhat2"] - trueQ) / trueQ * 100) \
            if r["Qhat2"] is not None else "UNDEFINED (F<=0)"
        print("  d=%s  window [%.1f, %.1f] m  F=%+6.2f mm  n=%.3f  %s"
              % (r["digit"], r["x0"], r["x1"], r["F_mm"], r["n_mid"], tag))

    # ------------------------------------------------------------------ plot
    fig, (ax, axf) = plt.subplots(2, 1, figsize=(9, 6.8), dpi=140,
                                   gridspec_kw={"height_ratios": [2.2, 1]}, sharex=True)

    ax.axhspan(0, trueQ, color="#b23a3a", alpha=0.05, zorder=0)
    ax.axhline(trueQ, color="#c98a1c", lw=1.8, ls="--", zorder=2,
               label="true q = %.3f m$^2$/s (revealed after submission)" % trueQ)

    vx = [r["xmid"] for r in valid]
    vy1 = [r["Qhat1"] for r in valid]
    vy2 = [r["Qhat2"] for r in valid]
    for x, y1, y2 in zip(vx, vy1, vy2):
        ax.annotate("", xy=(x, y2), xytext=(x, y1),
                    arrowprops=dict(arrowstyle="->", color="#888", lw=0.9, alpha=0.7))
    ax.scatter(vx, vy1, s=34, marker="o", facecolors="none", edgecolors="#5588bb",
               zorder=4, label="Qˆ₁ raw fall (no correction)")
    ax.scatter(vx, vy2, s=60, marker="o", color="#1c8c4e", zorder=5,
               label="Qˆ₂ after one N10 velocity-head iteration")

    ix = [r["xmid"] for r in invalid]
    if ix:
        ax.scatter(ix, [0] * len(ix), s=90, marker="x", color="#b23a3a", zorder=6,
                   label="undefined (F ≤ 0)")

    for r in rows:
        y = r["Qhat2"] if r["Qhat2"] is not None else 0
        ax.annotate(str(r["digit"]), (r["xmid"], y), textcoords="offset points",
                    xytext=(0, 8), fontsize=7.5, ha="center", color="#555")

    ax.set_ylabel("estimated discharge Q̂ (m$^2$/s)")
    ax.set_title("NC-1 -- slope-area Q̂ vs 8 m gauge-window position on m1 (q concealed, n=%.3f–%.3f)"
                 % (min(r["n_mid"] for r in rows), max(r["n_mid"] for r in rows)))
    ax.set_ylim(-0.02, trueQ * 1.25)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.9)
    ax.grid(alpha=0.15)
    ax.text(0.01, 0.03, "entire modelled reach is backwater pool (S_f << S0) --\nno near-normal"
            " stretch exists for Q̂ to converge onto", transform=ax.transAxes,
            fontsize=8, color="#8a2f33", va="bottom")

    # --- lower panel: the raw fall F itself, and the readability floor
    fx = [r["xmid"] for r in rows]
    fy = [r["F_mm"] for r in rows]
    colors = ["#1c8c4e" if r["F_mm"] > 0 else "#b23a3a" for r in rows]
    axf.axhspan(READABLE_MM, 40, color="#1c8c4e", alpha=0.06, zorder=0)
    axf.axhline(READABLE_MM, color="#1c8c4e", lw=1, ls=":", alpha=0.7)
    axf.axhline(0, color="#888", lw=0.8)
    axf.bar(fx, fy, width=0.25, color=colors, alpha=0.85, zorder=3)
    axf.text(fx[0], READABLE_MM + 1, "~5 mm readability floor", fontsize=7.5, color="#1c6b3d")
    axf.set_xlabel("window midpoint x (m)  [window = [x₀, x₀+8] m, digit d → x₀ = 1.0 + 0.5·(d mod 8)]")
    axf.set_ylabel("raw fall F (mm)")
    axf.set_ylim(min(fy) - 2, max(READABLE_MM, max(fy)) + 3)
    axf.grid(alpha=0.15)

    fig.tight_layout()
    fig.savefig(args.out)
    print("wrote %s" % args.out)


if __name__ == "__main__":
    main()
