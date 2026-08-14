#!/usr/bin/env python3
"""
collect_plot.py -- pool the B5 "Iribarren map jigsaw" class CSV and draw the
breaker-type map: each pair's cell plotted at its measured Iribarren number
xi0 = tanbeta / sqrt(H0/L0), coloured by the OBSERVED breaker behaviour
(spilling / plunging / surging / dies), against the classical band
boundaries (spilling < 0.5, plunging 0.5-3.3, surging > 3.3; W19-W20).

The point of the picture is the GAP: inside the classical "plunging" band,
no cell should be coloured "plunging" -- wave (tanbeta=0.10) cells land there
still spilling, wavesurge (tanbeta=0.70) cells land there already surging.
That gap, drawn plainly, IS the demo's payoff.

Usage:
  python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns ignored):
  pair, cell_id, scene, T_s, amp_m, H0_m, L0_m, xi0, behaviour, surf_width_m, note

Only `scene` (or `beach`), `xi0` and `behaviour` are strictly required.
`behaviour` must be one of: spilling, plunging, surging, dies
(case-insensitive; "plunging (nominal)" etc. is normalised down to
"plunging").
"""
import csv
import sys
import argparse
import math

BAND_LO, BAND_HI = 0.5, 3.3   # classical spilling/plunging and plunging/surging boundaries

BEHAV_STYLE = {
    "spilling": {"color": "#0d76ad", "marker": "o", "label": "spilling -- foam front migrates down the face"},
    "plunging": {"color": "#b3272d", "marker": "^", "label": "plunging -- overturning tongue observed"},
    "surging":  {"color": "#a86a0e", "marker": "s", "label": "surging -- no break, swash runs up"},
    "dies":     {"color": "#6a6f76", "marker": "x", "label": "dies -- amplitude below the 2-cell floor before the toe"},
}
SCENE_ROW = {"wave": 1.0, "wavesurge": 0.0}
SCENE_LABEL = {"wave": "wave (tanβ=0.10, 1:10 beach)", "wavesurge": "wavesurge (tanβ=0.70, 1:1.4 \"sea wall\")"}


def norm_behaviour(s):
    s = (s or "").strip().lower()
    if s.startswith("spill"):
        return "spilling"
    if s.startswith("plunge") or s.startswith("plunging"):
        return "plunging"
    if s.startswith("surg"):
        return "surging"
    if s.startswith("die"):
        return "dies"
    return s


