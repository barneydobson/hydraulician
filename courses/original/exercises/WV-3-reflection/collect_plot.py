#!/usr/bin/env python3
"""
collect_plot.py -- pool the WV-3 "reflection coefficient" class CSV and plot
K_refl = (a_max - a_min)/(a_max + a_min) against wave period T, for both the
steep "sea wall" flume (wavesurge, ξ ~ 3.6-9) and the 1-in-10 spilling-beach
contrast (wave, ξ ~ 0.4-0.7), against the textbook reference bands quoted in
the programme (sea walls 0.7-1.0, beaches 0.05-0.2; W21).

Usage:
  python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns ignored):
  student, digit, scene, series, T_s, Krefl
  [, amp_m, L_theory_m, c_ms, method, node_spacing_m,
     node_spacing_theory_m, aMax_m, aMin_m, note]

`series` must be "surging" (wavesurge, the steep 1:1.4 "sea wall") or
"spilling" (wave, the 1:10 dissipative beach). Rows are otherwise generic --
extra scenes/series would just plot as their own colour.
"""
import csv
import sys
import argparse

SERIES_STYLE = {
    "surging":  {"color": "#0d76ad", "marker": "o", "label": "wavesurge -- 1:1.4 \"sea wall\" (surging)"},
    "spilling": {"color": "#a86a0e", "marker": "s", "label": "wave -- 1:10 beach (spilling)"},
}
EXPECT_BANDS = {
    "surging":  {"lo": 0.7, "hi": 1.0, "color": "#0d76ad", "label": "expected: sea walls 0.7-1.0 (W21)"},
    "spilling": {"lo": 0.05, "hi": 0.2, "color": "#a86a0e", "label": "expected: beaches 0.05-0.2 (W21)"},
}


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                T = float(r["T_s"])
                Krefl = float(r["Krefl"])
            except (KeyError, ValueError, TypeError):
                continue
            series = (r.get("series") or r.get("scene") or "").strip().lower()
            rows.append({
                "student": r.get("student", ""), "digit": r.get("digit", ""),
                "scene": r.get("scene", ""), "series": series,
                "T": T, "Krefl": Krefl, "note": r.get("note", ""),
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

    by_series = {}
    for r in rows:
        by_series.setdefault(r["series"], []).append(r)

    for name, rs in sorted(by_series.items()):
        Ts = [r["T"] for r in rs]
        Ks = [r["Krefl"] for r in rs]
        mean_k = sum(Ks) / len(Ks)
        band = EXPECT_BANDS.get(name)
        in_band = ""
        if band:
            n_in = sum(1 for k in Ks if band["lo"] <= k <= band["hi"])
            in_band = f"  {n_in}/{len(Ks)} inside the {band['lo']}-{band['hi']} expected band"
        print(f"{name:>9}: {len(rs)} points  T {min(Ts):.2f}-{max(Ts):.2f} s  "
              f"Krefl {min(Ks):.3f}-{max(Ks):.3f}  mean {mean_k:.3f}{in_band}")

    # ---- plot
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 6.2))

    for name, band in EXPECT_BANDS.items():
        ax.axhspan(band["lo"], band["hi"], color=band["color"], alpha=0.08, zorder=1)
        ax.text(5.75, (band["lo"] + band["hi"]) / 2, band["label"],
                ha="right", va="center", fontsize=8.5, color=band["color"])

    for name, rs in sorted(by_series.items()):
        style = SERIES_STYLE.get(name, {"color": "#888", "marker": "x", "label": name})
        # jitter repeated (T, Krefl) points slightly in x so overlapping
        # student submissions (shared digits -> shared period) stay visible
        seen = {}
        xs, ys = [], []
        for r in rs:
            key = (r["T"], round(r["Krefl"], 4))
            k = seen.get(key, 0)
            seen[key] = k + 1
            xs.append(r["T"] + k * 0.025)
            ys.append(r["Krefl"])
        ax.scatter(xs, ys, s=70, color=style["color"], marker=style["marker"],
                   edgecolor="white", linewidths=0.8, zorder=5,
                   label=f"{style['label']} (n={len(rs)})")

    ax.set_xlabel("piston period T (s)")
    ax.set_ylabel(r"$K_{refl} = (a_{max} - a_{min}) / (a_{max} + a_{min})$")
    ax.set_title("WV-3 -- reflection coefficient vs period, class-pooled\n"
                 "steep sea wall (surging) vs 1:10 beach (spilling)", fontsize=12)
    ax.set_ylim(-0.02, 1.05)
    ax.set_xlim(0.8, 4.6)
    ax.legend(fontsize=8.5, loc="center right")
    ax.grid(alpha=0.25)
    ax.axhline(0, color="#999", lw=0.8)

    fig.savefig(args.out, dpi=140, bbox_inches="tight")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
