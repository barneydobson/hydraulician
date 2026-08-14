#!/usr/bin/env python3
"""HP-1 — pool a class CSV into the P–Q curve, fit k, mark the peak, and
annotate h_f/H at every point.

    python3 collect_plot.py class.csv [-o plots/pooled-demo.png]

CSV columns (Blackboard export, one row per submission):

    student_id,digit,gap_m,q,v

    gap_m  the student's nozzle gap, metres
    q      unit discharge in the penstock, m2/s   (hover readout, mid-pipe)
    v      jet velocity, m/s                      (hover readout "u" in the
                                                   jet core at x = 57 m)

Everything else is instructor arithmetic and lives here:

    h_f = H - v^2/2g          H = 21.35 m, the MEASURED static head from the
                              reservoir surface to the pipe axis (the delivered
                              level, ~0.15 m below the 25.0 m slider)
    P   = 0.5 * rho * q * v^2 [W per metre of pipe width]  ==  rho*g*q*(H - h_f)

The fit is h_f = k q^2 through the origin (least squares), which turns the
measured points into the textbook curve P = rho*g*q*(H - k q^2).  Its maximum
is at q* = sqrt(H/3k), and there h_f/H = 1/3 exactly.
"""
import csv, sys, argparse
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

G = 9.81
RHO = 1000.0
H_STATIC = 21.35          # measured; see README section 1


def read(path):
    rows = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                rows.append(dict(sid=r.get("student_id", "?"),
                                 gap=float(r["gap_m"]),
                                 q=float(r["q"]),
                                 v=float(r["v"])))
            except (TypeError, ValueError, KeyError):
                continue
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="plots/pooled-demo.png")
    ap.add_argument("-H", "--head", type=float, default=H_STATIC)
    a = ap.parse_args()

    rows = read(a.csv)
    if not rows:
        sys.exit("no usable rows in " + a.csv)
    H = a.head

    q = np.array([r["q"] for r in rows])
    v = np.array([r["v"] for r in rows])
    gap = np.array([r["gap"] for r in rows])
    hf = H - v * v / (2 * G)
    P = 0.5 * RHO * q * v * v / 1e6            # MW per metre of width

    # h_f = k q^2 through the origin
    k = float((q ** 2 * hf).sum() / (q ** 4).sum())
    ss = float(((hf - k * q ** 2) ** 2).sum())
    sst = float(((hf - hf.mean()) ** 2).sum())
    r2 = 1 - ss / sst if sst > 0 else float("nan")
    qstar = (H / (3 * k)) ** 0.5
    Pstar = RHO * G * qstar * (H - k * qstar ** 2) / 1e6

    order = np.argsort(q)
    ipk = int(np.argmax(P))

    print("%d submissions from %s   (H = %.2f m)" % (len(rows), a.csv, H))
    print("  fitted  h_f = %.4f q^2      R2 = %.4f" % (k, r2))
    print("  theory  q* = sqrt(H/3k) = %.2f m2/s   P* = %.3f MW/m" % (qstar, Pstar))
    print("  measured peak: gap %.2f m, q = %.2f, P = %.3f MW/m, h_f/H = %.3f"
          % (gap[ipk], q[ipk], P[ipk], hf[ipk] / H))
    print()
    print("  gap    q      v      h_f     h_f/H    P MW/m")
    for i in order:
        print("  %4.2f  %5.2f  %5.2f  %6.2f   %5.3f   %6.3f"
              % (gap[i], q[i], v[i], hf[i], hf[i] / H, P[i]))

    # ---------------------------------------------------------------- plot
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(8.4, 8.6), sharex=True,
                                 gridspec_kw=dict(height_ratios=[2.1, 1]))

    qq = np.linspace(0.05, max(q.max() * 1.12, qstar * 1.25), 300)
    ax.plot(qq, RHO * G * qq * (H - k * qq ** 2) / 1e6, "-", color="#3f6fb5",
            lw=1.8, label=r"$P=\rho g q(H-kq^2)$,  $k$=%.4f fitted" % k)
    ax.plot(qq, RHO * G * qq * H / 1e6, ":", color="#9aa5b1", lw=1.2,
            label=r"frictionless $\rho g q H$")
    ax.scatter(q, P, s=64, zorder=5, color="#e2703a", edgecolor="#5a2a12",
               linewidth=0.7, label="class submissions")

    # rung means — the class's own rise / peak / fall, free of reading scatter
    rungs = sorted(set(np.round(gap, 2)))
    mq = np.array([q[np.round(gap, 2) == g].mean() for g in rungs])
    mP = np.array([P[np.round(gap, 2) == g].mean() for g in rungs])
    mh = np.array([hf[np.round(gap, 2) == g].mean() for g in rungs])
    ax.plot(mq, mP, "D", color="#3a3f47", ms=8, zorder=6,
            markerfacecolor="#f2c14e", label="mean of each nozzle rung")
    for g, x_, y_ in zip(rungs, mq, mP):
        ax.annotate("%.2f m" % g, (x_, y_), textcoords="offset points",
                    xytext=(11, -4), ha="left", fontsize=8, color="#3a3f47")
    bx.plot(mq, mh / H, "D", color="#3a3f47", ms=7, zorder=6,
            markerfacecolor="#f2c14e")
    ax.axvline(qstar, color="#2f8f5b", ls="--", lw=1.3)
    ax.plot([qstar], [Pstar], "*", ms=17, color="#2f8f5b", zorder=6,
            label=r"fitted optimum  $q^*=\sqrt{H/3k}$")
    ax.annotate(r"$h_f/H=\frac{1}{3}$ here", xy=(qstar, Pstar),
                xytext=(qstar * 0.40, Pstar * 1.02), color="#2f8f5b",
                fontsize=11, arrowprops=dict(arrowstyle="->", color="#2f8f5b"))

    for i in range(len(q)):
        ax.annotate("%.2f" % (hf[i] / H), (q[i], P[i]),
                    textcoords="offset points", xytext=(0, 9), ha="center",
                    fontsize=8, color="#5a2a12")
    ax.set_ylabel("jet power  P = ½ρq v²   [MW per m of width]")
    ax.set_title("HP-1 · Maximum power transmission — pooled class data\n"
                 "labels are $h_f/H$; the maximum sits where a third of the head "
                 "has gone to friction", fontsize=11)
    ax.grid(alpha=0.25)
    ax.legend(loc="lower center", fontsize=9)
    ax.set_ylim(0, max(P.max(), Pstar) * 1.35)

    bx.axhline(1 / 3, color="#2f8f5b", ls="--", lw=1.3)
    bx.text(q.min(), 1 / 3 + 0.012, r"$h_f/H=1/3$", color="#2f8f5b", fontsize=10)
    bx.plot(qq, k * qq ** 2 / H, "-", color="#3f6fb5", lw=1.5)
    bx.scatter(q, hf / H, s=54, color="#e2703a", edgecolor="#5a2a12",
               linewidth=0.7, zorder=5)
    bx.axvline(qstar, color="#2f8f5b", ls="--", lw=1.3)
    bx.set_xlabel("penstock unit discharge  q  [m²/s]")
    bx.set_ylabel(r"$h_f/H$")
    bx.grid(alpha=0.25)
    bx.set_ylim(0, max(0.7, (hf / H).max() * 1.15))

    fig.tight_layout()
    fig.savefig(a.out, dpi=132)
    print("\nwrote " + a.out)


if __name__ == "__main__":
    main()
