#!/usr/bin/env python3
"""collect_plot.py — GV-1 "The class digitises the backwater curve"

Pools a class CSV of (x, elevation) hover readings on the m1 scene (M1
backwater behind a weir) and overlays a direct-step GVF integration computed
upstream from the weir, using the class's own measured Manning's n and the
scene's S0 and q. Matplotlib only (Agg backend), no numpy/pandas — matches
the other exercises/*/collect_plot.py scripts in this repo.

Usage:
    python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png
"""
import argparse
import csv
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------------
# Scene constants — m1 ("M1 - backwater behind a weir"), read verbatim from
# js/scenes.js (channel({W:16, H:1.05, bed0:0.35, S0:0.0147, cf:0.125,
# q:0.25, inletDepth:0.54, weir:{x:13.4, h:0.42, w:0.7}, xEnd:14.6}, ...)).
# m1 has no slope break (xBreak defaults to xEnd), so bedTop(x) is one
# straight line over the whole reach a student can stand in.
G = 9.81
Q = 0.25          # m^2/s, unit discharge (scene default — no student changes it)
S0 = 0.0147       # bed slope (1 in 68), scene's S0
BED0 = 0.35       # bedTop(x) = BED0 - S0*x
WEIR_X = 13.4     # weir centreline, m
WEIR_H = 0.42     # crest height above the local bed
WEIR_W = 0.70     # weir wall thickness -> upstream face at WEIR_X - WEIR_W/2

# Measured "delivered" n (_archive/README-full.md §5 + Director report): two independent
# ~15-sample median windows at the mid-reach station x = 7 m gave medians
# 0.0335 and 0.0439 (pooled 18-sample median 0.0346); S_f in a near-flat
# backwater is a small difference of a smoothed energy line (CLAUDE.md: "in
# a backwater curve dE/dx is small and differencing it over a short window
# is mostly noise"), so any SINGLE hover read of n can land anywhere from
# about 0.009 to 0.069. 0.035 is the pooled, defensible value.
MEASURED_N = 0.035

WEIR_FACE_X = WEIR_X - WEIR_W / 2.0     # 13.05 m — where the solid wall begins
FAIL_ZONE = 0.5                          # m, per the programme's own payoff text
FAIL_ZONE_X0 = WEIR_FACE_X - FAIL_ZONE   # 12.55 m


def bed_top(x):
    return BED0 - S0 * x


def gvf_slope(y):
    """dy/dx = (S0 - Sf) / (1 - Fr^2), y = depth. R = h: this is a 2D
    vertical-plane slice with no side walls in view, so the wetted
    perimeter is just the free-surface width and R -> h exactly (stated
    per the assignment's own convention: 'S_f = n^2 V^2 / R^(4/3) with
    R = h in a wide 2D slice')."""
    V = Q / y
    Fr2 = (V * V) / (G * y)
    Sf = (MEASURED_N ** 2) * V * V / (y ** (4.0 / 3.0))
    return (S0 - Sf) / (1.0 - Fr2)


