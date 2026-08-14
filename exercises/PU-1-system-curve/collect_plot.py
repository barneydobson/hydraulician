#!/usr/bin/env python3
"""PU-1 System curve measured, operating point kept honest.

Pools a class CSV of (digit, Q, H) submissions, fits the system curve
    H = H_s + K * Q^2
by simple linear regression against Q^2, and plots it against the
paper pump curve  H_pump = H0 - a * Q^2  handed out on the day, marking
their graphical intersection (the "operating point").

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Expected CSV columns (header row required, extra columns ignored):
    student,digit,spout_vx_ms,Q_m2s,H_m,sump_surf_m,tank_surf_m,vol_m2,source

Only Q_m2s and H_m are required to fit and plot. If `digit` is present,
rows are checked against the personalised rule vx = 1.5 + 0.09*d (informational
only -- Q is what was actually delivered, not the nominal spout setting, so a
mismatch here is not on its own an error).
"""
import csv
import sys
import argparse

# ---- the paper pump curve (printed and handed out on the day) -------------
# H_pump(Q) = H0 - a*Q^2.  Chosen (see README Sec.4) so the intersection with
# the class's own measured system curve lands mid-range of the personalised
# Q sweep.
PUMP_H0 = 1.539
PUMP_A = 33.72


def read_rows(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                q = float(r["Q_m2s"])
                h = float(r["H_m"])
            except (KeyError, ValueError):
                continue
            if q <= 0:
                continue
            d = r.get("digit")
            rows.append({"digit": d, "Q": q, "H": h, "raw": r})
    return rows


def fit_system_curve(rows):
    """H = Hs + K*Q^2 by ordinary least squares against x = Q^2."""
    n = len(rows)
    xs = [r["Q"] ** 2 for r in rows]
    ys = [r["H"] for r in rows]
    xbar = sum(xs) / n
    ybar = sum(ys) / n
    sxx = sum((x - xbar) ** 2 for x in xs)
    sxy = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys))
    K = sxy / sxx
    Hs = ybar - K * xbar
    pred = [Hs + K * x for x in xs]
    ss_res = sum((y - p) ** 2 for y, p in zip(ys, pred))
    ss_tot = sum((y - ybar) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return Hs, K, r2


def intersection(Hs, K, H0, a):
    """Analytic intersection of Hs + K*Q^2 = H0 - a*Q^2."""
    q2 = (H0 - Hs) / (K + a)
    if q2 < 0:
        return None
    q = q2 ** 0.5
    return q, Hs + K * q2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = read_rows(args.csv_path)
    if len(rows) < 3:
        print(f"Only {len(rows)} usable rows (need Q_m2s>0 and H_m) -- nothing to fit.")
        sys.exit(1)

    Hs, K, r2 = fit_system_curve(rows)
    print(f"PU-1 pooled points: {len(rows)}")
    print(f"Q range: {min(r['Q'] for r in rows):.4f} - {max(r['Q'] for r in rows):.4f} m^2/s")
    print(f"fitted  H = {Hs:.4f} + {K:.3f} * Q^2      R2 = {r2:.4f}")

    # personalised-rule check (informational: Q delivered != nominal vx, so a
    # mismatch is expected and not itself a red flag -- see README Sec.3)
    bad_digit = [r for r in rows if r["digit"] not in (None, "")
                 and not (0 <= float(r["digit"]) <= 9)]
    if bad_digit:
        print(f"NOTE: {len(bad_digit)} row(s) have a digit outside 0-9.")

    op = intersection(Hs, K, PUMP_H0, PUMP_A)
    if op:
        Qop, Hop = op
        print(f"paper pump curve H = {PUMP_H0:.3f} - {PUMP_A:.2f} * Q^2")
        print(f"graphical operating point: Q = {Qop:.4f} m^2/s,  H = {Hop:.4f} m")
    else:
        print("WARNING: paper pump curve does not intersect the fitted system curve "
              "in Q>0 -- reprint it (see README Sec.4).")

    # ---- plot ----
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(7.5, 5.5), dpi=150)

    qs = [r["Q"] for r in rows]
    hs_ = [r["H"] for r in rows]
    ax.scatter(qs, hs_, s=55, color="#1f77b4", zorder=5, label="class submissions (Q, H)")

    qmax = max(qs) * 1.15
    xs_line = [qmax * i / 200 for i in range(201)]
    sys_line = [Hs + K * x * x for x in xs_line]
    ax.plot(xs_line, sys_line, color="#1f77b4", lw=2,
             label=f"fitted system curve  H = {Hs:.3f} + {K:.2f}·Q²  (R²={r2:.3f})")

    pump_line = [PUMP_H0 - PUMP_A * x * x for x in xs_line]
    ax.plot(xs_line, pump_line, color="#d62728", lw=2, ls="--",
             label=f"paper pump curve  H = {PUMP_H0:.3f} − {PUMP_A:.1f}·Q²")

    if op:
        Qop, Hop = op
        ax.scatter([Qop], [Hop], marker="*", s=320, color="#2ca02c", zorder=6,
                   edgecolor="black", linewidth=0.6,
                   label=f"operating point  Q={Qop:.3f}, H={Hop:.3f}")
        ax.axvline(Qop, color="#2ca02c", lw=0.8, ls=":", alpha=0.7)
        ax.axhline(Hop, color="#2ca02c", lw=0.8, ls=":", alpha=0.7)

    ax.set_xlim(0, qmax)
    ax.set_ylim(0, max(max(hs_), PUMP_H0) * 1.15)
    ax.set_xlabel("Q  (m²/s, delivered at the pump flange)")
    ax.set_ylabel("H  (m, piezometric head above the sump surface)")
    ax.set_title("PU-1 · System curve measured, operating point kept honest")
    ax.legend(loc="upper left", fontsize=8.5, framealpha=0.9)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