def nominal_band(xi):
    if xi < BAND_LO:
        return "spilling"
    if xi <= BAND_HI:
        return "plunging"
    return "surging"


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                xi = float(r["xi0"])
            except (KeyError, ValueError, TypeError):
                continue
            scene = (r.get("scene") or r.get("beach") or "").strip().lower()
            behav = norm_behaviour(r.get("behaviour") or r.get("behavior"))
            if not behav:
                continue
            surf = r.get("surf_width_m", "")
            try:
                surf = float(surf) if surf not in ("", None, "NA", "N/A") else None
            except ValueError:
                surf = None
            rows.append({
                "pair": r.get("pair", ""), "cell_id": r.get("cell_id", ""),
                "scene": scene, "T": r.get("T_s", ""), "xi0": xi,
                "behaviour": behav, "surf_width": surf, "note": r.get("note", ""),
            })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    rows = load_rows(args.csv)
    if not rows:
        print("no usable rows in", args.csv)
        sys.exit(1)

    # ---- pooled stats, printed for the lecturer
    by_scene = {}
    for r in rows:
        by_scene.setdefault(r["scene"], []).append(r)

    for name, rs in sorted(by_scene.items()):
        xis = [r["xi0"] for r in rs]
        behavs = {}
        for r in rs:
            behavs[r["behaviour"]] = behavs.get(r["behaviour"], 0) + 1
        behav_str = ", ".join(f"{k}={v}" for k, v in sorted(behavs.items()))
        print(f"{name:>10}: {len(rs)} cells  xi0 {min(xis):.2f}-{max(xis):.2f}  [{behav_str}]")

    # the honest-gap check: anything BOTH nominally-plunging (0.5<=xi<=3.3)
    # AND observed as plunging?
    in_band = [r for r in rows if BAND_LO <= r["xi0"] <= BAND_HI]
    plunge_in_band = [r for r in in_band if r["behaviour"] == "plunging"]
    print(f"\ncells with {BAND_LO} <= xi0 <= {BAND_HI} (nominal plunging window): {len(in_band)}")
    for r in in_band:
        print(f"  {r['scene']:>10} xi0={r['xi0']:.2f}  observed={r['behaviour']}")
    print(f"of those, observed as ACTUALLY plunging: {len(plunge_in_band)}"
          f"{'  <-- the honest gap: none' if not plunge_in_band and in_band else ''}")

    # ---- plot
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 5.4))

    xi_lo, xi_hi = 0.1, 40
    ax.set_xscale("log")
    ax.set_xlim(xi_lo, xi_hi)
    ax.set_ylim(-0.6, 1.6)

    # classical bands
    ax.axvspan(xi_lo, BAND_LO, color="#0d76ad", alpha=0.06, zorder=0)
    ax.axvspan(BAND_LO, BAND_HI, color="#b3272d", alpha=0.09, zorder=0)
    ax.axvspan(BAND_HI, xi_hi, color="#a86a0e", alpha=0.06, zorder=0)
    ax.axvline(BAND_LO, color="#888", lw=1, ls="--", zorder=1)
    ax.axvline(BAND_HI, color="#888", lw=1, ls="--", zorder=1)
    ax.text(math.sqrt(xi_lo * BAND_LO), 1.45, "spilling\n(classical)", ha="center", va="top",
            fontsize=8.5, color="#0d76ad")
    ax.text(math.sqrt(BAND_LO * BAND_HI), 1.45, "PLUNGING\n(classical -- the honest gap)", ha="center", va="top",
            fontsize=8.5, color="#b3272d", fontweight="bold")
    ax.text(math.sqrt(BAND_HI * xi_hi), 1.45, "surging\n(classical)", ha="center", va="top",
            fontsize=8.5, color="#a86a0e")

    # scene lanes
    for scene, y in SCENE_ROW.items():
        ax.axhline(y, color="#555", lw=0.6, alpha=0.4, zorder=1)
        ax.text(xi_lo * 1.15, y + 0.14, SCENE_LABEL.get(scene, scene), fontsize=8.5,
                color="#ccc", ha="left", va="bottom")

    # points, jittered in y within their scene lane so overlaps stay visible
    seen = {}
    plotted_behav = set()
    for r in rows:
        y0 = SCENE_ROW.get(r["scene"], 0.5)
        key = (r["scene"], round(r["xi0"], 2))
        k = seen.get(key, 0)
        seen[key] = k + 1
        y = y0 + (k * 0.09) - 0.02
        style = BEHAV_STYLE.get(r["behaviour"], {"color": "#999", "marker": "*", "label": r["behaviour"]})
        lbl = style["label"] if r["behaviour"] not in plotted_behav else None
        plotted_behav.add(r["behaviour"])
        ax.scatter([r["xi0"]], [y], s=95, color=style["color"], marker=style["marker"],
                   edgecolor="white", linewidths=0.9, zorder=5, label=lbl)

    ax.set_xlabel(r"Iribarren number  $\xi_0 = \tan\beta / \sqrt{H_0/L_0}$   (log scale)")
    ax.set_yticks([])
    ax.set_title("B5 -- Iribarren map jigsaw, class-pooled\n"
                 "breaker behaviour ACTUALLY OBSERVED vs the classical ξ bands", fontsize=12)
    ax.legend(fontsize=8.5, loc="lower left", framealpha=0.9)
    ax.grid(alpha=0.15, which="both", axis="x")

    fig.savefig(args.out, dpi=140, bbox_inches="tight")
    print("\nwrote", args.out)


if __name__ == "__main__":
    main()
