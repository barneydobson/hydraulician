#!/usr/bin/env python3
"""DA-2 · Time scales as sqrt(lambda) — pool the class CSV.

    python3 collect_plot.py data/simulated-class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, header row required, extra columns ignored):

    student_id,digit,lambda,W_m,a_m,hStart_m,hStop_m,t_fall_s,Cd_backcalc
    23140870,0,1.00,4.413,0.08696,1.8376,0.60,21.731,0.6126

Only `lambda` and `t_fall_s` are required for the headline plot; `Cd_backcalc`
(or the four geometry columns, from which it is recomputed) drives the scale-
effect inset. Rows are pooled on a log-log t vs lambda axis: kinematic
similarity (D2/D23) predicts a straight line of slope 1/2 — the lambda = 1/4
tank drains in half the time of the lambda = 1 tank. The Q3 falling-head
formula (QS-1),

    t = 2A / (Cd a sqrt(2g)) * (sqrt(h1) - sqrt(h2))

with A, a AND h all proportional to lambda, gives

    t(lambda) = [2 A1 (sqrt(h1)-sqrt(h2)) / (a1 sqrt(2g))] * sqrt(lambda) / Cd(lambda)

so t/sqrt(lambda) is constant iff Cd is constant across scales. Any departure
of the fitted slope from 1/2, and any trend in the per-rung Cd inset, is
exactly the scale effect DA-3 opens with — not scatter to average away.
"""
import argparse
import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81


