#!/usr/bin/env python3
"""FR-1 · pool a class CSV into the log h_f vs log V plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (Blackboard export, header row required, order free):
    student, digit, level_m, H1_m, H2_m, V_ms
`digit` and `level_m` are optional (used only for the colour ramp and the
sanity check that the level matches the digit rule).

h_f is H1 - H2, the head drop between the two gauges L = 4.5 m apart on the
bore.  The fit is ordinary least squares on log10 h_f against log10 V:

    h_f = a V^m       m is the exponent the class measures
    lambda = h_f 2 g D / (L V^2)   with D = 0.3913 m (the bore, 18 cells)

Two lambdas are printed: the free fit's lambda at the class-mean V, and the
lambda you get if you FORCE the textbook m = 2.  They differ, and that gap is
the discussion (see README section 4).

matplotlib only — no numpy, no pandas.
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
L_GAUGE = 4.5       # m, gauge separation on the bore (see README §2)
D_BORE = 0.3913     # m, 18 cells at Medium — the rasterised 0.40 m bore
LEVEL_BASE, LEVEL_STEP = 3.30, 0.13


def read(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
            try:
                V = float(r["V_ms"])
                hf = float(r["H1_m"]) - float(r["H2_m"])
            except (KeyError, ValueError):
                print("  skipped unreadable row:", r, file=sys.stderr)
                continue
            if V <= 0 or hf <= 0:
                print("  skipped non-positive row:", r, file=sys.stderr)
                continue
            d = r.get("digit")
            lvl = r.get("level_m")
            rows.append(dict(student=r.get("student", "?"), V=V, hf=hf,
                             digit=int(d) if d not in (None, "") else None,
                             level=float(lvl) if lvl not in (None, "") else None))
    return rows


def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    m = sxy / sxx
    b = my - m * mx
    ss = sum((y - (m * x + b)) ** 2 for x, y in zip(xs, ys))
    st = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss / st if st else float("nan")
    se = math.sqrt(ss / (n - 2) / sxx) if n > 2 else float("nan")
    return m, b, r2, se


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read(a.csv)
    if len(rows) < 3:
        sys.exit("need at least 3 usable rows, got %d" % len(rows))

    for r in rows:                      # spot-check the personalised parameter
        if r["digit"] is not None and r["level"] is not None:
            want = LEVEL_BASE + LEVEL_STEP * r["digit"]
            if abs(want - r["level"]) > 0.02:
                print("  ! %s: digit %d wants level %.2f, submitted %.2f"
                      % (r["student"], r["digit"], want, r["level"]), file=sys.stderr)

    X = [math.log10(r["V"]) for r in rows]
    Y = [math.log10(r["hf"]) for r in rows]
    m, b, r2, se = ols(X, Y)

    Vbar = sum(r["V"] for r in rows) / len(rows)
    hf_at = 10 ** (b + m * math.log10(Vbar))
    lam_fit = hf_at * 2 * G * D_BORE / (L_GAUGE * Vbar ** 2)
    k2 = sum(y - 2 * x for x, y in zip(X, Y)) / len(X)     # forced m = 2
    lam2 = (10 ** k2) * 2 * G * D_BORE / L_GAUGE

    print("n = %d" % len(rows))
    print("fitted   log h_f = %.3f log V  %+.3f      R2 = %.4f   (slope s.e. %.3f)"
          % (m, b, r2, se))
    print("exponent m = %.2f          (textbook quadratic: 2.00)" % m)
    print("lambda at the class-mean V = %.2f m/s : %.4f" % (Vbar, lam_fit))
    print("lambda if m is FORCED to 2           : %.4f" % lam2)
    print("h_f = lambda (L/D) V^2/2g   with L = %.1f m, D = %.4f m" % (L_GAUGE, D_BORE))

    fig, ax = plt.subplots(figsize=(7.6, 5.6))
    cs = [r["digit"] if r["digit"] is not None else 0 for r in rows]
    sc = ax.scatter([r["V"] for r in rows], [r["hf"] for r in rows], c=cs,
                    cmap="viridis", s=64, zorder=3, edgecolor="k", linewidth=.5)
    vv = [min(r["V"] for r in rows) * .93, max(r["V"] for r in rows) * 1.07]
    ax.plot(vv, [10 ** (b + m * math.log10(v)) for v in vv], "-", color="#c1272d",
            lw=2, zorder=2, label="fit:  $h_f \\propto V^{%.2f}$   ($R^2$ = %.4f)" % (m, r2))
    ax.plot(vv, [(10 ** k2) * v ** 2 for v in vv], "--", color="#4a4a4a", lw=1.6,
            zorder=1, label="forced $V^{2}$  ($\\lambda$ = %.4f)" % lam2)
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("bore-mean velocity  $V$   (m/s)")
    ax.set_ylabel("head drop over %.1f m of bore   $h_f$   (m)" % L_GAUGE)
    ax.set_title("FR-1 · the friction law this pipe actually has\n"
                 "RIG-A, %d runs, D = %.4f m, L = %.1f m" % (len(rows), D_BORE, L_GAUGE),
                 fontsize=11)
    ax.grid(True, which="both", alpha=.25)
    ax.legend(loc="upper left", fontsize=9, framealpha=.95)
    cb = fig.colorbar(sc, ax=ax, pad=.02); cb.set_label("last digit of student number")
    ax.text(.98, .04, "$\\lambda$ = %.4f at $V$ = %.2f m/s   (it is NOT constant:\n"
            "$\\lambda$ rises from %.4f to %.4f across the class)"
            % (lam_fit, Vbar,
               min(r["hf"] * 2 * G * D_BORE / (L_GAUGE * r["V"] ** 2) for r in rows),
               max(r["hf"] * 2 * G * D_BORE / (L_GAUGE * r["V"] ** 2) for r in rows)),
            transform=ax.transAxes, ha="right", va="bottom", fontsize=8.5,
            bbox=dict(fc="w", ec="#bbb", alpha=.9))
    fig.tight_layout()
    fig.savefig(a.out, dpi=140)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
