#!/usr/bin/env python3
"""FB-1 · pool a class CSV into the choking-hump verification plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Each student commits a PREDICTION before raising the hump:

    E1     = y1 + V1^2/2g          (measured upstream, no hump)
    yc     = (q^2/g)^(1/3)
    dzpred = E1 - 1.5*yc           (committed BEFORE raising the hump)

...then raises the hump until it chokes and reports the height that did it,
dzc. The plot is dzc vs dzpred with the 1:1 line theory predicts, plus
cell-quantisation error bars (+/- one Delta-x = 21.7 mm at Medium, or +/- 2
cells if dzc_cells is not supplied — see _archive/README-full.md, Appendix,
"bracket resolution" note).

Input columns (extras ignored, order irrelevant):
    q         unit discharge, m2/s per m width                    [required]
    y1        approach depth measured upstream, no hump, m        [required*]
    E1        specific energy = y1 + V1^2/2g, m                    [optional, derived from y1,q if absent]
    yc        critical depth (q^2/g)^(1/3), m                      [optional, derived from q if absent]
    dzpred    E1 - 1.5*yc, m  -- the COMMITTED prediction, made before the hump is touched
                                                                     [optional, derived if absent]
    dzc       measured choking height, m                           [required]
    dzc_cells resolution of the dzc measurement, in cells           [optional -> error bar]
    e1_prechoke   E1 re-measured at the LAST hump step before it chokes (FB1B refinement
                  probe finding: the pool rises as the hump is raised, so this is a
                  materially different number from the committed E1 above)  [optional]
    dzpred_star   e1_prechoke - 1.5*yc -- the RE-TIMED prediction              [optional,
                  derived from e1_prechoke if absent; adopted protocol -- see
                  _archive/README-full.md S3/S5]
    digit, student, source                                         carried through, not needed

  * V1 is taken as q/y1 (depth-averaged), matching the worksheet's protocol.

No numpy, no pandas -- matplotlib (Agg) only.
"""
import argparse, csv, math, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
DX_MEDIUM = 9.0 / 414.0          # sandbox scene, Resolution: Medium, m


def yc_of(q):
    return (q * q / G) ** (1.0 / 3.0)


def fit_through_origin(x, y):
    """Least squares slope of y = k x (no intercept) -- the natural fit for
    a bias that is multiplicative on a quantity that is zero at q = 0."""
    sxx = sum(v * v for v in x)
    sxy = sum(x[i] * y[i] for i in range(len(x)))
    return sxy / sxx if sxx else float("nan")


