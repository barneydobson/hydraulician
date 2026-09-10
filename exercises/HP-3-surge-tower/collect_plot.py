#!/usr/bin/env python3
"""HP-3 — pool a class CSV into the surge-tower design curve.

    python3 collect_plot.py class.csv                 -> plots/pooled-demo.png
    python3 collect_plot.py data/simulated-class.csv   the shipped dry-run class

CSV columns (Blackboard export, one row per submission):

    student_id,digit,Ds_m,u0_ms,z0_m,rise_m,T_s

    Ds_m     the student's surge shaft width, metres (the Geometry slider)
    u0_ms    bore-mean velocity in the headrace, m/s (hover mid-headrace, V)
    z0_m     steady drawdown of the shaft below the reservoir, m
             (reservoir gauge minus shaft gauge, both on h, before the slam)
    rise_m   first crest above the pre-slam shaft level, m (the d trace:
             d_max - d_0, in whole cells of 0.16 m)
    T_s      period, s — first crest to second crest (optional column)

Everything else is instructor arithmetic and lives here:

    z_max = rise - z0                the crest ABOVE the reservoir level
    k     = z0 / u0^2                the lumped headrace loss coefficient
    frictionless   y = u0 * sqrt(L*Dh / (g*Ds))       T = 2*pi*sqrt(L*Ds / (g*Dh))
    with friction  u^2 = C*exp(z/Z) + (z+Z)/k,  Z = L*Dh/(2*g*k*Ds),
                   C = -(Z/k)*exp(-z0/Z), crest where u = 0 (solved by bisection)

with the rig's measured constants below (L to the shaft centre, per metre of
width so A/A_s = Dh/Ds). The lower panel is the period against the textbook
formula and the same formula with the shaft's own water counted as inertia,
L + h_s*Dh/Ds, which is where most of the class's excess period comes from.
"""
import argparse
import csv
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt   # noqa: E402
import numpy as np                # noqa: E402

G = 9.81
L = 42.35        # reservoir wall (x = 7.65) to the shaft centre (x = 50), m
DH = 3.05        # headrace bore as delivered at Medium (19 cells), m
HS = 9.0         # water standing in the shaft above the soffit, m (24.55 - 15.57)


