#!/usr/bin/env python3
"""B2 "The flexible pipe, via the c slider" -- pool the class's paired closures.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (the Blackboard export, one row per submission):

    student_id,digit,gap_m,v0_70_ms,dH70_m,v0_140_ms,dH140_m

Each student closes their OWN nozzle twice: once at c=70, once at c=140,
same physical gap. The payoff is the RATIO dH140/dH70, which theory says
equals the celerity ratio (140/70 = 2.0) regardless of the student's own
v0 -- so the plot is dH140 vs dH70, and every point should sit near the
y = 2x line no matter how spread out the class's own gaps are.
"""
import csv
import sys
import os
import statistics
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RATIO_THEORY = 140.0 / 70.0


def read(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                rows.append(dict(sid=r["student_id"].strip(),
                                 d=int(r["digit"]),
                                 gap=float(r["gap_m"]),
                                 v0_70=float(r["v0_70_ms"]),
                                 dH70=float(r["dH70_m"]),
                                 v0_140=float(r["v0_140_ms"]),
                                 dH140=float(r["dH140_m"])))
            except (ValueError, KeyError):
                print("  ! skipped malformed row:", r)
    return rows


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

    for r in rows:
        r["ratio"] = r["dH140"] / r["dH70"]
        r["drift_pct"] = 100.0 * (r["v0_140"] - r["v0_70"]) / r["v0_70"]
        r["jouk70"] = 70.0 * r["v0_70"] / 9.81
        r["jouk140"] = 140.0 * r["v0_140"] / 9.81
        r["err70_pct"] = 100.0 * (r["dH70"] - r["jouk70"]) / r["jouk70"]
        r["err140_pct"] = 100.0 * (r["dH140"] - r["jouk140"]) / r["jouk140"]

    ratios = [r["ratio"] for r in rows]
    mean_ratio = statistics.mean(ratios)
    sd_ratio = statistics.pstdev(ratios) if len(ratios) > 1 else 0.0

    fig, (ax, axr) = plt.subplots(
        2, 1, figsize=(7.6, 7.6), dpi=150, sharex=True,
        gridspec_kw={"height_ratios": [3, 1], "hspace": 0.06})
    fig.patch.set_facecolor("#0b0f14")
    for a_ in (ax, axr):
        a_.set_facecolor("#10151d")

    hi = max(r["dH70"] for r in rows) * 1.15
    xx = [0, hi]
    ax.plot(xx, [RATIO_THEORY * x for x in xx], "--", color="#9bb7d4", lw=1.6,
            label="ratio = c ratio = 140/70 = 2.0")
    ax.scatter([r["dH70"] for r in rows], [r["dH140"] for r in rows],
               s=95, color="#ffb648", edgecolor="#0b0f14", linewidth=1.0, zorder=5,
               label="class (each point: one student, two closures)")
    for r in rows:
        ax.annotate(str(r["d"]), (r["dH70"], r["dH140"]), textcoords="offset points",
                    xytext=(7, -4), fontsize=7, color="#dfe8f2")

    ax.set_xlim(0, hi)
    ax.set_ylim(0, max(r["dH140"] for r in rows) * 1.12)
    ax.set_ylabel("ΔH at c = 140  (m)", color="#dfe8f2")
    ax.set_title("B2 · the flexible pipe: ΔH₁₄₀ vs ΔH₇₀, same nozzle, same v₀\n"
                 "class-mean ratio %.3f ± %.3f  (theory 2.000, %+.1f%%)"
                 % (mean_ratio, sd_ratio, 100 * (mean_ratio - RATIO_THEORY) / RATIO_THEORY),
                 color="#e8f0f8", fontsize=11)
    ax.grid(alpha=0.15, color="#8ea3b8")
    leg = ax.legend(loc="upper left", framealpha=0.25, fontsize=8.5)
    for t in leg.get_texts():
        t.set_color("#dfe8f2")

    axr.scatter([r["dH70"] for r in rows], [100 * (r["ratio"] - RATIO_THEORY) / RATIO_THEORY for r in rows],
                s=70, color="#5fd08a", edgecolor="#0b0f14", linewidth=0.7, zorder=5)
    axr.axhline(0, color="#9bb7d4", lw=1.4)
    axr.axhspan(-5, 5, color="#9bb7d4", alpha=0.07)
    axr.set_xlabel("ΔH at c = 70  (m)", color="#dfe8f2")
    axr.set_ylabel("ratio error\nvs 2.0 (%)", color="#dfe8f2", fontsize=9)
    axr.grid(alpha=0.15, color="#8ea3b8")

    for a_ in (ax, axr):
        for s in a_.spines.values():
            s.set_color("#3a4757")
        a_.tick_params(colors="#9fb2c6")

    fig.savefig(out, facecolor=fig.patch.get_facecolor(), bbox_inches="tight")

    print("%d submissions from %s" % (len(rows), src))
    print("class-mean ratio dH140/dH70 = %.4f  (sd %.4f)   theory 2.000  (%+.2f%%)"
          % (mean_ratio, sd_ratio, 100 * (mean_ratio - RATIO_THEORY) / RATIO_THEORY))
    print("v0 drift 70->140:  min %+.2f%%  max %+.2f%%"
          % (min(r["drift_pct"] for r in rows), max(r["drift_pct"] for r in rows)))
    print()
    print("%-6s %6s %7s %7s %7s %7s %8s %8s" % ("gap", "v0_70", "dH70", "err70%", "v0_140", "dH140", "err140%", "ratio"))
    for r in sorted({r["gap"]: r for r in rows}.values(), key=lambda r: r["gap"]):
        print("%-6.2f %6.3f %7.2f %+7.1f %7.3f %7.2f %+8.1f %8.3f"
              % (r["gap"], r["v0_70"], r["dH70"], r["err70_pct"],
                 r["v0_140"], r["dH140"], r["err140_pct"], r["ratio"]))
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