def fit_loglog(lam, t):
    """OLS of ln(t) on ln(lambda). Returns (slope, K, r2, se_slope)."""
    n = len(lam)
    x = [math.log(v) for v in lam]
    y = [math.log(v) for v in t]
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    syy = sum((b - my) ** 2 for b in y)
    slope = sxy / sxx
    intercept = my - slope * mx           # ln(K)
    ss_res = syy - slope * sxy
    r2 = 1.0 - ss_res / syy if syy > 0 else float("nan")
    dof = max(1, n - 2)
    se_slope = math.sqrt(max(ss_res, 0.0) / dof / sxx) if sxx > 0 else float("nan")
    return slope, math.exp(intercept), r2, se_slope


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = []
    with open(args.csv, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                lam = float(r["lambda"])
                t = float(r["t_fall_s"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (0.1 <= lam <= 1.2 and 1.0 <= t <= 120.0):
                print("  dropped (out of range): %s" % r)
                continue
            cd = None
            try:
                cd = float(r.get("Cd_backcalc"))
            except (TypeError, ValueError):
                pass
            if cd is None:
                try:
                    A = float(r["W_m"]); a = float(r["a_m"])
                    h1 = float(r["hStart_m"]); h2 = float(r["hStop_m"])
                    cd = (2 * A * (math.sqrt(h1) - math.sqrt(h2))) / (a * math.sqrt(2 * G) * t)
                except (KeyError, ValueError, TypeError, ZeroDivisionError):
                    cd = float("nan")
            rows.append((r.get("student_id", "?"), r.get("digit", "?"), lam, t, cd))

    if len(rows) < 3:
        raise SystemExit("need at least 3 usable rows, got %d" % len(rows))

    lam = [r[2] for r in rows]
    t = [r[3] for r in rows]
    cd = [r[4] for r in rows]

    slope, K, r2, se = fit_loglog(lam, t)

    # per-rung (unique lambda) mean Cd, for the inset and the printed table —
    # repeats of the same rung are the SAME deterministic build, so grouping
    # is exact, not a statistical average over independent noise.
    rungs = sorted(set(lam), reverse=True)
    rung_cd = {}
    rung_t = {}
    for lv in rungs:
        vals = [c for l2, c in zip(lam, cd) if abs(l2 - lv) < 1e-6]
        tv = [tt for l2, tt in zip(lam, t) if abs(l2 - lv) < 1e-6]
        rung_cd[lv] = sum(vals) / len(vals)
        rung_t[lv] = sum(tv) / len(tv)
    cd_mean = sum(rung_cd.values()) / len(rung_cd)
    cd_spread = (max(rung_cd.values()) - min(rung_cd.values())) / cd_mean

    print("n = %d submissions, %d distinct lambda rungs" % (len(rows), len(rungs)))
    print("log-log fit:  t = %.3f * lambda^%.3f   (ideal exponent = 0.500)" % (K, slope))
    print("  slope = %.3f +/- %.3f   R2 = %.4f" % (slope, se, r2))
    for lv in rungs:
        print("  lambda=%.2f : mean t_fall=%.3f s   Cd_backcalc=%.4f" % (lv, rung_t[lv], rung_cd[lv]))
    print("Cd across rungs: mean %.4f, peak-to-peak spread %.1f%% of the mean" % (cd_mean, 100 * cd_spread))

    fig = plt.figure(figsize=(11.5, 4.8), facecolor="#0c111a")
    ax0 = fig.add_axes([0.08, 0.13, 0.52, 0.75])
    ax1 = fig.add_axes([0.68, 0.13, 0.28, 0.75])
    for ax in (ax0, ax1):
        ax.set_facecolor("#0c111a")
        ax.tick_params(colors="#b8c6d4", labelsize=8.5)
        for s in ax.spines.values():
            s.set_color("#3a4656")
        ax.grid(alpha=0.22, color="#3a4656")

    # ---- main: log-log t vs lambda, class points + fitted line + ideal 1/2
    lam_line = [min(lam) * 0.85, max(lam) * 1.1]
    ax0.plot(lam_line, [K * v ** slope for v in lam_line], "-", color="#ffd479", lw=1.8,
              label=r"fit: $t = %.2f\,\lambda^{%.3f}$  ($R^2=%.4f$)" % (K, slope, r2))
    K_ideal = rung_t[1.0] if 1.0 in rung_t else K
    ax0.plot(lam_line, [K_ideal * v ** 0.5 for v in lam_line], "--", color="#8fa6bb", lw=1.3,
              label=r"ideal slope $\frac{1}{2}$ (anchored at $\lambda=1$)")
    ax0.plot(lam, t, "o", color="#7fd4ff", ms=7, mec="#0c111a", zorder=5,
              label="class submissions (n=%d)" % len(rows))
    ax0.set_xscale("log"); ax0.set_yscale("log")
    ax0.set_xlabel(r"model scale  $\lambda$", color="#dce6ef")
    ax0.set_ylabel(r"$t_{fall}$  (s)  —  time from $0.9h_0$ to $0.3h_0$", color="#dce6ef")
    ax0.set_title("Pooled: log-log $t$ vs $\\lambda$ — slope $\\Rightarrow$ %.3f vs ideal 0.5"
                  % slope, color="#eef4fa", fontsize=11)
    ax0.legend(loc="lower right", fontsize=8, facecolor="#131a26", edgecolor="#3a4656",
               labelcolor="#dce6ef")
    for lv in rungs:
        ax0.annotate(r"$\lambda=%.2g$" % lv, (lv, rung_t[lv]), textcoords="offset points",
                     xytext=(6, 6), fontsize=7.5, color="#8fa6bb")

    # ---- inset: Cd back-calculated per rung — the scale-effect residual
    ax1.plot(rungs, [rung_cd[lv] for lv in rungs], "-", color="#8fa6bb", lw=1.0, zorder=1)
    ax1.plot(lam, cd, "o", color="#ff9f7f", ms=6, mec="#0c111a", zorder=5)
    ax1.axhline(cd_mean, color="#ffd479", lw=1.0, ls=":", zorder=2)
    ax1.set_xlabel(r"$\lambda$", color="#dce6ef")
    ax1.set_ylabel(r"$C_d$ (Q3 inverted)", color="#dce6ef")
    ax1.set_title("Scale effect: $C_d$ per rung\n(DA-3's opening exhibit)", color="#eef4fa", fontsize=9.5)
    ax1.set_xlim(0.15, 1.1)
    span = max(0.03, (max(cd) - min(cd)) * 0.8)
    ax1.set_ylim(cd_mean - span - 0.02, cd_mean + span + 0.02)
    ax1.text(0.97, 0.03, "mean %.3f\np2p %.0f%%" % (cd_mean, 100 * cd_spread),
              transform=ax1.transAxes, ha="right", va="bottom", fontsize=8, color="#dce6ef")

    fig.suptitle("DA-2 · time scales as $\\sqrt{\\lambda}$ — %d simulated submissions"
                 % len(rows), color="#eef4fa", fontsize=12, y=0.99)
    out = args.out
    if os.path.dirname(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=130, facecolor=fig.get_facecolor())
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
