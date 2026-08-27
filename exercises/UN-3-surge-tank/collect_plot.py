#!/usr/bin/env python3
"""UN-3 pooling — which friction law do the class's surge crests obey?

    python3 collect_plot.py class.csv                 -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv   the shipped dry-run class

One row per student: student_id,digit,level_m,c1_m,c2_m,c3_m,c4_m,c5_m
(level_m and any extra columns are carried but not needed for the test.)

Friction ∝ u² takes Δc ∝ c² out of the surge per cycle, so 1/c climbs in equal
steps of 4/(3Y) — Y being lA/(2gkA_s) from the lectures' closed form. Invert it
for k and every student should report the same number, whatever their reservoir
level. One line per student, 1/c against crest number: straight, and parallel.
"""
import argparse
import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt   # noqa: E402


def read_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                c = [float(r["c%d_m" % k]) for k in (1, 2, 3, 4, 5)]
            except (KeyError, TypeError, ValueError):
                continue
            if len(c) < 3 or min(c) <= 0:
                continue
            rows.append({"id": r.get("student_id", "?"),
                         "digit": r.get("digit", "?"),
                         "level": r.get("level_m", ""),
                         "c": c})
    return rows


L_EFF = 65.0        # m — the moving column: 47 m of penstock plus the shaft's
                    # own water referred to the pipe. Using the bare 47 m
                    # understates k by ~28%; see the theory note in README.md.
AREA_RATIO = 3.0    # A / A_s — 21 cells of bore to 7 of shaft, at Medium.


def fit(xs, ys):
    """Least-squares slope and R² of ys against xs."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    a = my - b * mx
    ss = sum((y - my) ** 2 for y in ys)
    rr = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return b, 1.0 - rr / ss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read_rows(a.csv)
    if not rows:
        sys.exit("no usable rows in %s" % a.csv)
    rows.sort(key=lambda d: str(d["digit"]))

    print("  d  level   crests (m)                    slope 1/c   R2       Y (m)   k")
    for d in rows:
        ns = list(range(1, len(d["c"]) + 1))
        d["slope"], d["r2"] = fit(ns, [1.0 / v for v in d["c"]])
        d["Y"] = 4.0 / (3.0 * d["slope"])            # crest step is 4/(3Y)
        d["k"] = L_EFF * AREA_RATIO / (2 * 9.81 * d["Y"])
        print("  %-2s %5s   %-28s  %.3f       %.4f   %.2f    %.3f"
              % (d["digit"], d["level"], " ".join("%.2f" % v for v in d["c"]),
                 d["slope"], d["r2"], d["Y"], d["k"]))
    n = len(rows)
    ks = [d["k"] for d in rows]
    mk = sum(ks) / n
    print("\n  R2 of 1/c against n : %.4f mean, %.4f worst"
          % (sum(d["r2"] for d in rows) / n, min(d["r2"] for d in rows)))
    print("  k = L(A/A_s)/(2gY)  : %.2f .. %.2f, mean %.2f s^2/m  (+/- %.0f%%)"
          % (min(ks), max(ks), mk, 100 * max(abs(x - mk) for x in ks) / mk))
    print("  k is the rig's — a flat spread across the ladder is the result.")

    fig, ax = plt.subplots(figsize=(6.4, 4.6))
    for d in rows:
        ax.plot(range(1, len(d["c"]) + 1), [1.0 / v for v in d["c"]],
                "o-", ms=5, lw=1, alpha=0.8, label="d=%s" % d["digit"])
    ax.set_xlabel("crest number $n$")
    ax.set_ylabel(r"$1/c_n$  (m$^{-1}$)")
    ax.set_xticks(list(range(1, max(len(d["c"]) for d in rows) + 1)))
    ax.grid(alpha=0.3)
    ax.set_title(r"$\Delta c \propto c^2$ per cycle $\Rightarrow$ $1/c$ in equal steps")
    fig.suptitle("UN-3 — surge crest decay, %d students" % n)
    fig.tight_layout()
    out = a.out if os.path.isabs(a.out) else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=140)
    print("  wrote %s" % out)


if __name__ == "__main__":
    main()
