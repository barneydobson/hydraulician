#!/usr/bin/env python3
"""UN-3 pooling — which friction law do the class's surge crests obey?

    python3 collect_plot.py class.csv                 -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv   the shipped dry-run class

One row per student: student_id,digit,level_m,c1_m,c2_m,c3_m,c4_m,c5_m
(level_m and any extra columns are carried but not needed for the test.)

The u²–y equation's crest sequence satisfies 1/c linear in n; a viscous, ∝ u
friction would give log c linear in n instead. Left panel is the first, right
panel the second, one line per student. Straight beats bent, and the printed
R² pair says so per student as well as by eye.
"""
import argparse
import csv
import math
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


def r2(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    ss = sum((y - my) ** 2 for y in ys)
    rr = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return 1.0 - rr / ss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read_rows(a.csv)
    if not rows:
        sys.exit("no usable rows in %s" % a.csv)
    rows.sort(key=lambda d: str(d["digit"]))

    print("  d  level   crests (m)                    R2 1/c   R2 log c   verdict")
    inv_ok = 0
    for d in rows:
        ns = list(range(1, len(d["c"]) + 1))
        d["r_inv"] = r2(ns, [1.0 / v for v in d["c"]])
        d["r_log"] = r2(ns, [math.log(v) for v in d["c"]])
        good = d["r_inv"] > d["r_log"]
        inv_ok += good
        print("  %-2s %5s   %-28s  %.4f   %.4f    %s"
              % (d["digit"], d["level"], " ".join("%.2f" % v for v in d["c"]),
                 d["r_inv"], d["r_log"], "u^2" if good else "u"))
    n = len(rows)
    print("\n  mean R2:  1/c vs n = %.4f   log c vs n = %.4f"
          % (sum(d["r_inv"] for d in rows) / n, sum(d["r_log"] for d in rows) / n))
    print("  %d of %d students read the damping as quadratic" % (inv_ok, n))

    fig, (axI, axL) = plt.subplots(1, 2, figsize=(11, 4.6))
    for d in rows:
        ns = list(range(1, len(d["c"]) + 1))
        axI.plot(ns, [1.0 / v for v in d["c"]], "o-", ms=5, lw=1, alpha=0.8)
        axL.plot(ns, [math.log(v) for v in d["c"]], "o-", ms=5, lw=1, alpha=0.8)
    axI.set_title(r"friction $\propto u^2$:  $1/c$ is straight")
    axI.set_ylabel(r"$1/c_n$  (m$^{-1}$)")
    axL.set_title(r"friction $\propto u$:  $\log c$ would be straight")
    axL.set_ylabel(r"$\log c_n$")
    for ax in (axI, axL):
        ax.set_xlabel("crest number $n$")
        ax.set_xticks(list(range(1, max(len(d["c"]) for d in rows) + 1)))
        ax.grid(alpha=0.3)
    fig.suptitle("UN-3 — surge crest decay, %d students" % n)
    fig.tight_layout()
    out = a.out if os.path.isabs(a.out) else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=140)
    print("  wrote %s" % out)


if __name__ == "__main__":
    main()
