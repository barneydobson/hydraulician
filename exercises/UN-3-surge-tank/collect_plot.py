#!/usr/bin/env python3
"""UN-3 pooling — one k per student, and it should be the same k.

    python3 collect_plot.py class.csv                 -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv   the shipped dry-run class

One row per student: student_id,digit,level_m,T_s,L_m,k_s2m. The digit sets
the reservoir level and so the amplitude; k belongs to the rig, so the plot
of k against digit should come out flat. An outlier is almost always a
misread period — its L column gives it away.
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
                rows.append({"id": r.get("student_id", "?"),
                             "digit": int(r["digit"]),
                             "level": float(r.get("level_m") or "nan"),
                             "T": float(r.get("T_s") or "nan"),
                             "L": float(r.get("L_m") or "nan"),
                             "k": float(r["k_s2m"])})
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read_rows(a.csv)
    if not rows:
        sys.exit("no usable rows in %s" % a.csv)
    rows.sort(key=lambda d: d["digit"])

    print("  d  level    T(s)   L(m)     k")
    for d in rows:
        print("  %d  %5.1f   %5.2f   %4.0f   %5.2f"
              % (d["digit"], d["level"], d["T"], d["L"], d["k"]))
    ks = [d["k"] for d in rows]
    mk = sum(ks) / len(ks)
    print("\n  k: %.2f .. %.2f, mean %.2f  (+/- %.0f%%) — the rig's, not the digit's"
          % (min(ks), max(ks), mk, 100 * max(abs(v - mk) for v in ks) / mk))

    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    ax.scatter([d["digit"] for d in rows], ks, s=64, zorder=3)
    ax.axhline(mk, color="k", lw=1, ls="--", label="class mean k = %.2f" % mk)
    ax.set_xlabel("digit d (reservoir level 10.0 + 0.4·d m)")
    ax.set_ylabel(r"k  (s$^2$/m)")
    ax.set_xticks(list(range(0, 10)))
    ax.set_ylim(0, max(ks) * 1.3)
    ax.grid(alpha=0.3)
    ax.legend()
    ax.set_title("UN-3 — the class measures the rig's k, %d students" % len(rows))
    fig.tight_layout()
    out = a.out if os.path.isabs(a.out) else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=140)
    print("  wrote %s" % out)


if __name__ == "__main__":
    main()