def rk4_march(x0, y0, x1, step):
    """March the GVF ODE from x0 to x1 (step's sign sets direction),
    returning a list of (x, depth) samples including the start point."""
    out = [(x0, y0)]
    x, y = x0, y0
    n = int(round((x1 - x0) / step))
    for _ in range(abs(n)):
        h = step if (x1 - x) / step > 0 else (x1 - x)
        if abs(h) < 1e-9:
            break
        k1 = gvf_slope(y)
        k2 = gvf_slope(y + 0.5 * h * k1)
        k3 = gvf_slope(y + 0.5 * h * k2)
        k4 = gvf_slope(y + h * k3)
        y = y + (h / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        x = x + h
        out.append((x, y))
        if y <= 0.01:
            break
    return out


def load_class(path):
    rows = []
    with open(path, newline="") as fh:
        r = csv.DictReader(fh)
        for row in r:
            x = float(row["x"])
            if "elevation" in row and row["elevation"] not in (None, ""):
                elev = float(row["elevation"])
            else:
                # derive from depth_h + bed_elev if a class submitted those instead
                elev = float(row["depth_h"]) + float(row["bed_elev"])
            rows.append({
                "student": row.get("student", "?"),
                "digit": row.get("digit", "?"),
                "x": x,
                "elevation": elev,
                "ok": row.get("ok_flag", "1"),
            })
    rows.sort(key=lambda r: r["x"])
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_path", nargs="?", default="data/simulated-class.csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_class(args.csv_path)
    if not rows:
        print("no rows in %s" % args.csv_path, file=sys.stderr)
        sys.exit(1)

    # --- seed the direct step from the class's OWN best near-weir point,
    # not from a theoretical weir-rating formula. (Dry-run finding: assuming
    # critical depth at the crest, elevation = crest + y_c, predicts a pool
    # ~130 mm LOWER than the measured 0.891 m -- this weir runs at H/P ~0.76,
    # well outside the small-H/P regime where that idealisation is good, and
    # CLAUDE.md itself notes broad-crested weirs pond well above 1.0 y_c.
    # Seeding from a measurement sidesteps a bad weir-coefficient assumption
    # entirely, and is standard GVF practice: start from a known control.)
    seed_candidates = [r for r in rows if r["x"] <= WEIR_FACE_X - 0.15]
    if not seed_candidates:
        print("no station clear of the weir-face zone to seed from", file=sys.stderr)
        sys.exit(1)
    seed = max(seed_candidates, key=lambda r: r["x"])
    y_seed = seed["elevation"] - bed_top(seed["x"])

    x_min = max(0.2, min(r["x"] for r in rows) - 0.5)
    upstream = rk4_march(seed["x"], y_seed, x_min, -0.01)
    downstream = rk4_march(seed["x"], y_seed, min(WEIR_X, seed["x"] + 1.6), 0.01)
    curve = list(reversed(upstream)) + downstream[1:]
    curve_elev = [(x, bed_top(x) + y) for x, y in curve]

    def predict(x):
        # linear-interpolate the curve at x
        for i in range(len(curve_elev) - 1):
            x0, y0 = curve_elev[i]
            x1, y1 = curve_elev[i + 1]
            if x0 <= x <= x1 or x1 <= x <= x0:
                if x1 == x0:
                    return y0
                t = (x - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return None

    clean = [r for r in rows if r["x"] < WEIR_FACE_X - 0.15]
    validation = [r for r in clean if r is not seed]

    resid = []
    for r in validation:
        p = predict(r["x"])
        if p is not None:
            resid.append((r["x"], r["elevation"] - p))
    rms = math.sqrt(sum(d * d for _, d in resid) / len(resid)) if resid else float("nan")
    max_abs = max((abs(d) for _, d in resid), default=float("nan"))

    zone_rows = [r for r in rows if r["x"] >= FAIL_ZONE_X0]
    zone_resid = []
    for r in zone_rows:
        p = predict(r["x"])
        if p is not None:
            zone_resid.append((r["x"], r["elevation"] - p))

    print("GV-1 pooled class: %d points (%d used for direct-step validation, "
          "1 used as the upstream-march seed)" % (len(rows), len(validation)))
    print("seed: x=%.2f m, elevation=%.5f m (depth %.5f m)" % (seed["x"], seed["elevation"], y_seed))
    print("measured n (mid-reach, pooled median) = %.4f" % MEASURED_N)
    print("RMS gap, measured vs direct-step, x < %.2f m (outside the weir-face zone): "
          "%.1f mm (max |gap| %.1f mm, n=%d)" % (WEIR_FACE_X - 0.15, rms * 1000, max_abs * 1000, len(resid)))
    for x, d in resid:
        print("  x=%5.2f  gap %+6.1f mm" % (x, d * 1000))
    if zone_resid:
        print("weir-face zone (x >= %.2f m, within ~%.1f m of the wall face) -- "
              "1D hydrostatic theory NOT expected to hold here:" % (FAIL_ZONE_X0, FAIL_ZONE))
        for x, d in zone_resid:
            print("  x=%5.2f  gap %+6.1f mm  <-- inside the ~%.1fm failure zone"
                  % (x, d * 1000, FAIL_ZONE))

    # ------------------------------------------------------------------ plot
    # Two panels: the top one is ZOOMED on the water surface (millimetres
    # matter there, and that is the actual payoff); the bottom one gives the
    # true geometry for scale (bed drops 0.17 m over the reach -- on that
    # scale the surface would look perfectly flat and the whole point of
    # the demo would be invisible).
    fig, (ax, axg) = plt.subplots(2, 1, figsize=(9, 6.4), dpi=140,
                                   gridspec_kw={"height_ratios": [2.6, 1]}, sharex=True)

    cx = [x for x, _ in curve_elev]
    cy = [y for _, y in curve_elev]
    ax.plot(cx, cy, color="#2f6fb3", lw=2.0, label="direct step (measured n=%.3f)" % MEASURED_N,
             zorder=3)

    zx = [r["x"] for r in zone_rows if r is not seed]
    zy = [r["elevation"] for r in zone_rows if r is not seed]

    ax.axvspan(FAIL_ZONE_X0, WEIR_X + 0.05, color="#e0555c", alpha=0.10, zorder=0)
    ax.axvline(WEIR_FACE_X, color="#e0555c", ls=":", lw=1.2, alpha=0.7)
    ax.text(FAIL_ZONE_X0 - 3.0, max(cy) + 0.003,
            "~0.5 m zone: 1D hydrostatic\nassumption honestly fails here →",
            fontsize=8.5, color="#8a2f33", ha="left", va="bottom")

    val_x = [r["x"] for r in validation]
    val_y = [r["elevation"] for r in validation]
    ax.scatter(val_x, val_y, s=46, color="#1c8c4e", zorder=5, label="measured (validation)")

    ax.scatter([seed["x"]], [seed["elevation"]], s=70, marker="D", color="#c98a1c", zorder=6,
               label="measured (direct-step seed, x=%.0f m)" % seed["x"])

    if zx:
        ax.scatter(zx, zy, s=60, marker="s", color="#b23a3a", zorder=6,
                   label="measured, inside failure zone")

    for r in rows:
        ax.annotate(r["digit"] if r["digit"] not in ("", "?") else "", (r["x"], r["elevation"]),
                    textcoords="offset points", xytext=(0, 7), fontsize=7, ha="center", color="#555")

    ax.set_ylabel("surface elevation (m)")
    ax.set_title("GV-1 -- class-measured M1 backwater vs direct-step (n=%.3f, S0=1:%.0f, q=%.2f m^2/s)"
                 % (MEASURED_N, 1 / S0, Q))
    y_all = cy + val_y + [seed["elevation"]] + zy
    pad = max(0.008, (max(y_all) - min(y_all)) * 0.25)
    ax.set_ylim(min(y_all) - pad, max(y_all) + pad * 2.2)
    ax.legend(loc="lower left", fontsize=8, framealpha=0.9)
    ax.grid(alpha=0.15)

    # --- geometry context panel: true-scale bed, weir and water
    bx = [x for x, _ in curve_elev]
    by = [bed_top(x) for x in bx]
    axg.plot(bx, by, color="#7a5230", lw=1.2, zorder=2)
    axg.fill_between(bx, -0.05, by, color="#7a5230", alpha=0.30, zorder=1)
    axg.fill_between(cx, by, cy, color="#7fc4e8", alpha=0.45, zorder=1)
    crest_elev = bed_top(WEIR_X) + WEIR_H
    axg.plot([WEIR_X, WEIR_X], [bed_top(WEIR_X), crest_elev], color="#444", lw=4,
              solid_capstyle="butt", zorder=4, label="weir")
    axg.axvspan(FAIL_ZONE_X0, WEIR_X + 0.05, color="#e0555c", alpha=0.10, zorder=0)
    axg.set_xlabel("x (m)")
    axg.set_ylabel("elevation (m)")
    axg.set_ylim(-0.05, crest_elev + 0.05)
    axg.legend(loc="upper right", fontsize=8, framealpha=0.9)
    axg.grid(alpha=0.15)

    ax.set_xlim(min(bx) - 0.3, WEIR_X + 0.6)
    fig.tight_layout()
    fig.savefig(args.out)
    print("wrote %s" % args.out)


if __name__ == "__main__":
    main()
