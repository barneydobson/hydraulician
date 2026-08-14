#!/usr/bin/env python3
"""DA-1 · the scale ladder — pool a class CSV into the two-panel payoff figure.

    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

LEFT  (raw)       q against H, one colour per lambda.  Three clumps that do
                  not overlap, plus each third's own DIMENSIONAL rating
                  H = A_lambda q^n -- three different curves.
RIGHT (collapsed) C_d = q / (sqrt(g) H^1.5) against H/P.  One curve.

Required CSV columns: lambda, q, H.  P is taken from the file if present,
otherwise reconstructed from the rig (P = 32 * lambda * 9/414 m).  Everything
else (student, digit, q_base, level, h_gauge, H_cells, imbalance_pct,
freeboard, source) is optional and ignored by the headline plot -- but
H_cells and imbalance_pct, if present, drive the junk-vs-scale-effect
labelling that DA-3 consumes.
"""
import argparse, csv, math, sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
DX = 9.0 / 414.0          # Medium cell, the design grid
N_P = 32                  # crest height in cells at lambda = 1

# WE-1's measured floor, re-measured on this rig (README section 5):
# below ~7 cells of head the mass imbalance across the weir jumps.
CELL_FLOOR = 7.0
IMBALANCE_FLOOR = 8.0     # per cent


