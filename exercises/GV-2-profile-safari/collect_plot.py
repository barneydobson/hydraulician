#!/usr/bin/env python3
"""GV-2 · pool a Profile Safari class CSV into the bag-rate / score figure.

    python3 collect_plot.py data/simulated-class.csv [-o plots/pooled-demo.png]

Input columns (extras ignored, order irrelevant, case-insensitive):
    student    name/id                                          [required]
    classes    semicolon- or comma-separated profile classes    [required]
               claimed, e.g. "M1,M2,H2,H3" (quote the field so the embedded
               commas survive CSV parsing — see data/simulated-class.csv)
    score      self-scored total submitted by the student       [required]
    minutes, source   carried through, not needed for the plot

The score is RE-DERIVED here from the claimed class list against the score
card's own point table, rather than trusted from the CSV — so one bad sum
cannot silently reach the plot, and a mismatch is printed as a spot-check
flag (the score card is explicitly designed to be spot-checkable this way;
see README "Anti-copying").

POINTS (measured difficulty, this safari — see README §5/§Appendix):
    M1 M2 H2            1   (first-try in the sandbox, zero retunes)
    M3 S1 S2 S3 H3      2   (needed one retune, or the RIG-B truncation
                              trick to dodge the canonical ponding trap)
    A2                  3   (rare-family: the adverse slope itself is the
                              hurdle, not the specific recipe)
    A3 C1 C2 C3         5   (rare spawns: NOT stably bagged even by the
                              worker who built this pack — see README)

Output: a two-panel figure —
  (top)    per-class bag rate across the submitted class — which classes the
           room found, the rare-spawn tail visible on the right;
  (bottom) histogram of self-scored totals.

No numpy, no pandas -- matplotlib (Agg) only.
"""
import argparse, csv, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

POINTS = {
    "M1": 1, "M2": 1, "H2": 1,
    "M3": 2, "S1": 2, "S2": 2, "S3": 2, "H3": 2,
    "A2": 3,
    "A3": 5, "C1": 5, "C2": 5, "C3": 5,
}
ALL_CLASSES = ["M1", "M2", "M3", "S1", "S2", "S3", "H2", "H3", "A2", "A3", "C1", "C2", "C3"]


def col(row, *names):
    for n in names:
        for k in row:
            if k.strip().lower() == n:
                return row[k]
    return None


def parse_classes(raw):
    if not raw:
        return []
    parts = raw.replace(";", ",").split(",")
    return [p.strip().upper() for p in parts if p.strip()]


def load(path):
    rows = []
    with open(path, newline="") as f:
        for raw in csv.DictReader(f):
            student = col(raw, "student") or "?"
            classes = parse_classes(col(raw, "classes", "classes-claimed", "classes_claimed"))
            unknown = [c for c in classes if c not in POINTS]
            derived = sum(POINTS.get(c, 0) for c in classes)
            submitted_raw = col(raw, "score")
            submitted = float(submitted_raw) if submitted_raw not in (None, "") else derived
            rows.append({
                "student": student, "classes": classes, "unknown": unknown,
                "derived": derived, "submitted": submitted,
                "match": abs(derived - submitted) < 1e-9,
                "minutes": col(raw, "minutes"), "source": col(raw, "source") or "",
            })
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args(argv)

    rows = load(args.csv_path)
    if not rows:
        print("no rows in " + args.csv_path, file=sys.stderr)
        return 1

    n = len(rows)
    mismatches = [r for r in rows if not r["match"]]
    unknown_all = sorted({c for r in rows for c in r["unknown"]})

    bag_count = {c: 0 for c in ALL_CLASSES}
    for r in rows:
        for c in r["classes"]:
            if c in bag_count:
                bag_count[c] += 1
    bag_rate = {c: bag_count[c] / n for c in ALL_CLASSES}

    scores = [r["derived"] for r in rows]
    scores_sorted = sorted(scores)
    mean_score = sum(scores) / n
    median_score = scores_sorted[n // 2] if n % 2 else 0.5 * (scores_sorted[n // 2 - 1] + scores_sorted[n // 2])

    print("GV-2 profile safari — %d submissions" % n)
    print("  score (re-derived)   mean %.1f   median %.1f   range %.0f-%.0f"
          % (mean_score, median_score, min(scores), max(scores)))
    print("  bag rate by class:")
    for c in ALL_CLASSES:
        bar = "#" * bag_count[c]
        print("    %-3s %2d/%d  %s" % (c, bag_count[c], n, bar))
    rare = [c for c in ("A2", "A3", "C1", "C2", "C3") if bag_count[c] > 0]
    print("  rare spawns claimed by anyone: %s" % (", ".join(rare) if rare else "none"))
    if mismatches:
        print("  SCORE MISMATCHES (submitted vs re-derived, spot-check these):")
        for r in mismatches:
            print("    %-14s submitted %.0f  derived %.0f  classes=%s"
                  % (r["student"], r["submitted"], r["derived"], ",".join(r["classes"])))
    if unknown_all:
        print("  unrecognised class labels seen (not scored): %s" % ", ".join(unknown_all))

    fig, (axTop, axBot) = plt.subplots(2, 1, figsize=(9, 7.5))

    colours = ["#4fb3ff" if bag_rate[c] >= 0.5 else ("#ffd98a" if bag_rate[c] > 0 else "#555a63")
               for c in ALL_CLASSES]
    axTop.bar(ALL_CLASSES, [bag_count[c] for c in ALL_CLASSES], color=colours, edgecolor="#1a1e24")
    axTop.set_ylabel("students who bagged it (n=%d)" % n)
    axTop.set_title("GV-2 Profile Safari — which classes the room found")
    axTop.set_ylim(0, n + 0.5)
    axTop.axvspan(7.5, 12.5, color="#ff6a5a", alpha=0.06)
    axTop.text(10.5, n + 0.15, "rare-spawn tail (A2/A3/C-family)", ha="center", va="top",
               fontsize=8, color="#c9553f")
    for i, c in enumerate(ALL_CLASSES):
        axTop.text(i, bag_count[c] + 0.05, "%d pt" % POINTS[c], ha="center", va="bottom", fontsize=7.5)

    axBot.hist(scores, bins=range(0, int(max(scores)) + 3, 2), color="#4fb3ff",
               edgecolor="#1a1e24", align="left")
    axBot.axvline(mean_score, color="#ffd98a", linestyle="--", linewidth=1.5,
                  label="mean %.1f" % mean_score)
    axBot.set_xlabel("self-scored total (re-derived from claimed classes)")
    axBot.set_ylabel("students")
    axBot.set_title("Score distribution")
    axBot.legend()

    fig.tight_layout()
    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    fig.savefig(args.out, dpi=150)
    print("wrote " + args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
