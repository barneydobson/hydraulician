#!/usr/bin/env python3
"""MO-1 · pool a class CSV into the sluice-gate C_d / thrust figure.

    python3 collect_plot.py data/simulated-class.csv [-o plots/pooled-demo.png]

Input columns (extras ignored, order irrelevant, case-insensitive):
    a_m       gate opening, m                                    [required]
    q         class-wide unit discharge, m2/s per m width        [required]
    d0_m      upstream (approach pool) depth, m                  [required]
    d1_m      downstream depth at the vena-contracta station, m  [required]
    a_cells, digit, student, level_m, Fr1, source   carried through, not needed

Everything the class needs (C_d, the CV thrust F_R, and the naive hydrostatic
comparator) is RE-DERIVED here from (a, q, d0, d1) rather than trusted from
the CSV, so a bad upstream number cannot silently survive into the plot:

    V0 = q/d0, V1 = q/d1
    C_d   = q / (a * sqrt(2 g d0))                          orifice rating
    F_R   = rho q (V0-V1) + 0.5 rho g (d0^2 - d1^2)         CV momentum, per m
    naive = 0.5 rho g (d0-a)^2                              "just hydrostatics"
                                                             trap comparator

Output: a two-panel figure —
  (top)    C_d per point against opening a, with the 0.6 constant and the
           pooled mean±sd drawn through it — the cluster IS the payoff;
  (bottom) F_R and the naive hydrostatic guess against a, naive dashed — the
           GAP between them, growing with opening, is the "why not
           hydrostatics" trap the momentum equation answers.

No numpy, no pandas — matplotlib (Agg) only.
"""
import argparse, csv, math, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = 9.81
RHO = 1000.0


def mean(xs):
    return sum(xs) / len(xs)