def read_rows(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                rows.append({"id": r.get("student_id", "?"),
                             "digit": int(r.get("digit") or -1),
                             "Ds": float(r["Ds_m"]), "u0": float(r["u0_ms"]),
                             "z0": float(r["z0_m"]), "rise": float(r["rise_m"]),
                             "T": float(r["T_s"]) if r.get("T_s") not in (None, "") else float("nan")})
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def crest_with_friction(u0, z0, Ds):
    """The rigid-column crest with quadratic friction, metres ABOVE the reservoir."""
    k = z0 / (u0 * u0)
    r = DH / Ds
    Z = L * r / (2 * G * k)
    C = -(Z / k) * math.exp(-z0 / Z)
    f = lambda z: C * math.exp(z / Z) + (z + Z) / k     # noqa: E731  (z positive DOWN)
    a, b = -u0 * math.sqrt(L * r / G) * 1.5, 0.0
    for _ in range(80):
        m = 0.5 * (a + b)
        if f(a) * f(m) <= 0: b = m
        else: a = m
    return -0.5 * (a + b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    a = ap.parse_args()

    rows = read_rows(a.csv)
    if not rows:
        sys.exit("no usable rows in %s" % a.csv)
    rows.sort(key=lambda d: d["Ds"])
    Ds = np.array([r["Ds"] for r in rows]); u0 = np.array([r["u0"] for r in rows])
    z0 = np.array([r["z0"] for r in rows]); rise = np.array([r["rise"] for r in rows])
    T = np.array([r["T"] for r in rows])
    zmax = rise - z0
    k = z0 / u0 ** 2
    u0m, z0m, km = u0.mean(), z0.mean(), k.mean()

    # log-log slope of the crest against the shaft width: -1/2 is the design law
    p = np.polyfit(np.log(Ds), np.log(zmax), 1)
    print("%d submissions from %s" % (len(rows), a.csv))
    print("  class mean u0 = %.2f m/s, z0 = %.2f m, k = z0/u0^2 = %.3f s2/m" % (u0m, z0m, km))
    print("  fitted  z_max ∝ Ds^%.2f   (rigid column says -0.50)" % p[0])
    print()
    print("  d   Ds    u0     z0    rise   z_max  frictionless  w/ friction   T meas  T 2pi..  T +shaft")
    for r, zm in zip(rows, zmax):
        zf = r["u0"] * math.sqrt(L * DH / (G * r["Ds"]))
        zk = crest_with_friction(r["u0"], r["z0"], r["Ds"])
        Tf = 2 * math.pi * math.sqrt(L * r["Ds"] / (G * DH))
        Ts = 2 * math.pi * math.sqrt((L + HS * DH / r["Ds"]) * r["Ds"] / (G * DH))
        print("  %d  %4.1f  %5.2f  %5.2f  %5.2f  %6.2f  %8.2f      %8.2f     %6.1f  %6.1f   %6.1f"
              % (r["digit"], r["Ds"], r["u0"], r["z0"], r["rise"], zm, zf, zk, r["T"], Tf, Ts))

    # ---------------------------------------------------------------- plot
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(8.0, 8.4), sharex=True,
                                 gridspec_kw=dict(height_ratios=[1.6, 1]))
    dd = np.linspace(max(1.0, Ds.min() * 0.8), Ds.max() * 1.15, 200)
    ax.plot(dd, u0m * np.sqrt(L * DH / (G * dd)), ":", color="#9aa5b1", lw=1.6,
            label=r"frictionless  $u_0\sqrt{L D_h/(g D_s)}$,  class-mean $u_0$")
    ax.plot(dd, [crest_with_friction(u0m, z0m, d) for d in dd], "-", color="#3f6fb5", lw=1.8,
            label=r"rigid column with friction,  class-mean $k=z_0/u_0^2$")
    ax.scatter(Ds, zmax, s=64, zorder=5, color="#e2703a", edgecolor="#5a2a12", lw=0.7,
               label="class submissions  ($z_{max}$ = rise − $z_0$)")
    for r, zm in zip(rows, zmax):
        ax.annotate("d=%d" % r["digit"], (r["Ds"], zm), textcoords="offset points",
                    xytext=(0, 8), ha="center", fontsize=8, color="#5a2a12")
    ax.set_ylabel("first crest above the reservoir  $z_{max}$  [m]")
    ax.set_title("HP-3 · Surge tower: the upsurge against the shaft width\n"
                 r"fitted $z_{max}\propto D_s^{%.2f}$ (theory $-\frac{1}{2}$); the tower must clear the curve" % p[0],
                 fontsize=11)
    ax.grid(alpha=0.25)
    ax.legend(loc="upper right", fontsize=9)
    ax.set_ylim(0, max(zmax.max(), (u0m * np.sqrt(L * DH / (G * dd))).max()) * 1.2)

    bx.plot(dd, 2 * np.pi * np.sqrt(L * dd / (G * DH)), ":", color="#9aa5b1", lw=1.6,
            label=r"$2\pi\sqrt{L D_s/(g D_h)}$")
    bx.plot(dd, 2 * np.pi * np.sqrt((L + HS * DH / dd) * dd / (G * DH)), "-", color="#3f6fb5", lw=1.6,
            label=r"same, with the shaft's own water: $L + h_s D_h/D_s$")
    ok = np.isfinite(T)
    bx.scatter(Ds[ok], T[ok], s=54, zorder=5, color="#e2703a", edgecolor="#5a2a12", lw=0.7)
    bx.set_xlabel("surge shaft width  $D_s$  [m]  (per metre of width, $A_s/A = D_s/D_h$)")
    bx.set_ylabel("period  T  [s]")
    bx.grid(alpha=0.25)
    bx.legend(loc="lower right", fontsize=9)
    bx.set_ylim(0, max(np.nanmax(T) if ok.any() else 0, 25) * 1.15)

    fig.tight_layout()
    out = a.out if os.path.isabs(a.out) else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fig.savefig(out, dpi=132)
    print("\nwrote " + out)


if __name__ == "__main__":
    main()
