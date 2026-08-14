#!/usr/bin/env python3
"""QS-2 · Two reservoirs finding a level — pool the class CSV.

    python3 collect_plot.py data/simulated-class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, header row required, extra columns ignored):

    student,digit,A2_m,dh0_m,thalf_s
    12345678,4,1.50,1.50,17.98

Only `A2_m` and `thalf_s` are needed; `dh0_m` (the level difference the
student actually released from) is optional and defaults to 1.50 m.

The payoff: plotting t_1/2 against the EQUIVALENT AREA

    A* = A1 A2 / (A1 + A2)          A1 = 1.978 m (the fixed tank, as built)

collapses the class onto a straight line through the origin, because the
mass balance for two tanks joined by one resistance is

    A1 dh1/dt = -Q,  A2 dh2/dt = +Q,  Q = Cd a sqrt(2 g dh)
    =>  d(dh)/dt = -(Cd a sqrt(2g) / A*) sqrt(dh)
    =>  t_1/2 = [ 2 (1 - 1/sqrt2) sqrt(dh0) / (Cd a sqrt(2g)) ] * A*

so the fitted slope hands back the pipe's effective  Cd*a  directly:

    Cd a = 2 (1 - 1/sqrt2) sqrt(dh0) / (slope * sqrt(2 g))
"""
import argparse
import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

A1 = 1.978          # tank 1 as delivered at Medium (2.00 m drawn, 91 cells)
GAP = 0.0435        # drawn pipe height: 2 cells at dx = 21.7 mm
G = 9.81


def astar(a2, a1=A1):
    return a1 * a2 / (a1 + a2)


def fit(x, y, through_origin=False):
    """Least squares. Returns (slope, intercept, r2)."""
    n = len(x)
    if through_origin:
        m = sum(a * b for a, b in zip(x, y)) / sum(a * a for a in x)
        c = 0.0
    else:
        mx, my = sum(x) / n, sum(y) / n
        sxx = sum((a - mx) ** 2 for a in x)
        sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
        m = sxy / sxx
        c = my - m * mx
    ybar = sum(y) / n
    ss_res = sum((b - (m * a + c)) ** 2 for a, b in zip(x, y))
    ss_tot = sum((b - ybar) ** 2 for b in y)
    return m, c, 1.0 - ss_res / ss_tot


def cda_from_slope(slope, dh0=1.50):
    return 2.0 * (1.0 - 1.0 / math.sqrt(2.0)) * math.sqrt(dh0) / (slope * math.sqrt(2 * G))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = []
    with open(args.csv, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                a2 = float(r["A2_m"])
                th = float(r["thalf_s"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (0.3 <= a2 <= 3.5 and 1.0 <= th <= 120.0):
                print("  dropped (out of range): %s" % r)
                continue
            dh0 = 1.50
            try:
                dh0 = float(r.get("dh0_m") or 1.50)
            except ValueError:
                pass
            rows.append((r.get("student", "?"), a2, dh0, th))

    if len(rows) < 3:
        raise SystemExit("need at least 3 usable rows, got %d" % len(rows))

    xs = [astar(a2) for _, a2, _, _ in rows]
    ys = [th for _, _, _, th in rows]
    # t_1/2 scales as sqrt(dh0): normalise every submission to a common 1.50 m
    # release so a student who let the fill drift does not tilt the line.
    yn = [th * math.sqrt(1.50 / dh0) for _, _, dh0, th in rows]

    m, c, r2 = fit(xs, ys)
    m0, _, r20 = fit(xs, yn, through_origin=True)
    cda = cda_from_slope(m0)

    print("n = %d" % len(rows))
    print("free fit    t_half = %.2f A* %+.2f   R2 = %.4f" % (m, c, r2))
    print("origin fit  t_half = %.2f A*         R2 = %.4f  (dh0-normalised)" % (m0, r20))
    print("Cd*a  = %.5f m   (drawn gap a = %.4f m  ->  Cd = %.3f)"
          % (cda, GAP, cda / GAP))

    fig, ax = plt.subplots(1, 2, figsize=(11, 4.6))

    # ---- left: the raw submission, t_1/2 against tank-2 width (a curve)
    ax[0].plot([a2 for _, a2, _, _ in rows], ys, "o", color="#7fd4ff", ms=7,
               mec="#0c111a", label="class submissions")
    ax[0].set_xlabel("tank 2 width  $A_2$  (m)")
    ax[0].set_ylabel("$t_{1/2}$  (s)")
    ax[0].set_title("What you submitted: $t_{1/2}$ vs $A_2$ — bends over")
    ax[0].grid(alpha=0.25)
    ax[0].legend(loc="lower right", fontsize=8)

    # ---- right: the same points against the equivalent area (a line)
    xf = [0.0, max(xs) * 1.08]
    ax[1].plot(xf, [m0 * v for v in xf], "-", color="#ffd479", lw=1.6,
               label="fit through origin: $t_{1/2} = %.1f\\,A^*$  ($R^2=%.4f$)" % (m0, r20))
    ax[1].plot(xs, yn, "o", color="#7fd4ff", ms=7, mec="#0c111a",
               label="class, normalised to $\\Delta h_0 = 1.50$ m")
    ax[1].set_xlabel(r"equivalent area  $A^* = A_1A_2/(A_1+A_2)$  (m)")
    ax[1].set_ylabel("$t_{1/2}$  (s)")
    ax[1].set_title("Replotted against $A^*$ — one straight line (Q8)")
    ax[1].set_xlim(0, xf[1])
    ax[1].set_ylim(0, max(yn) * 1.12)
    ax[1].grid(alpha=0.25)
    ax[1].legend(loc="upper left", fontsize=8)
    ax[1].text(0.98, 0.05,
               "slope $\\Rightarrow C_d a = %.4f$ m\ndrawn gap $a = %.4f$ m"
               "  $\\Rightarrow C_d = %.2f$" % (cda, GAP, cda / GAP),
               transform=ax[1].transAxes, ha="right", va="bottom", fontsize=8,
               bbox=dict(fc="#eef4fa", ec="#b8c6d4"))

    fig.suptitle("QS-2 · two reservoirs finding a level — %d runs" % len(rows))
    fig.tight_layout()
    out = args.out
    if os.path.dirname(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=130)
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
