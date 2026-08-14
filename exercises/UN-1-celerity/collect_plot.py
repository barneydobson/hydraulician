#!/usr/bin/env python3
"""UN-1 · pool the class's (v0, dH) submissions and measure the celerity.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (the Blackboard export, one row per submission):

    student_id,digit,gap_m,celerity,v0_ms,dH_m

`celerity` is 70 for the main run and 140 for the optional coda; anything
else is plotted as its own series. The fit is FORCED THROUGH THE ORIGIN,
because Joukowsky says dH = (c/g)·dv with no constant: a stationary column
suffers no surge. Slope x g is the celerity the class has just measured.
"""
import csv
import sys
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
SERIES = {70: ("#7fd4ff", "o", "c = 70 m/s  (the slider's default)"),
          140: ("#ffb648", "^", "c = 140 m/s  (the coda)")}


def read(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                rows.append(dict(sid=r["student_id"].strip(),
                                 d=int(r["digit"]),
                                 gap=float(r["gap_m"]),
                                 c=float(r["celerity"]),
                                 v0=float(r["v0_ms"]),
                                 dH=float(r["dH_m"])))
            except (ValueError, KeyError):
                print("  ! skipped malformed row:", r)
    return rows


def fit_origin(xs, ys):
    """least squares y = m x, no intercept."""
    sxx = sum(x * x for x in xs)
    return sum(x * y for x, y in zip(xs, ys)) / sxx if sxx else float("nan")


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

    fig, ax = plt.subplots(figsize=(7.6, 5.6), dpi=150)
    fig.patch.set_facecolor("#0b0f14")
    ax.set_facecolor("#10151d")
    report = []

    cs = sorted({r["c"] for r in rows})
    vmax = max(r["v0"] for r in rows) * 1.12
    for c in cs:
        col, mk, lab = SERIES.get(c, ("#5fd08a", "s", "c = %g m/s" % c))
        pts = [r for r in rows if r["c"] == c]
        xs = [r["v0"] for r in pts]
        ys = [r["dH"] for r in pts]
        m = fit_origin(xs, ys)
        c_meas = m * G
        report.append((c, len(pts), m, c_meas, 100 * (c_meas - c) / c))
        ax.plot([0, vmax], [0, m * vmax], "-", color=col, lw=1.6, alpha=0.9, zorder=2)
        ax.plot([0, vmax], [0, c / G * vmax], "--", color=col, lw=1.0,
                alpha=0.45, zorder=1)
        ax.plot(xs, ys, mk, color=col, ms=9, mec="#0b0f14", mew=1.2, ls="none",
                label="%s  —  fit gives c = %.1f m/s" % (lab, c_meas), zorder=3)
        # digits that share a nozzle land on the same point — label them once
        grp = {}
        for r in pts:
            grp.setdefault((round(r["v0"], 2), round(r["dH"], 1)), []).append(r["d"])
        for (x, y), ds in grp.items():
            ax.annotate(",".join(str(d) for d in sorted(set(ds))), (x, y),
                        textcoords="offset points", xytext=(10, -3), color=col,
                        fontsize=8, alpha=0.8)

    ax.set_xlim(0, vmax)
    ax.set_ylim(0, max(r["dH"] for r in rows) * 1.12)
    ax.set_xlabel("change in pipe velocity  Δv = v₀  (m/s)", color="#dfe8f2")
    ax.set_ylabel("head rise at the gauge  ΔH  (m)", color="#dfe8f2")
    ax.set_title("UN-1 · pooled class data:  ΔH = (c/g)·Δv\n"
                 "solid = fit through the origin,  dashed = Joukowsky at the "
                 "slider's c", color="#e8f0f8", fontsize=11)
    ax.grid(alpha=0.14, color="#8ea3b8")
    for s in ax.spines.values():
        s.set_color("#3a4757")
    ax.tick_params(colors="#9fb2c6")
    leg = ax.legend(loc="upper left", framealpha=0.25, fontsize=9)
    for t in leg.get_texts():
        t.set_color("#dfe8f2")
    fig.tight_layout()
    fig.savefig(out, facecolor=fig.patch.get_facecolor())

    print("%d submissions from %s" % (len(rows), src))
    print("%-8s %5s  %-14s %-12s %s" % ("set c", "n", "slope ΔH/Δv", "measured c", "error"))
    for c, n, m, cm, err in report:
        print("%-8g %5d  %-14.3f %-12.1f %+.1f%%" % (c, n, m, cm, err))
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
