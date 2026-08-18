#!/usr/bin/env python3
"""B9 · Three reservoirs, one junction — pool the class CSV.

    python3 collect_plot.py data/simulated-class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, header row required, extra columns ignored):

    student,digit,zB0_m,Hjunction_early_m,qA,qC,qB,continuity,continuityPct
    12345678,4,1.61,1.08,0.200,0.124,0.049,0.027,7.3

Only `zB0_m` and `qB` are needed for the payoff plot; the others are used for
the continuity/verification panel if present.

The payoff: Q_B (branch B's own flow, +ve = B filling/customer, -ve = B
draining/supplier) plotted against z_B(0), the level the student released
from. The class's own points cross zero — the level at which reservoir B
flips from supplier to customer. Each student also submits their own
DIRECTLY-GAUGED junction head reading (Hjunction_early_m); the cluster of
those readings is a second, independent check on where the crossing "should"
be, and — this is the demo's honest twist, not a bug — the two do NOT
coincide exactly. See `_archive/README-full.md` for why: reading Q_B a few
seconds after opening the valve (needed so every student's run fits a lecture
slot) catches a real opening transient, so the pooled crossing sits above the
slow, fully-settled junction head (measured separately, ~1.68-1.70 m here).
The gap between "crossing you can measure in a few seconds" and "the number
the system settles to if you wait" is itself the teaching point.
"""
import argparse
import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# The settled (t ~ 15-40 s) junction head, measured directly with A, C at
# their class-wide fixed levels (3.20 m / 0.60 m nominal) and independent of
# which student's z_B(0) it was measured alongside (see the verification table
# in _archive/README-full.md) -- it converges to the same value regardless,
# because Q_B -> 0 once each run's own B has drained/filled to match it.
H_JUNCTION_SETTLED = 1.681


def fit(x, y):
    """Least squares straight line. Returns (slope, intercept, r2)."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    m = sxy / sxx
    c = my - m * mx
    ybar = sum(y) / n
    ss_res = sum((b - (m * a + c)) ** 2 for a, b in zip(x, y))
    ss_tot = sum((b - ybar) ** 2 for b in y)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return m, c, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = []
    with open(args.csv, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                zb = float(r["zB0_m"])
                qb = float(r["qB"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (0.5 <= zb <= 4.0 and -0.3 <= qb <= 0.3):
                print("  dropped (out of range): %s" % r)
                continue
            hj = None
            try:
                hj = float(r.get("Hjunction_early_m") or "")
            except ValueError:
                pass
            rows.append({
                "student": r.get("student", "?"), "digit": r.get("digit", "?"),
                "zb": zb, "qb": qb, "hj": hj,
            })

    if len(rows) < 3:
        raise SystemExit("need at least 3 usable rows, got %d" % len(rows))

    xs = [r["zb"] for r in rows]
    ys = [r["qb"] for r in rows]
    m, c, r2 = fit(xs, ys)
    x_cross = -c / m if m else float("nan")

    hjs = [r["hj"] for r in rows if r["hj"] is not None]
    hj_mean = sum(hjs) / len(hjs) if hjs else float("nan")

    print("n = %d" % len(rows))
    print("fit  Q_B = %.5f * z_B %+ .5f   (R2 = %.4f)" % (m, c, r2))
    print("pooled zero-crossing (early-window Q_B)   z_B* = %.3f m" % x_cross)
    print("class-submitted junction head, mean of n=%d      = %.3f m" % (len(hjs), hj_mean))
    print("settled (late-time) junction head, direct gauge  = %.3f m" % H_JUNCTION_SETTLED)
    print("early-window crossing vs settled junction head   = %+.1f%%"
          % (100.0 * (x_cross - H_JUNCTION_SETTLED) / H_JUNCTION_SETTLED))

    fig, ax = plt.subplots(1, 2, figsize=(11.5, 4.6))

    # ---- left: the payoff -- Q_B vs z_B(0), crossing zero
    xf = [min(xs) - 0.15, max(xs) + 0.15]
    ax[0].axhline(0, color="#7a8699", lw=1, ls=":")
    ax[0].plot(xf, [m * v + c for v in xf], "-", color="#ffd479", lw=1.6,
               label="class fit: $Q_B=%.4f\\,z_B %+.4f$  ($R^2=%.3f$)" % (m, c, r2))
    colours = ["#7fd4ff" if q >= 0 else "#ff8ea1" for q in ys]
    ax[0].scatter(xs, ys, s=55, c=colours, edgecolor="#0c111a", zorder=5,
                  label="class submissions")
    ax[0].axvline(x_cross, color="#ffd479", lw=1, ls="--")
    ax[0].axvline(H_JUNCTION_SETTLED, color="#8effa1", lw=1.4, ls="-",
                  label="settled junction head $H_J=%.2f$ m (direct gauge)" % H_JUNCTION_SETTLED)
    ax[0].annotate("pooled crossing\n$z_B^*=%.2f$ m" % x_cross,
                   xy=(x_cross, 0), xytext=(x_cross + 0.05, max(ys) * 0.55),
                   fontsize=8, color="#c9a227",
                   arrowprops=dict(arrowstyle="->", color="#c9a227", lw=0.9))
    ax[0].set_xlabel(r"$z_B(0)$ — B's level at the moment the valve opens (m)")
    ax[0].set_ylabel(r"$Q_B$ — early-window flow into B (m$^2$/s, +ve = filling)")
    ax[0].set_title("Supplier $\\to$ customer: $Q_B$ vs $z_B(0)$")
    ax[0].grid(alpha=0.25)
    ax[0].legend(loc="upper left", fontsize=7.5)

    # ---- right: continuity closure across the class, and the two head reads
    idx = list(range(len(rows)))
    conts = []
    for r in rows:
        conts.append(r.get("qb"))  # placeholder, replaced below if column present
    with open(args.csv, newline="") as fh:
        pct = []
        for rr in csv.DictReader(fh):
            try:
                pct.append(float(rr.get("continuityPct")))
            except (TypeError, ValueError):
                pass
    if pct:
        ax[1].bar(range(len(pct)), pct, color="#7fd4ff", edgecolor="#0c111a")
        ax[1].axhline(0, color="#0c111a", lw=0.8)
        ax[1].set_xlabel("student (digit order)")
        ax[1].set_ylabel(r"continuity closure  $100(q_A-q_C-q_B)/\Sigma|q|$  (%)")
        ax[1].set_title("Node law $\\Sigma Q=0$ at the junction, per student")
        ax[1].grid(alpha=0.25, axis="y")
    ax[1].text(0.02, 0.02,
               "class $H_J$ (own gauge, early window)\nmean %.2f m, n=%d\n\n"
               "settled $H_J$ (direct, late window)\n%.2f m\n\n"
               "$Q_B$ crossing vs settled $H_J$: %+.0f%%"
               % (hj_mean, len(hjs), H_JUNCTION_SETTLED,
                  100.0 * (x_cross - H_JUNCTION_SETTLED) / H_JUNCTION_SETTLED),
               transform=ax[1].transAxes, ha="left", va="bottom", fontsize=8,
               bbox=dict(fc="#eef4fa", ec="#b8c6d4"))

    fig.suptitle("B9 · three reservoirs, one junction — %d runs" % len(rows))
    fig.tight_layout()
    out = args.out
    if os.path.dirname(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=130)
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
