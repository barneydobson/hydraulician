#!/usr/bin/env python3
"""
NC-3 "Bed shear and the riprap size" — pooled class plot.

Usage:
    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

Input CSV (Blackboard export, or data/simulated-class.csv):
    student,digit,scene,q,h,Sf[,tau0,Dmin_mm,source,...]

Only `scene`, `q`, `h` and `Sf` are required; `tau0` and `Dmin_mm` are
recomputed here if absent so a lecturer's raw Blackboard export (which only
asks students for h and S_f, per the worksheet) still plots. Extra columns
(station_x, h_min/h_max, Sf_min/Sf_max, flatness_pct, ...) are ignored if
present, used for the spread panel if present.

N13: tau0 = rho*g*h*Sf (a MEASUREMENT off the cursor readout), then on paper
    D_min = tau0 / [0.056*(rho_s - rho)*g],  rho_s = 2650, rho = 1000.

Two series, not one sweep: `scene=s2` rows are the personalised-q class sweep
(steep, 1-in-4); any `scene=m2` row is the single fixed-q MILD-SLOPE anchor
every student also reads (m2's reservoir level is static and must not be
re-tuned per student — see the README). The point of the pooled plot is the
CONTRAST between the two clusters as much as the spread within the s2 sweep.
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RHO = 1000.0
G = 9.81
RHOS = 2650.0
SHIELDS = 0.056
DENOM = SHIELDS * (RHOS - RHO) * G   # tau0 = Dmin * DENOM


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
        scene = (row.get("scene") or "").strip() or "s2"
        q = fnum(row, "q")
        h = fnum(row, "h")
        Sf = fnum(row, "Sf") if fnum(row, "Sf") is not None else fnum(row, "S_f")
        if q is None or q <= 0:
            continue
        tau0 = fnum(row, "tau0")
        if tau0 is None:
            if h is None or Sf is None or h <= 0 or Sf <= 0:
                continue
            tau0 = RHO * G * h * Sf
        dmin_mm = fnum(row, "Dmin_mm")
        if dmin_mm is None:
            dmin_mm = 1000.0 * tau0 / DENOM
        row["_scene"], row["_q"], row["_h"], row["_Sf"] = scene, q, h, Sf
        row["_tau0"], row["_dmin"] = tau0, dmin_mm
        rows.append(row)
    return rows


# Grain-size class edges (mm), per the worksheet: sand < 2 < gravel < 64 <
# cobbles < 256 < boulders.
BANDS = [
    (0.06, 2, "sand", "#c9b183"),
    (2, 64, "gravel", "#b08968"),
    (64, 256, "cobbles", "#8a8f98"),
    (256, 2000, "boulders", "#5b6470"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvfile")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("--title", default="NC-3 · bed shear sets the riprap size (N11–N13)")
    args = ap.parse_args()

    rows = read_rows(args.csvfile)
    if not rows:
        sys.exit("no usable rows (need scene, q and either tau0 or h+Sf)")

    s2 = [r for r in rows if r["_scene"] == "s2"]
    others = [r for r in rows if r["_scene"] != "s2"]
    if not s2:
        sys.exit("no s2 (steep-scene sweep) rows found")

    fig, (axl, axr) = plt.subplots(1, 2, figsize=(12.5, 5.2),
                                    gridspec_kw={"width_ratios": [1.55, 1]})

    # -------------------------------------------------- left: the grain-size payoff
    all_dmin = [r["_dmin"] for r in rows]
    ylo, yhi = min(0.5, min(all_dmin) * 0.5), max(all_dmin) * 1.8
    xlo, xhi = min(r["_q"] for r in rows) * 0.75, max(r["_q"] for r in rows) * 1.15

    for lo, hi, name, colour in BANDS:
        blo, bhi = max(lo, ylo), min(hi, yhi)
        if blo >= bhi:
            continue
        axl.axhspan(blo, bhi, color=colour, alpha=0.16, zorder=0)
        axl.text(xhi * 0.985, math.sqrt(max(blo, lo) * min(bhi, hi)), name,
                  ha="right", va="center", fontsize=8.5, color=colour,
                  fontweight="bold", zorder=1)

    have_digit = all(fnum(r, "digit") is not None for r in s2)
    qs = [r["_q"] for r in s2]
    dm = [r["_dmin"] for r in s2]
    sc = axl.scatter(qs, dm, c=[fnum(r, "digit") for r in s2] if have_digit else "#3b6ea5",
                      cmap="viridis" if have_digit else None, s=100, zorder=5,
                      edgecolor="white", linewidth=0.9, label="class sweep (scene s2, steep 1-in-4)")
    if have_digit:
        cb = fig.colorbar(sc, ax=axl, pad=0.02, fraction=0.045)
        cb.set_label("digit d")

    for r in others:
        axl.scatter([r["_q"]], [r["_dmin"]], marker="*", s=420, color="#d1495b",
                    edgecolor="white", linewidth=1.0, zorder=6,
                    label="m2 anchor (mild, fixed q — see README)")
        axl.annotate("m2 anchor\nτ0=%.0f N/m²\nD=%.0f mm" % (r["_tau0"], r["_dmin"]),
                     (r["_q"], r["_dmin"]), textcoords="offset points", xytext=(10, 6),
                     fontsize=8, color="#7a1f30", fontweight="bold")

    axl.set_xscale("linear")
    axl.set_yscale("log")
    axl.set_xlim(min(xlo, (others[0]["_q"] * 0.7) if others else xlo), xhi)
    axl.set_ylim(ylo, yhi)
    axl.set_xlabel(r"unit discharge  $q$  (m$^2$/s)")
    axl.set_ylabel(r"$D_{min}$ (mm, log scale)  —  Shields/N13 from measured $\tau_0$")
    axl.set_title(args.title)
    axl.grid(alpha=0.25, which="both")
    handles, labels = axl.get_legend_handles_labels()
    seen, H, L = set(), [], []
    for h_, l_ in zip(handles, labels):
        if l_ not in seen:
            seen.add(l_); H.append(h_); L.append(l_)
    axl.legend(H, L, loc="upper left", fontsize=8, framealpha=0.95)

    # ------------------------------------------------- right: per-row measurement spread
    digits = [fnum(r, "digit") for r in s2]
    order = sorted(range(len(s2)), key=lambda k: digits[k] if digits[k] is not None else k)
    xs = list(range(len(s2)))
    dm_ord = [dm[k] for k in order]
    lo_b, hi_b = [], []
    for k in order:
        r = s2[k]
        hmin, hmax = fnum(r, "h_min"), fnum(r, "h_max")
        sfmin, sfmax = fnum(r, "Sf_min"), fnum(r, "Sf_max")
        if None not in (hmin, hmax, sfmin, sfmax):
            lo_b.append(1000.0 * RHO * G * hmin * sfmin / DENOM)
            hi_b.append(1000.0 * RHO * G * hmax * sfmax / DENOM)
        else:
            lo_b.append(dm[k]); hi_b.append(dm[k])
    yerr = [[dm_ord[i] - lo_b[i] for i in range(len(xs))],
            [hi_b[i] - dm_ord[i] for i in range(len(xs))]]
    axr.errorbar(xs, dm_ord, yerr=yerr, fmt="o", color="#3b6ea5", ecolor="#9fb8d1",
                 elinewidth=3, capsize=4, markersize=7, zorder=5)
    axr.set_yscale("log")
    axr.set_xticks(xs)
    axr.set_xticklabels([str(int(digits[k])) if digits[k] is not None else "?" for k in order])
    axr.set_xlabel("digit d (student)")
    axr.set_ylabel(r"$D_{min}$ (mm, log) — window extremes as error bars")
    axr.set_title("per-row flutter\n(roll-wave-driven, see README)")
    axr.grid(alpha=0.25, which="both")

    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    fig.savefig(args.out, dpi=150, bbox_inches="tight")

    print("wrote %s" % args.out)
    print("NC-3 s2 points: %d   q %.2f-%.2f   tau0 %.0f-%.0f N/m^2   Dmin %.0f-%.0f mm"
          % (len(s2), min(qs), max(qs), min(r["_tau0"] for r in s2), max(r["_tau0"] for r in s2),
             min(dm), max(dm)))
    if others:
        for r in others:
            print("m2 anchor (scene=%s, q=%.3f): tau0 = %.1f N/m^2   Dmin = %.1f mm"
                  % (r["_scene"], r["_q"], r["_tau0"], r["_dmin"]))
        print("pooled span (m2 anchor -> s2 max): Dmin %.1f -> %.1f mm  (x%.1f)"
              % (min(r["_dmin"] for r in others), max(dm), max(dm) / min(r["_dmin"] for r in others)))
    print("s2-only span: x%.2f (all within the 'boulders' band, see README §4 discussion)"
          % (max(dm) / min(dm)))


if __name__ == "__main__":
    main()
