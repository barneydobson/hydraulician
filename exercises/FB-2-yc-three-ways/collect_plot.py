#!/usr/bin/env python3
"""FB-2 · pool a class CSV into the "critical depth three ways" verification plot.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Each student reads THREE depths at their own personalised q, on one rig
(reservoir -> broad crest -> free overfall, no scene change, no tailwater):

    y_c      = (q^2/g)^(1/3)              printed on the Inflow-q slider
    y_crest  = depth at mid-crest (hover/gauge, station rule: crest midpoint,
               >=6 cells clear of either shoulder)
    y_brink  = depth at the brink lip (the last wet column before the fall)

Pooled and normalised by each digit's OWN y_c, the three readings should sit
as three roughly horizontal bands across the class: y_c/y_c = 1 (trivial),
y_crest/y_c near-but-above 1 (the crest is a real, friction-affected 2D flow,
not the idealised loss-free plateau -- see _archive/README-full.md S5), and
y_brink/y_c
notably below 1 (curvature at the lip breaks the hydrostatic assumption; the
classical free-overfall figure is ~0.715).

Input columns (extras ignored, order irrelevant):
    q             unit discharge, m2/s per m width                 [required]
    yc            critical depth (q^2/g)^(1/3), m                   [optional, derived from q]
    y_crest       measured mid-crest depth, m                       [required]
    y_brink       measured brink-lip depth, m                       [required]
    dist_to_lip_yc  distance from the Fr=1 crossing to the lip, in y_c units
                                                                      [optional]
    digit, student, source                                          carried through

No numpy, no pandas -- matplotlib (Agg) only.
"""
import argparse, csv, math, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
DX_MEDIUM = 9.0 / 414.0          # sandbox scene, Resolution: Medium, m


def yc_of(q):
    return (q * q / G) ** (1.0 / 3.0)


def mean_sd(xs):
    n = len(xs)
    m = sum(xs) / n
    v = sum((x - m) ** 2 for x in xs) / n
    return m, math.sqrt(v)


