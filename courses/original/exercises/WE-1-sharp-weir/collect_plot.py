#!/usr/bin/env python3
"""WE-1 · pool a class CSV into the sharp-crested weir rating curve.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Input columns (extras ignored, order irrelevant):
    q        unit discharge set on the panel, m2/s per m width   [required]
    H        head over the crest, m  = gauge depth - P           [required]
    h_gauge  gauge depth, m   (used to derive H if H is missing)
    P        crest height above the bed, m (default 0.50)
    student, digit, level, source   carried through, not needed

Output: a two-panel figure —
  (top)    log-log q vs H with the pooled least-squares line, the fitted
           slope, and the ideal 3/2 law drawn through the class centroid;
  (bottom) C_d per point against H/P, with Rehbock 0.602 + 0.083 H/P.

No numpy, no pandas — matplotlib (Agg) only.
"""
import argparse, csv, math, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
K = (2.0 / 3.0) * math.sqrt(2 * G)          # 2.9529 — q = Cd * K * H^1.5
DEFAULT_P = 0.50


def fit(x, y):
    """Least squares y = m x + b, with the standard error of m and R^2."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((v - mx) ** 2 for v in x)
    sxy = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    m = sxy / sxx
    b = my - m * mx
    res = [y[i] - (m * x[i] + b) for i in range(n)]
    ss = sum(r * r for r in res)
    se = math.sqrt(ss / (n - 2) / sxx) if n > 2 else float("nan")
    tot = sum((v - my) ** 2 for v in y)
    return m, b, se, (1 - ss / tot if tot else float("nan"))


def read(path):
    pts = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            try:
                q = float(row["q"])
                P = float(row.get("p") or DEFAULT_P)
                H = float(row["h"]) if row.get("h") else float(row["h_gauge"]) - P
            except (KeyError, ValueError):
                continue
            if q <= 0 or H <= 0:
                continue
            pts.append(dict(q=q, H=H, P=P, digit=row.get("digit", ""),
                            student=row.get("student", ""), src=row.get("source", "")))
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    pts = read(a.csv)
    if len(pts) < 3:
        sys.exit("need at least 3 usable rows (columns q and H or h_gauge)")
    pts.sort(key=lambda p: p["q"])

    q = [p["q"] for p in pts]
    H = [p["H"] for p in pts]
    HP = [p["H"] / p["P"] for p in pts]
    Cd = [p["q"] / (K * p["H"] ** 1.5) for p in pts]
    reh = [0.602 + 0.083 * r for r in HP]

    # ---- the payoff: pooled log-log slope, and the intercept as a C_d --------
    lx, ly = [math.log(v) for v in H], [math.log(v) for v in q]
    m, b, se, r2 = fit(lx, ly)
    Cd_free = math.exp(b) / K                       # C_d implied by the free fit
    b15 = sum(ly[i] - 1.5 * lx[i] for i in range(len(lx))) / len(lx)
    Cd_15 = math.exp(b15) / K                       # C_d with the slope forced to 3/2

    # Rehbock is not a constant C_d, so it does not imply a slope of exactly 1.5
    # either — regress it over the same heads and quote what it predicts.
    lyr = [math.log(reh[i] * K * H[i] ** 1.5) for i in range(len(H))]
    m_reh, _, _, _ = fit(lx, lyr)

    mCd, mReh = sum(Cd) / len(Cd), sum(reh) / len(reh)
    print("WE-1 pooled rating — %d points, H %.3f-%.3f m, q %.2f-%.2f m2/s"
          % (len(pts), min(H), max(H), min(q), max(q)))
    print("  log-log slope      %.3f +/- %.3f   (ideal 3/2 = 1.500;"
          " Rehbock over this range = %.3f)" % (m, se, m_reh))
    print("  R^2                %.5f" % r2)
    print("  C_d, slope free    %.4f" % Cd_free)
    print("  C_d, slope = 3/2   %.4f   <- the number to quote" % Cd_15)
    print("  C_d per point      %.3f - %.3f, mean %.4f" % (min(Cd), max(Cd), mCd))
    print("  Rehbock mean       %.4f   -> class runs %+.1f%%" % (mReh, 100 * (mCd - mReh) / mReh))
    mfit, bfit, _, _ = fit(HP, Cd)
    print("  C_d = %.3f + %.3f (H/P)   vs Rehbock 0.602 + 0.083 (H/P)" % (bfit, mfit))

    # ------------------------------------------------------------------ plot
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(8.2, 9.0),
                                 gridspec_kw=dict(height_ratios=[1.25, 1]))
    fig.suptitle("WE-1 · rating a sharp-crested weir, one point each", fontsize=13)

    ax.loglog(H, q, "o", ms=8, color="#2f7fd0", zorder=3, label="class points")
    for p in pts:
        if p["digit"] != "":
            ax.annotate(p["digit"], (p["H"], p["q"]), textcoords="offset points",
                        xytext=(7, -3), fontsize=8, color="#456")
    xs = [min(H) * 0.9, max(H) * 1.1]
    ax.loglog(xs, [math.exp(b) * v ** m for v in xs], "-", color="#d1495b", lw=1.8,
              label="pooled fit: slope %.3f ± %.3f (R² %.4f)" % (m, se, r2))
    gx = math.exp(sum(lx) / len(lx))
    gy = math.exp(sum(ly) / len(ly))
    ax.loglog(xs, [gy * (v / gx) ** 1.5 for v in xs], "--", color="#444", lw=1.3,
              label="ideal 3/2 law (constant $C_d$)")
    ax.set_xlabel("head over crest  H  (m)")
    ax.set_ylabel("unit discharge  q  (m²/s per m width)")
    ax.grid(True, which="both", alpha=0.25)
    ax.legend(loc="upper left", fontsize=9)
    ax.set_title("$q = C_d\\,\\frac{2}{3}\\sqrt{2g}\\,H^{3/2}$  →  "
                 "forcing the 3/2 slope gives $C_d$ = %.3f" % Cd_15, fontsize=10)

    bx.plot(HP, Cd, "o", ms=8, color="#2f7fd0", zorder=3, label="class $C_d$ per point")
    rr = [min(HP) * 0.95, max(HP) * 1.05]
    bx.plot(rr, [0.602 + 0.083 * v for v in rr], "-", color="#0b8457", lw=1.8,
            label="Rehbock  0.602 + 0.083 H/P")
    bx.plot(rr, [bfit + mfit * v for v in rr], "--", color="#d1495b", lw=1.5,
            label="class fit  %.3f + %.3f H/P" % (bfit, mfit))
    bx.axhline(Cd_15, color="#888", lw=1.0, ls=":",
               label="pooled $C_d$ = %.3f (slope forced to 3/2)" % Cd_15)
    bx.set_xlabel("H / P   (P = crest height above the bed)")
    bx.set_ylabel("discharge coefficient  $C_d$")
    bx.grid(True, alpha=0.25)
    bx.legend(loc="lower right", fontsize=9)

    fig.tight_layout(rect=(0, 0, 1, 0.97))
    d = os.path.dirname(a.out)
    if d:
        os.makedirs(d, exist_ok=True)
    fig.savefig(a.out, dpi=140)
    print("\nwrote %s" % a.out)


if __name__ == "__main__":
    main()
