#!/usr/bin/env python3
"""NC-2 · Gauging a vertical — pool the class CSV.

    python3 collect_plot.py class.csv                 # -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv  # the shipped dry-run class

Input CSV (Blackboard export, header row required, extra columns ignored),
one row per student per run, read in Average mode:

    student_id,digit,run,x_m,d_m,u02,u06,u08,V
    23140870,0,shallow,10,0.442,1.02,0.92,0.80,0.91

`run` is `shallow` or `deep`. u02, u06 and u08 are the point velocities
0.2 d, 0.6 d and 0.8 d below the surface (m/s), V the rake's depth-averaged
velocity — the full integration the two current-meter rules are judged
against:

    one-point  V1 = u06                    (the d < 0.75 m rule)
    two-point  V2 = (u02 + u08) / 2        (the d >= 0.75 m rule)

Two panels:

  left   each rule's error against the rake, 100·(V_rule/V − 1) %, at the
         class's two depths, with the 0.75 m handover and the log-law
         prediction (both rules read 0.084·u*/κ high on a log law)
  right  every student's three points as u/V against height above the bed
         over the depth, (z − z_b)/d, beside the log law for each run — the
         profile the two rules are sampling
"""
import argparse
import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G, S0, KAPPA = 9.81, 1.0 / 400.0, 0.41        # the gauging reach: 1 in 400
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"
ONE, TWO = "#2a78d6", "#eb6834"                 # one-point, two-point
RUNS = (("shallow", "#1baf7a", "o"), ("deep", "#4a3aa7", "s"))


def num(r, k):
    try:
        return float(r[k])
    except (KeyError, ValueError, TypeError):
        return None


def read(path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        lines = [ln for ln in fh if not ln.lstrip().startswith("#")]
    for r in csv.DictReader(lines):
        run = (r.get("run") or "").strip().lower()
        v = {k: num(r, k) for k in ("d_m", "u02", "u06", "u08", "V", "x_m")}
        if run not in ("shallow", "deep") or any(v[k] is None for k in ("d_m", "u02", "u06", "u08", "V")):
            print("  dropped (incomplete): %s" % dict(r))
            continue
        if not (0.1 < v["d_m"] < 1.6 and 0.1 < v["V"] < 4 and all(0 < v[k] < 4 for k in ("u02", "u06", "u08"))):
            print("  dropped (out of range): %s" % dict(r))
            continue
        v["run"] = run
        v["e1"] = 100 * (v["u06"] / v["V"] - 1)
        v["e2"] = 100 * (0.5 * (v["u02"] + v["u08"]) / v["V"] - 1)
        rows.append(v)
    return rows


def mean_sd(xs):
    m = sum(xs) / len(xs)
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) if len(xs) > 1 else 0.0
    return m, sd


