#!/usr/bin/env python3
"""
collect_plot.py -- pool the WV-1 "Dispersion, one period each" class CSV and
plot L against T against the three theory curves:
  - deep-water asymptote   L0 = 1.56 T^2                (W10)
  - shallow-water asymptote  L = T sqrt(g h)             (W11)
  - full linear dispersion   sigma^2 = g k tanh(k h)      (solved per flume h)

Usage:
  python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns are ignored):
  student, digit, scene, flume, h_m, T_s, L_measured_m [, L_theory_tanh_m, err_pct]

`flume` must be "deep" or "shallow" (or `scene` == wavedeep/waveshallow, from
which flume is inferred). `h_m` is the still-water depth actually run; if
missing it defaults to 0.74 m (wavedeep) / 0.35 m (waveshallow).
"""
import csv
import math
import sys
import argparse

G = 9.81
H_DEEP = 0.74
H_SHALLOW = 0.35


def dispersion_L(T, h, g=G):
    """Solve sigma^2 = g k tanh(k h) for k by Newton iteration, return L=2pi/k."""
    w = 2 * math.pi / T
    k = w * w / g  # deep-water guess
    for _ in range(100):
        t = math.tanh(k * h)
        f = g * k * t - w * w
        df = g * t + g * k * h * (1 - t * t)
        step = f / df
        k2 = k - step
        if k2 <= 0:
            k2 = k / 2
        if abs(k2 - k) < 1e-12:
            k = k2
            break
        k = k2
    return 2 * math.pi / k


def L_deep_asymp(T):
    return 1.56 * T * T


def L_shallow_asymp(T, h):
    return T * math.sqrt(G * h)


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                T = float(r["T_s"])
                L = float(r.get("L_measured_m") or r.get("L_m") or "")
            except (KeyError, ValueError, TypeError):
                continue
            flume = (r.get("flume") or "").strip().lower()
            scene = (r.get("scene") or "").strip().lower()
            if not flume:
                flume = "deep" if "deep" in scene else ("shallow" if "shallow" in scene else "")
            h = r.get("h_m")
            try:
                h = float(h)
            except (TypeError, ValueError):
                h = H_DEEP if flume == "deep" else H_SHALLOW
            rows.append({"student": r.get("student", ""), "digit": r.get("digit", ""),
                        "flume": flume, "T": T, "L": L, "h": h,
                        "note": r.get("note", "")})
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

    deep = [r for r in rows if r["flume"] == "deep"]
    shallow = [r for r in rows if r["flume"] == "shallow"]

    # ---- pooled stats
    def stats(rs, label):
        if not rs:
            return
        errs_tanh, errs_asymp = [], []
        for r in rs:
            Lth = dispersion_L(r["T"], r["h"])
            errs_tanh.append(100 * (r["L"] - Lth) / Lth)
            Lasy = L_deep_asymp(r["T"]) if r["flume"] == "deep" else L_shallow_asymp(r["T"], r["h"])
            errs_asymp.append(100 * (r["L"] - Lasy) / Lasy)
        n = len(rs)
        mean_t = sum(errs_tanh) / n
        mean_a = sum(errs_asymp) / n
        Trange = (min(r["T"] for r in rs), max(r["T"] for r in rs))
        print(f"{label}: {n} points  T {Trange[0]:.2f}-{Trange[1]:.2f} s  "
              f"mean err vs full tanh {mean_t:+.1f}%  vs simple asymptote {mean_a:+.1f}%")

    stats(deep, "wavedeep  ")
    stats(shallow, "waveshallow")

    # ---- plot
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (ax, axr) = plt.subplots(2, 1, figsize=(8.5, 7.5), sharex=True,
                                  gridspec_kw={"height_ratios": [3, 1.1], "hspace": 0.08})

    Tsmooth = [0.35 + 0.01 * i for i in range(int((6.3 - 0.35) / 0.01) + 1)]

    # full-tanh curves, each only physically meaningful where h/L keeps the
    # column-of-water assumption reasonable, but drawn over the whole range
    # to show where each flume's own points fall off their own asymptote.
    Ldeep_full = [dispersion_L(T, H_DEEP) for T in Tsmooth]
    Lshallow_full = [dispersion_L(T, H_SHALLOW) for T in Tsmooth]
    Ldeep_asym = [L_deep_asymp(T) for T in Tsmooth]
    Lshallow_asym = [L_shallow_asymp(T, H_SHALLOW) for T in Tsmooth]

    ax.plot(Tsmooth, Ldeep_asym, "--", color="#3b82c4", lw=1.4,
            label=r"deep asymptote $L_0=1.56\,T^2$  (h=0.74 m)")
    ax.plot(Tsmooth, Ldeep_full, "-", color="#1d5a8a", lw=1.8,
            label=r"full tanh, h=0.74 m (wavedeep)")
    ax.plot(Tsmooth, Lshallow_asym, "--", color="#c47a3b", lw=1.4,
            label=r"shallow asymptote $L=T\sqrt{gh}$  (h=0.35 m)")
    ax.plot(Tsmooth, Lshallow_full, "-", color="#8a4a1d", lw=1.8,
            label=r"full tanh, h=0.35 m (waveshallow)")

    if deep:
        ax.scatter([r["T"] for r in deep], [r["L"] for r in deep],
                   marker="o", s=60, color="#1d5a8a", edgecolor="white",
                   zorder=5, label=f"wavedeep class points (n={len(deep)})")
    if shallow:
        main_s = [r for r in shallow if r["digit"] not in (None, "")]
        bonus_s = [r for r in shallow if r["digit"] in (None, "")]
        if main_s:
            ax.scatter([r["T"] for r in main_s], [r["L"] for r in main_s],
                       marker="s", s=60, color="#c47a3b", edgecolor="white",
                       zorder=5, label=f"waveshallow class points (n={len(main_s)})")
        if bonus_s:
            ax.scatter([r["T"] for r in bonus_s], [r["L"] for r in bonus_s],
                       marker="^", s=55, color="#c47a3b", edgecolor="white",
                       alpha=0.55, zorder=4, label=f"waveshallow bonus points (n={len(bonus_s)})")

    ax.set_ylabel("wavelength L (m)")
    ax.set_title("WV-1 -- dispersion relation, class-built\n"
                 r"$\sigma^2 = gk\tanh(kh)$", fontsize=12)
    ax.legend(fontsize=8, loc="upper left")
    ax.grid(alpha=0.25)
    ax.set_ylim(0, max([12] + [r["L"] for r in rows]) * 1.08)

    # ---- residual panel: measured vs the FULL tanh curve at that point's own h
    for r in deep:
        Lth = dispersion_L(r["T"], r["h"])
        axr.scatter(r["T"], 100 * (r["L"] - Lth) / Lth, color="#1d5a8a", s=50,
                   edgecolor="white", zorder=5)
    for r in shallow:
        Lth = dispersion_L(r["T"], r["h"])
        marker = "s" if r["digit"] not in (None, "") else "^"
        axr.scatter(r["T"], 100 * (r["L"] - Lth) / Lth, color="#c47a3b", s=50,
                   marker=marker, edgecolor="white", zorder=5,
                   alpha=1.0 if marker == "s" else 0.55)
    axr.axhline(0, color="#888", lw=1)
    axr.set_ylabel("error vs full tanh (%)")
    axr.set_xlabel("period T (s)")
    axr.grid(alpha=0.25)

    fig.savefig(args.out, dpi=140, bbox_inches="tight")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