def read(path):
    pts = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            try:
                q = float(row["q"])
                y_crest = float(row["y_crest"])
                y_brink = float(row["y_brink"])
            except (KeyError, ValueError):
                continue
            if q <= 0 or y_crest <= 0 or y_brink <= 0:
                continue
            yc = float(row["y_c"]) if row.get("y_c") else yc_of(q)
            dist = float(row["dist_to_lip_yc"]) if row.get("dist_to_lip_yc") else None
            pts.append(dict(q=q, yc=yc, y_crest=y_crest, y_brink=y_brink, dist=dist,
                            digit=row.get("digit") or row.get("d") or "",
                            student=row.get("student", ""), src=row.get("source", "")))
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--dx", type=float, default=DX_MEDIUM,
                     help="grid cell size for the quantisation error bar (m)")
    a = ap.parse_args()

    pts = read(a.csv)
    if len(pts) < 3:
        sys.exit("need at least 3 usable rows (columns q, y_crest, y_brink)")
    pts.sort(key=lambda p: p["q"])

    q = [p["q"] for p in pts]
    r_crest = [p["y_crest"] / p["yc"] for p in pts]
    r_brink = [p["y_brink"] / p["yc"] for p in pts]
    m_crest, sd_crest = mean_sd(r_crest)
    m_brink, sd_brink = mean_sd(r_brink)
    ebar = a.dx  # +/-1 cell in DEPTH units; converted per-point below for the ratio panel

    print("FB-2 pooled critical-depth check -- %d points, q %.2f-%.2f m2/s, y_c %.3f-%.3f m"
          % (len(pts), min(q), max(q), min(p["yc"] for p in pts), max(p["yc"] for p in pts)))
    print("  y_crest / y_c   %.3f - %.3f, mean %.3f +/- %.3f (sd)  [textbook ~1.0, a touch below at the d/s end]"
          % (min(r_crest), max(r_crest), m_crest, sd_crest))
    print("  y_brink / y_c   %.3f - %.3f, mean %.3f +/- %.3f (sd)  [classical free overfall = 0.715]"
          % (min(r_brink), max(r_brink), m_brink, sd_brink))
    print("  cell size (Medium)  %.4f m -> at the smallest q, y_brink = %.1f cells (quantisation matters there)"
          % (a.dx, pts[0]["y_brink"] / a.dx))
    have_dist = all(p["dist"] is not None for p in pts)
    if have_dist:
        dist = [p["dist"] for p in pts]
        m_dist, sd_dist = mean_sd(dist)
        print("  critical position   %.2f - %.2f y_c upstream of the lip, mean %.2f +/- %.2f (sd)  [ref. list: 3-4 y_c]"
              % (min(dist), max(dist), m_dist, sd_dist))

    # ------------------------------------------------------------------ plot
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(12.0, 5.2),
                                 gridspec_kw=dict(width_ratios=[1.4, 1]))
    fig.suptitle("FB-2 · critical depth three ways — depths normalised by each digit's own $y_c$", fontsize=13)

    ax.axhline(1.0, color="#444", lw=1.3, ls="--", zorder=1, label="$y_c / y_c = 1$ (the printed value)")
    ax.axhline(0.715, color="#d1495b", lw=1.1, ls=":", zorder=1,
               label="classical free-overfall $y_{brink}/y_c$ = 0.715")

    ecrest = [ebar / p["yc"] for p in pts]
    ebrink = [ebar / p["yc"] for p in pts]
    ax.errorbar(q, r_crest, yerr=ecrest, fmt="o", ms=8, color="#2f7fd0", ecolor="#9ab6d6",
                capsize=3, zorder=3, label="mid-crest  $y_{crest}/y_c$  (mean %.2f)" % m_crest)
    ax.errorbar(q, r_brink, yerr=ebrink, fmt="s", ms=8, color="#e08214", ecolor="#f0c896",
                capsize=3, zorder=3, label="brink lip  $y_{brink}/y_c$  (mean %.2f)" % m_brink)
    ax.axhline(m_crest, color="#2f7fd0", lw=1.0, ls=":", alpha=0.7)
    ax.axhline(m_brink, color="#e08214", lw=1.0, ls=":", alpha=0.7)
    for p in pts:
        if p["digit"] != "":
            ax.annotate(p["digit"], (p["q"], p["y_crest"] / p["yc"]), textcoords="offset points",
                        xytext=(6, 5), fontsize=8, color="#456")
    ax.set_xlabel("unit discharge q  (m²/s per m width)")
    ax.set_ylabel(r"depth / $y_c$")
    ax.set_ylim(0.5, 1.5)
    ax.grid(True, alpha=0.25)
    ax.legend(loc="center right", fontsize=8.5)
    ax.set_title("three bands: 1.0 (definition), ~%.2f (crest), ~%.2f (brink)" % (m_crest, m_brink), fontsize=10)

    if have_dist:
        bx.errorbar(q, dist, fmt="^", ms=8, color="#2a9d5c", zorder=3)
        for p in pts:
            if p["digit"] != "":
                bx.annotate(p["digit"], (p["q"], p["dist"]), textcoords="offset points",
                            xytext=(6, 5), fontsize=8, color="#456")
        bx.axhline(m_dist, color="#2a9d5c", lw=1.3, ls=":", label="measured mean %.2f $y_c$" % m_dist)
        bx.axhspan(3, 4, color="#d1495b", alpha=0.15, label="ref. list claim: 3-4 $y_c$")
        bx.set_xlabel("unit discharge q  (m²/s per m width)")
        bx.set_ylabel(r"critical ($Fr$=1) distance upstream of lip  ($y_c$ units)")
        bx.set_ylim(0, 4.5)
        bx.grid(True, alpha=0.25)
        bx.legend(loc="upper left", fontsize=8)
        bx.set_title("this rig's crest+brink act as ONE short control", fontsize=9.5)
    else:
        bx.axis("off")

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    d = os.path.dirname(a.out)
    if d:
        os.makedirs(d, exist_ok=True)
    fig.savefig(a.out, dpi=140)
    print("\nwrote %s" % a.out)


if __name__ == "__main__":
    main()