def loglaw_bias(d, V):
    """Both rules' error on a pure log law, per cent: 0.084·u*/(κV)."""
    return 100 * (1 + math.log(0.4)) * math.sqrt(G * S0 * d) / (KAPPA * V)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                        "plots", "pooled-demo.png"))
    a = ap.parse_args()
    rows = read(a.csv)
    if not rows:
        raise SystemExit("no usable rows")

    print("%-8s %3s  %-24s %-24s %s" % ("run", "n", "one-point (u0.6)", "two-point (u0.2+u0.8)/2", "log law"))
    for run, _, _ in RUNS:
        rr = [r for r in rows if r["run"] == run]
        if not rr:
            continue
        m1, s1 = mean_sd([r["e1"] for r in rr])
        m2, s2 = mean_sd([r["e2"] for r in rr])
        d, _ = mean_sd([r["d_m"] for r in rr])
        V, _ = mean_sd([r["V"] for r in rr])
        print("%-8s %3d  %+5.1f %% ± %.1f            %+5.1f %% ± %.1f            %+.1f %%  (d = %.2f m)"
              % (run, len(rr), m1, s1, m2, s2, loglaw_bias(d, V), d))

    plt.rcParams.update({"font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                         "xtick.color": MUTED, "ytick.color": MUTED})
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(12, 5.2))

    # ---- left: each rule's error, at the two depths
    for k, (key, col, mk, lab, off) in enumerate((("e1", ONE, "o", "one-point  u₀.₆", -0.018),
                                                   ("e2", TWO, "s", "two-point  ½(u₀.₂ + u₀.₈)", 0.018))):
        xs = [r["d_m"] + off for r in rows]
        ax.scatter(xs, [r[key] for r in rows], s=34, marker=mk, color=col, alpha=0.55,
                   edgecolors="white", linewidths=0.8, label=lab, zorder=3)
        for run, _, _ in RUNS:
            rr = [r for r in rows if r["run"] == run]
            if len(rr) < 2:
                continue
            d, _ = mean_sd([r["d_m"] for r in rr])
            m, sd = mean_sd([r[key] for r in rr])
            ax.errorbar([d + 2.4 * off], [m], yerr=[sd], fmt=mk, color=col, ms=8, capsize=4,
                        lw=2, mec="white", mew=1.2, zorder=4)
    for run, _, _ in RUNS:
        rr = [r for r in rows if r["run"] == run]
        if not rr:
            continue
        d, _ = mean_sd([r["d_m"] for r in rr])
        V, _ = mean_sd([r["V"] for r in rr])
        b = loglaw_bias(d, V)
        ax.plot([d - 0.09, d + 0.09], [b, b], color=MUTED, lw=2, ls=(0, (4, 2)), zorder=2)
        ax.annotate("log law %+.1f %%" % b, (d + 0.095, b), va="center", fontsize=9, color=MUTED)
        ax.annotate(run, (d, 0.0), xycoords=("data", "axes fraction"), xytext=(0, 6),
                    textcoords="offset points", ha="center", fontsize=9, color=MUTED)
    ax.axvline(0.75, color=MUTED, lw=1, ls=":")
    ax.annotate("0.75 m: one-point below,\ntwo-point above", (0.75, 0.97), xycoords=("data", "axes fraction"),
                xytext=(6, 0), textcoords="offset points", va="top", fontsize=9, color=MUTED)
    errs = [r[k] for r in rows for k in ("e1", "e2")]
    ax.set_ylim(min(-2.0, min(errs) - 1.0), max(4.0, max(errs) + 1.5))
    ax.axhline(0, color=INK, lw=0.8)
    ax.set_xlim(0.2, 1.3)
    ax.set_xlabel("depth d (m)")
    ax.set_ylabel("error against the rake's V  (%)")
    ax.set_title("Each rule against the full integration", loc="left", fontsize=11, color=INK)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.legend(loc="center right", frameon=False, fontsize=9)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

    # ---- right: the class's profile points against the log law
    for run, col, mk in RUNS:
        rr = [r for r in rows if r["run"] == run]
        if not rr:
            continue
        ys, us = [], []
        for r in rr:
            for frac, k in ((0.8, "u02"), (0.4, "u06"), (0.2, "u08")):
                ys.append(frac)
                us.append(r[k] / r["V"])
        bx.scatter(us, ys, s=30, marker=mk, color=col, alpha=0.5, edgecolors="white", linewidths=0.8,
                   label="%s (d ≈ %.2f m)" % (run, mean_sd([r["d_m"] for r in rr])[0]), zorder=3)
        d, _ = mean_sd([r["d_m"] for r in rr])
        V, _ = mean_sd([r["V"] for r in rr])
        a_ = math.sqrt(G * S0 * d) / (KAPPA * V)
        yy = [0.02 + 0.98 * i / 200 for i in range(201)]
        bx.plot([1 + a_ * (1 + math.log(y)) for y in yy], yy, color=col, lw=2, zorder=2)
    bx.axvline(1.0, color=INK, lw=0.8)
    bx.axhline(1 / math.e, color=MUTED, lw=1, ls=":")
    bx.annotate("d/e: a log law equals V here", (0.62, 1 / math.e), xytext=(0, -12),
                textcoords="offset points", fontsize=9, color=MUTED)
    for frac, lab in ((0.8, "0.2 d"), (0.4, "0.6 d"), (0.2, "0.8 d")):
        bx.annotate(lab + " below the surface", (1.36, frac), va="center", fontsize=8.5, color=MUTED)
    bx.set_xlim(0.6, 1.6)
    bx.set_ylim(0, 1.0)
    bx.set_xlabel("u / V")
    bx.set_ylabel("height above the bed over the depth, (z − z_b) / d")
    bx.set_title("The class's points on the profile", loc="left", fontsize=11, color=INK)
    bx.grid(color=GRID, lw=0.8)
    bx.legend(loc="upper left", frameon=False, fontsize=9)
    for s in ("top", "right"):
        bx.spines[s].set_visible(False)

    fig.suptitle("NC-2 · gauging a vertical: n = %d readings" % len(rows), x=0.01, ha="left",
                 fontsize=12, color=INK)
    fig.tight_layout()
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    fig.savefig(a.out, dpi=150)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
