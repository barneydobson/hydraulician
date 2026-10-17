#!/usr/bin/env python3
"""QS-1 · pool the class's (t_predicted, t_measured) submissions — "the wager plot".

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (the Blackboard export, one row per submission):

    student_id,digit,eta1_m,eta2_m,h1_m,h2_m,t_pred_s,t_meas_s,err_pct

Only `t_pred_s` and `t_meas_s` are required for the plot; the rest are kept
for traceability back to each student's level pair. Every point is one
student's wager against their own stopwatch: on the 1:1 line means the
falling-head formula called it exactly. The inset histogram shows the
signed percentage error (t_meas - t_pred)/t_pred, which is the number
worth discussing in class — its sign is the C_d story (see README).
"""
import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def read(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                rows.append(dict(
                    sid=r["student_id"].strip(), d=int(r["digit"]),
                    t_pred=float(r["t_pred_s"]), t_meas=float(r["t_meas_s"]),
                ))
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

    errs = [100.0 * (r["t_meas"] - r["t_pred"]) / r["t_pred"] for r in rows]
    mean_abs = sum(abs(e) for e in errs) / len(errs)
    mean_signed = sum(errs) / len(errs)

    fig = plt.figure(figsize=(7.6, 5.8), dpi=150)
    fig.patch.set_facecolor("#0b0f14")
    ax = fig.add_axes([0.11, 0.11, 0.85, 0.78])
    ax.set_facecolor("#10151d")

    tmax = max(max(r["t_pred"] for r in rows), max(r["t_meas"] for r in rows)) * 1.15
    ax.plot([0, tmax], [0, tmax], "--", color="#8ea3b8", lw=1.2, alpha=0.7,
             label="1:1 — the perfect wager", zorder=1)
    xs = [r["t_pred"] for r in rows]
    ys = [r["t_meas"] for r in rows]
    ax.plot(xs, ys, "o", color="#7fd4ff", ms=9, mec="#0b0f14", mew=1.2,
             ls="none", zorder=3,
             label="class (n=%d)  mean |error| %.1f%%  mean %+.1f%%"
                   % (len(rows), mean_abs, mean_signed))
    for r in rows:
        ax.annotate(str(r["d"]), (r["t_pred"], r["t_meas"]),
                    textcoords="offset points", xytext=(8, -3),
                    color="#dfe8f2", fontsize=8, alpha=0.85)

    ax.set_xlim(0, tmax)
    ax.set_ylim(0, tmax)
    ax.set_xlabel("predicted t  =  (2A / Cd·a·√2g) · (√h1 − √h2)   (s)", color="#dfe8f2")
    ax.set_ylabel("measured t  —  read off the gauge trace   (s)", color="#dfe8f2")
    ax.set_title("QS-1 · predict the drain, then run it — the wager plot\n"
                 "labels are the digit d; points above the line drained "
                 "slower than predicted", color="#e8f0f8", fontsize=11)
    ax.grid(alpha=0.14, color="#8ea3b8")
    for s in ax.spines.values():
        s.set_color("#3a4757")
    ax.tick_params(colors="#9fb2c6")
    leg = ax.legend(loc="upper left", framealpha=0.25, fontsize=9)
    for t in leg.get_texts():
        t.set_color("#dfe8f2")

    # ---- inset: histogram of signed % error ----
    inset = fig.add_axes([0.62, 0.16, 0.30, 0.24])
    inset.set_facecolor("#10151d")
    bins = [-40, -30, -20, -10, 0, 10, 20, 30, 40]
    inset.hist(errs, bins=bins, color="#ffb648", edgecolor="#0b0f14", linewidth=0.8)
    inset.axvline(0, color="#8ea3b8", lw=1.0, alpha=0.8)
    inset.set_title("error %  (t_meas − t_pred)/t_pred", color="#dfe8f2", fontsize=7.5)
    inset.tick_params(colors="#9fb2c6", labelsize=7)
    for s in inset.spines.values():
        s.set_color("#3a4757")

    fig.savefig(out, facecolor=fig.patch.get_facecolor())

    print("%d submissions from %s" % (len(rows), src))
    print("mean |error| %.1f%%   mean signed error %+.1f%%" % (mean_abs, mean_signed))
    print("%-4s %8s %8s %8s" % ("d", "t_pred", "t_meas", "err%"))
    for r, e in sorted(zip(rows, errs), key=lambda x: x[0]["d"]):
        print("%-4d %8.2f %8.2f %+7.1f%%" % (r["d"], r["t_pred"], r["t_meas"], e))
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
