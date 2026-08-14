#!/usr/bin/env python3
"""B1 "T = 4L/c with your own valve" -- pool the class's (L, T) submissions.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (the Blackboard export, one row per submission):

    student_id,digit,xd_m,T_s[,L_m,v0_ms]

Students submit `xd_m` (their own valve station) and `T_s` (the median
period they read off the gauge trace, >=3 cycles); `L_m` is DERIVED here
as xd_m - 6.0 (the pipe entrance, README S2's convention) if the column
is absent, so a student does not have to do the subtraction by hand --
but if a lecturer's own export already carries L_m, that value is used
as-is. The fit is T = a*L + b, WITH an intercept -- unlike UN-1's
Joukowsky fit, there is no a-priori reason the reflection plane sits
exactly at the nominal entrance station, and the intercept is exactly the
number that says how far off it is (README S1/S5). Compare the fitted
slope `a` against theory 4/c and read the intercept as a distance via
b / a (metres): a positive offset means the effective acoustic length is
LONGER than x_d - 6.0, i.e. the reservoir behaves as if its reflecting
face sits upstream of x = 6.0 (inside the sponge).
"""
import csv
import sys
import os
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

C_SLIDER = 70.0
THEORY_SLOPE = 4.0 / C_SLIDER   # 0.05714 s/m
XE = 6.0   # pipe entrance / reservoir face station


def read(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                xd = float(r["xd_m"])
                L = float(r["L_m"]) if (r.get("L_m") or "").strip() else xd - XE
                rows.append(dict(sid=r["student_id"].strip(),
                                 d=int(r["digit"]),
                                 xd=xd,
                                 L=L,
                                 v0=float(r["v0_ms"]) if (r.get("v0_ms") or "").strip() else None,
                                 T=float(r["T_s"])))
            except (ValueError, KeyError):
                print("  ! skipped malformed row:", r)
    return rows


def fit_line(xs, ys):
    """least squares y = a*x + b, plus R^2."""
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    a = sxy / sxx if sxx else float("nan")
    b = my - a * mx
    yhat = [a * x + b for x in xs]
    ss_res = sum((y - yh) ** 2 for y, yh in zip(ys, yhat))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
    return a, b, r2


def main(argv):
    src = argv[1] if len(argv) > 1 else "data/simulated-class.csv"
    out = "plots/pooled-demo.png"
    if "-o" in argv:
        out = argv[argv.index("-o") + 1]
    rows = read(src)
    if not rows:
        print("no usable rows in", src)
        return 1
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    xs = [r["L"] for r in rows]
    ys = [r["T"] for r in rows]
    a, b, r2 = fit_line(xs, ys)
    c_meas = 4.0 / a if a else float("nan")
    offset_m = b / a if a else float("nan")   # intercept expressed as a distance

    fig, (ax, axr) = plt.subplots(
        2, 1, figsize=(7.6, 7.4), dpi=150, sharex=True,
        gridspec_kw={"height_ratios": [3, 1], "hspace": 0.06})
    fig.patch.set_facecolor("#0b0f14")
    for a_ in (ax, axr):
        a_.set_facecolor("#10151d")

    lo, hi = 0.0, max(xs) * 1.12
    xx = [lo + (hi - lo) * k / 200.0 for k in range(201)]

    ax.plot(xx, [THEORY_SLOPE * x for x in xx], "--", color="#9bb7d4", lw=1.4,
            label=r"theory  $T=4L/c$,  $c=%g$ m/s  (slope %.4f s/m)" % (C_SLIDER, THEORY_SLOPE))
    ax.plot(xx, [a * x + b for x in xx], "-", color="#7fd4ff", lw=2.0,
            label="class fit  T = %.4f·L %+.4f  (n=%d, R²=%.4f)" % (a, b, len(rows), r2))
    ax.plot(xs, ys, "o", color="#ffb648", ms=9, mec="#0b0f14", mew=1.0, zorder=5,
            label="class (each point: one student's own valve)")
    for r in rows:
        ax.annotate(str(r["d"]), (r["L"], r["T"]), textcoords="offset points",
                    xytext=(7, -3), fontsize=7, color="#dfe8f2")

    ax.set_ylabel("period  T  (s)", color="#dfe8f2")
    ax.set_title("B1 · T = 4L/c: each student's own valve position\n"
                 "fitted c = %.1f m/s (%+.1f%% vs %g) · intercept ↔ %.2f m offset"
                 % (c_meas, 100 * (c_meas - C_SLIDER) / C_SLIDER, C_SLIDER, offset_m),
                 color="#e8f0f8", fontsize=11)
    ax.grid(alpha=0.15, color="#8ea3b8")
    leg = ax.legend(loc="upper left", framealpha=0.25, fontsize=8.5)
    for t in leg.get_texts():
        t.set_color("#dfe8f2")

    for r in rows:
        pred = a * r["L"] + b
        axr.scatter(r["L"], 100.0 * (r["T"] - pred) / pred, s=70, color="#ffb648",
                    edgecolor="#0b0f14", linewidth=0.7, zorder=5)
    axr.axhline(0, color="#7fd4ff", lw=1.4)
    axr.axhspan(-10, 10, color="#7fd4ff", alpha=0.06)
    axr.set_xlabel("acoustic length  L = x_d − 6.0 m  (m)", color="#dfe8f2")
    axr.set_ylabel("resid. vs\nclass fit (%)", color="#dfe8f2", fontsize=9)
    axr.grid(alpha=0.15, color="#8ea3b8")

    for a_ in (ax, axr):
        for s in a_.spines.values():
            s.set_color("#3a4757")
        a_.tick_params(colors="#9fb2c6")

    fig.savefig(out, facecolor=fig.patch.get_facecolor(), bbox_inches="tight")

    print("%d submissions from %s" % (len(rows), src))
    print("fitted   T = %.4f * L %+.4f   (least squares, WITH intercept)" % (a, b))
    print("         slope -> c = 4/slope = %.1f m/s  (slider: %g, %+.1f%%)"
          % (c_meas, C_SLIDER, 100 * (c_meas - C_SLIDER) / C_SLIDER))
    print("         R2 = %.4f" % r2)
    print("         intercept b = %.4f s  ->  %.2f m  (b/a; the datum offset -- see README S1/S5)"
          % (b, offset_m))
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
