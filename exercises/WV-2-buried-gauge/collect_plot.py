#!/usr/bin/env python3
"""
collect_plot.py -- pool the WV-2 "buried wave gauge" class CSV and plot the
bed/surface pressure-amplitude ratio against kh, alongside the idealised
linear-theory curve 1/cosh(kh).

Usage:
  python3 collect_plot.py data/simulated-class.csv -o plots/pooled-demo.png

Expected CSV columns (extra columns ignored):
  student, digit, flume, T_s, ratio_dft
  [, kh, h_m, z_bed_m, z_surf_m, ratio_p2p_naive, ratio_theory_actual,
     ratio_theory_ideal, note]

`flume` must be "wave" or "wavedeep" (h defaults to 0.3528 / 0.7385 m if not
given). If `kh` is missing it is solved from T_s and h via the full
dispersion relation. Rows whose `note` contains "NOISE" are plotted as a
separate, clearly-marked series (see _archive/README-full.md: the wavedeep
bed gauge, read as a raw point probe, is dominated by paddle-generated
turbulence rather than the (tiny) true attenuated signal at every period
tried).
"""
import csv
import math
import sys
import argparse

G = 9.81
H_WAVE = 0.3528
H_DEEP = 0.7385


def solve_k(T, h, g=G):
    w = 2 * math.pi / T
    k = w * w / g
    for _ in range(200):
        t = math.tanh(k * h)
        f = g * k * t - w * w
        df = g * t + g * k * h * (1 - t * t)
        step = f / df
        k2 = k - step
        if k2 <= 0:
            k2 = k / 2
        if abs(k2 - k) < 1e-13:
            k = k2
            break
        k = k2
    return k


def load_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                T = float(r["T_s"])
                ratio = float(r["ratio_dft"])
            except (KeyError, ValueError, TypeError):
                continue
            flume = (r.get("flume") or "").strip().lower()
            h = r.get("h_m")
            try:
                h = float(h)
            except (TypeError, ValueError):
                h = H_DEEP if flume == "wavedeep" else H_WAVE
            kh = r.get("kh")
            try:
                kh = float(kh)
            except (TypeError, ValueError):
                kh = solve_k(T, h) * h
            note = (r.get("note") or "")
            rows.append({
                "student": r.get("student", ""), "digit": r.get("digit", ""),
                "flume": flume, "T": T, "h": h, "kh": kh, "ratio": ratio,
                "noisy": "NOISE" in note.upper(), "note": note,
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

    clean = [r for r in rows if not r["noisy"]]
    noisy = [r for r in rows if r["noisy"]]

    def stats(rs, label):
        if not rs:
            return
        errs = []
        for r in rs:
            ideal = 1 / math.cosh(r["kh"])
            errs.append(100 * (r["ratio"] - ideal) / ideal)
        n = len(rs)
        mean_e = sum(errs) / n
        khr = (min(r["kh"] for r in rs), max(r["kh"] for r in rs))
        print(f"{label}: {n} points  kh {khr[0]:.2f}-{khr[1]:.2f}  "
              f"mean err vs idealised 1/cosh(kh) {mean_e:+.1f}%")

    stats(clean, "clean (wave)     ")
    stats(noisy, "noise-dom (wavedeep)")
    if clean:
        allkh = [r["kh"] for r in rows]
        print(f"combined kh coverage: {min(allkh):.2f} - {max(allkh):.2f}")

    # ---- plot
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 6.2))

    khs = [0.01 * i for i in range(10, 850)]
    curve = [1 / math.cosh(k) for k in khs]
    ax.plot(khs, curve, "-", color="#2a6f97", lw=2.0, zorder=3,
            label=r"idealised linear theory  $1/\cosh(k h)$")

    # shade the "recorder goes blind" zone: ratio below what a student can
    # plausibly resolve against a 2-3 cm noise floor on a ~0.02-0.09 m
    # surface signal, i.e. roughly ratio < 0.05 -> kh > 3.0
    ax.axvspan(3.0, 8.6, color="#888", alpha=0.12, zorder=1)
    ax.text(5.7, 0.55, "recorder goes blind\n(ratio < ~0.05)",
            ha="center", va="center", fontsize=9, color="#555")

    if clean:
        ax.scatter([r["kh"] for r in clean], [r["ratio"] for r in clean],
                   marker="o", s=70, color="#d95f02", edgecolor="white",
                   zorder=5, label=f"wave flume, DFT ratio (n={len(clean)})")
    if noisy:
        ax.scatter([r["kh"] for r in noisy], [r["ratio"] for r in noisy],
                   marker="x", s=90, color="#a11", linewidths=2.2,
                   zorder=5, label=f"wavedeep, raw point-probe (n={len(noisy)}) -- noise-dominated")
        # also show where those points' TRUE theoretical ratio sits, as a
        # faint marker, so the size of the miss is visible on the same axes
        ax.scatter([r["kh"] for r in noisy], [1 / math.cosh(r["kh"]) for r in noisy],
                   marker="+", s=70, color="#a11", alpha=0.5, zorder=4,
                   label="wavedeep, true idealised ratio (for comparison)")

    ax.set_xlabel(r"$kh$  (paddle-frequency wavenumber $\times$ still-water depth)")
    ax.set_ylabel("bed / surface pressure-amplitude ratio")
    ax.set_title("WV-2 -- buried wave gauge: attenuation vs $kh$, class-pooled\n"
                 r"$\sigma^2 = gk\tanh(kh)$,  ratio $\to 1/\cosh(kh)$", fontsize=12)
    ax.set_ylim(-0.1, 2.2)
    ax.set_xlim(0, 8.6)
    ax.legend(fontsize=8.5, loc="upper right")
    ax.grid(alpha=0.25)
    ax.axhline(0, color="#999", lw=0.8)

    fig.savefig(args.out, dpi=140, bbox_inches="tight")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
