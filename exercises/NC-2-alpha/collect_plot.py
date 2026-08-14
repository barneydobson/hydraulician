#!/usr/bin/env python3
"""
NC-2 "Is alpha really 1?" -- pooled class plot.

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, or data/simulated-class.csv):
    student,digit,kind,x_m,n_points,h_m,chip_umax,chip_V,chip_ratio,
    alpha_student5,alpha_student4,alpha_full_verify,source

`kind` separates the personalised uniform-reach submissions ("uniform", one
per digit) from the two SHARED, not-personalised contrast readings every
student also logs: "freeslip" and "gatewake_vena" / "gatewake_wake". Only
`alpha_student5` (each student's own 4-5-point mid-ordinate arithmetic) is
required for a "uniform" row -- `chip_ratio` (the printed u_max/V ratio) is
accepted as a fallback if a student ran out of time and only has the
"minimal version" (the programme spec's own phrase). Contrast rows carry
`alpha_full_verify` instead (the lecturer/rig.js verification number -- see
rig.js's NC2.freeSlip / NC2.gate) since those two are reference lines, not
class data to histogram.

This script does NOT re-derive alpha from raw (depth-fraction, u) points --
unlike a q/y0/y1-style formula, each student reads their OWN 4-5 points off
the curve, so there is no fixed set of raw columns to recompute from. The
spot-check this demo relies on instead is at the METHOD level: rig.js's
NC2.windowStats() independently measures the full-resolution alpha at every
digit's own station (`alpha_full_verify`), so the systematic 4-5-point bias
is quantified once, empirically, and quoted in the README/right-hand panel
below, rather than re-checked reading-by-reading.
"""
import argparse
import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def fnum(row, key):
    v = (row.get(key) or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_rows(path):
    with open(path, newline="") as fh:
        lines = [ln for ln in fh if not ln.lstrip().startswith("#")]
    rows = []
    for row in csv.DictReader(lines):
        row = {(k or "").strip(): (v if v is not None else "") for k, v in row.items()}
        row["_kind"] = (row.get("kind") or "uniform").strip() or "uniform"
        row["_alpha5"] = fnum(row, "alpha_student5")
        row["_alpha4"] = fnum(row, "alpha_student4")
        row["_ratio"] = fnum(row, "chip_ratio")
        row["_full"] = fnum(row, "alpha_full_verify")
        row["_digit"] = fnum(row, "digit")
        row["_x"] = fnum(row, "x_m")
        rows.append(row)
    return rows


def mean_sd(xs):
    n = len(xs)
    m = sum(xs) / n
    sd = (sum((x - m) ** 2 for x in xs) / (n - 1)) ** 0.5 if n > 1 else 0.0
    return m, sd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvfile")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--title", default="NC-2 · is α really 1?")
    args = ap.parse_args()

    rows = read_rows(args.csvfile)
    uni = [r for r in rows if r["_kind"] == "uniform"]
    if not uni:
        sys.exit("no usable 'uniform' rows (need alpha_student5 or chip_ratio)")

    # class submission: alpha_student5 if present, else the minimal-version ratio
    submitted = []
    for r in uni:
        v = r["_alpha5"] if r["_alpha5"] is not None else r["_ratio"]
        if v is not None:
            submitted.append((r, v))
    if not submitted:
        sys.exit("no row has alpha_student5 or chip_ratio")
    vals = [v for _, v in submitted]
    m_sub, sd_sub = mean_sd(vals)

    fullvals = [r["_full"] for r in uni if r["_full"] is not None]
    m_full, sd_full = mean_sd(fullvals) if fullvals else (float("nan"), float("nan"))

    def ref(kind):
        for r in rows:
            if r["_kind"] == kind and r["_full"] is not None:
                return r["_full"]
        return None

    fs = ref("freeslip")
    gv = ref("gatewake_vena")
    gw = ref("gatewake_wake")

    fig, (axh, axb) = plt.subplots(1, 2, figsize=(12.0, 5.2),
                                    gridspec_kw={"width_ratios": [1.35, 1]})

    # --------------------------------------------------- left: pooled histogram
    axh.axvspan(1.05, 1.20, color="#999", alpha=0.14, label="textbook uniform-reach\nrange 1.05–1.2 (N6)")
    axh.axvline(1.0, color="#666", lw=1.2, ls=":", label=r"$\alpha=1$ (assumed)")

    bins = [0.9 + 0.1 * k for k in range(int((2.6 - 0.9) / 0.1) + 1)]
    counts, _, _ = axh.hist(vals, bins=bins, color="#5fa8d3", edgecolor="white", zorder=3,
             label="class submissions (own station,\nuniform reach, s2, 4-5 pt method)")
    axh.axvline(m_sub, color="#1f5a86", lw=2.0, zorder=4,
                label=r"class mean (4-5 pt) $\alpha$ = %.2f $\pm$ %.2f" % (m_sub, sd_sub))
    if fullvals:
        axh.axvline(m_full, color="#1f5a86", lw=1.3, ls=(0, (1, 1)), zorder=4,
                    label=r"class mean (lecturer full-res verify) $\alpha$ = %.2f" % m_full)

    # free-slip / gate-wake reference lines are the FULL-RESOLUTION verification
    # number (the most accurate value we have for that condition) -- they are
    # therefore on the SAME basis as the dotted "full-res verify" line above,
    # not the solid histogram, which is the coarser 4-5 point student method.
    if fs is not None:
        axh.axvline(fs, color="#5fd08a", lw=2.0, ls="--", zorder=4,
                    label=r"free-slip walls (full-res), $\alpha$ = %.2f" % fs)
    if gv is not None:
        axh.axvline(gv, color="#ff8fa3", lw=1.6, ls="-.", zorder=4,
                    label=r"gate vena contracta (full-res), $\alpha$ = %.2f" % gv)
    if gw is not None:
        axh.axvline(gw, color="#d1495b", lw=2.2, ls="-.", zorder=4,
                    label=r"gate WAKE (full-res), $\alpha$ = %.2f" % gw)
    axh.axvline(2.0, color="#b33", lw=1.0, ls=":", alpha=0.7)
    ytop = max(3, int(max(counts)) + 1) * 1.18
    axh.annotate("N6's “>2 needs a\ncompound channel” —\nthe wake clears it on\nvertical shear alone",
                 xy=(2.0, 0), xytext=(2.05, ytop * 0.34), fontsize=6.7, color="#b33",
                 arrowprops=dict(arrowstyle="-", color="#b33", lw=0.6, alpha=0.6))

    axh.set_xlabel(r"energy coefficient $\alpha = \sum u^3\Delta y \,/\, (V^3 h)$")
    axh.set_ylabel("students")
    axh.set_title(args.title + "\n“assume $\\alpha=1$”, judged")
    axh.set_xlim(0.9, 2.6)
    axh.set_ylim(0, ytop)
    axh.legend(loc="upper left", fontsize=7, framealpha=0.95)
    axh.grid(alpha=0.2)

    # ------------------------------------------- right: coarse-vs-full bias
    have_full = [r for r in uni if r["_alpha5"] is not None and r["_full"] is not None]
    if have_full:
        xs = [r["_full"] for r in have_full]
        y5 = [r["_alpha5"] for r in have_full]
        y4 = [r["_alpha4"] for r in have_full if r["_alpha4"] is not None]
        x4 = [r["_full"] for r in have_full if r["_alpha4"] is not None]
        lo, hi = min(xs + y5) * 0.92, max(xs + y5) * 1.05
        axb.plot([lo, hi], [lo, hi], "-", color="#999", lw=1.2, label="1:1 (no bias)")
        axb.scatter(xs, y5, s=70, color="#1f5a86", edgecolor="white", linewidth=0.7,
                    zorder=5, label="5-point student read")
        if x4:
            axb.scatter(x4, y4, s=48, color="#e07a1f", marker="^", edgecolor="white",
                        linewidth=0.6, zorder=4, label="4-point student read")
        bias5 = sum((a - b) / b for a, b in zip(y5, xs)) / len(xs) * 100
        axb.set_xlim(lo, hi)
        axb.set_ylim(lo, hi)
        axb.set_xlabel(r"lecturer verification: full-resolution $\alpha$ (all rake points)")
        axb.set_ylabel(r"student's own coarse-point $\alpha$")
        axb.set_title("coarse sampling bias\nmean 5-pt error %+.1f%%" % bias5)
        axb.legend(loc="upper left", fontsize=7.5, framealpha=0.95)
        axb.grid(alpha=0.2)
    else:
        axb.axis("off")
        axb.text(0.5, 0.5, "no paired full-resolution\nreadings in this CSV", ha="center", va="center")

    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    fig.savefig(args.out, dpi=150, bbox_inches="tight")

    print("wrote %s" % args.out)
    print("NC-2 uniform-reach class: %d submissions   alpha %.2f - %.2f" % (len(vals), min(vals), max(vals)))
    print("class mean alpha (student 4-5 point method) = %.3f +/- %.3f (mean +/- sd)" % (m_sub, sd_sub))
    if fullvals:
        print("lecturer full-resolution verification, SAME stations: mean %.3f +/- %.3f" % (m_full, sd_full))
        if have_full:
            print("coarse-sampling bias: 5-point mean %+.1f%%  (n=%d paired stations)"
                  % (sum((a - b) / b for a, b in zip([r['_alpha5'] for r in have_full], [r['_full'] for r in have_full])) / len(have_full) * 100,
                     len(have_full)))
            have4 = [r for r in have_full if r["_alpha4"] is not None]
            if have4:
                bias4 = sum((r["_alpha4"] - r["_full"]) / r["_full"] for r in have4) / len(have4) * 100
                print("coarse-sampling bias: 4-point mean %+.1f%%  (n=%d paired stations)" % (bias4, len(have4)))
    print("textbook uniform-reach expectation: 1.05-1.2 (N6)")
    if fs is not None:
        print("free-slip walls contrast:  alpha = %.3f  (vs no-slip at the same station -- see README for why this is NOT a clean collapse to 1.0)" % fs)
    if gv is not None:
        print("gate vena contracta:       alpha = %.3f" % gv)
    if gw is not None:
        print("gate WAKE (0.5 m further): alpha = %.3f  %s" % (gw, "-- exceeds N6's >2/compound-channel line from pure vertical shear" if gw > 2 else ""))


if __name__ == "__main__":
    main()
