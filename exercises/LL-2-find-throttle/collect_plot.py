#!/usr/bin/env python3
"""LL-2 · pool a class CSV into the emergent orifice-loss curve + a locate-
error histogram.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (Blackboard export, header row required, order free):
    pair, x_found_m, kL_found

Those two are the actual submission (every pair's answer is a different
(x, k_L) pair, which is what makes this demo copy-proof). After the reveal,
the lecturer appends the answer key:

    x_true_m, blockage_frac

`blockage_frac` is the fraction of the bore height partner A's plate blocked
(2 cells / 18 = 0.111, 3 cells / 18 = 0.167 in this rig — see README). Rows
missing the reveal columns still count for nothing (the payoff plot needs
the key), but the script tolerates a mix of revealed/unrevealed rows and
just skips what it cannot use, so a lecturer can run this mid-class on the
locate half alone if `blockage_frac` genuinely is not typed in yet.

Two panels:
  (left)  k_L vs blockage fraction — the class's own points sketch out how
          steeply a partial obstruction's loss grows with blockage. A simple
          power-law fit is drawn alongside a Borda-type sudden-contraction
          reference curve, (1/Cc - 1)^2 with Cc = 0.62 + 0.38 beta^3 (the
          usual empirical sharp-edged-orifice Cc), purely for shape
          comparison — this rig is a short in-duct plate, not an orifice
          plate in free jet, so exact agreement is not expected or claimed.
  (right) locate error histogram, x_found - x_true, with the +-0.3 m target
          band shaded.

matplotlib only - no numpy, no pandas.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81


def read(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
            try:
                xf = float(r["x_found_m"])
                kl = float(r["kL_found"])
            except (KeyError, ValueError):
                print("  skipped unreadable row (no x_found_m/kL_found):", r, file=sys.stderr)
                continue
            if kl <= 0:
                print("  skipped non-positive kL row:", r, file=sys.stderr)
                continue
            xt = r.get("x_true_m")
            bf = r.get("blockage_frac")
            rows.append(dict(
                pair=r.get("pair", "?"), x_found=xf, kL_found=kl,
                x_true=float(xt) if xt not in (None, "") else None,
                blockage=float(bf) if bf not in (None, "") else None,
            ))
    return rows


def ols_loglog(xs, ys):
    n = len(xs)
    lx = [math.log10(x) for x in xs]
    ly = [math.log10(y) for y in ys]
    mx, my = sum(lx) / n, sum(ly) / n
    sxx = sum((x - mx) ** 2 for x in lx)
    sxy = sum((x - mx) * (y - my) for x, y in zip(lx, ly))
    m = sxy / sxx if sxx else float("nan")
    b = my - m * mx
    ss = sum((y - (m * x + b)) ** 2 for x, y in zip(lx, ly))
    st = sum((y - my) ** 2 for y in ly)
    r2 = 1 - ss / st if st else float("nan")
    return m, b, r2


def cc_borda(beta):
    """Empirical contraction coefficient for a sharp-edged partial closure,
    used only as a shape reference (see module docstring)."""
    cc = 0.62 + 0.38 * beta ** 3
    return (1.0 / cc - 1.0) ** 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read(a.csv)
    if len(rows) < 3:
        sys.exit("need at least 3 usable rows, got %d" % len(rows))

    revealed = [r for r in rows if r["blockage"] is not None]
    located = [r for r in rows if r["x_true"] is not None]

    print("n submitted = %d, n revealed (blockage known) = %d, n with x_true = %d"
          % (len(rows), len(revealed), len(located)))

    if located:
        errs = [r["x_found"] - r["x_true"] for r in located]
        aerr = [abs(e) for e in errs]
        print("locate error: mean %.3f m, mean|.| %.3f m, max|.| %.3f m, within +-0.3 m: %d/%d"
              % (sum(errs) / len(errs), sum(aerr) / len(aerr), max(aerr),
                 sum(1 for e in aerr if e <= 0.30), len(located)))

    if len(revealed) >= 3:
        X = [r["blockage"] for r in revealed]
        Y = [r["kL_found"] for r in revealed]
        m, b, r2 = ols_loglog(X, Y)
        print("fitted   log kL = %.3f log(blockage) %+.3f    R2 = %.4f" % (m, b, r2))
        print("i.e. kL ~ blockage^%.2f across the class's own hidden faults" % m)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.4, 5.6))

    # ---- left: kL vs blockage fraction --------------------------------
    if revealed:
        cs = [r["blockage"] for r in revealed]
        sc = ax1.scatter([r["blockage"] for r in revealed], [r["kL_found"] for r in revealed],
                          c=cs, cmap="viridis", s=80, zorder=3, edgecolor="k", linewidth=.6)
        if len(revealed) >= 3:
            bb = [min(X) * .8, max(X) * 1.15]
            ax1.plot(bb, [10 ** (b + m * math.log10(v)) for v in bb], "-", color="#c1272d",
                     lw=2, zorder=2, label=r"class fit: $k_L \propto \beta^{%.2f}$ ($R^2$=%.2f)" % (m, r2))
        bbref = [0.02 + 0.01 * i for i in range(60)]
        ax1.plot(bbref, [cc_borda(v) for v in bbref], "--", color="#4a4a4a", lw=1.4,
                  zorder=1, label=r"sharp-orifice shape ref., $(1/C_c-1)^2$")
        ax1.axvspan(2 / 18, 3 / 18, color="#7fd4ff", alpha=.12, zorder=0,
                    label="worksheet band (2-3 of 18 cells)")
        cb = fig.colorbar(sc, ax=ax1, pad=.02); cb.set_label("blockage fraction (revealed)")
    ax1.set_xlabel(r"blockage fraction $\beta$ (blocked height / bore height)")
    ax1.set_ylabel(r"$k_L$ found ( $= \Delta H_{excess} / (V^2/2g)$ )")
    ax1.set_title("LL-2 · the class's own orifice-loss curve")
    ax1.grid(True, alpha=.3)
    ax1.legend(loc="upper left", fontsize=8.5, framealpha=.95)

    # ---- right: locate-error histogram ---------------------------------
    if located:
        ax2.axvspan(-0.30, 0.30, color="#5fd08a", alpha=.15, zorder=0, label=r"$\pm$0.3 m target")
        ax2.hist(errs, bins=max(5, len(errs)), color="#7fd4ff", edgecolor="k", linewidth=.6, zorder=2)
        ax2.axvline(0, color="#333", lw=1, zorder=1)
        ax2.set_xlabel(r"locate error  $x_{found} - x_{true}$   (m)")
        ax2.set_ylabel("pairs")
        ax2.set_title("Where the class's guesses landed")
        ax2.legend(loc="upper right", fontsize=9)
    else:
        ax2.text(.5, .5, "no x_true column yet\n(reveal not pooled)", ha="center", va="center",
                 transform=ax2.transAxes, fontsize=11, color="#777")
    ax2.grid(True, alpha=.3)

    fig.suptitle("LL-2 · Find the throttle — pooled class result (n=%d)" % len(rows), fontsize=12)
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(a.out, dpi=140)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