def sd(xs):
    if len(xs) < 2:
        return float("nan")
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def read(path):
    pts = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            try:
                a = float(row["a_m"])
                q = float(row["q"])
                d0 = float(row["d0_m"])
                d1 = float(row["d1_m"])
            except (KeyError, ValueError):
                continue
            if a <= 0 or q <= 0 or d0 <= a or d1 <= 0:
                continue
            V0, V1 = q / d0, q / d1
            Cd = q / (a * math.sqrt(2 * G * d0))
            FR = RHO * q * (V0 - V1) + 0.5 * RHO * G * (d0 * d0 - d1 * d1)
            naive = 0.5 * RHO * G * (d0 - a) ** 2
            pts.append(dict(a=a, q=q, d0=d0, d1=d1, V0=V0, V1=V1, Cd=Cd, FR=FR,
                             naive=naive, diffPct=100.0 * (FR - naive) / naive,
                             digit=row.get("digit", ""), student=row.get("student", "")))
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    args = ap.parse_args()

    pts = read(args.csv)
    if len(pts) < 3:
        sys.exit("need at least 3 usable rows (columns a_m, q, d0_m, d1_m)")
    pts.sort(key=lambda p: p["a"])

    a_mm = [p["a"] * 1000 for p in pts]
    Cd = [p["Cd"] for p in pts]
    FR = [p["FR"] for p in pts]
    naive = [p["naive"] for p in pts]
    diff = [p["diffPct"] for p in pts]

    # distinct openings only (repeats collapse to the same physical point —
    # openings quantise to whole grid cells, so a 10-digit class typically
    # lands on 4-5 distinct values, several digits apiece)
    uniq_a = sorted(set(round(v, 6) for v in a_mm))
    grp = {u: [p for p in pts if abs(p["a"] * 1000 - u) < 1e-3] for u in uniq_a}

    mCd, sCd = mean(Cd), sd(Cd)
    print("MO-1 pooled sluice-gate CV — %d students, %d distinct openings, "
          "a %.1f-%.1f mm, q = %.3f m2/s (class-wide)"
          % (len(pts), len(uniq_a), min(a_mm), max(a_mm), pts[0]["q"]))
    print("  C_d per point       %.3f - %.3f" % (min(Cd), max(Cd)))
    print("  C_d pooled          %.3f +/- %.3f   (mean +/- sd, n=%d points; "
          "%.3f +/- %.3f over the %d DISTINCT openings)"
          % (mCd, sCd, len(Cd), mean([mean([p["Cd"] for p in grp[u]]) for u in uniq_a]),
             sd([mean([p["Cd"] for p in grp[u]]) for u in uniq_a]), len(uniq_a)))
    print("  C_d vs 0.6          %+.1f%% mean" % (100 * (mCd - 0.6) / 0.6))
    print("  F_R range           %.0f - %.0f N/m" % (min(FR), max(FR)))
    print("  naive range         %.0f - %.0f N/m" % (min(naive), max(naive)))
    print("  F_R vs naive        %+.1f%% to %+.1f%%  (grows with opening — the trap)"
          % (min(diff), max(diff)))

    # ------------------------------------------------------------------ plot
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(8.2, 9.2),
                                 gridspec_kw=dict(height_ratios=[1, 1.15]))
    fig.suptitle("MO-1 · sluice gate — $C_d$ clusters, thrust does not follow hydrostatics",
                 fontsize=12.5)

    # small horizontal jitter so repeated (same-opening) students don't stack
    # exactly on top of each other — visual aid only, not a data change
    jitter = {}
    for p in pts:
        k = round(p["a"] * 1000, 3)
        jitter.setdefault(k, []).append(p)
    xj = []
    for k, group in jitter.items():
        n = len(group)
        for i, p in enumerate(group):
            off = (i - (n - 1) / 2.0) * 1.6
            xj.append(k + off)
    order = sorted(range(len(pts)), key=lambda i: pts[i]["a"])

    # ---- top: C_d vs opening --------------------------------------------
    ax.plot(xj, Cd, "o", ms=9, color="#2f7fd0", zorder=3, label="class $C_d$ per student")
    for x, p in zip(xj, pts):
        if p["digit"] != "":
            ax.annotate(p["digit"], (x, p["Cd"]), textcoords="offset points",
                        xytext=(7, -3), fontsize=8, color="#456")
    xr = [min(a_mm) - 8, max(a_mm) + 8]
    ax.axhline(0.6, color="#444", lw=1.4, ls="--", label="$C_d$ = 0.6 (nobody put this in)")
    ax.axhline(mCd, color="#d1495b", lw=1.2, ls=":",
               label="pooled mean %.3f $\\pm$ %.3f sd" % (mCd, sCd))
    ax.set_xlim(*xr)
    ax.set_ylim(min(0.45, min(Cd) - 0.03), max(0.68, max(Cd) + 0.03))
    ax.set_xlabel("gate opening  a  (mm)")
    ax.set_ylabel("discharge coefficient  $C_d = q / (a\\sqrt{2 g d_0})$")
    ax.grid(True, alpha=0.25)
    ax.legend(loc="lower left", fontsize=9)
    ax.set_title("class-wide q = %.3f m$^2$/s; personalised opening a only" % pts[0]["q"],
                fontsize=10)

    # ---- bottom: F_R and the naive hydrostatic comparator ----------------
    a_u = [u for u in uniq_a]
    FR_u = [mean([p["FR"] for p in grp[u]]) for u in uniq_a]
    naive_u = [mean([p["naive"] for p in grp[u]]) for u in uniq_a]
    bx.plot(xj, FR, "o", ms=9, color="#2f7fd0", zorder=3, label="class $F_R$ per student (CV momentum)")
    bx.plot(a_u, FR_u, "-", color="#2f7fd0", lw=1.6, alpha=0.85, zorder=2)
    bx.plot(xj, naive, "s", ms=6, color="#d1495b", zorder=3, alpha=0.85,
            label=r"naive $\frac{1}{2}\rho g (d_0-a)^2$ per student")
    bx.plot(a_u, naive_u, "--", color="#d1495b", lw=1.8, zorder=2, label="naive trend")
    bx.set_xlim(*xr)
    bx.set_xlabel("gate opening  a  (mm)")
    bx.set_ylabel("thrust per metre width  (N/m)")
    bx.grid(True, alpha=0.25)
    bx.legend(loc="upper right", fontsize=9)
    bx.set_title("gap grows with opening: %.0f%% to %.0f%% — momentum sees the "
                "accelerating jet, hydrostatics does not" % (min(diff), max(diff)),
                fontsize=10)

    fig.tight_layout(rect=(0, 0, 1, 0.97))
    d = os.path.dirname(args.out)
    if d:
        os.makedirs(d, exist_ok=True)
    fig.savefig(args.out, dpi=140)
    print("\nwrote %s" % args.out)


if __name__ == "__main__":
    main()
