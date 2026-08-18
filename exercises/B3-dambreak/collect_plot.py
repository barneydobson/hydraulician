#!/usr/bin/env python3
"""collect_plot.py — B3 "Dam break: the moving jump"

Pools a class CSV of dam-break front-timing measurements on the `dambreak`
scene and draws ONE spatial picture of the whole reach: the upstream
negative wave (measured against a single shared station, compared with
sqrt(g h0)) and the downstream bore (measured on a personalised station
pair per student, compared with the moving-surge / conjugate-bore formula
at each student's own measured y2).

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Input CSV columns (Blackboard export, or data/simulated-class.csv):
    student,digit,scene,x1_bore,x2_bore,t1_bore,t2_bore,v_bore,
    y1_bore,y2_bore,v_bore_pred,x_neg,t_neg,v_neg,v_neg_pred,source

Required per row: x1_bore,x2_bore,v_bore (bore) and x_neg,v_neg (negative
wave). y1_bore/y2_bore let the script recompute the surge prediction itself
if v_bore_pred is missing; v_neg_pred is recomputed from H0 below if absent.
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Scene constants — `dambreak` (js/scenes.js): W=10, H=2.2, bed flat at
# y=0.2283 (Medium resolution). Reservoir x in [0, 2.56] filled to 1.85 m
# (h0 = 1.6286 m above bed); tailrace x in [2.64, 10] filled to 0.40 m
# (h1 = 0.1674 m above bed, WET bed — not the dry-front case). Dam/valve
# centreline x=2.60, thickness 0.08 -> effective release interface at the
# valve's upstream face, x_dam = 2.56 (see _archive/README-full.md Sec 5).
G = 9.81
X_DAM = 2.56
H0 = 1.62861          # reservoir depth above bed (measured via SIM.columns)
C0 = math.sqrt(G * H0)          # negative-wave prediction, sqrt(g h0)


def surge_speed(y1, y2):
    """Moving surge (bore) into still water of depth y1, downstream depth
    y2: c = sqrt(g y2 (y1+y2) / (2 y1))  (see _archive/README-full.md Sec 2b for the
    assumptions -- y1 still ahead of the bore, y2 the settled plateau
    behind it, both read from settled windows)."""
    return math.sqrt(G * y2 * (y1 + y2) / (2.0 * y1))


def fnum(row, key):
    v = (row.get(key) or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_rows(path):
    rows = []
    with open(path, newline="") as fh:
        lines = [ln for ln in fh if not ln.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        row = {(k or "").strip(): (v if v is not None else "") for k, v in row.items()}
        x1, x2, v_bore = fnum(row, "x1_bore"), fnum(row, "x2_bore"), fnum(row, "v_bore")
        x_neg, v_neg = fnum(row, "x_neg"), fnum(row, "v_neg")
        if x1 is None or x2 is None or v_bore is None:
            continue
        row["_xmid"] = 0.5 * (x1 + x2)
        row["_v_bore"] = v_bore
        y1b, y2b = fnum(row, "y1_bore"), fnum(row, "y2_bore")
        vpred = fnum(row, "v_bore_pred")
        if vpred is None and y1b and y2b:
            vpred = surge_speed(y1b, y2b)
        row["_v_bore_pred"] = vpred
        row["_x_neg"] = x_neg
        row["_v_neg"] = v_neg
        vnp = fnum(row, "v_neg_pred")
        row["_v_neg_pred"] = vnp if vnp is not None else C0
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvfile")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--title", default="B3 · the moving jump, read from the lab frame")
    args = ap.parse_args()

    rows = read_rows(args.csvfile)
    if not rows:
        sys.exit("no usable rows (need x1_bore,x2_bore,v_bore and x_neg,v_neg)")

    bore = [r for r in rows if r["_v_bore_pred"] is not None]
    neg = [r for r in rows if r["_v_neg"] is not None]

    fig, (ax, axr) = plt.subplots(
        2, 1, figsize=(8.4, 7.6), sharex=True,
        gridspec_kw={"height_ratios": [3, 1], "hspace": 0.08})

    ax.axvline(X_DAM, color="#8892a0", lw=1.5, ls=":", zorder=1)
    ax.annotate("dam (valve)", (X_DAM, ax.get_ylim()[1]), xytext=(4, -14),
                textcoords="offset points", fontsize=8, color="#8892a0", rotation=90,
                va="top")

    # negative wave: shared fixed station, one reference measurement (+ the
    # class's read-to-read scatter, see _archive/README-full.md Sec 5) vs a sqrt(g h0) line
    # drawn over the reservoir span it was measured in.
    xs_res = [0.0, X_DAM]
    ax.plot(xs_res, [C0, C0], "--", color="#3b6ea5", lw=2,
            label=r"negative wave prediction  $\sqrt{g h_0}$ = %.2f m/s" % C0, zorder=2)
    if neg:
        ax.scatter([r["_x_neg"] for r in neg], [r["_v_neg"] for r in neg],
                   marker="D", s=110, color="#3b6ea5", zorder=6,
                   edgecolor="white", linewidth=0.9,
                   label="class: negative wave (shared station x=%.1f m)" % neg[0]["_x_neg"])

    # bore: personalised station pair, per-point surge prediction using
    # each student's own measured y2 (see surge_speed()).
    if bore:
        order = sorted(bore, key=lambda r: r["_xmid"])
        for k, r in enumerate(order):
            lbl = "surge prediction at each student's own y₂" if k == 0 else None
            ax.plot([r["_xmid"], r["_xmid"]], [r["_v_bore"], r["_v_bore_pred"]],
                    "-", color="#e07a1f", lw=1.2, alpha=0.55, zorder=3)
            ax.scatter([r["_xmid"]], [r["_v_bore_pred"]], marker="_", s=220,
                       color="#e07a1f", linewidth=2.2, zorder=4, label=lbl)
        cvals = [fnum(r, "digit") for r in order]
        sc = ax.scatter([r["_xmid"] for r in order], [r["_v_bore"] for r in order],
                        c=cvals, cmap="viridis", s=100, zorder=6,
                        edgecolor="white", linewidth=0.9,
                        label="class: bore front (personalised station pair)")
        cb = fig.colorbar(sc, ax=[ax, axr], pad=0.02, fraction=0.045)
        cb.set_label("digit d  (station pair x₁=3.0+0.5d, x₂=x₁+1.5)")
        for r in order:
            name = (r.get("student") or "").strip()
            if name:
                ax.annotate(name, (r["_xmid"], r["_v_bore"]), textcoords="offset points",
                            xytext=(6, 5), fontsize=7, color="#44546a")

    ax.set_ylabel("measured front speed  (m/s)")
    ax.set_title(args.title)
    ax.grid(alpha=0.25)
    ax.set_xlim(0, 10)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.95)

    # residual panel
    if neg:
        errs_n = [100.0 * (r["_v_neg"] / r["_v_neg_pred"] - 1.0) for r in neg]
        axr.scatter([r["_x_neg"] for r in neg], errs_n, marker="D", s=90,
                    color="#3b6ea5", edgecolor="white", linewidth=0.8, zorder=5)
    if bore:
        errs_b = [100.0 * (r["_v_bore"] / r["_v_bore_pred"] - 1.0) for r in bore]
        axr.scatter([r["_xmid"] for r in bore], errs_b, marker="o", s=90,
                    color="#d1495b", edgecolor="white", linewidth=0.8, zorder=5)
    axr.axhline(0, color="#555", lw=1.2)
    axr.axhspan(-10, 10, color="#3b6ea5", alpha=0.06)
    axr.set_xlabel("position on the reach, x  (m)")
    axr.set_ylabel("error vs\nprediction (%)")
    axr.grid(alpha=0.25)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    fig.savefig(args.out, dpi=150, bbox_inches="tight")

    print("wrote %s" % args.out)
    if neg:
        vneg = [r["_v_neg"] for r in neg]
        errs_n = [100.0 * (v / neg[0]["_v_neg_pred"] - 1.0) for v in vneg]
        print("negative wave: %d point(s) at x=%.2f m   v=%.3f m/s   "
              "sqrt(g h0)=%.3f m/s   error %+.1f%%"
              % (len(neg), neg[0]["_x_neg"], sum(vneg) / len(vneg), C0,
                 sum(errs_n) / len(errs_n)))
    if bore:
        vb = [r["_v_bore"] for r in bore]
        errs_b = [100.0 * (r["_v_bore"] / r["_v_bore_pred"] - 1.0) for r in bore]
        print("bore front: %d points   v %.3f-%.3f m/s (decelerating with x)   "
              "mean error vs surge %+.1f%%   spread %.1f%%"
              % (len(bore), min(vb), max(vb), sum(errs_b) / len(errs_b),
                 max(errs_b) - min(errs_b)))


if __name__ == "__main__":
    main()
