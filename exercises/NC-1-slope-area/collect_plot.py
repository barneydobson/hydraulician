#!/usr/bin/env python3
"""collect_plot.py -- NC-1 "Slope-area method: estimate the mystery discharge"
(NC-1b rescue: ?scene=m3, replacing the m1 rig -- see README "Why not m1")

Pools a class CSV of two-gauge + cursor slope-area readings taken on the m3
scene (chute -> hydraulic jump -> M2 apron) and plots the class's estimated
discharge Q-hat against where their 7 m gauge window sat along the apron,
against the true (concealed) q. Matplotlib only (Agg backend), no
numpy/pandas -- matches the other exercises/*/collect_plot.py scripts in
this repo.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

CSV columns (extra columns ignored): student,digit,x0,x1,xmid,L,z0,z1,F_mm,
h0,hm,h1,n_mid,n_lo,n_hi,K,Qhat1,hv0_mm,hv1_mm,Fe_mm,Qhat2,trueQ,source

Only x0, x1 (or xmid), F_mm (or z0/z1), h0, h1 (or hm), n_mid and trueQ are
required -- Qhat1/Qhat2 are recomputed here from first principles (K = h^(5/3)/n,
Q1 = K*sqrt(F/L), one N10 velocity-head iteration) rather than trusted
blindly, exactly as a lecturer spot-checking a submission would do.
A blank Qhat1/Qhat2 (F_mm <= 0) is plotted as an explicit "undefined" marker,
not dropped -- unlike the rejected m1 rig, no window in the shipped digit
rule actually produces one, but the plumbing is kept because a real class
(unlike this simulated one) may still hand in a noisy outlier.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
READABLE_MM = 10.0   # the go/no-go floor used to clear m3 (see README Sec. "Verify first")
M1_BEST_F_MM = 3.24  # m1's best fall EVER measured, any window length, anywhere in its domain
                      # (README Appendix A.5.1's length sweep) -- the most generous possible
                      # comparison point for "how much bigger is F on m3"

# Windows measured-and-rejected during calibration (README "Robustness"),
# NOT part of the class/pooled statistics -- drawn only as a faded reference
# showing why the digit rule starts at x0=5.0, not further upstream.
TRIMMED = [
    {"label": "x0=4.0 (chute toe, rejected)", "xmid": 7.5, "Qhat2": 0.0930, "F_mm": 14.09},
    {"label": "x0=4.5 (jump wake, rejected)", "xmid": 8.0, "Qhat2": 0.1944, "F_mm": 71.59},
]


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
    ap.add_argument("csv_path", nargs="?", default="data/simulated-class.csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
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

    print("NC-1b pooled class: %d windows (7 m, digit -> window position along m3's apron)"
          % len(rows))
    print("true q (concealed until reveal) = %.3f m^2/s" % trueQ)
    print("fall F over the window: range %.1f to %.1f mm (go/no-go floor was ~%.0f mm; m1's"
          " best window managed only 1.2 mm)"
          % (min(r["F_mm"] for r in rows), max(r["F_mm"] for r in rows), READABLE_MM))
    print("%d/%d windows (%.0f%%) returned an UNPHYSICAL fall (F <= 0) -- contrast m1, where"
          " 50%% did" % (len(invalid), len(rows), 100.0 * len(invalid) / max(1, len(rows))))
    if valid:
        errs1 = [(r["Qhat1"] - trueQ) / trueQ * 100 for r in valid]
        errs2 = [(r["Qhat2"] - trueQ) / trueQ * 100 for r in valid]
        mean1, mean2 = sum(errs1) / len(errs1), sum(errs2) / len(errs2)
        print("of the %d valid windows (8 distinct positions, 2 digit-repeats):" % len(valid))
        print("  Qhat1 (raw fall, no correction):    mean error %+.1f%%  range %+.1f%% .. %+.1f%%"
              % (mean1, min(errs1), max(errs1)))
        print("  Qhat2 (one N10 velocity-head pass):  mean error %+.1f%%  range %+.1f%% .. %+.1f%%"
              % (mean2, min(errs2), max(errs2)))
        shift = [(r["Qhat2"] - r["Qhat1"]) / r["Qhat1"] * 100 for r in valid]
        fvals = [r["F_mm"] for r in valid]
        print("  N10 correction moved Qhat by %+.1f%% to %+.1f%% (mean %+.1f%%) -- a modest"
              " tidy-up here (contrast m1's +25%%..+43%%), because F itself is %.0f-%.0fx bigger"
              " than the best fall m1 ever produced (any window length, anywhere in its domain:"
              " %.2f mm) so the mm-scale velocity-head term no longer dominates it"
              % (min(shift), max(shift), sum(shift) / len(shift),
                 min(fvals) / M1_BEST_F_MM, max(fvals) / M1_BEST_F_MM, M1_BEST_F_MM))
        best = min(valid, key=lambda r: abs((r["Qhat2"] - trueQ) / trueQ))
        worst = max(valid, key=lambda r: abs((r["Qhat2"] - trueQ) / trueQ))
        print("  best window:  d=%s  x0=%.1f m  error %+.1f%%" % (
            best["digit"], best["x0"], (best["Qhat2"] - trueQ) / trueQ * 100))
        print("  worst window: d=%s  x0=%.1f m  error %+.1f%% (closest to the jump's wake)" % (
            worst["digit"], worst["x0"], (worst["Qhat2"] - trueQ) / trueQ * 100))
        within20 = sum(1 for e in errs2 if abs(e) <= 20.0)
        print("  %d/%d valid windows land within the programme's promised +/-20%%" % (within20, len(valid)))
    for r in rows:
        tag = "Qhat2=%.4f (%+.0f%%)" % (r["Qhat2"], (r["Qhat2"] - trueQ) / trueQ * 100) \
            if r["Qhat2"] is not None else "UNDEFINED (F<=0)"
        print("  d=%s  window [%.1f, %.1f] m  F=%+7.2f mm  n=%.3f  %s"
              % (r["digit"], r["x0"], r["x1"], r["F_mm"], r["n_mid"], tag))

    # ------------------------------------------------------------------ plot
    fig, (ax, axf) = plt.subplots(2, 1, figsize=(9, 6.8), dpi=140,
                                   gridspec_kw={"height_ratios": [2.2, 1]}, sharex=True)

    ax.axhline(trueQ, color="#c98a1c", lw=1.8, ls="--", zorder=2,
               label="true q = %.3f m$^2$/s (revealed after submission)" % trueQ)
    ax.axhspan(trueQ * 0.8, trueQ * 1.2, color="#1c8c4e", alpha=0.06, zorder=0,
               label="programme's promised ±20%")

    vx = [r["xmid"] for r in valid]
    vy1 = [r["Qhat1"] for r in valid]
    vy2 = [r["Qhat2"] for r in valid]
    for x, y1, y2 in zip(vx, vy1, vy2):
        ax.annotate("", xy=(x, y2), xytext=(x, y1),
                    arrowprops=dict(arrowstyle="->", color="#888", lw=0.9, alpha=0.7))
    ax.scatter(vx, vy1, s=34, marker="o", facecolors="none", edgecolors="#5588bb",
               zorder=4, label="Qˆ1 raw fall (no correction)")
    ax.scatter(vx, vy2, s=60, marker="o", color="#1c8c4e", zorder=5,
               label="Qˆ2 after one N10 velocity-head iteration")

    ix = [r["xmid"] for r in invalid]
    if ix:
        ax.scatter(ix, [0] * len(ix), s=90, marker="x", color="#b23a3a", zorder=6,
                   label="undefined (F ≤ 0)")

    tx = [t["xmid"] for t in TRIMMED]
    ty = [t["Qhat2"] for t in TRIMMED]
    ax.scatter(tx, ty, s=50, marker="v", facecolors="none", edgecolors="#b23a3a",
               zorder=4, label="trimmed from the rule (too close to the jump)")
    for t in TRIMMED:
        ax.annotate(t["label"], (t["xmid"], t["Qhat2"]), textcoords="offset points",
                    xytext=(6, -10), fontsize=7, color="#b23a3a", ha="left")

    for r in rows:
        y = r["Qhat2"] if r["Qhat2"] is not None else 0
        ax.annotate(str(r["digit"]), (r["xmid"], y), textcoords="offset points",
                    xytext=(0, 8), fontsize=7.5, ha="center", color="#555")

    ax.set_ylabel("estimated discharge Q̂ (m$^2$/s)")
    ax.set_title("NC-1b -- slope-area Q̂ vs 7 m gauge-window position on m3's apron"
                 " (q concealed, n=%.3f–%.3f)"
                 % (min(r["n_mid"] for r in rows), max(r["n_mid"] for r in rows)))
    ax.set_ylim(0.0, trueQ * 1.35)
    ax.set_xlim(6.5, 13.0)
    ax.legend(loc="lower right", fontsize=7.5, framealpha=0.9)
    ax.grid(alpha=0.15)
    for zx, zlabel in [(8.5, "jump's\nwake"), (9.9, "near-uniform sweet spot"),
                        (11.9, "drawdown\naccelerating")]:
        ax.text(zx, 0.335, zlabel, fontsize=7.5, color="#666", ha="center", va="top")

    # --- lower panel: the raw fall F itself, and the readability floor
    fx = [r["xmid"] for r in rows]
    fy = [r["F_mm"] for r in rows]
    colors = ["#1c8c4e" if r["F_mm"] > 0 else "#b23a3a" for r in rows]
    axf.axhspan(0, READABLE_MM, color="#b23a3a", alpha=0.06, zorder=0)
    axf.axhline(READABLE_MM, color="#1c8c4e", lw=1, ls=":", alpha=0.7)
    axf.axhline(0, color="#888", lw=0.8)
    axf.bar(fx, fy, width=0.15, color=colors, alpha=0.85, zorder=3)
    axf.text(fx[0], READABLE_MM + 4, "~10 mm go/no-go floor (m1 never reached it; every m3"
             " window clears it by 8-16x)", fontsize=7, color="#1c6b3d")
    axf.set_xlabel("window midpoint x (m)  [window = [x₀, x₀+7] m,"
                   " digit d → x₀ = 5.0 + 0.5·(d mod 8)]")
    axf.set_ylabel("fall F (mm)")
    axf.set_ylim(0, max(fy) + 15)
    axf.grid(alpha=0.15)

    fig.tight_layout()
    fig.savefig(args.out)
    print("wrote %s" % args.out)


if __name__ == "__main__":
    main()
