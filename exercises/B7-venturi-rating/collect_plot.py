#!/usr/bin/env python3
"""
collect_plot.py — pool a B7 "venturi meter rating" class CSV into a plot.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns ignored):
    student,digit,level,q,dHead,barrelHead,throatHead,source

Only `q` and `dHead` are required for the pooled fit. `q` is the unit
discharge (m^2/s per m width) read from the column reduction in the barrel
run; `dHead` is the barrel-minus-throat piezometric head difference in
metres, read either from two Gauge-tool traces at the SAME elevation (so the
stored z + p/rho.g values already agree) or from the plain hover/probe
pressure-only reading at that same elevation (z cancels either way — see the
README's Theory section, and _archive/README-full.md Sec. 1 for the measured
proof that the two conventions agree to four decimals).

The venturi meter equation, with a1/a2 the barrel/throat bore heights
(m^2 per m width, i.e. the per-metre-width "areas" of this 2D-vertical
solver):

    q = Cd * a2/sqrt(1-(a2/a1)^2) * sqrt(2 g dHead)  =  Cd * K * sqrt(2g) * sqrt(dHead)

so q vs sqrt(dHead) should be a straight line through the origin, and the
ratio of the measured slope to the ideal (Cd=1) slope K*sqrt(2g) is the
class's estimate of Cd.
"""
import csv
import math
import sys

G = 9.81
A1 = 0.6995   # barrel bore height, m (measured/rasterised; nominal design 0.69 m)
A2 = 0.3975   # throat bore height, m (measured/rasterised; nominal design 0.39 m)


def ideal_slope(a1=A1, a2=A2, g=G):
    K = a2 / math.sqrt(1 - (a2 / a1) ** 2)
    return K * math.sqrt(2 * g), K


def fit_through_origin(xs, ys):
    sxy = sum(x * y for x, y in zip(xs, ys))
    sxx = sum(x * x for x in xs)
    return sxy / sxx


def fit_free(xs, ys):
    n = len(xs)
    xbar = sum(xs) / n
    ybar = sum(ys) / n
    sxy = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys))
    sxx = sum((x - xbar) ** 2 for x in xs)
    slope = sxy / sxx
    intercept = ybar - slope * xbar
    return slope, intercept


def r_squared(xs, ys, slope, intercept=0.0):
    yhat = [slope * x + intercept for x in xs]
    ybar = sum(ys) / len(ys)
    ss_res = sum((y - yh) ** 2 for y, yh in zip(ys, yhat))
    ss_tot = sum((y - ybar) ** 2 for y in ys)
    return 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")


def load_rows(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                q = float(r["q"])
                dh = float(r["dHead"])
            except (KeyError, ValueError):
                continue
            if dh <= 0 or q <= 0:
                continue
            rows.append({**r, "q": q, "dHead": dh})
    return rows


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    out = "plots/pooled-demo.png"
    if "-o" in sys.argv:
        out = sys.argv[sys.argv.index("-o") + 1]

    rows = load_rows(path)
    if not rows:
        print("No usable (q, dHead) rows found in %s" % path)
        sys.exit(1)

    xs = [math.sqrt(r["dHead"]) for r in rows]
    ys = [r["q"] for r in rows]

    m_origin = fit_through_origin(xs, ys)
    m_free, c_free = fit_free(xs, ys)
    m_ideal, K = ideal_slope()
    r2_origin = r_squared(xs, ys, m_origin, 0.0)

    Cd_origin = m_origin / m_ideal
    Cd_free = m_free / m_ideal
    row_cds = [r["q"] / (m_ideal * math.sqrt(r["dHead"])) for r in rows]
    row_cd_mean = sum(row_cds) / len(row_cds)
    row_cd_sd = math.sqrt(sum((c - row_cd_mean) ** 2 for c in row_cds) / len(row_cds))

    print("B7 venturi meter rating — pooled fit")
    print("  n = %d points" % len(rows))
    print("  a1 (barrel) = %.4f m, a2 (throat) = %.4f m, area ratio a2/a1 = %.4f" % (A1, A2, A2 / A1))
    print("  ideal (Cd=1) slope  = %.4f  [q = %.4f * sqrt(dHead)]" % (m_ideal, m_ideal))
    print("  measured slope (through origin) = %.4f   R^2 = %.4f" % (m_origin, r2_origin))
    print("  measured slope (free fit)       = %.4f   intercept = %.4f" % (m_free, c_free))
    print("  Cd (through-origin slope / ideal slope) = %.3f" % Cd_origin)
    print("  Cd (free-fit slope / ideal slope)       = %.3f" % Cd_free)
    print("  Cd (mean of per-row Cd, +/- sd)          = %.3f +/- %.3f" % (row_cd_mean, row_cd_sd))
    print("  -> a Cd = 1 line sits ~%.0f%% ABOVE the fitted line: the class's own intercept/slope gap"
          % (100 * (m_ideal / m_origin - 1)))

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not available; skipping plot")
        sys.exit(0)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6.4, 7.2), height_ratios=[2.6, 1], sharex=False)

    ax1.scatter(xs, ys, c="#1f7a4d", s=46, zorder=3, label="simulated class (n=%d)" % len(rows))
    for r, x in zip(rows, xs):
        ax1.annotate(r.get("digit", ""), (x, r["q"]), textcoords="offset points",
                     xytext=(5, 4), fontsize=8, color="#55697a")
    xmax = max(xs) * 1.12
    xx = [0, xmax]
    ax1.plot(xx, [m_ideal * x for x in xx], "--", color="#b23a52", lw=1.6,
              label=r"ideal, $C_d=1$ (slope %.3f)" % m_ideal)
    ax1.plot(xx, [m_origin * x for x in xx], "-", color="#0d76ad", lw=2.0,
              label=r"fitted, through origin (slope %.3f, $C_d$=%.3f)" % (m_origin, Cd_origin))
    ax1.set_xlabel(r"$\sqrt{\Delta h}$   (m$^{1/2}$)")
    ax1.set_ylabel(r"$q$   (m$^2$/s per m width)")
    ax1.set_title("B7 — venturi meter rating: $q$ vs $\\sqrt{\\Delta h}$")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(alpha=0.25)

    resid = [y - m_origin * x for x, y in zip(xs, ys)]
    ax2.axhline(0, color="#55697a", lw=1)
    ax2.scatter(xs, resid, c="#a86a0e", s=40, zorder=3)
    ax2.set_xlabel(r"$\sqrt{\Delta h}$   (m$^{1/2}$)")
    ax2.set_ylabel("residual $q$ (m$^2$/s)")
    ax2.set_title("residual vs the through-origin fit")
    ax2.grid(alpha=0.25)

    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