def load(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                lam = float(r["lambda"]); q = float(r["q"]); H = float(r["H"])
            except (KeyError, TypeError, ValueError):
                continue
            if q <= 0 or H <= 0:
                continue
            P = float(r["P"]) if r.get("P") else N_P * lam * DX
            cells = float(r["H_cells"]) if r.get("H_cells") else H / DX
            imb = abs(float(r["imbalance_pct"])) if r.get("imbalance_pct") else 0.0
            rows.append(dict(lam=lam, q=q, H=H, P=P, cells=cells, imb=imb,
                             Cd=q / (math.sqrt(G) * H ** 1.5), HP=H / P,
                             digit=r.get("digit", "")))
    return rows


def loglog_fit(xs, ys):
    """y = a x^b, least squares in logs.  Returns (a, b, R2)."""
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
        sys.exit("no usable rows (need lambda, q, H)")
    lams = sorted({r["lam"] for r in rows}, reverse=True)

    # ---- the collapse: one pooled curve C_d = a (H/P)^b over EVERY point ----
    a, b, r2 = loglog_fit([r["HP"] for r in rows], [r["Cd"] for r in rows])
    for r in rows:
        r["pred"] = a * r["HP"] ** b
        r["res"] = 100 * (r["Cd"] / r["pred"] - 1)

    print("DA-1 pooled scale ladder -- %d points, lambda %s"
          % (len(rows), "/".join(("%g" % l) for l in lams)))
    print("  raw span            q %.3f-%.3f (%.1fx),  H %.3f-%.3f m (%.1fx)"
          % (min(r["q"] for r in rows), max(r["q"] for r in rows),
             max(r["q"] for r in rows) / min(r["q"] for r in rows),
             min(r["H"] for r in rows), max(r["H"] for r in rows),
             max(r["H"] for r in rows) / min(r["H"] for r in rows)))

    # BEFORE the collapse: each third's own dimensional rating H = A q^n.
    print("  BEFORE collapse -- one dimensional rating per third, H = A q^n:")
    As = {}
    for lam in lams:
        sub = [r for r in rows if r["lam"] == lam]
        if len(sub) < 2:
            continue
        A, n, _ = loglog_fit([r["q"] for r in sub], [r["H"] for r in sub])
        As[lam] = A
        print("      lambda %-5g A = %.4f   n = %.3f   (%d pts)" % (lam, A, n, len(sub)))
    if len(As) > 1:
        print("      A spread across the ladder: %.1f%%  <- three separate q-H curves"
              % (100 * (max(As.values()) / min(As.values()) - 1)))

    # AFTER the collapse.
    rms = math.sqrt(sum(r["res"] ** 2 for r in rows) / len(rows))
    print("  AFTER  collapse -- C_d = %.4f (H/P)^%.3f,  R2 = %.4f" % (a, b, r2))
    print("      C_d span            %.4f - %.4f  (%.1f%%)"
          % (min(r["Cd"] for r in rows), max(r["Cd"] for r in rows),
             100 * (max(r["Cd"] for r in rows) / min(r["Cd"] for r in rows) - 1)))
    print("      residual about the single curve: RMS %.2f%%, max %.2f%%"
          % (rms, max(abs(r["res"]) for r in rows)))
    for lam in lams:
        sub = [r for r in rows if r["lam"] == lam]
        print("      lambda %-5g mean residual %+6.2f%%   H = %.1f-%.1f cells"
              % (lam, sum(r["res"] for r in sub) / len(sub),
                 min(r["cells"] for r in sub), max(r["cells"] for r in sub)))

    # ---- junk vs honest scale effect (DA-3's labelled residuals) -----------
    print("  droop labelling (WE-1 protocol: >=%.0f cells of head AND"
          " |mass imbalance| < %.0f%%):" % (CELL_FLOOR, IMBALANCE_FLOOR))
    for r in sorted(rows, key=lambda r: r["res"]):
        if r["res"] >= -1.0:
            continue
        ok = r["cells"] >= CELL_FLOOR and r["imb"] < IMBALANCE_FLOOR
        print("      d=%-2s lambda %-5g H %5.2f cells  imbalance %5.2f%%  "
              "residual %+6.2f%%  -> %s"
              % (r["digit"], r["lam"], r["cells"], r["imb"], r["res"],
                 "SCALE EFFECT (trustworthy)" if ok else "UNDER-RESOLVED (exclude)"))

    # ---------------------------------------------------------------- figure
    cols = {1.0: "#3d7dd6", 0.5: "#d68a3d", 0.25: "#5aa469"}
    fig, ax = plt.subplots(1, 2, figsize=(13.0, 5.6))

    axr = ax[0]
    for lam in lams:
        sub = [r for r in rows if r["lam"] == lam]
        c = cols.get(lam, "#888")
        axr.plot([r["H"] for r in sub], [r["q"] for r in sub], "o", ms=9,
                 color=c, label=r"$\lambda$ = %g" % lam, zorder=3)
        if lam in As and len(sub) > 1:
            A, n, _ = loglog_fit([r["q"] for r in sub], [r["H"] for r in sub])
            qq = [min(r["q"] for r in sub) * (max(r["q"] for r in sub)
                  / min(r["q"] for r in sub)) ** (i / 40) for i in range(41)]
            axr.plot([A * x ** n for x in qq], qq, "-", lw=1.4, color=c, alpha=0.8)
    axr.set_xscale("log"); axr.set_yscale("log")
    axr.set_xlabel("H, head over the crest  (m)")
    axr.set_ylabel(r"q, unit discharge  (m$^2$/s)")
    axr.set_title("RAW — three rigs, three ratings\n"
                  "(three clumps, three curves: $H = A_\\lambda q^n$)", fontsize=11)
    axr.grid(True, which="both", alpha=0.25); axr.legend(loc="upper left", fontsize=9)

    axc = ax[1]
    for lam in lams:
        sub = [r for r in rows if r["lam"] == lam]
        axc.plot([r["HP"] for r in sub], [r["Cd"] for r in sub], "o", ms=9,
                 color=cols.get(lam, "#888"), label=r"$\lambda$ = %g" % lam, zorder=3)
    hp = [min(r["HP"] for r in rows) * (max(r["HP"] for r in rows)
          / min(r["HP"] for r in rows)) ** (i / 60) for i in range(61)]
    axc.plot(hp, [a * x ** b for x in hp], "k-", lw=1.6, alpha=0.75,
             label=r"pooled: $C_d = %.3f\,(H/P)^{%.2f}$" % (a, b))
    axc.fill_between(hp, [0.97 * a * x ** b for x in hp],
                     [1.03 * a * x ** b for x in hp], color="k", alpha=0.07)
    # annotate any trustworthy droop point (DA-3's exhibit)
    for r in rows:
        if r["res"] < -2.0:
            axc.annotate("%.0f cells, %+.1f%%" % (r["cells"], r["res"]),
                         (r["HP"], r["Cd"]), textcoords="offset points",
                         xytext=(6, -13), fontsize=8, color="#444")
    axc.set_xlabel("H / P   (the weir's own shape ratio)")
    axc.set_ylabel(r"$C_d = q\,/\,(\sqrt{g}\,H^{3/2})$")
    axc.set_title("COLLAPSED — one curve\n"
                  "(shaded band = $\\pm$3%%; RMS residual %.2f%%)" % rms, fontsize=11)
    axc.grid(True, which="both", alpha=0.25); axc.legend(loc="lower right", fontsize=9)

    fig.suptitle("DA-1 · the scale ladder — Froude scaling and the $\\pi$-collapse",
                 fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(args.out, dpi=130)
    print("  wrote %s" % args.out)


if __name__ == "__main__":
    main()
