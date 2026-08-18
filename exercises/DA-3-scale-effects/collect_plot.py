#!/usr/bin/env python3
"""DA-3 · scale effects, live -- pool the optional-submission CSV into the
master curve: C_d against H-in-cells, mixing TWO different re-runs of the
same DA-1 weir rig at the same personalised (lambda, q):

    lambda-points   Medium resolution, H changes because the STUDENT'S SIZE
                    (lambda) changes -- this is DA-1's own original 10-point
                    submission, reused verbatim (source=DA1-original).
    dx-points       the SAME student's own (lambda, q), rebuilt once at ONE
                    extra assigned resolution (Low or High -- never Medium
                    again, never Very high/Ultra, see the robustness section
                    of _archive/README-full.md) -- H changes because the GRID
                    changes, not the model (source=DA3-rerun).

    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

The question the figure answers: does a cell of head lost to a smaller
LAMBDA cost the same C_d as a cell of head lost to a coarser DELTA-X? If the
two colours trace one curve, "grid resolution behaves exactly like model
scale" is not a slogan, it is the same number measured two different ways.
If they DON'T overlay, that split -- not a clean collapse -- is the honest
result, and the script reports whichever one it measures.

Required CSV columns: lambda, q, resolution, H, H_cells, Cd, mechanism
("lambda" or "dx"). Extra columns (digit, qbase, dx_mm, source) are carried
through for the printed table but not required for the fit.
"""
import argparse, csv, math, sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def load(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                lam = float(r["lambda"]); Hc = float(r["H_cells"]); Cd = float(r["Cd"])
            except (KeyError, TypeError, ValueError):
                continue
            if Hc <= 0 or Cd <= 0:
                continue
            rows.append(dict(
                digit=r.get("digit", ""), lam=lam, q=float(r.get("q", 0) or 0),
                res=r.get("resolution", ""), Hc=Hc, Cd=Cd, H=float(r.get("H", 0) or 0),
                mech=r.get("mechanism", "?"), source=r.get("source", ""),
            ))
    return rows


def loglog_fit(xs, ys):
    """y = a x^b, least squares in logs. Returns (a, b, R2)."""
    n = len(xs)
    lx = [math.log(v) for v in xs]; ly = [math.log(v) for v in ys]
    mx = sum(lx) / n; my = sum(ly) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(lx, ly))
    sxx = sum((a - mx) ** 2 for a in lx)
    b = sxy / sxx if sxx else 0.0
    a = math.exp(my - b * mx)
    ss = sum((y - my) ** 2 for y in ly)
    rs = sum((y - (math.log(a) + b * x)) ** 2 for x, y in zip(lx, ly))
    return a, b, (1 - rs / ss if ss else float("nan"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load(args.csv)
    if not rows:
        sys.exit("no usable rows (need lambda, H_cells, Cd)")

    lam_rows = [r for r in rows if r["mech"] == "lambda"]
    dx_rows = [r for r in rows if r["mech"] == "dx"]

    print("DA-3 pooled resolution sweep -- %d points (%d lambda-mechanism, %d dx-mechanism)"
          % (len(rows), len(lam_rows), len(dx_rows)))
    print("  H_cells span: all %.1f-%.1f | lambda-mech %.1f-%.1f | dx-mech %.1f-%.1f"
          % (min(r["Hc"] for r in rows), max(r["Hc"] for r in rows),
             min((r["Hc"] for r in lam_rows), default=float("nan")),
             max((r["Hc"] for r in lam_rows), default=float("nan")),
             min((r["Hc"] for r in dx_rows), default=float("nan")),
             max((r["Hc"] for r in dx_rows), default=float("nan"))))

    # ---- pooled fit over EVERY point, regardless of mechanism -------------
    a, b, r2 = loglog_fit([r["Hc"] for r in rows], [r["Cd"] for r in rows])
    print("  POOLED fit (all mechanisms together): Cd = %.4f * Hcells^%.4f   R2 = %.4f"
          % (a, b, r2))
    for r in rows:
        r["pred"] = a * r["Hc"] ** b
        r["resid"] = 100 * (r["Cd"] / r["pred"] - 1)
    rms_all = math.sqrt(sum(r["resid"] ** 2 for r in rows) / len(rows))
    print("      residual about the pooled curve: RMS %.2f%%, max %.2f%%"
          % (rms_all, max(abs(r["resid"]) for r in rows)))

    # ---- do the two mechanisms overlay, or split? --------------------------
    # Fit each mechanism's own curve and compare; also report each group's
    # mean (signed) residual about the POOLED curve above -- if the two
    # groups' mean residuals are both small compared to the within-group
    # scatter, the mechanisms overlay on one curve. If one group sits
    # systematically off to the side of the other, that offset is the split.
    print("  OVERLAY TEST (mean residual of each mechanism about the POOLED curve):")
    for label, sub in (("lambda-mechanism (Medium, size varies)", lam_rows),
                        ("dx-mechanism     (fixed size, grid varies)", dx_rows)):
        if not sub:
            continue
        mean_res = sum(r["resid"] for r in sub) / len(sub)
        rms_res = math.sqrt(sum(r["resid"] ** 2 for r in sub) / len(sub))
        print("      %-46s mean %+6.2f%%   RMS %5.2f%%   (n=%d)"
              % (label, mean_res, rms_res, len(sub)))
    if lam_rows and dx_rows:
        gap = abs(sum(r["resid"] for r in lam_rows) / len(lam_rows)
                   - sum(r["resid"] for r in dx_rows) / len(dx_rows))
        verdict = "OVERLAY -- one curve, mechanism does not matter" if gap < rms_all \
            else "SPLIT -- the two mechanisms sit on visibly different curves"
        print("      inter-group mean-residual gap %.2f%% vs pooled RMS %.2f%%  ->  %s"
              % (gap, rms_all, verdict))

    # ---- second, stricter overlay test: DA-1's OWN H/P collapse ------------
    # The direct Hcells fit above is weak (R2 ~0.02): H_cells also carries
    # each digit's own H/P target, which swamps any pure resolution signal.
    # DA-1's _archive/README-full.md (S2.3, S5.2) fits C_d = 0.4190 (H/P)^0.313 across their
    # OWN 10 lambda-mechanism points, RMS 2.16%, P = 0.695652*lambda (design
    # constant, independent of the live grid -- DA-1 rig.js's own geom()).
    # Re-using their exact fit as the yardstick and asking the SAME question
    # -- does the dx-mechanism group sit on that curve too? -- is the
    # apples-to-apples version of the overlay test.
    A1, B1, P_PER_LAM = 0.4190, 0.313, 0.6956521739130435  # DA-1 _archive/README-full.md S2.3/S5.2; P = 32 cells * (9/414) * lambda
    print("  STRICTER OVERLAY TEST (residual about DA-1's own H/P collapse, "
          "C_d = 0.419 (H/P)^0.313, DA-1 archived record S2.3/S5.2):")
    for r in rows:
        r["HP"] = r["H"] / (P_PER_LAM * r["lam"])
        r["residDA1"] = 100 * (r["Cd"] / (A1 * r["HP"] ** B1) - 1)
    for label, sub in (("lambda-mechanism", lam_rows), ("dx-mechanism", dx_rows)):
        if not sub:
            continue
        mean_r = sum(r["residDA1"] for r in sub) / len(sub)
        rms_r = math.sqrt(sum(r["residDA1"] ** 2 for r in sub) / len(sub))
        print("      %-20s mean %+6.2f%%   RMS %5.2f%%   (n=%d)" % (label, mean_r, rms_r, len(sub)))
    if lam_rows and dx_rows:
        gap2 = abs(sum(r["residDA1"] for r in lam_rows) / len(lam_rows)
                    - sum(r["residDA1"] for r in dx_rows) / len(dx_rows))
        rms2 = math.sqrt(sum(r["residDA1"] ** 2 for r in rows) / len(rows))
        verdict2 = "OVERLAY" if gap2 < rms2 else "SPLIT"
        print("      inter-group gap %.2f%% vs combined RMS %.2f%%  ->  %s"
              % (gap2, rms2, verdict2))
        print("      note: lambda-mechanism residuals here ARE DA-1's own published "
              "droop (by construction, same 10 points); the dx-mechanism residuals "
              "are the new measurement this demo adds.")

    # ---- paired per-digit comparison: same (lambda, q), Medium vs reload --
    print("  PAIRED (same student, same lambda & q, Medium vs their assigned reload):")
    by_digit_lam = {r["digit"]: r for r in lam_rows}
    for r in sorted(dx_rows, key=lambda r: int(r["digit"]) if r["digit"] != "" else 0):
        base = by_digit_lam.get(r["digit"])
        if not base:
            continue
        print("      d=%-2s lambda=%-5g  Medium %5.1f cells (Cd %.4f)  ->  %-9s %5.1f cells (Cd %.4f)   dCd %+5.2f%%"
              % (r["digit"], r["lam"], base["Hc"], base["Cd"], r["res"], r["Hc"], r["Cd"],
                 100 * (r["Cd"] / base["Cd"] - 1)))

    # ---------------------------------------------------------------- figure
    cols = {"lambda": "#3d7dd6", "dx": "#d6663d"}
    labels = {"lambda": r"$\lambda$-mechanism (Medium, size varies)",
              "dx": r"$\Delta x$-mechanism (fixed size, grid varies)"}
    fig, ax = plt.subplots(figsize=(8.6, 6.2))

    for mech in ("lambda", "dx"):
        sub = [r for r in rows if r["mech"] == mech]
        if not sub:
            continue
        ax.scatter([r["Hc"] for r in sub], [r["Cd"] for r in sub],
                   s=80, color=cols[mech], edgecolor="#222", linewidth=0.6,
                   zorder=3, label=labels[mech])
        for r in sub:
            ax.annotate("d%s" % r["digit"], (r["Hc"], r["Cd"]), textcoords="offset points",
                        xytext=(5, 4), fontsize=7, color="#444")

    xs = [min(r["Hc"] for r in rows) * (max(r["Hc"] for r in rows)
          / min(r["Hc"] for r in rows)) ** (i / 60) for i in range(61)]
    ax.plot(xs, [a * x ** b for x in xs], "k-", lw=1.6, alpha=0.75,
            label=r"pooled fit: $C_d = %.3f\,H_{cells}^{%.3f}$  ($R^2=%.2f$)" % (a, b, r2))
    ax.fill_between(xs, [0.95 * a * x ** b for x in xs], [1.05 * a * x ** b for x in xs],
                    color="k", alpha=0.06)

    ax.set_xlabel(r"H, head over the crest, in CELLS  ($H/\Delta x$)")
    ax.set_ylabel(r"$C_d = q\,/\,(\sqrt{g}\,H^{3/2})$")
    ax.set_title("DA-3 · grid refinement behaves like model scale\n"
                 "same students' own ($\\lambda$, q); H-in-cells driven by $\\lambda$ (blue) or by $\\Delta x$ (orange)",
                 fontsize=11)
    ax.grid(True, which="both", alpha=0.25)
    ax.legend(loc="lower right", fontsize=8.5)
    fig.tight_layout()
    fig.savefig(args.out, dpi=130)
    print("  wrote %s" % args.out)


if __name__ == "__main__":
    main()