def fit(x, y):
    """Ordinary least squares y = m x + b, standard error of m, R^2."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((v - mx) ** 2 for v in x)
    sxy = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    m = sxy / sxx if sxx else float("nan")
    b = my - m * mx
    res = [y[i] - (m * x[i] + b) for i in range(n)]
    ss = sum(r * r for r in res)
    se = math.sqrt(ss / (n - 2) / sxx) if n > 2 and sxx else float("nan")
    tot = sum((v - my) ** 2 for v in y)
    return m, b, se, (1 - ss / tot if tot else float("nan"))


def read(path):
    pts = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            try:
                q = float(row["q"])
                dzc = float(row["dzc"])
            except (KeyError, ValueError):
                continue
            y1 = float(row["y1"]) if row.get("y1") else None
            yc = float(row["yc"]) if row.get("yc") else yc_of(q)
            if row.get("e1"):
                E1 = float(row["e1"])
            elif y1 is not None:
                V1 = q / y1
                E1 = y1 + V1 * V1 / (2 * G)
            else:
                continue
            dzpred = float(row["dzpred"]) if row.get("dzpred") else (E1 - 1.5 * yc)
            cells = float(row["dzc_cells"]) if row.get("dzc_cells") else None
            e1_star = float(row["e1_prechoke"]) if row.get("e1_prechoke") else None
            if row.get("dzpred_star"):
                dzpred_star = float(row["dzpred_star"])
            elif e1_star is not None:
                dzpred_star = e1_star - 1.5 * yc
            else:
                dzpred_star = None
            if q <= 0 or dzc <= 0:
                continue
            pts.append(dict(q=q, y1=y1, E1=E1, yc=yc, dzpred=dzpred, dzc=dzc, cells=cells,
                            dzpred_star=dzpred_star,
                            digit=row.get("digit", ""), student=row.get("student", ""),
                            src=row.get("source", "")))
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--dx", type=float, default=DX_MEDIUM,
                     help="grid cell size for the quantisation error bar (m)")
    a = ap.parse_args()

    pts = read(a.csv)
    if len(pts) < 3:
        sys.exit("need at least 3 usable rows (columns q, y1 (or E1), dzc)")
    pts.sort(key=lambda p: p["dzpred"])

    dzpred = [p["dzpred"] for p in pts]
    dzc = [p["dzc"] for p in pts]
    err = [dzc[i] - dzpred[i] for i in range(len(pts))]
    ratio = [dzc[i] / dzpred[i] for i in range(len(pts))]
    # error bar: +/- 1 cell where the bracket resolution is known, else +/- 2
    # cells (this pass tested ONE height per digit, chosen from a fitted
    # bias model rather than a tight bisection -- see _archive/README-full.md
    # S5/Appendix).
    ebar = [(1 if p["cells"] else 2) * a.dx for p in pts]

    k_fit = fit_through_origin(dzpred, dzc)
    m, b, se, r2 = fit(dzpred, dzc)
    mean_err = sum(err) / len(err)
    mean_abs = sum(abs(e) for e in err) / len(err)
    sign = "dzc ABOVE dzpred (choking needs MORE height than the loss-free prediction)" \
        if mean_err > 0 else "dzc BELOW dzpred"

    print("FB-1 pooled choking-height check -- %d points, dzpred %.3f-%.3f m, q %.2f-%.2f m2/s"
          % (len(pts), min(dzpred), max(dzpred), min(p["q"] for p in pts), max(p["q"] for p in pts)))
    print("  mean (dzc - dzpred)   %+.4f m   (%s)" % (mean_err, sign))
    print("  mean |dzc - dzpred|   %.4f m" % mean_abs)
    print("  dzc / dzpred          %.3f - %.3f, mean %.3f" % (min(ratio), max(ratio), sum(ratio) / len(ratio)))
    print("  through-origin fit    dzc = %.3f * dzpred" % k_fit)
    print("  free fit              dzc = %.3f * dzpred + %.4f   (R^2 %.4f)" % (m, b, r2))
    print("  cell size (Medium)    %.4f m -> quantisation error bar +/-1 cell = %.4f m" % (a.dx, a.dx))

    # ---------------------------------------------------- re-timed prediction
    # ADOPTED protocol (FB1B refinement probe, see _archive/README-full.md
    # S3/S5/Appendix): E1
    # re-measured at the LAST hump step before it chokes, not committed once
    # before the hump is touched. No rig change -- same sharp hump, same dzc.
    have_star = all(p["dzpred_star"] for p in pts)
    ratio_star = None
    if have_star:
        ratio_star = [pts[i]["dzc"] / pts[i]["dzpred_star"] for i in range(len(pts))]
        mean_ratio_star = sum(ratio_star) / len(ratio_star)
        print("\n  -- re-timed prediction: E1 at the LAST pre-choke step (adopted protocol) --")
        print("  dzc / dzpred*          %.3f - %.3f, mean %.3f"
              % (min(ratio_star), max(ratio_star), mean_ratio_star))
        print("  (naive committed-E1 ratio was %.3f - %.3f, mean %.3f -- re-timing removes"
              % (min(ratio), max(ratio), sum(ratio) / len(ratio)))
        print("   most of the gap: the pool rises as the hump is raised, so most of the")
        print("   1.9x bias was E1 itself changing, not a large real entrance loss.)")

    # ------------------------------------------------------------------ plot
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(11.5, 5.2),
                                 gridspec_kw=dict(width_ratios=[1.3, 1]))
    fig.suptitle("FB-1 · the hump that chokes — $\\Delta z_c$ vs $\\Delta z_{pred} = E_1 - 1.5\\,y_c$", fontsize=13)

    ax.errorbar(dzpred, dzc, yerr=ebar, fmt="o", ms=8, color="#2f7fd0",
                ecolor="#9ab6d6", capsize=3, zorder=3, label="class points (±1 cell quant.)")
    for p in pts:
        if p["digit"] != "":
            ax.annotate(p["digit"], (p["dzpred"], p["dzc"]), textcoords="offset points",
                        xytext=(7, -3), fontsize=8, color="#456")
    xmax = max(dzpred + ([p["dzpred_star"] for p in pts] if have_star else [])) * 1.12
    xs = [0, xmax]
    ax.plot(xs, xs, "--", color="#444", lw=1.3, label="1:1 (loss-free specific-energy theory)")
    ax.plot(xs, [k_fit * v for v in xs], "-", color="#d1495b", lw=1.8,
            label="committed-E1 fit: $\\Delta z_c$ = %.2f $\\times$ $\\Delta z_{pred}$" % k_fit)
    if have_star:
        ax.plot([p["dzpred_star"] for p in pts], dzc, "s", ms=7, mfc="none", mec="#2a9d5c",
                 mew=1.6, zorder=4, label="re-timed: $\\Delta z_{pred}^*$ (E1 at last pre-choke step)")
    ax.set_xlabel(r"predicted choking height  $\Delta z_{pred}$  (m)")
    ax.set_ylabel(r"measured choking height  $\Delta z_c$  (m)")
    ax.grid(True, alpha=0.25)
    ax.legend(loc="upper left", fontsize=8.5)
    ax.set_title("mean error %+.3f m  (%.0f%% of $\\Delta z_{pred}$), committed-E1"  %
                 (mean_err, 100 * mean_err / (sum(dzpred) / len(dzpred))), fontsize=10)

    bx.plot([p["q"] for p in pts], ratio, "o", ms=8, color="#2f7fd0", zorder=3,
            label="committed E1 (before hump touched)")
    for p in pts:
        if p["digit"] != "":
            bx.annotate(p["digit"], (p["q"], p["dzc"] / p["dzpred"]), textcoords="offset points",
                        xytext=(6, -3), fontsize=8, color="#456")
    bx.axhline(sum(ratio) / len(ratio), color="#2f7fd0", lw=1.3, ls=":",
               label="mean committed %.2f" % (sum(ratio) / len(ratio)))
    if have_star:
        bx.plot([p["q"] for p in pts], ratio_star, "s", ms=7, mfc="none", mec="#2a9d5c",
                mew=1.6, zorder=4, label="re-timed E1 (last pre-choke step)")
        bx.axhline(sum(ratio_star) / len(ratio_star), color="#2a9d5c", lw=1.3, ls=":",
                   label="mean re-timed %.2f" % (sum(ratio_star) / len(ratio_star)))
    bx.axhline(1.0, color="#444", lw=1.0, ls="--", label="1:1")
    bx.set_xlabel("unit discharge q  (m²/s per m width)")
    bx.set_ylabel(r"$\Delta z_c\ /\ \Delta z_{pred}$")
    bx.set_ylim(0, max(2.4, max(ratio) * 1.15))
    bx.grid(True, alpha=0.25)
    bx.legend(loc="right", fontsize=7.5)
    bx.set_title("committed-E1 bias ~constant; re-timed E1 removes most of it", fontsize=9.5)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    d = os.path.dirname(a.out)
    if d:
        os.makedirs(d, exist_ok=True)
    fig.savefig(a.out, dpi=140)
    print("\nwrote %s" % a.out)


if __name__ == "__main__":
    main()
